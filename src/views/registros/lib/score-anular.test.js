// @vitest-environment happy-dom
/* ============================================================
   AsT · 🎯 SCORE · LO QUE SE QUITA DE UNA EVALUACIÓN YA ENVIADA (A10, 2026-11-06)

   LO QUE PASABA: «Registro_Score» se escribe por el ID de cada fila (fecha·módulo·corrida·tanque) y el Apps Script no
   borra. Un tanque vaciado con 🧹 dejaba de viajar y seguía en la hoja con sus puntos; y una evaluación abierta con ✏️ a
   la que se le cambiaba la fecha, el módulo o la corrida salía con otros ID, y la de antes se quedaba en la hoja.

   AHORA (usuario: «Sin tocar el Apps Script», «Preguntar cada vez»): esas filas viajan ANULADAS —el mismo ID, sin puntos,
   «⛔ ANULADA · …» en Interpretación— y el sistema no las carga. Cambiar la evaluación de día pregunta: corrección (la de
   antes se anula en la hoja y sale del dispositivo), otra evaluación (se queda) o nada. Sólo se anula lo que llegó a la hoja.
   Una evaluación NUEVA que cae sobre una enviada no la toca (A9: «lo que falta sigue en la hoja»).

   Motor REAL sobre el shell real; la red, simulada. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['SCORE_HEADERS', 'SCORE_CRITERIOS', 'renderScore', 'scorePick', 'scoreTanque', 'scoreGuardar', 'scoreEnviar', 'scoreNueva',
  'scoreAbrir', 'scoreCampo', 'scoreVaciarTanque', '_scoreRaw', '_lastSyncFingerprint'];
const H = {};
const envios = [];
let respuesta = 'ok';

const almacen = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
})();

beforeAll(async () => {
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.olvidarModelo=function(){ _scoreModel=null; _scoreTq=1; _scoreOrigen=null; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast(() => {});
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return respuesta; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) });
});

let respuestas = [];
const preguntas = [];
beforeEach(() => {
  almacen.clear();
  envios.length = 0;
  respuesta = 'ok';
  respuestas = [];
  preguntas.length = 0;
  H._lastSyncFingerprint.clear();
  H.olvidarModelo();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  window.confirm = (m) => { preguntas.push(String(m)); return respuestas.length ? respuestas.shift() : true; };
  H.renderScore();
});
afterEach(() => { vi.useRealTimers(); });

const col = (h) => H.SCORE_HEADERS.indexOf(h);
const campo = (k, v) => { const el = document.createElement('input'); el.setAttribute('data-sk', k); el.value = v; H.scoreCampo(el); };
const marcarTodo = (nivel) => H.SCORE_CRITERIOS.forEach((c) => H.scorePick(c.k, c.pts[nivel]));
const evaluar = (tanques, cab = {}) => {
  campo('fecha', cab.fecha || '2026-11-03'); campo('modulo', cab.modulo || 'M03'); campo('corrida', cab.corrida || '598');
  Object.entries(tanques).forEach(([n, nivel]) => { H.scoreTanque(Number(n)); marcarTodo(nivel); });
};
const ultimo = () => envios.at(-1);
const anuladas = (env) => env.rows.filter((r) => String(r[col('Interpretación')]).startsWith('⛔ ANULADA'));
const enviar = async () => { H._lastSyncFingerprint.clear(); await H.scoreEnviar(); };

describe('A10 · Score: 🧹 un tanque ya enviado', () => {
  it('🔴 viaja ANULADO con su mismo ID: sin puntos y «⛔ ANULADA · tanque vaciado» (antes no viajaba y seguía en la hoja)', async () => {
    evaluar({ 1: 2, 2: 3 });
    await enviar();
    const idTq2 = ultimo().rows.find((r) => r[col('Tanque')] === 2)[col('ID')];
    H.scoreTanque(2);
    H.scoreVaciarTanque();
    expect(preguntas.at(-1)).toContain('Ya se envió: al guardar y enviar, en la hoja quedará ANULADO.');
    await enviar();
    const an = anuladas(ultimo());
    expect(an).toHaveLength(1);
    expect(an[0][col('ID')]).toBe(idTq2);
    expect(an[0][col('Tanque')]).toBe(2);
    expect(an[0][col('Interpretación')]).toBe('⛔ ANULADA · tanque vaciado');
    expect([an[0][col('Score')], an[0][col(H.SCORE_CRITERIOS[0].h)]]).toEqual(['', '']);
    expect(an[0]).toHaveLength(H.SCORE_HEADERS.length);
    expect(ultimo().rows.filter((r) => !an.includes(r)).map((r) => r[col('Tanque')])).toEqual([1]);
  });

  it('una vez salido, no se vuelve a mandar; y si se vuelve a evaluar, va con sus puntos', async () => {
    evaluar({ 1: 2, 2: 3 });
    await enviar();
    H.scoreTanque(2); H.scoreVaciarTanque();
    await enviar();
    H.scoreTanque(1); marcarTodo(4);
    await enviar();
    expect(anuladas(ultimo())).toHaveLength(0);
    H.scoreTanque(2); marcarTodo(1);
    await enviar();
    expect(anuladas(ultimo())).toHaveLength(0);
    expect(ultimo().rows.map((r) => r[col('Tanque')]).sort()).toEqual([1, 2]);
  });

  it('lo que nunca salió no se anula', async () => {
    evaluar({ 1: 2, 2: 3 });
    H.scoreGuardar();
    H.scoreTanque(2); H.scoreVaciarTanque();
    expect(preguntas.at(-1)).not.toContain('Ya se envió');
    await enviar();
    expect(anuladas(ultimo())).toHaveLength(0);
  });

  it('🔴 si el envío se rechaza, la anulación espera y sale con el siguiente', async () => {
    evaluar({ 1: 2, 2: 3 });
    await enviar();
    H.scoreTanque(2); H.scoreVaciarTanque();
    respuesta = 'rejected';
    await enviar();
    respuesta = 'ok';
    await enviar();
    expect(anuladas(ultimo())).toHaveLength(1);
  });

  it('una evaluación NUEVA sobre una enviada no anula lo que le falta (A9: sigue en la hoja)', async () => {
    evaluar({ 1: 2 });
    await enviar();
    H.scoreNueva();
    evaluar({ 4: 3 });
    await enviar();
    expect(anuladas(ultimo())).toHaveLength(0);
  });
});

describe('A10 · Score: otra fecha, módulo o corrida en la evaluación abierta', () => {
  it('🔴 corrección: la de antes viaja ANULADA en la hoja y sale del dispositivo', async () => {
    evaluar({ 1: 2, 2: 3 });
    await enviar();
    const viejos = ultimo().rows.map((r) => r[col('ID')]);
    campo('fecha', '2026-11-04');
    respuestas = [true];
    await enviar();
    expect(preguntas.at(-1)).toMatch(/03\/11\/2026 · M03 · corrida 598[\s\S]*CORRECCIÓN[\s\S]*04\/11\/2026 · M03 · corrida 598/);
    const an = anuladas(ultimo());
    expect(an.map((r) => r[col('ID')]).sort()).toEqual(viejos.sort());
    expect(an.map((r) => r[col('Fecha')])).toEqual(['2026-11-03', '2026-11-03']);
    expect(an[0][col('Interpretación')]).toBe('⛔ ANULADA · pasó al 04/11/2026 · M03 · corrida 598');
    expect(ultimo().rows.filter((r) => !an.includes(r)).map((r) => r[col('Fecha')])).toEqual(['2026-11-04', '2026-11-04']);
    expect(H._scoreRaw().map((r) => r.data.fecha)).toEqual(['2026-11-04']);
  });

  it('🔴 «otra evaluación»: no anula nada y la de antes se queda', async () => {
    evaluar({ 1: 2 });
    await enviar();
    campo('corrida', '599');
    respuestas = [false, true];
    await enviar();
    expect(anuladas(ultimo())).toHaveLength(0);
    expect(H._scoreRaw().map((r) => r.data.corrida).sort()).toEqual(['598', '599']);
  });

  it('cancelar las dos preguntas no guarda nada', async () => {
    evaluar({ 1: 2 });
    await enviar();
    campo('modulo', 'M04');
    respuestas = [false, false];
    H.scoreGuardar();
    expect(H._scoreRaw().map((r) => r.data.modulo)).toEqual(['M03']);
  });

  it('corregir algo que nunca salió no anula nada (sólo lo sustituye en el dispositivo)', async () => {
    evaluar({ 1: 2 });
    H.scoreGuardar();
    campo('fecha', '2026-11-04');
    respuestas = [true];
    await enviar();
    expect(anuladas(ultimo())).toHaveLength(0);
    expect(H._scoreRaw().map((r) => r.data.fecha)).toEqual(['2026-11-04']);
  });
});
