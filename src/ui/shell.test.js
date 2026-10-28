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
// (primera permitida NO pendiente, la regla de selectRole).
import { describe, it, expect } from 'vitest';
import { ROLES, MAIN_VIEWS } from './shell.js';

const allows = (role, viewId) => {
  const r = ROLES[role];
  return !!r && (r.allow === '*' || r.allow.includes(viewId));
};
// Réplica de la regla de aterrizaje de selectRole(): la vista que el rol declara en `inicio` o, si no, la primera permitida.
const landing = (role) => {
  const r = ROLES[role];
  if (r && r.inicio && allows(role, r.inicio) && MAIN_VIEWS.some((x) => x.id === r.inicio)) return r.inicio;
  const v = MAIN_VIEWS.find((x) => allows(role, x.id) && !x.pending)
    || MAIN_VIEWS.find((x) => allows(role, x.id));
  return v ? v.id : null;
};

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

  it('vista de aterrizaje por rol: primera permitida no pendiente', () => {
    expect(landing('administrativo')).toBe('supervisor');
    expect(landing('tecnico')).toBe('supervisor');
    expect(landing('supervisor')).toBe('supervisor');
    expect(landing('chequeador')).toBe('larvicultura');
    expect(landing('visitante')).toBe('visitante');
  });
});
