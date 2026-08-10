// @vitest-environment happy-dom
// Auditoría de cierre · Revisiones. La vista contaba como HALLAZGO cualquier texto no vacío
// de Observaciones, incluidos los que el laboratorio usa para decir «nada que reportar»
// («Sin novedad», «Ninguna», «OK»…). El defecto se propagaba a seis sitios: el KPI
// «Hallazgos / revisión», el treemap de Hallazgos, el Sankey hallazgo→acción, la línea de
// tasa diaria, la comparativa de periodos y el top-8 del modal de cobertura.
//
// Es el MISMO defecto ya corregido en Visitante, que lee la misma columna de la misma hoja.
// Por eso el criterio vive ahora en `core/fields.js` (`obsFindings`) y no por copia en cada
// vista: tenerlo duplicado era garantizar que algún día las dos pantallas contaran distinto.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { revisionesView } from './index.js';
import { obsFindings } from '../../core/fields.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const R = (o) => ({ _SheetOrigin: 'Registro_Supervision', Corrida: '544', 'Módulo': 'Módulo 1', Supervisor: 'Ana', ...o });

// 3 revisiones que declaran «nada que reportar» + 2 con hallazgos REALES.
const synth = () => [
  R({ Fecha: '02/06/2026', Observaciones: 'Sin novedad', 'Acción': 'Continuar' }),
  R({ Fecha: '03/06/2026', Observaciones: 'Ninguna', 'Acción': 'Continuar' }),
  R({ Fecha: '04/06/2026', Observaciones: 'OK', 'Acción': 'Continuar' }),
  R({ Fecha: '05/06/2026', Observaciones: 'Malla rota', 'Acción': 'Reparar' }),
  R({ Fecha: '06/06/2026', Observaciones: 'Espuma excesiva', 'Acción': 'Recambio' }),
];

let root, errSpy;
beforeEach(() => {
  store.globalData = synth();
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

/** Valor del KPI cuya etiqueta contiene `label`. */
function kpi(label) {
  const card = [...root.querySelectorAll('.rv-kpi')]
    .find((n) => n.querySelector('.rv-kpi-label')?.textContent.includes(label));
  return card ? card.querySelector('.rv-kpi-value').textContent.trim() : null;
}

describe('Revisiones · «nada que reportar» no es un hallazgo', () => {
  it('el KPI «Hallazgos / revisión» cuenta solo los reales', () => {
    revisionesView(root);
    expect(kpi('Revisiones')).toBe('5');            // las 5 revisiones siguen contando
    expect(kpi('Hallazgos / revisión')).toBe('0.40'); // 2 hallazgos ÷ 5 revisiones
    expect(kpi('Hallazgos / revisión')).not.toBe('1.00');
  });

  it('el treemap no lista «Sin novedad» ni «Ninguna» como hallazgos', () => {
    revisionesView(root);
    const svg = root.querySelector('.rv-tm-svg');
    expect(svg, 'debe dibujarse el treemap de hallazgos').toBeTruthy();
    const vals = [...svg.querySelectorAll('[data-drillval]')].map((n) => n.dataset.drillval);
    expect(vals).toContain('Malla rota');
    expect(vals).toContain('Espuma excesiva');
    expect(vals).not.toContain('Sin novedad');
    expect(vals).not.toContain('Ninguna');
    expect(vals).not.toContain('OK');
  });

  it('no se pasa de corrección: una revisión sin hallazgos sigue existiendo', () => {
    revisionesView(root);
    // Las 3 revisiones «sin novedad» no desaparecen del recuento ni de la vista; lo único
    // que cambia es que no aportan hallazgos.
    expect(root.textContent).toContain('5 registro(s)');
  });

  it('el criterio es el MISMO que consume Visitante (helper compartido)', () => {
    expect(obsFindings({ Observaciones: 'Sin novedad' })).toEqual([]);
    expect(obsFindings({ Observaciones: 'SIN NOVEDADES.' })).toEqual([]);
    expect(obsFindings({ Observaciones: 'Malla rota' })).toEqual(['Malla rota']);
    // Mezcla: se queda solo el hallazgo real.
    expect(obsFindings({ Observaciones: 'Sin novedad, malla rota' })).toEqual(['malla rota']);
  });
});
