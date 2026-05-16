import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { createTwigMesh, TWIG_LENGTH, TWIG_RADIUS } from './models/twig';
import { GROUP, collisionGroups } from './physics';

/**
 * Verwaltet alle Ästchen im Garten.
 *
 * Klickt man auf den Rasen, entsteht dort ein Ästchen: Es erscheint 30 cm
 * über dem Boden, in zufälliger Lage (jedes fällt anders), und sinkt mit
 * Schwerkraft hinunter. Es ist ein echter Physik-Körper — der Roboter kann
 * darüberfahren, es wegschieben oder daran hängen bleiben.
 */

/** Höhe, in der ein neues Ästchen erscheint (m über dem Boden). */
const SPAWN_HEIGHT = 0.3;
/** Gewicht eines Ästchens (kg) — leicht, aber nicht federleicht. */
const TWIG_MASS = 0.12;

interface Twig {
  view: THREE.Group;
  body: RAPIER.RigidBody;
}

export class TwigField {
  private readonly twigs: Twig[] = [];

  constructor(
    private readonly world: RAPIER.World,
    private readonly scene: THREE.Scene,
  ) {}

  /** Lässt an der Stelle (x, z) ein neues Ästchen aus 30 cm Höhe fallen. */
  spawn(x: number, z: number): void {
    // Zufällige Lage — so liegt kein Ästchen wie das andere.
    const rot = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        Math.random() * Math.PI,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI,
      ),
    );

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, SPAWN_HEIGHT, z)
        .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
        .setLinearDamping(0.4)
        .setAngularDamping(0.6),
    );

    // Kapsel-Collider entlang der Y-Achse des Ästchens (= Haupt-Ast).
    const halfHeight = TWIG_LENGTH / 2 - TWIG_RADIUS;
    const collider = RAPIER.ColliderDesc.capsule(halfHeight, TWIG_RADIUS)
      .setMass(TWIG_MASS)
      .setFriction(0.9)
      .setCollisionGroups(
        collisionGroups(
          GROUP.twig,
          GROUP.ground | GROUP.wall | GROUP.robot | GROUP.twig,
        ),
      );
    this.world.createCollider(collider, body);

    const view = createTwigMesh();
    this.scene.add(view);
    this.twigs.push({ view, body });
  }

  /** Übernimmt jedes Bild die Physik-Lage in die Sicht-Modelle. */
  sync(): void {
    for (const { view, body } of this.twigs) {
      const p = body.translation();
      const r = body.rotation();
      view.position.set(p.x, p.y, p.z);
      view.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
