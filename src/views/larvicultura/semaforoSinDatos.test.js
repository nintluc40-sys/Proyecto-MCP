// @vitest-environment happy-dom
/* Punto 8 de la pauta del 12-11 (usuario: «Gris "Sin datos"») · una franja sin NINGÚN dato que juzgar no es «✅ Normal».
   Las franjas de Diagnóstico, Población y Manejo de agua salían en verde con «Normal» y, en pequeño, «Sin datos de calidad»:
   un tanque sin un solo registro de calidad parecía un tanque sano. Ahora salen en gris, «⚪ … Sin datos», y el verde queda
   para lo que se midió y está bien (el control de abajo). Cifras INVENTADAS (el repo es público). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { larviculturaView } from './index.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const noop = () => {};
const fakeCtx = new Proxy({}, { get: () => noop, set: () => true });
if (typeof globalThis.HTMLCanvasElement !== 'undefined') globalThis.HTMLCanvasElement.prototype.getContext = () => fakeCtx;

const fila = (tq, fecha, v = {}) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '600', Tanque: tq, Fecha: fecha, 'Estadío': 'Z1', ...v });
// sin calidad, sin espuma ni suciedad y sin población: nada que juzgar
const SIN_NADA = [fila('TQ1', '01/10/2026'), fila('TQ1', '02/10/2026', { '% Recambio': '30' })];
// lo mismo, con algo medido y bien
const CON_DATOS = [
  fila('TQ1', '01/10/2026', { 'Población': '1000000' }),
  fila('TQ1', '02/10/2026', { 'Población': '990000', Intestino_Vacio: '2', Deformidad: '1', Retraso: '3', Hongos: '0', No_Viables: '2',
    '% Espuma': '3', '% Suciedad': '4', '% Recambio': '30' }),
];

let root, errSpy;
const setSel = (name, val) => {
  const s = root.querySelector(`[data-filter="${name}"]`);
  const opt = [...s.options].find((o) => o.value === val);
  if (!opt) throw new Error(`sin opción ${val} en ${name}: ${[...s.options].map((o) => o.value)}`);
  [...s.options].forEach((o) => { o.selected = o === opt; o.removeAttribute('selected'); });
  opt.setAttribute('selected', 'selected');
  s.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const abrir = (datos) => {
  store.globalData = datos;
  larviculturaView(root);
  setSel('modulo', 'M01');
  setSel('corrida', '600');
};
const franja = (titulo) => {
  const f = [...root.querySelectorAll('.lq-sem')].find((n) => n.querySelector('.lq-sem-status').textContent.includes(titulo + ':'));
  if (!f) throw new Error('no está la franja ' + titulo);
  return { clase: f.className, estado: f.querySelector('.lq-sem-status').textContent.replace(/\s+/g, ' ').trim(), detalle: f.querySelector('.lq-sem-detail').textContent };
};

beforeEach(() => {
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('punto 8 · Larvicultura: sin ningún dato, la franja es gris «Sin datos», no «✅ Normal»', () => {
  it('🔴 Diagnóstico, Población y Manejo de agua sin nada que juzgar: gris, «⚪ … Sin datos», con su detalle', () => {
    abrir(SIN_NADA);
    const diag = franja('Diagnóstico'), pob = franja('Población'), agua = franja('Manejo de agua');
    for (const f of [diag, pob, agua]) {
      expect(f.clase).toContain('lq-sem-sin');
      expect(f.clase).not.toContain('lq-sem-verde');
      expect(f.estado).toMatch(/^⚪ .+: Sin datos$/);
      expect(f.estado).not.toContain('Normal');
    }
    expect(diag.detalle).toBe('Sin datos de calidad');
    expect(pob.detalle).toBe('Sin población válida');
    expect(agua.detalle, 'el recambio solo no se juzga').toBe('Sin variables de manejo');
  });

  it('control: con datos medidos y en rango, las tres siguen en verde «✅ Normal»', () => {
    abrir(CON_DATOS);
    for (const t of ['Diagnóstico', 'Población', 'Manejo de agua']) {
      const f = franja(t);
      expect(f.clase, t).toContain('lq-sem-verde');
      expect(f.estado, t).toBe(`✅ ${t}: Normal`);
    }
  });

  /* «Sí, "Sin datos" en gris»: la tarjeta de Fisicoquímicos con SÓLO la salinidad (informativa) decía «✓ en rango» en verde. */
  const kpi = () => {
    const k = root.querySelector('.lq-env-kpi');
    if (!k) throw new Error('no está la tarjeta de Fisicoquímicos');
    const d = k.querySelector('.lq-kpi-delta');
    return { borde: k.getAttribute('style'), clase: d.className, texto: d.textContent.trim() };
  };
  it('🔴 Fisicoquímicos con sólo la salinidad: «Sin datos» en gris, no «✓ en rango»', () => {
    abrir([fila('TQ1', '01/10/2026', { Salinidad: '32' })]);
    const k = kpi();
    expect(k.texto).toBe('Sin datos');
    expect(k.clase).toContain('flat');
    expect(k.clase).not.toContain('up');
    expect(k.borde).toContain('border-color:var(--c-border)');
  });
  it('control: con T° y OD en rango, «✓ en rango» en verde; con T° fuera, «⚠ fuera de rango»', () => {
    abrir([fila('TQ1', '01/10/2026', { Salinidad: '32', Temperatura: '31', OD: '6' })]);
    expect(kpi()).toEqual({ borde: expect.stringContaining('border-color:#2E9E5B'), clase: 'lq-kpi-delta up', texto: '✓ en rango' });
    abrir([fila('TQ1', '01/10/2026', { Salinidad: '32', Temperatura: '40', OD: '6' })]);
    expect(kpi()).toEqual({ borde: expect.stringContaining('border-color:#E0413E'), clase: 'lq-kpi-delta down', texto: '⚠ fuera de rango' });
  });

  it('el gris tiene su estilo (si no, la franja saldría sin fondo ni borde), con los tonos neutros del tema (cambian en oscuro)', () => {
    const css = readFileSync(join(process.cwd(), 'src/views/larvicultura/larvicultura.css'), 'utf8');   // happy-dom: import.meta.url no es file:
    expect(css).toMatch(/\.lq-sem-sin\s*\{\s*background: var\(--c-surface-2\); border-color: var\(--c-border\); color: var\(--c-text-soft\); \}/);
  });
});
