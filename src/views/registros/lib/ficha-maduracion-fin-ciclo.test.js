import { describe, it, expect } from 'vitest';
import {
  MAD_FIN_SHEET,
  MAD_FIN_COLUMNS,
  MAD_FIN_HEADERS,
  MAD_FIN_TIPOS,
  MAD_FIN_MOTIVOS,
  motivoTag,
  finRowId,
  buildFinRows,
  buildFinPayload,
  validarFinCiclo,
} from './ficha-maduracion-fin-ciclo.schema.js';

const base = () => ({
  fecha: '2026-09-08',
  cierres: [
    { lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', destino: 'Chongón', machos: 40, hembras: 60, observaciones: '' },
  ],
});

const col = (h) => MAD_FIN_HEADERS.indexOf(h);

describe('Fin de Ciclo · la hoja y sus columnas', () => {
  it('escribe en la hoja que el GAS ya permite, y va por columna ID', () => {
    expect(MAD_FIN_SHEET).toBe('Maduración Fin de Ciclo');
    expect(MAD_FIN_HEADERS[MAD_FIN_HEADERS.length - 1]).toBe('ID');
  });

  it('las cabeceras se DERIVAN de las columnas', () => {
    expect(MAD_FIN_HEADERS).toEqual(MAD_FIN_COLUMNS.map((c) => c.h));
  });

  it('NO lleva sala ni tanque: se cierra el LOTE', () => {
    /* Decisión del usuario: el cierre es del lote entero y el libro descuenta de cada
       tanque donde esté, en proporción. Pedir el tanque obligaría a enumerar dónde está,
       que es justo lo que el libro ya sabe. */
    expect(MAD_FIN_HEADERS).not.toContain('Sala');
    expect(MAD_FIN_HEADERS).not.toContain('Tanque');
    expect(MAD_FIN_HEADERS).toContain('Lote');
  });

  it('lleva DESTINO, porque es la única salida del sistema', () => {
    // Un movimiento siempre aterriza en otro tanque; lo que se va de Maduración sale aquí.
    expect(MAD_FIN_HEADERS).toContain('Destino');
  });

  it('ofrece los tipos y los motivos que nombró el usuario', () => {
    expect(MAD_FIN_TIPOS).toEqual(['Total', 'Parcial']);
    expect(MAD_FIN_MOTIVOS).toContain('Pedido');
    expect(MAD_FIN_MOTIVOS).toContain('Descarte parcial');
  });
});

describe('Fin de Ciclo · la llave', () => {
  it('🔴 el MOTIVO va en la llave: un pedido y un descarte del mismo día conviven', () => {
    /* Sin el motivo, los dos compartirían ID y el segundo borraría al primero — y con él,
       su descuento del saldo. */
    const a = finRowId('2026-09-08', 'AB', 'Pedido');
    const b = finRowId('2026-09-08', 'AB', 'Descarte parcial');
    expect(a).not.toBe(b);
  });

  it('normaliza el lote y compacta el motivo', () => {
    expect(finRowId('2026-09-08', ' ab ', 'Descarte parcial')).toBe('2026-09-08-AB-DESCARTEPARCIAL');
    expect(motivoTag('Fin de vida útil')).toBe('FINDEVIDAÚTIL');
  });

  it('y va en la fila, en la última columna', () => {
    expect(buildFinRows(base())[0][col('ID')]).toBe('2026-09-08-AB-PEDIDO');
  });
});

describe('Fin de Ciclo · las filas', () => {
  it('una fila por cierre, con la fecha repetida', () => {
    const m = base();
    m.cierres.push({ lote: 'BC', tipo: 'Total', motivo: 'Fin de vida útil', machos: 10, hembras: 10 });
    const filas = buildFinRows(m);
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f[col('Fecha')] === '2026-09-08')).toBe(true);
  });

  it('sin lote o sin motivo NO produce fila: la llave estaría incompleta', () => {
    const m = base();
    m.cierres.push({ lote: 'BC', tipo: 'Total', motivo: '', machos: 5 });
    m.cierres.push({ lote: '', tipo: 'Total', motivo: 'Pedido', machos: 5 });
    expect(buildFinRows(m)).toHaveLength(1);
  });

  it('los conteos negativos no llegan a la hoja', () => {
    const m = base();
    m.cierres[0].machos = -3;
    expect(buildFinRows(m)[0][col('Machos')]).toBe('');
  });

  it('el payload lleva la hoja y las cabeceras derivadas', () => {
    const p = buildFinPayload(base());
    expect(p.sheetName).toBe('Maduración Fin de Ciclo');
    expect(p.headers).toEqual(MAD_FIN_HEADERS);
    expect(p.rows).toHaveLength(1);
  });
});

describe('Fin de Ciclo · validación', () => {
  it('el modelo base no da ni un error ni un aviso', () => {
    const { errores, avisos } = validarFinCiclo(base());
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it('ERROR si el mismo lote se cierra dos veces por el mismo motivo esa fecha', () => {
    const m = base();
    m.cierres.push({ lote: 'ab', tipo: 'Parcial', motivo: 'Pedido', machos: 5, hembras: 5 });
    const { errores } = validarFinCiclo(m);
    expect(errores.some((e) => /se cierra dos veces/.test(e))).toBe(true);
    expect(errores.some((e) => /sumados/.test(e))).toBe(true);
  });

  it('el mismo lote con motivos DISTINTOS el mismo día sí vale', () => {
    const m = base();
    m.cierres.push({ lote: 'AB', tipo: 'Parcial', motivo: 'Descarte parcial', machos: 5, hembras: 5 });
    expect(validarFinCiclo(m).errores).toEqual([]);
  });

  it('ERROR si falta el lote, el motivo o el tipo', () => {
    const sinLote = base(); sinLote.cierres[0].lote = '';
    expect(validarFinCiclo(sinLote).errores.some((e) => /Falta el lote/.test(e))).toBe(true);

    const sinMotivo = base(); sinMotivo.cierres[0].motivo = '';
    expect(validarFinCiclo(sinMotivo).errores.some((e) => /Va en la llave/.test(e))).toBe(true);

    const sinTipo = base(); sinTipo.cierres[0].tipo = '';
    expect(validarFinCiclo(sinTipo).errores.some((e) => /Total o Parcial/.test(e))).toBe(true);
  });

  it('ERROR si un cierre PARCIAL no saca ningún animal', () => {
    // No descuenta nada: es una fila que no dice nada.
    const m = base();
    m.cierres[0].machos = 0; m.cierres[0].hembras = 0;
    expect(validarFinCiclo(m).errores.some((e) => /Parcial.*no descuenta nada/.test(e))).toBe(true);
  });

  it('pero un cierre TOTAL sin cifras es legítimo: todo será diferencia', () => {
    /* «No salió nada y el resto es diferencia» es un registro válido y además el que más
       información da: dice que el libro tenía animales que nadie encontró. */
    const m = base();
    m.cierres[0].tipo = 'Total';
    m.cierres[0].machos = 0; m.cierres[0].hembras = 0;
    const { errores, avisos } = validarFinCiclo(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /se anotará como diferencia/.test(a))).toBe(true);
  });

  it('AVISO si un Pedido no dice a dónde fue', () => {
    const m = base();
    m.cierres[0].destino = '';
    const { errores, avisos } = validarFinCiclo(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /no dice a qué destino/.test(a))).toBe(true);
  });

  it('AVISO si el tipo no es uno de los dos conocidos', () => {
    const m = base();
    m.cierres[0].tipo = 'Definitivo';
    expect(validarFinCiclo(m).avisos.some((a) => /no es un tipo conocido/.test(a))).toBe(true);
  });
});
