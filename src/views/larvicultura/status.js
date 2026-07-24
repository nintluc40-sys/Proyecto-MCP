/* ============================================================
   LARVICULTURA · estado por sección (franjas-semáforo) + edad de
   cultivo (DOC) y estadío esperado. Funciones puras, testeables.
   Escala de calidad 0–100, MENOR = MEJOR (larviZone).
   ============================================================ */
import { getField, F } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { larviZone, larviLabel } from '../../core/format.js';

const SEM = {
  verde: { icon: '✅', label: 'Normal' },
  ambar: { icon: '⚠️', label: 'Revisar' },
  rojo:  { icon: '🔴', label: 'Alerta' },
};
export const semMeta = (level) => SEM[level] || SEM.verde;

const ZORD = { optimo: 0, atencion: 1, alerta: 2, critico: 3, sin: -1 };

/** Diagnóstico: nivel según las zonas de las variables de calidad del estadío. */
export function diagSemaforo(last, vars) {
  const zones = vars
    .map((v) => ({ v, z: larviZone(last ? last[v.key] : null) }))
    .filter((x) => x.z !== 'sin');
  if (!zones.length) return { level: 'verde', detail: 'Sin datos de calidad' };
  const crit = zones.filter((x) => x.z === 'critico').length;
  const alert = zones.filter((x) => x.z === 'alerta').length;
  const aten = zones.filter((x) => x.z === 'atencion').length;
  const level = (crit >= 1 || alert >= 2) ? 'rojo' : (alert >= 1 || aten >= 2) ? 'ambar' : 'verde';
  const peor = [...zones].sort((a, b) => ZORD[b.z] - ZORD[a.z])[0];
  const optimo = zones.filter((x) => x.z === 'optimo').length;
  const detail = `${optimo}/${zones.length} en óptimo`
    + (peor && peor.z !== 'optimo' ? ` · peor: ${peor.v.label} (${larviLabel(last[peor.v.key])})` : '');
  return { level, detail };
}

/** Población: nivel según % de pérdida acumulada (umbrales estimados, ajustables). */
export function popSemaforo(pStats) {
  if (!pStats || !pStats.validTanks || !(pStats.totalInit > 0)) return { level: 'verde', detail: 'Sin población válida' };
  const loss = (pStats.totalInit - pStats.totalCurr) / pStats.totalInit * 100;
  const level = loss > 40 ? 'rojo' : loss > 20 ? 'ambar' : 'verde';
  return { level, detail: `Pérdida acumulada ${loss.toFixed(1)}% · ${pStats.validTanks} tanque(s)` };
}

/** Manejo de agua: nivel según los últimos % Espuma / % Suciedad (umbral 10, ajustable). */
export function aguaSemaforo(mgmt) {
  const lastOf = (arr) => { for (let i = (arr || []).length - 1; i >= 0; i--) { if (arr[i] != null) return arr[i]; } return null; };
  const esp = lastOf(mgmt && mgmt.espuma), suc = lastOf(mgmt && mgmt.suciedad), rec = lastOf(mgmt && mgmt.recambio);
  if (esp == null && suc == null) return { level: 'verde', detail: 'Sin variables de manejo' };
  const espBad = esp != null && esp >= 10, sucBad = suc != null && suc >= 10;
  const level = ((espBad && sucBad) || (esp != null && esp >= 15) || (suc != null && suc >= 15)) ? 'rojo'
    : (espBad || sucBad) ? 'ambar' : 'verde';
  const fmt = (x) => (x == null ? '—' : x.toFixed(1) + '%');
  return { level, detail: `Espuma ${fmt(esp)} · Suciedad ${fmt(suc)} · Recambio ${fmt(rec)}` };
}

/* ---- Edad de cultivo (DOC) + estadío esperado ----
   CRONOGRAMA real del laboratorio: UN estadío por día desde N5 = día 1
   (N5·Z1·Z2·Z3·M1·M2·M3 = días 1–7; PL1 = día 8, PLk = día 7+k).
   Ajustable a los tiempos reales del laboratorio en la validación. */
const STAGE_RANK = { N: 0, Z1: 1, Z2: 2, Z3: 3, M1: 4, M2: 5, M3: 6 };
const CRONO = [
  { upto: 1, stage: 'N5' }, { upto: 2, stage: 'Z1' }, { upto: 3, stage: 'Z2' },
  { upto: 4, stage: 'Z3' }, { upto: 5, stage: 'M1' }, { upto: 6, stage: 'M2' }, { upto: 7, stage: 'M3' },
];

/** Estadío esperado para un DOC dado (PL crece 1/día a partir del día 8). */
export function expectedStage(doc) {
  if (doc == null || isNaN(doc)) return null;
  for (const c of CRONO) if (doc <= c.upto) return c.stage;
  return 'PL' + Math.max(1, doc - 7);
}

/** Rango ordinal de un estadío (para comparar adelanto/atraso). */
export function stageRank(s) {
  if (!s) return -1;
  const u = String(s).toUpperCase().replace(/\s+/g, '');
  if (STAGE_RANK[u] != null) return STAGE_RANK[u];
  const pl = u.match(/^PL0*(\d+)/);
  if (pl) return 7 + Number(pl[1]);
  if (u.startsWith('PL')) return 8;
  if (u.startsWith('Z')) return 1;
  if (u.startsWith('M')) return 4;
  if (u.startsWith('N')) return 0;
  return -1;
}

/** DOC (días de cultivo), estadío actual y esperado, y si va adelantado/atrasado. */
export function cultivoInfo(rows) {
  let min = null, max = null;
  rows.forEach((r) => {
    const d = parseAnyDate(getField(r, F.fecha)); if (!d) return;
    if (min === null || d < min) min = d;
    if (max === null || d > max) max = d;
  });
  if (!min || !max) return null;
  const doc = Math.round((max - min) / 86400000) + 1; // inclusivo (día 1 = siembra)
  let stage = '';
  const recent = rows.filter((r) => { const d = parseAnyDate(getField(r, F.fecha)); return d && d.getTime() === max.getTime(); });
  for (const r of recent) { const s = getField(r, F.estadio); if (s) { stage = s; break; } }
  const esperado = expectedStage(doc);
  const diff = stageRank(stage) - stageRank(esperado);
  const status = (stageRank(stage) < 0) ? 'sin' : diff > 0 ? 'adelantado' : diff < 0 ? 'atrasado' : 'en_tiempo';
  return { doc, stage, esperado, status };
}
