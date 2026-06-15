import { defineConfig } from 'vite';

// Configuración mínima y limpia. El build genera assets optimizados en /dist.
// `base: './'` permite abrir el HTML compilado desde cualquier ruta (incluido file://).
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
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
});
