/* ============================================================
   REGISTROS · delegación de eventos para las fichas nativas
   Reemplaza los handlers inline del monolito (onclick/oninput/onchange) por
   UNA delegación sobre un contenedor estable. Los comportamientos siguen siendo
   los del motor validado (upInp, rcPob, localSave, localSync, onTqNameChange):
   esta capa solo enruta los data-* hacia esas funciones globales.
   Ref: docs/analisis/05-ficha-estandar-spec.md
   ============================================================ */

const ATTACHED = Symbol('rgFichaEventsAttached');

/**
 * Conecta la delegación de eventos sobre `root` (contenedor estable, p.ej. el
 * host `.registros-app`). Idempotente: no re-adjunta si ya estaba.
 * @param {Element} root
 * @param {object} engine  objeto con las funciones del motor (default globalThis)
 */
export function attachFichaEvents(root, engine = globalThis) {
  if (!root || root[ATTACHED]) return;
  root[ATTACHED] = true;

  // input → mayúsculas (estadio) y alimentación cruzada (%Mortalidad → Población)
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-upper]') && typeof engine.upInp === 'function') engine.upInp(t);
    if (t.matches('[data-feeds="poblacion"]') && typeof engine.rcPob === 'function') engine.rcPob();
    // Validación OD/°C fuera de rango (params): marca .pinp-alert.
    if (t.matches('[data-chkmin]') && typeof engine.chkParam === 'function') {
      engine.chkParam(t, Number(t.dataset.chkmin), Number(t.dataset.chkmax));
    }
    // Despacho: Población recalcula superv./biomasa/densidad; PLG recalcula biomasa.
    if (t.matches('[data-desp-po]')) {
      if (typeof engine.rcDespSv === 'function') engine.rcDespSv();
      if (typeof engine.rcDespBiomasa === 'function') engine.rcDespBiomasa();
      if (typeof engine.rcDespDensidad === 'function') engine.rcDespDensidad();
    }
    if (t.matches('[data-desp-pgm]') && typeof engine.rcDespBiomasa === 'function') {
      engine.rcDespBiomasa();
    }
  });

  // click → acciones de la botonera (mapea data-action a la función del motor)
  const CLICK_ACTIONS = {
    save: 'localSave',
    sync: 'localSync',
    clear: 'clearFicha',
    recover: 'recoverFicha',
    pdf: 'downloadPDF',
    share: 'shareFichaPDF',
    cs: 'openCS',
    ton: 'openTON',
    pdfdesinf: 'downloadDesinfeccionPDF',
  };
  root.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('[data-action]');
    if (!btn) return;
    const { action, ficha } = btn.dataset;
    const fnName = CLICK_ACTIONS[action];
    if (fnName && typeof engine[fnName] === 'function') engine[fnName](ficha);
  });

  // change → nombre de tanque personalizado + resync de color por estadío (calagua)
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-action="tqname"]') && typeof engine.onTqNameChange === 'function') {
      engine.onTqNameChange(Number(t.dataset.tank), t);
    }
    if (t.matches('[data-agua-est]') && typeof engine.aguaSyncRowColor === 'function') {
      engine.aguaSyncRowColor(t);
    }
    // Desinfección: cambio de fecha (propaga a todas las filas) y de tipo de registro.
    if (t.matches('[data-dx-fecha]') && typeof engine.dxFechaChange === 'function') {
      engine.dxFechaChange(t.value);
    }
    if (t.matches('[data-dx-tipo]') && typeof engine.dxSwitchType === 'function') {
      engine.dxSwitchType(t.value);
    }
  });
}
