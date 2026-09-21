// ════════════════════════════════════════════════════════
// Google Apps Script — Fichas Larvicultura
// script.google.com → Nuevo proyecto → pega este código completo
// Desplegar → Web App | Ejecutar como: Yo | Acceso: Cualquiera
// ════════════════════════════════════════════════════════
//
// SEGURIDAD:
//  • Allowlist estricta de hojas (ALLOWED: los módulos M01-M10 + CIO y las hojas propias de cada ficha —Maduración,
//    Biomol, Microbiología, Registro_*…—; la lista viva es ALLOWED, no este comentario)
//  • Sanitización de celdas (previene formula injection)
//  • Validación de schema (límites de filas/columnas)
//  • Rate limiting en memoria (30 req/min)
//  • Errores seguros (sin stack traces al cliente)
//  • Upsert con merge inteligente (sin duplicados)
//  • Normalización de Date objects para coincidencia exacta de clave
// ════════════════════════════════════════════════════════

// ── PRUEBA DE VERSIÓN (D8, 2026-09-13) ─────────────────────────────
// GET ?p=ver → {"ok":true,"version":GAS_VERSION,"caps":GAS_CAPACIDADES}, sin token y sin abrir ninguna hoja.
// El sello es la HUELLA del resto de este archivo (sha-256, 12 caracteres), y la exige la
// prueba gas-version.test.js del repo: tocar cualquier otra línea sin actualizarlo pone la
// suite en rojo, y la propia prueba dice el sello nuevo. Por eso ?p=ver no puede mentir.
// Para saber si el GAS desplegado es el del repo: ⚙ Config → Probar conexión, o abrir
// la URL del Web App con ?p=ver y comparar con esta línea.
const GAS_VERSION = "f170329aaddb";

// ── LO QUE ESTE GAS SABE HACER (2026-09-14) ─────────────────────────
// Va en ?p=ver junto al sello: es lo que un cliente tiene que saber ANTES de enviar. Un GAS que
// no nombra una capacidad no la tiene.
//  · "matriz-cuaterna" (2026-09-16): la MATRIZ se llavea por (Trovan · Piscina · Código genético ·
//    Lote), así que el mismo chip admite varios individuos. Sustituye a "matriz-reciclaje", que
//    nombraba la regla anterior: un chip = una hembra viva, y sólo se reutilizaba el de una muerta.
//  · "mad-alimentacion" (2026-09-15): conoce la hoja «Maduración Alimentación». Un GAS anterior
//    la rechazaría («Hoja no permitida») y el envío esperaría en la cola hasta caducar.
const GAS_CAPACIDADES = ["matriz-cuaterna", "mad-alimentacion"];

const SS_ID = "1Rrpff6bD1pOQFsi2Lsagan3ttjncxJzXoXLPgtHM0Gs";

// ── Evidencias por QR (Fase 1) ─────────────────────────────────────
// Carpeta raíz de Drive donde se guardan las fotos (Módulo/Fecha/Corrida/
// Tanque) y token del portal. Valores inyectados desde el cliente para que
// SIEMPRE coincidan. La hoja "Evidencias" se autocrea con el registro.
const EV_FOLDER_ID = "1cwUeTxbsP3T4y8BwRVlHPaCh39KbIWWa";
const EV_TOKEN     = "evd_8f3kq2m9wzx7";
const EV_SHEET     = "Evidencias";

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
  // Registro operativo de Maduración (2026-09-08). Llave por columna "ID", no
  // compuesta por posición: ver isMadId en doPost.
  "Maduración Ingreso","Maduración Movimientos","Maduración Fin de Ciclo",
  // Tratamientos de Maduración (2026-09-15): preventivos por lote y desinfección, por columna "ID".
  "Maduración Tratamientos",
  // Mortalidad de hembras en tanques de desove y de recuperación (2026-09-15), por columna "ID".
  "Maduración Mortalidad Desove",
  // Alimentación de Maduración (2026-09-15): una fila por fecha, sala y tanque, por columna "ID".
  "Maduración Alimentación",
  // Control Broodstock (2026-09-17): la CARGA SEMANAL del área. Una fila por (fecha de corte · piscina),
  // con llave POSICIONAL [0,1] al principio, así que la hoja puede crecer por el final sin migrar nada.
  // Es el aguas arriba del reproductivo: de estas piscinas salen las hembras que viven en la MATRIZ.
  "Maduración Broodstock",
  "BIOMOL",
  "Registro_Supervisión",
  "Registro_Desinfección",
  "Registro_Traslado",
  "Microbiología",
  "Calidad de Agua",
  "Patología en Fresco",
  "Marea"
];

const LIMITS = {
  // ⚠⚠ maxCols YA NO RECORTA: desde el 2026-08-30 un payload más ancho que su tope
  // se RECHAZA (ver doPost). Aun así los topes van con holgura, porque un rechazo en
  // producción el día que alguien añade una columna es un mal día para enterarse.
  // Datos Larvicultura son 49 columnas: 0–28 (Calidad/PLG/Población/Técnico),
  // 29–36 (otro sistema, vacías), 37–41 (Despacho), 42–47 (Cal. Agua) y 48 Toneladas.
  datos:   { maxRows: 30,  maxCols: 60 },
  // Control_Tanque son 8 (Fecha, Hora, Corrida, Módulo, Tanque, OD, Temp, Observación)
  // y el tope estaba EXACTAMENTE en 8: margen cero, la peor cifra posible.
  control: { maxRows: 300, maxCols: 12 },
  algas:   { maxRows: 500, maxCols: 28 },
  // Subido de 25 a 32 el 2026-09-08, al entrar el registro operativo. La hoja mas ancha
  // del registro es "Maduración Sala": con el tope en 25 el margen quedaba en cuatro
  // columnas, y ese margen justo es exactamente el error que ya se pago dos veces (Biomol
  // con 20, AsT con 25). Desde el 2026-08-30 un payload mas ancho se RECHAZA entero, asi
  // que el margen es lo que evita llegar siquiera al rechazo.
  // ⚠ AQUI PONIA "con 21 columnas" y caduco el 2026-09-15, cuando Sala gano "Toneladas".
  // El ancho NO se anota: lo dice buildMadPayload("salas") en el motor, o la propia hoja.
  mad:     { maxRows: 1000, maxCols: 32 },
  // Biomol: 23 columnas desde 2026-08-23 (las 19 anteriores MENOS la pareja
  // genérica, que se retiró, MÁS el Ct y las copias de WSSV, IHHNV y AHPND/EMS).
  // maxCols subió de 20 a 32 con holgura, y el despliegue lo lleva desde el 2026-08-24.
  // ⚠ POR QUÉ IMPORTÓ: mientras maxCols RECORTABA en silencio, el 20 anterior habría
  // dejado las SEIS columnas nuevas vacías en la hoja sin un solo error. Desde el
  // 2026-08-30 un payload más ancho se RECHAZA (ver la cabecera de este bloque), así
  // que hoy el fallo se ve; la holgura es lo que evita llegar siquiera al rechazo.
  // ⚠⚠ maxRows SUBE DE 100 A 200 EL 2026-09-16, y el motivo no es que la grilla vaya a crecer:
  // es que el tope del CLIENTE y el del SERVIDOR eran EL MISMO NÚMERO. BIO_GRID_MAX_ROWS vale 100,
  // así que una grilla llena mandaba 100 filas y pasaba sólo porque «100 > 100» es falso: margen
  // CERO, que es exactamente la cifra que este archivo ya pagó dos veces por otro lado (Biomol con
  // maxCols 20, AsT con 25). Un tope que se roza no avisa de nada hasta el día que se pasa.
  // 🔑 Y de paso deja de ser un par acoplado: hasta hoy, subir la grilla exigía tocar el GAS y
  // re-desplegarlo. Con 200, la grilla puede llegar a 150 sin volver por aquí.
  biomol:  { maxRows: 200, maxCols: 32 },
  // ast: 27 columnas desde 2026-08 (23 de datos + ID + Flacidez/Necrosis/Disparidad).
  // ⚠ POR QUÉ EL MARGEN: con el 25 anterior, y mientras maxCols todavía RECORTABA, un
  // payload de 27 perdía en silencio las 2 últimas columnas. Hoy eso se rechaza en vez
  // de recortarse, pero un rechazo en producción sigue siendo un mal día: de ahí la holgura.
  ast:     { maxRows: 100, maxCols: 32 },
  // Desinfección: 9 cols (Fecha…Fecha Elemento) + margen. maxRows holgado:
  // los 4 tipos suman ~50 elementos posibles por módulo/día.
  desinf:  { maxRows: 200, maxCols: 12 },
  // Microbiología: hoja ancha (76 cols base + EM: pH + Conteo BA/Lev. crudo·UFC = 81)
  // + margen para fases futuras. OJO: este tope DEBE cubrir todas las columnas, o doPost
  // rechaza el envío entero. Antes del 2026-08-30 era peor: truncaba la última en silencio.
  micro:   { maxRows: 300, maxCols: 90 },
  // Calidad de Agua: hoja ancha (14 contexto + 31 parámetros + Sesión + Lote + Sulfato = 48
  // cols, Sulfato desde el 2026-09-13 y AL FINAL: ensureHeaders la añade sola) + margen.
  cal:     { maxRows: 300, maxCols: 80 },
  // Patología en Fresco: 6 contexto + 15 columnas internas + Peso + Obs = 23 cols.
  pat:     { maxRows: 300, maxCols: 40 },
  // Marea: 16 cols (predicción INOCAR, 1 fila/día). maxRows holgado por encima del
  // tope del cliente (grilla hasta 400 filas): permite sincronizar meses de una vez.
  marea:   { maxRows: 420, maxCols: 20 },
  // Traslado: 29 columnas, una fila por (viaje, camión, revisión, tina).
  // Un viaje normal son 2 camiones x 4 revisiones x 8 tinas = 64 filas, pero el
  // formulario admite añadir camiones y paradas, y el cliente puede enviar VARIOS
  // viajes pendientes en un solo lote. 600 cubre ~9 viajes normales de golpe.
  // ⚠ Con menos de 29, doPost rechaza el envío entero. Antes del 2026-08-30 era peor: se
  // recortaba en silencio, que es el fallo que costó las 2 últimas columnas del AsT
  // cuando maxCols estaba en 25.
  tras:    { maxRows: 600, maxCols: 40 }
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

// Lee el token del proyecto de Apps Script (Configuración → Propiedades del script),
// NO del código. Así el secreto nunca entra en el repo, que es público.
//
// Para ACTIVAR la autenticación: añade una propiedad llamada SHARED_TOKEN con la
// misma cadena que hayas puesto en el cliente (Config -> "Token compartido"). No hace
// falta tocar el código ni volver a desplegar. Para desactivarla, borra la propiedad.
//
// ⚠ ORDEN OBLIGATORIO: configura el token en TODOS los dispositivos ANTES de crear la
// propiedad. El cliente solo manda el token si lo tiene configurado, así que activarlo
// antes deja a todo el mundo con "No autorizado" en pleno campo.
//
// Si la propiedad no existe, devuelve SHARED_TOKEN (hoy "") y todo sigue como estaba:
// eso es lo que permite desplegar este cambio sin riesgo.
var _tkCache = null;
function sharedToken_() {
  if (_tkCache !== null) return _tkCache;
  var v = SHARED_TOKEN;
  try {
    var p = PropertiesService.getScriptProperties().getProperty("SHARED_TOKEN");
    if (p) v = String(p);
  } catch (err) {
    // Sin permisos o sin propiedades: se queda con la constante. Nunca revienta la
    // petición por esto — un fallo aquí no puede tumbar la escritura de campo.
  }
  _tkCache = v;
  return v;
}

// ── Punto de entrada POST ──────────────────────────────────
function doPost(e) {
  try {
    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch(err) {
      return respond({ status: "error", message: "Solicitud inválida" });
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
    var _tkPost = sharedToken_();
    if (_tkPost && String(payload.token || "") !== _tkPost) {
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
    var isTras   = payload.sheetName === "Registro_Traslado";
    var isMicro  = payload.sheetName === "Microbiología";
    var isCal    = payload.sheetName === "Calidad de Agua";
    var isPat    = payload.sheetName === "Patología en Fresco";
    var isMarea  = payload.sheetName === "Marea";
    // Routing Maduración: clave compuesta por columnas (0-indexed)
    var madKeyCols = null;
    if      (payload.sheetName === "Maduración Sala")     madKeyCols = [0,1];   // Fecha, Sala
    /* ⚠⚠ 2026-09-17 · «Hora» (16) y «Parte» (17) ENTRAN EN LA LLAVE, y no es un adorno: la mortalidad se
       recoge CINCO VECES AL DÍA y con la llave anterior —(Fecha, Sala, Tanque)— el segundo registro del
       día PISABA al primero, así que el área venía sumando a mano en un papel. Ahora cada ronda es su
       propia fila y el día es su SUMA, que es lo que el libro mayor ya hacía: resta fila por fila.
       🔑 Un cliente ANTERIOR no manda esas dos columnas: su llave sale con las dos partes vacías, todas
       sus filas del día comparten llave y se comportan como antes. No corrompe nada; sólo no gana nada. */
    /* 🔑 P12 (2026-09-20) · ERA [0,1,3,16,17]. Esta hoja llevaba TRES columnas vacías —«Lote» y las dos
       «Población inicial»— que ya no se capturan (las declara el Ingreso) y sólo seguían ahí para no
       mover la llave posicional. Se retiran, y por eso la llave baja de golpe: mismas cinco columnas
       —Fecha, Sala, Tanque, Hora, Parte— en sus índices nuevos.
       ⚠⚠ ESTO Y LA CABECERA DEL CLIENTE VAN EN EL MISMO DESPLIEGUE, y la hoja de producción hay que
       recortarla a mano: si los tres no coinciden, la guarda de esquema rechaza el envío y NO escribe
       nada (falla cerrado, lo tecleado se queda en el dispositivo). Medido antes de tocarlo: las tres
       columnas estaban vacías en las 30 filas que había, así que no se pierde ni un dato.
       ⚠ Sin comillas invertidas en este comentario: viaja dentro de la plantilla GAS() de engine.js y
       una sola la cerraría. Pasó al escribirlo, y lo cazó el comparador de copias. */
    else if (payload.sheetName === "Maduración Tanques")  madKeyCols = [0,1,2,13,14]; // Fecha, Sala, Tanque, Hora, Parte
    else if (payload.sheetName === "Maduración Lotes")    madKeyCols = [0,1,2]; // Fecha, Lote, Código genético (la hoja de Desoves)
    // Registro reproductivo (upsert por clave, MERGE preserva campos permanentes vacíos):
    // 🔑 2026-09-16 · la MATRIZ va por la CUATERNA que identifica al individuo: Trovan, Piscina,
    // Código genético y Lote. Era sólo [1] (el Trovan), y por eso hacía falta llaveMatriz_ para
    // decidir por fechas a qué hembra del chip iba cada envío. Con la llave compuesta, cada
    // individuo tiene la suya y esa pregunta desaparece.
    else if (payload.sheetName === "Maduración MATRIZ")         madKeyCols = [1, 3, 4, 5];
    else if (payload.sheetName === "Maduración Bitácora")       madKeyCols = [0,1,2]; // Trovan + Fecha + Tipo
    else if (payload.sheetName === "Maduración Transferencias") madKeyCols = [0,3];   // TR-ID + Trovan
    var isMad   = madKeyCols !== null;
    // Maduración operativa (2026-09-08): estas NO usan clave compuesta por posición.
    // Llevan una columna "ID" determinista en la ÚLTIMA posición y van por
    // upsertAstRows CON MERGE (2026-09-09), que la localiza POR CABECERA y cae a la
    // última columna si la cabecera estuviera en blanco. Con el ID al final las dos rutas coinciden, que
    // es la leccion del defecto del AsT del 2026-08-15: con el ID en medio, el
    // respaldo apuntaba a otra columna y cada sync ANADIA una fila en vez de
    // reemplazarla.
    var isMadId = payload.sheetName === "Maduración Ingreso"
               || payload.sheetName === "Maduración Movimientos"
               || payload.sheetName === "Maduración Fin de Ciclo"
               || payload.sheetName === "Maduración Tratamientos"
               || payload.sheetName === "Maduración Mortalidad Desove"
               || payload.sheetName === "Maduración Alimentación";
    // Control Broodstock (R1, 2026-09-17): la carga SEMANAL es una FOTO del área, una fila por (Fecha de corte ·
    // Piscina). Hasta este cambio la hoja estaba en ALLOWED y en la firma pero NINGUNA rama la enrutaba: caía al
    // upsert de «Datos Larvicultura» (llave Fecha · Área · Fecha siembra, tope de 30 filas), que fundía dos
    // piscinas de la misma área sembradas el mismo día. Ver su rama más abajo.
    var isBrood = payload.sheetName === "Maduración Broodstock";
    // Columna Trovan ID (0-indexed) por hoja: se fuerza a formato TEXTO ("@") al
    // escribir, así Sheets NO reinterpreta el código como notación científica ni
    // le quita ceros a la izquierda (es un identificador, no un número).
    // Los Trovan del lector son 10 hexadecimales CON ceros a la izquierda (0007218CCC, ficticio):
    // en formato numérico un código todo-dígitos perdería los ceros y rompería la clave
    // de upsert, así que esta columna NO puede ir en "Automático".
    var madTrovanCol = payload.sheetName === "Maduración MATRIZ" ? 1
                     : payload.sheetName === "Maduración Bitácora" ? 0
                     : payload.sheetName === "Maduración Transferencias" ? 3
                     : -1;
    // Columna "Número" (nº de registro) de la MATRIZ: formato NUMÉRICO AUTOMÁTICO
    // ("General"), para que llegue como número y no como texto.
    var madNumCol = payload.sheetName === "Maduración MATRIZ" ? 0 : -1;
    var limits  = isAlgas  ? LIMITS.algas
                : isMad    ? LIMITS.mad
                : isMadId  ? LIMITS.mad
                : isBrood  ? LIMITS.mad
                : isBiomol ? LIMITS.biomol
                : isAst    ? LIMITS.ast
                : isTras   ? LIMITS.tras
                : isDesinf ? LIMITS.desinf
                : isMicro  ? LIMITS.micro
                : isCal    ? LIMITS.cal
                : isPat    ? LIMITS.pat
                : isMarea  ? LIMITS.marea
                : (isCtrl  ? LIMITS.control : LIMITS.datos);

    if (payload.rows.length > limits.maxRows) {
      return respond({ status: "error", message: "Límite de filas excedido" });
    }

    // ⚠⚠ Y LO MISMO CON EL ANCHO. Hasta el 2026-08-30 las filas se RECORTABAN a
    // maxCols sin decir nada y el GAS respondía "ok": así se perdieron dos columnas
    // del AsT en agosto, con el cliente informando de una escritura perfecta. Un dato
    // que no llega y nadie ve es lo más caro que puede pasar aquí, así que ahora se
    // rechaza igual que las filas. La única causa posible es que este GAS sea anterior
    // a la app que le habla, y eso se arregla re-desplegando, no tocando el registro.
    var anchoMax = 0;
    for (var ri0 = 0; ri0 < payload.rows.length; ri0++) {
      var f0 = payload.rows[ri0];
      if (f0 && f0.length > anchoMax) anchoMax = f0.length;
    }
    if (anchoMax > limits.maxCols) {
      return respond({ status: "error", message: "Límite de columnas excedido" });
    }

    // ── LOCK: serializa el read-modify-write (open + upsert/append/delete)
    // entre invocaciones CONCURRENTES. Sin esto, dos dispositivos sincronizando
    // la MISMA hoja a la vez podían leer el mismo estado y pisarse (merge sobre
    // datos obsoletos) o duplicar filas en hojas append. F1: waitLock espera
    // hasta 25s (< el timeout de 40s del cliente, F2a) para dar holgura y NO
    // rechazar por "Servidor ocupado" bajo ráfagas; con F4b el lock se sostiene
    // poco tiempo (escritura O(sesión)), así que la espera real casi nunca llega
    // a agotarse. Si aun así no obtiene el lock, devuelve un error transitorio →
    // el cliente reintenta/encola (idempotente vía reqId, así que nunca duplica).
    var _lock = LockService.getScriptLock();
    try { _lock.waitLock(25000); }
    catch (eLock) { return respond({ status: "error", message: "Servidor ocupado, reintenta" }); }
    try {

    // Sanitizar cada celda
    var rows;
    try {
      rows = payload.rows.map(function(row, ri) {
        if (!Array.isArray(row)) throw new Error("row_" + ri);
        // El recorte se conserva como cinturón: con la comprobación de ancho de arriba
        // ya no puede activarse, pero asegura que el rango nunca supere el tope.
        return row.slice(0, limits.maxCols).map(function(cell) {
          return cleanCell(cell);
        });
      });
    } catch(sanErr) {
      return respond({ status: "error", message: "Error en datos" });
    }

    // A4 (2026-09-14) · un envío SIN la firma del esquema vigente no escribe, aunque la hoja esté
    // vacía o no exista: ver MAD_ESQUEMA_FIRMA. Va ANTES de abrir o crear la hoja porque fmtHeader
    // escribiría las cabeceras viejas del envío y la guarda V3 de abajo ya no vería el desfase.
    var _sinFirma = firmaAusente_(payload.sheetName, payload.headers);
    if (_sinFirma) {
      return respond({ status: "error", message: "Esquema desactualizado en «" + payload.sheetName + "» (columna "
        + _sinFirma.col + ": este GAS espera «" + _sinFirma.cab + "»). Actualiza la app antes de sincronizar: no se escribió nada y lo tecleado sigue en este dispositivo." });
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
    // isAst se suma en 2026-08: así las columnas nuevas del AsT (Flacidez, Necrosis,
    // Disparidad) se crean SOLAS al final de la hoja en la primera sincronización, sin
    // que nadie tenga que tocar a mano la hoja de producción.
    // Se llama SIEMPRE, no solo para las hojas de laboratorio. ensureHeaders es inocuo
    // cuando la hoja ya es igual de ancha que el payload (sale por getLastColumn), y con
    // la lista blanca anterior las hojas "Datos Larvicultura" quedaban fuera: upsertRows
    // sí ensancha la hoja para que quepa la fila, así que al añadir una columna al final
    // (p.ej. Toneladas, 2026-08) el DATO entraba en la columna nueva y su CABECERA se
    // quedaba en blanco. Llamarlo siempre lo cubre y evita repetir el caso a futuro.
    // V3 (2026-09-13) · un cliente con el ESQUEMA VIEJO no escribe: ver MAD_ESQUEMA_VIGILADO.
    // Va ANTES de ensureHeaders y de cualquier escritura, y dentro del candado: el finally
    // lo suelta también al rechazar. El reqId no se marca, así que un reintento tras
    // actualizar la app entra normal. El mensaje nombra la columna de la HOJA, nunca lo que
    // mandó el cliente.
    if (MAD_ESQUEMA_VIGILADO.indexOf(payload.sheetName) !== -1 && Array.isArray(payload.headers)
        && ws.getLastRow() > 0 && ws.getLastColumn() > 0) {
      // PE1.2 (2026-09-16) · QUIÉN TIENE EL ESQUEMA VIEJO. Si la hoja tiene firma (MAD_ESQUEMA_FIRMA), el envío ya la
      // pasó más arriba: esta app trae el esquema VIGENTE y lo viejo es la cabecera de la HOJA. El aviso decía siempre
      // «Actualiza la app» y mandaba a arreglar lo que ya estaba bien (Ingreso y Lotes conservan su cabecera de prueba).
      // Sin firma no se puede saber cuál de los dos es el viejo. Sigue sin repetir lo que mandó el cliente, y sin las
      // palabras que el cliente lee como «servidor ocupado» (reintentar ese rechazo no arreglaría nada).
      var _conFirma = Object.prototype.hasOwnProperty.call(MAD_ESQUEMA_FIRMA, payload.sheetName);
      var _desfase = esquemaIncompatible_(ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0], payload.headers);
      if (_desfase) {
        return respond({ status: "error", message: "Esquema desactualizado en «" + payload.sheetName + "» (columna "
          + _desfase.col + ": la hoja espera «" + _desfase.hoja + "»). " + (_conFirma
          ? "Esta app trae el esquema vigente: la cabecera vieja es la de la HOJA, que hay que vaciar con su fila 1 (o corregir esa cabecera). No se escribió nada y lo tecleado sigue en este dispositivo."
          : "Actualiza la app antes de sincronizar; si ya está al día, la cabecera vieja es la de la hoja. No se escribió nada y lo tecleado sigue en este dispositivo.") });
      }
    }
    ensureHeaders(ws, payload.headers || []);

    // ⚠ AQUÍ HUBO un borrado explícito de sesiones por payload.deleteKeys
    // (Microbiología / Calidad de Agua / Patología). RETIRADO el 2026-08-30 porque
    // NINGÚN cliente lo enviaba: el botón de la papelera del historial borra sólo del
    // dispositivo, y su propio rótulo lo dice. El comentario que había aquí describía
    // un comportamiento del cliente que no existía.
    // Y no era una rama muerta inofensiva: con SHARED_TOKEN vacío doPost no pide
    // autenticación, así que era un borrado de filas de PRODUCCIÓN al alcance de
    // cualquiera con la URL — y la URL va dentro del JavaScript público.
    // Si algún día el borrado local debe llegar a la hoja, vuelve: pero con la
    // autenticación puesta y decidido a propósito, no como resto de otra cosa.

    if (rows.length === 0) {
      if (reqId) { try { CacheService.getScriptCache().put("idem_" + reqId, "1", 600); } catch (_e) {} }
      return respond({ status: "ok", sheet: payload.sheetName, rows: 0, upserted: 0, appended: 0 });
    }

    // Routing según hoja destino:
    //   • Maduración (Sala, Tanques, Lotes y las tres del reproductivo): UPSERT por clave compuesta (ver madKeyCols).
    //   • Lab_Algas: UPSERT por la columna "Sesión" (id estable por registro).
    //   • BIOMOL: APPEND puro — cada registro de diagnóstico es independiente.
    //   • Registro_Supervisión (AsT): UPSERT por columna ID estable — al editar
    //     y re-sincronizar un registro, su fila se REEMPLAZA (no se duplica).
    //   • Maduración Broodstock: REEMPLAZO por (Fecha de corte · Piscina), con la llave fijada aquí.
    //   • Datos / Control: UPSERT estándar (Fecha+Módulo+Tanque[+Hora]).
    var result;
    if (isMad) {
      // Las hojas POSICIONALES del registro operativo usan upsert con su clave compuesta (las del reproductivo, en madKeyCols):
      //   Sala     → [0,1]   Fecha+Sala
      //   Tanques  → [0,1,2,13,14] Fecha+Sala+Tanque+Hora+Parte (P12, 2026-09-20: era [0,1,3,16,17],
      //              con tres columnas vacías delante que se retiraron)
      //   Lotes    → [0,1,2] Fecha+Lote+Código genético (la hoja de Desoves desde el 2026-09-08)
      // D2 (2026-09-13) · la llave de Desoves se guarda como TEXTO. Sheets convierte lo que
      // parece número o fecha: un código «0766» se guardaría como 766 y «3-5» como una fecha,
      // así que al volver a la fila —N2 o N5, días después— la llave leída no casaría con la
      // enviada y se AÑADIRÍA otra fila: el desove quedaría partido en dos. Se fuerza «@» en
      // Lote y Código genético ANTES de escribir, como con el Trovan ID del reproductivo. Si la
      // hoja se queda corta se amplía primero, para que el formato cubra también las filas
      // nuevas. Las celdas que ya estaban escritas conservan su valor.
      if (payload.sheetName === "Maduración Lotes") {
        var _filasNecesarias = lastRow(ws) + rows.length;
        if (_filasNecesarias > ws.getMaxRows()) ws.insertRowsAfter(ws.getMaxRows(), _filasNecesarias - ws.getMaxRows());
        if (ws.getMaxRows() > 1) ws.getRange(2, 2, ws.getMaxRows() - 1, 2).setNumberFormat("@");
      }
      // R2 (2026-09-17) · la «Hora» del parte de Tanques está en su LLAVE: se escribe como TEXTO por lo mismo que D2.
      // Sin el formato, Sheets guarda «08:30» como una HORA, madRowKey la lee como una fecha de 1899 y ningún reenvío
      // del mismo parte vuelve a casar: la hoja ganaría una fila por reenvío y el libro restaría la mortalidad dos
      // veces. Sólo si la hoja ya llega a esa columna: un cliente anterior no la trae.
      // ⚠⚠ P12 (2026-09-20) · ESE NÚMERO ES LA COLUMNA DE «Hora» Y SE MUEVE CON LA CABECERA. Era la 17; al retirar
      // las tres columnas vacías de delante pasó a la 14. Lo destaparon las pruebas de R2, no una revisión: con el 17
      // el formato caía sobre otra columna, la hora se guardaba como fecha y CADA reenvío añadía una fila. Es el mismo
      // acople posicional que la llave, escondido en otro sitio. Si la cabecera cambia, esto cambia con ella.
      if (payload.sheetName === "Maduración Tanques") {
        var _filasTq = lastRow(ws) + rows.length;
        if (_filasTq > ws.getMaxRows()) ws.insertRowsAfter(ws.getMaxRows(), _filasTq - ws.getMaxRows());
        if (ws.getMaxRows() > 1 && ws.getMaxColumns() >= 14) ws.getRange(2, 14, ws.getMaxRows() - 1, 1).setNumberFormat("@");
      }
      // ⚠ 2026-09-16 · aquí se le pasaba llaveMatriz_(rows) a la MATRIZ: una llave a medida que
      // decidía por fechas y muertes a qué hembra del chip iba cada envío, y que RECHAZABA el envío
      // entero cuando no encajaba. Con la identidad por cuaterna, la llave posicional normal ya
      // distingue a cada individuo, así que la MATRIZ pasa por el mismo camino que las demás.
      // V2 (2026-09-18) · salvo las filas de un cliente ANTERIOR a la cuaterna: ver llaveMatrizCliente_.
      result = upsertMadRows(ws, rows, madKeyCols, madTrovanCol, madNumCol,
        payload.sheetName === "Maduración MATRIZ" ? llaveMatrizCliente_(rows, madKeyCols) : null);
      if (result.error) return respond({ status: "error", message: result.error });
    }
    else if (isAlgas)  result = upsertAlgasRows(ws, rows);
    else if (isBiomol) {
      // BIOMOL: reemplazo por SESIÓN (columna "Sesión"), igual que Lab_Algas y
      // Microbiología. Un mismo día lleva varios análisis independientes —repro-
      // ductores por la mañana, larvas por la tarde— y cada uno se sube por
      // separado: reemplazar por FECHA hacía que el último borrase a los anteriores.
      // Se conserva la rama por fecha, que el cliente todavía usa una vez por día
      // heredado para migrar sus filas (las escritas antes de existir la columna
      // Sesión no tienen con qué emparejarse). Sin ninguna marca → append puro.
      if (payload.replaceKey && Array.isArray(payload.keyCols)) result = replaceByKeyRows(ws, rows, payload.keyCols);
      else if (payload.replaceDate) result = replaceByDateRows(ws, rows, (payload.dateCol || 0), payload.replaceDate);
      else                          result = appendRows(ws, rows);
    }
    else if (isAst)    result = upsertAstRows(ws, rows);
    // Registro_Traslado: MISMO upsert por columna "ID" que el AsT. No hace falta
    // función propia — upsertAstRows localiza el ID por CABECERA y en Traslado el
    // ID es además la última columna, que es su respaldo. La llave del cliente es
    // determinista (viaje-c<camión>-r<revisión>-t<tina>), así que el camión puede
    // sincronizar en cada parada sin duplicar una sola fila.
    else if (isTras)   result = upsertAstRows(ws, rows);
    // Las tres de Maduración van con MERGE (3.er argumento), al revés que AsT y
    // Traslado: ver la cabecera de upsertAstRows para el porqué.
    else if (isMadId)  result = upsertAstRows(ws, rows, true);
    // Control Broodstock (R1, 2026-09-17): REEMPLAZO por (Fecha de corte · Piscina), no merge. La carga es la foto
    // de la semana, así que volver a subirla CORRIGE cada piscina entera —también una celda que ahora va vacía, que
    // un merge conservaría— y deja en paz las demás piscinas y las demás semanas.
    // 🔑 La llave la fija ESTE servidor, [0,1]: el cliente manda la suya en payload.keyCols, pero una llave que
    //   viene de fuera es justo lo que D9 enseñó a no creer.
    // La Piscina (columna 2) va como TEXTO antes de escribir, por lo mismo que D2 en Desoves: Sheets convierte lo
    // que parece un número, y una piscina «0813» guardada como 813 ya no casaría al re-subir la semana.
    else if (isBrood) {
      var _filasBs = lastRow(ws) + rows.length;
      if (_filasBs > ws.getMaxRows()) ws.insertRowsAfter(ws.getMaxRows(), _filasBs - ws.getMaxRows());
      if (ws.getMaxRows() > 1) ws.getRange(2, 2, ws.getMaxRows() - 1, 1).setNumberFormat("@");
      result = replaceByKeyRows(ws, rows, [0, 1]);
    }
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
    else if (isMarea) {
      // Marea (predicción INOCAR): upsert por Fecha (clave del cliente = [0]). Una fila
      // por día → re-sincronizar o editar una fecha actualiza esa fila, sin duplicar.
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
  var porEscribir = [];
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
      // B1 (2026-09-21) · en bloque al final. El "@" de la Hora que aquí se ponía fila a fila lo
      // aplica igual fmtData(..., isCtrl) sobre el tramo, que es de donde salía ya en el append.
      // (Sin comillas invertidas: este bloque viaja dentro de la plantilla GAS() y una sola la cierra.)
      porEscribir.push({ fila: entry.row, datos: merged });
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

  escribirActualizadas_(ws, porEscribir, -1, -1, isCtrl);
  var added = 0;
  if (toAdd.length > 0) {
    var startRow = lastRow(ws) + 1;
    var u        = filasUniformes(toAdd);
    if (isCtrl) ws.getRange(startRow, 2, u.filas.length, 1).setNumberFormat("@");
    ws.getRange(startRow, 1, u.filas.length, u.ancho).setValues(u.filas);
    fmtData(ws, startRow, u.filas.length, u.ancho, isCtrl);
    added = u.filas.length;
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

// P15 (2026-09-14) · FORMATEAR UNA FECHA ES UNA LLAMADA DE SERVICIO, y se hacía POR CELDA, con otra
// más para pedir la zona horaria: medido en ?p=rows, la MATRIZ con sus dos columnas de fecha pasaba de
// 3-6 s a 40-64 s, y la misma pareja corría en madRowKey para cada fila de la hoja en cada escritura con
// fecha en la llave. Ahora la zona se pide UNA vez por petición y cada fecha distinta se formatea UNA vez
// (un día son decenas de filas): el mismo texto, sin la carga. Una ejecución del GAS no comparte
// variables con la siguiente, así que la caché no envejece.
var _celdaTz_ = null, _celdaFmt_ = {};
function formatoCelda_(d, patron) {
  var k = patron + "|" + d.getTime();
  var hecho = _celdaFmt_[k];
  if (hecho === undefined) {
    if (_celdaTz_ === null) _celdaTz_ = Session.getScriptTimeZone();
    hecho = Utilities.formatDate(d, _celdaTz_, patron);
    _celdaFmt_[k] = hecho;
  }
  return hecho;
}
// dStr: normaliza fecha (Date o string) a "YYYY-MM-DD"
function dStr(val) {
  if (!val && val !== 0) return "";
  if (val instanceof Date) {
    return formatoCelda_(val, "yyyy-MM-dd");
  }
  return String(val).slice(0, 10);
}
// timeStr: respaldo si getDisplayValues() no está disponible.
// Usa Utilities.formatDate para respetar timezone del script (más seguro que getHours()).
function timeStr(val) {
  if (!val && val !== 0) return "";
  if (val instanceof Date) {
    return formatoCelda_(val, "HH:mm");
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

// ── Esquema de las hojas del registro OPERATIVO de Maduración (V3, 2026-09-13) ──
// ⚠⚠ ESTAS HOJAS SE ESCRIBEN POR POSICIÓN: upsertMadRows y upsertAstRows copian la celda
// i del envío en la columna i de la hoja, sin mirar cómo se llama. Sus columnas cambiaron
// entre el 08 y el 09-09, y siguen vivos clientes con el esquema anterior (GitHub Pages y
// copias viejas de la app): un guardado de Tanques desde uno de ellos correría una columna
// todo lo que va detrás de «Tanque» —los machos muertos en «Hembras muertas»— y el GAS
// respondería «ok». Por eso, antes de escribir, se comparan las cabeceras del envío con
// las de la hoja, posición a posición.
//   · Que el envío traiga MENOS columnas no es un desfase: le falta el final, no está
//     corrido (Sala sin la Fase 6 sigue escribiendo, y el merge conserva las de la cola).
//     ⚠ Aquí ponía «conserva la 21.ª» y caducó al ganar Sala su columna «Toneladas»: el
//     ordinal era la columna concreta de aquel día, no la regla. La regla es «las últimas».
//   · Una cabecera en blanco en la hoja no se compara: no hay con qué.
//   · Espacios y la forma Unicode de los acentos no cuentan como diferencia.
// Sólo las de esta lista (el registro operativo). El reproductivo también es posicional, pero su esquema no ha
// cambiado, y bloquearlo por un nombre retocado a mano pararía el trabajo de campo.
// El cliente, ante el rechazo, no marca nada como sincronizado: lo tecleado se queda en
// el dispositivo hasta que se actualice la app (medido en el cliente de f1d9687).
var MAD_ESQUEMA_VIGILADO = [
  "Maduración Sala", "Maduración Tanques", "Maduración Lotes",
  "Maduración Ingreso", "Maduración Movimientos", "Maduración Fin de Ciclo",
  "Maduración Tratamientos", "Maduración Mortalidad Desove", "Maduración Alimentación"
];
function _cabeceraNorm_(v) {
  var s = String(v == null ? "" : v).trim();
  return (typeof s.normalize === "function") ? s.normalize("NFC") : s;
}
// null si son compatibles; si no, { col: número de columna (desde 1), hoja: lo que espera }.
function esquemaIncompatible_(cabHoja, cabEnvio) {
  var n = Math.min(cabHoja.length, cabEnvio.length);
  for (var i = 0; i < n; i++) {
    var h = _cabeceraNorm_(cabHoja[i]);
    var p = _cabeceraNorm_(cleanCell(cabEnvio[i]));
    if (h && p && h !== p) return { col: i + 1, hoja: h };
  }
  return null;
}
// A4 (2026-09-14) · LA FIRMA DEL ESQUEMA VIGENTE. La guarda V3 compara el envío con la HOJA, y una
// hoja vacía o inexistente no tiene con qué compararse: el primer envío fija sus cabeceras. Si sale de
// una app vieja (Pages antes del push, o una copia en caché), la hoja nace con el esquema viejo y desde
// ahí la guarda rechaza a las apps al día. Estas hojas exigen al ENVÍO las cabeceras que sólo tiene su
// esquema actual (columna desde 1). Si una de ellas cambia de nombre o de sitio, se actualiza aquí en el
// mismo cambio y se re-despliega el GAS.
// ⚠⚠ 2026-09-16 · ENTRAN LAS TRES HOJAS NUEVAS, y no es simetría: es el ÚNICO cerrojo que les
// quedaba. Las tres NO EXISTEN todavía en producción (medido ese día: 0 cabeceras), así que la
// guarda V3 no tiene con qué compararlas y quien las cree primero les fija la cabecera para
// siempre. La grave es «Mortalidad Desove»: pasó de 14 a 18 columnas INSERTANDO Fototropismo y
// Aireación en la 11-12 y Área y Alcalinidad en la 15-16, así que una app anterior no la crearía
// «más corta» —eso sería inofensivo— sino CORRIDA, y desde ahí rechazaría a todas las apps al día.
// Las otras dos no cambiaron nunca de columnas; van igualmente, porque el día que cambien el
// cerrojo tiene que existir YA (una firma añadida después del desfase llega tarde por definición).
// 🔑 La columna elegida es siempre una que SÓLO tiene el esquema actual y que manda todo cliente
// al día. Si alguna cambia de nombre o de sitio, se actualiza aquí EN EL MISMO CAMBIO.
var MAD_ESQUEMA_FIRMA = {
  // ⚠ El espaciado de estas tres líneas NO se retoca: son ancla de mutar-mad-gas-dopost
  //   (A4-M3, A4-M4, A4-M5). Re-alinearlas por estética mató las tres el 2026-09-16.
  //   Y el comentario va SIN comillas invertidas: este bloque viaja dentro de la plantilla
  //   GAS() de engine.js, y una sola la cerraría (pasó ese mismo día; lo cazó la suite).
  "Maduración Ingreso":      [[14, "Crecimiento semanal promedio"]],
  "Maduración Lotes":        [[7, "Hembras no viables"]],
  "Maduración Fin de Ciclo": [[5, "Sala"], [10, "Rojos"]],
  // 11 y 15 son justo las dos inserciones: el cliente de 14 columnas lleva «Salinidad» en la 11.
  // 16 (PE1.5, 2026-09-16): la alcalinidad pasó a ser de día y de noche; el cliente de 18 columnas lleva ahí «Alcalinidad».
  "Maduración Mortalidad Desove": [[11, "Fototropismo"], [15, "Área"], [16, "Alcalinidad día"]],
  "Maduración Tratamientos": [[8, "Productos RAS"]],
  // 9 va ANTES del bloque de alimentos, que es la parte del esquema que puede crecer.
  "Maduración Alimentación": [[9, "Fuente del peso"]],
  // 2026-09-17 · Movimientos no ha cambiado nunca de columnas, así que esta firma no arregla un desfase:
  // es el CERROJO PREVENTIVO que el comentario de arriba reclama. Estaba en MAD_ESQUEMA_VIGILADO, pero esa
  // guarda compara contra la cabecera de la HOJA y sólo actúa si la hoja ya tiene filas; la firma vale
  // también con la hoja vacía o sin crear, que es cuando un cliente viejo la crearía con el esquema malo.
  // Se firman DOS columnas porque no hay ninguna «nueva» que delate al viejo: una distintiva a media tabla
  // y la última, de modo que cualquier inserción mueva al menos una. ⚠ Si el esquema cambia, ESTAS DOS
  // POSICIONES se actualizan EN EL MISMO CAMBIO, o la firma rechazaría a los clientes al día.
  "Maduración Movimientos": [[9, "Agua destino"], [12, "ID"]],
  /* 2026-09-17 (segunda tanda) · LAS CINCO QUE FALTABAN. Con esto, las doce hojas de Maduración que
     admitía ALLOWED ese día tienen cerrojo; la decimotercera, «Broodstock», nació después con el suyo
     (ver abajo), así que hoy lo tienen las TRECE. Dos motivos concretos, no preventivos en abstracto:
       · «Transferencias» NO EXISTE todavía (0 filas): nace con el primer traslado, y no la cubría ni la
         guarda V3 —que necesita que la hoja tenga filas— ni la firma. Quien la creara primero le fijaba
         la cabecera para siempre.
       · «Sala» y «Tanques» sí tienen filas, así que hoy las cubre V3… pero el vaciado previsto de las
         hojas de Maduración las deja a 0 filas, y con ello a V3 INERTE justo cuando más falta hace.
     🔑 LA COLUMNA ELEGIDA ATRAPA UN CORRIMIENTO, NUNCA UN AÑADIDO AL FINAL. En Sala y Tanques se firma
     la última columna que TAMBIÉN tiene el cliente anterior, no la más nueva: un envío más corto es
     inocuo —ensureHeaders alarga la cabecera y los valores caen en su sitio—, así que rechazarlo sería
     bloquear a un cliente que no hace daño. Firmar «Toneladas» (Sala, 22) u «Observaciones operativas»
     (Tanques, 16) habría hecho exactamente eso.
     Las tres del reproductivo no han cambiado nunca de columnas y todo cliente vivo las manda enteras
     (medido contra lo que sirve Pages), así que ahí sí se firma una columna de la LLAVE —si se corre, el
     upsert casa con la fila que no es— y otra del final. */
  "Maduración Sala":           [[20, "RAS"]],
  // P12 (2026-09-20) · era la 15. Al retirar las TRES columnas vacías de delante —«Lote» y las dos
  // «Población inicial»— «Observaciones sanitarias» pasa de la 15 a la 12. La firma se mueve CON ella,
  // en el mismo despliegue: si no, un cliente al día sería rechazado y uno viejo aceptado, justo al revés.
  "Maduración Tanques":        [[12, "Observaciones sanitarias"]],
  "Maduración MATRIZ":         [[6, "Lote"], [11, "Fecha ingreso"]],
  "Maduración Bitácora":       [[3, "Tipo"], [5, "Tanque"]],
  "Maduración Transferencias": [[4, "Trovan ID"], [12, "Piscinas presentes"]],
  /* Control Broodstock (2026-09-17) · nace HOY, así que su cerrojo existe desde el primer envío y no hay
     que esperar a que lo haga falta. Se firma la 2 —«Piscina», la segunda mitad de la llave: si se corre,
     el upsert casa con la fila que no es— y la 8 —«Pl/g», la columna que separa las postlarvas por gramo
     del peso en gramos; un cliente anterior a ella no puede existir, pero el día que el esquema cambie,
     aquí estará—. */
  "Maduración Broodstock":     [[2, "Piscina"], [8, "Pl/g"]]
};
// null si el envío trae la firma (o la hoja no tiene); si no, { col, cab: lo que espera }.
function firmaAusente_(hoja, cabEnvio) {
  var firma = Object.prototype.hasOwnProperty.call(MAD_ESQUEMA_FIRMA, hoja) ? MAD_ESQUEMA_FIRMA[hoja] : null;
  if (!firma) return null;
  var cab = Array.isArray(cabEnvio) ? cabEnvio : [];
  for (var i = 0; i < firma.length; i++) {
    if (_cabeceraNorm_(cleanCell(cab[firma[i][0] - 1])) !== firma[i][1]) return { col: firma[i][0], cab: firma[i][1] };
  }
  return null;
}

// ── Última fila con datos ────────────────────────────────
function lastRow(ws) {
  var lr = ws.getLastRow();
  return lr > 0 ? lr : 0;
}

// ── Ancho uniforme de un bloque de filas ─────────────────
// setValues exige que TODAS las filas midan exactamente lo mismo que el rango. Una
// sola más corta hace fallar la escritura ENTERA, y el error de Apps Script no dice
// cuál fila fue. Hasta el 2026-08-30 tres de las cinco rutas de escritura tomaban el
// ancho de la PRIMERA fila y daban por hecho que las demás medían igual: cierto hoy,
// pero es una propiedad de los constructores del CLIENTE, no de estas funciones, y
// basta una celda condicional al otro lado del contrato para romperla.
// Devuelve las filas con un único ancho: las cortas se rellenan con "" y las largas
// se recortan (recortar ya lo hacía doPost con maxCols). No muta lo que recibe.
function filasUniformes(filas) {
  var ancho = 0, i;
  for (i = 0; i < filas.length; i++) if (filas[i].length > ancho) ancho = filas[i].length;
  var out = [];
  for (i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (f.length === ancho) { out.push(f); continue; }
    var c = f.slice();
    while (c.length < ancho) c.push("");
    out.push(c.length > ancho ? c.slice(0, ancho) : c);
  }
  return { filas: out, ancho: ancho };
}

// ── Append simple (queda como utilidad genérica) ──
/* ── B1 (2026-09-21) · LAS ACTUALIZACIONES SE ESCRIBEN EN BLOQUE ──────────────
   LO QUE SE MIDIÓ, ejecutando este mismo archivo contra un Sheets instrumentado que cuenta
   llamadas al servicio. El APPEND ya iba batcheado —40 filas nuevas de Tanques: 10 llamadas—,
   pero la ACTUALIZACIÓN escribía fila a fila, y cada fila costaba:
     setValues (1) + fmtData (5: fuente, familia, dos alineaciones y el formato de la Fecha)
     + los formatos fijos de Trovan y Número (hasta 4 más)
   O sea 6 llamadas por fila en Tanques, Sala, Lotes y las seis hojas por «ID»; 14 en la MATRIZ.
   · re-enviar un parte de Tanques (40 filas) = 244 llamadas
   · un lote de eventos de la MATRIZ de 200 Trovan = 2 801
   · el tope del payload (1000 filas) = 14 001
   🔑 Y ese lote no es teórico: los Trovan de una mortalidad SE PEGAN desde el lector, sin tope en
   el cliente. A 10–40 ms por llamada, 2 801 son 28–112 s: por encima del tope de 40 s del POST y
   del waitLock de 25 s que esperan los demás dispositivos. No se corrompe nada —el reqId y el
   upsert por llave lo hacen idempotente— pero da timeouts y «Servidor ocupado» justo en la ronda
   que más urge registrar.

   QUÉ HACE ESTO. Los VALORES se escriben por tramos CONTIGUOS del mismo ancho: ni una fila que el
   envío no traiga recibe un solo valor. Los FORMATOS se aplican UNA vez sobre el tramo que va de la
   primera a la última fila tocada.
   ⚠ Y ahí está la única diferencia de comportamiento, dicha en voz alta: si las filas tocadas no
   son contiguas, las que quedan EN MEDIO reciben otra vez el mismo formato uniforme que esta
   función ya le da a toda la hoja (Arial 10, centrado, la Fecha en dd/mm/yyyy y, donde toque, el
   Trovan en texto). No se les escribe ningún VALOR. Es un no-op salvo que alguien hubiera puesto a
   mano otro formato de número en una fila suelta, que aquí no ocurre: estas hojas las escribe este
   GAS. Se acepta a cambio de bajar la MATRIZ de 14 llamadas por fila a una.
   🔑 Ordena por número de fila: el orden de llegada del envío no tiene por qué ser el de la hoja. */
function escribirActualizadas_(ws, pendientes, trovanCol, numCol, isCtrl) {
  if (!pendientes || !pendientes.length) return;
  pendientes.sort(function (a, b) { return a.fila - b.fila; });
  var ancho = 0, i;
  for (i = 0; i < pendientes.length; i++) {
    if (pendientes[i].datos.length > ancho) ancho = pendientes[i].datos.length;
  }
  // Los VALORES, por tramos contiguos del mismo ancho.
  var ini = 0;
  for (i = 1; i <= pendientes.length; i++) {
    var sigue = i < pendientes.length
      && pendientes[i].fila === pendientes[i - 1].fila + 1
      && pendientes[i].datos.length === pendientes[ini].datos.length;
    if (sigue) continue;
    var bloque = [];
    for (var k = ini; k < i; k++) bloque.push(pendientes[k].datos);
    ws.getRange(pendientes[ini].fila, 1, bloque.length, bloque[0].length).setValues(bloque);
    ini = i;
  }
  // Los FORMATOS, una sola vez sobre el tramo tocado.
  var primera = pendientes[0].fila, ultima = pendientes[pendientes.length - 1].fila;
  fmtData(ws, primera, ultima - primera + 1, ancho, isCtrl);
  madFormatosFijos_(ws, primera, ultima - primera + 1, ancho, trovanCol, numCol);
}

function appendRows(ws, newRows) {
  if (!newRows || !newRows.length) return { upserted: 0, appended: 0 };
  var startRow = lastRow(ws) + 1;
  var u        = filasUniformes(newRows);
  ws.getRange(startRow, 1, u.filas.length, u.ancho).setValues(u.filas);
  fmtData(ws, startRow, u.filas.length, u.ancho, false);
  return { upserted: 0, appended: u.filas.length };
}

// ── F4b · Reemplazo O(sesión) sin reescribir la hoja entera ──────────────
// Sustituye el patrón "leer todo -> reescribir todo" (coste O(hoja), lock largo)
// por: (1) localizar las filas viejas que coinciden (matchPred), (2) APPEND de
// las nuevas al final, (3) flush, (4) borrar las viejas por bloques contiguos
// (descendente, para no desplazar los índices aún por borrar).
// CLAVE de correccion: "oldIdx" se calcula ANTES del append y con índices
// PRE-append (el append no desplaza filas existentes), así que:
//  · nunca borra lo recién agregado;
//  · es AUTO-SANABLE: si algo falla entre el append y el borrado, un reintento
//    recalcula oldIdx = TODAS las filas de la sesión (viejas + las que quedaron)
//    y reconverge a solo las nuevas. En fallo NUNCA se pierde dato (a lo sumo
//    quedan duplicados hasta el siguiente sync).
// Acorta drásticamente el tiempo bajo lock frente a reescribir toda la hoja.
function _replaceMatched(ws, newRows, matchPred) {
  var data = ws.getDataRange().getValues();
  var oldIdx = [];
  for (var i = 1; i < data.length; i++) {
    if (matchPred(data[i])) oldIdx.push(i + 1);   // 1-indexed
  }
  var added = 0;
  if (newRows && newRows.length) {
    var u = filasUniformes(newRows);
    if (u.ancho > ws.getMaxColumns()) ws.insertColumnsAfter(ws.getMaxColumns(), u.ancho - ws.getMaxColumns());
    var startRow = lastRow(ws) + 1;
    ws.getRange(startRow, 1, u.filas.length, u.ancho).setValues(u.filas);
    fmtData(ws, startRow, u.filas.length, u.ancho, false);
    added = u.filas.length;
  }
  SpreadsheetApp.flush();   // el APPEND queda comprometido ANTES de cualquier borrado
  var removed = 0;
  if (oldIdx.length) {
    oldIdx.sort(function(a, b){ return a - b; });
    var runs = [], s = oldIdx[0], p = oldIdx[0];
    for (var k = 1; k < oldIdx.length; k++) {
      if (oldIdx[k] === p + 1) { p = oldIdx[k]; }
      else { runs.push([s, p]); s = oldIdx[k]; p = oldIdx[k]; }
    }
    runs.push([s, p]);
    for (var rr = runs.length - 1; rr >= 0; rr--) {   // de mayor a menor
      var cnt = runs[rr][1] - runs[rr][0] + 1;
      ws.deleteRows(runs[rr][0], cnt);
      removed += cnt;
    }
  }
  return { removed: removed, added: added };
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
  var res = _replaceMatched(ws, newRows, function(row){ return dStr(row[col]) === key; });
  return { upserted: res.removed, appended: res.added };
}

// -- Reemplazo por clave compuesta (Microbiología: grilla por sesión) --
// Borra todas las filas cuya clave (keyCols) coincide con alguna del envío y
// agrega las nuevas. Reemplaza cada sesión completa sin duplicar.
// D9 (2026-09-14) · NUNCA BORRA A CIEGAS, la misma regla que replaceByDateRows. Los índices
// de la clave los manda el CLIENTE (payload.keyCols) y hasta ese día no se comprobaban:
//   · keyCols vacío, o con un índice que no existe en la fila (999, o el -1 de un indexOf
//     que no encuentra «Sesión»), daba la clave "" a TODAS las filas: UN envío vaciaba la hoja;
//   · una fila con la clave ENTERA en blanco borraba todas las de clave vacía, y en BIOMOL la
//     Sesión vacía es justo la de las filas escritas antes de existir esa columna.
// Ahora un índice que no sea un entero >= 0 dentro de la fila MÁS CORTA del envío cae a APPEND
// puro, y una fila cuya clave es la de una fila en blanco se añade sin reemplazar nada (la
// clave en blanco se calcula con el mismo madInKey, así que normaliza igual). Lo peor que
// puede pasar es un duplicado visible, nunca un borrado. Una clave PARCIAL sigue valiendo:
// una Corrida vacía con su Sesión es legítima. Lo fija gas-replace-clave.test.js del repo.
function keyColsValidas_(keyCols, filas) {
  var ancho = -1;
  for (var f = 0; f < filas.length; f++) {
    if (ancho < 0 || filas[f].length < ancho) ancho = filas[f].length;
  }
  for (var k = 0; k < keyCols.length; k++) {
    var c = keyCols[k];
    if (typeof c !== "number" || c < 0 || c % 1 !== 0 || c >= ancho) return false;
  }
  return true;
}
function replaceByKeyRows(ws, newRows, keyCols) {
  if (!keyColsValidas_(keyCols, newRows)) return appendRows(ws, newRows);
  var enBlanco = madInKey([], keyCols);
  var present = {};
  for (var r = 0; r < newRows.length; r++) {
    var clave = madInKey(newRows[r], keyCols);
    if (clave !== enBlanco) present[clave] = 1;
  }
  var res = _replaceMatched(ws, newRows, function(row){ return present[madRowKey(row, keyCols)] === 1; });
  return { upserted: res.removed, appended: res.added };
}

// ── Upsert Registro_Supervisión (AsT) por columna ID estable ──
// Cada registro local de AsT viaja con un ID único en la ÚLTIMA columna del
// payload. Al re-sincronizar un registro editado, se localiza su fila por ese
// ID y se REEMPLAZA en sitio, en vez de añadir una fila nueva (lo que antes
// duplicaba la información). Filas antiguas sin ID (anteriores a este cambio)
// no tienen clave de coincidencia: un registro cuyo ID no se encuentre se
// añade como fila nueva (comportamiento heredado, sin pérdida de datos).
//
// merge (2026-09-09, opcional, por defecto FALSE):
//   false → REEMPLAZO total de la fila. Es lo que quieren AsT y Traslado: su
//           registro viaja COMPLETO desde el almacén local del dispositivo, así
//           que la fila entrante es la verdad entera y borrar lo que no trae es
//           lo correcto.
//   true  → lo que llega VACÍO conserva lo que hubiera. Lo usan las tres hojas
//           del registro operativo de Maduración, y no por gusto: sus fichas se
//           VACÍAN al guardar, así que volver a esa fila para completar un dato
//           posterior —el metabisulfito de un cierre, que puede aplicarse otro
//           día— manda todo lo demás en blanco. Con reemplazo eso borraba Machos,
//           Hembras, Tipo y Observaciones sin un solo síntoma, y cambiaba el
//           descuento del libro mayor.
//   ⚠ La contrapartida del merge, que hay que conocer: un campo de TEXTO no se
//     puede vaciar reenviándolo en blanco. Se corrige en la hoja. Es el mismo
//     trato que ya tienen Sala, Tanques y Lotes por upsertMadRows.
function upsertAstRows(ws, newRows, merge) {
  var widest = 0;
  for (var wi = 0; wi < newRows.length; wi++) {
    if (newRows[wi].length > widest) widest = newRows[wi].length;
  }
  // La cabecera se lee ANTES de ensanchar, para localizar el ID sobre la hoja real.
  var hdr = ws.getLastColumn() > 0 ? ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0] : [];
  if (widest > ws.getMaxColumns()) {
    ws.insertColumnsAfter(ws.getMaxColumns(), widest - ws.getMaxColumns());
  }
  // El ID es la ÚLTIMA columna del payload —la 27 en el AsT, la 29 en Traslado— y
  // Flacidez/Necrosis/Disparidad van DELANTE de él, no detrás. El orden se invirtió
  // el 2026-08-15 a propósito y no debe volver a cambiarse: la hoja de producción
  // tenía la cabecera del ID EN BLANCO, así que la búsqueda por cabecera no lo
  // encontraba y caía al respaldo «última columna del payload»; con el ID en la 24
  // de 27, ese respaldo apuntaba a «Disparidad». Resultado: cada sync añadía una
  // fila nueva —la duplicación que este upsert existe para evitar— y dos registros
  // con la misma Disparidad se pisaban entre sí.
  // Con el ID al final las DOS rutas —cabecera y respaldo— dan la misma columna, de
  // modo que empareja aunque la cabecera siga en blanco. ensureHeaders NO salva ese
  // caso: sale antes de escribir nada si la hoja ya tiene el ancho completo.
  var idCol = -1;
  for (var h = 0; h < hdr.length; h++) {
    if (String(hdr[h] == null ? "" : hdr[h]).trim() === "ID") { idCol = h; break; }
  }
  if (idCol < 0 || idCol >= widest) idCol = widest - 1;
  var data  = ws.getDataRange().getValues();

  // Mapa ID → { fila del sheet (1-indexed), índice en data } de las ya existentes.
  // El ÍNDICE se guarda desde 2026-09-09 porque el merge necesita la fila vieja
  // delante para saber qué celda conservar; sin él sólo se puede reemplazar.
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var idv = (idCol < data[i].length) ? String(data[i][idCol]).trim() : "";
    if (idv) map[idv] = { row: i + 1, idx: i };
  }

  var toAdd = [], pending = {}, updated = 0, porEscribir = [];
  for (var r = 0; r < newRows.length; r++) {
    var nr = newRows[r];
    while (nr.length < widest) nr.push("");      // normaliza ancho
    var id = String(nr[idCol] != null ? nr[idCol] : "").trim();
    if (id && map[id]) {
      var ent = map[id], fila = nr;
      if (merge) {
        // MERGE: lo que llega VACÍO conserva lo que ya hubiera en la celda; un 0 sí
        // escribe 0 (sólo "" cuenta como vacío, y cleanCell deja los números tal cual).
        // Es lo que permite completar un registro DÍAS DESPUÉS sin re-teclearlo entero:
        // el metabisulfito de un cierre, el N2/N5 de un desove. La columna ID se
        // preserva: es la llave, y por definición ya coincide.
        var ex = data[ent.idx], nc = Math.max(ex.length, nr.length), merged = [];
        for (var c = 0; c < nc; c++) {
          var eo = c < ex.length ? ex[c] : "";
          var nu = c < nr.length ? nr[c] : "";
          var nEmpty = (nu === "" || nu === null || nu === undefined);
          if (c === idCol) merged.push((eo === "" || eo === null || eo === undefined) ? nu : eo);
          else             merged.push(nEmpty ? eo : nu);
        }
        fila = merged;
      }
      // B1 (2026-09-21) · se aparta y se escribe en bloque al final (ver escribirActualizadas_):
      // eran 6 llamadas al servicio por fila, y esta ruta la comparten el AsT, el Traslado y las
      // SEIS hojas de Maduración que van por columna «ID».
      porEscribir.push({ fila: ent.row, datos: fila });
      // La foto de la hoja se actualiza con lo escrito. «data» se lee UNA vez al
      // entrar, así que sin esto una segunda fila del MISMO envío con el mismo ID se
      // fusionaría contra la versión VIEJA y borraría lo que aportó la primera —
      // mientras que dos envíos seguidos sí acumulan. Con merge, las dos rutas tienen
      // que dar lo mismo; sin merge la línea es inocua (fila es la entrante entera).
      data[ent.idx] = fila;
      updated++;
    } else if (id && pending[id] !== undefined) {
      // Mismo ID repetido dentro del batch. Sin merge se conserva la última versión;
      // con merge se fusionan los no vacíos, igual que contra la hoja — si no, dos filas
      // del mismo envío se comportarían distinto que dos envíos seguidos, y ésa es
      // exactamente la clase de divergencia que nadie mira hasta que muerde.
      if (merge) {
        var pi = pending[id];
        for (var pc = 0; pc < nr.length; pc++) {
          if (pc !== idCol && nr[pc] !== "" && nr[pc] !== null && nr[pc] !== undefined) toAdd[pi][pc] = nr[pc];
        }
      } else {
        toAdd[pending[id]] = nr.slice();
      }
    } else {
      if (id) pending[id] = toAdd.length;
      toAdd.push(nr.slice());
    }
  }

  escribirActualizadas_(ws, porEscribir, -1, -1, false);
  var added = 0;
  if (toAdd.length > 0) {
    var startRow = lastRow(ws) + 1;
    var u = filasUniformes(toAdd);
    ws.getRange(startRow, 1, u.filas.length, u.ancho).setValues(u.filas);
    fmtData(ws, startRow, u.filas.length, u.ancho, false);
    added = u.filas.length;
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

  var toAdd = [], pending = {}, updated = 0, porEscribir = [];
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
      porEscribir.push({ fila: entry.row, datos: merged });   // B1: en bloque al final
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

  escribirActualizadas_(ws, porEscribir, -1, -1, false);
  var added = 0;
  if (toAdd.length > 0) {
    var startRow = lastRow(ws) + 1;
    var u = filasUniformes(toAdd);
    ws.getRange(startRow, 1, u.filas.length, u.ancho).setValues(u.filas);
    fmtData(ws, startRow, u.filas.length, u.ancho, false);
    added = u.filas.length;
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
//   • Maduración Tanques  → [0,1,2,13,14] (Fecha, Sala, Tanque, Hora, Parte). P12 (2026-09-20): era
//     [0,1,3,16,17] y la hoja llevaba delante tres columnas VACÍAS —«Lote» y las dos «Población
//     inicial»— que sólo existían para no mover la llave. Se retiraron; la llave son las mismas cinco.
//   • Maduración Lotes    → [0,1,2] (Fecha, Lote, Código genético) — la hoja de Desoves
// Si la clave coincide con una fila existente: merge (los nuevos valores
// no vacíos reemplazan al anterior; los vacíos preservan el dato actual).
function upsertMadRows(ws, newRows, keyCols, trovanCol, numCol, llave) {
  if (trovanCol === undefined || trovanCol === null) trovanCol = -1;
  if (numCol === undefined || numCol === null) numCol = -1;
  var lastR = ws.getLastRow();
  var data  = ws.getDataRange().getValues();
  // «llave» (2026-09-14, sólo la MATRIZ): cuando la clave no basta para saber a qué fila va cada
  // una del envío —un chip reciclado tiene varias—, lo decide ella, y puede rechazar el envío.
  if (llave) { var rechazo = llave.preparar(data); if (rechazo) return { error: rechazo }; }
  var map   = {};
  var keySet = {};
  for (var j = 0; j < keyCols.length; j++) keySet[keyCols[j]] = 1;
  for (var i = 1; i < data.length; i++) {
    var k = llave ? llave.deHoja(i) : madRowKey(data[i], keyCols);
    if (k) map[k] = { row: i + 1, idx: i };
  }
  var toAdd = [];
  var updated = 0;
  var pendingMap = {};
  var porEscribir = [];
  for (var r = 0; r < newRows.length; r++) {
    var nr    = newRows[r];
    var k2    = llave ? llave.deEnvio(r) : madInKey(nr, keyCols);
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
      // B1 (2026-09-21) · la escritura se APARTA y se hace en bloque al final (ver escribirActualizadas_).
      // El Trovan a TEXTO y el "Número" a General siguen aplicándose: ahora sobre el tramo, no fila a fila.
      porEscribir.push({ fila: entry.row, datos: merged });
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
  escribirActualizadas_(ws, porEscribir, trovanCol, numCol, false);
  var added = 0;
  if (toAdd.length > 0) {
    var startRow = lastRow(ws) + 1;
    var u = filasUniformes(toAdd);
    if (trovanCol >= 0 && trovanCol < u.ancho) ws.getRange(startRow, trovanCol + 1, u.filas.length, 1).setNumberFormat("@");
    if (numCol >= 0 && numCol < u.ancho) ws.getRange(startRow, numCol + 1, u.filas.length, 1).setNumberFormat("General");
    ws.getRange(startRow, 1, u.filas.length, u.ancho).setValues(u.filas);
    fmtData(ws, startRow, u.filas.length, u.ancho, false);
    madFormatosFijos_(ws, startRow, u.filas.length, u.ancho, trovanCol, numCol);
    added = u.filas.length;
  }
  return { upserted: updated, appended: added };
}
// ── V2 (2026-09-18) · LA MATRIZ ANTE UN CLIENTE ANTERIOR A LA CUATERNA (RD2) ──
// La llave de la MATRIZ es la cuaterna (Trovan · Piscina · Código genético · Lote). Un cliente ANTERIOR —una pestaña
// abierta desde antes del despliegue, un Pages en caché, un envío que esperaba en la cola— manda la mortalidad y el
// traslado con SÓLO el Trovan (medido en origin/master: {Trovan, Estado, Fecha muerte} y {Trovan, Sala, Tanque}). Su
// llave sale «TROVAN|||», no casa con ninguna fila y el upsert AÑADIRÍA una fila suelta: un «Muerto» sin piscina,
// mientras la hembra de verdad sigue «Vivo». Sin un solo síntoma.
// Una fila así —Trovan, con Piscina, Código genético y Lote VACÍOS— se resuelve por su Trovan:
//   · la hoja tiene UNA fila con ese Trovan → va a ésa (se toma su cuaterna, y el merge conserva su identidad);
//   · NINGUNA → sigue como viene: una fila nueva, que es lo que hacía antes;
//   · DOS o MÁS → no se sabe a cuál va: se RECHAZA el envío ENTERO, diciendo cuáles y qué hacer.
// Las filas con la identidad (las de este cliente) no pasan por aquí: van por su cuaterna, como siempre.
function llaveMatrizCliente_(rows, keyCols) {
  var data = null, porTrovan = {};
  var trovan = function (row) { return String(row[1] == null ? "" : row[1]).trim(); };
  var sinIdentidad = function (row) {
    return [3, 4, 5].every(function (c) { var v = row[c]; return v === "" || v === null || v === undefined || String(v).trim() === ""; });
  };
  return {
    preparar: function (d) {
      data = d;
      for (var i = 1; i < d.length; i++) { var t = trovan(d[i]); if (t) (porTrovan[t] = porTrovan[t] || []).push(i); }
      var dudosos = [];
      for (var r = 0; r < rows.length; r++) {
        var tr = trovan(rows[r]);
        if (sinIdentidad(rows[r]) && (porTrovan[tr] || []).length > 1 && dudosos.indexOf(tr) === -1) dudosos.push(tr);
      }
      if (!dudosos.length) return "";
      return "Envío de una versión ANTERIOR de la app (sin piscina, código genético ni lote) para " + dudosos.length +
        " microchip(s) que llevan VARIOS individuos en la MATRIZ (" + dudosos.join(", ") + "): no se sabe a cuál va. " +
        "No se ha escrito nada: actualiza la app (recarga la página) y vuelve a registrarlo.";
    },
    deHoja: function (i) { return madRowKey(data[i], keyCols); },
    deEnvio: function (r) {
      var nr = rows[r];
      if (sinIdentidad(nr)) {
        var filas = porTrovan[trovan(nr)] || [];
        if (filas.length === 1) return madRowKey(data[filas[0]], keyCols);
      }
      return madInKey(nr, keyCols);
    }
  };
}
// P16 (2026-09-14) · fmtData pone formato de FECHA a la columna 1 de toda fila escrita, y en la MATRIZ
// la columna 1 es «Número»: el 7 se veía «06/01/1900». Los formatos propios de la hoja (Trovan como
// texto, Número automático) se vuelven a poner DESPUÉS de fmtData, que es lo que queda. El texto del
// Trovan se pone también ANTES de escribir: sin él Sheets convertiría el código al guardarlo.
function madFormatosFijos_(ws, fila, nFilas, ancho, trovanCol, numCol) {
  if (trovanCol >= 0 && trovanCol < ancho) ws.getRange(fila, trovanCol + 1, nFilas, 1).setNumberFormat("@");
  if (numCol >= 0 && numCol < ancho) ws.getRange(fila, numCol + 1, nFilas, 1).setNumberFormat("General");
}

function madRowKey(row, keyCols) {
  var parts = [];
  for (var i = 0; i < keyCols.length; i++) {
    var c = keyCols[i];
    var v = row[c];
    if (v instanceof Date) {
      parts.push(formatoCelda_(v, "yyyy-MM-dd"));
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
    var s = String(row[c] == null ? "" : row[c]).trim();
    // Fecha ISO (yyyy-mm-dd) → normaliza a 10 chars para casar con madRowKey
    // (que formatea las celdas Date a yyyy-MM-dd). SIN regex a propósito: dentro
    // del template literal de GAS() los escapes de regex colapsan (mismo criterio
    // que _evDate).
    var isIso = s.length >= 10 && s.charAt(4) === "-" && s.charAt(7) === "-" &&
                !isNaN(+s.slice(0, 4)) && !isNaN(+s.slice(5, 7)) && !isNaN(+s.slice(8, 10));
    parts.push(isIso ? s.slice(0, 10) : s);
  }
  return parts.join("|");
}

// ── Registro reproductivo · MATRIZ: la identidad es una CUATERNA (2026-09-16) ──
// Aquí vivía llaveMatriz_, casi noventa líneas que decidían, por fechas y muertes, a qué hembra de
// un chip iba cada fila del envío, más fechaIsoGas_, esFecha_ y estadoMuerto_, que sólo usaba
// ella. Se retiró entero al cambiar la regla por decisión del usuario: lo que identifica a un
// individuo es (Trovan · Piscina · Código genético · Lote), así que la llave POSICIONAL normal
// —madKeyCols = [1, 3, 4, 5]— ya distingue a cada uno y no hay nada que deducir.
// 🔑 Con ella se fueron sus dos rechazos, que eran los que el usuario veía en pantalla:
//   «...lo lleva una hembra VIVA en la MATRIZ» y «...tiene que ingresar DESPUÉS de esa fecha».
// ⚠ Y con ella se va la ÚNICA razón por la que un envío a la MATRIZ podía rechazarse ENTERO sin
//   escribir nada. Si alguna vez vuelve a hacer falta esa clase de guarda, se escribe de nuevo:
//   no se resucita ésta, que medía otra cosa.

// ── Health check + portal de evidencias (Fase 1) ─────────
function doGet(e) {
  if (e && e.parameter && e.parameter.p === "ev") {
    return evPortalPage(e.parameter.t || "", e.parameter.m || "");
  }
  if (e && e.parameter && e.parameter.p === "evlist") {
    return evList(e.parameter.t || "", e.parameter.m || "", e.parameter.f || "");
  }

  if (e && e.parameter && e.parameter.p === "rows") {
    return sheetRows(e.parameter.sheet || "", e.parameter.t || "", e.parameter.cols || "");
  }
  if (e && e.parameter && e.parameter.p === "verify") {
    return verifyReq(e.parameter.reqId || "", e.parameter.t || "");
  }
  // D8 (2026-09-13) · qué versión está desplegada: ver GAS_VERSION, arriba del todo.
  // Y desde el 2026-09-14, qué sabe hacer: ver GAS_CAPACIDADES.
  if (e && e.parameter && e.parameter.p === "ver") {
    return _evJson({ ok: true, version: GAS_VERSION, caps: GAS_CAPACIDADES });
  }
  return ContentService.createTextOutput("FichasLarv-OK");
}

// F2 · Verificación por lectura: ¿el GAS ya procesó este reqId? Reutiliza la
// caché de idempotencia (idem_<reqId>, TTL 600s) que doPost fija SOLO tras una
// escritura exitosa. Permite al cliente CONFIRMAR que un envío ambiguo (timeout)
// SÍ llegó, sin re-enviar. Respeta SHARED_TOKEN (mismo gate que sheetRows).
function verifyReq(reqId, t) {
  try {
    var _tkVer = sharedToken_();
    if (_tkVer && String(t) !== _tkVer) return respond({ status: "error", message: "No autorizado" });
    var rid = String(reqId || "").slice(0, 120);
    if (!rid) return respond({ status: "ok", processed: false });
    var hit = CacheService.getScriptCache().get("idem_" + rid);
    return respond({ status: "ok", processed: !!hit });
  } catch (err) {
    return respond({ status: "error", message: "verify_error" });
  }
}

// ── Lectura de filas de una hoja (para clientes SIN store del dashboard, como
// el monolito standalone). GET ?p=rows&sheet=<nombre>&t=<token>. Devuelve JSON
// {ok, sheet, headers, rows} con cada fila como objeto {cabecera: valor}. Sólo
// hojas de ALLOWED; respeta SHARED_TOKEN si está configurado (mismo gate que
// doPost). Fechas → yyyy-MM-dd. Tope 20000 filas (ver TOPE_FILAS).
//
// El parámetro "cols" (opcional, ?cols=A,B,C) PROYECTA: devuelve sólo esas columnas.
// Medido el 2026-08-12 contra el despliegue real: "Maduración MATRIZ" son 1508 filas
// por 12 columnas = 392 KB, de las que el cliente sólo usa 4 (65 KB). El tamaño de la
// respuesta es lo que dispara los timeouts del lector, así que recortarla ataca la
// causa. Sin el parámetro se devuelven TODAS las columnas: compatible con los
// clientes viejos y con cualquier despliegue anterior a este cambio.
function sheetRows(name, t, cols) {
  var out = { ok: false, sheet: name, headers: [], rows: [] };
  try {
    var _tkRows = sharedToken_();
    if (_tkRows && String(t) !== _tkRows) { out.error = "No autorizado"; return _evJson(out); }
    if (ALLOWED.indexOf(name) === -1) { out.error = "Hoja no permitida"; return _evJson(out); }
    var ss = SpreadsheetApp.openById(SS_ID);
    var ws = ss.getSheetByName(name);
    if (!ws) { out.ok = true; return _evJson(out); }
    var vals = ws.getDataRange().getValues();
    if (vals.length < 1) { out.ok = true; return _evJson(out); }
    var headers = vals[0].map(function (h) { return String(h == null ? "" : h).trim(); });
    // Columnas pedidas (si las hay). Se ignoran los nombres que no existan en la
    // hoja; si no queda ninguno válido se devuelven todas, para que un "cols" mal
    // escrito degrade a la lectura completa en vez de a una respuesta vacía.
    var want = null;
    if (cols) {
      want = {};
      String(cols).split(",").forEach(function (c) { var k = c.trim(); if (k) want[k] = true; });
    }
    var keep = [];
    for (var c0 = 0; c0 < headers.length; c0++) {
      if (!headers[c0]) continue;
      if (!want || want[headers[c0]]) keep.push(c0);
    }
    if (!keep.length) { for (var c1 = 0; c1 < headers.length; c1++) { if (headers[c1]) keep.push(c1); } }
    var outHeaders = keep.map(function (ci) { return headers[ci]; });
    // ⚠⚠ EL TOPE RECORTA, y hasta el 2026-09-09 lo hacía EN SILENCIO. Quien suma
    // sobre lo devuelto —el libro mayor de Maduración lo hace— obtendría un saldo
    // incompleto sin un solo síntoma, que es el peor resultado posible aquí.
    // «Maduración Tanques» crece hasta 38 filas al día (los tanques de las 5 salas),
    // así que el tope no es teórico: con uso diario, se acaba alcanzando.
    // 🔑 D11 (2026-09-13): el tope pasa de 5000 a 20000. Se lee desde ARRIBA, así que lo
    // que se pierde al recortar son las filas MÁS RECIENTES; con 5000, la Bitácora del
    // reproductivo (2227 filas y unas 30 nuevas al día) lo alcanzaba entre diciembre de
    // 2026 y enero de 2027. El precio es el tamaño: 20000 filas de Bitácora rondan 2,4 MB.
    var TOPE_FILAS = 20000;
    var rows = [], cortada = false;
    for (var i = 1; i < vals.length; i++) {
      if (rows.length >= TOPE_FILAS) { cortada = true; break; }
      var r = vals[i], obj = {}, any = false;
      for (var k = 0; k < keep.length; k++) {
        var key = outHeaders[k];
        var cell = _rowsCell(r[keep[k]]);
        if (cell !== "") any = true;
        obj[key] = cell;
      }
      // "Fila vacía" se juzga sobre las columnas DEVUELTAS: con proyección, una fila
      // sin ninguno de esos campos no aporta nada al cliente que los pidió.
      if (any) rows.push(obj);
    }
    out.ok = true; out.headers = outHeaders; out.rows = rows;
    // Retrocompatible a propósito: un cliente que no mire «truncated» ve exactamente
    // lo mismo que antes. El que lo mire puede decir «esto está incompleto» en vez
    // de calcular sobre media hoja.
    if (cortada) { out.truncated = true; out.limit = TOPE_FILAS; }
    return _evJson(out);
  } catch (err) {
    out.error = "Error al leer la hoja"; return _evJson(out);
  }
}
function _rowsCell(v) {
  if (v instanceof Date) { return formatoCelda_(v, "yyyy-MM-dd"); }
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
  if (v instanceof Date) { return formatoCelda_(v, "yyyy-MM-dd"); }
  var s = String(v == null ? "" : v).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}
function _evCellHora(v) {
  if (v instanceof Date) { return formatoCelda_(v, "HH:mm"); }
  return String(v == null ? "" : v);
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

// ── Mantenimiento · saneamiento del As Técnico (Registro_Supervisión) ─────
// NO se expone por doGet/doPost: se ejecuta A MANO desde el editor de Apps
// Script. Es deliberado — doPost ya escribe sin autenticación (SHARED_TOKEN
// vacío), y una utilidad que reescribe IDs y borra filas no debe además
// alcanzarse desde la URL pública.
//
// Repara el daño del despliegue anterior, que recortaba cada fila del AsT a 25
// columnas y perdía el ID por el camino. Hace DOS cosas y nada más:
//
//   1. Rellena la columna "ID" de las filas que la tienen vacía. Sin ID la fila
//      es inalcanzable para upsertAstRows: re-sincronizar ese registro no la
//      actualiza, la DUPLICA.
//   2. Borra las filas exactamente duplicadas — mismo ID y mismo contenido en
//      todas las columnas. Sólo esas: si dos filas comparten ID pero difieren
//      en algo, se dejan quietas y se informan, porque elegir cuál sobra no es
//      decisión de un script.
//
// No toca ninguna otra columna, no reordena filas y no cambia formatos. Ninguna
// vista del tablero lee la columna ID, así que la visualización no se entera.
// Es IDEMPOTENTE — la segunda ejecución no encuentra nada que hacer.
//
// Uso desde el editor de Apps Script:
//   sanearAstIds()      → SIMULACRO: informa en el registro y NO escribe nada.
//   sanearAstIds(true)  → aplica los cambios.
function sanearAstIds(aplicar) {
  var APLICAR = (aplicar === true);
  var NOMBRE  = "Registro_Supervisión";
  var ss = SpreadsheetApp.openById(SS_ID);
  var ws = ss.getSheetByName(NOMBRE);
  if (!ws) { Logger.log("ABORTADO: no existe la hoja " + NOMBRE); return null; }

  // El mismo lock que usa doPost: si alguien está sincronizando, se espera.
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); }
  catch (eLock) { Logger.log("ABORTADO: la hoja está ocupada, reintenta en un momento."); return null; }

  try {
    var data = ws.getDataRange().getValues();
    if (data.length < 2) { Logger.log("La hoja no tiene filas de datos."); return null; }

    var hdr = data[0], idCol = -1;
    for (var h = 0; h < hdr.length; h++) {
      if (String(hdr[h] == null ? "" : hdr[h]).trim() === "ID") { idCol = h; break; }
    }
    if (idCol < 0) { Logger.log("ABORTADO: la hoja no tiene columna ID."); return null; }

    // ── Inventario: qué IDs están en uso, qué filas no tienen ninguno ──
    var usados = {}, porId = {}, vacias = [];
    for (var i = 1; i < data.length; i++) {
      var id = String(data[i][idCol] == null ? "" : data[i][idCol]).trim();
      if (!id) { vacias.push(i); continue; }
      usados[id] = true;
      if (!porId[id]) porId[id] = [];
      porId[id].push(i);
    }

    // ── Duplicados: exactos a borrar, ambiguos sólo a informar ──
    var aBorrar = [], dudosos = [];
    for (var did in porId) {
      var filas = porId[did];
      if (filas.length < 2) continue;
      var base = data[filas[0]];          // la primera se conserva siempre
      for (var k = 1; k < filas.length; k++) {
        if (_astFilasIguales(base, data[filas[k]])) aBorrar.push(filas[k]);
        else dudosos.push(did + " (filas " + (filas[0] + 1) + " y " + (filas[k] + 1) + ")");
      }
    }

    // ── IDs nuevos para las filas huérfanas ──
    var nuevos = [];
    for (var v = 0; v < vacias.length; v++) {
      var nid = _astNuevoId(usados);
      usados[nid] = true;
      nuevos.push({ fila: vacias[v] + 1, id: nid });   // fila de HOJA (1-indexed)
    }

    // ── Informe ──
    Logger.log((APLICAR ? "APLICANDO" : "SIMULACRO (no se escribe nada)") + " · hoja " + NOMBRE);
    Logger.log("Filas de datos: " + (data.length - 1) + " · columna ID: " + (idCol + 1));
    Logger.log("Filas sin ID: " + nuevos.length);
    for (var n = 0; n < nuevos.length; n++) Logger.log("   fila " + nuevos[n].fila + " -> " + nuevos[n].id);
    Logger.log("Filas duplicadas exactas a borrar: " + aBorrar.length);
    for (var b = 0; b < aBorrar.length; b++) Logger.log("   fila " + (aBorrar[b] + 1) + " (ID " + _astCelda(data[aBorrar[b]][idCol]) + ")");
    if (dudosos.length) {
      Logger.log("ATENCIÓN · mismo ID con contenido distinto (NO se tocan, revísalas a mano): " + dudosos.length);
      for (var d = 0; d < dudosos.length; d++) Logger.log("   " + dudosos[d]);
    }
    if (!APLICAR) {
      Logger.log("Nada escrito. Ejecuta sanearAstIds(true) para aplicarlo.");
      return { simulacro: true, sinId: nuevos.length, duplicadas: aBorrar.length, dudosas: dudosos.length };
    }

    // ── Aplicar: PRIMERO los IDs (los números de fila aún son válidos) y
    // DESPUÉS los borrados de abajo arriba, que así no desplazan lo ya escrito.
    for (var w = 0; w < nuevos.length; w++) {
      ws.getRange(nuevos[w].fila, idCol + 1).setValue(nuevos[w].id);
    }
    aBorrar.sort(function(a, b) { return b - a; });
    for (var x = 0; x < aBorrar.length; x++) ws.deleteRow(aBorrar[x] + 1);
    SpreadsheetApp.flush();

    Logger.log("LISTO · " + nuevos.length + " ID escritos · " + aBorrar.length + " fila(s) duplicada(s) borrada(s).");
    return { simulacro: false, sinId: nuevos.length, duplicadas: aBorrar.length, dudosas: dudosos.length };
  } finally {
    lock.releaseLock();
  }
}

// ¿Dos filas de la hoja son la MISMA fila? Compara celda a celda, tolerando que
// una traiga menos columnas que la otra (las que falten cuentan como vacías).
function _astFilasIguales(a, b) {
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    if (_astCelda(i < a.length ? a[i] : "") !== _astCelda(i < b.length ? b[i] : "")) return false;
  }
  return true;
}
// Normaliza una celda a texto comparable. Date -> yyyy-MM-dd, que es como las
// devuelve getValues() y como las escribe el cliente.
function _astCelda(v) {
  if (v instanceof Date) return formatoCelda_(v, "yyyy-MM-dd");
  return String(v == null ? "" : v).trim();
}

// ID con el MISMO formato que genera la app (base36 del reloj + 4 al azar), para
// que una fila saneada no se distinga de una nacida en el cliente. Se exige al
// menos una letra: un ID de puros dígitos lo guardaría la hoja como NÚMERO y
// dejaría de casar con el texto que envía el cliente en el upsert.
function _astNuevoId(usados) {
  for (var intento = 0; intento < 200; intento++) {
    var suf = "";
    while (suf.length < 4) suf += Math.random().toString(36).slice(2);
    var id = Date.now().toString(36) + suf.slice(0, 4);
    if (_astTieneLetra(id) && !usados[id]) return id;
  }
  var n = 0;                                  // salida de emergencia, sigue siendo único
  while (usados["ast" + n]) n++;
  return "ast" + n;
}
function _astTieneLetra(s) {
  for (var i = 0; i < s.length; i++) { var c = s.charAt(i); if (c >= "a" && c <= "z") return true; }
  return false;
}

// ── Respuesta JSON ────────────────────────────────────────
function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}