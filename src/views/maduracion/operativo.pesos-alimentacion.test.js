/* ============================================================
   MADURACIÓN · PUNTO 2 (usuario, 2026-10-04) · los pesos ♂/♀ del tanque, desde 🛢 Tanques O desde 🍤 Alimentación

   «Los pesos por macho y hembra de cada tanque, se pueden llenar de dos formas, o por la ficha de Maduración Tanques o
   por la ficha de Maduración Alimento, mientras se guarde y sincronice.»
   Decidido con el usuario: un peso tecleado A MANO en Alimentación (ya en su hoja) cuenta donde se usa el peso del
   tanque; el MISMO día, sexo a sexo, manda Tanques. Los partes del día no cambian.

   La planta (Sala 3, foto del 20/09), montada para DISTINGUIR cada regla:
   · t1 (RA, 30♂40♀) · Tanques: 10/09 ♂50 ♀70 y 12/09 sólo ♂60.
       Alimentación 12/09 «♀ Manual · ♂ Manual» ♀75 ♂99 → el ♂ NO (ese día Tanques pesó machos), el ♀ SÍ (75).
       Alimentación 15/09 «♀ Alimentación … · ♂ Biometría …» → NO: es la referencia que la ficha copió.
   · t2 (RB, 10♂20♀) · sin partes. Alimentación 14/09 «♀ Manual · ♂ Manual» ♀ «33,5» (coma) ♂22 → los dos.
   · t1 11/09 «♂ Manual» 58: cuenta como muestra del período, pero es MÁS VIEJO que el ♂60 de Tanques del 12/09.
   · t2 25/09 ♀44: posterior a la foto, no se ve.
   Con la regla rota la cifra es OTRA: ♀ t1 sería 70 (sin Alimentación), ♂ t1 99 (Alimentación ganando el mismo día) o
   el ♀ de la copia contaría el 15/09. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { modeloOperativo, diasDeTanque, fuentesAlDia } from './operativo.data.js';
import { tablaDeTanques, partesDelDia } from './operativo.tanques.js';
import { kpiBiomasa, detalleDeSala, normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { promediosDeLote } from './operativo.lotes.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { pesosDeAlimentacion, construirLibro } from '../registros/lib/mad-libro.js';
import { alimPesosDeReferencia } from '../registros/lib/ficha-maduracion-alimentacion.schema.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg) => ({ _SheetOrigin: O,
  'Camaronera origen': 'CX', Fecha: fecha, Lote: lote, 'Código genético': cg, 'Piscina Broodstock': 'P1',
  Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: 'Sala 3', Tanque: tanque,
  Hora: '08:00', Parte: 1, ...extra });
const ALI = (fecha, tanque, fuente, ph, pm) => ({ _SheetOrigin: O, Fecha: fecha, Sala: 'Sala 3', Tanque: tanque,
  'Peso hembras (g)': ph, 'Peso machos (g)': pm, 'Fuente del peso': fuente, ID: fecha + '-S3-T' + tanque });
const FOTO = '2026-09-20';
const PM = 'Peso promedio machos (g)';
const PH = 'Peso promedio hembras (g)';

const BASE = [
  ING('2026-09-01', 'RA', 'Sala 3', 1, 30, 40, 'CA'),
  ING('2026-09-01', 'RB', 'Sala 3', 2, 10, 20, 'CB'),
  TQ('2026-09-10', 1, { [PM]: 50, [PH]: 70 }),
  TQ('2026-09-12', 1, { [PM]: 60 }),
];
const ALIMENTACION = [
  ALI('2026-09-12', 1, '♀ Manual · ♂ Manual', 75, 99),
  ALI('2026-09-15', 1, '♀ Alimentación 2026-09-12 · ♂ Biometría 2026-09-12', 75, 60),
  ALI('2026-09-14', 2, '♀ Manual · ♂ Manual', '33,5', 22),
  ALI('2026-09-11', 1, '♂ Manual', '', 58),        // MÁS VIEJO que el ♂ de Tanques del 12/09: no gana el último peso
  ALI('2026-09-25', 2, '♀ Manual', 44, ''),        // DESPUÉS de la foto: no se ve
];
const M = modeloOperativo([...BASE, ...ALIMENTACION], { hoy: FOTO, fecha: FOTO });
const M0 = modeloOperativo(BASE, { hoy: FOTO, fecha: FOTO });
const P = periodoDe('30d', FOTO, M.fuentes);
const SIN = normalizarFiltro({});

describe('Punto 2 · qué cuenta de Alimentación (pesosDeAlimentacion)', () => {
  it('🔴 sólo lo tecleado a mano; el mismo día manda Tanques, sexo a sexo; la coma decimal se lee', () => {
    expect(M.fuentes.alimentacion, 'el MCP ya clasifica la hoja de Alimentación').toHaveLength(5);
    expect(pesosDeAlimentacion(M.fuentes.alimentacion, M.fuentes.tanques)).toEqual([
      { Fecha: '2026-09-12', Sala: 'Sala 3', Tanque: 1, _deAlimentacion: true, [PH]: 75 },
      { Fecha: '2026-09-14', Sala: 'Sala 3', Tanque: 2, _deAlimentacion: true, [PH]: 33.5, [PM]: 22 },
      { Fecha: '2026-09-11', Sala: 'Sala 3', Tanque: 1, _deAlimentacion: true, [PM]: 58 },
      { Fecha: '2026-09-25', Sala: 'Sala 3', Tanque: 2, _deAlimentacion: true, [PH]: 44 },
    ]);
  });

  it('sonda de casos raros: sin fuente, fecha mala, sin tanque, peso 0 o vacío → nada', () => {
    const raros = [ALI('2026-09-13', 1, '', 80, 80), ALI('13/09/2026', 1, '♀ Manual', 80, ''), ALI('2026-09-13', '', '♀ Manual', 80, ''),
      ALI('2026-09-13', 1, '♀ Manual · ♂ Manual', 0, ''), { Fecha: '2026-09-13', Sala: '', Tanque: 1, 'Fuente del peso': '♀ Manual', 'Peso hembras (g)': 80 }];
    expect(pesosDeAlimentacion(raros, [])).toEqual([]);
    expect(pesosDeAlimentacion(undefined, undefined)).toEqual([]);
  });
});

describe('Punto 2 · el MCP lee el peso de las dos fichas', () => {
  it('🔴 🛢 Tanques: el último peso de cada tanque, de la ficha que lo tenga más reciente', () => {
    const fila = (m, t) => tablaDeTanques(m, P, SIN, diasDeTanque(m.fuentes.tanques)).find((f) => f.tanque === t);
    expect([fila(M, 1).pesoHembras, fila(M, 1).pesoMachos]).toEqual([75, 60]);
    expect([fila(M, 2).pesoHembras, fila(M, 2).pesoMachos], 'un tanque sin partes también enseña su peso').toEqual([33.5, 22]);
    expect(fila(M, 2).rondas, 'pero sigue sin partes').toBe(0);
    expect([fila(M0, 1).pesoHembras, fila(M0, 2).pesoHembras], 'control: sin Alimentación').toEqual([70, '']);
  });

  it('🔴 detalle de la SALA: el último peso con su fecha', () => {
    const d = detalleDeSala(M, 'Sala 3', P, SIN, diasDeTanque(M.fuentes.tanques));
    const t = (n) => d.tanques.find((x) => x.tanque === n).peso;
    expect(t(1)).toEqual({ machos: { valor: 60, fecha: '2026-09-12' }, hembras: { valor: 75, fecha: '2026-09-12' } });
    expect(t(2)).toEqual({ machos: { valor: 22, fecha: '2026-09-14' }, hembras: { valor: 33.5, fecha: '2026-09-14' } });
  });

  it('🔴 KPI de biomasa: los pesos del período ponderados, con las muestras de Alimentación', () => {
    // ♀: t1 70 y 75 (×40 cada uno) y t2 33,5 (×20) → (2800 + 3000 + 670) ÷ 100 = 64,7
    // ♂: t1 50, 58 y 60 (×30) y t2 22 (×10) → (1500 + 1740 + 1800 + 220) ÷ 100 = 52,6 · sin Alimentación: 70 y 55
    // (el ♀44 del 25/09 queda fuera del período)
    const k = kpiBiomasa(M, SIN, P);
    expect([k.pesoHembras, k.pesoMachos]).toEqual([64.7, 52.6]);
    const k0 = kpiBiomasa(M0, SIN, P);
    expect([k0.pesoHembras, k0.pesoMachos]).toEqual([70, 55]);
  });

  it('🔴 promedios del LOTE en el período, con las muestras de Alimentación', () => {
    const ra = promediosDeLote(M, 'RA', P);
    const rb = promediosDeLote(M, 'RB', P);
    expect([ra.pesoHembras, ra.pesoMachos]).toEqual([72.5, 56]);   // ♂ (50 + 58 + 60) ÷ 3
    expect([rb.pesoHembras, rb.pesoMachos]).toEqual([33.5, 22]);
    expect([promediosDeLote(M0, 'RA', P).pesoHembras, promediosDeLote(M0, 'RB', P).pesoHembras]).toEqual([70, '']);
  });

  it('🔴 el resumen (⚖️ Saldo del MCP): el peso de cada lote, con su fecha', () => {
    const L = (m, n) => m.resumen.lotes.find((x) => x.lote === n);
    expect([L(M, 'RA').pesoHembras, L(M, 'RA').pesoMachos]).toEqual([{ valor: 75, fecha: '2026-09-12' }, { valor: 60, fecha: '2026-09-12' }]);
    expect([L(M, 'RB').pesoHembras, L(M, 'RB').pesoMachos]).toEqual([{ valor: 33.5, fecha: '2026-09-14' }, { valor: 22, fecha: '2026-09-14' }]);
    expect(L(M0, 'RB').pesoHembras).toEqual({ valor: '', fecha: '' });
  });

  it('los partes del día NO cambian: sólo dicen lo de Tanques', () => {
    expect(partesDelDia(M.fuentes, 'Sala 3', 1, '2026-09-12').partes.map((p) => [p.pesoMachos, p.pesoHembras])).toEqual([[60, '']]);
    expect(partesDelDia(M.fuentes, 'Sala 3', 2, '2026-09-14').partes).toEqual([]);
  });
});

describe('Punto 2 · la ración de Alimentación toma la referencia más reciente de las dos', () => {
  it('🔴 con su fuente: «Alimentación» o «Biometría», y la fecha', () => {
    const F0 = fuentesAlDia(M.fuentes, FOTO);   // la ficha lee la hoja el día que se usa: nada posterior
    const ref = alimPesosDeReferencia(F0, construirLibro(F0, { hoy: FOTO }));
    expect(ref['Sala 3|1']).toEqual({ hembras: { valor: 75, fuente: 'Alimentación', fecha: '2026-09-12' }, machos: { valor: 60, fuente: 'Biometría', fecha: '2026-09-12' } });
    expect(ref['Sala 3|2']).toEqual({ hembras: { valor: 33.5, fuente: 'Alimentación', fecha: '2026-09-14' }, machos: { valor: 22, fuente: 'Alimentación', fecha: '2026-09-14' } });
  });
});
