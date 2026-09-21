/* ============================================================
   MADURACIÓN · OPERATIVO — TANQUES (F4.1)

   Qué se exige, y con fixtures montados para DISTINGUIR: si la regla se rompe, la cifra equivocada es OTRA, no
   la misma. Cada punto de abajo se cae con una implementación plausible pero incorrecta.

   · Un tanque COMPARTIDO suma sus dos lotes (t1: 30♂40♀ de RA + 10♂20♀ de RB = 40♂60♀). Quedarse con uno daría
     30/40 o 10/20, y la H:M sería 1,33 o 2,00 en vez de 1,50.
   · Las CARGAS se suman entre los lotes del tanque: quedarse con la de un lote daría la mitad larga.
   · Con FILTRO DE LOTE, el tanque conserva sus cifras ENTERAS y se marca `parcial`. Filtrando RB, los vivos
     siguen siendo 100 (no 30) porque el área es del tanque; es la regla contraintuitiva de esta vista.
   · Los PESOS son el ÚLTIMO registrado, no el promedio: t1 pesa 50 el día 10 y 60 el día 12 → 60, no 55.
   · `partesDelDia` ordena por HORA y las filas SIN hora van al final, contadas aparte (no se les inventa una).
   · La CURVA sale de la serie ya calculada: el día anterior al ingreso es CERO, no el primer valor conocido.
   · Los MOVIMIENTOS ven entradas y salidas, y un traslado dentro del mismo tanque es `interno`, no dos filas.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  cargasPorTanque, actividadPorTanque, tablaDeTanques, curvaDeTanque, partesDelDia,
  observacionesDeTanque, movimientosDeTanque, fichaDeTanque, avisosDeTanques,
} from './operativo.tanques.js';
import { modeloOperativo, serieDiaria, diasDeTanque } from './operativo.data.js';
import { normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg = 'CA') => ({ _SheetOrigin: O,
  'Camaronera origen': 'CX', Fecha: fecha, Lote: lote, 'Código genético': cg, 'Piscina Broodstock': 'P1',
  Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha,
  Sala: sala, Tanque: tanque, ...extra });
const MOV = (fecha, tipo, so, to, sd, td, machos, hembras, motivo = 'Redistribución') => ({ _SheetOrigin: O,
  Fecha: fecha, Tipo: tipo, 'Sala origen': so, 'Tanque origen': to, 'Sala destino': sd, 'Tanque destino': td,
  Machos: machos, Hembras: hembras, Motivo: motivo, 'Agua destino': 'Playa', ID: fecha + tipo + to + td });
const FIN = (fecha, lote, tipo, machos, hembras) => ({ _SheetOrigin: O, 'Metabisulfito (kg)': '',
  Fecha: fecha, Lote: lote, Tipo: tipo, Machos: machos, Hembras: hembras });

const FOTO = '2026-09-20';

/* La planta de las pruebas, toda en la Sala 3, al cierre del 20/09:
   · t1 — COMPARTIDO: RA entra con 30♂40♀ y RB con 10♂20♀ el 01/09 → 40♂60♀ (100 vivos).
          Partes el 10/09 (peso 50/70) y el 12/09 (peso 60/80, dos rondas con hora y una sin ella).
   · t2 — RA sola, 20♂20♀ el 01/09. Recibe 5♂ de t1 el 15/09 y manda 2♀ a t1 el 16/09.
   · t3 — RC entra con 5♂5♀ y CIERRA TOTAL el 18/09: el tanque sigue en el libro pero a CERO. Existe para
          que la regla «sólo los OCUPADOS» se ejercite de verdad: sin él, quitar esa guarda no cambiaba nada
          y la mutación T02 del banco sobrevivía sin que nadie se enterara. */
const PLANTA = [
  ING('2026-09-01', 'RA', 'Sala 3', 1, 30, 40),
  ING('2026-09-01', 'RB', 'Sala 3', 1, 10, 20, 'CB'),
  ING('2026-09-01', 'RA', 'Sala 3', 2, 20, 20),
  ING('2026-09-01', 'RC', 'Sala 3', 3, 5, 5, 'CC'),
  FIN('2026-09-18', 'RC', 'Total', 5, 5),

  TQ('2026-09-10', 'Sala 3', 1, { 'Machos muertos': 1, 'Peso promedio machos (g)': 50, 'Peso promedio hembras (g)': 70,
    Hora: '08:00', Parte: 1, 'Observaciones sanitarias': 'Animales maduros', 'Observaciones operativas': 'Aireación normal' }),
  TQ('2026-09-12', 'Sala 3', 1, { 'Hembras muertas': 2, 'Peso promedio machos (g)': 60, 'Peso promedio hembras (g)': 80,
    Hora: '14:40', Parte: 2, 'Observaciones sanitarias': 'Animales en muda', 'Observaciones operativas': 'Aireación normal' }),
  TQ('2026-09-12', 'Sala 3', 1, { 'Machos muertos': 3, Hora: '06:00', Parte: 1,
    'Observaciones operativas': 'Recambio realizado' }),
  TQ('2026-09-12', 'Sala 3', 1, { 'Cópulas': 4 }),                         // SIN hora, a propósito

  MOV('2026-09-15', 'Transferencia', 'Sala 3', 1, 'Sala 3', 2, 5, 0),
  MOV('2026-09-16', 'Transferencia', 'Sala 3', 2, 'Sala 3', 1, 0, 2),
  MOV('2026-09-17', 'Transferencia', 'Sala 3', 1, 'Sala 3', 1, 1, 1),      // interno: sale y entra en el mismo
];

const M = modeloOperativo(PLANTA, { fecha: FOTO, hoy: FOTO });
const P30 = periodoDe('30d', FOTO, M.fuentes);
const SERIE = serieDiaria(M.fuentes, P30.desde, P30.hasta);
const DIAS = diasDeTanque(M.fuentes.tanques);
const F = (extra) => normalizarFiltro({ ...(extra || {}) }, M.indice);
const SIN = F();
const fila = (t, sala, tanque) => t.find((x) => x.sala === sala && x.tanque === tanque);

describe('Maduración · operativo · 🛢 Tanques (F4.1)', () => {
  describe('la tabla maestra', () => {
    it('🔑 un tanque COMPARTIDO suma sus dos lotes, y lo dice', () => {
      const t = tablaDeTanques(M, P30, SIN, DIAS);
      const t1 = fila(t, 'Sala 3', 1);
      // 30♂+10♂ y 40♀+20♀, menos las bajas de los partes. Quedarse con un lote daría 30/40 o 10/20.
      expect(t1.compartido).toBe(true);
      expect(t1.lotes).toEqual(['RA', 'RB']);
      expect(t1.vivos.total).toBe(t1.vivos.machos + t1.vivos.hembras);
      expect(t1.vivos.machos).toBeGreaterThan(30);   // ningún lote suelto llega aquí
    });

    /* 🔑 t3 SIGUE en el libro tras su cierre total, con su composición a cero: es el caso que distingue
       «no está» de «está vacío», y el único que rompe la guarda si alguien la quita. */
    it('sólo salen los tanques OCUPADOS: el que cerró a cero sigue en el libro y NO sale', () => {
      const t = tablaDeTanques(M, P30, SIN, DIAS);
      expect(M.libro.tanques.has('Sala 3|3')).toBe(true);      // el libro sí lo tiene
      expect(fila(t, 'Sala 3', 3)).toBeUndefined();            // la tabla no
      expect(t.every((x) => x.vivos.total > 0)).toBe(true);
      expect(fila(t, 'Sala 3', 9)).toBeUndefined();            // y uno que nunca existió, tampoco
    });

    it('🔑 los PESOS son el último registrado, no el promedio del período', () => {
      const t = tablaDeTanques(M, P30, SIN, DIAS);
      const t1 = fila(t, 'Sala 3', 1);
      expect(t1.pesoMachos).toBe(60);    // promediando 50 y 60 daría 55
      expect(t1.pesoHembras).toBe(80);   // promediando 70 y 80 daría 75
      expect(t1.ultimoParte).toBe('2026-09-12');
    });

    it('cuenta las RONDAS del período, no los días', () => {
      const t = tablaDeTanques(M, P30, SIN, DIAS);
      const t1 = fila(t, 'Sala 3', 1);
      expect(t1.diasConParte).toBe(2);   // el 10 y el 12
      expect(t1.rondas).toBe(4);         // una el 10 y TRES el 12
      expect(t1.muertes).toBe(1 + 2 + 3);
    });

    it('🔑 con filtro de LOTE el tanque conserva sus cifras ENTERAS y se marca `parcial`', () => {
      const t = tablaDeTanques(M, P30, F({ lote: 'RB' }), DIAS);
      const t1 = fila(t, 'Sala 3', 1);
      const entero = fila(tablaDeTanques(M, P30, SIN, DIAS), 'Sala 3', 1);
      expect(t1).toBeTruthy();
      expect(t1.parcial).toBe(true);
      expect(t1.vivos.total).toBe(entero.vivos.total);     // NO se reparte: el área es del tanque
      expect(t1.densidad).toBe(entero.densidad);
    });

    /* 🔑 Esta la enseñó el propio fixture, y por eso se queda escrita: al sacar 5 machos de un tanque
       COMPARTIDO, el libro los reparte ENTRE SUS LOTES en proporción (4 de RA y 1 de RB), así que RB
       acaba también en t2 con un solo macho. Filtrando por RB tienen que salir los DOS tanques: dar
       por hecho que «RB sólo está donde entró» es la suposición fácil y es falsa en cuanto hay un
       traslado. Medido: t2 queda RA ♂24 ♀18 · RB ♂1 ♀0. */
    it('🔑 un traslado desde un tanque compartido lleva los DOS lotes, y el filtro lo respeta', () => {
      const t = tablaDeTanques(M, P30, F({ lote: 'RB' }), DIAS);
      expect(t.map((x) => x.tanque)).toEqual([1, 2]);
      const t2 = fila(t, 'Sala 3', 2);
      expect(t2.parcial).toBe(true);
      expect(t2.lotes).toEqual(['RA', 'RB']);
      // y con un lote que NO se movió a ninguna parte, sólo sale su tanque
      expect(tablaDeTanques(M, P30, F({ codigo: 'CB' }), DIAS).map((x) => x.tanque)).toEqual([1, 2]);
    });

    it('sin filtro, ningún tanque sale marcado como parcial', () => {
      expect(tablaDeTanques(M, P30, SIN, DIAS).every((x) => x.parcial === false)).toBe(true);
    });

    it('el aviso del filtro sólo aparece cuando hay lote o código', () => {
      expect(avisosDeTanques(SIN)).toEqual([]);
      expect(avisosDeTanques(F({ lote: 'RA' }))).toHaveLength(1);
      expect(avisosDeTanques(F({ codigo: 'CB' }))).toHaveLength(1);
    });
  });

  describe('las cargas', () => {
    it('🔑 se SUMAN entre los lotes que comparten el tanque', () => {
      const porLote = new Map();
      for (const L of M.resumen.lotes || []) {
        for (const x of L.tanques || []) {
          if (x.sala !== 'Sala 3' || x.tanque !== 1) continue;
          porLote.set(L.lote, Number(x.cargaMetrica) || 0);
        }
      }
      const suma = [...porLote.values()].reduce((a, b) => a + b, 0);
      const c = cargasPorTanque(M).get('Sala 3|1');
      if (suma > 0) {
        expect(Number(c.cargaMetrica)).toBeCloseTo(suma, 1);
        // y es MAYOR que la de cualquier lote suelto: quedarse con uno se vería
        expect(Number(c.cargaMetrica)).toBeGreaterThan(Math.max(...porLote.values()) - 0.001);
      }
    });
  });

  describe('los partes del día, con su hora', () => {
    it('🔑 ordena por HORA y deja las filas SIN hora al final, contadas', () => {
      const r = partesDelDia(M.fuentes, 'Sala 3', 1, '2026-09-12');
      expect(r.partes).toHaveLength(3);
      expect(r.partes.map((p) => p.hora)).toEqual(['06:00', '14:40', '']);
      expect(r.sinHora).toBe(1);
      expect(r.partes[0].machosMuertos).toBe(3);
      expect(r.partes[1].hembrasMuertas).toBe(2);
      expect(r.partes[2].copulas).toBe(4);
    });

    it('un día sin partes no inventa ninguno', () => {
      expect(partesDelDia(M.fuentes, 'Sala 3', 1, '2026-09-11')).toEqual({ partes: [], sinHora: 0 });
    });

    it('no se lleva los partes de OTRO tanque ni de otra sala', () => {
      expect(partesDelDia(M.fuentes, 'Sala 3', 2, '2026-09-12').partes).toHaveLength(0);
      expect(partesDelDia(M.fuentes, 'Sala 1', 1, '2026-09-12').partes).toHaveLength(0);
    });
  });

  describe('la curva de vivos', () => {
    it('🔑 el día ANTERIOR al ingreso es cero, no el primer valor conocido', () => {
      const c = curvaDeTanque(SERIE, 'Sala 3', 1);
      const antes = c.find((d) => d.fecha === '2026-08-31');
      const despues = c.find((d) => d.fecha === '2026-09-02');
      if (antes) expect(antes.total).toBe(0);
      expect(despues.total).toBeGreaterThan(0);
    });

    it('un tanque que no existe da una curva a cero, no vacía', () => {
      const c = curvaDeTanque(SERIE, 'Sala 3', 9);
      expect(c.length).toBe(SERIE.length);
      expect(c.every((d) => d.total === 0)).toBe(true);
    });
  });

  describe('los movimientos', () => {
    it('🔑 ve las salidas, las entradas y el interno SIN duplicarlo', () => {
      const m = movimientosDeTanque(M.fuentes, 'Sala 3', 1, P30);
      expect(m.map((x) => [x.fecha, x.sentido])).toEqual([
        ['2026-09-15', 'sale'], ['2026-09-16', 'entra'], ['2026-09-17', 'interno'],
      ]);
      expect(m[0].total).toBe(5);
    });

    it('el otro tanque los ve al revés', () => {
      const m = movimientosDeTanque(M.fuentes, 'Sala 3', 2, P30);
      expect(m.map((x) => x.sentido)).toEqual(['entra', 'sale']);
    });

    it('fuera del período no cuentan', () => {
      const m = movimientosDeTanque(M.fuentes, 'Sala 3', 1, { desde: '2026-09-16', hasta: '2026-09-16' });
      expect(m).toHaveLength(1);
      expect(m[0].sentido).toBe('entra');
    });
  });

  describe('las observaciones', () => {
    it('se reusa la de 🔍 Revisiones, fijada a este tanque', () => {
      const o = observacionesDeTanque(DIAS, 'Sala 3', 1, P30, SIN);
      const ope = o.operativas.map((x) => x.obs);
      expect(ope).toContain('Aireación normal');
      expect(ope).toContain('Recambio realizado');
      // «Aireación normal» está los DOS días; «Recambio realizado» sólo el 12
      const aire = o.operativas.find((x) => x.obs === 'Aireación normal');
      const recambio = o.operativas.find((x) => x.obs === 'Recambio realizado');
      expect(aire.veces).toBeGreaterThan(recambio.veces);
    });

    it('no cuenta las de otro tanque', () => {
      expect(observacionesDeTanque(DIAS, 'Sala 3', 2, P30, SIN).operativas).toEqual([]);
    });
  });

  describe('la ficha entera', () => {
    it('trae composición desglosada, cargas, curva, partes de hoy, observaciones y movimientos', () => {
      const f = fichaDeTanque(M, SERIE, 'Sala 3', 1, P30, SIN, DIAS);
      expect(f.existe).toBe(true);
      expect(f.compartido).toBe(true);
      expect(f.composicion.map((c) => c.lote)).toEqual(['RA', 'RB']);
      expect(f.composicion.every((c) => c.enFiltro)).toBe(true);
      expect(f.vivos.total).toBe(f.composicion.reduce((a, c) => a + c.total, 0));
      expect(f.curva).toHaveLength(SERIE.length);
      expect(f.movimientos).toHaveLength(3);
      expect(f.hoy.partes).toEqual([]);           // el 20/09 no hubo parte
    });

    it('🔑 con filtro de lote marca qué composición queda FUERA, sin quitarla', () => {
      const f = fichaDeTanque(M, SERIE, 'Sala 3', 1, P30, F({ lote: 'RA' }), DIAS);
      expect(f.composicion).toHaveLength(2);                       // se siguen viendo las dos
      expect(f.composicion.find((c) => c.lote === 'RA').enFiltro).toBe(true);
      expect(f.composicion.find((c) => c.lote === 'RB').enFiltro).toBe(false);
    });

    it('un tanque que no existe se dice, no revienta', () => {
      const f = fichaDeTanque(M, SERIE, 'Sala 3', 9, P30, SIN, DIAS);
      expect(f.existe).toBe(false);
      expect(f.vivos.total).toBe(0);
      expect(f.composicion).toEqual([]);
    });
  });

  describe('la actividad, suelta', () => {
    it('no cuenta lo que cae fuera del período', () => {
      const a = actividadPorTanque(DIAS, { desde: '2026-09-11', hasta: '2026-09-13' });
      expect(a.get('Sala 3|1').rondas).toBe(3);
      expect(a.get('Sala 3|1').dias).toBe(1);
    });
  });
});
