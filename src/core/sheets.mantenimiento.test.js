/* ============================================================
   🔧 MANTENIMIENTO EN LA CARGA DEL LIBRO (2026-10-28, ronda 10, Sesión B, tarea 4 · F2)

   Las cuatro hojas de Mantenimiento («Trabajos» y «Lecturas», que escribe la ficha de Registros, y «Equipos» y «Plan»,
   a mano) entran en el store como las demás, con su NOMBRE como origen (las lee la vista 🔧).
   🔴 Lo que se evita: `applySheets` saca de ellas la fecha más reciente del store (`latestDateMs`, el «hasta» de los
   botones de 7 y 30 días de las vistas de producción). Una ronda de los blowers hecha hoy no es un registro del
   laboratorio, y sin esto la movería a hoy aunque lo último de Larvicultura fuera de ayer. Datos ficticios.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { classifyOrigin, applySheets, detectSheetName } from './sheets.js';
import { store } from './store.js';
import { MNT_HOJAS, MNT_EQUIPOS_HEADERS, MNT_PLAN_HEADERS } from '../views/mantenimiento/mantenimiento.data.js';
import { MNT_TRAB_HEADERS, MNT_LECT_HEADERS } from '../views/registros/lib/ficha-mantenimiento.schema.js';

const dia = (ms) => { const d = new Date(ms); return [d.getDate(), d.getMonth() + 1, d.getFullYear()]; };

describe('Mantenimiento · sus hojas en la carga', () => {
  it('las cuatro conservan su nombre como origen (ninguna regla de producción se las queda)', () => {
    expect(MNT_HOJAS).toEqual(['Mantenimiento Trabajos', 'Mantenimiento Lecturas', 'Mantenimiento Equipos', 'Mantenimiento Plan']);
    MNT_HOJAS.forEach((h) => expect(classifyOrigin(h)).toBe(h));
  });

  it('🔴 ninguna mueve la fecha más reciente del laboratorio', () => {
    const lab = [{ _SheetOrigin: 'Larvicultura', Fecha: '25/10/2026' }];
    applySheets({ 'Datos Larvicultura - M01': lab });
    expect(dia(store.latestDateMs)).toEqual([25, 10, 2026]);
    const sheets = { 'Datos Larvicultura - M01': lab };
    MNT_HOJAS.forEach((h) => { sheets[h] = [{ _SheetOrigin: h, Fecha: '28/10/2026', 'Ajuste desde': '30/10/2026' }]; });
    applySheets(sheets);
    expect(store.globalData.filter((r) => MNT_HOJAS.includes(r._SheetOrigin)), 'las filas sí entran').toHaveLength(4);
    expect(dia(store.latestDateMs)).toEqual([25, 10, 2026]);
  });
});

/* 2026-10-29 (usuario, ronda 12, Sesión A, tarea 3: «Sí, las 4 firmas») · POR SUS COLUMNAS. En la carga de respaldo, una
   pestaña que llega sin título (y sin su XLSX) se nombra por sus cabeceras (detectSheetName): las cuatro caían en
   «Hoja<N>» y la vista 🔧 decía «Falta la hoja». Las cabeceras se piden al código que las escribe (la ficha) o que las
   lee (las dos a mano), no se teclean. Que no le roban nada a las pestañas de producción lo fija detectSheetName.test.js. */
describe('Mantenimiento · sus hojas por las COLUMNAS (respaldo sin título)', () => {
  const filaDe = (cab) => Object.fromEntries(cab.map((c) => [c, '']));
  const CAB = [MNT_TRAB_HEADERS, MNT_LECT_HEADERS, MNT_EQUIPOS_HEADERS, MNT_PLAN_HEADERS];   // el orden de MNT_HOJAS

  it('🔴 cada una se reconoce por sus columnas, igual que por su nombre', () => {
    MNT_HOJAS.forEach((h, i) => {
      expect(detectSheetName([filaDe(CAB[i])], 7), h).toBe(h);
      expect(detectSheetName([filaDe(CAB[i])], 7, h), h + ' con su título').toBe(h);
    });
  });

  it('cada una se sostiene por su firma: sin ella cae en «Hoja<N>»', () => {
    const sin = (cab, re) => cab.filter((c) => !re.test(c));
    expect(detectSheetName([filaDe(sin(MNT_TRAB_HEADERS, /^Parada/))], 7)).toBe('Hoja8');
    expect(detectSheetName([filaDe(sin(MNT_LECT_HEADERS, /^Corriente/))], 7)).toBe('Hoja8');
    expect(detectSheetName([filaDe(sin(MNT_EQUIPOS_HEADERS, /^Ajuste hor/))], 7)).toBe('Hoja8');
    expect(detectSheetName([filaDe(sin(MNT_PLAN_HEADERS, /^Intervalo/))], 7)).toBe('Hoja8');
  });

  // 2026-10-30 (usuario: «Aceptar "Unidad"») · el lector acepta «Unidad» en lugar de «Equipo»; la firma, también
  it('🔴 Trabajos y Lecturas con «Unidad» en lugar de «Equipo» se reconocen igual', () => {
    const conUnidad = (cab) => cab.map((c) => (c === 'Equipo' ? 'Unidad' : c));
    expect(MNT_TRAB_HEADERS).toContain('Equipo');
    expect(MNT_LECT_HEADERS).toContain('Equipo');
    expect(detectSheetName([filaDe(conUnidad(MNT_TRAB_HEADERS))], 7)).toBe('Mantenimiento Trabajos');
    expect(detectSheetName([filaDe(conUnidad(MNT_LECT_HEADERS))], 7)).toBe('Mantenimiento Lecturas');
  });
});
