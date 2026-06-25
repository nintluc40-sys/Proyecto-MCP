/* ============================================================
   FORMATO + SEMÁFOROS
   Lógica de clasificación portada fielmente del original.
   ============================================================ */
import { THRESHOLDS } from '../config.js';

export function pct(num, dec = 1) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return num.toFixed(dec) + '%';
}

/** Población entera con separador de miles es-EC; "—" para nulo/≤0. */
export function fmtPop(v) {
  return (v === null || v === undefined || v <= 0) ? '—' : Math.round(v).toLocaleString('es-EC');
}

const inRange = ([a, b], v) => v >= a && v <= b;
const inAny = (ranges, v) => ranges.some((r) => inRange(r, v));

/* ---- Semáforo Supervivencia (mayor = mejor) ---- */
export function svLevel(v) {
  if (v === null || v === undefined) return 'sin';
  const t = THRESHOLDS.sv;
  if (v >= t.excelente) return 'excelente';
  if (v >= t.bueno) return 'bueno';
  if (v >= t.malo) return 'malo';
  return 'grave';
}

/* ---- Semáforo Oxígeno disuelto ---- */
export function odLevel(v) {
  if (v === null || v === undefined) return 'sin';
  const t = THRESHOLDS.od;
  if (inRange(t.optimo, v)) return 'excelente';
  if (inAny(t.bueno, v)) return 'bueno';
  if (inAny(t.malo, v)) return 'malo';
  return 'grave';
}

/* ---- Semáforo Temperatura ---- */
export function tmpLevel(v) {
  if (v === null || v === undefined) return 'sin';
  const t = THRESHOLDS.tmp;
  if (inRange(t.optimo, v)) return 'excelente';
  if (inAny(t.bueno, v)) return 'bueno';
  if (inAny(t.malo, v)) return 'malo';
  return 'grave';
}

const LEVEL_COLOR = {
  excelente: 'var(--c-excelente)',
  bueno: 'var(--c-bueno)',
  malo: 'var(--c-malo)',
  grave: 'var(--c-grave)',
  sin: 'var(--c-sin-dato)',
};
const LEVEL_LABEL = {
  excelente: 'Excelente', bueno: 'Bueno', malo: 'Regular', grave: 'Grave', sin: 'Sin datos',
};
export const levelColor = (lvl) => LEVEL_COLOR[lvl] || LEVEL_COLOR.sin;
export const levelLabel = (lvl) => LEVEL_LABEL[lvl] || LEVEL_LABEL.sin;

/* ---- Semáforo Larvicultura / Calidad Larvaria (escala 0–100, menor = mejor) ---- */
export function larviZone(v) {
  if (v === null || v === undefined || isNaN(v)) return 'sin';
  if (v <= 25) return 'optimo';
  if (v <= 50) return 'atencion';
  if (v <= 75) return 'alerta';
  return 'critico';
}
// Paleta unificada "Acuícola" (ver views/larvicultura/palette.js · SEM).
const LARVI_COLOR = {
  optimo: '#2E9E5B', atencion: '#F4B740', alerta: '#EF7D3B', critico: '#E0413E', sin: '#cfd8dc',
};
const LARVI_LABEL = {
  optimo: 'Óptimo', atencion: 'Atención', alerta: 'Alerta', critico: 'Crítico', sin: '—',
};
export const larviColor = (v) => LARVI_COLOR[larviZone(v)];
export const larviBg = (v) => {
  const z = larviZone(v);
  const map = {
    optimo: 'rgba(46,158,91,.12)', atencion: 'rgba(244,183,64,.16)',
    alerta: 'rgba(239,125,59,.16)', critico: 'rgba(224,65,62,.16)', sin: 'rgba(207,216,220,.2)',
  };
  return map[z];
};
export const larviLabel = (v) => LARVI_LABEL[larviZone(v)];

/** Escapa texto para inserción segura en HTML. */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
