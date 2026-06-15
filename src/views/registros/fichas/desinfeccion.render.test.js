import { describe, it, expect, vi } from 'vitest';
import { renderDesinfeccionFicha } from './desinfeccion.render.js';

// Tipos de prueba (forma de DESINF_TYPES del motor).
const types = [
  { n: 1, label: 'Tanques', cats: [{ key: 'tq', label: 'Tanques', cols: [] }], obsGen: true },
  { n: 2, label: 'Equipos', cats: [{ key: 'eq', label: 'Equipos', cols: ['obs'] }], obsGen: false },
];

describe('renderDesinfeccionFicha', () => {
  const catTable = vi.fn((t, cat) => `<div data-cat="${t.n}-${cat.key}"></div>`);
  const html = renderDesinfeccionFicha({ modLabel: 'M01', types, catTable, status: 'pending', today: '2026-06-13' });

  it('título, cabecera (Módulo/Fecha/Corrida) y select de Tipo', () => {
    expect(html).toContain('🧴 Desinfección');
    expect(html).toContain('value="M01" readonly');
    expect(html).toContain('name="fecha"');
    expect(html).toContain('name="corrida"');
    expect(html).toContain('name="_tipo"');
    expect(html).toContain('Tipo 1 — Tanques');
    expect(html).toContain('Tipo 2 — Equipos');
  });

  it('fecha y tipo se conectan por delegación (data-dx-fecha / data-dx-tipo)', () => {
    expect(html).toContain('data-dx-fecha');
    expect(html).toContain('data-dx-tipo');
  });

  it('reutiliza catTable inyectado por cada categoría de cada tipo', () => {
    expect(catTable).toHaveBeenCalledTimes(2); // 1 cat × 2 tipos
    expect(html).toContain('data-cat="1-tq"');
    expect(html).toContain('data-cat="2-eq"');
  });

  it('muestra el bloque del tipo activo y oculta el resto', () => {
    // _tipo por defecto = "1" → tipo 1 visible (block), tipo 2 oculto (none)
    expect(html).toMatch(/data-tipo="1" style="display:block"/);
    expect(html).toMatch(/data-tipo="2" style="display:none"/);
  });

  it('obsGen solo para tipos que lo declaran', () => {
    expect(html).toContain('name="dx_1_obsgen"'); // tipo 1 obsGen:true
    expect(html).not.toContain('name="dx_2_obsgen"'); // tipo 2 obsGen:false
  });

  it('PDF propio (pdfdesinf) y SIN botón Compartir', () => {
    expect(html).toContain('data-action="pdfdesinf"');
    expect(html).not.toContain('data-action="share"');
    expect(html).toContain('data-action="save"');
    expect(html).toContain('id="sp-desinfeccion"');
  });

  it('respeta el tipo activo guardado en data._tipo', () => {
    const h = renderDesinfeccionFicha({ modLabel: 'M01', types, catTable, data: { _tipo: '2' } });
    expect(h).toMatch(/data-tipo="2" style="display:block"/);
    expect(h).toMatch(/data-tipo="1" style="display:none"/);
  });

  it('NO usa handlers inline', () => {
    expect(html).not.toMatch(/on(click|input|change)=/);
  });
});
