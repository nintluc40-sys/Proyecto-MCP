import { defineConfig } from 'vite';

/* Lista de TODO lo que el build emite bajo assets/ (P3 del plan de carga y refresco, 2026-10-01),
   en `precache-assets.json`, para que el service worker lo guarde al INSTALARSE. Los bloques
   diferidos —Registros, Biología Molecular, el tablero de Maduración, el Worker de lectura del
   libro— no salen en index.html: sin esta lista, tras un despliegue, un equipo que no los abriera
   con red no podía abrirlos sin señal. La lee public/sw.js (assetsDelBuild).
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
  //     diferida (Registros y Biología Molecular). Es un footgun conocido de Vite.
  base: command === 'build' ? './' : '/',
  plugins: [listaDePrecache()],
  server: {
    port: 5173,
    open: true,
    // Pre-transforma al ARRANCAR las vistas de carga diferida (y su grafo) para que
    // Vite optimice las dependencias UNA sola vez al inicio, en lugar de re-optimizar
    // a mitad de sesión la primera vez que se abren — esa re-optimización aborta las
    // peticiones de módulo en vuelo y produce el "Failed to fetch dynamically
    // imported module". El warmup no cambia el bundle, solo el calentamiento del dev.
    warmup: {
      clientFiles: [
        './src/views/biomolecular/index.js',
        './src/views/registros/index.js',
      ],
    },
  },
  test: {
    poolOptions: {
      /* ⚠ `traslado-captura.test.js` arranca el monolito ENTERO sobre happy-dom y
         corre 74 pruebas que repintan la ficha completa en cada una. Desde el
         guardado por revisión (2026-08-25) la validación dejó de bloquear, así que
         muchas más pruebas llegan a GUARDAR —y por tanto a repintar—, y el worker se
         pasaba del heap por defecto (~2 GB): moría con «Ineffective mark-compacts»
         llevándose sus 74 pruebas sin poner roja al resto de la suite, que es la
         forma peligrosa de fallar.

         NO es una fuga del producto: en el navegador se pinta UNA ficha, no setenta
         y cuatro. Es el coste de happy-dom acumulado en un solo archivo. Se le da
         holgura al pool en vez de recortar la cobertura, que es justo lo que protege
         esta ficha. Si algún día se vuelve a quedar corto, lo que toca es PARTIR ese
         archivo, no seguir subiendo el número. */
      forks: { execArgv: ['--max-old-space-size=4096'] },
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
        // el aviso "chunk > 500 kB": el chunk principal sigue MUY por encima y el aviso sale
        // en cada compilación. No es culpa de ninguna librería: son las SIETE vistas que
        // main.js importa de forma ESTÁTICA (supervisor, larvicultura, revisiones, visitante,
        // algas, microbiología y la entrada de maduración). Con import() diferido van TRES:
        // Registros, Biología Molecular y el tablero de Maduración (operativo.view.js).
        //
        // ⚠ EL TAMAÑO NO SE ESCRIBE AQUÍ: lo dice `npx vite build`. Aquí ponía «~730 kB» y
        // el 2026-09-21 eran 743 539 B. Y al medirlo salió una trampa que conviene saber:
        // vite imprime CARACTERES/1000, no bytes —ese día decía «737.72 kB» para un archivo
        // de 743 539 B, y los 5 816 de diferencia son los acentos y los emoji en UTF-8—.
        // El gzip real se mide aparte (`gzip -c … | wc -c`).
        //
        // El aviso se deja SONANDO a propósito. Subir chunkSizeWarningLimit lo callaría
        // sin quitar un solo kilobyte, y esta app se abre desde el móvil en el laboratorio
        // y en carretera: esos 230 kB son la primera carga, con la señal que haya. Lo que
        // lo arregla de verdad es pasar esas siete vistas a import() diferido, como ya
        // están las otras dos.
        manualChunks: {
          'vendor-chart': ['chart.js'],
        },
      },
    },
  },
}));
