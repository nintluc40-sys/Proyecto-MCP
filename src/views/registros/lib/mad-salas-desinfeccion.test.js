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
  'MAD_EST_DESINF', 'MAD_EST_DESINF_AGRUP', 'MAD_EST_PROD', 'MAD_TANQUES_POR_SALA', 'MAD_RAS_OPTS', 'today'];
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


/* ── 2026-09-15 (usuario) · EL RAS DE UNA SALA SE MARCA EN PORCENTAJE, NO EN SÍ/NO ──────────
   «La idea es que el usuario marque si dicha sala tiene RAS y en qué porcentaje. El sistema
   identifica: si tiene RAS se marcará el porcentaje, y ya sabe que lo demás es agua de playa.
   Y en caso no se use RAS se marcará con No.»
   Por eso el complemento NO se anota: es 100 − el porcentaje, y tenerlo en dos sitios es tener
   dos sitios donde equivocarse.

   🔑 LO QUE DE VERDAD HAY QUE PROBAR es la LECTURA de lo viejo. La hoja guarda texto y conserva
   filas con «SI» y «NO»; si el desplegable no las reconociera, abrir un día viejo y volver a
   guardar borraría ese dato sin un solo error — la forma más cara de perderlo. */
describe('Salas · el RAS se marca en porcentaje', () => {
  const selRas = (sala) => document.querySelector(`[name="sg_${H.MAD_SALA_OPTS.indexOf(sala)}_ras"]`);
  /* ⚠ LO ELEGIDO SE COMPRUEBA EN EL ATRIBUTO, no en `select.value`: happy-dom NO honra
     `selected` al parsear HTML (medido — con la tercera opción marcada devuelve la segunda).
     Un navegador sí lo honra. Mirar `value` aquí daría un verde de casualidad justo para la
     opción que ocupa ese sitio, que es exactamente lo que pasaba con «SI». */
  const marcada = (sala) => Array.from(selRas(sala).options).filter((o) => o.hasAttribute('selected')).map((o) => o.value);
  const guardado = (sala, ras) => {
    localStorage.setItem('larv4_mad_salas', JSON.stringify([
      { id: 'x', synced: false, data: { fecha: H.today(), sala, estado: '', estado_lote: '', ras } },
    ]));
    H.renderMadSalas();
  };

  it('🔴 el desplegable ofrece «No» y los porcentajes que pidió el usuario', () => {
    const valores = Array.from(selRas('Sala 1').options).map((o) => o.value);
    expect(valores).toEqual(['', 'No', '10%', '15%', '20%', '25%', '30%', '40%', '50%', '60%', '70%', '100%']);
    expect(H.MAD_RAS_OPTS[0], 'sin RAS se marca «No», no «NO» ni «0%»').toBe('No');
  });

  it('el catálogo NO trae el complemento: el agua de playa se deduce', () => {
    // Anotar «70% playa» junto a «30% RAS» sería un segundo sitio donde equivocarse.
    expect(H.MAD_RAS_OPTS.join(' ')).not.toMatch(/playa/i);
    expect(H.MAD_RAS_OPTS).toHaveLength(11);   // 2026-09-17: entra el 70%
  });

  it('un porcentaje guardado vuelve elegido', () => {
    guardado('Sala 2', '25%');
    expect(marcada('Sala 2')).toEqual(['25%']);
  });

  it('🔴 un valor VIEJO de la hoja («SI») se conserva en vez de borrarse al reabrir', () => {
    guardado('Sala 3', 'SI');
    expect(marcada('Sala 3'), 'el desplegable se comió un dato de la hoja').toEqual(['SI']);
    const valores = Array.from(selRas('Sala 3').options).map((o) => o.value);
    expect(valores[1], 'el valor ajeno va delante del catálogo').toBe('SI');
    // Y sólo en la fila que lo trae: las demás salas siguen con el catálogo limpio.
    expect(Array.from(selRas('Sala 1').options).map((o) => o.value)).not.toContain('SI');
  });

  it('sin nada guardado, la celda queda en «—» y no inventa un porcentaje', () => {
    expect(marcada('Sala 1'), 'marcó algo sin que nadie lo eligiera').toEqual([]);
  });

  it('lo elegido llega al payload tal cual, sin traducir', () => {
    // Aquí se elige como lo haría el usuario —tocando el desplegable— y no reparseando HTML.
    selRas('Sala 4').value = '60%';
    expect(H._collectSalasGrid().find((r) => r.sala === 'Sala 4').ras).toBe('60%');
  });
});
