// @vitest-environment happy-dom
/* Punto 11 de la pauta del 12-11 (lado MCP) · Algas. Decisiones del usuario: «Al mes de su fecha» (un registro SIN corrida
   —la ficha lo permite— no salía en NINGÚN mes) y «"Iso" e "IS", la misma especie» (la ficha guarda «Iso» y la vista sólo
   reconocía «IS»: salía sin su nombre y, junto a uno «IS», como dos especies). Cifras INVENTADAS. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(() => null), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { algasView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const A = (o) => ({ _SheetOrigin: 'Lab_Algas', Modulo_Larv: 'M01', 'Área_Algas': 'A1', Sistema: 'M1', Dia_Proceso: '1', Cel_ml: '1000',
  Protozoarios: '1', Especie: 'Tw', Salinidad_ppt: '30', pH: '8', Descartado: 'No', 'Técnico': 'Ana', ...o });
// junio: la corrida 573; julio sólo lo trae una fila SIN corrida. El año base del calendario lo vota Larvicultura (como en el
// libro real): sin ella, ninguna fecha da mes.
const LARV = { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', Fecha: '01/06/2026' };
const JUNIO = [LARV, A({ Fecha: '02/06/2026', Corrida_Larv: '573' }), A({ Fecha: '04/06/2026', Corrida_Larv: '573', Cel_ml: '1800' })];
const SIN_CORRIDA = A({ Fecha: '10/07/2026', Corrida_Larv: '', 'Técnico': 'Zeta' });

let root;
const pintar = (filas) => { store.globalData = filas; root.innerHTML = ''; algasView(root); };
const mes = () => root.querySelector('.alg-month-lbl').textContent;
beforeEach(() => { document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root); });
afterEach(() => { store.globalData = []; });

describe('punto 11 · Algas: un registro sin corrida va al mes de su fecha', () => {
  it('🔴 el mes de la fila sin corrida existe en la barra y la fila sale en él; en el mes de al lado, no', () => {
    pintar([...JUNIO, SIN_CORRIDA]);
    expect(mes(), 'abre en el último mes: el de la fila sin corrida').toContain('Julio');
    expect(root.textContent).toContain('Zeta');
    root.querySelector('[data-month-nav="-1"]').click();
    expect(mes()).toContain('Junio');
    expect(root.textContent).not.toContain('Zeta');
    expect(root.textContent).toContain('Ana');
  });
  it('🔴 los Índices del mes (que leen las filas del mes por su cuenta) la cuentan también', () => {
    pintar([...JUNIO, SIN_CORRIDA]);
    if (!mes().includes('Julio')) root.querySelector('[data-month-nav="1"]').click();   // la vista recuerda el mes de la prueba anterior
    expect(mes()).toContain('Julio');
    root.querySelector('[data-alg-indices]').click();
    const cuerpo = root.querySelector('#algIndicesModalBody').textContent;
    expect(cuerpo).toContain('Julio · 1 registro(s) del mes');
    expect(cuerpo).toContain('Zeta');
  });
  it('control: sin la fila sin corrida, sólo junio', () => {
    pintar(JUNIO);
    expect(mes()).toContain('Junio');
    expect(root.querySelector('[data-month-nav="1"]').disabled).toBe(true);
  });
});

describe('punto 11 · Algas: «Iso» e «IS» son la misma especie (Isochrysis)', () => {
  const filas = [...JUNIO, A({ Fecha: '03/06/2026', Corrida_Larv: '573', Especie: 'Iso', 'Técnico': 'Uno' }),
    A({ Fecha: '05/06/2026', Corrida_Larv: '573', Especie: 'IS', 'Técnico': 'Dos' })];
  const opciones = () => [...root.querySelectorAll('[data-algfilter="especie"] option')].map((o) => [o.value, o.textContent.trim()]);
  it('🔴 una sola opción en el filtro, con su nombre completo', () => {
    pintar(filas);
    expect(opciones()).toEqual([['', 'Todas las especies'], ['Iso', 'Iso · Isochrysis'], ['Tw', 'Tw · Thalassiosira weissflogii']]);
  });
  it('sólo la ESPECIE se junta: un área que se llame «IS» sigue llamándose «IS»', () => {
    pintar([...filas, A({ Fecha: '06/06/2026', Corrida_Larv: '573', 'Área_Algas': 'IS' })]);
    const areas = [...root.querySelectorAll('[data-algfilter="area"] option')].map((o) => o.value);
    expect(areas).toContain('IS');
    expect(areas).not.toContain('Iso');
  });
  it('🔴 elegirla trae las dos (la escrita «Iso» y la escrita «IS»), y no las de otra especie', () => {
    pintar(filas);
    const s = root.querySelector('[data-algfilter="especie"]');
    s.value = 'Iso';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.textContent).toContain('Uno');
    expect(root.textContent).toContain('Dos');
    expect(root.textContent).not.toContain('Ana');
  });
});
