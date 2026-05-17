import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SIZES } from '../tokens';
// Vite liefert mit `?url` die fertige Adresse der GLB-Datei zurück.
import robotModelUrl from './husqvarna-aspire-r6v-rigged.glb?url';

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
 *   'wheelLeft'/'wheelRight' — die beiden Antriebsräder. Im GLB heißen sie
 *                 'Wheel_L'/'Wheel_R'; weiter unten werden sie nach ihrer
 *                 Welt-X-Lage in links/rechts umbenannt und drehen sich dann
 *                 beim Fahren mit.
 *
 * Hinweis: Die Mähklinge sitzt fest im Karosserie-Mesh und dreht sich nicht
 * mit. Das vordere Stützrad ist (wie beim Differentialantrieb) passiv und
 * bleibt ebenfalls Teil der Karosserie.
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
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  // — 4. Antriebsräder zum Mitdrehen benennen. Im GLB heißen sie
  //   'Wheel_L'/'Wheel_R'; welches links (Spiel-Achse -X) bzw. rechts liegt,
  //   hängt von der Ausrichtung in Schritt 1 ab — darum nach Welt-X sortieren
  //   statt den GLB-Namen blind zu vertrauen. —
  model.updateMatrixWorld(true);
  const wheels: THREE.Object3D[] = [];
  model.traverse((obj) => {
    if (obj.name === 'Wheel_L' || obj.name === 'Wheel_R') wheels.push(obj);
  });
  if (wheels.length === 2) {
    const worldX = (o: THREE.Object3D) =>
      new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).x;
    wheels.sort((a, b) => worldX(a) - worldX(b));
    wheels[0].name = 'wheelLeft'; // kleineres X = links
    wheels[1].name = 'wheelRight';

    // — Dreh-Achse je Rad bestimmen. Ein Rad rollt um die QUER-Achse des
    //   Roboters (Spiel-X). Wie diese Achse im LOKALEN Koordinatensystem des
    //   Rad-Knotens liegt, hängt davon ab, wie das Rad in Blender ausgerichtet
    //   wurde — `rotation.x` wäre also blind geraten. Darum rechnen wir die
    //   Spiel-X-Achse aus der Welt-Drehung des Rades in dessen lokalen Frame
    //   zurück (die `robot`-Gruppe ist hier noch ungedreht, also Spiel-X =
    //   Welt-X). Der RobotController dreht das Rad mit `rotateOnAxis` um genau
    //   diese gespeicherte Achse. —
    for (const w of wheels) {
      const q = new THREE.Quaternion();
      w.getWorldQuaternion(q);
      w.userData.spinAxis = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(q.invert())
        .normalize();

      // Rad-Radius direkt aus dem Mesh messen — nicht raten. Das Rad rollt um
      // die Quer-Achse (Spiel-X); quer dazu ist es eine Scheibe, deren Y- und
      // Z-Ausdehnung je der Durchmesser ist. Mittelwert / 2 = Radius. So dreht
      // sich das Mesh später mit ω = v / r exakt zu seiner sichtbaren Größe
      // passend, statt mit einer hart geratenen Zahl (sah zu langsam aus).
      const wsize = new THREE.Box3()
        .setFromObject(w)
        .getSize(new THREE.Vector3());
      const r = (wsize.y + wsize.z) / 4;
      w.userData.radius = r > 1e-3 ? r : SIZES.wheelDiameter / 2;
    }
  }

  // Jedes Mesh wirft und empfängt Schatten.
  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  robot.add(model);

  return robot;
}
