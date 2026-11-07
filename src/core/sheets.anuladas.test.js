/* ============================================================
   A10 (2026-11-06, usuario: «Sin tocar el Apps Script») · LAS FILAS «⛔ ANULADA» NO ENTRAN EN EL STORE

   Al corregir en Registros la fecha (o la corrida) de un análisis ya enviado —Microbiología, Calidad de Agua, Patología—,
   o al vaciar un tanque del Score o cambiar su evaluación de día, la fila vieja de la hoja se sobrescribe con una que
   lleva «⛔ ANULADA · …» en «Responsable» (laboratorio) o en «Interpretación» (Score). El Apps Script no sabe borrarla, y
   ninguna vista debe contarla: `applySheets` no la carga. Sólo en esas cuatro hojas y en esa columna. Datos ficticios.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { applySheets, filaAnulada, filaDesinfVacia, MARCA_ANULADA } from './sheets.js';
import { store } from './store.js';

const ANUL = MARCA_ANULADA + ' · pasó al 07/11/2026';
const MIC = (fecha, resp) => ({ _SheetOrigin: 'Microbiología', 'Fecha muestreo': fecha, Responsable: resp, Sesión: 's1' });
const CAL = (fecha, resp) => ({ _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': fecha, Responsable: resp, Sesión: 'c1' });
const PAT = (fecha, resp) => ({ _SheetOrigin: 'Patología en Fresco', 'Fecha muestreo': fecha, Responsable: resp, Sesión: 'p1' });
const SCO = (fecha, interp, score) => ({ _SheetOrigin: 'Registro_Score', Fecha: fecha, Tanque: 3, Score: score, Interpretación: interp });

describe('A10 · las filas anuladas desde Registros', () => {
  it('🔴 no entran en el store: laboratorio por «Responsable», Score por «Interpretación»', () => {
    applySheets({
      Microbiología: [MIC('2026-11-06', ANUL), MIC('2026-11-07', 'Analista A')],
      'Calidad de Agua': [CAL('2026-11-06', ANUL), CAL('2026-11-07', 'Analista B')],
      'Patología en Fresco': [PAT('2026-11-06', ANUL), PAT('2026-11-07', 'Analista C')],
      Registro_Score: [SCO('2026-11-06', ANUL, ''), SCO('2026-11-07', 'Buena calidad', 90)],
    });
    expect(store.globalData).toHaveLength(4);
    expect(store.globalData.every((r) => !String(r.Responsable || r.Interpretación).startsWith(MARCA_ANULADA))).toBe(true);
  });

  it('la marca sólo vale en esas hojas y en esa columna', () => {
    expect(filaAnulada({ _SheetOrigin: 'Larvicultura', Responsable: ANUL })).toBe(false);
    expect(filaAnulada({ _SheetOrigin: 'Microbiología', Observaciones: ANUL, Responsable: 'Analista A' })).toBe(false);
    expect(filaAnulada({ _SheetOrigin: 'Registro_Score', Responsable: ANUL, Interpretación: 'Buena calidad' })).toBe(false);
    expect(filaAnulada({ _SheetOrigin: 'Microbiología', Responsable: '  ' + ANUL })).toBe(true);   // con espacios delante
    expect(filaAnulada(null)).toBe(false);
  });

  it('un nombre que sólo la contiene más adelante no es una anulación', () => {
    expect(filaAnulada({ _SheetOrigin: 'Calidad de Agua', Responsable: 'Analista ' + MARCA_ANULADA })).toBe(false);
  });
});

/* Revisión de la B (2026-11-07) · A10 manda EN BLANCO —sin Estado ni Observaciones— la fila de Desinfección de un elemento
   desmarcado, para que la hoja quede en «—». No es un registro: no entra en el store. */
const DX = (estado, obs) => ({ _SheetOrigin: 'Registro_Desinfección', Fecha: '2026-11-06', 'Módulo': 'M01', Corrida: '601',
  'Tipo de Registro': 'Desinfección de módulo larvicultura', 'Categoría': 'Materiales', Elemento: 'Reservorio', Estado: estado, Observaciones: obs });

describe('A10 · las filas de Desinfección vaciadas desde Registros', () => {
  it('🔴 no entran en el store; con Estado u Observaciones, sí', () => {
    applySheets({ 'Registro_Desinfección': [DX('', ''), DX('Sí', ''), DX('', 'Lavado dos veces'), DX('  ', ' ')] });
    expect(store.globalData.map((r) => [r.Estado, r.Observaciones])).toEqual([['Sí', ''], ['', 'Lavado dos veces']]);
  });

  it('sólo en esa hoja: una fila sin Estado de otra hoja no se toca', () => {
    expect(filaDesinfVacia({ ...DX('', ''), _SheetOrigin: 'Larvicultura' })).toBe(false);
    expect(filaDesinfVacia(DX('No', ''))).toBe(false);
    expect(filaDesinfVacia(DX('', ''))).toBe(true);
    expect(filaDesinfVacia(null)).toBe(false);
  });
});
