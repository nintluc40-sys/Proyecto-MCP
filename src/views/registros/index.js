/* ============================================================
   REGISTROS · vista de captura (migración de "Fichas definitivas.html")
   Etapa 0 — andamiaje + motor + shell.

   Estrategia: la app original es un monolito de ~13k líneas con manejadores
   inline (onclick) en ámbito global y GAS desplegado. Para una migración FIEL
   se aloja su shell + motor dentro de esta vista:
     · CSS portada y scopeada bajo `.registros-app` (registros.css).
     · Shell (login por módulo + PIN + topbar + tabs + modales) en shell.html.
     · Motor (engine.js) y librería QR servidos desde /public/registros, cargados
       de forma DIFERIDA al entrar por primera vez (auto-bootean contra el DOM).
   Persistencia: mismas claves `larv4_` (mismo origen). Sync: mismo GAS desplegado.
   Login por ROL: interno a esta vista (rejilla de módulos + PIN del original).
   ============================================================ */
import './registros.css';
import './registros.theme.css';
import shellHtml from './shell.html?raw';
import { esc } from '../../core/format.js';
import { store } from '../../core/store.js';
import { hayOtroBuild } from '../../ui/versionNueva.js';
import * as regSecurity from './lib/security.js';
import * as regModules from './lib/modules.js';
import * as regReproductivo from './lib/reproductivo.data.js';

// Lectura de hojas para el motor (Registro reproductivo · Tanda 5): el dashboard ya
// carga TODAS las hojas al store con `_SheetOrigin`. Devuelve las filas (objetos con
// cabeceras) de la hoja pedida. Si aún no existe/no se cargó → []. El monolito no tiene
// store: allí lee la hoja por su cuenta (`_reproFetchSheet` en engine.js: la exportación del
// libro y, si no cuadra o falla, el GAS con `?p=rows`). (Aquí decía que allí quedaba «en stub».)
function reproReadSheet(sheetName) {
  try { return (store.globalData || []).filter((r) => r && r._SheetOrigin === sheetName); }
  catch (_e) { return []; }
}
// La VERSIÓN del store: el propio array de filas, que se sustituye entero en cada recarga del tablero. El motor la
// anota al leer la MATRIZ de Google (1a, 2026-09-21): mientras no cambie, lo leído de la hoja es más nuevo que el store
// y manda; en cuanto el tablero se recarga, vuelve a mandar el store.
function reproStoreVersion() { return store.globalData; }
import { renderCalidadFicha } from './fichas/calidad.render.js';
import { renderPlgFicha } from './fichas/plg.render.js';
import { renderParamsFicha } from './fichas/params.render.js';
import { renderPoblacionFicha } from './fichas/poblacion.render.js';
import { renderCalaguaFicha } from './fichas/calagua.render.js';
import { renderDespachoFicha } from './fichas/despacho.render.js';
import { renderDesinfeccionFicha } from './fichas/desinfeccion.render.js';
import { attachFichaEvents } from './fichas/ficha-events.js';
import { resolveCalidadData } from './fichas/calidad.data.js';
import { resolvePlgData } from './fichas/plg.data.js';
import { resolveParamsData } from './fichas/params.data.js';
import { resolvePoblacionData } from './fichas/poblacion.data.js';
import { resolveCalaguaData } from './fichas/calagua.data.js';
import { resolveDespachoData } from './fichas/despacho.data.js';
import { resolveDesinfeccionData } from './fichas/desinfeccion.data.js';

// Puente hacia el monolito engine.js (script clásico): expone los módulos ES ya
// extraídos en window.__rgLib ANTES de cargar el motor, que delega en ellos.
// Estrangulamiento incremental del monolito (el plan vigente: docs/analisis/10-plan-engine.md).
const regLib = {
  ...regSecurity,
  ...regModules,
  ...regReproductivo,
  reproReadSheet,
  reproStoreVersion,
  renderCalidadFicha,
  resolveCalidadData,
  renderPlgFicha,
  resolvePlgData,
  renderParamsFicha,
  resolveParamsData,
  renderPoblacionFicha,
  resolvePoblacionData,
  renderCalaguaFicha,
  resolveCalaguaData,
  renderDespachoFicha,
  resolveDespachoData,
  renderDesinfeccionFicha,
  resolveDesinfeccionData,
};
try { window.__rgLib = regLib; } catch (_) {}

// Fichas estándar: el motor (engine.js) las renderiza ÚNICAMENTE con estos módulos
// ES nativos. Los render originales del monolito se RETIRARON el 2026-06-13, tras
// validarse en navegador (render + guardado + sync al Sheet). El guardado/sync/
// herencia siguen siendo del motor, vía delegación de eventos y adaptadores. Por eso
// __rgLib DEBE quedar listo (asignado arriba) ANTES de que cargue el engine.

let host = null;            // contenedor `.registros-app` persistente entre navegaciones
let scriptsLoading = null;  // promesa única de carga del motor

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-rg="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') resolve();
      else { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', () => reject(new Error('No se pudo cargar ' + src))); }
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // preserva el orden QR → engine
    s.dataset.rg = src;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

export function registrosView(root) {
  // Limpia el placeholder de carga (o cualquier contenido previo) antes de
  // (re)adjuntar el host, que se inserta con appendChild.
  root.innerHTML = '';
  // Re-adjuntar el host persistente conserva el estado y los listeners del motor.
  if (host) { root.appendChild(host); return; }

  host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = shellHtml;
  root.appendChild(host); // el DOM debe existir ANTES de que el motor bootee

  // Delegación de eventos para las fichas nativas (data-*). Sobre el host estable
  // y una sola vez; solo actúa sobre elementos con data-* (los que genera el render
  // nativo), así que NO interfiere con los onclick inline de las fichas del motor.
  attachFichaEvents(host);

  const base = import.meta.env.BASE_URL || '/';
  if (!scriptsLoading) cargarMotor(base, true);
}

/* Pauta 5 (2026-10-22, usuario) · el motor (`engine.js` y `qrcode.js`) va APARTE del bundle, que trae el shell
   (`shell.html`) y la CSS de esta vista. Una pestaña abierta ANTES de un despliegue que entraba aquí por primera vez
   montaba el shell viejo con el motor nuevo: la franja de versión nueva (`ui/versionNueva.js`) lo avisaba, pero no lo
   impedía. Antes de cargarlo se pregunta qué build está publicado (`hayOtroBuild`, como mucho 3 s). Si es OTRO, el
   motor no se carga y se pide recargar. «Abrir igualmente» lo carga tal cual: decisión del usuario, para que un equipo de
   campo no se quede sin Registros si algo no casara. Sin red o sin respuesta, se carga como siempre. */
function avisarOtroBuild(base) {
  if (!host) return;
  host.innerHTML = '<div class="empty-state" style="padding:48px">Hay una versión nueva de la app.<br>Recarga para abrir'
    + ' Registros: así no se mezcla con la versión anterior.<br><br><button type="button" class="btn bp" data-rg-version="recargar">'
    + 'Recargar</button> <button type="button" class="btn bs" data-rg-version="abrir">Abrir igualmente</button></div>';
  host.querySelector('[data-rg-version="recargar"]').addEventListener('click', () => window.location.reload());
  host.querySelector('[data-rg-version="abrir"]').addEventListener('click', () => {
    host.innerHTML = shellHtml;
    cargarMotor(base, false);
  });
}

function cargarMotor(base, comprobarVersion) {
  scriptsLoading = (async () => {
    if (comprobarVersion && await hayOtroBuild()) return false;
    await loadScript(base + 'registros/qrcode.js');
    await loadScript(base + 'registros/engine.js'); // auto-bootea (buildGrid) contra el shell ya inyectado
    return true;
  })().then((cargado) => { if (!cargado) avisarOtroBuild(base); }).catch((e) => {
    if (host) host.innerHTML = `<div class="empty-state" style="padding:48px">No se pudo cargar Registros.<br><small class="mono">${esc(e.message)}</small><br><small class="muted" style="opacity:.7">Vuelve a entrar a la vista para reintentar.</small></div>`;
    // Falla de carga (offline / deploy a medias): descarta el host, la promesa y los
    // <script> que NO llegaron a cargar. Sin esto la vista quedaría rota hasta recargar
    // la página (el guard `if (host) return` no reintenta), y un reintento ingenuo se
    // colgaría porque loadScript reencontraría el <script> fallido (listeners que nunca
    // disparan). Al eliminarlos, la próxima entrada reconstruye el host y recarga limpio.
    document.querySelectorAll('script[data-rg]').forEach((s) => { if (s.dataset.loaded !== '1') s.remove(); });
    host = null; scriptsLoading = null;
  });
}
