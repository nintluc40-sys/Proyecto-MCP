import { describe, it, expect } from 'vitest';
import { renderCalidadFicha, statusPill } from './calidad.render.js';
import { CALIDAD_CODES, fieldName } from '../lib/ficha-calidad.schema.js';

describe('statusPill', () => {
  it('refleja los 3 estados', () => {
    expect(statusPill('synced')).toContain('En Google Sheets');
    expect(statusPill('pending')).toContain('Guardado local');
    expect(statusPill('empty')).toContain('Sin datos hoy');
  });
});

describe('renderCalidadFicha', () => {
  const html = renderCalidadFicha({
    modLabel: 'M01',
    status: 'pending',
    today: '2026-06-12',
    now: '08:30',
  });

  it('emite la tarjeta y el título de la ficha', () => {
    expect(html).toContain('class="fc"');
    expect(html).toContain('Registro Sanidad y Calidad de Larvas');
    expect(html).toContain('Guardado local'); // pill del estado pasado
  });

  it('cabecera con Módulo (readonly), Corrida, Fecha y Hora por defecto', () => {
    expect(html).toContain('value="M01" readonly');
    expect(html).toContain('name="corrida"');
    expect(html).toContain('value="2026-06-12"');
    expect(html).toContain('value="08:30"');
  });

  it('genera 12 filas de tanque por defecto', () => {
    expect((html.match(/<tr>/g) || []).length).toBe(12 + 3); // 12 filas + 3 de cabecera
    expect((html.match(/class="tqc"/g) || []).length).toBe(12);
  });

  it('cada tanque tiene estadio + los 16 campos numéricos del esquema', () => {
    // tanque índice 0 → nombres e_0, ll_0 … es_0
    expect(html).toContain('name="e_0"');
    for (const code of CALIDAD_CODES) {
      expect(html).toContain(`name="${fieldName(code, 0)}"`);
    }
  });

  it('las bandas conservan los colspans del monolito (9 / 5 / 2)', () => {
    expect(html).toContain('colspan="9"');
    expect(html).toContain('colspan="5"');
    expect(html).toContain('colspan="2"');
  });

  it('NO usa handlers inline (onclick/oninput/onchange)', () => {
    expect(html).not.toMatch(/on(click|input|change)=/);
  });

  it('usa data-* para delegación (upper, feeds, y toda la botonera)', () => {
    expect(html).toContain('data-upper="1"');
    expect(html).toContain('data-feeds="poblacion"'); // columna %Mortalidad
    // 'recover' es condicional (solo si hay autoguardado) → se prueba aparte.
    for (const a of ['clear', 'pdf', 'share', 'save', 'sync']) {
      expect(html).toContain(`data-action="${a}"`);
    }
  });

  it('Recuperar deshabilitado sin autoguardado, habilitado con timestamp', () => {
    expect(html).toContain('↩ Recuperar</button>'); // sin recover → texto base + disabled
    expect(html).toContain('disabled');
    const withRec = renderCalidadFicha({ modLabel: 'M01', recover: { label: '08:30' } });
    expect(withRec).toContain('↩ Recuperar (08:30)');
    expect(withRec).toContain('data-action="recover"');
  });

  it('muestra el último guardado y el pill con id sp-calidad', () => {
    const h = renderCalidadFicha({ modLabel: 'M01', lastSaved: '12/06/2026 8:30', status: 'synced' });
    expect(h).toContain('Último guardado');
    expect(h).toContain('12/06/2026 8:30');
    expect(h).toContain('id="sp-calidad"');
  });

  it('escapa valores del modelo de datos', () => {
    const evil = renderCalidadFicha({ modLabel: 'M01', data: { tec: '<script>x</script>' } });
    expect(evil).not.toContain('<script>x');
    expect(evil).toContain('&lt;script&gt;');
  });

  it('rellena valores guardados y pone estadio en mayúsculas', () => {
    const withData = renderCalidadFicha({
      modLabel: 'M02',
      data: { corrida: '552', e_0: 'pl5', ll_0: '88.5' },
    });
    expect(withData).toContain('value="552"');
    expect(withData).toContain('value="PL5"'); // e_0 en mayúsculas
    expect(withData).toContain('value="88.5"');
  });
});
