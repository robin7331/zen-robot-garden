import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// Vite liefert mit `?url` die fertige Adresse der GLB-Datei zurück.
import stationModelUrl from './husqvarna-ladestation.glb?url';

/**
 * Die Ladestation — der "Bahnhof" des Mähroboters. Jetzt ein fertiges
 * 3D-Modell (Husqvarna-Ladestation) statt der früheren Bauklotz-Form aus
 * Quadern.
 *
 * Die GLB-Datei wird beim Start geladen, ausgerichtet, auf den
 * Diorama-Maßstab skaliert und mit der Unterseite auf den Boden gesetzt.
 *
 * Achsen-Konvention (lokal, wie der Rest des Spiels):
 *   +Z = vorne (die Öffnung — von dort fährt der Roboter herein)
 *   -Z = hinten (Rückwand)
 *   Der Gruppen-Ursprung liegt am Boden (y = 0), mittig.
 *
 */

// — Maße (Meter) ———————————————————————————————————————————————————
export const STATION = {
  /** Ziel-Tiefe (Z) des Modells — darauf wird die GLB-Datei skaliert. */
  targetDepth: 0.8,
  /** Roboter-Mitte (lokal Z), wenn er angedockt steht — kurz vor der Mitte. */
  dockLocalZ: 0.06,
} as const;

// — Ausrichtung —————————————————————————————————————————————————
// Falls die Öffnung in die falsche Richtung zeigt (der Roboter würde
// rückwärts gegen die Rückwand docken), diesen Wert auf Math.PI setzen —
// dann dreht sich das Modell um 180°.
const MODEL_YAW_OFFSET = 0;

/**
 * Lädt das GLB-Modell und gibt die fertig ausgerichtete Ladestation als
 * Gruppe zurück. Asynchron, weil die Datei erst geladen werden muss:
 *   const station = await createChargingStationMesh();
 *   scene.add(station);
 */
export async function createChargingStationMesh(): Promise<THREE.Group> {
  const station = new THREE.Group();
  station.name = 'chargingStation';

  const gltf = await new GLTFLoader().loadAsync(stationModelUrl);
  const model = gltf.scene;

  // — 1. Ausrichten: die längere Boden-Achse soll die Tiefe (Z) sein.
  //   Liegt das Modell quer (X länger als Z), drehen wir es um 90°. —
  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(new THREE.Vector3());
  if (size.x > size.z) {
    model.rotation.y = Math.PI / 2;
  }
  model.rotation.y += MODEL_YAW_OFFSET;
  model.updateMatrixWorld(true);

  // — 2. Gleichmäßig skalieren: die Tiefe (Z) auf den Token-Maßstab bringen.
  //   Gleichmäßig, damit die Proportionen des Modells erhalten bleiben. —
  box = new THREE.Box3().setFromObject(model);
  size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(STATION.targetDepth / size.z);
  model.updateMatrixWorld(true);

  // — 3. Auf den Boden setzen (Unterseite auf y = 0) und horizontal zentrieren.
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  // Jedes Mesh wirft und empfängt Schatten.
  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  station.add(model);

  return station;
}
