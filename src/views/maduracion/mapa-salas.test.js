// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · V1 · mapa de salas por tasa de desove por noche (2026-09-27, usuario)

   Los tanques FÍSICOS de cada sala (MAD_TANQUES_POR_SALA) coloreados por su tasa de desove por noche en 4 bandas
   con la referencia 5–15 %: < 2,5 % crítica · 2,5–5 % baja · 5–15 % en rango · > 15 % alta · gris = sin hembras con
   chip. Sigue el mes, el lote y el código de la vista, pero NO la sala/tanque (el mapa enseña la planta entera y
   resalta el elegido). Un clic en un tanque filtra la vista; otro clic en el mismo lo quita. Medido con los datos
   reales ese día: Sala 4 entre 2,9 y 7,9 %, Sala 1 entre 0,8 y 2,4 %, Sala 3 y Sala 5 sin hembras con chip.
   Fixture ficticio con cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, makeFilter, mapaDeSalas, bandaTasa } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, sala, tq) => ({ 'Trovan ID': t, 'Sala actual': sala, 'Tanque actual': tq, Estado: 'Vivo', 'Fecha ingreso': '2026-06-01' });
const EV = (t, fecha, sala, tq) => ({ 'Trovan ID': t, Fecha: fecha, Tipo: 'Desove', Sala: sala, Tanque: tq });
/* Del 01/06 al 10/06 (10 noches con datos): Sala 4 · T1 con 2 hembras y 2 desoves = 2 ÷ 20 = 10 % (en rango);
   Sala 1 · T2 con 1 hembra y 0 desoves en el período salvo el que abre la ventana → ver cuentas abajo;
   Sala 9 · Tanque 3 = una sala fuera del catálogo. */
const MATRIZ = [MZ('A', 'Sala 4', 'Tanque 1'), MZ('B', 'Sala 4', 'Tanque 1'), MZ('C', 'Sala 1', 'Tanque 2'), MZ('D', 'Sala 9', 'Tanque 3')];
const BITACORA = [EV('A', '2026-06-01', 'Sala 4', 'Tanque 1'), EV('B', '2026-06-10', 'Sala 4', 'Tanque 1'), EV('D', '2026-06-05', 'Sala 9', 'Tanque 3')];

describe('Microchips · V1 · las bandas de la tasa', () => {
  it('4 bandas con la referencia 5–15 % y «sin» cuando no hay hembras-noche', () => {
    expect([null, 0, 2.49, 2.5, 4.99, 5, 15, 15.01].map(bandaTasa)).toEqual(['sin', 'critica', 'critica', 'baja', 'baja', 'rango', 'rango', 'alta']);
  });
});

describe('Microchips · V1 · el modelo del mapa', () => {
  const M = () => buildReproModel(MATRIZ, BITACORA, []);
  it('🔴 los tanques FÍSICOS de cada sala, en su orden; los que no tienen hembras con chip, en gris («sin»)', () => {
    const m = mapaDeSalas(M(), makeFilter({}));
    const s1 = m.find((s) => s.sala === 'Sala 1'), s3 = m.find((s) => s.sala === 'Sala 3');
    expect(s1.tanques.map((t) => t.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(s3.tanques.every((t) => t.banda === 'sin' && !t.filtro)).toBe(true);
    expect(m.slice(0, 5).map((s) => s.sala)).toEqual(['Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5']);
  });

  it('🔴 la tasa y la banda de cada tanque con hembras, y el valor EXACTO que usa el filtro', () => {
    const m = mapaDeSalas(M(), makeFilter({}));
    const t1 = m.find((s) => s.sala === 'Sala 4').tanques.find((t) => t.num === 1);
    expect([t1.desoves, t1.hembrasNoche, t1.tasa, t1.banda]).toEqual([2, 20, 10, 'rango']);
    expect(t1.filtro).toEqual({ sala: 'Sala 4', tanque: 'Tanque 1' });
    const t2 = m.find((s) => s.sala === 'Sala 1').tanques.find((t) => t.num === 2);
    expect([t2.desoves, t2.tasa, t2.banda]).toEqual([0, 0, 'critica']);
  });

  it('🔴 una sala o un tanque que no está en el catálogo también sale (marcado fuera de catálogo)', () => {
    const s9 = mapaDeSalas(M(), makeFilter({})).find((s) => s.sala === 'Sala 9');
    expect(s9.tanques.map((t) => [t.num, t.fueraDeCatalogo])).toEqual([[3, true]]);
  });

  it('🔴 ignora el filtro de sala/tanque (enseña la planta entera) pero sigue el mes', () => {
    const conTanque = mapaDeSalas(M(), makeFilter({ sala: 'Sala 1', tanque: 'Tanque 2' }));
    expect(conTanque.find((s) => s.sala === 'Sala 4').tanques.find((t) => t.num === 1).tasa).toBe(10);
    const otroMes = mapaDeSalas(M(), makeFilter({ month: '2026-07' }));
    expect(otroMes.find((s) => s.sala === 'Sala 4').tanques.find((t) => t.num === 1).desoves).toBe(0);
  });
});

describe('Microchips · V1 · la tarjeta del mapa', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  let root, errSpy;
  const tq = (sala, n) => root.querySelector(`[data-mc-mapa="${sala}|${n}"]`);
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
    click(root.querySelector('[data-mc-sub="operativo"]'));
  });
  afterEach(() => {
    const sel = root.querySelector('.mc-mapa-tq.is-sel'); if (sel) click(sel);   // el filtro vive la sesión
    click(root.querySelector('[data-mc-sub="panorama"]'));
    root.remove(); errSpy.mockRestore();
  });

  it('🔴 arriba de «Salas y Tanques», con cada tanque en su banda y su tasa escrita', () => {
    const card = root.querySelector('.mc-mapa-card');
    expect(card).not.toBeNull();
    expect(root.querySelector('.mc-body .mc-grid').firstElementChild).toBe(card);
    const t1 = tq('Sala 4', 1);
    expect(t1.classList.contains('is-b-rango')).toBe(true);
    expect(t1.textContent.replace(/\s+/g, ' ').trim()).toBe('T1 10 %');
    expect(tq('Sala 1', 2).classList.contains('is-b-critica')).toBe(true);
    expect(tq('Sala 3', 22).classList.contains('is-b-sin')).toBe(true);
    expect(tq('Sala 3', 22).disabled).toBe(true);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 un clic filtra la vista por ese tanque; otro clic en el mismo lo quita', () => {
    click(tq('Sala 4', 1));
    const selSala = root.querySelector('[data-mc-filter="sala"] option[selected]'), selTq = root.querySelector('[data-mc-filter="tanque"] option[selected]');
    expect([selSala && selSala.value, selTq && selTq.value]).toEqual(['Sala 4', 'Tanque 1']);
    expect(tq('Sala 4', 1).classList.contains('is-sel')).toBe(true);
    expect(tq('Sala 4', 1).getAttribute('aria-pressed')).toBe('true');
    click(tq('Sala 4', 1));
    const s2 = root.querySelector('[data-mc-filter="sala"] option[selected]');
    expect(s2 ? s2.value : '').toBe('');
    expect(tq('Sala 4', 1).classList.contains('is-sel')).toBe(false);
  });

  it('🔑 la leyenda con las 4 bandas y el gris, y los estilos en maduracion.css', async () => {
    const ley = [...root.querySelectorAll('.mc-mapa-card .mc-mapa-lg')].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
    expect(ley).toEqual(['< 2,5 %', '2,5–5 %', '5–15 % (ref.)', '> 15 %', 'sin hembras con chip']);
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-mapa {', '.mc-mapa-tq {', '.mc-mapa-tq.is-b-critica', '.mc-mapa-tq.is-b-baja', '.mc-mapa-tq.is-b-rango', '.mc-mapa-tq.is-b-alta', '.mc-mapa-tq.is-b-sin', '.mc-mapa-tq.is-sel']) expect(css.includes(c), c).toBe(true);
  });
});
