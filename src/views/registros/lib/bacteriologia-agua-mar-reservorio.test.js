// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Bacteriología · «Agua de mar y Reservorios» gana su columna Muestra

   Pedido del usuario (2026-09-13): en Maduración, formato «Agua de mar y Reservorios», una
   columna Muestra «con el mismo comportamiento» (se elige o se escribe) y las opciones
   «Agua de Mar» y «Reservorio».

   🔑 DÓNDE CAE EN LA HOJA, y por qué ahí. El formato no tenía columnas de contexto y escribe
   un valor FIJO («Agua limpia y mar») en «Tipo de muestra»: el tablero lo lee para decidir el
   área y los umbrales. Si la columna nueva usara esa clave, «Reservorio» REEMPLAZARÍA el valor
   fijo y cambiaría cómo se clasifican esas filas. Por eso va a la clave `muestras`, que ya
   tiene su columna en la hoja («Muestras», Fase 3) y que el tablero ya enseña como «Muestra».
   Cero columnas nuevas, cero cambios de GAS, «Tipo de muestra» intacto.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['MIC_FORMATS', 'renderMicNuevo', 'micTypeSet', 'loadMicDraft', 'saveMicDraft',
  'collectMicDraft', 'buildMicPayload', 'MIC_SHEET_HEADERS',
  'saveMicLocal', 'loadMic', 'micSessionKey', 'micEditSession', 'downloadMicPDF'];
const H = {};
const FMT = 'agua-limpia-mar';
const OPCIONES = ['Agua de Mar', 'Reservorio'];

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
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

const pintar = () => {
  localStorage.clear();
  H.micTypeSet('bact');
  const d = H.loadMicDraft(); d.activeFmt = FMT; H.saveMicDraft(d);
  H.renderMicNuevo();
};
const celda = (fila, k) => document.querySelector(`[name="mic_${FMT}_${fila}_${k}"]`);
const col = (nombre) => H.MIC_SHEET_HEADERS.indexOf(nombre);

describe('Bacteriología · Agua de mar y Reservorios · columna Muestra', () => {
  it('🔴 el formato declara la columna Muestra, editable con sugerencias', () => {
    const c = H.MIC_FORMATS[FMT].ctx.find((x) => x.l === 'Muestra');
    expect(c, 'el formato no tiene columna Muestra').toBeTruthy();
    expect(c.type).toBe('txtlist');
    expect(c.opts).toEqual(OPCIONES);
  });

  it('🔴 va a la clave `muestras`, NO a `tipoMuestra` (que lleva el valor fijo del formato)', () => {
    const c = H.MIC_FORMATS[FMT].ctx.find((x) => x.l === 'Muestra');
    expect(c.k).toBe('muestras');
    expect(H.MIC_FORMATS[FMT].fixedTipo).toBe('Agua limpia y mar');
  });

  it('🔴 la celda pintada ofrece Agua de Mar y Reservorio, y deja escribir', () => {
    pintar();
    const inp = celda(1, 'muestras');
    expect(inp, 'no se pintó la celda Muestra').toBeTruthy();
    expect(inp.tagName).toBe('INPUT');
    expect(inp.getAttribute('type')).toBe('text');
    const dl = document.getElementById(inp.getAttribute('list'));
    expect([...dl.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual(OPCIONES);
  });

  it('🔴 el viaje: «Reservorio» llega a «Muestras» y «Tipo de muestra» sigue siendo el fijo', () => {
    pintar();
    celda(1, 'muestras').value = 'Reservorio';
    celda(1, 'vamar').value = '12';
    const fila = H.collectMicDraft().sections[FMT].rows[0];
    expect(fila.muestras).toBe('Reservorio');
    const p = H.buildMicPayload([{ data: Object.assign({ formato: FMT, fechaMuestreo: '2026-09-13' }, fila) }]);
    expect(p.rows[0][col('Muestras')]).toBe('Reservorio');
    expect(p.rows[0][col('Tipo de muestra')]).toBe('Agua limpia y mar');
  });

  it('y un valor ESCRITO a mano también viaja', () => {
    pintar();
    celda(1, 'muestras').value = 'Reservorio 3 pared';
    celda(1, 'vamar').value = '5';
    const fila = H.collectMicDraft().sections[FMT].rows[0];
    const p = H.buildMicPayload([{ data: Object.assign({ formato: FMT, fechaMuestreo: '2026-09-13' }, fila) }]);
    expect(p.rows[0][col('Muestras')]).toBe('Reservorio 3 pared');
  });

  it('no añade columnas a la hoja: «Muestras» ya existía y sigue siendo UNA', () => {
    expect(H.MIC_SHEET_HEADERS.filter((h) => h === 'Muestras')).toHaveLength(1);
  });
});

/* 🔎 AUDITORÍA (2026-09-13, después del push): los dos caminos que la tanda no ejercía —
   reabrir la sesión guardada desde el Historial y el PDF— también llevan la columna nueva. */
describe('Bacteriología · Agua de mar y Reservorios · lo guardado se reabre y se imprime entero', () => {
  const guardar = () => {
    pintar();
    /* ⚠ happy-dom no respeta `selected` dentro de un <optgroup>: se fija el formato activo como
       lo vería el navegador. */
    document.getElementById('mic-fmt-sel').value = FMT;
    document.getElementById('mic-resp').value = 'Analista QA';
    celda(1, 'muestras').value = 'Reservorio';
    celda(1, 'vamar').value = '12';
    expect(H.saveMicLocal()).toBeGreaterThan(0);
    return H.micSessionKey(H.loadMic()[0].data);
  };

  it('🔎 editar la sesión guardada devuelve la Muestra a su celda', () => {
    const k = guardar();
    H.micEditSession(k);
    expect(celda(1, 'muestras').value).toBe('Reservorio');
    expect(celda(1, 'vamar').value).toBe('12');
  });

  it('🔎 el PDF del análisis lleva la columna Muestra con su valor', () => {
    guardar();
    let html = '';
    const abrir = window.open;
    window.open = () => ({ document: { write(s) { html += s; }, close() {}, title: '' }, focus() {}, print() {} });
    try { H.downloadMicPDF(); } finally { window.open = abrir; }
    expect(html).toContain('Muestra');
    expect(html).toContain('Reservorio');
  });
});
