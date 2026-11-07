// @vitest-environment happy-dom
/* ============================================================
   A24 (2026-11-07, usuario: «Sí, los tres») · EL PRONÓSTICO DEL TANQUE, POR DÍAS DE CALENDARIO

   La recta contaba REGISTROS: con conteos separados por días distintos, «Pob. +7d» eran siete registros, no siete días.
   Ahora sigue la regla común (core/proyeccion.js), la misma que Larvicultura. Se abre el modal de verdad; el gráfico se
   sustituye (sin lienzo en las pruebas). Datos ficticios.
   ============================================================ */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../core/charts.js', async (original) => ({ ...(await original()), makeChart: () => null, destroyChart: () => {} }));
const { store } = await import('../../core/store.js');
const { buildContext } = await import('./stats.js');
const { renderTank } = await import('./tank.js');
const { diasDesde, proyeccionSinSubir } = await import('../../core/proyeccion.js');

const row = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', Tanque: '1', ...o });

describe('A24 · el pronóstico del tanque', () => {
  it('🔴 «Pob. +7d» cuenta días, no registros', async () => {
    const fechas = ['2026-06-01', '2026-06-02', '2026-06-10'];
    const pobs = [1000000, 990000, 910000];
    store.globalData = fechas.map((f, i) => row({ Fecha: f, 'Población': String(pobs[i]), 'Estadío': 'Z3' }));
    store.dateFrom = null;
    store.dateTo = null;
    const ctx = buildContext({ corrida: null });
    ctx.vState = { corrida: null };
    const { html, after } = renderTank(ctx, 'M01', '1');
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = html;
    after(root, ctx);
    root.querySelector('[data-forecast-open]').click();
    await new Promise((r) => setTimeout(r, 50));   // el modal dibuja en el siguiente cuadro
    const kpis = root.querySelector('#svForecastKpis').textContent;
    const esperado = Math.round(proyeccionSinSubir(diasDesde(fechas), pobs, 7).future[6]).toLocaleString('es-EC');
    const porRegistro = Math.round(910000 - 45000 * 7).toLocaleString('es-EC');
    expect(esperado).not.toBe(porRegistro);   // el caso distingue
    expect(kpis).toContain(esperado + 'Pob. +7d');
  });

  /* Revisión de la B (07-11) · la proyección parte del ÚLTIMO DÍA DEL GRÁFICO aunque ese día no traiga conteo de
     población (sólo calidad, por ejemplo). Partía del último conteo, y «+7d» se quedaba corto. */
  it('🔴 «+7d» se cuenta desde el último día del gráfico, aunque ese día no haya conteo', async () => {
    const fechas = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-08'];
    const pobs = [1000000, 990000, 980000, null];   // el 08/06 sólo trae estadío
    store.globalData = fechas.map((f, i) => row(pobs[i] === null ? { Fecha: f, 'Estadío': 'M1' } : { Fecha: f, 'Población': String(pobs[i]), 'Estadío': 'Z3' }));
    store.dateFrom = null;
    store.dateTo = null;
    const ctx = buildContext({ corrida: null });
    ctx.vState = { corrida: null };
    const { html, after } = renderTank(ctx, 'M01', '1');
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = html;
    after(root, ctx);
    root.querySelector('[data-forecast-open]').click();
    await new Promise((r) => setTimeout(r, 50));
    const kpis = root.querySelector('#svForecastKpis').textContent;
    const xs = diasDesde(fechas);
    const desdeElUltimoDia = Math.round(proyeccionSinSubir(xs, pobs, 7, xs[3]).future[6]).toLocaleString('es-EC');
    const desdeElUltimoConteo = Math.round(proyeccionSinSubir(xs, pobs, 7).future[6]).toLocaleString('es-EC');
    expect(desdeElUltimoDia).not.toBe(desdeElUltimoConteo);   // el caso distingue
    expect(kpis).toContain(desdeElUltimoDia + 'Pob. +7d');
  });
});
