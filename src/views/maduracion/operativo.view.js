/* ============================================================
   MADURACIÓN · OPERATIVO — la VISTA del tablero (F1–F6, 2026-09-19 a 2026-09-21)

   «📋 Operativo» de la entrada de Maduración (entrada.js), con el diseño que aprobó el usuario en cada fase:
   barra de filtros (período · foto al día · sala → tanque · lote → código · estado · sexo · piscina · camaronera,
   con etiquetas de lo activo y «limpiar») y sus sub-vistas.
   ⚠ La lista viva es `SUBS`, unas líneas más abajo, y los KPI son el array `kpis`: se leen de ahí, no de aquí.
     Esta cabecera se quedó atrás DOS veces —«dos sub-vistas» con cinco, y luego «cinco» con siete—, así que ya no
     lleva la cuenta: dice dónde mirar además de qué hay. Hoy:
     📊 Estado actual — los KPI (Vivos, Lotes, Salas, Ocupación, Mortalidad, Reproducción y Biomasa), el mapa de
        planta (los colores, en tres grupos, y el LIENZO del tanque pulsado, 0f · 3: operativo.mapa.js; los modos
        viven en `MODOS_MAPA`), las alertas (con 📉 Tendencias frente al período anterior y
        ⏳ Permanencia, 0f · 2b: operativo.tendencias.js), los últimos registros y los lotes que salen de
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
     🔄 Manejo (F5) — movimientos (matriz sala → sala con el registro debajo) y los tratamientos (calendario
        sala × día, productos por área y cobertura preventiva por lote);
     🦐 Alimentación (6, 2026-09-29; antes, el 2.º bloque de Manejo) — la alimentación PLANIFICADA por producto
        contra la agenda estándar, con cada toma juzgada con el rango de la ficha;
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
  cuarentenasDeLotes, curvaDeCuarentena, AVISO_CUARENTENA_DIAS, tarjetasDeSalas, detalleDeSala, ambienteDelDia,
  indiceDeFiltro, cicloDelLote, etiquetasDeFiltro, kpiBiomasa,
} from './operativo.tablero.js';
import { KPIS_CON_GRAFICO, graficoDeKpi } from './operativo.kpis.js';
import { BIOMOL_PATOGENOS } from './operativo.laboratorio.js';
import { resumenBiomolDeLaVentana, tendenciaDePatogeno, opcionesBiomol } from './operativo.laboratorio.js';   // 0q·6
import { piscinasDeLotes, resumenMicroDeLaVentana, opcionesDeLaVentana, serieDePatogeno, umbralDe } from './operativo.laboratorio.js';   // 0q·5a
import { areaForFormat } from '../microbiologia/data.js';   // 0q·5a
import { formatosDelAgua, patogenosDeMedidas, umbralDelFormato } from './operativo.laboratorio.js';   // 0q·5b
import { parametrosDeMedidas, serieDeParametro, rangoDe } from './operativo.laboratorio.js';   // 0q·5c
import { prepararMicro } from './operativo.laboratorio.js';   // 0r·3d
import { NIVEL_COLOR } from '../microbiologia/data.js';
import { loadCalRanges } from '../microbiologia/calagua.data.js';
import { microPreseleccion } from '../microbiologia/index.js';
import { makeAccessibleDialog } from '../../ui/modal.js';
import { mareasPanelHTML, cablearPanelMareas } from '../supervisor/mareas.js';   // 0r·1 · 🌊 Mareas de Larvicultura (2 · sin ventana)
import { partesConHembras, copulasYMarea } from './operativo.mareas.js';   // 0r·2 · su pestaña «🦐 Cópulas»
import { mareaPorDia } from './data.js';                                    // 0r·2 · la hoja «Marea» por día (la de T9)
import { desovesDiarios, desovesYMarea } from './operativo.mareas.js';     // 1-A · y los desoves por fase lunar
import { FASES_CICLO } from './data.js';                                    // 1-A · el filtro de fase lunar
import { granjaDelDia } from './operativo.mareas.js';                       // 0v·1 · el día pulsado del 🗓 Calendario
import { destroyChart } from '../../core/charts.js';                         // 0r·3b · soltar los gráficos de 🦠 / 🧬 al rehacerlas
import { registerModalEscape } from '../../ui/modalEscape.js';
import { changeView } from '../../ui/router.js';
import { INDICADORES } from './operativo.indicadores.js';
import { FUENTES, umbralVigente, evaluar, UMBRALES_DE_AVISO } from './operativo.umbrales.js';
import { periodoAnterior, presenciaDiaria, tendencias, permanencia, PARAMETROS_REPRODUCCION } from './operativo.tendencias.js';
import { GRUPOS_MAPA, capasDelMapa, contextoDelMapa, colorDeTanque, leyendaDelMapa, resumenDeTanque } from './operativo.mapa.js';
import { tablaDeLotes, fichaDeLote, DIMENSIONES_COMPARATIVA, comparativa, PAREJAS } from './operativo.lotes.js';
import { DIMENSIONES_BAJAS, desgloseDeBajas, motivosDeCierre, bajasPorHora, calorSalaDia, lotesCerrados } from './operativo.bajas.js';
import { tablaDeTanques, fichaDeTanque, avisosDeTanques } from './operativo.tanques.js';
import { pendientesDeN5, tablaDeReproduccion, destinosDeDespacho, totalesDeReproduccion } from './operativo.reproduccion.js';
import { repartoDeLotePorDestino } from './operativo.reproduccion.js';   // 0q·3
import {
  VARIABLES_REVISION, revisionesDeNauplios, alcalinidadPorArea, mortalidadEnDesove, frecuenciaDeObservaciones,
} from './operativo.revisiones.js';
import {
  matrizDeMovimientos, registroDeMovimientos, alimentacionPorProducto, procedenciaDelPeso,
  calendarioDeTratamientos, productosPorArea, coberturaPreventiva,
} from './operativo.manejo.js';
import { tablaDePiscinas, fichaDePiscina } from './operativo.broodstock.js';
import { estadoDeHojas, calendarioDeRegistros, coberturaDePartes, comparacionDeEstados, avisosDelLibro } from './operativo.calidad.js';
import { partesDelDia } from './operativo.calidad.js';   // 0q·4
import { cruceConMicrochips } from './operativo.cruce.js';
import {
  REPORTES, parteDiario, parteDiarioDoc, parteDiarioHojas, nombreDelParte, alcanceDelParte,
  semanalPorLote, semanalDoc, semanalHojas, nombreDelSemanal,
  cierreDeLote, cierreDoc, cierreHojas, nombreDelCierre,
  reporteBroodstock, broodstockDoc, broodstockHojas, nombreDelBroodstock,
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
     pastilla por tema la sub-nav no cabía en un móvil. 6 (2026-09-29) · la alimentación sale a su pastilla (abajo): la
     sub-nav ya envuelve, y Manejo se queda con los movimientos y los tratamientos. */
  { clave: 'manejo', etiqueta: 'Manejo', icono: '🔄' },
  /* 6 (2026-09-29, usuario) · «Alimentación · ración PLANIFICADA» como sub-vista propia, tras Manejo: el MISMO bloque que
     vivía dentro de él (nada se recalcula), con la barra y los filtros del tablero. */
  { clave: 'alimentacion', etiqueta: 'Alimentación', icono: '🦐' },
  /* F6 (2026-09-21) · si lo que dice el tablero descansa sobre registros completos, y el cruce con 🧬 Microchips,
     en UNA sub-vista nueva (decisión del usuario). Broodstock no tiene pastilla: vive en 🧬 Lotes, como el ORIGEN
     de los lotes. */
  { clave: 'calidad', etiqueta: 'Calidad del dato', icono: '🩺' },
  /* F7 (2026-09-22) · la reportería, con su propia pastilla (decisión del usuario). `.mc-subnav` es `flex-wrap`,
     así que la décima envuelve en el móvil: no repite el problema de sitio que obligó a fusionar F5. */
  { clave: 'reportes', etiqueta: 'Reportes', icono: '🖨' },
  /* 2 (2026-09-29, usuario) · lo del laboratorio y las mareas, que eran ventanas, son sub-vistas como las demás: «que no se
     genere una ventana extra sino que de ahí mismo». Las tres traen SUS filtros y ocultan la barra del tablero (`PROPIOS`). */
  { clave: 'micro', etiqueta: 'Microbiología y agua', icono: '🦠' },
  { clave: 'biomol', etiqueta: 'Biomol', icono: '🧬' },
  { clave: 'mareas', etiqueta: 'Mareas', icono: '🌊' },
];
/** 2 · las sub-vistas con sus propios filtros: sin la barra ni las etiquetas del tablero, que no les aplican. */
const PROPIOS = new Set(['micro', 'biomol', 'mareas']);
const INICIAL = { sub: 'estado', periodo: PERIODO_INICIAL, fecha: '', sala: '', tanque: '', lote: '', codigo: '', color: 'estado', salaDetalle: '', tanqueSel: '', loteSel: '', agrupacion: 'lote',
  estado: '', sexo: '', piscina: '', camaronera: '', agrupacionBajas: 'sala',
  /* 5 (2026-09-29, usuario) · la comparativa por código o por piscina: las parejas 'juntas' (por defecto) o 'separadas'. */
  parejas: 'juntas',
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
  rep: 'diario', repLote: '',
  /* 0f · 4 · el par «lote|sala» cuya cuarentena está abierta en ⏳ (📊 Estado actual). No sobrevive a su barra. */
  cuarSel: '',
  /* 0f · 5 · la tarjeta de KPI cuyo gráfico está abierto debajo de las tarjetas (📊 Estado actual). */
  kpiSel: '',
  /* 0q·3 · si «A dónde fueron» (🥚 Reproducción) está desplegada. Empieza plegada: eran 13 destinos y 573 px. */
  destAbierto: false,
  /* 0q·3 · el lote de «Por lote» (🥚 Reproducción) cuyo reparto por destino está desplegado. */
  reproLote: '',
  /* 0q·4 · el día del calendario de partes (🩺 Calidad del dato) cuya ventana está abierta, y la sala en la que se centra
     (la de la celda pulsada; vacía desde una fecha del encabezado). */
  diaParte: '', diaSala: '',
  /* 0q·5a · los filtros PROPIOS de 🦠 Microbiología y 🧬 Biomol (empiezan con la sala, el sexo y el lote del tablero al
     entrar) y el patógeno cuyas cantidades se dibujan. */
  labF: { mes: '', lote: '', sala: '', piscina: '', sexo: '' }, labPat: '',
  /* 0q·5b · en ③ Agua y RAS: el formato, el componente y el patógeno de su gráfico de cantidades. */
  aguaFmt: '', aguaComp: '', aguaPat: '',
  /* 0q·5c · en ③ Calidad de agua: el grupo (vacío = todos) y el parámetro de su gráfico. */
  calGrupo: '', calPar: '',
  /* 0q·6 · en 🧬 Biomol: el patógeno de la tendencia semanal. Sus filtros son los de su sub-vista (`labF`). */
  bioPat: '',
  /* 3 (2026-09-29, usuario) · 🏠 Salas → detalle: la temperatura y el oxígeno por hora de UN día ('dia', por defecto) o de
     todo el período ('periodo'); y el día elegido (vacío = el de la foto; uno que ya no está en el período, también). */
  ambModo: 'dia', ambDia: '' };
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

// ── Modelo memoizado: por los datos, el día de hoy y la foto. La serie y la presencia, además, por el período. ──
let _memo = { src: null, hoy: '', fecha: '', M: null, partes: null, serieClave: '', serie: null, repro: null, libroHoy: null, presenciaClave: '', presencia: null,
  serieCicloClave: '', serieCiclo: null };
function memoModelo(hoy, fecha) {
  if (_memo.src !== store.globalData || _memo.hoy !== hoy || _memo.fecha !== fecha) {
    const M = modeloOperativo(store.globalData, { hoy, fecha });
    _memo = { src: store.globalData, hoy, fecha, M, partes: diasDeTanque(M.fuentes.tanques), serieClave: '', serie: null, repro: null, libroHoy: null,
      presenciaClave: '', presencia: null, serieCicloClave: '', serieCiclo: null };
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
/** 0f · 7 · la serie del CICLO de un lote (su último ingreso → su cierre o la foto): la curva de su ficha la cubre
 *  entera, sea más larga o más corta que el período. Una por lote a la vez, mientras no cambie.
 *  0f · 4 · la usa también la curva de una CUARENTENA ({ desde: su ingreso, hasta }): son sub-vistas distintas y sólo
 *  una está a la vista, así que compartir el hueco no recalcula de más. Empieza la víspera: la baja del primer día. */
/** «De paso» (2026-09-26) · la presencia diaria del libro EN el período, para el % de cópulas y muda de la ficha de un
 *  lote (regla del Saldo). Aparte de la de 📉 Tendencias, que empieza un período antes. Sólo con un lote abierto. */
function presenciaDe(memo, p) {
  const k = p.desde + '|' + p.hasta;
  if (memo.presFichaClave !== k) {
    memo.presFicha = presenciaDiaria(memo.M.fuentes, sumarDias(p.desde, -1), p.hasta);
    memo.presFichaClave = k;
  }
  return memo.presFicha;
}
function serieDelCiclo(memo, c) {
  const k = c.desde + '|' + c.hasta;
  if (memo.serieCicloClave !== k) {
    memo.serieCiclo = serieDiaria(memo.M.fuentes, sumarDias(c.desde, -1), c.hasta);
    memo.serieCicloClave = k;
  }
  return memo.serieCiclo;
}
/** 📉 Tendencias (0f · 2b): la presencia día a día del libro, desde la víspera del período ANTERIOR hasta el final
 *  del elegido, se calcula una vez por datos, foto y período —como la serie—; lo filtrado no la cambia. */
function tendenciasDe(memo, p, F) {
  const pa = periodoAnterior(p);
  const k = pa ? pa.desde + '|' + p.hasta : '';
  if (memo.presenciaClave !== k || !memo.presencia) {
    memo.presencia = pa ? presenciaDiaria(memo.M.fuentes, sumarDias(pa.desde, -1), p.hasta) : new Map();
    memo.presenciaClave = k;
  }
  return tendencias(memo.M, p, F, memo.partes, memo.presencia);
}
let _mapa = null;   // el último mapa pintado: la ficha del tanque pulsado se rellena sin repintar la vista
let _ctxMapa = null;   // 0f · 3 · y lo que su lienzo necesita (capas, serie, partes y período de esa pintada)

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
  const barra = PROPIOS.has(vOp.sub) ? '' : filtrosHTML(M, hoy, fecha, periodo) + etiquetasHTML(F);   // 2 · las tres con SUS filtros
  let h = cabeceraHTML(fecha) + barra + subnavHTML() + avisosDelDatoHTML(M);
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
  } else if (vOp.sub === 'alimentacion') {   // 6 · antes, el 2.º bloque de Manejo
    h += alimentacionHTML(alimentacionPorProducto(M.fuentes, periodo, F), procedenciaDelPeso(M.fuentes, periodo, F), periodo, F);
  } else if (vOp.sub === 'calidad') {
    h += calidadHTML(M, memo, periodo, F);
  } else if (vOp.sub === 'reportes') {
    h += reportesHTML(M, memo, fecha, hoy, F, periodo);
  } else if (LAB[vOp.sub]) {
    _labIngresos = M.fuentes.ingresos || [];   // 0q·5a · de dónde viene cada lote (su piscina)
    h += labPanelHTML();                       // 0f · 8 · 🦠 / 🧬 (2 · sub-vistas, ya no ventanas)
  } else if (vOp.sub === 'mareas') {
    _marCop.fuentes = M.fuentes;     // 0r·2 · la pestaña «🦐 Cópulas» cuenta sobre las fuentes de esta pintada
    h += `<div class="mc-body"><div class="mc-card">${mareasPanelHTML({ extras: MAREAS_EXTRAS_BOTONES, sinCorrelacion: true, calendario: true })}</div></div>`;   // 0r·1 · 🌊 Mareas (0r·2 · con «🦐 Cópulas»; 1-A · sin «Correlación»; 0v·1 · con «🗓 Calendario»)
  } else {
    h += estadoHTML(M, memo, periodo, F);
  }
  root.innerHTML = h;
  if (detalle) dibujarDetalle(detalle);
  if (vOp.sub === 'lotes') dibujarLote(_fichaLote);
  if (vOp.sub === 'lotes') dibujarPiscina(_fichaPiscina);
  if (vOp.sub === 'tanques') dibujarTanque(_fichaTanque);
  if (vOp.sub === 'reproduccion') dibujarReparto(_reparto);   // 0q·3
  dibujarCuarentena(_cuarCurva);   // 0f · 4 · sólo si su lienzo está en pantalla (📊 Estado actual, con un par abierto)
  dibujarKpi(_kpiGraf);            // 0f · 5 · ídem, con una tarjeta de KPI abierta
  trasPintarLab(root);             // 0f · 8 · el gráfico de 🧬 (2 · sub-vista)
  trasPintarDia(root);             // 0q·4 · la ventana de un día del calendario de partes
  dibujarMicPat();                 // 0q·5a · las cantidades del patógeno elegido, en 🦠 Microbiología
  trasPintarMareas(root);          // 0r·1 · la sub-vista 🌊 Mareas (2): cablearla y pintarla con lo elegido
  precargarBiomol(root);           // 0r·3c · 🧬 se prepara en reposo
  precargarMicro(root);            // 0r·3d · y 🦠, en una tarea en reposo aparte
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
  return `<div class="mc-head"><div class="mc-head-t"><span class="mc-head-ic">📋</span><div>
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
    <div style="font-size:40px">📋</div>
    <h3 style="margin:10px 0 6px;color:var(--c-brand)">Sin datos del registro operativo</h3>
    <p class="muted">No hay filas en las hojas del operativo de Maduración: Ingreso, Movimientos, Desoves, Inf. Supervisor,
      Fin de Ciclo, Tratamientos, Alimentación, Broodstock, Salas y Tanques.</p>
    <p class="muted">Se registran en <b>Registros → Maduración</b>. El seguimiento por Trovan está en <b>🧬 Microchips</b>.</p>
  </div>`;
}

/* ============================================================
   📊 ESTADO ACTUAL
   ============================================================ */
/** Una tarjeta de KPI. Con `clave` (0f · 5) se pulsa: abre su gráfico debajo de las tarjetas. */
function tile(rotulo, valor, sub, tono, titulo, clave) {
  const on = !!clave && vOp.kpiSel === clave;
  const clic = clave ? ` role="button" tabindex="0" aria-pressed="${on}" data-mop-kpi="${esc(clave)}"` : '';
  return `<div class="mc-kpi ${tono || ''}${clave ? ' is-clic' : ''}${on ? ' is-on' : ''}"${titulo ? ` title="${esc(titulo)}"` : ''}${clic}><div class="mc-kpi-lb">${esc(rotulo)}</div>
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
  /* 0f · 3 · lo que necesitan los colores nuevos del mapa y el lienzo de un tanque, que se abre SIN repintar. */
  const serie = serieDe(memo, p);
  _ctxMapa = { ctx: contextoDelMapa(_mapa, capasDelMapa(M, serie, memo.partes, p), M.fecha), serie, partes: memo.partes, p };

  const partesSalas = [];
  if (s.difieren) partesSalas.push('hoja ≠ libro');
  else partesSalas.push(`${nf(s.coinciden)} de ${nf(s.total)} coinciden`);
  if (s.sinRegistro) partesSalas.push(`${nf(s.sinRegistro)} sin registro`);

  let mort;
  if (m.modo === 'tasa') {
    mort = tile('Mortalidad', `día ${pc(m.dia.pct)}`, `${nf(m.dia.muertos)} de ${nf(m.dia.riesgo)} · ${esc(etiquetaPeriodo(p))}: ${pc(m.periodo.pct)}`, 'is-mort',
      'Muertos ÷ animales en riesgo (vivos de la víspera + los que ingresaron), la regla del ⚖️ Saldo; el período cuenta desde la víspera de su primer día. Los descartes de selección no son muertes.', 'mortalidad');
  } else if (m.modo === 'registradas') {
    mort = tile('Mortalidad', `${nf(m.dia.muertos)} muertes`, `registradas el ${esc(dm(p.hasta))} · ${nf(m.periodo.muertos)} en ${esc(etiquetaPeriodo(p))}`, 'is-mort',
      'Con sala o tanque: las muertes registradas en la hoja Tanques, de todos sus lotes. La tasa es por lote, porque el libro lleva las bajas por lote.', 'mortalidad');
  } else {
    mort = tile('Mortalidad', '—', m.modo === 'no-aplica' ? 'por lote: no aplica al código genético' : 'sin datos del período', 'is-mort',
      'El libro lleva las bajas por lote, no por código genético.', 'mortalidad');
  }
  const repro = tile('Reproducción', `${nf(r.desoves)} desoves`,
    `N5 ${r.n5 ? nf(r.n5 / 1e6, 2) + ' M' : '—'} · fert. ${pc(r.fertilidad)}${r.ignora.length ? ' · <span class="mop-nota">sin filtro de sala</span>' : ''}`, 'is-desove',
    'Desoves del período, por su fecha. Fertilidad = N2 ÷ huevos, sólo de los desoves que ya tienen su N2 (regla del ⚖️ Saldo). Un desove es de su lote y código genético, no de una sala.', 'reproduccion');

  const kpis = [
    tile('Vivos', nf(v.total), `♀ ${nf(v.hembras)} · ♂ ${nf(v.machos)} · H:M ${nf(v.hm, 2)} ${dot(v.hmEstado, refUmbral('proporcionHM'))}`, '',
      'Animales vivos al cierre de la foto, según el libro mayor. ' + definicion('proporcionHM'), 'vivos'),
    tile('Lotes', nf(l.total), `${nf(l.produccion)} Prod. · ${nf(l.cuarentena)} Cuar. · ${nf(l.mixto)} Mixto${l.otros ? ' · ' + nf(l.otros) + ' sin estado' : ''}`, '',
      'Lotes con animales vivos en lo filtrado. El estado es el de la sala donde están; Mixto si sus salas no coinciden.', 'lotes'),
    tile('Salas', s.difieren ? `${nf(s.difieren)} ⚠` : '✓', partesSalas.join(' · '), s.difieren ? 'is-mort' : 'is-fert',
      'El estado registrado en la hoja de Salas frente al que propone el libro al cierre de la foto (el de «🔄 Proponer estado»).', 'salas'),
    tile('Ocupación', `${nf(o.ocupados)}/${nf(o.total)}`,
      o.modo === 'tanque' ? (o.ocupados ? 'tanque ocupado' : 'tanque vacío') : `${pc(o.pct)}${o.modo === 'filtro' ? ' · tanques con lo filtrado' : ''}`, '',
      definicion('ocupacion'), 'ocupacion'),
    mort, repro,
    tile('Biomasa', b.totalKg === '' ? '—' : nf(b.totalKg, 2) + ' kg',
      b.totalKg === '' ? 'sin pesos registrados en el período'
        : `♀ ${nf(b.hembrasKg, 2)} · ♂ ${nf(b.machosKg, 2)} kg${b.parcial ? ' · <span class="mop-nota">sólo un sexo trae peso</span>' : ''}`, '',
      'Vivos × su peso promedio, PESADO por los animales que el libro tiene en cada tanque. El peso sale de la hoja de Tanques, de los registros del período. Sin ningún peso se deja vacío: una biomasa inventada es peor que ninguna.', 'biomasa'),
  ].join('');

  return `<div class="mc-body">
    <div class="mc-kpis">${kpis}</div>
    ${kpiPanelHTML(M, memo, p, F)}
    ${mapaHTML(_mapa, M, F)}
    <div class="mc-grid">
      ${alertasHTML(alertas(M, p, F), p, tendenciasDe(memo, p, F), permanencia(M, F))}
      ${ultimosHTML(ultimosRegistros(M.frescura))}
      ${cuarentenaHTML(cuarentenaDe(M, memo, p, F), p)}
    </div>
  </div>`;
}

/* ============================================================
   🦠 / 🧬 LO DEL LABORATORIO (0f · 8, 2026-09-26, usuario)
   Lo que el laboratorio mide de Maduración: Microbiología y calidad de agua, y Biomol de los reproductores (las cuentas,
   en operativo.laboratorio.js). Biomol se carga al abrirlo: su vista es la más pesada de la app y va en su propio
   paquete (main.js); traerla al del tablero lo cargaría en cada arranque.
   2 (2026-09-29, usuario) · eran dos ventanas abiertas con dos botones junto a la sub-nav; son dos sub-vistas más.
   ============================================================ */
const LAB = { micro: () => labMicroHTML(), biomol: () => labBiomolHTML() };   // la sub-vista → su cuerpo
let _labRoot = null;          // la vista, para repintar cuando llega Biomol
let _labTend = null;          // la tendencia de Biomol, para dibujarla tras pintar
let _bio = { src: null, filas: null, cargando: false, error: '' };

/* 0r·1 (2026-09-28, usuario) · 🌊 Mareas junto a 🦠 y 🧬: lo MISMO que Larvicultura (supervisor/mareas.js, que lo pinta y
   lo cablea). La vista se repinta entera en cada clic: lo elegido se guarda aquí y, tras cada pintada, se cablea de nuevo
   con lo mismo. 2 (2026-09-29, usuario) · ya no es una ventana sino una sub-vista: entrar en ella empieza en «Día». */
const _mareas = { estado: undefined };
function trasPintarMareas(root) {
  const ctl = cablearPanelMareas(root.querySelector('[data-mareas-panel]'), { state: _mareas.estado, extras: MAREAS_EXTRAS, delDia: granjaDelDiaHTML });
  if (ctl) _mareas.estado = ctl.state;
}

/* 0v·1 (2026-09-29, usuario) · 🗓 el Calendario lunar (supervisor/mareas.js lo pinta) y, en el panel del día pulsado, la
   GRANJA ese día: sus cópulas y sus desoves con las reglas de «🦐 Cópulas» y sin sus filtros (las cuentas, en
   operativo.mareas.js, sobre las mismas pasadas del libro que esa pestaña). */
function granjaDelDiaHTML(fecha) {
  const g = granjaDelDia(datosCopulasMarea().base, diariosDeDesoves(), fecha);
  const c = g.copulas;
  const d = g.desoves;
  const partes = (n) => `${nf(n)} parte${n === 1 ? '' : 's'}`;
  const cop = {
    ok: () => `Cópulas: ${pct1(c.tasa)} (${nf(c.copulas)} de ${nf(c.hembras)} ♀ · ${partes(c.partes - c.sinHembras)})`,
    hueco: () => 'Cópulas: ningún parte las registró ese día (hueco del registro)',
    'sin-hembras': () => `Cópulas: ${nf(c.copulas)}, en partes de tanques sin hembras en el libro (sin tasa)`,
    'sin-partes': () => 'Cópulas: sin partes de Tanques ese día',
  }[c.estado]();
  const sinH = c.estado === 'ok' && c.sinHembras ? ` · ${partes(c.sinHembras)} sin hembras en el libro no cuenta${c.sinHembras === 1 ? '' : 'n'}` : '';
  const des = {
    ok: () => `Desoves: ${nf(d.desoves)} (${por100(d.tasa)} por 100 ♀)`,
    'sin-hembras': () => `Desoves: ${nf(d.desoves)} (sin hembras en el libro ese día)`,
    ninguno: () => 'Desoves: ninguno registrado ese día',
  }[d.estado]();
  return `<div class="sv-marea-caldet-granja">
      <div class="sv-marea-ptitle" title="Cópulas: Σ de los partes de Tanques ÷ Σ hembras del libro al cierre del día (la regla del ⚖️ Saldo). Desoves: los de la hoja de Desoves por 100 ♀ del libro. Las reglas de «🦐 Cópulas», sin sus filtros.">La granja ese día</div>
      <ul><li>🥚 ${esc(des)}</li><li>🦐 ${esc(cop + sinH)}</li></ul>
    </div>`;
}

/* 0r·2 (2026-09-28, usuario) · la pestaña «🦐 Cópulas» del modal: ¿se copula más con la marea viva, con una fase de la luna o
   con más amplitud? Decisiones del usuario: cifras (Viva frente a Muerta, r con la amplitud y la iluminación con su umbral,
   una lectura honesta) + la serie diaria del % con la amplitud + el % por fase lunar; TODO el registro (los meses del modal
   no aplican: se dice); filtros PROPIOS, sala y «sólo en producción». Las cuentas, en operativo.mareas.js (regla del Saldo).
   Los partes con sus hembras salen de UNA pasada del libro y se guardan mientras no cambien las fuentes del tablero.
   1-A (2026-09-28, usuario) · SIN lecturas ni notas de conclusión —las cifras se recalculan con cada parte, y una frase fija
   daba a entender que todo estaba estimado y quedaba estático—: las definiciones van en un ⓘ. Filtros de mes, lote, código
   genético y fase lunar (ésta RESALTA sus días y su fila), la cantidad en la tabla por fase, y «Ver»: cópulas o desoves. */
const MAREAS_EXTRAS = {
  copulas: {
    etiqueta: '🦐 Cópulas',
    inicial: { copSala: '', copProd: false, copMes: '', copLote: '', copCodigo: '', copFase: '', copVar: 'copulas' },
    lienzos: ['mopMarCop'],
    html: (state) => copulasMareaHTML(state),
    dibujar: () => dibujarCopulasMarea(),
    cambio: (t, state) => {
      const c = t.closest && t.closest('[data-mop-marcop]');
      if (!c) return false;
      if (c.dataset.mopMarcop === 'sala') state.copSala = c.value || '';
      else if (COP_CAMPOS[c.dataset.mopMarcop]) state[COP_CAMPOS[c.dataset.mopMarcop]] = c.value || '';
      else state.copProd = !!c.checked;
      return true;
    },
  },
};
const MAREAS_EXTRAS_BOTONES = Object.entries(MAREAS_EXTRAS).map(([modo, x]) => ({ modo, etiqueta: x.etiqueta }));
/* 1-A · los filtros de la pestaña que se guardan tal cual (la sala y la casilla tienen su línea). */
const COP_CAMPOS = { mes: 'copMes', lote: 'copLote', codigo: 'copCodigo', fase: 'copFase', var: 'copVar' };
const _marCop = { fuentes: null, deFuentes: null, base: [], deStore: null, marea: new Map(), dias: null, deFuentesD: null, diarios: [] };
/** 1-A · los desoves de cada día con lo que el libro tenía: UNA pasada más del libro, sólo si se piden y mientras no cambien
 *  las fuentes. */
function diariosDeDesoves() {
  if (_marCop.deFuentesD !== _marCop.fuentes) {
    _marCop.diarios = _marCop.fuentes ? desovesDiarios(_marCop.fuentes) : [];
    _marCop.deFuentesD = _marCop.fuentes;
  }
  return _marCop.diarios;
}
function datosCopulasMarea() {
  if (_marCop.deFuentes !== _marCop.fuentes) {
    _marCop.base = _marCop.fuentes ? partesConHembras(_marCop.fuentes, diasDeTanque(_marCop.fuentes.tanques)) : [];
    _marCop.deFuentes = _marCop.fuentes;
  }
  if (_marCop.deStore !== store.globalData) {
    _marCop.marea = mareaPorDia(store.globalData.filter((r) => r._SheetOrigin === 'Marea'));
    _marCop.deStore = store.globalData;
  }
  return _marCop;
}
const pct1 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %');
const r2txt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('-', '−'));
const diasCop = (n) => `${nf(n)} día${n === 1 ? '' : 's'}`;
const partesDe = (n) => (n === 1 ? '1 parte de un tanque' : `${nf(n)} partes de tanques`);
const por100 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
/* 1-A · lo que cambia entre «Ver cópulas» y «Ver desoves»: el campo, su formato y sus rótulos. */
const VER_COP = {
  copulas: { campo: 'copulas', que: 'cópulas', fmt: pct1, eje: '% de cópulas', col: 'Cópulas', tasa: '% de cópulas',
    serie: '% de cópulas por día', fases: '% de cópulas por fase lunar',
    def: '% del día = Σ cópulas de los partes de Tanques ÷ Σ hembras que el libro tenía en esos tanques al cierre (la regla del ⚖️ Saldo); por grupo, Σ ÷ Σ. Un día en que nadie en la granja registró cópulas no cuenta: la hoja no lleva ceros.' },
  desoves: { campo: 'desoves', que: 'desoves', fmt: por100, eje: 'desoves por 100 ♀', col: 'Desoves', tasa: 'Desoves por 100 ♀',
    serie: 'Desoves por 100 ♀ por día', fases: 'Desoves por 100 ♀ por fase lunar',
    def: 'Desoves por 100 ♀ del día = Σ desoves de la hoja de Desoves ÷ Σ hembras del libro al cierre × 100; por grupo, Σ ÷ Σ. Un día sin ningún desove registrado en la granja no cuenta. Un desove no es de una sala: con sala o «sólo en producción», cuentan enteros los lotes que tenían animales ahí.' },
};
function copulasMareaHTML(state) {
  const ver = state.copVar === 'desoves' ? 'desoves' : 'copulas';
  const V = VER_COP[ver];
  const { base, marea } = datosCopulasMarea();
  const f = { sala: state.copSala || '', soloProduccion: !!state.copProd, mes: state.copMes || '', lote: state.copLote || '', codigo: state.copCodigo || '' };
  const x = ver === 'desoves' ? desovesYMarea(diariosDeDesoves(), marea, f) : copulasYMarea(base, marea, f);
  const salas = state.copSala && !x.salas.includes(state.copSala) ? [state.copSala, ...x.salas] : x.salas;
  /* Un select de la pestaña: lo elegido se queda en la lista aunque ya no traiga datos (como la sala). */
  const sel = (k, rotulo, valor, opciones, todas, et = (o) => o) => {
    const ops = valor && !opciones.includes(valor) ? [valor, ...opciones] : opciones;
    return `<label class="mop-labf-c">${rotulo}<select class="mc-select" data-mop-marcop="${k}">${todas ? `<option value="">${todas}</option>` : ''}${ops.map((o) =>
      `<option value="${esc(o)}"${o === valor ? ' selected' : ''}>${esc(et(o))}</option>`).join('')}</select></label>`;
  };
  const filtros = `<div class="mop-labf" role="group" aria-label="Filtros de esta pestaña">
      ${sel('var', 'Ver', ver, ['copulas', 'desoves'], '', (o) => (o === 'copulas' ? 'Cópulas' : 'Desoves'))}
      ${sel('mes', 'Mes', state.copMes || '', x.meses, 'Todo el registro', mesTxt)}
      <label class="mop-labf-c">Sala<select class="mc-select" data-mop-marcop="sala"><option value="">Todas</option>${salas.map((s) =>
        `<option value="${esc(s)}"${s === state.copSala ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      ${sel('lote', 'Lote', state.copLote || '', x.lotes, 'Todos')}
      ${sel('codigo', 'Código genético', state.copCodigo || '', x.codigos, 'Todos')}
      ${sel('fase', 'Fase lunar', state.copFase || '', FASES_CICLO, 'Todas')}
      <label class="mop-labf-c mop-marcop-prod"><span><input type="checkbox" data-mop-marcop="prod"${state.copProd ? ' checked' : ''}> Sólo tanques en producción</span></label>
    </div>
    <p class="mop-lab-per">${state.copMes ? esc(mesTxt(state.copMes).replace(/^./, (c) => c.toUpperCase())) : 'Todo el registro'}${x.conMarea ? ` · ${diasCop(x.conMarea)} con datos y marea (${dm(x.desde)} – ${dm(x.hasta)}, ≈ ${nf(x.ciclos, 1)} ciclos lunares)` : ''} · los meses de arriba no aplican aquí</p>`;
  const cuenta = [
    x.sinRegistro ? `${diasCop(x.sinRegistro)} sin ninguna cópula registrada en la granja (hueco del registro), fuera` : '',
    x.sinHembras && ver === 'copulas' ? `${partesDe(x.sinHembras)} sin hembras en el libro no cuenta${x.sinHembras === 1 ? '' : 'n'}` : '',
    x.sinHembras && ver === 'desoves' ? `${diasCop(x.sinHembras)} con desoves y sin hembras en este alcance, fuera` : '',
    x.fueraDeProduccion ? `${partesDe(x.fueraDeProduccion)} con algún lote fuera de producción, fuera` : '',
    x.sinMarea ? `${diasCop(x.sinMarea)} con datos y sin marea en la hoja` : '',
  ].filter(Boolean);
  /* 1-A · las definiciones, en un ⓘ: nada de conclusiones en la pestaña (las cifras se recalculan con cada parte). */
  const info = `<details class="mop-marcop-info"><summary title="Qué se cuenta aquí" aria-label="Qué se cuenta aquí">ⓘ</summary>
      <p class="mc-note">${esc(V.def)} Marea y luna: hoja «Marea» (INOCAR). r = correlación de Pearson del valor diario con cada variable (marea viva = 1, muerta = 0); umbral = 2/√días.${cuenta.length ? ' ' + esc(cuenta.join(' · ')) + '.' : ''}</p></details>`;
  _marCop.dias = x.conMarea ? x.dias : null;
  _marCop.ver = ver;
  _marCop.fase = state.copFase || '';
  if (!x.conMarea) return `<div class="mop-marcop">${filtros}${info}<p class="muted mop-marcop-vacio">Sin días con ${V.que} y marea con estos filtros.</p></div>`;
  const tipo = (k) => x.tipo.find((t) => t.k === k);
  const chip = (l, v, s) => `<div class="sv-marea-stat"><div class="sv-marea-stat-l">${esc(l)}</div><div class="sv-marea-stat-v">${v}</div><div class="sv-marea-stat-s">${esc(s)}</div></div>`;
  const cifras = `<div class="sv-marea-stats mop-marcop-cifras">
      ${chip('Marea viva', V.fmt(tipo('Viva').tasa), diasCop(tipo('Viva').dias))}
      ${chip('Marea muerta', V.fmt(tipo('Muerta').tasa), diasCop(tipo('Muerta').dias))}
      ${chip('r con la amplitud', r2txt(x.r.amplitud), `umbral ±${r2txt(x.rCrit)}`)}
      ${chip('r con la iluminación', r2txt(x.r.ilum), `umbral ±${r2txt(x.rCrit)}`)}
    </div>`;
  const maxF = Math.max(0, ...x.fase.map((g) => g.tasa || 0));
  const barraF = (v) => `<span class="mc-bar"><i style="width:${maxF > 0 && v > 0 ? Math.round((v / maxF) * 1000) / 10 : 0}%"></i><b>${V.fmt(v)}</b></span>`;
  const fases = `<div class="sv-marea-panel"><div class="sv-marea-ptitle">${V.fases}</div>
      <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-marcop-fases"><thead><tr><th>Fase lunar</th><th class="r">Días</th><th class="r">${V.col}</th><th class="r">${V.tasa}</th></tr></thead>
      <tbody>${x.fase.map((g) => `<tr${g.k === state.copFase ? ' class="mop-marcop-fase-on"' : ''}><td>${esc(g.k)}</td><td class="r">${nf(g.dias)}</td><td class="r">${nf(g[V.campo])}</td><td class="r">${g.tasa === null ? '<span class="muted">—</span>' : barraF(g.tasa)}</td></tr>`).join('')}</tbody></table></div></div>`;
  const serie = `<div class="sv-marea-panel"><div class="sv-marea-ptitle">${V.serie} <span class="muted">· barras oscuras, marea viva; claras, muerta · la línea, la amplitud${state.copFase ? ` · en color, los días de ${esc(state.copFase)}` : ''}</span></div>
      <div class="sv-marea-charthost"><canvas id="mopMarCop"></canvas></div></div>`;
  return `<div class="mop-marcop">${filtros}${info}${cifras}${serie}${fases}</div>`;
}
const COLOR_MAREA = { Viva: '#00838f', Muerta: '#80cbc4' };
/* 1-A · con una fase lunar elegida, sus días van en su color y los demás, apagados. */
const COLOR_APAGADO = '#dfe5e8';
function dibujarCopulasMarea() {
  const d = _marCop.dias;
  if (!d || !document.getElementById('mopMarCop')) return;
  const E = ejesOp();
  const V = VER_COP[_marCop.ver] || VER_COP.copulas;
  const apagado = (x) => !!_marCop.fase && (!x.marea || x.marea.fase !== _marCop.fase);
  graficoOp('mopMarCop', {
    type: 'bar',
    data: {
      labels: d.map((x) => dm(x.fecha)),
      datasets: [
        { type: 'bar', label: V.eje.charAt(0).toUpperCase() + V.eje.slice(1), data: d.map((x) => x.tasa), yAxisID: 'y', order: 1,
          backgroundColor: d.map((x) => (apagado(x) ? COLOR_APAGADO : (x.marea && COLOR_MAREA[x.marea.tipo]) || '#b0bec5')),
          tooltip: { callbacks: { label: (c) => {
            const x = d[c.dataIndex];
            return `${V.tasa}: ${V.fmt(x.tasa)} (${nf(x[V.campo])} de ${nf(x.hembras)} ♀) · `
              + (x.marea ? `marea ${(x.marea.tipo || '—').toLowerCase()} · ${x.marea.fase || '—'}` : 'sin marea en la hoja');
          } } } },
        { type: 'line', label: 'Amplitud (m)', data: d.map((x) => (x.marea ? x.marea.amplitud : null)), yAxisID: 'y2', order: 0,
          borderColor: '#2b7bd6', backgroundColor: '#2b7bd6', tension: 0, borderWidth: 2, pointRadius: 2.5, spanGaps: true,
          tooltip: { callbacks: { label: (c) => 'Amplitud: ' + (c.raw === null ? '—' : nf(c.raw, 2) + ' m') } } },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { ticks: { ...E.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { beginAtZero: true, ticks: E.tick, grid: { color: E.grid }, title: E.titulo(V.eje) },
        y2: { beginAtZero: true, position: 'right', ticks: E.tick, grid: { display: false }, title: E.titulo('amplitud (m)') } },
      plugins: { legend: { labels: E.leyenda } },
    },
  });
}

/* 0r·3d (2026-09-28, usuario) · 🦠 también se prepara en REPOSO, como 🧬: con el tablero quieto se funden sus muestras de
   Maduración y se mide su calidad de agua con los rangos de este equipo (`prepararMicro`), una vez por carga de datos; así
   su primera apertura sólo maqueta (medido antes: 0,49 s en un PC y 2,5–3,6 s en un equipo de campo). Es una tarea en
   reposo APARTE de la de 🧬: entre las dos, el equipo puede atender un toque. Sin requestIdleCallback (Safari), como
   antes: se prepara al abrirla. Si la vista ya no está o llegaron otros datos cuando le toca, no hace nada. */
let _micPrecarga = null;
function precargarMicro(root) {
  if (typeof window.requestIdleCallback !== 'function' || _micPrecarga === store.globalData) return;
  const carga = store.globalData;
  _micPrecarga = carga;
  window.requestIdleCallback(() => { if (root.isConnected && store.globalData === carga) prepararMicro(carga, loadCalRanges()); }, { timeout: 10000 });
}

/* 0r·3c (2026-09-28, usuario) · 🧬 se prepara en REPOSO: cuando el tablero queda quieto (requestIdleCallback) se trae su
   paquete y se normalizan sus filas (`filasBiomol`), una vez por carga de datos, para que la primera apertura no espere
   (medido: 1,3 s en un equipo de campo). Sin requestIdleCallback (Safari) se carga al abrirla, como antes. Si la vista ya
   no está o llegaron otros datos cuando le toca, no hace nada. */
let _bioPrecarga = null;
function precargarBiomol(root) {
  if (typeof window.requestIdleCallback !== 'function' || _bioPrecarga === store.globalData) return;
  const carga = store.globalData;
  _bioPrecarga = carga;
  window.requestIdleCallback(() => { if (root.isConnected && store.globalData === carga) filasBiomol(); }, { timeout: 10000 });
}
/** Las filas de Biomol, normalizadas por SU vista. Se piden una vez por carga de datos; mientras llegan, «Cargando…». */
function filasBiomol() {
  if (_bio.src === store.globalData && _bio.filas) return _bio.filas;
  if (!_bio.cargando) {
    const src = store.globalData;
    _bio = { src: null, filas: null, cargando: true, error: '' };
    import('../biomolecular/index.js')
      .then((m) => { _bio = { src, filas: m.normalizeRows(src.filter((r) => r._SheetOrigin === 'Biomol')), cargando: false, error: '' }; })
      .catch((e) => { _bio = { src: null, filas: null, cargando: false, error: String((e && e.message) || e) }; })
      .then(() => { if (vOp.sub === 'biomol' && _labRoot && _labRoot.isConnected) operativoView(_labRoot); });
  }
  return null;
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : '');
const pctTxt = (a, b) => (b ? nf(pct(a, b), 1) + ' %' : '—');
const DIM_TXT = { sala: 'sala', tanque: 'tanque', sexo: 'sexo', lote: 'lote' };
/** Lo que un bloque NO pudo filtrar y lo que dejó fuera por no decirlo: siempre a la vista, para no leer de más. */
function labNotas({ ignora = [], sinDato = {} }) {
  const n = [];
  if (ignora.length) n.push(`No se aplica aquí: ${esc(ignora.map((d) => DIM_TXT[d] || d).join(', '))} (estas muestras no lo registran).`);
  for (const [d, k] of Object.entries(sinDato)) n.push(`${nf(k)} muestra(s) no dicen su ${esc(DIM_TXT[d] || d)}: no entran con ese filtro.`);
  return n.map((x) => `<p class="mc-note">${x}</p>`).join('');
}
const nivelDot = (n) => (n ? `<span class="mop-lab-dot" style="background:${NIVEL_COLOR[n] || '#90a4ae'}"></span>${esc(n)}` : '—');
const barraPct = (v) => `<span class="mop-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Number(v) || 0))}%"></i></span>`;

function labMicroHTML() {
  const mapa = piscinasDeLotes(_labIngresos);
  const op = opcionesDeLaVentana(store.globalData, mapa);
  labFNormalizado(op);
  const r = resumenMicroDeLaVentana(store.globalData, vOp.labF, loadCalRanges(), mapa);
  const R = r.reproductores;
  // 0q·5a · el patógeno escogido (por defecto, el primero de la tabla: el de más alertas) y sus cantidades.
  const patSel = (R.porPatogeno.find((x) => x.key === vOp.labPat) || R.porPatogeno[0] || {}).key || '';
  const pat = R.porPatogeno.find((x) => x.key === patSel);
  _micPat = pat ? { etiqueta: pat.etiqueta, serie: serieDePatogeno(R.medidas, pat.key), umbral: umbralDe(areaForFormat('mad-principal', ''), pat.key) } : null;
  const rep = R.muestras ? `
    <p class="mop-lab-kpi"><b>${nf(R.muestras)}</b> muestras · <b>${nf(R.alerta)}</b> en alerta (${pctTxt(R.alerta, R.muestras)}) <span class="mop-nota">alerta = algún patógeno en Moderado o Elevado</span></p>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lab-pat"><thead><tr><th>Patógeno</th><th class="r">Analizadas</th><th class="r">En alerta</th><th></th></tr></thead>
      <tbody>${R.porPatogeno.map((x) => `<tr class="mop-micpat${x.key === patSel ? ' is-on' : ''}" role="button" tabindex="0" aria-pressed="${x.key === patSel}" data-mop-micpat="${esc(x.key)}"><td>${esc(x.etiqueta)}</td><td class="r">${nf(x.analizadas)}</td><td class="r">${nf(x.alerta)} · ${pctTxt(x.alerta, x.analizadas)}</td><td>${barraPct(pct(x.alerta, x.analizadas))}</td></tr>`).join('')}</tbody></table></div>
    <div class="mop-lab-2">${[['Por sala', R.porSala], ['Por sexo', R.porSexo]].map(([t, g]) => `<div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>${t}</th><th class="r">Muestras</th><th class="r">En alerta</th></tr></thead>
      <tbody>${g.map((x) => `<tr${x.fueraDeSalas ? ' class="mop-lab-fuera"' : ''}><td>${esc(x.clave)}${x.fueraDeSalas ? ' <span class="mop-nota">fuera de las salas</span>' : ''}</td><td class="r">${nf(x.muestras)}</td><td class="r">${nf(x.alerta)} · ${pctTxt(x.alerta, x.muestras)}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>
    ${micPatHTML()}
    <h5 class="mop-lab-h5">Últimas muestras</h5>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lab-ult"><thead><tr><th>Fecha</th><th>Lugar · TQ</th><th>Sexo</th><th>Peor nivel</th><th>En alerta</th></tr></thead>
      <tbody>${R.ultimas.map((u) => `<tr><td>${esc(dma(u.fecha))}</td><td>${esc([u.lugar, u.tanque && 'TQ ' + u.tanque].filter(Boolean).join(' · ') || '—')}</td><td>${esc(u.sexo || '—')}</td>
        <td>${nivelDot(u.peor)}</td><td>${esc(u.enAlerta.join(', ') || '—')}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="muted">Sin muestras de hepatopáncreas en ${esc(cuandoLab())}.</p>`;
  const D = r.desinfeccion;
  const celda = (x) => (x.muestras ? `${nf(x.muestras)} · ${nf(x.alerta)} en alerta (${pctTxt(x.alerta, x.muestras)})` : '—');
  const des = D.muestras ? `
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lab-des"><thead><tr><th>Etapa</th><th>Muestra</th><th>Antes de desinfectar</th><th>Después</th></tr></thead>
      <tbody>${D.filas.map((x) => `<tr><td>${esc(x.etapa)}</td><td>${esc(x.matriz === 'Agua' ? 'Agua' : 'Animal')}</td><td>${celda(x.antes)}</td><td>${celda(x.despues)}</td></tr>`).join('')}</tbody></table></div>
    ${D.sinTipo ? `<p class="mc-note">${nf(D.sinTipo)} muestra(s) de despacho sin etapa o momento reconocibles en su «Tipo de muestra»: no entran en la tabla.</p>` : ''}`
    : `<p class="muted">Sin muestras de despacho en ${esc(cuandoLab())}.</p>`;
  const A = r.agua;
  const C = A.calidad;
  const agua = `
    ${A.micro.length ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lab-agua"><thead><tr><th>Microbiología · formato</th><th class="r">Muestras</th><th class="r">En alerta</th></tr></thead>
      <tbody>${A.micro.map((x) => `<tr><td>${esc(x.clave)}</td><td class="r">${nf(x.muestras)}</td><td class="r">${nf(x.alerta)} · ${pctTxt(x.alerta, x.muestras)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">Sin microbiología de agua o RAS en ${esc(cuandoLab())}.</p>`}
    ${labNotas(A)}
    ${aguaCantHTML(A)}
    ${C.muestras ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lab-cal"><thead><tr><th>Calidad de agua · componente</th><th class="r">Muestras</th><th class="r" title="Índice de calidad (0–100), mediana de las muestras">Índice</th><th class="r">Fuera de rango</th><th>Más veces fuera</th><th>Última</th></tr></thead>
      <tbody>${C.porGrupo.map((g) => `<tr><td>${esc(g.grupo)}</td><td class="r">${nf(g.muestras)}</td><td class="r">${g.wqi === null ? '—' : nf(g.wqi)}</td><td class="r">${nf(g.fuera)}</td>
        <td>${esc(g.peores.map((x) => x.label + ' (' + x.n + ')').join(', ') || '—')}</td><td>${esc(dm(g.ultima))}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">Sin calidad de agua en ${esc(cuandoLab())}.</p>`}
    ${labNotas(C)}
    ${calParHTML(C)}`;
  return `${labFiltrosHTML(op)}
    <section class="mop-lab-bloque"><h4 class="mc-card-h">① Reproductores · hepatopáncreas <span class="mc-h-note">formato «Maduración · Principal»</span></h4>${rep}${labNotas(R)}</section>
    <section class="mop-lab-bloque"><h4 class="mc-card-h">② Desinfección de huevo y nauplio <span class="mc-h-note">formato «Maduración · Despacho»</span></h4>${des}${labNotas(D)}</section>
    <section class="mop-lab-bloque"><h4 class="mc-card-h">③ Agua y RAS</h4>${agua}</section>
    <div class="mop-lab-pie"><button type="button" class="mc-mini" data-mop-lab-abrir-micro>Abrir en 🦠 Microbiología</button></div>`;
}

/* ── 0q·5a (2026-09-27, usuario) · la ventana de Microbiología con SUS filtros y las CANTIDADES del patógeno ───────
   Ya no sigue al tablero: su barra —Mes, Lote, Sala, Piscina, Sexo— sobre todo el registro (las cuentas, en
   operativo.laboratorio.js); al abrirla empieza con la sala, el sexo y el lote del tablero. Al escoger un patógeno (su
   fila), sus UFC muestra a muestra, la mediana semanal y los umbrales de su área, en escala logarítmica. */
let _labIngresos = [];
let _micPat = null;
const MESES_TXT = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesTxt = (ym) => MESES_TXT[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
const LABF_VACIO = { mes: '', lote: '', sala: '', piscina: '', sexo: '' };
/** El «cuándo» de 🦠 / 🧬 en palabras: el mes elegido o todo el registro. */
const cuandoLab = () => (vOp.labF.mes ? mesTxt(vOp.labF.mes) : 'todo el registro');
/** El sexo del tablero («hembras») a la grafía de las muestras («Hembras»), para que su select lo enseñe. */
function labFNormalizado(op) {
  const s = vOp.labF.sexo;
  if (s && !op.sexos.includes(s)) {
    const m = op.sexos.find((o) => o[0].toLowerCase() === s[0].toLowerCase());
    if (m) vOp.labF = { ...vOp.labF, sexo: m };
  }
}
function labFiltrosHTML(op, notaPiscina = 'la piscina, sólo en ①: la de la muestra o, si no, la de su lote en Ingresos') {
  const fi = vOp.labF;
  const sel = (dim, rot, ops, todos, fmt = (v) => v) => {
    const lista = fi[dim] && !ops.includes(fi[dim]) ? [fi[dim], ...ops] : ops;   // lo elegido se enseña aunque ya no haya muestras
    return `<label class="mop-labf-c">${rot}<select class="mc-select" data-mop-labf="${dim}"><option value="">${todos}</option>${lista.map((v) =>
      `<option value="${esc(v)}"${v === fi[dim] ? ' selected' : ''}>${esc(fmt(v))}</option>`).join('')}</select></label>`;
  };
  const hay = Object.values(fi).some((v) => v);
  return `<div class="mop-labf" role="group" aria-label="Filtros de esta vista">
      ${sel('mes', 'Mes', op.meses, 'Todo el registro', mesTxt)}${sel('lote', 'Lote', op.lotes, 'Todos')}${sel('sala', 'Sala', op.salas, 'Todas')}
      ${sel('piscina', 'Piscina', op.piscinas, 'Todas')}${sel('sexo', 'Sexo', op.sexos, 'Los dos')}
      ${hay ? '<button type="button" class="mc-mini" data-mop-labf-limpiar>Quitar filtros</button>' : ''}</div>
    <p class="mop-lab-per">${fi.mes ? esc(mesTxt(fi.mes)) : 'Todo el registro'} · con los filtros de esta vista, no los del tablero · ${esc(notaPiscina)}</p>`;
}
/** El bloque del patógeno escogido de ①: su resumen y el lienzo de sus cantidades. */
function micPatHTML() { return cantidadesHTML(_micPat, 'mopMicPat', 'los reproductores'); }
/** 0q·5b · el resumen y el lienzo de las cantidades de un patógeno `d` ({ etiqueta, serie, umbral }); `deQuien`, de quién
 *  son los umbrales (cada formato tiene los suyos). */
function cantidadesHTML(d, id, deQuien) {
  if (!d) return '';
  const s = d.serie;
  const u = d.umbral;
  const cab = `<h5 class="mop-lab-h5">${esc(d.etiqueta)} · UFC de cada muestra y mediana semanal</h5>`;
  if (!s.muestras) return `<div class="mop-micpat-graf">${cab}<p class="muted">Ninguna muestra trae su cifra de UFC de ${esc(d.etiqueta)} con estos filtros${s.sinCifra ? ` (${nf(s.sinCifra)} sólo con su nivel)` : ''}.</p></div>`;
  return `<div class="mop-micpat-graf">${cab}
    <p class="mop-lab-kpi"><b>${nf(s.muestras)}</b> muestras con cifra · mediana <b>${nf(s.mediana)}</b> · máximo <b>${nf(s.maximo)}</b> · <b>${nf(s.alerta)}</b> en alerta (${pctTxt(s.alerta, s.muestras)})${s.sinCifra ? ` · ${nf(s.sinCifra)} sin cifra (sólo su nivel)` : ''}</p>
    <div class="mc-chart" style="height:260px"><canvas id="${id}"></canvas></div>
    <p class="mc-note">Escala logarítmica (cada raya, ×10): 200 y 800 000 se leen en el mismo gráfico. Las muestras sin crecimiento (0 UFC) van en
      la raya «0» de abajo. Cada punto lleva el color de su nivel${u ? `; las líneas discontinuas son los umbrales de ${esc(deQuien)}: Moderado desde ${nf(u.m)} y Elevado desde ${nf(u.e)} (alerta = Moderado o Elevado)` : ''}.</p>
  </div>`;
}
/** La escala logarítmica no tiene cero: las muestras de 0 UFC se dibujan en esta raya, rotulada «0». */
const SUELO_UFC = 1;
const POTENCIA_10 = /^10*$/;
/** Un gráfico de DISPERSIÓN de Operativo: el movimiento de `graficoOp` (0q·2) sin su globo de arriba ni su raya del día,
    que son de los ejes de días; aquí el globo es el del punto más cercano. */
function graficoDispersionOp(id, cfg) {
  const reducir = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  Object.assign(cfg.options, { interaction: { mode: 'nearest', intersect: true }, animation: reducir ? false : { duration: 400 },
    transitions: { active: { animation: { duration: 0 } } } });
  const pl = cfg.options.plugins || (cfg.options.plugins = {});
  pl.legend = { ...pl.legend, labels: { ...(pl.legend || {}).labels, sort: enOrdenDeDatos } };
  pl.tooltip = { ...pl.tooltip, itemSort: enOrdenDeDatos };
  return makeChart(id, cfg);
}
/** La leyenda del gráfico de cantidades, PROPIA: la de Chart.js pinta cada serie con el color de su PRIMER punto, y los de
 *  «Muestras» van del color de su nivel (salía roja). Aquí, el color de la serie (gris para «Muestras»). */
const leyendaMicPat = (chart, color, nota = 'color de su nivel') => chart.data.datasets.map((d, i) => ({
  text: i === 0 ? d.label + ' (' + nota + ')' : d.label, fillStyle: d.backgroundColor,
  strokeStyle: d.borderColor, lineWidth: 1, pointStyle: 'circle', hidden: !chart.isDatasetVisible(i), datasetIndex: i, fontColor: color }));   // fontColor: si falta, el texto no sigue al tema
/** Las cantidades de ① (reproductores) y de ③ (agua y RAS), si su lienzo está en pantalla. */
function dibujarMicPat() {
  dibujarCantidades('mopMicPat', _micPat);
  dibujarCantidades('mopAguaPat', _aguaPat);   // 0q·5b
  dibujarParametro();                            // 0q·5c
}
function dibujarCantidades(id, cant) {
  if (!cant || !cant.serie.muestras || !document.getElementById(id)) return;
  const E = ejesOp();
  const s = cant.serie;
  const dia = (iso) => Math.round(Date.parse(iso + 'T12:00:00Z') / 864e5);
  const isoDia = (d) => new Date(d * 864e5).toISOString().slice(0, 10);
  const xs = s.puntos.map((p) => dia(p.fecha));
  const x0 = Math.min(...xs) - 1;
  const x1 = Math.max(...xs) + 1;
  const y = (v) => Math.max(Number(v) || 0, SUELO_UFC);
  const umbral = (label, v, color) => ({ label, data: [{ x: x0, y: v }, { x: x1, y: v }], showLine: true, borderColor: color, backgroundColor: color,
    borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 });
  const u = cant.umbral;
  const datasets = [
    { label: 'Muestras', data: s.puntos.map((p) => ({ x: dia(p.fecha), y: y(p.ufc), ufc: p.ufc, fecha: p.fecha, nivel: p.nivel })),
      backgroundColor: '#90a4ae', borderColor: '#546e7a', pointBackgroundColor: s.puntos.map((p) => NIVEL_COLOR[p.nivel] || '#90a4ae'), pointRadius: 3.5, borderWidth: 1 },
    { label: 'Mediana semanal', data: s.semanas.map((w) => ({ x: dia(w.lunes) + 3, y: y(w.mediana), ufc: w.mediana, lunes: w.lunes, n: w.n })),
      showLine: true, tension: 0, borderColor: E.texto, backgroundColor: E.texto, borderWidth: 2, pointRadius: 3 },
    ...(u ? [umbral('Moderado', u.m, NIVEL_COLOR.Moderado), umbral('Elevado', u.e, NIVEL_COLOR.Elevado)] : []),
  ];
  const etiqueta = (c) => {
    const d = c.raw || {};
    if (c.dataset.label === 'Muestras') return nf(d.ufc) + ' UFC' + (d.nivel ? ' · ' + d.nivel : '');
    if (c.dataset.label === 'Mediana semanal') return 'mediana ' + nf(d.ufc) + ' UFC · ' + nf(d.n) + ' muestra(s)';
    return c.dataset.label + ' desde ' + nf(d.y) + ' UFC';
  };
  graficoDispersionOp(id, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { type: 'linear', min: x0, max: x1, ticks: { ...E.tick, maxRotation: 0, callback: (v) => dm(isoDia(v)) }, grid: { display: false } },
        y: { type: 'logarithmic', min: SUELO_UFC, ticks: { ...E.tick, callback: (v) => (v === SUELO_UFC ? '0' : POTENCIA_10.test(String(v)) ? nf(v) : '') },
          grid: { color: E.grid }, title: E.titulo('UFC') } },
      plugins: { legend: { labels: { ...E.leyenda, generateLabels: (chart) => leyendaMicPat(chart, E.texto) } }, tooltip: { callbacks: {
        title: (items) => { const d = (items[0] && items[0].raw) || {}; return d.fecha ? dma(d.fecha) : d.lunes ? 'Semana del ' + dm(d.lunes) : ''; },
        label: etiqueta } } },
    },
  });
}

/* ── 0q·5b (2026-09-27, usuario) · ③ Agua y RAS: las CANTIDADES por formato ─────────────────────────────────────
   RAS, Agua, Hisopado y Agua limpia y mar tienen umbrales distintos: pastillas de formato, un Componente cuando lo
   hay (RAS), y como en ① la tabla de patógenos que se escoge y su gráfico, con los umbrales de ESE formato. */
let _aguaPat = null;
const formatoCorto = (etq) => String(etq).replace(/^Maduraci[oó]n\s*·\s*/i, '');
function aguaCantHTML(A) {
  _aguaPat = null;
  const fmts = formatosDelAgua(A.medidas);
  if (!fmts.length) return '';
  const fmt = fmts.find((f) => f.key === vOp.aguaFmt) || fmts[0];
  const comp = fmt.componentes.includes(vOp.aguaComp) ? vOp.aguaComp : '';
  const med = A.medidas.filter((m) => m.formato === fmt.key && (!comp || m.componente === comp));
  const pats = patogenosDeMedidas(med);
  const patSel = (pats.find((p) => p.key === vOp.aguaPat) || pats[0] || {}).key || '';
  const pat = pats.find((p) => p.key === patSel);
  _aguaPat = pat ? { etiqueta: pat.etiqueta, serie: serieDePatogeno(med, pat.key), umbral: umbralDelFormato(fmt.key, pat.key) } : null;
  const pastillas = fmts.map((f) => `<button type="button" class="mc-pill${f.key === fmt.key ? ' is-on' : ''}" data-mop-aguafmt="${esc(f.key)}" aria-pressed="${f.key === fmt.key}">
    ${esc(formatoCorto(f.etiqueta))} <span class="mop-nota">${nf(f.muestras)}</span></button>`).join('');
  const compSel = fmt.componentes.length ? `<label class="mop-labf-c mop-agua-comp">Componente<select class="mc-select" data-mop-aguacomp><option value="">Todos</option>${fmt.componentes.map((c) =>
    `<option value="${esc(c)}"${c === comp ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : '';
  const tabla = pats.length ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lab-pat"><thead><tr><th>Patógeno</th><th class="r">Analizadas</th><th class="r">En alerta</th><th></th></tr></thead>
      <tbody>${pats.map((x) => `<tr class="mop-micpat${x.key === patSel ? ' is-on' : ''}" role="button" tabindex="0" aria-pressed="${x.key === patSel}" data-mop-aguapat="${esc(x.key)}"><td>${esc(x.etiqueta)}</td>
        <td class="r">${nf(x.analizadas)}</td><td class="r">${nf(x.alerta)} · ${pctTxt(x.alerta, x.analizadas)}</td><td>${barraPct(pct(x.alerta, x.analizadas))}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Ninguna medición con nivel en este formato con estos filtros.</p>';
  return `<div class="mop-agua-cant"><h5 class="mop-lab-h5">Cantidades por formato <span class="mop-nota">cada formato con sus umbrales</span></h5>
    <div class="mop-agua-fmts" role="group" aria-label="Formato">${pastillas}</div>${compSel}${tabla}${cantidadesHTML(_aguaPat, 'mopAguaPat', fmt.etiqueta)}</div>`;
}

/* ── 0q·5c (2026-09-27, usuario) · ③ Calidad de agua: los VALORES de un parámetro ─────────────────────────────────
   Una tabla de parámetros que se escoge (primero el que más sale de rango), un Grupo («Todos» por defecto: el rango
   es el mismo en todos) y su gráfico: los valores (verde dentro, rojo fuera, gris sin rango), la mediana semanal y
   las rayas del mínimo y el máximo. Escala lineal, en la unidad del parámetro. */
let _calPar = null;
const COLOR_ESTADO_CAL = { dentro: '#1ec86a', fuera: '#e8303e', 'sin-rango': '#90a4ae' };
const ESTADO_CAL_TXT = { dentro: 'dentro del rango', fuera: 'FUERA del rango', 'sin-rango': 'sin rango' };
function calParHTML(C) {
  _calPar = null;
  if (!C.medidas || !C.medidas.length) return '';
  const rangos = loadCalRanges();
  const grupos = [...new Set(C.medidas.map((m) => m.grupo))].sort(porNombre);
  const grupo = grupos.includes(vOp.calGrupo) ? vOp.calGrupo : '';
  const med = grupo ? C.medidas.filter((m) => m.grupo === grupo) : C.medidas;
  const pars = parametrosDeMedidas(med, rangos);
  const parSel = (pars.find((x) => x.key === vOp.calPar) || pars[0] || {}).key || '';
  const par = pars.find((x) => x.key === parSel);
  _calPar = par ? { etiqueta: par.etiqueta, unidad: par.unidad, serie: serieDeParametro(med, par.key), rango: rangoDe(par.key, rangos), rangoTxt: par.rango } : null;
  const selG = `<label class="mop-labf-c mop-agua-comp">Grupo<select class="mc-select" data-mop-calgrupo><option value="">Todos</option>${grupos.map((g) =>
    `<option value="${esc(g)}"${g === grupo ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>`;
  const fila = (x) => `<tr class="mop-micpat${x.key === parSel ? ' is-on' : ''}" role="button" tabindex="0" aria-pressed="${x.key === parSel}" data-mop-calpar="${esc(x.key)}">
    <td>${esc(x.etiqueta)}${x.unidad ? ` <span class="mop-nota">${esc(x.unidad)}</span>` : ''}</td><td class="r">${nf(x.muestras)}</td>
    <td class="r">${x.rango ? nf(x.fuera) + ' · ' + pctTxt(x.fuera, x.muestras) : '<span class="muted">sin rango</span>'}</td><td class="r">${esc(x.rango || '—')}</td>
    <td>${x.rango ? barraPct(pct(x.fuera, x.muestras)) : ''}</td></tr>`;
  const tabla = `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lab-pat"><thead><tr><th>Parámetro</th><th class="r">Muestras</th>
    <th class="r">Fuera de rango</th><th class="r">Rango</th><th></th></tr></thead><tbody>${pars.map(fila).join('')}</tbody></table></div>`;
  return `<div class="mop-cal-par"><h5 class="mop-lab-h5">Valores por parámetro <span class="mop-nota">el rango es el mismo en todos los grupos</span></h5>
    ${selG}${tabla}${parametroHTML(_calPar)}</div>`;
}
/** El resumen y el lienzo del parámetro escogido. */
function parametroHTML(d) {
  if (!d) return '';
  const s = d.serie;
  const u = d.unidad ? ' ' + d.unidad : '';
  const nota = d.rango ? `las líneas discontinuas son el rango (${esc(d.rangoTxt)}${esc(u)}): verde dentro, rojo fuera` : 'este parámetro no tiene rango: sus puntos van en gris';
  return `<div class="mop-micpat-graf"><h5 class="mop-lab-h5">${esc(d.etiqueta)} · valor de cada muestra y mediana semanal</h5>
    <p class="mop-lab-kpi"><b>${nf(s.muestras)}</b> muestras · mediana <b>${nf(s.mediana, 2)}</b>${esc(u)} · de <b>${nf(s.minimo, 2)}</b> a <b>${nf(s.maximo, 2)}</b>${d.rango ? ` · <b>${nf(s.fuera)}</b> fuera de rango (${pctTxt(s.fuera, s.muestras)})` : ''}</p>
    <div class="mc-chart" style="height:260px"><canvas id="mopCalPar"></canvas></div>
    <p class="mc-note">Cada punto es una muestra; la línea, la mediana de su semana; ${nota}.</p></div>`;
}
const diaNum = (iso) => Math.round(Date.parse(iso + 'T12:00:00Z') / 864e5);
const isoDeDia = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
function dibujarParametro() {
  const d = _calPar;
  if (!d || !d.serie.muestras || !document.getElementById('mopCalPar')) return;
  const E = ejesOp();
  const s = d.serie;
  const u = d.unidad ? ' ' + d.unidad : '';
  const xs = s.puntos.map((p) => diaNum(p.fecha));
  const desde = Math.min(...xs) - 1;
  const hasta = Math.max(...xs) + 1;
  const raya = (label, v) => ({ label, data: [{ x: desde, y: v }, { x: hasta, y: v }], showLine: true, borderColor: '#e8303e', backgroundColor: '#e8303e',
    borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 });
  const rg = d.rango;
  // El eje abarca los valores y el rango con un 5 % de margen, y no baja de 0 si nada es negativo (visto en Chrome: el TAN
  // llegaba a −5; una concentración no es negativa).
  const extremos = [...s.puntos.map((p) => p.valor), ...(rg ? [rg.min, rg.max].filter((v) => v !== null) : [])];
  const bajo = Math.min(...extremos);
  const alto = Math.max(...extremos);
  const margen = (alto - bajo) * 0.05 || 1;
  const yMin = bajo >= 0 && bajo - margen < 0 ? 0 : bajo - margen;
  const datasets = [
    { label: 'Muestras', data: s.puntos.map((p) => ({ x: diaNum(p.fecha), y: p.valor, fecha: p.fecha, estado: p.estado })), backgroundColor: '#90a4ae',
      borderColor: '#546e7a', pointBackgroundColor: s.puntos.map((p) => COLOR_ESTADO_CAL[p.estado] || '#90a4ae'), pointRadius: 3.5, borderWidth: 1 },
    { label: 'Mediana semanal', data: s.semanas.map((w) => ({ x: diaNum(w.lunes) + 3, y: w.mediana, lunes: w.lunes, n: w.n })), showLine: true, tension: 0,
      borderColor: E.texto, backgroundColor: E.texto, borderWidth: 2, pointRadius: 3 },
    ...(rg && rg.min !== null ? [raya('Mínimo', rg.min)] : []),
    ...(rg && rg.max !== null ? [raya('Máximo', rg.max)] : []),
  ];
  const globo = (c) => {
    const p = c.raw || {};
    if (c.dataset.label === 'Muestras') return nf(p.y, 2) + u + ' · ' + (ESTADO_CAL_TXT[p.estado] || '');
    if (c.dataset.label === 'Mediana semanal') return 'mediana ' + nf(p.y, 2) + u + ' · ' + nf(p.n) + ' muestra(s)';
    return c.dataset.label + ' ' + nf(p.y, 2) + u;
  };
  const nota = rg ? 'verde dentro del rango, rojo fuera' : 'sin rango';
  graficoDispersionOp('mopCalPar', {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { type: 'linear', min: desde, max: hasta, ticks: { ...E.tick, maxRotation: 0, callback: (v) => dm(isoDeDia(v)) }, grid: { display: false } },
        y: { min: yMin, max: alto + margen, ticks: E.tick, grid: { color: E.grid }, title: E.titulo(d.etiqueta + (d.unidad ? ' (' + d.unidad + ')' : '')) } },
      plugins: { legend: { labels: { ...E.leyenda, generateLabels: (chart) => leyendaMicPat(chart, E.texto, nota) } }, tooltip: { callbacks: {
        title: (items) => { const p = (items[0] && items[0].raw) || {}; return p.fecha ? dma(p.fecha) : p.lunes ? 'Semana del ' + dm(p.lunes) : ''; },
        label: globo } } },
    },
  });
}

function labBiomolHTML() {
  _labTend = null;
  const filas = filasBiomol();
  if (!filas) return _bio.error ? `<p class="mc-warn">No se pudo cargar Biología Molecular: ${esc(_bio.error)}</p>` : '<p class="muted">Cargando Biología Molecular…</p>';
  // 0q·6 · con los filtros de su sub-vista, sobre todo el registro.
  const op = opcionesBiomol(filas);
  labFNormalizado(op);
  const b = resumenBiomolDeLaVentana(filas, vOp.labF);
  const barra = labFiltrosHTML(op, 'la piscina, la de la muestra: una combinada («P554/556») cuenta en las dos');
  if (!b.muestras) return `${barra}<p class="muted">Sin muestras de reproductores en ${esc(cuandoLab())}.</p>${labNotas(b)}${tejidosBiomolHTML(b.tejidos)}`;
  const pats = BIOMOL_PATOGENOS.filter(({ key }) => b.total[key].analizadas);
  const celdas = (c) => pats.map(({ key }) => { const x = c[key]; return `<td class="r${x.positivos ? ' mop-lab-pos' : ''}">${x.analizadas ? nf(x.positivos) + '/' + nf(x.analizadas) : '—'}</td>`; }).join('');
  const tabla = (titulo, grupos, fuera) => `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lab-bio">
    <thead><tr><th>${titulo}</th><th class="r">Muestras</th>${pats.map((x) => `<th class="r">${esc(x.etiqueta)}</th>`).join('')}</tr></thead>
    <tbody>${grupos.map((g) => `<tr${fuera && g.fueraDeSalas ? ' class="mop-lab-fuera"' : ''}><td>${esc(g.clave)}${fuera && g.fueraDeSalas ? ' <span class="mop-nota">fuera de las salas</span>' : ''}</td>
      <td class="r">${nf(g.muestras)}</td>${celdas(g.patogenos)}</tr>`).join('')}</tbody></table></div>`;
  // 0q·6 · la tendencia es de UN patógeno: el escogido en la tabla de prevalencia (por defecto, el más prevalente).
  const prev = (k) => b.total[k].positivos / b.total[k].analizadas;
  const bioSel = (pats.find((x) => x.key === vOp.bioPat) || [...pats].sort((a, c) => prev(c.key) - prev(a.key))[0] || {}).key || '';
  const bioEtq = (pats.find((x) => x.key === bioSel) || {}).etiqueta || bioSel;
  const semanas = bioSel ? tendenciaDePatogeno(b.filas, bioSel) : [];
  if (semanas.length) _labTend = { key: bioSel, etiqueta: bioEtq, semanas };
  return `
    ${barra}
    <p class="mop-lab-kpi"><b>${nf(b.muestras)}</b> muestras de reproductores en ${esc(cuandoLab())} <span class="mop-nota">positivos ÷ analizados · pulsa un patógeno para su tendencia</span></p>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lab-prev"><thead><tr><th>Patógeno</th><th class="r">Analizadas</th><th class="r">Positivos</th><th class="r">Prevalencia</th><th></th></tr></thead>
      <tbody>${pats.map(({ key, etiqueta }) => { const x = b.total[key]; return `<tr class="mop-micpat${key === bioSel ? ' is-on' : ''}" role="button" tabindex="0" aria-pressed="${key === bioSel}" data-mop-biopat="${esc(key)}"><td>${esc(etiqueta)}</td><td class="r">${nf(x.analizadas)}</td><td class="r">${nf(x.positivos)}</td>
        <td class="r">${pctTxt(x.positivos, x.analizadas)}</td><td>${barraPct(pct(x.positivos, x.analizadas))}</td></tr>`; }).join('')}</tbody></table></div>
    ${labNotas(b)}
    <h5 class="mop-lab-h5">Por lote <span class="mop-nota">el color, del % de positivos</span></h5>${tablaLotesBiomol(b.porLote, pats)}
    ${tejidosBiomolHTML(b.tejidos)}
    <h5 class="mop-lab-h5">Por sala</h5>${tabla('Sala', b.porSala, true)}
    <h5 class="mop-lab-h5">Por piscina de origen</h5>${tabla('Piscina', b.porPiscina, false)}
    <h5 class="mop-lab-h5">Por sexo</h5>${tabla('Sexo', b.porSexo, false)}
    ${_labTend ? `<h5 class="mop-lab-h5">Tendencia semanal · ${esc(_labTend.etiqueta)} · % de positivos y muestras analizadas</h5><div class="mc-chart" style="height:240px"><canvas id="mopLabTend"></canvas></div>
      <p class="mc-note">Las barras, cuántas muestras se analizaron cada semana (eje de la derecha); la línea, qué % salió positivo. Un punto hueco es una semana de menos de ${POCAS_MUESTRAS} muestras: su % se mueve mucho con una sola.</p>` : ''}
    <h5 class="mop-lab-h5">Positivos${b.positivos.length === 20 ? ' · los 20 últimos' : ''}</h5>
    ${b.positivos.length ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-lab-posit"><thead><tr><th>Fecha</th><th>Lugar · tanque</th><th>Piscina</th><th>Sexo</th><th>Positivo a</th></tr></thead>
      <tbody>${b.positivos.map((x) => `<tr><td>${esc(dma(x.fecha))}</td><td>${esc([x.lugar, x.tanque].filter(Boolean).join(' · '))}</td><td>${esc(x.piscina || '—')}</td><td>${esc(x.sexo || '—')}</td><td>${esc(x.patogenos.join(', '))}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Ningún positivo con estos filtros.</p>'}`;
}

/** La sub-vista 🦠 o 🧬 (2 · antes, un modal encima de cualquier sub-vista). 0q·6 · con sus filtros, no los del tablero. */
function labPanelHTML() {
  return `<div class="mc-body"><div class="mc-card" data-mop-lab-panel data-mop-lab-tipo="${esc(vOp.sub)}">
    ${LAB[vOp.sub]()}
  </div></div>`;
}
const COLOR_BIOMOL = { IHHNV: '#ef4444', WSSV: '#f59e0b', BP: '#a78bfa', AHPND: '#38bdf8', NHPB: '#14b8a6', EHP: '#ec4899' };   // los de su vista
/* 0q·6 · la prevalencia POR LOTE: lote × patógeno, cada celda sombreada por su % (clases mop-bio-p0…p4). */
/** Una semana con menos muestras que esto se marca: su % se mueve mucho con una sola. */
const POCAS_MUESTRAS = 5;
const tonoPct = (p) => (p === '' ? '' : p === 0 ? 'mop-bio-p0' : p < 10 ? 'mop-bio-p1' : p < 25 ? 'mop-bio-p2' : p < 50 ? 'mop-bio-p3' : 'mop-bio-p4');
/* 0q·7 (2026-09-27, usuario) · Maduración POR TIPO DE MUESTRA: la tabla tipo × patógeno (los cinco tipos; el que aún no
   tiene muestras, dicho) y la franja semanal de los tipos con muestras. Los datos, de biomolecular/tejidos.js. */
function tejidosBiomolHTML(t) {
  const cab = '<h5 class="mop-lab-h5">Por tipo de muestra <span class="mop-nota">Maduración · el tipo, de «Otros»</span></h5>';
  if (!t || !t.matriz.some((x) => x.muestras)) return `${cab}<p class="muted">Aún no hay muestras de Heces, Branquias, Pleópodo, Agua ni Hisopado con estos filtros.</p>`;
  const diag = (x, key) => x.celdas.find((c) => c.diag === key);
  const pats = BIOMOL_PATOGENOS.filter(({ key }) => t.matriz.some((x) => diag(x, key).analizadas));
  const celda = (c) => (c.analizadas ? `<td class="r ${tonoPct(pct(c.positivos, c.analizadas))}" title="${nf(c.positivos)} de ${nf(c.analizadas)} (${pctTxt(c.positivos, c.analizadas)})">${nf(c.positivos)}/${nf(c.analizadas)}</td>` : '<td class="r"><span class="muted">—</span></td>');
  const fila = (x) => (x.muestras
    ? `<tr><td>${esc(x.etiqueta)}</td><td class="r">${nf(x.muestras)}</td>${pats.map(({ key }) => celda(diag(x, key))).join('')}</tr>`
    : `<tr class="mop-bio-vacio"><td>${esc(x.etiqueta)}</td><td class="r"><span class="muted">—</span></td><td colspan="${pats.length}"><span class="muted">aún sin muestras</span></td></tr>`);
  const tipos = t.franja.filas.filter((f) => f.porSemana.some((w) => w.muestras));
  const semana = (w) => (w.muestras ? nf(w.muestras) + (w.positivas ? ` · <b>${nf(w.positivas)} +</b>` : '') : '<span class="muted">—</span>');
  return `${cab}<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-bio-tejidos">
    <thead><tr><th>Tipo de muestra</th><th class="r">Muestras</th>${pats.map((x) => `<th class="r">${esc(x.etiqueta)}</th>`).join('')}</tr></thead>
    <tbody>${t.matriz.map(fila).join('')}</tbody></table></div>
    <p class="mc-note">Positivos ÷ analizados de cada tejido; el color, su %. Aquí cuenta también la muestra de Maduración que no está marcada «Reproductores» (el agua o un hisopado de una sala).</p>
    <h5 class="mop-lab-h5">Tipo de muestra · por semana <span class="mop-nota">muestras · positivas a algún patógeno</span></h5>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-bio-franja">
      <thead><tr><th>Semana</th>${tipos.map((f) => `<th class="r">${esc(f.etiqueta)}</th>`).join('')}</tr></thead>
      <tbody>${t.franja.semanas.map((s, i) => `<tr><td>${esc(dm(s))}</td>${tipos.map((f) => `<td class="r">${semana(f.porSemana[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function tablaLotesBiomol(lotes, pats) {
  const celda = (x) => (x.analizadas ? `<td class="r ${tonoPct(pct(x.positivos, x.analizadas))}" title="${nf(x.positivos)} de ${nf(x.analizadas)} (${pctTxt(x.positivos, x.analizadas)})">${nf(x.positivos)}/${nf(x.analizadas)}</td>` : '<td class="r"><span class="muted">—</span></td>');
  return `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-bio-lotes">
    <thead><tr><th>Lote</th><th class="r">Muestras</th>${pats.map((x) => `<th class="r">${esc(x.etiqueta)}</th>`).join('')}</tr></thead>
    <tbody>${lotes.map((l) => `<tr><td>${esc(l.clave)}</td><td class="r">${nf(l.muestras)}</td>${pats.map(({ key }) => celda(l.patogenos[key])).join('')}</tr>`).join('')}</tbody></table></div>`;
}
/** 0q·6 · la tendencia de UN patógeno: las muestras analizadas cada semana (barras, eje de la derecha) y su % de positivos
 *  (línea; hueca la semana de pocas muestras, sin punto la semana sin ninguna). */
function dibujarLab() {
  const E = ejesOp();
  if (!_labTend || !document.getElementById('mopLabTend')) return;
  const w = _labTend.semanas;
  const color = COLOR_BIOMOL[_labTend.key] || '#546e7a';
  const pocas = (x) => x.analizadas > 0 && x.analizadas < POCAS_MUESTRAS;
  const globoPct = (c) => {
    const x = w[c.dataIndex];
    return '% positivos: ' + (c.raw === null ? '—' : nf(c.raw, 1) + ' %') + ' (' + nf(x.positivos) + ' de ' + nf(x.analizadas) + ')' + (pocas(x) ? ' · pocas muestras' : '');
  };
  graficoOp('mopLabTend', {
    type: 'bar',
    data: {
      labels: w.map((x) => dm(x.lunes)),
      datasets: [
        { type: 'bar', label: 'Muestras analizadas', data: w.map((x) => x.analizadas), backgroundColor: '#cfd8dc', yAxisID: 'y2', order: 1,
          tooltip: { callbacks: { label: (c) => 'Muestras analizadas: ' + nf(c.raw) } } },
        { type: 'line', label: '% positivos', data: w.map((x) => x.pct), borderColor: color, backgroundColor: color, tension: 0, borderWidth: 2,
          spanGaps: false, yAxisID: 'y', pointRadius: 3.5, pointBorderColor: color, pointBorderWidth: 2,
          pointBackgroundColor: w.map((x) => (pocas(x) ? 'transparent' : color)), tooltip: { callbacks: { label: globoPct } } },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { ticks: { ...E.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { beginAtZero: true, max: 100, ticks: E.tick, grid: { color: E.grid }, title: E.titulo('% positivos') },
        y2: { beginAtZero: true, position: 'right', ticks: { ...E.tick, precision: 0 }, grid: { display: false }, title: E.titulo('muestras') } },
      plugins: { legend: { labels: E.leyenda } },
    },
  });
}
/* 0r·3b (2026-09-28, usuario) · «la ventana congela»: con 🦠 o 🧬 a la vista, lo que se pulsa en ellas es SUYO. Se rehace
   SÓLO su contenido —ni la cabecera ni la sub-nav, que se quedan con su foco y su desplazamiento—, soltando antes sus
   gráficos y dibujándolos otra vez. Si no está a la vista, o se pasa a OTRA sub-vista, false: la vista entera. Medido:
   rehacer el tablero entero costaba 60–100 ms más por clic en un equipo de campo. 2 (2026-09-29) · ya no es una ventana
   sino su sub-vista: sin barra del tablero (`PROPIOS`), nada de fuera cambia con lo que se pulsa dentro. */
const LIENZOS_LAB = ['mopLabTend', 'mopMicPat', 'mopAguaPat', 'mopCalPar'];
function repintarPanelLab(root) {
  const panel = root.querySelector('[data-mop-lab-panel]');
  if (!panel || !LAB[vOp.sub] || panel.dataset.mopLabTipo !== vOp.sub) return false;
  LIENZOS_LAB.forEach((id) => destroyChart(id));
  panel.innerHTML = LAB[vOp.sub]();
  trasPintarLab(root);   // la tendencia de Biomol
  dibujarMicPat();       // y las cantidades, el agua y el parámetro de 🦠
  return true;
}
/** Tras pintar: la tendencia de 🧬, si está a la vista, y la vista que repintar cuando llegue Biomol. */
function trasPintarLab(root) {
  _labRoot = root;
  dibujarLab();
}

/* 0f · 5 (2026-09-25, usuario) · el gráfico de la tarjeta de KPI abierta, DEBAJO de las tarjetas. Sale de
   operativo.kpis.js con las mismas reglas que la cifra de la tarjeta (su último punto es esa cifra); Salas no es una
   curva sino la tabla registrado/propuesto. `_kpiGraf` guarda lo que se dibuja tras pintar, como `_cuarCurva`. */
let _kpiGraf = null;
function kpiPanelHTML(M, memo, p, F) {
  _kpiGraf = null;
  const k = KPIS_CON_GRAFICO.find((x) => x.clave === vOp.kpiSel);
  if (!k) { vOp.kpiSel = ''; return ''; }
  const g = graficoDeKpi(k.clave, { M, serie: serieDe(memo, p), partes: memo.partes, periodo: p, F });
  const cuando = k.clave === 'salas' || k.clave === 'ocupacion' ? 'al cierre de la foto ' + dma(M.fecha)
    : k.clave === 'biomasa' ? 'vivos de la foto · pesos de ' + etiquetaPeriodo(p) : etiquetaPeriodo(p);
  let cuerpo;
  if (!g.aplica) cuerpo = `<p class="muted" style="margin:4px 0">${esc(g.nota)}</p>`;
  else if (g.tipo === 'tabla') cuerpo = salasKpiHTML(g.filas);
  else {
    _kpiGraf = g;
    cuerpo = '<div class="mc-chart" style="height:240px"><canvas id="mopKpiCurva"></canvas></div>';
  }
  const notas = [];
  if (g.aplica && k.clave === 'mortalidad') {
    notas.push(g.unidad === '%' ? 'Tasa del día = muertos ÷ animales en riesgo (la regla del ⚖️ Saldo); la acumulada cuenta desde la víspera del período.'
      : 'Con sala o tanque: las muertes REGISTRADAS en la hoja Tanques, de todos sus lotes.');
  }
  if (g.aplica && g.ignora && g.ignora.length) notas.push('Un desove es de su lote y código genético, no de una sala: el filtro de sala no se aplica.');
  return `<div class="mop-lienzo mop-kpi-lienzo">
    <div class="mop-lienzo-h"><b>${esc(k.titulo)}</b> <span class="mop-nota">${esc(cuando)}</span>
      <button type="button" class="mc-pill mop-lienzo-x" data-mop-kpi-cerrar aria-label="Cerrar el gráfico">✕</button></div>
    ${cuerpo}${notas.map((n) => `<p class="mc-note">${esc(n)}</p>`).join('')}
  </div>`;
}
/** 0f · 5 · Salas: sala por sala, lo registrado en la hoja frente a lo que propone el libro. */
function salasKpiHTML(filas) {
  const sit = { coinciden: '<span class="mop-igual">✓</span> coinciden', difieren: '<span class="mop-dif">⚠</span> difieren',
    'sin-registro': '<span class="muted">sin registro en la hoja</span>', 'sin-propuesta': '<span class="muted">sin propuesta</span>' };
  return `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-kpi-salas">
    <thead><tr><th>Sala</th><th>Registrado</th><th>Propuesto</th><th></th></tr></thead>
    <tbody>${filas.map((f) => `<tr class="${f.situacion === 'difieren' ? 'mop-difieren' : ''}" data-situacion="${esc(f.situacion)}">
      <td>${esc(f.sala)}</td><td>${f.registrado ? esc(f.registrado) : '—'}</td><td>${f.propuesto ? esc(f.propuesto) : '—'}</td><td>${sit[f.situacion] || ''}</td></tr>`).join('')}</tbody>
  </table></div>`;
}
const COLOR_KPI = { hembras: '#d81b60', machos: '#1e88e5', total: '#455a64', cuarentena: '#f9a825', produccion: '#43a047', mixto: '#8e24aa',
  otros: '#b0bec5', ocupados: '#00897b', libres: '#cfd8dc', dia: '#e0533b', acumulada: '#b71c1c',
  desoves: '#0f7c9a', n5: '#3949ab' };
/** 0f · 5 · dibuja el gráfico de la tarjeta abierta: líneas, barras apiladas, o barras con una línea en su propio eje. */
function dibujarKpi(g) {
  const E = ejesOp();
  if (!g || !g.etiquetas.length || !document.getElementById('mopKpiCurva')) return;
  const labels = g.etiquetas.map((e) => (esIso(e) ? dm(e) : e));
  const col = (s) => COLOR_KPI[s.clave] || '#546e7a';
  const titulo = E.titulo;
  const x = { ticks: { ...E.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } };
  let datasets;
  let scales;
  if (g.tipo === 'lineas') {
    datasets = g.series.map((s) => ({ type: 'line', label: s.etiqueta, data: s.datos, borderColor: col(s), backgroundColor: col(s),
      tension: 0, borderWidth: s.clave === 'total' ? 2.5 : 2, pointRadius: 0 }));
    scales = { x, y: { beginAtZero: true, ticks: E.tick, grid: { color: E.grid } } };
  } else if (g.tipo === 'barrasApiladas') {
    datasets = g.series.map((s) => ({ type: 'bar', label: s.etiqueta, data: s.datos, backgroundColor: col(s), stack: 'kpi' }));
    scales = { x: { ...x, stacked: true },
      y: { stacked: true, beginAtZero: true, ticks: g.unidad === 'kg' ? E.tick : { ...E.tick, precision: 0 }, grid: { color: E.grid }, ...(g.unidad ? { title: titulo(g.unidad) } : {}) } };
  } else {
    const [b, l] = g.series;
    datasets = [
      { type: 'bar', label: b.etiqueta, data: b.datos, backgroundColor: col(b), yAxisID: 'y', order: 1 },   // 0q·1 · sólida: la línea va encima
      // Recta (sin suavizar): son cifras de CADA día y una curva suavizada inventaría valores entre ellos, bajo el cero incluso.
      { type: 'line', label: l.etiqueta, data: l.datos, borderColor: col(l), backgroundColor: col(l), tension: 0, borderWidth: 2, pointRadius: 0, spanGaps: true, yAxisID: 'y2' },
    ];
    scales = { x, y: { beginAtZero: true, ticks: E.tick, grid: { color: E.grid }, title: titulo(b.etiqueta) },
      y2: { beginAtZero: true, position: 'right', ticks: E.tick, grid: { display: false }, title: titulo(l.etiqueta) } };
  }
  graficoOp('mopKpiCurva', {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales,
      plugins: { legend: { labels: E.leyenda } },
    },
  });
}

/* 0f · 4 · la curva de la cuarentena abierta, para dibujarla tras pintar (el lienzo tiene que estar en el DOM). */
let _cuarCurva = null;
/** 0f · 4 · los pares lote·sala de ⏳ y, si hay uno abierto, su curva. Un par que ya no está (otro filtro, otra foto)
 *  suelta su selección, como la ficha de un lote. */
function cuarentenaDe(M, memo, p, F) {
  const lista = cuarentenasDeLotes(M.libro, M.fecha, p, F);
  if (vOp.cuarSel && !lista.some((x) => x.lote + '|' + x.sala === vOp.cuarSel)) vOp.cuarSel = '';
  const sel = lista.find((x) => x.lote + '|' + x.sala === vOp.cuarSel) || null;
  _cuarCurva = sel ? { par: sel, ...curvaDeCuarentena(serieDelCiclo(memo, { desde: sel.ingreso, hasta: sel.hasta }), sel.lote, sel.sala, sel.ingreso, sel.hasta) } : null;
  return { lista, sel };
}

/** La ficha de un tanque en palabras: la usan el globo del ratón y el panel que se abre al pulsarlo. */
function textoTanque(t) {
  const base = `${t.sala} · tanque ${t.tanque}${t.fueraDeCatalogo ? ' (fuera del catálogo de la sala)' : ''}`;
  if (!t.vivos) return base + ' — vacío';
  const lotes = t.lotes.map((l) => `${l.lote} (${l.estado || 'sin estado'}${l.codigos.length ? ', ' + l.codigos.join('/') : ''})`).join(' · ');
  return `${base} — ${lotes} · ♀ ${nf(t.hembras)} ♂ ${nf(t.machos)} · H:M ${nf(t.hm, 2)} · ${t.densidad === '' ? 'densidad: sin área conocida' : 'densidad ' + nf(t.densidad, 2) + ' /m²'}`;
}

/** 0f · 3 · la curva de vivos del lienzo: una línea en SVG, sin Chart.js (es un vistazo, no un gráfico que leer). */
function curvaSVG(curva) {
  const v = (curva || []).map((d) => d.total);
  if (v.length < 2) return '';
  const max = Math.max(...v);
  const min = Math.min(...v);
  const W = 160;
  const H = 30;
  const x = (i) => 1 + (i * (W - 2)) / (v.length - 1);
  const y = (n) => (max === min ? H / 2 : H - 2 - ((n - min) * (H - 4)) / (max - min));
  const puntos = v.map((n, i) => x(i).toFixed(1) + ',' + y(n).toFixed(1)).join(' ');
  return `<span class="mop-lienzo-curva">vivos ${nf(v[0])} → ${nf(v[v.length - 1])}
    <svg class="mop-curva" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Vivos del tanque en el período: de ${nf(v[0])} a ${nf(v[v.length - 1])}">
      <polyline points="${puntos}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span>`;
}

/** 0f · 3 · el LIENZO del tanque pulsado (diseño aprobado: un panel bajo el mapa, sin repintar la vista). */
function lienzoHTML(r, t) {
  const k = r.sala + '|' + r.tanque;
  const p = _ctxMapa.p;
  const cabecera = `<div class="mop-lienzo-h"><b>${esc(r.sala)} · tanque ${esc(r.tanque)}</b>${r.fueraDeCatalogo ? ' <span class="mop-nota">fuera del catálogo de la sala</span>' : ''}
    <button class="mc-mini mop-lienzo-x" data-mop-tq-cerrar aria-label="Cerrar el resumen del tanque">✕</button></div>`;
  const lotes = r.vacio ? `<p class="muted mop-lienzo-p">Vacío al cierre del ${esc(dma(_mapaFecha()))}.</p>`
    : `<ul class="mop-lienzo-lotes">${r.lotes.map((l) => `<li><b>${esc(l.lote)}</b> · ${esc(l.codigos.join('/') || 'sin código')}
        · <span class="mop-chip is-e-${claseEstado(l.estado)}">${esc(l.estado || 'sin estado')}${l.dias === '' ? '' : ' ' + nf(l.dias) + ' d'}</span>
        · ♀ ${nf(l.hembras)} ♂ ${nf(l.machos)}</li>`).join('')}</ul>
      <p class="mop-lienzo-p">♀ ${nf(r.vivos.hembras)} · ♂ ${nf(r.vivos.machos)} · H:M ${nf(r.hm, 2)} ${dot(r.hmEstado, refUmbral('proporcionHM'))}
        · ${r.densidad === '' ? 'densidad: sin área conocida' : 'densidad ' + nf(r.densidad, 2) + ' /m² ' + dot(r.densidadEstado, refUmbral('densidad'))}
        · ${r.cargaMetrica === '' ? 'carga: sin peso registrado' : 'carga ' + nf(r.cargaMetrica, 2) + ' g/m²'}</p>`;
  const a = r.periodo;
  /* Los dos datos IMPOSIBLES de los partes se DICEN, no se esconden ni se corrigen (decisión del usuario, 2026-09-25). */
  const imposible = typeof a.pctCopulas === 'number' && a.pctCopulas > 100 ? ' ⚠ más cópulas que hembras' : '';
  const sinHembras = a.copulasSinHembras ? ` · ⚠ ${nf(a.copulasSinHembras)} cópulas en días sin hembras en el libro` : '';
  const partes = `<p class="mop-lienzo-p"><b>${esc(etiquetaPeriodo(p))}:</b> ${a.diasConParte ? `${nf(a.bajas)} bajas · ${nf(a.descartes)} descartes · ${nf(a.copulas)} cópulas${a.pctCopulas === '' ? '' : ' (' + pc(a.pctCopulas) + imposible + ')'}${sinHembras} · ${nf(a.diasConParte)} día(s) con parte`
    : 'sin partes en el período'} · último parte ${r.ultimoParte ? esc(dma(r.ultimoParte)) : '—'}</p>`;
  const botones = `<div class="mop-lienzo-b"><button class="mc-mini" data-mop-filtrar-tq="${esc(k)}">Filtrar por este tanque</button>${!r.vacio && t.enFiltro
    ? ` <button class="mc-mini" data-mop-abrir-tq="${esc(k)}">🛢 Abrir en Tanques</button>` : ''}</div>`;
  return `<div class="mop-lienzo" role="region" aria-label="${esc('Resumen del tanque ' + r.tanque + ' de ' + r.sala)}">
    ${cabecera}${lotes}${partes}${r.vacio ? '' : curvaSVG(r.curva)}${botones}</div>`;
}
const _mapaFecha = () => (_ctxMapa && _ctxMapa.ctx.fecha) || '';

function infoTanqueHTML(mapa) {
  if (!vOp.tanqueSel || !mapa) return '<span class="muted">Pulsa un tanque para ver su resumen: lotes, ♀/♂, densidad, sus partes y su curva de vivos.</span>';
  const i = vOp.tanqueSel.lastIndexOf('|');
  const sala = vOp.tanqueSel.slice(0, i);
  const n = vOp.tanqueSel.slice(i + 1);
  const t = ((mapa.salas.find((s) => s.sala === sala) || {}).tanques || []).find((x) => String(x.tanque) === n);
  if (!t) return '';
  if (!_ctxMapa) return `<b>${esc(textoTanque(t))}</b> <button class="mc-mini" data-mop-filtrar-tq="${esc(vOp.tanqueSel)}">Filtrar por este tanque</button>`;
  return lienzoHTML(resumenDeTanque(t, _ctxMapa.ctx, _ctxMapa.serie, _ctxMapa.partes, _ctxMapa.p), t);
}

function mapaHTML(mapa, M, F) {
  const modo = MODOS_MAPA.some((x) => x.clave === vOp.color) ? vOp.color : 'estado';
  const filtrado = hayFiltro(F);
  const ocup = new Map((M.salas || []).map((s) => [s.sala, s.propuesto]));
  /* 0f · 3 · los ocho colores nuevos los decide operativo.mapa.js; los tres de siempre, aquí como siempre. */
  const nuevo = !['estado', 'densidad', 'vivos'].includes(modo) && _ctxMapa ? (t) => colorDeTanque(t, modo, _ctxMapa.ctx) : null;
  const celda = (t) => {
    const k = t.sala + '|' + t.tanque;
    const cls = ['mop-tq'];
    const c = nuevo ? nuevo(t) : null;
    if (modo === 'estado') cls.push('is-e-' + claseEstado(t.estado));
    else if (modo === 'densidad') cls.push('is-d-' + (!t.vivos ? 'vacio' : t.densidadEstado || 'sin'));
    else if (c) cls.push(c.clase);
    else cls.push(t.vivos ? 'is-v' : 'is-v0');
    if (filtrado && !t.enFiltro) cls.push('is-dim');
    if (t.fueraDeCatalogo) cls.push('is-extra');
    if (vOp.tanqueSel === k) cls.push('is-sel');
    const intensidad = c ? (c.estilo ? ` style="${esc(c.estilo)}"` : '')
      : modo === 'vivos' && t.vivos ? ` style="--mop-i:${Math.round(15 + (85 * t.vivos) / Math.max(1, mapa.maxVivos))}%"` : '';
    const texto = textoTanque(t) + (c && t.vivos && c.texto ? ' · ' + c.texto : '');
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
  } else if (nuevo) {
    leyenda = leyendaDelMapa(mapa, modo, _ctxMapa.ctx).map((x) => `<span class="mc-lg"><i class="mop-sw ${x.clase}"${x.estilo ? ` style="${esc(x.estilo)}"` : ''}></i>${esc(x.etiqueta)}${x.n === '' ? '' : ` <b>${nf(x.n)}</b>`}</span>`).join('');
  } else {
    leyenda = `<span class="mc-lg"><i class="mop-sw is-v" style="--mop-i:20%"></i>pocos</span>
      <span class="mc-lg"><i class="mop-sw is-v" style="--mop-i:100%"></i>el más poblado: <b>${nf(mapa.maxVivos)}</b> vivos</span>`;
  }
  /* 0f · 3 · once colores en tres grupos (del lote, del tanque, de los partes), en su propia fila bajo el título. */
  const boton = (x) => `<button class="mc-seg-b ${x.clave === modo ? 'is-on' : ''}" data-mop-color="${x.clave}" aria-pressed="${x.clave === modo}">${esc(x.etiqueta)}</button>`;
  const botones = GRUPOS_MAPA.map((g) => `<span class="mop-colores-g"><span class="mop-nota">${esc(g.etiqueta)}</span>
      <span class="mc-seg mc-seg-sm" role="group" aria-label="${esc('Color del mapa · ' + g.etiqueta)}">${MODOS_MAPA.filter((x) => x.grupo === g.grupo).map(boton).join('')}</span></span>`).join('');
  return `<div class="mc-card mc-card-wide mop-mapa-card">
    <h4 class="mc-card-h">🗺️ Mapa de planta <span class="mc-h-note">al cierre del ${esc(dma(M.fecha))}${filtrado ? ' · resaltado lo filtrado' : ''}</span></h4>
    <div class="mop-colores">${botones}</div>
    <div class="mop-mapa">${salas}</div>
    <div class="mc-legend">${leyenda}</div>
    <div class="mop-tq-info" aria-live="polite">${infoTanqueHTML(mapa)}</div>
  </div>`;
}

/* 📉 ⏳ 0f · 2b (2026-09-25) · un cambio se enseña con su signo, el menos tipográfico y sin decimales («−33 %»);
   cada parámetro de reproducción, con su formato. */
const cambioTxt = (c) => (c > 0 ? '+' : '−') + nf(Math.abs(c)) + ' %';
const ETIQUETA_PARAMETRO = Object.fromEntries(PARAMETROS_REPRODUCCION.map((x) => [x.id, x.etiqueta]));
const valorParametro = (id, v) => (id === 'huevosPorDesove' ? nf(v) : pc(v));
const frenteA = (pa) => (pa.dias === 1 ? `la víspera (${dm(pa.desde)})` : `los ${nf(pa.dias)} días anteriores (${dm(pa.desde)} – ${dm(pa.hasta)})`);

function tendenciasItems(t) {
  const items = [];
  const n = t.nauplios;
  if (n) {
    /* Si baja el conjunto, los lotes que bajan van con su % (como en el diseño aprobado: «… (−33 %) · XA, XB»); si
       sólo bajan algunos lotes, con sus cifras, que son lo único que se enseña. */
    items.push(n.cambio !== null
      ? `<li>🦐 <b>N5 por desove</b>: ${nf(n.antes)} → ${nf(n.ahora)} (${cambioTxt(n.cambio)})${n.lotes.length
        ? ' · bajan ' + n.lotes.map((l) => `${esc(l.lote)} (${cambioTxt(l.cambio)})`).join(', ') : ''}.</li>`
      : `<li>🦐 <b>N5 por desove</b>: baja en ${n.lotes.map((l) => `${esc(l.lote)} ${nf(l.antes)} → ${nf(l.ahora)} (${cambioTxt(l.cambio)})`).join(' · ')}.</li>`);
  }
  for (const s of t.produccion) items.push(`<li>🥚 <b>${esc(s.sala)}</b> produce menos: ${nf(s.antes)} → ${nf(s.ahora)} desoves (${cambioTxt(s.cambio)}).</li>`);
  for (const s of t.mortalidad) {
    items.push(`<li>💀 Más mortalidad en <b>${esc(s.sala)}</b>: ${nf(s.antes, 2)} → ${nf(s.ahora, 2)} bajas por tanque y día (${cambioTxt(s.cambio)}).</li>`);
  }
  for (const l of t.reproduccion) {
    const ps = l.parametros.map((x) => `${esc(ETIQUETA_PARAMETRO[x.id])} ${valorParametro(x.id, x.antes)} → ${valorParametro(x.id, x.ahora)} (${cambioTxt(x.cambio)})`);
    items.push(`<li>🧬 <b>${esc(l.lote)}</b>: ${ps.join(' · ')}.</li>`);
  }
  return items;
}

function permanenciaItems(perm) {
  return perm.map((l) => {
    const donde = l.salas.length === 1 ? esc(l.salas[0].sala) : l.salas.map((s) => `${esc(s.sala)} (${nf(s.dias)} d)`).join(', ');
    const origen = [l.piscinas.length ? 'piscina ' + l.piscinas.map(esc).join(', ') : 'sin piscina en su Ingreso',
      l.codigos.length ? 'código ' + l.codigos.map(esc).join(', ') : ''].filter(Boolean).join(' · ');
    return `<li>⏳ <b>${esc(l.lote)}</b> lleva ${nf(l.dias)} días en producción en ${donde} · ${origen}.</li>`;
  });
}

function alertasHTML(a, p, t, perm) {
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
  const U = UMBRALES_DE_AVISO;
  if (t.anterior) {
    notas.push(`Tendencias: frente a ${esc(frenteA(t.anterior))}, con un cambio del ${nf(U.cambio.valor)} % o más y al menos ${nf(U.registros.valor)} registros; las bajas, por tanque y día de parte.`);
  }
  notas.push(`Permanencia: más de ${nf(U.produccion.valor)} días en producción, desde el fin de la cuarentena.`);
  const titulo = Object.values(FUENTES).join('\n');
  const tend = tendenciasItems(t);
  const perms = permanenciaItems(perm);
  const total = a.total + t.total + perm.length;
  return `<div class="mc-card mop-alertas">
    <h4 class="mc-card-h">⚠️ Alertas <span class="mc-h-note">${esc(etiquetaPeriodo(p))} · ${nf(total)}</span></h4>
    ${items.length ? `<ul class="mop-lista">${items.join('')}</ul>` : ''}
    ${tend.length ? `<h5 class="mop-h5">📉 Tendencias <span class="mop-nota">${esc(etiquetaPeriodo(p))} frente a ${esc(frenteA(t.anterior))}</span></h5>
    <ul class="mop-lista mop-tendencias">${tend.join('')}</ul>` : ''}
    ${perms.length ? `<h5 class="mop-h5">⏳ Permanencia <span class="mop-nota">más de ${nf(U.produccion.valor)} días en producción</span></h5>
    <ul class="mop-lista mop-permanencia">${perms.join('')}</ul>` : ''}
    ${items.length || tend.length || perms.length ? '' : '<p class="mop-ok">✓ Sin alertas en el período.</p>'}
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

/* 0f · 4 (2026-09-25, usuario) · «⏳ Cuarentena por lote y sala» sustituye a la lista «⏳ Fin de cuarentena en 7 días»:
   una barra por par EN cuarentena (día X de 15 y su paso a Producción) y por cada uno que la TERMINÓ en el período; los
   que salen en los próximos días van resaltados —el aviso de antes—. Al pulsar una barra, debajo, sus curvas. */
function cuarentenaHTML({ lista, sel }, p) {
  const k = (x) => x.lote + '|' + x.sala;
  const texto = (x) => (x.terminada
    ? `✓ terminada el ${esc(dm(x.fin))}${x.porCopula ? ' (por una cópula)' : ''} · duró ${nf(x.dia)} d`
    : `día ${nf(x.dia)} de ${nf(x.total)} · pasa a Producción el ${esc(dm(x.fin))} (en ${nf(x.enDias)} d) · ♀ ${nf(x.hembras)} ♂ ${nf(x.machos)}`);
  const filas = lista.map((x) => `<li class="mop-cuar-fila${x.aviso ? ' is-aviso' : ''}${x.terminada ? ' is-term' : ''}${sel && k(sel) === k(x) ? ' is-on' : ''}"
      role="button" tabindex="0" aria-pressed="${!!(sel && k(sel) === k(x))}" data-mop-cuar="${esc(k(x))}">
      <span class="mop-cuar-n"><b>${esc(x.lote)}</b> · ${esc(x.sala)}</span>
      <span class="mop-bar" aria-hidden="true"><i style="width:${Math.round((Math.min(x.dia, x.total) / x.total) * 100)}%"></i></span>
      <span class="mop-cuar-t">${texto(x)}${x.aviso ? ' ⏳' : ''}</span></li>`).join('');
  const lienzo = sel && _cuarCurva ? `<div class="mop-lienzo mop-cuar-lienzo">
      <div class="mop-lienzo-h"><b>${esc(sel.lote)} · ${esc(sel.sala)}</b>
        <span class="mop-nota">del ingreso ${esc(dma(sel.ingreso))} ${sel.terminada ? 'a su fin ' + esc(dma(sel.fin)) : 'a la foto'}</span>
        <button type="button" class="mc-pill mop-lienzo-x" data-mop-cuar-cerrar aria-label="Cerrar">✕</button></div>
      <div class="mc-chart" style="height:220px"><canvas id="mopCuarCurva"></canvas></div>
      ${_cuarCurva.variasSalas ? '<p class="mc-note">⚠ Este lote también tenía animales en otra sala: el libro lleva las bajas por lote, así que las barras son las del lote entero; los vivos sí son los de esta sala.</p>' : ''}
    </div>` : '';
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">⏳ Cuarentena por lote y sala <span class="mc-h-note">la cuarentena es de cada sala · resaltados: salen en ${nf(AVISO_CUARENTENA_DIAS)} días o menos</span></h4>
    ${lista.length ? `<ul class="mop-cuar">${filas}</ul>${lienzo}`
    : `<p class="muted" style="margin:4px 0">Ningún lote en cuarentena ni que la haya terminado en ${esc(etiquetaPeriodo(p))}.</p>`}
  </div>`;
}

/** 0f · 4 · las curvas de una cuarentena: vivos ♀ y ♂ de ese lote en esa sala (líneas) y las bajas del día (barras, eje
 *  propio a la derecha: son decenas donde los vivos son cientos). */
function dibujarCuarentena(c) {
  const E = ejesOp();
  if (!c || !c.dias.length || !document.getElementById('mopCuarCurva')) return;
  graficoOp('mopCuarCurva', {
    type: 'bar',
    data: {
      labels: c.dias.map((d) => dm(d.fecha)),
      datasets: [
        { type: 'line', label: '♀ Hembras', data: c.dias.map((d) => d.hembras), borderColor: '#d81b60', backgroundColor: '#d81b60', tension: 0, borderWidth: 2, pointRadius: 0, yAxisID: 'y' },
        { type: 'line', label: '♂ Machos', data: c.dias.map((d) => d.machos), borderColor: '#1e88e5', backgroundColor: '#1e88e5', tension: 0, borderWidth: 2, pointRadius: 0, yAxisID: 'y' },
        { type: 'bar', label: 'Bajas del día', data: c.dias.map((d) => d.bajas), backgroundColor: '#90a4ae', yAxisID: 'y2', order: 1 },   // las líneas, encima
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { x: { ticks: { ...E.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { beginAtZero: true, ticks: E.tick, grid: { color: E.grid }, title: E.titulo('vivos') },
        y2: { beginAtZero: true, position: 'right', ticks: { ...E.tick, precision: 0 }, grid: { display: false }, title: E.titulo('bajas') } },
      plugins: { legend: { labels: E.leyenda } },
    },
  });
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
    ${saldoLotesHTML(t.lotes)}
  </div>`;
}

/* 0f · 6 (2026-09-25, usuario) · en cada tarjeta, por lote, lo del Saldo al recalcular (del mismo resumen: nada se
   recalcula). Las cargas son de SUS tanques en esta sala: el promedio y, con más de uno, el rango; la mortalidad es la
   del lote entero, y con un asterisco si el lote está también en otra sala. Cada lote en un bloque de tres líneas y no
   en una tabla (decisión del usuario, 2026-09-25): con las cinco tarjetas en fila, una tabla de siete columnas sólo
   enseñaba cuatro y escondía cargas y biomasa tras un desplazamiento. `data-v` nombra cada cifra (para las pruebas). */
function saldoLotesHTML(lotes) {
  if (!lotes.length) return '';
  const carga = (c, unidad) => (vacio(c.prom) ? '—'
    : nf(c.prom, 2) + ' ' + unidad + (c.n > 1 ? `<span class="mop-nota"> (${nf(c.min, 2)}–${nf(c.max, 2)})</span>` : ''));
  const bloques = lotes.map((l) => {
    const s = l.saldo;
    return `<li class="mop-sc-lote" data-mop-sc-lote="${esc(l.lote)}">
      <div class="mop-sc-lote-h"><b>${esc(l.lote)}</b> · <span data-v="vivos">${nf(l.hembras)} ♀ / ${nf(l.machos)} ♂</span> · <span data-v="dias">${(diasTxt(l).trim()) || '—'}</span></div>
      <div title="${esc(s.fechaDia ? 'último día con parte: ' + dm(s.fechaDia) : 'sin partes')}">Mort. <span data-v="mort">${pc(s.mortAcum)} · día ${pc(s.mortDia)}${s.variasSalas ? ' *' : ''}</span></div>
      <div>Carga <span data-v="cvol">${carga(s.cargaVolumetrica, 'kg/m³')}</span> · <span data-v="cmet">${carga(s.cargaMetrica, 'g/m²')}</span>
        · Biomasa <span data-v="bio">${vacio(s.biomasa) ? '—' : nf(s.biomasa, 2) + ' kg'}</span></div></li>`;
  }).join('');
  const nota = lotes.some((l) => l.saldo.variasSalas) ? '<p class="mop-nota">* Mortalidad del lote entero: también está en otra sala (el libro la lleva por lote).</p>' : '';
  return `<ul class="mop-sc-saldo">${bloques}</ul>${nota}`;
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

/* 3 (2026-09-29, usuario) · «en los gráficos de Temperatura por hora y oxígeno por hora, marcar un filtro para ambos para
   que siempre muestren la información del día»: el mapa de calor de 30 días salía con su barra de desplazamiento. Encima de
   los dos, Día | Período y ◀ día ▶ (por defecto, el de la foto). En «Día», la temperatura del día —cada toma del color de
   su estado, como el mapa— y su oxígeno, sobre el mismo eje de horas; sin lecturas ese día, se dice y cuál fue la última.
   «Período» es lo de antes. `_ambiente`, lo que dibuja `dibujarDetalle` (null en «Período»). */
let _ambiente = null;
function ambienteHTML(d, p) {
  const modoDia = vOp.ambModo !== 'periodo';
  const dias = d.calor.filas.map((f) => f.fecha);   // los del período, el más reciente primero
  if (!dias.includes(vOp.ambDia)) vOp.ambDia = '';
  const dia = vOp.ambDia || p.hasta;
  _ambiente = modoDia ? ambienteDelDia(d, dia) : null;
  const k = dias.indexOf(dia);
  const nav = (dir, iso, t, rot) => `<button type="button" class="mc-mini" data-mop-amb-dir="${dir}" data-mop-amb-ir="${esc(iso)}"${iso ? '' : ' disabled'} aria-label="${rot}">${t}</button>`;
  const ctl = `<div class="mop-det-ancho mop-amb-ctl">
      <div class="mc-seg mc-seg-sm" role="group" aria-label="Temperatura y oxígeno">${[['dia', 'Día'], ['periodo', 'Período']].map(([m, t]) => {
        const on = (m === 'dia') === modoDia;
        return `<button type="button" class="mc-seg-b ${on ? 'is-on' : ''}" data-mop-amb-modo="${m}" aria-pressed="${on}">${t}</button>`;
      }).join('')}</div>
      ${modoDia ? `<span class="mop-amb-dia">${nav('ant', dias[k + 1] || '', '◀', 'Día anterior')}<select class="mc-select" data-mop-amb-dia aria-label="Día">${dias.map((f) =>
        `<option value="${esc(f)}"${f === dia ? ' selected' : ''}>${esc(dma(f))}</option>`).join('')}</select>${nav('sig', k > 0 ? dias[k - 1] : '', '▶', 'Día siguiente')}</span>`
        : `<span class="mop-f-rango">${esc(dm(p.desde))} – ${esc(dm(p.hasta))} · ${nf(dias.length)} ${dias.length === 1 ? 'día' : 'días'}</span>`}
    </div>`;
  if (!_ambiente) return { ctl, dia: null };
  const A = _ambiente;
  const sin = (que, ultima) => `<div class="empty-state" style="padding:16px">Sin lecturas de ${que} el ${esc(dma(dia))}.${ultima
    ? ` La última, el ${esc(dma(ultima))}.${dias.includes(ultima) ? ` <button type="button" class="mc-mini" data-mop-amb-ir="${esc(ultima)}">Ver ese día</button>` : ''}` : ''}</div>`;
  return {
    ctl,
    dia: {
      temp: A.temp.some((v) => v !== null)
        ? `<div class="mc-chart" style="height:230px"><canvas id="mopTempDia"></canvas></div>
          <p class="mc-note">Cada toma, en verde dentro de ${esc(refUmbral('temperatura'))}; azul por debajo; rojo por encima.</p>`
        : sin('temperatura', A.ultimaTemp),
      ox: A.ox.some((v) => v !== null) ? '<div class="mc-chart" style="height:230px"><canvas id="mopOxDia"></canvas></div>' : sin('oxígeno', A.ultimaOx),
    },
  };
}

function detalleHTML(d, p, F) {
  const filtrado = hayFiltro(F);
  const amb = ambienteHTML(d, p);   // 3 · Día (por defecto) | Período
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
      ${amb.ctl}
      <div><h5 class="mop-det-h">🌡️ Temperatura por hora</h5>${amb.dia ? amb.dia.temp : calor}</div>
      <div><h5 class="mop-det-h">${amb.dia ? '💧 Oxígeno disuelto por hora' : '💧 Oxígeno disuelto (4 lecturas al día)'}</h5>${amb.dia ? amb.dia.ox : ox}</div>
      <div class="mop-det-ancho"><h5 class="mop-det-h">♀/♂ por tanque y densidad</h5><div class="mc-chart" style="height:250px"><canvas id="mopTq"></canvas></div></div>
      <div class="mop-det-ancho"><h5 class="mop-det-h">Tanques con animales</h5>${tabla}
        ${vacios.length ? `<p class="mc-note">Vacíos: ${vacios.map((n) => esc(n)).join(', ')}.</p>` : ''}</div>
      <div class="mop-det-ancho"><h5 class="mop-det-h">🧪 Tratamientos recientes</h5>${trat}</div>
    </div>
  </div>`;
}

/* 0q·1 (2026-09-27, usuario) · «borrosos, transparentosos, no se aprecian las cantidades de los ejes» (como en Microchips).
   Medido en Chrome: ejes, títulos y leyendas a 10 px en gris claro, rejilla al 16 %, barras al 55–60 % y curvas que
   inventaban valores entre días. Ahora: ejes a 12 px en el color de TEXTO del tema (se lee de --c-text al dibujar: claro u
   oscuro), títulos de eje a 11 px, leyendas a 12 px, rejilla al 30 %, barras sólidas y líneas rectas. */
function ejesOp() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, d) => cs.getPropertyValue(n).trim() || d;
  const texto = v('--c-text', '#1f2a30'), suave = v('--c-text-soft', '#546e7a');
  return {
    texto, tick: { color: texto, font: { size: 12 } },
    titulo: (text) => ({ display: true, text, color: suave, font: { size: 11, weight: '600' } }),
    grid: 'rgba(120,144,156,.3)',
    leyenda: { usePointStyle: true, boxWidth: 10, font: { size: 12 }, color: texto },
  };
}
/* 0q·2 (2026-09-27, usuario) · «al pasar por desoves o N5 se buggea». Medido en Chrome: el globo iba a la altura MEDIA de
   los elementos del día, saltaba ~100 px de un día al siguiente, cambiaba de lado su pico, tapaba el día leído y cada salto
   se animaba 400 ms, siempre detrás del ratón; el punto y el globo anteriores tardaban 400 ms en borrarse; cada filtro
   hacía crecer el gráfico desde cero durante 1 s; y `order` (0q·1) había dado la vuelta a la leyenda y al globo.
   Ahora, en los OCHO gráficos: una raya marca el día y el globo va arriba, a su lado («arribaJunto», core/charts.js); el
   resaltado al pasar es inmediato; el globo se desliza en 120 ms; el dibujo, 400 ms; con «reducir movimiento», nada; y
   leyenda y globo en el orden de los DATOS. */
const GUIA_DIA = {
  id: 'mopGuiaDia',
  afterDatasetsDraw(chart) {
    const activos = chart.tooltip && chart.tooltip.getActiveElements();
    if (!activos || !activos.length) return;
    const { ctx, chartArea } = chart;
    const x = activos[0].element.x;
    ctx.save();
    ctx.strokeStyle = 'rgba(84,110,122,.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};
const enOrdenDeDatos = (a, b) => a.datasetIndex - b.datasetIndex;
/** Dibuja un gráfico de Operativo con el movimiento de 0q·2 (lo único que añade a `makeChart`). */
function graficoOp(id, cfg) {
  const quieto = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const o = cfg.options;
  const ley = (o.plugins && o.plugins.legend) || {};
  o.interaction = { mode: 'index', intersect: false };
  o.animation = quieto ? false : { duration: 400 };
  o.transitions = { active: { animation: { duration: 0 } } };
  o.plugins = { ...o.plugins,
    legend: { ...ley, labels: { ...ley.labels, sort: enOrdenDeDatos } },
    tooltip: { position: 'arribaJunto', caretSize: 0, caretPadding: 8, itemSort: enOrdenDeDatos, animation: { duration: 120 } } };
  cfg.plugins = [...(cfg.plugins || []), GUIA_DIA];
  return makeChart(id, cfg);
}
const COLORES_OX = ['#00838f', '#1e88e5', '#7e57c2', '#e67e22'];

/* 3 (2026-09-29, usuario) · el ambiente de UN día: la temperatura, cada toma del color de su estado (los del mapa de calor:
   verde dentro, azul por debajo, rojo por encima) y su rango en rayas; el oxígeno, sus lecturas y el mínimo. El mismo eje
   de horas en los dos. */
function dibujarAmbiente(d, E) {
  const A = _ambiente;
  const cs = getComputedStyle(document.documentElement);
  const tono = (n, x) => cs.getPropertyValue(n).trim() || x;
  const COLOR = { ok: tono('--c-bueno', '#2e9e5b'), bajo: tono('--c-excelente', '#1e88e5'), alto: tono('--c-grave', '#e0533b') };
  COLOR.fuera = COLOR.alto;
  const linea = (label, data, color, unidad) => ({ type: 'line', label, data, borderColor: color, backgroundColor: color, tension: 0, borderWidth: 2,
    spanGaps: true, pointRadius: 4, tooltip: { callbacks: { label: (c) => `${label}: ${c.raw === null ? '—' : nf(c.raw, 1) + ' ' + unidad}` } } });
  const raya = (label, v, color) => ({ type: 'line', label, data: A.horas.map(() => v), borderColor: color, backgroundColor: color, borderDash: [5, 4],
    pointRadius: 0, borderWidth: 1.5, tension: 0 });
  const opciones = (unidad) => ({
    responsive: true, maintainAspectRatio: false,
    scales: { x: { ticks: { ...E.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } },
      /* 0u · H2 · con margen: un punto en el borde (29,0 °C sobre su raya, 4,30 mg/L arriba del todo) quedaba en el marco. */
      y: { grace: '5%', ticks: E.tick, grid: { color: E.grid }, title: E.titulo(unidad) } },
    plugins: { legend: { labels: E.leyenda } },
  });
  if (A.temp.some((v) => v !== null)) {
    const t = linea('Temperatura', A.temp, tono('--c-text-soft', '#546e7a'), '°C');
    t.pointBackgroundColor = A.estados.map((s) => COLOR[s] || COLOR.ok);
    t.pointBorderColor = t.pointBackgroundColor;
    const u = d.calor.umbral;
    const ds = [t];
    if (u && u.min !== null) ds.push(raya(`Mínimo ${nf(u.min, 1)} °C`, u.min, COLOR.bajo));
    if (u && u.max !== null) ds.push(raya(`Máximo ${nf(u.max, 1)} °C`, u.max, COLOR.alto));
    const o = opciones('°C');
    o.plugins.legend.labels = { ...E.leyenda, generateLabels: (chart) => leyendaMicPat(chart, E.texto, 'color de su estado') };   // la de Chart.js: el color del PRIMER punto
    graficoOp('mopTempDia', { type: 'line', data: { labels: A.horas, datasets: ds }, options: o });
  }
  if (A.ox.some((v) => v !== null)) {
    const u = d.oxigeno.umbral;
    const ds = [linea('Oxígeno', A.ox, COLORES_OX[0], 'mg/L')];
    if (u && u.min !== null) ds.push(raya(`Mínimo ${nf(u.min, 1)} mg/L`, u.min, '#e0533b'));
    graficoOp('mopOxDia', { type: 'line', data: { labels: A.horas, datasets: ds }, options: opciones('mg/L') });
  }
}

function dibujarDetalle(d) {
  const E = ejesOp();
  if (_ambiente) dibujarAmbiente(d, E);   // 3 · el día
  else if (d.oxigeno.lecturas) {
    const u = d.oxigeno.umbral;
    const datasets = d.oxigeno.series.map((s, i) => ({ label: s.hora, data: s.valores, borderColor: COLORES_OX[i], backgroundColor: COLORES_OX[i],
      tension: 0, pointRadius: 2.5, borderWidth: 2, spanGaps: true }));
    if (u && u.min !== null) {
      datasets.push({ label: `Mínimo ${nf(u.min, 1)} mg/L`, data: d.oxigeno.fechas.map(() => u.min), borderColor: '#e0533b', borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 });
    }
    graficoOp('mopOx', {
      type: 'line',
      data: { labels: d.oxigeno.fechas.map(dm), datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: { x: { ticks: { ...E.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { ticks: E.tick, grid: { color: E.grid }, title: E.titulo('mg/L') } },
        plugins: { legend: { labels: E.leyenda } },
      },
    });
  }
  const u = d.densidad;
  const t = d.tanques;
  const datasets = [
    { type: 'bar', label: '♀ Hembras', data: t.map((x) => x.hembras), backgroundColor: '#d81b60', borderWidth: 0, yAxisID: 'y', order: 3, maxBarThickness: 22 },
    { type: 'bar', label: '♂ Machos', data: t.map((x) => x.machos), backgroundColor: '#1e88e5', borderWidth: 0, yAxisID: 'y', order: 3, maxBarThickness: 22 },
    { type: 'line', label: 'Densidad (/m²)', data: t.map((x) => (x.densidad === '' ? null : x.densidad)), borderColor: '#00838f', backgroundColor: '#00838f',
      yAxisID: 'y1', order: 1, pointRadius: 3, borderWidth: 2, spanGaps: false },
  ];
  if (u && u.min !== null) datasets.push({ type: 'line', label: `Densidad mínima ${nf(u.min)}`, data: t.map(() => u.min), borderColor: '#2e9e5b', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, yAxisID: 'y1', order: 0 });
  if (u && u.max !== null) datasets.push({ type: 'line', label: `Densidad máxima ${nf(u.max)}`, data: t.map(() => u.max), borderColor: '#e0533b', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, yAxisID: 'y1', order: 0 });
  graficoOp('mopTq', {
    data: { labels: t.map((x) => 'T' + x.tanque), datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { ...E.tick, maxRotation: 0, autoSkip: false }, grid: { display: false } },
        y: { beginAtZero: true, position: 'left', ticks: { ...E.tick, precision: 0 }, grid: { color: E.grid }, title: E.titulo('animales') },
        y1: { beginAtZero: true, position: 'right', ticks: E.tick, grid: { drawOnChartArea: false }, title: E.titulo('animales/m²') },
      },
      plugins: { legend: { labels: E.leyenda } },
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
  /* 0f · 7 (usuario, 2026-09-25) · la curva «📈 Vivos del lote» y sus eventos cubren el CICLO del lote, «desde la fecha del
     ingreso, no un mes antes»; Reproducción y promedios siguen el período. Sin fecha de ingreso, todo el período. */
  const ciclo = vOp.loteSel ? cicloDelLote(M.libro, vOp.loteSel, M.fecha) : null;
  _fichaLote = vOp.loteSel ? fichaDeLote(M, ciclo ? serieDelCiclo(memo, ciclo) : serieDe(memo, p), vOp.loteSel, p, ciclo, presenciaDe(memo, p)) : null;
  const comp = comparativa(M, F, p, vOp.agrupacion, vOp.parejas);
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
  /* 4 (2026-09-29, usuario) · el peso del ⚖️ Saldo, con su fecha en el globo; con filtro de sexo, sólo el de ese sexo. */
  const pesoCelda = (x, sexo) => {
    if (F.sexo && F.sexo !== sexo) return '<td class="r"><span class="muted" title="Con filtro de sexo, sólo el peso de ese sexo">—</span></td>';
    return vacio(x.valor) ? '<td class="r">—</td>' : `<td class="r" title="último peso: ${esc(dma(x.fecha))}">${nf(x.valor, 1)} g</td>`;
  };
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
      ${pesoCelda(f.peso.hembras, 'hembras')}${pesoCelda(f.peso.machos, 'machos')}
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
        <th class="r" title="${esc(definicion('proporcionHM'))}">♀:♂</th><th class="r">Peso ♀</th><th class="r">Peso ♂</th><th class="r">Edad</th></tr></thead>
      <tbody>${filas.map(fila).join('')}</tbody></table></div>
    <p class="mc-note">La EDAD va del ingreso a la foto; en un lote cerrado, hasta su cierre. El PESO es el del ⚖️ Saldo: el promedio de sus tanques en la última fecha con peso, hasta la foto (su fecha, en el globo). ⚠ en un lote = su cascada no cuadra.${F.sexo ? ' Con filtro de sexo estas cifras son de ese sexo; la CASCADA de la ficha sigue entera, porque es un cuadre y a medias no cuadraría.' : ''}</p>
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
    ? `<ul class="mop-lista mop-lista-fila">${f.eventos.map((e) => `<li>${esc(dm(e.fecha))} · ${esc(e.etiqueta)}${e.tanques > 1 ? ` · ${nf(e.tanques)} tanques` : e.registros > 1 ? ` · ${nf(e.registros)} registros` : ''}${e.machos || e.hembras ? ` · ♀ ${nf(e.hembras)} ♂ ${nf(e.machos)}` : ''}</li>`).join('')}</ul>`
    : `<p class="muted" style="margin:4px 0">Sin eventos en ${f.ciclo ? 'su ciclo' : esc(etiquetaPeriodo(p))}.</p>`;
  // 0f · 7 · el rótulo de la curva dice de dónde a dónde va: desde el ingreso (y hasta el cierre, si lo tuvo).
  const rotuloCurva = f.ciclo
    ? 'desde el ingreso ' + dma(f.ciclo.desde) + (f.cerrado && f.ciclo.hasta === f.cerrado ? ' hasta el cierre ' + dma(f.cerrado) : '')
    : etiquetaPeriodo(p);
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
      <div class="mop-sc-fila"><span class="mop-sc-l">Cópulas</span><span>${nf(pr.copulas)} en el período · ${pc(pr.pctCopulas)} de sus hembras por día</span></div>
      <div class="mop-sc-fila"><span class="mop-sc-l">Muda</span><span>${nf(pr.muda)} en el período · ${pc(pr.pctMuda)} de sus hembras por día</span></div>
      <p class="mc-note">El % es POR DÍA de parte, con la regla del ⚖️ Saldo: cópulas (o mudas) ÷ hembras de los tanques que tenían el lote ese día.</p>
      ${pr.compartido ? '<p class="mc-note">⚠ Comparte tanque con otro lote: la hoja de Tanques no dice de qué lote es cada cifra, así que las cópulas y las mudas van repartidas en proporción a sus animales (los pesos se promedian, no se parten).</p>' : ''}
    </div>
    <div class="mc-card mop-det-ancho">
      <h4 class="mc-card-h">📈 Vivos del lote <span class="mc-h-note">${esc(rotuloCurva)}</span></h4>
      <div class="mc-chart" style="height:240px"><canvas id="mopLoteCurva"></canvas></div>
      <h5 class="mop-det-h">Eventos del ${f.ciclo ? 'ciclo' : 'período'}</h5>${eventos}
    </div>
  </div>`;
}

function comparativaHTML(c, p) {
  const pills = DIMENSIONES_COMPARATIVA.map((d) => `<button class="mc-pill ${c.dimension === d.clave ? 'is-on' : ''}" data-mop-agr="${d.clave}">${esc(d.etiqueta)}</button>`).join('');
  const porLote = c.dimension === 'lote';
  /* 5 (2026-09-29, usuario) · por código o por piscina, las PAREJAS juntas (cada lote en la fila de su combinación) o
     separadas (los desoves y el N5 de un lote de dos orígenes, ENTEROS en cada uno y marcados «*»: no suman). */
  const marca = (f) => (f.compartido ? '<span class="mop-nota" title="Compartidos con el otro origen de su lote: no suman">*</span>' : '');
  const cuerpo = c.filas.length
    ? c.filas.map((f) => `<tr>
        <td><b>${esc(f.origen)}</b>${porLote ? '' : ` <span class="mop-nota">${f.lotes.length} lote(s)</span>`}</td>
        <td class="r">${nf(f.ingresados)}</td><td class="r">${nf(f.vivos)}</td><td class="r">${pc(f.supervivencia)}</td>
        <td class="r">${nf(f.desoves)}${marca(f)}</td><td class="r">${pc(f.fertilidad)}</td><td class="r">${nf(f.n5)}${marca(f)}</td>
        <td class="r">${f.dias === '' ? '—' : nf(f.dias) + ' d'}</td></tr>`).join('')
    : '<tr><td colspan="8" class="muted">Nada que comparar con este filtro.</td></tr>';
  const veredicto = c.mejor
    ? `<p class="mc-note">Mejor supervivencia: <b>${esc(c.mejor)}</b> · peor: <b>${esc(c.peor)}</b>.</p>`
    : '<p class="mc-note">Con una sola fila no hay comparación: compararse consigo mismo no dice nada.</p>';
  const origen = c.dimension === 'codigo' ? 'código' : 'piscina';
  const parejas = porLote ? '' : `<span class="mc-seg mop-parejas" role="group" aria-label="Parejas"><span class="mop-nota">Parejas</span>${PAREJAS.map((m) =>
    `<button type="button" class="mc-pill ${c.parejas === m ? 'is-on' : ''}" data-mop-parejas="${m}" aria-pressed="${c.parejas === m}">${m}</button>`).join('')}</span>`;
  const notaParejas = porLote ? '' : c.parejas === 'juntas'
    ? `<p class="mc-note">Cada lote va entero a la fila de su combinación según su Ingreso («A/B» si entró con dos): las cifras suman.</p>`
    : `<p class="mc-note">Cada ${origen} con SUS animales (los de su Ingreso y sus posiciones).${c.filas.some((f) => f.compartido) ? ` * Desoves y N5 de lotes con más de un ${origen}: cuentan enteros en cada uno, así que esas columnas no suman (como el despacho en cada destino).` : ''}</p>`;
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">📊 Comparativa <span class="mc-h-note">${esc(etiquetaPeriodo(p))}</span>
      ${parejas}<span class="mc-seg mop-agr">${pills}</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>${esc((DIMENSIONES_COMPARATIVA.find((d) => d.clave === c.dimension) || {}).etiqueta || 'Lote')}</th>
        <th class="r">Ingresados</th><th class="r">Vivos</th><th class="r">Superv.</th>
        <th class="r">Desoves</th><th class="r">Fertilidad</th><th class="r">N5</th><th class="r">Edad</th></tr></thead>
      <tbody>${cuerpo}</tbody></table></div>${notaParejas}${veredicto}
  </div>`;
}

/** La curva de vivos del lote. Los eventos van como puntos marcados sobre la misma línea, no como otra serie. */
function dibujarLote(f) {
  const E = ejesOp();
  if (!f || !f.curva.length) return;
  const conEvento = new Set(f.eventos.map((e) => e.fecha));
  graficoOp('mopLoteCurva', {
    type: 'line',
    data: {
      labels: f.curva.map((d) => dm(d.fecha)),
      datasets: [
        { label: '♀ Hembras', data: f.curva.map((d) => d.hembras), borderColor: '#d81b60', backgroundColor: '#d81b60', tension: 0, borderWidth: 2,
          pointRadius: f.curva.map((d) => (conEvento.has(d.fecha) ? 4 : 0)) },
        { label: '♂ Machos', data: f.curva.map((d) => d.machos), borderColor: '#1e88e5', backgroundColor: '#1e88e5', tension: 0, borderWidth: 2,
          pointRadius: f.curva.map((d) => (conEvento.has(d.fecha) ? 4 : 0)) },
        { label: 'Total', data: f.curva.map((d) => d.total), borderColor: '#00838f', backgroundColor: '#00838f', tension: 0, borderWidth: 2, borderDash: [5, 4],
          pointRadius: f.curva.map((d) => (conEvento.has(d.fecha) ? 4 : 0)) },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { x: { ticks: { ...E.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { beginAtZero: true, ticks: E.tick, grid: { color: E.grid } } },
      plugins: { legend: { labels: E.leyenda } },
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
      <td class="r">${d ? pc(d.supervivencia) : '—'}</td><td class="r">${d ? nf(d.desoves) + (d.compartido ? '<span class="mop-nota" title="Con desoves de un lote que entró también de otra piscina: no suman">*</span>' : '') : '—'}</td>
      <td class="r">${d ? pc(d.fertilidad) : '—'}</td>
    </tr>`;
  };
  const compartidos = bs.piscinas.some((x) => x.desempeno && x.desempeno.compartido);
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
      regla de la comparativa de arriba por piscina con las parejas «separadas», sobre todo el registro hasta la foto; la piscina,
      en su forma canónica («P 12» y «P12» del Ingreso son la misma).${compartidos ? ' * Desoves de un lote que entró de más de una piscina: cuentan enteros en cada una, así que esa columna no suma.' : ''}</p>
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
  const E = ejesOp();
  if (!f || !f.serie.length) return;
  graficoOp('mopPiscinaCurva', {
    type: 'line',
    data: {
      labels: f.serie.map((s) => dm(s.corte)),
      datasets: [{ label: 'Peso (g)', data: f.serie.map((s) => (vacio(s.peso) ? null : s.peso)), borderColor: '#00838f', backgroundColor: '#00838f',
        tension: 0, borderWidth: 2, pointRadius: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { x: { ticks: { ...E.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { beginAtZero: true, ticks: E.tick, grid: { color: E.grid } } },
      plugins: { legend: { labels: E.leyenda } },
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

/* 0u · H6 (2026-09-29) · por lote, las bajas registradas en un tanque donde el libro no tenía ningún lote: faltan aquí y
   «por sala» sí salen. Se dicen, con el sitio y el día, para que se pueda revisar el parte. */
function sinLoteHTML(s) {
  if (!s || !s.total) return '';
  const uno = s.total === 1;
  const donde = s.sitios.map((x) => `${esc(x.sala)} · tanque ${nf(x.tanque)} el ${esc(dm(x.fecha))}`).join('; ');
  return `<p class="mc-note">⚠ ${nf(s.total)} ${uno ? 'baja registrada en un tanque' : 'bajas registradas en tanques'} donde el libro no tenía ningún lote
    (${donde}): no ${uno ? 'se atribuye' : 'se atribuyen'} a ningún lote, así que aquí ${uno ? 'falta' : 'faltan'} y «por sala» sí ${uno ? 'la' : 'las'} cuenta.
    Revisa ese parte (¿el tanque?, ¿un movimiento sin registrar?); el aviso está también en 🩺 Calidad del dato.</p>`;
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
    ${sinLoteHTML(d.sinLote)}
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
    <h4 class="mc-card-h">🧪 Alcalinidad por área <span class="mc-h-note">${esc(etiquetaPeriodo(p))} · ${a.umbral ? esc(a.umbral.referencia) + (a.umbral.origen === 'laboratorio' ? ' · laboratorio' : '') : 'sin umbral'}</span></h4>
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
  const E = ejesOp();
  if (!f || !f.curva.length) return;
  graficoOp('mopTanqueCurva', {
    type: 'line',
    data: {
      labels: f.curva.map((d) => dm(d.fecha)),
      datasets: [
        { label: '♀ Hembras', data: f.curva.map((d) => d.hembras), borderColor: '#d81b60', backgroundColor: '#d81b60', tension: 0, borderWidth: 2, pointRadius: 0 },
        { label: '♂ Machos', data: f.curva.map((d) => d.machos), borderColor: '#1e88e5', backgroundColor: '#1e88e5', tension: 0, borderWidth: 2, pointRadius: 0 },
        { label: 'Total', data: f.curva.map((d) => d.total), borderColor: '#00838f', backgroundColor: '#00838f', tension: 0, borderWidth: 2, borderDash: [4, 3], pointRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { x: { ticks: { ...E.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { beginAtZero: true, ticks: E.tick, grid: { color: E.grid } } },
      plugins: { legend: { labels: E.leyenda } },
    },
  });
}

/* ── 🥚 REPRODUCCIÓN ───────────────────────────────────────── */

function reproduccionHTML(M, p, F) {
  const T = totalesDeReproduccion(M, p, F);
  const pend = pendientesDeN5(M.fuentes, p, F, M.fecha);
  const filas = tablaDeReproduccion(M, p, F);
  const dest = destinosDeDespacho(M.fuentes, p, F);
  // 0q·3 · el lote desplegado; si el filtro o el período lo quitan de la tabla, se suelta (como la ficha de un lote).
  if (vOp.reproLote && !filas.some((x) => x.lote === vOp.reproLote)) vOp.reproLote = '';
  _reparto = vOp.reproLote ? repartoDeLotePorDestino(M.fuentes, vOp.reproLote, p) : null;
  return totalesReproHTML(T, p) + pendientesHTML(pend) + tablaReproHTML(filas, F, _reparto) + destinosHTML(dest);
}
/* 0q·3 · el reparto del lote desplegado, para dibujarlo tras pintar (el lienzo tiene que estar en el DOM). */
let _reparto = null;

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

function tablaReproHTML(filas, F, rep) {
  if (!filas.length) {
    return `<div class="mc-card"><h4 class="mc-card-h">Por lote</h4>
      <p class="muted" style="margin:4px 0">${hayFiltro(F) ? 'Ningún lote con desoves pasa el filtro.' : 'Ningún desove registrado en el período.'}</p></div>`;
  }
  const abierto = (x) => !!rep && rep.lote === x.lote;
  const f = (x) => `<tr class="mop-rlote${abierto(x) ? ' is-on' : ''}" role="button" tabindex="0" aria-expanded="${abierto(x)}" data-mop-rlote="${esc(x.lote)}">
      <td><span class="mop-rlote-ic" aria-hidden="true">${abierto(x) ? '▾' : '▸'}</span> <b>${esc(x.lote)}</b></td>
      <td class="r">${nf(x.desoves)}${x.pendientes ? ' <span class="mop-dif" title="' + nf(x.desovesPendientes) + ' desove(s) sin su N5">⏳</span>' : ''}</td>
      <td class="r">${nf(x.huevos)}</td>
      <td class="r">${nf(x.huevosPorDesove)}</td>
      <td class="r">${nf(x.noViables)}</td>
      <td class="r">${nf(x.n2)}</td>
      <td class="r">${pc(x.fertilidad)}</td>
      <td class="r">${nf(x.n5)}</td>
      <td class="r">${x.naupliosPorHembra === '' ? '<span class="muted" title="Ningún desove de este lote tiene su N5 todavía">—</span>' : nf(x.naupliosPorHembra)}</td>
      <td>${x.destinos.length ? x.destinos.map((d) => esc(d)).join(' · ') : '<span class="muted">—</span>'}</td></tr>${abierto(x) ? `<tr class="mop-rlote-det"><td colspan="10">${repartoLoteHTML(rep)}</td></tr>` : ''}`;
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">Por lote <span class="mc-h-note">en el período · pulsa un lote para ver sus N2 y N5 por destino</span></h4>
    <div class="mc-tablewrap mop-rlote-wrap"><table class="mc-table mc-table-sm">
      <thead><tr><th>Lote</th><th class="r">Desoves</th><th class="r">Huevos</th><th class="r">Huevos/desove</th>
        <th class="r">No viables</th><th class="r">N2</th><th class="r">Fertilidad</th><th class="r">N5</th>
        <th class="r">Nauplios/hembra</th><th>Destinos</th></tr></thead>
      <tbody>${filas.map(f).join('')}</tbody></table></div>
  </div>`;
}

/** 0q·3 · lo que se despliega bajo un lote de «Por lote»: sus N2 y N5 por destino. */
function repartoLoteHTML(rep) {
  const sin = rep.sinDestino ? `<p class="mc-note">${nf(rep.sinDestino)} registro(s) de desove sin destino anotado${rep.n5SinDestino ? ' (' + nf(rep.n5SinDestino) + ' N5)' : ''}: no están en ninguna barra.</p>` : '';
  if (!rep.filas.length) return `<div class="mop-rlote-in"><p class="muted" style="margin:4px 0">Ningún desove de este lote tiene destino anotado en el período.</p>${sin}</div>`;
  // La caja se ancla al ancho VISIBLE de la tabla (que en el móvil se desplaza de lado): ver .mop-rlote-in en el CSS.
  return `<div class="mop-rlote-in"><h5 class="mop-det-h">${esc(rep.lote)} · N2 y N5 por destino <span class="mc-h-note">de más a menos N5</span></h5>
    <div class="mc-chart" style="height:240px"><canvas id="mopReproDest"></canvas></div>
    ${rep.compartidos ? `<p class="mc-note">⚠ ${nf(rep.compartidos)} registro(s) de desove fueron a varios destinos y cuentan ENTEROS en cada uno (la hoja no dice cuánto fue a cada uno): las barras NO suman el total del lote. El globo dice cuánto de cada barra es así.</p>` : ''}
    ${sin}</div>`;
}
/** 0q·3 · N2 y N5 una al lado de otra, por destino; el globo añade cuánto de la barra es de desoves compartidos. */
function dibujarReparto(rep) {
  const E = ejesOp();
  if (!rep || !rep.filas.length || !document.getElementById('mopReproDest')) return;
  const compartido = (clave) => ({ callbacks: { afterLabel: (c) => {
    const v = rep.filas[c.dataIndex][clave];
    return v ? 'de ellos, ' + nf(v) + ' de desoves con varios destinos' : '';
  } } });
  graficoOp('mopReproDest', {
    type: 'bar',
    data: {
      labels: rep.filas.map((x) => x.destino),
      datasets: [
        { label: 'N2', data: rep.filas.map((x) => x.n2), backgroundColor: '#26a69a', tooltip: compartido('n2Compartido') },
        { label: 'N5', data: rep.filas.map((x) => x.n5), backgroundColor: COLOR_KPI.n5, tooltip: compartido('n5Compartido') },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { ticks: { ...E.tick, autoSkip: false, maxRotation: 45 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: E.tick, grid: { color: E.grid }, title: E.titulo('nauplios') } },
      plugins: { legend: { labels: E.leyenda } },
    },
  });
}

function destinosHTML(d) {
  if (!d.filas.length) {
    return `<div class="mc-card"><h4 class="mc-card-h">A dónde fueron</h4>
      <p class="muted" style="margin:4px 0">Ningún desove del período tiene destino anotado${d.sinDestino ? ' (' + nf(d.sinDestino) + ' sin destino)' : ''}.</p></div>`;
  }
  const max = d.filas[0].n5;
  /* 0q·3 · plegada, la tarjeta se resume en una línea: los tres destinos con más N5, en cifra corta. */
  const corta = (v) => (Number(v) >= 1e6 ? nf(v / 1e6, 1) + ' M' : nf(v));
  const nD = d.filas.length;
  const top = d.filas.slice(0, 3).map((x) => esc(x.destino) + ' ' + corta(x.n5)).join(' · ') + (nD > 3 ? ' …' : '');
  const f = (x) => `<div class="mop-obs-f"><span>${esc(x.destino)}</span>${barra(x.n5, max)}
    <span class="r">${nf(x.n5)}</span></div>
    <div class="mc-note" style="margin:0 0 6px 0">${nf(x.desoves)} desove(s) · ${x.lotes.map((l) => esc(l)).join(' · ')}${x.variosDestinos ? ' · ' + nf(x.variosDestinos) + ' con varios destinos' : ''}</div>`;
  return `<details class="mc-card mc-card-wide mop-dest" data-mop-dest${vOp.destAbierto ? ' open' : ''}>
    <summary class="mop-dest-sum" data-mop-dest-sum>
      <h4 class="mc-card-h">A dónde fueron <span class="mc-h-note">${nf(d.conDestino)} desove(s) con destino${d.sinDestino ? ' · ' + nf(d.sinDestino) + ' sin anotar' : ''} · ${nf(nD)} destino${nD === 1 ? '' : 's'}</span></h4>
      <span class="mop-dest-top">${top}</span>
    </summary>
    ${d.filas.map(f).join('')}
    <p class="mc-note">⚠ Los nauplios NO se reparten entre los destinos de un desove: la hoja no dice cuántos fue a cada
      uno, así que el desove cuenta ENTERO en cada destino al que fue.${d.compartidos ? ' Aquí hay ' + nf(d.compartidos) + ' así, de modo que estas columnas NO suman el total.' : ''}</p>
    ${ignoraHTML(d.ignora, 'El despacho')}
  </details>`;
}

/* ── 🔄 MANEJO (F5) ────────────────────────────────────────── */

/* Lo que cada hoja no puede filtrar, con SU motivo: el de Tanques no vale aquí. */
const PORQUE_MOV = 'La hoja de Movimientos no registra el lote: de qué lote era cada animal lo deduce el libro, repartiendo en proporción a los vivos del origen.';
const PORQUE_ALIM = 'La hoja de Alimentación dice sus lotes, no sus códigos genéticos.';
const PORQUE_TRAT = 'La hoja de Tratamientos se registra por sala y área, con sus lotes: no dice el tanque ni el código genético.';

function manejoHTML(M, p, F) {
  const mat = matrizDeMovimientos(M.fuentes, p, F, M.libro);
  const reg = registroDeMovimientos(M.fuentes, p, F);
  const cal = calendarioDeTratamientos(M.fuentes, p, F);
  const areas = productosPorArea(M.fuentes, p, F);
  const cob = coberturaPreventiva(M.fuentes, M.libro, p, F, M.fecha);
  return movimientosHTML(mat, reg, p, F) + tratamientosHTML(cal, areas, cob, p, F);   // 6 · la alimentación, en su sub-vista
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
  return hojasHTML(hojas, cal, p) + partesHTML(cob, p) + estadosHTML(est) + avisosLibroHTML(av, p) + cruceHTML(cruceDe(memo, p, F), p, F)
    + diaModalHTML(diaDe(cob, memo, p, F));   // 0q·4
}

/* ── 0q·4 (2026-09-27, usuario) · LA VENTANA DE UN DÍA del calendario de partes ─────────────────────
   Al pulsar una fecha del encabezado (todas las salas) o una celda (centrada en su sala): la cobertura de cada sala
   —la misma celda del calendario— y sus partes tanque a tanque; ◀ ▶ recorren el período sin cerrar; cada tanque lleva
   a su ficha en 🛢 Tanques. Es un sv-modal: foco al abrir, fondo quieto y Escape. (0u · decía «el modal del laboratorio»,
   su modelo: desde el 2 del 2026-09-29 🦠 y 🧬 son sub-vistas y ésta es la única ventana del tablero.) */
function diaDe(cob, memo, p, F) {
  if (!vOp.diaParte) return null;
  const d = partesDelDia(cob, serieDe(memo, p), memo.partes, vOp.diaParte, vOp.diaSala, F);
  if (!d) { vOp.diaParte = ''; vOp.diaSala = ''; }
  return d;
}
function diaModalHTML(d) {
  if (!d) return '';
  const reg = (v) => (v === null || v === undefined ? '<span class="muted">—</span>' : v ? '<span class="mop-igual">✓</span> sí' : '<span class="mop-dif">✗</span> NO');
  const peso = (x) => (x === '' || x === null || x === undefined ? '—' : nf(x, 2));
  const fila = (s) => (x) => `<tr class="${x.esperado ? '' : 'mop-dia-noesp'}">
      <td><b>t${esc(x.tanque)}</b>${x.esperado ? '' : ' <span class="mop-dif" title="El libro tenía este tanque vacío al cierre del día: su parte no cubre nada">no esperado</span>'}</td>
      <td class="r">${nf(x.partes)}</td><td class="r">${nf(x.hembrasMuertas)}</td><td class="r">${nf(x.machosMuertos)}</td>
      <td class="r">${nf(x.hembrasDescarte)} / ${nf(x.machosDescarte)}</td>
      <td class="r">${nf(x.copulas)}</td><td class="r">${nf(x.muda)}</td>
      <td class="r">${peso(x.pesoHembras)} / ${peso(x.pesoMachos)}</td>
      <td>${[...x.obsSanitarias, ...x.obsOperativas].map((o) => esc(o)).join(' · ') || '<span class="muted">—</span>'}</td>
      <td><button type="button" class="mc-mini" data-mop-dia-tq="${esc(s.sala + '|' + x.tanque)}" title="Abrir su ficha en 🛢 Tanques" aria-label="Abrir el t${esc(x.tanque)} en Tanques">🛢 Ficha</button></td></tr>`;
  const sec = (s) => {
    const c = s.celda;
    const cab = c ? `${nf(c.registrados)} de ${nf(c.esperados)} tanque(s) con parte · registro de Sala: ${reg(c.registroSala)}`
      : 'sin animales al cierre: no se esperaba ningún parte';
    const faltan = c && c.faltan.length
      ? `<p class="mop-dia-faltan"><span class="mop-dif">⚠</span> ${c.faltan.length > 1 ? 'Faltan los partes del ' : 'Falta el parte del '}${c.faltan.map((t) => 't' + esc(t)).join(', ')}</p>` : '';
    const tabla = s.filas.length
      ? `<div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-dia-tabla">
        <thead><tr><th>Tanque</th><th class="r">Partes</th><th class="r">♀ muertas</th><th class="r">♂ muertos</th><th class="r">Descarte ♀ / ♂</th>
          <th class="r">Cópulas</th><th class="r">Muda</th><th class="r">Peso ♀ / ♂ (g)</th><th>Observaciones</th><th></th></tr></thead>
        <tbody>${s.filas.map(fila(s)).join('')}</tbody></table></div>`
      : '<p class="muted" style="margin:4px 0">Ningún parte registrado ese día.</p>';
    return `<section class="mop-dia-sala" data-mop-dia-sala="${esc(s.sala)}">
      <h5 class="mop-det-h">${esc(s.sala)} <span class="mc-h-note">${cab}</span></h5>${faltan}${tabla}</section>`;
  };
  const nav = (dir, iso, txt, rot) => `<button type="button" class="mc-mini" data-mop-dia-dir="${dir}" data-mop-dia-ir="${esc(iso)}"${iso ? '' : ' disabled'} aria-label="${rot}">${txt}</button>`;
  return `<div class="sv-modal sv-open mop-dia" data-mop-dia-overlay>
    <div class="sv-modal-card mop-dia-card">
      <div class="sv-modal-head"><span class="sv-modal-title">📝 Partes del ${esc(dma(d.dia))}</span>
        <span class="mop-dia-nav">${nav('ant', d.anterior, '◀', 'Día anterior')}${nav('sig', d.siguiente, '▶', 'Día siguiente')}</span>
        <button type="button" class="sv-modal-x" data-mop-dia-cerrar aria-label="Cerrar">✕</button></div>
      <div class="sv-modal-body">
        <p class="mop-lab-per">${d.enCurso ? '<b>EN CURSO</b>: el día de hoy se enseña y no se cuenta, su parte puede no haber llegado · ' : ''}uno por tanque ocupado al cierre del día · con los filtros del tablero${vOp.diaSala ? ` · sólo la ${esc(vOp.diaSala)} <button type="button" class="mc-mini" data-mop-dia-todas>Todas las salas</button>` : ''}</p>
        ${d.salas.length ? d.salas.map(sec).join('') : '<p class="muted">Ese día ninguna sala tenía animales ni partes.</p>'}
      </div>
    </div>
  </div>`;
}
let _diaAbierto = false;   // para mover el foco sólo al ABRIR (cada repintado rehace la ventana)
let _diaFoco = '';         // ◀ ▶ repintan: el foco vuelve a la flecha pulsada
function trasPintarDia(root) {
  const ov = root.querySelector('[data-mop-dia-overlay]');
  if (ov) {
    const dlg = makeAccessibleDialog(ov);
    document.body.classList.add('modal-open');
    const f = _diaFoco ? ov.querySelector(_diaFoco) : null;
    if (f && !f.disabled) f.focus();
    else if ((f || !_diaAbierto) && dlg) dlg.focusFirst();
    _diaFoco = '';
    _diaAbierto = true;
  } else if (_diaAbierto) {
    document.body.classList.remove('modal-open');
    _diaAbierto = false;
  }
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
    return `<td class="${clase}${x.registroSala === false ? ' is-sin-sala' : ''}" title="${esc(t)}" data-mop-dia="${esc(c.dias[i])}" data-mop-dia-sala="${esc(s.sala)}">${x.esperados ? nf(x.registrados) + '/' + nf(x.esperados) : ''}</td>`;
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
      <thead><tr><th></th>${c.dias.map((d) => `<th class="${curso.has(d) ? 'is-curso' : ''}"><button type="button" class="mop-cob-dia" data-mop-dia="${esc(d)}" title="Ver los partes del ${esc(dma(d))}">${esc(dm(d))}</button></th>`).join('')}</tr></thead>
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
  /* 2026-09-25 (usuario, revisión en navegador de 0d) · el «Estado por lote» de cada lado, debajo de su estado: el
     propuesto (el de «🔄 Proponer estado», punto 3 de 0d) se calculaba y no se enseñaba en ninguna parte. */
  const porLote = (x) => (x ? `<div class="mop-nota">${esc(x)}</div>` : '');
  const fila = (f) => `<tr class="${f.situacion === 'difieren' ? 'mop-difieren' : ''}">
      <td><b>${esc(f.sala)}</b></td><td>${chip(f.registrado.estado)}${porLote(f.registrado.porLote)}</td>
      <td class="r">${f.registrado.fecha ? esc(dma(f.registrado.fecha)) + (vacio(f.desfaseDias) ? '' : ` <span class="mop-nota">hace ${nf(f.desfaseDias)} d</span>`) : '<span class="muted">—</span>'}</td>
      <td>${chip(f.propuesto.estado)}${porLote(f.propuesto.porLote)}</td>
      <td><span class="${tono[f.situacion] || 'muted'}">${esc(f.etiqueta)}</span></td></tr>`;
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">🏠 Estado registrado frente al propuesto <span class="mc-h-note">al cierre de la foto · ${nf(e.coinciden)} coinciden · ${nf(e.difieren)} difieren · ${nf(e.sinComparar)} sin comparar</span></h4>
    <div class="mc-tablewrap"><table class="mc-table mc-table-sm mop-estados">
      <thead><tr><th>Sala</th><th>Registrado</th><th class="r">Tecleado el</th><th>Propuesto por el libro</th><th>Situación</th></tr></thead>
      <tbody>${e.filas.map(fila).join('')}</tbody></table></div>
    <p class="mc-note">El PROPUESTO es el de «🔄 Proponer estado» de la ficha de Salas: el libro al cierre de la foto. Un estado tecleado hace
      días puede coincidir por casualidad: mira cuándo se tecleó. Debajo de cada estado va su «Estado por lote»; la situación compara sólo el estado.</p>
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
  broodstock: { doc: broodstockDoc, hojas: broodstockHojas, nombre: nombreDelBroodstock, titulo: 'Broodstock' },
};

function reportesHTML(M, memo, fecha, hoy, F, periodo) {
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
  } else if (clave === 'broodstock') {
    /* La serie de cada piscina cubre el PERÍODO del tablero (decisión del usuario): es lo que ve
       📈 Piscinas de origen en pantalla, y para la historia entera basta con poner «Todo» arriba. */
    modelo = reporteBroodstock(M, F, periodo, {});
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
  const pastillas = REPORTES.map((r) => `<button class="mc-pill ${clave === r.clave ? 'is-on' : ''}" data-mop-rep="${esc(r.clave)}"
      title="${esc(r.descripcion || '')}">${r.icono} ${esc(r.etiqueta)}</button>`).join('');
  const selLote = REPORTES.find((r) => r.clave === clave).lote
    ? `<label class="mop-rep-dia">Lote
        <select class="mc-select" data-mop-rep-lote aria-label="Lote del cierre">${lotes.map((l) => `<option value="${esc(l)}"${l === vOp.repLote ? ' selected' : ''}>${esc(l)}</option>`).join('') || '<option value="">(ninguno)</option>'}</select>
        <span class="mc-note">la vida entera del lote, hasta la foto</span></label>` : '';
  /* 0r·4 (2026-09-28, usuario) · el diario y el semanal llevan en SU barra el «Lote → Código genético» del tablero. Son
     los MISMOS selectores (`data-mop-filtro`: el mismo estado y el mismo manejador), como el «Día del parte» mueve la
     foto (F7.1·8): el reporte hereda los filtros (F7.1·6) y no puede haber dos que discrepen. */
  const o = M.filtros;
  const opciones = (valores, elegido) => valores.map((x) => `<option value="${esc(x)}"${String(elegido) === String(x) ? ' selected' : ''}>${esc(x)}</option>`).join('');
  const selFiltros = REPORTES.find((r) => r.clave === clave).filtros
    ? `<label class="mop-rep-dia">Lote
        <select class="mc-select" data-mop-filtro="lote" aria-label="Lote (filtro del tablero)"><option value="">Todos los lotes</option>${opciones(o.lotes, vOp.lote)}</select></label>
      <label class="mop-rep-dia">Código genético
        <select class="mc-select" data-mop-filtro="codigo" aria-label="Código genético (filtro del tablero)"><option value="">Todos los códigos</option>${opciones(codigosDe(o, vOp.lote), vOp.codigo)}</select>
        <span class="mc-note">son los filtros del tablero: cambian también las demás sub-vistas</span></label>` : '';
  const cab = modelo ? modelo.cabecera : { filtrado: false, etiquetas: [] };
  const alcance = alcanceDelParte(cab);
  const doc = modelo ? A.doc(modelo) : '';
  const cuerpo = modelo
    ? `<div class="mop-rep-hoja"><iframe class="mop-rep-prev" title="Vista previa del ${esc(A.titulo)}" srcdoc="${esc(doc)}"></iframe></div>`
    : `<p class="mc-note">${esc(sinLote || 'No hay nada que enseñar.')}</p>`;
  return `<div class="mc-card mc-card-wide">
      <div class="mop-rep-barra">
        <div class="mop-rep-tipos">${pastillas}</div>
        <label class="mop-rep-dia">Día del parte
          <input type="date" class="mop-fecha" data-mop-fecha value="${esc(fecha)}" max="${esc(hoy)}">
          <span class="mc-note">es la foto del tablero: cambiarlo mueve todas las sub-vistas</span></label>
        ${selLote}
        ${selFiltros}
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
  registerModalEscape('.mop-dia.sv-open');   // 0q·4
  const repintar = () => repintarPanelLab(root) || operativoView(root);   // 0r·3b · con 🦠 o 🧬 a la vista, sólo su contenido
  const abrirSala = (sala) => { vOp.salaDetalle = vOp.salaDetalle === sala ? '' : sala; repintar(); };
  const abrirLote = (lote) => { vOp.loteSel = vOp.loteSel === lote ? '' : lote; repintar(); };
  const abrirTanque = (k) => { vOp.tqFicha = vOp.tqFicha === k ? '' : k; repintar(); };
  const abrirPiscina = (x) => { vOp.piscinaSel = vOp.piscinaSel === x ? '' : x; repintar(); };
  const abrirCuarentena = (k) => { vOp.cuarSel = vOp.cuarSel === k ? '' : k; repintar(); };   // 0f · 4
  const abrirKpi = (k) => { vOp.kpiSel = vOp.kpiSel === k ? '' : k; repintar(); };            // 0f · 5
  /** 0q·5b · repinta y devuelve el foco al control que se usó (🦠 / 🧬 se rehacen enteras). */
  const repintarYEnfocar = (sel) => {
    repintar();
    const f = root.querySelector(sel);
    if (f) f.focus();
  };
  const elegirPatogeno = (k) => {                                                              // 0q·5a
    vOp.labPat = k;
    repintar();
    const f = root.querySelector(`[data-mop-micpat="${k}"]`);
    if (f) f.focus();
  };
  const abrirReparto = (l) => { vOp.reproLote = vOp.reproLote === l ? '' : l; repintar(); };    // 0q·3

  root.addEventListener('click', (e) => {
    const t = e.target;
    const sub = t.closest('[data-mop-sub]');
    if (sub) {
      const nueva = sub.dataset.mopSub;
      /* 2 · entrar en 🦠 o 🧬 empieza con la sala, el sexo y el lote del tablero (0q·5a), y en 🌊, en «Día» (0r·1): como
         al abrir sus ventanas. Pulsar la que ya está a la vista no borra lo elegido. */
      if (LAB[nueva] && nueva !== vOp.sub) vOp.labF = { ...LABF_VACIO, lote: vOp.lote || '', sala: vOp.sala || '', sexo: vOp.sexo || '' };
      if (nueva === 'mareas' && vOp.sub !== 'mareas') _mareas.estado = undefined;
      vOp.sub = nueva;
      repintar();
      return;
    }
    const per = t.closest('[data-mop-periodo]');
    if (per) { vOp.periodo = per.dataset.mopPeriodo; repintar(); return; }
    /* 3 · el ambiente de la sala: Día | Período, y ◀ ▶ o «Ver ese día» (el foco se queda en el control; si ◀ ▶ quedó
       deshabilitado —el primer o el último día—, pasa al selector del día). */
    const am = t.closest('[data-mop-amb-modo]');
    if (am) { vOp.ambModo = am.dataset.mopAmbModo; repintarYEnfocar(`[data-mop-amb-modo="${am.dataset.mopAmbModo}"]`); return; }
    const ai = t.closest('[data-mop-amb-ir]');
    if (ai) {
      if (ai.disabled || !ai.dataset.mopAmbIr) return;
      vOp.ambDia = ai.dataset.mopAmbIr;
      repintar();
      const b = ai.dataset.mopAmbDir && root.querySelector(`[data-mop-amb-dir="${ai.dataset.mopAmbDir}"]`);
      const f = b && !b.disabled ? b : root.querySelector('[data-mop-amb-dia]');
      if (f) f.focus();
      return;
    }
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
    /* 0q·4 · la ventana de un día del calendario de partes: ◀ ▶, «Todas las salas», un tanque, cerrar (✕, velo, Escape)
       y abrirla (una fecha del encabezado o una celda, que la centra en su sala). */
    const ir = t.closest('[data-mop-dia-ir]');
    if (ir) {
      if (!ir.disabled && ir.dataset.mopDiaIr) { vOp.diaParte = ir.dataset.mopDiaIr; _diaFoco = `[data-mop-dia-dir="${ir.dataset.mopDiaDir}"]`; repintar(); }
      return;
    }
    if (t.closest('[data-mop-dia-todas]')) { vOp.diaSala = ''; repintar(); return; }
    const dtq = t.closest('[data-mop-dia-tq]');
    if (dtq) { vOp.sub = 'tanques'; vOp.tqFicha = dtq.dataset.mopDiaTq; vOp.diaParte = ''; vOp.diaSala = ''; repintar(); return; }
    if (t.closest('[data-mop-dia-cerrar]') || (t.matches && t.matches('[data-mop-dia-overlay]'))) { vOp.diaParte = ''; vOp.diaSala = ''; repintar(); return; }
    const dia = t.closest('[data-mop-dia]');
    if (dia) { vOp.diaParte = dia.dataset.mopDia; vOp.diaSala = dia.dataset.mopDiaSala || ''; repintar(); return; }
    /* 0q·5a · en 🦠 Microbiología: «Quitar filtros» y escoger un patógeno (el foco se queda en su fila). */
    if (t.closest('[data-mop-labf-limpiar]')) { vOp.labF = { ...LABF_VACIO }; repintar(); return; }
    const mp = t.closest('[data-mop-micpat]');
    if (mp) { elegirPatogeno(mp.dataset.mopMicpat); return; }
    const af = t.closest('[data-mop-aguafmt]');   // 0q·5b
    if (af) { vOp.aguaFmt = af.dataset.mopAguafmt; vOp.aguaComp = ''; vOp.aguaPat = ''; repintarYEnfocar(`[data-mop-aguafmt="${af.dataset.mopAguafmt}"]`); return; }
    const ap = t.closest('[data-mop-aguapat]');
    if (ap) { vOp.aguaPat = ap.dataset.mopAguapat; repintarYEnfocar(`[data-mop-aguapat="${ap.dataset.mopAguapat}"]`); return; }
    const bp = t.closest('[data-mop-biopat]');   // 0q·6
    if (bp) { vOp.bioPat = bp.dataset.mopBiopat; repintarYEnfocar(`[data-mop-biopat="${bp.dataset.mopBiopat}"]`); return; }
    const cp = t.closest('[data-mop-calpar]');   // 0q·5c
    if (cp) { vOp.calPar = cp.dataset.mopCalpar; repintarYEnfocar(`[data-mop-calpar="${cp.dataset.mopCalpar}"]`); return; }
    if (t.closest('[data-mop-lab-abrir-micro]')) {   // 0f · 8 · el enlace a Microbiología (al volver, 🦠 sigue a la vista)
      microPreseleccion({ sub: 'bacteriologia', depto: 'Maduración' });
      changeView('microbiologia');
      return;
    }
    /* 0q·3 · el título de «A dónde fueron» la pliega y despliega sin repintar; el estado se recuerda en la sesión. */
    const dsum = t.closest('[data-mop-dest-sum]');
    if (dsum) { e.preventDefault(); vOp.destAbierto = !vOp.destAbierto; dsum.parentElement.open = vOp.destAbierto; return; }
    if (t.closest('[data-mop-kpi-cerrar]')) { vOp.kpiSel = ''; repintar(); return; }
    const kpi = t.closest('[data-mop-kpi]');
    if (kpi) { abrirKpi(kpi.dataset.mopKpi); return; }
    if (t.closest('[data-mop-cuar-cerrar]')) { vOp.cuarSel = ''; repintar(); return; }
    const cua = t.closest('[data-mop-cuar]');
    if (cua) { abrirCuarentena(cua.dataset.mopCuar); return; }
    const rl = t.closest('[data-mop-rlote]');
    if (rl) { abrirReparto(rl.dataset.mopRlote); return; }
    const lot = t.closest('[data-mop-lote]');
    if (lot) { abrirLote(lot.dataset.mopLote); return; }
    const tqf = t.closest('[data-mop-tqf]');
    if (tqf) { abrirTanque(tqf.dataset.mopTqf); return; }
    const pis = t.closest('[data-mop-piscina]');
    if (pis) { abrirPiscina(pis.dataset.mopPiscina); return; }
    const agr = t.closest('[data-mop-agr]');
    if (agr) { vOp.agrupacion = agr.dataset.mopAgr; repintar(); return; }
    const pj = t.closest('[data-mop-parejas]');   // 5 · las parejas de la comparativa, juntas o separadas
    if (pj) { vOp.parejas = pj.dataset.mopParejas; repintarYEnfocar(`[data-mop-parejas="${pj.dataset.mopParejas}"]`); return; }
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
    /* 0f · 3 · el lienzo del tanque: «🛢 Abrir en Tanques» lleva a su ficha completa; ✕ lo cierra sin repintar. */
    const abr = t.closest('[data-mop-abrir-tq]');
    if (abr) { vOp.sub = 'tanques'; vOp.tqFicha = abr.dataset.mopAbrirTq; repintar(); return; }
    if (t.closest('[data-mop-tq-cerrar]')) {
      vOp.tanqueSel = '';
      root.querySelectorAll('.mop-tq.is-sel').forEach((b) => b.classList.remove('is-sel'));
      const info = root.querySelector('.mop-tq-info');
      if (info) info.innerHTML = infoTanqueHTML(_mapa);
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
    const mp = e.target.closest && e.target.closest('[data-mop-micpat]');   // 0q·5a
    if (mp && e.target === mp) { e.preventDefault(); elegirPatogeno(mp.dataset.mopMicpat); return; }
    const ap = e.target.closest && e.target.closest('[data-mop-aguapat]');   // 0q·5b
    if (ap && e.target === ap) { e.preventDefault(); vOp.aguaPat = ap.dataset.mopAguapat; repintarYEnfocar(`[data-mop-aguapat="${ap.dataset.mopAguapat}"]`); return; }
    const bp = e.target.closest && e.target.closest('[data-mop-biopat]');   // 0q·6
    if (bp && e.target === bp) { e.preventDefault(); vOp.bioPat = bp.dataset.mopBiopat; repintarYEnfocar(`[data-mop-biopat="${bp.dataset.mopBiopat}"]`); return; }
    const cp = e.target.closest && e.target.closest('[data-mop-calpar]');   // 0q·5c
    if (cp && e.target === cp) { e.preventDefault(); vOp.calPar = cp.dataset.mopCalpar; repintarYEnfocar(`[data-mop-calpar="${cp.dataset.mopCalpar}"]`); return; }
    const sala = e.target.closest && e.target.closest('[data-mop-sala]');
    if (sala && e.target === sala) { e.preventDefault(); abrirSala(sala.dataset.mopSala); return; }
    const rl = e.target.closest && e.target.closest('[data-mop-rlote]');
    if (rl && e.target === rl) { e.preventDefault(); abrirReparto(rl.dataset.mopRlote); return; }
    const lote = e.target.closest && e.target.closest('[data-mop-lote]');
    if (lote && e.target === lote) { e.preventDefault(); abrirLote(lote.dataset.mopLote); return; }
    const kpi = e.target.closest && e.target.closest('[data-mop-kpi]');
    if (kpi && e.target === kpi) { e.preventDefault(); abrirKpi(kpi.dataset.mopKpi); return; }
    const cua = e.target.closest && e.target.closest('[data-mop-cuar]');
    if (cua && e.target === cua) { e.preventDefault(); abrirCuarentena(cua.dataset.mopCuar); return; }
    const pis = e.target.closest && e.target.closest('[data-mop-piscina]');
    if (pis && e.target === pis) { e.preventDefault(); abrirPiscina(pis.dataset.mopPiscina); return; }
    const tqf = e.target.closest && e.target.closest('[data-mop-tqf]');
    if (tqf && e.target === tqf) { e.preventDefault(); abrirTanque(tqf.dataset.mopTqf); }
  });

  root.addEventListener('change', (e) => {
    /* 0q·5a · un filtro de 🦠 Microbiología o 🧬 Biomol: se repinta y el foco se queda en su select. */
    if (e.target.matches && e.target.matches('[data-mop-calgrupo]')) {   // 0q·5c · el grupo de la calidad de agua
      vOp.calGrupo = e.target.value || '';
      repintarYEnfocar('[data-mop-calgrupo]');
      return;
    }
    if (e.target.matches && e.target.matches('[data-mop-aguacomp]')) {   // 0q·5b · el componente de ③
      vOp.aguaComp = e.target.value || '';
      repintarYEnfocar('[data-mop-aguacomp]');
      return;
    }
    if (e.target.matches && e.target.matches('[data-mop-amb-dia]')) {   // 3 · el día del ambiente de la sala
      vOp.ambDia = e.target.value || '';
      repintarYEnfocar('[data-mop-amb-dia]');
      return;
    }
    const lf = e.target.closest && e.target.closest('[data-mop-labf]');
    if (lf) {
      const d = lf.dataset.mopLabf;
      vOp.labF = { ...vOp.labF, [d]: lf.value || '' };
      repintar();
      const x = root.querySelector(`[data-mop-labf="${d}"]`);
      if (x) x.focus();
      return;
    }
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
