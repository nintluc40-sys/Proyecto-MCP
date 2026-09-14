/* ============================================================
   MADURACIÓN · el libro «AL CIERRE DE UN DÍA» (opción `hasta`) — D4, 2026-09-14

   «🔄 Proponer estado» de Salas propone —y al guardar ESCRIBE en la hoja— el estado de cada
   sala para la fecha elegida en la ficha. Pero el libro se construía con TODOS los eventos,
   así que qué lotes había en una sala y cuántos tanques estaban ocupados salían del estado de
   HOY aunque la fecha fuera otra: con una fecha pasada podía proponer «Desinfección» para un
   día en que la sala estaba llena. Decisión del usuario: se usa la fecha de la ficha (que por
   defecto es hoy).

   🔑 El corte vive en el LIBRO, no en la pantalla: `construirLibro(fuentes, { hoy, hasta })`
   sólo recorre los eventos de esa fecha o anteriores. Sin `hasta`, el libro es el de siempre.
   Lo mismo en el gemelo del monolito (lo fija la paridad).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { construirLibro, estadoDeSala, ESTADO_CUARENTENA, ESTADO_PRODUCCION, ESTADO_DESINFECCION } from './mad-libro.js';

/* Un lote entra el 1 en la Sala 1 (tanque 1) y el 5 se mueve ENTERO a la Sala 2 (tanque 16). */
const fuentes = () => ({
  ingresos: [{ Fecha: '2026-09-01', Lote: 'BP', 'Código genético': 'OLF5.F2', Sala: 'Sala 1', Tanque: 1, Machos: 10, Hembras: 12 }],
  movimientos: [{ Fecha: '2026-09-05', Tipo: 'Transferencia', 'Sala origen': 'Sala 1', 'Tanque origen': 1,
    'Sala destino': 'Sala 2', 'Tanque destino': 16, Machos: 10, Hembras: 12 }],
  tanques: [],
  cierres: [],
});
/* ⚠ El módulo devuelve `tanques` y `lotes` como Map (el monolito, como objetos planos). */
const vivos = (libro, uk) => { const t = libro.tanques.get(uk); return t ? [t.machos, t.hembras] : null; };

describe('Libro · la opción `hasta` corta los eventos POSTERIORES', () => {
  it('el fixture ejerce algo: sin `hasta`, el movimiento del 5 ya vació la Sala 1', () => {
    const libro = construirLibro(fuentes(), { hoy: '2026-09-06' });
    expect(vivos(libro, 'Sala 1|1')).toEqual([0, 0]);
    expect(vivos(libro, 'Sala 2|16')).toEqual([10, 12]);
    expect(libro.hasta).toBe('2026-09-05');
  });

  it('🔴 al 3, el movimiento del 5 todavía no ha pasado', () => {
    const libro = construirLibro(fuentes(), { hoy: '2026-09-03', hasta: '2026-09-03' });
    expect(vivos(libro, 'Sala 1|1')).toEqual([10, 12]);
    expect(vivos(libro, 'Sala 2|16')).toBeNull();
    expect(libro.hasta).toBe('2026-09-01');                 // el último evento que SÍ entró
  });

  it('un evento DEL MISMO día del corte sí cuenta (el libro es al cierre de ese día)', () => {
    const libro = construirLibro(fuentes(), { hoy: '2026-09-05', hasta: '2026-09-05' });
    expect(vivos(libro, 'Sala 1|1')).toEqual([0, 0]);
    expect(vivos(libro, 'Sala 2|16')).toEqual([10, 12]);
  });

  it('🔴 y con eso el ESTADO DE SALA de un día pasado es el de ese día', () => {
    const al3 = construirLibro(fuentes(), { hoy: '2026-09-03', hasta: '2026-09-03' });
    expect(estadoDeSala(al3, 'Sala 1', '2026-09-03')).toBe(ESTADO_CUARENTENA);
    expect(estadoDeSala(al3, 'Sala 2', '2026-09-03')).toBe('');   // el libro aún no la conoce
    const al6 = construirLibro(fuentes(), { hoy: '2026-09-06', hasta: '2026-09-06' });
    expect(estadoDeSala(al6, 'Sala 1', '2026-09-06')).toBe(ESTADO_DESINFECCION);
  });

  it('🔴 un 2.º ingreso POSTERIOR al corte no reinicia la cuarentena de ese día', () => {
    /* El lote copuló el 8 (Producción). Un 2.º ingreso el 20 reinicia la cuarentena… desde el 20:
       al 10 el lote sigue en Producción. Sin corte, el ingreso del 20 ya se habría aplicado. */
    const f = {
      ingresos: [
        { Fecha: '2026-08-01', Lote: 'AB', 'Código genético': 'CG1', Sala: 'Sala 1', Tanque: 2, Machos: 5, Hembras: 5 },
        { Fecha: '2026-08-20', Lote: 'AB', 'Código genético': 'CG1', Sala: 'Sala 1', Tanque: 3, Machos: 5, Hembras: 5 },
      ],
      tanques: [{ Fecha: '2026-08-08', Sala: 'Sala 1', Tanque: 2, 'Cópulas': 3 }],
    };
    expect(construirLibro(f, { hoy: '2026-08-10', hasta: '2026-08-10' }).lotes.get('AB').estado).toBe(ESTADO_PRODUCCION);
    expect(construirLibro(f, { hoy: '2026-08-21', hasta: '2026-08-21' }).lotes.get('AB').estado).toBe(ESTADO_CUARENTENA);
  });
});
