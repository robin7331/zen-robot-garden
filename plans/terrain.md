# Gelände (3D-Terrain) — Design-Plan

Stand: 2026-05-16. Ergebnis aus dem Grill-Interview.

## Worum es geht

Der Rasen ist heute **flach** (Oberseite bei y = 0). Wir bauen ein echtes
**3D-Gelände**: sanft gewellte Hügel und Mulden, über die der Roboter mit
**echter Physik** fährt — er klettert bergauf, lehnt sich in die Hänge, wird
am Berg langsamer.

Das Gelände ist von Anfang an so gebaut, dass später eine **Terraforming-
Oberfläche** (mit einem Pinsel Hügel formen) einfach dazukommt — die
Höhenkarte ist eine editierbare Datenstruktur, kein fest eingebackenes Modell.

## Grundentscheidung

**Volle Physik.** Kein „getürktes" Gelände — der Roboter ist wirklich ein
Fahrzeug auf einer Höhen-Landschaft. Das ersetzt die heutige Ebenen-Fessel des
Roboter-Körpers (`enabledTranslations(true,false,true)` /
`enabledRotations(false,true,false)`).

## Gelände-Daten — neues Modul `terrain.ts`

- **Eine editierbare Höhenkarte** als einzige Wahrheit: ein `Float32Array`-
  Raster von Höhen. Alles andere fragt nur ab, niemand hält eine zweite Kopie.
- Eigenes, **grobes Raster ~0,25 m** (8×6 m → 33×25 Stützpunkte). Bewusst
  gröber als das 0,1-m-Mäh-Gitter — das Gelände will sanfte, große Hügel; die
  feine Mäh-Auflösung bleibt im Mäh-Gitter.
- `heightAt(x, z)` und `normalAt(x, z)` — **bilinear** zwischen den
  Stützpunkten interpoliert. Diese zwei Funktionen sind die ganze Schnittstelle.
- **Höhen-Textur** (`DataTexture`, RGB/R-Kanal): dieselben Höhen als Bild,
  damit der Gras-Shader die Geländehöhe je Halm lesen kann (wie heute schon die
  `heightTexture` des Mäh-Gitters). Ändert sich nur beim Terraforming.
- Start-Hügel = **Seed-basiertes Rauschen**, beim Start einmal in das Array
  geschrieben. Fester Seed in `tokens.ts` → der Garten sieht bei jedem Laden
  gleich aus. Das Array, nicht das Rauschen, ist die Wahrheit.
- Terraforming-fertig: eine spätere Pinsel-UI ändert nur das Array → markiert
  „schmutzig" → Höhenfeld-Collider + Sicht-Mesh + Höhen-Textur neu bauen. Kein
  Umbau nötig.

## Geländeform

- **Sanft gewellt.** Maximale Steigung **20°**, Gesamt-Relief **~±0,4 m**.
  Das Rausch-Erzeugen wird auf diese 20° gedeckelt.
- Der Roboter klettert die 20° **immer zuverlässig** — er bleibt nie hängen,
  kippt nie von allein, strandet nie. (Liegt innerhalb der ~25°-Spanne eines
  echten Mähroboters.)
- Kippen ist trotzdem echte Physik: Wer den Roboter beim Ziehen ungünstig auf
  einen Steilhang fallen lässt, kann ihn umwerfen. Kein automatisches
  Aufrichten — dann muss man ihn von Hand zurückziehen.

## Roboter ↔ Gelände — Raycast-Fahrzeug

Der Roboter-Körper bleibt **ein Quader-Collider**, der aber **nicht mehr mit
dem Gelände kollidiert** (Kollisions-Gruppe schließt `ground` aus; Ästchen und
Hindernisse stößt er weiter an). Statt dessen schwebt er auf vier
abgetasteten Rad-Punkten:

- **Vier Rad-Ankerpunkte** lokal am Körper-Quader (untere Ecken):
  - **hinten links/rechts = Antriebsräder** — bei `WHEEL_Z`, ± `TRACK_HALF`.
  - **vorn links/rechts = Lenkrollen (Caster)** — an der Nase, ± `TRACK_HALF`.
- Je Rad wird die Geländehöhe **rechnerisch** mit `heightAt` am Rad-XZ
  abgetastet (kein Physik-Strahl nötig — die Federung ist nahezu senkrecht,
  also ist der Aufstandspunkt der Höhenwert direkt darunter, die Normale
  `normalAt`).
- **Federung je Rad:** Eine Feder drückt den Körper nach oben, je nach
  Einfederung (Ruhelänge − aktuelle Länge), plus Dämpfung auf die senkrechte
  Geschwindigkeit am Rad-Punkt. Weil die vier Räder verschieden tief
  einfedern, **neigt sich der Körper von selbst** in Nick- und Rollachse.
- **Antriebsräder (hinten)** bekommen zusätzlich das **bestehende
  Schlupf-Reibungs-Modell** — aber jetzt in der **Tangentialebene des
  Geländes** statt in der flachen XZ-Ebene: Vorwärts-/Querrichtung des Rades
  werden auf die Hang-Ebene projiziert, dann wie heute Längskraft (Antrieb/
  Bremse) und Querkraft (Kurvenhalt). Gleiche Konstanten (`GRIP_LONG`,
  `GRIP_LAT`, `FORCE_MAX`) — neu eingestellt.
- **Lenkrollen (vorn)** liefern **nur Federkraft**, keine nennenswerte
  Horizontalkraft — genau wie eine echte, frei schwenkende Caster-Rolle. So
  bleibt das Lenken zu 100 % Sache des Differentialantriebs (die Rollen
  bremsen die Drehung nicht).
- Hängt ein Rad in der Luft (über einer Kuppe), liefert es diesen Schritt
  keine Kraft — der Körper darf kurz kippeln, das ist gewollt.
- Körper-Fesseln **gelöst**: volle 6 Freiheitsgrade, Schwerkraft wirkt. Etwas
  Winkel-Dämpfung bleibt, damit nichts zappelt.

So bleibt das elegante Differentialantriebs-Reibungsmodell erhalten — es wird
nur aus der flachen Ebene in die Hang-Ebene je Rad gehoben.

## Klettern

- **Aus der Physik geschenkt:** Die Hangabtrieb-Komponente der Schwerkraft
  bremst bergauf, beschleunigt bergab. Übersteigt der Hangabtrieb die
  verfügbare Reibung (`FORCE_MAX`), **rutscht** der Roboter — automatisch.
- **Zusätzlich:** Der Akku entleert sich bergauf **schneller** (echte Motoren
  ziehen unter Last mehr Strom). Anteilig zur Bergauf-Komponente. Das speist
  schön den „Akku leer → heimfahren"-Kreislauf — ein hügeliger Garten schickt
  den Roboter etwas früher heim.
- Die Motor-Reibung wird so eingestellt, dass die 20°-Maximalsteigung **immer**
  geschafft wird — kein Steckenbleiben am Berg.
- Durchdrehen bei nassem Gras bleibt — wie in CLAUDE.md notiert — ein
  **späteres** Extra. Nicht in diesem Plan.

## Vertikale-Ebene-Regel

Das Gelände ändert **nur die Höhe (Y)**, niemals die 2D-Logik:

- **Autonomie/Lenken** fährt „blind" zu Hängen — keine Hang-Vermeidung. Bei
  20° (immer kletterbar, kippt nie) braucht der Roboter das auch nicht. Wie
  ein echter Mähroboter, der eine Grube nicht kennt — man zäunt sie später mit
  Begrenzungsdraht aus.
- **Begrenzungs- und Leitdraht:** Innen/Außen-Test, Vorzeichen-Distanz,
  Spulen-Sensoren bleiben **2D XZ**. Der Draht wird nur über das Gelände
  **drapiert gezeichnet**.
- **Mäh-Gitter:** Welche Felder gemäht/plattgedrückt werden, bleibt ein 2D-XZ-
  Scheibentest. Das Gitter ist gedanklich weiter ein flaches 80×60-Array, wird
  nur über das Gelände drapiert **angezeigt**.

## Diorama — Schichten folgen dem Gelände

Der Garten bleibt ein Diorama-Block, aber die Oberseite ist jetzt gewellt:

- **Gras-Decke** = unterteiltes, in der Höhe verschobenes Mesh (Stützpunkte =
  Höhenkarte), **flat-shading** beibehalten → kantige Low-Poly-Hügel, passt
  zum Origami-Look.
- **Erd-Band und Fels-Schicht** folgen der Gras-Decke in festem Tiefen-
  Abstand — der ganze Block wellt sich mit.
- **Vier Seitenwände** bleiben senkrechte Schnitte, zeigen jetzt die welligen
  Erd-/Fels-Schichten wie ein echter Geländequerschnitt. Boden bleibt flach.
- Erlaubt echte **Hügel und Mulden/Gruben** (nicht nur Beulen nach oben).
- Die heutige `makeSlab`-Box in `garden.ts` entfällt.

## Ladestation

- **Steht auf dem Hang** und **neigt sich** zur Geländenormale (kein flaches
  Podest). Konsequent zur Vollphysik.
- **Beim Laden:** Der Roboter wird beim Andocken in die Andock-Pose
  **eingerastet und eingefroren** (kinematisch), bis der Akku voll ist — dann
  wieder dynamisch. Realistisch (die Ladekontakte halten ihn) und verhindert
  das Wegrutschen am Hang (bei 20° hält die Reibung sonst nur knapp). Lässt
  auch das „Roboter aufs Dock ziehen zum Wiederbeleben" sauber einrasten.

## Ziehen

- Beim Ziehen ist der Roboter **angehoben**: Er schwebt knapp **über** dem
  Gelände, bleibt **waagerecht** (nur Gier), folgt aber `heightAt` — er sinkt
  nie in einen Hügel. Liest sich als „in der Hand getragen".
- Beim Loslassen wird er dynamisch, das Raycast-Fahrzeug setzt ihn ab und
  neigt ihn in den Hang.
- Der Zieh-Strahl in `main.ts` trifft nicht mehr eine flache Ebene, sondern
  tastet das Gelände ab. Die XZ-Zieh-Grenzen bleiben.

## Sonstiges (Vorgabe-Entscheidungen)

- **Ästchen** rollen auf dem Höhenfeld-Collider Hänge hinab — kostenlos und
  natürlich. So behalten.
- **Lenkrollen** sind reine Physik — **kein** sichtbares Caster-Mesh. Kleine
  Rollen-Modelle ggf. später.
- **Sichtbarer Draht** über einem Hügel wird **unterteilt**, damit die Linie
  sauber drapiert statt durch den Hügel zu schneiden.

## Stellwerte (`tokens.ts` / `DESIGN.md`)

- `TERRAIN`: Raster-Zellgröße (~0,25 m), Seed, max. Steigung (20°),
  Relief-Amplitude (~±0,4 m), Rausch-Frequenz.
- Federung: Federkonstante, Dämpfung, Ruhelänge.
- `BATTERY`: Faktor für den Mehr-Verbrauch bergauf.
- Reibungs-Konstanten des Roboters neu justiert (Zuschauen).
- Kein Einstell-Panel — alles in `tokens.ts`, wie bisher.

## Umsetzung in Phasen

Jede Phase lässt einen lauffähigen Build zurück.

### Phase 1 — Gelände sichtbar machen

- `terrain.ts`: Höhenkarte, Seed-Rauschen, `heightAt`/`normalAt`, Höhen-Textur.
- `tokens.ts`: `TERRAIN`-Block.
- `garden.ts`: Diorama-Block neu — gewellte Gras-Decke + folgende Erd-/Fels-
  Schichten + Seitenwände (Diorama 8a).
- Mäh-Gitter-Ebene (`mowGrid.ts`): unterteiltes, höhenverschobenes Mesh.
- Gras-Shader (`grass.ts`): Halm-Fuß um `uTerrainTex`-Höhe anheben.
- Drähte (`wire.ts`): Linien + Nägel über das Gelände drapieren (unterteilt).
- Rapier-**Höhenfeld-Collider** statt flachem Boden-Quader (`physics.ts`) —
  Ästchen rollen ab sofort die Hänge hinab. *Prüfpunkt:* Ästchen anklicken,
  sie rollen bergab.
- **Ergebnis:** Der ganze Garten ist stimmig hügelig — nur der Roboter fährt
  noch flach (klippt in Hügel; bekannter Zwischenzustand).

### Phase 2 — Roboter wird zum Fahrzeug

- `robotController.ts`: Ebenen-Fessel lösen (volle 6 DoF), Körper-Collider aus
  `ground` ausklinken.
- Vier Rad-Ankerpunkte, Federung je Rad, Körper-Neigung aus den vier
  Einfederungen.
- Schlupf-Reibung der zwei Antriebsräder in die Tangentialebene heben;
  Lenkrollen nur Feder.
- Ziehen: Roboter folgt `heightAt`, schwebt waagerecht; Zieh-Strahl in
  `main.ts` tastet das Gelände ab.
- Ladestation in `main.ts` auf Geländehöhe + Normale ausrichten.
- **Ergebnis:** Der Roboter fährt, klettert und neigt sich übers Gelände.

### Phase 3 — Physik-Feinschliff & Doku

- Akku-Mehrverbrauch bergauf (`BATTERY`-Faktor).
- Laden: Einrasten/Einfrieren in die Andock-Pose bis voll.
- Reibung/Motor so einstellen, dass 20° immer geklettert werden; durch
  Zuschauen feinjustieren; prüfen, dass der Roboter nie strandet.
- **CLAUDE.md / DESIGN.md** aktualisieren: Gelände ist nicht mehr „später",
  flacher Rasen ersetzt; neue Tokens dokumentieren; Terraforming-UI als
  nächster „später"-Schritt notiert (Höhenkarte ist der Grundstein).

## Offene Fragen

Keine — im Grill-Interview alle geklärt. Die drei Vorgabe-Entscheidungen
(Ästchen rollen, Lenkrollen unsichtbar, Draht unterteilt drapiert) stehen
oben unter „Sonstiges".
