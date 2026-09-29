/* ============================================================
   MADURACIÓN · OPERATIVO · el filtro de CÓDIGO GENÉTICO con las PAREJAS (0r·4 · H2, 2026-09-28, usuario)

   Los Desoves de un lote en pareja escriben su código como «C1/C2» (el «📥 Cargar» de la ficha), y el filtro lo
   ofrece así; pero las posiciones del libro llevan los códigos SUELTOS (una fila de Ingreso por código). Elegir la
   pareja dejaba el tablero y los reportes a cero (visto con datos reales: «Vivos 0 · Lotes 0»). Regla decidida: una
   pareja cuenta como SUS DOS códigos y casan si comparten alguno —«C1/C2» trae lo de C1, lo de C2 y lo de la pareja;
   «C1» trae también el desove de la pareja (cuenta ENTERO en cada uno de sus códigos, como el despacho en cada
   destino)—. Aquí se recorren los sitios que filtran por código, cada uno por su función pública.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { modeloOperativo } from './operativo.data.js';
import { normalizarFiltro, periodoDe, posicionEnFiltro, kpiReproduccion, mapaDePlanta, codigoEnFiltro } from './operativo.tablero.js';
import { tablaDePiscinas } from './operativo.broodstock.js';
import { cruceConMicrochips } from './operativo.cruce.js';
import { graficoReproduccion } from './operativo.kpis.js';
import { tablaDeReproduccion } from './operativo.reproduccion.js';
import { buildReproModel } from './data.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, cg, piscina) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: fecha,
  Lote: lote, 'Código genético': cg, 'Piscina Broodstock': piscina, Sala: sala, Tanque: tanque, Machos: 10, Hembras: 10 });
const DES = (fecha, lote, cg, desoves) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': cg, Desoves: desoves,
  'Total de huevos': 1000 * desoves, N2: 100 * desoves, N5: 50 * desoves });
const BS = (corte, piscina, cg) => ({ _SheetOrigin: O, 'Pl/g': '', 'Fecha de corte': corte, Piscina: piscina, 'Código genético': cg });
const CHIP = (n, lote, sala, tanque, cg) => ({ 'Trovan ID': 'FAKE' + String(n).padStart(6, '0'), Piscina: 'PZ1',
  'Código genético': cg, Lote: lote, 'Sala actual': sala, 'Tanque actual': tanque, Estado: 'Vivo', 'Fecha ingreso': '2026-09-01' });

const FOTO = '2026-09-19';
/* QP · la PAREJA: C1 en el t1 y C2 en el t2 de la Sala 1 (en tanques distintos, como uno de los dos lotes reales);
   su desove se escribe «C1/C2». QS · C1 solo, en el t4 de la Sala 2. QT · C3, en el t5 de la Sala 2. */
const PLANTA = [
  ING('2026-09-01', 'QP', 'Sala 1', 1, 'C1', '9701'), ING('2026-09-01', 'QP', 'Sala 1', 2, 'C2', '9702'),
  ING('2026-09-02', 'QS', 'Sala 2', 4, 'C1', '9703'), ING('2026-09-02', 'QT', 'Sala 2', 5, 'C3', '9704'),
  DES('2026-09-15', 'QP', 'C1/C2', 2), DES('2026-09-16', 'QS', 'C1', 1), DES('2026-09-16', 'QT', 'C3', 4),
  BS('2026-09-10', '9701', 'C1'), BS('2026-09-10', '9702', 'C2'), BS('2026-09-10', '9704', 'C3'),
];
const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const P30 = periodoDe('30d', FOTO, M.fuentes);
const F = (codigo) => normalizarFiltro({ codigo });
const PAR = F('C1/C2');

describe('Maduración · operativo · la pareja de códigos cuenta como SUS DOS códigos (0r·4 · H2)', () => {
  it('🔴 la regla: casan si comparten un código, en los dos sentidos', () => {
    expect(codigoEnFiltro('C1', PAR)).toBe(true);
    expect(codigoEnFiltro('C2', PAR)).toBe(true);
    expect(codigoEnFiltro('C1/C2', PAR)).toBe(true);
    expect(codigoEnFiltro('C3', PAR)).toBe(false);
    expect(codigoEnFiltro('C1/C2', F('c 1')), 'con la forma canónica').toBe(true);
    expect(codigoEnFiltro('C2/C3', F('C1'))).toBe(false);
    expect(codigoEnFiltro('', F('C1'))).toBe(false);
    expect(codigoEnFiltro('lo que sea', F('')), 'sin código en el filtro, todo casa').toBe(true);
  });

  it('🔴 las posiciones del libro: la pareja trae las de C1 y las de C2', () => {
    const lotesCon = (f) => [...new Set(M.libro.posiciones.filter((p) => posicionEnFiltro(p, f)).map((p) => p.lote))].sort();
    expect(lotesCon(PAR)).toEqual(['QP', 'QS']);
    expect(lotesCon(F('C2'))).toEqual(['QP']);
    expect(lotesCon(F('C3'))).toEqual(['QT']);
  });

  it('🔴 los desoves: el de la pareja cuenta ENTERO en cada uno de sus códigos (KPI y su gráfico)', () => {
    const d = (f) => kpiReproduccion(M.fuentes.desoves, P30, f).desoves;
    expect(d(PAR)).toBe(3);                  // QP (2) + QS (1)
    expect(d(F('C1'))).toBe(3);              // QS y el de la pareja
    expect(d(F('C2'))).toBe(2);              // sólo el de la pareja
    expect(d(F('C3'))).toBe(4);
    const g = (f) => graficoReproduccion(M.fuentes.desoves, P30, f).series.find((s) => s.clave === 'desoves').datos.reduce((a, x) => a + x, 0);
    expect([g(PAR), g(F('C2'))], 'el gráfico suma lo mismo que la tarjeta').toEqual([3, 2]);
  });

  it('🔴 la tabla de reproducción por lote', () => {
    const lotes = (f) => tablaDeReproduccion(M, P30, f).map((r) => r.lote);
    expect(lotes(F('C2'))).toEqual(['QP']);
    expect(lotes(PAR)).toEqual(['QP', 'QS']);
  });

  it('🔴 el mapa de planta: los tanques de la pareja quedan dentro del filtro', () => {
    const dentro = (f) => mapaDePlanta(M.libro, f).salas.flatMap((s) => s.tanques.filter((t) => t.enFiltro && t.vivos > 0).map((t) => s.sala + '·' + t.tanque));
    expect(dentro(PAR)).toEqual(['Sala 1·1', 'Sala 1·2', 'Sala 2·4']);
    expect(dentro(F('C3'))).toEqual(['Sala 2·5']);
  });

  it('🔴 Broodstock: las piscinas de sus dos códigos, en la tabla y en «sin Broodstock»', () => {
    const t = tablaDePiscinas(M, PAR);
    expect(t.piscinas.map((p) => p.piscina).sort()).toEqual(['9701', '9702']);
    expect(t.sinBroodstock, 'la 9703 (QS, C1) no tiene cortes: se nombra').toEqual(['9703']);
  });

  it('🔴 el cruce con 🧬 Microchips: los lotes de la pareja', () => {
    const repro = buildReproModel([CHIP(1, 'QP', 'Sala 1', 'Tanque 1', 'C1'), CHIP(2, 'QP', 'Sala 1', 'Tanque 2', 'C2'),
      CHIP(3, 'QS', 'Sala 2', 'Tanque 4', 'C1'), CHIP(4, 'QT', 'Sala 2', 'Tanque 5', 'C3')], [], []);
    const lotes = (f) => cruceConMicrochips(repro, M.libro, M.fuentes, P30, f).resumen.map((r) => r.lote).sort();
    expect(lotes(PAR)).toEqual(['QP', 'QS']);
    expect(lotes(F('C3'))).toEqual(['QT']);
  });
});
