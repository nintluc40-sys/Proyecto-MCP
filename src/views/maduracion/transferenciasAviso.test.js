// @vitest-environment happy-dom
/* Registro reproductivo · clasificación de sus 3 hojas + aviso de derivación a ciegas.
   ------------------------------------------------------------------
   Contexto medido el 2026-08-31 contra la hoja viva:
     · «Maduración Transferencias» NO EXISTE (0 filas, 0 cabeceras) — el módulo está
       completo y nunca se ha estrenado, igual que Patología en Fresco.
     · «Maduración Bitácora» tiene 1.970 filas y las 1.970 traen Sala Y Tanque, así que
       la derivación por Trovan NO se ejecuta ni una vez en producción.
   De ahí las dos cosas que se fijan aquí:
     A · las 3 hojas se identifican por columnas cuando el gid llega SIN título (antes
         caían al final y salían como "Hoja<N>", con lo que la vista quedaba vacía);
     B · el aviso de «derivación a ciegas» sale SÓLO cuando de verdad hace falta, para
         no convertirse en ruido permanente. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { detectSheetName, classifyOrigin } from '../../core/sheets.js';
import { maduracionView } from './index.js';

// Cabeceras REALES, copiadas de la hoja viva (MATRIZ y Bitácora) y de
// REPRO_TRANSFER_HEADERS (Transferencias, que aún no existe).
const H_MATRIZ = ['Número', 'Trovan ID', 'Color anillo', 'Piscina', 'Código genético', 'Lote',
  'Sala actual', 'Tanque actual', 'Estado', 'Fecha muerte', 'Fecha ingreso', 'Observaciones'];
const H_BITACORA = ['Trovan ID', 'Fecha', 'Tipo', 'Sala', 'Tanque', 'Observaciones'];
const H_TRANSFER = ['TR-ID', 'Fecha', 'Tipo', 'Trovan ID', 'Sala origen', 'Tanque origen',
  'Sala destino', 'Tanque destino', 'Mezcla', 'Lotes presentes', 'Códigos presentes',
  'Piscinas presentes', 'Observaciones'];
// Vecinas que NO deben caer en la rama del Trovan (cabeceras reales de producción).
const H_MAD_SALA = ['Fecha', 'Sala', 'Estado', 'Temperatura 2:00', 'Oxígeno 06:00', 'RAS'];
const H_MAD_TANQUES = ['Fecha', 'Sala', 'Lote', 'Tanque', 'Relación H:M',
  'Población inicial hembras', 'Población inicial machos', 'Machos muertos', 'Hembras muertas', 'Cópulas', 'Muda'];
const H_MAD_LOTES = ['Fecha', 'Sala', 'Fila', 'Lote', 'Historial', 'Total de nauplios',
  'Total de huevos', 'N2 por lote', 'Desoves por lote', 'No viables por lote'];

const fila = (headers) => [Object.fromEntries(headers.map((h) => [h, '']))];

describe('A · las 3 hojas del Registro reproductivo se identifican por columnas', () => {
  it('Transferencias por su TR-ID', () => {
    expect(detectSheetName(fila(H_TRANSFER), 1)).toBe('Maduración Transferencias');
  });
  it('MATRIZ por «Sala actual» / «Color anillo»', () => {
    expect(detectSheetName(fila(H_MATRIZ), 2)).toBe('Maduración MATRIZ');
  });
  it('Bitácora como el resto de hojas con Trovan', () => {
    expect(detectSheetName(fila(H_BITACORA), 3)).toBe('Maduración Bitácora');
  });

  // El orden importa: Transferencias TAMBIÉN tiene «Trovan ID», y MATRIZ no tiene TR-ID.
  it('Transferencias NO se confunde con Bitácora pese a llevar Trovan ID', () => {
    expect(detectSheetName(fila(H_TRANSFER), 4)).not.toBe('Maduración Bitácora');
  });

  it('las hojas OPERATIVAS de Maduración no caen en la rama del Trovan', () => {
    for (const [h, n] of [[H_MAD_SALA, 'Sala'], [H_MAD_TANQUES, 'Tanques'], [H_MAD_LOTES, 'Lotes']]) {
      const got = detectSheetName(h.length ? fila(h) : [], 9, '');
      expect(got, 'Maduración ' + n).not.toMatch(/^Maduración (MATRIZ|Bitácora|Transferencias)$/);
    }
  });

  it('el origen que produce casa EXACTO con el que consume la vista', () => {
    // src/views/maduracion/data.js compara contra estas cadenas literales.
    expect(classifyOrigin('Maduración Transferencias')).toBe('Maduración Transferencias');
    expect(detectSheetName(fila(H_TRANSFER), 1)).toBe(classifyOrigin('Maduración Transferencias'));
    expect(detectSheetName(fila(H_MATRIZ), 2)).toBe(classifyOrigin('Maduración MATRIZ'));
    expect(detectSheetName(fila(H_BITACORA), 3)).toBe(classifyOrigin('Maduración Bitácora'));
  });
});

/* ── B · el aviso de derivación a ciegas ──────────────────────────────── */
const M = (o) => ({ _SheetOrigin: 'Maduración MATRIZ', ...o });
const B = (o) => ({ _SheetOrigin: 'Maduración Bitácora', ...o });
const TR = (o) => ({ _SheetOrigin: 'Maduración Transferencias', ...o });
const AVISO = 'sin Sala/Tanque propios';

const matriz = [
  M({ 'Trovan ID': 'A1', 'Número': '1', 'Sala actual': 'Sala 2', 'Tanque actual': 'Tanque 18', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' }),
  M({ 'Trovan ID': 'A2', 'Número': '2', 'Sala actual': 'Sala 2', 'Tanque actual': 'Tanque 18', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' }),
];

let root;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'maduracion';
  document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; });

const pintar = (filas) => { store.globalData = [...matriz, ...filas]; maduracionView(root); return root.textContent || ''; };

describe('B · aviso de derivación a ciegas', () => {
  it('NO sale con el dato REAL de hoy: todo con snapshot y sin transferencias', () => {
    const txt = pintar([
      B({ 'Trovan ID': 'A1', Fecha: '2026-07-03', Tipo: 'Desove', Sala: 'Sala 1', Tanque: 'Tanque 3' }),
      B({ 'Trovan ID': 'A2', Fecha: '2026-07-04', Tipo: 'Desove', Sala: 'Sala 1', Tanque: 'Tanque 3' }),
    ]);
    expect(txt).not.toContain(AVISO);
  });

  // ⚠ EL CASO QUE JUSTIFICA EL AVISO: sin ubicación propia y sin transferencias, cada
  // evento hereda la posición de HOY de su hembra.
  it('SÍ sale cuando hay eventos sin ubicación y NINGUNA transferencia', () => {
    const txt = pintar([
      B({ 'Trovan ID': 'A1', Fecha: '2026-07-03', Tipo: 'Desove' }),
      B({ 'Trovan ID': 'A2', Fecha: '2026-07-04', Tipo: 'Desove' }),
    ]);
    expect(txt).toContain(AVISO);
    expect(txt).toContain('2 evento(s)');
    expect(txt).toContain('Maduración Transferencias');
  });

  it('NO sale si hay eventos sin ubicación pero SÍ transferencias con que reconstruir', () => {
    const txt = pintar([
      B({ 'Trovan ID': 'A1', Fecha: '2026-07-03', Tipo: 'Desove' }),
      TR({ 'TR-ID': 'TR-1', Fecha: '2026-06-01', Tipo: 'Traslado', 'Trovan ID': 'A1',
        'Sala origen': 'Sala 1', 'Tanque origen': 'Tanque 3', 'Sala destino': 'Sala 5', 'Tanque destino': 'Tanque 5' }),
    ]);
    expect(txt).not.toContain(AVISO);
  });

  it('cuenta sólo los eventos derivados, no todos', () => {
    const txt = pintar([
      B({ 'Trovan ID': 'A1', Fecha: '2026-07-03', Tipo: 'Desove' }),                                     // derivado
      B({ 'Trovan ID': 'A2', Fecha: '2026-07-04', Tipo: 'Desove', Sala: 'Sala 1', Tanque: 'Tanque 3' }), // snapshot
    ]);
    expect(txt).toContain('1 evento(s)');
    expect(txt).not.toContain('2 evento(s)');
  });
});
