/* ============================================================
   MADURACIÓN · OPERATIVO · lo del laboratorio en el tablero (0f · 8, 2026-09-26, usuario)

   Los dos modales —🦠 Micro y agua, 🧬 Biomol · reproductores— siguen los filtros del tablero en lo que cada hoja
   registra, y dicen el que no pueden aplicar. Aquí se vigilan sus cuentas con filas FICTICIAS con las cabeceras reales
   de las hojas: el nivel de cada medición sale de la regla de la vista de Microbiología (umbrales por área; o el Nivel
   de la hoja, sin UFC), el rango de calidad de agua de la suya, y el resultado de Biomol de `normalizeRows`.
   ============================================================ */
import { describe, it, expect, vi } from 'vitest';
/* 0r·3a · espías que dejan pasar: se CUENTA cuántas veces se funden las mediciones de una muestra (lo caro). */
vi.mock('../microbiologia/data.js', async (original) => { const real = await original(); return { ...real, meltRow: vi.fn(real.meltRow) }; });
vi.mock('../microbiologia/calagua.data.js', async (original) => { const real = await original(); return { ...real, calMeasured: vi.fn(real.calMeasured) }; });
import { meltRow } from '../microbiologia/data.js';
import { calMeasured } from '../microbiologia/calagua.data.js';
import { resumenMicro, resumenBiomol, tipoDeDespacho, filtroDelTablero, esReproductor, BIOMOL_PATOGENOS } from './operativo.laboratorio.js';
import { nombrePiscina, piscinasDeLotes, filtroDeLaVentana, resumenMicroDeLaVentana, serieDePatogeno, umbralDe, opcionesDeLaVentana } from './operativo.laboratorio.js';   // 0q·5
import { formatosDelAgua, patogenosDeMedidas, umbralDelFormato } from './operativo.laboratorio.js';   // 0q·5b
import { parametrosDeMedidas, serieDeParametro, rangoDe } from './operativo.laboratorio.js';   // 0q·5c
import { loteBiomol, piscinasBiomol, resumenBiomolDeLaVentana, tendenciaDePatogeno, opcionesBiomol } from './operativo.laboratorio.js';   // 0q·6
import { prepararMicro } from './operativo.laboratorio.js';   // 0r·3d
import { normalizarFiltro } from './operativo.tablero.js';
import { CAL_RANGE_BASE } from '../microbiologia/calagua.data.js';
import { normalizeRows } from '../biomolecular/index.js';

const P = { desde: '2026-08-21', hasta: '2026-09-19' };
const F = (o = {}) => normalizarFiltro(o);
const MIC = (fecha, formato, extra = {}) => ({ _SheetOrigin: 'Microbiología', 'Fecha muestreo': fecha, Departamento: 'Maduración', Formato: formato, ...extra });
const PRI = 'Maduración · Principal';
const DES = 'Maduración · Despacho';
/* En «Maduración · Principal» (área mad-reprod), C. Totales es Moderado desde 10 000 UFC y Hongos desde 200; en
   Despacho (mad-despacho), C. Totales es Moderado desde 500 y Elevado desde 1 000. */
const FILAS_MIC = [
  MIC('15/09/2026', PRI, { 'Tipo de muestra': 'Hepatopáncreas', 'Módulo/Sala': 'Sala 2', 'TQ/N°': '17', Sexo: 'Hembras', Lote: 'QA', 'V.Totales UFC': '20000', 'V.Verdes UFC': '100' }),
  MIC('16/09/2026', PRI, { 'Tipo de muestra': 'Hepatopáncreas', 'Módulo/Sala': 'Sala 2', 'TQ/N°': '18', Sexo: 'Machos', 'V.Totales UFC': '500' }),
  MIC('17/09/2026', PRI, { 'Tipo de muestra': 'Hepatopáncreas', 'Módulo/Sala': 'Sala 3', 'TQ/N°': '22', Sexo: 'Hembras', 'Hongos UFC': '300' }),
  MIC('18/09/2026', PRI, { 'Tipo de muestra': 'Hepatopáncreas', Sexo: 'Hembras', 'V.Totales UFC': '500' }),                  // no dice su sala
  MIC('14/09/2026', PRI, { 'Tipo de muestra': 'Hepatopáncreas', 'TQ/N°': 'Piscina 556', Sexo: 'Hembras', 'V.Totales UFC': '500' }), // en su piscina de origen
  MIC('01/07/2026', PRI, { 'Tipo de muestra': 'Hepatopáncreas', 'Módulo/Sala': 'Sala 2', Sexo: 'Hembras', 'V.Totales UFC': '200000' }), // fuera del período
  MIC('10/09/2026', DES, { 'Tipo de muestra': 'Huevo antes desinfección', 'V.Totales UFC': '600' }),
  MIC('10/09/2026', DES, { 'Tipo de muestra': 'Huevo después de desinfección', 'V.Totales UFC': '50' }),
  MIC('11/09/2026', DES, { 'Tipo de muestra': 'Agua del nauplio 2 antes de desinfección', 'V.Totales UFC': '1200' }),
  MIC('12/09/2026', DES, { 'Tipo de muestra': 'Nauplio 5 después de desinfección', 'V.Totales UFC': '40' }),
  MIC('12/09/2026', DES, { 'Tipo de muestra': 'Algo sin nombre', 'V.Totales UFC': '40' }),
  MIC('13/09/2026', 'Maduración · RAS', { Componente: 'Salida UV', 'V.Totales Nivel': 'Elevado' }),
  MIC('14/09/2026', 'Maduración · Agua', { 'V.Totales Nivel': 'Mínimo' }),
  { ...MIC('15/09/2026', 'Larvicultura · Muestra', { 'V.Totales UFC': '99999' }), Departamento: 'Larvicultura' },    // otro departamento
];
const CAL = (fecha, extra) => ({ _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': fecha, Departamento: 'Maduración', ...extra });
const FILAS_CAL = [
  CAL('10/09/2026', { Formato: 'Maduración · RAS', Componente: 'Colector', pH: '9', Alcalinidad: '130', 'S‰': '32' }),     // pH fuera; la salinidad no tiene rango: no cuenta
  CAL('12/09/2026', { Formato: 'Maduración · RAS', Componente: 'Colector', pH: '8', Alcalinidad: '130' }),
  CAL('14/09/2026', { Formato: 'Maduración · Agua', Sala: 'Sala 2', pH: '7', Alcalinidad: '100' }),                              // dos fuera
  { ...CAL('14/09/2026', { Formato: 'Larvicultura', pH: '9' }), Departamento: 'Larvicultura' },
];
const FILAS = [...FILAS_MIC, ...FILAS_CAL];
const micro = (f) => resumenMicro(FILAS, P, F(f), CAL_RANGE_BASE);

describe('Maduración · laboratorio · el filtro del tablero', () => {
  it('lo que la hoja no registra se dice, y no se aplica', () => {
    const f = filtroDelTablero(F({ lote: 'QA', codigo: 'CA', sala: 'Sala 1' }), P, ['sala', 'tanque']);
    expect(f.ignora).toEqual(['lote', 'código genético']);
  });
  it('🔴 el tanque de Biomol viene «Tq 5»; el sexo, en singular o plural', () => {
    const f = filtroDelTablero(F({ sala: 'Sala 1', tanque: '5', sexo: 'hembras' }), P, ['sala', 'tanque', 'sexo']);
    expect(f.pasa({ fecha: '2026-09-01', sala: 'Sala 1', tanque: 'Tq 5', sexo: 'Hembra' })).toBe(true);
    expect(f.pasa({ fecha: '2026-09-01', sala: 'Sala 1', tanque: 'Tq 15', sexo: 'Hembra' })).toBe(false);
    expect(f.pasa({ fecha: '2026-09-01', sala: 'Sala 1', tanque: '5', sexo: 'Macho' })).toBe(false);
    expect(f.pasa({ fecha: '2026-09-20', sala: 'Sala 1', tanque: '5', sexo: 'Hembras' }), 'fuera del período').toBe(false);
  });
});

describe('Maduración · laboratorio · 🦠 ① reproductores (hepatopáncreas)', () => {
  it('🔴 sin filtro: las del período, en alerta por su PEOR nivel, y por patógeno la tasa de alerta', () => {
    const r = micro().reproductores;
    expect([r.muestras, r.alerta]).toEqual([5, 2]);
    expect(r.porPatogeno.map((p) => [p.etiqueta, p.analizadas, p.alerta])).toEqual([['Hongos', 1, 1], ['C. Totales', 4, 1], ['C. Verdes', 1, 0]]);
    expect(r.porPatogeno[1].niveles).toEqual({ 'Mínimo': 3, Leve: 0, Moderado: 1, Elevado: 0 });
    expect(r.porSala.map((s) => [s.clave, s.muestras, s.alerta, s.fueraDeSalas]), 'las salas; lo de fuera de ellas, aparte; lo que no dice dónde, al final')
      .toEqual([['Sala 2', 2, 1, false], ['Sala 3', 1, 1, false], ['Piscina 556', 1, 0, true], ['(sin dato)', 1, 0, false]]);
    expect(r.porSexo.map((s) => [s.clave, s.muestras, s.alerta])).toEqual([['Hembras', 4, 2], ['Machos', 1, 0]]);
    expect(r.ultimas.map((u) => u.fecha)).toEqual(['2026-09-18', '2026-09-17', '2026-09-16', '2026-09-15', '2026-09-14']);
    expect(r.ultimas[3]).toMatchObject({ lugar: 'Sala 2', tanque: '17', peor: 'Moderado', enAlerta: ['C. Totales'] });
    expect(r.ultimas[4], '«Piscina 556» es un lugar, no un tanque').toMatchObject({ lugar: 'Piscina 556', tanque: '' });
  });
  it('🔴 con sala: sólo las de esa sala; la que no dice su sala queda fuera y se cuenta', () => {
    const r = micro({ sala: 'Sala 2' }).reproductores;
    expect(r.muestras).toBe(2);
    expect(r.sinDato).toEqual({ sala: 2 });
    expect(r.ignora).toEqual([]);
  });
  it('🔴 con sala y tanque, con sexo y con lote', () => {
    expect(micro({ sala: 'Sala 2', tanque: '18' }).reproductores.ultimas.map((u) => u.fecha)).toEqual(['2026-09-16']);
    expect(micro({ sexo: 'machos' }).reproductores.muestras).toBe(1);
    const l = micro({ lote: 'QA' }).reproductores;
    expect([l.muestras, l.sinDato.lote]).toEqual([1, 4]);
  });
});

describe('Maduración · laboratorio · 🦠 ② desinfección de huevo y nauplio', () => {
  it('lee la etapa, la matriz y el momento del «Tipo de muestra»', () => {
    expect(tipoDeDespacho('Agua del nauplio 2 antes de desinfección')).toEqual({ etapa: 'Nauplio 2', matriz: 'Agua', momento: 'antes' });
    expect(tipoDeDespacho('Huevo después de desinfección')).toEqual({ etapa: 'Huevo', matriz: 'Animal', momento: 'despues' });
    expect(tipoDeDespacho('Nauplio 5 despues de desinfeccion')).toEqual({ etapa: 'Nauplio 5', matriz: 'Animal', momento: 'despues' });
    expect(tipoDeDespacho('')).toEqual({ etapa: '', matriz: '', momento: '' });
  });
  it('🔴 antes frente a después, por etapa y matriz; lo que no se reconoce, aparte', () => {
    const d = micro().desinfeccion;
    expect([d.muestras, d.sinTipo]).toEqual([5, 1]);
    expect(d.filas).toEqual([
      { etapa: 'Huevo', matriz: 'Animal', antes: { muestras: 1, alerta: 1 }, despues: { muestras: 1, alerta: 0 } },
      { etapa: 'Nauplio 2', matriz: 'Agua', antes: { muestras: 1, alerta: 1 }, despues: { muestras: 0, alerta: 0 } },
      { etapa: 'Nauplio 5', matriz: 'Animal', antes: { muestras: 0, alerta: 0 }, despues: { muestras: 1, alerta: 0 } },
    ]);
  });
  it('🔴 el despacho no tiene sala ni sexo: esos filtros no se le aplican (y se dice)', () => {
    const d = micro({ sala: 'Sala 2', sexo: 'hembras' }).desinfeccion;
    expect([d.muestras, d.ignora]).toEqual([5, ['sala', 'sexo']]);
  });
});

describe('Maduración · laboratorio · 🦠 ③ agua y RAS', () => {
  it('🔴 la micro de los demás formatos, por formato y componente; nada de otro departamento', () => {
    const a = micro().agua;
    expect(a.micro.map((g) => [g.clave, g.muestras, g.alerta])).toEqual([['Maduración · Agua', 1, 0], ['Maduración · RAS · Salida UV', 1, 1]]);
  });
  it('🔴 calidad de agua por componente (o sala): muestras, parámetros fuera de rango y el índice', () => {
    const c = micro().agua.calidad;
    expect(c.muestras).toBe(3);
    const col = c.porGrupo.find((g) => g.grupo === 'Colector');
    expect(col).toMatchObject({ muestras: 2, fuera: 1, ultima: '2026-09-12', peores: [{ label: 'pH', n: 1 }] });
    expect(col.wqi > 50 && col.wqi < 100, 'una muestra en rango (100) y otra con el pH fuera').toBe(true);
    expect(c.porGrupo.find((g) => g.grupo === 'Sala 2')).toMatchObject({ muestras: 1, fuera: 2 });
  });
  it('🔴 con sala: la calidad de agua SÍ la registra (en algunas muestras); la micro del agua no', () => {
    const a = micro({ sala: 'Sala 2' }).agua;
    expect([a.calidad.muestras, a.calidad.sinDato.sala, a.calidad.ignora]).toEqual([1, 2, []]);
    expect([a.micro.length, a.ignora]).toEqual([2, ['sala']]);
  });
});

/* ── Biomol ── */
const BIO = (fecha, lugar, extra = {}) => ({ Fecha: fecha, Lugar: lugar, 'Estadío': 'Reproductores', Piscina: 'P557', Sexo: 'Hembra', Tanque: 'Tq 22', ...extra });
const FILAS_BIO = normalizeRows([
  BIO('01/09/2026', 'Sala 3', { IHHNV: 'Positivo', WSSV: 'Negativo' }),
  BIO('02/09/2026', 'Sala 3', { IHHNV: 'Negativo', WSSV: 'Negativo', Sexo: 'Macho', Tanque: 'Tq 23' }),
  BIO('09/09/2026', 'Sala 1', { IHHNV: 'Negativo', Piscina: 'P553', Tanque: 'Tq 1' }),
  BIO('10/09/2026', 'Chongón', { IHHNV: 'Positivo', EHP: 'Positivo', Tanque: '' }),
  BIO('11/09/2026', 'Maduración', { 'Estadío': '', IHHNV: 'Negativo', Tanque: '' }),
  BIO('11/09/2026', 'Módulo 1', { 'Estadío': 'PL10', IHHNV: 'Positivo' }),                                             // larva: no es reproductor
  BIO('01/08/2026', 'Sala 3', { IHHNV: 'Positivo' }),                                                                  // fuera del período
]);

describe('Maduración · laboratorio · 🧬 Biomol · reproductores', () => {
  it('reproductor: por su estadío, o sin estadío si su lugar es Maduración', () => {
    expect(FILAS_BIO.filter(esReproductor).length).toBe(6);
  });
  it('🔴 sin filtro: positivos ÷ analizados por patógeno; por sala, las salas primero y lo de fuera aparte', () => {
    const b = resumenBiomol(FILAS_BIO, P, F());
    expect(b.muestras).toBe(5);
    expect(b.total.IHHNV).toEqual({ analizadas: 5, positivos: 2 });
    expect(b.total.WSSV).toEqual({ analizadas: 2, positivos: 0 });
    expect(b.porSala.map((s) => [s.clave, s.muestras, s.fueraDeSalas])).toEqual([['Sala 1', 1, false], ['Sala 3', 2, false], ['Chongón', 1, true], ['Maduración', 1, true]]);
    expect(b.porSala[1].patogenos.IHHNV).toEqual({ analizadas: 2, positivos: 1 });
    expect(b.porPiscina.map((x) => [x.clave, x.muestras])).toEqual([['P553', 1], ['P557', 4]]);
    expect(b.porSexo.map((x) => [x.clave, x.muestras])).toEqual([['Hembra', 4], ['Macho', 1]]);
  });
  it('🔴 la lista de positivos, lo último primero, con sus patógenos', () => {
    const b = resumenBiomol(FILAS_BIO, P, F());
    expect(b.positivos).toEqual([
      { fecha: '2026-09-10', lugar: 'Chongón', tanque: '', piscina: 'P557', sexo: 'Hembra', patogenos: ['IHHNV', 'EHP'] },
      { fecha: '2026-09-01', lugar: 'Sala 3', tanque: 'Tq 22', piscina: 'P557', sexo: 'Hembra', patogenos: ['IHHNV'] },
    ]);
  });
  it('🔴 la tendencia semanal: % de positivos de cada semana (lunes), sólo los patógenos con dato', () => {
    const t = resumenBiomol(FILAS_BIO, P, F()).tendencia;
    expect(t.etiquetas[0]).toBe('2026-08-17');
    expect(t.etiquetas.at(-1)).toBe('2026-09-14');
    const ihhnv = t.series.find((s) => s.clave === 'IHHNV');
    expect(ihhnv.datos[t.etiquetas.indexOf('2026-08-31')]).toBe(50);
    expect(ihhnv.datos[t.etiquetas.indexOf('2026-09-07')]).toBe(33.3);
    expect(ihhnv.datos[t.etiquetas.indexOf('2026-08-24')]).toBe(null);
    expect(t.series.map((s) => s.clave)).toEqual(['IHHNV', 'WSSV', 'EHP']);
    expect(BIOMOL_PATOGENOS.map((p) => p.key)).toEqual(['IHHNV', 'WSSV', 'BP', 'AHPND', 'NHPB', 'EHP']);
  });
  it('🔴 con sala: lo de fuera de las salas no entra (y se cuenta); con tanque y con sexo', () => {
    const b = resumenBiomol(FILAS_BIO, P, F({ sala: 'Sala 3' }));
    expect([b.muestras, b.sinDato.sala]).toEqual([2, 2]);
    expect(resumenBiomol(FILAS_BIO, P, F({ sala: 'Sala 3', tanque: '23' })).muestras).toBe(1);
    expect(resumenBiomol(FILAS_BIO, P, F({ sexo: 'machos' })).muestras).toBe(1);
    expect(resumenBiomol(FILAS_BIO, P, F({ lote: 'QA' })).ignora).toEqual(['lote']);
  });
});

/* ============================================================
   0q·5a (2026-09-27, usuario) · 🦠 la ventana con sus PROPIOS filtros y las CANTIDADES de cada patógeno

   Decisiones del usuario: la ventana tiene sus filtros —Mes, Lote, Sala, Piscina y Sexo— sobre TODO el registro (ya no el
   período del tablero); la PISCINA de una muestra es la que dice («Piscina 556» en TQ/N°) o, si no, la de su lote en la
   hoja de Ingresos; y al escoger un patógeno, sus UFC muestra a muestra, la mediana semanal y los umbrales de su área.
   ============================================================ */
describe('Maduración · laboratorio · 0q·5a · la ventana y las cantidades', () => {
  const MAPA = piscinasDeLotes([{ Lote: 'qa', 'Piscina Broodstock': '557' }, { Lote: 'QA', 'Piscina Broodstock': 'P555' }, { Lote: 'QB', 'Piscina Broodstock': '' }]);
  const ventana = (fi) => resumenMicroDeLaVentana(FILAS, fi, CAL_RANGE_BASE, MAPA);

  it('🔴 el nombre de una piscina, escriba como se escriba', () => {
    expect(['Piscina 557', '557', 'P557', ' piscina  0557 '].map(nombrePiscina)).toEqual(['Piscina 557', 'Piscina 557', 'Piscina 557', 'Piscina 557']);
    expect(nombrePiscina('')).toBe('');
    expect(nombrePiscina('Chongón')).toBe('');
  });

  it('🔴 las piscinas de cada lote, de Ingresos (un lote puede venir de varias)', () => {
    expect([...MAPA.get('QA')].sort()).toEqual(['Piscina 555', 'Piscina 557']);
    expect(MAPA.has('QB')).toBe(false);
  });

  it('🔴 el mes da el período; sin mes, todo el registro; el lote se normaliza', () => {
    expect(filtroDeLaVentana({ mes: '2026-09' }).periodo).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(filtroDeLaVentana({ mes: '2026-02' }).periodo.hasta).toBe('2026-02-28');
    const t = filtroDeLaVentana({}).periodo;
    expect(t.desde <= '1900-01-01' && t.hasta >= '2999-12-31').toBe(true);
    expect(filtroDeLaVentana({ lote: ' qa ', sala: 'Sala 2', sexo: 'Hembras' }).F).toMatchObject({ lote: 'QA', sala: 'Sala 2', sexo: 'Hembras', tanque: null });
  });

  it('🔴 sin filtros, TODO el registro: la muestra de julio entra', () => {
    expect(ventana({}).reproductores.muestras).toBe(6);
    expect(ventana({ mes: '2026-09' }).reproductores.muestras).toBe(5);
    expect(ventana({ mes: '2026-07' }).reproductores.muestras).toBe(1);
  });

  it('🔴 la piscina: la que dice la muestra, o la de su lote; la que no tiene ninguna queda fuera y se cuenta', () => {
    expect(ventana({ piscina: 'Piscina 556' }).reproductores.muestras).toBe(1);    // la del TQ/N° «Piscina 556»
    expect(ventana({ piscina: 'Piscina 557' }).reproductores.muestras).toBe(1);    // la de QA, por Ingresos
    expect(ventana({ piscina: 'Piscina 555' }).reproductores.muestras).toBe(1);    // QA viene de dos: cuenta en las dos
    expect(ventana({ piscina: 'Piscina 557' }).reproductores.sinDato.piscina).toBe(4);
    const r = ventana({ piscina: 'Piscina 557' });
    expect(r.desinfeccion.ignora).toContain('piscina');
    expect(r.agua.ignora).toContain('piscina');
    expect(r.agua.calidad.ignora).toContain('piscina');
    expect(r.desinfeccion.muestras, 'la piscina no se aplica al despacho: no lo recorta').toBe(ventana({}).desinfeccion.muestras);
  });

  it('🔴 cada muestra de reproductores deja sus mediciones para el gráfico', () => {
    const r = ventana({});
    expect(r.reproductores.medidas).toHaveLength(6);
    expect(r.reproductores.medidas.find((m) => m.fecha === '2026-09-15').med.find((x) => x.key === 'totales').ufc).toBe(20000);
  });

  it('🔴 la serie de un patógeno: los puntos por fecha, la MEDIANA de cada semana, el máximo, las alertas y lo que no trae cifra', () => {
    const medidas = [
      { fecha: '2026-09-15', med: [{ key: 'k', ufc: 20000, nivel: 'Moderado' }] },
      { fecha: '2026-09-16', med: [{ key: 'k', ufc: 500, nivel: 'Mínimo' }] },
      { fecha: '2026-09-08', med: [{ key: 'k', ufc: 0, nivel: 'Mínimo' }, { key: 'j', ufc: 7, nivel: 'Mínimo' }] },
      { fecha: '2026-09-17', med: [{ key: 'k', ufc: null, nivel: 'Elevado' }] },
      { fecha: '2026-09-18', med: [{ key: 'k', ufc: 900, nivel: 'Mínimo' }] },
    ];
    const s = serieDePatogeno(medidas, 'k');
    expect(s.puntos.map((p) => [p.fecha, p.ufc])).toEqual([['2026-09-08', 0], ['2026-09-15', 20000], ['2026-09-16', 500], ['2026-09-18', 900]]);
    expect(s.semanas).toEqual([{ lunes: '2026-09-07', mediana: 0, n: 1 }, { lunes: '2026-09-14', mediana: 900, n: 3 }]);
    expect([s.muestras, s.mediana, s.maximo, s.alerta, s.sinCifra]).toEqual([4, 700, 20000, 1, 1]);
  });

  it('🔴 los umbrales del área (los de la vista de Microbiología)', () => {
    expect(umbralDe('mad-reprod', 'totales')).toMatchObject({ m: 10000, e: 100000 });
    expect(umbralDe('mad-reprod', 'noexiste')).toBeNull();
  });

  it('🔴 las opciones de cada filtro salen de los datos de Maduración (no de otro departamento)', () => {
    // Una muestra de Larvicultura con SU mes, sala, lote y sexo: si se colara, saldrían en las opciones.
    const larv = { ...MIC('05/05/2026', 'Larvicultura · Muestra', { 'Módulo/Sala': 'Sala 9', Lote: 'ZZ', Sexo: 'Otro', 'V.Totales UFC': '5' }), Departamento: 'Larvicultura' };
    const o = opcionesDeLaVentana([...FILAS, larv], MAPA);
    expect(o.meses).toEqual(['2026-07', '2026-09']);
    expect(o.salas).toEqual(['Sala 2', 'Sala 3']);
    expect(o.lotes).toEqual(['QA']);
    expect(o.sexos).toEqual(['Hembras', 'Machos']);
    expect(o.piscinas).toEqual(['Piscina 555', 'Piscina 556', 'Piscina 557']);
  });
});

/* ============================================================
   0q·5b (2026-09-27, usuario) · 🦠 ③ Agua y RAS: las CANTIDADES por formato

   Los formatos de agua tienen UMBRALES DISTINTOS (RAS, Agua, Hisopado, Agua limpia y mar: cuatro áreas), así que un
   gráfico que los mezclara no podría dibujar los suyos. Decisión del usuario: pastillas de formato (el Hisopado, como
   uno más), un filtro de Componente (RAS: Colector, Salida UV…) y, como en ①, la tabla de patógenos que se escoge.
   ============================================================ */
describe('Maduración · laboratorio · 0q·5b · ③ agua y RAS por formato', () => {
  const MICA = (fecha, formato, extra = {}) => ({ _SheetOrigin: 'Microbiología', 'Fecha muestreo': fecha, Departamento: 'Maduración', Formato: formato, ...extra });
  const AGUA = [
    MICA('10/09/2026', 'Maduración · RAS', { Componente: 'Colector', 'V.Totales UFC': '800' }),            // RAS: Moderado desde 500
    // «Bacterias Rojas» no tiene niveles: su medición no entra en la tabla de patógenos (sin nivel no hay alerta que contar).
    MICA('11/09/2026', 'Maduración · RAS', { Componente: 'Salida UV', 'V.Totales UFC': '50', 'Aeromonas UFC': '10', 'Bacterias Rojas UFC': '5' }),
    MICA('12/09/2026', 'Maduración · RAS', { Componente: 'Colector', 'V.Totales UFC': '1200' }),           // Elevado desde 1 000
    MICA('12/09/2026', 'Maduración · Agua', { 'Aeromonas UFC': '20000' }),                                 // Agua: Elevado desde 10 000
    MICA('13/09/2026', 'Maduración · Hisopado', { 'V.Totales UFC': '100' }),
    MICA('14/09/2026', 'Maduración · Agua', { 'Aeromonas UFC': '300' }),
  ];
  const r = resumenMicroDeLaVentana(AGUA, {}, CAL_RANGE_BASE, new Map());

  it('🔴 cada muestra de agua deja sus mediciones, con su formato y su componente', () => {
    expect(r.agua.medidas).toHaveLength(6);
    expect(r.agua.medidas[0]).toMatchObject({ fecha: '2026-09-10', formato: 'ras', componente: 'Colector' });
  });

  it('🔴 los formatos presentes, de más a menos muestras, con sus componentes', () => {
    expect(formatosDelAgua(r.agua.medidas)).toEqual([
      { key: 'ras', etiqueta: 'Maduración · RAS', muestras: 3, componentes: ['Colector', 'Salida UV'] },
      { key: 'mad-agua', etiqueta: 'Maduración · Agua', muestras: 2, componentes: [] },
      { key: 'mad-hisopado', etiqueta: 'Maduración · Hisopado', muestras: 1, componentes: [] },
    ]);
  });

  it('🔴 la tabla de patógenos de un grupo: analizadas y en alerta con los umbrales de SU formato, la de más alertas primero', () => {
    const ras = r.agua.medidas.filter((m) => m.formato === 'ras');
    expect(patogenosDeMedidas(ras).map((p) => [p.key, p.analizadas, p.alerta])).toEqual([['totales', 3, 2], ['aero', 1, 0]]);
    const colector = ras.filter((m) => m.componente === 'Colector');
    expect(patogenosDeMedidas(colector).map((p) => [p.key, p.analizadas, p.alerta])).toEqual([['totales', 2, 2]]);
    const agua = r.agua.medidas.filter((m) => m.formato === 'mad-agua');
    expect(patogenosDeMedidas(agua).map((p) => [p.key, p.analizadas, p.alerta, p.etiqueta])).toEqual([['aero', 2, 1, 'Aeromonas']]);
  });

  it('🔴 los umbrales de cada formato son los de su área', () => {
    expect(umbralDelFormato('ras', 'totales')).toMatchObject({ m: 500, e: 1000 });
    expect(umbralDelFormato('mad-agua', 'aero')).toMatchObject({ m: 5000, e: 10000 });
    expect(umbralDelFormato('mad-hisopado', 'totales')).toMatchObject({ m: 500, e: 5000 });
  });
});

/* ============================================================
   0q·5c (2026-09-27, usuario) · 🦠 ③ Calidad de agua: los VALORES de un parámetro, su rango y su tendencia semanal

   Decisión del usuario: al escoger un parámetro (su fila), sus valores muestra a muestra (verde dentro del rango, rojo
   fuera, gris si no tiene rango), la mediana semanal y las rayas del mínimo y el máximo del rango; un Grupo («Todos» por
   defecto: el rango es el mismo para todos los grupos); y primero el parámetro que más veces sale de rango.
   ⚠ La mediana de los parámetros NO se redondea (la de las UFC sí): un pH de 8,5 no es 9.
   ============================================================ */
describe('Maduración · laboratorio · 0q·5c · ③ calidad de agua por parámetro', () => {
  const r = resumenMicroDeLaVentana(FILAS, {}, CAL_RANGE_BASE, new Map());

  it('🔴 cada muestra de calidad de agua deja sus mediciones y su grupo', () => {
    expect(r.agua.calidad.medidas.map((m) => [m.fecha, m.grupo])).toEqual([['2026-09-10', 'Colector'], ['2026-09-12', 'Colector'], ['2026-09-14', 'Sala 2']]);
    expect(r.agua.calidad.medidas[0].med.find((x) => x.key === 'ph').value).toBe(9);
  });

  it('🔴 los parámetros: muestras, fuera de rango y su rango; primero los que más salen, los sin rango al final', () => {
    expect(parametrosDeMedidas(r.agua.calidad.medidas, CAL_RANGE_BASE).map((p) => [p.key, p.etiqueta, p.muestras, p.fuera, p.rango])).toEqual([
      ['ph', 'pH', 3, 2, '7.5–8.5'], ['alc', 'Alcalinidad', 3, 1, '120–150'], ['sal', 'Salinidad', 1, 0, '']]);
  });

  it('🔴 la serie de un parámetro: los valores por fecha con su estado, la mediana semanal SIN redondear, mínimo y máximo', () => {
    const s = serieDeParametro(r.agua.calidad.medidas, 'ph');
    expect(s.puntos.map((p) => [p.fecha, p.valor, p.estado])).toEqual([['2026-09-10', 9, 'fuera'], ['2026-09-12', 8, 'dentro'], ['2026-09-14', 7, 'fuera']]);
    expect(s.semanas).toEqual([{ lunes: '2026-09-07', mediana: 8.5, n: 2 }, { lunes: '2026-09-14', mediana: 7, n: 1 }]);
    expect([s.muestras, s.mediana, s.minimo, s.maximo, s.fuera]).toEqual([3, 8, 7, 9, 2]);
    // En su orden, lleguen como lleguen las muestras (el fixture ya venía ordenado: sin esto, no ordenar pasaba).
    expect(serieDeParametro([...r.agua.calidad.medidas].reverse(), 'ph').puntos.map((p) => p.fecha)).toEqual(['2026-09-10', '2026-09-12', '2026-09-14']);
  });

  it('🔴 el rango de un parámetro: los dos límites, uno solo, o ninguno', () => {
    expect(rangoDe('ph', CAL_RANGE_BASE)).toEqual({ min: 7.5, max: 8.5 });
    expect(rangoDe('nitrito', CAL_RANGE_BASE)).toEqual({ min: null, max: 0.2 });
    expect(rangoDe('sal', CAL_RANGE_BASE)).toBeNull();
  });
});

/* ============================================================
   0q·6 (2026-09-27, usuario) · 🧬 Biomol · reproductores: sus PROPIOS filtros, la prevalencia POR LOTE y la tendencia de
   UN patógeno con sus muestras

   Decisiones del usuario: la barra de Microbiología (Mes, Lote, Sala, Piscina, Sexo) sobre TODO el registro; el lote de
   una muestra es su «Código» («Lote BN» → BN); la piscina, la de la muestra, y una combinada («P554/556») cuenta en las
   dos; la prevalencia por lote en una tabla lote × patógeno; y la tendencia semanal de UN patógeno: sus muestras
   analizadas por semana y el % de positivos.
   ⚠ Con «todo el registro» el período va de 0000 a 9999: la tendencia de `resumenBiomol` recorre sus semanas desde el
   principio del período, así que la ventana lo ACOTA a las fechas de sus muestras.
   ============================================================ */
describe('Maduración · laboratorio · 0q·6 · 🧬 la ventana de Biomol', () => {
  const B = normalizeRows([
    BIO('01/09/2026', 'Sala 3', { 'Código': 'Lote BN', Piscina: 'P554/556', IHHNV: 'Positivo', WSSV: 'Negativo' }),
    BIO('02/09/2026', 'Sala 3', { 'Código': 'lote bn', Piscina: 'P557', IHHNV: 'Negativo', Sexo: 'Macho' }),
    BIO('09/09/2026', 'Sala 1', { 'Código': 'Lote BO', Piscina: 'P553', IHHNV: 'Negativo', EHP: 'Positivo' }),
    BIO('16/09/2026', 'Chongón', { Piscina: '', IHHNV: 'Positivo' }),
    BIO('05/07/2026', 'Sala 3', { 'Código': 'Lote BN', IHHNV: 'Positivo' }),
    BIO('11/09/2026', 'Módulo 1', { 'Estadío': 'PL10', 'Código': 'Lote ZZ', IHHNV: 'Positivo' }),   // larva: no es reproductor
  ]);
  const V = (fi) => resumenBiomolDeLaVentana(B, fi);

  it('🔴 el lote de una muestra es su Código sin «Lote»; la piscina combinada, las dos', () => {
    expect(B.map(loteBiomol)).toEqual(['BN', 'BN', 'BO', '', 'BN', 'ZZ']);
    expect(piscinasBiomol(B[0])).toEqual(['Piscina 554', 'Piscina 556']);
    expect(piscinasBiomol(B[3])).toEqual([]);
  });

  it('🔴 sin filtros, TODO el registro (la de julio entra), y la tendencia ACOTADA a sus fechas', () => {
    const r = V({});
    expect(r.muestras).toBe(5);
    expect(r.tendencia.etiquetas[0]).toBe('2026-06-29');
    expect(r.tendencia.etiquetas.at(-1)).toBe('2026-09-14');
  });

  it('🔴 el mes, el lote y la piscina recortan; la muestra que no dice su lote o su piscina queda fuera y se cuenta', () => {
    expect(V({ mes: '2026-09' }).muestras).toBe(4);
    expect(V({ lote: 'bn' }).muestras).toBe(3);
    expect(V({ lote: 'BN' }).sinDato.lote).toBe(1);
    expect(V({ piscina: 'Piscina 556' }).muestras).toBe(1);
    expect(V({ piscina: 'Piscina 557' }).muestras).toBe(2);   // la del 02/09 y la de julio (P557 del fixture base)
    expect(V({ piscina: 'Piscina 553' }).sinDato.piscina).toBe(1);
    expect(V({ sexo: 'Macho' }).muestras).toBe(1);
  });

  it('🔴 un mes sin muestras: nada, y sin recorrer siglos', () => {
    const r = V({ mes: '2025-01' });
    expect(r.muestras).toBe(0);
    expect(r.tendencia.etiquetas.length).toBeLessThan(10);
  });

  it('🔴 la prevalencia por lote: positivos ÷ analizados de cada patógeno; la muestra sin lote, aparte y al final', () => {
    const r = V({});
    expect(r.porLote.map((x) => [x.clave, x.muestras])).toEqual([['BN', 3], ['BO', 1], ['(sin lote)', 1]]);
    expect(r.porLote[0].patogenos.IHHNV).toEqual({ analizadas: 3, positivos: 2 });
    expect(r.porLote[1].patogenos.EHP).toEqual({ analizadas: 1, positivos: 1 });
  });

  it('🔴 la tendencia de UN patógeno: por semana, las analizadas, las positivas y su % (null sin muestras)', () => {
    const t = tendenciaDePatogeno(V({}).filas, 'IHHNV');
    expect(t[0]).toEqual({ lunes: '2026-06-29', analizadas: 1, positivos: 1, pct: 100 });
    expect(t.find((w) => w.lunes === '2026-07-06')).toEqual({ lunes: '2026-07-06', analizadas: 0, positivos: 0, pct: null });
    expect(t.find((w) => w.lunes === '2026-08-31')).toEqual({ lunes: '2026-08-31', analizadas: 2, positivos: 1, pct: 50 });
    expect(t.at(-1)).toEqual({ lunes: '2026-09-14', analizadas: 1, positivos: 1, pct: 100 });
    // Sólo cuentan las muestras analizadas PARA ESE patógeno: EHP sólo lo tiene la del 09/09.
    expect(tendenciaDePatogeno(V({}).filas, 'EHP')).toEqual([{ lunes: '2026-09-07', analizadas: 1, positivos: 1, pct: 100 }]);
  });

  it('🔴 las opciones de cada filtro salen de los reproductores (no de las larvas)', () => {
    const o = opcionesBiomol(B);
    expect(o.meses).toEqual(['2026-07', '2026-09']);
    expect(o.lotes).toEqual(['BN', 'BO']);
    expect(o.salas).toEqual(['Sala 1', 'Sala 3']);
    expect(o.piscinas).toEqual(['Piscina 553', 'Piscina 554', 'Piscina 556', 'Piscina 557']);
    expect(o.sexos).toEqual(['Hembra', 'Macho']);
  });
});

/* ============================================================
   0q·7 (2026-09-27, usuario) · 🧬 Biomol: Maduración POR TIPO DE MUESTRA (Heces, Branquias, Pleópodo, Agua, Hisopado)

   El tipo de muestra lo escribe la ficha en «Otros»; las reglas son las de la vista de Biomol (biomolecular/tejidos.js:
   `tipoDeMuestra`, `matrizTejidos`, `franjaTejidos`), que no se repiten. Decisiones del usuario: una tabla tipo ×
   patógeno y una franja semanal, con los filtros de la ventana; y en ESTA sección cuenta también la muestra de un tipo que
   no está marcada «Reproductores» si es de Maduración (una sala o «Maduración»: el agua o un hisopado de una sala).
   ============================================================ */
describe('Maduración · laboratorio · 0q·7 · 🧬 Biomol por tipo de muestra', () => {
  const T = normalizeRows([
    BIO('15/09/2026', 'Sala 3', { 'Código': 'Lote BN', Otros: 'Branquias', IHHNV: 'Positivo' }),
    BIO('22/09/2026', 'Sala 4', { 'Estadío': '', Otros: 'Heces', BP: 'Positivo', EHP: 'Negativo' }),       // de una sala, sin estadío
    BIO('22/09/2026', 'Chongón', { Otros: 'Pleópodo', IHHNV: 'Negativo' }),
    BIO('22/09/2026', 'Sala 3', { Otros: 'Calamar (Funda en uso)', IHHNV: 'Negativo' }),                  // un alimento: no es un tejido
    BIO('22/09/2026', 'Módulo 1', { 'Estadío': 'PL10', Otros: 'Agua', IHHNV: 'Negativo' }),               // de larvicultura: no es de Maduración
  ]);
  const V = (fi) => resumenBiomolDeLaVentana(T, fi);
  const fila = (r, clave) => r.tejidos.matriz.find((x) => x.clave === clave);

  it('🔴 la tabla tipo × patógeno: los cinco tipos, con sus muestras; el alimento y la larva no entran', () => {
    const r = V({});
    expect(r.tejidos.matriz.map((x) => [x.clave, x.muestras])).toEqual([['heces', 1], ['branquias', 1], ['pleopodo', 1], ['agua', 0], ['hisopado', 0]]);
    expect(fila(r, 'heces').celdas.find((c) => c.diag === 'BP')).toMatchObject({ analizadas: 1, positivos: 1 });
    expect(fila(r, 'branquias').celdas.find((c) => c.diag === 'IHHNV')).toMatchObject({ analizadas: 1, positivos: 1 });
  });

  it('🔴 la muestra de Maduración sin «Reproductores» cuenta AQUÍ, pero no en el resto de la ventana', () => {
    const r = V({});
    expect(fila(r, 'heces').muestras).toBe(1);
    expect(r.muestras).toBe(3);   // branquias, pleópodo y el alimento: los reproductores
  });

  it('🔴 las opciones de los filtros incluyen lo que cuenta aquí (la Sala 4 de las heces), no la larva', () => {
    expect(opcionesBiomol(T).salas).toEqual(['Sala 3', 'Sala 4']);
  });

  it('🔴 sigue los filtros de la ventana', () => {
    expect(V({ sala: 'Sala 4' }).tejidos.matriz.map((x) => x.muestras)).toEqual([1, 0, 0, 0, 0]);
    expect(V({ mes: '2026-08' }).tejidos.matriz.every((x) => x.muestras === 0)).toBe(true);
    expect(V({ lote: 'BN' }).tejidos.matriz.map((x) => x.muestras)).toEqual([0, 1, 0, 0, 0]);
  });

  it('🔴 la franja semanal: por tipo y semana, las muestras y las positivas a algún patógeno', () => {
    const f = V({}).tejidos.franja;
    expect(f.semanas).toEqual(['2026-09-14', '2026-09-21']);
    const porClave = (k) => f.filas.find((x) => x.clave === k).porSemana;
    expect(porClave('branquias')).toEqual([{ muestras: 1, positivas: 1 }, { muestras: 0, positivas: 0 }]);
    expect(porClave('heces')).toEqual([{ muestras: 0, positivas: 0 }, { muestras: 1, positivas: 1 }]);
    expect(porClave('pleopodo')).toEqual([{ muestras: 0, positivas: 0 }, { muestras: 1, positivas: 0 }]);
  });
});

/* 0r·3a (2026-09-28, usuario) · «la ventana de Microbiología congela»: lo caro —fundir las mediciones de cada muestra— se
   hace UNA vez por carga de datos (el array del store es la clave) y SÓLO con las de Maduración; cada pintada, filtro o
   patógeno sólo filtra y cuenta. Medido antes: 1,0–1,5 s por clic en un PC y 6,6–7,4 s en un equipo de campo. */
describe('Maduración · laboratorio · 0r·3a · preparar una vez por carga', () => {
  it('🔴 cada muestra de Maduración se funde UNA vez por carga, por muchas pintadas y filtros; la de otro departamento, nunca', () => {
    const filas = [...FILAS];   // una carga nueva
    meltRow.mockClear();
    resumenMicroDeLaVentana(filas, {}, CAL_RANGE_BASE, new Map());
    opcionesDeLaVentana(filas, new Map());
    resumenMicroDeLaVentana(filas, { mes: '2026-09', sala: 'Sala 2' }, CAL_RANGE_BASE, new Map());
    resumenMicroDeLaVentana(filas, { piscina: 'Piscina 556' }, CAL_RANGE_BASE, new Map());
    resumenMicro(filas, P, F(), CAL_RANGE_BASE);
    expect(meltRow, 'las 13 de Maduración, una vez').toHaveBeenCalledTimes(13);
    expect(meltRow.mock.calls.some(([r]) => r.Departamento === 'Larvicultura')).toBe(false);
    resumenMicroDeLaVentana([...filas], {}, CAL_RANGE_BASE, new Map());   // datos refrescados: llega otro array
    expect(meltRow, 'con datos nuevos, otra vez').toHaveBeenCalledTimes(26);
  });

  it('🔴 las opciones de mes y sala también traen las que sólo dice la calidad de agua de Maduración', () => {
    const soloCal = CAL('05/08/2026', { Formato: 'Maduración · Agua', Sala: 'Sala 5', pH: '8' });
    const o = opcionesDeLaVentana([...FILAS, soloCal], new Map());
    expect(o.meses).toContain('2026-08');
    expect(o.salas).toContain('Sala 5');
    expect(o.lotes, 'la calidad de agua no dice lote').not.toContain(undefined);
  });

  it('🔴 calidad de agua: una vez por muestra y por rangos; con otros rangos se recalcula (y al volver, vuelve)', () => {
    const filas = [...FILAS];
    calMeasured.mockClear();
    const colector = (r) => r.agua.calidad.porGrupo.find((g) => g.grupo === 'Colector');
    expect(colector(resumenMicroDeLaVentana(filas, {}, CAL_RANGE_BASE, new Map())).fuera).toBe(1);
    resumenMicroDeLaVentana(filas, { sala: 'Sala 2' }, CAL_RANGE_BASE, new Map());
    expect(calMeasured, 'las 3 de Maduración, una vez').toHaveBeenCalledTimes(3);
    const estricto = { ...CAL_RANGE_BASE, ph: { min: 7.5, max: 7.9 } };
    expect(colector(resumenMicroDeLaVentana(filas, {}, estricto, new Map())).fuera, 'el pH 8 sale fuera con el rango nuevo').toBe(2);
    expect(colector(resumenMicroDeLaVentana(filas, {}, { ...CAL_RANGE_BASE }, new Map())).fuera, 'otros rangos iguales: como al principio').toBe(1);
  });
});

/* 0r·3d (2026-09-28, usuario) · 🦠 también se prepara en REPOSO: `prepararMicro` hace de antemano lo que haría la primera
   apertura —fundir las muestras de Maduración y medir su calidad de agua con los rangos de este equipo—, así que abrir la
   ventana después ya no funde ni mide nada. */
describe('Maduración · laboratorio · 0r·3d · 🦠 preparada de antemano', () => {
  it('🔴 tras prepararMicro, la ventana (opciones y resumen) no funde ni mide nada con esos rangos', () => {
    const filas = [...FILAS];   // una carga nueva
    meltRow.mockClear();
    calMeasured.mockClear();
    prepararMicro(filas, CAL_RANGE_BASE);
    expect(meltRow, 'las 13 de Maduración').toHaveBeenCalledTimes(13);
    expect(calMeasured, 'las 3 de calidad de agua de Maduración').toHaveBeenCalledTimes(3);
    opcionesDeLaVentana(filas, new Map());
    resumenMicroDeLaVentana(filas, {}, { ...CAL_RANGE_BASE }, new Map());   // los mismos rangos, leídos otra vez
    expect(meltRow, 'abrir la ventana no funde nada').toHaveBeenCalledTimes(13);
    expect(calMeasured, 'ni mide nada').toHaveBeenCalledTimes(3);
  });
});

/* 0r·3c · las opciones de la ventana de 🧬 se calculan una vez por carga (las filas normalizadas son la clave). */
describe('Maduración · laboratorio · 0r·3c · 🧬 las opciones, una vez por carga', () => {
  it('🔴 las mismas filas dan el MISMO objeto; otras filas, otro', () => {
    const filas = normalizeRows([{ _SheetOrigin: 'Biomol', Fecha: '15/09/2026', Lugar: 'Sala 1', 'Estadío': 'Reproductores', IHHNV: 'Positivo' }]);
    const a = opcionesBiomol(filas);
    expect(opcionesBiomol(filas)).toBe(a);
    expect(a.salas).toEqual(['Sala 1']);
    expect(opcionesBiomol([...filas])).not.toBe(a);
  });
});
