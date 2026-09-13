// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · EL SALDO DEL ORIGEN (Movimientos) LLEVA TOTAL, COMO LOS VIVOS DE TANQUES

   Decisión del usuario (2026-09-12, punto D6 de la auditoría): «debería tener total».
   El 2026-09-08 se pidió el total para los vivos de Tanques (`12♂ 34♀ · 46`) y la MISMA
   línea de Movimientos —el botón «🔄 Ver saldo de los orígenes»— se dejó sin él a
   propósito, porque entonces no era lo pedido. Resultado: dos pantallas enseñaban la misma
   clase de cifra en formatos distintos.

   🔑 POR QUÉ SE COMPARAN LAS DOS PANTALLAS Y NO SÓLO UNA. Ninguna prueba miraba ninguno de
   los dos formatos, así que el total de Tanques también podía perderse sin que nada se
   pusiera rojo. Fijar que las dos escriben EXACTAMENTE lo mismo para el mismo tanque es lo
   que impide que vuelvan a divergir, en cualquiera de los dos sentidos.

   Vive sólo en el monolito (fuera de ESLint y de vitest), así que se arranca ENTERO sobre
   happy-dom —la receta del banco de `engine.js`— y se ejercen las funciones REALES.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadMovimientos', '_madMovPintaSaldo', 'madMovSalaChange',
  'renderMadTanques', 'madTanquesSalaChange', '_madTanquesPintaVivos'];
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

  /* ⚠ `new Function` NO deja nada en globalThis: sin este epílogo el monolito se ejecuta
     entero y no se puede tocar ni una de sus funciones. */
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

/* Libro con la forma REAL de `madConstruirLibro` (objetos planos: el monolito no usa Map).
   12 + 34 = 46 a propósito: si alguien concatenara en vez de sumar saldría «1234». */
const libroCon = (extra) => Object.assign({
  posiciones: [], lotes: {}, avisos: [], hasta: '2026-01-01', fallos: [], recortadas: [],
  tanques: { 'Sala 1|1': { sala: 'Sala 1', tanque: 1, machos: 12, hembras: 34, composicion: [] } },
}, extra || {});

/* La celda de saldo de un tramo cuyo ORIGEN es (sala, tanque), montada con el renderizador
   real de la pestaña y rellenada como lo haría el operario. */
function celdaOrigen(sala, tanque) {
  H.renderMadMovimientos();
  const tr = document.querySelector('#mv-tramos tr.mv-tramo');
  const so = tr.querySelector('.mv-so');
  so.value = sala;
  H.madMovSalaChange(so);                        // rellena los tanques de esa sala
  tr.querySelector('.mv-to').value = String(tanque);
  return tr.querySelector('.mv-saldo-o');
}

/* La celda de vivos del mismo tanque en la grilla diaria de Tanques. */
function celdaVivos(sala, tanque) {
  H.renderMadTanques();
  document.getElementById('mad-tanques-sala').value = sala;
  H.madTanquesSalaChange();
  return document.querySelector('.tq-vivos[data-tq="' + tanque + '"]');
}

describe('Maduración · Movimientos · el saldo del origen lleva TOTAL (D6)', () => {
  it('el fixture ejerce algo: el libro conoce el tanque y la celda deja de decir «—»', () => {
    const c = celdaOrigen('Sala 1', 1);
    expect(c.textContent).toBe('—');
    H._madMovPintaSaldo(libroCon());
    expect(c.textContent).toContain('12♂ 34♀');
  });

  it('🔴 enseña machos, hembras y el TOTAL sumado', () => {
    const c = celdaOrigen('Sala 1', 1);
    H._madMovPintaSaldo(libroCon());
    expect(c.textContent).toBe('12♂ 34♀ · 46');
  });

  it('🔑 Movimientos y Tanques escriben EXACTAMENTE lo mismo para el mismo tanque', () => {
    const mov = celdaOrigen('Sala 1', 1);
    H._madMovPintaSaldo(libroCon());
    const tq = celdaVivos('Sala 1', 1);
    H._madTanquesPintaVivos(libroCon());
    expect(tq.textContent).toBe('12♂ 34♀ · 46');
    expect(mov.textContent).toBe(tq.textContent);
  });

  it('un tanque que el libro no conoce sigue diciendo «sin ingreso», sin total inventado', () => {
    const c = celdaOrigen('Sala 1', 2);
    H._madMovPintaSaldo(libroCon());
    expect(c.textContent).toBe('sin ingreso');
  });

  it('con el libro a medias, el tanque desconocido dice «?» y no «sin ingreso»', () => {
    const c = celdaOrigen('Sala 1', 2);
    H._madMovPintaSaldo(libroCon({ fallos: ['Maduración Ingreso'] }));
    expect(c.textContent).toBe('?');
  });
});
