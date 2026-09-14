// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES · los «vivos» quedan como REFERENCIA local hasta re-estimarlos (2026-09-14)

   Pedido del usuario: «que al presionar para ver vivos, dicho dato se quede local hasta que se
   estime otra vez, para que así podamos tener siempre una referencia».

   🔴 LO QUE PASABA. «🔄 Ver vivos» lee las hojas (2–52 s) y pinta las celdas, pero cualquier
   repintado de la grilla —cambiar de sala o de fecha, guardar— o recargar la app las devolvía a
   «—»: había que volver a esperar la lectura para tener otra vez la cifra.

   🔑 CÓMO QUEDA. Un «Ver vivos» con el libro COMPLETO guarda en el dispositivo los vivos de TODOS
   los tanques (de todas las salas) con su fecha y hora; la grilla los enseña al pintarse, con una
   nota que dice de cuándo son. Sólo otro «Ver vivos» los sustituye. Sigue SIN ir a la hoja: es
   una vista derivada, y la nota con la fecha es lo que impide que una cifra vieja se lea como
   de hoy. Un libro INCOMPLETO se enseña con su aviso pero NO pisa una referencia buena.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'madTanquesSalaChange', '_madTanquesPintaVivos', 'MAD_TQ_VIVOS_KEY', 'today'];
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

/* Libro con la forma REAL de `madConstruirLibro`. Dos salas, para comprobar que la referencia
   cubre también la sala que no estaba en pantalla al estimar. */
const libroCon = (extra, machos = 12) => Object.assign({
  posiciones: [], lotes: {}, avisos: [], hasta: '2026-09-14', fallos: [], recortadas: [],
  tanques: {
    'Sala 1|1': { sala: 'Sala 1', tanque: 1, machos, hembras: 34, composicion: [] },
    'Sala 4|2': { sala: 'Sala 4', tanque: 2, machos: 5, hembras: 7, composicion: [] },
  },
}, extra || {});

const abrirSala = (sala) => {
  H.renderMadTanques();
  document.getElementById('mad-tanques-sala').value = sala;
  H.madTanquesSalaChange();
};
const celda = (tq) => document.querySelector('.tq-vivos[data-tq="' + tq + '"]');
const nota = () => document.getElementById('tq-vivos-nota');

beforeEach(() => { localStorage.removeItem(H.MAD_TQ_VIVOS_KEY); });

describe('Tanques · los vivos quedan como referencia local', () => {
  it('el fixture ejerce algo: sin referencia guardada la celda dice «—»', () => {
    abrirSala('Sala 1');
    expect(celda(1).textContent).toBe('—');
  });

  it('🔴 tras «Ver vivos», al repintar la grilla la cifra SIGUE ahí', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(libroCon());
    expect(celda(1).textContent).toBe('12♂ 34♀ · 46');
    abrirSala('Sala 2');
    abrirSala('Sala 1');                                   // repintado completo
    expect(celda(1).textContent).toBe('12♂ 34♀ · 46');
  });

  it('🔴 se guarda en el dispositivo (sobrevive a recargar la app)', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(libroCon());
    const g = JSON.parse(localStorage.getItem(H.MAD_TQ_VIVOS_KEY));
    expect(g && g.ts).toBeGreaterThan(0);
    expect(g.tanques['Sala 1|1']).toEqual({ machos: 12, hembras: 34 });
  });

  it('🔴 la referencia cubre TODAS las salas, no sólo la que estaba en pantalla', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(libroCon());
    abrirSala('Sala 4');
    expect(celda(2).textContent).toBe('5♂ 7♀ · 12');
  });

  it('🔴 la nota dice que es una REFERENCIA y de cuándo es', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(libroCon());
    abrirSala('Sala 1');
    expect(nota().textContent).toMatch(/Referencia/);
    expect(nota().textContent).toMatch(/\d{2}\/\d{2} \d{2}:\d{2}/);
  });

  it('🔴 volver a estimar SUSTITUYE la referencia', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(libroCon());
    H._madTanquesPintaVivos(libroCon(null, 10));
    abrirSala('Sala 1');
    expect(celda(1).textContent).toBe('10♂ 34♀ · 44');
  });

  it('🔴 un libro INCOMPLETO no pisa una referencia buena', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(libroCon());
    H._madTanquesPintaVivos(libroCon({ fallos: ['Maduración Ingreso'] }, 99));
    expect(nota().textContent).toMatch(/INCOMPLETO/);
    abrirSala('Sala 1');
    expect(celda(1).textContent).toBe('12♂ 34♀ · 46');
  });

  it('con la referencia completa, un tanque que no aparece en ella dice «sin ingreso»', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(libroCon());
    abrirSala('Sala 1');
    expect(celda(2).textContent).toBe('sin ingreso');
  });

  it('una referencia de OTRO día se marca en ámbar para que no se lea como de hoy', () => {
    abrirSala('Sala 1');
    H._madTanquesPintaVivos(libroCon());
    const g = JSON.parse(localStorage.getItem(H.MAD_TQ_VIVOS_KEY));
    g.hoy = '2020-01-01';
    g.ts = new Date('2020-01-01T08:30:00').getTime();
    localStorage.setItem(H.MAD_TQ_VIVOS_KEY, JSON.stringify(g));
    abrirSala('Sala 1');
    expect(nota().innerHTML).toContain('#92400e');
    expect(nota().textContent).toContain('01/01');
  });

  it('una referencia ilegible no rompe la grilla: se ignora', () => {
    localStorage.setItem(H.MAD_TQ_VIVOS_KEY, '{no es json');
    abrirSala('Sala 1');
    expect(celda(1).textContent).toBe('—');
  });
});
