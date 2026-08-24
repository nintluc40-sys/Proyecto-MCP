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
    expect(resumen('Cuantificaciones')).toBe('3');
    // Y el denominador de muestras deja FUERA a las que no cuantificaron: la L-4 no se
    // corrió por qPCR y la L-5 salió 'N/A'. Son 5 filas y sólo 3 cuentan.
    const csu = [...document.querySelectorAll('#carga-sum .cs')]
      .find((c) => txt(c.querySelector('.cs-k')) === 'Cuantificaciones');
    expect(txt(csu.querySelector('.cs-u'))).toBe('en 3 muestras');
  });

  it('🔴 la franja distingue CUANTIFICACIONES de MUESTRAS', () => {
    // Una sola muestra corrida para WSSV y para IHHNV deja DOS cuantificaciones. La franja
    // rotulaba ese número como «Muestras cuantificadas», así que anunciaba dos muestras
    // donde el analista tiene una en la mano. Las medianas SÍ son de las cuantificaciones
    // (quedarse con una escondería la otra), de modo que el número está bien: lo que
    // estaba mal era el rótulo, y el conteo de muestras se enseña al lado para no perderlo.
    montar([
      B({ Fecha: '02/07/2026', 'Código': 'D-1', Lugar: 'Módulo 8', Tanque: 'T1', ...SIN_MEDIR,
        WSSV: 'Positivo', IHHNV: 'Positivo',
        'Ciclo de amplificación WSSV': '18.0', 'Copias/μl WSSV': '1.00E+06',
        'Ciclo de amplificación IHHNV': '30.0', 'Copias/μl IHHNV': '1.00E+02' }),
    ]);
    expect(puntos().length, 'una muestra con dos patógenos debe dar dos puntos').toBe(2);
    expect(resumen('Cuantificaciones')).toBe('2');
    // El denominador de muestras va como unidad, pegado al número.
    const cs = [...document.querySelectorAll('#carga-sum .cs')]
      .find((c) => txt(c.querySelector('.cs-k')) === 'Cuantificaciones');
    expect(txt(cs.querySelector('.cs-u')), 'la franja sigue contando muestras de más').toBe('en 1 muestra');
    // Control: con dos muestras de una cuantificación cada una, los dos números coinciden.
    montar([
      B({ Fecha: '02/07/2026', 'Código': 'D-2', Lugar: 'Módulo 8', Tanque: 'T1', ...SIN_MEDIR,
        WSSV: 'Positivo', 'Ciclo de amplificación WSSV': '18.0', 'Copias/μl WSSV': '1.00E+06' }),
      B({ Fecha: '03/07/2026', 'Código': 'D-3', Lugar: 'Módulo 8', Tanque: 'T2', ...SIN_MEDIR,
        IHHNV: 'Positivo', 'Ciclo de amplificación IHHNV': '30.0', 'Copias/μl IHHNV': '1.00E+02' }),
    ]);
    expect(resumen('Cuantificaciones')).toBe('2');
    const cs2 = [...document.querySelectorAll('#carga-sum .cs')]
      .find((c) => txt(c.querySelector('.cs-k')) === 'Cuantificaciones');
    expect(txt(cs2.querySelector('.cs-u'))).toBe('en 2 muestras');
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
    expect(resumen('Cuantificaciones')).toBe('1');
    expect(resumen('Carga mediana')).toBe('9,0 × 10²');
  });

  it('en entrenamiento apaga la cuantificación DE CADA PATÓGENO, y al salir la devuelve intacta', () => {
    // Desde 2026-08-23 cada patógeno trae su propia pareja Ct/Copias. Dos peligros:
    //  · que el entrenamiento apague solo la genérica y el dato REAL de WSSV siga a la vista;
    //  · que el respaldo se guarde por REFERENCIA —`qpcr` es un objeto—, con lo que apagarlo
    //    mutaría también el respaldo y al salir se "restauraría" un N/A: el dato verdadero
    //    quedaría destruido para siempre, y sin ningún error.
    // Esta prueba mata las dos: exige el N/A dentro y el valor exacto al volver.
    montar([
      B({ Fecha: '02/07/2026', 'Código': 'P-1', Lugar: 'Módulo 8', Tanque: 'T1', ...SIN_MEDIR,
        WSSV: 'Positivo', IHHNV: 'Positivo',
        'Ciclo de amplificación WSSV': '24.8', 'Copias/μl WSSV': '3.40E+04',
        'Ciclo de amplificación IHHNV': '31.0', 'Copias/μl IHHNV': '750' }),
    ]);
    const celdas = () => [...document.querySelectorAll('#c-table tbody td.q-num')].map(txt);
    expect(celdas().join(' | ')).toContain('WSSV 3.40E+04');
    expect(celdas().join(' | ')).toContain('IHHNV 750');

    click(document.getElementById('aud-btn'));
    const dentro = celdas().join(' | ');
    expect(dentro).not.toContain('3.40E+04');   // ni rastro del valor real, de NINGUNO
    expect(dentro).not.toContain('750');
    expect(dentro).not.toContain('24.8');
    expect(dentro).toContain('WSSV N/A');       // los dos apagados, no solo la genérica
    expect(dentro).toContain('IHHNV N/A');

    click(document.getElementById('aud-btn'));
    const fuera = celdas().join(' | ');
    expect(fuera).toContain('WSSV 3.40E+04');   // el dato vuelve EXACTO
    expect(fuera).toContain('IHHNV 750');
    expect(fuera).toContain('WSSV 24.8');
    expect(fuera).toContain('IHHNV 31.0');
    expect(fuera).not.toContain('N/A');
  });

  it('en entrenamiento NO inventa corridas de qPCR que no se hicieron', () => {
    // La muestra solo se corrió por WSSV. Poner "N/A" también bajo IHHNV y AHPND diría que
    // se corrieron y no amplificaron: dos ensayos que nunca existieron. El modo existe para
    // no enseñar el dato real, no para fabricar datos nuevos.
    montar([
      B({ Fecha: '02/07/2026', 'Código': 'P-2', Lugar: 'Módulo 8', Tanque: 'T1', ...SIN_MEDIR,
        WSSV: 'Positivo',
        'Ciclo de amplificación WSSV': '24.8', 'Copias/μl WSSV': '3.40E+04' }),
    ]);
    click(document.getElementById('aud-btn'));
    const dentro = [...document.querySelectorAll('#c-table tbody td.q-num')].map(txt).join(' | ');
    expect(dentro).toContain('WSSV N/A');
    expect(dentro).not.toContain('IHHNV N/A');
    expect(dentro).not.toContain('AHPND/EMS N/A');
    // El modo AUD es estado de MÓDULO y sobrevive al test: se apaga o el siguiente monta ciego.
    click(document.getElementById('aud-btn'));
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

describe('Biomol · la carga se cuenta POR PATÓGENO', () => {
  // Desde 2026-08-23 la hoja trae Ct y copias de cada patógeno por separado. Una
  // muestra corrida para WSSV e IHHNV deja DOS cargas distintas: quedarse con una
  // escondería la otra y promediarlas inventaría una que nadie midió.
  const conPat = (qpcr, extra) => ({
    f: '2026-08-18', lugar: 'Sala 1', cod: 'L-1',
    IHHNV: '', WSSV: '', BP: '', AHPND: '', NHPB: '', EHP: '',
    ciclo: '', copias: '', qpcr, ...extra,
  });
  const vacio = { ciclo: '', copias: '' };

  it('🔴 una muestra con DOS patógenos cuantificados da DOS puntos', () => {
    const pts = cargaPuntos([conPat({
      WSSV: { ciclo: '18.1', copias: '9.10E+05' },
      IHHNV: { ciclo: '22.4', copias: '3.40E+04' },
      AHPND: vacio,
    })]);
    expect(pts, 'se perdió una de las dos cargas').toHaveLength(2);
    expect(pts.map((p) => p.diag).sort()).toEqual(['IHHNV', 'WSSV']);
  });

  it('🔴 cada punto lleva SU carga y SU Ct, sin cruzarse', () => {
    const [a, b] = cargaPuntos([conPat({
      WSSV: { ciclo: '18.1', copias: '9.10E+05' },
      IHHNV: { ciclo: '22.4', copias: '3.40E+04' },
      AHPND: vacio,
    })]);
    const wssv = a.diag === 'WSSV' ? a : b;
    const ihhnv = a.diag === 'IHHNV' ? a : b;
    expect(wssv.copias).toBeCloseTo(9.1e5, 0);
    expect(wssv.ct).toBeCloseTo(18.1, 5);
    expect(ihhnv.copias).toBeCloseTo(3.4e4, 0);
    expect(ihhnv.ct).toBeCloseTo(22.4, 5);
  });

  it('🔴 el patógeno ya NO se adivina: lo dice la columna', () => {
    // Antes se deducía sólo cuando la fila informaba UN patógeno; con dos medidos
    // no se atribuía a ninguno. Ahora el dato lo trae la propia columna.
    const [p] = cargaPuntos([conPat(
      { WSSV: { ciclo: '18.1', copias: '9.10E+05' }, IHHNV: vacio, AHPND: vacio },
      { WSSV: 'Positivo', IHHNV: 'Negativo' },   // dos patógenos INFORMADOS
    )]);
    expect(p.diag, 'volvió a adivinar en vez de leer la columna').toBe('WSSV');
  });

  it('una fila vieja, con la pareja genérica, sigue funcionando', () => {
    // Respaldo: si algún día apareciera una fila escrita antes del cambio.
    const pts = cargaPuntos([{
      f: '2026-08-18', lugar: 'Sala 1', cod: 'L-9',
      IHHNV: '', WSSV: 'Positivo', BP: '', AHPND: '', NHPB: '', EHP: '',
      ciclo: '20.0', copias: '1.00E+05',
    }]);
    expect(pts).toHaveLength(1);
    expect(pts[0].diag).toBe('WSSV');       // aquí sí se deduce, y puede
    expect(pts[0].copias).toBeCloseTo(1e5, 0);
  });

  it('🔴 la mediana incluye las DOS cuantificaciones de la misma muestra', () => {
    const r = qpcrResumen([conPat({
      WSSV: { ciclo: '18.0', copias: '1.00E+02' },
      IHHNV: { ciclo: '22.0', copias: '1.00E+06' },
      AHPND: vacio,
    })]);
    expect(r.nCopias, 'la segunda cuantificación quedó fuera').toBe(2);
    expect(r.nCt).toBe(2);
    // …pero siguen siendo UNA muestra: son magnitudes distintas desde 2026-08-23.
    expect(r.nMuestrasCopias, 'dos cuantificaciones se contaron como dos muestras').toBe(1);
  });

  it('un patógeno sin cuantificar no aporta punto', () => {
    const pts = cargaPuntos([conPat({
      WSSV: { ciclo: '18.1', copias: '9.10E+05' },
      IHHNV: { ciclo: '', copias: '' },
      AHPND: { ciclo: 'N/A', copias: 'N/A' },
    })]);
    expect(pts).toHaveLength(1);
    expect(pts[0].diag).toBe('WSSV');
  });
});

describe('Biomol · el filtro de diagnóstico alcanza a la CUANTIFICACIÓN', () => {
  /* Auditoría del 2026-08-24. Hasta entonces el filtro se aplicaba sólo a la FILA
     (`enFiltroDiag`): una muestra positiva a WSSV y a IHHNV seguía aportando la carga de
     WSSV con WSSV apagado. Medido antes de corregir: 2 puntos en vez de 1, mediana
     «2,8 × 10³» —que no es ninguna de las dos medidas— y la barra de nivel en ALTO
     (la carga de WSSV) mientras el usuario miraba IHHNV, que es BAJO.

     ⚠ Todas las pruebas de filtro anteriores usaban la pareja GENÉRICA, que ya no existe
     en la hoja: cubrían un camino que en producción no puede ocurrir. Por eso el defecto
     pasó. Estas usan las columnas POR PATÓGENO, que es lo que llega hoy. */

  // Una sola muestra: WSSV con carga ALTA (10⁶) e IHHNV con carga BAJA (8). Los dos
  // valores están en extremos opuestos de la escala a propósito: si se cuela el del
  // patógeno apagado, el color de la barra y la mediana lo delatan sin ambigüedad.
  const DOBLE = () => [
    B({ Fecha: '02/07/2026', 'Código': 'D-1', Lugar: 'Módulo 8', Tanque: 'T1', 'Estadío': 'PL10',
      ...SIN_MEDIR, WSSV: 'Positivo', IHHNV: 'Positivo',
      'Ciclo de amplificación WSSV': '18.0', 'Copias/μl WSSV': '1.00E+06',
      'Ciclo de amplificación IHHNV': '34.0', 'Copias/μl IHHNV': '8' }),
  ];

  it('🔴 apagar un patógeno retira SU cuantificación, no sólo la fila', () => {
    montar(DOBLE());
    expect(puntos()).toHaveLength(2);            // control: con los dos activos hay dos
    quitarDiag(root, 'WSSV');
    const p = puntos();
    expect(p, 'sigue pintándose la carga del patógeno apagado').toHaveLength(1);
    expect(p[0].attrs.fill).toBe('#22c55e');     // el Bajo de IHHNV, no el Alto de WSSV
    expect(resumen('Carga mediana')).toBe('8,0 × 10⁰');   // la de IHHNV, no la mezcla
    expect(resumen('Cuantificaciones')).toBe('1');
  });

  it('🔴 la barra de nivel usa la carga del patógeno EN FOCO', () => {
    montar(DOBLE());
    quitarDiag(root, 'WSSV');
    modoCarga(root, 'nivel');
    const colores = barras().map((b) => b.attrs.fill);
    expect(colores, 'la barra pintó el nivel del patógeno apagado').not.toContain('#ef4444');
    expect(colores).toContain('#22c55e');        // Bajo: la carga de IHHNV
  });

  it('🔴 la pareja genérica NO es una puerta de atrás para el patógeno apagado', () => {
    /* La trampa: `r.copias` es un ESPEJO del primer valor por patógeno. Una fila cuya ÚNICA
       cuantificación es la del patógeno apagado no puede caer al respaldo de la fila vieja,
       o ese mismo dato volvería a entrar disfrazado. La fila SIGUE en el conjunto —mide
       IHHNV, que está activo—, así que no basta con que desaparezca: tiene que quedarse
       sin carga que enseñar. */
    montar([
      B({ Fecha: '02/07/2026', 'Código': 'P-1', Lugar: 'Módulo 8', Tanque: 'T1',
        ...SIN_MEDIR, WSSV: 'Positivo', IHHNV: 'Positivo',
        'Ciclo de amplificación WSSV': '18.0', 'Copias/μl WSSV': '1.00E+06' }),
    ]);
    expect(puntos()).toHaveLength(1);            // control: con WSSV activo sí hay carga
    quitarDiag(root, 'WSSV');
    expect(puntos(), 'la carga del patógeno apagado volvió por el respaldo genérico').toHaveLength(0);
    expect(rotulos()).toContain('Sin cuantificaciones de qPCR en el rango');
    expect(document.getElementById('carga-sum').innerHTML)
      .toContain('Ninguna muestra del rango se corrió por qPCR');

    modoCarga(root, 'nivel');
    const colores = barras().map((b) => b.attrs.fill);
    expect(colores, 'la fila se clasificó con la carga del patógeno apagado')
      .not.toContain('#ef4444');
  });

  it('🔴 con los DOS activos, el nivel de la fila es el MÁS ALTO de sus cargas', () => {
    /* Hay que elegir un nivel por fila para la barra, y quedarse con el más bajo escondería
       justo la carga que importa. Las dos cargas están en extremos opuestos (Alto y Bajo),
       así que invertir el criterio cambia el color: es lo único que distingue la regla
       correcta de la contraria. */
    montar(DOBLE());
    modoCarga(root, 'nivel');
    const colores = barras().map((b) => b.attrs.fill);
    expect(colores, 'la fila se clasificó por su carga MÁS BAJA').toContain('#ef4444');
    expect(colores).not.toContain('#22c55e');
  });

  it('🔴 el tooltip de un punto lleva SU Ct, no el de la fila', () => {
    /* Un punto es (muestra, patógeno) y la fila trae además el Ct del OTRO patógeno.
       Leerlo de la fila enseñaría 18.0 —el de WSSV— bajo el punto de IHHNV, sin que nada
       lo delatara: los dos son números plausibles. Por eso los Ct del fixture son
       distintos y se comprueba también que el ajeno NO aparece. */
    montar(DOBLE());
    const bajo = puntos().find((p) => p.attrs.fill === '#22c55e');   // el de IHHNV
    bajo.events.mouseenter({ clientX: 10, clientY: 10 });
    const html = document.getElementById('bm-tooltip').innerHTML;
    expect(html).toContain('Cuantificación qPCR · IHHNV');
    expect(html, 'el punto no enseñó su propio Ct').toContain('34.0');
    expect(html, 'se coló el Ct del otro patógeno').not.toContain('18.0');
  });
});
