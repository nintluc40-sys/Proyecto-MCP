// @vitest-environment happy-dom
/* MADURACIÓN · la pestaña ⚖️ Saldo como RESUMEN (filtro de variables, PDF individual y grupal) y la ficha 📉 de
   mortalidad de hembras en desove y recuperación, en el monolito arrancado entero (2026-09-15). */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_MORT_HEADERS } from './ficha-maduracion-mortdesove.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadSaldo', 'madSaldoRefrescar', 'madResVarsAbrir', 'madResVarsAplicar', 'madResumenPdf', 'MAD_RES_VARS_KEY',
  'madResVarsGrupo', 'madResVarsSync', 'madResVarsTodas',
  'madMortReiniciar', 'madMortCollect', 'buildMadMortPayload', 'madMortGuardar', 'madNaupBaja', 'madMortPctVivo',
  '_gasVersionLocal'];   // 2026-09-16 · el portón compara el SELLO: el fixture usa el de esta app
const H = {};
const avisos = [];
const envios = [];
let respuestaVer = null;
let impreso = null;

const HOJAS = {
  'Maduración Ingreso': [{ Fecha: '2026-01-01', Lote: 'AB', 'Código genético': 'CG1', Sala: 'Sala 1', Tanque: 1, Machos: 20, Hembras: 60 }],
  'Maduración Movimientos': [],
  'Maduración Tanques': [{ Fecha: '2026-01-10', Sala: 'Sala 1', Tanque: 1, 'Machos muertos': 2, 'Hembras muertas': 4, 'Cópulas': 3, Muda: 1 }],
  'Maduración Fin de Ciclo': [],
  'Maduración Mortalidad Desove': [{ Fecha: '2026-01-11', Lote: 'AB', 'Tipo de tanque': 'Desove', 'Hembras que entran': 10, 'Hembras muertas': 1 }],
  'Maduración Sala': [{ Fecha: '2026-01-10', Sala: 'Sala 1', Estado: 'Producción', RAS: 'SI', 'Temperatura 2:00': 28, 'Oxígeno 06:00': 5 }],
  'Maduración Lotes': [{ Fecha: '2026-01-05', Lote: 'AB', Desoves: 4, 'Total de huevos': 100000, N2: 50000, N5: 40000 }],
  'Maduración Tratamientos': [],
};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
      clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; } };
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
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setResumen=function(v){_madResumen=v;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, globalThis.localStorage, globalThis);
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPost(async (payload) => { envios.push(payload); return true; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.indexOf('p=ver') !== -1) {
      if (respuestaVer === 'red') throw new Error('sin red');
      const cuerpo = typeof respuestaVer === 'string' ? respuestaVer : JSON.stringify(respuestaVer);
      return { ok: true, status: 200, text: async () => cuerpo };
    }
    const m = /sheet=([^&]+)/.exec(u);
    const filas = m && HOJAS[m[1]];
    const cuerpo = filas ? JSON.stringify({ ok: true, headers: [], rows: filas }) : JSON.stringify({ ok: false, error: 'Hoja no permitida' });
    return { ok: true, status: 200, text: async () => cuerpo };
  };
  window.open = () => ({ document: { write: (s) => { impreso = s; }, close() {} } });
});

beforeEach(() => {
  avisos.length = 0;
  envios.length = 0;
  impreso = null;
  respuestaVer = { ok: true, version: H._gasVersionLocal() };   // el GAS desplegado ES el de esta app
});

describe('Saldo · resumen con filtro de variables y PDF', () => {
  const cuerpo = () => document.getElementById('ms-body');
  beforeEach(() => { localStorage.removeItem(H.MAD_RES_VARS_KEY); document.getElementById('fp-saldo').innerHTML = ''; H.renderMadSaldo(); });

  it('🔴 Recalcular lee todas las fichas y pinta salas, lotes, desoves y el detalle del libro', async () => {
    await H.madSaldoRefrescar();
    const t = cuerpo().textContent;
    expect(t).toContain('Sala 1');
    expect(t).toContain('Lote AB');
    expect(t).toContain('Mortalidad ♀ en desove');
    expect(t).toContain('10%');                          // 1 de 10 hembras en desove
    expect(t).toContain('Nauplios/Hembra');
    expect(t).toContain('10.000');                       // 40000 N5 ÷ 4 desoves
    expect(t).toContain('Detalle del libro');
    expect(cuerpo().querySelectorAll('.ms-card').length).toBe(3);   // Sala 1, Lote AB y el RAS
    expect(t).not.toContain('No se pudieron leer');
    // H2: cada variable de la sala dice de qué registro sale.
    const fila = (th) => [...cuerpo().querySelectorAll('tr')].find((tr) => tr.querySelector('th') && tr.querySelector('th').textContent === th);
    for (const th of ['Temperatura', 'Oxígeno', 'Uso del RAS']) expect(fila(th).textContent).toContain('(2026-01-10)');
    /* 2026-09-15 (usuario) · la mortalidad va en DOS filas, la del día y la acumulada, y el
       acumulado dice de qué fecha a qué fecha es. Una sola fila con el total se lee como si
       fuera del día, que es justo lo que el usuario pidió separar. */
    expect(fila('Mortalidad del día'), 'falta la fila del día').toBeTruthy();
    expect(fila('Mortalidad acumulada').textContent, 'el acumulado no dice desde cuándo').toContain('→');
  });

  it('🔴 el filtro se guarda y oculta lo desmarcado; con el GAS viejo Tratamientos no se pide y se dice', async () => {
    respuestaVer = 'FichasLarv-OK';
    await H.madSaldoRefrescar();
    expect(cuerpo().textContent).toContain('Maduración Tratamientos (el GAS publicado aún no la tiene)');
    H.madResVarsAbrir();
    // Una variable de SALA sigue marcada: así la tarjeta de la sala se pinta y se ve que oculta lo desmarcado.
    document.querySelectorAll('#ms-vars .ms-var').forEach((c) => { c.checked = c.value === 'lote-mortalidad' || c.value === 'sala-ras'; });
    H.madResVarsAplicar();
    expect(document.getElementById('ms-vars')).toBeNull();
    expect(JSON.parse(localStorage.getItem(H.MAD_RES_VARS_KEY))['sala-temp']).toBe(false);
    const t = cuerpo().textContent;
    expect(t).toContain('🏠 Salas');
    expect(t).toContain('Uso del RAS');
    expect(t).toContain('Mortalidad');
    expect(t).not.toContain('Temperatura');
    expect(t).not.toContain('Oxígeno');
    expect(t).not.toContain('Nauplios/Hembra');
  });

  it('🔴 la casilla de una FICHA marca o quita todas sus variables, y queda a medias si se toca una suelta', async () => {
    await H.madSaldoRefrescar();
    H.madResVarsAbrir();
    const sets = () => [...document.querySelectorAll('#ms-vars fieldset')];
    const deFicha = (txt) => sets().find((fs) => fs.querySelector('legend').textContent.includes(txt));
    const grupo = (txt) => deFicha(txt).querySelector('.ms-grupo');
    const vars = (txt) => [...deFicha(txt).querySelectorAll('.ms-var')];
    /* Las seis fichas del catálogo, cada una con su casilla. Se cuentan a mano y no con
       MAD_RES_VARS.length: si mañana una ficha se cae del modal por un error de pintura, una cifra
       deducida del propio catálogo caería con ella y la prueba seguiría en verde. */
    expect(sets()).toHaveLength(6);
    expect(sets().map((fs) => fs.querySelector('legend').textContent.replace(/\s*\(toda la ficha\)\s*$/, '').trim()))
      .toEqual(['🏠 Salas', '🦐 Lotes', '🥚 Desoves', '🔬 Revisión de nauplios', '📉 Mortalidad de hembras', '🧪 Tratamientos']);
    expect(grupo('Desoves').getAttribute('onchange')).toBe('madResVarsGrupo(this)');
    expect(vars('Desoves')[0].getAttribute('onchange')).toBe('madResVarsSync()');
    expect(sets().every((fs) => fs.querySelector('.ms-grupo').checked)).toBe(true);   // por defecto, todo marcado
    // Quitar la ficha Desoves entera: sus tres variables se desmarcan y las de Lotes no se tocan.
    grupo('Desoves').checked = false;
    H.madResVarsGrupo(grupo('Desoves'));
    expect(vars('Desoves').map((c) => c.checked)).toEqual([false, false, false]);
    expect(vars('Lotes').every((c) => c.checked)).toBe(true);
    // Volver a marcar una sola: la casilla de la ficha queda a medias.
    vars('Desoves')[1].checked = true;
    H.madResVarsSync();
    expect([grupo('Desoves').checked, grupo('Desoves').indeterminate]).toEqual([false, true]);
    // «Ninguna» deja todas las fichas sin marcar y sin «a medias».
    H.madResVarsTodas(false);
    expect(sets().map((fs) => [fs.querySelector('.ms-grupo').checked, fs.querySelector('.ms-grupo').indeterminate]).flat().some(Boolean)).toBe(false);
    H.madResVarsTodas(true);
    grupo('Desoves').checked = false;
    H.madResVarsGrupo(grupo('Desoves'));
    H.madResVarsAplicar();
    const guardado = JSON.parse(localStorage.getItem(H.MAD_RES_VARS_KEY));
    expect([guardado['des-totales'], guardado['des-nauplios'], guardado['des-fertilidad'], guardado['lote-pesos']]).toEqual([false, false, false, true]);
    expect(Object.keys(guardado)).not.toContain('undefined');   // la casilla de ficha no se guarda como variable
    const t = cuerpo().textContent;
    expect(t).not.toContain('Nauplios/Hembra');
    expect(t).toContain('Peso promedio');
  });

  it('una ficha de lote sola (sólo Mortalidad ♀) sigue pintando la tarjeta del lote', async () => {
    await H.madSaldoRefrescar();
    H.madResVarsAbrir();
    document.querySelectorAll('#ms-vars .ms-var').forEach((c) => { c.checked = c.value === 'mortdes'; });
    H.madResVarsAplicar();
    expect(cuerpo().textContent).toContain('Mortalidad ♀ en desove');
    expect(cuerpo().textContent).not.toContain('🏠 Salas');
    // Sólo «Tratamientos del RAS»: es del RAS, no del lote; no pinta tarjetas de lote vacías.
    H.madResVarsAbrir();
    document.querySelectorAll('#ms-vars .ms-var').forEach((c) => { c.checked = c.value === 'ras-trat'; });
    H.madResVarsAplicar();
    expect(cuerpo().textContent).toContain('💧 RAS');
    expect(cuerpo().textContent).not.toContain('Lote AB');
  });

  it('🔴 PDF individual de un lote sólo lleva ESE lote; el de todo lleva salas y lotes', async () => {
    await H.madSaldoRefrescar();
    const boton = [...cuerpo().querySelectorAll('.ms-pdf')].find((b) => b.dataset.a === 'lote:AB');
    expect(boton.getAttribute('onclick')).toBe('madResumenPdf(this.dataset.a)');
    H.madResumenPdf(boton.dataset.a);
    expect(impreso).toContain('Resumen · Lote AB');
    expect(impreso).not.toContain('🏠 Salas');
    expect(impreso).not.toContain('🖨 PDF');
    H.madResumenPdf('todo');
    expect(impreso).toContain('🏠 Salas');
    expect(impreso).toContain('🦐 Lotes');
  });

  it('sin recalcular, el PDF avisa en vez de imprimir vacío', () => {
    H.setResumen(null);
    H.madResumenPdf('todo');
    expect(impreso).toBeNull();
    expect(avisos.some((a) => /Recalcular/.test(a.msg))).toBe(true);
  });
});

describe('Mortalidad de hembras · la ficha', () => {
  const q = (s) => document.querySelector('#fp-mortdes ' + s);
  beforeEach(() => { H.madMortReiniciar(); });

  it('🔴 el % se ve al teclear y el payload lleva una fila por tipo con cifras', async () => {
    q('#mm-fecha').value = '2026-09-15';
    q('.mm-lote').value = 'bp';
    q('.mm-desove-e').value = '40';
    q('.mm-desove-m').value = '3';
    q('.mm-recuperacion-e').value = '37';
    q('.mm-recuperacion-m').value = '1';
    expect(q('.mm-desove-e').getAttribute('oninput')).toBe('madMortPctVivo(this)');
    H.madMortPctVivo(q('.mm-desove-m'));
    expect([q('.mm-desove-p').textContent, q('.mm-recuperacion-p').textContent]).toEqual(['7.5 %', '2.7 %']);
    await H.madMortGuardar();
    expect(envios).toHaveLength(1);
    const { sheetName, headers, rows } = envios[0];
    expect(sheetName).toBe('Maduración Mortalidad Desove');
    expect(headers).toEqual(MAD_MORT_HEADERS);
    const id = MAD_MORT_HEADERS.indexOf('ID');
    expect(rows.map((f) => [f[1], f[2], f[5], f[id]])).toEqual([['BP', 'Desove', 7.5, '2026-09-15-BP-DESOVE'], ['BP', 'Recuperación', 2.7, '2026-09-15-BP-RECUPERACION']]);
    expect(q('.mm-lote').value).toBe('');
  });

  it('🔴 Inf. Supervisor: título, y la revisión de nauplios de cada lote va en filas propias con lo elegido', async () => {
    expect(document.querySelector('#fp-mortdes .fc-t').textContent).toBe('📋 Maduración · Inf. Supervisor');
    expect([...document.querySelectorAll('#fp-mortdes .mm-naup tbody tr')].map((tr) => tr.cells[0].textContent)).toEqual(['Entrada', 'Lavado', 'Lavado 2', 'Postlavado']);
    expect([...q('.mm-n-entrada-def').options].map((o) => o.value)).toEqual(['', 'Alta', 'Media', 'Baja', 'Ausente']);
    expect([...q('.mm-n-entrada-act').options].map((o) => o.value)).toEqual(['', 'Alta', 'Media', 'Baja']);
    expect([...q('.mm-n-entrada-hon').options].map((o) => o.value)).toEqual(['', 'Ausente', 'Presente']);
    // 2026-09-15 (usuario): dos columnas más al lado de Hongos, categóricas Alta/Media/Baja.
    expect([...q('.mm-n-entrada-fot').options].map((o) => o.value)).toEqual(['', 'Alta', 'Media', 'Baja']);
    expect([...q('.mm-n-entrada-air').options].map((o) => o.value)).toEqual(['', 'Alta', 'Media', 'Baja']);
    q('#mm-fecha').value = '2026-09-15';
    q('.mm-lote').value = 'bp';
    q('.mm-n-lavado2-def').value = 'Baja';
    q('.mm-n-lavado2-act').value = 'Alta';
    q('.mm-n-lavado2-hon').value = 'Presente';
    q('.mm-n-lavado2-fot').value = 'Media';
    q('.mm-n-lavado2-air').value = 'Baja';
    q('.mm-n-lavado2-sal').value = '34.5';
    q('.mm-n-lavado2-tem').value = '29.1';
    q('.mm-n-postlavado-def').value = 'Ausente';
    await H.madMortGuardar();
    expect(envios).toHaveLength(1);
    const c = (h) => MAD_MORT_HEADERS.indexOf(h);
    expect(envios[0].rows.map((f) => [f[c('Lote')], f[c('Tipo de tanque')], f[c('Revisión')], f[c('Deformidad')], f[c('Actividad')], f[c('Hongos')], f[c('Fototropismo')], f[c('Aireación')], f[c('Salinidad')], f[c('Temperatura')], f[c('ID')]])).toEqual([
      ['BP', '', 'Lavado 2', 'Baja', 'Alta', 'Presente', 'Media', 'Baja', 34.5, 29.1, '2026-09-15-BP-NAUP-LAVADO2'],
      ['BP', '', 'Postlavado', 'Ausente', '', '', '', '', '', '', '2026-09-15-BP-NAUP-POSTLAVADO'],
    ]);
    expect(avisos.some((a) => a.msg.includes('Inf. Supervisor registrado'))).toBe(true);
  });

  /* 2026-09-15 (usuario) · «que en las columnas de Salinidad y Temperatura tengan un
     desplazamiento vertical: al llenar la primera fila se pueden editar las demás, y si
     modifico alguna, igual se queda así». Las cuatro revisiones de un mismo lote se miden
     casi siempre con la misma salinidad y la misma temperatura. */
  /* 2026-09-15 (usuario) · la ALCALINIDAD es del DÍA y no de un lote: va fuera de las tarjetas,
     una casilla por área, y escribe una fila propia por cada una con valor. */
  it('🔴 Inf. Supervisor: la alcalinidad del día se recoge por área y va a la hoja', async () => {
    const alc = (area) => document.querySelector('#fp-mortdes .mm-alc[data-area="' + area + '"]');
    expect(alc('RAS'), 'falta la casilla del RAS').toBeTruthy();
    expect([...document.querySelectorAll('#fp-mortdes .mm-alc')].map((e) => e.getAttribute('data-area')))
      .toEqual(['RAS', 'Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5']);

    q('#mm-fecha').value = '2026-09-15';
    alc('RAS').value = '120';
    alc('Sala 3').value = '95.5';
    await H.madMortGuardar();

    const c = (h) => MAD_MORT_HEADERS.indexOf(h);
    expect(envios[0].rows.map((f) => [f[c('Área')], f[c('Alcalinidad')], f[c('ID')]])).toEqual([
      ['RAS', 120, '2026-09-15-ALC-RAS'],
      ['Sala 3', 95.5, '2026-09-15-ALC-S3'],
    ]);
  });

  it('🔴 Inf. Supervisor: salinidad y temperatura BAJAN, y una corregida a mano no se pisa', () => {
    const cifra = (rev, k) => document.querySelector('#fp-mortdes .mm-n-' + rev + '-' + k);
    const columna = (k) => ['entrada', 'lavado', 'lavado2', 'postlavado'].map((r) => cifra(r, k).value);
    const teclear = (rev, k, v) => { const e = cifra(rev, k); e.value = v; H.madNaupBaja(e); };

    expect(cifra('entrada', 'sal').getAttribute('oninput'), 'la salinidad no lleva el asa').toBe('madNaupBaja(this)');
    expect(cifra('entrada', 'tem').getAttribute('oninput')).toBe('madNaupBaja(this)');

    teclear('entrada', 'sal', '34');
    expect(columna('sal')).toEqual(['34', '34', '34', '34']);
    expect(columna('tem'), 'la salinidad se metió en la temperatura').toEqual(['', '', '', '']);

    teclear('lavado2', 'sal', '35');                 // corrección a mano de una fila
    teclear('entrada', 'sal', '33');                 // y se retoca la de arriba
    expect(columna('sal')).toEqual(['33', '33', '35', '33']);
  });

  it('🔴 con el GAS VIEJO no se envía y lo tecleado se queda', async () => {
    q('.mm-lote').value = 'BP';
    q('.mm-desove-e').value = '10';
    q('.mm-desove-m').value = '1';
    respuestaVer = 'FichasLarv-OK';
    await H.madMortGuardar();
    expect(envios).toHaveLength(0);
    expect((avisos.find((a) => a.tipo === 'err') || {}).msg).toMatch(/Mortalidad Desove/);
    expect(q('.mm-lote').value).toBe('BP');
  });

  /* PV3 (2026-09-16) · sin respuesta de ?p=ver no se sabe a qué GAS se escribiría: a la cola, sin salir. */
  it('🔴 PV3 · sin respuesta del GAS no se envía: queda en la cola sin salir', async () => {
    localStorage.removeItem('larv4_syncqueue');
    q('.mm-lote').value = 'BP';
    q('.mm-desove-e').value = '10';
    q('.mm-desove-m').value = '1';
    respuestaVer = 'red';
    await H.madMortGuardar();
    expect(envios).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('larv4_syncqueue') || '[]').map((it) => it.payload.sheetName)).toEqual(['Maduración Mortalidad Desove']);
    expect(avisos.filter((a) => a.tipo === 'err')).toEqual([]);
    localStorage.removeItem('larv4_syncqueue');
  });
});
