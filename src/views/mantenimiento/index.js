/* ============================================================
   🔧 MANTENIMIENTO · la vista del MCP (2026-10-28, usuario; ronda 10, tarea 4, F2)

   Lo que el Excel «Registro_Blowers_Kaeser» enseñaba en sus hojas de fórmulas, sobre lo que la ficha 🔧 de Registros
   escribe en el libro y la ficha técnica que el área llena a mano («Mantenimiento Equipos» y «Mantenimiento Plan»).
   Secciones: 🚦 Semáforo (y los próximos cambios), 📈 Lecturas, 📊 Indicadores y 📜 Historial con su Excel.
   La ve el rol «Mantenimiento» (y Administrativo). Todo el cálculo vive en mantenimiento.data.js (puro, con pruebas);
   aquí sólo se pinta. Navegación por delegación (data-mn-*), contenido escapado con esc().
   ============================================================ */
import { store } from '../../core/store.js';
import { destroyAllCharts, makeChart } from '../../core/charts.js';
import { esc } from '../../core/format.js';
import {
  MNT_ESTADO, MNT_PROXIMO, MNT_TOLERANCIAS, MNT_EQUIPOS_SHEET, MNT_PLAN_SHEET, MNT_TRAB_SHEET, MNT_LECT_SHEET,
  leerTrabajos, leerLecturas, leerEquipos, leerPlan, horometros, horometroActual, proximos, porUrgencia, resumenLecturas,
  serie, umbrales,
} from './mantenimiento.data.js';
import './mantenimiento.css';

const vState = { tab: 'semaforo', lecEquipo: '', lecParam: 'corriente' };
const TABS = [['semaforo', '🚦 Semáforo'], ['lecturas', '📈 Lecturas']];
/* Los parámetros de la curva: [clave, rótulo, unidad]. El horómetro, en horas reales. */
const PARAMS = [['corriente', 'Corriente', 'A'], ['presion', 'Presión', 'psi'], ['temperatura', 'Temperatura', '°C'], ['horometro', 'Horómetro', 'h']];

/* ── Formato ── */
const fmtH = (x) => (x == null ? '—' : Number(x).toLocaleString('es-EC', { maximumFractionDigits: 2 }));
const dm = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
const dma = (iso) => (iso ? dm(iso) + '/' + iso.slice(0, 4) : '');
const hoyIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const CLASE = { [MNT_ESTADO.VENCIDO]: 'vencido', [MNT_ESTADO.PROXIMO]: 'proximo', [MNT_ESTADO.AL_DIA]: 'aldia',
  [MNT_ESTADO.SIN_DATOS]: 'sindatos', [MNT_ESTADO.SIN_PLAN]: 'sinplan' };
const estadoHTML = (e) => `<span class="mn-est mn-est--${CLASE[e] || 'sinplan'}">${esc(e)}</span>`;
const faltan = (p) => [p.faltanH != null ? fmtH(p.faltanH) + ' h' : '', p.faltanD != null ? p.faltanD + ' d' : ''].filter(Boolean).join(' · ');

/** El modelo de la vista, de lo que hay en el libro. */
function modelo() {
  const rows = store.globalData || [];
  const trabajos = leerTrabajos(rows), lecturas = leerLecturas(rows), equipos = leerEquipos(rows), plan = leerPlan(rows);
  const lista = horometros(lecturas, trabajos, equipos);
  const hoy = hoyIso();
  const hojas = new Set(rows.map((r) => r && r._SheetOrigin));
  return { trabajos, lecturas, equipos, plan, lista, hoy, prox: proximos({ equipos, plan, trabajos, lista, hoy }),
    lec: resumenLecturas(lecturas, equipos),
    hay: { trabajos: hojas.has(MNT_TRAB_SHEET), lecturas: hojas.has(MNT_LECT_SHEET), equipos: hojas.has(MNT_EQUIPOS_SHEET), plan: hojas.has(MNT_PLAN_SHEET) } };
}

/* ── Cabecera, avisos y contadores ── */
function avisosHTML(m) {
  const a = [];
  if (!m.hay.trabajos && !m.hay.lecturas) {
    a.push(`Aún no hay nada en «${esc(MNT_TRAB_SHEET)}» ni en «${esc(MNT_LECT_SHEET)}». Lo envía la ficha 🔧 de Registros (con el GAS nuevo desplegado), o se pega lo del Excel de Blowers.`);
  }
  if (!m.hay.equipos) a.push(`Falta la hoja «${esc(MNT_EQUIPOS_SHEET)}»: sin ella no hay ubicación, ajuste del horómetro ni referencias de lectura.`);
  if (!m.plan.some((p) => p.horas != null || p.dias != null)) {
    a.push(`${m.hay.plan ? `La hoja «${esc(MNT_PLAN_SHEET)}» no tiene` : `Falta la hoja «${esc(MNT_PLAN_SHEET)}», con los`} intervalos de cada actividad: el semáforo no puede juzgar nada.`);
  }
  return a.map((t) => `<div class="mn-aviso">${t}</div>`).join('');
}
function kpisHTML(m) {
  const activos = m.prox.filter((p) => !p.standBy);
  const n = (e) => activos.filter((p) => p.estado === e).length;
  const enServicio = m.equipos.filter((e) => !e.standBy).length;
  const revisar = m.lec.filter((x) => x.estado === 'REVISAR' && !x.standBy).length;
  const ultima = m.lista.reduce((u, x) => (!u || x.fecha > u ? x.fecha : u), '');
  const kpi = (v, l, cls = '') => `<div class="mn-kpi ${cls}"><div class="mn-kpi-v">${v}</div><div class="mn-kpi-l">${l}</div></div>`;
  return `<div class="mn-kpis">${kpi(n(MNT_ESTADO.VENCIDO), 'Vencidos', n(MNT_ESTADO.VENCIDO) ? 'mn-kpi--vencido' : '')}`
    + kpi(n(MNT_ESTADO.PROXIMO), `Próximos (≤ ${MNT_PROXIMO.horas} h o ≤ ${MNT_PROXIMO.dias} d)`, n(MNT_ESTADO.PROXIMO) ? 'mn-kpi--proximo' : '')
    + kpi(`${enServicio} / ${m.equipos.length}`, 'Equipos en servicio')
    + kpi(revisar, 'Lecturas a revisar', revisar ? 'mn-kpi--proximo' : '')
    + kpi(ultima ? dma(ultima) : '—', 'Último horómetro anotado') + '</div>';
}
function tabsHTML() {
  return `<nav class="mn-tabs" role="tablist">${TABS.map(([id, l]) => `<button type="button" class="mn-tab${vState.tab === id ? ' is-on' : ''}" role="tab" aria-selected="${vState.tab === id}" data-mn-tab="${id}">${l}</button>`).join('')}</nav>`;
}

/* ── 🚦 Semáforo ── */
function semaforoHTML(m) {
  const conPlan = m.plan.filter((p) => p.horas != null || p.dias != null);
  const sinPlan = m.plan.filter((p) => p.horas == null && p.dias == null).map((p) => p.actividad);
  const celda = (p) => {
    const tit = `${p.equipo} · ${p.actividad}: ${p.base}`
      + (p.ultimoFecha ? `; último el ${dma(p.ultimoFecha)} a ${fmtH(p.ultimoH)} h` : '')
      + (p.proxH != null ? `; próximo a ${fmtH(p.proxH)} h` : '') + (p.proxF ? `; o el ${dma(p.proxF)}` : '');
    return `<td class="mn-sem-c${p.standBy ? ' mn-standby' : ''}" title="${esc(tit)}">${estadoHTML(p.estado)}<span class="mn-sem-f">${esc(faltan(p))}</span></td>`;
  };
  const cabEq = m.equipos.map((e) => {
    const a = horometroActual(m.lista, e.codigo);
    return `<th class="${e.standBy ? 'mn-standby' : ''}" title="${esc([e.ubicacion, e.estado].filter(Boolean).join(' · '))}">${esc(e.codigo)}`
      + `<span class="mn-th-sub">${a ? fmtH(a.h) + ' h' : 'sin horómetro'}${e.standBy ? ' · stand by' : ''}</span></th>`;
  }).join('');
  const matriz = conPlan.length
    ? `<div class="mn-scroll"><table class="mn-tabla mn-sem"><thead><tr><th>Actividad \\ Equipo</th>${cabEq}</tr></thead><tbody>`
      + conPlan.map((p) => `<tr><th scope="row">${esc(p.actividad)}<span class="mn-th-sub">${[p.horas != null ? 'cada ' + fmtH(p.horas) + ' h' : '', p.dias != null ? 'cada ' + p.dias + ' d' : '', p.primer != null ? 'primero a ' + fmtH(p.primer) + ' h' : ''].filter(Boolean).join(' · ')}</span></th>`
        + m.equipos.map((e) => celda(m.prox.find((x) => x.equipo === e.codigo && x.actividad === p.actividad))).join('') + '</tr>').join('')
      + '</tbody></table></div>'
    : '<div class="mn-vacio">Sin intervalos en el plan, no hay semáforo.</div>';
  const lista = porUrgencia(m.prox.filter((p) => p.estado !== MNT_ESTADO.SIN_PLAN));
  const tabla = lista.length
    ? `<div class="mn-scroll"><table class="mn-tabla"><thead><tr><th>Equipo</th><th>Actividad</th><th>Último cambio</th><th>Horómetro actual</th>`
      + '<th>Próximo</th><th>Faltan</th><th>Base</th><th>Estado</th></tr></thead><tbody>'
      + lista.map((p) => `<tr class="${p.standBy ? 'mn-standby' : ''}"><td><b>${esc(p.equipo)}</b>${p.standBy ? ' <span class="mn-chip">stand by</span>' : ''}</td>`
        + `<td>${esc(p.actividad)}</td><td>${p.ultimoFecha ? `${dma(p.ultimoFecha)} · ${fmtH(p.ultimoH)} h` : '—'}</td>`
        + `<td>${p.actualH != null ? `${fmtH(p.actualH)} h <span class="mn-muted">(${dm(p.actualFecha)})</span>` : '—'}</td>`
        + `<td>${[p.proxH != null ? fmtH(p.proxH) + ' h' : '', p.proxF ? dma(p.proxF) : ''].filter(Boolean).join(' · ') || '—'}</td>`
        + `<td class="mn-num">${esc(faltan(p)) || '—'}</td><td class="mn-muted">${esc(p.base)}</td><td>${estadoHTML(p.estado)}</td></tr>`).join('')
      + '</tbody></table></div>'
    : '';
  return `<section class="card mn-card"><h3 class="mn-h3">Semáforo por equipo y actividad</h3>`
    + `<p class="mn-nota">Con el horómetro más alto anotado de cada equipo (lo del tablero + su ajuste) y la fecha de hoy. Una actividad que nunca se hizo se cuenta desde 0 h, o desde su primer cambio.</p>`
    + matriz + (sinPlan.length ? `<p class="mn-nota">Sin intervalo en el plan (no se juzgan): ${esc(sinPlan.join(' · '))}.</p>` : '') + '</section>'
    + (tabla ? `<section class="card mn-card"><h3 class="mn-h3">Próximos cambios</h3><p class="mn-nota">Primero lo vencido y lo que menos falta; los equipos en stand by, al final.</p>${tabla}</section>` : '');
}

/* ── 📈 Lecturas ── */
const ESTADO_LEC = { NORMAL: 'aldia', REVISAR: 'vencido', 'SIN LECTURA': 'sindatos' };
function lecturasHTML(m) {
  const v = (x, u) => (x == null ? '—' : fmtH(x) + (u ? ' ' + u : ''));
  const c = (r, k, u) => '<td class="mn-num' + (r.fuera.includes(k) ? ' mn-fuera' : '') + '">' + v(r.ultima && r.ultima[k], u) + '</td>';
  const filas = m.lec.map((r) => '<tr class="' + (r.standBy ? 'mn-standby' : '') + '"><td><b>' + esc(r.equipo) + '</b>'
    + (r.standBy ? ' <span class="mn-chip">stand by</span>' : '') + '</td><td>' + (esc(r.ubicacion) || '—') + '</td>'
    + '<td class="mn-num">' + r.n + '</td><td>' + (r.ultima ? dma(r.ultima.fecha) + (r.ultima.hora ? ' ' + esc(r.ultima.hora) : '') : '—') + '</td>'
    + c(r, 'corriente', 'A') + '<td class="mn-num mn-muted">' + v(r.promedio.corriente) + ' / ' + v(r.maximo.corriente) + '</td>'
    + c(r, 'presion', 'psi') + '<td class="mn-num mn-muted">' + v(r.promedio.presion) + '</td>'
    + c(r, 'temperatura', '°C') + '<td class="mn-num mn-muted">' + v(r.promedio.temperatura) + ' / ' + v(r.maximo.temperatura) + '</td>'
    + '<td class="mn-num">' + (r.carga != null ? r.carga + ' %' : '—') + '</td>'
    + '<td><span class="mn-est mn-est--' + ESTADO_LEC[r.estado] + '">' + esc(r.estado) + '</span></td></tr>').join('');
  const conLecturas = m.equipos.filter((e) => m.lecturas.some((l) => l.equipo === e.codigo));
  // Arranca en el primer equipo EN SERVICIO con lecturas (uno en stand by sólo si no hay otro).
  if (!conLecturas.some((e) => e.codigo === vState.lecEquipo)) vState.lecEquipo = (conLecturas.find((e) => !e.standBy) || conLecturas[0] || {}).codigo || '';
  if (!PARAMS.some((p) => p[0] === vState.lecParam)) vState.lecParam = 'corriente';
  const opt = (val, txt, actual) => '<option value="' + esc(val) + '"' + (val === actual ? ' selected' : '') + '>' + esc(txt) + '</option>';
  const grafico = vState.lecEquipo
    ? '<div class="mn-filtros"><select class="mn-sel" data-mn-sel="lecEquipo" aria-label="Equipo">'
      + conLecturas.map((e) => opt(e.codigo, e.codigo + (e.ubicacion ? ' · ' + e.ubicacion : ''), vState.lecEquipo)).join('') + '</select>'
      + '<select class="mn-sel" data-mn-sel="lecParam" aria-label="Lectura">'
      + PARAMS.map(([k, l, u]) => opt(k, l + ' (' + u + ')', vState.lecParam)).join('') + '</select></div>'
      + '<div class="mn-graf"><canvas id="mnLecChart" aria-label="Curva de la lectura elegida"></canvas></div>'
    : '<div class="mn-vacio">Aún no hay lecturas para dibujar.</div>';
  return '<section class="card mn-card"><h3 class="mn-h3">Lecturas por equipo</h3>'
    + '<p class="mn-nota">Lo último anotado contra la referencia de cada equipo (hoja «' + esc(MNT_EQUIPOS_SHEET) + '»): REVISAR si la corriente pasa la referencia +'
    + (MNT_TOLERANCIAS.corriente * 100) + ' %, la presión +' + (MNT_TOLERANCIAS.presion * 100) + ' % o la temperatura +' + MNT_TOLERANCIAS.temperatura
    + ' °C. Sin referencia, esa lectura no se juzga. Carga = última corriente ÷ plena carga.</p>'
    + '<div class="mn-scroll"><table class="mn-tabla"><thead><tr><th>Equipo</th><th>Ubicación</th><th>Lecturas</th><th>Última</th>'
    + '<th>Corriente</th><th>prom. / máx.</th><th>Presión</th><th>prom.</th><th>Temp.</th><th>prom. / máx.</th><th>Carga</th><th>Estado</th></tr></thead>'
    + '<tbody>' + filas + '</tbody></table></div></section>'
    + '<section class="card mn-card"><h3 class="mn-h3">Curva</h3>' + grafico + '</section>';
}
function dibujarLecturas(root, m) {
  const cv = root.querySelector('#mnLecChart');
  if (!cv || !vState.lecEquipo) return;
  const [k, l, u] = PARAMS.find((p) => p[0] === vState.lecParam);
  const s = serie(m.lecturas, m.equipos, vState.lecEquipo, k);
  const lim = k === 'horometro' ? null : umbrales(m.equipos.find((e) => e.codigo === vState.lecEquipo))[k];
  const datasets = [{ label: l + ' (' + u + ')', data: s.map((x) => x.v), borderColor: '#00838F', backgroundColor: 'rgba(0,131,143,.15)', tension: 0.25, pointRadius: 3 }];
  if (lim != null) datasets.push({ label: 'Alerta (' + fmtH(lim) + ' ' + u + ')', data: s.map(() => Math.round(lim * 100) / 100), borderColor: '#e8303e', borderDash: [6, 4], pointRadius: 0 });
  makeChart(cv, { type: 'line', data: { labels: s.map((x) => dm(x.fecha) + (x.hora ? ' ' + x.hora : '')), datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
}

const SECCION = { semaforo: semaforoHTML, lecturas: lecturasHTML };
const DIBUJO = { lecturas: dibujarLecturas };

export function mantenimientoView(root) {
  if (!store.globalData.length) {
    root.innerHTML = '<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>';
    return;
  }
  destroyAllCharts();
  const m = modelo();
  if (!SECCION[vState.tab]) vState.tab = 'semaforo';
  root.innerHTML = `<div class="mn"><div class="mn-cab"><h2 class="mn-h2">🔧 Mantenimiento · Blowers</h2>`
    + `<span class="mn-sub">Kaeser FB 441 C / FB 621 C · ${m.trabajos.length} trabajo(s) y ${m.lecturas.length} lectura(s) en el libro</span></div>`
    + avisosHTML(m) + kpisHTML(m) + tabsHTML() + `<div class="mn-seccion">${SECCION[vState.tab](m)}</div></div>`;
  bind(root);
  if (DIBUJO[vState.tab]) DIBUJO[vState.tab](root, m);
}

function bind(root) {
  if (root._mnBound) return;
  root._mnBound = true;
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mn-tab]');
    if (!t || !root.contains(t)) return;
    vState.tab = t.dataset.mnTab;
    mantenimientoView(root);
  });
  root.addEventListener('change', (e) => {
    const s = e.target.closest('[data-mn-sel]');
    if (!s || !root.contains(s)) return;
    vState[s.dataset.mnSel] = s.value;
    mantenimientoView(root);
  });
}

