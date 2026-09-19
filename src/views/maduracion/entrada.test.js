// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · la entrada del menú (F1)

   Decisión del usuario (2026-09-19): una sola entrada con el selector 🐚 Operativo | 🧬 Microchips, que ABRE en
   Operativo; Microchips, tal cual. Se exige que abra en el operativo (que llega diferido), que el selector cambie
   de familia y la recuerde al volver a la vista, que pulsar la que ya está abierta no repinte, y que un fallo al
   cargar el tablero se diga en pantalla, escapado. Cada prueba carga los módulos de nuevo: la familia elegida vive
   lo que dura la sesión.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: vi.fn(),
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

/* Una hembra con un desove (Microchips) y un ingreso del operativo: las dos familias tienen algo que pintar. */
const FILAS = [
  { _SheetOrigin: 'Maduración MATRIZ', 'Trovan ID': 'A1', 'Número': '1', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' },
  { _SheetOrigin: 'Maduración Bitácora', 'Trovan ID': 'A1', Fecha: '2026-06-01', Tipo: 'Desove' },
  { _SheetOrigin: 'Maduracion', 'Camaronera origen': 'X', Fecha: '01/09/2026', Lote: 'QA', 'Código genético': 'CA', Sala: 'Sala 1', Tanque: '1', Machos: '5', Hembras: '5' },
];

let root, store, maduracionEntrada, errSpy;
async function cargar() {
  vi.resetModules();
  ({ store } = await import('../../core/store.js'));
  ({ maduracionEntrada } = await import('./entrada.js'));
  store.globalData = FILAS;
}
const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
const boton = (r, f) => r.querySelector(`[data-mad-fam="${f}"]`);
const titulo = (r) => { const t = r.querySelector('.mad-cuerpo .mc-title'); return t ? t.textContent : null; };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 19, 10, 0, 0));
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  root.remove();
  errSpy.mockRestore();
  vi.useRealTimers();
  vi.doUnmock('./operativo.view.js');
});

describe('Maduración · la entrada: 🐚 Operativo | 🧬 Microchips', () => {
  it('abre en Operativo: el selector con las dos familias y el tablero, que llega DIFERIDO', async () => {
    await cargar();
    const listo = maduracionEntrada(root);
    expect(root.querySelector('.mad-cuerpo').textContent).toContain('Cargando el tablero del operativo');
    await listo;
    expect([...root.querySelectorAll('[data-mad-fam]')].map((b) => b.textContent.trim())).toEqual(['🐚 Operativo', '🧬 Microchips']);
    expect(boton(root, 'operativo').classList.contains('is-on')).toBe(true);
    expect(boton(root, 'operativo').getAttribute('aria-pressed')).toBe('true');
    expect(boton(root, 'microchips').getAttribute('aria-pressed')).toBe('false');
    expect(titulo(root)).toBe('Operativo');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('cambia a Microchips (tal cual) y vuelve; la familia se recuerda al volver a la vista', async () => {
    await cargar();
    await maduracionEntrada(root);
    click(boton(root, 'microchips'));
    expect(titulo(root)).toBe('Microchips');
    expect(boton(root, 'microchips').classList.contains('is-on')).toBe(true);
    expect(root.querySelectorAll('.mc-kpi').length).toBeGreaterThanOrEqual(6);
    // Volver a la vista (el router pinta en un contenedor nuevo): sigue en Microchips.
    const otra = document.createElement('div');
    document.body.appendChild(otra);
    await maduracionEntrada(otra);
    expect(titulo(otra)).toBe('Microchips');
    click(boton(otra, 'operativo'));
    await vi.waitFor(() => expect(titulo(otra)).toBe('Operativo'));
    otra.remove();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('pulsar la familia que ya está abierta no repinta', async () => {
    await cargar();
    await maduracionEntrada(root);
    const cuerpo = root.querySelector('.mad-cuerpo');
    click(boton(root, 'operativo'));
    expect(root.querySelector('.mad-cuerpo')).toBe(cuerpo);
  });

  it('si el tablero no carga, lo dice en pantalla, con el mensaje escapado', async () => {
    vi.doMock('./operativo.view.js', () => ({ operativoView: () => { throw new Error('<b>sin red</b>'); } }));
    await cargar();
    await maduracionEntrada(root);
    const cuerpo = root.querySelector('.mad-cuerpo');
    expect(cuerpo.textContent).toContain('Error al cargar el tablero del operativo');
    expect(cuerpo.textContent).toContain('<b>sin red</b>');
    expect(cuerpo.querySelector('b')).toBeNull();
  });
});
