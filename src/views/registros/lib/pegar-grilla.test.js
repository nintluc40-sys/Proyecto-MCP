// @vitest-environment happy-dom
/* ============================================================
   PEGAR EN UNA GRILLA LO QUE NO CABE (punto 10 de la pauta del 2026-11-12)

   Lo que pasaba (medido en el código el 14-11): `madGridPaste` escribía cada celda pegada en su sitio y, si la fila o la columna no
   existía, la SALTABA sin decir nada: 60 filas pegadas en 🌊 Mareas (abre con 30) dejaban fuera 30 sin aviso; igual en Biomol, Salas
   y Tanques. Decisión del usuario: «Mareas crece; todas avisan» — Mareas se agranda sola hasta su máximo (400 filas), guardando antes
   su borrador como su ➕ (si no se puede guardar, no crece: repintar borraría lo tecleado); lo que aun así no cabe, y en las demás
   grillas, no se pega y se dice. Biomol no crece sola: crecer la GUARDA.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madGridPaste', 'renderMarea', 'MAREA_GRID_MAX_ROWS', 'MAREA_GRID_DEFAULT_ROWS', 'MAREA_DRAFT_KEY', '_mareaShownRows',
  'loadMareaDraft', 'renderBiomol', 'BIO_MOD', 'BIO_GRID_DEFAULT_ROWS', '_gasVersionLocal'];
const H = {};
const avisos = [];

const almacen = (() => {
  const m = new Map();
  let bloqueadas = new Set();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (bloqueadas.has(k)) { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, clear: () => { m.clear(); bloqueadas = new Set(); },
    bloquear: (k) => { bloqueadas.add(k); },
    key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
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
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}'
    + '\ntry{ H.setMareaExtra=function(v){ _mareaExtra=v; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
});

beforeEach(() => { almacen.clear(); avisos.length = 0; H.setMareaExtra(0); });

/** El pegado del navegador: texto con tabuladores y saltos de línea, sobre la celda `celda`. */
const pegar = (celda, filas, ficha) => {
  expect(celda, 'no está la celda').toBeTruthy();
  const txt = filas.map((f) => f.join('\t')).join('\n');
  H.madGridPaste({ clipboardData: { getData: () => txt }, target: celda, preventDefault() {} }, ficha);
};
const aviso = (re) => avisos.some((a) => re.test(a));
const FUERA = /Lo pegado no cabía en la grilla/;

describe('🌊 Mareas · crece sola hasta que quepa lo pegado', () => {
  const celda = (fila, k) => document.querySelector(`#fp-marea input[name="mg_${fila}_${k}"]`);
  const abrir = () => { H.setVista(13, 'marea'); document.getElementById('fp-marea').innerHTML = ''; H.renderMarea(); };
  const bloque = (n) => Array.from({ length: n }, (_, i) => ['0' + ((i % 28) + 1) + '/11/2026'.slice(-8), '08:' + String(i % 60).padStart(2, '0')]);

  it('🔴 60 filas en una grilla de 30: crece y entran todas, sin aviso (antes se perdían 30 en silencio)', () => {
    abrir();
    expect(H._mareaShownRows()).toBe(H.MAREA_GRID_DEFAULT_ROWS);
    pegar(celda(1, 'fecha'), bloque(60), 'marea');
    expect(celda(60, 'fecha'), 'la grilla no creció').toBeTruthy();
    expect(celda(60, 'dia').value, 'la 2.ª columna pegada es «Día»').toBe('08:59');
    expect(aviso(FUERA)).toBe(false);
  });

  it('🔴 más del máximo (400): entra hasta 400 y se dice cuántas quedaron fuera', () => {
    abrir();
    pegar(celda(1, 'fecha'), bloque(H.MAREA_GRID_MAX_ROWS + 5), 'marea');
    expect(celda(H.MAREA_GRID_MAX_ROWS, 'fecha')).toBeTruthy();
    expect(celda(H.MAREA_GRID_MAX_ROWS + 1, 'fecha')).toBeFalsy();
    expect(aviso(/5 fila\(s\) NO se pegaron\. Mareas admite como mucho 400 filas/), avisos.join(' | ')).toBe(true);
  });

  it('🔴 si el borrador no se puede guardar, no crece (repintar borraría lo tecleado): pega lo que cabe y lo dice', () => {
    abrir();
    celda(1, 'p2').value = 'tecleado';
    almacen.bloquear(H.MAREA_DRAFT_KEY);
    pegar(celda(1, 'fecha'), bloque(40), 'marea');
    expect(celda(31, 'fecha'), 'creció sin poder guardar').toBeFalsy();
    expect(celda(1, 'p2').value, 'se perdió lo tecleado').toBe('tecleado');
    expect(aviso(/10 fila\(s\) NO se pegaron/), avisos.join(' | ')).toBe(true);
  });

  it('🔴 al crecer, cada fila sigue en SU sitio: lo tecleado en la fila 4 queda junto a la 4.ª línea pegada', () => {
    abrir();
    celda(4, 'p2').value = 'x';   // filas 1–3 vacías: compactar subiría esto a la fila 1
    const b = bloque(40);
    pegar(celda(1, 'fecha'), b, 'marea');
    expect(celda(4, 'fecha').value).toBe(b[3][0]);
    expect(celda(4, 'p2').value, 'lo tecleado cambió de fila').toBe('x');
    expect(celda(1, 'p2').value).toBe('');
  });

  it('🔴 lo tecleado en otras filas sigue tras crecer', () => {
    abrir();
    celda(2, 'p2').value = 'ya estaba';
    pegar(celda(5, 'fecha'), bloque(40), 'marea');
    expect(celda(44, 'fecha')).toBeTruthy();
    expect(celda(2, 'p2').value).toBe('ya estaba');
  });
});

describe('🧬 Biomol (no crece sola) y las columnas de más · se dice lo que no entró', () => {
  const abrir = () => { H.setVista(H.BIO_MOD, 'biomol'); H.renderBiomol(); };
  const c = (fila, k) => document.querySelector(`#fp-biomol input[name="bg_${fila}_${k}"]`);

  it('🔴 25 filas en una grilla de 20: entran 20 y se dice que 5 no (antes, en silencio)', () => {
    abrir();
    pegar(c(1, 'codigo'), Array.from({ length: 25 }, (_, i) => ['BM-' + i]), 'biomol');
    expect(c(20, 'codigo').value).toBe('BM-19');
    expect(c(H.BIO_GRID_DEFAULT_ROWS + 1, 'codigo'), 'Biomol creció sola').toBeFalsy();
    expect(aviso(/5 fila\(s\) NO se pegaron\. Agrega filas/), avisos.join(' | ')).toBe(true);
  });

  it('🔴 sobran columnas a la derecha: se dice', () => {
    abrir();
    const celdas = Array.from(document.querySelectorAll('#fp-biomol [data-r="0"][data-c]'));
    const ultima = celdas.reduce((a, x) => (Number(x.getAttribute('data-c')) > Number(a.getAttribute('data-c')) ? x : a));
    pegar(ultima, [['a', 'b', 'c']], 'biomol');
    expect(aviso(/2 columna\(s\) de la derecha NO se pegaron/), avisos.join(' | ')).toBe(true);
  });

  it('lo que cabe se pega sin aviso de más', () => {
    abrir();
    pegar(c(1, 'codigo'), [['BM-1'], ['BM-2']], 'biomol');
    expect(c(2, 'codigo').value).toBe('BM-2');
    expect(aviso(FUERA)).toBe(false);
  });
});
