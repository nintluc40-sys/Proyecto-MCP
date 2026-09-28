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
/* F6 · los tipos de aviso que el libro sabe anotar: la pantalla tiene que enseñarlos TODOS. Es una constante pura. */
import { TIPOS_AVISO } from './operativo.tablero.js';

vi.mock('../../core/charts.js', () => ({
  makeChart: vi.fn(),
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));
/* F7 · se sustituye la IMPRESIÓN, no el módulo entero: `operativo.reportes.js` toma de aquí `fnv1a`, que es el
   código verificador del parte. Mockear el módulo completo lo dejaría sin él y la prueba pasaría por el motivo
   equivocado. Imprimir de verdad no se puede: happy-dom no tiene diálogo de impresión. */
vi.mock('../supervisor/fichaPdf.js', async (original) => {
  const real = await original();
  return { ...real, printFichaDocs: vi.fn(() => true) };
});
/* 0f · 8 · «Abrir en 🦠 Microbiología» cambia de vista: aquí no hay vistas registradas, así que se vigila la LLAMADA. */
vi.mock('../../ui/router.js', async (original) => {
  const real = await original();
  return { ...real, changeView: vi.fn() };
});
vi.mock('../microbiologia/index.js', async (original) => {
  const real = await original();
  return { ...real, microPreseleccion: vi.fn() };
});

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
/* 0q·1 (2026-09-27, usuario) · TODOS los gráficos que dibuja este archivo se guardan para revisar su legibilidad al final. */
const GRAFICOS = [];
afterEach(() => {
  if (makeChart && makeChart.mock) GRAFICOS.push(...makeChart.mock.calls.map(([id, cfg]) => ({ id, cfg })));
  root.remove();
  errSpy.mockRestore();
  vi.useRealTimers();
});

describe('Maduración · operativo · 📊 Estado actual', () => {
  it('abre con la barra de filtros, los siete indicadores, el mapa de los 38 tanques, las alertas y los registros', async () => {
    await montar(PLANTA);
    expect(root.querySelector('.mc-title').textContent).toBe('Operativo');
    expect(root.querySelector('.mc-sub').textContent).toContain('19/09/2026');
    expect(root.querySelector('[data-mop-periodo="30d"]').classList.contains('is-on')).toBe(true);
    expect(root.querySelector('.mop-f-rango').textContent).toContain('21/08 – 19/09 · 30 días');
    const fecha = root.querySelector('[data-mop-fecha]');
    expect([fecha.value, fecha.getAttribute('max')]).toEqual(['2026-09-19', '2026-09-19']);
    expect([...root.querySelectorAll('.mc-kpi-lb')].map((x) => x.textContent)).toEqual(['Vivos', 'Lotes', 'Salas', 'Ocupación', 'Mortalidad', 'Reproducción', 'Biomasa']);
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
  /* 2026-09-27 · tope propio: es el PRIMER test del archivo y paga la carga en frío de operativo.view.js y de lo que importa
     (entre ello, data.js de Microchips, que crece). Solo tarda ~1,3 s; como primero de un shard con carga llegó a 4,25 s y
     falló varias veces por el tope de 5 s de vitest. No cambia lo que comprueba. */
  }, 20000);

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
    const info = root.querySelector('.mop-tq-info').textContent.replace(/\s+/g, ' ');
    expect(info).toContain('Sala 1 · tanque 1');
    // 0f · 3: la línea de texto pasó a ser el LIENZO del tanque (sus lotes con código y estado, y lo demás).
    expect(info).toContain('QA · CA · Producción');
    click(root.querySelector('[data-mop-filtrar-tq]'));
    expect([elegido('sala'), elegido('tanque')]).toEqual(['Sala 1', '1']);
    expect(kpi('Vivos')).toBe('34');
  });
});

/* 0f · 4 (2026-09-25, usuario) · la tarjeta ⏳ pasa a ser «⏳ Cuarentena por lote y sala»: una barra por par lote·sala EN
   cuarentena y por cada uno que la TERMINÓ en el período; los que salen en ≤ 7 días, resaltados (el aviso de antes); al
   pulsar una, sus curvas —vivos ♀/♂ en esa sala y bajas por día—. En PLANTA, QA·Sala 2 (entró el 11/09, sale el 26/09:
   aviso) y QB·Sala 4 (12/09 → 27/09); QE·Sala 3, añadida aquí, la terminó el 09/09. */
describe('Maduración · operativo · 0f · 4 · ⏳ la cuarentena por lote y sala', () => {
  const PLANTA_Q = [...PLANTA, ING('25/08/2026', 'QE', 'Sala 3', 22, 3, 6, 'CA')];   // ♂ ≠ ♀: si una serie tomara la otra, se ve
  const tarjeta = () => [...root.querySelectorAll('.mc-card')].find((c) => c.textContent.includes('⏳ Cuarentena por lote y sala'));
  const par = (k) => root.querySelector(`[data-mop-cuar="${k}"]`);

  it('🔴 una barra por par, en su orden: en cuarentena (la que antes sale, arriba) y las terminadas; el aviso resaltado', async () => {
    await montar(PLANTA_Q);
    expect(tarjeta(), 'la tarjeta ⏳ nueva').toBeTruthy();
    expect([...tarjeta().querySelectorAll('[data-mop-cuar]')].map((x) => x.dataset.mopCuar)).toEqual(['QA|Sala 2', 'QB|Sala 4', 'QE|Sala 3']);
    expect(par('QA|Sala 2').classList.contains('is-aviso'), 'sale en ≤ 7 días').toBe(true);
    expect(par('QB|Sala 4').classList.contains('is-aviso')).toBe(false);
    expect(par('QA|Sala 2').textContent).toContain('día 9 de 15');
    expect(par('QA|Sala 2').textContent).toContain('pasa a Producción el 26/09');
    expect(par('QA|Sala 2').querySelector('.mop-bar i').style.width).toBe('60%');          // 9 de 15
    expect(par('QE|Sala 3').classList.contains('is-term')).toBe(true);
    expect(par('QE|Sala 3').textContent).toContain('✓ terminada el 09/09');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 pulsar una barra abre sus curvas: vivos ♀/♂ en esa sala desde el ingreso y las bajas del día; volver a pulsar la cierra', async () => {
    await montar(PLANTA_Q);
    expect(root.querySelector('#mopCuarCurva')).toBeNull();
    click(par('QA|Sala 2'));
    expect(par('QA|Sala 2').classList.contains('is-on')).toBe(true);
    expect(root.querySelector('#mopCuarCurva')).not.toBeNull();
    const l = makeChart.mock.calls.filter(([id]) => id === 'mopCuarCurva');
    const cfg = l[l.length - 1][1];
    expect(cfg.data.labels[0]).toBe('11/09');
    expect(cfg.data.labels.at(-1)).toBe('19/09');
    expect(cfg.data.datasets.map((d) => d.label)).toEqual(['♀ Hembras', '♂ Machos', 'Bajas del día']);
    expect(cfg.data.datasets[0].data[0], 'las hembras de QA en la Sala 2, no las del lote entero').toBe(5);
    // QA también está en la Sala 1: sus bajas son del lote entero, y se dice.
    expect(tarjeta().textContent).toContain('del lote entero');
    click(par('QA|Sala 2'));
    expect(root.querySelector('#mopCuarCurva')).toBeNull();
    // Una TERMINADA también abre sus curvas, del ingreso a su fin; y cada serie es la de su sexo.
    click(par('QE|Sala 3'));
    const lq = makeChart.mock.calls.filter(([id]) => id === 'mopCuarCurva');
    const cq = lq[lq.length - 1][1];
    expect([cq.data.labels[0], cq.data.labels.at(-1)]).toEqual(['25/08', '09/09']);
    expect([cq.data.datasets[0].data[0], cq.data.datasets[1].data[0]], '♀ y ♂ de QE').toEqual([6, 3]);
  });

  it('con el teclado también se abre (Intro), y ✕ la cierra', async () => {
    await montar(PLANTA_Q);
    par('QB|Sala 4').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(root.querySelector('#mopCuarCurva')).not.toBeNull();
    expect(tarjeta().textContent).not.toContain('del lote entero');                         // QB sólo está en la Sala 4
    click(root.querySelector('[data-mop-cuar-cerrar]'));
    expect(root.querySelector('#mopCuarCurva')).toBeNull();
  });

  it('🔑 las clases propias que pinta la tarjeta ⏳ (con un par abierto) están DEFINIDAS en su CSS', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/operativo.css', 'utf8') + readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    await montar(PLANTA_Q);
    click(par('QA|Sala 2'));
    const usadas = new Set();
    tarjeta().querySelectorAll('[class]').forEach((el) => el.classList.forEach((c) => { if (c.startsWith('mop-')) usadas.add(c); }));
    expect(usadas.has('mop-cuar-fila') && usadas.has('mop-cuar-lienzo'), 'control: la tarjeta pinta sus clases').toBe(true);
    expect([...usadas].filter((c) => !new RegExp('\\.' + c + '(?![\\w-])').test(css))).toEqual([]);
  });

  it('sin ningún par, la tarjeta lo dice', async () => {
    await montar(PLANTA.filter((r) => !(r.Lote === 'QA' && r.Sala === 'Sala 2') && r.Lote !== 'QB'));
    expect(tarjeta().textContent).toContain('Ningún lote en cuarentena ni que la haya terminado');
  });
});

/* 0f · 6 (2026-09-25, usuario) · en cada tarjeta de 🏠 Salas, un bloque por lote con lo del Saldo al recalcular: ♀/♂,
   días, mortalidad acumulada · del día, cargas volumétrica y métrica (promedio de sus tanques en la sala) y biomasa. En
   PLANTA, QB (Sala 4, 8♂ 8♀) pesa aquí 30 g ♂ y 40 g ♀; QA está en las Salas 1 y 2 y no tiene pesos. */
describe('Maduración · operativo · 0f · 6 · 🏠 Salas con lo del Saldo por lote', () => {
  const PLANTA_S = [...PLANTA, TQ('18/09/2026', 'Sala 4', 1, { 'Peso promedio machos (g)': 30, 'Peso promedio hembras (g)': 40 })];
  const abrirSalas = () => click(root.querySelector('[data-mop-sub="salas"]'));
  /* Cada lote es un bloque (no una tabla: con las cinco tarjetas en fila, la tabla escondía columnas); `data-v` nombra
     cada cifra. */
  const bloque = (sala, lote) => root.querySelector(`[data-mop-sala="${sala}"] [data-mop-sc-lote="${lote}"]`);
  const v = (sala, lote, k) => bloque(sala, lote).querySelector(`[data-v="${k}"]`).textContent;

  it('🔴 cada tarjeta lleva un bloque por lote, con todo lo del pedido', async () => {
    await montar(PLANTA_S);
    abrirSalas();
    expect([...root.querySelectorAll('[data-mop-sala="Sala 1"] [data-mop-sc-lote]')].map((b) => b.dataset.mopScLote)).toEqual(['QA', 'QC']);
    expect([...bloque('Sala 4', 'QB').querySelectorAll('[data-v]')].map((x) => x.dataset.v)).toEqual(['vivos', 'dias', 'mort', 'cvol', 'cmet', 'bio']);
    expect(bloque('Sala 4', 'QB').textContent).toContain('Mort.');
    expect(bloque('Sala 4', 'QB').textContent).toContain('Biomasa');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 con pesos: biomasa y cargas con su unidad; sin pesos, «—» (no un cero)', async () => {
    await montar(PLANTA_S);
    abrirSalas();
    expect(v('Sala 4', 'QB', 'vivos')).toBe('8 ♀ / 8 ♂');
    expect(v('Sala 4', 'QB', 'bio')).toBe('0,56 kg');                          // (8 × 40 + 8 × 30) g
    expect(v('Sala 4', 'QB', 'cmet')).toMatch(/ g\/m²$/);
    expect(v('Sala 4', 'QB', 'cvol')).toMatch(/ kg\/m³$/);
    // Cada carga en SU sitio: la métrica va en g/m² y la volumétrica en kg/m³, así que la primera sale muy por encima.
    const n = (t) => Number(t.split(' ')[0].replace(/\./g, '').replace(',', '.'));
    expect(n(v('Sala 4', 'QB', 'cmet')) > 10 * n(v('Sala 4', 'QB', 'cvol')), `${v('Sala 4', 'QB', 'cmet')} frente a ${v('Sala 4', 'QB', 'cvol')}`).toBe(true);
    // QD (Sala 2) no tiene ningún peso registrado. (QA sí: los machos de su tanque de la Sala 1 pesan 32 g.)
    expect([v('Sala 2', 'QD', 'cvol'), v('Sala 2', 'QD', 'cmet'), v('Sala 2', 'QD', 'bio')]).toEqual(['—', '—', '—']);
  });

  it('🔴 un lote en dos salas lleva su asterisco y la nota dice que la mortalidad es del lote entero', async () => {
    await montar(PLANTA_S);
    abrirSalas();
    expect(v('Sala 1', 'QA', 'mort')).toContain('*');
    expect(root.querySelector('[data-mop-sala="Sala 1"]').textContent).toContain('Mortalidad del lote entero');
    expect(v('Sala 4', 'QB', 'mort')).not.toContain('*');
    expect(root.querySelector('[data-mop-sala="Sala 4"]').textContent).not.toContain('Mortalidad del lote entero');
  });

  it('🔑 las clases propias de los bloques están DEFINIDAS en su CSS', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/operativo.css', 'utf8') + readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    await montar(PLANTA_S);
    abrirSalas();
    const usadas = new Set();
    root.querySelectorAll('.mop-sc-saldo, .mop-sc-saldo [class]').forEach((el) => el.classList.forEach((c) => { if (c.startsWith('mop-')) usadas.add(c); }));
    expect(usadas.has('mop-sc-saldo') && usadas.has('mop-sc-lote'), 'control').toBe(true);
    expect([...usadas].filter((c) => !new RegExp('\\.' + c + '(?![\\w-])').test(css))).toEqual([]);
  });
});

describe('Maduración · operativo · 🏠 Salas', () => {
  it('cinco tarjetas; al pulsar una, su detalle: calor por hora, O₂, ♀/♂ por tanque y la tabla; otra vez, se cierra', async () => {
    await montar(PLANTA);
    click(root.querySelector('[data-mop-sub="salas"]'));
    const tarjetas = root.querySelectorAll('.mop-sala-card');
    expect(tarjetas).toHaveLength(5);
    const s1 = root.querySelector('[data-mop-sala="Sala 1"]').textContent;
    for (const t of ['Producción', 'Desinfección - Producción agrupada', '1/15 tanques', 'RAS100%', 'hace 7 d', 'QA · Producción']) expect(s1).toContain(t);
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
    expect(root.querySelector('.empty-state').textContent).toContain('📋');   // 2026-09-27 · el emoji de Operativo (antes 🐚)
    await montar([]);
    expect(root.textContent).toContain('Conectando');
  });
});

/* ── 🧬 LOTES (F2.2) ────────────────────────────────────────── */
const CIERRE = (fecha, lote, tipo, machos, hembras) => ({ _SheetOrigin: O, 'Metabisulfito (kg)': '', Fecha: fecha,
  Lote: lote, Tipo: tipo, Machos: machos, Hembras: hembras });
const MORTD = (fecha, lote, clase, entran, muertas) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote,
  'Tipo de tanque': clase, 'Hembras que entran': entran, 'Hembras muertas': muertas });
/* La misma planta, más: 3 hembras de QA muertas en tanques de DESOVE y el cierre TOTAL de QC. */
const PLANTA_L = [...PLANTA, MORTD('15/09/2026', 'QA', 'Desove', 8, 3), CIERRE('17/09/2026', 'QC', 'Total', 2, 2)];
const abrirLotes = () => click(root.querySelector('[data-mop-sub="lotes"]'));
const filaLote = (l) => root.querySelector(`[data-mop-lote="${l}"]`);

describe('Maduración · operativo · 🧬 Lotes', () => {
  it('la sub-nav trae TODAS sus sub-vistas, fijadas aquí una a una, y Lotes abre su tabla maestra, con los cerrados dentro', async () => {
    await montar(PLANTA_L);
    expect([...root.querySelectorAll('[data-mop-sub]')].map((b) => b.textContent.trim()))
      /* D-8 (2026-09-20) · «Revisiones DEL SUPERVISOR», no «Revisiones» a secas: Larvicultura ya
         tiene una vista «🔍 Revisiones», con el mismo icono y otro significado. Que este rótulo esté
         fijado aquí es lo que impide que vuelva a colisionar sin que nadie lo note.
         F4 (2026-09-21) · entran 🛢 Tanques y 🥚 Reproducción, SEPARADAS por decisión del usuario.
         F5 (2026-09-21) · entra 🔄 Manejo, UNA para los tres temas (decisión del usuario).
         F6 (2026-09-21) · entra 🩺 Calidad del dato; Broodstock NO tiene pastilla, vive en 🧬 Lotes (decisión del usuario).
         F7 (2026-09-22) · entra 🖨 Reportes, la décima (decisión del usuario; `.mc-subnav` envuelve en el móvil). */
      .toEqual(['📊 Estado actual', '🏠 Salas', '🧬 Lotes', '💀 Bajas', '🔍 Revisiones del supervisor',
        '🛢 Tanques', '🥚 Reproducción', '🔄 Manejo', '🩺 Calidad del dato', '🖨 Reportes']);
    abrirLotes();
    expect([...root.querySelectorAll('[data-mop-lote]')].map((t) => t.dataset.mopLote)).toEqual(['QA', 'QB', 'QC', 'QD']);
    // QC se cerró: sigue en la tabla, a cero y rotulado.
    const qc = filaLote('QC');
    expect(qc.textContent).toContain('Cerrado');
    expect(qc.textContent).toContain('cerrado');
  });

  it('pulsar una fila abre su ficha; volver a pulsarla la cierra', async () => {
    await montar(PLANTA_L);
    abrirLotes();
    expect(root.querySelector('#mopLoteCurva')).toBeNull();
    click(filaLote('QA'));
    expect(filaLote('QA').classList.contains('is-on')).toBe(true);
    expect(root.querySelector('#mopLoteCurva')).not.toBeNull();
    expect(makeChart).toHaveBeenCalledWith('mopLoteCurva', expect.anything());
    click(filaLote('QA'));
    expect(root.querySelector('#mopLoteCurva')).toBeNull();
  });

  /* 0f · 7 (2026-09-25, usuario) · «la curva de Vivos del lote, desde la fecha del ingreso, no un mes antes». QB entró el
     12/09 y el período por defecto es de 30 d (desde el 21/08): antes, la curva traía 22 días a cero delante. */
  it('🔴 0f · 7 · la curva «Vivos del lote» empieza en el INGRESO del lote y lo dice; sus eventos son los del ciclo', async () => {
    await montar(PLANTA_L);
    abrirLotes();
    click(filaLote('QB'));
    const llamadas = makeChart.mock.calls.filter(([id]) => id === 'mopLoteCurva');
    const cfg = llamadas[llamadas.length - 1][1];
    expect(cfg.data.labels[0], 'la curva debería empezar el día del ingreso').toBe('12/09');
    expect(cfg.data.labels.at(-1)).toBe('19/09');
    expect(cfg.data.datasets[2].data.every((v) => v > 0), 'ningún día a cero antes de existir').toBe(true);
    const card = [...root.querySelectorAll('.mc-card')].find((c) => c.textContent.includes('📈 Vivos del lote'));
    expect(card.querySelector('.mc-h-note').textContent).toBe('desde el ingreso 12/09/2026');
    expect(card.textContent).toContain('Eventos del ciclo');
    expect(card.textContent).toContain('12/09 · Ingreso');
    const repro = [...root.querySelectorAll('.mc-card')].find((c) => c.textContent.includes('🥚 Reproducción'));
    expect(repro.querySelector('.mc-h-note').textContent, 'Reproducción sigue el período').toBe('30 d');
  });

  it('🔴 0f · 7 · un lote que entró ANTES del período: la curva llega hasta su ingreso (la serie es la de su ciclo, no la del período)', async () => {
    await montar(PLANTA_L);
    abrirLotes();
    click(filaLote('QD'));                                   // QD entró el 01/08; el período de 30 d empieza el 21/08
    const llamadas = makeChart.mock.calls.filter(([id]) => id === 'mopLoteCurva');
    expect(llamadas[llamadas.length - 1][1].data.labels[0]).toBe('01/08');
  });

  it('🔴 0f · 7 · abrir OTRO lote en la misma pantalla pinta SU curva, no la del anterior (la serie del ciclo se renueva)', async () => {
    await montar(PLANTA_L);
    abrirLotes();
    const primera = () => { const l = makeChart.mock.calls.filter(([id]) => id === 'mopLoteCurva'); return l[l.length - 1][1].data.labels[0]; };
    click(filaLote('QB'));
    expect(primera()).toBe('12/09');
    click(filaLote('QD'));
    expect(primera(), 'la curva de QD salió con la serie de QB').toBe('01/08');
  });

  it('🔴 la cascada CUADRA y la mortalidad en desove va como «de los cuales», no como una resta', async () => {
    await montar(PLANTA_L);
    abrirLotes();
    click(filaLote('QA'));
    const cuadre = root.querySelector('.mop-cuadre');
    const fila = (n) => [...cuadre.querySelectorAll('tbody tr')].find((t) => t.textContent.includes(n));
    expect(fila('Ingresados').textContent).toContain('40');          // 15 ♂ + 25 ♀
    expect(fila('Muertos').textContent).toContain('3');
    expect(fila('Vivos').textContent).toContain('37');
    expect(root.querySelector('.mop-cuadre-sub').textContent).toContain('de los cuales');
    expect(root.querySelector('.mop-cuadre-sub').textContent).toContain('ya contadas arriba');
    expect(root.querySelector('.mop-igual').textContent).toContain('cuadra');
    // Y la fila de la tabla NO lleva el aviso de descuadre.
    expect(filaLote('QA').querySelector('.mop-dif')).toBeNull();
  });

  it('el selector de agrupación cambia la comparativa entre lote, código genético y piscina', async () => {
    await montar(PLANTA_L);
    abrirLotes();
    expect([...root.querySelectorAll('[data-mop-agr]')].map((b) => b.dataset.mopAgr)).toEqual(['lote', 'codigo', 'piscina']);
    expect(root.querySelector('[data-mop-agr="lote"]').classList.contains('is-on')).toBe(true);
    click(root.querySelector('[data-mop-agr="codigo"]'));
    expect(root.querySelector('[data-mop-agr="codigo"]').classList.contains('is-on')).toBe(true);
    const tablas = root.querySelectorAll('.mc-table');
    const comp = tablas[tablas.length - 1];
    expect(comp.querySelector('thead').textContent).toContain('Código genético');
    expect([...comp.querySelectorAll('tbody tr')].map((t) => t.querySelector('td').textContent.trim().split(' ')[0])).toEqual(['CA', 'CB']);
  });

  it('el filtro acota la tabla, y un lote que se sale del filtro suelta su ficha', async () => {
    await montar(PLANTA_L);
    abrirLotes();
    click(filaLote('QA'));
    expect(root.querySelector('#mopLoteCurva')).not.toBeNull();
    cambiar(filtro('sala'), 'Sala 4');
    expect([...root.querySelectorAll('[data-mop-lote]')].map((t) => t.dataset.mopLote)).toEqual(['QB']);
    expect(root.querySelector('#mopLoteCurva')).toBeNull();   // QA ya no está: su ficha tampoco
  });

  it('con un filtro que no deja ningún lote lo dice, y no revienta', async () => {
    await montar(PLANTA_L);
    abrirLotes();
    cambiar(filtro('lote'), 'QA');
    cambiar(filtro('codigo'), 'CB');
    cambiar(filtro('sala'), 'Sala 4');
    expect(root.querySelectorAll('[data-mop-lote]')).toHaveLength(0);
    expect(root.textContent).toContain('Ningún lote pasa el filtro');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('lo que viene del Sheet sale ESCAPADO también aquí', async () => {
    const malo = '<img src=x onerror=alert(1)>';
    await montar([...PLANTA_L, ING('05/09/2026', malo, 'Sala 3', 2, 1, 1, 'CA')]);
    abrirLotes();
    click(filaLote(malo));
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(malo);
  });
});

/* ── F2.3 · filtros nuevos, etiquetas, ciclo y biomasa ──────── */
const ING_P = (fecha, lote, sala, tanque, machos, hembras, cg, piscina, camaronera) => ({ _SheetOrigin: O,
  'Camaronera origen': camaronera, Fecha: fecha, Lote: lote, 'Código genético': cg, 'Piscina Broodstock': piscina,
  Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
/* LA produce desde agosto (20♂ 30♀) y LB entró el 15/09 (10♂, sin hembras): sigue en cuarentena el 19. */
const PLANTA_F3 = [
  ING_P('01/08/2026', 'LA', 'Sala 1', 1, 20, 30, 'CA', 'P1', 'CX'),
  ING_P('15/09/2026', 'LB', 'Sala 1', 2, 10, 0, 'CB', 'P2', 'CY'),
  TQ('18/09/2026', 'Sala 1', 1, { 'Peso promedio machos (g)': '30', 'Peso promedio hembras (g)': '40' }),
  TQ('18/09/2026', 'Sala 1', 2, { 'Peso promedio machos (g)': '25' }),
];
const chips = () => [...root.querySelectorAll('[data-mop-quitar]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());

describe('Maduración · operativo · F2.3 · filtros, etiquetas, ciclo y biomasa', () => {
  it('la barra trae los cuatro filtros nuevos, con las opciones que dan los datos', async () => {
    await montar(PLANTA_F3);
    expect(filtro('estado')).not.toBeNull();
    expect([...filtro('estado').options].map((o) => o.value)).toEqual(['', 'Cuarentena', 'Producción', 'Cerrado']);
    expect([...filtro('sexo').options].map((o) => [o.value, o.textContent])).toEqual([['', 'Los dos sexos'], ['hembras', '♀ Hembras'], ['machos', '♂ Machos']]);
    expect([...filtro('piscina').options].map((o) => o.value)).toEqual(['', 'P1', 'P2']);
    expect([...filtro('camaronera').options].map((o) => o.value)).toEqual(['', 'CX', 'CY']);
  });

  it('🔴 el filtro de SEXO cambia los vivos, se anuncia como etiqueta, y quitarla lo deshace', async () => {
    await montar(PLANTA_F3);
    expect(kpi('Vivos')).toBe('60');
    expect(chips()).toEqual([]);
    cambiar(filtro('sexo'), 'hembras');
    // LB no tiene hembras: se va entero, y de LA sólo se cuentan las 30 hembras.
    expect(kpi('Vivos')).toBe('30');
    expect(chips()).toEqual(['Sexo: ♀ Hembras ✕']);
    click(root.querySelector('[data-mop-quitar="sexo"]'));
    expect(kpi('Vivos')).toBe('60');
    expect(chips()).toEqual([]);
  });

  it('el filtro de ESTADO y el de ORIGEN acotan, y sus etiquetas van en el orden del catálogo', async () => {
    await montar(PLANTA_F3);
    cambiar(filtro('estado'), 'Cuarentena');
    expect(kpi('Vivos')).toBe('10');
    cambiar(filtro('piscina'), 'P1');
    expect(kpi('Vivos')).toBe('0');          // LB es de P2: nada cumple las dos
    expect(chips()).toEqual(['Estado: Cuarentena ✕', 'Piscina: P1 ✕']);
    click(root.querySelector('[data-mop-quitar="estado"]'));
    expect(kpi('Vivos')).toBe('50');         // sólo P1 = LA
  });

  it('🔴 el período CICLO: sin lote lo dice y no finge un rango; con lote, es el del lote', async () => {
    await montar(PLANTA_F3);
    click(root.querySelector('[data-mop-periodo="ciclo"]'));
    expect(root.querySelector('.mop-f-rango').textContent).toContain('elige un lote');
    expect(root.querySelector('.mop-f-rango').textContent).toContain('21/08 – 19/09');   // el de por defecto
    cambiar(filtro('lote'), 'LA');
    expect(root.querySelector('.mop-f-rango').textContent).toContain('01/08 – 19/09 · 50 días');
    expect(root.querySelector('.mop-f-rango').textContent).not.toContain('elige un lote');
  });

  it('🔴 la BIOMASA es el séptimo indicador, pesa por tanque, y sin pesos se queda vacía', async () => {
    await montar(PLANTA_F3);
    // ♂ (30×20 + 25×10) ÷ 30 = 28,33 g → 850 g; ♀ 30 × 40 = 1 200 g. Total 2,05 kg.
    expect(kpi('Biomasa')).toBe('2,05 kg');
    await montar([ING_P('01/08/2026', 'LA', 'Sala 1', 1, 20, 30, 'CA', 'P1', 'CX')]);
    expect(kpi('Biomasa')).toBe('—');
    expect(root.textContent).toContain('sin pesos registrados');
  });

  it('✕ Limpiar suelta también los cuatro filtros nuevos', async () => {
    await montar(PLANTA_F3);
    cambiar(filtro('sexo'), 'machos');
    cambiar(filtro('camaronera'), 'CX');
    expect(chips()).toHaveLength(2);
    click(root.querySelector('[data-mop-limpiar]'));
    expect(chips()).toEqual([]);
    expect(kpi('Vivos')).toBe('60');
  });
});

describe('Maduración · operativo · F2.3 · el sexo también manda en la tabla de lotes', () => {
  it('🔴 con filtro de SEXO la tabla enseña ESE sexo, no el total del lote, y lo rotula', async () => {
    await montar(PLANTA_F3);
    click(root.querySelector('[data-mop-sub="lotes"]'));
    const celdas = (l) => [...filaLote(l).querySelectorAll('td')].map((t) => t.textContent.trim());
    expect(celdas('LA')[5]).toBe('50');                 // vivos del lote: 20 ♂ + 30 ♀
    expect(celdas('LA')[4]).toBe('50');                 // ingresados
    cambiar(filtro('sexo'), 'hembras');
    // LB no tiene hembras: se va. Y de LA se enseñan las 30 hembras, no las 50 (que es lo que dice el KPI de arriba).
    expect([...root.querySelectorAll('[data-mop-lote]')].map((t) => t.dataset.mopLote)).toEqual(['LA']);
    expect(celdas('LA')[5]).toBe('30');
    expect(root.querySelector('.mop-lotes thead').textContent).toContain('♀ Vivos');
    expect(celdas('LA')[8]).toBe('—');                  // la proporción sexual no dice nada con un solo sexo
  });

  it('la CASCADA de la ficha sigue entera con filtro de sexo: un cuadre a medias no cuadraría', async () => {
    await montar(PLANTA_F3);
    click(root.querySelector('[data-mop-sub="lotes"]'));
    cambiar(filtro('sexo'), 'hembras');
    click(filaLote('LA'));
    const cuadre = root.querySelector('.mop-cuadre');
    const fila = (n) => [...cuadre.querySelectorAll('tbody tr')].find((t) => t.textContent.includes(n));
    expect(fila('Ingresados').textContent).toContain('50');   // ♂ y ♀, enteros
    expect(fila('Vivos').textContent).toContain('50');
    expect(root.querySelector('.mop-igual').textContent).toContain('cuadra');
  });
});

describe('Maduración · operativo · F2.3 · quitar la etiqueta de sala', () => {
  it('🔴 suelta también su TANQUE: si no, el 1 de la Sala 1 reaparecería como el 1 de la Sala 4', async () => {
    await montar(PLANTA);
    cambiar(filtro('sala'), 'Sala 1');
    cambiar(filtro('tanque'), '1');
    expect(chips()).toEqual(['Sala: Sala 1 ✕', 'Tanque: 1 ✕']);
    click(root.querySelector('[data-mop-quitar="sala"]'));
    expect(chips()).toEqual([]);
    /* El daño no se ve al quitarla —sin sala, el tanque ya no normaliza—: se ve DESPUÉS. La Sala 4 también
       tiene un tanque 1, así que un `vOp.tanque` que sobreviviera se volvería a aplicar solo, en silencio. */
    cambiar(filtro('sala'), 'Sala 4');
    expect(chips()).toEqual(['Sala: Sala 4 ✕']);
    expect(elegido('tanque')).toBe('');
  });
});

/* ── F3 · 💀 Bajas y 🔍 Revisiones ──────────────────────────── */
/* La hoja de Fin de Ciclo, cuya firma es «Metabisulfito (kg)». */
const CIERRE3 = (fecha, extra) => ({ _SheetOrigin: O, 'Metabisulfito (kg)': '', Fecha: fecha, ...extra });
const PLANTA_B = [
  ING('01/09/2026', 'LA', 'Sala 1', 1, 100, 100),
  TQ('10/09/2026', 'Sala 1', 1, { Hora: '06:00', Parte: 1, 'Machos muertos': 10, 'Hembras muertas': 6,
    'Machos muertos por descarte de selección': 4, 'Hembras muertas por descarte de selección': 2,
    'Observaciones operativas': 'En recambio' }),
  TQ('11/09/2026', 'Sala 1', 1, { Hora: '18:30', Parte: 2, 'Machos muertos': 2, 'Hembras muertas': 1 }),
  /* Las tres clases de fila del Inf. Supervisor, en la misma hoja. */
  INF('18/09/2026', { 'Revisión': 'Postlavado', Lote: 'LA', Deformidad: 'Media', Actividad: 'Baja',
    Hongos: 'Presente', Fototropismo: 'Baja', 'Aireación': 'Media', Salinidad: 65, Temperatura: 41 }),
  INF('17/09/2026', { 'Tipo de tanque': 'Desove', Lote: 'LA', 'Hembras que entran': 30, 'Hembras muertas': 3 }),
  INF('18/09/2026', { 'Área': 'Sala 1', 'Alcalinidad día': 95, 'Alcalinidad noche': 120 }),
  CIERRE3('15/09/2026', { Lote: 'LA', Tipo: 'Parcial', Motivo: 'Pedido', Machos: 10, Hembras: 10, 'Metabisulfito (kg)': 2 }),
];
const abrir = (sub) => click(root.querySelector('[data-mop-sub="' + sub + '"]'));
const card = (titulo) => [...root.querySelectorAll('.mc-card')]
  .find((c) => (c.querySelector('.mc-card-h') || { textContent: '' }).textContent.includes(titulo));

describe('Maduración · operativo · 💀 Bajas', () => {
  it('🔴 la tabla cruzada separa muerte natural de descarte, y el total los SUMA', async () => {
    await montar(PLANTA_B);
    abrir('bajas');
    const fila = [...root.querySelectorAll('.mop-cruz tbody tr')][0];
    const c = [...fila.querySelectorAll('td')].map((t) => t.textContent.trim());
    // Sala 1 · natural 12 ♂ / 7 ♀ = 19 · descarte 4 ♂ / 2 ♀ = 6 · total 25
    expect(c.slice(0, 8)).toEqual(['Sala 1', '12', '7', '19', '4', '2', '6', '25']);
    expect(root.querySelector('.mop-cruz thead').textContent).toContain('Muerte natural');
    expect(root.querySelector('.mop-cruz thead').textContent).toContain('Descarte de selección');
    expect(card('Bajas del período').textContent).toContain('DISJUNTAS');
  });

  it('el selector de agrupación cambia entre sala, tanque y lote', async () => {
    await montar(PLANTA_B);
    abrir('bajas');
    expect([...root.querySelectorAll('[data-mop-agrb]')].map((b) => b.dataset.mopAgrb)).toEqual(['sala', 'tanque', 'lote']);
    expect(root.querySelector('[data-mop-agrb="sala"]').classList.contains('is-on')).toBe(true);
    click(root.querySelector('[data-mop-agrb="lote"]'));
    const fila = [...root.querySelectorAll('.mop-cruz tbody tr')][0];
    expect(fila.querySelector('td').textContent).toContain('LA');
    // Por lote entran también las 3 hembras muertas desovando, y se dicen aparte.
    expect(fila.textContent).toContain('3 en desove');
    expect(card('Bajas del período').textContent).toContain('repartidas por el libro');
  });

  it('🔴 la distribución por hora agrupa por hora entera y marca el pico', async () => {
    await montar(PLANTA_B);
    abrir('bajas');
    const h = card('Bajas por hora');
    expect(h.textContent).toContain('06:00');
    expect(h.textContent).toContain('18:00');
    expect(h.querySelector('.mop-pico').textContent).toContain('06:00');   // 22 bajas frente a 3
  });

  it('el mapa de calor distingue el hueco del cero, y los motivos traen su metabisulfito', async () => {
    await montar(PLANTA_B);
    abrir('bajas');
    const cal = card('Bajas por sala y día');
    expect(cal.querySelectorAll('.mop-calor tbody tr')).toHaveLength(1);
    const celdas = [...cal.querySelectorAll('.mop-calor tbody td')];
    expect(celdas.filter((t) => t.textContent.trim() === '').length).toBeGreaterThan(20);  // los días sin parte
    expect(cal.textContent).toContain('no se registró ningún parte');
    const m = card('Motivos de Fin de Ciclo');
    expect(m.textContent).toContain('Pedido');
    expect(m.textContent).toContain('2 kg');
  });

  it('los lotes cerrados traen su cierre, y se dice que la diferencia no se recalcula', async () => {
    await montar(PLANTA_B);
    abrir('bajas');
    const c = card('Lotes cerrados');
    const fila = c.querySelector('tbody tr');
    expect(fila.textContent).toContain('LA');
    expect(fila.textContent).toContain('Parcial');
    expect(c.textContent).toContain('no se recalcula');
  });

  it('sin bajas en el período lo dice y no revienta', async () => {
    await montar([ING('01/09/2026', 'LA', 'Sala 1', 1, 100, 100)]);
    abrir('bajas');
    expect(root.textContent).toContain('Ninguna baja registrada');
    expect(root.textContent).toContain('Ningún lote se cerró');
    expect(errSpy).not.toHaveBeenCalled();
  });
});

describe('Maduración · operativo · 🔍 Revisiones', () => {
  it('🔴 el semáforo marca lo que tiene regla y DICE que lo demás no la tiene', async () => {
    await montar(PLANTA_B);
    abrir('revisiones');
    const sems = [...root.querySelectorAll('.mop-sem')];
    const de = (etq) => sems.find((x) => x.querySelector('.mop-sem-l').textContent === etq);
    // Hongos «Presente», salinidad 65 (> 60) y temperatura 41 (> 40): los tres marcados.
    expect(de('Hongos').classList.contains('is-malo')).toBe(true);
    expect(de('Salinidad').classList.contains('is-malo')).toBe(true);
    expect(de('Temperatura').classList.contains('is-malo')).toBe(true);
    // Deformidad y las otras tres cualitativas: su valor, SIN veredicto.
    expect(de('Deformidad').classList.contains('is-malo')).toBe(false);
    expect(de('Deformidad').textContent).toContain('Media');
    expect(de('Deformidad').textContent).toContain('sin criterio');
    expect(de('Hongos').textContent).not.toContain('sin criterio');
    expect(card('Revisión de nauplios').textContent).toContain('una escala inventada sería peor que ninguna');
  });

  it('las cuatro etapas se enseñan, y las que no tienen revisión se ven vacías', async () => {
    await montar(PLANTA_B);
    abrir('revisiones');
    const chips = [...card('Revisión de nauplios').querySelectorAll('.mop-chip')];
    expect(chips.map((c) => c.textContent.trim().split(' ·')[0])).toEqual(['Entrada', 'Lavado', 'Lavado 2', 'Postlavado']);
    expect(chips[0].classList.contains('is-e-vacio')).toBe(true);        // sin Entrada
    expect(chips[3].classList.contains('is-e-vacio')).toBe(false);       // con Postlavado
  });

  it('la alcalinidad enseña día y noche por área, y el RAS se rotula como circuito', async () => {
    await montar(PLANTA_B);
    abrir('revisiones');
    const a = card('Alcalinidad por área');
    expect(a.textContent).toContain('circuito');
    const s1 = [...a.querySelectorAll('tbody tr')].find((t) => t.textContent.includes('Sala 1'));
    expect(s1.textContent).toContain('95');
    expect(s1.textContent).toContain('120');
    expect(a.textContent).toContain('no borra la del día');
    expect(a.querySelector('.mc-h-note').textContent, 'el rótulo dice el rango y de dónde sale').toContain('120–150 mg/L CaCO₃ · laboratorio');
  });

  it('🔴 la mortalidad en desove se enseña y se DICE que no se suma a Bajas', async () => {
    await montar(PLANTA_B);
    abrir('revisiones');
    const m = card('Mortalidad en desove y recuperación');
    expect(m.textContent).toContain('Desove');
    expect(m.textContent).toContain('Recuperación');
    expect(m.textContent).toContain('No se suman a');
    const des = [...m.querySelectorAll('tbody tr')].find((t) => t.textContent.includes('Desove'));
    expect([...des.querySelectorAll('td')].map((t) => t.textContent.trim()).slice(0, 4)).toEqual(['Desove', '30', '3', '10 %']);
  });

  it('las observaciones se cuentan y el historial marca las revisiones con aviso', async () => {
    await montar(PLANTA_B);
    abrir('revisiones');
    expect(card('Observaciones de tanque').textContent).toContain('En recambio');
    const hist = card('Historial de revisiones');
    expect(hist.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(hist.querySelector('tbody tr').classList.contains('mop-atrasada')).toBe(true);
  });

  it('sin revisiones lo dice', async () => {
    await montar([ING('01/09/2026', 'LA', 'Sala 1', 1, 10, 10)]);
    abrir('revisiones');
    expect(root.textContent).toContain('Ninguna revisión registrada');
  });

  /* ⚠ Un `it` por montaje: `montar` reimporta el módulo, pero `root` es el mismo nodo y ya lleva
     `_mopBound`, así que un segundo `bind` no engancha nada y los clics irían al estado ANTERIOR. */
  it('lo que viene del Sheet sale escapado también aquí', async () => {
    const malo = '<img src=x onerror=alert(1)>';
    await montar([...PLANTA_B, INF('19/09/2026', { 'Revisión': 'Entrada', Lote: malo, Hongos: 'Ausente' })]);
    abrir('revisiones');
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(malo);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   F4 · 🛢 TANQUES y 🥚 REPRODUCCIÓN (2026-09-21)
   Las CIFRAS las prueban operativo.tanques.test.js, operativo.reproduccion.test.js y sus bancos; aquí se exige
   que lleguen a la pantalla, que los controles hagan lo que dicen y que lo del Sheet salga escapado.
   ══════════════════════════════════════════════════════════════════════════════ */
const DES = (fecha, lote, desoves, huevos, extra) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote,
  'Código genético': 'CA', Desoves: desoves, 'Total de huevos': huevos, 'Hembras no viables': 0,
  'Fecha N2': '', N2: '', 'Fecha N5': '', N5: '', Despacho: '', ...extra });
const MOV = (fecha, so, to, sd, td, machos, hembras) => ({ _SheetOrigin: O, Fecha: fecha, Tipo: 'Transferencia',
  'Sala origen': so, 'Tanque origen': to, 'Sala destino': sd, 'Tanque destino': td, Machos: machos,
  Hembras: hembras, 'Agua destino': 'Playa', Motivo: 'Redistribución', ID: fecha + to + td });

const PLANTA_F4 = [
  ...PLANTA,
  TQ('19/09/2026', 'Sala 1', 1, { 'Machos muertos': '2', Hora: '08:00', Parte: '1',
    'Observaciones operativas': 'Aireación normal', 'Observaciones sanitarias': 'Animales maduros' }),
  TQ('19/09/2026', 'Sala 1', 1, { 'Hembras muertas': '1', Hora: '14:40', Parte: '2',
    'Observaciones operativas': 'Aireación normal' }),
  TQ('19/09/2026', 'Sala 1', 1, { 'Cópulas': '3' }),
  MOV('17/09/2026', 'Sala 1', '1', 'Sala 2', '16', 1, 0),
  DES('12/09/2026', 'QA', 4, 400000, { 'Fecha N2': '12/09/2026', N2: 300000, 'Fecha N5': '13/09/2026',
    N5: 200000, Despacho: 'Tabasca, Hisenor' }),
  DES('16/09/2026', 'QA', 2, 200000, { 'Fecha N5': '17/09/2026' }),
];
const abrirTanques = () => click(root.querySelector('[data-mop-sub="tanques"]'));
const filaTq = (k) => root.querySelector('[data-mop-tqf="' + k + '"]');

describe('Maduración · operativo · 🛢 Tanques', () => {
  it('abre su tabla maestra con los tanques OCUPADOS y sus cifras', async () => {
    await montar(PLANTA_F4);
    abrirTanques();
    const filas = [...root.querySelectorAll('[data-mop-tqf]')].map((t) => t.dataset.mopTqf);
    expect(filas).toContain('Sala 1|1');
    expect(filas.length).toBeGreaterThan(0);
    expect(filaTq('Sala 1|1').textContent).toContain('compartido');
  });

  it('pulsar una fila abre su ficha; volver a pulsarla la cierra', async () => {
    await montar(PLANTA_F4);
    abrirTanques();
    expect(root.querySelector('.mop-ficha')).toBeNull();
    click(filaTq('Sala 1|1'));
    const f = root.querySelector('.mop-ficha');
    expect(f).not.toBeNull();
    expect(f.textContent).toContain('Tanque 1');
    click(filaTq('Sala 1|1'));
    expect(root.querySelector('.mop-ficha')).toBeNull();
  });

  it('🔑 la ficha enseña los partes CON SU HORA, y el que no la trae va al final y se rotula', async () => {
    await montar(PLANTA_F4);
    abrirTanques();
    click(filaTq('Sala 1|1'));
    const t = root.querySelector('.mop-ficha').textContent;
    expect(t).toContain('08:00');
    expect(t).toContain('14:40');
    /* ⚠ La CELDA del parte sin hora, no el texto de toda la ficha: la nota al pie también dice «sin hora»,
       así que buscarlo en el texto entero NO distinguía que la celda se quedara muda. Lo delató la mutación
       V43 de su banco, que sobrevivía. */
    const filas = [...root.querySelectorAll('.mop-partes tbody tr')];
    expect(filas[0].cells[0].textContent.trim()).toBe('08:00');
    expect(filas[2].cells[0].textContent.trim()).toBe('sin hora');
    expect(t).toContain('no se les inventa');
  });

  it('la ficha trae composición, observaciones y movimientos', async () => {
    await montar(PLANTA_F4);
    abrirTanques();
    click(filaTq('Sala 1|1'));
    const t = root.querySelector('.mop-ficha').textContent;
    expect(t).toContain('Composición');
    expect(t).toContain('Aireación normal');
    expect(t).toContain('Movimientos del período');
    expect(t).toContain('Sala 2');
  });

  it('🔑 con filtro de lote la fila avisa y la composición que queda fuera se marca, sin esconderla', async () => {
    await montar(PLANTA_F4);
    abrirTanques();
    cambiar(filtro('lote'), 'QA');
    click(filaTq('Sala 1|1'));
    const ficha = root.querySelector('.mop-ficha');
    expect(ficha.textContent).toContain('QC');
    expect(ficha.querySelector('tr.mop-fuera')).not.toBeNull();
    expect(ficha.textContent).toContain('fuera del filtro');
    expect(root.textContent).toContain('tanque ENTERO');
  });

  it('un tanque elegido que ya no pasa el filtro pierde su ficha', async () => {
    await montar(PLANTA_F4);
    abrirTanques();
    click(filaTq('Sala 1|1'));
    expect(root.querySelector('.mop-ficha')).not.toBeNull();
    cambiar(filtro('sala'), 'Sala 4');
    expect(root.querySelector('.mop-ficha')).toBeNull();
  });

  it('🔑 si la foto no tiene partes, apunta a dónde SÍ los hay', async () => {
    await montar(PLANTA_F4);
    abrirTanques();
    cambiar(root.querySelector('[data-mop-fecha]'), '2026-09-18');
    click(filaTq('Sala 1|1'));
    const t = root.querySelector('.mop-ficha').textContent;
    expect(t).toContain('Sin partes en la foto de este día');
    /* El último parte que la foto del 18 VE es el del 16 — los del 19 son futuro y una foto nunca lo ve—,
       y decirlo evita que la sección sea un callejón que dice «no hay» sin decir dónde mirar. */
    expect(t).toContain('16/09/2026');
    expect(t).not.toContain('19/09/2026');
  });

  it('lo que viene del Sheet sale ESCAPADO', async () => {
    const malo = '<img src=x onerror=alert(1)>';
    await montar([...PLANTA_F4, TQ('19/09/2026', 'Sala 1', 1, { Hora: '20:00', Parte: '3',
      'Observaciones operativas': malo })]);
    abrirTanques();
    click(filaTq('Sala 1|1'));
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(malo);
  });
});

const abrirRepro = () => click(root.querySelector('[data-mop-sub="reproduccion"]'));

describe('Maduración · operativo · 🥚 Reproducción', () => {
  it('abre con sus totales, los PENDIENTES arriba y la tabla por lote', async () => {
    await montar(PLANTA_F4);
    abrirRepro();
    expect(kpi('Desoves')).toBe('6');
    expect(kpi('Pendientes de N5')).toBe('1');
    const t = root.textContent;
    expect(t).toContain('Pendientes de N5');
    expect(t).toContain('Por lote');
    // ⚠ «75 %», no «75,00 %»: nf() no pone decimales de más (regla ya anotada del proyecto).
    expect(t).toContain('75 %');
  });

  it('🔑 dice que N5 no se compara con N2, y por qué', async () => {
    await montar(PLANTA_F4);
    abrirRepro();
    expect(root.textContent).toContain('N5 no se compara con N2');
  });

  it('🔑 el pendiente sale con su espera y explica la regla', async () => {
    await montar(PLANTA_F4);
    abrirRepro();
    const t = root.textContent;
    expect(t).toContain('SIN CIFRA de N5');
    expect(t).toContain('cero es una medición');
    expect(root.querySelector('.mop-pend-tarde')).not.toBeNull();
  });

  it('🔑 un desove con DOS destinos cuenta en los dos, y se avisa de que no suman', async () => {
    await montar(PLANTA_F4);
    abrirRepro();
    const t = root.textContent;
    expect(t).toContain('Tabasca');
    expect(t).toContain('Hisenor');
    expect(t).toContain('NO suman el total');
  });

  it('sin pendientes, lo dice en vez de dejar la tarjeta vacía', async () => {
    await montar([...PLANTA, DES('12/09/2026', 'QA', 4, 400000, { N2: 300000, N5: 200000 })]);
    abrirRepro();
    expect(root.textContent).toContain('todos los desoves del período tienen ya su cifra de N5');
  });

  it('el filtro de sala se ignora aquí, y se dice', async () => {
    await montar(PLANTA_F4);
    abrirRepro();
    cambiar(filtro('sala'), 'Sala 1');
    expect(root.textContent).toContain('no puede separarse por sala');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   F5 · 🔄 MANEJO (2026-09-21)
   Las CIFRAS las prueban operativo.manejo.test.js y su banco; aquí se exige que lleguen a la pantalla con lo que
   el usuario decidió —tres bloques; la matriz con animales y (movimientos); el registro entero debajo; la ración
   rotulada PLANIFICADA y cada toma juzgada con el rango de la ficha—, que cada hoja diga lo que NO puede filtrar
   con SU motivo, y que lo del Sheet salga escapado.
   ══════════════════════════════════════════════════════════════════════════════ */
const ALIMV = (fecha, sala, tanque, lotes, kg, tomas, fuente = 'Biometría') => ({ _SheetOrigin: O, 'Fuente del peso': fuente,
  Fecha: fecha, Sala: sala, Tanque: tanque, Lotes: lotes, 'Biomasa total (kg)': '100', ...kg, Tomas: tomas });
const TRATX = (fecha, sala, tipo, area, lotes, productos) => ({ _SheetOrigin: O, 'Productos RAS': '', Fecha: fecha,
  Sala: sala, Tipo: tipo, 'Área': area, Lotes: lotes, Productos: productos });

/* Sobre la planta de F4 (que ya trae S1·1 → S2·16 el 17/09 y la desinfección de la Sala 1 del 12/09):
   · un movimiento DENTRO de la Sala 1 (su diagonal) y otro S2 → S4 con observaciones;
   · dos raciones: el 18/09 con una toma de Krill al 2,5 % (fuera de 0,25–2) y Calamar justo en el 2 % (dentro);
   · un preventivo a QA el 15/09. QB, QC y QD no reciben ninguno. */
const PLANTA_F5 = [
  ...PLANTA_F4,
  MOV('18/09/2026', 'Sala 1', '1', 'Sala 1', '2', 2, 2),
  { ...MOV('19/09/2026', 'Sala 2', '16', 'Sala 4', '1', 0, 3), Motivo: 'Anillado', Observaciones: 'Con red nueva' },
  ALIMV('18/09/2026', 'Sala 1', 1, 'QA', { 'Calamar (kg/día)': '2', 'Krill (kg/día)': '1' }, '07:00 Krill 2.5; 08:30 Calamar 2'),
  ALIMV('19/09/2026', 'Sala 1', 1, 'QA', { 'Calamar (kg/día)': '2' }, '08:30 Calamar 2', 'Ingreso'),
  TRATX('15/09/2026', 'Sala 1', 'Preventivo', 'Salas y tanques', 'QA', 'Bacmil'),
];
const abrirManejo = () => click(root.querySelector('[data-mop-sub="manejo"]'));
const plano = (el) => el.textContent.replace(/\s+/g, ' ').trim();

describe('Maduración · operativo · 🔄 Manejo', () => {
  it('abre con sus TRES bloques, en el orden aprobado', async () => {
    await montar(PLANTA_F5);
    abrirManejo();
    const h = [...root.querySelectorAll('.mc-card-h')].map((x) => x.textContent);
    expect(h).toHaveLength(3);
    expect(h[0]).toContain('🔄 Movimientos');
    expect(h[1]).toContain('🦐 Alimentación');
    expect(h[2]).toContain('🧪 Tratamientos');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔑 la matriz: cada celda dice ANIMALES y (movimientos), y la diagonal es DENTRO de la sala', async () => {
    await montar(PLANTA_F5);
    abrirManejo();
    const m = root.querySelector('.mop-matriz');
    const cols = [...m.querySelectorAll('thead th')].map((th) => th.textContent);
    const celda = (o, d) => [...m.querySelectorAll('tbody tr')].find((tr) => tr.cells[0].textContent === o).cells[cols.indexOf(d)];
    expect(cols.slice(1)).toEqual(['Sala 1', 'Sala 2', 'Sala 4']);
    expect(plano(celda('Sala 1', 'Sala 2'))).toBe('1 (1)');
    expect(plano(celda('Sala 2', 'Sala 4'))).toBe('3 (1)');
    expect(plano(celda('Sala 1', 'Sala 1'))).toBe('⟳ 4 (1)');
    expect(plano(celda('Sala 4', 'Sala 1'))).toBe('—');
    // El motivo que no está en el catálogo se MARCA en el reparto, no se disimula.
    expect(root.querySelector('.mop-repartos').textContent).toContain('fuera del catálogo');
  });

  it('el registro va ENTERO debajo de la matriz, del más reciente al más antiguo', async () => {
    await montar(PLANTA_F5);
    abrirManejo();
    const filas = [...root.querySelectorAll('.mop-registro tbody tr')];
    expect(filas.map((tr) => tr.cells[0].textContent)).toEqual(['19/09/2026', '18/09/2026', '17/09/2026']);
    expect(filas[0].textContent).toContain('Con red nueva');
  });

  it('🔑 la ración se rotula PLANIFICADA y se juzga cada TOMA: la de fuera se dice con su hora, y la del tope no', async () => {
    await montar(PLANTA_F5);
    abrirManejo();
    expect(root.textContent).toContain('ración PLANIFICADA');
    expect(kpi('Tomas fuera de rango')).toBe('1');
    const d = plano(root.querySelector('.mop-tomas-fuera'));
    expect(d).toContain('Krill al 2,5 % a las 07:00 del 18/09/2026 en Sala 1');
    const fila = (p) => [...root.querySelectorAll('.mop-alim tbody tr')].find((tr) => tr.cells[0].textContent === p);
    expect(fila('Krill').classList.contains('mop-fuera-rango')).toBe(true);
    expect(fila('Calamar').classList.contains('mop-fuera-rango')).toBe(false);   // 2 % es el tope, no fuera
  });

  it('tratamientos: el día sin tratamiento va VACÍO, y un lote sin preventivo dice «ninguno» sin inventar días', async () => {
    await montar(PLANTA_F5);
    abrirManejo();
    const s1 = [...root.querySelectorAll('.mop-trat tbody tr')].find((tr) => tr.cells[0].textContent === 'Sala 1');
    const tds = [...s1.querySelectorAll('td')];
    expect(tds.filter((td) => td.classList.contains('is-trat'))).toHaveLength(2);   // el 12 y el 15
    expect(tds.some((td) => td.textContent === '0')).toBe(false);                   // vacío, nunca un cero
    const cob = [...root.querySelectorAll('.mop-cob tbody tr')];
    const lote = (l) => cob.find((tr) => tr.cells[0].textContent === l);
    expect(plano(lote('QA').cells[2])).toBe('4 d');
    expect(lote('QB').textContent).toContain('ninguno');
    expect(plano(lote('QB').cells[2])).toBe('—');
    expect(lote('QB').classList.contains('mop-cob-no')).toBe(true);
  });

  it('🔑 el filtro de TANQUE no llega a los tratamientos, y se dice con SU motivo', async () => {
    await montar(PLANTA_F5);
    abrirManejo();
    cambiar(filtro('sala'), 'Sala 1');
    cambiar(filtro('tanque'), '1');
    const t = plano(root);
    expect(t).toContain('Un tratamiento no puede separarse por tanque');
    expect(t).toContain('se registra por sala y área');
  });

  it('🔑 el filtro de LOTE no llega a los movimientos, y se dice con SU motivo, no con el de Tanques', async () => {
    await montar(PLANTA_F5);
    abrirManejo();
    cambiar(filtro('lote'), 'QA');
    const t = plano(root);
    expect(t).toContain('Un movimiento no puede separarse por lote');
    expect(t).toContain('La hoja de Movimientos no registra el lote');
    expect(t).not.toContain('Una fila de Tanques dice su sala');
  });

  it('sin movimientos ni raciones, cada bloque lo DICE en vez de quedarse en blanco', async () => {
    await montar(PLANTA);
    abrirManejo();
    const t = plano(root);
    expect(t).toContain('Ningún movimiento registrado en el período');
    expect(t).toContain('Ninguna ración registrada en el período');
  });

  it('lo que viene del Sheet sale ESCAPADO', async () => {
    const malo = '<img src=x onerror=alert(1)>';
    await montar([...PLANTA_F5,
      { ...MOV('19/09/2026', 'Sala 1', '1', 'Sala 2', '16', 1, 0), Motivo: malo, Observaciones: malo },
      TRATX('19/09/2026', 'Sala 1', 'Preventivo', malo, 'QA', malo)]);
    abrirManejo();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(malo);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   F6 (2026-09-21) · 📈 PISCINAS DE ORIGEN (en 🧬 Lotes) y 🩺 CALIDAD DEL DATO
   Lo que el usuario decidió y la pantalla tiene que DECIR: Broodstock vive DENTRO de Lotes, debajo de la
   comparativa, como tabla del último corte con su ficha; Calidad del dato es UNA sub-vista con sus cinco bloques
   en el orden aprobado, y el cruce con 🧬 Microchips marca sólo lo que no puede ser, con el libro de HOY.
   ══════════════════════════════════════════════════════════════════════════════ */
const BSV = (corte, piscina, extra) => ({ _SheetOrigin: O, 'Pl/g': '', 'Fecha de corte': corte, Piscina: piscina, ...extra });
/* Sobre la planta de F4: QE entra de la piscina 9701 y QF de la PZ99, que ninguna carga nombra. Broodstock: la 9701
   en los dos cortes (en el último con su sobrevivencia en FRACCIÓN), la 9702 sólo en el anterior y la 9703 sólo en
   el último, con una fase que no es del catálogo. */
const PLANTA_F6 = [
  ...PLANTA_F4,
  ING_P('05/09/2026', 'QE', 'Sala 3', 5, 6, 6, 'CE', '9701', 'CX'),
  ING_P('06/09/2026', 'QF', 'Sala 3', 6, 2, 2, 'CF', 'PZ99', 'CX'),
  BSV('12/09/2026', '9701', { 'Fase actual': 'Engorde', 'Peso actual (g)': '12', 'Código genético': 'CE', Camaronera: 'CX' }),
  BSV('12/09/2026', '9702', { 'Fase actual': 'Engorde', 'Peso actual (g)': '10' }),
  BSV('19/09/2026', '9701', { 'Fase actual': 'Pre-reproductor', 'Peso actual (g)': '15', 'Incremento última semana (g)': '3',
    'Sobrevivencia estimada (%)': '0.9', 'Código genético': 'CE', Camaronera: 'CX', 'Observación': 'Cosecha parcial' }),
  BSV('19/09/2026', '9703', { 'Fase actual': 'Maternidad', 'Peso actual (g)': '8' }),
];
const filaPiscina = (x) => root.querySelector(`[data-mop-piscina="${x}"]`);

describe('Maduración · operativo · 📈 Piscinas de origen (en 🧬 Lotes)', () => {
  it('va DEBAJO de la comparativa, con el último corte y una fila por piscina de ese corte', async () => {
    await montar(PLANTA_F6);
    abrirLotes();
    const h = [...root.querySelectorAll('.mc-card-h')].map((x) => x.textContent);
    const iComp = h.findIndex((t) => t.includes('📊 Comparativa'));
    const iBs = h.findIndex((t) => t.includes('📈 Piscinas de origen'));
    expect(iComp).toBeGreaterThan(-1);
    expect(iBs).toBeGreaterThan(iComp);
    expect(h[iBs]).toContain('último corte 19/09/2026');
    expect([...root.querySelectorAll('[data-mop-piscina]')].map((r) => r.dataset.mopPiscina)).toEqual(['9701', '9703']);
    expect(plano(filaPiscina('9701'))).toContain('QE');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('marca la sobrevivencia que no puede ser un porcentaje y la fase fuera del catálogo; lista las ausentes y las sin carga', async () => {
    await montar(PLANTA_F6);
    abrirLotes();
    const dif = filaPiscina('9701').querySelector('.mop-dif');
    expect(dif.textContent).toContain('⚠');
    expect(dif.getAttribute('title')).toContain('fracción');
    expect(plano(filaPiscina('9703'))).toContain('fuera del catálogo');
    const t = plano(root.querySelector('.mop-piscinas'));
    expect(t).toContain('No vinieron en el último corte');
    expect(t).toContain('9702');
    expect(t).toContain('PZ99');
  });

  it('pulsar una piscina abre su ficha con el peso por semana; volver a pulsarla la cierra; también con el teclado', async () => {
    await montar(PLANTA_F6);
    abrirLotes();
    expect(root.querySelector('#mopPiscinaCurva')).toBeNull();
    click(filaPiscina('9701'));
    expect(filaPiscina('9701').classList.contains('is-on')).toBe(true);
    expect(root.querySelector('#mopPiscinaCurva')).not.toBeNull();
    const llamada = makeChart.mock.calls.find((c) => c[0] === 'mopPiscinaCurva');
    expect(llamada[1].data.datasets[0].data).toEqual([12, 15]);
    const ficha = plano(root.querySelector('.mop-bs-ficha'));
    expect(ficha).toContain('Piscina 9701');
    expect(ficha).toContain('Cosecha parcial');
    expect(ficha).toContain('del lote ENTERO');
    click(filaPiscina('9701'));
    expect(root.querySelector('.mop-bs-ficha')).toBeNull();
    filaPiscina('9701').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(root.querySelector('.mop-bs-ficha')).not.toBeNull();
  });

  it('la ficha no sobrevive a su fila; la sala no le aplica, se DICE, y «Limpiar» la cierra', async () => {
    await montar(PLANTA_F6);
    abrirLotes();
    click(filaPiscina('9701'));
    cambiar(filtro('lote'), 'QB');   // QB no entró de ninguna piscina: la tabla se vacía y la ficha con ella
    expect(root.querySelector('.mop-bs-ficha')).toBeNull();
    cambiar(filtro('lote'), '');
    expect(root.querySelector('.mop-bs-ficha')).toBeNull();   // y no vuelve sola
    click(filaPiscina('9701'));
    cambiar(filtro('sala'), 'Sala 1');
    expect(root.querySelector('.mop-bs-ficha')).not.toBeNull();
    expect(plano(root.querySelector('.mop-piscinas'))).toContain('Una piscina de Broodstock no puede separarse por sala');
    click(root.querySelector('[data-mop-limpiar]'));
    expect(root.querySelector('.mop-bs-ficha')).toBeNull();
  });

  it('sin ninguna carga de Broodstock, lo DICE', async () => {
    await montar(PLANTA_F4);
    abrirLotes();
    expect(plano(root.querySelector('.mop-piscinas'))).toContain('Todavía no hay ninguna carga de 📈 Broodstock');
  });

  it('lo que viene del Sheet sale ESCAPADO', async () => {
    const malo = '<img src=x onerror=alert(1)>';
    await montar([...PLANTA_F6, BSV('19/09/2026', 'PZ1', { 'Fase actual': malo, 'Observación': malo, Camaronera: malo })]);
    abrirLotes();
    click(filaPiscina('PZ1'));
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(malo);
  });
});

/* 🩺 · el registro reproductivo de las pruebas: tres hembras de QA con chip en su tanque (S1·1), una de QB donde el
   libro no tiene a QB (S4·2), dos de un lote que el operativo no conoce, y un desove de la primera en la Sala 3. */
const MTZ = (n, lote, sala, tanque, estado = 'Vivo') => ({ _SheetOrigin: 'Maduración MATRIZ', 'Trovan ID': 'FAKE' + String(n).padStart(6, '0'),
  'Código genético': 'CA', Lote: lote, Piscina: 'PZ1', 'Sala actual': sala, 'Tanque actual': tanque, Estado: estado, 'Fecha ingreso': '01/08/2026' });
const BIT = (n, fecha, tipo, sala, tanque) => ({ _SheetOrigin: 'Maduración Bitácora', 'Trovan ID': 'FAKE' + String(n).padStart(6, '0'),
  Fecha: fecha, Tipo: tipo, Sala: sala, Tanque: tanque });
const REPRO = [
  MTZ(1, 'QA', 'Sala 1', 'Tanque 1'), MTZ(2, 'QA', 'Sala 1', 'Tanque 1'), MTZ(3, 'QA', 'Sala 1', 'Tanque 1'),
  MTZ(4, 'QB', 'Sala 4', 'Tanque 2'), MTZ(5, 'QX', 'Sala 5', 'Tanque 1'), MTZ(6, 'QX', 'Sala 5', 'Tanque 1'),
  BIT(1, '15/09/2026', 'Desove', 'Sala 3', 'Tanque 3'),
];
/* La Sala 4 dice «Producción» el 19/09 y el libro la propone en cuarentena (QB entró el 12/09). */
const PLANTA_F6C = [...PLANTA_F4, SALA('19/09/2026', 'Sala 4', { Estado: 'Producción' }), ...REPRO];
const abrirCalidad = () => click(root.querySelector('[data-mop-sub="calidad"]'));
const filaDe = (sel, texto) => [...root.querySelectorAll(sel + ' tbody tr')].find((tr) => tr.cells[0].textContent.includes(texto));
const celdaDelDia = (tabla, fila, dia) => {
  const dias = [...root.querySelectorAll(tabla + ' thead th')].map((th) => th.textContent);
  return filaDe(tabla, fila).cells[dias.indexOf(dia)];
};

describe('Maduración · operativo · 🩺 Calidad del dato', () => {
  it('abre con sus cinco bloques, en el orden aprobado', async () => {
    await montar(PLANTA_F6C);
    abrirCalidad();
    const h = [...root.querySelectorAll('.mc-card-h')].map((x) => x.textContent);
    expect(h).toHaveLength(5);
    expect(h[0]).toContain('📋 Las hojas y su calendario');
    expect(h[1]).toContain('📝 Partes esperados frente a registrados');
    expect(h[2]).toContain('🏠 Estado registrado frente al propuesto');
    expect(h[3]).toContain('📒 Avisos del libro');
    expect(h[4]).toContain('🔗 El cruce con 🧬 Microchips');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔑 las hojas cuentan las filas SIN FECHA; el calendario marca los huecos desde que la hoja empezó, y hoy va «en curso»', async () => {
    await montar([...PLANTA_F6C, DES('31/02/2026', 'QA', 1, 1000)]);
    abrirCalidad();
    expect(plano(filaDe('.mop-hojas', 'Desoves').cells[4])).toBe('1');
    // Tanques empezó el 16/09 y no tiene nada el 17 ni el 18: dos huecos. El 15 no lo es, y va vacío, nunca un cero.
    expect(celdaDelDia('.mop-cal-hojas', 'Tanques', '17/09').classList.contains('is-hueco')).toBe(true);
    expect(celdaDelDia('.mop-cal-hojas', 'Tanques', '16/09').classList.contains('is-reg')).toBe(true);
    expect(celdaDelDia('.mop-cal-hojas', 'Tanques', '15/09').className).toBe('');
    expect(celdaDelDia('.mop-cal-hojas', 'Tanques', '15/09').textContent).toBe('');
    expect(plano(filaDe('.mop-cal-hojas', 'Tanques').cells[0])).toContain('2 hueco(s)');
    const hoy = [...root.querySelectorAll('.mop-cal-hojas thead th')].find((th) => th.textContent === '19/09');
    expect(hoy.classList.contains('is-curso')).toBe(true);
  });

  it('🔑 los partes: un tanque ocupado sin parte se ve en su día, con la sala sin registro marcada; hoy no se cuenta', async () => {
    await montar(PLANTA_F6C);
    abrirCalidad();
    const s4 = celdaDelDia('.mop-cob-cal', 'Sala 4', '18/09');
    expect(plano(s4)).toBe('0/1');
    expect(s4.classList.contains('is-nada')).toBe(true);
    expect(s4.classList.contains('is-sin-sala')).toBe(true);
    expect(celdaDelDia('.mop-cob-cal', 'Sala 1', '19/09').classList.contains('is-curso')).toBe(true);
    expect(plano(root)).toContain('18/09/2026 · Sala 4 · t1');
  });

  it('una sala cuyo estado registrado difiere del propuesto se MARCA', async () => {
    await montar(PLANTA_F6C);
    abrirCalidad();
    const s4 = filaDe('.mop-estados', 'Sala 4');
    expect(s4.classList.contains('mop-difieren')).toBe(true);
    expect(plano(s4)).toContain('Difieren');
    expect(root.querySelectorAll('.mop-estados tbody tr')).toHaveLength(5);
  });

  /* Revisión en navegador de la tanda 0d (2026-09-25, usuario) · el «Estado por lote» PROPUESTO se calculaba desde el
     punto 3 de 0d (el de «🔄 Proponer estado» de Salas) y no se enseñaba en ninguna parte: va debajo del estado de cada
     lado, el registrado (lo tecleado en la hoja) y el propuesto por el libro. */
  it('🔴 debajo de cada estado va su «Estado por lote»: el registrado y el propuesto por el libro', async () => {
    const PLANTA = [...PLANTA_F4, SALA('19/09/2026', 'Sala 4', { Estado: 'Producción', 'Estado por lote': 'QB: Producción' }), ...REPRO];
    await montar(PLANTA);
    abrirCalidad();
    const s4 = filaDe('.mop-estados', 'Sala 4');
    expect(plano(s4.cells[1]), 'el registrado').toContain('QB: Producción');
    expect(plano(s4.cells[3]), 'el propuesto (QB entró el 12/09: en cuarentena)').toContain('QB: Cuarentena');
    const s1 = filaDe('.mop-estados', 'Sala 1');
    expect(plano(s1.cells[1]), 'sin «Estado por lote» registrado no se inventa nada').not.toMatch(/:/);
  });

  it('🔑 los avisos del libro: todos sus tipos aunque vayan a cero; con el código genético, no aplican', async () => {
    await montar(PLANTA_F6C);
    abrirCalidad();
    expect(root.querySelectorAll('.mop-av-tipos tbody tr')).toHaveLength(Object.keys(TIPOS_AVISO).length);
    cambiar(filtro('codigo'), 'CA');
    expect(plano(root)).toContain('Los avisos del libro no dicen el código genético');
    expect(root.querySelector('.mop-av-tipos')).toBeNull();
  });

  it('🔑 el cruce marca sólo lo que no puede ser: la de QB donde el libro no tiene a QB, y el desove fuera de su tanque (V6)', async () => {
    await montar(PLANTA_F6C);
    abrirCalidad();
    const d = [...root.querySelectorAll('.mop-cruce-disc tbody tr')];
    expect(d).toHaveLength(1);
    expect(plano(d[0])).toContain('QB');
    expect(plano(d[0])).toContain('donde el libro no tiene su lote');
    const ev = [...root.querySelectorAll('.mop-cruce-ev tbody tr')];
    expect(ev).toHaveLength(1);
    expect(plano(ev[0])).toContain('FAKE000001');
    expect(plano(ev[0])).toContain('Sala 3 · 3');
    expect(plano(ev[0])).toContain('Sala 1 · 1');
    const t = plano(root);
    expect(t).toContain('no todas llevan chip');
    expect(t).toContain('QX');
  });

  it('🔑 con la foto en otro día, el cruce usa el libro de HOY y lo DICE', async () => {
    await montar(PLANTA_F6C);
    abrirCalidad();
    cambiar(root.querySelector('[data-mop-fecha]'), '2026-09-10');
    const t = plano(root);
    expect(t).toContain('el cruce usa el libro de hoy');
    // El 10/09 el libro aún no conocía a QB; el de hoy sí: QB está en los dos registros, no «fuera».
    expect(filaDe('.mop-cruce-lotes', 'QB')).toBeTruthy();
  });

  it('sin registro reproductivo, lo DICE', async () => {
    await montar(PLANTA_F4);
    abrirCalidad();
    expect(plano(root)).toContain('no tiene ninguna hembra con chip');
  });

  /* En una prueba APARTE: montar dos veces sobre el mismo root deja puestos los manejadores del primer montaje, y
     el clic pintaría con los datos de aquél. */
  it('lo que viene del Sheet sale ESCAPADO', async () => {
    /* El lote de la MATRIZ se lee en su forma canónica (mayúsculas, sin espacios): el valor malo ya la tiene, o la
       prueba compararía otro texto y no probaría nada. */
    const malo = '<IMG/SRC=X/ONERROR=ALERT(1)>';
    await montar([...PLANTA_F6C, MTZ(9, malo, 'Sala 5', 'Tanque 1')]);
    abrirCalidad();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(malo);
  });
});

/* ── 🖨 REPORTES (F7.1, 2026-09-22) ─────────────────────────────
   Las CIFRAS del parte las prueban operativo.reportes.test.js y su banco; aquí se exige que llegue a la pantalla,
   que la vista previa sea el documento que se imprime, que el día mueva la foto (decisión del usuario) y que los
   dos botones exporten EXACTAMENTE lo que se está viendo. */
const abrirReportes = () => click(root.querySelector('[data-mop-sub="reportes"]'));
/* El ÚLTIMO aviso: los toasts viven en document.body, que NO se limpia entre pruebas (sólo se quita `root`).
   Mirando el primero se leería el de la prueba anterior y ésta pasaría —o fallaría— por otra cosa. */
const ultimoToast = () => [...document.querySelectorAll('.app-toast')].pop().textContent;

describe('Maduración · operativo · 🖨 Reportes', () => {
  it('la pastilla abre el panel: el día es la FOTO, con sus acciones y la vista previa del documento', async () => {
    await montar(PLANTA);
    abrirReportes();
    expect([...root.querySelectorAll('[data-mop-rep]')].map((b) => b.textContent.trim()))
      .toEqual(['📄 Parte diario', '🗓 Semanal por lote', '🏁 Cierre de lote', '📈 Broodstock']);
    const dia = root.querySelector('.mop-rep-dia [data-mop-fecha]');
    expect([dia.value, dia.getAttribute('max')]).toEqual(['2026-09-19', '2026-09-19']);
    expect(plano(root.querySelector('.mop-rep-dia'))).toContain('es la foto del tablero');
    expect(root.querySelector('[data-mop-rep-pdf]')).toBeTruthy();
    expect(root.querySelector('[data-mop-rep-xlsx]')).toBeTruthy();
    const doc = root.querySelector('.mop-rep-prev').getAttribute('srcdoc');
    expect(doc).toContain('Maduración · Parte diario');
    expect(doc).toContain('sábado, 19/09/2026');
    expect(doc).toContain('@page { size: A4 portrait');
    expect(doc).toContain('día en curso');            // la foto es HOY: el registro del día no está cerrado
    /* 🔑 La vista tiene que pasarle la serie desde la VÍSPERA: la mortalidad del día es la resta de dos cierres.
       Con la serie empezando en el propio día no habría cifra y el parte diría «sin serie» sin que nadie lo note. */
    expect(doc).toContain('Mortalidad del día');
    expect(doc).not.toContain('sin serie');
  });

  it('🔑 el día del parte MUEVE la foto del tablero (decisión del usuario: papel y pantalla, el mismo día)', async () => {
    await montar(PLANTA);
    abrirReportes();
    cambiar(root.querySelector('.mop-rep-dia [data-mop-fecha]'), '2026-09-18');
    expect(root.querySelector('.mop-rep-prev').getAttribute('srcdoc')).toContain('viernes, 18/09/2026');
    click(root.querySelector('[data-mop-sub="estado"]'));
    expect(root.querySelector('.mc-sub').textContent).toContain('18/09/2026');
  });

  it('🔑 lo que se exporta es lo que se VE: con filtro, el parte sale marcado como FILTRADO', async () => {
    await montar(PLANTA);
    cambiar(filtro('sala'), 'Sala 2');
    abrirReportes();
    const doc = root.querySelector('.mop-rep-prev').getAttribute('srcdoc');
    expect(doc).toContain('PARTE FILTRADO — Sala 2');
    expect(plano(root.querySelector('.mop-rep-alcance'))).toContain('PARTE FILTRADO — Sala 2');
    click(root.querySelector('[data-mop-rep-pdf]'));
    const { printFichaDocs } = await import('../supervisor/fichaPdf.js');
    expect(printFichaDocs).toHaveBeenCalledTimes(1);
    const [docs] = printFichaDocs.mock.calls[0];
    expect(docs).toHaveLength(1);
    expect(docs[0].fileName).toBe('Parte_diario_2026-09-19_filtrado');
    expect(docs[0].page).toContain('PARTE FILTRADO — Sala 2');
    expect(docs[0].page).toContain('Generado el');      // el sello se pone al EXPORTAR, no al pintar
  });

  it('el Excel baja una hoja por bloque, con el nombre del parte', async () => {
    await montar(PLANTA);
    abrirReportes();
    const hojas = [];
    window.XLSX = {
      utils: { book_new: () => ({}), aoa_to_sheet: (aoa) => aoa, book_append_sheet: (wb, ws, nombre) => hojas.push(nombre) },
      writeFile: vi.fn(),
    };
    click(root.querySelector('[data-mop-rep-xlsx]'));
    expect(hojas).toEqual(['Resumen', 'Bajas', 'Reproducción', 'Movimientos', 'Tratamientos', 'Registro', 'Avisos']);
    expect(window.XLSX.writeFile.mock.calls[0][1]).toBe('Parte_diario_2026-09-19.xlsx');
    expect(ultimoToast()).toContain('7 hojas');
    delete window.XLSX;
  });

  it('🔑 sin SheetJS no rompe: lo dice y no descarga nada', async () => {
    await montar(PLANTA);
    abrirReportes();
    delete window.XLSX;
    click(root.querySelector('[data-mop-rep-xlsx]'));
    expect(ultimoToast()).toContain('SheetJS');
    expect(errSpy).not.toHaveBeenCalled();
  });

  /* F7.2 · los otros dos reportes desde la misma barra. */
  it('🗓 el semanal enseña UNA PÁGINA POR LOTE y su rango de siete días', async () => {
    await montar(PLANTA);
    abrirReportes();
    click(root.querySelector('[data-mop-rep="semanal"]'));
    const doc = root.querySelector('.mop-rep-prev').getAttribute('srcdoc');
    expect(doc).toContain('Maduración · Semanal por lote');
    expect(doc).toContain('13/09 – 19/09/2026');
    /* 🔑 Y la CURVA empieza el 13, no la víspera de la foto: la vista tiene que armar el semanal con la serie de
       la SEMANA. Mirando sólo la cabecera, una serie de un día pasaba desapercibida (lo cazó la mutación V102). */
    expect(doc).toContain('rp-pie-b">13/09 <b>');
    expect(doc.match(/class="rp-page"/g).length).toBeGreaterThan(1);   // QA, QB, QC y QD están vivos
    expect(doc).toContain('Página 1 de');
    expect(root.querySelector('[data-mop-rep-lote]')).toBeNull();      // el semanal no pide lote
  });

  it('🏁 el cierre pide el LOTE y lo cambia sin tocar el filtro del tablero', async () => {
    await montar(PLANTA);
    abrirReportes();
    click(root.querySelector('[data-mop-rep="cierre"]'));
    const sel = root.querySelector('[data-mop-rep-lote]');
    expect([...sel.options].map((o) => o.value)).toEqual(['QA', 'QB', 'QC', 'QD']);
    expect(root.querySelector('.mop-rep-prev').getAttribute('srcdoc')).toContain('Lote QA');
    cambiar(sel, 'QB');
    expect(root.querySelector('.mop-rep-prev').getAttribute('srcdoc')).toContain('Lote QB');
    expect(elegido('lote')).toBe('');                                  // el filtro del tablero no se ha movido
  });

  it('🔑 el cierre de un lote ABIERTO lo dice, y su curva empieza en el ingreso, no en la víspera de la foto', async () => {
    await montar(PLANTA);
    abrirReportes();
    click(root.querySelector('[data-mop-rep="cierre"]'));
    const doc = root.querySelector('.mop-rep-prev').getAttribute('srcdoc');
    expect(doc).toContain('EN CURSO — el lote sigue abierto');
    expect(doc).toContain('⚖ Cascada del cuadre');
    /* 🔑 El ciclo empieza en el ÚLTIMO ingreso del lote, no en el primero: QA entró el 01/08 en la Sala 1 y el
       11/09 en la Sala 2, y el libro reinicia el reloj del lote con cada ingreso nuevo (mad-libro: al llegar un
       ingreso posterior se rehace `ingreso` y se borra `cerrado`). El cierre usa esa misma definición, que es la
       del período «Ciclo» del tablero: dos definiciones distintas de la vida de un lote es lo que hay que evitar. */
    expect(doc).toContain('11/09/2026 → 19/09/2026');
    /* 🔑 Y la CURVA arranca ahí, no en la víspera de la foto: la serie del cierre tiene que llegar al ingreso.
       La cabecera sale del libro y no lo distinguía (lo cazó la mutación V100). */
    expect(doc).toContain('rp-pie-b">11/09 <b>');
  });

  it('🔑 todas las clases propias que pinta el panel están DEFINIDAS en su CSS', async () => {
    /* La auditoría del 22-09 encontró el selector de lote con `mop-f-sel`, una clase que no existe en ninguna
       hoja: se pintaba sin estilo y ninguna prueba lo veía. Esto vigila la FAMILIA, no ese caso. */
    const { readFileSync } = await import('node:fs');
    /* Las rutas van desde la raíz del repo: vitest corre con ella de cwd, y bajo Vite `import.meta.url` no es file://. */
    const css = readFileSync('src/views/maduracion/operativo.css', 'utf8') + readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    await montar(PLANTA);
    abrirReportes();
    click(root.querySelector('[data-mop-rep="cierre"]'));        // así aparece también el selector de lote
    const usadas = new Set();
    root.querySelectorAll('[class]').forEach((el) => el.classList.forEach((c) => { if (c.startsWith('mop-')) usadas.add(c); }));
    expect(usadas.size).toBeGreaterThan(4);
    expect([...usadas].filter((c) => !new RegExp('\\.' + c + '(?![\\w-])').test(css))).toEqual([]);
    expect(root.querySelector('[data-mop-rep-lote]').className).toBe('mc-select');   // igual que los otros filtros
  });

  /* F7.3 · el Broodstock, que lee el PERÍODO del tablero (los otros tres no). */
  it('📈 el Broodstock: resumen + una página por piscina, y su serie sigue al período del tablero', async () => {
    await montar(PLANTA_F6);
    abrirReportes();
    click(root.querySelector('[data-mop-rep="broodstock"]'));
    const doc = root.querySelector('.mop-rep-prev').getAttribute('srcdoc');
    expect(doc).toContain('Maduración · Broodstock');
    expect(doc).toContain('último corte');
    expect(doc.match(/class="rp-page"/g).length).toBeGreaterThan(1);   // resumen + al menos una piscina
    expect(doc).toContain('📈 Las piscinas en el corte del');
    expect(doc).toContain('⚠ Avisos del Broodstock');
    /* 🔑 Con «Hoy» la serie se estrecha: el reporte sigue al período de arriba, no lleva uno propio. */
    click(root.querySelector('[data-mop-periodo="hoy"]'));
    click(root.querySelector('[data-mop-sub="reportes"]'));
    const corto = root.querySelector('.mop-rep-prev').getAttribute('srcdoc');
    expect(corto).toContain('serie 19/09 – 19/09/2026');
  });

  it('🔑 lo que se descarga es el reporte ELEGIDO, no siempre el diario', async () => {
    await montar(PLANTA);
    abrirReportes();
    click(root.querySelector('[data-mop-rep="cierre"]'));
    const hojas = [];
    window.XLSX = {
      utils: { book_new: () => ({}), aoa_to_sheet: (aoa) => aoa, book_append_sheet: (wb, ws, nombre) => hojas.push(nombre) },
      writeFile: vi.fn(),
    };
    click(root.querySelector('[data-mop-rep-xlsx]'));
    expect(hojas).toEqual(['Resumen', 'Cascada', 'Origen', 'Curva', 'Eventos', 'Reproducción']);
    expect(window.XLSX.writeFile.mock.calls[0][1]).toBe('Cierre_lote_QA_2026-09-19.xlsx');
    expect(ultimoToast()).toContain('cierre de lote');
    delete window.XLSX;
  });
});

/* 0f · 2b (2026-09-25) · 📉 Tendencias y ⏳ Permanencia DENTRO de la tarjeta de Alertas. Las cifras las prueba
   operativo.tendencias.test.js (con su banco); aquí, que llegan a la pantalla, que el total de la tarjeta las cuenta,
   que lo que viene del Sheet sale escapado y que «✓ Sin alertas» sigue saliendo cuando no hay nada. Una planta
   pequeña, con fechas como las del export: TA produce desde su cópula del 20/07 (61 días al 19/09) y, con «7 d», su
   sala produce menos, muere más por tanque y día, y sus huevos por desove caen. */
describe('Maduración · operativo · 0f · 2b · 📉 Tendencias y ⏳ Permanencia en la tarjeta de Alertas', () => {
  const dmy = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const ingT = (fecha, lote, sala, tanque, machos, hembras, cg, piscina) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: dmy(fecha),
    Lote: lote, 'Código genético': cg, 'Piscina Broodstock': piscina, Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
  const tqT = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: dmy(fecha), Sala: sala, Tanque: tanque, ...extra });
  const desT = (fecha, lote, desoves, huevos, n2, n5) => ({ _SheetOrigin: O, Fecha: dmy(fecha), Lote: lote, 'Código genético': 'CA',
    Desoves: desoves, 'Total de huevos': huevos, N2: n2, N5: n5 });
  const PLANTA_T = (lote = 'TA') => [
    ingT('2026-07-16', lote, 'Sala 1', 1, 10, 20, 'CA', 'P1'),
    ingT('2026-07-16', lote, 'Sala 1', 2, 10, 20, 'CA', 'P1'),
    ingT('2026-09-10', 'TC', 'Sala 4', 1, 20, 8, 'CA', 'P3'),
    tqT('2026-07-20', 'Sala 1', 1, { 'Cópulas': 1 }),
    ...['2026-09-10', '2026-09-11', '2026-09-12'].flatMap((f) => [1, 2].map((t) => tqT(f, 'Sala 1', t, { 'Machos muertos': 1, 'Cópulas': 3 }))),
    tqT('2026-09-13', 'Sala 1', 1, { 'Machos muertos': 2, 'Cópulas': 3 }),
    tqT('2026-09-14', 'Sala 1', 1, { 'Machos muertos': 2, 'Cópulas': 3 }),
    tqT('2026-09-13', 'Sala 1', 2, { 'Machos muertos': 2, 'Cópulas': 3 }),
    ...['2026-09-07', '2026-09-09', '2026-09-11'].map((f) => desT(f, lote, 2, 200000, 160000, 300000)),
    desT('2026-09-14', lote, 2, 140000, 126000, 200000),
    desT('2026-09-17', lote, 2, 140000, 126000, ''),
  ];
  const tarjeta = () => root.querySelector('.mop-alertas');
  const cabecera = () => tarjeta().querySelector('.mc-h-note').textContent;

  it('con «7 d»: los dos bloques, sus líneas, y el total de la tarjeta los cuenta', async () => {
    await montar(PLANTA_T());
    click(root.querySelector('[data-mop-periodo="7d"]'));
    const t = tarjeta();
    const tend = [...t.querySelectorAll('.mop-tendencias li')].map((li) => li.textContent);
    expect(t.textContent).toContain('📉 Tendencias');
    expect(t.textContent).toContain('7 d frente a los 7 días anteriores (06/09 – 12/09)');
    expect(tend).toEqual([
      '🦐 N5 por desove: 150.000 → 100.000 (−33 %) · bajan TA (−33 %).',
      '🥚 Sala 1 produce menos: 6 → 4 desoves (−33 %).',
      '💀 Más mortalidad en Sala 1: 1 → 2 bajas por tanque y día (+100 %).',
      '🧬 TA: huevos por desove 100.000 → 70.000 (−30 %).',
    ]);
    const perm = [...t.querySelectorAll('.mop-permanencia li')].map((li) => li.textContent);
    expect(perm).toEqual(['⏳ TA lleva 61 días en producción en Sala 1 · piscina P1 · código CA.']);
    expect(t.textContent).toContain('más de 60 días en producción');
    expect(cabecera()).toBe('7 d · 5');
    expect(t.querySelector('.mop-ok')).toBeNull();
    expect(t.querySelector('.mc-note').textContent).toContain('con un cambio del 20 % o más y al menos 3 registros');
    expect(t.querySelector('.mc-note').getAttribute('title')).toContain('Usuario: decisión del 2026-09-25');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('si el N5 del conjunto NO baja pero el de un lote sí, la línea dice ese lote con sus cifras', async () => {
    /* TF (sin ingreso) sube de 100 000 a 300 000 por desove: el conjunto pasa de 133.333 a 200.000 (+50 %). */
    const TF = [...['2026-09-06', '2026-09-08', '2026-09-10'].map((f) => desT(f, 'TF', 1, 100000, 80000, 100000)),
      ...['2026-09-15', '2026-09-16'].map((f) => desT(f, 'TF', 1, 100000, 80000, 300000))];
    await montar([...PLANTA_T(), ...TF]);
    click(root.querySelector('[data-mop-periodo="7d"]'));
    const n5 = [...tarjeta().querySelectorAll('.mop-tendencias li')].find((li) => li.textContent.includes('N5'));
    expect(n5.textContent).toBe('🦐 N5 por desove: baja en TA 150.000 → 100.000 (−33 %).');
  });

  it('con «30 d» el anterior no tiene datos: no hay Tendencias, pero la Permanencia sigue; la nota dice con qué compara', async () => {
    await montar(PLANTA_T());
    const t = tarjeta();
    expect(t.querySelector('.mop-tendencias')).toBeNull();
    expect(t.querySelectorAll('.mop-permanencia li')).toHaveLength(1);
    expect(cabecera()).toBe('30 d · 1');
    expect(t.querySelector('.mc-note').textContent).toContain('frente a los 30 días anteriores (22/07 – 20/08)');
  });

  it('con un lote sin nada que avisar (TC, en cuarentena), «✓ Sin alertas en el período»', async () => {
    await montar(PLANTA_T());
    click(root.querySelector('[data-mop-periodo="7d"]'));
    cambiar(filtro('lote'), 'TC');
    const t = tarjeta();
    expect(t.querySelector('.mop-tendencias')).toBeNull();
    expect(t.querySelector('.mop-permanencia')).toBeNull();
    expect(t.querySelector('.mop-ok').textContent).toBe('✓ Sin alertas en el período.');
    expect(cabecera()).toBe('7 d · 0');
  });

  it('lo que viene del Sheet sale ESCAPADO: un lote con marcado es texto, no HTML', async () => {
    await montar(PLANTA_T('<img src=x onerror=alert(1)>'));
    click(root.querySelector('[data-mop-periodo="7d"]'));
    const t = tarjeta();
    expect(t.querySelector('img')).toBeNull();
    expect(t.querySelector('.mop-permanencia li').textContent).toContain('<img src=x onerror=alert(1)> lleva 61 días');
    expect(t.querySelector('.mop-tendencias').textContent).toContain('<img src=x onerror=alert(1)>: huevos por desove');
  });
});

/* 0f · 3 (2026-09-25) · el mapa de planta: once colores en tres grupos y el LIENZO del tanque pulsado. Las cifras las
   prueba operativo.mapa.test.js (con su banco); aquí, que llegan a la pantalla, que el lienzo se abre y se cierra SIN
   repintar, que «🛢 Abrir en Tanques» lleva a la ficha y que lo del Sheet sale escapado. La misma planta pequeña que
   la prueba pura, con fechas como las del export. */
describe('Maduración · operativo · 0f · 3 · el mapa de planta: colores y lienzo', () => {
  const dmy = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const ingM = (fecha, lote, sala, tanque, machos, hembras, cg) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: dmy(fecha),
    Lote: lote, 'Código genético': cg, 'Piscina Broodstock': 'P1', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
  const tqM = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: dmy(fecha), Sala: sala, Tanque: tanque, ...extra });
  const PLANTA_M = (lote = 'MA') => [
    ingM('2026-07-01', lote, 'Sala 1', 1, 10, 20, 'CA'),
    ingM('2026-08-20', 'MB', 'Sala 1', 2, 10, 10, 'CB'),
    ingM('2026-09-12', 'MD', 'Sala 4', 2, 4, 4, 'CA'),
    ingM('2026-07-01', 'ME', 'Sala 4', 2, 2, 2, 'CB'),
    ...['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'].map((f) => tqM(f, 'Sala 1', 1, { 'Machos muertos': 1, 'Cópulas': 4 })),
    tqM('2026-09-14', 'Sala 1', 2, { 'Machos muertos': 2, 'Cópulas': 3 }),
    tqM('2026-09-15', 'Sala 1', 2, { 'Machos muertos': 2, 'Cópulas': 3 }),
    tqM('2026-09-19', 'Sala 4', 2, {}),
  ];
  const lienzo = () => root.querySelector('.mop-tq-info .mop-lienzo');
  const texto = (el) => el.textContent.replace(/\s+/g, ' ');

  it('once colores en tres grupos; los nuevos pintan el tanque, su globo y su leyenda', async () => {
    await montar(PLANTA_M());
    expect([...root.querySelectorAll('.mop-colores-g')].map((g) => g.querySelector('.mop-nota').textContent)).toEqual(['Del lote', 'Del tanque', 'De los partes']);
    expect(root.querySelectorAll('[data-mop-color]')).toHaveLength(11);
    click(root.querySelector('[data-mop-color="lote"]'));
    expect(tq('Sala 1', 1).classList.contains('is-cat')).toBe(true);
    expect(tq('Sala 1', 1).getAttribute('style')).toMatch(/^--mop-c:#/);
    expect(tq('Sala 4', 2).classList.contains('is-varios')).toBe(true);
    expect(texto(root.querySelector('.mop-mapa-card .mc-legend'))).toContain('Varios lotes 1');
    click(root.querySelector('[data-mop-color="mortalidad"]'));
    expect(tq('Sala 1', 2).getAttribute('style')).toBe('--mop-i:100%');
    expect(tq('Sala 1', 2).getAttribute('title')).toContain('· 2 bajas por día de parte');
    click(root.querySelector('[data-mop-color="parte"]'));
    expect(tq('Sala 4', 2).classList.contains('is-p-hoy')).toBe(true);
    expect(tq('Sala 1', 2).classList.contains('is-p-semana')).toBe(true);
    click(root.querySelector('[data-mop-color="dias"]'));
    expect(tq('Sala 1', 1).classList.contains('is-pr60')).toBe(true);
    expect(root.querySelector('[data-mop-color="dias"]').getAttribute('aria-pressed')).toBe('true');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('pulsar un tanque abre su LIENZO bajo el mapa sin repintar; ✕ lo cierra', async () => {
    await montar(PLANTA_M());
    const b = tq('Sala 1', 1);
    click(b);
    expect(b.isConnected).toBe(true);
    const l = lienzo();
    expect(texto(l)).toContain('Sala 1 · tanque 1');
    expect(texto(l)).toContain('MA · CA · Producción 65 d');
    expect(texto(l)).toContain('H:M 5');
    expect(texto(l)).toContain('6 bajas · 0 descartes · 24 cópulas (20 %) · 6 día(s) con parte · último parte 18/09/2026');
    expect(l.querySelector('svg.mop-curva polyline')).not.toBeNull();
    expect(l.querySelector('[data-mop-filtrar-tq="Sala 1|1"]')).not.toBeNull();
    expect(l.querySelector('[data-mop-abrir-tq="Sala 1|1"]')).not.toBeNull();
    click(l.querySelector('[data-mop-tq-cerrar]'));
    expect(lienzo()).toBeNull();
    expect(root.querySelector('.mop-tq.is-sel')).toBeNull();
    expect(root.querySelector('.mop-tq-info').textContent).toContain('Pulsa un tanque');
    expect(b.isConnected).toBe(true);
  });

  it('«🛢 Abrir en Tanques» lleva a la ficha completa de ese tanque', async () => {
    await montar(PLANTA_M());
    click(tq('Sala 1', 2));
    click(lienzo().querySelector('[data-mop-abrir-tq]'));
    expect(root.querySelector('[data-mop-sub="tanques"]').classList.contains('is-on')).toBe(true);
    expect(texto(root.querySelector('.mop-ficha .mc-card-h'))).toContain('🛢 Sala 1 · Tanque 2');
  });

  it('un tanque vacío: el lienzo lo dice y no ofrece abrirlo', async () => {
    await montar(PLANTA_M());
    click(tq('Sala 1', 3));
    expect(texto(lienzo())).toContain('Vacío al cierre del 19/09/2026');
    expect(lienzo().querySelector('[data-mop-abrir-tq]')).toBeNull();
    expect(lienzo().querySelector('svg')).toBeNull();
  });

  it('lo que viene del Sheet sale ESCAPADO en el lienzo, el globo y la leyenda', async () => {
    await montar(PLANTA_M('<img src=x onerror=alert(1)>'));
    click(root.querySelector('[data-mop-color="lote"]'));
    click(tq('Sala 1', 1));
    const card = root.querySelector('.mop-mapa-card');
    expect(card.querySelector('img')).toBeNull();
    expect(texto(lienzo())).toContain('<img src=x onerror=alert(1)> · CA');
    expect(texto(card.querySelector('.mc-legend'))).toContain('<img src=x onerror=alert(1)> 1');
  });

  it('los datos IMPOSIBLES de los partes se DICEN (decisión del usuario, 2026-09-25): más cópulas que hembras y cópulas sin hembras', async () => {
    // MB (10 ♀) suma 40 cópulas más el 16/09 → 46 ÷ 30 hembras-día > 100 %; el tanque 3 de la Sala 1 está VACÍO y tiene un parte con 2.
    await montar([...PLANTA_M(), tqM('2026-09-16', 'Sala 1', 2, { 'Cópulas': 40 }), tqM('2026-09-17', 'Sala 1', 3, { 'Cópulas': 2 })]);
    click(root.querySelector('[data-mop-color="copulas"]'));
    expect(tq('Sala 1', 2).classList.contains('is-imposible')).toBe(true);
    expect(tq('Sala 1', 2).getAttribute('title')).toContain('⚠ más cópulas que hembras');
    expect(texto(root.querySelector('.mop-mapa-card .mc-legend'))).toContain('Más cópulas que hembras 1');
    click(tq('Sala 1', 2));
    expect(texto(lienzo())).toMatch(/46 cópulas \([\d,]+ % ⚠ más cópulas que hembras\)/);
    click(tq('Sala 1', 3));
    expect(texto(lienzo())).toContain('Vacío al cierre');
    expect(texto(lienzo())).toContain('· ⚠ 2 cópulas en días sin hembras en el libro');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔑 CONTRASTE (decisión del usuario, 2026-09-25): en tema claro ningún tanque lleva el número BLANCO salvo la paleta oscura, y las escalas van TOPADAS', async () => {
    /* Medido en Chrome: con el número blanco, 20 de los 26 tanques ocupados de «Estado» quedaban bajo 3:1. La regla vive
       en operativo.css (`--mop-num` y los topes); esto vigila que nadie la deshaga al añadir un color. El contraste real
       lo mide la revisión en Chrome (`validar-p3.mjs`). */
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/operativo.css', 'utf8');
    const reglas = [...css.matchAll(/([^{}]*\.mop-tq[^{}]*)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim().split('\n').pop().trim(), dec: m[2] }));
    expect(reglas.length).toBeGreaterThan(20);   // miró de verdad
    const blancas = reglas.filter((r) => /color:\s*#fff\b/.test(r.dec) && !/data-theme="dark"/.test(r.sel)).map((r) => r.sel);
    expect(blancas).toEqual(['.mop-tq.is-cat.is-tx-cla']);
    const escalas = reglas.filter((r) => /var\(--mop-i\b/.test(r.dec) && /color:\s*var\(--mop-num\)/.test(r.dec));
    expect(escalas.length).toBeGreaterThanOrEqual(5);
    for (const r of escalas) expect(/min\(var\(--mop-i[^)]*\), var\(--mop-tope-|var\(--c-bueno\)/.test(r.dec), r.sel).toBe(true);
    expect(css).toMatch(/\.mop-mapa-card \{ --mop-num: var\(--c-text\);/);
    expect(css).toMatch(/\[data-theme="dark"\] \.mop-mapa-card \{ --mop-num: #fff;/);
  });
});

/* 0f · 5 (2026-09-25, usuario) · cada tarjeta de KPI se pulsa y su gráfico se abre DEBAJO de las tarjetas (Salas, como
   tabla). Las cifras de cada gráfico las ata operativo.kpis.test.js a las de su tarjeta; aquí, que lleguen a la pantalla:
   el lienzo correcto, su último punto igual a la tarjeta que se ve, y que se cierre, se abra con el teclado y siga
   abierto al cambiar un filtro. */
describe('Maduración · operativo · 0f · 5 · el gráfico de cada KPI', () => {
  const tarjeta = (clave) => root.querySelector(`[data-mop-kpi="${clave}"]`);
  const panel = () => root.querySelector('.mop-kpi-lienzo');
  const ultimoGrafico = () => { const l = makeChart.mock.calls.filter(([id]) => id === 'mopKpiCurva'); return l.length ? l[l.length - 1][1] : null; };
  const numero = (s) => Number(String(s).replace(/[^0-9]/g, ''));

  it('🔴 las siete tarjetas se pulsan, en su orden; ninguna abierta al llegar', async () => {
    await montar(PLANTA);
    expect([...root.querySelectorAll('.mc-kpis [data-mop-kpi]')].map((x) => x.dataset.mopKpi))
      .toEqual(['vivos', 'lotes', 'salas', 'ocupacion', 'mortalidad', 'reproduccion', 'biomasa']);
    expect(tarjeta('vivos').getAttribute('role')).toBe('button');
    expect(tarjeta('vivos').getAttribute('aria-pressed')).toBe('false');
    expect(panel()).toBeNull();
  });

  it('🔴 Vivos: su curva debajo de las tarjetas, y el total del último día ES la cifra de la tarjeta; volver a pulsar la cierra', async () => {
    await montar(PLANTA);
    click(tarjeta('vivos'));
    expect(tarjeta('vivos').classList.contains('is-on')).toBe(true);
    expect(tarjeta('vivos').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.mc-kpis').nextElementSibling, 'justo debajo de las tarjetas').toBe(panel());
    expect(panel().querySelector('#mopKpiCurva')).not.toBeNull();
    const cfg = ultimoGrafico();
    expect(cfg.data.datasets.map((d) => d.label)).toEqual(['♀ Hembras', '♂ Machos', 'Total']);
    expect(cfg.data.labels.at(-1)).toBe('19/09');
    expect(cfg.data.datasets[2].data.at(-1)).toBe(numero(kpi('Vivos')));
    click(tarjeta('vivos'));
    expect(panel()).toBeNull();
  });

  it('🔴 Lotes: las barras del último día suman los lotes de la tarjeta; se abre OTRA tarjeta y cambia el gráfico', async () => {
    await montar(PLANTA);
    click(tarjeta('vivos'));
    click(tarjeta('lotes'));
    expect(tarjeta('vivos').classList.contains('is-on')).toBe(false);
    const cfg = ultimoGrafico();
    expect(cfg.data.datasets.map((d) => d.label)).toEqual(['Cuarentena', 'Producción', 'Mixto', 'Sin estado']);
    expect(cfg.options.scales.y.stacked).toBe(true);
    expect(cfg.data.datasets.reduce((a, d) => a + d.data.at(-1), 0)).toBe(numero(kpi('Lotes')));
  });

  it('🔴 Salas: una TABLA registrado/propuesto, sin lienzo', async () => {
    await montar(PLANTA);
    click(tarjeta('salas'));
    expect(panel().querySelector('canvas')).toBeNull();
    const fila = [...panel().querySelectorAll('tbody tr')].find((tr) => tr.cells[0].textContent === 'Sala 2');
    expect(fila.cells[1].textContent).toBe('Mixto');
    expect(panel().querySelector('[data-situacion="sin-registro"]'), 'la Sala 3 no tiene registro').not.toBeNull();
  });

  it('🔑 el estado registrado viene del Sheet: sale ESCAPADO', async () => {
    await montar([...PLANTA, SALA('19/09/2026', 'Sala 3', { Estado: '<img src=x onerror=alert(1)>' })]);
    click(tarjeta('salas'));
    expect(panel().querySelector('img')).toBeNull();
    expect(panel().textContent).toContain('<img src=x');
  });

  it('🔴 sigue abierto al cambiar un filtro, y lo dice: con sala, la mortalidad son muertes REGISTRADAS; con código, los vivos no aplican', async () => {
    await montar(PLANTA);
    click(tarjeta('mortalidad'));
    expect(ultimoGrafico().data.datasets[0].label).toBe('Tasa del día (%)');
    cambiar(filtro('sala'), 'Sala 1');
    expect(tarjeta('mortalidad').classList.contains('is-on')).toBe(true);
    expect(ultimoGrafico().data.datasets[0].label).toBe('Muertes del día (registradas)');
    expect(panel().textContent).toContain('REGISTRADAS en la hoja Tanques');
    cambiar(filtro('sala'), '');
    click(tarjeta('vivos'));
    cambiar(filtro('codigo'), 'CA');
    expect(panel().querySelector('canvas')).toBeNull();
    expect(panel().textContent).toContain('no guarda los vivos día a día');
  });

  it('con el teclado también se abre (Intro), y ✕ lo cierra', async () => {
    await montar(PLANTA);
    tarjeta('reproduccion').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ultimoGrafico().data.datasets.map((d) => d.label)).toEqual(['Desoves', 'N5']);
    expect(ultimoGrafico().data.datasets.map((d) => d.yAxisID), 'N5 en su propio eje: son cientos de miles donde los desoves son unidades').toEqual(['y', 'y2']);
    expect(ultimoGrafico().data.datasets[1].tension, 'cifras de cada día: línea recta, sin inventar valores entre días').toBe(0);
    click(root.querySelector('[data-mop-kpi-cerrar]'));
    expect(panel()).toBeNull();
    expect(tarjeta('reproduccion').classList.contains('is-on')).toBe(false);
  });

  it('🔑 sus clases están DEFINIDAS en el CSS', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/operativo.css', 'utf8');
    for (const sel of ['.mc-kpi.is-clic', '.mc-kpi.is-on', '.mop-kpi-lienzo']) expect(css.includes(sel + ' '), sel).toBe(true);
  });
});

/* 0f · 8 (2026-09-26, usuario) · dos botones junto a la sub-nav abren, como modal y desde cualquier sub-vista, lo que el
   laboratorio mide de Maduración. Las CUENTAS las vigila operativo.laboratorio.test.js; aquí, que lleguen: los tres
   bloques, Biomol cargado al abrirlo, ✕ / velo / Escape, los filtros del tablero, el enlace y el escapado. */
describe('Maduración · operativo · 0f · 8 · 🦠 / 🧬 lo del laboratorio', () => {
  const MIC = (fecha, formato, extra = {}) => ({ _SheetOrigin: 'Microbiología', 'Fecha muestreo': fecha, Departamento: 'Maduración', Formato: formato, ...extra });
  const LAB = [
    MIC('15/09/2026', 'Maduración · Principal', { 'Tipo de muestra': 'Hepatopáncreas', 'Módulo/Sala': 'Sala 1', 'TQ/N°': '1', Sexo: 'Hembras', 'V.Totales UFC': '20000' }),
    MIC('16/09/2026', 'Maduración · Principal', { 'Tipo de muestra': 'Hepatopáncreas', 'Módulo/Sala': 'Sala 2', 'TQ/N°': '16', Sexo: 'Machos', 'V.Totales UFC': '500' }),
    MIC('14/09/2026', 'Maduración · Principal', { 'Tipo de muestra': 'Hepatopáncreas', 'TQ/N°': 'Piscina 556', Sexo: 'Hembras', 'V.Totales UFC': '500' }),
    MIC('16/09/2026', 'Maduración · Despacho', { 'Tipo de muestra': 'Huevo antes desinfección', 'V.Totales UFC': '600' }),
    MIC('17/09/2026', 'Maduración · RAS', { Componente: '<img src=x onerror=alert(1)>', 'V.Totales Nivel': 'Elevado' }),
    { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '17/09/2026', Departamento: 'Maduración', Formato: 'Maduración · RAS', Componente: 'Colector', pH: '9' },
    { _SheetOrigin: 'Biomol', Fecha: '15/09/2026', Lugar: 'Sala 1', Tanque: 'Tq 1', Piscina: 'P557', 'Estadío': 'Reproductores', Sexo: 'Hembra', IHHNV: 'Positivo', WSSV: 'Negativo' },
    { _SheetOrigin: 'Biomol', Fecha: '16/09/2026', Lugar: 'Chongón', Piscina: 'P553', 'Estadío': 'Reproductores', Sexo: 'Macho', IHHNV: 'Negativo' },
  ];
  const modal = () => root.querySelector('.mop-lab.sv-open');
  const boton = (k) => root.querySelector(`[data-mop-lab="${k}"]`);

  it('🔴 los dos botones, junto a la sub-nav y en cualquier sub-vista; ningún modal al llegar', async () => {
    await montar([...PLANTA, ...LAB]);
    expect(root.querySelector('.mc-subnav [data-mop-lab="micro"]')).not.toBeNull();
    expect(root.querySelector('.mc-subnav [data-mop-lab="biomol"]')).not.toBeNull();
    expect(modal()).toBeNull();
    click(root.querySelector('[data-mop-sub="tanques"]'));
    click(boton('micro'));
    expect(modal(), 'desde 🛢 Tanques también').not.toBeNull();
  });

  it('🔴 Micro y agua: los tres bloques con sus cifras; el fondo no se desplaza; ✕ lo cierra', async () => {
    await montar([...PLANTA, ...LAB]);
    click(boton('micro'));
    expect([...modal().querySelectorAll('.mop-lab-bloque h4')].map((h) => h.textContent.slice(0, 2))).toEqual(['① ', '② ', '③ ']);
    expect(modal().querySelector('.mop-lab-kpi').textContent).toContain('3 muestras · 1 en alerta');
    expect(modal().querySelector('.mop-lab-2 .mop-lab-fuera').textContent, 'la piscina de origen, aparte').toContain('Piscina 556 fuera de las salas');
    expect(modal().querySelector('.mop-lab-ult').textContent, 'un lugar, no «TQ Piscina»').not.toContain('TQ Piscina');
    expect(modal().querySelector('.mop-lab-des tbody tr').textContent).toContain('1 · 1 en alerta');
    expect(modal().querySelector('.mop-lab-cal tbody tr').textContent).toContain('Colector');
    expect(modal().querySelector('[role="dialog"]'), 'semántica de diálogo').not.toBeNull();
    expect(document.body.classList.contains('modal-open')).toBe(true);
    click(root.querySelector('[data-mop-lab-cerrar]'));
    expect(modal()).toBeNull();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('se cierra también pulsando el velo, y con Escape', async () => {
    await montar([...PLANTA, ...LAB]);
    click(boton('micro'));
    click(modal());
    expect(modal()).toBeNull();
    click(boton('micro'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal()).toBeNull();
  });

  it('🔴 sigue los filtros del tablero y dice el que no puede aplicar', async () => {
    await montar([...PLANTA, ...LAB]);
    cambiar(filtro('sala'), 'Sala 2');
    click(boton('micro'));
    expect(modal().querySelector('.mop-lab-kpi').textContent).toContain('1 muestras · 0 en alerta');
    const des = modal().querySelectorAll('.mop-lab-bloque')[1];
    expect(des.textContent).toContain('No se aplica aquí: sala');
  });

  it('🔴 Biomol: se carga al abrirlo, y enseña la prevalencia, las salas (lo de fuera, aparte) y los positivos', async () => {
    await montar([...PLANTA, ...LAB]);
    click(boton('biomol'));
    expect(modal().textContent).toContain('Cargando Biología Molecular');
    await vi.waitFor(() => expect(root.querySelector('.mop-lab-prev')).not.toBeNull());
    expect(modal().querySelector('.mop-lab-prev tbody tr').textContent).toContain('IHHNV');
    expect(modal().querySelector('.mop-lab-fuera').textContent).toContain('Chongón');
    expect(modal().querySelector('.mop-lab-posit tbody tr').textContent).toContain('Sala 1 · Tq 1');
    expect(makeChart.mock.calls.some(([id]) => id === 'mopLabTend'), 'la tendencia semanal').toBe(true);
  });

  it('🔴 «Abrir en 🦠 Microbiología» cierra el modal y cambia de vista', async () => {
    await montar([...PLANTA, ...LAB]);
    const { changeView } = await import('../../ui/router.js');
    click(boton('micro'));
    click(root.querySelector('[data-mop-lab-abrir-micro]'));
    expect(modal()).toBeNull();
    expect(changeView).toHaveBeenLastCalledWith('microbiologia');
    const { microPreseleccion } = await import('../microbiologia/index.js');
    expect(microPreseleccion, 'llega con Maduración elegido').toHaveBeenLastCalledWith({ sub: 'bacteriologia', depto: 'Maduración' });
  });

  it('🔑 lo que viene del Sheet sale ESCAPADO', async () => {
    await montar([...PLANTA, ...LAB]);
    click(boton('micro'));
    expect(modal().querySelector('img')).toBeNull();
    expect(modal().textContent).toContain('<img src=x');
  });

  it('🔑 las clases propias del modal están DEFINIDAS en su CSS', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/operativo.css', 'utf8') + readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    await montar([...PLANTA, ...LAB]);
    const usadas = new Set();
    const junta = () => root.querySelectorAll('[class]').forEach((el) => el.classList.forEach((c) => { if (c.startsWith('mop-lab')) usadas.add(c); }));
    click(boton('micro')); junta();
    click(root.querySelector('[data-mop-lab-cerrar]'));
    click(boton('biomol'));
    await vi.waitFor(() => expect(root.querySelector('.mop-lab-prev')).not.toBeNull());
    junta();
    expect(usadas.size > 10, 'control: el modal pinta sus clases').toBe(true);
    expect([...usadas].filter((c) => !new RegExp('\\.' + c + '(?![\\w-])').test(css))).toEqual([]);
  });
});

/* «De paso» (2026-09-26, usuario) · en la ficha del lote: un ingreso en varios tanques es UN evento, con sus tanques; y
   el % de cópulas y muda es POR DÍA (regla del Saldo), y lo dice. */
describe('Maduración · operativo · «de paso» · la ficha del lote', () => {
  const PLANTA_K = [...PLANTA, ING('13/09/2026', 'QK', 'Sala 3', 22, 5, 5), ING('13/09/2026', 'QK', 'Sala 3', 23, 4, 6),
    TQ('15/09/2026', 'Sala 3', 22, { 'Cópulas': 2 }), TQ('16/09/2026', 'Sala 3', 22, { 'Cópulas': 1 })];

  it('🔴 el ingreso en dos tanques sale UNA vez, con los tanques y los animales sumados', async () => {
    await montar(PLANTA_K);
    abrirLotes();
    click(filaLote('QK'));
    const card = [...root.querySelectorAll('.mc-card')].find((c) => c.textContent.includes('📈 Vivos del lote'));
    const ingresos = [...card.querySelectorAll('li')].filter((li) => li.textContent.includes('Ingreso'));
    expect(ingresos.map((li) => li.textContent)).toEqual(['13/09 · Ingreso · 2 tanques · ♀ 11 ♂ 9']);
  });

  it('🔴 cópulas: las del período y el % POR DÍA de sus hembras —(2 + 1) ÷ (5 + 5) = 30 %, no 3 ÷ 11—', async () => {
    await montar(PLANTA_K);
    abrirLotes();
    click(filaLote('QK'));
    const repro = [...root.querySelectorAll('.mc-card')].find((c) => c.textContent.includes('🥚 Reproducción'));
    const fila = [...repro.querySelectorAll('.mop-sc-fila')].find((f) => f.textContent.startsWith('Cópulas'));
    expect(fila.textContent).toBe('Cópulas3 en el período · 30 % de sus hembras por día');
    expect(repro.textContent).toContain('El % es POR DÍA de parte');
  });
});

/* ============================================================
   0q·1 (2026-09-27, usuario) · la legibilidad de TODOS los gráficos de Operativo

   «Se ven borrosos, transparentosos, y no se aprecian las cantidades de los ejes», como en Microchips. Medido en Chrome:
   ejes, títulos y leyendas a 10 px en gris claro #78909c, rejilla al 16 %, barras al 55–60 % (desoves, mortalidad del
   día, bajas, ♀/♂ por tanque, libres) y curvas (tension .25) que inventan valores entre días (la de Vivos, una caída antes
   del 13/09 que no está en los datos). Decisión del usuario: ejes 12 px en el color de texto del tema, títulos 11 px,
   leyendas 12 px, rejilla al 30 %, barras sólidas, líneas rectas. Esta prueba barre la configuración de TODOS los
   gráficos que dibuja este archivo (y abre la ficha del tanque, que ninguna otra prueba dibuja).
   ============================================================ */
describe('Maduración · operativo · los gráficos se leen', () => {
  it('la ficha del tanque dibuja su curva', async () => {
    await montar(PLANTA);
    click(root.querySelector('[data-mop-sub="tanques"]'));
    click(root.querySelector('[data-mop-tqf="Sala 1|1"]'));
    expect(makeChart.mock.calls.some(([id]) => id === 'mopTanqueCurva')).toBe(true);
  });

  it('0q·5a/5b/5c · la ventana de Microbiología dibuja sus tres gráficos (①, ③ micro y ③ calidad)', async () => {
    await montar([...PLANTA, ...LAB5, ...AGUA5, ...CAL5]);
    click(root.querySelector('[data-mop-lab="micro"]'));
    expect(makeChart.mock.calls.some(([id]) => id === 'mopMicPat')).toBe(true);
    expect(makeChart.mock.calls.some(([id]) => id === 'mopAguaPat')).toBe(true);
    expect(makeChart.mock.calls.some(([id]) => id === 'mopCalPar')).toBe(true);
  });

  it('0q·3 · el reparto de un lote por destino dibuja su gráfico', async () => {
    await montar(PLANTA_Q3);
    abrirRepro();
    click(root.querySelector('[data-mop-rlote="QA"]'));
    expect(makeChart.mock.calls.some(([id]) => id === 'mopReproDest')).toBe(true);
  });

  it('se abren los siete KPI (cada uno dibuja su gráfico)', async () => {
    await montar(PLANTA);
    const claves = [...root.querySelectorAll('[data-mop-kpi]')].map((x) => x.dataset.mopKpi);
    expect(claves.length).toBe(7);
    for (const k of claves) click(root.querySelector(`[data-mop-kpi="${k}"]`));
    expect(makeChart.mock.calls.filter(([id]) => id === 'mopKpiCurva').length).toBeGreaterThanOrEqual(7);
  });

  it('🔴 los doce gráficos, y todos con ejes a 12 px en un color que no es el gris claro; títulos a 11 px; leyenda a 12 px', () => {
    const ids = [...new Set(GRAFICOS.map((g) => g.id))].sort();
    expect(ids).toEqual(['mopAguaPat', 'mopCalPar', 'mopCuarCurva', 'mopKpiCurva', 'mopLabTend', 'mopLoteCurva', 'mopMicPat', 'mopOx', 'mopPiscinaCurva', 'mopReproDest', 'mopTanqueCurva', 'mopTq']);
    for (const { id, cfg } of GRAFICOS) {
      for (const [eje, sc] of Object.entries(cfg.options.scales || {})) {
        expect(sc.ticks.font.size, `${id}.${eje}`).toBeGreaterThanOrEqual(12);
        expect(String(sc.ticks.color).toLowerCase(), `${id}.${eje}`).not.toBe('#78909c');
        if (sc.title && sc.title.display) expect(sc.title.font.size, `${id}.${eje} título`).toBeGreaterThanOrEqual(11);
      }
      const ley = cfg.options.plugins && cfg.options.plugins.legend;
      if (ley && ley.labels) expect(ley.labels.font.size, `${id} leyenda`).toBeGreaterThanOrEqual(12);
    }
  });

  it('🔴 rejilla al 30 %, barras SÓLIDAS y líneas RECTAS', () => {
    const alfa = (c) => { const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(String(c)); if (m) return Number(m[1]); return /^#[0-9a-f]{8}$/i.test(String(c)) ? parseInt(String(c).slice(7), 16) / 255 : 1; };
    for (const { id, cfg } of GRAFICOS) {
      for (const [eje, sc] of Object.entries(cfg.options.scales || {})) if (sc.grid && sc.grid.color) expect(alfa(sc.grid.color), `${id}.${eje} rejilla`).toBeGreaterThanOrEqual(0.3);
      for (const d of cfg.data.datasets) {
        const esBarra = d.type === 'bar' || (!d.type && cfg.type === 'bar');
        if (esBarra) for (const c of [].concat(d.backgroundColor)) expect(alfa(c), `${id} · ${d.label}`).toBe(1);
        else expect(d.tension || 0, `${id} · ${d.label}`).toBe(0);
      }
      /* Con barras sólidas, una línea DETRÁS de ellas desaparece (medido: la de N5 en Reproducción): en un gráfico mixto,
         las líneas se dibujan encima (en Chart.js, menor `order` = encima). */
      const barras = cfg.data.datasets.filter((d) => d.type === 'bar' || (!d.type && cfg.type === 'bar')), lineas = cfg.data.datasets.filter((d) => d.type === 'line');
      if (barras.length && lineas.length) expect(Math.max(...lineas.map((d) => d.order || 0)), `${id}: las líneas encima de las barras`).toBeLessThan(Math.min(...barras.map((d) => d.order || 0)));
    }
  });

  it('🔑 el color de los ejes sigue al TEMA (lo lee de --c-text al dibujar)', async () => {
    document.documentElement.style.setProperty('--c-text', '#abcdef');
    try {
      await montar(PLANTA);
      click(root.querySelector('[data-mop-kpi="vivos"]'));
      const l = makeChart.mock.calls.filter(([id]) => id === 'mopKpiCurva');
      expect(l[l.length - 1][1].options.scales.x.ticks.color).toBe('#abcdef');
    } finally { document.documentElement.style.removeProperty('--c-text'); }
  });
});

/* ============================================================
   0q·2 (2026-09-27, usuario) · el MOVIMIENTO de los gráficos de Operativo

   «El gráfico del KPI de reproducción, al pasar por desoves o N5, se buggea». Medido en Chrome con datos reales: en modo
   «index» el globo se colocaba en la altura MEDIA de la barra y del punto, que cambia mucho de un día al siguiente (07/09:
   134 desoves y 40 M de N5; 08/09: 0 y 0): saltaba ~100 px arriba y abajo, cambiaba de lado su pico y cada salto se animaba
   400 ms, siempre detrás del ratón y TAPANDO el día leído; el punto y el globo anteriores tardaban 400 ms en borrarse; y
   cada filtro volvía a hacer crecer el gráfico desde cero durante 1 s. Además (defecto de 0q·1): `order: 1` en las barras
   dio la vuelta a la leyenda y al globo («N5 · Desoves»). Decisión del usuario, para los OCHO gráficos: una raya vertical
   marca el día y el globo va ARRIBA, a su lado (sólo se mueve de lado); el resaltado al pasar es inmediato; el globo se
   desliza en 120 ms; el dibujo al abrir o filtrar, 400 ms; y nada con «reducir movimiento».
   ============================================================ */
describe('Maduración · operativo · los gráficos se mueven bien', () => {
  it('🔴 los doce: globo arriba junto a la raya del día (menos los de dispersión), sin transición al pasar, globo en ≤ 150 ms, dibujo en ≤ 400 ms', () => {
    const ids = [...new Set(GRAFICOS.map((g) => g.id))].sort();
    expect(ids).toEqual(['mopAguaPat', 'mopCalPar', 'mopCuarCurva', 'mopKpiCurva', 'mopLabTend', 'mopLoteCurva', 'mopMicPat', 'mopOx', 'mopPiscinaCurva', 'mopReproDest', 'mopTanqueCurva', 'mopTq']);
    for (const { id, cfg } of GRAFICOS) {
      const o = cfg.options;
      if (id === 'mopMicPat' || id === 'mopAguaPat' || id === 'mopCalPar') {   // 0q·5a/5b/5c · dispersión: el punto más cercano, sin raya ni globo arriba (su eje no es de días)
        expect(o.interaction, id).toEqual({ mode: 'nearest', intersect: true });
        expect(o.transitions.active.animation.duration, id).toBe(0);
        expect(o.animation.duration, id).toBeLessThanOrEqual(400);
        expect((cfg.plugins || []).map((p) => p.id), id).not.toContain('mopGuiaDia');
        continue;
      }
      expect(o.interaction, id).toEqual({ mode: 'index', intersect: false });
      expect(o.plugins.tooltip.position, id).toBe('arribaJunto');
      expect(o.plugins.tooltip.caretSize, id).toBe(0);
      expect(o.plugins.tooltip.animation.duration, id).toBeLessThanOrEqual(150);
      expect(o.transitions.active.animation.duration, id).toBe(0);
      expect(o.animation.duration, id).toBeGreaterThan(0);
      expect(o.animation.duration, id).toBeLessThanOrEqual(400);
      expect((cfg.plugins || []).map((p) => p.id), id).toContain('mopGuiaDia');
    }
  });

  it('🔴 la leyenda y el globo, en el orden de los DATOS (no en el de dibujo, que `order` cambia)', () => {
    expect(GRAFICOS.length).toBeGreaterThan(7);
    for (const { id, cfg } of GRAFICOS) {
      const { legend, tooltip } = cfg.options.plugins;
      const items = () => [{ datasetIndex: 1 }, { datasetIndex: 0 }, { datasetIndex: 2 }];
      expect(items().sort(legend.labels.sort).map((i) => i.datasetIndex), id + ' leyenda').toEqual([0, 1, 2]);
      expect(items().sort(tooltip.itemSort).map((i) => i.datasetIndex), id + ' globo').toEqual([0, 1, 2]);
    }
  });

  it('🔴 la raya del día: en la x del día activo, de arriba abajo del área de datos; sin día activo, nada', () => {
    const guia = GRAFICOS[0].cfg.plugins.find((p) => p.id === 'mopGuiaDia');
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), setLineDash: vi.fn() };
    const chart = (activos) => ({ ctx, chartArea: { top: 12, bottom: 210, left: 40, right: 600 }, tooltip: { getActiveElements: () => activos } });
    guia.afterDatasetsDraw(chart([{ element: { x: 123 } }, { element: { x: 123 } }]));
    expect(ctx.moveTo).toHaveBeenCalledWith(123, 12);
    expect(ctx.lineTo).toHaveBeenCalledWith(123, 210);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    guia.afterDatasetsDraw(chart([]));
    guia.afterDatasetsDraw({ ctx, chartArea: { top: 0, bottom: 1 }, tooltip: null });
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('🔑 con «reducir movimiento» en el sistema, ni dibujo animado ni globo animado', async () => {
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation((q) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} }));
    try {
      await montar(PLANTA);
      click(root.querySelector('[data-mop-kpi="vivos"]'));
      const l = makeChart.mock.calls.filter(([id]) => id === 'mopKpiCurva');
      expect(l[l.length - 1][1].options.animation).toBe(false);
    } finally { mm.mockRestore(); }
  });
});

/* ============================================================
   0q·3 (2026-09-27, usuario) · 🥚 Reproducción: «A dónde fueron» PLEGABLE, y por lote, sus N2 y N5 por destino

   (a) «A dónde fueron» como lista desplegable. Medido en Chrome: 13 destinos, 573 px de alto. Decisión del usuario: la
   tarjeta empieza PLEGADA con su título y una línea (cuántos destinos y los tres primeros); pulsar el título la despliega
   con la lista de siempre; y recuerda cómo se dejó (la sesión, como el resto del estado de la vista).
   ============================================================ */
const PLANTA_Q3 = [...PLANTA_F4,
  DES('14/09/2026', 'QA', 3, 300000, { 'Fecha N2': '14/09/2026', N2: 1200000, 'Fecha N5': '15/09/2026', N5: 1500000, Despacho: 'Mar Bravo M07' }),
  DES('15/09/2026', 'QA', 1, 100000, { 'Fecha N2': '15/09/2026', N2: 90000, 'Fecha N5': '16/09/2026', N5: 50000, Despacho: 'SanLab' }),
];
const destinos = () => root.querySelector('details[data-mop-dest]');
describe('Maduración · operativo · 🥚 A dónde fueron, plegable', () => {
  it('🔴 empieza PLEGADA y su resumen dice cuántos destinos y los tres primeros', async () => {
    await montar(PLANTA_Q3);
    abrirRepro();
    const d = destinos();
    expect(d).not.toBeNull();
    expect(d.open).toBe(false);
    const s = d.querySelector('summary').textContent.replace(/\s+/g, ' ');
    expect(s).toContain('A dónde fueron');
    expect(s).toContain('4 destinos');
    expect(s).toContain('Mar Bravo M07 1,5 M');
    expect(s).toContain('Tabasca 200.000');
    expect(s).toContain('Hisenor 200.000');
    expect(s).not.toContain('SanLab');
    expect(s).toContain('…');
    // la lista de siempre sigue dentro
    expect(d.querySelectorAll('.mop-obs-f').length).toBe(4);
    expect(d.textContent).toContain('NO suman el total');
  });

  it('🔴 pulsar el título la despliega, lo RECUERDA al repintar, y volver a pulsar la pliega', async () => {
    await montar(PLANTA_Q3);
    abrirRepro();
    click(destinos().querySelector('summary'));
    expect(destinos().open).toBe(true);
    cambiar(filtro('sala'), 'Sala 1');           // repinta la vista entera
    expect(destinos().open).toBe(true);
    click(destinos().querySelector('summary'));
    expect(destinos().open).toBe(false);
    cambiar(filtro('sala'), '');
    expect(destinos().open).toBe(false);
  });

  it('🔑 con tres destinos o menos, el resumen no pone «…»', async () => {
    await montar(PLANTA_F4);
    abrirRepro();
    const s = destinos().querySelector('summary').textContent;
    expect(s).toContain('2 destinos');
    expect(s).not.toContain('…');
  });

  it('🔑 sin ningún destino anotado, la tarjeta lo dice y no hay nada que plegar', async () => {
    await montar([...PLANTA, DES('12/09/2026', 'QA', 4, 400000, { N2: 300000, N5: 200000 })]);
    abrirRepro();
    expect(destinos()).toBeNull();
    expect(root.textContent).toContain('Ningún desove del período tiene destino anotado');
  });
});

/* ============================================================
   0q·3 (b) · «Por lote»: pulsar una fila despliega, debajo, un gráfico de N2 y N5 por destino, de más a menos N5.
   Decisión del usuario: barras VERTICALES N2 y N5 una al lado de otra (el estilo y el movimiento de los demás); un
   desove con varios destinos cuenta ENTERO en cada uno y el globo dice cuánto de la barra es compartido. Las cifras las
   prueba operativo.reproduccion.test.js; aquí, que lleguen a la pantalla y que la fila se abra y cierre.
   ============================================================ */
const filaRepro = (l) => root.querySelector(`[data-mop-rlote="${l}"]`);
const reparto = () => makeChart.mock.calls.filter(([id]) => id === 'mopReproDest');
describe('Maduración · operativo · 🥚 Por lote: el reparto por destino', () => {
  it('🔴 las filas se pueden pulsar y empiezan cerradas, sin gráfico', async () => {
    await montar(PLANTA_Q3);
    makeChart.mockClear();   // el mock guarda las llamadas de las pruebas anteriores
    abrirRepro();
    const f = filaRepro('QA');
    expect(f).not.toBeNull();
    expect(f.getAttribute('role')).toBe('button');
    expect(f.getAttribute('tabindex')).toBe('0');
    expect(f.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.mop-rlote-det')).toBeNull();
    expect(reparto().length).toBe(0);
  });

  it('🔴 al pulsarla, debajo, N2 y N5 por destino de más a menos N5, y el globo dice lo compartido', async () => {
    await montar(PLANTA_Q3);
    abrirRepro();
    click(filaRepro('QA'));
    expect(filaRepro('QA').getAttribute('aria-expanded')).toBe('true');
    const det = root.querySelector('.mop-rlote-det');
    expect(det).not.toBeNull();
    expect(det.previousElementSibling).toBe(filaRepro('QA'));
    expect(det.querySelector('canvas#mopReproDest')).not.toBeNull();
    const l = reparto();
    const cfg = l[l.length - 1][1];
    expect(cfg.data.labels).toEqual(['Mar Bravo M07', 'Tabasca', 'Hisenor', 'SanLab']);
    const [n2, n5] = cfg.data.datasets;
    expect(n2.label).toBe('N2');
    expect(n5.label).toBe('N5');
    expect(n2.data).toEqual([1200000, 300000, 300000, 90000]);
    expect(n5.data).toEqual([1500000, 200000, 200000, 50000]);
    const pie = (d, i) => d.tooltip.callbacks.afterLabel({ dataIndex: i });
    expect(pie(n5, 1)).toBe('de ellos, 200.000 de desoves con varios destinos');
    expect(pie(n2, 2)).toBe('de ellos, 300.000 de desoves con varios destinos');
    expect(pie(n5, 0)).toBe('');
    const t = det.textContent;
    expect(t).toContain('QA');
    expect(t).toContain('NO suman');
    expect(t).toContain('1 registro(s) de desove sin destino');
  });

  it('🔴 volver a pulsarla la cierra; y con el teclado (Enter) se abre', async () => {
    await montar(PLANTA_Q3);
    abrirRepro();
    click(filaRepro('QA'));
    click(filaRepro('QA'));
    expect(root.querySelector('.mop-rlote-det')).toBeNull();
    expect(filaRepro('QA').getAttribute('aria-expanded')).toBe('false');
    const f = filaRepro('QA');
    f.focus();
    f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(root.querySelector('.mop-rlote-det')).not.toBeNull();
  });

  it('🔑 un lote cuyo único desove no tiene destino lo dice en vez de dibujar un gráfico vacío', async () => {
    await montar([...PLANTA, DES('12/09/2026', 'QA', 4, 400000, { N2: 300000, N5: 200000 })]);
    makeChart.mockClear();
    abrirRepro();
    click(filaRepro('QA'));
    expect(root.querySelector('.mop-rlote-det').textContent).toContain('Ningún desove de este lote tiene destino anotado');
    expect(reparto().length).toBe(0);
  });
});

describe('Maduración · operativo · 🥚 el reparto de un lote cabe en el móvil', () => {
  /* Medido en Chrome a 390 px: la fila desplegada vive DENTRO del desplazamiento horizontal de la tabla (10 columnas,
     ~800 px), así que el gráfico tomaba el ancho de la TABLA y se veía cortado. Se ancla al ancho VISIBLE de su caja:
     la caja es un contenedor de consultas y el reparto, pegajoso a la izquierda, mide 100cqw menos el relleno. */
  it('🔴 el reparto va en su caja anclada, dentro de una tabla que es contenedor', async () => {
    await montar(PLANTA_Q3);
    abrirRepro();
    click(filaRepro('QA'));
    expect(root.querySelector('.mc-tablewrap.mop-rlote-wrap .mop-rlote-det .mop-rlote-in canvas#mopReproDest')).not.toBeNull();
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/operativo.css', 'utf8');
    expect(css).toContain('.mop-rlote-wrap { container-type: inline-size; }');
    expect(css).toContain('.mop-rlote-in { position: sticky; left: 12px; width: calc(100cqw - 24px); }');
  });
});

describe('Maduración · operativo · 🥚 Reproducción: lo que el navegador haría por su cuenta', () => {
  it('🔴 el clic en el título de «A dónde fueron» anula el plegado NATIVO (si no, el navegador lo daría la vuelta otra vez)', async () => {
    await montar(PLANTA_Q3);
    abrirRepro();
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    destinos().querySelector('summary').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(destinos().open).toBe(true);
  });

  it('🔴 un lote desplegado que el filtro quita de la tabla se SUELTA: al quitar el filtro vuelve cerrado', async () => {
    await montar(PLANTA_Q3);
    abrirRepro();
    click(filaRepro('QA'));
    expect([...filtro('lote').options].some((o) => o.value === 'QB')).toBe(true);
    cambiar(filtro('lote'), 'QB');
    expect(filaRepro('QA')).toBeNull();
    cambiar(filtro('lote'), '');
    expect(filaRepro('QA').getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.mop-rlote-det')).toBeNull();
  });
});

/* ============================================================
   0q·4 (2026-09-27, usuario) · 🩺 «Partes esperados frente a registrados»: pulsar una FECHA (o una celda) abre una
   ventana con ese día. Decisión del usuario: el encabezado de cada fecha y cada celda sala × día la abren (la celda, ya
   centrada en su sala); dentro, la cobertura de cada sala y sus partes tanque a tanque; ◀ ▶ para el día anterior y el
   siguiente sin cerrar; y cada tanque lleva a su ficha en 🛢 Tanques. Las cifras las prueba operativo.calidad.test.js.
   ============================================================ */
const MALO_Q4 = '<img src=x onerror=alert(1)>';
const PLANTA_Q4 = [...PLANTA_F6C,
  TQ('18/09/2026', 'Sala 1', 1, { 'Hembras muertas': '2', 'Machos muertos': '1', 'Cópulas': '4', 'Observaciones sanitarias': MALO_Q4 }),
  TQ('18/09/2026', 'Sala 1', 5)];   // el t5 está vacío en el libro: su parte no se esperaba
const ventanaDia = () => root.querySelector('.mop-dia.sv-open');
const botonDia = (iso) => root.querySelector(`.mop-cob-cal thead [data-mop-dia="${iso}"]`);
const seccion = (s) => [...ventanaDia().querySelectorAll('[data-mop-dia-sala]')].find((x) => x.dataset.mopDiaSala === s);
describe('Maduración · operativo · 🩺 la ventana de un día del calendario de partes', () => {
  it('🔴 cada fecha del encabezado es un BOTÓN; pulsarla abre la ventana del día con cada sala y sus partes', async () => {
    await montar(PLANTA_Q4);
    abrirCalidad();
    expect(ventanaDia()).toBeNull();
    const b = botonDia('2026-09-18');
    expect(b.tagName).toBe('BUTTON');
    click(b);
    const v = ventanaDia();
    expect(v).not.toBeNull();
    expect(v.querySelector('.sv-modal-title').textContent).toContain('18/09/2026');
    expect(v.contains(document.activeElement)).toBe(true);
    const s1 = plano(seccion('Sala 1'));
    expect(s1).toContain('1 de 1 tanque(s) con parte');
    const t1 = seccion('Sala 1').querySelector('tbody tr');
    expect(plano(t1.cells[0])).toContain('1');
    expect([plano(t1.cells[2]), plano(t1.cells[3]), plano(t1.cells[5])]).toEqual(['2', '1', '4']);
    expect(s1).toContain('registro de Sala: ✓ sí');
    const t5 = [...seccion('Sala 1').querySelectorAll('tbody tr')].find((tr) => plano(tr.cells[0]).startsWith('t5'));
    expect(plano(t5.cells[0])).toBe('t5 no esperado');
    expect(plano(t1.cells[0])).toBe('t1');
    expect(plano(seccion('Sala 4'))).toContain('registro de Sala: ✗ NO');
    expect(plano(seccion('Sala 4'))).toContain('0 de 1 tanque(s) con parte');
    expect(plano(seccion('Sala 4'))).toContain('Falta el parte del t1');
    expect(plano(seccion('Sala 4'))).toContain('Ningún parte registrado');
  });

  it('🔴 lo del Sheet sale ESCAPADO dentro de la ventana', async () => {
    await montar(PLANTA_Q4);
    abrirCalidad();
    click(botonDia('2026-09-18'));
    expect(ventanaDia().querySelector('img')).toBeNull();
    expect(ventanaDia().textContent).toContain(MALO_Q4);
  });

  it('🔴 una CELDA abre el día centrado en su sala, y «Todas las salas» enseña las demás', async () => {
    await montar(PLANTA_Q4);
    abrirCalidad();
    click(celdaDelDia('.mop-cob-cal', 'Sala 4', '18/09'));
    expect([...ventanaDia().querySelectorAll('[data-mop-dia-sala]')].map((x) => x.dataset.mopDiaSala)).toEqual(['Sala 4']);
    click(ventanaDia().querySelector('[data-mop-dia-todas]'));
    expect(ventanaDia().querySelectorAll('[data-mop-dia-sala]').length).toBeGreaterThan(1);
  });

  it('🔴 ◀ ▶ recorren los días sin cerrar; en el último, ▶ no hace nada', async () => {
    await montar(PLANTA_Q4);
    abrirCalidad();
    click(botonDia('2026-09-18'));
    click(ventanaDia().querySelector('[data-mop-dia-dir="ant"]'));
    expect(ventanaDia().querySelector('.sv-modal-title').textContent).toContain('17/09/2026');
    expect(document.activeElement).toBe(ventanaDia().querySelector('[data-mop-dia-dir="ant"]'));
    click(ventanaDia().querySelector('[data-mop-dia-dir="sig"]'));
    click(ventanaDia().querySelector('[data-mop-dia-dir="sig"]'));
    expect(ventanaDia().querySelector('.sv-modal-title').textContent).toContain('19/09/2026');
    expect(plano(ventanaDia())).toContain('EN CURSO');
    expect(ventanaDia().querySelector('[data-mop-dia-dir="sig"]').disabled).toBe(true);
  });

  it('🔴 se cierra con ✕, con el velo y con Escape', async () => {
    await montar(PLANTA_Q4);
    abrirCalidad();
    click(botonDia('2026-09-18'));
    click(ventanaDia().querySelector('[data-mop-dia-cerrar]'));
    expect(ventanaDia()).toBeNull();
    click(botonDia('2026-09-18'));
    click(ventanaDia());
    expect(ventanaDia()).toBeNull();
    click(botonDia('2026-09-18'));
    expect(document.body.classList.contains('modal-open')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ventanaDia()).toBeNull();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('🔴 un tanque de la ventana lleva a su ficha en 🛢 Tanques', async () => {
    await montar(PLANTA_Q4);
    abrirCalidad();
    click(botonDia('2026-09-18'));
    click(ventanaDia().querySelector('[data-mop-dia-tq="Sala 1|1"]'));
    expect(ventanaDia()).toBeNull();
    expect(root.querySelector('[data-mop-sub="tanques"]').classList.contains('is-on')).toBe(true);
    expect(root.querySelector('[data-mop-tqf="Sala 1|1"]').getAttribute('aria-pressed')).toBe('true');
  });
});

/* ============================================================
   0q·5a (2026-09-27, usuario) · 🦠 la ventana de Microbiología: sus PROPIOS filtros y las CANTIDADES del patógeno elegido

   Decisiones del usuario: la ventana tiene su barra —Mes, Lote, Sala, Piscina, Sexo— sobre TODO el registro, y empieza
   con la sala, el sexo y el lote del tablero; la piscina es la de la muestra o, si no, la de su lote (Ingresos); y al
   escoger un patógeno (su fila), sus UFC muestra a muestra, la mediana semanal y los umbrales Moderado y Elevado, en
   escala logarítmica con las muestras de 0 UFC en la raya «0». Las cuentas, en operativo.laboratorio.test.js.
   ============================================================ */
const MIC5 = (fecha, extra = {}) => ({ _SheetOrigin: 'Microbiología', 'Fecha muestreo': fecha, Departamento: 'Maduración', Formato: 'Maduración · Principal',
  'Tipo de muestra': 'Hepatopáncreas', ...extra });
const MALO_Q5 = '"><img src=x onerror=alert(1)>';
const LAB5 = [
  MIC5('15/09/2026', { 'Módulo/Sala': 'Sala 1', 'TQ/N°': '1', Sexo: 'Hembras', Lote: 'QA', 'V.Totales UFC': '20000', 'V.alginolyticus UFC': '8000' }),
  MIC5('16/09/2026', { 'Módulo/Sala': 'Sala 2', 'TQ/N°': '16', Sexo: 'Machos', 'V.Totales UFC': '500', 'V.alginolyticus UFC': '0' }),
  MIC5('14/09/2026', { 'TQ/N°': 'Piscina 556', Sexo: 'Hembras', 'V.Totales UFC': '500' }),
  MIC5('10/07/2026', { 'Módulo/Sala': 'Sala 1', Sexo: 'Hembras', Lote: MALO_Q5, 'V.Totales UFC': '200000' }),
  { ...ING('01/08/2026', 'QA', 'Sala 3', 30, 1, 1), 'Piscina Broodstock': '557' },
];
const modalLab = () => root.querySelector('.mop-lab.sv-open');
const abrirMicro = () => click(root.querySelector('[data-mop-lab="micro"]'));
const selLab = (d) => modalLab().querySelector(`[data-mop-labf="${d}"]`);
const kpiRep = () => modalLab().querySelector('.mop-lab-kpi').textContent;
const micPat = () => { const l = makeChart.mock.calls.filter(([id]) => id === 'mopMicPat'); return l.length ? l[l.length - 1][1] : null; };
describe('Maduración · operativo · 🦠 la ventana de Microbiología con sus filtros y sus cantidades (0q·5a)', () => {
  it('🔴 su barra de filtros —Mes, Lote, Sala, Piscina, Sexo— y TODO el registro: la muestra de julio cuenta', async () => {
    await montar([...PLANTA, ...LAB5]);
    abrirMicro();
    expect([...modalLab().querySelectorAll('[data-mop-labf]')].map((s) => s.dataset.mopLabf)).toEqual(['mes', 'lote', 'sala', 'piscina', 'sexo']);
    expect(kpiRep()).toContain('4 muestras');
    expect([...selLab('mes').options].map((o) => o.textContent)).toEqual(['Todo el registro', 'julio 2026', 'septiembre 2026']);
    expect(modalLab().querySelector('.mop-lab-per').textContent).toContain('no los del tablero');
  });

  it('🔴 empieza con la sala y el sexo del tablero', async () => {
    await montar([...PLANTA, ...LAB5]);
    cambiar(filtro('sala'), 'Sala 2');
    abrirMicro();
    // ⚠ happy-dom lee mal el `value` de un <select> pintado con innerHTML: se lee la opción marcada.
    expect(selLab('sala').querySelector('option[selected]').value).toBe('Sala 2');
    expect(kpiRep()).toContain('1 muestras');
  });

  it('🔴 el mes recorta, y el foco se queda en su select; «Quitar filtros» vuelve a todo', async () => {
    await montar([...PLANTA, ...LAB5]);
    abrirMicro();
    cambiar(selLab('mes'), '2026-07');
    expect(kpiRep()).toContain('1 muestras');
    expect(document.activeElement).toBe(selLab('mes'));
    click(modalLab().querySelector('[data-mop-labf-limpiar]'));
    expect(kpiRep()).toContain('4 muestras');
  });

  it('🔴 la piscina: la de la muestra o la de su lote; en el despacho y el agua no se aplica, y se dice', async () => {
    await montar([...PLANTA, ...LAB5]);
    abrirMicro();
    expect([...selLab('piscina').options].map((o) => o.value)).toEqual(['', 'Piscina 556', 'Piscina 557']);
    cambiar(selLab('piscina'), 'Piscina 557');
    expect(kpiRep()).toContain('1 muestras');          // la de QA, por su ingreso
    expect(modalLab().querySelectorAll('.mop-lab-bloque')[1].textContent).toContain('No se aplica aquí: piscina');
    expect(modalLab().querySelectorAll('.mop-lab-bloque')[0].textContent).toContain('no dicen su piscina');
  });

  it('🔴 un patógeno se ESCOGE (su fila) y dibuja sus cantidades: log, mediana semanal, umbrales y el «0»', async () => {
    await montar([...PLANTA, ...LAB5]);
    abrirMicro();
    const fila = modalLab().querySelector('[data-mop-micpat="algino"]');
    expect(fila.getAttribute('role')).toBe('button');
    click(fila);
    expect(modalLab().querySelector('[data-mop-micpat="algino"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(modalLab().querySelector('[data-mop-micpat="algino"]'));
    expect(modalLab().querySelector('.mop-micpat-graf h5').textContent).toContain('V. alginolyticus');
    const cfg = micPat();
    expect(cfg.type).toBe('scatter');
    expect(cfg.options.scales.y.type).toBe('logarithmic');
    expect(cfg.data.datasets.map((d) => d.label)).toEqual(['Muestras', 'Mediana semanal', 'Moderado', 'Elevado']);
    const [mu, me, mo, el] = cfg.data.datasets;
    expect(mu.data.map((p) => [p.ufc, p.y])).toEqual([[8000, 8000], [0, 1]]);
    expect(cfg.options.scales.y.ticks.callback(1)).toBe('0');
    expect(cfg.options.scales.y.ticks.callback(1000)).toBe('1.000');
    expect(cfg.options.scales.y.ticks.callback(2000)).toBe('');
    expect(me.data).toHaveLength(1);
    expect([mo.data[0].y, el.data[0].y]).toEqual([3000, 5000]);
    const lab = cfg.options.plugins.tooltip.callbacks.label;
    expect(lab({ dataset: mu, raw: mu.data[1] })).toBe('0 UFC · Mínimo');
    expect(lab({ dataset: me, raw: me.data[0] })).toBe('mediana 4.000 UFC · 2 muestra(s)');
    // La leyenda de «Muestras» en gris neutro (sus puntos van del color de su nivel: el primero no la representa).
    const ley = cfg.options.plugins.legend.labels.generateLabels({ data: cfg.data, isDatasetVisible: (i) => i !== 3 });
    expect(ley.map((x) => [x.text, x.fillStyle, x.hidden, x.datasetIndex])).toEqual([
      ['Muestras (color de su nivel)', '#90a4ae', false, 0], ['Mediana semanal', me.backgroundColor, false, 1], ['Moderado', mo.backgroundColor, false, 2], ['Elevado', el.backgroundColor, true, 3]]);
    expect(ley.every((x) => x.fontColor === cfg.options.plugins.legend.labels.color), 'el texto de la leyenda sigue al tema (visto en Chrome, oscuro)').toBe(true);
  });

  it('🔴 con el teclado (Intro) también se escoge; y por defecto va el primero de la tabla', async () => {
    await montar([...PLANTA, ...LAB5]);
    abrirMicro();
    const primero = modalLab().querySelector('.mop-lab-pat tbody tr');
    expect(primero.getAttribute('aria-pressed')).toBe('true');
    const otro = [...modalLab().querySelectorAll('[data-mop-micpat]')].find((r) => r !== primero);
    otro.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(modalLab().querySelector(`[data-mop-micpat="${otro.dataset.mopMicpat}"]`).getAttribute('aria-pressed')).toBe('true');
  });

  it('🔑 lo que viene del Sheet sale ESCAPADO también en los filtros', async () => {
    await montar([...PLANTA, ...LAB5]);
    abrirMicro();
    expect(modalLab().querySelector('img')).toBeNull();
    // El lote llega normalizado (sin espacios, en mayúsculas): su valor tiene que llegar ENTERO a la opción.
    const malo = MALO_Q5.toUpperCase().replace(/\s+/g, '');
    expect([...selLab('lote').options].map((o) => o.value)).toContain(malo);
    expect([...selLab('lote').options].map((o) => o.textContent)).toContain(malo);
  });

  it('🔑 con «reducir movimiento», el gráfico de cantidades no se anima', async () => {
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation((q) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} }));
    try {
      await montar([...PLANTA, ...LAB5]);
      abrirMicro();
      expect(micPat().options.animation).toBe(false);
    } finally { mm.mockRestore(); }
  });
});

/* ============================================================
   0q·5b (2026-09-27, usuario) · 🦠 ③ Agua y RAS: las CANTIDADES por formato

   Los formatos de agua tienen umbrales DISTINTOS: pastillas de formato (el Hisopado, uno más), un filtro de Componente
   cuando el formato los tiene (RAS) y, como en ①, la tabla de patógenos que se escoge y su gráfico con los umbrales de
   ESE formato. Las cuentas, en operativo.laboratorio.test.js.
   ============================================================ */
const MICA5 = (fecha, formato, extra = {}) => ({ _SheetOrigin: 'Microbiología', 'Fecha muestreo': fecha, Departamento: 'Maduración', Formato: formato, ...extra });
const AGUA5 = [
  MICA5('10/09/2026', 'Maduración · RAS', { Componente: 'Colector', 'V.Totales UFC': '800' }),
  MICA5('11/09/2026', 'Maduración · RAS', { Componente: 'Salida UV', 'V.Totales UFC': '50', 'Aeromonas UFC': '10' }),
  MICA5('12/09/2026', 'Maduración · RAS', { Componente: 'Colector', 'V.Totales UFC': '1200' }),
  MICA5('12/09/2026', 'Maduración · Agua', { 'Aeromonas UFC': '20000' }),
  MICA5('13/09/2026', 'Maduración · Hisopado', { 'V.Totales UFC': '100' }),
];
const cantAgua = () => modalLab().querySelector('.mop-agua-cant');
const aguaPat = () => { const l = makeChart.mock.calls.filter(([id]) => id === 'mopAguaPat'); return l.length ? l[l.length - 1][1] : null; };
const umbralesDe = (cfg) => cfg.data.datasets.filter((d) => d.label === 'Moderado' || d.label === 'Elevado').map((d) => d.data[0].y);
describe('Maduración · operativo · 🦠 ③ Agua y RAS: las cantidades por formato (0q·5b)', () => {
  it('🔴 pastillas de formato (con sus muestras), el primero elegido; Componente en RAS; su tabla y su gráfico con los umbrales de RAS', async () => {
    await montar([...PLANTA, ...AGUA5]);
    abrirMicro();
    const p = [...cantAgua().querySelectorAll('[data-mop-aguafmt]')];
    expect(p.map((b) => [b.dataset.mopAguafmt, b.textContent.replace(/\s+/g, ' ').trim(), b.getAttribute('aria-pressed')])).toEqual([
      ['ras', 'RAS 3', 'true'], ['mad-agua', 'Agua 1', 'false'], ['mad-hisopado', 'Hisopado 1', 'false']]);
    expect([...cantAgua().querySelector('[data-mop-aguacomp]').options].map((o) => o.value)).toEqual(['', 'Colector', 'Salida UV']);
    expect([...cantAgua().querySelectorAll('[data-mop-aguapat]')].map((r) => r.dataset.mopAguapat)).toEqual(['totales', 'aero']);
    expect(cantAgua().querySelector('.mop-lab-kpi').textContent).toContain('3 muestras con cifra');
    expect(umbralesDe(aguaPat())).toEqual([500, 1000]);
    expect(cantAgua().textContent).toContain('umbrales de Maduración · RAS');
  });

  it('🔴 otro formato: sin Componente si no los tiene, y los umbrales de SU área; el foco se queda en su pastilla', async () => {
    await montar([...PLANTA, ...AGUA5]);
    abrirMicro();
    click(cantAgua().querySelector('[data-mop-aguafmt="mad-agua"]'));
    expect(cantAgua().querySelector('[data-mop-aguafmt="mad-agua"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(cantAgua().querySelector('[data-mop-aguafmt="mad-agua"]'));
    expect(cantAgua().querySelector('[data-mop-aguacomp]')).toBeNull();
    expect([...cantAgua().querySelectorAll('[data-mop-aguapat]')].map((r) => r.dataset.mopAguapat)).toEqual(['aero']);
    expect(umbralesDe(aguaPat())).toEqual([5000, 10000]);
  });

  it('🔴 el Componente recorta la tabla y el gráfico, y el foco se queda en su select', async () => {
    await montar([...PLANTA, ...AGUA5]);
    abrirMicro();
    cambiar(cantAgua().querySelector('[data-mop-aguacomp]'), 'Colector');
    expect([...cantAgua().querySelectorAll('[data-mop-aguapat]')].map((r) => r.dataset.mopAguapat)).toEqual(['totales']);
    expect(cantAgua().querySelector('.mop-lab-kpi').textContent).toContain('2 muestras con cifra');
    expect(document.activeElement).toBe(cantAgua().querySelector('[data-mop-aguacomp]'));
  });

  it('🔴 un patógeno se escoge con el ratón o con Intro, y el foco se queda en su fila', async () => {
    await montar([...PLANTA, ...AGUA5]);
    abrirMicro();
    click(cantAgua().querySelector('[data-mop-aguapat="aero"]'));
    expect(cantAgua().querySelector('[data-mop-aguapat="aero"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(cantAgua().querySelector('[data-mop-aguapat="aero"]'));
    expect(cantAgua().querySelector('.mop-micpat-graf h5').textContent).toContain('Aeromonas');
    cantAgua().querySelector('[data-mop-aguapat="totales"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(cantAgua().querySelector('[data-mop-aguapat="totales"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('🔑 los filtros de la ventana también valen aquí: un mes sin agua deja el bloque sin cantidades', async () => {
    await montar([...PLANTA, ...AGUA5, ...LAB5]);
    abrirMicro();
    cambiar(selLab('mes'), '2026-07');
    expect(cantAgua()).toBeNull();
    expect(makeChart.mock.calls.filter(([id]) => id === 'mopAguaPat').length).toBeGreaterThan(0);   // (antes, con septiembre, sí se dibujó)
  });
});

/* ============================================================
   0q·5c (2026-09-27, usuario) · 🦠 ③ Calidad de agua: los VALORES de un parámetro, su rango y su tendencia semanal

   Al escoger un parámetro (su fila; primero el que más sale de rango), sus valores (verde dentro, rojo fuera, gris sin
   rango), la mediana semanal y las rayas del mínimo y el máximo; y un Grupo, «Todos» por defecto (el rango es el mismo
   para todos). Las cuentas, en operativo.laboratorio.test.js.
   ============================================================ */
const CALQ = (fecha, extra) => ({ _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': fecha, Departamento: 'Maduración', ...extra });
const CAL5 = [
  CALQ('10/09/2026', { Formato: 'Maduración · RAS', Componente: 'Colector', pH: '9', Alcalinidad: '130' }),
  CALQ('12/09/2026', { Formato: 'Maduración · RAS', Componente: 'Colector', pH: '8', Alcalinidad: '135', Nitrito: '0.1' }),
  CALQ('14/09/2026', { Formato: 'Maduración · Agua', Sala: 'Sala 2', pH: '7', Alcalinidad: '100' }),
  CALQ('15/09/2026', { Formato: 'Maduración · RAS', Componente: 'Salida UV', Alcalinidad: '140', 'S‰': '32', Nitrito: '0' }),
];
const calPar = () => modalLab().querySelector('.mop-cal-par');
const grafCal = () => { const l = makeChart.mock.calls.filter(([id]) => id === 'mopCalPar'); return l.length ? l[l.length - 1][1] : null; };
const etiquetas = (cfg) => cfg.data.datasets.map((d) => d.label);
describe('Maduración · operativo · 🦠 ③ calidad de agua por parámetro (0q·5c)', () => {
  it('🔴 la tabla de parámetros (el que más sale de rango primero) y su gráfico: valores, mediana semanal y las dos rayas del rango', async () => {
    await montar([...PLANTA, ...CAL5]);
    abrirMicro();
    expect([...calPar().querySelectorAll('[data-mop-calpar]')].map((r) => r.dataset.mopCalpar)).toEqual(['ph', 'alc', 'nitrito', 'sal']);
    expect(calPar().querySelector('[data-mop-calpar="ph"]').getAttribute('aria-pressed')).toBe('true');
    expect(calPar().querySelector('[data-mop-calpar="sal"]').textContent).toContain('sin rango');
    expect(calPar().querySelector('.mop-lab-kpi').textContent.replace(/\s+/g, ' ')).toContain('3 muestras · mediana 8 · de 7 a 9 · 2 fuera de rango');
    const cfg = grafCal();
    expect(cfg.options.scales.y.type || 'linear').toBe('linear');
    expect(etiquetas(cfg)).toEqual(['Muestras', 'Mediana semanal', 'Mínimo', 'Máximo']);
    const [mu, , mi, ma] = cfg.data.datasets;
    expect([mi.data[0].y, ma.data[0].y]).toEqual([7.5, 8.5]);
    // El eje abarca los valores y el rango, con un 5 % de margen: de 7 a 9 → 6,9 a 9,1.
    expect([cfg.options.scales.y.min, cfg.options.scales.y.max].map((v) => Math.round(v * 100) / 100)).toEqual([6.9, 9.1]);
    expect(mu.data.map((p) => p.y)).toEqual([9, 8, 7]);
    expect(mu.pointBackgroundColor).toEqual(['#e8303e', '#1ec86a', '#e8303e']);
    expect(cfg.options.plugins.tooltip.callbacks.label({ dataset: mu, raw: mu.data[0] })).toBe('9 · FUERA del rango');
  });

  it('🔴 un parámetro con un solo límite dibuja sólo esa raya; y el foco se queda en su fila', async () => {
    await montar([...PLANTA, ...CAL5]);
    abrirMicro();
    click(calPar().querySelector('[data-mop-calpar="nitrito"]'));
    expect(document.activeElement).toBe(calPar().querySelector('[data-mop-calpar="nitrito"]'));
    expect(etiquetas(grafCal())).toEqual(['Muestras', 'Mediana semanal', 'Máximo']);
    // Visto en Chrome (TAN): el margen del eje no baja de 0 si ningún valor es negativo.
    expect(grafCal().options.scales.y.min).toBe(0);
  });

  it('🔴 sin rango: puntos grises, sin rayas, y la leyenda lo dice', async () => {
    await montar([...PLANTA, ...CAL5]);
    abrirMicro();
    click(calPar().querySelector('[data-mop-calpar="sal"]'));
    const cfg = grafCal();
    expect(etiquetas(cfg)).toEqual(['Muestras', 'Mediana semanal']);
    expect(cfg.data.datasets[0].pointBackgroundColor).toEqual(['#90a4ae']);
    const ley = cfg.options.plugins.legend.labels.generateLabels({ data: cfg.data, isDatasetVisible: () => true });
    expect(ley[0].text).toBe('Muestras (sin rango)');
  });

  it('🔴 el Grupo recorta la tabla y el gráfico, y el foco se queda en su select; con el teclado también se escoge', async () => {
    await montar([...PLANTA, ...CAL5]);
    abrirMicro();
    expect([...calPar().querySelector('[data-mop-calgrupo]').options].map((o) => o.value)).toEqual(['', 'Colector', 'Sala 2', 'Salida UV']);
    cambiar(calPar().querySelector('[data-mop-calgrupo]'), 'Colector');
    expect(document.activeElement).toBe(calPar().querySelector('[data-mop-calgrupo]'));
    expect(calPar().querySelector('[data-mop-calpar="ph"]').cells[1].textContent).toBe('2');
    calPar().querySelector('[data-mop-calpar="alc"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(calPar().querySelector('[data-mop-calpar="alc"]').getAttribute('aria-pressed')).toBe('true');
  });
});

/* ============================================================
   0q·6 (2026-09-27, usuario) · 🧬 Biomol · reproductores: sus PROPIOS filtros, la prevalencia POR LOTE y la tendencia de
   UN patógeno con sus muestras

   La misma barra que Microbiología sobre todo el registro; una tabla lote × patógeno sombreada por su %; y la tendencia
   semanal del patógeno escogido en la tabla de prevalencia (por defecto el más prevalente): barras de muestras analizadas
   y la línea del % de positivos, con las semanas de menos de 5 muestras en hueco («pocas muestras»).
   ============================================================ */
const BIOR = (fecha, lugar, extra = {}) => ({ _SheetOrigin: 'Biomol', Fecha: fecha, Lugar: lugar, 'Estadío': 'Reproductores', Piscina: 'P557', Sexo: 'Hembra', Tanque: 'Tq 1', ...extra });
const BIO6 = [
  BIOR('01/09/2026', 'Sala 3', { 'Código': 'Lote BN', Piscina: 'P554/556', IHHNV: 'Positivo', WSSV: 'Negativo' }),
  BIOR('02/09/2026', 'Sala 3', { 'Código': 'Lote BN', Sexo: 'Macho', IHHNV: 'Negativo' }),
  BIOR('09/09/2026', 'Sala 1', { 'Código': 'Lote BO', Piscina: 'P553', IHHNV: 'Negativo', EHP: 'Positivo' }),
  BIOR('10/09/2026', 'Sala 1', { 'Código': 'Lote BO', Piscina: 'P553', IHHNV: 'Negativo' }),
  BIOR('16/09/2026', 'Chongón', { Piscina: '', IHHNV: 'Positivo' }),
  BIOR('05/07/2026', 'Sala 3', { 'Código': 'Lote BN', IHHNV: 'Positivo' }),
];
const abrirBiomol = async () => {
  click(root.querySelector('[data-mop-lab="biomol"]'));
  await vi.waitFor(() => expect(root.querySelector('.mop-lab.sv-open [data-mop-labf]')).not.toBeNull());
};
const tendBio = () => { const l = makeChart.mock.calls.filter(([id]) => id === 'mopLabTend'); return l.length ? l[l.length - 1][1] : null; };
describe('Maduración · operativo · 🧬 Biomol: sus filtros, por lote y la tendencia de un patógeno (0q·6)', () => {
  it('🔴 la barra de filtros de la ventana, sobre TODO el registro (la de julio entra)', async () => {
    await montar([...PLANTA, ...BIO6]);
    await abrirBiomol();
    expect([...modalLab().querySelectorAll('[data-mop-labf]')].map((s) => s.dataset.mopLabf)).toEqual(['mes', 'lote', 'sala', 'piscina', 'sexo']);
    expect(kpiRep()).toContain('6 muestras');
    expect([...selLab('mes').options].map((o) => o.textContent)).toEqual(['Todo el registro', 'julio 2026', 'septiembre 2026']);
    expect(modalLab().querySelector('.mop-lab-per').textContent).toContain('combinada');
    expect(modalLab().textContent).not.toContain('con los filtros del tablero');
  });

  it('🔴 empieza con la sala del tablero; la piscina combinada cuenta en las dos', async () => {
    await montar([...PLANTA, ...BIO6]);
    cambiar(filtro('sala'), 'Sala 1');
    await abrirBiomol();
    expect(selLab('sala').querySelector('option[selected]').value).toBe('Sala 1');
    expect(kpiRep()).toContain('2 muestras');
    cambiar(selLab('sala'), '');
    cambiar(selLab('piscina'), 'Piscina 556');
    expect(kpiRep()).toContain('1 muestras');
  });

  it('🔴 la prevalencia por lote: lote × patógeno, cada celda sombreada por su %; la muestra sin lote, aparte', async () => {
    await montar([...PLANTA, ...BIO6]);
    await abrirBiomol();
    const filas = [...modalLab().querySelectorAll('.mop-bio-lotes tbody tr')];
    expect(filas.map((tr) => [tr.cells[0].textContent, tr.cells[1].textContent])).toEqual([['BN', '3'], ['BO', '2'], ['(sin lote)', '1']]);
    const ihhnv = [...modalLab().querySelectorAll('.mop-bio-lotes thead th')].findIndex((th) => th.textContent === 'IHHNV');
    expect(filas[0].cells[ihhnv].textContent).toBe('2/3');
    expect(filas[0].cells[ihhnv].classList.contains('mop-bio-p4')).toBe(true);
    expect(filas[1].cells[ihhnv].textContent).toBe('0/2');
    expect(filas[1].cells[ihhnv].classList.contains('mop-bio-p0')).toBe(true);
  });

  it('🔴 la tendencia es de UN patógeno (por defecto el más prevalente): barras de muestras y la línea del %, con «pocas muestras» en hueco', async () => {
    await montar([...PLANTA, ...BIO6]);
    await abrirBiomol();
    expect(modalLab().querySelector('[data-mop-biopat="EHP"]').getAttribute('aria-pressed')).toBe('true');
    click(modalLab().querySelector('[data-mop-biopat="IHHNV"]'));
    expect(document.activeElement).toBe(modalLab().querySelector('[data-mop-biopat="IHHNV"]'));
    expect(modalLab().textContent).toContain('Tendencia semanal · IHHNV');
    const cfg = tendBio();
    expect(cfg.data.datasets.map((d) => d.label)).toEqual(['Muestras analizadas', '% positivos']);
    expect(cfg.data.labels[0]).toBe('29/06');
    expect(cfg.data.labels.at(-1)).toBe('14/09');
    const [n, p] = cfg.data.datasets;
    const i = cfg.data.labels.indexOf('31/08');
    expect([n.data[i], p.data[i]]).toEqual([2, 50]);
    expect(p.pointBackgroundColor[i]).toBe('transparent');
    expect(p.data[cfg.data.labels.indexOf('06/07')]).toBe(null);
    expect(p.tooltip.callbacks.label({ dataIndex: i, raw: 50 })).toBe('% positivos: 50 % (1 de 2) · pocas muestras');
    expect(cfg.options.scales.y2.position).toBe('right');
    expect([n.yAxisID, p.yAxisID], 'las muestras en su eje (derecha); el %, de 0 a 100').toEqual(['y2', 'y']);
  });

  it('🔴 con el teclado (Intro) también se escoge el patógeno', async () => {
    await montar([...PLANTA, ...BIO6]);
    await abrirBiomol();
    modalLab().querySelector('[data-mop-biopat="IHHNV"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(modalLab().querySelector('[data-mop-biopat="IHHNV"]').getAttribute('aria-pressed')).toBe('true');
  });
});
