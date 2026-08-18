// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Microbiología — el Analista obligatorio para GUARDAR, en las TRES rutas

   Complementa a `analista-sync.test.js`, que sostiene la corrección de `a382251` pero la
   ejercita SOLO por la ruta de Calidad de Agua. La corrección añadió el mismo guarda en tres
   sitios —`saveMicLocal`, `saveCalLocal`, `savePatLocal`—, así que dos de los tres quedaban
   sin vigilancia: medido el 2026-08-17, anular por completo el guarda de Bacteriología o el
   de Patología dejaba la suite ENTERA en verde.

   No era un defecto —se comprobó aquí que las dos rutas funcionan—, era un agujero de
   cobertura: el código estaba bien y nadie lo custodiaba. Este archivo lo cierra.

   POR QUÉ IMPORTA EL GUARDA (la raíz, en una frase): si se podía guardar sin Analista, el
   registro nacía con su propia clave de sesión (`fecha|corrida|depto|formato|sid`) y bastaba
   cambiar de formato o corregir la corrida para que el formulario ya no lo alcanzara: quedaba
   pendiente, sin analista, y bloqueaba la sincronización entera sin forma de arreglarlo desde
   la interfaz. El guarda cierra la FUENTE; el rescate de lo ya atascado lo cubre el otro
   archivo.

   El tercer caso de cada bloque —el análisis vacío— no es adorno: sin él, un guarda que
   exigiera el Analista SIEMPRE pasaría igual, y estaría molestando al analista antes de que
   haya escrito nada.

   Verificado por mutación: anular cada guarda, o hacerlo incondicional, deja roja UNA prueba,
   la suya (4/4). Ver `feedback_fixtures-que-no-prueban-nada`.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');

// El motor es un script clásico de ~14.900 líneas: se arranca ENTERO sobre el shell real.
// `new Function` no deja nada en globalThis, de ahí el epílogo que exporta lo necesario.
const EXPORTAR = ['saveMicLocal', 'savePatLocal', '_micRaw', '_patRaw',
  'micTypeSet', 'renderMicNuevo', 'renderPatNuevo', 'renderCalNuevo'];
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
  // Sin `__rgLib` el motor no llega a arrancar: delega en él desde el primer render.
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
const nuevoMic = () => { localStorage.clear(); toasts.length = 0; H.micTypeSet('bact'); H.renderMicNuevo(); };
const nuevoPat = () => { localStorage.clear(); toasts.length = 0; H.micTypeSet('pat'); H.renderPatNuevo(); };
// ⚠ Hay que escribir en la celda por su NOMBRE real: rellenar "el primer input de la fila"
// NO marca la fila como con datos, y la prueba pasaría midiendo 0 filas.
const celdaMic = () => {
  const ns = Array.from(document.querySelectorAll('[name^="mic_larv-muestra_1_"]')).map((e) => e.name);
  return ns.find((x) => /vamar/.test(x)) || ns[ns.length - 1];
};

describe('Bacteriología · el Analista es obligatorio para GUARDAR', () => {
  it('sin Analista no se crea el registro (antes nacía huérfano y bloqueaba todo)', () => {
    nuevoMic();
    campo('mic-fm', '2026-08-17'); campo('mic-corr', '585');
    celda(celdaMic(), '5');
    expect(H.saveMicLocal()).toBe(-1);
    expect(H._micRaw().length).toBe(0);
    expect(ultimoAviso()).toMatch(/Analista/);
  });

  it('con Analista guarda con normalidad', () => {
    nuevoMic();
    campo('mic-fm', '2026-08-17'); campo('mic-corr', '585'); campo('mic-resp', 'Macías');
    celda(celdaMic(), '5');
    expect(H.saveMicLocal()).toBe(1);
  });

  it('un análisis vacío NO reclama el Analista (no molesta al que aún no ha escrito nada)', () => {
    nuevoMic();
    campo('mic-fm', '2026-08-17'); campo('mic-corr', '585');
    expect(H.saveMicLocal()).toBe(0);
  });
});

describe('Patología · el Analista es obligatorio para GUARDAR', () => {
  it('sin Analista no se crea el registro', () => {
    nuevoPat();
    campo('pat-fm', '2026-08-17'); campo('pat-corr', '585');
    celda('pat_1_muestra', 'Camarón 1');
    expect(H.savePatLocal()).toBe(-1);
    expect(H._patRaw().length).toBe(0);
    expect(ultimoAviso()).toMatch(/Analista/);
  });

  it('con Analista guarda con normalidad', () => {
    nuevoPat();
    campo('pat-fm', '2026-08-17'); campo('pat-corr', '585'); campo('pat-resp', 'Chumo');
    celda('pat_1_muestra', 'Camarón 1');
    expect(H.savePatLocal()).toBe(1);
  });

  it('un análisis vacío NO reclama el Analista', () => {
    nuevoPat();
    campo('pat-fm', '2026-08-17'); campo('pat-corr', '585');
    expect(H.savePatLocal()).toBe(0);
  });
});

/* El asterisco rojo junto a «Responsable» lleva un `title` que le explica la regla al
   analista. Nació en 83e5f3c diciendo «obligatorio antes de sincronizar», y cuando a382251
   adelantó la exigencia al GUARDADO ese texto se quedó atrás: prometía una regla más laxa
   que la que el código aplica, así que el analista se topaba con el bloqueo antes de lo que
   el aviso le hacía esperar. Esta prueba no demuestra el comportamiento —de eso se encargan
   los bloques de arriba—, sino que el texto no vuelva a divergir de él. */
describe('el aviso del campo dice la regla que de verdad se aplica', () => {
  const rotulo = (render, panelId) => {
    localStorage.clear();
    render();
    const el = document.getElementById(panelId);
    const sp = el.closest('.mf').querySelector('span[title]');
    return sp.getAttribute('title');
  };

  it('los tres paneles anuncian que el Analista hace falta para GUARDAR', () => {
    const casos = [
      ['Bacteriología', () => { H.micTypeSet('bact'); H.renderMicNuevo(); }, 'mic-resp'],
      ['Calidad de Agua', () => { H.micTypeSet('cal'); H.renderCalNuevo(); }, 'cal-resp'],
      ['Patología', () => { H.micTypeSet('pat'); H.renderPatNuevo(); }, 'pat-resp'],
    ];
    for (const [nombre, render, id] of casos) {
      const t = rotulo(render, id);
      expect(t, nombre).toMatch(/guardar/i);
      expect(t, nombre).not.toMatch(/antes de sincronizar/i);
    }
  });
});
