/* ============================================================
   MADURACIÓN · OPERATIVO — la VISTA del tablero (F1, 2026-09-19)

   «🐚 Operativo» de la entrada de Maduración (entrada.js), con el diseño que aprobó el usuario el 2026-09-19:
   barra de filtros (período · foto al día · sala → tanque · lote → código · limpiar) y dos sub-vistas:
     📊 Estado actual — seis indicadores, el mapa de planta (por estado, vivos o densidad), las alertas, los últimos
        registros y los lotes que salen de cuarentena en los próximos 7 días;
     🏠 Salas — una tarjeta por sala y, al pulsarla, su detalle: la T° por hora, el O₂, ♀/♂ y densidad por tanque,
        la tabla de tanques y los tratamientos recientes.
   Esta vista sólo PINTA: las cifras salen de operativo.tablero.js y operativo.data.js, que son puros y tienen sus
   pruebas y sus bancos de mutación. Se carga DIFERIDA (import() en entrada.js) junto con su CSS.
   ⚠ El período de este tablero es SUYO (termina en la foto): no lee el rango de la barra de fecha global. Si algún día
     lo leyera, main.js tendría que declararlo (lo vigila src/ui/dateBarVisibility.test.js).
   ============================================================ */
import './operativo.css';
import { store } from '../../core/store.js';
import { makeChart, destroyAllCharts } from '../../core/charts.js';
import { esc } from '../../core/format.js';
import { sumarDias, ESTADO_CUARENTENA, ESTADO_PRODUCCION, ESTADO_MIXTO } from '../registros/lib/mad-libro.js';
import { modeloOperativo, serieDiaria, diasDeTanque } from './operativo.data.js';
import {
  PERIODOS, PERIODO_INICIAL, periodoDe, normalizarFiltro, hayFiltro, kpiVivos, kpiLotes, kpiSalas, kpiOcupacion,
  kpiMortalidad, kpiReproduccion, mapaDePlanta, MODOS_MAPA, ESTADO_VACIO, ESTADO_SIN, alertas, ultimosRegistros,
  finesDeCuarentena, AVISO_CUARENTENA_DIAS, tarjetasDeSalas, detalleDeSala,
  indiceDeFiltro, cicloDelLote, etiquetasDeFiltro, kpiBiomasa,
} from './operativo.tablero.js';
import { INDICADORES } from './operativo.indicadores.js';
import { FUENTES, umbralVigente, evaluar } from './operativo.umbrales.js';
import { tablaDeLotes, fichaDeLote, DIMENSIONES_COMPARATIVA, comparativa } from './operativo.lotes.js';
import { DIMENSIONES_BAJAS, desgloseDeBajas, motivosDeCierre, bajasPorHora, calorSalaDia, lotesCerrados } from './operativo.bajas.js';
import {
  VARIABLES_REVISION, revisionesDeNauplios, alcalinidadPorArea, mortalidadEnDesove, frecuenciaDeObservaciones,
} from './operativo.revisiones.js';

const SUBS = [
  { clave: 'estado', etiqueta: 'Estado actual', icono: '📊' },
  { clave: 'salas', etiqueta: 'Salas', icono: '🏠' },
  { clave: 'lotes', etiqueta: 'Lotes', icono: '🧬' },
  { clave: 'bajas', etiqueta: 'Bajas', icono: '💀' },
  /* 🔑 «Revisiones DEL SUPERVISOR», no «Revisiones» a secas (D-8, 2026-09-20). Larvicultura ya tiene
     una vista «🔍 Revisiones» —sobre `Registro_Supervisión`, con otro significado— y hasta con el
     MISMO icono: era el tercer par de homónimos del proyecto, tras los dos «ICL» y las dos «Fase».
     Con los dos primeros se decidió dejarlos y documentarlos; aquí se renombra porque esta sub-vista
     es nueva y no hay costumbre que romper, que es justo lo que hacía caro renombrar las otras.
     ⚠ Y NO es «Revisión de nauplios»: además de los nauplios en sus 4 etapas enseña la alcalinidad
     por área, la mortalidad en desove y recuperación y la frecuencia de observaciones de tanque. El
     nombre sigue a la DECISIÓN 6 del usuario —Inf. Supervisor + observaciones de tanque—, que es de
     donde sale todo lo que hay aquí. */
  { clave: 'revisiones', etiqueta: 'Revisiones del supervisor', icono: '🔍' },
];
const INICIAL = { sub: 'estado', periodo: PERIODO_INICIAL, fecha: '', sala: '', tanque: '', lote: '', codigo: '', color: 'estado', salaDetalle: '', tanqueSel: '', loteSel: '', agrupacion: 'lote',
  estado: '', sexo: '', piscina: '', camaronera: '', agrupacionBajas: 'sala' };
/* El estado de la vista vive lo que dura la sesión: al volver a Maduración, o al refrescarse los datos, se conserva. */
const vOp = { ...INICIAL };

// ── Formato ──
const pad2 = (n) => String(n).padStart(2, '0');
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
function hoyLocal() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
const vacio = (v) => v === '' || v === null || v === undefined || !Number.isFinite(Number(v));
const nf = (v, dec = 0) => (vacio(v) ? '—' : Number(v).toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: dec }));
const pc = (v) => (vacio(v) ? '—' : nf(v, 2) + ' %');
const dm = (iso) => (esIso(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');
const dma = (iso) => (esIso(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—');
const porNombre = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
const definicion = (id) => (INDICADORES.find((x) => x.id === id) || {}).definicion || '';
const CITA = { FAO2003: 'FAO 2003', ALBALAT2022: 'Albalat et al. 2022', FAO_FICHA: 'ficha FAO de P. vannamei', REN2020: 'Ren et al. 2020', FICHA_ALIMENTACION: 'ficha de Alimentación' };
/** El umbral vigente en palabras: su rango y de dónde sale. */
function refUmbral(id) {
  const u = umbralVigente(id);
  if (!u) return '';
  const de = u.origen === 'laboratorio' ? 'laboratorio' : (u.fuente || []).map((k) => CITA[k] || k).join(' · ');
  return u.referencia + ' (' + de + ')';
}
const DOT = { ok: 'dentro del rango', bajo: 'por debajo del rango', alto: 'por encima del rango', fuera: 'fuera del rango, por los dos lados' };
const dot = (estado, ref) => (DOT[estado] ? `<i class="mop-dot is-${estado}" title="${esc(DOT[estado] + (ref ? ' · ' + ref : ''))}"></i>` : '');
const CLASE_ESTADO = { [ESTADO_PRODUCCION]: 'produccion', [ESTADO_CUARENTENA]: 'cuarentena', [ESTADO_MIXTO]: 'mixto', [ESTADO_VACIO]: 'vacio', [ESTADO_SIN]: 'sin' };
const claseEstado = (e) => CLASE_ESTADO[e] || 'sin';
const etiquetaPeriodo = (p) => (p.clave === 'hoy' ? 'hoy' : p.clave === 'mes' ? 'el mes' : p.clave === 'todo' ? 'todo el registro' : nf(p.dias) + ' d');

// ── Modelo memoizado: por los datos, el día de hoy y la foto. La serie, además, por el período. ──
let _memo = { src: null, hoy: '', fecha: '', M: null, partes: null, serieClave: '', serie: null };
function memoModelo(hoy, fecha) {
  if (_memo.src !== store.globalData || _memo.hoy !== hoy || _memo.fecha !== fecha) {
    const M = modeloOperativo(store.globalData, { hoy, fecha });
    _memo = { src: store.globalData, hoy, fecha, M, partes: diasDeTanque(M.fuentes.tanques), serieClave: '', serie: null };
  }
  return _memo;
}
function serieDe(memo, p) {
  const k = p.desde + '|' + p.hasta;
  if (memo.serieClave !== k) {
    memo.serie = serieDiaria(memo.M.fuentes, sumarDias(p.desde, -1), p.hasta);
    memo.serieClave = k;
  }
  return memo.serie;
}
let _mapa = null;   // el último mapa pintado: la ficha del tanque pulsado se rellena sin repintar la vista

/* ============================================================
   VISTA
   ============================================================ */
export function operativoView(root) {
  destroyAllCharts();
  if (!store.globalData.length) {
    root.innerHTML = '<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>';
    return;
  }
  const hoy = hoyLocal();
  if (!esIso(vOp.fecha) || vOp.fecha > hoy) vOp.fecha = '';
  if (!SUBS.some((s) => s.clave === vOp.sub)) vOp.sub = INICIAL.sub;
  const fecha = vOp.fecha || hoy;
  const memo = memoModelo(hoy, fecha);
  const M = memo.M;
  const filas = Object.values(M.fuentes).reduce((a, f) => a + f.length, 0);
  if (!filas) {
    root.innerHTML = cabeceraHTML(fecha) + avisosDelDatoHTML(M) + vacioHTML();
    bind(root);
    return;
  }
  depurarFiltros(M.filtros);
  const F = normalizarFiltro(vOp, indiceDeFiltro(M));
  const periodo = periodoDe(vOp.periodo, fecha, M.fuentes, cicloDelLote(M.libro, vOp.lote, fecha));
  let h = cabeceraHTML(fecha) + filtrosHTML(M, hoy, fecha, periodo) + etiquetasHTML(F) + subnavHTML() + avisosDelDatoHTML(M);
  let detalle = null;
  if (vOp.sub === 'salas') {
    const salaDet = F.sala || vOp.salaDetalle;
    detalle = salaDet ? detalleDeSala(M, salaDet, periodo, F, memo.partes) : null;
    h += salasHTML(M, F, detalle, periodo);
  } else if (vOp.sub === 'lotes') {
    h += lotesHTML(M, memo, periodo, F);
  } else if (vOp.sub === 'bajas') {
    h += bajasHTML(M, memo, periodo, F);
  } else if (vOp.sub === 'revisiones') {
    h += revisionesHTML(M, memo, periodo, F);
  } else {
    h += estadoHTML(M, memo, periodo, F);
  }
  root.innerHTML = h;
  if (detalle) dibujarDetalle(detalle);
  if (vOp.sub === 'lotes') dibujarLote(_fichaLote);
  bind(root);
}

/** Un filtro que ya no existe en los datos (otra foto, datos refrescados) se quita; el tanque, sin sala, también. */
function depurarFiltros(o) {
  if (vOp.sala && !o.salas.includes(vOp.sala)) vOp.sala = '';
  if (!vOp.sala || !(o.tanquesPorSala[vOp.sala] || []).map(String).includes(String(vOp.tanque))) vOp.tanque = '';
  if (vOp.lote && !o.lotes.includes(vOp.lote)) vOp.lote = '';
  if (vOp.codigo && !codigosDe(o, vOp.lote).includes(vOp.codigo)) vOp.codigo = '';
  if (vOp.estado && !(o.estados || []).includes(vOp.estado)) vOp.estado = '';
  if (vOp.piscina && !(o.piscinas || []).includes(vOp.piscina)) vOp.piscina = '';
  if (vOp.camaronera && !(o.camaroneras || []).includes(vOp.camaronera)) vOp.camaronera = '';
}

/** Los filtros ACTIVOS, como etiquetas quitables. Lo que se quita es SÓLO esa dimensión: «✕ Limpiar» sigue
 *  estando para dejarlo todo como al abrir. */
function etiquetasHTML(F) {
  const es = etiquetasDeFiltro(F);
  if (!es.length) return '';
  return `<div class="mop-chips" role="group" aria-label="Filtros activos">${es.map((e) =>
    `<button class="mop-chip-f" data-mop-quitar="${esc(e.dim)}" title="Quitar el filtro de ${esc(e.rotulo)}">${esc(e.rotulo)}: <b>${esc(e.valor)}</b> ✕</button>`).join('')}</div>`;
}
const codigosDe = (o, lote) => (lote ? o.codigosPorLote[lote] || [] : [...new Set(Object.values(o.codigosPorLote).flat())].sort(porNombre));

function cabeceraHTML(fecha) {
  return `<div class="mc-head"><div class="mc-head-t"><span class="mc-head-ic">🐚</span><div>
      <h2 class="mc-title">Operativo</h2>
      <p class="mc-sub">Salas, tanques y lotes del registro operativo · con el libro mayor del ⚖️ Saldo, al cierre del ${esc(dma(fecha))}</p>
    </div></div></div>`;
}

function filtrosHTML(M, hoy, fecha, p) {
  const o = M.filtros;
  const sel = (dim, valor, valores, rotulo, deshabilitado) => `<select class="mc-select" data-mop-filtro="${dim}" aria-label="${esc(rotulo)}"${deshabilitado ? ' disabled' : ''}>
      <option value="">${esc(rotulo)}</option>
      ${valores.map((x) => {
        const v = x && x.v !== undefined ? x.v : x;
        const t = x && x.t !== undefined ? x.t : x;
        return `<option value="${esc(v)}"${String(valor) === String(v) ? ' selected' : ''}>${esc(t)}</option>`;
      }).join('')}
    </select>`;
  const cambiado = vOp.periodo !== INICIAL.periodo || vOp.fecha || vOp.sala || vOp.lote || vOp.codigo
    || vOp.estado || vOp.sexo || vOp.piscina || vOp.camaronera;
  return `<div class="mop-filtros">
    <div class="mop-f-grupo"><span class="mop-f-lbl">Período</span>
      <div class="mc-seg mc-seg-sm" role="group" aria-label="Período">${PERIODOS.map((x) => {
        const on = x.clave === p.clave;
        return `<button class="mc-seg-b ${on ? 'is-on' : ''}" data-mop-periodo="${x.clave}" aria-pressed="${on}">${esc(x.etiqueta)}</button>`;
      }).join('')}</div>
      <span class="mop-f-rango">${esc(dm(p.desde))} – ${esc(dm(p.hasta))} · ${nf(p.dias)} ${p.dias === 1 ? 'día' : 'días'}${p.cicloSinLote ? ' · <span class="mop-nota">elige un lote para ver su ciclo</span>' : ''}</span>
    </div>
    <label class="mop-f-grupo"><span class="mop-f-lbl">Foto al día</span>
      <input type="date" class="mop-fecha" data-mop-fecha value="${esc(fecha)}" max="${esc(hoy)}"></label>
    <div class="mop-f-grupo"><span class="mop-f-lbl">Sala → Tanque</span>
      ${sel('sala', vOp.sala, o.salas, 'Todas las salas')}
      ${sel('tanque', vOp.tanque, vOp.sala ? o.tanquesPorSala[vOp.sala] || [] : [], 'Todos los tanques', !vOp.sala)}</div>
    <div class="mop-f-grupo"><span class="mop-f-lbl">Lote → Código genético</span>
      ${sel('lote', vOp.lote, o.lotes, 'Todos los lotes')}
      ${sel('codigo', vOp.codigo, codigosDe(o, vOp.lote), 'Todos los códigos')}</div>
    <div class="mop-f-grupo"><span class="mop-f-lbl">Estado · Sexo</span>
      ${sel('estado', vOp.estado, o.estados || [], 'Todos los estados')}
      ${sel('sexo', vOp.sexo, [{ v: 'hembras', t: '♀ Hembras' }, { v: 'machos', t: '♂ Machos' }], 'Los dos sexos')}</div>
    <div class="mop-f-grupo"><span class="mop-f-lbl">Origen del lote</span>
      ${sel('piscina', vOp.piscina, o.piscinas || [], 'Todas las piscinas')}
      ${sel('camaronera', vOp.camaronera, o.camaroneras || [], 'Todas las camaroneras')}</div>
    ${cambiado ? '<button class="mop-limpiar" data-mop-limpiar>✕ Limpiar</button>' : ''}
  </div>`;
}

function subnavHTML() {
  return `<div class="mc-subnav">${SUBS.map((s) => `<button class="mc-pill ${vOp.sub === s.clave ? 'is-on' : ''}" data-mop-sub="${s.clave}">${s.icono} ${esc(s.etiqueta)}</button>`).join('')}</div>`;
}

/** Avisos de calidad del dato: filas que ya no casan con ninguna hoja, y fechas posteriores a hoy. */
function avisosDelDatoHTML(M) {
  const w = [];
  if (M.sinHoja > 0) {
    w.push(`<div class="mc-warn">⚠️ <b>${nf(M.sinHoja)} fila(s) de Maduración</b> no casan con ninguna hoja del operativo: alguna hoja
      cambió sus columnas y dejó de reconocerse. Esas filas <b>no se cuentan</b> en este tablero.</div>`);
  }
  const fut = ultimosRegistros(M.frescura).filter((f) => f.futuras > 0);
  if (fut.length) {
    w.push(`<div class="mc-warn">⚠️ <b>${nf(fut.reduce((a, f) => a + f.futuras, 0))} registro(s) con fecha posterior a hoy</b>
      (${fut.map((f) => esc(f.etiqueta) + ': ' + nf(f.futuras)).join(' · ')}). Suele ser un año mal tecleado: la foto de hoy
      no los incluye. Conviene corregirlos en el Sheet.</div>`);
  }
  return w.join('');
}

function vacioHTML() {
  return `<div class="empty-state" style="padding:48px 20px">
    <div style="font-size:40px">🐚</div>
    <h3 style="margin:10px 0 6px;color:var(--c-brand)">Sin datos del registro operativo</h3>
    <p class="muted">No hay filas en las hojas del operativo de Maduración: Ingreso, Movimientos, Desoves, Inf. Supervisor,
      Fin de Ciclo, Tratamientos, Alimentación, Broodstock, Salas y Tanques.</p>
    <p class="muted">Se registran en <b>Registros → Maduración</b>. El seguimiento por Trovan está en <b>🧬 Microchips</b>.</p>
  </div>`;
}

/* ============================================================
   📊 ESTADO ACTUAL
   ============================================================ */
function tile(rotulo, valor, sub, tono, titulo) {
  return `<div class="mc-kpi ${tono || ''}"${titulo ? ` title="${esc(titulo)}"` : ''}><div class="mc-kpi-lb">${esc(rotulo)}</div>
    <div class="mc-kpi-v">${valor}</div><div class="mc-kpi-sub">${sub || ''}</div></div>`;
}

function estadoHTML(M, memo, p, F) {
  const v = kpiVivos(M.libro, F);
  const l = kpiLotes(M.libro, F);
  const s = kpiSalas(M.salas, F);
  const o = kpiOcupacion(M.salas, M.libro, F);
  const m = kpiMortalidad(serieDe(memo, p), p, F, memo.partes);
  const r = kpiReproduccion(M.fuentes.desoves, p, F);
  const b = kpiBiomasa(M, F, p);
  _mapa = mapaDePlanta(M.libro, F);

  const partesSalas = [];
  if (s.difieren) partesSalas.push('hoja ≠ libro');
  else partesSalas.push(`${nf(s.coinciden)} de ${nf(s.total)} coinciden`);
  if (s.sinRegistro) partesSalas.push(`${nf(s.sinRegistro)} sin registro`);

  let mort;
  if (m.modo === 'tasa') {
    mort = tile('Mortalidad', `día ${pc(m.dia.pct)}`, `${nf(m.dia.muertos)} de ${nf(m.dia.riesgo)} · ${esc(etiquetaPeriodo(p))}: ${pc(m.periodo.pct)}`, 'is-mort',
      'Muertos ÷ animales en riesgo (vivos de la víspera + los que ingresaron), la regla del ⚖️ Saldo; el período cuenta desde la víspera de su primer día. Los descartes de selección no son muertes.');
  } else if (m.modo === 'registradas') {
    mort = tile('Mortalidad', `${nf(m.dia.muertos)} muertes`, `registradas el ${esc(dm(p.hasta))} · ${nf(m.periodo.muertos)} en ${esc(etiquetaPeriodo(p))}`, 'is-mort',
      'Con sala o tanque: las muertes registradas en la hoja Tanques, de todos sus lotes. La tasa es por lote, porque el libro lleva las bajas por lote.');
  } else {
    mort = tile('Mortalidad', '—', m.modo === 'no-aplica' ? 'por lote: no aplica al código genético' : 'sin datos del período', 'is-mort',
      'El libro lleva las bajas por lote, no por código genético.');
  }
  const repro = tile('Reproducción', `${nf(r.desoves)} desoves`,
    `N5 ${r.n5 ? nf(r.n5 / 1e6, 2) + ' M' : '—'} · fert. ${pc(r.fertilidad)}${r.ignora.length ? ' · <span class="mop-nota">sin filtro de sala</span>' : ''}`, 'is-desove',
    'Desoves del período, por su fecha. Fertilidad = N2 ÷ huevos, sólo de los desoves que ya tienen su N2 (regla del ⚖️ Saldo). Un desove es de su lote y código genético, no de una sala.');

  const kpis = [
    tile('Vivos', nf(v.total), `♀ ${nf(v.hembras)} · ♂ ${nf(v.machos)} · H:M ${nf(v.hm, 2)} ${dot(v.hmEstado, refUmbral('proporcionHM'))}`, '',
      'Animales vivos al cierre de la foto, según el libro mayor. ' + definicion('proporcionHM')),
    tile('Lotes', nf(l.total), `${nf(l.produccion)} Prod. · ${nf(l.cuarentena)} Cuar. · ${nf(l.mixto)} Mixto${l.otros ? ' · ' + nf(l.otros) + ' sin estado' : ''}`, '',
      'Lotes con animales vivos en lo filtrado. El estado es el de la sala donde están; Mixto si sus salas no coinciden.'),
    tile('Salas', s.difieren ? `${nf(s.difieren)} ⚠` : '✓', partesSalas.join(' · '), s.difieren ? 'is-mort' : 'is-fert',
      'El estado registrado en la hoja de Salas frente al que propone el libro al cierre de la foto (el de «🔄 Proponer estado»).'),
    tile('Ocupación', `${nf(o.ocupados)}/${nf(o.total)}`,
      o.modo === 'tanque' ? (o.ocupados ? 'tanque ocupado' : 'tanque vacío') : `${pc(o.pct)}${o.modo === 'filtro' ? ' · tanques con lo filtrado' : ''}`, '',
      definicion('ocupacion')),
    mort, repro,
    tile('Biomasa', b.totalKg === '' ? '—' : nf(b.totalKg, 2) + ' kg',
      b.totalKg === '' ? 'sin pesos registrados en el período'
        : `♀ ${nf(b.hembrasKg, 2)} · ♂ ${nf(b.machosKg, 2)} kg${b.parcial ? ' · <span class="mop-nota">sólo un sexo trae peso</span>' : ''}`, '',
      'Vivos × su peso promedio, PESADO por los animales que el libro tiene en cada tanque. El peso sale de la hoja de Tanques, de los registros del período. Sin ningún peso se deja vacío: una biomasa inventada es peor que ninguna.'),
  ].join('');

  return `<div class="mc-body">
    <div class="mc-kpis">${kpis}</div>
    ${mapaHTML(_mapa, M, F)}
    <div class="mc-grid">
      ${alertasHTML(alertas(M, p, F), p)}
      ${ultimosHTML(ultimosRegistros(M.frescura))}
      ${finesHTML(finesDeCuarentena(M.libro, M.fecha, F))}
    </div>
  </div>`;
}

/** La ficha de un tanque en palabras: la usan el globo del ratón y el panel que se abre al pulsarlo. */
function textoTanque(t) {
  const base = `${t.sala} · tanque ${t.tanque}${t.fueraDeCatalogo ? ' (fuera del catálogo de la sala)' : ''}`;
  if (!t.vivos) return base + ' — vacío';
  const lotes = t.lotes.map((l) => `${l.lote} (${l.estado || 'sin estado'}${l.codigos.length ? ', ' + l.codigos.join('/') : ''})`).join(' · ');
  return `${base} — ${lotes} · ♀ ${nf(t.hembras)} ♂ ${nf(t.machos)} · H:M ${nf(t.hm, 2)} · ${t.densidad === '' ? 'densidad: sin área conocida' : 'densidad ' + nf(t.densidad, 2) + ' /m²'}`;
}

function infoTanqueHTML(mapa) {
  if (!vOp.tanqueSel || !mapa) return '<span class="muted">Pulsa un tanque para ver sus lotes, ♀/♂ y densidad.</span>';
  const i = vOp.tanqueSel.lastIndexOf('|');
  const sala = vOp.tanqueSel.slice(0, i);
  const n = vOp.tanqueSel.slice(i + 1);
  const t = ((mapa.salas.find((s) => s.sala === sala) || {}).tanques || []).find((x) => String(x.tanque) === n);
  if (!t) return '';
  return `<b>${esc(textoTanque(t))}</b> <button class="mc-mini" data-mop-filtrar-tq="${esc(vOp.tanqueSel)}">Filtrar por este tanque</button>`;
}

function mapaHTML(mapa, M, F) {
  const modo = MODOS_MAPA.some((x) => x.clave === vOp.color) ? vOp.color : 'estado';
  const filtrado = hayFiltro(F);
  const ocup = new Map((M.salas || []).map((s) => [s.sala, s.propuesto]));
  const celda = (t) => {
    const k = t.sala + '|' + t.tanque;
    const cls = ['mop-tq'];
    if (modo === 'estado') cls.push('is-e-' + claseEstado(t.estado));
    else if (modo === 'densidad') cls.push('is-d-' + (!t.vivos ? 'vacio' : t.densidadEstado || 'sin'));
    else cls.push(t.vivos ? 'is-v' : 'is-v0');
    if (filtrado && !t.enFiltro) cls.push('is-dim');
    if (t.fueraDeCatalogo) cls.push('is-extra');
    if (vOp.tanqueSel === k) cls.push('is-sel');
    const intensidad = modo === 'vivos' && t.vivos ? ` style="--mop-i:${Math.round(15 + (85 * t.vivos) / Math.max(1, mapa.maxVivos))}%"` : '';
    const texto = textoTanque(t);
    return `<button class="${cls.join(' ')}" data-mop-tq="${esc(k)}" title="${esc(texto)}" aria-label="${esc(texto)}"${intensidad}>${esc(t.tanque)}</button>`;
  };
  const salas = mapa.salas.map((s) => {
    const o = ocup.get(s.sala) || { ocupados: 0, total: s.tanques.length };
    return `<div class="mop-sala"><div class="mop-sala-h">${esc(s.sala)} <span class="mop-sala-oc">${nf(o.ocupados)}/${nf(o.total)}</span></div>
      <div class="mop-tqs">${s.tanques.map(celda).join('')}</div></div>`;
  }).join('');
  let leyenda;
  if (modo === 'estado') {
    leyenda = [ESTADO_PRODUCCION, ESTADO_CUARENTENA, ESTADO_MIXTO, ESTADO_SIN, ESTADO_VACIO]
      .map((e) => `<span class="mc-lg"><i class="mop-sw is-e-${claseEstado(e)}"></i>${esc(e)} <b>${nf(mapa.porEstado[e] || 0)}</b></span>`).join('');
  } else if (modo === 'densidad') {
    const d = mapa.porDensidad;
    leyenda = `<span class="mc-lg"><i class="mop-sw is-d-ok"></i>Dentro de ${esc(refUmbral('densidad'))} <b>${nf(d.ok)}</b></span>
      <span class="mc-lg"><i class="mop-sw is-d-bajo"></i>Por debajo <b>${nf(d.bajo)}</b></span>
      <span class="mc-lg"><i class="mop-sw is-d-alto"></i>Por encima <b>${nf(d.alto)}</b></span>
      <span class="mc-lg"><i class="mop-sw is-d-sin"></i>Sin área conocida <b>${nf(d.sinDato)}</b></span>`;
  } else {
    leyenda = `<span class="mc-lg"><i class="mop-sw is-v" style="--mop-i:20%"></i>pocos</span>
      <span class="mc-lg"><i class="mop-sw is-v" style="--mop-i:100%"></i>el más poblado: <b>${nf(mapa.maxVivos)}</b> vivos</span>`;
  }
  const botones = MODOS_MAPA.map((x) => `<button class="mc-seg-b ${x.clave === modo ? 'is-on' : ''}" data-mop-color="${x.clave}" aria-pressed="${x.clave === modo}">${esc(x.etiqueta)}</button>`).join('');
  return `<div class="mc-card mc-card-wide mop-mapa-card">
    <h4 class="mc-card-h">🗺️ Mapa de planta <span class="mc-h-note">al cierre del ${esc(dma(M.fecha))}${filtrado ? ' · resaltado lo filtrado' : ''}</span>
      <span class="mc-seg mc-seg-sm" role="group" aria-label="Color del mapa">${botones}</span></h4>
    <div class="mop-mapa">${salas}</div>
    <div class="mc-legend">${leyenda}</div>
    <div class="mop-tq-info" aria-live="polite">${infoTanqueHTML(mapa)}</div>
  </div>`;
}

function alertasHTML(a, p) {
  const items = [];
  for (const e of a.estados) {
    items.push(`<li>🏠 <b>${esc(e.sala)}</b>: la hoja dice «${esc(e.registrado.estado)}» (${esc(dm(e.registrado.fecha))}) y el libro propone «${esc(e.propuesto.estado)}».</li>`);
  }
  const ambiente = (x, icono, nombre) => x.porSala.map((s) => `<li>${icono} <b>${esc(s.sala)}</b>: ${nf(s.fuera)} de ${nf(s.lecturas)} lecturas de ${nombre} fuera de ${esc(x.umbral ? x.umbral.referencia : '')} (${pc(s.pct)}).</li>`);
  items.push(...ambiente(a.temperatura, '🌡️', 'T°'), ...ambiente(a.oxigeno, '💧', 'O₂'));
  if (a.avisos.total) {
    items.push(`<li>📒 <b>${nf(a.avisos.total)} aviso(s) del libro</b> (${nf(a.avisos.enPeriodo)} en ${esc(etiquetaPeriodo(p))}): ${a.avisos.porTipo.map((t) => esc(t.etiqueta) + ' ' + nf(t.n)).join(' · ')}.</li>`);
  }
  const recientes = a.avisos.recientes.length ? `<details class="mop-det-avisos"><summary>Los ${nf(a.avisos.recientes.length)} avisos más recientes</summary>
      <ul class="mop-lista">${a.avisos.recientes.map((x) => `<li><b>${esc(dm(x.fecha))}</b> · ${esc(x.texto)}</li>`).join('')}</ul></details>` : '';
  const notas = [`Umbrales: T° ${esc(refUmbral('temperatura'))} · O₂ ${esc(refUmbral('oxigeno'))}.`];
  if (!a.avisos.aplica) notas.push('Los avisos del libro no dicen el código genético: con ese filtro no se muestran.');
  const titulo = Object.values(FUENTES).join('\n');
  return `<div class="mc-card mop-alertas">
    <h4 class="mc-card-h">⚠️ Alertas <span class="mc-h-note">${esc(etiquetaPeriodo(p))} · ${nf(a.total)}</span></h4>
    ${items.length ? `<ul class="mop-lista">${items.join('')}</ul>` : '<p class="mop-ok">✓ Sin alertas en el período.</p>'}
    ${recientes}
    <p class="mc-note" title="${esc(titulo)}">${notas.join(' ')}</p>
  </div>`;
}

function ultimosHTML(u) {
  return `<div class="mc-card">
    <h4 class="mc-card-h">🗓️ Últimos registros <span class="mc-h-note">contado hasta hoy</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Hoja</th><th>Último</th><th class="r">Hace</th><th class="r">Filas</th></tr></thead>
      <tbody>${u.map((f) => `<tr class="${f.atrasada ? 'mop-atrasada' : ''}">
        <td>${esc(f.etiqueta)}</td>
        <td>${f.ultima ? esc(dma(f.ultima)) : '<span class="muted">sin registros</span>'}</td>
        <td class="r">${f.ultima ? nf(f.dias) + ' d' + (f.atrasada ? ' ⚠' : '') : '—'}</td>
        <td class="r">${nf(f.filas)}${f.futuras ? ` <span class="mop-nota" title="con fecha posterior a hoy">+${nf(f.futuras)} futuras</span>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>
    <p class="mc-note">⚠ = hoja DIARIA (Salas y Tanques) con más de un día sin registro. Las demás registran sucesos: que pasen días sin ellos no es un atraso.</p>
  </div>`;
}

function finesHTML(fines) {
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">⏳ Fin de cuarentena en ${nf(AVISO_CUARENTENA_DIAS)} días <span class="mc-h-note">la cuarentena es de cada sala</span></h4>
    ${fines.length ? `<ul class="mop-lista mop-lista-fila">${fines.map((x) => `<li><b>${esc(x.lote)}</b> · ${esc(x.sala)} · pasa a Producción el <b>${esc(dm(x.fin))}</b>
        (en ${nf(x.enDias)} d) · ♀ ${nf(x.hembras)} ♂ ${nf(x.machos)}</li>`).join('')}</ul>`
    : `<p class="muted" style="margin:4px 0">Ningún lote sale de cuarentena en los próximos ${nf(AVISO_CUARENTENA_DIAS)} días.</p>`}
  </div>`;
}

/* ============================================================
   🏠 SALAS
   ============================================================ */
const varTxt = (x, unidad, dec) => (vacio(x.prom) ? '—'
  : `${nf(x.prom, dec)} ${unidad}${vacio(x.min) ? '' : ` (${nf(x.min, dec)}–${nf(x.max, dec)})`} · ${esc(dm(x.fecha))}`);
function diasTxt(l) {
  if (!l.dias) return '';
  if (l.estado === ESTADO_CUARENTENA) return ' ' + nf(l.dias.diasCuarentena) + ' d';
  if (l.estado === ESTADO_PRODUCCION) return ' ' + nf(l.dias.diasProduccion) + ' d';
  return '';
}

function tarjetaHTML(t, abierta) {
  const compara = t.coinciden === false ? '<span class="mop-dif" title="La hoja y el libro no coinciden">⚠</span>'
    : t.coinciden === true ? '<span class="mop-igual" title="La hoja y el libro coinciden">✓</span>' : '';
  const alc = t.alcalinidad;
  const lotes = t.lotes.length
    ? t.lotes.map((l) => `<span class="mop-chip is-e-${claseEstado(l.estado)}" title="${esc(`${l.lote} · ${l.estado || 'sin estado'} · ♀ ${nf(l.hembras)} ♂ ${nf(l.machos)}`)}">${esc(l.lote)} · ${esc(l.estado || 'sin estado')}${diasTxt(l)}</span>`).join('')
    : '<span class="muted">sin animales</span>';
  return `<div class="mop-sala-card ${abierta ? 'is-on' : ''}" role="button" tabindex="0" aria-pressed="${abierta}" data-mop-sala="${esc(t.sala)}">
    <div class="mop-sc-h">🏠 ${esc(t.sala)} ${compara}</div>
    <div class="mop-sc-fila"><span class="mop-sc-l">Hoja</span><span>${esc(t.registrado.estado || '—')}${t.registrado.fecha ? ' · ' + esc(dm(t.registrado.fecha)) : ''}</span></div>
    <div class="mop-sc-fila"><span class="mop-sc-l">Libro</span><span>${esc(t.propuesto.estado || '—')}</span></div>
    <div class="mop-sc-fila"><span class="mop-sc-l">Ocupación</span><span class="mop-bar" aria-hidden="true"><i style="width:${Math.min(100, Number(t.ocupacion.pct) || 0)}%"></i></span>
      <span>${nf(t.ocupacion.ocupados)}/${nf(t.ocupacion.total)} tanques</span></div>
    <div class="mop-sc-fila"><span class="mop-sc-l">Vivos</span><span>♀ ${nf(t.vivos.hembras)} · ♂ ${nf(t.vivos.machos)} · H:M ${nf(t.vivos.hm, 2)} ${dot(t.vivos.hmEstado, refUmbral('proporcionHM'))}</span></div>
    <div class="mop-sc-fila"><span class="mop-sc-l">T°</span><span>${varTxt(t.temp, '°C', 1)} ${dot(t.temp.estado, refUmbral('temperatura'))}</span></div>
    <div class="mop-sc-fila"><span class="mop-sc-l">O₂</span><span>${varTxt(t.ox, 'mg/L', 2)} ${dot(t.ox.estado, refUmbral('oxigeno'))}</span></div>
    <div class="mop-sc-fila"><span class="mop-sc-l">Alcalinidad</span><span>día ${nf(alc.dia.valor, 1)} ${dot(alc.dia.estado, refUmbral('alcalinidad'))} · noche ${nf(alc.noche.valor, 1)} ${dot(alc.noche.estado, refUmbral('alcalinidad'))}</span></div>
    <div class="mop-sc-fila"><span class="mop-sc-l">RAS</span><span>${esc(t.ras.texto || '—')} · ${vacio(t.toneladas.valor) ? '—' : nf(t.toneladas.valor, 2) + ' t por tanque'}</span></div>
    <div class="mop-sc-fila"><span class="mop-sc-l">Desinfección</span><span>${t.desinfeccion.fecha ? `hace ${nf(t.desinfeccion.dias)} d · ${esc(dm(t.desinfeccion.fecha))}` : 'sin registro'}</span></div>
    <div class="mop-sc-lotes">${lotes}</div>
  </div>`;
}

function salasHTML(M, F, d, p) {
  const tarjetas = tarjetasDeSalas(M, F);
  const abierta = d ? d.sala : '';
  return `<div class="mc-body">
    <div class="mop-salas">${tarjetas.map((t) => tarjetaHTML(t, t.sala === abierta)).join('')}</div>
    ${d ? detalleHTML(d, p, F) : '<p class="mc-note">Pulsa una sala para ver su detalle: la temperatura por hora, el oxígeno, sus tanques y sus tratamientos.</p>'}
  </div>`;
}

function cargaTxt(cargas, campo) {
  const conValor = cargas.filter((c) => !vacio(c[campo]));
  if (!conValor.length) return '—';
  if (new Set(conValor.map((c) => c[campo])).size === 1) return nf(conValor[0][campo], 2);
  return conValor.map((c) => `${esc(c.lote)} ${nf(c[campo], 2)}`).join(' · ');
}
const pesoTxt = (x) => (vacio(x.valor) ? '—' : `${nf(x.valor, 1)} <span class="mop-nota">${esc(dm(x.fecha))}</span>`);
function obsTxt(o) {
  if (!o.fecha) return '<span class="muted">—</span>';
  const todas = [...o.sanitarias.map((s) => `<span class="mop-obs-s">${esc(s)}</span>`), ...o.operativas.map((s) => esc(s))];
  return `<span class="mop-nota">${esc(dm(o.fecha))}</span> ${todas.length ? todas.join(', ') : '<span class="muted">sin observaciones</span>'}`;
}

function detalleHTML(d, p, F) {
  const filtrado = hayFiltro(F);
  const calor = d.calor.lecturas
    ? `<div class="mop-calor-wrap"><table class="mop-calor">
        <thead><tr><th>Día</th>${d.calor.horas.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${d.calor.filas.map((f) => `<tr><th scope="row">${esc(dm(f.fecha))}</th>${f.valores.map((v, i) => {
          const t = `${dm(f.fecha)} ${d.calor.horas[i]} · ${v === null ? 'sin lectura' : nf(v, 1) + ' °C'}`;
          return `<td class="${v === null ? '' : 'is-' + esc(f.estados[i])}" title="${esc(t)}">${v === null ? '' : esc(nf(v, 1))}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="mc-note">Verde dentro de ${esc(refUmbral('temperatura'))}; azul por debajo; rojo por encima. El día más reciente, arriba.</p>`
    : '<div class="empty-state" style="padding:16px">Sin lecturas de temperatura en el período.</div>';
  const ox = d.oxigeno.lecturas
    ? '<div class="mc-chart" style="height:230px"><canvas id="mopOx"></canvas></div>'
    : '<div class="empty-state" style="padding:16px">Sin lecturas de oxígeno en el período.</div>';
  const ocupados = d.tanques.filter((t) => t.vivos > 0);
  const vacios = d.tanques.filter((t) => !t.vivos).map((t) => t.tanque);
  const filas = ocupados.map((t) => `<tr class="${filtrado && t.enFiltro ? 'is-filtro' : ''}">
      <td><b>${esc(t.tanque)}</b>${t.fueraDeCatalogo ? ' <span class="mop-nota" title="No está en el catálogo de tanques de la sala">fuera de catálogo</span>' : ''}</td>
      <td>${t.lotes.map((l) => `<span class="mop-chip is-e-${claseEstado(l.estado)}" title="${esc(`${l.estado || 'sin estado'}${l.codigos.length ? ' · ' + l.codigos.join(', ') : ''}`)}">${esc(l.lote)}</span>`).join(' ')}</td>
      <td class="r">${nf(t.hembras)}</td><td class="r">${nf(t.machos)}</td>
      <td class="r">${nf(t.hm, 2)} ${dot(t.hmEstado, refUmbral('proporcionHM'))}</td>
      <td class="r">${t.densidad === '' ? '—' : nf(t.densidad, 2)} ${dot(t.densidadEstado, refUmbral('densidad'))}</td>
      <td class="r">${cargaTxt(t.cargas, 'cargaMetrica')}</td><td class="r">${cargaTxt(t.cargas, 'cargaVolumetrica')}</td>
      <td>♂ ${pesoTxt(t.peso.machos)}<br>♀ ${pesoTxt(t.peso.hembras)}</td>
      <td>${obsTxt(t.obs)}</td></tr>`).join('');
  const tabla = ocupados.length
    ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm">
        <thead><tr><th>Tanque</th><th>Lotes</th><th class="r">♀</th><th class="r">♂</th><th class="r">H:M</th><th class="r">Densidad /m²</th>
          <th class="r" title="Carga métrica del ⚖️ Saldo: biomasa ÷ área (pesos del lote)">g/m²</th><th class="r" title="Carga volumétrica del ⚖️ Saldo: biomasa ÷ volumen de un tanque de la sala">kg/m³</th>
          <th>Último peso (g)</th><th>Último parte</th></tr></thead>
        <tbody>${filas}</tbody></table></div>`
    : '<div class="empty-state" style="padding:16px">La sala no tiene animales al cierre de la foto.</div>';
  const trat = d.tratamientos.length
    ? `<ul class="mop-lista">${d.tratamientos.map((x) => `<li><b>${esc(dm(x.fecha))}</b> · ${esc(x.tipo || '—')}${x.area ? ' · ' + esc(x.area) : ''}${x.productos ? ' · ' + esc(x.productos) : ''}${x.ras ? ' · RAS: ' + esc(x.ras) : ''}</li>`).join('')}</ul>`
    : '<p class="muted" style="margin:4px 0">Sin tratamientos registrados en la sala.</p>';
  return `<div class="mc-card mc-card-wide mop-detalle">
    <h4 class="mc-card-h">▼ Detalle de ${esc(d.sala)} <span class="mc-h-note">${esc(dm(p.desde))} – ${esc(dm(p.hasta))} · el ambiente es de la sala: no depende del filtro de lote ni de tanque</span></h4>
    <div class="mop-det-grid">
      <div><h5 class="mop-det-h">🌡️ Temperatura por hora</h5>${calor}</div>
      <div><h5 class="mop-det-h">💧 Oxígeno disuelto (4 lecturas al día)</h5>${ox}</div>
      <div class="mop-det-ancho"><h5 class="mop-det-h">♀/♂ por tanque y densidad</h5><div class="mc-chart" style="height:250px"><canvas id="mopTq"></canvas></div></div>
      <div class="mop-det-ancho"><h5 class="mop-det-h">Tanques con animales</h5>${tabla}
        ${vacios.length ? `<p class="mc-note">Vacíos: ${vacios.map((n) => esc(n)).join(', ')}.</p>` : ''}</div>
      <div class="mop-det-ancho"><h5 class="mop-det-h">🧪 Tratamientos recientes</h5>${trat}</div>
    </div>
  </div>`;
}

const EJE = { color: '#78909c', font: { size: 10 } };
const REJILLA = 'rgba(120,144,156,.16)';
const COLORES_OX = ['#00838f', '#1e88e5', '#7e57c2', '#e67e22'];

function dibujarDetalle(d) {
  if (d.oxigeno.lecturas) {
    const u = d.oxigeno.umbral;
    const datasets = d.oxigeno.series.map((s, i) => ({ label: s.hora, data: s.valores, borderColor: COLORES_OX[i], backgroundColor: COLORES_OX[i],
      tension: 0.25, pointRadius: 2.5, borderWidth: 2, spanGaps: true }));
    if (u && u.min !== null) {
      datasets.push({ label: `Mínimo ${nf(u.min, 1)} mg/L`, data: d.oxigeno.fechas.map(() => u.min), borderColor: '#e0533b', borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 });
    }
    makeChart('mopOx', {
      type: 'line',
      data: { labels: d.oxigeno.fechas.map(dm), datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: { x: { ticks: { ...EJE, maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { ticks: EJE, grid: { color: REJILLA }, title: { display: true, text: 'mg/L', color: EJE.color, font: { size: 10 } } } },
        plugins: { legend: { labels: { usePointStyle: true, boxWidth: 10, font: { size: 10 }, color: EJE.color } } },
      },
    });
  }
  const u = d.densidad;
  const t = d.tanques;
  const datasets = [
    { type: 'bar', label: '♀ Hembras', data: t.map((x) => x.hembras), backgroundColor: '#d81b60cc', borderColor: '#d81b60', borderWidth: 1, yAxisID: 'y', order: 3, maxBarThickness: 22 },
    { type: 'bar', label: '♂ Machos', data: t.map((x) => x.machos), backgroundColor: '#1e88e5cc', borderColor: '#1e88e5', borderWidth: 1, yAxisID: 'y', order: 3, maxBarThickness: 22 },
    { type: 'line', label: 'Densidad (/m²)', data: t.map((x) => (x.densidad === '' ? null : x.densidad)), borderColor: '#00838f', backgroundColor: '#00838f',
      yAxisID: 'y1', order: 1, pointRadius: 3, borderWidth: 2, spanGaps: false },
  ];
  if (u && u.min !== null) datasets.push({ type: 'line', label: `Densidad mínima ${nf(u.min)}`, data: t.map(() => u.min), borderColor: '#2e9e5b', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, yAxisID: 'y1', order: 0 });
  if (u && u.max !== null) datasets.push({ type: 'line', label: `Densidad máxima ${nf(u.max)}`, data: t.map(() => u.max), borderColor: '#e0533b', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, yAxisID: 'y1', order: 0 });
  makeChart('mopTq', {
    data: { labels: t.map((x) => 'T' + x.tanque), datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { ...EJE, maxRotation: 0, autoSkip: false }, grid: { display: false } },
        y: { beginAtZero: true, position: 'left', ticks: { ...EJE, precision: 0 }, grid: { color: REJILLA }, title: { display: true, text: 'animales', color: EJE.color, font: { size: 10 } } },
        y1: { beginAtZero: true, position: 'right', ticks: EJE, grid: { drawOnChartArea: false }, title: { display: true, text: 'animales/m²', color: EJE.color, font: { size: 10 } } },
      },
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 10, font: { size: 10 }, color: EJE.color } } },
    },
  });
}

/* ============================================================
   EVENTOS (delegados, una sola vez por contenedor)
   ============================================================ */
/* ============================================================
   🧬 LOTES (F2.1/F2.2, 2026-09-19)
   Diseño aprobado por el usuario: TABLA MAESTRA arriba y, al pulsar una fila, la FICHA del lote debajo —origen,
   cascada del cuadre en tabla con columnas ♂/♀, curva de vivos con sus eventos, reproducción y promedios—; y al
   final la COMPARATIVA con su selector de agrupación (lote · código genético · piscina).
   Las cifras salen de operativo.lotes.js, que es puro y tiene su banco de mutación: aquí sólo se pintan.
   ============================================================ */
let _fichaLote = null;

function lotesHTML(M, memo, p, F) {
  const filas = tablaDeLotes(M, F);
  /* Un lote elegido que ya no está en la tabla (otro filtro, otra foto) deja de estarlo: la ficha no sobrevive a
     su fila, igual que el detalle de una sala no sobrevive a su tarjeta. */
  if (vOp.loteSel && !filas.some((f) => f.lote === vOp.loteSel)) vOp.loteSel = '';
  _fichaLote = vOp.loteSel ? fichaDeLote(M, serieDe(memo, p), vOp.loteSel, p) : null;
  const comp = comparativa(M, F, p, vOp.agrupacion);
  return tablaLotesHTML(filas, F) + (_fichaLote ? fichaLoteHTML(_fichaLote, p) : '') + comparativaHTML(comp, p);
}

function tablaLotesHTML(filas, F) {
  if (!filas.length) {
    return `<div class="mc-card"><h4 class="mc-card-h">🧬 Lotes</h4>
      <p class="muted" style="margin:4px 0">${hayFiltro(F) ? 'Ningún lote pasa el filtro.' : 'El libro no conoce ningún lote todavía.'}</p></div>`;
  }
  /* Con filtro de sexo se enseña ESA columna, no el total: si no, la tabla contradiría al KPI de Vivos. */
  const col = (x) => (F.sexo ? x[F.sexo] : x.total);
  const fila = (f) => {
    const sel = f.lote === vOp.loteSel;
    const cuadra = f.cuadra ? '' : ' <span class="mop-dif" title="La cascada del cuadre no cuadra: mírala en la ficha">⚠</span>';
    return `<tr class="mop-lote-fila ${sel ? 'is-on' : ''}" role="button" tabindex="0" aria-pressed="${sel}" data-mop-lote="${esc(f.lote)}">
      <td><b>${esc(f.lote)}</b>${cuadra}</td>
      <td><span class="mop-chip is-e-${claseEstado(f.estado)}">${esc(f.estado || 'sin estado')}</span></td>
      <td>${f.codigos.length ? f.codigos.map((c) => esc(c)).join(' · ') : '<span class="muted">—</span>'}</td>
      <td>${f.salas.length ? f.salas.map((s) => esc(s)).join(' · ') : '<span class="muted">—</span>'}</td>
      <td class="r">${nf(col(f.ingresados))}</td>
      <td class="r">${nf(col(f.vivos))}</td>
      <td class="r">${pc(col(f.supervivencia))}</td>
      <td class="r">${pc(col(f.descarte))}</td>
      <td class="r">${F.sexo ? '<span class="muted" title="La proporción sexual no significa nada con un solo sexo">—</span>' : nf(f.hm, 2)}</td>
      <td class="r">${f.dias === '' ? '—' : nf(f.dias) + ' d'}${f.cerrado ? ' <span class="mop-nota" title="Cerrado el ' + esc(dma(f.cerrado)) + '">cerrado</span>' : ''}</td>
    </tr>`;
  };
  const sx = F.sexo === 'hembras' ? '♀ ' : F.sexo === 'machos' ? '♂ ' : '';
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">🧬 Lotes <span class="mc-h-note">al cierre de la foto · pulsa una fila para su ficha${F.sexo ? ' · sólo ' + (F.sexo === 'hembras' ? 'hembras' : 'machos') : ''}</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lotes">
      <thead><tr><th>Lote</th><th>Estado</th><th>Código</th><th>Salas</th><th class="r">${sx}Ingresados</th><th class="r">${sx}Vivos</th>
        <th class="r" title="${esc(definicion('supervivencia'))}">Superv.</th>
        <th class="r" title="${esc(definicion('tasaDescarte'))}">Descarte</th>
        <th class="r" title="${esc(definicion('proporcionHM'))}">♀:♂</th><th class="r">Edad</th></tr></thead>
      <tbody>${filas.map(fila).join('')}</tbody></table></div>
    <p class="mc-note">La EDAD va del ingreso a la foto; en un lote cerrado, hasta su cierre. ⚠ en un lote = su cascada no cuadra.${F.sexo ? ' Con filtro de sexo estas cifras son de ese sexo; la CASCADA de la ficha sigue entera, porque es un cuadre y a medias no cuadraría.' : ''}</p>
  </div>`;
}

function cuadreHTML(c) {
  const dc = c.deLosCuales;
  const cel = (v) => (v === 0 ? '<span class="muted">0</span>' : nf(v));
  const fila = (f) => `<tr class="${f.id === 'vivos' ? 'mop-cuadre-tot' : ''}">
      <td><span class="mop-cuadre-s">${f.signo}</span> ${esc(f.etiqueta)}</td>
      <td class="r">${cel(f.machos)}</td><td class="r">${cel(f.hembras)}</td><td class="r"><b>${cel(f.total)}</b></td></tr>`;
  /* «De los cuales» va DEBAJO de Muertos y sin signo: son un desglose de esa misma cifra, no otra baja. Restarlas
     aparte descuadraría el lote — es el defecto que vigila L01 de su banco. */
  const deLos = (dc.desove.muertas || dc.recuperacion.muertas)
    ? `<tr class="mop-cuadre-sub"><td colspan="4">de los cuales, en tanques de
        <b>desove</b> ${nf(dc.desove.muertas)} ♀${dc.desove.entran ? ' (de ' + nf(dc.desove.entran) + ' que entraron)' : ''} ·
        <b>recuperación</b> ${nf(dc.recuperacion.muertas)} ♀${dc.recuperacion.entran ? ' (de ' + nf(dc.recuperacion.entran) + ')' : ''}
        — ya contadas arriba</td></tr>` : '';
  const filas = c.filas.map((f) => fila(f) + (f.id === 'muertos' ? deLos : '')).join('');
  const veredicto = c.cuadra
    ? '<span class="mop-igual">✓ cuadra</span>'
    : `<span class="mop-dif">⚠ no cuadra: sobran ${nf(Math.abs(c.descuadre.total))} que la resta no explica</span>`;
  const deficit = c.deficit.total
    ? `<p class="mc-note">⚠ Un Fin de Ciclo pidió ${nf(c.deficit.total)} animales más de los que el libro tenía vivos: la salida
        que se enseña es la EFECTIVA, y el libro lo anotó como déficit.</p>` : '';
  return `<div class="mc-card">
    <h4 class="mc-card-h">⚖️ Cuadre del lote <span class="mc-h-note">${veredicto}</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-cuadre">
      <thead><tr><th></th><th class="r">♂</th><th class="r">♀</th><th class="r">Total</th></tr></thead>
      <tbody>${filas}</tbody></table></div>${deficit}
  </div>`;
}

function fichaLoteHTML(f, p) {
  const r = f.reproduccion;
  const pr = f.promedios;
  const origen = f.origen.length
    ? `<ul class="mop-lista">${f.origen.map((o) => `<li>${esc(dma(o.fecha))} · <b>${esc(o.sala)}</b> tanque ${nf(o.tanque)} ·
        ♀ ${nf(o.hembras)} ♂ ${nf(o.machos)} · código ${esc(o.codigo || '—')} ·
        piscina ${esc(o.piscina || '—')} · camaronera ${esc(o.camaronera || '—')}</li>`).join('')}</ul>`
    : '<p class="muted" style="margin:4px 0">Ningún Ingreso explica este lote.</p>';
  const eventos = f.eventos.length
    ? `<ul class="mop-lista mop-lista-fila">${f.eventos.map((e) => `<li>${esc(dm(e.fecha))} · ${esc(e.etiqueta)}${e.machos || e.hembras ? ` · ♀ ${nf(e.hembras)} ♂ ${nf(e.machos)}` : ''}</li>`).join('')}</ul>`
    : `<p class="muted" style="margin:4px 0">Sin eventos en ${esc(etiquetaPeriodo(p))}.</p>`;
  return `<div class="mop-det-grid" style="margin-bottom:12px">
    <div class="mc-card mop-det-ancho">
      <h4 class="mc-card-h">🧬 ${esc(f.lote)}
        <span class="mc-h-note">${esc(f.estado || 'sin estado')} · ingreso ${esc(dma(f.ingreso))}${f.cerrado ? ' · cerrado ' + esc(dma(f.cerrado)) : ''} ·
        ${nf(f.tanques)} tanque(s) en ${f.salas.map((s) => esc(s)).join(', ') || '—'}</span></h4>
      <h5 class="mop-det-h">Origen</h5>${origen}
    </div>
    ${f.cuadre ? cuadreHTML(f.cuadre) : ''}
    <div class="mc-card">
      <h4 class="mc-card-h">🥚 Reproducción <span class="mc-h-note">${esc(etiquetaPeriodo(p))}</span></h4>
      <div class="mop-sc-fila"><span class="mop-sc-l">Desoves</span><span>${nf(r.desoves)}</span></div>
      <div class="mop-sc-fila"><span class="mop-sc-l">Huevos</span><span>${nf(r.huevos)} · ${nf(r.huevosPorDesove)} por desove</span></div>
      <div class="mop-sc-fila"><span class="mop-sc-l">N2</span><span>${nf(r.n2)} · fertilidad ${pc(r.fertilidad)} ${dot(evaluar('fertilidad', r.fertilidad), refUmbral('fertilidad'))}</span></div>
      <div class="mop-sc-fila"><span class="mop-sc-l">N5</span><span>${nf(r.n5)} · ${nf(r.n5PorDesove)} por desove</span></div>
      <p class="mc-note">La fertilidad sale sólo de los desoves que TRAEN su N2; el N5 se cuenta aparte y NO se compara con el N2.</p>
      <h5 class="mop-det-h">Promedios de sus tanques</h5>
      <div class="mop-sc-fila"><span class="mop-sc-l">Peso</span><span>♂ ${nf(pr.pesoMachos, 2)} g · ♀ ${nf(pr.pesoHembras, 2)} g</span></div>
      <div class="mop-sc-fila"><span class="mop-sc-l">Cópulas</span><span>${nf(pr.copulas)} · ${pc(pr.pctCopulas)} de sus hembras</span></div>
      <div class="mop-sc-fila"><span class="mop-sc-l">Muda</span><span>${nf(pr.muda)} · ${pc(pr.pctMuda)} de sus hembras</span></div>
      ${pr.compartido ? '<p class="mc-note">⚠ Comparte tanque con otro lote: la hoja de Tanques no dice de qué lote es cada cifra, así que las cópulas y las mudas van repartidas en proporción a sus animales (los pesos se promedian, no se parten).</p>' : ''}
    </div>
    <div class="mc-card mop-det-ancho">
      <h4 class="mc-card-h">📈 Vivos del lote <span class="mc-h-note">${esc(etiquetaPeriodo(p))}</span></h4>
      <div class="mc-chart" style="height:240px"><canvas id="mopLoteCurva"></canvas></div>
      <h5 class="mop-det-h">Eventos del período</h5>${eventos}
    </div>
  </div>`;
}

function comparativaHTML(c, p) {
  const pills = DIMENSIONES_COMPARATIVA.map((d) => `<button class="mc-pill ${c.dimension === d.clave ? 'is-on' : ''}" data-mop-agr="${d.clave}">${esc(d.etiqueta)}</button>`).join('');
  const porLote = c.dimension === 'lote';
  const cuerpo = c.filas.length
    ? c.filas.map((f) => `<tr>
        <td><b>${esc(f.origen)}</b>${porLote ? '' : ` <span class="mop-nota">${f.lotes.length} lote(s)</span>`}</td>
        <td class="r">${nf(f.ingresados)}</td><td class="r">${nf(f.vivos)}</td><td class="r">${pc(f.supervivencia)}</td>
        <td class="r">${nf(f.desoves)}</td><td class="r">${pc(f.fertilidad)}</td><td class="r">${nf(f.n5)}</td>
        <td class="r">${f.dias === '' ? '—' : nf(f.dias) + ' d'}</td></tr>`).join('')
    : '<tr><td colspan="8" class="muted">Nada que comparar con este filtro.</td></tr>';
  const veredicto = c.mejor
    ? `<p class="mc-note">Mejor supervivencia: <b>${esc(c.mejor)}</b> · peor: <b>${esc(c.peor)}</b>.</p>`
    : '<p class="mc-note">Con una sola fila no hay comparación: compararse consigo mismo no dice nada.</p>';
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">📊 Comparativa <span class="mc-h-note">${esc(etiquetaPeriodo(p))}</span>
      <span class="mc-seg mop-agr">${pills}</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>${esc((DIMENSIONES_COMPARATIVA.find((d) => d.clave === c.dimension) || {}).etiqueta || 'Lote')}</th>
        <th class="r">Ingresados</th><th class="r">Vivos</th><th class="r">Superv.</th>
        <th class="r">Desoves</th><th class="r">Fertilidad</th><th class="r">N5</th><th class="r">Edad</th></tr></thead>
      <tbody>${cuerpo}</tbody></table></div>${veredicto}
  </div>`;
}

/** La curva de vivos del lote. Los eventos van como puntos marcados sobre la misma línea, no como otra serie. */
function dibujarLote(f) {
  if (!f || !f.curva.length) return;
  const conEvento = new Set(f.eventos.map((e) => e.fecha));
  makeChart('mopLoteCurva', {
    type: 'line',
    data: {
      labels: f.curva.map((d) => dm(d.fecha)),
      datasets: [
        { label: '♀ Hembras', data: f.curva.map((d) => d.hembras), borderColor: '#d81b60', backgroundColor: '#d81b60', tension: 0.25, borderWidth: 2,
          pointRadius: f.curva.map((d) => (conEvento.has(d.fecha) ? 4 : 0)) },
        { label: '♂ Machos', data: f.curva.map((d) => d.machos), borderColor: '#1e88e5', backgroundColor: '#1e88e5', tension: 0.25, borderWidth: 2,
          pointRadius: f.curva.map((d) => (conEvento.has(d.fecha) ? 4 : 0)) },
        { label: 'Total', data: f.curva.map((d) => d.total), borderColor: '#00838f', backgroundColor: '#00838f', tension: 0.25, borderWidth: 2, borderDash: [5, 4],
          pointRadius: f.curva.map((d) => (conEvento.has(d.fecha) ? 4 : 0)) },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { x: { ticks: { ...EJE, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { beginAtZero: true, ticks: EJE, grid: { color: REJILLA } } },
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 10, font: { size: 10 }, color: EJE.color } } },
    },
  });
}

/* ============================================================
   💀 BAJAS y 🔍 REVISIONES (F3, 2026-09-20)
   Diseño aprobado por el usuario: dos sub-vistas propias; el desglose de bajas en TABLA CRUZADA con selector de
   agrupación; y las revisiones como SEMÁFORO por variable con su último valor y su historial debajo.
   Las cifras salen de operativo.bajas.js y operativo.revisiones.js, que son puros y tienen su banco: aquí sólo
   se pintan. Los gráficos van en HTML/CSS (barras y la rejilla de calor que ya existe), sin Chart.js: no hay
   nada que destruir al cambiar de sub-vista.
   ============================================================ */

/** Una barra proporcional, con su parte rellena. `tono` la colorea como el resto del tablero. */
function barra(valor, max, tono) {
  const pct = max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  return `<span class="mop-b3" aria-hidden="true"><i class="${tono || ''}" style="width:${pct}%"></i></span>`;
}

/** Lo que una pieza no ha podido filtrar, dicho en una línea. */
function ignoraHTML(ignora, que) {
  if (!ignora || !ignora.length) return '';
  return `<p class="mc-note">⚠ ${esc(que)} no puede separarse por ${ignora.map((x) => esc(x)).join(' ni por ')}:
    ese filtro no se ha aplicado aquí. ${ignora.includes('lote') ? 'Una fila de Tanques dice su sala y su tanque, pero no de qué lote era cada animal.' : ''}</p>`;
}

/* ── 💀 BAJAS ───────────────────────────────────────────────── */

function bajasHTML(M, memo, p, F) {
  const d = desgloseDeBajas(M, serieDe(memo, p), memo.partes, F, p, vOp.agrupacionBajas);
  const mot = motivosDeCierre(M.fuentes, p, F);
  const hor = bajasPorHora(M.fuentes, p, F);
  const cal = calorSalaDia(memo.partes, F, p);
  const cer = lotesCerrados(M, F, p);
  return `<div class="mc-body">
    ${desgloseHTML(d, p)}
    <div class="mc-grid">
      ${motivosHTML(mot, p)}
      ${horasHTML(hor, p)}
    </div>
    ${calorHTML(cal, p)}
    ${cerradosHTML(cer, p)}
  </div>`;
}

function desgloseHTML(d, p) {
  const pills = DIMENSIONES_BAJAS.map((x) => `<button class="mc-pill ${d.dimension === x.clave ? 'is-on' : ''}" data-mop-agrb="${x.clave}">${esc(x.etiqueta)}</button>`).join('');
  const cab = (DIMENSIONES_BAJAS.find((x) => x.clave === d.dimension) || {}).etiqueta || 'Sala';
  let cuerpo;
  if (d.modo === 'sin-serie') {
    cuerpo = `<tr><td colspan="9" class="muted">El período no alcanza a la víspera de su primer día: sin ella no se puede saber cuántas bajas son DE ESTE período y cuántas venían de antes.</td></tr>`;
  } else if (!d.filas.length) {
    cuerpo = `<tr><td colspan="9" class="muted">Ninguna baja registrada en ${esc(etiquetaPeriodo(p))}.</td></tr>`;
  } else {
    cuerpo = d.filas.map((f) => `<tr>
      <td><b>${esc(f.clave)}</b>${f.desove ? ` <span class="mop-nota" title="De sus muertes, ${nf(f.desove)} fueron de hembras en tanques de desove o de recuperación, no en su tanque">${nf(f.desove)} en desove</span>` : ''}</td>
      <td class="r">${nf(f.natural.machos)}</td><td class="r">${nf(f.natural.hembras)}</td><td class="r"><b>${nf(f.natural.total)}</b></td>
      <td class="r">${nf(f.descarte.machos)}</td><td class="r">${nf(f.descarte.hembras)}</td><td class="r"><b>${nf(f.descarte.total)}</b></td>
      <td class="r"><b>${nf(f.total)}</b></td><td class="r">${pc(f.pct)}</td></tr>`).join('')
      + `<tr class="mop-cuadre-tot"><td>TOTAL</td>
      <td class="r">${nf(d.totales.natural.machos)}</td><td class="r">${nf(d.totales.natural.hembras)}</td><td class="r">${nf(d.totales.natural.total)}</td>
      <td class="r">${nf(d.totales.descarte.machos)}</td><td class="r">${nf(d.totales.descarte.hembras)}</td><td class="r">${nf(d.totales.descarte.total)}</td>
      <td class="r">${nf(d.totales.total)}</td><td class="r">100 %</td></tr>`;
  }
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">💀 Bajas del período <span class="mc-h-note">${esc(etiquetaPeriodo(p))} · ${d.modo === 'libro' ? 'repartidas por el libro' : 'las registradas en los partes'}</span>
      <span class="mc-seg mop-agr">${pills}</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-cruz">
      <thead>
        <tr><th rowspan="2">${esc(cab)}</th><th colspan="3" class="r">Muerte natural</th><th colspan="3" class="r">Descarte de selección</th><th rowspan="2" class="r">Total</th><th rowspan="2" class="r">% del total</th></tr>
        <tr><th class="r">♂</th><th class="r">♀</th><th class="r">todos</th><th class="r">♂</th><th class="r">♀</th><th class="r">todos</th></tr>
      </thead>
      <tbody>${cuerpo}</tbody></table></div>
    ${d.totales.total ? `<p class="mc-note">El descarte de selección es el <b>${pc(d.totales.pctDescarte)}</b> de las bajas del período. Las dos columnas son DISJUNTAS: la hoja las registra por separado y se suman.</p>` : ''}
    <p class="mc-note">⚠ El «% del total» es la parte que le toca a cada fila de las bajas del período, <b>no</b> una tasa de mortalidad: la tasa es por lote y la da 📊 Estado actual con la regla del ⚖️ Saldo.</p>
    ${ignoraHTML(d.ignora, 'El desglose por ' + cab.toLowerCase())}
  </div>`;
}

function motivosHTML(m, p) {
  if (!m.filas.length) {
    return `<div class="mc-card"><h4 class="mc-card-h">📉 Motivos de Fin de Ciclo <span class="mc-h-note">${esc(etiquetaPeriodo(p))}</span></h4>
      <p class="muted" style="margin:4px 0">Ningún lote se cerró en el período.</p>
      <p class="mc-note">La hoja de Fin de Ciclo nace con su primer envío: mientras no haya cierres, esto se queda vacío y es lo correcto.</p></div>`;
  }
  const max = m.filas[0].total;
  return `<div class="mc-card">
    <h4 class="mc-card-h">📉 Motivos de Fin de Ciclo <span class="mc-h-note">${nf(m.cierres)} cierre(s) · ${esc(etiquetaPeriodo(p))}</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Motivo</th><th></th><th class="r">Salieron</th><th class="r">Acum.</th><th class="r">Cierres</th><th class="r">Metabis.</th></tr></thead>
      <tbody>${m.filas.map((f) => `<tr>
        <td>${esc(f.motivo)}${f.enCatalogo ? '' : ' <span class="mop-nota" title="No está en el catálogo de la ficha">fuera del catálogo</span>'}</td>
        <td style="width:34%">${barra(f.total, max)}</td>
        <td class="r"><b>${nf(f.total)}</b></td><td class="r">${pc(f.acumulado)}</td>
        <td class="r">${nf(f.cierres)}${f.totales ? ` <span class="mop-nota">${nf(f.totales)} total(es)</span>` : ''}</td>
        <td class="r">${vacio(f.metabisulfito) || !f.metabisulfito ? '—' : nf(f.metabisulfito, 2) + ' kg'}</td></tr>`).join('')}</tbody></table></div>
    <p class="mc-note">Ordenados de mayor a menor con su acumulado: el primero dice cuánto del total explica UN motivo.${m.metabisulfito ? ` Metabisulfito del período: <b>${nf(m.metabisulfito, 2)} kg</b>.` : ''}</p>
  </div>`;
}

function horasHTML(h, p) {
  if (!h.horas.length && !h.sinHora) {
    return `<div class="mc-card"><h4 class="mc-card-h">🕒 Bajas por hora <span class="mc-h-note">${esc(etiquetaPeriodo(p))}</span></h4>
      <p class="muted" style="margin:4px 0">Ninguna baja registrada en el período.</p></div>`;
  }
  return `<div class="mc-card">
    <h4 class="mc-card-h">🕒 Bajas por hora <span class="mc-h-note">${nf(h.registros)} parte(s) con bajas · ${esc(etiquetaPeriodo(p))}</span></h4>
    ${h.horas.length ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Hora</th><th></th><th class="r">Natural</th><th class="r">Descarte</th><th class="r">Total</th><th class="r">%</th></tr></thead>
      <tbody>${h.horas.map((f) => `<tr class="${f.hora === h.pico ? 'mop-pico' : ''}">
        <td><b>${esc(f.hora)}:00</b>${f.hora === h.pico ? ' <span class="mop-nota">pico</span>' : ''}</td>
        <td style="width:34%">${barra(f.total, h.max)}</td>
        <td class="r">${nf(f.natural.total)}</td><td class="r">${nf(f.descarte.total)}</td>
        <td class="r"><b>${nf(f.total)}</b></td><td class="r">${pc(f.pct)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted" style="margin:4px 0">Ningún parte del período trae su hora.</p>'}
    ${h.sinHora ? `<p class="mc-note">⚠ <b>${nf(h.sinHora)}</b> baja(s) vienen de partes SIN hora: se cuentan aparte en vez de caer en una hora inventada.</p>` : ''}
    <p class="mc-note">Se agrupa por la hora entera: cada parte es una ronda, no un instante.</p>
    ${ignoraHTML(h.ignora, 'La distribución por hora')}
  </div>`;
}

function calorHTML(c, p) {
  if (!c.salas.length) return '';
  const tono = (v) => {
    if (v === null) return '';
    if (!v) return 'is-cero';
    const i = c.max > 0 ? v / c.max : 0;
    return i > 0.66 ? 'is-alto' : i > 0.33 ? 'is-medio' : 'is-bajo';
  };
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">🔥 Bajas por sala y día <span class="mc-h-note">${esc(etiquetaPeriodo(p))} · máximo ${nf(c.max)} en un día</span></h4>
    <div class="mop-calor-wrap"><table class="mop-calor">
      <thead><tr><th></th>${c.dias.map((d) => `<th>${esc(dm(d))}</th>`).join('')}</tr></thead>
      <tbody>${c.salas.map((s) => `<tr><th>${esc(s.sala)}</th>${s.valores.map((v, i) => `<td class="${tono(v)}" title="${esc(s.sala + ' · ' + dma(c.dias[i]) + ' · ' + (v === null ? 'sin parte registrado' : v + ' bajas'))}">${v === null ? '' : nf(v)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <p class="mc-note">Una celda VACÍA es «no se registró ningún parte»; un <b>0</b> es «se registró y no murió ninguno». No son lo mismo.</p>
  </div>`;
}

function cerradosHTML(c, p) {
  if (!c.length) {
    return `<div class="mc-card mc-card-wide"><h4 class="mc-card-h">🔚 Lotes cerrados <span class="mc-h-note">${esc(etiquetaPeriodo(p))}</span></h4>
      <p class="muted" style="margin:4px 0">Ningún cierre en el período.</p></div>`;
  }
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">🔚 Lotes cerrados <span class="mc-h-note">${nf(c.length)} cierre(s) · ${esc(etiquetaPeriodo(p))}</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Fecha</th><th>Lote</th><th>Tipo</th><th>Motivo</th><th class="r">Salieron ♂/♀</th><th class="r">Rojos</th><th class="r">Diferencia</th><th class="r">Metabisulfito</th></tr></thead>
      <tbody>${c.map((f) => `<tr>
        <td>${esc(dma(f.fecha))}</td><td><b>${esc(f.lote)}</b>${f.sala ? ' <span class="mop-nota">' + esc(f.sala) + '</span>' : ''}</td>
        <td>${esc(f.tipo || '—')}</td><td>${esc(f.motivo || '—')}</td>
        <td class="r">${nf(f.salida.machos)} / ${nf(f.salida.hembras)}</td>
        <td class="r">${f.rojos ? nf(f.rojos) : '—'}</td>
        <td class="r">${f.diferencia.total ? `<span class="mop-dif" title="Lo que el libro contaba vivo y no salió: se anota y el lote queda a cero">${nf(f.diferencia.total)}</span>` : '—'}</td>
        <td class="r">${f.metabisulfito === null ? '—' : nf(f.metabisulfito, 2) + ' kg'}${f.fechaMetabisulfito ? ' <span class="mop-nota">' + esc(dm(f.fechaMetabisulfito)) + '</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="mc-note">La DIFERENCIA no se recalcula aquí: es la que el libro anotó al cerrar el lote, con su fecha y su lote.</p>
  </div>`;
}

/* ── 🔍 REVISIONES ──────────────────────────────────────────── */

function revisionesHTML(M, memo, p, F) {
  const r = revisionesDeNauplios(M.fuentes, F, p);
  const a = alcalinidadPorArea(M.fuentes, F, p);
  const m = mortalidadEnDesove(M.fuentes, F, p);
  const o = frecuenciaDeObservaciones(memo.partes, F, p);
  return `<div class="mc-body">
    ${semaforoHTML(r, p)}
    <div class="mc-grid">
      ${alcalinidadHTML(a, p)}
      ${mortDesoveHTML(m, p)}
    </div>
    ${observacionesHTML(o, p)}
    ${historialRevHTML(r, p)}
  </div>`;
}

function semaforoHTML(r, p) {
  const u = r.ultima;
  if (!u) {
    return `<div class="mc-card mc-card-wide"><h4 class="mc-card-h">🔍 Revisión de nauplios <span class="mc-h-note">${esc(etiquetaPeriodo(p))}</span></h4>
      <p class="muted" style="margin:4px 0">Ninguna revisión registrada en el período.</p>
      <p class="mc-note">Las revisiones viven en la hoja del Inf. Supervisor, que nace con su primer envío.</p>
      ${ignoraHTML(r.ignora, 'La revisión de nauplios')}</div>`;
  }
  const celda = (v) => {
    const val = u.valores[v.id] || '';
    const malo = v.id === 'hongos' && u.hongos;
    return `<div class="mop-sem ${malo ? 'is-malo' : ''}">
      <span class="mop-sem-l">${esc(v.etiqueta)}</span>
      <span class="mop-sem-v">${val ? esc(val) : '<span class="muted">—</span>'}${malo ? ' ⚠' : ''}</span>
      ${v.veredicto ? '' : '<span class="mop-sem-n" title="No hay ninguna fuente que diga qué valor está bien: se enseña tal cual">sin criterio</span>'}
    </div>`;
  };
  const lectura = (etq, x) => `<div class="mop-sem ${x.aviso ? 'is-malo' : ''}">
    <span class="mop-sem-l">${esc(etq)}</span>
    <span class="mop-sem-v">${x.valor === null ? '<span class="muted">—</span>' : nf(x.valor, 2) + ' ' + esc(x.unidad)}${x.aviso ? ' ⚠' : ''}</span>
    <span class="mop-sem-n">avisa por encima de ${nf(x.max)} ${esc(x.unidad)}</span></div>`;
  const etapas = r.porEtapa.map((e) => `<span class="mop-chip ${e.ultima ? '' : 'is-e-vacio'}" title="${esc(e.ultima ? 'Última: ' + dma(e.ultima.fecha) : 'Sin ninguna revisión de esta etapa en el período')}">${esc(e.etapa)}${e.ultima ? ' · ' + esc(dm(e.ultima.fecha)) : ''}</span>`).join('');
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">🔍 Revisión de nauplios
      <span class="mc-h-note">última: ${esc(dma(u.fecha))} · ${esc(u.etapa)} · lote ${esc(u.lote || '—')}</span></h4>
    <div class="mop-sems">${VARIABLES_REVISION.map(celda).join('')}${lectura('Salinidad', u.salinidad)}${lectura('Temperatura', u.temperatura)}</div>
    <h5 class="mop-det-h">Última de cada etapa</h5>
    <div class="mop-sc-lotes">${etapas}</div>
    <p class="mc-note">⚠ Sólo llevan veredicto las reglas que EXISTEN: los dos topes de aviso que confirmó el usuario y la presencia de hongos. Deformidad, actividad, fototropismo y aireación se enseñan tal cual: no hay fuente que diga cuál de «Alta», «Media» o «Baja» está bien, y una escala inventada sería peor que ninguna.</p>
    ${r.avisos.length ? `<p class="mc-note">🔴 <b>${nf(r.avisos.length)}</b> revisión(es) del período traen algún aviso.</p>` : ''}
    ${ignoraHTML(r.ignora, 'La revisión de nauplios')}
  </div>`;
}

function alcalinidadHTML(a, p) {
  return `<div class="mc-card">
    <h4 class="mc-card-h">🧪 Alcalinidad por área <span class="mc-h-note">${esc(etiquetaPeriodo(p))} · ${a.umbral ? '≥ ' + nf(a.umbral.min) + ' mg/L' : 'sin umbral'}</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Área</th><th class="r">Día</th><th class="r">Noche</th></tr></thead>
      <tbody>${a.areas.map((x) => `<tr>
        <td>${esc(x.area)}${x.esRas ? ' <span class="mop-nota" title="El RAS no es una sala: es el circuito que las alimenta">circuito</span>' : ''}</td>
        ${['dia', 'noche'].map((t) => `<td class="r">${x[t].valor === null ? '<span class="muted">—</span>'
          : nf(x[t].valor, 1) + ' ' + dot(x[t].estado, refUmbral('alcalinidad')) + ' <span class="mop-nota">' + esc(dm(x[t].fecha)) + '</span>'}</td>`).join('')}
      </tr>`).join('')}</tbody></table></div>
    ${a.conDato ? '' : '<p class="muted" style="margin:4px 0">Ninguna lectura de alcalinidad en el período.</p>'}
    <p class="mc-note">Cada turno guarda su última lectura por separado: anotar la de noche no borra la del día.</p>
  </div>`;
}

function mortDesoveHTML(m, p) {
  return `<div class="mc-card">
    <h4 class="mc-card-h">🥚 Mortalidad en desove y recuperación <span class="mc-h-note">${esc(etiquetaPeriodo(p))}</span></h4>
    ${m.entran ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Tipo de tanque</th><th class="r">♀ entran</th><th class="r">♀ mueren</th><th class="r">%</th><th class="r">Registros</th></tr></thead>
      <tbody>${m.filas.map((t) => `<tr><td>${esc(t.tipo)}</td>
        <td class="r">${nf(t.entran)}</td><td class="r">${nf(t.muertas)}</td>
        <td class="r"><b>${pc(t.pct)}</b></td><td class="r">${nf(t.registros)}</td></tr>`).join('')}
        <tr class="mop-cuadre-tot"><td>TOTAL</td><td class="r">${nf(m.entran)}</td><td class="r">${nf(m.muertas)}</td><td class="r">${pc(m.pct)}</td><td class="r"></td></tr>
      </tbody></table></div>`
    : '<p class="muted" style="margin:4px 0">Ninguna hembra entró a desovar ni a recuperarse en el período.</p>'}
    <p class="mc-note">⚠ Estas muertes YA están dentro de las bajas del lote: aquí se abren por tipo de tanque, que es lo que el libro no dice. No se suman a 💀 Bajas.</p>
  </div>`;
}

function observacionesHTML(o, p) {
  const bloque = (titulo, filas) => {
    if (!filas.length) return `<div><h5 class="mop-det-h">${esc(titulo)}</h5><p class="muted" style="margin:4px 0">Ninguna marcada.</p></div>`;
    const max = filas[0].veces;
    return `<div><h5 class="mop-det-h">${esc(titulo)}</h5>
      <table class="mc-table mc-table-sm"><tbody>${filas.map((f) => `<tr>
        <td>${esc(f.obs)}</td><td style="width:40%">${barra(f.veces, max)}</td>
        <td class="r"><b>${nf(f.veces)}</b></td>
        <td class="r"><span class="mop-nota">${nf(f.tanques)} tanque(s) · ${pc(f.pct)}</span></td></tr>`).join('')}</tbody></table></div>`;
  };
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">📋 Observaciones de tanque <span class="mc-h-note">${nf(o.registros)} parte(s) · ${esc(etiquetaPeriodo(p))}</span></h4>
    <div class="mop-det-grid">${bloque('Sanitarias', o.sanitarias)}${bloque('Operativas', o.operativas)}</div>
    <p class="mc-note">Se cuenta una vez por día, sala y tanque. No se comparan con ningún catálogo: se cuenta lo que los partes traen.</p>
    ${ignoraHTML(o.ignora, 'La frecuencia de observaciones')}
  </div>`;
}

function historialRevHTML(r, p) {
  if (!r.filas.length) return '';
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">🗓️ Historial de revisiones <span class="mc-h-note">${nf(r.filas.length)} en ${esc(etiquetaPeriodo(p))}</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Fecha</th><th>Lote</th><th>Etapa</th>${VARIABLES_REVISION.map((v) => `<th>${esc(v.etiqueta)}</th>`).join('')}<th class="r">Salinidad</th><th class="r">Temp.</th></tr></thead>
      <tbody>${r.filas.map((f) => `<tr class="${f.hongos || f.salinidad.aviso || f.temperatura.aviso ? 'mop-atrasada' : ''}">
        <td>${esc(dma(f.fecha))}</td><td>${esc(f.lote || '—')}</td><td>${esc(f.etapa)}</td>
        ${VARIABLES_REVISION.map((v) => `<td>${f.valores[v.id] ? esc(f.valores[v.id]) : '<span class="muted">—</span>'}</td>`).join('')}
        <td class="r">${f.salinidad.valor === null ? '—' : nf(f.salinidad.valor, 2) + (f.salinidad.aviso ? ' ⚠' : '')}</td>
        <td class="r">${f.temperatura.valor === null ? '—' : nf(f.temperatura.valor, 2) + (f.temperatura.aviso ? ' ⚠' : '')}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
}

function bind(root) {
  if (root._mopBound) return;
  root._mopBound = true;
  const repintar = () => operativoView(root);
  const abrirSala = (sala) => { vOp.salaDetalle = vOp.salaDetalle === sala ? '' : sala; repintar(); };
  const abrirLote = (lote) => { vOp.loteSel = vOp.loteSel === lote ? '' : lote; repintar(); };

  root.addEventListener('click', (e) => {
    const t = e.target;
    const sub = t.closest('[data-mop-sub]');
    if (sub) { vOp.sub = sub.dataset.mopSub; repintar(); return; }
    const per = t.closest('[data-mop-periodo]');
    if (per) { vOp.periodo = per.dataset.mopPeriodo; repintar(); return; }
    if (t.closest('[data-mop-limpiar]')) {
      Object.assign(vOp, { periodo: INICIAL.periodo, fecha: '', sala: '', tanque: '', lote: '', codigo: '', tanqueSel: '', salaDetalle: '', loteSel: '', estado: '', sexo: '', piscina: '', camaronera: '' });
      repintar();
      return;
    }
    const col = t.closest('[data-mop-color]');
    if (col) { vOp.color = col.dataset.mopColor; repintar(); return; }
    const qui = t.closest('[data-mop-quitar]');
    if (qui) {
      /* No hace falta soltar aquí el tanque: sin sala, `depurarFiltros` ya lo limpia en el pintado siguiente
         (`!vOp.sala`). La línea que lo hacía era redundante —ningún banco podía distinguirla— y se retiró. ⚠ La
         del CAMBIO de sala NO lo es: al pasar a otra sala que también tenga ese número, depurarFiltros lo da por
         bueno y el tanque de la sala anterior se quedaría puesto (eso lo vigila V08). */
      const dim = qui.dataset.mopQuitar;
      vOp[dim] = '';
      repintar();
      return;
    }
    const lot = t.closest('[data-mop-lote]');
    if (lot) { abrirLote(lot.dataset.mopLote); return; }
    const agr = t.closest('[data-mop-agr]');
    if (agr) { vOp.agrupacion = agr.dataset.mopAgr; repintar(); return; }
    const agb = t.closest('[data-mop-agrb]');
    if (agb) { vOp.agrupacionBajas = agb.dataset.mopAgrb; repintar(); return; }
    const ftq = t.closest('[data-mop-filtrar-tq]');
    if (ftq) {
      const k = ftq.dataset.mopFiltrarTq;
      const i = k.lastIndexOf('|');
      vOp.sala = k.slice(0, i);
      vOp.tanque = k.slice(i + 1);
      repintar();
      return;
    }
    // Un tanque del mapa: su ficha se abre SIN repintar la vista (el foco se queda en el tanque).
    const tq = t.closest('[data-mop-tq]');
    if (tq) {
      vOp.tanqueSel = vOp.tanqueSel === tq.dataset.mopTq ? '' : tq.dataset.mopTq;
      root.querySelectorAll('.mop-tq.is-sel').forEach((b) => b.classList.remove('is-sel'));
      if (vOp.tanqueSel) tq.classList.add('is-sel');
      const info = root.querySelector('.mop-tq-info');
      if (info) info.innerHTML = infoTanqueHTML(_mapa);
      return;
    }
    const sala = t.closest('[data-mop-sala]');
    if (sala) abrirSala(sala.dataset.mopSala);
  });

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const sala = e.target.closest && e.target.closest('[data-mop-sala]');
    if (sala && e.target === sala) { e.preventDefault(); abrirSala(sala.dataset.mopSala); return; }
    const lote = e.target.closest && e.target.closest('[data-mop-lote]');
    if (lote && e.target === lote) { e.preventDefault(); abrirLote(lote.dataset.mopLote); }
  });

  root.addEventListener('change', (e) => {
    const f = e.target.closest('[data-mop-filtro]');
    if (f) {
      const dim = f.dataset.mopFiltro;
      vOp[dim] = f.value || '';
      if (dim === 'sala') vOp.tanque = '';
      vOp.tanqueSel = '';
      repintar();
      return;
    }
    if (e.target.matches('[data-mop-fecha]')) { vOp.fecha = e.target.value || ''; repintar(); }
  });
}
