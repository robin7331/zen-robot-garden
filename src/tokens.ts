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
} as const;

/** Maße in Metern (echte Einheiten, siehe DESIGN.md). */
export const SIZES = {
  lawnWidth: 8, // Rasen-Breite (X)
  lawnDepth: 6, // Rasen-Tiefe (Z)
  grassThickness: 0.12, // dünne Gras-Deckschicht
  grassLip: 0.1, // Überstand der Gras-Lippe je Seite
  soilThickness: 0.3, // Erd-Band
  rockThickness: 0.7, // Fels-Schicht
} as const;
