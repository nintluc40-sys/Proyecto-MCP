import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/* Lista de TODO lo que el build emite bajo assets/ (P3 del plan de carga y refresco, 2026-10-01),
   en `precache-assets.json`, para que el service worker lo guarde al INSTALARSE. Los bloques
   diferidos —Registros, Biología Molecular, el tablero de Maduración, el Worker de lectura del
   libro y, desde el 2026-10-23, las siete vistas de cada día (`ui/vistaDiferida.js`)— no salen en
   index.html: sin esta lista, tras un despliegue, un equipo que no los abriera con red no podía
   abrirlos sin señal. La lee public/sw.js (assetsDelBuild).
   2026-10-03 · `order: 'post'`: el `generateBundle` de un plugin normal corre ANTES que el de `vite:css-post`, que
   después BORRA los trozos JS que sólo importaban CSS (el de Leaflet). La lista anunciaba así un `leaflet-*.js` que no
   existía (404 en Pages; `tras-despliegue` en 13/14). En `post`, la lista sale del bundle ya definitivo.
   2026-10-04 (usuario) · 🏭 Planta NO va en la lista: su bloque (three.js y la maqueta, ~600 kB) sólo lo necesita quien
   abre la vista (rol Gerencia), y lo descargaban todos los equipos al instalarse. Fuera, el trozo cuya entrada es
   src/views/planta/index.js y el CSS que importa; lo que comparte con otras vistas sigue en la lista. El service worker
   lo guarda la primera vez que se pide (cacheFirst de assets/): sin señal, abre si ya se abrió una vez con señal desde
   su última actualización.
   2026-10-05 · y la página del QR de acceso de Gerencia (src/views/planta/qr/index.js), que también usa three.js. Con
   dos bloques que lo usan, three.js pasa a un trozo COMPARTIDO: por eso la regla es de alcance — queda fuera todo trozo
   al que sólo se llega pasando por un bloque excluido (y su CSS), y entra lo que la app alcanza sin pasar por ellos. */
export const ENTRADAS_FUERA_DE_PRECACHE = [/\/src\/views\/planta\/index\.js$/, /\/src\/views\/planta\/qr\/index\.js$/];
function listaDePrecache() {
  return {
    name: 'mcp-precache-assets',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        // 2026-10-05 (📊 Análisis de Planta) · Rollup puede FUSIONAR una entrada diferida con lo que comparte con sus propios
        // bloques diferidos (Planta con su escena y Análisis): ese trozo sale SIN facadeModuleId (medido: null) y la regla
        // dejaba de verlo, así que three.js, la escena y Análisis entraban en la lista. Se reconoce también por los módulos
        // que lleva, si es una entrada diferida.
        const esFuera = (id) => !!id && ENTRADAS_FUERA_DE_PRECACHE.some((re) => re.test(String(id).replace(/\\/g, '/')));
        const excluido = (c) => !!c && (esFuera(c.facadeModuleId) || (!!c.isDynamicEntry && (c.moduleIds || Object.keys(c.modules || {})).some(esFuera)));
        const cssDe = (c) => [...((c.viteMetadata && c.viteMetadata.importedCss) || [])];
        // lo que la app alcanza desde sus entradas sin pasar por un bloque excluido (importaciones estáticas y dinámicas)
        const alcanzado = new Set(), pila = Object.keys(bundle).filter((f) => bundle[f].type === 'chunk' && bundle[f].isEntry && !excluido(bundle[f]));
        while (pila.length) {
          const f = pila.pop(), c = bundle[f];
          if (alcanzado.has(f) || !c || c.type !== 'chunk' || excluido(c)) continue;
          alcanzado.add(f); cssDe(c).forEach((css) => alcanzado.add(css));
          pila.push(...(c.imports || []), ...(c.dynamicImports || []));
        }
        const fuera = new Set();
        for (const [f, c] of Object.entries(bundle)) if (c.type === 'chunk' && !alcanzado.has(f)) { fuera.add(f); cssDe(c).forEach((css) => { if (!alcanzado.has(css)) fuera.add(css); }); }
        const lista = Object.keys(bundle).filter((f) => f.startsWith('assets/') && !fuera.has(f)).sort().map((f) => './' + f);
        this.emitFile({ type: 'asset', fileName: 'precache-assets.json', source: JSON.stringify(lista) });
      },
    },
  };
}

/* 2026-10-24 (usuario, «guardián en la build») · LAS VISTAS DIFERIDAS, EN LA PRECARGA DE LA BUILD REAL. La regla de arriba
   se prueba con builds inventadas (sw.test.js) y main.js con su texto (ui/vistasDiferidas.test.js), pero nada ataba la
   build DE VERDAD: si Rollup fusionara una vista con lo que comparte con Planta —ya fusionó la entrada de Planta el
   2026-10-05— o una exclusión quedara mal escrita, el bloque de esa vista saldría de la lista sin ningún rojo, y tras un
   despliegue un equipo sin señal no podría abrirla. Por eso, con la lista ya hecha, cada `import('./views/…')` de
   src/main.js que no sea de ENTRADAS_FUERA_DE_PRECACHE (Planta y el QR) tiene que estar en un bloque de la lista: si no
   está en ninguno, o el suyo no entra, la build FALLA. Hoy son nueve: las siete de cada día, Biología Molecular y
   Registros. */
/** Las rutas de los `import('./views/…')` de un main.js (sin contar los comentarios), en su orden. */
export function importsDeVistas(src) {
  const codigo = String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return [...codigo.matchAll(/import\(\s*'(\.\/views\/[^']+)'\s*\)/g)].map((m) => m[1]);
}
/** Las vistas diferidas (rutas absolutas de sus módulos) que NO están en la precarga `lista` (los archivos tal como los
    nombra el bundle, sin «./»): un texto por cada una. Las de ENTRADAS_FUERA_DE_PRECACHE no se exigen. */
export function vistasFueraDeLaPrecarga(bundle, lista, rutas) {
  const norma = (p) => String(p).replace(/\\/g, '/').toLowerCase();
  const enLista = new Set(lista);
  const faltan = [];
  for (const ruta of rutas) {
    const n = norma(ruta);
    if (ENTRADAS_FUERA_DE_PRECACHE.some((re) => re.test(n))) continue;
    const nombre = n.includes('/src/') ? n.slice(n.lastIndexOf('/src/') + 1) : n;
    const bloque = Object.values(bundle).find((c) => c && c.type === 'chunk' &&
      (c.moduleIds || Object.keys(c.modules || {})).some((id) => norma(id) === n));
    if (!bloque) faltan.push(`${nombre}: no está en ningún bloque de la build`);
    else if (!enLista.has(bloque.fileName)) faltan.push(`${nombre}: su bloque (${bloque.fileName}) no está en precache-assets.json`);
  }
  return faltan;
}
function vistasEnLaPrecarga() {
  let root = null;
  return {
    name: 'mcp-precache-vistas',
    apply: 'build',
    configResolved(c) { root = c.root; },
    // después de `mcp-precache-assets` (va detrás en `plugins` y los dos en `post`): la lista ya está en el bundle
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const rutas = importsDeVistas(readFileSync(join(root, 'src/main.js'), 'utf8')).map((r) => resolve(root, 'src', r));
        if (!rutas.length) throw new Error("precarga: src/main.js no tiene ningún import('./views/…'): el guardián no vigilaría nada");
        const json = bundle['precache-assets.json'];
        if (!json) throw new Error('precarga: no se emitió precache-assets.json');
        const texto = typeof json.source === 'string' ? json.source : Buffer.from(json.source).toString('utf8');
        const faltan = vistasFueraDeLaPrecarga(bundle, JSON.parse(texto).map((f) => f.replace(/^\.\//, '')), rutas);
        if (faltan.length) {
          throw new Error(`precarga: ${faltan.length} vista(s) diferida(s) FUERA de la lista (sin señal no abrirían tras un despliegue): ${faltan.join(' · ')}`);
        }
      },
    },
  };
}

/* B1 (2026-10-19, usuario) · LA HUELLA DEL BUILD. Una pestaña o una PWA abierta no se enteraba nunca de un despliegue
   nuevo, y `public/sw.js` era idéntico en cada uno, así que el navegador no instalaba nunca otro service worker (y la
   lista de bloques diferidos de arriba sólo se lee al instalar). Al terminar de escribir `dist/`, se calcula un hash
   del CONTENIDO de todo lo emitido —también de lo que no lleva hash en el nombre: `registros/engine.js`, `vendor/`— y
   se escribe en tres sitios: `version.json` (lo que pregunta la página), la `<meta name="mcp-build">` de index.html
   (la versión que corre la página) y la línea `BUILD` de sw.js (para que cambie y se reinstale). Se calcula ANTES de
   sellar, sobre los archivos con 'sin-sellar', así que el mismo código da la misma huella: un despliegue que no cambia
   nada (un commit sólo de documentación) no avisa a nadie. Si falta una de las marcas, el build FALLA: sellar a medias
   sería volver a callar. Lo lee src/ui/versionNueva.js. */
export const SIN_SELLAR = 'sin-sellar';
const SELLOS = [
  ['sw.js', "const BUILD = 'sin-sellar';", (h) => `const BUILD = '${h}';`],
  ['index.html', '<meta name="mcp-build" content="sin-sellar"', (h) => `<meta name="mcp-build" content="${h}"`],
];
/** Huella de una lista de [ruta, contenido]: la misma con los mismos archivos, en cualquier orden. */
export function huellaDeArchivos(archivos) {
  const h = createHash('sha256');
  for (const [ruta, datos] of [...archivos].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    h.update(ruta); h.update('\0'); h.update(datos); h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}
/** Sella el build escrito en `dir` y devuelve su huella. */
export function sellarBuild(dir) {
  const archivos = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath || d.path, d.name))
    .map((p) => [relative(dir, p).replace(/\\/g, '/'), readFileSync(p)])
    .filter(([ruta]) => ruta !== 'version.json');
  const huella = huellaDeArchivos(archivos);
  for (const [ruta, marca, sello] of SELLOS) {
    const p = join(dir, ruta), txt = readFileSync(p, 'utf8');
    if (txt.split(marca).length !== 2) throw new Error(`huella del build: «${marca}» tiene que salir UNA vez en ${ruta}`);
    writeFileSync(p, txt.replace(marca, sello(huella)));
  }
  writeFileSync(join(dir, 'version.json'), JSON.stringify({ build: huella }));
  return huella;
}
function huellaDelBuild() {
  let dir = null;
  return {
    name: 'mcp-huella-build',
    apply: 'build',
    configResolved(c) { dir = resolve(c.root, c.build.outDir); },
    writeBundle: { order: 'post', sequential: true, handler() { sellarBuild(dir); } },
  };
}

/* 2026-10-02 (usuario) · LOS NAVEGADORES PARA LOS QUE SE ESCRIBE EL CSS: los de la época de es2019. Con `target:
   'es2019'` solo, esbuild da por soportado todo el CSS y deja `inset` tal cual —y hasta junta top/right/bottom/left a 0
   en `inset:0`—, que no existe antes de Chrome 87 / Safari 14.1: ahí los modales a pantalla completa se rompían. Con
   navegadores, lo traduce a los cuatro lados en TODO el CSS, también en el que se escriba mañana (medido: además sólo
   añade prefijos —-webkit-sticky, backdrop-filter, user-select, clip-path, appearance—). Lo vigila sinInset.test.js. */
export const CSS_NAVEGADORES = ['chrome73', 'edge79', 'firefox66', 'safari12.1'];

// Configuración mínima y limpia. El build genera assets optimizados en /dist.
export default defineConfig(({ command }) => ({
  // `base` DEBE depender del comando:
  //   · build → './'  (rutas relativas: el HTML compilado abre desde cualquier
  //     subruta e incluso file://).
  //   · dev   → '/'   (rutas absolutas). Con base relativa el dev server puede
  //     resolver mal los import() DINÁMICOS y lanzar en el navegador
  //     "Failed to fetch dynamically imported module" — justo las vistas de carga
  //     diferida (Registros, Biología Molecular, Planta y, desde el 2026-10-23, las
  //     de `ui/vistaDiferida.js`). Es un footgun conocido de Vite.
  base: command === 'build' ? './' : '/',
  plugins: [listaDePrecache(), vistasEnLaPrecarga(), huellaDelBuild()],
  server: {
    port: 5173,
    open: true,
    // Pre-transforma al ARRANCAR estas dos vistas de carga diferida (y su grafo). Nació el
    // 2026-07-07 (83f4afe) para que Vite optimizara las dependencias UNA sola vez al inicio,
    // en lugar de re-optimizar a mitad de sesión la primera vez que se abrían —esa
    // re-optimización aborta las peticiones de módulo en vuelo y produce el "Failed to
    // fetch dynamically imported module"—. ⚠ Medido el 2026-10-23 (Vite 5.4, bloque 4,
    // tarea 7): el escáner de dependencias YA sigue los import() literales y optimiza al
    // arrancar las de TODAS las vistas diferidas (chart.js, leaflet, qrcode-generator,
    // three y sus dos extras); pedir después sus módulos no re-optimiza nada. Por eso las
    // demás vistas diferidas no están aquí: añadirlas sólo adelantaría su primera apertura
    // en desarrollo. Un import() CALCULADO (con una variable) sí escaparía al escáner.
    // El warmup no cambia el bundle, sólo el calentamiento del dev.
    warmup: {
      clientFiles: [
        './src/views/biomolecular/index.js',
        './src/views/registros/index.js',
      ],
    },
  },
  test: {
    /* 2026-10-22 (pauta 13, usuario) · el tope de cada prueba, 20 s en vez de los 5 s de vitest. Sólo cae por él una prueba
       ASÍNCRONA, y con la máquina cargada (la CI, o la suite en paralelo) una de 2–3 s pasaba de 5: rojos falsos que paran
       el despliegue (medidos el 2026-09-18, ast-payload.test.js; el 09-27, la primera de operativo.view.test.js; el 10-19,
       tres de «lo del laboratorio»). Antes se ponía un plazo propio prueba a prueba (de 15 a 120 s; aquí ponía «hay 27» y ya eran más): siguen
       valiendo, y éste cubre a las demás y a las nuevas. Los ganchos conservan sus 10 s. El RELOJ no era el problema: la
       suite entera pasa con «ahora» desplazado a la madrugada en UTC, a un cambio de año y a un año más. */
    testTimeout: 20000,
    poolOptions: {
      /* ⚠ `traslado-captura.test.js` arranca el monolito ENTERO sobre happy-dom y
         corre decenas de pruebas que repintan la ficha completa en cada una. Desde el
         guardado por revisión (2026-08-25) la validación dejó de bloquear, así que
         muchas más pruebas llegan a GUARDAR —y por tanto a repintar—, y el worker se
         pasaba del heap por defecto (~2 GB): moría con «Ineffective mark-compacts»
         llevándose todas sus pruebas sin poner roja al resto de la suite, que es la
         forma peligrosa de fallar.

         NO es una fuga del producto: en el navegador se pinta UNA ficha, no decenas.
         Es el coste de happy-dom acumulado en un solo archivo. Se le da
         holgura al pool en vez de recortar la cobertura, que es justo lo que protege
         esta ficha. Si algún día se vuelve a quedar corto, lo que toca es PARTIR ese
         archivo, no seguir subiendo el número.
         `--no-experimental-webstorage` (2026-10-11, usuario, punto 4.4): desde Node 25 el proceso trae su PROPIO
         `localStorage` global (sin `--localstorage-file`, undefined) y tapa el de happy-dom: con el Node 26 del equipo,
         13 pruebas de Planta (las que usan localStorage) fallaban y con el 24 de la CI pasaban. La bandera lo quita
         (Node 24 también la acepta), así que las dos versiones prueban lo mismo. */
      forks: { execArgv: ['--max-old-space-size=4096', '--no-experimental-webstorage'] },
    },
  },
  build: {
    target: 'es2019',
    cssTarget: CSS_NAVEGADORES,
    outDir: 'dist',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // Chart.js va a su propio chunk: mejor cacheo (no se reinvalida al tocar el
        // código de la app) y ~194 kB menos en el bundle principal. Eso sí ocurre.
        //
        // ⚠ Lo que NO hace —y este comentario lo afirmó hasta el 2026-08-30— es quitar
        // el aviso "chunk > 500 kB". Hasta el 2026-10-23 lo daba el chunk principal: las SIETE
        // vistas que main.js importaba de forma ESTÁTICA (supervisor, larvicultura, revisiones,
        // visitante, algas, microbiología y la entrada de maduración). Desde ese día (tarea 5)
        // también van con import() diferido (main.js · `diferida`), como Registros, Biología
        // Molecular, Planta y el tablero de Maduración, y el principal es pequeño. El aviso lo
        // da ahora three.js, que sólo baja quien abre 🏭 Planta (fuera de la precarga).
        //
        // ⚠ EL TAMAÑO NO SE ESCRIBE AQUÍ: lo dice `npx vite build`. Aquí ponía «~730 kB» y
        // el 2026-09-21 eran 743 539 B. Y al medirlo salió una trampa que conviene saber:
        // vite imprime CARACTERES/1000, no bytes —ese día decía «737.72 kB» para un archivo
        // de 743 539 B, y los 5 816 de diferencia son los acentos y los emoji en UTF-8—.
        // El gzip real se mide aparte (`gzip -c … | wc -c`).
        //
        // El aviso se deja SONANDO a propósito. Subir chunkSizeWarningLimit lo callaría
        // sin quitar un solo kilobyte, también el día que vuelva a crecer el principal, y esta
        // app se abre desde el móvil en el laboratorio y en carretera: el principal es la
        // primera carga, con la señal que haya. Una vista nueva entra DIFERIDA.
        manualChunks: {
          'vendor-chart': ['chart.js'],
        },
      },
    },
  },
}));
