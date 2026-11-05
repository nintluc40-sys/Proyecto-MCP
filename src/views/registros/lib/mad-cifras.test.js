/* ============================================================
   A16 (2026-11-04, usuario: «Rechazarlo y pedir miles enteros», «En las cinco que lo comparten»).

   Los conteos de Maduración se leían con `parseInt`: «6.5» (miles) se guardaba como 6 000 y «-3» quedaba vacío, los dos sin aviso. En las
   filas reales el menor total de huevos es 1 200 (miles): un 6.5 es casi seguro otra unidad o una errata, así que no se adivina: es ERROR.
   Lo vacío sigue siendo «sin cifra». Que el motor diga lo mismo lo vigilan las pruebas de paridad de cada ficha. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { cifraMala, cifraMalaTexto, validarDesove, buildDesoveRows, aMiles } from './ficha-maduracion-desoves.schema.js';
import { validarMort } from './ficha-maduracion-mortdesove.schema.js';
import { validarIngreso } from './ficha-maduracion-ingreso.schema.js';
import { validarMovimiento } from './ficha-maduracion-movimientos.schema.js';
import { validarFinCiclo } from './ficha-maduracion-fin-ciclo.schema.js';
import { mntValidarTrabajo, mntValidarRonda, MNT_EQUIPOS, MNT_TIPOS, MNT_ACTIVIDADES, MNT_ESTADOS } from './ficha-mantenimiento.schema.js';
import { validarViaje } from './ficha-traslado.schema.js';

const des = (o) => ({ fecha: '2026-09-08', desoves: [{ lote: 'BM', codigoGenetico: '766', piscina: 'P', desoves: 4, huevos: 9800, hembrasNoViables: 1, fechaN2: '', n2: 100, fechaN5: '', n5: 90, observaciones: '', ...o }] });
const mort = (d, r = {}) => ({ fecha: '2026-09-15', lotes: [{ lote: 'BP', codigoGenetico: 'CG1', piscina: '101', desove: d, recuperacion: r }] });
const ing = (c, rep) => ({ fecha: '2026-09-08', lote: 'AB', composiciones: [{ codigoGenetico: 'CG01', piscina: 'P', machos: 10, hembras: 20, ...c, reparto: [{ sala: 'Sala 1', tanque: 1, machos: 10, hembras: 20, agua: 'RAS', ...rep }] }] });
const mov = (o) => ({ fecha: '2026-09-08', tipo: 'Transferencia', motivo: 'Mezcla de lotes', observaciones: '', tramos: [{ salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 30, hembras: 20, agua: 'RAS', ...o }] });
const fin = (o) => ({ fecha: '2026-09-08', cierres: [{ lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', machos: 40, hembras: 60, ...o }] });

describe('`cifraMala`: un conteo es un entero sin signo', () => {
  it.each([['6.5'], ['-3'], [-3], [2.5], ['1e3'], ['12abc'], ['x'], ['1,5'], ['1 000'], ['+4'], ['.5']])('🔴 %s no vale', (v) => expect(cifraMala(v)).toBe(true));
  it.each([[''], ['  '], [null], [undefined], ['0'], [0], [4], ['4'], [' 4 '], ['4.0'], ['4.'], ['9800']])('«%s» vale: es un entero o no hay cifra', (v) => expect(cifraMala(v)).toBe(false));
  it('la frase nombra el sitio, el valor y el campo, y sólo los miles dicen «en miles»', () => {
    expect(cifraMalaTexto('«766»', 'el N2', ' 6.5 ', true)).toBe('En «766», «6.5» no vale para el N2: se escribe en miles, con un número entero, sin decimales ni signo.');
    expect(cifraMalaTexto('el tramo 1', 'los machos', -3, false)).toBe('En el tramo 1, «-3» no vale para los machos: se escribe con un número entero, sin decimales ni signo.');
  });
});

describe('🥚 Desoves', () => {
  const malos = (o) => validarDesove(des(o)).errores;
  it('🔴 el caso de la pauta: «6.5» en huevos ya no se guarda como 6 000', () => {
    expect(aMiles('6.5'), 'la lectura sigue recortando: por eso lo para la validación').toBe(6000);
    expect(malos({ huevos: '6.5' })).toEqual(['En «766», «6.5» no vale para el total de huevos: se escribe en miles, con un número entero, sin decimales ni signo.']);
  });
  it.each([['huevos', 'el total de huevos', 'en miles'], ['n2', 'el N2', 'en miles'], ['n5', 'el N5', 'en miles']])('🔴 %s va en miles, y lo dice', (k, que, miles) => {
    const e = malos({ [k]: '2.5' });
    expect(e).toHaveLength(1);
    expect(e[0]).toContain(que);
    expect(e[0]).toContain(miles);
  });
  it.each([['desoves', 'los desoves'], ['hembrasNoViables', 'las hembras no viables']])('🔴 %s no va en miles', (k, que) => {
    const e = malos({ [k]: '-2' });
    expect(e).toHaveLength(1);
    expect(e[0]).toContain(que);
    expect(e[0]).not.toContain('en miles');
  });
  it('🔴 un N5 negativo no se confunde con «no hay N5»: es su error, no el del candado', () => {
    const e = malos({ n2: '', n5: '-1' });
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('el N5');
  });
  it('lo bueno sigue pasando, y escribe lo mismo', () => {
    expect(validarDesove(des({}))).toEqual({ errores: [], avisos: [] });
    expect(validarDesove(des({ n2: '', n5: '', huevos: '9800.0' })).errores).toEqual([]);
    expect(buildDesoveRows(des({ huevos: '9800' }))[0]).toEqual(buildDesoveRows(des({}))[0]);
  });
});

describe('📋 Inf. Supervisor: hembras que entran y muertas', () => {
  it('🔴 el caso de la pauta: «-3» ya no se queda en un aviso', () => {
    const r = validarMort(mort({ entran: '40', muertas: '-3' }));
    expect(r.errores).toEqual(['En BP (tanques de desove), «-3» no vale para las muertas: se escribe con un número entero, sin decimales ni signo.']);
    expect(r.avisos, 'no dice además que no se anotaron').toEqual([]);
  });
  it('🔴 con todo negativo dice lo que está mal, no que no hay ninguna cifra', () => {
    const e = validarMort(mort({ entran: '-1', muertas: '-1' })).errores;
    expect(e).toHaveLength(2);
    expect(e.join(' ')).not.toContain('no trae ninguna cifra');
  });
  it('🔴 en recuperación lo dice, y sin lote, con su número de registro', () => {
    expect(validarMort(mort({ entran: 40, muertas: 3 }, { entran: '2.5', muertas: 1 })).errores[0]).toContain('(tanques de recuperación), «2.5» no vale para las hembras que entran');
    const sinLote = { fecha: '2026-09-15', lotes: [{ lote: '', codigoGenetico: '', desove: { muertas: '-3' } }] };
    expect(validarMort(sinLote).errores[0]).toContain('En el registro 1 (tanques de desove)');
  });
  it('lo bueno sigue pasando', () => {
    expect(validarMort(mort({ entran: 40, muertas: 3 })).errores).toEqual([]);
    expect(validarMort(mort({ entran: '40', muertas: '' })).errores).toEqual([]);
  });
});

describe('🐚 Ingreso', () => {
  it('🔴 en lo declarado y en el reparto, por sexo', () => {
    const e = (c, r) => validarIngreso(ing(c, r)).errores;
    expect(e({ machos: '2.5' })[0]).toContain('«2.5» no vale para los machos declarados');
    expect(e({ hembras: '-3' })[0]).toContain('«-3» no vale para las hembras declaradas');
    expect(e({}, { machos: '-1' })[0]).toContain('«-1» no vale para los machos del reparto');
    expect(e({}, { hembras: '1.5' })[0]).toContain('«1.5» no vale para las hembras del reparto');
    expect(e({}, { hembras: '1.5' })[0]).toContain('«CG01»');
  });
  it('lo bueno sigue pasando, y lo declarado sin cifra no es error', () => {
    expect(validarIngreso(ing({}, {})).errores).toEqual([]);
    expect(validarIngreso(ing({ machos: '', hembras: '' }, {})).errores).toEqual([]);
  });
});

describe('🔄 Movimientos', () => {
  it('🔴 machos y hembras, con su tramo', () => {
    expect(validarMovimiento(mov({ machos: '-3' })).errores[0]).toContain('En el tramo 1, «-3» no vale para los machos');
    expect(validarMovimiento(mov({ hembras: '2.5' })).errores[0]).toContain('En el tramo 1, «2.5» no vale para las hembras');
  });
  it('lo bueno sigue pasando', () => expect(validarMovimiento(mov({})).errores).toEqual([]));
});

describe('🏁 Fin de Ciclo', () => {
  it('🔴 machos, hembras y rojos', () => {
    for (const [k, que] of [['machos', 'los machos'], ['hembras', 'las hembras'], ['rojos', 'los rojos']]) {
      expect(validarFinCiclo(fin({ [k]: '-3' })).errores.join(' '), k).toContain('En el cierre de AB, «-3» no vale para ' + que);
    }
  });
  it('lo bueno sigue pasando', () => expect(validarFinCiclo(fin({})).errores).toEqual([]));
});

describe('📅 Fechas: un día real', () => {
  const trabajo = (fecha) => ({ fecha, equipo: MNT_EQUIPOS[0].codigo, tipo: MNT_TIPOS[0], actividad: MNT_ACTIVIDADES[0], horometro: 100, estado: MNT_ESTADOS[0] });
  it.each([['2026-13-45'], ['2026-02-31'], ['2026-00-10']])('🔴 %s no se acepta', (f) => {
    expect(mntValidarTrabajo(trabajo(f))[0]).toContain('la fecha');
    expect(mntValidarRonda({ fecha: f, equipos: {} })[0]).toBe('falta la fecha');
    expect(validarViaje({ fecha: f }).map((x) => x.campo)).toContain('fecha');
  });
  it('un día real sí', () => {
    expect(mntValidarTrabajo(trabajo('2026-02-28'))).toEqual([]);
    expect(validarViaje({ fecha: '2026-02-28' }).map((x) => x.campo)).not.toContain('fecha');
  });
});
