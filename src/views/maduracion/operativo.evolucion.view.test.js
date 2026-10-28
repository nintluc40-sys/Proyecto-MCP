// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · OPERATIVO — la pantalla de 📈 Evolución (2026-10-27, usuario; ronda 9, Sesión B, tarea 2)

   Pinta de verdad (happy-dom) el tablero con filas ficticias como las del export y abre 📈 Evolución. Las cifras las prueba
   operativo.evolucion.test.js; aquí, que lleguen a la pantalla y al gráfico, que cada control haga lo que dice (variable A
   y B, agrupar, comparar y lo comparado, media móvil, eventos, Excel) y que lo del Sheet salga escapado. Día fijo: 19/09/2026.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: vi.fn(), destroyAllCharts: vi.fn(), Chart: class {} }));
vi.mock('../../ui/router.js', async (original) => ({ ...(await original()), changeView: vi.fn() }));

const O = 'Maduracion';
const ING = (fecha, lote, sala, tanque, machos, hembras) => ({ _SheetOrigin: O, 'Camaronera origen': 'X', Fecha: fecha,
  Lote: lote, 'Código genético': 'CA', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const DES = (fecha, lote, desoves, n5) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': 'CA', Desoves: desoves,
  'Total de huevos': desoves * 100000, N2: 0, N5: n5 });
const TRAT = (fecha, sala, tipo, lotes) => ({ _SheetOrigin: O, Fecha: fecha, Sala: sala, 'Estado de la sala': 'Producción', Tipo: tipo,
  'Área': 'Salas y tanques', Lotes: lotes, Productos: 'Formol', 'Productos RAS': '', 'Dosis y observaciones': '', ID: fecha + sala });
const SALA = (fecha, sala, extra) => ({ _SheetOrigin: O, 'Temperatura 2:00': '', Fecha: fecha, Sala: sala, ...extra });
const MOV = (fecha, tipo, so, to, sd, td, machos, hembras) => ({ _SheetOrigin: O, Fecha: fecha, Tipo: tipo, 'Sala origen': so, 'Tanque origen': to,
  'Sala destino': sd, 'Tanque destino': td, Machos: machos, Hembras: hembras, 'Agua destino': 'RAS', Motivo: 'Logística', Observaciones: '', ID: fecha + so + sd });
const MALO = '<img src=x onerror=alert(1)>';   // un lote con marcado: tiene que salir como texto

const FILAS = [
  ING('01/08/2026', 'QA', 'Sala 1', 1, 10, 20), ING('01/08/2026', 'QD', 'Sala 2', 16, 3, 3), ING('12/09/2026', MALO, 'Sala 4', 1, 8, 8),
  TQ('14/09/2026', 'Sala 2', 16, { 'Cópulas': 1 }), TQ('16/09/2026', 'Sala 2', 16, { 'Cópulas': 2 }),
  TQ('15/09/2026', 'Sala 1', 1, { 'Machos muertos': 1, 'Hembras muertas': 2 }),
  DES('14/09/2026', 'QA', 4, 400000), DES('16/09/2026', 'QA', 2, 100000), DES('16/09/2026', MALO, 2, 150000),
  TRAT('15/09/2026', 'Sala 1', 'Preventivo', 'QA'),
  SALA('17/09/2026', 'Sala 1', { 'Temperatura 2:00': '28' }),
];

let root, store, operativoView, makeChart;
async function montar(filas = FILAS) {
  vi.resetModules();
  ({ store } = await import('../../core/store.js'));
  ({ makeChart } = await import('../../core/charts.js'));
  ({ operativoView } = await import('./operativo.view.js'));
  store.globalData = filas;
  operativoView(root);
  click(root.querySelector('[data-mop-sub="evolucion"]'));
}
const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
const cambiar = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
const card = () => root.querySelector('.mop-evo');
const ultimoGrafico = () => { const c = makeChart.mock.calls; return c.length ? c[c.length - 1] : null; };
const elegida = (sel) => card().querySelector(`[data-mop-evo="${sel}"] option[selected]`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 19, 10, 0, 0));
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { root.remove(); vi.useRealTimers(); delete window.XLSX; });

describe('🐚 Operativo → 📈 Evolución', () => {
  it('es una pastilla del tablero, con la barra de filtros; abre en la tasa de cópula, por día, y la dibuja', async () => {
    await montar();
    expect(root.querySelector('[data-mop-sub="evolucion"]').textContent).toContain('📈 Evolución');
    expect(root.querySelector('.mop-filtros'), 'la barra del tablero').toBeTruthy();
    expect(card().querySelector('h4').textContent).toContain('📈 Evolución');
    expect(elegida('a').value).toBe('copula');
    expect(card().querySelector('[data-mop-evo-agr="dia"]').getAttribute('aria-pressed')).toBe('true');
    const [id, cfg] = ultimoGrafico();
    expect(id).toBe('mopEvo');
    expect(cfg.data.labels.length).toBe(30);   // los 30 d del tablero
    expect(cfg.data.datasets[0].label).toBe('Tasa de cópula (%)');
    expect(cfg.data.datasets.some((d) => /Media móvil 7 d/.test(d.label)), 'la media móvil, por defecto').toBe(true);
    expect(card().querySelectorAll('.mop-evo-tabla tbody tr').length).toBe(30);
  });

  it('🔴 la variable B va en su eje (y2); con desoves, en barras', async () => {
    await montar();
    cambiar(card().querySelector('[data-mop-evo="b"]'), 'desoves');
    const [, cfg] = ultimoGrafico();
    const des = cfg.data.datasets.find((d) => d.label === 'Desoves');
    expect(des.type).toBe('bar');
    expect(des.yAxisID).toBe('y2');
    expect(cfg.options.scales.y2.title.text).toBe('desoves');
    expect(elegida('b').value).toBe('desoves');
  });

  it('🔴 por semana: las etiquetas son semanas y la media móvil se apaga (sólo por día)', async () => {
    await montar();
    click(card().querySelector('[data-mop-evo-agr="semana"]'));
    const [, cfg] = ultimoGrafico();
    expect(cfg.data.labels.every((l) => l.includes('–'))).toBe(true);
    expect(cfg.data.datasets.some((d) => /Media móvil/.test(d.label))).toBe(false);
    expect(card().querySelector('[data-mop-evo-op="movil"]').disabled).toBe(true);
  });

  it('🔴 por lote: una línea por lote elegido (escapados), la B se desactiva y quitar un lote quita su línea', async () => {
    await montar();
    cambiar(card().querySelector('[data-mop-evo="a"]'), 'desoves');
    click(card().querySelector('[data-mop-evo-cmp="lote"]'));
    const chips = [...card().querySelectorAll('[data-mop-evo-el]')];
    expect(chips.length).toBe(3);   // QA, QD y el del marcado
    expect(card().querySelector('img'), 'el lote con marcado sale como texto').toBeNull();
    // el lote llega normalizado (`normLote`: sin espacios y en mayúsculas) y se ve como TEXTO
    expect(chips.map((b) => b.textContent)).toContain('<IMGSRC=XONERROR=ALERT(1)>');
    expect(card().querySelector('[data-mop-evo="b"]').disabled).toBe(true);
    let [, cfg] = ultimoGrafico();
    expect(cfg.data.datasets.filter((d) => !/Media móvil/.test(d.label)).length).toBe(3);
    click(chips.find((b) => b.dataset.mopEvoEl === 'QD'));
    [, cfg] = ultimoGrafico();
    expect(cfg.data.datasets.filter((d) => !/Media móvil/.test(d.label)).map((d) => d.label)).not.toContain('Desoves · QD (desoves)');
    expect(card().querySelector('[data-mop-evo-el="QD"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('una variable que no se separa por lote deja la pastilla desactivada y lo dice', async () => {
    await montar();
    cambiar(card().querySelector('[data-mop-evo="a"]'), 'temperatura');
    const b = card().querySelector('[data-mop-evo-cmp="lote"]');
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('title')).toContain('no se separa por lote');
    expect(card().querySelector('[data-mop-evo-cmp="sala"]').disabled).toBe(false);
  });

  it('🔴 los preventivos de rutina van en la lista pero NO se marcan; un movimiento sí (decisión del usuario, 28-10)', async () => {
    await montar();
    expect(card().querySelector('.mop-evo-det summary').textContent).toContain('Eventos del período (1)');
    expect(card().querySelector('.mop-evo-det li').textContent).toContain('Sala 1: Preventivo');
    expect(ultimoGrafico()[1].plugins.some((p) => p.id === 'mopEvoMarcas'), 'sólo un preventivo: ninguna marca').toBe(false);
    // otra raíz: la de antes guarda los manejadores del primer montaje (`_mopBound`) y repintaría con sus datos
    root.remove();
    root = document.createElement('div');
    document.body.appendChild(root);
    await montar([...FILAS, MOV('13/09/2026', 'Transferencia', 'Sala 1', 1, 'Sala 4', 1, 1, 0)]);
    expect(card().querySelector('.mop-evo-det summary').textContent).toContain('Eventos del período (2)');
    const marcas = ultimoGrafico()[1].plugins.find((p) => p.id === 'mopEvoMarcas');
    expect(marcas.marcas.map((m) => [m.fecha, m.tipo])).toEqual([['2026-09-13', 'movimiento']]);
  });

  it('🔴 sin «Eventos», ni lista ni marcas', async () => {
    await montar([...FILAS, MOV('13/09/2026', 'Transferencia', 'Sala 1', 1, 'Sala 4', 1, 1, 0)]);
    expect(ultimoGrafico()[1].plugins.some((p) => p.id === 'mopEvoMarcas')).toBe(true);
    const ev = card().querySelector('[data-mop-evo-op="eventos"]');
    ev.checked = false;
    ev.dispatchEvent(new Event('change', { bubbles: true }));
    expect(card().textContent).not.toContain('Eventos del período');
    expect(ultimoGrafico()[1].plugins.some((p) => p.id === 'mopEvoMarcas')).toBe(false);
  });

  it('🔴 ⬇ Excel: las cuatro hojas de la pantalla, con su nombre de archivo', async () => {
    const libro = { hojas: [] };
    window.XLSX = { utils: { book_new: () => libro, aoa_to_sheet: (aoa) => ({ aoa }), book_append_sheet: (wb, ws, n) => wb.hojas.push({ n, aoa: ws.aoa }) },
      writeFile: vi.fn() };
    await montar();
    click(card().querySelector('[data-mop-evo-xlsx]'));
    expect(window.XLSX.writeFile).toHaveBeenCalledTimes(1);
    expect(window.XLSX.writeFile.mock.calls[0][1]).toBe('Maduracion_Evolucion_copula_2026-08-21_2026-09-19.xlsx');
    expect(libro.hojas.map((h) => h.n)).toEqual(['Serie', 'Resumen', 'Eventos', 'Filtros y notas']);
    expect(libro.hojas[0].aoa.length).toBe(31);
  });

  it('sin datos de la variable en el período, lo dice en vez de dibujar un gráfico vacío', async () => {
    await montar();
    cambiar(card().querySelector('[data-mop-evo="a"]'), 'zonasTemp');
    expect(card().querySelector('#mopEvo')).toBeNull();
    expect(card().querySelector('.empty-state').textContent).toContain('Sin datos de Temperatura de zonas');
  });
});
