// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · DESOVES · «📥 Cargar» (usuario, 2026-09-24, punto 5)

   PEDIDO: «añadir al lado del botón de quitar un nuevo botón denominado Cargar: revisar los
   lotes - códigos genéticos - piscinas que están en producción individualmente o en pareja según
   su registro, para que el desove sea individual o en pareja según el ingreso [...] que se carguen
   en los campos de lote, código genético y piscina broodstock. Su objetivo es ahorrar que el
   técnico se equivoque al registrar en esos campos».

   Decisiones del usuario: la pareja es la del INGRESO (composiciones de un lote que comparten
   «Grupo»), no además cada una suelta; y sólo lo que está en PRODUCCIÓN a la fecha del desove.

   🔑 Los fixtures llevan a propósito un lote en cuarentena, uno sin vivos y una pareja registrada
   en el orden CONTRARIO al de su grupo: con todo en producción y en orden, «ofrece lo que hay en
   el Ingreso» y «ofrece lo que produce, en el orden del grupo» darían lo mismo.
   Valores INVENTADOS (regla del usuario, 2026-09-18: las pruebas no llevan valores reales).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madDesComposiciones', 'madConstruirLibro', 'madDesReiniciar', 'madDesAddCard', 'madDesCargar',
  'madDesCargarElige', 'madDesCargarReleer', 'madDesCollect', 'MAD_LIBRO_SHEETS', '_madDesCardHTML', '_madBorrAdaptar',
  'madMortReiniciar', 'madMortCollect'];   // punto 6: el mismo 📥 Cargar en Inf. Supervisor
const H = {};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };

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
  H.setToast(() => {});
});

/* Filas del Ingreso con la forma REAL de la hoja (las cabeceras son las claves, como `?p=rows`). */
const ING = (Fecha, Lote, cg, piscina, grupo, Sala, Tanque, Machos = 10, Hembras = 10) => ({
  Fecha, Lote, 'Código genético': cg, 'Piscina Broodstock': piscina, Grupo: grupo, Sala, Tanque, Machos, Hembras,
});
const FECHA = '2026-02-10';
/* · XA: PAREJA (grupo «CG-1/CG-2»), registrada al REVÉS de su grupo, en producción (40 días).
   · XB: sola, en producción.
   · XC: pareja en CUARENTENA (entró hace 5 días): no se ofrece.
   · XD: sola, en producción, pero sin vivos (se murieron todos): no se ofrece.
   · XE: dos composiciones SIN grupo en el mismo lote: cada una sola.
   · XG: sola, en producción el día del desove, y se muere DESPUÉS: el desove de ese día sí la ofrece. */
const INGRESOS = [
  ING('2026-01-01', 'XA', 'CG-2', '902', 'CG-1/CG-2', 'Sala 2', 16),
  ING('2026-01-01', 'XA', 'CG-1', '901', 'CG-1/CG-2', 'Sala 2', 17),
  ING('2026-01-01', 'XB', 'CG-3', '903', '', 'Sala 4', 1),
  ING('2026-02-05', 'XC', 'CG-4', '904', 'CG-4/CG-5', 'Sala 3', 22),
  ING('2026-02-05', 'XC', 'CG-5', '905', 'CG-4/CG-5', 'Sala 3', 22),
  ING('2026-01-01', 'XD', 'CG-6', '906', '', 'Sala 4', 2),
  ING('2026-01-01', 'XE', 'CG-7', '907', '', 'Sala 5', 7),
  ING('2026-01-01', 'XE', 'CG-8', '908', '', 'Sala 5', 8),
  ING('2026-01-01', 'XG', 'CG-10', '910', '', 'Sala 5', 10),
];
const TANQUES = [
  { Fecha: '2026-02-01', Sala: 'Sala 4', Tanque: 2, 'Machos muertos': 10, 'Hembras muertas': 10 },
  { Fecha: '2026-03-01', Sala: 'Sala 5', Tanque: 10, 'Machos muertos': 10, 'Hembras muertas': 10 },
];
const libroAl = (fecha, ingresos = INGRESOS) => H.madConstruirLibro({ ingresos, tanques: TANQUES }, { hoy: fecha, hasta: fecha });
const textos = (ops) => ops.map((o) => o.texto);

describe('Desoves · 📥 Cargar · qué se ofrece (madDesComposiciones)', () => {
  it('el fixture ejerce algo: el libro ve vivos a XA, XB y XE, a XC en cuarentena y a XD sin nadie', () => {
    const l = libroAl(FECHA);
    const vivos = (lote) => l.posiciones.filter((p) => p.lote === lote).reduce((s, p) => s + p.machos + p.hembras, 0);
    expect(vivos('XA')).toBe(40);
    expect(vivos('XC')).toBe(40);
    expect(vivos('XD'), 'XD debería haberse quedado sin vivos').toBe(0);
  });

  it('🔴 lo que produce, y nada más: sin la pareja en cuarentena ni el lote sin vivos', () => {
    expect(textos(H.madDesComposiciones(libroAl(FECHA), INGRESOS, FECHA))).toEqual([
      'XA · CG-1/CG-2 · 901/902 · pareja',
      'XB · CG-3 · 903',
      'XE · CG-7 · 907',
      'XE · CG-8 · 908',
      'XG · CG-10 · 910',
    ]);
  });

  it('🔴 la pareja del Ingreso es UNA opción, en el orden de su GRUPO y no en el de registro', () => {
    const xa = H.madDesComposiciones(libroAl(FECHA), INGRESOS, FECHA).find((o) => o.lote === 'XA');
    expect(xa).toEqual({ lote: 'XA', codigoGenetico: 'CG-1/CG-2', piscina: '901/902', pareja: true,
      texto: 'XA · CG-1/CG-2 · 901/902 · pareja' });
  });

  it('🔴 sin grupo, cada composición va sola, aunque sean del mismo lote', () => {
    const xe = H.madDesComposiciones(libroAl(FECHA), INGRESOS, FECHA).filter((o) => o.lote === 'XE');
    expect(xe.map((o) => [o.codigoGenetico, o.piscina, o.pareja])).toEqual([['CG-7', '907', false], ['CG-8', '908', false]]);
  });

  it('🔴 manda la FECHA del desove: lo que aún no había entrado no sale, y la cuarentena de entonces tampoco', () => {
    // El 2026-01-10 XA, XB y XE llevaban 9 días: todavía en cuarentena. XC no había entrado.
    expect(H.madDesComposiciones(libroAl('2026-01-10'), INGRESOS, '2026-01-10')).toEqual([]);
    // El 2026-03-01 XC ya lleva 24 días: produce, y su pareja sale. XG murió ese día: ya no.
    const despues = textos(H.madDesComposiciones(libroAl('2026-03-01'), INGRESOS, '2026-03-01'));
    expect(despues).toContain('XC · CG-4/CG-5 · 904/905 · pareja');
    expect(despues).not.toContain('XG · CG-10 · 910');
  });

  it('un grupo de UN solo miembro no es pareja', () => {
    const sola = [ING('2026-01-01', 'XF', 'CG-9', '909', 'CG-9', 'Sala 5', 9)];
    expect(H.madDesComposiciones(libroAl(FECHA, sola), sola, FECHA)).toEqual([
      { lote: 'XF', codigoGenetico: 'CG-9', piscina: '909', pareja: false, texto: 'XF · CG-9 · 909' },
    ]);
  });

  it('sin libro o sin Ingreso no se inventa nada', () => {
    expect(H.madDesComposiciones(null, INGRESOS, FECHA)).toEqual([]);
    expect(H.madDesComposiciones(libroAl(FECHA), [], FECHA)).toEqual([]);
  });
});

/* ── La ficha: el botón, la ventanita y lo que carga ── */
let HOJAS = {};
let RECORTADAS = new Set();
let lecturas = 0;
beforeEach(() => {
  HOJAS = { [H.MAD_LIBRO_SHEETS.ingreso]: INGRESOS, [H.MAD_LIBRO_SHEETS.tanques]: TANQUES };
  RECORTADAS = new Set();
  lecturas = 0;
  globalThis.fetch = async (url) => {
    const hoja = new URL(String(url)).searchParams.get('sheet');
    if (hoja === H.MAD_LIBRO_SHEETS.ingreso) lecturas++;
    const cuerpo = { ok: true, headers: [], rows: HOJAS[hoja] || [] };
    if (RECORTADAS.has(hoja)) { cuerpo.truncated = true; cuerpo.limit = 20000; }
    return { ok: true, status: 200, text: async () => JSON.stringify(cuerpo) };
  };
  localStorage.clear();
  H.olvidarLibro();
  H.madDesReiniciar();
  document.getElementById('md-fecha').value = FECHA;
});
const tarjeta = (i = 0) => document.querySelectorAll('#md-cards .md-des')[i];
const campo = (card, cls) => card.querySelector(cls).value;
const abrir = async (card) => { await H.madDesCargar(card.querySelector('.md-cargar-btn')); return card.querySelector('.md-cargar'); };
const opcion = (caja, texto) => [...caja.querySelectorAll('.md-cargar-op')].find((b) => b.textContent === texto);

describe('Desoves · 📥 Cargar · en la ficha', () => {
  it('🔴 el botón va al lado de «✕ Quitar», y la ventanita empieza cerrada', () => {
    const card = tarjeta();
    const btn = card.querySelector('.md-cargar-btn');
    expect(btn, 'no hay botón Cargar').toBeTruthy();
    expect(btn.textContent).toContain('Cargar');
    expect(btn.nextElementSibling.textContent).toContain('Quitar');
    expect(card.querySelector('.md-cargar').hidden).toBe(true);
  });

  it('🔴 abrir lista lo que produce a la FECHA DEL DESOVE, sin la pareja en cuarentena', async () => {
    const caja = await abrir(tarjeta());
    expect(caja.hidden).toBe(false);
    expect([...caja.querySelectorAll('.md-cargar-op')].map((b) => b.textContent)).toEqual([
      'XA · CG-1/CG-2 · 901/902 · pareja', 'XB · CG-3 · 903', 'XE · CG-7 · 907', 'XE · CG-8 · 908',
      'XG · CG-10 · 910',   // vivo el día del desove; hoy ya no: manda el libro de ESE día
    ]);
    expect(caja.textContent).toContain(FECHA);
  });

  it('🔴 tocar una opción rellena los TRES campos de ESA tarjeta y cierra la ventanita', async () => {
    H.madDesAddCard();
    const otra = tarjeta(1);
    const caja = await abrir(otra);
    H.madDesCargarElige(opcion(caja, 'XA · CG-1/CG-2 · 901/902 · pareja'));
    expect([campo(otra, '.md-lote'), campo(otra, '.md-cg'), campo(otra, '.md-piscina')]).toEqual(['XA', 'CG-1/CG-2', '901/902']);
    expect(caja.hidden).toBe(true);
    expect(campo(tarjeta(0), '.md-lote'), 'se rellenó la tarjeta equivocada').toBe('');
    // Y es lo que se recoge para guardar: el desove queda con su llave de pareja.
    const d = H.madDesCollect().desoves[1];
    expect([d.lote, d.codigoGenetico, d.piscina]).toEqual(['XA', 'CG-1/CG-2', '901/902']);
  });

  it('🔴 cargar avisa al borrador como si se hubiera tecleado (el valor por programa no dispara «input»)', async () => {
    let eventos = 0;
    document.getElementById('fp-desoves').addEventListener('input', () => { eventos++; });
    const caja = await abrir(tarjeta());
    H.madDesCargarElige(opcion(caja, 'XB · CG-3 · 903'));
    expect(eventos).toBeGreaterThan(0);
  });

  it('usa la última lectura: abrir otra vez no vuelve a leer las hojas; «🔄 Releer» sí', async () => {
    const caja = await abrir(tarjeta());
    expect(lecturas).toBe(1);
    await H.madDesCargar(tarjeta().querySelector('.md-cargar-btn'));   // cierra
    await abrir(tarjeta());                                             // abre de nuevo
    expect(lecturas, 'volvió a leer sin pedirlo').toBe(1);
    await H.madDesCargarReleer(caja.querySelector('button'));
    expect(lecturas).toBe(2);
  });

  it('🔴 con una hoja RECORTADA la lista lo dice ANTES de enseñarse: puede quedarse corta (A1)', async () => {
    RECORTADAS.add(H.MAD_LIBRO_SHEETS.tanques);
    const caja = await abrir(tarjeta());
    expect(caja.textContent).toMatch(/INCOMPLETA/);
    expect(caja.textContent.indexOf('INCOMPLETA')).toBeLessThan(caja.textContent.indexOf('XA ·'));
  });

  it('sin nada en producción ese día lo dice, y no ofrece nada', async () => {
    document.getElementById('md-fecha').value = '2026-01-10';
    const caja = await abrir(tarjeta());
    expect(caja.querySelectorAll('.md-cargar-op')).toHaveLength(0);
    expect(caja.textContent).toMatch(/Ningún lote en producción/);
  });

  it('🔴 un desove que se está COMPLETANDO no lleva el botón: su lote y su código son la llave', () => {
    const cont = document.createElement('div');
    cont.innerHTML = H._madDesCardHTML({ lote: 'XA', codigoGenetico: 'CG-1/CG-2' }, true, FECHA);
    expect(cont.querySelector('.md-cargar-btn')).toBeNull();
    expect(cont.querySelector('.md-cargar')).toBeNull();
  });

  it('🔴 un borrador de ANTES recupera el botón al abrirse, y una lista que quedó abierta vuelve cerrada', () => {
    const fp = document.getElementById('fp-desoves');
    tarjeta().querySelector('.md-cargar-btn').remove();                 // como era la tarjeta antes del 09-24
    tarjeta().querySelector('.md-cargar').remove();
    H.madDesAddCard();
    const abierta = tarjeta(1).querySelector('.md-cargar');
    abierta.hidden = false;
    abierta.innerHTML = '<button class="md-cargar-op">de otro día</button>';
    H._madBorrAdaptar('desoves', fp, FECHA);
    expect(tarjeta(0).querySelector('.md-cargar-btn'), 'el borrador viejo se quedó sin botón').toBeTruthy();
    expect(tarjeta(0).querySelector('.md-cargar-btn').nextElementSibling.textContent).toContain('Quitar');
    expect(tarjeta(0).querySelector('.md-cargar').hidden).toBe(true);
    expect(abierta.hidden).toBe(true);
    expect(abierta.innerHTML).toBe('');
  });
});

/* ── 2026-09-24 (usuario, punto 6) · el MISMO 📥 Cargar en Inf. Supervisor ─────────────────────────────────
   Rellena lote, código genético y piscina de SU tarjeta, y la lista es la de la fecha de SU ficha (#mm-fecha), no la
   de Desoves: con dos fichas abiertas en fechas distintas, tomar la otra ofrecería lo que producía otro día. */
describe('Inf. Supervisor · 📥 Cargar (punto 6)', () => {
  const card = () => document.querySelector('#mm-cards .mm-card');
  beforeEach(() => {
    H.madMortReiniciar();
    document.getElementById('mm-fecha').value = FECHA;
    document.getElementById('md-fecha').value = '2026-01-10';   // en Desoves, un día sin nada en producción
  });

  it('🔴 la tarjeta lleva el botón, y la lista es la de la fecha de SU ficha', async () => {
    const caja = await abrir(card());
    expect([...caja.querySelectorAll('.md-cargar-op')].map((b) => b.textContent)).toContain('XB · CG-3 · 903');
    expect(caja.textContent).toContain(FECHA);
  });

  it('🔴 tocar una opción rellena lote, código y piscina de la tarjeta de Inf. Supervisor, y es lo que se recoge', async () => {
    const caja = await abrir(card());
    H.madDesCargarElige(opcion(caja, 'XA · CG-1/CG-2 · 901/902 · pareja'));
    expect([card().querySelector('.mm-lote').value, card().querySelector('.mm-cg').value, card().querySelector('.mm-piscina').value])
      .toEqual(['XA', 'CG-1/CG-2', '901/902']);
    const l = H.madMortCollect().lotes[0];
    expect([l.lote, l.codigoGenetico, l.piscina]).toEqual(['XA', 'CG-1/CG-2', '901/902']);
    expect(caja.hidden).toBe(true);
  });
});
