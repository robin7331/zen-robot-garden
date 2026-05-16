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
- Er fährt **geradeaus**, bis er den **Begrenzungsdraht** (siehe unten) erreicht oder
  an ein **Hindernis stößt**. Dann fährt er ein kleines Stück **zurück** und dreht sich
  in eine **zufällige Richtung** — am Draht wie am Hindernis **genau gleich**, so wie
  ein echter Mähroboter. Die Drahtspule spürt nur *innen/draußen*, nicht die
  Richtung des Drahts — darum lenkt der Roboter nicht gezielt ins Feld, sondern
  dreht einfach zufällig. Zeigt er danach wieder zum Draht, kreuzt er ihn eben
  nochmal — an Ecken auch mehrmals kurz hintereinander, wie im echten Garten.
- Er hat **zwei Räder mit je einem Motor** (das nennt man *Differentialantrieb*).
  Der Roboter fährt **nur**, weil sich seine Räder drehen — er wird nicht "gebeamt".
  - Beide Räder gleich schnell → er fährt geradeaus.
  - Ein Rad schneller als das andere → er fährt eine Kurve.
- Er fährt **mit Trägheit**: Er wird langsam schneller (beschleunigt), bremst sanft ab,
  und Drehen braucht einen kurzen Moment. Wie ein echtes Fahrzeug mit Gewicht.

Die Werte (Höchstgeschwindigkeit, Beschleunigung, Drehgeschwindigkeit) sollen
**einstellbar** sein.

## Der Garten (die Welt)

- Der **Rasen** ist **rechteckig** und hat ein sanft gewelltes **3D-Gelände** —
  Hügel und Mulden, über die der Roboter mit **echter Physik** fährt (er
  klettert bergauf, neigt sich in die Hänge, wird am Berg langsamer). Die
  Geländehöhe steckt in einer editierbaren **Höhenkarte** (`terrain.ts`);
  Sicht-Meshes, der Physik-Boden (ein Höhenfeld-Collider) und die Gras-Höhen-
  Textur werden alle daraus abgeleitet.
- **Haus, Baum und Pflanze blockieren** den Roboter — er **stößt** physisch dagegen
  und weicht aus (anstoßen → zurück → wegdrehen).
- Über den Rasen legen wir ein unsichtbares **Gitter aus vielen kleinen Feldern**.
  Jedes Feld merkt sich eine Zahl: *Wie lang ist hier das Gras?*
  - Fährt der Roboter über ein Feld, wird das Gras dort **kurz** ("gemäht").
  - Dieses Gitter ist gleichzeitig die **Mähspur** — man sieht, wo der Roboter war.
- Gemähtes Gras **wächst langsam wieder nach**. Die Nachwachs-Geschwindigkeit ist
  **einstellbar**. So hat der Roboter nie wirklich "fertig" — schön zen und endlos.
- Die Grashöhe zeigen wir mit **echten 3D-Grashalmen**: viele kleine Halme
  über dem Gitter, die der Roboter kurz mäht, beim Drüberfahren platt drückt
  und die langsam nachwachsen. Eine Farb-Ebene scheint zwischen den Halmen
  durch (lang = dunkler, kurz = heller).

### Der Begrenzungsdraht ("fence wire")

So wie bei einem **echten Mähroboter** liegt ein dünner **Draht** als geschlossene
Schleife im Rasen — ein Stück von der Kante nach innen. Der Roboter hat **zwei
Spulen-Sensoren**, einen vorne und einen hinten. Jede Spule "spürt", ob sie noch
**innerhalb** der Schleife ist oder schon **draußen**.

- Vordere Spule draußen → die Nase hat den Draht überquert → der Roboter setzt
  zurück und dreht in einen **zufälligen** Kurs — dieselbe Reaktion wie nach
  einem Stoß. Er **stößt also nirgends an**, sondern spürt die Grenze. Weil er
  zufällig dreht, kann er gleich wieder zum Draht zeigen und ihn nochmal
  kreuzen — genau dieses „Herantasten" sieht man bei echten Mährobotern auch.
- Beide Spulen draußen → der ganze Roboter ist aus der Schleife heraus. Dann
  **hält er an** — genau wie ein echter Mähroboter, der seine Grenze verliert.
  Man kann ihn dann einfach zurück auf den Rasen ziehen (siehe *Den Roboter
  anfassen*).

Der Draht ist als **dünne Linie sichtbar**, damit man versteht, warum der Roboter
dort umkehrt. Der schmale Streifen zwischen Draht und Rasenkante bleibt ungemäht —
wie der ungemähte Rand bei einem echten Rasen.

Noch ist der Draht ein festes **Rechteck**. Ein frei **verlegbarer** Draht und
krumme Rasenformen kommen später.

### Der Leitdraht (Heimweg)

Wenn der Akku fast leer ist, muss der Roboter zur **Ladestation** zurück.
Dafür gibt es einen zweiten Draht: den **Leitdraht**. Er liegt quer durch den
ganzen Garten — ein Ende steckt in der Ladestation, das andere Ende ist an
den Begrenzungsdraht angeschlossen. Das nennt man eine **Y-Verzweigung**: wie
ein Ast, der an einem Zweig hängt. In Wirklichkeit ist es ein einziger
physischer Draht.

So findet der Roboter heim — genau wie ein echter Mähroboter:

1. **Suchen:** Der Akku ist niedrig. Die Mähklinge geht aus (er mäht jetzt
   nicht mehr), aber er fährt **geradeaus weiter** und prallt am
   Begrenzungsdraht ab — bis seine vordere Spule den **Leitdraht** überquert.
   Weil der Leitdraht quer durch den ganzen Garten läuft, findet er ihn
   schnell.
2. **Folgen:** Jetzt fährt der Roboter genau am Leitdraht **entlang**, immer
   Richtung Ladestation. Er schaut dabei ein kleines Stück voraus auf den
   Draht und lenkt dorthin — so fährt er auch um Knicke sauber herum.
3. **Laden:** An der Station angekommen, dockt er an und lädt. Ist der Akku
   voll, fährt er rückwärts heraus und mäht weiter.

Geht der Akku doch einmal ganz auf **0** (zum Beispiel, weil der Roboter
unterwegs oft angestoßen ist), bleibt er stehen — er ist **leer** ("dead").
Helfen kann man nur, indem man ihn mit dem Finger zurück auf die
Ladestation **zieht**.

Beide Drähte bestehen aus **Nägeln**: geordnete Punkte, zwischen denen der
Draht schnurgerade läuft. Die Richtung ändert sich nur an einem Nagel. Die
Nägel sind als kleine Punkte sichtbar — ein Vorgeschmack darauf, dass man den
Draht später selbst verlegen kann.

## Die Kamera

Eine **Dreh-Kamera** (Orbit): Man kann mit Maus oder Finger den Garten **drehen** und
**rein-/rauszoomen** — wie wenn man ein Modell in die Hand nimmt und von allen Seiten
anschaut. Es bleibt aber eine ruhige Diorama-Ansicht von schräg oben.

Das Spiel soll auf **Computer (Maus)** und **Tablet (Finger)** laufen.

## Den Roboter anfassen

Man kann den Roboter mit Maus oder Finger **packen und verschieben** (drag and drop):
anheben, woanders absetzen, weiterschauen. So holt man ihn auch zurück, falls er
einmal außerhalb des Drahts angehalten hat. Beim Anheben stehen seine Räder still —
wie bei einem echten Mähroboter, den man hochhebt.

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
Mähspur). Echtes **3D-Gras** mit Höhe ist **erledigt** — instanzierte Halme über
dem Gitter, die der Roboter mäht, platt drückt und die nachwachsen (`grass.ts`).
Auch das gewellte **3D-Gelände** ist **erledigt** — der Roboter ist ein Raycast-
Fahrzeug auf vier abgetasteten Rad-Federn (`terrain.ts`, `robotController.ts`).

**Später geplant** (notiert, damit wir es nicht vergessen — aber jetzt noch nicht):

- **Krumme Rasenformen** und ein frei **verlegbarer Draht**, den man selbst mit
  **Nägeln** steckt. Das Nagel-Polylinien-Primitiv (gemeinsame Form von
  Begrenzungs- und Leitdraht) ist der erste Schritt dahin — noch sind beide
  Drähte feste Formen.
- **Terraforming**: Hügel und Mulden mit einem **Pinsel** selbst formen. Die
  Höhenkarte (`terrain.ts`) ist schon eine editierbare Datenstruktur — der
  Grundstein dafür. Eine spätere Pinsel-UI ändert nur das Array; Collider,
  Sicht-Meshes und Höhen-Textur werden dann neu gebaut. (Das gewellte Gelände
  selbst ist **erledigt** — nicht mehr flach.)
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
