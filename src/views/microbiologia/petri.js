/* ============================================================
   MICROBIOLOGÍA · Placa Petri (SVG puro, sin DOM)
   Port de petri_dashboard_completo_v2.html adaptado a datos reales y
   a tema claro/oscuro. Cada colonia = un patógeno; radio ∝ log₁₀(UFC);
   distribución por espiral de Fibonacci + relajación anti-solape.
   Funciones puras y testeables (math + cadenas SVG).
   ============================================================ */

// Paletas de agar por tema (la placa se ve bien en claro y oscuro).
const THEME = {
  dark: { agar0: '#1e3a22', agar1: '#152B18', agar2: '#0c1f0e', ring: '#3a6040', edge: '#4a7a50', text: '#6a9a70', rings: '#7AE87A', shadow: '.5' },
  light: { agar0: '#eef6f0', agar1: '#dfeee3', agar2: '#cfe6d6', ring: '#a8cdb2', edge: '#7fae8b', text: '#5a7a60', rings: '#2f8a4f', shadow: '.18' },
};

/** Radio de la colonia en escala log de UFC (entre mnR y mxR). */
export function ufcRadius(ufc, mn, mx, mnR = 6, mxR = 34) {
  if (!(ufc > 0)) return mnR;
  const lMn = Math.log10(Math.max(mn, 1)), lMx = Math.log10(Math.max(mx, 1)), lV = Math.log10(Math.max(ufc, 1));
  if (lMx === lMn) return (mnR + mxR) / 2;
  return mnR + ((lV - lMn) / (lMx - lMn)) * (mxR - mnR);
}

/** Coloca las colonias (espiral de Fibonacci + relajación). Determinista.
 *  Devuelve [{ x, y, r, c }] con (x,y) relativos al centro del plato. */
export function colonyLayout(colonies, dishR) {
  if (!colonies.length) return [];
  const ufcs = colonies.map((c) => c.ufc || 0);
  const mn = Math.min(...ufcs), mx = Math.max(...ufcs);
  const sorted = [...colonies].sort((a, b) => (b.ufc || 0) - (a.ufc || 0));
  const G = 2.399963; // ángulo áureo
  const placed = [];
  sorted.forEach((c, i) => {
    const r = ufcRadius(c.ufc, mn, mx);
    const sp = Math.sqrt(i + 0.5) * (dishR * 0.38), ang = i * G;
    let x = sp * Math.cos(ang), y = sp * Math.sin(ang);
    let ok = false, at = 0;
    while (!ok && at < 80) {
      ok = true;
      for (const p of placed) {
        const dx = x - p.x, dy = y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001, need = r + p.r + 4;
        if (d < need) { const push = need - d + 1; x += (dx / d) * push; y += (dy / d) * push; ok = false; }
      }
      const dc = Math.sqrt(x * x + y * y), max = dishR - r - 8;
      if (dc > max) { const sc = max / dc; x *= sc; y *= sc; }
      at++;
    }
    placed.push({ x, y, r, c });
  });
  return placed;
}

/** SVG de la placa. `colonies` = [{ id, color, glow?, ufc }]. `theme` = 'dark'|'light'. */
export function petriSVG(colonies, size, theme = 'light') {
  const P = THEME[theme] || THEME.light;
  const DR = size * 0.44, CX = size / 2, CY = size / 2;
  const placed = colonyLayout(colonies, DR);

  let defs = '', bodies = '';
  placed.forEach(({ c }) => {
    defs += `<radialGradient id="mc${c.id}" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="${c.color}" stop-opacity=".92"/><stop offset="60%" stop-color="${c.color}" stop-opacity=".55"/><stop offset="100%" stop-color="${c.color}" stop-opacity=".18"/></radialGradient>`;
  });
  placed.forEach(({ x, y, r, c }, i) => {
    const cx = (CX + x).toFixed(1), cy = (CY + y).toFixed(1), dl = i * 45;
    const ring = r > 12 ? `<circle cx="${cx}" cy="${cy}" r="${(r * 0.55).toFixed(1)}" fill="none" stroke="${c.color}" stroke-width=".7" stroke-opacity=".3"/>` : '';
    bodies += `<g class="mic-colony" data-cid="${c.id}" style="cursor:pointer;transform-origin:${cx}px ${cy}px;animation:micColony .5s ease-out ${dl}ms both;">
      <circle class="mic-colony-glow" cx="${cx}" cy="${cy}" r="${(r + 6).toFixed(1)}" fill="${c.glow || c.color}" opacity="0"/>
      <circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="url(#mc${c.id})"/>
      ${ring}
      <circle cx="${(CX + x - r * 0.2).toFixed(1)}" cy="${(CY + y - r * 0.2).toFixed(1)}" r="${(r * 0.18).toFixed(1)}" fill="${c.color}" fill-opacity=".4"/>
    </g>`;
  });
  const empty = colonies.length ? '' : `<text x="${CX}" y="${CY}" text-anchor="middle" dominant-baseline="middle" fill="${P.text}" font-size="12" opacity=".75">Sin colonias para esta selección</text>`;
  const rings = [0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${CX}" cy="${CY}" r="${(DR * (0.15 + i * 0.145)).toFixed(1)}" fill="none" stroke="${P.rings}" stroke-width=".5"/>`).join('');

  return `<svg id="micPetriSvg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;animation:micDishIn .4s ease-out;">
  <defs>
    <radialGradient id="micAgar" cx="42%" cy="38%" r="65%"><stop offset="0%" stop-color="${P.agar0}"/><stop offset="55%" stop-color="${P.agar1}"/><stop offset="100%" stop-color="${P.agar2}"/></radialGradient>
    <filter id="micShadow" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="#000" flood-opacity="${P.shadow}"/></filter>
    <clipPath id="micClip"><circle cx="${CX}" cy="${CY}" r="${DR - 1}"/></clipPath>
    ${defs}
  </defs>
  <circle cx="${CX}" cy="${CY}" r="${DR + 7}" fill="rgba(0,0,0,${P.shadow})" filter="url(#micShadow)"/>
  <circle cx="${CX}" cy="${CY}" r="${DR + 5}" fill="none" stroke="${P.ring}" stroke-width="8" opacity=".5"/>
  <circle cx="${CX}" cy="${CY}" r="${DR}" fill="url(#micAgar)"/>
  <g clip-path="url(#micClip)" opacity=".06">${rings}</g>
  <ellipse cx="${(CX - DR * 0.2).toFixed(1)}" cy="${(CY - DR * 0.3).toFixed(1)}" rx="${(DR * 0.38).toFixed(1)}" ry="${(DR * 0.2).toFixed(1)}" fill="white" opacity=".05" clip-path="url(#micClip)"/>
  <circle cx="${CX}" cy="${CY}" r="${DR - 1}" fill="none" stroke="${P.edge}" stroke-width="1.5" opacity=".4"/>
  ${bodies}${empty}
  </svg>`;
}

/** Mini-sparkline SVG de una serie.
 *  Si se pasan `labels` (una etiqueta de fecha por punto), cada vértice se vuelve un
 *  punto interactivo (`.mic-spark-pt`) con `data-spv` (valor) y `data-spd` (fecha) para
 *  mostrar un tooltip al pasar el cursor. */
export function sparklineSVG(points, color, w = 130, h = 34, labels = null) {
  if (points.length < 2) return '';
  const mn = Math.min(...points), mx = Math.max(...points), rng = mx - mn || 1;
  const coords = points.map((v, i) => ({
    x: (i / (points.length - 1)) * (w - 4) + 2,
    y: h - 4 - ((v - mn) / rng) * (h - 8),
  }));
  const pts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`);
  const gid = 'sp' + color.replace(/[^a-z0-9]/gi, '');
  const last = coords[coords.length - 1];
  // Vértices: interactivos (con tooltip) si hay etiquetas; si no, solo el último punto.
  const verts = labels
    ? coords.map((c, i) => `<circle class="mic-spark-pt" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.2" fill="${color}" data-spv="${points[i]}" data-spd="${(labels[i] || '').replace(/"/g, '&quot;')}" style="cursor:pointer"/>`).join('')
    : `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2.6" fill="${color}"/>`;
  return `<svg width="${w}" height="${h}" style="display:block;flex-shrink:0;overflow:visible">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".3"/><stop offset="100%" stop-color="${color}" stop-opacity=".02"/></linearGradient></defs>
    <path d="M ${pts[0]} L ${pts.slice(1).join(' L ')} L ${(w - 2)},${h} L 2,${h} Z" fill="url(#${gid})"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${verts}
  </svg>`;
}
