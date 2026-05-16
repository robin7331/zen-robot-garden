import * as THREE from 'three';
import { COLORS, SIZES } from './tokens';

/**
 * Der Garten — vorerst nur der "Slab", also die Diorama-Box.
 *
 * Drei gestapelte Schichten (Proof-of-Concept aus einfachen Kisten):
 *   - oben:  Rasen (flache Gras-Deckschicht), Oberseite liegt bei y = 0
 *   - Mitte: Erd-Band (soil)
 *   - unten: Fels-Schicht (rock)
 *
 * Gras-Büschel, Mäh-Gitter und das zackige Ausfransen kommen später.
 */
export function createGarden(): THREE.Group {
  const garden = new THREE.Group();
  garden.name = 'garden';

  // Rasen-Deckschicht: ragt mit der Gras-Lippe leicht über die Kanten.
  // Die Oberseite liegt bei y = 0 — auf dieser Ebene fährt später der Roboter.
  const grassMesh = makeSlab(
    SIZES.lawnWidth + SIZES.grassLip * 2,
    SIZES.grassThickness,
    SIZES.lawnDepth + SIZES.grassLip * 2,
    COLORS.grass,
    -SIZES.grassThickness / 2,
  );
  grassMesh.name = 'grass';

  // Erd-Band direkt unter dem Rasen.
  const soilTop = -SIZES.grassThickness;
  const soilMesh = makeSlab(
    SIZES.lawnWidth,
    SIZES.soilThickness,
    SIZES.lawnDepth,
    COLORS.soil,
    soilTop - SIZES.soilThickness / 2,
  );
  soilMesh.name = 'soil';

  // Fels-Schicht darunter.
  const rockTop = soilTop - SIZES.soilThickness;
  const rockMesh = makeSlab(
    SIZES.lawnWidth,
    SIZES.rockThickness,
    SIZES.lawnDepth,
    COLORS.rock,
    rockTop - SIZES.rockThickness / 2,
  );
  rockMesh.name = 'rock';

  garden.add(grassMesh, soilMesh, rockMesh);
  return garden;
}

/**
 * Baut eine flach schattierte Quader-Schicht und positioniert sie auf der
 * angegebenen Höhe (Mittelpunkt y = centerY).
 */
function makeSlab(
  width: number,
  height: number,
  depth: number,
  color: string,
  centerY: number,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  // flatShading: harte Kanten, eine flache Farbe je Facette — der Origami-Look.
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    flatShading: true,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = centerY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
