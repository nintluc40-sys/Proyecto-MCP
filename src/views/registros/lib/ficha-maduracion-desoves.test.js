import { describe, it, expect } from 'vitest';
import {
  MAD_DESOVE_SHEET,
  MAD_DESOVE_COLUMNS,
  MAD_DESOVE_HEADERS,
  MAD_DESOVE_KEY_COLS,
  MIL,
  aMiles,
  buildDesoveRows,
  buildDesovePayload,
  validarDesove,
} from './ficha-maduracion-desoves.schema.js';

const base = () => ({
  fecha: '2026-09-08',
  desoves: [
    { lote: 'BM', codigoGenetico: '766', piscina: 'P-766', desoves: 4, huevos: 9800, nauplios: 6500, noViables: 300, fechaN2: '', n2: '', fechaN5: '', n5: '', observaciones: '' },
  ],
});

const col = (h) => MAD_DESOVE_HEADERS.indexOf(h);

describe('Desoves · la hoja y su llave POSICIONAL', () => {
  it('reutiliza la hoja de Lotes, que estaba a 0 filas', () => {
    expect(MAD_DESOVE_SHEET).toBe('Maduración Lotes');
  });

  it('🔴 la llave son las TRES PRIMERAS columnas, en este orden exacto', () => {
    /* ⚠⚠ ESTO ES CONTRATO CON EL GAS, no una preferencia. `upsertMadRows` recibe
       `madKeyCols = [0,1,2]` por POSICIÓN para esta hoja — no usa la columna «ID» como
       Ingreso, Movimientos y Fin de Ciclo. Mover una de las tres haría que dos desoves
       distintos compartieran llave y uno pisara al otro, en silencio. Es la familia de la
       llave posicional que ya destruyó datos en Traslado. */
    expect(MAD_DESOVE_KEY_COLS).toEqual([0, 1, 2]);
    expect(MAD_DESOVE_HEADERS[0]).toBe('Fecha');
    expect(MAD_DESOVE_HEADERS[1]).toBe('Lote');
    expect(MAD_DESOVE_HEADERS[2]).toBe('Código genético');
    expect(MAD_DESOVE_COLUMNS.slice(0, 3).every((c) => c.grain === 'llave')).toBe(true);
  });

  it('NO lleva columna ID, y es deliberado', () => {
    // Tenerla sugeriría un upsert por ID que esta hoja NO hace: el GAS la ignoraría y
    // alguien acabaría confiando en una llave que no existe.
    expect(MAD_DESOVE_HEADERS).not.toContain('ID');
  });

  it('NO lleva sala ni tanque, y ésa es la corrección del usuario', () => {
    /* «Cuánto desovó el tanque 3» no existe como dato: los operarios juntan copuladas de
       varios tanques en un pool, y al devolverlas nadie identifica cuáles eran. Pedir el
       tanque obligaría a inventarlo. */
    expect(MAD_DESOVE_HEADERS).not.toContain('Sala');
    expect(MAD_DESOVE_HEADERS).not.toContain('Tanque');
  });

  it('las cabeceras se DERIVAN de las columnas', () => {
    expect(MAD_DESOVE_HEADERS).toEqual(MAD_DESOVE_COLUMNS.map((c) => c.h));
  });

  it('conserva el vocabulario que ya usaba el laboratorio', () => {
    for (const h of ['Total de huevos', 'Total de nauplios', 'No viables', 'Desoves']) {
      expect(MAD_DESOVE_HEADERS).toContain(h);
    }
  });
});

describe('Desoves · el ×1000', () => {
  it('se teclea en miles y la celda guarda unidades', () => {
    expect(MIL).toBe(1000);
    expect(aMiles(6500)).toBe(6500000);
    expect(aMiles('6500')).toBe(6500000);
  });

  it('sin cifra devuelve vacío, para que el MERGE del GAS conserve lo que hubiera', () => {
    /* Si devolviera 0, reenviar el desove para completar el N2 escribiría CEROS encima de
       los nauplios ya guardados. El vacío es lo que hace posible «una fila que se completa». */
    expect(aMiles('')).toBe('');
    expect(aMiles(null)).toBe('');
    expect(aMiles(undefined)).toBe('');
  });

  it('los negativos no llegan a la hoja', () => {
    expect(aMiles(-5)).toBe('');
  });

  it('se aplica a los conteos grandes y NO a «Desoves»', () => {
    const filas = buildDesoveRows(base());
    expect(filas[0][col('Total de huevos')]).toBe(9800000);
    expect(filas[0][col('Total de nauplios')]).toBe(6500000);
    expect(filas[0][col('No viables')]).toBe(300000);
    expect(filas[0][col('Desoves')]).toBe(4);   // número de desoves: pequeño, tal cual
  });
});

describe('Desoves · las filas', () => {
  it('normaliza lote y código para que dos grafías no partan la llave', () => {
    const m = base();
    m.desoves[0].lote = ' bm ';
    m.desoves[0].codigoGenetico = ' 766 ';
    const f = buildDesoveRows(m)[0];
    expect(f[col('Lote')]).toBe('BM');
    expect(f[col('Código genético')]).toBe('766');
  });

  it('sin lote o sin código NO produce fila: la llave estaría incompleta', () => {
    const m = base();
    m.desoves.push({ lote: 'BM', codigoGenetico: '', nauplios: 100 });
    m.desoves.push({ lote: '', codigoGenetico: '767', nauplios: 100 });
    expect(buildDesoveRows(m)).toHaveLength(1);
  });

  it('un lote con DOS códigos son DOS filas del mismo día', () => {
    // Es el caso real: el lote BM con las piscinas 766 y 767 desovando por separado.
    const m = base();
    m.desoves.push({ lote: 'BM', codigoGenetico: '767', piscina: 'P-767', desoves: 3, nauplios: 4200 });
    const filas = buildDesoveRows(m);
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f[col('Código genético')])).toEqual(['766', '767']);
    expect(filas.every((f) => f[col('Lote')] === 'BM')).toBe(true);
  });

  it('el payload lleva la hoja y las cabeceras derivadas', () => {
    const p = buildDesovePayload(base());
    expect(p.sheetName).toBe('Maduración Lotes');
    expect(p.headers).toEqual(MAD_DESOVE_HEADERS);
    expect(p.rows).toHaveLength(1);
  });
});

describe('Desoves · validación', () => {
  it('el modelo base no da ni un error ni un aviso', () => {
    const { errores, avisos } = validarDesove(base());
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it('ERROR si falta la fecha, el lote o el código genético', () => {
    const sinFecha = base(); sinFecha.fecha = '8/9/2026';
    expect(validarDesove(sinFecha).errores.some((e) => /fecha del desove no es válida/.test(e))).toBe(true);

    const sinCg = base(); sinCg.desoves[0].codigoGenetico = '';
    expect(validarDesove(sinCg).errores.some((e) => /identifica el pool/.test(e))).toBe(true);

    const sinLote = base(); sinLote.desoves[0].lote = '';
    expect(validarDesove(sinLote).errores.some((e) => /Falta el lote/.test(e))).toBe(true);
  });

  it('ERROR si el mismo lote y código aparecen dos veces esa fecha', () => {
    const m = base();
    m.desoves.push({ lote: 'bm', codigoGenetico: '766', nauplios: 100 });
    const { errores } = validarDesove(m);
    expect(errores.some((e) => /aparece dos veces en esta fecha/.test(e))).toBe(true);
    expect(errores.some((e) => /sumados/.test(e))).toBe(true);
  });

  it('🔒 EL CANDADO: N5 exige N2', () => {
    const m = base();
    m.desoves[0].n5 = 3000;
    expect(validarDesove(m).errores.some((e) => /N5 sin N2/.test(e))).toBe(true);

    m.desoves[0].n2 = 5000;
    expect(validarDesove(m).errores).toEqual([]);
  });

  it('el candado salta también si sólo hay FECHA de N5', () => {
    // Registrar la fecha sin la cifra es la forma normal de empezar; el hueco es el mismo.
    const m = base();
    m.desoves[0].fechaN5 = '2026-09-14';
    expect(validarDesove(m).errores.some((e) => /N5 sin N2/.test(e))).toBe(true);
  });

  it('NO compara los tamaños de N2, N5 y nauplios entre sí', () => {
    /* Decisión del usuario (2026-09-08): son cosas DISTINTAS y no comparables. Un aviso
       por tamaño relativo sería un rojo que no significa nada, y ésos esconden el
       siguiente. Si algún día alguien añade esa comparación, esta prueba se pone roja. */
    const m = base();
    m.desoves[0].nauplios = 100;
    m.desoves[0].n2 = 9999;
    m.desoves[0].n5 = 99999;
    const { errores, avisos } = validarDesove(m);
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it('AVISO si una fecha posterior es ANTERIOR a la que le precede', () => {
    const m = base();
    m.desoves[0].n2 = 5000;
    m.desoves[0].fechaN2 = '2026-09-01';       // antes del desove
    expect(validarDesove(m).avisos.some((a) => /ANTERIOR al desove/.test(a))).toBe(true);

    const m2 = base();
    m2.desoves[0].n2 = 5000; m2.desoves[0].fechaN2 = '2026-09-10';
    m2.desoves[0].n5 = 3000; m2.desoves[0].fechaN5 = '2026-09-09';
    expect(validarDesove(m2).avisos.some((a) => /ANTERIOR al N2/.test(a))).toBe(true);
  });

  it('AVISO si el desove no trae ninguna cifra', () => {
    const m = base();
    m.desoves[0] = { lote: 'BM', codigoGenetico: '766' };
    const { errores, avisos } = validarDesove(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /no trae ninguna cifra/.test(a))).toBe(true);
  });
});
