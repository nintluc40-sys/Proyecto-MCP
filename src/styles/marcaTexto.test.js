/* ============================================================
   LA MARCA COMO TEXTO SE LEE EN EL TEMA OSCURO (2026-10-30)

   `tokens.css` no redefine `--c-brand` en el tema oscuro: el #006064 de los títulos, cifras y enlaces salía a 2,52:1
   sobre el fondo oscuro (2,24 y 2,00 sobre las superficies; el -700 a 1,5–1,9 y el -600 a 3,2–4,1). No se aclara la
   marca entera porque también es el FONDO de botones, pestañas y píldoras con texto blanco encima (blanco sobre un teal
   claro: ~1,8:1). Decisión del usuario: «Sólo el texto de marca» → `--c-brand-txt` (y `-600-txt`, `-700-txt`): en claro,
   la misma marca; en oscuro, «#7fe3d4» (el menta del título de los modales).

   Estas pruebas leen el CSS (como mareaMesContraste.test.js) y exigen:
     1. que en claro el token de texto SEA la marca de siempre (el tema claro no cambia);
     2. que en oscuro se lea sobre el fondo y las dos superficies (≥ 4,5:1: hay texto de 9,5 px);
     3. que ningún texto de `src/` vuelva a pintarse con la marca directa, salvo las excepciones de abajo.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');
const TOKENS = leer('src/styles/tokens.css');

/** El cuerpo de la primera regla cuyo selector sea EXACTAMENTE `sel`, al principio de una línea. */
const regla = (src, sel) => {
  const re = new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
  const m = re.exec(src);
  return m ? m[1] : null;
};
/** El valor de una propiedad dentro del cuerpo de una regla. */
const valor = (cuerpo, prop) => {
  const m = new RegExp('(?:^|;|\\n)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(cuerpo || '');
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
const CLARO = regla(TOKENS, ':root');
const OSCURO = regla(TOKENS, '[data-theme="dark"]');
const TOKENS_TXT = [['--c-brand-txt', 'var(--c-brand)'], ['--c-brand-600-txt', 'var(--c-brand-600)'], ['--c-brand-700-txt', 'var(--c-brand-700)']];

/** Los .css y .js de `src/` (sin las pruebas). */
const archivos = [];
(function rec(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) rec(p);
    else if (/\.(css|js)$/.test(n) && !/\.test\.js$/.test(n)) archivos.push(p);
  }
})(join(RAIZ, 'src'));

/* Las únicas reglas que pintan TEXTO con la marca directa, y por qué:
   · `.entry-role:hover` — su fondo es blanco FIJO (#fff) también en oscuro: ahí la marca oscura es la que se lee;
   · `.sv-modal-title` y `.sv-marea-mbtn.is-on` — tienen su PROPIA regla oscura con colores literales
     (mareaMesContraste.test.js, que además exige que su regla clara siga con `var(--c-brand)`). */
const EXCEPCIONES = ['src/styles/app.css|.entry-role:hover', 'src/views/supervisor/supervisor.css|.sv-modal-title',
  'src/views/supervisor/supervisor.css|.sv-marea-mbtn.is-on'];
const MARCA_DIRECTA = /var\(--c-brand(?:-600|-700)?(?![\w-])/;

/** Cada `color:` de `src/` cuyo valor use la marca directa: [{ archivo, selector, valor }]. */
const textosConMarcaDirecta = () => {
  const out = [];
  for (const p of archivos) {
    const s = readFileSync(p, 'utf8');
    const rel = relative(RAIZ, p).replace(/\\/g, '/');
    const re = /(^|[^a-z-])color\s*:\s*([^;}"'`]+)/g;
    let m;
    while ((m = re.exec(s))) {
      if (!MARCA_DIRECTA.test(m[2])) continue;
      const a = s.lastIndexOf('{', m.index);
      const selector = rel.endsWith('.css') ? s.slice(s.lastIndexOf('}', a) + 1, a).replace(/\/\*[\s\S]*?\*\//g, '').trim() : '(js)';
      out.push({ archivo: rel, selector, valor: m[2].trim() });
    }
  }
  return out;
};

describe('la marca como texto se lee en el tema oscuro', () => {
  it('el fixture ejerce algo: el token se usa en muchos sitios, las excepciones existen y el contraste se calcula bien', () => {
    const usos = archivos.reduce((n, p) => n + (readFileSync(p, 'utf8').match(/var\(--c-brand(?:-600|-700)?-txt\b/g) || []).length, 0);
    expect(usos).toBeGreaterThanOrEqual(60);
    expect(valor(regla(leer('src/styles/app.css'), '.entry-role:hover'), 'background'), 'su fondo sigue siendo blanco fijo').toBe('#fff');
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contraste('#006064', valor(OSCURO, '--c-bg'))).toBeLessThan(3); // el defecto que se arregla
  });

  it('el tema claro no cambia: cada token de texto ES su marca de siempre', () => {
    for (const [tok, marca] of TOKENS_TXT) expect(valor(CLARO, tok), tok).toBe(marca);
  });

  it('🔴 en oscuro cada token de texto se lee sobre el fondo y las dos superficies (≥ 4,5:1)', () => {
    for (const [tok] of TOKENS_TXT) {
      const color = valor(OSCURO, tok);
      expect(color, 'falta ' + tok + ' en el tema oscuro').toMatch(HEX);
      for (const fondo of ['--c-bg', '--c-surface', '--c-surface-2']) {
        expect(contraste(color, valor(OSCURO, fondo)), tok + ' sobre ' + fondo).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('🔴 ningún texto de src/ usa la marca directa (salvo las excepciones de arriba): usa --c-brand-txt', () => {
    const fuera = textosConMarcaDirecta().filter((x) => !EXCEPCIONES.includes(x.archivo + '|' + x.selector));
    expect(fuera, 'textos con la marca directa (en oscuro se verían a 2,5:1)').toEqual([]);
  });
});
