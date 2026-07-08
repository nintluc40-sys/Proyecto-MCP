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
  build: {
    target: 'es2019',
    outDir: 'dist',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // Separa Chart.js a su propio chunk: mejor cacheo (no se reinvalida al
        // tocar el código de la app) y reduce el bundle principal. Quita el aviso
        // "chunk > 500 kB".
        manualChunks: {
          'vendor-chart': ['chart.js'],
        },
      },
    },
  },
}));
