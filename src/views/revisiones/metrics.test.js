/* ============================================================
   REVISIONES · registro de variables cuantitativas (capa pura)

   Lo que estas pruebas protegen es la razón de existir del registro: que las CINCO
   consumidoras (KPIs, 3 gráficos por día, tendencia, ficha de detalle y comparativa)
   recorran la MISMA lista. Antes eran cinco listas a mano y «% No viables» ya se había
   quedado fuera de la comparativa.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  QUANT, QUANT_KEYS, KPI_ORDER, CHART_SERIES, chartKeys,
  hasQuant, hasChartData, quantAvg, quantDaySeries, pctAxisMax,
} from './metrics.js';

const R = (o) => ({ _SheetOrigin: 'Registro_Supervision', ...o });

describe('revisiones · integridad del registro', () => {
  it('KPI_ORDER y el registro cubren exactamente las mismas variables', () => {
    expect([...KPI_ORDER].sort()).toEqual(Object.keys(QUANT).sort());
  });

  it('cada variable tiene alias, rótulos y color', () => {
    KPI_ORDER.forEach((id) => {
      const v = QUANT[id];
      expect(Array.isArray(v.keys) && v.keys.length).toBeTruthy();
      expect(v.keys).toBe(QUANT_KEYS[id]);          // misma REFERENCIA: no hay copia que divergir
      [v.icon, v.kpi, v.serie, v.corta].forEach((s) => expect(typeof s === 'string' && s).toBeTruthy());
      expect(v.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('los 3 gráficos reparten TODAS las variables, sin repetir ninguna', () => {
    const todas = [...CHART_SERIES.morf, ...CHART_SERIES.alim, ...CHART_SERIES.cond];
    expect(todas.sort()).toEqual([...KPI_ORDER].sort());   // ninguna se queda sin gráfico
    expect(new Set(todas).size).toBe(todas.length);        // ni aparece en dos
  });

  it('las 3 nuevas del AsT van juntas en «cond» y son opcionales', () => {
    expect(CHART_SERIES.cond).toEqual(['flacidez', 'necrosis', 'disparidad']);
    ['flacidez', 'necrosis', 'disparidad'].forEach((id) => expect(QUANT[id].optional).toBe(true));
  });

  it('las 3 originales NO son opcionales (se mostraban siempre)', () => {
    ['deformidad', 'atraso', 'protusion'].forEach((id) => expect(QUANT[id].optional).toBe(false));
  });

  it('el orden de «morf» y «alim» es el de antes (decide el color de la paleta)', () => {
    expect(CHART_SERIES.morf).toEqual(['atraso', 'protusion', 'deformidad', 'noviables']);
    expect(CHART_SERIES.alim).toEqual(['semillenas', 'vacias']);
  });

  it('chartKeys devuelve los alias de cada serie del grupo', () => {
    expect(chartKeys('cond')).toEqual([QUANT_KEYS.flacidez, QUANT_KEYS.necrosis, QUANT_KEYS.disparidad]);
  });
});

describe('revisiones · lectura de las columnas nuevas', () => {
  it('lee la cabecera exacta que escribe el AsT', () => {
    const rows = [R({ Fecha: '05/06/2026', Flacidez: '7', Necrosis: '8', Disparidad: '9' })];
    expect(quantAvg(rows, 'flacidez')).toBe(7);
    expect(quantAvg(rows, 'necrosis')).toBe(8);
    expect(quantAvg(rows, 'disparidad')).toBe(9);
  });

  it('tolera las variantes con % y en minúscula', () => {
    expect(quantAvg([R({ '% Flacidez': '4' })], 'flacidez')).toBe(4);
    expect(quantAvg([R({ 'Necrosis (%)': '5' })], 'necrosis')).toBe(5);
    expect(quantAvg([R({ disparidad: '6' })], 'disparidad')).toBe(6);
  });

  it('la coma decimal llega como número', () => {
    expect(quantAvg([R({ Flacidez: '2,5' })], 'flacidez')).toBe(2.5);
  });

  it('sin dato el promedio es null (y NO 0: el 0 es un valor real)', () => {
    expect(quantAvg([R({ Fecha: '05/06/2026' })], 'flacidez')).toBe(null);
    expect(quantAvg([R({ Flacidez: '0' })], 'flacidez')).toBe(0);
  });

  it('hasQuant / hasChartData distinguen «vacío» de «cero»', () => {
    expect(hasQuant([R({})], 'flacidez')).toBe(false);
    expect(hasQuant([R({ Flacidez: '0' })], 'flacidez')).toBe(true);
    expect(hasChartData([R({})], 'cond')).toBe(false);
    // Basta UNA de las tres para dibujar el gráfico del grupo.
    expect(hasChartData([R({ Necrosis: '3' })], 'cond')).toBe(true);
  });
});

describe('revisiones · serie diaria', () => {
  const rows = [
    R({ Fecha: '05/06/2026', Flacidez: '10' }),
    R({ Fecha: '05/06/2026', Flacidez: '20' }),   // mismo día → promedia
    R({ Fecha: '07/06/2026', Flacidez: '0' }),    // cero REAL
    R({ Fecha: '08/06/2026' }),                   // día sin dato
  ];

  it('promedia por día y deja los días sin dato en null, no en 0', () => {
    const days = ['05/06/2026', '06/06/2026', '07/06/2026', '08/06/2026'];
    // 06 no existe en los datos y 08 existe pero sin la columna: ambos null.
    expect(quantDaySeries(rows, 'flacidez', days)).toEqual([15, null, 0, null]);
  });

  it('respeta el orden de los días que recibe', () => {
    expect(quantDaySeries(rows, 'flacidez', ['07/06/2026', '05/06/2026'])).toEqual([0, 15]);
  });

  it('sólo mira las filas que se le pasan (así hereda los filtros de la vista)', () => {
    const soloUno = rows.filter((r) => r.Fecha === '05/06/2026').slice(0, 1);
    expect(quantDaySeries(soloUno, 'flacidez', ['05/06/2026'])).toEqual([10]);
  });
});

describe('revisiones · techo del eje Y (pctAxisMax)', () => {
  it('con valores BAJOS el eje se ajusta en vez de quedarse en 100', () => {
    // El motivo del cambio: con el 0–100 fijo, una serie de 2–3 % era una raya pegada
    // al suelo y el 97 % del alto del gráfico sobraba.
    expect(pctAxisMax([2, 2.3, 1.8])).toBe(3);
    expect(pctAxisMax([6, 5.2, 4.9])).toBe(8);
    expect(pctAxisMax([0.3, 0.4])).toBe(1);
  });

  it('deja holgura sobre el pico: el máximo nunca toca el borde', () => {
    [[2, 2.3], [6], [12, 9], [45]].forEach((serie) => {
      const techo = pctAxisMax(serie);
      expect(techo).toBeGreaterThan(Math.max(...serie));
    });
  });

  it('redondea a pasos legibles según la magnitud', () => {
    expect(pctAxisMax([12])).toBe(16);     // paso 2
    expect(pctAxisMax([30])).toBe(40);     // paso 5
    expect(pctAxisMax([70])).toBe(90);     // paso 10
  });

  it('no deja aire por encima del 100 % cuando el dato cabe debajo', () => {
    expect(pctAxisMax([95])).toBe(100);
    expect(pctAxisMax([100])).toBe(100);
  });

  it('pero si el dato PASA de 100 (hoja sucia) lo muestra en vez de recortarlo', () => {
    expect(pctAxisMax([130])).toBeGreaterThanOrEqual(130);
  });

  it('una serie vacía, toda nula o toda en 0 devuelve un eje 0–5 usable', () => {
    expect(pctAxisMax([])).toBe(5);
    expect(pctAxisMax([null, null])).toBe(5);
    expect(pctAxisMax([0, 0])).toBe(5);
  });

  it('ignora los huecos (null) al calcular el máximo', () => {
    expect(pctAxisMax([null, 2, null, 3])).toBe(pctAxisMax([2, 3]));
  });
});
