import * as THREE from 'three';
import { SIZES, TERRAIN } from './tokens';

/**
 * Das Gelände — die 3D-Landschaft unter dem Rasen.
 *
 * Der Rasen ist nicht mehr flach: sanft gewellte Hügel und Mulden. Die EINZIGE
 * Wahrheit darüber ist eine editierbare Höhenkarte — ein `Float32Array`-Raster
 * von Höhen. Alles andere (Sicht-Meshes, der Physik-Collider, die Höhen-Textur
 * des Gras-Shaders) fragt diese Karte nur ab; niemand hält eine zweite Kopie.
 *
 *   - `heightAt(x, z)`  — Geländehöhe an einem Welt-Punkt (bilinear).
 *   - `normalAt(x, z)`  — Flächen-Normale dort (für die Rad-Federung).
 *   - `raycastTerrain`  — wo ein Sicht-Strahl das Gelände trifft (Ziehen).
 *
 * Die Start-Hügel entstehen aus **Seed-basiertem Rauschen**, beim Laden einmal
 * in das Array geschrieben. Fester Seed -> der Garten sieht jedes Mal gleich
 * aus. Das Array, nicht das Rauschen, ist die Wahrheit: eine spätere
 * Terraforming-Pinsel-UI ändert nur das Array und baut Collider, Meshes und
 * Textur neu — kein Umbau dieser Schnittstelle nötig.
 *
 * Raster: Stützpunkte alle `TERRAIN.cellSize` (~0,25 m). Bei 8x6 m sind das
 * GX x GZ = 33 x 25 Punkte. Bewusst gröber als das 0,1-m-Mäh-Gitter — das
 * Gelände will große, sanfte Hügel.
 */

// — Raster-Maße ————————————————————————————————————————————————————
/** Stützpunkte entlang X bzw. Z (ein Punkt mehr als Zellen). */
export const GX = Math.round(SIZES.lawnWidth / TERRAIN.cellSize) + 1;
export const GZ = Math.round(SIZES.lawnDepth / TERRAIN.cellSize) + 1;
/** Welt-Koordinate des Raster-Punkts (0, 0) — die -X/-Z-Ecke des Rasens. */
const X0 = -SIZES.lawnWidth / 2;
const Z0 = -SIZES.lawnDepth / 2;

/**
 * Die Höhenkarte: Höhe (m) je Stützpunkt. Index = i + j * GX, mit i entlang X
 * (0..GX-1) und j entlang Z (0..GZ-1). Diese ist die editierbare Wahrheit.
 */
const heights = new Float32Array(GX * GZ);

/** Mulberry32 — ein winziger, seed-fester Pseudo-Zufallsgenerator. */
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

/**
 * Füllt die Höhenkarte mit dem Start-Rauschen: eine Summe weniger, langsamer
 * Sinus-Wellen mit seed-festen Frequenzen und Phasen. Lange Wellenlängen ->
 * sanft gewellte, große Hügel und Mulden (kein zackiges Hochfrequenz-Rauschen).
 *
 * Danach zwei Korrektur-Schritte:
 *   1. Auf die Ziel-Amplitude (`reliefAmplitude`) normieren.
 *   2. Die Steigung auf `maxSlopeDeg` deckeln — übersteigt das steilste
 *      Stützpunkt-Gefälle 20°, wird das ganze Feld heruntergewichtet. So
 *      klettert der Roboter jeden Hang zuverlässig und kippt nie von allein.
 */
function generate(): void {
  const rand = mulberry32(TERRAIN.seed);

  // Fünf Sinus-Komponenten mit Wellenlängen 3,5..9 m — größer als der Garten
  // ist, also höchstens ein paar weiche Hügel über die ganze Fläche.
  const comps: { fx: number; fz: number; px: number; pz: number; amp: number }[] =
    [];
  for (let k = 0; k < 5; k++) {
    comps.push({
      fx: (Math.PI * 2) / lerp(3.5, 9, rand()),
      fz: (Math.PI * 2) / lerp(3.5, 9, rand()),
      px: rand() * Math.PI * 2,
      pz: rand() * Math.PI * 2,
      amp: 1 / (k + 1), // spätere Komponenten tragen weniger bei
    });
  }

  // Rohes Feld auswerten.
  for (let j = 0; j < GZ; j++) {
    const z = Z0 + j * TERRAIN.cellSize;
    for (let i = 0; i < GX; i++) {
      const x = X0 + i * TERRAIN.cellSize;
      let h = 0;
      for (const c of comps) {
        h += c.amp * Math.sin(x * c.fx + c.px) * Math.sin(z * c.fz + c.pz);
      }
      heights[i + j * GX] = h;
    }
  }

  // Mittelwert abziehen (Hügel UND Mulden symmetrisch um y = 0).
  let mean = 0;
  for (let i = 0; i < heights.length; i++) mean += heights[i];
  mean /= heights.length;

  // Auf die Ziel-Amplitude normieren.
  let maxAbs = 0;
  for (let i = 0; i < heights.length; i++) {
    const v = heights[i] - mean;
    heights[i] = v;
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  }
  const ampScale = maxAbs > 1e-6 ? TERRAIN.reliefAmplitude / maxAbs : 0;
  for (let i = 0; i < heights.length; i++) heights[i] *= ampScale;

  // Steigung deckeln: das steilste Gefälle zwischen Nachbar-Stützpunkten
  // suchen; ist es steiler als maxSlopeDeg, das ganze Feld herunterwichten.
  const maxStep = TERRAIN.cellSize * Math.tan((TERRAIN.maxSlopeDeg * Math.PI) / 180);
  let steepest = 0;
  for (let j = 0; j < GZ; j++) {
    for (let i = 0; i < GX; i++) {
      const h = heights[i + j * GX];
      if (i + 1 < GX) {
        const d = Math.abs(heights[i + 1 + j * GX] - h);
        if (d > steepest) steepest = d;
      }
      if (j + 1 < GZ) {
        const d = Math.abs(heights[i + (j + 1) * GX] - h);
        if (d > steepest) steepest = d;
      }
    }
  }
  if (steepest > maxStep) {
    const slopeScale = maxStep / steepest;
    for (let i = 0; i < heights.length; i++) heights[i] *= slopeScale;
  }
}

generate();

/** Begrenzt v auf [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Geländehöhe (m) an einem Welt-Punkt (x, z) — bilinear zwischen den vier
 * umgebenden Stützpunkten interpoliert. Außerhalb des Rasens wird auf den
 * Rand-Stützpunkt geklemmt (das Gelände läuft dort eben aus).
 */
export function heightAt(x: number, z: number): number {
  const fx = clamp((x - X0) / TERRAIN.cellSize, 0, GX - 1);
  const fz = clamp((z - Z0) / TERRAIN.cellSize, 0, GZ - 1);
  const i0 = Math.floor(Math.min(fx, GX - 2));
  const j0 = Math.floor(Math.min(fz, GZ - 2));
  const tx = fx - i0;
  const tz = fz - j0;
  const h00 = heights[i0 + j0 * GX];
  const h10 = heights[i0 + 1 + j0 * GX];
  const h01 = heights[i0 + (j0 + 1) * GX];
  const h11 = heights[i0 + 1 + (j0 + 1) * GX];
  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}

/**
 * Flächen-Normale des Geländes an (x, z) — über zentrale Differenzen von
 * `heightAt`. Die Rad-Federung und die Ladestation richten sich danach aus.
 */
export function normalAt(x: number, z: number): THREE.Vector3 {
  const e = TERRAIN.cellSize * 0.5;
  const dhdx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dhdz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return new THREE.Vector3(-dhdx, 1, -dhdz).normalize();
}

/**
 * Wo trifft ein Strahl das Gelände? Schrittweises Abtasten von `origin` in
 * Richtung `dir` (beide in Weltkoordinaten), bis der Strahl unter die
 * Geländehöhe sinkt, dann eine kurze Verfeinerung. Gibt den Treffer-Punkt
 * zurück oder `null`. Der Zieh-Strahl in main.ts nutzt das.
 */
export function raycastTerrain(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
): THREE.Vector3 | null {
  const step = 0.1;
  const maxDist = 60;
  let prevT = 0;
  let prevAbove = origin.y - heightAt(origin.x, origin.z);
  for (let t = step; t <= maxDist; t += step) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const above = y - heightAt(x, z);
    if (above <= 0 && prevAbove > 0) {
      // Zwischen prevT und t durchstoßen — linear auf den Nulldurchgang.
      const f = prevAbove / (prevAbove - above);
      const tt = lerp(prevT, t, f);
      return new THREE.Vector3(
        origin.x + dir.x * tt,
        origin.y + dir.y * tt,
        origin.z + dir.z * tt,
      );
    }
    prevT = t;
    prevAbove = above;
  }
  return null;
}

// — Höhen-Textur ————————————————————————————————————————————————————

let heightTexture: THREE.DataTexture | null = null;

/**
 * Die Höhen-Textur (`DataTexture`, R-Kanal, Float): dieselben Höhen als Bild,
 * damit der Gras-Shader die Geländehöhe je Halm lesen kann. Ein Pixel je
 * Stützpunkt; UV = ((x-X0)/lawnWidth, (z-Z0)/lawnDepth). Linear gefiltert für
 * weiche Übergänge zwischen den Stützpunkten.
 *
 * Ändert sich erst beim Terraforming — dann `markDirty()` aufrufen.
 */
export function terrainHeightTexture(): THREE.DataTexture {
  if (!heightTexture) {
    heightTexture = new THREE.DataTexture(
      heights,
      GX,
      GZ,
      THREE.RedFormat,
      THREE.FloatType,
    );
    heightTexture.magFilter = THREE.LinearFilter;
    heightTexture.minFilter = THREE.LinearFilter;
    heightTexture.generateMipmaps = false;
    heightTexture.needsUpdate = true;
  }
  return heightTexture;
}

/**
 * Roh-Zugriff auf die Höhenkarte für den Physik-Höhenfeld-Collider. Das Array
 * liegt mit Index `i + j*GX` (i entlang X, j entlang Z) — genau die Spalten-
 * weise Anordnung, die Rapiers Höhenfeld erwartet.
 */
export const terrainData = {
  heights,
  GX,
  GZ,
  width: SIZES.lawnWidth,
  depth: SIZES.lawnDepth,
} as const;
