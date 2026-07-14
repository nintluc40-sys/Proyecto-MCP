// ════════════════════════════════════════════════════════
// Google Apps Script — Fichas Larvicultura
// script.google.com → Nuevo proyecto → pega este código completo
// Desplegar → Web App | Ejecutar como: Yo | Acceso: Cualquiera
// ════════════════════════════════════════════════════════
//
// SEGURIDAD:
//  • Allowlist estricta de hojas (M01-M10 + CIO)
//  • Sanitización de celdas (previene formula injection)
//  • Validación de schema (límites de filas/columnas)
//  • Rate limiting en memoria (30 req/min)
//  • Errores seguros (sin stack traces al cliente)
//  • Upsert con merge inteligente (sin duplicados)
//  • Normalización de Date objects para coincidencia exacta de clave
// ════════════════════════════════════════════════════════

const SS_ID = "1Rrpff6bD1pOQFsi2Lsagan3ttjncxJzXoXLPgtHM0Gs";

// ── Evidencias por QR (Fase 1) ─────────────────────────────────────
// Carpeta raíz de Drive donde se guardan las fotos (Módulo/Fecha/Corrida/
// Tanque) y token del portal. Valores inyectados desde el cliente para que
// SIEMPRE coincidan. La hoja "Evidencias" se autocrea con el registro.
const EV_FOLDER_ID = "1cwUeTxbsP3T4y8BwRVlHPaCh39KbIWWa";
const EV_TOKEN     = "evd_8f3kq2m9wzx7";
const EV_SHEET     = "Evidencias";
const PDF_SHEET    = "PDFs_Dia";

// Hojas permitidas — lista blanca estricta
const ALLOWED = [
  "Datos Larvicultura - M01","Datos Larvicultura - M02",
  "Datos Larvicultura - M03","Datos Larvicultura - M04",
  "Datos Larvicultura - M05","Datos Larvicultura - M06",
  "Datos Larvicultura - M07","Datos Larvicultura - M08",
  "Datos Larvicultura - M09","Datos Larvicultura - M10",
  "Datos Larvicultura - CIO",
  "Control_Tanque M01","Control_Tanque M02",
  "Control_Tanque M03","Control_Tanque M04",
  "Control_Tanque M05","Control_Tanque M06",
  "Control_Tanque M07","Control_Tanque M08",
  "Control_Tanque M09","Control_Tanque M10",
  "Control_Tanque CIO",
  "Lab_Algas",
  "Maduración Sala","Maduración Tanques","Maduración Lotes",
  "Maduración MATRIZ","Maduración Bitácora","Maduración Transferencias",
  "BIOMOL",
  "Registro_Supervisión",
  "Registro_Desinfección",
  "Microbiología",
  "Calidad de Agua",
  "Patología en Fresco"
];

const LIMITS = {
  // maxCols: 50 contempla las 48 cols actuales del schema + 2 de margen.
  // Schema actual: cols 0–28 (Calidad/PLG/Población/Técnico) + cols 29–36
  // (otro sistema, vacías) + cols 37–41 (Despacho) + cols 42–47 (Cal. Agua).
  datos:   { maxRows: 30,  maxCols: 50 },
  control: { maxRows: 300, maxCols: 8  },
  algas:   { maxRows: 500, maxCols: 28 },
  mad:     { maxRows: 1000, maxCols: 25 },
  biomol:  { maxRows: 100, maxCols: 20 },
  ast:     { maxRows: 100, maxCols: 25 },
  // Desinfección: 9 cols (Fecha…Fecha Elemento) + margen. maxRows holgado:
  // los 4 tipos suman ~50 elementos posibles por módulo/día.
  desinf:  { maxRows: 200, maxCols: 12 },
  // Microbiología: hoja ancha (~50 cols Fase 1) + margen para fases futuras.
  micro:   { maxRows: 300, maxCols: 80 },
  // Calidad de Agua: hoja ancha (14 contexto + 31 parámetros = 45 cols) + margen.
  cal:     { maxRows: 300, maxCols: 80 },
  // Patología en Fresco: 6 contexto + 15 columnas internas + Peso + Obs = 23 cols.
  pat:     { maxRows: 300, maxCols: 40 }
};

// Rate limit state: persistido en CacheService (60s TTL) para que sobreviva
// entre invocaciones de doPost. Cada Apps Script reinicia las variables
// globales, por eso NO se puede usar un objeto en memoria.
const RATE_MAX = 30, RATE_MS = 60000;

// ── TOKEN COMPARTIDO (autenticación de payload) ────────────────────
// Si esta constante está vacía → el GAS acepta cualquier petición que
// pase los demás controles (rate limit, allowlist, sanitización). Esto
// preserva la compatibilidad con clientes que no tengan token configurado.
// Para activar la autenticación: pon aquí la MISMA cadena secreta que
// configures en el cliente (Config → "Token compartido"), guarda y re-
// despliega el Web App. A partir de ese momento, peticiones sin token o
// con token distinto se rechazan con 401-like.
const SHARED_TOKEN = "";

// ── Punto de entrada POST ──────────────────────────────────
function doPost(e) {
  try {
    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch(err) {
      return respond({ status: "error", message: "Solicitud inválida" });
    }

    // Acción especial F3: compartir el PDF de una ficha. La app manda el HTML de
    // la ficha; el GAS lo convierte a PDF y lo guarda/comparte en Drive (PDFs/Fecha)
    // para descargarlo por el QR. Valida su propio token (EV_TOKEN), no va por la
    // allowlist de hojas.
    if (payload && payload.action === "pdfShare") {
      return respond(evPdfShare(payload));
    }

    // Rate limiting por session key. Se usan hasta 24 chars (no 8): el sessionId
    // del cliente empieza por Date.now().toString(36) (~8 chars que varían lento
    // entre usuarios), así que truncar a 8 hacía que muchos dispositivos
    // compartieran el mismo cubo y se limitaran entre sí. Los chars finales
    // (aleatorios) diferencian a cada dispositivo.
    var rKey = "k_" + String(e.parameter.z || "x").slice(0,24);
    if (!rateOk(rKey)) {
      Utilities.sleep(600);
      return respond({ status: "error", message: "Demasiadas solicitudes" });
    }

    // Validación de token compartido (opt-in): si SHARED_TOKEN está
    // configurado, exige coincidencia exacta con payload.token. Pequeño
    // delay para frustrar fuerza bruta. Si está vacío, se omite (BC).
    if (SHARED_TOKEN && String(payload.token || "") !== SHARED_TOKEN) {
      Utilities.sleep(800);
      return respond({ status: "error", message: "No autorizado" });
    }

    // Validar sheetName contra allowlist
    if (!payload.sheetName || typeof payload.sheetName !== "string") {
      return respond({ status: "error", message: "Parámetro inválido" });
    }
    if (ALLOWED.indexOf(payload.sheetName) === -1) {
      return respond({ status: "error", message: "Hoja no permitida" });
    }

    // ── Idempotencia (reqId) ─────────────────────────────────────────
    // El cliente envía payload.reqId = huella del envío. Si ese mismo reqId
    // ya se procesó con éxito en los ultimos ~10 min (CacheService), se
    // responde "ok" SIN volver a escribir. Esto neutraliza: reintentos
    // automaticos, vaciado de la cola offline y respuestas HTTP 200 ambiguas
    // — ninguno duplica filas, ni siquiera en hojas append-only (BIOMOL/AsT).
    // La marca se fija SOLO tras una escritura exitosa (mas abajo), nunca
    // antes: si la escritura falla, un reintento legitimo si procede.
    var reqId = (payload.reqId !== undefined && payload.reqId !== null)
      ? String(payload.reqId).slice(0, 120) : "";
    if (reqId) {
      try {
        var _idemHit = CacheService.getScriptCache().get("idem_" + reqId);
        if (_idemHit) {
          return respond({ status: "ok", sheet: payload.sheetName,
            rows: 0, upserted: 0, appended: 0, dedup: true });
        }
      } catch (_e) {}
    }

    // Validar rows
    if (!Array.isArray(payload.rows)) {
      return respond({ status: "error", message: "Formato inválido" });
    }

    var isCtrl   = payload.sheetName.indexOf("Control") !== -1;
    var isAlgas  = payload.sheetName === "Lab_Algas";
    var isBiomol = payload.sheetName === "BIOMOL";
    var isAst    = payload.sheetName === "Registro_Supervisión";
    var isDesinf = payload.sheetName === "Registro_Desinfección";
    var isMicro  = payload.sheetName === "Microbiología";
    var isCal    = payload.sheetName === "Calidad de Agua";
    var isPat    = payload.sheetName === "Patología en Fresco";
    // Routing Maduración: clave compuesta por columnas (0-indexed)
    var madKeyCols = null;
    if      (payload.sheetName === "Maduración Sala")     madKeyCols = [0,1];   // Fecha, Sala
    else if (payload.sheetName === "Maduración Tanques")  madKeyCols = [0,1,3]; // Fecha, Sala, Tanque (Lote editable, fuera de la clave)
    else if (payload.sheetName === "Maduración Lotes")    madKeyCols = [0,1,2]; // Fecha, Sala, Fila (Lote/Historial editables)
    // Registro reproductivo (upsert por clave, MERGE preserva campos permanentes vacíos):
    else if (payload.sheetName === "Maduración MATRIZ")         madKeyCols = [1];     // Trovan ID
    else if (payload.sheetName === "Maduración Bitácora")       madKeyCols = [0,1,2]; // Trovan + Fecha + Tipo
    else if (payload.sheetName === "Maduración Transferencias") madKeyCols = [0,3];   // TR-ID + Trovan
    var isMad   = madKeyCols !== null;
    // Columna Trovan ID (0-indexed) por hoja: se fuerza a formato TEXTO ("@") al
    // escribir, así Sheets NO reinterpreta el código como notación científica ni
    // le quita ceros a la izquierda (es un identificador, no un número).
    var madTrovanCol = payload.sheetName === "Maduración MATRIZ" ? 1
                     : payload.sheetName === "Maduración Bitácora" ? 0
                     : payload.sheetName === "Maduración Transferencias" ? 3
                     : -1;
    var limits  = isAlgas  ? LIMITS.algas
                : isMad    ? LIMITS.mad
                : isBiomol ? LIMITS.biomol
                : isAst    ? LIMITS.ast
                : isDesinf ? LIMITS.desinf
                : isMicro  ? LIMITS.micro
                : isCal    ? LIMITS.cal
                : isPat    ? LIMITS.pat
                : (isCtrl  ? LIMITS.control : LIMITS.datos);

    if (payload.rows.length > limits.maxRows) {
      return respond({ status: "error", message: "Límite de filas excedido" });
    }

    // ── LOCK: serializa el read-modify-write (open + upsert/append/delete)
    // entre invocaciones CONCURRENTES. Sin esto, dos dispositivos sincronizando
    // la MISMA hoja a la vez podían leer el mismo estado y pisarse (merge sobre
    // datos obsoletos) o duplicar filas en hojas append. waitLock espera hasta
    // 15s; si no obtiene el lock devuelve un error transitorio → el cliente
    // reintenta (idempotente vía reqId, así que nunca duplica).
    var _lock = LockService.getScriptLock();
    try { _lock.waitLock(15000); }
    catch (eLock) { return respond({ status: "error", message: "Servidor ocupado, reintenta" }); }
    try {

    // Sanitizar cada celda
    var rows;
    try {
      rows = payload.rows.map(function(row, ri) {
        if (!Array.isArray(row)) throw new Error("row_" + ri);
        return row.slice(0, limits.maxCols).map(function(cell) {
          return cleanCell(cell);
        });
      });
    } catch(sanErr) {
      return respond({ status: "error", message: "Error en datos" });
    }

    // Abrir o crear hoja
    var ss = SpreadsheetApp.openById(SS_ID);
    var ws = ss.getSheetByName(payload.sheetName);
    if (!ws) {
      ws = ss.insertSheet(payload.sheetName);
      fmtHeader(ws, (payload.headers || []).map(function(h){ return cleanCell(h); }), isCtrl);
    } else if (ws.getLastRow() === 0) {
      fmtHeader(ws, (payload.headers || []).map(function(h){ return cleanCell(h); }), isCtrl);
    }
    if (isMicro || isCal || isPat || isAlgas) ensureHeaders(ws, payload.headers || []);

    // Borrado explícito de sesiones (Microbiología / Calidad de Agua / Patología
    // en Fresco): permite VACIAR de la hoja una sesión completa. Un upsert/replace
    // con 0 filas no podría borrar nada (no hay clave que emparejar); por eso el
    // cliente envía deleteKeys = [[v0,...], ...] con los valores de keyCols.
    var _deleted = 0;
    if ((isMicro || isCal || isPat) && Array.isArray(payload.deleteKeys) &&
        payload.deleteKeys.length && Array.isArray(payload.keyCols)) {
      _deleted = deleteByKeyRows(ws, payload.keyCols, payload.deleteKeys);
    }

    if (rows.length === 0) {
      if (reqId) { try { CacheService.getScriptCache().put("idem_" + reqId, "1", 600); } catch (_e) {} }
      return respond({ status: "ok", sheet: payload.sheetName, rows: 0, upserted: _deleted, appended: 0 });
    }

    // Routing según hoja destino:
    //   • Maduración (3 hojas): UPSERT por clave compuesta (ver madKeyCols).
    //   • Lab_Algas: UPSERT por la columna "Sesión" (id estable por registro).
    //   • BIOMOL: APPEND puro — cada registro de diagnóstico es independiente.
    //   • Registro_Supervisión (AsT): UPSERT por columna ID estable — al editar
    //     y re-sincronizar un registro, su fila se REEMPLAZA (no se duplica).
    //   • Datos / Control: UPSERT estándar (Fecha+Módulo+Tanque[+Hora]).
    var result;
    if (isMad) {
      // Las 3 hojas de Maduración usan upsert con su clave compuesta:
      //   Sala     → [0,1]   Fecha+Sala
      //   Tanques  → [0,1,3] Fecha+Sala+Tanque (Lote editable, fuera de clave)
      //   Lotes    → [0,1,2] Fecha+Sala+Fila   (Lote/Historial editables)
      result = upsertMadRows(ws, rows, madKeyCols, madTrovanCol);
    }
    else if (isAlgas)  result = upsertAlgasRows(ws, rows);
    else if (isBiomol) {
      // BIOMOL: la grilla del día pide reemplazo por fecha (borra+reescribe esa
      // fecha → sin duplicados). Sin esa marca → append puro (compatibilidad).
      if (payload.replaceDate) result = replaceByDateRows(ws, rows, (payload.dateCol || 0), payload.replaceDate);
      else                     result = appendRows(ws, rows);
    }
    else if (isAst)    result = upsertAstRows(ws, rows);
    // Registro_Desinfección: upsert por clave compuesta Fecha+Módulo+Tipo de
    // Registro+Categoría+Elemento → re-sincronizar no duplica; editar Estado /
    // Observaciones / Fecha Elemento actualiza la misma fila.
    else if (isDesinf) result = upsertMadRows(ws, rows, [0,1,3,4,5]);
    else if (isMicro) {
      // Microbiología (hoja ancha): reemplazo por sesión. La clave la define el
      // cliente vía payload.keyCols = Fecha muestreo + Corrida + Departamento +
      // Formato + Sesión (id único por análisis) -> varios análisis del mismo
      // día/corrida/formato son sesiones distintas; editar/reenviar no duplica.
      if (payload.replaceKey && Array.isArray(payload.keyCols)) result = replaceByKeyRows(ws, rows, payload.keyCols);
      else result = appendRows(ws, rows);
    }
    else if (isCal) {
      // Calidad de Agua (hoja ancha físico-química): reemplazo por sesión. Clave
      // del cliente = Fecha + Corrida + Departamento + Formato + Sesión -> sin duplicados.
      if (payload.replaceKey && Array.isArray(payload.keyCols)) result = replaceByKeyRows(ws, rows, payload.keyCols);
      else result = appendRows(ws, rows);
    }
    else if (isPat) {
      // Patología en Fresco (hoja ancha): reemplazo por sesión. Clave del cliente
      // = Fecha + Corrida + Sesión -> editar/reenviar no duplica.
      if (payload.replaceKey && Array.isArray(payload.keyCols)) result = replaceByKeyRows(ws, rows, payload.keyCols);
      else result = appendRows(ws, rows);
    }
    else               result = upsertRows(ws, rows, isCtrl);
    // Marca el reqId como procesado (TTL 600s) — sólo tras escritura exitosa.
    if (reqId) {
      try { CacheService.getScriptCache().put("idem_" + reqId, "1", 600); } catch (_e) {}
    }
    return respond({
      status: "ok",
      sheet:    payload.sheetName,
      rows:     rows.length,
      upserted: result.upserted,
      appended: result.appended
    });

    } finally {
      try { _lock.releaseLock(); } catch (_e) {}
    }

  } catch(err) {
    console.error("[LARV]", err.toString());
    return respond({ status: "error", message: "Error interno. Intenta de nuevo." });
  }
}

// ── Sanitizar celda ──────────────────────────────────────
function cleanCell(val) {
  if (val === null || val === undefined || val === "") return "";
  if (typeof val === "number") {
    return isFinite(val) ? Math.min(1e12, Math.max(-1e12, val)) : "";
  }
  if (typeof val === "boolean") return String(val);
  var s = String(val).trim().slice(0, 500);
  // Eliminar chars que activan fórmulas en Sheets (=, +, -, @, y control chars)
  while (s.length > 0 && ("=+-@".indexOf(s.charAt(0)) !== -1 || s.charCodeAt(0) < 32)) {
    s = s.slice(1);
  }
  if (s.charAt(0) === "=") return "";
  return s;
}

// ── Rate limiting (CacheService — persistente entre invocaciones) ──
// Apps Script reinicia el contexto global en cada doPost, por lo que un
// objeto en memoria NO sirve para limitar la tasa. CacheService persiste
// con TTL configurable (segundos) y soporta lecturas/escrituras rápidas.
function rateOk(key) {
  try {
    var cache = CacheService.getScriptCache();
    var cKey  = "rl_" + key;
    var raw   = cache.get(cKey);
    var now   = Date.now();
    var data;
    if (raw) {
      try { data = JSON.parse(raw); } catch (_) { data = null; }
    }
    if (!data || typeof data.r !== "number" || now > data.r) {
      data = { n: 0, r: now + RATE_MS };
    }
    if (data.n >= RATE_MAX) return false;
    data.n++;
    // TTL en segundos — debe cubrir lo que resta de la ventana actual
    var ttlSec = Math.max(1, Math.ceil((data.r - now) / 1000));
    cache.put(cKey, JSON.stringify(data), ttlSec);
    return true;
  } catch (err) {
    // Si CacheService no está disponible (caso raro), permitir el request
    // antes que bloquear toda la aplicación.
    console.error("[LARV] rateOk fallback:", err.toString());
    return true;
  }
}

// ── Upsert rows ──────────────────────────────────────────
// DISEÑO CLAVE — sin duplicados:
//
// Clave de fila isCtrl: Fecha|Módulo|Tanque|Hora (SIN Corrida)
//   → una fila por combinación TQ+hora; cada sync posterior actualiza
//     los campos vacíos con los nuevos valores (guardado progresivo).
//   → Corrida es columna de datos, NO de identidad. Si cambia entre
//     syncs, se actualiza in-place sin crear duplicados.
//
// Clave de fila !isCtrl: Fecha|Módulo|Tanque (SIN Corrida)
//   → misma lógica: Corrida se merges como dato.
//
// LECTURA de Hora: getDisplayValues() en vez de getValues()
//   getValues() devuelve objetos Date para celdas con formato hh:mm,
//   cuyo getHours() en el servidor GAS (UTC) difiere de la hora local.
//   getDisplayValues() devuelve el string visible "02:00".."00:00"
//   independientemente del timezone y del formato de celda.
//
// ESCRITURA de Hora: setNumberFormat("@") antes de setValues()
//   → Sheets almacena el string "02:00" como texto, nunca lo convierte a Date.
function upsertRows(ws, newRows, isCtrl) {
  // Asegura que la hoja tenga al menos tantas columnas como la fila más
  // ancha del payload. Sin esto, ws.getRange(..,..,1,N) lanza error si el
  // sheet sólo tiene M < N cols. Se ejecuta una sola vez por sync.
  var widest = 0;
  for (var wi = 0; wi < newRows.length; wi++) {
    if (newRows[wi].length > widest) widest = newRows[wi].length;
  }
  if (widest > ws.getMaxColumns()) {
    ws.insertColumnsAfter(ws.getMaxColumns(), widest - ws.getMaxColumns());
  }

  var lastR   = ws.getLastRow();
  // Para isCtrl: leer valores de toda la hoja + display de la col Hora en una sola pasada.
  // getDisplayValues() en col Hora devuelve el string visible ("02:00"…"00:00")
  // sin depender del timezone ni del formato interno (Date vs string).
  var dataRange = ws.getDataRange();
  var data      = dataRange.getValues();
  var horaDisp  = null;
  if (isCtrl && lastR > 1) {
    horaDisp = ws.getRange(2, 2, lastR - 1, 1).getDisplayValues();
  }

  // Construir mapa de claves → posición de fila en sheet
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var hora = (horaDisp && horaDisp[i - 1])
      ? String(horaDisp[i - 1][0]).slice(0, 5)
      : timeStr(data[i][1]);
    var k = rowKey(data[i], isCtrl, hora);
    if (k) map[k] = { row: i + 1, idx: i };
  }

  var toAdd      = [];
  var updated    = 0;
  // Key columns by position — Corrida is NOT a key col (gets updated on re-sync)
  // Datos:   [0]Fecha [1]Corrida [2]Módulo [3]Tanque → keys: 0,2,3
  // Control: [0]Fecha [1]Hora [2]Corrida [3]Módulo [4]Tanque → keys: 0,1,3,4
  var keySet     = isCtrl ? {0:1,1:1,3:1,4:1} : {0:1,2:1,3:1};
  var pendingMap = {};               // deduplicación dentro del mismo batch

  for (var r = 0; r < newRows.length; r++) {
    var nr    = newRows[r];
    var k2    = inKey(nr, isCtrl);
    var entry = map[k2];

    if (entry && entry.row > 0) {
      // ── Fila existente: merge ────────────────────────────
      var ex     = data[entry.idx];
      var nc     = Math.max(ex.length, nr.length);
      var merged = [];
      for (var c = 0; c < nc; c++) {
        var e      = c < ex.length ? ex[c] : "";
        var n      = c < nr.length ? nr[c] : "";
        var nEmpty = (n === "" || n === null || n === undefined);
        if (keySet[c]) {
          // Key columns: preserve existing, fallback to new
          merged.push((e === "" || e === null || e === undefined) ? n : e);
        } else {
          // Data columns (incl. Corrida): use new value, fallback to existing
          merged.push(nEmpty ? e : n);
        }
      }
      if (isCtrl) ws.getRange(entry.row, 2, 1, 1).setNumberFormat("@");
      ws.getRange(entry.row, 1, 1, merged.length).setValues([merged]);
      fmtData(ws, entry.row, 1, merged.length, isCtrl);
      updated++;

    } else if (pendingMap[k2] !== undefined) {
      // ── Clave duplicada en el batch: fusionar ────────────
      var pi = pendingMap[k2];
      for (var pc = 0; pc < nr.length; pc++) {
        if (!keySet[pc] && nr[pc] !== "" && nr[pc] !== null && nr[pc] !== undefined) {
          toAdd[pi][pc] = nr[pc];
        }
      }

    } else {
      // ── Fila nueva ────────────────────────────────────────
      pendingMap[k2] = toAdd.length;
      toAdd.push(nr.slice());
      map[k2] = { row: -1, idx: -1 };
    }
  }

  var added = 0;
  if (toAdd.length > 0) {
    var startRow = lastRow(ws) + 1;
    var nc2      = toAdd[0].length;
    if (isCtrl) ws.getRange(startRow, 2, toAdd.length, 1).setNumberFormat("@");
    ws.getRange(startRow, 1, toAdd.length, nc2).setValues(toAdd);
    fmtData(ws, startRow, toAdd.length, nc2, isCtrl);
    added = toAdd.length;
  }
  return { upserted: updated, appended: added };
}


// ── Funciones de clave ────────────────────────────────────
// CLAVE SIN CORRIDA: Fecha+Módulo+Tanque (Datos) o +Hora (Control)
// Esto evita duplicados cuando el usuario cambia la corrida entre syncs.
// La corrida se actualiza via merge, no es parte de la identidad de la fila.

// rowKey: para filas leídas de Sheets. Recibe horaStr pre-calculado
//         desde getDisplayValues() para evitar problemas de timezone.
function rowKey(row, isCtrl, horaStr) {
  if (isCtrl) {
    // Clave: Fecha|Módulo|Tanque|Hora (sin Corrida)
    return [dStr(row[0]), String(row[3]), String(row[4]),
            (horaStr !== undefined && horaStr !== "") ? horaStr : timeStr(row[1])].join("|");
  }
  // Clave: Fecha|Módulo|Tanque (sin Corrida)
  return [dStr(row[0]), String(row[2]), String(row[3])].join("|");
}
// inKey: para filas entrantes del cliente (siempre strings)
function inKey(row, isCtrl) {
  return isCtrl
    // Fecha|Módulo|Tanque|Hora
    ? [String(row[0]).slice(0,10), String(row[3]), String(row[4]),
       String(row[1]).slice(0,5)].join("|")
    // Fecha|Módulo|Tanque
    : [String(row[0]).slice(0,10), String(row[2]),
       String(row[3])].join("|");
}

// dStr: normaliza fecha (Date o string) a "YYYY-MM-DD"
function dStr(val) {
  if (!val && val !== 0) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(val).slice(0, 10);
}
// timeStr: respaldo si getDisplayValues() no está disponible.
// Usa Utilities.formatDate para respetar timezone del script (más seguro que getHours()).
function timeStr(val) {
  if (!val && val !== 0) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "HH:mm");
  }
  return String(val).slice(0, 5);
}


// ── Formato ──────────────────────────────────────────────
function fmtData(ws, startRow, numRows, numCols, isCtrl) {
  ws.getRange(startRow, 1, numRows, numCols)
    .setFontSize(10).setFontFamily("Arial")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  ws.getRange(startRow, 1, numRows, 1).setNumberFormat("dd/mm/yyyy");
  if (isCtrl) {
    // CRÍTICO: formato "@" (texto plano) en columna Hora.
    // Evita que Sheets convierta "14:00" a objeto Date,
    // lo que causaba que rowKey() nunca coincidiera y duplicara filas.
    ws.getRange(startRow, 2, numRows, 1).setNumberFormat("@");
  }
}
function fmtHeader(ws, headers, isCtrl) {
  ws.appendRow(headers);
  ws.getRange(1, 1, 1, headers.length)
    .setBackground("#09192e").setFontColor("#ffffff")
    .setFontWeight("bold").setFontSize(10).setFontFamily("Arial")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  ws.setFrozenRows(1);
  // Aplica formato dd/mm/yyyy a TODA la columna Fecha (excepto la cabecera).
  // De este modo cualquier fila futura adopta el formato, aunque fmtData
  // no se ejecute todavía. Evita conflictos cuando la columna A está
  // vacía y Sheets aplica su heurística por defecto.
  if (headers.length >= 1 && ws.getMaxRows() > 1) {
    ws.getRange(2, 1, ws.getMaxRows() - 1, 1).setNumberFormat("dd/mm/yyyy");
  }
  // Para Control_Tanque: forzar col Hora a texto desde el inicio
  if (isCtrl && headers.length >= 2) {
    ws.getRange(1, 2, ws.getMaxRows(), 1).setNumberFormat("@");
  }
}

// Extiende la fila de encabezados si el payload trae más columnas que la hoja
// (p.ej. al sumar columnas de Microbiología en fases nuevas). No recrea la hoja.
function ensureHeaders(ws, headers) {
  if (!headers || !headers.length) return;
  var lastCol = ws.getLastColumn();
  if (lastCol >= headers.length) return;
  if (headers.length > ws.getMaxColumns()) ws.insertColumnsAfter(ws.getMaxColumns(), headers.length - ws.getMaxColumns());
  var slice = headers.slice(lastCol).map(function(h){ return cleanCell(h); });
  ws.getRange(1, lastCol + 1, 1, slice.length).setValues([slice])
    .setBackground("#09192e").setFontColor("#ffffff").setFontWeight("bold").setFontSize(10).setFontFamily("Arial")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  ws.setFrozenRows(1);
}

// ── Última fila con datos ────────────────────────────────
function lastRow(ws) {
  var lr = ws.getLastRow();
  return lr > 0 ? lr : 0;
}

// ── Append simple (queda como utilidad genérica) ──
function appendRows(ws, newRows) {
  var startRow = lastRow(ws) + 1;
  var nc       = newRows[0].length;
  ws.getRange(startRow, 1, newRows.length, nc).setValues(newRows);
  fmtData(ws, startRow, newRows.length, nc, false);
  return { upserted: 0, appended: newRows.length };
}

// ── Reescritura en bloque (sin N llamadas ws.deleteRow) ──────────────────
// Conserva el header + las filas que pasan keepPred(row) y añade addRows, en
// UNA sola escritura. Sustituye el patrón "deleteRow en bucle" (1 llamada API
// por fila → lento en hojas grandes) por: leer todo → filtrar en memoria →
// limpiar el área de datos → volcar el resultado de una pasada. Normaliza el
// ancho (rectangular) para setValues. Devuelve { removed, added }.
// El orden resultante = filas conservadas (orden original) + addRows al final,
// idéntico al del antiguo "borrar coincidentes y luego anexar".
function _rebuildSheet(ws, keepPred, addRows) {
  addRows = addRows || [];
  var data = ws.getDataRange().getValues();
  var kept = [], removed = 0;
  for (var i = 1; i < data.length; i++) {
    if (keepPred(data[i])) kept.push(data[i]); else removed++;
  }
  var body = kept.concat(addRows);
  var width = (data.length > 0) ? data[0].length : 0;
  for (var b = 0; b < body.length; b++) if (body[b].length > width) width = body[b].length;
  if (width > ws.getMaxColumns()) ws.insertColumnsAfter(ws.getMaxColumns(), width - ws.getMaxColumns());
  var norm = body.map(function(r) {
    if (r.length === width) return r;
    var c = r.slice();
    while (c.length < width) c.push("");
    return c.slice(0, width);
  });
  var lastDataRow = ws.getLastRow();
  if (lastDataRow > 1) ws.getRange(2, 1, lastDataRow - 1, ws.getMaxColumns()).clearContent();
  if (norm.length > 0) {
    ws.getRange(2, 1, norm.length, width).setValues(norm);
    fmtData(ws, 2, norm.length, width, false);
  }
  return { removed: removed, added: addRows.length };
}

// ── Reemplazo por fecha (BIOMOL grilla del día) ──────────
// Borra TODAS las filas cuya columna `dateCol` coincide con `dateStr`
// (yyyy-MM-dd) y luego agrega `newRows`. Permite "pegar y sincronizar" un día
// completo sin duplicar: cada envío deja la hoja con exactamente las filas de
// la grilla para esa fecha. No toca filas de otras fechas. Si no llega fecha,
// cae a append puro por seguridad (nunca borra a ciegas).
function replaceByDateRows(ws, newRows, dateCol, dateStr) {
  var col = dateCol || 0;
  var key = String(dateStr || "").slice(0, 10);
  if (!key) return appendRows(ws, newRows);
  var res = _rebuildSheet(ws, function(row){ return dStr(row[col]) !== key; }, newRows);
  return { upserted: res.removed, appended: res.added };
}

// -- Reemplazo por clave compuesta (Microbiología: grilla por sesión) --
// Borra todas las filas cuya clave (keyCols) coincide con alguna del envío y
// agrega las nuevas. Reemplaza cada sesión completa sin duplicar.
function replaceByKeyRows(ws, newRows, keyCols) {
  var present = {};
  for (var r = 0; r < newRows.length; r++) present[madInKey(newRows[r], keyCols)] = 1;
  var res = _rebuildSheet(ws, function(row){ return !present[madRowKey(row, keyCols)]; }, newRows);
  return { upserted: res.removed, appended: res.added };
}

// ── Borrado por clave compuesta (vaciar sesión en hojas anchas) ──────────
// Elimina las filas cuya clave (keyCols) coincide con alguna de deleteKeys.
// deleteKeys = array de tuplas con los valores de las columnas clave EN EL
// MISMO ORDEN que keyCols (compactas, no filas completas). Se usa para borrar
// de la hoja una sesión que el usuario eliminó del historial local
// (Microbiología / Calidad de Agua). No usa regex (en el template literal del
// HTML las secuencias \d colapsarían); la normalización de fecha la hace
// madRowKey al leer las celdas de la hoja (Date → yyyy-MM-dd).
function deleteByKeyRows(ws, keyCols, deleteKeys) {
  if (!deleteKeys || !deleteKeys.length || !keyCols || !keyCols.length) return 0;
  var present = {};
  for (var r = 0; r < deleteKeys.length; r++) {
    var dk = deleteKeys[r] || [];
    var parts = [];
    for (var j = 0; j < dk.length; j++) parts.push(String(dk[j] == null ? "" : dk[j]).trim());
    present[parts.join("|")] = 1;
  }
  var res = _rebuildSheet(ws, function(row){ return !present[madRowKey(row, keyCols)]; }, []);
  return res.removed;
}

// ── Upsert Registro_Supervisión (AsT) por columna ID estable ──
// Cada registro local de AsT viaja con un ID único en la ÚLTIMA columna del
// payload. Al re-sincronizar un registro editado, se localiza su fila por ese
// ID y se REEMPLAZA en sitio, en vez de añadir una fila nueva (lo que antes
// duplicaba la información). Filas antiguas sin ID (anteriores a este cambio)
// no tienen clave de coincidencia: un registro cuyo ID no se encuentre se
// añade como fila nueva (comportamiento heredado, sin pérdida de datos).
function upsertAstRows(ws, newRows) {
  var widest = 0;
  for (var wi = 0; wi < newRows.length; wi++) {
    if (newRows[wi].length > widest) widest = newRows[wi].length;
  }
  if (widest > ws.getMaxColumns()) {
    ws.insertColumnsAfter(ws.getMaxColumns(), widest - ws.getMaxColumns());
  }
  var idCol = widest - 1;               // ID = última columna del payload
  var data  = ws.getDataRange().getValues();

  // Mapa ID → número de fila del sheet (1-indexed) de filas ya existentes.
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var idv = (idCol < data[i].length) ? String(data[i][idCol]).trim() : "";
    if (idv) map[idv] = i + 1;
  }

  var toAdd = [], pending = {}, updated = 0;
  for (var r = 0; r < newRows.length; r++) {
    var nr = newRows[r];
    while (nr.length < widest) nr.push("");      // normaliza ancho
    var id = String(nr[idCol] != null ? nr[idCol] : "").trim();
    if (id && map[id]) {
      // Fila existente → reemplazo total en sitio (el registro es el mismo).
      ws.getRange(map[id], 1, 1, nr.length).setValues([nr]);
      fmtData(ws, map[id], 1, nr.length, false);
      updated++;
    } else if (id && pending[id] !== undefined) {
      // Mismo ID repetido dentro del batch → conserva la última versión.
      toAdd[pending[id]] = nr.slice();
    } else {
      if (id) pending[id] = toAdd.length;
      toAdd.push(nr.slice());
    }
  }

  var added = 0;
  if (toAdd.length > 0) {
    var startRow = lastRow(ws) + 1;
    ws.getRange(startRow, 1, toAdd.length, widest).setValues(toAdd);
    fmtData(ws, startRow, toAdd.length, widest, false);
    added = toAdd.length;
  }
  return { upserted: updated, appended: added };
}

// ── Upsert Lab_Algas (por "Sesión") ───────────────────────
// Clave = columna "Sesión" (ÚLTIMA columna del payload; id estable por registro,
// generado en el cliente). Al editar un registro —aunque cambien Corrida/Módulo/
// Sistema/Área/Lote/Día— y re-sincronizar, se ACTUALIZA la misma fila en vez de
// duplicarla. Merge: las columnas de datos toman el nuevo valor (si no viene vacío);
// la columna Sesión se preserva. Filas heredadas sin Sesión no se emparejan (se
// conservan). Sustituye la clave compuesta anterior (Fecha|Corrida|Módulo|Área|
// Sistema|Lote|Día), que hacía que editar cualquiera de esos campos creara fila nueva.
// NOTA: algasRowKey / algasInKey (abajo) quedan sin uso con esta clave.
function upsertAlgasRows(ws, newRows) {
  var widest = 0;
  for (var wi = 0; wi < newRows.length; wi++) if (newRows[wi].length > widest) widest = newRows[wi].length;
  if (widest > ws.getMaxColumns()) ws.insertColumnsAfter(ws.getMaxColumns(), widest - ws.getMaxColumns());

  var sidCol = widest - 1;                    // "Sesión" = ÚLTIMA columna del payload
  var data   = ws.getDataRange().getValues();

  // Mapa: valor de Sesión existente → fila (las filas heredadas sin Sesión no entran).
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var sv = (sidCol < data[i].length) ? String(data[i][sidCol] == null ? "" : data[i][sidCol]).trim() : "";
    if (sv) map[sv] = { row: i + 1, idx: i };
  }

  var toAdd = [], pending = {}, updated = 0;
  for (var r = 0; r < newRows.length; r++) {
    var nr = newRows[r];
    while (nr.length < widest) nr.push("");
    var sid   = String(nr[sidCol] == null ? "" : nr[sidCol]).trim();
    var entry = sid ? map[sid] : null;

    if (entry && entry.row > 0) {
      // Misma Sesión → merge: datos toman el nuevo valor no vacío; Sesión se preserva.
      var ex = data[entry.idx], nc = Math.max(ex.length, nr.length), merged = [];
      for (var c = 0; c < nc; c++) {
        var e = c < ex.length ? ex[c] : "";
        var n = c < nr.length ? nr[c] : "";
        var nEmpty = (n === "" || n === null || n === undefined);
        if (c === sidCol) merged.push((e === "" || e === null || e === undefined) ? n : e);
        else              merged.push(nEmpty ? e : n);
      }
      ws.getRange(entry.row, 1, 1, merged.length).setValues([merged]);
      fmtData(ws, entry.row, 1, merged.length, false);
      updated++;
    } else if (sid && pending[sid] !== undefined) {
      // Misma Sesión repetida dentro del mismo lote → fusiona los no vacíos.
      var pi = pending[sid];
      for (var pc = 0; pc < nr.length; pc++) {
        if (pc !== sidCol && nr[pc] !== "" && nr[pc] !== null && nr[pc] !== undefined) toAdd[pi][pc] = nr[pc];
      }
    } else {
      if (sid) { pending[sid] = toAdd.length; map[sid] = { row: -1, idx: -1 }; }
      toAdd.push(nr.slice());
    }
  }

  var added = 0;
  if (toAdd.length > 0) {
    var startRow = lastRow(ws) + 1;
    ws.getRange(startRow, 1, toAdd.length, widest).setValues(toAdd);
    fmtData(ws, startRow, toAdd.length, widest, false);
    added = toAdd.length;
  }
  return { upserted: updated, appended: added };
}

function algasRowKey(row) {
  // Fila leída de Sheets: row[0] puede ser Date (col formateada dd/mm/yyyy).
  // Clave: Fecha|Corrida_Larv|Modulo_Larv|Area_Algas|Sistema|Lote|Dia_Proceso.
  return [
    dStr(row[0]),
    String(row[1] == null ? "" : row[1]).trim(),
    String(row[2] == null ? "" : row[2]).trim(),
    String(row[3] == null ? "" : row[3]).trim(),
    String(row[4] == null ? "" : row[4]).trim(),
    String(row[5] == null ? "" : row[5]).trim(),
    String(row[6] == null ? "" : row[6]).trim()
  ].join("|");
}
function algasInKey(row) {
  // Fila entrante: row[0] siempre llega como string "yyyy-MM-dd".
  // Clave: Fecha|Corrida_Larv|Modulo_Larv|Area_Algas|Sistema|Lote|Dia_Proceso.
  return [
    String(row[0] == null ? "" : row[0]).slice(0, 10),
    String(row[1] == null ? "" : row[1]).trim(),
    String(row[2] == null ? "" : row[2]).trim(),
    String(row[3] == null ? "" : row[3]).trim(),
    String(row[4] == null ? "" : row[4]).trim(),
    String(row[5] == null ? "" : row[5]).trim(),
    String(row[6] == null ? "" : row[6]).trim()
  ].join("|");
}

// ── Upsert genérico para hojas de Maduración ──
// keyCols es un array de índices de columnas que forman la clave compuesta:
//   • Maduración Sala     → [0,1]   (Fecha, Sala)
//   • Maduración Tanques  → [0,1,3] (Fecha, Sala, Tanque) — Lote editable, fuera de la clave
//   • Maduración Lotes    → [0,1,2] (Fecha, Sala, Fila)   — Lote/Historial editables
// Si la clave coincide con una fila existente: merge (los nuevos valores
// no vacíos reemplazan al anterior; los vacíos preservan el dato actual).
function upsertMadRows(ws, newRows, keyCols, trovanCol) {
  if (trovanCol === undefined || trovanCol === null) trovanCol = -1;
  var lastR = ws.getLastRow();
  var data  = ws.getDataRange().getValues();
  var map   = {};
  var keySet = {};
  for (var j = 0; j < keyCols.length; j++) keySet[keyCols[j]] = 1;
  for (var i = 1; i < data.length; i++) {
    var k = madRowKey(data[i], keyCols);
    if (k) map[k] = { row: i + 1, idx: i };
  }
  var toAdd = [];
  var updated = 0;
  var pendingMap = {};
  for (var r = 0; r < newRows.length; r++) {
    var nr    = newRows[r];
    var k2    = madInKey(nr, keyCols);
    var entry = map[k2];
    if (entry && entry.row > 0) {
      var ex     = data[entry.idx];
      var nc     = Math.max(ex.length, nr.length);
      var merged = [];
      for (var c = 0; c < nc; c++) {
        var e      = c < ex.length ? ex[c] : "";
        var n      = c < nr.length ? nr[c] : "";
        var nEmpty = (n === "" || n === null || n === undefined);
        if (keySet[c]) {
          merged.push((e === "" || e === null || e === undefined) ? n : e);
        } else {
          merged.push(nEmpty ? e : n);
        }
      }
      // Trovan a TEXTO ("@") antes de escribir → preserva el código exacto (10 hex,
      // ceros a la izquierda) y evita que Sheets lo vuelva número/notación científica.
      if (trovanCol >= 0 && trovanCol < merged.length) ws.getRange(entry.row, trovanCol + 1, 1, 1).setNumberFormat("@");
      ws.getRange(entry.row, 1, 1, merged.length).setValues([merged]);
      fmtData(ws, entry.row, 1, merged.length, false);
      updated++;
    } else if (pendingMap[k2] !== undefined) {
      var pi = pendingMap[k2];
      for (var pc = 0; pc < nr.length; pc++) {
        if (!keySet[pc] && nr[pc] !== "" && nr[pc] !== null && nr[pc] !== undefined) {
          toAdd[pi][pc] = nr[pc];
        }
      }
    } else {
      pendingMap[k2] = toAdd.length;
      toAdd.push(nr.slice());
      map[k2] = { row: -1, idx: -1 };
    }
  }
  var added = 0;
  if (toAdd.length > 0) {
    var startRow = lastRow(ws) + 1;
    var nc2 = toAdd[0].length;
    if (trovanCol >= 0 && trovanCol < nc2) ws.getRange(startRow, trovanCol + 1, toAdd.length, 1).setNumberFormat("@");
    ws.getRange(startRow, 1, toAdd.length, nc2).setValues(toAdd);
    fmtData(ws, startRow, toAdd.length, nc2, false);
    added = toAdd.length;
  }
  return { upserted: updated, appended: added };
}

function madRowKey(row, keyCols) {
  var parts = [];
  for (var i = 0; i < keyCols.length; i++) {
    var c = keyCols[i];
    var v = row[c];
    if (v instanceof Date) {
      parts.push(Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd"));
    } else {
      parts.push(String(v == null ? "" : v).trim());
    }
  }
  return parts.join("|");
}
function madInKey(row, keyCols) {
  var parts = [];
  for (var i = 0; i < keyCols.length; i++) {
    var c = keyCols[i];
    var v = row[c];
    if (typeof v === "string" && /^d{4}-d{2}-d{2}/.test(v)) {
      parts.push(v.slice(0, 10));
    } else {
      parts.push(String(v == null ? "" : v).trim());
    }
  }
  return parts.join("|");
}

// ── Health check + portal de evidencias (Fase 1) ─────────
function doGet(e) {
  if (e && e.parameter && e.parameter.p === "ev") {
    return evPortalPage(e.parameter.t || "", e.parameter.m || "");
  }
  if (e && e.parameter && e.parameter.p === "evlist") {
    return evList(e.parameter.t || "", e.parameter.m || "", e.parameter.f || "");
  }
  if (e && e.parameter && e.parameter.p === "pdf") {
    return evPdfPage(e.parameter.t || "", e.parameter.m || "");
  }
  if (e && e.parameter && e.parameter.p === "rows") {
    return sheetRows(e.parameter.sheet || "", e.parameter.t || "");
  }
  return ContentService.createTextOutput("FichasLarv-OK");
}

// ── Lectura de filas de una hoja (para clientes SIN store del dashboard, como
// el monolito standalone). GET ?p=rows&sheet=<nombre>&t=<token>. Devuelve JSON
// {ok, sheet, headers, rows} con cada fila como objeto {cabecera: valor}. Sólo
// hojas de ALLOWED; respeta SHARED_TOKEN si está configurado (mismo gate que
// doPost). Fechas → yyyy-MM-dd. Tope 5000 filas.
function sheetRows(name, t) {
  var out = { ok: false, sheet: name, headers: [], rows: [] };
  try {
    if (SHARED_TOKEN && String(t) !== SHARED_TOKEN) { out.error = "No autorizado"; return _evJson(out); }
    if (ALLOWED.indexOf(name) === -1) { out.error = "Hoja no permitida"; return _evJson(out); }
    var ss = SpreadsheetApp.openById(SS_ID);
    var ws = ss.getSheetByName(name);
    if (!ws) { out.ok = true; return _evJson(out); }
    var vals = ws.getDataRange().getValues();
    if (vals.length < 1) { out.ok = true; return _evJson(out); }
    var headers = vals[0].map(function (h) { return String(h == null ? "" : h).trim(); });
    var rows = [];
    for (var i = 1; i < vals.length && rows.length < 5000; i++) {
      var r = vals[i], obj = {}, any = false;
      for (var c = 0; c < headers.length; c++) {
        var key = headers[c]; if (!key) continue;
        var cell = _rowsCell(r[c]);
        if (cell !== "") any = true;
        obj[key] = cell;
      }
      if (any) rows.push(obj);
    }
    out.ok = true; out.headers = headers; out.rows = rows;
    return _evJson(out);
  } catch (err) {
    out.error = "Error al leer la hoja"; return _evJson(out);
  }
}
function _rowsCell(v) {
  if (v instanceof Date) { return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd"); }
  return v == null ? "" : v;
}

// ── Evidencias F2: lista las fotos de un módulo (opcionalmente de una fecha) ──
// Devuelve JSON {ok, rows:[{fecha,modulo,corrida,tanque,archivo,url,fileId,hora}]}.
// Requiere token correcto. Las más recientes primero; tope 400 filas.
function evList(t, m, f) {
  var out = { ok: false, rows: [] };
  try {
    if (String(t) !== EV_TOKEN) { out.error = "No autorizado"; return _evJson(out); }
    var mod = _evClean(m);
    var fecha = f ? _evDate(f) : "";
    var ss = SpreadsheetApp.openById(SS_ID);
    var ws = ss.getSheetByName(EV_SHEET);
    if (!ws) { out.ok = true; return _evJson(out); }
    var vals = ws.getDataRange().getValues();
    var rows = [];
    for (var i = 1; i < vals.length; i++) {
      var r = vals[i];
      var rMod = String(r[1] == null ? "" : r[1]).trim();
      if (mod && rMod !== mod) continue;
      var rFecha = _evCellDate(r[0]);
      if (fecha && rFecha !== fecha) continue;
      rows.push({
        fecha:   rFecha,
        modulo:  rMod,
        corrida: String(r[2] == null ? "" : r[2]),
        tanque:  String(r[3] == null ? "" : r[3]),
        archivo: String(r[4] == null ? "" : r[4]),
        url:     String(r[5] == null ? "" : r[5]),
        fileId:  String(r[6] == null ? "" : r[6]),
        hora:    _evCellHora(r[7])
      });
    }
    rows.reverse();
    if (rows.length > 400) rows = rows.slice(0, 400);
    out.ok = true; out.rows = rows;
    return _evJson(out);
  } catch (err) {
    out.error = "Error al leer la hoja"; return _evJson(out);
  }
}
function _evJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _evCellDate(v) {
  if (v instanceof Date) { return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd"); }
  var s = String(v == null ? "" : v).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}
function _evCellHora(v) {
  if (v instanceof Date) { return Utilities.formatDate(v, Session.getScriptTimeZone(), "HH:mm"); }
  return String(v == null ? "" : v);
}

// Lista los PDFs de una fecha. Devuelve OBJETO PLANO (lo consume el portal vía
// google.script.run; NO un ContentService). Recientes primero; tope 200.
function evPdfListData(t, f) {
  var out = { ok: false, rows: [] };
  try {
    if (String(t) !== EV_TOKEN) { out.error = "No autorizado"; return out; }
    var fecha = f ? _evDate(f) : "";
    var ss = SpreadsheetApp.openById(SS_ID);
    var ws = ss.getSheetByName(PDF_SHEET);
    if (!ws) { out.ok = true; return out; }
    var vals = ws.getDataRange().getValues();
    var rows = [];
    for (var i = 1; i < vals.length; i++) {
      var r = vals[i];
      var rFecha = _evCellDate(r[0]);
      if (fecha && rFecha !== fecha) continue;
      rows.push({
        fecha:   rFecha,
        modulo:  String(r[1] == null ? "" : r[1]),
        archivo: String(r[2] == null ? "" : r[2]),
        url:     String(r[3] == null ? "" : r[3]),
        fileId:  String(r[4] == null ? "" : r[4]),
        hora:    _evCellHora(r[5])
      });
    }
    rows.reverse();
    if (rows.length > 200) rows = rows.slice(0, 200);
    out.ok = true; out.rows = rows;
    return out;
  } catch (err) {
    out.error = "Error al leer"; return out;
  }
}
// Registra el PDF en la hoja "PDFs_Dia" (se autocrea).
function _evPdfLog(fecha, modulo, archivo, url, id) {
  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var ws = ss.getSheetByName(PDF_SHEET);
    if (!ws) { ws = ss.insertSheet(PDF_SHEET); ws.appendRow(["Fecha", "Modulo", "Archivo", "URL", "FileId", "Hora"]); }
    ws.appendRow([fecha, modulo, archivo, url, id, new Date()]);
  } catch (e) {}
}
// F3: la app manda el HTML de una ficha; aquí se convierte a PDF (HTML→PDF de
// Apps Script), se guarda en PDFs/Fecha, se comparte por enlace y se registra en
// la hoja "PDFs_Dia" para que el portal lo liste y se descargue en otro equipo.
function evPdfShare(payload) {
  try {
    if (String(payload.token || "") !== EV_TOKEN) return { status: "error", message: "No autorizado" };
    var fecha = _evDate(payload.fecha);
    if (!fecha) return { status: "error", message: "Fecha inválida" };
    var modulo = _evClean(payload.modulo);
    var html = String(payload.html || "");
    if (!html) return { status: "error", message: "Ficha sin contenido" };
    var base = _evClean(payload.name) || ("Ficha_" + fecha);
    if (base.toLowerCase().slice(-4) === ".pdf") base = base.slice(0, -4);
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HHmmss");
    var fname = (modulo ? ("M" + modulo + "_") : "") + base + "_" + stamp + ".pdf";
    var pdf = Utilities.newBlob(html, "text/html", base + ".html").getAs("application/pdf").setName(fname);
    var folder = _evFolder(["PDFs", fecha]);
    var file = folder.createFile(pdf);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (eSh) {}
    _evPdfLog(fecha, modulo, fname, file.getUrl(), file.getId());
    return { status: "ok", url: file.getUrl() };
  } catch (err) {
    return { status: "error", message: "No se pudo generar el PDF: " + ((err && err.message) ? err.message : String(err)) };
  }
}
// Página HTML del portal de PDFs (servida por doGet ?p=pdf). SOLO DESCARGA: lista
// los PDFs de fichas compartidos desde la app y permite bajarlos en otro equipo
// sin instalar nada. Mismas reglas de escape que evPortalPage: sin backticks ni
// interpolación del cliente; cierre de script escapado; NO refleja el token (XSS).
function evPdfPage(t, m) {
  var safeToken = (String(t) === EV_TOKEN) ? EV_TOKEN : "";
  var h = ""
    + '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + "<title>PDFs del dia</title><style>"
    + "body{font-family:system-ui,Arial,sans-serif;margin:0;background:#0f172a;color:#e2e8f0;padding:16px}"
    + "h2{font-size:18px;margin:0 0 4px}p.s{color:#94a3b8;font-size:12px;margin:0 0 12px}"
    + "label{display:block;font-size:12px;margin:10px 0 3px;color:#94a3b8}"
    + "input{width:100%;box-sizing:border-box;padding:11px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:15px}"
    + "h3{font-size:14px;margin:18px 0 8px}"
    + ".rec{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;border-radius:8px;background:#1e293b;margin-bottom:6px}"
    + ".rn{font-size:12px;word-break:break-all}.dl{color:#38bdf8;font-weight:700;font-size:13px;text-decoration:none;white-space:nowrap}"
    + ".muted{color:#94a3b8;font-size:13px}"
    + "</style></head><body>"
    + "<h2>PDFs del dia</h2><p class=s>Descarga en este dispositivo los PDFs de las fichas compartidas desde el sistema. Elige la fecha.</p>"
    + '<label>Fecha</label><input type="date" id="f">'
    + '<h3>Disponibles para descargar</h3><div id="recs" class="muted">Cargando...</div>'
    + "<script>"
    + "var EV_T=" + JSON.stringify(safeToken) + ";"
    + "(function(){var f=document.getElementById('f');"
    + "var d=new Date(),z=function(n){return(n<10?'0':'')+n;};f.value=d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());"
    + "function renderList(res){var box=document.getElementById('recs');box.innerHTML='';box.className='';if(!res||!res.ok){box.className='muted';box.textContent='No se pudo cargar la lista.';return;}var rows=res.rows||[];if(!rows.length){box.className='muted';box.textContent='Sin PDFs compartidos para esta fecha.';return;}for(var i=0;i<rows.length;i++){var r=rows[i];var it=document.createElement('div');it.className='rec';var nm=document.createElement('div');nm.className='rn';nm.textContent=(r.modulo?('M'+r.modulo+' · '):'')+(r.archivo||'archivo.pdf')+(r.hora?(' · '+r.hora):'');it.appendChild(nm);var a=document.createElement('a');a.className='dl';a.textContent='⬇️ Descargar';a.setAttribute('href',r.fileId?('https://drive.google.com/uc?export=download&id='+encodeURIComponent(r.fileId)):(r.url||'#'));a.setAttribute('target','_blank');a.setAttribute('rel','noopener');it.appendChild(a);box.appendChild(it);}}"
    + "function loadList(){var box=document.getElementById('recs');box.className='muted';box.textContent='Cargando...';google.script.run.withSuccessHandler(renderList).withFailureHandler(function(){box.className='muted';box.textContent='No se pudo cargar la lista.';}).evPdfListData(EV_T,f.value);}"
    + "f.addEventListener('change',loadList);loadList();})();"
    + "<\/script></body></html>";
  return HtmlService.createHtmlOutput(h)
    .setTitle("PDFs del dia")
    .addMetaTag("viewport", "width=device-width,initial-scale=1");
}

// ── Evidencias: recibe UNA foto desde el portal (vía google.script.run) ──
function evReceive(obj) {
  try {
    if (!obj || String(obj.token || "") !== EV_TOKEN) return { ok: false, error: "No autorizado" };
    var modulo  = _evClean(obj.modulo);
    var fecha   = _evDate(obj.fecha);
    var corrida = _evClean(obj.corrida) || "SinCorrida";
    var tanque  = _evClean(obj.tanque)  || "SinTanque";
    if (!modulo) return { ok: false, error: "Falta el modulo" };
    if (!fecha)  return { ok: false, error: "Fecha invalida" };
    var data = String(obj.dataB64 || "");
    var comma = data.indexOf(",");
    if (comma !== -1) data = data.slice(comma + 1);
    if (!data) return { ok: false, error: "Imagen vacia" };
    var bytes = Utilities.base64Decode(data);
    if (bytes.length > 12 * 1024 * 1024) return { ok: false, error: "Imagen muy grande" };
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HHmmss");
    var name = "M" + modulo + "_" + fecha + "_" + corrida + "_" + tanque + "_" + stamp + ".jpg";
    var blob = Utilities.newBlob(bytes, "image/jpeg", name);
    var folder = _evFolder(["M" + modulo, fecha, corrida, tanque]);
    var file = folder.createFile(blob);
    // F2 galería: compartir la foto como "cualquiera con el enlace puede ver" para
    // que la miniatura (drive.google.com/thumbnail?id=...) se vea en cualquier
    // dispositivo sin login. Si el dominio restringe el uso compartido por enlace,
    // NO se aborta la subida (la foto queda guardada; solo no tendrá miniatura).
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (eSh) {}
    var url = file.getUrl();
    _evLog(fecha, modulo, corrida, tanque, name, url, file.getId());
    return { ok: true, url: url };
  } catch (err) {
    // Devuelve el motivo REAL (antes era genérico y ocultaba la causa). Lo más
    // común: la carpeta EV_FOLDER_ID no existe o no es accesible por la cuenta que
    // ejecuta el Web App ("Ejecutar como: yo"), o no se autorizó el permiso de Drive.
    return { ok: false, error: "No se pudo guardar: " + ((err && err.message) ? err.message : String(err)) };
  }
}
// Sanea un segmento de ruta (sin barras ni caracteres prohibidos por Drive).
function _evClean(v) {
  var s = String(v == null ? "" : v).trim().slice(0, 60);
  var bad = ["/", ":", "*", "?", "<", ">", "|", '"', String.fromCharCode(92)].join("");
  var out = "";
  for (var i = 0; i < s.length; i++) { out += (bad.indexOf(s.charAt(i)) !== -1) ? "-" : s.charAt(i); }
  return out;
}
// Valida fecha YYYY-MM-DD sin regex (los escapes \d colapsan dentro del GAS).
function _evDate(v) {
  var s = String(v == null ? "" : v).trim();
  if (s.length < 10) return "";
  s = s.slice(0, 10);
  if (s.charAt(4) !== "-" || s.charAt(7) !== "-") return "";
  if (isNaN(+s.slice(0, 4)) || isNaN(+s.slice(5, 7)) || isNaN(+s.slice(8, 10))) return "";
  return s;
}
// Crea/encuentra la ruta de subcarpetas bajo la carpeta raíz.
function _evFolder(parts) {
  var f = DriveApp.getFolderById(EV_FOLDER_ID);
  for (var i = 0; i < parts.length; i++) {
    var nm = parts[i]; if (!nm) continue;
    var it = f.getFoldersByName(nm);
    f = it.hasNext() ? it.next() : f.createFolder(nm);
  }
  return f;
}
// Registra la evidencia en la hoja "Evidencias" (se autocrea).
function _evLog(fecha, modulo, corrida, tanque, archivo, url, id) {
  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var ws = ss.getSheetByName(EV_SHEET);
    if (!ws) { ws = ss.insertSheet(EV_SHEET); ws.appendRow(["Fecha", "Modulo", "Corrida", "Tanque", "Archivo", "URL", "FileId", "Hora"]); }
    ws.appendRow([fecha, modulo, corrida, tanque, archivo, url, id, new Date()]);
  } catch (e) {}
}
// Página HTML del portal (servida por doGet). Sin backticks ni interpolación
// del cliente; el cierre de script va escapado para no romper el archivo.
function evPortalPage(t, m) {
  // SEGURIDAD: NO reflejar el t del usuario en el HTML servido. JSON.stringify no
  // neutraliza una etiqueta de cierre de script, as que un t malicioso poda
  // romper el bloque inline = XSS reflejado. Se incrusta el token del SERVIDOR
  // solo si el t recibido coincide; un token invlido deja EV_T vaco y las
  // subidas fallan con "No autorizado" (defensa en profundidad; m solo se compara).
  var safeToken = (String(t) === EV_TOKEN) ? EV_TOKEN : "";
  var modOpts = "";
  for (var i = 1; i <= 10; i++) { modOpts += '<option value="' + i + '"' + (("" + i) === ("" + m) ? " selected" : "") + ">Modulo " + i + "</option>"; }
  modOpts += '<option value="CIO"' + (m === "CIO" ? " selected" : "") + ">CIO</option>";
  var tqOpts = "";
  for (var j = 1; j <= 12; j++) { tqOpts += '<option value="' + j + '">' + j + "</option>"; }
  var h = ""
    + '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + "<title>Evidencias Larvicultura</title><style>"
    + "body{font-family:system-ui,Arial,sans-serif;margin:0;background:#0f172a;color:#e2e8f0;padding:16px}"
    + "h2{font-size:18px;margin:0 0 4px}p.s{color:#94a3b8;font-size:12px;margin:0 0 12px}"
    + "label{display:block;font-size:12px;margin:10px 0 3px;color:#94a3b8}"
    + "select,input{width:100%;box-sizing:border-box;padding:11px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:15px}"
    + "#send{margin-top:16px;width:100%;background:#0891b2;color:#fff;font-weight:700;border:none;padding:14px;font-size:16px;border-radius:10px}"
    + "#send:disabled{opacity:.5}#log{margin-top:14px;font-size:13px}"
    + ".it{padding:8px 10px;border-radius:7px;margin-bottom:5px;background:#1e293b}.ok{color:#34d399}.er{color:#f87171}"
    + "</style></head><body>"
    + "<h2>Subir evidencias</h2><p class=s>Las fotos se guardan en Google Drive por Modulo/Fecha/Corrida/Tanque.</p>"
    + '<label>Modulo</label><select id="m">' + modOpts + "</select>"
    + '<label>Fecha</label><input type="date" id="f">'
    + '<label>Corrida</label><input id="c" inputmode="numeric" placeholder="Ej. 562">'
    + '<label>Tanque</label><select id="t">' + tqOpts + "</select>"
    + '<label>Fotos (una o varias)</label><input type="file" id="file" accept="image/*" capture="environment" multiple>'
    + '<button id="send">Subir</button><div id="log"></div>'
    + "<script>"
    + "var EV_T=" + JSON.stringify(safeToken) + ";"
    + "(function(){var f=document.getElementById('f'),fi=document.getElementById('file'),log=document.getElementById('log'),btn=document.getElementById('send');"
    + "var d=new Date(),z=function(n){return(n<10?'0':'')+n;};f.value=d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());"
    + "function add(tx,c){var x=document.createElement('div');x.className='it '+(c||'');x.textContent=tx;log.appendChild(x);return x;}"
    + "function comp(file,cb){var im=new Image(),u=URL.createObjectURL(file);im.onload=function(){URL.revokeObjectURL(u);var mx=1600,w=im.width,hh=im.height;if(w>hh&&w>mx){hh=Math.round(hh*mx/w);w=mx;}else if(hh>=w&&hh>mx){w=Math.round(w*mx/hh);hh=mx;}var cv=document.createElement('canvas');cv.width=w;cv.height=hh;cv.getContext('2d').drawImage(im,0,0,w,hh);cb(cv.toDataURL('image/jpeg',0.75));};im.onerror=function(){cb(null);};im.src=u;}"
    + "function up(list,i){if(i>=list.length){btn.disabled=false;btn.textContent='Subir';add('Listo ('+list.length+' foto/s). Puedes elegir mas.','ok');fi.value='';return;}var it=add('Subiendo '+(i+1)+'/'+list.length+'...');comp(list[i],function(durl){if(!durl){it.textContent='No se pudo procesar la foto '+(i+1);it.className='it er';up(list,i+1);return;}google.script.run.withSuccessHandler(function(r){if(r&&r.ok){it.textContent='Foto '+(i+1)+' subida';it.className='it ok';}else{it.textContent=((r&&r.error)||'Error')+' (foto '+(i+1)+')';it.className='it er';}up(list,i+1);}).withFailureHandler(function(){it.textContent='Fallo la foto '+(i+1)+' (revisa conexion)';it.className='it er';up(list,i+1);}).evReceive({token:EV_T,modulo:document.getElementById('m').value,fecha:f.value,corrida:document.getElementById('c').value,tanque:document.getElementById('t').value,dataB64:durl});});}"
    + "btn.onclick=function(){var fs=fi.files;if(!fs||!fs.length){alert('Elige al menos una foto');return;}if(!document.getElementById('c').value.trim()&&!confirm('Sin numero de corrida. Continuar?'))return;btn.disabled=true;btn.textContent='Subiendo...';log.innerHTML='';up(fs,0);};})();"
    + "<\/script></body></html>";
  return HtmlService.createHtmlOutput(h)
    .setTitle("Evidencias Larvicultura")
    .addMetaTag("viewport", "width=device-width,initial-scale=1");
}

// ── Respuesta JSON ────────────────────────────────────────
function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}