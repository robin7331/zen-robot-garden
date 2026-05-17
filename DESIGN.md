# Zen Robot Garden — Design 🎨

> Diese Datei beschreibt, **wie der Garten aussieht** — Stil, Farben, Licht, Größen.
> Wie `CLAUDE.md` ist sie auf **Deutsch und einfach erklärt**, damit auch ein
> 10-jähriges Kind mitplanen kann. Code-Namen (Tokens) sind **Englisch**.
>
> `CLAUDE.md` sagt *was* gebaut wird. `DESIGN.md` sagt *wie es aussieht*.

## Wozu dieses Dokument?

Es sammelt alle **Design-Tokens** — feste Werte für Farben, Größen und Abstände.
Wenn jemand fragt "Welches Grün hat das Gras?" oder "Wie groß ist der Roboter?",
steht die Antwort hier.

**Wichtig:** Dieses Dokument beschreibt den **Endzustand** — wie der Garten am Ende
aussehen soll. Wir fangen trotzdem mit einem einfachen Proof-of-Concept an, der nur
aus **Kisten** besteht. Der Stil hier ist das Ziel, auf das wir hinarbeiten.

## Der Stil-Nordstern

Der Garten ist ein **Flat-Shaded-Low-Poly-Diorama**.

- **Low-Poly:** Alles ist aus wenigen, gut sichtbaren **Facetten** (Flächen) gebaut —
  wie aus Papier gefaltet. Eine Baumkrone ist keine glatte Kugel, sondern eine
  Kugel aus erkennbar wenigen Dreiecken.
- **Flat Shading:** Jede Facette hat **eine einzige flache Farbe/Helligkeit**, harte
  Kanten dazwischen, kein weiches Glätten. Genau das macht den Origami-/Papier-Look.
- **Keine Texturen:** Die Objekte bekommen ihre Farbe direkt aus der Palette —
  keine aufgemalten Bilder.
- **Keine Outlines:** Keine schwarzen Umrandungen. Der Stil lebt von reinen Flächen.

**Faceting-Grad:** mittelgrob. Grundsatz statt fester Polygon-Zahl: *so wenig
Facetten wie nötig, damit die Form noch klar lesbar ist.* Eine Kugel darf kantig
sein, aber nicht zum Würfel werden. Pro Objekt im Code feinjustierbar.

> **Stimmungs-Referenz:** Es gab auch ein handgemaltes ("painterly") Referenzbild.
> Das gilt **nur für Farbstimmung und Atmosphäre** — *nicht* für die Render-Technik.
> Die Technik ist immer Flat-Shaded-Low-Poly.

## Die visuelle Idee

Ein **schwebendes Diorama** — ein Stück Garten als Modell, das frei im Raum schwebt.
Man schaut von schräg oben darauf, wie auf ein Modell in der Hand.

- Oben: flacher, rechteckiger **Rasen**.
- Darunter: eine **Erd-Schicht** und eine **Fels-Schicht**, die nach unten
  **zackig ausfranst** — als wäre das Stück Garten aus dem Boden gerissen.
- Drumherum: nur ein **weicher, bläulicher Farbverlauf** — kein echter Himmel,
  kein Horizont, kein Boden. Das Diorama schwebt im Nichts.

Sehr **ruhig und "zen"**: ein immer gleicher, freundlicher Mittag. Keine Tageszeit,
kein Wetter, kein Punktestand. Man schaut einfach dem Roboter beim Mähen zu.

## Hintergrund

Ein **weicher vertikaler Farbverlauf**, bläulich — wie ein heller Himmel, aber ohne
Wolken oder Sonne. Lenkt nicht ab, der Garten bleibt der Star.

| Token | Farbe | Was |
|---|---|---|
| `bg-top` | `#cdd9e6` | Verlauf oben (heller) |
| `bg-bottom` | `#9aa9c0` | Verlauf unten (gedämpfter) |

## Licht & Schatten

- **Eine Sonne** (directional light), schräg von oben-seitlich. Sie gibt jeder
  Facette ihre flache Helligkeit — so wird die Geometrie überhaupt erst lesbar.
  Die Sonne steht **fix** (keine Tageszeit).
- **Weiches Füll-Licht** (ambient), leicht bläulich getönt — der Himmel-Reflex.
  Schattenseiten bleiben sichtbar, nichts säuft ins Schwarze ab.
- **Echte weiche Schlagschatten:** Haus, Baum, Pflanze und Roboter werfen einen
  Schatten in Sonnen-Richtung auf den Rasen. Weich gerendert (Soft Shadows),
  dezent, leicht bläulich getönt — keine harten schwarzen Ränder. Der wandernde
  Roboter-Schatten macht seine Fahrt lebendig und verankert ihn am Boden.

| Token | Farbe | Was |
|---|---|---|
| `sun` | `#fff4e0` | Sonnenlicht (leicht warm) |
| `ambient` | `#b9c8dd` | Füll-Licht (Himmel-Blau-Tönung) |

## Kamera

Eine **orthografische** Kamera (keine Fluchtpunkt-Perspektive). Sie gibt den echten
"Modell"-Look: parallele Kanten, wie ein technisches Modell.

- **Orbit:** um die Garten-Mitte **360° drehbar**, rein-/raus-zoomen über die
  Frustum-Größe.
- **Neigung begrenzt:** immer schräg von oben — zwischen ca. **25° und 70°** über
  dem Horizont. Man kann *nicht* flach von der Seite oder von unten gucken.
  Das hält die Diorama-Stimmung und verhindert hässliche Blickwinkel.
- **Start-Blickwinkel:** ca. **30° Neigung**, leicht gedreht, der ganze Garten
  ist im Bild.

Bedienung: **Maus** (Computer) und **Finger** (Tablet).

## Farbpalette

Das Herzstück. Alle Objektfarben kommen aus dieser Tabelle. Kräftige, aber nicht
grelle Töne. Warm-kühl-Balance: warmes Gras/Holz gegen kühlen Himmel/Fels.
Der **orange Roboter** ist der einzige knallige Akzent — der Blick bleibt bei ihm.

### Gras (Mäh-Stufen)

Die Grashöhe wird auf eine **5-stufige Grün-Rampe** gekoppelt: langes Gras ist
satt und dunkel, frisch gemähtes Gras ein helleres Grün (bewusst **nicht** gelb).
Der Kontrast zwischen gemäht und ungemäht gibt den Mäh-Spiel-Look, bleibt aber
ganz im Grün-Bereich (siehe "Der Rasen").

| Token | Farbe | Stufe |
|---|---|---|
| `grass-1` | `#3f7a26` | lang (10 cm) — satt, dunkel |
| `grass-2` | `#4f872d` | |
| `grass-3` | `#5f9534` | mittel |
| `grass-4` | `#699e38` | |
| `grass-5` | `#73a93c` | frisch gemäht (~2,6 cm) — helleres Grün |

### Welt & Objekte

| Token | Farbe | Was |
|---|---|---|
| `soil` | `#6b4a2f` | Erd-Band unter dem Rasen |
| `rock` | `#5f5953` | Fels-Schicht / zackige Unterseite |
| `house-wall` | `#e8e2d4` | Hauswand (warmes Off-White) |
| `house-roof` | `#3c3f43` | Dach (dunkler Schiefer) |
| `house-wood` | `#7a5638` | Holzrahmen / -balken |
| `tree-trunk` | `#5b4632` | Baumstamm |
| `tree-foliage` | `#4f8f4a` | Baumkrone (anderes Grün als der Rasen) |
| `plant` | `#5a9b4e` | Pflanze / Strauch |
| `robot-body` | `#e8862f` | Roboter-Körper (warmes Orange) |
| `robot-dark` | `#2a2a2c` | Räder, Klinge, Sensor, Details |
| `flower-stem` | `#4a7a32` | Blumen-Stängel (Wiesengrün) |
| `flower-leaf` | `#5f9a3e` | Keimling-Blättchen (Jungtriebgrün) |
| `daisy-petal` | `#f4f3ee` | Gänseblümchen-Blütenblätter (Weiß) |
| `daisy-center` | `#f2c12e` | Gänseblümchen-Körbchen (Gelb) |

## Maße & Proportionen

Echte Einheiten (cm / m). Startwerte — im Code feinjustierbar.

| Element | Maß | Anmerkung |
|---|---|---|
| Rasen | **8 m × 6 m** | rechteckig, sanft gewelltes Gelände (~±0,4 m) |
| Roboter | **60 cm lang · 45 cm breit · 25 cm hoch** | echter Mähroboter-Maßstab |
| Antriebsräder | **Ø 20 cm** | zwei Stück, seitlich |
| Gras lang | **10 cm** | ungemäht — dichter Teppich |
| Gras gemäht | **~2,6 cm** | frisch gemäht (Stummel) |
| Mäh-Gitter (Zelle) | **10 cm × 10 cm** | intern; ein Gras-Büschel pro Zelle |
| Haus | **3 m × 3 m Grundfläche · 3,5 m First-Höhe** | |
| Baum | **5 m hoch · Krone Ø ~3,5 m** | |
| Pflanze / Strauch | **50 cm hoch** | |
| Erd-Band | **30 cm** | direkt unter der Gras-Decke (Wand-Band) |
| Fels-Schicht | **70 cm** | darunter, bis zum flachen Boden des Blocks |

**Logik:** Langes Gras (10 cm) reicht dem 25-cm-Roboter bis ~40 % seiner Höhe —
gut sichtbar, klar überfahrbar, und wird auf ~2,6 cm heruntergemäht. Der scharfe
Höhen-Absatz dazwischen ist das Hauptsignal der Mähspur. Der 8-m-Rasen fasst gut
13 Roboter-Längen → genug Platz zum Fahren und Mähen.

## Der Diorama-Block

- **Gewellte Oberseite:** Der Rasen ist ein sanft gewelltes **3D-Gelände** —
  Hügel und Mulden statt einer flachen Platte (siehe `terrain.ts`). Maximale
  Steigung ca. 20°, Gesamt-Relief ~±0,4 m.
- **Gras-Decke:** ein unterteiltes, höhenverschobenes Mesh, **flat-shaded** —
  kantige Low-Poly-Hügel, passt zum Origami-Look.
- **Seitenwände** sind senkrechte Schnitte: ihre Oberkante folgt dem Gelände,
  der Boden ist flach. Sie zeigen drei waagerechte Bänder — dünnes Gras, dann
  das `soil`-Erd-Band, dann die `rock`-Fels-Schicht: ein Geländequerschnitt.
- **Gras-Lippe:** Die Gras-Decke ragt ein kleines Stück über die Wand-Oberkante
  hinaus, das Gras "hängt über".

## Der Rasen & das Gras

- Der Rasen ist **kein sichtbares Raster** und keine Farb-Kacheln. Er besteht aus
  vielen einzelnen **Gras-Büscheln**.
- Ein **Büschel** = ein Tuft aus 3–5 schmalen Low-Poly-Klingen. Pro interner
  Gitter-Zelle (10 × 10 cm) steht ein Büschel. Viele Büschel = dichter Rasen.
- **Mähen:** Fährt der Roboter über ein Büschel, wird es **kurz** (10 cm → ~2,6 cm
  Stummel). Verfehlt er ein Büschel, bleibt es **lang stehen**. Die Mähspur ist
  also eine Schneise aus kurzem Gras zwischen langem — man sieht genau, wo der
  Roboter war (und wo nicht).
- **Höhe UND Farbe als Signal:** langes Gras nutzt die dunkleren Stufen der
  Grün-Rampe, kurzes die hellen Limettentöne — der Kontrast ist bewusst kräftig.
- **Mäh-Streifen:** Über das gemähte Gras laufen helle/dunkle Bänder wie bei
  einem frisch gemähten Rasen (weltachsen-parallel, im langen Gras gedämpft).
- **Nachwachsen:** Ein gemähter Stummel wächst **flüssig** wieder hoch — der Büschel
  wird sichtbar Stück für Stück höher (keine Sprünge). Die Nachwachs-Geschwindigkeit
  ist einstellbar. So wird der Garten nie "fertig" — schön zen und endlos.

### 3D-Grashalme (`BLADES`)

Echtes 3D-Gras: viele kleine instanzierte Halme über dem Mäh-Gitter
(`grass.ts`). Ein Shader liest Höhe und Plattdrücken je Halm direkt aus der
Höhen-Textur des Gitters. Startwerte, im Code (`tokens.ts`) feinjustierbar.

| Token | Wert | Was |
|---|---|---|
| `density` | **6500 /m²** | Halme je m² (8×6 m → ~312000 Halme) — dichter Teppich |
| `height` | **10 cm** | voll gewachsene Halm-Höhe (langes Gras) |
| `baseWidth` | **2,4 cm** | Fußbreite des Halm-Dreiecks (breit → dichter Teppich) |
| `stubMin` | **0,26** | frisch gemäht bleibt ein Stummel (≈ 2,6 cm), nie kahl |
| `flattenRadius` | **0,25 m** | Radius der Plattdrück-Scheibe unter dem Roboter |
| `flattenRecoverTime` | **1,5 s** | wie lang plattgedrücktes Gras zum Aufrichten braucht |
| `windSpeed` | **1,2** | Tempo der Wind-Welle |
| `windStrength` | **0,28** | Wind-Stärke — Anteil der Halm-Höhe, um den die Spitze wandert |
| `stripeWidth` | **0,55 m** | Breite eines hellen bzw. dunklen Mäh-Streifens |
| `stripeStrength` | **0,16** | wie kräftig die Mäh-Streifen aufhellen/abdunkeln |

Wo der Roboter steht, klappen die Halme **platt** und richten sich danach
langsam wieder auf. Die Halme werfen/empfangen **keine Schatten** — die
Farb-Ebene darunter trägt sie. Sie scheint zwischen den Halmen durch.

## Gelände (`TERRAIN`, `SUSPENSION`)

Der Rasen ist ein sanft gewelltes 3D-Gelände (`terrain.ts`). Eine editierbare
Höhenkarte ist die einzige Wahrheit; Sicht-Meshes, Physik-Collider und die
Höhen-Textur des Gras-Shaders werden daraus abgeleitet. Startwerte, im Code
(`tokens.ts`) feinjustierbar.

| Token | Wert | Was |
|---|---|---|
| `TERRAIN.cellSize` | **0,25 m** | Raster-Zellgröße (8×6 m → 33×25 Stützpunkte) |
| `TERRAIN.seed` | fest | Seed des Start-Rauschens — gleicher Garten bei jedem Laden |
| `TERRAIN.maxSlopeDeg` | **20°** | Steigungs-Deckelung (immer kletterbar, kippt nie) |
| `TERRAIN.reliefAmplitude` | **0,4 m** | Ziel-Relief ±0,4 m vor der Deckelung |

Der Roboter ist ein **Raycast-Fahrzeug**: sein Körper schwebt auf vier
abgetasteten Rad-Punkten, je Rad eine Feder.

| Token | Wert | Was |
|---|---|---|
| `SUSPENSION.restLength` | **3 cm** | Ruhe-Federweg (Rad-Anker über dem Boden) |
| `SUSPENSION.stiffness` | **1600 N/m** | Federkonstante je Rad |
| `SUSPENSION.damping` | **75** | Dämpfung der senkrechten Rad-Geschwindigkeit |
| `SUSPENSION.maxForce` | **260 N** | Obergrenze der Federkraft je Rad |
| `BATTERY.climbDrain` | **0,03 /s** | Akku-Mehrverbrauch bei voller Bergauf-Fahrt |

## Der Roboter

Der Star der Szene — man schaut ihm endlos zu. Er muss gut **lesbar** sein und
ein bisschen **Charakter** haben.

- **Silhouette:** kompakter, leicht **gerundeter** Low-Poly-Körper — *nicht* die
  flache, fast unsichtbare "Puck"-Form echter Mähroboter. Etwas höher, freundlich.
- **Vorderseite klar erkennbar:** ein kleines Sensor-/"Gesicht"-Element vorn — man
  sieht sofort, wohin er fährt.
- **Räder:** zwei sichtbare Antriebsräder seitlich (Ø 20 cm), vorn ein kleines
  Stützrad/Gleiter. Räder dunkel (`robot-dark`); die Dreh-Bewegung soll sichtbar
  sein — der Roboter fährt ja *weil* sich die Räder drehen.
- **Sichtbare Mähklinge:** Der Körper sitzt mit einem kleinen Spalt über dem Boden.
  Im Spalt ist die rotierende **Klingen-Scheibe** sichtbar. Sie dreht beim Fahren
  mit **moderater** Drehzahl — erkennbar als "mäht gerade", aber nicht hektisch.
- **Farbe:** Körper warmes Orange (`robot-body`), Räder/Klinge/Sensor/Details
  schwarz (`robot-dark`). Das Orange ist der einzige knallige Akzent im ganzen
  Garten → der Blick folgt dem Roboter von allein.

## Haus, Baum, Pflanze

Stilisierter **europäischer** Garten — locker gehalten, nicht streng festgelegt.

- **Haus:** kleines Haus, helle Wand (`house-wall`), dunkles Dach (`house-roof`),
  sichtbare Holzbalken/-rahmen (`house-wood`).
- **Baum:** Laubbaum mit voller, runder Krone (ein, zwei facettierte Kugel-Cluster,
  `tree-foliage`), brauner Stamm (`tree-trunk`). Ganzjährig grün, keine
  Jahreszeiten-Logik, keine Blüten.
- **Pflanze:** schlichter grüner Strauch (`plant`) — ein kleines facettiertes
  Grün-Cluster, wie eine Mini-Baumkrone ohne Stamm. Ohne Blüten.

Haus, Baum und Pflanze **blockieren** den Roboter (anstoßen → zurück → wegdrehen),
genau wie die Rasenkante.

## Blumen (`FLOWERS`)

Über den Rasen sind **ein paar Gänseblümchen** in kleinen Gruppen gestreut
(seed-fest, also bei jedem Laden gleich). Aufbau aus Grundformen, low-poly und
flat-shaded: kurzer Stängel, gelbes Körbchen, ein Kranz weißer Blütenblätter.

**Lebenszyklus** — jede Blume sitzt an einem festen Platz und altert von
**Keimling → Blüte** (die Blüte bleibt dann).

- **Mähen:** Fährt der **mähende** Roboter über eine Blume (Schnitt-Radius wie
  beim Mäh-Gitter), schrumpft sie in `mowShrinkTime` zum Keimling zusammen und
  altert von vorn. Auf der gemähten Fläche blühen Blumen so kaum auf — nur im
  ungemähten Randstreifen ganz.
- Die Blumen sind **keine Hindernisse** (keine Physik-Körper): der Roboter mäht
  durch sie hindurch. Sie wiegen sich in derselben Wind-Welle wie das Gras.

| Token | Wert | Was |
|---|---|---|
| `count` | 6 | Blumen insgesamt |
| `clusterCount` / `clusterRadius` | 3 / 0,55 m | Streu-Inseln + ihr Radius |
| `seedlingTime` | 60 s | Keimling → Blüte |
| `mowShrinkTime` | 0,4 s | Einschrumpfen nach dem Übermähen |
| `swayStrength` | 0,14 rad | größter Wieg-Winkel |

## Bewegung & Animation

Alles bewegt sich **ruhig und langsam** — die Szene ist bewusst zen.

- **Roboter-Fahrt:** mit Trägheit — sanft beschleunigen, sanft bremsen, Drehen
  braucht einen Moment (Details und Werte siehe `CLAUDE.md`).
- **Räder & Klinge** drehen sichtbar mit, solange der Roboter fährt.
- **Wind:** Langes Gras und die Baumkrone **wiegen sanft** — kleine Amplitude,
  lange/ruhige Periode, wie bei schwacher Brise. Reine Vertex-Animation im Shader.
  Frisch gemähte Stummel wiegen kaum (zu kurz).

## Heimweg: Leitdraht & Akku

Werte fürs autonome Heimfahren über den Leitdraht. Startwerte, im Code
(`tokens.ts`) feinjustierbar — es gibt bewusst kein Einstell-Panel.

| Token | Wert | Was |
|---|---|---|
| `BATTERY.low` | **0,5** | ab hier sucht der Roboter den Leitdraht (≈ 23 s Reserve) |
| `followLookahead` | **0,35 m** | Vorausschau-Punkt ("Carrot") des Leitdraht-Linienfolgers |
| `dockDropRadius` | **0,45 m** | Fang-Radius: so nah abgesetzt, dockt der Roboter an |
| `DOCK_RADIUS` | 0,18 m | präzise Ankunft des autonomen Linienfolgers an der Station |

**Leitdraht-Nägel** (`LEITDRAHT_NAILS`, Weltkoordinaten X/Z in Metern) — die
offene Draht-Linie vom Dock zur Y-Verzweigung am Begrenzungsdraht:

| Nagel | X | Z | Was |
|---|---|---|---|
| 0 | 3,54 | −1,6 | Dock — in der Ladestation |
| 1 | 0,4 | 0,3 | sanfter Knick |
| 2 | −3,6 | 1,0 | Y-Verzweigung auf den Begrenzungsdraht |

Beide Drähte teilen sich die Farbe `wire` (es ist physisch ein Draht). Die
Nägel sind als kleine Punkte in derselben Farbe sichtbar.

## UI / Bedien-Oberfläche

So wenig "Chrome" wie möglich — die Szene ist der Star.

- Standardmäßig nur ein kleines, dezentes **Zahnrad-Icon** in einer Ecke.
- Klick darauf öffnet ein **einklappbares Einstell-Panel** (z.B. Tempo,
  Nachwachs-Rate).
- Panel: halbtransparent, abgerundete Ecken, schlichte serifenlose Schrift,
  gedeckte Farben aus der Palette — kein knalliges UI.

> Das Einstell-Panel ist laut `CLAUDE.md` noch nicht final entschieden. Falls es
> kommt, gilt dieser Stil.

## Sound

Ruhige Ambience (Summen des Roboters, Vögel) ist **für später geplant** — und
**nicht Teil dieses visuellen Stil-Dokuments**. Hier nur als Erinnerung notiert.

## Später / nicht jetzt

Notiert, damit es nicht vergessen wird — aber jetzt noch nicht Teil des Stils:

- Echtes **Wasser** (Teich/Bach) als Deko — beide Stil-Referenzen hatten Wasser,
  der Garten aktuell nicht.
- **Blühende** Bäume/Sträucher als optionale Deko.
- Deko-Objekte (z.B. Trittsteine, Tonkrüge, kleiner Zaun).
- **Terraforming** — Hügel mit einem Pinsel selbst formen (das gewellte
  Gelände selbst ist erledigt, siehe `CLAUDE.md`).
- Detailliertere Modelle — der Flat-Shaded-Low-Poly-Stil bleibt aber bestehen.
