// @vitest-environment happy-dom
/* ============================================================
   PRIMERA CARGA · el aviso dice cómo va (punto 7 del usuario, 2026-10-03)

   Medido: la primera vez en un equipo (sin libro guardado) los datos tardan ~27 s en PC —descargar 13 MB (Google no
   manda Content-Length) y 16 s de lectura en el Worker— y el aviso sólo decía «Cargando los datos de producción…».
   Ahora, SÓLO en la primera carga (los refrescos no), el Worker cuenta lo que baja y avisa cuando empieza a leer; el
   aviso de carga y la píldora lo enseñan, y el aviso explica que después abre al instante. Google simulado; datos
   ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { textoProgreso, setLectorLibro, connectSheets } from './sheets.js';
import { atenderLectura } from './sheets.worker.js';
import { leerEnWorker, _reiniciarLector } from './sheets.lector.js';
import { store, on, emit, EV } from './store.js';
import { registerView, setContainer, renderCurrentView } from '../ui/router.js';

const MB = 1048576;

/* ---------- un libro de más de 1 MB (para que haya avisos de descarga), determinista ---------- */
let LIBRO;
function libroGrande() {
  const X = window.XLSX;
  let s = 7;
  const azar = () => { s = (s * 1103515245 + 12345) % 2147483648; return s.toString(36); };
  const filas = [['Fecha', 'Tanque', 'Nota', 'Código']];
  for (let i = 0; i < 40000; i++) filas.push(['01/09/2026', 'T' + (i % 40), azar() + azar(), azar()]);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(filas), 'Larvicultura M01');
  return new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
}

/* ---------- Google simulado: el export llega en trozos de 300 KB por un flujo, como en el navegador ---------- */
let fetchReal;
const respuesta = (bytes) => {
  let i = 0;
  return {
    ok: true, status: 200,
    arrayBuffer: async () => bytes.slice().buffer,
    body: { getReader: () => ({ read: async () => (i >= bytes.length ? { done: true } : { done: false, value: bytes.slice(i, (i += 300 * 1024)) }) }) },
  };
};
beforeAll(() => {
  new Function(readFileSync(join(process.cwd(), 'public/vendor/xlsx.full.min.js'), 'utf8'))();
  LIBRO = libroGrande();
  fetchReal = globalThis.fetch;
  globalThis.fetch = async (url) => (/export\?format=xlsx/.test(String(url)) ? respuesta(LIBRO)
    : { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) });
});
afterAll(() => { globalThis.fetch = fetchReal; setLectorLibro(null); });

describe('el rótulo', () => {
  it('lo descargado, y luego que se está leyendo (con su tamaño)', () => {
    expect(textoProgreso({ fase: 'descarga', bytes: 6.2 * MB })).toBe('Descargando el libro… 6,2 MB');
    expect(textoProgreso({ fase: 'lectura', bytes: 13.1 * MB })).toBe('Leyendo el libro (13,1 MB)…');
  });
});

describe('Worker · avisa de cómo va SÓLO si se le pide', () => {
  const entorno = (avisos) => ({ cargarXLSX: () => {}, obtenerXLSX: () => window.XLSX, avisar: (id, p) => avisos.push([id, p]) });

  it('🔴 con conProgreso: avisos de descarga que crecen y, al final, el de lectura con el total; lo leído es lo MISMO', async () => {
    expect(LIBRO.length).toBeGreaterThan(1.1 * MB);   // si no, no habría avisos de descarga que probar
    const avisos = [];
    const con = await atenderLectura({ id: 3, realId: 'X', previas: {}, conProgreso: true }, entorno(avisos));
    const descarga = avisos.filter(([, p]) => p.fase === 'descarga');
    expect(avisos.every(([id]) => id === 3)).toBe(true);
    expect(descarga.length).toBeGreaterThanOrEqual(2);
    expect(descarga.map(([, p]) => p.bytes)).toEqual([...descarga.map(([, p]) => p.bytes)].sort((a, b) => a - b));
    expect(avisos.at(-1)[1]).toEqual({ fase: 'lectura', bytes: LIBRO.length });
    const sin = [];
    const normal = await atenderLectura({ id: 4, realId: 'X', previas: {} }, entorno(sin));
    expect(sin).toEqual([]);                             // un refresco no avisa
    expect(con.huellas).toEqual(normal.huellas);
    expect(con.ok && normal.ok).toBe(true);
  });
});

describe('Lector · el aviso del Worker no termina la petición', () => {
  let creados;
  class FakeWorker {
    constructor() { this.recibidos = []; creados.push(this); }
    postMessage(m) { this.recibidos.push(m); }
    terminate() {}
    emitir(data) { this.onmessage && this.onmessage({ data }); }
  }
  beforeEach(() => {
    creados = [];
    _reiniciarLector();
    globalThis.Worker = FakeWorker;
    const s = document.createElement('script');
    s.setAttribute('type', 'text/x-prueba');
    s.setAttribute('src', 'https://ejemplo.test/vendor/xlsx.full.min.js');
    document.head.appendChild(s);
  });
  afterEach(() => { delete globalThis.Worker; document.head.innerHTML = ''; });

  it('pide avisos sólo con alAvanzar, se los pasa, y resuelve con la respuesta final', async () => {
    const vistos = [];
    let resuelta = false;
    const p = leerEnWorker({ realId: 'R', alAvanzar: (x) => vistos.push(x) }).then((r) => { resuelta = true; return r; });
    const w = creados[0];
    const { id, conProgreso } = w.recibidos[0];
    expect(conProgreso).toBe(true);
    w.emitir({ vivo: true });
    w.emitir({ id, progreso: { fase: 'descarga', bytes: 1 } });
    w.emitir({ id, progreso: { fase: 'lectura', bytes: 2 } });
    await null;
    expect(resuelta).toBe(false);
    expect(vistos).toEqual([{ fase: 'descarga', bytes: 1 }, { fase: 'lectura', bytes: 2 }]);
    w.emitir({ id, ok: true, orden: [], huellas: {}, cambiadas: {} });
    expect(await p).toMatchObject({ ok: true });
    leerEnWorker({ realId: 'R' });
    expect(w.recibidos[1].conProgreso).toBe(false);
  });
});

describe('connectSheets · la primera carga lo enseña; un ⟳ con datos, no', () => {
  const rotulos = [];
  let lecturas;
  beforeAll(() => {
    on(EV.CONN, (e) => rotulos.push(e));
    setLectorLibro({
      disponible: () => true,
      leer: async ({ alAvanzar }) => {
        lecturas.push(!!alAvanzar);
        if (alAvanzar) { alAvanzar({ fase: 'descarga', bytes: 2 * MB }); alAvanzar({ fase: 'lectura', bytes: 3 * MB }); }
        return { ok: true, orden: ['Larvicultura M01'], huellas: { 'Larvicultura M01': 'h1' },
          cambiadas: { 'Larvicultura M01': [{ _SheetOrigin: 'Larvicultura', Tanque: 'T1', Fecha: '01/09/2026' }] } };
      },
    });
  });
  beforeEach(() => { rotulos.length = 0; lecturas = []; });

  it('🔴 primera carga: «Descargando…» y «Leyendo…» en la conexión; con datos ya cargados, ninguno', async () => {
    store.connected = false;
    expect(await connectSheets()).toBe(true);
    expect(lecturas).toEqual([true]);
    const conectando = rotulos.filter((e) => e.state === 'connecting').map((e) => e.label);
    expect(conectando).toEqual(['Descargando datos…', 'Descargando el libro… 2,0 MB', 'Leyendo el libro (3,0 MB)…']);
    rotulos.length = 0;
    expect(await connectSheets()).toBe(true);           // ⟳ con el libro ya cargado
    expect(lecturas).toEqual([true, false]);
    expect(rotulos.filter((e) => e.state === 'connecting').map((e) => e.label)).toEqual(['Descargando datos…']);
  });

  it('sin Worker (se lee en la página) también lo enseña', async () => {
    setLectorLibro(null);
    try {
      store.connected = false;
      expect(await connectSheets()).toBe(true);
      const conectando = rotulos.filter((e) => e.state === 'connecting').map((e) => e.label);
      expect(conectando.some((l) => l.startsWith('Descargando el libro… '))).toBe(true);
      expect(conectando.at(-1)).toBe(textoProgreso({ fase: 'lectura', bytes: LIBRO.length }));
    } finally {
      setLectorLibro({ disponible: () => true, leer: async () => ({ ok: false, motivo: 'no-arranca' }) });
    }
  });
});

describe('el aviso de carga', () => {
  it('🔴 enseña cómo va y por qué tarda; si falla, el fallo', () => {
    store.connected = false;
    registerView('prueba', { label: 'Prueba', icon: '·', render: () => {} });
    store.currentView = 'prueba';
    const c = document.createElement('div');
    setContainer(c);
    renderCurrentView();
    // el router escucha EV.CONN y pone el aviso al día
    emit(EV.CONN, { state: 'connecting', label: 'Descargando el libro… 6,2 MB' });
    expect(c.querySelector('[data-carga-progreso]').textContent).toBe('Descargando el libro… 6,2 MB');
    expect(c.textContent).toContain('La primera vez en este equipo');
    emit(EV.CONN, { state: 'error', label: 'HTTP 500' });
    expect(c.querySelector('[data-carga-progreso]')).toBeNull();
    expect(c.textContent).toContain('No se pudieron cargar');
  });
});
