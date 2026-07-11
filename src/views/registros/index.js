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
import * as regSecurity from './lib/security.js';
import * as regModules from './lib/modules.js';
import * as regReproductivo from './lib/reproductivo.data.js';
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
// Estrangulamiento incremental del monolito (ver docs/analisis/04-refactor-plan.md).
const regLib = {
  ...regSecurity,
  ...regModules,
  ...regReproductivo,
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
  if (!scriptsLoading) {
    scriptsLoading = (async () => {
      await loadScript(base + 'registros/qrcode.js');
      await loadScript(base + 'registros/engine.js'); // auto-bootea (buildGrid) contra el shell ya inyectado
    })().catch((e) => {
      host.innerHTML = `<div class="empty-state" style="padding:48px">No se pudo cargar Registros.<br><small class="mono">${esc(e.message)}</small></div>`;
    });
  }
}
