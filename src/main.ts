import { createRenderer, createScene } from './sceneSetup';
import { createCamera, createControls, resizeCamera } from './camera';
import { createGarden } from './garden';

/**
 * Einstiegspunkt: setzt Szene, Kamera und Garten zusammen und startet die
 * Render-Schleife. Noch keine Features (kein Roboter, keine Physik) —
 * nur das ruhige Diorama.
 */

const renderer = createRenderer();
const scene = createScene();
const camera = createCamera();
const controls = createControls(camera, renderer.domElement);

scene.add(createGarden());

// Fenstergröße ändern: Renderer und Kamera-Frustum anpassen.
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeCamera(camera);
});

// Render-Schleife.
function animate(): void {
  requestAnimationFrame(animate);
  controls.update(); // nötig wegen enableDamping
  renderer.render(scene, camera);
}
animate();
