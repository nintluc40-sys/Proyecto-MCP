// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES Y MOVIMIENTOS · la PISCINA de origen en la celda de vivos (2026-11-09)

   Pedido del usuario: en la columna «Vivos» de 🛢 Tanques, junto al lote o lotes y las cifras, «que se visualice la o
   las piscinas de origen de los animales de dicho tanque», y que lo ponga también «🔄 Ver vivos». La forma, con
   valores inventados: `AB+AC (101,101) · 12♂ 34♀ · 46`.

   Decisiones del usuario:
   · «Una por lote»: en el orden de los lotes, aunque se repita; un lote con dos piscinas en el tanque, unidas por «/»
     (`AB+AC (101/102,103)`), como ya escribe Desoves sus parejas.
   · «En las dos»: Movimientos («🔄 Ver saldo de los orígenes») dice lo mismo, por la regla del 24-09 (una sola función
     escribe las dos celdas; `mad-saldo-origen-total.test.js` exige que coincidan).

   🔑 DE DÓNDE SALE. Del Ingreso, por (lote, código genético): el lote solo NO basta —un mismo lote puede venir de dos
   piscinas—, y el libro sigue a los animales de cada tanque por lote y código, así que cada tanque sabe la suya sin
   tocar el cálculo del libro.

   Vive sólo en el monolito, así que se arranca ENTERO sobre happy-dom (la receta del banco de `engine.js`).
   Valores INVENTADOS (regla del usuario, 2026-09-18): lotes, códigos y piscinas no son los del libro.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadMovimientos', '_madMovPintaSaldo', 'madMovSalaChange', 'renderMadTanques',
  'madTanquesSalaChange', '_madTanquesPintaVivos', 'madPiscinasDeTanque', '_reproPutRows', 'MAD_LIBRO_SHEETS',
  'MAD_TQ_VIVOS_KEY', 'today'];
const H = {};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };

  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);

  /* ⚠ `new Function` NO deja nada en globalThis: sin este epílogo no se alcanza ninguna función del monolito. */
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

/* ── Piezas ─────────────────────────────────────────────────── */
const comp = (lote, codigoGenetico, machos, hembras) => ({ lote, codigoGenetico, machos, hembras });
const tanque = (sala, tq, composicion) => ({
  sala, tanque: tq, composicion,
  machos: composicion.reduce((s, c) => s + c.machos, 0),
  hembras: composicion.reduce((s, c) => s + c.hembras, 0),
});
/* Una fila del Ingreso con las cabeceras REALES de la hoja; la piscina, como número, que es como llega. */
const ing = (lote, codigo, piscina) => ({ Lote: lote, 'Código genético': codigo, 'Piscina Broodstock': piscina });

/* La forma del ejemplo del usuario, con valores inventados: dos lotes de la MISMA piscina, en un tanque mezclado y a
   propósito DESORDENADO en la composición (el nombre sale ordenado, y las piscinas en ese mismo orden). */
const T_MEZCLA = tanque('Sala 1', 1, [comp('BC', 'COD-2', 10, 20), comp('BA', 'COD-1', 20, 30)]);
const INGRESOS = [ing('BA', 'COD-1', 101), ing('BC', 'COD-2', 101), ing('AC', 'COD-1', 102), ing('AC', 'COD-2', 103)];

/* ── 1 · La regla, sola ─────────────────────────────────────── */
describe('madPiscinasDeTanque · una por lote, en el orden de los lotes', () => {
  it('🔴 dos lotes de la misma piscina: se repite, una por lote («101,101»)', () => {
    expect(H.madPiscinasDeTanque(T_MEZCLA, INGRESOS)).toBe('101,101');
  });

  it('🔴 cada piscina va en el lugar de SU lote: el orden es el del nombre, no el de la composición', () => {
    const T = tanque('Sala 1', 10, [comp('BC', 'COD-9', 4, 4), comp('BA', 'COD-1', 3, 3)]);
    expect(H.madPiscinasDeTanque(T, [ing('BC', 'COD-9', 105), ing('BA', 'COD-1', 101)])).toBe('101,105');
  });

  it('🔴 un lote con DOS piscinas en el tanque (dos códigos): unidas por «/», en orden', () => {
    const T = tanque('Sala 1', 2, [comp('AC', 'COD-2', 5, 5), comp('AC', 'COD-1', 5, 5)]);
    expect(H.madPiscinasDeTanque(T, INGRESOS)).toBe('102/103');
  });

  it('🔴 las piscinas de un lote se ordenan como números (9 antes que 10), no como texto', () => {
    const T = tanque('Sala 1', 3, [comp('AB', 'C-10', 1, 1), comp('AB', 'C-9', 1, 1)]);
    expect(H.madPiscinasDeTanque(T, [ing('AB', 'C-10', 10), ing('AB', 'C-9', 9)])).toBe('9/10');
  });

  it('🔴 la PAREJA lote + código decide, no el lote solo: el mismo lote, con otro código, es otra piscina', () => {
    const soloCod1 = tanque('Sala 1', 4, [comp('AC', 'COD-1', 3, 3)]);
    expect(H.madPiscinasDeTanque(soloCod1, INGRESOS)).toBe('102');
  });

  it('🔴 la que el Ingreso no conoce sale «?», y junto a las conocidas va al final', () => {
    expect(H.madPiscinasDeTanque(tanque('Sala 1', 5, [comp('AB', 'COD-X', 2, 2)]), INGRESOS)).toBe('?');
    const T = tanque('Sala 1', 6, [comp('AC', 'COD-X', 2, 2), comp('AC', 'COD-1', 2, 2)]);
    expect(H.madPiscinasDeTanque(T, INGRESOS)).toBe('102/?');
  });

  it('sólo cuentan los lotes con animales VIVOS, como el nombre del tanque', () => {
    const T = tanque('Sala 1', 7, [comp('AC', 'COD-1', 0, 0), comp('BA', 'COD-1', 4, 6)]);
    expect(H.madPiscinasDeTanque(T, INGRESOS)).toBe('101');
  });

  it('las llaves se comparan como en el libro: sin espacios de más', () => {
    expect(H.madPiscinasDeTanque(tanque('Sala 1', 8, [comp('BA', 'COD-1', 1, 1)]), [ing(' BA ', 'COD-1 ', ' 101 ')])).toBe('101');
  });

  it('sin ninguna fila de Ingreso no se sabe ninguna y no se dice nada; un tanque vaciado, tampoco', () => {
    expect(H.madPiscinasDeTanque(T_MEZCLA, [])).toBe('');
    expect(H.madPiscinasDeTanque(T_MEZCLA, null)).toBe('');
    expect(H.madPiscinasDeTanque(tanque('Sala 1', 9, [comp('BA', 'COD-1', 0, 0)]), INGRESOS)).toBe('');
  });
});

/* ── 2 · En las dos pantallas ───────────────────────────────── */
const libroCon = (tanques, extra) => Object.assign({
  posiciones: [], lotes: {}, avisos: [], hasta: '2026-01-01', fallos: [], recortadas: [], tanques,
}, extra || {});
const LIBRO = () => libroCon({
  'Sala 1|1': T_MEZCLA,
  'Sala 1|2': tanque('Sala 1', 2, [comp('AC', 'COD-1', 10, 12), comp('AC', 'COD-2', 8, 9)]),
  'Sala 1|3': tanque('Sala 1', 3, [comp('BA', 'COD-1', 0, 0)]),
  'Sala 4|5': tanque('Sala 4', 5, [comp('BA', 'COD-1', 7, 7)]),
});
const ESPERADO_1 = 'BA+BC (101,101) · 30♂ 50♀ · 80';
const ESPERADO_2 = 'AC (102/103) · 18♂ 21♀ · 39';

const abrirSala = (sala) => {
  H.renderMadTanques();
  document.getElementById('mad-tanques-sala').value = sala;
  H.madTanquesSalaChange();
};
const celdaTq = (tq) => document.querySelector('.tq-vivos[data-tq="' + tq + '"]');
function celdaOrigen(sala, tq) {
  H.renderMadMovimientos();
  const tr = document.querySelector('#mv-tramos tr.mv-tramo');
  const so = tr.querySelector('.mv-so');
  so.value = sala;
  H.madMovSalaChange(so);
  tr.querySelector('.mv-to').value = String(tq);
  return tr.querySelector('.mv-saldo-o');
}

beforeEach(() => {
  localStorage.removeItem(H.MAD_TQ_VIVOS_KEY);
  H._reproPutRows(H.MAD_LIBRO_SHEETS.ingreso, INGRESOS);
});

describe('🛢 Tanques · «🔄 Ver vivos» con la piscina de origen', () => {
  it('🔴 recién leído: lotes, sus piscinas entre paréntesis y las cifras', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(LIBRO());
    expect(celdaTq(1).textContent).toBe(ESPERADO_1);
    expect(celdaTq(2).textContent).toBe(ESPERADO_2);
  });

  it('un tanque vaciado sigue sin lote ni piscina', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(LIBRO());
    expect(celdaTq(3).textContent).toBe('0♂ 0♀ · 0');
  });

  it('🔴 la referencia guardada lleva las piscinas, y el repintado desde ella dice lo MISMO', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(LIBRO());
    const g = JSON.parse(localStorage.getItem(H.MAD_TQ_VIVOS_KEY));
    expect(g.tanques['Sala 1|1'].piscinas).toBe('101,101');
    expect(g.tanques['Sala 4|5'].piscinas).toBe('101');            // también la sala que no estaba en pantalla
    H._reproPutRows(H.MAD_LIBRO_SHEETS.ingreso, []);                 // ya sin las filas: sale de lo guardado
    abrirSala('Sala 4');
    expect(celdaTq(5).textContent).toBe('BA (101) · 7♂ 7♀ · 14');
    abrirSala('Sala 1');
    expect(celdaTq(1).textContent).toBe(ESPERADO_1);
  });

  it('una referencia guardada ANTES de esto (sin piscinas) enseña los lotes solos hasta el próximo 🔄', () => {
    localStorage.setItem(H.MAD_TQ_VIVOS_KEY, JSON.stringify({ ts: Date.now(), hoy: H.today(),
      tanques: { 'Sala 1|1': { machos: 30, hembras: 50, lotes: 'BA+BC' } } }));
    abrirSala('Sala 1');
    expect(celdaTq(1).textContent).toBe('BA+BC · 30♂ 50♀ · 80');
  });

  it('con el libro a medias se enseña igual, pero NO se guarda como referencia', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(libroCon(LIBRO().tanques, { fallos: ['Maduración Tanques'] }));
    expect(celdaTq(1).textContent).toBe(ESPERADO_1);
    expect(localStorage.getItem(H.MAD_TQ_VIVOS_KEY)).toBeNull();
  });

  it('sin filas de Ingreso, la celda sigue como antes: lotes y cifras, sin paréntesis', () => {
    H._reproPutRows(H.MAD_LIBRO_SHEETS.ingreso, []);
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(LIBRO());
    expect(celdaTq(1).textContent).toBe('BA+BC · 30♂ 50♀ · 80');
  });
});

describe('Movimientos · «🔄 Ver saldo de los orígenes» dice lo MISMO que Tanques', () => {
  it('🔴 el origen enseña también las piscinas', () => {
    const c = celdaOrigen('Sala 1', 1);
    H._madMovPintaSaldo(LIBRO());
    expect(c.textContent).toBe(ESPERADO_1);
  });

  it('🔑 las dos celdas del mismo tanque coinciden, piscinas incluidas', () => {
    const mov = celdaOrigen('Sala 1', 2);
    H._madMovPintaSaldo(LIBRO());
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(LIBRO());
    expect(mov.textContent).toBe(ESPERADO_2);
    expect(celdaTq(2).textContent).toBe(mov.textContent);
  });
});
