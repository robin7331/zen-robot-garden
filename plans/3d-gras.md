# Echtes 3D-Gras — Design-Plan

Stand: 2026-05-16. Ergebnis aus dem Grill-Interview über den Vorschlag
„echtes 3D-Gras statt nur Farbe".

## Worum es geht

Heute zeigt das Mäh-Gitter die Grashöhe nur über die **Farbe** einer
DataTextur auf einer flachen Ebene (`mowGrid.ts`). Wir ersetzen das durch
**echte 3D-Halme**: viele kleine instanzierte Grashalme, deren Höhe, Farbe und
Biegung im **Shader** direkt aus dem Gitter gelesen werden. Der Roboter mäht
sie kurz, drückt sie beim Drüberfahren platt — und sie wachsen langsam nach.

Gewählter Ansatz: **Shader-getrieben**. Die Halm-Geometrie ist statisch; pro
Bild macht JavaScript *keine* Arbeit je Halm — die GPU liest die Gitter-Textur,
die `MowGrid` ohnehin schon jedes Bild neu malt.

## Daten — `MowGrid`

- Neuer Kanal `flatten` (Float32Array, ein Wert je Feld, 0..1) neben `heights`.
- Neue **2-Kanal-Textur** (`RGFormat` / `UnsignedByteType`), **`LinearFilter`**:
  - R = Grashöhe (`heights`)
  - G = Plattgedrückt (`flatten`)
  - Werte **roh/stufenlos** geschrieben (keine 4-Stufen-Quantisierung — die
    bleibt nur Sache der Farb-Ebene).
  - Gefüllt in der bestehenden `redraw()`-Schleife, **gleiche Zeilen-Spiegelung**
    wie die Farb-Textur, damit die UVs zum Roboter-Weltbild passen.
- Neu: `get heightTexture()` — gibt die 2-Kanal-Textur an `GrassField`.
- Neu: `flattenAt(x, z)` — weicher Stempel `flatten → 1` unter dem Roboter
  (Radius ≈ 0,25 m, analog zu `cutAt`).
- `update(dt)` lässt zusätzlich `flatten` abklingen — zurück auf 0 über
  `flattenRecoverTime ≈ 1,5 s` (gleiche Mechanik wie Nachwachsen, andere
  Richtung).
- Die **alte Farb-Ebene bleibt unverändert** (4-Stufen-Rampe, `NearestFilter`):
  sie ist jetzt der Lückenfüller, der zwischen den Halmen durchscheint, und
  trägt weiterhin die Schatten.

## Gras — `src/grass.ts`, Klasse `GrassField`

- `InstancedBufferGeometry` + schlichtes `Mesh` + eigenes `ShaderMaterial`
  (kein `THREE.InstancedMesh` — bei voll eigenem Shader bringt das Dekodieren
  einer mat4 je Instanz nichts).
- `mesh.frustumCulled = false` — der Shader verschiebt Vertices, die
  Bounding-Sphere wäre falsch; im Diorama ist der Rasen ohnehin immer im Bild.
- Konstruktor bekommt `MowGrid`, liest dessen `heightTexture`.
- `.mesh` für die Szene, `.update(time)` setzt nur die `uTime`-Uniform.
  **Keine Roboter-Position als Uniform** — das Plattdrücken steckt komplett im
  Gitter-Kanal.

### Halm-Geometrie (einmal, dann instanziert)

- Sich verjüngendes Dreieck: unten breit, läuft nach oben spitz zu.
- **3 senkrechte Segmente** (4 Höhen-Ebenen, 7 Vertices, 5 Dreiecke) — nötig,
  damit sich der Halm *biegen* kann.
- `THREE.DoubleSide` — die Orbit-Kamera sieht Halme von allen Seiten.
- Leichte eingebaute Vor-Neigung (nicht kerzengerade).
- Voll gewachsene Höhe ≈ 0,12 m, Fußbreite ≈ 1,5 cm.

### Streuung

- ~250 Halme/m² (≈ 12 000) — gleichmäßig zufällig, keine Büschel.
- Über das **volle Rasen-Rechteck** `lawnWidth × lawnDepth` gestreut. Das
  schließt den Streifen zwischen Begrenzungsdraht und Rasenkante mit ein — der
  Roboter kehrt am Draht um, mäht ihn nie, also bleibt er hoch = ungemähter
  Rand, geschenkt. Keine Halme auf dem `grassLip`-Überstand.
- Instanz-Attribute:
  - `aOffset` (vec2) — XZ-Position des Halms
  - `aRotation` (float) — Drehung um Y
  - `aRandom` (vec3) — Wind-Phase, Höhen-Zufall, Farbton-Streuung

## Vertex-Shader

- `aOffset` → UV, daraus R (Höhe) und G (flatten) aus der Gitter-Textur lesen.
- Halm-Höhe: `geoHöhe × perBladeRand(0,85..1,15) × mix(stubMin, 1, cellHeight)`
  mit `stubMin = 0,15` — frisch gemäht bleibt ein **kurzer Stummel** (≈ 1,8 cm),
  nie kahl.
- **Wind:** eine langsame Sinus-Welle, globale Wind-Richtung + Halm-Phase aus
  `aRandom`. Biegung je Vertex ∝ (Höhe-am-Halm)² — Fuß bleibt verankert, Spitze
  wandert am weitesten. Amplitude ∝ Halm-Höhe × `(1 - flatten)` — Stummel und
  plattgedrücktes Gras wehen kaum.
- **Plattdrücken:** der Halm klappt proportional zu `flatten` Richtung Boden.
  Keine gespeicherte Richtung — ein Rad drückt gerade nach unten, und echte
  Mäh-Spuren *sind* einfach plattgedrücktes Gras, nicht gekämmtes.

## Fragment-Shader

- Grundfarbe = `mix(grassMown, grass)` nach `cellHeight` — kurze/gemähte Halme
  kommen heller heraus (nutzt die bestehende `COLORS`-Rampe).
- Spitzen-Verlauf: Spitze heller als Fuß.
- Kleine Farbton-Streuung je Halm (`aRandom`).
- Beleuchtung: Half-Lambert, **Licht-Normale = Welt-Oben** (nicht die echte,
  fast senkrechte Halm-Normale — die ließe Halme unter der hohen Sonne
  absaufen). Der Rasen liest sich so als eine gleichmäßig beleuchtete Fläche
  (flacher Origami-Look); Abwechslung kommt aus Farbton-Streuung + Spitzen-
  Verlauf. Sonne + Füll-Licht als Uniforms (`COLORS.sun` / `COLORS.ambient`).
- `flatten` färbt **nicht** — plattes Gras behält seine Farbe, nur die Form
  ändert sich.
- **Keine Schatten auf den Halmen** (weder werfen noch empfangen): 12k
  fadendünne Halme in der 2048er-Schattenkarte ergäben Rauschen statt weichem
  Schatten; die Farb-Ebene darunter trägt die Schatten ohnehin.

## Verdrahtung — `main.ts`

- `GrassField` bauen, `.mesh` zur Szene hinzufügen.
- Pro Bild: `mowGrid.flattenAt(robot.x, robot.z)` — **außer** wenn
  `draggingRobot` (angehoben, Räder in der Luft). Danach
  `grassField.update(elapsed)`.

## Tokens — `tokens.ts`

Neue Gruppe `BLADES` neben `GRASS`, alle Werte einstellbar:

- Streu-Dichte (Halme/m²)
- Halm-Höhe, Fußbreite
- `stubMin` (= 0,15)
- `flattenRecoverTime` (≈ 1,5 s)
- Wind-Tempo, Wind-Stärke

## Doku

- `DESIGN.md`: neue `BLADES`-Tokens aufnehmen.
- `CLAUDE.md`: „Echtes 3D-Gras" von *Später geplant* nach *Jetzt zuerst* /
  erledigt verschieben.

## Bewusst aufgeschoben (nicht v1)

- Schnelle „Flatter"-Wind-Frequenz zusätzlich zur langsamen Sinus-Welle.
- Richtungs-„Kämmen" von plattgedrücktem Gras (bräuchte einen Richtungs-Kanal
  je Feld).
- Halme unter der Ladestations-Grundfläche unterdrücken (Gehäuse verdeckt sie
  weitgehend).
- Schatten auf den Halmen („vorerst" zugestimmt, später evtl. anders).

## Offene Fragen

Keine.
