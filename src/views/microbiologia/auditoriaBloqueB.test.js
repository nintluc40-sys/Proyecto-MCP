// @vitest-environment happy-dom
/* ============================================================
   Microbiología · auditoría del 2026-09-25, BLOQUE B (aprobado 2026-10-03)

   · H-003 · los umbrales viven en el NAVEGADOR (`larv4_mic_factors`, `larv4_cal_ranges`): dos equipos podían dar
     semáforos distintos para la misma muestra sin que nada lo dijera. Ahora `umbralesModificados` /
     `rangosModificados` comparan con la base —el Factor (×) de la app de captura NO cuenta: el MCP no lo usa— y la
     vista avisa «⚠️ Umbrales modificados en este equipo (N)» junto a «⚙️ Rangos»; pulsarlo abre ese editor.
     (El aviso de Visitante está en visitante/umbralesPropios.test.js.)
   · H-010 · el Excel de Bacteriología llevaba sólo el «Nivel» de la hoja; la pantalla y el PDF lo recalculan. Ahora
     lleva al final el de la vista: uno por patógeno y el peor de la muestra.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => { ls.set(k, String(v)); },
  removeItem: (k) => { ls.delete(k); },
};

const { store } = await import('../../core/store.js');
const { microbiologiaView } = await import('./index.js');
const { umbralesModificados, loadMicThresholds, MIC_FACTORS_KEY } = await import('./data.js');
const { rangosModificados, CAL_RANGES_KEY, CAL_RANGE_BASE } = await import('./calagua.data.js');

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const M = (o) => ({ _SheetOrigin: 'Microbiología', Corrida: '573', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '1', ...o });
/** Un área y un parámetro REALES de la base, con su límite «l» (sin escribirlo a mano). */
function unUmbralDeBase() {
  ls.clear();
  const efect = loadMicThresholds();
  for (const area of Object.keys(efect)) for (const param of Object.keys(efect[area])) {
    if (efect[area][param] && efect[area][param].l != null) return { area, param, l: efect[area][param].l };
  }
  throw new Error('la base no tiene ningún umbral');
}

let root;
beforeEach(() => {
  ls.clear();
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); delete window.XLSX; ls.clear(); });

describe('H-003 · qué cuenta como «modificado en este equipo»', () => {
  it('sin nada guardado: nada', () => {
    expect(umbralesModificados()).toEqual([]);
    expect(rangosModificados()).toEqual([]);
  });

  it('el Factor (×) de la app de captura NO es un umbral; un valor igual a la base (aunque sea texto) tampoco', () => {
    const u = unUmbralDeBase();
    ls.set(MIC_FACTORS_KEY, JSON.stringify({ [u.area]: { [u.param]: { f: 25, l: String(u.l) } } }));
    expect(umbralesModificados()).toEqual([]);
  });

  it('un límite distinto de la base, sí: con su área, su parámetro y los dos valores', () => {
    const u = unUmbralDeBase();
    ls.set(MIC_FACTORS_KEY, JSON.stringify({ [u.area]: { [u.param]: { f: 25, l: u.l + 1 } } }));
    expect(umbralesModificados()).toEqual([{ area: u.area, param: u.param, campo: 'l', base: u.l, actual: u.l + 1 }]);
  });

  it('Calidad de Agua: un mín distinto y un rango AÑADIDO a un parámetro que en la base no lo tiene', () => {
    expect(CAL_RANGE_BASE.sal).toBeUndefined();
    ls.set(CAL_RANGES_KEY, JSON.stringify({ ph: { min: 7 }, sal: { min: 30, max: 35 } }));
    expect(rangosModificados()).toEqual([
      { param: 'ph', campo: 'min', base: 7.5, actual: 7 },
      { param: 'sal', campo: 'min', base: null, actual: 30 },
      { param: 'sal', campo: 'max', base: null, actual: 35 },
    ]);
  });
});

describe('H-003 · el aviso en Bacteriología', () => {
  const DIA = [M({ 'Fecha muestreo': '05/06/2026', 'V.Amarillos UFC': '100' })];
  const bacteriologia = () => {
    store.globalData = DIA;
    microbiologiaView(root);
    root.querySelector('[data-mic-sub="bacteriologia"]').click();
  };

  it('con los umbrales de base no aparece', () => {
    bacteriologia();
    expect(root.querySelector('.mic-umbral-mod')).toBeNull();
  });

  it('con uno cambiado aparece, dice cuántos y en qué área, y abre el editor ⚙️ Rangos', () => {
    const u = unUmbralDeBase();
    ls.set(MIC_FACTORS_KEY, JSON.stringify({ [u.area]: { [u.param]: { l: u.l + 1 } } }));
    bacteriologia();
    const b = root.querySelector('.mic-umbral-mod');
    expect(b).not.toBeNull();
    expect(b.textContent).toContain('Umbrales modificados en este equipo (1)');
    expect(b.hasAttribute('data-mic-factors')).toBe(true);
    b.click();
    expect(root.querySelector('#micFactModal').classList.contains('is-open')).toBe(true);
  });
});

describe('H-010 · el Excel lleva el nivel de la VISTA al final', () => {
  it('las columnas de la hoja tal cual y, detrás, «<patógeno> · Nivel (vista)» y «Peor nivel (vista)»', () => {
    // La hoja dice «Mínimo» y el UFC, con los umbrales de base, es Elevado: el Excel tiene que poder enseñar los dos.
    store.globalData = [M({ 'Fecha muestreo': '05/06/2026', 'V.Amarillos UFC': '9000000', 'V.Amarillos Nivel': 'Mínimo' })];
    let aoa = null;
    window.XLSX = {
      utils: { aoa_to_sheet: (a) => { aoa = a; return {}; }, book_new: () => ({}), book_append_sheet: () => {} },
      writeFile: () => {},
    };
    microbiologiaView(root);
    root.querySelector('[data-mic-sub="bacteriologia"]').click();
    root.querySelector('[data-mic-ap="petri"]').click();   // el ⬇ Excel vive en la barra de la Placa Petri
    root.querySelector('[data-mic-xlsx]').click();
    root.querySelector('[data-mic-xlsx-go]').click();
    expect(aoa).not.toBeNull();
    const [cab, fila] = aoa;
    const col = (h) => fila[cab.indexOf(h)];
    expect(col('V.Amarillos Nivel'), 'la de la hoja, intacta').toBe('Mínimo');
    expect(cab.slice(-2)).toEqual(['C. Amarillas · Nivel (vista)', 'Peor nivel (vista)']);
    expect(col('C. Amarillas · Nivel (vista)')).toBe('Elevado');
    expect(col('Peor nivel (vista)')).toBe('Elevado');
  });
});
