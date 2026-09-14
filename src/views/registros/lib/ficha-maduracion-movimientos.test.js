import { describe, it, expect } from 'vitest';
import {
  MAD_MOV_SHEET,
  MAD_MOV_COLUMNS,
  MAD_MOV_HEADERS,
  MAD_MOV_TIPOS,
  MAD_MOV_MOTIVOS,
  movRowId,
  buildMovRows,
  buildMovPayload,
  validarMovimiento,
} from './ficha-maduracion-movimientos.schema.js';

/* Modelo base VÁLIDO: cada prueba lo rompe por un solo sitio. Un fixture por prueba
   invita a que dos difieran en algo que nadie miró, y entonces el rojo no dice qué falla. */
const base = () => ({
  fecha: '2026-09-08',
  tipo: 'Transferencia',
  motivo: 'Mezcla de lotes',
  observaciones: '',
  tramos: [
    { salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 30, hembras: 20, agua: 'RAS' },
  ],
});

const col = (h) => MAD_MOV_HEADERS.indexOf(h);

describe('Movimientos · la hoja y sus columnas', () => {
  it('escribe en la hoja que el GAS ya permite', () => {
    expect(MAD_MOV_SHEET).toBe('Maduración Movimientos');
  });

  it('las cabeceras se DERIVAN de las columnas, no se declaran aparte', () => {
    // Una lista escrita aparte se desincroniza del constructor en silencio, y entonces la
    // hoja recibe valores en la columna equivocada sin un solo error.
    expect(MAD_MOV_HEADERS).toEqual(MAD_MOV_COLUMNS.map((c) => c.h));
  });

  it('el ID va la ÚLTIMA, y cabe de sobra en el tope del GAS', () => {
    expect(MAD_MOV_HEADERS[MAD_MOV_HEADERS.length - 1]).toBe('ID');
    expect(MAD_MOV_HEADERS.length).toBeLessThanOrEqual(32);   // LIMITS.mad.maxCols
  });

  it('NO hay columna de lote ni de código genético, y es deliberado', () => {
    /* 🔑 La razón de ser de la Fase 3: en un tanque mezclado nadie sabe de qué lote era
       cada animal que se movió. Pedirlo obligaría al operario a inventar un desglose; el
       libro lo deduce repartiendo en proporción a los vivos del origen ese día. Si algún
       día alguien añade estas columnas, esta prueba se pone roja y obliga a releer por qué. */
    expect(MAD_MOV_HEADERS).not.toContain('Lote');
    expect(MAD_MOV_HEADERS).not.toContain('Código genético');
  });

  it('ofrece las tres operaciones que el usuario nombra', () => {
    expect(MAD_MOV_TIPOS).toEqual(['Transferencia', 'Agrupación', 'Mezcla']);
    expect(MAD_MOV_MOTIVOS).toContain('Otro');
  });

  /* 🔴 2026-09-14 (usuario): «Logística» como motivo de transferencia, y «Anillado». El Motivo es
     texto en la hoja: las opciones nuevas no mueven columnas ni exigen re-desplegar el GAS. */
  it('🔴 ofrece «Logística» y «Anillado», en orden alfabético y con «Otro» al final', () => {
    expect(MAD_MOV_MOTIVOS).toContain('Logística');
    expect(MAD_MOV_MOTIVOS).toContain('Anillado');
    expect(MAD_MOV_MOTIVOS[MAD_MOV_MOTIVOS.length - 1]).toBe('Otro');
    const sinOtro = MAD_MOV_MOTIVOS.slice(0, -1);
    expect(sinOtro).toEqual(sinOtro.slice().sort((a, b) => a.localeCompare(b, 'es')));
    expect(new Set(MAD_MOV_MOTIVOS).size).toBe(MAD_MOV_MOTIVOS.length);
  });

  it('🔴 el motivo nuevo llega TAL CUAL a su columna, y no da ni error ni aviso', () => {
    for (const motivo of ['Logística', 'Anillado']) {
      const m = base();
      m.motivo = motivo;
      expect(buildMovRows(m)[0][col('Motivo')]).toBe(motivo);
      const v = validarMovimiento(m);
      expect(v.errores).toEqual([]);
      expect(v.avisos).toEqual([]);
    }
  });
});

describe('Movimientos · la llave', () => {
  it('lleva las DOS salas, no sólo los tanques', () => {
    /* La numeración de tanques se repite entre salas: sin las salas, «t1 → t3» sería la
       misma llave para Sala 1 y para Sala 4, y el upsert borraría un movimiento con otro. */
    expect(movRowId('2026-09-08', 'Sala 1', 1, 'Sala 2', 16)).toBe('2026-09-08-S1t1-S2t16');
    expect(movRowId('2026-09-08', 'Sala 4', 1, 'Sala 2', 16))
      .not.toBe(movRowId('2026-09-08', 'Sala 1', 1, 'Sala 2', 16));
  });

  it('el sentido importa: A→B y B→A son movimientos distintos', () => {
    expect(movRowId('2026-09-08', 'Sala 1', 1, 'Sala 2', 16))
      .not.toBe(movRowId('2026-09-08', 'Sala 2', 16, 'Sala 1', 1));
  });

  it('y va en la fila, en la última columna', () => {
    const filas = buildMovRows(base());
    expect(filas[0][col('ID')]).toBe('2026-09-08-S1t1-S2t16');
  });
});

describe('Movimientos · las filas', () => {
  it('una fila por tramo, con la cabecera repetida', () => {
    const m = base();
    m.tramos.push({ salaOrigen: 'Sala 3', tanqueOrigen: 22, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 5, hembras: 5, agua: 'RAS' });
    const filas = buildMovRows(m);
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f[col('Fecha')] === '2026-09-08')).toBe(true);
    expect(filas.every((f) => f[col('Tipo')] === 'Transferencia')).toBe(true);
    expect(filas.every((f) => f[col('Motivo')] === 'Mezcla de lotes')).toBe(true);
  });

  it('un tramo SIN ubicación completa no produce fila', () => {
    // Escribir media ubicación en la hoja dejaría un movimiento que el libro no puede
    // aplicar y que nadie sabría corregir.
    const m = base();
    m.tramos.push({ salaOrigen: 'Sala 3', tanqueOrigen: 22, salaDestino: '', tanqueDestino: '', machos: 5, hembras: 5 });
    expect(buildMovRows(m)).toHaveLength(1);
  });

  it('los conteos NEGATIVOS no llegan a la hoja', () => {
    const m = base();
    m.tramos[0].machos = -5;
    expect(buildMovRows(m)[0][col('Machos')]).toBe('');
  });

  it('el payload lleva la hoja y las cabeceras derivadas', () => {
    const p = buildMovPayload(base());
    expect(p.sheetName).toBe('Maduración Movimientos');
    expect(p.headers).toEqual(MAD_MOV_HEADERS);
    expect(p.rows).toHaveLength(1);
  });
});

describe('Movimientos · validación', () => {
  it('el modelo base no da ni un error ni un aviso', () => {
    const { errores, avisos } = validarMovimiento(base());
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it('ERROR si dos tramos repiten origen Y destino', () => {
    /* Los dos generan el MISMO ID y el upsert escribe el segundo encima del primero: los
       animales del primero desaparecen sin síntoma. Es el defecto que ya se pagó en
       Traslado con la llave posicional, y por eso es ERROR y no aviso. */
    const m = base();
    m.tramos.push({ salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 7, hembras: 7 });
    const { errores } = validarMovimiento(m);
    expect(errores.some((e) => /repite el mismo origen y destino/.test(e))).toBe(true);
    // Y dice QUÉ HACER, no sólo que está mal.
    expect(errores.some((e) => /sumados/.test(e))).toBe(true);
  });

  it('el MISMO origen a destinos DISTINTOS sí vale: es un reparto', () => {
    const m = base();
    m.tramos.push({ salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 3', tanqueDestino: 22, machos: 7, hembras: 7 });
    expect(validarMovimiento(m).errores).toEqual([]);
  });

  it('y varios orígenes a UN destino también: es una agrupación', () => {
    const m = base();
    m.tramos.push({ salaOrigen: 'Sala 3', tanqueOrigen: 22, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 7, hembras: 7 });
    expect(validarMovimiento(m).errores).toEqual([]);
  });

  it('ERROR si un tramo sale y llega al mismo sitio', () => {
    const m = base();
    m.tramos[0].salaDestino = 'Sala 1';
    m.tramos[0].tanqueDestino = 1;
    expect(validarMovimiento(m).errores.some((e) => /mismo sitio/.test(e))).toBe(true);
  });

  it('ERROR si un tramo no mueve ningún animal', () => {
    const m = base();
    m.tramos[0].machos = 0;
    m.tramos[0].hembras = 0;
    expect(validarMovimiento(m).errores.some((e) => /no mueve ningún animal/.test(e))).toBe(true);
  });

  it('ERROR si falta la fecha o el tipo', () => {
    const sinFecha = base(); sinFecha.fecha = '08/09/2026';
    expect(validarMovimiento(sinFecha).errores.some((e) => /fecha no es válida/.test(e))).toBe(true);
    const sinTipo = base(); sinTipo.tipo = '';
    expect(validarMovimiento(sinTipo).errores.some((e) => /tipo de movimiento/.test(e))).toBe(true);
  });

  it('ERROR si no hay ningún tramo', () => {
    const m = base(); m.tramos = [];
    expect(validarMovimiento(m).errores.some((e) => /ningún tramo/.test(e))).toBe(true);
  });

  it('AVISO —no error— si el tanque no es de esa sala', () => {
    /* Aviso y no error por el mismo criterio que en Ingreso: bloquear impediría registrar
       hoy algo que viene de antes, y el catálogo de salas ha cambiado (4A y 4B se
       disolvieron). Lo que no puede es pasar en silencio. */
    const m = base();
    m.tramos[0].tanqueOrigen = 99;
    const { errores, avisos } = validarMovimiento(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /no es de Sala 1/.test(a))).toBe(true);
  });

  it('AVISO si un tanque es origen de un tramo y destino de otro', () => {
    /* Una rotación es legítima, pero el orden de los tramos cambia el resultado. Callarlo
       daría dos saldos distintos para el mismo papel según cómo se tecleó. */
    const m = base();
    m.tramos.push({ salaOrigen: 'Sala 3', tanqueOrigen: 22, salaDestino: 'Sala 1', tanqueDestino: 1, machos: 5, hembras: 5 });
    const { errores, avisos } = validarMovimiento(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /origen y destino dentro de este movimiento/.test(a))).toBe(true);
  });
});
