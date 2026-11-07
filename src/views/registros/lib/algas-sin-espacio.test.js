// @vitest-environment happy-dom
/* ============================================================
   LAB. ALGAS · «➕ AGREGAR AL HISTORIAL» SIN ESPACIO NO DICE «✅ AGREGADO» NI VACÍA EL FORMULARIO (A11, 2026-11-06)

   LO QUE PASABA: `saveAlgHist` atrapaba el error del almacén lleno y avisaba, pero no decía que había fallado:
   `pushAlgHist` devolvía «sí», «➕ Agregar» vaciaba el formulario y tapaba el aviso con «✅ Agregado». Lo tecleado se
   perdía. Al EDITAR un registro, igual.

   AHORA: se comprueba lo guardado (`_lsSet`, que antes de rendirse hace sitio como las demás fichas); sin espacio,
   «NO se guardó», el formulario se queda como estaba y la edición sigue abierta.

   Motor REAL sobre el shell real. El almacén tiene CUPO, como el del navegador. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderAlgas', 'saveE', 'addToAlgHist', 'loadAlgHist', 'editAlgHistEntry', '_invalidateLoadE'];
const H = {};
const avisos = [];

const almacen = (() => {
  const m = new Map();
  let cupo = Infinity;
  const usado = () => [...m].reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      const antes = m.has(k) ? k.length + m.get(k).length : 0;
      if (usado() - antes + k.length + s.length > cupo) { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, s);
    },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); cupo = Infinity; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
    /** Desde ahora no cabe nada más. */
    lleno: () => { cupo = usado(); },
  };
})();

beforeAll(async () => {
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; H.editando=function(){ return _algEditingId; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((m, tipo) => { avisos.push({ m: String(m), tipo: tipo || 'info' }); });
});

const LAB = 11;   // Lab. Algas
const campo = (n) => document.querySelector(`#fp-algas [name="${n}"]`);
const escribir = (n, v) => { const e = campo(n); if (!e) throw new Error('sin ' + n); e.value = v; };

beforeEach(() => {
  almacen.clear();
  H._invalidateLoadE();
  avisos.length = 0;
  globalThis.confirm = () => true;
  H.setVista(LAB, 'algas');
  H.renderAlgas();
});

describe('A11 · Lab. Algas sin espacio', () => {
  it('con espacio, agrega y lo dice (el fixture ejerce algo)', () => {
    escribir('cel_ml', '280000');
    H.addToAlgHist();
    expect(H.loadAlgHist()).toHaveLength(1);
    expect(avisos.at(-1).m).toMatch(/✅ Agregado/);
  });

  it('🔴 sin espacio: no dice «✅ Agregado», dice que NO se guardó, y lo tecleado sigue en el formulario', () => {
    escribir('cel_ml', '280000');
    almacen.lleno();
    H.addToAlgHist();
    expect(H.loadAlgHist()).toHaveLength(0);
    expect(avisos.some((a) => /Agregado/.test(a.m))).toBe(false);
    expect(avisos.some((a) => a.tipo === 'err' && /NO se guardó/.test(a.m))).toBe(true);
    expect(campo('cel_ml').value).toBe('280000');
  });

  it('🔴 al EDITAR un registro, sin espacio, la edición sigue abierta con lo tecleado', () => {
    escribir('cel_ml', '280000');
    H.addToAlgHist();
    const id = H.loadAlgHist()[0].id;
    H.editAlgHistEntry(id);
    expect(H.editando()).toBe(id);
    escribir('cel_ml', '3100000');   // más largo: el registro editado ya no cabe
    almacen.lleno();
    avisos.length = 0;
    H.addToAlgHist();
    expect(avisos.some((a) => /actualizado/.test(a.m))).toBe(false);
    expect(H.editando()).toBe(id);
    expect(campo('cel_ml').value).toBe('3100000');
    expect(H.loadAlgHist()[0].data.cel_ml).not.toBe('3100000');
  });
});
