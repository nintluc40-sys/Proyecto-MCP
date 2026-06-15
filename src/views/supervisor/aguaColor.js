/* ============================================================
   SUPERVISOR · paleta de Color del agua (espejo de la ficha de Calidad de Agua).
   Mapea el valor de la columna "Color" del Sheet a su tono (hex), clasificación
   (normal / problema) y un mensaje breve. Mensajes ajustables.
   ============================================================ */
const HEX = {
  'Café claro': '#C9A66B', 'Café oscuro': '#5B3A1A', 'Café verdoso': '#6C6B3B',
  'Oliva parduzco': '#6F6A2E', 'Café': '#8B5A2B',
  'Café rojizo': '#8C3B27', 'Blanco lechoso': '#ECEAE0', 'Negro verdoso': '#1E2A20',
  'Transparente': '#DCEFEF', 'Café amarillento': '#C3A140', 'Naranja oscuro': '#C2521B',
  'Café rojizo oscuro': '#5E241A', 'Café petróleo': '#2C3A34',
};
// Colores considerados normales (según la paleta de la ficha de Calidad de Agua).
const NORMAL = new Set(['Café claro', 'Café oscuro', 'Café verdoso', 'Oliva parduzco', 'Café']);
// Mensaje breve por color de problema (propuesto; ajustable).
const PROBLEM_MSG = {
  'Café rojizo': 'Posible proliferación/estrés — revisar.',
  'Blanco lechoso': 'Posible mortalidad o carga bacteriana — revisar.',
  'Negro verdoso': 'Materia orgánica/anoxia — revisar recambio.',
  'Transparente': 'Baja densidad algal — reforzar alimento/algas.',
  'Café amarillento': 'Cambio de coloración — vigilar.',
  'Naranja oscuro': 'Cambio de coloración — vigilar.',
  'Café rojizo oscuro': 'Coloración anómala — revisar.',
  'Café petróleo': 'Coloración anómala — revisar.',
};

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const KEYS = Object.keys(HEX);

/** Info del color del agua de un valor crudo del Sheet. null si vacío. */
export function tankColorInfo(raw) {
  if (!raw || !String(raw).trim()) return null;
  const key = KEYS.find((k) => norm(k) === norm(raw)) || String(raw).trim();
  const isNormal = NORMAL.has(key);
  return {
    name: key,
    hex: HEX[key] || '#cfd8dc',
    message: isNormal ? 'Coloración normal' : (PROBLEM_MSG[key] || 'Revisar coloración'),
    level: isNormal ? 'ok' : 'warn',
  };
}
