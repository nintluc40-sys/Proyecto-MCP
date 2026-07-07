// @vitest-environment happy-dom
// Test de regresión de navegación de la vista Visitante: renderiza con datos
// sintéticos (Larvicultura + Registro_Supervisión + Biomol + Lab_Algas del mismo mes)
// y ejercita navegación de mes, toggle de métrica y las 8 tarjetas de detalle.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null,
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { visitanteView } from './index.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });

function synthData() {
  const rows = [];
  // Larvicultura: 2 corridas (junio 573, mayo 567) para navegación de mes.
  [['573', ['M01', 'M02']], ['567', ['M01']]].forEach(([cor, mods]) => {
    mods.forEach((mod) => {
      ['TQ1', 'TQ2'].forEach((tq, ti) => {
        rows.push(L({ 'Módulo': mod, Corrida: cor, Tanque: tq, Fecha: '01/06/2026', 'Población': String(1000 + ti * 100), 'Estadío': 'Z2', 'Plg (manual)': '150' }));
        rows.push(L({ 'Módulo': mod, Corrida: cor, Tanque: tq, Fecha: '10/06/2026', 'Población': String(800 + ti * 80), 'Estadío': 'PL5', 'Plg (manual)': '160', Deformidad: '3', 'Intestino_Lleno': '90', 'Intestino_Vacio': '5', '% Actividad': '88', 'Estrés': '3', Supervivencia: '85' }));
      });
    });
  });
  // Registro_Supervisión (cobertura + revisiones)
  ['Módulo 1', 'Módulo 2'].forEach((m, i) => {
    rows.push({ _SheetOrigin: 'Registro_Supervision', 'Módulo': m, Corrida: '573', Fecha: '05/06/2026', Supervisor: 'Ana', Observaciones: i ? 'Vigilar, Continuar' : 'Continuar' });
  });
  // Biomol (sanidad + análisis)
  rows.push({ _SheetOrigin: 'Biomol', Corrida: '573', Fecha: '05/06/2026', Lugar: 'Módulo 1', IHHNV: 'Positivo', WSSV: 'Negativo', AHPND: 'Negativo' });
  rows.push({ _SheetOrigin: 'Biomol', Corrida: '573', Fecha: '06/06/2026', Lugar: 'Módulo 2', IHHNV: 'Negativo', WSSV: 'Negativo' });
  // Lab_Algas (bloque microalgas)
  ['M1', 'PBR1'].forEach((sis, i) => {
    rows.push({ _SheetOrigin: 'Lab_Algas', Corrida_Larv: '573', Modulo_Larv: 'M01', Sistema: sis, Fecha: '04/06/2026', Cel_ml: String(20000 + i * 5000), Protozoarios: i ? '6' : '2', Descartado: i ? 'Sí' : 'No', Observaciones: i ? 'revisar' : '' });
  });
  return rows;
}

function click(el) { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }

let errSpy, root;
beforeEach(() => {
  store.role = 'visitante';
  store.currentView = 'visitante';
  store.globalData = synthData();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('Visitante · harness de navegación integral', () => {
  it('render base con navegador de mes, resumen y microalgas', () => {
    visitanteView(root);
    expect(root.querySelector('.vt-view')).toBeTruthy();
    expect(root.querySelector('.vt-metricbar')).toBeTruthy();
    expect(root.textContent).toContain('Resumen del mes');
    expect(root.textContent).toContain('Microalgas');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('toggle Supervivencia ⇄ Población y navegación de mes', () => {
    visitanteView(root);
    click(root.querySelector('[data-vtmetric="pop"]'));
    click(root.querySelector('[data-vtmetric="superv"]'));
    const prev = root.querySelector('[data-vtprev]');
    if (prev && !prev.disabled) click(prev);
    const next = root.querySelector('[data-vtnext]');
    if (next && !next.disabled) click(next);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('abre y cierra el detalle de cada una de las 8 tarjetas del resumen', () => {
    visitanteView(root);
    const keys = ['calidad', 'superv', 'cobertura', 'revisiones', 'sanidad', 'analisis', 'algasCultivos', 'algasSanidad'];
    keys.forEach((k) => {
      const card = root.querySelector(`[data-sum="${k}"]`);
      expect(card, k).toBeTruthy();
      click(card);
      const modal = document.getElementById('vtSumModal');
      expect(modal.style.display, k).toBe('flex');
      expect(document.getElementById('vtSumBody').textContent.length, k).toBeGreaterThan(0);
      click(document.getElementById('vtSumClose'));
      expect(modal.style.display, k).toBe('none');
    });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('cierra el detalle con la tecla Escape', () => {
    visitanteView(root);
    click(root.querySelector('[data-sum="superv"]'));
    expect(document.getElementById('vtSumModal').style.display).toBe('flex');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('vtSumModal').style.display).toBe('none');
    expect(errSpy).not.toHaveBeenCalled();
  });
});
