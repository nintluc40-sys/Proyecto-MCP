/* ============================================================
   TRASLADO EN RUTA · LOS CINCO KPI DEL VIAJE TIENEN QUE VERSE

   Defecto reportado por el usuario (2026-09-16): «O₂ promedio, Temp. promedio, Actividad
   dominante, Observaciones y Tiempo en ruta no se logran diferenciar, se ven blancos y se
   mezclan con el fondo».

   🔴 LA CAUSA, y por qué ninguna prueba de render la veía: `kpiGlass` pinta `.sv-kpi-glass`, que
   es VIDRIO —blanco al 15 % con la etiqueta en blanco al 75 %—. Donde nació funciona: dentro de
   `.sv-banner` y `.sv-card`, que llevan fondo de color. Pero estos cinco cuelgan de
   `.sv-tras-viaje`, que no tiene fondo, así que salían blanco sobre blanco. El HTML era correcto
   —por eso `traslado.render.test.js` estaba en verde—: lo que fallaba era sólo el CSS.

   Estas pruebas leen el CSS y exigen las dos mitades del contrato, que no se pueden separar:
     1. dentro de `.sv-tras-viaje` los cinco se opacan y su etiqueta deja de ser blanca;
     2. FUERA de ahí el vidrio se queda como está, o se despintan los KPI de Despacho, Módulo y
        Tanque, que sí están sobre color.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'src/views/supervisor/supervisor.css'), 'utf8');
const JS = readFileSync(join(process.cwd(), 'src/views/supervisor/traslado.js'), 'utf8');

/** El cuerpo de la primera regla cuyo selector sea EXACTAMENTE `sel` (el archivo escribe unas
 *  con espacio antes de la llave y otras sin él, así que el hueco es opcional). */
const regla = (sel) => {
  const re = new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
  const m = re.exec(CSS);
  return m ? m[1] : null;
};

describe('Traslado en ruta · los cinco KPI se ven sobre el fondo claro', () => {
  it('el fixture ejerce algo: los cinco siguen colgando de .sv-tras-viaje y son pulsables', () => {
    /* Si mañana se mueven a un contenedor con fondo, estas reglas sobran y esta prueba avisa
       antes de que alguien las borre «porque no hacen nada». */
    for (const k of ['O₂ promedio (mg/L)', 'Temp. promedio (°C)', 'Actividad dominante', 'Observaciones', 'Tiempo en ruta']) {
      expect(JS, k + ' ya no está en la vista').toContain(k);
    }
    expect(JS).toContain('class="sv-tras-viaje"');
    expect(JS.match(/data-tras-modal="/g)).toHaveLength(5);
  });

  it('🔴 el recuadro deja de ser translúcido: fondo opaco y borde propios', () => {
    const r = regla('.sv-tras-viaje .sv-kpi-glass');
    expect(r, 'falta la regla que los hace visibles').toBeTruthy();
    expect(r).toContain('background:var(--c-surface)');
    expect(r).toContain('border:1px solid var(--c-border)');
    // Nada de blancos literales: con un #fff el tema oscuro devolvería el mismo defecto al revés.
    expect(r).not.toMatch(/#fff|rgba\(255,255,255/);
  });

  it('🔴 la etiqueta deja de ser blanca sobre blanco (era lo que no se leía)', () => {
    expect(regla('.sv-tras-viaje .sv-kpi-label')).toContain('color:var(--c-text-soft)');
    expect(regla('.sv-tras-viaje .sv-kpi-value')).toContain('color:var(--c-text)');
    expect(regla('.sv-tras-viaje .sv-kpi-sub')).toContain('color:var(--c-text-soft)');
    // Y las de base, que son las que fallaban, siguen siendo blancas: el arreglo es un OVERRIDE.
    expect(regla('.sv-kpi-label')).toContain('rgba(255,255,255');
  });

  it('🔴 el vidrio NO se toca fuera del viaje: Despacho, Módulo y Tanque van sobre color', () => {
    expect(regla('.sv-kpi-glass')).toContain('rgba(255,255,255,.15)');
    /* Cada override del bloque va prefijado. Un solo selector sin prefijo despinta las otras
       tres vistas, y eso no lo ve ninguna prueba de render. */
    const bloque = CSS.slice(CSS.indexOf('.sv-tras-viaje .sv-kpi-glass'), CSS.indexOf('.sv-tras-cards'));
    for (const sel of bloque.match(/^\.[^{\n]+(?=\{|,$)/gm) || []) {
      expect(sel.trim(), 'este selector no está acotado al viaje: ' + sel.trim()).toMatch(/^\.sv-tras-viaje /);
    }
  });

  it('el aviso de fuera de cadencia se lee en rojo sobre claro, no en el rojo del vidrio', () => {
    const r = regla('.sv-tras-viaje .sv-kpi-alert');
    expect(r).toContain('#fdecea');
    expect(regla('.sv-tras-viaje .sv-kpi-alert .sv-kpi-value')).toContain('#b71c1c');
    // El de base sigue pensado para fondo de color y no se toca.
    expect(regla('.sv-kpi-alert')).toContain('rgba(229,57,53,.38)');
  });
});
