# Leitdraht (guide-home wire) — Design-Plan

Stand: 2026-05-16. Ergebnis aus dem Grill-Interview über den ursprünglichen Plan.

## Worum es geht

Heute „schummelt" das Heimfahren: Der Zustand `seeking` kennt die exakten
Andock-Koordinaten und fährt per `steerToDock` direkt zur Station. Das ersetzen
wir durch einen **echten Leitdraht**, den der Roboter physisch finden und dem er
folgen muss — wie bei einem echten Mähroboter.

## Geometrie

- Neues **Nagel-Polylinien-Primitiv**: geordnete Punkte (Nägel); der Draht läuft
  gerade zwischen Nägeln, die Richtung ändert sich nur an einem Nagel.
- **Begrenzungsdraht** → migriert auf das Primitiv: geschlossenes 4-Nagel-Polygon
  (gleiche Rechteck-Form). `insideWire` wird Punkt-in-Polygon;
  `computeWireTurnTarget` spiegelt am *überquerten Segment*. Verhalten für den
  Rechteck-Fall nachweislich identisch zu heute (Reflexion + Jitter +
  Clamp-nach-innen).
- **Leitdraht** → offene Polylinie, **gartenweit gespannt**:
  - `nail[0]` = Dock (in der Station, +X-Kante)
  - 1 sanfter Knick (obtus, kein Eck-Pivot nötig)
  - fernes Ende = echte **Y-Verzweigung auf den Begrenzungsdraht** (−X-Seite)
  - Koordinaten in `tokens.ts`.
- Nägel als kleine Punkte gerendert, Farbe `COLORS.wire`, auf **beiden** Drähten
  (4 Begrenzung + Leitdraht-Nägel). Foreshadowing für später nutzerdefinierte
  Draht-Verlegung mit Nägeln.
- Leitdraht-Farbe = gleiche `COLORS.wire` wie Begrenzungsdraht (in Wirklichkeit
  ein physischer Draht, an der Y-Verzweigung verbunden). Kein neuer Farb-Token.
- Geteilte Geometrie-Helfer: Signed-Distance-zu-Polylinie, Projektion-auf-Segment.

## Zustandsfluss

`driving → seeking → following → charging → backing/turning → driving`,
dazu `dead`.

- **seeking** — Akku ≤ `low`. Geradeaus-Fahrt mit Begrenzungs-Abprall +
  Hindernis-Abprall (motorisch identisch zu `driving`), **Klingen aus**,
  Leitdraht-Erkennung an. Kein Mäander. Vom Mähen unterschieden nur durch
  Klingen-aus + UI-Text — der gartenweite Draht garantiert eine schnelle
  Überquerung.
- **following** — **Pure-Pursuit**-Linienfolger: lenkt stets auf einen
  Vorausschau-Punkt (Carrot) entlang der Polylinie Richtung `nail[0]` (Dock).
  `followLookahead` ≈ 0,3–0,4 m. Bewältigt den heutigen sanften Knick *und*
  künftige nutzergezeichnete 90°-Ecken ohne Extra-Code (kleiner Eck-Schnitt
  akzeptiert). Begrenzungsdraht-Erkennung aus, Klingen aus. Stoß → zurück/drehen
  → `seeking` (Draht neu suchen).
- **charging** — angedockt, lädt. Bei voll → `backing/turning` → `driving`.
- **dead** — Akku 0 → kompletter Stopp, Motoren + Klingen aus. Erholung nur durch
  Ziehen auf das Dock.
- **endDrag** — Absetzen innerhalb `dockDropRadius` ≈ 0,45 m vom Dock →
  `charging`; sonst Akku 0 → `dead`; sonst → `driving`.

## Erkennung

Leitdraht erfasst, wenn die Vorzeichen-Distanz der **vorderen Spule** zur
Leitdraht-Polylinie das Vorzeichen wechselt (Überquerung). Geprüft **nur in
`seeking`** — beim `driving` überfährt der Roboter den Draht ständig und ignoriert
ihn. Folge-Richtung = Richtung `nail[0]` (in Wirklichkeit elektrisch wissbar).

## Klingen

An nur in `driving` / `backing` / `turning`. Aus in `seeking` / `following` /
`charging` / `dead` / `stopped` / `held`.

> Umsetzungs-Hinweis: Da `seeking` die Geradeaus-Bewegung von `driving` teilt,
> muss die Klingen-Logik **zustands-abhängig** werden statt tempo-abhängig —
> heute dreht `sync()` die Klinge, sobald der Roboter sich bewegt.

## Stellwerte (`tokens.ts`)

- `BATTERY.low` 0,25 → **0,5** (≈ 23 s Reserve: deckt eine normale Heimfahrt +
  einen Stoß; Tod nur bei sehr unglücklicher Mehrfach-Stoß-Fahrt — selten,
  akzeptiert). `BATTERY.drain` unverändert. Startwert, durch Zuschauen feinjustieren.
- `followLookahead` ≈ 0,3–0,4 m — Carrot-Vorausschau des Linienfolgers.
- `dockDropRadius` ≈ 0,45 m — großzügiger Fang-Radius beim Absetzen (≈ Stations-
  Grundfläche 0,56 × 0,66 m). `DOCK_RADIUS` 0,18 m bleibt für die *autonome*
  Linienfolger-Ankunft (die soll präzise sein).
- Leitdraht-Nagel-Koordinaten.
- Kein Einstell-Panel — alle Werte in `tokens.ts`, wie alles andere
  (`ui.ts` verschiebt ein Panel explizit auf später).

## Visuell

Neue kleine Roboter-LED: sanftes Grün solange lebendig, **dunkel bei `dead`**.
Steady-on sonst — der Lade-Puls sitzt bereits auf der Stations-LED. ~10 Zeilen
Modell-Code (kleiner emissiver Quader wie die Stations-`led`).

`dead` wird so im-Welt eindeutig: sonst sehen `charging`, `stopped` und `dead`
alle gleich aus (stillstehender Roboter).

## UI

`RobotActivity` bekommt `following` und `dead`. Texte:
- `following` = „folgt dem Leitdraht"
- `dead` = „Akku leer"

## Doku

Im selben Change wie der Code:
- **CLAUDE.md** — neuer kurzer Abschnitt „Der Leitdraht (Heimweg)" im einfachen
  Deutsch-Stil; die veraltete Zeile korrigieren (Heimfahren schaltet *nicht* mehr
  bloß die Draht-Erkennung aus — es gibt jetzt einen echten Leitdraht); in
  „Später geplant" notieren, dass nutzerdefinierte Draht-Verlegung mit Nägeln
  kommt und das Nagel-Polylinien-Primitiv der erste Schritt dahin ist.
- **DESIGN.md** — neue Tokens (`followLookahead`, höheres `BATTERY.low`,
  `dockDropRadius`, Leitdraht-Nagel-Koordinaten).

## Offene Fragen

Keine — im Grill-Interview alle geklärt.
