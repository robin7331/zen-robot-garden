import * as THREE from 'three';
import { COLORS } from '../tokens';

/**
 * Die Ladestation — der "Bahnhof" des Mähroboters. Aus einfachen Quadern
 * zusammengebaut wie der Rest des Dioramas.
 *
 * Aufbau: eine flache Bodenplatte, auf die der Roboter fährt, und eine
 * niedrige Rückwand mit einer dunklen Kontakt-Leiste. Oben sitzt eine kleine
 * Leuchte ('led'), die anzeigt, ob gerade geladen wird.
 *
 * Achsen-Konvention (lokal): Die Öffnung zeigt nach +Z — von dort fährt der
 * Roboter herein. Die Rückwand steht bei -Z. Der Ursprung liegt am Boden.
 */

// — Maße (Meter) ———————————————————————————————————————————————————
export const STATION = {
  plateWidth: 0.56, // Bodenplatte — Breite (X)
  plateLength: 0.66, // Bodenplatte — Länge (Z)
  plateHeight: 0.04, // Bodenplatte — Dicke
  backWallHeight: 0.24, // Rückwand — Höhe
  backWallThickness: 0.09, // Rückwand — Dicke (Z)
  /** Roboter-Mitte (lokal Z), wenn er angedockt steht — kurz vor der Rückwand. */
  dockLocalZ: 0.06,
} as const;

/** Flach schattiertes, mattes Material — der Origami-Look des Dioramas. */
function flatMat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    flatShading: true,
    roughness: 0.9,
    metalness: 0,
  });
}

const caseMat = flatMat(COLORS.station);
const darkMat = flatMat(COLORS.robotDark);

/** Baut die Ladestation und gibt sie als Gruppe zurück. */
export function createChargingStationMesh(): THREE.Group {
  const station = new THREE.Group();
  station.name = 'chargingStation';

  // Bodenplatte — flach, der Roboter fährt darüber.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(
      STATION.plateWidth,
      STATION.plateHeight,
      STATION.plateLength,
    ),
    caseMat,
  );
  plate.position.y = STATION.plateHeight / 2;

  // Rückwand am -Z-Ende.
  const backWallZ =
    -STATION.plateLength / 2 + STATION.backWallThickness / 2;
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(
      STATION.plateWidth,
      STATION.backWallHeight,
      STATION.backWallThickness,
    ),
    caseMat,
  );
  backWall.position.set(0, STATION.backWallHeight / 2, backWallZ);

  // Dunkle Kontakt-Leiste vorn an der Rückwand.
  const contact = new THREE.Mesh(
    new THREE.BoxGeometry(STATION.plateWidth * 0.5, 0.07, 0.04),
    darkMat,
  );
  contact.position.set(
    0,
    STATION.backWallHeight * 0.5,
    backWallZ + STATION.backWallThickness / 2,
  );

  // Lade-Leuchte oben auf der Rückwand. Sie leuchtet beim Laden — die Stärke
  // (emissiveIntensity) wird in main.ts pro Bild gesetzt.
  const ledMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(COLORS.chargeLed),
    emissive: new THREE.Color(COLORS.chargeLed),
    emissiveIntensity: 0, // aus, solange nicht geladen wird
    flatShading: true,
    roughness: 0.6,
  });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.05), ledMat);
  led.name = 'led';
  led.position.set(0, STATION.backWallHeight + 0.02, backWallZ);

  station.add(plate, backWall, contact, led);

  station.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return station;
}
