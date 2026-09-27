/* ============================================================
   BIOLOGÍA MOLECULAR · el TIPO DE MUESTRA (tejido) · 2026-09-26, usuario

   «Un gráfico útil y distintivo para la tendencia de las muestras con Heces, Branquias, Agua e Hisopado, y ver
   relaciones.» El tipo de muestra lo escribe la ficha en la columna «Otros» (sugerencias `["Heces","Branquias",
   "Hisopado","Agua"]` de engine.js); el resto de «Otros» son alimentos y algas, que no son un tejido y aquí no entran.
   Decisiones del usuario (2026-09-26): MATRIZ tejido × diagnóstico (el % de positivos de cada cruce, con su n) y, debajo,
   una FRANJA SEMANAL con las muestras de cada tipo y cuántas salieron positivas; entra también el PLEÓPODO (medido ese día:
   «Pleopodos» y «Pleópodo», 59 muestras, son el mismo tejido); y sigue los filtros de la vista.
   Módulo PURO: trabaja con las filas YA normalizadas por la vista (`f` ISO, `otros` y un 'Positivo' | 'Negativo' | ''
   por diagnóstico); el dibujo (D3) lo hace la vista.
   ============================================================ */
const plano = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Los tipos de muestra, en su orden: los dos de heces y branquias primero (ya con datos), luego los que llegarán. */
export const TIPOS_MUESTRA = [
  { clave: 'heces', etiqueta: 'Heces', re: /^heces\b/ },
  { clave: 'branquias', etiqueta: 'Branquias', re: /^branquias?\b/ },
  { clave: 'pleopodo', etiqueta: 'Pleópodo', re: /^pleopodos?\b/ },
  { clave: 'agua', etiqueta: 'Agua', re: /^agua\b/ },
  { clave: 'hisopado', etiqueta: 'Hisopado', re: /^hisopados?\b/ },
];

/** El tipo de muestra de un «Otros» ('heces' | 'branquias' | 'pleopodo' | 'agua' | 'hisopado'), o '' si no es un tejido
 *  (un alimento, un alga, o vacío). Sin tildes ni mayúsculas, y por el PRINCIPIO: «Branquias (hembra)» es branquias. */
export function tipoDeMuestra(otros) {
  const k = plano(otros);
  if (!k) return '';
  const t = TIPOS_MUESTRA.find((x) => x.re.test(k));
  return t ? t.clave : '';
}

const esResultado = (v) => v === 'Positivo' || v === 'Negativo';

/** La MATRIZ tipo × diagnóstico: por cada tipo, sus muestras y, por diagnóstico, cuántas se analizaron, cuántas dieron
 *  positivo y el % (null si no se analizó ninguna). */
export function matrizTejidos(filas, diags) {
  const porTipo = new Map(TIPOS_MUESTRA.map((t) => [t.clave, []]));
  for (const r of filas || []) { const t = tipoDeMuestra(r.otros); if (t) porTipo.get(t).push(r); }
  return TIPOS_MUESTRA.map((t) => {
    const rs = porTipo.get(t.clave);
    return {
      clave: t.clave, etiqueta: t.etiqueta, muestras: rs.length,
      celdas: diags.map((d) => {
        const an = rs.filter((r) => esResultado(r[d]));
        const pos = an.filter((r) => r[d] === 'Positivo').length;
        return { diag: d, analizadas: an.length, positivos: pos, pct: an.length ? Math.round((pos / an.length) * 100) : null };
      }),
    };
  });
}

/** Lunes (ISO) de la semana de una fecha ISO. */
export function lunesDe(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1));
  return d.toISOString().slice(0, 10);
}

/** La FRANJA SEMANAL: las semanas (lunes) de la primera a la última muestra de tejido —como mucho las `tope` últimas—
 *  y, por tipo y semana, cuántas muestras hubo y cuántas salieron positivas a ALGUNO de los diagnósticos `diags`. */
export function franjaTejidos(filas, diags, tope = 16) {
  const conTipo = (filas || []).map((r) => ({ r, t: tipoDeMuestra(r.otros) })).filter((x) => x.t && /^\d{4}-\d{2}-\d{2}$/.test(x.r.f));
  if (!conTipo.length) return { semanas: [], filas: TIPOS_MUESTRA.map((t) => ({ clave: t.clave, etiqueta: t.etiqueta, porSemana: [] })) };
  const lunes = conTipo.map((x) => lunesDe(x.r.f)).sort();
  const semanas = [];
  for (let s = lunes[0]; s <= lunes[lunes.length - 1]; s = new Date(Date.parse(s + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10)) semanas.push(s);
  const visibles = semanas.slice(-tope);
  return {
    semanas: visibles,
    filas: TIPOS_MUESTRA.map((t) => ({
      clave: t.clave, etiqueta: t.etiqueta,
      porSemana: visibles.map((s) => {
        const rs = conTipo.filter((x) => x.t === t.clave && lunesDe(x.r.f) === s).map((x) => x.r);
        return { muestras: rs.length, positivas: rs.filter((r) => diags.some((d) => r[d] === 'Positivo')).length };
      }),
    })),
  };
}
