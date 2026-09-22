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
  it('sólo se ofrece lo que existe: F7.1 trae el diario', () => {
    expect(REPORTES.map((r) => r.clave)).toEqual(['diario']);
    expect(REPORTES[0]).toMatchObject({ etiqueta: 'Parte diario' });
  });
});
