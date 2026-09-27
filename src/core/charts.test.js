// @vitest-environment happy-dom
/* ============================================================
   CHART.JS · el lugar del globo «arribaJunto» (0q·2, 2026-09-27, usuario)

   Maduración Operativo: el globo de un gráfico en modo «index» se colocaba en la altura MEDIA de sus elementos y saltaba
   arriba y abajo de un día al siguiente, tapando lo que se leía. «arribaJunto» lo fija ARRIBA del área de datos y al LADO
   del día (a su derecha si cabe; si no, a su izquierda), centrado en su propia altura: sólo se mueve de lado.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { Tooltip } from 'chart.js';
import './charts.js';

const pos = (yo, x) => Tooltip.positioners.arribaJunto.call(yo, x == null ? [] : [{ element: { x } }, { element: { x, y: 999 } }]);
const AREA = { top: 30, bottom: 230, left: 40, right: 600 };

describe('Chart.js · el globo arribaJunto', () => {
  it('🔴 existe como lugar con nombre', () => {
    expect(typeof Tooltip.positioners.arribaJunto).toBe('function');
  });
  it('🔴 a la DERECHA del día, arriba y centrado en su altura, cuando cabe', () => {
    expect(pos({ chart: { chartArea: AREA }, width: 150, height: 64 }, 100)).toEqual({ x: 100, y: 62, xAlign: 'left', yAlign: 'center' });
  });
  it('🔴 a la IZQUIERDA cuando no cabe a la derecha', () => {
    expect(pos({ chart: { chartArea: AREA }, width: 150, height: 64 }, 450)).toEqual({ x: 450, y: 62, xAlign: 'right', yAlign: 'center' });
    expect(pos({ chart: { chartArea: AREA }, width: 150, height: 64 }, 442).xAlign).toBe('left');
  });
  it('🔴 la altura no depende de los datos del día (la y de los elementos no cuenta)', () => {
    const a = pos({ chart: { chartArea: AREA }, width: 150, height: 64 }, 100);
    const b = Tooltip.positioners.arribaJunto.call({ chart: { chartArea: AREA }, width: 150, height: 64 }, [{ element: { x: 100, y: 5 } }]);
    expect(b).toEqual(a);
  });
  it('🔑 la primera vez (sin medidas aún) no se sale por arriba', () => {
    const r = pos({ chart: { chartArea: AREA }, width: 0, height: 0 }, 100);
    expect(r.y).toBeGreaterThanOrEqual(AREA.top + 30);
  });
  it('🔑 sin día activo, nada', () => {
    expect(pos({ chart: { chartArea: AREA }, width: 150, height: 64 })).toBe(false);
  });
});
