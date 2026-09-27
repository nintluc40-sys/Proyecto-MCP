// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · V9 · el esqueleto de carga y los estados vacíos (2026-09-27, usuario)

   Mientras cargan los datos, la SILUETA de la vista (cabecera, 7 KPI y dos tarjetas) con un brillo que la recorre
   (sin animación con «menos movimiento»), en vez del texto «📡 Conectando…»; el texto queda para lectores de pantalla.
   Los estados vacíos de las tarjetas, con un mismo formato: icono, qué falta y POR QUÉ (los filtros activos) y, si hay
   filtros, «Quitar filtros», que vuelve a todo el histórico sin sala/tanque/lote/código. Fixture ficticio.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { maduracionView } from './index.js';

const MZ = (t, lote, estado = 'Vivo', muerte = '') => ({ 'Trovan ID': t, Lote: lote, 'Sala actual': 'Sala 4', 'Tanque actual': 'Tanque 1', Estado: estado, 'Fecha ingreso': '2026-06-01', 'Fecha muerte': muerte });
const EV = (t, fecha) => ({ 'Trovan ID': t, Fecha: fecha, Tipo: 'Desove', Sala: 'Sala 4', Tanque: 'Tanque 1' });
/* A (lote LA) desova UNA vez (nadie tiene dos desoves: el intervalo queda vacío); Z (lote LZ) murió sin ningún evento:
   con el lote LZ, la vista se queda sin nada que enseñar. */
const MATRIZ = [MZ('A', 'LA'), MZ('Z', 'LZ', 'Muerto', '2026-06-02')];
const BITACORA = [EV('A', '2026-06-03')];

const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
const cambiar = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };

describe('Microchips · V9 · mientras cargan los datos', () => {
  it('🔴 la silueta de la vista (7 KPI y 2 tarjetas), ocupada, con el texto para lectores de pantalla', () => {
    store.globalData = [];
    const root = document.createElement('div');
    maduracionView(root);
    const sk = root.querySelector('.mc-sk');
    expect(sk).not.toBeNull();
    expect(sk.getAttribute('aria-busy')).toBe('true');
    expect([sk.querySelectorAll('.mc-sk-kpi').length, sk.querySelectorAll('.mc-sk-card').length]).toEqual([7, 2]);
    expect(sk.querySelector('.mc-sr').textContent).toBe('Cargando datos del Registro Reproductivo…');
    expect(root.textContent).not.toContain('Conectando');
  });
});

describe('Microchips · V9 · los estados vacíos', () => {
  let root, errSpy;
  const card = (t) => [...root.querySelectorAll('.mc-card')].find((c) => c.querySelector('.mc-card-h') && c.querySelector('.mc-card-h').textContent.includes(t));
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
  });
  afterEach(() => {
    const b = root.querySelector('[data-mc-limpiar]'); if (b) click(b);
    click(root.querySelector('[data-mc-sub="panorama"]'));
    root.remove(); errSpy.mockRestore(); document.body.classList.remove('modal-open');
  });

  it('🔴 con un filtro que lo vacía: icono, qué falta, POR QUÉ (el filtro) y «Quitar filtros»', () => {
    cambiar(root.querySelector('[data-mc-filter="lote"]'), 'LZ');
    const v = card('Top tanques').querySelector('.mc-vacio');
    expect(v).not.toBeNull();
    expect(v.querySelector('.mc-vacio-t').textContent).toBe('Sin desoves en este filtro');
    expect(v.querySelector('.mc-vacio-f').textContent).toBe('Lote LZ');
    expect(v.querySelector('[data-mc-limpiar]').textContent).toBe('Quitar filtros');
    click(root.querySelector('[data-mc-monthnav="1"]'));   // + el mes: va el primero
    expect(card('Top tanques').querySelector('.mc-vacio-f').textContent).toBe('junio 2026 · Lote LZ');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 «Quitar filtros» vuelve a todo el histórico sin sala/tanque/lote/código', () => {
    cambiar(root.querySelector('[data-mc-filter="lote"]'), 'LZ');
    click(card('Top tanques').querySelector('[data-mc-limpiar]'));
    const s = root.querySelector('[data-mc-filter="lote"] option[selected]');
    expect(s ? s.value : '').toBe('');
    expect(card('Top tanques').querySelector('.mc-vacio')).toBeNull();
  });

  it('🔴 en Salas y Tanques y en Hembras, el mismo formato (el ranking dice también «Muertas» si ese es el porqué)', () => {
    cambiar(root.querySelector('[data-mc-filter="lote"]'), 'LZ');
    click(root.querySelector('[data-mc-sub="operativo"]'));
    expect(card('Producción y eficiencia').querySelector('.mc-vacio .mc-vacio-f').textContent).toBe('Lote LZ');
    expect(card('Mortalidad por').querySelector('.mc-vacio .mc-vacio-t').textContent).toBe('Sin mortalidades en este filtro');
    click(root.querySelector('[data-mc-sub="hembras"]'));
    click(root.querySelector('[data-mc-rankestado="muertas"]'));
    expect(card('Ranking de hembras').querySelector('.mc-vacio .mc-vacio-f').textContent).toBe('Lote LZ · Muertas');
    click(root.querySelector('[data-mc-rankestado="todas"]'));
  });

  it('🔴 sin filtros no hay botón; lo que no depende de un filtro, sin botón aunque los haya', () => {
    click(root.querySelector('[data-mc-sub="hembras"]'));
    const v = card('Intervalo de recuperación').querySelector('.mc-vacio');
    expect([v.querySelector('.mc-vacio-t').textContent, v.querySelector('[data-mc-limpiar]'), v.querySelector('.mc-vacio-f')]).toEqual(['Aún no hay hembras con dos o más desoves', null, null]);
    cambiar(root.querySelector('[data-mc-filter="lote"]'), 'LA');   // CON un filtro activo
    expect(card('Intervalo de recuperación').querySelector('.mc-vacio-f').textContent).toBe('Lote LA');
    click(root.querySelector('[data-mc-female="A"]'));
    const tr = root.querySelector('#mcFemBody .mc-fem-col:last-child .mc-vacio');
    expect([tr.querySelector('.mc-vacio-t').textContent, tr.querySelector('[data-mc-limpiar]')]).toEqual(['Sin transferencias', null]);
  });

  it('🔑 los estilos en maduracion.css (con «menos movimiento»)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-sk {', '.mc-sk-kpi {', '@keyframes mc-sk-brillo', '@media (prefers-reduced-motion: reduce) { .mc-sk i { animation: none; } }', '.mc-sr {', '.mc-vacio {', '.mc-vacio-f {']) expect(css.includes(c), c).toBe(true);
  });
});
