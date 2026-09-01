import { defineConfig } from 'vite';

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
    outDir: 'dist',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // Chart.js va a su propio chunk: mejor cacheo (no se reinvalida al tocar el
        // código de la app) y ~194 kB menos en el bundle principal. Eso sí ocurre.
        //
        // ⚠ Lo que NO hace —y este comentario lo afirmó hasta el 2026-08-30— es quitar
        // el aviso "chunk > 500 kB": el chunk principal sigue en ~730 kB (230 kB gzip) y
        // el aviso sale en cada compilación. No es culpa de ninguna librería: son las
        // SIETE vistas que main.js importa de forma ESTÁTICA (supervisor, larvicultura,
        // revisiones, visitante, algas, microbiología y maduración). Sólo Registros y
        // Biología Molecular se cargan con import() diferido.
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
