import * as THREE from 'three';
import { COLORS, SIZES } from '../tokens';

/**
 * Der Mähroboter — aus einfachen Grundformen zusammengebaut (Bauklotz-/LEGO-Look),
 * flat-shaded und low-poly wie der Rest des Dioramas. Noch kein fertiges 3D-Modell:
 * Quader für den Körper, Zylinder für Räder und Klinge, eine Kugel als Stützrad.
 *
 * Maße und Farben kommen aus DESIGN.md über tokens.ts.
 *
 * Achsen-Konvention:
 *   +Z = vorne (Fahrtrichtung)   -Z = hinten
 *   +X = rechts                  -X = links
 *    Y = oben
 * Der Gruppen-Ursprung liegt am Boden (y = 0), mittig zwischen den Rädern — so
 * lässt sich der Roboter direkt auf den Rasen (Oberseite y = 0) setzen.
 *
 * Benannte Teile für spätere Animation (Physik kommt später):
 *   'wheelLeft', 'wheelRight' — drehen sich beim Fahren um ihre X-Achse
 *   'blade'                   — Mähklingen-Scheibe, dreht sich um Y
 */

// — Maße des Roboters (Meter) ———————————————————————————————————
const GROUND_GAP = 0.045; // Spalt zwischen Körper-Unterseite und Boden
const BODY_MAIN_H = 0.135; // Höhe des Haupt-Körpers
const BODY_CAP_H = SIZES.robotHeight - GROUND_GAP - BODY_MAIN_H; // Deckel oben
const BODY_CAP_INSET = 0.09; // wie viel schmaler der Deckel je Seite ist

const WHEEL_RADIUS = SIZES.wheelDiameter / 2;
const WHEEL_THICKNESS = 0.06;

/**
 * Flat-shaded, satt-mattes Material — der Origami-/Papier-Look des Dioramas.
 * Ein Material je Farbe, von allen Teilen geteilt.
 */
function flatMat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    flatShading: true,
    roughness: 0.85,
    metalness: 0,
  });
}

const bodyMat = flatMat(COLORS.robotBody);
const darkMat = flatMat(COLORS.robotDark);

/**
 * Baut den kompletten Roboter und gibt ihn als Gruppe zurück.
 * In die Szene mit `scene.add(createRobot())`.
 */
export function createRobot(): THREE.Group {
  const robot = new THREE.Group();
  robot.name = 'robot';

  // — Körper: zwei gestapelte Quader. Der schmalere Deckel gibt eine leicht
  //   treppig-gerundete Silhouette — freundlicher als die flache "Puck"-Form. —
  const bodyMain = new THREE.Mesh(
    new THREE.BoxGeometry(SIZES.robotWidth, BODY_MAIN_H, SIZES.robotLength),
    bodyMat,
  );
  bodyMain.position.y = GROUND_GAP + BODY_MAIN_H / 2;

  const bodyCap = new THREE.Mesh(
    new THREE.BoxGeometry(
      SIZES.robotWidth - BODY_CAP_INSET * 2,
      BODY_CAP_H,
      SIZES.robotLength - BODY_CAP_INSET * 2,
    ),
    bodyMat,
  );
  bodyCap.position.y = GROUND_GAP + BODY_MAIN_H + BODY_CAP_H / 2;

  // — Sensor / "Gesicht" vorne: dunkle Leiste an der Front. Macht sofort
  //   sichtbar, wohin der Roboter schaut. —
  const sensor = new THREE.Mesh(
    new THREE.BoxGeometry(SIZES.robotWidth * 0.62, 0.055, 0.05),
    darkMat,
  );
  sensor.position.set(0, GROUND_GAP + BODY_MAIN_H * 0.62, SIZES.robotLength / 2);

  // — Antriebsräder links/rechts, leicht hinter der Mitte —————————————
  const wheelX = SIZES.robotWidth / 2 + WHEEL_THICKNESS / 2 - 0.015;
  const wheelLeft = makeWheel();
  wheelLeft.name = 'wheelLeft';
  wheelLeft.position.set(-wheelX, WHEEL_RADIUS, -0.06);

  const wheelRight = makeWheel();
  wheelRight.name = 'wheelRight';
  wheelRight.position.set(wheelX, WHEEL_RADIUS, -0.06);

  // — Stützrad / Gleiter vorne (kleine, kantige Kugel) ————————————————
  const caster = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), darkMat);
  caster.position.set(0, 0.045, SIZES.robotLength / 2 - 0.07);

  // — Mähklingen-Scheibe im Spalt unter dem Körper, von schräg oben sichtbar —
  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.012, 20),
    darkMat,
  );
  blade.name = 'blade';
  blade.position.set(0, GROUND_GAP / 2, 0.03);

  robot.add(bodyMain, bodyCap, sensor, wheelLeft, wheelRight, caster, blade);

  // Jedes Mesh wirft und empfängt Schatten.
  robot.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return robot;
}

/**
 * Ein Antriebsrad als eigene Gruppe. Der Reifen-Zylinder ist so gedreht, dass
 * seine Achse entlang X liegt; das orange Naben-Kreuz auf beiden Außenseiten
 * macht die Drehung sichtbar. Drehen lässt sich das Rad später über die
 * X-Rotation der Gruppe: `wheel.rotation.x += ...`.
 */
function makeWheel(): THREE.Group {
  const wheel = new THREE.Group();

  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_THICKNESS, 16),
    darkMat,
  );
  tire.rotation.z = Math.PI / 2; // Zylinder-Achse von Y nach X drehen
  wheel.add(tire);

  // Orange Nabe + Speichen-Kreuz auf beiden Reifen-Außenseiten.
  const spokeLen = WHEEL_RADIUS * 1.5;
  for (const side of [-1, 1] as const) {
    const faceX = side * (WHEEL_THICKNESS / 2 + 0.002);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(WHEEL_RADIUS * 0.32, WHEEL_RADIUS * 0.32, 0.01, 12),
      bodyMat,
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.x = faceX;

    const spokeV = new THREE.Mesh(
      new THREE.BoxGeometry(0.009, spokeLen, 0.018),
      bodyMat,
    );
    spokeV.position.x = faceX;

    const spokeH = new THREE.Mesh(
      new THREE.BoxGeometry(0.009, 0.018, spokeLen),
      bodyMat,
    );
    spokeH.position.x = faceX;

    wheel.add(hub, spokeV, spokeH);
  }

  return wheel;
}
