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

// --- Rubber Banding ------------------------------------------------------
// "Echte" Grenzen für Neigung und Zoom. Man darf beim Ziehen ein Stück
// darüber hinaus, danach federt die Kamera sanft hierher zurück.
//
// Polarwinkel wird von oben (+Y) gemessen:
//   70° über dem Horizont -> Polarwinkel 20°
//   25° über dem Horizont -> Polarwinkel 65°
const POLAR_MIN = THREE.MathUtils.degToRad(20);
const POLAR_MAX = THREE.MathUtils.degToRad(65);
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

/** Wie weit man über die echte Grenze hinausziehen darf. */
const POLAR_OVERSHOOT = THREE.MathUtils.degToRad(15); // zusätzlicher Winkel
const ZOOM_OVERSHOOT = 1.3; // Zoom-Faktor (z.B. 3 -> bis 3.9)

/** Wie schnell zurückgefedert wird (Anteil der Überdehnung pro Frame). */
const SPRING = 0.18;

// Wiederverwendete Hilfsobjekte (kein Müll pro Frame).
const _offset = new THREE.Vector3();
const _spherical = new THREE.Spherical();

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

  // OrbitControls bekommt die *weichen* Außengrenzen — das Stück Überdehnung
  // muss überhaupt erst möglich sein. Das Zurückfedern auf die echten Grenzen
  // macht updateControls() pro Frame.
  controls.minPolarAngle = POLAR_MIN - POLAR_OVERSHOOT;
  controls.maxPolarAngle = POLAR_MAX + POLAR_OVERSHOOT;
  controls.minZoom = ZOOM_MIN / ZOOM_OVERSHOOT;
  controls.maxZoom = ZOOM_MAX * ZOOM_OVERSHOOT;

  controls.update();
  return controls;
}

/**
 * Pro Frame statt `controls.update()` aufrufen: aktualisiert OrbitControls und
 * federt Neigung und Zoom sanft zurück, falls man über die echte Grenze
 * hinausgezogen hat (Rubber Banding).
 */
export function updateControls(
  controls: OrbitControls,
  camera: THREE.OrthographicCamera,
): void {
  controls.update();
  rubberBandPolar(controls, camera);
  rubberBandZoom(camera);
}

/** Neigung zur echten Grenze zurückziehen. */
function rubberBandPolar(
  controls: OrbitControls,
  camera: THREE.OrthographicCamera,
): void {
  _offset.copy(camera.position).sub(controls.target);
  _spherical.setFromVector3(_offset);

  const clamped = THREE.MathUtils.clamp(_spherical.phi, POLAR_MIN, POLAR_MAX);
  const delta = clamped - _spherical.phi;
  if (delta === 0) return; // innerhalb der Grenzen

  // Großer Rest -> ein Stück federn; winziger Rest -> sauber einrasten.
  _spherical.phi += Math.abs(delta) < 1e-3 ? delta : delta * SPRING;
  _offset.setFromSpherical(_spherical);
  camera.position.copy(controls.target).add(_offset);
  camera.lookAt(controls.target);
}

/** Zoom zur echten Grenze zurückziehen. */
function rubberBandZoom(camera: THREE.OrthographicCamera): void {
  const clamped = THREE.MathUtils.clamp(camera.zoom, ZOOM_MIN, ZOOM_MAX);
  const delta = clamped - camera.zoom;
  if (delta === 0) return;

  camera.zoom += Math.abs(delta) < 1e-3 ? delta : delta * SPRING;
  camera.updateProjectionMatrix();
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
