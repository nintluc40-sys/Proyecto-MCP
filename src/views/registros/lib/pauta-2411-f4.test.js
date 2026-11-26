// @vitest-environment happy-dom
/* ============================================================
   PAUTA DEL 24-11 · punto 2, FAMILIA 4 (correcciones que duplican o pisan) de la revisión del 15-11. Motor REAL; las piezas de
   alrededor se sustituyen con `poner`. T8.3 va con la ronda de 📝 Blanco (decisión del usuario). Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_enqueueSync', 'trasLimpiarRevision', '_persistAst', '_labCambioDeClave', '_labCorregir', '_scoreEnviados', '_reproAMedias', 'today'];
const H = {};
const avisos = [];

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\nH.poner=function(n,v){ eval(n+"=v"); };'
    + '\nH.leer=function(n){ return eval(n); };\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
});
beforeEach(() => { globalThis.localStorage.clear(); avisos.length = 0; window.confirm = () => true; globalThis.confirm = window.confirm; });

describe('T7.3 · Traslado: «🧹 Limpiar» una parada apaga sus filas en la hoja', () => {
  it('🔴 la parada vaciada deja sus llaves en _quitados (y conserva su rid)', () => {
    let pintado = null;
    const data = { revisiones: [{ rid: 'r1', hora: '08:00' }, { rid: 'r2', hora: '10:00', lugar: 'X' }], camiones: [{ cid: 'c1', placa: 'P-1' }] };
    H.poner('collectTraslado', () => data);
    H.poner('trasCamionesUI', () => [{}]);
    H.poner('_trasRepintar', (d) => { pintado = d; });
    H.trasLimpiarRevision(1);
    expect(pintado.revisiones[1].rid).toBe('r2');
    expect(pintado.revisiones[1].hora).toBe('');
    expect((pintado._quitados || []).length).toBeGreaterThan(0);
    expect(pintado._quitados.every((k) => k.includes('r2'))).toBe(true);
  });
});

describe('T6.10 · As. Técnico: un registro purgado mientras se edita se guarda con SU id', () => {
  it('🔴', () => {
    let guardada = null;
    H.poner('collectAst', () => ({ fecha: H.today() }));
    H.poner('validateAst', () => true);
    H.poner('_astRaw', () => []);
    H.poner('_astSave', (l) => { guardada = l; return true; });
    H.poner('renderAst', () => {});
    H.poner('_astEditing', 'ID-VIEJO');
    H._persistAst();
    expect(guardada[0].id).toBe('ID-VIEJO');
  });
});

describe('T7.11 · Laboratorio: un análisis con VARIAS claves (corridas) no inventa una corrección', () => {
  const clave = (d) => d.corrida;
  const misma = () => true;
  it('🔴 volver a guardar sin cambios no pregunta', () => {
    const preguntas = [];
    window.confirm = (m) => { preguntas.push(m); return true; }; globalThis.confirm = window.confirm;
    const lista = [{ id: 'a', data: { sid: 'S', corrida: 'A' } }, { id: 'b', data: { sid: 'S', corrida: 'B' } }];
    const nuevos = [{ data: { sid: 'S', corrida: 'A' } }, { data: { sid: 'S', corrida: 'B' } }];
    expect(H._labCambioDeClave(lista, nuevos, misma, clave).accion).toBe('nada');
    expect(preguntas).toHaveLength(0);
  });
  it('🔴 la corrección no anula una clave que se vuelve a escribir', () => {
    H.poner('_labAnulaciones', () => []);
    H.poner('_labClavesEnCola', () => new Set());
    H.poner('_labLlego', () => true);
    H.poner('_labDescribir', () => 'x');
    const previos = [{ id: 'a', data: { corrida: 'A' } }, { id: 'b', data: { corrida: 'B' } }];
    const r = H._labCorregir('mic', previos.slice(), previos, [{ data: { corrida: 'B' } }, { data: { corrida: 'C' } }], clave, (d) => d);
    expect(r.anul.map((a) => a.data.corrida)).toEqual(['A']);
  });
});

describe('T6.3 · Score: lo que espera en la cola cuenta como enviado (para anularlo al corregir)', () => {
  it('🔴', () => {
    const hdr = H.leer('SCORE_HEADERS');
    const fila = hdr.map(() => '');
    fila[hdr.indexOf('Tanque')] = 'TQ 4';
    H._enqueueSync({ sheetName: 'Registro_Score', rows: [fila] }, 'req-score', 'https://script.google.com/macros/s/PRUEBA/exec', { kind: 'score', keys: ['ev1@100'] });
    expect(H._scoreEnviados({ id: 'ev1', ts: 200, enviados: [] })).toContain('TQ 4');
  });
});

describe('T5.3 · reproductivo: un envío a medias se dice (y que NO se repita)', () => {
  it('🔴 la MATRIZ llegó y Transferencias se rechazó', () => {
    const r = H._reproAMedias('x', 'El traslado TR-000009', [['la MATRIZ', { outcome: 'ok' }, true], ['el historial de Transferencias', { outcome: 'rejected', gasMessage: 'motivo' }, true]]);
    expect(r).toBe(true);
    expect(avisos.join(' ')).toMatch(/quedó A MEDIAS: la MATRIZ ya lo tiene, pero el historial de Transferencias \(motivo\) lo rechazó\. NO lo vuelvas a procesar/);
  });
  it('🔴 «inflight» no es «rechazó», y lo que requiere atención sale en el mismo aviso', () => {
    H._reproAMedias('x', 'El traslado', [['la MATRIZ', { outcome: 'ok' }, true], ['Transferencias', { outcome: 'inflight' }, true]], ['2 chips por elegir.']);
    expect(avisos.join(' ')).toMatch(/Transferencias no lo recibió\. NO lo vuelvas a procesar[\s\S]*2 chips por elegir\./);
  });
  it('si fallan las dos, no es «a medias»', () => {
    expect(H._reproAMedias('x', 'y', [['a', { outcome: 'rejected' }, true], ['b', { outcome: 'rejected' }, true]])).toBe(false);
  });
});
