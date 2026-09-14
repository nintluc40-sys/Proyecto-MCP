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
import { detectSheetName, classifyOrigin } from '../../../core/sheets.js';

const base = () => ({
  fecha: '2026-09-08',
  desoves: [
    { lote: 'BM', codigoGenetico: '766', piscina: 'P-766', desoves: 4, huevos: 9800, hembrasNoViables: 12, fechaN2: '', n2: '', fechaN5: '', n5: '', despacho: 'Laboratorio Rosario', observaciones: '' },
  ],
});

const col = (h) => MAD_DESOVE_HEADERS.indexOf(h);

describe('Desoves · la hoja y su llave POSICIONAL', () => {
  it('reutiliza la hoja de Lotes, que estaba a 0 filas', () => {
    expect(MAD_DESOVE_SHEET).toBe('Maduración Lotes');
  });

  /* ⚠ DESPACHO · lo pidió el usuario el 2026-09-08: dónde van los N5 o dónde se despachan.
     Texto LIBRE a propósito — el destino no siempre es un sitio que el sistema conozca, y un
     desplegable obligaría a elegir mal.
     🔴 Lo que NO es libre es su POSICIÓN. La llave de esta hoja es posicional [0,1,2] y el GAS
     la lee por índice: una columna nueva colada antes de la tercera desplazaría la llave y
     cada sync escribiría sobre la fila equivocada, sin un solo error.
     ⚠ Se fija que va DESPUÉS de la llave, y NO en qué posición exacta: lo primero es el
     contrato con el GAS, lo segundo sería una prueba frágil que se rompe cada vez que se
     añada una columna legítima. */
  it('lleva DESPACHO, texto libre y siempre después de la llave', () => {
    expect(MAD_DESOVE_HEADERS).toContain('Despacho');
    expect(MAD_DESOVE_HEADERS.indexOf('Despacho')).toBeGreaterThan(2);
    expect(buildDesoveRows(base())[0][col('Despacho')]).toBe('Laboratorio Rosario');
  });

  /* ⚠ El despacho se RECORTA, no tumba la fila: una celda de Sheets aguanta mucho más, pero
     un campo sin tope es la vía por la que un pegado accidental mete media hoja en una celda. */
  it('el despacho se recorta y no tumba la fila', () => {
    const m = base();
    m.desoves[0].despacho = 'x'.repeat(500);
    expect(buildDesoveRows(m)[0][col('Despacho')].length).toBe(200);
    expect(buildDesoveRows(m)).toHaveLength(1);
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
    for (const h of ['Total de huevos', 'Hembras no viables', 'Desoves']) {
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
       los huevos ya guardados. El vacío es lo que hace posible «una fila que se completa». */
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
    expect(filas[0][col('Desoves')]).toBe(4);   // número de desoves: pequeño, tal cual
  });
});

/* 🔴 2026-09-14 (usuario): «No viables (miles)» pasa a «Hembras no viables»: reproductoras que
   estaban maduras pero NO desovaron. Es un conteo de animales, como «Desoves», así que va TAL
   CUAL y sin el ×1000. Medido ese día: la única fila de la hoja tenía «No viables» vacío. */
describe('Desoves · Hembras no viables', () => {
  it('🔴 la columna se llama «Hembras no viables» y «No viables» ya no existe', () => {
    expect(MAD_DESOVE_HEADERS).toContain('Hembras no viables');
    expect(col('No viables')).toBe(-1);
  });

  it('🔴 es un conteo: va tal cual, SIN el ×1000', () => {
    const c = MAD_DESOVE_COLUMNS.find((x) => x.k === 'hembrasNoViables');
    expect(c).toBeTruthy();
    expect(c.mil).toBeFalsy();
    expect(buildDesoveRows(base())[0][col('Hembras no viables')]).toBe(12);
  });

  it('sin cifra va vacía (el merge conserva la celda) y un negativo no llega', () => {
    const m = base();
    m.desoves[0].hembrasNoViables = '';
    expect(buildDesoveRows(m)[0][col('Hembras no viables')]).toBe('');
    m.desoves[0].hembrasNoViables = -3;
    expect(buildDesoveRows(m)[0][col('Hembras no viables')]).toBe('');
  });

  it('🔴 un desove que sólo trae hembras no viables NO se avisa como «sin ninguna cifra»', () => {
    const v = validarDesove({ fecha: '2026-09-14', desoves: [{ lote: 'BM', codigoGenetico: '766', hembrasNoViables: 3 }] });
    expect(v.avisos.join(' ')).not.toMatch(/ninguna cifra/);
  });

  /* 🔴🔴 LA FIRMA DE LA PESTAÑA. El tablero reconoce «Maduración Lotes» por sus columnas: pide
     «código genético» Y una cabecera con machos, hembras o nauplio. La daba «Total de
     nauplios»; desde que esa columna se borró (2026-09-14) la da SÓLO «Hembras no viables». Sin
     ella la pestaña caería a «Hoja<N>» y sus filas desaparecerían del tablero sin un error. */
  it('🔴 con las cabeceras nuevas la pestaña se sigue reconociendo como Maduración', () => {
    expect(MAD_DESOVE_HEADERS.some((h) => /nauplio/i.test(h))).toBe(false);   // la firma la da «hembras»
    const fila = Object.fromEntries(MAD_DESOVE_HEADERS.map((h) => [h, '']));
    expect(detectSheetName([fila], 0)).toBe('Maduracion');
    expect(classifyOrigin(MAD_DESOVE_SHEET)).toBe('Maduracion');
  });
});

/* 🔴 2026-09-14 (usuario): se BORRA «Total de nauplios (miles)». Los nauplios ya se registran por
   separado en N2 y N5, y un tercer total repetía el dato. Medido ese día: la única fila de la
   hoja lo tenía vacío, así que borrar la columna no pierde nada. */
describe('Desoves · sin «Total de nauplios»', () => {
  it('🔴 la columna ya no existe, y N2 y N5 siguen ahí con su ×1000', () => {
    expect(col('Total de nauplios')).toBe(-1);
    expect(MAD_DESOVE_COLUMNS.some((c) => c.k === 'nauplios')).toBe(false);
    const n = MAD_DESOVE_COLUMNS.filter((c) => c.h === 'N2' || c.h === 'N5');
    expect(n.map((c) => c.mil)).toEqual([true, true]);
  });

  it('🔴 un borrador viejo que aún traiga nauplios NO los escribe en ninguna columna', () => {
    const m = base();
    m.desoves[0].nauplios = 6500;
    const fila = buildDesoveRows(m)[0];
    expect(fila).toHaveLength(MAD_DESOVE_HEADERS.length);
    expect(fila).not.toContain(6500000);
    expect(fila).not.toContain(6500);
  });

  it('🔴 y unos nauplios sueltos ya no cuentan como cifra: la fila se avisa vacía', () => {
    const v = validarDesove({ fecha: '2026-09-14', desoves: [{ lote: 'BM', codigoGenetico: '766', nauplios: 6500 }] });
    expect(v.avisos.join(' ')).toMatch(/ninguna cifra/);
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
    m.desoves.push({ lote: 'BM', codigoGenetico: '', huevos: 100 });
    m.desoves.push({ lote: '', codigoGenetico: '767', huevos: 100 });
    expect(buildDesoveRows(m)).toHaveLength(1);
  });

  it('un lote con DOS códigos son DOS filas del mismo día', () => {
    // Es el caso real: el lote BM con las piscinas 766 y 767 desovando por separado.
    const m = base();
    m.desoves.push({ lote: 'BM', codigoGenetico: '767', piscina: 'P-767', desoves: 3, huevos: 4200 });
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
    m.desoves.push({ lote: 'bm', codigoGenetico: '766', huevos: 100 });
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

  it('NO compara los tamaños de N2, N5 y huevos entre sí', () => {
    /* Decisión del usuario (2026-09-08): son cosas DISTINTAS y no comparables. Un aviso
       por tamaño relativo sería un rojo que no significa nada, y ésos esconden el
       siguiente. Si algún día alguien añade esa comparación, esta prueba se pone roja. */
    const m = base();
    m.desoves[0].huevos = 100;
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
