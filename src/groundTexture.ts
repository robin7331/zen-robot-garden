import * as THREE from 'three';
import { GROUND } from './tokens';

/**
 * Die Boden-Textur — das erdige, gekörnte Muster unter dem Gras.
 *
 * Die mowGrid-Ebene trug bisher je Feld nur EINE flache Farbe. Im kurz
 * gemähten Gras scheint diese Ebene zwischen den Halmen durch — und wirkte
 * dort leblos glatt. Diese Datei erzeugt EINMAL beim Laden eine gekachelte
 * Textur: ein dunkelgrün-braunes Erd-/Moos-Muster mit Körnung. Der mowGrid-
 * Shader legt sie multiplikativ über die Feldfarbe; sichtbar wird sie vor
 * allem in den frischen Mähspuren ("scheint durch, wo kurz gemäht ist").
 *
 * Die Textur entsteht prozedural aus seed-festem Wert-Rauschen — kein externes
 * Bild, passt zum "erst selbst bauen"-Ansatz des Projekts und sieht bei jedem
 * Laden gleich aus.
 */

/** Mulberry32 — winziger, seed-fester Pseudo-Zufallsgenerator (wie terrain.ts). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mischt linear zwischen a und b. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Begrenzt v auf [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wandelt '#rrggbb' in ein [r, g, b]-Tripel mit Werten 0..1. */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Baut eine Oktave nahtloses Wert-Rauschen: ein `cells` x `cells` großes
 * Gitter aus Zufallswerten 0..1, das sich an den Kanten wiederholt (modulo) —
 * darum ist die erzeugte Textur nahtlos kachelbar. Zwischen den Stützpunkten
 * wird mit Smoothstep weich bilinear interpoliert.
 *
 * Gibt eine Funktion (u, v) -> Wert 0..1 zurück; u, v laufen über 0..1.
 */
function makeNoise(cells: number, rand: () => number): (u: number, v: number) => number {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    // Smoothstep — weiche Übergänge statt eckiger linearer Interpolation.
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const xa = ((x0 % cells) + cells) % cells;
    const xb = (xa + 1) % cells;
    const ya = ((y0 % cells) + cells) % cells;
    const yb = (ya + 1) % cells;
    const v00 = g[xa + ya * cells];
    const v10 = g[xb + ya * cells];
    const v01 = g[xa + yb * cells];
    const v11 = g[xb + yb * cells];
    return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
  };
}

/**
 * Erzeugt die gekachelte Boden-Textur als `CanvasTexture`.
 *
 * Vier Rausch-Ebenen mischen sich:
 *   - große Flecken     -> Mischung Dunkelgrün <-> Erdbraun (der Farbton)
 *   - mittlere Wolken   -> große Helligkeits-Verläufe
 *   - Körnung + feine Körnung -> die sichtbare Struktur (Moos-/Erd-Krümel)
 */
export function makeGroundTexture(): THREE.CanvasTexture {
  const size = GROUND.textureSize;
  const rand = mulberry32(GROUND.seed);
  const green = hexToRgb(GROUND.earthGreen);
  const brown = hexToRgb(GROUND.earthBrown);

  const blotch = makeNoise(4, rand); // große Grün/Braun-Flecken
  const cloud = makeNoise(10, rand); // mittlere Helligkeits-Wolken
  const grain = makeNoise(48, rand); // Körnung
  const grainFine = makeNoise(150, rand); // feine Körnung

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Farbton: große Flecken mischen Grün <-> Braun (gespreizt, damit es
      // klare grüne und klare braune Zonen gibt statt nur Matsch dazwischen).
      const t = clamp(blotch(u, v) * 1.4 - 0.2, 0, 1);
      const r = lerp(green[0], brown[0], t);
      const g = lerp(green[1], brown[1], t);
      const b = lerp(green[2], brown[2], t);
      // Helligkeit: Wolken + zwei Körnungs-Ebenen, um 0.82 herum streuend.
      const bright = clamp(
        0.82 +
          0.55 * (cloud(u, v) - 0.5) +
          0.42 * (grain(u, v) - 0.5) +
          0.24 * (grainFine(u, v) - 0.5),
        0.16,
        1.2,
      );
      const i = (x + y * size) * 4;
      d[i] = clamp(r * bright, 0, 1) * 255;
      d[i + 1] = clamp(g * bright, 0, 1) * 255;
      d[i + 2] = clamp(b * bright, 0, 1) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  // Über den Rasen gekachelt; der mowGrid-Shader skaliert die UV passend.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 16; // scharf auch im flachen Diorama-Blickwinkel
  texture.needsUpdate = true;
  return texture;
}
