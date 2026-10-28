/* ============================================================
   🔧 MANTENIMIENTO EN LA CARGA DEL LIBRO (2026-10-28, ronda 10, Sesión B, tarea 4 · F2)

   Las cuatro hojas de Mantenimiento («Trabajos» y «Lecturas», que escribe la ficha de Registros, y «Equipos» y «Plan»,
   a mano) entran en el store como las demás, con su NOMBRE como origen (las lee la vista 🔧).
   🔴 Lo que se evita: `applySheets` saca de ellas la fecha más reciente del store (`latestDateMs`, el «hasta» de los
   botones de 7 y 30 días de las vistas de producción). Una ronda de los blowers hecha hoy no es un registro del
   laboratorio, y sin esto la movería a hoy aunque lo último de Larvicultura fuera de ayer. Datos ficticios.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { classifyOrigin, applySheets } from './sheets.js';
import { store } from './store.js';
import { MNT_HOJAS } from '../views/mantenimiento/mantenimiento.data.js';

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
