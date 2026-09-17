/* ============================================================
   MADURACIÓN · CONTROL BROODSTOCK · la carga semanal (2026-09-17, usuario)

   🔑 LOS FIXTURES SON DATOS REALES del archivo que trajo el usuario («HOJA BROODSTOCK (4).xlsx», hoja
   «19 Jul. 26»), no cifras inventadas: piscinas 810 (precría), 815 y 818 (pre-reproductor) con sus
   fechas, pesos y días tal como vienen. Un fixture inventado aquí no distinguiría nada, porque lo que
   se prueba es precisamente que la cuenta case con la hoja que el área ya usa.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  MAD_BS_SHEET, MAD_BS_HEADERS, MAD_BS_KEY_COLS, MAD_BS_FASES, MAD_BS_COLUMNS,
  faseCanonica, normPiscina, normCodigo, diaReal, diasEntre, tieneDatos,
  buildBroodstockRows, buildBroodstockPayload, validarBroodstock,
} from './ficha-maduracion-broodstock.schema.js';

const col = (h) => MAD_BS_HEADERS.indexOf(h);
const CORTE = '2026-07-19';

/* Piscina 815 del archivo: pre-reproductor, sembrada el 19-jun, 2270 animales en 0,24 ha, peso de
   siembra 23 g y peso de la última semana 46 g. El Excel le pone 125 días de edad (0 + 95 + 30). */
const P815 = {
  piscina: 815, area: 0.24, fechaSiembra: '2026-06-19', cantidad: 2270, pesoSiembra: 23,
  fase: 'Pre-reproductor', peso: 46, pesoPrevio: 40, fechaPeso: '2026-07-19',
  sobrevivencia: 83, dias1: 0, dias2: 95, dias3: 30,
  piscinaOrigen: 810, camaronera: 'Chongón', codigo: 'XPR6.F6', observacion: 'LÍNEA DE PRUEBA',
};
/* Piscina 810: la de PRECRIA, la única con Pl/g. En el archivo su «peso de siembra» venía como el texto
   «130.pl», que es lo que motivó la columna nueva. */
const P810 = {
  piscina: 810, area: 0.38, fechaSiembra: '2026-07-12', cantidad: 312000, pesoSiembra: '', plg: 130,
  fase: 'PRECRIA', peso: 0.1, fechaPeso: '2026-07-19', sobrevivencia: 95, dias1: 7,
  codigo: 'XPR1. F9', observacion: 'LÍNEA DE PRUEBA',
};
/* Una de las siete que el archivo trae VACÍAS: sólo número y área. */
const P811 = { piscina: 811, area: 0.24 };

/* ⚠ Se compara con `undefined`, no con un «o» por defecto: con lo segundo, pasar una fecha VACÍA a
   propósito la convertía en la fecha buena, y la prueba de «sin fecha de corte» medía otra cosa. */
const modelo = (piscinas, fechaCorte) => ({ fechaCorte: fechaCorte === undefined ? CORTE : fechaCorte, piscinas });
const fila = (p, corte) => buildBroodstockRows(modelo([p], corte))[0];

describe('Broodstock · la hoja y su llave', () => {
  it('🔴 la llave es (fecha de corte · piscina), y va al PRINCIPIO', () => {
    expect(MAD_BS_KEY_COLS).toEqual([0, 1]);
    expect([MAD_BS_HEADERS[0], MAD_BS_HEADERS[1]]).toEqual(['Fecha de corte', 'Piscina']);
  });

  it('🔴 el bloque de cinco PESOS del Excel NO se copia como columnas', () => {
    // La serie semanal son las FILAS de las semanas anteriores. Copiarla obligaría a rotar columnas.
    expect(MAD_BS_HEADERS.filter((h) => /^Peso/.test(h))).toEqual(['Peso de siembra (g)', 'Peso actual (g)']);
  });

  it('el payload va por llave, para que re-subir la misma semana CORRIJA en vez de duplicar', () => {
    const p = buildBroodstockPayload(modelo([P815]));
    expect([p.sheetName, p.replaceKey]).toEqual([MAD_BS_SHEET, true]);
    expect(p.keyCols).toEqual(MAD_BS_KEY_COLS);
    expect(p.headers).toEqual(MAD_BS_HEADERS);
  });

  it('la cabecera se DERIVA de las columnas, nunca se teclea aparte', () => {
    expect(MAD_BS_HEADERS).toEqual(MAD_BS_COLUMNS.map((c) => c.h));
  });
});

describe('Broodstock · las tres fases y su grafía', () => {
  it('🔴 son exactamente tres', () => {
    expect([...MAD_BS_FASES]).toEqual(['Precría', 'Engorde', 'Pre-reproductor']);
  });

  it('🔴 la grafía se canoniza: el archivo trae «PRECRIA» y «Pre-reproductor» a la vez', () => {
    for (const v of ['PRECRIA', 'precria', 'Precría', 'PRECRÍA', 'pre cria', 'pre-cria']) {
      expect(faseCanonica(v), v).toBe('Precría');
    }
    for (const v of ['Pre-reproductor', 'PRE REPRODUCTOR', 'prereproductor']) {
      expect(faseCanonica(v), v).toBe('Pre-reproductor');
    }
    expect(faseCanonica('ENGORDE')).toBe('Engorde');
  });

  it('🔴 una fase que NO está en el catálogo se conserva tal cual, no se inventa', () => {
    expect(faseCanonica('Reproductor')).toBe('');
    expect(fila({ ...P815, fase: 'Reproductor' })[col('Fase actual')]).toBe('Reproductor');
    expect(validarBroodstock(modelo([{ ...P815, fase: 'Reproductor' }])).avisos.join(' ')).toContain('no es ninguna de las tres');
  });

  it('la fila escribe la forma CANÓNICA, no la del archivo', () => {
    expect(fila(P810)[col('Fase actual')]).toBe('Precría');
  });
});

describe('Broodstock · lo calculado se RECALCULA, no se copia del archivo', () => {
  it('🔴 densidad = cantidad ÷ (área × 10 000), como en el Excel', () => {
    // 2270 / (0,24 × 10000) = 0,9458…  → el Excel muestra 0,9458333…
    expect(fila(P815)[col('Densidad (cam/m²)')]).toBe(0.95);
    // 312000 / (0,38 × 10000) = 82,105…
    expect(fila(P810)[col('Densidad (cam/m²)')]).toBe(82.11);
  });

  it('🔴 sin área, o con área 0, la densidad queda VACÍA — nunca Infinity', () => {
    expect(fila({ ...P815, area: 0 })[col('Densidad (cam/m²)')]).toBe('');
    expect(fila({ ...P815, area: '' })[col('Densidad (cam/m²)')]).toBe('');
  });

  it('🔴 los días de la fase ACTUAL salen de la siembra al corte; los otros dos llegan del archivo', () => {
    const f = fila(P815);
    // pre-reproductor: 19-jun → 19-jul = 30 días, que es lo que trae el Excel en su columna
    expect(f[col('Días fase 3 (pre-reproductor)')]).toBe(30);
    expect(f[col('Días fase 1 (precría)')]).toBe(0);
    expect(f[col('Días fase 2 (engorde)')]).toBe(95);
    expect(f[col('Edad total (días)')], 'el Excel da 125').toBe(125);
  });

  it('🔴 en PRECRIA los días van a la fase 1, no a la 3', () => {
    // 12-jul → 19-jul = 7 días, que es lo que trae el Excel
    const f = fila(P810);
    expect(f[col('Días fase 1 (precría)')]).toBe(7);
    expect(f[col('Días fase 3 (pre-reproductor)')]).toBe('');
  });

  it('🔴 crecimiento de la fase = (peso − peso de siembra) ÷ días de la fase × 7', () => {
    // (46 − 23) / 30 × 7 = 5,3666… → el Excel da 5,3666666
    expect(fila(P815)[col('Crecimiento fase actual (g/sem)')]).toBe(5.37);
  });

  it('🔴 sin días de la fase el crecimiento queda VACÍO: dividir por cero daría Infinity', () => {
    expect(fila({ ...P815, fechaSiembra: CORTE })[col('Crecimiento fase actual (g/sem)')]).toBe('');
  });

  it('el incremento de la semana es peso − peso de la semana anterior', () => {
    expect(fila(P815)[col('Incremento última semana (g)')]).toBe(6);
    expect(fila({ ...P815, pesoPrevio: '' })[col('Incremento última semana (g)')]).toBe('');
  });

  it('el fixture ejerce algo: cambiar UN dato crudo mueve lo calculado', () => {
    expect(fila({ ...P815, cantidad: 4540 })[col('Densidad (cam/m²)')]).toBe(1.89);
    expect(fila({ ...P815, peso: 60 })[col('Crecimiento fase actual (g/sem)')]).toBe(8.63);
  });
});

describe('Broodstock · Pl/g, la columna nueva', () => {
  it('🔴 va al lado del peso de siembra y lleva las postlarvas por gramo', () => {
    expect(MAD_BS_HEADERS[col('Pl/g')]).toBe('Pl/g');
    expect(col('Pl/g') - col('Peso de siembra (g)'), 'tiene que ir justo al lado').toBe(1);
    expect(fila(P810)[col('Pl/g')], 'la precría del archivo trae 130').toBe(130);
  });

  it('🔴 y el peso de siembra queda para GRAMOS: ya no mezcla las dos cosas', () => {
    expect(fila(P810)[col('Peso de siembra (g)')], 'la precría no tiene peso en gramos').toBe('');
    expect(fila(P815)[col('Peso de siembra (g)')]).toBe(23);
    expect(fila(P815)[col('Pl/g')], 'y el pre-reproductor no tiene Pl/g').toBe('');
  });

  it('un «130.pl» que se colara en el peso de siembra NO se escribe como número', () => {
    expect(fila({ ...P810, pesoSiembra: '130.pl' })[col('Peso de siembra (g)')]).toBe('');
  });
});

describe('Broodstock · las piscinas SIN datos no se suben (usuario)', () => {
  it('🔴 una piscina con sólo número y área se queda fuera', () => {
    expect(tieneDatos(P811)).toBe(false);
    expect(buildBroodstockRows(modelo([P815, P811, P810]))).toHaveLength(2);
  });

  it('🔴 y se dice cuáles, para que nadie crea que se perdieron', () => {
    const { errores, avisos } = validarBroodstock(modelo([P815, P811]));
    expect(errores).toEqual([]);
    expect(avisos.join(' ')).toContain('811');
    expect(avisos.join(' ')).toContain('cuando los tengan');
  });

  it('el fixture ejerce algo: en cuanto la piscina trae UN dato, entra', () => {
    for (const dato of [{ fechaSiembra: '2026-07-01' }, { cantidad: 100 }, { peso: 12 }, { fase: 'Engorde' }]) {
      expect(tieneDatos({ ...P811, ...dato }), JSON.stringify(dato)).toBe(true);
    }
  });

  it('si NINGUNA trae datos, es error: no hay nada que subir', () => {
    expect(validarBroodstock(modelo([P811])).errores.join(' ')).toContain('Ninguna piscina');
  });
});

describe('Broodstock · validación', () => {
  it('🔴 la misma piscina dos veces es ERROR: la segunda pisaría a la primera', () => {
    const { errores } = validarBroodstock(modelo([P815, { ...P815, peso: 99 }]));
    expect(errores.join(' ')).toContain('dos veces');
  });

  it('🔴 la piscina se compara sin espacios: «815» y « 815 » son la misma', () => {
    expect(normPiscina(' 815 ')).toBe('815');
    expect(validarBroodstock(modelo([P815, { ...P815, piscina: ' 815 ' }])).errores.join(' ')).toContain('dos veces');
  });

  it('🔴 sin fecha de corte no se sube nada: no se sabría de qué semana es', () => {
    expect(validarBroodstock(modelo([P815], '')).errores.join(' ')).toContain('fecha de corte');
    expect(buildBroodstockRows(modelo([P815], ''))).toEqual([]);
  });

  it('🔴 una fecha de corte que no existe tampoco vale', () => {
    expect(diaReal('2026-02-31')).toBe('');
    expect(validarBroodstock(modelo([P815], '2026-02-31')).errores.join(' ')).toContain('fecha de corte');
  });

  /* 🔴 LA ERRATA QUE TRAÍA EL ARCHIVO. Una de las cinco fechas de peso venía con un mes de diferencia
     (06-12 donde tocaba 07-12). No se corrige por dentro —sería tapar el error—: se avisa, para
     arreglarlo con quien llena la hoja, que es lo que pidió el usuario. */
  it('🔴 un peso fechado DESPUÉS del corte se avisa, no se corrige', () => {
    const { avisos } = validarBroodstock(modelo([{ ...P815, fechaPeso: '2026-08-02' }]));
    expect(avisos.join(' ')).toContain('DESPUÉS del corte');
    expect(fila({ ...P815, fechaPeso: '2026-08-02' })[col('Fecha del peso')], 'se sube tal cual').toBe('2026-08-02');
  });

  it('un peso fechado ANTES de la siembra también se avisa', () => {
    expect(validarBroodstock(modelo([{ ...P815, fechaPeso: '2026-01-01' }])).avisos.join(' ')).toContain('ANTES de su siembra');
  });

  it('🔴 la sobrevivencia va en PORCENTAJE: una fracción sin convertir se delata', () => {
    expect(validarBroodstock(modelo([{ ...P815, sobrevivencia: 0.83 }])).avisos.join(' ')).toContain('fracción sin convertir');
    expect(validarBroodstock(modelo([P815])).avisos.join(' '), 'el 83 no se queja').not.toContain('fracción');
    expect(validarBroodstock(modelo([{ ...P815, sobrevivencia: 140 }])).avisos.join(' ')).toContain('fuera de 0-100');
  });

  it('una fecha de siembra imposible se avisa y la celda va vacía', () => {
    const m = modelo([{ ...P815, fechaSiembra: '2026-02-31' }]);
    expect(validarBroodstock(m).avisos.join(' ')).toContain('no es un día real');
    expect(buildBroodstockRows(m)[0][col('Fecha siembra')]).toBe('');
  });
});

describe('Broodstock · el puente con el registro reproductivo', () => {
  /* 🔑 Las reproductoras de la MATRIZ se cosechan de estas piscinas, y su «Código genético» es este
     `Codigo`. Medido: la MATRIZ guarda «XPR5.F1(A1BC-DEFGH.6G)» y el Excel «XPR5. F1 (A1BC-DEFGH.6G)».
     Si cada uno normalizara a su manera, el mismo código se partiría en dos al cruzarlos. */
  it('🔴 el código genético se normaliza como en el reproductivo: el del archivo y el de la MATRIZ casan', () => {
    expect(normCodigo('XPR5. F1 (A1BC-DEFGH.6G)')).toBe('XPR5.F1(A1BC-DEFGH.6G)');
    expect(normCodigo('XPR5. F1 (A1BC-DEFGH.6G)')).toBe(normCodigo('XPR5.F1(A1BC-DEFGH.6G)'));
    expect(fila(P815)[col('Código genético')]).toBe('XPR6.F6');
  });

  it('diasEntre cuenta días reales y no se deja engañar por un día que no existe', () => {
    expect(diasEntre('2026-06-19', '2026-07-19')).toBe(30);
    expect(diasEntre('2026-02-31', '2026-07-19')).toBe('');
    expect(diasEntre('2026-12-31', '2027-01-01'), 'cruza el año').toBe(1);
  });
});
