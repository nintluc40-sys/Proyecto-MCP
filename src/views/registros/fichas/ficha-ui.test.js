/* ============================================================
   REGISTROS · las piezas comunes de las fichas nativas · B10 (2026-11-08, usuario: «Los seis con lógica»)
   Accesores de valor (fieles a vl/vlU/ev del monolito), la celda de tanque, la pastilla de estado y la botonera de
   guardado. Todo lo que viene del modelo sale ESCAPADO, y la botonera usa data-action (sin handlers inline).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { vl, vlU, ev, tqCell, statusPill, saveArea } from './ficha-ui.js';

describe('vl / vlU / ev', () => {
  const d = { a: '<b>x</b>', n: 0, v: '', u: undefined, z: null, t: 'abc' };

  it('vl: el valor escapado; vacío, null o ausente → «»; el 0 SÍ es un valor', () => {
    expect(vl(d, 'a')).toBe('&lt;b&gt;x&lt;/b&gt;');
    expect(vl(d, 'n')).toBe('0');
    expect([vl(d, 'v'), vl(d, 'u'), vl(d, 'z'), vl(d, 'nada')]).toEqual(['', '', '', '']);
  });

  it('vlU: lo mismo, en MAYÚSCULAS', () => {
    expect(vlU(d, 't')).toBe('ABC');
    expect(vlU(d, 'a')).toBe('&lt;B&gt;X&lt;/B&gt;');
    expect(vlU(d, 'v')).toBe('');
  });

  it('ev: el valor o el de por defecto si falta o está vacío; ambos escapados', () => {
    expect(ev(d, 't', 'def')).toBe('abc');
    expect(ev(d, 'v', '<def>')).toBe('&lt;def&gt;');
    expect(ev(d, 'nada', 'def')).toBe('def');
    expect(ev(d, 'nada')).toBe('');
    expect(ev(d, 'z', 'def'), 'como el monolito: null no es «vacío» para ev, y escaparlo da «»').toBe('');
  });
});

describe('tqCell', () => {
  it('los 12 tanques fijos son su número', () => {
    expect([0, 5, 11].map((i) => tqCell(i))).toEqual(['1', '6', '12']);
  });
  it('desde el 13, un campo editable con su nombre (escapado) o «TQ n»', () => {
    const def = tqCell(12);
    expect(def).toMatch(/^<input /);
    expect(def).toContain('value="TQ 13"');
    expect(def).toContain('data-tank="12"');
    expect(tqCell(13, { 13: 'R"1<' })).toContain('value="R&quot;1&lt;"');
  });
});

describe('statusPill', () => {
  it('enviado, guardado local o sin datos', () => {
    expect(statusPill('synced')).toContain('En Google Sheets');
    expect(statusPill('pending')).toContain('Guardado local');
    expect(statusPill('empty')).toContain('Sin datos hoy');
    expect(statusPill(undefined)).toContain('Sin datos hoy');
  });
});

describe('saveArea', () => {
  it('la botonera entera, con data-action y data-ficha, y ningún onclick', () => {
    const h = saveArea({ ficha: 'desinfeccion', status: 'pending', lastSaved: '08/11 10:00' });
    for (const a of ['clear', 'pdf', 'save', 'sync']) expect(h, a).toContain(`data-action="${a}" data-ficha="desinfeccion"`);
    expect(h).not.toMatch(/onclick=/i);
    expect(h).toContain('id="sp-desinfeccion"');
    expect(h).toContain('Guardado local');
    expect(h).toContain('<strong>08/11 10:00</strong>');
  });

  it('↩ Recuperar: deshabilitado sin autoguardado; con él, su hora escapada', () => {
    expect(saveArea({ ficha: 'x' })).toMatch(/<button class="btn brec" disabled/);
    const h = saveArea({ ficha: 'x', recover: { label: '10:<i>' } });
    expect(h).toContain('data-action="recover" data-ficha="x"');
    expect(h).toContain('↩ Recuperar (10:&lt;i&gt;)');
    expect(h).not.toContain('<i>');
  });

  it('el PDF puede ir a otra acción (la de la ficha)', () => {
    expect(saveArea({ ficha: 'x', pdfAction: 'pdfPropio' })).toContain('data-action="pdfPropio" data-ficha="x"');
  });
});
