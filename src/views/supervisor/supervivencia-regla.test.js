/* ============================================================
   A22 (2026-11-06, usuario; C4) · UNA SOLA SUPERVIVENCIA CON LOS MISMOS DATOS

   LO QUE PASABA: la supervivencia del módulo se calculaba en cinco sitios con reglas distintas, y con los mismos datos
   salían cifras distintas: el KPI del Supervisor (`survival`), la curva
   día a día (`moduleSvPopSeries`), el relleno del ICL (`svPopByDay`), Producción Omarsa (`modCorStats`) y la tabla de
   Siembras.

   LA REGLA OFICIAL (decisiones del usuario):
   · un tanque en 0 (vaciado o agrupado) cuenta como 0;
   · con siembra escalonada, cada día entran sólo los tanques ya sembrados;
   · un tanque entra sólo con un conteo POSTERIOR al de su siembra («No, hasta su 2.º conteo»);
   · la tabla de Siembras mide otra cosa a propósito —hasta el traslado, sin el despacho— y se rotula «Superv. al
     traslado»: no entra en esta comparación.

   El fixture junta los tres casos: TQ1 normal, TQ2 sembrado dos días después, TQ4 vaciado y TQ3 recién sembrado (sólo
   su conteo de siembra). El 06/06: (850 + 1700 + 0) / (1000 + 2000 + 800) = 67,1 %. Datos ficticios.
   ============================================================ */
import { describe, it, expect, afterEach } from 'vitest';
import { modStats, tankStats } from './stats.js';
import { moduleSvPopSeries } from './moduleTrends.js';
import { svPopByDay } from './params.js';
import { modCorStats } from '../../core/prodCalendar.js';
import { store } from '../../core/store.js';

const lv = (tq, fecha, pob) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: tq, Fecha: fecha, 'Población': String(pob) });
const FILAS = [
  lv('TQ1', '01/06/2026', 1000), lv('TQ1', '05/06/2026', 900), lv('TQ1', '06/06/2026', 850),
  lv('TQ2', '03/06/2026', 2000), lv('TQ2', '06/06/2026', 1700),
  lv('TQ4', '01/06/2026', 800), lv('TQ4', '05/06/2026', 0),
  lv('TQ3', '06/06/2026', 500),
];
const ESPERADA = (2550 / 3800) * 100;
const ctx = () => ({ larvWin: FILAS, larvCM: FILAS, tanqWin: [] });

afterEach(() => { store.globalData = []; });

describe('A22 · la misma supervivencia en los cuatro cálculos del módulo', () => {
  it('🔴 KPI del Supervisor', () => {
    expect(modStats(ctx(), 'M01', '580').sv).toBeCloseTo(ESPERADA, 6);
  });

  it('🔴 la curva día a día, en su último día', () => {
    expect(moduleSvPopSeries(ctx(), 'M01', '580').sv.at(-1)).toBeCloseTo(ESPERADA, 6);
  });

  it('🔴 el relleno del ICL', () => {
    expect(svPopByDay(FILAS, ['06/06/2026'])[0]).toBeCloseTo(ESPERADA, 6);
  });

  it('🔴 Producción Omarsa (modCorStats)', () => {
    store.globalData = FILAS;
    expect(modCorStats('M01', '580').superv).toBeCloseTo(ESPERADA, 6);
  });

  it('«Pob. actual» y «Pob. inicial» siguen contando el tanque recién sembrado', () => {
    const s = modStats(ctx(), 'M01', '580');
    expect(s.pop).toBe(850 + 1700 + 0 + 500);
    expect(s.popFirst).toBe(1000 + 2000 + 800 + 500);
  });

  it('el tanque con sólo su conteo de siembra no tiene supervivencia todavía; el vaciado, 0 %', () => {
    expect(tankStats(ctx(), 'M01', 'TQ3', '580').sv).toBeNull();
    expect(tankStats(ctx(), 'M01', 'TQ4', '580').sv).toBe(0);
  });
});
