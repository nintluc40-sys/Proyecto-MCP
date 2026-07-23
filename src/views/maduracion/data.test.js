import { describe, it, expect } from 'vitest';
import {
  buildReproModel, makeFilter, kpis, locationStats, femaleRanking, femaleHistory,
  neverSpawned, recoveryDistribution, stateDistribution, mortalityBreakdown, trends,
  salasOf, tanquesOf, intervalsOf, monthLabel, locKey, classifyFemale,
} from './data.js';

// ── Fixtures ──────────────────────────────────────────────
const matriz = [
  { 'Trovan ID': 'A1', 'Número': '1', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01', Lote: 'L1' },
  { 'Trovan ID': 'A2', 'Número': '2', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' },
  { 'Trovan ID': 'A3', 'Número': '3', 'Sala actual': 'S1', 'Tanque actual': 'T2', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' },
  { 'Trovan ID': 'A4', 'Número': '4', 'Sala actual': 'S2', 'Tanque actual': 'T3', Estado: 'Muerto', 'Fecha ingreso': '2026-05-01', 'Fecha muerte': '2026-06-20' },
  { 'Trovan ID': 'A5', 'Número': '5', 'Sala actual': 'S2', 'Tanque actual': 'T3', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' }, // nunca desova
];
// La Bitácora REAL solo trae Trovan/Fecha/Tipo — la ubicación se deriva por Trovan.
const bitacora = [
  { 'Trovan ID': 'A1', Fecha: '2026-06-01', Tipo: 'Desove' },   // A1 → MATRIZ T1
  { 'Trovan ID': 'A1', Fecha: '2026-06-11', Tipo: 'Desove' },
  { 'Trovan ID': 'A1', Fecha: '2026-06-16', Tipo: 'Desove' },
  { 'Trovan ID': 'A2', Fecha: '2026-06-05', Tipo: 'Desove' },   // A2 → MATRIZ T1
  { 'Trovan ID': 'A3', Fecha: '2026-06-10', Tipo: 'Desove' },   // A3 → derivado (T2, antes de su transferencia)
  { 'Trovan ID': 'A4', Fecha: '2026-06-20', Tipo: 'Mortalidad' }, // A4 → MATRIZ T3
];
const transfer = [
  { 'TR-ID': 'TR-000001', Fecha: '2026-06-18', Tipo: 'Traslado', 'Trovan ID': 'A3', 'Sala origen': 'S1', 'Tanque origen': 'T2', 'Sala destino': 'S1', 'Tanque destino': 'T2b' },
];

const model = buildReproModel(matriz, bitacora, transfer);
const all = makeFilter({});

describe('maduracion.data · modelo', () => {
  it('normaliza females, desoves, mortalidades y movimientos', () => {
    expect(model.females.length).toBe(5);
    expect(model.desoves.length).toBe(5);
    expect(model.mortalidades.length).toBe(1);
    expect(model.movimientos.length).toBe(1);
    expect(model.months).toEqual(['2026-06']);
    expect(model.dataMaxDate.getFullYear()).toBe(2026);
  });
});

describe('maduracion.data · KPIs', () => {
  it('cuenta hembras, vivas/muertas, desoves, fertilidad global', () => {
    const k = kpis(model, all);
    expect(k.totalHembras).toBe(5);
    expect(k.vivas).toBe(4);
    expect(k.muertas).toBe(1);
    expect(k.desoves).toBe(5);
    expect(k.mortalidad).toBe(1);
    expect(k.spawners).toBe(3);          // A1, A2, A3
    // 3 de 4 vivas han desovado → 75%.
    expect(Math.round(k.fertilidadGlobal)).toBe(75);
  });

  it('respeta el filtro de sala', () => {
    const k = kpis(model, makeFilter({ sala: 'S1' }));
    expect(k.desoves).toBe(5);
    expect(k.mortalidad).toBe(0);        // la mortalidad fue en S2
  });

  it('la fertilidad global NUNCA supera 100 % (numerador = vivas que han desovado, no eventos históricos)', () => {
    // T1: 3 hembras desovaron ahí; 2 murieron. Vivas en T1 = 1 (y esa desovó).
    const m2 = buildReproModel(
      [
        { 'Trovan ID': 'B1', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' },
        { 'Trovan ID': 'B2', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Muerto', 'Fecha ingreso': '2026-05-01', 'Fecha muerte': '2026-06-30' },
        { 'Trovan ID': 'B3', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Muerto', 'Fecha ingreso': '2026-05-01', 'Fecha muerte': '2026-06-30' },
      ],
      [
        { 'Trovan ID': 'B1', Fecha: '2026-06-01', Tipo: 'Desove' },
        { 'Trovan ID': 'B2', Fecha: '2026-06-02', Tipo: 'Desove' },
        { 'Trovan ID': 'B3', Fecha: '2026-06-03', Tipo: 'Desove' },
      ],
      [],
    );
    const k = kpis(m2, makeFilter({ tanque: 'T1' }));
    expect(k.vivas).toBe(1);
    expect(k.fertilidadGlobal).toBe(100); // 1 viva, desovó → 100 % (con el bug daba 300 %)
    // Coincide con el complemento de neverSpawned (0 vivas sin desovar en T1).
    expect(neverSpawned(m2, makeFilter({ tanque: 'T1' })).length).toBe(0);
  });
});

describe('maduracion.data · producción por ubicación', () => {
  it('agrupa por tanque con fertilidad y eficiencia', () => {
    const stats = locationStats(model, all, 'tanque');
    const t1 = stats.find((s) => s.key === 'T1');
    expect(t1.desoves).toBe(4);          // A1×3 + A2×1
    expect(t1.spawners).toBe(2);         // A1, A2
    expect(t1.hembras).toBe(2);          // ocupantes vivas T1 = A1,A2
    expect(Math.round(t1.fertilidad)).toBe(100);
    expect(t1.eficiencia).toBe(2);       // 4 desoves / 2 hembras
    // Ordenado por desoves desc → T1 primero.
    expect(stats[0].key).toBe('T1');
  });

  it('agrupa por sala', () => {
    const salas = locationStats(model, all, 'sala');
    const s1 = salas.find((s) => s.key === 'S1');
    expect(s1.desoves).toBe(5);
  });
});

describe('maduracion.data · ranking e historial de hembras', () => {
  it('ordena hembras por desoves', () => {
    const rk = femaleRanking(model, all);
    expect(rk[0].trovan).toBe('A1');
    expect(rk[0].desoves).toBe(3);
    expect(Math.round(rk[0].intervaloPromedio)).toBe(8);  // (10+5)/2 = 7.5 ≈ 8
  });

  it('historial completo de una hembra (all-time)', () => {
    const h = femaleHistory(model, 'A1');
    expect(h.totalDesoves).toBe(3);
    expect(h.intervals).toEqual([10, 5]);
    expect(h.intervaloMin).toBe(5);
    expect(h.intervaloMax).toBe(10);
    expect(h.rec.sala).toBe('S1');
  });

  it('intervalsOf calcula diferencias en días', () => {
    const d = [new Date(2026, 5, 1), new Date(2026, 5, 11), new Date(2026, 5, 16)];
    expect(intervalsOf(d)).toEqual([10, 5]);
  });
});

describe('maduracion.data · nunca desovaron', () => {
  it('lista hembras vivas sin desoves', () => {
    const never = neverSpawned(model, all);
    expect(never.map((r) => r.trovan)).toEqual(['A5']);   // A4 está muerta → excluida
  });
});

describe('maduracion.data · intervalos de recuperación', () => {
  it('agrega intervalos y arma histograma', () => {
    const rec = recoveryDistribution(model, all);
    expect(rec.intervals.sort((a, b) => a - b)).toEqual([5, 10]);
    expect(rec.hembrasConIntervalo).toBe(1);              // solo A1 tiene ≥2 desoves
    expect(rec.bins.reduce((s, b) => s + b.n, 0)).toBe(2);
  });
});

describe('maduracion.data · distribución de estados', () => {
  it('clasifica fallecida/transferida/activa/inactiva', () => {
    const sd = stateDistribution(model, all);
    expect(sd.fallecida).toBe(1);                          // A4
    // A1, A2 y A3 desovaron en junio (dentro de ventana) → activas. A3 ADEMÁS fue
    // transferida el 18/06, pero producir pesa más que reubicar: 'activa' tiene
    // precedencia (antes salía 'transferida' y su desove desaparecía del recuento).
    expect(sd.activa).toBe(3);
    // Nadie queda como 'transferida': la única reubicada de la ventana también desovó.
    expect(sd.transferida).toBe(0);
    // A5 viva, sin desove, sin transferencia → inactiva.
    expect(sd.inactiva).toBe(1);
    expect(sd.activa + sd.inactiva + sd.transferida + sd.fallecida).toBe(5);
  });

  it("'transferida' sigue existiendo para la reubicada que NO desovó en la ventana", () => {
    const m = buildReproModel(
      [{ 'Trovan ID': 'T9', 'Sala actual': 'S1', 'Tanque actual': 'T2', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' }],
      [{ 'Trovan ID': 'T9', Fecha: '2026-06-20', Tipo: 'Mortalidad' }],   // ancla la referencia sin ser desove
      [{ 'TR-ID': 'TR-1', Fecha: '2026-06-18', Tipo: 'Traslado', 'Trovan ID': 'T9', 'Sala origen': 'S1', 'Tanque origen': 'T1', 'Sala destino': 'S1', 'Tanque destino': 'T2' }],
    );
    expect(classifyFemale(m.byTrovan.get('T9'), m, m.dataMaxDate)).toBe('transferida');
  });
});

describe('maduracion.data · mortalidad y tendencias', () => {
  it('desglosa mortalidad por sala y tanque', () => {
    const m = mortalityBreakdown(model, all);
    expect(m.total).toBe(1);
    expect(m.porSala[0]).toEqual({ key: 'S2', n: 1 });
  });

  it('tendencias mensuales devuelven series alineadas', () => {
    const tr = trends(model, all, 'month');
    expect(tr.labels.length).toBe(tr.desoves.length);
    expect(tr.desoves.reduce((a, b) => a + b, 0)).toBe(5);
    expect(tr.mortalidad.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('la fertilidad de tendencias NUNCA supera 100 % aunque las desovadoras se hayan trasladado', () => {
    // 3 hembras desovan en T1 en junio y DESPUÉS se van a T9; en T1 solo queda X4.
    // Numerador por snapshot del evento (3) ÷ denominador por ubicación actual (1) = 300 %.
    const F = (t, tq) => ({ 'Trovan ID': t, 'Sala actual': 'S1', 'Tanque actual': tq, Estado: 'Vivo', 'Fecha ingreso': '2026-01-01' });
    const m = buildReproModel(
      [F('X1', 'T9'), F('X2', 'T9'), F('X3', 'T9'), F('X4', 'T1')],
      [
        { 'Trovan ID': 'X1', Fecha: '2026-06-05', Tipo: 'Desove' },
        { 'Trovan ID': 'X2', Fecha: '2026-06-06', Tipo: 'Desove' },
        { 'Trovan ID': 'X3', Fecha: '2026-06-07', Tipo: 'Desove' },
      ],
      ['X1', 'X2', 'X3'].map((t, i) => ({ 'TR-ID': 'TR' + i, Fecha: '2026-06-20', Tipo: 'Traslado', 'Trovan ID': t, 'Sala origen': 'S1', 'Tanque origen': 'T1', 'Sala destino': 'S1', 'Tanque destino': 'T9' })),
    );
    const tr = trends(m, makeFilter({ sala: 'S1', tanque: 'T1' }), 'month');
    tr.fertilidad.forEach((v) => expect(v).toBeLessThanOrEqual(100));
    // Las barras SÍ cuentan los 3 desoves donde ocurrieron (asimetría documentada en la
    // nota al pie del gráfico): ninguna de las que siguen en T1 desovó → 0 %.
    expect(tr.desoves.reduce((a, b) => a + b, 0)).toBe(3);
    expect(tr.fertilidad).toEqual([0]);
  });

  it('sin traslados, la fertilidad de tendencias NO cambia respecto al cálculo directo', () => {
    // Caso normal: cada desovadora sigue donde desovó → el acotado no debe alterar nada.
    const F = (t) => ({ 'Trovan ID': t, 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-01-01' });
    const m = buildReproModel(
      [F('N1'), F('N2'), F('N3'), F('N4')],
      [
        { 'Trovan ID': 'N1', Fecha: '2026-06-05', Tipo: 'Desove' },
        { 'Trovan ID': 'N2', Fecha: '2026-06-06', Tipo: 'Desove' },
      ],
      [],
    );
    const tr = trends(m, makeFilter({ sala: 'S1', tanque: 'T1' }), 'month');
    expect(tr.fertilidad).toEqual([50]);   // 2 desovadoras de 4 vivas
  });
});

describe('maduracion.data · calidad del dato de origen', () => {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hace = (n) => iso(new Date(Date.now() - n * 86400000));
  const matriz2 = [
    { 'Trovan ID': 'Y1', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-01-01' },
    { 'Trovan ID': 'Y2', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-01-01' },
  ];

  it('una fecha futura (año mal tecleado) NO arrastra la ventana de actividad', () => {
    const sano = buildReproModel(matriz2, [{ 'Trovan ID': 'Y1', Fecha: hace(10), Tipo: 'Desove' }], []);
    expect(stateDistribution(sano, {}).activa).toBe(1);
    // El MISMO dato + una fila con el año tecleado como 2062: antes dataMaxDate se iba a
    // 2062, la ventana de 45 días con él, y Y1 (que desovó hace 10 días) salía inactiva.
    const conTypo = buildReproModel(matriz2, [
      { 'Trovan ID': 'Y1', Fecha: hace(10), Tipo: 'Desove' },
      { 'Trovan ID': 'Y2', Fecha: '2062-06-01', Tipo: 'Mortalidad' },
    ], []);
    expect(stateDistribution(conTypo, {}).activa).toBe(1);
    expect(conTypo.dataMaxDate.getFullYear()).toBeLessThan(2062);
    expect(conTypo.futureEvents.length).toBe(1);
    expect(conTypo.futureEvents[0].trovan).toBe('Y2');
  });

  it('sin fechas futuras, futureEvents queda vacío', () => {
    const m = buildReproModel(matriz2, [{ 'Trovan ID': 'Y1', Fecha: hace(3), Tipo: 'Desove' }], []);
    expect(m.futureEvents).toEqual([]);
  });

  it('reporta los Trovan repetidos en MATRIZ (antes se descartaban en silencio)', () => {
    const m = buildReproModel([
      { 'Trovan ID': 'Z1', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo' },
      { 'Trovan ID': 'Z1', 'Sala actual': 'S2', 'Tanque actual': 'T5', Estado: 'Vivo' },
      { 'Trovan ID': 'Z2', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo' },
    ], [], []);
    expect(m.females.length).toBe(2);              // se conserva la PRIMERA de cada Trovan
    expect(m.byTrovan.get('Z1').tanque).toBe('T1');
    expect(m.duplicateTrovans).toEqual(['Z1']);
  });

  it('sin repetidos, duplicateTrovans queda vacío', () => {
    expect(model.duplicateTrovans).toEqual([]);
  });
});

describe('maduracion.data · derivación de ubicación por Trovan (Bitácora sin Sala/Tanque)', () => {
  it('sin transferencias, atribuye el desove a la ubicación de la MATRIZ', () => {
    const m = buildReproModel(
      [{ 'Trovan ID': 'B1', 'Sala actual': 'S9', 'Tanque actual': 'T9', Estado: 'Vivo' }],
      [{ 'Trovan ID': 'B1', Fecha: '2026-06-05', Tipo: 'Desove' }],
      [],
    );
    expect(m.desoves[0].sala).toBe('S9');
    expect(m.desoves[0].tanque).toBe('T9');
    const stats = locationStats(m, makeFilter({}), 'tanque');
    expect(stats[0].key).toBe('T9');
    expect(stats[0].desoves).toBe(1);
  });

  it('con transferencia, reconstruye la ubicación vigente a la fecha del evento', () => {
    // B2 vive en T-nuevo (MATRIZ), transferida de T-viejo→T-nuevo el 10/06.
    const m = buildReproModel(
      [{ 'Trovan ID': 'B2', 'Sala actual': 'S1', 'Tanque actual': 'T-nuevo', Estado: 'Vivo' }],
      [
        { 'Trovan ID': 'B2', Fecha: '2026-06-05', Tipo: 'Desove' }, // ANTES de la transferencia → T-viejo
        { 'Trovan ID': 'B2', Fecha: '2026-06-15', Tipo: 'Desove' }, // DESPUÉS → T-nuevo
      ],
      [{ 'TR-ID': 'TR-000001', Fecha: '2026-06-10', Tipo: 'Traslado', 'Trovan ID': 'B2', 'Sala origen': 'S1', 'Tanque origen': 'T-viejo', 'Sala destino': 'S1', 'Tanque destino': 'T-nuevo' }],
    );
    const byDate = [...m.desoves].sort((a, b) => a.date - b.date);
    expect(byDate[0].tanque).toBe('T-viejo');   // evento previo a la transferencia
    expect(byDate[1].tanque).toBe('T-nuevo');   // evento posterior
  });

  it('cruza el Trovan sin importar mayúsculas/minúsculas (caso mixto legado)', () => {
    // MATRIZ en mayúsculas (write-side actual) vs Bitácora/Transferencia en minúsculas
    // (fila legada antes de que la captura forzara mayúsculas). Deben cruzar igual.
    const m = buildReproModel(
      [{ 'Trovan ID': 'ABC123DEF0', 'Sala actual': 'S1', 'Tanque actual': 'T5', Estado: 'Vivo' }],
      [{ 'Trovan ID': 'abc123def0', Fecha: '2026-06-05', Tipo: 'Desove' }],
      [],
    );
    expect(m.desoves).toHaveLength(1);
    expect(m.desoves[0].sala).toBe('S1');       // ubicación derivada de la MATRIZ pese al caso distinto
    expect(m.desoves[0].tanque).toBe('T5');
    expect([...m.byTrovan.keys()]).toEqual(['ABC123DEF0']);
    expect(femaleHistory(m, 'abc123def0').totalDesoves).toBe(1); // consulta por caso mixto también resuelve
  });
});

describe('maduracion.data · robustez con datos como los reales', () => {
  it('acepta fechas dd/mm/yyyy (formato del Sheet) en todas las series', () => {
    const m = buildReproModel(
      [{ 'Trovan ID': 'C1', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '01/05/2026' }],
      [
        { 'Trovan ID': 'C1', Fecha: '01/06/2026', Tipo: 'Desove' },
        { 'Trovan ID': 'C1', Fecha: '15/06/2026', Tipo: 'Desove' },
      ],
      [],
    );
    expect(m.months).toEqual(['2026-06']);
    const h = femaleHistory(m, 'C1');
    expect(h.intervals).toEqual([14]);          // 01→15 de junio
    const tr = trends(m, makeFilter({}), 'month');
    expect(tr.desoves.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('cuenta eventos de una hembra que está en Bitácora pero NO en la MATRIZ', () => {
    const m = buildReproModel(
      [],                                                    // sin altas
      [{ 'Trovan ID': 'X9', Fecha: '2026-06-01', Tipo: 'Desove' }],
      [],
    );
    const k = kpis(m, makeFilter({}));
    expect(k.desoves).toBe(1);                   // el desove se cuenta
    expect(k.totalHembras).toBe(0);              // pero no está en la población (MATRIZ)
    // Sin ubicación derivable → agrupa bajo "—".
    const stats = locationStats(m, makeFilter({}), 'tanque');
    expect(stats[0].key).toBe('—');
    // El ranking sí la lista.
    expect(femaleRanking(m, makeFilter({}))[0].trovan).toBe('X9');
  });

  it('degrada sin lanzar cuando faltan hojas (arrays vacíos)', () => {
    const m = buildReproModel([], [], []);
    expect(kpis(m, makeFilter({})).totalHembras).toBe(0);
    expect(trends(m, makeFilter({}), 'month').labels).toEqual([]);
    expect(stateDistribution(m, makeFilter({}))).toEqual({ activa: 0, inactiva: 0, transferida: 0, fallecida: 0 });
  });
});

describe('maduracion.data · utilidades de dominio', () => {
  it('lista salas y tanques presentes (cascada)', () => {
    expect(salasOf(model)).toEqual(['S1', 'S2']);
    // Lista tanques con hembras/eventos en la sala (no destinos históricos de transferencia).
    expect(tanquesOf(model, 'S1').sort()).toEqual(['T1', 'T2']);
  });
  it('monthLabel y locKey formatean', () => {
    expect(monthLabel('2026-06')).toBe('junio 2026');
    expect(locKey('S1', 'T1')).toBe('S1 · T1');
    expect(locKey('', '')).toBe('— · —');
  });
});
