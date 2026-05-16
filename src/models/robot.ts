import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLORS, SIZES } from '../tokens';
// Vite liefert mit `?url` die fertige Adresse der GLB-Datei zurück.
import robotModelUrl from './husqvarna-aspire-r6v-meshy.glb?url';

/**
 * Der Mähroboter — jetzt ein fertiges 3D-Modell (Husqvarna Aspire R6V) statt
 * der früheren Bauklotz-Form aus Grundkörpern.
 *
 * Die GLB-Datei wird beim Start geladen, automatisch ausgerichtet, auf den
 * Mähroboter-Maßstab aus den Design-Tokens skaliert und auf den Boden gesetzt.
 *
 * Achsen-Konvention (wie der Rest des Spiels):
 *   +Z = vorne (Fahrtrichtung)   -Z = hinten
 *   +X = rechts                  -X = links
 *    Y = oben
 * Der Gruppen-Ursprung liegt am Boden (y = 0), mittig — so lässt sich der
 * Roboter direkt auf den Rasen setzen.
 *
 * Benannte Teile für die Steuerung (RobotController):
 *   'statusLed' — kleine Leuchte oben: an solange lebendig, aus bei leerem
 *                 Akku ('dead'). Bleibt als Grundform erhalten, weil das
 *                 GLB-Modell sie nicht mitbringt.
 *
 * Hinweis: Die Räder und die Mähklinge sind im GLB-Modell ein einziges Mesh
 * und drehen sich darum nicht mehr einzeln mit (anders als beim alten
 * Bauklotz-Roboter). Der RobotController kommt damit zurecht.
 */

// — Ausrichtung —————————————————————————————————————————————————
// Falls der Roboter rückwärts fährt (Front zeigt nach hinten), diesen Wert
// auf Math.PI setzen — dann dreht sich das Modell um 180°.
const MODEL_YAW_OFFSET = 0;

/**
 * Lädt das GLB-Modell und gibt den fertig ausgerichteten Roboter als Gruppe
 * zurück. Asynchron, weil die Datei erst geladen werden muss:
 *   const robot = await createRobot();
 *   scene.add(robot);
 */
export async function createRobot(): Promise<THREE.Group> {
  const robot = new THREE.Group();
  robot.name = 'robot';

  const gltf = await new GLTFLoader().loadAsync(robotModelUrl);
  const model = gltf.scene;

  // — 1. Ausrichten: die längere Boden-Achse soll die Fahrtrichtung (Z) sein.
  //   Liegt das Modell quer (X länger als Z), drehen wir es um 90°. —
  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(new THREE.Vector3());
  if (size.x > size.z) {
    model.rotation.y = Math.PI / 2;
  }
  model.rotation.y += MODEL_YAW_OFFSET;
  model.updateMatrixWorld(true);

  // — 2. Gleichmäßig skalieren: die Länge (Z) auf den Token-Maßstab bringen.
  //   Gleichmäßig, damit die Proportionen des Modells erhalten bleiben. —
  box = new THREE.Box3().setFromObject(model);
  size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(SIZES.robotLength / size.z);
  model.updateMatrixWorld(true);

  // — 3. Auf den Boden setzen (Unterseite auf y = 0) und horizontal zentrieren.
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const modelTop = box.max.y - box.min.y; // Höhe über dem Boden nach dem Setzen
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

  robot.add(model);

  // — Status-LED oben auf dem Roboter: sanftes Grün, solange er lebt; dunkel
  //   bei leerem Akku ('dead'). Das GLB-Modell hat keine eigene LED, darum
  //   bleibt sie eine kleine Grundform. Die Leucht-Stärke setzt der
  //   RobotController pro Bild. —
  const ledMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(COLORS.chargeLed),
    emissive: new THREE.Color(COLORS.chargeLed),
    emissiveIntensity: 1,
    flatShading: true,
    roughness: 0.6,
    metalness: 0,
  });
  const statusLed = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), ledMat);
  statusLed.name = 'statusLed';
  // Knapp über dem höchsten Punkt des Modells, leicht nach vorne versetzt.
  statusLed.position.set(0, modelTop + 0.015, 0.1);
  statusLed.castShadow = true;
  robot.add(statusLed);

  return robot;
}
