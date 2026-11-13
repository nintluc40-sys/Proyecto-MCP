// @vitest-environment happy-dom
/* ============================================================
   LABORATORIO · la coma decimal (punto 2 de la pauta del 2026-11-12)

   Visto en Chrome el 12-11: las celdas de Microbiología, Calidad de Agua y Patología son de TEXTO con teclado decimal, y con
   un teclado en español el decimal es la coma. Todo se leía con `parseFloat`, que corta en la coma: «7,5» era 7 al colorear,
   al calcular el UFC, el Amonio Tóxico y los promedios, y al ENVIAR a la hoja. Sin ningún aviso.
   Decisión del usuario: «Coma y punto» (`_labNum`): un separador suelto es siempre el decimal («1.250» mg/L sigue siendo
   1,25, como hasta hoy); con los dos, el último es el decimal; repetido, de miles. La celda muestra lo tecleado.

   Cada caso compara la COMA con el PUNTO y el fixture se escoge para que la regla vieja diera OTRA cifra (el pH 7,5 está
   dentro del rango 7,5–8,5 y el 7 de antes, fuera). Motor entero sobre el shell real (reference_banco-engine-js).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_labNum', 'micToSci', 'micComputeRecord', 'buildMicPayload', 'MIC_FORMATS', 'micFactorOf', 'micFactorSet', 'loadMicFactors',
  'renderMicNuevo', 'micCalcCell', 'micRowRkey', 'MIC_MOD',
  'buildCalPayload', 'CAL_PARAM_ORDER', 'CAL_FORMATS', 'CAL_FORMAT_KEYS', 'calAmonioTox', '_calAmtoxCongelar', '_calApplyCls',
  '_calReportBody', '_calPdfCols', 'downloadCalPDF', 'saveCalDraft', 'calRangeSet', 'loadCalRanges', 'calFmtRangeSet', 'loadCalFmtRanges',
  'buildPatPayload', '_patAverages', 'PAT_GROUP_KEYS'];
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
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

beforeEach(() => { globalThis.localStorage.clear(); });

describe('La regla «Coma y punto» (_labNum)', () => {
  it.each([
    ['7,5', 7.5], ['7.5', 7.5], ['-0,5', -0.5], [',5', 0.5], ['7,5 mg', 7.5], ['  8 ', 8],
    // un separador SUELTO es siempre decimal: lo que hasta hoy era 1,25 lo sigue siendo, con punto o con coma
    ['1.250', 1.25], ['1,250', 1.25],
    // con los dos, el último es el decimal y el otro el de miles
    ['1.234,5', 1234.5], ['1,234.5', 1234.5], ['1.234.567,8', 1234567.8],
    // repetido, son miles (en grupos de tres)
    ['2.500.000', 2500000], ['2,500,000', 2500000],
    // sin coma ni dos puntos, exactamente lo de antes (parseFloat)
    ['1e3', 1000], ['300+', 300],
  ])('«%s» es %s', (txt, n) => { expect(H._labNum(txt)).toBe(n); });

  it.each([[''], ['abc'], ['1.2.3'], ['1,2.3,4'], ['.'], [null], [undefined]])('«%s» no es un número (NaN, como hasta hoy)', (txt) => {
    expect(Number.isNaN(H._labNum(txt))).toBe(true);
  });

  it('un número ya es un número', () => { expect(H._labNum(12.25)).toBe(12.25); });
});

describe('Microbiología · «7,5» es 7,5 al calcular, al colorear y al enviar', () => {
  const fmtKey = () => Object.keys(H.MIC_FORMATS)[0];
  const rec = (vals) => ({ data: { formato: fmtKey(), ...vals } });

  it('🔴 el registro calculado (crudo y UFC) y la fila que va a la hoja son los mismos con coma que con punto', () => {
    const coma = H.micComputeRecord(rec({ vamar: '7,5', vverd: '2,5' }));
    const punto = H.micComputeRecord(rec({ vamar: '7.5', vverd: '2.5' }));
    expect(coma).toEqual(punto);
    expect(coma.vamar.crudo, 'la coma cortaba el número').toBe(7.5);
    expect(coma.vtot.crudo, 'C. Totales = 7,5 + 2,5').toBe(10);
    expect(H.buildMicPayload([rec({ vamar: '7,5' })]).rows).toEqual(H.buildMicPayload([rec({ vamar: '7.5' })]).rows);
  });

  it('🔴 la notación científica de una celda', () => { expect(H.micToSci('7,5')).toBe(H.micToSci(7.5)); });

  it('🔴 en la grilla: la notación bajo la celda y C. Totales, al teclear', () => {
    H.setVista(H.MIC_MOD, 'micnuevo');
    H.renderMicNuevo();
    const amar = document.querySelector('#fp-micnuevo input[data-param="vamar"]');
    const verd = amar && amar.closest('tr').querySelector('input[data-param="vverd"]');
    expect(amar && verd, 'no está la grilla de Bacteriología').toBeTruthy();
    const teclear = (el, v) => { el.value = v; new Function('micCalcCell', el.getAttribute('oninput')).call(el, H.micCalcCell); };
    teclear(amar, '7,5');
    teclear(verd, '2,5');
    const tr = amar.closest('tr');
    const rkey = H.micRowRkey(tr, amar.dataset.fmt);
    const f = H.micFactorOf(rkey, 'vamar').f || 1;
    expect(amar.parentNode.querySelector('.mic-sci').textContent).toBe(H.micToSci(7.5 * f));
    expect(tr.querySelector('input[data-param="vtot"]').value).toBe('10');
    expect(amar.value, 'la celda muestra lo tecleado').toBe('7,5');
  });

  it('🔴 un factor tecleado con coma en ✖️ Factores', () => {
    H.micFactorSet('larv-animal', 'vamar', 'f', '2,5');
    expect(H.loadMicFactors()['larv-animal'].vamar.f).toBe(2.5);
  });
});

describe('Calidad de Agua · «7,8» es 7,8', () => {
  const conPh = () => H.CAL_FORMAT_KEYS.find((k) => H.CAL_FORMATS[k].params.indexOf('ph') !== -1);

  it('🔴 la fila que va a la hoja (parámetros, Sulfato y Sulfuros)', () => {
    const pk = H.CAL_PARAM_ORDER[0];
    const fila = (v) => H.buildCalPayload([{ data: { [pk]: v[0], sulfato: v[1], sulfuro: v[2] } }]).rows[0];
    const coma = fila(['7,8', '0,25', '1,5']);
    expect(coma).toEqual(fila(['7.8', '0.25', '1.5']));
    expect(coma.slice(-2)).toEqual([0.25, 1.5]);
    expect(coma).toContain(7.8);
  });

  it('🔴 el Amonio Tóxico calculado, y no se «congela» lo que escribió la fórmula', () => {
    const coma = H.calAmonioTox('32,5', '7,8', '28,4', '0,5');
    const punto = H.calAmonioTox('32.5', '7.8', '28.4', '0.5');
    expect(coma).toEqual(punto);
    expect(coma.estado).toBe('ok');
    const escrito = String(Math.round(punto.valor * 10000) / 10000).replace('.', ',');
    expect(H._calAmtoxCongelar({ sal: '32,5', ph: '7,8', temp: '28,4', tan: '0,5', amtox: escrito })).toBe(false);
  });

  it('🔴 el color de la celda: pH «7,5» está DENTRO de 7,5–8,5 (el 7 de antes, fuera)', () => {
    const inp = document.createElement('input');
    inp.dataset.param = 'ph'; inp.dataset.fmt = conPh();
    const color = (v) => { inp.value = v; H._calApplyCls(inp); return inp.className; };
    expect(color('7.5'), 'el fixture tiene que distinguir').not.toBe(color('7'));
    expect(color('7,5')).toBe(color('7.5'));
  });

  it('🔴 el informe y el PDF colorean igual, y una columna con «,5» sale', () => {
    const fk = conPh();
    const draft = { meta: { fechaMuestreo: '2026-11-12' }, sections: { [fk]: { rows: [{ ph: '7,5' }] } } };
    const conPunto = { meta: draft.meta, sections: { [fk]: { rows: [{ ph: '7.5' }] } } };
    expect(H._calReportBody(draft).replace('7,5', '7.5')).toBe(H._calReportBody(conPunto));
    expect(H._calPdfCols(H.CAL_FORMATS[fk], fk, [{ ph: ',5' }]).some((c) => c.key === 'ph'), 'la columna desaparecía').toBe(true);
    const pdf = (d) => { let html = ''; saveDraft(d); window.open = () => ({ document: { write: (h) => { html += h; }, close() {}, title: '' } }); H.downloadCalPDF(); return html; };
    const saveDraft = (d) => H.saveCalDraft(d);
    const clase = (html) => (/<td( class="mic-[vr]")?>7[.,]5<\/td>/.exec(html) || [])[1] || '';
    expect(clase(pdf(draft))).toBe(clase(pdf(conPunto)));
    expect(clase(pdf(draft))).toBe(' class="mic-v"');
  });

  it('🔴 los rangos tecleados con coma (generales y por formato)', () => {
    H.calRangeSet('ph', 'min', '7,5');
    expect(H.loadCalRanges().ph.min).toBe(7.5);
    const fk = conPh();
    H.calFmtRangeSet(fk, 'ph', 'max', '8,5');
    expect(H.loadCalFmtRanges()[fk].ph.max).toBe(8.5);
  });
});

describe('Patología · un peso «1,5» es 1,5', () => {
  it('🔴 la fila que va a la hoja', () => {
    const k = H.PAT_GROUP_KEYS[0];
    const fila = (a, b) => H.buildPatPayload([{ data: { [k]: a, peso: b } }]).rows[0];
    expect(fila('2,5', '1,5')).toEqual(fila('2.5', '1.5'));
    expect(fila('2,5', '1,5')).toContain(1.5);
  });

  it('🔴 el Grado (promedio por columna)', () => {
    expect(H._patAverages([{ peso: '1,5' }, { peso: '2,5' }]).peso, 'antes salía 1,5 = (1 + 2) / 2').toBe(2);
  });
});
