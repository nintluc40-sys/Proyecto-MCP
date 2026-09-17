/* MADURACIÓN · RESUMEN (pestaña Saldo, 2026-09-15): el módulo con un caso calculado a mano, y su PARIDAD con el
   bloque inline de engine.js. Cada cifra de abajo está razonada en el comentario de su prueba. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { resumenMaduracion, estadisticaDia, diasEntre, RESUMEN_TEMPS, RESUMEN_OXIGENOS } from './mad-resumen.js';

const ing = (Fecha, Lote, cg, Sala, Tanque, Machos, Hembras) => ({ Fecha, Lote, 'Código genético': cg, Sala, Tanque, Machos, Hembras });
const tq = (Fecha, Sala, Tanque, extra = {}) => Object.assign({ Fecha, Sala, Tanque, 'Machos muertos': 0, 'Hembras muertas': 0,
  'Machos muertos por descarte de selección': 0, 'Hembras muertas por descarte de selección': 0, 'Cópulas': 0, Muda: 0,
  'Peso promedio machos (g)': '', 'Peso promedio hembras (g)': '' }, extra);
const sala = (Fecha, Sala, Estado, RAS, lecturas) => Object.assign({ Fecha, Sala, Estado, RAS }, lecturas);
const des = (Fecha, Lote, Desoves, huevos, noViables, N2, N5) => ({ Fecha, Lote, 'Código genético': 'CG1', Desoves, 'Total de huevos': huevos, 'Hembras no viables': noViables, N2, N5 });
const trat = (Fecha, Sala, Tipo, Area, Lotes, Productos, ras) => ({ Fecha, Sala, Tipo, 'Área': Area, Lotes, Productos, 'Productos RAS': ras });

const FUENTES = () => ({
  ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 20, 60), ing('2026-01-20', 'CD', 'CG2', 'Sala 1', 1, 10, 20), ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 3, 10, 40)],
  tanques: [
    tq('2026-01-10', 'Sala 1', 1, { 'Machos muertos': 2, 'Hembras muertas': 4, 'Cópulas': 3, Muda: 1, 'Peso promedio machos (g)': 40, 'Peso promedio hembras (g)': 55 }),
    tq('2026-01-30', 'Sala 1', 1, { 'Hembras muertas': 6, 'Hembras muertas por descarte de selección': 2, Muda: 3, 'Peso promedio machos (g)': 42, 'Peso promedio hembras (g)': 58 }),
    tq('2026-01-30', 'Sala 2', 3, { 'Machos muertos': 1, 'Cópulas': 2, Muda: 1, 'Peso promedio hembras (g)': 60 }),
  ],
  mortDesove: [{ Fecha: '2026-01-31', Lote: 'AB', 'Tipo de tanque': 'Desove', 'Hembras que entran': 20, 'Hembras muertas': 2 }],
  sala: [
    sala('2026-01-29', 'Sala 1', 'Producción', 'SI', { 'Temperatura 2:00': 27, 'Temperatura 4:00': 28, 'Oxígeno 06:00': 5 }),
    sala('2026-01-30', 'Sala 1', 'Producción', 'SI', { 'Temperatura 2:00': 28, 'Temperatura 4:00': '28.5', 'Temperatura 6:00': 29, 'Temperatura 8:00': '', 'Oxígeno 06:00': 5, 'Oxígeno 12:00': 6 }),
    sala('2026-01-30', 'Sala 2', 'Producción', 'NO', { 'Temperatura 2:00': 30 }),
    sala('', 'Sala 3', 'Producción', 'SI', { 'Temperatura 2:00': 31 }),
  ],
  desoves: [des('2026-01-12', 'AB', 10, 1000000, 3, 600000, 500000), des('2026-01-20', 'ab', 6, 800000, 1, '', ''), des('2026-01-25', 'AB', 4, 400000, '', 300000, '')],
  tratamientos: [
    trat('2026-01-28', 'Sala 1', 'Preventivo', 'Lotes', 'AB, CD', 'Bacmil', 'EM-1'),
    trat('2026-01-29', 'Sala 1', 'Desinfección', 'Salas y tanques', '', 'Formol', ''),
    trat('2026-01-30', 'Sala 2', 'Preventivo', 'Lotes', 'AB', 'Lactosac', ''),
    trat('2026-01-31', '', 'Desinfección', 'RAS y tuberías', '', 'Cloro', ''),
  ],
});
const SALA_PARCIAL = () => [
  sala('2026-01-07', 'Sala 9', 'Producción', '', { 'Temperatura 2:00': 27, 'Temperatura 4:00': 27, 'Oxígeno 06:00': 4 }),
  sala('2026-01-08', 'Sala 9', 'Producción', 'NO', {}),
  sala('2026-01-09', 'Sala 9', '', '', { 'Temperatura 2:00': 30, 'Temperatura 4:00': 31 }),
  sala('2026-01-12', 'Sala 9', 'Cuarentena', '', {}),
  sala('2026-01-13', 'Sala 9', '', '', { 'Oxígeno 06:00': 5 }),
];
/* H1: el tanque 2 de la Sala 7 lo usó OLD (pesado el 01-05, cerrado el 01-06) y después recibió a NEW, que venía del
   tanque 3, donde se pesó el 01-04. */
const TANQUE_REUTILIZADO = () => ({
  ingresos: [ing('2026-01-01', 'OLD', 'CG1', 'Sala 7', 2, 4, 8), ing('2026-01-02', 'NEW', 'CG2', 'Sala 7', 3, 5, 10)],
  tanques: [tq('2026-01-04', 'Sala 7', 3, { Muda: 1, 'Peso promedio machos (g)': 30, 'Peso promedio hembras (g)': 35 }),
    tq('2026-01-05', 'Sala 7', 2, { Muda: 2, 'Cópulas': 3, 'Peso promedio machos (g)': 50, 'Peso promedio hembras (g)': 60 })],
  cierres: [{ Fecha: '2026-01-06', Lote: 'OLD', Tipo: 'Total', Machos: 4, Hembras: 8, Sala: '' }],
  movimientos: [{ Fecha: '2026-01-08', Tipo: 'Transferencia', 'Sala origen': 'Sala 7', 'Tanque origen': 3, 'Sala destino': 'Sala 7', 'Tanque destino': 2,
    Machos: 5, Hembras: 10, 'Agua destino': 'RAS', Motivo: 'Logística', Observaciones: '' }],
});
/* LOS BORDES DE LA CARGA, cada uno puesto a propósito porque el banco de mutación demostró que
   sin ellos se podía romper en silencio:
     · Sala 3 t22 SIN ningún peso           → la carga métrica queda vacía, nunca en cero;
     · Sala 4 t1 con SÓLO el peso de ♀      → sí se calcula, contando los ♂ como 0;
     · Sala 5 con 0 t registradas           → volumen 0, y la volumétrica NO se divide entre cero;
     · Sala 9, que no está en NINGÚN catálogo, CON toneladas → vale lo registrado;
     · Sala 4 con DOS registros de toneladas → manda el último;
     · dos días de revisión de nauplios      → sólo el último, sin acumular. */
const CARGA_LIMITES = () => ({
  ingresos: [ing('2026-01-01', 'ZZ', 'CG1', 'Sala 3', 22, 10, 20), ing('2026-01-01', 'XX', 'CG2', 'Sala 4', 1, 4, 6),
    ing('2026-01-01', 'WW', 'CG3', 'Sala 5', 7, 2, 3), ing('2026-01-01', 'YY', 'CG4', 'Sala 9', 99, 5, 5)],
  tanques: [
    tq('2026-01-10', 'Sala 3', 22, {}),
    tq('2026-01-10', 'Sala 4', 1, { 'Peso promedio hembras (g)': 50 }),
    tq('2026-01-10', 'Sala 5', 7, { 'Peso promedio machos (g)': 10, 'Peso promedio hembras (g)': 20 }),
    tq('2026-01-10', 'Sala 9', 99, { 'Peso promedio machos (g)': 10, 'Peso promedio hembras (g)': 20 }),
  ],
  sala: [
    Object.assign(sala('2026-01-10', 'Sala 4', 'Producción', ''), { Toneladas: 5 }),
    Object.assign(sala('2026-01-20', 'Sala 4', 'Producción', ''), { Toneladas: 12 }),
    Object.assign(sala('2026-01-10', 'Sala 5', 'Producción', ''), { Toneladas: 0 }),
    Object.assign(sala('2026-01-10', 'Sala 9', 'Producción', ''), { Toneladas: 8 }),
  ],
  mortDesove: [
    { Fecha: '2026-01-10', Lote: 'ZZ', 'Revisión': 'Entrada', Deformidad: 'Alta', Actividad: 'Baja', Hongos: 'Presente', Fototropismo: 'Baja', 'Aireación': 'Baja', Salinidad: 30, Temperatura: 27 },
    { Fecha: '2026-01-20', Lote: 'ZZ', 'Revisión': 'Lavado', Deformidad: 'Baja', Actividad: 'Alta', Hongos: 'Ausente', Fototropismo: 'Alta', 'Aireación': 'Media', Salinidad: 34, Temperatura: 29 },
  ],
});

const R = resumenMaduracion(FUENTES(), { hoy: '2026-02-01' });
const lote = (n) => R.lotes.find((l) => l.lote === n);
const deSala = (n) => R.salas.find((s) => s.sala === n);

describe('Resumen · piezas', () => {
  it('estadística del día: promedio, ÚLTIMA lectura en orden, CV muestral; con una lectura no hay CV', () => {
    expect(estadisticaDia([28, '28.5', 29, '', null])).toEqual({ n: 3, prom: 28.5, ultima: 29, cv: 1.75 });
    expect(estadisticaDia([30])).toEqual({ n: 1, prom: 30, ultima: 30, cv: '' });
    expect(estadisticaDia(['', 'x'])).toEqual({ n: 0, prom: '', ultima: '', cv: '' });
    expect(RESUMEN_TEMPS).toHaveLength(12);
    expect(RESUMEN_OXIGENOS).toEqual(['Oxígeno 06:00', 'Oxígeno 12:00', 'Oxígeno 18:00', 'Oxígeno 00:00']);
  });
  it('días entre fechas, en UTC', () => {
    expect(diasEntre('2026-01-10', '2026-02-01')).toBe(22);
    expect(diasEntre('2026-01-01', 'x')).toBe('');
  });
});

describe('Resumen · salas', () => {
  it('🔴 último registro: estado, RAS, T° y O2 con Δ contra el registro anterior y CV', () => {
    // T°: [28, 28.5, 29] → prom 28.5, CV 0.5/28.5 = 1.75 %; el 01-29 promediaba 27.5 → Δ +1. O2: [5, 6] → 5.5, CV 12.86 %; antes 5 → Δ 0.5.
    expect(deSala('Sala 1')).toMatchObject({ fecha: '2026-01-30', estado: 'Producción', ras: 'SI',
      temp: { prom: 28.5, ultima: 29, cv: 1.75, delta: 1 }, ox: { prom: 5.5, ultima: 6, cv: 12.86, delta: 0.5 } });
    expect(deSala('Sala 2')).toMatchObject({ ras: 'NO', temp: { prom: 30, ultima: 30, cv: '', delta: '' }, ox: { prom: '', ultima: '', cv: '', delta: '' } });
    expect(R.salas.map((s) => s.sala)).toEqual(['Sala 1', 'Sala 2']);   // la fila sin fecha de la Sala 3 no cuenta
  });
  it('🔴 H2: cada variable sale del último registro QUE LA TRAE (el de sólo estado no borra la T°)', () => {
    // Medido en producción (Sala 4, 2026-09-13): el registro de «Proponer estado» no trae lecturas. T°: la última con
    // lecturas es la del 01-09 [30, 31] → prom 30.5, CV 0.7071/30.5 = 2.32 %; la anterior CON T° es la del 01-07 (27) → Δ 3.5,
    // no la del 01-08, que no tiene T°. O2: el 01-13 (5) contra el 01-07 (4) → Δ 1. RAS del 01-08. Estado del 01-12: el último
    // registro (01-13) no trae estado.
    const f = { sala: SALA_PARCIAL() };
    expect(resumenMaduracion(f, { hoy: '2026-01-14' }).salas[0]).toMatchObject({ sala: 'Sala 9', fecha: '2026-01-12', estado: 'Cuarentena',
      ras: 'NO', fechaRas: '2026-01-08', temp: { prom: 30.5, ultima: 31, cv: 2.32, delta: 3.5, fecha: '2026-01-09' },
      ox: { prom: 5, ultima: 5, cv: '', delta: 1, fecha: '2026-01-13' } });
  });
  it('🔴 lotes de la sala con su estado, y tanques y animales en producción y cuarentena', () => {
    // Sala 1: AB 18♂ 49♀ (copuló el 01-10: Producción) y CD 10♂ 18♀ (entró el 01-20, sin cópula: Cuarentena).
    expect(deSala('Sala 1')).toMatchObject({ lotes: [{ lote: 'AB', estado: 'Producción', machos: 18, hembras: 49 }, { lote: 'CD', estado: 'Cuarentena', machos: 10, hembras: 18 }],
      tanquesProduccion: 1, animalesProduccion: 67, animalesCuarentena: 28 });
    expect(deSala('Sala 2')).toMatchObject({ tanquesProduccion: 1, animalesProduccion: 48, animalesCuarentena: 0 });
    expect(deSala('Sala 1').tratamientos.map((t) => [t.fecha, t.tipo])).toEqual([['2026-01-29', 'Desinfección'], ['2026-01-28', 'Preventivo']]);
  });
});

describe('Resumen · lotes', () => {
  it('🔴 población, muertos (tanques + desove), descartes y tasas sobre lo ingresado', () => {
    // AB: ingresan 30♂ 100♀. Muertos ♂ 2+1 = 3; ♀ 4 + 5 (de las 8 bajas del 01-30 le tocan 6: 5 muertas y 1 descarte) + 2 en desove = 11.
    expect(lote('AB')).toMatchObject({ machos: 27, hembras: 88, estado: 'Producción', ingresados: { machos: 30, hembras: 100 },
      muertos: { machos: 3, hembras: 11 }, descartes: { machos: 0, hembras: 1 }, tasaMortalidad: { machos: 10, hembras: 11, total: 10.77 } });
    expect(lote('CD')).toMatchObject({ machos: 10, hembras: 18, estado: 'Cuarentena', muertos: { machos: 0, hembras: 2 }, tasaMortalidad: { machos: 0, hembras: 10, total: 6.67 } });
  });
  it('🔴 días: la cópula antes de los 15 días termina la cuarentena; una cópula tardía no la alarga', () => {
    expect(lote('AB').dias).toEqual([
      { sala: 'Sala 1', estado: 'Producción', diasCuarentena: 9, diasProduccion: 22 },
      { sala: 'Sala 2', estado: 'Producción', diasCuarentena: 15, diasProduccion: 16 },
    ]);
    expect(lote('CD').dias).toEqual([{ sala: 'Sala 1', estado: 'Cuarentena', diasCuarentena: 12, diasProduccion: 0 }]);
  });
  it('🔴 relación H:M de cada tanque y peso del último registro (promedio de sus tanques ese día)', () => {
    /* Las cargas van con la relación porque salen de las mismas dos cifras. A mano, con los pesos
       del 01-30 (♂ 42 g · ♀ 59 g) y las toneladas de CADA tanque de su sala:
         · Sala 1 t1 → (67×59 + 28×42) ÷ 1000 = 5,129 → 5,13 kg ÷ 5,5 m³ = 0,93 kg/m³
         · Sala 2 t3 → (39×59 + 9×42) ÷ 1000 = 2,679 → 2,68 kg ÷ 21 m³ = 0,13 kg/m³
       Las dos salas llevan volúmenes MUY distintos a propósito: con el mismo, tomar el de la sala
       equivocada daría lo mismo y esta prueba no probaría nada. */
    expect(lote('AB').tanques).toEqual([
      { sala: 'Sala 1', tanque: 1, machos: 28, hembras: 67, relacion: 2.39, cargaMetrica: 5.13, volumen: 5.5, cargaVolumetrica: 0.93 },
      { sala: 'Sala 2', tanque: 3, machos: 9, hembras: 39, relacion: 4.33, cargaMetrica: 2.68, volumen: 21, cargaVolumetrica: 0.13 },
    ]);
    expect([lote('AB').pesoMachos, lote('AB').pesoHembras]).toEqual([{ valor: 42, fecha: '2026-01-30' }, { valor: 59, fecha: '2026-01-30' }]);
  });

  it('🔑 sin ningún peso registrado, la carga queda VACÍA y no en cero', () => {
    /* Un cero diría «el tanque no pesa nada» sobre un tanque lleno de animales, y la carga
       volumétrica heredaría la mentira. El volumen sí se sabe: es del catálogo. */
    const sinPeso = FUENTES();
    sinPeso.tanques = sinPeso.tanques.map((r) => Object.assign({}, r, { 'Peso promedio machos (g)': '', 'Peso promedio hembras (g)': '' }));
    const t = resumenMaduracion(sinPeso, { hoy: '2026-02-01' }).lotes.find((x) => x.lote === 'AB').tanques[0];
    expect([t.cargaMetrica, t.cargaVolumetrica]).toEqual(['', '']);
    expect(t.volumen, 'el volumen no depende del peso').toBe(5.5);
  });

  it('🔑 lo REGISTRADO en la ficha de Salas manda sobre el catálogo de toneladas', () => {
    // La Sala 2 se registra con 10,5 t: la mitad de las 21 del catálogo, así que la carga se dobla.
    const f = FUENTES();
    f.sala = f.sala.concat([{ Fecha: '2026-01-31', Sala: 'Sala 2', Toneladas: 10.5 }]);
    const R = resumenMaduracion(f, { hoy: '2026-02-01' });
    const t = R.lotes.find((x) => x.lote === 'AB').tanques.find((x) => x.sala === 'Sala 2');
    expect(t.volumen).toBe(10.5);
    expect(t.cargaVolumetrica).toBe(0.26);                       // 2,68 ÷ 10,5
    const s2 = R.salas.find((x) => x.sala === 'Sala 2');
    expect([s2.toneladas, s2.fechaToneladas, s2.volumenTanque, s2.tanquesSala]).toEqual([10.5, '2026-01-31', 10.5, 6]);
  });

  it('🔑 los BORDES de la carga: sin peso, con medio peso, con 0 t y con una sala desconocida', () => {
    const X = resumenMaduracion(CARGA_LIMITES(), { hoy: '2026-02-01' });
    const tq1 = (n) => X.lotes.find((l) => l.lote === n).tanques[0];
    // Sin ningún peso: vacía, NO cero. El volumen sí se sabe (21 t por tanque en la Sala 3).
    expect([tq1('ZZ').cargaMetrica, tq1('ZZ').cargaVolumetrica, tq1('ZZ').volumen]).toEqual(['', '', 21]);
    // Con sólo el peso de ♀ sí se calcula, contando los ♂ como 0: (6 × 50) ÷ 1000 = 0,3 kg.
    // Y la Sala 4 tiene DOS registros de toneladas: manda el último (12 m³).
    expect([tq1('XX').cargaMetrica, tq1('XX').volumen, tq1('XX').cargaVolumetrica]).toEqual([0.3, 12, 0.03]);
    // 0 t registradas: el volumen es 0 y la volumétrica NO se divide entre cero.
    expect([tq1('WW').cargaMetrica, tq1('WW').volumen, tq1('WW').cargaVolumetrica]).toEqual([0.08, 0, '']);
    // Sala 9 no está en ningún catálogo, pero SÍ registró toneladas: vale lo registrado.
    expect([tq1('YY').cargaMetrica, tq1('YY').volumen, tq1('YY').cargaVolumetrica]).toEqual([0.15, 8, 0.02]);
    const s4 = X.salas.find((s) => s.sala === 'Sala 4');
    expect([s4.toneladas, s4.fechaToneladas, s4.volumenTanque]).toEqual([12, '2026-01-20', 12]);
  });

  /* 🔴 CONTRA EL EXCEL DEL MÓDULO, que es de donde sale la definición. Hoja «SEPTIEMBRE 2026»,
     fila 4 = tanque 1 de la Sala 1: 33♀ a 68 g (AK) y 59♂ a 54 g (AL), y su celda BA lleva el
     rótulo «Carga volumetrica (kG/m3)» con la fórmula ((♀+♂) × pesoPromedio ÷ 1000) ÷ 4,65.
       (33×68 + 59×54) = 5430 g = 5,43 kg · 5,43 ÷ 4,65 = 1,1677 → 1,17 kg/m³
     Se registran las 4,65 t DEL EXCEL, no las 5,5 del catálogo, para comparar contra su divisor.
     ⚠ Esta prueba es la que fija que las toneladas son POR TANQUE: con el reparto entre los 15
     tanques de la Sala 1 saldría 17,5 kg/m³, quince veces la cifra del Excel.
     ✅ 2026-09-16 · Y ESTO NO DICE QUE EL CATÁLOGO ESTÉ MAL (decisión del usuario): mandan sus
     cifras (Sala 1 = 5,5 t). Lo que aquí se fija es la FORMA de la cuenta —biomasa del tanque ÷ el
     volumen de UN tanque—, no el valor; por eso el fixture TECLEA el del Excel en vez de tirar del
     catálogo. Nadie debe «cuadrar» `MAD_SALA_TONELADAS` con esta hoja. */
  it('🔴 contra el EXCEL: la carga volumétrica del tanque 1 de la Sala 1 cuadra al decimal', () => {
    const f = {
      ingresos: [ing('2026-01-01', 'EX', 'CG1', 'Sala 1', 1, 59, 33)],
      tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Peso promedio machos (g)': 54, 'Peso promedio hembras (g)': 68 })],
      sala: [Object.assign(sala('2026-01-02', 'Sala 1', 'Producción', ''), { Toneladas: 4.65 })],
    };
    const t = resumenMaduracion(f, { hoy: '2026-01-05' }).lotes.find((l) => l.lote === 'EX').tanques[0];
    expect([t.hembras, t.machos]).toEqual([33, 59]);
    expect(t.cargaMetrica).toBe(5.43);
    expect(t.volumen).toBe(4.65);
    expect(t.cargaVolumetrica).toBe(1.17);
  });

  it('🔑 de la revisión de nauplios sólo queda el ÚLTIMO día, sin acumular los anteriores', () => {
    const X = resumenMaduracion(CARGA_LIMITES(), { hoy: '2026-02-01' });
    const n = X.lotes.find((l) => l.lote === 'ZZ').nauplios;
    expect(n.fecha).toBe('2026-01-20');
    expect(n.revisiones).toEqual([{ revision: 'Lavado', deformidad: 'Baja', actividad: 'Alta', hongos: 'Ausente',
      fototropismo: 'Alta', aireacion: 'Media', salinidad: 34, temperatura: 29 }]);
  });

  it('sin nada registrado, la sala sale con las toneladas de su catálogo y sin fecha', () => {
    const s1 = resumenMaduracion(FUENTES(), { hoy: '2026-02-01' }).salas.find((x) => x.sala === 'Sala 1');
    expect([s1.toneladas, s1.fechaToneladas, s1.volumenTanque, s1.tanquesSala]).toEqual([5.5, '', 5.5, 15]);
  });
  it('🔴 H1: peso, mudas y cópulas sólo de las filas de tanques que ESE DÍA tenían el lote (tanque reutilizado y lote movido)', () => {
    // NEW está hoy en el tanque 2, pero la fila del 01-05 de ese tanque es de OLD (50 g, 2 mudas, 3 cópulas). Lo de NEW es
    // la fila del 01-04 en el tanque 3, donde estaba: 30 g ♂, 35 g ♀, 1 muda sobre 15 vivos = 6.67 %, 0 cópulas sobre 10 ♀.
    const X = resumenMaduracion(TANQUE_REUTILIZADO(), { hoy: '2026-01-09' });
    expect(X.lotes.map((l) => l.lote)).toEqual(['NEW']);
    expect(X.lotes[0].tanques.map((t) => t.tanque)).toEqual([2]);
    expect(X.lotes[0]).toMatchObject({ pesoMachos: { valor: 30, fecha: '2026-01-04' }, pesoHembras: { valor: 35, fecha: '2026-01-04' },
      fechaDia: '2026-01-04', pctMudas: 6.67, pctCopulas: 0 });
  });
  it('H1: un lote sin ninguna fila suya en Tanques sale sin peso ni mudas, aunque su tanque tenga filas de otro lote', () => {
    const f = TANQUE_REUTILIZADO();
    f.tanques = f.tanques.filter((r) => r.Tanque === 2);
    expect(resumenMaduracion(f, { hoy: '2026-01-09' }).lotes[0]).toMatchObject({ pesoMachos: { valor: '', fecha: '' }, fechaDia: '', pctMudas: '', pctCopulas: '' });
  });
  it('🔴 % mudas y % cópulas del último día, sobre los vivos DE ESE DÍA (antes de la mortalidad en desove del 01-31)', () => {
    // AB el 01-30: mudas 3+1 = 4 sobre 96 + 49 vivos = 2.76 %; cópulas 0+2 sobre 68 + 40 hembras = 1.85 %.
    expect([lote('AB').fechaDia, lote('AB').pctMudas, lote('AB').pctCopulas]).toEqual(['2026-01-30', 2.76, 1.85]);
    expect([lote('CD').pctMudas, lote('CD').pctCopulas]).toEqual([3.13, 0]);
  });
  it('🔴 desoves: totales, Nauplios/Hembra sólo con N5 y fertilidad sólo con N2 (los pendientes no diluyen)', () => {
    expect(lote('AB').desoves).toEqual({ desoves: 20, noViables: 4, huevos: 2200000, n2: 900000, n5: 500000, naupliosPorHembra: 50000, fertilidad: 64.29 });
    expect(lote('CD').desoves).toMatchObject({ desoves: 0, naupliosPorHembra: '', fertilidad: '' });
  });
  it('mortalidad en desove y recuperación, y los preventivos del lote más recientes primero', () => {
    expect([lote('AB').mortDesove, lote('AB').mortRecuperacion]).toEqual([{ entran: 20, muertas: 2, pct: 10 }, { entran: 0, muertas: 0, pct: '' }]);
    expect(lote('AB').tratamientos).toEqual([{ fecha: '2026-01-30', sala: 'Sala 2', productos: 'Lactosac', ras: '' }, { fecha: '2026-01-28', sala: 'Sala 1', productos: 'Bacmil', ras: 'EM-1' }]);
    expect(lote('CD').tratamientos.map((t) => t.fecha)).toEqual(['2026-01-28']);
  });
  it('RAS: lo aplicado al RAS (por su área o como productos RAS), más reciente primero; y la fecha del libro', () => {
    expect(R.ras).toEqual([{ fecha: '2026-01-31', sala: '', tipo: 'Desinfección', productos: 'Cloro' }, { fecha: '2026-01-28', sala: 'Sala 1', tipo: 'Preventivo', productos: 'EM-1' }]);
    expect([R.hoy, R.hasta, R.avisos]).toEqual(['2026-02-01', '2026-01-31', 0]);
  });
  it('un lote CERRADO y sin animales no aparece', () => {
    const f = FUENTES();
    f.cierres = [{ Fecha: '2026-01-31', Lote: 'CD', Tipo: 'Total', Machos: 10, Hembras: 18, Sala: '' }];
    expect(resumenMaduracion(f, { hoy: '2026-02-01' }).lotes.map((l) => l.lote)).toEqual(['AB']);
  });
});

/* ── 2026-09-15 (usuario) · MORTALIDAD DEL DÍA + ACUMULADA CON SU RANGO ────────────────────
   «Rematar la cantidad registrada del día (más el porcentaje) y adicional cómo se lleva el
   total hasta el día (acumulada) y sus porcentajes asimismo; ubicar al lado la fecha de dicho
   total, de qué fecha a qué fecha es.»

   🔑 EL FIXTURE ESTÁ ELEGIDO PARA QUE DISTINGA. El tanque 1 de la Sala 1 está MEZCLADO el
   01-30 (AB desde el 01-01, CD desde el 01-20), así que las 6 hembras muertas y las 2 de
   descarte de esa fila son del TANQUE y hay que repartirlas. Si la cifra del día se calculara
   sumando la fila —que es la implementación «obvia»— AB se apuntaría las 6, y el número
   saldría plausible y equivocado. */
describe('Resumen · mortalidad del día y acumulada', () => {
  const AB = () => R.lotes.find((x) => x.lote === 'AB');
  const CD = () => R.lotes.find((x) => x.lote === 'CD');

  it('el fixture ejerce algo: los dos lotes comparten el tanque 1 de la Sala 1', () => {
    const enT1 = (L) => L.tanques.some((t) => t.sala === 'Sala 1' && t.tanque === 1);
    expect(enT1(AB()) && enT1(CD()), 'sin tanque mezclado el caso no distinguiría nada').toBe(true);
    expect(AB().fechaDia).toBe('2026-01-30');
  });

  it('🔴 la del día NO es la suma de la fila: el tanque mezclado se reparte por vivos', () => {
    /* El 01-30, AB tenía 56♀ vivas en el t1 y CD 20♀. Las 8 bajas (6 muertas + 2 de descarte)
       se reparten 6 para AB y 2 para CD, y dentro de cada lote se parten entre muertas y
       descarte en la proporción de la fila: AB acaba con 5 muertas + 1 de descarte, CD con 2 + 0.
       Y en la Sala 2, el tanque 3 —sólo de AB— aporta su macho. */
    expect(AB().muertosDia).toEqual({ machos: 1, hembras: 5 });
    expect(AB().muertosDia.hembras, 'se apuntó a AB la fila entera').toBeLessThan(6);
    expect(CD().muertosDia).toEqual({ machos: 0, hembras: 2 });
  });

  it('🔴 el % del día va sobre los animales EN RIESGO ese día, no sobre lo ingresado', () => {
    /* AB llegaba al 01-30 con 28♂ y 96♀ vivos (30♂ 100♀ ingresados menos las bajas del 01-10).
       1/28 = 3,57 % · 5/96 = 5,21 % · 6/124 = 4,84 %. Sobre lo INGRESADO darían 3,33 y 5,00:
       parecido, y por eso hay que fijarlo — dividir la mortalidad de un día entre lo que
       ingresó hace un mes da una cifra que no significa nada. */
    expect(AB().tasaMortalidadDia).toEqual({ machos: 3.57, hembras: 5.21, total: 4.84 });
    expect(AB().tasaMortalidadDia.hembras).not.toBe(5);
  });

  it('la acumulada sigue siendo sobre lo ingresado, y es OTRA cifra', () => {
    expect(AB().muertos).toEqual({ machos: 3, hembras: 11 });
    expect(AB().tasaMortalidad).toEqual({ machos: 10, hembras: 11, total: 10.77 });
  });

  it('un lote con un solo día tiene la misma cifra en el día y en el acumulado', () => {
    // CD entró el 01-20 y sólo tiene bajas del 01-30: es el control de que las dos no se cruzan.
    expect(CD().muertosDia).toEqual(CD().muertos);
    expect(CD().tasaMortalidadDia.total).toBe(CD().tasaMortalidad.total);
  });

  it('🔴 el acumulado dice DESDE CUÁNDO: del ingreso del lote a la fecha de cálculo', () => {
    // Sin el rango, un total no dice de cuánto tiempo es y se lee como si fuera del día.
    expect(AB().rangoAcumulado).toEqual({ desde: '2026-01-01', hasta: '2026-02-01' });
    // Y es el de CADA lote, no el del libro: CD entró diecinueve días después.
    expect(CD().rangoAcumulado).toEqual({ desde: '2026-01-20', hasta: '2026-02-01' });
  });

  it('sin ningún día con filas de sus tanques, el día sale en cero y sin tasas', () => {
    const solo = resumenMaduracion({ ingresos: FUENTES().ingresos }, { hoy: '2026-02-01' });
    const ab = solo.lotes.find((x) => x.lote === 'AB');
    expect(ab.muertosDia).toEqual({ machos: 0, hembras: 0 });
    expect(ab.tasaMortalidadDia).toEqual({ machos: '', hembras: '', total: '' });
    expect(ab.rangoAcumulado.desde, 'el rango no depende de que haya bajas').toBe('2026-01-01');
  });
});

/* ── PE1.5 (2026-09-16, usuario) · alcalinidad de DÍA y de NOCHE ─────────────────────────────
   Cada turno es su columna en la misma fila del área, y se anotan cuando se miden: la de noche puede
   llegar otro día. Por eso cada uno lleva SU última cifra y SU fecha; un solo «último registro» del área
   dejaría la de día en blanco en cuanto se guarde una fila sólo de noche. El fixture lo distingue. */
const ALCALINIDAD_TURNOS = () => Object.assign(FUENTES(), { mortDesove: FUENTES().mortDesove.concat([
  { Fecha: '2026-01-21', 'Área': 'Sala 1', 'Alcalinidad día': 142, 'Alcalinidad noche': '' },
  { Fecha: '2026-01-22', 'Área': 'Sala 1', 'Alcalinidad día': '', 'Alcalinidad noche': 139 },
  { Fecha: '2026-01-21', 'Área': 'RAS', 'Alcalinidad día': 118, 'Alcalinidad noche': 116 },
]) });
describe('Resumen · la alcalinidad de día y de noche (PE1.5)', () => {
  it('🔴 cada turno con SU última cifra y SU fecha, en la sala y en el RAS', () => {
    const r = resumenMaduracion(ALCALINIDAD_TURNOS(), { hoy: '2026-02-01' });
    expect(r.salas.find((s) => s.sala === 'Sala 1').alcalinidad)
      .toEqual({ dia: { valor: 142, fecha: '2026-01-21' }, noche: { valor: 139, fecha: '2026-01-22' } });
    expect(r.rasAlcalinidad).toEqual({ dia: { valor: 118, fecha: '2026-01-21' }, noche: { valor: 116, fecha: '2026-01-21' } });
  });

  it('sin alcalinidad, los dos turnos en blanco (no uno solo)', () => {
    expect(resumenMaduracion(FUENTES(), { hoy: '2026-02-01' }).rasAlcalinidad)
      .toEqual({ dia: { valor: '', fecha: '' }, noche: { valor: '', fecha: '' } });
  });
});

/* ── PARIDAD con el monolito ── */
describe('Resumen · el monolito y el módulo dan lo mismo', () => {
  const src = readFileSync(new URL('../../../../public/registros/engine.js', import.meta.url), 'utf8').split('\r\n').join('\n');
  const bloque = (desde, hasta) => {
    const i = src.indexOf(desde);
    const j = src.indexOf(hasta, i);
    if (i < 0 || j < 0) throw new Error('Ancla no encontrada: ' + desde.slice(0, 40));
    return src.slice(i, j + hasta.length);
  };
  const ctx = { String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite };
  ctx.globalThis = ctx;
  createContext(ctx);
  /* ⚠ LOS DOS CATÁLOGOS SE EXTRAEN DEL MONOLITO, no se pasan por `ctx`. La carga por tanque sale
     de las toneladas de la sala entre sus tanques: si uno de los dos se pasara desde el módulo, el
     monolito podría llevar OTRAS cifras y esta prueba seguiría en verde sobre las del módulo. */
  new Script(bloque('const MAD_SALA_TONELADAS = {', '"Sala 5":  Array.from({length:5},(_,i)=>i+7)\n};') + '\n'
    + bloque('const MAD_CUARENTENA_DIAS = 15;', '  return lotes.sort().join("+");\n}') + '\n'
    + bloque('const MAD_RES_TEMPS = [', 'rasAlcalinidad:{ dia:_madResDe(alc.dia, "RAS") || { valor:"", fecha:"" }, noche:_madResDe(alc.noche, "RAS") || { valor:"", fecha:"" } } };\n}')
    + '\n;globalThis.__api = { madResumenMaduracion, madResEstadisticaDia, madResDiasEntre, MAD_RES_TEMPS, MAD_RES_OXIGENOS };').runInContext(ctx);
  const api = ctx.__api;

  it('las mismas lecturas de la sala y las mismas piezas', () => {
    expect([api.MAD_RES_TEMPS, api.MAD_RES_OXIGENOS]).toEqual([RESUMEN_TEMPS, RESUMEN_OXIGENOS]);
    for (const v of [[28, '28.5', 29, '', null], [30], [], ['x'], [-1, 1], [0, 0]]) expect(api.madResEstadisticaDia(v)).toEqual(estadisticaDia(v));
    expect(api.madResDiasEntre('2026-01-10', '2026-02-01')).toBe(22);
  });

  it('🔴 el mismo resumen, cifra a cifra, en el caso completo y en variantes', () => {
    const variantes = [FUENTES(), Object.assign(FUENTES(), { cierres: [{ Fecha: '2026-01-31', Lote: 'CD', Tipo: 'Total', Machos: 10, Hembras: 18, Sala: '' }] }),
      Object.assign(FUENTES(), { sala: [], desoves: [], tratamientos: [] }), {}, Object.assign(FUENTES(), { sala: FUENTES().sala.concat(SALA_PARCIAL()) }), TANQUE_REUTILIZADO(), CARGA_LIMITES(),
      ALCALINIDAD_TURNOS()];
    for (const f of variantes) {
      for (const hoy of ['2026-02-01', '2026-01-25']) expect(api.madResumenMaduracion(f, { hoy })).toEqual(resumenMaduracion(f, { hoy }));
    }
  });
});
