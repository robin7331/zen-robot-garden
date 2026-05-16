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
satt und dunkel, frisch gemähtes Gras hell. Die Farbe ist nur ein *dezentes*
Zusatz-Signal — die Hauptaussage ist die **Höhe** (siehe "Der Rasen").

| Token | Farbe | Stufe |
|---|---|---|
| `grass-1` | `#4a7a32` | lang (10 cm) — satt, dunkel |
| `grass-2` | `#618f3d` | |
| `grass-3` | `#78a448` | mittel |
| `grass-4` | `#8fba53` | |
| `grass-5` | `#a6cf5e` | frisch gemäht (3 cm) — hell |

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

## Maße & Proportionen

Echte Einheiten (cm / m). Startwerte — im Code feinjustierbar.

| Element | Maß | Anmerkung |
|---|---|---|
| Rasen | **8 m × 6 m** | leicht rechteckig, flach |
| Roboter | **60 cm lang · 45 cm breit · 25 cm hoch** | echter Mähroboter-Maßstab |
| Antriebsräder | **Ø 20 cm** | zwei Stück, seitlich |
| Gras lang | **10 cm** | ungemäht |
| Gras gemäht | **3 cm** | frisch gemäht (Stummel) |
| Mäh-Gitter (Zelle) | **10 cm × 10 cm** | intern; ein Gras-Büschel pro Zelle |
| Haus | **3 m × 3 m Grundfläche · 3,5 m First-Höhe** | |
| Baum | **5 m hoch · Krone Ø ~3,5 m** | |
| Pflanze / Strauch | **50 cm hoch** | |
| Slab: Erd-Band | **30 cm** | direkt unter dem Rasen |
| Slab: Fels-Schicht | **70 cm** | darunter, franst zackig aus |

**Logik:** Langes Gras (10 cm) reicht dem 25-cm-Roboter bis ~40 % seiner Höhe —
gut sichtbar, klar überfahrbar. Der 8-m-Rasen fasst gut 13 Roboter-Längen → genug
Platz zum Fahren und Mähen.

## Der Slab (die Diorama-Box)

- **Rechteckig.** Oberseite = flacher Rasen (Hügel/Gelände kommen laut `CLAUDE.md`
  erst später).
- **Seiten zweischichtig:** oben das dünne `soil`-Erd-Band, darunter die dickere
  `rock`-Fels-Schicht.
- **Obere Kanten sauber rechteckig**, nach unten **franst der Fels zackig aus** —
  der "aus dem Boden gerissen / schwebende Insel"-Look.
- **Gras-Lippe:** Der Rasen ragt ein kleines Stück über die obere Kante hinaus,
  das Gras "hängt über".

## Der Rasen & das Gras

- Der Rasen ist **kein sichtbares Raster** und keine Farb-Kacheln. Er besteht aus
  vielen einzelnen **Gras-Büscheln**.
- Ein **Büschel** = ein Tuft aus 3–5 schmalen Low-Poly-Klingen. Pro interner
  Gitter-Zelle (10 × 10 cm) steht ein Büschel. Viele Büschel = dichter Rasen.
- **Mähen:** Fährt der Roboter über ein Büschel, wird es **kurz** (10 cm → 3 cm
  Stummel). Verfehlt er ein Büschel, bleibt es **lang stehen**. Die Mähspur ist
  also eine Schneise aus kurzem Gras zwischen langem — man sieht genau, wo der
  Roboter war (und wo nicht).
- **Hauptsignal Höhe**, Farbe nur dezent mitgekoppelt: langes Gras nutzt die
  dunkleren Stufen der Grün-Rampe, kurzes die helleren.
- **Nachwachsen:** Ein gemähter Stummel wächst **flüssig** wieder hoch — der Büschel
  wird sichtbar Stück für Stück höher (keine Sprünge). Die Nachwachs-Geschwindigkeit
  ist einstellbar. So wird der Garten nie "fertig" — schön zen und endlos.

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
- **Hügel / Gelände** statt flachem Rasen (siehe `CLAUDE.md`).
- Detailliertere Modelle — der Flat-Shaded-Low-Poly-Stil bleibt aber bestehen.
