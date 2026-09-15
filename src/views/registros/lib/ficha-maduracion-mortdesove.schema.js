/* ============================================================
   REGISTROS · esquema de la ficha «Mortalidad de hembras en desove y recuperación» (2026-09-15, usuario)

   Por fecha y LOTE, en cada tipo de tanque (Desove, Recuperación): hembras que ENTRAN y hembras que
   MUEREN. El % se calcula. Decisión del usuario: las muertas se DESCUENTAN del saldo del lote, repartidas
   entre sus tanques (lo hace el libro mayor, que lee esta hoja). Modelo PURO; el monolito lleva su copia.
   Hoja por «ID» con MERGE: reenviar corrige; un texto no se vacía reenviándolo en blanco.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';
import { normLote } from './ficha-maduracion-desoves.schema.js';

export const MAD_MORT_SHEET = 'Maduración Mortalidad Desove';
export const MAD_MORT_TIPOS = ['Desove', 'Recuperación'];
const CLAVE = { Desove: 'desove', Recuperación: 'recuperacion' };
const TAG = { Desove: 'DESOVE', Recuperación: 'RECUPERACION' };

export const MAD_MORT_COLUMNS = [
  { h: 'Fecha', k: 'fecha' },
  { h: 'Lote', k: 'lote' },
  { h: 'Tipo de tanque', k: 'tipo' },
  { h: 'Hembras que entran', k: 'entran' },
  { h: 'Hembras muertas', k: 'muertas' },
  { h: '% Mortalidad', k: 'pct' },
  { h: 'Observaciones', k: 'observaciones' },
  { h: 'ID', k: 'id' },
];
export const MAD_MORT_HEADERS = MAD_MORT_COLUMNS.map((c) => c.h);

const int = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : '';
};

/** % de mortalidad con dos decimales; vacío sin hembras que entran. */
export function pctMortalidad(entran, muertas) {
  const e = int(entran);
  const m = int(muertas);
  return e === '' || e === 0 || m === '' ? '' : Math.round((m / e) * 10000) / 100;
}

export const mortRowId = (fecha, lote, tipo) => sanitizeStr(fecha, 10) + '-' + normLote(lote) + '-' + (TAG[tipo] || 'OTRO');

/** Una fila por (lote, tipo de tanque) con alguna cifra. */
export function buildMortRows(model) {
  const m = model || {};
  const fecha = sanitizeStr(m.fecha, 10);
  const filas = [];
  (m.lotes || []).forEach((c) => {
    const x = c || {};
    const lote = normLote(x.lote);
    if (!lote) return;
    MAD_MORT_TIPOS.forEach((tipo) => {
      const t = x[CLAVE[tipo]] || {};
      const entran = int(t.entran);
      const muertas = int(t.muertas);
      if (entran === '' && muertas === '') return;
      const v = { fecha, lote, tipo, entran, muertas, pct: pctMortalidad(entran, muertas),
        observaciones: sanitizeStr(x.observaciones, 300), id: mortRowId(fecha, lote, tipo) };
      filas.push(MAD_MORT_COLUMNS.map((col) => v[col.k]));
    });
  });
  return filas;
}

export function buildMortPayload(model) {
  return { sheetName: MAD_MORT_SHEET, headers: MAD_MORT_HEADERS.slice(), rows: buildMortRows(model) };
}

/** ERROR: sin fecha, lote repetido, cifras sin lote, muertas sin las que entran o más muertas que las que entran. */
export function validarMort(model) {
  const m = model || {};
  const errores = [];
  const avisos = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha || ''))) errores.push('La fecha no es válida.');
  const vistos = new Set();
  let filas = 0;
  (m.lotes || []).forEach((c, i) => {
    const x = c || {};
    const lote = normLote(x.lote);
    const conCifras = MAD_MORT_TIPOS.filter((tipo) => {
      const t = x[CLAVE[tipo]] || {};
      return int(t.entran) !== '' || int(t.muertas) !== '';
    });
    if (!lote && !conCifras.length) return;
    if (!lote) { errores.push('Falta el lote del registro ' + (i + 1) + '.'); return; }
    if (!conCifras.length) { errores.push('El lote ' + lote + ' no trae ninguna cifra.'); return; }
    if (vistos.has(lote)) errores.push('El lote ' + lote + ' aparece dos veces en esta fecha: escribiría las mismas filas. Súmalos.');
    vistos.add(lote);
    conCifras.forEach((tipo) => {
      const t = x[CLAVE[tipo]] || {};
      const e = int(t.entran);
      const mu = int(t.muertas);
      const donde = tipo === 'Desove' ? 'desove' : 'recuperación';
      if ((e === '' || e === 0) && mu !== '' && mu > 0) errores.push('En ' + lote + ' (tanques de ' + donde + ') hay muertas pero no las hembras que entran: sin ellas no hay porcentaje.');
      else if (e !== '' && mu !== '' && mu > e) errores.push('En ' + lote + ' (tanques de ' + donde + ') mueren más hembras (' + mu + ') de las que entran (' + e + ').');
      if (mu === '') avisos.push('En ' + lote + ' (tanques de ' + donde + ') no se anotaron muertas: se guarda como 0 % sólo si escribes 0.');
      filas++;
    });
  });
  if (!filas && !errores.length) errores.push('No hay ningún registro que guardar.');
  return { errores, avisos };
}
