// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · SALAS · «🔄 Proponer estado» usa la FECHA DE LA FICHA — D4, 2026-09-14

   El botón lee las hojas y propone el estado de cada sala para la fecha elegida arriba (por
   defecto, hoy); lo propuesto se GUARDA en la hoja. Pero el libro se construía con todos los
   eventos, así que qué lotes había en la sala y cuántos tanques estaban ocupados eran los de
   HOY aunque la fecha fuera otra: con una fecha pasada podía proponer «Desinfección» para un
   día en que la sala estaba llena, y dejarlo escrito.
   Decisión del usuario: la fecha actual o la de la ficha → el libro se corta en la fecha de la
   ficha (`madLibroAlDia`), que hoy es lo mismo que la fecha actual.

   Se ejercita el BOTÓN de verdad, con la lectura de las hojas simulada en `fetch`: así se
   prueba también que el botón usa el libro al día, y no sólo que la pieza exista.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadSalas', 'madSalasProponerEstado', '_collectSalasGrid', 'MAD_SALA_OPTS', 'MAD_LIBRO_SHEETS'];
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

/* ── Las hojas, servidas por un fetch falso con la forma de `?p=rows` ── */
let HOJAS = {};
let RECORTADAS = new Set();
beforeEach(() => {
  HOJAS = {};
  RECORTADAS = new Set();
  globalThis.fetch = async (url) => {
    const hoja = new URL(String(url)).searchParams.get('sheet');
    const cuerpo = { ok: true, headers: [], rows: HOJAS[hoja] || [] };
    if (RECORTADAS.has(hoja)) { cuerpo.truncated = true; cuerpo.limit = 20000; }
    return { ok: true, status: 200, text: async () => JSON.stringify(cuerpo) };
  };
  localStorage.removeItem('larv4_mad_salas');
});

/* Un lote entra el 1 en la Sala 1 (tanque 1) y el 5 se mueve ENTERO a la Sala 2 (tanque 16). */
const escenario = () => {
  HOJAS[H.MAD_LIBRO_SHEETS.ingreso] = [
    { Fecha: '2026-09-01', Lote: 'BP', 'Código genético': 'OLF5.F2', Sala: 'Sala 1', Tanque: 1, Machos: 10, Hembras: 12 },
  ];
  HOJAS[H.MAD_LIBRO_SHEETS.movimientos] = [
    { Fecha: '2026-09-05', Tipo: 'Transferencia', 'Sala origen': 'Sala 1', 'Tanque origen': 1,
      'Sala destino': 'Sala 2', 'Tanque destino': 16, Machos: 10, Hembras: 12 },
  ];
};
const proponerAl = async (fecha) => {
  H.renderMadSalas();
  document.getElementById('mad-salas-fecha').value = fecha;
  H.renderMadSalas();                                     // la grilla pasa a ser la de esa fecha
  await H.madSalasProponerEstado();
};
const sel = (sala) => document.querySelector(`[name="sg_${H.MAD_SALA_OPTS.indexOf(sala)}_estado"]`);
const nota = () => document.getElementById('sal-estado-nota').textContent;

describe('Salas · «Proponer estado» es el de la fecha de la ficha', () => {
  it('el fixture ejerce algo: DESPUÉS del movimiento, la Sala 1 se vació y la Sala 2 tiene el lote', async () => {
    escenario();
    await proponerAl('2026-09-06');
    expect(sel('Sala 1').value).toBe('Desinfección');
    expect(sel('Sala 2').value).toBe('Cuarentena');
  });

  it('🔴 ANTES del movimiento, la propuesta es la de ESE día: la Sala 1 con su lote y la Sala 2 sin conocer', async () => {
    escenario();
    await proponerAl('2026-09-03');
    expect(sel('Sala 1').value).toBe('Cuarentena');
    expect(sel('Sala 2').value).toBe('');                  // el libro aún no la conoce: se deja como estaba
    expect(nota()).toContain('Propuesto al 2026-09-03');
  });

  it('🔴 lo que se GUARDA para esa fecha es lo propuesto para esa fecha', async () => {
    escenario();
    await proponerAl('2026-09-03');
    const filas = H._collectSalasGrid();
    const de = (s) => filas.find((r) => r.sala === s) || {};
    expect(de('Sala 1').fecha).toBe('2026-09-03');
    expect(de('Sala 1').estado).toBe('Cuarentena');
    expect(de('Sala 2').estado || '').toBe('');
  });

  it('🔴 una hoja RECORTADA sigue callando la propuesta también al cortar por fecha', async () => {
    /* El libro al día se construye aparte: si perdiera el veredicto del libro leído, propondría
       sobre media hoja. */
    escenario();
    RECORTADAS.add(H.MAD_LIBRO_SHEETS.movimientos);
    await proponerAl('2026-09-03');
    expect(sel('Sala 1').value).toBe('');
    expect(nota()).toContain('RECORTADAS');
  });
});
