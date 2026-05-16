import * as THREE from 'three';
import { COLORS } from '../tokens';

/**
 * Ein kleines Ästchen — aus ein paar dünnen Zylindern zusammengesetzt.
 * Es ist absichtlich leicht geknickt und hat einen kleinen Seitenzweig,
 * damit es wie ein echter Ast aussieht (nicht ganz gerade). Low-poly und
 * flat-shaded wie der Rest des Dioramas.
 *
 * Lokale Achse: Das Ästchen liegt entlang der Y-Achse, mittig um den
 * Ursprung — passend zum Kapsel-Collider in twigs.ts.
 */

/** Länge des Haupt-Asts (m). */
export const TWIG_LENGTH = 0.2;
/** Radius des Haupt-Asts (m). */
export const TWIG_RADIUS = 0.012;

// Ein Material für alle Ästchen, von allen Teilen geteilt.
const twigMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color(COLORS.twig),
  flatShading: true,
  roughness: 1,
  metalness: 0,
});

/** Ein Zylinder-Stück, leicht konisch und kantig (wenige Seiten). */
function segment(length: number, radius: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius * 0.85, radius, length, 5);
  const mesh = new THREE.Mesh(geo, twigMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Baut ein Ästchen als Gruppe. */
export function createTwigMesh(): THREE.Group {
  const twig = new THREE.Group();
  twig.name = 'twig';

  // Unteres, gerades Stück.
  const lower = segment(TWIG_LENGTH * 0.62, TWIG_RADIUS);
  lower.position.y = -TWIG_LENGTH * 0.19;

  // Oberes Stück, leicht abgeknickt — das "nicht ganz gerade".
  const upper = segment(TWIG_LENGTH * 0.46, TWIG_RADIUS * 0.85);
  upper.position.set(0.018, TWIG_LENGTH * 0.2, 0);
  upper.rotation.z = 0.3;

  // Kleiner Seitenzweig.
  const offshoot = segment(TWIG_LENGTH * 0.32, TWIG_RADIUS * 0.6);
  offshoot.position.set(-0.012, 0.012, 0.004);
  offshoot.rotation.z = -0.95;

  twig.add(lower, upper, offshoot);
  return twig;
}
