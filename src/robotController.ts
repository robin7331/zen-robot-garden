import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { SIZES, DRIVE, BATTERY } from './tokens';
import { GROUP, collisionGroups } from './physics';
import { BOUNDARY, LEITDRAHT, insideWire } from './wire';
import {
  carrotTowardStart,
  outwardNormal,
  signedDistanceToPolyline,
} from './polyline';
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
 *     überquert -> der Roboter setzt zurück und dreht vom Draht weg.
 *   - Beide Spulen draußen -> der ganze Roboter ist aus der Schleife heraus.
 *     Dann hält er an (wie ein echter Mähroboter, der seine Grenze verliert).
 *
 * == Wie der Roboter heimfindet (der Leitdraht) ==
 *
 * Ist der Akku niedrig, schaltet der Roboter auf `seeking`: Klingen aus, er
 * fährt geradeaus weiter (am Begrenzungsdraht prallt er weiter ab) — bis
 * seine vordere Spule den *Leitdraht* überquert. Den erkennt er am Vorzeichen-
 * Wechsel der Distanz zur Leitdraht-Polylinie. Dann folgt er dem Leitdraht
 * per Pure-Pursuit (Vorausschau-Punkt) heim zur Ladestation. Es gibt also
 * keinen "geschummelten" Direktkurs mehr — der Roboter muss den Draht
 * physisch finden und ihm folgen.
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

// — Heimfahren ————————————————————————————————————————————————————
const STEER_GAIN = 1.6; // wie kräftig der Roboter zu seinem Ziel einlenkt
const DOCK_RADIUS = 0.18; // so nah an der Station gilt der Roboter als angedockt

// — Drehen ————————————————————————————————————————————————————————
const TURN_DONE = 0.1; // rad — so nah am Ziel-Kurs gilt eine Drehung als fertig

// Beim Ziehen darf der Roboter nur so weit, dass sein Körper ganz auf dem
// Rasen-Slab bleibt (nie über die Kante in die Leere).
const DRAG_LIMIT_X = SIZES.lawnWidth / 2 - SIZES.robotLength / 2;
const DRAG_LIMIT_Z = SIZES.lawnDepth / 2 - SIZES.robotLength / 2;

/**
 * Was der Roboter gerade tut.
 *   driving   — geradeaus mähen
 *   seeking   — Akku niedrig, fährt geradeaus und sucht den Leitdraht
 *   following — folgt dem gefundenen Leitdraht heim zur Station
 *   charging  — steht angedockt und lädt
 *   backing   — nach Draht/Stoß (oder vom Laden) ein Stück zurücksetzen
 *   turning   — danach auf den Ziel-Kurs drehen
 *   dead      — Akku komplett leer, alles steht still
 *   stopped   — angehalten, weil aus der Draht-Schleife entkommen
 *   held      — wird gerade mit dem Zeiger gezogen
 */
type State =
  | 'driving'
  | 'seeking'
  | 'following'
  | 'charging'
  | 'backing'
  | 'turning'
  | 'dead'
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
  // Material der Status-LED — an solange lebendig, aus bei 'dead'.
  private readonly ledMat: THREE.MeshStandardMaterial | null;

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
  // Zustand, in den `turning` nach Abschluss zurückkehrt.
  private resumeState: State = 'driving';
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
  // Vorzeichen-Distanz der vorderen Spule zum Leitdraht (für die Erkennung).
  private leitDist: number | null = null;
  private leitCrossed = false;

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
    const ledMesh = view.getObjectByName('statusLed') as THREE.Mesh | undefined;
    this.ledMat =
      (ledMesh?.material as THREE.MeshStandardMaterial | undefined) ?? null;

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

  /**
   * Grobe Tätigkeit für UI-Anzeige und Mäh-Gitter. Der Roboter mäht beim
   * Fahren — auch beim Zurücksetzen und Drehen am Begrenzungsdraht. Allein
   * auf der Heimfahrt mäht er gar nicht (weder geradeaus noch in der Kurve):
   * dort kehrt eine Ausweich-Reaktion in 'seeking' zurück statt in 'driving'.
   */
  get activity(): RobotActivity {
    switch (this.state) {
      case 'charging':
        return 'charging';
      case 'seeking':
        return 'seeking';
      case 'following':
        return 'following';
      case 'dead':
        return 'dead';
      case 'stopped':
        return 'stopped';
      case 'held':
        return 'held';
      case 'backing':
      case 'turning':
        return this.resumeState === 'driving' ? 'mowing' : 'seeking';
      default:
        return 'mowing'; // driving
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

    // Tot oder angehalten -> Motoren aus, keine Kräfte.
    if (this.state === 'stopped' || this.state === 'dead') return;

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
    // Die Rad-Achse zeigt im GLB-Modell entlang der lokalen Z-Achse des Rad-
    // Objekts — darum dreht hier `rotation.z`. Vorzeichen rein optisch.
    if (this.wheelLeftMesh) {
      this.wheelLeftMesh.rotation.z += (this.speedLeft / WHEEL_RADIUS) * frameDt;
    }
    if (this.wheelRightMesh) {
      this.wheelRightMesh.rotation.z +=
        (this.speedRight / WHEEL_RADIUS) * frameDt;
    }
    // Mähklinge dreht nur, wenn der Roboter wirklich mäht. Sie hängt am
    // Zustand, nicht am Tempo: `seeking`/`following` fahren genauso schnell
    // wie `driving`, mähen aber nicht.
    if (this.bladeMesh && this.bladesOn()) {
      this.bladeMesh.rotation.y += BLADE_SPIN * frameDt;
    }
    // Status-LED: leuchtet stetig, solange der Roboter lebt; aus bei 'dead'.
    if (this.ledMat) {
      this.ledMat.emissiveIntensity = this.state === 'dead' ? 0 : 1;
    }
  }

  /**
   * Mäht der Roboter gerade? Klingen an beim Fahren und beim Zurücksetzen/
   * Drehen am Draht — Drehen mäht also mit. Nur auf der Heimfahrt bleiben sie
   * ganz aus (die Reaktion kehrt in 'seeking' zurück, nicht in 'driving').
   */
  private bladesOn(): boolean {
    if (this.state === 'driving') return true;
    if (this.state === 'backing' || this.state === 'turning') {
      return this.resumeState === 'driving';
    }
    return false;
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
   * Beendet das Ziehen: Der Körper wird wieder dynamisch und steht ohne
   * Schwung still. Wo der Roboter abgesetzt wird, entscheidet, wie es
   * weitergeht:
   *   - nah genug an der Station (dockDropRadius)  -> andocken und laden
   *   - sonst, mit leerem Akku                     -> bleibt liegen ('dead')
   *   - sonst                                      -> fährt normal weiter
   */
  endDrag(): void {
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.bumped = false;
    this.stateTimer = 0;
    this.speedLeft = 0;
    this.speedRight = 0;

    const p = this.body.translation();
    const nearDock =
      Math.hypot(this.dockX - p.x, this.dockZ - p.z) < DRIVE.dockDropRadius;

    if (nearDock) {
      // An der Station abgesetzt -> andocken und laden (rettet auch 'dead').
      this.state = 'charging';
      this.targetLeft = 0;
      this.targetRight = 0;
    } else if (this.battery <= 0) {
      // Leerer Akku, nicht auf dem Dock -> bleibt tot liegen.
      this.enterDead();
    } else {
      // Sonst ganz normal weitermähen.
      this.state = 'driving';
      this.targetLeft = DRIVE.maxSpeed;
      this.targetRight = DRIVE.maxSpeed;
    }
  }

  // — Sensoren ————————————————————————————————————————————————————————

  /**
   * Liest die Sensoren: die beiden Spulen am Begrenzungsdraht und die
   * Vorzeichen-Distanz der vorderen Spule zum Leitdraht. Ein Vorzeichen-
   * Wechsel dort heißt: die Nase hat den Leitdraht überquert.
   */
  private sense(): void {
    const p = this.body.translation();
    this.senseFrontX = p.x + this._fwd.x * COIL_FRONT_Z;
    this.senseFrontZ = p.z + this._fwd.z * COIL_FRONT_Z;
    const rearX = p.x + this._fwd.x * COIL_REAR_Z;
    const rearZ = p.z + this._fwd.z * COIL_REAR_Z;
    this.frontInside = insideWire(this.senseFrontX, this.senseFrontZ);
    this.rearInside = insideWire(rearX, rearZ);

    // Leitdraht: Vorzeichen-Distanz der vorderen Spule. Wechselt es, hat die
    // Nase den Draht überquert (ausgewertet nur in `seeking`).
    const d = signedDistanceToPolyline(
      LEITDRAHT,
      this.senseFrontX,
      this.senseFrontZ,
    );
    this.leitCrossed =
      this.leitDist !== null &&
      this.leitDist !== 0 &&
      d !== 0 &&
      Math.sign(d) !== Math.sign(this.leitDist);
    this.leitDist = d;
  }

  // — Autonomie: mähen, Draht/Stoß ausweichen, heimfahren, laden ——————————
  private think(dt: number): void {
    // Tot oder angehalten: nichts denken. ('dead' lässt sich nur durch Ziehen
    // auf das Dock beleben, 'stopped' durch Zurückziehen auf den Rasen.)
    if (this.state === 'stopped' || this.state === 'dead') return;

    // Akku: leert sich im Betrieb, lädt nur an der Station.
    if (this.state === 'charging') {
      this.battery = Math.min(1, this.battery + BATTERY.charge * dt);
    } else {
      this.battery = Math.max(0, this.battery - BATTERY.drain * dt);
      if (this.battery <= 0) {
        // Akku komplett leer -> kompletter Stillstand.
        this.enterDead();
        return;
      }
    }

    const bumped = this.bumped;
    this.bumped = false;

    // Leitdraht gefunden? Nur beim Heimfahren (seeking) zählt das. Vor der
    // Begrenzungsdraht-Prüfung, damit das Andocken Vorrang hat, wenn der
    // Leitdraht nahe seiner Y-Verzweigung gekreuzt wird.
    if (this.state === 'seeking' && this.leitCrossed) {
      this.state = 'following';
    }

    // Stoß gegen ein Hindernis: beim Mähen, Heimfahren und Folgen.
    if (
      (this.state === 'driving' ||
        this.state === 'seeking' ||
        this.state === 'following') &&
      bumped
    ) {
      // Beim Folgen danach den Leitdraht neu suchen, sonst weiter wie bisher.
      const resume: State = this.state === 'following' ? 'seeking' : this.state;
      this.startReaction(this.randomTurnTarget(), resume);
    }

    // Begrenzungsdraht — beim Mähen UND Heimfahren prüfen, NICHT beim Folgen
    // (dort kennt der Roboter nur den Leitdraht).
    if (this.state === 'driving' || this.state === 'seeking') {
      if (!this.frontInside && !this.rearInside) {
        // Beide Spulen draußen -> der ganze Roboter ist entkommen. Anhalten.
        this.enterStopped();
        return;
      }
      if (!this.frontInside) {
        // Vordere Spule hat den Draht überquert -> abkehren.
        this.startReaction(this.computeWireTurnTarget(), this.state);
      }
    }

    // Akku niedrig -> heimfahren: Klingen aus, Leitdraht suchen.
    if (this.state === 'driving' && this.battery <= BATTERY.low) {
      this.state = 'seeking';
    }

    this.stateTimer -= dt;

    switch (this.state) {
      case 'driving':
      case 'seeking':
        // Motorisch identisch: beide Räder volles Tempo -> geradeaus. Der
        // Unterschied ist nur Klingen-aus + Leitdraht-Erkennung in `seeking`.
        this.targetLeft = DRIVE.maxSpeed;
        this.targetRight = DRIVE.maxSpeed;
        break;

      case 'following': {
        // Pure-Pursuit: auf einen Vorausschau-Punkt entlang des Leitdrahts
        // Richtung Dock zulenken. Ist der Roboter nah genug am Dock, dockt er
        // an und lädt.
        const pos = this.body.translation();
        const dock = LEITDRAHT.nails[0]; // nail[0] = Dock
        if (Math.hypot(dock.x - pos.x, dock.z - pos.z) < DOCK_RADIUS) {
          this.state = 'charging';
          this.targetLeft = 0;
          this.targetRight = 0;
          break;
        }
        const carrot = carrotTowardStart(
          LEITDRAHT,
          pos.x,
          pos.z,
          DRIVE.followLookahead,
        );
        this.steerTo(carrot.x, carrot.z);
        break;
      }

      case 'charging':
        // Stehen bleiben und laden.
        this.targetLeft = 0;
        this.targetRight = 0;
        if (this.battery >= BATTERY.full) {
          // Voll — rückwärts aus der Station heraus, dann weitermähen.
          this.startReaction(this.randomTurnTarget(), 'driving');
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
        if (Math.abs(diff) < TURN_DONE) this.state = this.resumeState;
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
   * übergebenen Ziel-Kurs drehen und in `resume` zurückkehren. Für Draht und
   * Stoß dieselbe Bewegung — nur Ziel-Kurs und Folge-Zustand sind verschieden.
   */
  private startReaction(turnTargetYaw: number, resume: State): void {
    this.state = 'backing';
    this.stateTimer = DRIVE.backupTime;
    this.turnTargetYaw = turnTargetYaw;
    this.resumeState = resume;
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
   * Ziel-Kurs nach einer Begrenzungsdraht-Überquerung.
   *
   * Wie ein echter Mähroboter: kein berechneter Abprall, sondern ein
   * zufälliger neuer Kurs. Der einzige Zwang ist, dass der Roboter wieder
   * ins Feld zeigen muss — darum streut der Zufall nur um "geradewegs nach
   * innen" herum (± wireTurnSpread).
   */
  private computeWireTurnTarget(): number {
    // Nach-innen zeigende Richtung am überquerten Draht-Segment.
    const n = outwardNormal(BOUNDARY, this.senseFrontX, this.senseFrontZ);
    const inwardYaw = Math.atan2(-n.x, -n.z);
    // Zufällige Abweichung davon, begrenzt -> der Roboter zeigt klar ins Feld.
    const dev = (Math.random() * 2 - 1) * DRIVE.wireTurnSpread;
    return wrapPi(inwardYaw + dev);
  }

  /** Hält den Roboter an (aus der Draht-Schleife entkommen). */
  private enterStopped(): void {
    this.state = 'stopped';
    this.zeroMotors();
  }

  /** Lässt den Roboter tot liegen (Akku komplett leer). */
  private enterDead(): void {
    this.state = 'dead';
    this.zeroMotors();
  }

  /** Schaltet die Motoren ab und nimmt dem Körper allen Schwung. */
  private zeroMotors(): void {
    this.speedLeft = 0;
    this.speedRight = 0;
    this.targetLeft = 0;
    this.targetRight = 0;
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /**
   * Lenkt den Roboter auf einen Ziel-Punkt zu. Liegt das Ziel vorne, fährt er
   * darauf zu; liegt es seitlich oder hinten, dreht er sich erst hin.
   */
  private steerTo(targetX: number, targetZ: number): void {
    const pos = this.body.translation();
    const dx = targetX - pos.x;
    const dz = targetZ - pos.z;

    // Winkel zwischen Blickrichtung und Richtung zum Ziel (-π..π).
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
