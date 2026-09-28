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
   · La lectura: con menos de 10 días con marea no se lee nada; con más, una correlación cuenta si |r| ≥ 2/√n.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { partesConHembras, copulasYMarea, MIN_DIAS_LECTURA, CICLO_LUNAR_DIAS } from './operativo.mareas.js';
import { modeloOperativo, diasDeTanque } from './operativo.data.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { FASES_CICLO } from './data.js';
import { pearson } from '../../core/util.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: fecha, Lote: lote,
  'Código genético': 'CG', 'Piscina Broodstock': 'P9', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
/* QM — Sala 1, tanque 1 (10♂ 20♀), ingreso 01/08: produce desde el 16/08. El 11/09 mueren 10 hembras.
   QN — Sala 2, tanque 16 (10♂ 10♀), ingreso 05/09: en cuarentena hasta el 20/09. El tanque 2 de la Sala 1, vacío. */
const PLANTA = [
  ING('2026-08-01', 'QM', 'Sala 1', 1, 10, 20),
  ING('2026-09-05', 'QN', 'Sala 2', 16, 10, 10),
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

  it('🔑 sin partes, nada; sin libro, los partes sin hembras', () => {
    expect(partesConHembras({}, [])).toEqual([]);
    expect(partesConHembras({}, [{ fecha: '2026-09-10', sala: 'Sala 1', tanque: 1, copulas: 2 }])).toEqual([
      { fecha: '2026-09-10', sala: 'Sala 1', tanque: 1, copulas: 2, hembras: 0, produccion: false }]);
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

  it('🔑 con menos de 10 días con marea no se lee nada, aunque haya r', () => {
    const x = copulasYMarea(base(), MAREA);
    expect(x.conMarea).toBeLessThan(MIN_DIAS_LECTURA);
    expect(x.r.amplitud).not.toBeNull();
    expect(x.lectura).toEqual({ clave: 'pocos', señales: [] });
    expect(copulasYMarea([], MAREA).lectura.clave).toBe('sin-datos');
    expect(copulasYMarea(base(), new Map()).lectura.clave).toBe('sin-datos');
  });
});

describe('Maduración · operativo · 🦐 cópulas × marea · la lectura con días suficientes', () => {
  /* Doce días: la tasa sube con la amplitud; la iluminación va a su aire; Viva los de más amplitud. */
  const AMP = [0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 0.7, 1.0, 1.3, 1.6, 1.9, 2.2];
  const ILU = [10, 90, 40, 60, 20, 80, 50, 30, 70, 0, 100, 45];
  const fechas = AMP.map((_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  const b = fechas.map((f, i) => ({ fecha: f, sala: 'Sala 1', tanque: 1, copulas: Math.round(AMP[i] * 10), hembras: 100, produccion: true }));
  const mar = new Map(fechas.map((f, i) => [f, { fase: FASES_CICLO[i % 8], ilum: ILU[i], tipo: AMP[i] >= 1.5 ? 'Viva' : 'Muerta', amplitud: AMP[i] }]));

  it('🔴 r de Pearson de la tasa diaria con cada variable, y rCrit = 2/√n; cuenta la que llega a |r| ≥ rCrit', () => {
    const x = copulasYMarea(b, mar);
    const tasas = b.map((d) => d.copulas);
    expect(x.rCrit).toBeCloseTo(2 / Math.sqrt(12), 12);
    expect(x.r.amplitud).toBeCloseTo(pearson(tasas.map((t, i) => [t, AMP[i]])), 12);
    expect(x.r.ilum).toBeCloseTo(pearson(tasas.map((t, i) => [t, ILU[i]])), 12);
    expect(x.r.tipo).toBeCloseTo(pearson(tasas.map((t, i) => [t, AMP[i] >= 1.5 ? 1 : 0])), 12);
    expect(Math.abs(x.r.ilum)).toBeLessThan(x.rCrit);
    expect(x.lectura.clave).toBe('posible');
    expect(x.lectura.señales.map((s) => s.que)).toEqual(['amplitud', 'tipo']);
  });

  it('🔴 sin variación en la tasa no hay r, y la lectura es «sin señal»', () => {
    const plano = b.map((d) => ({ ...d, copulas: 5 }));
    const x = copulasYMarea(plano, mar);
    expect(x.r).toEqual({ amplitud: null, ilum: null, tipo: null });
    expect(x.lectura).toEqual({ clave: 'sin-senal', señales: [] });
  });
});
