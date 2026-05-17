import { defineConfig } from 'vite';

/**
 * Vite-Konfiguration.
 *
 * `base: './'` -> alle Asset-Pfade in der gebauten Seite sind RELATIV. So
 * läuft das Spiel sowohl lokal als auch unter dem Unterpfad von GitHub Pages
 * (https://robin7331.github.io/zen-robot-garden/), ohne den Repo-Namen fest
 * zu verdrahten.
 */
export default defineConfig({
  base: './',
});
