/* ============================================================
   MADURACIÓN · OPERATIVO — la VISTA del tablero (F1–F6, 2026-09-19 a 2026-09-21)

   «🐚 Operativo» de la entrada de Maduración (entrada.js), con el diseño que aprobó el usuario en cada fase:
   barra de filtros (período · foto al día · sala → tanque · lote → código · estado · sexo · piscina · camaronera,
   con etiquetas de lo activo y «limpiar») y sus sub-vistas.
   ⚠ La lista viva es `SUBS`, unas líneas más abajo, y los KPI son el array `kpis`: se leen de ahí, no de aquí.
     Esta cabecera se quedó atrás DOS veces —«dos sub-vistas» con cinco, y luego «cinco» con siete—, así que ya no
     lleva la cuenta: dice dónde mirar además de qué hay. Hoy:
     📊 Estado actual — los KPI (Vivos, Lotes, Salas, Ocupación, Mortalidad, Reproducción y Biomasa), el mapa de
        planta (por estado, vivos o densidad), las alertas, los últimos registros y los lotes que salen de
        cuarentena en los próximos 7 días;
     🏠 Salas — una tarjeta por sala y, al pulsarla, su detalle: la T° por hora, el O₂, ♀/♂ y densidad por tanque,
        la tabla de tanques y los tratamientos recientes;
     🧬 Lotes (F2) — tabla maestra con los cerrados dentro, ficha del lote con la CASCADA DEL CUADRE, y comparativa
        por lote, código genético o piscina; y debajo (F6) 📈 Piscinas de origen, el Broodstock: el último corte de
        cada piscina con los lotes que entraron de ella y, al pulsarla, su ficha con el peso por semana;
     💀 Bajas (F3) — muerte natural frente a descarte de selección, desglose cruzado (sala · tanque · lote), Pareto
        de motivos de cierre, distribución por hora y mapa de calor sala × día;
     🔍 Revisiones del supervisor (F3) — nauplios en sus 4 etapas, alcalinidad por área, mortalidad en desove y
        recuperación, y frecuencia de observaciones. Se llama así, y no «Revisiones», porque Larvicultura ya tiene
        una con ese nombre y ese icono (D-8, 2026-09-20);
     🛢 Tanques (F4) — tabla maestra de los tanques ocupados y, al pulsar una fila, su ficha: composición, curva de
        vivos, partes del día con su hora, observaciones y movimientos;
     🥚 Reproducción (F4) — totales, los desoves pendientes de N5 arriba, la tabla por lote y a dónde fueron;
     🔄 Manejo (F5) — movimientos (matriz sala → sala con el registro debajo), la alimentación PLANIFICADA por
        producto contra la agenda estándar, con cada toma juzgada con el rango de la ficha, y los tratamientos
        (calendario sala × día, productos por área y cobertura preventiva por lote);
     🩺 Calidad del dato (F6) — las hojas y su calendario, los partes esperados frente a los registrados, el estado
        registrado de cada sala frente al propuesto, los avisos del libro y el cruce con 🧬 Microchips.
   Esta vista sólo PINTA: las cifras salen de los módulos puros operativo.*.js, que tienen sus pruebas y sus bancos
   de mutación. Se carga DIFERIDA (import() en entrada.js) junto con su CSS.
   ⚠ El período de este tablero es SUYO (termina en la foto): no lee el rango de la barra de fecha global. Si algún día
     lo leyera, main.js tendría que declararlo (lo vigila src/ui/dateBarVisibility.test.js).
   ============================================================ */
import './operativo.css';
import { store } from '../../core/store.js';
import { makeChart, destroyAllCharts } from '../../core/charts.js';
import { esc } from '../../core/format.js';
import { sumarDias, ESTADO_CUARENTENA, ESTADO_PRODUCCION, ESTADO_MIXTO } from '../registros/lib/mad-libro.js';
import { modeloOperativo, serieDiaria, diasDeTanque, libroAlCierre } from './operativo.data.js';
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
import { tablaDeTanques, fichaDeTanque, avisosDeTanques } from './operativo.tanques.js';
import { pendientesDeN5, tablaDeReproduccion, destinosDeDespacho, totalesDeReproduccion } from './operativo.reproduccion.js';
import {
  VARIABLES_REVISION, revisionesDeNauplios, alcalinidadPorArea, mortalidadEnDesove, frecuenciaDeObservaciones,
} from './operativo.revisiones.js';
import {
  matrizDeMovimientos, registroDeMovimientos, alimentacionPorProducto, procedenciaDelPeso,
  calendarioDeTratamientos, productosPorArea, coberturaPreventiva,
} from './operativo.manejo.js';
import { tablaDePiscinas, fichaDePiscina } from './operativo.broodstock.js';
import { estadoDeHojas, calendarioDeRegistros, coberturaDePartes, comparacionDeEstados, avisosDelLibro } from './operativo.calidad.js';
import { cruceConMicrochips } from './operativo.cruce.js';
import {
  REPORTES, parteDiario, parteDiarioDoc, parteDiarioHojas, nombreDelParte, alcanceDelParte,
  semanalPorLote, semanalDoc, semanalHojas, nombreDelSemanal,
  cierreDeLote, cierreDoc, cierreHojas, nombreDelCierre,
} from './operativo.reportes.js';
import { printFichaDocs } from '../supervisor/fichaPdf.js';
import { toast } from '../../ui/toast.js';
import { buildReproModel, MAD_MATRIZ_ORIGIN, MAD_BITACORA_ORIGIN, MAD_TRANSFER_ORIGIN } from './data.js';

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
  /* F4 (2026-09-21) · las dos últimas del plan, SEPARADAS por decisión del usuario: responden preguntas
     distintas —«qué pasa en ESTE tanque» y «cuánto desova y qué sale»— y no comparten ni filtros ni unidad. */
  { clave: 'tanques', etiqueta: 'Tanques', icono: '🛢' },
  { clave: 'reproduccion', etiqueta: 'Reproducción', icono: '🥚' },
  /* F5 (2026-09-21) · lo que se le HACE a la planta, frente a lo que le pasa: movimientos, alimentación y
     tratamientos en UNA sola sub-vista con tres bloques y los mismos filtros. Decisión del usuario: con una
     pastilla por tema la sub-nav no cabía en un móvil. */
  { clave: 'manejo', etiqueta: 'Manejo', icono: '🔄' },
  /* F6 (2026-09-21) · si lo que dice el tablero descansa sobre registros completos, y el cruce con 🧬 Microchips,
     en UNA sub-vista nueva (decisión del usuario). Broodstock no tiene pastilla: vive en 🧬 Lotes, como el ORIGEN
     de los lotes. */
  { clave: 'calidad', etiqueta: 'Calidad del dato', icono: '🩺' },
  /* F7 (2026-09-22) · la reportería, con su propia pastilla (decisión del usuario). `.mc-subnav` es `flex-wrap`,
     así que la décima envuelve en el móvil: no repite el problema de sitio que obligó a fusionar F5. */
  { clave: 'reportes', etiqueta: 'Reportes', icono: '🖨' },
];
const INICIAL = { sub: 'estado', periodo: PERIODO_INICIAL, fecha: '', sala: '', tanque: '', lote: '', codigo: '', color: 'estado', salaDetalle: '', tanqueSel: '', loteSel: '', agrupacion: 'lote',
  estado: '', sexo: '', piscina: '', camaronera: '', agrupacionBajas: 'sala',
  /* F4.1 · el tanque cuya FICHA está abierta en 🛢 Tanques. Es otro que `tanqueSel`, que es el del mapa de
     📊 Estado: comparten idea pero no vida —el del mapa se apaga al repintar y éste sobrevive al filtro—, y
     reusar uno para las dos cosas haría que abrir uno cerrara el otro sin que se viera por qué. */
  tqFicha: '',
  /* F6 · la piscina cuya FICHA está abierta en 📈 Piscinas de origen (🧬 Lotes). No es el filtro `piscina`: aquél
     elige lotes por su origen, y ésta sólo abre una ficha. */
  piscinaSel: '',
  /* F7 · el reporte elegido en 🖨 Reportes, y el lote del CIERRE (F7.2). El DÍA del reporte no vive aquí: es la
     foto del tablero (`fecha`), por decisión del usuario, para que el papel no pueda enseñar un día distinto del
     de la pantalla. `repLote` sí es propio: elige de qué lote es el cierre, no filtra el tablero. */
  rep: 'diario', repLote: '' };
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
let _memo = { src: null, hoy: '', fecha: '', M: null, partes: null, serieClave: '', serie: null, repro: null, libroHoy: null };
function memoModelo(hoy, fecha) {
  if (_memo.src !== store.globalData || _memo.hoy !== hoy || _memo.fecha !== fecha) {
    const M = modeloOperativo(store.globalData, { hoy, fecha });
    _memo = { src: store.globalData, hoy, fecha, M, partes: diasDeTanque(M.fuentes.tanques), serieClave: '', serie: null, repro: null, libroHoy: null };
  }
  return _memo;
}
/** El cruce con 🧬 Microchips (F6.3). El registro reproductivo se modela como en su vista, y el libro es el de HOY:
 *  la MATRIZ sólo sabe cómo están las hembras hoy, así que cruzarla con el libro de una foto pasada marcaría como
 *  discrepancia lo que sólo es el paso del tiempo. Los dos se calculan una vez por datos y foto. */
function cruceDe(memo, p, F) {
  const M = memo.M;
  if (!memo.repro) {
    const filas = store.globalData;
    memo.repro = buildReproModel(filas.filter((r) => r._SheetOrigin === MAD_MATRIZ_ORIGIN),
      filas.filter((r) => r._SheetOrigin === MAD_BITACORA_ORIGIN), filas.filter((r) => r._SheetOrigin === MAD_TRANSFER_ORIGIN));
  }
  if (!memo.libroHoy) memo.libroHoy = M.fecha === M.hoy ? M.libro : libroAlCierre(M.fuentes, M.hoy);
  return { ...cruceConMicrochips(memo.repro, memo.libroHoy, M.fuentes, p, F),
    hembras: memo.repro.females.length, fotoDeHoy: M.fecha === M.hoy, hoy: M.hoy, fecha: M.fecha };
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
  } else if (vOp.sub === 'tanques') {
    h += tanquesHTML(M, memo, periodo, F);
  } else if (vOp.sub === 'reproduccion') {
    h += reproduccionHTML(M, periodo, F);
  } else if (vOp.sub === 'manejo') {
    h += manejoHTML(M, periodo, F);
  } else if (vOp.sub === 'calidad') {
    h += calidadHTML(M, memo, periodo, F);
  } else if (vOp.sub === 'reportes') {
    h += reportesHTML(M, memo, fecha, hoy, F);
  } else {
    h += estadoHTML(M, memo, periodo, F);
  }
  root.innerHTML = h;
  if (detalle) dibujarDetalle(detalle);
  if (vOp.sub === 'lotes') dibujarLote(_fichaLote);
  if (vOp.sub === 'lotes') dibujarPiscina(_fichaPiscina);
  if (vOp.sub === 'tanques') dibujarTanque(_fichaTanque);
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
   F6 (2026-09-21) · debajo, 📈 Piscinas de origen (operativo.broodstock.js): el ORIGEN de los lotes.
   ============================================================ */
let _fichaLote = null;
let _fichaPiscina = null;

function lotesHTML(M, memo, p, F) {
  const filas = tablaDeLotes(M, F);
  /* Un lote elegido que ya no está en la tabla (otro filtro, otra foto) deja de estarlo: la ficha no sobrevive a
     su fila, igual que el detalle de una sala no sobrevive a su tarjeta. */
  if (vOp.loteSel && !filas.some((f) => f.lote === vOp.loteSel)) vOp.loteSel = '';
  _fichaLote = vOp.loteSel ? fichaDeLote(M, serieDe(memo, p), vOp.loteSel, p) : null;
  const comp = comparativa(M, F, p, vOp.agrupacion);
  /* F6 · 📈 Piscinas de origen, debajo de la comparativa (diseño aprobado): la tabla del último corte y, al pulsar
     una piscina, su ficha. La ficha no sobrevive a su fila, igual que la del lote. */
  const bs = tablaDePiscinas(M, F);
  if (vOp.piscinaSel && !bs.piscinas.some((x) => x.piscina === vOp.piscinaSel)) vOp.piscinaSel = '';
  _fichaPiscina = vOp.piscinaSel ? fichaDePiscina(M, vOp.piscinaSel, p) : null;
  return tablaLotesHTML(filas, F) + (_fichaLote ? fichaLoteHTML(_fichaLote, p) : '') + comparativaHTML(comp, p)
    + piscinasHTML(bs, F) + (_fichaPiscina ? fichaPiscinaHTML(_fichaPiscina, p) : '');
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

/* ── 📈 PISCINAS DE ORIGEN (F6, 2026-09-21) ────────────────────
   Diseño aprobado por el usuario: TABLA de piscinas con su último corte y los lotes que entraron de cada una, con
   su desempeño; al pulsar una fila, su FICHA debajo —el peso por semana, los días por fase y sus lotes—. */

/** Lo que la tabla de piscinas no puede filtrar, con SU motivo. */
const PORQUE_BS = 'Es una piscina de engorde: no está en ninguna sala, no tiene sexo ni estado de sala, y a su lote sólo se llega por el Ingreso.';
const SOBREV_DUDA = { fraccion: 'parece una fracción sin convertir', fuera: 'fuera de 0–100: no puede ser un porcentaje' };

/** La sobrevivencia tal como vino, marcada si no puede ser un porcentaje (el mismo criterio que avisa al subir). */
function sobrevivenciaHTML(x) {
  if (vacio(x.sobrevivencia)) return '—';
  const v = nf(x.sobrevivencia, 2) + ' %';
  if (!x.sobrevivenciaDudosa) return v;
  const quiza = x.sobrevivenciaDudosa === 'fraccion' ? ' (¿' + nf(x.sobrevivencia * 100, 2) + ' %?)' : '';
  return `<span class="mop-dif" title="${esc(SOBREV_DUDA[x.sobrevivenciaDudosa] + quiza)}">${v} ⚠</span>`;
}

function piscinasHTML(bs, F) {
  const cab = `<h4 class="mc-card-h">📈 Piscinas de origen <span class="mc-h-note">Broodstock${bs.corte ? ' · último corte ' + esc(dma(bs.corte)) : ''}${bs.piscinas.length ? ' · pulsa una fila para su ficha' : ''}</span></h4>`;
  const sinCarga = bs.sinBroodstock.length
    ? `<p class="mc-note">⚠ Hay lotes que entraron de piscinas que ninguna carga nombra: <b>${bs.sinBroodstock.map((x) => esc(x)).join(' · ')}</b>.
        Su origen no se puede enseñar hasta que se suba su piscina.</p>` : '';
  if (!bs.cortes) {
    return `<div class="mc-card mc-card-wide mop-piscinas">${cab}
      <p class="muted" style="margin:4px 0">Todavía no hay ninguna carga de 📈 Broodstock hasta la foto: el Excel semanal de las piscinas se sube en Registros → Maduración.</p>${sinCarga}</div>`;
  }
  const fila = (x) => {
    const sel = x.piscina === vOp.piscinaSel;
    const d = x.desempeno;
    const inc = vacio(x.incremento) ? '—' : (x.incremento > 0 ? '+' : '') + nf(x.incremento, 2);
    return `<tr class="mop-bs-fila ${sel ? 'is-on' : ''}" role="button" tabindex="0" aria-pressed="${sel}" data-mop-piscina="${esc(x.piscina)}">
      <td><b>${esc(x.piscina)}</b></td>
      <td>${esc(x.fase || '—')}${x.faseEnCatalogo ? '' : ' <span class="mop-nota" title="No es una de las fases del catálogo: se enseña como vino">fuera del catálogo</span>'}</td>
      <td class="r">${nf(x.peso, 2)}</td><td class="r">${inc}</td><td class="r">${nf(x.crecimiento, 2)}</td>
      <td class="r">${sobrevivenciaHTML(x)}</td><td class="r">${nf(x.densidad, 1)}</td>
      <td class="r">${vacio(x.edad) ? '—' : nf(x.edad) + ' d'}</td>
      <td>${x.lotes.length ? x.lotes.map((l) => esc(l)).join(' · ') : '<span class="muted">—</span>'}</td>
      <td class="r">${d ? nf(d.vivos) + ' / ' + nf(d.ingresados) : '—'}</td>
      <td class="r">${d ? pc(d.supervivencia) : '—'}</td><td class="r">${d ? nf(d.desoves) : '—'}</td>
      <td class="r">${d ? pc(d.fertilidad) : '—'}</td>
    </tr>`;
  };
  const tabla = bs.piscinas.length
    ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-bs">
        <thead><tr><th>Piscina</th><th>Fase</th><th class="r">Peso (g)</th><th class="r" title="Incremento de la última semana">Δ sem (g)</th>
          <th class="r" title="Crecimiento en la fase actual">g/sem</th><th class="r" title="Sobrevivencia estimada de la piscina">Sobrev.</th>
          <th class="r" title="Densidad de siembra, camarones por m²">Dens.</th><th class="r">Edad</th><th>Lotes</th>
          <th class="r" title="Vivos hoy de los lotes que entraron de ella / los que entraron">Vivos / ingr.</th>
          <th class="r" title="${esc(definicion('supervivencia'))}">Superv. lotes</th><th class="r">Desoves</th><th class="r">Fertilidad</th></tr></thead>
        <tbody>${bs.piscinas.map(fila).join('')}</tbody></table></div>`
    : `<p class="muted" style="margin:4px 0">${hayFiltro(F) ? 'Ninguna piscina del último corte pasa el filtro.' : 'El último corte no trae ninguna piscina.'}</p>`;
  const ausentes = bs.ausentes.length
    ? `<p class="mc-note">No vinieron en el último corte (sí en el del ${esc(dma(bs.previo))}): <b>${bs.ausentes.map((x) => esc(x)).join(' · ')}</b>.
        Re-subir una semana no borra las piscinas que ya no vienen: se quedan en su semana y aquí no se enseñan como si fueran de ahora.</p>` : '';
  return `<div class="mc-card mc-card-wide mop-piscinas">${cab}${tabla}
    <p class="mc-note">Cada piscina con la fila del ÚLTIMO corte hasta la foto. El DESEMPEÑO es el de los lotes que entraron de ella, con la
      fórmula de la comparativa de arriba; la piscina se lee en su forma canónica («P 12» y «P12» del Ingreso son la misma,
      y la comparativa, que las lleva tal cual se teclearon, las enseña por separado).</p>
    ${ausentes}${sinCarga}${ignoraHTML(bs.ignora, 'Una piscina de Broodstock', PORQUE_BS)}
  </div>`;
}

function fichaPiscinaHTML(f, p) {
  const u = f.ultimo;
  const dias = (v) => (vacio(v) ? '—' : nf(v) + ' d');
  const dato = (rotulo, v) => `<span class="mop-sc-l">${esc(rotulo)}</span><span>${v}</span>`;
  const lotes = f.lotes.length
    ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-bs-lotes">
        <thead><tr><th>Lote</th><th class="r">Entraron de aquí ♀ / ♂</th><th>También entró de</th><th class="r">Vivos del lote</th>
          <th class="r">Superv. del lote</th><th>Estado</th></tr></thead>
        <tbody>${f.lotes.map((l) => `<tr><td><b>${esc(l.lote)}</b></td>
          <td class="r">${nf(l.entraron.hembras)} / ${nf(l.entraron.machos)}</td>
          <td>${l.otrasPiscinas.length ? l.otrasPiscinas.map((x) => esc(x)).join(' · ') : '<span class="muted">—</span>'}</td>
          <td class="r">${l.vivos === null ? '—' : nf(l.vivos)}</td><td class="r">${pc(l.supervivencia)}</td>
          <td>${l.estado ? `<span class="mop-chip is-e-${claseEstado(l.estado)}">${esc(l.estado)}</span>` : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="mc-note">Los VIVOS y la SUPERVIVENCIA son los del lote ENTERO, los de la tabla de lotes: nadie registra de qué piscina es cada
        animal vivo, y repartirlos entre piscinas sería inventar un dato.</p>`
    : '<p class="muted" style="margin:4px 0">Según el Ingreso, ningún lote entró de esta piscina hasta la foto.</p>';
  const obs = f.observaciones.length
    ? `<ul class="mop-lista">${f.observaciones.map((o) => `<li>${esc(dma(o.corte))} · ${esc(o.texto)}</li>`).join('')}</ul>`
    : `<p class="muted" style="margin:4px 0">Sin observaciones en ${esc(etiquetaPeriodo(p))}.</p>`;
  return `<div class="mc-card mc-card-wide mop-ficha mop-bs-ficha">
    <h4 class="mc-card-h">📈 Piscina ${esc(f.piscina)}
      <span class="mc-h-note">${esc(u.fase || 'sin fase')} · corte ${esc(dma(u.corte))}${u.camaronera ? ' · ' + esc(u.camaronera) : ''}${u.codigo ? ' · código ' + esc(u.codigo) : ''}</span></h4>
    <h5 class="mop-h5">Peso por semana <span class="mop-nota">${esc(etiquetaPeriodo(p))}</span></h5>
    ${f.serie.length ? '<div class="mc-chart" style="height:200px"><canvas id="mopPiscinaCurva"></canvas></div>'
      : `<p class="muted" style="margin:4px 0">Ningún corte en ${esc(etiquetaPeriodo(p))}: el último es del ${esc(dma(u.corte))}.</p>`}
    <h5 class="mop-h5">Días por fase</h5>
    <div class="mop-sc-fila">${dato('Precría', dias(u.dias.precria))}${dato('Engorde', dias(u.dias.engorde))}${dato('Pre-reprod.', dias(u.dias.prerreproductor))}${dato('Edad', dias(u.edad))}</div>
    <h5 class="mop-h5">Siembra</h5>
    <div class="mop-sc-fila">${dato('Fecha', esc(dma(u.fechaSiembra)))}${dato('Sembrados', nf(u.sembrada))}${dato('Densidad', nf(u.densidad, 1) + ' /m²')}${dato('Peso', nf(u.pesoSiembra, 3) + ' g')}${dato('Pl/g', nf(u.plg, 1))}${dato('Área', nf(u.area, 2) + ' ha')}</div>
    <h5 class="mop-h5">Lotes que entraron de ella</h5>${lotes}
    <h5 class="mop-h5">Observaciones del período</h5>${obs}
  </div>`;
}

/** El peso de la piscina, corte a corte. Un corte sin peso deja su hueco en la línea en vez de caer a cero. */
function dibujarPiscina(f) {
  if (!f || !f.serie.length) return;
  makeChart('mopPiscinaCurva', {
    type: 'line',
    data: {
      labels: f.serie.map((s) => dm(s.corte)),
      datasets: [{ label: 'Peso (g)', data: f.serie.map((s) => (vacio(s.peso) ? null : s.peso)), borderColor: '#00838f', backgroundColor: '#00838f',
        tension: 0.25, borderWidth: 2, pointRadius: 3 }],
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

/** Lo que una pieza no ha podido filtrar, dicho en una línea. `porque` es el motivo de SU hoja: el de Tanques
 *  («no dice de qué lote era cada animal») es el de por defecto, y no vale para las hojas de 🔄 Manejo. */
function ignoraHTML(ignora, que, porque) {
  if (!ignora || !ignora.length) return '';
  const motivo = porque !== undefined ? porque
    : ignora.includes('lote') ? 'Una fila de Tanques dice su sala y su tanque, pero no de qué lote era cada animal.' : '';
  return `<p class="mc-note">⚠ ${esc(que)} no puede separarse por ${ignora.map((x) => esc(x)).join(' ni por ')}:
    ese filtro no se ha aplicado aquí. ${esc(motivo)}</p>`;
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

/* ============================================================
   🛢 TANQUES y 🥚 REPRODUCCIÓN (F4, 2026-09-21)
   Diseño aprobado por el usuario: dos sub-vistas SEPARADAS; Tanques con tabla maestra + ficha debajo, como
   🧬 Lotes; y Reproducción por LOTE, con los pendientes de N5 arriba, que es lo accionable.
   Las cifras salen de operativo.tanques.js y operativo.reproduccion.js, puros y con su banco: aquí sólo se
   pintan. La curva del tanque va con Chart.js, igual que la del lote —es el mismo gráfico y se dibuja igual—;
   lo demás en HTML/CSS, como F3.
   ============================================================ */
let _fichaTanque = null;

function tanquesHTML(M, memo, p, F) {
  const filas = tablaDeTanques(M, p, F, memo.partes);
  /* Un tanque elegido que ya no está en la tabla (otro filtro, otra foto) deja de estarlo: la ficha no
     sobrevive a su fila, igual que la del lote y el detalle de la sala. */
  if (vOp.tqFicha && !filas.some((f) => f.sala + '|' + f.tanque === vOp.tqFicha)) vOp.tqFicha = '';
  const i = vOp.tqFicha.lastIndexOf('|');
  _fichaTanque = vOp.tqFicha
    ? fichaDeTanque(M, serieDe(memo, p), vOp.tqFicha.slice(0, i), vOp.tqFicha.slice(i + 1), p, F, memo.partes)
    : null;
  return tablaTanquesHTML(filas, F) + (_fichaTanque ? fichaTanqueHTML(_fichaTanque) : '');
}

function tablaTanquesHTML(filas, F) {
  if (!filas.length) {
    return `<div class="mc-card"><h4 class="mc-card-h">🛢 Tanques</h4>
      <p class="muted" style="margin:4px 0">${hayFiltro(F) ? 'Ningún tanque ocupado pasa el filtro.' : 'El libro no tiene ningún tanque ocupado.'}</p></div>`;
  }
  const avisos = avisosDeTanques(F);
  const fila = (f) => {
    const k = f.sala + '|' + f.tanque;
    const sel = k === vOp.tqFicha;
    return `<tr class="mop-tq-fila ${sel ? 'is-on' : ''}" role="button" tabindex="0" aria-pressed="${sel}" data-mop-tqf="${esc(k)}">
      <td>${esc(f.sala)}</td>
      <td class="r"><b>${nf(f.tanque)}</b></td>
      <td>${f.lotes.map((l) => esc(l)).join(' · ')}${f.compartido ? ' <span class="mop-nota" title="Este tanque tiene más de un lote">compartido</span>' : ''}${f.parcial ? ' <span class="mop-dif" title="El filtro deja fuera parte de lo que hay en el tanque; las cifras son las del tanque entero">⚠</span>' : ''}</td>
      <td class="r">${nf(f.vivos.total)}</td>
      <td class="r"><span class="mop-nota">♀ ${nf(f.vivos.hembras)} · ♂ ${nf(f.vivos.machos)}</span></td>
      <td class="r" title="${esc(definicion('proporcionHM'))}">${nf(f.hm, 2)}</td>
      <td class="r" title="${esc(definicion('densidadTanque'))}">${nf(f.densidad, 2)}</td>
      <td class="r">${nf(f.cargaMetrica, 2)}</td>
      <td class="r">${nf(f.pesoHembras, 1)} / ${nf(f.pesoMachos, 1)}</td>
      <td class="r">${nf(f.rondas)}</td>
      <td class="r">${f.ultimoParte ? esc(dm(f.ultimoParte)) : '<span class="muted">—</span>'}</td>
    </tr>`;
  };
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">🛢 Tanques <span class="mc-h-note">ocupados al cierre de la foto · pulsa una fila para su ficha</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-tanques">
      <thead><tr><th>Sala</th><th class="r">Tanque</th><th>Lote(s)</th><th class="r">Vivos</th><th class="r">♀ / ♂</th>
        <th class="r" title="${esc(definicion('proporcionHM'))}">♀:♂</th>
        <th class="r" title="${esc(definicion('densidadTanque'))}">Dens.</th>
        <th class="r" title="Biomasa del tanque ÷ su área, en g/m²">Carga</th>
        <th class="r">Peso ♀/♂ (g)</th><th class="r">Rondas</th><th class="r">Últ. parte</th></tr></thead>
      <tbody>${filas.map(fila).join('')}</tbody></table></div>
    <p class="mc-note">Los VIVOS y la CARGA son del tanque ENTERO —el área y el volumen son suyos, no del lote—, y los
      PESOS son los del último parte, no el promedio del período.${avisos.length ? ' ⚠ ' + esc(avisos[0]) : ''}</p>
  </div>`;
}

function partesHoyHTML(hoy, ultimo) {
  /* ⚠ Con el retraso normal del registro, el día de la foto suele estar vacío. Decir sólo «no hay» dejaría la
     sección en un callejón, así que se apunta a dónde SÍ hay. */
  if (!hoy.partes.length) {
    return `<p class="muted" style="margin:4px 0">Sin partes en la foto de este día.${ultimo
      ? ' El último fue el <b>' + esc(dma(ultimo)) + '</b>: pon esa fecha en la foto para verlo.' : ''}</p>`;
  }
  const f = (x) => `<tr>
      <td>${x.hora ? esc(x.hora) : '<span class="mop-nota" title="Este parte es anterior a la columna «Hora» (2026-09-17)">sin hora</span>'}</td>
      <td class="r">${x.parte ? nf(x.parte) : '—'}</td>
      <td class="r">${nf(x.machosMuertos)} / ${nf(x.hembrasMuertas)}</td>
      <td class="r">${nf(x.machosDescarte)} / ${nf(x.hembrasDescarte)}</td>
      <td class="r">${nf(x.copulas)}</td><td class="r">${nf(x.muda)}</td>
      <td class="r">${nf(x.pesoHembras, 1)} / ${nf(x.pesoMachos, 1)}</td>
      <td>${[...x.sanitarias, ...x.operativas].map((o) => esc(o)).join(', ') || '<span class="muted">—</span>'}</td>
    </tr>`;
  return `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-partes">
      <thead><tr><th>Hora</th><th class="r">Parte</th><th class="r">Muertos ♂/♀</th><th class="r">Descarte ♂/♀</th>
        <th class="r">Cóp.</th><th class="r">Muda</th><th class="r">Peso ♀/♂</th><th>Observaciones</th></tr></thead>
      <tbody>${hoy.partes.map(f).join('')}</tbody></table></div>
    ${hoy.sinHora ? '<p class="mc-note">⚠ ' + nf(hoy.sinHora) + ' parte(s) sin hora, al final: son anteriores a que existiera esa columna y no se les inventa un turno.</p>' : ''}`;
}

function obsFrecHTML(o) {
  const lista = (arr, rotulo) => {
    if (!arr.length) return '';
    const max = arr[0].veces;
    return `<div class="mop-obs-g"><b>${esc(rotulo)}</b>${arr.map((x) => `<div class="mop-obs-f">
      <span>${esc(x.obs)}</span>${barra(x.veces, max)}<span class="r">${nf(x.veces)}</span></div>`).join('')}</div>`;
  };
  if (!o.sanitarias.length && !o.operativas.length) {
    return '<p class="muted" style="margin:4px 0">Ninguna observación marcada en el período.</p>';
  }
  return lista(o.sanitarias, 'Sanitarias') + lista(o.operativas, 'Operativas')
    + `<p class="mc-note">Sobre ${nf(o.registros)} día(s) con parte. Una observación marcada en varias rondas del mismo día cuenta UNA vez.</p>`;
}

function movsHTML(m) {
  if (!m.length) return '<p class="muted" style="margin:4px 0">Sin movimientos en el período.</p>';
  const flecha = { entra: '⭢', sale: '⭠', interno: '⟳' };
  const f = (x) => `<tr>
      <td>${esc(dm(x.fecha))}</td>
      <td>${esc(flecha[x.sentido] || '')} ${esc(x.sentido)}</td>
      <td>${esc(x.tipo)}</td>
      <td>${esc(x.origen.sala)} · ${nf(x.origen.tanque)} → ${esc(x.destino.sala)} · ${nf(x.destino.tanque)}</td>
      <td class="r">${nf(x.total)}</td>
      <td>${esc(x.motivo)}</td></tr>`;
  return `<div class="mc-tablewrap"><table class="mc-table mc-table-sm">
    <thead><tr><th>Fecha</th><th>Sentido</th><th>Tipo</th><th>Origen → destino</th><th class="r">Animales</th><th>Motivo</th></tr></thead>
    <tbody>${m.map(f).join('')}</tbody></table></div>`;
}

function fichaTanqueHTML(f) {
  const comp = (c) => `<tr class="${c.enFiltro ? '' : 'mop-fuera'}">
      <td><b>${esc(c.lote)}</b>${c.enFiltro ? '' : ' <span class="mop-nota" title="El filtro deja este lote fuera, pero sigue en el tanque">fuera del filtro</span>'}</td>
      <td>${esc(c.codigoGenetico) || '<span class="muted">—</span>'}</td>
      <td class="r">${nf(c.hembras)}</td><td class="r">${nf(c.machos)}</td><td class="r"><b>${nf(c.total)}</b></td></tr>`;
  return `<div class="mc-card mc-card-wide mop-ficha">
    <h4 class="mc-card-h">🛢 ${esc(f.sala)} · Tanque ${nf(f.tanque)}
      <span class="mc-h-note">${nf(f.vivos.total)} vivos · ♀:♂ ${nf(f.hm, 2)} · densidad ${nf(f.densidad, 2)} /m²
      · carga ${nf(f.cargaMetrica, 2)} g/m²${f.area === '' ? '' : ' · área ' + nf(f.area, 2) + ' m²'}</span></h4>

    <h5 class="mop-h5">Composición${f.compartido ? ' <span class="mop-nota">tanque compartido</span>' : ''}</h5>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Lote</th><th>Código genético</th><th class="r">♀</th><th class="r">♂</th><th class="r">Total</th></tr></thead>
      <tbody>${f.composicion.map(comp).join('')}</tbody></table></div>

    <h5 class="mop-h5">Vivos en el período</h5>
    <div class="mc-chart" style="height:200px"><canvas id="mopTanqueCurva"></canvas></div>

    <h5 class="mop-h5">Partes de la foto (${esc(dma(f.hoy.fecha || ''))})</h5>
    ${partesHoyHTML(f.hoy, f.ultimoParte)}

    <h5 class="mop-h5">Observaciones del período</h5>
    ${obsFrecHTML(f.observaciones)}

    <h5 class="mop-h5">Movimientos del período</h5>
    ${movsHTML(f.movimientos)}
    <p class="mc-note">Los VIVOS salen del libro —que sabe de ingresos, movimientos y cierres—; los partes son lo que
      se REGISTRÓ en cada ronda. Sumar partes para deducir vivos daría otra cifra, y la equivocada.</p>
  </div>`;
}

function dibujarTanque(f) {
  if (!f || !f.curva.length) return;
  makeChart('mopTanqueCurva', {
    type: 'line',
    data: {
      labels: f.curva.map((d) => dm(d.fecha)),
      datasets: [
        { label: '♀ Hembras', data: f.curva.map((d) => d.hembras), borderColor: '#d81b60', backgroundColor: '#d81b60', tension: 0.25, borderWidth: 2, pointRadius: 0 },
        { label: '♂ Machos', data: f.curva.map((d) => d.machos), borderColor: '#1e88e5', backgroundColor: '#1e88e5', tension: 0.25, borderWidth: 2, pointRadius: 0 },
        { label: 'Total', data: f.curva.map((d) => d.total), borderColor: '#00838f', backgroundColor: '#00838f', tension: 0.25, borderWidth: 2, borderDash: [4, 3], pointRadius: 0 },
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

/* ── 🥚 REPRODUCCIÓN ───────────────────────────────────────── */

function reproduccionHTML(M, p, F) {
  const T = totalesDeReproduccion(M, p, F);
  const pend = pendientesDeN5(M.fuentes, p, F, M.fecha);
  const filas = tablaDeReproduccion(M, p, F);
  const dest = destinosDeDespacho(M.fuentes, p, F);
  return totalesReproHTML(T, p) + pendientesHTML(pend) + tablaReproHTML(filas, F) + destinosHTML(dest);
}

function totalesReproHTML(T, p) {
  return `<div class="mc-card"><h4 class="mc-card-h">🥚 Reproducción <span class="mc-h-note">${esc(p.etiqueta)}</span></h4>
    <div class="mc-kpis">
      ${tile('Desoves', nf(T.desoves), nf(T.huevos) + ' huevos', '')}
      ${tile('N2', nf(T.n2), 'fertilidad ' + pc(T.fertilidad), '')}
      ${tile('N5', nf(T.n5), T.naupliosPorHembra === '' ? 'sin desoves con N5' : nf(T.naupliosPorHembra) + ' por hembra', '')}
      ${tile('No viables', nf(T.noViables), 'hembras', '')}
      ${tile('Pendientes de N5', nf(T.pendientes), pc(T.pctPendiente) + ' de los desoves', T.pendientes ? 'is-mort' : 'is-ok')}
    </div>
    <p class="mc-note">La FERTILIDAD es N2 ÷ huevos de los desoves que YA tienen su N2, y los NAUPLIOS POR HEMBRA son
      N5 ÷ los desoves que ya tienen su N5: uno pendiente no diluye la cifra. ⚠ N5 no se compara con N2 — se cuentan
      días distintos y de poblaciones que no son la misma.</p>
    ${ignoraHTML(T.ignora, 'La reproducción')}
  </div>`;
}

function pendientesHTML(pend) {
  if (!pend.total) {
    return `<div class="mc-card"><h4 class="mc-card-h">⏳ Pendientes de N5</h4>
      <p class="muted" style="margin:4px 0">Ninguno: todos los desoves del período tienen ya su cifra de N5.</p></div>`;
  }
  const f = (x) => `<tr class="${x.diasEsperando > 0 ? 'mop-pend-tarde' : ''}">
      <td>${esc(dma(x.fecha))}</td><td><b>${esc(x.lote)}</b></td><td>${esc(x.codigoGenetico)}</td>
      <td class="r">${nf(x.desoves)}</td><td class="r">${nf(x.huevos)}</td><td class="r">${x.n2 ? nf(x.n2) : '<span class="muted">—</span>'}</td>
      <td class="r">${esc(dm(x.fechaN5Esperada))}</td>
      <td class="r">${x.diasEsperando > 0 ? '<b>' + nf(x.diasEsperando) + ' d</b>' : '<span class="muted">al día</span>'}</td></tr>`;
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">⏳ Pendientes de N5 <span class="mc-h-note">${nf(pend.total)} desove(s) registrado(s) sin su cifra de N5</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Fecha</th><th>Lote</th><th>Código</th><th class="r">Desoves</th><th class="r">Huevos</th><th class="r">N2</th>
        <th class="r">N5 tocaba</th><th class="r">Esperando</th></tr></thead>
      <tbody>${pend.filas.map(f).join('')}</tbody></table></div>
    <p class="mc-note">Pendiente = SIN CIFRA de N5. Una fecha de N5 sola no completa —diría que se contó algo que no se
      contó— y un N5 de CERO sí completa: cero es una medición. La espera se cuenta desde el día en que TOCABA
      contarlo (el siguiente al desove), no desde el desove.</p>
    ${ignoraHTML(pend.ignora, 'Lo pendiente')}
  </div>`;
}

function tablaReproHTML(filas, F) {
  if (!filas.length) {
    return `<div class="mc-card"><h4 class="mc-card-h">Por lote</h4>
      <p class="muted" style="margin:4px 0">${hayFiltro(F) ? 'Ningún lote con desoves pasa el filtro.' : 'Ningún desove registrado en el período.'}</p></div>`;
  }
  const f = (x) => `<tr>
      <td><b>${esc(x.lote)}</b></td>
      <td class="r">${nf(x.desoves)}${x.pendientes ? ' <span class="mop-dif" title="' + nf(x.desovesPendientes) + ' desove(s) sin su N5">⏳</span>' : ''}</td>
      <td class="r">${nf(x.huevos)}</td>
      <td class="r">${nf(x.huevosPorDesove)}</td>
      <td class="r">${nf(x.noViables)}</td>
      <td class="r">${nf(x.n2)}</td>
      <td class="r">${pc(x.fertilidad)}</td>
      <td class="r">${nf(x.n5)}</td>
      <td class="r">${x.naupliosPorHembra === '' ? '<span class="muted" title="Ningún desove de este lote tiene su N5 todavía">—</span>' : nf(x.naupliosPorHembra)}</td>
      <td>${x.destinos.length ? x.destinos.map((d) => esc(d)).join(' · ') : '<span class="muted">—</span>'}</td></tr>`;
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">Por lote <span class="mc-h-note">en el período</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Lote</th><th class="r">Desoves</th><th class="r">Huevos</th><th class="r">Huevos/desove</th>
        <th class="r">No viables</th><th class="r">N2</th><th class="r">Fertilidad</th><th class="r">N5</th>
        <th class="r">Nauplios/hembra</th><th>Destinos</th></tr></thead>
      <tbody>${filas.map(f).join('')}</tbody></table></div>
  </div>`;
}

function destinosHTML(d) {
  if (!d.filas.length) {
    return `<div class="mc-card"><h4 class="mc-card-h">A dónde fueron</h4>
      <p class="muted" style="margin:4px 0">Ningún desove del período tiene destino anotado${d.sinDestino ? ' (' + nf(d.sinDestino) + ' sin destino)' : ''}.</p></div>`;
  }
  const max = d.filas[0].n5;
  const f = (x) => `<div class="mop-obs-f"><span>${esc(x.destino)}</span>${barra(x.n5, max)}
    <span class="r">${nf(x.n5)}</span></div>
    <div class="mc-note" style="margin:0 0 6px 0">${nf(x.desoves)} desove(s) · ${x.lotes.map((l) => esc(l)).join(' · ')}${x.variosDestinos ? ' · ' + nf(x.variosDestinos) + ' con varios destinos' : ''}</div>`;
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">A dónde fueron <span class="mc-h-note">${nf(d.conDestino)} desove(s) con destino${d.sinDestino ? ' · ' + nf(d.sinDestino) + ' sin anotar' : ''}</span></h4>
    ${d.filas.map(f).join('')}
    <p class="mc-note">⚠ Los nauplios NO se reparten entre los destinos de un desove: la hoja no dice cuántos fue a cada
      uno, así que el desove cuenta ENTERO en cada destino al que fue.${d.compartidos ? ' Aquí hay ' + nf(d.compartidos) + ' así, de modo que estas columnas NO suman el total.' : ''}</p>
    ${ignoraHTML(d.ignora, 'El despacho')}
  </div>`;
}

/* ── 🔄 MANEJO (F5) ────────────────────────────────────────── */

/* Lo que cada hoja no puede filtrar, con SU motivo: el de Tanques no vale aquí. */
const PORQUE_MOV = 'La hoja de Movimientos no registra el lote: de qué lote era cada animal lo deduce el libro, repartiendo en proporción a los vivos del origen.';
const PORQUE_ALIM = 'La hoja de Alimentación dice sus lotes, no sus códigos genéticos.';
const PORQUE_TRAT = 'La hoja de Tratamientos se registra por sala y área, con sus lotes: no dice el tanque ni el código genético.';

function manejoHTML(M, p, F) {
  const mat = matrizDeMovimientos(M.fuentes, p, F, M.libro);
  const reg = registroDeMovimientos(M.fuentes, p, F);
  const al = alimentacionPorProducto(M.fuentes, p, F);
  const peso = procedenciaDelPeso(M.fuentes, p, F);
  const cal = calendarioDeTratamientos(M.fuentes, p, F);
  const areas = productosPorArea(M.fuentes, p, F);
  const cob = coberturaPreventiva(M.fuentes, M.libro, p, F, M.fecha);
  return movimientosHTML(mat, reg, p, F) + alimentacionHTML(al, peso, p, F) + tratamientosHTML(cal, areas, cob, p, F);
}

/** Un reparto (motivo, tipo o agua) en barras; lo que está fuera del catálogo se MARCA, no se disimula. */
function repartoHTML(arr, rotulo) {
  if (!arr.length) return '';
  const max = arr[0].movimientos;
  return `<div class="mop-obs-g"><b>${esc(rotulo)}</b>${arr.map((x) => `<div class="mop-obs-f">
    <span>${esc(x.clave)}${x.enCatalogo ? '' : ' <span class="mop-nota" title="No está en el catálogo de la ficha">fuera del catálogo</span>'}</span>${barra(x.movimientos, max)}
    <span class="r" title="${esc(nf(x.animales) + ' animal(es)')}">${nf(x.movimientos)}</span></div>`).join('')}</div>`;
}

function registroHTML(reg) {
  const f = (x) => `<tr>
      <td>${esc(dma(x.fecha))}</td><td>${esc(x.tipo || '—')}</td>
      <td>${esc(x.origen.sala)} · ${nf(x.origen.tanque)} → ${esc(x.destino.sala)} · ${nf(x.destino.tanque)}${x.circular ? ' <span class="mop-dif" title="Origen y destino son el MISMO tanque">mismo tanque</span>' : ''}</td>
      <td class="r">${nf(x.machos)}</td><td class="r">${nf(x.hembras)}</td><td class="r"><b>${nf(x.total)}</b></td>
      <td>${esc(x.motivo || '—')}</td><td>${esc(x.agua || '—')}</td>
      <td>${x.observaciones ? esc(x.observaciones) : '<span class="muted">—</span>'}</td></tr>`;
  return `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-registro">
    <thead><tr><th>Fecha</th><th>Tipo</th><th>Origen → destino</th><th class="r">♂</th><th class="r">♀</th><th class="r">Total</th>
      <th>Motivo</th><th>Agua</th><th>Observaciones</th></tr></thead>
    <tbody>${reg.map(f).join('')}</tbody></table></div>`;
}

function movimientosHTML(m, reg, p, F) {
  const cab = `<h4 class="mc-card-h">🔄 Movimientos <span class="mc-h-note">${m.total ? nf(m.total) + ' movimiento(s) · ' + nf(m.animales) + ' animales · ' : ''}${esc(etiquetaPeriodo(p))}</span></h4>`;
  if (!m.total) {
    return `<div class="mc-card mc-card-wide">${cab}
      <p class="muted" style="margin:4px 0">${hayFiltro(F) ? 'Ningún movimiento del período pasa el filtro.' : 'Ningún movimiento registrado en el período.'}</p>
      ${ignoraHTML(m.ignora, 'Un movimiento', PORQUE_MOV)}</div>`;
  }
  /* Cada celda, los ANIMALES y, entre paréntesis, en cuántos movimientos (decisión del usuario): las dos cifras,
     sin un conmutador más. La diagonal es un movimiento DENTRO de la sala, entre sus tanques. */
  const celda = (o, d) => {
    const c = m.celdas.find((x) => x.origen === o && x.destino === d);
    if (!c) return '<td class="r muted">—</td>';
    const misma = o === d;
    return `<td class="r${misma ? ' mop-misma' : ''}" title="${esc(o + ' → ' + d + ': ' + nf(c.animales) + ' animal(es) en ' + nf(c.movimientos) + ' movimiento(s)' + (misma ? ', entre tanques de la misma sala' : ''))}">`
      + `${misma ? '⟳ ' : ''}<b>${nf(c.animales)}</b> <span class="mop-nota">(${nf(c.movimientos)})</span></td>`;
  };
  return `<div class="mc-card mc-card-wide">${cab}
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-matriz">
      <thead><tr><th>origen ↓ · destino →</th>${m.salas.map((s) => `<th class="r">${esc(s)}</th>`).join('')}</tr></thead>
      <tbody>${m.salas.map((o) => `<tr><th>${esc(o)}</th>${m.salas.map((d) => celda(o, d)).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="mc-note">Cada celda: los <b>animales</b> movidos y, entre paréntesis, en cuántos movimientos. ⟳ = entre tanques de la MISMA sala.</p>
    <div class="mop-repartos">${repartoHTML(m.porMotivo, 'Por motivo')}${repartoHTML(m.porTipo, 'Por tipo')}${repartoHTML(m.porAgua, 'Agua de destino')}</div>
    ${m.aTanqueCompartido ? `<p class="mc-note">⚠ <b>${nf(m.aTanqueCompartido)}</b> movimiento(s) llegaron a un tanque que HOY es compartido. «Hoy»: el libro sabe cómo está la planta al cierre de la foto, no cómo estaba el día del movimiento.</p>` : ''}
    ${ignoraHTML(m.ignora, 'Un movimiento', PORQUE_MOV)}
    <h5 class="mop-h5">Registro <span class="mop-nota">${nf(reg.length)} · el más reciente primero</span></h5>
    ${registroHTML(reg)}
  </div>`;
}

function alimentacionHTML(a, peso, p, F) {
  const cab = `<h4 class="mc-card-h">🦐 Alimentación · ración PLANIFICADA <span class="mc-h-note">${a.filas ? nf(a.filas) + ' registro(s) · ' + nf(a.dias) + ' día(s) · ' : ''}${esc(etiquetaPeriodo(p))}</span></h4>`;
  if (!a.filas) {
    return `<div class="mc-card mc-card-wide">${cab}
      <p class="muted" style="margin:4px 0">${hayFiltro(F) ? 'Ninguna ración del período pasa el filtro.' : 'Ninguna ración registrada en el período.'}</p>
      ${ignoraHTML(a.ignora, 'La alimentación', PORQUE_ALIM)}</div>`;
  }
  const rango = nf(a.rango.min, 2) + '–' + nf(a.rango.max, 2) + ' %';
  const kpis = [
    tile('Ración', nf(a.totalDia, 2) + ' kg/día', 'la PLANIFICADA: nadie registra lo servido', ''),
    tile('De la biomasa', pc(a.pctTotal), 'sobre ' + nf(a.biomasaDia, 2) + ' kg de biomasa al día', ''),
    tile('Tomas fuera de rango', nf(a.tomasFuera), a.tomas ? 'de ' + nf(a.tomas) + ' · rango ' + esc(rango) + ' por toma' : 'ninguna toma en las filas del período', a.tomasFuera ? 'is-mort' : ''),
    tile('A 30 días', nf(a.proyeccionMensual) + ' kg', 'al ritmo del período: aritmética, no un pronóstico', ''),
  ].join('');
  const fila = (x) => `<tr class="${x.tomasFuera ? 'mop-fuera-rango' : ''}">
      <td><b>${esc(x.producto)}</b></td>
      <td class="r">${nf(x.kg, 2)}</td><td class="r">${nf(x.kgDia, 2)}</td><td class="r">${pc(x.pct)}</td>
      <td class="r">${x.agendaTomas ? nf(x.agendaTomas) + ' · ' + pc(x.agendaPct) : '<span class="muted">—</span>'}</td>
      <td class="r">${x.desvio === '' ? '<span class="muted">—</span>' : (x.desvio > 0 ? '+' : '') + nf(x.desvio, 2)}</td>
      <td class="r">${x.tomas ? (x.tomasFuera ? '<b>' + nf(x.tomasFuera) + '</b> ⚠' : '0') + ' de ' + nf(x.tomas) : '<span class="muted" title="Ninguna toma de este producto en las filas del período">—</span>'}</td></tr>`;
  /* La toma fuera de rango se DICE con su día, su sala, su hora y su %: un recuento solo no deja ir a corregirla. */
  const fuera = a.productos.flatMap((x) => x.fuera.map((t) => ({ ...t, producto: x.producto })))
    .sort((x, y) => porNombre(y.fecha, x.fecha) || porNombre(x.sala, y.sala) || porNombre(x.hora, y.hora));
  const VER = 5;
  const detalle = fuera.length ? `<p class="mc-note mop-tomas-fuera">⚠ Tomas planificadas fuera de ${esc(rango)}: ${fuera.slice(0, VER).map((t) =>
    `<b>${esc(t.producto)}</b> al ${nf(t.pct, 2)} % a las ${esc(t.hora)} del ${esc(dma(t.fecha))} en ${esc(t.sala)}`).join(' · ')}${fuera.length > VER ? ' · y ' + nf(fuera.length - VER) + ' más' : ''}.</p>` : '';
  const pesoH = peso.length ? `<div class="mop-obs-g"><b>De dónde sale el peso de la ración</b>${peso.map((x) => `<div class="mop-obs-f">
    <span>${esc(x.fuente)}</span>${barra(x.n, peso[0].n)}<span class="r">${pc(x.pct)}</span></div>`).join('')}</div>` : '';
  return `<div class="mc-card mc-card-wide">${cab}
    <div class="mc-kpis">${kpis}</div>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-alim">
      <thead><tr><th>Producto</th><th class="r">kg en el período</th><th class="r">kg/día</th><th class="r">% biomasa</th>
        <th class="r">Agenda (tomas · %)</th><th class="r" title="El % del período MENOS el de la agenda estándar">Δ agenda</th>
        <th class="r" title="Cada toma planificada, juzgada con el rango de la ficha">Tomas fuera de ${esc(rango)}</th></tr></thead>
      <tbody>${a.productos.map(fila).join('')}</tbody></table></div>
    ${detalle}
    <p class="mc-note">La agenda estándar tiene ${nf(a.agendaTomas)} tomas${a.agendaSinProducto ? ', ' + nf(a.agendaSinProducto) + ' de ellas SIN producto (se cuenta aparte, no se descarta)' : ''}.
      El Δ INFORMA —el % del período menos el de la agenda—; lo que se JUZGA es cada toma, con el rango de la ficha de Alimentación.</p>
    ${pesoH}
    ${ignoraHTML(a.ignora, 'La alimentación', PORQUE_ALIM)}
  </div>`;
}

function tratamientosHTML(c, areas, cob, p, F) {
  const cab = `<h4 class="mc-card-h">🧪 Tratamientos <span class="mc-h-note">${c.total ? nf(c.total) + ' tratamiento(s) · ' : ''}${esc(etiquetaPeriodo(p))}</span></h4>`;
  /* Una celda VACÍA es «no se trató» (`null`), nunca un cero: el mismo cuidado que el calor de 💀 Bajas. */
  const calendario = c.total ? `<div class="mop-calor-wrap"><table class="mop-calor mop-trat">
      <thead><tr><th></th>${c.dias.map((d) => `<th>${esc(dm(d))}</th>`).join('')}</tr></thead>
      <tbody>${c.filas.map((s) => `<tr><th>${esc(s.sala)}</th>${s.celdas.map((v, i) => `<td class="${v ? 'is-trat' : ''}" title="${esc(s.sala + ' · ' + dma(c.dias[i]) + ' · '
        + (v ? nf(v.tratamientos) + ' tratamiento(s) · ' + (v.tipos.join(', ') || 'sin tipo') + ' · ' + nf(v.productos) + ' producto(s)' : 'no se trató'))}">${v ? nf(v.tratamientos) : ''}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <p class="mc-note">Una celda VACÍA es «no se trató»; el número, cuántos tratamientos se registraron ese día en esa sala (el tipo y los productos, al pasar por encima).</p>`
    : `<p class="muted" style="margin:4px 0">${hayFiltro(F) ? 'Ningún tratamiento del período pasa el filtro.' : 'Ningún tratamiento registrado en el período.'}</p>`;
  const areasH = areas.length ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Área</th><th class="r">Aplicaciones</th><th>Productos (veces)</th></tr></thead>
      <tbody>${areas.map((x) => `<tr><td><b>${esc(x.area)}</b>${x.enCatalogo ? '' : ' <span class="mop-nota" title="No está en el catálogo de la ficha">fuera del catálogo</span>'}</td>
        <td class="r">${nf(x.aplicaciones)}</td>
        <td>${x.productos.length ? x.productos.map((q) => esc(q.producto) + (q.veces > 1 ? ' ×' + nf(q.veces) : '')).join(' · ') : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted" style="margin:4px 0">Ninguna aplicación en el período.</p>';
  const cobH = cob.length ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-cob">
      <thead><tr><th>Lote</th><th>Último preventivo</th><th class="r">Hace</th><th>Productos</th></tr></thead>
      <tbody>${cob.map((x) => `<tr class="${x.cubierto ? '' : 'mop-cob-no'}">
        <td><b>${esc(x.lote)}</b></td>
        <td>${x.cubierto ? esc(dma(x.fecha)) : '<b>ninguno</b> en el período'}</td>
        <td class="r">${x.dias === '' ? '<span class="muted">—</span>' : nf(x.dias) + ' d'}</td>
        <td>${x.productos.length ? x.productos.map((q) => esc(q)).join(', ') : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>
    <p class="mc-note">Un lote sin ningún preventivo en el período sale «ninguno» y SIN días: cero diría «hoy mismo», que es lo contrario. Los lotes sin animales vivos no necesitan cobertura y no salen.</p>`
    : '<p class="muted" style="margin:4px 0">Ningún lote vivo que pase el filtro.</p>';
  return `<div class="mc-card mc-card-wide">${cab}
    <h5 class="mop-h5">Calendario sala × día</h5>${calendario}
    <h5 class="mop-h5">Productos por área</h5>${areasH}
    <h5 class="mop-h5">Cobertura preventiva por lote</h5>${cobH}
    ${ignoraHTML(c.ignora, 'Un tratamiento', PORQUE_TRAT)}
  </div>`;
}

/* ============================================================
   🩺 CALIDAD DEL DATO (F6, 2026-09-21)
   Diseño aprobado por el usuario: UNA sub-vista con, en este orden, las hojas y su calendario, los partes esperados
   frente a los registrados («uno por tanque ocupado»), el estado registrado de las salas frente al propuesto, los
   avisos del libro y el cruce con 🧬 Microchips («sólo lo que no puede ser»). Las cifras salen de
   operativo.calidad.js y operativo.cruce.js, que son puros y tienen su banco: aquí sólo se pintan.
   ============================================================ */
const PORQUE_HOJAS = 'Son de la planta entera: una fila de Desoves no es de una sala, ni una de Broodstock de un lote.';
const PORQUE_PARTES = 'Un parte de Tanques dice su sala y su tanque, no de qué lote ni de qué sexo es cada animal.';
const PORQUE_ESTADO = 'El estado es de la sala entera, no de uno de sus tanques.';
const PORQUE_AVISOS = 'Un aviso del libro dice su tanque o su lote, nada más.';
const PORQUE_CRUCE = 'La MATRIZ sólo lleva hembras y no dice el estado de la sala ni el origen del lote.';
const CRUCE_TIPO = {
  'mas-chips': 'Más hembras con chip vivas que hembras de su lote en el libro',
  'lote-ausente': 'Hembras con chip vivas donde el libro no tiene su lote',
};
const listaCorta = (arr, max, fmt) => arr.slice(0, max).map(fmt).join(' · ') + (arr.length > max ? ` · <span class="mop-nota">y ${nf(arr.length - max)} más</span>` : '');

function calidadHTML(M, memo, p, F) {
  const hojas = estadoDeHojas(M);
  const cal = calendarioDeRegistros(M, p, F);
  const cob = coberturaDePartes(M, serieDe(memo, p), memo.partes, p, F);
  const est = comparacionDeEstados(M, F);
  const av = avisosDelLibro(M, p, F);
  return hojasHTML(hojas, cal, p) + partesHTML(cob, p) + estadosHTML(est) + avisosLibroHTML(av, p) + cruceHTML(cruceDe(memo, p, F), p, F);
}

function hojasHTML(e, cal, p) {
  const cero = '<span class="muted">0</span>';
  const fila = (h) => `<tr class="${h.atrasada ? 'mop-atrasada' : ''}">
      <td><b>${esc(h.etiqueta)}</b>${h.diaria ? ' <span class="mop-nota">diaria</span>' : ''}</td>
      <td class="r">${nf(h.filas)}</td>
      <td class="r">${h.ultima ? esc(dma(h.ultima)) : '<span class="muted">—</span>'}</td>
      <td class="r">${h.ultima ? nf(h.dias) + ' d' : '—'}${h.atrasada ? ' <span class="mop-dif" title="Una hoja diaria sin registro desde hace más de un día">⚠ atrasada</span>' : ''}</td>
      <td class="r">${h.sinFecha ? `<span class="mop-dif" title="Filas sin una fecha legible: ninguna pieza del tablero las cuenta">${nf(h.sinFecha)}</span>` : cero}</td>
      <td class="r">${h.futuras ? `<span class="mop-dif" title="Con fecha posterior a hoy: suele ser un año mal tecleado">${nf(h.futuras)}</span>` : cero}</td></tr>`;
  const curso = new Set(cal.enCurso);
  const celda = (h, v, i) => {
    const d = cal.dias[i];
    const hueco = h.diasHueco.includes(d);
    const clase = v !== null ? 'is-reg' : hueco ? 'is-hueco' : curso.has(d) && h.diaria ? 'is-curso' : '';
    const t = h.etiqueta + ' · ' + dma(d) + ' · ' + (v !== null ? nf(v) + ' fila(s)' : hueco ? 'HUECO: ningún registro' : curso.has(d) && h.diaria ? 'en curso' : 'ningún registro');
    return `<td class="${clase}" title="${esc(t)}">${v !== null ? nf(v) : ''}</td>`;
  };
  const calendario = `<div class="mop-calor-wrap"><table class="mop-calor mop-cal-hojas">
      <thead><tr><th></th>${cal.dias.map((d) => `<th class="${curso.has(d) ? 'is-curso' : ''}">${esc(dm(d))}</th>`).join('')}</tr></thead>
      <tbody>${cal.hojas.map((h) => `<tr><th>${esc(h.etiqueta)}${h.diaria && h.huecos ? ` <span class="mop-dif" title="Días sin ningún registro desde que la hoja empezó">${nf(h.huecos)} hueco(s)</span>` : ''}</th>${h.celdas.map((v, i) => celda(h, v, i)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">📋 Las hojas y su calendario <span class="mc-h-note">el último registro, hasta hoy · el calendario, ${esc(etiquetaPeriodo(p))}</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-hojas">
      <thead><tr><th>Hoja</th><th class="r">Filas</th><th class="r">Último registro</th><th class="r">Hace</th>
        <th class="r" title="Filas sin una fecha legible">Sin fecha</th><th class="r" title="Filas con fecha posterior a hoy">Futuras</th></tr></thead>
      <tbody>${e.hojas.map(fila).join('')}</tbody></table></div>
    ${e.salasExcluidas ? `<p class="mc-note">${nf(e.salasExcluidas)} registro(s) de Sala de las Salas 4A y 4B no se muestran (decisión del usuario).</p>` : ''}
    <h5 class="mop-h5">Calendario hoja × día</h5>${calendario}
    <p class="mc-note">Una celda VACÍA es «ningún registro ese día». En las hojas DIARIAS (Salas y Tanques) se marca como HUECO desde el
      día en que la hoja empezó; el de hoy no, porque su registro puede no haber llegado. Las demás hojas registran sucesos: un día
      sin ellos no es un hueco.</p>
    ${ignoraHTML(cal.ignora, 'El estado de las hojas y su calendario', PORQUE_HOJAS)}
  </div>`;
}

function partesHTML(c, p) {
  const cab = `<h4 class="mc-card-h">📝 Partes esperados frente a registrados <span class="mc-h-note">${esc(etiquetaPeriodo(p))} · uno por tanque ocupado al cierre de cada día</span></h4>`;
  if (!c.salas.length) {
    return `<div class="mc-card mc-card-wide">${cab}
      <p class="muted" style="margin:4px 0">El libro no tuvo ningún tanque ocupado en el período: no se esperaba ningún parte.</p>
      ${ignoraHTML(c.ignora, 'Un parte de tanque', PORQUE_PARTES)}</div>`;
  }
  const cifra = (o) => (o.esperados ? `<b>${nf(o.registrados)}</b> de ${nf(o.esperados)} <span class="mop-nota">(${pc(o.pct)})</span>` : '<span class="muted">—</span>');
  const curso = new Set(c.enCurso);
  const celda = (s, x, i) => {
    if (!x) return `<td title="${esc(s.sala + ' · ' + dma(c.dias[i]) + ' · sin animales: no se esperaba nada')}"></td>`;
    const clase = x.enCurso ? 'is-curso'
      : x.esperados && x.registrados === 0 ? 'is-nada'
        : x.registrados < x.esperados || x.registroSala === false ? 'is-parcial' : 'is-completo';
    const t = s.sala + ' · ' + dma(c.dias[i]) + (x.enCurso ? ' · EN CURSO: no se cuenta' : '')
      + ' · ' + nf(x.registrados) + ' de ' + nf(x.esperados) + ' tanque(s) con parte'
      + (x.faltan.length ? ' · falta(n) el ' + x.faltan.join(', ') : '')
      + ' · registro de Sala: ' + (x.registroSala === null ? '—' : x.registroSala ? 'sí' : 'NO');
    return `<td class="${clase}${x.registroSala === false ? ' is-sin-sala' : ''}" title="${esc(t)}">${x.esperados ? nf(x.registrados) + '/' + nf(x.esperados) : ''}</td>`;
  };
  const faltan = c.faltan.length
    ? `<p class="mc-note"><b>Partes de Tanques que faltan</b> (el más reciente primero): ${listaCorta(c.faltan, 12, (x) => esc(dma(x.fecha) + ' · ' + x.sala + ' · t' + x.tanque))}</p>` : '';
  const faltanReg = c.faltanRegistro.length
    ? `<p class="mc-note"><b>Registros de Sala que faltan</b>: ${listaCorta(c.faltanRegistro, 12, (x) => esc(dma(x.fecha) + ' · ' + x.sala))}</p>` : '';
  return `<div class="mc-card mc-card-wide">${cab}
    <div class="mop-sc-fila"><span class="mop-sc-l">Tanques</span><span>${cifra(c.total.tanques)} partes esperados tienen su parte</span></div>
    <div class="mop-sc-fila"><span class="mop-sc-l">Salas</span><span>${cifra(c.total.registro)} días de sala con animales tienen su registro</span></div>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-cob-salas">
      <thead><tr><th>Sala</th><th class="r">Partes de Tanques</th><th class="r">Registros de Sala</th></tr></thead>
      <tbody>${c.salas.map((s) => `<tr><td><b>${esc(s.sala)}</b></td><td class="r">${cifra(s.tanques)}</td><td class="r">${cifra(s.registro)}</td></tr>`).join('')}</tbody></table></div>
    <h5 class="mop-h5">Sala × día</h5>
    <div class="mop-calor-wrap"><table class="mop-calor mop-cob-cal">
      <thead><tr><th></th>${c.dias.map((d) => `<th class="${curso.has(d) ? 'is-curso' : ''}">${esc(dm(d))}</th>`).join('')}</tr></thead>
      <tbody>${c.salas.map((s) => `<tr><th>${esc(s.sala)}</th>${s.celdas.map((x, i) => celda(s, x, i)).join('')}</tr>`).join('')}</tbody>
    </table></div>
    ${faltan}${faltanReg}
    <p class="mc-note">Cada celda dice cuántos tanques ocupados tuvieron su parte ese día, de cuántos lo esperaban (decisión del usuario:
      uno por tanque ocupado al cierre del día); con el borde marcado, a la sala le faltó su registro de Sala. Una celda VACÍA es
      que la sala no tenía animales. El día de HOY se enseña y no se cuenta: su parte puede no haber llegado.</p>
    ${ignoraHTML(c.ignora, 'Un parte de tanque', PORQUE_PARTES)}
  </div>`;
}

function estadosHTML(e) {
  const chip = (x) => (x ? `<span class="mop-chip is-e-${claseEstado(x)}">${esc(x)}</span>` : '<span class="muted">—</span>');
  const tono = { coinciden: 'mop-igual', difieren: 'mop-dif' };
  const fila = (f) => `<tr class="${f.situacion === 'difieren' ? 'mop-difieren' : ''}">
      <td><b>${esc(f.sala)}</b></td><td>${chip(f.registrado.estado)}</td>
      <td class="r">${f.registrado.fecha ? esc(dma(f.registrado.fecha)) + (vacio(f.desfaseDias) ? '' : ` <span class="mop-nota">hace ${nf(f.desfaseDias)} d</span>`) : '<span class="muted">—</span>'}</td>
      <td>${chip(f.propuesto.estado)}</td>
      <td><span class="${tono[f.situacion] || 'muted'}">${esc(f.etiqueta)}</span></td></tr>`;
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">🏠 Estado registrado frente al propuesto <span class="mc-h-note">al cierre de la foto · ${nf(e.coinciden)} coinciden · ${nf(e.difieren)} difieren · ${nf(e.sinComparar)} sin comparar</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-estados">
      <thead><tr><th>Sala</th><th>Registrado</th><th class="r">Tecleado el</th><th>Propuesto por el libro</th><th>Situación</th></tr></thead>
      <tbody>${e.filas.map(fila).join('')}</tbody></table></div>
    <p class="mc-note">El PROPUESTO es el de «🔄 Proponer estado» de la ficha de Salas: el libro al cierre de la foto. Un estado tecleado hace
      días puede coincidir por casualidad: mira cuándo se tecleó.</p>
    ${ignoraHTML(e.ignora, 'El estado de una sala', PORQUE_ESTADO)}
  </div>`;
}

function avisosLibroHTML(a, p) {
  const cab = `<h4 class="mc-card-h">📒 Avisos del libro <span class="mc-h-note">${a.aplica ? nf(a.total) + ' en total · ' + nf(a.enPeriodo) + ' en ' + esc(etiquetaPeriodo(p)) : 'no aplican con este filtro'}</span></h4>`;
  if (!a.aplica) {
    return `<div class="mc-card mc-card-wide">${cab}
      <p class="muted" style="margin:4px 0">Los avisos del libro no dicen el código genético: con ese filtro no se le pueden atribuir.</p>
      ${ignoraHTML(a.ignora.filter((x) => x !== 'código genético'), 'Un aviso del libro', PORQUE_AVISOS)}</div>`;
  }
  const tipos = `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-av-tipos">
      <thead><tr><th>Aviso</th><th class="r">En el período</th><th class="r">En total</th></tr></thead>
      <tbody>${a.tipos.map((t) => `<tr class="${t.total ? '' : 'is-cero'}"><td>${esc(t.etiqueta)}${t.conocido ? '' : ' <span class="mop-nota" title="El libro lo anota y el tablero no tiene su rótulo">sin rótulo</span>'}</td>
        <td class="r">${t.enPeriodo ? `<b>${nf(t.enPeriodo)}</b>` : '<span class="muted">0</span>'}</td><td class="r">${t.total ? nf(t.total) : '<span class="muted">0</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  const detalle = a.detalle.length
    ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-av-detalle">
        <thead><tr><th>Fecha</th><th>Aviso</th><th>Dónde</th><th>Lote</th><th>Qué dice</th></tr></thead>
        <tbody>${a.detalle.map((d) => `<tr><td>${esc(dma(d.fecha))}</td><td>${esc(d.etiqueta)}</td><td>${esc(d.lugar) || '<span class="muted">—</span>'}</td>
          <td>${esc(d.lote) || '<span class="muted">—</span>'}</td><td>${esc(d.texto)}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="muted" style="margin:4px 0">Ningún aviso en ${esc(etiquetaPeriodo(p))}.</p>`;
  return `<div class="mc-card mc-card-wide">${cab}${tipos}
    <h5 class="mop-h5">Los del período, el más reciente primero</h5>${detalle}
    <p class="mc-note">Son los avisos que anota el libro al reconstruir el saldo —los mismos que cuentan las alertas de 📊 Estado actual—.
      Todos los tipos que sabe anotar van siempre, aunque estén a cero: «ninguno» también es un dato.</p>
    ${ignoraHTML(a.ignora, 'Un aviso del libro', PORQUE_AVISOS)}
  </div>`;
}

function cruceHTML(c, p, F) {
  const cab = `<h4 class="mc-card-h">🔗 El cruce con 🧬 Microchips <span class="mc-h-note">la MATRIZ de hoy frente al libro de hoy · sólo se marca lo que no puede ser</span></h4>`;
  const desfase = c.fotoDeHoy ? '' : `<p class="mc-note">⚠ La MATRIZ sólo sabe cómo están las hembras HOY: el cruce usa el libro de hoy
      (${esc(dma(c.hoy))}), no el de la foto (${esc(dma(c.fecha))}). Los eventos y los desoves sí son los de ${esc(etiquetaPeriodo(p))}.</p>`;
  if (!c.hembras) {
    return `<div class="mc-card mc-card-wide">${cab}
      <p class="muted" style="margin:4px 0">El registro reproductivo no tiene ninguna hembra con chip: no hay nada que cruzar.</p></div>`;
  }
  const disc = c.discrepancias.length
    ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-cruce-disc">
        <thead><tr><th>Sala</th><th class="r">Tanque</th><th>Lote</th><th class="r">♀ con chip</th><th class="r">♀ en el libro</th><th>Qué no puede ser</th></tr></thead>
        <tbody>${c.discrepancias.map((d) => `<tr><td>${esc(d.sala)}</td><td class="r"><b>${nf(d.tanque)}</b></td><td><b>${esc(d.lote)}</b></td>
          <td class="r">${nf(d.conChip)}</td><td class="r">${nf(d.enLibro)}</td><td><span class="mop-dif">${esc(CRUCE_TIPO[d.tipo] || d.tipo)}</span></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="mop-igual" style="margin:4px 0">✓ Nada que no pueda ser: cada hembra con chip viva está donde el libro tiene su lote, y no hay más de las que el libro cuenta.</p>';
  const ev = c.eventos;
  const eventos = ev.sinExplicar.length
    ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-cruce-ev">
        <thead><tr><th>Fecha</th><th>Evento</th><th>Trovan</th><th>Lote</th><th>Ocurrió en</th><th>La hembra estaba en</th><th>Traslados</th></tr></thead>
        <tbody>${ev.sinExplicar.map((e) => `<tr><td>${esc(dma(e.fecha))}</td><td>${esc(e.tipo)}</td><td><b>${esc(e.trovan)}</b></td><td>${esc(e.lote) || '—'}</td>
          <td>${esc(e.evento.sala + ' · ' + (e.evento.tanque === null ? '?' : e.evento.tanque))}</td>
          <td>${esc(e.hembra.sala + ' · ' + (e.hembra.tanque === null ? '?' : e.hembra.tanque))}</td>
          <td>${e.conTraslados ? 'tiene, y ninguno lo explica' : '<span class="mop-nota">ninguno registrado</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="mop-igual" style="margin:4px 0">✓ Los ${nf(ev.revisados)} evento(s) de ${esc(etiquetaPeriodo(p))} ocurrieron donde estaba su hembra.</p>`;
  const sinMatriz = ev.sinMatriz ? `<p class="mc-note">${nf(ev.sinMatriz)} evento(s) de chips que la MATRIZ no tiene: no se pueden situar.</p>` : '';
  const resumen = c.resumen.length
    ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-cruce-lotes">
        <thead><tr><th>Lote</th><th class="r">♀ en el libro</th><th class="r">♀ con chip</th><th>Tanques en el libro</th><th>Tanques en la MATRIZ</th><th class="r">En común</th></tr></thead>
        <tbody>${c.resumen.map((r) => `<tr><td><b>${esc(r.lote)}</b></td><td class="r">${nf(r.hembrasLibro)}</td><td class="r">${nf(r.vivasConChip)}</td>
          <td>${r.tanquesLibro.length ? r.tanquesLibro.map((t) => esc(t)).join(' · ') : '<span class="muted">ninguno</span>'}</td>
          <td>${r.tanquesChip.map((t) => esc(t)).join(' · ')}</td><td class="r">${nf(r.enComun)}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="muted" style="margin:4px 0">${hayFiltro(F) ? 'Ningún lote de los dos registros pasa el filtro.' : 'Ningún lote está a la vez en la MATRIZ y en el libro.'}</p>`;
  const fuera = c.fuera.length
    ? `<p class="mc-note">Lotes de la MATRIZ que el operativo no conoce (no se marcan): ${c.fuera.map((f) => '<b>' + esc(f.lote) + '</b> (' + nf(f.vivas) + ' viva(s) en ' + nf(f.tanques) + ' tanque(s))').join(' · ')}.</p>` : '';
  const sueltas = c.sinLote || c.sinUbicacion
    ? `<p class="mc-note">No se pueden cruzar: ${[c.sinLote ? nf(c.sinLote) + ' hembra(s) vivas sin lote en la MATRIZ' : '', c.sinUbicacion ? nf(c.sinUbicacion) + ' sin un tanque legible' : ''].filter(Boolean).join(' · ')}.</p>` : '';
  const desoves = c.desoves.length
    ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-cruce-desoves">
        <thead><tr><th>Lote</th><th class="r">Desoves en la Bitácora</th><th class="r">Hembras que desovaron</th><th class="r">Desoves en la hoja de Desoves</th></tr></thead>
        <tbody>${c.desoves.map((d) => `<tr><td><b>${esc(d.lote)}</b></td><td class="r">${nf(d.bitacora)}</td><td class="r">${nf(d.hembrasQueDesovaron)}</td><td class="r">${nf(d.operativo)}</td></tr>`).join('')}</tbody></table></div>
      <p class="mc-note">Sólo para informar: la Bitácora cuenta un evento por hembra con chip, y la hoja de Desoves los desoves del lote entero.
        No tienen por qué coincidir.</p>` : '';
  return `<div class="mc-card mc-card-wide">${cab}${desfase}
    <h5 class="mop-h5">Lo que no puede ser, tanque a tanque</h5>${disc}
    <p class="mc-note">Que haya MENOS hembras con chip que hembras en el libro es lo normal: no todas llevan chip. Por eso no se marca.</p>
    <h5 class="mop-h5">Eventos de la Bitácora en otra ubicación que la de su hembra</h5>${eventos}${sinMatriz}
    <h5 class="mop-h5">Los lotes que están en los dos registros</h5>${resumen}${fuera}${sueltas}
    ${desoves ? '<h5 class="mop-h5">Desoves, lado a lado</h5>' + desoves : ''}
    ${ignoraHTML(c.ignora, 'El cruce', PORQUE_CRUCE)}
  </div>`;
}

/* ── 🖨 REPORTES (F7.1 y F7.2, 2026-09-22) ──────────────────────
   El reporte del último pintado, con su clave. Los botones de PDF y Excel exportan ESTO, lo mismo que se está
   viendo: si volvieran a calcularlo por su cuenta podrían sacar otra cosa que la de la vista previa. */
let _reporte = null;

/** El sello de generación, puesto en el MOMENTO de exportar. Fuera del pintado a propósito: así la vista previa
 *  —y el código verificador, que es del contenido— no cambian cada vez que se repinta la pantalla. */
const selloAhora = () => new Date().toLocaleString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const conSello = (parte) => ({ ...parte, cabecera: { ...parte.cabecera, generado: selloAhora() } });

/** Lo que cada reporte sabe hacer con su modelo: nombrarse, imprimirse y volcarse a Excel. Así los dos botones
 *  son UNO para los tres reportes, y añadir el de Broodstock (F7.3) es añadir una entrada aquí. */
const ARMADO = {
  diario: { doc: parteDiarioDoc, hojas: parteDiarioHojas, nombre: nombreDelParte, titulo: 'parte' },
  semanal: { doc: semanalDoc, hojas: semanalHojas, nombre: nombreDelSemanal, titulo: 'semanal' },
  cierre: { doc: cierreDoc, hojas: cierreHojas, nombre: nombreDelCierre, titulo: 'cierre de lote' },
};

function reportesHTML(M, memo, fecha, hoy, F) {
  const clave = REPORTES.some((r) => r.clave === vOp.rep) ? vOp.rep : REPORTES[0].clave;
  vOp.rep = clave;
  /* La serie va de la VÍSPERA al día: es lo que piden los reportes para poder restar dos cierres. La del tablero
     (`memo.serie`) es la del período elegido arriba, que no tiene por qué empezar ahí. */
  const serie = serieDiaria(M.fuentes, sumarDias(fecha, -1), fecha);
  const lotes = tablaDeLotes(M, F).map((l) => l.lote);
  let modelo = null;
  let sinLote = '';
  if (clave === 'semanal') {
    const p7 = periodoDe('7d', fecha, M.fuentes);
    modelo = semanalPorLote(M, serieDiaria(M.fuentes, sumarDias(p7.desde, -1), p7.hasta), memo.partes, F, {});
  } else if (clave === 'cierre') {
    if (!lotes.includes(vOp.repLote)) vOp.repLote = F.lote && lotes.includes(F.lote) ? F.lote : (lotes[0] || '');
    /* La vida del lote empieza en su ingreso: la serie tiene que llegar hasta ahí, o la curva saldría recortada. */
    const ciclo = vOp.repLote ? cicloDelLote(M.libro, vOp.repLote, fecha) : null;
    const desde = ciclo && ciclo.desde ? sumarDias(ciclo.desde, -1) : sumarDias(fecha, -1);
    modelo = vOp.repLote ? cierreDeLote(M, serieDiaria(M.fuentes, desde, fecha), vOp.repLote, {}) : null;
    if (!modelo) sinLote = lotes.length ? 'No se pudo armar el cierre de ese lote.' : 'No hay ningún lote en el alcance del filtro.';
  } else {
    modelo = parteDiario(M, serie, memo.partes, F, {});
  }
  _reporte = modelo ? { clave, modelo } : null;
  const A = ARMADO[clave];
  const pastillas = REPORTES.map((r) => `<button class="mc-pill mop-rep-pill ${clave === r.clave ? 'is-on' : ''}" data-mop-rep="${esc(r.clave)}"
      title="${esc(r.descripcion || '')}">${r.icono} ${esc(r.etiqueta)}</button>`).join('');
  const selLote = REPORTES.find((r) => r.clave === clave).lote
    ? `<label class="mop-rep-dia">Lote
        <select class="mop-f-sel" data-mop-rep-lote>${lotes.map((l) => `<option value="${esc(l)}"${l === vOp.repLote ? ' selected' : ''}>${esc(l)}</option>`).join('') || '<option value="">(ninguno)</option>'}</select>
        <span class="mc-note">la vida entera del lote, hasta la foto</span></label>` : '';
  const cab = modelo ? modelo.cabecera : { filtrado: false, etiquetas: [] };
  const alcance = alcanceDelParte(cab);
  const doc = modelo ? A.doc(modelo) : '';
  const cuerpo = modelo
    ? `<div class="mop-rep-hoja"><iframe class="mop-rep-prev" title="Vista previa del ${esc(A.titulo)}" srcdoc="${esc(doc)}"></iframe></div>`
    : `<p class="mc-note">${esc(sinLote || 'No hay nada que enseñar.')}</p>`;
  return `<div class="mc-card mc-card-wide mop-rep">
      <div class="mop-rep-barra">
        <div class="mop-rep-tipos">${pastillas}</div>
        <label class="mop-rep-dia">Día del parte
          <input type="date" class="mop-fecha" data-mop-fecha value="${esc(fecha)}" max="${esc(hoy)}">
          <span class="mc-note">es la foto del tablero: cambiarlo mueve todas las sub-vistas</span></label>
        ${selLote}
        <div class="mop-rep-acc">
          <button class="mop-rep-btn" data-mop-rep-pdf>🖨 PDF</button>
          <button class="mop-rep-btn is-alt" data-mop-rep-xlsx>📗 Excel</button>
        </div>
      </div>
      <p class="mc-note mop-rep-alcance${cab.filtrado ? ' is-filtrado' : ''}">
        ${cab.filtrado ? '⚠ ' : ''}${esc(alcance)} · el PDF sale tal cual se ve aquí; el Excel lleva
        las filas completas de cada bloque, una hoja por bloque.</p>
      ${cuerpo}
    </div>`;
}

/** Imprime el reporte que se está viendo (iframe oculto, sin pop-ups: la maquinaria de los PDF del Supervisor). */
function imprimirParte() {
  if (!_reporte) { toast('Todavía no hay reporte que imprimir.', 'warn'); return; }
  const A = ARMADO[_reporte.clave];
  const parte = conSello(_reporte.modelo);
  const fileName = A.nombre(parte);
  const ok = printFichaDocs([{ page: A.doc(parte, { fileName }), fileName }], (n, total, f, done) => {
    if (done) toast('🖨 Reporte enviado a imprimir. Elige «Guardar como PDF» en el diálogo.', 'ok', 5000);
  });
  if (!ok) toast('No se pudo abrir la impresión en este navegador.', 'err');
}

/** Descarga el reporte en Excel: una hoja por bloque, con las filas COMPLETAS (el papel recorta, el archivo no). */
function descargarParte() {
  if (!_reporte) { toast('Todavía no hay reporte que descargar.', 'warn'); return; }
  const XLSX = window.XLSX;
  if (!XLSX) { toast('Exportación no disponible: SheetJS (XLSX) no se cargó. Revisa el <script> del CDN en index.html o tu conexión.', 'err'); return; }
  const A = ARMADO[_reporte.clave];
  const parte = conSello(_reporte.modelo);
  const hojas = A.hojas(parte);
  const wb = XLSX.utils.book_new();
  for (const { nombre, aoa } of hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nombre);
  XLSX.writeFile(wb, A.nombre(parte) + '.xlsx');
  toast(`📗 Excel del ${A.titulo} descargado (${hojas.length} hojas).`, 'ok', 4000);
}

function bind(root) {
  if (root._mopBound) return;
  root._mopBound = true;
  const repintar = () => operativoView(root);
  const abrirSala = (sala) => { vOp.salaDetalle = vOp.salaDetalle === sala ? '' : sala; repintar(); };
  const abrirLote = (lote) => { vOp.loteSel = vOp.loteSel === lote ? '' : lote; repintar(); };
  const abrirTanque = (k) => { vOp.tqFicha = vOp.tqFicha === k ? '' : k; repintar(); };
  const abrirPiscina = (x) => { vOp.piscinaSel = vOp.piscinaSel === x ? '' : x; repintar(); };

  root.addEventListener('click', (e) => {
    const t = e.target;
    const sub = t.closest('[data-mop-sub]');
    if (sub) { vOp.sub = sub.dataset.mopSub; repintar(); return; }
    const per = t.closest('[data-mop-periodo]');
    if (per) { vOp.periodo = per.dataset.mopPeriodo; repintar(); return; }
    const rep = t.closest('[data-mop-rep]');
    if (rep) { vOp.rep = rep.dataset.mopRep; repintar(); return; }
    // El selector de lote del cierre es un <select>: su cambio va en el listener de abajo, no aquí.
    if (t.closest('[data-mop-rep-pdf]')) { imprimirParte(); return; }
    if (t.closest('[data-mop-rep-xlsx]')) { descargarParte(); return; }
    if (t.closest('[data-mop-limpiar]')) {
      Object.assign(vOp, { periodo: INICIAL.periodo, fecha: '', sala: '', tanque: '', lote: '', codigo: '', tanqueSel: '', salaDetalle: '', piscinaSel: '', loteSel: '', tqFicha: '', estado: '', sexo: '', piscina: '', camaronera: '' });
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
    const tqf = t.closest('[data-mop-tqf]');
    if (tqf) { abrirTanque(tqf.dataset.mopTqf); return; }
    const pis = t.closest('[data-mop-piscina]');
    if (pis) { abrirPiscina(pis.dataset.mopPiscina); return; }
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
    if (lote && e.target === lote) { e.preventDefault(); abrirLote(lote.dataset.mopLote); return; }
    const pis = e.target.closest && e.target.closest('[data-mop-piscina]');
    if (pis && e.target === pis) { e.preventDefault(); abrirPiscina(pis.dataset.mopPiscina); return; }
    const tqf = e.target.closest && e.target.closest('[data-mop-tqf]');
    if (tqf && e.target === tqf) { e.preventDefault(); abrirTanque(tqf.dataset.mopTqf); }
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
    if (e.target.matches('[data-mop-rep-lote]')) { vOp.repLote = e.target.value || ''; repintar(); return; }
    if (e.target.matches('[data-mop-fecha]')) { vOp.fecha = e.target.value || ''; repintar(); }
  });
}
