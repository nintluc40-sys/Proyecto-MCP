// @vitest-environment happy-dom
/* ============================================================
   LARVICULTURA · LAS SEIS FICHAS, COMO BIOMOL (2026-10-27, usuario, ronda 8 · tarea 2)

   Calidad larvaria, PL Gramo Externo, Parámetros, Población, Calidad de Agua y Despacho: pegar un bloque de Excel,
   seleccionar un rango (rellenarlo con un valor o borrarlo con Supr) y moverse con flechas e Intro. Decisiones del
   usuario: «Como Biomol, completo»; el reparto «Tal como se ve» (cada columna del bloque cae en la MISMA columna de la
   pantalla, y la que no se escribe —nombre del tanque, calculada, Destino— conserva lo suyo); y los números
   «Normalizados y avisados».

   Qué se exige:
   1 · Un bloque se reparte por filas (tanques) y columnas desde la celda donde se pega, y DISPARA los recálculos de
       siempre (las alertas de OD/°C, el total de Población).
   2 · Tal como se ve: las calculadas y el Destino no se escriben, y su columna se consume igual; las filas de más no
       entran, y se dice.
   3 · Los números: «28,4», miles con punto o coma, los dos a la vez, el ambiguo «4.300» por la pista del MISMO pegado y,
       sin ella, como el Excel de Ecuador (decisión del usuario: el navegador no sirve, es-419 frente a Windows es-EC), y lo
       que no es número no se pega (la celda queda como estaba) y se dice.
   4 · El rango: un valor llena las celdas escribibles del rectángulo (normalizado) y Supr las vacía; el Destino, nunca.
   5 · Flechas e Intro saltan las celdas que no se escriben.
   6 · Fuera de las seis fichas no cambia nada.

   Corre el motor ENTERO sobre happy-dom con los módulos de render del MCP (window.__rgLib), como la app.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attachFichaEvents } from '../fichas/ficha-events.js';
import { renderCalidadFicha } from '../fichas/calidad.render.js';
import { renderPlgFicha } from '../fichas/plg.render.js';
import { renderParamsFicha } from '../fichas/params.render.js';
import { renderPoblacionFicha } from '../fichas/poblacion.render.js';
import { renderCalaguaFicha } from '../fichas/calagua.render.js';
import { renderDespachoFicha } from '../fichas/despacho.render.js';
import { resolveCalidadData } from '../fichas/calidad.data.js';
import { resolvePlgData } from '../fichas/plg.data.js';
import { resolveParamsData } from '../fichas/params.data.js';
import { resolvePoblacionData } from '../fichas/poblacion.data.js';
import { resolveCalaguaData } from '../fichas/calagua.data.js';
import { resolveDespachoData } from '../fichas/despacho.data.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const MOTOR = ['upInp', 'rcPob', 'chkParam', 'rcDespSv', 'rcDespBiomasa', 'rcDespDensidad', 'onTqNameChange',
  'aguaSyncRowColor', 'destMsSync'];
const EXPORTAR = ['renderFicha', '_stdNumPegado', '_stdConvencion', '_stdCelda', 'renderMadSalas', 'saveCS', ...MOTOR];
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
  /* happy-dom no implementa `tbody.rows` (medido el 2026-10-27; `tr.cells` sí). El navegador sí, y la selección por rangos y
     el pegado de las fichas los usan: se suple aquí, igual que lo da el navegador (las filas hijas del tbody). */
  const sec = window.HTMLTableSectionElement && window.HTMLTableSectionElement.prototype;
  if (sec && !('rows' in sec)) {
    Object.defineProperty(sec, 'rows', { configurable: true, get() { return [...this.children].filter((n) => n.tagName === 'TR'); } });
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro,
    renderCalidadFicha, resolveCalidadData, renderPlgFicha, resolvePlgData, renderParamsFicha, resolveParamsData,
    renderPoblacionFicha, resolvePoblacionData, renderCalaguaFicha, resolveCalaguaData, renderDespachoFicha, resolveDespachoData };

  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);

  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  // La delegación de eventos de las fichas, con las funciones del motor (en la app son globales).
  attachFichaEvents(host, Object.fromEntries(MOTOR.map((n) => [n, H[n]])));
});

beforeEach(() => {
  localStorage.clear();
  avisos.length = 0;
  H.setVista(1, 'params');   // M01
});

const pinta = (f) => { H.renderFicha(f); return document.getElementById('fp-' + f); };
const cel = (f, name) => document.querySelector('#fp-' + f + ' [name="' + name + '"]');
/** Un pegado de verdad: el evento llega al documento (la selección en captura y el pegado de las fichas en burbuja). */
const pegar = (el, texto) => {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: { getData: () => texto } });
  el.dispatchEvent(ev);
  return ev;
};
const tecla = (el, key, extra) => {
  el.focus();
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  el.dispatchEvent(ev);
  return ev;
};
const raton = (el, shiftKey) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, shiftKey, buttons: 1 }));

describe('Larvicultura · las seis fichas · pegar un bloque', () => {
  it('Parámetros: el bloque se reparte por tanques y horas, con los decimales con coma, y salta la alerta de OD/°C', () => {
    pinta('params');
    const ev = pegar(cel('params', 'od_0_02:00'), '5,2\t28,4\t12\t29\n6.1\t27.9\t4\t41');
    expect(ev.defaultPrevented).toBe(true);
    expect(['od_0_02:00', 'tc_0_02:00', 'od_0_04:00', 'tc_0_04:00', 'od_1_02:00', 'tc_1_02:00', 'od_1_04:00', 'tc_1_04:00']
      .map((n) => cel('params', n).value)).toEqual(['5.2', '28.4', '12', '29', '6.1', '27.9', '4', '41']);
    // los recálculos de siempre: la alerta (chkParam) llega por el «input» que dispara el pegado
    expect(cel('params', 'od_0_04:00').classList.contains('pinp-alert')).toBe(true);   // OD 12 > 10
    expect(cel('params', 'tc_1_04:00').classList.contains('pinp-alert')).toBe(true);   // 41 °C > 40
    expect(cel('params', 'od_0_02:00').classList.contains('pinp-alert')).toBe(false);
    expect(avisos.at(-1)).toEqual({ msg: '📋 Pegado en 8 celda(s)', tipo: 'ok' });
  });

  it('las filas de más no entran (y se dice); una celda VACÍA del bloque vacía la suya', () => {
    pinta('params');
    cel('params', 'tc_10_02:00').value = '30';
    pegar(cel('params', 'od_10_02:00'), '5\t\n6\t27\n7\t28\n8\t29');   // tanques 11 y 12 caben; dos filas de más
    expect([cel('params', 'od_10_02:00').value, cel('params', 'tc_10_02:00').value, cel('params', 'od_11_02:00').value])
      .toEqual(['5', '', '6']);
    expect(avisos.at(-1).tipo).toBe('warn');
    expect(avisos.at(-1).msg).toContain('2 fila(s) no caben');
  });

  it('lo que no es un número no se pega: la celda se queda como estaba, y se dice cuántas', () => {
    pinta('params');
    cel('params', 'tc_2_02:00').value = '27';
    pegar(cel('params', 'od_2_02:00'), '5,5\tn/d');
    expect([cel('params', 'od_2_02:00').value, cel('params', 'tc_2_02:00').value]).toEqual(['5.5', '27']);
    expect(avisos.at(-1).msg).toContain('1 no eran números');
  });

  it('🔴 Despacho, «tal como se ve»: las calculadas y el Destino conservan lo suyo y su columna se consume', () => {
    pinta('despacho');
    // e · po · sv · pgm · pg · dc (calc.) · bm (calc.) · cj · de (Destino) · ps
    pegar(cel('despacho', 'e_0'), 'pl10\t4300\t95\t150\t160\t999\t999\t20\tTaura\t55');
    expect(['e_0', 'po_0', 'sv_0', 'pgm_0', 'pg_0', 'cj_0', 'ps_0'].map((n) => cel('despacho', n).value))
      .toEqual(['PL10', '4300', '95', '150', '160', '20', '55']);
    expect(cel('despacho', 'dc_0').value).not.toBe('999');
    expect(cel('despacho', 'bm_0').value).not.toBe('999');
    expect(cel('despacho', 'de_0').value).toBe('');
    expect([...document.querySelectorAll('#fp-despacho tbody tr')[0].querySelectorAll('input[type="checkbox"]')].some((c) => c.checked))
      .toBe(false);
    expect(avisos.at(-1)).toEqual({ msg: '📋 Pegado en 7 celda(s)', tipo: 'ok' });
  });

  it('Población: una columna de poblaciones y el total se recalcula (rcPob)', () => {
    pinta('poblacion');
    // «4.100», el ambiguo, sin pista en el bloque: como el Excel de Ecuador, 4100 (y no depende del idioma del equipo).
    pegar(cel('poblacion', 'po_0'), '4300\n4.100\n3900');
    expect(['po_0', 'po_1', 'po_2'].map((n) => cel('poblacion', n).value)).toEqual(['4300', '4100', '3900']);
    expect(document.getElementById('inp-tot').value).toBe('12300');
  });

  it('🔴 el MISMO pegado decide el ambiguo: «4,300» junto a «28.4» es 4300; junto a «28,4», 4,3', () => {
    pinta('despacho');
    pegar(cel('despacho', 'po_0'), '4,300\t28.4');   // po · sv, un Excel en inglés
    expect([cel('despacho', 'po_0').value, cel('despacho', 'sv_0').value]).toEqual(['4300', '28.4']);
    pegar(cel('despacho', 'po_1'), '4,300\t28,4');   // un Excel en español
    expect([cel('despacho', 'po_1').value, cel('despacho', 'sv_1').value]).toEqual(['4.3', '28.4']);
  });

  it('🔴 Población, tal como se ve: con CS en el tanque 2, su Supervivencia (calculada) no se escribe y el reparto no se corre', () => {
    H.saveCS(1, { si_1: 5000 });
    pinta('poblacion');
    expect(cel('poblacion', 'sv_1').readOnly).toBe(true);   // el fixture ejerce algo
    pegar(cel('poblacion', 'sv_0'), '90\t4300\n91\t4200\n92\t4100');
    expect(['sv_0', 'po_0', 'po_1', 'sv_2', 'po_2'].map((n) => cel('poblacion', n).value)).toEqual(['90', '4300', '4200', '92', '4100']);
    // la calculada NO toma el 91 pegado: la recalcula rcPob con SU población y su CS (4200 / 5000 = 84 %)
    expect(cel('poblacion', 'sv_1').value).toBe('84.00');
  });

  it('Calidad larvaria, PL Gramo Externo y Calidad de Agua también reciben el bloque', () => {
    for (const f of ['calidad', 'plg', 'calagua']) {
      const fp = pinta(f);
      const fila = fp.querySelector('tbody tr');
      const celdas = [...fila.cells].map((td) => td.querySelector('input:not([readonly]):not([type="hidden"]):not([type="checkbox"]), select'))
        .filter(Boolean).filter((x) => x.type === 'number');
      expect(celdas.length, f).toBeGreaterThanOrEqual(2);
      // dos numéricas seguidas en la pantalla: el bloque de dos cae en ellas
      const i = [...fila.cells].findIndex((td) => td.contains(celdas[0]));
      const sigue = fila.cells[i + 1] && fila.cells[i + 1].querySelector('input[type="number"]:not([readonly])');
      pegar(celdas[0], '1,5\t2,5');
      expect(celdas[0].value, f).toBe('1.5');
      if (sigue) expect(sigue.value, f).toBe('2.5');
    }
  });

  it('un número suelto en una celda numérica se normaliza; en una de texto, el pegado es el del navegador', () => {
    pinta('despacho');
    const ev1 = pegar(cel('despacho', 'pgm_0'), '1,25');
    expect([ev1.defaultPrevented, cel('despacho', 'pgm_0').value]).toEqual([true, '1.25']);
    const ev2 = pegar(cel('despacho', 'e_0'), 'pl12');
    expect(ev2.defaultPrevented).toBe(false);
  });
});

describe('Larvicultura · las seis fichas · los números pegados', () => {
  const N = (s, miles) => H._stdNumPegado(s, miles);
  it('coma decimal, miles con punto o coma, los dos a la vez, y el porcentaje', () => {
    expect(N('28,4')).toBe('28.4');
    expect(N('28.4')).toBe('28.4');
    expect(N('2.500.000')).toBe('2500000');
    expect(N('2,500,000')).toBe('2500000');
    expect(N('1.234,5')).toBe('1234.5');
    expect(N('1,234.5')).toBe('1234.5');
    expect(N(' 95% ')).toBe('95');
    expect(N('')).toBe('');
    expect(N('-3,5')).toBe('-3.5');
  });
  it('🔴 el ambiguo «4.300» / «4,300»: sin pista, como el Excel de Ecuador; con la del pegado, la suya', () => {
    expect(N('4.300')).toBe('4300');         // sin pista: «.» de miles
    expect(N('4,300')).toBe('4.3');          //            «,» decimal
    expect(N('4.300', 'es')).toBe('4300');
    expect(N('4,300', 'en')).toBe('4300');   // un pegado en inglés
    expect(N('4.300', 'en')).toBe('4.3');
    expect(N('0.125')).toBe('0.125');        // con cero delante no puede ser de miles
    expect(N('-4.300')).toBe('-4300');
  });
  it('la pista: un número que delata la convención decide todo el pegado; sin ella, o si se contradicen, null', () => {
    const C = (xs) => H._stdConvencion(xs);
    expect(C(['4.300', '28,4'])).toBe('es');
    expect(C(['4,300', '28.4'])).toBe('en');
    expect(C(['1.234,5'])).toBe('es');
    expect(C(['1,234.5'])).toBe('en');
    expect(C(['2.500.000'])).toBe('es');
    expect(C(['2,500,000'])).toBe('en');
    expect(C(['0,125'])).toBe('es');         // con cero delante no es ambiguo: es la decimal
    expect(C(['4.300', '4.100', '12', ''])).toBe(null);
    expect(C(['28,4', '28.4'])).toBe(null);
  });
  it('lo que no es un número da null', () => {
    for (const s of ['n/d', '1.23.4', '12a', '—', '1,2,3']) expect(N(s, '.'), s).toBe(null);
  });
});

describe('Larvicultura · las seis fichas · el rango y Supr', () => {
  it('un valor llena las celdas escribibles del rectángulo (normalizado); el Destino no; Supr las vacía', () => {
    pinta('despacho');
    const a = cel('despacho', 'cj_0'), b = cel('despacho', 'ps_2');   // cj · de (Destino) · ps, tanques 1–3
    raton(a, false);
    raton(b, true);
    const ev = pegar(b, '12,5');
    expect(ev.defaultPrevented).toBe(true);
    // cj es numérica (12.5); ps es texto (lo pegado, tal cual)
    expect(['cj_0', 'cj_1', 'cj_2'].map((n) => cel('despacho', n).value)).toEqual(['12.5', '12.5', '12.5']);
    expect(['ps_0', 'ps_1', 'ps_2'].map((n) => cel('despacho', n).value)).toEqual(['12,5', '12,5', '12,5']);
    expect(['de_0', 'de_1', 'de_2'].map((n) => cel('despacho', n).value)).toEqual(['', '', '']);
    expect(avisos.at(-1)).toEqual({ msg: '📋 Pegado en 6 celda(s)', tipo: 'ok' });
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    expect(['cj_0', 'cj_2', 'ps_1'].map((n) => cel('despacho', n).value)).toEqual(['', '', '']);
  });
});

describe('Larvicultura · las seis fichas · flechas e Intro', () => {
  it('↓ e Intro bajan al mismo campo del tanque siguiente; ↑ sube', () => {
    pinta('params');
    tecla(cel('params', 'od_0_02:00'), 'ArrowDown');
    expect(document.activeElement).toBe(cel('params', 'od_1_02:00'));
    tecla(cel('params', 'od_1_02:00'), 'Enter');
    expect(document.activeElement).toBe(cel('params', 'od_2_02:00'));
    tecla(cel('params', 'od_2_02:00'), 'ArrowUp');
    expect(document.activeElement).toBe(cel('params', 'od_1_02:00'));
  });

  it('🔴 → salta las calculadas y el Destino: de PL/g a Cajas, y de Cajas a Piscina', () => {
    pinta('despacho');
    tecla(cel('despacho', 'pg_0'), 'ArrowRight');
    expect(document.activeElement).toBe(cel('despacho', 'cj_0'));
    tecla(cel('despacho', 'cj_0'), 'ArrowRight');
    expect(document.activeElement).toBe(cel('despacho', 'ps_0'));
    tecla(cel('despacho', 'cj_0'), 'ArrowLeft');
    expect(document.activeElement).toBe(cel('despacho', 'pg_0'));
  });

  it('🔴 ↓ salta la celda calculada del tanque de abajo (la Supervivencia con CS) y sigue al siguiente', () => {
    H.saveCS(1, { si_1: 5000 });
    pinta('poblacion');
    tecla(cel('poblacion', 'sv_0'), 'ArrowDown');
    expect(document.activeElement).toBe(cel('poblacion', 'sv_2'));
    tecla(cel('poblacion', 'sv_2'), 'ArrowUp');
    expect(document.activeElement).toBe(cel('poblacion', 'sv_0'));
  });

  it('en un texto, ← y → sólo cambian de celda con el cursor en el borde', () => {
    pinta('despacho');
    const e = cel('despacho', 'e_0');
    e.value = 'PL10';
    e.focus();
    e.setSelectionRange(2, 2);
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    e.dispatchEvent(ev);
    expect(document.activeElement).toBe(e);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('Larvicultura · las seis fichas · fuera de ellas no cambia nada', () => {
  it('una celda de otra grilla (🏠 Salas) no es de las seis', () => {
    H.setVista(12, 'salas');
    H.renderMadSalas();
    const s = document.querySelector('#fp-salas [name="sg_0_temp_02"]');
    expect(s).not.toBeNull();
    expect(H._stdCelda(s)).toBe(null);
    pinta('params');
    expect(H._stdCelda(cel('params', 'od_0_02:00'))).not.toBe(null);
  });
});
