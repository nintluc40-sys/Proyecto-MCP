/* ============================================================
   MADURACIÓN · OPERATIVO — F7.1 · REPORTERÍA: el PARTE DIARIO (2026-09-22)

   Decisiones del usuario (F7), CERRADAS — no re-preguntar:
   · La primera tanda es el PARTE DIARIO extremo a extremo (pantalla, PDF y Excel); el semanal por lote,
     el cierre de lote y el de Broodstock vienen después y reusan esta maquinaria.
   · Vive en su propia sub-vista, 🖨 Reportes (la décima pastilla: `.mc-subnav` envuelve, así que no repite
     el problema de sitio que obligó a fusionar F5).
   · El PDF se imprime con la maquinaria del Supervisor (`printFichaDocs`: iframe oculto, sin pop-ups).
   · El Excel lleva UNA HOJA POR BLOQUE, con las filas COMPLETAS (el papel recorta, el archivo no).
   · El parte es del día de la FOTO y hereda los filtros del tablero, que se IMPRIMEN en la cabecera:
     un parte de una sala no puede parecerse al de la planta entera.
   · Cabe en UNA página: cada tabla enseña sus primeras filas y cierra con «+ N más» y el total.

   🔑 Este módulo NO calcula ninguna cifra nueva: llama a las MISMAS funciones puras que pinta el tablero,
      con el período de UN DÍA (`periodoDe('hoy', …)`). Es la regla que ya siguió F4 al reusar
      `kpiReproduccion`: un reporte que recalculara por su cuenta podría contradecir a la pantalla, y el
      papel es justo donde nadie puede comprobarlo.

   ⚠⚠ CONTRATO con quien lo llama (la vista lo cumple; las pruebas lo ejercen):
      · `M` viene construido con `fecha` = EL DÍA DEL PARTE (`modeloOperativo` levanta el libro «al cierre»
        de esa fecha). Con el modelo de otro día, los vivos serían los de otro día.
      · `serie` empieza en la VÍSPERA de ese día: la mortalidad del día es una RESTA entre dos cierres
        (`kpiMortalidad`), y sin la víspera devuelve 'sin-serie' en vez de una cifra.
      · `partes` son los de `diasDeTanque(M.fuentes.tanques)`, como en la vista.
      · `F` viene ya normalizado (`normalizarFiltro`, con su índice si se quiere el filtro de estado/origen).

   El código verificador sigue la doctrina del PDF del Supervisor: huella DETERMINISTA del contenido
   (`fnv1a`), con el sello de generación FUERA del hash — dos impresiones del mismo parte tienen que dar el
   mismo código, o no verifica nada.
   ============================================================ */
import {
  periodoDe, kpiVivos, kpiLotes, kpiSalas, kpiOcupacion, kpiMortalidad, kpiBiomasa, etiquetasDeFiltro, hayFiltro,
} from './operativo.tablero.js';
import { desgloseDeBajas } from './operativo.bajas.js';
import { totalesDeReproduccion, tablaDeReproduccion } from './operativo.reproduccion.js';
import { registroDeMovimientos, productosPorArea } from './operativo.manejo.js';
import { coberturaDePartes, avisosDelLibro } from './operativo.calidad.js';
import { esc } from '../../core/format.js';
import { fnv1a } from '../supervisor/fichaPdf.js';

/** Los reportes disponibles, en su orden. F7.1 sólo trae el diario: una pastilla que no hace nada engaña
 *  más que una lista corta, así que el semanal, el cierre de lote y el de Broodstock se añaden AQUÍ cuando
 *  existan (F7.2 y F7.3), y la sub-vista se pinta desde esta lista. */
export const REPORTES = [
  { clave: 'diario', etiqueta: 'Parte diario', icono: '📄', descripcion: 'Lo que pasó en un día, en una página.' },
];

/** Filas que cada tabla enseña EN EL PAPEL. El resto se resume en «+ N más»; el Excel las lleva todas. */
export const TOPE_FILAS = 6;

const txt = (v) => String(v == null ? '' : v).trim();
const ent = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** La fecha en letra: «martes, 22/09/2026». En UTC a propósito: el día del parte es un ISO, no un instante,
 *  y construirlo en local lo correría un día en husos al oeste (la suite se corre también con TZ=UTC). */
export function fechaLarga(iso) {
  if (!esIso(iso)) return '—';
  const [a, m, d] = iso.split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
}

const nf = (v, dec = 0) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v))
  ? '—' : Number(v).toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: dec }));
const pc = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : nf(v, 1) + ' %');
const ubic = (sala, tanque) => (txt(sala) ? txt(sala) + (tanque === null || tanque === undefined || tanque === '' ? '' : ' · T' + tanque) : '—');

/* ── EL MODELO DEL PARTE ────────────────────────────────────── */

/**
 * El parte diario del día de la foto de `M`, con el filtro `F`. Devuelve el MODELO (cifras, sin maquetar):
 * `parteDiarioHtml` lo pinta y `parteDiarioHojas` lo vuelca a Excel, para que la página y el archivo no
 * puedan decir cosas distintas.
 * @param {object} M modelo de `modeloOperativo`, construido con `fecha` = el día del parte
 * @param {Array} serie serie diaria desde la VÍSPERA del día (`serieDiaria`)
 * @param {Array} partes partes de Tanques agrupados (`diasDeTanque`)
 * @param {object} F filtro ya normalizado
 * @param {{ahora?: string}} [opts] `ahora` = sello de generación para el pie (fuera del código verificador)
 */
export function parteDiario(M, serie, partes, F, opts = {}) {
  const modelo = M || {};
  const filtro = F || {};
  const dia = txt(modelo.fecha);
  const libro = modelo.libro || { posiciones: [], lotes: new Map(), avisos: [] };
  const periodo = periodoDe('hoy', dia, modelo.fuentes);
  /* Las bajas del papel van por TANQUE: es la agrupación que dice dónde ir a mirar. Por lote saldrían del
     libro (otra fuente y otra regla) y el parte perdería el «sala · tanque» que usa quien recorre la planta. */
  const bajas = desgloseDeBajas(modelo, serie, partes, filtro, periodo, 'tanque');
  const reproduccion = totalesDeReproduccion(modelo, periodo, filtro);
  /* Sólo los lotes con algo que contar ese día: una tabla con lotes a cero ocuparía el papel sin decir nada. */
  const porLote = tablaDeReproduccion(modelo, periodo, filtro)
    .filter((r) => ent(r.desoves) > 0 || ent(r.n2) > 0 || ent(r.n5) > 0);
  const movimientos = registroDeMovimientos(modelo.fuentes, periodo, filtro);
  const tratamientos = productosPorArea(modelo.fuentes, periodo, filtro);
  const cobertura = coberturaDePartes(modelo, serie, partes, periodo, filtro);
  const avisos = avisosDelLibro(modelo, periodo, filtro);

  return {
    reporte: 'diario',
    dia,
    periodo,
    cabecera: {
      titulo: 'Maduración · Parte diario',
      dia,
      diaLargo: fechaLarga(dia),
      filtrado: hayFiltro(filtro),
      etiquetas: etiquetasDeFiltro(filtro),
      generado: txt(opts.ahora),
    },
    resumen: {
      vivos: kpiVivos(libro, filtro),
      lotes: kpiLotes(libro, filtro),
      salas: kpiSalas(modelo.salas, filtro),
      ocupacion: kpiOcupacion(modelo.salas, libro, filtro),
      mortalidad: kpiMortalidad(serie, periodo, filtro, partes),
      reproduccion,
      biomasa: kpiBiomasa(modelo, filtro, periodo),
    },
    bajas,
    reproduccionPorLote: porLote,
    movimientos,
    tratamientos,
    cobertura,
    avisos,
  };
}

/** El alcance del parte, en una línea: lo que separa el de la planta entera del de una sala.
 *  El rótulo NO se repite cuando el valor ya lo lleva dentro: las salas se llaman «Sala 2», y «Sala Sala 2»
 *  en la cabecera de un documento impreso parece un error del sistema. */
export function alcanceDelParte(cabecera) {
  const c = cabecera || {};
  if (!c.filtrado) return 'Planta entera';
  const etiquetas = (c.etiquetas || []).map((e) => {
    const valor = txt(e.valor);
    const rotulo = txt(e.rotulo);
    return valor.toLowerCase().startsWith(rotulo.toLowerCase()) ? valor : `${rotulo} ${valor}`;
  }).join(' · ');
  return `PARTE FILTRADO — ${etiquetas || 'con filtro'}`;
}

/** Nombre de archivo (sin extensión) para el PDF y el Excel. */
export function nombreDelParte(parte) {
  const p = parte || {};
  const dia = esIso(p.dia) ? p.dia : 'sin-fecha';
  return `Parte_diario_${dia}${(p.cabecera || {}).filtrado ? '_filtrado' : ''}`;
}

/** Código verificador: huella del CONTENIDO (no del momento). El mismo parte da siempre el mismo código. */
export function codigoDelParte(cuerpoHtml, dia) {
  const hex = fnv1a(`MAD-DIA|${txt(dia)}|${txt(cuerpoHtml)}`).toString(16).toUpperCase().padStart(8, '0').slice(-6);
  return `MAD-${txt(dia).replace(/-/g, '')}-${hex}`;
}

/* ── LA PÁGINA ──────────────────────────────────────────────── */

/** Corta a `tope` filas y dice cuántas quedaron fuera; `total` es SIEMPRE el de todas. */
export function recortar(filas, tope = TOPE_FILAS) {
  const todas = Array.isArray(filas) ? filas : [];
  const n = Math.max(0, Number(tope) || 0);
  return { filas: todas.slice(0, n), total: todas.length, mas: Math.max(0, todas.length - n) };
}

const celdas = (vals) => vals.map((v) => `<td>${v}</td>`).join('');
const cabeceras = (vals) => vals.map((v) => `<th>${esc(v)}</th>`).join('');

/** Una tabla del parte, con su pie de «+ N más» cuando se recortó y su aviso cuando no hay nada. */
function tabla(cols, filas, tope, vacio, extra) {
  const r = recortar(filas, tope);
  if (!r.total) return `<div class="rp-vacio">${esc(vacio)}</div>`;
  const pie = r.mas ? `<tr class="rp-mas"><td colspan="${cols.length}">+ ${nf(r.mas)} más ${esc(extra || '')} (total ${nf(r.total)})</td></tr>` : '';
  return `<table class="rp-tab"><thead><tr>${cabeceras(cols)}</tr></thead><tbody>${r.filas.join('')}${pie}</tbody></table>`;
}

function bloqueResumen(R) {
  const mort = R.mortalidad || {};
  const mortTxt = mort.modo === 'tasa' ? pc((mort.dia || {}).pct)
    : mort.modo === 'registradas' ? nf((mort.dia || {}).muertos) + ' reg.'
      : mort.modo === 'no-aplica' ? 'n/a' : '—';
  const bm = R.biomasa || {};
  const kpis = [
    ['Vivos', nf((R.vivos || {}).total), `♀ ${nf((R.vivos || {}).hembras)} · ♂ ${nf((R.vivos || {}).machos)}`],
    ['Lotes', nf((R.lotes || {}).total), `prod. ${nf((R.lotes || {}).produccion)} · cuar. ${nf((R.lotes || {}).cuarentena)}`],
    ['Salas', nf((R.salas || {}).total), (R.salas || {}).difieren ? `${nf(R.salas.difieren)} con estado distinto` : 'estados al día'],
    ['Ocupación', pc((R.ocupacion || {}).pct), `${nf((R.ocupacion || {}).ocupados)} de ${nf((R.ocupacion || {}).total)}`],
    ['Mortalidad del día', mortTxt, mort.modo === 'tasa' ? `${nf((mort.dia || {}).muertos)} de ${nf((mort.dia || {}).riesgo)}` : mort.modo === 'sin-serie' ? 'sin serie' : ''],
    ['Desoves', nf((R.reproduccion || {}).desoves), `huevos ${nf((R.reproduccion || {}).huevos)} · N5 ${nf((R.reproduccion || {}).n5)}`],
    ['Biomasa', bm.kg === '' || bm.kg === undefined ? '—' : nf(bm.kg, 1) + ' kg', bm.parcial ? 'sólo un sexo con peso' : bm.kg === '' ? 'sin pesos registrados' : ''],
  ];
  return `<section class="rp-kpis">${kpis.map(([lb, v, sub]) => `<div class="rp-kpi"><div class="rp-kpi-lb">${esc(lb)}</div><div class="rp-kpi-v">${esc(v)}</div><div class="rp-kpi-s">${esc(sub || '')}</div></div>`).join('')}</section>`;
}

function bloqueBajas(B, tope) {
  const filas = (B.filas || []).map((f) => `<tr>${celdas([
    esc(ubic(f.sala, f.tanque)), nf(f.natural.total), nf(f.descarte.total), `<b>${nf(f.total)}</b>`, pc(f.pct),
  ])}</tr>`);
  const T = B.totales || { natural: {}, descarte: {}, total: 0 };
  const pie = `<div class="rp-pie-b">Natural ${nf(T.natural.total)} · descarte ${nf(T.descarte.total)} · <b>total ${nf(T.total)}</b>${B.desove ? ` · en desove ${nf(B.desove)}` : ''}</div>`;
  return tabla(['Ubicación', 'Natural', 'Descarte', 'Total', '%'], filas, tope, 'Sin bajas registradas en el día.', 'tanques') + pie;
}

function bloqueReproduccion(parte, tope) {
  const R = parte.resumen.reproduccion || {};
  const filas = (parte.reproduccionPorLote || []).map((r) => `<tr>${celdas([
    esc(r.lote), nf(r.desoves), nf(r.huevos), nf(r.n2), nf(r.n5), r.pendientes ? nf(r.pendientes) : '—',
  ])}</tr>`);
  const pie = `<div class="rp-pie-b">Fertilidad ${pc(R.fertilidad)} · nauplios/♀ ${nf(R.naupliosPorHembra)}${R.pendientes ? ` · <b>${nf(R.pendientes)} desoves pendientes de N5</b>` : ''}</div>`;
  return tabla(['Lote', 'Desoves', 'Huevos', 'N2', 'N5', 'Pend.'], filas, tope, 'Sin desoves registrados en el día.', 'lotes') + pie;
}

function bloqueManejo(parte, tope) {
  const filas = (parte.movimientos || []).map((m) => `<tr>${celdas([
    esc(ubic(m.origen.sala, m.origen.tanque) + ' → ' + ubic(m.destino.sala, m.destino.tanque)),
    esc(m.motivo || m.tipo || '—'), nf(m.total),
  ])}</tr>`);
  const tr = (parte.tratamientos || []).map((t) => `${esc(t.area)} (${nf(t.aplicaciones)})`).join(' · ');
  const pie = `<div class="rp-pie-b">Tratamientos: ${tr ? tr : 'ninguno registrado'}</div>`;
  return tabla(['Movimiento', 'Motivo', 'Animales'], filas, tope, 'Sin movimientos registrados en el día.', 'movimientos') + pie;
}

function bloqueRegistro(parte, tope) {
  const C = parte.cobertura || { total: {}, salas: [], faltan: [] };
  const T = C.total || {};
  /* El parte del día EN CURSO se imprime igual —el turno lo pide a media tarde—, pero su cobertura no es una
     falta: los partes que quedan por llegar llegarán. Callarlo convertiría un parte provisional en un reproche. */
  const enCurso = (C.enCurso || []).includes(parte.dia) ? ' · <b>día en curso</b>: faltan partes por llegar' : '';
  const filas = (C.salas || []).map((s) => `<tr>${celdas([
    esc(s.sala), `${nf(s.tanques.registrados)}/${nf(s.tanques.esperados)}`, pc(s.tanques.pct),
    s.registro.registrados ? '✓' : '—',
  ])}</tr>`);
  const faltan = (C.faltan || []).slice(0, 4).map((f) => ubic(f.sala, f.tanque)).join(' · ');
  const pie = `<div class="rp-pie-b">Partes ${nf((T.tanques || {}).registrados)}/${nf((T.tanques || {}).esperados)} · registros de sala ${nf((T.registro || {}).registrados)}/${nf((T.registro || {}).esperados)}${faltan ? ` · faltan: ${esc(faltan)}${(C.faltan || []).length > 4 ? ' …' : ''}` : ''}${enCurso}</div>`;
  return tabla(['Sala', 'Partes', '%', 'Registro'], filas, tope, 'Ninguna sala esperaba registro este día.', 'salas') + pie;
}

function bloqueAvisos(parte, tope) {
  const A = parte.avisos || { detalle: [], enPeriodo: 0, aplica: true };
  if (!A.aplica) return '<div class="rp-vacio">Los avisos no se pueden filtrar por código genético: no se listan.</div>';
  const filas = (A.detalle || []).map((a) => `<tr>${celdas([
    esc(a.etiqueta), esc(a.lote || '—'), esc(a.lugar || '—'), esc(a.texto || (a.cantidad === '' ? '' : String(a.cantidad))),
  ])}</tr>`);
  return tabla(['Aviso', 'Lote', 'Lugar', 'Detalle'], filas, tope, 'Sin avisos del libro en el día.', 'avisos');
}

/**
 * La página del parte: el MISMO HTML que se ve en la vista previa y que se imprime. `codigo` y el sello de
 * generación van en el pie; el código se calcula sobre el cuerpo, así que se inyecta después (ver `parteDiarioDoc`).
 */
export function parteDiarioHtml(parte, opts = {}) {
  const p = parte || {};
  const tope = opts.tope === undefined ? TOPE_FILAS : opts.tope;
  const C = p.cabecera || {};
  const alcance = alcanceDelParte(C);
  const cuerpo = `<header class="rp-head">
      <div class="rp-h1">${esc(C.titulo || 'Maduración · Parte diario')}</div>
      <div class="rp-h2">${esc(C.diaLargo || fechaLarga(p.dia))}</div>
      <div class="rp-h3${C.filtrado ? ' is-filtrado' : ''}">${C.filtrado ? '⚠ ' : ''}${esc(alcance)}</div>
    </header>
    ${bloqueResumen(p.resumen || {})}
    <div class="rp-cols">
      <section class="rp-b"><h3>💀 Bajas del día</h3>${bloqueBajas(p.bajas || {}, tope)}</section>
      <section class="rp-b"><h3>🥚 Reproducción</h3>${bloqueReproduccion(p, tope)}</section>
    </div>
    <div class="rp-cols">
      <section class="rp-b"><h3>🔄 Manejo</h3>${bloqueManejo(p, tope)}</section>
      <section class="rp-b"><h3>🩺 Registro del día</h3>${bloqueRegistro(p, tope)}</section>
    </div>
    <section class="rp-b rp-avisos"><h3>⚠ Avisos del libro (${nf((p.avisos || {}).enPeriodo)})</h3>${bloqueAvisos(p, tope)}</section>`;
  return cuerpo;
}

/** CSS de impresión del parte: A4 VERTICAL (el parte es de una página y en columnas; los PDF de ficha del
 *  Supervisor van apaisados porque son tablas anchas). En mm, para mapear 1:1 al papel. */
export const REPORTE_CSS = `
  @page { size: A4 portrait; margin: 10mm 9mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #111; background: #fff; }
  .rp-page { width: 192mm; margin: 0 auto; page-break-after: always; }
  .rp-page:last-child { page-break-after: auto; }
  .rp-head { border-bottom: 2px solid #111; padding-bottom: 2mm; margin-bottom: 3mm; }
  .rp-h1 { font-size: 13pt; font-weight: 800; letter-spacing: .2px; }
  .rp-h2 { font-size: 10pt; color: #333; }
  .rp-h3 { font-size: 9pt; color: #555; margin-top: 1mm; }
  .rp-h3.is-filtrado { color: #a33; font-weight: 700; }
  .rp-kpis { display: flex; flex-wrap: wrap; gap: 2mm; margin-bottom: 3mm; }
  .rp-kpi { flex: 1 1 24mm; border: .3mm solid #bbb; border-left: 1mm solid #444; border-radius: 1mm; padding: 1.5mm 2mm; }
  .rp-kpi-lb { font-size: 6.5pt; text-transform: uppercase; letter-spacing: .3px; color: #555; font-weight: 700; }
  .rp-kpi-v { font-size: 12pt; font-weight: 800; line-height: 1.1; }
  .rp-kpi-s { font-size: 6.5pt; color: #666; }
  .rp-cols { display: flex; gap: 4mm; margin-bottom: 3mm; }
  .rp-b { flex: 1 1 0; min-width: 0; }
  .rp-b h3 { font-size: 9pt; margin: 0 0 1.5mm; padding-bottom: .8mm; border-bottom: .3mm solid #999; }
  .rp-tab { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
  .rp-tab th { text-align: left; background: #eee; border: .2mm solid #bbb; padding: .8mm 1.2mm; font-size: 7pt; }
  .rp-tab td { border: .2mm solid #ddd; padding: .8mm 1.2mm; }
  .rp-tab td:not(:first-child) { text-align: right; }
  .rp-mas td { background: #f6f6f6; color: #555; font-style: italic; text-align: left; }
  .rp-vacio { font-size: 7.5pt; color: #666; font-style: italic; padding: 1.5mm 0; }
  .rp-pie-b { font-size: 7pt; color: #333; margin-top: 1mm; }
  .rp-avisos .rp-tab td:not(:first-child) { text-align: left; }
  .rp-foot { border-top: .3mm solid #999; margin-top: 4mm; padding-top: 1.5mm; display: flex; justify-content: space-between; font-size: 7pt; color: #444; }
  .rp-firma { border-top: .3mm solid #666; width: 55mm; margin-top: 8mm; padding-top: 1mm; text-align: center; }
`;

/**
 * El DOCUMENTO imprimible (HTML completo con su CSS), listo para `printFichaDocs` de fichaPdf.js.
 * `autoPrint` se deja en false porque el padre controla la impresión desde el iframe, igual que las fichas.
 */
export function parteDiarioDoc(parte, opts = {}) {
  const p = parte || {};
  const cuerpo = parteDiarioHtml(p, opts);
  const codigo = codigoDelParte(cuerpo, p.dia);
  const generado = txt((p.cabecera || {}).generado);
  const fileName = txt(opts.fileName) || nombreDelParte(p);
  const pie = `<footer class="rp-foot">
      <div>Código verificador <b>${esc(codigo)}</b></div>
      <div>${generado ? 'Generado el ' + esc(generado) : ''}</div>
      <div>Página 1 de 1</div>
    </footer>
    <div class="rp-firma">Responsable del turno</div>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${esc(fileName)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${REPORTE_CSS}</style>
</head><body><div class="rp-page">${cuerpo}${pie}</div></body></html>`;
}

/* ── EL EXCEL: UNA HOJA POR BLOQUE, CON TODAS LAS FILAS ─────── */

/**
 * Las hojas del libro de Excel: `[{ nombre, aoa }]`. Decisión del usuario: una hoja por bloque, con las filas
 * COMPLETAS —el papel recorta, el archivo no—, y cada hoja plana para que sirva de tabla dinámica.
 * La primera hoja repite el alcance y el día: un archivo suelto tiene que poder decir de qué es.
 */
export function parteDiarioHojas(parte) {
  const p = parte || {};
  const R = p.resumen || {};
  const C = p.cabecera || {};
  const mort = R.mortalidad || {};
  const bm = R.biomasa || {};
  const contexto = [
    ['Maduración · Parte diario'],
    ['Día', p.dia || ''],
    ['Alcance', alcanceDelParte(C)],
    ['Generado', txt(C.generado)],
    [],
  ];
  const resumen = [
    ...contexto,
    ['Indicador', 'Valor', 'Detalle'],
    ['Vivos', ent((R.vivos || {}).total), `hembras ${ent((R.vivos || {}).hembras)} · machos ${ent((R.vivos || {}).machos)}`],
    ['Lotes con vivos', ent((R.lotes || {}).total), `producción ${ent((R.lotes || {}).produccion)} · cuarentena ${ent((R.lotes || {}).cuarentena)} · mixto ${ent((R.lotes || {}).mixto)}`],
    ['Salas', ent((R.salas || {}).total), `estado distinto ${ent((R.salas || {}).difieren)} · sin registro ${ent((R.salas || {}).sinRegistro)}`],
    ['Ocupación %', (R.ocupacion || {}).pct === '' ? '' : (R.ocupacion || {}).pct, `${ent((R.ocupacion || {}).ocupados)} de ${ent((R.ocupacion || {}).total)} (${(R.ocupacion || {}).modo || ''})`],
    ['Mortalidad del día', mort.modo === 'tasa' ? (mort.dia || {}).pct : mort.modo === 'registradas' ? ent((mort.dia || {}).muertos) : '', `modo ${mort.modo || '—'}`],
    ['Desoves', ent((R.reproduccion || {}).desoves), `huevos ${ent((R.reproduccion || {}).huevos)} · N2 ${ent((R.reproduccion || {}).n2)} · N5 ${ent((R.reproduccion || {}).n5)}`],
    ['Fertilidad %', (R.reproduccion || {}).fertilidad === '' ? '' : (R.reproduccion || {}).fertilidad, `nauplios por hembra ${(R.reproduccion || {}).naupliosPorHembra || ''}`],
    ['Desoves pendientes de N5', ent((R.reproduccion || {}).pendientes), ''],
    ['Biomasa kg', bm.kg === '' || bm.kg === undefined ? '' : bm.kg, bm.parcial ? 'sólo un sexo con peso registrado' : ''],
  ];
  const bajas = [
    ['Sala', 'Tanque', 'Natural ♂', 'Natural ♀', 'Descarte ♂', 'Descarte ♀', 'Total', '% del día'],
    ...((p.bajas || {}).filas || []).map((f) => [f.sala, f.tanque === null ? '' : f.tanque,
      ent(f.natural.machos), ent(f.natural.hembras), ent(f.descarte.machos), ent(f.descarte.hembras), ent(f.total), f.pct === '' ? '' : f.pct]),
  ];
  const repro = [
    ['Lote', 'Desoves', 'Huevos', 'No viables', 'N2', 'N5', 'Huevos por desove', 'Fertilidad %', 'Nauplios por hembra', 'Pendientes de N5', 'Destinos'],
    ...(p.reproduccionPorLote || []).map((r) => [r.lote, ent(r.desoves), ent(r.huevos), ent(r.noViables), ent(r.n2), ent(r.n5),
      r.huevosPorDesove === '' ? '' : r.huevosPorDesove, r.fertilidad === '' ? '' : r.fertilidad,
      r.naupliosPorHembra === '' ? '' : r.naupliosPorHembra, ent(r.pendientes), (r.destinos || []).join(' · ')]),
  ];
  const movs = [
    ['Fecha', 'Tipo', 'Motivo', 'Sala origen', 'Tanque origen', 'Sala destino', 'Tanque destino', 'Machos', 'Hembras', 'Total', 'Agua destino', 'Observaciones'],
    ...(p.movimientos || []).map((m) => [m.fecha, m.tipo, m.motivo, m.origen.sala, m.origen.tanque, m.destino.sala, m.destino.tanque,
      ent(m.machos), ent(m.hembras), ent(m.total), m.agua, m.observaciones]),
  ];
  const trat = [
    ['Área', 'Aplicaciones del día', 'Producto', 'Veces', 'En catálogo'],
    ...(p.tratamientos || []).flatMap((t) => (t.productos || []).length
      ? t.productos.map((pr) => [t.area, ent(t.aplicaciones), pr.producto, ent(pr.veces), t.enCatalogo ? 'sí' : 'no'])
      : [[t.area, ent(t.aplicaciones), '', '', t.enCatalogo ? 'sí' : 'no']]),
  ];
  const cob = p.cobertura || { salas: [], faltan: [], faltanRegistro: [] };
  const registro = [
    ['Sala', 'Partes esperados', 'Partes registrados', '%', 'Registro de sala esperado', 'Registro de sala hecho'],
    ...(cob.salas || []).map((s) => [s.sala, ent(s.tanques.esperados), ent(s.tanques.registrados), s.tanques.pct === '' ? '' : s.tanques.pct,
      ent(s.registro.esperados), ent(s.registro.registrados)]),
    [],
    ['Partes que faltan'],
    ['Fecha', 'Sala', 'Tanque'],
    ...(cob.faltan || []).map((f) => [f.fecha, f.sala, f.tanque]),
  ];
  const avisos = [
    ['Fecha', 'Tipo', 'Aviso', 'Lote', 'Lugar', 'Sexo', 'Cantidad', 'Detalle'],
    ...((p.avisos || {}).detalle || []).map((a) => [a.fecha, a.tipo, a.etiqueta, a.lote, a.lugar, a.sexo, a.cantidad, a.texto]),
  ];
  return [
    { nombre: 'Resumen', aoa: resumen },
    { nombre: 'Bajas', aoa: bajas },
    { nombre: 'Reproducción', aoa: repro },
    { nombre: 'Movimientos', aoa: movs },
    { nombre: 'Tratamientos', aoa: trat },
    { nombre: 'Registro', aoa: registro },
    { nombre: 'Avisos', aoa: avisos },
  ];
}
