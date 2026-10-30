// @vitest-environment happy-dom
/* ============================================================
   SUPERVISOR · salir de 🚚 Traslado suelta su mapa (2026-10-29, usuario: «Cerrarlo al salir»)

   `resetTrasladoFiltro` (traslado.js) suelta el mapa de Leaflet y las escuchas que cuelgan de `document`, pero nadie la
   llamaba fuera de las pruebas: sólo el repintado de la propia sub-vista soltaba el mapa anterior, así que el último se
   quedaba vivo hasta volver a entrar. Esto recorre la navegación REAL (`supervisorView` y sus `data-nav`), no la función.
   Banco propio por lo mismo que `trasladoMapaCiclo.test.js`: el `vi.mock` del mapa vale para todo el archivo.
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTrasladoPayload } from '../registros/lib/ficha-traslado.schema.js';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null,
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

const montados = [];
const destruidos = [];
/** Mientras sea una promesa, el montaje se queda «cargando» hasta que se cumpla (la primera descarga de Leaflet). */
let retener = null;
vi.mock('./trasladoMapa.js', async (original) => ({
  ...(await original()),
  COLORES_CAMION: ['#0f766e', '#b45309'],
  paradasSinGps: () => 0,
  montarMapa: async () => {
    const id = montados.length + 1;
    montados.push(id);
    if (retener) await retener;
    return { invalidar() {}, filtrar() {}, paradas() {}, destroy() { destruidos.push(id); } };
  },
}));

const { store, emit, EV } = await import('../../core/store.js');
const { supervisorView } = await import('./index.js');
const { resetTrasladoFiltro } = await import('./traslado.js');

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const tinasDe = () => Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7, 8].map((t) => ([t, { o2: 7.4, temp: 26, act: 'Alta', alim: 'Artemia' }])),
);
const viaje = () => ({
  id: 'tv1',
  data: {
    fecha: '2026-08-18', corrida: '555', modulo: 'M07', camaronera: 'Puná 1',
    salinidad: '31.5', horaSalida: '20:30', horaLlegada: '06:00',
    insumos: ['Artemia'], check: ['Linterna'],
    controlador: 'J', chequeador: 'P', recepcion: 'M',
    camiones: [{ placa: 'GSA-1147', tinasOff: [] }, { placa: 'PBX-0392', tinasOff: [] }],
    revisiones: [0, 1].map((i) => ({
      hora: ['20:30', '22:00'][i], lugar: 'Peaje 1',
      lat: -2.21 - i * 0.01, lon: -80.97 - i * 0.01, precision: 12, ubicacion: 'x',
      horaRegistro: 'x', obs: '',
      camiones: [{ tinas: tinasDe() }, { tinas: tinasDe() }],
    })),
  },
});
function datos() {
  const p = buildTrasladoPayload(viaje());
  const tras = p.rows.map((r) => {
    const o = { _SheetOrigin: 'Registro_Traslado' };
    p.headers.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
  // La corrida tiene que existir en Larvicultura: si no, `buildContext` la descarta (vState.corrida = null).
  const larv = ['10/08/2026', '12/08/2026'].map((f, i) => ({
    _SheetOrigin: 'Larvicultura', 'Módulo': 'M07', Corrida: '555', Tanque: 'TQ1', Lote: 'AB', Fecha: f,
    'Estadío': ['PL2', 'PL5'][i], 'Población': String(1000 - i * 100),
  }));
  return larv.concat(tras);
}

const esperar = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
/** Navega como lo hace la vista: un clic en un `[data-nav]` dentro de `root` (lo recoge su delegación). */
function ir(root, nav, extra = {}) {
  const b = document.createElement('button');
  b.dataset.nav = nav;
  Object.entries(extra).forEach(([k, v]) => { b.dataset[k] = v; });
  root.appendChild(b);
  b.click();
}
const placaElegida = (root) => root.querySelector('[data-tras-placa-sel]').value;
function elegirCamion(root, placa) {
  const sel = root.querySelector('[data-tras-placa-sel]');
  sel.value = placa;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

let root;
beforeEach(async () => {
  retener = null;
  resetTrasladoFiltro();
  document.body.innerHTML = '';
  store.globalData = datos();
  root = document.createElement('div');
  document.body.appendChild(root);
  supervisorView(root);
  ir(root, 'modules');
  // `vState` es del MÓDULO: si la prueba anterior acabó en Traslado, el primer pintado de arriba lanzó otro mapa, que
  // termina de cargar ya huérfano y se suelta solo. Se espera a que lo haga ANTES de poner los contadores a cero.
  await esperar();
  montados.length = 0;
  destruidos.length = 0;
  ir(root, 'traslado', { mod: 'M07', corrida: '555' });
  await esperar();
});

describe('Traslado · salir suelta el mapa', () => {
  it('entrar monta UN mapa (punto de partida)', () => {
    expect(root.querySelector('[data-tras-placa-sel]'), 'no se pintó Traslado').toBeTruthy();
    expect(montados).toEqual([1]);
    expect(destruidos).toEqual([]);
  });

  it('🔴 volver a Despacho lo suelta', () => {
    ir(root, 'despacho', { mod: 'M07' });
    expect(root.querySelector('[data-tras-placa-sel]')).toBeNull();
    expect(destruidos, 'el mapa siguió vivo tras salir a Despacho').toEqual([1]);
  });

  it('🔴 ir a otra vista de la app lo suelta', () => {
    emit(EV.VIEW, 'larvicultura');
    expect(destruidos, 'el mapa siguió vivo tras cambiar de vista').toEqual([1]);
  });

  it('🔴 ir a otra vista MIENTRAS el mapa aún carga también lo suelta, en cuanto termina de cargar', async () => {
    /* 2026-10-30 (auditoría de la ronda 12; usuario: «Sí, una línea + prueba»). Como el router (`router.js`): la vista vive
       en un `div` propio DENTRO del contenedor, y al cambiar se avisa (EV.VIEW) y DESPUÉS se vacía el contenedor; ese `div`
       sale de la página con el mapa dentro. Antes se miraba `root.contains(elMapa)` —seguía siendo cierto— y el mapa
       quedaba vivo hasta la siguiente navegación. */
    const contenedor = document.createElement('main');
    document.body.appendChild(contenedor);
    contenedor.appendChild(root);
    let soltar;
    retener = new Promise((r) => { soltar = r; });
    supervisorView(root);              // un repintado de Traslado: suelta el 1 y lanza el 2, que se queda cargando
    await esperar();
    expect(montados).toEqual([1, 2]);
    expect(destruidos).toEqual([1]);
    emit(EV.VIEW, 'larvicultura');     // el router: avisa…
    contenedor.innerHTML = '';         // …y vacía el contenedor
    soltar();                          // Leaflet termina de cargar
    await esperar();
    expect(root.isConnected, 'control: la vista ya no está en la página').toBe(false);
    expect(destruidos, 'el mapa que terminó de cargar fuera de la página siguió vivo').toEqual([1, 2]);
  });

  it('repintar Traslado (datos nuevos, el filtro) NO olvida el camión elegido; salir y volver, sí', async () => {
    elegirCamion(root, 'PBX-0392');
    await esperar();
    expect(placaElegida(root)).toBe('PBX-0392');
    supervisorView(root);              // el repintado de EV.DATA: misma sub-vista
    await esperar();
    expect(placaElegida(root), 'un repintado olvidó el camión').toBe('PBX-0392');
    expect(montados.length - destruidos.length, 'se acumulan mapas al repintar').toBe(1);
    ir(root, 'despacho', { mod: 'M07' });
    ir(root, 'traslado', { mod: 'M07', corrida: '555' });
    await esperar();
    expect(placaElegida(root), 'al volver seguía el camión de antes').toBe('');
    expect(montados.length - destruidos.length).toBe(1);
  });
});
