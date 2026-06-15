import { describe, it, expect } from 'vitest';
import { renderPoblacionFicha } from './poblacion.render.js';
import { csSummary, hasCS } from '../lib/ficha-poblacion.schema.js';

describe('helpers de CS', () => {
  it('csSummary cuenta tanques y suma totales (>0)', () => {
    const cs = { si_0: '100', si_1: '', si_2: '50', si_3: '0' };
    const { count, total } = csSummary(cs);
    expect(count).toBe(3); // si_0, si_2, si_3 no-vacíos (si_1 vacío no cuenta)
    expect(total).toBe(150); // 100 + 50 (0 no suma)
  });
  it('hasCS detecta dato por tanque', () => {
    expect(hasCS({ si_0: '100' }, 0)).toBe(true);
    expect(hasCS({ si_0: '' }, 0)).toBe(false);
    expect(hasCS({}, 0)).toBe(false);
  });
});

describe('renderPoblacionFicha', () => {
  const html = renderPoblacionFicha({ modLabel: 'M01', status: 'pending', today: '2026-06-12', now: '08:30' });

  it('título, banner ×1000 y botón CS', () => {
    expect(html).toContain('Población Laboratorio');
    expect(html).toContain('Multiplicador ×1000');
    expect(html).toContain('data-action="cs"');
  });

  it('cabecera con Módulo, Fecha, Hora, Corrida, CTA y N° Siembra', () => {
    expect(html).toContain('value="M01" readonly');
    expect(html).toContain('name="fecha"');
    expect(html).toContain('name="hora"');
    expect(html).toContain('name="cta"');
    expect(html).toContain('name="siembra"');
  });

  it('12 filas con sv/po/lt/e/sal; po alimenta el total (data-feeds)', () => {
    expect((html.match(/class="tqc"/g) || []).length).toBe(12);
    expect(html).toContain('name="po_0"');
    expect(html).toContain('data-feeds="poblacion"');
    expect(html).toContain('name="sal_11"');
  });

  it('computados con ids para rcPob (td-tot, inp-tot, inp-sobrev, inp-mortd)', () => {
    for (const id of ['td-tot', 'inp-tot', 'inp-sobrev', 'inp-mortd']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('name="mort_d"');
  });

  it('sv es editable sin CS y readonly auto con CS', () => {
    const sinCS = renderPoblacionFicha({ modLabel: 'M01' });
    expect(sinCS).toMatch(/name="sv_0"[^>]*placeholder="%"/);
    const conCS = renderPoblacionFicha({ modLabel: 'M01', cs: { si_0: '100' } });
    expect(conCS).toMatch(/name="sv_0"[^>]*class="sv-auto"[^>]*readonly/);
    expect(conCS).toContain('CS · 1'); // botón con conteo
  });

  it('NO usa handlers inline y trae la botonera', () => {
    expect(html).not.toMatch(/on(click|input|change)=/);
    expect(html).toContain('data-action="save"');
    expect(html).toContain('id="sp-poblacion"');
  });

  it('rellena CTA desde el total de CS', () => {
    const h = renderPoblacionFicha({ modLabel: 'M01', cs: { si_0: '100', si_1: '50' } });
    expect(h).toMatch(/name="cta" value="150"/);
  });
});
