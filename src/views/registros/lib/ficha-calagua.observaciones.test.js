/* ============================================================
   REGISTROS · Observaciones por tanque de la ficha Calidad de Agua (pauta 3.1, 2026-10-15)

   El envío corta la observación a 200 (`sanitizeStr` sin tope propio, columna 47 de "Datos
   Larvicultura"). La casilla no tenía `maxlength`: el técnico escribía más y lo que pasaba de 200
   se perdía SIN AVISO. Ahora la casilla lleva el MISMO tope que el envío, en los dos renders del
   repo (el nativo del módulo y el «en blanco» del monolito). Si alguien cambia uno sin el otro,
   esto se pone rojo.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CALAGUA_COLUMNS, fieldName } from './ficha-calagua.schema.js';
import { renderCalaguaFicha } from '../fichas/calagua.render.js';
import { sanitizeStr } from '../../../core/trovan.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const engine = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

/** El tope real del envío: lo que deja pasar `sanitizeStr` sin segundo argumento. */
const TOPE_ENVIO = sanitizeStr('x'.repeat(1000)).length;

describe('calagua · Observaciones: la casilla no deja escribir más de lo que se envía', () => {
  it('el envío la manda con el tope por defecto (200)', () => {
    expect(engine).toContain('sanitizeStr(agua["ob_"+i] || ""),');
    expect(TOPE_ENVIO).toBe(200);
  });

  it('el esquema le pone ese mismo maxlength', () => {
    const ob = CALAGUA_COLUMNS.find((c) => c.code === 'ob');
    expect(ob.maxlength).toBe(TOPE_ENVIO);
  });

  it('el render nativo lo lleva en cada tanque', () => {
    const html = renderCalaguaFicha({ modLabel: 'M01' });
    const casillas = html.match(/<input type="text" name="ob_\d+"[^>]*>/g) || [];
    expect(casillas.length).toBe(12);
    casillas.forEach((c) => expect(c).toContain(`maxlength="${TOPE_ENVIO}"`));
    expect(html).toMatch(new RegExp(`name="${fieldName('ob', 0)}"[^>]*maxlength="${TOPE_ENVIO}"`));
  });

  it('el render «en blanco» del monolito también', () => {
    const i = engine.indexOf('function _renderBlancoCalidadAgua(');
    const seg = engine.slice(i, engine.indexOf('\nfunction ', i + 10));
    expect(seg).toMatch(new RegExp(`name="ob_\\$\\{i\\}"[^>]*maxlength="${TOPE_ENVIO}"`));
  });

  it('las demás casillas de texto siguen sin tope (no se pasa de corrección)', () => {
    const html = renderCalaguaFicha({ modLabel: 'M01' });
    expect(html).not.toMatch(/name="e_0"[^>]*maxlength/);
  });
});
