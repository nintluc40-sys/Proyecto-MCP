/* ============================================================
   MADURACIÓN · OPERATIVO — BROODSTOCK, LAS PISCINAS DE ORIGEN (F6.1)

   Qué se exige, con fixtures montados para que la regla equivocada dé OTRO resultado:
   · La tabla es el ÚLTIMO corte de la PLANTA hasta el día elegido. PZ3 sólo vino hace dos cortes: filtrarla no la
     resucita con su semana vieja (con «el último corte del filtro» saldría, pesando 20 g). Y el corte del 26/09,
     posterior a la foto, no existe hasta ese día: la 9701 pesa 15 g, no 99.
   · Aparte, las del corte anterior que no vinieron en éste (PZ7) y las piscinas del Ingreso que ninguna carga
     nombra (PZ99; la PZ55 entra después de la foto y todavía no cuenta).
   · El enlace con el Ingreso es la piscina CANÓNICA: el «9701» de texto del Ingreso es la 9701 numérica de la carga,
     y «PZ 12» y «PZ12» son la misma piscina. Su desempeño SUMA las dos grafías: 50 ingresados (con la llave cruda
     serían 40 o 10).
   · Con una sola grafía, el desempeño es el MISMO que el de la comparativa por piscina de 🧬 Lotes.
   · El filtro elige piscinas; sala, tanque, estado y sexo no le aplican y se DICEN.
   · La ficha: su serie es la del período; su última fila, la de la foto aunque caiga fuera del período; cada lote
     dice lo que entró DE ESTA piscina (QB: 20, no los 60 del lote) y sus vivos son los del lote entero, los mismos
     de 🧬 Lotes.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { ignoraDeBroodstock, sobrevivenciaDudosa, tablaDePiscinas, fichaDePiscina } from './operativo.broodstock.js';
import { modeloOperativo } from './operativo.data.js';
import { normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { tablaDeLotes, comparativa } from './operativo.lotes.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg, piscina, camaronera) => ({ _SheetOrigin: O,
  'Camaronera origen': camaronera, Fecha: fecha, Lote: lote, 'Código genético': cg, 'Piscina Broodstock': piscina,
  Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const DES = (fecha, lote, cg, piscina, desoves, huevos, n2, n5) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote,
  'Código genético': cg, 'Piscina Broodstock': piscina, Desoves: desoves, 'Total de huevos': huevos, N2: n2, N5: n5 });
const BS = (corte, piscina, extra) => ({ _SheetOrigin: O, 'Pl/g': '', 'Fecha de corte': corte, Piscina: piscina, ...extra });

const FOTO = '2026-09-19';

/* La planta de las pruebas, al cierre del 19/09:
   · QA  — 50♂ 50♀ de la piscina 9701 (Sala 1, t1); 5♂ 5♀ muertos el 10/09 → 90 vivos. Desova el 15/09.
   · QB  — de DOS piscinas: 20♂ 20♀ de «PZ 12» (t2) y 10♂ 10♀ de la 9701 (t3) → 60 vivos.
   · QD  — 5♂ 5♀ de «PZ12», sin espacio: la misma piscina que «PZ 12».
   · QC  — de la PZ99, que ninguna carga de Broodstock nombra.
   · QE  — de la PZ55, el 22/09: después de la foto.
   · QF  — de la 9701, el 23/09: también después de la foto (no puede sumarse a sus ingresados del 19/09).
   Broodstock: la 9701 en los tres cortes (y en uno del 26/09, posterior), la PZ12 en los dos últimos, la PZ7 sólo en
   el del 12/09 y la PZ3 sólo en el del 05/09. La PZ12 del 19/09 trae su código en minúsculas. */
const PLANTA = [
  ING('2026-09-01', 'QA', 'Sala 1', 1, 50, 50, 'CA', '9701', 'Río Ficticio'),
  ING('2026-09-02', 'QB', 'Sala 1', 2, 20, 20, 'CB', 'PZ 12', 'Playa Inventada'),
  ING('2026-09-02', 'QB', 'Sala 1', 3, 10, 10, 'CA', '9701', 'Río Ficticio'),
  ING('2026-09-03', 'QD', 'Sala 2', 1, 5, 5, 'CB', 'PZ12', 'Playa Inventada'),
  ING('2026-09-03', 'QC', 'Sala 2', 2, 8, 8, 'CC', 'PZ99', 'Otra'),
  ING('2026-09-22', 'QE', 'Sala 2', 3, 6, 6, 'CD', 'PZ55', 'Otra'),
  ING('2026-09-23', 'QF', 'Sala 2', 4, 7, 7, 'CA', '9701', 'Río Ficticio'),
  TQ('2026-09-10', 'Sala 1', 1, { 'Machos muertos': 5, 'Hembras muertas': 5 }),
  DES('2026-09-15', 'QA', 'CA', '9701', 3, 300000, 240000, 0),

  BS('2026-09-05', 9701, { 'Fase actual': 'PRECRIA', 'Peso actual (g)': 10, 'Sobrevivencia estimada (%)': 97,
    'Código genético': 'CA', Camaronera: 'Río Ficticio', 'Observación': 'Muestreo con atarraya' }),
  BS('2026-09-05', 'PZ3', { 'Fase actual': 'Engorde', 'Peso actual (g)': 20, 'Código genético': 'CC', Camaronera: 'Otra' }),
  BS('2026-09-12', 9701, { 'Fase actual': 'ENGORDE', 'Peso actual (g)': 12, 'Incremento última semana (g)': 2,
    'Código genético': 'CA', Camaronera: 'Río Ficticio' }),
  BS('2026-09-12', 'PZ12', { 'Fase actual': 'Engorde', 'Peso actual (g)': 18, 'Código genético': 'CB', Camaronera: 'Playa Inventada' }),
  BS('2026-09-12', 'PZ7', { 'Fase actual': 'Engorde', 'Peso actual (g)': 25, 'Sobrevivencia estimada (%)': 120,
    'Código genético': 'CB', Camaronera: 'Playa Inventada' }),
  BS('2026-09-19', 9701, { 'Fase actual': 'PRE-REPRODUCTOR', 'Peso actual (g)': 15, 'Incremento última semana (g)': 3,
    'Crecimiento fase actual (g/sem)': 2.5, 'Sobrevivencia estimada (%)': 95, 'Densidad (cam/m²)': 8, 'Edad total (días)': 120,
    'Días fase 1 (precría)': 30, 'Días fase 2 (engorde)': 80, 'Días fase 3 (pre-reproductor)': 10,
    'Código genético': 'CA', Camaronera: 'Río Ficticio', 'Observación': 'Cosecha parcial' }),
  BS('2026-09-19', 'PZ12', { 'Fase actual': 'Maternidad', 'Peso actual (g)': 22, 'Sobrevivencia estimada (%)': 0.9,
    'Código genético': 'cb', Camaronera: 'Playa Inventada' }),
  BS('2026-09-26', 9701, { 'Fase actual': 'Pre-reproductor', 'Peso actual (g)': 99, 'Código genético': 'CA', Camaronera: 'Río Ficticio' }),
];

const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const P30 = periodoDe('30d', FOTO, M.fuentes);
const P7D = periodoDe('7d', FOTO, M.fuentes);
const SIN = normalizarFiltro({});
const F = (o) => normalizarFiltro(o);
const nombres = (t) => t.piscinas.map((p) => p.piscina);
const de = (t, piscina) => t.piscinas.find((p) => p.piscina === piscina);

describe('Maduración · broodstock · la tabla es el ÚLTIMO corte de la planta', () => {
  it('cada piscina del último corte hasta la foto, con la fila de ESE corte', () => {
    const t = tablaDePiscinas(M, SIN);
    expect(t.corte).toBe('2026-09-19');
    expect(t.previo).toBe('2026-09-12');
    expect(t.cortes).toBe(3);
    expect(nombres(t)).toEqual(['9701', 'PZ12']);
    expect(de(t, '9701')).toMatchObject({ corte: '2026-09-19', peso: 15, incremento: 3, crecimiento: 2.5, sobrevivencia: 95,
      densidad: 8, edad: 120, dias: { precria: 30, engorde: 80, prerreproductor: 10 }, codigo: 'CA', camaronera: 'Río Ficticio',
      observacion: 'Cosecha parcial' });
  });

  it('un corte POSTERIOR a la foto todavía no existe; el día que llega, manda él', () => {
    expect(de(tablaDePiscinas(M, SIN), '9701').peso).toBe(15);
    // Mirar hoy (26/09) una foto del pasado (19/09) es lo mismo que haberla mirado ese día.
    const pasado = tablaDePiscinas(modeloOperativo(PLANTA, { hoy: '2026-09-26', fecha: FOTO }), SIN);
    expect(pasado.corte).toBe('2026-09-19');
    expect(de(pasado, '9701').peso).toBe(15);
    const t26 = tablaDePiscinas(modeloOperativo(PLANTA, { hoy: '2026-09-26', fecha: '2026-09-26' }), SIN);
    expect(t26.corte).toBe('2026-09-26');
    expect(nombres(t26)).toEqual(['9701']);
    expect(de(t26, '9701').peso).toBe(99);
    expect(t26.ausentes).toEqual(['PZ12']);
    // Y con ella, lo que entró de la 9701 después del 19/09: QF, que en la foto del 19 no existía.
    expect(de(t26, '9701').lotes).toEqual(['QA', 'QB', 'QF']);
    expect(de(t26, '9701').desempeno.ingresados).toBe(134);
    expect(de(tablaDePiscinas(M, SIN), '9701').lotes).toEqual(['QA', 'QB']);
  });

  it('las del corte anterior que no vinieron en éste, aparte; las de hace dos cortes, no', () => {
    const t = tablaDePiscinas(M, SIN);
    expect(t.ausentes).toEqual(['PZ7']);
    expect(nombres(t)).not.toContain('PZ3');
    expect(t.ausentes).not.toContain('PZ3');
  });

  it('🔑 filtrar una piscina que dejó de venir NO la enseña con su semana vieja', () => {
    const p3 = tablaDePiscinas(M, F({ piscina: 'PZ3' }));
    expect(p3.corte).toBe('2026-09-19');
    expect(p3.piscinas).toEqual([]);
    expect(p3.ausentes).toEqual([]);
    const p7 = tablaDePiscinas(M, F({ piscina: 'PZ7' }));
    expect(p7.piscinas).toEqual([]);
    expect(p7.ausentes).toEqual(['PZ7']);
  });

  it('las piscinas del Ingreso que ninguna carga nombra, hasta la foto', () => {
    expect(tablaDePiscinas(M, SIN).sinBroodstock).toEqual(['PZ99']);
    expect(tablaDePiscinas(modeloOperativo(PLANTA, { hoy: '2026-09-26', fecha: '2026-09-26' }), SIN).sinBroodstock).toEqual(['PZ55', 'PZ99']);
    expect(tablaDePiscinas(M, F({ piscina: 'PZ99' })).sinBroodstock).toEqual(['PZ99']);
    expect(tablaDePiscinas(M, F({ piscina: '9701' })).sinBroodstock).toEqual([]);
    expect(tablaDePiscinas(M, F({ lote: 'QC' })).sinBroodstock).toEqual(['PZ99']);
    expect(tablaDePiscinas(M, F({ lote: 'QA' })).sinBroodstock).toEqual([]);
  });

  it('sin hojas no inventa nada', () => {
    const t = tablaDePiscinas(modeloOperativo([], { hoy: FOTO, fecha: FOTO }), SIN);
    expect(t).toMatchObject({ corte: '', previo: '', cortes: 0, piscinas: [], ausentes: [], sinBroodstock: [], ignora: [] });
    expect(tablaDePiscinas(null, SIN).piscinas).toEqual([]);
  });
});

describe('Maduración · broodstock · el enlace con los lotes', () => {
  it('la piscina canónica: el «9701» de texto del Ingreso es la 9701 numérica de la carga', () => {
    expect(de(tablaDePiscinas(M, SIN), '9701').lotes).toEqual(['QA', 'QB']);
  });

  it('🔑 con una sola grafía, el desempeño es EL MISMO que el de la comparativa por piscina', () => {
    const d = de(tablaDePiscinas(M, SIN), '9701').desempeno;
    const c = comparativa(M, SIN, P30, 'piscina').filas.find((f) => f.origen === '9701');
    expect(d).toEqual({ ingresados: c.ingresados, vivos: c.vivos, supervivencia: c.supervivencia, desoves: c.desoves,
      fertilidad: c.fertilidad, naupliosPorHembra: c.naupliosPorHembra });
    // Y no son dos cifras igual de equivocadas: 100 de QA + 20 de QB; 90 + 20 vivos; 240 000 de 300 000 huevos.
    expect(d).toMatchObject({ ingresados: 120, vivos: 110, desoves: 3, fertilidad: 80, naupliosPorHembra: '' });
  });

  it('🔑 «PZ 12» y «PZ12» son la misma piscina: su desempeño suma las dos grafías', () => {
    const p12 = de(tablaDePiscinas(M, SIN), 'PZ12');
    expect(p12.lotes).toEqual(['QB', 'QD']);
    expect(p12.desempeno).toMatchObject({ ingresados: 50, vivos: 50, supervivencia: 100 });
    // La comparativa, que lleva la piscina tal cual se tecleó, la parte en dos filas: es lo que se dice arriba.
    const c = comparativa(M, SIN, P30, 'piscina').filas;
    expect(c.find((f) => f.origen === 'PZ 12').ingresados).toBe(40);
    expect(c.find((f) => f.origen === 'PZ12').ingresados).toBe(10);
  });

  it('una piscina sin Ingreso no tiene lotes ni desempeño, y no se le inventan', () => {
    const t = tablaDePiscinas(modeloOperativo(PLANTA.filter((r) => r.Lote !== 'QA' && r.Lote !== 'QB'), { hoy: FOTO, fecha: FOTO }), SIN);
    expect(de(t, '9701')).toMatchObject({ lotes: [], desempeno: null });
  });
});

describe('Maduración · broodstock · lo que se lee de la fila', () => {
  it('la fase en su grafía canónica; una fuera del catálogo se conserva y se marca', () => {
    const t = tablaDePiscinas(M, SIN);
    expect(de(t, '9701')).toMatchObject({ fase: 'Pre-reproductor', faseEnCatalogo: true });
    expect(de(t, 'PZ12')).toMatchObject({ fase: 'Maternidad', faseEnCatalogo: false });
  });

  it('el código genético en su forma canónica, aunque la fila lo traiga en minúsculas', () => {
    expect(de(tablaDePiscinas(M, SIN), 'PZ12').codigo).toBe('CB');
  });

  it('la sobrevivencia se enseña como vino, marcada si no puede ser un porcentaje', () => {
    const t = tablaDePiscinas(M, SIN);
    expect(de(t, '9701')).toMatchObject({ sobrevivencia: 95, sobrevivenciaDudosa: '' });
    expect(de(t, 'PZ12')).toMatchObject({ sobrevivencia: 0.9, sobrevivenciaDudosa: 'fraccion' });
    expect(fichaDePiscina(M, 'PZ7', P30).ultimo).toMatchObject({ sobrevivencia: 120, sobrevivenciaDudosa: 'fuera' });
  });

  it('el criterio de la marca es el de la carga: entre 0 y 1, fracción; fuera de 0–100, imposible', () => {
    expect([0.5, 0.99].map(sobrevivenciaDudosa)).toEqual(['fraccion', 'fraccion']);
    expect([-1, 100.5].map(sobrevivenciaDudosa)).toEqual(['fuera', 'fuera']);
    // El cero es una piscina perdida, el 1 y el 100 son porcentajes: ninguno se marca. Y un vacío no es una cifra.
    expect([0, 1, 100, 95, null, ''].map(sobrevivenciaDudosa)).toEqual(['', '', '', '', '', '']);
  });

  it('una celda vacía es «sin dato», no un cero', () => {
    const p12 = de(tablaDePiscinas(M, SIN), 'PZ12');
    expect(p12).toMatchObject({ incremento: null, crecimiento: null, densidad: null, edad: null });
  });
});

describe('Maduración · broodstock · el filtro elige piscinas', () => {
  it('piscina (canónica), camaronera (sin tildes ni mayúsculas) y código genético: los de la fila', () => {
    expect(nombres(tablaDePiscinas(M, F({ piscina: '9701' })))).toEqual(['9701']);
    expect(nombres(tablaDePiscinas(M, F({ piscina: 'PZ 12' })))).toEqual(['PZ12']);
    expect(nombres(tablaDePiscinas(M, F({ camaronera: 'RIO FICTICIO' })))).toEqual(['9701']);
    expect(nombres(tablaDePiscinas(M, F({ codigo: 'cb' })))).toEqual(['PZ12']);
  });

  it('lote: las piscinas de las que ENTRÓ ese lote', () => {
    expect(nombres(tablaDePiscinas(M, F({ lote: 'qa' })))).toEqual(['9701']);
    expect(nombres(tablaDePiscinas(M, F({ lote: 'QD' })))).toEqual(['PZ12']);
    expect(nombres(tablaDePiscinas(M, F({ lote: 'QB' })))).toEqual(['9701', 'PZ12']);
    expect(nombres(tablaDePiscinas(M, F({ lote: 'QC' })))).toEqual([]);
  });

  it('cada piscina elegida se enseña ENTERA: filtrar por QA no le quita QB a la 9701', () => {
    const t = tablaDePiscinas(M, F({ lote: 'QA' }));
    expect(de(t, '9701').lotes).toEqual(['QA', 'QB']);
    expect(de(t, '9701').desempeno.ingresados).toBe(120);
  });

  it('sala, tanque, estado y sexo no le aplican: no cambian nada y se DICEN', () => {
    const base = tablaDePiscinas(M, SIN);
    const conSala = tablaDePiscinas(M, F({ sala: 'Sala 1', tanque: 1 }));
    expect(conSala.ignora).toEqual(['sala', 'tanque']);
    expect(conSala.piscinas).toEqual(base.piscinas);
    const conEstado = tablaDePiscinas(M, F({ estado: 'Cuarentena', sexo: 'hembras' }));
    expect(conEstado.ignora).toEqual(['estado', 'sexo']);
    expect(conEstado.piscinas).toEqual(base.piscinas);
    expect(ignoraDeBroodstock(SIN)).toEqual([]);
    // El tanque cuenta aunque valga 0, como en las etiquetas del filtro.
    expect(ignoraDeBroodstock(F({ sala: 'Sala 1', tanque: 0 }))).toEqual(['sala', 'tanque']);
    expect(ignoraDeBroodstock(F({ piscina: '9701', lote: 'QA', codigo: 'CA', camaronera: 'Playa Inventada' }))).toEqual([]);
  });
});

describe('Maduración · broodstock · la ficha de una piscina', () => {
  it('su serie es la del período, de la más antigua a la más reciente', () => {
    const f = fichaDePiscina(M, 9701, P30);
    expect(f.piscina).toBe('9701');
    expect(f.serie.map((s) => [s.corte, s.fase, s.peso])).toEqual([
      ['2026-09-05', 'Precría', 10], ['2026-09-12', 'Engorde', 12], ['2026-09-19', 'Pre-reproductor', 15]]);
    expect(fichaDePiscina(M, 9701, P7D).serie.map((s) => s.corte)).toEqual(['2026-09-19']);
  });

  it('su última fila es la de la foto aunque caiga fuera del período, y nunca una posterior', () => {
    const p3 = fichaDePiscina(M, 'PZ3', P7D);
    expect(p3.ultimo).toMatchObject({ corte: '2026-09-05', peso: 20 });
    expect(p3.serie).toEqual([]);
    expect(fichaDePiscina(M, 9701, P30).ultimo.peso).toBe(15);
    const M26 = modeloOperativo(PLANTA, { hoy: '2026-09-26', fecha: '2026-09-26' });
    expect(fichaDePiscina(M26, 9701, periodoDe('30d', '2026-09-26', M26.fuentes)).ultimo.peso).toBe(99);
  });

  it('las observaciones del período, la más reciente primero', () => {
    expect(fichaDePiscina(M, 9701, P30).observaciones).toEqual([
      { corte: '2026-09-19', texto: 'Cosecha parcial' }, { corte: '2026-09-05', texto: 'Muestreo con atarraya' }]);
    expect(fichaDePiscina(M, 9701, P7D).observaciones).toEqual([{ corte: '2026-09-19', texto: 'Cosecha parcial' }]);
  });

  it('🔑 cada lote dice lo que entró DE ESTA piscina y de qué otras; sus vivos son los del lote entero', () => {
    const f = fichaDePiscina(M, 9701, P30);
    expect(f.lotes.map((l) => [l.lote, l.entraron.total, l.otrasPiscinas])).toEqual([['QA', 100, []], ['QB', 20, ['PZ12']]]);
    expect(f.lotes.find((l) => l.lote === 'QB').entraron).toEqual({ machos: 10, hembras: 10, total: 20 });
    const lotes = tablaDeLotes(M, SIN);
    for (const l of f.lotes) {
      const L = lotes.find((x) => x.lote === l.lote);
      expect(l.vivos, l.lote).toBe(L.vivos.total);
      expect(l.supervivencia, l.lote).toBe(L.supervivencia.total);
      expect(l.estado, l.lote).toBe(L.estado);
      expect(l.estado, l.lote).not.toBe('');
    }
    expect(f.lotes.map((l) => l.vivos)).toEqual([90, 60]);
  });

  it('las dos grafías de la PZ12 llegan a su ficha como una sola piscina', () => {
    const f = fichaDePiscina(M, 'PZ 12', P30);
    expect(f.piscina).toBe('PZ12');
    expect(f.lotes.map((l) => [l.lote, l.entraron.total, l.otrasPiscinas])).toEqual([['QB', 40, ['9701']], ['QD', 10, []]]);
  });

  it('una piscina sin filas hasta la foto no tiene ficha', () => {
    expect(fichaDePiscina(M, 'ZZ', P30)).toBeNull();
    expect(fichaDePiscina(M, '', P30)).toBeNull();
    expect(fichaDePiscina(modeloOperativo(PLANTA, { hoy: FOTO, fecha: '2026-09-04' }), 9701, P30)).toBeNull();
  });
});
