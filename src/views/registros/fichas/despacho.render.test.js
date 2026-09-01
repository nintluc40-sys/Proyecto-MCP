import { describe, it, expect } from 'vitest';
import { renderDespachoFicha } from './despacho.render.js';
import { tonCount } from '../lib/ficha-despacho.schema.js';

describe('tonCount', () => {
  it('cuenta tanques con TON', () => {
    expect(tonCount({ ton_0: '5', ton_1: '', ton_2: '3' })).toBe(2);
    expect(tonCount({})).toBe(0);
  });
});

describe('renderDespachoFicha', () => {
  const destinos = ['Piscina A', 'Piscina B'];
  const html = renderDespachoFicha({ modLabel: 'M01', destinos, status: 'pending', today: '2026-06-12', now: '08:30' });

  it('título, botón TON y cabecera (Fecha/Hora/Corrida)', () => {
    expect(html).toContain('🚚 Despacho');
    expect(html).toContain('data-action="ton"');
    expect(html).toContain('name="fecha"');
    expect(html).toContain('name="hora"');
    expect(html).toContain('name="corrida"');
  });

  it('12 filas con todas las columnas e/po/sv/pgm/pg/dc/bm/cj/de/ps', () => {
    expect((html.match(/class="tqc"/g) || []).length).toBe(12);
    for (const code of ['e', 'po', 'sv', 'pgm', 'pg', 'dc', 'bm', 'cj', 'de', 'ps']) {
      expect(html).toContain(`name="${code}_0"`);
    }
  });

  it('po dispara recalcs (data-desp-po) y pgm (data-desp-pgm)', () => {
    expect(html).toContain('data-desp-po="1"');
    expect(html).toContain('data-desp-pgm="1"');
  });

  it('dc y bm son computados readonly (sv-auto)', () => {
    expect(html).toMatch(/name="dc_0"[^>]*class="sv-auto"[^>]*readonly/);
    expect(html).toMatch(/name="bm_0"[^>]*class="sv-auto"[^>]*readonly/);
  });

  it('Destino: una casilla por DESTINO_OPTS y el valor en un input oculto', () => {
    expect(html).toContain('name="de_0"');
    expect(html).toContain('type="hidden"');
    expect(html).toContain('value="Piscina A"');
    expect(html).toContain('value="Piscina B"');
    expect(html).toContain('— Selecciona —');
    // Las casillas son la interfaz; lo que se guarda es el oculto.
    expect((html.match(/data-dest-ms/g) || []).length).toBe(destinos.length * 12);
  });

  it('sv editable sin CS, readonly auto con CS', () => {
    const conCS = renderDespachoFicha({ modLabel: 'M01', destinos, cs: { si_0: '100' } });
    expect(conCS).toMatch(/name="sv_0"[^>]*class="sv-auto"[^>]*readonly/);
  });

  it('NO usa handlers inline y trae botonera', () => {
    expect(html).not.toMatch(/on(click|input|change)=/);
    expect(html).toContain('data-action="save"');
    expect(html).toContain('id="sp-despacho"');
  });

  it('Destino preselecciona el valor guardado', () => {
    const h = renderDespachoFicha({ modLabel: 'M01', destinos, data: { de_0: 'Piscina B' } });
    expect(h).toMatch(/value="Piscina B" checked/);
    expect(h).not.toMatch(/value="Piscina A" checked/);
  });

  /* 🔴 El defecto que motivó el cambio, medido contra el despliegue el 2026-08-30:
     la columna Destino de producción tiene 12 filas con DOS destinos separados por
     coma. Con el `<select>` anterior, la comparación `cur === opción` no casaba con
     ninguna, la celda mostraba «— Selecciona —» y al guardar el Destino quedaba
     VACÍO. La ficha destruía el dato por el simple hecho de abrirse. */
  it('🔴 un Destino con DOS valores se conserva entero y marca sus dos casillas', () => {
    const h = renderDespachoFicha({
      modLabel: 'M01', destinos, data: { de_0: 'Piscina A, Piscina B' },
    });
    // El valor que viaja a la hoja sigue completo.
    expect(h).toContain('<input type="hidden" name="de_0" value="Piscina A, Piscina B">');
    // Y las dos casillas salen marcadas.
    expect(h).toMatch(/value="Piscina A" checked/);
    expect(h).toMatch(/value="Piscina B" checked/);
    // El resumen visible lo enseña, en vez de fingir que no hay nada elegido.
    expect(h).toContain('>Piscina A, Piscina B</summary>');
  });

  it('tolera espacios y comas sobrantes en lo guardado', () => {
    const h = renderDespachoFicha({
      modLabel: 'M01', destinos, data: { de_0: ' Piscina B ,, ' },
    });
    expect(h).toContain('value="Piscina B">');
    expect(h).toMatch(/value="Piscina B" checked/);
  });
});
