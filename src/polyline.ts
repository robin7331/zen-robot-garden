/**
 * Nagel-Polylinien-Primitiv — die gemeinsame Form für beide Drähte.
 *
 * Ein Draht ist eine geordnete Folge von Punkten ("Nägeln"). Zwischen zwei
 * Nägeln läuft der Draht schnurgerade; seine Richtung ändert sich nur an
 * einem Nagel. Genau so liegt ein echter Mähroboter-Draht im Rasen — und so
 * kann man später den Draht selbst mit Nägeln verlegen.
 *
 *   - Begrenzungsdraht    = GESCHLOSSENE Polylinie (Schleife, 4 Nägel)
 *   - Leitdraht (Heimweg) = OFFENE Polylinie (Dock -> Begrenzungsdraht)
 *
 * Hier stehen nur die geteilten Geometrie-Helfer: Punkt-in-Polygon,
 * Vorzeichen-Distanz zur Polylinie, nächster Punkt, Vorausschau-Punkt.
 */

/** Ein Punkt in der Boden-Ebene (X/Z, Meter). Ein Nagel ist so ein Punkt. */
export interface Nail {
  x: number;
  z: number;
}

/** Eine Draht-Polylinie: geordnete Nägel, geschlossen (Schleife) oder offen. */
export interface Polyline {
  nails: readonly Nail[];
  closed: boolean;
}

/** Anzahl der Segmente — bei der Schleife ein Segment je Nagel. */
function segmentCount(poly: Polyline): number {
  return poly.closed ? poly.nails.length : poly.nails.length - 1;
}

/** Ergebnis der Suche nach dem nächsten Punkt auf einer Polylinie. */
interface Nearest {
  segment: number; // Index des nächsten Segments
  t: number; // Parameter 0..1 entlang des Segments
  x: number; // nächster Punkt auf dem Draht
  z: number;
  dist: number; // Abstand dorthin
}

/** Projiziert (px,pz) auf das Segment a->b und gibt Punkt, Parameter, Abstand. */
function projectOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number; t: number; dist: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const x = ax + t * dx;
  const z = az + t * dz;
  return { x, z, t, dist: Math.hypot(px - x, pz - z) };
}

/** Sucht den der Stelle (px,pz) nächsten Punkt auf der ganzen Polylinie. */
function nearestOnPolyline(poly: Polyline, px: number, pz: number): Nearest {
  const n = poly.nails.length;
  let best: Nearest | null = null;
  for (let i = 0; i < segmentCount(poly); i++) {
    const a = poly.nails[i];
    const b = poly.nails[(i + 1) % n];
    const pr = projectOnSegment(px, pz, a.x, a.z, b.x, b.z);
    if (!best || pr.dist < best.dist) {
      best = { segment: i, t: pr.t, x: pr.x, z: pr.z, dist: pr.dist };
    }
  }
  return best as Nearest;
}

/**
 * Liegt (px,pz) INNERHALB der geschlossenen Polylinie? Strahl-Wurf-Test
 * ("ray casting"). Für das Begrenzungsdraht-Rechteck liefert das exakt
 * dasselbe wie früher der einfache |x|/|z|-Vergleich.
 */
export function insidePolygon(poly: Polyline, px: number, pz: number): boolean {
  const nails = poly.nails;
  let inside = false;
  for (let i = 0, j = nails.length - 1; i < nails.length; j = i++) {
    const xi = nails[i].x;
    const zi = nails[i].z;
    const xj = nails[j].x;
    const zj = nails[j].z;
    const crosses =
      zi > pz !== zj > pz &&
      px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Vorzeichen-Distanz von (px,pz) zur Polylinie: Betrag = Abstand, Vorzeichen
 * = auf welcher Seite (links/rechts des nächsten Segments). Wechselt das
 * Vorzeichen von einem Schritt zum nächsten, hat der Punkt den Draht
 * überquert — genau so erkennt der Roboter den Leitdraht.
 */
export function signedDistanceToPolyline(
  poly: Polyline,
  px: number,
  pz: number,
): number {
  const near = nearestOnPolyline(poly, px, pz);
  const n = poly.nails.length;
  const a = poly.nails[near.segment];
  const b = poly.nails[(near.segment + 1) % n];
  // Kreuzprodukt: positiv links vom Segment, negativ rechts.
  const cross = (b.x - a.x) * (pz - a.z) - (b.z - a.z) * (px - a.x);
  return near.dist * (cross >= 0 ? 1 : -1);
}

/** Schwerpunkt (Mittel aller Nägel) — nur als Notnagel-Innenreferenz. */
function centroid(poly: Polyline): Nail {
  let x = 0;
  let z = 0;
  for (const nail of poly.nails) {
    x += nail.x;
    z += nail.z;
  }
  return { x: x / poly.nails.length, z: z / poly.nails.length };
}

/**
 * Nach-außen zeigende Normale am nächsten Punkt der (geschlossenen)
 * Polylinie. Sinnvoll, wenn (px,pz) AUSSERHALB liegt: dann zeigt der Vektor
 * vom Draht weg. Die Draht-Abkehr spiegelt den Kurs an dieser Normale.
 */
export function outwardNormal(
  poly: Polyline,
  px: number,
  pz: number,
): Nail {
  const near = nearestOnPolyline(poly, px, pz);
  let nx = px - near.x;
  let nz = pz - near.z;
  let len = Math.hypot(nx, nz);
  if (len > 1e-6) return { x: nx / len, z: nz / len };

  // Punkt liegt genau auf dem Draht: Segment-Normale, vom Schwerpunkt weg.
  const n = poly.nails.length;
  const a = poly.nails[near.segment];
  const b = poly.nails[(near.segment + 1) % n];
  nx = -(b.z - a.z);
  nz = b.x - a.x;
  len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  const c = centroid(poly);
  if ((near.x - c.x) * nx + (near.z - c.z) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { x: nx, z: nz };
}

/**
 * Vorausschau-Punkt ("Carrot") für den Pure-Pursuit-Linienfolger.
 *
 * Sucht den (px,pz) nächsten Punkt auf der offenen Polylinie und geht von
 * dort `lookahead` Meter Richtung `nail[0]` (Anfang). Auf genau diesen Punkt
 * lenkt der Linienfolger zu — so fährt er den Draht entlang und schafft auch
 * Knicke sauber.
 */
export function carrotTowardStart(
  poly: Polyline,
  px: number,
  pz: number,
  lookahead: number,
): Nail {
  const near = nearestOnPolyline(poly, px, pz);
  let seg = near.segment;
  let cx = near.x;
  let cz = near.z;
  let budget = lookahead;

  // Schrittweise Richtung Segment-Anfang gehen, bis das Budget alle ist.
  for (;;) {
    const a = poly.nails[seg]; // Anfang des Segments = Richtung nail[0]
    const toAx = a.x - cx;
    const toAz = a.z - cz;
    const d = Math.hypot(toAx, toAz);
    if (d >= budget || seg === 0) {
      if (d < 1e-6) return { x: a.x, z: a.z };
      const f = Math.min(budget, d) / d;
      return { x: cx + toAx * f, z: cz + toAz * f };
    }
    // Ganzes Segment verbraucht -> weiter zum vorigen Segment.
    budget -= d;
    seg -= 1;
    cx = poly.nails[seg + 1].x;
    cz = poly.nails[seg + 1].z;
  }
}
