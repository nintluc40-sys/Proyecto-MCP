// @vitest-environment happy-dom
// Test de regresión de navegación de Biología Molecular. La vista depende de D3
// (gráficos SVG). Aquí se stubea D3 con un proxy encadenable para verificar que la
// vista MONTA, cablea sus eventos y navega (filtros, tabs, modales, AUD, fullscreen)
// sin lanzar ni registrar errores. No valida el dibujo (eso requiere D3 real).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub encadenable de D3: cualquier método devuelve el mismo proxy (callable), y se
// coacciona a primitivos (0 / '') para sobrevivir a template-literales y aritmética.
const d3stub = new Proxy(function () {}, {
  get: (_t, prop) => {
    if (prop === Symbol.toPrimitive) return (hint) => (hint === 'string' ? '' : 0);
    if (prop === 'toString' || prop === Symbol.toStringTag) return () => '';
    if (prop === 'valueOf') return () => 0;
    if (prop === Symbol.iterator) return function* () {};
    return d3stub;
  },
  apply: () => d3stub,
});
globalThis.window.d3 = d3stub;
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

import { store } from '../../core/store.js';
import { biomolecularView } from './index.js';

const B = (o) => ({ _SheetOrigin: 'Biomol', ...o });

function synthData() {
  const rows = [];
  const dates = ['02/06/2026', '05/06/2026', '08/06/2026', '10/05/2026'];
  const lugares = ['Módulo 1', 'Módulo 2', 'Sala A'];
  dates.forEach((f, di) => {
    lugares.forEach((lug, li) => {
      rows.push(B({
        Fecha: f, 'Código': `BM-${di}${li}`, Corrida: '573', Piscina: String(50 + li),
        Lugar: lug, Tanque: 'TQ' + (li + 1), 'Estadío': ['PL5', 'M1', 'Reproductores'][li], Sexo: li === 2 ? 'H' : '',
        IHHNV: di % 2 ? 'Positivo' : 'Negativo', WSSV: 'Negativo', BP: 'Negativo',
        'AHPND/EMS': li === 0 ? 'Positivo' : 'Negativo', NHPB: 'Negativo', EHP: 'Negativo',
        Otros: li === 1 ? 'Texcumar' : '',
      }));
    });
  });
  return rows;
}

function click(el) { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function change(el, value) { if (el) { if (value !== undefined) el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); } }

let errSpy, root;
beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'biomolecular';
  store.globalData = synthData();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('Biología Molecular · harness de navegación (D3 stubeado)', () => {
  it('monta con KPIs, filterbar y tabla sin error', () => {
    biomolecularView(root);
    expect(root.querySelector('.biomol')).toBeTruthy();
    expect(document.getElementById('kv-total')).toBeTruthy();
    expect(document.getElementById('kv-total').textContent).toBe('12'); // 4 fechas × 3 lugares
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('filtro de diagnóstico y presets de período', () => {
    biomolecularView(root);
    const diagBtn = root.querySelector('#diag-filter .filter-btn');
    if (diagBtn) { click(diagBtn); click(diagBtn); }
    root.querySelectorAll('.fb-preset').forEach((b) => click(b));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('dropdown de lugares: abrir, todos, ninguno', () => {
    biomolecularView(root);
    click(document.getElementById('lugar-trigger'));
    click(document.getElementById('btn-none-lugares'));
    click(document.getElementById('btn-all-lugares'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modo AUD alterna y restaura', () => {
    biomolecularView(root);
    const aud = document.getElementById('aud-btn');
    click(aud); // activa simulación
    expect(aud.classList.contains('on')).toBe(true);
    click(aud); // restaura
    expect(aud.classList.contains('on')).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Total (desglose Lugar × Mes) abre y cierra', () => {
    biomolecularView(root);
    click(document.getElementById('kpi-total'));
    expect(document.getElementById('total-modal').classList.contains('open')).toBe(true);
    click(document.getElementById('total-modal-close'));
    expect(document.getElementById('total-modal').classList.contains('open')).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal RS (Registro del día): abre, cambia fecha/diagnóstico y cierra', () => {
    biomolecularView(root);
    click(document.getElementById('rsd-btn'));
    expect(document.getElementById('rsd-modal').classList.contains('open')).toBe(true);
    const dsel = document.getElementById('rsd-date');
    if (dsel && dsel.options.length > 1) change(dsel, dsel.options[1].value);
    change(document.getElementById('rsd-diag'), 'IHHNV');
    click(document.getElementById('rsd-modal-close'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Export: abre, ajusta rango, cierra (sin SheetJS solo alerta)', () => {
    biomolecularView(root);
    click(document.getElementById('export-xlsx-btn'));
    expect(document.getElementById('bm-export-modal').classList.contains('open')).toBe(true);
    change(document.getElementById('bm-export-from'), '2026-06-01');
    click(document.getElementById('bm-export-close'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modo AUD permite exportar y avisa de que los datos son simulados', () => {
    biomolecularView(root);
    click(document.getElementById('aud-btn')); // activa simulación (entrenamiento)
    expect(document.getElementById('aud-btn').classList.contains('on')).toBe(true);
    click(document.getElementById('export-xlsx-btn'));
    // El export SÍ está disponible: es material de entrenamiento.
    expect(document.getElementById('bm-export-modal').classList.contains('open')).toBe(true);
    // ...pero el modal avisa de que el archivo será una simulación.
    expect(document.getElementById('bm-export-aud').style.display).not.toBe('none');
    click(document.getElementById('bm-export-close'));
    // Sin AUD el aviso desaparece.
    click(document.getElementById('aud-btn'));
    click(document.getElementById('export-xlsx-btn'));
    expect(document.getElementById('bm-export-aud').style.display).toBe('none');
    click(document.getElementById('bm-export-close'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('el modo AUD sobrevive al re-render y solo se apaga al pulsarlo de nuevo', () => {
    biomolecularView(root);
    click(document.getElementById('aud-btn'));
    const simulado = [...document.querySelectorAll('#table-body tr')].map((tr) => tr.innerHTML);
    biomolecularView(root); // re-render completo (reconstruye RAW desde el store)
    expect(document.getElementById('aud-btn').classList.contains('on')).toBe(true);
    // La simulación es determinista: el re-render reproduce exactamente los mismos resultados.
    expect([...document.querySelectorAll('#table-body tr')].map((tr) => tr.innerHTML)).toEqual(simulado);
    click(document.getElementById('aud-btn')); // segunda pulsación → datos reales
    expect(document.getElementById('aud-btn').classList.contains('on')).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('render sobre un root DESMONTADO se aborta sin tocar el DOM/estado (carrera del import diferido)', () => {
    const detached = document.createElement('div'); // NO se agrega al documento
    expect(() => biomolecularView(detached)).not.toThrow();
    expect(detached.querySelector('.biomol')).toBeFalsy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('el diagnóstico del modal RS sobrevive a un re-render (dropdown ⇄ filtro sincronizados)', () => {
    biomolecularView(root);
    click(document.getElementById('rsd-btn'));
    change(document.getElementById('rsd-diag'), 'WSSV');
    click(document.getElementById('rsd-modal-close'));
    biomolecularView(root); // re-render (mismo dataset) reconstruye el DOM del select
    click(document.getElementById('rsd-btn'));
    expect(document.getElementById('rsd-diag').value).toBe('WSSV'); // no vuelve a "Todos"
    click(document.getElementById('rsd-modal-close'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('un rango de fecha Custom sobrevive a un re-render (inputs no se resetean al rango pleno)', () => {
    biomolecularView(root);
    document.getElementById('date-from').value = '2026-06-02';
    document.getElementById('date-to').value = '2026-06-08';
    click(document.getElementById('apply-date-range')); // datePreset='custom', activeFechas acotado
    biomolecularView(root); // re-render con el MISMO dataset
    expect(document.getElementById('date-from').value).toBe('2026-06-02'); // no cae a 2026-05-10 (min pleno)
    expect(document.getElementById('date-to').value).toBe('2026-06-08');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Reporte comparativo: abre, agrega serie, cambia toggles y cierra', () => {
    biomolecularView(root);
    click(document.getElementById('report-btn'));
    expect(document.getElementById('report-modal').classList.contains('open')).toBe(true);
    click(document.getElementById('add-series-btn'));
    root.querySelectorAll('#report-modal .report-toggle').forEach((b, i) => { if (i < 4) click(b); });
    click(document.getElementById('report-modal-close'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('tabs de Heatmap y granularidad del Calendario, fullscreen', () => {
    biomolecularView(root);
    root.querySelectorAll('#hm-tabs .tab').forEach((t) => click(t));
    root.querySelectorAll('#cal-gran-tabs .tab').forEach((t) => click(t));
    const fs = root.querySelector('.fs-btn');
    if (fs) { click(fs); const ex = document.getElementById('bm-fs-exit'); if (ex) click(ex); }
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('controles del Sankey (modos + reset)', () => {
    biomolecularView(root);
    click(document.getElementById('sankey-mode-btn'));
    click(document.getElementById('sankey-psm-btn'));
    click(document.getElementById('sankey-reset-btn'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('el Escape huérfano de pantalla completa NO apaga el modal-open de otra vista', () => {
    biomolecularView(root);
    const fs = root.querySelector('.fs-btn');
    expect(fs).toBeTruthy();
    click(fs);                                                    // entra en pantalla completa
    expect(document.body.classList.contains('modal-open')).toBe(true);

    // Se ABANDONA la vista sin salir de pantalla completa: el router desmonta el root y
    // limpia modal-open, pero `fsCard` solo se limpia al RE-renderizar Biomol, así que
    // queda apuntando a un nodo desmontado.
    root.remove();
    document.body.classList.remove('modal-open');

    // Otra vista abre SU propio modal y el usuario pulsa Escape.
    document.body.classList.add('modal-open');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // El huérfano no debe apagar el modal-open ajeno: refresh.js lo usa para pausar el
    // auto-refresco, y apagarlo re-renderiza la app bajo un modal todavía visible.
    expect(document.body.classList.contains('modal-open')).toBe(true);
    // Y se auto-neutraliza: una segunda pulsación tampoco hace nada.
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.classList.contains('modal-open')).toBe(true);
    // Tampoco se intenta dibujar sobre el DOM desmontado.
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('en pantalla completa, Escape SIGUE saliendo mientras la tarjeta está montada', () => {
    biomolecularView(root);
    const fs = root.querySelector('.fs-btn');
    click(fs);
    const card = root.querySelector('.is-fs');
    expect(card).toBeTruthy();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector('.is-fs')).toBeFalsy();
    expect(document.body.classList.contains('modal-open')).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });
});
