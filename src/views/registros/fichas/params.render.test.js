import { describe, it, expect } from 'vitest';
import { renderParamsFicha } from './params.render.js';
import { fieldName, DEFAULT_PTIMES } from '../lib/ficha-params.schema.js';

describe('renderParamsFicha', () => {
  const times = ['06:00', '12:00'];
  const html = renderParamsFicha({ modLabel: 'M01', times, status: 'pending', today: '2026-06-12' });

  it('emite la tarjeta y el título', () => {
    expect(html).toContain('class="fc"');
    expect(html).toContain('Parámetros en Tanques');
  });

  it('cabecera con Módulo readonly + Fecha, Corrida, Estadío', () => {
    expect(html).toContain('value="M01" readonly');
    expect(html).toContain('name="fecha"');
    expect(html).toContain('name="corrida"');
    expect(html).toContain('name="estadio"');
  });

  it('una columna OD+°C por cada horario, con cabecera del horario', () => {
    expect(html).toContain('>06:00<');
    expect(html).toContain('>12:00<');
    // 12 tanques × 2 horarios × 2 métricas = 48 inputs .pinp
    expect((html.match(/class="pinp"/g) || []).length).toBe(12 * 2 * 2);
  });

  it('nombres de campo od_<i>_<t> y tc_<i>_<t> con rangos de validación', () => {
    expect(html).toContain(`name="${fieldName('od', 0, '06:00')}"`);
    expect(html).toContain(`name="${fieldName('tc', 0, '12:00')}"`);
    expect(html).toContain('data-chkmin="3"'); // OD
    expect(html).toContain('data-chkmax="40"'); // °C
  });

  it('pie con Observaciones (textarea) y Técnico', () => {
    expect(html).toContain('<textarea name="obs"');
    expect(html).toContain('name="tec"');
  });

  it('NO usa handlers inline', () => {
    expect(html).not.toMatch(/on(click|input|change)=/);
  });

  it('usa DEFAULT_PTIMES (12 horarios) si no se pasan times', () => {
    const h = renderParamsFicha({ modLabel: 'M01' });
    expect((h.match(/class="pinp"/g) || []).length).toBe(12 * DEFAULT_PTIMES.length * 2);
  });

  it('rellena y escapa valores guardados', () => {
    const h = renderParamsFicha({
      modLabel: 'M01',
      times: ['06:00'],
      data: { estadio: 'pl3', obs: '<x>', [fieldName('od', 0, '06:00')]: '5.5' },
    });
    expect(h).toContain('value="PL3"'); // estadío en mayúsculas
    expect(h).toContain('value="5.5"');
    expect(h).not.toContain('<x>');
  });
});
