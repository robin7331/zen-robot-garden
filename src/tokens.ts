/**
 * Design-Tokens — feste Werte aus DESIGN.md.
 * Farben, Größen und Abstände an einem Ort. Wer etwas am Aussehen ändern
 * will, ändert es hier.
 */

/** Farben aus der Palette (DESIGN.md). */
export const COLORS = {
  // Hintergrund-Verlauf (steht nur im CSS, hier zur Referenz)
  bgTop: '#cdd9e6',
  bgBottom: '#9aa9c0',

  // Licht
  sun: '#fff4e0', // Sonnenlicht, leicht warm
  ambient: '#b9c8dd', // Füll-Licht, Himmel-Blau-Tönung

  // Welt — Rasen-Farbstufen: hell = frisch gemäht, dunkel = voll nachgewachsen.
  // Diese vier Töne sind zugleich die Anzeige-Stufen des Mäh-Gitters (mowGrid).
  grassMown: '#a8c66c', // Stufe 0 — frisch gemäht (hellster Ton)
  grassShort: '#8aab57', // Stufe 1 — kurz, wächst nach
  grassMid: '#739848', // Stufe 2 — mittel
  grass: '#618f3d', // Stufe 3 — voll nachgewachsen (dunkelster Ton)
  soil: '#6b4a2f', // Erd-Band unter dem Rasen
  rock: '#5f5953', // Fels-Schicht darunter
  twig: '#5a4327', // Ästchen — trockenes, holziges Braun
  wire: '#2c2f26', // Begrenzungsdraht — dünner, dunkler Faden auf dem Rasen

  // Roboter
  robotBody: '#e8862f', // Körper — warmes Orange, der eine knallige Akzent
  robotDark: '#2a2a2c', // Räder, Klinge, Sensor, Details

  // Ladestation
  station: '#6f6a63', // Gehäuse — gedecktes Grau
  chargeLed: '#7dffb4', // Lade-Leuchte — sanftes Grün

  // UI / Akku-Anzeige
  batteryFull: '#7dffb4', // voller Akku — sanftes Grün (wie die Lade-Leuchte)
  batteryMid: '#e8862f', // mittlerer Akku — Orange (wie der Roboter)
  batteryLow: '#e8553f', // niedriger Akku — warnendes Rot
} as const;

/** Maße in Metern (echte Einheiten, siehe DESIGN.md). */
export const SIZES = {
  lawnWidth: 8, // Rasen-Breite (X)
  lawnDepth: 6, // Rasen-Tiefe (Z)
  wireInset: 0.4, // Abstand des Begrenzungsdrahts von der Rasenkante (je Seite)
  grassThickness: 0.12, // dünne Gras-Deckschicht
  grassLip: 0.1, // Überstand der Gras-Lippe je Seite
  soilThickness: 0.3, // Erd-Band
  rockThickness: 0.7, // Fels-Schicht

  // Roboter (echter Mähroboter-Maßstab)
  robotLength: 0.6, // Länge (Z, = Fahrtrichtung)
  robotWidth: 0.45, // Breite (X)
  robotHeight: 0.25, // Höhe (Y)
  wheelDiameter: 0.2, // Antriebsräder Ø
} as const;

/**
 * Fahr-Werte des Roboters — bewusst einstellbar (siehe CLAUDE.md).
 * Wer dem Roboter ein anderes Fahrgefühl geben will, ändert es hier.
 */
export const DRIVE = {
  maxSpeed: 0.55, // m/s — Vorwärts-Höchstgeschwindigkeit (ruhiges Zen-Tempo)
  reverseSpeed: 0.3, // m/s — Tempo beim Zurücksetzen nach dem Anstoßen
  turnSpeed: 0.45, // m/s — Rad-Tempo (gegenläufig) beim Drehen auf der Stelle
  wheelAccel: 0.9, // m/s² — wie schnell die Rad-Motoren ihr Tempo ändern (Trägheit)

  backupTime: 0.8, // s — wie lang nach einem Stoß gegen ein Hindernis zurückgesetzt wird

  // — Heimfahren über den Leitdraht ——————————————————————————————————
  followLookahead: 0.35, // m — Vorausschau-Punkt ("Carrot") des Leitdraht-Linienfolgers
  dockDropRadius: 0.45, // m — Fang-Radius: wird der Roboter so nah an der Station
  //                       abgesetzt, dockt er an (≈ Stations-Grundfläche)

  // Drehung nach einem Stoß gegen ein Hindernis: ein zufälliger Winkel.
  collisionTurnMin: 1.2, // rad — kleinste Drehung (~69°)
  collisionTurnMax: 3.0, // rad — größte Drehung (~172°)

  // Drehung nach dem Überqueren des Begrenzungsdrahts: der Roboter wird vom
  // Draht "abgelenkt" — steiler Anstoß ergibt eine große Drehung, schräges
  // Streifen eine kleine. Dazu kommt etwas Zufall, damit nie zweimal dieselbe
  // Spur entsteht. wireTurnMaxDeviation begrenzt, wie schräg zum Draht der
  // Roboter danach höchstens wegfährt — er zeigt immer deutlich nach innen.
  wireTurnJitter: 0.5, // rad — Zufalls-Streuung der Abkehr (~29°)
  wireTurnMaxDeviation: 1.22, // rad — max. Abweichung von "geradewegs nach innen" (~70°)
} as const;

/**
 * Akku-Werte des Roboters — einstellbar. Zahlen sind Anteile pro Sekunde
 * (1 = voller Akku, 0 = leer). Aktuell eher zügig, damit man den Lade-
 * Kreislauf gut sieht; für ruhigeres Zen-Tempo die Werte kleiner machen.
 */
export const BATTERY = {
  drain: 0.022, // pro Sekunde beim Fahren — voll -> niedrig in ~34 s
  charge: 0.08, // pro Sekunde an der Station — fast leer -> voll in ~12 s
  low: 0.5, // ab hier sucht der Roboter den Leitdraht und fährt heim
  //            (~23 s Reserve: deckt eine Heimfahrt plus einen Stoß)
  full: 0.99, // ab hier verlässt er die Station wieder
} as const;

/**
 * Mäh-Gitter — das unsichtbare Raster aus kleinen Feldern über dem Rasen.
 * Jedes Feld merkt sich die Grashöhe (0 = frisch gemäht, 1 = voll
 * nachgewachsen). Siehe mowGrid.ts. Alle Werte einstellbar.
 */
export const GRASS = {
  cellSize: 0.1, // m — Kantenlänge eines Gitter-Felds (8x6 m -> 80x60 Felder)
  regrowTime: 180, // s — von frisch gemäht (0) bis voll nachgewachsen (1)
  cutRadius: 0.2, // m — Radius der Mäh-Scheibe um den Roboter-Mittelpunkt
} as const;

/**
 * Die Nägel des LEITDRAHTS — die offene Draht-Linie, der der Roboter mit
 * niedrigem Akku heim zur Ladestation folgt. Weltkoordinaten X/Z in Metern.
 *
 * Der Begrenzungsdraht (geschlossene 4-Nagel-Schleife) wird dagegen aus
 * lawnWidth/lawnDepth/wireInset abgeleitet — siehe wire.ts.
 *
 *   nail[0] = Dock — in der Ladestation an der +X-Kante. Muss mit dem in
 *             main.ts aus der Stations-Pose berechneten Andock-Punkt
 *             übereinstimmen (Station bei x≈3,6 -> Dock x≈3,54).
 *   nail[1] = ein sanfter Knick quer durch den Garten (obtus, kein Eck-Pivot).
 *   nail[2] = fernes Ende — eine echte Y-Verzweigung auf den Begrenzungsdraht
 *             an der -X-Kante (x = -(lawnWidth/2 - wireInset) = -3,6).
 */
export const LEITDRAHT_NAILS = [
  { x: 3.54, z: -1.6 },
  { x: 0.4, z: 0.3 },
  { x: -3.6, z: 1.0 },
] as const;
