/* ============================================================
   MADURACIÓN · OPERATIVO · el resumen gráfico de cada KPI (0f · 5, 2026-09-25, usuario)

   🔑 LO QUE DE VERDAD SE VIGILA: que cada gráfico diga lo MISMO que la cifra de su tarjeta. Su último punto (o la suma
   de sus barras) se compara con la función de la tarjeta, con varios filtros; y donde se puede, CADA DÍA: el punto del
   día X es la tarjeta con la foto (o el período) cerrados el día X. Un gráfico que tomara otra regla se pondría rojo
   aquí aunque se viera bonito. Y lo que la serie no guarda día a día no se inventa: no aplica.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  KPIS_CON_GRAFICO, graficoVivos, graficoLotes, graficoSalas, graficoOcupacion, graficoMortalidad, graficoReproduccion,
  graficoBiomasa, graficoDeKpi,
} from './operativo.kpis.js';
import { kpiVivos, kpiLotes, kpiOcupacion, kpiMortalidad, kpiReproduccion, kpiBiomasa, normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { modeloOperativo, serieDiaria, diasDeTanque, libroAlCierre } from './operativo.data.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { sumarDias } from '../registros/lib/mad-libro.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg = 'CA') => ({ _SheetOrigin: O, 'Camaronera origen': 'X', Fecha: fecha,
  Lote: lote, 'Código genético': cg, Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const SALA = (fecha, sala, extra) => ({ _SheetOrigin: O, 'Temperatura 2:00': '', Fecha: fecha, Sala: sala, ...extra });
const DES = (fecha, lote, desoves, n5, cg = 'CA') => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': cg,
  Desoves: desoves, 'Total de huevos': desoves * 100000, N2: 0, N5: n5 });

const FOTO = '2026-09-19';
/* · Sala 1 t1: QA (10♂ 20♀) y QC (2♂ 2♀), en producción desde agosto; bajas el 15/09 y una del 10/08 (antes del período).
     Sala 1 t2: más QC (1♂ 1♀): la sala tiene DOS tanques, para que un filtro de tanque no dé lo mismo que el de sala.
   · Sala 2 t16: QD (3♂ 3♀) en producción y QA (5♂ 5♀) desde el 11/09, en cuarentena ahí: QA pasa a MIXTO; una cópula
     el 16/09 rompe esa cuarentena ANTES de los 15 días y QA deja de ser mixto.
   · Sala 3 t22: QF, SÓLO machos (4♂): con el filtro de hembras no cuenta.
   · Sala 5 t7: QG (1♂ 1♀), que MUERE entero el 17/09: desde ese día ya no es un lote con animales.
   · Sala 4 t1: QB (8♂ 8♀) desde el 12/09, en cuarentena; una hembra muerta y pesos el 18/09.
   · Desoves de QA (CA) el 14/09 y de QB (CB) el 16/09. */
const PLANTA = [
  ING('2026-08-01', 'QA', 'Sala 1', 1, 10, 20, 'CA'), ING('2026-08-01', 'QC', 'Sala 1', 1, 2, 2, 'CB'),
  ING('2026-08-01', 'QC', 'Sala 1', 2, 1, 1, 'CB'),
  ING('2026-08-01', 'QD', 'Sala 2', 16, 3, 3, 'CB'), ING('2026-09-11', 'QA', 'Sala 2', 16, 5, 5, 'CB'),
  ING('2026-08-01', 'QF', 'Sala 3', 22, 4, 0, 'CA'), ING('2026-08-01', 'QG', 'Sala 5', 7, 1, 1, 'CA'),
  ING('2026-09-12', 'QB', 'Sala 4', 1, 8, 8, 'CA'),
  TQ('2026-08-10', 'Sala 1', 1, { 'Machos muertos': 1 }),
  TQ('2026-09-15', 'Sala 1', 1, { 'Machos muertos': 1, 'Hembras muertas': 2 }),
  TQ('2026-09-16', 'Sala 2', 16, { 'Cópulas': 1 }),
  TQ('2026-09-17', 'Sala 5', 7, { 'Machos muertos': 1, 'Hembras muertas': 1 }),
  TQ('2026-09-18', 'Sala 4', 1, { 'Hembras muertas': 1, 'Peso promedio machos (g)': 30, 'Peso promedio hembras (g)': 40 }),
  SALA('2026-09-18', 'Sala 1', { Estado: 'Producción' }),
  DES('2026-09-14', 'QA', 4, 400000, 'CA'), DES('2026-09-16', 'QB', 2, 150000, 'CB'),
];
const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const P = periodoDe('30d', FOTO, M.fuentes);
const SERIE = serieDiaria(M.fuentes, sumarDias(P.desde, -1), P.hasta);
const PARTES = diasDeTanque(M.fuentes.tanques);
const F = (o = {}) => normalizarFiltro(o);
const serieDe = (g, clave) => g.series.find((s) => s.clave === clave).datos;
const ultimo = (g, clave) => serieDe(g, clave).at(-1);
const suma = (g, clave) => serieDe(g, clave).reduce((a, v) => a + (v || 0), 0);
const enDia = (g, fecha) => Object.fromEntries(g.series.map((s) => [s.clave, s.datos[g.etiquetas.indexOf(fecha)]]));
const nombre = (f) => JSON.stringify(Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== null)));

describe('Maduración · KPI · los siete gráficos', () => {
  it('uno por tarjeta, en su orden, y graficoDeKpi los reparte', () => {
    expect(KPIS_CON_GRAFICO.map((k) => k.clave)).toEqual(['vivos', 'lotes', 'salas', 'ocupacion', 'mortalidad', 'reproduccion', 'biomasa']);
    const ctx = { M, serie: SERIE, partes: PARTES, periodo: P, F: F() };
    for (const { clave } of KPIS_CON_GRAFICO) expect(graficoDeKpi(clave, ctx).aplica, clave).toBe(true);
    expect(graficoDeKpi('lotes', ctx)).toEqual(graficoLotes(SERIE, P, F()));
    expect(graficoDeKpi('mortalidad', ctx)).toEqual(graficoMortalidad(SERIE, P, F(), PARTES));
  });
});

describe('Maduración · KPI · 🔑 el último punto de cada gráfico ES la cifra de su tarjeta', () => {
  const FILTROS = [F(), F({ sala: 'Sala 1' }), F({ lote: 'QA' }), F({ lote: 'QC' }), F({ sexo: 'hembras' }), F({ sexo: 'machos' }), F({ lote: 'QA', sala: 'Sala 2' }),
    F({ sala: 'Sala 1', tanque: '2' }), F({ sala: 'Sala 4', tanque: '1' })];

  it('🔴 Vivos: ♀, ♂ y total del último día = kpiVivos, con cada filtro', () => {
    for (const f of FILTROS) {
      const g = graficoVivos(SERIE, P, f);
      const k = kpiVivos(M.libro, f);
      expect([ultimo(g, 'hembras'), ultimo(g, 'machos'), ultimo(g, 'total')], nombre(f)).toEqual([k.hembras, k.machos, k.total]);
    }
    expect(ultimo(graficoVivos(SERIE, P, F({ sala: 'Sala 1', tanque: '2' })), 'total'), 'control: el tanque 2 no es la sala').toBe(2);
  });

  it('🔴 Lotes: CADA DÍA, por estado = kpiLotes con el libro cerrado ese día, con cada filtro que aplica', () => {
    const dias = ['2026-09-10', '2026-09-12', '2026-09-15', '2026-09-16', '2026-09-17', FOTO];
    const libros = Object.fromEntries(dias.map((d) => [d, libroAlCierre(M.fuentes, d)]));
    for (const f of FILTROS.filter((x) => x.tanque === null)) {
      const g = graficoLotes(SERIE, P, f);
      for (const d of dias) {
        const k = kpiLotes(libros[d], f);
        expect(enDia(g, d), nombre(f) + ' ' + d).toEqual({ cuarentena: k.cuarentena, produccion: k.produccion, mixto: k.mixto, otros: k.otros });
      }
    }
    const k = kpiLotes(M.libro, F());
    expect([k.mixto, k.produccion, k.cuarentena], 'control: la cópula ya rompió la cuarentena de QA en la Sala 2').toEqual([0, 4, 1]);
  });

  it('🔴 Ocupación: la suma de las salas = kpiOcupacion', () => {
    for (const f of FILTROS.filter((x) => x.tanque === null)) {
      const g = graficoOcupacion(M.salas, M.libro, f);
      const k = kpiOcupacion(M.salas, M.libro, f);
      expect([suma(g, 'ocupados'), suma(g, 'ocupados') + suma(g, 'libres')], nombre(f)).toEqual([k.ocupados, k.total]);
    }
  });

  it('🔴 Mortalidad (tasa): CADA DÍA, la del día y la acumulada = kpiMortalidad del período cortado ese día, sin filtro y por lote', () => {
    const pct = (x) => (x.pct === '' ? null : x.pct);
    for (const f of [F(), F({ lote: 'QA' }), F({ lote: 'QB' })]) {
      const g = graficoMortalidad(SERIE, P, f, PARTES);
      expect(g.unidad).toBe('%');
      g.etiquetas.forEach((d, i) => {
        const k = kpiMortalidad(SERIE, { ...P, hasta: d }, f, PARTES);
        expect([g.series[0].datos[i], g.series[1].datos[i]], nombre(f) + ' ' + d).toEqual([pct(k.dia), pct(k.periodo)]);
      });
    }
    const g = graficoMortalidad(SERIE, P, F({ lote: 'QB' }), PARTES);
    expect([enDia(g, '2026-09-15').dia, enDia(g, '2026-09-18').dia > 0], 'control: QB no tuvo las bajas del 15/09, sí la del 18/09').toEqual([0, true]);
  });

  it('🔴 Mortalidad (con sala): las muertes REGISTRADAS de cada día y su suma = kpiMortalidad', () => {
    for (const f of [F({ sala: 'Sala 1' }), F({ sala: 'Sala 1', tanque: '2' }), F({ sala: 'Sala 4', tanque: '1' })]) {
      const g = graficoMortalidad(SERIE, P, f, PARTES);
      const k = kpiMortalidad(SERIE, P, f, PARTES);
      expect(g.unidad).toBe('muertes');
      expect([ultimo(g, 'dia'), ultimo(g, 'acumulada'), suma(g, 'dia')], nombre(f)).toEqual([k.dia.muertos, k.periodo.muertos, k.periodo.muertos]);
    }
    expect(suma(graficoMortalidad(SERIE, P, F({ sala: 'Sala 1' }), PARTES), 'dia'), 'control: las 3 del 15/09, no la del 10/08').toBe(3);
    expect(suma(graficoMortalidad(SERIE, P, F({ sala: 'Sala 1', tanque: '2' }), PARTES), 'dia'), 'control: el tanque 2 no tuvo bajas').toBe(0);
    expect(enDia(graficoMortalidad(SERIE, P, F({ sala: 'Sala 4', tanque: '1' }), PARTES), '2026-09-18').dia, 'control: la del 18/09').toBe(1);
  });

  it('🔴 Reproducción: la suma de desoves y de N5 = kpiReproduccion, sin filtro, con lote y con código', () => {
    for (const f of [F(), F({ lote: 'QB' }), F({ codigo: 'CA' })]) {
      const g = graficoReproduccion(M.fuentes.desoves, P, f);
      const k = kpiReproduccion(M.fuentes.desoves, P, f);
      expect([suma(g, 'desoves'), suma(g, 'n5')], nombre(f)).toEqual([k.desoves, k.n5]);
    }
    expect(suma(graficoReproduccion(M.fuentes.desoves, P, F({ codigo: 'CA' })), 'desoves'), 'control: sólo el de QA').toBe(4);
    const g = graficoReproduccion(M.fuentes.desoves, P, F());
    expect(enDia(g, '2026-09-14'), 'cada desove en SU día').toEqual({ desoves: 4, n5: 400000 });
  });

  it('🔴 Biomasa: cada sala con la regla de la tarjeta (kpiBiomasa de esa sala)', () => {
    const g = graficoBiomasa(M, F(), P);
    const i = g.etiquetas.indexOf('Sala 4');
    const k = kpiBiomasa(M, F({ sala: 'Sala 4' }), P);
    expect([g.series[0].datos[i], g.series[1].datos[i]]).toEqual([k.hembrasKg, k.machosKg]);
    expect(k.hembrasKg, 'control: 7 hembras × 40 g').toBe(0.28);
    expect(g.series[0].datos[g.etiquetas.indexOf('Sala 1')], 'sin pesos en la Sala 1: sin barra, no un cero').toBe(null);
  });
});

describe('Maduración · KPI · los lotes, día a día', () => {
  it('🔴 el estado de cada día con SU reloj: QA pasa a Mixto el 11/09, QB entra en cuarentena el 12/09, la cópula del 16/09 acaba el Mixto, QG muere el 17/09', () => {
    const g = graficoLotes(SERIE, P, F());
    expect(enDia(g, '2026-09-10')).toEqual({ cuarentena: 0, produccion: 5, mixto: 0, otros: 0 });
    expect(enDia(g, '2026-09-12')).toEqual({ cuarentena: 1, produccion: 4, mixto: 1, otros: 0 });
    expect(enDia(g, '2026-09-16')).toEqual({ cuarentena: 1, produccion: 5, mixto: 0, otros: 0 });
    expect(enDia(g, '2026-09-17'), 'QG murió entero: ya no cuenta').toEqual({ cuarentena: 1, produccion: 4, mixto: 0, otros: 0 });
  });

  it('🔴 un día SIN sucesos también cambia de estado si se cumple el plazo (QB sale de cuarentena el 27/09)', () => {
    const M2 = modeloOperativo(PLANTA, { hoy: '2026-09-28', fecha: '2026-09-28' });
    const P2 = periodoDe('7d', '2026-09-28', M2.fuentes);
    const g = graficoLotes(serieDiaria(M2.fuentes, sumarDias(P2.desde, -1), P2.hasta), P2, F({ lote: 'QB' }));
    expect(enDia(g, '2026-09-26')).toMatchObject({ cuarentena: 1, produccion: 0 });
    expect(enDia(g, '2026-09-27')).toMatchObject({ cuarentena: 0, produccion: 1 });
  });

  it('🔴 con el filtro de un sexo, un lote que no lo tiene no cuenta', () => {
    const conTodo = graficoLotes(SERIE, P, F());
    const hembras = graficoLotes(SERIE, P, F({ sexo: 'hembras' }));
    expect(ultimo(conTodo, 'produccion') - ultimo(hembras, 'produccion'), 'QF, sólo machos').toBe(1);
  });
});

describe('Maduración · KPI · lo que no se guarda día a día, no se inventa', () => {
  it('con código genético, los vivos, los lotes y la mortalidad no aplican (y lo dicen)', () => {
    for (const g of [graficoVivos(SERIE, P, F({ codigo: 'CA' })), graficoLotes(SERIE, P, F({ codigo: 'CA' })), graficoMortalidad(SERIE, P, F({ codigo: 'CA' }), PARTES)]) {
      expect(g.aplica).toBe(false);
      expect(g.nota.length > 10).toBe(true);
    }
  });

  it('con un tanque y un lote, los vivos no aplican (la serie no guarda el lote dentro del tanque)', () => {
    expect(graficoVivos(SERIE, P, F({ sala: 'Sala 1', tanque: '1', lote: 'QA' })).aplica).toBe(false);
  });

  it('con un tanque, la ocupación y los lotes no aplican; sin ningún peso, la biomasa tampoco', () => {
    expect(graficoOcupacion(M.salas, M.libro, F({ sala: 'Sala 1', tanque: '1' })).aplica).toBe(false);
    expect(graficoLotes(SERIE, P, F({ sala: 'Sala 1', tanque: '1' })).aplica).toBe(false);
    const sinPesos = modeloOperativo(PLANTA.filter((r) => !r['Peso promedio hembras (g)']), { hoy: FOTO, fecha: FOTO });
    expect(graficoBiomasa(sinPesos, F(), P).aplica).toBe(false);
  });

  it('las salas: registrado frente a propuesto, con su situación', () => {
    const g = graficoSalas(M.salas, F());
    const S1 = M.salas.find((s) => s.sala === 'Sala 1');
    expect(g.filas.find((f) => f.sala === 'Sala 1')).toEqual({ sala: 'Sala 1', registrado: 'Producción', propuesto: S1.propuesto.estado,
      situacion: S1.coinciden ? 'coinciden' : 'difieren' });
    expect(typeof S1.coinciden, 'control: la Sala 1 tiene los dos estados').toBe('boolean');
    expect(g.filas.find((f) => f.sala === 'Sala 3').situacion).toBe('sin-registro');
    expect(graficoSalas(M.salas, F({ sala: 'Sala 4' })).filas.map((f) => f.sala)).toEqual(['Sala 4']);
  });
});
