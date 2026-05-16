import * as THREE from 'three';
import { COLORS, SIZES, BLADES } from './tokens';
import { terrainHeightTexture } from './terrain';
import type { MowGrid } from './mowGrid';

/**
 * Echtes 3D-Gras — viele kleine instanzierte Halme über dem Mäh-Gitter.
 *
 * Statt die Grashöhe nur über die FARBE einer flachen Ebene zu zeigen
 * (mowGrid.ts), stellen wir hier echte Halme auf: viele tausend winzige
 * Dreiecke je Quadratmeter, alle aus EINER Geometrie instanziert. Höhe,
 * Biegung und Plattdrücken liest der Shader pro Halm direkt aus der Höhen-
 * Textur des Gitters — JavaScript macht pro Bild KEINE Arbeit je Halm.
 *
 *   - Gemähtes Gras ist kurz (bleibt ein kurzer Stummel, nie kahl).
 *   - Wo der Roboter steht, klappen die Halme platt; sie richten sich danach
 *     langsam wieder auf (flatten-Kanal des Gitters).
 *   - Eine langsame Wind-Welle lässt die Spitzen wehen.
 *
 * Die alte Farb-Ebene bleibt darunter erhalten: sie scheint zwischen den
 * Halmen durch und trägt weiterhin die Schatten. Die Halme selbst werfen und
 * empfangen keine Schatten (12k fadendünne Halme ergäben nur Rauschen).
 */

// Halm-Anzahl, abgeleitet aus Dichte und Rasen-Maß (6500/m² * 8*6 m -> 312000).
const BLADE_COUNT = Math.round(BLADES.density * SIZES.lawnWidth * SIZES.lawnDepth);

/** Formatiert eine Zahl als GLSL-Float-Literal (immer mit Dezimalpunkt). */
function glslFloat(n: number): string {
  return n.toFixed(5);
}

/** Achsenparalleles Welt-Rechteck (XZ) — eine Fläche ohne Gras. */
export type GrassExclusion = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/** Liegt der Punkt (x, z) in einer der Sperrflächen? */
function isExcluded(
  x: number,
  z: number,
  exclusions: ReadonlyArray<GrassExclusion>,
): boolean {
  for (const r of exclusions) {
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
      return true;
    }
  }
  return false;
}

/**
 * Baut die Halm-Geometrie: ein sich nach oben verjüngendes Dreieck mit 3
 * senkrechten Segmenten (4 Höhen-Ebenen, 7 Vertices, 5 Dreiecke) — die
 * Segmente sind nötig, damit sich der Halm im Shader biegen kann.
 *
 * Im `position`-Attribut steht x = Breite (m), y = Höhen-Anteil 0..1 entlang
 * des Halms (NICHT Meter — der Shader skaliert ihn je Halm). Dazu die drei
 * Instanz-Attribute aOffset / aRotation / aRandom.
 *
 * `exclusions` sind Welt-Rechtecke ohne Gras (z.B. unter der Ladestation):
 * Halme, die dort landen würden, werden neu gewürfelt.
 */
function makeBladeGeometry(
  exclusions: ReadonlyArray<GrassExclusion>,
): THREE.InstancedBufferGeometry {
  const halfBase = BLADES.baseWidth / 2;
  const fr = [0, 1 / 3, 2 / 3, 1]; // Höhen-Anteile der vier Ebenen
  // Halbe Breite je Ebene: unten voll, läuft nach oben auf 0 (Spitze) zu.
  const hw = fr.map((f) => halfBase * (1 - f));

  // 7 Vertices: je 2 an den unteren drei Ebenen, 1 an der Spitze.
  const positions = new Float32Array([
    -hw[0], fr[0], 0, // 0 unten links
    hw[0], fr[0], 0, // 1 unten rechts
    -hw[1], fr[1], 0, // 2
    hw[1], fr[1], 0, // 3
    -hw[2], fr[2], 0, // 4
    hw[2], fr[2], 0, // 5
    0, fr[3], 0, // 6 Spitze
  ]);
  // 5 Dreiecke: zwei Quads (untere Segmente) + ein Dreieck (zur Spitze).
  const index = [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 6];

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);

  // Instanz-Attribute: einmal zufällig gestreut, danach unverändert.
  const offsets = new Float32Array(BLADE_COUNT * 2); // XZ-Position
  const rotations = new Float32Array(BLADE_COUNT); // Drehung um Y
  const randoms = new Float32Array(BLADE_COUNT * 3); // Wind-Phase, Höhe, Farbton
  for (let i = 0; i < BLADE_COUNT; i++) {
    // Gleichmäßig zufällig über das volle Rasen-Rechteck (keine Büschel).
    // Fällt ein Halm in eine Sperrfläche, wird seine Position neu gewürfelt.
    let x: number;
    let z: number;
    do {
      x = (Math.random() - 0.5) * SIZES.lawnWidth;
      z = (Math.random() - 0.5) * SIZES.lawnDepth;
    } while (isExcluded(x, z, exclusions));
    offsets[i * 2] = x;
    offsets[i * 2 + 1] = z;
    rotations[i] = Math.random() * Math.PI * 2;
    randoms[i * 3] = Math.random(); // Wind-Phase
    randoms[i * 3 + 1] = Math.random(); // Höhen-Zufall je Halm
    randoms[i * 3 + 2] = Math.random(); // Farbton-Streuung
  }
  geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geometry.setAttribute('aRotation', new THREE.InstancedBufferAttribute(rotations, 1));
  geometry.setAttribute('aRandom', new THREE.InstancedBufferAttribute(randoms, 3));
  geometry.instanceCount = BLADE_COUNT;
  return geometry;
}

/**
 * Vertex-Shader: liest Höhe und flatten aus der Gitter-Textur, baut daraus die
 * Halm-Höhe, klappt den Halm beim Plattdrücken um und lässt ihn im Wind wehen.
 */
const VERTEX_SHADER = /* glsl */ `
  attribute vec2 aOffset;
  attribute float aRotation;
  attribute vec3 aRandom;

  uniform sampler2D uHeightTex;
  uniform sampler2D uTerrainTex;
  uniform float uTime;

  varying float vFrac;
  varying float vCellHeight;
  varying float vHue;
  varying float vStripe;

  const float GEO_HEIGHT = ${glslFloat(BLADES.height)};
  const float STUB_MIN = ${glslFloat(BLADES.stubMin)};
  const float WIND_SPEED = ${glslFloat(BLADES.windSpeed)};
  const float WIND_STRENGTH = ${glslFloat(BLADES.windStrength)};
  const float STRIPE_WIDTH = ${glslFloat(BLADES.stripeWidth)};
  const vec2 LAWN = vec2(${glslFloat(SIZES.lawnWidth)}, ${glslFloat(SIZES.lawnDepth)});
  const vec2 WIND_DIR = normalize(vec2(0.85, 0.5));
  const float TAU = 6.28318530;
  const float PI = 3.14159265;

  void main() {
    float frac = position.y;            // 0..1 entlang des Halms
    vFrac = frac;

    // Gitter-Textur am Fuß des Halms abtasten — UV genau wie die Farb-Ebene.
    vec2 uv = vec2(
      (aOffset.x + LAWN.x * 0.5) / LAWN.x,
      (LAWN.y * 0.5 - aOffset.y) / LAWN.y
    );
    vec2 cell = texture2D(uHeightTex, uv).rg;
    float cellHeight = cell.r;          // Grashöhe 0..1
    float flatten = cell.g;             // plattgedrückt 0..1
    vCellHeight = cellHeight;
    vHue = aRandom.z;

    // Mäh-Streifen: weiche, weltachsen-parallele Sinus-Bänder quer über den
    // Rasen. Pro Halm EIN Wert, am Halm-Fuß ausgewertet — der ganze Halm
    // trägt denselben Streifen. -1 = dunkles Band, +1 = helles Band.
    vStripe = sin(aOffset.y * (PI / STRIPE_WIDTH));

    // Halm-Höhe: Geo-Höhe x Halm-Zufall x Gitter-Höhe. mix(STUB_MIN, 1) sorgt
    // dafür, dass frisch gemäht ein kurzer Stummel bleibt — nie kahl. Die
    // breite Zufalls-Spanne macht die Teppich-Oberkante zottelig.
    float perBlade = mix(0.7, 1.2, aRandom.y);
    float bladeHeight = GEO_HEIGHT * perBlade * mix(STUB_MIN, 1.0, cellHeight);

    // Halm-lokal: x = Breite, y = Höhe, z = eingebaute Vor-Neigung. Jeder Halm
    // biegt sich unterschiedlich stark nach vorn — so wirkt der dichte Teppich
    // zottelig statt wie gekämmt.
    vec3 local = vec3(position.x, frac * bladeHeight, 0.0);
    local.z += (0.18 + 0.16 * aRandom.x) * frac * frac * bladeHeight;

    // Plattdrücken: der Halm klappt um seinen Fuß Richtung Boden (Drehung um
    // die lokale X-Achse). Keine gespeicherte Richtung — ein Rad drückt
    // gerade nach unten, echte Mäh-Spuren SIND einfach plattes Gras.
    float fold = flatten * 1.45;        // bis ~83 Grad
    float cf = cos(fold), sf = sin(fold);
    local = vec3(local.x, local.y * cf - local.z * sf, local.y * sf + local.z * cf);

    // Um Y drehen (zufällige Halm-Ausrichtung) und an die XZ-Position setzen.
    float cr = cos(aRotation), sr = sin(aRotation);
    vec3 world = vec3(
      local.x * cr - local.z * sr + aOffset.x,
      max(local.y, 0.0),
      local.x * sr + local.z * cr + aOffset.y
    );

    // Wind: eine langsame Sinus-Welle, globale Richtung + Halm-Phase. Biegung
    // proportional frac^2 — der Fuß bleibt verankert, die Spitze wandert am
    // weitesten. Stummel und plattgedrücktes Gras wehen kaum.
    float phase = uTime * WIND_SPEED + aRandom.x * TAU;
    float sway = sin(phase) + 0.25 * sin(phase * 2.3);
    float windAmp = WIND_STRENGTH * bladeHeight * (1.0 - flatten);
    world.xz += WIND_DIR * sway * windAmp * frac * frac;

    // Geländehöhe am Halm-Fuß abtasten und den ganzen Halm darauf heben — so
    // wächst das Gras auf den Hügeln statt durch sie hindurch. Der Roboter-
    // Schatten und die Mäh-Logik bleiben davon unberührt (reines 2D).
    float terrainH = texture2D(uTerrainTex, vec2(
      (aOffset.x + LAWN.x * 0.5) / LAWN.x,
      (aOffset.y + LAWN.y * 0.5) / LAWN.y
    )).r;
    world.y += terrainH;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

/**
 * Fragment-Shader: Grundfarbe nach Grashöhe, Tiefen-Verlauf (dunkler Fuß,
 * helle Spitze), Mäh-Streifen und Farbton-Streuung. Beleuchtung ist ein
 * konstanter Term (Licht-Normale = Welt-Oben) — gleichmäßig beleuchtete Fläche.
 */
const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uGrassMown;
  uniform vec3 uGrassFull;
  uniform vec3 uSun;
  uniform vec3 uAmbient;

  varying float vFrac;
  varying float vCellHeight;
  varying float vHue;
  varying float vStripe;

  const float STRIPE_STRENGTH = ${glslFloat(BLADES.stripeStrength)};

  void main() {
    // Grundfarbe: kurz/gemäht hell-limettengrün, lang satt-dunkelgrün.
    vec3 base = mix(uGrassMown, uGrassFull, vCellHeight);
    // Tiefen-Verlauf: Fuß dunkel (Selbst-Verschattung tief im dichten Teppich),
    // Spitze hell — das gibt dem Gras Volumen und einen weichen Fell-Look.
    base *= mix(0.48, 1.05, vFrac);
    // Kleine Farbton-Streuung je Halm.
    base *= mix(0.90, 1.10, vHue);
    // Mäh-Streifen: helle/dunkle Bänder. Volle Wirkung im kurzen (gemähten)
    // Gras, im langen Gras stark gedämpft — lange Halme zeigen kaum Streifen.
    base *= 1.0 + vStripe * STRIPE_STRENGTH * (1.0 - vCellHeight * 0.6);
    // Beleuchtung: konstanter Half-Lambert-Term mit Welt-Oben als Normale.
    vec3 light = uSun * 1.35 + uAmbient * 0.85;
    gl_FragColor = vec4(base * light, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Das Gras-Feld: eine Instanz-Geometrie + eigenes ShaderMaterial. `.mesh`
 * kommt in die Szene, `.update(time)` setzt pro Bild nur die uTime-Uniform —
 * das Plattdrücken steckt komplett im Gitter-Kanal, nicht in einer Uniform.
 */
export class GrassField {
  /** Das Halm-Mesh — kommt in die Szene. */
  readonly mesh: THREE.Mesh;

  private readonly material: THREE.ShaderMaterial;

  constructor(grid: MowGrid, exclusions: ReadonlyArray<GrassExclusion> = []) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uHeightTex: { value: grid.heightTexture },
        uTerrainTex: { value: terrainHeightTexture() },
        uTime: { value: 0 },
        uGrassMown: { value: new THREE.Color(COLORS.grassMown) },
        uGrassFull: { value: new THREE.Color(COLORS.grass) },
        uSun: { value: new THREE.Color(COLORS.sun) },
        uAmbient: { value: new THREE.Color(COLORS.ambient) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      // Die Orbit-Kamera sieht die Halme von allen Seiten.
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(makeBladeGeometry(exclusions), this.material);
    this.mesh.name = 'grassField';
    // Der Shader verschiebt Vertices — die Bounding-Sphere wäre falsch. Im
    // Diorama ist der Rasen ohnehin immer im Bild, also Culling abschalten.
    this.mesh.frustumCulled = false;
  }

  /** Setzt die uTime-Uniform für die Wind-Welle. Pro Bild aufrufen. */
  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }
}
