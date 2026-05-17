import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { SIZES, DRIVE, BATTERY, SUSPENSION, TERRAIN } from './tokens';
import { GROUP, collisionGroups } from './physics';
import { LEITDRAHT, insideWire } from './wire';
import { carrotTowardStart, signedDistanceToPolyline } from './polyline';
import { heightAt, microReliefAt, normalAt } from './terrain';
import type { RobotActivity } from './ui';

/**
 * Lässt den Roboter autonom fahren — und zwar wirklich über Reibung, jetzt als
 * **Raycast-Fahrzeug** auf dem 3D-Gelände.
 *
 * Der Roboter ist EIN Physik-Quader, der das Gelände aber NICHT mehr berührt
 * (die Kollisions-Gruppe schließt den Boden aus). Statt dessen schwebt er auf
 * vier abgetasteten Rad-Punkten:
 *
 *   - Vier Rad-Anker am Körper-Quader (untere Ecken). Hinten links/rechts sind
 *     die **Antriebsräder**, vorn an der Nase die **Lenkrollen** (Caster).
 *   - Je Rad wird die Geländehöhe rechnerisch mit `heightAt` abgetastet. Eine
 *     Feder drückt den Körper dort nach oben, je nach Einfederung (plus
 *     Dämpfung). Weil die vier Räder verschieden tief einfedern, neigt sich
 *     der Körper von selbst in Nick- und Rollachse.
 *   - Die Antriebsräder bekommen zusätzlich das Schlupf-Reibungs-Modell — aber
 *     in der **Tangentialebene des Geländes** statt in der flachen XZ-Ebene.
 *   - Die Lenkrollen liefern NUR Federkraft, keine Horizontalkraft — wie eine
 *     echte, frei schwenkende Caster-Rolle. So bleibt das Lenken zu 100 %
 *     Sache des Differentialantriebs.
 *
 * Der Körper hat volle 6 Freiheitsgrade; die Schwerkraft wirkt. Klettern
 * entsteht so geschenkt aus der Physik: bergauf bremst der Hangabtrieb,
 * bergab beschleunigt er. Übersteigt der Hangabtrieb die verfügbare Reibung,
 * rutscht der Roboter — automatisch.
 *
 * Die Grenz-Erkennung über die zwei Spulen-Sensoren und das Heimfahren über
 * den Leitdraht bleiben **reines 2D** (X/Z) — das Gelände ändert nur die Höhe.
 *
 * == Wie der Roboter die Grenze erkennt ==
 *
 * Zwei Spulen-Sensoren (vorne/hinten) "spüren", ob sie INNERHALB des
 * Begrenzungsdrahts sind:
 *   - Vordere Spule draußen -> die Nase hat den Draht überquert ->
 *     zurücksetzen + zufällig drehen, genau wie nach einem Stoß. Eine echte
 *     Drahtspule liefert nur "innen/draußen", keine Richtung — der Roboter
 *     kann also nicht gezielt nach innen lenken, sondern verlässt sich wie
 *     ein echter Mähroboter auf den Zufall (und kreuzt an Ecken auch mal
 *     mehrmals kurz hintereinander).
 *   - Beide Spulen draußen -> der ganze Roboter ist heraus -> anhalten.
 *
 * == Wie der Roboter heimfindet (der Leitdraht) ==
 *
 * Bei niedrigem Akku schaltet er auf `seeking` (Klingen aus), fährt geradeaus
 * weiter, bis seine vordere Spule den Leitdraht überquert, und folgt ihm dann
 * per Pure-Pursuit heim zur Ladestation.
 */

// — Roboter-Körper als Physik-Quader ————————————————————————————————
const BODY_HALF = {
  x: SIZES.robotWidth / 2,
  y: SIZES.robotHeight / 2,
  z: SIZES.robotLength / 2,
};
const ROBOT_MASS = 8; // kg — ungefähr wie ein echter Mähroboter

// — Rad-Anordnung (lokal zum Roboter; Ursprung am Boden, mittig) ——————————
// Notnagel-Rad-Radius — der echte Wert kommt pro Rad aus dem GLB-Mesh
// (createRobot, userData.radius); dieser greift nur, falls er einmal fehlt.
const WHEEL_RADIUS = SIZES.wheelDiameter / 2;
const TRACK_HALF = SIZES.robotWidth / 2; // halber Abstand der beiden Räder
const WHEEL_Z = -0.06; // Antriebsräder sitzen leicht hinter der Mitte
const CASTER_Z = SIZES.robotLength / 2 - 0.04; // Lenkrollen nahe der Nase

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

// — Sicht-Räder ————————————————————————————————————————————————————
// Das Rad-Mesh rollt im Normalfall sauber mit dem Boden mit — beim Bremsen
// und Drehen also OHNE künstlichen Schlupf. Sichtbar durchdrehen soll es nur,
// wenn die Schlupf-Geschwindigkeit (Motortempo gegen echtes Bodentempo) groß
// wird: beim Stoß gegen ein Hindernis (Körper steht, Motor läuft weiter) und
// später bei nassem oder zu steilem Gras. Zwischen LOW und HIGH blendet der
// gezeigte Schlupf weich ein.
const SLIP_SHOW_LOW = 0.12; // m/s — darunter rollt das Rad sauber mit
const SLIP_SHOW_HIGH = 0.4; // m/s — darüber dreht es frei mit Motortempo durch
const WHEEL_SPIN_SMOOTH = 0.06; // s — Glättungs-Zeitkonstante des Sicht-Tempos

// — Heimfahren ————————————————————————————————————————————————————
const STEER_GAIN = 1.6; // wie kräftig der Roboter zu seinem Ziel einlenkt
// So nah am Dock rastet der Roboter ein. Klein gehalten, damit das Einrasten
// nicht als Sprung auffällt — der Roboter fährt fast ganz heran und schnappt
// erst auf den letzten Zentimetern in die Andock-Pose.
const DOCK_RADIUS = 0.05;

// — Drehen ————————————————————————————————————————————————————————
const TURN_DONE = 0.1; // rad — so nah am Ziel-Kurs gilt eine Drehung als fertig

// — Klettern ——————————————————————————————————————————————————————
// Sinus der Maximalsteigung — bei voller Bergauf-Fahrt zeigt die Roboter-Nase
// um diesen Y-Anteil nach oben; daran wird der Akku-Mehrverbrauch skaliert.
const SIN_MAX_SLOPE = Math.sin((TERRAIN.maxSlopeDeg * Math.PI) / 180);

// Beim Ziehen schwebt der Roboter knapp über dem Gelände ("in der Hand
// getragen") und folgt waagerecht der Geländehöhe.
const DRAG_HOVER = 0.06; // m über dem Gelände

// Beim Ziehen darf der Roboter nur so weit, dass sein Körper ganz über dem
// Rasen bleibt (nie über die Kante in die Leere).
const DRAG_LIMIT_X = SIZES.lawnWidth / 2 - SIZES.robotLength / 2;
const DRAG_LIMIT_Z = SIZES.lawnDepth / 2 - SIZES.robotLength / 2;

/**
 * Was der Roboter gerade tut.
 *   driving   — geradeaus mähen
 *   seeking   — Akku niedrig, fährt geradeaus und sucht den Leitdraht
 *   following — folgt dem gefundenen Leitdraht heim zur Station
 *   charging  — steht angedockt (eingerastet, eingefroren) und lädt
 *   backing   — nach Draht/Stoß ein Stück zurücksetzen
 *   turning   — danach auf den Ziel-Kurs drehen
 *   undockBack  — nach dem Laden weit rückwärts aus der Station (Messer aus)
 *   undockPause — danach kurz still stehen; dann geht das Messer an
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
  | 'undockBack'
  | 'undockPause'
  | 'dead'
  | 'stopped'
  | 'held';

/** Erzeugt eine Quaternion für eine reine Drehung um die Hochachse (Y). */
function yawQuat(yaw: number): RAPIER.Rotation {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

// Notnagel-Dreh-Achse, falls ein Rad keine in createRobot bestimmte
// `spinAxis` mitbringt (dann eben blind die lokale X-Achse).
const _fallbackSpinAxis = new THREE.Vector3(1, 0, 0);

/** Die in createRobot bestimmte Achs-Achse eines Rad-Knotens (lokal). */
function wheelSpinAxis(wheel: THREE.Object3D): THREE.Vector3 {
  return (wheel.userData.spinAxis as THREE.Vector3) ?? _fallbackSpinAxis;
}

// Wiederverwendete Hilfsobjekte für `terrainPose` — kein Müll pro Aufruf.
const _poseUp = new THREE.Vector3();
const _poseFwd = new THREE.Vector3();
const _poseRight = new THREE.Vector3();
const _poseMat = new THREE.Matrix4();
const _poseQuat = new THREE.Quaternion();

/**
 * Pose auf dem Gelände: Position auf der Geländehöhe (+ Ruhe-Federweg) und
 * eine Drehung, die den Roboter mit `yaw` ausrichtet UND seine Hochachse auf
 * die Gelände-Normale neigt. Für die Spawn-Pose und das Andock-Einrasten.
 */
function terrainPose(
  x: number,
  z: number,
  yaw: number,
): { pos: RAPIER.Vector; rot: RAPIER.Rotation } {
  _poseUp.copy(normalAt(x, z));
  // Flache Blickrichtung aus dem Yaw, auf die Tangentialebene projiziert.
  _poseFwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  _poseFwd.addScaledVector(_poseUp, -_poseFwd.dot(_poseUp)).normalize();
  _poseRight.crossVectors(_poseUp, _poseFwd).normalize();
  _poseMat.makeBasis(_poseRight, _poseUp, _poseFwd);
  _poseQuat.setFromRotationMatrix(_poseMat);
  return {
    pos: { x, y: heightAt(x, z) + SUSPENSION.restLength, z },
    rot: { x: _poseQuat.x, y: _poseQuat.y, z: _poseQuat.z, w: _poseQuat.w },
  };
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

/** Weiche 0..1-Blende: 0 bei x<=a, 1 bei x>=b, glatt dazwischen. */
function smoothstep(a: number, b: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Steuert genau einen Roboter: sein Physik-Körper, seine zwei Rad-Motoren,
 * die Rad-Federung, die Reibungs-Berechnung, die Draht- und Stoß-Erkennung
 * und die Autonomie.
 */
export class RobotController {
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly view: THREE.Group;

  // Sicht-Teile, die sich beim Fahren mitdrehen.
  private readonly wheelLeftMesh: THREE.Object3D | null;
  private readonly wheelRightMesh: THREE.Object3D | null;
  private readonly bladeMesh: THREE.Object3D | null;
  // Rad-Radien aus dem GLB-Mesh (createRobot) — für die Mesh-Drehrate v / r.
  private readonly wheelRadiusLeft: number;
  private readonly wheelRadiusRight: number;

  // Motor-Tempo der beiden Räder (Boden-Tempo in m/s).
  private speedLeft = 0;
  private speedRight = 0;
  // Wunsch-Tempo, das die Autonomie gerade vorgibt.
  private targetLeft: number = DRIVE.maxSpeed;
  private targetRight: number = DRIVE.maxSpeed;

  // Sicht-Rad-Tempo (m/s): die Abroll-Geschwindigkeit, mit der sich das
  // Rad-Mesh dreht. Rollt mit dem Boden mit; bei großem Schlupf blendet es auf
  // das freie Motortempo über (siehe applyWheel). `dispSpeed*` ist die noch
  // weich geglättete Anzeige davon (gegen Physik-Zappeln).
  private wheelSurfaceLeft = 0;
  private wheelSurfaceRight = 0;
  private dispSpeedLeft = 0;
  private dispSpeedRight = 0;

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

  // Messer-Anlauf nach dem Ausfahren aus der Station: Der Roboter dreht und
  // fährt erst ein Stück, bevor das Mäh-Messer angeht.
  //   undockBladeArm — true während der Ausfahrt-Drehung (Messer noch aus)
  //   bladeDelay     — Restzeit der Anlauf-Fahrt im 'driving' (Messer noch aus)
  private undockBladeArm = false;
  private bladeDelay = 0;

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

  // Ziel-Position + Kurs beim Ziehen (Weltkoordinaten XZ, fester Yaw).
  private dragX = 0;
  private dragZ = 0;
  private dragYaw = 0;

  // Eingefrorene Andock-Pose, solange der Roboter lädt (kinematisch).
  private frozenPos: RAPIER.Vector = { x: 0, y: 0, z: 0 };
  private frozenRot: RAPIER.Rotation = { x: 0, y: 0, z: 0, w: 1 };

  // Wiederverwendete Hilfsobjekte — kein Müll pro Frame.
  private readonly _quat = new THREE.Quaternion();
  private readonly _fwd = new THREE.Vector3();
  private readonly _r = new THREE.Vector3();
  private readonly _ft = new THREE.Vector3();
  private readonly _lt = new THREE.Vector3();

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
    this.wheelRadiusLeft =
      (this.wheelLeftMesh?.userData.radius as number) ?? WHEEL_RADIUS;
    this.wheelRadiusRight =
      (this.wheelRightMesh?.userData.radius as number) ?? WHEEL_RADIUS;

    // Dynamischer Körper mit vollen 6 Freiheitsgraden — er kann jetzt
    // klettern, sich neigen und (auf einem Steilhang) sogar kippen. Etwas
    // Winkel-Dämpfung, damit nichts zappelt. Auf der Geländehöhe und in den
    // Hang geneigt gestartet, damit nichts einfedert/aufschlägt.
    const spawn = terrainPose(start.x, start.z, start.yaw);
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.pos.x, spawn.pos.y, spawn.pos.z)
      .setRotation(spawn.rot)
      .setLinearDamping(0.2) // winziger Luftwiderstand für ruhigen Lauf
      .setAngularDamping(0.8);
    this.body = world.createRigidBody(bodyDesc);

    // Quader-Collider, vom Boden-Ursprung um die halbe Höhe nach oben gesetzt.
    // COLLISION_EVENTS = der "Stoßsensor": Rapier meldet jedes Anstoßen.
    // Kollisions-Gruppe: stößt an Hindernisse (Ästchen, später Haus/Baum),
    // ignoriert das Gelände — der Roboter schwebt auf seiner Rad-Federung.
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

    // Der Roboter startet ANGEDOCKT in der Ladestation: voller Akku, Körper
    // kinematisch in der Andock-Pose eingefroren. Schon der erste think()-
    // Schritt sieht den vollen Akku und fährt ihn rückwärts aus der Station
    // heraus — genau wie nach einem normalen Ladevorgang.
    this.state = 'charging';
    this.battery = 1;
    this.frozenPos = spawn.pos;
    this.frozenRot = spawn.rot;
    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);

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
   * Fahren — auch beim Zurücksetzen und Drehen am Begrenzungsdraht. Nicht
   * gemäht wird auf der Heimfahrt (dort kehrt eine Ausweich-Reaktion in
   * 'seeking' zurück statt in 'driving') und beim Verlassen der Station
   * inklusive der Anlauf-Fahrt, bis das Messer angeht ('leaving').
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
      case 'undockBack':
      case 'undockPause':
        return 'leaving';
      case 'backing':
      case 'turning':
        // Die Ausfahrt-Drehung gehört noch zum Verlassen der Station.
        if (this.undockBladeArm) return 'leaving';
        return this.resumeState === 'driving' ? 'mowing' : 'seeking';
      default:
        // driving — bis das Messer nach dem Anlauf angeht, mäht er noch nicht.
        return this.bladeDelay > 0 ? 'leaving' : 'mowing';
    }
  }

  /**
   * Ein fester Physik-Schritt: Sensoren lesen, Autonomie denken, Motoren
   * regeln, Rad-Federung + Reibungskräfte aufbringen. Direkt vor `world.step()`
   * aufrufen.
   */
  fixedUpdate(dt: number): void {
    // Beim Ziehen ist der Körper kinematisch: er schwebt waagerecht knapp
    // über dem Gelände und folgt nur dem Zeiger (in der Hand getragen).
    if (this.state === 'held') {
      this.body.setNextKinematicTranslation({
        x: this.dragX,
        y: heightAt(this.dragX, this.dragZ) + DRAG_HOVER,
        z: this.dragZ,
      });
      this.body.setNextKinematicRotation(yawQuat(this.dragYaw));
      return;
    }

    // Blickrichtung zuerst — Sensoren und Autonomie brauchen sie.
    const rot = this.body.rotation();
    this._quat.set(rot.x, rot.y, rot.z, rot.w);
    this._fwd.set(0, 0, 1).applyQuaternion(this._quat); // vorne

    this.sense(); // Spulen-Sensoren lesen
    this.think(dt);
    this.rampMotors(dt);

    // Beim Laden bleibt der Körper in der Andock-Pose eingefroren (kinematisch)
    // — das hält ihn am Hang fest und lässt das Wiederbeleben sauber einrasten.
    if (this.state === 'charging') {
      this.body.setNextKinematicTranslation(this.frozenPos);
      this.body.setNextKinematicRotation(this.frozenRot);
      return;
    }

    // Rad-Federung an allen vier Rädern — sie hält den Körper auf dem Gelände
    // (auch im Stillstand). Nur die Antriebsräder bekommen zusätzlich Schub.
    this.wheelSurfaceLeft =
      this.applyWheel(-TRACK_HALF, WHEEL_Z, true, this.speedLeft, dt) ??
      this.wheelSurfaceLeft;
    this.wheelSurfaceRight =
      this.applyWheel(TRACK_HALF, WHEEL_Z, true, this.speedRight, dt) ??
      this.wheelSurfaceRight;
    this.applyWheel(-TRACK_HALF, CASTER_Z, false, 0, dt);
    this.applyWheel(TRACK_HALF, CASTER_Z, false, 0, dt);
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

    // Räder drehen sich, weil sie über den Boden abrollen: Drehrate = Sicht-
    // Tempo / Radradius. Das Sicht-Tempo ist die echte Bodengeschwindigkeit
    // des Rades (also kein künstlicher Schlupf beim Bremsen/Drehen) und
    // blendet nur bei echtem Schlupf auf das Motortempo über (applyWheel).
    // Hier wird es noch weich geglättet, damit Physik-Zappeln nicht
    // durchschlägt. Gedreht wird um die echte Achs-Achse des Rad-Knotens
    // (spinAxis aus createRobot) — nicht blind um die lokale X-Achse.
    const k = 1 - Math.exp(-frameDt / WHEEL_SPIN_SMOOTH);
    this.dispSpeedLeft += (this.wheelSurfaceLeft - this.dispSpeedLeft) * k;
    this.dispSpeedRight += (this.wheelSurfaceRight - this.dispSpeedRight) * k;
    if (this.wheelLeftMesh) {
      this.wheelLeftMesh.rotateOnAxis(
        wheelSpinAxis(this.wheelLeftMesh),
        (this.dispSpeedLeft / this.wheelRadiusLeft) * frameDt,
      );
    }
    if (this.wheelRightMesh) {
      this.wheelRightMesh.rotateOnAxis(
        wheelSpinAxis(this.wheelRightMesh),
        (this.dispSpeedRight / this.wheelRadiusRight) * frameDt,
      );
    }
    // Mähklinge dreht nur, wenn der Roboter wirklich mäht.
    if (this.bladeMesh && this.bladesOn()) {
      this.bladeMesh.rotation.y += BLADE_SPIN * frameDt;
    }
  }

  /**
   * Mäht der Roboter gerade? Klingen an beim Fahren und beim Zurücksetzen/
   * Drehen am Draht — Drehen mäht also mit. Aus bleiben sie auf der Heimfahrt
   * (die Reaktion kehrt in 'seeking' zurück, nicht in 'driving') und beim
   * Ausfahren aus der Station: undockBack/undockPause fallen durch auf false,
   * die Ausfahrt-Drehung deckt `undockBladeArm` ab, und auch die ersten
   * `bladeStartDelay` Sekunden Fahrt danach (bladeDelay > 0) bleibt das
   * Messer noch aus — es geht erst nach kurzer Anlauf-Fahrt an.
   */
  private bladesOn(): boolean {
    if (this.undockBladeArm || this.bladeDelay > 0) return false;
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
    this.wheelSurfaceLeft = 0;
    this.wheelSurfaceRight = 0;
    const p = this.body.translation();
    this.dragX = p.x;
    this.dragZ = p.z;
    // Waagerecht halten: aktuellen Yaw aus der Rotation behalten.
    const r = this.body.rotation();
    this._quat.set(r.x, r.y, r.z, r.w);
    this._fwd.set(0, 0, 1).applyQuaternion(this._quat);
    this.dragYaw = Math.atan2(this._fwd.x, this._fwd.z);
    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  }

  /** Setzt das Zieh-Ziel (XZ); bleibt über dem Rasen (nie über die Kante). */
  dragTo(x: number, z: number): void {
    this.dragX = THREE.MathUtils.clamp(x, -DRAG_LIMIT_X, DRAG_LIMIT_X);
    this.dragZ = THREE.MathUtils.clamp(z, -DRAG_LIMIT_Z, DRAG_LIMIT_Z);
  }

  /**
   * Beendet das Ziehen. Wo der Roboter abgesetzt wird, entscheidet, wie es
   * weitergeht:
   *   - nah genug an der Station (dockDropRadius)  -> andocken und laden
   *   - sonst, mit leerem Akku                     -> bleibt liegen ('dead')
   *   - sonst                                      -> fährt normal weiter
   * Beim Loslassen wird der Körper wieder dynamisch; die Rad-Federung setzt
   * ihn ab und neigt ihn in den Hang.
   */
  endDrag(): void {
    const p = this.body.translation();
    const nearDock =
      Math.hypot(this.dockX - p.x, this.dockZ - p.z) < DRIVE.dockDropRadius;

    this.bumped = false;
    this.stateTimer = 0;
    this.speedLeft = 0;
    this.speedRight = 0;

    if (nearDock) {
      // An der Station abgesetzt -> einrasten und laden (rettet auch 'dead').
      this.enterCharging();
      return;
    }

    // Sonst dynamisch absetzen — die Federung fängt ihn auf.
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    if (this.battery <= 0) {
      this.enterDead();
    } else {
      this.state = 'driving';
      this.targetLeft = DRIVE.maxSpeed;
      this.targetRight = DRIVE.maxSpeed;
    }
  }

  // — Sensoren ————————————————————————————————————————————————————————

  /**
   * Liest die Sensoren: die beiden Spulen am Begrenzungsdraht und die
   * Vorzeichen-Distanz der vorderen Spule zum Leitdraht. Alles reines 2D
   * (X/Z) — das Gelände ändert nur die Höhe, nie die Draht-Logik.
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
      // Das Mäh-Messer ist der große Stromfresser: läuft es nicht (Heimfahrt
      // zum Leitdraht, Ausfahren aus der Station), zieht der Roboter nur den
      // Bruchteil bladeOffFactor des normalen Verbrauchs.
      const drain = this.bladesOn()
        ? BATTERY.drain
        : BATTERY.drain * BATTERY.bladeOffFactor;
      this.battery = Math.max(0, this.battery - drain * dt);
      // Mehr-Verbrauch bergauf: zeigt die Nase nach oben und treiben die
      // Motoren vorwärts, zieht der Roboter unter Last zusätzlich Strom.
      const fwdMotor = (this.speedLeft + this.speedRight) / 2;
      if (fwdMotor > 0 && this._fwd.y > 0) {
        const climbFrac = Math.min(1, this._fwd.y / SIN_MAX_SLOPE);
        this.battery = Math.max(
          0,
          this.battery - BATTERY.climbDrain * climbFrac * dt,
        );
      }
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
      this.startReaction(
        this.randomTurnTarget(DRIVE.collisionTurnMin, DRIVE.collisionTurnMax),
        resume,
      );
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
        // Vordere Spule hat den Draht überquert -> zurücksetzen + zufällig
        // drehen, wie nach einem Stoß — aber mit kleinerem Winkel-Bereich,
        // damit er sich am Draht sanft korrigiert statt komplett umzudrehen.
        this.startReaction(
          this.randomTurnTarget(DRIVE.wireTurnMin, DRIVE.wireTurnMax),
          this.state,
        );
      }
    }

    // Akku niedrig -> heimfahren: Klingen aus, Leitdraht suchen.
    if (this.state === 'driving' && this.battery <= BATTERY.low) {
      this.state = 'seeking';
    }

    this.stateTimer -= dt;
    // Anlauf-Fahrt nach dem Ausfahren: Restzeit bis das Messer angeht.
    if (this.bladeDelay > 0) this.bladeDelay -= dt;

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
          this.enterCharging();
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
        // Eingerastet stehen und laden. Voll -> dynamisch werden und ins
        // Ausfahren wechseln (undockBack). Gilt auch für den Szenenstart:
        // der Roboter startet angedockt mit vollem Akku und fährt so heraus.
        this.targetLeft = 0;
        this.targetRight = 0;
        if (this.battery >= BATTERY.full) {
          this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
          this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          this.state = 'undockBack';
          this.stateTimer = DRIVE.undockBackupTime;
        }
        break;

      case 'undockBack':
        // Weit rückwärts aus der Station heraus auf den Rasen — das Messer
        // bleibt dabei aus (bladesOn deckt undockBack nicht). Am Ende NICHT
        // hart stoppen: nur das Wunsch-Tempo auf 0 setzen, dann rollt der
        // Roboter über rampMotors + Rad-Reibung sanft aus (kein zeroMotors).
        if (this.stateTimer <= 0) {
          this.targetLeft = 0;
          this.targetRight = 0;
          this.state = 'undockPause';
          this.stateTimer = DRIVE.undockPauseTime;
        } else {
          this.targetLeft = -DRIVE.reverseSpeed;
          this.targetRight = -DRIVE.reverseSpeed;
        }
        break;

      case 'undockPause':
        // Wie ein echter Mähroboter: kurz still stehen. Ist die Pause vorbei,
        // dreht er in einen Zufallskurs Richtung Abfahrt — das Messer bleibt
        // dabei noch aus (undockBladeArm) und geht erst nach der Anlauf-Fahrt
        // im 'driving' an.
        this.targetLeft = 0;
        this.targetRight = 0;
        if (this.stateTimer <= 0) {
          this.turnTargetYaw = this.randomTurnTarget(
            DRIVE.collisionTurnMin,
            DRIVE.collisionTurnMax,
          );
          this.resumeState = 'driving';
          this.undockBladeArm = true;
          this.state = 'turning';
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
          this.state = this.resumeState;
          // War das die Ausfahrt-Drehung? Dann jetzt losfahren — das Messer
          // geht aber erst nach bladeStartDelay Sekunden Anlauf-Fahrt an.
          if (this.undockBladeArm) {
            this.undockBladeArm = false;
            this.bladeDelay = DRIVE.bladeStartDelay;
          }
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
   * übergebenen Ziel-Kurs drehen und in `resume` zurückkehren. Für Draht und
   * Stoß dieselbe Bewegung — nur Ziel-Kurs und Folge-Zustand sind verschieden.
   */
  private startReaction(turnTargetYaw: number, resume: State): void {
    this.state = 'backing';
    this.stateTimer = DRIVE.backupTime;
    this.turnTargetYaw = turnTargetYaw;
    this.resumeState = resume;
  }

  /**
   * Zufälliger Ziel-Kurs relativ zum aktuellen Kurs — verwendet nach einem
   * Stoß, nach einer Begrenzungsdraht-Überquerung und beim Verlassen der
   * Station. Wie bei einem echten Mähroboter ist die Drehung reiner Zufall;
   * sie zeigt nicht zwingend ins Feld zurück. Der Winkel-Bereich (min..max)
   * ist je Anlass anders — am Draht kleiner, damit er nicht überdreht.
   */
  private randomTurnTarget(min: number, max: number): number {
    const amount = THREE.MathUtils.lerp(min, max, Math.random());
    const dir = Math.random() < 0.5 ? -1 : 1;
    return wrapPi(this.currentYaw() + dir * amount);
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

  /**
   * Rastet den Roboter in der Andock-Pose ein und friert ihn dort kinematisch
   * fest, bis der Akku voll ist. Das hält ihn am Hang sicher (bei 20° hielte
   * die Reibung sonst nur knapp) und lässt das Wiederbeleben sauber einrasten.
   */
  private enterCharging(): void {
    this.state = 'charging';
    this.zeroMotors();
    // Auf die Andock-Pose schnappen: Position am Dock, in den Hang geneigt.
    const r = this.body.rotation();
    this._quat.set(r.x, r.y, r.z, r.w);
    this._fwd.set(0, 0, 1).applyQuaternion(this._quat);
    const yaw = Math.atan2(this._fwd.x, this._fwd.z);
    const pose = terrainPose(this.dockX, this.dockZ, yaw);
    this.frozenPos = pose.pos;
    this.frozenRot = pose.rot;
    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  }

  /** Schaltet die Motoren ab und nimmt dem Körper allen Schwung. */
  private zeroMotors(): void {
    this.speedLeft = 0;
    this.speedRight = 0;
    this.targetLeft = 0;
    this.targetRight = 0;
    this.wheelSurfaceLeft = 0;
    this.wheelSurfaceRight = 0;
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /**
   * Lenkt den Roboter auf einen Ziel-Punkt zu. Liegt das Ziel vorne, fährt er
   * darauf zu; liegt es seitlich oder hinten, dreht er sich erst hin. Rein 2D
   * (XZ) — die Blickrichtung wird auf die Bodenebene projiziert.
   */
  private steerTo(targetX: number, targetZ: number): void {
    const pos = this.body.translation();
    const dx = targetX - pos.x;
    const dz = targetZ - pos.z;

    // Winkel zwischen Blickrichtung (XZ) und Richtung zum Ziel (-π..π).
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
   * Ein abgetastetes Rad: Geländehöhe am Rad-XZ ermitteln, eine Feder den
   * Körper dort nach oben drücken lassen (plus Dämpfung) und — bei den
   * Antriebsrädern — die Schlupf-Reibung in der Tangentialebene des Geländes
   * aufbringen. Die Lenkrollen bekommen NUR die Federkraft.
   *
   * @param localX     X-Position des Rades im Roboter (-/+ TRACK_HALF)
   * @param localZ     Z-Position des Rades im Roboter (Antrieb hinten / Caster vorn)
   * @param drive      true = Antriebsrad (mit Reibung), false = Lenkrolle
   * @param motorSpeed Wunsch-Abrolltempo des Rad-Motors (m/s)
   * @param dt         Physik-Schrittweite (s)
   * @returns Sicht-Abrolltempo des Rades (m/s) für die Mesh-Drehung; bei
   *          Lenkrollen `null` (die drehen sich im Sicht-Modell nicht mit).
   */
  private applyWheel(
    localX: number,
    localZ: number,
    drive: boolean,
    motorSpeed: number,
    dt: number,
  ): number | null {
    // Welt-Versatz vom Körper-Mittelpunkt zum Rad-Anker (lokal y = 0).
    this._r.set(localX, 0, localZ).applyQuaternion(this._quat);
    const pos = this.body.translation();
    const wx = pos.x + this._r.x;
    const wy = pos.y + this._r.y;
    const wz = pos.z + this._r.z;

    // Geschwindigkeit des Körpers am Rad-Anker: v = linvel + omega × r.
    const lin = this.body.linvel();
    const ang = this.body.angvel();
    const vx = lin.x + (ang.y * this._r.z - ang.z * this._r.y);
    const vy = lin.y + (ang.z * this._r.x - ang.x * this._r.z);
    const vz = lin.z + (ang.x * this._r.y - ang.y * this._r.x);

    // — Federung: drückt den Körper (nahezu senkrecht) nach oben ——————————
    // Die Geländehöhe bekommt zusätzlich das feine Mikro-Relief aufaddiert —
    // kleine Beulen und Mulden, die nur die Räder spüren. Weil die vier Räder
    // verschieden hohe Stellen abtasten, wippt der Körper davon natürlich.
    const groundY = heightAt(wx, wz) + microReliefAt(wx, wz);
    const currentLength = wy - groundY; // Anker-Höhe über dem Gelände
    const compression = SUSPENSION.restLength - currentLength;
    if (compression > 0) {
      let f = SUSPENSION.stiffness * compression - SUSPENSION.damping * vy;
      if (f < 0) f = 0;
      if (f > SUSPENSION.maxForce) f = SUSPENSION.maxForce;
      this.body.applyImpulseAtPoint(
        { x: 0, y: f * dt, z: 0 },
        { x: wx, y: wy, z: wz },
        true,
      );
    }

    if (!drive) return null; // Lenkrollen: keine Horizontalkraft

    // Hängt das Rad weit in der Luft (über einer Kuppe), greift es nicht — es
    // dreht dann frei mit dem Motortempo weiter.
    if (currentLength > SUSPENSION.restLength + 0.08) return motorSpeed;

    // — Schlupf-Reibung in der Tangentialebene des Geländes ————————————————
    const n = normalAt(wx, wz);
    // Vorwärts-Richtung des Rades auf die Hang-Ebene projiziert.
    this._ft.copy(this._fwd).addScaledVector(n, -this._fwd.dot(n));
    if (this._ft.lengthSq() < 1e-6) return motorSpeed;
    this._ft.normalize();
    // Querrichtung in der Hang-Ebene.
    this._lt.crossVectors(n, this._ft).normalize();

    const vForward = vx * this._ft.x + vy * this._ft.y + vz * this._ft.z;
    const vLateral = vx * this._lt.x + vy * this._lt.y + vz * this._lt.z;

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

    // Kraft -> Impuls (Kraft × Zeit), am Rad-Anker aufgebracht.
    this.body.applyImpulseAtPoint(
      {
        x: (this._ft.x * fForward + this._lt.x * fLateral) * dt,
        y: (this._ft.y * fForward + this._lt.y * fLateral) * dt,
        z: (this._ft.z * fForward + this._lt.z * fLateral) * dt,
      },
      { x: wx, y: wy, z: wz },
      true,
    );

    // — Sicht-Abrolltempo: wie schnell sich das Rad-Mesh drehen soll ————————
    // Normalfall: das Rad rollt sauber mit dem Boden mit (vForward) — beim
    // Bremsen und Drehen also ohne künstlichen Schlupf. Erst wenn die
    // Schlupf-Geschwindigkeit groß wird (Stoß: Körper steht, Motor läuft
    // weiter; später nasses/zu steiles Gras), blendet es weich auf das frei
    // durchdrehende Motortempo über.
    const slipVel = motorSpeed - vForward;
    const showSlip = smoothstep(
      SLIP_SHOW_LOW,
      SLIP_SHOW_HIGH,
      Math.abs(slipVel),
    );
    return vForward + slipVel * showSlip;
  }
}
