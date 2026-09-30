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
  ignoraDeReproduccion, repartoDeLotePorDestino,
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

    it('🔴 0t·11 · «Macrolab» es un destino: cuenta, y en el empate va por el CATÁLOGO (al final)', () => {
      /* La celda se lee con el catálogo (`despachoLista`): antes del 2026-09-29 un «Macrolab» en la hoja se perdía
         sin aviso. Mismo N5 en los dos para que decida el orden del catálogo, no la cifra. */
      const Mm = modeloOperativo([
        ING('2026-09-01', 'RM', 'Sala 3', 1, 10, 10),
        DES('2026-09-10', 'RM', 1, 100000, { 'Fecha N5': '2026-09-11', N5: 50000, Despacho: 'Macrolab, Tabasca' }),
      ], { fecha: FOTO, hoy: FOTO });
      const d = destinosDeDespacho(Mm.fuentes, P30, SIN);
      expect(d.filas.map((f) => [f.destino, f.n5])).toEqual([['Tabasca', 50000], ['Macrolab', 50000]]);
      expect(d.sinDestino).toBe(0);
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

/* ============================================================
   0q·3 (2026-09-27, usuario) · los N2 y N5 de UN lote por destino (el gráfico que se despliega en «Por lote»)

   Los MISMOS desoves que su fila de la tabla (el lote y el período, como `reproduccionDeLote`), de más a menos N5.
   Regla del usuario: un desove con varios destinos cuenta ENTERO en cada uno (la de «A dónde fueron»), y se dice cuánto
   de cada barra viene de desoves así. El fixture DISTINGUE: otro lote y un desove fuera del período con cifras enormes
   (si se colaran, cambian las barras); un desempate en N5 = 0 que por N2 y por catálogo da órdenes DISTINTOS; y un
   desove sin destino, que no va a ninguna barra pero se cuenta.
   ============================================================ */
describe('Maduración · operativo · 🥚 el reparto de un lote por destino (0q·3)', () => {
  const PL = [
    ING('2026-06-01', 'RD', 'Sala 3', 1, 20, 40),
    ING('2026-06-01', 'RE', 'Sala 3', 2, 10, 20),
    DES('2026-09-02', 'RD', 1, 1000, { N2: 100, N5: 80, Despacho: 'Mar Bravo M01' }),
    DES('2026-09-05', 'RD', 2, 2000, { N2: 500, N5: 400, Despacho: 'Mar Bravo M01, Tabasca' }),
    DES('2026-09-08', 'RD', 3, 3000, { N2: 900, N5: 700, Despacho: 'Tabasca' }),
    DES('2026-09-09', 'RD', 1, 1000, { N2: 50, N5: 30 }),
    DES('2026-09-11', 'RD', 1, 1000, { N2: 700, N5: 0, Despacho: 'Hisenor' }),
    DES('2026-09-12', 'RD', 1, 1000, { N2: 300, N5: 0, Despacho: 'Punta Carnero' }),
    DES('2026-09-10', 'RE', 5, 5000, { N2: 9999, N5: 8888, Despacho: 'Tabasca' }),
    DES('2026-07-01', 'RD', 5, 5000, { N2: 7777, N5: 5000, Despacho: 'SanLab' }),
  ];
  const MM = modeloOperativo(PL, { fecha: FOTO, hoy: FOTO });
  const PP = periodoDe('30d', FOTO, MM.fuentes);
  const R = () => repartoDeLotePorDestino(MM.fuentes, 'rd', PP);

  it('🔴 de más a menos N5; en el empate, más N2 primero (no el orden del catálogo)', () => {
    expect(R().filas.map((f) => f.destino)).toEqual(['Tabasca', 'Mar Bravo M01', 'Hisenor', 'Punta Carnero']);
  });
  it('🔴 sólo el lote y el período: ni RE ni el desove de julio entran', () => {
    const t = R().filas.find((f) => f.destino === 'Tabasca');
    expect([t.n2, t.n5, t.desoves]).toEqual([1400, 1100, 5]);
    expect(R().filas.some((f) => f.destino === 'SanLab')).toBe(false);
    expect(R().lote).toBe('RD');
  });
  it('🔴 un desove con dos destinos cuenta ENTERO en los dos, y se dice cuánto de cada barra es compartido', () => {
    const r = R();
    const t = r.filas.find((f) => f.destino === 'Tabasca');
    const m = r.filas.find((f) => f.destino === 'Mar Bravo M01');
    expect([m.n2, m.n5, m.desoves]).toEqual([600, 480, 3]);
    expect([t.n2Compartido, t.n5Compartido]).toEqual([500, 400]);
    expect([m.n2Compartido, m.n5Compartido]).toEqual([500, 400]);
    expect(r.filas.find((f) => f.destino === 'Hisenor').n5Compartido).toBe(0);
    expect(r.compartidos).toBe(1);
  });
  it('🔑 el desove sin destino no va a ninguna barra, pero se cuenta con su N5', () => {
    const r = R();
    expect(r.sinDestino).toBe(1);
    expect(r.n5SinDestino).toBe(30);
  });
  it('🔑 un lote sin desoves en el período: nada', () => {
    const r = repartoDeLotePorDestino(MM.fuentes, 'ZZ', PP);
    expect(r.filas).toEqual([]);
    expect([r.compartidos, r.sinDestino, r.n5SinDestino]).toEqual([0, 0, 0]);
  });
});
