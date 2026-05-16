# Zen Robot Garden 🤖🌿

> Diese Datei beschreibt das Projekt. Sie ist auf **Deutsch und einfach erklärt**, damit
> auch ein 10-jähriges Kind beim Planen mitmachen kann. Wo es hilft, gibt es Beispiele.

## Worum geht es?

Wir bauen ein **3D-Spiel im Browser**. Es ist ein kleiner Garten wie ein **Diorama** —
also wie ein Modell in einer Schachtel, auf das man von schräg oben schaut.

Im Garten gibt es:

- einen **Rasen**
- ein kleines **Haus**
- einen **Baum**
- eine **Pflanze**
- einen **Mähroboter**, der von ganz allein umherfährt und mäht

Es ist eine **ruhige Sandbox** ("zen"): Es gibt keine Punkte, man kann nicht gewinnen
oder verlieren. Man schaut einfach dem Roboter zu, wie er den Garten mäht. Endlos.

## Der Mähroboter

### Wie er fährt

- Der Roboter fährt **ganz allein** (autonom). Niemand steuert ihn.
- Er fährt **geradeaus**, bis er an eine Grenze oder ein Hindernis stößt. Dann fährt er
  ein kleines Stück **zurück** und dreht sich in eine **zufällige Richtung** weg.
  Genau so macht es ein echter Mähroboter mit seinem Stoßsensor.
- Er hat **zwei Räder mit je einem Motor** (das nennt man *Differentialantrieb*).
  Der Roboter fährt **nur**, weil sich seine Räder drehen — er wird nicht "gebeamt".
  - Beide Räder gleich schnell → er fährt geradeaus.
  - Ein Rad schneller als das andere → er fährt eine Kurve.
- Er fährt **mit Trägheit**: Er wird langsam schneller (beschleunigt), bremst sanft ab,
  und Drehen braucht einen kurzen Moment. Wie ein echtes Fahrzeug mit Gewicht.

Die Werte (Höchstgeschwindigkeit, Beschleunigung, Drehgeschwindigkeit) sollen
**einstellbar** sein.

## Der Garten (die Welt)

- Der **Rasen** ist erst einmal **rechteckig und flach**.
- **Haus, Baum und Pflanze blockieren** den Roboter — er stößt dagegen wie an die
  Rasenkante (anstoßen → zurück → wegdrehen).
- Über den Rasen legen wir ein unsichtbares **Gitter aus vielen kleinen Feldern**.
  Jedes Feld merkt sich eine Zahl: *Wie lang ist hier das Gras?*
  - Fährt der Roboter über ein Feld, wird das Gras dort **kurz** ("gemäht").
  - Dieses Gitter ist gleichzeitig die **Mähspur** — man sieht, wo der Roboter war.
- Gemähtes Gras **wächst langsam wieder nach**. Die Nachwachs-Geschwindigkeit ist
  **einstellbar**. So hat der Roboter nie wirklich "fertig" — schön zen und endlos.
- Am Anfang zeigen wir die Grashöhe nur über die **Farbe** (lang = dunkler,
  kurz = heller). Echtes 3D-Gras kommt später.

## Die Kamera

Eine **Dreh-Kamera** (Orbit): Man kann mit Maus oder Finger den Garten **drehen** und
**rein-/rauszoomen** — wie wenn man ein Modell in die Hand nimmt und von allen Seiten
anschaut. Es bleibt aber eine ruhige Diorama-Ansicht von schräg oben.

Das Spiel soll auf **Computer (Maus)** und **Tablet (Finger)** laufen.

## Technik (Tech-Stack)

| Werkzeug | Wozu |
|----------|------|
| **three.js** | Werkzeugkiste für 3D im Browser (Formen, Licht, Kamera). |
| **Vite** | Der "Startknopf" zum Entwickeln — zeigt das Spiel sofort im Browser und lädt nach jeder Änderung blitzschnell neu. |
| **TypeScript** | Die Programmiersprache. Wie JavaScript, aber mit einem "Aufpasser", der Tippfehler meckert, *bevor* das Spiel startet. |
| **Rapier** (`@dimforge/rapier3d`) | Die **Physik-Engine** — ein "Physik-Rechner", der Schwerkraft, Reibung, Rollen und Anstoßen von selbst ausrechnet. |

### Warum eine Physik-Engine?

Der Roboter soll **wirklich über seine Räder fahren**: Die zwei Rad-Motoren drehen die
Räder, die Räder haben **Reibung** mit dem Gras, und diese Reibung **schiebt** den
Roboter vorwärts. Trägheit, später auch Hügel und Schlupf bei nassem Gras — das rechnet
die Physik-Engine fast geschenkt mit. Darum ist Rapier **von Anfang an** dabei.

### Objekte erst selbst bauen

Roboter, Haus, Baum und Pflanze bauen wir zuerst aus **einfachen Grundformen**
(Würfel, Kugeln, Zylinder) zusammen — Bauklotz-/LEGO-Look, passt zum Diorama.
Beispiel: Haus = Würfel + Dach-Dreieck, Baum = brauner Zylinder + grüne Kugel.
Fertige, detaillierte 3D-Modelle kommen erst später.

## Sprach-Regeln für das Projekt

- **Doku** (`CLAUDE.md`, `design.md`, README) und **Texte im Spiel**: **Deutsch**,
  einfach erklärt mit Beispielen.
- **Code-Kommentare**: Deutsch.
- **Code selbst** (Namen von Variablen und Funktionen): **Englisch** —
  z.B. `robotSpeed`, `mowGrid`, nicht `roboterTempo`.

## Reihenfolge: zuerst, dann später

**Jetzt zuerst:** sauberes, realistisches **Fahren** (Physik, Differentialantrieb,
Trägheit, Abprallen) und die **3D-Szene** (Garten aus Grundformen, Dreh-Kamera,
Mähspur über Farbe).

**Später geplant** (notiert, damit wir es nicht vergessen — aber jetzt noch nicht):

- Echtes **3D-Gras** mit Höhe (Gras-Büschel statt nur Farbe)
- **Krumme Rasenformen** und ein verlegbarer **Begrenzungsdraht**
- **Ladestation** mit Akku: Roboter fährt bei leerem Akku heim und lädt
- **Hügel / Gelände** statt flachem Rasen
- **Schlupf bei nassem Wetter** (Räder drehen durch)
- Fertige, detaillierte **3D-Modelle** statt Grundformen
- Vielleicht später leichte **Spielmechanik** (z.B. "ganzen Rasen mähen")

## Noch zu klären (im nächsten Schritt / in `design.md`)

- Beleuchtung & Schatten + Himmel — Vorschlag: weiche Schatten + Farbverlauf-Himmel.
- Kleines Einstell-Panel zum Rumspielen (Tempo, Nachwachs-Rate)? Oder Werte nur in
  einer Datei?
- Sound (Summen, Vögel) — später oder ganz weglassen?

## Nächster Schritt

Eine `design.md` planen: Sie sammelt alle **Design-Tokens** — also feste Werte für
Farben, Größen und Abstände, die bestimmen, *wie* der Garten aussieht.
