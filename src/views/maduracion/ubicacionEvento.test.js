/* Ubicación del evento · el SNAPSHOT manda, la derivación es el respaldo.
   ------------------------------------------------------------------
   Esta rama es la que producción recorre SIEMPRE y no tenía ni una prueba: el fixture
   de `data.test.js` da la Bitácora sin Sala/Tanque, así que sólo ejercitaba la
   derivación. Medido el 2026-08-31 contra la hoja viva (GET ?p=rows): las 1.970 filas de
   «Maduración Bitácora» traen Sala Y Tanque, y «Maduración Transferencias» NO EXISTE
   (0 filas). O sea: el 100 % de los eventos reales van por el snapshot y el 0 % por la
   derivación — justo al revés de lo que decían los comentarios.

   Lo que se fija aquí:
     · el snapshot de la fila GANA a la MATRIZ y a las transferencias;
     · la derivación sigue funcionando cuando la fila no trae ubicación;
     · `derivedEvents` cuenta exactamente las que hubo que derivar, para que el aviso
       de la vista pueda dispararse cuando la derivación trabaja A CIEGAS. */
import { describe, it, expect } from 'vitest';
import { buildReproModel, makeFilter, locationStats, locKey } from './data.js';

const matriz = [
  // Las dos están HOY en Sala 2 / Tanque 18 — como la hembra real 0008219648 de producción.
  { 'Trovan ID': 'A1', 'Número': '1', 'Sala actual': 'Sala 2', 'Tanque actual': 'Tanque 18', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' },
  { 'Trovan ID': 'A2', 'Número': '2', 'Sala actual': 'Sala 2', 'Tanque actual': 'Tanque 18', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' },
];

describe('ubicación · el snapshot de la fila manda', () => {
  // Caso REAL de producción: el evento ocurrió en Sala 1/Tanque 3 y la hembra está hoy
  // en Sala 2/Tanque 18. Si el snapshot no ganara, el desove se contaría en el tanque
  // de HOY y la producción por tanque saldría mal.
  const bitacora = [
    { 'Trovan ID': 'A1', Fecha: '2026-07-03', Tipo: 'Desove', Sala: 'Sala 1', Tanque: 'Tanque 3' },
  ];
  const model = buildReproModel(matriz, bitacora, []);

  it('el desove se queda donde OCURRIÓ, no donde está la hembra hoy', () => {
    expect(model.desoves).toHaveLength(1);
    expect(model.desoves[0].sala).toBe('Sala 1');
    expect(model.desoves[0].tanque).toBe('Tanque 3');
    // el fixture SIRVE para distinguir: la posición actual es otra
    expect(model.byTrovan.get('A1').sala).toBe('Sala 2');
    expect(model.byTrovan.get('A1').tanque).toBe('Tanque 18');
  });

  it('no cuenta como derivado: derivedEvents queda en 0', () => {
    expect(model.derivedEvents).toBe(0);
  });

  it('la producción por ubicación cuenta el desove donde OCURRIÓ', () => {
    // `locationStats` devuelve un array plano y crea grupo también para la ubicación
    // ACTUAL de las hembras (aunque no tengan desoves), así que lo que hay que medir no
    // es qué grupos existen sino DÓNDE se cuenta el desove.
    const st = locationStats(model, makeFilter({}), 'loc');
    const grupo = (s, t) => st.find((g) => g.key === locKey(s, t));
    expect(grupo('Sala 1', 'Tanque 3')?.desoves).toBe(1);   // donde ocurrió
    expect(grupo('Sala 2', 'Tanque 18')?.desoves ?? 0).toBe(0); // donde está hoy: 0
  });

  it('el snapshot gana incluso habiendo transferencias que dirían otra cosa', () => {
    const transfer = [
      { 'TR-ID': 'TR-000001', Fecha: '2026-06-01', Tipo: 'Traslado', 'Trovan ID': 'A1',
        'Sala origen': 'Sala 9', 'Tanque origen': 'Tanque 9', 'Sala destino': 'Sala 7', 'Tanque destino': 'Tanque 7' },
    ];
    const m2 = buildReproModel(matriz, bitacora, transfer);
    expect(m2.desoves[0].sala).toBe('Sala 1');     // el snapshot, no el destino de la transferencia
    expect(m2.desoves[0].tanque).toBe('Tanque 3');
    expect(m2.derivedEvents).toBe(0);
  });
});

describe('ubicación · la derivación sigue siendo el respaldo', () => {
  it('sin Sala ni Tanque en la fila, deriva y lo CUENTA', () => {
    const bit = [{ 'Trovan ID': 'A1', Fecha: '2026-07-03', Tipo: 'Desove' }];
    const m = buildReproModel(matriz, bit, []);
    expect(m.desoves[0].sala).toBe('Sala 2');       // heredó la posición ACTUAL
    expect(m.desoves[0].tanque).toBe('Tanque 18');
    expect(m.derivedEvents).toBe(1);
  });

  it('con transferencias reconstruye la ubicación vigente a la fecha', () => {
    const bit = [{ 'Trovan ID': 'A1', Fecha: '2026-07-03', Tipo: 'Desove' }];
    const transfer = [
      { 'TR-ID': 'TR-1', Fecha: '2026-06-01', Tipo: 'Traslado', 'Trovan ID': 'A1',
        'Sala origen': 'Sala 1', 'Tanque origen': 'Tanque 3', 'Sala destino': 'Sala 5', 'Tanque destino': 'Tanque 5' },
      { 'TR-ID': 'TR-2', Fecha: '2026-08-01', Tipo: 'Traslado', 'Trovan ID': 'A1',
        'Sala origen': 'Sala 5', 'Tanque origen': 'Tanque 5', 'Sala destino': 'Sala 2', 'Tanque destino': 'Tanque 18' },
    ];
    const m = buildReproModel(matriz, bit, transfer);
    // El evento es del 03-jul: posterior a TR-1 (01-jun) y anterior a TR-2 (01-ago).
    expect(m.desoves[0].sala).toBe('Sala 5');
    expect(m.desoves[0].tanque).toBe('Tanque 5');
    expect(m.derivedEvents).toBe(1);
  });

  it('un evento ANTERIOR a la primera transferencia usa su ORIGEN', () => {
    const bit = [{ 'Trovan ID': 'A1', Fecha: '2026-05-15', Tipo: 'Desove' }];
    const transfer = [
      { 'TR-ID': 'TR-1', Fecha: '2026-06-01', Tipo: 'Traslado', 'Trovan ID': 'A1',
        'Sala origen': 'Sala 1', 'Tanque origen': 'Tanque 3', 'Sala destino': 'Sala 5', 'Tanque destino': 'Tanque 5' },
    ];
    const m = buildReproModel(matriz, bit, transfer);
    expect(m.desoves[0].sala).toBe('Sala 1');
    expect(m.desoves[0].tanque).toBe('Tanque 3');
  });

  it('derivedEvents y transferRowCount describen el estado REAL de hoy', () => {
    // Producción 2026-08-31: toda la Bitácora con snapshot, Transferencias inexistente.
    const bit = [
      { 'Trovan ID': 'A1', Fecha: '2026-07-03', Tipo: 'Desove', Sala: 'Sala 1', Tanque: 'Tanque 3' },
      { 'Trovan ID': 'A2', Fecha: '2026-07-04', Tipo: 'Mortalidad', Sala: 'Sala 1', Tanque: 'Tanque 3' },
    ];
    const m = buildReproModel(matriz, bit, []);
    expect(m.derivedEvents).toBe(0);
    expect(m.transferRowCount).toBe(0);
    // Ésa es justo la pareja que NO debe disparar el aviso de la vista.
  });

  it('cuenta una sola vez por evento, no por hembra', () => {
    const bit = [
      { 'Trovan ID': 'A1', Fecha: '2026-07-01', Tipo: 'Desove' },
      { 'Trovan ID': 'A1', Fecha: '2026-07-02', Tipo: 'Desove' },
      { 'Trovan ID': 'A2', Fecha: '2026-07-03', Tipo: 'Desove', Sala: 'Sala 1', Tanque: 'Tanque 3' },
    ];
    const m = buildReproModel(matriz, bit, []);
    expect(m.derivedEvents).toBe(2);
  });
});
