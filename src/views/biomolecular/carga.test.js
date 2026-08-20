// @vitest-environment happy-dom
// Tarjeta "Carga Viral · Copias/μl en el tiempo" y su franja de resumen.
//
// Lo que más valor tiene aquí NO es el dibujo, sino el ACOPLE: el nivel de carga
// (Bajo/Medio/Alto) también lo imprime el PDF del informe desde `BIO_NIVELES` de
// public/registros/engine.js. Los dos monolitos no se pueden importar entre sí, así que la
// regla está escrita dos veces; la prueba lee los umbrales del engine.js REAL en vez de
// repetirlos a mano, para que mover un lado sin el otro se ponga rojo aquí y no en el
// informe de un lote positivo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const blackhole = new Proxy(function () {}, {
  get: (_t, prop) => {
    if (prop === Symbol.toPrimitive) return (h) => (h === 'string' ? '' : 0);
    if (prop === 'toString' || prop === Symbol.toStringTag) return () => '';
    if (prop === 'valueOf') return () => 0;
    if (prop === Symbol.iterator) return function* () {};
    return blackhole;
  },
  apply: () => blackhole,
});

// Grabadora: el agujero negro solo dice que la vista no revienta; para afirmar QUÉ se pintó
// (cuántos puntos, de qué color, con qué tooltip) hace falta registrar los nodos.
const REC = {};
const bucket = (sel) => (REC[sel] ||= { nodes: [] });
function recSel(sel, node) {
  const b = bucket(sel);
  const api = {
    append(tag) { const child = { tag, attrs: {}, text: null, events: {} }; b.nodes.push(child); return recSel(sel, child); },
    attr(k, v) { if (node) node.attrs[k] = v; return api; },
    text(t) { if (node) node.text = t; return api; },
    style() { return api; },
    on(ev, fn) { if (node) node.events[ev] = fn; return api; },
    selectAll() { return { remove() { b.nodes.length = 0; }, each() {}, attr() { return this; } }; },
    node() { return null; }, remove() { return api; }, datum() { return api; }, call() { return api; },
  };
  return api;
}
const RECORDED = ['#carga'];
globalThis.window.d3 = new Proxy(function () {}, {
  get: (_t, prop) => {
    if (prop === 'select') return (s) => (RECORDED.includes(s) ? recSel(s, null) : blackhole);
    return Reflect.get(blackhole, prop);
  },
  apply: () => blackhole,
});
globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

import { store } from '../../core/store.js';
import { biomolecularView, cargaPuntos, qpcrResumen, nivelCopias, parseCopias, fmtSci, ajusteCt } from './index.js';

const ENGINE = readFileSync(join(process.cwd(), 'public/registros/engine.js'), 'utf8');

/** Umbrales de nivel de carga leídos del engine.js REAL (los que imprime el informe). */
function nivelesDelInforme() {
  const bloque = ENGINE.match(/const BIO_NIVELES\s*=\s*\[([\s\S]*?)\];/);
  if (!bloque) throw new Error('No se encontró BIO_NIVELES en public/registros/engine.js');
  const out = [...bloque[1].matchAll(/\{\s*max:\s*([A-Za-z0-9]+)\s*,\s*n:\s*"([^"]+)"/g)]
    .map((m) => ({ max: m[1] === 'Infinity' ? Infinity : Number(m[1]), n: m[2] }));
  if (!out.length) throw new Error('BIO_NIVELES encontrado pero sin entradas legibles');
  return out;
}

const B = (o) => ({ _SheetOrigin: 'Biomol', ...o });
const SIN_MEDIR = { IHHNV: '', WSSV: '', BP: '', 'AHPND/EMS': '', NHPB: '', EHP: '' };

/* Cuatro fechas, cinco muestras, elegidas para que cada aserción distinga una regla:

   L-1 02/07 · WSSV      · Ct 24.8 · 3.40E+04  → Alto   (notación científica)
   L-2 14/07 · WSSV      · Ct 28.0 · 500       → Medio  (número llano)
   L-3 26/07 · IHHNV     · Ct 33.0 · 8         → Bajo   (el ÚNICO que no es WSSV)
   L-4 08/08 · WSSV neg  · sin nada            → no es un punto
   L-5 08/08 · WSSV      · Ct 30.0 · "N/A"     → Ct sí, copias no (denominadores distintos)

   Medianas esperadas: copias = 10^mediana(log10[4.53, 2.70, 0.90]) = 500 (NO 11.502, que
   es la media aritmética) · Ct = (28+30)/2 = 29,0 sobre CUATRO valores, no tres. */
function fixture() {
  return [
    B({ Fecha: '02/07/2026', 'Código': 'L-1', Lugar: 'Módulo 8', Tanque: 'T1', 'Estadío': 'PL10',
      ...SIN_MEDIR, WSSV: 'Positivo', 'Ciclo de amplificación': '24.8', 'Copias/μl': '3.40E+04' }),
    B({ Fecha: '14/07/2026', 'Código': 'L-2', Lugar: 'Módulo 8', Tanque: 'T2', 'Estadío': 'PL10',
      ...SIN_MEDIR, WSSV: 'Positivo', 'Ciclo de amplificación': '28.0', 'Copias/μl': '500' }),
    B({ Fecha: '26/07/2026', 'Código': 'L-3', Lugar: 'Módulo 3', Tanque: 'T3', 'Estadío': 'PL5',
      ...SIN_MEDIR, IHHNV: 'Positivo', 'Ciclo de amplificación': '33.0', 'Copias/μl': '8' }),
    B({ Fecha: '08/08/2026', 'Código': 'L-4', Lugar: 'Módulo 3', Tanque: 'T4', 'Estadío': 'N5',
      ...SIN_MEDIR, WSSV: 'Negativo' }),
    B({ Fecha: '08/08/2026', 'Código': 'L-5', Lugar: 'Módulo 3', Tanque: 'T5', 'Estadío': 'N5',
      ...SIN_MEDIR, WSSV: 'Positivo', 'Ciclo de amplificación': '30.0', 'Copias/μl': 'N/A' }),
  ];
}
/** Ninguna muestra corrida por qPCR: es el estado REAL de la hoja hoy (16 columnas). */
function fixtureSinQpcr() {
  return [
    B({ Fecha: '02/07/2026', 'Código': 'S-1', Lugar: 'Módulo 8', Tanque: 'T1', ...SIN_MEDIR, WSSV: 'Negativo' }),
    B({ Fecha: '14/07/2026', 'Código': 'S-2', Lugar: 'Módulo 8', Tanque: 'T2', ...SIN_MEDIR, WSSV: 'Positivo' }),
  ];
}

const txt = (el) => (el ? el.textContent.trim() : null);
const click = (el) => { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const puntos = () => (REC['#carga']?.nodes || []).filter((n) => n.tag === 'circle');
/** El estado del filtro de diagnóstico es de MÓDULO y sobrevive al re-render: se normaliza
 *  leyendo las píldoras, no suponiendo, para que el orden de los tests no falsee nada. */
const todosLosDiags = (root) => root.querySelectorAll('#diag-filter .filter-btn').forEach((b) => { if (!b.classList.contains('on')) click(b); });
const quitarDiag = (root, diag) => click([...root.querySelectorAll('#diag-filter .filter-btn')].find((b) => b.dataset.diag === diag));
/** La pestaña activa también es estado de MÓDULO: se fija leyendo el DOM, no suponiendo. */
const modoCarga = (root, k) => {
  const b = [...root.querySelectorAll('#carga-tabs .tab')].find((x) => x.dataset.modo === k);
  if (b && !b.classList.contains('on')) click(b);
};
const lineas = () => (REC['#carga']?.nodes || []).filter((n) => n.tag === 'line');
const barras = () => (REC['#carga']?.nodes || []).filter((n) => n.tag === 'rect');
const rotulos = () => (REC['#carga']?.nodes || []).filter((n) => n.tag === 'text').map((n) => String(n.text));
/** Valor de la franja de resumen, buscado por su etiqueta. */
function resumen(clave) {
  const cs = [...document.querySelectorAll('#carga-sum .cs')].find((c) => txt(c.querySelector('.cs-k')) === clave);
  return cs ? txt(cs.querySelector('.cs-v')) : null;
}

let root;
function montar(rows) {
  store.globalData = rows;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  Object.keys(REC).forEach((k) => delete REC[k]);
  biomolecularView(root);
  todosLosDiags(root);
  modoCarga(root, 'tiempo');
  return root;
}

beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'biomolecular';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); });

describe('Carga viral · el nivel NO puede divergir del informe en PDF', () => {
  it('los umbrales del tablero son los mismos que los de engine.js', () => {
    const niveles = nivelesDelInforme();
    expect(niveles.length).toBeGreaterThan(1);
    niveles.forEach((nv, i) => {
      // Justo EN el exponente tope, el nivel es este…
      if (nv.max !== Infinity) {
        expect(nivelCopias(String(Math.pow(10, nv.max)))).toBe(nv.n);
        // …y un exponente más arriba ya es el siguiente. Correr un umbral en engine.js sin
        // correrlo aquí rompe una de estas dos aserciones.
        expect(nivelCopias(String(Math.pow(10, nv.max + 1)))).toBe(niveles[i + 1].n);
      }
    });
  });

  it('clasifica por el EXPONENTE, no por el valor redondo', () => {
    expect(nivelCopias('99')).toBe('Bajo');    // 10¹·⁹⁹ → exponente 1
    expect(nivelCopias('100')).toBe('Medio');  // exponente 2
    expect(nivelCopias('9999')).toBe('Medio'); // exponente 3
    expect(nivelCopias('10000')).toBe('Alto'); // exponente 4
  });

  it('lo que no es un número positivo no se clasifica ni se convierte', () => {
    ['', '   ', 'N/A', 'Undet', '>40', '0', '-5'].forEach((v) => {
      expect(parseCopias(v)).toBeNull();
      expect(nivelCopias(v)).toBe('');
    });
    expect(parseCopias('1.00E+05')).toBe(100000); // como lo escribe el laboratorio
    expect(parseCopias('34000')).toBe(34000);     // número llano
    expect(parseCopias('1,2E+04')).toBe(12000);   // coma decimal
  });
});

describe('Carga viral · resumen y puntos (lógica pura)', () => {
  it('la mediana de copias se calcula en ÓRDENES, no en lineal', () => {
    // Dos valores a cuatro órdenes de distancia: el centro honesto es 10⁴, no 5×10⁵.
    const r = qpcrResumen([{ copias: '1E+02', ciclo: '' }, { copias: '1E+06', ciclo: '' }]);
    expect(Math.round(r.medCopias)).toBe(10000);
  });

  it('copias y Ct llevan denominadores separados', () => {
    const r = qpcrResumen(cargaFilas());
    expect(r.nCopias).toBe(3); // L-1, L-2, L-3 — la de "N/A" no cuenta
    expect(r.nCt).toBe(4);     // …pero su Ct sí
    expect(Math.round(r.medCopias)).toBe(500);
    expect(r.medCt).toBe(29);
  });

  it('solo son puntos las muestras cuantificadas, y salen en orden cronológico', () => {
    const pts = cargaPuntos(cargaFilas());
    expect(pts.map((p) => p.r.cod)).toEqual(['L-1', 'L-2', 'L-3']);
    expect(pts.map((p) => p.nivel)).toEqual(['Alto', 'Medio', 'Bajo']);
  });

  it('la notación científica de la franja no desborda la mantisa', () => {
    expect(fmtSci(34000)).toBe('3,4 × 10⁴');
    expect(fmtSci(500)).toBe('5,0 × 10²');
    expect(fmtSci(9990)).toBe('1,0 × 10⁴'); // y NO "10,0 × 10³"
    expect(fmtSci(null)).toBe('—');
  });
});

/** Las filas normalizadas equivalentes al fixture, para las pruebas de lógica pura.
 *  DESORDENADAS a propósito: `filtered()` conserva el orden de la HOJA, no el cronológico,
 *  así que con una lista ya ordenada la prueba del orden no distinguiría nada. */
function cargaFilas() {
  return [
    { cod: 'L-3', f: '2026-07-26', ciclo: '33.0', copias: '8', IHHNV: 'Positivo' },
    { cod: 'L-1', f: '2026-07-02', ciclo: '24.8', copias: '3.40E+04', WSSV: 'Positivo' },
    { cod: 'L-5', f: '2026-08-08', ciclo: '30.0', copias: 'N/A', WSSV: 'Positivo' },
    { cod: 'L-2', f: '2026-07-14', ciclo: '28.0', copias: '500', WSSV: 'Positivo' },
    { cod: 'L-4', f: '2026-08-08', ciclo: '', copias: '', WSSV: 'Negativo' },
  ];
}

describe('Carga viral · Ct contra copias (control del ensayo)', () => {
  const p = (ct, log) => ({ ct, log });

  it('lee la recta como ciclos por década', () => {
    // Curva de libro: cada década cuesta 3,32 ciclos.
    const fit = ajusteCt([p(20, 5), p(23.32, 4), p(26.64, 3)]);
    expect(fit.ciclosDecada).toBeCloseTo(3.32, 2);
    expect(fit.n).toBe(3);
  });

  it('no inventa una recta donde no la hay', () => {
    expect(ajusteCt([p(20, 5), p(23, 4)])).toBeNull();          // menos de 3 puntos
    expect(ajusteCt([p(20, 5), p(20, 4), p(20, 3)])).toBeNull(); // todos con el mismo Ct
    expect(ajusteCt([p(20, 3), p(23, 4), p(26, 5)])).toBeNull(); // sube: no es una curva legible
    expect(ajusteCt([p(20, 4), p(23, 4), p(26, 4)])).toBeNull(); // plana
  });

  it('ignora las muestras cuantificadas que no traen Ct', () => {
    const con = [p(20, 5), p(23.32, 4), p(26.64, 3)];
    expect(ajusteCt(con.concat([{ ct: null, log: 9 }])).n).toBe(3);
  });

  it('dibuja la nube y su recta, y publica la lectura en la franja', () => {
    montar(fixture());
    modoCarga(root, 'ct');
    expect(puntos().length).toBe(3);
    // La recta de tendencia es la única discontinua de 5,4 (la rejilla usa 2,3).
    expect(lineas().filter((l) => l.attrs['stroke-dasharray'] === '5,4').length).toBe(1);
    expect(resumen('Ciclos por década')).toBe('2,3');
    expect(rotulos().some((t) => t.includes('Ciclo de amplificación'))).toBe(true);
  });
});

describe('Carga viral · reparto de los positivos por nivel', () => {
  it('reparte los positivos en los tres niveles MÁS los no cuantificados', () => {
    montar(fixture());
    modoCarga(root, 'nivel');
    // 4 positivos: L-1 Alto, L-2 Medio, L-3 Bajo y L-5, que salió "N/A".
    expect(barras().length).toBe(4);
    const t = rotulos();
    expect(t).toContain('4 positivo(s) en el rango, por nivel de carga');
    ['Bajo', 'Medio', 'Alto', 'Sin cuantificar'].forEach((n) => expect(t).toContain(n));
    // El cuarto grupo no es decorativo: sin él, los porcentajes se leerían sobre una base
    // falsa que daría por cuantificados a todos los positivos.
    expect(t.filter((x) => x === '1 · 25 %').length).toBe(4);
  });

  it('funciona aunque no haya UNA sola cuantificación', () => {
    // Es el estado real de hoy: hay positivos, pero ninguno corrido por qPCR. Los otros dos
    // modos se quedan en su aviso; este sigue teniendo algo que decir.
    montar(fixtureSinQpcr());
    expect(rotulos()).toContain('Sin cuantificaciones de qPCR en el rango');
    modoCarga(root, 'nivel');
    expect(barras().length).toBe(1);
    expect(rotulos()).toContain('1 positivo(s) en el rango, por nivel de carga');
    expect(rotulos()).toContain('1 · 100 %');
  });

  it('cuenta solo los positivos de los diagnósticos ACTIVOS', () => {
    // ⚠ Las dos muestras miden IHHNV a propósito. Si solo midieran WSSV, apagarlo las
    // sacaría ya en `enFiltroDiag` y la prueba pasaría igual sin la regla bajo examen: la
    // clave es que V-1 SIGA en el conjunto (mide IHHNV, activo) y aun así deje de contar
    // como positivo, porque su único positivo era el del diagnóstico apagado.
    montar([
      B({ Fecha: '02/07/2026', 'Código': 'V-1', Lugar: 'Módulo 8', Tanque: 'T1',
        ...SIN_MEDIR, IHHNV: 'Negativo', WSSV: 'Positivo', 'Copias/μl': '500' }),
      B({ Fecha: '03/07/2026', 'Código': 'V-2', Lugar: 'Módulo 8', Tanque: 'T2',
        ...SIN_MEDIR, IHHNV: 'Positivo', WSSV: 'Negativo', 'Copias/μl': '900' }),
    ]);
    modoCarga(root, 'nivel');
    expect(rotulos()).toContain('2 positivo(s) en el rango, por nivel de carga');

    quitarDiag(root, 'WSSV');
    expect(puntos().length + barras().length).toBeGreaterThan(0); // las dos siguen en el conjunto…
    expect(rotulos()).toContain('1 positivo(s) en el rango, por nivel de carga'); // …pero solo V-2 es positivo
  });
});

describe('Carga viral · la tarjeta montada', () => {
  it('pinta un punto por muestra cuantificada, con el color de su nivel', () => {
    montar(fixture());
    const p = puntos();
    expect(p.length).toBe(3);
    expect(p.map((c) => c.attrs.fill)).toEqual(['#ef4444', '#f59e0b', '#22c55e']); // Alto, Medio, Bajo
  });

  it('la franja resume el rango filtrado', () => {
    montar(fixture());
    expect(resumen('Carga mediana')).toBe('5,0 × 10²');
    expect(resumen('Ct mediano')).toBe('29,0');
    expect(resumen('Muestras cuantificadas')).toBe('3');
  });

  it('el tooltip enseña las copias TAL CUAL las escribió el laboratorio', () => {
    montar(fixture());
    puntos()[0].events.mouseenter({ clientX: 10, clientY: 10 });
    const html = document.getElementById('bm-tooltip').innerHTML;
    expect(html).toContain('3.40E+04');       // no reformateado a 3,4 × 10⁴
    expect(html).toContain('Alto');
    expect(html).toContain('Cuantificación qPCR · WSSV');
  });

  it('respeta el filtro global de diagnóstico', () => {
    montar(fixture());
    quitarDiag(root, 'WSSV');
    // Solo sobrevive L-3, que se midió por IHHNV. Si el gráfico ignorase la barra de
    // filtros —el defecto que ya tuvieron el Sankey y el treemap— seguirían siendo 3.
    const p = puntos();
    expect(p.length).toBe(1);
    expect(p[0].attrs.fill).toBe('#22c55e'); // el Bajo de L-3
    expect(resumen('Carga mediana')).toBe('8,0 × 10⁰');
    expect(resumen('Ct mediano')).toBe('33,0');
  });

  it('a la muestra le basta UN diagnóstico activo para seguir en el gráfico', () => {
    // Una muestra puede llevar varios patógenos medidos. Apagar uno de ellos no la saca del
    // universo mientras otro siga encendido: exigir que TODOS lo estén (`every` en vez de
    // `some`) haría desaparecer muestras que el usuario sigue mirando.
    montar([
      B({ Fecha: '02/07/2026', 'Código': 'U-1', Lugar: 'Módulo 8', Tanque: 'T1',
        ...SIN_MEDIR, WSSV: 'Positivo', 'Copias/μl': '500' }),
      B({ Fecha: '03/07/2026', 'Código': 'U-2', Lugar: 'Módulo 8', Tanque: 'T2',
        ...SIN_MEDIR, WSSV: 'Positivo', IHHNV: 'Negativo', 'Copias/μl': '900' }),
    ]);
    expect(puntos().length).toBe(2);
    quitarDiag(root, 'WSSV');
    const p = puntos();
    expect(p.length).toBe(1);          // U-1 se va (solo medía WSSV), U-2 se queda por IHHNV
    expect(resumen('Muestras cuantificadas')).toBe('1');
    expect(resumen('Carga mediana')).toBe('9,0 × 10²');
  });

  it('en entrenamiento la cuantificación sale como "N/A", no con su valor real', () => {
    // La simulación fuerza a Negativo todo lo que no sea IHHNV. Si la cuantificación
    // sobreviviera, saldría una muestra "Negativa" con 3,4×10⁴ copias/μl —una vista que se
    // contradice— y el dato REAL quedaría a la vista en el modo que existe para ocultarlo.
    // Lo correcto es lo que escribe el laboratorio cuando no amplifica: "N/A".
    montar(fixture());
    expect(puntos().length).toBe(3);

    click(document.getElementById('aud-btn'));
    expect(puntos().length).toBe(0);
    const celdas = [...document.querySelectorAll('#c-table tbody td.q-num')].map(txt);
    expect(celdas).toContain('N/A');            // las corridas por qPCR
    expect(celdas).not.toContain('3.40E+04');   // ni rastro del valor real
    expect(celdas).toContain('—');              // …y las que NUNCA se corrieron siguen vacías

    // El aviso distingue "no se corrió qPCR" de "se corrió y NO amplificó". Son 4 muestras:
    // L-1, L-2, L-3 y la L-5, que ya venía con "N/A" en copias pero con su Ct.
    expect(txt(document.querySelector('#carga-sum .cs-vacio')))
      .toBe('Ninguna de las 4 muestras corridas por qPCR amplificó');

    click(document.getElementById('aud-btn'));
    expect(puntos().length).toBe(3);
    expect(resumen('Carga mediana')).toBe('5,0 × 10²');
    expect([...document.querySelectorAll('#c-table tbody td.q-num')].map(txt)).toContain('3.40E+04');
  });

  it('sin cuantificaciones lo dice, en vez de dibujar una tarjeta en blanco', () => {
    // Es el estado REAL de la hoja de producción hoy: 16 columnas, ni un dato de qPCR.
    montar(fixtureSinQpcr());
    expect(puntos().length).toBe(0);
    expect(txt(document.querySelector('#carga-sum .cs-vacio'))).toContain('Ninguna muestra');
    const rotulos = (REC['#carga']?.nodes || []).filter((n) => n.tag === 'text').map((n) => String(n.text));
    expect(rotulos).toContain('Sin cuantificaciones de qPCR en el rango');
  });
});
