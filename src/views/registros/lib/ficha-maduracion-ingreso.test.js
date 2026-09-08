import { describe, it, expect } from 'vitest';
import {
  MAD_INGRESO_SHEET,
  MAD_INGRESO_COLUMNS,
  MAD_INGRESO_HEADERS,
  MAD_SALA_OPTS,
  MAD_TANQUES_POR_SALA,
  AGUA_OPTS,
  normLote,
  normCodigoGenetico,
  salaTag,
  ingresoRowId,
  buildIngresoRows,
  buildIngresoPayload,
  validarIngreso,
  sumaReparto,
  repartirParejo,
} from './ficha-maduracion-ingreso.schema.js';

/* Modelo base VÁLIDO. Cada prueba parte de aquí y rompe UNA cosa, para que el rojo
   señale esa cosa y no un fixture mal montado. */
const base = () => ({
  fecha: '2026-09-08',
  lote: 'AB',
  composiciones: [
    {
      codigoGenetico: 'CG01',
      piscina: 'P-12',
      camaronera: 'Camaronera Norte',
      machos: 300,
      hembras: 600,
      pesoMachos: 34.5,
      pesoHembras: 41.2,
      supervivencia: 78.4,
      camaronesM2: 12,
      densidad: 9.5,
      reparto: [
        { sala: 'Sala 1', tanque: 1, machos: 150, hembras: 300, agua: 'RAS' },
        { sala: 'Sala 1', tanque: 2, machos: 150, hembras: 300, agua: 'RAS' },
      ],
    },
  ],
});

const col = (h) => MAD_INGRESO_HEADERS.indexOf(h);

describe('Ingreso a Maduración · la hoja y sus columnas', () => {
  it('las cabeceras se DERIVAN de las columnas, no se declaran aparte', () => {
    expect(MAD_INGRESO_HEADERS).toEqual(MAD_INGRESO_COLUMNS.map((c) => c.h));
  });

  it('son 16 columnas y el ID va la ÚLTIMA', () => {
    expect(MAD_INGRESO_HEADERS).toHaveLength(16);
    expect(MAD_INGRESO_HEADERS[15]).toBe('ID');
  });

  it('cabe en el tope de columnas del GAS para Maduración', () => {
    // LIMITS.mad.maxCols. Un payload más ancho lo RECHAZA doPost entero desde el
    // 2026-08-30, así que esto no es cosmético.
    expect(MAD_INGRESO_HEADERS.length).toBeLessThanOrEqual(25);
  });

  it('ninguna columna repite cabecera ni clave', () => {
    expect(new Set(MAD_INGRESO_HEADERS).size).toBe(MAD_INGRESO_COLUMNS.length);
    expect(new Set(MAD_INGRESO_COLUMNS.map((c) => c.k)).size).toBe(MAD_INGRESO_COLUMNS.length);
  });

  it('la hoja se llama como la que el GAS tiene permitida', () => {
    expect(MAD_INGRESO_SHEET).toBe('Maduración Ingreso');
  });
});

describe('Ingreso · las salas 4A y 4B quedaron disueltas', () => {
  it('no se ofrecen en el selector', () => {
    expect(MAD_SALA_OPTS).not.toContain('Sala 4A');
    expect(MAD_SALA_OPTS).not.toContain('Sala 4B');
    expect(MAD_SALA_OPTS).toEqual(['Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5']);
  });

  it('tampoco tienen tanques declarados', () => {
    expect(MAD_TANQUES_POR_SALA['Sala 4A']).toBeUndefined();
    expect(MAD_TANQUES_POR_SALA['Sala 4B']).toBeUndefined();
  });

  it('cada sala del selector tiene su lista de tanques', () => {
    MAD_SALA_OPTS.forEach((s) => {
      expect(Array.isArray(MAD_TANQUES_POR_SALA[s])).toBe(true);
      expect(MAD_TANQUES_POR_SALA[s].length).toBeGreaterThan(0);
    });
  });

  it('el número de tanque NO es único entre salas: sólo identifica junto a la sala', () => {
    // Si esto dejara de ser cierto, la llave podría prescindir de la sala. Hoy no puede.
    expect(MAD_TANQUES_POR_SALA['Sala 1']).toContain(1);
    expect(MAD_TANQUES_POR_SALA['Sala 4']).toContain(1);
  });
});

describe('Ingreso · normalización de grafías', () => {
  it('el lote se guarda en mayúsculas y sin espacios', () => {
    expect(normLote(' ab ')).toBe('AB');
    expect(normLote('b c')).toBe('BC');
  });

  it('«Ab» y «AB» producen la MISMA llave — que es el punto', () => {
    // En producción ya conviven las dos grafías. Si la llave las distinguiera,
    // dos personas registrando el mismo ingreso crearían filas gemelas.
    expect(ingresoRowId('Ab', 'cg01', 'Sala 1', 1)).toBe(ingresoRowId('AB', 'CG01', 'Sala 1', 1));
  });

  it('el código genético también se normaliza', () => {
    expect(normCodigoGenetico(' cg 01 ')).toBe('CG01');
  });

  it('la sala se compacta para la llave pero NO para la columna', () => {
    expect(salaTag('Sala 4')).toBe('S4');
    expect(salaTag('Sala 12')).toBe('S12');
  });

  it('la llave completa tiene la forma documentada', () => {
    expect(ingresoRowId('AB', 'CG01', 'Sala 3', 22)).toBe('AB-CG01-S3-t22');
  });

  it('lotes distintos NO comparten llave en el mismo tanque', () => {
    expect(ingresoRowId('AB', 'CG01', 'Sala 1', 1)).not.toBe(ingresoRowId('BC', 'CG01', 'Sala 1', 1));
  });

  it('el mismo tanque de salas distintas NO comparte llave', () => {
    // Sala 1 y Sala 4 tienen ambas un tanque 1.
    expect(ingresoRowId('AB', 'CG01', 'Sala 1', 1)).not.toBe(ingresoRowId('AB', 'CG01', 'Sala 4', 1));
  });
});

describe('Ingreso · construcción de filas', () => {
  it('sale una fila por cada tanque repartido', () => {
    expect(buildIngresoRows(base())).toHaveLength(2);
  });

  it('cada celda cae en la columna que dice su cabecera', () => {
    const [f] = buildIngresoRows(base());
    expect(f[col('Fecha')]).toBe('2026-09-08');
    expect(f[col('Lote')]).toBe('AB');
    expect(f[col('Código genético')]).toBe('CG01');
    expect(f[col('Piscina Broodstock')]).toBe('P-12');
    expect(f[col('Camaronera origen')]).toBe('Camaronera Norte');
    expect(f[col('Sala')]).toBe('Sala 1');
    expect(f[col('Tanque')]).toBe(1);
    expect(f[col('Machos')]).toBe(150);
    expect(f[col('Hembras')]).toBe(300);
    expect(f[col('Peso promedio machos (g)')]).toBe(34.5);
    expect(f[col('Peso promedio hembras (g)')]).toBe(41.2);
    expect(f[col('Supervivencia piscina (%)')]).toBe(78.4);
    expect(f[col('Camarones por m2')]).toBe(12);
    expect(f[col('Densidad de siembra')]).toBe(9.5);
    expect(f[col('Agua')]).toBe('RAS');
    expect(f[col('ID')]).toBe('AB-CG01-S1-t1');
  });

  it('la fila tiene tantas celdas como cabeceras', () => {
    buildIngresoRows(base()).forEach((f) => expect(f).toHaveLength(MAD_INGRESO_HEADERS.length));
  });

  it('la cabecera del lote se REPITE en todas las filas', () => {
    const filas = buildIngresoRows(base());
    expect(filas[0][col('Lote')]).toBe(filas[1][col('Lote')]);
    expect(filas[0][col('Fecha')]).toBe(filas[1][col('Fecha')]);
  });

  it('un reparto sin sala o sin tanque NO genera fila', () => {
    const m = base();
    m.composiciones[0].reparto.push({ sala: '', tanque: '', machos: 10, hembras: 10 });
    m.composiciones[0].reparto.push({ sala: 'Sala 2', tanque: '', machos: 10, hembras: 10 });
    expect(buildIngresoRows(m)).toHaveLength(2);
  });

  it('UN TANQUE MEZCLADO da dos filas con IDs distintos', () => {
    // Es el caso que el usuario describió: dos código-genético/piscina en el mismo
    // tanque. Si el ID no llevara el código genético, la segunda pisaría a la primera.
    const m = base();
    m.composiciones.push({
      codigoGenetico: 'CG02',
      piscina: 'P-19',
      camaronera: 'Camaronera Sur',
      machos: 40,
      hembras: 60,
      reparto: [{ sala: 'Sala 1', tanque: 1, machos: 40, hembras: 60, agua: 'RAS' }],
    });
    const filas = buildIngresoRows(m);
    expect(filas).toHaveLength(3);
    const ids = filas.map((f) => f[col('ID')]);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain('AB-CG01-S1-t1');
    expect(ids).toContain('AB-CG02-S1-t1');
  });

  it('el payload lleva hoja, cabeceras y filas', () => {
    const p = buildIngresoPayload(base());
    expect(p.sheetName).toBe(MAD_INGRESO_SHEET);
    expect(p.headers).toEqual(MAD_INGRESO_HEADERS);
    expect(p.rows).toHaveLength(2);
  });

  it('un modelo vacío no revienta y no produce filas', () => {
    expect(buildIngresoRows(null)).toEqual([]);
    expect(buildIngresoRows({})).toEqual([]);
    expect(buildIngresoRows({ composiciones: [] })).toEqual([]);
  });

  it('los conteos negativos o no numéricos se descartan, no se guardan', () => {
    const m = base();
    m.composiciones[0].reparto[0].machos = -5;
    m.composiciones[0].reparto[1].hembras = 'muchas';
    const filas = buildIngresoRows(m);
    expect(filas[0][col('Machos')]).toBe('');
    expect(filas[1][col('Hembras')]).toBe('');
  });
});

describe('Ingreso · validación', () => {
  it('el modelo base no da ni un error ni un aviso', () => {
    const { errores, avisos } = validarIngreso(base());
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it('ERROR si la misma composición cae dos veces en el mismo tanque', () => {
    // Es pérdida de datos: los dos generan el mismo ID y el upsert escribe encima.
    const m = base();
    m.composiciones[0].reparto.push({ sala: 'Sala 1', tanque: 1, machos: 5, hembras: 5 });
    const { errores } = validarIngreso(m);
    expect(errores.some((e) => /dos veces en Sala 1 tanque 1/.test(e))).toBe(true);
  });

  it('NO es error que dos composiciones distintas compartan tanque (es una mezcla)', () => {
    const m = base();
    m.composiciones.push({
      codigoGenetico: 'CG02',
      piscina: 'P-19',
      machos: 10,
      hembras: 10,
      reparto: [{ sala: 'Sala 1', tanque: 1, machos: 10, hembras: 10 }],
    });
    expect(validarIngreso(m).errores).toEqual([]);
  });

  it('ERROR si se repite el código genético dentro del mismo ingreso', () => {
    const m = base();
    m.composiciones.push({
      codigoGenetico: 'cg01',
      piscina: 'P-19',
      machos: 1,
      hembras: 1,
      reparto: [{ sala: 'Sala 2', tanque: 16, machos: 1, hembras: 1 }],
    });
    expect(validarIngreso(m).errores.some((e) => /CG01.*repetido/.test(e))).toBe(true);
  });

  it('ERROR sin fecha válida, sin lote, o sin composiciones', () => {
    expect(validarIngreso({ ...base(), fecha: '8/9/2026' }).errores.some((e) => /fecha/i.test(e))).toBe(true);
    expect(validarIngreso({ ...base(), lote: '   ' }).errores.some((e) => /lote/i.test(e))).toBe(true);
    expect(validarIngreso({ ...base(), composiciones: [] }).errores.some((e) => /composición/i.test(e))).toBe(true);
  });

  it('ERROR si una composición no se repartió en ningún tanque', () => {
    const m = base();
    m.composiciones[0].reparto = [];
    expect(validarIngreso(m).errores.some((e) => /no se repartió/.test(e))).toBe(true);
  });

  it('AVISO —no error— si lo repartido no cuadra con lo declarado', () => {
    // Criterio del usuario para el descuadre: avisar y dejar guardar.
    const m = base();
    m.composiciones[0].machos = 400; // se reparten 300
    const { errores, avisos } = validarIngreso(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /se declararon 400 machos y se repartieron 300/.test(a))).toBe(true);
  });

  it('el aviso de descuadre dice la diferencia con su signo', () => {
    const m = base();
    m.composiciones[0].hembras = 500; // se reparten 600
    expect(validarIngreso(m).avisos.some((a) => /diferencia -100/.test(a))).toBe(true);
  });

  it('AVISO si el tanque no pertenece a la sala', () => {
    const m = base();
    m.composiciones[0].reparto[0].tanque = 22; // es de Sala 3
    const { errores, avisos } = validarIngreso(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /tanque 22 no es de Sala 1/.test(a))).toBe(true);
  });

  it('AVISO si la sala no existe (p. ej. una 4A de un registro viejo)', () => {
    const m = base();
    m.composiciones[0].reparto[0].sala = 'Sala 4A';
    expect(validarIngreso(m).avisos.some((a) => /no es una sala conocida/.test(a))).toBe(true);
  });

  it('AVISO si falta la piscina broodstock', () => {
    const m = base();
    m.composiciones[0].piscina = '';
    const { errores, avisos } = validarIngreso(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /no declara piscina/.test(a))).toBe(true);
  });
});

describe('Ingreso · reparto sugerido', () => {
  it('reparte parejo y da el resto a los primeros', () => {
    expect(repartirParejo(10, 3)).toEqual([4, 3, 3]);
    expect(repartirParejo(9, 3)).toEqual([3, 3, 3]);
    expect(repartirParejo(1, 3)).toEqual([1, 0, 0]);
  });

  it('lo repartido suma SIEMPRE el total, que es lo único que no puede fallar', () => {
    for (const [t, n] of [[100, 7], [5, 5], [0, 4], [999, 13]]) {
      expect(repartirParejo(t, n).reduce((a, b) => a + b, 0)).toBe(t);
    }
  });

  it('entradas absurdas devuelven lista vacía en vez de romper', () => {
    expect(repartirParejo(10, 0)).toEqual([]);
    expect(repartirParejo(-1, 3)).toEqual([]);
    expect(repartirParejo('x', 3)).toEqual([]);
  });

  it('sumaReparto ignora lo que no sea un conteo', () => {
    expect(sumaReparto([{ machos: 5 }, { machos: '' }, { machos: 'x' }, { machos: 7 }], 'machos')).toBe(12);
    expect(sumaReparto([], 'machos')).toBe(0);
  });
});

describe('Ingreso · el agua es una elección entre dos', () => {
  it('sólo hay dos opciones y son las que el usuario nombró', () => {
    expect(AGUA_OPTS).toEqual(['RAS', 'Agua de playa']);
  });
});
