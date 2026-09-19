// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · OPERATIVO — la vista del tablero (F1)

   Pinta de verdad (happy-dom) con un store de filas ficticias como las del export, y recorre lo que el usuario
   aprobó: los filtros en cascada, el período y la foto, los seis indicadores, el mapa y sus colores, la ficha de un
   tanque, las alertas, los últimos registros, las cuarentenas, las tarjetas de sala y su detalle. Las CIFRAS las
   prueban operativo.tablero.test.js y su banco; aquí se exige que lleguen a la pantalla, que los controles hagan lo
   que dicen, y que todo lo que viene del Sheet salga escapado. Cada prueba carga los módulos de nuevo (el estado de
   la vista dura la sesión) y fija el día en el 19/09/2026.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: vi.fn(),
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

const O = 'Maduracion';
const ING = (fecha, lote, sala, tanque, machos, hembras, cg = 'CA') => ({ _SheetOrigin: O, 'Camaronera origen': 'X', Fecha: fecha,
  Lote: lote, 'Código genético': cg, Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const SALA = (fecha, sala, extra) => ({ _SheetOrigin: O, 'Temperatura 2:00': '', Fecha: fecha, Sala: sala, ...extra });
const TRAT = (fecha, sala, tipo) => ({ _SheetOrigin: O, 'Productos RAS': '', Fecha: fecha, Sala: sala, Tipo: tipo });
const INF = (fecha, extra) => ({ _SheetOrigin: O, 'Tipo de tanque': '', Fecha: fecha, ...extra });

/* La misma planta que operativo.tablero.test.js: QA en la Sala 1 (producción) y en la Sala 2 (cuarentena, con QD),
   QB en el tanque 1 de la Sala 4 —el mismo número que el de QA y QC en la Sala 1—. Fechas en dd/mm/aaaa, como el
   export. */
const PLANTA = [
  ING('01/08/2026', 'QA', 'Sala 1', 1, 10, 20, 'CA'),
  ING('01/08/2026', 'QC', 'Sala 1', 1, 2, 2, 'CB'),
  ING('01/08/2026', 'QD', 'Sala 2', 16, 3, 3, 'CB'),
  ING('11/09/2026', 'QA', 'Sala 2', 16, 5, 5, 'CB'),
  ING('12/09/2026', 'QB', 'Sala 4', 1, 8, 8, 'CA'),
  SALA('18/09/2026', 'Sala 1', { Estado: 'Producción', 'Temperatura 2:00': '28', 'Temperatura 4:00': '29', 'Temperatura 6:00': '27.9',
    'Temperatura 8:00': '29.1', 'Oxígeno 06:00': '3.9', 'Oxígeno 12:00': '4', RAS: '100%', Toneladas: '5.5' }),
  SALA('19/09/2026', 'Sala 1', { 'Oxígeno 18:00': '4.5' }),
  SALA('19/09/2026', 'Sala 2', { Estado: 'Mixto', 'Temperatura 2:00': '28.5' }),
  INF('18/09/2026', { 'Área': 'Sala 1', 'Alcalinidad día': '95', 'Alcalinidad noche': '120' }),
  TRAT('12/09/2026', 'Sala 1', 'Desinfección'),
  TQ('16/09/2026', 'Sala 1', 1, { 'Peso promedio machos (g)': '32', 'Observaciones operativas': 'En recambio' }),
  { _SheetOrigin: 'Larvicultura', Fecha: '18/09/2026' },
];

let root, store, makeChart, operativoView, errSpy;
async function montar(filas) {
  vi.resetModules();
  ({ store } = await import('../../core/store.js'));
  ({ makeChart } = await import('../../core/charts.js'));
  ({ operativoView } = await import('./operativo.view.js'));
  store.globalData = filas;
  operativoView(root);
}
const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
const cambiar = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
const kpi = (rotulo) => {
  const t = [...root.querySelectorAll('.mc-kpi')].find((x) => x.querySelector('.mc-kpi-lb').textContent === rotulo);
  return t ? t.querySelector('.mc-kpi-v').textContent.trim() : null;
};
const tq = (sala, n) => root.querySelector(`[data-mop-tq="${sala}|${n}"]`);
const filtro = (dim) => root.querySelector(`[data-mop-filtro="${dim}"]`);
/* La opción que el HTML declara elegida, que es la que enseña el navegador. ⚠ No `select.value`: happy-dom, al leer
   un <select> desde innerHTML, marca la opción ANTERIOR a la que lleva `selected` cuando no es la segunda (medido el
   2026-09-19: con la tercera marcada devuelve la segunda). */
const elegido = (dim) => { const s = filtro(dim); return (s.querySelector('option[selected]') || s.options[0]).value; };

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
});

describe('Maduración · operativo · 📊 Estado actual', () => {
  it('abre con la barra de filtros, los seis indicadores, el mapa de los 38 tanques, las alertas y los registros', async () => {
    await montar(PLANTA);
    expect(root.querySelector('.mc-title').textContent).toBe('Operativo');
    expect(root.querySelector('.mc-sub').textContent).toContain('19/09/2026');
    expect(root.querySelector('[data-mop-periodo="30d"]').classList.contains('is-on')).toBe(true);
    expect(root.querySelector('.mop-f-rango').textContent).toContain('21/08 – 19/09 · 30 días');
    const fecha = root.querySelector('[data-mop-fecha]');
    expect([fecha.value, fecha.getAttribute('max')]).toEqual(['2026-09-19', '2026-09-19']);
    expect([...root.querySelectorAll('.mc-kpi-lb')].map((x) => x.textContent)).toEqual(['Vivos', 'Lotes', 'Salas', 'Ocupación', 'Mortalidad', 'Reproducción']);
    expect([kpi('Vivos'), kpi('Lotes'), kpi('Salas'), kpi('Ocupación')]).toEqual(['66', '4', '1 ⚠', '3/38']);
    expect([kpi('Mortalidad'), kpi('Reproducción')]).toEqual(['día 0 %', '0 desoves']);
    expect(root.querySelectorAll('.mop-tq')).toHaveLength(38);
    expect(tq('Sala 1', 1).classList.contains('is-e-produccion')).toBe(true);
    expect(tq('Sala 2', 16).classList.contains('is-e-mixto')).toBe(true);
    expect(tq('Sala 4', 1).classList.contains('is-e-cuarentena')).toBe(true);
    expect(tq('Sala 1', 2).classList.contains('is-e-vacio')).toBe(true);
    const alertas = root.querySelector('.mop-alertas').textContent;
    expect(alertas).toContain('la hoja dice «Producción»');
    expect(alertas).toContain('28–29 °C');
    const filas = [...root.querySelectorAll('.mc-table tbody tr')];
    expect(filas).toHaveLength(10);
    expect(filas.find((f) => f.textContent.includes('Tanques')).classList.contains('mop-atrasada')).toBe(true);
    expect(root.textContent).toContain('pasa a Producción el 26/09');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('filtros: sala → tanque en cascada (el 1 de la Sala 1 no es el de la Sala 4), lote → código, y ✕ Limpiar', async () => {
    await montar(PLANTA);
    expect(filtro('tanque').disabled).toBe(true);
    expect(root.querySelector('[data-mop-limpiar]')).toBeNull();
    cambiar(filtro('sala'), 'Sala 1');
    expect(kpi('Vivos')).toBe('34');
    expect(filtro('tanque').disabled).toBe(false);
    expect(filtro('tanque').options).toHaveLength(16);
    cambiar(filtro('tanque'), '1');
    expect(kpi('Vivos')).toBe('34');
    expect(tq('Sala 4', 1).classList.contains('is-dim')).toBe(true);
    expect(tq('Sala 1', 1).classList.contains('is-dim')).toBe(false);
    cambiar(filtro('sala'), 'Sala 4');                      // otra sala: el tanque 1 de antes ya no es éste
    expect(elegido('tanque')).toBe('');
    click(root.querySelector('[data-mop-limpiar]'));
    expect(kpi('Vivos')).toBe('66');
    expect(elegido('sala')).toBe('');
    cambiar(filtro('lote'), 'QB');
    expect(kpi('Vivos')).toBe('16');
    expect(elegido('lote')).toBe('QB');
    expect([...filtro('codigo').options].map((o) => o.value)).toEqual(['', 'CA']);
    cambiar(filtro('sala'), 'Sala 1');                      // cambiar de sala borra el tanque, no el lote
    expect(elegido('lote')).toBe('QB');
    expect(kpi('Vivos')).toBe('0');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('período y foto: «Hoy» es un día; la foto del 10/09 no ve lo posterior; una foto futura vuelve a hoy', async () => {
    await montar(PLANTA);
    click(root.querySelector('[data-mop-periodo="hoy"]'));
    expect(root.querySelector('[data-mop-periodo="hoy"]').classList.contains('is-on')).toBe(true);
    expect(root.querySelector('.mop-f-rango').textContent).toContain('19/09 – 19/09 · 1 día');
    cambiar(root.querySelector('[data-mop-fecha]'), '2026-09-10');
    expect(kpi('Vivos')).toBe('40');
    expect(root.querySelector('.mc-sub').textContent).toContain('10/09/2026');
    cambiar(root.querySelector('[data-mop-fecha]'), '2026-09-25');
    expect(root.querySelector('[data-mop-fecha]').value).toBe('2026-09-19');
    expect(kpi('Vivos')).toBe('66');
    click(root.querySelector('[data-mop-periodo="todo"]'));   // desde el 01/08: la mortalidad se sigue calculando
    expect(root.querySelector('.mop-f-rango').textContent).toContain('01/08 – 19/09');
    expect(kpi('Mortalidad')).toBe('día 0 %');
    cambiar(root.querySelector('[data-mop-fecha]'), '2026-09-12');
    click(root.querySelector('[data-mop-limpiar]'));          // ✕ Limpiar devuelve también el período y la foto
    expect(root.querySelector('[data-mop-periodo="30d"]').classList.contains('is-on')).toBe(true);
    expect(root.querySelector('[data-mop-fecha]').value).toBe('2026-09-19');
    expect(root.querySelector('[data-mop-limpiar]')).toBeNull();
  });

  it('el color del mapa: por densidad (umbral bibliográfico) y por vivos, con su leyenda', async () => {
    await montar(PLANTA);
    click(root.querySelector('[data-mop-color="densidad"]'));
    expect(tq('Sala 1', 1).classList.contains('is-d-bajo')).toBe(true);
    expect(tq('Sala 1', 2).classList.contains('is-d-vacio')).toBe(true);
    expect(root.querySelector('.mop-mapa-card .mc-legend').textContent).toContain('Por debajo');
    click(root.querySelector('[data-mop-color="vivos"]'));
    expect(tq('Sala 1', 1).getAttribute('style')).toContain('--mop-i:100%');
    expect(tq('Sala 2', 16).getAttribute('style')).toContain('--mop-i:55%');
  });

  it('un tanque abre su ficha SIN repintar; «Filtrar por este tanque» pone su sala y su número', async () => {
    await montar(PLANTA);
    const b = tq('Sala 1', 1);
    click(b);
    expect(b.isConnected).toBe(true);
    expect(b.classList.contains('is-sel')).toBe(true);
    const info = root.querySelector('.mop-tq-info').textContent;
    expect(info).toContain('Sala 1 · tanque 1');
    expect(info).toContain('QA (Producción, CA)');
    click(root.querySelector('[data-mop-filtrar-tq]'));
    expect([elegido('sala'), elegido('tanque')]).toEqual(['Sala 1', '1']);
    expect(kpi('Vivos')).toBe('34');
  });
});

describe('Maduración · operativo · 🏠 Salas', () => {
  it('cinco tarjetas; al pulsar una, su detalle: calor por hora, O₂, ♀/♂ por tanque y la tabla; otra vez, se cierra', async () => {
    await montar(PLANTA);
    click(root.querySelector('[data-mop-sub="salas"]'));
    const tarjetas = root.querySelectorAll('.mop-sala-card');
    expect(tarjetas).toHaveLength(5);
    const s1 = root.querySelector('[data-mop-sala="Sala 1"]').textContent;
    for (const t of ['Producción', 'Desinfección - Producción agrupada', '1/15 tanques', '100 %', 'hace 7 d', 'QA · Producción']) expect(s1).toContain(t);
    expect(root.querySelector('.mop-detalle')).toBeNull();
    makeChart.mockClear();
    click(root.querySelector('[data-mop-sala="Sala 1"]'));
    expect(root.querySelector('.mop-detalle')).toBeTruthy();
    expect(root.querySelectorAll('.mop-calor tbody tr')).toHaveLength(30);
    expect(makeChart.mock.calls.map((c) => c[0]).sort()).toEqual(['mopOx', 'mopTq']);
    const tq1 = makeChart.mock.calls.find((c) => c[0] === 'mopTq')[1];
    expect(tq1.data.labels).toHaveLength(15);
    expect(tq1.data.datasets.map((d) => d.label)).toContain('Densidad máxima 15');
    const tabla = root.querySelector('.mop-detalle .mc-table tbody').textContent;
    expect(tabla).toContain('En recambio');
    expect(root.querySelector('.mop-detalle').textContent).toContain('Vacíos: 2, 3');
    click(root.querySelector('[data-mop-sala="Sala 1"]'));
    expect(root.querySelector('.mop-detalle')).toBeNull();
    root.querySelector('[data-mop-sala="Sala 2"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(root.querySelector('.mop-detalle .mc-card-h').textContent).toContain('Sala 2');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('con filtro de sala, sólo su tarjeta y su detalle abierto', async () => {
    await montar(PLANTA);
    cambiar(filtro('sala'), 'Sala 2');
    click(root.querySelector('[data-mop-sub="salas"]'));
    expect([...root.querySelectorAll('.mop-sala-card')].map((c) => c.dataset.mopSala)).toEqual(['Sala 2']);
    expect(root.querySelector('.mop-detalle .mc-card-h').textContent).toContain('Sala 2');
  });
});

describe('Maduración · operativo · bordes', () => {
  it('lo que viene del Sheet sale ESCAPADO (un lote con marcado no se interpreta, ni dentro de un atributo)', async () => {
    const malo = '"><img src=x onerror=alert(1)>';
    await montar([...PLANTA, ING('10/09/2026', malo, 'Sala 3', 22, 1, 1)]);
    expect(root.querySelector('img')).toBeNull();
    expect(tq('Sala 3', 22).getAttribute('title')).toContain(malo);
    click(root.querySelector('[data-mop-sub="salas"]'));
    click(root.querySelector('[data-mop-sala="Sala 3"]'));
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.mop-detalle').textContent).toContain(malo);
  });

  it('avisa de filas que no casan con ninguna hoja y de fechas posteriores a hoy', async () => {
    await montar([...PLANTA, { _SheetOrigin: O, 'Columna desconocida': 1 }, SALA('25/09/2026', 'Sala 1', { Estado: 'Producción' })]);
    const w = [...root.querySelectorAll('.mc-warn')].map((x) => x.textContent);
    expect(w).toHaveLength(2);
    expect(w[0]).toContain('no casan con ninguna hoja');
    expect(w[1]).toContain('fecha posterior a hoy');
  });

  it('sin filas del operativo, lo dice; sin datos todavía, «Conectando»', async () => {
    await montar([{ _SheetOrigin: 'Larvicultura', Fecha: '18/09/2026' }]);
    expect(root.textContent).toContain('Sin datos del registro operativo');
    await montar([]);
    expect(root.textContent).toContain('Conectando');
  });
});
