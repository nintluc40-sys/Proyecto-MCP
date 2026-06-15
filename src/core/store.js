/* ============================================================
   STORE — estado central compartido + bus de eventos mínimo
   Sustituye a las decenas de variables globales del original
   (globalData, currentView, dateFilterFrom/To, allCharts...).
   ============================================================ */

const listeners = new Map(); // evento -> Set<fn>

export const store = {
  // Datos
  globalData: [],          // todas las filas con _SheetOrigin
  sheetNames: [],          // nombres de hojas detectadas
  latestDateMs: 0,         // fecha más reciente conocida

  // Navegación
  currentView: 'supervisor', // id de la vista activa (ver MAIN_VIEWS en ui/shell.js)
  role: null,                // rol activo (define vistas accesibles); null = sin ingresar

  // Filtro de fecha global (compartido por las vistas)
  dateFrom: null,
  dateTo: null,

  // Conexión
  connected: false,
  refreshing: false,
  sheetsUrlOverride: '',
};

/** Suscribe a un evento. Devuelve función para desuscribir. */
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

/** Emite un evento a todos los suscriptores. */
export function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error(`[store] listener "${event}"`, e); }
  });
}

/** Eventos canónicos del sistema. */
export const EV = {
  DATA: 'data:updated',      // globalData cambió
  CONN: 'conn:status',       // estado de conexión cambió  { state, label }
  VIEW: 'view:changed',      // vista activa cambió
  DATEFILTER: 'date:changed',
};
