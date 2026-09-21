/* ============================================================
   MADURACIÓN · OPERATIVO — REPRODUCCIÓN (F4.2)

   Qué se exige, con fixtures montados para DISTINGUIR: si la regla se rompe, la cifra es OTRA.

   · PENDIENTE = sin CIFRA de N5. El fixture trae los tres casos que lo deciden, y cada uno da otro veredicto
     si la regla se afloja: uno con N5, uno con FECHA de N5 pero sin cifra (pendiente) y uno con N5 = 0
     (COMPLETO: cero es una medición). Mirar la fecha, o tratar el 0 como vacío, se ve en el recuento.
   · La FERTILIDAD sólo sobre los huevos que ya tienen su N2: RD tiene 3 desoves y sólo uno contado, así que
     es 300/400 = 75 %, no 300/1000 = 30 %.
   · Los NAUPLIOS POR HEMBRA sólo sobre los desoves que ya tienen su N5: 200/2 = 100, no 200/6 ≈ 33.
   · N5 NO se compara con N2: el módulo no expone ningún cociente entre los dos, y esta prueba lo vigila.
   · Los DÍAS DE ESPERA se miden desde la fecha ESPERADA del N5 (el día siguiente al desove), no desde el
     desove: uno de ayer aún no llega tarde.
   · El DESPACHO no se reparte: un desove con dos destinos cuenta en los dos y se informa de ello, así que
     las columnas NO suman el total.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  esPendiente, pendientesDeN5, tablaDeReproduccion, destinosDeDespacho, totalesDeReproduccion,
  ignoraDeReproduccion,
} from './operativo.reproduccion.js';
import { modeloOperativo } from './operativo.data.js';
import { normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { readFileSync } from 'node:fs';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg = 'CA') => ({ _SheetOrigin: O,
  'Camaronera origen': 'CX', Fecha: fecha, Lote: lote, 'Código genético': cg, 'Piscina Broodstock': 'P1',
  Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
/* Una fila de «Maduración Lotes» (la hoja de Desoves), con las unidades de la HOJA (ya ×1000). */
const DES = (fecha, lote, desoves, huevos, extra) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote,
  'Código genético': 'CA', 'Piscina Broodstock': 'P1', Desoves: desoves, 'Total de huevos': huevos,
  'Hembras no viables': 0, 'Fecha N2': '', N2: '', 'Fecha N5': '', N5: '', Despacho: '', Observaciones: '',
  ...extra });

const FOTO = '2026-09-20';

/* Los desoves de las pruebas, todos del lote RD salvo donde se diga:
   · 09-10 · 2 desoves, 400 mil huevos, N2 300 mil y N5 200 mil → el ÚNICO completo y con N2
   · 09-12 · 2 desoves, 300 mil huevos, con FECHA de N5 pero SIN cifra → PENDIENTE (la fecha no completa)
   · 09-14 · 2 desoves, 300 mil huevos, N5 = 0 → COMPLETO (cero es una medición)
   · 09-19 · RE, 1 desove, sin N5 → pendiente, pero de AYER: aún no llega tarde
   Despachos: el del 09-10 va a DOS destinos; el del 09-14 a uno. */
const PLANTA = [
  ING('2026-09-01', 'RD', 'Sala 3', 1, 20, 40),
  ING('2026-09-01', 'RE', 'Sala 3', 2, 10, 20),

  DES('2026-09-10', 'RD', 2, 400000, { 'Fecha N2': '2026-09-10', N2: 300000, 'Fecha N5': '2026-09-11',
    N5: 200000, Despacho: 'Tabasca, Hisenor' }),
  // ⚠ Las «Hembras no viables» van en CERO en todas menos ésta a propósito: con todas a cero, quitar su
  // acumulador daba el mismo cero y la mutación R07 del banco sobrevivía sin que nadie se enterara.
  DES('2026-09-12', 'RD', 2, 300000, { 'Fecha N5': '2026-09-13', 'Hembras no viables': 3 }),
  DES('2026-09-14', 'RD', 2, 300000, { 'Fecha N5': '2026-09-15', N5: 0, Despacho: 'Tabasca' }),
  DES('2026-09-19', 'RE', 1, 100000, {}),
];

const M = modeloOperativo(PLANTA, { fecha: FOTO, hoy: FOTO });
const P30 = periodoDe('30d', FOTO, M.fuentes);
const F = (extra) => normalizarFiltro({ ...(extra || {}) }, M.indice);
const SIN = F();

describe('Maduración · operativo · 🥚 Reproducción (F4.2)', () => {
  describe('la regla de PENDIENTE', () => {
    it('🔑 pendiente = sin CIFRA de N5: la fecha sola no completa, y el CERO sí', () => {
      const [conN5, soloFecha, cero] = M.fuentes.desoves;
      expect(esPendiente(conN5)).toBe(false);
      expect(esPendiente(soloFecha)).toBe(true);    // tiene «Fecha N5» y ninguna cifra
      expect(esPendiente(cero)).toBe(false);        // N5 = 0 es una medición, no una ausencia
    });

    it('lo recoge en la lista, el más atrasado primero', () => {
      const p = pendientesDeN5(M.fuentes, P30, SIN, FOTO);
      expect(p.total).toBe(2);
      expect(p.filas.map((f) => f.fecha)).toEqual(['2026-09-12', '2026-09-19']);
      expect(p.desoves).toBe(3);                    // 2 de RD + 1 de RE
    });

    it('🔑 los días de espera se miden desde la fecha ESPERADA del N5, no desde el desove', () => {
      const p = pendientesDeN5(M.fuentes, P30, SIN, FOTO);
      const viejo = p.filas.find((f) => f.fecha === '2026-09-12');
      const ayer = p.filas.find((f) => f.fecha === '2026-09-19');
      expect(viejo.fechaN5Esperada).toBe('2026-09-13');
      expect(viejo.diasEsperando).toBe(7);          // del 13 al 20; desde el desove daría 8
      expect(ayer.diasEsperando).toBe(0);           // su N5 tocaba HOY: no llega tarde
    });

    it('el filtro de lote se aplica; el de sala se IGNORA y se dice', () => {
      expect(pendientesDeN5(M.fuentes, P30, F({ lote: 'RE' }), FOTO).total).toBe(1);
      expect(pendientesDeN5(M.fuentes, P30, F({ sala: 'Sala 3' }), FOTO).ignora).toEqual(['sala']);
      expect(ignoraDeReproduccion(SIN)).toEqual([]);
    });

    it('fuera del período no cuenta', () => {
      const p = pendientesDeN5(M.fuentes, { desde: '2026-09-18', hasta: FOTO }, SIN, FOTO);
      expect(p.filas.map((f) => f.fecha)).toEqual(['2026-09-19']);
    });
  });

  describe('la tabla por lote', () => {
    it('🔑 la fertilidad sólo sobre los huevos que YA tienen su N2', () => {
      const t = tablaDeReproduccion(M, P30, SIN);
      const rd = t.find((x) => x.lote === 'RD');
      expect(rd.huevos).toBe(1000000);
      expect(rd.n2).toBe(300000);
      expect(rd.fertilidad).toBe(75);      // 300/400 · sobre el total daría 30
    });

    it('🔑 los nauplios por hembra sólo sobre los desoves que YA tienen su N5', () => {
      const t = tablaDeReproduccion(M, P30, SIN);
      const rd = t.find((x) => x.lote === 'RD');
      expect(rd.desoves).toBe(6);
      expect(rd.n5).toBe(200000);
      // 200 000 ÷ 2 (sólo el desove del 09-10 tiene N5 > 0) = 100 000; sobre los 6 daría 33 333
      expect(rd.naupliosPorHembra).toBe(100000);
    });

    it('trae las hembras NO VIABLES del lote', () => {
      const t = tablaDeReproduccion(M, P30, SIN);
      expect(t.find((x) => x.lote === 'RD').noViables).toBe(3);
      expect(t.find((x) => x.lote === 'RE').noViables).toBe(0);
    });

    it('trae los pendientes de cada lote y sus destinos', () => {
      const t = tablaDeReproduccion(M, P30, SIN);
      const rd = t.find((x) => x.lote === 'RD');
      const re = t.find((x) => x.lote === 'RE');
      expect(rd.pendientes).toBe(1);
      expect(rd.destinos).toEqual(['Tabasca', 'Hisenor']);
      expect(re.pendientes).toBe(1);
      expect(re.destinos).toEqual([]);
    });

    it('sólo salen los lotes con algún desove en el período', () => {
      const t = tablaDeReproduccion(M, { desde: '2026-09-18', hasta: FOTO }, SIN);
      expect(t.map((x) => x.lote)).toEqual(['RE']);
    });

    it('🔑 no se expone ningún cociente entre N5 y N2 (decisión del usuario)', () => {
      const t = tablaDeReproduccion(M, P30, SIN);
      for (const fila of t) {
        for (const [k, v] of Object.entries(fila)) {
          // ninguna clave insinúa la comparación, y ningún valor es el cociente
          expect(/n5.*n2|n2.*n5/i.test(k)).toBe(false);
          if (fila.n2 > 0 && typeof v === 'number') expect(v).not.toBe(fila.n5 / fila.n2);
        }
      }
      // y el módulo tampoco la escribe en ninguna parte
      const src = readFileSync(new URL('./operativo.reproduccion.js', import.meta.url), 'utf8');
      expect(/n5\s*\/\s*\w*n2|n2\s*\/\s*\w*n5/i.test(src)).toBe(false);
    });
  });

  describe('a dónde fueron', () => {
    it('🔑 un desove con DOS destinos cuenta en los dos, y se dice: las columnas no suman el total', () => {
      const d = destinosDeDespacho(M.fuentes, P30, SIN);
      expect(d.filas.map((f) => f.destino)).toEqual(['Tabasca', 'Hisenor']);
      const a = d.filas.find((f) => f.destino === 'Tabasca');
      const b = d.filas.find((f) => f.destino === 'Hisenor');
      expect(a.n5).toBe(200000);            // el del 09-10 (200 mil) + el del 09-14 (0)
      expect(b.n5).toBe(200000);            // el MISMO desove: no se reparte
      expect(a.n5 + b.n5).toBeGreaterThan(200000);   // por eso sumarlas engaña
      expect(d.compartidos).toBe(1);
      expect(a.variosDestinos).toBe(1);
    });

    it('cuenta aparte los desoves sin destino', () => {
      const d = destinosDeDespacho(M.fuentes, P30, SIN);
      expect(d.sinDestino).toBe(2);         // el del 09-12 y el de RE
      expect(d.conDestino).toBe(2);
    });
  });

  describe('los totales', () => {
    it('reusa el KPI de la portada y le añade la cobertura del dato', () => {
      const t = totalesDeReproduccion(M, P30, SIN);
      expect(t.desoves).toBe(7);
      expect(t.huevos).toBe(1100000);
      expect(t.n5).toBe(200000);
      expect(t.pendientes).toBe(2);
      expect(t.pctPendiente).toBe(42.86);   // 3 de 7 desoves aún sin contar
    });

    it('con filtro de sala dice que lo ignora', () => {
      expect(totalesDeReproduccion(M, P30, F({ sala: 'Sala 3' })).ignora).toContain('sala');
    });
  });
});
