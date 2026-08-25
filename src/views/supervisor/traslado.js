/* ============================================================
   SUPERVISOR · Traslado en ruta  (sub-vista de Despacho)

   Se llega desde el KPI «Rendimiento cosecha» del modal de Despacho. El contexto
   es (módulo, corrida): dentro de esa corrida las placas son únicas, así que un
   camión identifica un viaje sin más.

   Qué contesta esta vista, en el orden en que se pregunta:
     · ¿qué camiones salieron con esta producción?
     · ¿llevaban los insumos y el check completos?
     · ¿cómo iban el oxígeno, la temperatura y la actividad? — y al pulsar el KPI,
       ¿cómo iban EN CADA PARADA?
     · ¿qué se anotó por el camino?

   La agregación vive en `traslado.data.js` (módulo puro y probado). Aquí sólo hay
   presentación: si algo hay que calcular, se calcula allí.

   ⚠ Sin datos NO es un error: `Registro_Traslado` sólo existe desde que el GAS se
   re-despliega y un camión sincroniza. La vista lo dice en vez de fingir ceros.
   ============================================================ */
import { colorFor, breadcrumb, kpiGlass, bindModal } from './ui.js';
import { esc } from '../../core/format.js';
import {
  trasladoDe, ACTIVIDAD_ORDEN,
  deltasDe, resumenPorTina, valoresDe, escalaDe, nivelDe, tinaMasInestable,
  tiempoDe, fmtMinutos, CADENCIA_MAX_MIN,
} from './traslado.data.js';
import { montarMapa, paradasSinGps, COLORES_CAMION } from './trasladoMapa.js';

const n1 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(1));
const n2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(2));

/* ── El filtro de camiones ───────────────────────────────────
   Guarda la placa SELECCIONADA, no las ocultas. El primer diseño guardaba las
   ocultas y obligaba a apagar los demás uno a uno para quedarse con uno solo:
   con dos camiones ya era incómodo y con tres, absurdo. Pulsar una placa ahora
   deja SÓLO esa, que es lo que se quiere el 90 % de las veces; pulsarla otra vez
   —o pulsar «Todos»— devuelve la vista completa.

   `null` = todos. Vive fuera del render porque tiene que sobrevivir al repintado. */
let _placaSola = null;
/** Se limpia al cambiar de (módulo, corrida): ocultar «GSA-1147» en una corrida no
 *  puede seguir ocultando algo en otra, donde esa placa ni existe. */
let _ambito = '';

/** Mapa de Leaflet actualmente montado. Se destruye antes de montar otro; ver la
 *  nota sobre la fuga en `after()`. */
let _mapaActivo = null;

export function resetTrasladoFiltro() {
  _placaSola = null;
  _ambito = '';
  if (_mapaActivo) { _mapaActivo.destroy(); _mapaActivo = null; }
}

const barra = (n, total, color) => {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return `<div class="sv-tras-bar" title="${n} de ${total}">
    <div class="sv-tras-bar-fill" style="width:${pct}%;background:${color}"></div>
  </div>`;
};

/** Chip de un checklist: verde si completo, ámbar con lo que falta si no. */
function chipCheck(titulo, c) {
  const ok = c.completo;
  return `<div class="sv-tras-check ${ok ? 'is-ok' : 'is-falta'}">
    <div class="sv-tras-check-h">${ok ? '✅' : '⚠️'} ${esc(titulo)} <b>${c.n}/${c.total}</b></div>
    ${barra(c.n, c.total, ok ? '#2E7D32' : '#E65100')}
    ${ok ? '' : `<div class="sv-tras-check-falta">Falta: ${esc(c.faltan.join(', '))}</div>`}
  </div>`;
}

/* ── Desglose de un parámetro medido (O₂ / temperatura) ──────
   Ya no es una tabla a secas. Lleva tres cosas que la tabla sola no daba:

   1. SEMÁFORO por celda, con escala RELATIVA al propio viaje (mín–máx observados).
      No hay cortes absolutos porque la «tabla referencial de parámetros de
      despacho» del procedimiento no está disponible: inventarlos pintaría de rojo
      lo que quizá es normal. Decisión del usuario, 2026-08-23.
   2. Δ respecto a la parada ANTERIOR: es la caída, que es lo que se vigila en ruta.
   3. Fila de cierre POR TINA — media y recorrido (máx − mín). Es el «promedio por
      tina y carro» que se pidió y que hasta ahora se calculaba pero no se enseñaba.

   🔑 La DIRECCIÓN del semáforo cambia por parámetro: en oxígeno se marca lo BAJO
   (más es mejor); en temperatura, los DOS extremos (no existe un «más es mejor»,
   y tratarla como el oxígeno pintaría de verde la tina más caliente, que es justo
   la que hay que mirar). */
function tablaPorParada(camiones, campo, unidad) {
  const dir = campo === 'temp' ? 'centro' : 'mas-mejor';
  return camiones.map((c) => {
    const escala = escalaDe(valoresDe(c, campo));
    const deltas = deltasDe(c.paradas, campo);
    const porTina = resumenPorTina(c, campo);
    const inestable = tinaMasInestable(porTina);

    const celda = (v) => {
      if (v === null || v === undefined) return '<td class="sv-hm sv-hm-na">—</td>';
      const nv = nivelDe(v, escala, dir);
      return `<td class="sv-hm sv-hm-${nv === null ? 'na' : nv}">${n1(v)}</td>`;
    };

    const filas = c.paradas.map((p, i) => {
      const d = deltas[i];
      const dTxt = d.delta === null ? '<span class="sv-d-na">—</span>'
        : d.delta < -0.001 ? `<span class="sv-d-baja">▼ ${Math.abs(d.delta).toFixed(2)}</span>`
          : d.delta > 0.001 ? `<span class="sv-d-sube">▲ ${d.delta.toFixed(2)}</span>`
            : '<span class="sv-d-igual">=</span>';
      return `<tr>
        <td><b>${p.revision}</b></td>
        <td>${esc(p.hora || '—')}</td>
        <td class="sv-hm-lugar">${esc(p.lugar || '—')}</td>
        ${c.tinas.map((t) => celda((p.tinas[t] || {})[campo])).join('')}
        <td class="sv-tras-media">${n2(campo === 'temp' ? p.temp : p.o2)}</td>
        <td class="sv-hm-d">${dTxt}</td>
      </tr>`;
    }).join('');

    // Pie: una fila con la media de CADA tina y otra con su recorrido.
    const pieMedia = c.tinas.map((t) => `<td class="sv-hm-pie">${n1((porTina[t] || {}).media)}</td>`).join('');
    const pieRec = c.tinas.map((t) => {
      const r = (porTina[t] || {}).recorrido;
      const ojo = inestable && inestable.tina === t && r > 0;
      return `<td class="sv-hm-pie${ojo ? ' sv-hm-ojo' : ''}"${ojo ? ' title="La tina que más se movió en todo el viaje"' : ''}>${n1(r)}${ojo ? ' ⚠' : ''}</td>`;
    }).join('');

    const rango = escala ? `${n1(escala.min)} – ${n1(escala.max)}` : '—';
    return `<div class="sv-tras-blk">
      <div class="sv-tras-blk-h">🚚 ${esc(c.placa)}
        <span>${unidad} · rango del viaje ${rango}${inestable && inestable.recorrido > 0
    ? ` · tina más inestable: <b>T${inestable.tina}</b> (${n1(inestable.recorrido)})` : ''}</span></div>
      <div class="sv-sie-wrap"><table class="sv-table sv-tras-tbl sv-hm-tbl">
        <thead><tr><th>Parada</th><th>Hora</th><th>Lugar</th>
          ${c.tinas.map((t) => `<th>T${t}</th>`).join('')}<th>Media</th><th>Δ</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr><th colspan="3">Media por tina</th>${pieMedia}<th>${n2(campo === 'temp' ? c.temp.promedio : c.o2.promedio)}</th><th></th></tr>
          <tr><th colspan="3">Recorrido (máx−mín)</th>${pieRec}<th></th><th></th></tr>
        </tfoot>
      </table></div>
      <div class="sv-hm-leyenda">
        ${dir === 'centro'
    ? '<span class="sv-hm sv-hm-3">en lo habitual</span><span class="sv-hm sv-hm-2">se aparta</span><span class="sv-hm sv-hm-1">se aparta más</span><span class="sv-hm sv-hm-0">extremo del viaje</span> <i>· en temperatura se marcan los dos extremos</i>'
    : '<span class="sv-hm sv-hm-3">lo más alto</span><span class="sv-hm sv-hm-2"></span><span class="sv-hm sv-hm-1"></span><span class="sv-hm sv-hm-0">lo más bajo</span> <i>· escala relativa a este viaje, no a un umbral fijo</i>'}
      </div>
    </div>`;
  }).join('') || '<div class="sv-tras-vacio">Sin mediciones registradas.</div>';
}

function tablaActividad(camiones) {
  return camiones.map((c) => {
    const filas = c.paradas.map((p) => {
      const vals = Object.values(p.tinas).map((t) => t.act);
      const cnt = {};
      ACTIVIDAD_ORDEN.forEach((a) => { cnt[a] = vals.filter((v) => v === a).length; });
      return `<tr>
        <td><b>${p.revision}</b></td><td>${esc(p.hora || '—')}</td><td>${esc(p.lugar || '—')}</td>
        ${ACTIVIDAD_ORDEN.map((a) => `<td>${cnt[a] || '—'}</td>`).join('')}
      </tr>`;
    }).join('');
    const a = c.actividad;
    return `<div class="sv-tras-blk">
      <div class="sv-tras-blk-h">🚚 ${esc(c.placa)}
        <span>dominante: <b>${esc(a.moda || '—')}</b>${a.empate ? ' (empate)' : ''}</span></div>
      <div class="sv-sie-wrap"><table class="sv-table sv-tras-tbl">
        <thead><tr><th>Parada</th><th>Hora</th><th>Lugar</th>
          ${ACTIVIDAD_ORDEN.map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${filas}</tbody>
      </table></div>
    </div>`;
  }).join('') || '<div class="sv-tras-vacio">Sin actividad registrada.</div>';
}

/* ── Desglose del tiempo ─────────────────────────────────────
   Una sola tabla para el viaje, no una por camión: los camiones del mismo viaje
   PARAN JUNTOS, así que repetirla por placa sería enseñar el mismo dato N veces.

   Lleva los dos tiempos muertos —de la salida a la primera parada y de la última a
   la llegada— porque es justo donde se esconde el tiempo que no aparece en ninguna
   revisión, y la pregunta del supervisor («¿por qué tardó 9 h si en ruta fueron 4?»)
   no se contesta sin ellos. */
function tablaTiempo(camiones) {
  const t = tiempoDe(camiones);
  if (!t.paradas.length) return '<div class="sv-tras-vacio">Ninguna parada tiene hora registrada.</div>';

  const hito = (etiqueta, detalle, min) => `<tr>
    <td><b>${esc(etiqueta)}</b></td>
    <td class="sv-hm-lugar">${esc(detalle)}</td>
    <td class="sv-tras-media">${esc(fmtMinutos(min))}</td>
  </tr>`;

  const filas = [];
  // El tiempo muerto de antes sólo se puede contar si hay hora de salida legible.
  if (t.previo !== null) filas.push(hito('Salida', t.salida + ' → parada ' + t.primera.revision, t.previo));
  t.tramos.forEach((x) => {
    const detalle = x.minutos === null
      ? esc(x.hora) + ' · ' + esc(x.lugar || '—')
      : esc(x.desde || '—') + ' → ' + esc(x.lugar || '—') + ' · ' + esc(x.hora);
    filas.push(`<tr${x.excede ? ' class="sv-t-excede"' : ''}>
      <td><b>Parada ${x.revision}</b></td>
      <td class="sv-hm-lugar">${detalle}</td>
      <td class="sv-tras-media">${x.minutos === null ? '—' : esc(fmtMinutos(x.minutos))}${x.excede ? ' ⚠' : ''}</td>
    </tr>`);
  });
  if (t.posterior !== null) filas.push(hito('Llegada', 'parada ' + t.ultima.revision + ' → ' + t.llegada, t.posterior));

  return `<div class="sv-tras-blk">
    <div class="sv-t-resumen">
      <div><span>En ruta</span><b>${esc(fmtMinutos(t.enRuta))}</b>
        <i>${t.paradas.length} parada(s) con hora</i></div>
      <div><span>Puerta a puerta</span><b>${esc(fmtMinutos(t.puertaAPuerta))}</b>
        <i>${t.salida && t.llegada ? esc(t.salida) + ' → ' + esc(t.llegada) : 'sin horas de salida y llegada'}</i></div>
      <div><span>Fuera de cadencia</span><b>${t.fueraDeCadencia}</b>
        <i>tramos de más de ${CADENCIA_MAX_MIN} min</i></div>
    </div>
    <div class="sv-sie-wrap"><table class="sv-table sv-tras-tbl">
      <thead><tr><th>Hito</th><th>Tramo</th><th>Tiempo</th></tr></thead>
      <tbody>${filas.join('')}</tbody>
    </table></div>
    <div class="sv-hm-leyenda"><i>El tiempo de cada parada es el transcurrido desde la
      anterior. Los traslados cruzan la medianoche: 23:40 → 02:50 son 3 h 10 min, no un
      número negativo.</i></div>
  </div>`;
}

function tablaObs(camiones) {
  const conObs = camiones.filter((c) => c.nObservaciones > 0);
  if (!conObs.length) return '<div class="sv-tras-vacio">Ninguna parada dejó observaciones.</div>';
  return conObs.map((c) => `<div class="sv-tras-blk">
    <div class="sv-tras-blk-h">🚚 ${esc(c.placa)} <span>${c.nObservaciones} observación(es)</span></div>
    ${c.observaciones.map((o) => `<div class="sv-tras-obs">
      <div class="sv-tras-obs-h">Parada ${o.revision} · ${esc(o.hora || '—')} · ${esc(o.lugar || '—')}</div>
      <div class="sv-tras-obs-t">${esc(o.texto)}</div>
    </div>`).join('')}
  </div>`).join('');
}

/* ── Vista ──────────────────────────────────────────────────── */
export function renderTraslado(ctx, mod) {
  const corrida = ctx.vState ? ctx.vState.corrida : null;
  const col = colorFor(ctx.allMods.indexOf(mod));
  const ambito = mod + '|' + (corrida || '');
  if (_ambito !== ambito) { _placaSola = null; _ambito = ambito; }

  const t = trasladoDe(ctx.data || [], mod, corrida);
  // El filtro sólo esconde; el conjunto completo se conserva para poder volver.
  // Una placa seleccionada que ya no existe (cambió la corrida, se borró el viaje)
  // no puede vaciar la vista: se ignora y se enseñan todos.
  if (_placaSola && !t.camiones.some((c) => c.placa === _placaSola)) _placaSola = null;
  const visibles = _placaSola ? t.camiones.filter((c) => c.placa === _placaSola) : t.camiones;
  const vista = visibles.length ? trasladoVisible(t, visibles) : trasladoVisible(t, []);
  // Sobre el MISMO conjunto visible que los demás KPIs: si el filtro esconde un
  // camión, el tiempo tiene que hablar de lo que se está viendo.
  const tiempo = tiempoDe(visibles);

  let html = breadcrumb(col.accent, [
    { label: '← Módulos', nav: 'modules' },
    { label: mod, nav: 'module', mod },
    { label: 'Despacho', nav: 'despacho', mod },
    { label: 'Traslado en ruta' },
  ]);

  html += `<div class="sv-banner" style="background:${col.bg}">
    <div class="sv-card-orb"></div>
    <div class="sv-card-tag">🚚 TRASLADO EN RUTA</div>
    <div class="sv-banner-name">${esc(mod)}</div>
    <div class="sv-card-sub">🔄 ${corrida ? 'Corrida: ' + esc(corrida) : 'Todas las corridas'} · ${t.placas.length} camión(es)</div>
    <div class="sv-kpi-grid sv-kpi-wide">
      ${kpiGlass('🚚', 'Camiones', String(visibles.length) + (visibles.length !== t.placas.length ? ' / ' + t.placas.length : ''))}
      ${kpiGlass('🫧', 'O₂ promedio (mg/L)', n2(vista.o2), 'data-tras-modal="o2" role="button" tabindex="0" title="Ver el desglose por parada y tina"')}
      ${kpiGlass('🌡️', 'Temp. promedio (°C)', n2(vista.temp), 'data-tras-modal="temp" role="button" tabindex="0" title="Ver el desglose por parada y tina"')}
      ${kpiGlass('🦐', 'Actividad dominante', etiquetaActividad(vista.actividad), 'data-tras-modal="act" role="button" tabindex="0" title="Ver la frecuencia por parada"')}
      ${kpiGlass('📝', 'Observaciones', String(vista.nObservaciones), 'data-tras-modal="obs" role="button" tabindex="0" title="Ver las observaciones por camión y parada"')}
      ${kpiGlass('⏱️', 'Tiempo en ruta', fmtMinutos(tiempo.enRuta),
        'data-tras-modal="tiempo" role="button" tabindex="0" title="Ver el tiempo de cada tramo entre paradas"',
        tiempo.fueraDeCadencia > 0,
        tiempo.puertaAPuerta === null ? '' : 'puerta a puerta ' + fmtMinutos(tiempo.puertaAPuerta))}
    </div>
  </div>`;

  if (!t.hayDatos) {
    html += `<div class="sv-tras-empty">
      <div class="sv-tras-empty-i">🚚</div>
      <div class="sv-tras-empty-t">Todavía no hay traslados registrados para ${esc(mod)}${corrida ? ' · corrida ' + esc(corrida) : ''}.</div>
      <div class="sv-tras-empty-s">La hoja <code>Registro_Traslado</code> se crea la primera vez que un camión sincroniza desde la app de captura.</div>
    </div>`;
    return { html, after: () => {} };
  }

  // ── Filtro de placas ──
  html += `<div class="sv-tras-filtros">
    <span class="sv-tras-filtros-l">Camiones:</span>
    <button type="button" class="sv-tras-chip${_placaSola ? '' : ' is-on'}" data-tras-placa="*"
      data-nav="traslado" data-mod="${esc(mod)}" aria-pressed="${!_placaSola}"
      title="Ver todos los camiones">${_placaSola ? '' : '✓ '}Todos (${t.placas.length})</button>
    ${t.camiones.map((c) => {
    const solo = _placaSola === c.placa;
    // `data-nav="traslado"` reusa el enrutador del Supervisor para repintar: el
    // handler propio de abajo cambia el filtro y el delegado de `root` re-renderiza
    // justo después, en el mismo clic.
    return `<button type="button" class="sv-tras-chip${solo ? ' is-on' : ''}" data-tras-placa="${esc(c.placa)}"
        data-nav="traslado" data-mod="${esc(mod)}" aria-pressed="${solo}"
        title="${solo ? 'Volver a ver todos' : 'Ver SÓLO ' + esc(c.placa)}">
        ${solo ? '✓ ' : ''}${esc(c.placa)}</button>`;
  }).join('')}
  </div>`;

  // ── Mapa de la ruta ──
  const sinGps = paradasSinGps(visibles);
  html += `<div class="sv-tmap-blk">
    <div class="sv-tmap-h">
      <div class="sv-tmap-t">🗺️ Recorrido geolocalizado</div>
      <div class="sv-tmap-leyenda">
        ${visibles.map((c, i) => `<span class="sv-tmap-leg">
          <i style="background:${COLORES_CAMION[i % COLORES_CAMION.length]}"></i>${esc(c.placa)}</span>`).join('')}
      </div>
    </div>
    <div class="sv-tmap" id="sv-tras-mapa" role="application"
      aria-label="Mapa con las paradas del traslado">
      <div class="sv-tmap-cargando">Cargando mapa…</div>
    </div>
    <div class="sv-tmap-pie">Pulsa una parada para ver su oxígeno, temperatura, actividad, alimento y observaciones.${
  sinGps ? ` · ⚠ ${sinGps} parada(s) sin coordenadas: se quedaron sin señal y no se sitúan.` : ''}</div>
  </div>`;

  // ── Una tarjeta por camión ──
  html += '<div class="sv-tras-cards">';
  visibles.forEach((c) => {
    html += `<div class="sv-tras-card">
      <div class="sv-tras-card-h" style="border-left:4px solid ${col.accent}">
        <div class="sv-tras-placa">🚚 ${esc(c.placa)}</div>
        <div class="sv-tras-meta">${esc(c.fecha || '—')} · ${esc(c.camaronera || '—')} · ${c.nParadas} parada(s) · ${c.tinas.length} tina(s)</div>
      </div>
      <div class="sv-tras-card-b">
        <div class="sv-tras-mini">
          <div><span>O₂ medio</span><b>${n2(c.o2.promedio)}</b> mg/L</div>
          <div><span>Temp. media</span><b>${n2(c.temp.promedio)}</b> °C</div>
          <div><span>Actividad</span><b>${esc(etiquetaActividad(c.actividad))}</b></div>
          <div><span>Observaciones</span><b>${c.nObservaciones}</b></div>
        </div>
        <div class="sv-tras-checks">
          ${chipCheck('Insumos a bordo', c.insumos)}
          ${chipCheck('Check de materiales', c.check)}
        </div>
        <div class="sv-tras-ruta">
          ${c.paradas.map((p) => `<div class="sv-tras-parada" title="${esc(p.ubicacion || 'sin ubicación')}">
            <div class="sv-tras-parada-n">${p.revision}</div>
            <div class="sv-tras-parada-d">
              <b>${esc(p.lugar || '—')}</b><span>${esc(p.hora || '—')}</span>
              <span>${n1(p.o2)} mg/L · ${n1(p.temp)} °C</span>
            </div>
          </div>`).join('<div class="sv-tras-flecha">→</div>')}
        </div>
        <div class="sv-tras-firmas">
          Controlador: <b>${esc(c.controlador || '—')}</b> ·
          Chequeador: <b>${esc(c.chequeador || '—')}</b> ·
          Recepción: <b>${esc(c.recepcion || '—')}</b>
        </div>
      </div>
    </div>`;
  });
  html += '</div>';
  if (!visibles.length) html += '<div class="sv-tras-vacio">Todos los camiones están ocultos por el filtro.</div>';

  // ── Modales de desglose ──
  // ⚠ Las clases son las del proyecto: `sv-modal-card` / `-head` / `-title` / `-body`.
  // La primera versión inventó `sv-modal-box/-h/-t/-b`, que NO tienen ningún CSS: la
  // tarjeta salía sin fondo y el texto se leía encima de la vista. Un nombre de clase
  // equivocado no da error en ningún sitio, sólo sale mal.
  html += `<div class="sv-modal" id="sv-tras-modal" role="dialog" aria-modal="true" aria-labelledby="sv-tras-modal-t">
    <div class="sv-modal-card sv-tras-mcard">
      <div class="sv-modal-head">
        <span class="sv-modal-title" id="sv-tras-modal-t">Desglose</span>
        <button class="sv-modal-x" type="button" data-tras-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body" id="sv-tras-modal-b"></div>
    </div>
  </div>`;

  return {
    html,
    after(root) {
      // El mapa se monta aparte y en diferido: si Leaflet no carga, la vista ya está
      // completa sin él. Nunca se espera a la red para enseñar los datos.
      const elMapa = root.querySelector('#sv-tras-mapa');
      if (elMapa) {
        /* ⚠⚠ FUGA QUE HUBO QUE CERRAR (auditoría del 2026-08-23).
           La versión anterior sólo destruía el mapa si su contenedor YA estaba
           desprendido al resolverse la promesa — y en el caso normal no lo está: el
           mapa monta, y sólo DESPUÉS el usuario pulsa un filtro e `innerHTML` se
           lleva el contenedor por delante. Resultado: cada clic dejaba un mapa de
           Leaflet vivo, con sus escuchas de `resize` sobre un nodo huérfano, y se
           acumulaban en silencio.
           Ahora se guarda la instancia ACTIVA y se destruye la anterior ANTES de
           montar la siguiente: así no depende del orden en que resuelva nada. */
        if (_mapaActivo) { _mapaActivo.destroy(); _mapaActivo = null; }
        montarMapa(elMapa, visibles).then((m) => {
          if (!m) return;
          // Si mientras cargaba ya se repintó, este mapa nace huérfano: se suelta.
          if (!root.contains(elMapa)) { m.destroy(); return; }
          _mapaActivo = m;
        }).catch(() => { /* ya lo dice el propio contenedor */ });
      }

      // Filtro de placas: sólo mueve el estado. El repintado lo hace el enrutador
      // del Supervisor al burbujear el clic (los chips llevan `data-nav`).
      root.querySelectorAll('[data-tras-placa]').forEach((b) => {
        b.addEventListener('click', () => {
          const pl = b.dataset.trasPlaca;
          // Pulsar una placa deja SÓLO esa; pulsarla de nuevo, o pulsar «Todos»,
          // devuelve la vista completa. Nunca se puede llegar a cero camiones.
          _placaSola = (pl === '*' || _placaSola === pl) ? null : pl;
        });
      });

      const overlay = root.querySelector('#sv-tras-modal');
      const cuerpo = root.querySelector('#sv-tras-modal-b');
      const titulo = root.querySelector('#sv-tras-modal-t');
      const TITULOS = {
        o2: '🫧 Oxígeno por parada y tina (mg/L)',
        temp: '🌡️ Temperatura por parada y tina (°C)',
        act: '🦐 Actividad por parada',
        obs: '📝 Observaciones por camión y parada',
        tiempo: '⏱️ Tiempo del traslado, tramo a tramo',
      };
      bindModal(root, overlay, {
        openSel: '[data-tras-modal]',
        closeSel: '[data-tras-close]',
        keyboard: true,
        onOpen(trigger) {
          const k = trigger && trigger.dataset ? trigger.dataset.trasModal : 'o2';
          titulo.textContent = TITULOS[k] || 'Desglose';
          cuerpo.innerHTML = k === 'obs' ? tablaObs(visibles)
            : k === 'tiempo' ? tablaTiempo(visibles)
              : k === 'act' ? tablaActividad(visibles)
                : tablaPorParada(visibles, k === 'temp' ? 'temp' : 'o2', k === 'temp' ? '°C' : 'mg/L');
        },
      });
    },
  };
}

/** Recalcula los totales de cabecera para el subconjunto visible del filtro.
 *  Se recalcula, no se reusa el total: si el filtro esconde un camión, el KPI
 *  tiene que hablar de lo que se está viendo o miente. */
function trasladoVisible(t, camiones) {
  const vals = (campo) => camiones.flatMap((c) => c.paradas.flatMap((p) => Object.values(p.tinas).map((x) => x[campo]))).filter((v) => v !== null);
  const prom = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const acts = camiones.flatMap((c) => c.paradas.flatMap((p) => Object.values(p.tinas).map((x) => x.act)));
  const cnt = {};
  ACTIVIDAD_ORDEN.forEach((a) => { cnt[a] = 0; });
  acts.forEach((a) => { if (Object.prototype.hasOwnProperty.call(cnt, a)) cnt[a] += 1; });
  // El EMPATE se arrastra igual que en `actividadDe`: decir «Alta» cuando hay
  // tantas «Baja» como «Alta» es una lectura inventada, y es justo el caso que
  // aparece cuando un camión se va degradando parada a parada.
  let moda = null; let max = 0; let empate = false;
  ACTIVIDAD_ORDEN.forEach((a) => {
    if (cnt[a] > max) { max = cnt[a]; moda = a; empate = false; }
    else if (cnt[a] === max && max > 0 && a !== moda) empate = true;
  });
  return {
    o2: prom(vals('o2')),
    temp: prom(vals('temp')),
    actividad: { conteo: cnt, moda: max ? moda : null, empate: max ? empate : false },
    nObservaciones: camiones.reduce((a, c) => a + c.nObservaciones, 0),
  };
}

/** Etiqueta de actividad que NO esconde un empate. */
export function etiquetaActividad(a) {
  if (!a || !a.moda) return '—';
  return a.empate ? a.moda + ' (empate)' : a.moda;
}
