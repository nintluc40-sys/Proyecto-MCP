/* ============================================================
   ENTRY — arranque de la aplicación
   ============================================================ */
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './views/supervisor/supervisor.css';
import './views/larvicultura/larvicultura.css';
import './views/revisiones/revisiones.css';
import './views/biomolecular/biomolecular.css';
import './views/visitante/visitante.css';
import './views/algas/algas.css';
import './views/microbiologia/microbiologia.css';
import './views/maduracion/maduracion.css';


import { mountShell } from './ui/shell.js';
import { registerView, setPedirLibro } from './ui/router.js';
import { setLectorLibro } from './core/sheets.js';
import { lectorWorker } from './core/sheets.lector.js';
import { startAutoRefresh, asegurarLibro, setLibroGuardado } from './core/refresh.js';
import { cargarLibroGuardado, almacenIDB } from './core/libroGuardado.js';
import { esc } from './core/format.js';

import { supervisorView } from './views/supervisor/index.js';
import { larviculturaView } from './views/larvicultura/index.js';
import { revisionesView } from './views/revisiones/index.js';
import { visitanteView } from './views/visitante/index.js';
import { algasView } from './views/algas/index.js';
import { microbiologiaView } from './views/microbiologia/index.js';
// Maduración: la entrada elige familia (📋 Operativo, diferido · 🧬 Microchips, la vista de index.js).
import { maduracionEntrada } from './views/maduracion/entrada.js';
// Biología Molecular: carga DIFERIDA. Es la vista más pesada (D3, ~1.5k líneas) y
// no es de uso diario; se descarga solo al abrirla, aligerando el bundle inicial.

/* D3 (sólo lo usa Biología Molecular) se carga AL ABRIRLA, no en el <head>: era un script que
   bloqueaba el primer pintado de toda la app (P3, 2026-10-01). Mismo archivo de public/vendor y
   mismo `integrity` que llevaba la etiqueta de index.html. ⚠ Si se sube de versión hay que
   RECALCULARLO (src/ui/arranque.test.js lo compara con el archivo):
     node -e "const{createHash}=require('crypto');console.log('sha384-'+createHash('sha384').update(require('fs').readFileSync(process.argv[1])).digest('base64'))" public/vendor/d3.min.js */
const D3_SRC = 'vendor/d3.min.js';
const D3_INTEGRITY = 'sha384-su5kReKyYlIFrI62mbQRKXHzFobMa7BHp1cK6julLPbnYcCW9NIZKJiTODjLPeDh';
let d3Cargando = null;
function cargarD3() {
  if (window.d3) return Promise.resolve();
  if (!d3Cargando) {
    d3Cargando = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = new URL(D3_SRC, document.baseURI).href;
      s.integrity = D3_INTEGRITY;
      // Si no carga, se resuelve igual: la vista enseña su propio aviso («No se pudo cargar D3»)
      // y la próxima vez que se abra se vuelve a intentar.
      s.onload = () => resolve();
      s.onerror = () => { d3Cargando = null; s.remove(); resolve(); };
      document.head.appendChild(s);
    });
  }
  return d3Cargando;
}

function boot() {
  const app = document.getElementById('app');

  // Vistas desarrolladas
  // `usaBarraFecha: true` = la vista LEE el rango de la barra de fecha global (store.dateFrom/
  // dateTo). Sólo esas la enseñan (D12, 2026-09-13); lo vigila src/ui/dateBarVisibility.test.js.
  registerView('supervisor', { label: 'Supervisor', icon: '👁️', render: supervisorView, usaBarraFecha: true });
  registerView('larvicultura', { label: 'Larvicultura', icon: '🦐', render: larviculturaView });
  registerView('revisiones', { label: 'Revisiones', icon: '🔍', render: revisionesView, usaBarraFecha: true });

  registerView('maduracion', { label: 'Maduración', icon: '🥚', render: maduracionEntrada });
  registerView('microbiologia', { label: 'Microbiología', icon: '🧫', render: microbiologiaView });
  registerView('algas', { label: 'Algas', icon: '🌿', render: algasView });
  registerView('biomolecular', {
    label: 'Biología Molecular', icon: '🧬',
    render: (root) => {
      // Placeholder mientras resuelve el import diferido (evita el pantallazo en
      // blanco entre que el router vacía el contenedor y el chunk carga/parsea).
      root.innerHTML = '<div class="empty-state" style="padding:64px 20px"><div style="font-size:40px">🧬</div><p class="muted">Cargando Biología Molecular…</p></div>';
      cargarD3()
        .then(() => import('./views/biomolecular/index.js'))
        .then((m) => m.biomolecularView(root))
        .catch((e) => { root.innerHTML = `<div class="empty-state" style="padding:48px">Error al cargar Biología Molecular.<br><small class="mono">${esc(e.message)}</small></div>`; });
    },
  });
  registerView('visitante', { label: 'Visitante', icon: '🚪', render: visitanteView });

  // Registros (captura) — carga DIFERIDA: la migración de Fichas es pesada y solo
  // se descarga cuando el usuario entra a la vista. `repintaConDatos: false`: un refresco
  // NO la repinta (se llevaba el foco y lo que se estaba tecleando; ver router.js).
  // `necesitaLibro: false`: abrirla no descarga el libro de Google (P3): lee lo suyo por el GAS.
  registerView('registros', {
    label: 'Registros', icon: '📝', repintaConDatos: false, necesitaLibro: false,
    render: (root) => {
      root.innerHTML = '<div class="empty-state" style="padding:64px 20px"><div style="font-size:40px">📝</div><p class="muted">Cargando Registros…</p></div>';
      import('./views/registros/index.js')
        .then((m) => m.registrosView(root))
        .catch((e) => { root.innerHTML = `<div class="empty-state" style="padding:48px">Error al cargar Registros.<br><small class="mono">${esc(e.message)}</small></div>`; });
    },
  });

  mountShell(app);

  // El libro se lee en un Web Worker (P1, 2026-10-01): la pantalla no se congela al leerlo.
  // Sin Worker, o si no arranca, se lee aquí como siempre (core/sheets.lector.js).
  setLectorLibro(lectorWorker);

  // Conexión inicial SIN ESPERA (P3, 2026-10-01). Antes se esperaba aquí al libro con el
  // loader tapándolo todo —también la elección de rol— durante 25–35 s. Ahora la entrada
  // responde al instante y el libro se pide cuando se enseña la PRIMERA vista que lo necesita
  // (todas salvo Registros): el router pinta su aviso de carga y llama a asegurarLibro, que no
  // lanza otra descarga si ya hay una o ya está cargado.
  setPedirLibro(asegurarLibro);

  // P4 (2026-10-01): si el equipo guarda un libro de menos de 7 días, la primera vista que lo
  // necesita lo enseña AL INSTANTE —también sin señal— y se revalida por detrás. Lo escribe el
  // Worker de lectura (core/libroGuardado.js). Sin IndexedDB, como antes: se descarga.
  setLibroGuardado(() => (typeof indexedDB === 'undefined' ? Promise.resolve(null) : cargarLibroGuardado(almacenIDB())));

  // Auto-refresco SIEMPRE activo. Mientras no hay libro, el loop queda en espera (tick()
  // sale temprano mientras !store.connected) y se reanuda solo en cuanto una conexión
  // marque store.connected = true. Antes vivía dentro de `if (ok)`, así que un fallo
  // inicial lo deshabilitaba TODA la sesión aunque el usuario reconectara con el botón.
  // La huella inicial (y la de cada reconexión manual) la cachea commit() en
  // sheets.js; el loop la lee de ahí — única fuente de verdad.
  startAutoRefresh();
}

/* ── Service worker (T4b, 2026-08-25) ────────────────────────
   Da a la app arranque SIN CONEXIÓN, que es su caso real: los chequeadores trabajan
   de noche y en carretera. La cola de sincronización ya guardaba lo que no se podía
   enviar, pero si la app no cargaba no había nada que encolar.

   ⚠ SÓLO en producción. En desarrollo, un service worker cacheando delante del
   servidor de Vite hace que los cambios «no se vean» y se persigan fantasmas.

   ⚠ Se registra DESPUÉS de arrancar y sin `await`: su instalación descarga varios
   megas (engine.js, xlsx, d3) y bloquear el arranque con eso dejaría la primera
   visita mirando una pantalla vacía. Si falla, la app funciona igual — se pierde el
   modo sin conexión, no la app. Por eso el fallo se traga en silencio: no hay nada
   que el usuario pueda hacer al respecto.

   La estrategia por tipo de archivo, y por qué NO es cache-first para todo, está
   explicada en `public/sw.js`. */
function registrarSW() {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    // Ruta RELATIVA al documento: en GitHub Pages la app vive bajo /Proyecto-MCP/, y
    // una ruta absoluta ('/sw.js') apuntaría a la raíz del dominio y daría 404.
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

boot();
registrarSW();
