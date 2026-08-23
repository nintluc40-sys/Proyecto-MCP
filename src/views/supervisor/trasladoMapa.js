/* ============================================================
   SUPERVISOR · Traslado — el mapa de la ruta

   Sitúa cada parada de cada camión sobre un mapa real (teselas de OpenStreetMap) y
   al pulsar un punto abre su ficha: O₂, temperatura, actividad, alimento y
   observación de ESE camión en ESE punto.

   ── Decisiones que conviene conocer ─────────────────────────
   🔑 **Marcadores `divIcon`, no los de Leaflet.** Los marcadores por defecto
   apuntan a `marker-icon.png` por una ruta que los empaquetadores rompen a menudo
   (el clásico icono invisible en producción y perfecto en desarrollo). Un `divIcon`
   es HTML y CSS nuestros: no hay ninguna imagen que pueda faltar, y además nos deja
   numerar la parada y colorearla por camión, que es lo que hace legible el mapa
   cuando dos camiones recorren la misma ruta.

   🔑 **Carga PEREZOSA de Leaflet** (`import()` dinámico). La librería y su CSS sólo
   se descargan si el supervisor abre esta sub-vista; el resto del tablero no paga
   nada. Como es asíncrono, `montarMapa` devuelve una promesa y deja el contenedor
   con un aviso mientras tanto.

   ⚠ **Las teselas son el ÚNICO recurso externo del tablero.** Sin red, el fondo
   sale gris pero los marcadores, la ruta y las fichas siguen funcionando: la
   información no depende del mapa, sólo su contexto geográfico.

   ⚠ **Una parada sin GPS NO se dibuja.** En carretera es normal quedarse sin señal;
   inventarle una posición sería peor que no pintarla. La vista dice cuántas faltan.
   ============================================================ */
import { esc } from '../../core/format.js';

/** Paleta por camión: estable por índice, para que la placa y el punto casen. */
export const COLORES_CAMION = ['#0f766e', '#b45309', '#6d28d9', '#be123c', '#0369a1', '#4d7c0f'];

const n1 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(1));

/** Encuadre que contiene todos los puntos. Devuelve null si no hay ninguno. */
export function limitesDe(camiones) {
  const pts = camiones.flatMap((c) => c.puntos.map((p) => [p.lat, p.lon]));
  if (!pts.length) return null;
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
}

/** Cuántas paradas se quedaron sin coordenadas (sin señal en ruta). */
export function paradasSinGps(camiones) {
  return camiones.reduce((a, c) => a + (c.paradas.length - c.puntos.length), 0);
}

/** Contenido de la ficha de un punto. Puro: se prueba sin mapa ni DOM. */
export function fichaPunto(camion, parada) {
  const tinas = Object.values(parada.tinas || {});
  const acts = [...new Set(tinas.map((t) => t.act).filter(Boolean))];
  const alims = [...new Set(tinas.map((t) => t.alim).filter(Boolean))];
  return {
    placa: camion.placa,
    revision: parada.revision,
    hora: parada.hora || '',
    lugar: parada.lugar || '',
    o2: parada.o2,
    temp: parada.temp,
    actividad: acts.join(', '),
    alimentacion: alims.join(', '),
    obs: parada.obs || '',
    lat: parada.lat,
    lon: parada.lon,
  };
}

/** HTML de la ficha. Separado del render para poder probarlo sin Leaflet. */
export function fichaHtml(f) {
  const fila = (etq, val) => `<div class="sv-tmap-f"><span>${etq}</span><b>${esc(val)}</b></div>`;
  return `<div class="sv-tmap-pop">
    <div class="sv-tmap-pop-h">🚚 ${esc(f.placa)} · Parada ${f.revision}</div>
    <div class="sv-tmap-pop-s">${esc(f.lugar || '—')}${f.hora ? ' · ' + esc(f.hora) : ''}</div>
    ${fila('O₂', n1(f.o2) + ' mg/L')}
    ${fila('Temperatura', n1(f.temp) + ' °C')}
    ${fila('Actividad', f.actividad || '—')}
    ${fila('Alimentación', f.alimentacion || '—')}
    ${fila('Observaciones', f.obs || '—')}
    <div class="sv-tmap-pop-geo">${Number(f.lat).toFixed(5)}, ${Number(f.lon).toFixed(5)}</div>
  </div>`;
}

/** Marcador numerado, en HTML propio (ver la nota sobre `divIcon` arriba). */
function iconoHtml(L, numero, color) {
  return L.divIcon({
    className: 'sv-tmap-marker-wrap',
    html: `<div class="sv-tmap-marker" style="background:${color}">${numero}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

/**
 * Monta el mapa dentro de `el` con las paradas de `camiones`.
 * Devuelve `{ destroy }` o `null` si no hay nada que pintar / falla la carga.
 */
export async function montarMapa(el, camiones) {
  if (!el) return null;
  const conPuntos = (camiones || []).filter((c) => c.puntos.length);
  if (!conPuntos.length) {
    el.innerHTML = '<div class="sv-tmap-vacio">Ninguna parada llegó con coordenadas: no hay nada que situar en el mapa.</div>';
    return null;
  }

  let L;
  try {
    // Perezoso a propósito: quien no abre esta vista no descarga el mapa.
    await import('leaflet/dist/leaflet.css');
    L = (await import('leaflet')).default;
  } catch (_e) {
    // Que falle la librería NO puede tumbar la vista: los datos ya están arriba.
    el.innerHTML = '<div class="sv-tmap-vacio">No se pudo cargar el mapa. El detalle de cada parada sigue disponible en los KPIs.</div>';
    return null;
  }

  el.innerHTML = '';
  const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  conPuntos.forEach((c, ci) => {
    const color = COLORES_CAMION[ci % COLORES_CAMION.length];
    const linea = c.puntos.map((p) => [p.lat, p.lon]);
    if (linea.length > 1) {
      L.polyline(linea, { color, weight: 3, opacity: 0.7, dashArray: '6 5' }).addTo(map);
    }
    c.puntos.forEach((p) => {
      L.marker([p.lat, p.lon], { icon: iconoHtml(L, p.revision, color), title: `${c.placa} · parada ${p.revision}` })
        .addTo(map)
        .bindPopup(fichaHtml(fichaPunto(c, p)), { minWidth: 210 });
    });
  });

  const lim = limitesDe(conPuntos);
  if (lim) map.fitBounds(lim, { padding: [34, 34], maxZoom: 15 });
  // El contenedor nace con alto 0 dentro de un render por innerHTML: sin esto el
  // mapa se dibuja en una franja y las teselas salen cortadas.
  setTimeout(() => { try { map.invalidateSize(); } catch (_) { /* desmontado */ } }, 0);

  return { map, destroy() { try { map.remove(); } catch (_) { /* ya desmontado */ } } };
}
