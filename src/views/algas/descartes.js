/* ============================================================
   ALGAS · la CLASE de cada descarte (2026-09-26, usuario)

   «Separar los descartes por el comentario de descarte por bueno, para clasificar cuáles se descartan por no uso y
   cuáles porque ya no se pudo usar y se descartaron por bueno.» Un registro está descartado si «Descartado» = Sí (la
   regla de siempre de la vista); su clase sale de sus OBSERVACIONES, que la ficha guarda como una lista de frases
   fijas (chips, `ALG_OBS_OPTS` de engine.js) separadas por comas:
     · «Por bueno»          — lleva «Descartado por bueno» (el cultivo estaba bien y no se llegó a usar). También su
                               nombre VIEJO, «Descartado nm», que la ficha renombró el 2026-09-13 (`ALG_OBS_RENOMBRADAS`);
     · «Por no uso»         — lleva «Tanque pasado del día de uso» y no la anterior;
     · «Por calidad / otros» — el resto (el cultivo no estaba bien, o no se dijo por qué).
   Decisión del usuario (2026-09-26): tres clases, y la TASA de descarte sigue siendo la de todos, con su reparto.
   Se compara la frase ENTERA, sin tildes ni mayúsculas: «Descartado por buenoX» no es la frase. Módulo puro.
   ============================================================ */
const plano = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const frases = (obs) => String(obs ?? '').split(',').map(plano).filter(Boolean);
const POR_BUENO = new Set(['descartado por bueno', 'descartado nm']);
const NO_USO = 'tanque pasado del dia de uso';

/** Las tres clases, en su orden, con su color (los de la paleta de la vista: verde, ámbar, rosa). */
export const DESCARTE_CLASES = [
  { clave: 'bueno', etiqueta: 'Por bueno', corta: 'bueno', color: '#186447', ayuda: 'Estaba bueno y no se llegó a usar (observación «Descartado por bueno»).' },
  { clave: 'nouso', etiqueta: 'Por no uso', corta: 'no uso', color: '#A06B27', ayuda: 'Se pasó su día de uso (observación «Tanque pasado del día de uso»).' },
  { clave: 'calidad', etiqueta: 'Por calidad / otros', corta: 'calidad', color: '#CA6378', ayuda: 'El resto: no estaba bien, o no se anotó el motivo.' },
];
export const CLASE_POR_CLAVE = Object.fromEntries(DESCARTE_CLASES.map((c) => [c.clave, c]));

/** ¿Descartado? La regla de siempre de la vista: «Sí» / «Si», sin importar mayúsculas. */
export const esDescartado = (valor) => /^s[ií]$/i.test(String(valor ?? '').trim());

/** La clase de un registro ('bueno' | 'nouso' | 'calidad'), o '' si no está descartado. */
export function claseDescarte(descartado, observaciones) {
  if (!esDescartado(descartado)) return '';
  const f = frases(observaciones);
  if (f.some((x) => POR_BUENO.has(x))) return 'bueno';
  if (f.includes(NO_USO)) return 'nouso';
  return 'calidad';
}

/** Cuántos descartes de cada clase hay en una lista de clases (las '' no cuentan). */
export function conteoDescartes(clases) {
  const c = { total: 0, bueno: 0, nouso: 0, calidad: 0 };
  for (const k of clases || []) if (k && k in c) { c[k]++; c.total++; }
  return c;
}

/** El reparto en una línea: «bueno 0 · no uso 5 · calidad 7»; vacío si no hay descartes. */
export const desgloseTexto = (c) => (c && c.total ? DESCARTE_CLASES.map((x) => x.corta + ' ' + c[x.clave]).join(' · ') : '');
