import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { SIZES, DRIVE, BATTERY } from './tokens';
import { GROUP, collisionGroups } from './physics';
import { WIRE, insideWire } from './wire';
import type { RobotActivity } from './ui';

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
 * == Wie der Roboter die Grenze erkennt ==
 *
 * Wie ein echter Mähroboter hat er ZWEI Spulen-Sensoren — einen vorne, einen
 * hinten, beide auf der Längsachse. Jede Spule "spürt", ob sie INNERHALB des
 * Begrenzungsdrahts ist (auf dem Mäh-Rasen) oder schon AUSSERHALB:
 *
 *   - Vordere Spule draußen, hintere drinnen -> die Nase hat den Draht
 *     überquert -> der Roboter setzt zurück und dreht vom Draht weg. Wie
 *     schräg er den Draht getroffen hat, bestimmt, wie weit er sich dreht.
 *   - Beide Spulen draußen -> der ganze Roboter ist aus der Schleife heraus.
 *     Dann hält er an (wie ein echter Mähroboter, der seine Grenze verliert).
 *
 * Beim Heimfahren zur Ladestation ist die Draht-Erkennung aus: die Station
 * steht an der Rasenkante, dorthin darf der Roboter den Draht überfahren.
 *
 * Daneben gibt es weiter die Stoß-Erkennung für echte Hindernisse (Ästchen,
 * später Haus/Baum): ein physischer Zusammenstoß löst Zurücksetzen + Drehen
 * aus. Draht- und Stoß-System arbeiten unabhängig — wie beim echten Gerät.
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

// — Spulen-Sensoren (lokal; auf der Längsachse, vorne und hinten) ——————————
const COIL_FRONT_Z = SIZES.robotLength / 2; // vordere Spule an der Nase
const COIL_REAR_Z = -SIZES.robotLength / 2; // hintere Spule am Heck

// — Reibungs-Modell ————————————————————————————————————————————————
// Diese Werte bestimmen, "wie griffig" die Räder sind. In der Praxis stellt
// man sie durch Zuschauen fein ein.
const GRIP_LONG = 36; // N pro m/s Schlupf in Rollrichtung (Antrieb + Bremse)
const GRIP_LAT = 70; // N pro m/s seitliches Wegrutschen (Kurven-Halt)
const FORCE_MAX = 30; // N — eine Reibungskraft kann nicht beliebig groß werden

const BLADE_SPIN = 6; // rad/s — Drehzahl der Mähklinge beim Fahren

// — Heimfahren zur Ladestation ————————————————————————————————————
const STEER_GAIN = 1.6; // wie kräftig der Roboter zum Ziel einlenkt
const DOCK_RADIUS = 0.18; // ab dieser Nähe zur Station gilt er als angedockt

// — Drehen ————————————————————————————————————————————————————————
const TURN_DONE = 0.1; // rad — so nah am Ziel-Kurs gilt eine Drehung als fertig

// Beim Ziehen darf der Roboter nur so weit, dass sein Körper ganz auf dem
// Rasen-Slab bleibt (nie über die Kante in die Leere).
const DRAG_LIMIT_X = SIZES.lawnWidth / 2 - SIZES.robotLength / 2;
const DRAG_LIMIT_Z = SIZES.lawnDepth / 2 - SIZES.robotLength / 2;

/**
 * Was der Roboter gerade tut.
 *   driving  — geradeaus mähen
 *   seeking  — Akku niedrig, fährt zur Ladestation heim
 *   charging — steht angedockt und lädt
 *   backing  — nach Draht/Stoß (oder vom Laden) ein Stück zurücksetzen
 *   turning  — danach auf den Ziel-Kurs drehen
 *   stopped  — angehalten, weil aus der Draht-Schleife entkommen
 *   held     — wird gerade mit dem Zeiger gezogen
 */
type State =
  | 'driving'
  | 'seeking'
  | 'charging'
  | 'backing'
  | 'turning'
  | 'stopped'
  | 'held';

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

/** Faltet einen Winkel in den Bereich -π .. +π. */
function wrapPi(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
}

/**
 * Steuert genau einen Roboter: sein Physik-Körper, seine zwei Rad-Motoren,
 * die Reibungs-Berechnung, die Draht- und Stoß-Erkennung und die Autonomie.
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

  // Autonomie: Zustand + Restzeit + Drehung.
  private state: State = 'driving';
  private stateTimer = 0;
  private turnDir: 1 | -1 = 1;
  // Ziel-Kurs (absoluter Yaw-Winkel), auf den sich der Roboter dreht.
  private turnTargetYaw = 0;
  // Wird von außen gesetzt, wenn Rapier eine Kollision meldet (Stoßsensor).
  private bumped = false;

  // Akku-Stand 0..1 und der Andock-Punkt der Ladestation (Weltkoordinaten).
  private battery = 1;
  private readonly dockX: number;
  private readonly dockZ: number;

  // Spulen-Messung des aktuellen Schritts.
  private frontInside = true;
  private rearInside = true;
  private senseFrontX = 0;
  private senseFrontZ = 0;

  // Ziel-Position beim Ziehen (Weltkoordinaten auf y = 0).
  private dragX = 0;
  private dragZ = 0;

  // Wiederverwendete Hilfsobjekte — kein Müll pro Frame.
  private readonly _quat = new THREE.Quaternion();
  private readonly _fwd = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();

  constructor(
    world: RAPIER.World,
    view: THREE.Group,
    start: { x: number; z: number; yaw: number },
    dock: { x: number; z: number },
  ) {
    this.view = view;
    this.dockX = dock.x;
    this.dockZ = dock.z;
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
    // Kollisions-Gruppe: stößt an Hindernisse (Ästchen, später Haus/Baum),
    // ignoriert den Boden — die Rasen-Grenze ist der Draht, keine Wand.
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

  /** Akku-Stand 0..1. */
  get batteryLevel(): number {
    return this.battery;
  }

  /** Lädt der Roboter gerade an der Station? */
  get isCharging(): boolean {
    return this.state === 'charging';
  }

  /** Steht der Roboter still, weil er aus der Draht-Schleife entkommen ist? */
  get isStopped(): boolean {
    return this.state === 'stopped';
  }

  /** Wird der Roboter gerade gezogen? */
  get isHeld(): boolean {
    return this.state === 'held';
  }

  /** Grobe Tätigkeit für die UI-Anzeige (Stoßen/Drehen zählt als Mähen). */
  get activity(): RobotActivity {
    switch (this.state) {
      case 'charging':
        return 'charging';
      case 'seeking':
        return 'seeking';
      case 'stopped':
        return 'stopped';
      case 'held':
        return 'held';
      default:
        return 'mowing';
    }
  }

  /**
   * Ein fester Physik-Schritt: Sensoren lesen, Autonomie denken, Motoren
   * regeln, Reibungskräfte an den Rädern aufbringen. Direkt vor `world.step()`
   * aufrufen.
   */
  fixedUpdate(dt: number): void {
    // Beim Ziehen ist der Körper kinematisch und folgt nur dem Zeiger.
    if (this.state === 'held') {
      this.body.setNextKinematicTranslation({
        x: this.dragX,
        y: 0,
        z: this.dragZ,
      });
      return;
    }

    // Blickrichtung zuerst — Sensoren und Autonomie brauchen sie.
    const rot = this.body.rotation();
    this._quat.set(rot.x, rot.y, rot.z, rot.w);
    this._fwd.set(0, 0, 1).applyQuaternion(this._quat); // vorne
    this._right.set(1, 0, 0).applyQuaternion(this._quat); // rechts

    this.sense(); // Spulen-Sensoren lesen
    this.think(dt);
    this.rampMotors(dt);

    if (this.state === 'stopped') return; // Motoren aus -> keine Kräfte

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

  // — Ziehen ("drag and drop") ———————————————————————————————————————

  /**
   * Beginnt das Ziehen: Der Körper wird kinematisch (folgt nur noch dem
   * Zeiger), die Motoren werden abgeschaltet — wie ein angehobener echter
   * Mähroboter, dessen Hebe-Sensor die Räder stoppt.
   */
  beginDrag(): void {
    this.state = 'held';
    this.bumped = false;
    this.speedLeft = 0;
    this.speedRight = 0;
    this.targetLeft = 0;
    this.targetRight = 0;
    const p = this.body.translation();
    this.dragX = p.x;
    this.dragZ = p.z;
    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  }

  /** Setzt das Zieh-Ziel; bleibt auf dem Rasen-Slab (nie über die Kante). */
  dragTo(x: number, z: number): void {
    this.dragX = THREE.MathUtils.clamp(x, -DRAG_LIMIT_X, DRAG_LIMIT_X);
    this.dragZ = THREE.MathUtils.clamp(z, -DRAG_LIMIT_Z, DRAG_LIMIT_Z);
  }

  /**
   * Beendet das Ziehen: Der Körper wird wieder dynamisch, steht ohne Schwung
   * still und fährt von neuem los. Liegt das Absetz-Ziel im Rand-Streifen
   * jenseits des Drahts, erkennt das die vordere Spule und der Roboter fährt
   * von selbst wieder hinein.
   */
  endDrag(): void {
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.bumped = false;
    this.state = 'driving';
    this.stateTimer = 0;
    this.targetLeft = DRIVE.maxSpeed;
    this.targetRight = DRIVE.maxSpeed;
  }

  // — Sensoren ————————————————————————————————————————————————————————

  /**
   * Liest die beiden Spulen-Sensoren: Wo sind vordere und hintere Spule
   * (Weltkoordinaten) und liegt jede innerhalb der Draht-Schleife?
   */
  private sense(): void {
    const p = this.body.translation();
    this.senseFrontX = p.x + this._fwd.x * COIL_FRONT_Z;
    this.senseFrontZ = p.z + this._fwd.z * COIL_FRONT_Z;
    const rearX = p.x + this._fwd.x * COIL_REAR_Z;
    const rearZ = p.z + this._fwd.z * COIL_REAR_Z;
    this.frontInside = insideWire(this.senseFrontX, this.senseFrontZ);
    this.rearInside = insideWire(rearX, rearZ);
  }

  // — Autonomie: mähen, Draht/Stoß ausweichen, heimfahren und laden ——————
  private think(dt: number): void {
    if (this.state === 'stopped') return;

    // Akku: leert sich beim Fahren, lädt nur an der Station.
    if (this.state === 'charging') {
      this.battery = Math.min(1, this.battery + BATTERY.charge * dt);
    } else {
      this.battery = Math.max(0, this.battery - BATTERY.drain * dt);
    }

    const bumped = this.bumped;
    this.bumped = false;

    // Ein Stoß gegen ein Hindernis wirkt beim Mähen und beim Heimfahren.
    if ((this.state === 'driving' || this.state === 'seeking') && bumped) {
      this.startReaction(this.randomTurnTarget());
    }

    // Begrenzungsdraht — nur beim normalen Mähen prüfen. Beim Heimfahren darf
    // der Roboter den Draht überfahren (die Station steht an der Rasenkante).
    if (this.state === 'driving') {
      if (!this.frontInside && !this.rearInside) {
        // Beide Spulen draußen -> der ganze Roboter ist entkommen. Anhalten.
        this.enterStopped();
        return;
      }
      if (!this.frontInside) {
        // Vordere Spule hat den Draht überquert -> abkehren.
        this.startReaction(this.computeWireTurnTarget());
      }
    }

    // Akku niedrig -> heimfahren.
    if (this.state === 'driving' && this.battery <= BATTERY.low) {
      this.state = 'seeking';
    }

    this.stateTimer -= dt;

    switch (this.state) {
      case 'driving':
        // Beide Räder volles Tempo -> geradeaus.
        this.targetLeft = DRIVE.maxSpeed;
        this.targetRight = DRIVE.maxSpeed;
        break;

      case 'seeking':
        // Zur Ladestation lenken (dockt selbst an, wenn er da ist).
        this.steerToDock();
        break;

      case 'charging':
        // Stehen bleiben und laden.
        this.targetLeft = 0;
        this.targetRight = 0;
        if (this.battery >= BATTERY.full) {
          // Voll — rückwärts aus der Station heraus, dann weiterfahren.
          this.startReaction(this.randomTurnTarget());
        }
        break;

      case 'backing':
        // Ein Stück zurücksetzen, weg von Draht/Hindernis (oder Station).
        this.targetLeft = -DRIVE.reverseSpeed;
        this.targetRight = -DRIVE.reverseSpeed;
        if (this.stateTimer <= 0) this.state = 'turning';
        break;

      case 'turning': {
        // Auf der Stelle drehen, bis der Ziel-Kurs erreicht ist.
        const diff = wrapPi(this.turnTargetYaw - this.currentYaw());
        this.turnDir = diff >= 0 ? 1 : -1;
        this.targetLeft = DRIVE.turnSpeed * this.turnDir;
        this.targetRight = -DRIVE.turnSpeed * this.turnDir;
        if (Math.abs(diff) < TURN_DONE) {
          // Akku immer noch leer? Weiter heimfahren, sonst normal mähen.
          this.state = this.battery <= BATTERY.low ? 'seeking' : 'driving';
        }
        break;
      }
    }
  }

  /** Aktuelle Blickrichtung des Roboters als Yaw-Winkel (rad). */
  private currentYaw(): number {
    return Math.atan2(this._fwd.x, this._fwd.z);
  }

  /**
   * Startet die Ausweich-Reaktion: ein Stück zurücksetzen, danach auf den
   * übergebenen Ziel-Kurs drehen. Für Draht und Stoß dieselbe Bewegung —
   * nur der Ziel-Kurs wird verschieden berechnet.
   */
  private startReaction(turnTargetYaw: number): void {
    this.state = 'backing';
    this.stateTimer = DRIVE.backupTime;
    this.turnTargetYaw = turnTargetYaw;
  }

  /** Zufälliger Ziel-Kurs nach einem Stoß (oder beim Verlassen der Station). */
  private randomTurnTarget(): number {
    const amount = THREE.MathUtils.lerp(
      DRIVE.collisionTurnMin,
      DRIVE.collisionTurnMax,
      Math.random(),
    );
    const dir = Math.random() < 0.5 ? -1 : 1;
    return wrapPi(this.currentYaw() + dir * amount);
  }

  /**
   * Berechnet den Ziel-Kurs nach einer Draht-Überquerung.
   *
   * Der Kurs wird am Draht "gespiegelt" — wie bei einem echten Mähroboter,
   * der aus seinen Spulen den Einfallswinkel kennt: Ein steiler Anstoß
   * (fast senkrecht) ergibt eine große Drehung (fast Kehrtwende), ein
   * schräges Streifen nur eine kleine. Etwas Zufall kommt dazu, und am Ende
   * stellen wir sicher, dass der Roboter deutlich nach innen zeigt.
   */
  private computeWireTurnTarget(): number {
    // Welche Draht-Kante hat die vordere Spule überquert? Die Kante mit dem
    // größeren Überstand gewinnt (wichtig dicht an einer Ecke).
    const overX = Math.abs(this.senseFrontX) - WIRE.halfW;
    const overZ = Math.abs(this.senseFrontZ) - WIRE.halfD;
    let nOutX = 0; // nach außen zeigende Normale der Kante
    let nOutZ = 0;
    if (overX >= overZ) {
      nOutX = Math.sign(this.senseFrontX);
    } else {
      nOutZ = Math.sign(this.senseFrontZ);
    }

    // Kurs am Draht spiegeln (Reflexion an der Kanten-Linie).
    const fx = this._fwd.x;
    const fz = this._fwd.z;
    const dot = fx * nOutX + fz * nOutZ;
    const reflX = fx - 2 * dot * nOutX;
    const reflZ = fz - 2 * dot * nOutZ;
    let targetYaw = Math.atan2(reflX, reflZ);

    // Etwas Zufall, damit nie zweimal dieselbe Spur entsteht (zen).
    targetYaw += (Math.random() * 2 - 1) * DRIVE.wireTurnJitter;

    // Sicher nach innen: höchstens wireTurnMaxDeviation von "geradewegs nach
    // innen" abweichen -> der Roboter zeigt danach immer klar ins Feld.
    const inwardYaw = Math.atan2(-nOutX, -nOutZ);
    const dev = THREE.MathUtils.clamp(
      wrapPi(targetYaw - inwardYaw),
      -DRIVE.wireTurnMaxDeviation,
      DRIVE.wireTurnMaxDeviation,
    );
    return wrapPi(inwardYaw + dev);
  }

  /** Hält den Roboter an (aus der Draht-Schleife entkommen). */
  private enterStopped(): void {
    this.state = 'stopped';
    this.speedLeft = 0;
    this.speedRight = 0;
    this.targetLeft = 0;
    this.targetRight = 0;
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /**
   * Lenkt den Roboter zur Ladestation. Liegt das Ziel vorne, fährt er darauf
   * zu; liegt es seitlich oder hinten, dreht er sich erst hin. Ist er nah
   * genug, gilt er als angedockt und wechselt ins Laden.
   */
  private steerToDock(): void {
    const pos = this.body.translation();
    const dx = this.dockX - pos.x;
    const dz = this.dockZ - pos.z;

    if (Math.hypot(dx, dz) < DOCK_RADIUS) {
      this.state = 'charging';
      this.targetLeft = 0;
      this.targetRight = 0;
      return;
    }

    // Winkel zwischen Blickrichtung und Richtung zum Ziel (-pi..pi).
    const ahead = dx * this._fwd.x + dz * this._fwd.z;
    const side = this._fwd.x * dz - this._fwd.z * dx;
    const heading = Math.atan2(side, ahead);

    // Vorwärts nur, soweit das Ziel auch vorne liegt; sonst zum Ziel drehen.
    const forward = DRIVE.maxSpeed * Math.max(0, Math.cos(heading));
    const turn =
      THREE.MathUtils.clamp(heading * STEER_GAIN, -1, 1) * DRIVE.turnSpeed;
    this.targetLeft = forward - turn;
    this.targetRight = forward + turn;
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
