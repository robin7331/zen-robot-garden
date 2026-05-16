import * as THREE from 'three';
import { COLORS, SIZES } from './tokens';

/**
 * Der Begrenzungsdraht ("fence wire") — die Grenze des Mäh-Bereichs.
 *
 * So macht es ein echter Mähroboter: Statt gegen eine Wand zu stoßen, liegt
 * ein dünner Draht als geschlossene Schleife im Rasen. Der Roboter hat zwei
 * Spulen-Sensoren (vorne und hinten), die "spüren", ob die Spule gerade
 * INNERHALB der Schleife ist (auf dem Mäh-Rasen) oder schon AUSSERHALB.
 *
 * Hier ist der Draht ein einfaches Rechteck, ein Stück (SIZES.wireInset) von
 * der Rasenkante nach innen versetzt. Der Streifen zwischen Draht und Kante
 * bleibt darum ungemäht — wie der ungemähte Rand bei einem echten Rasen.
 *
 * Krumme Draht-Formen und ein frei verlegbarer Draht kommen laut CLAUDE.md
 * erst später.
 */

/** Halbe Kantenlängen des Draht-Rechtecks (von der Mitte aus gemessen). */
export const WIRE = {
  halfW: SIZES.lawnWidth / 2 - SIZES.wireInset,
  halfD: SIZES.lawnDepth / 2 - SIZES.wireInset,
} as const;

/**
 * Liegt der Punkt (x, z) innerhalb der Draht-Schleife?
 * Genau diese Prüfung machen die beiden Spulen-Sensoren des Roboters.
 */
export function insideWire(x: number, z: number): boolean {
  return Math.abs(x) <= WIRE.halfW && Math.abs(z) <= WIRE.halfD;
}

/**
 * Der sichtbare Draht: eine dünne Linie knapp über dem Rasen, die das
 * Rechteck nachzeichnet. Bewusst unaufdringlich — aber sichtbar, damit man
 * sofort versteht, warum der Roboter genau dort umkehrt.
 */
export function createWireMesh(): THREE.LineLoop {
  const y = 0.012; // knapp über der Rasen-Oberseite (y = 0) — kein Z-Fighting
  const corners = [
    new THREE.Vector3(WIRE.halfW, y, WIRE.halfD),
    new THREE.Vector3(-WIRE.halfW, y, WIRE.halfD),
    new THREE.Vector3(-WIRE.halfW, y, -WIRE.halfD),
    new THREE.Vector3(WIRE.halfW, y, -WIRE.halfD),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(corners);
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(COLORS.wire),
  });
  const line = new THREE.LineLoop(geometry, material);
  line.name = 'boundaryWire';
  return line;
}
