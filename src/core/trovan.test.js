/* El Trovan cruza las 3 hojas del Registro Reproductivo, así que ESCRITURA (Registros) y
   LECTURA (Maduración) tienen que normalizarlo igual. Vivían dos copias que no coincidían. */
import { describe, it, expect } from 'vitest';
import { normTrovan, sanitizeStr, fechaIso, vigenteDelChip, cadenaDelChip, individuoEnFecha, idsDeCadena } from './trovan.js';
import { normTrovan as normEscritura } from '../views/registros/lib/reproductivo.data.js';
import { buildReproModel } from '../views/maduracion/data.js';

describe('core · normTrovan', () => {
  it('canoniza espacios y mayúsculas', () => {
    expect(normTrovan(' 0006a1b2 ')).toBe('0006A1B2');
    expect(normTrovan('00 06 A1 B2')).toBe('0006A1B2');
    expect(normTrovan(null)).toBe('');
  });

  it('sanea los prefijos de inyección de fórmula, que es donde divergían las copias', () => {
    ['=', '+', '-', '@'].forEach((p) => expect(normTrovan(p + '0006A1B2')).toBe('0006A1B2'));
  });

  it('acota a 200 caracteres', () => {
    expect(normTrovan('A'.repeat(205))).toHaveLength(200);
  });

  it('la ESCRITURA usa exactamente esta definición (no una copia parecida)', () => {
    // Si vuelven a separarse, este test lo dice antes de que el cruce se rompa en silencio.
    expect(normEscritura).toBe(normTrovan);
  });

  it('sanitizeStr conserva su contrato (Registros la re-exporta)', () => {
    expect(sanitizeStr('  hola  ')).toBe('hola');
    expect(sanitizeStr('=SUMA(A1)')).toBe('SUMA(A1)');
    expect(sanitizeStr(null)).toBe('');
  });

  /* El tope de longitud pasó a ser un parámetro (2026-08-18) porque hay campos que son
     PÁRRAFOS y no etiquetas: el «Método utilizado» del informe de Biomol son 330 caracteres
     con los dos métodos del laboratorio, y se guardaba cortado a media palabra. Lo que NO
     podía cambiar es el resto: por defecto sigue recortando a 200, y el saneado de inyección
     de fórmula no depende de la longitud. */
  it('por defecto sigue recortando a 200 — ningún llamador cambia de comportamiento', () => {
    expect(sanitizeStr('x'.repeat(250))).toHaveLength(200);
  });

  it('con un tope mayor conserva el texto largo entero', () => {
    const parrafo = 'y'.repeat(330);
    expect(sanitizeStr(parrafo, 2000)).toBe(parrafo);
  });

  it('ampliar el tope NO relaja el saneado de inyección de fórmula', () => {
    expect(sanitizeStr('=SUMA(A1)', 2000)).toBe('SUMA(A1)');
    expect(sanitizeStr('@arroba', 2000)).toBe('arroba');
  });

  it('un tope inválido (0 o negativo) cae al de siempre', () => {
    expect(sanitizeStr('z'.repeat(250), 0)).toHaveLength(200);
    expect(sanitizeStr('z'.repeat(250), -5)).toHaveLength(200);
  });
});

describe('core · la LECTURA de Maduración cruza con la misma clave', () => {
  it('une una fila legada con prefijo raro contra la MATRIZ saneada', () => {
    // MATRIZ guardada por la app (ya saneada) y una Bitácora llegada por otra vía —edición
    // manual o importación— con el prefijo intacto. Antes eran DOS claves distintas y el
    // desove no se le atribuía a nadie.
    const m = buildReproModel(
      [{ 'Trovan ID': '0006A1B2', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo' }],
      [{ 'Trovan ID': '=0006a1b2', Fecha: '10/06/2026', Tipo: 'Desove' }],
      [],
    );
    expect(m.desoves).toHaveLength(1);
    expect(m.desoves[0].trovan).toBe('0006A1B2');
    // Y al cruzar contra la MATRIZ recupera su ubicación en vez de quedarse sin ella.
    expect(m.desoves[0].tanque).toBe('T1');
    expect(m.desovesByTrovan.get('0006A1B2')).toHaveLength(1);
  });
});

/* ── Microchips RECICLADOS (2026-09-14) ──────────────────────────────────
   El chip de una hembra muerta vuelve a usarse en otra: un Trovan deja de nombrar a UNA hembra.
   Cada fixture está hecho para que la regla EQUIVOCADA más probable dé otro resultado. */
const fila = (pos, ingreso, muerte, muerto) => ({ pos, ingreso, muerte, muerto });

describe('core · fechaIso', () => {
  it('normaliza las formas en que llegan las fechas: ISO (con hora o sin ella), dd/mm/yyyy y Date', () => {
    expect(fechaIso('2026-07-08')).toBe('2026-07-08');
    expect(fechaIso(' 2026-07-08T10:00:00 ')).toBe('2026-07-08');
    expect(fechaIso('08/07/2026')).toBe('2026-07-08');             // el día va DELANTE (store del tablero)
    expect(fechaIso('8/7/2026')).toBe('2026-07-08');
    expect(fechaIso(new Date(2026, 6, 8, 12))).toBe('2026-07-08');
  });
  it('lo que no es una fecha real da vacío, no una fecha inventada', () => {
    ['2026-02-31', '31/02/2026', '2026-13-01', '07/08/26', 'ayer', '', null, undefined, new Date('x')]
      .forEach((v) => expect(fechaIso(v), String(v)).toBe(''));
  });
});

describe('core · vigenteDelChip (a quién van la mortalidad y el traslado)', () => {
  it('🔴 manda la VIVA aunque ingresara antes y esté más arriba que una muerta', () => {
    const viva = fila(0, '2026-01-10', '', false);
    const muerta = fila(1, '2026-03-01', '2026-04-01', true);         // más reciente y más abajo
    expect(vigenteDelChip([viva, muerta])).toBe(viva);
  });
  it('sin vivas, la de ingreso más reciente aunque esté más arriba', () => {
    const reciente = fila(0, '2026-06-01', '2026-07-01', true);
    const antigua = fila(1, '2026-01-01', '2026-02-01', true);
    expect(vigenteDelChip([reciente, antigua])).toBe(reciente);
  });
  it('a igual ingreso, la de más abajo en la hoja', () => {
    const arriba = fila(3, '2026-05-01', '', false);
    const abajo = fila(9, '2026-05-01', '', false);
    expect(vigenteDelChip([arriba, abajo])).toBe(abajo);
    expect(vigenteDelChip([abajo, arriba])).toBe(abajo);               // no depende del orden recibido
  });
  it('sin filas no hay vigente', () => {
    expect(vigenteDelChip([])).toBeNull();
  });
});

describe('core · cadenaDelChip (qué filas son individuos que se suceden)', () => {
  it('🔴 una hembra nueva que ingresa DESPUÉS de la muerte de la anterior la sucede, esté donde esté en la hoja', () => {
    const nueva = fila(0, '2026-08-01', '', false);
    const vieja = fila(1, '2026-01-05', '2026-07-08', true);
    const r = cadenaDelChip([nueva, vieja]);
    expect(r.cadena).toEqual([vieja, nueva]);
    expect(r.conflictos).toEqual([]);
  });
  it('🔴 dos hembras VIVAS con el mismo chip no son un reciclaje: la segunda es un conflicto', () => {
    const a = fila(0, '2026-01-05', '', false);
    const b = fila(1, '2026-08-01', '', false);
    expect(cadenaDelChip([a, b])).toEqual({ cadena: [a], conflictos: [b] });
  });
  it('🔴 ingresar EL MISMO día de la muerte de la anterior no basta: tiene que ser después', () => {
    const vieja = fila(0, '2026-01-05', '2026-07-08', true);
    expect(cadenaDelChip([vieja, fila(1, '2026-07-08', '', false)]).conflictos).toHaveLength(1);
    expect(cadenaDelChip([vieja, fila(1, '2026-07-09', '', false)]).conflictos).toHaveLength(0);
  });
  it('🔴 el tope es el MAYOR de ingreso y muerte de la anterior: una muerte mal tecleada, o sin teclear, no abre hueco', () => {
    /* ⚠ Tiene que ser con el MISMO día de ingreso. Una sucesora que ingresa ANTES que la anterior
       ya queda delante al ordenar por vida, así que ese caso no distingue el tope de «sólo la
       muerte» (lo cazó la mutación C02 de mutar-repro-reciclaje, que sobrevivía). */
    const sucia = fila(0, '2026-05-01', '2026-04-01', true);           // murió «antes» de ingresar
    expect(cadenaDelChip([sucia, fila(1, '2026-05-01', '', false)]).conflictos).toHaveLength(1);
    const sinMuerte = fila(0, '2026-05-01', '', true);                  // muerta sin fecha de muerte
    expect(cadenaDelChip([sinMuerte, fila(1, '2026-05-01', '', false)]).conflictos).toHaveLength(1);
    expect(cadenaDelChip([sinMuerte, fila(1, '2026-05-02', '', false)]).conflictos).toHaveLength(0);
  });
  it('una muerta SIN fechas puede tener sucesora; una fila SIN fecha de ingreso nunca sucede a otra', () => {
    const sinFechas = fila(0, '', '', true);
    const conFecha = fila(1, '2026-02-01', '', false);
    expect(cadenaDelChip([sinFechas, conFecha])).toEqual({ cadena: [sinFechas, conFecha], conflictos: [] });
    const otraSinFecha = fila(2, '', '', false);
    expect(cadenaDelChip([sinFechas, conFecha, otraSinFecha])).toEqual({ cadena: [sinFechas, conFecha], conflictos: [otraSinFecha] });
  });
});

describe('core · individuoEnFecha / idsDeCadena', () => {
  const vieja = fila(0, '2026-01-05', '2026-07-08', true);
  const nueva = fila(1, '2026-08-01', '', false);
  const cadena = [vieja, nueva];
  it('🔴 un evento es de la hembra que había ingresado ese día (la frontera es su ingreso)', () => {
    expect(individuoEnFecha(cadena, '2026-07-31')).toBe(vieja);
    expect(individuoEnFecha(cadena, '2026-08-01')).toBe(nueva);
    expect(individuoEnFecha(cadena, '2026-09-10')).toBe(nueva);
  });
  it('antes del primer ingreso, de la primera; sin fecha, de la última', () => {
    expect(individuoEnFecha(cadena, '2025-12-01')).toBe(vieja);
    expect(individuoEnFecha(cadena, '')).toBe(nueva);
    expect(individuoEnFecha([], '2026-01-01')).toBeNull();
  });
  it('la última se llama como su chip; las anteriores, chip·fecha de ingreso (o chip·#n sin ella)', () => {
    expect(idsDeCadena('0008219380', cadena)).toEqual(['0008219380·2026-01-05', '0008219380']);
    expect(idsDeCadena('0008219380', [fila(0, '', '', true), nueva])).toEqual(['0008219380·#1', '0008219380']);
    expect(idsDeCadena('0008219380', [nueva])).toEqual(['0008219380']);
  });
  it('los nombres sobreviven a normTrovan: se pueden buscar con él', () => {
    idsDeCadena('000821AFF4', cadena).forEach((id) => expect(normTrovan(id)).toBe(id));
  });
});
