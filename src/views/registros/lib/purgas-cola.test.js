// @vitest-environment happy-dom
/* ============================================================
   SIN ESPACIO, LO QUE ESPERA EN LA COLA NO SE PURGA · Y LO DE COMODIDAD NO PURGA (punto 25 de la pauta del 2026-11-12)

   Lo que pasaba (medido en el código el 14-11):
   · Para hacer sitio, `_purgeMadHistPaneles` soltaba TODAS las copias para ✏️ Editar del 📜 Historial de Maduración y
     `_purgeMadHistViejo` la mitad más vieja (hasta tres veces), también las de envíos que siguen esperando en la COLA: llegan
     igual, pero ya no se pueden ver ni corregir desde el equipo (el formulario se limpió al encolarse). Igual el «sin espacio»
     de `_madHistGuardar`. Decisión del usuario: «No se tocan nunca».
   · Lo disparaba cualquier escritura que no cupiera, también las de COMODIDAD: la «referencia de vivos» de 🛢 Tanques y la
     copia del autoguardado de cada minuto (con una grilla tecleada y el equipo lleno, cada minuto el Historial a la mitad).
     Decisión del usuario: «No, sólo lo necesario» — si una copia de comodidad no cabe, no se guarda y no suelta nada. Al salir
     del módulo la copia SÍ puede hacerse sitio (entonces es lo único que guarda lo tecleado).

   El almacén es de este archivo y tiene un CUPO TOTAL, como el del navegador: `llenar(libre)` deja exactamente `libre`
   caracteres de sitio; lo que se borra deja sitio para lo demás.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['MAD_MOD', 'MAD_HIST_KEY', 'MAD_HIST_PANEL_PRE', 'MAD_RECOV_KEY', 'MAD_TQ_VIVOS_KEY', 'SYNCQ_KEY',
  '_purgeMadHistPaneles', '_purgeMadHistViejo', '_madHistGuardar', 'madHistLeer', '_madTqVivosGuardar', 'saveMadRecovery',
  'startAutoRecovery', 'renderMadSalas', '_gasVersionLocal'];
const H = {};

const almacen = (() => {
  const m = new Map();
  let cupo = Infinity;
  const total = () => { let t = 0; for (const [k, v] of m) t += k.length + v.length; return t; };
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      const antes = m.has(k) ? k.length + m.get(k).length : 0;
      if (total() - antes + k.length + s.length > cupo) { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, s);
    },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); cupo = Infinity; },
    /** Deja exactamente `libre` caracteres de sitio sobre lo que ya hay. */
    llenar: (libre = 0) => { cupo = total() + libre; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
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
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}'
    + '\ntry{ H.sucia=function(){ return _madGridDirty; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast(() => {});
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) };
  };
});

beforeEach(() => { almacen.clear(); });

/* Ocho envíos de Fin de Ciclo de hoy; el MÁS VIEJO (h0) sigue en la cola. */
const entrada = (i, extra = {}) => ({ id: 'h' + i, ficha: 'fin', envio: 'env' + i, ts: Date.now() - (100 - i) * 1000, fecha: '2026-11-14',
  filas: 1, panel: true, payload: { sheetName: 'Maduración Fin', headers: ['ID', 'Lote'], rows: [['r' + i, 'LOTE-PRUEBA']] }, ...extra });
const ocho = () => Array.from({ length: 8 }, (_, i) => entrada(i));
const enCola = (...envios) => almacen.setItem(H.SYNCQ_KEY, JSON.stringify(envios.map((e, i) => ({ reqId: 'q' + i, ts: Date.now(),
  payload: { sheetName: 'Maduración Fin', headers: ['ID'], rows: [['x']] }, mark: { kind: 'madlog:fin', keys: [e] } }))));
const copia = (id, n = 12) => almacen.setItem(H.MAD_HIST_PANEL_PRE + id, '<div>' + 'x'.repeat(n) + '</div>');
const copias = () => { const n = []; for (let i = 0; i < almacen.length; i++) { const k = almacen.key(i); if (k.indexOf(H.MAD_HIST_PANEL_PRE) === 0) n.push(k.slice(H.MAD_HIST_PANEL_PRE.length)); } return n.sort(); };
const ids = () => H.madHistLeer().map((e) => e.id).sort();

describe('📜 sin espacio, lo que espera en la COLA no se purga (usuario: «No se tocan nunca»)', () => {
  it('🔴 _purgeMadHistPaneles suelta las copias para Editar MENOS la de lo que espera en la cola', () => {
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify(ocho()));
    ocho().forEach((e) => copia(e.id));
    enCola('env0');
    expect(H._purgeMadHistPaneles()).toContain('7 copia(s)');
    expect(copias(), 'se soltó la copia de lo que espera en la cola').toEqual(['h0']);
  });

  it('sin nada en la cola, las suelta todas (como antes)', () => {
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify(ocho()));
    ocho().forEach((e) => copia(e.id));
    H._purgeMadHistPaneles();
    expect(copias()).toEqual([]);
  });

  it('🔴 _purgeMadHistViejo deja la mitad más reciente Y lo que espera en la cola, con su copia', () => {
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify(ocho()));
    ocho().forEach((e) => copia(e.id));
    enCola('env0');
    expect(H._purgeMadHistViejo()).toContain('3 envío(s)');
    expect(ids(), 'el más viejo espera en la cola: se queda').toEqual(['h0', 'h4', 'h5', 'h6', 'h7']);
    expect(copias()).toEqual(['h0', 'h4', 'h5', 'h6', 'h7']);
  });

  it('🔴 si todo lo viejo espera en la cola, no hay nada que soltar (null): no se toca', () => {
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify(ocho()));
    enCola('env0', 'env1', 'env2', 'env3');
    expect(H._purgeMadHistViejo()).toBeNull();
    expect(ids()).toHaveLength(8);
  });

  it('🔴 el «sin espacio» de _madHistGuardar: suelta las copias de lo enviado, NO la de lo que espera en la cola', () => {
    ocho().forEach((e) => copia(e.id, 2000));           // copias grandes: soltarlas basta
    enCola('env0');
    almacen.llenar(400);                                 // el historial (~8 entradas) no cabe hasta soltar las copias
    expect(H._madHistGuardar(ocho())).toBe(true);
    expect(copias(), 'la copia de lo que espera en la cola').toEqual(['h0']);
    const h0 = H.madHistLeer().find((e) => e.id === 'h0');
    expect(h0 && h0.panel, 'lo que espera en la cola sigue con su ✏️ Editar').toBe(true);
    expect(H.madHistLeer().filter((e) => e.panel)).toHaveLength(1);
    expect(ids()).toHaveLength(8);
  });

  it('🔴 y si ni así cabe y se guarda la mitad, lo que espera en la cola entra aunque sea de la mitad vieja', () => {
    ocho().forEach((e) => copia(e.id));                 // copias pequeñas: soltarlas no basta
    enCola('env0');
    const u = JSON.stringify(ocho()).length / 8;
    almacen.llenar(Math.round(5 * u + 40));             // caben ~5 entradas: la mitad (4) y lo de la cola
    expect(H._madHistGuardar(ocho())).toBe(true);
    expect(ids(), 'se perdió lo que espera en la cola').toContain('h0');
    expect(ids()).toEqual(['h0', 'h4', 'h5', 'h6', 'h7']);
  });
});

describe('Lo de COMODIDAD no se hace sitio soltando nada (usuario: «No, sólo lo necesario»)', () => {
  const historialEnviado = () => { almacen.setItem(H.MAD_HIST_KEY, JSON.stringify(ocho())); ocho().forEach((e) => copia(e.id, 300)); };

  it('🔴 la referencia de vivos de 🛢 Tanques: si no cabe, no se guarda y el Historial sigue entero', () => {
    historialEnviado();
    almacen.llenar(0);
    const ok = H._madTqVivosGuardar({ tanques: { T1: { machos: 3, hembras: 4, composicion: [] } } }, []);
    expect(ok).toBe(false);
    expect(almacen.getItem(H.MAD_TQ_VIVOS_KEY)).toBeNull();
    expect(copias(), 'soltó las copias para Editar').toHaveLength(8);
    expect(ids()).toHaveLength(8);
  });

  describe('la copia del autoguardado de Maduración', () => {
    beforeEach(() => {
      H.setVista(H.MAD_MOD, 'salas');
      document.getElementById('fp-salas').innerHTML = '';
      H.renderMadSalas();
      const t = document.querySelector('#fp-salas input[name^="sg_0_temp_"]');
      t.value = '28.5'; t.dispatchEvent(new Event('input', { bubbles: true }));
      expect(H.sucia(), 'la grilla no quedó «sin guardar»').toBe(true);
    });
    afterEach(() => { vi.useRealTimers(); });

    it('🔴 la de cada minuto: si no cabe, no se guarda y el Historial sigue entero (antes lo recortaba)', () => {
      historialEnviado();
      almacen.llenar(0);
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      H.startAutoRecovery();
      vi.advanceTimersByTime(60000);
      expect(copias(), 'soltó las copias para Editar').toHaveLength(8);
      expect(ids()).toHaveLength(8);
      expect(almacen.getItem(H.MAD_RECOV_KEY)).toBeNull();
    });

    it('la de la SALIDA del módulo sí se hace sitio con lo ya enviado (es lo único que guarda lo tecleado)', () => {
      historialEnviado();
      almacen.llenar(0);
      expect(H.saveMadRecovery()).toBe(true);
      expect(almacen.getItem(H.MAD_RECOV_KEY)).not.toBeNull();
      expect(copias().length, 'para hacerse sitio soltó copias de lo enviado').toBeLessThan(8);
    });
  });
});
