// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Bacteriología, Calidad de Agua y Patología — las FECHAS al guardar (punto 9 del plan, 2026-09-26)

   Decisión del usuario: la REGLA B del reproductivo (desde el 2026-09-22) llega a las tres fichas de laboratorio —una
   fecha de muestreo o de resultados POSTERIOR a hoy no se guarda— y, además, los resultados no pueden ser ANTERIORES al
   muestreo (medido ese día en producción: 40 filas de Microbiología y 6 de Calidad de Agua lo eran; el Excel LARC (40)
   traía 12 muestreos a una fecha futura). El calendario guía (`max`, y el de resultados su `min`); lo que manda es la
   comprobación al GUARDAR, que es lo que aquí se vigila en las TRES rutas —una regla puesta en tres sitios, con uno
   solo vigilado, es la trampa de `analista-guardas.test.js`—.
   «Hoy» es el del dispositivo (`today()` del motor): las fechas de la prueba se calculan a partir de él.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['saveMicLocal', 'saveCalLocal', 'savePatLocal', '_micRaw', '_calRaw', '_patRaw', 'today',
  'micTypeSet', 'renderMicNuevo', 'renderPatNuevo', 'renderCalNuevo', '_labFechasError'];
const H = {};
const toasts = [];

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
  H.setToast((msg) => { toasts.push(String(msg)); });
});

const campo = (id, v) => { const e = document.getElementById(id); if (!e) throw new Error('sin #' + id); e.value = v; };
const celda = (n, v) => { const e = document.querySelector(`[name="${n}"]`); if (!e) throw new Error('sin ' + n); e.value = v; };
const ultimoAviso = () => (toasts.length ? toasts[toasts.length - 1] : '');
const dia = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const celdaMic = () => {
  const ns = Array.from(document.querySelectorAll('[name^="mic_larv-muestra_1_"]')).map((e) => e.name);
  return ns.find((x) => /vamar/.test(x)) || ns[ns.length - 1];
};

/* Las tres fichas, cada una con lo mínimo para que HAYA algo que guardar (analista, corrida y una celda). */
const FICHAS = [
  ['Bacteriología', 'mic', () => { H.micTypeSet('bact'); H.renderMicNuevo(); }, () => { campo('mic-corr', '585'); campo('mic-resp', 'Macías'); celda(celdaMic(), '5'); },
    () => H.saveMicLocal(), () => H._micRaw().length],
  ['Calidad de Agua', 'cal', () => { H.micTypeSet('cal'); H.renderCalNuevo(); }, () => { campo('cal-corr', '585'); campo('cal-resp', 'Macías'); celda('cal_larv_1_sal', '30'); },
    () => H.saveCalLocal(), () => H._calRaw().length],
  ['Patología', 'pat', () => { H.micTypeSet('pat'); H.renderPatNuevo(); }, () => { campo('pat-corr', '585'); campo('pat-resp', 'Chumo'); celda('pat_1_muestra', 'Camarón 1'); },
    () => H.savePatLocal(), () => H._patRaw().length],
];

describe('Laboratorio · las fechas al GUARDAR, en las tres fichas', () => {
  for (const [nombre, p, abrir, rellenar, guardar, cuantos] of FICHAS) {
    const nuevo = (fm, fr) => { localStorage.clear(); toasts.length = 0; abrir(); rellenar(); campo(p + '-fm', fm); campo(p + '-fr', fr); };

    it(`🔴 ${nombre} · un muestreo POSTERIOR a hoy no se guarda, y lo dice`, () => {
      const hoy = H.today();
      nuevo(dia(hoy, 1), '');
      expect(guardar()).toBe(-1);
      expect(cuantos()).toBe(0);
      expect(ultimoAviso()).toMatch(/fecha de muestreo .* es posterior a hoy/);
    });

    it(`🔴 ${nombre} · unos resultados POSTERIORES a hoy tampoco`, () => {
      const hoy = H.today();
      nuevo(hoy, dia(hoy, 3));
      expect(guardar()).toBe(-1);
      expect(ultimoAviso()).toMatch(/fecha de resultados .* es posterior a hoy/);
    });

    it(`🔴 ${nombre} · resultados ANTERIORES al muestreo no se guardan`, () => {
      const hoy = H.today();
      nuevo(dia(hoy, -2), dia(hoy, -5));
      expect(guardar()).toBe(-1);
      expect(cuantos()).toBe(0);
      expect(ultimoAviso()).toMatch(/no pueden ser anteriores al muestreo/);
    });

    it(`${nombre} · hoy, y resultados el mismo día o sin resultados, se guardan con normalidad`, () => {
      const hoy = H.today();
      nuevo(hoy, hoy);
      expect(guardar()).toBe(1);
      nuevo(dia(hoy, -1), '');
      expect(guardar()).toBe(1);
    });

    it(`${nombre} · los calendarios guían: muestreo hasta hoy; resultados, de su muestreo a hoy`, () => {
      const hoy = H.today();
      nuevo(dia(hoy, -4), '');
      const fm = document.getElementById(p + '-fm');
      const fr = document.getElementById(p + '-fr');
      expect([fm.getAttribute('max'), fr.getAttribute('max')]).toEqual([hoy, hoy]);
      /* El motor corre aquí dentro de `new Function`: su `today()` no es global y el `onfocus` en línea no lo alcanzaría
         (en el navegador sí: es un script clásico). Se ejecuta el MISMO texto del atributo, dándole `today`. */
      new Function('today', fr.getAttribute('onfocus')).call(fr, H.today);
      expect([fr.min, fr.max], 'al enfocarlo: de su muestreo a hoy').toEqual([dia(hoy, -4), hoy]);
      new Function('today', fm.getAttribute('onfocus')).call(fm, H.today);
      expect(fm.max).toBe(hoy);
    });
  }

  it('la regla, sola: el orden de los mensajes y los casos que valen', () => {
    const hoy = H.today();
    expect(H._labFechasError(hoy, '')).toBe('');
    expect(H._labFechasError(hoy, hoy)).toBe('');
    expect(H._labFechasError(dia(hoy, 1), dia(hoy, -1))).toMatch(/muestreo .* posterior a hoy/);
    expect(H._labFechasError('', dia(hoy, -1)), 'sin muestreo no hay orden que exigir').toBe('');
  });
});
