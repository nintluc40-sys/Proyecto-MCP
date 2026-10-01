/* ============================================================
   SERVICE WORKER · Sistema MCP (T4b, 2026-08-25)

   Objetivo: que la app abra y funcione SIN CONEXIÓN. Los chequeadores trabajan de
   noche y en carretera, donde la cobertura va y viene; la cola de sincronización ya
   guarda lo que no se pudo enviar, pero si la propia app no carga no hay nada que
   encolar.

   ⚠⚠ EL FOOTGUN QUE ESTE ARCHIVO EVITA A PROPÓSITO
   Un service worker ingenuo cachea todo con «cache-first». Eso significa que el
   primer despliegue hecho para ARREGLAR algo —una pérdida de datos, por ejemplo—
   seguiría sirviendo la versión rota hasta que al usuario se le ocurriera vaciar la
   caché. Aquí la regla es por TIPO de archivo:

     · `assets/…` (los que Vite nombra con hash)  → CACHE-FIRST.
       Son inmutables por definición: si el contenido cambia, cambia el nombre. No
       hay forma de servir uno «viejo» equivocado.
     · todo lo demás del mismo origen               → NETWORK-FIRST con caída a caché.
       `index.html`, `registros/engine.js`, `registros/qrcode.js`, `vendor/…`, iconos
       y manifest NO llevan hash en el nombre: se piden a la red y sólo si falla —o
       tarda demasiado— se sirve la copia guardada. Con conexión, siempre lo último.

   ⚠ NO se toca NADA que no sea GET del mismo origen. En particular:
     · el POST al Apps Script — tiene su propia cola en `engine.js`, y duplicar ese
       mecanismo aquí es como se pierden datos;
     · las fuentes de Google y cualquier otro origen — su respuesta es OPACA (no se
       puede leer ni saber si fue un 404), y cachear opacas a ciegas llena la cuota
       con errores. Sin conexión, las fuentes caen a las del sistema y ya está.
   Por eso `xlsx` y `d3` se bajaron a `public/vendor/` el 2026-08-25: desde nuestro
   origen sí se pueden cachear y comprobar.

   ⚠ NO se llama a `skipWaiting()`. Un service worker nuevo que se activa a mitad de
   sesión dejaría la pestaña mezclando piezas de dos versiones. El nuevo espera a que
   la app se cierre del todo; mientras tanto, «network-first» ya garantiza que el
   contenido esté fresco.
   ============================================================ */

/* Nombre de la caché. Al cambiarlo, `activate` borra las anteriores.

   🔑 Olvidarse de subirlo es INOFENSIVO a propósito: como el shell es network-first,
   una caché vieja nunca sirve HTML ni `engine.js` obsoletos. Lo único que pasa es
   que se quedan sin barrer los `assets/` con hash de despliegues anteriores, que
   ocupan sitio y nada más. Se diseñó así para que el error más probable —no tocar
   esta línea— no pueda romper un despliegue de urgencia. */
const CACHE = 'mcp-v1';

/* Lo que se guarda al INSTALAR, para que la primera visita sin conexión ya funcione.
   Van las rutas SIN hash; las de `assets/` se guardan solas la primera vez que se
   piden, y como llevan hash nunca se sirve una equivocada.

   ⚠ `registros/engine.js` y `registros/qrcode.js` se cargan con `loadScript()` desde
   `views/registros/index.js`, así que NO salen en el grafo de Vite y ninguna
   herramienta los añadiría sola: si no estuvieran en esta lista, Registros sería la
   única vista que no abre sin conexión. */
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/xlsx.full.min.js',
  './vendor/d3.min.js',
  './registros/qrcode.js',
  './registros/engine.js',
  './icons/favicon-64.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/* Cuánto se espera a la red antes de tirar de la copia guardada. En carretera lo
   normal no es «sin señal» sino «señal pésima»: sin este tope, una petición que
   tarda medio minuto deja la app en blanco teniendo la copia al lado. */
const TIMEOUT_RED = 4000;

/* Tope de la INSTALACIÓN entera (2026-10-01). El navegador da por FALLIDA una instalación que pasa de 5 min y borra
   el registro: el equipo se queda sin service worker —sin modo sin conexión— y al volver lo intenta otra vez desde
   cero. Medido en la app publicada con la red a ~50 KB/s: «installing» 3,5 min con 7 archivos y el registro
   desapareció; reproducido en local con UNA descarga colgada: sin registro a los 306 s. Ninguna descarga tenía tope.
   Al cumplirse éste se cortan las que sigan en vuelo —y TODAS las peticiones de la instalación llevan esa señal, así
   que después no sale ninguna más— (`AbortController`: lo tiene todo navegador que corre el bundle, `es2019`) y la
   instalación termina con lo que haya guardado: lo que falte lo recoge el `fetch` la primera vez que se pida con red
   (`networkFirst` y `cacheFirst` guardan lo que sirven). 3 min: 2 de margen bajo el corte del navegador. */
const TOPE_INSTALACION = 180000;

/* Los `assets/` de Vite llevan HASH en el nombre, así que no se pueden escribir a
   mano en PRECACHE: cambian en cada despliegue. Se leen del `index.html` que se acaba
   de guardar, que es la única lista que no puede quedarse vieja.

   ⚠⚠ Sin esto la app NO arranca sin conexión hasta la SEGUNDA carga. En la primera el
   navegador ya había pedido el bundle ANTES de que este service worker tomara el
   control, así que esa petición no pasó por aquí y no quedó guardada: `index.html`
   sale de la caché pero su `<script>` falla y queda una pantalla en blanco. Y ocurre
   justo después de instalar, que es cuando más se parece a que la app está rota. */
async function assetsDelShell(cache) {
  const res = await cache.match('./index.html');
  if (!res) return [];
  const html = await res.text();
  const urls = new Set();
  // Vale cualquier atributo que apunte a un recurso: `src` del script y `href` del
  // CSS y del `modulepreload`, que también hace falta para arrancar sin red.
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].indexOf('assets/') !== -1) urls.add(m[1]);
  }
  /* Lo que ya está guardado —de una instalación anterior que se cortó— no se vuelve a pedir: con hash en el nombre,
     es exactamente lo mismo, y en carretera cada byte repetido es señal que no hay (2026-10-01). */
  const yaGuardados = await Promise.all([...urls].map((u) => cache.match(u)));
  return [...urls].filter((_, i) => !yaGuardados[i]);
}

/* Y TODO lo demás que emitió el build: la lista la escribe vite.config.js (listaDePrecache).
   Los bloques diferidos —Registros, Biología Molecular, el tablero de Maduración, el Worker de
   lectura del libro— no salen en index.html, así que `assetsDelShell` no los ve; sin esto, tras
   un despliegue, un equipo que no los abriera con red no podía abrirlos sin señal (P3,
   2026-10-01). Sólo se devuelve lo que aún NO está guardado: lo del shell no se pide dos veces. */
async function assetsDelBuild(cache, senal) {
  const res = await fetch(new Request('./precache-assets.json', { cache: 'no-cache' }), { signal: senal });
  if (!res || !res.ok) return [];
  const lista = await res.json();
  if (!Array.isArray(lista)) return [];
  const faltan = [];
  for (const url of lista) {
    if (typeof url !== 'string' || url.indexOf('assets/') === -1) continue;
    if (!(await cache.match(url))) faltan.push(url);
  }
  return faltan;
}

self.addEventListener('install', (e) => {
  /* La instalación termina con lo que haya llegado a guardar o al cumplirse TOPE_INSTALACION, lo que pase antes; al
     cumplirse, `corte` aborta las descargas que sigan en vuelo (también las que aún no empezaron). */
  const corte = new AbortController();
  let reloj;
  const tope = new Promise((resolve) => { reloj = setTimeout(() => { corte.abort(); resolve(); }, TOPE_INSTALACION); });
  e.waitUntil(Promise.race([tope, (async () => {
    const cache = await caches.open(CACHE);
    /* ⚠ `allSettled` y NO `cache.addAll`. `addAll` es atómico: un solo 404 —un icono
       que se renombró, un despliegue a medias— aborta la instalación entera y deja
       al usuario sin service worker ninguno. Aquí se guarda lo que se pueda y lo que
       falte lo recogerá el `fetch` la primera vez que haga falta.
       `no-cache` y NO `reload` (2026-10-01): el navegador PREGUNTA con su ETag y, si no cambió, Pages contesta 304 y
       no se repiten los bytes —la primera visita acaba de bajar index.html, SheetJS y el bundle—. Igual de fresco:
       `no-cache` nunca sirve una copia sin preguntar al servidor. */
    const guardar = async (url) => {
      const res = await fetch(new Request(url, { cache: 'no-cache' }), { signal: corte.signal });
      if (res && res.ok) await cache.put(url, res);
    };
    await Promise.allSettled(PRECACHE.map(guardar));
    /* Y los `assets/` que referencia el shell que se acaba de guardar. Va DESPUÉS y
       en su propia tanda porque necesita el `index.html` ya en caché para poder
       leerlo. Si algo falla —el shell no se guardó, el HTML no trae assets— se
       devuelve una lista vacía y la instalación sigue: quedarse sin service worker
       es peor que quedarse sin precache. */
    try {
      await Promise.allSettled((await assetsDelShell(cache)).map(guardar));
    } catch (_) { /* la instalación no se aborta por esto */ }
    /* Y el resto del build (bloques diferidos), en una tercera tanda: también puede faltar
       —una versión vieja sin lista, la red cortada— sin abortar la instalación. */
    try {
      await Promise.allSettled((await assetsDelBuild(cache, corte.signal)).map(guardar));
    } catch (_) { /* la instalación no se aborta por esto */ }
    clearTimeout(reloj);
  })()]));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.map((n) => (n === CACHE ? null : caches.delete(n))));
    // Toma el control de las pestañas ya abiertas. En la PRIMERA instalación esto
    // evita que la app se quede sin service worker hasta la siguiente recarga.
    await self.clients.claim();
  })());
});

/** Red con tope de tiempo. Si tarda más que `TIMEOUT_RED`, se rechaza y el que
 *  llama tira de caché — pero la petición sigue viva y su resultado se guarda. */
function redConTope(request, cache) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), TIMEOUT_RED);
    fetch(request).then((res) => {
      clearTimeout(t);
      // Sólo se guardan respuestas COMPLETAS y correctas. Un 404 o un 206 en caché
      // es peor que no tener nada: se serviría como si fuera bueno.
      if (res && res.ok && res.status === 200) cache.put(request, res.clone()).catch(() => {});
      resolve(res);
    }).catch((err) => { clearTimeout(t); reject(err); });
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    return await redConTope(request, cache);
  } catch (_) {
    const guardada = await cache.match(request, { ignoreSearch: true });
    if (guardada) return guardada;
    throw _;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(request);
  if (guardada) return guardada;
  const res = await fetch(request);
  if (res && res.ok && res.status === 200) cache.put(request, res.clone()).catch(() => {});
  return res;
}

/** Navegación sin conexión: se devuelve el shell guardado. Es lo que convierte la
 *  app en instalable de verdad — abrirla desde el icono, en avión, y que arranque. */
async function navegacion(request) {
  try {
    return await networkFirst(request);
  } catch (_) {
    const cache = await caches.open(CACHE);
    return (await cache.match('./index.html'))
      || (await cache.match('./'))
      || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // ⚠⚠ Todo lo que no sea GET del MISMO origen se deja pasar SIN tocar. Aquí caben
  // el POST al Apps Script (que ya tiene su cola) y las fuentes de Google (opacas).
  // No llamar a `respondWith` es literalmente «no me meto»: lo resuelve el navegador.
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') { e.respondWith(navegacion(req)); return; }

  // Los de Vite llevan hash en el nombre: inmutables, cache-first.
  if (url.pathname.includes('/assets/')) { e.respondWith(cacheFirst(req)); return; }

  // El resto del origen —shell, engine.js, vendor, iconos— network-first.
  e.respondWith(networkFirst(req));
});
