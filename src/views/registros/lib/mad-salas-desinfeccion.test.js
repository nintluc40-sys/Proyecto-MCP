// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · SALAS · los estados ligados a la DESINFECCIÓN (pedido del usuario, 2026-09-14)

   · «Desinfección»: la sala no tiene animales.
   · «Desinfección - Producción agrupada»: la sala SÍ tiene animales, en producción, pero en
     pocos tanques (la mitad o menos) y los demás vacíos.

   Son estados de la SALA —la columna «Estado» de «Maduración Sala»—, no del lote. La regla
   vive en el libro (mad-libro.js y su gemelo, atados por la paridad); aquí se prueba la
   grilla: que el desplegable tenga los dos valores, que «🔄 Proponer estado» los ponga pasando
   la lista FÍSICA de tanques de cada sala, que se guarden, y que la nota nombre qué conviene
   revisar.

   🔴🔴 Lo propuesto SE GUARDA en la hoja. Medido el 09-14: el libro sólo conocía la Sala 4, y
   las Salas 1, 2 y 5 estaban en «Producción» con animales de antes del registro. Una sala que
   el libro nunca ha visto se deja como estaba — nunca se propone vaciarla.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadSalas', '_madSalasPintaEstado', '_collectSalasGrid', 'MAD_SALA_OPTS',
  'MAD_EST_DESINF', 'MAD_EST_DESINF_AGRUP', 'MAD_EST_PROD', 'MAD_TANQUES_POR_SALA', 'today'];
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
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

beforeEach(() => {
  localStorage.removeItem('larv4_mad_salas');
  H.renderMadSalas();
});

/* Libro con la forma REAL de madConstruirLibro (objetos planos). AB lleva 40+ días y copuló:
   Producción. Sala 1: animales en los tanques 1 y 2 de 15. Sala 3: el tanque 22 tuvo animales
   y se vació. Salas 2, 4 y 5: el libro no las conoce. */
const tanque = (sala, t, vivos) => ({ sala, tanque: t, machos: vivos, hembras: vivos,
  composicion: [{ lote: 'AB', codigoGenetico: 'CG1', machos: vivos, hembras: vivos }] });
const libro = () => ({
  posiciones: [],
  tanques: { 'Sala 1|1': tanque('Sala 1', 1, 10), 'Sala 1|2': tanque('Sala 1', 2, 10), 'Sala 3|22': tanque('Sala 3', 22, 0) },
  lotes: { AB: { lote: 'AB', ingreso: '2026-01-01', copulaDesde: '2026-01-03', cerrado: null, machos: 20, hembras: 20, ubicaciones: ['Sala 1|1', 'Sala 1|2'] } },
  avisos: [], hasta: '2026-01-03', fallos: [], recortadas: [],
});
const sel = (sala) => document.querySelector(`[name="sg_${H.MAD_SALA_OPTS.indexOf(sala)}_estado"]`);
const nota = () => document.getElementById('sal-estado-nota');

describe('Salas · el desplegable de Estado', () => {
  it('🔴 tiene «Desinfección» y «Desinfección - Producción agrupada»', () => {
    const valores = Array.from(sel('Sala 1').options).map((o) => o.value);
    expect(valores).toContain('Desinfección');
    expect(valores).toContain('Desinfección - Producción agrupada');
    expect(valores).toEqual(expect.arrayContaining(['', 'Cuarentena', 'Producción', 'Mixto']));
  });

  it('🔴 un día ya guardado con el estado nuevo se vuelve a pintar SELECCIONADO', () => {
    localStorage.setItem('larv4_mad_salas', JSON.stringify([
      { data: { fecha: H.today(), sala: 'Sala 2', estado: H.MAD_EST_DESINF_AGRUP }, synced: false },
      { data: { fecha: H.today(), sala: 'Sala 3', estado: H.MAD_EST_DESINF }, synced: false },
    ]));
    H.renderMadSalas();
    // happy-dom no refleja `selected` en `.value` si la opción no es la primera: se lee el atributo.
    expect(sel('Sala 2').querySelector('option[selected]').value).toBe('Desinfección - Producción agrupada');
    expect(sel('Sala 3').querySelector('option[selected]').value).toBe('Desinfección');
  });
});

describe('Salas · «Proponer estado» con la desinfección', () => {
  it('🔴 la sala con animales en 2 de 15 tanques → agrupada; la que se vació → Desinfección', () => {
    H._madSalasPintaEstado(libro());
    expect(sel('Sala 1').value).toBe('Desinfección - Producción agrupada');
    expect(sel('Sala 3').value).toBe('Desinfección');
  });

  it('🔴🔴 una sala que el libro NO conoce se deja como estaba, y la nota lo dice', () => {
    sel('Sala 5').value = 'Producción';                    // lo que el operario ya tenía
    H._madSalasPintaEstado(libro());
    expect(sel('Sala 5').value).toBe('Producción');
    expect(nota().textContent).toMatch(/Sin ingresos registrados[^]*Sala 5/);
  });

  it('🔴 la nota NOMBRA lo que conviene revisar, con la ocupación que la justifica', () => {
    H._madSalasPintaEstado(libro());
    const t = nota().textContent;
    expect(t).toContain('Propuesto');
    expect(t).toMatch(/Desinfección: Sala 3/);
    expect(t).toContain('Sala 1 (2 de 15 tanques con animales)');
  });

  it('🔴 lo propuesto es lo que se GUARDA', () => {
    H._madSalasPintaEstado(libro());
    const filas = H._collectSalasGrid();
    const de = (s) => (filas.find((r) => r.sala === s) || {}).estado;
    expect(de('Sala 1')).toBe('Desinfección - Producción agrupada');
    expect(de('Sala 3')).toBe('Desinfección');
  });

  it('el fixture ejerce algo: con la sala llena (8 de 15) la propuesta es Producción', () => {
    const l = libro();
    for (let t = 3; t <= 8; t++) l.tanques['Sala 1|' + t] = tanque('Sala 1', t, 10);
    H._madSalasPintaEstado(l);
    expect(sel('Sala 1').value).toBe(H.MAD_EST_PROD);
    expect(nota().textContent).not.toContain('Animales agrupados');
  });
});
