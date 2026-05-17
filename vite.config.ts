import { defineConfig } from 'vite';

/**
 * Vite-Konfiguration.
 *
 * `base: './'` -> alle Asset-Pfade in der gebauten Seite sind RELATIV. So
 * läuft das Spiel sowohl lokal als auch unter dem Unterpfad von GitHub Pages
 * (https://robin7331.github.io/zen-robot-garden/), ohne den Repo-Namen fest
 * zu verdrahten.
 *
 * `build.outDir: 'docs'` -> der Produktions-Build landet im Ordner `docs/`.
 * GitHub Pages kann pro Branch genau diesen Ordner direkt ausliefern ("Deploy
 * from branch", Pfad `/docs`) — kein GitHub-Actions-Build nötig. Darum wird
 * `docs/` mit ins Repo eingecheckt (nicht ignoriert).
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
  },
});
