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

  // Roboter
  robotBody: '#e8862f', // Körper — warmes Orange, der eine knallige Akzent
  robotDark: '#2a2a2c', // Räder, Klinge, Sensor, Details

  // Ladestation
  station: '#6f6a63', // Gehäuse — gedecktes Grau
  chargeLed: '#7dffb4', // Lade-Leuchte — sanftes Grün
} as const;

/** Maße in Metern (echte Einheiten, siehe DESIGN.md). */
export const SIZES = {
  lawnWidth: 8, // Rasen-Breite (X)
  lawnDepth: 6, // Rasen-Tiefe (Z)
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

  backupTime: 0.8, // s — wie lang nach dem Anstoßen zurückgesetzt wird
  turnTimeMin: 0.5, // s — kürzeste Drehung danach
  turnTimeMax: 1.5, // s — längste Drehung danach
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
