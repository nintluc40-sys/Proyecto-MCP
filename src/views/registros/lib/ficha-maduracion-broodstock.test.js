/* ============================================================
   MADURACIÓN · CONTROL BROODSTOCK · la carga semanal (2026-09-17, usuario)

   🔑 LOS FIXTURES TIENEN LA FORMA DEL ARCHIVO REAL, NO SUS DATOS (2026-09-18, usuario: «no deben tener
   valores reales»). Piscinas, códigos, fechas, cantidades y pesos son FICTICIOS, pero conservan cada
   relación que enseñó el Excel del área —una precría con sus Pl/g en texto, un pre-reproductor con cinco
   pesos semanales, los días de las tres fases, la errata de un mes en una fecha de pesos— y cada cifra
   CALCULADA que se exige sale de la misma fórmula que usa esa hoja, hecha a mano en el comentario de al
   lado. Que la cuenta casa con la hoja real se comprobó contra el archivo del usuario, fuera del repo.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  MAD_BS_SHEET, MAD_BS_HEADERS, MAD_BS_KEY_COLS, MAD_BS_FASES, MAD_BS_COLUMNS,
  faseCanonica, normPiscina, normCodigo, diaReal, diasEntre, tieneDatos,
  buildBroodstockRows, buildBroodstockPayload, validarBroodstock,
  leerHojaBroodstock, leerLibroBroodstock, cortesRepetidos, diaDeCelda, letraCol,
} from './ficha-maduracion-broodstock.schema.js';

const col = (h) => MAD_BS_HEADERS.indexOf(h);
const CORTE = '2026-04-19';

/* Piscina 815 (ficticia): pre-reproductor, sembrada el 20-mar, 2900 animales en 0,30 ha, peso de
   siembra 21 g y peso de la última semana 45 g. Su edad es 0 + 90 + 30 = 120 días. */
const P815 = {
  piscina: 815, area: 0.30, fechaSiembra: '2026-03-20', cantidad: 2900, pesoSiembra: 21,
  fase: 'Pre-reproductor', peso: 45, pesoPrevio: 38, fechaPeso: '2026-04-19',
  sobrevivencia: 86, dias1: 0, dias2: 90, dias3: 30,
  piscinaOrigen: 810, camaronera: 'Chongón', codigo: 'XPR6.F6', observacion: 'LÍNEA DE PRUEBA',
};
/* Piscina 810 (ficticia): la de PRECRÍA, la única con Pl/g. En el archivo real el «peso de siembra» de la
   precría venía como texto con «.pl», que es lo que motivó la columna nueva. */
const P810 = {
  piscina: 810, area: 0.40, fechaSiembra: '2026-04-12', cantidad: 333000, pesoSiembra: '', plg: 120,
  fase: 'PRECRIA', peso: 0.12, fechaPeso: '2026-04-19', sobrevivencia: 92, dias1: 7,
  codigo: 'XPR1. F9', observacion: 'LÍNEA DE PRUEBA',
};
/* Una de las que el archivo trae VACÍAS: sólo número y área. */
const P811 = { piscina: 811, area: 0.30 };

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
    // 2900 / (0,30 × 10000) = 0,9666…  → redondeada a dos decimales
    expect(fila(P815)[col('Densidad (cam/m²)')]).toBe(0.97);
    // 333000 / (0,40 × 10000) = 83,25
    expect(fila(P810)[col('Densidad (cam/m²)')]).toBe(83.25);
  });

  it('🔴 sin área, o con área 0, la densidad queda VACÍA — nunca Infinity', () => {
    expect(fila({ ...P815, area: 0 })[col('Densidad (cam/m²)')]).toBe('');
    expect(fila({ ...P815, area: '' })[col('Densidad (cam/m²)')]).toBe('');
  });

  it('🔴 los días de la fase ACTUAL salen de la siembra al corte; los otros dos llegan del archivo', () => {
    const f = fila(P815);
    // pre-reproductor: 20-mar → 19-abr = 30 días, que es lo que el Excel pondría en su columna
    expect(f[col('Días fase 3 (pre-reproductor)')]).toBe(30);
    expect(f[col('Días fase 1 (precría)')]).toBe(0);
    expect(f[col('Días fase 2 (engorde)')]).toBe(90);
    expect(f[col('Edad total (días)')], '0 + 90 + 30').toBe(120);
  });

  it('🔴 en PRECRIA los días van a la fase 1, no a la 3', () => {
    // 12-abr → 19-abr = 7 días
    const f = fila(P810);
    expect(f[col('Días fase 1 (precría)')]).toBe(7);
    expect(f[col('Días fase 3 (pre-reproductor)')]).toBe('');
  });

  it('🔴 crecimiento de la fase = (peso − peso de siembra) ÷ días de la fase × 7', () => {
    // (45 − 21) / 30 × 7 = 5,6
    expect(fila(P815)[col('Crecimiento fase actual (g/sem)')]).toBe(5.6);
  });

  it('🔴 sin días de la fase el crecimiento queda VACÍO: dividir por cero daría Infinity', () => {
    expect(fila({ ...P815, fechaSiembra: CORTE })[col('Crecimiento fase actual (g/sem)')]).toBe('');
  });

  it('el incremento de la semana es peso − peso de la semana anterior', () => {
    expect(fila(P815)[col('Incremento última semana (g)')]).toBe(7);   // 45 − 38
    expect(fila({ ...P815, pesoPrevio: '' })[col('Incremento última semana (g)')]).toBe('');
  });

  it('el fixture ejerce algo: cambiar UN dato crudo mueve lo calculado', () => {
    expect(fila({ ...P815, cantidad: 5800 })[col('Densidad (cam/m²)')]).toBe(1.93);                // 5800 / 3000
    expect(fila({ ...P815, peso: 60 })[col('Crecimiento fase actual (g/sem)')]).toBe(9.1);          // (60 − 21) / 30 × 7
  });
});

describe('Broodstock · Pl/g, la columna nueva', () => {
  it('🔴 va al lado del peso de siembra y lleva las postlarvas por gramo', () => {
    expect(MAD_BS_HEADERS[col('Pl/g')]).toBe('Pl/g');
    expect(col('Pl/g') - col('Peso de siembra (g)'), 'tiene que ir justo al lado').toBe(1);
    expect(fila(P810)[col('Pl/g')], 'la precría trae 120').toBe(120);
  });

  it('🔴 y el peso de siembra queda para GRAMOS: ya no mezcla las dos cosas', () => {
    expect(fila(P810)[col('Peso de siembra (g)')], 'la precría no tiene peso en gramos').toBe('');
    expect(fila(P815)[col('Peso de siembra (g)')]).toBe(21);
    expect(fila(P815)[col('Pl/g')], 'y el pre-reproductor no tiene Pl/g').toBe('');
  });

  it('un «120.pl» que se colara en el peso de siembra NO se escribe como número', () => {
    expect(fila({ ...P810, pesoSiembra: '120.pl' })[col('Peso de siembra (g)')]).toBe('');
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
    for (const dato of [{ fechaSiembra: '2026-04-01' }, { cantidad: 100 }, { peso: 12 }, { fase: 'Engorde' }]) {
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
     (un 12 del mes anterior donde tocaba el 12 del mes del corte). No se corrige por dentro —sería tapar
     el error—: se avisa, para arreglarlo con quien llena la hoja, que es lo que pidió el usuario. */
  it('🔴 un peso fechado DESPUÉS del corte se avisa, no se corrige', () => {
    const { avisos } = validarBroodstock(modelo([{ ...P815, fechaPeso: '2026-05-03' }]));
    expect(avisos.join(' ')).toContain('DESPUÉS del corte');
    expect(fila({ ...P815, fechaPeso: '2026-05-03' })[col('Fecha del peso')], 'se sube tal cual').toBe('2026-05-03');
  });

  it('un peso fechado ANTES de la siembra también se avisa', () => {
    expect(validarBroodstock(modelo([{ ...P815, fechaPeso: '2026-01-01' }])).avisos.join(' ')).toContain('ANTES de su siembra');
  });

  it('🔴 la sobrevivencia va en PORCENTAJE: una fracción sin convertir se delata', () => {
    expect(validarBroodstock(modelo([{ ...P815, sobrevivencia: 0.86 }])).avisos.join(' ')).toContain('fracción sin convertir');
    expect(validarBroodstock(modelo([P815])).avisos.join(' '), 'el 86 no se queja').not.toContain('fracción');
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
     `Codigo`. Medido en los datos reales: la MATRIZ guarda el código SIN espacios y el Excel CON ellos
     (aquí, con un código ficticio de la misma forma). Si cada uno normalizara a su manera, el mismo código
     se partiría en dos al cruzarlos. */
  it('🔴 el código genético se normaliza como en el reproductivo: el del archivo y el de la MATRIZ casan', () => {
    expect(normCodigo('XPR5. F1 (A1BC-DEFGH.6G)')).toBe('XPR5.F1(A1BC-DEFGH.6G)');
    expect(normCodigo('XPR5. F1 (A1BC-DEFGH.6G)')).toBe(normCodigo('XPR5.F1(A1BC-DEFGH.6G)'));
    expect(fila(P815)[col('Código genético')]).toBe('XPR6.F6');
  });

  it('diasEntre cuenta días reales y no se deja engañar por un día que no existe', () => {
    expect(diasEntre('2026-03-20', '2026-04-19')).toBe(30);
    expect(diasEntre('2026-02-31', '2026-04-19')).toBe('');
    expect(diasEntre('2026-12-31', '2027-01-01'), 'cruza el año').toBe(1);
  });
});

/* ============================================================
   V1 (2026-09-18) · EL LECTOR: de la hoja que da SheetJS al modelo
   Las hojas se arman como las da `XLSX.read(datos, { cellNF: true })` —una celda por referencia, { t, v, w, z }—
   con la FORMA medida en los archivos del usuario y valores ficticios: A3 = 46131 («4/19/26»), la fila de fechas de
   pesos con una errata de un mes en K6 (46094 = 13/03 donde tocaba 12/04), la precría con «120.pl», la sobrevivencia
   0,86 con formato de %.
   ============================================================ */
const S = (v) => ({ t: 's', v, w: v, z: 'General' });
const N = (v, z) => ({ t: 'n', v, w: String(v), z: z || 'General' });
const PCT = (v) => ({ t: 'n', v, w: Math.round(v * 100) + '%', z: '0%' });
const F = (serial, z) => ({ t: 'n', v: serial, z: z || 'dd/mm/yy;@' });
/* Las columnas de cada plantilla, por letra. La de julio NO tiene «Camaronera»: Código y Observación van un sitio antes. */
const CAB_SEP = ['Piscina', 'Area (ha)', 'Fecha siembra', 'Cantidad Sembrada ', 'Densidad (cam/m2)', 'Peso de siembra ', 'FASE ACTUAL', 'PESOS', '', '', '', '',
  'Inc. Ult. Sem', 'Crecimiento fase actual', 'Sobrev. Estim (%)', 'Dias Cultivos Fase 1 (precria)', 'Dias en fase 2 (engorde)',
  'Dias de cultivo fase 3 (prereproductor)', 'Edad total (dias)', 'Psc. Orig', 'Camaronera', 'Codigo', 'OBSERVACION'];
const CAB_JUL = CAB_SEP.filter((h) => h !== 'Camaronera');
const PESOS_FECHAS = [46103, 46110, 46117, 46094, 46131].map((x) => ({ t: 'n', v: x, z: 'dd/mm/yy;@' }));   // H6..L6: K6 es la errata
/** Una hoja con esas cabeceras (fila 5), sus fechas de pesos (fila 6) y filas desde la 7: cada fila es { cabecera: celda }
 *  o { letra: celda } para lo que va por letra (los pesos, y lo que queda fuera de la tabla). */
function hoja({ cab = CAB_SEP, fechas = PESOS_FECHAS, corte = F(46131, 'm/d/yy'), filas = [] } = {}) {
  const ws = { A1: S('RESUMEN SEMANAL DE PISCINAS · PRUEBA'), A4: S('BROODSTOCK - PRUEBA') };
  if (corte) ws.A3 = corte;
  cab.forEach((h, c) => { if (h) ws[letraCol(c) + '5'] = S(h); });
  fechas.forEach((f, i) => { ws[letraCol(7 + i) + '6'] = f; });
  const colDe = (k) => { const i = cab.indexOf(k); return i === -1 ? k : letraCol(i); };
  filas.forEach((f, i) => Object.entries(f).forEach(([k, celda]) => { ws[colDe(k) + (7 + i)] = celda; }));
  ws['!ref'] = 'A1:' + letraCol(Math.max(cab.length - 1, 22)) + (6 + Math.max(filas.length, 1));
  return ws;
}
/* La 815 (ficticia), en la plantilla de septiembre. */
const R815 = { Piscina: N(815), 'Area (ha)': N(0.30), 'Fecha siembra': F(46101, 'd-mmm-yy'), 'Cantidad Sembrada ': N(2900, '#,##0'),
  'Peso de siembra ': N(21), 'FASE ACTUAL': S('Pre-reproductor'), H: N(21), I: N(27), J: N(32), K: N(38), L: N(45),
  'Sobrev. Estim (%)': PCT(0.86), 'Dias Cultivos Fase 1 (precria)': N(0), 'Dias en fase 2 (engorde)': N(90),
  'Dias de cultivo fase 3 (prereproductor)': N(30), 'Psc. Orig': N(810), Camaronera: S('Chongón'), Codigo: S('XPR6.F6'), OBSERVACION: S('LÍNEA DE PRUEBA') };
/* La 810 (ficticia), la de PRECRIA: su «peso de siembra» es el texto «120.pl». */
const R810 = { Piscina: N(810), 'Area (ha)': N(0.40), 'Fecha siembra': F(46124, 'd-mmm-yy'), 'Cantidad Sembrada ': N(333000),
  'Peso de siembra ': S('120.pl'), 'FASE ACTUAL': S('PRECRIA'), L: N(0.12, '0.00'), 'Sobrev. Estim (%)': PCT(0.92),
  'Dias Cultivos Fase 1 (precria)': N(7), Codigo: S('XPR1. F9'), OBSERVACION: S('LÍNEA DE PRUEBA') };
const sin = (o, k) => { const x = { ...o }; delete x[k]; return x; };
const leer = (ws, opts) => leerHojaBroodstock(ws, opts);
const unaFila = (ws) => buildBroodstockRows(leer(ws))[0];

describe('Broodstock · el LECTOR de la hoja (V1)', () => {
  it('🔴 la plantilla de septiembre: corte de A3, el último peso con SU fecha, el anterior para el incremento y la sobrevivencia en %', () => {
    const l = leer(hoja({ filas: [R815] }));
    expect([l.esBroodstock, l.fechaCorte, l.errores]).toEqual([true, '2026-04-19', []]);
    const p = l.piscinas[0];
    expect([p.piscina, p.peso, p.fechaPeso, p.pesoPrevio, p.sobrevivencia, p.camaronera, p.codigo]).toEqual(['815', 45, '2026-04-19', 38, 86, 'Chongón', 'XPR6.F6']);
    const f = unaFila(hoja({ filas: [R815] }));
    // Lo que el Excel calcula, recalculado: incremento L−K = 45−38 = 7; crecimiento (45−21)/30×7 = 5,6; edad 0+90+30 = 120.
    expect([f[col('Incremento última semana (g)')], f[col('Crecimiento fase actual (g/sem)')], f[col('Edad total (días)')]]).toEqual([7, 5.6, 120]);
  });

  it('🔴 «120.pl» son Pl/g y NO 120 gramos de peso de siembra (también «120 pl/g»)', () => {
    const f = unaFila(hoja({ filas: [R810] }));
    expect([f[col('Peso de siembra (g)')], f[col('Pl/g')]]).toEqual(['', 120]);
    const g = unaFila(hoja({ filas: [{ ...R810, 'Peso de siembra ': S('120 pl/g') }] }));
    expect([g[col('Peso de siembra (g)')], g[col('Pl/g')]]).toEqual(['', 120]);
    // Un peso de siembra que no es ni peso ni Pl/g: vacío, y se dice.
    const l = leer(hoja({ filas: [{ ...R815, 'Peso de siembra ': S('pendiente') }] }));
    expect(l.avisos.join(' ')).toContain('«pendiente», que no es un peso ni unas Pl/g');
  });

  it('🔴 se lee POR CABECERA: en la plantilla de julio (sin «Camaronera») el código no se corre a Camaronera', () => {
    const l = leer(hoja({ cab: CAB_JUL, filas: [sin(R815, 'Camaronera')] }));
    expect([l.piscinas[0].codigo, l.piscinas[0].camaronera, l.piscinas[0].observacion]).toEqual(['XPR6.F6', '', 'LÍNEA DE PRUEBA']);
    expect(l.avisos.join(' ')).toContain('no trae la columna «Camaronera»');
    expect(leer(hoja({ filas: [R815] })).avisos.join(' '), 'la de septiembre sí la trae').not.toContain('Camaronera');
  });

  it('🔴 el incremento es de UNA semana: si la columna anterior al último peso está vacía, no hay incremento', () => {
    const p = leer(hoja({ filas: [sin(R815, 'K')] })).piscinas[0];           // H I J · L: el último es L y K está vacía
    expect([p.peso, p.pesoPrevio]).toEqual([45, '']);
    expect(unaFila(hoja({ filas: [sin(R815, 'K')] }))[col('Incremento última semana (g)')]).toBe('');
  });

  it('🔴 el último peso es el de más a la DERECHA con dato, con la fecha de SU columna', () => {
    const p = leer(hoja({ filas: [sin(R815, 'L')] })).piscinas[0];          // no se pesó esta semana: el último es K
    expect([p.peso, p.fechaPeso, p.pesoPrevio]).toEqual([38, '2026-03-13', 32]);   // la fecha es la de K6, errata incluida
    expect(leer(hoja({ filas: [{ ...R815, L: N(0) }] })).piscinas[0].peso, 'un 0 no es un peso').toBe(38);
  });

  it('🔴 la fecha de corte es la de A3, no la del nombre de la hoja', () => {
    const l = leerLibroBroodstock({ SheetNames: ['26 Abr. 26  '], Sheets: { '26 Abr. 26  ': hoja({ filas: [R815] }) } });
    expect([l.hojas[0].nombre, l.hojas[0].fechaCorte]).toEqual(['26 Abr. 26  ', '2026-04-19']);
    expect(leer(hoja({ corte: null, filas: [R815] })).errores.join(' ')).toContain('No se encuentra la fecha de corte');
    // Un número sin formato de fecha encima de la cabecera NO es la fecha de corte.
    expect(leer(hoja({ corte: N(46131), filas: [R815] })).fechaCorte).toBe('');
  });

  it('🔴 una fecha del bloque de pesos fuera de su semana se avisa en SU columna, con la que le tocaba (y sólo ésa)', () => {
    const av = leer(hoja({ filas: [R815] })).avisos;
    expect(av.filter((a) => a.includes('columna de pesos'))).toEqual([
      'La columna de pesos K6 dice 2026-03-13 y, contando semanas hacia atrás desde el corte, debería ser 2026-04-12. Revísala en la hoja.']);
    const bien = [46103, 46110, 46117, 46124, 46131].map((x) => F(x));
    expect(leer(hoja({ fechas: bien, filas: [R815] })).avisos.join(' ')).not.toContain('columna de pesos');
    // La ÚLTIMA columna distinta del corte tiene su propio aviso: de ella sale la fecha del peso de cada piscina.
    const l6mal = [46110, 46117, 46094, 46131, 46108].map((x) => F(x));          // como el libro (1): L6 un mes antes del corte
    const l = leer(hoja({ corte: F(46138, 'm/d/yy'), fechas: l6mal, filas: [R815] }));
    expect(l.avisos.join(' ')).toContain('La última columna de pesos (L6) dice 2026-03-27 y el corte es 2026-04-26');
  });

  it('🔴 sin la fila de cabecera la hoja NO es de Broodstock; sin una columna obligatoria, error', () => {
    const otra = { A1: S('Otra cosa'), A2: N(3), '!ref': 'A1:B2' };
    const libro = leerLibroBroodstock({ SheetNames: ['Resumen', 'Semana'], Sheets: { Resumen: otra, Semana: hoja({ filas: [R815] }) } });
    expect([libro.ignoradas, libro.hojas.map((h) => h.nombre)]).toEqual([['Resumen'], ['Semana']]);
    const sinCodigo = leer(hoja({ cab: CAB_SEP.map((h) => (h === 'Codigo' ? '' : h)), filas: [R815] }));
    expect(sinCodigo.errores.join(' ')).toContain('Falta la columna «codigo»');
    expect(sinCodigo.piscinas).toEqual([]);
    const rara = leer(hoja({ cab: CAB_SEP.concat(['Tallas']), filas: [R815] }));
    expect(rara.avisos.join(' ')).toContain('X («Tallas»)');
    expect(rara.errores).toEqual([]);
  });

  it('🔴 lo que no es una piscina no se sube: una fila «TOTAL», las notas de texto y los números sueltos', () => {
    const l = leer(hoja({ filas: [R815, {}, { C: S('NOTA: PISCINAS 836 Y 837 FUERON RALEADAS EL 13 DE ABRIL 2026') },
      { Piscina: S('TOTAL'), 'Cantidad Sembrada ': N(9999) }, { E: N(0) }] }));
    expect(l.piscinas.map((p) => p.piscina)).toEqual(['815']);
    expect(l.notas).toEqual(['Fila 9: NOTA: PISCINAS 836 Y 837 FUERON RALEADAS EL 13 DE ABRIL 2026', 'Fila 10: TOTAL']);
  });

  it('la sobrevivencia: fracción con % → ×100; sin formato de %, tal cual; texto «95%» → 95', () => {
    const sob = (celda) => leer(hoja({ filas: [{ ...R815, 'Sobrev. Estim (%)': celda }] })).piscinas[0].sobrevivencia;
    expect([sob(PCT(0.57)), sob(N(0.95)), sob(N(95)), sob(S('95%')), sob(S('95,5 %'))]).toEqual([57, 0.95, 95, 95, 95.5]);
  });

  it('las fechas de siembra: serial en cualquier formato, texto dd/mm/aaaa o dd/mm/aa, y lo ilegible pasa para que el modelo lo avise', () => {
    const siembra = (celda) => leer(hoja({ filas: [{ ...R815, 'Fecha siembra': celda }] })).piscinas[0].fechaSiembra;
    expect([siembra(N(46101)), siembra(S('20/03/2026')), siembra(S('20/03/26')), siembra(S('2026-03-20')), siembra(S('mañana'))])
      .toEqual(['2026-03-20', '2026-03-20', '2026-03-20', '2026-03-20', 'mañana']);
    const l = leer(hoja({ filas: [{ ...R815, 'Fecha siembra': S('31/02/2026') }] }));
    expect(validarBroodstock(l).avisos.join(' ')).toContain('no es un día real');
  });

  it('el sistema de fechas de 1904 (Excel de Mac antiguo) da el MISMO día', () => {
    const ws = hoja({ corte: F(46131 - 1462, 'm/d/yy'), fechas: [46103, 46110, 46117, 46124, 46131].map((x) => F(x - 1462)),
      filas: [{ ...R815, 'Fecha siembra': F(46101 - 1462) }] });
    const l = leer(ws, { fecha1904: true });
    expect([l.fechaCorte, l.piscinas[0].fechaSiembra, l.piscinas[0].fechaPeso]).toEqual(['2026-04-19', '2026-03-20', '2026-04-19']);
    expect(leerLibroBroodstock({ SheetNames: ['S'], Sheets: { S: ws }, Workbook: { WBProps: { date1904: true } } }).hojas[0].fechaCorte).toBe('2026-04-19');
  });

  it('diaDeCelda: el serial es el día (sin zona horaria), y un Date se lee en la hora local', () => {
    expect([diaDeCelda(F(46131)), diaDeCelda(F(46131.99)), diaDeCelda(N(46131)), diaDeCelda(N(46131), false, true)]).toEqual(['2026-04-19', '2026-04-19', '', '2026-04-19']);
    expect(diaDeCelda({ t: 'd', v: new Date(2026, 3, 19, 23, 30) })).toBe('2026-04-19');
    expect([diaDeCelda(null), diaDeCelda(S('')), diaDeCelda(S('31/02/2026'))]).toEqual(['', '', '']);
    // El formato manda por lo que dice FUERA de sus literales: «"Día y"0» es un número; «"Corte: "dd/mm/yy», una fecha.
    expect([diaDeCelda(F(46131, '"Día y"0')), diaDeCelda(F(46131, '"Corte: "dd/mm/yy')), diaDeCelda(F(46131, '[$-409]0.00')), diaDeCelda(F(46131, '[$-409]d-mmm-yy'))])
      .toEqual(['', '2026-04-19', '', '2026-04-19']);
  });

  it('la piscina de origen con un sufijo DESCONOCIDO se sube tal cual, y se dice una vez', () => {
    const l = leer(hoja({ filas: [{ ...R815, 'Psc. Orig': S('902 xy') }, { ...R810, Piscina: N(811), 'Psc. Orig': S('903zz') }] }));
    expect(l.avisos.filter((a) => a.includes('con letras'))).toEqual(['2 piscina(s) traen la piscina de origen con letras junto al número (815: 902 xy, 811: 903zz): se sube tal cual.']);
    expect(unaFila(hoja({ filas: [{ ...R815, 'Psc. Orig': S('902 xy') }] }))[col('Piscina origen')]).toBe('902xy');
  });

  it('cortesRepetidos: dos hojas elegidas con la misma fecha de corte se pisarían', () => {
    expect(cortesRepetidos([{ fechaCorte: '2026-04-19' }, { fechaCorte: '2026-04-26' }, { fechaCorte: '2026-04-19' }, { fechaCorte: '' }])).toEqual(['2026-04-19']);
    expect(cortesRepetidos([{ fechaCorte: '2026-04-19' }, { fechaCorte: '2026-04-26' }])).toEqual([]);
  });

  it('letraCol: A, Z, AA, AD', () => {
    expect([0, 25, 26, 29].map(letraCol)).toEqual(['A', 'Z', 'AA', 'AD']);
  });
});

/* ============================================================
   PUNTOS 8 y 10 (2026-09-18, decisiones del usuario)
   8  · «Las notas bajo la tabla van en observación de su piscina»: una nota que nombra piscinas de la tabla se añade a
        su Observación. Las piscinas sin datos productivos no se suben, y su nota tampoco.
   10 · «902 ch» (plantilla de julio, sin columna «Camaronera») es la piscina de origen 902 de la camaronera Chongón.
   ============================================================ */
describe('Broodstock · las NOTAS bajo la tabla van a la Observación de SU piscina (punto 8)', () => {
  const NOTA = 'NOTA: PISCINAS 815 Y 810 FUERON RALEADAS EL 13 DE ABRIL 2026';
  const obsDe = (l, id) => l.piscinas.find((p) => normPiscina(p.piscina) === id).observacion;

  it('🔴 la nota que nombra piscinas CON datos va a la Observación de cada una, detrás de la que ya traen', () => {
    const l = leer(hoja({ filas: [R815, R810, {}, { C: S(NOTA) }] }));
    expect(obsDe(l, '815')).toBe('LÍNEA DE PRUEBA · ' + NOTA);
    expect(obsDe(l, '810')).toBe('LÍNEA DE PRUEBA · ' + NOTA);
    expect(l.notas, 'ya no está entre las que no se suben').toEqual([]);
    expect(l.avisos.join(' ')).toContain('va a la Observación de la(s) piscina(s) 815, 810.');
    const f = unaFila(hoja({ filas: [R815, {}, { C: S(NOTA) }] }));
    expect(f[col('Observación')], 'y llega a la fila que se sube').toBe('LÍNEA DE PRUEBA · ' + NOTA);
  });

  it('🔴 sin Observación propia, la nota ES la Observación', () => {
    const l = leer(hoja({ filas: [{ ...R815, OBSERVACION: S('') }, {}, { C: S('PISCINA 815 CON AIREADOR NUEVO') }] }));
    expect(obsDe(l, '815')).toBe('PISCINA 815 CON AIREADOR NUEVO');
  });

  it('🔴 una piscina SIN datos no se sube, y su nota tampoco: se dice, y la nota queda entre las que no se suben', () => {
    const l = leer(hoja({ filas: [R815, { Piscina: N(811), 'Area (ha)': N(0.30) }, {}, { C: S('PISCINA 811 EN SECADO') }] }));
    expect(obsDe(l, '811')).toBe('');
    expect(l.avisos.join(' ')).toContain('La nota de la fila 10 nombra la(s) piscina(s) 811, sin datos esta semana: ahí no se sube.');
    expect(l.notas).toEqual(['Fila 10: PISCINA 811 EN SECADO']);
    expect(buildBroodstockRows(l).map((r) => r[col('Piscina')])).toEqual(['815']);
  });

  it('🔴 se casa por PALABRA entera y sólo con piscinas de la tabla: «8150» no es la 815, y la 999 no está', () => {
    const l = leer(hoja({ filas: [R815, {}, { C: S('REVISAR 8150 Y 999') }] }));
    expect(obsDe(l, '815')).toBe('LÍNEA DE PRUEBA');
    expect(l.notas).toEqual(['Fila 9: REVISAR 8150 Y 999']);
  });

  it('una nota que no nombra ninguna piscina, o una fila TOTAL, sólo se enseña', () => {
    const l = leer(hoja({ filas: [R815, {}, { C: S('NOTA GENERAL SIN PISCINA') }, { Piscina: S('TOTAL'), 'Cantidad Sembrada ': N(9999) }] }));
    expect(l.notas).toEqual(['Fila 9: NOTA GENERAL SIN PISCINA', 'Fila 10: TOTAL']);
    expect(obsDe(l, '815')).toBe('LÍNEA DE PRUEBA');
  });

  it('no se repite: si la Observación ya trae el texto de la nota, no se añade otra vez', () => {
    const l = leer(hoja({ filas: [{ ...R815, OBSERVACION: S('RALEADA · PISCINA 815 RALEADA') }, {}, { C: S('PISCINA 815 RALEADA') }] }));
    expect(obsDe(l, '815')).toBe('RALEADA · PISCINA 815 RALEADA');
  });

  it('🔴 sólo se lee el ANCHO DE LA TABLA: los bloques auxiliares de la derecha no son notas (libros de julio)', () => {
    const ws = hoja({ filas: [R815, {}, { C: S('PISCINA 815 RALEADA'), AL: S('H') }, { AG: S('815 BLOQUE AUXILIAR') }] });
    ws['!ref'] = 'A1:BP10';   // como en los libros de julio: la hoja sigue mucho más allá de la tabla
    const l = leer(ws);
    expect(obsDe(l, '815')).toBe('LÍNEA DE PRUEBA · PISCINA 815 RALEADA');
    expect(l.notas).toEqual([]);
  });

  it('dos notas para la misma piscina van las dos, en el orden de la hoja', () => {
    const l = leer(hoja({ filas: [R815, {}, { C: S('PISCINA 815 RALEADA') }, { C: S('PISCINA 815 MUESTREADA') }] }));
    expect(obsDe(l, '815')).toBe('LÍNEA DE PRUEBA · PISCINA 815 RALEADA · PISCINA 815 MUESTREADA');
  });

  it('🔴 la Observación con su nota no se recorta a 200 caracteres', () => {
    const larga = 'OBSERVACIÓN LARGA '.repeat(9).trim();                      // 170 caracteres
    const nota = 'PISCINA 815 RALEADA Y CON RECAMBIO DE AGUA AL 30 POR CIENTO';   // 59
    const f = unaFila(hoja({ filas: [{ ...R815, OBSERVACION: S(larga) }, {}, { C: S(nota) }] }));
    expect(f[col('Observación')]).toBe(larga + ' · ' + nota);
  });
});

describe('Broodstock · el origen con la camaronera PEGADA («902 ch») se separa (punto 10)', () => {
  it('🔴 plantilla de julio (sin «Camaronera»): «902 ch» y «903ch» → piscina de origen y camaronera Chongón', () => {
    const l = leer(hoja({ cab: CAB_JUL, filas: [{ ...sin(R815, 'Camaronera'), 'Psc. Orig': S('902 ch') }, { ...sin(R810, 'Camaronera'), Piscina: N(811), 'Psc. Orig': S('903ch') }] }));
    expect(l.piscinas.map((p) => [p.piscinaOrigen, p.camaronera])).toEqual([['902', 'Chongón'], ['903', 'Chongón']]);
    expect(l.avisos.join(' ')).toContain('2 piscina(s) traían la camaronera pegada a la piscina de origen, y se separó (815: 902 ch → 902 · Chongón, 811: 903ch → 903 · Chongón).');
    expect(l.avisos.join(' ')).not.toContain('con letras');
    const f = buildBroodstockRows(l)[0];
    expect([f[col('Piscina origen')], f[col('Camaronera')]]).toEqual(['902', 'Chongón']);
  });

  it('🔴 con la columna «Camaronera» vacía se rellena; con OTRA camaronera no se pisa, y se avisa', () => {
    const vacia = leer(hoja({ filas: [{ ...R815, 'Psc. Orig': S('902 ch'), Camaronera: S('') }] }));
    expect([vacia.piscinas[0].piscinaOrigen, vacia.piscinas[0].camaronera]).toEqual(['902', 'Chongón']);
    const otra = leer(hoja({ filas: [{ ...R815, 'Psc. Orig': S('902 ch'), Camaronera: S('Taura') }] }));
    expect([otra.piscinas[0].piscinaOrigen, otra.piscinas[0].camaronera]).toEqual(['902', 'Taura']);
    expect(otra.avisos.join(' ')).toContain('La piscina 815 trae el origen «902 ch» (Chongón) y la columna «Camaronera» dice «Taura»: se deja la de la columna.');
    const igual = leer(hoja({ filas: [{ ...R815, 'Psc. Orig': S('902 ch'), Camaronera: S('CHONGON') }] }));
    expect(igual.avisos.join(' '), 'la misma camaronera escrita de otra forma no es un conflicto').not.toContain('se deja la de la columna');
  });

  it('🔴 un sufijo que no se conoce NO se adivina: la camaronera no se inventa', () => {
    const l = leer(hoja({ cab: CAB_JUL, filas: [{ ...sin(R815, 'Camaronera'), 'Psc. Orig': S('902 xy') }] }));
    expect([l.piscinas[0].piscinaOrigen, l.piscinas[0].camaronera]).toEqual(['902 xy', '']);
  });

  it('el aviso de la plantilla sin «Camaronera» dice de dónde sale ahora', () => {
    const l = leer(hoja({ cab: CAB_JUL, filas: [sin(R815, 'Camaronera')] }));
    expect(l.avisos.join(' ')).toContain('se toma del sufijo del origen cuando lo trae («ch» = Chongón); si no, va vacía.');
  });
});
