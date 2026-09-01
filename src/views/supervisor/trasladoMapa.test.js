// @vitest-environment happy-dom
/* ============================================================
   SUPERVISOR · Traslado — el mapa del recorrido

   Leaflet necesita medir el contenedor de verdad, algo que happy-dom no hace, así
   que aquí NO se arranca el mapa real: se prueba lo que decide qué se pinta —el
   encuadre, la ficha de cada punto, el conteo de paradas sin GPS— y la
   degradación cuando no hay coordenadas o la librería no carga.

   Ese reparto es deliberado: lo que puede estar MAL son los datos del punto y el
   encuadre. Que Leaflet dibuje un círculo ya lo prueba Leaflet.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  limitesDe, paradasSinGps, fichaPunto, fichaHtml, montarMapa, COLORES_CAMION,
  paradasDelMapa, paradaHtml,
} from './trasladoMapa.js';

const parada = (rev, lat, lon, extra) => ({
  revision: rev, hora: '22:00', lugar: 'Peaje 1', lat, lon,
  obs: (extra && extra.obs) || '',
  o2: (extra && extra.o2) !== undefined ? extra.o2 : 7.4,
  temp: (extra && extra.temp) !== undefined ? extra.temp : 26,
  tinas: {
    1: { tina: 1, o2: 7.4, temp: 26, act: 'Normal', alim: 'Artemia' },
    2: { tina: 2, o2: 7.4, temp: 26, act: 'Normal', alim: 'Artemia' },
  },
});
const camion = (placa, puntos) => ({ placa, paradas: puntos, puntos: puntos.filter((p) => p.lat !== null) });

describe('Traslado · encuadre del mapa', () => {
  it('🔴 los límites contienen TODOS los puntos de todos los camiones', () => {
    const cs = [
      camion('GSA-1147', [parada(1, -2.21, -80.98), parada(2, -2.25, -80.94)]),
      camion('PBX-0392', [parada(1, -2.19, -81.02)]),
    ];
    const [[sLat, oLon], [nLat, eLon]] = limitesDe(cs);
    expect(sLat).toBeCloseTo(-2.25, 6);
    expect(nLat).toBeCloseTo(-2.19, 6);
    expect(oLon).toBeCloseTo(-81.02, 6);
    expect(eLon).toBeCloseTo(-80.94, 6);
  });

  it('🔴 con longitudes NEGATIVAS el encuadre no se da la vuelta', () => {
    // Ecuador está a longitud negativa: un mínimo/máximo mal puesto encuadraría el
    // otro hemisferio y el mapa saldría en medio del océano Índico.
    const cs = [camion('A', [parada(1, -2.2135, -80.9791), parada(2, -2.2200, -80.9700)])];
    const lim = limitesDe(cs);
    expect(lim[0][1]).toBeLessThan(lim[1][1]);      // oeste < este
    expect(lim[0][1]).toBeCloseTo(-80.9791, 6);
    expect(lim[1][1]).toBeCloseTo(-80.97, 6);
  });

  it('sin puntos no hay encuadre que inventar', () => {
    expect(limitesDe([])).toBeNull();
    expect(limitesDe([camion('A', [])])).toBeNull();
  });
});

describe('Traslado · paradas sin señal', () => {
  it('🔴 se cuentan las que no tienen coordenadas', () => {
    // En carretera quedarse sin señal es normal. Inventarles posición sería peor
    // que no pintarlas, así que la vista dice cuántas faltan.
    const c = { placa: 'A', paradas: [parada(1, -2.2, -80.9), parada(2, null, null), parada(3, -2.3, -80.8)] };
    c.puntos = c.paradas.filter((p) => p.lat !== null);
    expect(paradasSinGps([c])).toBe(1);
  });

  it('con todas las paradas situadas no falta ninguna', () => {
    const c = camion('A', [parada(1, -2.2, -80.9), parada(2, -2.3, -80.8)]);
    expect(paradasSinGps([c])).toBe(0);
  });
});

describe('Traslado · la ficha de un punto', () => {
  it('🔴 lleva las cinco cosas que pidió el usuario', () => {
    const c = camion('GSA-1147', [parada(2, -2.2135, -80.9791, { obs: 'Tracto vacío.' })]);
    const f = fichaPunto(c, c.puntos[0]);
    expect(f.placa).toBe('GSA-1147');
    expect(f.revision).toBe(2);
    expect(f.o2).toBe(7.4);
    expect(f.temp).toBe(26);
    expect(f.actividad).toBe('Normal');
    expect(f.alimentacion).toBe('Artemia');
    expect(f.obs).toBe('Tracto vacío.');
  });

  it('resume sin repetir cuando todas las tinas coinciden', () => {
    const c = camion('A', [parada(1, -2.2, -80.9)]);
    const f = fichaPunto(c, c.puntos[0]);
    expect(f.actividad).toBe('Normal');            // no «Normal, Normal»
    expect(f.alimentacion).toBe('Artemia');
  });

  it('si las tinas difieren, la ficha las nombra todas', () => {
    const p = parada(1, -2.2, -80.9);
    p.tinas[2].act = 'Media';
    p.tinas[2].alim = 'Flake';
    const f = fichaPunto(camion('A', [p]), p);
    expect(f.actividad).toBe('Normal, Media');
    expect(f.alimentacion).toBe('Artemia, Flake');
  });

  it('🔴 lo que escribió el usuario no puede crear elementos en el DOM', () => {
    // Las observaciones y las placas son texto libre del chequeador y acaban en el
    // globo del mapa. La prueba de verdad no es que falte la cadena «onerror=»
    // —escapada sigue apareciendo como TEXTO, y es inofensiva— sino que al parsear
    // el HTML no nazca ningún elemento. Se monta y se cuenta.
    const p = parada(1, -2.2, -80.9, { obs: '<img src=x onerror="alert(1)">' });
    const h = fichaHtml(fichaPunto(camion('A"><script>bad()</script>', [p]), p));
    const box = document.createElement('div');
    box.innerHTML = h;
    expect(box.querySelectorAll('img'), 'la observación creó un <img>').toHaveLength(0);
    expect(box.querySelectorAll('script'), 'la placa creó un <script>').toHaveLength(0);
    // …y el texto sí se lee, tal cual lo escribió el usuario.
    expect(box.textContent).toContain('<img src=x');
    expect(box.textContent).toContain('<script>bad()</script>');
  });

  it('un punto sin medición muestra rayas, no ceros', () => {
    const p = parada(1, -2.2, -80.9, { o2: null, temp: null });
    const h = fichaHtml(fichaPunto(camion('A', [p]), p));
    expect(h).toContain('— mg/L');
    expect(h).toContain('— °C');
    expect(h).not.toContain('0.0 mg/L');
  });

  it('la ficha dice las coordenadas reales del punto', () => {
    const p = parada(1, -2.2135, -80.9791);
    const h = fichaHtml(fichaPunto(camion('A', [p]), p));
    expect(h).toContain('-2.21350');
    expect(h).toContain('-80.97910');
  });
});

describe('Traslado · el mapa degrada sin romper la vista', () => {
  it('🔴 sin coordenadas lo dice en vez de dejar un hueco', () => {
    const el = document.createElement('div');
    return montarMapa(el, [camion('A', [])]).then((m) => {
      expect(m).toBeNull();
      expect(el.textContent).toContain('Ninguna parada llegó con coordenadas');
    });
  });

  it('sin contenedor no revienta', () => montarMapa(null, []).then((m) => expect(m).toBeNull()));

  it('cada camión tiene su color, estable por posición', () => {
    expect(COLORES_CAMION.length).toBeGreaterThanOrEqual(4);
    expect(new Set(COLORES_CAMION).size).toBe(COLORES_CAMION.length);
    expect(COLORES_CAMION[0]).not.toBe(COLORES_CAMION[1]);
  });
});

describe('Traslado · LA RUTA ES DEL VIAJE, no del camión', () => {
  /* ⚠⚠ EL DEFECTO QUE ESTO CIERRA, medido el 2026-08-27.
     `Latitud` y `Longitud` tienen `grain: 'revision'` en el esquema: la coordenada es
     de la PARADA y la captura escribe la MISMA en la fila de cada camión, porque los
     camiones del viaje paran juntos.

     El mapa pintaba una polilínea y un juego de marcadores POR CAMIÓN. Con dos
     camiones, 4 de 4 puntos caían en la misma coordenada: dos líneas exactamente
     superpuestas y 8 marcadores en 4 posiciones. Sólo se veía el ÚLTIMO camión y su
     popup; el primero quedaba debajo, invisible. Es la misma familia de defecto que
     el KPI de observaciones: tratar un dato de grano PARADA como si fuera de camión. */
  const dosCamionesJuntos = () => [
    camion('GSA-1147', [parada(1, -2.21, -80.98, { o2: 7.4 }), parada(2, -2.25, -80.94, { o2: 7.0 })]),
    camion('PBX-0392', [parada(1, -2.21, -80.98, { o2: 6.9 }), parada(2, -2.25, -80.94, { o2: 6.5 })]),
  ];

  it('🔴 dos camiones en los mismos puntos dan UNA parada, no dos', () => {
    const ps = paradasDelMapa(dosCamionesJuntos());
    expect(ps, 'el mapa volvería a superponer marcadores').toHaveLength(2);
    expect(ps.map((p) => p.revision)).toEqual([1, 2]);
  });

  it('🔴 cada parada lleva a TODOS los camiones que pararon en ella', () => {
    // Es lo que sustituye a la ruta por camión: los datos se separan en el popup.
    const ps = paradasDelMapa(dosCamionesJuntos());
    expect(ps[0].camiones.map((c) => c.placa)).toEqual(['GSA-1147', 'PBX-0392']);
    expect(ps[0].camiones[0].o2).toBe(7.4);
    expect(ps[0].camiones[1].o2, 'se perdió el segundo camión').toBe(6.9);
  });

  it('🔴 el popup enseña a los dos camiones, con su color', () => {
    const h = paradaHtml(paradasDelMapa(dosCamionesJuntos())[0]);
    expect(h).toContain('GSA-1147');
    expect(h, 'el segundo camión no sale en el popup').toContain('PBX-0392');
    expect(h).toContain('7.4');
    expect(h).toContain('6.9');
    // Colores distintos: es lo que los distingue ahora que la ruta es una.
    expect(h).toContain(COLORES_CAMION[0]);
    expect(h).toContain(COLORES_CAMION[1]);
  });

  it('🔴 las paradas salen ORDENADAS por número, no por orden de lectura', () => {
    // Una hora mal tecleada no puede reordenar el recorrido dibujado.
    const cs = [
      camion('A', [parada(3, -2.30, -80.90), parada(1, -2.21, -80.98)]),
      camion('B', [parada(2, -2.25, -80.94)]),
    ];
    expect(paradasDelMapa(cs).map((p) => p.revision)).toEqual([1, 2, 3]);
  });

  it('un camión con una parada que al otro le falta NO se pierde', () => {
    const cs = [
      camion('A', [parada(1, -2.21, -80.98)]),
      camion('B', [parada(1, -2.21, -80.98), parada(2, -2.25, -80.94)]),
    ];
    const ps = paradasDelMapa(cs);
    expect(ps).toHaveLength(2);
    expect(ps[1].camiones.map((c) => c.placa)).toEqual(['B']);
  });

  it('🔴 acotado a un camión, el popup enseña SÓLO ese', () => {
    // Es lo único que el filtro puede acotar con honestidad: la ruta y los marcadores
    // son del VIAJE y no dependen de qué camión se mire.
    const h = paradaHtml(paradasDelMapa(dosCamionesJuntos())[0], 'PBX-0392');
    expect(h).toContain('PBX-0392');
    expect(h, 'se coló el camión que no se pidió').not.toContain('GSA-1147');
    expect(h).toContain('6.9');
    expect(h, 'se colaron las mediciones del otro').not.toContain('7.4');
  });

  it('🔴 sin acotar, siguen saliendo los dos', () => {
    // La guarda de la de arriba: si el filtro se aplicara siempre, aquella pasaría
    // igual y no probaría nada.
    const h = paradaHtml(paradasDelMapa(dosCamionesJuntos())[0]);
    expect(h).toContain('GSA-1147');
    expect(h).toContain('PBX-0392');
  });

  it('🔴 un camión que no paró ahí lo DICE, no sale vacío', () => {
    // Un popup en blanco se lee como un fallo de la app, no como un dato que falta.
    const h = paradaHtml(paradasDelMapa(dosCamionesJuntos())[0], 'NO-EXISTE');
    expect(h).toContain('no registró mediciones');
    expect(h).toContain('Parada 1');
  });

  it('escapa el contenido del popup', () => {
    const cs = [camion('A"><script>bad()</script>', [parada(1, -2.21, -80.98)])];
    const h = paradaHtml(paradasDelMapa(cs)[0]);
    expect(h).not.toContain('<script>bad()</script>');
  });
});
