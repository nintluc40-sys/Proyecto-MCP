// ════════════════════════════════════════════════════════════════════════════════════
// Google Apps Script — MCP · clima (2026-10-27)
// Es un proyecto APARTE: NO es el GAS del Registro (no toca su sello, su `ALLOWED` ni `index (8)`).
// script.google.com → Nuevo proyecto (con la cuenta dueña del libro) → pega este código completo →
// ⚙ Configuración del proyecto → Zona horaria «(GMT-05:00) Guayaquil» → ejecuta `probar` y luego `instalar`.
// (Instalado ANTES del 2026-10-28: pega el código nuevo y ejecuta UNA vez `rellenarObservado`. Cambios posteriores:
//  basta con pegar el código; los activadores llaman a las funciones por su nombre.)
// ════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ HACE: escribe en el libro del MCP dos hojas que el tablero lee como lee «Marea»:
//  · «Clima horas» — una fila por HORA (Fecha + Hora): lo que pasó y lo que queda del día de hoy.
//  · «Clima»       — una fila por DÍA: el resumen de sus horas («Registro») y el pronóstico de los 3 días
//                    siguientes («Pronóstico»).
//
// DE DÓNDE SALE CADA HORA (decisión del usuario, 27-10): de la MEJOR fuente que la tenga, por este orden —
//  1. «Observado SESA»: el METAR del aeropuerto de Salinas (a ~3 km del laboratorio; NOAA/AWC, dominio
//     público). Observa de 06 a 18 h, sin la lluvia en mm. AWC guarda sólo 15 días: lo anterior sale del
//     archivo METAR de la IEM (Iowa Environmental Mesonet, Iowa State University; dominio público), el MISMO
//     METAR por el MISMO camino (2026-10-28: el historial sólo NASA daba el máximo del día ~4 °C bajo).
//  2. «MET»: el pronóstico de MET Noruega (malla de ~9 km; CC BY 4.0). Cada pasada guarda las horas que
//     QUEDAN del día, así que cada hora termina con lo que MET dijo de ella a ≤ 3 h vista.
//  3. «NASA»: NASA POWER (MERRA-2 de ½° × ⅝°; nubes y radiación de CERES, 1°). Malla GRUESA: sólo llena el
//     historial anterior a la instalación y los huecos, NUNCA pisa a SESA ni a MET.
//  La lluvia en mm: MET y, en su defecto, NASA. La nubosidad: SESA > MET > NASA (la de NASA llega ~3 meses
//  tarde). Sensación térmica, niebla y UV: sólo MET. La radiación: sólo NASA (la diaria a ~8 días; la de
//  cada hora, ~3 meses). Cada fila dice de dónde vino cada grupo («Fuente», «Fuente lluvia», «Fuente
//  nubosidad»).
//
// ACTIVADORES (los crea `instalar`, que se puede repetir sin duplicarlos):
//  · `cadaTresHoras` — METAR + MET: las horas de hoy y el pronóstico.
//  · `nocturno` (hacia las 02:30) — NASA: rellena huecos, la nubosidad y la radiación que vaya publicando; y del
//    archivo METAR de la IEM, los días de hace 3 a 5: lo observado que AWC no trajo (2026-10-30).
// Sólo escribe si algo cambió (la consulta ligera del MCP lee la fecha de modificación del libro).
//
// Atribución que el MCP muestra: «Datos: METAR SESA (NOAA · IEM) · MET Norway · NASA POWER».
// ════════════════════════════════════════════════════════════════════════════════════

var CLIMA = {
  libro: "1Rrpff6bD1pOQFsi2Lsagan3ttjncxJzXoXLPgtHM0Gs",
  zona: "America/Guayaquil",
  offsetH: -5,                     // Ecuador no tiene horario de verano: la hora local es UTC − 5 todo el año
  sitio: { lat: -2.23, lon: -80.97 },  // Laboratorio Mar Bravo (el mismo punto que la maqueta de 🏭 Planta)
  estacion: "SESA",
  agente: "MCP-Omarsa-clima/1.0 nintluc40@gmail.com",  // MET Noruega exige identificarse con un contacto
  desde: "2026-08-01",             // historial (decisión del usuario)
  diasAwc: 15,                     // lo que guarda AWC (pedirMetar_(360)); lo anterior, del archivo de la IEM
  diasPronostico: 3,
  diasNasa: 120,                   // hasta dónde vuelve la pasada nocturna a buscar lo que NASA publique tarde
  hojaHoras: "Clima horas",
  hojaDias: "Clima"
};

var FUENTE = { sesa: "Observado SESA", met: "MET", nasa: "NASA" };
var RANGO_FUENTE = { "Observado SESA": 0, "MET": 1, "NASA": 2 };

var COL_HORAS = ["Fecha", "Hora", "Fuente", "Temperatura (°C)", "Humedad (%)", "Viento (km/h)", "Dirección (°)",
  "Presión (hPa)", "Lluvia (mm)", "Fuente lluvia", "Nubosidad (%)", "Fuente nubosidad", "Tiempo observado",
  "Sensación (°C)", "Niebla (%)", "UV", "Radiación (Wh/m²)", "Actualizado"];
var CAMPOS_HORAS = ["dia", "hora", "fuente", "t", "hr", "v", "dir", "p", "lluvia", "fLluvia", "nube", "fNube", "wx",
  "sens", "niebla", "uv", "rad", "act"];

var COL_DIAS = ["Fecha", "Tipo", "Temp mín (°C)", "Temp máx (°C)", "Temp media (°C)", "Humedad (%)", "Lluvia (mm)",
  "Nubosidad (%)", "Viento medio (km/h)", "Viento máx (km/h)", "Dirección (°)", "Presión (hPa)", "Sensación máx (°C)",
  "Niebla máx (%)", "UV máx", "Radiación (kWh/m²)", "Tiempo observado", "Horas observadas", "Horas MET", "Horas NASA",
  "Actualizado"];
var CAMPOS_DIAS = ["dia", "tipo", "tMin", "tMax", "tMed", "hr", "lluvia", "nube", "v", "vMax", "dir", "p", "sensMax",
  "nieblaMax", "uvMax", "rad", "wx", "hSesa", "hMet", "hNasa", "act"];

// ── PUNTOS DE ENTRADA ───────────────────────────────────────────────────────────────

/** Una sola vez (y cuando se quiera rehacer): comprueba la zona, crea las hojas, carga el historial y deja
 *  los dos activadores. Repetirla no duplica nada: las filas se llavean por fecha y hora. */
function instalar() {
  var ss = libro_();
  comprobarZona_(ss);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (["cadaTresHoras", "nocturno"].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  var errores = [];
  var r = conCandado_(function () {
    var hoy = claveDia_(Date.now());
    return pasada_(ss, {
      metar: intentar_(errores, function () { return pedirMetar_(360); }),   // los 15 días que guarda AWC
      metarArchivo: intentar_(errores, function () { return pedirMetarArchivo_(CLIMA.desde, sumarDias_(hoy, -CLIMA.diasAwc)); }),
      met: intentar_(errores, function () { return pedirMet_(true); }),
      nasaHoras: intentar_(errores, function () { return pedirNasaHoras_(CLIMA.desde, hoy); }),
      nasaDias: intentar_(errores, function () { return pedirNasaDias_(CLIMA.desde, hoy); })
    }, Date.now());
  });
  ScriptApp.newTrigger("cadaTresHoras").timeBased().everyHours(3).create();
  ScriptApp.newTrigger("nocturno").timeBased().everyDays(1).atHour(2).nearMinute(30).create();
  cerrar_("Instalado: ", r, errores);
}

/** Cada 3 horas: lo observado en SESA (48 h, por si alguna pasada falló) y el pronóstico de MET. */
function cadaTresHoras() {
  var ss = libro_(), errores = [];
  var r = conCandado_(function () {
    return pasada_(ss, {
      metar: intentar_(errores, function () { return pedirMetar_(48); }),
      met: intentar_(errores, function () { return pedirMet_(false); })
    }, Date.now());
  });
  cerrar_("", r, errores);
}

/** Cada noche: NASA, sólo desde el primer día al que le falte algo que NASA pueda dar; y del archivo METAR de la IEM, los
 *  días de hace 3 a 5 (2026-10-30, usuario: «De hace 3 a 5 días»): lo que AWC no trajo (el 14-10 a las 6:00 siguió con NASA
 *  hasta otro `instalar`). Las pasadas sólo piden 48 h a AWC: esos días ya no los vuelve a traer y no se pisan con él. */
function nocturno() {
  var ss = libro_(), errores = [];
  var r = conCandado_(function () {
    var ahora = Date.now(), hoy = claveDia_(ahora);
    var horas = leerHoras_(ss), dias = leerDias_(ss);
    var tope = maxClave_(CLIMA.desde, sumarDias_(hoy, -CLIMA.diasNasa));
    var desdeH = primerDiaConHueco_(horas.filas, tope, sumarDias_(hoy, -1));
    var desdeD = primerDiaSinRadiacion_(dias.filas, tope, sumarDias_(hoy, -1));
    return pasada_(ss, {
      metar: intentar_(errores, function () { return pedirMetar_(48); }),
      metarArchivo: intentar_(errores, function () { return pedirMetarArchivo_(maxClave_(CLIMA.desde, sumarDias_(hoy, -5)), sumarDias_(hoy, -3)); }),
      nasaHoras: desdeH ? intentar_(errores, function () { return pedirNasaHoras_(desdeH, hoy); }) : null,
      nasaDias: desdeD ? intentar_(errores, function () { return pedirNasaDias_(desdeD, hoy); }) : null
    }, ahora);
  });
  cerrar_("", r, errores);
}

/** Una vez, para lo instalado antes del 2026-10-28 (`instalar` ya lo hace): lo OBSERVADO en SESA de los días que AWC
 *  ya no guarda, desde el archivo METAR de la IEM. Pisa a NASA en esas horas (nunca al revés) y rehace esos días.
 *  Repetirla no cambia nada. */
function rellenarObservado() {
  var ss = libro_(), errores = [];
  var r = conCandado_(function () {
    var hoy = claveDia_(Date.now());
    return pasada_(ss, {
      metarArchivo: intentar_(errores, function () { return pedirMetarArchivo_(CLIMA.desde, sumarDias_(hoy, -CLIMA.diasAwc)); })
    }, Date.now());
  });
  cerrar_("Rellenado: ", r, errores);
}

/** Una fuente caída no tumba a las demás: su error se apunta y la pasada guarda lo que sí llegó. */
function intentar_(errores, fn) {
  try { return fn(); } catch (e) { errores.push(e.message); return null; }
}

/** …y DESPUÉS de guardar, la ejecución termina en error si alguna falló: Apps Script la marca como fallida y avisa
 *  al dueño por correo, así un corte largo de una fuente no pasa en silencio. */
function cerrar_(prefijo, r, errores) {
  Logger.log(prefijo + JSON.stringify(r));
  if (errores.length) throw new Error("Fuentes caídas en esta pasada: " + errores.join(" · "));
}

/** Para la instalación: pide las tres fuentes y dice qué devolvió cada una, SIN escribir nada. */
function probar() {
  var ss = libro_();
  Logger.log("Libro: " + ss.getName() + " · zona del libro " + ss.getSpreadsheetTimeZone() + " · zona del script " +
    Session.getScriptTimeZone());
  var hoy = claveDia_(Date.now());
  [["METAR SESA", function () { return horasDeMetar_(pedirMetar_(24)).length + " horas observadas"; }],
   ["METAR SESA (archivo IEM)", function () { return horasDeMetar_(pedirMetarArchivo_(sumarDias_(hoy, -20), sumarDias_(hoy, -16))).length + " horas observadas"; }],
   ["MET Noruega", function () { var j = pedirMet_(true); return j ? horasDeMet_(j, hoy).length + " horas de hoy" : "sin cambios (304)"; }],
   ["NASA horas", function () { return horasDeNasa_(pedirNasaHoras_(sumarDias_(hoy, -10), hoy)).length + " horas"; }],
   ["NASA días", function () { return Object.keys(radiacionDiaria_(pedirNasaDias_(sumarDias_(hoy, -15), hoy))).length + " días con radiación"; }]
  ].forEach(function (p) {
    try { Logger.log("✅ " + p[0] + ": " + p[1]()); } catch (e) { Logger.log("❌ " + p[0] + ": " + e.message); }
  });
}

// ── LA PASADA (pura salvo la lectura y escritura de las dos hojas) ──────────────────────

/** Funde lo recibido en las dos hojas y escribe sólo lo que cambió. `datos`: {metar, metarArchivo, met, nasaHoras, nasaDias},
 *  cada uno opcional (null = esa fuente no se pidió o no trajo nada nuevo). */
function pasada_(ss, datos, ahora) {
  var hoy = claveDia_(ahora), act = new Date(ahora);
  var H = leerHoras_(ss), D = leerDias_(ss);
  var candidatos = [];
  if (datos.nasaHoras) candidatos = candidatos.concat(horasDeNasa_(datos.nasaHoras));
  if (datos.met) candidatos = candidatos.concat(horasDeMet_(datos.met, hoy));
  if (datos.metar) candidatos = candidatos.concat(horasDeMetar_(datos.metar));
  if (datos.metarArchivo) candidatos = candidatos.concat(horasDeMetar_(datos.metarArchivo));
  var fusion = fusionarHoras_(H.filas, candidatos.filter(function (c) { return c.dia >= CLIMA.desde && c.dia <= hoy; }), act);
  var rad = datos.nasaDias ? radiacionDiaria_(datos.nasaDias) : {};
  var pron = datos.met ? pronosticoDeMet_(datos.met, hoy, CLIMA.diasPronostico) : null;
  var nuevosDias = rehacerDias_(D.filas, fusion.filas, fusion.tocados, rad, pron, hoy, act);
  var eh = escribir_(H.hoja, COL_HORAS, H.crudas, fusion.filas.map(aFilaHoras_));
  var ed = escribir_(D.hoja, COL_DIAS, D.crudas, nuevosDias.map(aFilaDias_));
  return { horas: fusion.filas.length, horasCambiadas: fusion.cambiadas, filasEscritasHoras: eh, filasEscritasDias: ed,
    metar: !!datos.metar, metarArchivo: !!datos.metarArchivo, met: !!datos.met, nasaHoras: !!datos.nasaHoras, nasaDias: !!datos.nasaDias };
}

/** Funde los candidatos en las filas por hora. Devuelve las filas ordenadas, cuántas cambiaron y qué días. */
function fusionarHoras_(filas, candidatos, act) {
  var mapa = {}, tocados = {}, cambiadas = 0;
  filas.forEach(function (f) { mapa[f.dia + "|" + f.hora] = f; });
  candidatos.forEach(function (c) {
    var k = c.dia + "|" + c.hora, r = fusionarHora_(mapa[k], c);
    if (r.cambio) { r.fila.act = act; mapa[k] = r.fila; tocados[c.dia] = true; cambiadas++; }
  });
  var orden = Object.keys(mapa).map(function (k) { return mapa[k]; });
  orden.sort(function (a, b) { return a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.hora - b.hora; });
  return { filas: orden, tocados: tocados, cambiadas: cambiadas };
}

function horaVacia_(dia, hora) {
  return { dia: dia, hora: hora, fuente: "", t: null, hr: null, v: null, dir: null, p: null, lluvia: null, fLluvia: "",
    nube: null, fNube: "", wx: "", sens: null, niebla: null, uv: null, rad: null, act: null };
}

function rangoFuente_(f) { return Object.prototype.hasOwnProperty.call(RANGO_FUENTE, f) ? RANGO_FUENTE[f] : 9; }

/** La regla de prioridad, grupo a grupo. Una fuente PEOR nunca pisa a una mejor; una igual sí (la pasada nueva
 *  de MET corrige su pronóstico de las horas que aún no pasaron). */
function fusionarHora_(prev, c) {
  var h = prev || horaVacia_(c.dia, c.hora), n = {};
  CAMPOS_HORAS.forEach(function (k) { n[k] = h[k]; });
  var rc = rangoFuente_(c.fuente);
  if (c.t != null && rc <= rangoFuente_(n.fuente)) {
    n.fuente = c.fuente; n.t = c.t; n.hr = c.hr; n.v = c.v; n.dir = c.dir; n.p = c.p;
  }
  if (c.lluvia != null && rc <= rangoFuente_(n.fLluvia)) { n.lluvia = c.lluvia; n.fLluvia = c.fuente; }
  if (c.nube != null && rc <= rangoFuente_(n.fNube)) { n.nube = c.nube; n.fNube = c.fuente; }
  if (c.fuente === FUENTE.sesa && c.wx != null) n.wx = c.wx;
  if (c.fuente === FUENTE.met) {
    if (c.sens != null) n.sens = c.sens;
    if (c.niebla != null) n.niebla = c.niebla;
    if (c.uv != null) n.uv = c.uv;
  }
  if (c.rad != null) n.rad = c.rad;
  var cambio = !prev || CAMPOS_HORAS.some(function (k) { return k !== "act" && !mismoValor_(h[k], n[k]); });
  return { fila: n, cambio: cambio };
}

/** Las filas por día: rehace las de los días tocados, la de hoy, las que reciben radiación y las de
 *  «Pronóstico» que ya no son futuras; pone el pronóstico nuevo (si MET respondió). El resto queda igual. */
function rehacerDias_(filasDias, filasHoras, tocados, rad, pron, hoy, act) {
  var mapa = {}, porDia = {};
  filasDias.forEach(function (d) { mapa[d.dia] = d; });
  filasHoras.forEach(function (h) { (porDia[h.dia] = porDia[h.dia] || []).push(h); });
  var rehacer = {};
  Object.keys(tocados).forEach(function (d) { rehacer[d] = true; });
  Object.keys(rad).forEach(function (d) { if (d >= CLIMA.desde && d < hoy) rehacer[d] = true; });
  if (porDia[hoy]) rehacer[hoy] = true;
  Object.keys(mapa).forEach(function (d) { if (mapa[d].tipo === "Pronóstico" && d <= hoy) rehacer[d] = true; });
  Object.keys(rehacer).forEach(function (d) {
    var prev = mapa[d];
    if (!porDia[d]) { if (prev && prev.tipo === "Pronóstico") delete mapa[d]; return; }
    var nueva = resumenDia_(d, porDia[d], rad[d] != null ? rad[d] : (prev ? prev.rad : null));
    if (!prev || CAMPOS_DIAS.some(function (k) { return k !== "act" && !mismoValor_(prev[k], nueva[k]); })) {
      nueva.act = act; mapa[d] = nueva;
    }
  });
  if (pron) {
    Object.keys(mapa).forEach(function (d) { if (d > hoy && mapa[d].tipo === "Pronóstico" && !pron[d]) delete mapa[d]; });
    Object.keys(pron).forEach(function (d) {
      var prev = mapa[d], nueva = pron[d];
      if (!prev || CAMPOS_DIAS.some(function (k) { return k !== "act" && !mismoValor_(prev[k], nueva[k]); })) {
        nueva.act = act; mapa[d] = nueva;
      }
    });
  }
  return Object.keys(mapa).sort().map(function (d) { return mapa[d]; });
}

/** El resumen de un día a partir de sus horas. Cada cifra, SÓLO si las 24 horas tienen esa variable: con las 13
 *  horas diurnas del aeropuerto la «media» salía 2–3 °C por encima de la del día y se leía como tal (medido el 27-10);
 *  igual la lluvia, cuya suma parcial pasaría por el total. Las horas que hay las dicen las tres cuentas del final. */
function resumenDia_(dia, horas, rad) {
  var val = function (k) {
    var a = horas.map(function (h) { return h[k]; }).filter(function (x) { return x != null; });
    return a.length >= 24 ? a : [];
  };
  var t = val("t"), ll = val("lluvia"), vel = val("v");
  var cuenta = { s: 0, m: 0, n: 0 }, wx = {};
  horas.forEach(function (h) {
    if (h.fuente === FUENTE.sesa) cuenta.s++; else if (h.fuente === FUENTE.met) cuenta.m++; else if (h.fuente === FUENTE.nasa) cuenta.n++;
    if (h.wx) h.wx.split(", ").forEach(function (w) { wx[w] = (wx[w] || 0) + 1; });
  });
  return {
    dia: dia, tipo: "Registro",
    tMin: t.length ? Math.min.apply(null, t) : null, tMax: t.length ? Math.max.apply(null, t) : null,
    tMed: redondear_(media_(t), 1), hr: redondear_(media_(val("hr")), 0),
    lluvia: ll.length ? redondear_(ll.reduce(function (s, x) { return s + x; }, 0), 1) : null,
    nube: redondear_(media_(val("nube")), 0),
    v: redondear_(media_(vel), 1), vMax: vel.length ? Math.max.apply(null, vel) : null,
    dir: vel.length ? direccionMedia_(horas.map(function (h) { return [h.v, h.dir]; })) : null,
    p: redondear_(media_(val("p")), 1),
    sensMax: maximo_(val("sens")), nieblaMax: maximo_(val("niebla"), 0), uvMax: maximo_(val("uv")),
    rad: rad, wx: Object.keys(wx).map(function (w) { return w + " (" + wx[w] + " h)"; }).join(", "),
    hSesa: cuenta.s, hMet: cuenta.m, hNasa: cuenta.n, act: null
  };
}

// ── LAS FUENTES → candidatos por hora {dia, hora, fuente, …} ────────────────────────────

/** METAR (JSON de AWC). Una observación por hora: la ordinaria («METAR») antes que una especial («SPECI»),
 *  y entre iguales la más cercana a la hora en punto. */
function horasDeMetar_(lista) {
  var porHora = {};
  (lista || []).forEach(function (m) {
    var ms = typeof m.obsTime === "number" ? m.obsTime * 1000 : Date.parse(m.reportTime);
    if (isNaN(ms) || m.temp == null) return;
    var redondo = Math.round(ms / 3600000) * 3600000, k = claveDia_(redondo) + "|" + horaLocal_(redondo);
    var peso = (m.metarType === "SPECI" ? 1e9 : 0) + Math.abs(ms - redondo);
    if (porHora[k] && porHora[k].peso <= peso) return;
    var dir = typeof m.wdir === "number" ? m.wdir : null, v = typeof m.wspd === "number" ? m.wspd * 1.852 : null;
    porHora[k] = { peso: peso, c: {
      dia: claveDia_(redondo), hora: horaLocal_(redondo), fuente: FUENTE.sesa,
      t: m.temp, hr: m.dewp != null ? redondear_(humedad_(m.temp, m.dewp), 0) : null,
      v: v != null ? redondear_(v, 1) : null, dir: v === 0 ? null : dir, p: m.altim != null ? redondear_(m.altim, 1) : null,
      nube: nubosidadMetar_(m), wx: traducirWx_(m.wxString)
    } };
  });
  return Object.keys(porHora).map(function (k) { return porHora[k].c; });
}

/** El grupo de viento del propio METAR («dddffKT», «dddffGggKT», «VRBffKT»; en KT o MPS) → { wdir, wspd en nudos }, o
 *  null si no lo trae. Se exige la unidad: así un «19999» (una visibilidad mal escrita) no pasa por viento. */
function vientoDelMetar_(crudo) {
  var m = /(?:^|\s)(\d{3}|VRB)(\d{2,3})(?:G\d{2,3})?(KT|MPS)(?=\s|$)/.exec(String(crudo || ""));
  if (!m) return null;
  return { wdir: m[1] === "VRB" ? null : +m[1], wspd: m[3] === "MPS" ? +m[2] * 1.943844 : +m[2] };
}

/** El archivo METAR de la IEM (CSV con `tz=UTC`) → la MISMA forma que el JSON de AWC, para que pase por horasDeMetar_.
 *  La presión llega en pulgadas de mercurio («alti», sacada del Q del METAR): redondeada a hPa enteros vuelve a ser el
 *  Q. «M» = sin dato. Sólo se piden los METAR ordinarios (report_type=3).
 *  2026-10-30 · el VIENTO sale del grupo de viento del METAR original (la columna «metar», la última), y sólo si no lo
 *  trae, del que decodifica la IEM: el 30-09 a las 12:00 y 13:00 UTC, SESA mandó «19014KT 19999» y «20013KT 19999» (la
 *  visibilidad mal escrita) y la IEM leyó «19999» como viento de 199° a 99 m/s (sknt 192,44): 356,4 km/h en el libro. */
function metarDeArchivo_(texto) {
  var lineas = String(texto || "").trim().split(/\r?\n/);
  if (lineas.length < 2) return [];
  var cab = lineas[0].split(",");
  var dato = function (f, n) { var x = f[cab.indexOf(n)]; return x == null || x === "" || x === "M" ? null : x; };
  var numero = function (f, n) { var x = dato(f, n); return x == null || !isFinite(+x) ? null : +x; };
  var out = [];
  for (var i = 1; i < lineas.length; i++) {
    var f = lineas[i].split(","), ms = Date.parse(String(dato(f, "valid") || "").replace(" ", "T") + ":00Z");
    if (isNaN(ms)) continue;
    var alti = numero(f, "alti");
    // «metar» va la última: su texto entero, aunque traiga alguna coma
    var viento = cab.indexOf("metar") >= 0 ? vientoDelMetar_(f.slice(cab.indexOf("metar")).join(",")) : null;
    out.push({ obsTime: ms / 1000, metarType: "METAR", temp: numero(f, "tmpc"), dewp: numero(f, "dwpc"),
      wdir: viento ? viento.wdir : numero(f, "drct"), wspd: viento ? viento.wspd : numero(f, "sknt"),
      altim: alti != null ? Math.round(alti * 33.8639) : null,
      clouds: ["skyc1", "skyc2", "skyc3", "skyc4"].map(function (n) { return dato(f, n); })
        .filter(function (c) { return c; }).map(function (c) { return { cover: c }; }),
      wxString: dato(f, "wxcodes") });
  }
  return out;
}

/** MET Noruega (`complete`). Sólo los pasos horarios de hoy y de días anteriores: los días siguientes van
 *  al pronóstico diario. */
function horasDeMet_(json, hoy) {
  var ts = json.properties.timeseries, out = [];
  for (var i = 0; i < ts.length; i++) {
    var ms = Date.parse(ts[i].time), g = pasoHoras_(ts, i), d = ts[i].data, x = d.instant.details;
    if (g !== 1 || !d.next_1_hours) continue;
    var dia = claveDia_(ms);
    if (dia > hoy) continue;
    out.push({
      dia: dia, hora: horaLocal_(ms), fuente: FUENTE.met,
      t: num_(x.air_temperature, 1), hr: num_(x.relative_humidity, 0), v: x.wind_speed != null ? redondear_(x.wind_speed * 3.6, 1) : null,
      dir: num_(x.wind_from_direction, 0), p: num_(x.air_pressure_at_sea_level, 1),
      lluvia: num_(d.next_1_hours.details && d.next_1_hours.details.precipitation_amount, 1),
      nube: num_(x.cloud_area_fraction, 0), sens: num_(x.apparent_air_temperature, 1), niebla: num_(x.fog_area_fraction, 0),
      uv: num_(x.ultraviolet_index_clear_sky, 1)
    });
  }
  return out;
}

/** El pronóstico diario de los `n` días siguientes a `hoy`. Los pasos de MET duran 1 h al principio y 6 h después:
 *  cada paso vale por cada una de sus horas (su lluvia, repartida), así que un bloque que cruza la medianoche cuenta
 *  en los dos días. Como en el registro, cada cifra sólo si las 24 horas del día tienen esa variable: el UV y la niebla
 *  vienen sólo en los pasos horarios (~2,5 días) y el máximo de un día a medias saldría de su madrugada (UV 0,6). */
function pronosticoDeMet_(json, hoy, n) {
  var ts = json.properties.timeseries, acc = {}, ultimo = sumarDias_(hoy, n);
  var VAR = { t: "air_temperature", hr: "relative_humidity", nube: "cloud_area_fraction", p: "air_pressure_at_sea_level",
    sens: "apparent_air_temperature", niebla: "fog_area_fraction", uv: "ultraviolet_index_clear_sky" };
  var dia = function (k) {
    if (!acc[k]) {
      acc[k] = { horas: 0, lluvia: 0, horasLluvia: 0, extremos: [], v: [], viento: [] };
      Object.keys(VAR).forEach(function (v) { acc[k][v] = []; });
    }
    return acc[k];
  };
  for (var i = 0; i < ts.length; i++) {
    var ms = Date.parse(ts[i].time), g = pasoHoras_(ts, i), d = ts[i].data, x = d.instant.details;
    var bloque = g === 1 ? d.next_1_hours : d.next_6_hours;
    var mm = bloque && bloque.details ? bloque.details.precipitation_amount : null;
    for (var h = 0; h < g; h++) {
      var kh = claveDia_(ms + h * 3600000);
      if (kh <= hoy || kh > ultimo) continue;
      var a = dia(kh);
      a.horas++;
      if (mm != null) { a.lluvia += mm / g; a.horasLluvia++; }
      Object.keys(VAR).forEach(function (v) { if (x[VAR[v]] != null) a[v].push(x[VAR[v]]); });
      if (x.wind_speed != null) { a.v.push(x.wind_speed * 3.6); a.viento.push([x.wind_speed * 3.6, x.wind_from_direction]); }
    }
    if (g === 6 && d.next_6_hours && d.next_6_hours.details) {
      var km = claveDia_(ms + 3 * 3600000), det = d.next_6_hours.details;
      if (km > hoy && km <= ultimo) {
        if (det.air_temperature_min != null) dia(km).extremos.push(det.air_temperature_min);
        if (det.air_temperature_max != null) dia(km).extremos.push(det.air_temperature_max);
      }
    }
  }
  var out = {};
  Object.keys(acc).forEach(function (k) {
    var a = acc[k], c = function (arr) { return arr.length >= 24 ? arr : []; };
    if (a.horas < 24) return;   // un día que MET no cubre entero no es un pronóstico del día
    var t = c(a.t), te = t.length ? t.concat(a.extremos) : [], v = c(a.v);
    out[k] = {
      dia: k, tipo: "Pronóstico",
      tMin: te.length ? redondear_(Math.min.apply(null, te), 1) : null, tMax: te.length ? redondear_(Math.max.apply(null, te), 1) : null,
      tMed: redondear_(media_(t), 1), hr: redondear_(media_(c(a.hr)), 0),
      lluvia: a.horasLluvia >= 24 ? redondear_(a.lluvia, 1) : null, nube: redondear_(media_(c(a.nube)), 0),
      v: redondear_(media_(v), 1), vMax: v.length ? redondear_(Math.max.apply(null, v), 1) : null,
      dir: v.length ? direccionMedia_(a.viento) : null, p: redondear_(media_(c(a.p)), 1),
      sensMax: maximo_(c(a.sens), 1), nieblaMax: maximo_(c(a.niebla), 0), uvMax: maximo_(c(a.uv), 1),
      rad: null, wx: "", hSesa: 0, hMet: 24, hNasa: 0, act: null
    };
  });
  return out;
}

/** NASA POWER por hora (claves «AAAAMMDDHH» en UTC). El grupo base (temperatura, humedad, viento, presión)
 *  sólo si viene ENTERO; la lluvia, la nubosidad y la radiación, cada una cuando la haya (−999 = aún no). */
function horasDeNasa_(json) {
  var p = json && json.properties && json.properties.parameter;
  if (!p || !p.T2M) return [];
  var v = function (par, k) { var x = p[par] && p[par][k]; return x == null || x === -999 ? null : x; };
  var out = [];
  Object.keys(p.T2M).forEach(function (k) {
    var ms = Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), +k.slice(8, 10));
    var t = v("T2M", k), hr = v("RH2M", k), ws = v("WS10M", k), wd = v("WD10M", k), ps = v("PS", k);
    var base = t != null && hr != null && ws != null && wd != null && ps != null;
    var c = { dia: claveDia_(ms), hora: horaLocal_(ms), fuente: FUENTE.nasa,
      t: base ? redondear_(t, 1) : null, hr: base ? redondear_(hr, 0) : null, v: base ? redondear_(ws * 3.6, 1) : null,
      dir: base ? redondear_(wd, 0) : null, p: base ? redondear_(ps * 10, 1) : null,
      lluvia: num_(v("PRECTOTCORR", k), 1), nube: num_(v("CLOUD_AMT", k), 0), rad: num_(v("ALLSKY_SFC_SW_DWN", k), 0) };
    if (base || c.lluvia != null || c.nube != null || c.rad != null) out.push(c);
  });
  return out;
}

/** NASA POWER diario: la radiación de cada día (kWh/m²), {«AAAA-MM-DD»: valor}. */
function radiacionDiaria_(json) {
  var p = json && json.properties && json.properties.parameter && json.properties.parameter.ALLSKY_SFC_SW_DWN, out = {};
  if (!p) return out;
  Object.keys(p).forEach(function (k) {
    if (p[k] == null || p[k] === -999) return;
    out[k.slice(0, 4) + "-" + k.slice(4, 6) + "-" + k.slice(6, 8)] = redondear_(p[k], 2);
  });
  return out;
}

// ── PEDIDOS HTTP ──────────────────────────────────────────────────────────────────

function pedir_(url, cabeceras) {
  var r = UrlFetchApp.fetch(url, { headers: cabeceras || { "User-Agent": CLIMA.agente }, muteHttpExceptions: true });
  return { codigo: r.getResponseCode(), texto: r.getContentText(), cabeceras: r.getAllHeaders() };
}

function pedirMetar_(horas) {
  var r = pedir_("https://aviationweather.gov/api/data/metar?ids=" + CLIMA.estacion + "&format=json&hours=" + horas);
  if (r.codigo === 204 || (r.codigo === 200 && !r.texto.trim())) return [];
  if (r.codigo !== 200) throw new Error("METAR: HTTP " + r.codigo);
  return JSON.parse(r.texto);
}

/** El archivo METAR de la IEM, de los días locales [desde, hasta]: de desde 00:00 a hasta 24:00 de Ecuador, en UTC.
 *  null si el rango está vacío (lo instalado hace menos de 15 días ya lo tiene AWC). */
function pedirMetarArchivo_(desde, hasta) {
  if (!desde || !hasta || desde > hasta) return null;
  var h = "T" + pad2_(-CLIMA.offsetH) + ":00Z";
  var r = pedir_("https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=" + CLIMA.estacion +
    "&data=tmpc&data=dwpc&data=sknt&data=drct&data=alti&data=skyc1&data=skyc2&data=skyc3&data=skyc4&data=wxcodes&data=metar" +
    "&sts=" + desde + h + "&ets=" + sumarDias_(hasta, 1) + h + "&tz=UTC&format=onlycomma&latlon=no&missing=M&direct=no&report_type=3");
  if (r.codigo !== 200) throw new Error("METAR (archivo IEM): HTTP " + r.codigo);
  return metarDeArchivo_(r.texto);
}

/** MET pide no repetir lo que no cambió: con `If-Modified-Since` responde 304 y la pasada sigue sin MET. */
function pedirMet_(forzar) {
  var props = PropertiesService.getScriptProperties(), cab = { "User-Agent": CLIMA.agente };
  var previa = props.getProperty("met_last_modified");
  if (previa && !forzar) cab["If-Modified-Since"] = previa;
  var r = pedir_("https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=" + CLIMA.sitio.lat + "&lon=" + CLIMA.sitio.lon, cab);
  if (r.codigo === 304) return null;
  if (r.codigo !== 200) throw new Error("MET Noruega: HTTP " + r.codigo);
  var lm = r.cabeceras["Last-Modified"] || r.cabeceras["last-modified"];
  if (lm) props.setProperty("met_last_modified", lm);
  return JSON.parse(r.texto);
}

/** Las horas locales de [desde, hasta] son UTC de desde 05:00 a hasta+1 04:00: se pide un día UTC de más. */
function pedirNasaHoras_(desde, hasta) {
  var url = "https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=T2M,RH2M,PRECTOTCORR,WS10M,WD10M,PS,CLOUD_AMT,ALLSKY_SFC_SW_DWN" +
    "&community=RE&latitude=" + CLIMA.sitio.lat + "&longitude=" + CLIMA.sitio.lon + "&start=" + desde.replace(/-/g, "") +
    "&end=" + sumarDias_(hasta, 1).replace(/-/g, "") + "&format=JSON&time-standard=UTC";
  var r = pedir_(url);
  if (r.codigo !== 200) throw new Error("NASA POWER (horas): HTTP " + r.codigo + " " + r.texto.slice(0, 200));
  return JSON.parse(r.texto);
}

function pedirNasaDias_(desde, hasta) {
  var url = "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&latitude=" +
    CLIMA.sitio.lat + "&longitude=" + CLIMA.sitio.lon + "&start=" + desde.replace(/-/g, "") + "&end=" + hasta.replace(/-/g, "") + "&format=JSON";
  var r = pedir_(url);
  if (r.codigo !== 200) throw new Error("NASA POWER (días): HTTP " + r.codigo + " " + r.texto.slice(0, 200));
  return JSON.parse(r.texto);
}

// ── LAS HOJAS ─────────────────────────────────────────────────────────────────────

var TZ_LIBRO = null;   // la zona horaria del libro, la de sus celdas de fecha (la fija libro_)

function libro_() {
  var ss = SpreadsheetApp.openById(CLIMA.libro);
  TZ_LIBRO = ss.getSpreadsheetTimeZone();
  return ss;
}
/** La zona del libro; la de Ecuador mientras no se haya abierto (las pruebas de las conversiones). */
function zonaLibro_() { return TZ_LIBRO || CLIMA.zona; }

/** 2026-10-27 · el libro del MCP está en «America/Los_Angeles» (medido al instalar). Una celda de fecha guarda una
 *  hora de PARED en la zona del libro: la medianoche de Ecuador escrita como instante se veía a las 21–22 h del día
 *  ANTERIOR. Por eso las fechas se escriben como el día de calendario en la zona del libro y «Actualizado» con la hora
 *  de Ecuador (fechaACelda_, actACelda_), y el libro puede estar en cualquier zona: sólo se dice. La del PROYECTO sí
 *  importa: es la del activador nocturno. */
function comprobarZona_(ss) {
  var z = ss.getSpreadsheetTimeZone();
  if (z !== CLIMA.zona) Logger.log("ℹ El libro está en la zona «" + z + "»: las fechas se escriben como el día de Ecuador y «Actualizado» con la hora de Ecuador.");
  if (Session.getScriptTimeZone() !== CLIMA.zona) Logger.log("⚠ El proyecto no está en " + CLIMA.zona + ": el activador nocturno no caerá hacia las 02:30 de Ecuador.");
}

function conCandado_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Otra pasada sigue en curso.");
  try { return fn(); } finally { lock.releaseLock(); }
}

/** La hoja, con su cabecera. Si no existe la crea y, si existe VACÍA, le pone la cabecera: un tiempo de espera de
 *  Google a mitad de crearla (27-10 21:32) la dejó así, y esta función se negaba a tocarla en TODAS las pasadas.
 *  Una hoja con contenido y otras columnas sigue sin tocarse. */
function hoja_(ss, nombre, cabecera) {
  var h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  if (h.getLastRow() === 0) {
    h.getRange(1, 1, 1, cabecera.length).setValues([cabecera]).setFontWeight("bold");
    h.setFrozenRows(1);
  }
  var actual = h.getRange(1, 1, 1, cabecera.length).getValues()[0];
  if (actual.join("|") !== cabecera.join("|")) throw new Error("La hoja «" + nombre + "» no tiene las columnas esperadas: no la toco.");
  return h;
}

function crudas_(h, n) {
  var ultima = h.getLastRow();
  return ultima < 2 ? [] : h.getRange(2, 1, ultima - 1, n).getValues();
}

function leerHoras_(ss) {
  var h = hoja_(ss, CLIMA.hojaHoras, COL_HORAS), c = crudas_(h, COL_HORAS.length);
  return { hoja: h, crudas: c, filas: c.map(deFila_(CAMPOS_HORAS)).filter(function (f) { return f.dia; }) };
}

function leerDias_(ss) {
  var h = hoja_(ss, CLIMA.hojaDias, COL_DIAS), c = crudas_(h, COL_DIAS.length);
  return { hoja: h, crudas: c, filas: c.map(deFila_(CAMPOS_DIAS)).filter(function (f) { return f.dia; }) };
}

function deFila_(campos) {
  return function (fila) {
    var o = {};
    campos.forEach(function (k, i) {
      var x = fila[i];
      if (k === "dia") o.dia = claveDeCelda_(x);
      else if (k === "act") o.act = x instanceof Date ? actDeCelda_(x) : null;
      else if (typeof x === "number") o[k] = x;
      else if (x === "" || x == null) o[k] = /^(fuente|fLluvia|fNube|wx|tipo)$/.test(k) ? "" : null;
      else o[k] = /^(fuente|fLluvia|fNube|wx|tipo)$/.test(k) ? String(x) : num_(Number(String(x).replace(",", ".")), 3);
    });
    return o;
  };
}

function aFilaHoras_(o) { return aFila_(CAMPOS_HORAS, o); }
function aFilaDias_(o) { return aFila_(CAMPOS_DIAS, o); }
function aFila_(campos, o) {
  return campos.map(function (k) {
    if (k === "dia") return fechaACelda_(o.dia);
    if (k === "act") return o.act ? actACelda_(o.act) : "";
    var x = o[k];
    return x == null ? "" : x;
  });
}

/** Escribe desde la primera fila que difiere hasta el final; si nada difiere, no toca la hoja. */
function escribir_(h, cabecera, viejas, nuevas) {
  var i = 0, n = cabecera.length;
  while (i < viejas.length && i < nuevas.length && filaIgual_(viejas[i], nuevas[i])) i++;
  if (i === viejas.length && i === nuevas.length) return 0;
  if (i < nuevas.length) {
    var r = h.getRange(i + 2, 1, nuevas.length - i, n);
    r.setValues(nuevas.slice(i));
    h.getRange(i + 2, 1, nuevas.length - i, 1).setNumberFormat("dd/mm/yyyy");
    h.getRange(i + 2, n, nuevas.length - i, 1).setNumberFormat("dd/mm/yyyy HH:mm");
  }
  if (viejas.length > nuevas.length) h.getRange(nuevas.length + 2, 1, viejas.length - nuevas.length, n).clearContent();
  return nuevas.length - i;
}

function filaIgual_(a, b) {
  for (var j = 0; j < b.length; j++) if (!mismoValor_(a[j], b[j])) return false;
  return true;
}

function mismoValor_(a, b) {
  var norm = function (x) { return x instanceof Date ? "D" + x.getTime() : x == null ? "" : String(x); };
  return norm(a) === norm(b);
}

// ── HUECOS (qué tiene que pedir la pasada nocturna) ─────────────────────────────────

/** El primer día de [desde, hasta] al que le falta alguna hora, o en alguna hora el grupo base, la lluvia, la
 *  nubosidad o la radiación (todo lo que NASA puede dar). null si no falta nada. */
function primerDiaConHueco_(filas, desde, hasta) {
  var porDia = {};
  filas.forEach(function (f) { if (f.dia >= desde && f.dia <= hasta) (porDia[f.dia] = porDia[f.dia] || []).push(f); });
  for (var d = desde; d <= hasta; d = sumarDias_(d, 1)) {
    var hs = porDia[d] || [];
    if (hs.length < 24 || hs.some(function (h) { return !h.fuente || h.lluvia == null || h.nube == null || h.rad == null; })) return d;
  }
  return null;
}

function primerDiaSinRadiacion_(filas, desde, hasta) {
  var con = {};
  filas.forEach(function (f) { if (f.rad != null) con[f.dia] = true; });
  for (var d = desde; d <= hasta; d = sumarDias_(d, 1)) if (!con[d]) return d;
  return null;
}

// ── AUXILIARES ────────────────────────────────────────────────────────────────────

function pad2_(n) { return (n < 10 ? "0" : "") + n; }

/** Instante (ms UTC) → día local «AAAA-MM-DD». Con el desfase fijo de Ecuador: no depende de la zona del script. */
function claveDia_(ms) {
  var d = new Date(ms + CLIMA.offsetH * 3600000);
  return d.getUTCFullYear() + "-" + pad2_(d.getUTCMonth() + 1) + "-" + pad2_(d.getUTCDate());
}
function horaLocal_(ms) { return new Date(ms + CLIMA.offsetH * 3600000).getUTCHours(); }
function msDeClave_(clave, hora) {
  var p = clave.split("-");
  return Date.UTC(+p[0], +p[1] - 1, +p[2], (hora || 0) - CLIMA.offsetH);
}
function sumarDias_(clave, n) { return claveDia_(msDeClave_(clave, 12) + n * 86400000); }
function maxClave_(a, b) { return a > b ? a : b; }

/** «AAAA-MM-DD» → la celda de «Fecha»: la medianoche de ESE día en la zona del libro, para que el libro (y su CSV, que
 *  lee el MCP) enseñe el día de Ecuador sea cual sea su zona. Su inversa es claveDeCelda_. */
function fechaACelda_(clave) { return Utilities.parseDate(clave, zonaLibro_(), "yyyy-MM-dd"); }
/** El instante de «Actualizado» → su celda: la hora de pared de Ecuador en la zona del libro; actDeCelda_, la inversa
 *  (si no lo fuera, cada pasada lo correría y reescribiría filas que no cambiaron). */
var FMT_ACT = "yyyy-MM-dd HH:mm:ss";
function actACelda_(d) { return Utilities.parseDate(Utilities.formatDate(d, CLIMA.zona, FMT_ACT), zonaLibro_(), FMT_ACT); }
function actDeCelda_(d) { return Utilities.parseDate(Utilities.formatDate(d, zonaLibro_(), FMT_ACT), CLIMA.zona, FMT_ACT); }

/** Celda de fecha → «AAAA-MM-DD»: un Date (lo normal), leído en la zona del libro, o un texto «dd/mm/aaaa» tecleado a
 *  mano. */
function claveDeCelda_(x) {
  if (x instanceof Date && !isNaN(x)) return Utilities.formatDate(x, zonaLibro_(), "yyyy-MM-dd");
  var m = String(x || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? m[3] + "-" + pad2_(+m[2]) + "-" + pad2_(+m[1]) : "";
}

function pasoHoras_(ts, i) {
  if (i + 1 < ts.length) return Math.round((Date.parse(ts[i + 1].time) - Date.parse(ts[i].time)) / 3600000);
  return ts[i].data.next_1_hours ? 1 : 6;
}

function num_(x, dec) { return typeof x === "number" && isFinite(x) ? redondear_(x, dec) : null; }
function redondear_(x, dec) { if (x == null || !isFinite(x)) return null; var f = Math.pow(10, dec); return Math.round(x * f) / f; }
function media_(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
function maximo_(a, dec) { return a.length ? redondear_(Math.max.apply(null, a), dec == null ? 1 : dec) : null; }

/** Dirección dominante: la media VECTORIAL pesada por la velocidad (la media de 350° y 10° es 0°, no 180°). */
function direccionMedia_(pares) {
  var x = 0, y = 0, n = 0;
  pares.forEach(function (p) {
    if (p[0] == null || p[1] == null) return;
    var w = p[0] || 0, a = p[1] * Math.PI / 180;
    x += w * Math.sin(a); y += w * Math.cos(a); n++;
  });
  if (!n || (x === 0 && y === 0)) return null;
  return Math.round((Math.atan2(x, y) * 180 / Math.PI + 360) % 360);
}

/** Humedad relativa (%) desde la temperatura y el punto de rocío (Magnus). */
function humedad_(t, td) {
  var f = function (x) { return Math.exp(17.625 * x / (243.04 + x)); };
  return Math.min(100, 100 * f(td) / f(t));
}

/** Cobertura del METAR → %: el centro de cada rango de octas (FEW 1–2, SCT 3–4, BKN 5–7, OVC 8); la del cielo,
 *  la de la capa más cubierta. Despejado (CLR, SKC, NSC, NCD, CAVOK) = 0. Sin dato de nubes → null. */
function nubosidadMetar_(m) {
  var PCT = { SKC: 0, CLR: 0, NSC: 0, NCD: 0, CAVOK: 0, FEW: 19, SCT: 44, BKN: 75, OVC: 100, OVX: 100, VV: 100 };
  var capas = (m.clouds || []).map(function (c) { return PCT[c.cover]; }).filter(function (x) { return x != null; });
  if (capas.length) return Math.max.apply(null, capas);
  return m.cover != null && PCT[m.cover] != null ? PCT[m.cover] : null;
}

/** El tiempo presente del METAR en palabras: «-RA» → «lluvia débil», «VCSH» → «chubascos en las cercanías». */
function traducirWx_(s) {
  if (!s) return "";
  var FEN = { RA: "lluvia", DZ: "llovizna", SN: "nieve", GR: "granizo", GS: "granizo menudo", BR: "neblina", FG: "niebla",
    HZ: "calima", FU: "humo", DU: "polvo", SA: "arena", SQ: "turbonada", PL: "hielo granulado", UP: "precipitación" };
  var DESC = { MI: "baja", BC: "en bancos", PR: "parcial", FZ: "engelante", DR: "arrastrada", BL: "levantada" };
  return String(s).trim().split(/\s+/).map(function (g) {
    var m = g.match(/^([+-]?)(VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?([A-Z]*)$/);
    if (!m) return g;
    var fen = (m[4].match(/../g) || []).map(function (c) { return FEN[c] || c; }).join(" y ");
    var t = m[3] === "SH" ? "chubasco" + (fen ? " de " + fen : "s")
      : m[3] === "TS" ? "tormenta" + (fen ? " con " + fen : "")
      : (fen || "") + (m[3] && DESC[m[3]] ? " " + DESC[m[3]] : "");
    if (m[1] === "-") t += " débil"; else if (m[1] === "+") t += " fuerte";
    if (m[2]) t += " en las cercanías";
    return t.trim();
  }).join(", ");
}
