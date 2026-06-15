import { describe, it, expect, vi } from 'vitest';
import { renderCalaguaFicha } from './calagua.render.js';
import { fieldName } from '../lib/ficha-calagua.schema.js';

describe('renderCalaguaFicha', () => {
  const html = renderCalaguaFicha({ modLabel: 'M01', status: 'pending', today: '2026-06-12' });

  it('título y cabecera (Módulo, Fecha, Corrida, N° Siembra)', () => {
    expect(html).toContain('Calidad de Agua');
    expect(html).toContain('value="M01" readonly');
    expect(html).toContain('name="fecha"');
    expect(html).toContain('name="corrida"');
    expect(html).toContain('name="siembra"');
  });

  it('12 filas con e/cm/ep/sc/rc/ob', () => {
    expect((html.match(/class="tqc"/g) || []).length).toBe(12);
    for (const code of ['e', 'cm', 'ep', 'sc', 'rc', 'ob']) {
      expect(html).toContain(`name="${fieldName(code, 0)}"`);
    }
  });

  it('estadío con data-upper y data-agua-est (resync color)', () => {
    expect(html).toMatch(/name="e_0"[^>]*data-upper="1"[^>]*data-agua-est="1"/);
  });

  it('usa el widget de color inyectado (colorSelect)', () => {
    const colorSelect = vi.fn((i) => `<select name="tr_${i}" data-fake></select>`);
    const h = renderCalaguaFicha({ modLabel: 'M01', data: { e_0: 'pl5', tr_0: 'Café' }, colorSelect });
    expect(colorSelect).toHaveBeenCalledWith(0, 'PL5', 'Café'); // estadío en MAYÚSCULAS + valor color
    expect(h).toContain('data-fake');
  });

  it('fallback de color sin inyección: input tr_<i>', () => {
    expect(html).toContain('name="tr_0"');
  });

  it('NO usa handlers inline propios y trae la botonera', () => {
    expect(html).not.toMatch(/on(click|input|change)=/);
    expect(html).toContain('data-action="save"');
    expect(html).toContain('id="sp-calagua"');
  });

  it('rellena y escapa valores guardados', () => {
    const h = renderCalaguaFicha({ modLabel: 'M01', data: { cm_0: '25000', ob_0: '<x>' } });
    expect(h).toContain('value="25000"');
    expect(h).not.toContain('<x>');
  });
});
