// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · la carga del motor y la versión publicada (pauta 5, 2026-10-22, usuario)

   El shell de Registros (`shell.html`) va DENTRO del bundle; el motor (`qrcode.js` y `engine.js`), aparte, y se carga la
   primera vez que se entra en la vista. Una pestaña abierta antes de un despliegue montaba el shell viejo con el motor
   nuevo. Se vigila:
     · con OTRO build publicado, el motor NO se carga y se pide recargar;
     · «Abrir igualmente» repone el shell y carga el motor sin volver a preguntar (decisión del usuario);
     · «Recargar» recarga;
     · con el MISMO build, o sin sellar (dev, pruebas), se carga como siempre.
   Red de mentira (version.json); los <script> del motor se apuntan sin ejecutarse.
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const PROPIA = 'aaaaaaaaaaaa';
const OTRA = 'bbbbbbbbbbbb';

let publicada;   // la huella que contesta version.json
let pedidas;     // las URL pedidas a la red
let motor;       // los src de los <script> del motor que se intentaron cargar
let fetchReal;

const esperar = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
async function montar(huella) {
  document.head.innerHTML = `<meta name="mcp-build" content="${huella}">`;
  const { registrosView } = await import('./index.js');
  const root = document.getElementById('root');
  registrosView(root);
  await esperar();
  return root;
}

beforeEach(() => {
  vi.resetModules();   // `host` y la promesa de carga son del módulo: cada prueba, uno nuevo
  document.body.innerHTML = '<div id="root"></div>';
  publicada = PROPIA;
  pedidas = [];
  motor = [];
  fetchReal = globalThis.fetch;
  globalThis.fetch = async (url) => {
    pedidas.push(String(url));
    if (String(url).includes('version.json')) return { ok: true, json: async () => ({ build: publicada }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const anadir = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation((el) => {
    if (el.tagName === 'SCRIPT') { motor.push(el.getAttribute('src')); return el; }   // no se ejecuta: basta con saber que se pidió
    return anadir(el);
  });
});
afterEach(() => { globalThis.fetch = fetchReal; vi.restoreAllMocks(); });

const versionPedida = () => pedidas.filter((u) => u.includes('version.json')).length;

// Importar la vista (con `resetModules`, una vez por prueba) cuesta segundos: con la máquina cargada, los 5 s de vitest
// darían un rojo falso.
describe('Registros · pauta 5 · el motor no se mezcla con el de otro build', { timeout: 30000 }, () => {
  it('🔴 con OTRO build publicado, el motor NO se carga y se pide recargar', async () => {
    publicada = OTRA;
    const root = await montar(PROPIA);
    expect(versionPedida(), 'control: preguntó por la versión publicada').toBe(1);
    expect(motor, 'cargó el motor de otro build').toEqual([]);
    expect(root.textContent).toContain('Hay una versión nueva de la app');
    expect(root.querySelector('[data-rg-version="recargar"]')).toBeTruthy();
    expect(root.querySelector('#pin'), 'el shell no debe quedar montado sin su motor').toBe(null);
  });

  it('🔴 «Abrir igualmente» repone el shell y carga el motor, sin volver a preguntar', async () => {
    publicada = OTRA;
    const root = await montar(PROPIA);
    root.querySelector('[data-rg-version="abrir"]').click();
    await esperar();
    expect(root.querySelector('#pin'), 'el shell vuelve').toBeTruthy();
    expect(motor[0]).toMatch(/registros\/qrcode\.js$/);
    expect(versionPedida()).toBe(1);
  });

  it('🔴 «Recargar» recarga la página', async () => {
    publicada = OTRA;
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    const root = await montar(PROPIA);
    root.querySelector('[data-rg-version="recargar"]').click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('con el MISMO build, el motor se carga como siempre', async () => {
    const root = await montar(PROPIA);
    expect(versionPedida()).toBe(1);
    expect(motor[0]).toMatch(/registros\/qrcode\.js$/);
    expect(root.querySelector('#pin')).toBeTruthy();
    expect(root.textContent).not.toContain('Hay una versión nueva');
  });

  it('sin sellar (dev, pruebas), ni pregunta: el motor se carga como siempre', async () => {
    publicada = OTRA;
    await montar('sin-sellar');
    expect(versionPedida()).toBe(0);
    expect(motor[0]).toMatch(/registros\/qrcode\.js$/);
  });
});
