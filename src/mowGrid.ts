import * as THREE from 'three';
import { COLORS, SIZES, GRASS, BLADES } from './tokens';

/**
 * Das Mäh-Gitter — die einzige sich verändernde Fläche im Garten.
 *
 * Über den Rasen legen wir ein unsichtbares Raster aus vielen kleinen
 * quadratischen Feldern. Jedes Feld merkt sich EINE Zahl: wie lang das Gras
 * dort ist — 0 = frisch gemäht, 1 = voll nachgewachsen.
 *
 *   - Fährt der Roboter über ein Feld, wird das Gras dort sofort auf 0
 *     gesetzt ("gemäht") — wie eine echte Klinge, die alles auf Deck-Höhe
 *     kappt, egal wie lang es vorher war.
 *   - Sonst wächst das Gras überall langsam und gleichmäßig nach. So ist der
 *     Roboter nie "fertig" — schön zen und endlos.
 *
 * Gezeigt wird die Grashöhe nur über die FARBE: vier Grün-Stufen von hell
 * (gemäht) bis dunkel (lang). Dazu malen wir das Gitter in eine DataTextur —
 * ein winziges Bild mit genau einem Pixel je Feld — und legen diese Textur
 * auf eine flache Ebene über den Rasen. NearestFilter hält die Pixel als
 * scharfe Quadrate, passend zum kantigen Origami-Look.
 *
 * Das Gitter ist reine 2D-Logik (X/Z) und unabhängig von der Geometrie —
 * darum übersteht es spätere Hügel unverändert: dann wird die Ebene nur
 * unterteilt und in der Höhe verschoben, die Textur "drapiert" einfach mit.
 */

// Feld-Anzahl, abgeleitet aus Rasen-Maß und Feld-Größe (8x6 m -> 80x60).
const CELLS_X = Math.round(SIZES.lawnWidth / GRASS.cellSize);
const CELLS_Z = Math.round(SIZES.lawnDepth / GRASS.cellSize);
const CELL_COUNT = CELLS_X * CELLS_Z;

/** Wandelt einen Hex-Farbstring '#rrggbb' in ein [r, g, b]-Byte-Tripel. */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Begrenzt einen Wert auf ein gültiges Farb-Byte 0..255. */
function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Farb-Rampe des Gitters: Index 0 = frisch gemäht (hell) ... 3 = voll
 * nachgewachsen (dunkel). Die Länge dieser Rampe ist zugleich die Zahl der
 * Anzeige-Stufen — mehr oder weniger Töne hier ändern sie automatisch mit.
 */
const RAMP: ReadonlyArray<[number, number, number]> = [
  hexToRgb(COLORS.grassMown),
  hexToRgb(COLORS.grassShort),
  hexToRgb(COLORS.grassMid),
  hexToRgb(COLORS.grass),
];
const STEPS = RAMP.length;

/**
 * Verwaltet ein Mäh-Gitter: den Höhen-Speicher, die Anzeige-Textur und die
 * flache Rasen-Ebene, die beides in die Szene bringt.
 */
export class MowGrid {
  /** Die sichtbare Rasen-Ebene mit der Mäh-Textur — kommt in die Szene. */
  readonly mesh: THREE.Mesh;

  // Grashöhe je Feld, 0..1. Index = cx + cz * CELLS_X.
  private readonly heights = new Float32Array(CELL_COUNT);
  // Plattgedrückt je Feld, 0..1. 1 = ganz platt (Roboter steht/stand drauf),
  // 0 = aufgerichtet. Klingt nach dem Drüberfahren über flattenRecoverTime ab.
  private readonly flatten = new Float32Array(CELL_COUNT);
  // Nachwachs-Tempo je Feld als Anteil pro Sekunde. Jedes Feld bekommt beim
  // Mähen ein eigenes, zufälliges Tempo (siehe randomRate) — so füllt sich die
  // Mähspur natürlich-ungleichmäßig auf statt überall exakt gleichzeitig.
  private readonly cellRate = new Float32Array(CELL_COUNT);
  // Pixel-Puffer der Farb-Textur (RGBA, genau ein Pixel je Feld).
  private readonly pixels = new Uint8Array(CELL_COUNT * 4);
  private readonly texture: THREE.DataTexture;
  // Pixel-Puffer der Höhen-Textur (2-Kanal RG, ein Pixel je Feld):
  // R = Grashöhe (heights), G = Plattgedrückt (flatten). Beide roh/stufenlos.
  private readonly heightPixels = new Uint8Array(CELL_COUNT * 2);
  private readonly heightTex: THREE.DataTexture;
  // Mittleres Nachwachs-Tempo als Anteil pro Sekunde (0 -> 1 in regrowTime).
  private readonly meanRate = 1 / GRASS.regrowTime;

  constructor() {
    // Start: der ganze Rasen ist voll nachgewachsen (Höhe 1). Jedes Feld
    // bekommt schon mal ein zufälliges Tempo für sein erstes Nachwachsen.
    this.heights.fill(1);
    for (let i = 0; i < CELL_COUNT; i++) {
      this.cellRate[i] = this.randomRate();
    }

    // DataTextur: ein Pixel je Feld. NearestFilter -> scharfe Quadrate statt
    // weichem Verlauf. Keine Mipmaps nötig (Textur wird nie verkleinert).
    this.texture = new THREE.DataTexture(
      this.pixels,
      CELLS_X,
      CELLS_Z,
      THREE.RGBAFormat,
    );
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;

    // Höhen-Textur: 2 Kanäle (R = Höhe, G = flatten), ein Pixel je Feld. Der
    // Gras-Shader liest sie je Halm — darum LinearFilter (weiche Übergänge
    // zwischen Feldern), nicht NearestFilter wie die kantige Farb-Ebene.
    this.heightTex = new THREE.DataTexture(
      this.heightPixels,
      CELLS_X,
      CELLS_Z,
      THREE.RGFormat,
      THREE.UnsignedByteType,
    );
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.generateMipmaps = false;

    this.redraw(); // Pixel-Puffer aus den Start-Höhen füllen

    // Flache Ebene genau über der Rasen-Oberseite (y = 0), hauchdünn
    // angehoben, damit sie nicht mit der Gras-Deckschicht flimmert. Sie ist
    // exakt so groß wie die Mäh-Fläche; der Gras-Lippen-Überstand des Slabs
    // bleibt sichtbar als ungemähter Rand.
    const geometry = new THREE.PlaneGeometry(SIZES.lawnWidth, SIZES.lawnDepth);
    geometry.rotateX(-Math.PI / 2); // aus der XY- in die XZ-Ebene kippen
    const material = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 1,
      metalness: 0,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'mowGrid';
    this.mesh.position.y = 0.002;
    this.mesh.receiveShadow = true; // Roboter-Schatten fällt auf die Mähspur
  }

  /**
   * Mäht alle Felder unter einer Scheibe vom Radius GRASS.cutRadius um den
   * Punkt (x, z): ihre Grashöhe wird sofort auf 0 gesetzt. Pro Bild aufrufen,
   * solange der Roboter wirklich mäht.
   */
  cutAt(x: number, z: number): void {
    const r = GRASS.cutRadius;
    const r2 = r * r;
    // Feld-Bereich, der die Scheibe knapp umschließt — nur den durchsuchen.
    const minCx = Math.max(0, this.cellX(x - r));
    const maxCx = Math.min(CELLS_X - 1, this.cellX(x + r));
    const minCz = Math.max(0, this.cellZ(z - r));
    const maxCz = Math.min(CELLS_Z - 1, this.cellZ(z + r));
    for (let cz = minCz; cz <= maxCz; cz++) {
      const dz = this.cellCenterZ(cz) - z;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const dx = this.cellCenterX(cx) - x;
        if (dx * dx + dz * dz <= r2) {
          const i = cx + cz * CELLS_X;
          this.heights[i] = 0;
          // Frisch gemäht -> neues Zufalls-Tempo für dieses Nachwachsen.
          this.cellRate[i] = this.randomRate();
        }
      }
    }
  }

  /** Die Höhen-Textur (R = Grashöhe, G = flatten) für den Gras-Shader. */
  get heightTexture(): THREE.Texture {
    return this.heightTex;
  }

  /**
   * Drückt alle Felder unter einer weichen Scheibe vom Radius
   * BLADES.flattenRadius um den Punkt (x, z) platt: ihr flatten-Wert steigt
   * Richtung 1 — in der Mitte ganz, zum Rand hin auslaufend. Pro Bild
   * aufrufen, solange der Roboter mit seinen Rädern auf dem Rasen steht.
   */
  flattenAt(x: number, z: number): void {
    const r = BLADES.flattenRadius;
    const r2 = r * r;
    const minCx = Math.max(0, this.cellX(x - r));
    const maxCx = Math.min(CELLS_X - 1, this.cellX(x + r));
    const minCz = Math.max(0, this.cellZ(z - r));
    const maxCz = Math.min(CELLS_Z - 1, this.cellZ(z + r));
    for (let cz = minCz; cz <= maxCz; cz++) {
      const dz = this.cellCenterZ(cz) - z;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const dx = this.cellCenterX(cx) - x;
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2) {
          // Weicher Stempel: Mitte 1, Rand 0 — der höhere Wert gewinnt.
          const v = 1 - d2 / r2;
          const i = cx + cz * CELLS_X;
          if (v > this.flatten[i]) this.flatten[i] = v;
        }
      }
    }
  }

  /**
   * Lässt das Gras nachwachsen — jedes Feld mit SEINEM eigenen Tempo — und
   * lässt plattgedrücktes Gras sich wieder aufrichten. Danach werden beide
   * Texturen neu gemalt. Einmal pro gerendertem Bild mit der Bild-Zeitspanne
   * aufrufen.
   */
  update(dt: number): void {
    // flatten klingt linear über flattenRecoverTime zurück auf 0 ab.
    const flattenDecay = dt / BLADES.flattenRecoverTime;
    for (let i = 0; i < CELL_COUNT; i++) {
      const h = this.heights[i] + this.cellRate[i] * dt;
      this.heights[i] = h < 1 ? h : 1; // bei voll nachgewachsen deckeln
      const f = this.flatten[i] - flattenDecay;
      this.flatten[i] = f > 0 ? f : 0; // bei aufgerichtet bei 0 deckeln
    }
    this.redraw();
  }

  /**
   * Würfelt ein Nachwachs-Tempo um den Schnitt meanRate herum aus. Die
   * Streuung steuert GRASS.regrowVariation: 0 -> immer der Schnitt, 0.6 ->
   * 0.4x .. 1.6x. So braucht jedes Feld unterschiedlich lang, bis es voll ist.
   */
  private randomRate(): number {
    const factor = 1 + (Math.random() * 2 - 1) * GRASS.regrowVariation;
    return this.meanRate * factor;
  }

  /**
   * Schreibt für jedes Feld die Stufen-Farbe in die Farb-Textur und die rohen
   * Höhen-/flatten-Werte in die Höhen-Textur. Beide Texturen nutzen dieselbe
   * Zeilen-Spiegelung, damit ihre UVs zum Roboter-Weltbild passen.
   *
   * Die Farb-Ebene scheint vor allem im kurzen Gras zwischen den Halmen durch.
   * Damit dort dieselben Mäh-Streifen sichtbar bleiben wie auf den Halmen,
   * bekommt jedes Feld denselben Streifen-Faktor wie der Gras-Shader
   * eingebacken — gleiche weltachsen-parallele Sinus-Bänder.
   */
  private redraw(): void {
    for (let cz = 0; cz < CELLS_Z; cz++) {
      // Textur-Zeile 0 liegt bei v = 0; nach dem Kippen der Ebene zeigt
      // v = 0 auf +Z. Darum die Zeilen spiegeln, damit Feld cz dort landet,
      // wo der Roboter es in der Welt gemäht hat.
      const row = CELLS_Z - 1 - cz;
      // Mäh-Streifen dieser Zeile — exakt die Formel des Gras-Shaders
      // (sin über Welt-Z), damit Boden-Ebene und Halme deckungsgleich streifen.
      const stripe = Math.sin(this.cellCenterZ(cz) * Math.PI / BLADES.stripeWidth);
      for (let cx = 0; cx < CELLS_X; cx++) {
        const i = cx + cz * CELLS_X;
        const h = this.heights[i];
        // Höhe 0..1 in eine Stufe 0..STEPS-1 quantisieren (gleiche Bänder).
        let step = Math.floor(h * STEPS);
        if (step > STEPS - 1) step = STEPS - 1; // Höhe genau 1 -> letzte Stufe
        const [r, g, b] = RAMP[step];
        // Streifen voll im kurzen Gras, im langen gedämpft (wie im Shader).
        const f = 1 + stripe * BLADES.stripeStrength * (1 - h * 0.6);
        const p = (cx + row * CELLS_X) * 4;
        this.pixels[p] = clampByte(r * f);
        this.pixels[p + 1] = clampByte(g * f);
        this.pixels[p + 2] = clampByte(b * f);
        this.pixels[p + 3] = 255;
        // Höhen-Textur: rohe Werte (0..1 -> 0..255), keine Quantisierung.
        const hp = (cx + row * CELLS_X) * 2;
        this.heightPixels[hp] = h * 255;
        this.heightPixels[hp + 1] = this.flatten[i] * 255;
      }
    }
    this.texture.needsUpdate = true;
    this.heightTex.needsUpdate = true;
  }

  /** Welt-X -> Feld-Spalte (kann außerhalb 0..CELLS_X-1 liegen). */
  private cellX(x: number): number {
    return Math.floor((x + SIZES.lawnWidth / 2) / GRASS.cellSize);
  }

  /** Welt-Z -> Feld-Zeile (kann außerhalb 0..CELLS_Z-1 liegen). */
  private cellZ(z: number): number {
    return Math.floor((z + SIZES.lawnDepth / 2) / GRASS.cellSize);
  }

  /** Welt-X der Mitte von Feld-Spalte cx. */
  private cellCenterX(cx: number): number {
    return (cx + 0.5) * GRASS.cellSize - SIZES.lawnWidth / 2;
  }

  /** Welt-Z der Mitte von Feld-Zeile cz. */
  private cellCenterZ(cz: number): number {
    return (cz + 0.5) * GRASS.cellSize - SIZES.lawnDepth / 2;
  }
}
