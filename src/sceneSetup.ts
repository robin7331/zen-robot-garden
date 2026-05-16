import * as THREE from 'three';
import { COLORS } from './tokens';

/**
 * Baut Renderer, Szene und Licht auf.
 *
 * Der Hintergrund-Verlauf kommt aus dem CSS (siehe index.html); der Renderer
 * ist darum transparent — das Diorama "schwebt" vor dem CSS-Verlauf.
 */
export function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearAlpha(0); // durchsichtig -> CSS-Verlauf scheint durch

  // Weiche Schlagschatten.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.body.appendChild(renderer.domElement);
  return renderer;
}

/** Erstellt die Szene mit Sonne und Füll-Licht. */
export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();

  // Füll-Licht (ambient), leicht bläulich — Schattenseiten saufen nicht ab.
  const ambient = new THREE.AmbientLight(new THREE.Color(COLORS.ambient), 1.1);
  scene.add(ambient);

  // Eine Sonne (directional), schräg von oben-seitlich, fest stehend.
  const sun = new THREE.DirectionalLight(new THREE.Color(COLORS.sun), 2.4);
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4; // weicher Schatten-Rand
  sun.shadow.bias = -0.0005;

  // Schatten-Frustum eng um den Garten legen (scharfer, sauberer Schatten).
  const cam = sun.shadow.camera;
  cam.left = -7;
  cam.right = 7;
  cam.top = 7;
  cam.bottom = -7;
  cam.near = 0.5;
  cam.far = 40;
  cam.updateProjectionMatrix();

  scene.add(sun);
  return scene;
}
