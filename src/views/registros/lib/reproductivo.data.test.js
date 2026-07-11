import { describe, it, expect } from 'vitest';
import {
  REPRO_MATRIZ_HEADERS, REPRO_MATRIZ_KEYCOLS, REPRO_BITACORA_HEADERS, REPRO_BITACORA_KEYCOLS,
  REPRO_TRANSFER_HEADERS, REPRO_TRANSFER_KEYCOLS, REPRO_ESTADO, REPRO_EVENTO, REPRO_TRANSFER_TIPO,
  normTrovan, parseTrovanList, matrixRecordFromSheet, buildMatrixIndex,
  buildAltaIndividuo, buildEventBatch, nextTrId, buildTransferBatch,
} from './reproductivo.data.js';

// Índice de matriz de prueba: 3 hembras (una muerta).
const idx = () => buildMatrixIndex([
  { trovan: '9856321', estado: 'Vivo', sala: 'S5', tanque: 'T1' },
  { trovan: '9856330', estado: 'Vivo', sala: 'S5', tanque: 'T1' },
  { trovan: '9856298', estado: 'Muerto', sala: 'S5', tanque: 'T1' },
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
  it('normaliza quitando espacios y saneando', () => {
    expect(normTrovan(' 9856321 ')).toBe('9856321');
    expect(normTrovan(' =98 56 ')).toBe('9856'); // quita el '=' inicial (anti-fórmula) y los espacios
  });
  it('parsea líneas/comas/espacios, deduplica y reporta duplicados', () => {
    const { ids, duplicates } = parseTrovanList('9856321\n9856330, 9856321\n\n 9856342 ');
    expect(ids).toEqual(['9856321', '9856330', '9856342']);
    expect(duplicates).toEqual(['9856321']);
  });
  it('texto vacío → sin ids', () => {
    expect(parseTrovanList('').ids).toEqual([]);
    expect(parseTrovanList(null).ids).toEqual([]);
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

describe('Sección 1 · alta de individuo', () => {
  it('crea la fila en MATRIZ con Estado=Vivo y ubicación de ingreso', () => {
    const r = buildAltaIndividuo({ trovan: '9999999', numero: '10', sala: 'S6', tanque: 'T2', piscina: 'P1' }, idx());
    expect(r.ok).toBe(true);
    const row = r.payload.rows[0];
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Trovan ID')]).toBe('9999999');
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Estado')]).toBe(REPRO_ESTADO.VIVO);
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Sala actual')]).toBe('S6');
    expect(r.payload.sheetName).toBe('Maduración MATRIZ');
  });
  it('rechaza un Trovan que ya existe', () => {
    const r = buildAltaIndividuo({ trovan: '9856321' }, idx());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ya existe/i);
  });
  it('rechaza si falta el Trovan', () => {
    expect(buildAltaIndividuo({ trovan: '' }, idx()).ok).toBe(false);
  });
});

describe('Sección 2 · desoves / mortalidades', () => {
  it('desove: añade a bitácora los vivos, omite el muerto y reporta no encontrados', () => {
    const r = buildEventBatch({ ids: ['9856321', '9856298', '0000000'], fecha: '2026-07-12', tipo: REPRO_EVENTO.DESOVE, matrixIndex: idx() });
    expect(r.matriz).toBeNull();                 // desove no toca la matriz
    expect(r.bitacora.rows.length).toBe(1);      // solo la viva
    expect(r.bitacora.rows[0][col(REPRO_BITACORA_HEADERS, 'Trovan ID')]).toBe('9856321');
    expect(r.bitacora.rows[0][col(REPRO_BITACORA_HEADERS, 'Sala')]).toBe('S5'); // foto de ubicación
    expect(r.report.alreadyDead).toEqual(['9856298']);
    expect(r.report.notFound).toEqual(['0000000']);
  });
  it('mortalidad: marca Estado=Muerto + Fecha muerte en la matriz y añade a bitácora', () => {
    const r = buildEventBatch({ ids: ['9856321'], fecha: '2026-07-12', tipo: REPRO_EVENTO.MORTALIDAD, matrixIndex: idx() });
    expect(r.matriz.rows.length).toBe(1);
    const row = r.matriz.rows[0];
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Estado')]).toBe(REPRO_ESTADO.MUERTO);
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Fecha muerte')]).toBe('2026-07-12');
    // Campos permanentes vacíos → el merge del GAS los preserva.
    expect(row[col(REPRO_MATRIZ_HEADERS, 'Piscina')]).toBe('');
    expect(r.bitacora.rows.length).toBe(1);
  });
  it('rechaza sin fecha o con tipo inválido', () => {
    expect(buildEventBatch({ ids: ['9856321'], tipo: REPRO_EVENTO.DESOVE, matrixIndex: idx() }).error).toMatch(/fecha/i);
    expect(buildEventBatch({ ids: ['9856321'], fecha: '2026-07-12', tipo: 'X', matrixIndex: idx() }).error).toMatch(/inválido/i);
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
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['9856321', '9856330'] }],
      matrixIndex: idx(), trId: 'TR-000125',
    });
    expect(r.matriz.rows.length).toBe(2);
    expect(r.matriz.rows[0][col(REPRO_MATRIZ_HEADERS, 'Sala actual')]).toBe('S6');
    expect(r.transfer.rows.length).toBe(2);
    expect(r.transfer.rows[0][col(REPRO_TRANSFER_HEADERS, 'TR-ID')]).toBe('TR-000125');
    expect(r.report.moved).toEqual(['9856321', '9856330']);
  });
  it('omite y reporta los individuos que NO están en el origen declarado', () => {
    const r = buildTransferBatch({
      fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
      origen: { sala: 'S9', tanque: 'T9' }, // ninguno está aquí
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['9856321'] }],
      matrixIndex: idx(), trId: 'TR-000126',
    });
    expect(r.matriz).toBeNull();
    expect(r.report.wrongLocation).toEqual(['9856321']);
  });
  it('mezcla: registra la composición del destino', () => {
    const r = buildTransferBatch({
      fecha: '2026-07-12', tipo: REPRO_TRANSFER_TIPO.MEZCLA,
      origen: { sala: 'S5', tanque: 'T1' },
      destinos: [{ sala: 'S6', tanque: 'T2', ids: ['9856321'] }],
      composicion: { lotes: 'A+B', codigos: 'G01+G05', piscinas: 'P1+P2' },
      matrixIndex: idx(), trId: 'TR-000127',
    });
    const row = r.transfer.rows[0];
    expect(row[col(REPRO_TRANSFER_HEADERS, 'Mezcla')]).toBe('Sí');
    expect(row[col(REPRO_TRANSFER_HEADERS, 'Lotes presentes')]).toBe('A+B');
    expect(row[col(REPRO_TRANSFER_HEADERS, 'Códigos presentes')]).toBe('G01+G05');
  });
});
