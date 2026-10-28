/* ============================================================
   MAREAS Y CLIMA · EL BOTÓN ACTIVO SE LEE TAMBIÉN EN EL TEMA OSCURO (2026-10-28)

   `.sv-marea-mbtn.is-on` pinta el texto con el color de marca sobre ese mismo color al 14 %. En el tema
   oscuro la marca no cambia (#006064, `tokens.css` no la redefine), así que salía teal oscuro sobre fondo
   oscuro: 2,06:1 el texto y 2,24:1 el borde, medidos sobre la tarjeta del modal (`--c-surface`). Lo usan
   los meses de 🌊 Mareas, los botones de su Correlación y los meses del modal de 🌦 Clima.

   Estas pruebas leen el CSS (como trasladoKpiContraste.test.js) y exigen:
     1. una regla PROPIA del tema oscuro para el botón activo, con su texto legible sobre su fondo
        (≥ 4,5:1: es texto de 12 px) y un borde que se distinga de la tarjeta (≥ 3:1);
     2. que el tema claro siga con la regla de siempre: el arreglo es un OVERRIDE del oscuro.
   🆕 Y el TÍTULO de los modales (`.sv-modal-title`, todos los `.sv-modal`), con el mismo defecto (2,24:1 en oscuro,
   medido en Mareas y Clima el 2026-10-28): su propia regla oscura, ≥ 4,5:1 sobre la tarjeta (texto de 16 px).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const leer = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const CSS = leer('src/views/supervisor/supervisor.css');
const TOKENS = leer('src/styles/tokens.css');

/** El cuerpo de la primera regla cuyo selector sea EXACTAMENTE `sel`, al principio de una línea. */
const regla = (src, sel) => {
  const re = new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
  const m = re.exec(src);
  return m ? m[1] : null;
};
/** El valor de una propiedad dentro del cuerpo de una regla. */
const valor = (cuerpo, prop) => {
  const m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(cuerpo || '');
  return m ? m[1].trim() : null;
};

/** Contraste WCAG 2.x entre dos colores #rrggbb. */
const luminancia = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const HEX = /^#[0-9a-f]{6}$/i;

const OSCURO = '[data-theme="dark"] .sv-marea-mbtn.is-on';
/** `--c-surface` del tema oscuro: el fondo de la tarjeta del modal (`.sv-modal-card`). */
const superficieOscura = () => {
  const bloque = regla(TOKENS, '[data-theme="dark"]');
  return valor(bloque, '--c-surface');
};

describe('Mareas y Clima · el botón activo se lee en el tema oscuro', () => {
  it('el fixture ejerce algo: la clase sigue en Mareas y en el modal de Clima, y el contraste se calcula bien', () => {
    /* Si mañana estas vistas dejan de usar la clase, la regla sobra y esta prueba avisa antes de que alguien
       la borre «porque no hace nada». */
    expect(leer('src/views/supervisor/mareas.js')).toContain("class=\"sv-marea-mbtn${");
    expect(leer('src/views/clima/clima.js')).toContain("class=\"sv-marea-mbtn${");
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(superficieOscura()).toMatch(HEX);
  });

  it('🔴 en oscuro tiene su PROPIA regla y su texto se lee sobre su fondo (≥ 4,5:1)', () => {
    const r = regla(CSS, OSCURO);
    expect(r, 'falta la regla del botón activo en el tema oscuro').toBeTruthy();
    const texto = valor(r, 'color'), fondo = valor(r, 'background');
    // Colores literales: con var(--c-brand) el tema oscuro volvería a heredar el teal oscuro de la marca.
    expect(texto).toMatch(HEX);
    expect(fondo).toMatch(HEX);
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5);
  });

  it('🔴 y su borde se distingue de la tarjeta del modal (≥ 3:1)', () => {
    const borde = valor(regla(CSS, OSCURO), 'border-color');
    expect(borde).toMatch(HEX);
    expect(contraste(borde, superficieOscura())).toBeGreaterThanOrEqual(3);
  });

  it('🔴 el TÍTULO de los modales también tiene su regla oscura y se lee sobre la tarjeta (≥ 4,5:1)', () => {
    const texto = valor(regla(CSS, '[data-theme="dark"] .sv-modal-title'), 'color');
    expect(texto, 'falta la regla del título en el tema oscuro').toMatch(HEX);
    expect(contraste(texto, superficieOscura())).toBeGreaterThanOrEqual(4.5);
    expect(valor(regla(CSS, '.sv-modal-title'), 'color'), 'el claro, el de siempre').toBe('var(--c-brand)');
  });

  it('el tema claro no cambia: la regla de siempre, con el color de marca', () => {
    const r = regla(CSS, '.sv-marea-mbtn.is-on');
    expect(valor(r, 'color')).toBe('var(--c-brand)');
    expect(valor(r, 'border-color')).toBe('var(--c-brand)');
  });
});
