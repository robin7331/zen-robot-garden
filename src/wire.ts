import * as THREE from 'three';
import { COLORS, SIZES, LEITDRAHT_NAILS } from './tokens';
import { insidePolygon, type Nail, type Polyline } from './polyline';

/**
 * Die Drähte im Rasen — beide auf demselben Nagel-Polylinien-Primitiv
 * (siehe polyline.ts): geordnete Nägel, dazwischen läuft der Draht gerade.
 *
 * == Begrenzungsdraht ("fence wire") ==
 *
 * Die Grenze des Mäh-Bereichs. Wie bei einem echten Mähroboter liegt ein
 * dünner Draht als geschlossene Schleife im Rasen, ein Stück (wireInset) von
 * der Kante nach innen. Der Roboter hat zwei Spulen-Sensoren (vorne/hinten),
 * die "spüren", ob die Spule INNERHALB der Schleife ist oder schon draußen.
 *
 * Hier ist die Schleife ein geschlossenes 4-Nagel-Polygon in Rechteck-Form.
 * `insideWire` ist ein Punkt-in-Polygon-Test — für dieses Rechteck exakt
 * dasselbe Ergebnis wie früher der einfache |x|/|z|-Vergleich.
 *
 * == Leitdraht (Heimweg) ==
 *
 * Eine OFFENE Polylinie, quer durch den ganzen Garten gespannt. Ein Ende
 * steckt im Dock der Ladestation, das andere ist als echte Y-Verzweigung an
 * den Begrenzungsdraht angeschlossen. Ist der Akku niedrig, sucht der
 * Roboter diesen Draht und folgt ihm heim. Die Nägel stehen in tokens.ts.
 *
 * Beide Drähte sind als dünne Linien sichtbar; die Nägel als kleine Punkte —
 * ein Vorgriff auf das spätere nutzerdefinierte Verlegen mit Nägeln.
 */

/** Halbe Kantenlängen des Begrenzungsdraht-Rechtecks (von der Mitte aus). */
const HALF_W = SIZES.lawnWidth / 2 - SIZES.wireInset;
const HALF_D = SIZES.lawnDepth / 2 - SIZES.wireInset;

/** Der Begrenzungsdraht: geschlossene 4-Nagel-Schleife in Rechteck-Form. */
export const BOUNDARY: Polyline = {
  closed: true,
  nails: [
    { x: HALF_W, z: HALF_D },
    { x: -HALF_W, z: HALF_D },
    { x: -HALF_W, z: -HALF_D },
    { x: HALF_W, z: -HALF_D },
  ],
};

/** Der Leitdraht: offene Polylinie vom Dock zur Y-Verzweigung. */
export const LEITDRAHT: Polyline = {
  closed: false,
  nails: LEITDRAHT_NAILS.map((n) => ({ x: n.x, z: n.z })),
};

/**
 * Liegt der Punkt (x, z) innerhalb der Begrenzungsdraht-Schleife?
 * Genau diese Prüfung machen die beiden Spulen-Sensoren des Roboters.
 */
export function insideWire(x: number, z: number): boolean {
  return insidePolygon(BOUNDARY, x, z);
}

// — Sichtbare Drähte ——————————————————————————————————————————————————

/** Höhe der Draht-Linien knapp über dem Rasen (y = 0) — kein Z-Fighting. */
const WIRE_Y = 0.012;

const wireMaterial = new THREE.LineBasicMaterial({
  color: new THREE.Color(COLORS.wire),
});

// Nägel: kleine, kantige Punkte in derselben Draht-Farbe.
const nailGeometry = new THREE.OctahedronGeometry(0.035, 0);
const nailMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(COLORS.wire),
  flatShading: true,
  roughness: 0.8,
  metalness: 0,
});

/** Zeichnet eine Polylinie als dünne Linie nach (Schleife oder offen). */
function createPolylineMesh(poly: Polyline): THREE.Object3D {
  const points = poly.nails.map((n) => new THREE.Vector3(n.x, WIRE_Y, n.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return poly.closed
    ? new THREE.LineLoop(geometry, wireMaterial)
    : new THREE.Line(geometry, wireMaterial);
}

/** Ein kleiner Punkt an der Stelle eines Nagels. */
function createNailDot(nail: Nail): THREE.Mesh {
  const dot = new THREE.Mesh(nailGeometry, nailMaterial);
  dot.position.set(nail.x, WIRE_Y, nail.z);
  dot.castShadow = true;
  return dot;
}

/**
 * Beide sichtbaren Drähte plus ihre Nägel als eine Gruppe. Bewusst
 * unaufdringlich — aber sichtbar, damit man versteht, warum der Roboter dort
 * umkehrt bzw. wohin er heimfährt.
 */
export function createWireMeshes(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wires';
  group.add(createPolylineMesh(BOUNDARY));
  group.add(createPolylineMesh(LEITDRAHT));
  for (const nail of [...BOUNDARY.nails, ...LEITDRAHT.nails]) {
    group.add(createNailDot(nail));
  }
  return group;
}
