/* ============================================================
   PLANTA · estado de maduración (tanda 3): el modelo del tablero de Maduración, en la maqueta
   Lo que se exige, con datos FICTICIOS (lotes AA–CC, código genético «C1»):
   · el estado del tanque es el de sus lotes en esa sala (Cuarentena el recién ingresado, Producción el antiguo);
   · la alerta del tanque es H:M o densidad fuera de rango, y dice cuál;
   · la alerta de la sala es temperatura u oxígeno fuera de rango en los últimos 7 días;
   · bajas, descartes y cópulas son del período de 7 días (lo de antes no cuenta);
   · la numeración que se REPITE entre salas (el tanque 1 de la Sala 4 no es el de la Sala 1).
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { estadoMaduracion, hoyLocal } from './estado.js';
import { MAD_OP_ORIGEN } from '../maduracion/operativo.fuentes.js';

const fila = (o) => ({ _SheetOrigin: MAD_OP_ORIGEN, ...o });
const ING = (fecha, lote, sala, tanque, machos, hembras) =>
  fila({ Fecha: fecha, Lote: lote, 'Código genético': 'C1', 'Camaronera origen': 'X', Sala: sala, Tanque: String(tanque), Machos: String(machos), Hembras: String(hembras) });

let E;
beforeAll(() => {
  E = estadoMaduracion([
    ING('2026-09-30', 'AA', 'Sala 2', 16, 190, 190),     // recién ingresado: Cuarentena, en rango
    ING('2026-09-30', 'AA', 'Sala 2', 21, 100, 280),     // H:M 2,8: fuera de rango
    ING('2026-08-01', 'BB', 'Sala 3', 22, 180, 180),     // antiguo: Producción
    ING('2026-08-01', 'CC', 'Sala 4', 1, 150, 150),      // el tanque 1 de la Sala 4
    ING('2026-08-01', 'CC', 'Sala 4', 9, 5, 5),          // tanque 9 en la Sala 4: fuera del catálogo (errata)
    fila({ Fecha: '2026-10-03', Sala: 'Sala 3', Tanque: '22', 'Machos muertos': '2', 'Hembras muertas': '1' }),
    fila({ Fecha: '2026-09-20', Sala: 'Sala 3', Tanque: '22', 'Machos muertos': '9' }),   // fuera de los 7 días
    fila({ Fecha: '2026-10-02', Sala: 'Sala 3', Estado: 'Producción', 'Temperatura 2:00': '40' }),
    fila({ Fecha: '2026-10-02', Sala: 'Sala 2', Estado: 'Cuarentena', 'Temperatura 2:00': '28' }),
  ], '2026-10-04');
});

describe('estado de maduración · tanques', () => {
  it('el estado de cada tanque es el de sus lotes en esa sala; el resto, vacío', () => {
    expect(E.salas.S2.tanques[16]).toMatchObject({ estado: 'Cuarentena', hembras: 190, machos: 190, alerta: false });
    expect(E.salas.S3.tanques[22]).toMatchObject({ estado: 'Producción' });
    expect(E.salas.S2.tanques[17]).toMatchObject({ estado: 'Vacío', vivos: 0 });
  });

  it('la alerta del tanque es H:M o densidad fuera de rango, y dice cuál', () => {
    expect(E.salas.S2.tanques[21]).toMatchObject({ alerta: true, motivos: ['H:M'], hmEstado: 'alto' });
    expect(E.salas.S2.alertaTanques).toBe(1);
  });

  it('bajas del período: sólo los últimos 7 días', () => {
    expect(E.periodo).toMatchObject({ desde: '2026-09-28', hasta: '2026-10-04' });
    expect(E.salas.S3.tanques[22].periodo.bajas).toBe(3);
    expect(E.salas.S3.periodo.bajas).toBe(3);
  });

  it('la numeración repetida entre salas: el tanque 1 de la Sala 4 no es el de la Sala 1', () => {
    expect(E.salas.S4.tanques[1]).toMatchObject({ vivos: 300, estado: 'Producción' });
    expect(E.salas.S1.tanques[1]).toMatchObject({ vivos: 0 });
    expect(Object.keys(E.salas.S4.tanques).map(Number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Object.keys(E.salas.S5.tanques).map(Number)).toEqual([7, 8, 9, 10, 11]);
  });
});

describe('estado de maduración · salas y resumen', () => {
  it('la sala con temperatura fuera de rango en el período lleva alerta; la otra no', () => {
    expect(E.salas.S3).toMatchObject({ alerta: true, motivos: ['Temperatura'] });
    expect(E.salas.S3.lecturas.temperatura).toMatchObject({ fuera: 1 });
    expect(E.salas.S2.alerta).toBe(false);
  });

  it('un tanque fuera del catálogo no se pinta como tanque, pero la sala lo cuenta (no esconde animales)', () => {
    expect(E.salas.S4.tanques[9]).toBeUndefined();
    expect(E.salas.S4.fueraDeCatalogo).toBe(1);
  });

  it('cada sala trae su estado registrado y el calculado por el libro', () => {
    expect(E.salas.S2.registrado.estado).toBe('Cuarentena');
    expect(E.salas.S2.propuesto.estado).toBe('Cuarentena');
    expect(E.salas.S2).toMatchObject({ ocupados: 2, total: 6, lotes: ['AA'] });
  });

  it('el resumen cuenta reproductores, tanques ocupados de los 38 del catálogo y alertas', () => {
    // las bajas TODAS descuentan vivos (también la de antes de los 7 días): 620 − 11 machos y 800 − 1 hembra
    expect(E.resumen).toMatchObject({ hembras: 799, machos: 609, ocupados: 4, tanques: 38, alertaTanques: 1, alertaSalas: 1 });
  });

  it('hoyLocal da la fecha del equipo en ISO', () => {
    expect(hoyLocal(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
