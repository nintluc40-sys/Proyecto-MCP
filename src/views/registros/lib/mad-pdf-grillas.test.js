// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · el PDF de las grillas diarias (Salas y Tanques) — 2026-09-14 (P6)

   `downloadMadPDF` no tenía NINGUNA prueba. Salió al retirar su rama de «Lotes»: la grilla de
   Lotes se quitó el 2026-09-08 (la hoja pasó a ser Desoves) y la función conservaba una
   rama con las columnas viejas (Fila, Historial, Total nauplios…) que ya no podía
   alcanzarse, porque `MAD_FICHAS` sólo lleva Salas y Tanques. Retirarla es seguro sólo si
   lo que queda sigue funcionando, y eso no lo miraba nadie.

   Lo que se fija aquí:
     · cada PDF sale con UNA celda por cabecera en cada fila —la regla que ya se rompió el
       2026-09-08 en esta misma función, cuando se cambió una lista sin la otra—, con su
       título, su código de documento y su nombre de archivo;
     · Tanques va ordenado por número de tanque, no por cuándo se guardó;
     · un dispositivo que aún conserve registros de la grilla de Lotes NO genera ese PDF ni
       revienta: `lotes` ya no es una ficha de grilla.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['downloadMadPDF', 'madKey'];
const H = {};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };

  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);

  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

/* La ventana del PDF se sustituye por una que guarda lo que se escribe en ella. */
let escrito = null;
let abiertas = 0;
beforeEach(() => {
  escrito = null;
  abiertas = 0;
  window.open = () => { abiertas++; return { document: { write: (h) => { escrito = h; }, close() {}, title: '' } }; };
  for (const f of ['salas', 'tanques', 'lotes']) localStorage.removeItem(H.madKey(f));
});

const sembrar = (ficha, registros) => localStorage.setItem(H.madKey(ficha), JSON.stringify(registros));
const pdf = () => new DOMParser().parseFromString(escrito, 'text/html');
const celdasPorFila = (doc) => Array.from(doc.querySelectorAll('tbody tr')).map((tr) => tr.querySelectorAll('td').length);

describe('Maduración · PDF de Salas', () => {
  it('una celda por cabecera en cada fila, con su título, código y nombre de archivo', () => {
    sembrar('salas', [
      { id: 'a', ts: 2000, synced: true, data: { fecha: '2026-09-10', sala: 'Sala 4', estado: 'Producción', ras: 'SI' } },
      { id: 'b', ts: 1000, synced: false, data: { fecha: '2026-09-10', sala: 'Sala 1', estado: 'Cuarentena', ras: 'NO' } },
    ]);
    H.downloadMadPDF('salas');
    expect(abiertas).toBe(1);
    const doc = pdf();
    const cabeceras = doc.querySelectorAll('thead th').length;
    expect(cabeceras).toBeGreaterThan(10);                   // el fixture ejerce la tabla entera
    expect(celdasPorFila(doc)).toEqual([cabeceras, cabeceras]);
    expect(doc.querySelector('.ftitle').textContent).toContain('Maduración · Salas');
    expect(doc.querySelector('.doc-code').textContent).toBe('OMR-MAD-SAL');
    expect(doc.querySelector('title').textContent).toMatch(/^MAD-SAL_\d{8}_2reg$/);
  });
});

describe('Maduración · PDF de Tanques', () => {
  /* Guardados en un orden que NO es el del número de tanque: el PDF tiene que ordenarlos. */
  const registros = [
    { id: 't1', ts: 3000, synced: true, data: { fecha: '2026-09-10', sala: 'Sala 4', tanque: '1', muda: 2 } },
    { id: 't3', ts: 2000, synced: true, data: { fecha: '2026-09-10', sala: 'Sala 4', tanque: '3', muda: 0 } },
    { id: 't2', ts: 1000, synced: false, data: { fecha: '2026-09-10', sala: 'Sala 4', tanque: '2', muda: 1 } },
  ];

  it('una celda por cabecera en cada fila, con su título, código y nombre de archivo', () => {
    sembrar('tanques', registros);
    H.downloadMadPDF('tanques');
    expect(abiertas).toBe(1);
    const doc = pdf();
    const cabeceras = doc.querySelectorAll('thead th').length;
    expect(cabeceras).toBeGreaterThan(10);
    expect(celdasPorFila(doc)).toEqual([cabeceras, cabeceras, cabeceras]);
    expect(doc.querySelector('.ftitle').textContent).toContain('Maduración · Tanques');
    expect(doc.querySelector('.doc-code').textContent).toBe('OMR-MAD-TAN');
    expect(doc.querySelector('title').textContent).toMatch(/^MAD-TAN_\d{8}_3reg$/);
  });

  it('va ordenado por número de tanque, no por cuándo se guardó', () => {
    sembrar('tanques', registros);
    H.downloadMadPDF('tanques');
    const doc = pdf();
    const iTanque = Array.from(doc.querySelectorAll('thead th')).findIndex((th) => th.textContent === 'Tanque');
    expect(iTanque).toBeGreaterThan(0);
    const tanques = Array.from(doc.querySelectorAll('tbody tr')).map((tr) => tr.querySelectorAll('td')[iTanque].textContent);
    expect(tanques).toEqual(['1', '2', '3']);
  });
});

describe('Maduración · la grilla de Lotes retirada no genera PDF', () => {
  it('🔴 con registros viejos de Lotes en el dispositivo, ni abre ventana ni revienta', () => {
    sembrar('lotes', [{ id: 'l1', ts: 1000, synced: true, data: { fecha: '2026-09-01', sala: 'Sala 4', fila: '1', lote: 'BP' } }]);
    expect(() => H.downloadMadPDF('lotes')).not.toThrow();
    expect(abiertas).toBe(0);
  });
});
