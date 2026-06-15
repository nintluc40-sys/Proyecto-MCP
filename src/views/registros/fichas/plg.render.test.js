import { describe, it, expect } from 'vitest';
import { renderPlgFicha } from './plg.render.js';
import { PLG_COLUMNS, fieldName } from '../lib/ficha-plg.schema.js';

describe('renderPlgFicha', () => {
  const html = renderPlgFicha({ modLabel: 'M01', status: 'pending', today: '2026-06-12' });

  it('emite la tarjeta y el título de la ficha', () => {
    expect(html).toContain('class="fc"');
    expect(html).toContain('PL Gramo Externo');
  });

  it('cabecera con Módulo readonly + Fecha, Corrida, N° Siembra', () => {
    expect(html).toContain('value="M01" readonly');
    expect(html).toContain('name="fecha"');
    expect(html).toContain('value="2026-06-12"');
    expect(html).toContain('name="corrida"');
    expect(html).toContain('name="siembra"');
  });

  it('12 filas, cada una con lote/estadio/pg/pgm', () => {
    expect((html.match(/class="tqc"/g) || []).length).toBe(12);
    for (const col of PLG_COLUMNS) {
      expect(html).toContain(`name="${fieldName(col.code, 0)}"`);
    }
  });

  it('lote y estadio son texto en mayúsculas (data-upper); pg/pgm numéricos step 0.001', () => {
    expect(html).toContain('name="lt_0"');
    expect(html).toContain('data-upper="1"');
    expect(html).toContain('step="0.001"');
  });

  it('NO usa handlers inline', () => {
    expect(html).not.toMatch(/on(click|input|change)=/);
  });

  it('incluye la botonera nativa (save/sync)', () => {
    expect(html).toContain('data-action="save"');
    expect(html).toContain('data-action="sync"');
    expect(html).toContain('id="sp-plg"');
  });

  it('rellena valores guardados y pone lote/estadio en mayúsculas', () => {
    const h = renderPlgFicha({ modLabel: 'M02', data: { lt_0: 'a12', e_0: 'pl5', pg_0: '0.045' } });
    expect(h).toContain('value="A12"');
    expect(h).toContain('value="PL5"');
    expect(h).toContain('value="0.045"');
  });

  it('escapa valores del modelo', () => {
    const h = renderPlgFicha({ modLabel: 'M01', data: { tec: '<x>' } });
    expect(h).not.toContain('<x>');
    expect(h).toContain('&lt;x&gt;');
  });
});
