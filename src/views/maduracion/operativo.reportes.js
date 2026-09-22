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
  cicloDelLote,
} from './operativo.tablero.js';
import { desgloseDeBajas } from './operativo.bajas.js';
import { tablaDeLotes, fichaDeLote } from './operativo.lotes.js';
import { tablaDePiscinas, fichaDePiscina } from './operativo.broodstock.js';
import { totalesDeReproduccion, tablaDeReproduccion } from './operativo.reproduccion.js';
import { registroDeMovimientos, productosPorArea } from './operativo.manejo.js';
import { coberturaDePartes, avisosDelLibro } from './operativo.calidad.js';
import { esc } from '../../core/format.js';
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { fnv1a } from '../supervisor/fichaPdf.js';

/** Los reportes disponibles, en su orden. La sub-vista se pinta desde esta lista, y una pastilla que no hiciera
 *  nada engaña más que una lista corta: el de Broodstock (F7.3) se añade AQUÍ cuando exista.
 *  `lote` marca los que se imprimen de UN lote y necesitan elegirlo. */
export const REPORTES = [
  { clave: 'diario', etiqueta: 'Parte diario', icono: '📄', descripcion: 'Lo que pasó en un día, en una página.' },
  { clave: 'semanal', etiqueta: 'Semanal por lote', icono: '🗓', descripcion: 'Los siete días que terminan en la foto, un lote por página.' },
  { clave: 'cierre', etiqueta: 'Cierre de lote', icono: '🏁', descripcion: 'La vida entera del lote, con la cascada del cuadre.', lote: true },
  { clave: 'broodstock', etiqueta: 'Broodstock', icono: '📈', descripcion: 'El último corte de las piscinas de origen, y una página por piscina.' },
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
const dm = (iso) => (esIso(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');
const dma = (iso) => (esIso(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—');
/** Días entre dos ISO, por UTC (la misma razón que `fechaLarga`: son días, no instantes). */
const diasEntre = (a, b) => (esIso(a) && esIso(b) ? Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5) : 0);

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
  .rp-curva { width: 100%; height: 12mm; display: block; margin-bottom: 1mm; }
  .rp-avisos-l { margin: 0; padding-left: 4mm; font-size: 7.5pt; }
  .rp-avisos-l li { margin-bottom: .8mm; }
  .rp-cuadre .rp-tab td:first-child { font-weight: 600; }
  .rp-cuadre .rp-tab tr.rp-cuadre-fin td { border-top: .6mm solid #333; font-weight: 800; }
  .rp-foot { border-top: .3mm solid #999; margin-top: 4mm; padding-top: 1.5mm; display: flex; justify-content: space-between; font-size: 7pt; color: #444; }
  .rp-firma { border-top: .3mm solid #666; width: 55mm; margin-top: 8mm; padding-top: 1mm; text-align: center; }
`;

/**
 * El DOCUMENTO imprimible (HTML completo con su CSS), listo para `printFichaDocs` de fichaPdf.js. Sirve a los tres
 * reportes: `paginas` son los cuerpos ya maquetados, y CADA UNA lleva su pie con su propio código verificador —dos
 * lotes distintos no pueden compartir código— y su «Página i de N».
 * No lleva script de auto-impresión: el padre controla la impresión desde el iframe, igual que las fichas.
 */
export function documentoDeReporte({ fileName, dia, paginas = [], generado = '' } = {}) {
  const total = paginas.length || 1;
  const cuerpo = paginas.map((pg, i) => {
    const html = typeof pg === 'string' ? pg : pg.cuerpo;
    const codigo = codigoDelParte(html, (pg && pg.dia) || dia);
    return `<div class="rp-page">${html}<footer class="rp-foot">
      <div>Código verificador <b>${esc(codigo)}</b></div>
      <div>${generado ? 'Generado el ' + esc(generado) : ''}</div>
      <div>Página ${i + 1} de ${total}</div>
    </footer>
    <div class="rp-firma">Responsable del turno</div></div>`;
  }).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${esc(fileName)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${REPORTE_CSS}</style>
</head><body>${cuerpo}</body></html>`;
}

/** El documento del parte diario: una sola página. */
export function parteDiarioDoc(parte, opts = {}) {
  const p = parte || {};
  return documentoDeReporte({
    fileName: txt(opts.fileName) || nombreDelParte(p),
    dia: p.dia,
    paginas: [parteDiarioHtml(p, opts)],
    generado: txt((p.cabecera || {}).generado),
  });
}

/* ── F7.2 · LA CURVA EN EL PAPEL ────────────────────────────
   Un SVG en línea, sin librería: los PDF se imprimen en un iframe sin nada cargado, y un gráfico de Chart.js
   necesitaría lienzo y tiempo. Con dos puntos o menos no se dibuja nada y se dice. */
export function curvaSvg(puntos, { w = 260, h = 44 } = {}) {
  const vals = (puntos || []).map((p) => (Number(p.total) || 0));
  if (vals.length < 2) return '<div class="rp-vacio">Sin curva: el período no llega a dos días.</div>';
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  /* Una semana SIN cambios es una recta, y tiene que verse a media altura: escalándola como si el mínimo fuera el
     suelo, la línea se pegaba al borde de abajo y parecía que el lote estaba en su punto más bajo. */
  const plano = max === min;
  const x = (i) => 1 + (i * (w - 2)) / (vals.length - 1);
  const y = (v) => (plano ? h / 2 : h - 3 - ((v - min) * (h - 8)) / (max - min));
  const d = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  return `<svg class="rp-curva" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Curva de vivos">
    <path d="${d}" fill="none" stroke="#333" stroke-width="1.2"/>
    <line x1="0" y1="${h - 1}" x2="${w}" y2="${h - 1}" stroke="#bbb" stroke-width=".5"/></svg>`;
}

/** La curva, sólo dentro del período (la serie llega desde la víspera y hasta donde se le pidió). */
export function recortarCurva(curva, periodo) {
  const p = periodo || {};
  return (curva || []).filter((c) => (!esIso(p.desde) || c.fecha >= p.desde) && (!esIso(p.hasta) || c.fecha <= p.hasta));
}

/** El primero, el último y la variación de una curva; `''` cuando no hay puntos. */
export function extremosDeCurva(puntos) {
  const ps = Array.isArray(puntos) ? puntos : [];
  if (!ps.length) return { inicio: '', fin: '', delta: '', max: '' };
  const tot = (p) => Number(p.total) || 0;
  return { inicio: tot(ps[0]), fin: tot(ps[ps.length - 1]), delta: tot(ps[ps.length - 1]) - tot(ps[0]), max: Math.max(...ps.map(tot)) };
}

/* ── F7.2 · EL SEMANAL POR LOTE ─────────────────────────────
   Decisiones del usuario (2026-09-22): los SIETE DÍAS que terminan en la foto —el mismo período «7 d» del
   tablero, no la semana natural— y UNA PÁGINA POR LOTE de los que pasan el filtro.
   🔑 Qué lotes: los que tienen VIVOS a la foto, más los que CERRARON dentro de la semana. Si no, el lote que cerró
   el martes se quedaría sin su última semana, que es justo la que interesa. */
export function semanalPorLote(M, serie, partes, F, opts = {}) {
  const modelo = M || {};
  const filtro = F || {};
  const periodo = periodoDe('7d', txt(modelo.fecha), modelo.fuentes);
  const lotes = tablaDeLotes(modelo, filtro).filter((l) => (Number(l.vivos.total) || 0) > 0
    || (esIso(l.cerrado) && l.cerrado >= periodo.desde && l.cerrado <= periodo.hasta));
  return {
    reporte: 'semanal',
    dia: txt(modelo.fecha),
    periodo,
    cabecera: {
      titulo: 'Maduración · Semanal por lote',
      dia: txt(modelo.fecha),
      diaLargo: dm(periodo.desde) + ' – ' + dma(periodo.hasta),
      filtrado: hayFiltro(filtro),
      etiquetas: etiquetasDeFiltro(filtro),
      generado: txt(opts.ahora),
    },
    paginas: lotes.map((l) => paginaSemanal(modelo, serie, partes, filtro, periodo, l)),
  };
}

function paginaSemanal(M, serie, partes, F, periodo, fila) {
  const Flote = { ...F, lote: normLote(fila.lote) };
  const ficha = fichaDeLote(M, serie, fila.lote, periodo) || {};
  /* Las bajas del lote salen del LIBRO (agrupación «lote»), no de los partes: un tanque compartido atribuiría al
     lote las bajas de otro. Es la misma razón por la que 💀 Bajas avisa de lo que una agrupación no puede honrar. */
  const bajas = desgloseDeBajas(M, serie, partes, Flote, periodo, 'lote');
  return {
    lote: fila.lote,
    dia: txt(M.fecha),
    /* El RANGO viaja en cada página: una hoja suelta del semanal tiene que decir qué semana cubre, y la cabecera
       del reporte no se imprime (cada lote es una página independiente). */
    rango: dm(periodo.desde) + ' – ' + dma(periodo.hasta),
    estado: fila.estado,
    ingreso: fila.ingreso,
    cerrado: fila.cerrado,
    dias: fila.dias,
    salas: ficha.salas || [],
    codigos: ficha.codigos || [],
    vivos: fila.vivos,
    supervivencia: fila.supervivencia,
    /* La curva se RECORTA al período: la serie viene desde la víspera (la necesita la mortalidad, que es una resta
       entre dos cierres), y una curva con un día de más contradiría a la cabecera, que dice el rango. */
    curva: recortarCurva(ficha.curva, periodo),
    bajas: (bajas.filas || [])[0] || null,
    bajasTotales: bajas.totales,
    desove: bajas.desove,
    eventos: ficha.eventos || [],
    reproduccion: ficha.reproduccion || {},
    promedios: ficha.promedios || {},
    mortalidad: kpiMortalidad(serie, periodo, Flote, partes),
  };
}

/* ── F7.2 · EL CIERRE DE LOTE ───────────────────────────────
   Decisión del usuario: se ofrece para CUALQUIER lote y se rotula si sigue abierto («EN CURSO»), porque hoy no hay
   ninguno cerrado y limitarlo a los cerrados lo dejaría sin estrenar. El período es la VIDA del lote: de su
   ingreso a su cierre, o a la foto si sigue abierto (`cicloDelLote`). */
export function cierreDeLote(M, serie, lote, opts = {}) {
  const modelo = M || {};
  const libro = modelo.libro || { lotes: new Map(), posiciones: [] };
  const ciclo = cicloDelLote(libro, normLote(lote), txt(modelo.fecha));
  const periodo = ciclo && esIso(ciclo.desde)
    ? { clave: 'ciclo', desde: ciclo.desde, hasta: ciclo.hasta, dias: diasEntre(ciclo.desde, ciclo.hasta) + 1 }
    : periodoDe('todo', txt(modelo.fecha), modelo.fuentes);
  const ficha0 = fichaDeLote(modelo, serie, lote, periodo);
  if (!ficha0) return null;
  const ficha = { ...ficha0, curva: recortarCurva(ficha0.curva, periodo) };
  return {
    reporte: 'cierre',
    dia: txt(modelo.fecha),
    periodo,
    lote: ficha.lote,
    abierto: !esIso(ficha.cerrado),
    cabecera: {
      titulo: 'Maduración · Cierre de lote',
      dia: txt(modelo.fecha),
      diaLargo: dma(ficha.ingreso) + ' → ' + (esIso(ficha.cerrado) ? dma(ficha.cerrado) : dma(txt(modelo.fecha)))
        + (periodo.dias ? ' · ' + periodo.dias + ' días' : ''),
      filtrado: false,
      etiquetas: [],
      generado: txt(opts.ahora),
    },
    ficha,
  };
}

/* ── F7.3 · EL BROODSTOCK ───────────────────────────────────
   Decisiones del usuario (2026-09-22): una página de RESUMEN con la tabla del ÚLTIMO corte y los avisos, y luego
   UNA PÁGINA POR PISCINA con su serie, sus lotes y sus observaciones. La serie cubre el PERÍODO DEL TABLERO —el
   mismo que ve 📈 Piscinas de origen en pantalla—, y la cabecera lo imprime.
   🔑 Ni una cifra propia: `tablaDePiscinas` y `fichaDePiscina` son las de la sub-vista. */
export function reporteBroodstock(M, F, periodo, opts = {}) {
  const modelo = M || {};
  const filtro = F || {};
  const tabla = tablaDePiscinas(modelo, filtro);
  const p = periodo || periodoDe('todo', txt(modelo.fecha), modelo.fuentes);
  return {
    reporte: 'broodstock',
    dia: txt(modelo.fecha),
    periodo: p,
    cabecera: {
      titulo: 'Maduración · Broodstock',
      dia: txt(modelo.fecha),
      diaLargo: (esIso(tabla.corte) ? 'último corte ' + dma(tabla.corte) : 'sin ningún corte registrado')
        + ' · serie ' + dm(p.desde) + ' – ' + dma(p.hasta),
      filtrado: hayFiltro(filtro),
      etiquetas: etiquetasDeFiltro(filtro),
      generado: txt(opts.ahora),
    },
    corte: tabla.corte,
    previo: tabla.previo,
    cortes: tabla.cortes,
    piscinas: tabla.piscinas,
    ausentes: tabla.ausentes,
    sinBroodstock: tabla.sinBroodstock,
    ignora: tabla.ignora,
    /* Una ficha por piscina del último corte, en su orden. Con el filtro puesto, `tablaDePiscinas` ya deja sólo
       las que pasan: las páginas salen de ahí y no hay una segunda regla de alcance que pueda discrepar. */
    fichas: tabla.piscinas.map((x) => fichaDePiscina(modelo, x.piscina, p)).filter(Boolean),
  };
}

/* ── F7.2 · LAS PÁGINAS ─────────────────────────────────────── */

function kpisHtml(kpis) {
  return `<section class="rp-kpis">${kpis.map(([lb, v, sub]) => `<div class="rp-kpi"><div class="rp-kpi-lb">${esc(lb)}</div><div class="rp-kpi-v">${esc(v)}</div><div class="rp-kpi-s">${esc(sub || '')}</div></div>`).join('')}</section>`;
}

function cabeceraHtml(titulo, sub, aviso) {
  return `<header class="rp-head">
      <div class="rp-h1">${esc(titulo)}</div>
      <div class="rp-h2">${esc(sub)}</div>
      ${aviso ? `<div class="rp-h3 is-filtrado">⚠ ${esc(aviso)}</div>` : ''}
    </header>`;
}

function bloqueCurva(curva, titulo, dec = 0) {
  const e = extremosDeCurva(curva);
  if (e.inicio === '') return `<section class="rp-b"><h3>${esc(titulo)}</h3><div class="rp-vacio">Sin serie para este período.</div></section>`;
  const signo = e.delta > 0 ? '+' : '';
  return `<section class="rp-b"><h3>${esc(titulo)}</h3>${curvaSvg(curva)}
    <div class="rp-pie-b">${dm(curva[0].fecha)} <b>${nf(e.inicio, dec)}</b> → ${dm(curva[curva.length - 1].fecha)} <b>${nf(e.fin, dec)}</b>
      · variación <b>${esc(signo + nf(e.delta, dec))}</b> · máximo ${nf(e.max, dec)}</div></section>`;
}

/** Una página del semanal: un lote. */
export function semanalPaginaHtml(pg, opts = {}) {
  const p = pg || {};
  const tope = opts.tope === undefined ? TOPE_FILAS : opts.tope;
  const R = p.reproduccion || {};
  const PR = p.promedios || {};
  const B = p.bajas;
  const mort = p.mortalidad || {};
  const kpis = [
    ['Vivos', nf((p.vivos || {}).total), `♀ ${nf((p.vivos || {}).hembras)} · ♂ ${nf((p.vivos || {}).machos)}`],
    ['Supervivencia', pc((p.supervivencia || {}).total), p.dias === '' ? '' : `${nf(p.dias)} días de vida`],
    ['Bajas de la semana', nf((p.bajasTotales || {}).total), `natural ${nf(((p.bajasTotales || {}).natural || {}).total)} · descarte ${nf(((p.bajasTotales || {}).descarte || {}).total)}`],
    ['Mortalidad', mort.modo === 'tasa' ? pc((mort.periodo || {}).pct) : mort.modo === 'registradas' ? nf((mort.periodo || {}).muertos) + ' reg.' : '—', mort.modo === 'tasa' ? `${nf((mort.periodo || {}).muertos)} de ${nf((mort.periodo || {}).riesgo)}` : ''],
    ['Desoves', nf(R.desoves), `huevos ${nf(R.huevos)} · N5 ${nf(R.n5)}`],
    ['Peso ♀', PR.pesoHembras === '' || PR.pesoHembras === undefined ? '—' : nf(PR.pesoHembras, 2) + ' g', PR.pesoMachos === '' || PR.pesoMachos === undefined ? '' : '♂ ' + nf(PR.pesoMachos, 2) + ' g'],
    ['Cópulas', pc(PR.pctCopulas), `muda ${pc(PR.pctMuda)}`],
  ];
  const filasEv = (p.eventos || []).map((e) => `<tr>${celdas([dm(e.fecha), esc(e.etiqueta), nf(e.machos + e.hembras)])}</tr>`);
  const bajasHtml = B
    ? `<table class="rp-tab"><thead><tr>${cabeceras(['', '♂', '♀', 'Total'])}</tr></thead><tbody>
        <tr>${celdas(['Muerte natural', nf(B.natural.machos), nf(B.natural.hembras), `<b>${nf(B.natural.total)}</b>`])}</tr>
        <tr>${celdas(['Descarte de selección', nf(B.descarte.machos), nf(B.descarte.hembras), `<b>${nf(B.descarte.total)}</b>`])}</tr>
        ${p.desove ? `<tr>${celdas(['En desove (informativo)', '—', nf(p.desove), nf(p.desove)])}</tr>` : ''}
      </tbody></table>`
    : '<div class="rp-vacio">Sin bajas del lote en la semana.</div>';
  const cerrado = esIso(p.cerrado) ? `cerrado el ${dma(p.cerrado)}` : '';
  const sub = `Lote ${p.lote} · ${txt(p.rango)} · ${p.estado || 'sin estado'}${p.salas.length ? ' · ' + p.salas.join(' · ') : ''}${p.codigos.length ? ' · ' + p.codigos.join(' · ') : ''}`;
  return cabeceraHtml('Maduración · Semanal por lote', sub, cerrado ? 'Lote ' + cerrado : '')
    + kpisHtml(kpis)
    + `<div class="rp-cols">${bloqueCurva(p.curva, '📈 Vivos, día a día')}
      <section class="rp-b"><h3>💀 Bajas de la semana</h3>${bajasHtml}</section></div>
    <div class="rp-cols">
      <section class="rp-b"><h3>🗓 Eventos del lote</h3>${tabla(['Día', 'Evento', 'Animales'], filasEv, tope, 'Sin eventos del lote en la semana.', 'eventos')}
        <div class="rp-pie-b">Los movimientos no dicen el lote (lo deduce el libro): no se listan aquí.</div></section>
      <section class="rp-b"><h3>🥚 Reproducción</h3>
        <table class="rp-tab"><thead><tr>${cabeceras(['Desoves', 'Huevos', 'N2', 'N5', 'Fertilidad'])}</tr></thead>
        <tbody><tr>${celdas([nf(R.desoves), nf(R.huevos), nf(R.n2), nf(R.n5), pc(R.fertilidad)])}</tr></tbody></table>
        <div class="rp-pie-b">${PR.compartido ? 'Los pesos y las cópulas se reparten: el lote comparte tanque.' : 'Pesos y cópulas de sus ' + nf(PR.tanques) + ' tanque(s).'}</div></section>
    </div>`;
}

/** La página del cierre de lote. */
export function cierreHtml(rep, opts = {}) {
  const r = rep || {};
  const f = r.ficha || {};
  const tope = opts.tope === undefined ? TOPE_FILAS : opts.tope;
  const C = f.cuadre || { filas: [], deLosCuales: {}, deficit: {}, descuadre: {} };
  const R = f.reproduccion || {};
  const PR = f.promedios || {};
  const kpis = [
    ['Ingresados', nf((C.ingresados || {}).total), `♀ ${nf((C.ingresados || {}).hembras)} · ♂ ${nf((C.ingresados || {}).machos)}`],
    ['Vivos', nf((C.vivos || {}).total), r.abierto ? 'a la foto' : 'al cierre'],
    ['Muertos', nf((C.muertos || {}).total), `descartes ${nf((C.descartes || {}).total)}`],
    ['Salidas', nf((C.salidas || {}).total), `diferencia ${nf((C.diferencia || {}).total)}`],
    ['Días', nf(r.periodo.dias), esIso(f.ingreso) ? 'desde ' + dma(f.ingreso) : ''],
    ['Desoves', nf(R.desoves), `N5 ${nf(R.n5)} · fertilidad ${pc(R.fertilidad)}`],
    ['Peso ♀', PR.pesoHembras === '' || PR.pesoHembras === undefined ? '—' : nf(PR.pesoHembras, 2) + ' g', PR.pesoMachos === '' || PR.pesoMachos === undefined ? '' : '♂ ' + nf(PR.pesoMachos, 2) + ' g'],
  ];
  const filasCuadre = (C.filas || []).map((fi) => `<tr class="${fi.id === 'vivos' ? 'rp-cuadre-fin' : ''}">${celdas([
    esc(fi.signo + ' ' + fi.etiqueta), nf(fi.machos), nf(fi.hembras), `<b>${nf(fi.total)}</b>`,
  ])}</tr>`);
  const dlc = C.deLosCuales || {};
  const notaCuadre = `<div class="rp-pie-b">
      De los muertos: en desove ${nf((dlc.desove || {}).muertas)} de ${nf((dlc.desove || {}).entran)} que entraron ·
      en recuperación ${nf((dlc.recuperacion || {}).muertas)} de ${nf((dlc.recuperacion || {}).entran)}.
      ${C.cuadra ? 'La cascada <b>cuadra</b>.' : '<b>⚠ No cuadra por ' + nf(Math.abs((C.descuadre || {}).total)) + '</b>: la diferencia no está explicada por el libro.'}
      ${(C.deficit || {}).total ? ' Déficit de cierre: ' + nf(C.deficit.total) + ' (se pidió más de lo que había).' : ''}</div>`;
  const filasOrigen = (f.origen || []).map((o) => `<tr>${celdas([
    dm(o.fecha), esc(ubic(o.sala, o.tanque)), esc(o.codigo || '—'), esc(o.piscina || '—'), nf(o.total),
  ])}</tr>`);
  const sub = `Lote ${f.lote} · ${f.estado || 'sin estado'} · ${r.cabecera.diaLargo}`;
  return cabeceraHtml('Maduración · Cierre de lote', sub, r.abierto ? 'EN CURSO — el lote sigue abierto: las cifras son a la foto' : '')
    + kpisHtml(kpis)
    + `<section class="rp-b rp-cuadre"><h3>⚖ Cascada del cuadre</h3>
        <table class="rp-tab"><thead><tr>${cabeceras(['', '♂', '♀', 'Total'])}</tr></thead><tbody>${filasCuadre.join('')}</tbody></table>${notaCuadre}</section>
      <div class="rp-cols">${bloqueCurva(f.curva, '📈 Vivos a lo largo del ciclo')}
        <section class="rp-b"><h3>🧬 Origen</h3>${tabla(['Día', 'Ubicación', 'Código', 'Piscina', 'Animales'], filasOrigen, tope, 'Sin filas de Ingreso para este lote.', 'ingresos')}
          <div class="rp-pie-b">${(f.codigos || []).length ? 'Códigos: ' + (f.codigos || []).join(' · ') : ''}${(f.salas || []).length ? ' · Salas: ' + f.salas.join(' · ') : ''}</div></section></div>
      <section class="rp-b"><h3>🥚 Reproducción del ciclo</h3>
        <table class="rp-tab"><thead><tr>${cabeceras(['Desoves', 'Huevos', 'No viables', 'N2', 'N5', 'Fertilidad'])}</tr></thead>
        <tbody><tr>${celdas([nf(R.desoves), nf(R.huevos), nf(R.noViables), nf(R.n2), nf(R.n5), pc(R.fertilidad)])}</tr></tbody></table>
        <div class="rp-pie-b">Cópulas ${pc(PR.pctCopulas)} · muda ${pc(PR.pctMuda)}${PR.compartido ? ' · repartidos: el lote comparte tanque' : ''}</div></section>`;
}

/* ── F7.3 · LAS PÁGINAS DEL BROODSTOCK ──────────────────────── */

/** Una sobrevivencia que no puede ser un porcentaje se enseña COMO VINO y marcada, igual que en pantalla. */
function sobrevHtml(P) {
  if (P.sobrevivencia === null || P.sobrevivencia === '' || P.sobrevivencia === undefined) return '—';
  const v = nf(P.sobrevivencia, 1) + ' %';
  return P.sobrevivenciaDudosa ? `<b>⚠ ${esc(v)}</b>` : esc(v);
}

/** La página 1: todas las piscinas del último corte, y los avisos. */
export function broodstockResumenHtml(rep, opts = {}) {
  const r = rep || {};
  const tope = opts.tope === undefined ? TOPE_FILAS * 2 : opts.tope;   // la tabla es el cuerpo de la página: cabe más
  const filas = (r.piscinas || []).map((P) => `<tr>${celdas([
    `<b>${esc(P.piscina)}</b>`, esc(P.fase || '—') + (P.faseEnCatalogo === false ? ' ⚠' : ''),
    nf(P.peso, 2), nf(P.incremento, 2), nf(P.crecimiento, 2), sobrevHtml(P), nf(P.densidad, 1), nf(P.edad),
    (P.lotes || []).length ? esc(P.lotes.join(' · ')) : '<span style="color:#888">—</span>',
  ])}</tr>`);
  const avisos = [];
  if ((r.ausentes || []).length) avisos.push(`Sin carga en este corte, y sí en el anterior (${esc(dma(r.previo))}): <b>${r.ausentes.map((x) => esc(x)).join(' · ')}</b>`);
  if ((r.sinBroodstock || []).length) avisos.push(`Piscinas del Ingreso que NUNCA aparecen en Broodstock: <b>${r.sinBroodstock.map((x) => esc(x)).join(' · ')}</b>`);
  const sub = `${nf((r.piscinas || []).length)} piscina(s) en el último corte · ${nf(r.cortes)} corte(s) registrados`;
  return cabeceraHtml('Maduración · Broodstock', (r.cabecera || {}).diaLargo + ' · ' + sub,
    (r.cabecera || {}).filtrado ? alcanceDelParte(r.cabecera) : '')
    + `<section class="rp-b"><h3>📈 Las piscinas en el corte del ${esc(dma(r.corte))}</h3>
      ${tabla(['Piscina', 'Fase', 'Peso (g)', 'Δ semana', 'Crec. (g/sem)', 'Sobrev.', 'Dens.', 'Edad (d)', 'Lotes que salieron'], filas, tope, 'No hay ninguna carga de Broodstock hasta esta fecha.', 'piscinas')}</section>
    <section class="rp-b"><h3>⚠ Avisos del Broodstock</h3>${avisos.length
    ? '<ul class="rp-avisos-l">' + avisos.map((a) => '<li>' + a + '</li>').join('') + '</ul>'
    : '<div class="rp-vacio">Ninguno: todas las piscinas del corte anterior siguen, y todas las del Ingreso tienen carga.</div>'}</section>`;
}

/** Una página por piscina: su serie de cortes, los lotes que salieron de ella y sus observaciones. */
export function broodstockPiscinaHtml(ficha, rep, opts = {}) {
  const f = ficha || {};
  const r = rep || {};
  const tope = opts.tope === undefined ? TOPE_FILAS : opts.tope;
  const U = f.ultimo || {};
  const kpis = [
    ['Peso actual', U.peso === null || U.peso === undefined ? '—' : nf(U.peso, 2) + ' g', U.fechaPeso ? 'pesado el ' + dm(U.fechaPeso) : ''],
    ['Δ última semana', U.incremento === null || U.incremento === undefined ? '—' : nf(U.incremento, 2) + ' g', 'crec. ' + (U.crecimiento === null || U.crecimiento === undefined ? '—' : nf(U.crecimiento, 2) + ' g/sem')],
    ['Fase', U.fase || '—', U.faseEnCatalogo === false ? '⚠ fuera del catálogo' : 'edad ' + (U.edad === null || U.edad === undefined ? '—' : nf(U.edad) + ' d')],
    ['Sobrevivencia', U.sobrevivencia === null || U.sobrevivencia === undefined || U.sobrevivencia === '' ? '—' : nf(U.sobrevivencia, 1) + ' %', U.sobrevivenciaDudosa ? '⚠ no puede ser un porcentaje' : ''],
    ['Densidad', U.densidad === null || U.densidad === undefined ? '—' : nf(U.densidad, 1), U.area === null || U.area === undefined ? '' : nf(U.area, 2) + ' ha'],
    ['Sembrada', U.sembrada === null || U.sembrada === undefined ? '—' : nf(U.sembrada), U.fechaSiembra ? 'el ' + dm(U.fechaSiembra) : ''],
    ['Código', U.codigo || '—', U.camaronera || ''],
  ];
  const curva = (f.serie || []).filter((s) => s.peso !== null && s.peso !== '' && s.peso !== undefined)
    .map((s) => ({ fecha: s.corte, total: s.peso }));
  const filasSerie = (f.serie || []).slice().reverse().map((s) => `<tr>${celdas([
    dm(s.corte), esc(s.fase || '—'), nf(s.peso, 2), nf(s.incremento, 2), nf(s.crecimiento, 2),
    s.sobrevivencia === null || s.sobrevivencia === '' || s.sobrevivencia === undefined ? '—' : nf(s.sobrevivencia, 1) + ' %',
  ])}</tr>`);
  const filasLotes = (f.lotes || []).map((l) => `<tr>${celdas([
    `<b>${esc(l.lote)}</b>`, esc(l.estado || '—'), nf(l.entraron.total), l.vivos === null ? '—' : nf(l.vivos), pc(l.supervivencia),
    (l.otrasPiscinas || []).length ? esc(l.otrasPiscinas.join(' · ')) : '—',
  ])}</tr>`);
  const filasObs = (f.observaciones || []).map((o) => `<tr>${celdas([dm(o.corte), esc(o.texto)])}</tr>`);
  return cabeceraHtml('Maduración · Broodstock · piscina ' + (f.piscina || '—'),
    (esIso(U.corte) ? 'último corte ' + dma(U.corte) : 'sin corte') + ' · serie ' + dm((r.periodo || {}).desde) + ' – ' + dma((r.periodo || {}).hasta),
    (r.cabecera || {}).filtrado ? alcanceDelParte(r.cabecera) : '')
    + kpisHtml(kpis)
    + `<div class="rp-cols">${bloqueCurva(curva, '📈 Peso por corte', 2)}
      <section class="rp-b"><h3>🗓 Cortes del período</h3>
        ${tabla(['Corte', 'Fase', 'Peso', 'Δ', 'Crec.', 'Sobrev.'], filasSerie, tope, 'Sin cortes en el período elegido.', 'cortes')}</section></div>
    <div class="rp-cols">
      <section class="rp-b"><h3>🧬 Lotes que salieron de esta piscina</h3>
        ${tabla(['Lote', 'Estado', 'Entraron', 'Vivos', 'Superv.', 'También de'], filasLotes, tope, 'Ningún lote del Ingreso nombra a esta piscina.', 'lotes')}</section>
      <section class="rp-b"><h3>📝 Observaciones</h3>
        ${tabla(['Corte', 'Observación'], filasObs, tope, 'Sin observaciones en los cortes del período.', 'observaciones')}</section>
    </div>`;
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

/* ── F7.2 · DOCUMENTOS, NOMBRES Y EXCEL DE LOS DOS REPORTES NUEVOS ─────────── */

/** Lo que puede ir en un nombre de archivo sin que el navegador lo cambie. */
const limpioParaArchivo = (s) => txt(s).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'sin-nombre';

export function nombreDelSemanal(rep) {
  const r = rep || {};
  const p = r.periodo || {};
  return `Semanal_${esIso(p.desde) ? p.desde : 'sin-fecha'}_a_${esIso(p.hasta) ? p.hasta : 'sin-fecha'}${(r.cabecera || {}).filtrado ? '_filtrado' : ''}`;
}

export function nombreDelCierre(rep) {
  const r = rep || {};
  return `Cierre_lote_${limpioParaArchivo(r.lote)}_${esIso(r.dia) ? r.dia : 'sin-fecha'}`;
}

/** El documento del semanal: UNA PÁGINA POR LOTE, encadenadas en un solo documento (decisión del usuario). */
export function semanalDoc(rep, opts = {}) {
  const r = rep || {};
  return documentoDeReporte({
    fileName: txt(opts.fileName) || nombreDelSemanal(r),
    dia: r.dia,
    paginas: (r.paginas || []).map((pg) => ({ cuerpo: semanalPaginaHtml(pg, opts), dia: r.dia })),
    generado: txt((r.cabecera || {}).generado),
  });
}

/** El documento del cierre: una página. */
export function cierreDoc(rep, opts = {}) {
  const r = rep || {};
  return documentoDeReporte({
    fileName: txt(opts.fileName) || nombreDelCierre(r),
    dia: r.dia,
    paginas: [cierreHtml(r, opts)],
    generado: txt((r.cabecera || {}).generado),
  });
}

/** El Excel del semanal: cada hoja lleva la columna LOTE, porque el libro abarca varios. */
export function semanalHojas(rep) {
  const r = rep || {};
  const pgs = r.paginas || [];
  const P = r.periodo || {};
  const contexto = [
    ['Maduración · Semanal por lote'],
    ['Período', (P.desde || '') + ' a ' + (P.hasta || '')],
    ['Alcance', alcanceDelParte(r.cabecera)],
    ['Generado', txt((r.cabecera || {}).generado)],
    [],
  ];
  const resumen = [
    ...contexto,
    ['Lote', 'Estado', 'Ingreso', 'Cerrado', 'Días', 'Vivos ♂', 'Vivos ♀', 'Vivos', 'Supervivencia %', 'Bajas natural',
      'Bajas descarte', 'En desove', 'Desoves', 'Huevos', 'N2', 'N5', 'Fertilidad %', 'Peso ♂ (g)', 'Peso ♀ (g)', 'Cópulas %', 'Muda %'],
    ...pgs.map((p) => [p.lote, p.estado, p.ingreso, p.cerrado, p.dias === '' ? '' : p.dias,
      ent(p.vivos.machos), ent(p.vivos.hembras), ent(p.vivos.total),
      (p.supervivencia || {}).total === '' ? '' : (p.supervivencia || {}).total,
      ent(((p.bajasTotales || {}).natural || {}).total), ent(((p.bajasTotales || {}).descarte || {}).total), ent(p.desove),
      ent(p.reproduccion.desoves), ent(p.reproduccion.huevos), ent(p.reproduccion.n2), ent(p.reproduccion.n5),
      p.reproduccion.fertilidad === '' ? '' : p.reproduccion.fertilidad,
      p.promedios.pesoMachos === '' ? '' : p.promedios.pesoMachos, p.promedios.pesoHembras === '' ? '' : p.promedios.pesoHembras,
      p.promedios.pctCopulas === '' ? '' : p.promedios.pctCopulas, p.promedios.pctMuda === '' ? '' : p.promedios.pctMuda]),
  ];
  const curva = [
    ['Lote', 'Fecha', 'Machos', 'Hembras', 'Total'],
    ...pgs.flatMap((p) => (p.curva || []).map((c) => [p.lote, c.fecha, ent(c.machos), ent(c.hembras), ent(c.total)])),
  ];
  const bajas = [
    ['Lote', 'Natural ♂', 'Natural ♀', 'Descarte ♂', 'Descarte ♀', 'En desove', 'Total'],
    ...pgs.map((p) => [p.lote, ent((p.bajas || { natural: {} }).natural.machos), ent((p.bajas || { natural: {} }).natural.hembras),
      ent((p.bajas || { descarte: {} }).descarte.machos), ent((p.bajas || { descarte: {} }).descarte.hembras),
      ent(p.desove), ent((p.bajasTotales || {}).total)]),
  ];
  const eventos = [
    ['Lote', 'Fecha', 'Tipo', 'Evento', 'Machos', 'Hembras'],
    ...pgs.flatMap((p) => (p.eventos || []).map((e) => [p.lote, e.fecha, e.tipo, e.etiqueta, ent(e.machos), ent(e.hembras)])),
  ];
  return [
    { nombre: 'Resumen', aoa: resumen },
    { nombre: 'Curva', aoa: curva },
    { nombre: 'Bajas', aoa: bajas },
    { nombre: 'Eventos', aoa: eventos },
  ];
}

/** El Excel del cierre de lote: la cascada entera, el origen, la curva completa y los eventos del ciclo. */
export function cierreHojas(rep) {
  const r = rep || {};
  const f = r.ficha || {};
  const C = f.cuadre || { filas: [], deLosCuales: {}, deficit: {}, descuadre: {} };
  const R = f.reproduccion || {};
  const PR = f.promedios || {};
  const dlc = C.deLosCuales || {};
  const resumen = [
    ['Maduración · Cierre de lote'],
    ['Lote', f.lote || ''],
    ['Estado', f.estado || ''],
    ['Ingreso', f.ingreso || ''],
    ['Cierre', f.cerrado || (r.abierto ? '(sigue abierto)' : '')],
    ['Días', (r.periodo || {}).dias || ''],
    ['A la fecha', r.dia || ''],
    ['Generado', txt((r.cabecera || {}).generado)],
    [],
    ['Indicador', 'Machos', 'Hembras', 'Total'],
    ['Ingresados', ent((C.ingresados || {}).machos), ent((C.ingresados || {}).hembras), ent((C.ingresados || {}).total)],
    ['Vivos', ent((C.vivos || {}).machos), ent((C.vivos || {}).hembras), ent((C.vivos || {}).total)],
    ['Cópulas %', '', '', PR.pctCopulas === '' ? '' : PR.pctCopulas],
    ['Muda %', '', '', PR.pctMuda === '' ? '' : PR.pctMuda],
    ['Peso promedio (g)', PR.pesoMachos === '' ? '' : PR.pesoMachos, PR.pesoHembras === '' ? '' : PR.pesoHembras, ''],
  ];
  const cascada = [
    ['Paso', 'Signo', 'Machos', 'Hembras', 'Total'],
    ...(C.filas || []).map((fi) => [fi.etiqueta, fi.signo, ent(fi.machos), ent(fi.hembras), ent(fi.total)]),
    [],
    ['De los muertos: entraron', 'muertas'],
    ['En desove', ent((dlc.desove || {}).entran), ent((dlc.desove || {}).muertas)],
    ['En recuperación', ent((dlc.recuperacion || {}).entran), ent((dlc.recuperacion || {}).muertas)],
    [],
    ['¿Cuadra?', C.cuadra ? 'sí' : 'NO'],
    ['Descuadre', ent((C.descuadre || {}).machos), ent((C.descuadre || {}).hembras), ent((C.descuadre || {}).total)],
    ['Déficit de cierre', ent((C.deficit || {}).machos), ent((C.deficit || {}).hembras), ent((C.deficit || {}).total)],
  ];
  const origen = [
    ['Fecha', 'Sala', 'Tanque', 'Código genético', 'Piscina', 'Camaronera', 'Machos', 'Hembras', 'Total'],
    ...(f.origen || []).map((o) => [o.fecha, o.sala, o.tanque, o.codigo, o.piscina, o.camaronera, ent(o.machos), ent(o.hembras), ent(o.total)]),
  ];
  const curva = [
    ['Fecha', 'Machos', 'Hembras', 'Total'],
    ...(f.curva || []).map((c) => [c.fecha, ent(c.machos), ent(c.hembras), ent(c.total)]),
  ];
  const eventos = [
    ['Fecha', 'Tipo', 'Evento', 'Machos', 'Hembras'],
    ...(f.eventos || []).map((e) => [e.fecha, e.tipo, e.etiqueta, ent(e.machos), ent(e.hembras)]),
  ];
  const repro = [
    ['Desoves', 'Huevos', 'No viables', 'N2', 'N5', 'Fertilidad %', 'Nauplios por desove'],
    [ent(R.desoves), ent(R.huevos), ent(R.noViables), ent(R.n2), ent(R.n5),
      R.fertilidad === '' ? '' : R.fertilidad, R.n5PorDesove === '' || R.n5PorDesove === undefined ? '' : R.n5PorDesove],
  ];
  return [
    { nombre: 'Resumen', aoa: resumen },
    { nombre: 'Cascada', aoa: cascada },
    { nombre: 'Origen', aoa: origen },
    { nombre: 'Curva', aoa: curva },
    { nombre: 'Eventos', aoa: eventos },
    { nombre: 'Reproducción', aoa: repro },
  ];
}

/* ── F7.3 · DOCUMENTO, NOMBRE Y EXCEL DEL BROODSTOCK ────────── */

export function nombreDelBroodstock(rep) {
  const r = rep || {};
  return `Broodstock_${esIso(r.corte) ? r.corte : (esIso(r.dia) ? r.dia : 'sin-fecha')}${(r.cabecera || {}).filtrado ? '_filtrado' : ''}`;
}

/** El documento: el resumen y, detrás, una página por piscina (decisión del usuario). */
export function broodstockDoc(rep, opts = {}) {
  const r = rep || {};
  return documentoDeReporte({
    fileName: txt(opts.fileName) || nombreDelBroodstock(r),
    dia: r.dia,
    paginas: [{ cuerpo: broodstockResumenHtml(r, opts), dia: r.dia }]
      .concat((r.fichas || []).map((f) => ({ cuerpo: broodstockPiscinaHtml(f, r, opts), dia: r.dia }))),
    generado: txt((r.cabecera || {}).generado),
  });
}

/** El Excel del Broodstock: el corte, las series completas, los lotes por piscina, las observaciones y los avisos. */
export function broodstockHojas(rep) {
  const r = rep || {};
  const contexto = [
    ['Maduración · Broodstock'],
    ['Último corte', r.corte || ''],
    ['Serie', ((r.periodo || {}).desde || '') + ' a ' + ((r.periodo || {}).hasta || '')],
    ['Alcance', alcanceDelParte(r.cabecera)],
    ['Generado', txt((r.cabecera || {}).generado)],
    [],
  ];
  const resumen = [
    ...contexto,
    ['Piscina', 'Fase', 'Fase en catálogo', 'Peso (g)', 'Δ semana (g)', 'Crecimiento (g/sem)', 'Sobrevivencia %',
      'Sobrevivencia dudosa', 'Densidad (cam/m²)', 'Edad (días)', 'Área (ha)', 'Cantidad sembrada', 'Peso de siembra (g)',
      'Pl/g', 'Código genético', 'Camaronera', 'Lotes que salieron'],
    ...(r.piscinas || []).map((P) => [P.piscina, P.fase, P.faseEnCatalogo ? 'sí' : 'no', P.peso, P.incremento, P.crecimiento,
      P.sobrevivencia, P.sobrevivenciaDudosa || '', P.densidad, P.edad, P.area, P.sembrada, P.pesoSiembra, P.plg,
      P.codigo, P.camaronera, (P.lotes || []).join(' · ')]),
  ];
  const series = [
    ['Piscina', 'Corte', 'Fase', 'Peso (g)', 'Δ semana (g)', 'Crecimiento (g/sem)', 'Sobrevivencia %'],
    ...(r.fichas || []).flatMap((f) => (f.serie || []).map((s) => [f.piscina, s.corte, s.fase, s.peso, s.incremento, s.crecimiento, s.sobrevivencia])),
  ];
  const lotes = [
    ['Piscina', 'Lote', 'Estado', 'Entraron ♂', 'Entraron ♀', 'Entraron', 'Vivos', 'Supervivencia %', 'También de'],
    ...(r.fichas || []).flatMap((f) => (f.lotes || []).map((l) => [f.piscina, l.lote, l.estado, ent(l.entraron.machos),
      ent(l.entraron.hembras), ent(l.entraron.total), l.vivos === null ? '' : ent(l.vivos), l.supervivencia,
      (l.otrasPiscinas || []).join(' · ')])),
  ];
  const observaciones = [
    ['Piscina', 'Corte', 'Observación'],
    ...(r.fichas || []).flatMap((f) => (f.observaciones || []).map((o) => [f.piscina, o.corte, o.texto])),
  ];
  const avisos = [
    ['Tipo', 'Piscina', 'Detalle'],
    ...(r.ausentes || []).map((p) => ['Sin carga en el último corte', p, 'estaba en el corte del ' + (r.previo || '')]),
    ...(r.sinBroodstock || []).map((p) => ['Del Ingreso, sin Broodstock', p, 'ningún corte la nombra']),
  ];
  return [
    { nombre: 'Resumen', aoa: resumen },
    { nombre: 'Series', aoa: series },
    { nombre: 'Lotes', aoa: lotes },
    { nombre: 'Observaciones', aoa: observaciones },
    { nombre: 'Avisos', aoa: avisos },
  ];
}
