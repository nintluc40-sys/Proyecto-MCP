/* ============================================================
   MADURACIÓN · OPERATIVO — las ZONAS de desove y los reservorios (2026-10-27, Sesión A ronda 9, tarea 2)

   Filas ficticias con la forma de `M.fuentes.zonas` (fecha ISO). Lo que se guarda: el catálogo es el de la grilla de
   captura (MAD_ZONAS de engine.js), las lecturas de un día en el orden de la grilla con el estado de cada toma frente al
   umbral de la SALA, una fila repetida no pisa con un vacío ni cuenta dos veces, el resumen del período y los días con
   lectura.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZONAS, HORAS_TEMP, HORAS_OX, zonasDelDia, zonasDelPeriodo, diasConZonas, rotuloTanque } from './operativo.zonas.js';
import { umbralVigente } from './operativo.umbrales.js';

const Z = (fecha, zona, tanque, lect = {}) => ({ Fecha: fecha, Zona: zona, Tanque: tanque === '' ? '' : String(tanque), ...lect });
const MAS = 'Sala desove (masivos)', E1 = 'Sala desove/eclosión 1', R1 = 'Reservorio 1';

describe('el catálogo', () => {
  it('es el de la grilla de captura: MAD_ZONAS de engine.js, en su orden', () => {
    const src = readFileSync(join(process.cwd(), 'public/registros/engine.js'), 'utf8');
    const bloque = src.match(/const MAD_ZONAS = \[([\s\S]*?)\];/)[1];
    const deEngine = [...bloque.matchAll(/zona:\s*"([^"]+)",\s*tanques:\s*(\d+)/g)].map((m) => ({ zona: m[1], tanques: +m[2] }));
    expect(deEngine).toHaveLength(5);
    expect(ZONAS).toEqual(deEngine);
  });
  it('las horas de las tomas son las de la sala: 12 de temperatura (2:00 … 0:00) y 4 de O₂', () => {
    expect(HORAS_TEMP).toEqual(['2:00', '4:00', '6:00', '8:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00', '0:00']);
    expect(HORAS_OX).toEqual(['06:00', '12:00', '18:00', '00:00']);
  });
});

describe('las lecturas de UN día', () => {
  /* los umbrales de la sala, los vigentes (bibliográficos mientras el laboratorio no ponga los suyos) */
  const T = umbralVigente('temperatura'), O2 = umbralVigente('oxigeno');
  const bajoT = T.min - 0.5, okT = T.min, altoT = T.max + 1, bajoO = O2.min - 0.5, okO = O2.min + 1;

  const filas = [
    Z('2026-09-19', R1, '', { 'Temperatura 2:00': String(okT), 'Oxígeno 06:00': String(okO) }),
    Z('2026-09-19', E1, 2, { 'Temperatura 6:00': String(altoT) }),
    Z('2026-09-19', MAS, 3, { 'Temperatura 2:00': String(bajoT), 'Oxígeno 00:00': String(bajoO) }),
    Z('2026-09-19', MAS, 1, { 'Temperatura 0:00': String(okT) }),
    Z('2026-09-19', MAS, 4, {}),                                                // sin ninguna lectura: no sale
    Z('2026-09-18', MAS, 1, { 'Temperatura 2:00': '99' }),                      // otro día
    Z('2026-09-19', 'Zona nueva', 1, { 'Temperatura 2:00': String(okT) }),       // fuera del catálogo: detrás
  ];

  it('una fila por zona y tanque con alguna lectura, en el orden de la grilla (lo que no está en el catálogo, detrás)', () => {
    expect(zonasDelDia(filas, '2026-09-19').map((z) => z.zona + ' · ' + rotuloTanque(z)))
      .toEqual([`${MAS} · Tanque 1`, `${MAS} · Tanque 3`, `${E1} · Tanque 2`, `${R1} · toda el área`, 'Zona nueva · Tanque 1']);
  });

  it('cada toma en su hora, con su estado frente al umbral de la SALA', () => {
    const d = zonasDelDia(filas, '2026-09-19');
    const t3 = d.find((z) => z.zona === MAS && z.tanque === 3);
    expect(t3.temp[0]).toBe(bajoT);
    expect(t3.estTemp[0]).toBe('bajo');
    expect(t3.estTemp.slice(1)).toEqual(Array(11).fill(''));
    expect(t3.ox[3]).toBe(bajoO);
    expect(t3.estOx).toEqual(['', '', '', 'bajo']);
    expect(d.find((z) => z.zona === MAS && z.tanque === 1)).toMatchObject({ temp: [...Array(11).fill(null), okT] });
    expect(d.find((z) => z.zona === E1).estTemp[2]).toBe('alto');
    expect(d.find((z) => z.zona === R1)).toMatchObject({ tanque: '', estTemp: ['ok', ...Array(11).fill('')], estOx: ['ok', '', '', ''] });
  });

  it('una (zona, tanque) repetida el mismo día: cada toma, la ÚLTIMA que la trae (un vacío no borra)', () => {
    const d = zonasDelDia([
      Z('2026-09-19', MAS, 1, { 'Temperatura 2:00': '28', 'Temperatura 4:00': '28.2' }),
      Z('2026-09-19', MAS, 1, { 'Temperatura 2:00': '28.6', 'Temperatura 4:00': '' }),
    ], '2026-09-19');
    expect(d).toHaveLength(1);
    expect(d[0].temp.slice(0, 2)).toEqual([28.6, 28.2]);
  });

  it('un día sin lecturas, vacío; y lo que no es número, sin lectura', () => {
    expect(zonasDelDia(filas, '2026-09-17')).toEqual([]);
    expect(zonasDelDia([Z('2026-09-19', MAS, 1, { 'Temperatura 2:00': 'n/a' })], '2026-09-19')).toEqual([]);
  });
});

describe('el período', () => {
  const filas = [
    Z('2026-09-17', MAS, 1, { 'Temperatura 2:00': '27', 'Temperatura 4:00': '29.5' }),
    Z('2026-09-18', MAS, 1, { 'Temperatura 2:00': '28.5', 'Oxígeno 06:00': '5' }),
    Z('2026-09-18', MAS, 1, { 'Temperatura 2:00': '28.5' }),          // repetida: no cuenta dos veces
    Z('2026-09-19', MAS, 1, { 'Oxígeno 12:00': '3' }),
    Z('2026-09-10', MAS, 1, { 'Temperatura 2:00': '40' }),            // fuera del período
    Z('2026-09-18', R1, '', { 'Temperatura 2:00': '28' }),
    Z('2026-09-18', E1, 1, {}),                                       // sin lecturas: no sale
  ];
  it('por zona y tanque: días con lectura, mínima–media–máxima de todas sus tomas y cuántas quedan fuera', () => {
    const p = zonasDelPeriodo(filas, '2026-09-12', '2026-09-19');
    expect(p.map((z) => z.zona + ' · ' + rotuloTanque(z))).toEqual([`${MAS} · Tanque 1`, `${R1} · toda el área`]);
    const t1 = p[0];
    expect(t1.dias).toBe(3);
    expect(t1.temp).toMatchObject({ n: 3, min: 27, max: 29.5, bajo: 1, alto: 1 });
    expect(t1.temp.med).toBeCloseTo((27 + 29.5 + 28.5) / 3, 10);
    expect(t1.ox).toMatchObject({ n: 2, min: 3, max: 5, med: 4, bajo: 1, alto: 0 });
    expect(p[1]).toMatchObject({ dias: 1, temp: { n: 1, min: 28, med: 28, max: 28 }, ox: { n: 0, min: null, med: null, max: null } });
  });
  it('sin lecturas en el período, vacío', () => {
    expect(zonasDelPeriodo(filas, '2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('los días con lectura', () => {
  it('de todo el registro, en orden y sin repetir; una fila sin lecturas no cuenta', () => {
    expect(diasConZonas([
      Z('2026-09-19', MAS, 1, { 'Oxígeno 06:00': '5' }), Z('2026-09-02', R1, '', { 'Temperatura 2:00': '28' }),
      Z('2026-09-19', E1, 2, { 'Temperatura 4:00': '28' }), Z('2026-09-25', MAS, 2, {}),
    ])).toEqual(['2026-09-02', '2026-09-19']);
  });
});
