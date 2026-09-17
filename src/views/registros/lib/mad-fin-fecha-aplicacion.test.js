// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · FIN DE CICLO · la fecha de aplicación del metabisulfito sale por DEFECTO igual que la del registro
   (PE1.6, 2026-09-16, usuario)

   Lo que se vigila en la ficha (la regla de datos la prueban el módulo y su paridad):
   · cada tarjeta —la primera y las de ➕— trae puesta la fecha del registro;
   · al cambiar la fecha del registro, la de aplicación la SIGUE, salvo que alguien la haya cambiado a mano: ésa queda
     FIJADA (data-fijo) y no se pisa; volver a poner la del registro la suelta;
   · el envío lleva la fecha sólo con su dosis;
   · un borrador de antes no traía la marca: su fecha tecleada, distinta de la del registro, se fija al traerlo.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_FIN_HEADERS } from './ficha-maduracion-fin-ciclo.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madFinReiniciar', 'madFinAddCard', 'madFinCollect', 'buildMadFinPayload', 'madFinFechaAplFija', 'madFinFechaAplSigue',
  'madBorrFechaChange', 'MAD_BORR_PRE', '_madBorrFijarValores', 'today'];
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
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

const q = (s) => document.querySelector('#fp-fin ' + s);
const todas = (s) => [...document.querySelectorAll('#fp-fin ' + s)];
/* Cambia la fecha del registro como el usuario: el input ya trae la nueva y salta su onchange entero. */
const cambiarRegistro = (fecha) => {
  const f = document.getElementById('mf-fecha');
  expect(f.getAttribute('onchange'), 'la fecha del registro no avisa a la de aplicación').toBe('madBorrFechaChange(&quot;fin&quot;);madFinFechaAplSigue()'.replace(/&quot;/g, '"'));
  f.value = fecha;
  H.madBorrFechaChange('fin');
  H.madFinFechaAplSigue();
};
const teclear = (el, v) => { el.value = v; H.madFinFechaAplFija(el); };
const col = (h) => MAD_FIN_HEADERS.indexOf(h);

beforeEach(() => {
  localStorage.clear();
  H.madFinReiniciar();
});

describe('Fin de Ciclo · la fecha de aplicación sale por defecto igual que la del registro (PE1.6)', () => {
  it('🔴 la primera tarjeta y las de ➕ traen puesta la fecha del registro', () => {
    expect(q('.mf-mbsf').value).toBe(H.today());
    expect(q('.mf-mbsf').getAttribute('oninput')).toBe('madFinFechaAplFija(this)');
    document.getElementById('mf-fecha').value = '2026-09-10';
    H.madFinAddCard();
    expect(todas('.mf-mbsf').map((e) => e.value)).toEqual([H.today(), '2026-09-10']);
  });

  it('🔴 al cambiar la fecha del registro la de aplicación la SIGUE; la cambiada a mano se queda', () => {
    H.madFinAddCard();
    const [primera, segunda] = todas('.mf-mbsf');
    teclear(segunda, '2026-01-02');
    expect(segunda.getAttribute('data-fijo'), 'la tecleada a mano no quedó fijada').toBe('1');
    expect(primera.getAttribute('data-fijo')).toBeNull();
    /* Mismo día y sin borrador: el panel se conserva, y lo que se mira es la regla de seguir o no. */
    const f = document.getElementById('mf-fecha');
    f.value = '2026-09-20';
    H.madFinFechaAplSigue();
    expect([primera.value, segunda.value]).toEqual(['2026-09-20', '2026-01-02']);
  });

  it('🔴 volver a poner la del registro (o vaciarla) SUELTA la fecha: vuelve a seguir al registro', () => {
    const el = q('.mf-mbsf');
    teclear(el, '2026-01-02');
    expect(el.getAttribute('data-fijo')).toBe('1');
    teclear(el, document.getElementById('mf-fecha').value);
    expect(el.getAttribute('data-fijo')).toBeNull();
    teclear(el, '');
    expect(el.getAttribute('data-fijo')).toBeNull();
  });

  it('una fecha del registro a medio teclear (vacía) no vacía las de aplicación', () => {
    const el = q('.mf-mbsf');
    const antes = el.value;
    document.getElementById('mf-fecha').value = '';
    H.madFinFechaAplSigue();
    expect(el.value).toBe(antes);
  });

  it('🔴 el cambio de fecha REAL (con su borrador) deja la ficha nueva con la fecha nueva en la aplicación', () => {
    cambiarRegistro('2026-09-05');
    expect(document.getElementById('mf-fecha').value).toBe('2026-09-05');
    expect(q('.mf-mbsf').value, 'la tarjeta recién montada se quedó con la fecha de hoy').toBe('2026-09-05');
  });

  it('🔴 el envío lleva la fecha SÓLO con su dosis: la de salida sin dosis no se escribe', () => {
    document.getElementById('mf-fecha').value = '2026-09-08';
    H.madFinFechaAplSigue();
    q('.mf-lote').value = 'AB';
    q('.mf-motivo').value = 'Pedido';
    q('.mf-machos').value = '5';
    let fila = H.buildMadFinPayload(H.madFinCollect()).rows[0];
    expect(fila[col('Fecha aplicación')], 'sin dosis se escribió la fecha de salida').toBe('');
    q('.mf-mbs').value = '12.5';
    fila = H.buildMadFinPayload(H.madFinCollect()).rows[0];
    expect([fila[col('Metabisulfito (kg)')], fila[col('Fecha aplicación')]]).toEqual([12.5, '2026-09-08']);
  });

  it('🔴 un BORRADOR de antes: su fecha tecleada, distinta de la del registro, se FIJA y no la pisa el registro', () => {
    const panel = document.getElementById('fp-fin');
    // Se fabrica como lo guardaba la ficha anterior: la fecha tecleada sin marca, volcada a atributos.
    document.getElementById('mf-fecha').value = '2026-09-10';
    q('.mf-mbsf').value = '2026-09-01';
    q('.mf-mbsf').removeAttribute('oninput');
    H._madBorrFijarValores(panel);
    localStorage.setItem(H.MAD_BORR_PRE + 'fin', JSON.stringify({ '2026-09-10': panel.innerHTML }));
    H.madFinReiniciar();

    cambiarRegistro('2026-09-10');
    expect(q('.mf-mbsf').value, 'el registro pisó la fecha tecleada del borrador').toBe('2026-09-01');
    expect(q('.mf-mbsf').getAttribute('data-fijo')).toBe('1');
  });
});
