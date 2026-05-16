import { COLORS } from './tokens';

/**
 * Die HTML-Overlays über dem 3D-Canvas.
 *
 * Bewusst kein three.js, sondern ganz normale `<div>`s vor dem Canvas: der
 * Text ist gestochen scharf, lässt sich mit Maus und Finger gut bedienen und
 * stört die Render-Schleife nicht. `main.ts` ruft pro Bild nur `update()` auf.
 *
 *   - Akku-Widget: der ruhige, "zen"-taugliche Anzeiger oben links.
 *   - FPS-Anzeige: eine kleine Entwickler-Hilfe oben rechts (Bilder/Sekunde).
 *
 * Ein Einstell-Panel (Tempo, Nachwachs-Rate) wäre ein eigener, späterer Schritt.
 */

/** Grobe Tätigkeit des Roboters — bestimmt den Status-Text. */
export type RobotActivity =
  | 'mowing'
  | 'seeking'
  | 'following'
  | 'charging'
  | 'leaving'
  | 'dead'
  | 'stopped'
  | 'held';

/** Status-Text auf Deutsch, passend zur Tätigkeit. */
const STATUS_TEXT: Record<RobotActivity, string> = {
  mowing: 'mäht',
  seeking: 'fährt heim',
  following: 'folgt dem Leitdraht',
  charging: 'lädt',
  leaving: 'verlässt die Station',
  dead: 'Akku leer',
  stopped: 'steht außerhalb',
  held: 'wird getragen',
};

/** Akku-Farbe nach Stand: voll grün, mittel orange, niedrig rot. */
function batteryColor(level: number): string {
  if (level <= 0.25) return COLORS.batteryLow;
  if (level <= 0.5) return COLORS.batteryMid;
  return COLORS.batteryFull;
}

// Styles des Widgets — einmalig in einen <style>-Block geschrieben.
const CSS = `
#ui {
  position: fixed;
  top: 16px;
  left: 16px;
  pointer-events: none; /* Klicks fallen durch auf den Canvas */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.battery {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 10px;
  border-radius: 999px;
  background: rgba(30, 34, 42, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #fff;
  user-select: none;
}
/* Das Akku-Gehäuse: ein Bauklotz-Kasten mit kleinem Plus-Pol rechts. */
.battery-cell {
  position: relative;
  display: flex;
  width: 46px;
  height: 22px;
  padding: 2px;
  box-sizing: border-box;
  border: 2.5px solid rgba(255, 255, 255, 0.85);
  border-radius: 5px;
}
.battery-cell::after {
  content: '';
  position: absolute;
  top: 50%;
  right: -6px;
  width: 4px;
  height: 9px;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.85);
  border-radius: 0 2px 2px 0;
}
/* Die Füllung — Breite = Akku-Stand, Farbe = Stufe. */
.battery-fill {
  height: 100%;
  width: 0%;
  border-radius: 2px;
  transition: width 0.3s ease, background-color 0.3s ease;
}
.battery-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.battery-percent {
  font-size: 14px;
  font-weight: 600;
}
.battery-status {
  font-size: 11px;
  opacity: 0.7;
}
/* Beim Laden pulsiert die Füllung sanft. */
.battery.is-charging .battery-fill {
  animation: battery-pulse 1.6s ease-in-out infinite;
}
@keyframes battery-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

/** Das fertige Widget — `main.ts` braucht nur noch `update()`. */
export interface BatteryUI {
  /** Aktualisiert Balken, Prozent und Status. Einmal pro Bild aufrufen. */
  update(level: number, activity: RobotActivity): void;
}

/** Erzeugt das Akku-Widget und hängt es ins Dokument. */
export function createBatteryUI(): BatteryUI {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const ui = document.createElement('div');
  ui.id = 'ui';
  ui.innerHTML = `
    <div class="battery">
      <div class="battery-cell"><div class="battery-fill"></div></div>
      <div class="battery-text">
        <div class="battery-percent">–</div>
        <div class="battery-status">–</div>
      </div>
    </div>`;
  document.body.appendChild(ui);

  const battery = ui.querySelector('.battery') as HTMLElement;
  const fill = ui.querySelector('.battery-fill') as HTMLElement;
  const percent = ui.querySelector('.battery-percent') as HTMLElement;
  const status = ui.querySelector('.battery-status') as HTMLElement;

  return {
    update(level: number, activity: RobotActivity): void {
      const clamped = Math.max(0, Math.min(1, level));
      fill.style.width = `${clamped * 100}%`;
      fill.style.backgroundColor = batteryColor(clamped);
      percent.textContent = `${Math.round(clamped * 100)}%`;
      status.textContent = STATUS_TEXT[activity];
      battery.classList.toggle('is-charging', activity === 'charging');
    },
  };
}

// Styles der FPS-Anzeige — dezent, in der Optik des Akku-Widgets.
const FPS_CSS = `
#fps {
  position: fixed;
  top: 16px;
  right: 16px;
  pointer-events: none; /* Klicks fallen durch auf den Canvas */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.fps {
  padding: 7px 13px;
  border-radius: 999px;
  background: rgba(30, 34, 42, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  /* Ziffern gleich breit -> die Zahl zappelt beim Aktualisieren nicht. */
  font-variant-numeric: tabular-nums;
  user-select: none;
}
`;

/** Die FPS-Anzeige — `main.ts` braucht nur noch `update()`. */
export interface FpsUI {
  /** Verrechnet die Dauer eines Bildes (Sekunden). Einmal pro Bild aufrufen. */
  update(frameDt: number): void;
}

/** Erzeugt die FPS-Anzeige und hängt sie ins Dokument. */
export function createFpsUI(): FpsUI {
  const style = document.createElement('style');
  style.textContent = FPS_CSS;
  document.head.appendChild(style);

  const ui = document.createElement('div');
  ui.id = 'fps';
  ui.innerHTML = `<div class="fps">– FPS</div>`;
  document.body.appendChild(ui);
  const label = ui.querySelector('.fps') as HTMLElement;

  // Geglättete Bilder/Sekunde: ein exponentieller Mittelwert dämpft das
  // Zappeln einzelner Bilder. Den DOM-Text malen wir nur ein paar Mal pro
  // Sekunde neu — die Zahl bleibt ruhig lesbar.
  let smoothFps = 60;
  let sinceRedraw = 0;

  return {
    update(frameDt: number): void {
      if (frameDt > 0) {
        smoothFps += (1 / frameDt - smoothFps) * 0.1;
      }
      sinceRedraw += frameDt;
      if (sinceRedraw >= 0.25) {
        sinceRedraw = 0;
        label.textContent = `${Math.round(smoothFps)} FPS`;
      }
    },
  };
}
