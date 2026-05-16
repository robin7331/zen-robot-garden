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

  // Welt
  grass: '#618f3d', // Rasen-Oberseite (langes Gras, dunklere Stufe)
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
  low: 0.25, // ab hier fährt der Roboter zur Ladestation heim
  full: 0.99, // ab hier verlässt er die Station wieder
} as const;
