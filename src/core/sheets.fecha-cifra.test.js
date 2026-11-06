/* ============================================================
   A32 (2026-11-06) · UNA CIFRA SUELTA EN «Fecha» NO MUEVE «LO MÁS RECIENTE»

   `applySheets` saca de las fechas de todas las filas la más reciente del store (`latestDateMs`, el «hasta» de los
   botones de 7 y 30 días). Una celda «20000» en `Fecha` la leía el parser nativo como el AÑO 20000, y esos botones
   quedaban anclados allí, sin datos. Ahora una cifra fuera de la ventana del serial de Excel no es una fecha
   (`parseAnyDate`). Datos ficticios.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { applySheets } from './sheets.js';
import { store } from './store.js';

const dia = (ms) => { const d = new Date(ms); return [d.getDate(), d.getMonth() + 1, d.getFullYear()]; };

describe('A32 · «Fecha» con una cifra suelta', () => {
  it('🔴 «20000» (o «0») en Fecha no lleva la fecha más reciente a otro año', () => {
    applySheets({
      'Datos Larvicultura - M01': [
        { _SheetOrigin: 'Larvicultura', Fecha: '25/10/2026' },
        { _SheetOrigin: 'Larvicultura', Fecha: '20000' },
        { _SheetOrigin: 'Larvicultura', Fecha: '0' },
      ],
    });
    expect(dia(store.latestDateMs)).toEqual([25, 10, 2026]);
  });

  it('un serial de Excel de verdad sí cuenta', () => {
    applySheets({ 'Datos Larvicultura - M01': [{ _SheetOrigin: 'Larvicultura', Fecha: '25/10/2026' }, { _SheetOrigin: 'Larvicultura', Fecha: '46325' }] });
    expect(dia(store.latestDateMs)).toEqual([30, 10, 2026]);   // 46325 = 30/10/2026
  });
});
