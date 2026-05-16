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
import { createRobot } from './models/robot';
import {
  initPhysics,
  createWorld,
  addGround,
  addBoundaryWalls,
} from './physics';
import { RobotController } from './robotController';
import { TwigField } from './twigs';
import {
  createChargingStationMesh,
  STATION,
} from './models/chargingStation';
import { SIZES } from './tokens';

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

  // Physik-Welt + Boden + unsichtbare Wände an der Rasenkante.
  const world = createWorld();
  addGround(world);
  const wallHandles = new Set(addBoundaryWalls(world));

  // Ladestation an der rechten Rasenkante, Öffnung zum Rasen hin.
  const stationPos = new THREE.Vector3(3.6, 0, -1.6);
  const stationYaw = -Math.PI / 2;
  const station = createChargingStationMesh();
  station.position.copy(stationPos);
  station.rotation.y = stationYaw;
  scene.add(station);

  // Andock-Punkt (Weltkoordinaten): kurz vor der Rückwand der Station.
  const dock = new THREE.Vector3(0, 0, STATION.dockLocalZ)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), stationYaw)
    .add(stationPos);

  // Lade-Leuchte der Station — wird pro Bild auf/aus geschaltet.
  const ledMat = (station.getObjectByName('led') as THREE.Mesh)
    .material as THREE.MeshStandardMaterial;

  // Roboter: Sicht-Modell in die Szene, Steuerung an die Physik koppeln.
  const robot = createRobot();
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

  // Kollisions-Ereignisse aus Rapier — der "Stoßsensor" des Roboters.
  const events = new RAPIER.EventQueue(true);

  // — Klick auf den Rasen -> dort ein Ästchen fallen lassen ————————————
  // Ein Ziehen (Kamera drehen) soll kein Ästchen erzeugen — darum merken wir
  // uns die Maus-Position beim Drücken und prüfen beim Loslassen, ob sie sich
  // kaum bewegt hat.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  let downX = 0;
  let downY = 0;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved > 6) return; // war ein Ziehen, kein Klick

    // Mausposition in den Bereich -1..+1 umrechnen und einen Strahl in die
    // Szene schießen; wo er die Boden-Ebene trifft, kommt das Ästchen hin.
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;

    // Nur Klicks auf dem Rasen zählen.
    if (
      Math.abs(hitPoint.x) > SIZES.lawnWidth / 2 ||
      Math.abs(hitPoint.z) > SIZES.lawnDepth / 2
    ) {
      return;
    }
    twigField.spawn(hitPoint.x, hitPoint.z);
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

  function animate(): void {
    requestAnimationFrame(animate);

    const now = performance.now();
    let frameDt = (now - lastTime) / 1000;
    lastTime = now;
    if (frameDt > 0.1) frameDt = 0.1; // nach Tab-Wechsel nicht "explodieren"

    // Physik in festen Schritten nachholen.
    accumulator += frameDt;
    while (accumulator >= FIXED_DT) {
      controller.fixedUpdate(FIXED_DT);
      world.step(events);
      // Nur ein Stoß gegen eine Wand zählt als "anstoßen". Ästchen-Berührungen
      // schiebt der Roboter einfach weg — oder bleibt daran hängen.
      events.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        if (h1 !== robotHandle && h2 !== robotHandle) return;
        const other = h1 === robotHandle ? h2 : h1;
        if (wallHandles.has(other)) controller.reportBump();
      });
      accumulator -= FIXED_DT;
    }

    controller.sync(frameDt); // Physik-Pose ins Sicht-Modell übernehmen
    twigField.sync(); // Ästchen mitbewegen

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
