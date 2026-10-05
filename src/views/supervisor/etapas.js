/* ============================================================
   SUPERVISOR · etapas del proceso, frescura del dato y alertas (definición ÚNICA)
   Movido sin cambios desde executive.js (2026-10-04) porque ahora lo leen DOS vistas: la Vista
   Ejecutiva (fondo de sus tarjetas, leyenda «🦐 Etapa», alertas y «Actualizado») y la maqueta de
   🏭 Planta (color de cada tanque y su baliza de alerta). Así un mismo estadío tiene el mismo
   color y la misma alerta en las dos, sin una segunda copia de la regla.
   ============================================================ */
import { odLevel, tmpLevel, svLevel } from '../../core/format.js';

// Etapas del proceso por estadío (color del fondo de la tarjeta + franja-leyenda).
export const STAGE_CATS = [
  { key: 'desinfeccion',  label: 'Desinfección',  range: 'Pre-siembra', color: '#9E9E9E', bg: 'linear-gradient(135deg,#757575,#9E9E9E)' },
  { key: 'siembra',       label: 'Siembra',       range: 'N5–Z2',   color: '#E53935', bg: 'linear-gradient(135deg,#C62828,#E53935)' },
  { key: 'desarrollo',    label: 'Desarrollo',    range: 'Z3–PL3',  color: '#EF6C00', bg: 'linear-gradient(135deg,#E65100,#FB8C00)' },
  { key: 'transferencia', label: 'Transferencia', range: 'PL4–PL6', color: '#7B1FA2', bg: 'linear-gradient(135deg,#6A1B9A,#AB47BC)' },
  { key: 'crecimiento',   label: 'Crecimiento',   range: 'PL7–PL10', color: '#2E7D32', bg: 'linear-gradient(135deg,#2E7D32,#43A047)' },
  { key: 'cosecha',       label: 'Cosecha',       range: 'PL11+',   color: '#1565C0', bg: 'linear-gradient(135deg,#1565C0,#1E88E5)' },
];
export const CAT = Object.fromEntries(STAGE_CATS.map((c) => [c.key, c]));

/** Clasifica un estadío ("Z3", "PL5"…) en su etapa de proceso. null si desconocido. */
export function stageCategory(est) {
  const s = String(est || '').trim();
  if (!s || /^n\/?a$/i.test(s)) return null; // evita que "N/A" se clasifique como Nauplio (rojo)
  const m = s.toUpperCase().match(/^([A-Z]+)\s*([0-9]+)?/);
  if (!m) return null;
  const L = m[1], n = m[2] ? +m[2] : 0;
  if (L === 'N' || (L === 'Z' && n <= 2)) return CAT.siembra;
  if ((L === 'Z' && n >= 3) || L === 'M' || (L === 'PL' && n <= 3)) return CAT.desarrollo;
  if (L === 'PL' && n >= 4 && n <= 6) return CAT.transferencia;
  if (L === 'PL' && n >= 7 && n <= 10) return CAT.crecimiento;
  if (L === 'PL' && n >= 11) return CAT.cosecha;
  return null;
}

// Un parámetro está "fuera de rango" cuando su semáforo es malo o grave.
// (SV: solo 'grave' por ahora; 'malo' = 40–70% es común a mitad de ciclo.)
export const isAlert = (lvl) => lvl === 'malo' || lvl === 'grave';
export const svAlert = (sv) => svLevel(sv) === 'grave';
/** ¿El tanque (o módulo) está en alerta? OD o temperatura fuera de rango, o supervivencia grave. */
export const enAlerta = ({ od, tmp, sv }) => isAlert(odLevel(od)) || isAlert(tmpLevel(tmp)) || svAlert(sv);

/** Frescura del dato: etiqueta + color según días desde la última fecha. */
export function freshness(lastDate) {
  if (!lastDate || isNaN(lastDate)) return null;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const l0 = new Date(lastDate); l0.setHours(0, 0, 0, 0);
  const days = Math.round((t0 - l0) / 86400000);
  const label = days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
  const color = days <= 1 ? '#43A047' : days <= 3 ? '#F9A825' : '#E53935';
  return { label, color };
}
