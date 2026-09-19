/* ============================================================
   MADURACIÓN · OPERATIVO — el modelo del tablero (Fase 0.2)

   Qué se exige, y con fixtures que distinguen lo correcto de lo equivocado:
   · El período por defecto son 30 días, hoy incluido (decisión del usuario).
   · La foto al día X no ve nada posterior a X; el estado REGISTRADO tampoco.
   · El estado PROPUESTO es el de «🔄 Proponer estado»: libro al cierre del día y tanques físicos (con su
     «agrupada»), y una sala que el libro no conoce no tiene propuesta.
   · Las Salas 4A y 4B no se muestran (decisión del usuario).
   · Los partes de Tanques se juntan con la regla de la ficha: se suman bajas, mudas y cópulas; los pesos se
     promedian sobre los partes que los traen (un vacío no es un cero).
   · 🔑 La serie diaria en UNA pasada da lo MISMO que reconstruir el libro día a día.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  PERIODO_DIAS, SALAS_VISIBLES, periodoPorDefecto, fuentesAlDia, soloSalasVisibles, frescura, estadoDeSalas,
  diasDeTanque, serieDiaria, opcionesDeFiltro, modeloOperativo, DIMENSIONES,
} from './operativo.data.js';
import { MAD_OP_HOJAS, MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { construirLibro } from '../registros/lib/mad-libro.js';
import { diasEntre } from '../registros/lib/mad-resumen.js';

const ING = (fecha, lote, sala, tanque, machos, hembras) => ({ Fecha: fecha, Lote: lote, 'Código genético': 'C1', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const SALA = (fecha, sala, estado, extra) => ({ Fecha: fecha, Sala: sala, Estado: estado, ...extra });
const vacias = () => Object.fromEntries(MAD_OP_HOJAS.map((h) => [h.clave, []]));

describe('Maduración · operativo · período, foto y salas visibles', () => {
  it('el período por defecto son 30 días, hoy incluido, y cruza de mes', () => {
    expect(PERIODO_DIAS).toBe(30);
    const p = periodoPorDefecto('2026-09-19');
    expect(p).toEqual({ desde: '2026-08-21', hasta: '2026-09-19' });
    expect(diasEntre(p.desde, p.hasta)).toBe(29);
  });

  it('la foto al día X: entra X, no entra lo posterior; lo que no tiene fecha se queda (como en el libro)', () => {
    const f = { ...vacias(), tanques: [TQ('2026-09-18', 'Sala 1', 1), TQ('2026-09-19', 'Sala 1', 1), TQ('', 'Sala 1', 1)],
      broodstock: [{ 'Fecha de corte': '2026-09-12', Piscina: 9 }, { 'Fecha de corte': '2026-09-19', Piscina: 9 }] };
    const d = fuentesAlDia(f, '2026-09-18');
    expect(d.tanques.map((r) => r.Fecha)).toEqual(['2026-09-18', '']);
    expect(d.broodstock.map((r) => r['Fecha de corte'])).toEqual(['2026-09-12']);
  });

  it('las Salas 4A y 4B ya no se muestran: salen de la hoja Sala, y sólo de ella', () => {
    expect(SALAS_VISIBLES).toEqual(['Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5']);
    const f = { ...vacias(), sala: [SALA('2026-09-10', 'Sala 4A', 'Producción'), SALA('2026-09-10', 'Sala 4B', 'Producción'), SALA('2026-09-10', 'Sala 4', 'Producción')],
      tanques: [TQ('2026-09-10', 'Sala 4', 1)] };
    const { fuentes, excluidas } = soloSalasVisibles(f);
    expect(fuentes.sala.map((r) => r.Sala)).toEqual(['Sala 4']);
    expect(excluidas).toBe(2);
    expect(fuentes.tanques).toBe(f.tanques);
  });
});

describe('Maduración · operativo · frescura por hoja', () => {
  it('última fecha (la mayor, no la última fila), días hasta hoy, fechas futuras aparte; Broodstock por su corte', () => {
    const f = { ...vacias(),
      tanques: [TQ('2026-09-10', 'Sala 1', 1), TQ('2026-09-16', 'Sala 1', 1), TQ('2026-09-12', 'Sala 1', 1), TQ('2026-09-25', 'Sala 1', 1)],
      broodstock: [{ 'Fecha de corte': '2026-09-12' }] };
    const fr = Object.fromEntries(frescura(f, '2026-09-19').map((x) => [x.clave, x]));
    expect(fr.tanques).toMatchObject({ hoja: 'Maduración Tanques', filas: 4, ultima: '2026-09-16', dias: 3, futuras: 1 });
    expect(fr.broodstock).toMatchObject({ filas: 1, ultima: '2026-09-12', dias: 7 });
    expect(fr.ingresos).toMatchObject({ filas: 0, ultima: '', dias: '', futuras: 0 });
    expect(Object.keys(fr)).toHaveLength(10);
  });
});

describe('Maduración · operativo · el estado de cada sala, registrado y propuesto', () => {
  const FECHA = '2026-09-18';
  const f = { ...vacias(),
    ingresos: [
      ING('2026-09-10', 'AA', 'Sala 1', 1, 10, 10),                                     // 8 días: Cuarentena
      ...[16, 17, 18, 19].map((t) => ING('2026-08-01', 'BB', 'Sala 2', t, 10, 10)),     // 4 de 6 tanques: Producción
      ING('2026-08-01', 'CC', 'Sala 5', 7, 10, 10),                                      // 1 de 5 tanques: agrupada
      ING('2026-09-20', 'DD', 'Sala 4', 1, 10, 10),                                      // POSTERIOR a la foto
    ],
    sala: [
      SALA('2026-09-17', 'Sala 1', 'Producción'),
      SALA('2026-09-19', 'Sala 1', 'Cuarentena'),                                        // posterior: no cuenta
      SALA('2026-09-18', 'Sala 2', 'Producción', { 'Estado por lote': 'BB: Producción' }),
      SALA('2026-09-15', 'Sala 3', 'Producción'),
      SALA('2026-09-18', 'Sala 3', ''),                                                  // sin estado: no pisa el anterior
    ] };
  const porSala = Object.fromEntries(estadoDeSalas(f, FECHA).map((s) => [s.sala, s]));

  it('una fila por sala visible, en su orden', () => {
    expect(Object.keys(porSala)).toEqual(SALAS_VISIBLES);
  });

  it('🔴 el registrado no usa una fila posterior a la foto, y el propuesto sale del libro AL CIERRE del día', () => {
    expect(porSala['Sala 1'].registrado).toEqual({ estado: 'Producción', fecha: '2026-09-17', porLote: '' });
    expect(porSala['Sala 1'].propuesto.estado).toBe('Cuarentena');
    expect(porSala['Sala 1'].coinciden).toBe(false);
    expect(porSala['Sala 1'].desfaseDias).toBe(1);
    // DD entra el 20: la foto del 18 no lo ve, así que la Sala 4 no tiene nada que proponer.
    expect(porSala['Sala 4'].propuesto).toMatchObject({ estado: '', conocida: false });
  });

  it('coinciden cuando los dos dicen lo mismo, con el desglose y la ocupación FÍSICA', () => {
    expect(porSala['Sala 2'].registrado).toEqual({ estado: 'Producción', fecha: '2026-09-18', porLote: 'BB: Producción' });
    expect(porSala['Sala 2'].propuesto).toMatchObject({ estado: 'Producción', porLote: 'BB: Producción', ocupados: 4, total: 6 });
    expect(porSala['Sala 2'].coinciden).toBe(true);
    expect(porSala['Sala 2'].desfaseDias).toBe(0);
  });

  it('en producción con la mitad o menos de los tanques ocupados, lo propuesto es «agrupada» (como en la ficha)', () => {
    expect(porSala['Sala 5'].propuesto).toMatchObject({ estado: 'Desinfección - Producción agrupada', ocupados: 1, total: 5 });
  });

  it('si falta uno de los dos, no se compara (null), y un registro sin Estado no pisa el anterior', () => {
    expect(porSala['Sala 3'].registrado.estado).toBe('Producción');
    expect(porSala['Sala 3'].propuesto.estado).toBe('');
    expect(porSala['Sala 3'].coinciden).toBe(null);
    expect(porSala['Sala 5'].registrado.estado).toBe('');
    expect(porSala['Sala 5'].coinciden).toBe(null);
  });
});

describe('Maduración · operativo · los partes de Tanques en un registro por día', () => {
  it('suma bajas, mudas y cópulas; promedia los pesos sólo de los partes que los traen; junta observaciones', () => {
    const filas = [
      TQ('2026-09-17', 'Sala 1', 1, { Parte: 1, 'Machos muertos': 1, 'Hembras muertas': 2, 'Cópulas': 3, Muda: 4, 'Peso promedio machos (g)': 30,
        'Peso promedio hembras (g)': '', 'Observaciones sanitarias': 'Animales estresados', 'Observaciones operativas': 'En recambio' }),
      TQ('2026-09-17', 'Sala 1', 1, { Parte: 2, 'Machos muertos': 2, 'Hembras muertas': 0, 'Cópulas': '', Muda: 1, 'Peso promedio machos (g)': '',
        'Peso promedio hembras (g)': 40, 'Observaciones sanitarias': 'Animales estresados, Animales en muda' }),
      TQ('2026-09-17', 'Sala 1', 1, { Parte: 3, 'Machos muertos': '', 'Hembras muertas': 1, 'Peso promedio machos (g)': 34, 'Peso promedio hembras (g)': 44,
        'Machos muertos por descarte de selección': 2, 'Hembras muertas por descarte de selección': 1 }),
      TQ('2026-09-17', 'Sala 4', 1, { Parte: 1, 'Machos muertos': 5 }),   // el MISMO número de tanque en otra sala
    ];
    const dias = diasDeTanque(filas);
    expect(dias).toHaveLength(2);
    const d = dias.find((x) => x.sala === 'Sala 1');
    expect(d).toEqual({ fecha: '2026-09-17', sala: 'Sala 1', tanque: 1, partes: 3, machosMuertos: 3, hembrasMuertas: 3, machosDescarte: 2,
      hembrasDescarte: 1, copulas: 3, muda: 5, pesoMachos: 32, pesoHembras: 42,
      obsSanitarias: ['Animales estresados', 'Animales en muda'], obsOperativas: ['En recambio'] });
    expect(dias.find((x) => x.sala === 'Sala 4')).toMatchObject({ machosMuertos: 5, pesoMachos: '', pesoHembras: '' });
  });
});

describe('Maduración · operativo · la serie diaria del libro', () => {
  const f = { ...vacias(),
    ingresos: [ING('2026-09-01', 'AA', 'Sala 1', 1, 10, 20), ING('2026-09-05', 'BB', 'Sala 2', 16, 5, 10)],
    tanques: [TQ('2026-09-03', 'Sala 1', 1, { 'Hembras muertas': 4 })] };

  it('cada día es el cierre; un día sin eventos repite el anterior; antes del primero, cero', () => {
    const s = serieDiaria(f, '2026-08-31', '2026-09-06');
    expect(s.map((d) => d.fecha)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
    expect(s.map((d) => [d.total.machos, d.total.hembras])).toEqual([[0, 0], [10, 20], [10, 20], [10, 16], [10, 16], [15, 26], [15, 26]]);
    expect(s[3].porLote.AA).toMatchObject({ hembras: 16, muertos: { machos: 0, hembras: 4 }, ingresados: { machos: 10, hembras: 20 } });
    expect(s[5].porSala).toEqual({ 'Sala 1': { machos: 10, hembras: 16 }, 'Sala 2': { machos: 5, hembras: 10 } });
  });

  it('🔑 en UNA pasada da exactamente lo mismo que reconstruir el libro día a día', () => {
    for (const d of serieDiaria(f, '2026-08-31', '2026-09-06')) {
      const libro = construirLibro(f, { hoy: d.fecha, hasta: d.fecha });
      const lento = Object.fromEntries([...libro.lotes.values()].map((L) => [L.lote, [L.machos, L.hembras, L.muertos.hembras]]));
      const rapido = Object.fromEntries(Object.entries(d.porLote).map(([l, L]) => [l, [L.machos, L.hembras, L.muertos.hembras]]));
      expect(rapido, d.fecha).toEqual(lento);
    }
  });

  it('no ve lo posterior a su último día', () => {
    const s = serieDiaria(f, '2026-09-01', '2026-09-04');
    expect(s[s.length - 1].porLote.BB).toBeUndefined();
  });
});

describe('Maduración · operativo · filtros', () => {
  it('salas visibles con sus tanques físicos; lotes (orden natural) con sus códigos de Ingreso y Desoves', () => {
    const f = { ...vacias(),
      ingresos: [{ ...ING('2026-09-01', 'L10', 'Sala 1', 1, 1, 1), 'Código genético': 'B' }, { ...ING('2026-09-01', 'L2', 'Sala 1', 2, 1, 1), 'Código genético': 'A' }],
      desoves: [{ Fecha: '2026-09-05', Lote: 'L2', 'Código genético': 'C' }] };
    const o = opcionesDeFiltro(f);
    expect(o.salas).toEqual(SALAS_VISIBLES);
    expect(o.tanquesPorSala['Sala 5']).toEqual([7, 8, 9, 10, 11]);
    expect(o.lotes).toEqual(['L2', 'L10']);
    expect(o.codigosPorLote).toEqual({ L2: ['A', 'C'], L10: ['B'] });
  });

  it('cada hoja declara qué filtros admite: un desove no es de un tanque', () => {
    expect(Object.keys(DIMENSIONES).sort()).toEqual(MAD_OP_HOJAS.map((h) => h.clave).sort());
    expect(DIMENSIONES.desoves).not.toContain('tanque');
    expect(DIMENSIONES.desoves).not.toContain('sala');
    expect(DIMENSIONES.tanques).not.toContain('lote');
  });
});

describe('Maduración · operativo · el modelo entero desde el store', () => {
  it('del export crudo al modelo: fuentes, 4A fuera, frescura, resumen y salas a la fecha de la foto', () => {
    const fila = (o) => ({ _SheetOrigin: MAD_OP_ORIGEN, ...o });
    const store = [
      fila({ Fecha: '10/09/2026', Lote: 'AA', 'Código genético': 'C1', 'Camaronera origen': 'X', Sala: 'Sala 1', Tanque: '1', Machos: '10', Hembras: '10' }),
      fila({ Fecha: '17/09/2026', Sala: 'Sala 1', Estado: 'Producción', 'Temperatura 2:00': '27.5' }),
      fila({ Fecha: '17/09/2026', Sala: 'Sala 4A', Estado: 'Producción', 'Temperatura 2:00': '26' }),
      fila({ Fecha: '16/09/2026', Sala: 'Sala 1', Tanque: '1', 'Machos muertos': '1' }),
      { _SheetOrigin: 'Larvicultura', Fecha: '17/09/2026' },
    ];
    const m = modeloOperativo(store, { hoy: '2026-09-18' });
    expect(m.fecha).toBe('2026-09-18');
    expect(m.periodo).toEqual({ desde: '2026-08-20', hasta: '2026-09-18' });
    expect(m.salasExcluidas).toBe(1);
    expect(m.sinHoja).toBe(0);
    expect(m.resumen.salas.map((s) => s.sala)).toEqual(['Sala 1']);
    expect(m.resumen.salas[0].temp.prom).toBe(27.5);
    expect(m.resumen.lotes.map((l) => [l.lote, l.machos, l.hembras])).toEqual([['AA', 9, 10]]);
    expect(m.salas.find((s) => s.sala === 'Sala 1')).toMatchObject({ registrado: { estado: 'Producción' }, propuesto: { estado: 'Cuarentena' }, coinciden: false });
    expect(m.frescura.find((x) => x.clave === 'tanques').ultima).toBe('2026-09-16');
    expect(m.filtros.lotes).toEqual(['AA']);
  });

  it('con una foto en el pasado, el resumen es el de ESE día', () => {
    const fila = (o) => ({ _SheetOrigin: MAD_OP_ORIGEN, ...o });
    const store = [
      fila({ Fecha: '10/09/2026', Lote: 'AA', 'Código genético': 'C1', 'Camaronera origen': 'X', Sala: 'Sala 1', Tanque: '1', Machos: '10', Hembras: '10' }),
      fila({ Fecha: '16/09/2026', Sala: 'Sala 1', Tanque: '1', 'Machos muertos': '4' }),
    ];
    const antes = modeloOperativo(store, { hoy: '2026-09-18', fecha: '2026-09-12' });
    expect(antes.resumen.lotes.map((l) => [l.lote, l.machos])).toEqual([['AA', 10]]);
    const ahora = modeloOperativo(store, { hoy: '2026-09-18' });
    expect(ahora.resumen.lotes.map((l) => [l.lote, l.machos])).toEqual([['AA', 6]]);
  });
});
