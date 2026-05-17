import * as THREE from 'three';
import { COLORS, SIZES, TERRAIN } from './tokens';
import { heightAt } from './terrain';

/**
 * Der Garten — der Diorama-Block, jetzt mit gewellter Oberseite.
 *
 * Früher drei flache, gestapelte Kisten. Jetzt folgt der ganze Block dem
 * Gelände (siehe terrain.ts):
 *
 *   - **Gras-Decke** — ein unterteiltes, in der Höhe verschobenes Mesh; die
 *     Stützpunkte sitzen auf der Höhenkarte. Flat-shaded -> kantige Low-Poly-
 *     Hügel, passt zum Origami-Look. Schließt bündig mit den Wänden ab.
 *   - **Seitenwände** — vier senkrechte Schnitte. Ihre Oberkante folgt dem
 *     Gelände, der Boden ist flach. Sie zeigen drei Schichten als waagerechte
 *     Bänder: dünnes Gras, dann Erd-Band, dann Fels — ein echter
 *     Geländequerschnitt. Erlaubt Hügel UND Mulden/Gruben.
 *   - **Boden** — eine flache Platte unter allem.
 *
 * Die alte `makeSlab`-Box entfällt: der Block ist kein Quader mehr.
 */

/** Halbe Rasen-Maße (Wände und Gras-Decke schließen an der Rasenkante ab). */
const HW = SIZES.lawnWidth / 2;
const HD = SIZES.lawnDepth / 2;

/**
 * Flacher Boden des Diorama-Blocks. Tief genug, dass er auch unter der
 * tiefsten Mulde liegt — `reliefAmplitude` ist die maximale Auslenkung nach
 * unten vor der Steigungs-Deckelung, also eine sichere Untergrenze.
 */
const BOTTOM_Y =
  -TERRAIN.reliefAmplitude -
  SIZES.grassThickness -
  SIZES.soilThickness -
  SIZES.rockThickness;

export function createGarden(): THREE.Group {
  const garden = new THREE.Group();
  garden.name = 'garden';
  garden.add(makeGrassDeck());
  garden.add(makeWalls());
  garden.add(makeBottom());
  return garden;
}

/**
 * Die Gras-Decke: ein unterteiltes Mesh, dessen Stützpunkte auf die
 * Höhenkarte gehoben werden. Genau Rasen-groß — die Kante schließt bündig mit
 * der Wand-Oberkante ab, kein Überstand.
 */
function makeGrassDeck(): THREE.Mesh {
  const w = SIZES.lawnWidth;
  const d = SIZES.lawnDepth;
  // Unterteilung im Geländeraster — sanfte, aber kantige Low-Poly-Hügel.
  const segX = Math.round(w / TERRAIN.cellSize);
  const segZ = Math.round(d / TERRAIN.cellSize);
  const geometry = new THREE.PlaneGeometry(w, d, segX, segZ);
  geometry.rotateX(-Math.PI / 2); // aus der XY- in die XZ-Ebene kippen

  // Jeden Stützpunkt auf die Geländehöhe heben.
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(COLORS.grass),
    flatShading: true,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'grass';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Die vier Seitenwände als ein Mesh. Jede Wand ist ein senkrechter Streifen,
 * dessen Oberkante dem Gelände folgt; nach unten teilt er sich in drei
 * waagerechte Bänder (Gras / Erde / Fels), eingefärbt über Vertex-Farben.
 */
function makeWalls(): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];

  const grass = new THREE.Color(COLORS.grass);
  const soil = new THREE.Color(COLORS.soil);
  const rock = new THREE.Color(COLORS.rock);

  // Die vier Kanten als Punkt-Listen entlang der Rasenkante abtasten.
  const stepsX = Math.round(SIZES.lawnWidth / TERRAIN.cellSize);
  const stepsZ = Math.round(SIZES.lawnDepth / TERRAIN.cellSize);
  const edges: { x: number; z: number }[][] = [];
  const south: { x: number; z: number }[] = [];
  const north: { x: number; z: number }[] = [];
  for (let i = 0; i <= stepsX; i++) {
    const x = -HW + (i / stepsX) * SIZES.lawnWidth;
    south.push({ x, z: -HD });
    north.push({ x, z: HD });
  }
  const west: { x: number; z: number }[] = [];
  const east: { x: number; z: number }[] = [];
  for (let j = 0; j <= stepsZ; j++) {
    const z = -HD + (j / stepsZ) * SIZES.lawnDepth;
    west.push({ x: -HW, z });
    east.push({ x: HW, z });
  }
  edges.push(south, north, west, east);

  /** Hängt ein farbiges Band-Quad (zwei Dreiecke) an die Puffer. */
  function addQuad(
    ax: number, az: number, ayTop: number, ayBot: number,
    bx: number, bz: number, byTop: number, byBot: number,
    c: THREE.Color,
  ): void {
    // a_top, b_top, b_bot, a_bot — zwei Dreiecke. Wand ist DoubleSide,
    // darum ist die Umlaufrichtung für die Sichtbarkeit egal.
    const v = [
      ax, ayTop, az, bx, byTop, bz, bx, byBot, bz,
      ax, ayTop, az, bx, byBot, bz, ax, ayBot, az,
    ];
    for (let k = 0; k < v.length; k += 3) {
      positions.push(v[k], v[k + 1], v[k + 2]);
      colors.push(c.r, c.g, c.b);
    }
  }

  for (const edge of edges) {
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i];
      const b = edge[i + 1];
      const ha = heightAt(a.x, a.z);
      const hb = heightAt(b.x, b.z);
      // Schicht-Grenzen je Endpunkt: Gras-Band, Erd-Band, Fels bis zum Boden.
      const aG = ha - SIZES.grassThickness;
      const bG = hb - SIZES.grassThickness;
      const aS = aG - SIZES.soilThickness;
      const bS = bG - SIZES.soilThickness;
      addQuad(a.x, a.z, ha, aG, b.x, b.z, hb, bG, grass);
      addQuad(a.x, a.z, aG, aS, b.x, b.z, bG, bS, soil);
      addQuad(a.x, a.z, aS, BOTTOM_Y, b.x, b.z, bS, BOTTOM_Y, rock);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide, // Umlaufrichtung der Streifen-Quads ignorieren
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'gardenWalls';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Die flache Fels-Bodenplatte unter dem ganzen Block. */
function makeBottom(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(SIZES.lawnWidth, SIZES.lawnDepth);
  geometry.rotateX(Math.PI / 2); // nach unten blickend
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(COLORS.rock),
    flatShading: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'gardenBottom';
  mesh.position.y = BOTTOM_Y;
  mesh.receiveShadow = true;
  return mesh;
}
