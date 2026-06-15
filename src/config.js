/* ============================================================
   CONFIGURACIÓN GLOBAL
   ============================================================ */

// Hoja de cálculo origen (la misma del sistema original).
// Editable desde la UI (override) sin tocar el código.
export const SHEETS_URL =
  'https://docs.google.com/spreadsheets/d/1Rrpff6bD1pOQFsi2Lsagan3ttjncxJzXoXLPgtHM0Gs/edit?usp=sharing';

export const FETCH_TIMEOUT_MS = 20000;

// Intervalo de auto-refresco silencioso (segundos).
export const REFRESH_INTERVAL_S = 60;

// Umbrales de semáforo (Vista Supervisor) — extraídos fielmente del original.
export const THRESHOLDS = {
  // Supervivencia (%)
  sv:  { excelente: 90, bueno: 70, malo: 40 },
  // Oxígeno disuelto (mg/L): rango óptimo central 5–7
  od:  { optimo: [5, 7], bueno: [[4, 5], [7, 8]], malo: [[3, 4], [8, 9]] },
  // Temperatura (°C): rango óptimo central 31–33
  tmp: { optimo: [31, 33], bueno: [[29, 31], [33, 35]], malo: [[27, 29], [35, 37]] },
};

// Orden biológico de estadios (N → Z → M → PL) para resolver el estadio más avanzado.
export const STAGE_ORDER = (() => {
  const s = [];
  for (let i = 1; i <= 6; i++) s.push('N' + i);
  for (let i = 1; i <= 3; i++) s.push('Z' + i);
  for (let i = 1; i <= 3; i++) s.push('M' + i);
  for (let i = 1; i <= 30; i++) s.push('PL' + i);
  return s;
})();
