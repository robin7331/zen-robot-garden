import * as THREE from 'three';
import { SIZES, GRASS, FLOWERS } from './tokens';
import { heightAt } from './terrain';
import { createFlower, type FlowerMeshes } from './models/flower';

/**
 * Das Blumen-Feld — die paar Gänseblümchen, die über den Rasen gestreut sind.
 *
 * Wie bei einem echten Mähroboter-Garten: Blumen wachsen überall, aber wo der
 * Roboter mäht, kommen sie kaum zur Blüte. Nur im ungemähten Randstreifen
 * (zwischen Begrenzungsdraht und Rasenkante) blühen sie in Ruhe ganz auf.
 *
 * Jedes Gänseblümchen sitzt an einem FESTEN Platz (seed-fest gestreut, in
 * kleinen Gruppen) und durchläuft zwei Stufen: Keimling -> Blüte (bleibt dann
 * blühen). Fährt der MÄHENDE Roboter darüber, schrumpft es kurz zum Keimling
 * zurück und altert von vorn.
 *
 * Die Blumen sind reine Sicht-Modelle — KEINE Physik-Körper. Der Roboter mäht
 * durch sie hindurch, er stößt nicht an ihnen an.
 */

/**
 * Prüffunktion für blumen-freie Flächen: gibt true zurück, wenn am Welt-Punkt
 * (x, z) KEINE Blume stehen soll (z.B. unter der Ladestation).
 */
export type FlowerExclude = (x: number, z: number) => boolean;

/** Lebensphase einer Blume. */
type Stage = 'seedling' | 'bloom';

interface Flower {
  meshes: FlowerMeshes;
  x: number;
  z: number;
  /** Position längs der Windrichtung — Phase der Wieg-Welle. */
  along: number;
  /** Fester Phasenversatz, bricht die Welle leicht auf. */
  phase: number;
  stage: Stage;
  /** Sekunden in der aktuellen Stufe. */
  age: number;
  /** Läuft die Schrumpf-Animation nach dem Übermähen? */
  shrinking: boolean;
  /** Restzeit der Schrumpf-Animation (s). */
  shrinkTimer: number;
}

/** Mulberry32 — winziger, seed-fester Pseudo-Zufallsgenerator. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Windrichtung — dieselbe wie im Gras-Shader (grass.ts, WIND_DIR).
const WIND = new THREE.Vector2(0.85, 0.5).normalize();
// Wieg-Achse: waagerecht und quer zum Wind, damit die Blume LÄNGS des Windes
// kippt. Aus axis x WELT-OBEN = WIND folgt axis = (wind.z, 0, -wind.x).
const SWAY_AXIS = new THREE.Vector3(WIND.y, 0, -WIND.x).normalize();
const WAVE_FREQ = (Math.PI * 2) / FLOWERS.swayWaveLength;
// Gänseblümchen sitzen flach — sie wiegen sich nur dezent.
const SWAY_FACTOR = 0.4;

// Eine Blume gilt als gemäht, wenn sie unter die Schnitt-Scheibe des Roboters
// gerät — derselbe Radius (Kern + weicher Rand) wie beim Mäh-Gitter.
const MOW_RADIUS = GRASS.cutRadius + GRASS.cutFalloff;
const MOW_RADIUS2 = MOW_RADIUS * MOW_RADIUS;

/** Verwaltet alle Blumen: Aufbau, Lebenszyklus, Mähen, Wind. */
export class FlowerField {
  private readonly flowers: Flower[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    exclude: FlowerExclude = () => false,
  ) {
    const rand = mulberry32(FLOWERS.seed);

    // Streu-Inseln: ein paar Mittelpunkte, um die herum Blumen wachsen.
    const halfW = SIZES.lawnWidth / 2 - FLOWERS.edgeInset;
    const halfD = SIZES.lawnDepth / 2 - FLOWERS.edgeInset;
    const clusters: { x: number; z: number }[] = [];
    for (let k = 0; k < FLOWERS.clusterCount; k++) {
      clusters.push({
        x: (rand() * 2 - 1) * halfW,
        z: (rand() * 2 - 1) * halfD,
      });
    }

    for (let i = 0; i < FLOWERS.count; i++) {
      // Platz um eine zufällige Insel herum suchen (Sperrflächen meiden).
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 30; tries++) {
        const c = clusters[Math.floor(rand() * clusters.length)];
        const r = Math.sqrt(rand()) * FLOWERS.clusterRadius;
        const a = rand() * Math.PI * 2;
        x = c.x + Math.cos(a) * r;
        z = c.z + Math.sin(a) * r;
        const inLawn = Math.abs(x) <= halfW && Math.abs(z) <= halfD;
        if (inLawn && !exclude(x, z)) break;
      }

      const meshes = createFlower();
      meshes.group.position.set(x, heightAt(x, z), z);
      // Zufällige Drehung der Blüte — keine zwei sehen gleich aus.
      const yaw = rand() * Math.PI * 2;
      meshes.bloom.rotation.y = yaw;
      meshes.seedling.rotation.y = yaw;
      this.scene.add(meshes.group);

      // Etwa die Hälfte blüht schon — sonst altern beim Laden alle im Takt.
      const stage: Stage = rand() < 0.5 ? 'seedling' : 'bloom';
      const flower: Flower = {
        meshes,
        x,
        z,
        along: x * WIND.x + z * WIND.y,
        phase: rand() * Math.PI * 2,
        stage,
        age: stage === 'seedling' ? rand() * FLOWERS.seedlingTime : 0,
        shrinking: false,
        shrinkTimer: 0,
      };
      this.showStage(flower);
      this.flowers.push(flower);
    }
  }

  /** Blendet das zur aktuellen Stufe passende Mesh ein, das andere aus. */
  private showStage(f: Flower): void {
    f.meshes.seedling.visible = f.stage === 'seedling';
    f.meshes.bloom.visible = f.stage === 'bloom';
  }

  /**
   * Schreitet jede Blume voran: Mäh-Prüfung, Lebenszyklus, Wieg-Bewegung. Pro
   * gerendertem Bild aufrufen.
   *
   *   dt       — Bild-Zeitspanne (s)
   *   elapsed  — aufsummierte Spielzeit (s), für die Wieg-Welle
   *   robotX/Z — Roboter-Position
   *   mowing   — true, wenn die Klingen wirklich laufen
   */
  update(
    dt: number,
    elapsed: number,
    robotX: number,
    robotZ: number,
    mowing: boolean,
  ): void {
    for (const f of this.flowers) {
      // — Mähen: gerät die Blume unter die laufende Schnitt-Scheibe? ————
      if (mowing && !f.shrinking) {
        const dx = f.x - robotX;
        const dz = f.z - robotZ;
        if (dx * dx + dz * dz <= MOW_RADIUS2) this.mow(f);
      }

      if (f.shrinking) {
        this.advanceShrink(f, dt);
      } else {
        this.advanceLife(f, dt);
      }

      this.applySway(f, elapsed);
    }
  }

  /** Reaktion auf das Übermähen — Blume zurück Richtung Keimling. */
  private mow(f: Flower): void {
    if (f.stage === 'seedling') {
      // Schon ein Keimling — einfach wieder ganz jung machen, ohne Animation.
      f.age = 0;
      return;
    }
    // Blüte mähen -> sie schrumpft sichtbar zum Keimling zusammen.
    f.shrinking = true;
    f.shrinkTimer = FLOWERS.mowShrinkTime;
  }

  /** Schrumpf-Animation: die gemähte Blüte sinkt in sich zusammen. */
  private advanceShrink(f: Flower, dt: number): void {
    f.shrinkTimer -= dt;
    const k = Math.max(0, f.shrinkTimer / FLOWERS.mowShrinkTime);
    f.meshes.bloom.scale.setScalar(k);
    if (f.shrinkTimer <= 0) {
      // Fertig geschrumpft — wieder Keimling, Mesh-Skala zurücksetzen.
      f.meshes.bloom.scale.setScalar(1);
      f.shrinking = false;
      f.stage = 'seedling';
      f.age = 0;
      this.showStage(f);
    }
  }

  /** Normaler Lebenszyklus — Keimling reift zur Blüte, die dann bleibt. */
  private advanceLife(f: Flower, dt: number): void {
    if (f.stage !== 'seedling') return;
    f.age += dt;
    if (f.age >= FLOWERS.seedlingTime) {
      f.stage = 'bloom';
      f.age = 0;
      this.showStage(f);
    }
  }

  /** Kippt die Blume in der wandernden Wind-Welle um ihren Fuß. */
  private applySway(f: Flower, elapsed: number): void {
    const ph = elapsed * FLOWERS.swaySpeed - f.along * WAVE_FREQ + f.phase;
    const wave = Math.sin(ph) + 0.25 * Math.sin(ph * 2.3);
    const angle = wave * FLOWERS.swayStrength * SWAY_FACTOR;
    f.meshes.group.quaternion.setFromAxisAngle(SWAY_AXIS, angle);
  }
}
