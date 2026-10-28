/* ============================================================
   MADURACIÓN · OPERATIVO — los colores de los mapas de calor (2026-10-27, Sesión A ronda 9)

   🔴 LO QUE PASABA. operativo.css define DOS escalas sobre las mismas clases de `.mop-calor`: la del umbral en el mapa de
   temperatura de 🏠 Salas (y en 🌡️ Zonas) —`is-ok` verde, `is-bajo` AZUL, `is-alto` rojo, como dicen sus notas— y la de
   intensidad del mapa «🔥 Bajas por sala y día» —`is-cero`, `is-bajo` ámbar claro, `is-medio`, `is-alto`—. La segunda iba
   SIN acotar y detrás, así que ganaba: en Chrome real, una toma «bajo» de la temperatura de una sala salía ámbar
   (rgb(255, 193, 7) al 22 %). Ahora la de intensidad va acotada a `.mop-bajas-cal` (la tabla de Bajas la lleva: lo
   exige operativo.view.test.js).
   happy-dom no resuelve la cascada con fiabilidad: aquí se lee la hoja de estilos como texto; el color en pantalla se
   midió en Chrome real.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/views/maduracion/operativo.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Las reglas cuyo selector toca un `td.<clase>` de una tabla `.mop-calor`. */
const reglas = (clase) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim(), decl: m[2].trim() }))
  .filter((r) => r.sel.split(',').some((s) => s.includes('.mop-calor') && new RegExp(`td\\.${clase}\\b`).test(s)));

describe('los mapas de calor de Maduración no se pisan los colores', () => {
  it('la escala de intensidad (cero, bajo, medio, alto) sólo vale en la tabla de Bajas', () => {
    for (const clase of ['is-cero', 'is-medio']) {
      const rs = reglas(clase);
      expect(rs.length, clase).toBeGreaterThan(0);
      for (const r of rs) expect(r.sel, clase).toContain('.mop-bajas-cal');
    }
    const intensidad = [...reglas('is-bajo'), ...reglas('is-alto')].filter((r) => r.sel.includes('.mop-bajas-cal'));
    expect(intensidad).toHaveLength(2);
  });

  it('sin acotar, «bajo» es AZUL y «alto» rojo: una sola regla de cada uno, la del umbral', () => {
    const libre = (clase) => reglas(clase).filter((r) => !r.sel.includes('.mop-bajas-cal'));
    expect(libre('is-bajo')).toHaveLength(1);
    expect(libre('is-bajo')[0].decl).toContain('--c-excelente');
    expect(libre('is-alto')).toHaveLength(1);
    expect(libre('is-alto')[0].decl).toContain('--c-grave');
    expect(libre('is-ok')).toHaveLength(1);
    expect(libre('is-ok')[0].decl).toContain('--c-bueno');
  });
});
