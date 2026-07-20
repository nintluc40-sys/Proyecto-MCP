import { describe, it, expect } from 'vitest';
import {
  REPRO_MATRIZ_HEADERS, REPRO_MATRIZ_KEYCOLS, REPRO_BITACORA_HEADERS, REPRO_BITACORA_KEYCOLS,
  REPRO_TRANSFER_HEADERS, REPRO_TRANSFER_KEYCOLS, REPRO_ESTADO, REPRO_EVENTO, REPRO_TRANSFER_TIPO,
  normTrovan, parseTrovanList, isValidTrovan, matrixRecordFromSheet, buildMatrixIndex,
  buildAltaBatch, buildEventBatch, nextTrId, buildTransferBatch,
  matrixIndexFromRows, pivotDesoves, individualTrace, matrixSummary, nextTrIdFromRows,
} from './reproductivo.data.js';

// Índice de matriz de prueba: 3 hembras (una muerta). Trovan = 10 hex (formato del lector).
const idx = () => buildMatrixIndex([
  { trovan: '0008218CCC', estado: 'Vivo', sala: 'S5', tanque: 'T1' },
  { trovan: '000821B425', estado: 'Vivo', sala: 'S5', tanque: 'T1' },
  { trovan: '000821B9E7', estado: 'Muerto', sala: 'S5', tanque: 'T1' },
]);
const col = (headers, name) => headers.indexOf(name);

describe('esquema de hojas', () => {
  it('las claves de upsert apuntan a las columnas correctas', () => {
    expect(REPRO_MATRIZ_KEYCOLS).toEqual([col(REPRO_MATRIZ_HEADERS, 'Trovan ID')]);
    expect(REPRO_BITACORA_KEYCOLS).toEqual(['Trovan ID', 'Fecha', 'Tipo'].map((n) => col(REPRO_BITACORA_HEADERS, n)));
    expect(REPRO_TRANSFER_KEYCOLS).toEqual(['TR-ID', 'Trovan ID'].map((n) => col(REPRO_TRANSFER_HEADERS, n)));
  });
});

describe('normTrovan / parseTrovanList', () => {
  it('normaliza quitando espacios, saneando y en mayúsculas', () => {
    expect(normTrovan(' 0008218ccc ')).toBe('0008218CCC'); // hex a mayúsculas (forma canónica)
    expect(normTrovan(' =98 56 ')).toBe('9856'); // quita el '=' inicial (anti-fórmula) y los espacios
  });
  it('parsea líneas/comas/espacios, deduplica y reporta duplicados', () => {
    const { ids, duplicates } = parseTrovanList('0008218CCC\n000821B425, 0008218ccc\n\n 000821BC99 ');
    expect(ids).toEqual(['0008218CCC', '000821B425', '000821BC99']); // el minúsculas se dedupe contra el mayúsculas
    expect(duplicates).toEqual(['0008218CCC']);
  });
  it('texto vacío → sin ids', () => {
    expect(parseTrovanList('').ids).toEqual([]);
    expect(parseTrovanList(null).ids).toEqual([]);
  });
});

describe('isValidTrovan (formato del lector: 10 hex)', () => {
  it('acepta exactamente 10 caracteres hexadecimales (tras normalizar)', () => {
    expect(isValidTrovan('0008218CCC')).toBe(true);
    expect(isValidTrovan('000821B9E7')).toBe(true);
    expect(isValidTrovan(normTrovan('0008218ccc'))).toBe(true); // minúsculas normalizadas
  });
  it('rechaza notación científica, decimales, comas, texto y longitudes ≠ 10', () => {
    expect(isValidTrovan('8.21E+19')).toBe(false);   // notación científica de Excel
    expect(isValidTrovan('8218000')).toBe(false);    // perdió ceros a la izquierda (< 10)
    expect(isValidTrovan('000821B4250')).toBe(false); // 11 caracteres
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
      { trovan: '000821BC99', numero: '1', sala: 'S6', tanque: 'T2' },
      { trovan: '', numero: '', sala: '', tanque: '' },           // vacía → ignora
      { trovan: '000821ADD7', piscina: 'P3' },
    ]);
    expect(r.payload.rows.length).toBe(2);
    expect(r.report.created).toEqual(['000821BC99', '000821ADD7']);
    expect(r.payload.rows[0][col(REPRO_MATRIZ_HEADERS, 'Estado')]).toBe(REPRO_ESTADO.VIVO);
  });
  it('reporta filas con datos pero sin Trovan, duplicados en el lote y existentes en la matriz', () => {
    const r = buildAltaBatch([
      { trovan: '', numero: '9' },              // datos sin Trovan
      { trovan: '000821AC75' },
      { trovan: '000821AC75' },                 // duplicado en el lote
      { trovan: '0008218CCC' },                 // ya existe en la matriz de prueba
    ], idx());
    expect(r.report.sinTrovan).toBe(1);
    expect(r.report.duplicados).toEqual(['000821AC75']);
    expect(r.report.existentes).toEqual(['0008218CCC']);
    expect(r.report.created).toEqual(['000821AC75']);
    expect(r.payload.rows.length).toBe(1);
  });
  it('señala (invalidFormat) y NO registra los Trovan con formato corrupto', () => {
    const r = buildAltaBatch([
      { trovan: '000821BB30', numero: '1' },    // válido
      { trovan: '8.21E+19', numero: '2' },      // notación científica → señalado
      { trovan: '8218000', numero: '3' },       // perdió ceros a la izquierda → señalado
    ]);
    expect(r.report.created).toEqual(['000821BB30']);
    expect(r.report.invalidFormat).toEqual(['8.21E+19', '8218000']);
    expect(r.payload.rows.length).toBe(1);
  });
  it('sin filas válidas → payload null', () => {
    expect(buildAltaBatch([{ trovan: '', numero: '' }]).payload).toBeNull();
  });
});

describe('Sección 2 · desoves / mortalidades', () => {
  it('desove: añade a bitácora los vivos, omite el muerto y reporta no encontrados', () => {
    const r = buildEventBatch({ ids: ['0008218CCC', '000821B9E7', '000821BB30'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE, matrixIndex: idx() });
    expect(r.matriz).toBeNull();                 // desove no toca la matriz
    expect(r.bitacora.rows.length).toBe(1);      // solo la viva
    expect(r.bitacora.rows[0][col(REPRO_BITACORA_HEADERS, 'Trovan ID')]).toBe('0008218CCC');
    expect(r.bitacora.rows[0][col(REPRO_BITACORA_HEADERS, 'Sala')]).toBe('S5'); // foto de ubicación
    expect(r.report.alreadyDead).toEqual(['000821B9E7']);
    expect(r.report.notFound).toEqual(['000821BB30']);
  });
  it('mortalidad: marca Estado=Muerto + Fecha muerte en la matriz y añade a bitácora', () => {
    const r = buildEventBatch({ ids: ['0008218CCC'], fecha: '2026-07-12', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: idx() });
    expect(r.matriz.rows.length).toBe(1);
    const row = r.matriz.rows[0];
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Estado')]).toBe(REPRO_ESTADO.MUERTO);
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Fecha muerte')]).toBe('2026-07-12');
    // Campos permanentes vacíos → el merge del GAS los preserva.
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Piscina')]).toBe('');
    expect(r.bitacora.rows.length).toBe(1);
  });
  it('SIN matriz rechaza el lote entero: la Sala/Tanque de la bitácora solo salen de la MATRIZ', () => {
    const r = buildEventBatch({ ids: ['0008218CCC', '000821BB30'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE });
    expect(r.error).toMatch(/MATRIZ/);
    expect(r.bitacora).toBeNull();
    expect(r.matriz).toBeNull();
  });
  it('rechaza el individuo que está en la MATRIZ pero sin Sala o Tanque (fila incompleta)', () => {
    const parcial = buildMatrixIndex([
      { trovan: '0008218CCC', estado: 'Vivo', sala: 'S5', tanque: 'T1' },
      { trovan: '000821B425', estado: 'Vivo', sala: 'S5', tanque: '' },   // sin tanque
      { trovan: '000821BC99', estado: 'Vivo', sala: '', tanque: 'T3' },   // sin sala
    ]);
    const r = buildEventBatch({ ids: ['0008218CCC', '000821B425', '000821BC99'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE, matrixIndex: parcial });
    expect(r.bitacora.rows.length).toBe(1);
    expect(r.report.processed).toEqual(['0008218CCC']);
    expect(r.report.sinUbicacion).toEqual(['000821B425', '000821BC99']);
  });
  it('la bitácora toma Sala y Tanque de la MATRIZ, no de lo que teclea el usuario', () => {
    const r = buildEventBatch({ ids: ['0008218CCC'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE, matrixIndex: idx() });
    const row = r.bitacora.rows[0];
    expect(row[col(REPRO_BITACORA_HEADERS, 'Sala')]).toBe('S5');
    expect(row[col(REPRO_BITACORA_HEADERS, 'Tanque')]).toBe('T1');
  });
  it('señala (invalidFormat) y NO registra los Trovan con formato corrupto', () => {
    const r = buildEventBatch({ ids: ['0008218CCC', '8.21E+19', '821B425'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE, matrixIndex: idx() });
    expect(r.bitacora.rows.length).toBe(1);      // solo el válido
    expect(r.report.processed).toEqual(['0008218CCC']);
    expect(r.report.invalidFormat).toEqual(['8.21E+19', '821B425']);
  });
  it('rechaza sin fecha o con tipo inválido', () => {
    expect(buildEventBatch({ ids: ['0008218CCC'], tipo: REPRO_EVENTO.DESOVE, matrixIndex: idx() }).error).toMatch(/fecha/i);
    expect(buildEventBatch({ ids: ['0008218CCC'], fecha: '2026-07-12', tipo: 'X', matrixIndex: idx() }).error).toMatch(/inválido/i);
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
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['0008218CCC', '000821B425'] }],
      matrixIndex: idx(), trId: 'TR-000125',
    });
    expect(r.matriz.rows.length).toBe(2);
    expect(r.matriz.rows[0][col(REPRO_MATRIZ_HEADERS, 'Sala actual')]).toBe('S6');
    expect(r.transfer.rows.length).toBe(2);
    expect(r.transfer.rows[0][col(REPRO_TRANSFER_HEADERS, 'TR-ID')]).toBe('TR-000125');
    expect(r.report.moved).toEqual(['0008218CCC', '000821B425']);
  });
  it('omite y reporta los individuos que NO están en el origen declarado', () => {
    const r = buildTransferBatch({
      fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
      origen: { sala: 'S9', tanque: 'T9' }, // ninguno está aquí
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['0008218CCC'] }],
      matrixIndex: idx(), trId: 'TR-000126',
    });
    expect(r.matriz).toBeNull();
    expect(r.report.wrongLocation).toEqual(['0008218CCC']);
  });
  it('sin matriz mueve TODOS los Trovan de cada destino sin validar existencia', () => {
    const r = buildTransferBatch({
      fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
      origen: { sala: 'S5', tanque: 'T1' },
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['000821B3B2', '000821AFA2'] }],
      trId: 'TR-000200',
    });
    expect(r.transfer.rows.length).toBe(2);
    expect(r.report.moved).toEqual(['000821B3B2', '000821AFA2']);
    expect(r.report.notFound).toEqual([]);
    expect(r.report.wrongLocation).toEqual([]);
  });
  it('señala (invalidFormat) y NO transfiere los Trovan con formato corrupto', () => {
    const r = buildTransferBatch({
      fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
      origen: { sala: 'S5', tanque: 'T1' },
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['000821B3B2', '8.21E+19'] }],
      trId: 'TR-000201',
    });
    expect(r.report.moved).toEqual(['000821B3B2']);
    expect(r.report.invalidFormat).toEqual(['8.21E+19']);
  });
  it('mezcla: registra la composición del destino', () => {
    const r = buildTransferBatch({
      fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.MEZCLA,
      origen: { sala: 'S5', tanque: 'T1' },
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['0008218CCC'] }],
      composicion: { lotes: 'A+B', codigos: 'G01+G05', piscinas: 'P1+P2' },
      matrixIndex: idx(), trId: 'TR-000127',
    });
    const row = r.transfer.rows[0];
    expect(row[col(REPRO_TRANSFER_HEADERS, 'Mezcla')]).toBe('Sí');
    expect(row[col(REPRO_TRANSFER_HEADERS, 'Lotes presentes')]).toBe('A+B');
    expect(row[col(REPRO_TRANSFER_HEADERS, 'Códigos presentes')]).toBe('G01+G05');
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
