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

/** Color de la RUTA. Es uno solo porque la ruta es una: la del viaje. Los colores
 *  de `COLORES_CAMION` siguen usándose, pero para distinguir a los camiones DENTRO
 *  del popup de cada parada, que es donde sus datos sí se diferencian. */
export const RUTA_COLOR = '#0f766e';

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

/* ══════════════════════════════════════════════════════════
   LA RUTA ES DEL VIAJE, NO DEL CAMIÓN (corregido el 2026-08-27)

   ⚠⚠ `Latitud` y `Longitud` tienen `grain: 'revision'` en el esquema: la
   coordenada es de la PARADA y `buildTrasPayload` escribe la MISMA en la fila de
   cada camión. Los camiones de un viaje paran juntos — por eso el tiempo se calcula
   una sola vez sobre las paradas del conjunto.

   Hasta hoy el mapa pintaba una polilínea y un juego de marcadores POR CAMIÓN.
   Medido con dos camiones: 4 de 4 puntos caían en la misma coordenada, así que
   salían 2 líneas exactamente superpuestas y 8 marcadores en 4 posiciones. Sólo se
   veía el último camión pintado y su popup; el primero quedaba debajo, invisible.
   La leyenda de colores por camión remataba el engaño: sugería dos rutas donde
   sólo hay una.

   Ahora hay UNA ruta y UN marcador por parada, y el popup lleva las mediciones de
   CADA camión en esa parada — que es la pregunta real del supervisor: «en esta
   parada, ¿cómo venía cada camión?».

   🔑 NO se desplazan los pines para separarlos: sería pintar una coordenada que
   nadie registró, y esta vista se usa para reclamar. Misma razón por la que una
   parada sin GPS no se inventa.
   ══════════════════════════════════════════════════════════ */

/** Las paradas del viaje con GPS, sin repetir, y lo que midió cada camión en cada
 *  una. Puro: se prueba sin mapa ni DOM. */
export function paradasDelMapa(camiones) {
  const porRev = new Map();
  (camiones || []).forEach((c) => (c.puntos || []).forEach((p) => {
    if (!porRev.has(p.revision)) {
      porRev.set(p.revision, {
        revision: p.revision, hora: p.hora || '', lugar: p.lugar || '',
        lat: p.lat, lon: p.lon, obs: p.obs || '', camiones: [],
      });
    }
    // El índice del camión en el VIAJE fija su color, no el orden en que se lea.
    const i = camiones.indexOf(c);
    porRev.get(p.revision).camiones.push({
      ...fichaPunto(c, p), color: COLORES_CAMION[i % COLORES_CAMION.length],
    });
  }));
  return [...porRev.values()].sort((a, b) => a.revision - b.revision);
}

/** HTML del popup de una parada: la parada arriba y un bloque por camión debajo.
 *
 *  `soloPlaca` acota a un camión sin tocar el dibujo: la ruta y los marcadores son
 *  del VIAJE y no cambian con el filtro —los camiones paran juntos—, así que lo
 *  único que el filtro puede acotar honestamente es de quién se leen las mediciones.
 *  Si ese camión no registró nada en esta parada se dice, en vez de enseñar un
 *  popup vacío que parecería un fallo. */
export function paradaHtml(p, soloPlaca) {
  const dato = (etq, val) => `<div class="sv-tmap-f"><span>${etq}</span><b>${esc(val)}</b></div>`;
  const cams = soloPlaca ? p.camiones.filter((c) => c.placa === soloPlaca) : p.camiones;
  if (soloPlaca && !cams.length) {
    return `<div class="sv-tmap-pop">
      <div class="sv-tmap-pop-h">📍 Parada ${p.revision}</div>
      <div class="sv-tmap-pop-s">${esc(p.lugar || '—')}${p.hora ? ' · ' + esc(p.hora) : ''}</div>
      <div class="sv-tmap-pop-obs">${esc(soloPlaca)} no registró mediciones en esta parada.</div>
    </div>`;
  }
  const bloques = cams.map((c) => `<div class="sv-tmap-cam">
    <div class="sv-tmap-cam-h"><i style="background:${c.color}"></i>${esc(c.placa)}</div>
    ${dato('O₂', n1(c.o2) + ' mg/L')}
    ${dato('Temperatura', n1(c.temp) + ' °C')}
    ${dato('Actividad', c.actividad || '—')}
    ${dato('Alimentación', c.alimentacion || '—')}
  </div>`).join('');
  return `<div class="sv-tmap-pop">
    <div class="sv-tmap-pop-h">📍 Parada ${p.revision}</div>
    <div class="sv-tmap-pop-s">${esc(p.lugar || '—')}${p.hora ? ' · ' + esc(p.hora) : ''}</div>
    ${bloques}
    ${p.obs ? `<div class="sv-tmap-pop-obs">📝 ${esc(p.obs)}</div>` : ''}
    <div class="sv-tmap-pop-geo">${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}</div>
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

  /* UNA ruta: los camiones del viaje paran en los mismos puntos, así que dibujar
     una polilínea por camión las superponía exactamente. Ver la nota de arriba. */
  const paradas = paradasDelMapa(conPuntos);
  const linea = paradas.map((p) => [p.lat, p.lon]);
  if (linea.length > 1) {
    L.polyline(linea, { color: RUTA_COLOR, weight: 3, opacity: 0.75, dashArray: '6 5' }).addTo(map);
  }
  /* Se guardan marcador y parada juntos para poder RE-ACOTAR los popups sin volver a
     dibujar nada: el filtro por camión no mueve la ruta, así que redibujar sería
     tirar el mapa y montarlo otra vez para el mismo trazo — y en pantalla completa
     eso además expulsaría al usuario. */
  const marcas = paradas.map((p) => {
    const quien = p.camiones.map((c) => c.placa).join(', ');
    const mk = L.marker([p.lat, p.lon], {
      icon: iconoHtml(L, p.revision, RUTA_COLOR),
      title: `Parada ${p.revision}` + (quien ? ` · ${quien}` : ''),
    }).addTo(map).bindPopup(paradaHtml(p), { minWidth: 230 });
    return { mk, p };
  });

  const lim = limitesDe(conPuntos);
  if (lim) map.fitBounds(lim, { padding: [34, 34], maxZoom: 15 });
  // El contenedor nace con alto 0 dentro de un render por innerHTML: sin esto el
  // mapa se dibuja en una franja y las teselas salen cortadas.
  setTimeout(() => { try { map.invalidateSize(); } catch (_) { /* desmontado */ } }, 0);

  return {
    map,
    /* Leaflet mide el contenedor UNA vez y cachea el tamaño: al cambiarlo (pantalla
       completa, rotar la tablet) hay que decírselo o las teselas se quedan cortadas
       y los marcadores caen donde no es. Se expone en vez de que el llamante hurgue
       en `map`, para que la vista no dependa de la API de Leaflet. */
    invalidar() { try { map.invalidateSize(); } catch (_) { /* desmontado */ } },
    /** Acota los popups a un camión (o los devuelve a todos con `null`). NO redibuja:
     *  la ruta es del viaje y no depende del filtro. */
    filtrar(placa) {
      marcas.forEach(({ mk, p }) => {
        try { mk.setPopupContent(paradaHtml(p, placa || null)); } catch (_) { /* desmontado */ }
      });
    },
    destroy() { try { map.remove(); } catch (_) { /* ya desmontado */ } },
  };
}
