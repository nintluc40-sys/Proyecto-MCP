/* ============================================================
   MADURACIÓN · OPERATIVO — 🔀 UN MIX EN LA VISTA (usuario, 2026-11-03: «Fila propia, sin repartir»)

   Los huevos, N2 y N5 de un MIX no se pueden separar por lote, así que: va en su propia fila · cuenta en el total de la planta ·
   no suma a ninguno de sus lotes, ni a sus códigos o piscinas · con uno de esos filtros puestos se queda fuera de las cifras y se
   dice aparte · la ficha de cada lote dice en qué MIX participó, y sus muertas sí le descuentan (las reparte el libro).

   El fixture DISTINGUE: BN, BO y BP tienen cifras distintas de las del MIX, y el MIX lleva los códigos y las piscinas de BN y BO, así
   que sumarlo a un lote, a un código o a una piscina da OTRA cifra. BP no participa: es el control. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { modeloOperativo, serieDiaria } from './operativo.data.js';
import { normalizarFiltro, indiceDeFiltro, periodoDe, kpiReproduccion, mixAparte, mixEnFiltro, desoveEnCodigo, avisoDeMixElegido } from './operativo.tablero.js';
import { tablaDeReproduccion, totalesDeReproduccion, pendientesDeN5 } from './operativo.reproduccion.js';
import { reproduccionDeLote, mixDeLote, eventosDeLote, fichaDeLote, loteEnFiltro, desempenoPorPiscina, comparativa } from './operativo.lotes.js';
import { tasaDeDesove } from './operativo.indicadores.js';
import { cruceConMicrochips } from './operativo.cruce.js';
import { desgloseDeBajas } from './operativo.bajas.js';
import { sumarDias } from '../registros/lib/mad-libro.js';
import { graficoReproduccion } from './operativo.kpis.js';
import { salasDelDesove, presenciaDiaria } from './operativo.tendencias.js';
import { desovesDiarios, desovesYMarea } from './operativo.mareas.js';
import { revisionesDeNauplios, mortalidadEnDesove } from './operativo.revisiones.js';
import { evolucion, hojasDeEvolucion, tasaDelRango } from './operativo.evolucion.js';
import { semanalPorLote, semanalPaginaHtml, semanalHojas, cierreDeLote, cierreHtml, cierreHojas, parteDiario, parteDiarioHtml, parteDiarioHojas } from './operativo.reportes.js';
import { produccionDelMes } from '../visitante/maduracion.produccion.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, hembras, cg, piscina) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: fecha, Lote: lote, 'Código genético': cg,
  'Piscina Broodstock': piscina, Sala: sala, Tanque: tanque, Machos: 10, Hembras: hembras });
const DES = (fecha, lote, cg, piscina, desoves, huevos, n2, n5) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': cg, 'Piscina Broodstock': piscina,
  Desoves: desoves, 'Total de huevos': huevos, 'Hembras no viables': 0, 'Fecha N2': n2 ? fecha : '', N2: n2, 'Fecha N5': n5 ? fecha : '', N5: n5, Despacho: '', Observaciones: '' });
const INF = (fecha, lote, extra) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': 'CA/CB', 'Piscina Broodstock': 'P1/P2', 'Tipo de tanque': '', 'Hembras que entran': '',
  'Hembras muertas': '', Revisión: '', Deformidad: '', Actividad: '', Hongos: '', Fototropismo: '', Aireación: '', Salinidad: '', Temperatura: '', Área: '', 'Alcalinidad día': '',
  'Alcalinidad noche': '', Observaciones: '', ID: fecha + lote + (extra['Revisión'] || extra['Tipo de tanque']), 'Temperatura tanque desove': '', ...extra });
const FOTO = '2026-09-20';
const MIX = 'MIX(BN,BO)';

const PLANTA = [
  ING('2026-08-01', 'BN', 'Sala 1', 1, 200, 'CA', 'P1'),
  ING('2026-08-01', 'BO', 'Sala 2', 1, 100, 'CB', 'P2'),
  ING('2026-08-01', 'BP', 'Sala 3', 1, 50, 'CC', 'P3'),
  DES('2026-09-10', 'BN', 'CA', 'P1', 2, 200000, 100000, 80000),
  DES('2026-09-10', 'BP', 'CC', 'P3', 1, 50000, 20000, 10000),
  DES('2026-09-16', MIX, 'CA/CB', 'P1/P2', 4, 700000, 500000, 300000),
  INF('2026-09-16', MIX, { 'Tipo de tanque': 'Desove', 'Hembras que entran': 30, 'Hembras muertas': 9 }),
  INF('2026-09-16', MIX, { 'Revisión': 'Lavado', Deformidad: 'Baja', Actividad: 'Alta' }),
  INF('2026-09-13', 'BP', { 'Revisión': 'Entrada', Deformidad: 'Baja', Actividad: 'Alta' }),
];
const M = modeloOperativo(PLANTA, { fecha: FOTO, hoy: FOTO });
const P = periodoDe('30d', FOTO, M.fuentes);
const IX = indiceDeFiltro(M);
const F = (o = {}) => normalizarFiltro(o, IX);
const SIN = F();
const sumaDelGrafico = (G) => G.series.find((x) => x.clave === 'desoves').datos.reduce((a, x) => a + x, 0);

describe('🔀 sin filtro: fila propia, y cuenta en el total de la planta', () => {
  it('🔴 el total lo incluye', () => {
    const T = totalesDeReproduccion(M, P, SIN);
    expect(T.desoves).toBe(7);
    expect(T.huevos).toBe(950000);
    expect(T.n5).toBe(390000);
    expect(T.mix).toEqual([]);
  });
  it('🔴 va en su propia fila, y sus cifras no están en las de BN', () => {
    const filas = tablaDeReproduccion(M, P, SIN);
    expect(filas.map((f) => f.lote)).toEqual(['BN', 'BP', MIX]);
    const de = (l) => filas.find((f) => f.lote === l);
    expect(de(MIX).desoves).toBe(4);
    expect(de(MIX).n5).toBe(300000);
    expect(de('BN').desoves).toBe(2);
    expect(de('BN').n5).toBe(80000);
  });
  it('🔴 `reproduccionDeLote` tampoco lo suma: no es de BO, que no tiene desoves propios', () => {
    expect(reproduccionDeLote(M.fuentes, 'BO', P).desoves).toBe(0);
    expect(reproduccionDeLote(M.fuentes, MIX, P).desoves).toBe(4);
  });
  it('🔴 la suma de las filas da el total: nada se cuenta dos veces', () => {
    const filas = tablaDeReproduccion(M, P, SIN);
    expect(filas.reduce((a, f) => a + f.desoves, 0)).toBe(totalesDeReproduccion(M, P, SIN).desoves);
  });
  it('un MIX pendiente sale en los pendientes, con su nombre', () => {
    const conPend = [...PLANTA, DES('2026-09-15', 'MIX(BN,BP)', 'CA/CC', 'P1/P3', 1, 1000, '', '')];
    const MM = modeloOperativo(conPend, { fecha: FOTO, hoy: FOTO });
    expect(pendientesDeN5(MM.fuentes, periodoDe('30d', FOTO, MM.fuentes), { ...normalizarFiltro({}), indice: MM.indice }, FOTO).filas.map((f) => f.lote)).toContain('MIX(BN,BP)');
  });
});

describe('🔀 con un filtro: no suma, y se dice aparte', () => {
  const casos = [
    ['lote BN', { lote: 'BN' }, 2, 80000],
    ['lote BO', { lote: 'BO' }, 0, 0],
    ['código CA', { codigo: 'CA' }, 2, 80000],
    ['código CB', { codigo: 'CB' }, 0, 0],
    ['piscina P1', { piscina: 'P1' }, 2, 80000],
    ['piscina P2', { piscina: 'P2' }, 0, 0],
  ];
  casos.forEach(([nombre, filtro, desoves, n5]) => {
    it(`🔴 ${nombre}: el MIX no entra en las cifras, ni en la tabla, ni en el gráfico, y sí en «aparte»`, () => {
      const f = F(filtro);
      const T = totalesDeReproduccion(M, P, f);
      expect(T.desoves).toBe(desoves);
      expect(T.n5).toBe(n5);
      expect(tablaDeReproduccion(M, P, f).map((x) => x.lote)).not.toContain(MIX);
      expect(sumaDelGrafico(graficoReproduccion(M.fuentes.desoves, P, f))).toBe(desoves);
      expect(T.mix).toEqual([{ lote: MIX, desoves: 4, huevos: 700000, n2: 500000, n5: 300000 }]);
    });
  });

  it('🔴 camaronera: con la de sus lotes va aparte, con otra ni se menciona', () => {
    const T = totalesDeReproduccion(M, P, F({ camaronera: 'CX' }));
    expect(T.desoves).toBe(3);
    expect(T.mix.map((m) => m.lote)).toEqual([MIX]);
    expect(totalesDeReproduccion(M, P, F({ camaronera: 'CZ' })).mix).toEqual([]);
    expect(mixAparte(M.fuentes.desoves, P, F({ lote: 'BN', piscina: 'P3' })), 'la piscina de quien no participa').toEqual([]);
  });

  it('🔴 de un lote que no participa, ni se menciona', () => {
    expect(totalesDeReproduccion(M, P, F({ lote: 'BP' })).mix).toEqual([]);
    expect(totalesDeReproduccion(M, P, F({ codigo: 'CC' })).mix).toEqual([]);
    expect(totalesDeReproduccion(M, P, F({ piscina: 'P3' })).mix).toEqual([]);
  });

  it('🔴 con varios filtros tiene que casar en todos', () => {
    expect(mixAparte(M.fuentes.desoves, P, F({ lote: 'BN', codigo: 'CC' }))).toEqual([]);
    expect(mixAparte(M.fuentes.desoves, P, F({ lote: 'BN', codigo: 'CB' })).map((m) => m.lote)).toEqual([MIX]);
  });

  it('🔴 fuera del período no se menciona', () => {
    const lejos = { desde: '2026-01-01', hasta: '2026-01-31' };
    expect(mixAparte(M.fuentes.desoves, lejos, F({ lote: 'BN' }))).toEqual([]);
  });

  it('🔴 elegir el propio MIX lo enseña en las cifras, y entonces ya no va aparte', () => {
    const f = F({ lote: MIX });
    const T = totalesDeReproduccion(M, P, f);
    expect(T.desoves).toBe(4);
    expect(T.mix).toEqual([]);
    expect(tablaDeReproduccion(M, P, f).map((x) => x.lote)).toEqual([MIX]);
  });

  it('🔴 elegir a la vez un lote y su MIX: los dos en las cifras, y nada aparte, que lo contaría dos veces', () => {
    const f = F({ lote: ['BN', MIX] });
    const T = totalesDeReproduccion(M, P, f);
    expect(T.desoves).toBe(6);
    expect(T.mix).toEqual([]);
    expect(tablaDeReproduccion(M, P, f).map((x) => x.lote)).toEqual(['BN', MIX]);
  });

  it('🔴 `mixEnFiltro`: sin nada de lo suyo elegido no dice que sí, y lo que no es un MIX nunca', () => {
    const fila = { Lote: MIX, 'Código genético': 'CA/CB' };
    expect(mixEnFiltro(fila, SIN)).toBe(false);
    expect(mixEnFiltro(fila, undefined)).toBe(false);
    expect(mixEnFiltro(fila, F({ sala: 'Sala 1' })), 'la sala la mira `loteEnFiltro`').toBe(false);
    expect(mixEnFiltro(fila, F({ lote: 'BN' }))).toBe(true);
    expect(mixEnFiltro({ Lote: 'BN', 'Código genético': 'CA' }, F({ lote: 'BN' }))).toBe(false);
  });

  it('🔴 `kpiReproduccion` y `desoveEnCodigo`: el código del filtro no alcanza a un MIX, sí a un lote con ese código', () => {
    expect(kpiReproduccion(M.fuentes.desoves, P, F({ codigo: 'CA' })).desoves).toBe(2);
    expect(desoveEnCodigo({ Lote: MIX, 'Código genético': 'CA/CB' }, F({ codigo: 'CA' }))).toBe(false);
    expect(desoveEnCodigo({ Lote: 'BN', 'Código genético': 'CA/CB' }, F({ codigo: 'CA' }))).toBe(true);
    expect(desoveEnCodigo({ Lote: MIX, 'Código genético': 'CA/CB' }, SIN)).toBe(true);
  });

  it('🔴 📈 Evolución sigue la misma regla: con un código elegido, el MIX no está en sus desoves', () => {
    const serie = (f) => evolucion({ M, F: f, periodo: P, serie: [], partes: [], copulas: [], clima: null }, { a: 'desoves', agrupar: 'dia' });
    const total = (R) => (R.series || []).flatMap((s) => s.datos || []).reduce((a, b) => a + (Number(b) || 0), 0);
    expect(total(serie(SIN))).toBe(7);
    expect(total(serie(F({ codigo: 'CA' })))).toBe(2);
  });
});

describe('🔀 la ficha del lote', () => {
  it('🔴 dice en qué MIX participó, con sus cifras; quien no participó, nada', () => {
    expect(mixDeLote(M.fuentes, 'BN', P)).toEqual([{ lote: MIX, desoves: 4, huevos: 700000, n2: 500000, n5: 300000 }]);
    expect(mixDeLote(M.fuentes, 'BO', P).map((m) => m.lote)).toEqual([MIX]);
    expect(mixDeLote(M.fuentes, 'BP', P)).toEqual([]);
    expect(mixDeLote(M.fuentes, 'BN', { desde: '2026-01-01', hasta: '2026-01-31' }), 'fuera del período').toEqual([]);
    expect(fichaDeLote(M, [], 'BN', P).mix.map((m) => m.lote)).toEqual([MIX]);
  });
  it('🔴 su línea de tiempo lo marca, sin cifras que no son suyas', () => {
    const ev = eventosDeLote(M.fuentes, 'BO', P);
    const des = ev.find((e) => e.etiqueta === 'Desove en ' + MIX);
    expect(des).toBeTruthy();
    expect(des.hembras + des.machos).toBe(0);
    expect(ev.some((e) => e.tipo === 'mortdes' && e.etiqueta.includes(MIX) && e.etiqueta.includes('repartida'))).toBe(true);
    expect(eventosDeLote(M.fuentes, 'BP', P).some((e) => e.etiqueta.includes('MIX'))).toBe(false);
  });
  it('🔴 Broodstock: lleva los códigos y las piscinas de sus lotes, pero no suma a ninguna', () => {
    const D = desempenoPorPiscina(M);
    expect(D.get('P1').desoves).toBe(2);
    expect(D.get('P2').desoves).toBe(0);
    expect(D.get('P3').desoves).toBe(1);
  });
  it('🔴 sus muertas sí le descuentan, repartidas, y no a quien no participó', () => {
    const vivas = (l) => M.libro.posiciones.filter((p) => p.lote === l).reduce((a, p) => a + p.hembras, 0);
    expect(vivas('BN')).toBe(194);
    expect(vivas('BO')).toBe(97);
    expect(vivas('BP')).toBe(50);
    expect((M.libro.avisos || []).map((a) => a.tipo)).not.toContain('mortdes-sin-lote');
  });
  it('🔴 los reportes por lote lo dicen', () => {
    const sem = semanalPorLote(M, [], [], SIN, { ahora: 'x' });
    const pag = sem.paginas.find((p) => p.lote === 'BN');
    expect(pag.mix.map((m) => m.lote)).toEqual([MIX]);
    expect(semanalPaginaHtml(pag)).toContain('Además, sin sumar aquí: ' + MIX);
    expect(cierreHtml(cierreDeLote(M, [], 'BN', {}))).toContain('Además, sin sumar aquí: ' + MIX);
    const otra = sem.paginas.find((p) => p.lote === 'BP');
    expect(semanalPaginaHtml(otra)).not.toContain('Además, sin sumar');
  });
});

describe('🔀 los reportes: el papel y el Excel dicen lo mismo', () => {
  const hoja = (hojas, nombre) => hojas.find((h) => h.nombre === nombre);
  const fila = { lote: MIX, desoves: 4, huevos: 700000, n2: 500000, n5: 300000 };
  const cifras = [MIX, fila.desoves, fila.huevos, fila.n2, fila.n5];

  it('🔴 Semanal: su hoja propia con el lote y el MIX; sin MIX, esa hoja no existe', () => {
    const sem = semanalPorLote(M, [], [], SIN, { ahora: 'x' });
    const aoa = hoja(semanalHojas(sem), 'MIX').aoa;
    expect(aoa).toContainEqual(['BN', ...cifras]);
    expect(aoa).toContainEqual(['BO', ...cifras]);
    expect(aoa.some((f) => f[0] === 'BP')).toBe(false);
    expect(aoa[0][0]).toContain('no suman');
    const sinMix = modeloOperativo(PLANTA.filter((r) => r.Lote !== MIX), { fecha: FOTO, hoy: FOTO });
    expect(hoja(semanalHojas(semanalPorLote(sinMix, [], [], normalizarFiltro({}, indiceDeFiltro(sinMix)), { ahora: 'x' })), 'MIX')).toBeUndefined();
  });
  it('🔴 Cierre: en su hoja de Reproducción, y sólo en la de quien participó', () => {
    expect(hoja(cierreHojas(cierreDeLote(M, [], 'BN', {})), 'Reproducción').aoa).toContainEqual(cifras);
    expect(JSON.stringify(hoja(cierreHojas(cierreDeLote(M, [], 'BP', {})), 'Reproducción').aoa)).not.toContain('MIX');
    expect(cierreHtml(cierreDeLote(M, [], 'BP', {}))).not.toContain('Además, sin sumar');
  });
  it('🔴 Parte: sin filtro va en la tabla como una fila más; con un lote, aparte, en el papel y en el Excel', () => {
    const MD = modeloOperativo(PLANTA, { fecha: '2026-09-16', hoy: '2026-09-16' });
    const IXD = indiceDeFiltro(MD);
    const sin = parteDiario(MD, [], [], normalizarFiltro({}, IXD), { ahora: 'x' });
    expect(sin.reproduccionPorLote.map((r) => r.lote)).toEqual([MIX]);
    expect(parteDiarioHtml(sin)).not.toContain('Además, sin sumar');
    const con = parteDiario(MD, [], [], normalizarFiltro({ lote: 'BN' }, IXD), { ahora: 'x' });
    expect(con.reproduccionPorLote).toEqual([]);
    expect(parteDiarioHtml(con)).toContain('Además, sin sumar aquí: ' + MIX);
    expect(hoja(parteDiarioHojas(con), 'Reproducción').aoa).toContainEqual(cifras);
    expect(JSON.stringify(hoja(parteDiarioHojas(sin), 'Reproducción').aoa)).not.toContain('no suman');
  });
});

describe('🔀 por sala y por alcance: un MIX cuenta donde estén sus lotes', () => {
  const pres = presenciaDiaria(M.fuentes, '2026-09-01', FOTO);
  it('🔴 sus salas son las de sus lotes', () => {
    expect(salasDelDesove(pres, MIX, '2026-09-16')).toEqual(['Sala 1', 'Sala 2']);
    expect(salasDelDesove(pres, 'BN', '2026-09-16')).toEqual(['Sala 1']);
  });
  it('🔴 `loteEnFiltro`: en las salas de sus lotes sí, en otras no; y con lote o código no es de nadie', () => {
    expect(loteEnFiltro(M.libro, MIX, SIN)).toBe(true);
    expect(loteEnFiltro(M.libro, MIX, F({ sala: 'Sala 2' }))).toBe(true);
    expect(loteEnFiltro(M.libro, MIX, F({ sala: 'Sala 3' }))).toBe(false);
    expect(loteEnFiltro(M.libro, MIX, F({ lote: 'BN' }))).toBe(false);
    expect(loteEnFiltro(M.libro, MIX, F({ lote: MIX }))).toBe(true);
    expect(loteEnFiltro(M.libro, MIX, F({ codigo: 'CA' }))).toBe(false);
    expect(loteEnFiltro(M.libro, MIX, F({ piscina: 'P1' }))).toBe(false);
  });
  it('🔴 🌊 Mareas: con sala cuenta si sus lotes están en ella; con un código, no', () => {
    const d = desovesDiarios(M.fuentes);
    const MAREA = new Map(['2026-09-10', '2026-09-16'].map((f) => [f, { fase: 'Luna llena', ilum: 100, tipo: 'Viva', amplitud: 2 }]));
    const delDia = (o) => Object.fromEntries(desovesYMarea(d, MAREA, o).dias.map((x) => [x.fecha, x.desoves]));
    expect(delDia({})).toEqual({ '2026-09-10': 3, '2026-09-16': 4 });
    expect(delDia({ sala: 'Sala 2' }), 'en la sala de BO está el MIX').toEqual({ '2026-09-10': 0, '2026-09-16': 4 });
    expect(delDia({ sala: 'Sala 1' })).toEqual({ '2026-09-10': 2, '2026-09-16': 4 });
    expect(delDia({ sala: 'Sala 3' }), 'en la sala de BP, no').toEqual({ '2026-09-10': 1, '2026-09-16': 0 });
    expect(delDia({ lote: MIX }), 'sus hembras son las de sus lotes').toEqual({ '2026-09-10': 0, '2026-09-16': 4 });
    expect(delDia({ codigo: 'CA' }), 'con un código, no').toEqual({ '2026-09-10': 2, '2026-09-16': 0 });
  });
  it('🔴 Visitante: sale en el total y en su fila, y en las salas de sus lotes', () => {
    const R = produccionDelMes(PLANTA, P, FOTO);
    expect(R.total.desoves).toBe(7);
    expect(R.lotes.map((l) => l.lote)).toContain(MIX);
    expect(R.salas.find((s) => s.sala === 'Sala 2').desoves).toBe(4);
    expect(R.salas.find((s) => s.sala === 'Sala 3').desoves).toBe(1);
  });
});

describe('🔀 Inf. Supervisor en la vista', () => {
  it('🔴 con un lote elegido se ven también las revisiones de sus MIX, con su nombre', () => {
    const de = (f) => revisionesDeNauplios(M.fuentes, f, P).filas.map((x) => x.lote);
    expect(de(F({ lote: 'BN' }))).toEqual([MIX]);
    expect(de(F({ lote: 'BP' }))).toEqual(['BP']);
    expect(de(F({ lote: 'ZZ' }))).toEqual([]);
    expect(de(SIN).sort()).toEqual(['BP', MIX].sort());
  });
  it('🔴 la mortalidad en desove no se suma a un lote elegido, y se dice aparte', () => {
    const t = (f, p = P) => mortalidadEnDesove(M.fuentes, f, p);
    expect(t(F({ lote: 'BN' })).muertas).toBe(0);
    expect(t(F({ lote: 'BN' })).mix).toEqual([{ lote: MIX, entran: 30, muertas: 9 }]);
    expect(t(SIN).muertas).toBe(9);
    expect(t(SIN).mix, 'sin filtro está en las cifras').toEqual([]);
    expect(t(F({ lote: MIX })).muertas, 'elegido él, son suyas').toBe(9);
    expect(t(F({ lote: MIX })).mix).toEqual([]);
    expect(t(F({ lote: 'BP' })).mix, 'de quien no participa, ni se menciona').toEqual([]);
    expect(t(F({ lote: 'BN' }), { desde: '2026-01-01', hasta: '2026-01-31' }).mix, 'fuera del período, tampoco').toEqual([]);
  });
});

/* A19 (2026-11-04) · lo que quedaba sin decir. El día del MIX, BN tiene además su fila propia: distingue contar sus hembras una vez o dos. */
describe('🔀 A19 · la Tasa de desove, los avisos y las notas', () => {
  const PLANTA2 = [...PLANTA,
    DES('2026-09-16', 'BN', 'CA', 'P1', 1, 100000, 50000, 40000),
    INF('2026-09-12', 'BN', { 'Revisión': 'Entrada', Deformidad: 'Alta', Actividad: 'Baja' }),
    INF('2026-09-17', MIX, { 'Revisión': 'Postlavado', Hongos: 'Presente' }),
  ];
  const M2 = modeloOperativo(PLANTA2, { fecha: FOTO, hoy: FOTO });
  const IX2 = indiceDeFiltro(M2);
  const F2 = (o = {}) => normalizarFiltro(o, IX2);
  const serieDe = (m) => serieDiaria(m.fuentes, sumarDias(P.desde, -1), P.hasta);
  const S1 = serieDe(M), S2 = serieDe(M2);
  const hembras = (s, dia, lote) => s.find((d) => d.fecha === dia).porLote[lote].hembras;
  const evo = (m, s, f, op) => evolucion({ M: m, F: f, periodo: P, serie: s, partes: [], copulas: [], clima: [] }, { agrupar: 'dia', movil: false, eventos: false, ...op });
  const tasaDelDia = (R, dia) => R.series[0].datos[R.tramos.findIndex((t) => t.desde === dia)];
  const dosDec = (x) => Math.round(x * 100) / 100;   // `cociente` da dos decimales

  it('🔴 un día con sólo un MIX tiene Tasa: sus desoves sobre las hembras de sus lotes', () => {
    const R = evo(M, S1, SIN, { a: 'tasaDesove' });
    const h16 = hembras(S1, '2026-09-16', 'BN') + hembras(S1, '2026-09-16', 'BO');
    expect(h16, 'el fixture distingue: BP no participa').toBeLessThan(h16 + hembras(S1, '2026-09-16', 'BP'));
    expect(tasaDelDia(R, '2026-09-16')).toBe(dosDec((4 / h16) * 100));
  });
  it('🔴 el total de la planta lo incluye', () => {
    const R = evo(M, S1, SIN, { a: 'tasaDesove' });
    const h = hembras(S1, '2026-09-10', 'BN') + hembras(S1, '2026-09-10', 'BP') + hembras(S1, '2026-09-16', 'BN') + hembras(S1, '2026-09-16', 'BO');
    expect(R.resumen[0].total).toBe(dosDec((7 / h) * 100));
  });
  it('🔴 un lote con fila propia y en un MIX el mismo día cuenta sus hembras UNA vez', () => {
    const R = evo(M2, S2, F2(), { a: 'tasaDesove' });
    const h16 = hembras(S2, '2026-09-16', 'BN') + hembras(S2, '2026-09-16', 'BO');
    expect(tasaDelDia(R, '2026-09-16')).toBe(dosDec((5 / h16) * 100));
    expect(tasaDelRango(M2.fuentes.desoves, S2).hembras, 'el 10/09 BN y BP; el 16/09 BN y BO').toBe(hembras(S2, '2026-09-10', 'BN') + hembras(S2, '2026-09-10', 'BP') + h16);
  });
  it('🔴 con un lote elegido el MIX sigue fuera; elegido él, es lo suyo', () => {
    expect(tasaDelDia(evo(M2, S2, F2({ lote: 'BN' }), { a: 'tasaDesove' }), '2026-09-16')).toBe(dosDec((1 / hembras(S2, '2026-09-16', 'BN')) * 100));
    expect(tasaDelDia(evo(M, S1, F({ lote: 'BN' }), { a: 'tasaDesove' }), '2026-09-16')).toBeNull();
    expect(tasaDelDia(evo(M, S1, F({ lote: MIX }), { a: 'tasaDesove' }), '2026-09-16')).toBe(dosDec((4 / (hembras(S1, '2026-09-16', 'BN') + hembras(S1, '2026-09-16', 'BO'))) * 100));
  });
  it('🔴 `tasaDeDesove` da las hembras de sus lotes en la fila del MIX, y las de un lote suelto no cambian', () => {
    const t = tasaDeDesove(M.fuentes.desoves, S1);
    expect(t.find((x) => x.lote === MIX).hembras).toBe(hembras(S1, '2026-09-16', 'BN') + hembras(S1, '2026-09-16', 'BO'));
    expect(t.find((x) => x.lote === 'BP').hembras).toBe(hembras(S1, '2026-09-10', 'BP'));
  });
  it('🔴 sin un MIX, `tasaDelRango` es Σ ÷ Σ de `tasaDeDesove`, y un día sin hembras no cuenta', () => {
    const filas = M.fuentes.desoves.filter((r) => r.Lote !== MIX);
    const t = tasaDeDesove(filas, S1);
    const r = tasaDelRango(filas, S1);
    expect(r.desoves).toBe(t.reduce((a, x) => a + x.desoves, 0));
    expect(r.hembras).toBe(t.reduce((a, x) => a + x.hembras, 0));
    expect(tasaDelRango(M.fuentes.desoves, [])).toEqual({ desoves: 0, hembras: 0, tasa: '' });
  });

  describe('la nota de 📈 Evolución y su Excel', () => {
    const notas = (f, op = { a: 'desoves' }) => evo(M, S1, f, op).notas.join(' | ');
    it('🔴 con un lote suyo dice lo que falta, con sus cifras', () => {
      expect(notas(F({ lote: 'BN' }))).toContain('No incluye ' + MIX + ' (4 desove(s)');
      expect(notas(F({ codigo: 'CA' }))).toContain('No incluye ' + MIX);
    });
    it('🔴 en total, con otro lote o con él mismo elegido, no', () => {
      for (const f of [SIN, F({ lote: 'BP' }), F({ lote: MIX })]) expect(notas(f)).not.toContain('No incluye');
    });
    it('🔴 comparando: si es una línea, no se repite; si no, sí, y una sola vez', () => {
      const cmp = (elegidos) => notas(SIN, { a: 'desoves', comparar: 'lote', elegidos });
      expect(cmp(['BN', MIX])).not.toContain('No incluye');
      expect(cmp(['BN', 'BO']).split('No incluye').length, 'BN y BO participan: una sola nota').toBe(2);
    });
    it('🔴 una variable que no sale de los desoves ni lo nombra, salvo si se eligió el MIX', () => {
      expect(notas(F({ lote: 'BN' }), { a: 'vivos' })).not.toContain(MIX);
      expect(notas(F({ lote: MIX }), { a: 'vivos' })).toContain(MIX + ' no tiene animales propios');
      expect(notas(F({ lote: MIX }), { a: 'desoves' })).not.toContain('no tiene animales propios');
      expect(notas(F({ lote: 'BN' }), { a: 'climaTemp' })).not.toContain(MIX);
      expect(notas(F({ lote: MIX }), { a: 'climaTemp' }), 'el clima no se separa por lote: no va de eso').not.toContain(MIX);
    });
    ['desoves', 'tasaDesove', 'huevosPorDesove', 'fertilidad', 'n5', 'n5PorDesove', 'alimentoPorN5'].forEach((a) => {
      it(`🔴 ${a} sale de los desoves: lo dice`, () => {
        expect(notas(F({ lote: 'BN' }), { a })).toContain('No incluye ' + MIX);
      });
    });
    it('🔴 la nota llega al Excel', () => {
      const h = hojasDeEvolucion(evo(M, S1, F({ lote: 'BN' }), { a: 'desoves' }), {}).find((x) => x.nombre === 'Filtros y notas');
      expect(h.aoa.flat().join(' ')).toContain('No incluye ' + MIX);
    });
  });

  describe('elegir el propio MIX y su código o su origen', () => {
    const fila = { Lote: MIX, 'Código genético': 'CA/CB' };
    it('🔴 su código no lo saca: la tarjeta, la tabla y 📈 Evolución dan lo suyo', () => {
      const f = F({ lote: MIX, codigo: 'CA/CB' });
      expect(desoveEnCodigo(fila, f)).toBe(true);
      expect(kpiReproduccion(M.fuentes.desoves, P, f).desoves).toBe(4);
      expect(tablaDeReproduccion(M, P, f).map((x) => x.lote)).toEqual([MIX]);
      expect(evo(M, S1, f, { a: 'desoves' }).resumen[0].total).toBe(4);
      expect(mixAparte(M.fuentes.desoves, P, f), 'no se repite aparte').toEqual([]);
    });
    it('🔴 un código que no es suyo sí lo saca, y sin elegirlo un código tampoco lo alcanza', () => {
      expect(kpiReproduccion(M.fuentes.desoves, P, F({ lote: MIX, codigo: 'CC' })).desoves).toBe(0);
      expect(desoveEnCodigo(fila, F({ codigo: 'CA' }))).toBe(false);
      expect(desoveEnCodigo(fila, F({ lote: 'BN', codigo: 'CA' }))).toBe(false);
    });
    it('🔴 su origen: la piscina de uno de sus lotes no lo saca; otra, sí', () => {
      expect(kpiReproduccion(M.fuentes.desoves, P, F({ lote: MIX, piscina: 'P1' })).desoves).toBe(4);
      expect(kpiReproduccion(M.fuentes.desoves, P, F({ lote: MIX, piscina: 'P3' })).desoves).toBe(0);
      expect(kpiReproduccion(M.fuentes.desoves, P, F({ piscina: 'P1' })).desoves, 'sin elegirlo, no es de la piscina').toBe(2);
    });
    it('🔴 `loteEnFiltro`: elegido él, se mira en las posiciones de sus lotes', () => {
      expect(loteEnFiltro(M.libro, MIX, F({ lote: MIX, codigo: 'CA/CB' }))).toBe(true);
      expect(loteEnFiltro(M.libro, MIX, F({ lote: MIX, codigo: 'CC' }))).toBe(false);
      expect(loteEnFiltro(M.libro, MIX, F({ lote: MIX, piscina: 'P1' }))).toBe(true);
      expect(loteEnFiltro(M.libro, MIX, F({ lote: MIX, piscina: 'P3' }))).toBe(false);
    });
    it('🔴 🌊 Mareas igual', () => {
      const d = desovesDiarios(M.fuentes);
      const MAREA = new Map([['2026-09-16', { fase: 'Luna llena', ilum: 100, tipo: 'Viva', amplitud: 2 }]]);
      const delDia = (o) => (desovesYMarea(d, MAREA, o).dias.find((x) => x.fecha === '2026-09-16') || {}).desoves;
      expect(delDia({ lote: MIX, codigo: 'CA/CB' })).toBe(4);
      expect(delDia({ lote: 'BN', codigo: 'CA' })).toBe(0);
    });
    it('🔴 el aviso: sólo con un MIX elegido, y nombrándolo', () => {
      expect(avisoDeMixElegido(F({ lote: MIX }))).toContain(MIX + ': un MIX no tiene animales propios');
      expect(avisoDeMixElegido(F({ lote: ['BN', MIX] }))).toContain(MIX);
      expect(avisoDeMixElegido(F({ lote: 'BN' }))).toBe('');
      expect(avisoDeMixElegido(SIN)).toBe('');
      expect(avisoDeMixElegido(undefined)).toBe('');
    });
  });

  describe('🔍 Revisiones: la de un MIX va aparte', () => {
    const r = (f) => revisionesDeNauplios(M2.fuentes, f, P);
    it('🔴 con un lote elegido no es «la última» ni la de su etapa, aunque sea más reciente', () => {
      const x = r(F2({ lote: 'BN' }));
      expect(x.filas[0].lote, 'la más reciente es la del MIX').toBe(MIX);
      expect(x.ultima.lote).toBe('BN');
      expect(x.porEtapa.find((e) => e.etapa === 'Entrada').ultima.lote).toBe('BN');
      expect(x.porEtapa.find((e) => e.etapa === 'Lavado').ultima, 'sólo la tiene el MIX').toBeNull();
    });
    it('🔴 sigue en el historial, y su aviso se dice aparte', () => {
      const x = r(F2({ lote: 'BN' }));
      expect(x.filas.map((f) => f.lote)).toEqual([MIX, MIX, 'BN']);
      expect(x.mix.map((f) => f.etapa).sort()).toEqual(['Lavado', 'Postlavado']);
      expect(x.avisos, 'el lote no trae ninguno').toEqual([]);
      expect(x.mixAvisos.map((f) => f.etapa)).toEqual(['Postlavado']);
    });
    it('🔴 sin filtro, o con el propio MIX elegido, es suya y cuenta como siempre', () => {
      for (const f of [F2(), F2({ lote: MIX })]) {
        const x = r(f);
        expect(x.ultima.lote).toBe(MIX);
        expect(x.avisos.map((a) => a.lote)).toEqual([MIX]);
        expect(x.mix).toEqual([]);
        expect(x.mixAvisos).toEqual([]);
      }
    });
  });

  it('🔴 📊 Comparativa: ninguna fila lleva el MIX, y se dice, con o sin filtro; sólo el que tiene algo de lo filtrado', () => {
    const mix = (f, p = P, dim = 'lote') => comparativa(M, f, p, dim).mix.map((m) => m.lote);
    expect(comparativa(M, SIN, P, 'lote').filas.map((x) => x.origen)).not.toContain(MIX);
    expect(comparativa(M, SIN, P, 'lote').mix).toEqual([{ lote: MIX, desoves: 4, huevos: 700000, n2: 500000, n5: 300000 }]);
    expect(mix(F({ lote: 'BN' }))).toEqual([MIX]);
    expect(mix(F({ lote: MIX })), 'elegido, tampoco va en una fila').toEqual([MIX]);
    expect(mix(F({ sala: 'Sala 2' })), 'en la sala de uno de sus lotes').toEqual([MIX]);
    expect(mix(F({ lote: 'BP' }))).toEqual([]);
    expect(mix(F({ sala: 'Sala 3' })), 'en una sala sin sus lotes').toEqual([]);
    expect(mix(SIN, { desde: '2026-01-01', hasta: '2026-01-31' })).toEqual([]);
    expect(mix(SIN, P, 'codigo')).toEqual([MIX]);
    expect(mix(SIN, P, 'piscina')).toEqual([MIX]);
  });

  it('🔴 🩺 el cruce con 🧬 Microchips: la hoja de Desoves no suma el MIX al lote, y lo dice', () => {
    const repro = (lote) => ({ females: [{ estado: 'Vivo', lote, codigo: lote === 'BN' ? 'CA' : 'CC', sala: 'Sala 1', tanque: 1, trovan: 'X1' }], desoves: [], mortalidades: [], byTrovan: new Map(), movByTrovan: new Map() });
    const conBN = cruceConMicrochips(repro('BN'), M.libro, M.fuentes, P, SIN);
    expect(conBN.desoves.find((d) => d.lote === 'BN').operativo).toBe(2);
    expect(conBN.mix).toEqual([{ lote: MIX, desoves: 4, huevos: 700000, n2: 500000, n5: 300000 }]);
    expect(cruceConMicrochips(repro('BP'), M.libro, M.fuentes, P, SIN).mix, 'BP no participa').toEqual([]);
    expect(cruceConMicrochips(repro('BN'), M.libro, M.fuentes, { desde: '2026-01-01', hasta: '2026-01-31' }, SIN).mix).toEqual([]);
  });

  it('🔴 🌊 Mareas: con un lote o un código suyos dice lo que deja fuera; si no, nada', () => {
    const d = desovesDiarios(M.fuentes);
    const MAREA = new Map([['2026-09-16', { fase: 'Luna llena', ilum: 100, tipo: 'Viva', amplitud: 2 }]]);
    const mix = (o) => desovesYMarea(d, MAREA, o).mix;
    const fuera = [{ lote: MIX, desoves: 4 }];
    expect(mix({ lote: 'BN' })).toEqual(fuera);
    expect(mix({ lote: 'BO' })).toEqual(fuera);
    expect(mix({ codigo: 'CA' })).toEqual(fuera);
    expect(mix({})).toEqual([]);
    expect(mix({ sala: 'Sala 1' }), 'con sólo la sala está en las cifras').toEqual([]);
    expect(mix({ lote: MIX })).toEqual([]);
    expect(mix({ lote: 'BP' })).toEqual([]);
    expect(mix({ codigo: 'CC' })).toEqual([]);
    expect(mix({ lote: 'BN', codigo: 'CC' }), 'tiene que casar en los dos').toEqual([]);
    expect(mix({ lote: 'BN', sala: 'Sala 2' }), 'BN no está en esa sala').toEqual([]);
    expect(mix({ lote: 'BN', mes: '2026-08' }), 'otro mes').toEqual([]);
  });

  it('🔴 🌊 Mareas con sala y código: sólo si sus lotes están en esa sala (BQ comparte el código en otra sala)', () => {
    const m = modeloOperativo([...PLANTA, ING('2026-08-01', 'BQ', 'Sala 3', 2, 40, 'CA', 'P1')], { fecha: FOTO, hoy: FOTO });
    const d = desovesDiarios(m.fuentes);
    const MAREA = new Map([['2026-09-16', { fase: 'Luna llena', ilum: 100, tipo: 'Viva', amplitud: 2 }]]);
    const mix = (o) => desovesYMarea(d, MAREA, o).mix;
    expect(mix({ sala: 'Sala 1', codigo: 'CA' })).toEqual([{ lote: MIX, desoves: 4 }]);
    expect(mix({ sala: 'Sala 3', codigo: 'CA' })).toEqual([]);
  });

  it('🔴 la mortalidad: una fila del MIX sólo con la temperatura no es un registro, y tampoco se dice aparte', () => {
    const m = modeloOperativo([...PLANTA.filter((r) => r['Tipo de tanque'] !== 'Desove'),
      INF('2026-09-16', MIX, { 'Tipo de tanque': 'Desove', 'Temperatura tanque desove': 30 })], { fecha: FOTO, hoy: FOTO });
    expect(mortalidadEnDesove(m.fuentes, F({ lote: 'BN' }), P).mix).toEqual([]);
  });
});

/* A18 (2026-11-04) · «en desove» sale del libro: sus filas dicen `MIX(BN,BO)`, y sólo el libro sabe qué parte es de cada lote (BN tiene el doble de hembras que BO). */
describe('🔀 A18 · 💀 Bajas por lote: su parte de un MIX', () => {
  const des = (f = SIN, p = P) => desgloseDeBajas(M, serieDiaria(M.fuentes, sumarDias(p.desde, -1), p.hasta), [], f, p, 'lote');
  const de = (d, lote) => d.filas.find((x) => x.clave === lote);
  it('🔴 «en desove» lleva su parte, igual que sus muertes naturales', () => {
    const d = des();
    expect([de(d, 'BN').natural.hembras, de(d, 'BN').desove]).toEqual([6, 6]);
    expect([de(d, 'BO').natural.hembras, de(d, 'BO').desove]).toEqual([3, 3]);
    expect(de(d, 'BP'), 'BP no participa').toBeUndefined();
    expect(d.desove).toBe(9);
  });
  it('🔴 sólo lo del período: el MIX del 16/09 no cuenta en un período posterior', () => {
    const d = des(SIN, { desde: '2026-09-17', hasta: FOTO });
    expect(d.desove).toBe(0);
    expect(d.filas).toEqual([]);
  });
  it('🔴 con un lote elegido, el suyo', () => {
    const d = des(F({ lote: 'BO' }));
    expect(d.filas.map((x) => x.clave)).toEqual(['BO']);
    expect(d.desove).toBe(3);
  });
  it('🔴 también cuenta recuperación', () => {
    const m = modeloOperativo([...PLANTA, INF('2026-09-17', 'BP', { 'Tipo de tanque': 'Recuperación', 'Hembras que entran': 10, 'Hembras muertas': 2 })], { fecha: FOTO, hoy: FOTO });
    const d = desgloseDeBajas(m, serieDiaria(m.fuentes, sumarDias(P.desde, -1), P.hasta), [], SIN, P, 'lote');
    expect(d.filas.find((x) => x.clave === 'BP').desove).toBe(2);
  });
});
