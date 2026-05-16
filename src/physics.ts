import * as RAPIER from '@dimforge/rapier3d-compat';
import { terrainData } from './terrain';

/**
 * Die Physik-Grundlage (Rapier).
 *
 * Rapier ist der "Physik-Rechner": Er kennt Trägheit, Kräfte, Schwerkraft und
 * das Anstoßen von Körpern. Hier richten wir die Welt ein und stellen den
 * Boden auf.
 *
 * Der Boden ist jetzt ein **Höhenfeld-Collider** aus der Gelände-Höhenkarte
 * (siehe `terrain.ts`) statt eines flachen Quaders — Ästchen rollen damit die
 * Hänge hinab. Der Roboter berührt den Boden gar nicht (er schwebt auf seiner
 * abgetasteten Rad-Federung); nur Ästchen liegen wirklich darauf.
 *
 * Die Rasen-Grenze ist KEINE Wand, sondern der Begrenzungsdraht (siehe
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
 * Der Gelände-Boden als **Höhenfeld-Collider** aus der Höhenkarte (terrain.ts).
 * Darauf liegen und rollen die Ästchen — Hänge hinab, ganz von selbst.
 *
 * Rapiers Höhenfeld erwartet die Höhen spaltenweise (Index `i + j*(nrows+1)`,
 * i entlang X, j entlang Z) — genau so liegt `terrainData.heights`. Das Feld
 * ist auf die Skala (lawnWidth, 1, lawnDepth) gespannt und mittig zentriert,
 * also liegt es deckungsgleich unter den Sicht-Meshes.
 *
 * Der Roboter braucht den Boden nicht — er schwebt auf seiner Rad-Federung;
 * die Kollisions-Gruppe (ground stößt nur an twig) sorgt dafür, dass er das
 * Höhenfeld gar nicht erst berührt.
 */
export function addGround(world: RAPIER.World): void {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const collider = RAPIER.ColliderDesc.heightfield(
    terrainData.GX - 1, // nrows — Zellen entlang X
    terrainData.GZ - 1, // ncols — Zellen entlang Z
    terrainData.heights,
    { x: terrainData.width, y: 1, z: terrainData.depth },
  )
    .setFriction(1) // griffiges Gras — Ästchen rollen nicht ewig weiter
    .setCollisionGroups(collisionGroups(GROUP.ground, GROUP.twig));
  world.createCollider(collider, body);
}
