/* ============================================================
   CHART.JS — registro central e instancias gestionadas
   Sustituye a allCharts + destroyAllCharts del original.
   ============================================================ */
import {
  Chart, LineController, LineElement, PointElement, BarController, BarElement,
  ScatterController, RadarController, RadialLinearScale, LinearScale, CategoryScale,
  DoughnutController, ArcElement,
  Tooltip, Legend, Filler,
} from 'chart.js';

Chart.register(
  LineController, LineElement, PointElement, BarController, BarElement,
  ScatterController, RadarController, RadialLinearScale, LinearScale, CategoryScale,
  DoughnutController, ArcElement,
  Tooltip, Legend, Filler,
);

Chart.defaults.font.family = '"Segoe UI", system-ui, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.color = '#546e7a';
// Render a ≥2x aunque la pantalla sea 1x → texto y líneas nítidas (sin desenfoque).
Chart.defaults.devicePixelRatio = Math.max(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);

const registry = new Set();

/** Crea un chart y lo registra para destrucción centralizada. */
export function makeChart(canvasOrId, cfg) {
  const ctx = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
  if (!ctx) return null;
  const existing = Chart.getChart(ctx);
  if (existing) { try { existing.destroy(); } catch (_) {} }
  // Render a ≥2x SIEMPRE (texto de ejes/leyendas nítido, aunque la pantalla sea 1x).
  cfg.options = cfg.options || {};
  if (cfg.options.devicePixelRatio == null) cfg.options.devicePixelRatio = Math.max(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const ch = new Chart(ctx, cfg);
  registry.add(ch);
  return ch;
}

/** Destruye UNA instancia (por id de canvas o elemento) sin tocar las demás.
 *  Útil para cerrar un modal sin recalcular los gráficos base de la vista. */
export function destroyChart(canvasOrId) {
  const ctx = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
  if (!ctx) return;
  const ch = Chart.getChart(ctx);
  if (ch) { try { ch.destroy(); } catch (_) {} registry.delete(ch); }
}

/** Destruye todas las instancias activas (al cambiar de vista o refrescar). */
export function destroyAllCharts() {
  registry.forEach((ch) => { try { ch.destroy(); } catch (_) {} });
  registry.clear();
  // Barrido de seguridad sobre cualquier canvas huérfano
  document.querySelectorAll('canvas').forEach((c) => {
    const ch = Chart.getChart(c);
    if (ch) try { ch.destroy(); } catch (_) {}
  });
}

export { Chart };
