# Zen Robot Garden 🤖🌿

Ein **3D-Spiel im Browser**: ein kleiner Garten wie ein Diorama, in dem ein
**Mähroboter** ganz von allein endlos seine Runden mäht. Es gibt keine Punkte,
man kann nicht gewinnen oder verlieren — man schaut einfach zu. Ruhig, "zen".

**▶️ Spielen:** https://robin7331.github.io/zen-robot-garden/

## Was es zu sehen gibt

- Ein **Mähroboter**, der autonom über echte Rad-Physik fährt, am
  Begrenzungsdraht und an Hindernissen abprallt und bei leerem Akku dem
  Leitdraht zurück zur **Ladestation** folgt.
- Ein **gewelltes 3D-Gelände** mit Hügeln und Mulden.
- Echtes **3D-Gras**, das der Roboter mäht, platt drückt und das nachwächst —
  die **Mähspur** bleibt sichtbar.
- Ein paar **Gänseblümchen**, die wachsen und blühen.

## Bedienung

- **Kamera drehen / zoomen:** Maus ziehen bzw. Mausrad — auf dem Tablet mit
  dem Finger.
- **Roboter packen und verschieben:** auf den Roboter klicken/tippen und
  ziehen. So holt man ihn auch zurück, falls er außerhalb des Drahts hält.
- **Ästchen ablegen:** kurzer Klick/Tipp auf den Rasen — der Roboter weicht
  ihm aus.

## Technik

[three.js](https://threejs.org/) für die 3D-Szene, die Physik-Engine
[Rapier](https://rapier.rs/) für Fahren, Anstoßen und Schwerkraft,
[Vite](https://vitejs.dev/) als Build-Werkzeug, geschrieben in TypeScript.

Mehr Details: [`CLAUDE.md`](./CLAUDE.md) (Projektbeschreibung) und
[`DESIGN.md`](./DESIGN.md) (Design-Tokens).

## Lokal starten

```bash
npm install
npm run dev      # Entwicklungsserver mit Live-Reload
npm run build    # Produktions-Build nach dist/
```

## Veröffentlichen

Jeder Push auf `main` baut das Spiel und veröffentlicht es über einen
GitHub-Actions-Workflow ([`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml))
automatisch auf GitHub Pages.
