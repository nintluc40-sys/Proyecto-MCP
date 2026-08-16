// @vitest-environment happy-dom
// Auditoría definitiva · Microbiología · Escape cierra TODOS los modales de la vista.
//
// `makeAccessibleDialog` (src/ui/modal.js) da semántica de diálogo y atrapa el foco, pero a
// propósito NO cablea Escape: eso lo hace cada vista. Microbiología lo hacía en una lista
// escrita a mano y `closePdfModal` se quedó fuera — medido: Escape cerraba el modal de Excel
// y dejaba el de PDF abierto, con el foco atrapado dentro, mientras esos mismos cierres
// quitaban `body.modal-open` y devolvían el scroll al fondo.
//
// Este test recorre los ONCE modales para que el próximo que se añada no pueda quedarse
// fuera de la lista en silencio.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const M = (o) => ({ _SheetOrigin: 'Microbiología', ...o });
const A = (o) => ({ _SheetOrigin: 'Calidad de Agua', ...o });
const BASE = { 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura' };
const ROWS = [
  M({ ...BASE, Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo/Sala': '1', 'TQ/N°': '1', 'V.Verdes UFC': '9000' }),
  M({ ...BASE, 'Fecha muestreo': '06/06/2026', Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo/Sala': '1', 'TQ/N°': '2', 'V.Verdes UFC': '120' }),
  A({ ...BASE, Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo': '1', 'TQ/N°': '1', pH: '4.0', Alcalinidad: '130' }),
  A({ ...BASE, 'Fecha muestreo': '06/06/2026', Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo': '1', 'TQ/N°': '2', pH: '8.0', Alcalinidad: '130' }),
];

let root, errSpy;
beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
  store.globalData = ROWS;
  microbiologiaView(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

const sub = (k) => { const b = root.querySelector(`[data-mic-sub="${k}"]`); if (b && !b.classList.contains('is-active')) b.click(); };
const clic = (sel) => { const el = root.querySelector(sel); if (!el) throw new Error(`no existe el disparador ${sel}`); el.click(); };
const escape = () => root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

// [id del modal, cómo llegar y abrirlo]
const MODALES = [
  ['micAlertModal', () => { sub('bacteriologia'); clic('[data-mic-alerts]'); }],
  ['micXlsxModal', () => { sub('bacteriologia'); clic('[data-mic-ap="petri"]'); clic('[data-mic-xlsx]'); }],
  ['micPdfModal', () => { sub('bacteriologia'); clic('[data-mic-ap="petri"]'); clic('[data-mic-pdf]'); }],
  ['micFactModal', () => { sub('bacteriologia'); clic('[data-mic-factors]'); }],
  ['calAlertModal', () => { sub('calidad'); clic('[data-cal-alerts]'); }],
  ['calKpiModal', () => { sub('calidad'); clic('[data-cal-kpi="muestras"]'); }],
  ['calFactModal', () => { sub('calidad'); clic('[data-cal-factors]'); }],
  ['calTankModal', () => { sub('calidad'); clic('[data-cal-ap="ubicacion"]'); clic('[data-cal-tank]'); }],
  ['calFichaModal', () => { sub('calidad'); clic('[data-cal-ap="ubicacion"]'); clic('[data-cal-ficha]'); }],
  ['genDeptoModal', () => { sub('general'); clic('[data-gen-depto]'); }],
  ['genKpiModal', () => { sub('general'); clic('[data-gen-kpi="muestras"]'); }],
];

describe('Microbiología · Escape cierra los 11 modales', () => {
  it('la vista monta exactamente los 11 modales que cubre este test', () => {
    // Si alguien añade un modal nuevo, este test cae y obliga a darlo de alta arriba
    // (y, con ello, en el manejador de Escape).
    const ids = new Set();
    ['general', 'bacteriologia', 'calidad'].forEach((k) => {
      sub(k);
      root.querySelectorAll('.mic-modal[id]').forEach((m) => ids.add(m.id));
      const petri = root.querySelector('[data-mic-ap="petri"]');
      if (petri) { petri.click(); root.querySelectorAll('.mic-modal[id]').forEach((m) => ids.add(m.id)); }
    });
    expect([...ids].sort()).toEqual(MODALES.map(([id]) => id).sort());
  });

  MODALES.forEach(([id, abrir]) => {
    it(`Escape cierra #${id}`, () => {
      abrir();
      const m = root.querySelector(`#${id}`);
      expect(m, `#${id} no está montado`).not.toBeNull();
      expect(m.classList.contains('is-open'), `#${id} no llegó a abrirse`).toBe(true);
      escape();
      expect(m.classList.contains('is-open'), `#${id} sigue abierto tras Escape`).toBe(false);
    });
  });

  it('tras Escape no queda ningún modal abierto ni el fondo bloqueado', () => {
    sub('bacteriologia');
    clic('[data-mic-ap="petri"]');
    clic('[data-mic-pdf]');
    escape();
    expect(root.querySelectorAll('.mic-modal.is-open').length).toBe(0);
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});
