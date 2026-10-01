// @vitest-environment happy-dom
/* ============================================================
   CLIENTE DEL WORKER de lectura del libro (sheets.lector.js · P1, 2026-10-01)

   Con un Worker SIMULADO se fija el contrato que decide cuándo se lee en segundo plano:
   · disponible sólo con Worker y con el <script> de SheetJS en la página (da la URL que importa);
   · una petición lleva { id, realId, xlsxUrl, previas } y se resuelve con la respuesta de su id;
   · si el Worker no llega a ARRANCAR (error antes de «vivo») o no puede cargar SheetJS, queda
     ROTO: deja de estar disponible y se lee en el hilo principal;
   · si se CAE después de arrancar o no contesta a tiempo, se tira y la siguiente lectura crea otro.
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lectorDisponible, leerEnWorker, _reiniciarLector } from './sheets.lector.js';
import { XLSX_TIMEOUT_MS } from '../config.js';

let creados = [];
class FakeWorker {
  constructor(url) { this.url = String(url); this.recibidos = []; this.terminado = false; creados.push(this); }
  postMessage(m) { this.recibidos.push(m); }
  terminate() { this.terminado = true; }
  emitir(data) { this.onmessage && this.onmessage({ data }); }
  fallar() { this.onerror && this.onerror({ preventDefault() {} }); }
}

const conScript = () => {
  const s = document.createElement('script');
  s.setAttribute('type', 'text/x-prueba'); // que happy-dom no intente cargarlo
  s.setAttribute('src', 'https://ejemplo.test/app/vendor/xlsx.full.min.js');
  document.head.appendChild(s);
};

beforeEach(() => {
  creados = [];
  _reiniciarLector();
  globalThis.Worker = FakeWorker;
  document.head.innerHTML = '';
  conScript();
});
afterEach(() => { delete globalThis.Worker; vi.useRealTimers(); });

describe('lector del libro · registro en main.js', () => {
  it('main.js registra el lector del Worker ANTES de enganchar la primera descarga', () => {
    // P3: la primera descarga la pide el router (setPedirLibro(asegurarLibro)) al enseñar una vista sin datos.
    const main = readFileSync(join(process.cwd(), 'src/main.js'), 'utf8').replace(/\/\/.*$/gm, '');
    const registro = main.indexOf('setLectorLibro(lectorWorker)');
    expect(registro).toBeGreaterThan(-1);
    expect(main.indexOf('setPedirLibro(asegurarLibro)')).toBeGreaterThan(-1);
    expect(registro).toBeLessThan(main.indexOf('setPedirLibro(asegurarLibro)'));
  });
});

describe('lector del libro · disponibilidad', () => {
  it('sólo con Worker y con el <script> de SheetJS', () => {
    expect(lectorDisponible()).toBe(true);
    document.head.innerHTML = '';
    expect(lectorDisponible()).toBe(false);
    conScript();
    delete globalThis.Worker;
    expect(lectorDisponible()).toBe(false);
  });
});

describe('lector del libro · protocolo', () => {
  it('manda { id, realId, xlsxUrl, previas } y resuelve con la respuesta de SU id', async () => {
    const p = leerEnWorker({ realId: 'R', previas: { A: 'h' } });
    const w = creados[0];
    expect(w.recibidos[0]).toMatchObject({ realId: 'R', previas: { A: 'h' }, xlsxUrl: 'https://ejemplo.test/app/vendor/xlsx.full.min.js' });
    const id = w.recibidos[0].id;
    w.emitir({ vivo: true });
    w.emitir({ id: id + 99, ok: true, orden: ['X'] }); // de otra petición: se ignora
    w.emitir({ id, ok: true, orden: ['A'], huellas: {}, cambiadas: {} });
    expect(await p).toMatchObject({ ok: true, orden: ['A'] });
    // reutiliza el mismo Worker
    leerEnWorker({ realId: 'R' });
    expect(creados.length).toBe(1);
  });

  it('si no llega a ARRANCAR, queda roto: deja de estar disponible', async () => {
    const p = leerEnWorker({ realId: 'R' });
    creados[0].fallar();
    expect(await p).toMatchObject({ ok: false, motivo: 'no-arranca' });
    expect(lectorDisponible()).toBe(false);
    expect(await leerEnWorker({ realId: 'R' })).toMatchObject({ ok: false, motivo: 'no-arranca' });
    expect(creados.length).toBe(1);
  });

  it('si no puede cargar SheetJS, queda roto', async () => {
    const p = leerEnWorker({ realId: 'R' });
    const w = creados[0];
    w.emitir({ vivo: true });
    w.emitir({ id: w.recibidos[0].id, ok: false, motivo: 'sin-xlsx' });
    expect(await p).toMatchObject({ motivo: 'sin-xlsx' });
    expect(lectorDisponible()).toBe(false);
  });

  it('si se CAE después de arrancar: «caido», se tira y la siguiente lectura crea otro', async () => {
    const p = leerEnWorker({ realId: 'R' });
    const w = creados[0];
    w.emitir({ vivo: true });
    w.fallar();
    expect(await p).toMatchObject({ ok: false, motivo: 'caido' });
    expect(w.terminado).toBe(true);
    expect(lectorDisponible()).toBe(true);
    leerEnWorker({ realId: 'R' });
    expect(creados.length).toBe(2);
  });

  it('si no contesta a tiempo: «tiempo», se tira el Worker', async () => {
    vi.useFakeTimers();
    const p = leerEnWorker({ realId: 'R' });
    const w = creados[0];
    w.emitir({ vivo: true });
    await vi.advanceTimersByTimeAsync(XLSX_TIMEOUT_MS * 3);
    expect(w.terminado).toBe(false); // aún dentro del margen (3 intentos)
    await vi.advanceTimersByTimeAsync(30000);
    expect(await p).toMatchObject({ ok: false, motivo: 'tiempo' });
    expect(w.terminado).toBe(true);
    expect(lectorDisponible()).toBe(true);
  });
});
