// src/ui/versionNueva.js — Aviso de VERSIÓN NUEVA de la app (B1, 2026-10-19, usuario).
//
// Una pestaña o una PWA abierta seguía con el código con el que se abrió aunque se publicara otro: el shell es
// network-first (public/sw.js) y lo nuevo sólo llegaba al RECARGAR, y en el celular una PWA casi nunca se recarga
// —vuelve del fondo con lo que ya tenía—. Tampoco `engine.js` (Registros), que se carga una vez por página.
//
// La página sabe qué build corre (la `<meta name="mcp-build">` que sella vite.config.js) y pregunta cuál está
// publicado (`version.json`, sin caché: el service worker lo deja pasar). Si no coinciden, una franja lo dice con
// «Recargar» y ×. NO recarga sola: Registros puede tener algo a medio escribir. Pregunta al volver a primer plano, al
// recuperar la red y cada 30 min con la app a la vista; cerrada con ×, vuelve en la siguiente comprobación. Y le pide
// al service worker que mire si hay otro (`update()`), para que guarde los bloques nuevos aunque nadie recargue.
// Vive en ui/ porque toca el DOM (core/ no lo hace).

/** La marca de un build sin sellar (dev, pruebas): con ella no se vigila nada. La misma que SIN_SELLAR de vite.config.js. */
const SIN_SELLAR = 'sin-sellar';
export const CADA = 30 * 60 * 1000;

/** El build que corre esta página, o null si no está sellado. */
export function huellaPropia(doc = document) {
  const m = doc.querySelector('meta[name="mcp-build"]');
  const v = m ? String(m.getAttribute('content') || '').trim() : '';
  return v && v !== SIN_SELLAR ? v : null;
}

/** El build publicado, o null si no se pudo saber (sin red, 404, respuesta rara): sin saberlo no se avisa. */
export async function huellaPublicada(fetchFn = fetch) {
  try {
    const res = await fetchFn('./version.json', { cache: 'no-store' });
    if (!res || !res.ok) return null;
    const j = await res.json();
    return j && typeof j.build === 'string' && j.build ? j.build : null;
  } catch (_) {
    return null;
  }
}

/** Pauta 5 (2026-10-22, usuario) · ¿Lo publicado es OTRO build que el que corre esta página? true sólo si se SABE: las dos
 *  huellas y distintas. Sin sellar, sin red o sin respuesta en `espera` ms, false: no se sabe, y no se frena a nadie.
 *  Lo pregunta Registros antes de cargar su motor (`engine.js` va aparte del bundle y se mezclaría con el de otro build). */
export async function hayOtroBuild({ fetchFn = fetch, doc = document, espera = 3000 } = {}) {
  const propia = huellaPropia(doc);
  if (!propia) return false;
  let reloj;
  const tarde = new Promise((resolve) => { reloj = setTimeout(() => resolve(null), espera); });
  const publicada = await Promise.race([huellaPublicada(fetchFn), tarde]);
  clearTimeout(reloj);
  return !!publicada && publicada !== propia;
}

function mostrarFranja(doc, win) {
  if (doc.querySelector('.app-version-nueva')) return;
  const el = doc.createElement('div');
  el.className = 'app-version-nueva';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  const txt = doc.createElement('span');
  txt.textContent = 'Hay una versión nueva de la app. Recarga cuando no tengas nada a medio escribir.';
  const recargar = doc.createElement('button');
  recargar.type = 'button';
  recargar.dataset.accion = 'recargar';
  recargar.textContent = 'Recargar';
  const cerrar = doc.createElement('button');
  cerrar.type = 'button';
  cerrar.dataset.accion = 'cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar el aviso');
  cerrar.textContent = '×';
  el.append(txt, recargar, cerrar);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'recargar') win.location.reload();
    else el.remove();
  });
  doc.body.appendChild(el);
}

/**
 * Empieza a vigilar si hay versión nueva. Devuelve la función que lo para.
 * @param {object} [o]
 * @param {() => (ServiceWorkerRegistration|null)} [o.registro]  el registro del service worker, si ya lo hay.
 */
export function vigilarVersion({ registro = () => null, fetchFn = fetch, doc = document, win = window, cada = CADA } = {}) {
  const propia = huellaPropia(doc);
  if (!propia) return () => {};
  let enCurso = false;
  const comprobar = async () => {
    if (enCurso || doc.visibilityState === 'hidden') return;
    enCurso = true;
    try {
      const publicada = await huellaPublicada(fetchFn);
      if (!publicada || publicada === propia) return;
      mostrarFranja(doc, win);
      const r = registro();
      if (r && typeof r.update === 'function') Promise.resolve(r.update()).catch(() => {});
    } finally {
      enCurso = false;
    }
  };
  const alVolver = () => { if (doc.visibilityState === 'visible') comprobar(); };
  doc.addEventListener('visibilitychange', alVolver);
  win.addEventListener('online', comprobar);
  const reloj = win.setInterval(comprobar, cada);
  comprobar();
  return () => {
    doc.removeEventListener('visibilitychange', alVolver);
    win.removeEventListener('online', comprobar);
    win.clearInterval(reloj);
  };
}
