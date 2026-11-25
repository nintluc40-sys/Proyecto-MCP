// @vitest-environment happy-dom
/* ============================================================
   PAUTA DEL 24-11 · ronda ⚡ de la Sesión A (engine.js), comprobada de forma directa.
   3 el PDF estándar y el tabulado dicen «Resumen INCOMPLETO» · 5 guardar la Cantidad Sembrada recalcula el % de Despacho ·
   4 Alimentación no guarda ni envía con el libro INCOMPLETO · 23 sin la MATRIZ no hay alta · T4.4 un segundo Inf. Supervisor
   del día avisa de que SUSTITUYE. Motor REAL; las piezas de alrededor se sustituyen con `poner`. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madResumenPdf', '_madResAvisoIncompleto', 'saveCSData', '_madAlimPreparar', '_madReproAltaBatch',
  'madMortYaEnviados', '_madMortConfirmarSustituye', 'MAD_MORT_HEADERS', 'today'];
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

describe('3 · el PDF estándar y el tabulado dicen que el libro llegó INCOMPLETO', () => {
  const imprimir = (modo, libro) => {
    const out = [];
    window.open = () => ({ document: { write: (h) => out.push(h), close() {} } });
    H.poner('madResPdfModo', () => modo);
    H.poner('madResVarsLeer', () => ({}));
    H.poner('_madResTabHTML', () => '<p>cuerpo</p>');
    H.poner('_madResCuerpoHTML', () => '<p>cuerpo</p>');
    H.poner('_madResumen', { hoy: '2026-11-20', libro });
    H.madResumenPdf('todo');
    return out.join('');
  };
  for (const modo of ['estandar', 'tabulada']) {
    it(`🔴 ${modo}: con una hoja sin leer lleva el aviso; con el libro entero, no`, () => {
      expect(imprimir(modo, { fallos: ['Hoja X'] })).toMatch(/Resumen INCOMPLETO:<\/b> no se pudieron leer 1 hoja\(s\) \(Hoja X\)/);
      expect(imprimir(modo, { fallos: [], recortadas: [] })).not.toMatch(/INCOMPLETO/);
    });
  }
  it('sin libro no inventa el aviso', () => { expect(H._madResAvisoIncompleto({})).toBe(''); });
});

describe('5 · guardar la Cantidad Sembrada recalcula el % de Supervivencia de Despacho en su sitio', () => {
  it('🔴 en la pestaña Despacho, el % sale de lo tecleado (500 de 1000 = 50.00) sin repintar', () => {
    // shell.html ya trae #fp-despacho (y quizá el modal): se usan los suyos, y se devuelven como estaban.
    let fp = document.getElementById('fp-despacho'); const nuevo = !fp;
    if (nuevo) { fp = document.createElement('div'); fp.id = 'fp-despacho'; document.body.appendChild(fp); }
    const antes = fp.innerHTML;
    fp.innerHTML = '<input name="po_0" value="500"><input name="sv_0" value="">';
    const modal = document.createElement('div');
    modal.innerHTML = '<input name="cs_si_0" value="1000">';
    document.body.prepend(modal);
    H.poner('curMod', 1); H.poner('curTab', 'despacho');
    H.poner('_recalcScan', () => ({ corr: '', days: [] }));
    H.poner('closeCS', () => {});
    try {
      H.saveCSData();
      expect(fp.querySelector('[name="sv_0"]').value).toBe('50.00');
      expect(fp.querySelector('[name="po_0"]').value).toBe('500');
    } finally { if (nuevo) fp.remove(); else fp.innerHTML = antes; modal.remove(); }
  });
});

describe('4 · Alimentación no guarda ni envía con el libro leído INCOMPLETO', () => {
  const preparar = (incompleto) => {
    H.poner('madAlimCollect', () => ({ fecha: H.today(), salas: [] }));
    H.poner('madAlimValidar', () => ({ errores: [], avisos: [] }));
    H.poner('buildMadAlimPayload', () => ({ rows: [['fila']] }));
    let pintado = null;
    H.poner('_madAlimPinta', (res) => { pintado = res; });
    H.poner('_madAlim', { incompleto });
    return { r: H._madAlimPreparar(), pintado: () => pintado };
  };
  it('🔴 incompleto → nada que enviar, y el motivo sale en el informe', () => {
    const p = preparar('no se pudieron leer 1 hoja(s) (Maduración Tanques)');
    expect(p.r).toBeNull();
    expect(p.pintado().errores.join(' ')).toMatch(/El libro llegó INCOMPLETO \(no se pudieron leer 1 hoja/);
  });
  it('con el libro entero sí se prepara', () => { expect(preparar('').r).not.toBeNull(); });
});

describe('23 · sin la MATRIZ leída no se da de alta', () => {
  const alta = async (indice) => {
    const f = document.createElement('input');
    f.id = 'repro-a-fecha'; f.value = H.today();
    document.body.appendChild(f);
    let construida = 0;
    const lib = window.__rgLib.buildAltaBatch;
    window.__rgLib.buildAltaBatch = () => { construida++; throw new Error('ARMADA'); };   // basta con saber si se llegó a armar
    H.poner('_reproMatrixIndex', () => indice);
    H.poner('_reproEnsureMatrix', async () => {});
    H.poner('_reproPaintMatrixBanner', () => {});
    H.poner('_reproAltaCollect', () => [{ trovan: 'X1' }]);
    H.poner('_madReproShowAltaReport', () => {});
    try { await H._madReproAltaBatch(); } catch (e) { if (e.message !== 'ARMADA') throw e; } finally { f.remove(); window.__rgLib.buildAltaBatch = lib; }
    return construida;
  };
  it('🔴 MATRIZ sin leer → ni se arma el alta, y se dice por qué', async () => {
    expect(await alta(null)).toBe(0);
    expect(avisos.join(' ')).toMatch(/No se dio de alta: no se pudo leer la MATRIZ/);
  });
  it('con la MATRIZ leída, el alta sigue', async () => { expect(await alta({ porTrovan: {} })).toBe(1); });
});

describe('T4.4 · un segundo Inf. Supervisor del mismo día avisa de que SUSTITUYE', () => {
  const fila = (id, muertas) => {
    const r = H.MAD_MORT_HEADERS.map(() => '');
    const pon = (h, v) => { r[H.MAD_MORT_HEADERS.indexOf(h)] = v; };
    pon('ID', id); pon('Fecha', '2026-11-20'); pon('Lote', 'LT1'); pon('Código genético', 'CGX'); pon('Tipo de tanque', 'Desove'); pon('Hembras muertas', muertas);
    return r;
  };
  it('🔴 la llave ya está en la hoja o en lo enviado desde el equipo; una fila sin muertas no cuenta', () => {
    const hist = [{ ficha: 'mortdes', payload: { headers: H.MAD_MORT_HEADERS.slice(), rows: [fila('B', 1)] } }];
    const r = H.madMortYaEnviados([fila('A', 3), fila('B', 2), fila('C', 1), fila('D', '')], [{ ID: 'A' }, { ID: 'D' }], hist);
    expect(r.map((x) => x.donde)).toEqual(['la hoja', 'este equipo']);
  });
  it('🔴 pregunta, y Cancelar no envía; sin repetido no pregunta; en una ✏️ corrección no pregunta', async () => {
    const preguntas = [];
    window.confirm = (m) => { preguntas.push(m); return false; }; globalThis.confirm = window.confirm;
    H.poner('_madHojaFresca', async () => [{ ID: 'A' }]);
    H.poner('madHistLeer', () => []);
    H.poner('_madHistCorrActiva', () => null);
    expect(await H._madMortConfirmarSustituye({ rows: [fila('A', 3)] })).toBe(false);
    expect(preguntas[0]).toMatch(/Ya hay un Inf\. Supervisor de ese día[\s\S]*Lote LT1 \(CGX\) · Desove[\s\S]*SUSTITUYE/);
    expect(await H._madMortConfirmarSustituye({ rows: [fila('Z', 3)] })).toBe(true);
    H.poner('_madHistCorrActiva', () => ({}));
    expect(await H._madMortConfirmarSustituye({ rows: [fila('A', 3)] })).toBe(true);
    expect(preguntas.length).toBe(1);
  });
});
