// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Calidad de Agua — las columnas «Muestra/Muestras» con sugerencias

   Pedidos del usuario (2026-09-13):
   · «Maduración · Agua de mar»: la columna Muestra, que sugería «Agua de mar», suma
     «Afluente» y «Efluente» con el MISMO comportamiento (se elige o se escribe).

   Cómo viaja: la columna es `txtlist` (input de texto + datalist) y su valor va a la columna
   «Tipo de muestra» de la hoja «Calidad de Agua» como TEXTO. Un valor nuevo no es una
   columna nueva: no toca la hoja, ni el GAS, ni `CAL_PARAM_ORDER`.
   ⚠ El tablero agrupa «Tipo de muestra» con `normTipoMuestra`, que pliega todo lo que empieza
   por «agua» a «Agua»: «Afluente» y «Efluente» NO empiezan así y se ven como tipos propios,
   que es lo que se quiere (son puntos distintos del agua de mar).
   · «Algas»: Muestras suma «Agua Ultrafiltrada»; el formato gana pH, Alcalinidad, S‰, Calcio,
     Magnesio, Potasio, Dureza total, Hierro, Fósforo, Cobre y Manganeso —los MISMOS parámetros
     de los otros formatos: misma etiqueta, unidad y rango— y una columna NUEVA, «Sulfato».

   ⚠⚠ SULFATO ES LA ÚNICA COLUMNA NUEVA DE LA HOJA, y va DETRÁS DE «Lote». La hoja «Calidad de
   Agua» se escribe por POSICIÓN y medida el 2026-09-13 tenía 2081 filas en 47 columnas que
   terminan en «Sesión · Lote». Meterla en `CAL_PARAM_ORDER` correría esas dos columnas (y la
   clave de sesión del upsert) en todas las filas nuevas. Al final, `ensureHeaders` del GAS la
   añade sola en la primera sincronización y el tope `LIMITS.cal.maxCols` (80) la admite.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAL_PARAM_BY_KEY as TABLERO } from '../../microbiologia/calagua.data.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['CAL_FORMATS', 'renderCalNuevo', 'micTypeSet', 'loadCalDraft', 'saveCalDraft',
  'collectCalDraft', 'buildCalPayload', 'CAL_SHEET_HEADERS', 'CAL_SID_COL', 'CAL_PARAMS',
  'CAL_PARAMS_MAD_AGUA', '_calHeadLabel', 'calRangeOf', 'renderCalRangos',
  'saveCalLocal', 'loadCal', 'calSessionKey', 'calEditSession', 'downloadCalPDF'];
const GAS = readFileSync(join(process.cwd(), 'GAS/Code.gs'), 'utf8');
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

const pintar = (fmt) => {
  localStorage.clear();
  H.micTypeSet('cal');
  const d = H.loadCalDraft(); d.activeFmt = fmt; H.saveCalDraft(d);
  H.renderCalNuevo();
};
const celda = (fmt, fila, k) => document.querySelector(`[name="cal_${fmt}_${fila}_${k}"]`);
const opcionesDe = (input) => {
  const dl = input && input.getAttribute('list') ? document.getElementById(input.getAttribute('list')) : null;
  return dl ? [...dl.querySelectorAll('option')].map((o) => o.getAttribute('value')) : null;
};
const col = (nombre) => H.CAL_SHEET_HEADERS.indexOf(nombre);

describe('Calidad de Agua · Maduración · Agua de mar · Muestra', () => {
  const MAR = ['Agua de mar', 'Afluente', 'Efluente'];

  it('🔴 la columna sugiere Agua de mar, Afluente y Efluente, en ese orden', () => {
    const c = H.CAL_FORMATS['mad-mar'].ctx.find((x) => x.k === 'tipoMuestra');
    expect(c.type).toBe('txtlist');
    expect(c.opts).toEqual(MAR);
  });

  it('🔴 y la celda pintada las ofrece de verdad (datalist enlazado)', () => {
    pintar('mad-mar');
    const inp = celda('mad-mar', 1, 'tipoMuestra');
    expect(inp, 'no se pintó la celda Muestra').toBeTruthy();
    expect(opcionesDe(inp)).toEqual(MAR);
  });

  it('sigue admitiendo ESCRIBIR otra muestra', () => {
    pintar('mad-mar');
    const inp = celda('mad-mar', 1, 'tipoMuestra');
    expect(inp.tagName).toBe('INPUT');
    expect(inp.getAttribute('type')).toBe('text');
  });

  it('el viaje: «Efluente» tecleado llega a «Tipo de muestra» del envío', () => {
    pintar('mad-mar');
    celda('mad-mar', 1, 'tipoMuestra').value = 'Efluente';
    celda('mad-mar', 1, 'ph').value = '8';
    const fila = H.collectCalDraft().sections['mad-mar'].rows[0];
    expect(fila.tipoMuestra).toBe('Efluente');
    const p = H.buildCalPayload([{ data: Object.assign({ formato: 'mad-mar', fechaMuestreo: '2026-09-13' }, fila) }]);
    expect(p.rows[0][col('Tipo de muestra')]).toBe('Efluente');
  });
});

describe('Calidad de Agua · Algas · muestras, química y Sulfato', () => {
  const MUESTRAS = ['Funda producción', 'Funda matriz', 'Reservorio PBR', 'Agua Ultrafiltrada'];
  const QUIMICA = ['ph', 'alc', 'sal', 'calcio', 'magnesio', 'potasio', 'dureza', 'hierro', 'fosforo', 'cobre', 'manganeso'];

  it('🔴 Muestras sugiere también «Agua Ultrafiltrada», al final', () => {
    const c = H.CAL_FORMATS.algas.ctx.find((x) => x.k === 'muestras');
    expect(c.type).toBe('txtlist');
    expect(c.opts).toEqual(MUESTRAS);
    pintar('algas');
    expect(opcionesDe(celda('algas', 1, 'muestras'))).toEqual(MUESTRAS);
  });

  it('🔴 el formato lleva la química pedida, en ese orden, luego Sulfato y los cloros', () => {
    expect(H.CAL_FORMATS.algas.params).toEqual([...QUIMICA, 'sulfato', 'cl_libre', 'cl_total', 'cl_comb']);
  });

  it('🔴 los parámetros añadidos son LOS MISMOS de los otros formatos (etiqueta, unidad, rango)', () => {
    QUIMICA.forEach((pk) => {
      expect(H.CAL_PARAMS_MAD_AGUA, pk + ' no existe en los otros formatos').toContain(pk);
      expect(H.calRangeOf(pk, 'algas'), 'rango de ' + pk).toEqual(H.calRangeOf(pk, 'mad'));
    });
    expect(H._calHeadLabel('calcio')).toBe('Calcio (mg/L)');
  });

  it('🔴 Sulfato es un parámetro con su etiqueta y su unidad', () => {
    expect(H.CAL_PARAMS.sulfato && H.CAL_PARAMS.sulfato.l).toBe('Sulfato');
    expect(H._calHeadLabel('sulfato')).toBe('Sulfato (mg/L)');
  });

  it('🔴 la grilla de Algas pinta una celda para cada parámetro nuevo', () => {
    pintar('algas');
    [...QUIMICA, 'sulfato'].forEach((pk) => {
      expect(celda('algas', 1, pk), 'falta la celda ' + pk).toBeTruthy();
    });
  });

  it('🔴🔴 Sulfato va AL FINAL de la hoja: Sesión y Lote no se mueven de sitio', () => {
    const h = H.CAL_SHEET_HEADERS;
    expect(h[h.length - 1]).toBe('Sulfato');
    expect(h.indexOf('Sesión')).toBe(45);   // medido en la hoja de producción el 2026-09-13
    expect(h.indexOf('Lote')).toBe(46);
    expect(H.CAL_SID_COL).toBe(45);
    expect(h.filter((x) => x === 'Sulfato')).toHaveLength(1);
  });

  it('🔴 el viaje: lo tecleado en Algas llega a su columna, Sulfato incluido', () => {
    pintar('algas');
    celda('algas', 1, 'muestras').value = 'Agua Ultrafiltrada';
    celda('algas', 1, 'ph').value = '7.9';
    celda('algas', 1, 'magnesio').value = '1300';
    celda('algas', 1, 'sulfato').value = '2400';
    celda('algas', 1, 'cl_libre').value = '0.2';
    const fila = H.collectCalDraft().sections.algas.rows[0];
    const p = H.buildCalPayload([{ data: Object.assign({ formato: 'algas', fechaMuestreo: '2026-09-13', sid: 's1', lote: 'L7' }, fila) }]);
    const r = p.rows[0];
    expect(r).toHaveLength(p.headers.length);
    expect(r[col('Muestras')]).toBe('Agua Ultrafiltrada');
    expect(r[col('pH')]).toBe(7.9);
    expect(r[col('Magnesio')]).toBe(1300);
    expect(r[col('Sulfato')]).toBe(2400);
    expect(r[col('Cloro libre (mg/L)')]).toBe(0.2);
    expect(r[col('Sesión')]).toBe('s1');
    expect(r[col('Lote')]).toBe('L7');
  });

  it('una fila SIN sulfato manda la celda vacía, no un cero', () => {
    const p = H.buildCalPayload([{ data: { formato: 'algas', fechaMuestreo: '2026-09-13', ph: '8' } }]);
    expect(p.rows[0][col('Sulfato')]).toBe('');
  });

  it('el envío cabe en el tope de columnas del GAS', () => {
    const m = GAS.match(/cal:\s*\{\s*maxRows:\s*\d+,\s*maxCols:\s*(\d+)/);
    expect(m, 'no se encontró LIMITS.cal en Code.gs').toBeTruthy();
    expect(H.CAL_SHEET_HEADERS.length).toBeLessThanOrEqual(Number(m[1]));
  });

  it('🔴 el TABLERO conoce cada parámetro que la ficha escribe, con la misma cabecera', () => {
    /* El tablero localiza las columnas por cabecera (`col`). Un parámetro que la ficha manda y
       el tablero no declara llega a la hoja y NUNCA se ve: es justo lo que habría pasado con
       Sulfato. Se barren TODOS los de la ficha (menos los pares antes/después del Ensayo, que
       el tablero lleva en su catálogo aparte). */
    const claves = Object.keys(H.CAL_PARAMS).filter((k) => !/_(a|d)$/.test(k));
    expect(claves).toContain('sulfato');
    claves.forEach((k) => {
      expect(TABLERO[k], 'el tablero no declara ' + k).toBeTruthy();
      expect(TABLERO[k].col, 'cabecera de ' + k).toBe(H.CAL_PARAMS[k].l);
    });
  });

  it('🔴 en ⚙️ Rangos se le puede poner rango a Sulfato', () => {
    let fp = document.getElementById('fp-micfact');
    if (!fp) { fp = document.createElement('div'); fp.id = 'fp-micfact'; document.body.appendChild(fp); }
    H.renderCalRangos();
    expect(fp.textContent).toContain('Sulfato');
    expect(fp.querySelector('[onchange*="calRangeSet(\'sulfato\'"]')).toBeTruthy();
  });
});

/* 🔎 AUDITORÍA (2026-09-13, después del push). Las pruebas de arriba cubrían pintar, recoger y
   enviar; quedaban dos caminos que también tocan las columnas nuevas y que nadie ejercía:
   GUARDAR → volver a abrir la sesión desde el Historial (si no se restaurara, re-guardar
   borraría Sulfato y la muestra), y el PDF del análisis. */
describe('Calidad de Agua · Algas · lo guardado se reabre y se imprime entero', () => {
  const guardarAlgas = () => {
    pintar('algas');
    /* ⚠ happy-dom no respeta `selected` dentro de un <optgroup> y devuelve otra opción; en Chrome
       el desplegable sí muestra «Algas» (visto en captura). Se fija como lo vería el navegador. */
    document.getElementById('cal-fmt-sel').value = 'algas';
    document.getElementById('cal-resp').value = 'Analista QA';
    celda('algas', 1, 'muestras').value = 'Agua Ultrafiltrada';
    celda('algas', 1, 'ph').value = '7.9';
    celda('algas', 1, 'sulfato').value = '2400';
    celda('algas', 1, 'cl_libre').value = '0.2';
    expect(H.saveCalLocal()).toBe(1);
    return H.calSessionKey(H.loadCal()[0].data);
  };

  it('🔎 editar la sesión guardada devuelve Sulfato, la química y la muestra a su celda', () => {
    const k = guardarAlgas();
    document.getElementById('cal-resp').value = '';
    H.calEditSession(k);
    expect(celda('algas', 1, 'muestras').value).toBe('Agua Ultrafiltrada');
    expect(celda('algas', 1, 'ph').value).toBe('7.9');
    expect(celda('algas', 1, 'sulfato').value).toBe('2400');
    expect(celda('algas', 1, 'cl_libre').value).toBe('0.2');
  });

  it('🔎 el PDF del análisis lleva la columna Sulfato con su valor', () => {
    guardarAlgas();
    let html = '';
    const abrir = window.open;
    window.open = () => ({ document: { write(s) { html += s; }, close() {}, title: '' }, focus() {}, print() {} });
    try { H.downloadCalPDF(); } finally { window.open = abrir; }
    expect(html).toContain('Sulfato');
    expect(html).toContain('2400');
    expect(html).toContain('Agua Ultrafiltrada');
  });
});
