/* ============================================================
   REGISTROS · la cabecera de la ficha Desinfección · B10 (2026-11-08, usuario: «Los seis con lógica»)
   `DESINF_HEADER` dice qué campos de cabecera pinta la ficha (Fecha y Corrida; SIN técnico). Lo que se teclea ahí
   sólo sirve si el envío lo lee: se comprueba contra `buildDesinfeccionPayload` del motor, que es quien arma las filas.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DESINF_HEADER } from './ficha-desinfeccion.schema.js';

const leer = (u) => readFileSync(new URL(u, import.meta.url), 'utf8').split('\r\n').join('\n');
const motor = leer('../../../../public/registros/engine.js');

/** El cuerpo de `buildDesinfeccionPayload` en el motor (hasta la siguiente función de primer nivel). */
function cuerpoDelEnvio() {
  const i = motor.indexOf('function buildDesinfeccionPayload(');
  expect(i, 'el motor ya no tiene buildDesinfeccionPayload').toBeGreaterThan(-1);
  const j = motor.indexOf('\nfunction ', i + 10);
  return motor.slice(i, j);
}

describe('DESINF_HEADER', () => {
  it('Fecha (fecha) y Corrida (texto), en ese orden, y nada más: esta ficha no lleva técnico', () => {
    expect(DESINF_HEADER.map((f) => [f.name, f.type])).toEqual([['fecha', 'date'], ['corrida', 'text']]);
    expect(DESINF_HEADER.map((f) => f.label)).toEqual(['Fecha', 'Corrida']);
    expect(DESINF_HEADER.some((f) => /tec/i.test(f.name))).toBe(false);
  });

  it('cada campo de la cabecera es uno que el envío LEE del modelo (`d.<campo>`)', () => {
    const envio = cuerpoDelEnvio();
    for (const f of DESINF_HEADER) expect(envio, f.name).toMatch(new RegExp('\\bd\\.' + f.name + '\\b'));
    expect(envio, 'el envío leería un técnico que la ficha no pinta').not.toMatch(/\bd\.tec\b/);
  });
});
