/* ============================================================
   Pendiente 3 · «Recalcular supervivencia» llamaba ERROR a un envío ENCOLADO.

   `postPayload` devuelve `false` para CUATRO desenlaces y sólo uno es un error:

     ok        -> true    el dato está en Sheets
     rejected  -> false    el GAS lo rechazó: el dato NO se escribió. SÍ es error.
     queued    -> false    sin conexión: se encoló, se entrega y se verifica SOLO.
     inflight  -> false    ya hay un envío de esta hoja en vuelo; postPayload ya avisó.

   `recalcSurvivalForCorrida` colapsaba los cuatro con `sent ? "ok" : "err"`, así que
   un recálculo sin conexión pintaba «⚠ error de envío» en CADA día del panel y
   empujaba al chequeador a reenviar a mano lo que ya estaba a salvo en la cola.

   Era la última excepción anotada de la regla de clase de H1 (ver `h1-ast-una.test.js`,
   bloque A). Esta batería la cierra por el CASO; aquella la vigila por la CLASE.

   ⚠ La función no tenía NINGUNA cobertura antes de este archivo.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
/* El escapador REAL del producto, no uno de mentira: un arnés más benévolo que el
   producto no puede certificar al producto (la lección del `sanitizeStr` de los arneses
   de Traslado). `_gasMotivo` se trae del propio motor, por lo mismo. */
import { escapeHtml } from './security.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const engine = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

/* Mismo arnés que `h1-ast-una.test.js`, pero devuelve TAMBIÉN el contexto: los
   estados que hay que observar (`_recalcStatus`) son `let` de módulo que la función
   REASIGNA, así que hay que leerlos del global de la caja, no del valor que se pasó. */
function cajaDelMotor(nombres, extra = {}) {
  const code = nombres
    .map((n) => {
      const i =
        engine.indexOf('async function ' + n + '(') >= 0
          ? engine.indexOf('async function ' + n + '(')
          : engine.indexOf('function ' + n + '(');
      if (i < 0) throw new Error('no se halló ' + n + ' en engine.js');
      const j = engine.indexOf('\n}\n', i);
      return engine.slice(i, j + 2);
    })
    .join('\n');
  const ctx = { String, Number, Object, Array, JSON, Math, Date, parseFloat, ...extra };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__api = { ' + nombres.join(', ') + ' };').runInContext(ctx);
  return { api: ctx.__api, ctx };
}

const FECHA = '2026-08-14';

/** Monta el recálculo de UN día cuyo envío termina con el `outcome` pedido.
 *  `gasMessage` simula el motivo que el GAS manda al RECHAZAR (postPayload lo deja
 *  en el objeto de opciones; sólo lo fija en `rejected`). */
function escenario(outcome, devuelve, gasMessage) {
  const toasts = [];
  const panel = { innerHTML: '' };
  /* Mutable para poder encadenar DOS recálculos en la misma caja (un rechazo seguido
     de un éxito), que es lo único que delata si el estado se arrastra entre corridas. */
  const cfg = { outcome, devuelve, gasMessage };
  const ctx = {
    _recalcAffected: {},
    _recalcStatus: {},
    _recalcMotivo: {},
    curMod: 0,
    curTab: 'otro',
    isStdMod: () => true,
    mLabel: () => 'M01',
    toast: (...a) => toasts.push(a),
    // Una Cantidad Sembrada > 0, o la función se planta antes de enviar nada.
    loadCS: () => ({ si_1: '1000000' }),
    _recalcScan: () => ({ corr: 'C-585', days: [FECHA] }),
    loadHist: () => [],
    saveHistList: () => {},
    _recalcSvInData: () => false,
    loadE: () => ({ data: { corrida: 'C-585', fecha: FECHA } }),
    saveE: () => {},
    getStatus: () => 'pend',
    today: () => FECHA,
    renderPoblacion: () => {},
    gasUrl: () => 'https://script.google.com/macros/s/X/exec',
    isValidGasUrl: () => true,
    syncRateOk: () => true,
    buildDatosPayload: () => ({ sheetName: 'Datos Larvicultura - M01', headers: [], rows: [{}] }),
    postPayload: async (_p, _u, o) => {
      // Reproduce el contrato REAL: postPayload SIEMPRE fija `outcome` antes de
      // devolver, y devuelve false en tres de los cuatro desenlaces. El `message`
      // del GAS SÓLO lo propaga cuando rechaza.
      if (o) {
        o.outcome = cfg.outcome;
        if (cfg.outcome === 'rejected' && cfg.gasMessage) o.gasMessage = cfg.gasMessage;
      }
      return cfg.devuelve;
    },
    updateDots: () => {},
    updateSyncUI: () => {},
    escapeHtml,
    document: { getElementById: (id) => (id === 'cs-recalc-panel' ? panel : null) },
  };
  const { api, ctx: caja } = cajaDelMotor(
    ['recalcSurvivalForCorrida', '_recalcRenderPanel', '_gasMotivo'],
    ctx
  );
  return { api, caja, toasts, panel, cfg };
}

describe('recalcSurvivalForCorrida · el desenlace del envío, día a día', () => {
  it('ENCOLADO no es error: ni en el estado ni en el panel', async () => {
    const { api, caja, panel } = escenario('queued', false);
    await api.recalcSurvivalForCorrida();

    expect(caja._recalcStatus[FECHA]).toBe('queued');
    // La regresión que se está cerrando, dicha al revés por si el vocabulario cambia:
    expect(caja._recalcStatus[FECHA]).not.toBe('err');
    expect(panel.innerHTML).toContain('en cola');
    expect(panel.innerHTML).not.toContain('error de envío');
  });

  it('EN CURSO tampoco: postPayload ya avisó, el panel no lo repite como error', async () => {
    const { api, caja, panel } = escenario('inflight', false);
    await api.recalcSurvivalForCorrida();

    expect(caja._recalcStatus[FECHA]).toBe('inflight');
    expect(caja._recalcStatus[FECHA]).not.toBe('err');
    expect(panel.innerHTML).not.toContain('error de envío');
    /* Y tiene que DECIRLO. Sin esta línea, borrar el badge dejaría el panel cayendo en
       «recalculado (local)» —que tampoco dice «error»— y la mutación sobreviviría. */
    expect(panel.innerHTML).toContain('en curso');
  });

  /* La guarda contra la sobre-corrección: un rechazo del GAS es un error DE VERDAD
     —el dato no se escribió y reintentar no ayuda—, y tiene que seguir viéndose. */
  it('RECHAZADO sigue siendo error: el dato no se escribió', async () => {
    const { api, caja, panel } = escenario('rejected', false);
    await api.recalcSurvivalForCorrida();

    expect(caja._recalcStatus[FECHA]).toBe('err');
    expect(panel.innerHTML).toContain('error de envío');
    expect(panel.innerHTML).not.toContain('en cola');
  });

  it('OK sigue siendo ok', async () => {
    const { api, caja, panel } = escenario('ok', true);
    await api.recalcSurvivalForCorrida();

    expect(caja._recalcStatus[FECHA]).toBe('ok');
    expect(panel.innerHTML).toContain('reenviado');
  });

  /* ── El MOTIVO del rechazo (2026-09-01) ────────────────────────────────────────
     El GAS manda el porqué en `message`; `postPayload` lo deja en el objeto de
     opciones y `_gasMotivo` lo traduce a algo accionable. Las rutas que pasan por
     `_syncNotOkUI` lo enseñan desde el 2026-08-24; este panel lo tiraba, así que
     «hoja no permitida» y «límite de filas» se veían EXACTAMENTE IGUAL y desde la
     carretera no había por dónde empezar. */
  it('un RECHAZO enseña el motivo del GAS, no sólo «error de envío»', async () => {
    const { api, caja, panel } = escenario('rejected', false, 'Hoja no permitida');
    await api.recalcSurvivalForCorrida();

    expect(caja._recalcStatus[FECHA]).toBe('err');
    expect(caja._recalcMotivo[FECHA]).toBe('Hoja no permitida');
    expect(panel.innerHTML).toContain('Hoja no permitida');
  });

  it('y con el motivo viene la ACCIÓN concreta, que es lo que lo hace útil', async () => {
    const { panel } = await (async () => {
      const e = escenario('rejected', false, 'Hoja no permitida');
      await e.api.recalcSurvivalForCorrida();
      return e;
    })();
    // `_gasMotivo` añade la pista; sin ella el mensaje del GAS no dice qué hacer.
    expect(panel.innerHTML).toContain('vuelve a desplegarlo');
  });

  it('cada motivo trae SU pista, no una genérica', async () => {
    const e = escenario('rejected', false, 'Límite de filas excedido');
    await e.api.recalcSurvivalForCorrida();
    expect(e.panel.innerHTML).toContain('envía menos registros');
    expect(e.panel.innerHTML).not.toContain('vuelve a desplegarlo');
  });

  /* ⚠ El mensaje viene del SERVIDOR: es contenido dinámico en innerHTML y va escapado
     (regla 4 de CLAUDE.md). Se usa el `escapeHtml` REAL del producto, no un doble. */
  it('el motivo va ESCAPADO: no puede inyectar HTML en el panel', async () => {
    const e = escenario('rejected', false, '<img src=x onerror=alert(1)>');
    await e.api.recalcSurvivalForCorrida();
    expect(e.panel.innerHTML).not.toContain('<img');
    expect(e.panel.innerHTML).toContain('&lt;img');
  });

  it('un envío ENCOLADO no arrastra motivo: no es un rechazo', async () => {
    const e = escenario('queued', false);
    await e.api.recalcSurvivalForCorrida();
    expect(e.caja._recalcMotivo[FECHA]).toBe('');
  });

  it('un envío OK tampoco', async () => {
    const e = escenario('ok', true);
    await e.api.recalcSurvivalForCorrida();
    expect(e.caja._recalcMotivo[FECHA]).toBe('');
    expect(e.panel.innerHTML).not.toContain('color:#b45309');
  });

  /* Un motivo es de UNA corrida. Si no se limpiara al empezar la siguiente, el panel
     seguiría enseñando el rechazo de hace un rato sobre un día que acaba de irse bien
     — un error fantasma que manda a perseguir algo ya resuelto. */
  it('el motivo NO se arrastra: un recálculo que va bien borra el rechazo anterior', async () => {
    const e = escenario('rejected', false, 'Hoja no permitida');
    await e.api.recalcSurvivalForCorrida();
    expect(e.caja._recalcMotivo[FECHA]).toBe('Hoja no permitida');

    e.cfg.outcome = 'ok';
    e.cfg.devuelve = true;
    await e.api.recalcSurvivalForCorrida();

    expect(e.caja._recalcStatus[FECHA]).toBe('ok');
    expect(e.caja._recalcMotivo[FECHA]).toBe('');
    expect(e.panel.innerHTML).not.toContain('Hoja no permitida');
  });

  /* El fixture no puede ser degenerado: si `postPayload` no se llamara, TODOS los
     casos de arriba darían el mismo estado y el verde no probaría nada. */
  it('el fixture llega de verdad al envío (no se planta antes)', async () => {
    const { api, caja } = escenario('queued', false);
    await api.recalcSurvivalForCorrida();
    expect(Object.keys(caja._recalcAffected)).toEqual([FECHA]);
    expect(Object.keys(caja._recalcStatus)).toEqual([FECHA]);
  });
});
