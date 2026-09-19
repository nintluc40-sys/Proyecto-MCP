/* ============================================================
   MADURACIÓN · OPERATIVO — los indicadores nuevos (Fase 0.3)

   Cada indicador aprobado por el usuario el 2026-09-19, con fixtures que distinguen la fórmula correcta de las
   equivocadas plausibles: un denominador vacío da VACÍO y no 0; los extremos de un rango son «dentro»; la Sala 5
   tiene tanques de áreas distintas; un lote tecleado en minúsculas casa con el mismo lote; una desinfección de un
   área sin sala no es de ninguna sala; un (lote, código) que entró desde dos piscinas no cuenta sus vivos dos veces.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import * as I from './operativo.indicadores.js';

const {
  INDICADORES, cociente, supervivencia, tasaDescarte, proporcionHM, densidadTanque, ocupacion, desovesPorLote,
  tasaDeDesove, fueraDeRango, diasDesdeDesinfeccion, alimentoPorMillonN5, desempenoPorOrigen,
} = I;

describe('Maduración · indicadores · el catálogo', () => {
  it('cada indicador del catálogo tiene su función, y cada función exportada su definición', () => {
    for (const d of INDICADORES) {
      expect(typeof I[d.id], d.id).toBe('function');
      expect(d.definicion.length, d.id).toBeGreaterThan(20);
    }
    const funciones = Object.keys(I).filter((k) => typeof I[k] === 'function' && k !== 'cociente');
    expect(funciones.sort()).toEqual(INDICADORES.map((d) => d.id).sort());
  });

  it('no hay ningún indicador que compare N5 con N2 (decisión del usuario)', () => {
    for (const d of INDICADORES) expect(d.definicion, d.id).not.toMatch(/N5\s*÷\s*N2|N2\s*÷\s*N5/);
  });

  it('un cociente sin denominador es VACÍO, no cero', () => {
    expect(cociente(3, 0)).toBe('');
    expect(cociente(0, 5, 100)).toBe(0);
    expect(cociente(1, 3, 100)).toBe(33.33);
  });
});

describe('Maduración · indicadores · lote, sexo, tanque y sala', () => {
  const L = { machos: 8, hembras: 15, ingresados: { machos: 10, hembras: 20 }, descartes: { machos: 1, hembras: 2 } };

  it('supervivencia = vivos ÷ ingresados, por sexo y total; sin ingresos, vacía', () => {
    expect(supervivencia(L)).toEqual({ machos: 80, hembras: 75, total: 76.67 });
    expect(supervivencia({ machos: 0, hembras: 0, ingresados: { machos: 0, hembras: 0 } })).toEqual({ machos: '', hembras: '', total: '' });
  });

  it('tasa de descarte = descartes ÷ ingresados', () => {
    expect(tasaDescarte(L)).toEqual({ machos: 10, hembras: 10, total: 10 });
  });

  it('proporción H:M = hembras por macho; sin machos, vacía', () => {
    expect(proporcionHM(15, 10)).toBe(1.5);
    expect(proporcionHM(5, 0)).toBe('');
  });

  it('densidad = vivos ÷ área del TANQUE (la Sala 5 tiene tanques de 40 y de 27 m²)', () => {
    expect(densidadTanque('Sala 1', 1, 10, 16)).toBe(1.98);   // 26 ÷ 13,14
    expect(densidadTanque('Sala 5', 7, 40, 40)).toBe(2);      // 80 ÷ 40
    expect(densidadTanque('Sala 5', 9, 27, 27)).toBe(2);      // 54 ÷ 27
    expect(densidadTanque('Sala 5', 9, 40, 40)).toBe(2.96);   // 80 ÷ 27: el área es la de ESE tanque
    expect(densidadTanque('Sala 9', 1, 10, 10)).toBe('');
  });

  it('ocupación = tanques con animales ÷ tanques físicos', () => {
    expect(ocupacion(4, 6)).toBe(66.67);
    expect(ocupacion(0, 0)).toBe('');
  });
});

describe('Maduración · indicadores · desoves', () => {
  const D = (fecha, lote, cg, desoves, huevos, noViables, n2, n5) => ({ Fecha: fecha, Lote: lote, 'Código genético': cg,
    Desoves: desoves, 'Total de huevos': huevos, 'Hembras no viables': noViables, N2: n2, N5: n5 });

  it('huevos y no viables POR DESOVE, por lote canónico y en el período', () => {
    const filas = [D('2026-09-10', 'BP', 'X', 3, 600000, 1, '', ''), D('2026-09-11', ' bp ', 'Y', 2, 400000, 1, '', ''),
      D('2026-08-01', 'BP', 'X', 9, 900000, 9, '', ''), D('2026-09-10', 'BK', 'Z', 0, 0, 0, '', '')];
    const d = desovesPorLote(filas, '2026-09-01', '2026-09-30');
    expect(d.BP).toEqual({ desoves: 5, huevos: 1000000, noViables: 2, huevosPorDesove: 200000, noViablesPorDesove: 0.4 });
    expect(d.BK).toMatchObject({ desoves: 0, huevosPorDesove: '', noViablesPorDesove: '' });
  });

  it('tasa de desove = desoves del día ÷ hembras vivas del lote AL CIERRE del día', () => {
    const serie = [{ fecha: '2026-09-10', porLote: { BP: { machos: 40, hembras: 50 } } }, { fecha: '2026-09-11', porLote: { BP: { machos: 40, hembras: 40 } } }];
    const filas = [D('2026-09-10', 'BP', 'X', 3), D('2026-09-10', 'bp', 'Y', 2), D('2026-09-11', 'BP', 'X', 4), D('2026-09-11', 'BK', 'Z', 1)];
    expect(tasaDeDesove(filas, serie)).toEqual([
      { fecha: '2026-09-10', lote: 'BP', desoves: 5, hembras: 50, tasa: 10 },
      { fecha: '2026-09-11', lote: 'BK', desoves: 1, hembras: 0, tasa: '' },
      { fecha: '2026-09-11', lote: 'BP', desoves: 4, hembras: 40, tasa: 10 },
    ]);
  });
});

describe('Maduración · indicadores · ambiente, sanidad y alimento', () => {
  it('lecturas fuera de rango por sala; los extremos cuentan como dentro; un lado vacío no se comprueba', () => {
    const cols = ['Temperatura 2:00', 'Temperatura 4:00'];
    const filas = [
      { Fecha: '2026-09-10', Sala: 'Sala 1', 'Temperatura 2:00': 26, 'Temperatura 4:00': 30 },
      { Fecha: '2026-09-11', Sala: 'Sala 1', 'Temperatura 2:00': 25.9, 'Temperatura 4:00': '' },
      { Fecha: '2026-09-11', Sala: 'Sala 2', 'Temperatura 2:00': 31, 'Temperatura 4:00': 28 },
      { Fecha: '2026-08-01', Sala: 'Sala 2', 'Temperatura 2:00': 40, 'Temperatura 4:00': 40 },
    ];
    expect(fueraDeRango(filas, cols, { min: 26, max: 30 }, '2026-09-01', '2026-09-30')).toEqual({
      'Sala 1': { lecturas: 3, fuera: 1, pct: 33.33 }, 'Sala 2': { lecturas: 2, fuera: 1, pct: 50 },
    });
    expect(fueraDeRango(filas, cols, { min: 26, max: '' }, '2026-09-01', '2026-09-30')['Sala 2']).toEqual({ lecturas: 2, fuera: 0, pct: 0 });
  });

  it('días desde la última desinfección de cada sala; ni las preventivas, ni las de un área sin sala, ni las futuras', () => {
    const T = (fecha, tipo, sala) => ({ Fecha: fecha, Tipo: tipo, Sala: sala });
    const filas = [T('2026-09-10', 'Desinfección', 'Sala 1'), T('2026-09-15', 'Preventivo', 'Sala 1'), T('2026-09-12', 'Desinfección', 'Sala 1'),
      T('2026-09-16', 'Desinfección', ''), T('2026-09-05', 'Desinfección', 'Sala 2'), T('2026-09-25', 'Desinfección', 'Sala 2')];
    expect(diasDesdeDesinfeccion(filas, ['Sala 1', 'Sala 2', 'Sala 3'], '2026-09-19')).toEqual({
      'Sala 1': { fecha: '2026-09-12', dias: 7 }, 'Sala 2': { fecha: '2026-09-05', dias: 14 }, 'Sala 3': { fecha: '', dias: '' },
    });
  });

  it('kg de alimento PLANIFICADO por millón de N5, los dos en el mismo período; sin N5, vacío', () => {
    const alim = [{ Fecha: '2026-09-10', 'Total (kg/día)': 1.5 }, { Fecha: '2026-09-11', 'Total (kg/día)': 2.5 }, { Fecha: '2026-08-01', 'Total (kg/día)': 3 }];
    const des = [{ Fecha: '2026-09-10', N5: 2000000 }, { Fecha: '2026-09-11', N5: '' }, { Fecha: '2026-08-02', N5: 9000000 }];
    expect(alimentoPorMillonN5(alim, des, '2026-09-01', '2026-09-30')).toEqual({ kg: 4, n5: 2000000, kgPorMillon: 2 });
    expect(alimentoPorMillonN5(alim, [], '2026-09-01', '2026-09-30').kgPorMillon).toBe('');
  });
});

describe('Maduración · indicadores · desempeño por origen', () => {
  const ING = (lote, cg, piscina, m, h) => ({ Fecha: '2026-09-01', Lote: lote, 'Código genético': cg, 'Piscina Broodstock': piscina, Machos: m, Hembras: h });
  const fuentes = {
    ingresos: [ING('BP', 'X', 558, 10, 20), ING('BP', 'Y', 553, 5, 5), ING('BK', 'X', 558, 4, 4), ING('BK', 'X', 553, 1, 1)],
    desoves: [
      { Fecha: '2026-09-10', Lote: 'BP', 'Código genético': 'X', 'Piscina Broodstock': 558, Desoves: 4, 'Total de huevos': 1000000, N2: 600000, N5: 400000 },
      { Fecha: '2026-09-11', Lote: 'BP', 'Código genético': 'X', 'Piscina Broodstock': 558, Desoves: 2, 'Total de huevos': 500000, N2: '', N5: '' },
      // El mismo código tecleado en minúsculas y con un espacio: tiene que casar con «X».
      { Fecha: '2026-09-12', Lote: 'BP', 'Código genético': 'x ', 'Piscina Broodstock': 558, Desoves: 1, 'Total de huevos': 100000, N2: '', N5: '' },
    ],
  };
  const posiciones = [
    { sala: 'Sala 1', tanque: 1, lote: 'BP', codigoGenetico: 'X', machos: 8, hembras: 18 },
    { sala: 'Sala 1', tanque: 2, lote: 'BP', codigoGenetico: 'Y', machos: 5, hembras: 4 },
    { sala: 'Sala 2', tanque: 16, lote: 'BK', codigoGenetico: 'X', machos: 3, hembras: 4 },
  ];

  it('por código genético: vivos de sus posiciones, fertilidad y nauplios con la regla del Saldo', () => {
    const d = Object.fromEntries(desempenoPorOrigen(fuentes, posiciones, 'codigo').map((o) => [o.origen, o]));
    expect(d.X).toMatchObject({ lotes: ['BK', 'BP'], ingresados: 40, vivos: 33, supervivencia: 82.5, desoves: 7, huevos: 1600000,
      fertilidad: 60, naupliosPorHembra: 100000 });
    expect(Object.keys(d).sort()).toEqual(['X', 'Y']);
    expect(d.Y).toMatchObject({ ingresados: 10, vivos: 9, supervivencia: 90, desoves: 0, fertilidad: '', naupliosPorHembra: '' });
  });

  it('por piscina: un (lote, código) que entró desde dos piscinas cuenta sus vivos UNA vez, en la que más aportó', () => {
    const d = Object.fromEntries(desempenoPorOrigen(fuentes, posiciones, 'piscina').map((o) => [o.origen, o]));
    expect(d['558']).toMatchObject({ ingresados: 38, vivos: 33 });   // BP/X (26) + BK/X (7): BK/X aportó 8 desde la 558 y 2 desde la 553
    expect(d['553']).toMatchObject({ ingresados: 12, vivos: 9 });
    const vivos = Object.values(d).reduce((a, o) => a + o.vivos, 0);
    expect(vivos).toBe(8 + 18 + 5 + 4 + 3 + 4);
  });
});
