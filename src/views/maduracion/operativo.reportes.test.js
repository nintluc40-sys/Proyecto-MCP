/* ============================================================
   MADURACIÓN · OPERATIVO — F7.1 · EL PARTE DIARIO

   Qué se exige, con fixtures montados para que la regla equivocada dé OTRO resultado:
   · El parte es de UN DÍA: la VÍSPERA tiene bajas (4), un movimiento, un desove y un tratamiento propios, y
     ninguno puede aparecer en el parte del 19. Con un período de 7 días o «todo» las cifras serían otras.
   · Las bajas van por TANQUE: los dos tanques de la Sala 1 son DOS filas. Agrupando por sala serían una, y
     agrupando por lote saldrían del libro (otra fuente) y sin «sala · tanque».
   · Hereda el filtro del tablero y lo dice: con Sala 2, las cifras son sólo las suyas y la cabecera avisa de
     que es un PARTE FILTRADO — que es lo que impide confundirlo con el de la planta entera.
   · La mortalidad del día es una RESTA entre dos cierres: con una serie que NO empieza en la víspera no hay
     cifra («sin-serie»), y eso es el contrato del módulo, no un detalle.
   · El papel recorta y lo DICE («+ N más», con el total); el Excel lleva las filas completas.
   · El código verificador es del CONTENIDO: no cambia porque cambie el sello de generación, y sí cambia si
     cambia un dato. Un código que dependiera de la hora no verificaría nada.
   · El parte del día EN CURSO avisa de que el registro aún no está cerrado.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  parteDiario, parteDiarioHtml, parteDiarioDoc, parteDiarioHojas, nombreDelParte, alcanceDelParte,
  codigoDelParte, recortar, fechaLarga, REPORTES, TOPE_FILAS,
  semanalPorLote, semanalPaginaHtml, semanalDoc, semanalHojas, nombreDelSemanal,
  cierreDeLote, cierreHtml, cierreDoc, cierreHojas, nombreDelCierre, curvaSvg, extremosDeCurva,
  reporteBroodstock, broodstockResumenHtml, broodstockPiscinaHtml, broodstockDoc, broodstockHojas, nombreDelBroodstock,
} from './operativo.reportes.js';
import { modeloOperativo, serieDiaria, diasDeTanque } from './operativo.data.js';
import { normalizarFiltro, periodoDe, kpiReproduccion } from './operativo.tablero.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { RESUMEN_TEMPS } from '../registros/lib/mad-resumen.js';
import { sumarDias } from '../registros/lib/mad-libro.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: fecha,
  Lote: lote, 'Código genético': 'CA', 'Piscina Broodstock': 'PZ1', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const SALA = (fecha, sala, extra) => ({ _SheetOrigin: O, [RESUMEN_TEMPS[0]]: 27, Fecha: fecha, Sala: sala, ...extra });
const MOV = (fecha, so, to, sd, td, machos, hembras, extra) => ({ _SheetOrigin: O, 'Agua destino': 'RAS', Fecha: fecha,
  'Sala origen': so, 'Tanque origen': to, 'Sala destino': sd, 'Tanque destino': td, Machos: machos, Hembras: hembras, ...extra });
const DES = (fecha, lote, o) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': 'CA',
  Desoves: o.desoves, 'Total de huevos': o.huevos, N2: o.n2, N5: o.n5, 'Hembras no viables': o.noViables || '' });
const TRAT = (fecha, area, productos) => ({ _SheetOrigin: O, 'Productos RAS': '', Fecha: fecha, 'Área': area, Productos: productos });

const DIA = '2026-09-19';      // el día del parte
const HOY = '2026-09-20';      // se mira desde el día siguiente: el 19 ya está cerrado

/* La planta de las pruebas, al cierre del 19/09:
   · Sala 1 — lote QA, 10♂ 10♀ en el T1 y otros tantos en el T2 desde el 15/09.
   · Sala 2 — lote QB, 5♂ 5♀ en el T4 desde el 16/09; el 18/09 pasan 1♂ 1♀ al T5, que queda ocupado.
   · La VÍSPERA (18/09) tiene de todo: 4 bajas en el T1, un movimiento, un desove de QA y un tratamiento.
   · EL DÍA (19/09): 2 machos muertos en el T1, 1 hembra descartada en el T2 y 3 hembras muertas en el T4;
     un movimiento del T1 al T2; desoves de QA y de QB; un tratamiento en RAS; y un parte del T9 de la
     Sala 3, donde el libro no tiene nada (avisa el libro). El T5 NO tiene parte: falta uno. */
const PLANTA = [
  ING('2026-09-15', 'QA', 'Sala 1', 1, 10, 10),
  ING('2026-09-15', 'QA', 'Sala 1', 2, 10, 10),
  ING('2026-09-16', 'QB', 'Sala 2', 4, 5, 5),

  MOV('2026-09-18', 'Sala 2', 4, 'Sala 2', 5, 1, 1, { Motivo: 'Selección' }),
  MOV('2026-09-19', 'Sala 1', 1, 'Sala 1', 2, 1, 0, { Motivo: 'Cópula' }),

  TQ('2026-09-18', 'Sala 1', 1, { 'Machos muertos': 4 }), TQ('2026-09-18', 'Sala 1', 2),
  TQ('2026-09-18', 'Sala 2', 4), TQ('2026-09-18', 'Sala 3', 9, { 'Hembras muertas': 1 }),

  TQ('2026-09-19', 'Sala 1', 1, { 'Machos muertos': 2, Hora: '07:00' }),
  TQ('2026-09-19', 'Sala 1', 2, { 'Hembras muertas por descarte de selección': 1 }),
  TQ('2026-09-19', 'Sala 2', 4, { 'Hembras muertas': 3 }),
  TQ('2026-09-19', 'Sala 3', 9, { 'Machos muertos': 1 }),

  SALA('2026-09-18', 'Sala 1', { Estado: 'Producción' }), SALA('2026-09-19', 'Sala 1', { Estado: 'Producción' }),
  SALA('2026-09-19', 'Sala 2', { Estado: 'Cuarentena' }),

  DES('2026-09-18', 'QA', { desoves: 1, huevos: 500, n2: 400, n5: 300 }),
  DES('2026-09-19', 'QA', { desoves: 2, huevos: 2000, n2: 1500, n5: 900 }),
  DES('2026-09-19', 'QB', { desoves: 1, huevos: 1000, n2: 700, n5: 0 }),
  /* Una fila de desove EN CERO: el lote tiene registro ese día, pero nada que contar. La tabla del papel no
     lo enseña —una fila a cero ocupa sitio y no dice nada—, y eso es lo que exige la prueba de los lotes. */
  DES('2026-09-19', 'QC', { desoves: 0, huevos: 0, n2: 0, n5: 0 }),

  TRAT('2026-09-18', 'RAS y tuberías', 'Yodo'),
  TRAT('2026-09-19', 'RAS y tuberías', 'Yodo'), TRAT('2026-09-19', 'RAS y tuberías', 'Yodo'),
  TRAT('2026-09-19', 'Cuarto raro', 'Cal'),
];

/* Una planta aparte para la prueba de escapado: el lote viene de la HOJA, que puede traer cualquier cosa.
   (Por el filtro no se puede probar: `normalizarFiltro` ya limpia lo que se teclea.) */
const PLANTA_MARCADO = [
  ING('2026-09-15', '<b>QZ', 'Sala 1', 1, 2, 2),
  DES('2026-09-19', '<b>QZ', { desoves: 1, huevos: 10, n2: 5, n5: 0 }),
];

const M = modeloOperativo(PLANTA, { hoy: HOY, fecha: DIA });
const PARTES = diasDeTanque(M.fuentes.tanques);
/* La serie del parte: desde la VÍSPERA (lo que exige el contrato) hasta el día. */
const SERIE = serieDiaria(M.fuentes, sumarDias(DIA, -1), DIA);
const SIN = normalizarFiltro({});
const F = (o) => normalizarFiltro(o);
const parte = parteDiario(M, SERIE, PARTES, SIN, { ahora: '20/09/2026 08:30' });
const fila = (B, ubic) => B.filas.find((f) => (f.sala + '·' + f.tanque) === ubic);

describe('Maduración · F7 · el parte diario es de UN DÍA', () => {
  it('el período es el día de la foto, no el del tablero', () => {
    expect(parte.periodo).toMatchObject({ clave: 'hoy', desde: DIA, hasta: DIA, dias: 1 });
    expect(parte.dia).toBe(DIA);
    expect(parte.reporte).toBe('diario');
  });

  it('🔑 lo de la VÍSPERA no entra: bajas, movimientos, desoves y tratamientos son sólo del día', () => {
    expect(parte.bajas.totales.total).toBe(7);            // 2 + 1 + 3 + 1 del 19; las 4 del 18 quedan fuera
    expect(parte.bajas.totales.natural.total).toBe(6);
    expect(parte.bajas.totales.descarte.total).toBe(1);
    expect(parte.movimientos).toHaveLength(1);
    expect(parte.movimientos[0]).toMatchObject({ fecha: DIA, motivo: 'Cópula', total: 1 });
    expect(parte.resumen.reproduccion.desoves).toBe(3);   // 2 de QA + 1 de QB; el del 18 no
    expect(parte.resumen.reproduccion.huevos).toBe(3000);
    expect(parte.tratamientos).toEqual([
      { area: 'RAS y tuberías', aplicaciones: 2, enCatalogo: true, productos: [{ producto: 'Yodo', veces: 2 }] },
      { area: 'Cuarto raro', aplicaciones: 1, enCatalogo: false, productos: [{ producto: 'Cal', veces: 1 }] },
    ]);
  });

  it('🔑 las bajas van por TANQUE: los dos tanques de la Sala 1 son dos filas', () => {
    expect(parte.bajas.dimension).toBe('tanque');
    expect(parte.bajas.filas).toHaveLength(4);
    expect(fila(parte.bajas, 'Sala 1·1')).toMatchObject({ sala: 'Sala 1', tanque: 1, total: 2 });
    expect(fila(parte.bajas, 'Sala 1·2')).toMatchObject({ sala: 'Sala 1', tanque: 2, total: 1 });
    expect(fila(parte.bajas, 'Sala 2·4')).toMatchObject({ sala: 'Sala 2', tanque: 4, total: 3 });
    expect(parte.bajas.filas[0].total).toBe(3);           // ordenadas de mayor a menor
  });

  it('🔑 las bajas REGISTRADAS y la mortalidad del libro NO tienen por qué cuadrar, y el parte enseña las dos', () => {
    /* 7 bajas registradas en los partes, pero la tasa del día cuenta 5 MUERTOS: el descarte de selección no es
       mortalidad, y el parte del T9 es de un tanque donde el libro no tiene animales (por eso lo avisa). Un parte
       que forzara las dos cifras a coincidir estaría inventando una de las dos. */
    expect(parte.bajas.totales.total).toBe(7);
    expect(parte.resumen.mortalidad.dia.muertos).toBe(5);
    expect(parte.avisos.enPeriodo).toBeGreaterThan(0);
    expect(parte.avisos.detalle.every((a) => a.fecha === DIA)).toBe(true);
  });

  it('los desoves por lote son los del día, y sólo los lotes que desovaron', () => {
    expect(parte.reproduccionPorLote.map((r) => r.lote)).toEqual(['QA', 'QB']);
    expect(parte.reproduccionPorLote.find((r) => r.lote === 'QA')).toMatchObject({ desoves: 2, huevos: 2000, n2: 1500, n5: 900 });
  });

  it('🔑 no recalcula: los totales de reproducción son los MISMOS que pinta el KPI del tablero', () => {
    const kpi = kpiReproduccion(M.fuentes.desoves, periodoDe('hoy', DIA, M.fuentes), SIN);
    expect(parte.resumen.reproduccion).toMatchObject({
      desoves: kpi.desoves, huevos: kpi.huevos, n2: kpi.n2, n5: kpi.n5, fertilidad: kpi.fertilidad,
    });
  });
});

describe('Maduración · F7 · el filtro del tablero se hereda Y se dice', () => {
  const soloS2 = parteDiario(M, SERIE, PARTES, F({ sala: 'Sala 2' }), {});

  it('las cifras son sólo las del alcance filtrado', () => {
    expect(soloS2.bajas.filas).toHaveLength(1);
    expect(soloS2.bajas.totales.total).toBe(3);
    expect(soloS2.movimientos).toHaveLength(0);           // el del día fue en la Sala 1
    expect(soloS2.resumen.vivos.total).toBeLessThan(parte.resumen.vivos.total);
  });

  it('🔑 la cabecera avisa de que es un parte FILTRADO, con qué filtro', () => {
    expect(parte.cabecera.filtrado).toBe(false);
    expect(alcanceDelParte(parte.cabecera)).toBe('Planta entera');
    expect(soloS2.cabecera.filtrado).toBe(true);
    expect(alcanceDelParte(soloS2.cabecera)).toBe('PARTE FILTRADO — Sala 2');
    expect(alcanceDelParte({ filtrado: true, etiquetas: [{ rotulo: 'Lote', valor: 'QA' }, { rotulo: 'Sexo', valor: '♀ Hembras' }] }))
      .toBe('PARTE FILTRADO — Lote QA · Sexo ♀ Hembras');
  });

  it('y el nombre del archivo distingue uno de otro', () => {
    expect(nombreDelParte(parte)).toBe('Parte_diario_2026-09-19');
    expect(nombreDelParte(soloS2)).toBe('Parte_diario_2026-09-19_filtrado');
  });
});

describe('Maduración · F7 · el contrato de la serie y el día en curso', () => {
  it('🔑 con la serie desde la víspera hay tasa del día; sin la víspera NO hay cifra', () => {
    expect(parte.resumen.mortalidad.modo).toBe('tasa');
    expect(parte.resumen.mortalidad.dia.muertos).toBe(5);
    const corta = serieDiaria(M.fuentes, DIA, DIA);
    const malo = parteDiario(M, corta, PARTES, SIN, {});
    expect(malo.resumen.mortalidad.modo).toBe('sin-serie');
    expect(malo.resumen.mortalidad.dia).toBeUndefined();
  });

  it('la cobertura cuenta un parte por tanque OCUPADO: falta el del T5', () => {
    expect(parte.cobertura.total.tanques).toMatchObject({ esperados: 4, registrados: 3 });
    expect(parte.cobertura.faltan).toEqual([{ fecha: DIA, sala: 'Sala 2', tanque: 5 }]);
    expect(parte.cobertura.enCurso).toEqual([]);
  });

  it('🔑 el parte de HOY avisa de que el día sigue en curso', () => {
    const hoyM = modeloOperativo(PLANTA, { hoy: DIA, fecha: DIA });
    const hoyP = parteDiario(hoyM, serieDiaria(hoyM.fuentes, sumarDias(DIA, -1), DIA), diasDeTanque(hoyM.fuentes.tanques), SIN, {});
    expect(hoyP.cobertura.enCurso).toEqual([DIA]);
    expect(parteDiarioHtml(hoyP)).toContain('día en curso');
    expect(parteDiarioHtml(parte)).not.toContain('día en curso');
  });
});

describe('Maduración · F7 · la página cabe en una hoja', () => {
  it('recortar deja el tope y dice cuántas quedan fuera, con el total de TODAS', () => {
    expect(recortar([1, 2, 3, 4], 2)).toEqual({ filas: [1, 2], total: 4, mas: 2 });
    expect(recortar([1, 2], 6)).toEqual({ filas: [1, 2], total: 2, mas: 0 });
    expect(recortar(null, 6)).toEqual({ filas: [], total: 0, mas: 0 });
    expect(TOPE_FILAS).toBeGreaterThan(0);
  });

  it('🔑 la tabla recortada lo DICE, con el total de filas que hay', () => {
    const corto = parteDiarioHtml(parte, { tope: 2 });
    expect(corto).toContain('+ 2 más tanques (total 4)');
    const entero = parteDiarioHtml(parte);
    expect(entero).not.toContain('más tanques (total');
    expect(entero).toContain('Sala 2 · T4');
  });

  it('la página lleva los cinco bloques y la cabecera con el día en letra', () => {
    const html = parteDiarioHtml(parte);
    for (const t of ['Bajas del día', 'Reproducción', 'Manejo', 'Registro del día', 'Avisos del libro']) expect(html).toContain(t);
    expect(html).toContain('sábado, 19/09/2026');
    expect(html).toContain('Planta entera');
  });

  it('un bloque sin nada lo dice en vez de enseñar una tabla vacía', () => {
    const vacio = parteDiario(modeloOperativo([], { hoy: HOY, fecha: DIA }), [], [], SIN, {});
    const html = parteDiarioHtml(vacio);
    expect(html).toContain('Sin bajas registradas en el día.');
    expect(html).toContain('Sin desoves registrados en el día.');
    expect(html).toContain('Sin movimientos registrados en el día.');
  });

  it('el texto escapa lo que venga de la hoja', () => {
    const Mx = modeloOperativo(PLANTA_MARCADO, { hoy: HOY, fecha: DIA });
    const html = parteDiarioHtml(parteDiario(Mx, serieDiaria(Mx.fuentes, sumarDias(DIA, -1), DIA), diasDeTanque(Mx.fuentes.tanques), SIN, {}));
    expect(html).toContain('&lt;B&gt;QZ');              // el lote se guarda en mayúsculas; lo que importa es el escapado
    expect(html).not.toContain('<B>QZ');
  });

  it('fechaLarga no se corre de día (se construye en UTC) y avisa si no hay fecha', () => {
    expect(fechaLarga('2026-09-19')).toBe('sábado, 19/09/2026');
    expect(fechaLarga('2026-01-01')).toBe('jueves, 01/01/2026');
    expect(fechaLarga('')).toBe('—');
  });
});

describe('Maduración · F7 · el documento imprimible', () => {
  it('trae su CSS de impresión, el título y el pie con firma', () => {
    const doc = parteDiarioDoc(parte);
    expect(doc).toMatch(/^<!DOCTYPE html>/);
    expect(doc).toContain('@page { size: A4 portrait');
    expect(doc).toContain('<title>Parte_diario_2026-09-19</title>');
    expect(doc).toContain('Responsable del turno');
    expect(doc).toContain('Generado el 20/09/2026 08:30');
  });

  it('🔑 el código verificador es del CONTENIDO: el sello de generación no lo cambia, un dato sí', () => {
    const cuerpo = parteDiarioHtml(parte);
    const codigo = codigoDelParte(cuerpo, parte.dia);
    expect(codigo).toMatch(/^MAD-20260919-[0-9A-F]{6}$/);
    const otroSello = parteDiario(M, SERIE, PARTES, SIN, { ahora: '21/09/2026 23:59' });
    expect(codigoDelParte(parteDiarioHtml(otroSello), otroSello.dia)).toBe(codigo);
    const otroDato = parteDiario(M, SERIE, PARTES, F({ sala: 'Sala 2' }), {});
    expect(codigoDelParte(parteDiarioHtml(otroDato), otroDato.dia)).not.toBe(codigo);
    expect(parteDiarioDoc(parte)).toContain(codigo);
  });
});

describe('Maduración · F7 · el Excel lleva UNA HOJA POR BLOQUE y TODAS las filas', () => {
  const hojas = parteDiarioHojas(parte);
  const h = (n) => hojas.find((x) => x.nombre === n).aoa;

  it('las siete hojas, en su orden', () => {
    expect(hojas.map((x) => x.nombre)).toEqual(['Resumen', 'Bajas', 'Reproducción', 'Movimientos', 'Tratamientos', 'Registro', 'Avisos']);
  });

  it('🔑 el archivo dice de qué parte es (día y alcance): suelto, tiene que explicarse solo', () => {
    expect(h('Resumen')[1]).toEqual(['Día', '2026-09-19']);
    expect(h('Resumen')[2]).toEqual(['Alcance', 'Planta entera']);
    expect(parteDiarioHojas(parteDiario(M, SERIE, PARTES, F({ sala: 'Sala 2' }), {}))[0].aoa[2])
      .toEqual(['Alcance', 'PARTE FILTRADO — Sala 2']);
  });

  it('🔑 el papel recorta pero el archivo NO: van las filas completas, con sus dos sexos', () => {
    const bajas = h('Bajas');
    expect(bajas[0]).toEqual(['Sala', 'Tanque', 'Natural ♂', 'Natural ♀', 'Descarte ♂', 'Descarte ♀', 'Total', '% del día']);
    expect(bajas).toHaveLength(5);                       // cabecera + las 4 filas
    expect(bajas.find((r) => r[0] === 'Sala 1' && r[1] === 1).slice(2, 7)).toEqual([2, 0, 0, 0, 2]);
    expect(bajas.find((r) => r[0] === 'Sala 1' && r[1] === 2).slice(2, 7)).toEqual([0, 0, 0, 1, 1]);
  });

  it('cada hoja lleva sus columnas y sus filas del día', () => {
    expect(h('Movimientos')).toHaveLength(2);
    expect(h('Movimientos')[1].slice(0, 3)).toEqual([DIA, '', 'Cópula']);
    expect(h('Reproducción').map((r) => r[0])).toEqual(['Lote', 'QA', 'QB']);
    expect(h('Tratamientos')[1]).toEqual(['RAS y tuberías', 2, 'Yodo', 2, 'sí']);
    expect(h('Tratamientos')[2]).toEqual(['Cuarto raro', 1, 'Cal', 1, 'no']);
    expect(h('Registro').find((r) => r[0] === 'Sala 2').slice(1, 4)).toEqual([2, 1, 50]);
    expect(h('Avisos')[0][0]).toBe('Fecha');
  });
});

describe('Maduración · F7 · la lista de reportes', () => {
  it('sólo se ofrece lo que existe: los cuatro del plan', () => {
    expect(REPORTES.map((r) => r.clave)).toEqual(['diario', 'semanal', 'cierre', 'broodstock']);
    expect(REPORTES[0]).toMatchObject({ etiqueta: 'Parte diario' });
    /* `lote` marca los que se imprimen de UN lote: la sub-vista tiene que pedirlo. */
    expect(REPORTES.filter((r) => r.lote).map((r) => r.clave)).toEqual(['cierre']);
  });
});

/* ── F7.2 · SEMANAL POR LOTE y CIERRE DE LOTE (2026-09-22) ─────────────────────────────────────────────────────
   Qué se exige, con el fixture montado para que la regla equivocada dé OTRO resultado:
   · el semanal cubre los SIETE días que terminan en la foto (13–19), no la semana natural ni el día suelto: el
     desove del 12 y las muertes del 12 quedan FUERA;
   · una página por lote, y entran los lotes VIVOS más los que CERRARON dentro de la semana (QZ cerró el 17: si
     sólo entraran los vivos, su última semana no se podría imprimir);
   · las bajas del lote salen del LIBRO, no de los partes: el T1 lo comparten QA y QZ, y por tanque se le
     atribuirían a cada lote las bajas del otro;
   · el cierre cubre la VIDA del lote (de su ingreso a su cierre, o a la foto si sigue abierto) y lo ROTULA;
   · la cascada del cuadre se imprime entera, en su orden, y dice si cuadra;
   · un documento de varias páginas da a cada una su propio código verificador y su «Página i de N».
   Datos FICTICIOS. */
const CIERRE = (fecha, lote, machos, hembras, extra) => ({ _SheetOrigin: O, 'Metabisulfito (kg)': '', Fecha: fecha,
  Lote: lote, Machos: machos, Hembras: hembras, ...extra });

const PLANTA_L = [
  ING('2026-09-10', 'QA', 'Sala 1', 1, 20, 20),
  ING('2026-09-10', 'QZ', 'Sala 1', 1, 10, 10),     // comparte el T1 con QA
  ING('2026-09-16', 'QB', 'Sala 2', 4, 5, 5),
  TQ('2026-09-12', 'Sala 1', 1, { 'Machos muertos': 2 }),        // ANTES de la semana
  TQ('2026-09-17', 'Sala 1', 1, { 'Machos muertos': 3, 'Hembras muertas por descarte de selección': 1 }),
  TQ('2026-09-18', 'Sala 2', 4, { 'Hembras muertas': 1 }),
  /* ⚠ Sólo cierra el lote un Fin de Ciclo con `Tipo: 'Total'` (el Parcial descuenta de su sala y no lo cierra);
     salen 9♂ 9♀ de los 10+10, y el libro anota la diferencia de 1+1 que no salió. */
  CIERRE('2026-09-17', 'QZ', 9, 9, { Tipo: 'Total', Motivo: 'Fin de ciclo' }),   // QZ se cierra DENTRO de la semana
  DES('2026-09-12', 'QA', { desoves: 1, huevos: 900, n2: 700, n5: 400 }),   // fuera de la semana
  DES('2026-09-18', 'QA', { desoves: 2, huevos: 2000, n2: 1600, n5: 1000 }),
];
const ML = modeloOperativo(PLANTA_L, { hoy: HOY, fecha: DIA });
const P7 = periodoDe('7d', DIA, ML.fuentes);
const SERIE7 = serieDiaria(ML.fuentes, sumarDias(P7.desde, -1), P7.hasta);
const PARTES_L = diasDeTanque(ML.fuentes.tanques);
const semanal = semanalPorLote(ML, SERIE7, PARTES_L, SIN, { ahora: '20/09/2026 08:30' });
const pag = (lote) => semanal.paginas.find((p) => p.lote === lote);

describe('Maduración · F7.2 · el semanal por lote', () => {
  it('🔑 cubre los SIETE días que terminan en la foto', () => {
    expect(semanal.periodo).toMatchObject({ clave: '7d', desde: '2026-09-13', hasta: DIA, dias: 7 });
    expect(semanal.cabecera.diaLargo).toBe('13/09 – 19/09/2026');
  });

  it('🔑 una página por lote: los vivos MÁS los que cerraron dentro de la semana', () => {
    expect(semanal.paginas.map((p) => p.lote)).toEqual(['QA', 'QB', 'QZ']);
    expect(pag('QZ')).toMatchObject({ cerrado: '2026-09-17' });
    expect(pag('QZ').vivos.total).toBe(0);      // un cierre Total deja el lote a cero y anota la diferencia
  });

  it('🔑 las bajas del lote salen del LIBRO, no del tanque compartido', () => {
    const qa = pag('QA');
    expect(qa.bajas.clave).toBe('QA');
    expect(qa.bajasTotales.total).toBe(qa.bajas.natural.total + qa.bajas.descarte.total);
    expect(pag('QB').bajasTotales.total).toBe(1);       // la única baja de la Sala 2
  });

  it('lo de ANTES de la semana no entra: ni el desove del 12 ni las muertes del 12', () => {
    expect(pag('QA').reproduccion).toMatchObject({ desoves: 2, huevos: 2000, n5: 1000 });
    expect(pag('QA').curva).toHaveLength(7);
    expect(pag('QA').curva[0].fecha).toBe('2026-09-13');
  });

  it('el lote que ingresó DENTRO de la semana empieza su curva en cero', () => {
    const qb = pag('QB');
    expect(qb.curva[0].total).toBe(0);
    expect(qb.curva[qb.curva.length - 1].total).toBe(9);   // 10 menos la baja del 18
    expect(qb.eventos.some((e) => e.tipo === 'ingreso')).toBe(true);
  });

  it('la página se maqueta con sus bloques y la curva en SVG', () => {
    const html = semanalPaginaHtml(pag('QA'));
    expect(html).toContain('Maduración · Semanal por lote');
    /* 🔑 La página dice de qué SEMANA es: una hoja suelta, sin la pantalla al lado, tiene que poder fecharse. */
    expect(html).toContain('Lote QA · 13/09 – 19/09/2026');
    for (const t of ['📈 Vivos, día a día', '💀 Bajas de la semana', '🗓 Eventos del lote', '🥚 Reproducción']) expect(html).toContain(t);
    expect(html).toContain('<svg class="rp-curva"');
    expect(html).toContain('Los movimientos no dicen el lote');
  });

  it('🔑 el documento lleva UNA PÁGINA POR LOTE, cada una con su código y su «Página i de N»', () => {
    const doc = semanalDoc(semanal);
    expect(doc.match(/class="rp-page"/g)).toHaveLength(3);
    expect(doc).toContain('Página 1 de 3');
    expect(doc).toContain('Página 3 de 3');
    const codigos = [...doc.matchAll(/MAD-\d{8}-([0-9A-F]{6})/g)].map((m) => m[1]);
    expect(new Set(codigos).size).toBe(3);               // tres lotes, tres códigos distintos
    expect(nombreDelSemanal(semanal)).toBe('Semanal_2026-09-13_a_2026-09-19');
  });

  it('el Excel del semanal lleva la columna Lote en todas sus hojas', () => {
    const hojas = semanalHojas(semanal);
    expect(hojas.map((h) => h.nombre)).toEqual(['Resumen', 'Curva', 'Bajas', 'Eventos']);
    expect(hojas[0].aoa[5][0]).toBe('Lote');
    expect(hojas[0].aoa).toHaveLength(9);                // 5 de contexto + cabecera + 3 lotes
    expect(hojas[1].aoa[0]).toEqual(['Lote', 'Fecha', 'Machos', 'Hembras', 'Total']);
    expect(hojas[1].aoa).toHaveLength(1 + 3 * 7);        // tres lotes × siete días
    // QB: la única baja de la semana es UNA HEMBRA por muerte natural (Sala 2, el 18).
    expect(hojas[2].aoa.find((r) => r[0] === 'QB').slice(1, 7)).toEqual([0, 1, 0, 0, 0, 1]);
  });
});

describe('Maduración · F7.2 · el cierre de lote', () => {
  const SERIE_VIDA = serieDiaria(ML.fuentes, '2026-09-09', DIA);
  const cerrado = cierreDeLote(ML, SERIE_VIDA, 'QZ', { ahora: '20/09/2026 08:30' });
  const abierto = cierreDeLote(ML, SERIE_VIDA, 'QA', {});

  it('🔑 cubre la VIDA del lote: del ingreso al cierre, o a la foto si sigue abierto', () => {
    expect(cerrado.periodo).toMatchObject({ desde: '2026-09-10', hasta: '2026-09-17' });
    expect(cerrado.abierto).toBe(false);
    expect(abierto.periodo).toMatchObject({ desde: '2026-09-10', hasta: DIA });
    expect(abierto.abierto).toBe(true);
  });

  it('🔑 el que sigue abierto lo DICE en la página', () => {
    expect(cierreHtml(abierto)).toContain('EN CURSO — el lote sigue abierto');
    expect(cierreHtml(cerrado)).not.toContain('EN CURSO');
    expect(cierreHtml(cerrado)).toContain('Maduración · Cierre de lote');
  });

  it('la cascada del cuadre se imprime entera, en su orden, y dice si cuadra', () => {
    expect(cerrado.ficha.cuadre.filas.map((f) => f.id)).toEqual(['ingresados', 'muertos', 'descartes', 'salidas', 'diferencia', 'vivos']);
    const html = cierreHtml(cerrado);
    expect(html).toContain('⚖ Cascada del cuadre');
    expect(html).toContain('− Salidas (Fin de Ciclo)');
    /* 🔑 La última fila es la que cierra la cuenta: sin «= Vivos» la cascada no demuestra nada. */
    expect(html).toContain('= Vivos');
    expect(html).toContain(cerrado.ficha.cuadre.cuadra ? 'La cascada <b>cuadra</b>' : 'No cuadra por');
    expect(html).toContain('De los muertos: en desove');
  });

  it('un lote que el libro no conoce devuelve null en vez de una página vacía', () => {
    expect(cierreDeLote(ML, SERIE7, 'NO-EXISTE', {})).toBeNull();
  });

  it('el documento y el Excel del cierre', () => {
    const doc = cierreDoc(cerrado);
    expect(doc.match(/class="rp-page"/g)).toHaveLength(1);
    expect(doc).toContain('Página 1 de 1');
    expect(doc).toContain('<title>Cierre_lote_QZ_2026-09-19</title>');
    expect(nombreDelCierre(cerrado)).toBe('Cierre_lote_QZ_2026-09-19');
    const hojas = cierreHojas(cerrado);
    expect(hojas.map((h) => h.nombre)).toEqual(['Resumen', 'Cascada', 'Origen', 'Curva', 'Eventos', 'Reproducción']);
    expect(hojas[1].aoa[1].slice(0, 2)).toEqual(['Ingresados', '+']);
    expect(hojas[3].aoa).toHaveLength(1 + 8);            // del 10 al 17, ambos incluidos
    expect(hojas[2].aoa.find((r) => r[1] === 'Sala 1')).toBeTruthy();
  });
});

describe('Maduración · F7.2 · la curva en el papel', () => {
  it('dibuja un SVG con un punto por día y su recorrido', () => {
    const svg = curvaSvg([{ total: 10 }, { total: 20 }, { total: 15 }]);
    expect(svg).toContain('<svg class="rp-curva"');
    expect(svg.match(/[ML]\d+\.\d,\d+\.\d/g)).toHaveLength(3);
  });

  it('con menos de dos puntos no dibuja nada y lo dice', () => {
    expect(curvaSvg([{ total: 3 }])).toContain('no llega a dos días');
    expect(curvaSvg([])).toContain('no llega a dos días');
  });

  it('🔑 una curva PLANA se dibuja a media altura, no pegada al suelo', () => {
    /* Escalándola como si el mínimo fuera el suelo, una semana sin cambios parecía el punto más bajo del lote. */
    const svg = curvaSvg([{ total: 5 }, { total: 5 }, { total: 5 }], { w: 100, h: 40 });
    const ys = [...svg.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys).toEqual([20, 20, 20]);
    expect(curvaSvg([{ total: 5 }, { total: 5 }])).toContain('<path');
  });

  it('una curva con relieve usa todo el alto', () => {
    const ys = [...curvaSvg([{ total: 0 }, { total: 10 }], { w: 100, h: 40 }).matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys[0]).toBeGreaterThan(ys[1]);      // el 0 abajo, el 10 arriba (el eje y crece hacia abajo)
    expect(ys[0] - ys[1]).toBeGreaterThan(20);
  });

  it('los extremos dicen inicio, fin, variación y máximo', () => {
    expect(extremosDeCurva([{ total: 10 }, { total: 30 }, { total: 25 }])).toEqual({ inicio: 10, fin: 25, delta: 15, max: 30 });
    expect(extremosDeCurva([])).toEqual({ inicio: '', fin: '', delta: '', max: '' });
  });
});

/* ── F7.3 · BROODSTOCK (2026-09-22) ────────────────────────────────────────────────────────────────────────────
   Qué se exige, con el fixture montado para que la regla equivocada dé OTRO resultado:
   · el resumen es el ÚLTIMO corte (el del 20), no la suma de todos ni el del filtro;
   · una página por piscina, en el orden de la tabla, y sólo de las del último corte: la 559 estuvo en el corte
     anterior y ya no está, así que sale como AVISO, no como página;
   · la piscina que el Ingreso nombra y Broodstock nunca ha tenido (561) sale como el otro aviso;
   · la serie de cada piscina cubre el PERÍODO del tablero, no toda su historia;
   · una sobrevivencia que no puede ser un porcentaje (0,88) se enseña COMO VINO y marcada;
   · el Excel lleva las series y los lotes COMPLETOS, con la columna Piscina.
   Datos FICTICIOS. */
/* ⚠ La hoja de Broodstock NO se fecha con «Fecha», sino con «Fecha de corte» (`COLUMNA_FECHA` de operativo.data):
   con la columna equivocada, la carga existe pero ningún corte es legible y el reporte sale vacío. */
const BS = (corte, piscina, o) => ({ _SheetOrigin: O, 'Pl/g': o.plg === undefined ? 12 : o.plg, 'Fecha de corte': corte,
  Piscina: piscina, 'Fase actual': o.fase || 'Engorde', 'Peso actual (g)': o.peso, 'Incremento última semana (g)': o.inc,
  'Crecimiento fase actual (g/sem)': o.crec, 'Sobrevivencia estimada (%)': o.sobrev, 'Densidad (cam/m²)': o.dens,
  'Edad total (días)': o.edad, 'Área (ha)': 5, 'Cantidad sembrada': 100000, 'Código genético': 'CA',
  Camaronera: 'CX', Observación: o.obs || '' });

const PLANTA_B = [
  ING('2026-09-10', 'QA', 'Sala 1', 1, 20, 20),
  ING('2026-09-16', 'QB', 'Sala 2', 4, 5, 5),
  /* El Ingreso nombra tres piscinas: 555 y 557 tienen carga; la 561, nunca. */
  { _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: '2026-09-10', Lote: 'QA', 'Código genético': 'CA',
    'Piscina Broodstock': '555', Sala: 'Sala 1', Tanque: 1, Machos: 20, Hembras: 20 },
  { _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: '2026-09-16', Lote: 'QB', 'Código genético': 'CA',
    'Piscina Broodstock': '561', Sala: 'Sala 2', Tanque: 4, Machos: 5, Hembras: 5 },
  /* Un corte SIN peso: se registró sin pesar. Está en la serie, pero no puede ser un punto de la curva. */
  BS('2026-09-06', '555', { peso: '', inc: '', crec: '', sobrev: 90, dens: 7, edad: 200 }),   // FUERA del período de 7 d
  BS('2026-09-13', '555', { peso: 10, inc: 0.5, crec: 0.5, sobrev: 91, dens: 7, edad: 207 }),
  BS('2026-09-13', '557', { peso: 11, inc: 0.6, crec: 0.6, sobrev: 89, dens: 6.8, edad: 210 }),
  BS('2026-09-13', '559', { peso: 8, inc: 0.3, crec: 0.4, sobrev: 85, dens: 7.2, edad: 190 }),  // desaparece en el corte del 18
  BS('2026-09-18', '555', { peso: 11.8, inc: 0.8, crec: 0.55, sobrev: 92, dens: 7.1, edad: 214, obs: 'Recambio de agua' }),
  BS('2026-09-18', '557', { peso: 12.4, inc: 0.7, crec: 0.61, sobrev: 0.88, dens: 6.8, edad: 217 }),   // sobrevivencia DUDOSA
];
const MB = modeloOperativo(PLANTA_B, { hoy: HOY, fecha: DIA });
const PB = periodoDe('30d', DIA, MB.fuentes);
const bs = reporteBroodstock(MB, SIN, PB, { ahora: '20/09/2026 08:30' });
const pis = (p) => bs.piscinas.find((x) => x.piscina === p);
const ficha = (p) => bs.fichas.find((x) => x.piscina === p);

describe('Maduración · F7.3 · el reporte de Broodstock', () => {
  it('🔑 el resumen es el ÚLTIMO corte, con sus piscinas', () => {
    expect(bs.corte).toBe('2026-09-18');
    expect(bs.previo).toBe('2026-09-13');
    expect(bs.cortes).toBe(3);
    expect(bs.piscinas.map((p) => p.piscina)).toEqual(['555', '557']);
    expect(pis('555')).toMatchObject({ peso: 11.8, incremento: 0.8, fase: 'Engorde' });
  });

  it('🔑 los dos avisos: la piscina que ya no carga y la que el Ingreso nombra sin Broodstock', () => {
    expect(bs.ausentes).toEqual(['559']);
    /* PZ1 sale también: el ayudante ING la pone en todas sus filas y Broodstock nunca la nombra. */
    expect(bs.sinBroodstock).toEqual(['561', 'PZ1']);
    const html = broodstockResumenHtml(bs);
    expect(html).toContain('Sin carga en este corte');
    expect(html).toContain('559');
    expect(html).toContain('NUNCA aparecen en Broodstock');
    expect(html).toContain('561');
  });

  it('🔑 una página por piscina del último corte: la 559 es un aviso, no una página', () => {
    expect(bs.fichas.map((f) => f.piscina)).toEqual(['555', '557']);
    const doc = broodstockDoc(bs);
    expect(doc.match(/class="rp-page"/g)).toHaveLength(3);      // resumen + dos piscinas
    expect(doc).toContain('Página 1 de 3');
    expect(doc).toContain('piscina 555');
    expect(doc).toContain('piscina 557');
    expect(doc).not.toContain('piscina 559');
  });

  it('🔑 la serie de cada piscina cubre el PERÍODO del tablero, no toda su historia', () => {
    expect(PB.desde).toBe('2026-08-21');
    expect(ficha('555').serie.map((s) => s.corte)).toEqual(['2026-09-06', '2026-09-13', '2026-09-18']);
    const corto = reporteBroodstock(MB, SIN, periodoDe('7d', DIA, MB.fuentes), {});
    expect(corto.fichas.find((f) => f.piscina === '555').serie.map((s) => s.corte)).toEqual(['2026-09-13', '2026-09-18']);
    expect(corto.cabecera.diaLargo).toContain('13/09 – 19/09/2026');
  });

  it('🔑 una sobrevivencia que no puede ser un porcentaje se enseña como vino y MARCADA', () => {
    expect(pis('557')).toMatchObject({ sobrevivencia: 0.88, sobrevivenciaDudosa: 'fraccion' });
    const html = broodstockResumenHtml(bs);
    expect(html).toContain('⚠ 0,9 %');            // como vino (redondeada a una cifra), no convertida a 88 %
    expect(broodstockPiscinaHtml(ficha('557'), bs)).toContain('no puede ser un porcentaje');
  });

  it('la página de una piscina lleva sus KPI, su curva, sus cortes, sus lotes y sus observaciones', () => {
    const html = broodstockPiscinaHtml(ficha('555'), bs);
    expect(html).toContain('Maduración · Broodstock · piscina 555');
    expect(html).toContain('último corte 18/09/2026');
    expect(html).toContain('<svg class="rp-curva"');
    for (const t of ['📈 Peso por corte', '🗓 Cortes del período', '🧬 Lotes que salieron de esta piscina', '📝 Observaciones']) expect(html).toContain(t);
    expect(html).toContain('Recambio de agua');
    expect(html).toContain('QA');                 // el lote que entró de esta piscina
    /* 🔑 El corte del 06 se registró SIN peso: está en la tabla de cortes, pero NO es un punto de la curva.
       Contarlo como cero hundiría la curva por un dato que no existe. */
    expect(ficha('555').serie).toHaveLength(3);
    expect(html.match(/[ML][\d.]+,[\d.]+/g)).toHaveLength(2);
    expect(html).toContain('13/09 <b>10</b> → 18/09 <b>11,8</b>');   // empieza en el primer corte CON peso
  });

  it('una piscina sin lotes del Ingreso lo dice en vez de enseñar una tabla vacía', () => {
    expect(broodstockPiscinaHtml(ficha('557'), bs)).toContain('Ningún lote del Ingreso nombra a esta piscina.');
  });

  it('sin ninguna carga de Broodstock, el reporte lo dice y no revienta', () => {
    const vacio = reporteBroodstock(modeloOperativo([], { hoy: HOY, fecha: DIA }), SIN, PB, {});
    expect(vacio.piscinas).toEqual([]);
    expect(vacio.fichas).toEqual([]);
    expect(broodstockResumenHtml(vacio)).toContain('No hay ninguna carga de Broodstock');
    expect(broodstockDoc(vacio).match(/class="rp-page"/g)).toHaveLength(1);
    expect(nombreDelBroodstock(vacio)).toBe('Broodstock_2026-09-19');
  });

  it('el Excel del Broodstock: cinco hojas, con la columna Piscina en todas', () => {
    const hojas = broodstockHojas(bs);
    expect(hojas.map((h) => h.nombre)).toEqual(['Resumen', 'Series', 'Lotes', 'Observaciones', 'Avisos']);
    expect(hojas[0].aoa[6][0]).toBe('Piscina');
    expect(hojas[0].aoa).toHaveLength(9);                       // 6 de contexto + cabecera + 2 piscinas
    expect(hojas[1].aoa).toHaveLength(1 + 3 + 2);               // 555 con tres cortes, 557 con dos
    expect(hojas[1].aoa[1].slice(0, 4)).toEqual(['555', '2026-09-06', 'Engorde', null]);
    expect(hojas[2].aoa.find((r) => r[1] === 'QA').slice(0, 3)).toEqual(['555', 'QA', 'Cuarentena']);
    expect(hojas[3].aoa[1]).toEqual(['555', '2026-09-18', 'Recambio de agua']);
    expect(hojas[4].aoa.map((r) => r[1])).toEqual(['Piscina', '559', '561', 'PZ1']);
    expect(nombreDelBroodstock(bs)).toBe('Broodstock_2026-09-18');
  });
});
