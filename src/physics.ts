import * as RAPIER from '@dimforge/rapier3d-compat';
import { SIZES } from './tokens';

/**
 * Die Physik-Grundlage (Rapier).
 *
 * Rapier ist der "Physik-Rechner": Er kennt Trägheit, Kräfte, Schwerkraft und
 * das Anstoßen von Körpern. Hier richten wir die Welt ein und stellen den
 * Boden auf.
 *
 * Die Rasen-Grenze ist KEINE Wand mehr, sondern der Begrenzungsdraht (siehe
 * `wire.ts`): Der Roboter spürt ihn mit seinen Spulen-Sensoren und kehrt um,
 * bevor er irgendwo anstößt. Physische Kollision gibt es nur noch mit echten
 * Hindernissen (Ästchen, später Haus/Baum).
 *
 * Rapier ist in WebAssembly geschrieben und muss erst geladen werden — darum
 * gibt es `initPhysics()`, das einmal ganz am Anfang `await`-et werden muss.
 */

/**
 * Kollisions-Gruppen. Jeder Collider gehört einer Gruppe an und legt fest,
 * mit welchen Gruppen er überhaupt zusammenstößt. So ignoriert der Roboter
 * den Boden (er ist sowieso in der Ebene eingesperrt), stößt aber an Ästchen.
 *
 * `wall` ist für später reserviert — feste Hindernisse wie Haus und Baum
 * bekommen diese Gruppe, dann stößt der Roboter auch an sie.
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
