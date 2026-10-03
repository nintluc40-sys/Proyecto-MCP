/* ============================================================
   SUPERVISOR · 🧾 Auditoría de corrida (vista) — F2 del punto 6 del usuario (2026-10-03)
   Supervisor → módulo → «🧾 Auditoría»: la hoja «Registro_Auditoria» del módulo (y de los que una transferencia une
   con él), una auditoría por corrida —la elegida, o todas, la más reciente primero—:
     · KPI: sembrado, cosechado, sobrevivencia, facturada, tinas y camiones;
     · siembra → transferencia → cosecha por tanque sembrado (cosecha ATRIBUIDA, «≈» si es estimada), con su ingreso de
       reproductores, y los subtotales por siembra;
     · los tanques cosechados (densidad con sus toneladas, recibido, sobrevivencia de la fase 2);
     · el despacho por camaronera y el detalle de cada partida (guías, facturada —★ si no es el 90 %—, placa);
     · los cruces con Datos Larvicultura (sembrado del N5 y cosechado de Despacho), que sólo se enseñan.
   Las cifras salen de `resumenAuditoria` / `crucesConLarvicultura` (auditoria.js), el MISMO cálculo que la ficha.
   ============================================================ */
import { store } from '../../core/store.js';
import { esc } from '../../core/format.js';
import { colorFor, breadcrumb, kpiGlass } from './ui.js';
import { auditoriasDelModulo, resumenAuditoria, crucesConLarvicultura, facturadaDe, esExcepcion, entero, llaveTanque } from './auditoria.js';

const n = (v, d = 0) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? '—'
  : Number(v).toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v) => (v === null || v === undefined || !Number.isFinite(v)) ? '—' : (v * 100).toFixed(1) + ' %';
const dm = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');
const tqDe = (llave) => { const [m, t] = String(llave).split('·'); return esc(m) + ' · TQ ' + esc(t); };
const tabla = (cab, filas, vacio) => `<div class="card" style="padding:0;overflow:auto">
    <table class="sv-table sv-aud-table"><thead><tr>${cab.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${filas || `<tr><td colspan="${cab.length}" class="muted" style="text-align:center;padding:14px">${esc(vacio)}</td></tr>`}</tbody></table></div>`;
const titulo = (t, nota) => `<div class="sv-section-title" style="margin-top:14px">${t}${nota ? ` <span class="muted" style="font-weight:600">· ${esc(nota)}</span>` : ''}</div>`;

/** Una auditoría (una corrida): sus bloques, en el orden de la planilla. */
function auditoriaHTML(aud, larvRows) {
  const r = resumenAuditoria(aud);
  const cruces = crucesConLarvicultura(aud, larvRows);
  const facturada = aud.cosechas.reduce((a, c) => a + (facturadaDe(c) || 0), 0);
  const placas = new Set(aud.cosechas.map((c) => String(c.placa || '').trim().toUpperCase()).filter(Boolean));
  const tinas = aud.cosechas.reduce((a, c) => a + (entero(c.tinas) || 0), 0);
  const est = ' <span title="Estimada: con transferencia, la cosecha de cada destino se reparte entre sus orígenes en proporción a lo que cada uno le transfirió" style="color:#b45309">≈</span>';

  let h = `<div class="card sv-aud-cab" style="margin-top:14px">
    <div class="sv-section-title" style="margin:0 0 8px">Corrida ${esc(aud.corrida)} <span class="muted" style="font-weight:600">· ${esc(aud.modulos.join(', '))} · ${n(aud.filas)} registro(s)</span></div>
    <div class="sv-kpi-grid sv-kpi-wide">
      ${kpiGlass('🌱', 'Sembrado', n(r.sembrado))}
      ${kpiGlass('🎣', 'Cosechado', n(r.cosechado))}
      ${kpiGlass('📈', '% Sob. final', pct(r.sob))}
      ${kpiGlass('🧾', 'Facturada', n(facturada))}
      ${kpiGlass('🧺', 'Tinas', n(tinas))}
      ${kpiGlass('🚛', 'Camiones', n(placas.size), '', false, 'placas distintas')}
    </div></div>`;

  // Siembra → transferencia → cosecha, por tanque sembrado
  const sie = new Map(aud.siembras.map((s) => [llaveTanque(s.modulo, s.tanque), s]));
  h += titulo('🌱 Siembra → 🔀 transferencia → 🎣 cosecha', 'por tanque sembrado');
  h += tabla(['Siembra', 'Tanque', 'Fecha', 'Origen', 'Lote', 'Cód. gen.', 'Sembrado', 'Dens.', 'Transferido', '% Sob. F1', 'Cosecha atribuida', '% Sob. final', 'Días', 'Ingreso reprod.'],
    r.tanques.map((t) => {
      const s = sie.get(t.llave) || {};
      const ing = [s.fechaIng ? dm(s.fechaIng) : '', s.guiasIng || ''].filter(Boolean).join(' · ');
      return `<tr><td>${esc(t.siembra || '—')}</td><td><b>${tqDe(t.llave)}</b></td><td>${dm(s.fecha)}</td><td>${esc(s.origen || '—')}</td>
        <td>${esc(s.lote || '—')}</td><td>${esc(s.codigo || '—')}</td><td>${n(t.sembrado)}</td><td>${n(t.densidad)}</td>
        <td>${n(t.transferido)}</td><td>${pct(t.sobFase1)}</td><td>${n(t.cosechado)}${t.estimada ? est : ''}</td><td>${pct(t.sob)}</td>
        <td>${n(t.dias)}</td><td>${esc(ing || '—')}</td></tr>`;
    }).join(''), 'Sin siembras registradas.');
  if (r.bloques.length) {
    h += tabla(['Siembra', 'Tanques', 'Sembrado', 'Cosechado', '% Sob.'], r.bloques.map((b) => `<tr><td>${esc(b.siembra)}</td><td>${b.tanques}</td>
        <td>${n(b.sembrado)}</td><td>${n(Math.round(b.cosechado))}</td><td>${pct(b.sob)}</td></tr>`).join('')
      + `<tr><td><b>Total</b></td><td></td><td><b>${n(r.sembrado)}</b></td><td><b>${n(r.cosechado)}</b></td><td><b>${pct(r.sob)}</b></td></tr>`);
  }
  if (r.estimada) h += `<p class="muted" style="font-size:12px;margin:6px 0 0">≈ Estimada: con transferencia, la cosecha de cada tanque de destino se reparte entre sus orígenes en proporción a lo que cada uno le transfirió.</p>`;

  // Tanques cosechados
  h += titulo('🎣 Tanques cosechados', 'densidad con sus toneladas; fase 2 = cosechado ÷ recibido');
  h += tabla(['Tanque', 'Cosechado', 'Dens. cosecha', 'Recibido', '% Sob. F2', 'Partidas'],
    r.cosechados.map((c) => `<tr><td><b>${tqDe(c.llave)}</b></td><td>${n(c.cosechado)}</td><td>${n(c.densidad)}</td><td>${n(c.recibido)}</td>
      <td>${pct(c.sobFase2)}</td><td>${aud.cosechas.filter((x) => llaveTanque(x.modulo, x.tanque) === c.llave).length}</td></tr>`).join(''), 'Sin cosechas registradas.');

  // Despacho por camaronera y partidas
  h += titulo('🚛 Despacho por camaronera');
  h += tabla(['Camaronera', 'Cant. real', 'Cant. facturada', 'PL/g promedio', 'Tinas', 'Camiones', 'Partidas'],
    r.camaroneras.map((c) => `<tr><td><b>${esc(c.camaronera)}</b></td><td>${n(c.real)}</td><td>${n(c.facturada)}${c.excepciones ? ` <span style="color:#b45309" title="Partidas con una facturada que no es el 90 % de la real">(${c.excepciones} ≠ 90 %)</span>` : ''}</td>
      <td>${n(c.plg)}</td><td>${n(c.tinas)}</td><td>${n(c.camiones)}</td><td>${c.partidas}</td></tr>`).join(''), 'Sin despachos registrados.');
  h += titulo('📋 Partidas', 'una fila por cosecha; ★ = facturada distinta del 90 %');
  h += tabla(['Fecha', 'Tanque', 'Partida', 'Real', 'Facturada', 'Estadío', 'PL/g', 'Camaronera', 'Piscina(s)', 'Guía remisión', 'Guía despacho', 'Tinas', 'Placa'],
    aud.cosechas.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).map((c) => `<tr><td>${dm(c.fecha)}</td>
      <td>${esc(c.modulo)} · TQ ${esc(c.tanque)}</td><td>${esc(c.partida || '1')}</td><td>${n(entero(c.cantidad))}</td>
      <td>${n(facturadaDe(c))}${esExcepcion(c) ? ' <span style="color:#b45309" title="No es el 90 % de la real">★</span>' : ''}</td>
      <td>${esc(c.estadio || '—')}</td><td>${esc(c.plg || '—')}</td><td>${esc(c.camaronera || '—')}</td><td>${esc(c.piscinas || '—')}</td>
      <td>${esc(c.guia || '—')}</td><td>${esc(c.guiaDespacho || '—')}</td><td>${esc(c.tinas || '—')}</td><td>${esc(c.placa || '—')}</td></tr>`).join(''), 'Sin partidas.');

  // Cruces con Datos Larvicultura
  h += titulo('🔍 Cruce con Datos Larvicultura', 'el sembrado del N5 y lo cosechado de 🚛 Despacho, del mismo tanque y corrida');
  h += tabla(['Tanque', 'Sembrado (auditoría)', 'Sembrado (Larvicultura N5)', 'Dif.', 'Cosechado (auditoría)', 'Cosechado (Larvicultura)', 'Dif.'],
    cruces.map((x) => `<tr><td><b>${tqDe(x.llave)}</b></td><td>${n(x.sembrado)}</td><td>${n(x.sembradoLarv)}</td><td>${pct(x.difSiembra)}</td>
      <td>${n(x.cosechado)}</td><td>${n(x.cosechadoLarv)}</td><td>${pct(x.difCosecha)}</td></tr>`).join(''), 'Nada que cruzar.');
  return h;
}

/** La sub-vista. `ctx` es el del Supervisor (sus filas de Larvicultura y la corrida elegida). */
export function renderAuditoria(ctx, mod) {
  const corrida = ctx.vState.corrida || null;
  const col = colorFor(ctx.allMods.indexOf(mod));
  const auds = auditoriasDelModulo(store.globalData, mod, corrida);
  let html = breadcrumb(col.accent, [
    { label: '← Módulos', nav: 'modules' },
    { label: mod, nav: 'module', mod },
    { label: 'Auditoría' },
  ]);
  html += `<div class="sv-banner" style="background:${col.bg}">
    <div class="sv-card-orb"></div>
    <div class="sv-card-tag">🧾 AUDITORÍA DE CORRIDA</div>
    <div class="sv-banner-name">${esc(mod)}</div>
    <div class="sv-card-sub">🔄 ${corrida ? 'Corrida: ' + esc(corrida) : 'Todas las corridas'} · ${auds.length} auditoría(s) · siembra, transferencia y cosecha (hoja Registro_Auditoria)</div>
  </div>`;
  if (!auds.length) {
    html += `<div class="card" style="margin-top:14px"><p class="muted" style="margin:0">Aún no hay auditorías de ${esc(mod)}${corrida ? ' en la corrida ' + esc(corrida) : ''}. Se registran en Registros → As. Técnico → 🧾 Auditoría.</p></div>`;
    return { html };
  }
  const larvRows = ctx.larvAll || ctx.larvCM || [];
  html += auds.map((a) => auditoriaHTML(a, larvRows)).join('');
  return { html };
}
