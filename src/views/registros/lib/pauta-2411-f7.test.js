// @vitest-environment happy-dom
/* ============================================================
   PAUTA DEL 24-11 · punto 2, FAMILIA 7 (lo que la app dice y no es verdad) de la revisión del 15-11. Motor REAL; las piezas de
   alrededor se sustituyen con `poner`. T8.6 (Evidencias, en el GAS) va con el próximo despliegue del GAS. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['syncAll', '_micLastSavedText', 'madDesCorreccionCambios', 'madDesFechasNauplios', 'madHistGrillaPdf', '_madHistPdfDiaHTML', 'today'];
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

describe('T1.5 · un segundo 🔄 mientras el primero envía no dice «registrados»', () => {
  it('🔴 dice que ya está sincronizando y no vuelve a empezar', async () => {
    let soltar, entradas = 0;
    H.poner('_syncAllCuerpo', () => { entradas++; return new Promise((r) => { soltar = r; }); });
    const p1 = H.syncAll();
    await H.syncAll();
    expect(entradas).toBe(1);
    expect(avisos.join(' ')).toMatch(/Ya se está sincronizando/);
    soltar(); await p1;
    const p3 = H.syncAll(); soltar(); await p3;
    expect(entradas).toBe(2);
  });
});

describe('T7.7 · el «✅ Sincronizado» del Laboratorio es el de ESTE análisis', () => {
  it('🔴 otro análisis del mismo día enviado no hace «Sincronizado» al nuevo', () => {
    H.poner('_micRaw', () => [{ ts: 1, synced: true, data: { fechaMuestreo: '2026-11-20', corrida: '', sid: 'OTRO' } }]);
    expect(H._micLastSavedText({ fechaMuestreo: '2026-11-20', corrida: '', sid: 'NUEVO' })).toMatch(/Sin guardar localmente/);
    expect(H._micLastSavedText({ fechaMuestreo: '2026-11-20', corrida: '', sid: 'OTRO' })).toMatch(/Sincronizado/);
  });
});

describe('T4.9 · un desove viejo sin N2/N5: la fecha de oficio no es un «cambio»', () => {
  it('🔴', () => {
    const fn = H.madDesFechasNauplios('2026-11-20');
    const r = H.madDesCorreccionCambios({ fecha: '2026-11-20', fechaN2: '', fechaN5: '' }, { fecha: '2026-11-20', fechaN2: fn.n2, fechaN5: fn.n5 });
    expect(r.campos).not.toContain('fechaN2');
    expect(r.campos).not.toContain('fechaN5');
  });
  it('una N2 cambiada de verdad sí lo es', () => {
    const r = H.madDesCorreccionCambios({ fecha: '2026-11-20', fechaN2: '' }, { fecha: '2026-11-20', fechaN2: '2026-11-25' });
    expect(r.campos).toContain('fechaN2');
  });
});

describe('T5.4 · el PDF del 📜 no deja puesto su filtro', () => {
  it('🔴', () => {
    H.poner('downloadMadPDF', () => {});
    const antes = JSON.stringify(H.leer('_madFilters').salas);
    H.madHistGrillaPdf('salas', '2026-11-20', '');
    expect(JSON.stringify(H.leer('_madFilters').salas)).toBe(antes);
  });
});

describe('T3.7 · el PDF del 📜 de Salas lleva también sus Zonas', () => {
  it('🔴', () => {
    H.poner('_madHistPayloadGrilla', (g) => (g.ficha === 'zonas' ? { sheetName: 'Maduración Zonas', headers: ['Zona'], rows: [['Z1']] } : { sheetName: 'Maduración Sala', headers: ['Sala'], rows: [['S1']] }));
    const html = H._madHistPdfDiaHTML([{ g: { ficha: 'salas', fecha: '2026-11-20', sala: '', ts: 1 }, fecha: '2026-11-20' }]);
    expect(html).toMatch(/Zonas · 1 fila\(s\)/);
    expect(html).toContain('Z1');
  });
});
