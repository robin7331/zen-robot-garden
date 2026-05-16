import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { createRenderer, createScene } from './sceneSetup';
import {
  createCamera,
  createControls,
  resizeCamera,
  updateControls,
} from './camera';
import { createGarden } from './garden';
import { MowGrid } from './mowGrid';
import { GrassField } from './grass';
import { createWireMeshes } from './wire';
import { createRobot } from './models/robot';
import { initPhysics, createWorld, addGround } from './physics';
import { RobotController } from './robotController';
import { TwigField } from './twigs';
import {
  createChargingStationMesh,
  STATION,
} from './models/chargingStation';
import { SIZES } from './tokens';
import { heightAt, normalAt, raycastTerrain } from './terrain';
import { createBatteryUI, createFpsUI } from './ui';

/**
 * Einstiegspunkt: setzt Szene, Kamera, Garten und Physik zusammen und startet
 * die Render-Schleife. Der Roboter fährt autonom (über echte Reibung), und ein
 * Klick auf den Rasen lässt dort ein Ästchen herunterfallen.
 *
 * Rapier muss erst sein WASM-Modul laden, darum läuft alles in `main()` und
 * beginnt mit `await initPhysics()`.
 */
async function main(): Promise<void> {
  await initPhysics();

  const renderer = createRenderer();
  const scene = createScene();
  const camera = createCamera();
  const controls = createControls(camera, renderer.domElement);

  scene.add(createGarden());
  // Sichtbare Drähte: Begrenzungsdraht (Schleife) + Leitdraht (Heimweg).
  scene.add(createWireMeshes());

  // Mäh-Gitter: die Rasen-Fläche, die sich verändert. Der Roboter mäht sie
  // kurz, überall wächst das Gras langsam nach (Farbe = Grashöhe).
  const mowGrid = new MowGrid();
  scene.add(mowGrid.mesh);

  // Physik-Welt + Boden. Die Rasen-Grenze ist der Begrenzungsdraht (wire.ts),
  // keine Wand — der Roboter spürt ihn mit seinen Spulen-Sensoren.
  const world = createWorld();
  addGround(world);

  // Ladestation an der rechten Rasenkante, Öffnung zum Rasen hin. Sie steht
  // auf dem Hang: auf die Geländehöhe gehoben und zur Gelände-Normale geneigt
  // (kein flaches Podest — konsequent zur Vollphysik).
  const stationYaw = -Math.PI / 2;
  const stationPos = new THREE.Vector3(3.6, 0, -1.6);
  stationPos.y = heightAt(stationPos.x, stationPos.z);
  const station = await createChargingStationMesh();
  station.position.copy(stationPos);
  {
    // Drehung: Hochachse auf die Gelände-Normale, dazu der Stations-Yaw.
    const up = normalAt(stationPos.x, stationPos.z);
    const fwd = new THREE.Vector3(Math.sin(stationYaw), 0, Math.cos(stationYaw));
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    station.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, fwd),
    );
  }
  scene.add(station);

  // Grundfläche der Station (Welt-Rechteck XZ) — darunter wächst kein Gras.
  const stationBox = new THREE.Box3().setFromObject(station);
  const stationArea = {
    minX: stationBox.min.x,
    maxX: stationBox.max.x,
    minZ: stationBox.min.z,
    maxZ: stationBox.max.z,
  };
  // Mäh-Gitter dort sperren (keine Farb-Fläche, kein Nachwachsen).
  mowGrid.clearArea(
    stationArea.minX,
    stationArea.minZ,
    stationArea.maxX,
    stationArea.maxZ,
  );

  // Echte 3D-Grashalme über dem Gitter: der Shader liest Höhe und Plattdrücken
  // direkt aus mowGrid.heightTexture. Die Farb-Ebene scheint dazwischen durch.
  // Unter der Ladestation bleibt die Fläche frei von Halmen.
  const grassField = new GrassField(mowGrid, [stationArea]);
  scene.add(grassField.mesh);

  // Andock-Punkt (Weltkoordinaten): kurz vor der Rückwand der Station, mit
  // der (geneigten) Stations-Pose mitgedreht.
  const dock = new THREE.Vector3(0, 0, STATION.dockLocalZ)
    .applyQuaternion(station.quaternion)
    .add(stationPos);

  // Lade-Leuchte der Station — wird pro Bild auf/aus geschaltet.
  const ledMat = (station.getObjectByName('led') as THREE.Mesh)
    .material as THREE.MeshStandardMaterial;

  // Roboter: Sicht-Modell in die Szene, Steuerung an die Physik koppeln.
  // createRobot() lädt erst das GLB-Modell, darum await.
  const robot = await createRobot();
  scene.add(robot);
  const controller = new RobotController(
    world,
    robot,
    { x: -0.8, z: 0.6, yaw: -0.6 },
    { x: dock.x, z: dock.z },
  );
  const robotHandle = controller.colliderHandle;

  // Ästchen-Verwaltung.
  const twigField = new TwigField(world, scene);

  // Akku-Anzeige + FPS-Zähler (HTML-Overlays über dem Canvas).
  const batteryUI = createBatteryUI();
  const fpsUI = createFpsUI();

  // Kollisions-Ereignisse aus Rapier — der "Stoßsensor" des Roboters.
  const events = new RAPIER.EventQueue(true);

  // — Zeiger: Roboter ziehen, sonst Ästchen setzen / Kamera drehen ————————
  // Trifft der Zeiger beim Drücken den Roboter, ziehen wir ihn (drag & drop) —
  // so holt man ihn auch zurück, wenn er außerhalb des Drahts angehalten hat.
  // Sonst gilt: kurzer Klick auf den Rasen -> Ästchen; Ziehen -> Kamera. Ein
  // Ziehen soll kein Ästchen erzeugen, darum merken wir uns die Zeiger-
  // Position beim Drücken und prüfen beim Loslassen, ob sie sich kaum bewegt.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  let draggingRobot = false;

  /** Rechnet Zeiger-Pixel in den three.js-Bereich -1..+1 um. */
  function setPointer(e: PointerEvent): void {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;

    // Trifft der Strahl den Roboter? Dann ziehen wir ihn statt der Kamera.
    setPointer(e);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(robot, true).length > 0) {
      draggingRobot = true;
      controls.enabled = false; // Kamera-Drehen währenddessen aus
      controller.beginDrag();
      renderer.domElement.setPointerCapture(e.pointerId);
    }
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!draggingRobot) return;
    setPointer(e);
    raycaster.setFromCamera(pointer, camera);
    // Der Zieh-Strahl tastet das gewellte Gelände ab (keine flache Ebene mehr).
    const hit = raycastTerrain(raycaster.ray.origin, raycaster.ray.direction);
    if (hit) controller.dragTo(hit.x, hit.z);
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    // Wurde der Roboter gezogen? Hier absetzen — kein Ästchen, kein Drehen.
    if (draggingRobot) {
      draggingRobot = false;
      controller.endDrag();
      controls.enabled = true;
      renderer.domElement.releasePointerCapture(e.pointerId);
      return;
    }

    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved > 6) return; // war ein Ziehen (Kamera), kein Klick

    // Wo der Strahl das Gelände trifft, kommt das Ästchen hin.
    setPointer(e);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycastTerrain(raycaster.ray.origin, raycaster.ray.direction);
    if (!hit) return;

    // Nur Klicks auf dem Rasen zählen.
    if (
      Math.abs(hit.x) > SIZES.lawnWidth / 2 ||
      Math.abs(hit.z) > SIZES.lawnDepth / 2
    ) {
      return;
    }
    twigField.spawn(hit.x, hit.z);
  });

  // Fenstergröße ändern: Renderer und Kamera-Frustum anpassen.
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeCamera(camera);
  });

  // Feste Physik-Schrittweite, entkoppelt vom variablen Bild-Takt.
  const FIXED_DT = world.timestep;
  let accumulator = 0;
  let lastTime = performance.now();
  let elapsed = 0; // aufsummierte Spielzeit in Sekunden (für die Wind-Welle)

  function animate(): void {
    requestAnimationFrame(animate);

    const now = performance.now();
    let frameDt = (now - lastTime) / 1000;
    lastTime = now;
    fpsUI.update(frameDt); // echte Bild-Zeitspanne, vor dem Deckeln messen
    if (frameDt > 0.1) frameDt = 0.1; // nach Tab-Wechsel nicht "explodieren"
    elapsed += frameDt;

    // Physik in festen Schritten nachholen.
    accumulator += frameDt;
    while (accumulator >= FIXED_DT) {
      controller.fixedUpdate(FIXED_DT);
      world.step(events);
      // Berührt der Roboter ein Hindernis (ein Ästchen), zählt das als Stoß.
      events.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        if (h1 === robotHandle || h2 === robotHandle) controller.reportBump();
      });
      accumulator -= FIXED_DT;
    }

    controller.sync(frameDt); // Physik-Pose ins Sicht-Modell übernehmen
    twigField.sync(); // Ästchen mitbewegen

    // Mäh-Gitter: wo der Roboter mäht, wird das Gras kurz; überall wächst es
    // nach. Gemäht wird nur, wenn die Klingen wirklich laufen (nicht beim
    // Heimfahren, Laden, Anhalten oder Gezogenwerden).
    if (controller.activity === 'mowing') {
      mowGrid.cutAt(robot.position.x, robot.position.z);
    }
    // Plattdrücken: solange der Roboter mit seinen Rädern auf dem Rasen steht
    // (nicht angehoben), klappen die Halme unter ihm platt.
    if (!draggingRobot) {
      mowGrid.flattenAt(robot.position.x, robot.position.z);
    }
    mowGrid.update(frameDt);
    grassField.update(elapsed);
    batteryUI.update(controller.batteryLevel, controller.activity);

    // Lade-Leuchte: pulsiert sanft, solange der Roboter andockt und lädt.
    ledMat.emissiveIntensity = controller.isCharging
      ? 0.9 + 0.5 * Math.sin(now * 0.006)
      : 0;
    updateControls(controls, camera); // Damping + Rubber Banding
    renderer.render(scene, camera);
  }
  animate();
}

main();
