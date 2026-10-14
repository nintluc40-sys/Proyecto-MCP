/* ============================================================
   MADURACIÓN · OPERATIVO — VARIOS lotes y códigos a la vez (punto 2 · etapa A, 2026-10-13, usuario)

   «Si escojo el lote BA y también quiero ver junto a la información del lote BC, pueda filtrar ambos». Decidido: la
   UNIÓN —lo elegido se ve junto, sumado—, no una comparación. Qué se exige:
   · El filtro lleva LISTAS (`lotes`, `codigos`; vacía = todos), canónicas y sin repetir. Con un solo valor, todo es
     como antes (lo vigilan las pruebas de siempre, que lo eligen así).
   · Con dos, lo que se filtra por FILA es exactamente lo de esas filas: el cálculo con el filtro es el mismo que el
     cálculo SIN filtro sobre las filas de esos lotes (porcentajes incluidos: se recalculan, no se suman ni se
     promedian). Lo que sale del libro (vivos, tasa de mortalidad) es la suma de cada lote por separado.
   · Cada caso deja FUERA a un tercer lote: si el filtro se ignorase, la cifra sería la de todos y la prueba lo vería.
   · Ningún módulo vuelve a leer `F.lote` / `F.codigo` ni arma un filtro con esas claves (la guarda del final): uno
     solo que se quedara con la forma vieja enseñaría TODO sin filtrar, sin un síntoma.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  normalizarFiltro, hayFiltro, hayLote, hayCodigo, loteUnico, dimensionActiva, loteElegido, codigoEnFiltro,
  etiquetasDeFiltro, kpiVivos, kpiOcupacion, kpiMortalidad, kpiReproduccion, periodoDe,
} from './operativo.tablero.js';
import { modeloOperativo, serieDiaria, diasDeTanque } from './operativo.data.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { sumarDias } from '../registros/lib/mad-libro.js';
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { revisionesDeNauplios } from './operativo.revisiones.js';
import { graficoVivos, graficoDeKpi } from './operativo.kpis.js';
import { tablaDeReproduccion } from './operativo.reproduccion.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg) => ({ _SheetOrigin: O, 'Camaronera origen': 'X', Fecha: fecha,
  Lote: lote, 'Código genético': cg, Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const F = (o) => normalizarFiltro(o);
const SIN = F({});
const FOTO = '2026-09-19';

describe('Maduración · operativo · etapa A · el filtro con VARIOS lotes y códigos', () => {
  it('el filtro lleva listas canónicas y sin repetir; vacías, no hay filtro', () => {
    expect(F({ lote: ['qa', 'QB', ' qa '], codigo: ['ca', 'c b'] })).toMatchObject({ lotes: ['QA', 'QB'], codigos: ['CA', 'CB'] });
    expect(F({ lote: [], codigo: [] })).toMatchObject({ lotes: [], codigos: [] });
    expect(F({ lote: ['', null] }).lotes).toEqual([]);
    expect(hayFiltro(F({ lote: [] }))).toBe(false);
    expect(hayFiltro(F({ lote: ['QA', 'QB'] }))).toBe(true);
    expect(hayFiltro(F({ codigo: ['CA', 'CB'] }))).toBe(true);
  });

  it('elegido = uno CUALQUIERA de la lista; una pareja de códigos casa si comparte alguno', () => {
    const L = F({ lote: ['QA', 'QB'] });
    expect([loteElegido('qa', L), loteElegido('QB', L), loteElegido('QC', L), loteElegido('', L)]).toEqual([true, true, false, false]);
    expect(loteElegido('QC', SIN)).toBe(true);
    const C = F({ codigo: ['CA', 'CB'] });
    expect([codigoEnFiltro('ca', C), codigoEnFiltro('CB', C), codigoEnFiltro('CC', C), codigoEnFiltro('CC/CB', C)]).toEqual([true, true, false, true]);
    expect(codigoEnFiltro('CC', SIN)).toBe(true);
  });

  it('lo que necesita UN lote, sólo con uno; las dimensiones activas; una etiqueta por valor', () => {
    expect(loteUnico(F({ lote: 'QA' }))).toBe('QA');
    expect(loteUnico(F({ lote: ['QA', 'QB'] }))).toBe('');
    expect(loteUnico(SIN)).toBe('');
    expect([hayLote(SIN), hayCodigo(SIN), hayLote(F({ lote: ['QA'] })), hayCodigo(F({ codigo: ['CA'] }))]).toEqual([false, false, true, true]);
    expect(['lote', 'codigo', 'tanque', 'sala'].map((d) => dimensionActiva(F({ lote: ['QA'], codigo: [] }), d))).toEqual([true, false, false, false]);
    expect(dimensionActiva(undefined, 'lote')).toBe(false);
    expect(etiquetasDeFiltro(F({ lote: ['QA', 'QB'], codigo: ['CB'] })).map((e) => [e.dim, e.valor]))
      .toEqual([['lote', 'QA'], ['lote', 'QB'], ['codigo', 'CB']]);
  });
});

/* Tres lotes en tres tanques; cada uno con sus muertes del día de la foto. */
const PLANTA = [
  ING('2026-09-01', 'QA', 'Sala 1', 1, 50, 50, 'CA'),
  ING('2026-09-01', 'QB', 'Sala 4', 1, 20, 20, 'CB'),
  ING('2026-09-01', 'QC', 'Sala 2', 16, 10, 10, 'CC'),
  TQ('2026-09-10', 'Sala 1', 1, { 'Machos muertos': 3 }),
  TQ('2026-09-10', 'Sala 2', 16, { 'Hembras muertas': 1 }),
  TQ('2026-09-19', 'Sala 1', 1, { 'Machos muertos': 2 }),
  TQ('2026-09-19', 'Sala 4', 1, { 'Hembras muertas': 4 }),
  TQ('2026-09-19', 'Sala 2', 16, { 'Machos muertos': 5 }),
];
const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });

describe('Maduración · operativo · etapa A · las cifras del LIBRO son la suma de los lotes elegidos', () => {
  const suma = (a, b) => ({ machos: a.machos + b.machos, hembras: a.hembras + b.hembras });
  it('🔴 vivos: QA + QB, sin QC; y los dos códigos, igual', () => {
    const qa = kpiVivos(M.libro, F({ lote: 'QA' }));
    const qb = kpiVivos(M.libro, F({ lote: 'QB' }));
    const dos = kpiVivos(M.libro, F({ lote: ['QA', 'QB'] }));
    expect({ machos: dos.machos, hembras: dos.hembras }).toEqual(suma(qa, qb));
    expect(dos.total).toBeLessThan(kpiVivos(M.libro, SIN).total);
    expect(kpiVivos(M.libro, F({ codigo: ['CA', 'CB'] })).total).toBe(dos.total);
  });

  it('🔴 ocupación: los tanques de los dos lotes', () => {
    expect(kpiOcupacion(M.salas, M.libro, F({ lote: ['QA', 'QB'] }))).toMatchObject({ modo: 'filtro', ocupados: 2 });
    expect(kpiOcupacion(M.salas, M.libro, F({ lote: 'QA' }))).toMatchObject({ ocupados: 1 });
  });

  it('🔴 la tasa de mortalidad suma numeradores y denominadores de los dos (no promedia sus tasas)', () => {
    const p = periodoDe('7d', FOTO, M.fuentes);
    const serie = serieDiaria(M.fuentes, sumarDias(p.desde, -1), p.hasta);
    const partes = diasDeTanque(M.fuentes.tanques);
    const de = (lote) => kpiMortalidad(serie, p, F({ lote }), partes);
    const qa = de('QA').dia;
    const qb = de('QB').dia;
    const dos = de(['QA', 'QB']);
    expect(dos.modo).toBe('tasa');
    expect([dos.dia.muertos, dos.dia.riesgo]).toEqual([qa.muertos + qb.muertos, qa.riesgo + qb.riesgo]);
    expect(dos.dia.muertos).toBeLessThan(de([]).dia.muertos);   // QC (5 muertos) queda fuera
    expect(dos.dia.pct).toBeCloseTo((100 * (qa.muertos + qb.muertos)) / (qa.riesgo + qb.riesgo), 2);
    expect(dos.periodo.muertos).toBe(de('QA').periodo.muertos + de('QB').periodo.muertos);
  });

  it('🔴 el gráfico de vivos y el de la mortalidad: día a día, los dos lotes juntos', () => {
    const p = periodoDe('7d', FOTO, M.fuentes);
    const serie = serieDiaria(M.fuentes, sumarDias(p.desde, -1), p.hasta);
    const total = (g) => g.series.find((s) => s.clave === 'total').datos;
    const vivos = (lote) => graficoVivos(serie, p, F({ lote }));
    expect(vivos(['QA', 'QB']).aplica).toBe(true);
    expect(total(vivos(['QA', 'QB']))).toEqual(total(vivos('QA')).map((n, i) => n + total(vivos('QB'))[i]));
    expect(total(vivos(['QA', 'QB']))).not.toEqual(total(vivos([])));
    const mort = (lote) => graficoDeKpi('mortalidad', { serie, periodo: p, F: F({ lote }), partes: diasDeTanque(M.fuentes.tanques), M });
    const dia = (g) => g.series.find((s) => s.clave === 'dia').datos;
    const a = dia(mort('QA'));
    const b = dia(mort('QB'));
    const ab = dia(mort(['QA', 'QB']));
    expect(ab.length).toBeGreaterThan(0);
    // la tasa del día de los dos queda ENTRE las de cada uno (es un cociente de sumas, no una suma de tasas)
    ab.forEach((x, i) => { if (x !== null) expect(x).toBeGreaterThanOrEqual(Math.min(a[i], b[i]) - 1e-9); });
    ab.forEach((x, i) => { if (x !== null) expect(x).toBeLessThanOrEqual(Math.max(a[i], b[i]) + 1e-9); });
  });
});

describe('Maduración · operativo · etapa A · lo que se filtra por FILA es lo de esas filas', () => {
  const D = (fecha, lote, cg, desoves, huevos, n2, n5) => ({ Fecha: fecha, Lote: lote, 'Código genético': cg, Desoves: desoves,
    'Total de huevos': huevos, N2: n2, N5: n5, 'Hembras no viables': 0 });
  const DESOVES = [
    D('2026-09-14', 'QA', 'CA', 3, 600000, 480000, 300000),
    D('2026-09-15', 'qb', 'cb', 2, 300000, 210000, ''),
    D('2026-09-16', 'QC', 'CC', 5, 900000, 450000, 400000),
    D('2026-09-17', 'QA', 'CA/CC', 1, 100000, 90000, 80000),
  ];
  const p = { desde: '2026-09-01', hasta: FOTO };
  const deLotes = (ls) => DESOVES.filter((r) => ls.includes(normLote(r.Lote)));

  it('🔴 reproducción: con QA y QB, lo mismo que sin filtro sobre sus filas (la fertilidad, recalculada)', () => {
    expect(kpiReproduccion(DESOVES, p, F({ lote: ['QA', 'QB'] }))).toEqual(kpiReproduccion(deLotes(['QA', 'QB']), p, SIN));
    expect(kpiReproduccion(DESOVES, p, F({ lote: ['QA', 'QB'] })).desoves).toBe(6);   // sin los 5 de QC
  });

  it('🔴 con dos códigos, las filas de cualquiera de los dos (la pareja CA/CC entra por CA)', () => {
    expect(kpiReproduccion(DESOVES, p, F({ codigo: ['CA', 'CB'] })).desoves).toBe(6);
    expect(kpiReproduccion(DESOVES, p, F({ codigo: ['CB', 'CC'] })).desoves).toBe(8);
  });

  it('🔴 la tabla de 🥚 Reproducción: sólo los dos lotes, y los pendientes de N5 de cada uno', () => {
    const t = tablaDeReproduccion({ fuentes: { desoves: DESOVES }, fecha: FOTO }, p, F({ lote: ['QA', 'QB'] }));
    expect(t.map((x) => x.lote).sort()).toEqual(['QA', 'QB']);
    expect(t.find((x) => x.lote === 'QB').pendientes, 'el desove de QB espera su N5').toBe(1);
  });

  it('🔴 las revisiones de nauplios: las de los dos lotes', () => {
    const REV = (lote) => ({ _SheetOrigin: O, Fecha: '2026-09-15', Lote: lote, 'Revisión': 'Nauplio' });   // una revisión no dice tipo de tanque
    const fuentes = { mortDesove: [REV('QA'), REV('QB'), REV('QC')] };
    const n = (lote) => revisionesDeNauplios(fuentes, F({ lote }), p).filas.length;
    expect(n(['QA', 'QB'])).toBe(n('QA') + n('QB'));
    expect(n(['QA', 'QB'])).toBeLessThan(n([]));
  });
});

/* ── LA GUARDA ── ningún módulo del tablero lee el filtro con la forma vieja ni la arma. */
const DIR = new URL('./', import.meta.url);
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const MODULOS = readdirSync(DIR).filter((n) => /^operativo\..*\.js$/.test(n) && !n.endsWith('.test.js'));
const OTROS = ['../planta/estado.js', '../visitante/maduracion.produccion.js'];
describe('Maduración · operativo · etapa A · la forma vieja del filtro no vuelve', () => {
  it('la guarda mira algo: los módulos del tablero existen y usan el filtro', () => {
    expect(MODULOS.length).toBeGreaterThan(15);
    expect(MODULOS).toContain('operativo.tablero.js');
    expect(MODULOS).toContain('operativo.view.js');
  });
  for (const n of [...MODULOS, ...OTROS]) {
    it(`🔴 ${n}: ni \`F.lote\` / \`F.codigo\` ni un filtro armado con \`lote\` / \`codigo\``, () => {
      const s = sinComentarios(readFileSync(new URL(n, DIR), 'utf8'));
      expect(s.match(/\bF\.(lote|codigo)\b/g), 'lee la forma vieja').toBeNull();
      expect(s.match(/\.\.\.\s*\(?\s*F\b[^}]*\b(lote|codigo)\b\s*[:,}]/g), 'arma un filtro con la clave vieja').toBeNull();
      expect(s.match(/(EnFiltro|loteElegido)\([^;]*\{\s*(lote|codigo)\b\s*[:,}]/g), 'pasa un filtro con la clave vieja').toBeNull();
    });
  }
});
