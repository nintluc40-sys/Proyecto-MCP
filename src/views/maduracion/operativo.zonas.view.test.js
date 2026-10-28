// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · OPERATIVO — el bloque 🌡️ Zonas de 🏠 Salas (2026-10-27, Sesión A ronda 9, tarea 2)

   Pinta de verdad (happy-dom) el tablero con filas ficticias como las del export y abre 🏠 Salas. Decisiones del
   usuario: un bloque debajo de las salas, como la grilla de captura (Día: cada toma con su color; Período: por zona y
   tanque), los umbrales de la SALA en todas las zonas, los filtros del tablero no aplican, y la hoja, diaria en
   «Últimos registros». Las cifras las prueba operativo.zonas.test.js; aquí, que lleguen a la pantalla, que los controles
   hagan lo que dicen y que lo del Sheet salga escapado. Día fijo: 19/09/2026.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: vi.fn(), destroyAllCharts: vi.fn(), Chart: class {} }));
vi.mock('../../ui/router.js', async (original) => ({ ...(await original()), changeView: vi.fn() }));

const O = 'Maduracion';
const ING = (fecha, lote, sala, tanque, machos, hembras) => ({ _SheetOrigin: O, 'Camaronera origen': 'X', Fecha: fecha,
  Lote: lote, 'Código genético': 'CA', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const SALA = (fecha, sala, extra) => ({ _SheetOrigin: O, 'Temperatura 2:00': '', Fecha: fecha, Sala: sala, ...extra });
/* una fila de «Maduración Zonas» (su firma es «Zona») */
const ZON = (fecha, zona, tanque, extra) => ({ _SheetOrigin: O, Fecha: fecha, Zona: zona, Tanque: tanque, 'Oxígeno 00:00': '', ...extra });
const MAS = 'Sala desove (masivos)', R1 = 'Reservorio 1';

const BASE = [
  ING('01/08/2026', 'QA', 'Sala 1', 1, 10, 20),
  SALA('19/09/2026', 'Sala 1', { Estado: 'Producción', 'Temperatura 2:00': '28' }),
];
const ZONAS = [
  ZON('19/09/2026', MAS, '1', { 'Temperatura 2:00': '27.5', 'Temperatura 4:00': '28.4', 'Temperatura 6:00': '30', 'Oxígeno 06:00': '3.8', 'Oxígeno 12:00': '5.2' }),
  ZON('19/09/2026', MAS, '2', { 'Temperatura 2:00': '28.1' }),
  ZON('19/09/2026', R1, '', { 'Temperatura 2:00': '26.9' }),
  ZON('17/09/2026', MAS, '1', { 'Temperatura 2:00': '28.8' }),
];

let root, store, operativoView;
async function montar(filas) {
  vi.resetModules();
  ({ store } = await import('../../core/store.js'));
  ({ operativoView } = await import('./operativo.view.js'));
  store.globalData = filas;
  operativoView(root);
  click(root.querySelector('[data-mop-sub="salas"]'));
}
const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
const cambiar = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
const bloque = () => root.querySelector('.mop-zonas');
const filasDia = () => [...bloque().querySelectorAll('.mop-zonas-t tbody tr')];
/* el día elegido: su `option[selected]` (happy-dom no siempre lo refleja en `.value` tras pintar por innerHTML) */
const diaElegido = () => bloque().querySelector('[data-mop-zon-dia] option[selected]').value;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 19, 10, 0, 0));
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { root.remove(); vi.useRealTimers(); });

describe('🏠 Salas → 🌡️ Zonas de desove y reservorios', () => {
  it('va debajo de las salas y abre en el DÍA de la foto, como la grilla: la zona en la primera fila de sus tanques', async () => {
    await montar([...BASE, ...ZONAS]);
    const b = bloque();
    expect(b, 'el bloque').toBeTruthy();
    expect(root.querySelector('.mop-salas').compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(b.querySelector('h3').textContent).toBe('🌡️ Zonas de desove y reservorios');
    expect(b.querySelector('[data-mop-zon-modo="dia"]').getAttribute('aria-pressed')).toBe('true');
    expect(diaElegido()).toBe('2026-09-19');
    const f = filasDia();
    expect(f.map((tr) => [tr.querySelector('th').textContent, tr.querySelector('.mop-zonas-tq').textContent]))
      .toEqual([[MAS, '1'], ['', '2'], [R1, '—']]);
    // 12 tomas de temperatura + 4 de O₂
    expect(f[0].querySelectorAll('td')).toHaveLength(1 + 12 + 4);
  });

  it('cada toma con el color de su estado frente al umbral de la SALA (también en los reservorios), y su ayuda', async () => {
    await montar([...BASE, ...ZONAS]);
    const [t1, , r1] = filasDia();
    const celdas = [...t1.querySelectorAll('td')].slice(1);   // fuera la del tanque
    expect(celdas.slice(0, 3).map((c) => [c.textContent, c.className])).toEqual([['27,5', 'is-bajo'], ['28,4', 'is-ok'], ['30', 'is-alto']]);
    expect(celdas[3].className).toBe('');                       // sin lectura
    expect([celdas[12].textContent, celdas[12].className]).toEqual(['3,8', 'mop-zonas-ox is-bajo']);
    expect([celdas[13].textContent, celdas[13].className]).toEqual(['5,2', 'is-ok']);
    expect(celdas[0].getAttribute('title')).toBe(`${MAS} · Tanque 1 · 2:00 · 27,5 °C`);
    expect(r1.querySelectorAll('td')[1].className).toBe('is-bajo');
    expect(r1.querySelectorAll('td')[1].getAttribute('title')).toBe(`${R1} · toda el área · 2:00 · 26,9 °C`);
    expect(bloque().querySelector('.mc-note').textContent).toMatch(/umbrales de la sala.*Los filtros del tablero no aplican a las zonas/);
  });

  it('◀ va al día anterior; un día sin lecturas lo dice, con la última y «Ver ese día»', async () => {
    await montar([...BASE, ...ZONAS]);
    click(bloque().querySelector('[data-mop-zon-dir="ant"]'));
    expect(diaElegido()).toBe('2026-09-18');
    const vacio = bloque().querySelector('.empty-state');
    expect(vacio.textContent).toContain('Sin lecturas de las zonas el 18/09/2026. La última, el 17/09/2026.');
    click(vacio.querySelector('[data-mop-zon-ir="2026-09-17"]'));
    expect(diaElegido()).toBe('2026-09-17');
    expect(filasDia()).toHaveLength(1);
    cambiar(bloque().querySelector('[data-mop-zon-dia]'), '2026-09-19');
    expect(filasDia()).toHaveLength(3);
  });

  it('Período: por zona y tanque, los días con lectura y mínima – media – máxima, con cuántas tomas quedaron fuera', async () => {
    await montar([...BASE, ...ZONAS]);
    click(bloque().querySelector('[data-mop-zon-modo="periodo"]'));
    expect(bloque().querySelector('[data-mop-zon-modo="periodo"]').getAttribute('aria-pressed')).toBe('true');
    const f = [...bloque().querySelectorAll('.mop-zonas-p tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
    expect(f).toHaveLength(3);
    expect(f[0].slice(0, 4)).toEqual([MAS, '1', '2', '27,5 – 28,7 – 30']);   // 27,5 · 28,4 · 30 · 28,8
    expect(f[0][4]).toBe('1 ↓ 1 ↑ de 4');
    expect(f[0].slice(5)).toEqual(['3,8 – 4,5 – 5,2', '1 ↓ de 2']);
    expect(f[1].slice(0, 2)).toEqual(['', '2']);
    expect(f[2].slice(0, 2)).toEqual([R1, '—']);
  });

  it('sin la hoja de zonas lo dice (se teclean en 🏠 Salas del registro); y la hoja es DIARIA en «Últimos registros»', async () => {
    await montar(BASE);
    expect(bloque().querySelector('.empty-state').textContent).toContain('Aún no hay lecturas de las zonas en el libro');
    const { ESPERA_DIAS, ultimosRegistros } = await import('./operativo.tablero.js');
    expect(ESPERA_DIAS.zonas).toBe(1);
    expect(ultimosRegistros([{ clave: 'zonas', hoja: 'Maduración Zonas', ultima: '2026-09-17', dias: 2 }])[0].atrasada).toBe(true);
    expect(ultimosRegistros([{ clave: 'zonas', hoja: 'Maduración Zonas', ultima: '', dias: '' }])[0].atrasada).toBe(false);
  });

  it('lo que viene del Sheet sale escapado', async () => {
    await montar([...BASE, ZON('19/09/2026', '<img src=x onerror=alert(1)>', '1', { 'Temperatura 2:00': '28' })]);
    expect(bloque().querySelector('img')).toBeNull();
    expect(filasDia()[0].querySelector('th').textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
