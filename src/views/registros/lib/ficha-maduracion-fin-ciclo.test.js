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
    { lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', metabisulfito: 12.5, fechaMetabisulfito: '2026-09-09', machos: 40, hembras: 60, observaciones: '' },
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

  it('NO lleva tanque: se cierra el LOTE (y un Parcial puede decir su SALA · D14)', () => {
    /* Decisión del usuario: el cierre es del lote y el libro descuenta de cada tanque donde
       esté, en proporción. Pedir el tanque obligaría a enumerar dónde está, que es justo lo
       que el libro ya sabe. D14 (2026-09-14): un lote vive en varias salas, y un Parcial
       puede acotar a una; vacía = el lote entero. */
    expect(MAD_FIN_HEADERS).toContain('Sala');
    expect(MAD_FIN_HEADERS).not.toContain('Tanque');
    expect(MAD_FIN_HEADERS).toContain('Lote');
  });

  it('2026-09-15 · Rojos y pesos promedio por lote, y UN peso total (sin total por sexo)', () => {
    for (const h of ['Rojos', 'Peso promedio machos (g)', 'Peso promedio hembras (g)', 'Peso total (kg)']) {
      expect(MAD_FIN_HEADERS).toContain(h);
    }
    expect(MAD_FIN_HEADERS).not.toContain('Peso total machos (kg)');
    expect(MAD_FIN_HEADERS).not.toContain('Peso total hembras (kg)');
    expect(MAD_FIN_HEADERS.indexOf('Rojos')).toBe(MAD_FIN_HEADERS.indexOf('Hembras') + 1);
  });

  /* ⚠⚠ AQUÍ HABÍA UNA COLUMNA `Destino`, y la retiró el usuario el 2026-09-08: NINGÚN
     REPRODUCTOR VUELVE A CAMARONERA, así que pedía un dato que no existe — y un campo que no
     se puede rellenar con la verdad se acaba rellenando con cualquier cosa. En su lugar va el
     proceso que sí ocurre al cerrar. Se pudo cambiar sin coste porque la hoja aún no existe
     en producción; tras el re-despliegue del GAS esto sería una migración. */
  it('lleva el METABISULFITO, que es el proceso real del cierre', () => {
    expect(MAD_FIN_HEADERS).toContain('Metabisulfito (kg)');
    expect(MAD_FIN_HEADERS).toContain('Fecha aplicación');
    expect(MAD_FIN_HEADERS).not.toContain('Destino');
  });

  /* La dosis va en kg y admite decimales, al revés que los conteos de animales. Un `int`
     aquí redondearía 12,5 kg a 12 sin decir nada. */
  it('la dosis conserva los decimales', () => {
    const filas = buildFinRows(base());
    expect(filas[0][col('Metabisulfito (kg)')]).toBe(12.5);
    expect(filas[0][col('Fecha aplicación')]).toBe('2026-09-09');
  });

  /* ⚠ VACÍO Y NO CERO cuando no hay dosis: el GAS hace MERGE y no pisa con vacío, pero un 0
     sí escribiría — y borraría una dosis real registrada antes. Es el mismo criterio que el
     ×1000 de Desoves, y la razón por la que aquel se probó aparte. */
  it('sin dosis manda VACÍO, no cero', () => {
    const m = base();
    delete m.cierres[0].metabisulfito;
    const filas = buildFinRows(m);
    expect(filas[0][col('Metabisulfito (kg)')]).toBe('');
  });

  /* ⚠⚠ ESTA PRUEBA LA PIDIÓ EL BANCO, NO LA LECTURA. Con sólo la de arriba, la mutación «la
     dosis vacía manda CERO en vez de VACÍO» SOBREVIVÍA: un `undefined` sale por la PRIMERA
     guarda de `kg()` y nunca llega al return final, que es donde vive la regla. Sólo una
     dosis PRESENTE pero inválida recorre la función entera.
     🔑 Es la diferencia entre probar el resultado y probar el CAMINO, y es justo lo que
     `feedback_fixtures-que-no-prueban-nada` describe: el verde de la prueba de arriba era
     correcto y no significaba lo que parecía. */
  it('una dosis inválida manda VACÍO, tampoco cero', () => {
    const conTexto = base();
    conTexto.cierres[0].metabisulfito = 'doce kilos';
    expect(buildFinRows(conTexto)[0][col('Metabisulfito (kg)')]).toBe('');

    const negativa = base();
    negativa.cierres[0].metabisulfito = -3;
    expect(buildFinRows(negativa)[0][col('Metabisulfito (kg)')]).toBe('');
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

  /* D14: la sala entra en la llave SÓLO si se dice, así que los IDs de siempre no cambian; y dos
     Parciales del mismo lote y motivo en salas distintas son dos filas, no una encima de otra. */
  it('D14 · la sala va en la llave sólo cuando se dice', () => {
    expect(finRowId('2026-09-08', 'AB', 'Pedido', '')).toBe('2026-09-08-AB-PEDIDO');
    expect(finRowId('2026-09-08', 'AB', 'Pedido', 'Sala 2')).toBe('2026-09-08-AB-PEDIDO-S2');
  });

  it('D14 · un Parcial con sala la escribe y la lleva en el ID; un Total nunca', () => {
    const m = base();
    m.cierres[0].sala = 'Sala 2';
    m.cierres.push({ lote: 'BC', tipo: 'Total', motivo: 'Fin de vida útil', sala: 'Sala 3', machos: 1 });
    const [parcial, total] = buildFinRows(m);
    expect(parcial[col('Sala')]).toBe('Sala 2');
    expect(parcial[col('ID')]).toBe('2026-09-08-AB-PEDIDO-S2');
    expect(total[col('Sala')]).toBe('');
    expect(total[col('ID')]).toBe('2026-09-08-BC-FINDEVIDAÚTIL');
  });
});

/* 2026-09-15 (usuario): Rojos y pesos PROMEDIO van por LOTE (cada fila el suyo); el PESO TOTAL es de TODOS
   los lotes del registro juntos y va IGUAL en cada fila. Los rojos van dentro de machos y hembras. */
describe('Fin de Ciclo · rojos y pesos por lote, peso total del registro', () => {
  const conPesos = () => {
    const m = base();
    m.cierres[0] = Object.assign(m.cierres[0], { rojos: 3, pesoPromMachos: '45.5', pesoPromHembras: 60 });
    m.cierres.push({ lote: 'BC', tipo: 'Parcial', motivo: 'Pedido', machos: 10, hembras: 0, pesoPromMachos: '38.25' });
    return Object.assign(m, { pesoTotal: '12.4', registro: 'R-MFJ3K2QX7A' });
  };

  /* A3: el peso total se lee UNA vez por registro, así que el registro va en cada fila y es el mismo en todas. */
  it('A3 · todas las filas llevan el MISMO «Registro» del modelo; sin él va vacío', () => {
    expect(MAD_FIN_HEADERS).toContain('Registro');
    expect(buildFinRows(conPesos()).map((f) => f[col('Registro')])).toEqual(['R-MFJ3K2QX7A', 'R-MFJ3K2QX7A']);
    expect(buildFinRows(base())[0][col('Registro')]).toBe('');
  });

  it('🔴 cada lote lleva SUS rojos y SUS pesos promedio; el peso total se repite igual', () => {
    const [a, b] = buildFinRows(conPesos());
    expect([a[col('Rojos')], a[col('Peso promedio machos (g)')], a[col('Peso promedio hembras (g)')]]).toEqual([3, 45.5, 60]);
    expect([b[col('Rojos')], b[col('Peso promedio machos (g)')], b[col('Peso promedio hembras (g)')]]).toEqual(['', 38.25, '']);
    expect([a[col('Peso total (kg)')], b[col('Peso total (kg)')]]).toEqual([12.4, 12.4]);
    expect(validarFinCiclo(conPesos())).toEqual({ errores: [], avisos: [] });
  });

  it('sin cifras van VACÍAS (el MERGE conserva la celda), y una inválida también, con aviso', () => {
    const sin = buildFinRows(base())[0];
    expect([sin[col('Rojos')], sin[col('Peso promedio machos (g)')], sin[col('Peso total (kg)')]]).toEqual(['', '', '']);
    const m = conPesos();
    m.pesoTotal = 'doce kilos';
    m.cierres[1].pesoPromMachos = 'mucho';
    expect(buildFinRows(m)[0][col('Peso total (kg)')]).toBe('');
    expect(buildFinRows(m)[1][col('Peso promedio machos (g)')]).toBe('');
    expect(validarFinCiclo(m).avisos).toEqual([
      'El peso promedio de machos de BC no es una cifra válida y no se guardará.',
      'El peso total no es una cifra válida y no se guardará.',
    ]);
  });

  it('AVISO si un lote pesa un sexo que ese cierre no saca, o trae más rojos que animales', () => {
    const m = conPesos();
    m.cierres[0].hembras = 0;
    m.cierres[0].rojos = 41;
    const { errores, avisos } = validarFinCiclo(m);
    expect(errores).toEqual([]);
    expect(avisos).toEqual([
      'Los rojos de AB (41) son más que los machos y hembras que salen: van dentro de ellos.',
      'El peso promedio de hembras de AB está anotado, pero ese cierre no saca hembras.',
    ]);
  });

  it('AVISO si hay peso total y ningún cierre saca animales', () => {
    const m = conPesos();
    m.cierres.forEach((c) => { c.machos = 0; c.hembras = 0; c.rojos = ''; c.pesoPromMachos = ''; c.pesoPromHembras = ''; });
    expect(validarFinCiclo(m).avisos).toContain('El peso total está anotado, pero ningún cierre saca animales.');
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

  /* ⚠⚠ EL METABISULFITO SON DOS DATOS QUE SÓLO VALEN JUNTOS. Medio registro es peor que
     ninguno: parece completo. Aviso y no error, porque un cierre sin tratar es legítimo.
     ⚠ Las tres ramas van por separado a propósito: con una sola prueba que mirara «hay algún
     aviso», quitar dos de las tres comprobaciones sobreviviría a la mutación. */
  /* 2026-09-16 (usuario, PE1.6): «la fecha de aplicación sale por defecto igual que la fecha del registro». Aquí se
     exigía un AVISO para la dosis sin fecha; con la fecha por defecto, esa dosis toma la del registro y no avisa. */
  it('🔴 una dosis SIN fecha toma la del registro: se escribe con ella y no avisa', () => {
    const m = base();
    m.cierres[0].fechaMetabisulfito = '';
    const { errores, avisos } = validarFinCiclo(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /metabisulfito/i.test(a))).toBe(false);
    expect(buildFinRows(m)[0][col('Fecha aplicación')]).toBe('2026-09-08');
  });

  it('AVISO si hay fecha de metabisulfito, DISTINTA de la del registro, pero no dosis', () => {
    const m = base();
    m.cierres[0].metabisulfito = '';            // la fecha del fixture (09-09) no es la del registro (09-08)
    const { errores, avisos } = validarFinCiclo(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /tiene fecha pero no dosis/.test(a))).toBe(true);
  });

  it('🔴 la fecha que trae la tarjeta de salida (la del registro) SIN dosis ni avisa ni se escribe', () => {
    /* Cada tarjeta la trae puesta: avisarla en todos los lotes sin tratar, o escribirla en la hoja sin dosis,
       llenaría el registro de fechas que no dicen nada. */
    const m = base();
    m.cierres[0].metabisulfito = '';
    m.cierres[0].fechaMetabisulfito = m.fecha;
    expect(validarFinCiclo(m).avisos.some((a) => /metabisulfito/i.test(a))).toBe(false);
    expect(buildFinRows(m)[0][col('Fecha aplicación')]).toBe('');
  });

  it('una fecha tecleada a mano CON su dosis manda sobre la del registro', () => {
    expect(buildFinRows(base())[0][col('Fecha aplicación')]).toBe('2026-09-09');
  });

  it('AVISO si la fecha de metabisulfito no es una fecha', () => {
    const m = base();
    m.cierres[0].fechaMetabisulfito = '09/09/2026';
    const { avisos } = validarFinCiclo(m);
    expect(avisos.some((a) => /no es una fecha válida/.test(a))).toBe(true);
  });

  /* Y el caso que NO debe avisar: los dos puestos, o los dos vacíos. */
  it('sin metabisulfito ninguno, no avisa nada de metabisulfito', () => {
    const m = base();
    m.cierres[0].metabisulfito = '';
    m.cierres[0].fechaMetabisulfito = '';
    const { errores, avisos } = validarFinCiclo(m);
    expect(errores).toEqual([]);
    expect(avisos.some((a) => /metabisulfito/i.test(a))).toBe(false);
  });

  it('AVISO si el tipo no es uno de los dos conocidos', () => {
    const m = base();
    m.cierres[0].tipo = 'Definitivo';
    expect(validarFinCiclo(m).avisos.some((a) => /no es un tipo conocido/.test(a))).toBe(true);
  });

  it('D14 · ERROR si un cierre Total dice sala: cierra el lote en TODAS', () => {
    const m = base();
    Object.assign(m.cierres[0], { tipo: 'Total', sala: 'Sala 2' });
    expect(validarFinCiclo(m).errores).toEqual(['Un cierre Total cierra AB ENTERO, en todas sus salas: deja la sala vacía o regístralo como Parcial.']);
  });

  it('D14 · AVISO si la sala no es conocida', () => {
    const m = base();
    m.cierres[0].sala = 'Sala 9';
    expect(validarFinCiclo(m).avisos).toEqual(['«Sala 9» no es una sala conocida (el cierre de AB).']);
  });

  it('D14 · el mismo lote y motivo en salas DISTINTAS vale; en la MISMA sala, no', () => {
    const m = base();
    m.cierres[0].sala = 'Sala 1';
    m.cierres.push({ lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', sala: 'Sala 2', machos: 5 });
    m.cierres.push({ lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', machos: 5 });   // sin sala: el lote entero, otro ID
    expect(validarFinCiclo(m).errores).toEqual([]);
    m.cierres.push({ lote: 'ab', tipo: 'Parcial', motivo: 'Pedido', sala: 'Sala 2', machos: 1 });
    expect(validarFinCiclo(m).errores).toEqual(['El lote AB se cierra dos veces por «Pedido» en Sala 2 en esta fecha. Los dos escribirían la misma fila y el segundo borraría al primero: regístralos sumados.']);
  });
});
