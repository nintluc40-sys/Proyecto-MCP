/* ============================================================
   SERVICE WORKER · las reglas de enrutado (`public/sw.js`)

   El service worker es el único código del proyecto que puede dejar a un usuario
   viendo una versión ANTIGUA de la app durante días sin que nadie se entere. No hay
   forma de probarlo abriendo el navegador una vez: hay que ejercitar sus decisiones.

   Se carga el archivo REAL en un ámbito falso —`self`, `caches` y `fetch` de
   mentira— y se mira qué hace con cada petición. Lo que se vigila:

     · lo que NO intercepta: el POST al Apps Script y cualquier otro origen;
     · que `assets/` (con hash, inmutable) salga de caché sin tocar la red;
     · que el shell y `engine.js` vayan SIEMPRE a la red primero — es lo que impide
       que un despliegue de urgencia se quede sin llegar;
     · que sin conexión se sirva la copia guardada, y que la navegación caiga al
       shell (es lo que hace que la app abra en modo avión);
     · que un 404 NUNCA se guarde en caché.
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, Script } from 'node:vm';

const SW = join(process.cwd(), 'public/sw.js');
const ORIGEN = 'https://nintluc40-sys.github.io';
const BASE = ORIGEN + '/Proyecto-MCP/';

/** Caché de mentira, con la superficie que usa el service worker. */
function hacerCaches() {
  const almacenes = new Map();
  const abrir = (nombre) => {
    if (!almacenes.has(nombre)) almacenes.set(nombre, new Map());
    const m = almacenes.get(nombre);
    return {
      put: async (req, res) => { m.set(typeof req === 'string' ? new URL(req, BASE).href : req.url, res); },
      match: async (req) => m.get(typeof req === 'string' ? new URL(req, BASE).href : req.url),
      keys: async () => [...m.keys()],
    };
  };
  return {
    almacenes,
    api: {
      open: async (n) => abrir(n),
      keys: async () => [...almacenes.keys()],
      delete: async (n) => almacenes.delete(n),
    },
  };
}

/** Carga `public/sw.js` en un ámbito aislado y devuelve sus manijas. */
function montarSW({ red }) {
  const manejadores = {};
  const cachesFalso = hacerCaches();
  const llamadasRed = [];

  const self = {
    location: new URL(BASE + 'sw.js'),
    clients: { claim: async () => {} },
    addEventListener: (tipo, fn) => { manejadores[tipo] = fn; },
  };

  const fetchFalso = (req) => {
    const url = typeof req === 'string' ? req : req.url;
    llamadasRed.push(url);
    return red(url);
  };

  /* ⚠ `Request` de Node (undici) EXIGE una URL absoluta y rechaza `mode:'navigate'`.
     El service worker construye `new Request('./registros/engine.js', …)`, que en un
     navegador se resuelve contra el ámbito y aquí reventaría — dejando el precache
     vacío y las pruebas verdes por el motivo equivocado. Se usa un doble mínimo con
     lo único que el service worker lee de una petición. */
  function RequestFalso(input, init) {
    return {
      url: typeof input === 'string' ? new URL(input, BASE).href : input.url,
      method: (init && init.method) || 'GET',
      mode: (init && init.mode) || 'cors',
    };
  }

  const ctx = {
    self, caches: cachesFalso.api, fetch: fetchFalso,
    Request: RequestFalso, Response, URL, Promise, Error, Map, Set,
    setTimeout, clearTimeout, console,
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(readFileSync(SW, 'utf8')).runInContext(ctx);

  return { manejadores, cachesFalso, llamadasRed, self };
}

/** Dispara el manejador de `fetch` y devuelve lo que respondió (o null si NO se
 *  metió, que es una respuesta con significado propio: «lo resuelve el navegador»). */
async function pedir(sw, url, init) {
  const req = {
    url: new URL(url, BASE).href,
    method: (init && init.method) || 'GET',
    mode: (init && init.mode) || 'cors',
  };
  let respuesta = null;
  let interceptado = false;
  sw.manejadores.fetch({
    request: req,
    respondWith: (p) => { interceptado = true; respuesta = p; },
  });
  return { interceptado, res: interceptado ? await respuesta : null };
}

const ok = (cuerpo) => new Response(cuerpo || 'ok', { status: 200 });
const redOk = () => async () => ok();
const redCaida = () => async () => { throw new Error('sin conexión'); };

let sw;
beforeEach(() => { sw = null; });

/* ══════════════════════════════════════════════════════════
   LO QUE NO SE TOCA
   ══════════════════════════════════════════════════════════ */
describe('Service worker · lo que deja pasar sin tocar', () => {
  it('🔴 NO intercepta el POST al Apps Script', async () => {
    /* Es la regla más importante del archivo. La sincronización ya tiene su propia
       cola en `engine.js`; un service worker metiéndose en ese POST duplicaría el
       mecanismo, y ahí es donde se pierden datos de verdad. */
    sw = montarSW({ red: redOk() });
    const r = await pedir(sw, 'https://script.google.com/macros/s/AAA/exec', { method: 'POST', body: '{}' });
    expect(r.interceptado, 'el service worker se metió en el POST del GAS').toBe(false);
    expect(sw.llamadasRed, 'y ni siquiera lo tocó').toHaveLength(0);
  });

  it('🔴 NO intercepta NINGÚN método que no sea GET, ni del propio origen', async () => {
    sw = montarSW({ red: redOk() });
    for (const m of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const r = await pedir(sw, BASE + 'algo', { method: m });
      expect(r.interceptado, `interceptó un ${m} del propio origen`).toBe(false);
    }
  });

  it('🔴 NO intercepta otros orígenes: sus respuestas son OPACAS', async () => {
    /* Las fuentes de Google y cualquier CDN devuelven respuestas opacas: no se puede
       leer su estado, así que un 404 se cachearía como si fuera bueno y llenaría la
       cuota de basura. Sin conexión caen a las fuentes del sistema y ya está. */
    sw = montarSW({ red: redOk() });
    for (const u of ['https://fonts.googleapis.com/css2?family=Syne',
      'https://fonts.gstatic.com/s/a.woff2',
      'https://docs.google.com/spreadsheets/d/AAA/export']) {
      const r = await pedir(sw, u);
      expect(r.interceptado, 'interceptó ' + u).toBe(false);
    }
  });
});

/* ══════════════════════════════════════════════════════════
   LA ESTRATEGIA POR TIPO — el footgun
   ══════════════════════════════════════════════════════════ */
describe('Service worker · qué va a la red y qué sale de caché', () => {
  it('🔴 los `assets/` con hash salen de CACHÉ sin tocar la red', async () => {
    // Son inmutables: si cambia el contenido, cambia el nombre. Ir a la red por ellos
    // sería gastar datos en carretera para recibir exactamente lo mismo.
    sw = montarSW({ red: redOk() });
    const url = BASE + 'assets/index-B1JS8aUD.js';
    await (await sw.cachesFalso.api.open('mcp-v1')).put(url, ok('viejo pero válido'));

    const r = await pedir(sw, url);
    expect(r.interceptado).toBe(true);
    expect(await r.res.text()).toBe('viejo pero válido');
    expect(sw.llamadasRed, 'fue a la red por un archivo inmutable').toHaveLength(0);
  });

  it('🔴🔴 `engine.js` va SIEMPRE a la red primero, aunque esté cacheado', async () => {
    /* ESTA es la prueba que protege los despliegues de urgencia. `engine.js` no lleva
       hash en el nombre: si se sirviera de caché, un arreglo publicado para parar una
       pérdida de datos no llegaría nunca al chequeador que ya tiene la app abierta. */
    sw = montarSW({ red: async () => ok('recién publicado') });
    const url = BASE + 'registros/engine.js';
    await (await sw.cachesFalso.api.open('mcp-v1')).put(url, ok('la versión rota'));

    const r = await pedir(sw, url);
    expect(sw.llamadasRed, 'no fue a la red: serviría la versión vieja').toContain(url);
    expect(await r.res.text()).toBe('recién publicado');
  });

  it('🔴 el shell y los vendor también van a la red primero', async () => {
    sw = montarSW({ red: async () => ok('fresco') });
    for (const u of ['index.html', 'vendor/xlsx.full.min.js', 'vendor/d3.min.js',
      'registros/qrcode.js', 'manifest.webmanifest']) {
      sw.llamadasRed.length = 0;
      await pedir(sw, BASE + u);
      expect(sw.llamadasRed, u + ' no fue a la red').toHaveLength(1);
    }
  });
});

/* ══════════════════════════════════════════════════════════
   SIN CONEXIÓN
   ══════════════════════════════════════════════════════════ */
describe('Service worker · sin conexión', () => {
  it('🔴 sirve la copia guardada cuando la red se cae', async () => {
    sw = montarSW({ red: redCaida() });
    const url = BASE + 'registros/engine.js';
    await (await sw.cachesFalso.api.open('mcp-v1')).put(url, ok('copia guardada'));

    const r = await pedir(sw, url);
    expect(await r.res.text()).toBe('copia guardada');
  });

  it('🔴 abrir la app en modo avión sirve el shell guardado', async () => {
    /* Es lo que convierte esto en una app instalable de verdad: pulsar el icono en el
       camión, sin señal, y que arranque. Sin este camino, la pantalla queda en blanco
       y no hay nada que encolar porque no hay app. */
    sw = montarSW({ red: redCaida() });
    await (await sw.cachesFalso.api.open('mcp-v1')).put('./index.html', ok('<html>shell</html>'));

    const r = await pedir(sw, BASE, { mode: 'navigate' });
    expect(r.interceptado).toBe(true);
    expect(await r.res.text()).toBe('<html>shell</html>');
  });

  it('sin red y sin copia, el fallo se propaga (no se inventa una respuesta)', async () => {
    // Devolver un 200 vacío sería peor: la app creería que cargó algo.
    sw = montarSW({ red: redCaida() });
    await expect(pedir(sw, BASE + 'registros/engine.js')).rejects.toThrow();
  });

  it('🔴 con señal PÉSIMA no se espera indefinidamente: cae a la copia', async () => {
    /* En carretera lo normal no es «sin señal» sino «señal malísima». Sin el tope de
       tiempo, una petición colgada deja la app en blanco teniendo la copia al lado.
       ⚠ Esta prueba tarda lo que dure `TIMEOUT_RED` (4 s): es el precio de medirlo. */
    sw = montarSW({ red: () => new Promise(() => {}) });   // no resuelve jamás
    const url = BASE + 'registros/engine.js';
    await (await sw.cachesFalso.api.open('mcp-v1')).put(url, ok('copia guardada'));

    const r = await pedir(sw, url);
    expect(await r.res.text()).toBe('copia guardada');
  }, 15000);
});

/* ══════════════════════════════════════════════════════════
   QUÉ SE GUARDA Y QUÉ NO
   ══════════════════════════════════════════════════════════ */
describe('Service worker · lo que entra en la caché', () => {
  it('🔴 un 404 NUNCA se guarda', async () => {
    /* Cachear un error es peor que no cachear: se serviría como si fuera bueno, y sin
       conexión el usuario recibiría la página de error para siempre. */
    sw = montarSW({ red: async () => new Response('no está', { status: 404 }) });
    const url = BASE + 'registros/engine.js';
    await pedir(sw, url);
    const c = await sw.cachesFalso.api.open('mcp-v1');
    expect(await c.match(url), 'guardó un 404').toBeUndefined();
  });

  it('una respuesta buena sí se guarda, para la próxima vez sin conexión', async () => {
    sw = montarSW({ red: async () => ok('bueno') });
    const url = BASE + 'registros/engine.js';
    await pedir(sw, url);
    const c = await sw.cachesFalso.api.open('mcp-v1');
    expect(await c.match(url)).toBeTruthy();
  });
});

/* ══════════════════════════════════════════════════════════
   INSTALACIÓN Y ACTIVACIÓN
   ══════════════════════════════════════════════════════════ */
describe('Service worker · instalar y activar', () => {
  it('🔴 precachea `engine.js` y `qrcode.js`, que Vite no conoce', async () => {
    /* Se cargan con `loadScript()` y NO salen en el grafo de Vite: ninguna herramienta
       los añadiría sola. Si faltaran de la lista, Registros sería la única vista que
       no abre sin conexión — y es la que se usa en el camión. */
    sw = montarSW({ red: async () => ok() });
    let esperar;
    sw.manejadores.install({ waitUntil: (p) => { esperar = p; } });
    await esperar;

    const guardadas = await (await sw.cachesFalso.api.open('mcp-v1')).keys();
    const tiene = (s) => guardadas.some((k) => k.endsWith(s));
    expect(tiene('/registros/engine.js'), 'falta engine.js en el precache').toBe(true);
    expect(tiene('/registros/qrcode.js'), 'falta qrcode.js en el precache').toBe(true);
    expect(tiene('/vendor/xlsx.full.min.js')).toBe(true);
    expect(tiene('/vendor/d3.min.js')).toBe(true);
    expect(tiene('/index.html')).toBe(true);
  });

  it('🔴 si la RED se cae a media instalación, se guarda lo que se pudo', async () => {
    /* Es el caso real: la instalación descarga varios megas y la conexión se corta a
       la mitad. Con `Promise.all` (o `cache.addAll`) ese rechazo aborta la instalación
       ENTERA y el usuario se queda sin service worker ninguno — sin modo sin conexión,
       que es justo lo que había ido a buscar.

       ⚠ Esta prueba nació midiendo un 404 y no medía nada: un 404 es una respuesta
       RESUELTA, así que `Promise.all` se comportaba igual y la mutación S7 del banco
       sobrevivía. Lo que distingue `allSettled` de `all` es un RECHAZO. */
    sw = montarSW({
      red: async (url) => {
        if (url.includes('icon-512')) throw new Error('se cayó la conexión');
        return ok();
      },
    });
    let esperar;
    sw.manejadores.install({ waitUntil: (p) => { esperar = p; } });
    await expect(esperar).resolves.not.toThrow();

    const guardadas = await (await sw.cachesFalso.api.open('mcp-v1')).keys();
    expect(guardadas.some((k) => k.endsWith('/registros/engine.js')),
      'el corte de red se llevó por delante el resto del precache').toBe(true);
    expect(guardadas.some((k) => k.endsWith('icon-512.png'))).toBe(false);
  });

  it('🔴 un 404 durante la instalación tampoco se guarda', async () => {
    // Otro camino distinto: la red responde, pero con un error. Guardarlo dejaría al
    // usuario recibiendo la página de error para siempre estando sin conexión.
    sw = montarSW({
      red: async (url) => (url.includes('icon-512') ? new Response('', { status: 404 }) : ok()),
    });
    let esperar;
    sw.manejadores.install({ waitUntil: (p) => { esperar = p; } });
    await esperar;

    const guardadas = await (await sw.cachesFalso.api.open('mcp-v1')).keys();
    expect(guardadas.some((k) => k.endsWith('icon-512.png')), 'guardó un 404').toBe(false);
    expect(guardadas.some((k) => k.endsWith('/registros/engine.js'))).toBe(true);
  });

  it('🔴 al activar se borran las cachés de versiones anteriores', async () => {
    sw = montarSW({ red: async () => ok() });
    await sw.cachesFalso.api.open('mcp-v0');
    await sw.cachesFalso.api.open('otra-app');
    await sw.cachesFalso.api.open('mcp-v1');

    let esperar;
    sw.manejadores.activate({ waitUntil: (p) => { esperar = p; } });
    await esperar;

    expect([...sw.cachesFalso.almacenes.keys()]).toEqual(['mcp-v1']);
  });

  it('🔴 NO llama a skipWaiting: no se cambia de versión a media sesión', async () => {
    /* Activar el service worker nuevo con la app abierta dejaría la pestaña mezclando
       piezas de dos despliegues. El nuevo espera a que se cierre del todo.
       ⚠ Se miran sólo las líneas de CÓDIGO: el propio comentario de `sw.js` que
       explica esta decisión contiene la palabra, y sin quitar los comentarios la
       prueba fallaba por culpa de su propia documentación. */
    const sinComentarios = readFileSync(SW, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(sinComentarios).not.toMatch(/skipWaiting\s*\(/);
  });
});

describe('Service worker · el shell arranca sin conexión a la PRIMERA', () => {
  /* El defecto que esto vigila: en la primera visita el navegador ya había pedido el
     bundle antes de que el service worker tomara el control, así que no quedaba en
     caché. Instalar la app y pasar a modo avión daba una pantalla en blanco. */
  const HTML = '<!doctype html><html><head>'
    + '<link rel="stylesheet" href="./assets/index-BcMdhwcH.css">'
    + '<link rel="modulepreload" href="./assets/vendor-chart-awQ2Ix6y.js">'
    + '</head><body><script type="module" src="./assets/index-Bqe2E3Zz.js"></scr' + 'ipt></body></html>';

  const redConShell = () => async (url) => (
    url.indexOf('index.html') !== -1 || url.endsWith('/') ? ok(HTML) : ok('x'));

  async function instalar() {
    sw = montarSW({ red: redConShell() });
    let esperar;
    sw.manejadores.install({ waitUntil: (p) => { esperar = p; } });
    await esperar;
    return [...sw.cachesFalso.almacenes.values()][0];
  }

  it('🔴 los assets del shell quedan guardados en la instalación', async () => {
    const guardado = await instalar();
    const claves = [...guardado.keys()];
    ['index-Bqe2E3Zz.js', 'index-BcMdhwcH.css', 'vendor-chart-awQ2Ix6y.js'].forEach((a) => {
      expect(claves.some((k) => k.indexOf(a) !== -1),
        'sin ' + a + ' en caché la app no abre sin conexión').toBe(true);
    });
  });

  it('🔑 y entonces se sirven SIN red, como cualquier otro asset con hash', async () => {
    await instalar();
    // Se corta la red y se pide el bundle: tiene que salir de la copia guardada.
    const r = await pedir(sw, BASE + 'assets/index-Bqe2E3Zz.js');
    expect(r.interceptado).toBe(true);
    expect(r.res).toBeTruthy();
  });

  it('un shell sin assets no rompe la instalación', async () => {
    // Un index.html inesperado no puede dejar al usuario sin service worker.
    sw = montarSW({ red: () => async () => ok('<html></html>') });
    let esperar;
    sw.manejadores.install({ waitUntil: (p) => { esperar = p; } });
    await expect(esperar).resolves.not.toThrow();
  });
});
