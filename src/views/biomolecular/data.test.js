import { describe, it, expect } from 'vitest';
import { parseDate, normResult, normalizeRows, estadioOrder, audSimulate, audRestore, biomolExportAoa } from './index.js';

describe('parseDate', () => {
  it('dd/mm/yyyy → ISO yyyy-mm-dd', () => {
    expect(parseDate('05/06/2026')).toBe('2026-06-05');
    expect(parseDate('5-6-2026')).toBe('2026-06-05');
  });
  it('año de 2 dígitos se expande a 20xx', () => {
    expect(parseDate('05/06/26')).toBe('2026-06-05');
  });
  it('vacío/no fecha → null', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('no es fecha')).toBeNull();
  });
});

describe('normResult', () => {
  it('reconoce variantes de positivo/negativo', () => {
    ['Positivo', 'positive', 'POS', 'p', '1', 'si', 'Sí'].forEach((v) => expect(normResult(v)).toBe('Positivo'));
    ['Negativo', 'negative', 'NEG', 'n', '0', 'no'].forEach((v) => expect(normResult(v)).toBe('Negativo'));
  });
  it('desconocido → cadena vacía', () => {
    expect(normResult('quizás')).toBe('');
    expect(normResult('')).toBe('');
  });
});

describe('normalizeRows', () => {
  it('mapea alias de columnas y normaliza resultados', () => {
    const out = normalizeRows([{
      Fecha: '05/06/2026', 'Código': 'BM1', Corrida: '573', Lugar: 'Módulo 1', Tanque: 'TQ1',
      'Estadío': 'PL5', IHHNV: 'Positivo', WSSV: 'Negativo', 'AHPND/EMS': 'positivo',
    }]);
    expect(out).toHaveLength(1);
    expect(out[0].f).toBe('2026-06-05');
    expect(out[0].lugar).toBe('Módulo 1');
    expect(out[0].IHHNV).toBe('Positivo');
    expect(out[0].WSSV).toBe('Negativo');
    expect(out[0].AHPND).toBe('Positivo'); // vía alias 'AHPND/EMS'
  });
  it('descarta filas sin fecha o con año corrupto', () => {
    const out = normalizeRows([
      { Fecha: '', IHHNV: 'Positivo' },            // sin fecha
      { Fecha: '30/01/0202', IHHNV: 'Positivo' },  // año corrupto < 2000
      { Fecha: '05/06/2026', IHHNV: 'Positivo' },  // válida
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].f).toBe('2026-06-05');
  });
  it('lugar por defecto "Sin lugar" cuando falta', () => {
    const out = normalizeRows([{ Fecha: '05/06/2026' }]);
    expect(out[0].lugar).toBe('Sin lugar');
    expect(out[0].tq).toBe('—');
  });
});

describe('estadioOrder (orden cronológico)', () => {
  it('N5 < Z < M < PL < Reproductor', () => {
    expect(estadioOrder('N5')).toBeLessThan(estadioOrder('Z2'));
    expect(estadioOrder('Z2')).toBeLessThan(estadioOrder('M1'));
    expect(estadioOrder('M1')).toBeLessThan(estadioOrder('PL1'));
    expect(estadioOrder('PL1')).toBeLessThan(estadioOrder('PL12'));
    expect(estadioOrder('PL12')).toBeLessThan(estadioOrder('Reproductores'));
  });
  it('vacío → 9999 (al final salvo reproductor)', () => {
    expect(estadioOrder('')).toBe(9999);
  });
});

describe('audSimulate (modo AUD · entrenamiento)', () => {
  // Filas con los 6 diagnósticos informados, para que la simulación tenga qué sustituir.
  const mkRows = () => normalizeRows(
    Array.from({ length: 40 }, (_, i) => ({
      Fecha: `${String((i % 28) + 1).padStart(2, '0')}/06/2026`,
      Lugar: 'Lab ' + (i % 4), Tanque: String(i), 'Código': 'C' + i,
      IHHNV: 'Positivo', WSSV: 'Positivo', BP: 'Positivo',
      AHPND: 'Positivo', NHPB: 'Positivo', EHP: 'Positivo',
    })),
  );
  const diagsOf = (rows) => rows.map((r) => [r.IHHNV, r.WSSV, r.BP, r.AHPND, r.NHPB, r.EHP].join(','));

  it('misma semilla → mismo resultado (es reproducible, no aleatorio)', () => {
    expect(diagsOf(audSimulate(mkRows(), 12345))).toEqual(diagsOf(audSimulate(mkRows(), 12345)));
  });

  it('semillas distintas → resultados distintos', () => {
    expect(diagsOf(audSimulate(mkRows(), 1))).not.toEqual(diagsOf(audSimulate(mkRows(), 2)));
  });

  it('un registro conserva su resultado aunque cambie el orden de las filas', () => {
    const byKey = (rows) => new Map(rows.map((r) => [r.f + '|' + r.lugar + '|' + r.tq + '|' + r.cod, r.IHHNV]));
    const normal = byKey(audSimulate(mkRows(), 777));
    const alReves = byKey(audSimulate(mkRows().reverse(), 777));
    normal.forEach((v, k) => expect(alReves.get(k)).toBe(v));
  });

  it('solo IHHNV puede salir positivo; el resto queda en Negativo', () => {
    const rows = audSimulate(mkRows(), 999);
    rows.forEach((r) => ['WSSV', 'BP', 'AHPND', 'NHPB', 'EHP'].forEach((d) => expect(r[d]).toBe('Negativo')));
    expect(rows.some((r) => r.IHHNV === 'Positivo')).toBe(true);
    expect(rows.some((r) => r.IHHNV === 'Negativo')).toBe(true);
  });

  it('filas duplicadas (misma fecha/lugar/tanque/código) NO reciben todas el mismo resultado', () => {
    // 60 muestras del MISMO tanque el mismo día: sin desempate por repetición, la clave
    // sería idéntica y las 60 saldrían iguales (grumo artificial de positivos).
    const dup = normalizeRows(Array.from({ length: 60 }, () => ({
      Fecha: '05/06/2026', Lugar: 'Lab 1', Tanque: '7', IHHNV: 'Positivo',
    })));
    const vals = new Set(audSimulate(dup, 2024).map((r) => r.IHHNV));
    expect(vals.size).toBe(2); // hay positivos Y negativos, no un bloque uniforme
  });

  it('añadir filas al final no altera el resultado de las anteriores', () => {
    const base = audSimulate(mkRows(), 555).map((r) => r.IHHNV);
    const ampliado = mkRows().concat(normalizeRows([{ Fecha: '01/07/2026', Lugar: 'Lab 9', Tanque: '99', IHHNV: 'Positivo' }]));
    expect(audSimulate(ampliado, 555).slice(0, base.length).map((r) => r.IHHNV)).toEqual(base);
  });

  it('audRestore devuelve los valores reales', () => {
    const rows = mkRows();
    const antes = diagsOf(rows.map((r) => ({ ...r })));
    expect(diagsOf(audRestore(audSimulate(rows, 42)))).toEqual(antes);
  });
});

/* ── Cuantitativas de qPCR (2026-08-18) ───────────────────────────────────────
   La hoja BIOMOL gana «Ciclo de amplificación» y «Copias/μl». Esta vista no las
   grafica, pero SÍ debe leerlas y exportarlas: su Excel se usa como plantilla de
   la hoja, y una plantilla a la que le faltan columnas deja de servir.
   Lo que se vigila es el emparejamiento cabecera↔valor del Excel, que es donde
   un desfase produce un archivo plausible con los datos corridos de columna.  */
describe('biomolecular · columnas cuantitativas de qPCR', () => {
  it('normalizeRows las lee tal cual, sin pasarlas por normResult', () => {
    const [r] = normalizeRows([{
      Fecha: '05/06/2026', WSSV: 'Positivo',
      'Ciclo de amplificación': '22.4', 'Copias/μl': '1500',
    }]);
    expect(r.ciclo).toBe('22.4');
    expect(r.copias).toBe('1500');
    expect(r.WSSV).toBe('Positivo');   // control: el resto se sigue normalizando
  });

  it('tolera el signo micro y la grafía sin griega en la cabecera', () => {
    const [conMicro] = normalizeRows([{ Fecha: '05/06/2026', 'Copias/µl': '900' }]);
    const [sinGriega] = normalizeRows([{ Fecha: '05/06/2026', 'copias/ul': '800' }]);
    const [sinTilde] = normalizeRows([{ Fecha: '05/06/2026', 'Ciclo de amplificacion': '30' }]);
    expect(conMicro.copias).toBe('900');
    expect(sinGriega.copias).toBe('800');
    expect(sinTilde.ciclo).toBe('30');
  });

  it('ausentes quedan en cadena vacía, no en undefined', () => {
    const [r] = normalizeRows([{ Fecha: '05/06/2026', WSSV: 'Negativo' }]);
    expect(r.ciclo).toBe('');
    expect(r.copias).toBe('');
  });

  it('el Excel lleva una pareja POR PATÓGENO y cada valor bajo SU cabecera', () => {
    const filas = normalizeRows([{
      Fecha: '05/06/2026', 'Código': 'L-77', Lugar: 'Lab 1', IHHNV: 'Negativo', WSSV: 'Positivo',
      'Ciclo de amplificación WSSV': '28.1', 'Copias/μl WSSV': '42',
      'Ciclo de amplificación IHHNV': '31.7', 'Copias/μl IHHNV': '8',
    }]);
    const [cab, fila] = biomolExportAoa(filas);
    expect(cab.slice(-6)).toEqual([
      'Ciclo de amplificación WSSV', 'Copias/μl WSSV',
      'Ciclo de amplificación IHHNV', 'Copias/μl IHHNV',
      'Ciclo de amplificación AHPND/EMS', 'Copias/μl AHPND/EMS',
    ]);
    expect(cab).not.toContain('Ciclo de amplificación');   // la genérica ya no existe
    expect(cab).not.toContain('Copias/μl');
    expect(fila).toHaveLength(cab.length);           // control: no sobra ni falta celda
    const celda = (n) => fila[cab.indexOf(n)];
    expect(celda('Código')).toBe('L-77');
    expect(celda('IHHNV')).toBe('Negativo');
    expect(celda('Ciclo de amplificación WSSV')).toBe('28.1');
    expect(celda('Copias/μl WSSV')).toBe('42');
    expect(celda('Ciclo de amplificación IHHNV')).toBe('31.7');
    expect(celda('Copias/μl IHHNV')).toBe('8');
    expect(celda('Ciclo de amplificación AHPND/EMS')).toBe('');  // no se corrió: vacío
    expect(celda('Copias/μl AHPND/EMS')).toBe('');
    expect(celda('EHP')).toBe('');                   // no arrastra el valor vecino
  });

  it('tolera el signo micro y la falta de tilde también en las cabeceras por patógeno', () => {
    // La pareja genérica aceptaba tres grafías; las seis nuevas tienen que aceptar las
    // mismas. Una cabecera que no casa NO da error: la columna desaparece en silencio.
    const [r] = normalizeRows([{
      Fecha: '05/06/2026', 'copias/µl wssv': '900', 'Ciclo de amplificacion ihhnv': '30',
    }]);
    expect(r.qpcr.WSSV.copias).toBe('900');
    expect(r.qpcr.IHHNV.ciclo).toBe('30');
  });

  it('una fila ANTIGUA (pareja sin patógeno) se exporta bajo el único patógeno que informa', () => {
    // Antes de 2026-08-23 Ciclo y Copias eran una pareja sola y la hoja no decía de cuál
    // de los patógenos era. Si la fila informa UNO solo, es deducible sin inventar nada.
    const [uno] = normalizeRows([{
      Fecha: '05/06/2026', 'Código': 'V-1', WSSV: 'Positivo',
      'Ciclo de amplificación': '24.8', 'Copias/μl': '3.40E+04',
    }]);
    const [cab, fila] = biomolExportAoa([uno]);
    const celda = (n) => fila[cab.indexOf(n)];
    expect(celda('Ciclo de amplificación WSSV')).toBe('24.8');
    expect(celda('Copias/μl WSSV')).toBe('3.40E+04');
    expect(celda('Ciclo de amplificación IHHNV')).toBe('');
  });

  it('una fila ANTIGUA con VARIOS patógenos informados no se atribuye a ninguno', () => {
    // Es justo el caso que motivó las columnas por patógeno: con IHHNV y WSSV medidos, el
    // Ct suelto puede ser de cualquiera de los dos. Colocarlo en uno sería inventar el dato.
    const [ambiguo] = normalizeRows([{
      Fecha: '05/06/2026', 'Código': 'V-2', WSSV: 'Positivo', IHHNV: 'Negativo',
      'Ciclo de amplificación': '24.8', 'Copias/μl': '3.40E+04',
    }]);
    const [cab, fila] = biomolExportAoa([ambiguo]);
    const celda = (n) => fila[cab.indexOf(n)];
    expect(celda('Ciclo de amplificación WSSV')).toBe('');
    expect(celda('Ciclo de amplificación IHHNV')).toBe('');
  });
});

describe('biomolecular · el espejo genérico de la cuantificación', () => {
  it('🔴 `ciclo` y `copias` se respaldan con el primer valor POR PATÓGENO', () => {
    /* La hoja ya no tiene la pareja genérica, así que `ciclo`/`copias` sólo pueden salir de
       las columnas por patógeno. No es cosmético: de ese espejo dependen `hasQpcr` —y con
       él el recuento de «muestras corridas por qPCR» de la franja— y el respaldo de las
       filas antiguas. Sin él, TODA fila nueva se leería como si no se hubiera corrido qPCR
       aunque la hoja traiga su Ct y sus copias, y sin ningún error a la vista. */
    const [r] = normalizeRows([{
      Fecha: '05/06/2026', 'Código': 'F-1', WSSV: 'Positivo',
      'Ciclo de amplificación WSSV': '28.1', 'Copias/μl WSSV': '42',
    }]);
    expect(r.ciclo).toBe('28.1');
    expect(r.copias).toBe('42');
    // …y el detalle por patógeno sigue intacto: el espejo no lo sustituye.
    expect(r.qpcr.WSSV).toEqual({ ciclo: '28.1', copias: '42' });
  });
});
