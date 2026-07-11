import { describe, it, expect } from 'vitest';
import {
  isCalAguaRow, calEstado, calRangeText, calCtx, calValue, calMeasured, loadCalRanges,
  calEnsayoData, CAL_PARAMS, CAL_PARAM_BY_KEY,
  calExcursion, calSeverity, calSubIndex, calWQI, calRiskLevel, calGroupTree, calDiagnosis,
  controlStats, boxStats, calStageCmp,
} from './calagua.data.js';

const ph = CAL_PARAM_BY_KEY.ph;
const nitrito = CAL_PARAM_BY_KEY.nitrito;

describe('isCalAguaRow', () => {
  it('reconoce la hoja por _SheetOrigin (tolerante a acentos/espacios)', () => {
    expect(isCalAguaRow({ _SheetOrigin: 'Calidad de Agua' })).toBe(true);
    expect(isCalAguaRow({ _SheetOrigin: 'calidad de  agua' })).toBe(true);
    expect(isCalAguaRow({ _SheetOrigin: 'Microbiología' })).toBe(false);
    expect(isCalAguaRow(null)).toBe(false);
  });
});

describe('calEstado', () => {
  const R = { ph: { min: 7.5, max: 8.5 }, nitrito: { max: 0.2 }, alc: { min: 120 } };
  it('clasifica dentro/fuera por min y max', () => {
    expect(calEstado('ph', 8.0, R)).toBe('dentro');
    expect(calEstado('ph', 7.0, R)).toBe('fuera'); // < min
    expect(calEstado('ph', 9.0, R)).toBe('fuera'); // > max
    expect(calEstado('nitrito', 0.1, R)).toBe('dentro');
    expect(calEstado('nitrito', 0.5, R)).toBe('fuera'); // solo max
    expect(calEstado('alc', 100, R)).toBe('fuera'); // solo min
  });
  it('sin-rango si no hay rango o valor inválido', () => {
    expect(calEstado('temp', 25, R)).toBe('sin-rango'); // parámetro sin rango
    expect(calEstado('ph', null, R)).toBe('sin-rango');
    expect(calEstado('ph', NaN, R)).toBe('sin-rango');
  });
});

describe('calRangeText', () => {
  const R = { ph: { min: 7.5, max: 8.5 }, nitrito: { max: 0.2 }, alc: { min: 120 } };
  it('formatea el rango objetivo según min/max presentes', () => {
    expect(calRangeText('ph', R)).toBe('7.5–8.5');
    expect(calRangeText('nitrito', R)).toBe('≤0.2');
    expect(calRangeText('alc', R)).toBe('≥120');
    expect(calRangeText('temp', R)).toBe('');
  });
});

describe('calValue / calCtx', () => {
  const row = {
    _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Corrida: '580',
    Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Tipo de muestra': 'Agua',
    'Módulo': '3', 'Estadío': 'Z2', 'TQ/N°': '4',
    pH: '7,8', 'S‰': '32', Nitrito: '0.5',
  };
  it('lee valores numéricos tolerando coma decimal y alias', () => {
    expect(calValue(row, ph)).toBe(7.8); // "7,8" → 7.8
    expect(calValue(row, nitrito)).toBe(0.5);
  });
  it('extrae el contexto de la muestra', () => {
    const c = calCtx(row);
    expect(c.corrida).toBe('580');
    expect(c.depto).toBe('Larvicultura');
    expect(c.modulo).toBe('3');
    expect(c.tq).toBe('4');
    expect(c.fecha instanceof Date).toBe(true);
  });
});

describe('calMeasured', () => {
  it('devuelve solo parámetros con valor, con estado y rango', () => {
    const row = { pH: '8.0', Nitrito: '0.5', Temperatura: '' }; // temp vacío → excluido
    const meas = calMeasured(row, { ph: { min: 7.5, max: 8.5 }, nitrito: { max: 0.2 } });
    const byKey = Object.fromEntries(meas.map((m) => [m.key, m]));
    expect(meas.length).toBe(2); // pH + Nitrito (temp vacío no entra)
    expect(byKey.ph.estado).toBe('dentro');
    expect(byKey.nitrito.estado).toBe('fuera');
    expect(byKey.nitrito.range).toBe('≤0.2');
  });
});

describe('loadCalRanges', () => {
  it('devuelve los rangos base (sin overrides de localStorage)', () => {
    const R = loadCalRanges();
    expect(R.ph).toEqual({ min: 7.5, max: 8.5 });
    expect(R.nitrito).toEqual({ max: 0.2 });
    expect(R.potasio).toEqual({ min: 380, max: 420 });
  });
});

describe('calEnsayoData', () => {
  it('promedia antes/después por pareja y calcula delta y %', () => {
    const rows = [
      { 'S‰ antes': '30', 'S‰ después': '33', 'Calcio antes': '400', 'Calcio después': '440' },
      { 'S‰ antes': '32', 'S‰ después': '35' }, // sin calcio
    ];
    const data = calEnsayoData(rows);
    const byKey = Object.fromEntries(data.map((p) => [p.key, p]));
    expect(byKey.sal.antes).toBe(31); // (30+32)/2
    expect(byKey.sal.desp).toBe(34);  // (33+35)/2
    expect(byKey.sal.delta).toBe(3);
    expect(byKey.sal.pct).toBeCloseTo(9.677, 2); // 3/31*100
    expect(byKey.calcio.antes).toBe(400);
    expect(byKey.calcio.desp).toBe(440);
    // pH/Mg/K sin datos → no aparecen.
    expect(byKey.ph).toBeUndefined();
    expect(byKey.magnesio).toBeUndefined();
  });
  it('devuelve [] si no hay datos de ensayo', () => {
    expect(calEnsayoData([{ pH: '8.0' }])).toEqual([]);
  });
});

describe('CAL_PARAMS', () => {
  it('los 21 parámetros generales tienen encabezado exacto como primer alias', () => {
    expect(CAL_PARAMS.length).toBe(21);
    expect(ph.alias[0]).toBe('pH');
    expect(CAL_PARAM_BY_KEY.sal.alias[0]).toBe('S‰');
  });
});

describe('calExcursion', () => {
  const R = { ph: { min: 7.5, max: 8.5 }, nitrito: { max: 0.2 }, alc: { min: 120 } };
  it('rango de dos lados: 0 en el centro, 1 en el borde', () => {
    expect(calExcursion('ph', 8.0, R)).toBeCloseTo(0, 6);   // centro
    expect(calExcursion('ph', 8.5, R)).toBeCloseTo(1, 6);   // borde superior
    expect(calExcursion('ph', 9.0, R)).toBeCloseTo(2, 6);   // media franja fuera
  });
  it('solo techo: value/max', () => {
    expect(calExcursion('nitrito', 0.1, R)).toBeCloseTo(0.5, 6);
    expect(calExcursion('nitrito', 0.2, R)).toBeCloseTo(1, 6);
    expect(calExcursion('nitrito', 0.4, R)).toBeCloseTo(2, 6);
  });
  it('solo piso: min/value', () => {
    expect(calExcursion('alc', 120, R)).toBeCloseTo(1, 6);
    expect(calExcursion('alc', 240, R)).toBeCloseTo(0.5, 6); // por encima → mejor
    expect(calExcursion('alc', 60, R)).toBeCloseTo(2, 6);    // por debajo → peor
  });
  it('null sin rango o valor inválido', () => {
    expect(calExcursion('temp', 25, R)).toBe(null);
    expect(calExcursion('ph', null, R)).toBe(null);
  });
});

describe('calSeverity', () => {
  const R = { ph: { min: 7.5, max: 8.5 }, nitrito: { max: 0.2 } };
  it('4 niveles según la excursión', () => {
    expect(calSeverity('ph', 8.0, R)).toBe('optimo');       // e≈0
    expect(calSeverity('nitrito', 0.19, R)).toBe('vigilancia'); // e=0.95
    expect(calSeverity('nitrito', 0.3, R)).toBe('fuera');   // e=1.5
    expect(calSeverity('nitrito', 0.5, R)).toBe('critico'); // e=2.5
    expect(calSeverity('temp', 25, R)).toBe('sin-rango');
  });
});

describe('calSubIndex / calWQI', () => {
  const R = { ph: { min: 7.5, max: 8.5 }, nitrito: { max: 0.2 } };
  it('sub-índice 100 en TODO el rango (incl. el borde), decae fuera hasta 0 al duplicar', () => {
    expect(calSubIndex('ph', 8.0, R)).toBe(100);   // centro
    expect(calSubIndex('ph', 8.5, R)).toBe(100);   // borde, aún dentro → 100
    expect(calSubIndex('nitrito', 0.2, R)).toBe(100); // borde (e=1), dentro → 100
    expect(calSubIndex('nitrito', 0.3, R)).toBeCloseTo(50, 6); // e=1.5 → 50
    expect(calSubIndex('nitrito', 0.4, R)).toBeCloseTo(0, 6);  // e=2 → 0
  });
  it('WQI = media de sub-índices; punto todo en rango da 100', () => {
    expect(calWQI([{ key: 'ph', label: 'pH', value: 8.0 }, { key: 'nitrito', label: 'Nitrito', value: 0.2 }], R).wqi).toBe(100);
    const w = calWQI([{ key: 'ph', label: 'pH', value: 8.0 }, { key: 'nitrito', label: 'Nitrito', value: 0.3 }], R);
    expect(w.wqi).toBe(75); // media(100, 50)
    expect(w.worst.key).toBe('nitrito');
    expect(w.n).toBe(2);
  });
  it('WQI null si ningún parámetro tiene rango', () => {
    expect(calWQI([{ key: 'temp', label: 'Temp', value: 25 }], R).wqi).toBe(null);
  });
});

describe('calStageCmp', () => {
  it('ordena AS → Nauplio → Zoea → Mysis → PL, por número, y "(MB)" antes que la simple', () => {
    const input = ['Z1', 'M1', 'N5', 'PL2', 'N5 (MB)', 'AS', 'Z3', 'N6', 'PL10'];
    expect([...input].sort(calStageCmp)).toEqual(['AS', 'N5 (MB)', 'N5', 'N6', 'Z1', 'Z3', 'M1', 'PL2', 'PL10']);
  });
  it('los tokens desconocidos van al final', () => {
    expect(['Adulto', 'Z1', 'AS'].sort(calStageCmp)).toEqual(['AS', 'Z1', 'Adulto']);
  });
});

describe('calRiskLevel', () => {
  it('toma la peor severidad presente', () => {
    expect(calRiskLevel(['optimo', 'critico', 'fuera'])).toBe('critico');
    expect(calRiskLevel(['optimo', 'fuera'])).toBe('alto');
    expect(calRiskLevel(['optimo', 'vigilancia'])).toBe('medio');
    expect(calRiskLevel(['optimo', 'optimo'])).toBe('bajo');
    expect(calRiskLevel([])).toBe('sin-datos');
  });
});

describe('controlStats', () => {
  it('media y límites ±3σ (σ poblacional)', () => {
    const c = controlStats([2, 4, 4, 4, 5, 5, 7, 9]); // media 5, σ=2
    expect(c.mean).toBe(5);
    expect(c.sd).toBeCloseTo(2, 6);
    expect(c.ucl).toBeCloseTo(11, 6);
    expect(c.lcl).toBeCloseTo(-1, 6);
    expect(c.n).toBe(8);
  });
  it('null si no hay valores', () => { expect(controlStats([])).toBe(null); });
});

describe('boxStats', () => {
  it('cuartiles, bigotes y atípicos', () => {
    const b = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]); // 100 = atípico
    expect(b.med).toBeCloseTo(5.5, 6);
    expect(b.min).toBe(1);
    expect(b.max).toBe(100);
    expect(b.outliers).toContain(100);
    expect(b.whiskHi).toBeLessThan(100); // el bigote no llega al atípico
    expect(b.n).toBe(10);
  });
  it('null si no hay valores', () => { expect(boxStats([])).toBe(null); });
});

describe('calGroupTree / calDiagnosis', () => {
  const R = { ph: { min: 7.5, max: 8.5 }, nitrito: { max: 0.2 } };
  const mk = (modulo, tq, ph, nitrito, fecha) => ({
    ctx: { modulo, tq, fecha: new Date(fecha) },
    meas: calMeasured({ pH: String(ph), Nitrito: String(nitrito) }, R),
  });
  const samples = [
    mk('3', '1', 8.0, 0.1, '2026-06-05'), // M3/TQ1 sano
    mk('3', '2', 8.0, 0.5, '2026-06-06'), // M3/TQ2 nitrito crítico
    mk('4', '1', 7.0, 0.1, '2026-06-07'), // M4/TQ1 pH fuera
  ];
  it('agrupa Módulo → Tanque con riesgo y WQI', () => {
    const tree = calGroupTree(samples, R);
    expect(tree.length).toBe(2); // Módulo 3 y Módulo 4
    const m3 = tree.find((m) => m.label === 'Módulo 3');
    expect(m3.tanks.length).toBe(2);
    expect(m3.risk).toBe('critico'); // arrastra el TQ2 crítico
    // ordenado con mayor riesgo primero dentro del módulo
    expect(m3.tanks[0].risk).toBe('critico');
    expect(m3.tanks[0].crit).toContain('Nitrito');
  });
  it('diagnóstico resume tanques en riesgo y top parámetros', () => {
    const d = calDiagnosis(samples, R);
    expect(d.total).toBe(3);
    expect(typeof d.wqi).toBe('number');
    expect(d.riskTanks.length).toBe(2); // TQ2 (crítico) + M4/TQ1 (alto)
    expect(d.topParams.length).toBeGreaterThan(0);
  });
});
