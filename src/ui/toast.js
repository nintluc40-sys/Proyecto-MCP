// src/ui/toast.js — Aviso efímero (toast) no bloqueante.
//
// Reemplaza a window.alert() en las rutas de error de exportación de las vistas del
// core (Algas, Microbiología, Biología Molecular): un alert() congela el hilo y rompe
// el flujo; el toast informa sin bloquear y se auto-descarta. El texto se inserta con
// textContent (sin riesgo de XSS). Vive en ui/ porque toca el DOM (core/ no lo hace).

let host = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'app-toasts';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

/**
 * Muestra un toast efímero. Apilable; clic para descartar antes de tiempo.
 * @param {string} message  texto a mostrar (se inserta con textContent).
 * @param {'info'|'ok'|'warn'|'err'} [kind='info']  color del borde/acento.
 * @param {number} [ms=4200]  milisegundos visible antes de auto-descartarse.
 */
export function toast(message, kind = 'info', ms = 4200) {
  const el = document.createElement('div');
  el.className = `app-toast app-toast--${kind}`;
  el.textContent = message;
  ensureHost().appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  const kill = () => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 220);
  };
  const timer = setTimeout(kill, ms);
  el.addEventListener('click', () => {
    clearTimeout(timer);
    kill();
  });
  return el;
}
