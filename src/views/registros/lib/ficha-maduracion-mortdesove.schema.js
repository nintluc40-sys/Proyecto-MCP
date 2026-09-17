/* ============================================================
   REGISTROS · esquema de la ficha «Inf. Supervisor» (antes «Mortalidad de hembras en desove y recuperación»)

   Por fecha y LOTE, dos registros en la MISMA hoja (decisión del usuario, 2026-09-15: sin hoja nueva ni re-desplegar
   el GAS), una fila por cosa:
     · MORTALIDAD (2026-09-15): en cada tipo de tanque (Desove, Recuperación), hembras que ENTRAN y que MUEREN; el %
       se calcula. Las muertas se DESCUENTAN del saldo del lote (lo hace el libro mayor, que lee esta hoja).
     · REVISIÓN DE NAUPLIOS (2026-09-15): en cada revisión (Entrada, Lavado, Lavado 2, Postlavado), Deformidad,
       Actividad, Hongos, Salinidad y Temperatura. Una fila por revisión con algún dato, con «Revisión» rellena y «Tipo
       de tanque» vacío: el libro se salta estas filas.
   Modelo PURO; el monolito lleva su copia. Hoja por «ID» con MERGE: reenviar corrige; un texto no se vacía reenviándolo
   en blanco. ⚠ El ID va el ÚLTIMO: el GAS lo busca por cabecera y, si la cabecera faltara, cae a la última columna.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';
import { normLote } from './ficha-maduracion-desoves.schema.js';
// La alcalinidad es por ÁREA, y las áreas son el RAS más las salas del catálogo del Ingreso.
import { MAD_SALA_OPTS, salaTag } from './ficha-maduracion-ingreso.schema.js';

export const MAD_MORT_SHEET = 'Maduración Mortalidad Desove';
export const MAD_MORT_TIPOS = ['Desove', 'Recuperación'];
const CLAVE = { Desove: 'desove', Recuperación: 'recuperacion' };
const TAG = { Desove: 'DESOVE', Recuperación: 'RECUPERACION' };

export const MAD_NAUP_REVISIONES = ['Entrada', 'Lavado', 'Lavado 2', 'Postlavado'];
const REV_CLAVE = { Entrada: 'entrada', Lavado: 'lavado', 'Lavado 2': 'lavado2', Postlavado: 'postlavado' };
const REV_TAG = { Entrada: 'ENTRADA', Lavado: 'LAVADO', 'Lavado 2': 'LAVADO2', Postlavado: 'POSTLAVADO' };
export const MAD_NAUP_DEFORMIDAD = ['Alta', 'Media', 'Baja', 'Ausente'];
export const MAD_NAUP_ACTIVIDAD = ['Alta', 'Media', 'Baja'];
export const MAD_NAUP_HONGOS = ['Ausente', 'Presente'];
/* Fototropismo y Aireación (usuario, 2026-09-15). Llevan su PROPIA lista aunque hoy coincida con
   la de Actividad: compartir el array haría que retocar una cambiara las otras dos en silencio, y
   son tres juicios distintos del laboratorio que no tienen por qué moverse juntos. */
export const MAD_NAUP_FOTOTROPISMO = ['Alta', 'Media', 'Baja'];
/* ALCALINIDAD (usuario, 2026-09-15) · por área. El RAS va primero porque no es una sala: es el
   circuito que las alimenta, y por eso esto no cabía en `Maduración Sala`.
   2026-09-16 (usuario, PE1.5) · de DÍA y de NOCHE, cada una con su campo por área. Siguen en la MISMA
   fila del área (su ID no cambia): cada turno es una columna, así que anotar la de noche horas después
   no pisa la de día — con el MERGE del GAS, una celda vacía CONSERVA lo que hubiera. */
export const MAD_ALC_AREAS = ['RAS'].concat(MAD_SALA_OPTS);
export const MAD_ALC_TURNOS = [['dia', 'día'], ['noche', 'noche']];
export const alcalinidadRowId = (fecha, area) =>
  sanitizeStr(fecha, 10) + '-ALC-' + (area === 'RAS' ? 'RAS' : salaTag(area));
export const MAD_NAUP_AIREACION = ['Alta', 'Media', 'Baja'];
/* Topes de AVISO, CONFIRMADOS por el usuario el 2026-09-15 (hasta entonces eran del asistente, y una
   cifra sin dueño se vuelve a discutir cada vez que aparece). Por encima, la cifra se guarda y se marca:
   casi siempre es un error de tecleo. Avisan y NO bloquean, al revés que la temperatura de Sala (D13):
   allí la cifra alimenta promedios, Δ y CV, y un 50 los envenena; aquí es una lectura suelta que se lee
   tal cual, y bloquear impediría anotar una medición rara pero real. */
export const MAD_NAUP_TEMP_MAX = 40;
export const MAD_NAUP_SAL_MAX = 60;

export const MAD_MORT_COLUMNS = [
  { h: 'Fecha', k: 'fecha' },
  { h: 'Lote', k: 'lote' },
  { h: 'Tipo de tanque', k: 'tipo' },
  { h: 'Hembras que entran', k: 'entran' },
  { h: 'Hembras muertas', k: 'muertas' },
  { h: '% Mortalidad', k: 'pct' },
  { h: 'Revisión', k: 'revision' },
  { h: 'Deformidad', k: 'deformidad' },
  { h: 'Actividad', k: 'actividad' },
  { h: 'Hongos', k: 'hongos' },
  { h: 'Fototropismo', k: 'fototropismo' },
  { h: 'Aireación', k: 'aireacion' },
  { h: 'Salinidad', k: 'salinidad' },
  { h: 'Temperatura', k: 'temperatura' },
  /* Sólo las llevan las filas de alcalinidad, igual que «Revisión» sólo la llevan las de la
     revisión de nauplios y «Tipo de tanque» sólo las de mortalidad.
     ⚠ 2026-09-16 (PE1.5) · «Alcalinidad» pasa a «Alcalinidad día» y entra «Alcalinidad noche» detrás,
     ANTES de Observaciones e ID (el ID va el último). La hoja no existía en producción (medido), así
     que no hay nada que migrar; y la firma A4 del GAS exige ya «Alcalinidad día» en la 16, para que
     una app anterior no pueda crearla con la cabecera vieja. */
  { h: 'Área', k: 'area' },
  { h: 'Alcalinidad día', k: 'alcalinidadDia' },
  { h: 'Alcalinidad noche', k: 'alcalinidadNoche' },
  { h: 'Observaciones', k: 'observaciones' },
  { h: 'ID', k: 'id' },
];
export const MAD_MORT_HEADERS = MAD_MORT_COLUMNS.map((c) => c.h);

const int = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : '';
};
const dec = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : '';
};
const crudo = (v) => (v === null || v === undefined ? '' : String(v).trim());
const norm = (s) => crudo(s).replace(/\s+/g, ' ').toLowerCase();
/** El valor de la lista con su grafía oficial, o '' si no está (o viene vacío). */
export function opcionNauplios(lista, v) {
  const n = norm(v);
  return lista.find((o) => norm(o) === n) || '';
}

/** % de mortalidad con dos decimales; vacío sin hembras que entran. */
export function pctMortalidad(entran, muertas) {
  const e = int(entran);
  const m = int(muertas);
  return e === '' || e === 0 || m === '' ? '' : Math.round((m / e) * 10000) / 100;
}

export const mortRowId = (fecha, lote, tipo) => sanitizeStr(fecha, 10) + '-' + normLote(lote) + '-' + (TAG[tipo] || 'OTRO');
export const nauplioRowId = (fecha, lote, revision) => sanitizeStr(fecha, 10) + '-' + normLote(lote) + '-NAUP-' + (REV_TAG[revision] || 'OTRA');

const CAMPOS_NAUP = [['deformidad', 'Deformidad'], ['actividad', 'Actividad'], ['hongos', 'Hongos'],
  ['fototropismo', 'Fototropismo'], ['aireacion', 'Aireación'], ['salinidad', 'Salinidad'], ['temperatura', 'Temperatura']];
const revisionDe = (x, rev) => (x.nauplios && x.nauplios[REV_CLAVE[rev]]) || {};
const revisionConDato = (r) => CAMPOS_NAUP.some(([k]) => crudo(r[k]) !== '');

/** Una fila por (lote, tipo de tanque) con alguna cifra y una por (lote, revisión de nauplios) con algún dato. */
export function buildMortRows(model) {
  const m = model || {};
  const fecha = sanitizeStr(m.fecha, 10);
  const filas = [];
  const fila = (v) => filas.push(MAD_MORT_COLUMNS.map((col) => (v[col.k] === undefined ? '' : v[col.k])));
  (m.lotes || []).forEach((c) => {
    const x = c || {};
    const lote = normLote(x.lote);
    if (!lote) return;
    MAD_MORT_TIPOS.forEach((tipo) => {
      const t = x[CLAVE[tipo]] || {};
      const entran = int(t.entran);
      const muertas = int(t.muertas);
      if (entran === '' && muertas === '') return;
      fila({ fecha, lote, tipo, entran, muertas, pct: pctMortalidad(entran, muertas),
        observaciones: sanitizeStr(x.observaciones, 300), id: mortRowId(fecha, lote, tipo) });
    });
    MAD_NAUP_REVISIONES.forEach((revision) => {
      const r = revisionDe(x, revision);
      if (!revisionConDato(r)) return;
      fila({ fecha, lote, revision, deformidad: opcionNauplios(MAD_NAUP_DEFORMIDAD, r.deformidad), actividad: opcionNauplios(MAD_NAUP_ACTIVIDAD, r.actividad),
        hongos: opcionNauplios(MAD_NAUP_HONGOS, r.hongos),
        fototropismo: opcionNauplios(MAD_NAUP_FOTOTROPISMO, r.fototropismo), aireacion: opcionNauplios(MAD_NAUP_AIREACION, r.aireacion),
        salinidad: dec(r.salinidad), temperatura: dec(r.temperatura),
        // I1 (auditoría 2026-09-15): las observaciones son del LOTE y van también aquí; con sólo la revisión se perdían.
        observaciones: sanitizeStr(x.observaciones, 300), id: nauplioRowId(fecha, lote, revision) });
    });
  });
  /* Una fila por ÁREA con algún valor, de día o de noche. Va fuera del bucle de lotes porque no es de
     ningún lote: es del día. Sin valor no se escribe fila — y con el MERGE del GAS, no escribir es CONSERVAR. */
  MAD_ALC_AREAS.forEach((area) => {
    const a = (m.alcalinidad || {})[area] || {};
    const dia = dec(a.dia);
    const noche = dec(a.noche);
    if (dia === '' && noche === '') return;
    fila({ fecha, area, alcalinidadDia: dia, alcalinidadNoche: noche, id: alcalinidadRowId(fecha, area) });
  });
  return filas;
}

export function buildMortPayload(model) {
  return { sheetName: MAD_MORT_SHEET, headers: MAD_MORT_HEADERS.slice(), rows: buildMortRows(model) };
}

/** ERROR: sin fecha, lote repetido, datos sin lote, muertas sin las que entran, más muertas que las que entran, un valor
    fuera de su lista o una cifra que no es cifra. AVISO: muertas sin anotar, revisión a medias, T° o salinidad altas. */
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
    const conRevision = MAD_NAUP_REVISIONES.filter((rev) => revisionConDato(revisionDe(x, rev)));
    if (!lote && !conCifras.length && !conRevision.length) return;
    if (!lote) { errores.push('Falta el lote del registro ' + (i + 1) + '.'); return; }
    if (!conCifras.length && !conRevision.length) { errores.push('El lote ' + lote + ' no trae ninguna cifra ni revisión de nauplios.'); return; }
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
    conRevision.forEach((rev) => {
      const r = revisionDe(x, rev);
      const et = 'En ' + lote + ' (nauplios · ' + rev + ')';
      [['deformidad', 'Deformidad', MAD_NAUP_DEFORMIDAD], ['actividad', 'Actividad', MAD_NAUP_ACTIVIDAD], ['hongos', 'Hongos', MAD_NAUP_HONGOS],
        ['fototropismo', 'Fototropismo', MAD_NAUP_FOTOTROPISMO], ['aireacion', 'Aireación', MAD_NAUP_AIREACION]].forEach(([k, nombre, lista]) => {
        if (crudo(r[k]) !== '' && !opcionNauplios(lista, r[k])) errores.push(et + ' «' + crudo(r[k]) + '» no es un valor de ' + nombre + ' (' + lista.join(', ') + ').');
      });
      [['salinidad', 'la salinidad', MAD_NAUP_SAL_MAX], ['temperatura', 'la temperatura', MAD_NAUP_TEMP_MAX]].forEach(([k, nombre, max]) => {
        if (crudo(r[k]) === '') return;
        const v = dec(r[k]);
        if (v === '') errores.push(et + ' ' + nombre + ' no es una cifra válida.');
        else if (v > max) avisos.push(et + ' ' + nombre + ' (' + v + ') pasa de ' + max + ': revisa que esté bien escrita.');
      });
      const faltan = CAMPOS_NAUP.filter(([k]) => crudo(r[k]) === '').map(([, nombre]) => nombre);
      if (faltan.length) avisos.push(et + ' faltan: ' + faltan.join(', ') + '.');
      filas++;
    });
  });
  /* Se exige que sea una cifra y nada más: el usuario no dio un rango plausible, y un tope
     inventado aquí sería una cifra sin dueño de las que este proyecto ya ha tenido que retirar. */
  let alcalinidades = 0;
  MAD_ALC_AREAS.forEach((area) => {
    const a = (m.alcalinidad || {})[area] || {};
    MAD_ALC_TURNOS.forEach(([k, turno]) => {
      const crudoV = crudo(a[k]);
      if (crudoV === '') return;
      if (dec(crudoV) === '') errores.push('La alcalinidad de ' + turno + ' de ' + area + ' no es una cifra válida.');
      else alcalinidades++;
    });
  });
  /* ⚠ La alcalinidad CUENTA: es del día y no de un lote, así que un día en el que sólo se anota
     ella es un registro perfectamente válido. Sin sumarla aquí moriría en la guarda de abajo. */
  if (!filas && !alcalinidades && !errores.length) errores.push('No hay ningún registro que guardar.');
  return { errores, avisos };
}
