// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · 🔀 MIX: un desove de varios lotes (usuario, 2026-11-03)

   PEDIDO: en Desoves e Inf. Supervisor, «📥 Cargar» lleva una opción fija MIX (-,-). Al tocarla pregunta qué lotes participan y
   rellena el lote —MIX(BN,BO)—, los códigos y las piscinas. Puede ser de más de dos lotes.

   DECISIONES DEL USUARIO (no re-preguntar): dos códigos del MISMO lote no son un MIX: queda ese lote con los códigos juntos, porque
   las cifras sí son suyas · las hembras muertas se reparten entre sus lotes según las hembras vivas de cada uno, la regla de un
   tanque mezclado · la vista lo vigila `maduracion/operativo.mix.test.js` · 🛢 Tanques no cambia.

   Aquí: el armado (esquema y motor, los dos), el saldo (módulo y motor, los dos) y la ficha, con el motor REAL sobre el shell real.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { armarMix, esMix, lotesDeMix, buildDesoveRows, MAD_DESOVE_HEADERS, normLote, textoMal, validarDesove } from './ficha-maduracion-desoves.schema.js';
import { validarMort, mortRowId } from './ficha-maduracion-mortdesove.schema.js';
import { construirLibro } from './mad-libro.js';
import { resumenMaduracion } from './mad-resumen.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madDesArmarMix', 'madLibroLotesDeMix', 'madConstruirLibro', 'madDesReiniciar', 'madDesAddCard', 'madDesCargar', 'madDesCargarElige',
  'madDesMixAbrir', 'madDesMixAplicar', 'madDesMixVolver', 'madDesCollect', 'madDesValidar', 'madDesBuildRows', 'MAD_LIBRO_SHEETS', 'madMortReiniciar', 'madMortCollect',
  'madMortBuildRows', 'madDesNormCG', 'madDesNormLote', 'madDesTextoMal', 'madMortValidar', 'madResumenMaduracion', '_madResCuerpoHTML', '_madResTabHTML'];
const H = {};
const avisos = [];

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.olvidarLibro=function(){ _madLibro=null; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => { avisos.push(String(m)); });
});

const OP = (lote, codigoGenetico, piscina) => ({ lote, codigoGenetico, piscina });

describe('🔀 el armado: lo que queda en la tarjeta', () => {
  const CASOS = {
    'dos lotes': [OP('BN', 'C1/C2', '901/903'), OP('BO', 'C3', '905')],
    'dos lotes, tocados al revés': [OP('BO', 'C3', '905'), OP('BN', 'C1/C2', '901/903')],
    'tres lotes': [OP('BQ', 'C4', '907'), OP('BN', 'C1', '901'), OP('BO', 'C3', '905')],
    'dos códigos del mismo lote': [OP('J1', 'C9', '903'), OP('J1', 'C8', '902')],
    'la misma opción dos veces': [OP('BN', 'C1', '901'), OP('BN', 'C1', '901'), OP('BO', 'C3', '905')],
    'una piscina compartida cuenta una vez': [OP('BN', 'C1', '901/903'), OP('BO', 'C3', '903')],
    'con minúsculas y espacios': [OP(' bn ', 'c 1', '901'), OP('bo', 'c3', ' 905 ')],
    nada: [],
  };

  it('🔴 dos lotes: MIX(BN,BO), con todos sus códigos y piscinas', () => {
    expect(armarMix(CASOS['dos lotes'])).toEqual({ lote: 'MIX(BN,BO)', codigoGenetico: 'C1/C2/C3', piscina: '901/903/905', esMix: true });
  });
  it('🔴 la misma mezcla escribe la misma llave, sea cual sea el orden en que se tocó', () => {
    expect(armarMix(CASOS['dos lotes, tocados al revés'])).toEqual(armarMix(CASOS['dos lotes']));
  });
  it('🔴 puede ser de más de dos lotes', () => {
    expect(armarMix(CASOS['tres lotes'])).toEqual({ lote: 'MIX(BN,BO,BQ)', codigoGenetico: 'C1/C3/C4', piscina: '901/905/907', esMix: true });
  });
  it('🔴 dos códigos del MISMO lote no son un MIX: queda ese lote, con los códigos juntos', () => {
    expect(armarMix(CASOS['dos códigos del mismo lote'])).toEqual({ lote: 'J1', codigoGenetico: 'C8/C9', piscina: '902/903', esMix: false });
  });
  it('una opción repetida no cuenta dos veces, ni una piscina compartida', () => {
    expect(armarMix(CASOS['la misma opción dos veces']).codigoGenetico).toBe('C1/C3');
    expect(armarMix(CASOS['una piscina compartida cuenta una vez']).piscina).toBe('901/903');
  });
  it('🔴 el motor arma lo MISMO que el esquema, en todos los casos', () => {
    Object.entries(CASOS).forEach(([nombre, elegidos]) => expect(H.madDesArmarMix(elegidos), nombre).toEqual(armarMix(elegidos)));
  });

  it('🔴 reconocer un MIX: «MIX» a secas o «MIX OLF», como se escribe en Larvicultura, no lo son', () => {
    expect(esMix('MIX(BN,BO)')).toBe(true);
    expect(esMix(' mix (bn, bo) ')).toBe(true);
    ['BN', 'MIX', 'MIX OLF', 'MIXTO', ''].forEach((l) => expect(esMix(l), l).toBe(false));
    expect(lotesDeMix('MIX(BN,BO,BQ)')).toEqual(['BN', 'BO', 'BQ']);
    expect(lotesDeMix('MIX(BN,BN)')).toEqual(['BN']);
    expect(lotesDeMix('BN')).toEqual([]);
    ['MIX(BN,BO,BQ)', ' mix (bn, bo) ', 'MIX(BN,BN)', 'BN', 'MIX', 'MIX OLF', ''].forEach((l) => expect(H.madLibroLotesDeMix(l), l).toEqual(lotesDeMix(l)));
  });

  it('🔴 un código largo no se corta: cortarlo partiría la llave de la hoja', () => {
    const largo = 'ABC50XYZG/ABC49DEFG3.2G/GHI13T5G.2G/JKLMNOP/QRS67/ABC50TUVG/ABC49DEFG3.2G/WXY9.F8';
    expect(largo.length).toBeGreaterThan(60);
    expect(H.madDesNormCG(largo)).toBe(largo);
    const [fila] = buildDesoveRows({ fecha: '2026-10-20', desoves: [{ lote: 'MIX(BN,BO)', codigoGenetico: largo, desoves: 1 }] });
    expect(fila[MAD_DESOVE_HEADERS.indexOf('Código genético')]).toBe(largo);
    expect(fila[MAD_DESOVE_HEADERS.indexOf('Lote')]).toBe('MIX(BN,BO)');
    expect(H.madDesBuildRows({ fecha: '2026-10-20', desoves: [{ lote: 'MIX(BN,BO)', codigoGenetico: largo, desoves: 1 }] })[0]).toEqual(fila);
  });
});

/* ── El saldo: las dos implementaciones, sobre las mismas hojas ── */
const ING = (Fecha, Lote, cg, Sala, Tanque, Hembras, Machos = 10) => ({ Fecha, Lote, 'Código genético': cg, 'Piscina Broodstock': '9', Sala, Tanque, Machos, Hembras });
const MORT = (Fecha, Lote, tipo, entran, muertas) => ({ Fecha, Lote, 'Código genético': 'C', 'Tipo de tanque': tipo, 'Hembras que entran': entran, 'Hembras muertas': muertas });
/* BN tiene el DOBLE de hembras que BO, y repartidas en dos tanques: partir a medias, o darle todo al primero, da otra cifra. BP no participa. */
const INGRESOS = [
  ING('2026-01-01', 'BN', 'C1', 'Sala 1', 1, 120),
  ING('2026-01-01', 'BN', 'C1', 'Sala 1', 2, 80),
  ING('2026-01-01', 'BO', 'C2', 'Sala 2', 1, 100),
  ING('2026-01-01', 'BP', 'C3', 'Sala 3', 1, 50),
];
const VISTA = (libro, lote) => {
  const L = libro.lotes instanceof Map ? libro.lotes.get(lote) : libro.lotes[lote];
  return L ? { muertas: L.muertos.hembras, desove: { ...L.mortDesove }, rec: { ...L.mortRecuperacion } } : null;
};
const VIVAS = (libro, lote) => (libro.posiciones || []).filter((p) => p.lote === lote).reduce((a, p) => a + p.hembras, 0);
const TIPOS = (libro) => (libro.avisos || []).map((a) => a.tipo);
const LOS_DOS = (mortDesove, ingresos = INGRESOS) => {
  const opts = { hoy: '2026-02-01', hasta: '2026-02-01' };
  return [['módulo', construirLibro({ ingresos, mortDesove }, opts)], ['motor', H.madConstruirLibro({ ingresos, mortDesove }, opts)]];
};

describe('🔀 el saldo: las muertas de un MIX se reparten según las hembras vivas', () => {
  it('🔴 9 muertas entre BN (200 ♀) y BO (100 ♀): 6 y 3; BP no se toca, y no hay ningún aviso', () => {
    LOS_DOS([MORT('2026-01-20', 'MIX(BN,BO)', 'Desove', 30, 9)]).forEach(([quien, libro]) => {
      expect(VISTA(libro, 'BN').muertas, quien).toBe(6);
      expect(VISTA(libro, 'BO').muertas, quien).toBe(3);
      expect(VISTA(libro, 'BP').muertas, quien).toBe(0);
      expect(VIVAS(libro, 'BN'), quien).toBe(194);
      expect(VIVAS(libro, 'BO'), quien).toBe(97);
      expect(VIVAS(libro, 'BP'), quien).toBe(50);
      expect(TIPOS(libro), quien).not.toContain('mortdes-sin-lote');
    });
  });

  it('🔴 «las que entran» se reparten igual, y cada cosa va a su tipo de tanque', () => {
    LOS_DOS([MORT('2026-01-20', 'MIX(BN,BO)', 'Recuperación', 30, 9)]).forEach(([quien, libro]) => {
      expect(VISTA(libro, 'BN').rec, quien).toEqual({ entran: 20, muertas: 6 });
      expect(VISTA(libro, 'BO').rec, quien).toEqual({ entran: 10, muertas: 3 });
      expect(VISTA(libro, 'BN').desove, quien).toEqual({ entran: 0, muertas: 0 });
    });
  });

  it('🔴 el reparto es a la fecha: lo que murió antes ya no pesa', () => {
    const antes = { Fecha: '2026-01-10', Sala: 'Sala 1', Tanque: 1, 'Hembras muertas': 100, 'Machos muertos': 0 };
    const opts = { hoy: '2026-02-01', hasta: '2026-02-01' };
    const mortDesove = [MORT('2026-01-20', 'MIX(BN,BO)', 'Desove', 0, 4)];   // BN ya tiene 100 ♀, las mismas que BO: 2 y 2
    [construirLibro({ ingresos: INGRESOS, tanques: [antes], mortDesove }, opts), H.madConstruirLibro({ ingresos: INGRESOS, tanques: [antes], mortDesove }, opts)].forEach((libro) => {
      expect(VIVAS(libro, 'BN')).toBe(98);
      expect(VIVAS(libro, 'BO')).toBe(98);
    });
  });

  it('🔴 un lote del MIX sin animales: todo sale del otro', () => {
    LOS_DOS([MORT('2026-01-20', 'MIX(BN,ZZ)', 'Desove', 10, 3)]).forEach(([quien, libro]) => {
      expect(VISTA(libro, 'BN').muertas, quien).toBe(3);
      expect(VISTA(libro, 'BN').desove, quien).toEqual({ entran: 10, muertas: 3 });
    });
  });

  it('🔴 ninguno de sus lotes en el libro: lo dice, sin restarle a nadie', () => {
    LOS_DOS([MORT('2026-01-20', 'MIX(YY,ZZ)', 'Desove', 10, 3)]).forEach(([quien, libro]) => {
      expect(TIPOS(libro), quien).toContain('mortdes-sin-lote');
      ['BN', 'BO', 'BP'].forEach((l) => expect(VISTA(libro, l).muertas, quien + ' ' + l).toBe(0));
    });
  });

  it('🔴 más muertas que hembras: se aplica lo que hay y se avisa del resto', () => {
    LOS_DOS([MORT('2026-01-20', 'MIX(BN,BO)', 'Desove', 0, 305)]).forEach(([quien, libro]) => {
      expect(VIVAS(libro, 'BN') + VIVAS(libro, 'BO'), quien).toBe(0);
      expect(VISTA(libro, 'BN').muertas + VISTA(libro, 'BO').muertas, quien).toBe(300);
      expect(TIPOS(libro), quien).toContain('deficit-mortdes');
    });
  });

  it('un lote normal sigue igual: sólo le descuenta a él', () => {
    LOS_DOS([MORT('2026-01-20', 'BO', 'Desove', 10, 3)]).forEach(([quien, libro]) => {
      expect(VISTA(libro, 'BO').muertas, quien).toBe(3);
      expect(VISTA(libro, 'BN').muertas, quien).toBe(0);
    });
  });
});

/* ── La ficha: el botón, la pregunta y lo que rellena ── */
const INGRESOS_FICHA = [
  ING('2026-01-01', 'XA', 'CG-1', 'Sala 2', 16, 10),
  ING('2026-01-01', 'XB', 'CG-3', 'Sala 4', 1, 10),
  ING('2026-01-01', 'XE', 'CG-7', 'Sala 5', 7, 10),
  ING('2026-01-01', 'XE', 'CG-8', 'Sala 5', 8, 10),
].map((r, i) => ({ ...r, 'Piscina Broodstock': String(901 + i), Grupo: '' }));
const FECHA = '2026-02-10';
let HOJAS = {};

describe('🔀 📥 Cargar en la ficha', () => {
  beforeEach(() => {
    HOJAS = { [H.MAD_LIBRO_SHEETS.ingreso]: INGRESOS_FICHA };
    avisos.length = 0;
    globalThis.fetch = async (url) => {
      const hoja = new URL(String(url)).searchParams.get('sheet');
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, headers: [], rows: HOJAS[hoja] || [] }) };
    };
    localStorage.clear();
    H.olvidarLibro();
    H.madDesReiniciar();
    H.madMortReiniciar();
    document.getElementById('md-fecha').value = FECHA;
    document.getElementById('mm-fecha').value = FECHA;
  });
  const tarjeta = (i = 0) => document.querySelectorAll('#md-cards .md-des')[i];
  const campos = (card, p = '.md-') => [card.querySelector(p + 'lote').value, card.querySelector(p + 'cg').value, card.querySelector(p + 'piscina').value];
  const abrir = async (card) => { await H.madDesCargar(card.querySelector('.md-cargar-btn')); return card.querySelector('.md-cargar'); };
  const preguntar = async (card) => { const caja = await abrir(card); H.madDesMixAbrir(caja.querySelector('.md-mix-btn')); return caja; };
  const elegir = (caja, ...lotes) => [...caja.querySelectorAll('.md-mix-chk')].forEach((c) => { c.checked = lotes.includes(c.getAttribute('data-cg')); });
  const aplicar = (caja) => H.madDesMixAplicar(caja.querySelector('.md-mix-aplicar'));

  it('🔴 la opción fija MIX (-,-) está en la lista, junto a los lotes en producción', async () => {
    const caja = await abrir(tarjeta());
    expect(caja.querySelector('.md-mix-btn').textContent).toBe('MIX (-,-)');
    expect(caja.querySelectorAll('.md-cargar-op').length).toBe(4);
    expect(caja.querySelector('.md-mix-btn').classList.contains('md-cargar-op'), 'no es un lote: elegirlo a secas no rellenaría nada').toBe(false);
  });

  it('🔴 al tocarla pregunta qué lotes participan, con una casilla por opción, y aún no rellena nada', async () => {
    const caja = await preguntar(tarjeta());
    expect([...caja.querySelectorAll('.md-mix-op')].map((l) => l.textContent)).toEqual(['XA · CG-1 · 901', 'XB · CG-3 · 902', 'XE · CG-7 · 903', 'XE · CG-8 · 904']);
    expect(caja.textContent).toContain('¿qué lotes participan?');
    expect(caja.hidden).toBe(false);
    expect(campos(tarjeta())).toEqual(['', '', '']);
  });

  it('🔴 con dos lotes rellena los TRES campos de ESA tarjeta, cierra, y es lo que se guarda', async () => {
    H.madDesAddCard();
    const otra = tarjeta(1);
    const caja = await preguntar(otra);
    elegir(caja, 'CG-1', 'CG-3');
    aplicar(caja);
    expect(campos(otra)).toEqual(['MIX(XA,XB)', 'CG-1/CG-3', '901/902']);
    expect(caja.hidden).toBe(true);
    expect(campos(tarjeta(0)), 'se rellenó la tarjeta equivocada').toEqual(['', '', '']);
    const d = H.madDesCollect().desoves[1];
    expect([d.lote, d.codigoGenetico, d.piscina]).toEqual(['MIX(XA,XB)', 'CG-1/CG-3', '901/902']);
  });

  it('🔴 avisa al borrador como si se hubiera tecleado', async () => {
    let eventos = 0;
    const card = tarjeta();
    card.querySelector('.md-lote').addEventListener('input', () => { eventos++; });
    const caja = await preguntar(card);
    elegir(caja, 'CG-1', 'CG-3');
    aplicar(caja);
    expect(eventos).toBe(1);
  });

  it('🔴 con menos de dos no aplica, y lo dice', async () => {
    const card = tarjeta();
    const caja = await preguntar(card);
    elegir(caja, 'CG-1');
    aplicar(caja);
    expect(campos(card)).toEqual(['', '', '']);
    expect(caja.hidden).toBe(false);
    expect(avisos.at(-1)).toContain('al menos dos');
  });

  it('🔴 dos códigos del mismo lote quedan como ese lote, y lo dice', async () => {
    const card = tarjeta();
    const caja = await preguntar(card);
    elegir(caja, 'CG-7', 'CG-8');
    aplicar(caja);
    expect(campos(card)).toEqual(['XE', 'CG-7/CG-8', '903/904']);
    expect(avisos.at(-1)).toContain('queda como lote XE');
  });

  it('🔴 con una sola opción en producción no hay nada que mezclar, y lo dice', async () => {
    HOJAS = { [H.MAD_LIBRO_SHEETS.ingreso]: INGRESOS_FICHA.slice(0, 1) };
    const caja = await abrir(tarjeta());
    H.madDesMixAbrir(caja.querySelector('.md-mix-btn'));
    expect(avisos.at(-1)).toContain('al menos dos');
    expect(caja.querySelector('.md-mix-chk')).toBeNull();
  });

  it('🔴 un nombre que no cabe no se escribe cortado', async () => {
    const lotes = ['LOTE01', 'LOTE02', 'LOTE03', 'LOTE04', 'LOTE05', 'LOTE06'];
    HOJAS = { [H.MAD_LIBRO_SHEETS.ingreso]: lotes.map((l, i) => ING('2026-01-01', l, 'C' + i, 'Sala 4', i + 1, 10)) };
    const card = tarjeta();
    const caja = await preguntar(card);
    [...caja.querySelectorAll('.md-mix-chk')].forEach((c) => { c.checked = true; });
    aplicar(caja);
    expect(campos(card)).toEqual(['', '', '']);
    expect(avisos.at(-1)).toContain('demasiados lotes');
  });

  it('«Volver» deja la lista como estaba, y una opción normal sigue funcionando', async () => {
    const card = tarjeta();
    const caja = await preguntar(card);
    H.madDesMixVolver(caja.querySelector('.md-mix-volver'));
    expect(caja.querySelector('.md-mix-chk')).toBeNull();
    H.madDesCargarElige([...caja.querySelectorAll('.md-cargar-op')][1]);
    expect(campos(card)).toEqual(['XB', 'CG-3', '902']);
  });

  it('🔴 Inf. Supervisor: la misma opción, y avisa de cómo se descuentan las muertas', async () => {
    const card = document.querySelector('#mm-cards .mm-card');
    const caja = await preguntar(card);
    elegir(caja, 'CG-1', 'CG-3');
    aplicar(caja);
    expect(campos(card, '.mm-')).toEqual(['MIX(XA,XB)', 'CG-1/CG-3', '901/902']);
    expect(avisos.at(-1)).toContain('repartidas entre sus lotes');
    const L = H.madMortCollect().lotes[0];
    expect([L.lote, L.codigoGenetico]).toEqual(['MIX(XA,XB)', 'CG-1/CG-3']);
  });

  it('🔴 en Desoves no habla de muertas', async () => {
    const caja = await preguntar(tarjeta());
    elegir(caja, 'CG-1', 'CG-3');
    aplicar(caja);
    expect(avisos.some((a) => a.includes('muertas'))).toBe(false);
  });

  it('🔴 una mezcla de códigos tocados al revés escribe la misma fila: la llave no depende del orden', async () => {
    const card = tarjeta();
    const caja = await preguntar(card);
    elegir(caja, 'CG-3', 'CG-1');
    aplicar(caja);
    const m = H.madDesCollect();
    m.desoves[0].desoves = 2;
    const fila = H.madDesBuildRows({ ...m, fecha: FECHA })[0];
    expect(fila.slice(0, 3)).toEqual([FECHA, 'MIX(XA,XB)', 'CG-1/CG-3']);
    expect(H.madDesValidar({ ...m, fecha: FECHA }).errores.filter((e) => e.includes('lote') || e.includes('código'))).toEqual([]);
  });
});

/* A17 (2026-11-04, usuario: «Ordenarlo solo; si está mal, error», «No dejar guardar y explicarlo») · lo que se escribe a mano o no cabe. */
describe('🔀 A17 · un MIX a mano, y lo que no cabe', () => {
  const des = (o) => ({ fecha: FECHA, desoves: [{ lote: 'BN', codigoGenetico: 'CA', piscina: '556', desoves: 1, huevos: 10, ...o }] });
  const mort = (o) => ({ fecha: FECHA, lotes: [{ lote: 'BN', codigoGenetico: 'CA', desove: { entran: 10, muertas: 1 }, recuperacion: {}, ...o }] });

  const NOMBRES = [['mix(bo, bn)', 'MIX(BN,BO)'], ['MIX(BO,BN)', 'MIX(BN,BO)'], [' mix ( bn , bo ) ', 'MIX(BN,BO)'], ['MIX(BQ,BN,BO)', 'MIX(BN,BO,BQ)'], ['MIX(BO,BN,BO)', 'MIX(BN,BO)'],
    ['MIX(BN,BN)', 'BN'], ['MIX(BN)', 'BN'], ['MIX(BN,)', 'BN'], ['bn', 'BN'], ['MIX', 'MIX'], ['MIX OLF', 'MIXOLF'], ['MIXTO', 'MIXTO'], ['MIX(BN,BO', 'MIX(BN,BO'], ['', ''],
    // 2026-11-05 (auditoría) · con espacios pasa de 40 y sin ellos cabe: se cortaba ANTES de quitarlos y quedaba sin cerrar, sin error.
    ['mix(bw, bv, bu, bt, bs, br, bq, bp, bo, bn)', 'MIX(BN,BO,BP,BQ,BR,BS,BT,BU,BV,BW)']];
  it.each(NOMBRES)('🔴 «%s» queda «%s», en el motor y en el esquema', (escrito, queda) => {
    expect(normLote(escrito)).toBe(queda);
    expect(H.madDesNormLote(escrito)).toBe(queda);
  });
  it('🔴 lo escrito a mano y lo de 📥 Cargar son la MISMA llave', () => {
    const armado = armarMix([{ lote: 'BO', codigoGenetico: 'CB', piscina: '2' }, { lote: 'BN', codigoGenetico: 'CA', piscina: '1' }]).lote;
    const fila = (lote) => buildDesoveRows(des({ lote }))[0][MAD_DESOVE_HEADERS.indexOf('Lote')];
    expect(fila('mix(bo, bn)')).toBe(armado);
    expect(H.madDesBuildRows(des({ lote: 'mix(bo, bn)' }))[0][MAD_DESOVE_HEADERS.indexOf('Lote')]).toBe(armado);
    expect(mortRowId(FECHA, 'mix(bo, bn)', 'CA', 'Desove')).toBe(mortRowId(FECHA, armado, 'CA', 'Desove'));
  });
  it('🔴 dos veces el mismo lote no es un MIX: se guarda como ese lote', () => {
    expect(buildDesoveRows(des({ lote: 'MIX(BN,BN)' }))[0][MAD_DESOVE_HEADERS.indexOf('Lote')]).toBe('BN');
  });
  it('leer sigue siendo leer: `esMix` y `lotesDeMix` no reordenan, como el libro', () => {
    expect(lotesDeMix('MIX(BO,BN)')).toEqual(['BO', 'BN']);
    expect(H.madLibroLotesDeMix('MIX(BO,BN)')).toEqual(['BO', 'BN']);
    expect(esMix('MIX(BN,BN)'), 'al leer, el nombre tal cual: escribirlo así ya no se puede').toBe(true);
  });
  it('🔴 un nombre mal escrito para ahí: no suma los errores de lo que venía detrás', () => {
    const m = des({ lote: 'MIX(BN,BO', n5: 10 });
    expect(validarDesove(m).errores).toHaveLength(1);
    expect(H.madDesValidar(m)).toEqual(validarDesove(m));
  });

  const MALOS = ['MIX(BN,BO', 'mix(bn,bo', 'MIX()', 'MIX(,)', 'MIX(BN,BO)X', 'MIX(LA,LB,LC,LD,LE,LF,LG,LH,LI,LJ,LK,LL,LM)'];
  it.each(MALOS)('🔴 «%s» no es un MIX válido: error, y no se confunde con un lote', (lote) => {
    const e = validarDesove(des({ lote })).errores;
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('no es un MIX válido');
    expect(H.madDesValidar(des({ lote }))).toEqual(validarDesove(des({ lote })));
    expect(validarMort(mort({ lote })).errores[0]).toContain('no es un MIX válido');
    expect(H.madMortValidar(mort({ lote }))).toEqual(validarMort(mort({ lote })));
  });
  it('🔴 lo que está bien pasa, también en el límite de los 40', () => {
    const justo = 'MIX(LA,LB,LC,LD,LE,LF,LG,LH,LI,LJ,LK,L1)';
    expect(justo).toHaveLength(40);
    ['MIX(BN,BO)', 'mix(bo, bn)', 'MIX(BN,BN)', justo, 'BN', 'MIXTO'].forEach((lote) => {
      expect(textoMal({ lote }), lote).toEqual([]);
      expect(H.madDesTextoMal({ lote }), lote).toEqual([]);
    });
  });
  it('🔴 un código o una piscina que no caben: error con su largo, en las dos copias; en el tope, no', () => {
    const c = (n) => 'C'.repeat(n);
    expect(validarDesove(des({ codigoGenetico: c(201) })).errores[0]).toBe('El código genético de «BN» no cabe: tiene 201 caracteres y el tope es 200.');
    expect(validarDesove(des({ piscina: c(61) })).errores[0]).toBe('La piscina de «BN» no cabe: tiene 61 caracteres y el tope es 60.');
    expect(textoMal({ lote: 'BN', codigoGenetico: c(200), piscina: c(60) })).toEqual([]);
    expect(H.madDesTextoMal({ lote: 'BN', codigoGenetico: c(200), piscina: c(60) }), 'el motor, en el tope').toEqual([]);
    expect(textoMal({ codigoGenetico: c(201) })[0]).toContain('«este registro»');
    for (const o of [{ codigoGenetico: c(201) }, { piscina: c(61) }, { codigoGenetico: c(201), piscina: c(61) }]) {
      expect(H.madDesValidar(des(o))).toEqual(validarDesove(des(o)));
      expect(H.madMortValidar(mort(o))).toEqual(validarMort(mort(o)));
    }
    expect(validarMort(mort({ piscina: c(61) })).errores[0]).toContain('no cabe');
    expect(validarDesove(des({ codigoGenetico: c(201), piscina: c(61) })).errores).toHaveLength(2);
  });
  it.each([['sus códigos', (i) => 'X'.repeat(70) + i, (i) => String(i)], ['sus piscinas', (i) => 'C' + i, (i) => 'P'.repeat(25) + i]])('🔴 📥 Cargar: si %s no caben, no rellena nada y lo dice', async (_n, cg, piscina) => {
    HOJAS = { [H.MAD_LIBRO_SHEETS.ingreso]: [0, 1, 2].map((i) => ({ ...ING('2026-01-01', 'Q' + i, cg(i), 'Sala 2', 16 + i, 10), 'Piscina Broodstock': piscina(i), Grupo: '' })) };
    globalThis.fetch = async (url) => {
      const hoja = new URL(String(url)).searchParams.get('sheet');
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, headers: [], rows: HOJAS[hoja] || [] }) };
    };
    localStorage.clear();
    H.olvidarLibro();
    H.madDesReiniciar();
    avisos.length = 0;
    document.getElementById('md-fecha').value = FECHA;
    const card = document.querySelector('#md-cards .md-des');
    await H.madDesCargar(card.querySelector('.md-cargar-btn'));
    const caja = card.querySelector('.md-cargar');
    H.madDesMixAbrir(caja.querySelector('.md-mix-btn'));
    caja.querySelectorAll('.md-mix-chk').forEach((c) => { c.checked = true; });
    H.madDesMixAplicar(caja.querySelector('.md-mix-aplicar'));
    expect(card.querySelector('.md-lote').value).toBe('');
    expect(avisos.at(-1)).toContain('no caben');
  });
});

/* A18 (2026-11-04, usuario: «Con su fila y en el total») · el 📊 Saldo: un MIX no tiene animales y no salía en ningún sitio. */
describe('🔀 A18 · 📊 Saldo', () => {
  const DESF = (Fecha, Lote, cg, Desoves, h, N2, N5) => ({ Fecha, Lote, 'Código genético': cg, Desoves, 'Total de huevos': h, 'Hembras no viables': 1, N2, N5 });
  const REV = (Fecha, Lote, rev) => ({ Fecha, Lote, 'Código genético': 'C', 'Tipo de tanque': '', Revisión: rev, Deformidad: 'Baja', Hongos: 'Presente', Salinidad: 30 });
  const HOY = '2026-02-10';
  const MIX = 'MIX(BN,BO)';
  const F = { ingresos: INGRESOS,
    desoves: [DESF('2026-01-20', 'BN', 'C1', 2, 200000, 100000, 80000), DESF('2026-01-21', MIX, 'C1/C2', 4, 700000, 500000, 300000), DESF('2026-01-22', 'MIX(QQ,ZZ)', 'C8/C9', 9, 900000, 900000, 900000)],
    mortDesove: [REV('2026-01-21', MIX, 'Postlavado')] };
  const R = () => resumenMaduracion(F, { hoy: HOY });
  const SEL = { 'des-totales': 1, 'des-nauplios': 1, 'des-fertilidad': 1, mortdes: 1, 'des-huevos': 1, 'des-por100': 1, 'naup-calidad': 1, 'naup-agua': 1 };
  const dom = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
  const tabla = (d, titulo) => [...d.querySelectorAll('h2')].find((h) => h.textContent.includes(titulo)).nextElementSibling;
  const filas = (t) => [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim()));

  it('🔴 va aparte, con sus cifras; a sus lotes no les suma', () => {
    const r = R();
    expect(r.mix).toEqual([{ lote: MIX, desoves: { desoves: 4, noViables: 1, huevos: 700000, n2: 500000, n5: 300000, naupliosPorHembra: 75000, fertilidad: 71.43 },
      nauplios: expect.objectContaining({ fecha: '2026-01-21' }) }]);
    expect(r.mix[0].nauplios.revisiones[0].revision).toBe('Postlavado');
    expect(r.lotes.find((l) => l.lote === 'BN').desoves.desoves).toBe(2);
    expect(r.lotes.map((l) => l.lote)).not.toContain(MIX);
  });
  it('🔴 el de lotes que ya no están en el Saldo no sale: la lista no crece sin fin', () => {
    expect(R().mix.map((m) => m.lote)).toEqual([MIX]);
  });
  /* 2026-11-05 (auditoría) · la de arriba usa lotes que nunca existieron: no prueba un lote que SALE del Saldo al cerrarse. */
  it('🔴 un MIX sale cuando sus lotes se cierran; con uno aún en el Saldo, se queda', () => {
    const conCierres = (cerrados) => resumenMaduracion({ ...F, cierres: cerrados.map((Lote) => ({ Fecha: '2026-01-25', Lote, Tipo: 'Total', Machos: '', Hembras: '' })) }, { hoy: HOY });
    expect(conCierres(['BO']).lotes.map((l) => l.lote), 'control: BO cerrado ya no está en el Saldo').not.toContain('BO');
    expect(conCierres(['BO']).mix.map((m) => m.lote), 'BN sigue: el MIX se queda').toEqual([MIX]);
    expect(conCierres(['BN', 'BO']).lotes.map((l) => l.lote), 'control').not.toContain('BN');
    expect(conCierres(['BN', 'BO']).mix, 'cerrados los dos, sale').toEqual([]);
    expect(H.madResumenMaduracion({ ...F, cierres: [{ Fecha: '2026-01-25', Lote: 'BN', Tipo: 'Total' }, { Fecha: '2026-01-25', Lote: 'BO', Tipo: 'Total' }] }, { hoy: HOY }).mix, 'en el motor también').toEqual([]);
  });
  it('🔴 el motor da lo mismo que el módulo', () => {
    expect(H.madResumenMaduracion(F, { hoy: HOY }).mix).toEqual(R().mix);
  });
  it('sin un MIX, la lista va vacía', () => {
    expect(resumenMaduracion({ ...F, desoves: F.desoves.slice(0, 1) }, { hoy: HOY }).mix).toEqual([]);
    expect(H.madResumenMaduracion({ ...F, desoves: F.desoves.slice(0, 1) }, { hoy: HOY }).mix).toEqual([]);
  });

  describe('la pantalla', () => {
    const pinta = (sel, filtro = null) => H._madResCuerpoHTML(H.madResumenMaduracion(F, { hoy: HOY }), sel, false, filtro);
    it('🔴 su tarjeta, con lo suyo y explicando por qué va aparte', () => {
      const t = dom(pinta(SEL)).textContent;
      expect(t).toContain('🔀 MIX');
      expect(t).toContain('🔀 ' + MIX);
      expect(t).toContain('4 · 1 · 300.000');
      expect(t).toContain('700.000 · 500.000');
      expect(t).toContain('Postlavado');
      expect(t).toContain('no suman a ninguno de sus lotes');
    });
    it('🔴 sin las variables suyas, ni la tarjeta; y en el PDF de un lote, tampoco', () => {
      expect(dom(pinta({ 'lote-pesos': 1 })).textContent).not.toContain('🔀');
      expect(dom(pinta(SEL, { tipo: 'lote', nombre: 'BN' })).textContent).not.toContain('🔀');
    });
    it.each([['des-totales', '4 · 1 · 300.000'], ['des-nauplios', '75.000'], ['des-fertilidad', '71.43%'], ['des-huevos', '700.000 · 500.000'], ['naup-calidad', 'Hongos Presente'], ['naup-agua', 'Sal. 30 ‰']])('🔴 %s enseña lo suyo', (id, texto) => {
      expect(dom(pinta({ [id]: 1 })).textContent).toContain(texto);
    });
  });

  describe('el PDF por tablas', () => {
    const pdf = (sel = SEL, filtro = null) => dom(H._madResTabHTML(H.madResumenMaduracion(F, { hoy: HOY }), sel, filtro));
    it('🔴 Reproducción: su fila, sin mortalidad, y el total lo incluye', () => {
      const f = filas(tabla(pdf(), 'Lotes · Reproducción'));
      const mix = f.find((x) => x[0] === MIX);
      expect(mix.slice(1, 4)).toEqual(['4', '1', '300.000']);
      expect(mix.slice(-2), 'sus muertas ya están en cada lote').toEqual(['—', '—']);
      const tot = f[f.length - 1];
      expect(tot[0]).toBe('Total · 3 lotes y 1 MIX');
      expect(tot.slice(1, 4)).toEqual(['6', '2', '380.000']);
    });
    it('🔴 Huevos, N2 y por 100 ♀: su fila, y el total lo incluye', () => {
      const f = filas(tabla(pdf(), 'Huevos, N2'));
      expect(f.find((x) => x[0] === MIX)).toEqual([MIX, '700.000', '500.000', '—', '—', '—']);
      expect(f[f.length - 1].slice(0, 3)).toEqual(['Total · 3 lotes y 1 MIX', '900.000', '600.000']);
    });
    it('🔴 la revisión de nauplios lo lista', () => {
      expect(filas(tabla(pdf(), 'Revisión de nauplios')).some((x) => x[0] === MIX && x[1] === 'Postlavado')).toBe(true);
    });
    it('🔴 el PDF de un lote no lo lleva', () => {
      const d = pdf(SEL, { tipo: 'lote', nombre: 'BN' });
      expect(d.textContent).not.toContain(MIX);
      expect(d.textContent).not.toContain('MIX');
    });
    it('sin un MIX, el total dice sólo los lotes', () => {
      const d = dom(H._madResTabHTML(H.madResumenMaduracion({ ...F, desoves: F.desoves.slice(0, 1) }, { hoy: HOY }), SEL, null));
      const f = filas(tabla(d, 'Lotes · Reproducción'));
      expect(f[f.length - 1][0]).toBe('Total · 3 lotes');
    });
  });
});
