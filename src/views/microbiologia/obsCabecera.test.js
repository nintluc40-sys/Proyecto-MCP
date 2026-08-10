// Auditoría de cierre · Microbiología. `CF.obs` era una copia PRIVADA de la lista de
// cabeceras de Observaciones con solo 3 variantes: le faltaba «observación» (minúscula
// con tilde). `getField` es búsqueda EXACTA por clave —sin plegar mayúsculas ni tildes—,
// así que una fila con esa cabecera devolvía `ctx.obs = ''` y su observación
// DESAPARECÍA del bloque «Observaciones» del PDF de placas (petriPdf.js:247).
// Cuarta aparición de la familia «la regla viaja por copia»: la definición única vive
// en core/fields.js (OBS_KEYS) y ya la comparten Visitante, Revisiones y Larvicultura.
import { describe, it, expect } from 'vitest';
import { rowContext } from './data.js';
import { OBS_KEYS } from '../../core/fields.js';

const ctxDe = (cabecera) =>
  rowContext({ 'Fecha muestreo': '01/07/2026', [cabecera]: 'Contaminación en placa 3' });

describe('rowContext · cabecera de Observaciones', () => {
  it('lee las CUATRO variantes de cabecera, no solo tres', () => {
    OBS_KEYS.forEach((h) => {
      expect(ctxDe(h).obs, `cabecera «${h}»`).toBe('Contaminación en placa 3');
    });
  });

  it('la variante que se perdía es «observación» (minúscula con tilde)', () => {
    expect(ctxDe('observación').obs).toBe('Contaminación en placa 3');
  });

  it('no se pasa de corrección: sin columna de Observaciones sigue devolviendo vacío', () => {
    expect(rowContext({ 'Fecha muestreo': '01/07/2026' }).obs).toBe('');
    expect(rowContext({ 'Fecha muestreo': '01/07/2026', Comentario: 'x' }).obs).toBe('');
  });

  it('usa la definición ÚNICA de core, no una copia local', () => {
    // Si alguien vuelve a escribir la lista a mano aquí, este test sigue verde solo
    // mientras la copia coincida; el de arriba es el que muerde. Este fija la intención.
    expect(OBS_KEYS).toContain('observación');
  });
});
