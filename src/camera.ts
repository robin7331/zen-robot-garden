import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Orthografische Orbit-Kamera — der "Modell"-Look des Dioramas:
 * parallele Kanten, keine Fluchtpunkt-Perspektive.
 *
 * - 360° um die Garten-Mitte drehbar
 * - Neigung begrenzt: immer schräg von oben (ca. 25°-70° über dem Horizont)
 * - Zoom über die Frustum-Größe (camera.zoom)
 */

/** Halbe Höhe des sichtbaren Ausschnitts in Weltmetern (Frustum). */
const VIEW_SIZE = 7;

/** Worauf die Kamera blickt: ungefähr die Mitte des Diorama-Slabs. */
const TARGET = new THREE.Vector3(0, -0.3, 0);

export function createCamera(): THREE.OrthographicCamera {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    -VIEW_SIZE * aspect,
    VIEW_SIZE * aspect,
    VIEW_SIZE,
    -VIEW_SIZE,
    -100,
    100,
  );

  // Start-Blickwinkel: leicht gedreht, schräg von oben.
  camera.position.set(9, 9, 11);
  camera.lookAt(TARGET);
  return camera;
}

export function createControls(
  camera: THREE.OrthographicCamera,
  domElement: HTMLElement,
): OrbitControls {
  const controls = new OrbitControls(camera, domElement);
  controls.target.copy(TARGET);

  controls.enableDamping = true; // ruhiges, sanftes Nachgleiten
  controls.dampingFactor = 0.08;
  controls.enablePan = false; // Garten-Mitte bleibt immer im Blick

  // Neigung begrenzen: Polarwinkel wird von oben (+Y) gemessen.
  //   70° über dem Horizont -> Polarwinkel 20°
  //   25° über dem Horizont -> Polarwinkel 65°
  controls.minPolarAngle = THREE.MathUtils.degToRad(20);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(65);

  // Zoom-Grenzen (orthografisch: camera.zoom).
  controls.minZoom = 0.5;
  controls.maxZoom = 3;

  controls.update();
  return controls;
}

/** Hält das Kamera-Frustum beim Fenster-Resize im richtigen Seitenverhältnis. */
export function resizeCamera(camera: THREE.OrthographicCamera): void {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -VIEW_SIZE * aspect;
  camera.right = VIEW_SIZE * aspect;
  camera.top = VIEW_SIZE;
  camera.bottom = -VIEW_SIZE;
  camera.updateProjectionMatrix();
}
