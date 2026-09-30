/* ============================================================
   MADURACIÓN · OPERATIVO — 🦐 cópulas × marea × luna (0r·2, 2026-09-28)

   Qué se exige, con una planta en la que cada regla EQUIVOCADA da otro resultado:
   · La tasa de un día es la del ⚖️ Saldo: Σ cópulas ÷ Σ hembras que el libro tenía en esos tanques al CIERRE de ese
     día. QM pierde la mitad de sus hembras el 11/09: ese día su tasa es 2 ÷ 10, no 2 ÷ 20.
   · Un parte de un tanque sin hembras en el libro no cuenta (el tanque 2 de la Sala 1 está vacío y trae 3 cópulas).
   · «Sólo en producción»: QN está en cuarentena hasta el 20/09 (su ingreso, el 05/09) y no copula; el 21/09 ya
     produce, aunque ese día no pase nada en el libro (el estado va con la fecha del parte, no con el último suceso).
   · Un día en que NINGÚN tanque de la granja registra cópulas es un HUECO del registro (en la hoja nadie escribe un 0: la
     casilla se deja vacía), no un día sin cópulas: fuera, y se cuenta (decisión del usuario). El 18/09 no trae ninguna.
     Con un filtro, el 0 de un día en que la granja sí registró sigue siendo un 0 (la Sala 2 el 10/09).
   · Por grupo, Σ cópulas ÷ Σ hembras (no la media de las tasas diarias); las ocho fases, en el orden del ciclo.
   · r de Pearson y su umbral 2/√n: CIFRAS que se recalculan con cada parte; la vista ya no las «lee» (1-A, 2026-09-28,
     usuario: una frase de conclusión daba a entender que todo estaba estimado y quedaba estático).
   · Filtros de la pestaña (1-A): mes, lote y código genético (la pareja cuenta como sus dos: `codigoEnFiltro`).
   · DESOVES por fase (1-A): Σ desoves de la hoja de Desoves ÷ Σ hembras del libro al cierre × 100 («por 100 ♀»); un día
     sin NINGÚN desove registrado en la granja no cuenta. Un desove no es de una sala: con sala o «sólo en producción»,
     cuentan los lotes que tenían animales en ese alcance.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { partesConHembras, copulasYMarea, desovesDiarios, desovesYMarea, CICLO_LUNAR_DIAS, granjaDelDia } from './operativo.mareas.js';
import { modeloOperativo, diasDeTanque } from './operativo.data.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { FASES_CICLO } from './data.js';
import { pearson } from '../../core/util.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg = 'CG') => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: fecha, Lote: lote,
  'Código genético': cg, 'Piscina Broodstock': 'P9', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const DES = (fecha, lote, cg, desoves) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': cg, Desoves: desoves,
  'Total de huevos': 1000 * desoves, N2: '', N5: '', 'Hembras no viables': '' });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
/* QM — Sala 1, tanque 1 (10♂ 20♀), código CG, ingreso 01/08: produce desde el 16/08. El 11/09 mueren 10 hembras.
   QN — Sala 2, tanque 16 (10♂ 10♀), código CH, ingreso 05/09: en cuarentena hasta el 20/09. El tanque 2 de la Sala 1, vacío.
   Desoves: QM 3 el 10/09, 2 el 11/09 y 1 el 12/09 (sin marea) y el 21/09; QN 2 el 21/09. Ninguno el 17 ni el 18. */
const PLANTA = [
  ING('2026-08-01', 'QM', 'Sala 1', 1, 10, 20),
  ING('2026-09-05', 'QN', 'Sala 2', 16, 10, 10, 'CH'),
  DES('2026-09-10', 'QM', 'CG', 3), DES('2026-09-11', 'QM', 'CG', 2), DES('2026-09-12', 'QM', 'CG', 1),
  DES('2026-09-21', 'QM', 'CG', 1), DES('2026-09-21', 'QN', 'CH', 2),
  DES('2026-09-17', 'QM', 'CG', 0),   // una fila con 0 desoves no hace «día con desoves»
  TQ('2026-09-10', 'Sala 1', 1, { 'Cópulas': 4 }),
  TQ('2026-09-10', 'Sala 2', 16, { 'Cópulas': 0 }),
  TQ('2026-09-10', 'Sala 1', 2, { 'Cópulas': 3 }),
  TQ('2026-09-11', 'Sala 1', 1, { 'Cópulas': 2, 'Hembras muertas': 10 }),
  TQ('2026-09-12', 'Sala 1', 1, { 'Cópulas': 2 }),
  TQ('2026-09-17', 'Sala 1', 1, { 'Cópulas': 1 }),
  TQ('2026-09-17', 'Sala 2', 16, { 'Cópulas': 0 }),
  TQ('2026-09-18', 'Sala 1', 1, { 'Cópulas': '' }),
  TQ('2026-09-18', 'Sala 2', 16, {}),
  TQ('2026-09-21', 'Sala 2', 16, { 'Cópulas': 1 }),
];
const MAREA = new Map([
  ['2026-09-10', { fase: 'Luna llena', ilum: 100, tipo: 'Viva', amplitud: 2.0 }],
  ['2026-09-11', { fase: 'Gibosa menguante', ilum: 95, tipo: 'Viva', amplitud: 1.9 }],
  ['2026-09-17', { fase: 'Cuarto menguante', ilum: 50, tipo: 'Muerta', amplitud: 0.8 }],
  ['2026-09-18', { fase: 'Cuarto menguante', ilum: 40, tipo: 'Muerta', amplitud: 0.7 }],
  ['2026-09-21', { fase: 'Luna nueva', ilum: 0, tipo: 'Viva', amplitud: 2.1 }],
]);
const base = () => {
  const M = modeloOperativo(PLANTA, { hoy: '2026-09-28' });
  return partesConHembras(M.fuentes, diasDeTanque(M.fuentes.tanques));
};
const dia = (x, f) => x.dias.find((d) => d.fecha === f);

describe('Maduración · operativo · 🦐 cópulas × marea · cada parte con lo que dice el libro', () => {
  it('🔴 las hembras del tanque AL CIERRE de ese día, y si todos sus lotes producían en esa sala ese día', () => {
    const b = base();
    const de = (f, sala, tq) => b.find((x) => x.fecha === f && x.sala === sala && x.tanque === tq);
    expect(de('2026-09-10', 'Sala 1', 1)).toMatchObject({ copulas: 4, hembras: 20, produccion: true });
    expect(de('2026-09-11', 'Sala 1', 1).hembras, 'murieron 10 ese día').toBe(10);
    expect(de('2026-09-10', 'Sala 1', 2)).toMatchObject({ copulas: 3, hembras: 0, produccion: false });
    expect(de('2026-09-10', 'Sala 2', 16)).toMatchObject({ hembras: 10, produccion: false });
    expect(de('2026-09-21', 'Sala 2', 16).produccion, 'la cuarentena se cumple sin sucesos en el libro').toBe(true);
    expect(b.map((x) => x.fecha)).toEqual([...b.map((x) => x.fecha)].sort());
  });

  it('🔴 1-A · cada parte lleva los lotes y los códigos que su tanque tenía ese día', () => {
    const b = base();
    const de = (f, sala, tq) => b.find((x) => x.fecha === f && x.sala === sala && x.tanque === tq);
    expect(de('2026-09-10', 'Sala 1', 1)).toMatchObject({ lotes: ['QM'], codigos: ['CG'] });
    expect(de('2026-09-10', 'Sala 2', 16)).toMatchObject({ lotes: ['QN'], codigos: ['CH'] });
    expect(de('2026-09-10', 'Sala 1', 2)).toMatchObject({ lotes: [], codigos: [] });
  });

  it('🔑 sin partes, nada; sin libro, los partes sin hembras', () => {
    expect(partesConHembras({}, [])).toEqual([]);
    expect(partesConHembras({}, [{ fecha: '2026-09-10', sala: 'Sala 1', tanque: 1, copulas: 2 }])).toEqual([
      { fecha: '2026-09-10', sala: 'Sala 1', tanque: 1, copulas: 2, hembras: 0, produccion: false, lotes: [], codigos: [] }]);
  });
});

describe('Maduración · operativo · 🦐 cópulas × marea · la relación', () => {
  it('🔴 la tasa de cada día es Σ cópulas ÷ Σ hembras; el tanque sin hembras no cuenta; el día sin marea, aparte', () => {
    const x = copulasYMarea(base(), MAREA);
    expect(x.dias.map((d) => d.fecha)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-17', '2026-09-21']);
    expect(dia(x, '2026-09-10')).toMatchObject({ copulas: 4, hembras: 30, partes: 2 });
    expect(dia(x, '2026-09-10').tasa).toBeCloseTo((4 / 30) * 100, 9);
    expect(dia(x, '2026-09-11').tasa).toBeCloseTo(20, 9);
    expect(x.sinHembras).toBe(1);
    expect([x.conMarea, x.sinMarea]).toEqual([4, 1]);
    expect(x.sinRegistro, 'el 18/09, sin ninguna cópula en la granja').toBe(1);
    expect(dia(x, '2026-09-18')).toBeUndefined();
    expect(dia(x, '2026-09-12').marea).toBeNull();
    expect([x.desde, x.hasta]).toEqual(['2026-09-10', '2026-09-21']);
    expect(x.ciclos).toBeCloseTo(12 / CICLO_LUNAR_DIAS, 9);
  });

  it('🔴 por tipo de marea y por fase: Σ ÷ Σ (no la media de los días); las ocho fases en el orden del ciclo', () => {
    const x = copulasYMarea(base(), MAREA);
    const viva = x.tipo.find((t) => t.k === 'Viva');
    expect(viva).toMatchObject({ dias: 3, copulas: 7, hembras: 50 });
    expect(viva.tasa).toBeCloseTo(14, 9);
    const muerta = x.tipo.find((t) => t.k === 'Muerta');
    expect(muerta).toMatchObject({ dias: 1, copulas: 1, hembras: 20 });
    expect(x.fase.map((f) => f.k)).toEqual(FASES_CICLO);
    expect(x.fase.find((f) => f.k === 'Luna llena')).toMatchObject({ dias: 1, copulas: 4, hembras: 30 });
    expect(x.fase.find((f) => f.k === 'Creciente')).toMatchObject({ dias: 0, tasa: null });
  });

  it('🔴 «sólo en producción» quita la cuarentena de QN (y lo dice); desde el 21/09, QN cuenta', () => {
    const x = copulasYMarea(base(), MAREA, { soloProduccion: true });
    expect(dia(x, '2026-09-10')).toMatchObject({ copulas: 4, hembras: 20 });
    expect(x.fueraDeProduccion).toBe(2);
    expect(dia(x, '2026-09-21')).toMatchObject({ copulas: 1, hembras: 10 });
    expect(x.sinHembras, 'el vacío sigue siendo «sin hembras», no «fuera de producción»').toBe(1);
  });

  it('🔴 la sala: sólo sus partes; la lista de salas no depende del filtro', () => {
    const x = copulasYMarea(base(), MAREA, { sala: 'Sala 2' });
    expect(x.dias.map((d) => d.fecha)).toEqual(['2026-09-10', '2026-09-17', '2026-09-21']);
    expect(dia(x, '2026-09-10')).toMatchObject({ copulas: 0, hembras: 10 });
    expect(x.salas).toEqual(['Sala 1', 'Sala 2']);
    expect(x.sinHembras).toBe(0);
    expect(x.sinRegistro, 'el hueco es de la GRANJA: el filtro no lo cambia').toBe(1);
  });

  it('🔑 1-A · no se «lee» nada: sólo cifras, que salen con los días que haya (r incluida)', () => {
    const x = copulasYMarea(base(), MAREA);
    expect(x.lectura).toBeUndefined();
    expect(x.r.amplitud).not.toBeNull();
    expect(copulasYMarea([], MAREA)).toMatchObject({ conMarea: 0, rCrit: null });
    expect(copulasYMarea(base(), new Map()).conMarea).toBe(0);
  });

  it('🔴 1-A · el mes, el lote y el código genético filtran los partes; las opciones no dependen del filtro', () => {
    const porLote = copulasYMarea(base(), MAREA, { lote: 'QN' });
    expect(porLote.dias.map((d) => d.fecha)).toEqual(['2026-09-10', '2026-09-17', '2026-09-21']);
    expect(dia(porLote, '2026-09-21')).toMatchObject({ copulas: 1, hembras: 10 });
    const porCodigo = copulasYMarea(base(), MAREA, { codigo: 'CG' });
    expect(porCodigo.dias.map((d) => d.fecha)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-17']);
    expect(dia(porCodigo, '2026-09-10')).toMatchObject({ copulas: 4, hembras: 20 });
    expect(copulasYMarea(base(), MAREA, { codigo: 'CG/CH' }).dias.length, 'la pareja cuenta como sus dos').toBe(5);
    expect(copulasYMarea(base(), MAREA, { mes: '2026-08' }).dias).toEqual([]);
    expect(copulasYMarea(base(), MAREA, { mes: '2026-09' }).dias.length).toBe(5);
    expect([porLote.meses, porLote.lotes, porLote.codigos]).toEqual([['2026-09'], ['QM', 'QN'], ['CG', 'CH']]);
  });
});

describe('Maduración · operativo · 🥚 desoves × marea (1-A)', () => {
  const diarios = () => desovesDiarios(modeloOperativo(PLANTA, { hoy: '2026-09-28' }).fuentes);

  it('🔴 por día, Σ desoves ÷ Σ hembras del libro al cierre × 100; sin desoves en la granja, el día no está', () => {
    const x = desovesYMarea(diarios(), MAREA);
    expect(x.dias.map((d) => d.fecha)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-21']);
    expect(dia(x, '2026-09-10')).toMatchObject({ desoves: 3, hembras: 30 });
    expect(dia(x, '2026-09-10').tasa).toBeCloseTo(10, 9);
    expect(dia(x, '2026-09-11').tasa, 'con las hembras del cierre (murieron 10)').toBeCloseTo(10, 9);
    expect(dia(x, '2026-09-21')).toMatchObject({ desoves: 3, hembras: 20 });
    expect([x.conMarea, x.sinMarea]).toEqual([3, 1]);
    const viva = x.tipo.find((t) => t.k === 'Viva');
    expect(viva).toMatchObject({ dias: 3, desoves: 8, hembras: 70 });
    expect(x.fase.find((f) => f.k === 'Luna llena')).toMatchObject({ dias: 1, desoves: 3, hembras: 30 });
    expect(x.fase.map((f) => f.k)).toEqual(FASES_CICLO);
  });

  it('🔴 el lote, el código y la sala: los desoves del alcance sobre sus hembras (el 0 de un día con desoves es un 0)', () => {
    const porLote = desovesYMarea(diarios(), MAREA, { lote: 'QN' });
    expect(porLote.dias.map((d) => [d.fecha, d.desoves, d.hembras])).toEqual([
      ['2026-09-10', 0, 10], ['2026-09-11', 0, 10], ['2026-09-12', 0, 10], ['2026-09-21', 2, 10]]);
    expect(desovesYMarea(diarios(), MAREA, { codigo: 'CH' }).dias.map((d) => d.desoves)).toEqual([0, 0, 0, 2]);
    const sala1 = desovesYMarea(diarios(), MAREA, { sala: 'Sala 1' });
    expect(sala1.dias.map((d) => [d.fecha, d.desoves, d.hembras])).toEqual([
      ['2026-09-10', 3, 20], ['2026-09-11', 2, 10], ['2026-09-12', 1, 10], ['2026-09-21', 1, 10]]);
    expect(desovesYMarea(diarios(), MAREA, { mes: '2026-08' }).dias).toEqual([]);
    expect([sala1.meses, sala1.lotes, sala1.codigos]).toEqual([['2026-09'], ['QM', 'QN'], ['CG', 'CH']]);
    expect(desovesYMarea(diarios(), MAREA, { lote: 'QZ' }), 'sin hembras en el alcance, el día no cuenta').toMatchObject({ dias: [], sinHembras: 4 });
  });

  it('🔴 «sólo en producción»: QN en cuarentena no cuenta ni sus hembras ni sus desoves hasta el 21/09', () => {
    const x = desovesYMarea(diarios(), MAREA, { soloProduccion: true });
    expect(dia(x, '2026-09-10')).toMatchObject({ desoves: 3, hembras: 20 });
    expect(dia(x, '2026-09-21')).toMatchObject({ desoves: 3, hembras: 20 });
  });

  it('🔑 sin desoves, nada', () => {
    expect(desovesDiarios({})).toEqual([]);
    expect(desovesYMarea([], MAREA)).toMatchObject({ dias: [], conMarea: 0 });
  });
});

/* 0v·1 (2026-09-29, usuario) · el panel del 🗓 Calendario lunar: la GRANJA el día pulsado, con las MISMAS reglas que la
   pestaña 🦐 Cópulas (sin sus filtros): las cópulas, Σ ÷ Σ hembras del libro al cierre (el tanque sin hembras no cuenta; un
   día sin ninguna cópula registrada es un HUECO, no un 0) y los desoves de la hoja por 100 ♀. */
describe('Maduración · operativo · 🗓 la granja un día (0v·1)', () => {
  const M = () => modeloOperativo(PLANTA, { hoy: '2026-09-28' });
  const g = (f) => { const m = M(); return granjaDelDia(partesConHembras(m.fuentes, diasDeTanque(m.fuentes.tanques)), desovesDiarios(m.fuentes), f); };

  it('🔴 las cópulas del día: Σ ÷ Σ hembras, sin el tanque vacío (y lo cuenta); la MISMA tasa que la pestaña', () => {
    const x = g('2026-09-10');
    expect(x.copulas).toMatchObject({ estado: 'ok', copulas: 4, hembras: 30, partes: 3, sinHembras: 1 });
    expect(x.copulas.tasa).toBeCloseTo(40 / 3, 9);
    expect(g('2026-09-11').copulas.tasa, 'con las hembras del cierre (murieron 10)').toBeCloseTo(20, 9);
    for (const f of ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-17', '2026-09-21']) {
      expect(g(f).copulas.tasa, f).toBeCloseTo(dia(copulasYMarea(base(), MAREA), f).tasa, 9);
    }
  });

  it('🔴 un día sin ninguna cópula registrada es un HUECO (no un 0); un día sin partes, «sin partes»', () => {
    expect(g('2026-09-18').copulas).toMatchObject({ estado: 'hueco', partes: 2, tasa: null });
    expect(g('2026-09-15').copulas).toMatchObject({ estado: 'sin-partes', partes: 0, tasa: null });
    expect(g('2026-09-17').copulas).toMatchObject({ estado: 'ok', copulas: 1, hembras: 20 });
  });

  it('🔴 los desoves del día: Σ de la hoja por 100 ♀ del libro, la MISMA tasa que la pestaña; una fila con 0, ninguno', () => {
    expect(g('2026-09-10').desoves).toMatchObject({ estado: 'ok', desoves: 3, hembras: 30 });
    expect(g('2026-09-21').desoves).toMatchObject({ estado: 'ok', desoves: 3, hembras: 20 });
    const d = desovesDiarios(M().fuentes);
    for (const f of ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-21']) {
      expect(g(f).desoves.tasa, f).toBeCloseTo(dia(desovesYMarea(d, MAREA), f).tasa, 9);
    }
    expect(g('2026-09-17').desoves).toMatchObject({ estado: 'ninguno', desoves: 0, tasa: null });
    expect(g('2026-09-18').desoves).toMatchObject({ estado: 'ninguno', desoves: 0, tasa: null });
  });

  it('🔑 con cópulas o desoves y SIN hembras en el libro no hay tasa, y se dice', () => {
    const x = granjaDelDia([{ fecha: '2026-09-30', copulas: 3, hembras: 0 }],
      [{ fecha: '2026-09-30', filas: [{ lote: 'QZ', codigo: '', desoves: 2 }], posiciones: [] }], '2026-09-30');
    expect(x.copulas).toMatchObject({ estado: 'sin-hembras', copulas: 3, hembras: 0, sinHembras: 1, tasa: null });
    expect(x.desoves).toMatchObject({ estado: 'sin-hembras', desoves: 2, hembras: 0, tasa: null });
    expect(granjaDelDia(null, null, '2026-09-30')).toMatchObject({ copulas: { estado: 'sin-partes' }, desoves: { estado: 'ninguno' } });
  });
});

describe('Maduración · operativo · 🦐 cópulas × marea · la correlación con días suficientes', () => {
  /* Doce días: la tasa sube con la amplitud; la iluminación va a su aire; Viva los de más amplitud. */
  const AMP = [0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 0.7, 1.0, 1.3, 1.6, 1.9, 2.2];
  const ILU = [10, 90, 40, 60, 20, 80, 50, 30, 70, 0, 100, 45];
  const fechas = AMP.map((_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  const b = fechas.map((f, i) => ({ fecha: f, sala: 'Sala 1', tanque: 1, copulas: Math.round(AMP[i] * 10), hembras: 100, produccion: true }));
  const mar = new Map(fechas.map((f, i) => [f, { fase: FASES_CICLO[i % 8], ilum: ILU[i], tipo: AMP[i] >= 1.5 ? 'Viva' : 'Muerta', amplitud: AMP[i] }]));

  it('🔴 r de Pearson de la tasa diaria con cada variable, y rCrit = 2/√n', () => {
    const x = copulasYMarea(b, mar);
    const tasas = b.map((d) => d.copulas);
    expect(x.rCrit).toBeCloseTo(2 / Math.sqrt(12), 12);
    expect(x.r.amplitud).toBeCloseTo(pearson(tasas.map((t, i) => [t, AMP[i]])), 12);
    expect(x.r.ilum).toBeCloseTo(pearson(tasas.map((t, i) => [t, ILU[i]])), 12);
    expect(x.r.tipo).toBeCloseTo(pearson(tasas.map((t, i) => [t, AMP[i] >= 1.5 ? 1 : 0])), 12);
  });

  it('🔴 sin variación en la tasa no hay r', () => {
    const plano = b.map((d) => ({ ...d, copulas: 5 }));
    expect(copulasYMarea(plano, mar).r).toEqual({ amplitud: null, ilum: null, tipo: null });
  });
});
