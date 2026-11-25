// @vitest-environment happy-dom
/* ============================================================
   PAUTA DEL 24-11 · ronda 🕐 de la Sesión A (engine.js), comprobada de forma directa.
   T7.1 el envío de Traslado no borra lo tecleado mientras espera · T7.6 una fecha vacía no pasa a ser HOY al repintar ·
   T3.4 ↩ Recuperar de Tanques no descarta la ronda en curso por parecerse a otra ya cerrada.
   Motor REAL; las piezas de alrededor se sustituyen con `poner`. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['syncAllPendingTras', 'renderMicNuevo', '_madRecTanques', 'postPayload', 'saveCfg', 'gcfg', 'addToAlgHist', 'scfg', '_soltarGasUrlPorDefecto', 'goBack', 'today'];
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
beforeEach(() => { globalThis.localStorage.clear(); avisos.length = 0; });

describe('T7.1 · al terminar el envío de Traslado, lo tecleado en la espera se queda', () => {
  const enviar = async (sucio) => {
    let pintada = null;
    H.poner('gasUrl', () => 'https://script.google.com/macros/s/PRUEBA/exec');
    H.poner('isValidGasUrl', () => true);
    H.poner('syncRateOk', () => true);
    H.poner('loadTras', () => [{ id: 't1', synced: false }]);
    H.poner('buildTrasPayload', () => ({ rows: [['x']] }));
    H.poner('_trasLotes', (p) => [p]);
    H.poner('postPayload', async () => true);
    H.poner('_marcaSellar', () => {});
    H.poner('_marcarEnviado', () => {});
    H.poner('setSyncUI', () => {});
    H.poner('updateDots', () => {});
    H.poner('updateSyncUI', () => {});
    H.poner('collectTraslado', () => ({ o2: '5,5' }));
    H.poner('renderTraslado', () => { pintada = H.leer('_trasRecovered'); });
    H.poner('curTab', 'traslado');
    H.poner('_trasFormDirty', sucio);
    await H.syncAllPendingTras();
    return { pintada, sucio: H.leer('_trasFormDirty') };
  };
  it('🔴 con algo tecleado: se repinta con lo de pantalla, y sigue «sin guardar»', async () => {
    const r = await enviar(true);
    expect(r.pintada).toEqual({ o2: '5,5' });
    expect(r.sucio).toBe(true);
  });
  it('sin nada tecleado: se repinta con lo guardado, como antes', async () => {
    expect((await enviar(false)).pintada).toBeNull();
  });
});

describe('T7.6 · Laboratorio: una fecha de muestreo vacía no pasa a ser HOY al repintar', () => {
  it('🔴 vacía se queda vacía (así el aviso «falta la fecha» sigue saltando); sin borrador, hoy', () => {
    const fm = () => document.getElementById('mic-fm');
    H.poner('loadMicDraft', () => ({ meta: { fechaMuestreo: '', fechaResultados: '', corrida: '', responsable: '' }, sections: {} }));
    H.renderMicNuevo();
    expect(fm().value).toBe('');
    H.poner('loadMicDraft', () => ({ meta: { fechaResultados: '', corrida: '', responsable: '' }, sections: {} }));
    H.renderMicNuevo();
    expect(fm().value).toBe(H.today());
  });
});

describe('T3.4 · ↩ Recuperar de Tanques no descarta la ronda en curso', () => {
  const F = '2026-11-20', S = 'Sala 5';
  const p1 = (ts) => [{ id: 'p1', ts, data: { fecha: F, sala: S, tanque: '7', parte: 1, cerrado: true, hembras_muertas: 1 } }];
  const copia = { ts: 2000, rows: [{ fecha: F, sala: S, tanque: '7', hembras_muertas: 1 }, { fecha: F, sala: S, tanque: '8', machos_muertos: 2 }] };
  it('🔴 la ronda 2 igual que la 1 (cerrada ANTES de la copia) entra: no es «lo ya guardado»', () => {
    const list = p1(1000);
    expect(H._madRecTanques(list, copia)).toBe(2);
    expect(list.filter((r) => r.data.tanque === '7')).toHaveLength(2);
  });
  it('la copia vieja de algo guardado DESPUÉS sigue sin volver a entrar', () => {
    expect(H._madRecTanques(p1(3000), copia)).toBe(1);
  });
});

describe('24 · si el GAS contesta «dedup» (ese mismo envío ya había llegado), la app lo dice', () => {
  const responder = (cuerpo) => { globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify(cuerpo) }); };
  it('🔴 «dedup»: cuenta como enviado y avisa de que ya estaba en la hoja', async () => {
    responder({ status: 'ok', dedup: true });
    expect(await H.postPayload({ sheetName: 'Hoja ficticia', rows: [['a', 1]] }, 'https://script.google.com/macros/s/PRUEBA/exec', {})).toBe(true);
    expect(avisos.join(' ')).toMatch(/ya había llegado a la hoja/);
  });
  it('un «ok» normal no lo dice', async () => {
    responder({ status: 'ok' });
    expect(await H.postPayload({ sheetName: 'Hoja ficticia', rows: [['b', 2]] }, 'https://script.google.com/macros/s/PRUEBA/exec', {})).toBe(true);
    expect(avisos.join(' ')).not.toMatch(/ya había llegado/);
  });
});

describe('25 · ⚙ Config no guarda la dirección POR DEFECTO como propia', () => {
  const guardar = (url) => { document.getElementById('cfg-url').value = url; H.saveCfg(); return H.gcfg('gas-url', ''); };
  it('🔴 la de por defecto queda sin fijar (el equipo seguirá a la de la app); una distinta sí se guarda', () => {
    expect(guardar(H.leer('DEFAULT_GAS_URL'))).toBe('');
    expect(guardar('https://script.google.com/macros/s/OTRA-FICTICIA/exec')).toBe('https://script.google.com/macros/s/OTRA-FICTICIA/exec');
  });
});

describe('6 · Algas no agrega un registro sin una fecha que exista', () => {
  const agregar = (data) => {
    let guardado = 0;
    H.poner('curMod', H.leer('LAB_MOD'));
    H.poner('collect', () => data);
    H.poner('_rangeGuard', () => false);
    H.poner('validateFicha', () => true);
    H.poner('saveAlgHist', () => { guardado++; return true; });
    H.poner('loadAlgHist', () => []);
    try { H.addToAlgHist(); } catch (_) { /* lo de después de guardar (repintar) no importa aquí */ }
    return guardado;
  };
  it('🔴 con las Cel/mL y SIN fecha: no se agrega, y se dice', () => {
    expect(agregar({ cel_ml: '5' })).toBe(0);
    expect(avisos.join(' ')).toMatch(/falta la Fecha, o no existe/);
  });
  it('con una fecha que existe, sí', () => { expect(agregar({ fecha: '2026-11-20', cel_ml: '5' })).toBe(1); });
});

describe('auditoría de B (25-11) · los tres detalles', () => {
  it('🔴 2 · al arrancar se suelta la dirección POR DEFECTO guardada como propia; una distinta se respeta', () => {
    H.scfg('gas-url', H.leer('DEFAULT_GAS_URL'));
    expect(H._soltarGasUrlPorDefecto()).toBe(true);
    expect(H.gcfg('gas-url', '')).toBe('');
    H.scfg('gas-url', 'https://script.google.com/macros/s/OTRA-FICTICIA/exec');
    expect(H._soltarGasUrlPorDefecto()).toBe(false);
    expect(H.gcfg('gas-url', '')).toBe('https://script.google.com/macros/s/OTRA-FICTICIA/exec');
  });
  it('🔴 3 · Laboratorio con la fecha vacía: la cabecera no dice HOY', () => {
    H.poner('loadMicDraft', () => ({ meta: { fechaMuestreo: '', fechaResultados: '', corrida: '', responsable: '' }, sections: {} }));
    H.renderMicNuevo();
    const chip = document.querySelector('#fp-micnuevo .ssp-mt');
    expect(chip.textContent).toBe('— sin fecha —');
  });
  it('🔴 5 · salir tras un ERROR al guardar la grilla (y elegir seguir) intenta igual la copia ↩', () => {
    let copias = 0;
    window.confirm = () => true; globalThis.confirm = window.confirm;
    H.poner('curMod', H.leer('MAD_MOD')); H.poner('curTab', 'tanques'); H.poner('_madGridDirty', true);
    H.poner('_madCommitActive', () => { H.poner('_madCommitError', true); return false; });
    H.poner('saveMadRecovery', () => { copias++; return true; });
    try { H.goBack(); } catch (_) { /* el resto de la salida (repintar la entrada) no importa aquí */ }
    expect(copias).toBe(1);
  });
});
