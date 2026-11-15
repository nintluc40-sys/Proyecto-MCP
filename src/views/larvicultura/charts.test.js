/* ============================================================
   LARVICULTURA · lo que DICEN el radar y la evolución (punto 37 de la pauta del 12-11, usuario: «Lo que el gráfico dice»).
   `makeChart` se sustituye por uno que devuelve la configuración. Escala 0–100, MENOR = MEJOR. Cifras INVENTADAS.
   ============================================================ */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: (canvasId, config) => ({ canvasId, ...config }) }));
import { radarChart, evolutionChart } from './charts.js';
import { SEM } from './palette.js';
import { larviColor } from '../../core/format.js';
import { dayNum, rangeLabel } from '../../core/dates.js';

const VARS = [{ key: 'iv', short: 'Intestino', color: '#1E88E5' }, { key: 'def', short: 'Deformidad', color: '#8E5BD9' }, { key: 'hng', short: 'Hongos', color: '#FB8C00' }];

describe('radarChart · el último estado', () => {
  const last = { iv: 10, def: 60, hng: null };
  it('un vértice por variable; la que no tiene dato es un HUECO, no 0 (0 se leería como óptimo)', () => {
    const c = radarChart('cv', last, VARS);
    expect(c.type).toBe('radar');
    expect(c.data.labels).toEqual(['Intestino', 'Deformidad', 'Hongos']);
    expect(c.data.datasets[1].data).toEqual([10, 60, null]);
    expect(radarChart('cv', {}, VARS).data.datasets[1].data).toEqual([null, null, null]);
  });
  it('el polígono del límite óptimo (25) en cada vértice, punteado y sin relleno', () => {
    const lim = radarChart('cv', last, VARS).data.datasets[0];
    expect(lim).toMatchObject({ label: 'Límite óptimo', data: [25, 25, 25], fill: false });
    expect(lim.borderDash).toBeTruthy();
  });
  it('🔴 el relleno y el borde siguen al semáforo del diagnóstico (verde / ámbar / rojo)', () => {
    const de = (level) => radarChart('cv', last, VARS, { level }).data.datasets[1];
    expect([de('verde').borderColor, de('ambar').borderColor, de('rojo').borderColor]).toEqual([SEM.optimo, SEM.atencion, SEM.critico]);
    expect(de('rojo').backgroundColor.startsWith(SEM.critico)).toBe(true);
    expect(new Set(['verde', 'ambar', 'rojo'].map((l) => de(l).backgroundColor)).size).toBe(3);
    expect(radarChart('cv', last, VARS).data.datasets[1].borderColor, 'sin nivel, verde').toBe(SEM.optimo);
  });
  it('cada punto con el color de SU zona', () => {
    expect(radarChart('cv', last, VARS).data.datasets[1].pointBackgroundColor).toEqual([larviColor(10), larviColor(60), larviColor(null)]);
  });
  it('eje 0–100 de 25 en 25; bajo cada nombre, su valor (o «—»)', () => {
    const r = radarChart('cv', last, VARS).options.scales.r;
    expect([r.min, r.max, r.ticks.stepSize]).toEqual([0, 100, 25]);
    expect(r.pointLabels.callback('Intestino', 0)).toEqual(['Intestino', '10.0%']);
    expect(r.pointLabels.callback('Hongos', 2)).toEqual(['Hongos', '—']);
  });
  it('la ayuda: una sola, del estado actual, con TODAS las variables', () => {
    const t = radarChart('cv', last, VARS).options.plugins.tooltip;
    expect([t.filter({ datasetIndex: 1 }), t.filter({ datasetIndex: 0 })]).toEqual([true, false]);
    expect(t.callbacks.title()).toBe('Estado actual');
    expect(t.callbacks.label()).toEqual(['Intestino: 10.0%', 'Deformidad: 60.0%', 'Hongos: —']);
  });
});

describe('evolutionChart · la evolución diaria', () => {
  const daily = [
    { fecha: '30/09/2026', iv: null, def: null, hng: null },     // vacío al principio: no se arrastra
    { fecha: '01/10/2026', iv: 10, def: 20, hng: 5 },
    { fecha: '02/10/2026', iv: 14, def: null, hng: 5 },
    { fecha: '03/10/2026', iv: 12, def: 30, hng: 6 },
    { fecha: '04/10/2026', iv: null, def: null, hng: null },     // vacío al final: tampoco
  ];
  it('sólo los días con algún dato; una línea por variable, con su color', () => {
    const c = evolutionChart('cv', daily, VARS);
    expect(c.data.labels).toEqual(['01/10/2026', '02/10/2026', '03/10/2026']);
    expect(c.data.datasets.map((d) => d.borderColor)).toEqual(['#1E88E5', '#8E5BD9', '#FB8C00']);
    expect(c.data.datasets[1].data).toEqual([20, null, 30]);
  });
  it('🔴 la PEOR hoy (el último valor más alto: menor = mejor) se marca ⚠ y va más gruesa y delante', () => {
    const c = evolutionChart('cv', daily, VARS);
    const [iv, def, hng] = c.data.datasets;
    expect([iv.label, def.label, hng.label]).toEqual(['Intestino', 'Deformidad ⚠', 'Hongos']);
    expect(def.borderWidth).toBeGreaterThan(iv.borderWidth);
    expect([def.order, iv.order]).toEqual([0, 1]);
    // la peor se mide con el ÚLTIMO dato de cada una, no con el máximo: aquí Intestino acabó en 40
    const c2 = evolutionChart('cv', [...daily.slice(1, 4), { fecha: '04/10/2026', iv: 40, def: null, hng: null }], VARS);
    expect(c2.data.datasets.map((d) => d.label)).toEqual(['Intestino ⚠', 'Deformidad', 'Hongos']);
  });
  it('el eje Y se ajusta al rango real con margen (no 0–100 fijo), sin salirse de 0–100', () => {
    const y = evolutionChart('cv', daily, VARS).options.scales.y;
    expect([y.min, y.max]).toEqual([0, 37]);         // 5…30, margen máx(25 % del rango, 1,5) = 6,25
    expect(y.ticks.callback(20)).toBe('20%');
    const alto = evolutionChart('cv', [{ fecha: '01/10/2026', iv: 95, def: 99, hng: 97 }], VARS).options.scales.y;
    expect([alto.min, alto.max]).toEqual([93, 100]);
    const plano = evolutionChart('cv', [{ fecha: '01/10/2026', iv: 50, def: 50, hng: 50 }], VARS).options.scales.y;
    expect([plano.min, plano.max]).toEqual([48, 52]);
    const vacio = evolutionChart('cv', [], VARS).options.scales.y;
    expect([vacio.min, vacio.max], 'sin datos, 0–100').toEqual([0, 100]);
  });
  it('suavizada: media móvil de 3 puntos que respeta los huecos', () => {
    const c = evolutionChart('cv', daily, VARS, true);
    expect(c.data.datasets[0].data).toEqual([12, 12, 13]);           // (10+14)/2, (10+14+12)/3, (14+12)/2
    expect(c.data.datasets[1].data).toEqual([20, 25, 30]);           // el hueco del 02 se rellena con sus vecinos
    expect(c.data.datasets[0].tension).toBeGreaterThan(evolutionChart('cv', daily, VARS).data.datasets[0].tension);
  });
  it('el eje X: el número de día, y el mes de título', () => {
    const x = evolutionChart('cv', daily, VARS).options.scales.x;
    expect(x.ticks.callback(null, 0)).toBe(dayNum('01/10/2026'));
    expect(x.title).toMatchObject({ display: true, text: rangeLabel(daily.slice(1, 4)) });
    expect(evolutionChart('cv', [], VARS).options.scales.x.title.display, 'sin días, sin título').toBe(false);
  });
});
