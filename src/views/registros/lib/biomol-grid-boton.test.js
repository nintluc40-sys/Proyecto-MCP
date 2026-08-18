// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Biomol «Diagnóstico molecular» — comportamiento del botón ➕

   `biomol-grid.test.js` vigila la CAPACIDAD: la progresión 20→40→60→80→100, el tope duro y
   —lo más importante— el acople con el límite del GAS. Este archivo vigila lo otro, que es
   lo que el analista nota: que pulsar ➕ no le cueste el trabajo ya tecleado, que las filas
   nuevas sirvan de verdad, y que ampliar un día no descoloque los demás.

   POR QUÉ NO ES REDUNDANTE. `bioGridAddRows()` no se limita a subir un contador: recoge lo
   tecleado y, si hay algo, lo PERSISTE con `saveBioGrid()` antes de re-renderizar. Esa
   pasada por el almacenamiento es justo donde se perdería lo escrito si algo se descuadrara,
   y contar filas no lo detectaría: la grilla mostraría sus 40 filas, vacías.

   CÓMO SE MIDE UNA FILA «USABLE». No basta con que el `<input>` exista: hay que escribir en
   él por su NOMBRE real (`bg_<fila>_<clave>`) y comprobar que `_collectBioGrid()` lo recoge
   CON SU NÚMERO DE FILA. Rellenar "el primer input de la fila" no marca la fila como con
   datos y la prueba pasaría midiendo 0 filas (ver `feedback_fixtures-que-no-prueban-nada`).

   ⚠ TRAMPA DEL ESTADO (no es un defecto): `_bioGridExtra` vive EN MEMORIA, no en
   localStorage. `localStorage.clear()` NO lo reinicia, así que dos pruebas que usen el mismo
   día se contaminan entre sí —la segunda arranca con las filas que amplió la primera—. Por
   eso el bloque de "por día" usa fechas propias que ningún otro caso toca. La consecuencia
   para el analista es benigna y queda cubierta por el último caso: recargar la página
   devuelve la grilla a 20 filas, pero nada GUARDADO se queda oculto, porque el número de
   filas mostradas nunca baja de la fila guardada más alta de ese día.

   Verificado por mutación: devolver el paso a 10 o el tope a 50 rompe la progresión; hacer
   que `bioGridAddRows` re-renderice sin persistir lo tecleado deja rojo el primer caso.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderBiomol', 'bioGridAddRows', '_bioShownRows', '_collectBioGrid',
  'bioGridFecha', '_bioSave', 'BIO_GRID_DEFAULT_ROWS', 'BIO_GRID_ROW_STEP', 'BIO_GRID_MAX_ROWS'];
const H = {};
const avisos = [];

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
  H.setToast((msg) => { avisos.push(String(msg)); });
});

const fp = () => document.getElementById('fp-biomol');
const filasVisibles = () => new Set(Array.from(fp().querySelectorAll('[name^="bg_"]'))
  .map((e) => e.name.split('_')[1])).size;
const celda = (fila, k) => fp().querySelector(`[name="bg_${fila}_${k}"]`);
// El selector del día no existe hasta que el panel se ha renderizado al menos una vez.
const ponDia = (d) => {
  if (!document.getElementById('bio-grid-fecha')) H.renderBiomol();
  document.getElementById('bio-grid-fecha').value = d;
};
const boton = () => fp().querySelector('button[onclick="bioGridAddRows()"]');

describe('Biomol · pulsar ➕ no cuesta el trabajo ya tecleado', () => {
  it('lo escrito antes de pulsar sigue ahí después, y en su misma fila', () => {
    localStorage.clear(); avisos.length = 0;
    ponDia('2026-07-10'); H.renderBiomol();
    celda(3, 'codigo').value = 'MUESTRA-3';
    celda(3, 'corrida').value = '585';
    celda(20, 'codigo').value = 'MUESTRA-20';       // la última fila visible al arrancar
    H.bioGridAddRows();
    expect(filasVisibles()).toBe(40);
    expect(celda(3, 'codigo').value).toBe('MUESTRA-3');
    expect(celda(3, 'corrida').value).toBe('585');
    expect(celda(20, 'codigo').value).toBe('MUESTRA-20');
  });

  it('las filas NUEVAS son usables: se escribe en ellas y se recogen con su nº de fila', () => {
    localStorage.clear(); avisos.length = 0;
    ponDia('2026-07-11'); H.renderBiomol();
    H.bioGridAddRows();                              // 20 → 40
    expect(celda(40, 'codigo')).not.toBeNull();
    celda(40, 'codigo').value = 'ULTIMA';
    const filas = H._collectBioGrid();
    expect(filas.some((r) => r.codigo === 'ULTIMA' && Number(r.fila) === 40)).toBe(true);
  });

  it('en el tope, la fila 100 existe, acepta datos y el botón se apaga', () => {
    localStorage.clear(); avisos.length = 0;
    ponDia('2026-07-12'); H.renderBiomol();
    for (let i = 0; i < 4; i++) H.bioGridAddRows();
    expect(filasVisibles()).toBe(H.BIO_GRID_MAX_ROWS);
    expect(celda(H.BIO_GRID_MAX_ROWS, 'codigo')).not.toBeNull();
    celda(H.BIO_GRID_MAX_ROWS, 'codigo').value = 'CIEN';
    expect(H._collectBioGrid().some((r) => Number(r.fila) === H.BIO_GRID_MAX_ROWS)).toBe(true);
    expect(boton().disabled).toBe(true);
  });
});

describe('Biomol · la ampliación es POR DÍA', () => {
  // Fechas propias: `_bioGridExtra` es de memoria y sobrevive a localStorage.clear().
  it('ampliar un día no amplía el otro, y al volver se recuerda', () => {
    localStorage.clear(); avisos.length = 0;
    ponDia('2026-07-01'); H.renderBiomol();
    H.bioGridAddRows(); H.bioGridAddRows();
    expect(filasVisibles()).toBe(60);

    ponDia('2026-07-02'); H.renderBiomol();          // otro día: arranca de cero
    expect(filasVisibles()).toBe(H.BIO_GRID_DEFAULT_ROWS);

    ponDia('2026-07-01'); H.renderBiomol();          // se vuelve: recuerda las 60
    expect(filasVisibles()).toBe(60);
  });

  it('una muestra guardada en fila alta reabre la grilla hasta ella', () => {
    localStorage.clear(); avisos.length = 0;
    ponDia('2026-07-03');
    H._bioSave([{ id: 'x1', ts: Date.now(), synced: true, syncedAt: Date.now(),
      data: { fecha: '2026-07-03', fila: 73, codigo: 'VIEJA-73' } }]);
    H.renderBiomol();
    // Es lo que hace inofensivo que la ampliación no se persista: al recargar, una muestra
    // guardada en la fila 73 NO queda escondida detrás de las 20 filas de arranque.
    expect(filasVisibles()).toBe(73);
    expect(celda(73, 'codigo').value).toBe('VIEJA-73');
  });
});
