// @vitest-environment happy-dom
/* ============================================================
   SUPERVISOR · Traslado — el mapa REAL con Leaflet sustituido

   Banco propio porque necesita `vi.mock('leaflet')`, y eso se aplica a todo el
   archivo. Los otros dos de mapa NO pueden cubrir esto:
     · `trasladoMapa.test.js` prueba las funciones puras y nunca monta el mapa.
     · `trasladoMapaCiclo.test.js` sustituye el módulo ENTERO, así que lo que
       ejercita es la vista, no el mapa.

   Aquí se ejecuta `montarMapa` DE VERDAD con un doble mínimo de Leaflet, para poder
   probar lo único que vivía sin red: `filtrar()`, el método del que depende que el
   selector interno funcione en pantalla completa sin repintar. Lo destapó el banco
   `mutar-mapa-full` (F09 sobrevivía).

   🔑 El doble registra lo que se le pide —no dibuja nada— porque lo que puede estar
   MAL es qué contenido recibe cada popup, no que Leaflet sepa pintarlo.
   ============================================================ */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Doble mínimo de Leaflet: sólo los cinco constructores que usa el módulo. */
const marcadores = [];
const polilineas = [];

function marcadorFalso(latlng, opts) {
  const m = {
    latlng,
    opts,
    popup: null,
    addTo() { return m; },
    bindPopup(html) { m.popup = html; return m; },
    setPopupContent(html) { m.popup = html; return m; },
  };
  marcadores.push(m);
  return m;
}

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet', () => ({
  default: {
    map: () => ({
      fitBounds() {}, invalidateSize() {}, remove() {},
    }),
    tileLayer: () => ({ addTo() { return this; } }),
    polyline: (linea, opts) => {
      const pl = { linea, opts, addTo() { return pl; } };
      polilineas.push(pl);
      return pl;
    },
    marker: marcadorFalso,
    divIcon: (o) => o,
  },
}));

const { montarMapa } = await import('./trasladoMapa.js');

const parada = (rev, lat, lon, o2) => ({
  revision: rev, hora: '22:00', lugar: 'Peaje 1', lat, lon, obs: '',
  o2, temp: 26,
  tinas: { 1: { tina: 1, o2, temp: 26, act: 'Normal', alim: 'Artemia' } },
});
const camion = (placa, puntos) => ({ placa, paradas: puntos, puntos });

/* Dos camiones del MISMO viaje: paran en los mismos puntos, que es el caso real. */
const dosCamiones = () => ([
  camion('GSA-1147', [parada(1, -2.21, -80.98, 7.4), parada(2, -2.25, -80.94, 7.0)]),
  camion('PBX-0392', [parada(1, -2.21, -80.98, 6.9), parada(2, -2.25, -80.94, 6.5)]),
]);

const contenedor = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

beforeEach(() => {
  document.body.innerHTML = '';
  marcadores.length = 0;
  polilineas.length = 0;
});

describe('Traslado · el mapa montado de verdad', () => {
  it('🔴 dibuja UNA ruta y UN marcador por parada, no uno por camión', async () => {
    // Es el defecto del 2026-08-27 visto desde el otro lado: aquí se comprueba sobre
    // el mapa MONTADO, no sobre la función pura.
    const m = await montarMapa(contenedor(), dosCamiones());
    expect(m, 'el mapa no llegó a montarse').toBeTruthy();
    expect(polilineas, 'una ruta por camión volvería a superponerlas').toHaveLength(1);
    expect(marcadores, 'dos camiones × dos paradas darían 4 marcadores').toHaveLength(2);
  });

  it('🔴 cada popup nace con los DOS camiones', async () => {
    await montarMapa(contenedor(), dosCamiones());
    expect(marcadores[0].popup).toContain('GSA-1147');
    expect(marcadores[0].popup).toContain('PBX-0392');
  });

  it('🔴 `filtrar` acota los popups YA montados, sin volver a dibujar', async () => {
    /* Es el método del que depende el selector interno del mapa: en pantalla completa
       se acota EN SITIO porque repintar se llevaría el nodo y expulsaría al usuario.
       Si `filtrar` no pasara la placa, el mapa se quedaría con el camión anterior y
       nada lo diría. */
    const m = await montarMapa(contenedor(), dosCamiones());
    const antesPolilineas = polilineas.length;
    const antesMarcadores = marcadores.length;

    m.filtrar('PBX-0392');
    expect(marcadores[0].popup, 'el popup no se acotó').toContain('PBX-0392');
    expect(marcadores[0].popup, 'siguió mostrando el camión que no se pidió').not.toContain('GSA-1147');
    expect(marcadores[1].popup).toContain('PBX-0392');

    // Y no ha redibujado nada: la ruta es del viaje y el filtro no la toca.
    expect(polilineas, 'volvió a dibujar la ruta').toHaveLength(antesPolilineas);
    expect(marcadores, 'volvió a crear los marcadores').toHaveLength(antesMarcadores);
  });

  it('🔴 `filtrar(null)` devuelve los popups a TODOS los camiones', async () => {
    // Sin esto, «Todos» dejaría el mapa acotado al último camión elegido.
    const m = await montarMapa(contenedor(), dosCamiones());
    m.filtrar('PBX-0392');
    m.filtrar(null);
    expect(marcadores[0].popup).toContain('GSA-1147');
    expect(marcadores[0].popup).toContain('PBX-0392');
  });

  it('`invalidar` no revienta con el mapa montado', async () => {
    const m = await montarMapa(contenedor(), dosCamiones());
    expect(() => m.invalidar()).not.toThrow();
  });

  it('sin coordenadas no se monta nada y se dice por qué', async () => {
    const el = contenedor();
    const m = await montarMapa(el, [camion('A', [])]);
    expect(m).toBeNull();
    expect(el.textContent).toContain('Ninguna parada llegó con coordenadas');
  });
});
