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
/* Lo que el mapa recibió por `filtrar()`: es la señal de que el filtro se aplicó EN
   SITIO y no repintando, que es la regla que sostiene el modo pantalla completa. */
const filtrados = [];
/* Lo que recibió `paradas()` (filtro «Paradas», 2026-09-30): también en sitio, sin repintar. */
const acotadas = [];

// Se conserva el módulo REAL (la vista pinta la lista de paradas con `paradasDelMapa`) y sólo
// se sustituye el montaje, que es lo que dibuja con Leaflet.
vi.mock('./trasladoMapa.js', async (original) => ({
  ...(await original()),
  COLORES_CAMION: ['#0f766e', '#b45309'],
  paradasSinGps: () => 0,
  montarMapa: async () => {
    const id = montados.length + 1;
    montados.push(id);
    return {
      invalidar() {},
      filtrar(placa) { filtrados.push(placa); },
      paradas(revs) { acotadas.push(revs); },
      destroy() { destruidos.push(id); },
    };
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
      hora: ['20:30', '22:00'][i], lugar: 'Peaje 1',
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
  filtrados.length = 0;
  acotadas.length = 0;
  document.body.className = '';
});

/* Elegir camión. Desde el 2026-08-27 el filtro es un `<select>` y no pastillas:
   cadena vacía = todos. El `change` mueve el estado y pide el repintado. */
const elegirCamion = (root, placa) => {
  const sel = root.querySelector('[data-tras-placa-sel]');
  sel.value = placa;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
};

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

    elegirCamion(root, 'PBX-0392');
    await esperar();
    expect(montados).toHaveLength(2);
    expect(destruidos, 'el primer mapa se quedó vivo').toEqual([1]);

    elegirCamion(root, '');
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
      elegirCamion(root, 'PBX-0392');
      await esperar();
      elegirCamion(root, '');
      await esperar();
    }
    expect(montados.length).toBe(21);
    expect(montados.length - destruidos.length, 'se acumularon mapas vivos').toBe(1);
  });
});

describe('Traslado · las escuchas NO se acumulan', () => {
  /* ⚠⚠ Hermana de la fuga de los mapas, y con el mismo disfraz. `document` y `root`
     SOBREVIVEN al repintado —lo que se va es el `innerHTML`—, así que las escuchas que
     cuelgan de ellos no mueren con el nodo del mapa. Sin cortarlas, cada clic en un
     filtro dejaba tres más (`fullscreenchange` x2 y `keydown`), cada una cerrada sobre
     un bloque y un mapa YA MUERTOS. Se cierran con un AbortController por montaje. */
  it('🔴 diez repintados no dejan diez escuchas de fullscreenchange', async () => {
    const vivas = new Set();
    const origAdd = document.addEventListener.bind(document);
    const origRem = document.removeEventListener.bind(document);
    document.addEventListener = (t, f, o) => {
      if (t === 'fullscreenchange') {
        vivas.add(f);
        if (o && o.signal) o.signal.addEventListener('abort', () => vivas.delete(f));
      }
      return origAdd(t, f, o);
    };
    document.removeEventListener = (t, f, o) => { if (t === 'fullscreenchange') vivas.delete(f); return origRem(t, f, o); };
    try {
      const c2 = ctx();
      const root = document.createElement('div');
      document.body.appendChild(root);
      root.addEventListener('click', (e) => { if (e.target.closest('[data-nav]')) montarVista(root, c2); });
      montarVista(root, c2);
      await esperar();
      expect(vivas.size, 'el primer montaje ya no registra su escucha').toBe(1);
      for (let i = 0; i < 10; i += 1) {
        elegirCamion(root, i % 2 ? '' : 'PBX-0392');
        await esperar();
      }
      expect(vivas.size, 'las escuchas se acumulan en cada repintado').toBe(1);
      resetTrasladoFiltro();
      expect(vivas.size, 'salir de la vista dejó la escucha viva').toBe(0);
    } finally {
      document.addEventListener = origAdd;
      document.removeEventListener = origRem;
    }
  });
});

describe('Traslado · el mapa a pantalla completa', () => {
  /* El botón usa la API nativa cuando existe y cae a una capa CSS cuando no —Safari
     de iPhone no da fullscreen de elementos arbitrarios, y esta vista se mira en el
     móvil en carretera—. happy-dom no implementa la API, así que lo que se ejercita
     aquí es EL RESPALDO, que es justo el camino que el navegador de pruebas no
     cubriría solo. */
  const conVista = async () => {
    const c2 = ctx();
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.addEventListener('click', (e) => { if (e.target.closest('[data-nav]')) montarVista(root, c2); });
    montarVista(root, c2);
    await esperar();
    return root;
  };
  const boton = (root) => root.querySelector('[data-tras-full]');
  const bloque = (root) => root.querySelector('.sv-tmap-blk');

  it('🔴 el botón existe y sólo aparece con el mapa montado', async () => {
    const root = await conVista();
    expect(boton(root), 'no hay botón de pantalla completa').toBeTruthy();
    expect(boton(root).getAttribute('aria-pressed')).toBe('false');
  });

  it('🔴 entra y sale, y lo dice en el rótulo y en aria-pressed', async () => {
    const root = await conVista();
    boton(root).click();
    expect(bloque(root).classList.contains('is-full'), 'no entró a pantalla completa').toBe(true);
    expect(boton(root).getAttribute('aria-pressed')).toBe('true');
    expect(boton(root).textContent).toContain('Salir');

    boton(root).click();
    expect(bloque(root).classList.contains('is-full'), 'no salió').toBe(false);
    expect(boton(root).getAttribute('aria-pressed')).toBe('false');
  });

  it('🔴 bloquea el scroll de la página detrás, y lo devuelve al salir', async () => {
    // Sin esto la página de debajo sigue moviéndose bajo la capa.
    const root = await conVista();
    boton(root).click();
    expect(document.body.classList.contains('sv-tmap-full-on')).toBe(true);
    boton(root).click();
    expect(document.body.classList.contains('sv-tmap-full-on'), 'el body se quedó bloqueado').toBe(false);
  });

  it('🔴 Esc sale de la capa', async () => {
    const root = await conVista();
    boton(root).click();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(bloque(root).classList.contains('is-full')).toBe(false);
    expect(document.body.classList.contains('sv-tmap-full-on')).toBe(false);
  });

  it('🔴 repintar deja el body DESBLOQUEADO aunque se saliera por el camino largo', async () => {
    /* El nodo del mapa se va con el `innerHTML` y el navegador saldría solo del modo
       nativo, pero la clase del `<body>` no se limpia sola: la página entera se
       quedaría sin scroll y sin nada que lo explicara. */
    const root = await conVista();
    boton(root).click();
    expect(document.body.classList.contains('sv-tmap-full-on')).toBe(true);
    elegirCamion(root, 'PBX-0392');
    await esperar();
    expect(document.body.classList.contains('sv-tmap-full-on'), 'el body quedó bloqueado tras repintar').toBe(false);
  });
});

describe('Traslado · el filtro de camión DENTRO del mapa', () => {
  const selMapa = (root) => root.querySelector('[data-tras-placa-mapa]');
  const selFuera = (root) => root.querySelector('[data-tras-placa-sel]');
  const elegirEnMapa = (root, placa) => {
    const s = selMapa(root);
    s.value = placa;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const conVista = async () => {
    const c2 = ctx();
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.addEventListener('click', (e) => { if (e.target.closest('[data-nav]')) montarVista(root, c2); });
    montarVista(root, c2);
    await esperar();
    return root;
  };

  it('🔴 trae las mismas placas que el filtro de arriba', async () => {
    const root = await conVista();
    const dentro = [...selMapa(root).options].map((o) => o.value);
    const fuera = [...selFuera(root).options].map((o) => o.value);
    expect(dentro, 'los dos filtros ofrecen camiones distintos').toEqual(fuera);
  });

  /* 2026-09-30 (usuario): «el filtro de camión del recorrido debe afectar SÓLO al mapa». Hasta ese día era
     el mismo filtro de la vista y, fuera de pantalla completa, la repintaba entera: con un solo camión la
     página se acortaba y la pantalla saltaba por encima del mapa. Las pruebas de aquí decían lo contrario
     («repinta, como el de arriba», «al salir se pone al día», «los dos filtros dicen lo mismo»). */
  it('🔴 acota el mapa EN SITIO y no repinta: KPI, tarjetas y el filtro de arriba no se mueven', async () => {
    const root = await conVista();
    expect(montados).toHaveLength(1);
    elegirEnMapa(root, 'PBX-0392');
    await esperar();
    expect(montados, 'repintó la vista (y con ella saltaba la pantalla)').toHaveLength(1);
    expect(destruidos, 'destruyó el mapa que se estaba mirando').toHaveLength(0);
    expect(filtrados, 'no se acotó el mapa en sitio').toEqual(['PBX-0392']);
    expect(root.querySelectorAll('.sv-tras-card'), 'el filtro del mapa llegó a las tarjetas').toHaveLength(2);
    expect(selFuera(root).value, 'el filtro del mapa movió el de arriba').toBe('');
    elegirEnMapa(root, '');
    expect(filtrados, '«Todos» devuelve los popups a todos los camiones').toEqual(['PBX-0392', null]);
  });

  it('🔴 tampoco cambia A ESCONDIDAS el filtro de la vista: el siguiente repintado sigue con todos', async () => {
    // Si moviera el estado (`_placaSola`) sin repintar, la vista saltaría a ese camión al repintar por otra causa.
    const root = await conVista();
    elegirEnMapa(root, 'PBX-0392');
    root.querySelector('[data-tras-repaint]').click();   // un repintado cualquiera
    await esperar();
    expect(root.querySelectorAll('.sv-tras-card'), 'la vista quedó filtrada por el selector del mapa').toHaveLength(2);
    expect(selFuera(root).value).toBe('');
  });

  it('🔴 EN pantalla completa tampoco repinta: no expulsa', async () => {
    const root = await conVista();
    root.querySelector('[data-tras-full]').click();
    elegirEnMapa(root, 'PBX-0392');
    await esperar();
    expect(montados, 'repintó y habría expulsado de pantalla completa').toHaveLength(1);
    expect(root.querySelector('.sv-tmap-blk').classList.contains('is-full'), 'se salió de pantalla completa').toBe(true);
    root.querySelector('[data-tras-full]').click();   // salir: no hay nada que poner al día
    await esperar();
    expect(montados, 'al salir repintó').toHaveLength(1);
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(2);
  });
});

describe('Traslado · el filtro «Paradas» del mapa (2026-09-30, usuario)', () => {
  const conVista = async () => {
    const c2 = ctx();
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.addEventListener('click', (e) => { if (e.target.closest('[data-nav]')) montarVista(root, c2); });
    montarVista(root, c2);
    await esperar();
    return root;
  };
  const casillas = (root) => [...root.querySelectorAll('[data-tras-paradas] [data-tras-par]')];
  const marcar = (c, on) => { c.checked = on; c.dispatchEvent(new Event('change', { bubbles: true })); };
  const rotulo = (root) => root.querySelector('[data-tras-par-n]').textContent;

  it('una casilla por parada con coordenadas, todas marcadas al abrir', async () => {
    const root = await conVista();
    expect(casillas(root).map((c) => [c.value, c.checked])).toEqual([['1', true], ['2', true]]);
    expect(rotulo(root)).toBe('Todas (2)');
    expect(root.querySelector('[data-tras-paradas]').textContent).toContain('Peaje 1');
  });

  it('🔴 desmarcar acota el mapa a las que quedan, EN SITIO y sin tocar la vista', async () => {
    const root = await conVista();
    marcar(casillas(root)[0], false);
    expect(acotadas, 'no se acotó el mapa').toEqual([[2]]);
    expect(rotulo(root)).toBe('1 de 2');
    await esperar();
    expect(montados, 'repintó la vista').toHaveLength(1);
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(2);
  });

  it('«Ninguna» y «Todas»: todas otra vez es `null` (sin filtro, encuadre del viaje)', async () => {
    const root = await conVista();
    root.querySelector('[data-tras-par-ninguna]').click();
    expect(rotulo(root)).toBe('0 de 2');
    root.querySelector('[data-tras-par-todas]').click();
    expect(acotadas).toEqual([[], null]);
    expect(rotulo(root)).toBe('Todas (2)');
    expect(casillas(root).every((c) => c.checked)).toBe(true);
  });
});
