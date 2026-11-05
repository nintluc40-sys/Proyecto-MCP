// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · INF. SUPERVISOR · 🔬 LAS CINCO VARIABLES BAJAN DESDE ENTRADA (usuario, 2026-11-03)

   PEDIDO: en la Revisión de nauplios, lo elegido en la primera revisión baja a las demás, y cualquiera de las cuatro se puede
   cambiar sin afectar a las otras. Deformidad, Actividad, Hongos, Fototropismo y Aireación.

   DECISIONES DEL USUARIO (no re-preguntar): se envía lo que se ve; una revisión que no se hizo se vacía a mano · cambiar Entrada
   arrastra a las que nadie tocó y no a las corregidas · sólo Entrada baja, también si está vacía y se elige en otra.

   Motor REAL sobre el shell real. ⚠ Tras repintar por innerHTML, happy-dom lee mal `select.value` (ver `elegido`).
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_MORT_HEADERS } from './ficha-maduracion-mortdesove.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madMortReiniciar', 'madMortAddCard', 'madMortCollect', 'madMortBuildRows', 'madNaupBaja', 'madNaupBajaSel', 'madBorrFechaChange', 'MAD_BORR_PRE', '_madBorrFijarValores'];
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
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

const REVS = ['entrada', 'lavado', 'lavado2', 'postlavado'];
const VARIABLES = [['def', 'Baja', 'Media'], ['act', 'Alta', 'Baja'], ['hon', 'Ausente', 'Presente'], ['fot', 'Alta', 'Media'], ['air', 'Media', 'Baja']];
const tarjeta = (i = 0) => document.querySelectorAll('#mm-cards .mm-card')[i];
const celda = (rev, col, card = tarjeta()) => card.querySelector(`.mm-n-${rev}-${col}`);
const columna = (col, card = tarjeta()) => REVS.map((r) => celda(r, col, card).value);
/* Elegir como el usuario: el valor y lo que hace el `onchange` del propio <select>. */
const elegir = (rev, col, v, card = tarjeta()) => {
  const s = celda(rev, col, card);
  s.value = v;
  expect(s.getAttribute('onchange'), 'el <select> no llama a la bajada').toBe('madNaupBajaSel(this)');
  H.madNaupBajaSel(s);
};
const amarilla = (rev, col, card = tarjeta()) => /254,\s*249,\s*195|fef9c3/i.test(celda(rev, col, card).style.background);
const FECHA = '2026-02-10';
const ci = (h) => MAD_MORT_HEADERS.indexOf(h);
/* Lo que declara el HTML: tras un repintado, `.value` no es fiable en happy-dom. */
const elegido = (s) => { const o = s.querySelector('option[selected]'); return o ? o.getAttribute('value') : ''; };

beforeEach(() => {
  localStorage.clear();
  H.madMortReiniciar();
  document.getElementById('mm-fecha').value = FECHA;
  tarjeta().querySelector('.mm-lote').value = 'XA';
  tarjeta().querySelector('.mm-cg').value = 'CG-1';
});

/* 2026-11-05 (pauta A20) · el recuadro de arriba decía «rellena sólo las revisiones hechas», y con la bajada eso ya no basta: quien se fiaba
   de él enviaba cuatro revisiones habiendo hecho una. */
describe('🔬 el recuadro de arriba dice lo mismo que la ficha', () => {
  const recuadro = () => document.querySelector('#fp-mortdes .fc-b > div').textContent;
  it('🔴 dice que lo de Entrada se copia y que hay que vaciar lo no hecho', () => {
    expect(recuadro()).toContain('Revisión de nauplios');
    expect(recuadro()).toContain('lo elegido en Entrada se copia a las demás');
    expect(recuadro()).toContain('vacía las revisiones que no se hayan hecho');
    expect(recuadro()).not.toContain('rellena sólo las revisiones hechas');
  });
});

describe('🔬 lo elegido en Entrada baja', () => {
  VARIABLES.forEach(([col, a]) => {
    it(`🔴 ${col}: baja a las otras tres, y no se mete en ninguna otra columna`, () => {
      elegir('entrada', col, a);
      expect(columna(col)).toEqual([a, a, a, a]);
      VARIABLES.filter(([c]) => c !== col).forEach(([c]) => expect(columna(c), c).toEqual(['', '', '', '']));
      expect(columna('sal')).toEqual(['', '', '', '']);
      expect(columna('tem')).toEqual(['', '', '', '']);
    });
  });

  it('🔴 las cinco celdas de las cuatro revisiones llevan su fila y su columna', () => {
    REVS.forEach((r, i) => VARIABLES.forEach(([c]) => {
      expect(celda(r, c).getAttribute('data-r'), r + c).toBe(String(i));
      expect(celda(r, c).getAttribute('data-c'), r + c).toBe(c);
    }));
  });

  it('🔴 quien llena la ficha lo ve dicho', () => {
    expect(tarjeta().querySelector('.mm-naup-ayuda').textContent).toContain('Entrada se copia a las demás');
  });

  it('🔴 cada lote va por su lado', () => {
    H.madMortAddCard();
    elegir('entrada', 'def', 'Baja', tarjeta(1));
    expect(columna('def', tarjeta(1))).toEqual(['Baja', 'Baja', 'Baja', 'Baja']);
    expect(columna('def', tarjeta(0))).toEqual(['', '', '', '']);
  });
});

describe('🔬 cambiar otra revisión sólo cambia ésa', () => {
  ['lavado', 'lavado2', 'postlavado'].forEach((rev) => {
    it(`🔴 ${rev}: no toca a las demás, ni a las de abajo, y se marca en amarillo`, () => {
      elegir('entrada', 'def', 'Baja');
      elegir(rev, 'def', 'Media');
      expect(columna('def')).toEqual(REVS.map((r) => (r === rev ? 'Media' : 'Baja')));
      expect(amarilla(rev, 'def')).toBe(true);
      REVS.filter((r) => r !== rev).forEach((r) => expect(amarilla(r, 'def'), r).toBe(false));
    });
  });

  it('🔴 cambiar Entrada arrastra a las que nadie tocó, y no a la corregida', () => {
    elegir('entrada', 'act', 'Alta');
    elegir('lavado2', 'act', 'Baja');
    elegir('entrada', 'act', 'Media');
    expect(columna('act')).toEqual(['Media', 'Media', 'Baja', 'Media']);
    expect(amarilla('lavado2', 'act')).toBe(true);
  });

  it('🔴 vaciar Entrada vacía sus copias, y no la corregida', () => {
    elegir('entrada', 'hon', 'Ausente');
    elegir('postlavado', 'hon', 'Presente');
    elegir('entrada', 'hon', '');
    expect(columna('hon')).toEqual(['', '', '', 'Presente']);
  });

  it('🔴 una revisión vaciada a propósito se queda vacía aunque cambie Entrada, y sin amarillo', () => {
    elegir('entrada', 'fot', 'Alta');
    elegir('lavado', 'fot', '');
    expect(amarilla('lavado', 'fot')).toBe(false);
    elegir('entrada', 'fot', 'Media');
    expect(columna('fot')).toEqual(['Media', '', 'Media', 'Media']);
  });
});

describe('🔬 sólo Entrada baja', () => {
  it('🔴 con Entrada vacía, elegir en otra revisión escribe sólo ahí, sin amarillo', () => {
    elegir('lavado', 'air', 'Media');
    expect(columna('air')).toEqual(['', 'Media', '', '']);
    expect(amarilla('lavado', 'air')).toBe(false);
  });

  it('🔴 y Entrada elegida después no pisa lo que ya estaba elegido', () => {
    elegir('lavado', 'air', 'Media');
    elegir('entrada', 'air', 'Baja');
    expect(columna('air')).toEqual(['Baja', 'Media', 'Baja', 'Baja']);
  });

  it('🔴 Salinidad y Temperatura conservan su regla: la primera que se llene baja', () => {
    const teclear = (rev, col, v) => { const e = celda(rev, col); e.value = v; H.madNaupBaja(e); };
    teclear('lavado', 'sal', '34');
    expect(columna('sal')).toEqual(['', '34', '34', '34']);
    expect(columna('tem')).toEqual(['', '', '', '']);
    VARIABLES.forEach(([c]) => expect(columna(c), c).toEqual(['', '', '', '']));
  });
});

describe('🔬 lo que ya estaba no se pisa', () => {
  it('🔴 un valor puesto sin elegirlo —Historial, un borrador— no lo pisa Entrada', () => {
    celda('postlavado', 'def').value = 'Ausente';
    elegir('entrada', 'def', 'Baja');
    expect(columna('def')).toEqual(['Baja', 'Baja', 'Baja', 'Ausente']);
  });
});

describe('🔬 se envía lo que se ve', () => {
  const filas = () => H.madMortBuildRows({ ...H.madMortCollect(), fecha: FECHA });
  const de = (rev) => filas().find((f) => f[ci('Revisión')] === rev);

  it('🔴 las cuatro revisiones, con lo copiado y lo corregido', () => {
    elegir('entrada', 'def', 'Baja');
    elegir('entrada', 'act', 'Alta');
    elegir('lavado2', 'act', 'Media');
    expect(filas().map((f) => f[ci('Revisión')])).toEqual(['Entrada', 'Lavado', 'Lavado 2', 'Postlavado']);
    expect(filas().map((f) => f[ci('Deformidad')])).toEqual(['Baja', 'Baja', 'Baja', 'Baja']);
    expect(filas().map((f) => f[ci('Actividad')])).toEqual(['Alta', 'Alta', 'Media', 'Alta']);
    expect(de('Lavado')[ci('Código genético')]).toBe('CG-1');
  });

  it('🔴 una revisión que no se hizo, vaciada, no se envía', () => {
    elegir('entrada', 'def', 'Baja');
    elegir('postlavado', 'def', '');
    expect(filas().map((f) => f[ci('Revisión')])).toEqual(['Entrada', 'Lavado', 'Lavado 2']);
  });
});

describe('🔬 el borrador', () => {
  const guardar = () => {
    const panel = document.getElementById('fp-mortdes');
    H._madBorrFijarValores(panel);
    localStorage.setItem(H.MAD_BORR_PRE + 'mortdes', JSON.stringify({ '2026-09-10': panel.innerHTML }));
    H.madMortReiniciar();
    document.getElementById('mm-fecha').value = '2026-09-10';
    H.madBorrFechaChange('mortdes');
  };

  it('🔴 un borrador conserva las copias, lo corregido, y que Entrada las siga arrastrando', () => {
    elegir('entrada', 'def', 'Baja');
    elegir('lavado2', 'def', 'Media');
    guardar();
    expect(REVS.map((r) => elegido(celda(r, 'def')))).toEqual(['Baja', 'Baja', 'Media', 'Baja']);
    expect(celda('lavado', 'def').getAttribute('data-de')).toBe('0');
    expect(celda('lavado2', 'def').getAttribute('data-corr')).toBe('1');
    elegir('entrada', 'def', 'Alta');
    expect(celda('lavado', 'def').value).toBe('Alta');
    expect(celda('postlavado', 'def').value).toBe('Alta');
    expect(elegido(celda('lavado2', 'def'))).toBe('Media');
  });

  it('🔴 un borrador de ANTES gana la bajada, y sus valores no se pisan', () => {
    REVS.forEach((r) => VARIABLES.forEach(([c]) => {
      const s = celda(r, c);
      ['data-r', 'data-c', 'onchange'].forEach((a) => s.removeAttribute(a));
    }));
    celda('entrada', 'def').value = 'Baja';
    celda('postlavado', 'def').value = 'Ausente';
    guardar();
    REVS.forEach((r, i) => VARIABLES.forEach(([c]) => {
      expect(celda(r, c).getAttribute('onchange'), r + c).toBe('madNaupBajaSel(this)');
      expect(celda(r, c).getAttribute('data-r'), r + c).toBe(String(i));
      expect(celda(r, c).getAttribute('data-c'), r + c).toBe(c);
    }));
    elegir('entrada', 'def', 'Media');
    expect(celda('lavado', 'def').value).toBe('Media');
    expect(elegido(celda('postlavado', 'def')), 'pisó lo que ya estaba').toBe('Ausente');
  });
});
