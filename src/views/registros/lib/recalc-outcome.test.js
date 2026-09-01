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

/** Monta el recálculo de UN día cuyo envío termina con el `outcome` pedido. */
function escenario(outcome, devuelve) {
  const toasts = [];
  const panel = { innerHTML: '' };
  const ctx = {
    _recalcAffected: {},
    _recalcStatus: {},
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
      // devolver, y devuelve false en tres de los cuatro desenlaces.
      if (o) o.outcome = outcome;
      return devuelve;
    },
    updateDots: () => {},
    updateSyncUI: () => {},
    escapeHtml: (s) => String(s),
    document: { getElementById: (id) => (id === 'cs-recalc-panel' ? panel : null) },
  };
  const { api, ctx: caja } = cajaDelMotor(
    ['recalcSurvivalForCorrida', '_recalcRenderPanel'],
    ctx
  );
  return { api, caja, toasts, panel };
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

  /* El fixture no puede ser degenerado: si `postPayload` no se llamara, TODOS los
     casos de arriba darían el mismo estado y el verde no probaría nada. */
  it('el fixture llega de verdad al envío (no se planta antes)', async () => {
    const { api, caja } = escenario('queued', false);
    await api.recalcSurvivalForCorrida();
    expect(Object.keys(caja._recalcAffected)).toEqual([FECHA]);
    expect(Object.keys(caja._recalcStatus)).toEqual([FECHA]);
  });
});
