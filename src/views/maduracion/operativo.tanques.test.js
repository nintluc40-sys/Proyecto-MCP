/* ============================================================
   MADURACIÓN · OPERATIVO — TANQUES (F4.1)

   Qué se exige, y con fixtures montados para DISTINGUIR: si la regla se rompe, la cifra equivocada es OTRA, no
   la misma. Cada punto de abajo se cae con una implementación plausible pero incorrecta.

   · Un tanque COMPARTIDO suma sus dos lotes (t1: 30♂40♀ de RA + 10♂20♀ de RB = 40♂60♀). Quedarse con uno daría
     30/40 o 10/20, y la H:M sería 1,33 o 2,00 en vez de 1,50.
   · La CARGA es UNA por tanque: el resumen ya da a cada lote la del tanque ENTERO, así que sumarlas daría el doble en
     un tanque de dos lotes (fue así hasta el 2026-10-23). Con pesos distintos entre lotes, manda la MAYOR.
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
import { normalizarFiltro, periodoDe, detalleDeSala } from './operativo.tablero.js';
import { umbralVigente } from './operativo.umbrales.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { areaTanqueM2 } from '../registros/lib/ficha-maduracion-ingreso.schema.js';

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
const F2 = (m) => normalizarFiltro({}, m.indice);
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
      // 3 (2026-10-01, usuario) · y la HORA de su último parte: el 12/09, a las 06:00 y a las 14:40 (el 10/09, a las 08:00).
      expect(t1.ultimaHora).toBe('14:40');
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

  /* Bloque 4, tarea 2 (2026-10-23, usuario) · los SEMÁFOROS de la tabla, con los umbrales de 🏠 Salas. La H:M y la
     densidad con su MISMA regla (por tanque, con todos sus lotes): la tabla y el detalle de la sala no pueden dar colores
     distintos. La CARGA, la del tanque entero, UNA (tarea 2a): el caso que lo distingue es un tanque COMPARTIDO por
     debajo del tope cuya SUMA —el defecto de antes— lo pasaba. */
  describe('los semáforos (bloque 4, tarea 2)', () => {
    const compartido = (machos, hembras) => modeloOperativo([
      ING('2026-09-01', 'LA', 'Sala 1', 1, machos, hembras),
      ING('2026-09-01', 'LB', 'Sala 1', 1, machos, hembras, 'CB'),
      TQ('2026-09-10', 'Sala 1', 1, { 'Peso promedio machos (g)': 60, 'Peso promedio hembras (g)': 80, Hora: '08:00', Parte: 1 }),
    ], { fecha: FOTO, hoy: FOTO });
    const tanqueYSala = (MC) => {
      const PC = periodoDe('30d', FOTO, MC.fuentes);
      const DC = diasDeTanque(MC.fuentes.tanques);
      return [fila(tablaDeTanques(MC, PC, F2(MC), DC), 'Sala 1', 1),
        detalleDeSala(MC, 'Sala 1', PC, F2(MC), DC).tanques.find((y) => String(y.tanque) === '1')];
    };

    it('🔑 H:M y densidad, con el MISMO color que 🏠 Salas en cada tanque', () => {
      const t = tablaDeTanques(M, P30, SIN, DIAS);
      const d = detalleDeSala(M, 'Sala 3', P30, SIN, DIAS);
      const t1 = fila(t, 'Sala 3', 1);
      expect([t1.hmEstado, t1.densidadEstado]).toEqual(['alto', 'bajo']);   // 1,50 ♀ por ♂ y ~2 animales/m²
      for (const x of t) {
        const s = d.tanques.find((y) => String(y.tanque) === String(x.tanque));
        expect([x.hmEstado, x.densidadEstado], 'tanque ' + x.tanque).toEqual([s.hmEstado, s.densidadEstado]);
      }
    });

    it('🔑 la CARGA de un tanque compartido por DEBAJO del tope: verde, como en 🏠 Salas, aunque la suma lo pasaba', () => {
      const [t1, s] = tanqueYSala(compartido(20, 20));   // 40 ♂ y 40 ♀ en 13,14 m²: unos 426 g/m²
      const tope = umbralVigente('cargaMetrica').max;
      expect(t1.cargaMetrica).toBeGreaterThan(0);
      expect(t1.cargaMetrica).toBeLessThanOrEqual(tope);
      expect(t1.cargaMetrica * 2, 'lo que daba la suma de sus dos lotes').toBeGreaterThan(tope);
      expect(t1.cargaMetricaEstado).toBe('ok');
      expect(t1.cargaMetricaEstado).toBe(s.cargaMetricaEstado);
    });

    it('🔑 y por ENCIMA del tope, «alto», también como en 🏠 Salas', () => {
      const [t1, s] = tanqueYSala(compartido(40, 40));   // unos 852 g/m²
      expect(t1.cargaMetrica).toBeGreaterThan(umbralVigente('cargaMetrica').max);
      expect(t1.cargaMetricaEstado).toBe('alto');
      expect(t1.cargaMetricaEstado).toBe(s.cargaMetricaEstado);
    });

    it('sin carga conocida (ningún peso registrado), la celda no lleva punto', () => {
      const [t1] = tanqueYSala(modeloOperativo([ING('2026-09-01', 'LA', 'Sala 1', 1, 20, 20)], { fecha: FOTO, hoy: FOTO }));
      expect(t1.cargaMetrica).toBe('');
      expect(t1.cargaMetricaEstado).toBe('');
    });
  });

  /* Bloque 4, tarea 2a (2026-10-23, usuario) · hasta ese día esta prueba exigía la SUMA, y la suma era el defecto: el
     resumen calcula la carga de cada lote con TODOS los animales del tanque (mad-resumen.js), así que un tanque de dos
     lotes salía con el doble en 🛢 Tanques, su ficha, el mapa en modo carga y 🏭 Planta. */
  describe('las cargas', () => {
    const copiasDe = (m, sala, tanque) => (m.resumen.lotes || []).flatMap((L) => (L.tanques || [])
      .filter((x) => x.sala === sala && Number(x.tanque) === tanque).map((x) => Number(x.cargaMetrica)));

    it('🔑 un tanque COMPARTIDO tiene UNA carga, la del tanque entero: sus lotes la traen repetida y NO se suman', () => {
      const copias = copiasDe(M, 'Sala 3', 1);
      expect(copias).toHaveLength(2);                       // RA y RB
      expect(copias[0]).toBeGreaterThan(0);
      expect(copias[1]).toBe(copias[0]);                    // los mismos pesos: la misma carga, repetida
      const c = cargasPorTanque(M).get('Sala 3|1');
      expect(c.cargaMetrica).toBe(copias[0]);
      expect(c.cargaMetrica).not.toBeCloseTo(copias[0] + copias[1], 1);   // lo que daba la suma
      // Y es la del tanque ENTERO, medida aparte: sus vivos × los últimos pesos (60 ♂ y 80 ♀) ÷ su área.
      const t1 = fila(tablaDeTanques(M, P30, SIN, DIAS), 'Sala 3', 1);
      expect(c.cargaMetrica).toBeCloseTo((t1.vivos.machos * 60 + t1.vivos.hembras * 80) / areaTanqueM2('Sala 3', 1), 1);
    });

    it('🔑 si sus lotes traen pesos DISTINTOS, manda la MAYOR (ni la menor ni la suma)', () => {
      /* LA está en los tanques 1 y 2 de la Sala 1 y LB sólo en el 1. El 10/09 el tanque 1 pesa 60/80 y el 2, 100/120:
         los pesos de LA son el promedio de sus dos tanques y los de LB, los del 1. Las copias del tanque 1 difieren. */
      const MC = modeloOperativo([
        ING('2026-09-01', 'LA', 'Sala 1', 1, 20, 20),
        ING('2026-09-01', 'LA', 'Sala 1', 2, 20, 20),
        ING('2026-09-01', 'LB', 'Sala 1', 1, 20, 20, 'CB'),
        TQ('2026-09-10', 'Sala 1', 1, { 'Peso promedio machos (g)': 60, 'Peso promedio hembras (g)': 80, Hora: '08:00', Parte: 1 }),
        TQ('2026-09-10', 'Sala 1', 2, { 'Peso promedio machos (g)': 100, 'Peso promedio hembras (g)': 120, Hora: '08:00', Parte: 1 }),
        // Las toneladas de la sala, para que también haya carga VOLUMÉTRICA (sin ellas sale vacía y no se probaría).
        { _SheetOrigin: O, 'Temperatura 2:00': '', Fecha: '2026-09-10', Sala: 'Sala 1', Toneladas: 5.5 },
      ], { fecha: FOTO, hoy: FOTO });
      const copias = copiasDe(MC, 'Sala 1', 1);
      expect(copias).toHaveLength(2);
      expect(new Set(copias).size, copias.join(' · ')).toBe(2);   // lo que hace distinguir el caso
      const c = cargasPorTanque(MC).get('Sala 1|1');
      expect(c.cargaMetrica).toBe(Math.max(...copias));
      const vol = (MC.resumen.lotes || []).flatMap((L) => (L.tanques || [])
        .filter((x) => x.sala === 'Sala 1' && Number(x.tanque) === 1).map((x) => Number(x.cargaVolumetrica)));
      expect(new Set(vol).size, vol.join(' · ')).toBe(2);
      expect(c.cargaVolumetrica).toBe(Math.max(...vol));
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
