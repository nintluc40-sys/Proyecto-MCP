/* ============================================================
   ACCESO POR ENLACE — la entrada directa de Gerencia (2026-10-05, decisión del usuario)
   El enlace exclusivo `…/?rol=gerencia` (también dentro del QR 3D de views/planta/qr) entra directo a su vista, sin la
   pantalla de roles, y ese equipo RECUERDA el rol —también al abrir la app desde el ícono de inicio, cuyo start_url no
   lleva el parámetro— hasta que se pulse «Cambiar rol». Sólo los roles de ROLES_POR_ENLACE entran así: un `?rol=` con
   cualquier otro se ignora (el rol se elige como siempre).
   Módulo casi puro: el almacenamiento y la dirección se reciben como argumentos (los usa shell.js), así se prueba sin
   navegador. ⚠ `CLAVE_ROL` vive en localStorage del equipo; no es un contrato con el GAS.
   ============================================================ */

/** Roles a los que se entra por enlace. */
export const ROLES_POR_ENLACE = ['gerencia'];
/** Dónde recuerda el equipo el rol que entró por enlace. */
export const CLAVE_ROL = 'mcp_rol_recordado';
/** La app publicada: el QR apunta aquí cuando la página se abre desde el equipo local (localhost no sirve al celular). */
export const SITIO_PUBLICADO = 'https://nintluc40-sys.github.io/Proyecto-MCP/';

const valido = (r) => (ROLES_POR_ENLACE.includes(r) ? r : null);
const almacen = () => { try { return globalThis.localStorage || null; } catch (_) { return null; } };

/** El rol que trae la dirección (`?rol=gerencia`), o null. */
export function rolDeEnlace(search) {
  try { return valido(new URLSearchParams(search || '').get('rol')); } catch (_) { return null; }
}
/** El rol que el equipo recuerda, o null (sin almacenamiento, o con un valor que no entra por enlace). */
export function rolRecordado(storage = almacen()) {
  try { return storage ? valido(storage.getItem(CLAVE_ROL)) : null; } catch (_) { return null; }
}
export function recordarRol(rol, storage = almacen()) {
  if (!valido(rol)) return;
  try { if (storage) storage.setItem(CLAVE_ROL, rol); } catch (_) { /* sin almacenamiento: vale en esta sesión */ }
}
export function olvidarRol(storage = almacen()) {
  try { if (storage) storage.removeItem(CLAVE_ROL); } catch (_) { /* nada que olvidar */ }
}
/** La misma dirección sin `rol` (para que recargar o compartir la página no vuelva a forzarlo). */
export function direccionSinRol(href) {
  const u = new URL(href); u.searchParams.delete('rol');
  return u.pathname + u.search + u.hash;
}
/** El enlace de Gerencia del sitio desde el que se abre; desde el equipo local, el del sitio publicado. */
export function enlaceGerencia(href) {
  const u = new URL(href);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
  const base = local ? new URL(SITIO_PUBLICADO) : new URL('./', u.origin + u.pathname);
  base.search = '?rol=gerencia'; base.hash = '';
  return base.href;
}
