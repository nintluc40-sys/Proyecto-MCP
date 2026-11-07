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
});
