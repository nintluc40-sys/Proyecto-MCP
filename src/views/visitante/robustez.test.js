// @vitest-environment happy-dom
/* ============================================================
   VISITANTE · pauta 16 y lo que quedaba de la 3.22 (2026-10-22, usuario)
   · un fallo al REPINTAR (◀/▶, deslizador, métrica: ahí no lo atrapa el router) se dice en una tarjeta con ◀/▶ para
     irse a otro mes; antes el panel quedaba a medias —sin gráfico o sin cablear— y callado;
   · el bloque 🥚 Maduración que falla lo dice en su hueco y el resto del panel sale igual (en la pintada diferida y en
     las siguientes);
   · cada repintado reemplaza el panel entero: el foco vuelve al control usado (si ◀/▶ queda deshabilitado, al otro).
   Gráficos y módulo de Maduración simulados; datos ficticios.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const graf = vi.hoisted(() => ({ falla: false }));
vi.mock('../../core/charts.js', () => ({
  makeChart: () => { if (graf.falla) throw new Error('canvas roto'); return null; },
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));
const mad = vi.hoisted(() => ({ falla: false }));
vi.mock('./maduracion.produccion.js', () => ({
  produccionDelMes: () => { if (mad.falla) throw new Error('desove raro'); return null; },
}));

import { store } from '../../core/store.js';
import { visitanteView } from './index.js';

// tres meses de producción: Mayo (567), Junio (573) y Julio (579)
function datos() {
  return ['567', '573', '579'].flatMap((cor) => ['TQ1', 'TQ2'].flatMap((tq) => [
    { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: cor, Tanque: tq, Fecha: '01/06/2026', 'Población': '1000', 'Estadío': 'Z2' },
    { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: cor, Tanque: tq, Fecha: '10/06/2026', 'Población': '800', 'Estadío': 'PL5' },
  ]));
}
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const mes = () => root.querySelector('[data-vtmonthlbl]').textContent;
// la vista RECUERDA el mes de la anterior (vtState): cada prueba empieza en Julio, el último, sin tocar el foco
function montar() {
  visitanteView(root);
  const s = root.querySelector('[data-vtslider]');
  if (s.value !== s.max) { s.value = s.max; s.dispatchEvent(new window.Event('change', { bubbles: true })); }
  expect(mes()).toContain('Julio');
}

let errSpy, root;
beforeEach(() => {
  store.role = 'visitante';
  store.currentView = 'visitante';
  store.globalData = datos();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { graf.falla = false; mad.falla = false; store.globalData = []; errSpy.mockRestore(); });

describe('Visitante · un fallo al repintar se dice y deja navegar (pauta 16)', () => {
  it('🔴 el gráfico que falla al cambiar de mes: tarjeta con el error y ◀/▶; desde ella se vuelve a un mes sano', () => {
    montar();
    expect(mes()).toContain('Julio');
    graf.falla = true;
    click(root.querySelector('[data-vtprev]'));
    const alerta = root.querySelector('[role="alert"]');
    expect(alerta).toBeTruthy();
    expect(alerta.textContent).toContain('Junio');
    expect(alerta.textContent).toContain('canvas roto');
    expect(errSpy).toHaveBeenCalledWith('[visitante] pintar', expect.any(Error));
    graf.falla = false;
    click(root.querySelector('[data-vtnext]'));               // el ▶ de la tarjeta de error
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('.vt-metricbar')).toBeTruthy();
    expect(mes()).toContain('Julio');
  });

  it('🔴 el bloque 🥚 Maduración que falla lo dice en su hueco, en la pintada diferida y en la siguiente; el resto sale', async () => {
    store.globalData = [...datos(), { _SheetOrigin: 'Maduracion', Fecha: '01/07/2026' }];
    mad.falla = true;
    montar();
    await vi.waitFor(() => expect(root.querySelector('[data-vt-mad] [role="alert"]')).toBeTruthy());
    expect(root.querySelector('[data-vt-mad]').textContent).toContain('desove raro');
    expect(root.querySelector('.vt-metricbar')).toBeTruthy();
    click(root.querySelector('[data-vtmetric="pop"]'));        // ya cargado: la pintada es síncrona
    expect(root.querySelector('[data-vt-mad] [role="alert"]')).toBeTruthy();
    expect(root.querySelector('[data-vtmetric="pop"]').classList.contains('is-active')).toBe(true);
    expect(errSpy.mock.calls.some((c) => c[0] === '[visitante] pintar')).toBe(false);   // el panel no cayó entero
  });
});

describe('Visitante · el foco vuelve al control usado tras repintar (3.22)', () => {
  it('🔴 ◀ conserva el foco; en el primer mes (◀ deshabilitado) pasa a ▶', () => {
    montar();
    const prev = root.querySelector('[data-vtprev]');
    prev.focus();
    click(prev);                                              // → Junio
    expect(mes()).toContain('Junio');
    expect(document.activeElement.hasAttribute('data-vtprev')).toBe(true);
    expect(document.activeElement).not.toBe(prev);            // es el ◀ nuevo
    click(document.activeElement);                            // → Mayo
    expect(mes()).toContain('Mayo');
    expect(document.activeElement.hasAttribute('data-vtnext')).toBe(true);
  });

  it('🔴 el deslizador con el teclado: cada «change» repinta y el foco SIGUE en él (antes, un mes por vez)', () => {
    montar();
    root.querySelector('[data-vtslider]').focus();
    for (const v of ['1', '0']) {
      const s = document.activeElement;
      expect(s.hasAttribute('data-vtslider')).toBe(true);
      s.value = v;
      s.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
    expect(mes()).toContain('Mayo');
    expect(document.activeElement.hasAttribute('data-vtslider')).toBe(true);
  });

  it('🔑 la píldora de la métrica: el foco, en la pulsada', () => {
    montar();
    const pop = root.querySelector('[data-vtmetric="pop"]');
    pop.focus();
    click(pop);
    expect(document.activeElement.getAttribute('data-vtmetric')).toBe('pop');
  });

  it('sin el foco en el panel, repintar no se lo quita a nada', () => {
    montar();
    const fuera = document.createElement('button');
    document.body.appendChild(fuera);
    fuera.focus();
    click(root.querySelector('[data-vtprev]'));
    expect(mes()).toContain('Junio');
    expect(document.activeElement).toBe(fuera);
  });
});
