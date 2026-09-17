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
  MAD_DESOVE_DESPACHO_OPTS,
  despachoLista,
  despachoTexto,
  desoveLlave,
  desoveCompleto,
  desoveDesdeHoja,
  desovesPendientes,
  anotarDesovesLocales,
  podarDesovesLocales,
  fechasNauplios,
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
  /* 2026-09-14 (usuario): Despacho deja de ser texto libre; lo que no es un destino de la lista no se escribe. */
  it('lleva DESPACHO, de la lista de destinos y siempre después de la llave', () => {
    expect(MAD_DESOVE_HEADERS).toContain('Despacho');
    expect(MAD_DESOVE_HEADERS.indexOf('Despacho')).toBeGreaterThan(2);
    expect(buildDesoveRows(base())[0][col('Despacho')]).toBe('');
    const m = base();
    m.desoves[0].despacho = ['Punta Carnero'];
    expect(buildDesoveRows(m)[0][col('Despacho')]).toBe('Punta Carnero');
  });

  it('un pegado sin destinos no tumba la fila: Despacho va vacío', () => {
    const m = base();
    m.desoves[0].despacho = 'x'.repeat(500);
    expect(buildDesoveRows(m)[0][col('Despacho')]).toBe('');
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

  /* 2026-09-16 (usuario): aquí se exigía que una FECHA de N5 sola cerrara el candado, porque la fecha se tecleaba
     antes que la cifra. Las fechas ya no se teclean: el candado mira la CIFRA, y una fecha que traiga un borrador
     de antes no lo abre ni lo cierra. */
  it('🔒 el candado mira la CIFRA: una fecha suelta no lo abre ni lo cierra', () => {
    const soloFecha = base();
    soloFecha.desoves[0].fechaN5 = '2026-09-14';
    expect(validarDesove(soloFecha).errores).toEqual([]);

    const n5ConFechaN2 = base();
    n5ConFechaN2.desoves[0].n5 = 3000;
    n5ConFechaN2.desoves[0].fechaN2 = '2026-09-08';
    expect(validarDesove(n5ConFechaN2).errores.some((e) => /N5 sin N2/.test(e))).toBe(true);
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

  /* 2026-09-17 · ESTA PRUEBA EXIGÍA LO CONTRARIO («que NO salga ningún aviso por fechas tecleadas»), porque
     el 09-16 las fechas eran impuestas y ninguno podía darse. Desde que se editan, vuelven a ser posibles.
     ⚠ Lo que NO puede pasar es que avisen las fechas de oficio: serían un rojo en cada registro normal. */
  describe('avisos de las fechas EDITADAS (2026-09-17, usuario)', () => {
    const conN = (o) => { const m = base(); m.desoves[0].n2 = 5000; m.desoves[0].n5 = 3000; Object.assign(m.desoves[0], o); return m; };

    it('🔴 las fechas de oficio NO avisan de nada (ni tocándolas para dejarlas igual)', () => {
      expect(validarDesove(conN({}))).toEqual({ errores: [], avisos: [] });
      // 2026-09-08 es la del desove y 2026-09-09 la derivada: escribirlas a mano es dejarlas como estaban
      expect(validarDesove(conN({ fechaN2: '2026-09-08', fechaN5: '2026-09-09' }))).toEqual({ errores: [], avisos: [] });
    });

    it('avisa del N2 ANTERIOR al desove, y sólo de eso', () => {
      const { errores, avisos } = validarDesove(conN({ fechaN2: '2026-09-01' }));
      expect(errores).toEqual([]);
      expect(avisos).toEqual(['El N2 de «766» es ANTERIOR al desove.']);
    });

    it('avisa del N5 ANTERIOR al N2, comparando con la fecha REAL de N2 (la editada)', () => {
      const { avisos } = validarDesove(conN({ fechaN2: '2026-09-20', fechaN5: '2026-09-15' }));
      expect(avisos).toEqual(['El N5 de «766» es ANTERIOR al N2.']);
      // y con la de oficio (09-09) el mismo N5 no avisa: la comparación NO usa la derivada de N2
      expect(validarDesove(conN({ fechaN5: '2026-09-15' })).avisos).toEqual([]);
    });

    it('un día que no existe avisa y cae a la de oficio, en vez de escribirse en la hoja', () => {
      expect(validarDesove(conN({ fechaN2: '2026-02-31' })).avisos)
        .toEqual(['La fecha de N2 de «766» no es un día real; se usará la del desove.']);
      expect(validarDesove(conN({ fechaN5: 'ayer' })).avisos)
        .toEqual(['La fecha de N5 de «766» no es un día real; se usará la del día siguiente.']);
    });

    it('una fecha editada SIN su recuento avisa: no se guardaría y el trabajo se perdería', () => {
      const m = base(); m.desoves[0].fechaN2 = '2026-09-20';
      expect(validarDesove(m).avisos).toContain('«766» tiene fecha de N2 pero no su recuento: esa fecha no se guardará.');
      // la de oficio sin recuento NO avisa: nadie la tecleó
      const q = base(); q.desoves[0].fechaN2 = '2026-09-08';
      expect(validarDesove(q).avisos).not.toContain('«766» tiene fecha de N2 pero no su recuento: esa fecha no se guardará.');
    });
  });

  it('🔴 la fecha del desove tiene que ser un día REAL: de ella salen las de N2 y N5', () => {
    const m = base();
    m.desoves[0].n2 = 5000; m.desoves[0].n5 = 3000;
    m.fecha = '2026-02-31';
    expect(validarDesove(m).errores).toContain('La fecha del desove no es válida.');
    m.fecha = '2028-02-29';                      // bisiesto: sí existe
    expect(validarDesove(m).errores).toEqual([]);
  });

  it('AVISO si el desove no trae ninguna cifra', () => {
    const m = base();
    m.desoves[0] = { lote: 'BM', codigoGenetico: '766' };
    const { errores, avisos } = validarDesove(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /no trae ninguna cifra/.test(a))).toBe(true);
  });
});

describe('Desoves · Despacho es una lista cerrada de destinos (2026-09-14, usuario)', () => {
  it('las 19 opciones del usuario, en su orden', () => {
    expect(MAD_DESOVE_DESPACHO_OPTS).toEqual(['Fuentes del Mar', 'Mar Bravo M01', 'Mar Bravo M02', 'Mar Bravo M03',
      'Mar Bravo M04', 'Mar Bravo M05', 'Mar Bravo M06', 'Mar Bravo M07', 'Mar Bravo M08', 'Mar Bravo M09', 'Mar Bravo M10',
      'Mar Bravo CIO', 'Punta Carnero', 'Tabasca', 'Hisenor', 'Incamar', 'Megalatina', 'SanLab', 'SanLab Eva']);
  });

  it('🔴 la celda sale en el ORDEN DE LA LISTA, sin repetir, sin lo desconocido y sin mirar mayúsculas', () => {
    expect(despachoTexto(['Mar Bravo M10', ' mar  bravo m09 ', 'Inventado', 'Mar Bravo M10'])).toBe('Mar Bravo M09, Mar Bravo M10');
    expect(despachoTexto([])).toBe('');
  });

  it('🔴 «SanLab Eva» no marca «SanLab»: se compara el destino entero', () => {
    expect(despachoLista('SanLab Eva')).toEqual(['SanLab Eva']);
    expect(despachoLista('SanLab, SanLab Eva')).toEqual(['SanLab', 'SanLab Eva']);
  });

  it('el texto de una celda vuelve a ser la elección; lo que no es un destino, no', () => {
    expect(despachoLista('Tabasca, Fuentes del Mar')).toEqual(['Fuentes del Mar', 'Tabasca']);
    expect(despachoLista('MAR BRAVO M09-M10')).toEqual([]);
  });

  it('🔴 el payload lleva la elección como texto bajo «Despacho»', () => {
    const filas = buildDesoveRows({ fecha: '2026-09-15', desoves: [{ lote: 'BP', codigoGenetico: 'CG1', n5: 900, fechaN5: '2026-09-17', despacho: ['SanLab', 'Fuentes del Mar'] }] });
    expect(filas[0][MAD_DESOVE_HEADERS.indexOf('Despacho')]).toBe('Fuentes del Mar, SanLab');
  });
});

describe('Desoves · las fechas de N2 y N5 se DERIVAN del desove (2026-09-16, usuario)', () => {
  /* «La de N2 es la misma que la del desove y la de N5 sale automática: N2 + 1.» Los fixtures cruzan fin de mes,
     fin de año y febrero, que es donde un «+1» mal hecho (sumar al número del día, o en hora local) se equivoca. */
  it('🔴 N2 es el día del desove y N5 el siguiente, también al cambiar de mes, de año y en febrero', () => {
    expect(fechasNauplios('2026-09-14')).toEqual({ n2: '2026-09-14', n5: '2026-09-15' });
    expect(fechasNauplios('2026-09-30')).toEqual({ n2: '2026-09-30', n5: '2026-10-01' });
    expect(fechasNauplios('2026-12-31')).toEqual({ n2: '2026-12-31', n5: '2027-01-01' });
    expect(fechasNauplios('2028-02-28')).toEqual({ n2: '2028-02-28', n5: '2028-02-29' });
    expect(fechasNauplios('2027-02-28')).toEqual({ n2: '2027-02-28', n5: '2027-03-01' });
  });

  it('🔴 sin un día real no hay fechas: ni un patrón válido que no existe, ni otro formato', () => {
    for (const f of ['2026-02-31', '2027-02-29', '2026-13-01', '08/09/2026', '', null, undefined, '2026-9-14']) {
      expect(fechasNauplios(f), String(f)).toEqual({ n2: '', n5: '' });
    }
  });

  const fila = (desove, fecha = '2026-09-30') => buildDesoveRows({ fecha, desoves: [{ lote: 'BP', codigoGenetico: 'CG1', ...desove }] })[0];

  it('🔴 cada fecha va SÓLO con su cifra: sin recuento, la celda va vacía', () => {
    const conAmbos = fila({ n2: 9000, n5: 8000 });
    expect([conAmbos[col('Fecha N2')], conAmbos[col('Fecha N5')]]).toEqual(['2026-09-30', '2026-10-01']);
    const soloN2 = fila({ n2: 9000 });
    expect([soloN2[col('Fecha N2')], soloN2[col('Fecha N5')]]).toEqual(['2026-09-30', '']);
    const sinNauplios = fila({ huevos: 100 });
    expect([sinNauplios[col('Fecha N2')], sinNauplios[col('Fecha N5')]]).toEqual(['', '']);
    const ceros = fila({ n2: 0, n5: '0' });                  // un recuento de 0 es un recuento
    expect([ceros[col('Fecha N2')], ceros[col('Fecha N5')]]).toEqual(['2026-09-30', '2026-10-01']);
  });

  /* 🔴 2026-09-17 · ESTA PRUEBA DECÍA LO CONTRARIO («lo tecleado se IGNORA») y no estaba mal: el usuario
     cambió la regla. Las fechas siguen saliendo solas, pero ahora son un DEFECTO que se puede corregir,
     porque un recuento puede hacerse un día distinto del que toca. */
  it('🔴 la fecha tecleada MANDA sobre la derivada, y sólo la derivada rellena lo que falta', () => {
    const r = fila({ n2: 9000, fechaN2: '2026-10-05', n5: 8000, fechaN5: '2026-10-09' });
    expect([r[col('Fecha N2')], r[col('Fecha N5')]]).toEqual(['2026-10-05', '2026-10-09']);
    // una sola editada: la otra sigue saliendo de la del desove
    const soloN2 = fila({ n2: 9000, fechaN2: '2026-10-05', n5: 8000 });
    expect([soloN2[col('Fecha N2')], soloN2[col('Fecha N5')]]).toEqual(['2026-10-05', '2026-10-01']);
    // basura no manda: cae a la derivada en vez de escribir un disparate en la hoja
    for (const basura of ['2026-02-31', '05/10/2026', 'ayer', '2026-10-5']) {
      expect(fila({ n2: 9000, fechaN2: basura })[col('Fecha N2')], String(basura)).toBe('2026-09-30');
    }
    // y la regla de siempre no se toca: sin cifra no hay fecha, por muy tecleada que esté
    const sinCifra = fila({ fechaN2: '2026-10-05', fechaN5: '2026-10-06' });
    expect([sinCifra[col('Fecha N2')], sinCifra[col('Fecha N5')]]).toEqual(['', '']);
  });
});

describe('Desoves · pendientes: guardar hoy y completar N2/N5 otro día (2026-09-14, usuario)', () => {
  const HOJA = (o) => Object.assign({ Fecha: '2026-09-07', Lote: 'BP', 'Código genético': 'OLF5.F2', 'Piscina Broodstock': 558,
    Desoves: 64, 'Total de huevos': 14440000, 'Hembras no viables': 3, 'Fecha N2': '', N2: '', 'Fecha N5': '', N5: '',
    Despacho: '', Observaciones: '' }, o);

  it('🔴 de la hoja al formulario: lo ×1000 vuelve a miles y un lote numérico vuelve a texto', () => {
    const d = desoveDesdeHoja(HOJA({ Lote: 766, N2: 9000000, 'Fecha N2': '2026-09-08', Despacho: 'Mar Bravo M09, Mar Bravo M10' }));
    expect(d).toMatchObject({ fecha: '2026-09-07', lote: '766', piscina: '558', desoves: '64', huevos: '14440',
      hembrasNoViables: '3', fechaN2: '2026-09-08', n2: '9000', n5: '', despacho: ['Mar Bravo M09', 'Mar Bravo M10'] });
  });

  it('🔴 completo = cifra de N5; una fecha de N5 sola NO completa; un N5 de 0 sí', () => {
    expect(desoveCompleto({ n5: '' , fechaN5: '2026-09-09' })).toBe(false);
    expect(desoveCompleto({ n5: '0' })).toBe(true);
    expect(desoveCompleto({ n5: 9000 })).toBe(true);
  });

  it('🔴 la hoja sin N5 es pendiente; con N5, no', () => {
    const p = desovesPendientes([HOJA(), HOJA({ 'Código genético': 'CG2', N5: 9000000 })], []);
    expect(p.map((d) => d.codigoGenetico)).toEqual(['OLF5.F2']);
    expect(p[0].origen).toBe('hoja');
  });

  it('🔴 lo de este dispositivo pisa lo NO vacío y conserva lo vacío (como el MERGE del GAS)', () => {
    const local = { fecha: '2026-09-07', lote: 'bp', codigoGenetico: 'olf5.f2', desoves: '', n2: '8800', fechaN2: '2026-09-08', despacho: [] };
    const [d] = desovesPendientes([HOJA({ Despacho: 'Tabasca' })], [local]);
    expect(d).toMatchObject({ desoves: '64', huevos: '14440', n2: '8800', fechaN2: '2026-09-08', despacho: ['Tabasca'], origen: 'hoja' });
  });

  it('🔴 un N5 guardado en este dispositivo saca de la lista aunque la hoja leída aún no lo tenga', () => {
    expect(desovesPendientes([HOJA()], [{ fecha: '2026-09-07', lote: 'BP', codigoGenetico: 'OLF5.F2', n5: '9000' }])).toEqual([]);
  });

  it('lo que sólo está en este dispositivo aparece como tal; lo más reciente, primero', () => {
    const p = desovesPendientes([HOJA()], [{ fecha: '2026-09-12', lote: 'BC', codigoGenetico: 'X1', huevos: '500' }]);
    expect(p.map((d) => [d.fecha, d.origen])).toEqual([['2026-09-12', 'dispositivo'], ['2026-09-07', 'hoja']]);
    expect(p[0]).toMatchObject({ huevos: '500', n2: '', despacho: [] });
  });

  it('una fila sin fecha válida o sin llave no entra', () => {
    expect(desovesPendientes([HOJA({ Fecha: '' }), HOJA({ Lote: '' })], [{ fecha: 'x', lote: 'A', codigoGenetico: 'B' }])).toEqual([]);
  });

  it('🔴 anotar FUSIONA con lo anotado antes y conserva el completo como marca', () => {
    let l = anotarDesovesLocales([], { fecha: '2026-09-07', desoves: [{ lote: 'BP', codigoGenetico: 'CG1', desoves: '64', huevos: '14440' }] }, 1);
    l = anotarDesovesLocales(l, { fecha: '2026-09-07', desoves: [{ lote: 'bp', codigoGenetico: 'cg1', desoves: '', n2: '9000', despacho: ['Tabasca'] }] }, 2);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ desoves: '64', huevos: '14440', n2: '9000', despacho: ['Tabasca'], ts: 2 });
    l = anotarDesovesLocales(l, { fecha: '2026-09-07', desoves: [{ lote: 'BP', codigoGenetico: 'CG1', n5: '8000' }] }, 3);
    expect(l).toHaveLength(1);
    expect(desoveCompleto(l[0])).toBe(true);
    expect(l[0].n2).toBe('9000');
  });

  it('anotar ignora lo que no tiene llave y guarda los 60 más recientes', () => {
    let l = [];
    for (let i = 0; i < 65; i++) l = anotarDesovesLocales(l, { fecha: '2026-09-07', desoves: [{ lote: 'L' + i, codigoGenetico: 'C' }, { lote: '', codigoGenetico: 'C' }] }, i);
    expect(l).toHaveLength(60);
    expect(l[0].lote).toBe('L5');
    expect(l[59].lote).toBe('L64');
  });

  it('🔴 podar quita lo que la hoja ya tiene COMPLETO y deja lo demás', () => {
    const locales = [{ fecha: '2026-09-07', lote: 'BP', codigoGenetico: 'OLF5.F2', n5: '9000' }, { fecha: '2026-09-07', lote: 'BP', codigoGenetico: 'CG2', n2: '1' }];
    const hoja = [HOJA({ N5: 9000000 }), HOJA({ 'Código genético': 'CG2' })];
    expect(podarDesovesLocales(locales, hoja).map((l) => l.codigoGenetico)).toEqual(['CG2']);
    expect(podarDesovesLocales(locales, [HOJA()])).toHaveLength(2);
  });

  it('la llave es la del GAS: fecha, lote y código normalizados', () => {
    expect(desoveLlave({ fecha: '2026-09-07', lote: ' b p ', codigoGenetico: 'olf5.f2' })).toBe('2026-09-07|BP|OLF5.F2');
  });
});
