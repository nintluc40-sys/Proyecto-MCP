/* ============================================================
   ACCESO POR ENLACE · la entrada directa de Gerencia (2026-10-05)
   Lo que se exige: sólo Gerencia entra por enlace; el equipo recuerda el rol y lo olvida al cambiarlo; la dirección se
   limpia del parámetro sin tocar lo demás; y el enlace del QR es el del sitio (desde el equipo local, el publicado).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { rolDeEnlace, rolRecordado, recordarRol, olvidarRol, direccionSinRol, enlaceGerencia, CLAVE_ROL, SITIO_PUBLICADO } from './accesoRol.js';

const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

describe('acceso por enlace · rol', () => {
  it('sólo Gerencia entra por enlace; cualquier otro rol (o ninguno) se ignora', () => {
    expect(rolDeEnlace('?rol=gerencia')).toBe('gerencia');
    expect(rolDeEnlace('?x=1&rol=gerencia')).toBe('gerencia');
    for (const s of ['', '?rol=administrativo', '?rol=supervisor', '?rol=GERENCIA', '?qr=gerencia', undefined]) expect(rolDeEnlace(s)).toBeNull();
  });

  it('el equipo recuerda Gerencia y lo olvida; un valor ajeno guardado no cuenta', () => {
    const st = memoria();
    expect(rolRecordado(st)).toBeNull();
    recordarRol('gerencia', st);
    expect(st.m.get(CLAVE_ROL)).toBe('gerencia');
    expect(rolRecordado(st)).toBe('gerencia');
    olvidarRol(st);
    expect(rolRecordado(st)).toBeNull();
    recordarRol('administrativo', st);
    expect(st.m.has(CLAVE_ROL)).toBe(false);
    st.setItem(CLAVE_ROL, 'administrativo');
    expect(rolRecordado(st)).toBeNull();
  });

  it('sin almacenamiento (o si falla) no rompe', () => {
    const roto = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(rolRecordado(roto)).toBeNull();
    expect(() => recordarRol('gerencia', roto)).not.toThrow();
    expect(() => olvidarRol(roto)).not.toThrow();
    expect(rolRecordado(null)).toBeNull();
  });
});

describe('acceso por enlace · direcciones', () => {
  it('la dirección pierde «rol» y conserva lo demás', () => {
    expect(direccionSinRol('https://x.io/Proyecto-MCP/?rol=gerencia')).toBe('/Proyecto-MCP/');
    expect(direccionSinRol('https://x.io/Proyecto-MCP/?a=1&rol=gerencia#h')).toBe('/Proyecto-MCP/?a=1#h');
  });

  it('el enlace es el del sitio desde el que se abre; desde el equipo local, el publicado', () => {
    expect(enlaceGerencia('https://nintluc40-sys.github.io/Proyecto-MCP/?qr=gerencia')).toBe('https://nintluc40-sys.github.io/Proyecto-MCP/?rol=gerencia');
    expect(enlaceGerencia('https://otro.host/app/index.html?qr=gerencia#x')).toBe('https://otro.host/app/?rol=gerencia');
    for (const local of ['http://localhost:4179/?qr=gerencia', 'http://127.0.0.1:5173/?qr=gerencia']) expect(enlaceGerencia(local)).toBe(SITIO_PUBLICADO + '?rol=gerencia');
  });
});
