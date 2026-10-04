// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES · los tanques SIN ANIMALES se bloquean (2026-10-04)

   Pedido del usuario: «se bloquearían los tanques que no tengan ingreso, sin animales, y quedan coloreados de rojo y no
   permiten el ingreso; cuando se haya transferido o ingresado, se habilita al poner ver vivos y tener cantidad».
   Decisiones del usuario: con la referencia de vivos que haya (la de 🔄 o la guardada, aunque sea de otro día); sin
   desbloqueo a mano; sólo en la fecha de hoy; y un tanque que YA trae cifras no se bloquea: va en ámbar, avisado.
   Sin referencia o con el libro incompleto no se sabe, y no se bloquea nada. Mismo arnés que
   mad-tanques-vivos-referencia.test.js (la grilla REAL del motor).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'madTanquesSalaChange', 'madTanquesFechaChange', '_madTanquesPintaVivos', 'MAD_TQ_VIVOS_KEY'];
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

  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

/* Libro con la forma REAL de `madConstruirLibro`: en la Sala 1, el tanque 1 con animales, el 2 vaciado (0 vivos) y el 3
   sin ningún ingreso (el libro no lo conoce: «sin ingreso»). */
const libro = (extra, t2 = { machos: 0, hembras: 0 }) => Object.assign({
  posiciones: [], lotes: {}, avisos: [], hasta: '2026-10-04', fallos: [], recortadas: [],
  tanques: {
    'Sala 1|1': { sala: 'Sala 1', tanque: 1, machos: 12, hembras: 34, composicion: [] },
    'Sala 1|2': { sala: 'Sala 1', tanque: 2, ...t2, composicion: [] },
  },
}, extra || {});
const abrirSala = (sala) => {
  H.renderMadTanques();
  document.getElementById('mad-tanques-sala').value = sala;
  H.madTanquesSalaChange();
};
const fila = (tq) => document.querySelector('.tq-vivos[data-tq="' + tq + '"]').closest('tr');
const casillas = (tq) => [...fila(tq).querySelectorAll('input.pinp')];
const bloqueado = (tq) => fila(tq).classList.contains('tq-sin-animales') && casillas(tq).every((i) => i.disabled);
const libre = (tq) => !fila(tq).classList.contains('tq-sin-animales') && casillas(tq).every((i) => !i.disabled);
const nota = () => document.getElementById('tq-vivos-nota');

/* ⚠ La grilla CONSERVA la fecha de su campo entre pruebas: sin vaciarla, la de «otra fecha» dejaba 2026-01-01 y todo lo
   de después pasaba sin poder bloquear nada (lo destapó una mutación que sobrevivía). Vacía, arranca en el día de la app. */
beforeEach(() => {
  localStorage.removeItem(H.MAD_TQ_VIVOS_KEY);
  const f = document.getElementById('mad-tanques-fecha');
  if (f) f.value = '';
  abrirSala('Sala 1');
});

describe('Tanques · los tanques sin animales se bloquean', () => {
  it('sin referencia de vivos («—») no se sabe: no se bloquea nada', () => {
    expect([libre(1), libre(2), libre(3)]).toEqual([true, true, true]);
  });

  it('🔴 con 🔄 Ver vivos: 0 vivos y «sin ingreso» van en ROJO y con las casillas deshabilitadas; con animales, libre', () => {
    H._madTanquesPintaVivos(libro());
    expect(libre(1)).toBe(true);
    expect(bloqueado(2)).toBe(true);
    expect(bloqueado(3)).toBe(true);
    expect(fila(2).style.background).not.toBe('');
    expect(nota().textContent).toMatch(/🔒 \d+ sin animales, bloqueados/);
  });

  // La grilla navega con Enter y las flechas (madGridKey): una casilla deshabilitada no toma el foco, y sin saltarla el
  // técnico se quedaba PARADO delante de cada tanque vacío.
  it('🔴 Enter y las flechas SALTAN la fila de un tanque bloqueado, en las dos direcciones', () => {
    H._madTanquesPintaVivos(libro({ tanques: {
      'Sala 1|1': { sala: 'Sala 1', tanque: 1, machos: 12, hembras: 34, composicion: [] },
      'Sala 1|2': { sala: 'Sala 1', tanque: 2, machos: 0, hembras: 0, composicion: [] },
      'Sala 1|3': { sala: 'Sala 1', tanque: 3, machos: 5, hembras: 9, composicion: [] },
    } }));
    expect(libre(1) && bloqueado(2) && libre(3), 'el fixture ejerce algo: un bloqueado entre dos libres').toBe(true);
    const tecla = (el, key) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    casillas(1)[0].focus();
    tecla(casillas(1)[0], 'Enter');
    expect(document.activeElement).toBe(casillas(3)[0]);
    tecla(casillas(3)[0], 'ArrowUp');
    expect(document.activeElement).toBe(casillas(1)[0]);
  });

  it('🔴 la referencia GUARDADA también bloquea al volver a abrir la grilla (aunque nadie pulse 🔄)', () => {
    H._madTanquesPintaVivos(libro());
    abrirSala('Sala 2');
    abrirSala('Sala 1');
    expect(bloqueado(2)).toBe(true);
    expect(libre(1)).toBe(true);
  });

  it('🔴 tras una transferencia o un ingreso, 🔄 Ver vivos con cantidad lo HABILITA', () => {
    H._madTanquesPintaVivos(libro());
    expect(bloqueado(2)).toBe(true);
    H._madTanquesPintaVivos(libro(null, { machos: 0, hembras: 5 }));
    expect(libre(2)).toBe(true);
    expect(fila(2).style.background).toBe('');
  });

  it('un tanque sin animales que YA trae cifras no se bloquea: queda editable, en ámbar y avisado', () => {
    casillas(2)[0].value = '1';
    H._madTanquesPintaVivos(libro());
    expect(libre(2)).toBe(true);
    expect(fila(2).classList.contains('tq-sin-animales-aviso')).toBe(true);
    expect(nota().textContent).toContain('sin animales pero con cifras');
  });

  it('en OTRA fecha que la de hoy no se bloquea, y la nota lo dice', () => {
    H._madTanquesPintaVivos(libro());                     // deja la referencia guardada
    document.getElementById('mad-tanques-fecha').value = '2026-01-01';
    H.madTanquesFechaChange();
    expect([libre(2), libre(3)]).toEqual([true, true]);
    expect(nota().textContent).toContain('sólo se bloquean en la fecha de hoy');
  });

  it('con el libro INCOMPLETO no se sabe: no se bloquea nada (y el mismo tanque, con el libro completo, sí)', () => {
    H._madTanquesPintaVivos(libro({ fallos: ['Maduración Ingreso'] }));
    expect([libre(2), libre(3)]).toEqual([true, true]);
    H._madTanquesPintaVivos(libro());                     // el fixture ejerce algo: aquí SÍ se bloquea
    expect(bloqueado(2)).toBe(true);
  });
});
