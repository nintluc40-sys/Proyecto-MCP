/* ============================================================
   MADURACIÓN · OPERATIVO — 📉 Tendencias y ⏳ Permanencia (0f · 2b, 2026-09-25)

   Qué se exige, con una planta en la que cada regla EQUIVOCADA da otro resultado:
   · Se compara con el período ANTERIOR de igual duración, y avisa un cambio del 20 % o más (el 20 % justo, también).
   · Mínimo de 3 registros: en el ANTERIOR para lo que baja; en los DOS para lo que sube. Sin base, no avisa. Y los
     registros de cada cifra son las filas que la TRAEN: un desove sin su N5 no cuenta para el mínimo del N5.
   · MORTALIDAD POR TANQUE Y DÍA, no la suma: la Sala 1 muere el doble con la mitad de partes (la suma no ve nada) y
     la Sala 2 muere igual con el triple de partes (la suma «sube» un 233 %). Los descartes de selección no son bajas.
   · CÓPULAS por los partes del lote ese día (H1 del Saldo), no «todo el período ÷ las hembras de la foto»: TA copula
     igual con la mitad de partes (esa regla la vería caer), TB cae a la mitad con más tanques (esa regla no lo ve), y
     TD se muda de sala: con la foto, sus partes de antes no serían suyos; y el parte del tanque que dejó vacío, no
     es de nadie. TH no tiene desoves: sólo sus partes lo traen a la lista.
   · NAUPLIOS: N5 por desove de los que YA lo tienen; TD tiene dos desoves pendientes (el total «bajaría» un 67 %).
   · FERTILIDAD sólo sobre los huevos con su N2: el desove de TD del 17/09 aún no lo tiene.
   · PRODUCCIÓN de una sala: los desoves del lote que estuvo en ella ESE día, no el que está en la foto: TD se mudó de
     la Sala 3 a la 5, y la que produce menos es la 3. El día de la mudanza cuenta en las dos.
   · PERMANENCIA: más de 60 días (no 60) en producción, contados desde la primera cópula si llegó antes de los 15 días.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  periodoAnterior, cambioPct, presenciaDiaria, salasDelDesove, acumularDesoves, tendencias, permanencia,
  PARAMETROS_REPRODUCCION,
} from './operativo.tendencias.js';
import { modeloOperativo, diasDeTanque } from './operativo.data.js';
import { periodoDe, normalizarFiltro, kpiReproduccion } from './operativo.tablero.js';
import { reproduccionDeLote } from './operativo.lotes.js';
import { UMBRALES_DE_AVISO } from './operativo.umbrales.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { sumarDias } from '../registros/lib/mad-libro.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg, piscina) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX',
  Fecha: fecha, Lote: lote, 'Código genético': cg, 'Piscina Broodstock': piscina, Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const MOV = (fecha, so, to, sd, td, machos, hembras) => ({ _SheetOrigin: O, 'Agua destino': 'RAS', Fecha: fecha,
  'Sala origen': so, 'Tanque origen': to, 'Sala destino': sd, 'Tanque destino': td, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const DES = (fecha, lote, cg, desoves, huevos, n2, n5) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': cg,
  Desoves: desoves, 'Total de huevos': huevos, N2: n2, N5: n5 });
const dias = (desde, n) => Array.from({ length: n }, (_, i) => sumarDias(desde, i));

const FOTO = '2026-09-19';
/* Con «7 d»: el período es del 13 al 19/09 y el ANTERIOR, del 06 al 12/09.
   · TA — Sala 1, tanques 1 y 2 (10♂ 20♀ cada uno, CA, piscina P1), ingreso 16/07 y una cópula el 20/07: produce
     desde el 20/07 (antes de sus 15 días) → 61 días al 19/09.
   · TB — Sala 2, tanque 16 (40♂ 20♀, CB, P2), ingreso 06/07 → produce desde el 21/07: 60 días justos. El 13/09 se
     reparte entre el 16 y el 17 (12♂ 10♀ al 17).
   · TC — Sala 4, tanque 1 (20♂ 8♀, CA, P3), ingreso 10/09: en cuarentena.
   · TD — Sala 3, tanque 22 (10♂ 30♀, CB, P4), ingreso 01/08; el 15/09 se muda ENTERO a la Sala 5, tanque 9.
   · TH — Sala 5, tanque 10 (10♂ 10♀, CA, P5), ingreso 01/08: partes con cópulas, ningún desove.
   · TE y TI — desoves de lotes sin ingreso (no están en ninguna sala). */
const PLANTA = [
  ING('2026-07-16', 'TA', 'Sala 1', 1, 10, 20, 'CA', 'P1'),
  ING('2026-07-16', 'TA', 'Sala 1', 2, 10, 20, 'CA', 'P1'),
  TQ('2026-07-20', 'Sala 1', 1, { 'Cópulas': 1 }),
  ING('2026-07-06', 'TB', 'Sala 2', 16, 40, 20, 'CB', 'P2'),
  ING('2026-09-10', 'TC', 'Sala 4', 1, 20, 8, 'CA', 'P3'),
  ING('2026-08-01', 'TD', 'Sala 3', 22, 10, 30, 'CB', 'P4'),
  ING('2026-08-01', 'TH', 'Sala 5', 10, 10, 10, 'CA', 'P5'),
  MOV('2026-09-13', 'Sala 2', 16, 'Sala 2', 17, 12, 10),
  MOV('2026-09-15', 'Sala 3', 22, 'Sala 5', 9, 10, 30),

  /* MORTALIDAD y CÓPULAS · la Sala 1: antes 6 partes con 1 baja y 3 cópulas; ahora 3 partes con 2 bajas y 3 cópulas.
     → bajas por tanque y día 1 → 2 (+100 %), la suma 6 → 6; cópulas 15 % → 15 % (la regla de la foto: 45 % → 22,5 %). */
  ...dias('2026-09-10', 3).flatMap((f) => [1, 2].map((t) => TQ(f, 'Sala 1', t, { 'Machos muertos': 1, 'Cópulas': 3 }))),
  TQ('2026-09-13', 'Sala 1', 1, { 'Machos muertos': 2, 'Cópulas': 3 }),
  TQ('2026-09-14', 'Sala 1', 1, { 'Machos muertos': 2, 'Cópulas': 3 }),
  TQ('2026-09-13', 'Sala 1', 2, { 'Machos muertos': 2, 'Cópulas': 3 }),
  /* La Sala 2: antes 3 partes (2 bajas, 4 cópulas, 20♀); ahora 10 partes en dos tanques (2 bajas, 1 cópula, 10♀) y 6
     DESCARTES de selección el 13/09 en el 16, que no son bajas. → bajas 2 → 2 por tanque y día (la suma: 6 → 20; con
     los descartes, 2 → 2,6); cópulas 20 % → 10 % (la regla de la foto: 60 % → 50 %). */
  ...dias('2026-09-10', 3).map((f) => TQ(f, 'Sala 2', 16, { 'Machos muertos': 2, 'Cópulas': 4 })),
  ...dias('2026-09-13', 5).flatMap((f) => [16, 17].map((t) => TQ(f, 'Sala 2', t, { 'Machos muertos': 2, 'Cópulas': 1,
    ...(f === '2026-09-13' && t === 16 ? { 'Machos muertos por descarte de selección': 6 } : {}) }))),
  /* La Sala 4: sube de 1 a 3 bajas por parte, pero ahora sólo tiene 2 partes: lo que SUBE necesita 3 en los dos. */
  ...dias('2026-09-10', 3).map((f) => TQ(f, 'Sala 4', 1, { 'Machos muertos': 1 })),
  ...dias('2026-09-13', 2).map((f) => TQ(f, 'Sala 4', 1, { 'Machos muertos': 3 })),
  /* TD: antes 3 partes en la Sala 3 (6 cópulas, 30♀) = 20 %; ahora 2 allí y 3 en la Sala 5 (3 cópulas) = 21/150 = 14 %.
     El parte del 15/09 del tanque que dejó vacío (100 cópulas) no es suyo: con él saldría 121/180. */
  ...dias('2026-09-10', 3).map((f) => TQ(f, 'Sala 3', 22, { 'Cópulas': 6 })),
  ...dias('2026-09-13', 2).map((f) => TQ(f, 'Sala 3', 22, { 'Cópulas': 6 })),
  TQ('2026-09-15', 'Sala 3', 22, { 'Cópulas': 100 }),
  ...dias('2026-09-16', 3).map((f) => TQ(f, 'Sala 5', 9, { 'Cópulas': 3 })),
  /* TH: antes 3 partes con 4 cópulas (10♀) = 40 %; ahora 3 con 2 = 20 %. */
  ...dias('2026-09-10', 3).map((f) => TQ(f, 'Sala 5', 10, { 'Cópulas': 4 })),
  ...dias('2026-09-13', 3).map((f) => TQ(f, 'Sala 5', 10, { 'Cópulas': 2 })),

  /* DESOVES · TA: antes 3 (2 desoves, 200 000 huevos, N2 160 000, N5 300 000); ahora 2 de 140 000 huevos y N2
     126 000, uno con N5 200 000 y otro PENDIENTE. → huevos por desove 100 000 → 70 000 (−30 %), fertilidad 80 → 90 %,
     N5 por desove 150 000 → 100 000 (−33,3 %); la Sala 1 produce 6 → 4 desoves. */
  ...['2026-09-07', '2026-09-09', '2026-09-11'].map((f) => DES(f, 'TA', 'CA', 2, 200000, 160000, 300000)),
  DES('2026-09-14', 'TA', 'CA', 2, 140000, 126000, 200000),
  DES('2026-09-17', 'TA', 'CA', 2, 140000, 126000, ''),
  /* TD: todo igual, pero dos de sus tres desoves de ahora esperan su N5 (el TOTAL caería de 600 000 a 200 000) y el
     del 17/09 también su N2 (sobre todos los huevos, la fertilidad caería de 80 a 53 %). El del 15/09, día de la
     mudanza, cuenta en la Sala 3 y en la 5; el del 17/09, sólo en la 5. → la Sala 3 produce 6 → 4. */
  ...['2026-09-06', '2026-09-08', '2026-09-10'].map((f) => DES(f, 'TD', 'CB', 2, 150000, 120000, 200000)),
  DES('2026-09-13', 'TD', 'CB', 2, 150000, 120000, 200000),
  DES('2026-09-15', 'TD', 'CB', 2, 150000, 120000, ''),
  DES('2026-09-17', 'TD', 'CB', 2, 150000, '', ''),
  /* TB: sólo DOS desoves antes: cae mucho, pero no llega al mínimo (ni por lote, ni la Sala 2). Y uno de ahora es de
     OTRO código (CA, un lote con dos): con el filtro CB no cuenta —sin filtrar las filas por código, el N5 de CB
     bajaría un 43,8 % en vez de un 26,7 %—. */
  ...['2026-09-08', '2026-09-11'].map((f) => DES(f, 'TB', 'CB', 3, 300000, 240000, 300000)),
  DES('2026-09-14', 'TB', 'CB', 1, 50000, 10000, 20000),
  DES('2026-09-15', 'TB', 'CA', 1, 50000, 40000, 5000),
  /* TE: tres antes y NINGUNO ahora: sin desoves no hay cociente que comparar. */
  ...['2026-09-06', '2026-09-07', '2026-09-08'].map((f) => DES(f, 'TE', 'CA', 1, 100000, 50000, 100000)),
  /* TI: tres FILAS antes, pero sólo dos traen N2 y N5: su N5 cae un 75 % y su fertilidad de 90 a 30 %, y ninguna de
     las dos llega al mínimo. */
  DES('2026-09-06', 'TI', 'CA', 1, 100000, 90000, 200000),
  DES('2026-09-07', 'TI', 'CA', 1, 100000, 90000, 200000),
  DES('2026-09-08', 'TI', 'CA', 1, 100000, '', ''),
  DES('2026-09-14', 'TI', 'CA', 1, 100000, 30000, 50000),
];
const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const PARTES = diasDeTanque(M.fuentes.tanques);
const SIN = normalizarFiltro({});
const P7 = periodoDe('7d', FOTO, M.fuentes);
const T = tendencias(M, P7, SIN, PARTES);

/* EL BORDE: el 20 % JUSTO avisa, en lo que baja y en lo que sube; un 10 % no. TJ (Sala 1, tanque 5) baja de 10 a 8
   desoves y sube de 1 a 1,2 bajas por tanque y día; TK (Sala 2, tanque 18) baja de 10 a 9 y muere igual. */
const BORDE = [
  ING('2026-08-01', 'TJ', 'Sala 1', 5, 20, 20, 'CA', 'P6'),
  ING('2026-08-01', 'TK', 'Sala 2', 18, 20, 20, 'CA', 'P7'),
  ...dias('2026-09-06', 5).flatMap((f) => [TQ(f, 'Sala 1', 5, { 'Machos muertos': 1 }), TQ(f, 'Sala 2', 18, { 'Machos muertos': 1 })]),
  ...dias('2026-09-13', 5).flatMap((f, i) => [TQ(f, 'Sala 1', 5, { 'Machos muertos': i === 0 ? 2 : 1 }), TQ(f, 'Sala 2', 18, { 'Machos muertos': 1 })]),
  ...dias('2026-09-06', 5).flatMap((f) => [DES(f, 'TJ', 'CA', 2, 100000, 80000, 100000), DES(f, 'TK', 'CA', 2, 100000, 80000, 100000)]),
  ...dias('2026-09-13', 4).flatMap((f) => [DES(f, 'TJ', 'CA', 2, 100000, 80000, 100000), DES(f, 'TK', 'CA', 2, 100000, 80000, 100000)]),
  DES('2026-09-17', 'TK', 'CA', 1, 50000, 40000, 50000),
];

describe('Maduración · tendencias · el período anterior y el cambio', () => {
  it('el anterior es el de IGUAL duración que acaba la víspera: 7 d, hoy, el mes', () => {
    expect(P7).toMatchObject({ desde: '2026-09-13', hasta: FOTO, dias: 7 });
    expect(periodoAnterior(P7)).toEqual({ clave: '7d', desde: '2026-09-06', hasta: '2026-09-12', dias: 7 });
    expect(periodoAnterior(periodoDe('hoy', FOTO, M.fuentes))).toMatchObject({ desde: '2026-09-18', hasta: '2026-09-18', dias: 1 });
    expect(periodoAnterior(periodoDe('mes', FOTO, M.fuentes))).toMatchObject({ desde: '2026-08-13', hasta: '2026-08-31', dias: 19 });
    expect(periodoAnterior({})).toBe(null);
    expect(periodoAnterior({ desde: '19/09/2026', dias: 7 })).toBe(null);
  });

  it('el cambio en %, con un decimal; sin base (cero o vacío) o sin cifra de ahora, no hay cambio', () => {
    expect(cambioPct(10, 8)).toBe(-20);
    expect(cambioPct(6, 4)).toBe(-33.3);
    expect(cambioPct(1, 2)).toBe(100);
    expect(cambioPct(1, 1.2)).toBe(20);
    expect(cambioPct(0, 5)).toBe(null);
    expect(cambioPct('', 5)).toBe(null);
    expect(cambioPct(5, '')).toBe(null);
    expect(cambioPct(5, 0)).toBe(-100);
  });

  it('los umbrales son los del usuario: 20 %, 3 registros y más de 60 días', () => {
    expect([UMBRALES_DE_AVISO.cambio.valor, UMBRALES_DE_AVISO.registros.valor, UMBRALES_DE_AVISO.produccion.valor]).toEqual([20, 3, 60]);
    expect(PARAMETROS_REPRODUCCION.map((x) => x.id)).toEqual(['copulas', 'huevosPorDesove', 'fertilidad']);
  });
});

describe('Maduración · tendencias · lo que avisa, con «7 d» y sin filtro', () => {
  it('🦐 nauplios: el N5 por desove de los que YA lo tienen baja un 44,3 %, y baja TA; TD no (sus pendientes no cuentan)', () => {
    // antes 2 800 000 N5 en 23 desoves con N5; ahora 475 000 en 7
    expect(T.nauplios).toEqual({ antes: 121739.13, ahora: 67857.14, cambio: -44.3,
      lotes: [{ lote: 'TA', antes: 150000, ahora: 100000, cambio: -33.3 }] });
    // la regla equivocada: el total de N5 de TD caería de 600 000 a 200 000; TI tiene tres filas pero dos con N5
    expect(T.nauplios.lotes.map((l) => l.lote)).not.toContain('TD');
    expect(T.nauplios.lotes.map((l) => l.lote)).not.toContain('TI');
  });

  it('🥚 producción: las salas donde estuvo el lote ESE día —la 3, que TD dejó—; la Sala 2 no llega al mínimo', () => {
    expect(T.produccion).toEqual([
      { sala: 'Sala 1', antes: 6, ahora: 4, cambio: -33.3 },
      { sala: 'Sala 3', antes: 6, ahora: 4, cambio: -33.3 },
    ]);
  });

  it('💀 mortalidad: por tanque y día —la Sala 1 dobla con la mitad de partes; la Sala 2, igual con el triple—', () => {
    expect(T.mortalidad).toEqual([
      { sala: 'Sala 1', antes: 1, ahora: 2, cambio: 100, bajas: { antes: 6, ahora: 6 }, partes: { antes: 6, ahora: 3 } },
    ]);
    // la Sala 4 sube un 200 % pero ahora sólo tiene 2 partes: lo que SUBE pide 3 en los dos períodos
    expect(T.mortalidad.map((s) => s.sala)).not.toContain('Sala 4');
  });

  it('🧬 reproducción por lote: TA huevos por desove; TB, TD y TH cópulas (TA no: copula igual con menos partes)', () => {
    expect(T.reproduccion).toEqual([
      { lote: 'TA', parametros: [{ id: 'huevosPorDesove', antes: 100000, ahora: 70000, cambio: -30 }] },
      { lote: 'TB', parametros: [{ id: 'copulas', antes: 20, ahora: 10, cambio: -50 }] },
      { lote: 'TD', parametros: [{ id: 'copulas', antes: 20, ahora: 14, cambio: -30 }] },
      { lote: 'TH', parametros: [{ id: 'copulas', antes: 40, ahora: 20, cambio: -50 }] },
    ]);
  });

  it('el total son las líneas de aviso: nauplios 1 + producción 2 + mortalidad 1 + reproducción 4', () => {
    expect(T.total).toBe(8);
    expect(T.anterior).toEqual({ clave: '7d', desde: '2026-09-06', hasta: '2026-09-12', dias: 7 });
  });

  it('si el N5 del conjunto NO baja pero el de un lote sí, sale la línea con ese lote (y sin cambio del conjunto)', () => {
    /* TF (sin ingreso) sube de 100 000 a 300 000 por desove: el conjunto pasa de 119 230,77 a 119 444,44 (+0,2 %). */
    const TF = [...['2026-09-06', '2026-09-08', '2026-09-10'].map((f) => DES(f, 'TF', 'CA', 1, 100000, 80000, 100000)),
      ...['2026-09-15', '2026-09-16'].map((f) => DES(f, 'TF', 'CA', 1, 100000, 80000, 300000))];
    const MF = modeloOperativo([...PLANTA, ...TF], { hoy: FOTO, fecha: FOTO });
    const t = tendencias(MF, periodoDe('7d', FOTO, MF.fuentes), SIN, diasDeTanque(MF.fuentes.tanques));
    expect(t.nauplios).toEqual({ antes: 119230.77, ahora: 119444.44, cambio: null,
      lotes: [{ lote: 'TA', antes: 150000, ahora: 100000, cambio: -33.3 }] });
  });

  it('pasar la presencia ya calculada da lo mismo que dejar que la calcule', () => {
    const pres = presenciaDiaria(M.fuentes, '2026-09-05', FOTO);
    expect(tendencias(M, P7, SIN, PARTES, pres)).toEqual(T);
  });

  it('el BORDE: un 20 % justo avisa, al bajar y al subir; un 10 %, no', () => {
    const MB = modeloOperativo(BORDE, { hoy: FOTO, fecha: FOTO });
    const t = tendencias(MB, periodoDe('7d', FOTO, MB.fuentes), SIN, diasDeTanque(MB.fuentes.tanques));
    expect(t.produccion).toEqual([{ sala: 'Sala 1', antes: 10, ahora: 8, cambio: -20 }]);
    expect(t.mortalidad).toEqual([{ sala: 'Sala 1', antes: 1, ahora: 1.2, cambio: 20, bajas: { antes: 5, ahora: 6 }, partes: { antes: 5, ahora: 5 } }]);
    expect(t.total).toBe(2);
  });
});

describe('Maduración · tendencias · la presencia día a día', () => {
  const pres = presenciaDiaria(M.fuentes, '2026-09-05', FOTO);

  it('un desove cuenta donde estuvo el lote al cierre de la víspera o del día: el de la mudanza, en las dos salas', () => {
    expect(salasDelDesove(pres, 'TD', '2026-09-14')).toEqual(['Sala 3']);
    expect(salasDelDesove(pres, 'TD', '2026-09-15')).toEqual(['Sala 3', 'Sala 5']);
    expect(salasDelDesove(pres, 'TD', '2026-09-16')).toEqual(['Sala 5']);
    expect(salasDelDesove(pres, 'TE', '2026-09-07')).toEqual([]);
    expect(salasDelDesove(pres, 'TD', '2026-01-01')).toEqual([]);
  });

  it('cada día, los tanques con animales y sus lotes; los días sin eventos repiten el cierre anterior', () => {
    expect(pres.get('2026-09-05').tanques.get('Sala 3|22')).toMatchObject({ sala: 'Sala 3', machos: 10, hembras: 30 });
    expect(pres.get('2026-09-15').tanques.has('Sala 3|22')).toBe(false);
    expect([...pres.get('2026-09-15').tanques.get('Sala 5|9').lotes]).toEqual(['TD']);
    expect(pres.get('2026-09-14').tanques.get('Sala 2|17')).toMatchObject({ hembras: 10 });
    expect(pres.size).toBe(15);
  });

  it('las cifras de los desoves son las del Saldo: las mismas que reproduccionDeLote y kpiReproduccion', () => {
    for (const lote of ['TA', 'TD', 'TI']) {
      const filas = M.fuentes.desoves.filter((r) => r.Lote === lote);
      const a = acumularDesoves(filas);
      const r = reproduccionDeLote(M.fuentes, lote, { desde: '2026-01-01', hasta: FOTO });
      expect([a.huevosPorDesove, a.fertilidad, a.n5PorDesove], lote).toEqual([r.huevosPorDesove, r.fertilidad, r.n5PorDesove]);
      const k = kpiReproduccion(filas, { desde: '2026-01-01', hasta: FOTO }, SIN);
      expect([a.fertilidad, Math.round(a.n5PorDesove)], lote).toEqual([k.fertilidad, k.naupliosPorHembra]);
    }
    expect(acumularDesoves(M.fuentes.desoves.filter((r) => r.Lote === 'TD'))).toMatchObject({ filas: 6, conDesoves: 6, conN2: 5, conN5: 4 });
  });
});

describe('Maduración · tendencias · lo filtrado', () => {
  it('con la Sala 3: su producción, y TD (el lote que estuvo en ella); ni la Sala 1 ni TA', () => {
    const t = tendencias(M, P7, normalizarFiltro({ sala: 'Sala 3' }), PARTES);
    expect(t.produccion.map((s) => s.sala)).toEqual(['Sala 3']);
    expect(t.mortalidad).toEqual([]);
    expect(t.reproduccion.map((l) => l.lote)).toEqual(['TD']);
    expect(t.nauplios).toBe(null);
    expect(t.total).toBe(2);
  });

  it('con el lote TA: su sala y sus cifras', () => {
    const t = tendencias(M, P7, normalizarFiltro({ lote: 'ta' }), PARTES);
    expect(t.produccion.map((s) => s.sala)).toEqual(['Sala 1']);
    expect(t.mortalidad.map((s) => s.sala)).toEqual(['Sala 1']);
    expect(t.reproduccion.map((l) => l.lote)).toEqual(['TA']);
    expect(t.nauplios).toMatchObject({ antes: 150000, ahora: 100000, cambio: -33.3 });
  });

  it('con el código CB: los partes no dicen el código, así que las cópulas no se comparan', () => {
    const t = tendencias(M, P7, normalizarFiltro({ codigo: 'CB' }), PARTES);
    expect(t.reproduccion).toEqual([]);
    // N5 de los desoves CB (TB y TD): 1 200 000 / 12 → 220 000 / 3
    expect(t.nauplios).toEqual({ antes: 100000, ahora: 73333.33, cambio: -26.7, lotes: [] });
    expect(t.produccion).toEqual([]);
  });

  it('🔴 0r·4 · H2 · la pareja «CB/CZ» (CZ no está en ninguna fila) dice lo mismo que CB: cuenta como sus dos códigos', () => {
    const conCB = tendencias(M, P7, normalizarFiltro({ codigo: 'CB' }), PARTES);
    expect(tendencias(M, P7, normalizarFiltro({ codigo: 'CB/CZ' }), PARTES).nauplios).toEqual(conCB.nauplios);
  });

  it('con el lote TI (tres filas antes, sólo dos con N5 y N2): ni su N5 ni su fertilidad llegan al mínimo', () => {
    const t = tendencias(M, P7, normalizarFiltro({ lote: 'TI' }), PARTES);
    expect([t.nauplios, t.reproduccion, t.total]).toEqual([null, [], 0]);
  });

  it('con un tanque: la mortalidad de ESE tanque (el 2 de la Sala 1 tiene ahora un solo parte: no llega)', () => {
    expect(tendencias(M, P7, normalizarFiltro({ sala: 'Sala 1', tanque: 2 }), PARTES).mortalidad).toEqual([]);
    // el 1: antes 3 partes (1 baja), ahora 2 (2 bajas): tampoco llega a 3 en los dos
    expect(tendencias(M, P7, normalizarFiltro({ sala: 'Sala 1', tanque: 1 }), PARTES).mortalidad).toEqual([]);
  });
});

describe('Maduración · tendencias · sin nada con qué comparar', () => {
  it('con «Todo» o «Hoy» el anterior no tiene datos: nada avisa', () => {
    for (const clave of ['todo', 'hoy']) {
      const t = tendencias(M, periodoDe(clave, FOTO, M.fuentes), SIN, PARTES);
      expect([t.total, t.nauplios, t.produccion.length, t.mortalidad.length, t.reproduccion.length], clave).toEqual([0, null, 0, 0, 0]);
    }
  });

  it('modelos DEGENERADOS: sin filas, sin libro, sin partes, sin período: no lanza y no avisa', () => {
    const vacio = modeloOperativo([], { hoy: FOTO, fecha: FOTO });
    const pv = periodoDe('7d', FOTO, vacio.fuentes);
    expect(tendencias(vacio, pv, SIN, []).total).toBe(0);
    expect(tendencias(vacio, pv, SIN, undefined).total).toBe(0);
    expect(tendencias({}, pv, SIN, []).total).toBe(0);
    expect(tendencias(M, {}, SIN, PARTES)).toMatchObject({ anterior: null, total: 0 });
    expect(permanencia(vacio, SIN)).toEqual([]);
    expect(permanencia({}, SIN)).toEqual([]);
    const soloIngreso = modeloOperativo([ING('2026-09-01', 'TZ', 'Sala 1', 3, 1, 1, 'CA', 'P9')], { hoy: FOTO, fecha: FOTO });
    expect(tendencias(soloIngreso, periodoDe('7d', FOTO, soloIngreso.fuentes), SIN, []).total).toBe(0);
  });
});

describe('Maduración · permanencia', () => {
  it('más de 60 días en producción: TA (61, desde su cópula del 20/07); TB, con 60 justos, todavía no', () => {
    expect(permanencia(M, SIN)).toEqual([
      { lote: 'TA', dias: 61, salas: [{ sala: 'Sala 1', dias: 61 }], piscinas: ['P1'], codigos: ['CA'] },
    ]);
  });

  it('un día después, TB también (61), y el que más lleva va primero', () => {
    const M20 = modeloOperativo(PLANTA, { hoy: '2026-09-20', fecha: '2026-09-20' });
    expect(permanencia(M20, SIN).map((l) => [l.lote, l.dias, l.piscinas, l.codigos])).toEqual([
      ['TA', 62, ['P1'], ['CA']], ['TB', 61, ['P2'], ['CB']],
    ]);
  });

  it('la cópula ANTES de los 15 días cuenta: sin ella, TA produciría desde el 31/07 (50 días) y no avisaría', () => {
    const sinCopula = PLANTA.filter((r) => !(r.Fecha === '2026-07-20' && r['Cópulas'] === 1));
    expect(sinCopula).toHaveLength(PLANTA.length - 1);
    expect(permanencia(modeloOperativo(sinCopula, { hoy: FOTO, fecha: FOTO }), SIN)).toEqual([]);
  });

  it('respeta lo filtrado: otra sala, el estado de cuarentena u otro lote lo dejan fuera', () => {
    expect(permanencia(M, normalizarFiltro({ sala: 'Sala 1' })).map((l) => l.lote)).toEqual(['TA']);
    expect(permanencia(M, normalizarFiltro({ sala: 'Sala 2' }))).toEqual([]);
    expect(permanencia(M, normalizarFiltro({ lote: 'TB' }))).toEqual([]);
    expect(permanencia(M, normalizarFiltro({ codigo: 'CB' }))).toEqual([]);
    expect(permanencia(M, normalizarFiltro({ sexo: 'hembras' })).map((l) => l.lote)).toEqual(['TA']);
  });
});
