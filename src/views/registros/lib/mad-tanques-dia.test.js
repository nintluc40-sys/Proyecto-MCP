// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES · 📊 PARTES DEL DÍA · TODAS LAS SALAS (usuario, 2026-10-13, punto 1)

   «Cuando se estime el ver vivos, debajo de la tabla con el registro por tanque, se genere una tabla donde se pueda
   verificar el total de muertos (machos y hembras), cópulas, muda: el registro de cada parte (con su hora), los valores
   registrados y al final la sumatoria, con el fin de que el usuario sepa cuántas veces se envió la información y la
   totalidad realizada en el día. Como el resumen por sala de la ficha de alimentación; todas las salas.»

   Decisiones del usuario (las cuatro recomendadas): sólo lo que está en la HOJA, y lo de este dispositivo sin enviar
   se AVISA aparte (no suma) · las SEIS cifras de la grilla · un 🖨 PDF · la fecha es la de la grilla.
   🔑 Sale de las MISMAS filas que el libro acaba de leer con 🔄 Ver vivos: ninguna lectura más.

   Datos INVENTADOS: las pruebas no llevan valores reales.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'madTanquesSalaChange', 'madTanquesFechaChange', 'madTanquesVerVivos', 'saveMadTanquesGrid',
  'madTqPartesDelDia', 'madTqDiaPdf', 'loadMad', 'MAD_MOD', 'today', '_gasVersionLocal'];
const H = {};
const avisos = [];
let tanques = [];            // «Maduración Tanques» tal como la devuelve ?p=rows
let tanquesFalla = false;

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
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}'
    + '\ntry{ H.olvidarLectura=function(){ _madTqDiaLeido=0; _madTqDiaAviso=""; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.indexOf('p=ver') !== -1) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    }
    if (u.indexOf('p=rows') !== -1) {
      const hoja = decodeURIComponent((/[?&]sheet=([^&]*)/.exec(u) || [])[1] || '');
      if (hoja === 'Maduración Tanques' && tanquesFalla) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, error: 'Error al leer la hoja' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: hoja === 'Maduración Tanques' ? tanques : [] }) };
    }
    throw new Error('fetch inesperado: ' + u);
  };
});

/** Una fila de la hoja, objeto por cabecera; lo que no se dice, vacío (= 0). */
const fila = (fecha, sala, tanque, hora, parte, c = {}) => Object.assign({ Fecha: fecha, Sala: sala, Tanque: tanque, Hora: hora, Parte: parte,
  'Machos muertos': '', 'Hembras muertas': '', 'Machos muertos por descarte de selección': '', 'Hembras muertas por descarte de selección': '',
  'Cópulas': '', 'Muda': '' }, c);
const irASala = (s) => { document.getElementById('mad-tanques-sala').value = s; H.madTanquesSalaChange(); };
const caja = () => document.getElementById('tq-dia');
const texto = () => (caja() ? caja().textContent.replace(/\s+/g, ' ') : '');
const DIA = () => H.today();
/** Un día con dos salas: Sala 5 con dos partes (06:30 y 16:05), Sala 1 con uno, y un parte de OTRO día que no entra. */
const DIA_TIPO = () => [
  fila(DIA(), 'Sala 5', 7, '16:05', 2, { 'Hembras muertas': 1, 'Cópulas': 8 }),
  fila(DIA(), 'Sala 5', 7, '06:30', 1, { 'Hembras muertas': 3, 'Cópulas': 12, 'Muda': 2 }),
  fila(DIA(), 'Sala 5', 9, '06:30', 1, { 'Machos muertos': 1, 'Hembras muertas por descarte de selección': 2 }),
  fila(DIA(), 'Sala 1', 3, '06:40', 1, { 'Hembras muertas': '2', 'Machos muertos por descarte de selección': 1 }),
  fila('2026-01-01', 'Sala 5', 7, '06:30', 1, { 'Hembras muertas': 99 }),
];

beforeEach(() => {
  localStorage.clear();
  avisos.length = 0;
  tanques = []; tanquesFalla = false;
  H.olvidarLectura();   // la lectura de 🔄 Ver vivos es de la SESIÓN: cada prueba empieza sin ninguna
  H.setVista(H.MAD_MOD, 'tanques');
  const fEl = document.getElementById('mad-tanques-fecha');
  if (fEl) fEl.value = H.today();
  H.renderMadTanques();
});
afterEach(() => { H.setVista(null, 'calidad'); });

describe('Tanques · madTqPartesDelDia (la cuenta)', () => {
  it('🔴 agrupa por sala y por parte (hora + parte), ordena por hora y suma las seis cifras (vacío = 0)', () => {
    const R = H.madTqPartesDelDia(DIA_TIPO(), DIA());
    expect(R.salas.map((s) => s.sala)).toEqual(['Sala 1', 'Sala 5']);
    const s5 = R.salas[1];
    expect(s5.partes.map((p) => [p.hora, p.parte, p.tanques])).toEqual([['06:30', '1', 2], ['16:05', '2', 1]]);
    expect(s5.partes[0]).toMatchObject({ mm: 1, hm: 3, md: 0, hd: 2, copulas: 12, muda: 2 });
    expect(s5.total).toMatchObject({ tanques: 3, mm: 1, hm: 4, md: 0, hd: 2, copulas: 20, muda: 2 });
    expect(R.total).toMatchObject({ mm: 1, hm: 6, md: 1, hd: 2, copulas: 20, muda: 2 });
    expect(R.partes).toBe(3);
  });
  it('🔴 sólo la fecha pedida, y las salas en orden NATURAL (Sala 2 antes que Sala 10)', () => {
    const R = H.madTqPartesDelDia([fila(DIA(), 'Sala 10', 1, '06:00', 1), fila(DIA(), 'Sala 2', 1, '06:00', 1)].concat(DIA_TIPO()), DIA());
    expect(R.salas.map((s) => s.sala)).toEqual(['Sala 1', 'Sala 2', 'Sala 5', 'Sala 10']);
    expect(R.total.hm).toBe(6);   // el 99 de otro día no entra
  });
  it('un parte sin hora ni número (filas viejas) va al final de su sala, como uno más', () => {
    const R = H.madTqPartesDelDia([fila(DIA(), 'Sala 1', 2, '', '', { Muda: 1 }), fila(DIA(), 'Sala 1', 3, '06:40', 1)], DIA());
    expect(R.salas[0].partes.map((p) => p.hora)).toEqual(['06:40', '']);
    expect(R.partes).toBe(2);
  });
  it('sin filas de esa fecha, nada', () => {
    expect(H.madTqPartesDelDia(DIA_TIPO(), '2030-01-01')).toMatchObject({ salas: [], partes: 0 });
    expect(H.madTqPartesDelDia(null, DIA())).toMatchObject({ salas: [], partes: 0 });
  });
});

describe('Tanques · 📊 Partes del día en la ficha', () => {
  it('el fixture ejerce algo: antes de 🔄 Ver vivos no hay tabla', () => {
    irASala('Sala 5');
    expect(caja(), 'falta el contenedor bajo la grilla').not.toBeNull();
    expect(caja().innerHTML).toBe('');
  });

  it('🔴 tras 🔄 Ver vivos: cada parte de TODAS las salas con su hora, el total de cada sala y el del día', async () => {
    tanques = DIA_TIPO();
    irASala('Sala 5');
    await H.madTanquesVerVivos();
    const t = texto();
    expect(t).toContain('📊 Partes del día · todas las salas · ' + DIA());
    expect(t).toContain('Total Sala 5 · 2 parte(s)');
    expect(t).toContain('Total Sala 1 · 1 parte(s)');
    expect(t).toContain('Total del día · 3 parte(s)');
    const filas = [...caja().querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    expect(filas[0]).toEqual(['Sala 1', 'P1', '06:40', '1', '0', '2', '1', '0', '0', '0']);
    expect(filas[filas.length - 1]).toEqual(['Total del día · 3 parte(s)', '1', '6', '1', '2', '20', '2']);
    expect(t).toContain('🖨 PDF de los partes del día');
  });

  it('🔴 lo de este dispositivo sin enviar NO entra en la tabla: se avisa aparte, con su sala', async () => {
    tanques = DIA_TIPO();
    irASala('Sala 5');
    document.querySelector('#fp-tanques [name="tg_11_hembras_muertas"]').value = '4';
    H.saveMadTanquesGrid();
    await H.madTanquesVerVivos();
    expect(texto()).toMatch(/📱 Este dispositivo tiene 1 parte\(s\) de esta fecha sin enviar \(Sala 5\): no están en la tabla/);
    expect(texto()).toContain('Total del día · 3 parte(s)');
  });

  it('🔴 sigue a la grilla: otra sala la conserva y otra fecha la recalcula con la misma lectura', async () => {
    tanques = DIA_TIPO();
    irASala('Sala 5');
    await H.madTanquesVerVivos();
    irASala('Sala 1');
    expect(texto()).toContain('Total del día · 3 parte(s)');
    document.getElementById('mad-tanques-fecha').value = '2026-01-01';
    H.madTanquesFechaChange();
    expect(texto()).toContain('📊 Partes del día · todas las salas · 2026-01-01');
    expect(texto()).toContain('Total del día · 1 parte(s)');
  });

  it('🔴 sin la hoja de Tanques no inventa una tabla vacía: lo dice', async () => {
    tanques = DIA_TIPO();
    tanquesFalla = true;
    irASala('Sala 5');
    await H.madTanquesVerVivos();
    expect(texto()).toContain('No se pudo leer la hoja de Tanques');
    expect(texto()).not.toContain('Total del día');
  }, 15000);

  it('🖨 PDF: la misma tabla, sin el botón; sin 🔄 Ver vivos, pide leer antes', async () => {
    let escrito = '';
    window.open = () => ({ document: { write: (h) => { escrito += h; }, close: () => {} } });
    H.madTqDiaPdf();
    expect(escrito).toBe('');
    expect(avisos.some((a) => /Ver vivos antes de imprimir/.test(a.msg))).toBe(true);
    tanques = DIA_TIPO();
    irASala('Sala 5');
    await H.madTanquesVerVivos();
    H.madTqDiaPdf();
    expect(escrito).toContain('Maduración · Tanques · Partes del día · ' + DIA());
    expect(escrito).toContain('Total del día</b> · 3 parte(s)');
    expect(escrito).not.toContain('🖨 PDF de los partes del día');
  });
});
