import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { SIZES, DRIVE } from './tokens';
import { GROUP, collisionGroups } from './physics';

/**
 * Lässt den Roboter autonom fahren — und zwar wirklich über Reibung.
 *
 * Der Roboter ist EIN Physik-Körper (ein Quader). Er bewegt sich nicht, weil
 * wir ihn schieben oder "beamen", sondern weil an seinen beiden Rädern
 * Reibungskräfte angreifen:
 *
 *   - Jedes Rad hat einen Motor und "will" sich mit einem bestimmten Tempo
 *     über den Boden abrollen.
 *   - Passt das tatsächliche Boden-Tempo des Rades nicht zum Motor-Tempo
 *     (das nennt man *Schlupf*), entsteht eine Reibungskraft. Die schiebt den
 *     Roboter vorwärts oder bremst ihn.
 *   - Quer zur Rollrichtung greifen die Räder stark — darum rutscht der
 *     Roboter nicht seitwärts weg, sondern fährt saubere Kurven.
 *
 * Differentialantrieb: beide Räder gleich schnell -> geradeaus; verschieden
 * schnell -> Kurve; gegenläufig -> Drehung auf der Stelle.
 *
 * Trägheit entsteht doppelt: die Rad-Motoren ändern ihr Tempo nur langsam
 * (DRIVE.wheelAccel), und der Körper selbst hat Masse.
 *
 * Damit alles ruhig und stabil bleibt, darf der Körper sich nur in der Ebene
 * bewegen (X/Z) und nur um die Hochachse drehen (Y) — er kann nicht kippen
 * oder abheben. Hügel kommen laut CLAUDE.md sowieso erst später.
 */

// — Roboter-Körper als Physik-Quader ————————————————————————————————
const BODY_HALF = {
  x: SIZES.robotWidth / 2,
  y: SIZES.robotHeight / 2,
  z: SIZES.robotLength / 2,
};
const ROBOT_MASS = 8; // kg — ungefähr wie ein echter Mähroboter

// — Rad-Anordnung (lokal zum Roboter; Ursprung am Boden, mittig) ——————————
const WHEEL_RADIUS = SIZES.wheelDiameter / 2;
const TRACK_HALF = SIZES.robotWidth / 2; // halber Abstand der beiden Räder
const WHEEL_Z = -0.06; // Räder sitzen leicht hinter der Mitte

// — Reibungs-Modell ————————————————————————————————————————————————
// Diese Werte bestimmen, "wie griffig" die Räder sind. In der Praxis stellt
// man sie durch Zuschauen fein ein.
const GRIP_LONG = 36; // N pro m/s Schlupf in Rollrichtung (Antrieb + Bremse)
const GRIP_LAT = 70; // N pro m/s seitliches Wegrutschen (Kurven-Halt)
const FORCE_MAX = 30; // N — eine Reibungskraft kann nicht beliebig groß werden

const BLADE_SPIN = 6; // rad/s — Drehzahl der Mähklinge beim Fahren

/** Was der Roboter gerade tut. */
type State = 'driving' | 'backing' | 'turning';

/** Erzeugt eine Quaternion für eine reine Drehung um die Hochachse (Y). */
function yawQuat(yaw: number): RAPIER.Rotation {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/** Bewegt `current` höchstens um `maxStep` in Richtung `target`. */
function approach(current: number, target: number, maxStep: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

/**
 * Steuert genau einen Roboter: sein Physik-Körper, seine zwei Rad-Motoren,
 * die Reibungs-Berechnung und die Autonomie ("geradeaus bis es stößt").
 */
export class RobotController {
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly view: THREE.Group;

  // Sicht-Teile, die sich beim Fahren mitdrehen.
  private readonly wheelLeftMesh: THREE.Object3D | null;
  private readonly wheelRightMesh: THREE.Object3D | null;
  private readonly bladeMesh: THREE.Object3D | null;

  // Motor-Tempo der beiden Räder (Boden-Tempo in m/s).
  private speedLeft = 0;
  private speedRight = 0;
  // Wunsch-Tempo, das die Autonomie gerade vorgibt.
  private targetLeft: number = DRIVE.maxSpeed;
  private targetRight: number = DRIVE.maxSpeed;

  // Autonomie: Zustand + Restzeit + zufällige Drehrichtung.
  private state: State = 'driving';
  private stateTimer = 0;
  private turnDir: 1 | -1 = 1;
  // Wird von außen gesetzt, wenn Rapier eine Kollision meldet (Stoßsensor).
  private bumped = false;

  // Wiederverwendete Hilfsobjekte — kein Müll pro Frame.
  private readonly _quat = new THREE.Quaternion();
  private readonly _fwd = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();

  constructor(
    world: RAPIER.World,
    view: THREE.Group,
    start: { x: number; z: number; yaw: number },
  ) {
    this.view = view;
    this.wheelLeftMesh = view.getObjectByName('wheelLeft') ?? null;
    this.wheelRightMesh = view.getObjectByName('wheelRight') ?? null;
    this.bladeMesh = view.getObjectByName('blade') ?? null;

    // Dynamischer Körper, in Ebene und Hochachsen-Drehung eingesperrt.
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, 0, start.z)
      .setRotation(yawQuat(start.yaw))
      .enabledTranslations(true, false, true) // nur X/Z — bleibt auf dem Rasen
      .enabledRotations(false, true, false) // nur Y — kann nicht kippen
      .setLinearDamping(0.2) // winziger Luftwiderstand für ruhigen Lauf
      .setAngularDamping(0.4);
    this.body = world.createRigidBody(bodyDesc);

    // Quader-Collider, vom Boden-Ursprung um die halbe Höhe nach oben gesetzt.
    // COLLISION_EVENTS = der "Stoßsensor": Rapier meldet jedes Anstoßen.
    // Kollisions-Gruppe: stößt an Wände und Ästchen, ignoriert den Boden.
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      BODY_HALF.x,
      BODY_HALF.y,
      BODY_HALF.z,
    )
      .setTranslation(0, BODY_HALF.y, 0)
      .setMass(ROBOT_MASS)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(
        collisionGroups(GROUP.robot, GROUP.wall | GROUP.twig),
      );
    this.collider = world.createCollider(colliderDesc, this.body);

    this.sync(0); // Sicht-Modell sofort an die Startpose setzen
  }

  /** Handle des Roboter-Colliders — damit erkennt main.ts ihn in Ereignissen. */
  get colliderHandle(): number {
    return this.collider.handle;
  }

  /** Meldet einen Stoß (von Rapiers Kollisions-Ereignissen aufgerufen). */
  reportBump(): void {
    this.bumped = true;
  }

  /**
   * Ein fester Physik-Schritt: Autonomie denken, Motoren regeln, Reibungs-
   * kräfte an den Rädern aufbringen. Direkt vor `world.step()` aufrufen.
   */
  fixedUpdate(dt: number): void {
    this.think(dt);
    this.rampMotors(dt);

    // Aktuelle Blickrichtung des Roboters bestimmen.
    const rot = this.body.rotation();
    this._quat.set(rot.x, rot.y, rot.z, rot.w);
    this._fwd.set(0, 0, 1).applyQuaternion(this._quat); // vorne
    this._right.set(1, 0, 0).applyQuaternion(this._quat); // rechts

    // Reibungskraft je Rad — daraus entsteht die ganze Bewegung.
    this.applyWheelFriction(-TRACK_HALF, this.speedLeft, dt);
    this.applyWheelFriction(TRACK_HALF, this.speedRight, dt);
  }

  /**
   * Übernimmt die Physik-Pose ins Sicht-Modell und dreht Räder + Klinge mit.
   * Einmal pro gerendertem Bild aufrufen.
   */
  sync(frameDt: number): void {
    const pos = this.body.translation();
    const rot = this.body.rotation();
    this.view.position.set(pos.x, pos.y, pos.z);
    this.view.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    // Räder drehen sich, weil sie über den Boden abrollen (Tempo / Radius).
    // Vorzeichen rein optisch gewählt: so rollt das Rad sichtbar "nach vorne".
    if (this.wheelLeftMesh) {
      this.wheelLeftMesh.rotation.x += (this.speedLeft / WHEEL_RADIUS) * frameDt;
    }
    if (this.wheelRightMesh) {
      this.wheelRightMesh.rotation.x +=
        (this.speedRight / WHEEL_RADIUS) * frameDt;
    }
    // Mähklinge dreht moderat, solange der Roboter überhaupt fährt.
    if (this.bladeMesh) {
      const moving =
        Math.abs(this.speedLeft) + Math.abs(this.speedRight) > 0.02;
      if (moving) this.bladeMesh.rotation.y += BLADE_SPIN * frameDt;
    }
  }

  // — Autonomie ("geradeaus, bis es stößt") ——————————————————————————
  private think(dt: number): void {
    // Ein Stoß zählt nur, während der Roboter geradeaus fährt.
    if (this.state === 'driving' && this.bumped) {
      this.state = 'backing';
      this.stateTimer = DRIVE.backupTime;
    }
    this.bumped = false;

    this.stateTimer -= dt;

    switch (this.state) {
      case 'driving':
        // Beide Räder volles Tempo -> geradeaus.
        this.targetLeft = DRIVE.maxSpeed;
        this.targetRight = DRIVE.maxSpeed;
        break;

      case 'backing':
        // Ein Stück zurücksetzen, weg vom Hindernis.
        this.targetLeft = -DRIVE.reverseSpeed;
        this.targetRight = -DRIVE.reverseSpeed;
        if (this.stateTimer <= 0) {
          // Danach in eine zufällige Richtung wegdrehen.
          this.state = 'turning';
          this.turnDir = Math.random() < 0.5 ? -1 : 1;
          this.stateTimer = THREE.MathUtils.lerp(
            DRIVE.turnTimeMin,
            DRIVE.turnTimeMax,
            Math.random(),
          );
        }
        break;

      case 'turning':
        // Räder gegenläufig -> Drehung auf der Stelle.
        this.targetLeft = DRIVE.turnSpeed * this.turnDir;
        this.targetRight = -DRIVE.turnSpeed * this.turnDir;
        if (this.stateTimer <= 0) this.state = 'driving';
        break;
    }
  }

  /** Rad-Motoren nähern sich ihrem Wunsch-Tempo an — das gibt die Trägheit. */
  private rampMotors(dt: number): void {
    const step = DRIVE.wheelAccel * dt;
    this.speedLeft = approach(this.speedLeft, this.targetLeft, step);
    this.speedRight = approach(this.speedRight, this.targetRight, step);
  }

  /**
   * Bringt die Reibungskraft eines Rades auf den Körper.
   *
   * @param localX     X-Position des Rades im Roboter (-/+ TRACK_HALF)
   * @param motorSpeed Wunsch-Abrolltempo des Rad-Motors (m/s)
   * @param dt         Physik-Schrittweite (s)
   */
  private applyWheelFriction(
    localX: number,
    motorSpeed: number,
    dt: number,
  ): void {
    // Hebel vom Körper-Mittelpunkt zum Rad-Aufstandspunkt (in Weltachsen).
    const rx = this._right.x * localX + this._fwd.x * WHEEL_Z;
    const rz = this._right.z * localX + this._fwd.z * WHEEL_Z;

    // Geschwindigkeit des Bodens unter dem Rad: v = linvel + omega × r.
    const lin = this.body.linvel();
    const omega = this.body.angvel().y;
    const vx = lin.x + omega * rz;
    const vz = lin.z - omega * rx;

    // In Roll- und Querrichtung des Rades zerlegen.
    const vForward = vx * this._fwd.x + vz * this._fwd.z;
    const vLateral = vx * this._right.x + vz * this._right.z;

    // Längs: Schlupf zwischen Motor-Tempo und echtem Tempo -> Antrieb/Bremse.
    const fForward = THREE.MathUtils.clamp(
      GRIP_LONG * (motorSpeed - vForward),
      -FORCE_MAX,
      FORCE_MAX,
    );
    // Quer: das Rad greift und bremst seitliches Wegrutschen.
    const fLateral = THREE.MathUtils.clamp(
      -GRIP_LAT * vLateral,
      -FORCE_MAX,
      FORCE_MAX,
    );

    // Kraft -> Impuls (Kraft × Zeit) und am Rad-Aufstandspunkt aufbringen.
    const ix = (fForward * this._fwd.x + fLateral * this._right.x) * dt;
    const iz = (fForward * this._fwd.z + fLateral * this._right.z) * dt;
    const pos = this.body.translation();
    this.body.applyImpulseAtPoint(
      { x: ix, y: 0, z: iz },
      { x: pos.x + rx, y: pos.y, z: pos.z + rz },
      true,
    );
  }
}
