import * as RAPIER from '@dimforge/rapier3d-compat';
import { SIZES } from './tokens';

/**
 * Die Physik-Grundlage (Rapier).
 *
 * Rapier ist der "Physik-Rechner": Er kennt Trägheit, Kräfte, Schwerkraft und
 * das Anstoßen von Körpern. Hier richten wir die Welt ein und stellen Boden
 * und unsichtbare Wände auf.
 *
 * Rapier ist in WebAssembly geschrieben und muss erst geladen werden — darum
 * gibt es `initPhysics()`, das einmal ganz am Anfang `await`-et werden muss.
 */

/**
 * Kollisions-Gruppen. Jeder Collider gehört einer Gruppe an und legt fest,
 * mit welchen Gruppen er überhaupt zusammenstößt. So ignoriert der Roboter
 * den Boden (er ist sowieso in der Ebene eingesperrt), stößt aber an Wände
 * und Ästchen.
 */
export const GROUP = {
  ground: 0b0001,
  wall: 0b0010,
  robot: 0b0100,
  twig: 0b1000,
} as const;

/**
 * Baut den 32-Bit-Wert für `setCollisionGroups`: die oberen 16 Bit sagen,
 * in welcher Gruppe der Collider ist, die unteren 16 Bit, mit welchen
 * Gruppen er kollidiert.
 */
export function collisionGroups(member: number, collidesWith: number): number {
  return (member << 16) | collidesWith;
}

/** Lädt das Rapier-WASM-Modul. Muss einmal vor allem anderen aufgerufen werden. */
export async function initPhysics(): Promise<void> {
  await RAPIER.init();
}

/** Eine frische Physik-Welt mit Erdanziehung nach unten. */
export function createWorld(): RAPIER.World {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60; // feste Schrittweite — ruhig und vorhersehbar
  return world;
}

/**
 * Unsichtbarer Boden, Oberseite genau bei y = 0. Darauf fallen die Ästchen.
 * Der Roboter braucht ihn nicht (er ist in der Ebene eingesperrt) — die
 * Kollisions-Gruppe sorgt dafür, dass er den Boden gar nicht erst berührt.
 */
export function addGround(world: RAPIER.World): void {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
  );
  const collider = RAPIER.ColliderDesc.cuboid(
    SIZES.lawnWidth / 2,
    0.5,
    SIZES.lawnDepth / 2,
  )
    .setFriction(1) // griffiges Gras — Ästchen rollen nicht ewig weiter
    .setCollisionGroups(collisionGroups(GROUP.ground, GROUP.twig));
  world.createCollider(collider, body);
}

/**
 * Vier unsichtbare Wände rund um den Rasen. Solange der Rasen rechteckig ist,
 * spielen sie die Rolle des Begrenzungsdrahts: Der Roboter stößt dagegen,
 * setzt zurück und dreht weg. Der echte verlegbare Draht kommt laut CLAUDE.md
 * erst später (zusammen mit krummen Rasenformen).
 *
 * Gibt die Collider-Handles zurück — daran erkennt die Stoß-Erkennung später,
 * dass wirklich eine Wand getroffen wurde (und nicht nur ein Ästchen).
 */
export function addBoundaryWalls(world: RAPIER.World): number[] {
  const halfW = SIZES.lawnWidth / 2;
  const halfD = SIZES.lawnDepth / 2;
  const t = 0.25; // halbe Wand-Dicke
  const h = 0.5; // halbe Wand-Höhe

  // Je Wand: Mittelpunkt-X, Mittelpunkt-Z, halbe Größe X, halbe Größe Z.
  // Die Innenseite jeder Wand liegt genau auf der Rasenkante.
  const walls: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, halfD + t, halfW + 2 * t, t], // hinten  (+Z)
    [0, -halfD - t, halfW + 2 * t, t], // vorne   (-Z)
    [halfW + t, 0, t, halfD], // rechts  (+X)
    [-halfW - t, 0, t, halfD], // links   (-X)
  ];

  const handles: number[] = [];
  for (const [cx, cz, hx, hz] of walls) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, h, cz),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, h, hz).setCollisionGroups(
        collisionGroups(GROUP.wall, GROUP.robot | GROUP.twig),
      ),
      body,
    );
    handles.push(collider.handle);
  }
  return handles;
}
