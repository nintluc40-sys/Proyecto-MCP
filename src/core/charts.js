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
import { LogarithmicScale } from 'chart.js';   // 0q·5a

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

/* 0q·2 (2026-09-27, usuario) · «arribaJunto»: el globo de un gráfico en modo «index», ARRIBA del área de datos y al LADO
   del día (a su derecha si cabe; si no, a su izquierda), centrado en su propia altura: sólo se mueve de lado. El lugar
   por defecto («average») toma la altura MEDIA de los elementos del día, que cambia mucho de un día a otro: el globo
   saltaba arriba y abajo y tapaba lo que se leía. Con yAlign 'center', Chart.js lo aparta del día caretSize + caretPadding
   (el 8 de abajo es ese hueco). La primera vez aún no tiene medidas: supone 60 px de alto para no salirse por arriba. */
Tooltip.positioners.arribaJunto = function arribaJunto(items) {
  if (!items.length) return false;
  const area = this.chart.chartArea;
  const x = items[0].element.x;
  const ancho = this.width || 0, alto = this.height || 60;
  return { x, y: area.top + alto / 2, xAlign: x + 8 + ancho <= area.right ? 'left' : 'right', yAlign: 'center' };
};

/* 0q·5a (2026-09-27, usuario) · la escala LOGARÍTMICA, para las UFC de Microbiología (de 0 a cientos de miles). */
Chart.register(LogarithmicScale);

const registry = new Set();

/** El color de texto suave del TEMA activo (variable CSS --c-text-soft); el de siempre si no se puede leer. */
export function colorDelTema() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--c-text-soft').trim();
    return v || '#546e7a';
  } catch (_) { return '#546e7a'; }
}

/** Crea un chart y lo registra para destrucción centralizada. */
export function makeChart(canvasOrId, cfg) {
  const ctx = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
  if (!ctx) return null;
  const existing = Chart.getChart(ctx);
  if (existing) { try { existing.destroy(); } catch (_) {} registry.delete(existing); }
  // H-013 (auditoría de Microbiología 2026-09-25, aprobado 2026-10-03) · el color por defecto de ejes y leyendas sale del
  // TEMA: #546e7a en claro —el de siempre— y #9fb2bc en oscuro, donde el fijo no se leía. Se lee al CREAR cada gráfico;
  // cambiar el tema repinta la vista (ui/shell.js), así que se rehacen con el suyo. Quien fija su color, lo conserva.
  Chart.defaults.color = colorDelTema();
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
