// @vitest-environment happy-dom
// Auditoría de cierre · Microbiología · apartado Conglomerado.
//
// G · Gráfico «Agua vs Animal». Se creaba la entrada del patógeno ANTES de saber si su
//     tipo de muestra era clasificable. Formatos como Hisopados o Algas no tienen columna
//     «Tipo de muestra», así que un patógeno EN ALERTA salía con las dos barras a 0 —
//     leyéndose como «sin alertas». Medido en la misma pantalla:
//       C. Amarillas   agua=1  animal=0
//       Pseudomonas    agua=0  animal=0     ← y la tabla la marcaba «Elevado»
//
// H · La tabla de Muestras SÍ pinta las filas con fecha ilegible (con su texto crudo),
//     pero el export las descarta SIEMPRE, incluso con el rango en blanco, porque se
//     organiza por fecha (el PDF hace una hoja por día). Medido: 2 filas en la tabla,
//     «Se exportarán 1 registro(s)» sin ninguna explicación. El descarte es legítimo;
//     el silencio no. Ahora ambos modales lo dicen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const charts = {};
vi.mock('../../core/charts.js', () => ({
  makeChart: (id, cfg) => { charts[id] = cfg; return null; },
  destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const M = (o) => ({ _SheetOrigin: 'Microbiología', Corrida: '573', ...o });

let root, errSpy;
beforeEach(() => {
  Object.keys(charts).forEach((k) => delete charts[k]);
  const s0 = {};
  globalThis.localStorage = {
    getItem: (k) => (k in s0 ? s0[k] : null),
    setItem: (k, v) => { s0[k] = String(v); },
    removeItem: (k) => { delete s0[k]; },
  };
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); delete globalThis.localStorage; });

function montar(rows) {
  store.globalData = rows;
  microbiologiaView(root);
  const b = root.querySelector('[data-mic-sub="bacteriologia"]');
  if (b && !b.classList.contains('is-active')) b.click();
  const c = root.querySelector('[data-mic-ap="conglomerado"]');
  if (c && !c.classList.contains('is-active')) c.click();
}

/** El gráfico «Agua vs Animal» como mapa etiqueta → {agua, animal}. */
function aguaAnimal() {
  const aa = charts.micAA;
  if (!aa) return null;
  const out = {};
  aa.data.labels.forEach((l, i) => { out[l] = { agua: aa.data.datasets[0].data[i], animal: aa.data.datasets[1].data[i] }; });
  return out;
}

describe('Conglomerado · «Agua vs Animal» no inventa filas vacías', () => {
  const FILAS = [
    M({ 'Fecha muestreo': '05/06/2026', Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo/Sala': '1', 'TQ/N°': '1', 'V.Amarillos UFC': '90000' }),
    // Hisopados: ese formato NO trae columna «Tipo de muestra».
    M({ 'Fecha muestreo': '05/06/2026', Formato: 'Hisopados', 'Pseudomonas UFC': '90000' }),
  ];

  it('un patógeno en alerta sin tipo de muestra NO sale con las dos barras a 0', () => {
    montar(FILAS);
    const aa = aguaAnimal();
    expect(aa).not.toBeNull();
    expect(aa.Pseudomonas).toBeUndefined();
  });

  it('no se pasa de corrección: lo clasificable sigue contándose', () => {
    montar(FILAS);
    expect(aguaAnimal()['C. Amarillas']).toEqual({ agua: 1, animal: 0 });
  });

  it('no se pasa de corrección: la alerta sin tipo sigue viéndose en la tabla', () => {
    montar(FILAS);
    const niveles = [...root.querySelectorAll('.mic-nivel')].map((e) => e.textContent.trim());
    expect(niveles).toEqual(['Elevado', 'Elevado']); // las DOS filas siguen en alerta
  });

  it('cuenta Agua y Animal por separado cuando ambos existen', () => {
    montar([
      M({ 'Fecha muestreo': '05/06/2026', Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo/Sala': '1', 'TQ/N°': '1', 'Pseudomonas UFC': '90000' }),
      M({ 'Fecha muestreo': '06/06/2026', Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Animal', 'Módulo/Sala': '1', 'TQ/N°': '2', 'Pseudomonas UFC': '90000' }),
    ]);
    expect(aguaAnimal().Pseudomonas).toEqual({ agua: 1, animal: 1 });
  });
});

describe('Export · el descarte de filas sin fecha se declara', () => {
  const FILAS = [
    M({ 'Fecha muestreo': '05/06/2026', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '1', 'V.Totales UFC': '1000' }),
    M({ 'Fecha muestreo': 'pendiente', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '2', 'V.Totales UFC': '2000' }),
  ];

  it('la tabla sigue mostrando la fila de fecha ilegible con su texto crudo', () => {
    montar(FILAS);
    const primeras = [...root.querySelectorAll('.mic-table tbody tr')].map((tr) => tr.querySelector('td')?.textContent.trim());
    expect(primeras).toContain('pendiente');
  });

  it('el modal de Excel avisa de las filas que quedan fuera', () => {
    montar(FILAS);
    root.querySelector('[data-mic-ap="petri"]').click();
    root.querySelector('[data-mic-xlsx]').click();
    const txt = root.querySelector('#micExpInfo').textContent;
    expect(txt).toContain('1 registro(s)');
    expect(txt).toContain('1 fila(s) sin fecha legible quedan fuera');
  });

  it('el modal de PDF avisa igual', () => {
    montar(FILAS);
    root.querySelector('[data-mic-ap="petri"]').click();
    root.querySelector('[data-mic-pdf]').click();
    expect(root.querySelector('#micPdfInfo').textContent).toContain('1 fila(s) sin fecha legible quedan fuera');
  });

  it('no se pasa de corrección: sin filas problemáticas no aparece ningún aviso', () => {
    montar([FILAS[0]]);
    root.querySelector('[data-mic-ap="petri"]').click();
    root.querySelector('[data-mic-xlsx]').click();
    expect(root.querySelector('#micExpInfo').textContent).not.toContain('sin fecha legible');
  });
});
