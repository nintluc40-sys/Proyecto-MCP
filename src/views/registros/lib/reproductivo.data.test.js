import { describe, it, expect } from 'vitest';
import {
  REPRO_MATRIZ_HEADERS, REPRO_MATRIZ_KEYCOLS, REPRO_BITACORA_HEADERS, REPRO_BITACORA_KEYCOLS,
  REPRO_TRANSFER_HEADERS, REPRO_TRANSFER_KEYCOLS, REPRO_ESTADO, REPRO_EVENTO, REPRO_TRANSFER_TIPO,
  normTrovan, parseTrovanList, isValidTrovan, matrixRecordFromSheet, buildMatrixIndex,
  buildAltaBatch, buildEventBatch, nextTrId, buildTransferBatch,
  matrixIndexFromRows, pivotDesoves, individualTrace, matrixSummary, nextTrIdFromRows, trazaDelChip,
} from './reproductivo.data.js';
import { claveIndividuo } from '../../../core/trovan.js';

// Índice de matriz de prueba: 3 hembras (una muerta). Trovan = 10 hex (formato del lector).
const idx = () => buildMatrixIndex([
  { trovan: '0007218CCC', estado: 'Vivo', sala: 'S5', tanque: 'T1' },
  { trovan: '000721B425', estado: 'Vivo', sala: 'S5', tanque: 'T1' },
  { trovan: '000721B9E7', estado: 'Muerto', sala: 'S5', tanque: 'T1' },
]);
const col = (headers, name) => headers.indexOf(name);

describe('esquema de hojas', () => {
  it('las claves de upsert apuntan a las columnas correctas', () => {
    /* 🔑 2026-09-16 · la MATRIZ se llavea por la CUATERNA que identifica al individuo, no por el
       Trovan solo: el mismo chip puede llevar varias hembras (otra piscina, otro código, otro
       lote). Era `[Trovan ID]`, y eso obligaba al GAS a decidir por fechas a qué fila iba cada
       envío. */
    expect(REPRO_MATRIZ_KEYCOLS).toEqual(
      ['Trovan ID', 'Piscina', 'Código genético', 'Lote'].map((n) => col(REPRO_MATRIZ_HEADERS, n)),
    );
    expect(REPRO_BITACORA_KEYCOLS).toEqual(['Trovan ID', 'Fecha', 'Tipo'].map((n) => col(REPRO_BITACORA_HEADERS, n)));
    expect(REPRO_TRANSFER_KEYCOLS).toEqual(['TR-ID', 'Trovan ID'].map((n) => col(REPRO_TRANSFER_HEADERS, n)));
  });
});

describe('normTrovan / parseTrovanList', () => {
  it('normaliza quitando espacios, saneando y en mayúsculas', () => {
    expect(normTrovan(' 0007218ccc ')).toBe('0007218CCC'); // hex a mayúsculas (forma canónica)
    expect(normTrovan(' =98 56 ')).toBe('9856'); // quita el '=' inicial (anti-fórmula) y los espacios
  });
  it('parsea líneas/comas/espacios, deduplica y reporta duplicados', () => {
    const { ids, duplicates } = parseTrovanList('0007218CCC\n000721B425, 0007218ccc\n\n 000721BC99 ');
    expect(ids).toEqual(['0007218CCC', '000721B425', '000721BC99']); // el minúsculas se dedupe contra el mayúsculas
    expect(duplicates).toEqual(['0007218CCC']);
  });
  it('texto vacío → sin ids', () => {
    expect(parseTrovanList('').ids).toEqual([]);
    expect(parseTrovanList(null).ids).toEqual([]);
  });
});

describe('isValidTrovan (formato del lector: 10 hex)', () => {
  it('acepta exactamente 10 caracteres hexadecimales (tras normalizar)', () => {
    expect(isValidTrovan('0007218CCC')).toBe(true);
    expect(isValidTrovan('000721B9E7')).toBe(true);
    expect(isValidTrovan(normTrovan('0007218ccc'))).toBe(true); // minúsculas normalizadas
  });
  it('rechaza notación científica, decimales, comas, texto y longitudes ≠ 10', () => {
    expect(isValidTrovan('8.21E+19')).toBe(false);   // notación científica de Excel
    expect(isValidTrovan('8218000')).toBe(false);    // perdió ceros a la izquierda (< 10)
    expect(isValidTrovan('000721B4250')).toBe(false); // 11 caracteres
    expect(isValidTrovan('000821G425')).toBe(false); // 'G' no es hex
    expect(isValidTrovan('123,456')).toBe(false);
    expect(isValidTrovan('')).toBe(false);
  });
});

describe('buildMatrixIndex / matrixRecordFromSheet', () => {
  it('adapta una fila de la hoja y la indexa por Trovan', () => {
    const rec = matrixRecordFromSheet({ 'Trovan ID': '9856321', 'Estado': 'Vivo', 'Sala actual': 'S5', 'Tanque actual': 'T1' });
    expect(rec.trovan).toBe('9856321');
    expect(rec.sala).toBe('S5');
    const m = buildMatrixIndex([rec]);
    expect(m.get('9856321').estado).toBe('Vivo');
  });
});


describe('Sección 1 · alta MASIVA (grilla)', () => {
  it('arma un solo payload con todas las filas válidas y omite vacías', () => {
    const r = buildAltaBatch([
      { trovan: '000721BC99', numero: '1', sala: 'S6', tanque: 'T2' },
      { trovan: '', numero: '', sala: '', tanque: '' },           // vacía → ignora
      { trovan: '000721ADD7', piscina: 'P3' },
    ]);
    expect(r.payload.rows.length).toBe(2);
    expect(r.report.created).toEqual(['000721BC99', '000721ADD7']);
    expect(r.payload.rows[0][col(REPRO_MATRIZ_HEADERS, 'Estado')]).toBe(REPRO_ESTADO.VIVO);
  });
  it('reporta filas con datos pero sin Trovan, duplicados en el lote y existentes en la matriz', () => {
    const r = buildAltaBatch([
      { trovan: '', numero: '9' },              // datos sin Trovan
      { trovan: '000721AC75' },
      { trovan: '000721AC75' },                 // duplicado en el lote
      { trovan: '0007218CCC' },                 // ya existe en la matriz de prueba
    ], idx());
    expect(r.report.sinTrovan).toBe(1);
    expect(r.report.duplicados).toEqual(['000721AC75']);
    expect(r.report.existentes).toEqual(['0007218CCC']);
    expect(r.report.created).toEqual(['000721AC75']);
    expect(r.payload.rows.length).toBe(1);
  });
  it('señala (invalidFormat) y NO registra los Trovan con formato corrupto', () => {
    const r = buildAltaBatch([
      { trovan: '000721BB30', numero: '1' },    // válido
      { trovan: '8.21E+19', numero: '2' },      // notación científica → señalado
      { trovan: '8218000', numero: '3' },       // perdió ceros a la izquierda → señalado
    ]);
    expect(r.report.created).toEqual(['000721BB30']);
    expect(r.report.invalidFormat).toEqual(['8.21E+19', '8218000']);
    expect(r.payload.rows.length).toBe(1);
  });
  it('sin filas válidas → payload null', () => {
    expect(buildAltaBatch([{ trovan: '', numero: '' }]).payload).toBeNull();
  });
});

describe('Sección 2 · desoves / mortalidades', () => {
  it('desove: añade a bitácora los vivos, omite el muerto y reporta no encontrados', () => {
    const r = buildEventBatch({ ids: ['0007218CCC', '000721B9E7', '000721BB30'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE, matrixIndex: idx() });
    expect(r.matriz).toBeNull();                 // desove no toca la matriz
    expect(r.bitacora.rows.length).toBe(1);      // solo la viva
    expect(r.bitacora.rows[0][col(REPRO_BITACORA_HEADERS, 'Trovan ID')]).toBe('0007218CCC');
    expect(r.bitacora.rows[0][col(REPRO_BITACORA_HEADERS, 'Sala')]).toBe('S5'); // foto de ubicación
    expect(r.report.alreadyDead).toEqual(['000721B9E7']);
    expect(r.report.notFound).toEqual(['000721BB30']);
  });
  it('mortalidad: marca Estado=Muerto + Fecha muerte en la matriz y añade a bitácora', () => {
    const r = buildEventBatch({ ids: ['0007218CCC'], fecha: '2026-07-12', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: idx() });
    expect(r.matriz.rows.length).toBe(1);
    const row = r.matriz.rows[0];
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Estado')]).toBe(REPRO_ESTADO.MUERTO);
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Fecha muerte')]).toBe('2026-07-12');
    // Campos permanentes vacíos → el merge del GAS los preserva.
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Piscina')]).toBe('');
    expect(r.bitacora.rows.length).toBe(1);
  });
  it('SIN matriz rechaza el lote entero: la Sala/Tanque de la bitácora solo salen de la MATRIZ', () => {
    const r = buildEventBatch({ ids: ['0007218CCC', '000721BB30'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE });
    expect(r.error).toMatch(/MATRIZ/);
    expect(r.bitacora).toBeNull();
    expect(r.matriz).toBeNull();
  });
  it('rechaza el individuo que está en la MATRIZ pero sin Sala o Tanque (fila incompleta)', () => {
    const parcial = buildMatrixIndex([
      { trovan: '0007218CCC', estado: 'Vivo', sala: 'S5', tanque: 'T1' },
      { trovan: '000721B425', estado: 'Vivo', sala: 'S5', tanque: '' },   // sin tanque
      { trovan: '000721BC99', estado: 'Vivo', sala: '', tanque: 'T3' },   // sin sala
    ]);
    const r = buildEventBatch({ ids: ['0007218CCC', '000721B425', '000721BC99'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE, matrixIndex: parcial });
    expect(r.bitacora.rows.length).toBe(1);
    expect(r.report.processed).toEqual(['0007218CCC']);
    expect(r.report.sinUbicacion).toEqual(['000721B425', '000721BC99']);
  });
  it('la bitácora toma Sala y Tanque de la MATRIZ, no de lo que teclea el usuario', () => {
    const r = buildEventBatch({ ids: ['0007218CCC'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE, matrixIndex: idx() });
    const row = r.bitacora.rows[0];
    expect(row[col(REPRO_BITACORA_HEADERS, 'Sala')]).toBe('S5');
    expect(row[col(REPRO_BITACORA_HEADERS, 'Tanque')]).toBe('T1');
  });
  it('señala (invalidFormat) y NO registra los Trovan con formato corrupto', () => {
    const r = buildEventBatch({ ids: ['0007218CCC', '8.21E+19', '821B425'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE, matrixIndex: idx() });
    expect(r.bitacora.rows.length).toBe(1);      // solo el válido
    expect(r.report.processed).toEqual(['0007218CCC']);
    expect(r.report.invalidFormat).toEqual(['8.21E+19', '821B425']);
  });
  it('rechaza sin fecha o con tipo inválido', () => {
    expect(buildEventBatch({ ids: ['0007218CCC'], tipo: REPRO_EVENTO.DESOVE, matrixIndex: idx() }).error).toMatch(/fecha/i);
    expect(buildEventBatch({ ids: ['0007218CCC'], fecha: '2026-07-12', tipo: 'X', matrixIndex: idx() }).error).toMatch(/inválido/i);
  });
});

describe('Sección 3 · transferencias', () => {
  it('nextTrId incrementa el máximo con formato TR-000NNN', () => {
    expect(nextTrId([])).toBe('TR-000001');
    expect(nextTrId(['TR-000124', 'TR-000009'])).toBe('TR-000125');
  });
  it('reubica los individuos del origen y escribe el ledger por TR-ID×Trovan', () => {
    const r = buildTransferBatch({
      fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
      origen: { sala: 'S5', tanque: 'T1' },
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['0007218CCC', '000721B425'] }],
      matrixIndex: idx(), trId: 'TR-000125',
    });
    expect(r.matriz.rows.length).toBe(2);
    expect(r.matriz.rows[0][col(REPRO_MATRIZ_HEADERS, 'Sala actual')]).toBe('S6');
    expect(r.transfer.rows.length).toBe(2);
    expect(r.transfer.rows[0][col(REPRO_TRANSFER_HEADERS, 'TR-ID')]).toBe('TR-000125');
    expect(r.report.moved).toEqual(['0007218CCC', '000721B425']);
  });
  it('omite y reporta los individuos que NO están en el origen declarado', () => {
    const r = buildTransferBatch({
      fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
      origen: { sala: 'S9', tanque: 'T9' }, // ninguno está aquí
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['0007218CCC'] }],
      matrixIndex: idx(), trId: 'TR-000126',
    });
    expect(r.matriz).toBeNull();
    expect(r.report.wrongLocation).toEqual(['0007218CCC']);
  });
  /* 🔴 RD1 (2026-09-16) · ERA «sin matriz mueve TODOS los Trovan de cada destino sin validar». Desde que
     la llave de la MATRIZ es la cuaterna, ese modo degradado ya no degrada: DAÑA. La fila de un traslado
     tiene que llevar la piscina, el código y el lote del individuo, y su única fuente es la MATRIZ; sin
     ella iría en blanco, no casaría con la suya y el upsert AÑADIRÍA una fila suelta. Como los eventos,
     sin la MATRIZ no se arma nada. */
  it('🔴 RD1 · sin MATRIZ no se traslada NADA: la fila iría sin su cuaterna y la hoja ganaría una suelta', () => {
    for (const [caso, matrixIndex] of [['sin índice', undefined], ['índice nulo', null], ['algo que no es un índice', {}]]) {
      const r = buildTransferBatch({
        fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
        origen: { sala: 'S5', tanque: 'T1' },
        destinos: [{ sala: 'S6', tanque: 'T2', ids: ['0007218CCC', '000721AFA2'] }],
        matrixIndex, trId: 'TR-000200',
      });
      expect(r.error, caso).toMatch(/Maduración MATRIZ/);
      expect(r.matriz, caso).toBeNull();
      expect(r.transfer, caso).toBeNull();
      expect(r.report.moved, caso).toEqual([]);
    }
  });
  it('señala (invalidFormat) y NO transfiere los Trovan con formato corrupto', () => {
    const r = buildTransferBatch({
      fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
      origen: { sala: 'S5', tanque: 'T1' },
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['0007218CCC', '8.21E+19'] }],
      matrixIndex: idx(), trId: 'TR-000201',   // RD1: sin la MATRIZ ya no se arma nada
    });
    expect(r.report.moved).toEqual(['0007218CCC']);
    expect(r.report.invalidFormat).toEqual(['8.21E+19']);
  });
  it('mezcla: registra la composición del destino', () => {
    const r = buildTransferBatch({
      fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.MEZCLA,
      origen: { sala: 'S5', tanque: 'T1' },
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['0007218CCC'] }],
      composicion: { lotes: 'A+B', codigos: 'G01+G05', piscinas: 'P1+P2' },
      matrixIndex: idx(), trId: 'TR-000127',
    });
    const row = r.transfer.rows[0];
    expect(row[col(REPRO_TRANSFER_HEADERS, 'Mezcla')]).toBe('Sí');
    expect(row[col(REPRO_TRANSFER_HEADERS, 'Lotes presentes')]).toBe('A+B');
    expect(row[col(REPRO_TRANSFER_HEADERS, 'Códigos presentes')]).toBe('G01+G05');
  });

  /* 🔴 1d (2026-09-22) · UNA HEMBRA MUERTA NO SE TRASLADA. Hasta hoy el traslado no miraba el Estado —el evento sí:
     «ya muerta»— y la muerta del fixture, que está en el mismo origen que las vivas, se «movía»: fila en Transferencias
     y Sala/Tanque nuevos en la MATRIZ, sin revivirla. Ninguna prueba la metía en un traslado, y nadie lo vio. */
  const trasladar = (ids, origen = { sala: 'S5', tanque: 'T1' }, matrixIndex = idx()) => buildTransferBatch({
    fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO, origen,
    destinos: [{ sala: 'S6', tanque: 'T2', ids }], matrixIndex, trId: 'TR-000128',
  });
  it('🔴 1d · una hembra MUERTA en el origen no se traslada: sale como «ya muerta» y no se escribe nada de ella', () => {
    const r = trasladar(['0007218CCC', '000721B9E7']);
    expect(r.report.alreadyDead).toEqual(['000721B9E7']);
    expect(r.report.moved).toEqual(['0007218CCC']);            // la viva de al lado sale igual
    expect(r.matriz.rows.map((f) => f[col(REPRO_MATRIZ_HEADERS, 'Trovan ID')])).toEqual(['0007218CCC']);
    expect(r.transfer.rows.map((f) => f[col(REPRO_TRANSFER_HEADERS, 'Trovan ID')])).toEqual(['0007218CCC']);
  });
  it('1d · sola, la muerta deja el traslado sin nada que escribir', () => {
    const r = trasladar(['000721B9E7']);
    expect(r.matriz).toBeNull();
    expect(r.transfer).toBeNull();
    expect(r.report.alreadyDead).toEqual(['000721B9E7']);
  });
  it('1d · «ya muerta» va antes que el origen: fuera de él, también se dice que está muerta', () => {
    const r = trasladar(['000721B9E7'], { sala: 'S9', tanque: 'T9' });
    expect(r.report.alreadyDead).toEqual(['000721B9E7']);
    expect(r.report.wrongLocation).toEqual([]);
  });
  it('1d · el Estado se lee como en el recuento de vivas: « Muerto », con espacios, también es muerta', () => {
    const r = trasladar(['000721B9E7'], undefined, buildMatrixIndex([{ trovan: '000721B9E7', estado: ' Muerto ', sala: 'S5', tanque: 'T1' }]));
    expect(r.report.alreadyDead).toEqual(['000721B9E7']);
    expect(r.report.moved).toEqual([]);
  });
  it('1d · un chip reciclado (la anterior muerta, la nueva viva) se traslada: va a la VIVA, con su cuaterna', () => {
    const reciclado = matrixIndexFromRows([
      { 'Trovan ID': '000721B9E7', 'Piscina': 'P2', 'Código genético': 'G01', 'Lote': 'L12', 'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Muerto' },
      { 'Trovan ID': '000721B9E7', 'Piscina': 'P9', 'Código genético': 'G07', 'Lote': 'L20', 'Sala actual': 'S5', 'Tanque actual': 'T1', 'Estado': 'Vivo' },
    ]);
    const r = trasladar(['000721B9E7'], undefined, reciclado);
    expect(r.report.alreadyDead).toEqual([]);
    expect(r.report.moved).toEqual(['000721B9E7']);
    expect(r.matriz.rows[0][col(REPRO_MATRIZ_HEADERS, 'Lote')]).toBe('L20');
  });
});

// Filas "crudas" como las entrega el store/lectura (objetos con claves de cabecera).
const mrow = (o) => ({ 'Trovan ID': o.t, 'Estado': o.e || 'Vivo', 'Sala actual': o.s || '', 'Tanque actual': o.tq || '' });
const brow = (o) => ({ 'Trovan ID': o.t, 'Fecha': o.f, 'Tipo': o.tipo });
const trow = (o) => ({ 'TR-ID': o.tr, 'Fecha': o.f, 'Tipo': o.tipo || 'Traslado', 'Trovan ID': o.t, 'Sala origen': o.so, 'Tanque origen': o.to, 'Sala destino': o.sd, 'Tanque destino': o.td, 'Mezcla': o.m || 'No' });

describe('Tanda 5 · Consulta / reportes', () => {
  it('matrixIndexFromRows indexa por Trovan desde filas de hoja', () => {
    const m = matrixIndexFromRows([mrow({ t: '111', e: 'Vivo', s: 'S5', tq: 'T1' })]);
    expect(m.get('111').sala).toBe('S5');
    expect(m.get('111').estado).toBe('Vivo');
  });
  it('pivotDesoves arma la matriz ancha (Trovan × fecha) solo con desoves', () => {
    const bit = [
      brow({ t: '111', f: '2026-07-10', tipo: 'Desove' }),
      brow({ t: '111', f: '2026-07-12', tipo: 'Desove' }),
      brow({ t: '222', f: '2026-07-10', tipo: 'Desove' }),
      brow({ t: '333', f: '2026-07-10', tipo: 'Mortalidad' }), // no cuenta
    ];
    const p = pivotDesoves(bit);
    expect(p.dates).toEqual(['2026-07-10', '2026-07-12']);
    const r111 = p.rows.find((x) => x.trovan === '111');
    expect(r111.total).toBe(2);
    expect(r111.byDate['2026-07-10']).toBe(1);
    expect(r111.byDate['2026-07-12']).toBe(1);
    const r222 = p.rows.find((x) => x.trovan === '222');
    expect(r222.byDate['2026-07-12']).toBe(''); // no desovó ese día
    expect(p.rows.some((x) => x.trovan === '333')).toBe(false); // mortalidad no entra
  });
  it('individualTrace reconstruye el historial y la ubicación actual', () => {
    const tr = [
      trow({ tr: 'TR-000001', f: '2026-07-05', t: '111', so: 'S5', to: 'T1', sd: 'S6', td: 'T2' }),
      trow({ tr: 'TR-000002', f: '2026-07-09', t: '111', so: 'S6', to: 'T2', sd: 'S6', td: 'T3' }),
      trow({ tr: 'TR-000001', f: '2026-07-05', t: '999', so: 'S5', to: 'T1', sd: 'S6', td: 'T2' }),
    ];
    const h = individualTrace(tr, '111');
    expect(h.movimientos.length).toBe(2);
    expect(h.current).toEqual({ sala: 'S6', tanque: 'T3' }); // último destino
  });
  it('matrixSummary cuenta vivas/muertas y por ubicación', () => {
    const s = matrixSummary([
      mrow({ t: '111', e: 'Vivo', s: 'S5', tq: 'T1' }),
      mrow({ t: '222', e: 'Vivo', s: 'S5', tq: 'T1' }),
      mrow({ t: '333', e: 'Muerto', s: 'S5', tq: 'T2' }),
    ]);
    expect(s.total).toBe(3);
    expect(s.vivas).toBe(2);
    expect(s.muertas).toBe(1);
    expect(s.ubicaciones[0]).toEqual({ ubicacion: 'S5 · T1', n: 2 });
  });
  it('nextTrIdFromRows reconcilia con el máximo del ledger', () => {
    expect(nextTrIdFromRows([trow({ tr: 'TR-000007' }), trow({ tr: 'TR-000123' })])).toBe('TR-000124');
    expect(nextTrIdFromRows([])).toBe('TR-000001');
  });
});

/* ── ♻ MICROCHIPS RECICLADOS (2026-09-14) ─────────────────────────────────────
   Pedido del usuario: dar de alta hembras nuevas con el microchip de una que YA MURIÓ (otro lote,
   otra piscina, otro código genético). Antes el alta lo rechazaba como «ya existente» por la sola
   presencia del chip en la MATRIZ. Filas como las entrega la hoja (objetos con cabeceras). */
const CHIP = '0007219380';
const VIEJA = { 'Número': '7', 'Trovan ID': CHIP, 'Color anillo': 'Rojo', 'Piscina': 'P2', 'Código genético': 'G01', 'Lote': 'L12',
  'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Muerto', 'Fecha muerte': '2026-07-08', 'Fecha ingreso': '2026-01-05' };
const NUEVA = { 'Número': '31', 'Trovan ID': CHIP, 'Color anillo': 'Azul', 'Piscina': 'P9', 'Código genético': 'G07', 'Lote': 'L20',
  'Sala actual': 'S3', 'Tanque actual': 'T4', 'Estado': 'Vivo', 'Fecha muerte': '', 'Fecha ingreso': '2026-08-01' };
const OTRA_VIVA = { 'Trovan ID': '0007218CCC', 'Sala actual': 'S5', 'Tanque actual': 'T1', 'Estado': 'Vivo', 'Fecha ingreso': '2026-02-01' };
// La lectura de respaldo del GAS NO trae fechas: pide sólo las 7 columnas de `_REPRO_MATRIZ_COLS` (engine.js).
// ⚠ 2026-09-22 · aquí ponía «sólo trae 4 columnas», y desde la cuaterna (09-16) trae también piscina, código y lote.
// Con 4, las dos hembras de un chip tenían la MISMA cuaterna, se fundían en una y el chip no se partía nunca: la rama
// de la Consulta sin fechas, que daba los desoves de la vigente a la primera hembra («chip·#1»), no la veía nadie.
const sinFechas = (o) => ({ 'Trovan ID': o['Trovan ID'], 'Piscina': o['Piscina'], 'Código genético': o['Código genético'], 'Lote': o['Lote'],
  'Sala actual': o['Sala actual'], 'Tanque actual': o['Tanque actual'], 'Estado': o['Estado'] });
const altaDe = (fecha, extra) => [Object.assign({ trovan: CHIP, numero: '44', lote: 'L33', codigo: 'G09', piscina: 'P4', sala: 'S2', tanque: 'T8', fecha }, extra)];

describe('♻ reciclaje · el índice da la hembra VIGENTE de cada chip', () => {
  it('🔴 con la muerta y la nueva, el índice da la NUEVA, esté arriba o abajo en la hoja', () => {
    for (const filas of [[VIEJA, NUEVA], [NUEVA, VIEJA]]) {
      const r = matrixIndexFromRows(filas).get(CHIP);
      expect(r.sala).toBe('S3');
      expect(r.estado).toBe('Vivo');
      expect(r.individuos).toBe(2);
    }
  });
  /* 🗑 2026-09-17 · AQUÍ SE PROBABA `fechaLimite`, y era una prueba en verde de algo que nadie usaba: el
     campo lo pedía la regla de sucesión por fechas, retirada el 09-16 con la cuaterna. Se va el campo y
     se va su prueba. Lo que queda es exigir que el registro del chip NO traiga más de lo que se usa: un
     campo de sobra con prueba propia invita a usarlo creyendo que significa algo vigente. */
  it('🔴 el registro del chip trae SÓLO lo que se usa: nada de restos de reglas retiradas', () => {
    const r = matrixIndexFromRows([VIEJA, NUEVA]).get(CHIP);
    expect(r.fechaLimite, 'volvió `fechaLimite`, que no lo lee nadie').toBeUndefined();
    expect([r.individuos, r.vivos], 'y los dos que sí se usan siguen ahí').toEqual([2, 1]);
  });
  it('un chip con una sola fila sigue igual: 1 individuo', () => {
    const r = matrixIndexFromRows([OTRA_VIVA]).get('0007218CCC');
    expect(r.individuos).toBe(1);
    expect(r.sala).toBe('S5');
  });
});

describe('♻ reciclaje · alta de una hembra nueva con el chip de una muerta', () => {
  it('🔴 si la hembra del chip está MUERTA, entra como hembra nueva con SUS datos', () => {
    const r = buildAltaBatch(altaDe('2026-07-20'), matrixIndexFromRows([VIEJA]), { reciclaje: true });
    expect(r.report.created).toEqual([CHIP]);
    expect(r.report.reciclados).toEqual([CHIP]);
    expect(r.report.existentes).toEqual([]);
    const fila = r.payload.rows[0];
    expect(fila[col(REPRO_MATRIZ_HEADERS, 'Lote')]).toBe('L33');
    expect(fila[col(REPRO_MATRIZ_HEADERS, 'Código genético')]).toBe('G09');
    expect(fila[col(REPRO_MATRIZ_HEADERS, 'Estado')]).toBe(REPRO_ESTADO.VIVO);
    expect(fila[col(REPRO_MATRIZ_HEADERS, 'Fecha ingreso')]).toBe('2026-07-20');
    expect(fila[col(REPRO_MATRIZ_HEADERS, 'Fecha muerte')]).toBe('');
  });
  /* 🔑 2026-09-16 · LAS CUATRO PRUEBAS QUE HABÍA AQUÍ FIJABAN LOS TRES RECHAZOS QUE EL USUARIO
     REPORTÓ, y se reescriben porque la regla cambió por decisión suya: «puedo usar el mismo Trovan
     mientras no se repitan Piscina, Código genético y Lote». Lo que exigían —la anterior muerta, el
     ingreso posterior a su muerte, y que el GAS anunciara saber reciclar— ya no son condiciones. */
  it('🔴 con la hembra del chip VIVA también entra: es otro individuo, no un duplicado', () => {
    const r = buildAltaBatch(altaDe('2026-09-10'), matrixIndexFromRows([VIEJA, NUEVA]));
    expect(r.report.created).toEqual([CHIP]);
    expect(r.report.existentes).toEqual([]);
    expect(r.report.reciclados).toEqual([CHIP]);      // informativo: el chip ya tenía individuos
    expect(r.payload.rows).toHaveLength(1);
  });
  it('🔴 la fecha YA NO decide: el mismo día de la muerte, o antes, entra igual', () => {
    const idxV = matrixIndexFromRows([VIEJA]);
    expect(buildAltaBatch(altaDe('2026-07-08'), idxV).report.created).toEqual([CHIP]);
    expect(buildAltaBatch(altaDe('2026-01-01'), idxV).report.created).toEqual([CHIP]);
    expect(buildAltaBatch(altaDe('20/13/2026'), idxV).report.created).toEqual([CHIP]);   // fecha ilegible
  });
  it('🔴 y ya NO se pide nada al GAS: sin opciones se envía igual', () => {
    const r = buildAltaBatch(altaDe('2026-07-20'), matrixIndexFromRows([VIEJA]));
    expect(r.report.created).toEqual([CHIP]);
    expect(r.payload.rows).toHaveLength(1);
    expect(r.report.reciclajeSinGas).toBeUndefined();   // el motivo se retiró, no se dejó en cero
    expect(r.report.reciclajeFecha).toBeUndefined();
  });
  it('🔴 lo que SÍ se rechaza: la misma cuaterna que ya está en la hoja', () => {
    /* NUEVA es (CHIP · P9 · G07 · L20). Un alta con esos tres mismos es el MISMO individuo. */
    const misma = [{ trovan: CHIP, piscina: 'P9', codigo: 'G07', lote: 'L20', sala: 'S3', tanque: 'T4', fecha: '2026-09-11' }];
    const r = buildAltaBatch(misma, matrixIndexFromRows([VIEJA, NUEVA]));
    expect(r.report.existentes).toEqual([CHIP]);
    expect(r.report.created).toEqual([]);
    expect(r.payload).toBeNull();
  });
  it('🔴 y cambiar UNA sola de las tres ya la convierte en otra: el fixture lo distingue', () => {
    const idx = matrixIndexFromRows([VIEJA, NUEVA]);
    for (const dif of [{ piscina: 'P1' }, { codigo: 'G99' }, { lote: 'L77' }]) {
      const f = [Object.assign({ trovan: CHIP, piscina: 'P9', codigo: 'G07', lote: 'L20', fecha: '2026-09-11' }, dif)];
      expect(buildAltaBatch(f, idx).report.created, JSON.stringify(dif)).toEqual([CHIP]);
    }
  });
  /* 🔴 D17 (2026-09-17, decisión del usuario) · Un chip con DOS hembras vivas a la vez es posible desde que la
     identidad es la cuaterna, pero el usuario lo cerró: «difícil que haya hembras vivas con el mismo patrón, por
     lo que dicho caso no pasaría». Medido ese día en producción: 1665 filas, 1665 chips, ninguno con más de una.
     🔑 Y como no pasa, RECHAZARLO no cuesta nada y cierra la puerta a lo único que podía salir mal: el evento
     sólo trae el Trovan, así que elegir una sería una convención —y sin las columnas de fecha, que NO se leen,
     sería «la de más abajo en la hoja»—, y una mortalidad así marcaría «Muerto» a la hembra equivocada. */
  describe('🔴 D17 · dos hembras VIVAS en el mismo chip', () => {
    const VIVA_A = Object.assign({}, NUEVA, { 'Piscina': 'P9', 'Código genético': 'G07', 'Lote': 'L20' });
    const VIVA_B = Object.assign({}, NUEVA, { 'Número': '32', 'Piscina': 'P3', 'Código genético': 'G11', 'Lote': 'L44', 'Sala actual': 'S8', 'Tanque actual': 'T2' });

    for (const tipo of [REPRO_EVENTO.MORTALIDAD, REPRO_EVENTO.DESOVE]) {
      it('no se elige una: ' + tipo + ' se rechaza y se dice', () => {
        const r = buildEventBatch({ ids: [CHIP], fecha: '2026-09-12', tipo, matrixIndex: matrixIndexFromRows([VIVA_A, VIVA_B]) });
        expect(r.report.variasVivas).toEqual([CHIP]);
        expect(r.report.processed, 'se registró igual, eligiendo una').toEqual([]);
        expect(r.bitacora, 'se escribió en la Bitácora sin saber de quién era').toBeNull();
        expect(r.matriz).toBeNull();
      });
    }

    /* 🔴 2026-09-17 · LA OTRA MITAD, la que D17 no cubre. Un chip con varias hembras donde SÓLO UNA vive:
       el evento va a ella, que es lo correcto… salvo que sea retroactivo y fuera de una anterior. Eso lo
       detecta `antesDeSuIngreso`, PERO sólo si la lectura trae la fecha de ingreso.
       🔑 Y aquí está la asimetría real entre los dos destinos: en el repo/Pages la MATRIZ sale del STORE
       del tablero y trae todas las columnas, mientras que en `index (8)` —que no tiene store— sale de la
       lectura del GAS, que NO pide las de fecha porque cuestan 10×. Allí la comprobación no puede hacerse.
       ⚠ Hasta hoy eso se dejaba pasar en silencio «porque el GAS frena la mortalidad», y ese freno se fue
       con `llaveMatriz_` el 09-16. Ya no se calla: se registra igual y se DICE que no se pudo comprobar. */
    describe('🔴 chip con varias hembras y la lectura SIN fechas', () => {
      const SIN_FECHAS = (o) => ({ 'Trovan ID': o['Trovan ID'], 'Piscina': o['Piscina'], 'Código genético': o['Código genético'],
        'Lote': o['Lote'], 'Sala actual': o['Sala actual'], 'Tanque actual': o['Tanque actual'], 'Estado': o['Estado'] });

      it('se registra a la vigente, pero se AVISA de que no se pudo comprobar', () => {
        const idx = matrixIndexFromRows([VIEJA, VIVA_A].map(SIN_FECHAS));
        const r = buildEventBatch({ ids: [CHIP], fecha: '2026-09-12', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: idx });
        expect(r.report.processed, 'no se rechaza: casi todos los eventos son del día y van a la vigente').toEqual([CHIP]);
        expect(r.report.sinFechaIngreso, 'se registró en silencio, sin decir que la comprobación no se hizo').toEqual([CHIP]);
      });

      it('CON fechas no avisa, porque la comprobación sí se hace', () => {
        const r = buildEventBatch({ ids: [CHIP], fecha: '2026-09-12', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: matrixIndexFromRows([VIEJA, VIVA_A]) });
        expect(r.report.sinFechaIngreso).toEqual([]);
        expect(r.report.processed).toEqual([CHIP]);
      });

      it('y un chip de UNA sola hembra no avisa nunca: no hay de quién más pueda ser', () => {
        const r = buildEventBatch({ ids: [CHIP], fecha: '2026-09-12', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: matrixIndexFromRows([SIN_FECHAS(VIVA_A)]) });
        expect(r.report.sinFechaIngreso).toEqual([]);
        expect(r.report.processed).toEqual([CHIP]);
      });

      it('el fixture ejerce algo: CON fechas, un evento ANTERIOR al ingreso sí se rechaza', () => {
        const r = buildEventBatch({ ids: [CHIP], fecha: '2026-02-01', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: matrixIndexFromRows([VIEJA, VIVA_A]) });
        expect(r.report.antesDelIngreso, 'la fecha es anterior al ingreso de la viva: es de la anterior').toEqual([CHIP]);
        expect(r.report.processed).toEqual([]);
      });
    });

    it('el fixture ejerce algo: con UNA viva y otra MUERTA en el mismo chip, el evento sí entra', () => {
      const r = buildEventBatch({ ids: [CHIP], fecha: '2026-09-12', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: matrixIndexFromRows([VIEJA, VIVA_A]) });
      expect(r.report.variasVivas).toEqual([]);
      expect(r.report.processed).toEqual([CHIP]);
      expect(r.matriz.rows[0][col(REPRO_MATRIZ_HEADERS, 'Lote')], 'fue a la fila de la que estaba viva').toBe('L20');
    });

    it('y la cuenta de vivas es de VIVAS, no de filas: tres filas con una sola viva no lo disparan', () => {
      const MUERTA_2 = Object.assign({}, VIVA_B, { 'Estado': 'Muerto' });
      const idxTres = matrixIndexFromRows([VIEJA, MUERTA_2, VIVA_A]);
      expect(idxTres.get(CHIP).individuos, 'el chip tiene tres filas').toBe(3);
      expect(idxTres.get(CHIP).vivos).toBe(1);
      expect(buildEventBatch({ ids: [CHIP], fecha: '2026-09-12', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: idxTres }).report.processed).toEqual([CHIP]);
    });
  });

  /* 🔴 R5 (2026-09-18) · D17 dejaba el chip SIN SALIDA desde la app: el alta admite reutilizar el chip de una hembra
     VIVA (la identidad es la cuaterna), y desde ese momento D17 rechazaba TODO evento de ese chip —también la
     mortalidad que habría cerrado a una de las dos—. Sólo se arreglaba en la hoja. Y el traslado ni lo miraba: movía a
     «la vigente». Ahora el sistema sigue sin elegir, pero ELIGE EL USUARIO, por la cuaterna de cada hembra, y el
     módulo valida que la elegida esté viva y sea de ese chip. */
  describe('🔴 R5 · con dos vivas elige el USUARIO, y el traslado tampoco elige solo', () => {
    const VIVA_A = Object.assign({}, NUEVA, { 'Piscina': 'P9', 'Código genético': 'G07', 'Lote': 'L20' });
    const VIVA_B = Object.assign({}, NUEVA, { 'Número': '32', 'Piscina': 'P3', 'Código genético': 'G11', 'Lote': 'L44', 'Sala actual': 'S8', 'Tanque actual': 'T2' });
    const idxAB = () => matrixIndexFromRows([VIVA_A, VIVA_B]);
    const opcion = (i, lote) => i.get(CHIP).opciones.find((o) => o.lote === lote);
    const TRAS = (i, origen, eleccion, trId = 'TR-000010') => buildTransferBatch({ fecha: '2026-09-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
      origen, destinos: [{ sala: 'S9', tanque: 'T9', ids: [CHIP] }], composicion: {}, matrixIndex: i, trId, eleccion });

    it('el registro del chip OFRECE sus dos vivas, con lo que hace falta para reconocerlas', () => {
      const ops = idxAB().get(CHIP).opciones;
      expect(ops.map((o) => [o.piscina, o.codigo, o.lote, o.sala, o.tanque])).toEqual([['P9', 'G07', 'L20', 'S3', 'T4'], ['P3', 'G11', 'L44', 'S8', 'T2']]);
      expect(ops.map((o) => o.ind)).toEqual([claveIndividuo(CHIP, 'P9', 'G07', 'L20'), claveIndividuo(CHIP, 'P3', 'G11', 'L44')]);
    });

    it('con UNA sola viva no hay nada que elegir: el registro no trae opciones', () => {
      expect(matrixIndexFromRows([VIEJA, VIVA_A]).get(CHIP).opciones).toBeUndefined();
    });

    it('el fixture ejerce algo: la VIGENTE es la B, así que elegir la A distingue «la elegida» de «la vigente»', () => {
      expect(idxAB().get(CHIP).lote).toBe('L44');
    });

    for (const tipo of [REPRO_EVENTO.MORTALIDAD, REPRO_EVENTO.DESOVE]) {
      it('🔴 ' + tipo + ' con la hembra ELEGIDA se registra a ésa: su ubicación en la Bitácora y su cuaterna en la MATRIZ', () => {
        const i = idxAB();
        const r = buildEventBatch({ ids: [CHIP], fecha: '2026-09-12', tipo, matrixIndex: i, eleccion: { [CHIP]: opcion(i, 'L20').ind } });
        expect(r.report.variasVivas).toEqual([]);
        expect(r.report.elegidas).toEqual([CHIP]);
        expect(r.report.processed).toEqual([CHIP]);
        const b = r.bitacora.rows[0];
        expect([b[col(REPRO_BITACORA_HEADERS, 'Sala')], b[col(REPRO_BITACORA_HEADERS, 'Tanque')]], 'salió la ubicación de la vigente, no la de la elegida').toEqual(['S3', 'T4']);
        if (tipo === REPRO_EVENTO.MORTALIDAD) expect(r.matriz.rows[0][col(REPRO_MATRIZ_HEADERS, 'Lote')]).toBe('L20');
      });
    }

    it('🔴 una elección que NO vale no elige por su cuenta: una muerta, la de otro chip, el Trovan a secas o basura', () => {
      const MUERTA = Object.assign({}, VIVA_B, { 'Estado': 'Muerto', 'Lote': 'L55', 'Fecha muerte': '2026-08-01' });
      const OTRO = { 'Trovan ID': '000721AFF4', 'Piscina': 'P1', 'Código genético': 'G01', 'Lote': 'L01', 'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Vivo' };
      const i = matrixIndexFromRows([VIVA_A, VIVA_B, MUERTA, OTRO]);
      for (const mala of [claveIndividuo(CHIP, 'P3', 'G11', 'L55'), claveIndividuo('000721AFF4', 'P1', 'G01', 'L01'), CHIP, 'lo que sea']) {
        const r = buildEventBatch({ ids: [CHIP], fecha: '2026-09-12', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: i, eleccion: { [CHIP]: mala } });
        expect(r.report.variasVivas, JSON.stringify(mala)).toEqual([CHIP]);
        expect(r.matriz).toBeNull();
      }
    });

    it('🔴 el TRASLADO de un chip con dos vivas no mueve a la vigente: se rechaza y se ofrece elegir', () => {
      const t = TRAS(idxAB(), { sala: 'S3', tanque: 'T4' });
      expect(t.report.variasVivas).toEqual([CHIP]);
      expect(t.report.moved).toEqual([]);
      expect(t.matriz).toBeNull();
      expect(t.transfer).toBeNull();
    });

    it('🔴 y con la elegida se mueve ésa, y el origen se comprueba sobre ELLA', () => {
      const i = idxAB();
      const a = opcion(i, 'L20').ind;                      // la A, que NO es la vigente
      const bien = TRAS(i, { sala: 'S3', tanque: 'T4' }, { [CHIP]: a }, 'TR-000011');
      expect(bien.report.moved).toEqual([CHIP]);
      expect(bien.report.elegidas).toEqual([CHIP]);
      expect(bien.matriz.rows[0][col(REPRO_MATRIZ_HEADERS, 'Lote')]).toBe('L20');
      expect(bien.matriz.rows[0][col(REPRO_MATRIZ_HEADERS, 'Sala actual')]).toBe('S9');
      /* La B (la vigente) está en S8/T2: declarar ese origen para mover a la A la deja FUERA del origen. */
      expect(TRAS(i, { sala: 'S8', tanque: 'T2' }, { [CHIP]: a }).report.wrongLocation).toEqual([CHIP]);
    });

    it('🔴 con dos vivas, «anterior al ingreso» se mira sobre la ELEGIDA, y sin elegir se pregunta', () => {
      /* A ingresó el 2026-08-01 (NUEVA) y B el 2026-09-05: un desove del 2026-08-20 puede ser de A, nunca de B. */
      const i = matrixIndexFromRows([VIVA_A, Object.assign({}, VIVA_B, { 'Fecha ingreso': '2026-09-05' })]);
      const ev = (eleccion) => buildEventBatch({ ids: [CHIP], fecha: '2026-08-20', tipo: REPRO_EVENTO.DESOVE, matrixIndex: i, eleccion });
      expect(ev({ [CHIP]: opcion(i, 'L20').ind }).report.processed).toEqual([CHIP]);
      expect(ev({ [CHIP]: opcion(i, 'L44').ind }).report.antesDelIngreso).toEqual([CHIP]);
      expect(ev(undefined).report.variasVivas, 'sin elegir no se juzga por la vigente: se pregunta').toEqual([CHIP]);
    });

    it('🔴 el ALTA avisa cuando el chip ya lo lleva una VIVA (en la hoja o en el mismo lote), no cuando sólo lo llevó una muerta', () => {
      expect(buildAltaBatch(altaDe('2026-09-10'), matrixIndexFromRows([VIVA_A])).report.recicladosVivos).toEqual([CHIP]);
      const conMuerta = buildAltaBatch(altaDe('2026-09-10'), matrixIndexFromRows([VIEJA])).report;
      expect([conMuerta.reciclados, conMuerta.recicladosVivos]).toEqual([[CHIP], []]);
      const base = { trovan: '000721BC99', piscina: 'P4', codigo: 'G09', lote: 'L33', fecha: '2026-09-11' };
      expect(buildAltaBatch([base, Object.assign({}, base, { lote: 'L34' })], null).report.recicladosVivos).toEqual(['000721BC99']);
    });
  });

  /* 🔴 LO DESTAPÓ EL BANCO: la mutación «la mortalidad no manda la identidad» SOBREVIVÍA aquí. Que
     el GAS lo probara no basta —esto es el constructor, y es donde se decide qué viaja—. Si estas
     tres columnas salieran en blanco, la fila no casaría con la de la hembra y el upsert AÑADIRÍA
     una suelta con un Trovan y una fecha de muerte, en vez de marcarla muerta. */
  it('🔴 la mortalidad manda la CUATERNA, no sólo el Trovan (o no casaría con su fila)', () => {
    const idx = matrixIndexFromRows([NUEVA]);
    const r = buildEventBatch({ ids: [CHIP], fecha: '2026-09-12', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: idx });
    const f = r.matriz.rows[0];
    expect(f[col(REPRO_MATRIZ_HEADERS, 'Trovan ID')]).toBe(CHIP);
    expect(f[col(REPRO_MATRIZ_HEADERS, 'Piscina')]).toBe('P9');
    expect(f[col(REPRO_MATRIZ_HEADERS, 'Código genético')]).toBe('G07');
    expect(f[col(REPRO_MATRIZ_HEADERS, 'Lote')]).toBe('L20');
    expect(f[col(REPRO_MATRIZ_HEADERS, 'Estado')]).toBe(REPRO_ESTADO.MUERTO);
    expect(r.matriz.keyCols).toEqual(REPRO_MATRIZ_KEYCOLS);
  });

  it('🔴 y el traslado también: cambia la ubicación pero la identidad viaja entera', () => {
    const idx = matrixIndexFromRows([NUEVA]);
    const t = buildTransferBatch({ fecha: '2026-09-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
      origen: { sala: 'S3', tanque: 'T4' }, destinos: [{ sala: 'S9', tanque: 'T9', ids: [CHIP] }],
      composicion: {}, matrixIndex: idx, trId: 'TR-000009' });
    const f = t.matriz.rows[0];
    expect(f[col(REPRO_MATRIZ_HEADERS, 'Piscina')]).toBe('P9');
    expect(f[col(REPRO_MATRIZ_HEADERS, 'Código genético')]).toBe('G07');
    expect(f[col(REPRO_MATRIZ_HEADERS, 'Lote')]).toBe('L20');
    expect(f[col(REPRO_MATRIZ_HEADERS, 'Sala actual')]).toBe('S9');
  });

  it('🔴 dentro del MISMO lote, la cuaterna repetida es un duplicado; con una distinta, entran las dos', () => {
    const base = { trovan: CHIP, piscina: 'P4', codigo: 'G09', lote: 'L33', fecha: '2026-09-11' };
    const r = buildAltaBatch([Object.assign({}, base), Object.assign({}, base)], null);
    expect(r.report.created).toEqual([CHIP]);
    expect(r.report.duplicados).toEqual([CHIP]);
    const r2 = buildAltaBatch([Object.assign({}, base), Object.assign({}, base, { lote: 'L34' })], null);
    expect(r2.report.created).toEqual([CHIP, CHIP]);
    expect(r2.report.duplicados).toEqual([]);
  });
  it('sin fechas en la lectura (respaldo del GAS) se deja pasar: la fecha la valida el GAS al escribir', () => {
    const r = buildAltaBatch(altaDe('2026-07-01'), matrixIndexFromRows([sinFechas(VIEJA)]), { reciclaje: true });
    expect(r.report.reciclados).toEqual([CHIP]);
  });
  it('mezcla en un mismo lote: la nueva se registra y la del chip vivo no; nada más cambia', () => {
    const forms = [
      { trovan: '000721BC99', sala: 'S6', tanque: 'T2', fecha: '2026-09-10' },   // chip nuevo
      altaDe('2026-09-10')[0],                                                    // chip reciclado
      { trovan: '0007218CCC', fecha: '2026-09-10' },                              // chip de una viva
    ];
    const r = buildAltaBatch(forms, matrixIndexFromRows([VIEJA, OTRA_VIVA]), { reciclaje: true });
    expect(r.report.created).toEqual(['000721BC99', CHIP]);
    expect(r.report.reciclados).toEqual([CHIP]);
    expect(r.report.existentes).toEqual(['0007218CCC']);
    expect(r.payload.rows).toHaveLength(2);
  });
});

describe('♻ reciclaje · un evento anterior al ingreso de la hembra vigente es de otra', () => {
  const idxR = () => matrixIndexFromRows([VIEJA, NUEVA]);
  it('🔴 un desove anterior a su ingreso NO se registra con la ubicación de la nueva', () => {
    const r = buildEventBatch({ ids: [CHIP], fecha: '2026-07-30', tipo: REPRO_EVENTO.DESOVE, matrixIndex: idxR() });
    expect(r.report.antesDelIngreso).toEqual([CHIP]);
    expect(r.bitacora).toBeNull();
  });
  it('🔴 una mortalidad anterior a su ingreso NO mata a la nueva', () => {
    const r = buildEventBatch({ ids: [CHIP], fecha: '2026-07-30', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: idxR() });
    expect(r.report.antesDelIngreso).toEqual([CHIP]);
    expect(r.matriz).toBeNull();
  });
  it('desde su ingreso, el evento es de la nueva: su Sala y su Tanque', () => {
    const r = buildEventBatch({ ids: [CHIP], fecha: '2026-08-01', tipo: REPRO_EVENTO.DESOVE, matrixIndex: idxR() });
    expect(r.report.processed).toEqual([CHIP]);
    expect(r.bitacora.rows[0][col(REPRO_BITACORA_HEADERS, 'Sala')]).toBe('S3');
    expect(r.bitacora.rows[0][col(REPRO_BITACORA_HEADERS, 'Tanque')]).toBe('T4');
  });
  it('con UNA sola hembra en el chip no cambia nada: un evento anterior a su ingreso se registra como siempre', () => {
    const r = buildEventBatch({ ids: [CHIP], fecha: '2026-07-30', tipo: REPRO_EVENTO.DESOVE, matrixIndex: matrixIndexFromRows([NUEVA]) });
    expect(r.report.processed).toEqual([CHIP]);
    expect(r.report.antesDelIngreso).toEqual([]);
  });
  it('sin fechas en la lectura no se puede saber: se registra (la mortalidad la frena el GAS)', () => {
    const r = buildEventBatch({ ids: [CHIP], fecha: '2026-07-30', tipo: REPRO_EVENTO.DESOVE, matrixIndex: matrixIndexFromRows([sinFechas(VIEJA), sinFechas(NUEVA)]) });
    expect(r.report.processed).toEqual([CHIP]);
  });
  it('🔴 un traslado anterior a su ingreso NO mueve a la nueva; desde su ingreso, sí', () => {
    const tr = (fecha) => buildTransferBatch({ fecha, tipo: REPRO_TRANSFER_TIPO.TRASLADO, origen: { sala: 'S3', tanque: 'T4' },
      destinos: [{ sala: 'S6', tanque: 'T2', ids: [CHIP] }], matrixIndex: idxR(), trId: 'TR-000300' });
    const antes = tr('2026-07-30');
    expect(antes.report.antesDelIngreso).toEqual([CHIP]);
    expect(antes.matriz).toBeNull();
    expect(tr('2026-08-02').report.moved).toEqual([CHIP]);
  });
});

describe('♻ reciclaje · Consulta: matriz de desoves y trazabilidad por HEMBRA', () => {
  const BIT = [
    { 'Trovan ID': CHIP, 'Fecha': '2026-06-01', 'Tipo': 'Desove' },       // de la vieja
    { 'Trovan ID': CHIP, 'Fecha': '2026-06-20', 'Tipo': 'Desove' },       // de la vieja
    { 'Trovan ID': CHIP, 'Fecha': '2026-08-10', 'Tipo': 'Desove' },       // de la nueva
    { 'Trovan ID': CHIP, 'Fecha': '2026-07-08', 'Tipo': 'Mortalidad' },
  ];
  it('🔴 con la MATRIZ, la matriz de desoves da una fila por hembra y no suma las dos', () => {
    const p = pivotDesoves(BIT, [VIEJA, NUEVA]);
    expect(p.rows.map((r) => [r.trovan, r.total])).toEqual([[CHIP, 1], [CHIP + '·2026-01-05', 2]]);
  });
  it('sin la MATRIZ sale como siempre: una fila por chip', () => {
    expect(pivotDesoves(BIT).rows.map((r) => [r.trovan, r.total])).toEqual([[CHIP, 3]]);
  });
  it('🔴 sin las fechas de ingreso (la lectura del GAS) sale UNA fila con el nombre del chip, no «chip·#1»', () => {
    // Sin la regla, los tres desoves iban a la primera hembra de la hoja —la muerta—, también el de la vigente.
    const p = pivotDesoves(BIT, [sinFechas(VIEJA), sinFechas(NUEVA)]);
    expect(p.rows.map((r) => [r.trovan, r.total])).toEqual([[CHIP, 3]]);
  });
  it('con la fecha de UNA sola tampoco se parte: no se sabe si la otra es anterior o posterior', () => {
    expect(pivotDesoves(BIT, [sinFechas(VIEJA), NUEVA]).rows.map((r) => [r.trovan, r.total])).toEqual([[CHIP, 3]]);
  });
  it('las fechas dd/mm/yyyy del store se ordenan como fechas (antes «01/08» iba delante de «20/06»)', () => {
    const p = pivotDesoves([
      { 'Trovan ID': CHIP, 'Fecha': '20/06/2026', 'Tipo': 'Desove' },
      { 'Trovan ID': CHIP, 'Fecha': '01/08/2026', 'Tipo': 'Desove' },
    ]);
    expect(p.dates).toEqual(['2026-06-20', '2026-08-01']);
  });
  it('🔴 la trazabilidad de un chip reciclado es la de la hembra que lo lleva hoy, y lista las anteriores', () => {
    const t = trazaDelChip([VIEJA, NUEVA], BIT, [
      trow({ tr: 'TR-000001', f: '2026-03-01', t: CHIP, so: 'S1', to: 'T1', sd: 'S1', td: 'T2' }),    // de la vieja
      trow({ tr: 'TR-000009', f: '2026-08-05', t: CHIP, so: 'S2', to: 'T8', sd: 'S3', td: 'T4' }),    // de la nueva
    ], CHIP);
    expect(t.rec.lote).toBe('L20');
    expect(t.reciclado).toBe(true);
    expect(t.desde).toBe('2026-08-01');
    expect(t.desoves).toEqual(['2026-08-10']);
    expect(t.movimientos.map((m) => m.trId)).toEqual(['TR-000009']);
    expect(t.current).toEqual({ sala: 'S3', tanque: 'T4' });
    expect(t.anteriores).toEqual([{ ingreso: '2026-01-05', muerte: '2026-07-08', estado: 'Muerto', lote: 'L12', codigo: 'G01', sala: 'S1', tanque: 'T1' }]);
  });
  it('sin fechas en la lectura no se puede partir, y lo dice: se ve todo lo del chip', () => {
    const t = trazaDelChip([sinFechas(VIEJA), sinFechas(NUEVA)], BIT, [], CHIP);
    expect(t.reciclado).toBe(true);
    expect(t.sinFechas).toBe(true);
    expect(t.desoves).toHaveLength(3);
    expect(t.anteriores).toHaveLength(1);
  });
  it('un chip de UNA sola hembra se traza como siempre', () => {
    const t = trazaDelChip([OTRA_VIVA], [{ 'Trovan ID': '0007218CCC', 'Fecha': '2026-01-01', 'Tipo': 'Desove' }], [], '0007218ccc');
    expect(t.reciclado).toBe(false);
    expect(t.sinFechas).toBe(false);
    expect(t.anteriores).toEqual([]);
    expect(t.desoves).toEqual(['2026-01-01']);                 // anterior a su ingreso y aun así suyo
    expect(t.rec.sala).toBe('S5');
  });
  it('un chip que no está en la MATRIZ no tiene hembra vigente', () => {
    const t = trazaDelChip([OTRA_VIVA], [], [], CHIP);
    expect(t.rec).toBeNull();
    expect(t.reciclado).toBe(false);
  });
});
