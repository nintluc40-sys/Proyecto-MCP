// @vitest-environment happy-dom
// Caracterización del contrato de PERMISOS POR ROL (ui/shell.js).
// Fija la especificación acordada el 2026-07-04:
//   · Administrativo → todas las vistas ('*')
//   · Técnico        → Supervisor, Larvicultura, Registros
//   · Supervisor     → Supervisor, Revisiones, Registros, Algas, Microbiología,
//                      Biología Molecular, Maduración
//   · Chequeador     → solo Larvicultura
//   · Visitante      → solo Visitante
// Además verifica que cada id permitido exista en MAIN_VIEWS (un typo en un id
// dejaría la vista invisible en silencio) y la vista de aterrizaje de cada rol
// (`vistaInicialDeRol`, la que usa selectRole).
import { describe, it, expect } from 'vitest';
import { ROLES, MAIN_VIEWS, vistaInicialDeRol } from './shell.js';

const allows = (role, viewId) => {
  const r = ROLES[role];
  return !!r && (r.allow === '*' || r.allow.includes(viewId));
};
/* B10 (2026-11-08) · la regla de VERDAD, no una réplica: la copia que había aquí seguía esquivando vistas «pendientes»
   después de que selectRole dejara de hacerlo, y habría seguido en verde aunque las dos divergieran. */
const landing = (role) => vistaInicialDeRol(role);

describe('shell · permisos por rol', () => {
  it('existen exactamente los 7 roles del sistema', () => {
    expect(Object.keys(ROLES).sort()).toEqual(
      ['administrativo', 'chequeador', 'gerencia', 'mantenimiento', 'supervisor', 'tecnico', 'visitante'],
    );
  });

  it('Administrativo accede a TODAS las vistas', () => {
    expect(ROLES.administrativo.allow).toBe('*');
    MAIN_VIEWS.forEach((v) => expect(allows('administrativo', v.id)).toBe(true));
  });

  it('Técnico accede solo a Supervisor, Larvicultura y Registros', () => {
    expect([...ROLES.tecnico.allow].sort()).toEqual(['larvicultura', 'registros', 'supervisor']);
  });

  it('Supervisor accede a Supervisor, Revisiones, Registros, Algas, Micro, Biomol y Maduración', () => {
    expect([...ROLES.supervisor.allow].sort()).toEqual(
      ['algas', 'biomolecular', 'maduracion', 'microbiologia', 'registros', 'revisiones', 'supervisor'],
    );
    expect(allows('supervisor', 'larvicultura')).toBe(false);
    expect(allows('supervisor', 'visitante')).toBe(false);
  });

  it('Chequeador accede solo a Larvicultura', () => {
    expect(ROLES.chequeador.allow).toEqual(['larvicultura']);
  });

  it('Visitante accede solo a la vista Visitante', () => {
    expect(ROLES.visitante.allow).toEqual(['visitante']);
  });

  it('gerencia: sólo la vista Planta (el tablero 3D) y aterriza en ella', () => {
    expect(ROLES.gerencia.allow).toEqual(['planta']);
    expect(allows('gerencia', 'supervisor')).toBe(false);
    expect(landing('gerencia')).toBe('planta');
  });

  it('mantenimiento (2026-10-28): su vista 🔧 y Registros, y aterriza en su vista (no en Registros, que va antes)', () => {
    expect([...ROLES.mantenimiento.allow].sort()).toEqual(['mantenimiento', 'registros']);
    expect(allows('mantenimiento', 'supervisor')).toBe(false);
    expect(landing('mantenimiento')).toBe('mantenimiento');
    expect(MAIN_VIEWS.findIndex((v) => v.id === 'registros')).toBeLessThan(MAIN_VIEWS.findIndex((v) => v.id === 'mantenimiento'));
    ['supervisor', 'tecnico', 'chequeador', 'visitante', 'gerencia'].forEach((r) => expect(allows(r, 'mantenimiento'), r).toBe(false));
  });

  it('todos los ids permitidos existen en MAIN_VIEWS (sin typos silenciosos)', () => {
    const ids = new Set(MAIN_VIEWS.map((v) => v.id));
    Object.values(ROLES).forEach((r) => {
      if (r.allow === '*') return;
      r.allow.forEach((id) => expect(ids.has(id)).toBe(true));
    });
  });

  it('vista de aterrizaje por rol: la de su `inicio` o la primera permitida', () => {
    expect(landing('administrativo')).toBe('supervisor');
    expect(landing('tecnico')).toBe('supervisor');
    expect(landing('supervisor')).toBe('supervisor');
    expect(landing('chequeador')).toBe('larvicultura');
    expect(landing('visitante')).toBe('visitante');
    // Todos los roles aterrizan en una vista que existe y que pueden ver; un rol que no existe, en ninguna.
    Object.keys(ROLES).forEach((r) => {
      const v = landing(r);
      expect(MAIN_VIEWS.some((x) => x.id === v), r).toBe(true);
      expect(allows(r, v), r).toBe(true);
    });
    expect(landing('nadie')).toBe(null);
  });

  it('B10 · un `inicio` que el rol no puede ver no manda: aterriza en la primera permitida', () => {
    const antes = ROLES.mantenimiento.inicio, antesAllow = ROLES.mantenimiento.allow;
    try {
      ROLES.mantenimiento.inicio = 'supervisor';   // existe, pero no lo tiene permitido
      expect(landing('mantenimiento')).toBe('registros');
      ROLES.mantenimiento.allow = [...antesAllow, 'fantasma'];
      ROLES.mantenimiento.inicio = 'fantasma';     // permitido, pero no es una vista
      expect(landing('mantenimiento')).toBe('registros');
    } finally { ROLES.mantenimiento.inicio = antes; ROLES.mantenimiento.allow = antesAllow; }
  });
});
