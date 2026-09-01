/* ============================================================
   PDF del VIAJE de Traslado (vista Supervisor · Traslado en ruta)

   Réplica en papel de lo que enseña el tablero para UN traslado. Espeja el PDF de
   la ficha de captura (`public/registros/engine.js · buildTrasPdfHtml`): cabecera
   del viaje y, por camión, tres matrices parada × tina —oxígeno, temperatura y
   actividad— más su alimentación, con salto de página entre camiones.

   ⚠ SIN el desglose de tiempo tramo a tramo (usuario, 2026-08-27): eso se mira en
   el tablero, que es donde se decide. El TOTAL —en ruta y puerta a puerta— sí se
   queda, como dos datos de cabecera: sin él el papel no diría cuánto duró el viaje.

   🔑 EL GRANO MANDA sobre el parecido con el original: la ALIMENTACIÓN se imprime
   por camión porque es de la tina, y las OBSERVACIONES una sola vez al final porque
   son de la PARADA y los camiones del viaje las comparten. Ver `notasDe`.

   DIFERENCIA DE ORIGEN, deliberada y del mismo tipo que la de `petriPdf.js`: aquel
   imprime el BORRADOR local que el chequeador tiene en la mano; éste imprime lo que
   ya está en la hoja, leído por la MISMA capa de datos que pinta la vista
   (`camionDe` vía `trasladoDe`/`viajesDe`). Papel y pantalla no pueden discrepar
   porque salen del mismo sitio.

   ⚠ EL ALCANCE ES EL VIAJE, NO LA CORRIDA (usuario, 2026-08-27). Se imprime un
   traslado con todos sus camiones. Mezclar dos viajes en un documento repetiría el
   número de parada con horas distintas y el papel dejaría de servir para reclamar
   nada — que es exactamente el defecto que se corrigió en el tablero el 08-26.

   Este módulo es PURO: construye HTML y no toca el DOM. La impresión la hace
   `printFichaDocs` de `fichaPdf.js` (iframe oculto, sin pop-ups).
   ============================================================ */
import { esc } from '../../core/format.js';
import { pdfCss, fnv1a } from './fichaPdf.js';
import { fmtMinutos, tiempoDe, observacionesDelViaje } from './traslado.data.js';

/* Sólo lo que el `pdfCss` compartido no trae: la rejilla de camión y las notas.
   Todo lo demás —cabecera, tablas, pie, código verificador— se hereda, para que
   este documento se lea como los otros del sistema y no como un primo lejano. */
const EXTRA_CSS = `
.tv-h{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #09192e;padding-bottom:3px;margin-bottom:4px}
.tv-h .co{font-size:11pt;font-weight:800;color:#09192e}
.tv-h .su{font-size:6.5pt;color:#64748b;text-transform:uppercase;letter-spacing:.7px}
.tv-h .ctr{text-align:center;flex:1;padding:0 10px}
.tv-h .doc-code{font-family:monospace;font-size:8pt;font-weight:800;color:#09192e;letter-spacing:.5px;background:#f0fdfa;border:1.5px solid #99f6e4;border-radius:3px;padding:2px 8px;display:inline-block}
.tv-h .rgt{text-align:right}
.tv-h .rgt .mod{font-size:11pt;font-weight:800;color:#09192e}
.tv-h .rgt .mods{font-size:6.5pt;color:#64748b}
.tv-tit{font-size:9pt;font-weight:800;color:#fff;background:#09192e;padding:3px 10px;margin-bottom:4px;border-radius:2px}
.tv-meta{display:flex;flex-wrap:wrap;gap:2px 18px;margin-bottom:5px}
.tv-meta .mf label{font-size:6.5pt;text-transform:uppercase;letter-spacing:.4px;color:#0f766e;font-weight:800;display:block}
.tv-meta .mf span{font-size:8.5pt;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:1px;min-width:60px;display:block}
.tv-cam{margin-bottom:5px}
.tv-ctit{font-size:8.5pt;font-weight:800;color:#0f172a;background:#e6fffa;border-left:3px solid #0d9488;padding:3px 8px;margin-bottom:3px;display:flex;justify-content:space-between;align-items:baseline}
.tv-ctit span{font-size:6.5pt;font-weight:600;color:#475569}
.tv-grp{margin-bottom:4px}
.tv-cat{font-size:7pt;font-weight:800;color:#0f766e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:1px}
.tv-lug{text-align:left!important;max-width:120px;white-space:normal!important}
.tv-med{background:#f0fdfa!important;font-weight:800}
.tv-vac{color:#9ca3af;font-style:italic}
.tv-notas{border:1px solid #e2e8f0;border-radius:3px;padding:3px 8px;margin-top:3px;background:#f8fafc}
.tv-nlab{font-size:6.5pt;text-transform:uppercase;color:#0f766e;font-weight:800;margin-bottom:1px}
.tv-nota{font-size:7.5pt;color:#0f172a;line-height:1.35}
.tv-exc{background:#fef2f2!important;color:#b91c1c!important;font-weight:800}
.brk{page-break-before:always}
`;

const dash = '<span class="tv-vac">—</span>';
const val = (v) => { const s = String(v == null ? '' : v).trim(); return s === '' ? dash : esc(s); };
const n2 = (v) => (v === null || v === undefined || !isFinite(v) ? dash : Number(v).toFixed(2));

/** Las paradas del viaje, en orden y sin repetir: los camiones las comparten.
 *  Se toma la lista del camión que MÁS paradas tenga, no la del primero: si a un
 *  camión le falta una parada, el papel no puede perderla para todos. */
function paradasDe(camiones) {
  const revs = new Map();
  (camiones || []).forEach((c) => (c.paradas || []).forEach((p) => {
    if (!revs.has(p.revision)) revs.set(p.revision, p);
  }));
  return [...revs.keys()].sort((a, b) => a - b);
}

/** Una matriz parada × tina para un camión. `celda` decide qué se lee de la tina.
 *  ⚠ Sólo las tinas que VIAJAN (`cam.tinas`), no las ocho de la ficha: imprimir las
 *  ocho diría que viajaron tinas que no iban en el camión. */
function matriz(cam, revs, titulo, celda, conMedia) {
  const tinas = cam.tinas || [];
  const filas = revs.map((rev) => {
    const p = (cam.paradas || []).find((x) => x.revision === rev);
    const nums = [];
    const tds = tinas.map((t) => {
      const tin = p && p.tinas ? p.tinas[t] : null;
      const v = tin ? celda(tin) : null;
      const n = parseFloat(v);
      if (isFinite(n)) nums.push(n);
      return '<td>' + (v === null || v === undefined || v === '' ? dash : esc(String(v))) + '</td>';
    }).join('');
    /* El DIVISOR es cuántas tinas se midieron, no cuántas lleva el camión: contar
       una tina sin medir como cero hundiría la media y el papel acusaría de algo
       que no pasó. Es la misma regla que la ficha de captura. */
    const media = conMedia && nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '';
    return `<tr><td class="tqc">${rev}</td><td>${val(p && p.hora)}</td>`
      + `<td class="tv-lug">${val(p && p.lugar)}</td>${tds}`
      + (conMedia ? `<td class="tv-med">${media === '' ? dash : media}</td>` : '')
      + '</tr>';
  }).join('');
  return `<div class="tv-grp"><div class="tv-cat">${esc(titulo)}</div>
    <table><thead><tr><th>Parada</th><th>Hora</th><th>Lugar</th>`
    + tinas.map((t) => `<th>T${t}</th>`).join('')
    + (conMedia ? '<th>Media</th>' : '')
    + `</tr></thead><tbody>${filas}</tbody></table></div>`;
}

/** La ALIMENTACIÓN por parada de un camión. Va en una lista y no en una cuarta
 *  matriz que repetiría el mismo valor en cada columna.
 *
 *  ⚠⚠ AQUÍ NO VAN LAS OBSERVACIONES, y la primera versión de este módulo las puso:
 *  una observación es de la PARADA (`grain: 'revision'`) y los camiones del viaje la
 *  comparten, así que imprimirla en la sección de cada camión la repetía —con dos
 *  camiones salía dos veces, más la del bloque del viaje: tres—. Es EXACTAMENTE el
 *  defecto que el tablero tuvo hasta el 2026-08-26, colado de nuevo por la puerta del
 *  papel. Lo cazó la prueba «una observación de parada sale UNA vez». Las
 *  observaciones viven una sola vez, en el bloque del viaje. */
function notasDe(cam, revs) {
  const items = revs.map((rev) => {
    const p = (cam.paradas || []).find((x) => x.revision === rev);
    if (!p) return '';
    const alim = [...new Set(Object.values(p.tinas || {}).map((t) => String(t.alim || '').trim()).filter(Boolean))];
    if (!alim.length) return '';
    return `<div class="tv-nota"><b>Parada ${rev}</b> · ${val(p.hora)}`
      + ' · Alimentación: ' + esc(alim.join(', ')) + '</div>';
  }).join('');
  return items ? `<div class="tv-notas"><div class="tv-nlab">Alimentación por parada</div>${items}</div>` : '';
}

function cabecera(viaje, mod, corrida, codigo) {
  const c0 = viaje.camiones[0] || {};
  // Mismo cálculo que el tablero: la regla de la medianoche no se reimplementa.
  const t = tiempoDe(viaje.camiones);
  const campo = (l, v) => `<div class="mf"><label>${esc(l)}</label><span>${val(v)}</span></div>`;
  return `<div class="tv-h">
    <div><div class="co">OMARSA</div><div class="su">Mar Bravo · Larvicultura</div></div>
    <div class="ctr"><div class="doc-code">${esc(codigo)}</div></div>
    <div class="rgt"><div class="mod">${esc(mod || '—')}</div><div class="mods">Módulo</div></div>
  </div>
  <div class="tv-tit">🚚 TRASLADO EN RUTA · REGISTRO DEL VIAJE</div>
  <div class="tv-meta">
    ${campo('Fecha', viaje.fecha)}
    ${campo('Viaje', viaje.viaje)}
    ${campo('Corrida', corrida)}
    ${campo('Camaronera', viaje.camaronera)}
    ${campo('Salida', c0.horaSalida)}
    ${campo('Llegada', c0.horaLlegada)}
    ${campo('Salinidad (‰)', c0.salinidad === null || c0.salinidad === undefined ? '' : c0.salinidad)}
    ${campo('Camiones', viaje.placas.join(' · '))}
    ${/* El tiempo del viaje se queda como DOS DATOS de cabecera, no como tabla:
         el usuario pidió quitar el desglose tramo a tramo (2026-08-27) porque eso
         se consulta en el tablero, que es donde se decide. Pero el total sigue
         siendo parte del registro del viaje: sin él el papel no dice cuánto duró. */''}
    ${campo('En ruta', fmtMinutos(t.enRuta))}
    ${campo('Puerta a puerta', fmtMinutos(t.puertaAPuerta))}
  </div>`;
}

function firmas(cam) {
  const f = (l, v) => `<div style="text-align:center;min-width:130px">
    <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:10px;font-size:7pt;font-weight:700;color:#0f172a">${val(v)}</div>
    <div style="font-size:5.5pt;color:#64748b;margin-top:1px">${esc(l)}</div></div>`;
  return `<div style="display:flex;justify-content:space-around;gap:16px;margin-top:6px">
    ${f('Controlador despacho', cam.controlador)}
    ${f('Chequeador entrega', cam.chequeador)}
    ${f('Responsable recepción', cam.recepcion)}
  </div>`;
}

/**
 * Documento completo del viaje, listo para `printFichaDocs`.
 * @param {object} viaje  un elemento de `viajesDe(...)`: { viaje, fecha, camaronera, camiones, placas }
 * @param {object} [opts] { mod, corrida }
 * @returns {{page:string, fileName:string, camiones:number}}
 *   `camiones` = 0 si no hay nada imprimible; el llamante avisa y no imprime.
 */
export function buildTrasladoPdfDoc(viaje, opts = {}) {
  const cams = (viaje && Array.isArray(viaje.camiones)) ? viaje.camiones : [];
  if (!cams.length) return { page: '', fileName: '', camiones: 0 };

  const mod = opts.mod || (cams[0] && cams[0].modulo) || '';
  const corrida = opts.corrida || (cams[0] && cams[0].corrida) || '';
  const revs = paradasDe(cams);
  const tsStr = new Date().toLocaleString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const cuerpo = cams.map((cam) => {
    const secc = `<div class="tv-cam">
      <div class="tv-ctit">🚚 ${val(cam.placa)}
        <span>${(cam.tinas || []).length} tina(s) · ${cam.nParadas} parada(s) · O₂ medio ${n2(cam.o2.promedio)} mg/L · Temp. media ${n2(cam.temp.promedio)} °C</span></div>
      ${matriz(cam, revs, 'Oxígeno disuelto (mg/L)', (t) => t.o2, true)}
      ${matriz(cam, revs, 'Temperatura (°C)', (t) => t.temp, true)}
      ${matriz(cam, revs, 'Actividad', (t) => t.act, false)}
      ${notasDe(cam, revs)}
      ${firmas(cam)}
    </div>`;
    return secc;
  });

  /* El salto de página va ANTES de cada camión MENOS del primero: con él delante de
     todos, el documento abriría con una hoja en blanco. */
  const camionesHtml = cuerpo.map((s, i) => (i ? '<div class="brk"></div>' : '') + s).join('');

  // Código verificador DETERMINISTA sobre el contenido: el mismo viaje con los
  // mismos datos da siempre el mismo código (el sello de generación queda fuera).
  const codigo = 'TRAS-' + fnv1a(`${viaje.viaje}|${viaje.fecha}|${camionesHtml}`)
    .toString(16).toUpperCase().padStart(8, '0').slice(-8);

  const obs = observacionesDelViaje(cams);
  const obsHtml = obs.length
    ? `<div class="tv-notas"><div class="tv-nlab">Observaciones del viaje</div>`
      + obs.map((o) => `<div class="tv-nota"><b>Parada ${o.revision}</b> · ${val(o.hora)} · ${val(o.lugar)} — ${esc(o.texto)}</div>`).join('')
      + '</div>'
    : '';

  const pie = `<div class="pfoot">
    <div><div class="code-box">${esc(codigo)}</div><div class="ts-txt">Generado ${esc(tsStr)}</div></div>
    <div class="ts-txt">Sistema MCP · Larvicultura Omarsa Mar Bravo</div>
  </div>`;

  const page = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${esc('TRASLADO_' + (viaje.fecha || '') + '_' + (viaje.viaje || ''))}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${pdfCss('params')}${EXTRA_CSS}</style></head><body>
<div class="ppage">${cabecera(viaje, mod, corrida, codigo)}${camionesHtml}${obsHtml}<div class="spacer"></div>${pie}</div>
</body></html>`;

  const fileName = `TRASLADO_${mod || 'MOD'}_${viaje.fecha || 'sinfecha'}_${viaje.viaje || 'viaje'}`
    .replace(/[\\/:*?"<>|]/g, '');

  return { page, fileName, camiones: cams.length };
}
