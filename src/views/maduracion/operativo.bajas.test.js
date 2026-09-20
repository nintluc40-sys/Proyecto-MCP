/* ============================================================
   MADURACIÓN · OPERATIVO — BAJAS (F3.1)

   Qué se exige, con fixtures que distinguen lo correcto de lo equivocado:
   · La muerte natural y el descarte se SUMAN (son columnas disjuntas de la hoja). Si una se dedujera de la otra,
     los totales darían otro número.
   · Cada agrupación lee de donde puede: por sala/tanque, los partes registrados; por lote, los acumulados del
     libro. Y por eso NO dan lo mismo: los 4 muertos en tanques de desove sólo aparecen por lote.
   · Lo que una agrupación no puede filtrar lo DICE (`ignora`) en vez de enseñar la cifra de otra cosa.
   · La hora agrupa por HORA ENTERA (los partes son rondas), y lo que no la trae se cuenta aparte.
   · El calor distingue «no se registró» (null) de «se registró y no murió ninguno» (0).
   · La DIFERENCIA de un cierre se LEE de los avisos del libro; no se recalcula.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  DIMENSIONES_BAJAS, desgloseDeBajas, motivosDeCierre, bajasPorHora, calorSalaDia, lotesCerrados,
} from './operativo.bajas.js';
import { modeloOperativo, serieDiaria, diasDeTanque } from './operativo.data.js';
import { normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { sumarDias } from '../registros/lib/mad-libro.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg = 'CA') => ({ _SheetOrigin: O, 'Camaronera origen': 'CX',
  Fecha: fecha, Lote: lote, 'Código genético': cg, 'Piscina Broodstock': 'P1', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, hora, parte, mm, hm, md, hd) => ({ _SheetOrigin: O, Fecha: fecha, Sala: sala, Tanque: tanque,
  Hora: hora, Parte: parte, 'Machos muertos': mm, 'Hembras muertas': hm,
  'Machos muertos por descarte de selección': md, 'Hembras muertas por descarte de selección': hd });
const MORT = (fecha, lote, clase, entran, muertas) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote,
  'Tipo de tanque': clase, 'Hembras que entran': entran, 'Hembras muertas': muertas });
const FIN = (fecha, lote, tipo, motivo, machos, hembras, extra) => ({ _SheetOrigin: O, 'Metabisulfito (kg)': '',
  Fecha: fecha, Lote: lote, Tipo: tipo, Motivo: motivo, Machos: machos, Hembras: hembras, ...extra });

const FOTO = '2026-09-20';

/* La planta de las pruebas:
   · Sala 3 t1 — LA (100♂ 100♀). Dos partes el 10/09 (06:00 y 18:30) y 4 hembras muertas desovando el 13/09.
   · Sala 3 t2 — LB ( 50♂  50♀). Un parte el 11/09 (06:15) y un cierre TOTAL el 15/09 que deja diferencia.
   · Sala 4 t1 — LC ( 30♂  30♀). Un parte el 12/09 SIN hora, y un cierre PARCIAL el 14/09. */
const PLANTA = [
  ING('2026-09-01', 'LA', 'Sala 3', 1, 100, 100),
  ING('2026-09-01', 'LB', 'Sala 3', 2, 50, 50),
  ING('2026-09-01', 'LC', 'Sala 4', 1, 30, 30),
  TQ('2026-09-10', 'Sala 3', 1, '06:00', 1, 10, 6, 4, 2),
  TQ('2026-09-10', 'Sala 3', 1, '18:30', 2, 2, 1, 0, 0),
  TQ('2026-09-11', 'Sala 3', 2, '06:15', 1, 5, 5, 1, 1),
  TQ('2026-09-12', 'Sala 4', 1, '', 1, 3, 3, 0, 0),
  MORT('2026-09-13', 'LA', 'Desove', 20, 4),
  FIN('2026-09-14', 'LC', 'Parcial', 'Pedido', 10, 0),
  FIN('2026-09-15', 'LB', 'Total', 'Fin de vida útil', 20, 20, { 'Metabisulfito (kg)': 5, Rojos: 3 }),
];

const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const P30 = periodoDe('30d', FOTO, M.fuentes);
const SERIE = serieDiaria(M.fuentes, sumarDias(P30.desde, -1), P30.hasta);
const PARTES = diasDeTanque(M.fuentes.tanques);
const SIN = normalizarFiltro({});
const F = (o) => normalizarFiltro(o);
const des = (dim, f = SIN, p = P30) => desgloseDeBajas(M, SERIE, PARTES, f, p, dim);

describe('Maduración · bajas · el desglose cruzado', () => {
  it('las tres agrupaciones, y una desconocida cae en «sala»', () => {
    expect(DIMENSIONES_BAJAS.map((d) => d.clave)).toEqual(['sala', 'tanque', 'lote']);
    expect(des('otra').dimension).toBe('sala');
  });

  it('🔴 la muerte natural y el descarte se SUMAN: son columnas disjuntas de la hoja', () => {
    const d = des('sala');
    expect(d.modo).toBe('registradas');
    const s3 = d.filas.find((f) => f.clave === 'Sala 3');
    // 10+2+5 ♂ y 6+1+5 ♀ muertos; 4+1 ♂ y 2+1 ♀ descartados. Si uno estuviera dentro del otro, no sumarían 37.
    expect(s3.natural).toEqual({ machos: 17, hembras: 12, total: 29 });
    expect(s3.descarte).toEqual({ machos: 5, hembras: 3, total: 8 });
    expect(s3.total).toBe(37);
    expect(d.totales.natural).toEqual({ machos: 20, hembras: 15, total: 35 });
    expect(d.totales.descarte).toEqual({ machos: 5, hembras: 3, total: 8 });
    expect(d.totales.total).toBe(43);
    expect(d.totales.pctDescarte).toBe(18.6);
  });

  it('las filas van de mayor a menor, y el `pct` es su parte del total (no una tasa)', () => {
    const d = des('sala');
    expect(d.filas.map((f) => [f.clave, f.total])).toEqual([['Sala 3', 37], ['Sala 4', 6]]);
    expect(d.filas[0].pct).toBe(86.05);
    expect(d.filas[1].pct).toBe(13.95);
  });

  it('por TANQUE separa los tanques de la misma sala', () => {
    expect(des('tanque').filas.map((f) => [f.clave, f.total])).toEqual([['Sala 3|1', 25], ['Sala 3|2', 12], ['Sala 4|1', 6]]);
  });

  it('🔴 por LOTE lee el LIBRO, y por eso NO da lo mismo: las muertes en desove sólo aparecen ahí', () => {
    const d = des('lote');
    expect(d.modo).toBe('libro');
    const la = d.filas.find((f) => f.clave === 'LA');
    // 12 ♂ y 7 ♀ del tanque MÁS las 4 hembras que murieron desovando, que el libro suma a `muertos`.
    expect(la.natural).toEqual({ machos: 12, hembras: 11, total: 23 });
    expect(la.descarte).toEqual({ machos: 4, hembras: 2, total: 6 });
    expect(la.desove).toBe(4);
    expect(d.filas.map((f) => [f.clave, f.total])).toEqual([['LA', 29], ['LB', 12], ['LC', 6]]);
    // 47 por lote frente a 43 por sala: la diferencia son exactamente las 4 de desove.
    expect(d.totales.total).toBe(47);
    expect(d.totales.total - des('sala').totales.total).toBe(d.desove);
  });

  it('🔴 lo que una agrupación NO puede filtrar lo dice, en vez de enseñar otra cosa', () => {
    expect(des('sala', F({ lote: 'LA' })).ignora).toEqual(['lote']);
    expect(des('tanque', F({ codigo: 'CA' })).ignora).toEqual(['código genético']);
    expect(des('lote', F({ sala: 'Sala 3', tanque: 1 })).ignora).toEqual(['sala', 'tanque']);
    expect(des('sala', SIN).ignora).toEqual([]);
    // Y lo que SÍ puede, lo aplica.
    expect(des('sala', F({ sala: 'Sala 4' })).filas.map((f) => f.clave)).toEqual(['Sala 4']);
    expect(des('lote', F({ lote: 'LB' })).filas.map((f) => f.clave)).toEqual(['LB']);
  });

  it('🔴 por lote el período RESTA la víspera: lo ocurrido ANTES no cuenta', () => {
    const p7 = periodoDe('7d', FOTO, M.fuentes);            // 14/09 – 20/09
    const serie7 = serieDiaria(M.fuentes, sumarDias(p7.desde, -1), p7.hasta);
    /* Los partes son del 10, 11 y 12 y el desove del 13: TODO queda fuera. Si no se restara el acumulado de la
       víspera, saldrían las cifras de siempre y esto se pondría rojo. */
    expect(desgloseDeBajas(M, serie7, PARTES, SIN, p7, 'lote').filas).toEqual([]);
    expect(des('sala', SIN, p7).filas).toEqual([]);
  });

  it('sin la víspera en la serie, por lote no inventa cifras: lo dice', () => {
    const corta = serieDiaria(M.fuentes, P30.desde, P30.hasta);   // empieza en el primer día, sin víspera
    expect(desgloseDeBajas(M, corta, PARTES, SIN, P30, 'lote').modo).toBe('sin-serie');
  });
});

describe('Maduración · bajas · los motivos de Fin de Ciclo', () => {
  it('ordenados de mayor a menor con su acumulado, y con su metabisulfito', () => {
    const m = motivosDeCierre(M.fuentes, P30, SIN);
    expect(m.filas.map((f) => [f.motivo, f.total])).toEqual([['Fin de vida útil', 40], ['Pedido', 10]]);
    expect(m.filas[0]).toMatchObject({ cierres: 1, totales: 1, parciales: 0, machos: 20, hembras: 20, rojos: 3, metabisulfito: 5 });
    expect(m.filas[0].acumulado).toBe(80);
    expect(m.filas[1].acumulado).toBe(100);
    expect(m.filas[0].enCatalogo).toBe(true);
    expect(m.total).toBe(50);
    expect(m.cierres).toBe(2);
    expect(m.metabisulfito).toBe(5);
  });

  it('un motivo que NO está en el catálogo se enseña igual, rotulado', () => {
    const conRaro = modeloOperativo([...PLANTA, FIN('2026-09-16', 'LA', 'Parcial', 'Se escapó', 1, 1)], { hoy: FOTO, fecha: FOTO });
    const m = motivosDeCierre(conRaro.fuentes, P30, SIN);
    expect(m.filas.find((f) => f.motivo === 'Se escapó').enCatalogo).toBe(false);
    expect(m.filas.find((f) => f.motivo === 'Fin de vida útil').enCatalogo).toBe(true);
  });

  it('sin cierres, todo vacío y sin lanzar (es lo que hay en producción hoy)', () => {
    const vacio = motivosDeCierre({ cierres: [] }, P30, SIN);
    expect(vacio).toEqual({ filas: [], total: 0, cierres: 0, metabisulfito: 0 });
  });
});

describe('Maduración · bajas · la distribución por hora', () => {
  it('🔴 agrupa por HORA ENTERA y lo que no trae hora se cuenta APARTE, no en una hora inventada', () => {
    const h = bajasPorHora(M.fuentes, P30, SIN);
    // 06:00 y 06:15 caen las dos en la hora 06; 18:30 en la 18; el parte sin hora, fuera.
    expect(h.horas.map((x) => [x.hora, x.total, x.partes])).toEqual([['06', 34, 2], ['18', 3, 1]]);
    expect(h.sinHora).toBe(6);
    expect(h.total).toBe(37);
    expect(h.pico).toBe('06');
    expect(h.registros).toBe(4);
    expect(h.horas[0].natural).toEqual({ machos: 15, hembras: 11, total: 26 });
    expect(h.horas[0].descarte).toEqual({ machos: 5, hembras: 3, total: 8 });
  });

  it('honra sala y tanque, y dice lo que no puede honrar', () => {
    expect(bajasPorHora(M.fuentes, P30, F({ sala: 'Sala 4' })).sinHora).toBe(6);
    expect(bajasPorHora(M.fuentes, P30, F({ sala: 'Sala 4' })).horas).toEqual([]);
    expect(bajasPorHora(M.fuentes, P30, F({ sala: 'Sala 3', tanque: 2 })).horas.map((x) => x.hora)).toEqual(['06']);
    expect(bajasPorHora(M.fuentes, P30, F({ lote: 'LA' })).ignora).toEqual(['lote']);
  });
});

describe('Maduración · bajas · el mapa de calor', () => {
  it('🔴 distingue «no se registró» (null) de «registrado sin bajas» (0)', () => {
    const c = calorSalaDia(PARTES, SIN, P30);
    expect(c.dias).toHaveLength(30);
    expect(c.dias[0]).toBe('2026-08-22');
    expect(c.dias[29]).toBe(FOTO);
    const s3 = c.salas.find((s) => s.sala === 'Sala 3');
    const i = (f) => c.dias.indexOf(f);
    expect(s3.valores[i('2026-09-10')]).toBe(25);
    expect(s3.valores[i('2026-09-11')]).toBe(12);
    expect(s3.valores[i('2026-09-09')]).toBe(null);      // no hubo parte: null, no 0
    expect(s3.total).toBe(37);
    expect(c.max).toBe(25);
    // Un parte registrado SIN bajas es un cero, no un hueco.
    const conCero = calorSalaDia(diasDeTanque([...M.fuentes.tanques, { Fecha: '2026-09-09', Sala: 'Sala 3', Tanque: 1, 'Machos muertos': 0 }]), SIN, P30);
    expect(conCero.salas.find((s) => s.sala === 'Sala 3').valores[i('2026-09-09')]).toBe(0);
  });

  it('las salas van en orden y el filtro de sala las acota', () => {
    expect(calorSalaDia(PARTES, SIN, P30).salas.map((s) => s.sala)).toEqual(['Sala 3', 'Sala 4']);
    expect(calorSalaDia(PARTES, F({ sala: 'Sala 4' }), P30).salas.map((s) => s.sala)).toEqual(['Sala 4']);
  });
});

describe('Maduración · bajas · los lotes cerrados', () => {
  it('🔴 la DIFERENCIA se lee de los avisos del libro, no se recalcula', () => {
    const l = lotesCerrados(M, SIN, P30);
    expect(l.map((x) => [x.fecha, x.lote, x.tipo])).toEqual([['2026-09-15', 'LB', 'Total'], ['2026-09-14', 'LC', 'Parcial']]);
    const lb = l[0];
    // LB tenía 44/44 al cerrarse (50 − 5 muertos − 1 descarte por sexo) y salieron 20/20: sobran 24 y 24.
    expect(lb.salida).toEqual({ machos: 20, hembras: 20, total: 40 });
    expect(lb.diferencia).toEqual({ machos: 24, hembras: 24, total: 48 });
    expect(lb).toMatchObject({ motivo: 'Fin de vida útil', rojos: 3, metabisulfito: 5 });
    // Un cierre PARCIAL no deja diferencia: el libro sólo la anota al cerrar del todo.
    expect(l[1].diferencia).toEqual({ machos: 0, hembras: 0, total: 0 });
    expect(l[1].metabisulfito).toBe(null);
  });

  it('honra el filtro de lote, y sin cierres devuelve una lista vacía', () => {
    expect(lotesCerrados(M, F({ lote: 'LB' }), P30).map((x) => x.lote)).toEqual(['LB']);
    expect(lotesCerrados({ libro: { avisos: [] }, fuentes: { cierres: [] } }, SIN, P30)).toEqual([]);
  });
});
