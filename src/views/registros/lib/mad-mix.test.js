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
import { armarMix, esMix, lotesDeMix, buildDesoveRows, MAD_DESOVE_HEADERS } from './ficha-maduracion-desoves.schema.js';
import { construirLibro } from './mad-libro.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madDesArmarMix', 'madLibroLotesDeMix', 'madConstruirLibro', 'madDesReiniciar', 'madDesAddCard', 'madDesCargar', 'madDesCargarElige',
  'madDesMixAbrir', 'madDesMixAplicar', 'madDesMixVolver', 'madDesCollect', 'madDesValidar', 'madDesBuildRows', 'MAD_LIBRO_SHEETS', 'madMortReiniciar', 'madMortCollect',
  'madMortBuildRows', 'madDesNormCG'];
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
