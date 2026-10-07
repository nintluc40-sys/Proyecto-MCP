/* ============================================================
   CONFIGURACIÓN GLOBAL
   ============================================================ */

// Hoja de cálculo origen (la misma del sistema original).
// Editable desde la UI (override) sin tocar el código.
export const SHEETS_URL =
  'https://docs.google.com/spreadsheets/d/1Rrpff6bD1pOQFsi2Lsagan3ttjncxJzXoXLPgtHM0Gs/edit?usp=sharing';

// Consulta LIGERA antes de cada refresco (2026-10-07, usuario, punto 8): un Apps Script APARTE («MCP · consulta ligera»,
// NO el GAS del Registro: no toca su sello ni index (8)) devuelve la fecha de modificación del libro en Drive
// ({"ok":true,"mod":ms}, ~1,5 s). Si no cambió desde la última descarga, no se baja el XLSX (~14 MB). `libro` es el
// que vigila ESE script: con otro libro activo (override) no se pregunta. Ver core/marcaLibro.js. `ms`: 25 s porque
// Apps Script arranca en frío a veces (medido el 07-10, 8 consultas: mediana ~2,5 s, pero 10,3 y 19,3 s): con 10 s, una
// de cada cuatro se cortaba y se descargaba igual. Esperar no cuesta nada en pantalla (el refresco es de fondo).
export const CONSULTA_CAMBIOS = {
  url: 'https://script.google.com/macros/s/AKfycbxCMTkRIWfvJWlMY4mWyozpb0QvSS9YZUy_ZTGuKurndfJREQAcMLslTTT4Zv7pn5Bx4w/exec',
  libro: '1Rrpff6bD1pOQFsi2Lsagan3ttjncxJzXoXLPgtHM0Gs',
  ms: 25000,
};

export const FETCH_TIMEOUT_MS = 20000;

// El export XLSX de Google (camino principal: trae TODAS las hojas en una sola
// petición) se GENERA en el servidor de Google antes de transferirse: TTFB de
// varios segundos + workbook de varios MB. Si esta descarga cae por timeout, la
// app degrada al fallback CSV, que solo recupera la 1ª hoja si el documento no
// está "publicado en la web" → todas las vistas quedan sin datos. Por eso el
// camino XLSX usa su PROPIO timeout, más generoso que una petición normal.
export const XLSX_TIMEOUT_MS = 45000;

// Intervalo de auto-refresco silencioso (segundos). 5 min (decisión del usuario, 2026-09-24):
// cada ciclo descarga el libro entero (10–12 MB) y leerlo congela la pantalla; con 60 s eran
// ~470 MB/h por equipo. Además comprueba al volver a la pestaña y con ⟳ (core/refresh.js).
export const REFRESH_INTERVAL_S = 300;

// Umbrales de semáforo (Vista Supervisor) — extraídos fielmente del original.
export const THRESHOLDS = {
  // Supervivencia (%)
  sv:  { excelente: 90, bueno: 70, malo: 40 },
  // Oxígeno disuelto (mg/L): rango óptimo central 5–7
  od:  { optimo: [5, 7], bueno: [[4, 5], [7, 8]], malo: [[3, 4], [8, 9]] },
  // Temperatura (°C): rango óptimo central 31–33
  tmp: { optimo: [31, 33], bueno: [[29, 31], [33, 35]], malo: [[27, 29], [35, 37]] },
  // WQI · índice de calidad de agua (0–100, mayor = mejor). Cotas INFERIORES de
  // cada banda: >=85 Óptimo, >=70 Vigilancia, >=50 Deficiente, resto Crítico.
  // Fuente única: la consumen wqiBand (core/format.js), calRiskLevel
  // (microbiologia/calagua.data.js) y el medidor de Visitante, que deriva de
  // aquí los anchos de sus zonas en vez de llevarlos escritos a mano.
  wqi: { optimo: 85, vigilancia: 70, deficiente: 50 },
  // Microbiología · KPI «⚠️ En alerta» (General): % de muestras con algún patógeno en Moderado o
  // Elevado. Cotas INFERIORES: >=15 % Crítico, >=5 % Fuera; por debajo, Vigilancia si hay alguna.
  // (H-015, 2026-10-03: vivían escritas en microbiologia/index.js.)
  alertaMicro: { critico: 15, fuera: 5 },
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
