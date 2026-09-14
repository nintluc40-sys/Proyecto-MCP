// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · INGRESO · «Repartir» respeta lo tecleado a mano, y «Revertir» (2026-09-13)

   Pedido del usuario: «si son 100 animales para 2 tanques, pongo recalcular y me reparte 50 y
   50; si modifico uno y pongo 43 y aprieto recalcular, en vez de otra vez 50 y 50 debería tomar
   43 y 57. Y una opción de revertir para que ponga todo por igual otra vez».

   Cómo: teclear en la celda de un tanque la marca como FIJADA (se ve: fondo amarillo). «⚖️
   Repartir» deja las fijadas como están y reparte lo que falta, parejo, entre las demás.
   «↺ Revertir» quita las marcas y reparte parejo otra vez. Machos y hembras van por separado.
   Si lo fijado supera el total, no se toca nada y se avisa.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madIngReiniciar', '_madIngRepHTML', 'madIngRepartir', 'madIngRevertir', 'madIngCeldaEditada'];
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
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
});

const q = (s) => document.querySelector('#fp-ingreso ' + s);
const qa = (s) => [...document.querySelectorAll('#fp-ingreso ' + s)];
/* ⚠ happy-dom descarta un <tr> insertado con insertAdjacentHTML sobre un <tbody>; se parsea la
   fila REAL del motor dentro de una tabla y se mueve a su sitio. */
const tanques = (n) => {
  for (let i = 1; i <= n; i++) {
    const t = document.createElement('table');
    t.innerHTML = '<tbody>' + H._madIngRepHTML('Sala 1', i) + '</tbody>';
    q('.mi-reps').appendChild(t.querySelector('tr'));
  }
};
const machos = () => qa('tr.mi-rep .mi-machos').map((e) => e.value);
const hembras = () => qa('tr.mi-rep .mi-hembras').map((e) => e.value);
/* ⚠ happy-dom no ejecuta los manejadores escritos en el atributo `oninput` (en la prueba las
   funciones del monolito no son globales): se llama al MISMO manejador que la celda declara, y
   aparte se comprueba que la celda lo tiene cableado. */
const teclear = (el, v) => { el.value = v; H.madIngCeldaEditada(el); };
const repartir = () => H.madIngRepartir(q('[onclick^="madIngRepartir"]'));
const revertir = () => H.madIngRevertir(q('[onclick^="madIngRevertir"]'));

beforeEach(() => {
  avisos.length = 0;
  H.madIngReiniciar();
  q('.mi-tmachos').value = '100';
  q('.mi-thembras').value = '60';
});

describe('Ingreso · Repartir respeta lo tecleado a mano', () => {
  it('el fixture ejerce algo: sin tocar nada reparte parejo (50 y 50)', () => {
    tanques(2);
    repartir();
    expect(machos()).toEqual(['50', '50']);
    expect(hembras()).toEqual(['30', '30']);
  });

  it('🔴 el ejemplo del usuario: pongo 43 en uno y Repartir da 43 y 57', () => {
    tanques(2);
    repartir();
    teclear(qa('tr.mi-rep .mi-machos')[0], '43');
    repartir();
    expect(machos()).toEqual(['43', '57']);
  });

  it('🔴 las celdas de machos y hembras de cada tanque llaman al manejador que las fija', () => {
    tanques(1);
    expect(q('tr.mi-rep .mi-machos').getAttribute('oninput')).toBe('madIngCeldaEditada(this)');
    expect(q('tr.mi-rep .mi-hembras').getAttribute('oninput')).toBe('madIngCeldaEditada(this)');
  });

  it('🔴 la celda tecleada se marca como fijada, y se VE', () => {
    tanques(2);
    const c = qa('tr.mi-rep .mi-machos')[0];
    teclear(c, '43');
    expect(c.getAttribute('data-fijo')).toBe('1');
    expect(c.style.background).not.toBe('');
    expect(qa('tr.mi-rep .mi-machos')[1].hasAttribute('data-fijo')).toBe(false);
  });

  it('🔴 lo que pone Repartir NO queda fijado (sólo lo que teclea la persona)', () => {
    tanques(2);
    repartir();
    expect(qa('tr.mi-rep [data-fijo]')).toHaveLength(0);
  });

  it('🔴 machos y hembras van por separado', () => {
    tanques(2);
    repartir();
    teclear(qa('tr.mi-rep .mi-machos')[0], '43');
    repartir();
    expect(hembras()).toEqual(['30', '30']);
  });

  it('🔴 con tres tanques el resto se reparte parejo entre los libres', () => {
    tanques(3);
    teclear(qa('tr.mi-rep .mi-machos')[1], '43');
    repartir();
    expect(machos()).toEqual(['29', '43', '28']);
  });

  it('🔴 si lo fijado supera el total, no toca nada y avisa', () => {
    tanques(2);
    repartir();
    teclear(qa('tr.mi-rep .mi-machos')[0], '120');
    repartir();
    expect(machos()).toEqual(['120', '50']);
    expect(avisos.some((a) => a.tipo === 'warn' && /supera/i.test(a.msg))).toBe(true);
  });

  it('vaciar una celda fijada le quita la marca', () => {
    tanques(2);
    const c = qa('tr.mi-rep .mi-machos')[0];
    teclear(c, '43');
    teclear(c, '');
    expect(c.hasAttribute('data-fijo')).toBe(false);
  });
});

describe('Ingreso · Revertir pone todo por igual otra vez', () => {
  it('🔴 hay un botón «Revertir» junto a «Repartir»', () => {
    const b = q('[onclick^="madIngRevertir"]');
    expect(b, 'falta el botón Revertir').toBeTruthy();
    expect(b.textContent).toMatch(/Revertir/);
  });

  it('🔴 quita las marcas y reparte parejo (43/57 → 50/50)', () => {
    tanques(2);
    teclear(qa('tr.mi-rep .mi-machos')[0], '43');
    repartir();
    expect(machos()).toEqual(['43', '57']);
    revertir();
    expect(machos()).toEqual(['50', '50']);
    expect(qa('tr.mi-rep [data-fijo]')).toHaveLength(0);
    expect(qa('tr.mi-rep .mi-machos')[0].style.background).toBe('');
  });

  it('y después de revertir, Repartir vuelve a ser el parejo de siempre', () => {
    tanques(2);
    teclear(qa('tr.mi-rep .mi-machos')[0], '43');
    revertir();
    teclear(q('.mi-tmachos'), '80');
    repartir();
    expect(machos()).toEqual(['40', '40']);
  });
});
