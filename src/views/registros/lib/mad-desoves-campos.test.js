// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · DESOVES · el formulario tras los cambios del 2026-09-14, y por qué el envío
   pregunta antes al GAS

   · «No viables (miles)» → «Hembras no viables»: reproductoras que estaban maduras y NO
     desovaron. Conteo de animales como «Desoves»: sin ×1000.
   · «Total de nauplios (miles)» se BORRA: los nauplios ya se registran en N2 y N5.

   🔴🔴 LA HOJA EN USO. «Maduración Lotes» se escribe POR POSICIÓN (llave [0,1,2]) y ya tiene
   una fila. El GAS NUEVO rechaza un envío cuyas cabeceras no casan con la hoja (guarda de
   esquema) y no escribe nada; el GAS PUBLICADO HOY no tiene esa guarda y escribiría cada dato en
   la columna que la hoja vieja tuviera en esa posición. Por eso esta hoja entra en la misma
   protección que el Ingreso: el cliente pregunta a `?p=ver` antes de enviar (y la cola antes de
   entregar), y contra el GAS viejo no envía.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_DESOVE_HEADERS } from './ficha-maduracion-desoves.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madDesReiniciar', 'madDesCollect', 'buildMadDesovePayload', 'madDesGuardar', 'flushSyncQueue', 'MAD_DESOVE_SHEET',
  'madDesPendVer', 'madDesEditar', 'MAD_DES_PEND_KEY', 'madDesDespachoResumen',
  '_gasVersionLocal',    // 2026-09-16 · el portón compara el SELLO: el fixture usa el de esta app
  'MAD_BORR_PRE', 'madBorrFechaChange', '_madBorrFijarValores',   // PE1.3 · el borrador de antes, adaptado
  'madDesFechaNFija', 'madDesFechasNSiguen', '_madDesHayTecleado'];   // PE1.3 (09-17) · automáticas pero editables
const H = {};
const avisos = [];
const envios = [];
let respuestaVer = null;
let respuestaRows = null;

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
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setDesHoja=function(v){_madDesHoja=v;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPost(async (payload) => { envios.push(payload); return true; });
  H.setPostOnce(async (body) => { envios.push(body); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=rows') !== -1) {
      if (respuestaRows === 'red') throw new Error('sin red');
      return { ok: true, status: 200, text: async () => JSON.stringify(respuestaRows) };
    }
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    if (respuestaVer === 'red') throw new Error('sin red');
    const cuerpo = typeof respuestaVer === 'string' ? respuestaVer : JSON.stringify(respuestaVer);
    return { ok: true, status: 200, text: async () => cuerpo };
  };
});

beforeEach(() => {
  avisos.length = 0;
  envios.length = 0;
  respuestaVer = { ok: true, version: H._gasVersionLocal() };   // el GAS desplegado ES el de esta app
  H.madDesReiniciar();
});

const q = (s) => document.querySelector('#fp-desoves ' + s);
const col = (h) => MAD_DESOVE_HEADERS.indexOf(h);
const llenar = () => {
  document.getElementById('md-fecha').value = '2026-09-14';
  q('.md-lote').value = 'BP';
  q('.md-cg').value = 'OLF5.F2';
  q('.md-desoves').value = '64';
  q('.md-hnoviables').value = '9';
};

describe('Desoves · Hembras no viables en el formulario', () => {
  it('🔴 «No viables (miles)» ya no está; está «Hembras no viables», sin «(miles)»', () => {
    const txt = document.getElementById('fp-desoves').textContent;
    expect(txt).not.toContain('No viables (miles)');
    expect(txt).toContain('Hembras no viables');
    expect(q('.md-noviables')).toBeNull();
    expect(q('.md-hnoviables').getAttribute('type')).toBe('number');
  });

  it('🔴 el viaje: 9 hembras no viables llegan como 9 (no 9000)', () => {
    llenar();
    const p = H.buildMadDesovePayload(H.madDesCollect());
    expect(p.headers).toEqual(MAD_DESOVE_HEADERS);
    expect(p.rows[0][col('Hembras no viables')]).toBe(9);
    expect(p.rows[0][col('Desoves')]).toBe(64);
  });
});

describe('Desoves · sin «Total de nauplios» en el formulario', () => {
  it('🔴 el campo ya no está, y N2 y N5 sí', () => {
    const txt = document.getElementById('fp-desoves').textContent;
    expect(txt).not.toContain('Total de nauplios');
    expect(q('.md-nauplios')).toBeNull();
    expect(q('.md-n2')).not.toBeNull();
    expect(q('.md-n5')).not.toBeNull();
  });

  it('🔴 el payload no lleva la columna y cada dato sigue bajo SU cabecera', () => {
    llenar();
    q('.md-huevos').value = '14440';
    q('.md-n2').value = '9000';
    const p = H.buildMadDesovePayload(H.madDesCollect());
    expect(p.headers).not.toContain('Total de nauplios');
    expect(p.rows[0]).toHaveLength(p.headers.length);
    expect(p.rows[0][col('Total de huevos')]).toBe(14440000);
    expect(p.rows[0][col('N2')]).toBe(9000000);
    expect(p.rows[0][col('Hembras no viables')]).toBe(9);
    expect([p.rows[0][col('Fecha N2')], p.rows[0][col('Fecha N5')]], 'PE1.3: la del desove con el N2; sin N5, vacía').toEqual(['2026-09-14', '']);
  });
});

/* 🔴 2026-09-17 · ESTE BLOQUE EXIGÍA LO CONTRARIO —«la tarjeta ya no tiene campos de fecha»— y no estaba mal:
   el usuario corrigió el criterio. «Las fechas salen automáticamente, pero se pueden editar de ser el caso»,
   así que los campos VUELVEN, vienen puestos y siguen a la del desove hasta que alguien los toque. */
describe('Desoves · las fechas de N2 y N5 salen solas pero se EDITAN (PE1.3, 2026-09-17, usuario)', () => {
  const fechaDesove = (v) => { document.getElementById('md-fecha').value = v; H.madDesFechasNSiguen(); };

  it('🔴 la tarjeta TRAE los dos campos, ya rellenos, y el texto dice que se pueden cambiar', () => {
    expect(q('.md-fn2'), 'falta el campo «Fecha N2»').not.toBeNull();
    expect(q('.md-fn5'), 'falta el campo «Fecha N5»').not.toBeNull();
    fechaDesove('2026-09-14');
    expect(q('.md-fn2').value).toBe('2026-09-14');
    expect(q('.md-fn5').value).toBe('2026-09-15');
    expect(q('.md-fn2').getAttribute('data-fijo'), 'la de oficio no puede nacer fijada').toBeNull();
    expect(document.getElementById('fp-desoves').textContent).toContain('puedes cambiarlas');
  });

  /* 🔴 El banco destapó que sólo se miraban las fechas DESPUÉS de llamar a madDesFechasNSiguen, que las reescribe:
     con eso, una tarjeta que naciera con el valor equivocado pasaba desapercibida. Aquí se mira el PRIMER pintado. */
  it('🔴 la tarjeta NACE con las fechas bien, sin que nadie las refresque', () => {
    H.madDesReiniciar();
    const hoy = document.getElementById('md-fecha').value;
    const manana = new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10) + 1)).toISOString().slice(0, 10);
    expect(q('.md-fn2').value, 'la de N2 es la del desove').toBe(hoy);
    expect(q('.md-fn5').value, 'la de N5 es la del día SIGUIENTE, no la del desove').toBe(manana);
  });

  it('🔴 cambiar la fecha del desove mueve las dos: el N5 cruza de mes', () => {
    llenar();
    fechaDesove('2026-09-30');
    expect([q('.md-fn2').value, q('.md-fn5').value]).toEqual(['2026-09-30', '2026-10-01']);
    q('.md-n2').value = '9000';
    q('.md-n5').value = '8000';
    const fila = H.buildMadDesovePayload(H.madDesCollect()).rows[0];
    expect([fila[col('Fecha')], fila[col('Fecha N2')], fila[col('Fecha N5')]]).toEqual(['2026-09-30', '2026-09-30', '2026-10-01']);
  });

  it('🔴 editar una la FIJA: deja de seguir al desove y es la que llega a la hoja', () => {
    llenar();
    fechaDesove('2026-09-14');
    q('.md-n2').value = '9000'; q('.md-n5').value = '8000';
    q('.md-fn2').value = '2026-09-18';                 // el conteo se hizo cuatro días después
    H.madDesFechaNFija(q('.md-fn2'));
    expect(q('.md-fn2').getAttribute('data-fijo')).toBe('1');
    expect(q('.md-fn2').style.background, 'la fijada se marca, como los pesos de Tanques').toContain('fef9c3');

    fechaDesove('2026-09-20');                          // mover el desove NO puede pisar la fijada
    expect(q('.md-fn2').value, 'la fijada se pisó').toBe('2026-09-18');
    expect(q('.md-fn5').value, 'la NO fijada tiene que seguir') .toBe('2026-09-21');
    const fila = H.buildMadDesovePayload(H.madDesCollect()).rows[0];
    expect([fila[col('Fecha N2')], fila[col('Fecha N5')]]).toEqual(['2026-09-18', '2026-09-21']);
  });

  it('🔴 devolverla a la de oficio, o vaciarla, la SUELTA y vuelve a seguir', () => {
    llenar();
    fechaDesove('2026-09-14');
    q('.md-fn2').value = '2026-09-18'; H.madDesFechaNFija(q('.md-fn2'));
    q('.md-fn2').value = '2026-09-14'; H.madDesFechaNFija(q('.md-fn2'));   // la de oficio otra vez
    expect(q('.md-fn2').getAttribute('data-fijo')).toBeNull();
    fechaDesove('2026-09-25');
    expect(q('.md-fn2').value, 'soltada, tiene que volver a seguir').toBe('2026-09-25');
  });

  /* Las de oficio están puestas en TODA tarjeta, también en una recién abierta: si contaran como trabajo
     escrito, ✏️ Completar pediría confirmación sobre un formulario en blanco. */
  it('🔴 las fechas de oficio NO cuentan como «hay algo tecleado»; una fijada, sí', () => {
    H.madDesReiniciar();
    expect(H._madDesHayTecleado(), 'una ficha limpia no tiene nada tecleado').toBe(false);
    q('.md-fn2').value = '2026-01-01'; H.madDesFechaNFija(q('.md-fn2'));
    expect(H._madDesHayTecleado(), 'una fecha corregida SÍ es trabajo que se perdería').toBe(true);
    H.madDesReiniciar();
  });

  it('🔴 un BORRADOR del 09-16 (sin los campos) los RECUPERA con su fecha de oficio', () => {
    const panel = document.getElementById('fp-desoves');
    llenar();
    q('.md-n2').value = '9000';
    q('.md-fn2').closest('label').remove();            // como lo guardaba la ficha del 09-16
    q('.md-fn5').closest('label').remove();
    H._madBorrFijarValores(panel);
    localStorage.setItem(H.MAD_BORR_PRE + 'desoves', JSON.stringify({ '2026-09-10': panel.innerHTML }));
    H.madDesReiniciar();
    expect(q('.md-lote').value, 'el fixture ejerce algo: la ficha arranca limpia').toBe('');

    document.getElementById('md-fecha').value = '2026-09-10';
    H.madBorrFechaChange('desoves');
    expect(q('.md-lote').value, 'no se trajo el borrador').toBe('BP');
    expect(q('.md-fn2'), 'el borrador sin campos no los recuperó').not.toBeNull();
    expect(q('.md-fn2').value, 'y tienen que venir con la fecha de oficio').toBe('2026-09-10');
    expect(q('.md-fn5').value).toBe('2026-09-11');
    expect(q('.md-n2').value, 'al devolver las fechas se perdió lo tecleado').toBe('9000');
    const fila = H.buildMadDesovePayload(H.madDesCollect()).rows[0];
    expect([fila[col('Fecha')], fila[col('Fecha N2')], fila[col('Fecha N5')]]).toEqual(['2026-09-10', '2026-09-10', '']);
    localStorage.removeItem(H.MAD_BORR_PRE + 'desoves');
  });

  it('🔴 un BORRADOR anterior al 09-16 conserva sus fechas, y entran FIJADAS', () => {
    const panel = document.getElementById('fp-desoves');
    llenar();
    q('.md-n2').value = '9000';
    q('.md-fn2').value = '2026-09-20';                 // una tecleada de entonces
    q('.md-fn5').closest('label').remove();            // aquella fila tenía otra forma: da igual, se repone
    H._madBorrFijarValores(panel);
    localStorage.setItem(H.MAD_BORR_PRE + 'desoves', JSON.stringify({ '2026-09-10': panel.innerHTML }));
    H.madDesReiniciar();

    document.getElementById('md-fecha').value = '2026-09-10';
    H.madBorrFechaChange('desoves');
    expect(q('.md-fn2').value, 'se perdió la fecha que traía el borrador').toBe('2026-09-20');
    expect(q('.md-fn2').getAttribute('data-fijo'), 'la del borrador tiene que entrar FIJADA, o la pisaría el desove').toBe('1');
    H.madDesFechasNSiguen();
    expect(q('.md-fn2').value, 'entró sin fijar y el repintado la pisó').toBe('2026-09-20');
    const fila = H.buildMadDesovePayload(H.madDesCollect()).rows[0];
    expect(fila[col('Fecha N2')]).toBe('2026-09-20');
    localStorage.removeItem(H.MAD_BORR_PRE + 'desoves');
  });
});

describe('Desoves · no se escribe contra el GAS viejo (hoja por posición)', () => {
  it('el fixture ejerce algo: con el GAS nuevo el desove SE ENVÍA', async () => {
    llenar();
    await H.madDesGuardar();
    expect(envios).toHaveLength(1);
    expect(envios[0].sheetName).toBe(H.MAD_DESOVE_SHEET);
  });

  it('🔴 con el GAS VIEJO no se envía, se dice por qué y lo tecleado se queda', async () => {
    llenar();
    respuestaVer = 'FichasLarv-OK';
    await H.madDesGuardar();
    expect(envios).toHaveLength(0);
    const err = avisos.find((a) => a.tipo === 'err');
    expect(err && err.msg).toMatch(/GAS/);
    expect(q('.md-hnoviables').value).toBe('9');
  });

  /* 🔴 PV3 (2026-09-16) · antes decía «sin respuesta del GAS sigue el camino de siempre» y exigía que el desove
     SALIERA sin saber a qué GAS. Ahora queda en la cola sin salir hasta que el sello se confirme. */
  it('🔴 PV3 · sin respuesta del GAS NO se envía: queda en la cola sin salir', async () => {
    localStorage.removeItem('larv4_syncqueue');
    llenar();
    respuestaVer = 'red';
    await H.madDesGuardar();
    expect(envios).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('larv4_syncqueue') || '[]').map((it) => it.payload.sheetName)).toEqual([H.MAD_DESOVE_SHEET]);
    expect(JSON.parse(localStorage.getItem('larv4_syncqueue'))[0].mark.kind, 'PE1.2: sin su marca el registro no sabe si llegó').toBe('madlog:desoves');
    expect(avisos.filter((a) => a.tipo === 'err')).toEqual([]);
    localStorage.removeItem('larv4_syncqueue');
  });

  it('🔴 la COLA tampoco entrega un desove al GAS viejo', async () => {
    localStorage.setItem('larv4_syncqueue', JSON.stringify([
      { ts: Date.now(), url: 'https://script.google.com/macros/s/AKfycbPRUEBA/exec', payload: { sheetName: H.MAD_DESOVE_SHEET, headers: ['A'], rows: [['x']] } },
    ]));
    respuestaVer = 'FichasLarv-OK';
    await H.flushSyncQueue();
    expect(envios).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('larv4_syncqueue') || '[]')).toHaveLength(1);
    localStorage.removeItem('larv4_syncqueue');
  });
});

describe('Desoves · Despacho es un desplegable de selección múltiple (2026-09-14)', () => {
  it('🔴 ya no hay campo de texto: hay 19 casillas en el orden del usuario', () => {
    expect(q('input.md-desp')).toBeNull();
    const ops = [...document.querySelectorAll('#fp-desoves .md-desp .md-desp-op')].map((c) => c.value);
    expect(ops).toHaveLength(19);
    expect(ops[0]).toBe('Fuentes del Mar');
    expect(ops[18]).toBe('SanLab Eva');
    expect(q('.md-desp-res').textContent).toBe('Elige uno o varios destinos');
  });

  it('🔴 marcar dos destinos los resume y el payload los guarda en el orden de la lista', () => {
    llenar();
    for (const v of ['Mar Bravo M10', 'Mar Bravo M09']) {
      const c = q('.md-desp-op[value="' + v + '"]');
      c.checked = true;
      expect(c.getAttribute('onchange')).toBe('madDesDespachoResumen(this)');
      H.madDesDespachoResumen(c);                                     // el monolito corre sin globales: se llama al manejador
    }
    expect(q('.md-desp-res').textContent).toBe('Mar Bravo M09, Mar Bravo M10');
    const p = H.buildMadDesovePayload(H.madDesCollect());
    expect(p.rows[0][col('Despacho')]).toBe('Mar Bravo M09, Mar Bravo M10');
  });
});

describe('Desoves · pendientes: guardar el N2 hoy y completar el N5 otro día (2026-09-14)', () => {
  const pendientes = () => [...document.querySelectorAll('#md-pend tbody tr')];
  beforeEach(() => { localStorage.removeItem(H.MAD_DES_PEND_KEY); H.setDesHoja(null); respuestaRows = null; H.madDesReiniciar(); });

  it('🔴 el viaje: se guarda con N2, aparece pendiente, se abre, se completa con N5 y sale de la lista', async () => {
    llenar();
    q('.md-huevos').value = '14440';
    q('.md-n2').value = '9000';
    q('.md-desp-op[value="SanLab"]').checked = true;
    await H.madDesGuardar();
    expect(envios).toHaveLength(1);
    expect([envios[0].rows[0][col('Fecha N2')], envios[0].rows[0][col('Fecha N5')]], 'PE1.3: sin N5 aún, su fecha va vacía').toEqual(['2026-09-14', '']);
    expect(pendientes()).toHaveLength(1);
    expect(pendientes()[0].textContent).toContain('este dispositivo');

    const boton = pendientes()[0].querySelector('.md-pend-ed');
    expect(boton.getAttribute('onclick')).toBe('madDesEditar(this.dataset.k)');
    H.madDesEditar(boton.dataset.k);
    expect(document.getElementById('md-edit').textContent).toContain('BP');
    expect(document.getElementById('md-fecha').value).toBe('2026-09-14');
    expect(document.getElementById('md-fecha').readOnly).toBe(true);
    expect(q('.md-lote').readOnly).toBe(true);
    expect(q('.md-cg').readOnly).toBe(true);
    expect(q('.md-n2').value).toBe('9000');
    expect(q('.md-huevos').value).toBe('14440');
    expect(q('.md-desp-op[value="SanLab"]').checked).toBe(true);
    expect(q('.md-desp-res').textContent).toBe('SanLab');

    q('.md-n5').value = '8000';
    q('.md-desp-op[value="Tabasca"]').checked = true;
    await H.madDesGuardar();
    expect(envios).toHaveLength(2);
    const fila = envios[1].rows[0];
    expect([fila[col('Fecha')], fila[col('Lote')], fila[col('Código genético')]]).toEqual(['2026-09-14', 'BP', 'OLF5.F2']);
    expect([fila[col('N2')], fila[col('N5')], fila[col('Despacho')]]).toEqual([9000000, 8000000, 'Tabasca, SanLab']);
    // PE1.3: al completar días después, las fechas siguen saliendo del DESOVE, no del día en que se completa.
    expect([fila[col('Fecha N2')], fila[col('Fecha N5')]]).toEqual(['2026-09-14', '2026-09-15']);
    expect(document.getElementById('md-edit')).toBeNull();            // la ficha vuelve a estar limpia
    expect(pendientes()).toHaveLength(0);
  });

  /* 🔴 PE1.3 (2026-09-17) · el banco destapó este hueco: al abrir ✏️ Completar, una fecha CORREGIDA que llega de
     la hoja tiene que entrar ya FIJADA. Si entrara suelta, parecería bien hasta que algo repintase las fechas y
     se la llevara por delante, y el usuario perdería la corrección sin enterarse. */
  it('🔴 al completar, una fecha ya CORREGIDA entra fijada y no la pisa el repintado', async () => {
    llenar();
    q('.md-n2').value = '9000';
    q('.md-fn2').value = '2026-09-18';                 // el conteo de N2 se hizo cuatro días después
    H.madDesFechaNFija(q('.md-fn2'));
    await H.madDesGuardar();
    expect(envios[0].rows[0][col('Fecha N2')], 'la corregida tiene que haber llegado a la hoja').toBe('2026-09-18');

    H.madDesEditar(pendientes()[0].querySelector('.md-pend-ed').dataset.k);
    expect(q('.md-fn2').value, 'al reabrir se perdió la fecha corregida').toBe('2026-09-18');
    expect(q('.md-fn2').getAttribute('data-fijo'), 'entró suelta: el primer repintado se la lleva').toBe('1');
    H.madDesFechasNSiguen();
    expect(q('.md-fn2').value, 'el repintado pisó la corregida').toBe('2026-09-18');
    expect(q('.md-fn5').value, 'la NO corregida sí tiene que salir del desove').toBe('2026-09-15');
  });

  it('🔴 la hoja trae lo de otros dispositivos; lo completo no aparece y lo local completo se poda', async () => {
    localStorage.setItem(H.MAD_DES_PEND_KEY, JSON.stringify([{ fecha: '2026-09-07', lote: 'BP', codigoGenetico: 'CG2', n5: '9000' }]));
    const base = { Fecha: '2026-09-07', Lote: 'BP', 'Piscina Broodstock': 558, Desoves: 64, 'Total de huevos': 14440000, 'Hembras no viables': '',
      'Fecha N2': '2026-09-08', N2: 9000000, 'Fecha N5': '', N5: '', Despacho: '', Observaciones: '' };
    respuestaRows = { ok: true, headers: MAD_DESOVE_HEADERS, rows: [
      { ...base, 'Código genético': 'OLF5.F2' },
      { ...base, 'Código genético': 'CG2', 'Fecha N5': '2026-09-09', N5: 9000000 },
    ] };
    await H.madDesPendVer();
    expect(pendientes()).toHaveLength(1);
    expect(pendientes()[0].textContent).toContain('OLF5.F2');
    expect(pendientes()[0].textContent).not.toContain('este dispositivo');
    expect(document.getElementById('md-pend-nota').textContent).toContain('Hoja leída');
    expect(JSON.parse(localStorage.getItem(H.MAD_DES_PEND_KEY))).toEqual([]);
  });

  it('🔴 el HISTORIAL de 36 h: cada desove guardado con sus cifras; lo de más de 36 h no se ve y se borra al guardar', async () => {
    const hace = (h) => Date.now() - h * 3600e3;
    localStorage.setItem('larv4_mad_des_log', JSON.stringify([
      { ts: hace(37), fecha: '2026-09-12', filas: 1, estado: 'ok', desoves: [{ lote: 'VIEJO', codigoGenetico: 'X' }] },
      { ts: hace(35), fecha: '2026-09-13', filas: 1, estado: 'ok', desoves: [{ lote: 'RECIENTE', codigoGenetico: 'Y', n2: '100' }] },
    ]));
    H.madDesReiniciar();
    const hist = () => [...document.querySelectorAll('#md-log tr.md-hist')].map((tr) => tr.textContent);
    expect(document.getElementById('md-log').textContent).toContain('últimas 36 h');
    expect(hist()).toHaveLength(1);
    expect(hist()[0]).toContain('RECIENTE');
    llenar();
    q('.md-huevos').value = '14440';
    q('.md-desp-op[value="Tabasca"]').checked = true;
    await H.madDesGuardar();
    expect(hist()).toHaveLength(2);
    expect(hist()[0]).toContain('BP');
    expect(hist()[0]).toContain('OLF5.F2');
    expect(hist()[0]).toContain('14440');
    expect(hist()[0]).toContain('Tabasca');
    expect(JSON.parse(localStorage.getItem('larv4_mad_des_log')).map((e) => e.fecha)).toEqual(['2026-09-13', '2026-09-14']);
    localStorage.removeItem('larv4_mad_des_log');
  });

  it('🔴 si la relectura FALLA no se enseña la hoja anterior como actual: sólo lo de este dispositivo', async () => {
    respuestaRows = { ok: true, headers: MAD_DESOVE_HEADERS, rows: [{ Fecha: '2026-09-07', Lote: 'BP', 'Código genético': 'OLF5.F2', N5: '' }] };
    await H.madDesPendVer();
    expect(pendientes()).toHaveLength(1);
    respuestaRows = 'red';
    await H.madDesPendVer();
    expect(document.getElementById('md-pend-nota').textContent).toContain('No se pudo leer la hoja');
    expect(pendientes()).toHaveLength(0);
  });
});
