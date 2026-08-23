// @vitest-environment happy-dom
/* ============================================================
   SUPERVISOR · Traslado — CICLO DE VIDA del mapa

   Banco propio porque necesita sustituir el módulo del mapa con `vi.mock`, y eso
   se aplica a todo el archivo: mezclarlo con `traslado.render.test.js` dejaría al
   resto de sus pruebas sin el mapa real.

   Lo que vigila es una FUGA, no un dibujo. La primera versión sólo destruía el
   mapa si su contenedor ya estaba desprendido al resolverse la promesa — y en el
   uso normal no lo está: el mapa monta y sólo DESPUÉS el usuario pulsa un filtro,
   momento en que `innerHTML` se lleva el contenedor. Cada clic dejaba una
   instancia de Leaflet viva, con sus escuchas de `resize` sobre un nodo huérfano.
   Se acumulaban en silencio, que es como se acumulan las fugas.
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTrasladoPayload } from '../registros/lib/ficha-traslado.schema.js';

const montados = [];
const destruidos = [];

vi.mock('./trasladoMapa.js', () => ({
  COLORES_CAMION: ['#0f766e', '#b45309'],
  paradasSinGps: () => 0,
  montarMapa: async () => {
    const id = montados.length + 1;
    montados.push(id);
    return { destroy() { destruidos.push(id); } };
  },
}));

const { renderTraslado, resetTrasladoFiltro } = await import('./traslado.js');

function aFilas(payload) {
  return payload.rows.map((r) => {
    const o = { _SheetOrigin: 'Registro_Traslado' };
    payload.headers.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
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
      hora: ['20:30', '22:00'][i], lugar: 'Peaje',
      lat: -2.21 - i * 0.01, lon: -80.97 - i * 0.01, precision: 12, ubicacion: 'x',
      horaRegistro: 'x', obs: '',
      camiones: [{ tinas: tinasDe() }, { tinas: tinasDe() }],
    })),
  },
});

const ctx = () => ({
  data: aFilas(buildTrasladoPayload(viaje())),
  allMods: ['M07'],
  vState: { corrida: '555' },
});

function montarVista(root, c) {
  const r = renderTraslado(c, 'M07');
  root.innerHTML = r.html;
  if (r.after) r.after(root, c);
}

const esperar = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  document.body.innerHTML = '';
  // ⚠ El ORDEN importa: `_mapaActivo` es estado de MÓDULO y sobrevive entre
  // pruebas. Hay que soltarlo ANTES de poner los contadores a cero, o su `destroy`
  // se cuenta en la prueba siguiente y descuadra el balance montados/destruidos.
  resetTrasladoFiltro();
  montados.length = 0;
  destruidos.length = 0;
});

describe('Traslado · el mapa no se acumula al repintar', () => {
  it('🔴 cada repintado destruye el mapa anterior', async () => {
    const c = ctx();
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.addEventListener('click', (e) => { if (e.target.closest('[data-nav]')) montarVista(root, c); });

    montarVista(root, c);
    await esperar();
    expect(montados).toHaveLength(1);
    expect(destruidos).toHaveLength(0);

    root.querySelector('[data-tras-placa="PBX-0392"]').click();
    await esperar();
    expect(montados).toHaveLength(2);
    expect(destruidos, 'el primer mapa se quedó vivo').toEqual([1]);

    root.querySelector('[data-tras-placa="*"]').click();
    await esperar();
    expect(montados).toHaveLength(3);
    expect(destruidos).toEqual([1, 2]);

    // Sólo queda vivo el último: montados − destruidos === 1.
    expect(montados.length - destruidos.length).toBe(1);
  });

  it('🔴 salir de la vista suelta el último mapa', async () => {
    const c = ctx();
    const root = document.createElement('div');
    document.body.appendChild(root);
    montarVista(root, c);
    await esperar();
    expect(destruidos).toHaveLength(0);
    resetTrasladoFiltro();          // lo que se llama al abandonar la sub-vista
    expect(destruidos, 'el mapa siguió vivo tras salir').toEqual([1]);
  });

  it('diez repintados dejan un solo mapa vivo, no diez', async () => {
    const c = ctx();
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.addEventListener('click', (e) => { if (e.target.closest('[data-nav]')) montarVista(root, c); });
    montarVista(root, c);
    await esperar();
    for (let i = 0; i < 10; i += 1) {
      root.querySelector('[data-tras-placa="PBX-0392"]').click();
      await esperar();
      root.querySelector('[data-tras-placa="*"]').click();
      await esperar();
    }
    expect(montados.length).toBe(21);
    expect(montados.length - destruidos.length, 'se acumularon mapas vivos').toBe(1);
  });
});
