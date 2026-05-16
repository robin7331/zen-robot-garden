import * as THREE from 'three';

/**
 * Stations-Grundriss ("footprint") — eine pixelgenaue Maske der Fläche, die
 * die Ladestation von SENKRECHT OBEN gesehen verdeckt.
 *
 * Die Idee ist wie ein Foto von ganz oben: Man schaut das Modell von oben an
 * und merkt sich jeden Punkt, an dem es etwas verdeckt. Nur machen wir keinen
 * Render-Umweg — wir rechnen die "Aufnahme" direkt aus der Modell-Geometrie:
 * jedes kleine Dreieck des Modells wird von oben in ein feines Raster (die
 * Maske) gemalt. Das ist pixelgenau und braucht keinen GL-Zustand.
 *
 * Ergebnis: `covers(x, z)` sagt für jeden Welt-Punkt, ob dort die Station
 * etwas verdeckt. So folgt die gras-freie Fläche EXAKT der (gerundeten)
 * Grundplatte des Modells — kein grober Kasten mehr drumherum.
 */

/** Eine achsenparallele Form-Maske über der XZ-Ebene (Welt-Koordinaten). */
export type Footprint = {
  /** Welt-XZ-Grenzen der Maske — knapp um den Grundriss herum. */
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** true, wenn am Welt-Punkt (x, z) die Station etwas verdeckt. */
  covers(x: number, z: number): boolean;
};

export type FootprintOptions = {
  /** Auflösung der längeren Masken-Achse in Pixeln (Standard 256). */
  resolution?: number;
  /** Maske um diesen Welt-Abstand (m) aufdicken — 0 = exakte Silhouette. */
  margin?: number;
};

/**
 * Baut den Grundriss der schon platzierten Station. Einmal beim Aufbau
 * aufrufen, NACHDEM die Station ihre endgültige Position/Drehung hat — die
 * Maske entsteht aus den Welt-Koordinaten der Modell-Geometrie.
 */
export function computeStationFootprint(
  station: THREE.Object3D,
  options: FootprintOptions = {},
): Footprint {
  const resolution = options.resolution ?? 256;
  const margin = options.margin ?? 0;

  station.updateMatrixWorld(true);

  // — Welt-XZ-Grenzen des Modells, mit etwas Rand für die Maske. —
  const box = new THREE.Box3().setFromObject(station);
  const pad = margin + 0.03;
  const minX = box.min.x - pad;
  const maxX = box.max.x + pad;
  const minZ = box.min.z - pad;
  const maxZ = box.max.z + pad;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;

  // Quadratische Pixel: die längere Achse bekommt `resolution` Pixel, die
  // andere maßstabsgetreu weniger.
  const pxPerM = resolution / Math.max(spanX, spanZ);
  const W = Math.max(1, Math.round(spanX * pxPerM));
  const H = Math.max(1, Math.round(spanZ * pxPerM));
  const mask = new Uint8Array(W * H);

  // — Jedes Dreieck jedes Mesh von oben in die Maske rastern. —
  const v = new THREE.Vector3();
  station.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geom = obj.geometry as THREE.BufferGeometry;
    const pos = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const index = geom.getIndex();
    const triCount = index ? index.count / 3 : pos.count / 3;
    // Vertex i -> Welt-XZ in Pixel-Koordinaten der Maske.
    const px = (i: number): [number, number] => {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      return [(v.x - minX) * pxPerM, (v.z - minZ) * pxPerM];
    };
    for (let t = 0; t < triCount; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      rasterTriangle(mask, W, H, px(a), px(b), px(c));
    }
  });

  // Optional die Maske leicht aufdicken (Morphologie-Dilatation).
  if (margin > 0) dilate(mask, W, H, Math.round(margin * pxPerM));

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    covers(x: number, z: number): boolean {
      if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
      const gx = Math.min(W - 1, Math.max(0, Math.floor((x - minX) * pxPerM)));
      const gz = Math.min(H - 1, Math.max(0, Math.floor((z - minZ) * pxPerM)));
      return mask[gx + gz * W] !== 0;
    },
  };
}

/** Doppelte Dreiecksfläche links/rechts der Kante a->b, bezogen auf Punkt c. */
function edge(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
}

/**
 * Füllt alle Masken-Pixel, deren Mittelpunkt im Dreieck (p0, p1, p2) liegt.
 * Klassische baryzentrische Rasterung; das Vorzeichen der Fläche wird
 * herausgekürzt, darum ist die Dreh-Richtung der Vertices egal.
 */
function rasterTriangle(
  mask: Uint8Array,
  W: number,
  H: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
): void {
  const area = edge(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1]);
  if (area === 0) return; // entartetes Dreieck — keine Fläche

  const minx = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
  const maxx = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
  const miny = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
  const maxy = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
  const inv = 1 / area;

  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const w0 = edge(p1[0], p1[1], p2[0], p2[1], cx, cy) * inv;
      const w1 = edge(p2[0], p2[1], p0[0], p0[1], cx, cy) * inv;
      const w2 = edge(p0[0], p0[1], p1[0], p1[1], cx, cy) * inv;
      // Alle drei Gewichte >= 0 -> der Pixel-Mittelpunkt liegt im Dreieck.
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) mask[x + y * W] = 1;
    }
  }
}

/**
 * Dickt die Maske um `r` Pixel auf: jedes Rand-Pixel stempelt einen kleinen
 * Kreis. Nur Rand-Pixel (mit mindestens einem freien 4-Nachbarn) stempeln —
 * das hält die Dilatation billig.
 */
function dilate(mask: Uint8Array, W: number, H: number, r: number): void {
  if (r <= 0) return;
  const src = mask.slice();
  const r2 = r * r;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (src[x + y * W] === 0) continue;
      const onEdge =
        x === 0 ||
        y === 0 ||
        x === W - 1 ||
        y === H - 1 ||
        src[x - 1 + y * W] === 0 ||
        src[x + 1 + y * W] === 0 ||
        src[x + (y - 1) * W] === 0 ||
        src[x + (y + 1) * W] === 0;
      if (!onEdge) continue;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          mask[xx + yy * W] = 1;
        }
      }
    }
  }
}
