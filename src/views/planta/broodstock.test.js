// @vitest-environment happy-dom
/* ============================================================
   PLANTA · el modo «🦐 Broodstock» (broodstock.js, M3, 2026-10-27): el mapa 2D de las piscinas y su ficha.
   Lo que se exige: cada piscina del corte cae en SU zona del plano (con el nombre como lo guarda la carga) y lo que no
   se ubica se dice; la vista general enseña las tres zonas y tocar una se acerca a sus piscinas, con «← Todas las
   zonas» para volver; cada piscina se pinta por su fase (gris sin datos, discontinua sin nombre); su ficha trae lo de
   la hoja, su desempeño como origen y su curva; lo que viene de los datos se escapa. Y, de punta a punta, con el
   modelo REAL de Maduración sobre filas ficticias: que el mapa lee lo que da `tablaDePiscinas` / `fichaDePiscina`.
   Datos FICTICIOS; los nombres de piscina salen del propio plano (piscinas.js), no se escriben aquí.
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import { montarBroodstock, datosDelMapa, claseDeFase } from './broodstock.js';
import { ZONAS, CAJA_GENERAL } from './piscinas.js';
import { store } from '../../core/store.js';
import { MAD_OP_ORIGEN } from '../maduracion/operativo.fuentes.js';

const Z = Object.fromEntries(ZONAS.map((z) => [z.id, z]));
const nombres = (z) => Z[z].piscinas.filter((p) => p.nombre).map((p) => p.nombre);
const [SR1, SR2] = nombres('san-rafael');
const [RO1] = nombres('roche');
const FUERA = 'PZ-FICTICIA';   // una piscina que no está en el plano
const fila = (piscina, extra = {}) => ({ piscina, corte: '2026-10-04', fase: 'Engorde', faseEnCatalogo: true, peso: 12.5, ...extra });
const T = {
  corte: '2026-10-04',
  piscinas: [
    fila(' ' + SR1 + ' ', { fase: 'Pre-reproductor', peso: 31.25, codigo: 'CX', camaronera: 'Río Ficticio', observacion: '<b>ojo</b>', sobrevivencia: 88,
      lotes: ['QA'], desempeno: { ingresados: 100, vivos: 90, supervivencia: 90, desoves: 3, fertilidad: 70, naupliosPorHembra: 50000, compartido: false } }),
    fila(RO1, { fase: 'Precría', peso: 2 }),
    fila(FUERA),
  ],
  ausentes: [SR2],
};
const FICHA = { serie: [{ corte: '2026-09-27', peso: 28 }, { corte: '2026-10-04', peso: 31.25 }], observaciones: [{ corte: '2026-10-04', texto: '<i>x</i>' }], lotes: [] };

let caja, vista;
const $ = (s) => caja.querySelector(s);
const piscina = (id) => caja.querySelector('[data-piscina="' + id + '"]');
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
beforeEach(() => {
  document.body.innerHTML = '<div id="c"></div>';
  caja = document.getElementById('c');
  vista = montarBroodstock(caja, { calcular: () => ({ T, ficha: (n) => (n === SR1 ? FICHA : null) }) });
});

describe('🦐 Broodstock · lo que pinta el mapa (datosDelMapa)', () => {
  it('🔴 cada piscina del corte en SU zona (el nombre, sin espacios); lo que no está en el plano, «fuera»; los ausentes, aparte', () => {
    const D = datosDelMapa(T);
    const enZona = (z, n) => D.zonas.find((x) => x.id === z).piscinas.find((p) => p.nombre === n);
    expect(enZona('san-rafael', SR1).dato.peso).toBe(31.25);
    expect(enZona('roche', RO1).dato.fase).toBe('Precría');
    expect(enZona('san-rafael', SR2).dato, 'la ausente no tiene dato en este corte').toBeNull();
    expect(D.zonas.find((x) => x.id === 'san-rafael').conDatos).toBe(1);
    expect(D.zonas.find((x) => x.id === 'niagara').conDatos).toBe(0);
    expect(D.fuera).toEqual([FUERA]);
    expect(D.ausentes).toEqual([SR2]);
    expect(D.corte).toBe('2026-10-04');
  });
  it('las fases del catálogo, cada una con su clase; lo demás, «otra»', () => {
    expect(['Precría', 'Engorde', 'Pre-reproductor', 'Maternidad', ''].map(claseDeFase)).toEqual(['precria', 'engorde', 'prerrep', 'otra', 'otra']);
  });
});

describe('🦐 Broodstock · el mapa y la ficha (montarBroodstock)', () => {
  it('🔴 sin datos dice que carga; con datos, la vista general con las tres zonas, sus recuentos y el último corte', () => {
    vista.pintarEstado(null);
    expect($('[data-r="sub"]').textContent).toBe('Cargando datos de Broodstock…');
    vista.pintarEstado({});
    expect($('[data-r="sub"]').textContent).toBe('Último corte: 04/10/2026');
    expect($('svg').getAttribute('viewBox')).toBe(`${CAJA_GENERAL[0]} ${CAJA_GENERAL[1]} ${CAJA_GENERAL[2] - CAJA_GENERAL[0]} ${CAJA_GENERAL[3] - CAJA_GENERAL[1]}`);
    expect($('svg').classList.contains('general')).toBe(true);
    const zonas = [...caja.querySelectorAll('[data-zona]')].map((z) => z.getAttribute('aria-label'));
    expect(zonas).toEqual(['San Rafael · 12 piscinas · 1 con datos', 'Roche · 13 piscinas · 1 con datos', 'Niágara · otro sector · 5 piscinas · 0 con datos']);
    expect($('[data-r="nav"]').hidden).toBe(true);
    expect($('[data-r="aparte"]').textContent).toContain(FUERA);
    expect($('[data-r="aparte"]').textContent).toContain(SR2);
  });

  it('🔴 cada piscina, por su fase: gris sin datos, discontinua sin nombre; su número y su peso', () => {
    vista.pintarEstado({});
    expect(piscina(SR1).classList.contains('bs-c-prerrep')).toBe(true);
    expect(piscina(RO1).classList.contains('bs-c-precria')).toBe(true);
    expect(piscina(SR2).classList.contains('bs-c-sin')).toBe(true);
    expect(piscina('niagara-sn-1').classList.contains('bs-c-sn')).toBe(true);
    expect(piscina(SR1).querySelector('.bs-num').textContent).toBe(SR1);
    expect(piscina(SR1).querySelector('.bs-peso').textContent).toMatch(/^31,3 g$|^31\.3 g$/);
    expect(piscina('niagara-sn-1').querySelector('.bs-num').textContent).toBe('s/n');
  });

  it('🔴 tocar una zona se acerca a ella; tocar una piscina abre su ficha; «← Todas las zonas» vuelve', () => {
    vista.pintarEstado({});
    click(piscina(SR1));   // en la vista general, una piscina lleva a su ZONA, no a su ficha
    expect($('svg').classList.contains('general')).toBe(false);
    const c = Z['san-rafael'].caja;
    expect($('svg').getAttribute('viewBox')).toBe(`${c[0]} ${c[1]} ${c[2] - c[0]} ${c[3] - c[1]}`);
    expect($('[data-r="nav"]').hidden).toBe(false);
    expect($('[data-r="zona"]').textContent).toBe('San Rafael');
    // 🛰 2026-10-28: las vecinas se ven (atenuadas, como en un mapa) pero no se tocan ni se leen
    expect(caja.querySelector('[data-zona="san-rafael"]').classList.contains('elegida')).toBe(true);
    expect([...caja.querySelectorAll('.bs-zona.ajena')].map((z) => z.dataset.zona)).toEqual(['roche', 'niagara']);
    expect([...caja.querySelectorAll('.bs-zona.ajena')].every((z) => z.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(caja.querySelectorAll('[data-zona][role="button"]'), 'al acercarse, las zonas ya no son botones').toHaveLength(0);
    expect([...caja.querySelectorAll('[data-piscina][role="button"]')].every((p) => p.closest('[data-zona]').dataset.zona === 'san-rafael'), 'los botones: sólo las piscinas de la elegida').toBe(true);
    expect($('[data-r="ficha"]').textContent).toContain('Toca una piscina');
    click(piscina(SR1));
    const f = $('[data-r="ficha"]');
    expect(f.querySelector('h3').textContent).toBe('Piscina ' + SR1 + ' · San Rafael');
    expect(f.textContent).toContain('Pre-reproductor');
    expect(f.textContent).toContain('CX');
    expect(f.textContent).toContain('Río Ficticio');
    expect(f.textContent).toContain('Como origen de lotes de Maduración');
    expect(f.querySelector('.bs-curva polyline'), 'dos cortes: hay curva').not.toBeNull();
    expect(piscina(SR1).classList.contains('on')).toBe(true);
    // lo que viene de los datos, escapado
    expect(f.innerHTML).toContain('&lt;b&gt;ojo&lt;/b&gt;');
    expect([...f.querySelectorAll('b')].some((b) => b.textContent === 'ojo'), 'la observación no se interpreta como HTML').toBe(false);
    expect([...f.querySelectorAll('i')].some((i) => i.textContent === 'x'), 'tampoco la de la ficha').toBe(false);
    click(piscina(SR2));
    expect($('[data-r="ficha"]').textContent).toContain('No vino en el último corte (04/10/2026)');
    click($('[data-accion="general"]'));
    expect($('svg').classList.contains('general')).toBe(true);
    expect($('[data-r="nav"]').hidden).toBe(true);
  });

  it('una piscina sin nombre lo dice; la zona aparte, también; el mes elegido en los otros modos sale en el subtítulo', () => {
    vista.pintarEstado({ mes: { mes: 'Septiembre', cierre: '2026-09-30' } });
    click(caja.querySelector('[data-zona="niagara"]'));
    expect($('[data-r="zona"]').textContent).toBe('Niágara · otro sector');
    click(piscina('niagara-sn-2'));
    expect($('[data-r="ficha"]').textContent).toContain('aún no tiene número');
    expect($('[data-r="sub"]').textContent).toContain('foto al cierre de Septiembre');
  });

  it('con el teclado: Intro sobre una zona y sobre una piscina hace lo mismo que tocarlas', () => {
    vista.pintarEstado({});
    caja.querySelector('[data-zona="roche"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect($('[data-r="zona"]').textContent).toBe('Roche');
    piscina(RO1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect($('[data-r="ficha"]').querySelector('h3').textContent).toBe('Piscina ' + RO1 + ' · Roche');
  });
});

describe('🦐 Broodstock · de punta a punta con el modelo REAL de Maduración (filas ficticias)', () => {
  it('🔴 el mapa lee lo que dan tablaDePiscinas y fichaDePiscina: el último corte, su fase y peso, la curva y lo de fuera', () => {
    const BS = (corte, p, extra) => ({ _SheetOrigin: MAD_OP_ORIGEN, 'Pl/g': '', 'Fecha de corte': corte, Piscina: p, ...extra });
    store.globalData = [
      BS('2026-09-20', SR1, { 'Fase actual': 'ENGORDE', 'Peso actual (g)': 20, 'Código genético': 'CX', Camaronera: 'Río Ficticio' }),
      BS('2026-09-20', SR2, { 'Fase actual': 'Engorde', 'Peso actual (g)': 9 }),
      BS('2026-09-27', +SR1, { 'Fase actual': 'PRE-REPRODUCTOR', 'Peso actual (g)': 24, 'Código genético': 'CX', Camaronera: 'Río Ficticio' }),
      BS('2026-09-27', FUERA, { 'Fase actual': 'Precría', 'Peso actual (g)': 1 }),
    ];
    document.body.innerHTML = '<div id="c"></div>';
    caja = document.getElementById('c');
    const v = montarBroodstock(caja);   // con el cálculo de verdad
    expect(v.pintarEstado({})).toEqual([]);
    expect($('[data-r="sub"]').textContent).toBe('Último corte: 27/09/2026');
    expect(piscina(SR1).classList.contains('bs-c-prerrep'), 'la fase, canónica').toBe(true);
    expect(piscina(SR2).classList.contains('bs-c-sin'), 'no vino en el último corte').toBe(true);
    expect($('[data-r="aparte"]').textContent).toContain(FUERA);
    expect($('[data-r="aparte"]').textContent).toContain(SR2);
    click(piscina(SR1)); click(piscina(SR1));
    const f = $('[data-r="ficha"]');
    expect(f.textContent).toContain('24 g');
    expect(f.querySelectorAll('.bs-curva circle')).toHaveLength(2);
    store.globalData = [];
  });
});

describe('🦐 Broodstock · 🛰 el aspecto de satélite y el teclado (2026-10-28)', () => {
  it('🔴 la forma de la captura: cada piscina es su polígono; el entorno y el recuadro de Niágara están; nada de imágenes', () => {
    vista.pintarEstado({});
    const pol = piscina(SR1).querySelector('polygon.bs-agua');
    const p = Z['san-rafael'].piscinas.find((x) => x.nombre === SR1);
    expect(pol.getAttribute('points')).toBe(p.poly.map((v) => v[0] + ',' + v[1]).join(' '));
    expect(caja.querySelectorAll('.bs-bordos polygon')).toHaveLength(ZONAS.reduce((n, z) => n + z.piscinas.length, 0));
    expect(caja.querySelectorAll('.bs-aguas polygon').length).toBeGreaterThan(3);
    expect(caja.querySelectorAll('.bs-caminos polyline').length).toBeGreaterThan(3);
    expect(caja.querySelector('.bs-recuadro')).not.toBeNull();
    expect(caja.querySelector('svg image, svg [href*="google"]'), 'ni una imagen: todo dibujado').toBeNull();
    ['bs-terreno', 'bs-agua', 'bs-hundido', 'bs-relieve', 'bs-monte'].forEach((f) => expect(caja.querySelector('filter#' + f), f).not.toBeNull());
  });

  it('🔴 en la vista general el botón es la ZONA y ninguna piscina es foco (no hay botones dentro de botones)', () => {
    vista.pintarEstado({});
    expect(caja.querySelectorAll('[data-zona][role="button"][tabindex="0"]')).toHaveLength(3);
    expect(caja.querySelectorAll('[data-piscina][role], [data-piscina][tabindex]')).toHaveLength(0);
  });

  it('🔴 el foco no se pierde: Intro en una zona lo lleva a su primera piscina; elegir una piscina no rehace el mapa; volver, a la zona', () => {
    vista.pintarEstado({});
    const roche = caja.querySelector('[data-zona="roche"]');
    roche.focus();
    roche.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const primera = caja.querySelector('[data-zona="roche"] [data-piscina]');
    expect(document.activeElement).toBe(primera);
    const antes = piscina(RO1);
    antes.focus();
    antes.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(piscina(RO1), 'el mismo nodo: el SVG no se reconstruyó').toBe(antes);
    expect(document.activeElement).toBe(antes);
    expect(antes.getAttribute('aria-pressed')).toBe('true');
    click($('[data-accion="general"]'));
    expect(document.activeElement).toBe(caja.querySelector('[data-zona="roche"]'));
  });

  it('al acercarse, tocar una piscina de una zona VECINA no hace nada', () => {
    vista.pintarEstado({});
    click(caja.querySelector('[data-zona="roche"]'));
    click(piscina(SR1));
    expect($('[data-r="zona"]').textContent).toBe('Roche');
    expect($('[data-r="ficha"]').textContent).toContain('Toca una piscina');
  });

  it('las de la columna de Roche (anchas y bajas) llevan número y peso en UNA línea; la 739 (larga), en dos', () => {
    vista.pintarEstado({});
    click(caja.querySelector('[data-zona="roche"]'));
    const peso = piscina(RO1).querySelector('.bs-peso');
    expect(peso.tagName.toLowerCase()).toBe('tspan');
    expect(peso.parentNode.querySelector('.bs-num').textContent).toBe(RO1);
    expect(piscina(RO1).querySelectorAll('text')).toHaveLength(1);
  });

  it('la piscina sin datos se ve SECA y la leyenda lo dice', () => {
    vista.pintarEstado({});
    expect(piscina(SR2).classList.contains('bs-c-sin')).toBe(true);
    expect($('.bs-leyenda').textContent).toContain('(seca)');
  });
});

/* 2026-10-30 (auditoría de la ronda 12; usuario: «Sí, contorno doble») · sobre una piscina SECA el borde blanco del foco y el
   amarillo de la elegida apenas se distinguían. happy-dom no pinta estilos: se exige la REGLA. Medido en Chrome sobre la
   772 (seca), el mayor contraste al cruzar su borde: con el foco, de 1,7:1 a 5,8:1; elegida, de 1,6:1 a 4,6:1. */
describe('🦐 el foco y la elegida se ven también sobre una piscina SECA', () => {
  it('🔴 un halo OSCURO en el GRUPO de la piscina con foco, elegida o bajo el ratón; la seca conserva su textura', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/planta/broodstock.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const reglas = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, cuerpo]) => ({ sel: sel.split(',').map((s) => s.trim()), cuerpo }));
    const de = (sel) => reglas.filter((r) => r.sel.includes(sel)).map((r) => r.cuerpo).join(';');
    for (const sel of ['.bs-pisc:focus-visible', '.bs-pisc.on', '.bs-svg:not(.general) .bs-zona.elegida .bs-pisc:hover']) {
      expect(de(sel), sel + ': el halo oscuro, en el grupo').toMatch(/filter:\s*drop-shadow\([^)]*#05090c\)/);
    }
    // en el polígono no: pisaría el filtro de la seca y se llevaría su textura
    reglas.filter((r) => r.sel.some((s) => /\.bs-pisc(:focus-visible|\.on|:hover) \.bs-agua$/.test(s)))
      .forEach((r) => expect(r.cuerpo, r.sel.join(', ')).not.toMatch(/filter/));
    expect(de('.bs-c-sin .bs-agua'), 'la seca, con su textura').toMatch(/filter:\s*url\(#bs-terreno\)/);
  });
});
