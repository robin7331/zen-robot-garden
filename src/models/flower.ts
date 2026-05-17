import * as THREE from 'three';
import { COLORS } from '../tokens';

/**
 * Das Gänseblümchen-Modell — aus einfachen Grundformen (Zylinder, Kugeln,
 * kleine Quader) zusammengesetzt. Low-poly und flat-shaded wie der Rest des
 * Dioramas.
 *
 * Eine Blume hat ZWEI Stufen, die als Kind-Objekte fertig im selben `group`
 * stecken; die Verwaltung (flowers.ts) blendet je nach Lebensphase nur eine
 * davon ein:
 *
 *   - `seedling` — ein kleiner grüner Trieb.
 *   - `bloom`    — die fertige Blüte.
 *
 * Lokale Achse: Der `group`-Ursprung sitzt am Boden (y = 0), die Blume wächst
 * nach +Y. So lässt sie sich um ihren Fuß kippen (Wind, Einschrumpfen).
 */

/** Die fertig gebaute Blume samt ihrer Stufen-Meshes. */
export interface FlowerMeshes {
  /** Pivot am Boden (y = 0) — kommt in die Szene, wird gekippt (Wind). */
  group: THREE.Group;
  /** Keimling-Trieb. */
  seedling: THREE.Object3D;
  /** Fertige Blüte. */
  bloom: THREE.Object3D;
}

/** Ein flat-shaded Standard-Material in der gewünschten Farbe. */
function mat(hex: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    flatShading: true,
    roughness: 1,
    metalness: 0,
  });
}

// Materialien — einmal gebaut, von allen Blumen geteilt.
const stemMat = mat(COLORS.flowerStem);
const leafMat = mat(COLORS.flowerLeaf);
const daisyPetalMat = mat(COLORS.daisyPetal);
const daisyCenterMat = mat(COLORS.daisyCenter);

/**
 * Ein dünner, leicht konischer Stängel der Höhe `height`. Sein Fuß sitzt bei
 * y = 0, die Spitze bei y = height.
 */
function makeStem(height: number, radius = 0.004): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius * 0.7, radius, height, 5);
  const stem = new THREE.Mesh(geo, stemMat);
  stem.position.y = height / 2;
  stem.castShadow = true;
  return stem;
}

/**
 * Der Keimling: ein paar winzige, schräg vom Boden aufstrebende Blättchen —
 * ein junger Trieb, aus dem die Blüte wird.
 */
function makeSeedling(): THREE.Group {
  const sprout = new THREE.Group();
  const leafGeo = new THREE.ConeGeometry(0.011, 0.05, 4);
  const leafCount = 4;
  for (let k = 0; k < leafCount; k++) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    const a = (k / leafCount) * Math.PI * 2;
    // Vom Boden nach außen-oben aufgefächert.
    leaf.position.set(Math.cos(a) * 0.013, 0.022, Math.sin(a) * 0.013);
    leaf.rotation.set(-Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85);
    leaf.castShadow = true;
    sprout.add(leaf);
  }
  return sprout;
}

/** Baut ein Gänseblümchen: kurzer Stängel + gelbes Körbchen mit weißem Kranz. */
export function createFlower(): FlowerMeshes {
  const group = new THREE.Group();
  group.name = 'daisy';

  const seedling = makeSeedling();

  const stemH = 0.11;
  const bloom = new THREE.Group();
  bloom.add(makeStem(stemH));

  // Blütenkopf am Stängel-Ende: gelbe Mitte + Kranz weißer Blütenblätter.
  const head = new THREE.Group();
  head.position.y = stemH;
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.013, 8, 6),
    daisyCenterMat,
  );
  center.scale.y = 0.6;
  center.castShadow = true;
  head.add(center);

  const petalGeo = new THREE.BoxGeometry(0.013, 0.004, 0.03);
  const petalCount = 9;
  for (let k = 0; k < petalCount; k++) {
    const petal = new THREE.Mesh(petalGeo, daisyPetalMat);
    const a = (k / petalCount) * Math.PI * 2;
    // Flach radial nach außen, die Außenkante leicht angehoben.
    petal.position.set(Math.cos(a) * 0.024, 0.002, Math.sin(a) * 0.024);
    petal.rotation.y = -a;
    petal.rotation.z = 0.18;
    petal.castShadow = true;
    head.add(petal);
  }
  bloom.add(head);

  group.add(seedling, bloom);
  return { group, seedling, bloom };
}
