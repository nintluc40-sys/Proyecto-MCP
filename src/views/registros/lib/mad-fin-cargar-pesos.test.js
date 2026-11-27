// @vitest-environment happy-dom
/* ============================================================
   PEDIDO DEL 26-11 · Fin de Ciclo · ⬇ Cargar los pesos promedio del lote (madFinPesosDelLote / madFinCargarPesos).
   Decisiones del usuario: el ÚLTIMO peso registrado de cada tanque donde está el lote (el de Alimentación), promedio
   PONDERADO por los animales de ese sexo, y los tanques MIXTOS cuentan. Motor REAL. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madFinPesosDelLote', 'madFinCargarPesos', '_madFinCardHTML'];
const H = {};
const avisos = [];

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\nH.poner=function(n,v){ eval(n+"=v"); };\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast((m, t) => { avisos.push({ m: String(m), t }); });
});
beforeEach(() => { globalThis.localStorage.clear(); avisos.length = 0; });

const ing = (Fecha, Lote, Sala, Tanque, Machos, Hembras, pm, ph) => ({ Fecha, Lote, 'Código genético': 'CG', Sala, Tanque, Machos, Hembras,
  'Peso promedio machos (g)': pm, 'Peso promedio hembras (g)': ph });
const tq = (Fecha, Sala, Tanque, pm, ph) => ({ Fecha, Sala, Tanque, 'Machos muertos': 0, 'Hembras muertas': 0, 'Peso promedio machos (g)': pm, 'Peso promedio hembras (g)': ph });
/* El lote A en dos tanques: T1 solo (60 ♂ · 40 ♀) y T2 con el B (20 ♂ · 10 ♀ de A). La biometría del 10-01 es la última hasta
   el 12-01; la del 20-01 es posterior y no cuenta para un cierre del 12-01. */
const fuentes = () => ({
  ingresos: [ing('2026-01-02', 'A', 'Sala 1', 1, 60, 40, 40, 50), ing('2026-01-02', 'A', 'Sala 1', 2, 20, 10, 40, 50),
    ing('2026-01-02', 'B', 'Sala 1', 2, 10, 10, 30, 35)],
  movimientos: [], cierres: [], mortDesove: [],
  tanques: [tq('2026-01-10', 'Sala 1', 1, 54, 66), tq('2026-01-10', 'Sala 1', 2, 48, 70), tq('2026-01-20', 'Sala 1', 1, 99, 99)],
  alimentacion: [],
});

describe('madFinPesosDelLote', () => {
  it('🔴 el último peso de cada tanque, ponderado por los animales de cada sexo; el mixto cuenta y se marca', () => {
    const r = H.madFinPesosDelLote(fuentes(), 'A', '2026-01-12');
    expect(r.machos).toEqual({ valor: 52.5, tanques: 2, animales: 80 });      // (54·60 + 48·20) / 80
    expect(r.hembras).toEqual({ valor: 66.8, tanques: 2, animales: 50 });     // (66·40 + 70·10) / 50
    expect(r.tanques.map((t) => [t.tanque, t.mixto])).toEqual([[1, false], [2, true]]);
  });
  it('🔴 no es la media simple entre tanques, ni usa una biometría POSTERIOR a la fecha', () => {
    const r = H.madFinPesosDelLote(fuentes(), 'A', '2026-01-12');
    expect(r.machos.valor).not.toBe(51);
    const despues = H.madFinPesosDelLote(fuentes(), 'A', '2026-01-21');
    expect(despues.machos.valor).toBe(Math.round(((99 * 60 + 48 * 20) / 80) * 100) / 100);
  });
  it('el lote se reconoce en minúsculas y con espacios; un lote que no está no da tanques', () => {
    expect(H.madFinPesosDelLote(fuentes(), ' a ', '2026-01-12').machos.valor).toBe(52.5);
    expect(H.madFinPesosDelLote(fuentes(), 'Z', '2026-01-12').tanques).toEqual([]);
  });
  it('🔴 con el cierre Total del lote ya en la hoja ese día, toma los tanques del día anterior', () => {
    const f = fuentes();
    f.cierres = [{ Fecha: '2026-01-12', Lote: 'A', Tipo: 'Total', Machos: 80, Hembras: 50 }];
    const r = H.madFinPesosDelLote(f, 'A', '2026-01-12');
    expect(r.tanques).toHaveLength(2);
    expect(r.machos.valor).toBe(52.5);
  });
});

describe('⬇ Cargar en la tarjeta de cierre', () => {
  it('🔴 rellena los dos pesos con lo del lote, dispara «input» y lo explica en su nota', async () => {
    H.poner('madSaldoCargar', async () => ({ fallos: [], recortadas: [] }));
    H.poner('madLibroFuentes', fuentes);
    H.poner('_reproFetchSheet', async () => []);
    const box = document.createElement('div');
    box.innerHTML = H._madFinCardHTML('2026-01-12');
    document.body.appendChild(box);
    const c = box.querySelector('.mf-cierre');
    const fe = document.getElementById('mf-fecha') || Object.assign(document.body.appendChild(document.createElement('input')), { id: 'mf-fecha' });
    fe.value = '2026-01-12';
    c.querySelector('.mf-lote').value = 'A';
    let inputs = 0; c.addEventListener('input', () => { inputs++; });
    const btn = c.querySelector('.mf-pcargar');
    expect(btn.textContent).toContain('Cargar');
    expect(btn.getAttribute('onclick')).toBe('madFinCargarPesos(this)');
    expect(btn.hidden).toBe(false);
    await H.madFinCargarPesos(btn);
    expect(c.querySelector('.mf-ppm').value).toBe('52.5');
    expect(c.querySelector('.mf-pph').value).toBe('66.8');
    expect(inputs).toBe(2);
    expect(c.querySelector('.mf-pnota').textContent).toMatch(/Mixtos .*Sala 1 T2/);
    expect(btn.disabled).toBe(false);
  });
  it('sin lote, avisa y no lee nada', async () => {
    let leidas = 0;
    H.poner('madSaldoCargar', async () => { leidas++; return { fallos: [], recortadas: [] }; });
    const box = document.createElement('div');
    box.innerHTML = H._madFinCardHTML('2026-01-12');
    await H.madFinCargarPesos(box.querySelector('.mf-pcargar'));
    expect(leidas).toBe(0);
    expect(avisos.at(-1).m).toMatch(/lote/);
  });
});
