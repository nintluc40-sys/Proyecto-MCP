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
  tiempoDe, fmtMinutos, CADENCIA_MAX_MIN, observacionesDelViaje, viajesDe,
} from './traslado.data.js';
import { montarMapa, paradasSinGps, COLORES_CAMION } from './trasladoMapa.js';
import { buildTrasladoPdfDoc } from './trasladoPdf.js';
import { printFichaDocs } from './fichaPdf.js';

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

/** Viaje abierto en el detalle. `null` = el primero de la lista.
 *  Vive fuera del render por lo mismo que `_placaSola`: tiene que sobrevivir al
 *  repintado que provoca el propio clic. Se limpia con el ámbito, y además el
 *  render lo descarta si ese viaje ya no existe —cambió la corrida, o el filtro
 *  de placas lo dejó fuera—, en vez de quedarse con una vista vacía. */
let _viajeSel = null;

/** Mapas de Leaflet actualmente montados: uno por VIAJE visible. Se destruyen
 *  todos antes de montar los siguientes; ver la nota sobre la fuga en `after()`.
 *  ⚠ Era una sola instancia hasta el 2026-08-26; con una sección por viaje puede
 *  haber varias a la vez y olvidarse de una la deja viva escuchando `resize`. */
let _mapasActivos = [];

/** Corta las escuchas del montaje ANTERIOR del mapa.
 *
 *  ⚠⚠ `document` y `root` SOBREVIVEN al repintado —lo que se va es el `innerHTML`—,
 *  así que las escuchas que cuelgan de ellos no mueren con el nodo del mapa: sin
 *  esto, cada clic en un filtro dejaba tres más (`fullscreenchange` ×2 y `keydown`),
 *  cada una cerrada sobre un bloque y un mapa YA MUERTOS. Es exactamente la fuga que
 *  costó las instancias de Leaflet acumuladas, con otro disfraz.
 *  Las que cuelgan de nodos del propio render (botones, selects, filas) no entran
 *  aquí: ésas sí se van con el `innerHTML`. */
let _fsAbort = null;

export function resetTrasladoFiltro() {
  _placaSola = null;
  _viajeSel = null;
  // Abandonar la sub-vista tiene que soltar las escuchas igual que suelta el mapa.
  if (_fsAbort) { try { _fsAbort.abort(); } catch (_) { /* ya cortado */ } }
  _fsAbort = null;
  _ambito = '';
  _mapasActivos.forEach((m) => { try { m.destroy(); } catch (_) { /* ya estaba */ } });
  _mapasActivos = [];
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
    ${/* El PDF vive AQUÍ y no en la cabecera del viaje porque éste es el desglose que
         el supervisor abre cuando algo le chirría, y es justo entonces cuando quiere el
         papel para reclamar. El botón sólo se pinta; lo cabléa `onOpen`, que es quien
         sabe de QUÉ viaje se abrió el modal. */''}
    <div class="sv-tras-pdf-bar">
      <button type="button" class="sv-btn-pdf" data-tras-pdf
        title="Genera el registro completo de este traslado: cabecera, tiempos y una hoja por camión">📄 Descargar PDF del viaje</button>
      <span class="sv-tras-pdf-hint">Incluye los tramos de arriba y, por cada camión, sus matrices de oxígeno, temperatura y actividad parada a parada.</span>
    </div>
  </div>`;
}

/* ⚠⚠ Se agrupa por VIAJE, no por camión. Una observación es de la PARADA
   (`grain: 'revision'` en el esquema) y viaja repetida en las filas de todos los
   camiones: agrupando por placa, la misma frase salía una vez por camión y el
   supervisor leía dos incidencias donde sólo hubo una. */
function tablaObs(camiones) {
  const obs = observacionesDelViaje(camiones);
  if (!obs.length) return '<div class="sv-tras-vacio">Ninguna parada dejó observaciones.</div>';
  const porViaje = new Map();
  obs.forEach((o) => {
    if (!porViaje.has(o.viaje)) porViaje.set(o.viaje, []);
    porViaje.get(o.viaje).push(o);
  });
  return [...porViaje.values()].map((lista) => {
    const v = lista[0];
    // Sólo se nombran las placas del viaje: quién lo llevaba sigue haciendo falta,
    // pero como dato del viaje, no como forma de partir las observaciones.
    const placas = [...new Set(camiones.filter((c) => c.viaje === v.viaje).map((c) => c.placa))];
    return `<div class="sv-tras-blk">
    <div class="sv-tras-blk-h">🚚 ${esc(v.fecha || '—')} · ${esc(v.camaronera || '—')}
      <span>${esc(placas.join(' · '))} — ${lista.length} observación(es)</span></div>
    ${lista.map((o) => `<div class="sv-tras-obs">
      <div class="sv-tras-obs-h">Parada ${o.revision} · ${esc(o.hora || '—')} · ${esc(o.lugar || '—')}</div>
      <div class="sv-tras-obs-t">${esc(o.texto)}</div>
    </div>`).join('')}
  </div>`;
  }).join('');
}

/* ── Vista ──────────────────────────────────────────────────── */
export function renderTraslado(ctx, mod) {
  const corrida = ctx.vState ? ctx.vState.corrida : null;
  const col = colorFor(ctx.allMods.indexOf(mod));
  const ambito = mod + '|' + (corrida || '');
  if (_ambito !== ambito) { _placaSola = null; _viajeSel = null; _ambito = ambito; }

  const t = trasladoDe(ctx.data || [], mod, corrida);
  // El filtro sólo esconde; el conjunto completo se conserva para poder volver.
  // Una placa seleccionada que ya no existe (cambió la corrida, se borró el viaje)
  // no puede vaciar la vista: se ignora y se enseñan todos.
  if (_placaSola && !t.camiones.some((c) => c.placa === _placaSola)) _placaSola = null;
  const visibles = _placaSola ? t.camiones.filter((c) => c.placa === _placaSola) : t.camiones;
  /* ⚠⚠ LA UNIDAD DE ESTA VISTA ES EL VIAJE, NO LA CORRIDA.
     Una corrida puede salir en varios traslados —distintas noches, distintas
     camaroneras, distintos camiones— y antes la página los trataba como si fueran
     uno solo: los KPI de la cabecera agregaban las mediciones de todos, y el de
     tiempo ni siquiera agregaba —`paradasDelViaje` deduplica por número de parada,
     así que enseñaba el PRIMER viaje y los demás desaparecían—. Medido: un segundo
     viaje de 10 h se anunciaba como 4 h.
     Ahora cada viaje tiene su propia sección con sus propios KPI, y todos los
     números de esa sección hablan de ese traslado. */
  const viajes = viajesDe(visibles);

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
    <div class="sv-card-sub">🔄 ${corrida ? 'Corrida: ' + esc(corrida) : 'Todas las corridas'} · ${viajes.length} viaje(s) · ${visibles.length} camión(es)</div>
  </div>`;

  if (!t.hayDatos) {
    html += `<div class="sv-tras-empty">
      <div class="sv-tras-empty-i">🚚</div>
      <div class="sv-tras-empty-t">Todavía no hay traslados registrados para ${esc(mod)}${corrida ? ' · corrida ' + esc(corrida) : ''}.</div>
      <div class="sv-tras-empty-s">La hoja <code>Registro_Traslado</code> se crea la primera vez que un camión sincroniza desde la app de captura.</div>
    </div>`;
    return { html, after: () => {} };
  }

  /* ── Filtro de camiones ──────────────────────────────────────
     Un `<select>`, no pastillas (usuario, 2026-08-27): las pastillas se leían como
     etiquetas y no como un control, y la app ya tiene su patrón de filtro
     —`sv-modal-select`— en Comparar tanques y en la exportación de Despacho.

     ⚠ El repintado NO puede colgarse del propio `<select>`: el enrutador del
     Supervisor delega en `click`, y un clic sobre el select es el que ABRE el
     desplegable. Se dispara sobre un elemento oculto que sí lleva `data-nav`, así
     que el mecanismo es el mismo de siempre sin pelearse con el control. */
  html += `<div class="sv-tras-filtros">
    <label class="sv-tras-filtros-l" for="sv-tras-placa">Camión</label>
    <select id="sv-tras-placa" class="sv-modal-select" data-tras-placa-sel
      title="Filtra la vista por camión">
      <option value=""${_placaSola ? '' : ' selected'}>Todos (${t.placas.length})</option>
      ${t.camiones.map((c) => `<option value="${esc(c.placa)}"
        ${_placaSola === c.placa ? 'selected' : ''}>${esc(c.placa)}</option>`).join('')}
    </select>
    ${_placaSola ? `<span class="sv-tras-filtros-n">viendo sólo ${esc(_placaSola)}</span>` : ''}
    <span data-tras-repaint data-nav="traslado" data-mod="${esc(mod)}" hidden></span>
  </div>`;

  /* ── ÍNDICE DE VIAJES + DETALLE DEL ELEGIDO ──────────────────
     Una corrida puede salir en VARIOS traslados —distintas noches, distintas
     camaroneras, distintos camiones—. Hasta el 2026-08-26 la página los trataba
     como uno solo y los fundía; desde entonces cada uno tenía su sección completa,
     con su mapa de 420 px y sus tarjetas. Correcto, pero **cada viaje costaba
     ~1.060 px de scroll** y con tres ya eran cinco pantallas.

     Ahora hay UNA TABLA con una fila por viaje —que es la vista integral que se
     pedía, sin agregar nada: cada número sigue siendo de su traslado porque cada
     traslado es una fila— y DEBAJO el detalle del que se elija.

     ⚠⚠ NO se agregan los KPI entre viajes, y en particular NO el TIEMPO: «en ruta»
     de un viaje de 4 h y otro de 9 h no da ningún número que le pasara a nadie.
     Ése fue justo el defecto de agosto. La tabla los pone en COLUMNAS, no en una
     media.

     🔑 Con UN SOLO viaje la tabla no se pinta: sería una fila de índice para un
     único destino, y la vista queda exactamente como estaba. */
  if (_viajeSel && !viajes.some((v) => v.viaje === _viajeSel)) _viajeSel = null;
  const vSel = viajes.find((v) => v.viaje === _viajeSel) || viajes[0] || null;

  if (viajes.length > 1) {
    html += `<div class="sv-tras-idx">
      <div class="sv-tras-idx-h">🗂️ ${viajes.length} traslados en esta corrida
        <span>Pulsa uno para ver su mapa, sus camiones y su desglose</span></div>
      <div class="sv-sie-wrap"><table class="sv-table sv-tras-idx-t">
        <thead><tr>
          <th>Fecha</th><th>Destino</th><th>Camiones</th><th>Paradas</th>
          <th>En ruta</th><th>O₂ (mg/L)</th><th>Temp. (°C)</th><th>Actividad</th><th>Obs.</th>
        </tr></thead>
        <tbody>${viajes.map((v) => {
    const vv = trasladoVisible(t, v.camiones);
    const on = vSel && v.viaje === vSel.viaje;
    /* ⚠ SIN marca de cadencia en la fila (usuario, 2026-08-27). El aviso de los 120
       min del protocolo NO desaparece del sistema: sigue en el desglose de Tiempo
       («Fuera de cadencia») y en la ficha de captura, que es donde el chequeador lo
       necesita. Aquí ensuciaba una tabla que es de consulta. */
    return `<tr class="sv-tras-idx-r${on ? ' is-on' : ''}"
        data-tras-viajesel="${esc(v.viaje)}" data-nav="traslado" data-mod="${esc(mod)}"
        role="button" tabindex="0" aria-pressed="${!!on}"
        title="Ver el detalle de este traslado">
        <td><b>${esc(v.fecha || '—')}</b></td>
        <td class="sv-hm-lugar">${esc(v.camaronera || '—')}</td>
        <td>${v.placas.length}<span class="sv-tras-idx-pl">${esc(v.placas.join(' · '))}</span></td>
        <td>${v.tiempo.paradas.length}</td>
        <td class="sv-tras-media">${esc(fmtMinutos(v.tiempo.enRuta))}</td>
        <td class="sv-tras-media">${n2(vv.o2)}</td>
        <td class="sv-tras-media">${n2(vv.temp)}</td>
        <td>${esc(etiquetaActividad(vv.actividad))}</td>
        <td class="sv-tras-media">${v.nObservaciones}</td>
      </tr>`;
  }).join('')}</tbody>
      </table></div>
      <div class="sv-hm-leyenda"><i>Cada fila es un traslado y sus números son sólo suyos:
        no se promedian entre viajes. Pulsa una fila para ver su mapa y sus camiones.</i></div>
    </div>`;
  }

  /* ── DETALLE DEL VIAJE ELEGIDO ──────────────────────────────
     🔑 Los KPI de MEDICIÓN (O₂, temperatura, actividad) son del viaje y su desglose
     se abre POR PLACA —`tablaPorParada` ya pinta un bloque por camión—, mientras
     que el TIEMPO y las OBSERVACIONES son del viaje entero porque su grano es la
     PARADA, que los camiones comparten. Ver `viajesDe` en `traslado.data.js`. */
  if (vSel) {
    const v = vSel;
    const vista = trasladoVisible(t, v.camiones);
    const sinGps = paradasSinGps(v.camiones);
    const ident = `data-tras-viaje="${esc(v.viaje)}"`;
    html += `<section class="sv-tras-viaje">
      <div class="sv-tras-viaje-h" style="border-left:4px solid ${col.accent}">
        <div class="sv-tras-viaje-t">🚚 ${esc(v.fecha || 'sin fecha')} · → ${esc(v.camaronera || 'sin destino')}</div>
        <div class="sv-tras-viaje-s">${v.placas.length} camión(es) · ${esc(v.placas.join(' · '))}</div>
      </div>
      <div class="sv-kpi-grid sv-kpi-wide">
        ${kpiGlass('🫧', 'O₂ promedio (mg/L)', n2(vista.o2), `${ident} data-tras-modal="o2" role="button" tabindex="0" title="Ver el desglose por parada y tina, camión a camión"`)}
        ${kpiGlass('🌡️', 'Temp. promedio (°C)', n2(vista.temp), `${ident} data-tras-modal="temp" role="button" tabindex="0" title="Ver el desglose por parada y tina, camión a camión"`)}
        ${kpiGlass('🦐', 'Actividad dominante', etiquetaActividad(vista.actividad), `${ident} data-tras-modal="act" role="button" tabindex="0" title="Ver la frecuencia por parada"`)}
        ${kpiGlass('📝', 'Observaciones', String(v.nObservaciones), `${ident} data-tras-modal="obs" role="button" tabindex="0" title="Ver las observaciones de cada parada"`)}
        ${kpiGlass('⏱️', 'Tiempo en ruta', fmtMinutos(v.tiempo.enRuta),
    `${ident} data-tras-modal="tiempo" role="button" tabindex="0" title="Ver el tiempo de cada tramo entre paradas y descargar el PDF del viaje"`,
    v.tiempo.fueraDeCadencia > 0,
    v.tiempo.puertaAPuerta === null ? '' : 'puerta a puerta ' + fmtMinutos(v.tiempo.puertaAPuerta))}
      </div>
      <div class="sv-tmap-blk">
        <div class="sv-tmap-h">
          <div class="sv-tmap-t">🗺️ Recorrido geolocalizado</div>
          ${/* Los camiones del viaje paran JUNTOS —la coordenada es de la parada—, así
               que la ruta es UNA. La leyenda ya no promete un trazo por camión: dice
               quiénes van y remite al popup, que es donde sus datos sí se separan. */''}
          <div class="sv-tmap-leyenda">
            <span class="sv-tmap-leg-t">${v.placas.length} camión(es) en la misma ruta:</span>
            ${v.camiones.map((c, i) => `<span class="sv-tmap-leg">
              <i style="background:${COLORES_CAMION[i % COLORES_CAMION.length]}"></i>${esc(c.placa)}</span>`).join('')}
          </div>
          ${/* El MISMO filtro que el de arriba, repetido aquí porque en pantalla
               completa el de fuera queda fuera de alcance. Los dos se mantienen
               sincronizados; nunca pueden decir cosas distintas. */''}
          <label class="sv-tmap-sel-l" for="sv-tmap-placa">Camión</label>
          <select id="sv-tmap-placa" class="sv-modal-select sv-tmap-sel" data-tras-placa-mapa
            title="Acota las mediciones de los popups a un camión">
            <option value="">Todos (${v.placas.length})</option>
            ${v.placas.map((pl) => `<option value="${esc(pl)}">${esc(pl)}</option>`).join('')}
          </select>
          <button type="button" class="sv-tmap-full" data-tras-full
            aria-pressed="false" title="Ver el mapa a pantalla completa (Esc para salir)">⛶ Pantalla completa</button>
        </div>
        <div class="sv-tmap" id="sv-tras-mapa-0" data-tras-mapa="0" role="application"
          aria-label="Mapa con las paradas del traslado">
          <div class="sv-tmap-cargando">Cargando mapa…</div>
        </div>
        <div class="sv-tmap-pie">Pulsa una parada para ver lo que midió CADA camión en ella.${
  sinGps ? ` · ⚠ ${sinGps} parada(s) sin coordenadas: se quedaron sin señal y no se sitúan.` : ''}</div>
      </div>
      <div class="sv-tras-cards">`;

    v.camiones.forEach((c) => {
      html += `<div class="sv-tras-card">
        <div class="sv-tras-card-h" style="border-left:4px solid ${col.accent}">
          <div class="sv-tras-placa">🚚 ${esc(c.placa)}</div>
          <div class="sv-tras-meta">${c.nParadas} parada(s) · ${c.tinas.length} tina(s)</div>
        </div>
        <div class="sv-tras-card-b">
          ${/* Las tres medidas SON del camión (grano `tina`). Las observaciones ya no
               salen aquí: son de la parada y las comparten los camiones del viaje, así
               que repetirlas por tarjeta era contar la misma incidencia dos veces.
               Viven en el KPI del viaje, arriba. */''}
          <div class="sv-tras-mini">
            <div><span>O₂ medio</span><b>${n2(c.o2.promedio)}</b> mg/L</div>
            <div><span>Temp. media</span><b>${n2(c.temp.promedio)}</b> °C</div>
            <div><span>Actividad</span><b>${esc(etiquetaActividad(c.actividad))}</b></div>
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
    html += '</div></section>';
  }
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
      /* ⚠⚠ FUGA QUE HUBO QUE CERRAR (auditoría del 2026-08-23).
         La versión anterior sólo destruía el mapa si su contenedor YA estaba
         desprendido al resolverse la promesa — y en el caso normal no lo está: el
         mapa monta, y sólo DESPUÉS el usuario pulsa un filtro e `innerHTML` se
         lleva el contenedor por delante. Resultado: cada clic dejaba un mapa de
         Leaflet vivo, con sus escuchas de `resize` sobre un nodo huérfano, y se
         acumulaban en silencio.
         Se destruyen los ANTERIORES antes de montar los siguientes, así no depende
         del orden en que resuelva nada.
         ⚠ Se guarda una LISTA aunque hoy sólo se monte UNO —el del viaje abierto—:
         la lista es lo que garantiza que no quede ninguno vivo si mañana vuelven a
         convivir varios. Montar sólo el visible es, además, la mitad del ahorro de
         esta tanda: antes se instanciaba un Leaflet por viaje de la corrida. */
      /* Antes de soltar los mapas: si el anterior se quedó a pantalla completa, hay
         que deshacerlo. El nodo se va con el `innerHTML` y el navegador saldría solo
         del modo nativo, pero la clase del `<body>` NO se limpia sola y dejaría la
         página entera sin scroll. */
      salirPantallaCompleta(root);
      if (_fsAbort) { try { _fsAbort.abort(); } catch (_) { /* ya cortado */ } }
      _fsAbort = (typeof AbortController === 'function') ? new AbortController() : null;
      const _sig = _fsAbort ? { signal: _fsAbort.signal } : undefined;
      _mapasActivos.forEach((m) => { try { m.destroy(); } catch (_) { /* ya estaba */ } });
      _mapasActivos = [];
      if (vSel) {
        const elMapa = root.querySelector('#sv-tras-mapa-0');
        if (elMapa) {
          montarMapa(elMapa, vSel.camiones).then((m) => {
            if (!m) return;
            // Si mientras cargaba ya se repintó, este mapa nace huérfano: se suelta.
            if (!root.contains(elMapa)) { m.destroy(); return; }
            _mapasActivos.push(m);

            /* El botón se cablea AQUÍ y no antes: sin mapa montado no hay nada que
               redimensionar, y un botón que responde antes de tiempo dejaría el
               bloque a pantalla completa con el «Cargando mapa…» dentro. */
            const blk = elMapa.closest('.sv-tmap-blk');
            const bFull = blk && blk.querySelector('[data-tras-full]');
            if (!blk || !bFull) return;

            const enPantallaCompleta = () => blk.classList.contains('is-full') || _fsElem() === blk;

            /* ── El filtro de camión DENTRO del mapa ──────────────────────
               Es el MISMO filtro de la vista, no uno paralelo: mueve `_placaSola` y
               deja el selector de arriba en el mismo valor, así que los dos no pueden
               discrepar.

               ⚠⚠ En pantalla completa NO se repinta. Repintar rehace el `innerHTML`,
               se lleva por delante el nodo del mapa y el navegador expulsa del modo
               — justo lo que este selector existe para evitar. Se acota el mapa en
               sitio (`filtrar`) y se anota que el resto de la vista está pendiente;
               al salir se repinta y los KPI y las tarjetas se ponen al día, que es
               cuando vuelven a verse. Fuera de pantalla completa se comporta igual
               que el selector de arriba: repinta al momento. */
            const selMapa = blk.querySelector('[data-tras-placa-mapa]');
            let pendienteRepintar = false;
            if (selMapa) {
              // happy-dom ignora `<option selected>`; y en el navegador esto además
              // sobrevive a que el filtro venga puesto de un repintado anterior.
              selMapa.value = _placaSola || '';
              selMapa.addEventListener('change', () => {
                _placaSola = selMapa.value || null;
                const fuera = root.querySelector('[data-tras-placa-sel]');
                if (fuera) fuera.value = _placaSola || '';
                if (enPantallaCompleta()) {
                  if (m.filtrar) m.filtrar(_placaSola);
                  pendienteRepintar = true;
                  return;
                }
                const testigo = root.querySelector('[data-tras-repaint]');
                if (testigo) testigo.click();
              });
            }

            const pintarEstado = () => {
              const on = enPantallaCompleta();
              bFull.setAttribute('aria-pressed', String(on));
              bFull.textContent = on ? '⛶ Salir de pantalla completa' : '⛶ Pantalla completa';
              /* Al SALIR, si el filtro cambió mientras estábamos dentro, el resto de
                 la vista sigue hablando del camión viejo: se repinta ahora, que es
                 cuando los KPI y las tarjetas vuelven a estar a la vista. */
              if (!on && pendienteRepintar) {
                pendienteRepintar = false;
                const testigo = root.querySelector('[data-tras-repaint]');
                if (testigo) { testigo.click(); return; }
              }
              // El tamaño cambia DESPUÉS de que el navegador aplique el modo.
              // ⚠ Se comprueba que exista: la vista no puede dar por hecho la forma del
              //   objeto que devuelve `montarMapa` — el doble de las pruebas no lo traía
              //   y esto reventaba dentro de un setTimeout, donde nadie lo ve.
              setTimeout(() => { if (m && m.invalidar) m.invalidar(); }, 0);
            };

            bFull.addEventListener('click', () => {
              const yaCapa = blk.classList.contains('is-full');
              if (_fsElem() === blk) { _fsSalir(); return; }   // el evento repinta
              if (yaCapa) {
                blk.classList.remove('is-full');
                document.body.classList.remove('sv-tmap-full-on');
                pintarEstado();
                return;
              }
              if (_fsApi() && blk.requestFullscreen) {
                blk.requestFullscreen().then(pintarEstado).catch(() => {
                  // El navegador puede negarse (permisos, iframe): queda la capa.
                  blk.classList.add('is-full');
                  document.body.classList.add('sv-tmap-full-on');
                  pintarEstado();
                });
                return;
              }
              blk.classList.add('is-full');
              document.body.classList.add('sv-tmap-full-on');
              pintarEstado();
            });

            /* El modo nativo se puede abandonar con Esc o con el gesto del sistema,
               sin pasar por el botón: hay que enterarse igualmente o el rótulo
               mentiría y el mapa se quedaría sin redimensionar. */
            document.addEventListener('fullscreenchange', pintarEstado, _sig);
            document.addEventListener('webkitfullscreenchange', pintarEstado, _sig);

            /* Esc cierra la CAPA. En el modo nativo lo gestiona el navegador, así que
               esto sólo actúa sobre el respaldo. */
            root.addEventListener('keydown', (ev) => {
              if (ev.key === 'Escape' && blk.classList.contains('is-full')) {
                blk.classList.remove('is-full');
                document.body.classList.remove('sv-tmap-full-on');
                pintarEstado();
              }
            }, _sig);
          }).catch(() => { /* ya lo dice el propio contenedor */ });
        }
      }

      /* Índice de viajes: igual que los chips de placa, sólo mueve el estado. El
         repintado lo hace el enrutador del Supervisor al burbujear el clic (las
         filas llevan `data-nav`). Enter y Espacio porque la fila es `role="button"`
         y una tabla no se navega con el ratón en una tablet. */
      root.querySelectorAll('[data-tras-viajesel]').forEach((tr) => {
        const elegir = () => { _viajeSel = tr.dataset.trasViajesel; };
        tr.addEventListener('click', elegir);
        tr.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); elegir(); tr.click(); }
        });
      });

      /* Filtro de camiones: mueve el estado y pide el repintado. El enrutador delega
         en `click`, y hacer clic en el propio `<select>` es lo que abre el
         desplegable, así que el clic se dispara sobre el testigo oculto. */
      const selPlaca = root.querySelector('[data-tras-placa-sel]');
      if (selPlaca) {
        /* ⚠⚠ El valor se fija por JS y no sólo con `selected` en el HTML. happy-dom
           IGNORA el atributo `selected` —trampa ya documentada en este proyecto— así
           que la prueba veía «Todos» con la vista filtrada; pero el arreglo no es de
           la prueba: un select que anuncie «Todos» mientras se ve un solo camión
           haría creer al supervisor que mira el viaje entero. Asignarlo aquí garantiza
           que el control diga siempre lo que la vista está enseñando. */
        selPlaca.value = _placaSola || '';
        selPlaca.addEventListener('change', () => {
          // Cadena vacía = todos. Nunca se puede llegar a cero camiones.
          _placaSola = selPlaca.value || null;
          const testigo = root.querySelector('[data-tras-repaint]');
          if (testigo) testigo.click();
        });
      }

      const overlay = root.querySelector('#sv-tras-modal');
      const cuerpo = root.querySelector('#sv-tras-modal-b');
      const titulo = root.querySelector('#sv-tras-modal-t');
      const TITULOS = {
        o2: '🫧 Oxígeno por parada y tina (mg/L)',
        temp: '🌡️ Temperatura por parada y tina (°C)',
        act: '🦐 Actividad por parada',
        obs: '📝 Observaciones del viaje, parada a parada',
        tiempo: '⏱️ Tiempo del traslado, tramo a tramo',
      };
      bindModal(root, overlay, {
        openSel: '[data-tras-modal]',
        closeSel: '[data-tras-close]',
        keyboard: true,
        onOpen(trigger) {
          const k = trigger && trigger.dataset ? trigger.dataset.trasModal : 'o2';
          /* ⚠ El desglose es del VIAJE cuyo KPI se ha pulsado, no de todo lo visible.
             Sin esto, abrir el desglose desde la segunda sección enseñaría los datos
             de las dos —que es el mismo error que se acaba de corregir, sólo que
             dentro del modal. */
          const idV = trigger && trigger.dataset ? trigger.dataset.trasViaje : null;
          const v = viajes.find((x) => x.viaje === idV);
          const cams = v ? v.camiones : visibles;
          const suf = v && v.fecha ? ' · ' + v.fecha + (v.camaronera ? ' → ' + v.camaronera : '') : '';
          titulo.textContent = (TITULOS[k] || 'Desglose') + suf;
          cuerpo.innerHTML = k === 'obs' ? tablaObs(cams)
            : k === 'tiempo' ? tablaTiempo(cams)
              : k === 'act' ? tablaActividad(cams)
                : tablaPorParada(cams, k === 'temp' ? 'temp' : 'o2', k === 'temp' ? '°C' : 'mg/L');

          /* ── PDF del viaje ──────────────────────────────────────
             Se cablea aquí, después de pintar, porque el cuerpo del modal se
             reescribe entero en CADA apertura: un `addEventListener` puesto una vez
             al arrancar quedaría sobre un nodo que ya no está.
             ⚠ El documento se arma con el MISMO objeto de viaje que alimenta la
             vista (`v`, de `viajesDe`), no con una lectura nueva de la hoja: papel y
             pantalla no pueden discrepar porque salen del mismo sitio.
             ⚠⚠ Y se pasa `v.camiones`, NO `cams`: si el usuario tuviera activo el
             filtro de placas, `cams` sería un subconjunto y el papel diría que en el
             viaje iba un solo camión. El PDF es del VIAJE ENTERO (usuario,
             2026-08-27). */
          const bPdf = cuerpo.querySelector('[data-tras-pdf]');
          if (bPdf) {
            if (!v) { bPdf.disabled = true; bPdf.title = 'No se pudo identificar el viaje de este desglose'; }
            else bPdf.addEventListener('click', () => {
              /* Nada de esto toca el estado de la vista ni el DOM del modal: se
                 construye una cadena y se imprime en un iframe oculto. Si algo
                 fallara, el modal tiene que quedarse exactamente como estaba. */
              try {
                const doc = buildTrasladoPdfDoc(v, { mod, corrida });
                if (!doc.camiones) { bPdf.textContent = '⚠ Este viaje no tiene camiones que imprimir'; return; }
                const previo = bPdf.textContent;
                bPdf.textContent = '⏳ Preparando…';
                bPdf.disabled = true;
                const ok = printFichaDocs([{ page: doc.page, fileName: doc.fileName }], (n, total, f, done) => {
                  if (done) { bPdf.textContent = previo; bPdf.disabled = false; }
                });
                if (!ok) { bPdf.textContent = '⚠ No se pudo abrir el documento'; bPdf.disabled = false; }
              } catch (_) {
                bPdf.textContent = '⚠ No se pudo generar el PDF';
                bPdf.disabled = false;
              }
            });
          }
        },
      });
    },
  };
}

/** Recalcula las MEDICIONES de la cabecera de un viaje para el subconjunto visible
 *  del filtro. Se recalcula, no se reusa el total: si el filtro esconde un camión,
 *  el KPI tiene que hablar de lo que se está viendo o miente.
 *
 *  ⚠ Sólo devuelve lo de grano `tina` —O₂, temperatura y actividad—. Las
 *  observaciones NO salen de aquí: son de la parada y las comparten los camiones
 *  del viaje, así que las cuenta `viajesDe` una sola vez. Mientras estuvieron
 *  también aquí eran código muerto, y un banco de mutaciones lo delató: romperlas
 *  no ponía roja ninguna prueba porque ya no las leía nadie. */
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
  };
}

/* ── Pantalla completa del mapa ──────────────────────────────
   Dos caminos a propósito. Se intenta la API nativa —que es la de verdad: esconde
   la barra del navegador, y el Esc y el gesto de salir los gestiona el sistema— y,
   si no está disponible, se cae a una capa CSS a pantalla. La API nativa NO existe
   en Safari de iPhone para elementos arbitrarios, y esta vista se mira en tablet y
   en móvil en carretera: sin el respaldo, el botón no haría nada justo donde más
   falta hace.

   🔑 En los DOS caminos hay que llamar a `invalidar()` DESPUÉS de que el contenedor
   haya cambiado de tamaño. Leaflet cachea las medidas: sin eso el mapa se queda
   dibujado al tamaño viejo, con las teselas cortadas y los marcadores desplazados.
   Es el mismo motivo del `invalidateSize` que ya había al montar. */
const _fsApi = () => (typeof document !== 'undefined'
  && (document.fullscreenEnabled || document.webkitFullscreenEnabled));
const _fsElem = () => (typeof document === 'undefined' ? null
  : (document.fullscreenElement || document.webkitFullscreenElement || null));

function _fsSalir() {
  try {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  } catch (_) { /* el navegador ya salió por su cuenta */ }
  return undefined;
}

/** Deja el bloque del mapa fuera de pantalla completa, venga de donde venga.
 *  Se llama también al repintar: un bloque que se va del DOM estando en modo capa
 *  dejaría la clase puesta en un nodo muerto y, peor, el `<body>` bloqueado.
 *  NO se exporta: sólo la usa esta vista, y una superficie pública que nadie consume
 *  es la misma clase de peso muerto que el `nObservaciones` que se retiró el 08-26. */
function salirPantallaCompleta(root) {
  if (typeof document === 'undefined') return;
  const blk = root && root.querySelector ? root.querySelector('.sv-tmap-blk.is-full') : null;
  if (blk) blk.classList.remove('is-full');
  document.body.classList.remove('sv-tmap-full-on');
  if (_fsElem()) _fsSalir();
}

/** Etiqueta de actividad que NO esconde un empate. */
export function etiquetaActividad(a) {
  if (!a || !a.moda) return '—';
  return a.empate ? a.moda + ' (empate)' : a.moda;
}
