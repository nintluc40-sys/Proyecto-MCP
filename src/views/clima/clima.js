/* ============================================================
   🌦 CLIMA · la pastilla «Hoy» y su modal Día/Mes (2026-10-27, Sesión A ronda 9, tarea 1 · F2b)

   Decisiones del usuario (27-10): una pastilla en 👁️ Supervisor (junto a 🌊 Mareas), 🦐 Larvicultura, 🌿 Algas y 🥚
   Maduración (la barra Operativo/Microchips) con la hora más reciente —temperatura · humedad · viento; la hora y la fuente
   en la ayuda—, que avisa si lo último tiene más de 6 h y no aparece sin datos; al pulsarla, un modal como el de 🌊 Mareas:
   «Día» (la curva por horas, las franjas de 6 h, las horas con su fuente y, hoy, el pronóstico de 3 días) y «Mes» (la
   tendencia diaria y la tabla de días, con los incompletos «N de 24 h»). Sólo el dato: sin semáforo.
   Las cifras salen de clima.data.js (puro); aquí sólo el marcado, los dos gráficos y el cableado. Cada vista pinta
   `climaPastillaHTML()` donde va y `climaModalHTML()` al final, y llama a `cablearClima(root, …)` tras pintar.
   ============================================================ */
import './clima.css';
import { store } from '../../core/store.js';
import { makeChart, destroyChart } from '../../core/charts.js';
import { esc } from '../../core/format.js';
import { bindModal } from '../../ui/modal.js';
import {
  climaHoras, climaDias, estadoHoy, horasDelDia, franjas, incompleto, pronostico, mesesDe, resumenMes,
  fmt, fmtHora, fmtInstante, textoPastilla, ahoraEcuador, ATRIBUCION,
} from './clima.data.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const C_T = '#e8912b', C_SENS = '#c0582b', C_HR = '#2b7bd6', C_LL = '#00838f';

let _cache = null;
/** Las horas y los días de clima, memoizados por identidad del store (se lee en cada pintada de cuatro vistas). */
function datos() {
  const data = store.globalData;
  if (!_cache || _cache.data !== data) _cache = { data, horas: climaHoras(data), dias: climaDias(data) };
  return _cache;
}
const hayClima = () => { const d = datos(); return d.horas.length > 0 || d.dias.length > 0; };

const fechaLarga = (key) => { const [y, m, d] = key.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
const mesLargo = (mk) => { const [y, m] = mk.split('-').map(Number); return MESES[m - 1] + ' ' + y; };
const corto = (key) => { const [, m, d] = key.split('-'); return d + '/' + m; };

/** La pastilla, o '' si no hay ninguna hora de clima. `clase`: la del botón (Supervisor usa la de sus acciones). */
export function climaPastillaHTML({ clase = 'clima-pill' } = {}) {
  const t = textoPastilla(estadoHoy(datos().horas));
  if (!t) return '';
  return `<button type="button" class="${esc(clase)} clima-pastilla${t.viejo ? ' clima-pastilla--vieja' : ''}" data-clima-open title="${esc(t.ayuda)}">${esc(t.texto)}</button>`;
}

/** El modal, cerrado; '' si no hay clima. Lo abre cualquier `[data-clima-open]` del root que se pase a `cablearClima`. */
export function climaModalHTML() {
  if (!hayClima()) return '';
  return `<div class="sv-modal" id="climaModal" data-climamodal>
    <div class="sv-modal-card lv-fs-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">🌦 Clima · Laboratorio Mar Bravo <span class="muted">· Salinas</span></span>
        <button class="sv-modal-x" data-clima-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-bm-modebar">
          <span class="sv-bm-mode-label">Vista:</span>
          <button class="sv-bm-mode-btn is-active" data-climamode="dia">📅 Día</button>
          <button class="sv-bm-mode-btn" data-climamode="mes">📈 Mes</button>
        </div>
        <div id="climaBody"></div>
        <p class="clima-cita muted">${esc(ATRIBUCION)}</p>
      </div>
    </div>
  </div>`;
}

/* ---------- vista Día ---------- */
/** Un indicador; sin ninguna cifra («—»), sin unidad. */
const kpi = (l, v, u) => `<div class="sv-marea-kpi"><div class="sv-marea-kpi-l">${esc(l)}</div><div class="sv-marea-kpi-v">${v}${u && /\d/.test(v) ? `<span class="sv-marea-kpi-u">${u}</span>` : ''}</div></div>`;

function selDiaHTML(dias, key) {
  const i = dias.findIndex((d) => d.key === key);
  const prev = i > 0 ? dias[i - 1].key : '', next = i >= 0 && i < dias.length - 1 ? dias[i + 1].key : '';
  const opts = dias.map((d) => `<option value="${d.key}"${d.key === key ? ' selected' : ''}>${esc(corto(d.key))}${d.tipo === 'Pronóstico' ? ' · pronóstico' : ''}</option>`).join('');
  return `<div class="sv-marea-selbar"><div class="sv-marea-daynav">
      <button class="sv-micro-navbtn" data-clima-dia="${prev}"${prev ? '' : ' disabled'} aria-label="Día anterior">◀</button>
      <select class="sv-modal-select" data-clima-diasel aria-label="Día">${opts}</select>
      <button class="sv-micro-navbtn" data-clima-dia="${next}"${next ? '' : ' disabled'} aria-label="Día siguiente">▶</button>
    </div></div>`;
}

function diaHTML(key, ahoraMs) {
  const { horas, dias } = datos();
  const dia = dias.find((d) => d.key === key) || null;
  const hs = horasDelDia(horas, key);
  const hoy = ahoraEcuador(ahoraMs).key;
  const est = estadoHoy(horas, ahoraMs);
  const aviso = est && est.viejo ? `<div class="clima-aviso">⚠ El clima no se actualiza desde ${esc(est.act != null ? fmtInstante(est.act) : '—')} (el script escribe cada 3 h).</div>` : '';
  const inc = incompleto(dia);
  const tipo = dia ? `<span class="clima-tipo clima-tipo--${dia.tipo === 'Pronóstico' ? 'pron' : 'reg'}">${esc(dia.tipo)}</span>` : '';
  /* Un «Registro» sin sus 24 horas no tiene NINGUNA cifra del día (GAS/Clima.gs): se dice una vez, y la curva y las
     franjas enseñan lo que sí hay. */
  const kpis = !dia ? '<div class="sv-marea-nodata">Este día no tiene resumen en la hoja «Clima».</div>'
    : inc ? `<p class="clima-nota">Las cifras del día salen cuando tiene sus 24 horas; lleva ${dia.horas}. Abajo, lo que ya hay, hora a hora.</p>`
    : `<div class="clima-kpis">
      ${kpi('Temp. media', fmt(dia.tMed), '°C')}
      ${kpi('Mín – máx', `${fmt(dia.tMin)} – ${fmt(dia.tMax)}`, '°C')}
      ${kpi('Humedad', fmt(dia.hr, 0), '%')}
      ${kpi('Lluvia', fmt(dia.lluvia), 'mm')}
      ${kpi('Viento medio · máx', `${fmt(dia.v, 0)} · ${fmt(dia.vMax, 0)}`, 'km/h')}
      ${kpi('UV máx', fmt(dia.uvMax), '')}
      ${kpi('Sensación máx', fmt(dia.sensMax), '°C')}
      ${kpi('Radiación', fmt(dia.rad), 'kWh/m²')}
    </div>`;
  const fr = franjas(hs);
  const franjasHTML = hs.length ? `<table class="sv-table clima-tabla"><thead><tr><th>Franja</th><th>Temp. media (mín–máx)</th><th>Humedad</th><th>Viento medio (máx)</th><th>Lluvia</th><th>Nubosidad</th><th>Horas</th></tr></thead><tbody>${fr.map((f) => `<tr>
      <td>${pad2(f.desde)}–${pad2(f.hasta)}</td>
      <td>${f.tMed == null ? '—' : `${fmt(f.tMed)} °C <span class="muted">(${fmt(f.tMin)}–${fmt(f.tMax)})</span>`}</td>
      <td>${f.hr == null ? '—' : fmt(f.hr, 0) + ' %'}</td>
      <td>${f.v == null ? '—' : `${fmt(f.v, 0)} km/h <span class="muted">(${fmt(f.vMax, 0)})</span>`}</td>
      <td>${f.lluvia == null ? '—' : fmt(f.lluvia) + ' mm'}</td>
      <td>${f.nube == null ? '—' : fmt(f.nube, 0) + ' %'}</td>
      <td class="muted">${f.n} de 6</td></tr>`).join('')}</tbody></table>` : '';
  const pron = key === hoy ? pronostico(dias, hoy) : [];
  const pronHTML = pron.length ? `<div class="sv-marea-panel"><div class="sv-marea-ptitle">Pronóstico (MET Noruega)</div><div class="clima-pron">${pron.map((p) => `<div class="clima-pron-d">
      <div class="clima-pron-f">${esc(corto(p.key))}</div>
      <div class="clima-pron-t">${fmt(p.tMin)} – ${fmt(p.tMax)} °C</div>
      <div class="muted">💧 ${fmt(p.lluvia)} mm · 💨 ${fmt(p.v, 0)} km/h${p.uvMax != null ? ` · UV ${fmt(p.uvMax)}` : ''}</div></div>`).join('')}</div></div>` : '';
  const filas = hs.map((h) => `<tr${h.ms > ahoraMs ? ' class="clima-futura"' : ''}>
      <td>${fmtHora(h.hora)}</td><td>${esc(h.fuente || '—')}${h.ms > ahoraMs ? ' <span class="muted">(pronóstico)</span>' : ''}</td>
      <td>${fmt(h.t)}</td><td>${fmt(h.sens)}</td><td>${fmt(h.hr, 0)}</td><td>${fmt(h.v, 0)}</td><td>${fmt(h.dir, 0)}</td>
      <td>${fmt(h.p)}</td><td>${fmt(h.lluvia)}</td><td>${fmt(h.nube, 0)}</td><td>${fmt(h.uv)}</td><td>${esc(h.wx || '')}</td></tr>`).join('');
  const horasHTML = hs.length ? `<details class="clima-horas"><summary>Las ${hs.length} horas, con su fuente</summary>
      <div class="clima-scroll"><table class="sv-table clima-tabla"><thead><tr><th>Hora</th><th>Fuente</th><th>°C</th><th>Sensación</th><th>Hum. %</th><th>Viento km/h</th><th>Dir. °</th><th>hPa</th><th>Lluvia mm</th><th>Nubes %</th><th>UV</th><th>Tiempo observado</th></tr></thead><tbody>${filas}</tbody></table></div></details>` : '';
  return `${aviso}
    <div class="clima-cab"><b>${esc(fechaLarga(key))}</b> ${tipo}${inc ? ` <span class="clima-inc">${esc(inc)}</span>` : ''}</div>
    ${kpis}
    ${hs.length ? `<div class="sv-marea-panel"><div class="sv-marea-ptitle">Por horas · temperatura, sensación y humedad</div>
      <div class="sv-marea-charthost"><canvas id="climaDiaChart"></canvas></div></div>
      <div class="sv-marea-panel"><div class="sv-marea-ptitle">Franjas de 6 horas</div><div class="clima-scroll">${franjasHTML}</div></div>`
    : '<div class="sv-marea-nodata">Sin horas para este día en «Clima horas».</div>'}
    ${pronHTML}
    ${horasHTML}`;
}
const pad2 = (n) => String(n).padStart(2, '0');

function dibujarDia(key, ahoraMs) {
  const hs = horasDelDia(datos().horas, key);
  if (!hs.length) return;
  const fut = (i) => hs[i].ms > ahoraMs;
  const discontinua = { borderDash: (c) => (fut(c.p1DataIndex) ? [5, 4] : undefined) };   // lo que queda de hoy: pronóstico
  makeChart('climaDiaChart', {
    type: 'line',
    data: {
      labels: hs.map((h) => fmtHora(h.hora)),
      datasets: [
        { label: 'Temperatura (°C)', data: hs.map((h) => h.t), borderColor: C_T, backgroundColor: C_T, yAxisID: 'y', tension: 0.3, pointRadius: 2, spanGaps: false, segment: discontinua },
        { label: 'Sensación (°C)', data: hs.map((h) => h.sens), borderColor: C_SENS, backgroundColor: C_SENS, yAxisID: 'y', tension: 0.3, pointRadius: 0, borderDash: [2, 3], spanGaps: false },
        { label: 'Humedad (%)', data: hs.map((h) => h.hr), borderColor: C_HR, backgroundColor: C_HR, yAxisID: 'y2', tension: 0.3, pointRadius: 0, spanGaps: false, segment: discontinua },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: { callbacks: { footer: (it) => { const h = hs[it[0].dataIndex]; return h.fuente + (h.ms > ahoraMs ? ' · pronóstico' : ''); } } } },
      scales: { y: { title: { display: true, text: '°C' } }, y2: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: 'Humedad %' } } },
    },
  });
}

/* ---------- vista Mes ---------- */
function mesHTML(mk) {
  const { dias } = datos();
  const meses = mesesDe(dias);
  const delMes = dias.filter((d) => d.key.slice(0, 7) === mk);
  const r = resumenMes(delMes);
  const pills = meses.map((m) => `<button class="sv-marea-mbtn${m === mk ? ' is-on' : ''}" data-clima-mes="${m}">${esc(mesLargo(m))}</button>`).join('');
  const filas = delMes.map((d) => `<tr${d.tipo === 'Pronóstico' ? ' class="clima-futura"' : ''}>
      <td>${esc(corto(d.key))}</td><td>${esc(d.tipo)}</td>
      <td>${d.tMed == null && incompleto(d) ? `<span class="clima-inc">${esc(incompleto(d))}</span>` : `${fmt(d.tMin)} / ${fmt(d.tMed)} / ${fmt(d.tMax)}`}</td>
      <td>${fmt(d.hr, 0)}</td><td>${fmt(d.lluvia)}</td><td>${fmt(d.v, 0)} · ${fmt(d.vMax, 0)}</td><td>${fmt(d.uvMax)}</td><td>${fmt(d.rad)}</td>
      <td class="muted">${d.tipo === 'Registro' ? `${d.hSesa} / ${d.hMet} / ${d.hNasa}` : ''}</td></tr>`).join('');
  return `<div class="sv-marea-selbar"><div class="sv-marea-months">${pills}</div></div>
    <div class="clima-kpis">
      ${kpi('Temp. media del mes', fmt(r.tMed), '°C')}
      ${kpi('Mínima · máxima', `${fmt(r.tMin)} · ${fmt(r.tMax)}`, '°C')}
      ${kpi('Lluvia total', fmt(r.lluvia), 'mm')}
      ${kpi('Días con lluvia (≥ 1 mm)', String(r.diasLluvia), '')}
      ${kpi('Días incompletos', String(r.incompletos), `de ${r.dias}`)}
    </div>
    <div class="sv-marea-panel"><div class="sv-marea-ptitle">Tendencia diaria · temperatura mínima, media y máxima, y lluvia</div>
      <div class="sv-marea-charthost"><canvas id="climaMesChart"></canvas></div></div>
    <div class="sv-marea-panel"><div class="sv-marea-ptitle">Los días</div><div class="clima-scroll">
      <table class="sv-table clima-tabla"><thead><tr><th>Día</th><th>Tipo</th><th>°C mín / media / máx</th><th>Hum. %</th><th>Lluvia mm</th><th>Viento km/h (medio · máx)</th><th>UV máx</th><th>kWh/m²</th><th>Horas SESA / MET / NASA</th></tr></thead><tbody>${filas}</tbody></table>
    </div></div>`;
}

function dibujarMes(mk) {
  const delMes = datos().dias.filter((d) => d.key.slice(0, 7) === mk);
  if (!delMes.length) return;
  const pron = (c) => delMes[c.p1DataIndex] && delMes[c.p1DataIndex].tipo === 'Pronóstico';
  const seg = { borderDash: (c) => (pron(c) ? [5, 4] : undefined) };
  makeChart('climaMesChart', {
    type: 'bar',
    data: {
      labels: delMes.map((d) => corto(d.key)),
      datasets: [
        { type: 'line', label: 'Máxima (°C)', data: delMes.map((d) => d.tMax), borderColor: '#c62828', backgroundColor: '#c62828', yAxisID: 'y', pointRadius: 2, tension: 0.2, segment: seg },
        { type: 'line', label: 'Media (°C)', data: delMes.map((d) => d.tMed), borderColor: C_T, backgroundColor: C_T, yAxisID: 'y', pointRadius: 2, tension: 0.2, segment: seg },
        { type: 'line', label: 'Mínima (°C)', data: delMes.map((d) => d.tMin), borderColor: C_HR, backgroundColor: C_HR, yAxisID: 'y', pointRadius: 2, tension: 0.2, segment: seg },
        // la lluvia del pronóstico, más clara (como sus líneas, discontinuas)
        { type: 'bar', label: 'Lluvia (mm)', data: delMes.map((d) => d.lluvia), yAxisID: 'y2', borderColor: C_LL, borderWidth: delMes.map((d) => (d.tipo === 'Pronóstico' ? 1 : 0)),
          backgroundColor: delMes.map((d) => (d.tipo === 'Pronóstico' ? 'rgba(0,131,143,.15)' : 'rgba(0,131,143,.45)')) },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: { callbacks: { footer: (it) => { const d = delMes[it[0].dataIndex]; return d.tipo + (incompleto(d) ? ' · ' + incompleto(d) : ''); } } } },
      scales: { y: { title: { display: true, text: '°C' } }, y2: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'mm' } } },
    },
  });
}

/* ---------- cableado ---------- */
function pintar(body, state) {
  destroyChart('climaDiaChart');
  destroyChart('climaMesChart');
  const ahoraMs = Date.now();
  if (state.modo === 'mes') {
    body.innerHTML = mesHTML(state.mes);
    dibujarMes(state.mes);
  } else {
    body.innerHTML = selDiaHTML(datos().dias, state.dia) + diaHTML(state.dia, ahoraMs);
    dibujarDia(state.dia, ahoraMs);
  }
}

/** Lo que enseña al abrir: el día de HOY (o el último con datos) y su mes. */
function inicial() {
  const { dias, horas } = datos();
  const hoy = ahoraEcuador().key;
  const keys = dias.length ? dias.map((d) => d.key) : [...new Set(horas.map((h) => h.key))];
  const dia = keys.filter((k) => k <= hoy).pop() || keys[keys.length - 1] || hoy;   // hoy, o el último que ya pasó
  return { modo: 'dia', dia, mes: dia.slice(0, 7) };
}

/**
 * Cablea el modal ya pintado: los `[data-clima-open]` de `root`, la barra Día/Mes y la navegación; el cierre (✕, velo,
 * Escape) lo pone `bindModal`. Abrir SIEMPRE empieza en el día de hoy. null si no hay modal (sin clima).
 */
export function cablearClima(root, overlay) {
  if (!overlay) return null;
  const body = overlay.querySelector('#climaBody');
  const state = inicial();
  const marcar = () => overlay.querySelectorAll('[data-climamode]').forEach((b) => b.classList.toggle('is-active', b.dataset.climamode === state.modo));
  overlay.querySelectorAll('[data-climamode]').forEach((b) => b.addEventListener('click', () => {
    state.modo = b.dataset.climamode;
    if (state.modo === 'mes') state.mes = state.dia.slice(0, 7);
    marcar();
    pintar(body, state);
  }));
  body.addEventListener('click', (e) => {
    const d = e.target.closest('[data-clima-dia]');
    if (d && !d.disabled && d.dataset.climaDia) { state.dia = d.dataset.climaDia; pintar(body, state); return; }
    const m = e.target.closest('[data-clima-mes]');
    if (m) { state.mes = m.dataset.climaMes; pintar(body, state); }
  });
  body.addEventListener('change', (e) => {
    const s = e.target.closest('[data-clima-diasel]');
    if (s) { state.dia = s.value; pintar(body, state); }
  });
  return bindModal(root, overlay, {
    openSel: '[data-clima-open]', closeSel: '[data-clima-close]',
    onOpen: () => { Object.assign(state, inicial()); marcar(); pintar(body, state); },
    onClose: () => { destroyChart('climaDiaChart'); destroyChart('climaMesChart'); },
  });
}
