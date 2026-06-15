/* ══════════════════════════════════════════
   CONVENCIÓN DE NOMBRES
   ──────────────────────────────────────────
   • Identificadores (variables, funciones, constantes): en INGLÉS o
     híbrido conciso (ej. `_persistStdLote`, `loadAlgHist`, `pushHist`).
     Esto se mantiene por compatibilidad con todas las referencias
     existentes en el código y en los onclick/oninput del HTML — no
     se renombran identificadores para evitar romper la funcionalidad.
   • Comentarios y strings visibles al usuario: en ESPAÑOL.
   • Prefijos de localStorage: "larv4_" + sufijo descriptivo en inglés.
   • Helpers cuyo nombre empieza con "_" son internos y no parte de la
     API pública del módulo (uso restringido al archivo).
══════════════════════════════════════════ */

/* ══════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════ */
const MODS    = 10, TQS = 12;   // tanques 13–20 retirados (nadie los usaba) — decisión del usuario 2026-06-12
const CIO_MOD = 0;   // Módulo CIO
const LAB_MOD = 11;  // Módulo Lab. Algas
const MAD_MOD = 12;  // Módulo Maduración (Salas / Tanques / Lotes)
const AST_MOD = 13;  // Módulo As Técnico
const MIC_MOD = 14;  // Módulo Microbiología
const BIO_MOD = 15;  // Módulo Biomol
// Evidencias por QR (Fase 1): carpeta raíz de Drive + token del portal. El
// token se interpola al código GAS (GAS()) para que SIEMPRE coincidan sin
// configuración manual. Cambiar ambos = re-desplegar el GAS.
const EV_FOLDER_ID = "1cwUeTxbsP3T4y8BwRVlHPaCh39KbIWWa";
const EV_TOKEN     = "evd_8f3kq2m9wzx7";
// URL del Web App (GAS) ANCLADA en código. Es la URL ESTABLE del despliegue
// (no cambia al "Implementar nueva versión"). Se usa por defecto cuando el
// usuario no guardó una propia en ⚙ Config; sigue siendo sobrescribible ahí.
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxIxH6v5KMm7QQSfDGv_99auokSuAAmt4r5K_3JObsoCq-AHi0bT53eyTZkFoQ616wm/exec";
const PRE  = "larv4_";
const RPRE = "larv4_rec_";
const RTTL = 60 * 60 * 1000;         // 1 h
const FPRE = "larv4_foto_";
const FTTL = 24 * 60 * 60 * 1000;    // 24 h
const FMAX = 8;
const TTL  = 24 * 60 * 60 * 1000;
// Historial Lab. Algas (cola de hasta 10 registros antes de sincronizar)
const ALGHIST_PRE  = "larv4_alghist_";
const ALGHIST_MAX  = 10;
// Bitácora Lab. Algas — registros ya sincronizados a Google Sheets,
// retenidos localmente por 72 h para edición/consulta rápida.
const ALGLOG_KEY    = "larv4_alglog";
const ALGLOG_TTL_MS = 72 * 60 * 60 * 1000;
const ALGLOG_MAX    = 500;
// Cantidad Sembrada (población inicial por tanque, persistida por módulo,
// solo local — no se envía a Sheets; usada para autocalcular % supervivencia)
const CS_PRE = "larv4_cs_";
// Toneladas por tanque (Despacho), persistida por módulo, solo local — no se
// envía a Sheets; usada para autocalcular la Densidad cosechada por tanque.
const TON_PRE = "larv4_ton_";
const PTIMES = ["02:00","04:00","06:00","08:00","10:00","12:00",
                "14:00","16:00","18:00","20:00","22:00","00:00"];

// Fichas for standard modules (M01–M10, CIO)
const FICHAS = ["calidad","plg","params","poblacion","calagua","despacho"];
// All valid ficha IDs across all modules
const ALL_FICHAS = [...FICHAS, "algas", "desinfeccion"];
// Fichas del módulo estándar (M01–M10 + CIO) que cuentan para dots / estado /
// sync: las 6 de "Datos Larvicultura" + Desinfección (que tiene hoja propia).
// "desinfeccion" NO se añade a FICHAS para no mezclarla en el payload de Datos.
const STD_FICHAS_ALL = [...FICHAS, "desinfeccion"];

// Opciones del campo "Destino" en la ficha de Despacho
const DESTINO_OPTS = [
  "Pto.Inca 1","Pto.Inca 2","Pto.Inca 3","Pto.Inca 4",
  "Taura","Puná 1","Puná 2","Puná 3","Cachugrán","Chongón"
];

// Module PINs
const PINS = {
  0:"2025",   // CIO
  1:"1111",2:"2222",3:"3333",4:"4444",5:"5555",
  6:"6666",7:"7777",8:"8888",9:"9999",10:"1010",
  11:"2026", // Lab. Algas
  12:"2027", // Maduración
  13:"2020", // As Técnico
  14:"2121", // Microbiología
  15:"2023"  // Biomol
};

// ── Maduración: constantes globales ──
const MAD_PRE       = "larv4_mad_";
const MAD_FICHAS    = ["salas","tanques","lotes"];
const MAD_SALA_OPTS = ["Sala 1","Sala 2","Sala 3","Sala 4","Sala 4A","Sala 4B","Sala 5"];
const MAD_TANQUES_POR_SALA = {
  "Sala 1":  Array.from({length:15},(_,i)=>i+1),
  "Sala 2":  Array.from({length:6},(_,i)=>i+16),
  "Sala 3":  Array.from({length:6},(_,i)=>i+22),
  "Sala 4":  Array.from({length:6},(_,i)=>i+1),
  "Sala 4A": Array.from({length:4},(_,i)=>i+1),
  "Sala 4B": Array.from({length:4},(_,i)=>i+5),
  "Sala 5":  Array.from({length:5},(_,i)=>i+7)
};
const MAD_SHEET     = {
  salas:   "Maduración Sala",
  tanques: "Maduración Tanques",
  lotes:   "Maduración Lotes"
};

// ── Biomol: constantes globales ──
// Muestras locales de Biomol (grilla del día). Cada fila expira a las BIO_TTL
// ms (48 h) y se purga automáticamente vía pruneBio() al leer o al iniciar.
const BIO_REC_KEY   = "larv4_biomol_records";
const BIO_MAX       = 40;            // (legacy) ya no limita la grilla
const BIO_TTL       = 48 * 60 * 60 * 1000;
const BIO_SHEET     = "BIOMOL";
// Recuperación de la grilla Biomol (autoguardado de lo NO guardado). TTL 1 h.
const BIO_RECOV_KEY = RPRE + "biomolgrid";   // "larv4_rec_biomolgrid"
const BIO_ESTADIO_OPTS = [
  "Reproductores",
  "N5","Z1","Z2","Z3","M1","M2","M3",
  "PL1","PL2","PL3","PL4","PL5","PL6","PL7","PL8","PL9","PL10",
  "PL11","PL12","PL13","PL14","PL15","PL16","PL17"
];
const BIO_SEX_OPTS = ["Macho","Hembra"];
const BIO_RES_OPTS = ["Positivo","Negativo"];

// ── As Técnico (AsT): constantes globales ──
// Misma política que Biomol: hasta AST_MAX registros locales, expira en AST_TTL.
const AST_REC_KEY   = "larv4_ast_records";
const AST_RECOV_KEY = RPRE + "astform";   // recuperación del formulario en curso (espejo de Biomol; TTL 1h = RTTL)
const AST_MAX       = 40;
const AST_TTL       = 48 * 60 * 60 * 1000;
const AST_SHEET     = "Registro_Supervisión";
const AST_SUPERVISOR_OPTS = ["Supervisor 1","Supervisor 2","Supervisor 3"];
const AST_MODULO_OPTS     = [...Array.from({length:10},(_,i)=>"Módulo "+(i+1)),"CIO"];
const AST_SIEMBRA_OPTS    = ["Primera","Segunda","Tercera"];
const AST_ESTADIO_OPTS    = [
  "N5","Z1","Z2","Z3","M1","M2","M3",
  "PL1","PL2","PL3","PL4","PL5","PL6","PL7","PL8",
  "PL9","PL10","PL11","PL12","PL13","PL14","PL15","PL16"
];
// Estadios que disparan Tipo_revisión = "Completa"; el resto = "Rápida".
const AST_COMPLETA_STAGES = ["N5","Z1","Z2","Z3","M1","M2","M3"];
const AST_INTESTINO_OPTS  = ["Bueno","Regular","Malo"];
const AST_ACTIVIDAD_OPTS  = ["Alta","Media","Baja"];
const AST_CONDICION_OPTS  = ["Óptima","Alerta","Crítica"];
const AST_OBS_OPTS = [
  "Larvas de estadío previo","Intestino vacío elevado","Mudas abundantes",
  "No viables elevados","Deformidades relevantes","Baja actividad","Canibalismo"
];
const AST_ACCION_OPTS = [
  "Continuar","Vigilar","Ajustar manejo","Revisar alimentación",
  "Revisar agua","Descartar"
];
// Variables nuevas de AsT (selects) — columnas Hernia/Opacidad/Asimilación.
const AST_OPACIDAD_OPTS    = ["Leve","Acentuada"];
const AST_HERNIA_OPTS      = ["Leve","Acentuada"];   // grado de hernia (≠ "% Hernia" numérico)
const AST_ASIMILACION_OPTS = ["Alta","Media","Baja"];

// ── Validates that m is a legal module identifier ──
function isValidMod(m){ return window.__rgLib.isValidMod(m); }
// ── True para el módulo Microbiología (Fase 1: Bacteriología) ──
function isMicMod(m){ return window.__rgLib.isMicMod(m); }
// ── True for el módulo Biomol (diagnóstico molecular) ──
function isBioMod(m){ return window.__rgLib.isBioMod(m); }
// ── True para módulos de Larvicultura estándar (M01-M10 + CIO) ──
function isStdMod(m){ return window.__rgLib.isStdMod(m); }
// ── True for el módulo As Técnico (supervisión técnica) ──
function isAstMod(m){ return window.__rgLib.isAstMod(m); }

// ── Helpers para iteración por tanques ──
// Concentran el patrón `Array.from({length:TQS}, (_,i) => fn(i))` repetido
// en múltiples renderizados. tqMap devuelve el array; tqHtml devuelve la
// concatenación de strings ya hecha. Son aditivos: el resto del código que
// usa el patrón original sigue funcionando sin cambios.
const tqMap  = (fn) => Array.from({length:TQS}, (_, i) => fn(i));
const tqHtml = (fn) => tqMap(fn).join("");

// ── Transforma el contenido del input a MAYÚSCULAS conservando el caret ──
// Se usa en los campos de Estadío de las 4 fichas (calidad, plg, params,
// poblacion). Mantiene la posición del cursor para que escribir en medio
// del texto siga siendo natural.
function upInp(el){
  if(!el) return;
  const s = el.selectionStart, e = el.selectionEnd;
  const up = el.value.toUpperCase();
  if(up !== el.value){
    el.value = up;
    try{ el.setSelectionRange(s, e); }catch(_){}
  }
}
// Helper específico para emitir un value uppercase desde el modelo de datos.
// Refleja `vl()` pero forzando mayúsculas antes de escapar.
const vlU = (d, k) => {
  const v = d[k];
  return (v !== undefined && v !== null && v !== "") ? escapeHtml(String(v).toUpperCase()) : "";
};
const evU = (d, k, def="") => {
  const v = d[k] !== undefined && d[k] !== "" ? d[k] : def;
  return escapeHtml(String(v).toUpperCase());
};

// ── Accesibilidad: asocia labels con inputs por `for`/`id` ──
// Las plantillas HTML actuales emiten <div class="mf"><label>X</label>
// <input ...></div> donde el label es un HERMANO del input, no su padre.
// Esto no constituye una asociación implícita: los lectores de pantalla
// no leen "X" cuando el usuario enfoca el input.  fixupLabels recorre los
// contenedores .mf/.ff/.cf y, cuando encuentra ese patrón, genera un id
// determinista (panel + name) y asigna htmlFor=ese id al label.  No
// regenera HTML ni toca atributos `name` (que son la clave usada por la
// sincronización).  Se llama después de cada render sin riesgo para el
// flujo de guardado/sync.
// WeakMap: panel → referencia al firstElementChild ya procesado. Tras
// cualquier `fp.innerHTML = "..."` la identidad del firstElementChild
// cambia (es un nodo nuevo), por lo que la comparación por identidad
// detecta el re-render y reprocesa. Es más correcto que `data-labels-fixed`
// porque innerHTML NO limpia atributos del propio panel.
const _labelsFixedMarker = (typeof WeakMap === "function") ? new WeakMap() : null;
function fixupLabels(root){
  const r = root || document.getElementById("rgApp");
  if(!r) return;
  // Short-circuit: misma identidad de firstElementChild = mismo DOM ya
  // procesado. Evita reejecutar querySelectorAll cuando un caller llama
  // fixupLabels redundantemente sobre un panel intacto.
  const firstChild = r.firstElementChild;
  if(_labelsFixedMarker && firstChild && _labelsFixedMarker.get(r) === firstChild) return;
  r.querySelectorAll(".mf, .ff, .cf").forEach(div=>{
    const label = div.querySelector(":scope > label");
    const input = div.querySelector(":scope > input, :scope > select, :scope > textarea");
    if(!label || !input) return;
    if(label.htmlFor && input.id) return;       // ya enlazados explícitamente
    if(!input.id){
      // ID determinista: panel + name. Si el name se repite entre paneles
      // (p.ej. "fecha"), el prefijo de panel asegura unicidad global.
      const panel    = input.closest(".fp, .modal");
      const panelKey = panel ? (panel.id || "x") : "g";
      const baseName = input.name || "anon";
      input.id = "fld_" + panelKey + "_" + baseName;
    }
    label.htmlFor = input.id;
  });
  if(_labelsFixedMarker && firstChild) _labelsFixedMarker.set(r, firstChild);
}

// ── True when module is Lab. Algas ──
function isLabMod(m){ return window.__rgLib.isLabMod(m); }
// ── True when module is Maduración ──
function isMadMod(m){ return window.__rgLib.isMadMod(m); }

/* ══════════════════════════════════════════
   HERENCIA PEREZOSA ENTRE FICHAS
   ──────────────────────────────────────────
   Cuando una ficha se renderiza y un campo compartido (corrida,
   técnico, estadío, lote) está vacío en sus propios datos, se busca
   en las demás fichas del MISMO módulo y DÍA. El primer valor no
   vacío encontrado se usa como sugerencia en el input. Al guardar,
   sólo se persiste el valor propio — las demás fichas NO se tocan
   (no se reactiva synced=false ajeno).
   Sólo aplica a módulos estándar M01–M10 + CIO.
══════════════════════════════════════════ */
const ESTADIO_FICHAS = ["calidad","plg","poblacion","calagua","despacho"];
const LOTE_FICHAS    = ["poblacion","plg"];

function _inheritShared(m, fieldName, exceptFicha){
  if(!isValidMod(m) || isLabMod(m) || isMadMod(m) || isBioMod(m) || isAstMod(m)) return "";
  for(let fi=0; fi<FICHAS.length; fi++){
    const f = FICHAS[fi];
    if(f === exceptFicha) continue;
    const e = loadE(m, f);
    if(e && e.data){
      const v = e.data[fieldName];
      if(v !== undefined && v !== null && v !== "" && String(v).trim() !== "") return String(v);
    }
  }
  return "";
}

function _inheritPerTank(m, prefix, tankIdx, exceptFicha, scope){
  if(!isValidMod(m) || isLabMod(m) || isMadMod(m) || isBioMod(m) || isAstMod(m)) return "";
  const key = prefix + "_" + tankIdx;
  for(let fi=0; fi<scope.length; fi++){
    const f = scope[fi];
    if(f === exceptFicha) continue;
    const e = loadE(m, f);
    if(e && e.data){
      const v = e.data[key];
      if(v !== undefined && v !== null && v !== "" && String(v).trim() !== "") return String(v);
    }
  }
  return "";
}

/* ══════════════════════════════════════════
   CUSTOM TANK NAMES (TQ 13–20 editable)
   Stored per module in localStorage
══════════════════════════════════════════ */
const TQNAME_PRE = "larv4_tqname_";
function tqNameKey(m){ return TQNAME_PRE + mLabel(m); }

function loadTqNames(m){
  try{
    const raw = localStorage.getItem(tqNameKey(m));
    if(raw) return JSON.parse(raw);
  }catch(x){}
  return {};
}
function saveTqNames(m, names){
  try{ localStorage.setItem(tqNameKey(m), JSON.stringify(names)); }catch(x){}
}
// Save a single tank name change
function onTqNameChange(i, el){
  if(i < 12) return;
  const val = sanitizeStr(el.value).trim();
  const names = loadTqNames(curMod);
  if(val && val !== "TQ " + (i+1)){
    names[i] = val;
  } else {
    delete names[i];
  }
  saveTqNames(curMod, names);
}
// Generate tank cell HTML — pass pre-loaded names map for perf
function tqCell(m, i, namesCache){
  if(i < 12) return String(i+1);
  const custom = namesCache[i] || ("TQ " + (i+1));
  return `<input type="text" value="${escapeHtml(custom)}"
    onchange="onTqNameChange(${i},this)" class="tqc-edit"
    title="Editar nombre del tanque">`;
}

let curMod = null, curTab = "calidad";
// ID del registro del Historial Lab. Algas que el usuario está editando.
// Cuando es un string, "Agregar al historial" ACTUALIZA esa entrada en lugar
// de crear una nueva. Se limpia al actualizar, cancelar o cambiar de módulo.
let _algEditingId = null;
// Estado de edición y filtros de cada vista del módulo Maduración.
let _madEditing = { ficha:null, id:null };
const _madFilters = { salas:{}, tanques:{}, lotes:{} };
// Blanco: sandbox para editar registros históricos sin pisar fichas del día.
let _blancoState = null; // { ficha, histId, data }
// Grillas Tanques/Lotes (Maduración): sala seleccionada por ficha. Persiste en
// la sesión al cambiar de pestaña/módulo (se reinicia solo al recargar).
let _madTanquesSala = "";
let _madLotesSala   = "";
// Memoria del último Lote usado por (sala|tanque), 70 días — sólo Tanques.
// Vive bajo MAD_PRE, así que cleanup() la conserva (sin TTL automático); la
// purga de 70 d la hace loadMadLoteMem() al leerla.
const MADLOTE_KEY = MAD_PRE + "lotemem";
const MADLOTE_TTL = 70*24*60*60*1000;
const MAD_RECOV_KEY = RPRE + "madgrid";   // recuperación de la grilla en curso (espejo de Biomol; TTL RTTL=1h)
function loadMadLoteMem(){
  let obj = {};
  try{ const raw = localStorage.getItem(MADLOTE_KEY); if(raw){ const p = JSON.parse(raw); if(p && typeof p === "object") obj = p; } }catch(_){}
  const now = Date.now(); let changed = false;
  Object.keys(obj).forEach(k => { const e = obj[k]; if(!e || !e.ts || (now - e.ts) > MADLOTE_TTL){ delete obj[k]; changed = true; } });
  if(changed){ try{ localStorage.setItem(MADLOTE_KEY, JSON.stringify(obj)); }catch(_){} }
  return obj;
}
function getMadLote(sala, tank){
  const e = loadMadLoteMem()[sala+"|"+tank];
  return e && e.lote ? e.lote : "";
}
function setMadLote(sala, tank, lote){
  const mem = loadMadLoteMem();
  const key = sala+"|"+tank;
  const v = (lote==null) ? "" : String(lote).trim();
  if(v){ mem[key] = { lote: v, ts: Date.now() }; } else { delete mem[key]; }
  try{ localStorage.setItem(MADLOTE_KEY, JSON.stringify(mem)); }catch(_){}
}

/* ── Memoria de Lote por módulo+tanque (25 d) para fichas estándar ──────────
   "Congela" el Lote de cada tanque y lo prellena en Población y PLG externo
   aunque cambie el día o la corrida; el campo sigue siendo editable y, al
   guardar la ficha, el valor recordado se actualiza (o se borra si se vació).
   Es compartida entre Población y PLG: clave = mLabel(módulo)+"|"+índice de
   tanque. Misma mecánica que la memoria de Maduración (sala+tanque).
   Vive bajo PRE ("larv4_"), así que cleanup() la conserva; la purga de 25 d
   la hace loadStdLoteMem() al leerla. */
const STDLOTE_KEY = PRE + "lotemem";          // "larv4_lotemem"
const STDLOTE_TTL = 25*24*60*60*1000;
function loadStdLoteMem(){
  let obj = {};
  try{ const raw = localStorage.getItem(STDLOTE_KEY); if(raw){ const p = JSON.parse(raw); if(p && typeof p === "object") obj = p; } }catch(_){}
  const now = Date.now(); let changed = false;
  Object.keys(obj).forEach(k => { const e = obj[k]; if(!e || !e.ts || (now - e.ts) > STDLOTE_TTL){ delete obj[k]; changed = true; } });
  if(changed){ try{ localStorage.setItem(STDLOTE_KEY, JSON.stringify(obj)); }catch(_){} }
  return obj;
}
function getStdLote(mod, tank){
  const e = loadStdLoteMem()[mLabel(mod)+"|"+tank];
  return e && e.lote ? e.lote : "";
}
// Persiste (en bloque) los lotes de una ficha estándar a la memoria de 25 d.
// Sólo aplica a Población y PLG. Valor no vacío → recuerda y refresca el TTL;
// vacío → olvida ese tanque (permite "descongelar" borrando y guardando).
function _persistStdLote(fid, data){
  if((fid !== "poblacion" && fid !== "plg") || !data || !isValidMod(curMod)) return;
  const mem = loadStdLoteMem();
  const now = Date.now();
  let changed = false;
  for(let i=0;i<TQS;i++){
    const key = mLabel(curMod)+"|"+i;
    const raw = data["lt_"+i];
    const v   = (raw==null) ? "" : String(raw).trim();
    if(v){ mem[key] = { lote: v, ts: now }; changed = true; }
    else if(mem[key]){ delete mem[key]; changed = true; }
  }
  if(changed){ try{ localStorage.setItem(STDLOTE_KEY, JSON.stringify(mem)); }catch(_){} }
}

/* ── Memoria de Corrida por módulo (25 d) para fichas estándar ──────────────
   "Congela" el número de Corrida a nivel MÓDULO: se escribe una vez y se
   prellena en TODAS las fichas estándar (Calidad/PLG/Parámetros/Población/
   Calidad de Agua/Despacho/Desinfección) aunque cambie el día, durante 25 días.
   El campo sigue siendo editable; al guardar una ficha con corrida no vacía se
   refresca/sobrescribe (una nueva corrida reemplaza a la anterior en todas las
   fichas). Guardar con corrida vacía NO la descongela (la congelación persiste
   hasta el TTL o hasta que se escriba otra). Solo va al Google Sheet la ficha
   que el usuario sincroniza; esta memoria es 100% local.
   Vive bajo PRE ("larv4_"), así que cleanup() la conserva (está en SKIP_EXACT);
   la purga de 25 d la hace loadStdCorrMem() al leerla. */
const STDCORR_KEY = PRE + "corrmem";          // "larv4_corrmem"
const STDCORR_TTL = 25*24*60*60*1000;
function loadStdCorrMem(){
  let obj = {};
  try{ const raw = localStorage.getItem(STDCORR_KEY); if(raw){ const p = JSON.parse(raw); if(p && typeof p === "object") obj = p; } }catch(_){}
  const now = Date.now(); let changed = false;
  Object.keys(obj).forEach(k => { const e = obj[k]; if(!e || !e.ts || (now - e.ts) > STDCORR_TTL){ delete obj[k]; changed = true; } });
  if(changed){ try{ localStorage.setItem(STDCORR_KEY, JSON.stringify(obj)); }catch(_){} }
  return obj;
}
function getCorr(mod){
  if(!isValidMod(mod) || isLabMod(mod) || isMadMod(mod) || isBioMod(mod) || isAstMod(mod) || isMicMod(mod)) return "";
  const e = loadStdCorrMem()[mLabel(mod)];
  return e && e.corrida ? e.corrida : "";
}
// Persiste la corrida de una ficha estándar a la memoria de 25 d (a nivel
// módulo). Valor no vacío → recuerda/refresca; vacío → NO borra (se conserva la
// congelación). Se invoca al guardar cualquier ficha estándar (localSave/Sync).
function _persistStdCorr(data){
  if(!data || !isValidMod(curMod) || isLabMod(curMod) || isMadMod(curMod) ||
     isBioMod(curMod) || isAstMod(curMod) || isMicMod(curMod)) return;
  const v = (data.corrida == null) ? "" : String(data.corrida).trim();
  if(!v) return;
  const mem = loadStdCorrMem();
  mem[mLabel(curMod)] = { corrida: v, ts: Date.now() };
  try{ localStorage.setItem(STDCORR_KEY, JSON.stringify(mem)); }catch(_){}
}

/* ══════════════════════════════════════════
   UTILS
══════════════════════════════════════════ */
function today(){
  const n = new Date();
  return n.getFullYear() + '-' + pad(n.getMonth()+1) + '-' + pad(n.getDate());
}
function nowT(){
  const n = new Date();
  return pad(n.getHours()) + ":" + pad(n.getMinutes());
}
function pad(n){ return window.__rgLib.pad(n); }
function mLabel(m){ return window.__rgLib.mLabel(m); }

/* ══════════════════════════════════════════
   SECURITY UTILITIES
   Ref: SKILL.md — XSS, Input Validation,
   Output Encoding, Safe Defaults
══════════════════════════════════════════ */

// ── Output encoding: escape HTML entities to prevent XSS ──
// Use on ALL user-controlled values inserted into innerHTML
function escapeHtml(s){ return window.__rgLib.escapeHtml(s); }

// ── Input sanitization: strip formula-injection chars and limit length ──
// Prevents =IMPORTRANGE(), +cmd|, etc. from reaching Google Sheets
// Also limits to 200 chars to prevent payload bloat
function sanitizeStr(s){ return window.__rgLib.sanitizeStr(s); }

// ── Numeric sanitization: parse, validate range, reject NaN/Infinity ──
function sanitizeNum(v, min=-1e9, max=1e9){ return window.__rgLib.sanitizeNum(v, min, max); }

// ── Validate date string format YYYY-MM-DD ──
function isValidDate(s){ return window.__rgLib.isValidDate(s); }

// ── Validate GAS URL — must be HTTPS on script.google.com ──
function isValidGasUrl(url){ return window.__rgLib.isValidGasUrl(url); }

// ── Rate limiter: max 15 sync attempts per 60 seconds ──
// (suficiente para flujos CRUD de Maduración con sync individual por registro;
//  por debajo del límite de servidor GAS de 30/min)
const _rl={count:0,reset:0};
function syncRateOk(){
  const now=Date.now();
  if(now>_rl.reset){_rl.count=0;_rl.reset=now+60000;}
  if(_rl.count>=15){ toast("Demasiados intentos. Espera 1 minuto.","warn"); return false; }
  _rl.count++;
  return true;
}

// ── Helper de trazado de errores silenciados ──
// Muchos try/catch del código son intencionalmente silenciosos (lectura
// best-effort de localStorage, animaciones, etc.). Para que esa decisión
// sea diagnosticable sin contaminar la consola en producción, esta función
// emite console.debug SOLO cuando el flag global window._larvDebug está
// activo. Activarlo en consola: window._larvDebug = true.
function _silent(label, err){
  if(window._larvDebug && err){
    try{ console.debug("[larv:"+label+"]", err); }catch(_){}
  }
}

// ── Helper de escritura a localStorage con manejo coherente de cuota ──
// Cuando el navegador rechaza un setItem por falta de espacio
// (QuotaExceededError), se ejecuta una cascada de purga ordenada del
// menor al mayor valor del dato a sacrificar:
//   1) foto/video más antigua (FPRE — dataURLs pueden pesar MB),
//   2) snapshot de auto-guardado más antiguo (RPRE — TTL 1h, redundante),
//   3) historial Lab. Algas de días anteriores (ALGHIST_PRE — TTL 24h),
//   4) entradas del Historial general fuera de TTL/MAX (HIST_PRE — 60d/200).
// Tras cada paso se reintenta el setItem; se detiene en cuanto el reintento
// tiene éxito. Si nada libera espacio suficiente, se notifica al usuario.
function safeSetItem(key, value, opts){
  const o = opts || {};
  try{
    localStorage.setItem(key, value);
    return true;
  }catch(err){
    if(o.purgeOnFail !== false){
      const strategies = [
        _purgeOldestFoto,         // 1) foto/video antigua
        _purgeOldestRecovery,     // 2) snapshot de auto-guardado vencido
        _purgeExpiredAlgHistDays, // 3) historial Lab. Algas de días previos
        _purgeExpiredHistEntries  // 4) Historial general fuera de TTL/MAX
      ];
      let freedNote = null;
      for(let s = 0; s < strategies.length; s++){
        let note = null;
        try{ note = strategies[s](); }catch(_){ note = null; }
        if(!note) continue;
        try{
          localStorage.setItem(key, value);
          freedNote = note;
          break;
        }catch(_){ /* el espacio liberado no alcanzó; siguiente estrategia */ }
      }
      if(freedNote){
        if(o.silent !== true){
          toast("Se liberó espacio: " + freedNote, "warn", 3500);
        }
        return true;
      }
    }
    if(o.silent !== true){
      toast(o.errorMsg || "Espacio de almacenamiento insuficiente","err",4000);
    }
    return false;
  }
}

// ── Helpers internos de purga (uso exclusivo desde safeSetItem) ────────
// Cada uno opera sobre un namespace concreto, elige el/los ítem(s) menos
// valioso(s) y devuelve un texto descriptivo (o null si no había nada que
// purgar). Diseñados para ser idempotentes y seguros: nunca tocan datos
// sin sincronizar de fichas activas.
function _purgeOldestFoto(){
  let oldestKey = null, oldestTs = Infinity;
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if(!k || !k.startsWith(FPRE)) continue;
    try{
      const e = JSON.parse(localStorage.getItem(k)||"{}");
      if(e && typeof e.ts === "number" && e.ts < oldestTs){
        oldestTs = e.ts; oldestKey = k;
      }
    }catch(_){}
  }
  if(!oldestKey) return null;
  localStorage.removeItem(oldestKey);
  return "una foto/video antigua";
}
function _purgeOldestRecovery(){
  let oldestKey = null, oldestTs = Infinity;
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if(!k || !k.startsWith(RPRE)) continue;
    try{
      const e = JSON.parse(localStorage.getItem(k)||"{}");
      if(e && typeof e.ts === "number" && e.ts < oldestTs){
        oldestTs = e.ts; oldestKey = k;
      }
    }catch(_){}
  }
  if(!oldestKey) return null;
  localStorage.removeItem(oldestKey);
  return "un snapshot de auto-guardado";
}
function _purgeExpiredAlgHistDays(){
  // Claves ALGHIST_PRE+YYYY-MM-DD: las anteriores al día actual ya están
  // fuera del TTL (24h) y no se sincronizarán; son seguras de eliminar.
  const todayStr = today();
  const toRemove = [];
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if(!k || !k.startsWith(ALGHIST_PRE)) continue;
    const dStr = k.slice(ALGHIST_PRE.length);
    if(/^\d{4}-\d{2}-\d{2}$/.test(dStr) && dStr < todayStr){
      toRemove.push(k);
    }
  }
  toRemove.forEach(k => localStorage.removeItem(k));
  return toRemove.length > 0
    ? (toRemove.length + " historial(es) Lab. Algas vencido(s)")
    : null;
}
function _purgeExpiredHistEntries(){
  // Recorre cada clave HIST_PRE+mod y reescribe la lista filtrada por TTL
  // (HIST_TTL = 60 d) y cap (HIST_MAX = 200). loadHist() ya filtra al leer,
  // pero no persiste el resultado; esta función realiza la limpieza efectiva.
  // Wrap en try porque HIST_PRE/HIST_TTL/HIST_MAX se declaran más adelante
  // en el archivo (defensa contra TDZ si la cascada se invocara muy pronto).
  let removed = 0;
  try{
    const PREFIX = HIST_PRE, TTL = HIST_TTL, MAX = HIST_MAX;
    const cutoff = Date.now() - TTL;
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(!k || !k.startsWith(PREFIX)) continue;
      try{
        const raw = localStorage.getItem(k);
        if(!raw) continue;
        const arr = JSON.parse(raw);
        if(!Array.isArray(arr)) continue;
        const filtered = arr.filter(h =>
          h && typeof h === "object" &&
          typeof h.ts === "number" && h.ts > cutoff
        );
        const trimmed = filtered.slice(0, MAX);
        if(trimmed.length !== arr.length){
          removed += (arr.length - trimmed.length);
          localStorage.setItem(k, JSON.stringify(trimmed));
        }
      }catch(_){}
    }
  }catch(_){ return null; }
  return removed > 0
    ? (removed + " entrada(s) del Historial fuera de TTL")
    : null;
}

// ── Session ID: identificador único por dispositivo persistido en
//    localStorage. Se envía al GAS como parámetro de query (?z=...) para
//    que el rate-limiter del servidor pueda diferenciar usuarios en lugar
//    de aplicar un único cubo global.
function getSessionId(){
  try{
    let sid = localStorage.getItem("larv4_sid");
    if(!sid || !/^[a-z0-9]{6,16}$/.test(sid)){
      sid = (Date.now().toString(36) + Math.random().toString(36).slice(2,8)).slice(0,12);
      localStorage.setItem("larv4_sid", sid);
    }
    return sid;
  }catch(_){
    // Fallback en sesión privada o sin localStorage — no persiste, pero
    // mantiene la separación dentro de la misma carga de página.
    if(!window._larvSidFallback){
      window._larvSidFallback = "anon" + Math.random().toString(36).slice(2,8);
    }
    return window._larvSidFallback;
  }
}

// ── Obfuscation helpers para valores sensibles en localStorage ─────────
// XOR + base64 con clave fija. NO es cifrado real (el algoritmo y la clave
// son visibles en el código fuente). Objetivo: evitar que la URL del Web
// App y el token compartido aparezcan en CLARO en DevTools / extensiones
// que listan localStorage, ni en backups del navegador. Cualquiera con
// acceso al HTML puede revertirlo. Backward-compat: valores sin el prefijo
// `obf:` se devuelven tal cual (lectura de instalaciones previas).
const _OBF_KEY    = "larv4_obf_v1";
const _OBF_PREFIX = "obf:";
function _obfuscate(s){
  if(s == null || s === "") return "";
  const str = String(s);
  let xored = "";
  for(let i=0;i<str.length;i++){
    xored += String.fromCharCode(str.charCodeAt(i) ^ _OBF_KEY.charCodeAt(i % _OBF_KEY.length));
  }
  try{
    // UTF-8 → base64 SIN escape()/unescape() (deprecados). TextEncoder produce
    // exactamente los mismos bytes que unescape(encodeURIComponent(xored)), por
    // lo que es compatible byte-a-byte con valores ya guardados (no rompe la URL
    // ni el token ofuscados de instalaciones previas).
    const utf8 = new TextEncoder().encode(xored);
    let bin = "";
    for(let i=0;i<utf8.length;i++) bin += String.fromCharCode(utf8[i]);
    return _OBF_PREFIX + btoa(bin);
  }catch(_){ return str; }
}
function _deobfuscate(s){
  if(!s) return "";
  if(typeof s !== "string" || !s.startsWith(_OBF_PREFIX)) return s; // legacy / plano
  try{
    // base64 → UTF-8 sin escape()/unescape(). Inverso exacto de _obfuscate:
    // decodeURIComponent(escape(...)) equivale a TextDecoder sobre los bytes.
    const bin   = atob(s.slice(_OBF_PREFIX.length));
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    const raw = new TextDecoder().decode(bytes);
    let out = "";
    for(let i=0;i<raw.length;i++){
      out += String.fromCharCode(raw.charCodeAt(i) ^ _OBF_KEY.charCodeAt(i % _OBF_KEY.length));
    }
    return out;
  }catch(_){ return ""; }
}
// Claves de configuración que se almacenan obfuscadas (URL del GAS y token
// compartido). Resto de claves (`tec`, etc.) sigue en texto plano.
const _LCFG_SENSITIVE = new Set(["gas-url", "gas-token"]);

// ── Validate ficha data before saving ──
function validateFicha(fid, data){
  if(data.fecha && !isValidDate(data.fecha)){
    toast("Fecha inválida en la ficha","warn"); return false;
  }
  // corrida is free-text (e.g. "552", "552-A") — sanitizeStr already guards injection
  // Just enforce max length enforced by sanitizeStr (200 chars)
  return true;
}

// Shorthand: escape a value from a data dict (used in render templates)
const ev=(d,k,def="")=>escapeHtml(d[k]!==undefined&&d[k]!==""?d[k]:def);
// Zero-safe value for input fields (0 is valid, "" and undefined are empty)
const vl=(d,k)=>{const v=d[k];return(v!==undefined&&v!==null&&v!=="")?escapeHtml(v):"";}
// Zero-safe value for payloads (preserves 0 as number)
const pv=(o,k)=>{const v=o[k];return(v!==undefined&&v!==null&&v!=="")?v:"";}
// Coalescencia que PRESERVA el 0: devuelve el primer valor "presente"
// (no undefined/null/"") de la lista. A diferencia de `a || b`, un 0
// numérico legítimo (p. ej. 0 % de supervivencia o población 0) NO se
// descarta a favor de la siguiente fuente.
const firstVal=(...vals)=>{for(const v of vals){if(v!==undefined&&v!==null&&v!=="")return v;}return"";};

function gcfg(k,d=""){
  let raw = localStorage.getItem("lcfg_"+k) || d;
  // Si la clave es sensible y el valor viene obfuscado, lo desofusca de
  // forma transparente. Si está en texto plano (instalación previa) se
  // devuelve tal cual — la próxima escritura lo guardará obfuscado.
  if(_LCFG_SENSITIVE.has(k) && typeof raw === "string" && raw.startsWith(_OBF_PREFIX)){
    raw = _deobfuscate(raw) || d;
  }
  return raw;
}
function scfg(k,v){
  const stored = (_LCFG_SENSITIVE.has(k) && v) ? _obfuscate(String(v)) : v;
  localStorage.setItem("lcfg_"+k, stored);
}

function skey(m,f){ return PRE + mLabel(m) + "_" + f + "_" + today(); }

// Caché transitoria de loadE: evita parseos repetidos de localStorage en
// updateDots/updateSyncUI/getStatus/buildGrid (se invocan varias veces por
// refresco). Se INVALIDA explícitamente en cada escritura de ficha (saveE,
// clearFicha, syncBlanco, cleanup). Los valores devueltos se tratan como SOLO
// LECTURA en todo el código (verificado: ninguna ruta muta e.data en sitio);
// se congelan como defensa para que un mutado accidental no corrompa la caché.
const _loadECache = new Map();
function _invalidateLoadE(key){ if(key) _loadECache.delete(key); else _loadECache.clear(); }

function loadE(m,f){
  const sk = skey(m,f);
  if(_loadECache.has(sk)) return _loadECache.get(sk);
  let result = null;
  try{
    const raw = localStorage.getItem(sk);
    if(raw){
      const e = JSON.parse(raw);
      if(e && typeof e === "object" && !Array.isArray(e) &&
         e.mod === m && ALL_FICHAS.includes(e.ficha) &&
         e.data && typeof e.data === "object"){
        try{ Object.freeze(e.data); Object.freeze(e); }catch(_){}
        result = e;
      }
    }
  }catch(x){ result = null; }
  _loadECache.set(sk, result);
  return result;
}
function saveE(m,f,data,synced=false){
  if(!isValidMod(m)) return false;
  if(!ALL_FICHAS.includes(f)) return false;
  if(!data||typeof data!=="object"||Array.isArray(data)) return false;
  const ex = loadE(m,f);
  const e = {mod:m, ficha:f, date:today(),
             savedAt: ex ? ex.savedAt : Date.now(),
             updatedAt: Date.now(), synced, data};
  // Persistencia VERIFICADA: _lsSet hace lectura-tras-escritura + reclaim y
  // devuelve false si el navegador NO persistió de verdad (cuota llena, o modo
  // privado/incógnito que acepta setItem como no-op silencioso). Antes se usaba
  // safeSetItem y se DESCARTABA el retorno, por lo que las fichas estándar de
  // Larvicultura podían reportar "Guardado localmente" en falso y el dato
  // "desaparecía" al recargar. Ahora el retorno se propaga a localSave/localSync.
  const ok = _lsSet(skey(m,f), JSON.stringify(e));
  _invalidateLoadE(skey(m,f));
  return ok;
}
function getStatus(m,f){
  // Lab. Algas: el estado depende del historial pendiente. Si hay registros
  // en cola → "pending". Si no hay cola pero el slot tiene synced=true
  // (se sincronizó hoy) → "synced". De lo contrario → "empty".
  if(f === "algas" && isLabMod(m)){
    if(loadAlgHist().length > 0) return "pending";
    const e = loadE(m,f);
    if(e && e.synced) return "synced";
    return "empty";
  }
  const e = loadE(m,f);
  if(!e) return "empty";
  return e.synced ? "synced" : "pending";
}

/* ══════════════════════════════════════════
   PERSISTENCIA ROBUSTA DE localStorage
   ──────────────────────────────────────────
   Causa raíz del bug "dice Guardado local pero desaparece al recargar": cuando
   el almacenamiento del navegador está lleno (cuota excedida — típico en
   móviles con fotos en base64), localStorage.setItem LANZA y los guardados
   silenciaban el error → el botón mostraba "guardado" pero NADA se escribió.
   _lsSet intenta escribir; si falla por cuota, libera espacio (purga datos ya
   caducados/sincronizados y fotos vencidas) y reintenta UNA vez. Devuelve
   true/false REAL para que las funciones de guardado no mientan.
══════════════════════════════════════════ */
let _reclaiming = false;
function _reclaimSpace(){
  if(_reclaiming) return false;              // evita recursión (los prune llaman a _*Save→_lsSet)
  _reclaiming = true;
  let freed = false;
  try{
    // 1) Purga datos gestionados por TTL/sincronización (seguros de borrar).
    try{ if(typeof pruneMic    === "function") pruneMic();    }catch(_){}
    try{ if(typeof pruneCal    === "function") pruneCal();    }catch(_){}
    try{ if(typeof prunePat    === "function") prunePat();    }catch(_){}
    try{ if(typeof pruneBio    === "function") pruneBio();    }catch(_){}
    try{ if(typeof pruneAst    === "function") pruneAst();    }catch(_){}
    try{ if(typeof pruneAlgLog === "function") pruneAlgLog(); }catch(_){}
    try{ if(typeof pruneHist   === "function") pruneHist();   }catch(_){}
    // 2) Elimina FOTOS caducadas (FTTL) — suelen ser lo más pesado en cuota.
    try{
      const now = Date.now(), rm = [];
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(FPRE)){
          try{ const e = JSON.parse(localStorage.getItem(k) || "null");
               if(e && e.ts && (now - e.ts) > FTTL) rm.push(k); }catch(_){}
        }
      }
      rm.forEach(k=>{ try{ localStorage.removeItem(k); freed = true; }catch(_){} });
    }catch(_){}
  } finally { _reclaiming = false; }
  return freed;
}
// setItem robusto: true si persistió, false si no (tras intentar liberar espacio).
// Verifica con lectura-tras-escritura: algunos navegadores en modo privado/
// restringido aceptan setItem como no-op SIN lanzar error → sin esta
// verificación, el guardado reportaría éxito y el dato “desaparecería” al salir.
function _lsSet(key, valueStr){
  try{
    localStorage.setItem(key, valueStr);
    if(localStorage.getItem(key) !== valueStr) throw new Error("no-persist");
    return true;
  }catch(e){
    if(_reclaiming) return false;            // dentro del reclamo: no re-entrar
    try{ _reclaimSpace(); }catch(_){}
    try{ localStorage.setItem(key, valueStr); return localStorage.getItem(key) === valueStr; }
    catch(e2){ return false; }
  }
}

function cleanup(){
  // FPRE/RPRE/ALGHIST_PRE/TQNAME_PRE/NPRE all start with PRE, so a single
  // prefix check captures every key this app owns.
  // Prune Bitácora (72 h) — clave única ALGLOG_KEY
  try{ pruneAlgLog(); }catch(_){}
  // Prune Biomol (48 h = BIO_TTL) — clave única BIO_REC_KEY
  try{ if(typeof pruneBio === "function") pruneBio(); }catch(_){}
  // Prune Microbiología — Bacteriología/Calidad de Agua/Patología (7 d = MIC_TTL,
  // solo sesiones sincronizadas) — MIC_REC_KEY / CAL_REC_KEY / PAT_REC_KEY
  try{ if(typeof pruneMic === "function") pruneMic(); }catch(_){}
  try{ if(typeof pruneCal === "function") pruneCal(); }catch(_){}
  try{ if(typeof prunePat === "function") prunePat(); }catch(_){}
  // Prune As Técnico (48 h) — clave única AST_REC_KEY
  try{ if(typeof pruneAst === "function") pruneAst(); }catch(_){}
  // Prune Historial general (60 d / máx 200) — HIST_PRE+mod por módulo.
  // Hace efectiva la limpieza que loadHist() sólo aplica en memoria,
  // evitando bloat en módulos con sincronizaciones antiguas.
  try{ if(typeof pruneHist === "function") pruneHist(); }catch(_){}
  const now = Date.now(), keys = [];
  let _removed = 0;   // #10: cuenta remociones para decidir si re-pintar el grid
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith(PRE)) keys.push(k);
  }
  // Prefijos cuyos valores se gestionan por separado y NO tienen TTL en
  // cleanup. Saltarlos evita un JSON.parse innecesario por cada clave,
  // que es el cuello de botella en dispositivos con muchos registros.
  // NOTA: NPRE/HIST_PRE se declaran más abajo en el archivo. cleanup() se
  // invoca sólo asíncronamente (post-boot), pero el try/catch defiende
  // contra futuras llamadas tempranas que caerían en TDZ.
  let SKIP_PREFIXES, SKIP_EXACT;
  try{
    SKIP_PREFIXES = [NPRE, TQNAME_PRE, CS_PRE, TON_PRE, MAD_PRE, HIST_PRE];
    SKIP_EXACT    = new Set([ALGLOG_KEY, BIO_REC_KEY, AST_REC_KEY, "larv4_sid", STDLOTE_KEY, STDCORR_KEY]);
  }catch(_){
    SKIP_PREFIXES = [TQNAME_PRE, CS_PRE, TON_PRE, MAD_PRE];
    SKIP_EXACT    = new Set([ALGLOG_KEY, BIO_REC_KEY, AST_REC_KEY, "larv4_sid", STDLOTE_KEY, STDCORR_KEY]);
  }
  keys.forEach(k=>{
    try{
      if(SKIP_EXACT.has(k)) return;
      if(SKIP_PREFIXES.some(p => k.startsWith(p))) return;
      if(k.startsWith(ALGHIST_PRE)){
        // Historial Lab. Algas: TTL 24h, marcado por la fecha embebida en la clave
        const dStr = k.slice(ALGHIST_PRE.length);
        if(/^\d{4}-\d{2}-\d{2}$/.test(dStr)){
          const d = new Date(dStr + "T00:00:00");
          if(!isNaN(d) && (now - d.getTime()) > TTL){ localStorage.removeItem(k); _removed++; }
        }
        return;
      }
      if(k.startsWith(FPRE)){
        // Photo TTL: 24h
        const raw = localStorage.getItem(k); if(!raw) return;
        const e = JSON.parse(raw);
        if(e && e.ts && (now - e.ts) > FTTL){ localStorage.removeItem(k); _removed++; }
        return;
      }
      if(k.startsWith(RPRE)){
        // Recovery snapshot TTL: 1h
        const raw = localStorage.getItem(k); if(!raw) return;
        const e = JSON.parse(raw);
        if(e && e.ts && (now - e.ts) > RTTL){ localStorage.removeItem(k); _removed++; }
        return;
      }
      // Ficha (skey): la clave incluye la fecha de guardado (today()). Purga:
      //  • sincronizadas → 24h tras guardar (consulta rápida post-envío).
      //  • NO sincronizadas de días previos → quedan HUÉRFANAS: loadE() siempre
      //    usa la clave de HOY, así que ya nunca se leen ni pueden sincronizarse
      //    desde la UI. Antes NUNCA se purgaban → fuga lenta de almacenamiento.
      //    Ahora se eliminan tras el mismo margen de 24h (cubre el trabajo
      //    pasada la medianoche; el recovery de 1h es independiente).
      // El guard `typeof e.savedAt === "number"` garantiza que SOLO se evalúen
      // entradas de ficha reales (saveE): otras claves larv4_ que caen aquí
      // (cola de sync, registros/borradores Mic·Cal, etc.) no tienen savedAt y
      // se conservan intactas.
      const raw = localStorage.getItem(k);
      if(!raw) return;
      const e = JSON.parse(raw);
      if(e && typeof e.savedAt === "number" && (now - e.savedAt) > TTL){
        localStorage.removeItem(k); _removed++;
      }
    }catch(x){ _silent("cleanup:"+k, x); }
  });
  // Si se purgó alguna ficha, la caché de loadE puede tener entradas obsoletas.
  if(_removed > 0) _invalidateLoadE();
  // #10: indica al boot si hubo cambios → evita un buildGrid() redundante cuando
  // no se purgó nada (caso común). Las purgas de pruneBio/pruneAst/pruneMic ya
  // se reflejan en el primer buildGrid (esos load*() prunan al leer).
  return _removed > 0;
}

/* ══════════════════════════════════════════
   AUTO-SAVE RECOVERY
   Saves a snapshot every 60s regardless of manual save.
   Key: RPRE + mLabel(m) + "_" + fid  (no date suffix — survives midnight)
   TTL: 1 hour. Cleared on successful Recuperar.
══════════════════════════════════════════ */
function rkeyR(m,f){ return RPRE + mLabel(m) + "_" + f; }

function saveRecovery(m, fid, data){
  if(!isValidMod(m)) return;
  if(!ALL_FICHAS.includes(fid)) return;
  const entry = { mod:m, ficha:fid, ts:Date.now(), data };
  try{ localStorage.setItem(rkeyR(m,fid), JSON.stringify(entry)); }
  catch(x){} // silent — recovery is best-effort
}

function loadRecovery(m, fid){
  try{
    const raw = localStorage.getItem(rkeyR(m,fid));
    if(!raw) return null;
    const e = JSON.parse(raw);
    // NOTE: e.mod === m uses strict equality so CIO (mod=0) is handled correctly
    if(!e||typeof e!=="object"||e.mod!==m||!ALL_FICHAS.includes(e.ficha)) return null;
    if(Date.now()-e.ts > RTTL){ localStorage.removeItem(rkeyR(m,fid)); return null; }
    return e;
  }catch(x){ return null; }
}

function clearRecovery(m, fid){
  localStorage.removeItem(rkeyR(m,fid));
}

/* ══════════════════════════════════════════
   HISTORIAL LAB. ALGAS
   Cola de registros pendientes de sincronizar
   (máx 10 por día). Cada entrada = snapshot
   de la ficha. Se vacía tras sync exitoso.
══════════════════════════════════════════ */
function algHistKey(){ return ALGHIST_PRE + today(); }

function loadAlgHist(){
  try{
    const raw = localStorage.getItem(algHistKey());
    if(!raw) return [];
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return [];
    // Defensa: orden cronológico ascendente por ts. En el flujo normal el
    // pushAlgHist appendea al final, por lo que el sort es no-op; protege
    // contra migraciones/imports que pudieran dejar los registros barajados.
    arr.sort((a,b) => ((a && a.ts) || 0) - ((b && b.ts) || 0));
    return arr;
  }catch(x){ _silent("loadAlgHist", x); return []; }
}
function saveAlgHist(list){
  try{ localStorage.setItem(algHistKey(), JSON.stringify(list||[])); }
  catch(x){ toast("No se pudo guardar el historial (espacio insuficiente).","err"); }
}
function pushAlgHist(data){
  const list = loadAlgHist();
  if(list.length >= ALGHIST_MAX){
    toast("Historial lleno ("+ALGHIST_MAX+" registros). Sincroniza o elimina alguno antes de agregar más.","warn",4500);
    return false;
  }
  if(!data || typeof data !== "object" || Array.isArray(data)){ return false; }
  list.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    ts: Date.now(),
    data: data
  });
  saveAlgHist(list);
  return true;
}
function removeAlgHistById(id){
  const list = loadAlgHist().filter(x => x.id !== id);
  saveAlgHist(list);
}
function clearAlgHist(){
  try{ localStorage.removeItem(algHistKey()); }catch(x){}
}

/* ══════════════════════════════════════════
   BITÁCORA LAB. ALGAS — registros ya sincronizados
   Persistencia local 72 h. Cada entrada conserva
   data.fecha / modulo_larv / area / sistema para
   distinguir cada registro en la lista.
══════════════════════════════════════════ */
function _algLogRaw(){
  try{
    const raw = localStorage.getItem(ALGLOG_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(x){ _silent("_algLogRaw", x); return []; }
}
function _algLogSave(list){
  try{ localStorage.setItem(ALGLOG_KEY, JSON.stringify(list||[])); }
  catch(x){ toast("No se pudo actualizar la bitácora (espacio insuficiente)","err"); }
}
function pruneAlgLog(){
  const now = Date.now();
  const list = _algLogRaw().filter(h => h && h.syncedAt && (now - h.syncedAt) < ALGLOG_TTL_MS);
  _algLogSave(list);
  return list;
}
function loadAlgLog(){
  // Devuelve la bitácora ordenada por syncedAt desc, ya filtrada por TTL 72 h
  const list = pruneAlgLog();
  return list.slice().sort((a,b)=> (b.syncedAt||0) - (a.syncedAt||0));
}
function pushAlgLog(data){
  if(!data || typeof data !== "object" || Array.isArray(data)) return;
  const list = pruneAlgLog();
  list.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    syncedAt: Date.now(),
    data: Object.assign({}, data)
  });
  // Sanity cap
  if(list.length > ALGLOG_MAX) list.splice(0, list.length - ALGLOG_MAX);
  _algLogSave(list);
}
function getAlgLogEntry(id){
  return loadAlgLog().find(h => h.id === id) || null;
}
function removeAlgLogById(id){
  const list = _algLogRaw().filter(h => h.id !== id);
  _algLogSave(list);
}


// Called every 60s while app is visible — collects current form state.
// Antes sólo se respaldaba la pestaña activa: si el usuario tipeaba en
// Calidad y cambiaba a PLG antes del siguiente tick, esos datos quedaban
// fuera del snapshot de recuperación. Ahora se itera por TODAS las fichas
// estándar del módulo (el panel se conserva en el DOM aunque esté oculto,
// así que collect() lee los inputs aunque el tab no esté visible). Los
// paneles nunca renderizados devuelven {} y se omiten.
let _recTimer = null;
function startAutoRecovery(){
  if(_recTimer) clearInterval(_recTimer);
  _recTimer = setInterval(()=>{
    if(curMod === null || curMod === undefined) return;
    // Biomol usa grilla propia: respalda esa grilla y omite el bucle de fichas
    // estándar (sus paneles no existen en este módulo).
    if(isBioMod(curMod)){ try{ saveBioRecovery(); }catch(_){} return; }
    // Microbiología usa borrador propio: respalda el Nuevo análisis (Bacteriología)
    // y omite el bucle de fichas estándar (sus paneles no existen aquí).
    if(isMicMod(curMod)){ try{ saveMicRecovery(); }catch(_){} return; }
    // As Técnico: respalda el formulario en curso (sus paneles tampoco existen aquí).
    if(isAstMod(curMod)){ try{ saveAstRecovery(); }catch(_){} return; }
    // Maduración: respalda la grilla activa (sus paneles tampoco existen aquí).
    if(isMadMod(curMod)){ try{ saveMadRecovery(); }catch(_){} return; }
    ALL_FICHAS.forEach(fid => {
      const fp = document.getElementById("fp-"+fid);
      if(!fp) return;
      const data = collect(fid, {quiet:true});   // #17: sin tocar _collectIssues ni .inp-bad
      const hasData = Object.values(data).some(v=>v!==null&&v!==undefined&&v!=="");
      if(hasData) saveRecovery(curMod, fid, data);
    });
  }, 60000);
}

function recoverFicha(fid){
  if(!ALL_FICHAS.includes(fid)) return;
  const rec = loadRecovery(curMod, fid);
  if(!rec){
    toast("No hay datos de recuperación disponibles","warn"); return;
  }
  const ts = new Date(rec.ts).toLocaleString("es-EC");
  if(!confirm("¿Recuperar los datos guardados automáticamente el " + ts + "?\nSe reemplazará el contenido actual de la ficha.")) return;
  saveE(curMod, fid, rec.data, false);
  clearRecovery(curMod, fid);
  _formDirty = false;            // R3: lo recuperado quedó persistido
  renderFicha(fid);
  updateDots(); updateSyncUI();
  toast("✅ Datos recuperados del autoguardado","ok",4000);
}

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
function toast(msg, type="info", dur=3500){
  const a = document.getElementById("toasts");
  if(!a) return;
  const VALID_TYPES = new Set(["ok","err","warn","info"]);
  const t = VALID_TYPES.has(type) ? type : "info";
  const el = document.createElement("div");
  el.className = "toast " + t;
  el.textContent = (t==="ok"?"✅":t==="err"?"❌":t==="warn"?"⚠️":"ℹ️") + " " + msg;
  a.appendChild(el);
  // Guarda referencias a los timers en el propio elemento para poder
  // cancelarlos si el toast se desmonta antes (cambio de módulo, navegación)
  // y evitar que un setTimeout colgado intente animar un nodo removido.
  el._fadeTimer = setTimeout(()=>{
    if(!el.isConnected) return;
    el.style.cssText="opacity:0;transform:translateX(16px);transition:.3s";
    el._rmTimer = setTimeout(()=>{ if(el.isConnected) el.remove(); }, 320);
  }, dur);
}
// Limpia todos los toasts visibles cancelando sus timers asociados
function clearToasts(){
  const a = document.getElementById("toasts");
  if(!a) return;
  Array.from(a.children).forEach(el=>{
    if(el._fadeTimer) clearTimeout(el._fadeTimer);
    if(el._rmTimer)   clearTimeout(el._rmTimer);
    el.remove();
  });
}

/* ══════════════════════════════════════════
   SYNC UI
══════════════════════════════════════════ */
function setSyncUI(st, lbl){
  document.getElementById("sdot").className = "sdot " + st;
  document.getElementById("slbl").textContent = lbl;
}
/* ══════════════════════════════════════════
   GOOGLE SHEET PAYLOAD BUILDERS
   Maps 4 fichas → 2 sheet tabs (LARC.xlsx structure)
══════════════════════════════════════════ */

/*
  "Datos Larvicultura - M0X"  (48 columns, 1 row per TQ)
  Sources: Calidad + PLG + Población + Despacho + Calidad de Agua fichas
  Schema actualizado tras eliminación de 21 cols del Google Sheet:
    - Talla (eliminada de Calidad y PLG)
    - 16 cols "otro sistema" (TotAnim→Surv_pct)
    - 4 cols Despacho (Cant. Cosechada 1/2/3/total)

  [0]Fecha [1]Corrida [2]Módulo [3]Tanque
  [4]Supervivencia [5]Mortalidad [6]Población [7]Lote [8]Estadío
  [9]Intestino_Lleno [10]Intestino_Semilleno [11]Intestino_Vacio
  [12]Deformidad [13]Retraso [14]% Mortalidad
  [15]Hongos [16]% No_viables [17]% Opacidad [18]Lípidos
  [19]Flácidez [20]Necrosis [21]Canibalismo [22]Parásitos
  [23]% Actividad [24]Plg [25]Plg (manual)
  [26]Estrés [27]Salinidad [28]Técnico
  [29..36] = 8 cols otro sistema (ID Análisis→Pigmentación, vacías desde este cliente)
  [37]Densidad cosechada [38]Biomasa [39]Cajas/Tinas [40]Destino [41]Piscina
  [42]Cel/ml [43]Color [44]% Espuma [45]% Suciedad [46]% Recambio [47]Observaciones
*/
function buildDatosPayload(m, includeFichas, opts){
  // includeFichas: opcional. Si se pasa un array (ej. ["calidad"]), sólo se
  // cargan los datos de esas fichas; las demás se tratan como {} (vacío).
  // Esto permite sync individual: el upsert del GAS preserva vía merge las
  // columnas de las fichas no incluidas (nEmpty ? existing : new).
  // opts.dataByFicha: fuente de datos alterna (snapshot del historial) en vez de
  //   loadE — usada por el recálculo retroactivo de supervivencia. Las fichas
  //   ausentes en el mapa = {} → el GAS preserva sus columnas vía merge.
  // opts.fecha: fuerza la fecha del lote (clave de upsert Fecha+Módulo+Tanque).
  opts = opts || {};
  const _src = (opts.dataByFicha && typeof opts.dataByFicha === "object") ? opts.dataByFicha : null;
  const inc = includeFichas ? new Set(includeFichas) : null;
  const _ld = (f) => _src
    ? (_src[f] || {})
    : ((!inc || inc.has(f)) ? (loadE(m,f)||{data:{}}).data : {});
  const cal  = _ld("calidad");
  const plg  = _ld("plg");
  const pob  = _ld("poblacion");
  const desp = _ld("despacho");
  const agua = _ld("calagua");
  const _tqn = loadTqNames(m);

  // Resuelve la fecha del lote priorizando Población > Calidad > PLG > Despacho > Agua.
  // Si ninguna ficha tiene fecha válida, cae a today() — y registra una
  // advertencia en consola para detectar configuraciones incompletas durante
  // QA. NO bloquea el sync (compatibilidad), pero marca el caso anómalo.
  // Fecha es columna CLAVE del upsert (Fecha+Módulo+Tanque). Para que el sync
  // individual por ficha caiga EXACTAMENTE en la misma fila que el sync masivo,
  // la fecha se resuelve consultando TODAS las fichas del módulo, no solo las
  // incluidas en `inc`. Los campos de datos sí respetan `inc`.
  const _ldDate = (f) => _src ? (_src[f] || {}) : (loadE(m,f)||{data:{}}).data;
  // Orden de prioridad por defecto (sync masivo): Pob > Cal > PLG > Desp > Agua.
  // En sync INDIVIDUAL / Blanco (includeFichas) la fecha DEBE provenir de la(s)
  // ficha(s) incluida(s): así, al editar desde Blanco un registro de OTRA fecha
  // (p.ej. de mayo) el upsert cae en la fila correcta (Fecha+Módulo+Tanque) en
  // lugar de tomar la fecha de HOY de otra ficha activa del módulo y terminar
  // editando/creando la fila equivocada. Si las incluidas no aportan una fecha
  // válida, se cae al orden global (compatibilidad con el sync masivo).
  const _dateOrder = ["poblacion","calidad","plg","despacho","calagua"];
  const _order = inc
    ? [..._dateOrder.filter(f => inc.has(f)), ..._dateOrder.filter(f => !inc.has(f))]
    : _dateOrder;
  let _fechaSrc = "today", fecha = "";
  if(opts.fecha && isValidDate(opts.fecha)){ fecha = opts.fecha; _fechaSrc = "override"; }
  else for(const f of _order){
    const dv = _ldDate(f).fecha || "";
    if(isValidDate(dv)){ fecha = dv; _fechaSrc = f; break; }
  }
  if(!fecha){
    fecha = today();
    try{ console.warn("[buildDatosPayload] sin fecha en ninguna ficha; usando today()", today(), "mod=", mLabel(m)); }catch(_){}
  }
  const corrida = sanitizeStr(pob.corrida || cal.corrida || plg.corrida || desp.corrida || agua.corrida || "");
  const tec     = sanitizeStr(cal.tec || plg.tec || pob.tec || desp.tec || agua.tec || gcfg("tec",""));
  const _tqLbl  = (i) => (_tqn[i] || ("TQ " + (i+1)));
  // ── Cel/ml (Calidad de Agua): el técnico registra el conteo crudo y al
  //    Google Sheet se envía multiplicado por 2500 (factor de cámara). El
  //    valor local permanece tal cual el técnico lo tecleó — la multiplicación
  //    sólo ocurre aquí, al construir el payload, para no acumular factores en
  //    re-sincronizaciones ni ediciones desde Blanco. El 0 se conserva como 0.
  const CELML_FACTOR = 2500;
  const celMlOut = (raw) => {
    if(raw === "" || raw === null || raw === undefined) return "";
    const n = parseFloat(raw);
    return isFinite(n) ? Math.round(n * CELML_FACTOR * 100) / 100 : "";
  };

  // ── SCHEMA 48 cols — alineado al Google Sheet tras eliminación de 21 cols ──
  // Eliminadas: Talla (1), TotAnim→Surv_pct (16 del otro sistema),
  //             Cant. Cosechada 1/2/3/total (4 de Despacho).
  // Las 8 cols restantes del otro sistema (ID Análisis→Pigmentación) se
  // envían vacías como antes; el GAS las preserva vía merge.
  const headers = [
    "Fecha","Corrida","Módulo","Tanque",
    "Supervivencia","Mortalidad","Población","Lote","Estadío",
    "Intestino_Lleno","Intestino_Semilleno","Intestino_Vacio",
    "Deformidad","Retraso","% Mortalidad",
    "Hongos","% No_viables","% Opacidad","Lípidos","Flácidez","Necrosis","Canibalismo","Parásitos",
    "% Actividad","Plg","Plg (manual)","Estrés","Salinidad","Técnico",
    // cols 30–37 (otro sistema — 8 cols supervivientes, vacías desde este cliente)
    "ID de Análisis","Peso promedio (mg)","Longitud promedio (mm)",
    "Uniformidad de peso","Uniformidad de longitud","CV de peso","CV de longitud",
    "Pigmentación",
    // cols 38–42 (Despacho — sin Cant. Cosechada 1/2/3/total)
    "Densidad cosechada","Biomasa","Cajas/Tinas","Destino","Piscina",
    // cols 43–48 (Calidad de Agua) — "% Transparencia" renombrada a "Color"
    "Cel/ml","Color","% Espuma","% Suciedad","% Recambio","Observaciones"
  ];

  // 8 cols vacías para el bloque del otro sistema (ID Análisis → Pigmentación).
  const OTRO_SISTEMA_PAD = new Array(8).fill("");

  const allRows = Array.from({length:TQS}, (_,i) => {
    const dataFields = [
      pob["sv_"+i], pob["po_"+i], pob["lt_"+i], pob["e_"+i],
      cal["e_"+i], cal["ll_"+i], cal["sl_"+i], cal["va_"+i],
      cal["df_"+i], cal["rt_"+i], cal["mo_"+i], cal["hg_"+i],
      cal["nv_"+i], cal["op_"+i],
      cal["lp_"+i], cal["fl_"+i], cal["nc_"+i], cal["cb_"+i],
      cal["pr_"+i], cal["cos_"+i], cal["es_"+i],
      plg["pg_"+i], plg["pgm_"+i], plg["lt_"+i],
      pob["sal_"+i],
      desp["e_"+i], desp["sv_"+i], desp["po_"+i], desp["pgm_"+i], desp["pg_"+i],
      desp["dc_"+i], desp["bm_"+i],
      desp["cj_"+i], desp["de_"+i], desp["ps_"+i],
      agua["e_"+i], agua["cm_"+i], agua["tr_"+i], agua["ep_"+i],
      agua["sc_"+i], agua["rc_"+i], agua["ob_"+i]
    ];
    // Un Lote arrastrado por la memoria de 30 d (congelado) NO debe, por sí
    // solo, crear una fila en la hoja: un tanque inactivo hoy quedaría con
    // Fecha+Tanque+Lote y nada más. Por eso el chequeo de "tiene datos" ignora
    // los dos campos de Lote (pob.lt_i = índice 2, plg.lt_i = índice 23 del
    // array dataFields). El Lote sí se incluye en la fila cuando ésta se emite
    // por tener algún dato sustantivo (población, métricas, etc.).
    const hasData = dataFields.some((v, idx) =>
      idx !== 2 && idx !== 23 && v !== undefined && v !== "" && v !== null);
    if(!hasData) return null;
    const rawPob = firstVal(pob["po_"+i], desp["po_"+i]);
    let pobReal = "";
    if(rawPob !== ""){
      const n = parseFloat(rawPob);
      pobReal = isFinite(n) ? Math.round(n * 1000 * 100) / 100 : "";
    }
    return [
      fecha, corrida, mLabel(m), _tqLbl(i),                              // 0-3
      // Col 5 "Mortalidad" (conteo absoluto) va SIEMPRE vacía a propósito:
      // pertenece al esquema del "otro sistema" y el GAS la preserva vía merge;
      // este cliente solo aporta "% Mortalidad" (mo_i, más abajo).
      firstVal(pob["sv_"+i], desp["sv_"+i]), "", pobReal,               // 4-6 Supervivencia / Mortalidad / Población
      pob["lt_"+i] || plg["lt_"+i] || "",                                // 7 Lote
      desp["e_"+i] || cal["e_"+i] || pob["e_"+i] || agua["e_"+i] || "", // 8 Estadío
      pv(cal,"ll_"+i), pv(cal,"sl_"+i), pv(cal,"va_"+i),                 // 9-11 Intestino
      pv(cal,"df_"+i), pv(cal,"rt_"+i), pv(cal,"mo_"+i),                 // 12-14 Deformidad/Retraso/% Mort
      pv(cal,"hg_"+i), pv(cal,"nv_"+i), pv(cal,"op_"+i),                 // 15-17 Hongos/% NoViab/% Opac
      pv(cal,"lp_"+i), pv(cal,"fl_"+i),                                  // 18-19 Lípidos/Flácidez
      pv(cal,"nc_"+i), pv(cal,"cb_"+i), pv(cal,"pr_"+i),                 // 20-22 Necrosis/Canibalismo/Parásitos
      pv(cal,"cos_"+i), firstVal(desp["pg_"+i], plg["pg_"+i]), firstVal(desp["pgm_"+i], plg["pgm_"+i]), // 23-25 % Actividad / Plg (Despacho > PLG ext.) / Plg (manual)
      pv(cal,"es_"+i), pv(pob,"sal_"+i), tec,                            // 26-28 Estrés/Salinidad/Técnico
      ...OTRO_SISTEMA_PAD,                                                // 29-36 (otro sistema, 8 cols vacías)
      pv(desp,"dc_"+i), pv(desp,"bm_"+i),                                // 37-38 Densidad cosechada / Biomasa
      pv(desp,"cj_"+i) || "",                                            // 39 Cajas/Tinas (manual)
      sanitizeStr(desp["de_"+i] || ""),                                  // 40 Destino
      sanitizeStr(desp["ps_"+i] || ""),                                  // 41 Piscina
      celMlOut(agua["cm_"+i]), pv(agua,"tr_"+i), pv(agua,"ep_"+i),       // 42-44 Cel/ml (×2500) / % Transp / % Espuma
      pv(agua,"sc_"+i), pv(agua,"rc_"+i),                                // 45-46 % Suciedad / % Recambio
      sanitizeStr(agua["ob_"+i] || "")                                   // 47 Observaciones
    ];
  });

  return {
    sheetName: "Datos Larvicultura - " + mLabel(m),
    headers,
    rows: allRows.filter(r => r !== null)
  };
}
function buildControlPayload(m){
  const par = (loadE(m,"params") || {data:{}}).data;
  const _tqn = loadTqNames(m);

  // SECURITY: validate and sanitize fields before payload
  const fechaStr = isValidDate(par.fecha||"") ? par.fecha : today();
  const corrida  = sanitizeStr(par.corrida || "");
  const obs      = sanitizeStr(par.obs || "");
  const _tqLbl = (i) => _tqn[i] || ("TQ " + (i+1));

  const headers = ["Fecha","Hora","Corrida","Módulo","Tanque","OD","Temperatura","Observacion"];
  const rows    = [];
  let firstRow  = true;

  for(let i=0;i<TQS;i++){
    const tankHasData = PTIMES.some(t =>
      (par["od_"+i+"_"+t]||"") !== "" || (par["tc_"+i+"_"+t]||"") !== ""
    );
    if(!tankHasData) continue;
    for(let ti=0;ti<PTIMES.length;ti++){
      const t   = PTIMES[ti];
      const od  = par["od_"+i+"_"+t] || "";
      const tmp = par["tc_"+i+"_"+t] || "";
      if(od===""&&tmp==="") continue;
      rows.push([
        fechaStr, t, corrida, mLabel(m), _tqLbl(i),
        od  !== "" ? parseFloat(od)  : "",
        tmp !== "" ? parseFloat(tmp) : "",
        firstRow ? obs : ""
      ]);
      firstRow = false;
    }
  }

  return {
    sheetName: "Control_Tanque " + mLabel(m),
    headers, rows
  };
}

/* ══════════════════════════════════════════
   SYNC ENGINE
══════════════════════════════════════════ */
// In-flight guard: previene POSTs concurrentes a la MISMA hoja. Si el
// usuario pulsa "Sincronizar" varias veces o dos flujos apuntan al mismo
// sheetName en paralelo, sólo el primero llega al GAS. Crítico para
// hojas append-only (Maduración Tanques/Lotes, BIOMOL, Registro_Supervisión)
// donde un doble-envío crearía filas duplicadas; las hojas upsert son
// idempotentes y la protección no las penaliza.
const _syncInFlight = new Set();

// ── Fingerprint de payload — idempotencia tras envío exitoso ────────────
// Tras un envío que devolvió status="ok", se registra una huella ligera del
// payload (sheetName + cantidad de filas + hash de primera/última fila).
// Si en los siguientes _SYNC_DUP_WINDOW_MS llega EXACTAMENTE el mismo
// payload, se omite el POST y se devuelve `true` (el dato ya está en
// Sheets). Esto neutraliza re-sincronizaciones accidentales (doble clic
// con delay, reintentos manuales tras éxito invisible, etc.) sin tocar
// el GAS. Las hojas upsert siguen siendo idempotentes; las append-only
// dejan de duplicar.
const _lastSyncFingerprint = new Map();
const _SYNC_DUP_WINDOW_MS = 30000;
function _stringHash(s){
  let h = 0;
  for(let i=0;i<s.length;i++){
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
function _payloadFingerprint(p, salt){
  try{
    if(!p || !Array.isArray(p.rows)) return null;
    const r = p.rows;
    // S1: la huella cubre TODAS las filas, no solo la primera y la última.
    // Antes, editar un tanque intermedio y re-sincronizar en <30s producía la
    // misma huella (mismo primer/último/conteo) → el POST se omitía y la ficha
    // se marcaba "sincronizada" en falso (pérdida silenciosa del cambio). Con el
    // hash del array completo, cualquier cambio en cualquier fila cambia la huella.
    const sample = JSON.stringify(r);
    const base = (p.sheetName || "?") + ":" + r.length + ":" + _stringHash(sample);
    // Hojas append-only (BIOMOL/AsT): el caller pasa un salt de identidad
    // (id del/los registro/s). Así dos registros DISTINTOS con contenido
    // idéntico no colisionan (evita pérdida silenciosa por el dedupe), mientras
    // que reenviar el MISMO id en <30s se sigue deduplicando (protege doble
    // clic / auto-sync al crear). Hojas upsert no pasan salt: el dedupe por
    // contenido ahí es correcto (re-upsert idéntico es no-op).
    return salt ? (base + ":" + salt) : base;
  }catch(_){ return null; }
}

// ── Helper de espera (para el backoff entre reintentos) ─────────────────
const _sleep = (ms) => new Promise(res => setTimeout(res, ms));

// ── POST de un solo intento ─────────────────────────────────────────────
// Devuelve un código de resultado en lugar de un booleano para que el
// llamador decida si reintenta, encola o se rinde:
//   "ok"       → el GAS confirmó status:"ok".
//   "retry"    → fallo transitorio (red caída, timeout, HTTP no-2xx, o
//                HTTP 200 con cuerpo no-JSON). Es seguro reintentar porque
//                el GAS ahora deduplica por `reqId` (idempotencia de servidor).
//   "rejected" → el GAS respondió status:"error" (payload inválido / hoja no
//                permitida / no autorizado). NO se reintenta: reintentar no
//                cambiaría el resultado.
async function _postOnce(bodyPayload, finalUrl){
  const ctrl  = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), 15000); // 15s timeout
  try{
    // Content-Type text/plain: deliberado — evita el preflight CORS que GAS
    // no soporta. El GAS parsea el cuerpo con JSON.parse(e.postData.contents).
    const r = await fetch(finalUrl, {
      method:"POST",
      body: JSON.stringify(bodyPayload),
      headers:{"Content-Type":"text/plain"},
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if(!r.ok) return "retry";
    let j;
    try{ j = JSON.parse(await r.text()); }
    catch(e){
      // S2: HTTP 200 pero cuerpo no-JSON. La escritura PUDO aplicarse. Antes
      // se devolvía error y el usuario reintentaba a ciegas → riesgo de duplicar
      // en hojas append-only. Ahora es "retry": el reintento es idempotente
      // gracias al `reqId` que valida el GAS, así que no duplica.
      return "retry";
    }
    return (j && j.status === "ok") ? "ok" : "rejected";
  }catch(x){
    clearTimeout(timer);
    if(x.name==="AbortError") console.error("[Sync] Request timed out");
    else console.error("[Sync] Network error:", x && x.message);
    return "retry";
  }
}

/* ══════════════════════════════════════════
   S3 · COLA DE SINCRONIZACIÓN OFFLINE
   Cuando un envío falla por causas transitorias (sin conexión, timeout,
   respuesta ambigua) tras agotar los reintentos en línea, el payload se
   guarda en localStorage y se reintenta automáticamente: (1) al volver la
   conexión (evento `online`), (2) al iniciar la app y (3) al pulsar
   Sincronizar. Cada ítem lleva su `reqId` (huella) para que el reenvío sea
   idempotente en el GAS → nunca duplica, aunque el primer intento sí hubiera
   llegado a escribir. El token NO se guarda en la cola (se re-inyecta desde
   Config al momento de enviar).
══════════════════════════════════════════ */
const SYNCQ_KEY = "larv4_syncqueue";
const SYNCQ_MAX = 50;
const SYNCQ_TTL = 24 * 60 * 60 * 1000; // 24 h: descarta ítems demasiado viejos
let _flushingQueue = false;

function _loadSyncQueue(){
  try{
    const a = JSON.parse(localStorage.getItem(SYNCQ_KEY) || "[]");
    return Array.isArray(a) ? a : [];
  }catch(_){ return []; }
}
function _saveSyncQueue(q){
  try{
    if(!q || q.length === 0){ localStorage.removeItem(SYNCQ_KEY); return; }
    safeSetItem(SYNCQ_KEY, JSON.stringify(q), { silent:true });
  }catch(_){}
}
function syncQueueLen(){ return _loadSyncQueue().length; }

function _enqueueSync(payload, reqId, url){
  if(!payload || !Array.isArray(payload.rows) || payload.rows.length === 0) return;
  let q = _loadSyncQueue();
  // Evita acumular el mismo envío (misma huella) más de una vez.
  if(reqId && q.some(it => it && it.reqId === reqId)) return;
  q.push({ payload, reqId: reqId || "", url: url || "", ts: Date.now() });
  if(q.length > SYNCQ_MAX) q = q.slice(q.length - SYNCQ_MAX); // conserva los más recientes
  _saveSyncQueue(q);
}

// Reintenta enviar todo lo encolado. Idempotente y reentrante-seguro
// (guard _flushingQueue). No marca fichas como sincronizadas (eso lo hace el
// flujo normal); su único objetivo es garantizar que el dato llegue a Sheets.
async function flushSyncQueue(){
  if(_flushingQueue) return;
  if(typeof navigator !== "undefined" && navigator.onLine === false) return;
  let q = _loadSyncQueue();
  if(q.length === 0) return;
  _flushingQueue = true;
  try{
    const now = Date.now();
    q = q.filter(it => it && (now - (it.ts || 0)) < SYNCQ_TTL); // purga vencidos
    const remaining = [];
    let sent = 0;
    for(const it of q){
      const url = it.url || gasUrl();
      if(!url || !isValidGasUrl(url)){ remaining.push(it); continue; }
      const sid      = getSessionId();
      const finalUrl = url + (url.indexOf("?") === -1 ? "?" : "&") + "z=" + encodeURIComponent(sid);
      const _gasTok  = gcfg("gas-token", "");
      const extra = {};
      if(_gasTok)  extra.token = _gasTok;
      if(it.reqId) extra.reqId = it.reqId;
      const body = Object.keys(extra).length ? Object.assign({}, it.payload, extra) : it.payload;
      const res = await _postOnce(body, finalUrl);
      if(res === "ok" || res === "rejected"){
        // "ok": entregado. "rejected": el GAS lo rechaza permanentemente
        // (reintentar es inútil) → se descarta para no bloquear la cola.
        sent++;
      } else {
        remaining.push(it); // sigue siendo transitorio: se conserva
      }
    }
    _saveSyncQueue(remaining);
    if(sent > 0){
      toast("✅ "+sent+" envío(s) pendiente(s) de la cola completados", "ok", 4000);
      try{ updateDots(); updateSyncUI(); }catch(_){}
    }
  } finally {
    _flushingQueue = false;
  }
}

async function postPayload(payload, url, opts){
  const flightKey = (payload && payload.sheetName) ? payload.sheetName : "_default";
  if(_syncInFlight.has(flightKey)){
    toast("⏳ Sincronización en curso para " + flightKey + " — espera a que termine","warn",3500);
    return false;
  }
  // ── Dedupe: ¿este mismo payload ya fue confirmado hace < 30s? ──────
  // opts.dedupeSalt: identidad opcional para hojas append-only (ver
  // _payloadFingerprint). Sin salt → dedupe por contenido (hojas upsert).
  const _fp = _payloadFingerprint(payload, opts && opts.dedupeSalt);
  if(_fp){
    const last = _lastSyncFingerprint.get(flightKey);
    if(last && last.hash === _fp && (Date.now() - last.ts) < _SYNC_DUP_WINDOW_MS){
      toast("ℹ️ Payload idéntico al envío exitoso de hace "+Math.round((Date.now()-last.ts)/1000)+"s — operación omitida (datos ya en Sheets)","info",5000);
      return true; // los datos YA están sincronizados; tratar como éxito
    }
  }
  _syncInFlight.add(flightKey);
  try{
    // Adjunta el sessionId como query (?z=...) para que el rate-limit del
    // GAS sea por dispositivo y no global. Compatible con URLs que ya
    // tengan otros parámetros.
    const sid = getSessionId();
    const finalUrl = url + (url.indexOf("?") === -1 ? "?" : "&") + "z=" + encodeURIComponent(sid);
    // ── Token compartido + reqId (idempotencia) ──────────────────────
    // `token`: autenticación opcional (el GAS sólo lo valida si su propia
    //   constante SHARED_TOKEN está fijada; si está vacía, se ignora — BC).
    // `reqId`: huella del payload. El GAS la recuerda ~10 min (CacheService);
    //   si llega otra vez el MISMO reqId, responde "ok" sin volver a escribir.
    //   Esto hace que CUALQUIER reintento (en línea o desde la cola offline)
    //   sea idempotente y nunca duplique, ni siquiera en hojas append-only.
    // Se construye un payload enriquecido sin mutar el original para no
    // contaminar caches/llamadas paralelas.
    const _gasTok = gcfg("gas-token", "");
    const extra = {};
    if(_gasTok) extra.token = _gasTok;
    if(_fp)     extra.reqId = _fp;
    const bodyPayload = Object.keys(extra).length
      ? Object.assign({}, payload, extra)
      : payload;

    // ── Reintento en línea con backoff ────────────────────────────────
    // S3: ante un fallo transitorio se reintenta una vez más antes de rendirse.
    // Los reintentos son seguros por la idempotencia vía reqId (ver arriba).
    const MAX_ATTEMPTS = 2;
    let res = "retry";
    for(let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++){
      res = await _postOnce(bodyPayload, finalUrl);
      if(res === "ok" || res === "rejected") break;
      if(attempt < MAX_ATTEMPTS) await _sleep(1200 * attempt);
    }

    if(res === "ok"){
      // Registra la huella SÓLO en éxito confirmado — activa el dedupe de
      // 30s para envíos idénticos inmediatos (doble clic, etc.).
      if(_fp) _lastSyncFingerprint.set(flightKey, { hash: _fp, ts: Date.now() });
      return true;
    }
    if(res === "rejected"){
      // El GAS rechazó el payload (inválido / hoja no permitida / no
      // autorizado). Reintentar no ayudaría; no se encola.
      return false;
    }

    // res === "retry" tras agotar intentos → fallo transitorio (sin conexión,
    // timeout o respuesta ambigua). Se encola para reintento automático.
    _enqueueSync(payload, _fp, url);
    toast("📶 Sin conexión estable — guardado en cola; se reintentará al reconectar","warn",5500);
    return false;
  } finally {
    // Libera el guard SIEMPRE — éxito, error, timeout o encolado. Sin esto,
    // un flujo fallido dejaría la hoja bloqueada hasta recargar la página.
    _syncInFlight.delete(flightKey);
  }
}

async function syncAll(){
  // Atajo: Microbiología delega en syncMic / syncCal (reemplazo por sesión a sus hojas).
  if(isMicMod(curMod)){
    const micP = _micRaw().some(r=>!r.synced);
    const calP = (typeof _calRaw==="function") && _calRaw().some(r=>!r.synced);
    const patP = (typeof _patRaw==="function") && _patRaw().some(r=>!r.synced);
    if(!micP && !calP && !patP){ toast("No hay muestras pendientes","info",2500); return; }
    if(micP) await syncMic();
    if(calP) await syncCal();
    if(patP) await syncPat();
    return;
  }
  // Atajo: Biomol delega en syncAllPendingBio (un solo batch a hoja BIOMOL).
  if(isBioMod(curMod)){
    await syncAllPendingBio();
    return;
  }
  // Atajo: As Técnico delega en syncAllPendingAst (un solo batch a Registro_Supervisión).
  if(isAstMod(curMod)){
    await syncAllPendingAst();
    return;
  }
  if(!syncRateOk()) return;

  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script primero","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL de script inválida","err"); openCfg(); return; }

  // S3: antes de nada, intenta vaciar lo que haya quedado en la cola offline.
  try{ await flushSyncQueue(); }catch(_){}

  setSyncUI("pend","Sincronizando...");
  let ok=0, fail=0, total=0;

  // Block sync without corrida/técnico for M01-M10 and CIO (no aplica a Lab. Algas ni Maduración).
  // La Corrida puede provenir de cualquier ficha estándar O de Desinfección.
  // El Técnico solo se exige cuando hay fichas de Datos/Control pendientes:
  // Desinfección tiene hoja propia y NO usa Técnico, así que sincronizarla
  // sola requiere únicamente Corrida.
  if(!isLabMod(curMod) && !isMadMod(curMod)){
    const datosFichas   = ["calidad","plg","params","poblacion","calagua","despacho"];
    const datosPending  = datosFichas.some(f => getStatus(curMod,f)==="pending");
    const desinfPending = getStatus(curMod,"desinfeccion")==="pending";
    let hasCorrida = false, hasTec = false;
    [...datosFichas,"desinfeccion"].forEach(f=>{
      const e = loadE(curMod, f);
      if(!e || !e.data) return;
      if(sanitizeStr(e.data.corrida||"")) hasCorrida = true;
      if(sanitizeStr(e.data.tec||""))     hasTec     = true;
    });
    if((datosPending || desinfPending) && !hasCorrida){
      setSyncUI("idle","Sin corrida");
      toast("⚠️ Ingresa el número de corrida en alguna ficha antes de sincronizar","warn",4500);
      return;
    }
    if(datosPending && !hasTec){
      setSyncUI("idle","Sin técnico");
      toast("⚠️ Ingresa el nombre del técnico responsable en alguna ficha antes de sincronizar","warn",4500);
      return;
    }
  }

  if(isMadMod(curMod)){
    // ── Maduración: sincroniza pendientes ficha por ficha (Salas/Tanques/Lotes) ──
    for(const f of MAD_FICHAS){
      const pending = loadMad(f).filter(r => !r.synced);
      if(pending.length === 0) continue;
      total++;
      toast("Enviando "+MAD_SHEET[f]+" — "+pending.length+" registro(s)…","info",2200);
      const payload = buildMadPayload(f, pending);
      if(payload && payload.rows.length > 0){
        const sent = await postPayload(payload, url);
        if(sent){
          const list2 = loadMad(f);
          pending.forEach(p => {
            const idx = list2.findIndex(x => x.id === p.id);
            if(idx >= 0){ list2[idx].synced = true; list2[idx].syncedAt = Date.now(); }
          });
          saveMadList(f, list2);
          if(curTab === f) renderMad(f);
          ok++;
        } else {
          fail++;
          toast("No fue posible sincronizar con Google Sheets ("+MAD_SHEET[f]+")","err",4500);
        }
      }
    }
  } else if(isLabMod(curMod)){
    // ── Lab. Algas: hoja única Lab_Algas ──
    // Solo se sincroniza lo que está en el historial. El formulario actual
    // no se envía hasta que se haya agregado al historial.
    // SNAPSHOT atómico: se congela la lista ANTES del POST. Si el usuario
    // agrega un nuevo registro mientras la sync está en vuelo, NO se perderá
    // — solo se eliminan del historial los ítems efectivamente enviados.
    const histSnapshot = loadAlgHist();
    const _histLen = histSnapshot.length;
    if(_histLen > 0){
      total++;
      toast("Enviando Lab. Algas — "+_histLen+" registro(s) del historial…","info",2200);
      const ap = buildAlgasPayload(curMod, histSnapshot);
      if(ap.rows.length > 0){
        const sent = await postPayload(ap, url);
        if(sent){
          // Vuelca SOLO los registros del snapshot a la Bitácora (TTL 72 h)
          histSnapshot.forEach(h => { if(h && h.data) pushAlgLog(h.data); });
          // Conserva en el historial cualquier registro agregado durante el sync
          const sentIds = new Set(histSnapshot.map(h => h && h.id).filter(Boolean));
          const remaining = loadAlgHist().filter(h => h && !sentIds.has(h.id));
          saveAlgHist(remaining);
          const e=loadE(curMod,"algas"); if(e) saveE(curMod,"algas",e.data,true);
          ok++;
          // Re-render para reflejar historial vacío + bitácora actualizada
          if(curTab === "algas")    try{ renderAlgas(); }catch(_){}
          if(curTab === "bitacora") try{ renderBitacora(); }catch(_){}
        }
        else { fail++; }
      }
    } else {
      const ae = loadE(curMod,"algas");
      const hasFormData = ae && ae.data && ["fecha","cel_ml","area","sistema"].some(k=>ae.data[k]!==undefined && ae.data[k]!=="");
      if(hasFormData){
        setSyncUI("idle","Historial vacío");
        toast("ℹ️ Para sincronizar Lab. Algas, agrega primero el registro al historial con 📋","info",5000);
        updateDots();
        return;
      }
    }
  } else {
    // ── Hoja 1: Datos Larvicultura ──
    // Despacho también escribe en esta hoja (cols 37–41), por lo que su
    // estado pendiente debe disparar la sincronización del payload.
    const pendDatos = ["calidad","plg","poblacion","despacho","calagua"].filter(f => getStatus(curMod,f)==="pending");
    if(pendDatos.length > 0){
      total++;
      toast("Enviando Datos Larvicultura…","info",2000);
      const dp = buildDatosPayload(curMod);
      if(dp.rows.length > 0){
        const sent = await postPayload(dp, url);
        if(sent){
          pendDatos.forEach(f=>{
            const e=loadE(curMod,f);
            if(!e) return;
            // Registra el envío en el Historial.
            pushHist(curMod, f, e.data);
            saveE(curMod,f,e.data,true);
          });
          ok++;
        } else { fail++; }
      } else {
        // Sin filas por tanque: nada llegó a Sheets. NO marcar como
        // sincronizado (evita un ✅ falso); la(s) ficha(s) siguen pendientes.
        total--;
        toast("ℹ️ Datos Larvicultura sin valores por tanque — no se envió nada","info",4000);
      }
    }
    // ── Hoja 2: Control_Tanque ──
    if(getStatus(curMod,"params")==="pending"){
      total++;
      toast("Enviando Parámetros…","info",2000);
      const cp = buildControlPayload(curMod);
      if(cp.rows.length > 0){
        const sent = await postPayload(cp, url);
        if(sent){
          const e=loadE(curMod,"params");
          if(e){
            pushHist(curMod, "params", e.data);
            saveE(curMod,"params",e.data,true);
          }
          ok++;
        }
        else { fail++; }
      } else {
        // Sin lecturas (OD/Temp): nada llegó a Sheets. NO marcar como
        // sincronizado; la ficha de Parámetros sigue pendiente.
        total--;
        toast("ℹ️ Parámetros sin lecturas (OD/Temp) — no se envió nada","info",4000);
      }
    }
    // ── Hoja 3: Registro_Desinfección ──
    if(getStatus(curMod,"desinfeccion")==="pending"){
      total++;
      toast("Enviando Desinfección…","info",2000);
      const dxp = buildDesinfeccionPayload(curMod);
      if(dxp.rows.length > 0){
        const sent = await postPayload(dxp, url);
        if(sent){
          const e=loadE(curMod,"desinfeccion");
          if(e) saveE(curMod,"desinfeccion",e.data,true);
          ok++;
        } else { fail++; }
      } else {
        // Sin elementos marcados: nada llegó a Sheets. La ficha sigue pendiente.
        total--;
        toast("ℹ️ Desinfección sin elementos marcados — no se envió nada","info",4000);
      }
    }
  }

  if(!total){ setSyncUI("idle","Sin datos nuevos"); toast("No hay datos pendientes","info",2000); updateDots(); return; }
  if(!fail){
    setSyncUI("ok", ok+" hoja(s) sincronizada(s) ✔");
    toast("¡Datos registrados en Google Sheets!","ok");
    setTimeout(()=>{ setSyncUI("idle","Todo sincronizado"); }, 4000);
  } else {
    setSyncUI("err", fail+" hoja(s) con error — revisa la conexión");
    toast("Error en "+fail+" hoja(s). Revisa la conexión y reintenta.","err");
  }
  updateDots();
  // Refresca la pestaña Historial si el usuario la está viendo
  if(curTab === "historial") try{ renderHistorial(); }catch(_){}
}


/* ══════════════════════════════════════════
   LOGIN
══════════════════════════════════════════ */
function buildGrid(){
  // El grid de módulos SOLO es visible en la pantalla de login. Si hay un
  // módulo abierto (#app.on), el grid está oculto: omitir su reconstrucción
  // evita escaneos costosos de localStorage (loadE/loadMad por módulo) que
  // disparaban saveMicLocal/saveBioGrid/syncMad/etc. en cada guardado. Al
  // volver al login, goBack() quita "on" ANTES de llamar buildGrid(), por lo
  // que el grid se reconstruye con datos frescos en ese momento.
  const _appEl = document.getElementById("rgApp");
  if(_appEl && _appEl.classList.contains("on")) return;
  let h = "";
  // M01–M10
  for(let m=1; m<=MODS; m++){
    const anyPend = STD_FICHAS_ALL.some(f=>getStatus(m,f)==="pending");
    const anySync = STD_FICHAS_ALL.some(f=>getStatus(m,f)==="synced");
    const cls = anyPend?"pend":anySync?"sync":"";
    h += `<div class="mc ${cls}" id="mc${m}" onclick="pickMod(${m})">
      <div class="mc-num">${m<10?"0"+m:m}</div>
      <div class="mc-lbl">Módulo</div>
      <span class="mc-dot"></span>
    </div>`;
  }
  // ─── FILA 2 (continuación) ───────────────────────────────
  // CIO tile
  const cioPend = STD_FICHAS_ALL.some(f=>getStatus(CIO_MOD,f)==="pending");
  const cioSync = STD_FICHAS_ALL.some(f=>getStatus(CIO_MOD,f)==="synced");
  const cioCls = cioPend?"pend":cioSync?"sync":"";
  h += `<div class="mc mc-cio ${cioCls}" id="mc0" onclick="pickMod(0)">
    <div class="mc-num">CIO</div>
    <div class="mc-lbl">Especial</div>
    <span class="mc-dot"></span>
  </div>`;
  // As Técnico tile — pinta dot pend/sync según historial local
  const astList = (typeof loadAst === "function") ? loadAst() : [];
  const astPend = astList.some(r => !r.synced);
  const astSync = astList.some(r => r.synced);
  const astCls  = astPend?"pend":astSync?"sync":"";
  h += `<div class="mc mc-ast ${astCls}" id="mc13" onclick="pickMod(13)">
    <div class="mc-num">AsT</div>
    <div class="mc-lbl">As Técnico</div>
    <span class="mc-dot"></span>
  </div>`;
  // ─── FILA 3 ──────────────────────────────────────────────
  // Lab. Algas tile
  const labPend = ["algas"].some(f=>getStatus(LAB_MOD,f)==="pending");
  const labSync = ["algas"].some(f=>getStatus(LAB_MOD,f)==="synced");
  const labCls = labPend?"pend":labSync?"sync":"";
  h += `<div class="mc mc-lab ${labCls}" id="mc11" onclick="pickMod(11)">
    <div class="mc-num">🌿</div>
    <div class="mc-lbl">Lab Algas</div>
    <span class="mc-dot"></span>
  </div>`;
  // Maduración tile
  const madPend = MAD_FICHAS.some(f => loadMad(f).some(r => !r.synced));
  const madSync = MAD_FICHAS.some(f => loadMad(f).some(r => r.synced));
  const madCls  = madPend?"pend":madSync?"sync":"";
  h += `<div class="mc mc-mad ${madCls}" id="mc12" onclick="pickMod(12)">
    <div class="mc-num">🦞</div>
    <div class="mc-lbl">Maduración</div>
    <span class="mc-dot"></span>
  </div>`;
  // Microbiología tile — pinta dot pend/sync según muestras locales
  const micList = (typeof loadMic === "function") ? loadMic() : [];
  const calList = (typeof loadCal === "function") ? loadCal() : [];
  const patList = (typeof loadPat === "function") ? loadPat() : [];
  const micPend = micList.some(r => !r.synced) || calList.some(r => !r.synced) || patList.some(r => !r.synced);
  const micSync = micList.some(r => r.synced)  || calList.some(r => r.synced)  || patList.some(r => r.synced);
  const micCls  = micPend?"pend":micSync?"sync":"";
  h += `<div class="mc mc-mic ${micCls}" id="mc14" onclick="pickMod(14)">
    <div class="mc-num">🧫</div>
    <div class="mc-lbl">Microbiol.</div>
    <span class="mc-dot"></span>
  </div>`;
  // Biomol tile — pinta dot pend/sync según historial local
  const bioList = (typeof loadBio === "function") ? loadBio() : [];
  const bioPend = bioList.some(r => !r.synced);
  const bioSync = bioList.some(r => r.synced);
  const bioCls  = bioPend?"pend":bioSync?"sync":"";
  h += `<div class="mc mc-bio ${bioCls}" id="mc15" onclick="pickMod(15)">
    <div class="mc-num">🧬</div>
    <div class="mc-lbl">Biomol</div>
    <span class="mc-dot"></span>
  </div>`;
  // Guard: el host puede estar desadjuntado (condición de carrera al cargar el
  // engine y salir de la vista Registros antes de que termine). Evita TypeError.
  const _grid = document.getElementById("mod-grid");
  if(_grid) _grid.innerHTML = h;
}

function pickMod(m){
  const mInt = parseInt(m, 10);
  if(!isValidMod(mInt)) return;
  document.querySelectorAll(".mc").forEach(c=>c.classList.remove("sel"));
  const tile = document.getElementById("mc" + mInt);
  if(tile) tile.classList.add("sel");
  curMod = mInt;
  document.getElementById("btn-lbl").textContent = mLabel(mInt);
  chkPin();
}

function chkPin(){
  const pinEl = document.getElementById("pin");
  if(!pinEl) return;
  // Defensa: sanea pegados o teclas no numéricas. inputmode="numeric" y
  // pattern="\d*" son sugerencias, no validan a nivel de JS. Forzamos
  // dígitos y limitamos a 6 caracteres para que un paste con texto
  // no rompa el flujo de validación.
  const cleaned = String(pinEl.value).replace(/\D/g, "").slice(0, 6);
  if(cleaned !== pinEl.value) pinEl.value = cleaned;
  // NOTE: curMod can be 0 (CIO) — isValidMod handles the falsy-0 case
  document.getElementById("btn-go").disabled = !(isValidMod(curMod) && cleaned === PINS[curMod]);
}

function enter(){
  if(curMod === null || curMod === undefined || !isValidMod(curMod)) return;
  const pinEl = document.getElementById("pin");
  // Sanea igual que chkPin() (solo dígitos, máx 6): enter() puede dispararse por
  // la tecla Enter sin pasar por el flujo de oninput, así que no se confía en
  // que pinEl.value ya esté normalizado.
  const pin = String(pinEl.value).replace(/\D/g, "").slice(0, 6);
  if(pin !== PINS[curMod]){
    pinEl.classList.remove("shake");
    void pinEl.offsetWidth;
    pinEl.classList.add("shake");
    pinEl.addEventListener("animationend", ()=>pinEl.classList.remove("shake"), {once:true});
    return;
  }
  // Defensa: limpia cualquier timer pendiente antes de iniciar la sesión.
  // startAutoRecovery() ya reinicia _recTimer, pero limpiarlo aquí evita
  // setTimeout/setInterval colgados si el ciclo de vida no pasó por
  // goBack() (p.ej., recarga parcial o reentrada al login).
  if(_recTimer){ clearInterval(_recTimer); _recTimer = null; }
  _formDirty = false;            // R3: arranca limpio al abrir el módulo
  document.getElementById("rgLogin").classList.add("gone");
  document.getElementById("rgApp").classList.add("on");
  const badge = document.getElementById("tb-badge");
  badge.textContent = mLabel(curMod);
  badge.className = "tb-badge" +
    (curMod === CIO_MOD ? " cio"
   : curMod === LAB_MOD ? " lab"
   : curMod === MAD_MOD ? " mad"
   : curMod === AST_MOD ? " ast"
   : curMod === MIC_MOD ? " mic"
   : curMod === BIO_MOD ? " bio"
   : "");
  curTab = isLabMod(curMod) ? "algas"
         : isMadMod(curMod) ? "salas"
         : isBioMod(curMod) ? "biomol"
         : isAstMod(curMod) ? "ast"
         : isMicMod(curMod) ? "micnuevo"
         : "calidad";
  buildTabs();
  renderAll();
  updateSyncUI();
  startAutoRecovery();
}

function goBack(){
  // Respalda la grilla Biomol / el formulario As Técnico antes de salir
  // (recuperación de lo no guardado).
  try{ if(isBioMod(curMod)) saveBioRecovery(); }catch(_){}
  try{ if(isAstMod(curMod)) saveAstRecovery(); }catch(_){}
  try{ if(isMadMod(curMod)) saveMadRecovery(); }catch(_){}
  if(_recTimer){ clearInterval(_recTimer); _recTimer = null; }
  _algEditingId = null;  // limpia modo edición Lab. Algas al salir del módulo
  _blancoState = null;   // limpia sandbox Blanco
  _madEditing = { ficha:null, id:null }; // limpia modo edición Maduración
  if(typeof _bioEditing !== "undefined") _bioEditing = null; // limpia edición Biomol
  if(typeof _astEditing !== "undefined") _astEditing = null; // limpia edición As Técnico
  // Purga oportunista de fotos/videos vencidos en TODOS los módulos.
  // Sin esto, los medios capturados en M01 seguirían ocupando localStorage
  // hasta el siguiente arranque, aun cuando el usuario haya cambiado de
  // módulo varias veces. Es complementario a cleanup() del boot.
  try{ if(typeof purgeExpiredFotosAllModules === "function") purgeExpiredFotosAllModules(); }catch(_){}
  document.getElementById("rgApp").classList.remove("on");
  document.getElementById("rgLogin").classList.remove("gone");
  document.getElementById("pin").value = "";
  document.getElementById("btn-go").disabled = true;
  curMod = null;
  _formDirty = false;            // R3: limpia el estado al salir del módulo
  buildGrid();
}

/* ══════════════════════════════════════════
   TAB NAVIGATION
   buildTabs() regenerates the tab bar based on module type.
   Lab. Algas has only "algas" + "fotos" tabs.
   All other modules have the full 4 fichas + fotos.
══════════════════════════════════════════ */
const LAB_TABS      = ["algas","bitacora","fotos"];
const STANDARD_TABS = [...FICHAS,"desinfeccion","fotos","historial","blanco"];
const MAD_TABS      = ["salas","tanques","lotes","fotos"];
// Tabs del módulo Biomol — form + historial inline + fotos
const BIO_TABS      = ["biomol","fotos"];
// Tabs del módulo As Técnico — form de supervisión + historial inline + fotos
const AST_TABS      = ["ast","fotos"];
// Rendered as [id, icon, label]
const TAB_META = {
  calidad:  ["🔬","Calidad Larvaria"],
  plg:      ["⚖️","PL Gramo Externo"],
  params:   ["🌡️","Parámetros"],
  poblacion:["🧮","Población"],
  calagua:  ["💧","Calidad de Agua"],
  despacho: ["🚚","Despacho"],
  desinfeccion:["🧴","Desinfección"],
  algas:    ["🌿","Lab. Algas"],
  bitacora: ["📑","Bitácora"],
  fotos:    ["📷","Fotos y Videos"],
  historial:["📜","Historial"],
  salas:    ["🏠","Salas"],
  tanques:  ["🛢️","Tanques"],
  lotes:    ["📦","Lotes"],
  biomol:   ["🧬","Biomol"],
  ast:      ["📋","As Técnico"],
  blanco:   ["📝","Blanco"],
  micnuevo: ["🧫","Nuevo análisis"],
  michist:  ["📜","Historial"],
  micfact:  ["✖️","Factores"],
  micrep:   ["📊","Reporte"]
};

function buildTabs(){
  const tabs = isLabMod(curMod) ? LAB_TABS
             : isMadMod(curMod) ? MAD_TABS
             : isBioMod(curMod) ? BIO_TABS
             : isAstMod(curMod) ? AST_TABS
             : isMicMod(curMod) ? MIC_TABS
             : STANDARD_TABS;
  const first = tabs[0];
  document.getElementById("ftabs").innerHTML = tabs.map(t => {
    const [ico,lbl] = TAB_META[t] || ["",""];
    return `<button class="ftab${t===first?" on":""}" data-f="${t}" onclick="selTab('${t}')">
      <span class="fdot mt" id="dot-${t}"></span>${ico} ${lbl}
    </button>`;
  }).join("");
}

function selTab(t){
  const tabs = isLabMod(curMod) ? LAB_TABS
             : isMadMod(curMod) ? MAD_TABS
             : isBioMod(curMod) ? BIO_TABS
             : isAstMod(curMod) ? AST_TABS
             : isMicMod(curMod) ? MIC_TABS
             : STANDARD_TABS;
  if(!tabs.includes(t)) return;
  // Al salir del "Nuevo análisis" de Microbiología, vuelca de inmediato el
  // borrador activo (sin esperar el debounce de 500ms) para que no se pierda lo
  // último tecleado al cambiar de pestaña.
  if(curTab === "micnuevo" && isMicMod(curMod)){
    try{
      clearTimeout(_micDraftTm);
      const _ty = micTypeGet();
      if(_ty === "bact") saveMicDraft(collectMicDraft());
      else if(_ty === "cal" && typeof collectCalDraft === "function") saveCalDraft(collectCalDraft());
      else if(_ty === "pat" && typeof collectPatDraft === "function") savePatDraft(collectPatDraft());
    }catch(_){}
  }
  // Al salir de una grilla de Maduración, persiste lo tecleado/pegado de la grilla
  // activa antes de cambiar de pestaña (anti-pérdida; curTab aún es la pestaña vieja).
  if(isMadMod(curMod) && MAD_FICHAS.includes(curTab)){ try{ _madCommitActive(); }catch(_){} }
  curTab = t;
  closeHistMenu();
  document.querySelectorAll(".ftab").forEach(b=>b.classList.toggle("on",b.dataset.f===t));
  document.querySelectorAll(".fp").forEach(p=>p.classList.remove("on"));
  const panel = document.getElementById("fp-"+t);
  if(panel) panel.classList.add("on");
  if(t==="fotos") renderFotos();
  if(t==="historial") renderHistorial();
  if(t==="blanco") renderBlanco();
  if(t==="bitacora") renderBitacora();
  if(MAD_FICHAS.includes(t)) renderMad(t);
  if(t==="biomol") renderBiomol();
  if(t==="ast")    renderAst();
  if(t==="micnuevo") micDispatchNuevo();
  if(t==="michist")  micDispatchHist();
  if(t==="micfact")  micDispatchFact();
  if(t==="micrep")   micDispatchRep();
  // Al volver a Población, recalcula totales/sobrev/mort_d con la data
  // más reciente (puede haber cambiado en otras fichas como Calidad).
  if(t==="poblacion") try{ rcPob(); }catch(_){}
}

function updateDots(){
  // Microbiología: pinta el dot del tab "Nuevo análisis" según pendientes.
  if(isMicMod(curMod)){
    const el = document.getElementById("dot-micnuevo");
    if(el){ const list = loadMic().concat(typeof loadCal==="function"?loadCal():[]).concat(typeof loadPat==="function"?loadPat():[]); const _s = list.some(r=>!r.synced) ? "pending" : (list.length>0 ? "synced" : "empty");
      el.className = "fdot " + (_s==="synced"?"ok":_s==="pending"?"pend":"mt"); }
    return;
  }
  // Biomol: pinta el dot del tab según haya pendientes
  if(isBioMod(curMod)){
    const el = document.getElementById("dot-biomol");
    if(!el) return;
    const list = loadBio();
    const s = list.some(r => !r.synced) ? "pending"
            : list.length > 0 ? "synced" : "empty";
    el.className = "fdot " + (s==="synced"?"ok":s==="pending"?"pend":"mt");
    return;
  }
  // As Técnico: igual que Biomol
  if(isAstMod(curMod)){
    const el = document.getElementById("dot-ast");
    if(!el) return;
    const list = loadAst();
    const s = list.some(r => !r.synced) ? "pending"
            : list.length > 0 ? "synced" : "empty";
    el.className = "fdot " + (s==="synced"?"ok":s==="pending"?"pend":"mt");
    return;
  }
  const tabs = isLabMod(curMod) ? ["algas"] : isMadMod(curMod) ? MAD_FICHAS : STD_FICHAS_ALL;
  tabs.forEach(f=>{
    const el = document.getElementById("dot-"+f);
    if(!el) return;
    let s;
    if(MAD_FICHAS.includes(f)){
      const records = loadMad(f);
      s = records.some(r => !r.synced) ? "pending"
        : (records.length > 0 ? "synced" : "empty");
    } else {
      s = getStatus(curMod, f);
    }
    el.className = "fdot " + (s==="synced"?"ok":s==="pending"?"pend":"mt");
  });
}
function updateSyncUI(){
  if(isMicMod(curMod)){
    const p = loadMic().filter(r=>!r.synced).length + (typeof _calRaw==="function"?_calRaw().filter(r=>!r.synced).length:0) + (typeof _patRaw==="function"?_patRaw().filter(r=>!r.synced).length:0);
    if(!p) setSyncUI("idle","Todo sincronizado");
    else   setSyncUI("pend", p + " muestra(s) pendiente(s)");
    return;
  }
  if(isBioMod(curMod)){
    const p = loadBio().filter(r => !r.synced).length;
    if(!p) setSyncUI("idle","Todo sincronizado");
    else   setSyncUI("pend", p + " registro(s) pendiente(s)");
    return;
  }
  if(isAstMod(curMod)){
    const p = loadAst().filter(r => !r.synced).length;
    if(!p) setSyncUI("idle","Todo sincronizado");
    else   setSyncUI("pend", p + " registro(s) pendiente(s)");
    return;
  }
  if(isMadMod(curMod)){
    let p = 0;
    MAD_FICHAS.forEach(f => { p += loadMad(f).filter(r => !r.synced).length; });
    if(!p) setSyncUI("idle","Todo sincronizado");
    else   setSyncUI("pend", p + " registro(s) pendiente(s)");
    return;
  }
  const tabs = isLabMod(curMod) ? ["algas"] : STD_FICHAS_ALL;
  const p = tabs.filter(f=>getStatus(curMod,f)==="pending").length;
  if(!p) setSyncUI("idle","Todo sincronizado");
  else   setSyncUI("pend", p + " ficha(s) pendiente(s)");
}

/* ══════════════════════════════════════════
   COLLECT + AUTO-SAVE
══════════════════════════════════════════ */
// R2: fuera de rango detectado en la última llamada a collect(). Lo consultan
// localSave / localSync / addToAlgHist para bloquear el guardado hasta corregir,
// en lugar de recortar el valor en silencio (antes 9999 en un 0–100 → 100).
let _collectIssues = [];
// `opts.quiet`: recolecta los datos SIN efectos secundarios — no resetea ni
// llena el global `_collectIssues` ni toca las clases `.inp-bad` del DOM. Lo usa
// el auto-recovery (cada 60s, sobre TODAS las fichas, varias ocultas): así no
// pisa el estado de validación de la ficha que el usuario está editando ni
// remarca paneles ocultos. El guardado/sync manual sigue llamando collect(fid)
// normal, que recalcula `_collectIssues` para el _rangeGuard.
function collect(fid, opts){
  const quiet = !!(opts && opts.quiet);
  const fp = document.getElementById("fp-"+fid);
  if(!fp) return {};
  if(!quiet) _collectIssues = [];
  const d = {};
  fp.querySelectorAll("[name]").forEach(el=>{
    if(el.type==="number"){
      if(el.value===""){ d[el.name]=""; if(!quiet && el.classList) el.classList.remove("inp-bad"); return; }
      // R2: ya NO se recorta al rango. Se conserva el valor tecleado y, si está
      // fuera de [min,max], se marca el campo (.inp-bad) y se reporta en
      // _collectIssues para que el guardado/sync lo bloquee hasta corregirlo.
      const n = parseFloat(el.value);
      if(!isFinite(n)){ d[el.name]=""; if(!quiet && el.classList) el.classList.remove("inp-bad"); return; }
      const lo = el.min!=="" ? parseFloat(el.min) : -Infinity;
      const hi = el.max!=="" ? parseFloat(el.max) :  Infinity;
      const outOfRange = (isFinite(lo) && n < lo) || (isFinite(hi) && n > hi);
      if(!quiet && el.classList) el.classList.toggle("inp-bad", outOfRange);
      if(!quiet && outOfRange){
        _collectIssues.push({ name: el.name, value: n, lo, hi,
          label: el.getAttribute("title") || el.getAttribute("placeholder") || el.name });
      }
      d[el.name] = n;
    } else if(el.type==="date"){
      d[el.name] = isValidDate(el.value) ? el.value : "";
    } else if(el.type==="time"){
      d[el.name] = /^\d{2}:\d{2}$/.test(el.value) ? el.value : "";
    } else if(el.tagName==="TEXTAREA"){
      d[el.name] = sanitizeStr(el.value);
    } else {
      d[el.name] = sanitizeStr(el.value);
    }
  });
  // Multiselección por "chips" (checkboxes con data-group, sin name): se
  // agregan como CSV en d[group], donde group = nombre del campo destino
  // (ej. data-group="obs" → d.obs). Sólo aplica a fichas que usen chips
  // (actualmente Lab. Algas · Observaciones); el resto no tiene checkboxes.
  const _chipGroups = {};
  fp.querySelectorAll('input[type="checkbox"][data-group]').forEach(cb=>{
    const g = cb.dataset.group;
    if(!g) return;
    if(!(g in _chipGroups)) _chipGroups[g] = [];
    if(cb.checked) _chipGroups[g].push(cb.value);
  });
  Object.keys(_chipGroups).forEach(g => { d[g] = _chipGroups[g].join(", "); });
  return d;
}
// R2: emite un toast claro si la última colecta tiene valores fuera de rango y
// devuelve true (= bloquear). Evita guardar/sincronizar datos corruptos.
function _rangeGuard(){
  if(!_collectIssues.length) return false;
  const it = _collectIssues[0];
  const loTxt = isFinite(it.lo) ? it.lo : "−∞";
  const hiTxt = isFinite(it.hi) ? it.hi : "∞";
  toast("⚠️ Valor fuera de rango en \""+it.label+"\": "+it.value+
        " (permitido "+loTxt+" a "+hiTxt+")."+
        (_collectIssues.length>1 ? " Y "+(_collectIssues.length-1)+" campo(s) más." : "")+
        " Corrige el dato antes de continuar.","err",6500);
  return true;
}
function localSave(fid){
  const data = collect(fid);
  // R2: bloquea si hay valores fuera del rango declarado (min/max).
  if(_rangeGuard()) return;
  // SECURITY: validate inputs before persisting
  if(!validateFicha(fid, data)) return;
  // Si el navegador no persiste de verdad (cuota llena / incógnito), NO mentir
  // con "Guardado localmente": avisar y abortar. El guardado local es lo único
  // que hace localSave, así que un fallo aquí debe ser visible.
  if(!saveE(curMod, fid, data, false)){
    toast("❌ No se pudo guardar localmente. El almacenamiento del navegador está lleno o no es persistente (modo incógnito / 'borrar datos al salir'). Libera espacio o usa Sincronizar para no perder los datos.","err",6000);
    return;
  }
  _persistStdLote(fid, data);    // Lote congelado 25 d (Población/PLG)
  _persistStdCorr(data);         // Corrida congelada 25 d (a nivel módulo)
  _formDirty = false;            // R3: lo tecleado quedó persistido
  updateDots(); updateSyncUI();
  const sp=document.getElementById("sp-"+fid); if(sp) sp.innerHTML=sspill("pending");
  toast("Guardado localmente","ok");
}
async function localSync(fid){
  const data = collect(fid);
  // R2: bloquea si hay valores fuera del rango declarado (min/max).
  if(_rangeGuard()) return;
  if(!validateFicha(fid, data)) return;
  // Block sync without corrida y sin técnico para M01-M10 y CIO (las 6 fichas
  // estándar). Lab. Algas se excluye porque su validación se hace en syncAll.
  if(!isLabMod(curMod)){
    const corridaVal = sanitizeStr(data.corrida || "");
    if(!corridaVal){
      toast("⚠️ Ingresa el número de corrida antes de sincronizar","warn",4000);
      return;
    }
    // Desinfección NO usa Técnico (su responsable es el Supervisor en el PDF);
    // solo exige Corrida. Las demás fichas estándar sí requieren Técnico.
    if(fid !== "desinfeccion"){
      const tecVal = sanitizeStr(data.tec || "");
      if(!tecVal){
        toast("⚠️ Ingresa el nombre del técnico responsable antes de sincronizar","warn",4000);
        return;
      }
    }
  }
  // El guardado local es el respaldo inmediato; aunque falle (cuota/incógnito)
  // NO abortamos: el envío a Google Sheets es el respaldo durable real y es justo
  // cuando MÁS se necesita. Solo se limpia _formDirty si el dato quedó realmente
  // persistido en local, para que el aviso de cierre siga protegiendo datos que
  // únicamente viven en el Sheet.
  if(saveE(curMod, fid, data, false)){
    _formDirty = false;          // R3: lo tecleado quedó persistido
  } else {
    toast("⚠️ No se pudo guardar localmente; se intentará sincronizar a Google Sheets de todos modos.","warn",5000);
  }
  _persistStdLote(fid, data);    // Lote congelado 25 d (Población/PLG)
  _persistStdCorr(data);         // Corrida congelada 25 d (a nivel módulo)
  await syncOneFicha(fid);
}

// ── Sync individual por ficha ─────────────────────────────────────────
// El botón ☁️ de cada ficha ahora envía SOLO esa ficha al GAS. Las demás
// fichas (pendientes o no) NO se tocan. El botón global "Sincronizar"
// del topbar sigue llamando a syncAll() para enviar TODO.
async function syncOneFicha(fid){
  if(!isValidMod(curMod)) return;
  if(isLabMod(curMod) || isMadMod(curMod) || isBioMod(curMod) || isAstMod(curMod)){
    await syncAll(); return;
  }
  if(!syncRateOk()) return;
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script primero","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL de script inválida","err"); openCfg(); return; }

  setSyncUI("pend","Sincronizando " + (FICHA_LABELS[fid]||fid) + "…");
  let sent = false;
  // hadRows=false significa que el payload quedó vacío (la ficha no tiene
  // valores por tanque/lecturas). En ese caso NO se envía ni se marca como
  // sincronizado: se informa al usuario y la ficha sigue pendiente.
  let hadRows = true;

  if(fid === "params"){
    const cp = buildControlPayload(curMod);
    if(cp.rows.length > 0){
      sent = await postPayload(cp, url);
    } else { hadRows = false; }
    if(sent){
      const e = loadE(curMod,"params");
      if(e){ pushHist(curMod,"params",e.data); saveE(curMod,"params",e.data,true); }
    }
  } else if(fid === "desinfeccion"){
    // Desinfección → hoja propia "Registro_Desinfección" (formato tidy).
    const dxp = buildDesinfeccionPayload(curMod);
    if(dxp.rows.length > 0){
      sent = await postPayload(dxp, url);
    } else { hadRows = false; }
    if(sent){
      const e = loadE(curMod, "desinfeccion");
      if(e) saveE(curMod, "desinfeccion", e.data, true);  // sin pushHist (no es hoja Datos)
    }
  } else if(["calidad","plg","poblacion","calagua","despacho"].includes(fid)){
    const dp = buildDatosPayload(curMod, [fid]);
    if(dp.rows.length > 0){
      sent = await postPayload(dp, url);
    } else { hadRows = false; }
    if(sent){
      const e = loadE(curMod, fid);
      if(e){ pushHist(curMod, fid, e.data); saveE(curMod, fid, e.data, true); }
    }
  }

  if(!hadRows){
    setSyncUI("idle","Sin datos por tanque");
    toast("ℹ️ "+(FICHA_LABELS[fid]||fid)+" no tiene valores por tanque — no se envió nada","info",4500);
    updateDots(); updateSyncUI();
    if(curTab === "historial") try{ renderHistorial(); }catch(_){}
    return;
  }

  if(sent){
    setSyncUI("ok",(FICHA_LABELS[fid]||fid)+" sincronizada ✔");
    toast("✅ "+(FICHA_LABELS[fid]||fid)+" enviada a Google Sheets","ok");
    setTimeout(()=> setSyncUI("idle","Todo sincronizado"), 3500);
  } else {
    setSyncUI("err","Error al sincronizar "+(FICHA_LABELS[fid]||fid));
    toast("Error al sincronizar. Revisa la conexión.","err",4500);
  }
  updateDots(); updateSyncUI();
  if(curTab === "historial") try{ renderHistorial(); }catch(_){}
}

/* ══════════════════════════════════════════
   STATUS PILL + SAVE AREA
══════════════════════════════════════════ */
function sspill(s){
  if(s==="synced") return'<span class="ssp ssp-ok">✅ En Google Sheets</span>';
  if(s==="pending") return'<span class="ssp ssp-pend">⏳ Guardado local</span>';
  return'<span class="ssp ssp-mt">○ Sin datos hoy</span>';
}
function saveArea(fid){
  const e    = loadE(curMod, fid);
  const s    = getStatus(curMod, fid);
  const last = e ? new Date(e.updatedAt).toLocaleString("es-EC") : "—";
  const rec  = loadRecovery(curMod, fid);
  const recTs = rec ? new Date(rec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}) : null;
  const recBtn = rec
    ? `<button class="btn brec" onclick="recoverFicha('${fid}')" title="Recuperar autoguardado de ${recTs}">↩ Recuperar (${recTs})</button>`
    : `<button class="btn brec" disabled style="opacity:.35;cursor:not-allowed">↩ Recuperar</button>`;
  const pdfBtn = (fid === "algas")
    ? ""
    : (fid === "desinfeccion")
      ? `<button class="btn bpdf" onclick="downloadDesinfeccionPDF()" title="PDF del Tipo de Registro activo">📄 PDF</button>`
      : `<button class="btn bpdf" onclick="downloadPDF('${fid}')" title="PDF A4">📄 PDF</button>`;

  // Botón "Compartir PDF" — solo fichas estándar con plantilla PDF (FICHAS). Envía
  // el PDF a Drive para descargarlo por el QR "PDFs del día" en otro dispositivo.
  const shareBtn = FICHAS.includes(fid)
    ? `<button class="btn bs" onclick="shareFichaPDF('${fid}')" title="Genera el PDF y lo sube a Drive para descargarlo por el QR en otro dispositivo (sin instalar el sistema)">📤 Compartir PDF</button>`
    : "";

  // Botón "Agregar al historial" — exclusivo Lab. Algas
  // En modo edición se transforma en "Actualizar registro" + Cancelar.
  let algBtn = "";
  if(fid === "algas" && isLabMod(curMod)){
    if(_algEditingId){
      const shortId = escapeHtml(String(_algEditingId).slice(0,5));
      algBtn = `<button class="alg-add-btn" onclick="addToAlgHist()"
        style="background:linear-gradient(135deg,#7c3aed,#a78bfa);border-color:#7c3aed;box-shadow:0 2px 10px rgba(124,58,237,.35)"
        title="Actualiza la entrada del historial en lugar de crear una nueva">
        💾 Actualizar registro <small style="opacity:.85;font-weight:600">#${shortId}</small>
      </button>
      <button class="btn bo" onclick="cancelAlgEdit()" title="Descartar los cambios de edición">✖ Cancelar edición</button>`;
    } else {
      algBtn = `<button class="alg-add-btn" onclick="addToAlgHist()"
        title="Agrega el registro actual al historial pendiente (máx ${ALGHIST_MAX}). Después podrás sincronizar todos juntos.">
        📋 Agregar al historial
       </button>`;
    }
  }

  return `<div class="sa">
    <div class="sa-info">
      <span>💾 Último guardado: <strong>${last}</strong></span>
      <span id="sp-${fid}">${sspill(s)}</span>
    </div>
    <div class="sa-btns">
      ${algBtn}
      <button class="btn bd" onclick="clearFicha('${fid}')" title="Borrar datos">🗑 Borrar</button>
      ${recBtn}
      ${pdfBtn}
      ${shareBtn}
      <button class="btn bs" onclick="localSave('${fid}')">💾 Guardar local</button>
      <button class="btn bp" onclick="localSync('${fid}')">☁️ Guardar y sincronizar</button>
    </div>
  </div>`;
}

/* ── Ficha render dispatch ─────────────────
   Single entry point. Add new fichas here only.
────────────────────────────────────────── */
const FICHA_LABELS = {
  calidad:"Calidad Larvaria",
  plg:"PL Gramo Externo",
  params:"Parámetros",
  poblacion:"Población",
  calagua:"Calidad de Agua",
  despacho:"Despacho",
  desinfeccion:"Desinfección",
  algas:"Lab. Algas",
  salas:"Maduración · Salas",
  tanques:"Maduración · Tanques",
  lotes:"Maduración · Lotes"
};
function renderFicha(fid){
  const fn = {
    calidad:  renderCalidad,
    plg:      renderPlg,
    params:   renderParams,
    poblacion:renderPoblacion,
    calagua:  renderCalidadAgua,
    despacho: renderDespacho,
    desinfeccion: renderDesinfeccion,
    algas:    renderAlgas
  }[fid];
  if(fn){
    fn();
    // Asocia labels↔inputs del panel recién renderizado (a11y).
    // No altera names ni handlers: el sistema de sincronización lee
    // `name` y los onclick siguen funcionando como antes.
    fixupLabels(document.getElementById("fp-"+fid));
  }
}

function clearFicha(fid){
  if(!ALL_FICHAS.includes(fid)) return;
  const label = FICHA_LABELS[fid] || fid;
  if(!confirm("¿Borrar todos los datos de " + label + "?\nEsto no afecta lo ya enviado a Google Sheets.")) return;
  localStorage.removeItem(skey(curMod, fid));
  _invalidateLoadE(skey(curMod, fid));
  _formDirty = false;            // R3: ya no hay datos sin guardar en esta ficha
  toast("Datos de " + label + " borrados","ok");
  renderFicha(fid);
  updateDots(); updateSyncUI();
}

/* ══════════════════════════════════════════
   ACCIONES SOBRE EL HISTORIAL LAB. ALGAS
══════════════════════════════════════════ */
function addToAlgHist(){
  if(!isLabMod(curMod)) return;
  const data = collect("algas");
  // R2: bloquea si hay valores fuera del rango declarado (ej. Lote 1–30, Día 0–5).
  if(_rangeGuard()) return;
  if(!validateFicha("algas", data)) return;
  // Mínimo: requiere fecha o cel_ml
  const hasMin = ["fecha","cel_ml"].some(k => data[k] !== undefined && data[k] !== "");
  if(!hasMin){
    toast("Ingresa al menos la Fecha o las Cel/mL antes de agregar al historial.","warn",4000);
    return;
  }

  // ── Modo edición: actualiza la entrada existente en el historial ──
  if(_algEditingId){
    const list = loadAlgHist();
    const idx  = list.findIndex(h => h.id === _algEditingId);
    if(idx >= 0){
      list[idx] = { id: list[idx].id, ts: Date.now(), data: data };
      saveAlgHist(list);
      _algEditingId = null;
      const preserved = {
        fecha:        data.fecha        || today(),
        corrida_larv: data.corrida_larv || "",
        modulo_larv:  data.modulo_larv  || "",
        tec:          data.tec          || gcfg("tec","")
      };
      saveE(curMod, "algas", preserved, false);
      toast("✅ Registro actualizado en el historial · "+list.length+"/"+ALGHIST_MAX,"ok",4000);
      renderAlgas();
      updateDots(); updateSyncUI();
      return;
    }
    // ID obsoleto (eliminado en otra ventana) — cae al flujo normal de push
    _algEditingId = null;
  }

  if(!pushAlgHist(data)) return;
  // Limpia el slot single-record y reinicia el formulario, conservando sólo
  // Fecha / Corrida_Larv / Modulo_Larv / Técnico para acelerar la siguiente entrada
  const preserved = {
    fecha:        data.fecha        || today(),
    corrida_larv: data.corrida_larv || "",
    modulo_larv:  data.modulo_larv  || "",
    tec:          data.tec          || gcfg("tec","")
  };
  saveE(curMod, "algas", preserved, false);
  const nNow = loadAlgHist().length;
  toast("✅ Agregado al historial · "+nNow+"/"+ALGHIST_MAX+" pendiente(s) de sincronizar","ok",4000);
  renderAlgas();
  updateDots(); updateSyncUI();
}

// ── Editar un registro del Historial Lab. Algas ──
// Vuelca la data al formulario y marca _algEditingId para que el siguiente
// "Agregar al historial" ACTUALICE esa entrada en lugar de duplicarla.
function editAlgHistEntry(id){
  if(!isLabMod(curMod)) return;
  const list = loadAlgHist();
  const entry = list.find(h => h.id === id);
  if(!entry){ toast("Registro no encontrado en el historial","warn"); return; }
  _algEditingId = id;
  saveE(curMod, "algas", Object.assign({}, entry.data), false);
  renderAlgas();
  // Lleva al usuario al inicio del formulario para que vea los campos cargados
  try{
    const fp = document.getElementById("fp-algas");
    if(fp) fp.scrollIntoView({behavior:"smooth", block:"start"});
  }catch(_){}
  toast("✏️ Editando registro del historial · al pulsar 💾 se ACTUALIZARÁ esa entrada","info",5500);
}

// ── Cancelar la edición en curso ──
function cancelAlgEdit(){
  if(!_algEditingId){ return; }
  _algEditingId = null;
  // Resetea el formulario conservando sólo los campos cabecera
  const cur = collect("algas") || {};
  const preserved = {
    fecha:        cur.fecha        || today(),
    corrida_larv: cur.corrida_larv || "",
    modulo_larv:  cur.modulo_larv  || "",
    tec:          cur.tec          || gcfg("tec","")
  };
  saveE(curMod, "algas", preserved, false);
  toast("Edición cancelada","info",2200);
  renderAlgas();
}

function removeAlgHistConfirm(id){
  if(!confirm("¿Eliminar este registro del historial?\nNo afecta a registros ya sincronizados.")) return;
  removeAlgHistById(id);
  toast("Registro eliminado del historial","ok",2500);
  renderAlgas();
  updateDots(); updateSyncUI();
}

function clearAlgHistConfirm(){
  const list = loadAlgHist();
  if(list.length === 0){ toast("El historial ya está vacío","info",2000); return; }
  if(!confirm("¿Vaciar TODO el historial? Se perderán "+list.length+" registro(s) que aún no fueron sincronizados.")) return;
  clearAlgHist();
  toast("Historial vaciado","ok",2500);
  renderAlgas();
  updateDots(); updateSyncUI();
}

/* ══════════════════════════════════════════
   RENDER ALL FICHAS
══════════════════════════════════════════ */
function renderAll(){
  if(isLabMod(curMod)){
    renderAlgas();
    updateDots();
    selTab("algas");
  } else if(isMadMod(curMod)){
    MAD_FICHAS.forEach(f => renderMad(f));
    updateDots();
    selTab("salas");
  } else if(isBioMod(curMod)){
    // selTab("biomol") YA renderiza la grilla → evita un render doble al entrar
    // (cada render parsea localStorage; en equipos lentos el doble render se
    //  percibía como “congelamiento” al abrir el módulo).
    updateDots();
    selTab("biomol");
  } else if(isAstMod(curMod)){
    updateDots();
    selTab("ast");          // selTab("ast") ya renderiza → sin render doble
  } else if(isMicMod(curMod)){
    micDispatchNuevo();
    updateDots();
    selTab("micnuevo");
  } else {
    STD_FICHAS_ALL.forEach(fid => renderFicha(fid));
    updateDots();
    selTab("calidad");
  }
}

/* ── FICHA 1: CALIDAD LARVARIA ─────────────
   HTML fields → Google Sheet "Datos Larvicultura" col mapping:
   e_i   → Estadío
   ll_i  → Intestino_Lleno   sl_i → Intestino_Semilleno  va_i → Intestino_Vacio
   df_i  → Deformidad        rt_i → Retraso               mo_i → % Mortalidad
   hg_i  → Hongos            nv_i → % No_viables          op_i → % Opacidad
   lp_i  → Lípidos           fl_i  → Flácidez
   nc_i  → Necrosis          cb_i → Canibalismo            pr_i → Parásitos
   cos_i → % Actividad       es_i → Estrés
────────────────────────────────────────── */
function renderCalidad(){
  const fp = document.getElementById("fp-calidad");
  // Render NATIVO (módulo ES src/views/registros/fichas/calidad.render.js).
  // Guardado/sync/mayúsculas: del motor vía delegación (data-*); herencia:
  // resolveCalidadData reutilizando _inheritShared/_inheritPerTank/getCorr/gcfg.
  if(!fp || !window.__rgLib || typeof window.__rgLib.renderCalidadFicha !== "function") return;
  const _e = loadE(curMod,"calidad");
  const _saved = _e ? _e.data : {};
  const _data = (typeof window.__rgLib.resolveCalidadData === "function")
    ? window.__rgLib.resolveCalidadData({ saved: _saved, mod: curMod, tankCount: TQS, engine: window })
    : _saved;
  const _lr = (typeof loadRecovery === "function") ? loadRecovery(curMod,"calidad") : null;
  fp.innerHTML = window.__rgLib.renderCalidadFicha({
    data: _data,
    modLabel: mLabel(curMod),
    status: getStatus(curMod,"calidad"),
    today: today(),
    now: nowT(),
    lastSaved: _e ? new Date(_e.updatedAt).toLocaleString("es-EC") : "—",
    recover: _lr ? { label: new Date(_lr.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}) } : null,
  });
}

/* ── FICHA 2: PL GRAMO EXTERNO ─────────────
   pg_i  → Plg (col 24 "Datos Larvicultura")
   pgm_i → Plg manual (col 25)
   lt_i  → Lote (col 7)
   Talla eliminada del schema (ya no se registra ni envía).
────────────────────────────────────────── */
function renderPlg(){
  const fp = document.getElementById("fp-plg");
  // Render NATIVO (módulo ES fichas/plg.render.js). Ver renderCalidad.
  if(!fp || !window.__rgLib || typeof window.__rgLib.renderPlgFicha !== "function") return;
  const _e = loadE(curMod,"plg");
  const _saved = _e ? _e.data : {};
  const _data = (typeof window.__rgLib.resolvePlgData === "function")
    ? window.__rgLib.resolvePlgData({ saved: _saved, mod: curMod, tankCount: TQS, engine: window })
    : _saved;
  const _lr = (typeof loadRecovery === "function") ? loadRecovery(curMod,"plg") : null;
  fp.innerHTML = window.__rgLib.renderPlgFicha({
    data: _data,
    modLabel: mLabel(curMod),
    status: getStatus(curMod,"plg"),
    today: today(),
    lastSaved: _e ? new Date(_e.updatedAt).toLocaleString("es-EC") : "—",
    recover: _lr ? { label: new Date(_lr.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}) } : null,
  });
}

/* ── FICHA 3: PARÁMETROS ───────────────────
   od_i_t → OD  (col 5 "Control_Tanque")
   tc_i_t → Temperatura (col 6)
   obs    → Observacion (col 7, first row only)
────────────────────────────────────────── */
function renderParams(){
  const fp = document.getElementById("fp-params");
  // Render NATIVO (módulo ES fichas/params.render.js). Ver renderCalidad.
  // PTIMES se pasa explícito; chkParamAll() aplica las alertas a lo pre-rellenado.
  if(!fp || !window.__rgLib || typeof window.__rgLib.renderParamsFicha !== "function") return;
  const _e = loadE(curMod,"params");
  const _saved = _e ? _e.data : {};
  const _data = (typeof window.__rgLib.resolveParamsData === "function")
    ? window.__rgLib.resolveParamsData({ saved: _saved, mod: curMod, engine: window })
    : _saved;
  const _lr = (typeof loadRecovery === "function") ? loadRecovery(curMod,"params") : null;
  fp.innerHTML = window.__rgLib.renderParamsFicha({
    data: _data,
    modLabel: mLabel(curMod),
    times: PTIMES,
    tankCount: TQS,
    status: getStatus(curMod,"params"),
    today: today(),
    lastSaved: _e ? new Date(_e.updatedAt).toLocaleString("es-EC") : "—",
    recover: _lr ? { label: new Date(_lr.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}) } : null,
  });
  chkParamAll();
}

/* ── Alertas OD/°C fuera de rango ────────
   OD: alerta si < 3 o > 10
   °C: alerta si < 20 o > 40
   Fondo rojo suave, valor legible.
────────────────────────────────────────── */
function chkParam(el, lo, hi){
  if(el.value === ""){
    el.classList.remove("pinp-alert"); return;
  }
  const v = parseFloat(el.value);
  if(!isFinite(v)){ el.classList.remove("pinp-alert"); return; }
  el.classList.toggle("pinp-alert", v < lo || v > hi);
}
function chkParamAll(){
  const fp = document.getElementById("fp-params");
  if(!fp) return;
  fp.querySelectorAll('input[name^="od_"]').forEach(el => chkParam(el, 3, 10));
  fp.querySelectorAll('input[name^="tc_"]').forEach(el => chkParam(el, 20, 40));
}

/* ── FICHA 4: POBLACIÓN ────────────────────
   po_i  → Población (col 6 "Datos Larvicultura")
   sv_i  → Supervivencia (col 4)
   lt_i  → Lote (col 7, used if PLG has no lote)
   e_i   → Estadío (col 8, used if Calidad has no estadio)
   sal_i → Salinidad (col 27)
   mort_d→ LOCAL ONLY — not sent to Google Sheets
────────────────────────────────────────── */
function renderPoblacion(){
  const fp = document.getElementById("fp-poblacion");
  // Render NATIVO (módulo ES fichas/poblacion.render.js). Ver renderCalidad.
  // Pasa CS (loadCS); rcPob() rellena los computados (totales, sv auto, mort_d).
  if(!fp || !window.__rgLib || typeof window.__rgLib.renderPoblacionFicha !== "function") return;
  const _e = loadE(curMod,"poblacion");
  const _saved = _e ? _e.data : {};
  const _data = (typeof window.__rgLib.resolvePoblacionData === "function")
    ? window.__rgLib.resolvePoblacionData({ saved: _saved, mod: curMod, tankCount: TQS, engine: window })
    : _saved;
  const _lr = (typeof loadRecovery === "function") ? loadRecovery(curMod,"poblacion") : null;
  fp.innerHTML = window.__rgLib.renderPoblacionFicha({
    data: _data,
    modLabel: mLabel(curMod),
    cs: (typeof loadCS === "function") ? loadCS(curMod) : {},
    tankCount: TQS,
    status: getStatus(curMod,"poblacion"),
    today: today(),
    now: nowT(),
    lastSaved: _e ? new Date(_e.updatedAt).toLocaleString("es-EC") : "—",
    recover: _lr ? { label: new Date(_lr.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}) } : null,
  });
  rcPob();
}

function rcPob(){
  const fp = document.getElementById("fp-poblacion");
  if(!fp) return;
  let tot=0;
  const cs = loadCS(curMod);
  for(let i=0;i<TQS;i++){
    const el=fp.querySelector(`[name="po_${i}"]`);
    if(el && el.value) tot += parseFloat(el.value)||0;
  }
  _calcSvFromCS(fp, cs);
  const realTot = tot * 1000;
  const td=document.getElementById("td-tot"), inp=document.getElementById("inp-tot");
  if(td){
    // Reutiliza los nodos hijos para evitar crear/destruir DOM en cada
    // keystroke de Población (rcPob se invoca por cada input). Si es la
    // primera vez se construye [textNode, <span class="td-tot-real">];
    // las llamadas siguientes sólo mutan los textos.
    let txt  = td.firstChild;
    let span = td.querySelector(":scope > span.td-tot-real");
    if(!txt || txt.nodeType !== 3 || !span){
      td.textContent = "";
      txt = document.createTextNode("");
      span = document.createElement("span");
      span.className = "td-tot-real";
      span.style.cssText = "font-size:9px;color:#0f766e;font-weight:400";
      td.appendChild(txt);
      td.appendChild(span);
    }
    txt.nodeValue = tot.toLocaleString("es-EC");
    span.textContent = " (→ " + realTot.toLocaleString("es-EC",{minimumFractionDigits:2}) + " real)";
  }
  if(inp) inp.value=tot;

  // ── % Sobrevivencia Global = (Σ po_i / Σ si_i) × 100 ──
  // Solo se calcula si hay datos de CS (cantidad sembrada).
  let totSi = 0;
  Object.keys(cs).forEach(k=>{
    if(!k.startsWith("si_")) return;
    const v = parseFloat(cs[k]);
    if(isFinite(v) && v > 0) totSi += v;
  });
  // ── CTA Sembrada (= Σ si_i) ──
  // Se refresca AQUÍ (no solo en el render) para que sea consistente en cada
  // recálculo: al volver a la pestaña (selTab llama rcPob, no renderPoblacion)
  // o al teclear población. Antes quedaba con el valor del último render y, si
  // la CS se guardó después, podía verse vacío hasta re-renderizar.
  const ctaEl = fp.querySelector('[name="cta"]');
  if(ctaEl) ctaEl.value = totSi > 0 ? totSi : "";
  const sobrevEl = fp.querySelector('[name="sobrev"]');
  if(sobrevEl){
    if(totSi > 0 && tot > 0){
      const sobrev = (tot / totSi) * 100;
      sobrevEl.value = isFinite(sobrev) ? (Math.round(Math.min(sobrev, 999.99) * 100) / 100).toFixed(2) : "";
    } else {
      sobrevEl.value = "";
    }
  }

  // ── % Mort. Diaria = promedio de mo_i desde la ficha Calidad ──
  // Lee primero desde el DOM (valores en vivo aunque no se hayan guardado)
  // y cae al storage para los tanques sin input visible. Si no hay datos,
  // el campo queda vacío.
  const calFp = document.getElementById("fp-calidad");
  const calData = (loadE(curMod, "calidad") || {data:{}}).data;
  let sumMo = 0, nMo = 0;
  for(let i=0;i<TQS;i++){
    let v = NaN;
    if(calFp){
      const moEl = calFp.querySelector(`[name="mo_${i}"]`);
      if(moEl && moEl.value !== "") v = parseFloat(moEl.value);
    }
    if(!isFinite(v) && calData["mo_"+i] !== undefined && calData["mo_"+i] !== ""){
      v = parseFloat(calData["mo_"+i]);
    }
    if(isFinite(v) && v >= 0){ sumMo += v; nMo++; }
  }
  const mortEl = fp.querySelector('[name="mort_d"]');
  if(mortEl){
    mortEl.value = nMo > 0 ? (Math.round((sumMo / nMo) * 100) / 100).toFixed(2) : "";
  }
}

/* ══════════════════════════════════════════
   CALIDAD DE AGUA · COLUMNA "COLOR" (antes "% Transparencia")
   ──────────────────────────────────────────
   El campo `tr_i` pasó de numérico (% transparencia) a un COLOR por tanque,
   elegido de una lista. Al Google Sheet va SOLO el nombre del color elegido
   (la columna se renombra a "Color"). Junto al selector se muestra un cuadrito
   con el tono de referencia (solo visual; NO se envía).
   El menú es DINÁMICO por estadío: ofrece el color "normal" del estadío de ese
   tanque + los colores que aparecen ante algún problema. Estadío vacío →
   ofrece todos los normales. Estadío fuera del mapa (p.ej. PL14+) → "Café".
══════════════════════════════════════════ */
// Color "normal" por estadío (clave en MAYÚSCULAS).
const AGUA_NORMAL_COLOR = (function(){
  const m = {};
  ["N5","Z1","PL11","PL12","PL13"].forEach(s => m[s] = "Café claro");
  ["Z2","PL1"].forEach(s => m[s] = "Café oscuro");
  ["Z3","M1"].forEach(s => m[s] = "Café verdoso");
  ["M2","M3"].forEach(s => m[s] = "Oliva parduzco");
  ["PL2","PL3","PL4","PL5","PL6","PL7","PL8","PL9","PL10"].forEach(s => m[s] = "Café");
  return m;
})();
const AGUA_ALL_NORMALS    = ["Café claro","Café oscuro","Café verdoso","Oliva parduzco","Café"];
// Colores que pueden aparecer ante un problema/situación (siempre disponibles).
const AGUA_PROBLEM_COLORS = ["Café rojizo","Blanco lechoso","Negro verdoso","Transparente","Café amarillento","Naranja oscuro","Café rojizo oscuro","Café petróleo"];
// Tono de referencia por nombre (aprox. al color del agua; NO va al Sheet).
const AGUA_COLOR_HEX = {
  "Café claro":         "#C9A66B",
  "Café oscuro":        "#5B3A1A",
  "Café verdoso":       "#6C6B3B",
  "Oliva parduzco":     "#6F6A2E",
  "Café":               "#8B5A2B",
  "Café rojizo":        "#8C3B27",
  "Blanco lechoso":     "#ECEAE0",
  "Negro verdoso":      "#1E2A20",
  "Transparente":       "#DCEFEF",
  "Café amarillento":   "#C3A140",
  "Naranja oscuro":     "#C2521B",
  "Café rojizo oscuro": "#5E241A",
  "Café petróleo":      "#2C3A34"
};
// Color normal del estadío: "" si no hay estadío; "Café" si no está mapeado.
function aguaNormalColor(estadio){
  const s = String(estadio||"").toUpperCase().trim();
  if(!s) return "";
  return AGUA_NORMAL_COLOR[s] || "Café";
}
// Opciones del menú de color para un estadío (sin duplicados, normal primero).
// "Café" SIEMPRE está disponible en todos los estadíos/duplas (Z1-Z2, M1-M2…),
// aunque no sea el color normal del estadío (pedido del usuario). El de-dup
// evita repetirlo cuando ya es el normal.
function aguaColorOptions(estadio){
  const normal = aguaNormalColor(estadio);
  const base = normal ? [normal, "Café", ...AGUA_PROBLEM_COLORS]
                      : [...AGUA_ALL_NORMALS, ...AGUA_PROBLEM_COLORS];
  const seen = new Set(), out = [];
  base.forEach(c => { if(!seen.has(c)){ seen.add(c); out.push(c); } });
  return out;
}
// HTML del selector de color + cuadrito de tono (reutilizable: ficha y Blanco).
function aguaColorSelectHtml(i, estRaw, curVal){
  const opts = aguaColorOptions(estRaw);
  // Conserva una selección previa aunque no figure en las opciones del estadío
  // actual (p.ej. dato antiguo o color de otro estadío) para no perderla.
  const optsFull = (curVal && opts.indexOf(curVal) === -1) ? [curVal, ...opts] : opts;
  const optsHtml = `<option value="">—</option>` + optsFull.map(c =>
    `<option value="${escapeHtml(c)}"${c===curVal?" selected":""}>${escapeHtml(c)}</option>`).join("");
  const hex = AGUA_COLOR_HEX[curVal] || "transparent";
  return `<div style="display:flex;align-items:center;gap:6px;min-width:150px">
    <select name="tr_${i}" onchange="aguaColorSwatch(this)" style="flex:1;min-width:96px">${optsHtml}</select>
    <span class="agua-swatch" title="Tono de referencia (no se envía)" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--bdr2);flex-shrink:0;background:${hex}"></span>
  </div>`;
}
// Actualiza el cuadrito de tono al cambiar el color elegido (element-relative,
// sirve para la ficha y para Blanco — no depende de ids).
function aguaColorSwatch(selEl){
  if(!selEl || !selEl.parentNode) return;
  const sw = selEl.parentNode.querySelector(".agua-swatch");
  if(sw) sw.style.background = AGUA_COLOR_HEX[selEl.value] || "transparent";
}
// Reconstruye el menú de color de la fila al cambiar el estadío de ese tanque,
// preservando la selección actual. Se invoca desde el onchange del estadío.
function aguaSyncRowColor(estEl){
  const tr = estEl && estEl.closest ? estEl.closest("tr") : null;
  if(!tr) return;
  const sel = tr.querySelector('select[name^="tr_"]');
  if(!sel) return;
  const estRaw = String(estEl.value||"").toUpperCase().trim();
  const cur = sel.value;
  const opts = aguaColorOptions(estRaw);
  const optsFull = (cur && opts.indexOf(cur) === -1) ? [cur, ...opts] : opts;
  sel.innerHTML = `<option value="">—</option>` + optsFull.map(c =>
    `<option value="${escapeHtml(c)}"${c===cur?" selected":""}>${escapeHtml(c)}</option>`).join("");
  sel.value = cur;
  aguaColorSwatch(sel);
}

/* ── FICHA: CALIDAD DE AGUA ────────────────
   Columnas que se envían a la hoja "Datos Larvicultura - M0X" (48 cols):
   col 8  → Estadío (compartida, 0-indexed)
   col 42 → Cel/ml          (cm_i)
   col 43 → Color           (tr_i — antes "% Transparencia")
   col 44 → % Espuma        (ep_i)
   col 45 → % Suciedad      (sc_i)
   col 46 → % Recambio      (rc_i)
   col 47 → Observaciones   (ob_i)
────────────────────────────────────────── */
function renderCalidadAgua(){
  const fp = document.getElementById("fp-calagua");
  if(!fp) return;
  // Render NATIVO (módulo ES fichas/calagua.render.js). Ver renderCalidad.
  // La columna Color reutiliza aguaColorSelectHtml (inyectado como colorSelect).
  if(!window.__rgLib || typeof window.__rgLib.renderCalaguaFicha !== "function") return;
  const _e = loadE(curMod,"calagua");
  const _saved = _e ? _e.data : {};
  const _data = (typeof window.__rgLib.resolveCalaguaData === "function")
    ? window.__rgLib.resolveCalaguaData({ saved: _saved, mod: curMod, tankCount: TQS, engine: window })
    : _saved;
  const _lr = (typeof loadRecovery === "function") ? loadRecovery(curMod,"calagua") : null;
  fp.innerHTML = window.__rgLib.renderCalaguaFicha({
    data: _data,
    modLabel: mLabel(curMod),
    tankCount: TQS,
    status: getStatus(curMod,"calagua"),
    today: today(),
    lastSaved: _e ? new Date(_e.updatedAt).toLocaleString("es-EC") : "—",
    recover: _lr ? { label: new Date(_lr.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}) } : null,
    colorSelect: (typeof aguaColorSelectHtml === "function") ? aguaColorSelectHtml : undefined,
  });
}

/* ── FICHA 5: DESPACHO ─────────────────────
   Columnas que se envían a la hoja "Datos Larvicultura - M0X" (48 cols):
   col 8  → Estadío (compartida — desp tiene prioridad si está lleno)
   col 37 → Densidad cosechada       (dc_i)
   col 38 → Biomasa                  (bm_i)
   col 39 → Cajas/Tinas              (cj_i, manual)
   col 40 → Destino                  (de_i, select)
   col 41 → Piscina                  (ps_i, texto)
   Eliminadas del sheet: Cant. Cosechada 1/2/3/total.
────────────────────────────────────────── */
function renderDespacho(){
  const fp = document.getElementById("fp-despacho");
  if(!fp) return;
  // Render NATIVO (módulo ES fichas/despacho.render.js). Ver renderCalidad.
  // Pasa CS/TON/DESTINO_OPTS; rcDesp* llenan los computados tras render.
  if(!window.__rgLib || typeof window.__rgLib.renderDespachoFicha !== "function") return;
  const _e = loadE(curMod,"despacho");
  const _saved = _e ? _e.data : {};
  const _data = (typeof window.__rgLib.resolveDespachoData === "function")
    ? window.__rgLib.resolveDespachoData({ saved: _saved, mod: curMod, tankCount: TQS, engine: window })
    : _saved;
  const _lr = (typeof loadRecovery === "function") ? loadRecovery(curMod,"despacho") : null;
  fp.innerHTML = window.__rgLib.renderDespachoFicha({
    data: _data,
    modLabel: mLabel(curMod),
    cs: (typeof loadCS === "function") ? loadCS(curMod) : {},
    ton: (typeof loadTON === "function") ? loadTON(curMod) : {},
    destinos: (typeof DESTINO_OPTS !== "undefined") ? DESTINO_OPTS : [],
    tankCount: TQS,
    status: getStatus(curMod,"despacho"),
    today: today(),
    now: nowT(),
    lastSaved: _e ? new Date(_e.updatedAt).toLocaleString("es-EC") : "—",
    recover: _lr ? { label: new Date(_lr.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}) } : null,
  });
  rcDespBiomasa();
  rcDespDensidad();
}

// Calcula % supervivencia = (po / si) × 100 para cada tanque del panel dado.
function _calcSvFromCS(fp, cs){
  if(!fp) return;
  for(let i=0;i<TQS;i++){
    const svEl = fp.querySelector(`[name="sv_${i}"]`);
    const poEl = fp.querySelector(`[name="po_${i}"]`);
    const siVal = cs["si_"+i];
    const si = parseFloat(siVal);
    const hasSi = (siVal !== undefined && siVal !== "" && siVal !== null && isFinite(si) && si > 0);
    if(svEl && hasSi){
      const po = poEl && poEl.value !== "" ? parseFloat(poEl.value) : NaN;
      if(isFinite(po) && po >= 0){
        const pct = Math.min((po / si) * 100, 999.99);
        svEl.value = isFinite(pct) && pct >= 0 ? (Math.round(pct * 100) / 100).toFixed(2) : "";
      } else {
        svEl.value = "";
      }
    } else if(svEl && !hasSi && svEl.readOnly){
      // El tanque tenía CS (campo % en modo auto/readonly) pero la CS se quitó
      // sin re-render: limpia el % calculado para no dejar un valor obsoleto.
      // No afecta a campos manuales (esos nunca son readonly).
      svEl.value = "";
    }
  }
}

// Auto-cálculo de % Supervivencia en Despacho.
function rcDespSv(){
  _calcSvFromCS(document.getElementById("fp-despacho"), loadCS(curMod));
}

// Auto-cálculo de Biomasa en Despacho = Población (×1000) ÷ PLG (manual),
// redondeado sin decimales. Reutilizable para la ficha principal y el Blanco.
// Si falta la población o el PLG (manual) es 0/inválido, la celda queda vacía.
function _calcDespBiomasa(fp){
  if(!fp) return;
  for(let i=0;i<TQS;i++){
    const poEl  = fp.querySelector(`[name="po_${i}"]`);
    const pgmEl = fp.querySelector(`[name="pgm_${i}"]`);
    const bmEl  = fp.querySelector(`[name="bm_${i}"]`);
    if(!bmEl) continue;
    const po  = (poEl  && poEl.value  !== "") ? parseFloat(poEl.value)  : NaN;
    const pgm = (pgmEl && pgmEl.value !== "") ? parseFloat(pgmEl.value) : NaN;
    if(isFinite(po) && isFinite(pgm) && pgm > 0){
      const bm = Math.round((po * 1000) / pgm);
      bmEl.value = isFinite(bm) ? bm : "";
    } else {
      bmEl.value = "";
    }
  }
}
function rcDespBiomasa(){ _calcDespBiomasa(document.getElementById("fp-despacho")); }
function rcBlancoDespBiomasa(){ _calcDespBiomasa(document.getElementById("fp-blanco")); }

// Densidad cosechada por tanque = Población (×1000) ÷ Toneladas (TON), entero.
// Solo lectura: se autocalcula desde la Población del tanque y el registro TON.
// Si falta la población o la tonelada del tanque (o es 0), la celda queda vacía.
function _calcDespDensidad(fp, ton){
  if(!fp) return;
  const t = ton || {};
  for(let i=0;i<TQS;i++){
    const poEl = fp.querySelector(`[name="po_${i}"]`);
    const dcEl = fp.querySelector(`[name="dc_${i}"]`);
    if(!dcEl) continue;
    const po  = (poEl && poEl.value !== "") ? parseFloat(poEl.value) : NaN;
    const ton_i = parseFloat(t["ton_"+i]);
    if(isFinite(po) && isFinite(ton_i) && ton_i > 0){
      const dc = Math.round((po * 1000) / ton_i);
      dcEl.value = isFinite(dc) ? dc : "";
    } else {
      dcEl.value = "";
    }
  }
}
function rcDespDensidad(){ _calcDespDensidad(document.getElementById("fp-despacho"), loadTON(curMod)); }

/* ══════════════════════════════════════════
   CANTIDAD SEMBRADA (CS) — población inicial
   por tanque, persistida solo en localStorage
   por módulo. Se usa para autocalcular % de
   supervivencia en Población y Despacho.
   No se envía a Google Sheets.
══════════════════════════════════════════ */
function csKey(m){ return CS_PRE + mLabel(m); }
function loadCS(m){
  try{
    const raw = localStorage.getItem(csKey(m));
    if(!raw) return {};
    const obj = JSON.parse(raw);
    if(!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    return obj;
  }catch(x){ return {}; }
}
function saveCS(m, data){
  try{ localStorage.setItem(csKey(m), JSON.stringify(data || {})); }
  catch(x){ toast("No se pudo guardar (espacio insuficiente)","err"); }
}
function clearCS(m){
  try{ localStorage.removeItem(csKey(m)); }catch(x){}
}

function openCS(){
  if(curMod === null || curMod === undefined) return;
  const lbl = document.getElementById("cs-modlabel");
  if(lbl) lbl.textContent = mLabel(curMod);
  const _rp = document.getElementById("cs-recalc-panel"); if(_rp) _rp.innerHTML = "";
  renderCSRows();
  document.getElementById("cs-ov").classList.add("open");
}
function closeCS(){ document.getElementById("cs-ov").classList.remove("open"); }
function closeCSOut(ev){ if(ev.target===document.getElementById("cs-ov")) closeCS(); }

function renderCSRows(){
  const tbody = document.getElementById("cs-tbody");
  if(!tbody) return;
  const cs   = loadCS(curMod);
  const _tqn = loadTqNames(curMod);
  let html = "";
  for(let i=0;i<TQS;i++){
    const v = (cs["si_"+i] !== undefined && cs["si_"+i] !== null) ? cs["si_"+i] : "";
    html += `<tr>
      <td class="cs-tqc">${tqCell(curMod,i,_tqn)}</td>
      <td><input type="number" name="cs_si_${i}" value="${v===""?"":escapeHtml(v)}"
            min="0" step="any" placeholder="Ej: 4300"
            oninput="csRowChange(${i})" title="En miles. Ej: 4300 = 4.300.000"></td>
      <td class="cs-real" id="cs-real-${i}">${v===""?"—":((parseFloat(v)||0)*1000).toLocaleString("es-EC",{minimumFractionDigits:2})}</td>
    </tr>`;
  }
  tbody.innerHTML = html;
  csUpdateSummary();
  csUpdateClearBtn();
}
function csRowChange(i){
  const el = document.querySelector(`[name="cs_si_${i}"]`);
  const cell = document.getElementById("cs-real-"+i);
  if(cell){
    const v = el && el.value !== "" ? (parseFloat(el.value)||0)*1000 : null;
    cell.textContent = v === null ? "—" : v.toLocaleString("es-EC",{minimumFractionDigits:2});
  }
  csUpdateSummary();
}
function csUpdateSummary(){
  const sum = document.getElementById("cs-summary");
  if(!sum) return;
  let tot=0, n=0;
  for(let i=0;i<TQS;i++){
    const el = document.querySelector(`[name="cs_si_${i}"]`);
    if(el && el.value !== ""){
      const v = parseFloat(el.value);
      if(isFinite(v) && v > 0){ tot += v; n++; }
    }
  }
  sum.innerHTML = "Tanques con dato: <b>"+n+"</b> · Total inicial: <b>"+tot.toLocaleString("es-EC")+"</b> miles";
}
function csUpdateClearBtn(){
  const btn = document.getElementById("cs-clear-btn");
  if(!btn) return;
  const cs = loadCS(curMod);
  const has = Object.keys(cs).some(k => k.startsWith("si_") && cs[k] !== "" && cs[k] !== null && cs[k] !== undefined);
  btn.disabled = !has;
}
function saveCSData(){
  const prev = loadCS(curMod);   // CS anterior — para detectar si cambió
  const data = {};
  for(let i=0;i<TQS;i++){
    const el = document.querySelector(`[name="cs_si_${i}"]`);
    if(!el) continue;
    if(el.value === "") continue;
    const v = sanitizeNum(el.value, 0, 1e9);
    if(v === "" || v <= 0) continue;
    data["si_"+i] = v;
  }
  saveCS(curMod, data);
  toast("Cantidad sembrada guardada","ok",2200);
  // Re-renderiza la ficha de Población para reflejar el auto-cálculo
  if(curTab === "poblacion") renderPoblacion();
  // Si la CS cambió y hay días ya registrados de la corrida en curso, ofrecer el
  // recálculo retroactivo de supervivencia (deja el modal abierto con el panel).
  const scan = _recalcScan();
  if(_csChanged(prev, data) && scan.corr && scan.days.length){
    if(confirm("La Cantidad Sembrada cambió.\n¿Recalcular la supervivencia de "+scan.days.length+" día(s) ya registrados de la corrida "+scan.corr+" y reenviarlos a Google Sheets?\n(Los PDFs se regeneran luego a demanda, día por día.)")){
      recalcSurvivalForCorrida();   // mantiene el modal abierto y muestra resultados
      return;
    }
  }
  closeCS();
}
function clearCSData(){
  const cs = loadCS(curMod);
  const has = Object.keys(cs).some(k => k.startsWith("si_") && cs[k] !== "" && cs[k] !== null && cs[k] !== undefined);
  if(!has){ toast("No hay datos que borrar","info",2000); return; }
  if(!confirm("¿Borrar la cantidad sembrada de "+mLabel(curMod)+"?\nLa supervivencia dejará de calcularse automáticamente.")) return;
  clearCS(curMod);
  toast("Cantidad sembrada borrada","ok",2200);
  closeCS();
  if(curTab === "poblacion") renderPoblacion();
}

/* ══════════════════════════════════════════
   RECÁLCULO RETROACTIVO DE SUPERVIVENCIA  (solo Larvicultura estándar)
   Al cambiar la Cantidad Sembrada (población inicial), la supervivencia de los
   días YA registrados de la corrida en curso queda obsoleta (sv = po ÷ CS). Esta
   utilidad recalcula esos días desde el historial local de Población y los reenvía
   a Google Sheets (upsert Fecha+Módulo+Tanque; el GAS fusiona por columna, así que
   solo se actualiza la columna de supervivencia/población). Los PDFs se regeneran
   a demanda (no se puede editar un PDF ya guardado). NO requiere re-deploy del GAS.
══════════════════════════════════════════ */
let _recalcAffected = {};   // fecha -> snapshot de Población recalculado (para el PDF)
let _recalcStatus   = {};   // fecha -> estado de reenvío ("ok"|"err"|"…"|…)

// Compara dos mapas CS; true si algún si_i cambió.
function _csChanged(a, b){
  a = a || {}; b = b || {};
  for(let i=0;i<TQS;i++){
    const k = "si_"+i;
    const av = (a[k] == null ? "" : String(a[k]));
    const bv = (b[k] == null ? "" : String(b[k]));
    if(av !== bv) return true;
  }
  return false;
}

// Días recalculables de la corrida en curso (historial de Población + día de hoy).
function _recalcScan(){
  const out = { corr: String(getCorr(curMod) || "").trim(), days: [] };
  if(!out.corr) return out;
  const seen = {};
  loadHist(curMod).forEach(h=>{
    if(h.ficha === "poblacion" && String((h.data||{}).corrida||"").trim() === out.corr && h.fecha && !seen[h.fecha]){
      seen[h.fecha] = true; out.days.push(h.fecha);
    }
  });
  const eP = loadE(curMod, "poblacion");
  if(eP && String((eP.data||{}).corrida||"").trim() === out.corr){
    const f = eP.data.fecha || today();
    if(!seen[f]){ seen[f] = true; out.days.push(f); }
  }
  return out;
}

// Recalcula sv_i = po_i ÷ si (CS actual) en un objeto data de Población. La CS
// manda: solo toca tanques con po válido y si > 0. Devuelve true si algo cambió.
function _recalcSvInData(data, cs){
  let changed = false;
  for(let i=0;i<TQS;i++){
    const po = parseFloat(data["po_"+i]);
    const si = parseFloat(cs["si_"+i]);
    if(isFinite(po) && po >= 0 && isFinite(si) && si > 0){
      const nv = (Math.round(Math.min((po/si)*100, 999.99) * 100) / 100).toFixed(2);
      const cur = (data["sv_"+i] == null ? "" : String(data["sv_"+i]));
      if(cur !== nv){ data["sv_"+i] = nv; changed = true; }
    }
  }
  return changed;
}

async function recalcSurvivalForCorrida(){
  if(!isStdMod(curMod)){ toast("El recálculo de supervivencia solo aplica a Larvicultura","info",3000); return; }
  const cs = loadCS(curMod);
  if(!Object.keys(cs).some(k=> k.startsWith("si_") && parseFloat(cs[k]) > 0)){
    toast("No hay Cantidad Sembrada guardada para recalcular","warn",3500); return;
  }
  const scan = _recalcScan();
  if(!scan.corr){ toast("No hay una corrida activa para identificar los días","warn",3500); return; }
  if(!scan.days.length){ toast("No hay días de la corrida "+scan.corr+" en el historial","info",3500); return; }

  // 1) Recalcular en memoria: historial (snapshots) + día de hoy (loadE).
  _recalcAffected = {}; _recalcStatus = {};
  const fullHist = loadHist(curMod);
  let histChanged = false;
  fullHist.forEach(h=>{
    if(h.ficha === "poblacion" && String((h.data||{}).corrida||"").trim() === scan.corr && h.fecha){
      _recalcSvInData(h.data, cs) && (histChanged = true);
      _recalcAffected[h.fecha] = h.data;   // referencia (sirve también para el PDF)
    }
  });
  if(histChanged) saveHistList(curMod, fullHist);

  const eP = loadE(curMod, "poblacion");
  if(eP && String((eP.data||{}).corrida||"").trim() === scan.corr){
    _recalcSvInData(eP.data, cs);
    saveE(curMod, "poblacion", eP.data, getStatus(curMod,"poblacion") === "synced");
    _recalcAffected[eP.data.fecha || today()] = eP.data;   // el día de hoy gana su fecha
    if(curTab === "poblacion") try{ renderPoblacion(); }catch(_){}
  }

  const fechas = Object.keys(_recalcAffected).sort();
  // 2) Reenviar a Google Sheets (si hay URL configurada).
  const url = gasUrl();
  const canSync = !!(url && isValidGasUrl(url));
  _recalcRenderPanel(fechas, canSync ? "" : "Sin URL de Google Apps Script: se recalculó localmente, pero NO se reenvió. Configúrala y vuelve a pulsar 🔄.");
  if(canSync && syncRateOk()){
    for(const f of fechas){
      _recalcStatus[f] = "…"; _recalcRenderPanel(fechas, "");
      try{
        const payload = buildDatosPayload(curMod, ["poblacion"], { dataByFicha:{ poblacion:_recalcAffected[f] }, fecha:f });
        if(!payload.rows.length){ _recalcStatus[f] = "sin filas"; _recalcRenderPanel(fechas, ""); continue; }
        const sent = await postPayload(payload, url, { dedupeSalt:"recalc:"+mLabel(curMod)+":"+f });
        _recalcStatus[f] = sent ? "ok" : "err"; _recalcRenderPanel(fechas, "");
      }catch(_){ _recalcStatus[f] = "err"; _recalcRenderPanel(fechas, ""); }
    }
  }
  updateDots(); updateSyncUI();
  toast("🔄 Supervivencia recalculada para "+fechas.length+" día(s) de la corrida "+scan.corr, "ok", 4500);
}

function _recalcRenderPanel(fechas, note){
  const el = document.getElementById("cs-recalc-panel");
  if(!el) return;
  const rows = fechas.map(f=>{
    const st = _recalcStatus[f];
    const badge = st === "ok" ? '<span style="color:#15803d;font-weight:600">✔ reenviado</span>'
      : st === "err" ? '<span style="color:#b91c1c;font-weight:600">⚠ error de envío</span>'
      : st === "…" ? '<span style="color:#a16207">enviando…</span>'
      : st === "sin filas" ? '<span style="color:#6b7280">sin datos por tanque</span>'
      : '<span style="color:#6b7280">recalculado (local)</span>';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #eee">
      <span style="font-size:12px"><b>📅 ${escapeHtml(f)}</b> · ${badge}</span>
      <button class="btn bpdf" type="button" style="padding:3px 9px;font-size:11px" onclick="recalcDayPDF('${escapeHtml(f)}')">📄 PDF</button>
    </div>`;
  }).join("");
  el.innerHTML = `<div style="margin-top:12px;border-top:2px solid #ddd;padding-top:10px">
    <div style="font-weight:700;font-size:12.5px;margin-bottom:6px">🔄 Supervivencia recalculada · ${fechas.length} día(s)</div>
    ${note ? `<div style="font-size:11px;color:#b45309;margin-bottom:8px">${escapeHtml(note)}</div>` : ""}
    ${rows}
    <div style="font-size:10.5px;color:#6b7280;margin-top:8px">Pulsa 📄 para regenerar el PDF corregido de cada día (no se puede editar uno ya guardado).</div>
  </div>`;
}

function recalcDayPDF(fecha){
  const snap = _recalcAffected[fecha];
  if(!snap){ toast("No hay datos recalculados de ese día","warn",2500); return; }
  downloadPDF("poblacion", snap);
}

/* ══════════════════════════════════════════
   TONELADAS (Despacho) — modal por tanque
   Mismo patrón que CS: persistencia local por módulo, se conserva hasta que
   el usuario pulse "Borrar". Alimenta el auto-cálculo de Densidad cosechada.
══════════════════════════════════════════ */
function tonKey(m){ return TON_PRE + mLabel(m); }
function loadTON(m){
  try{
    const raw = localStorage.getItem(tonKey(m));
    if(!raw) return {};
    const obj = JSON.parse(raw);
    if(!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    return obj;
  }catch(x){ return {}; }
}
function saveTON(m, data){
  try{ localStorage.setItem(tonKey(m), JSON.stringify(data || {})); }
  catch(x){ toast("No se pudo guardar (espacio insuficiente)","err"); }
}
function clearTON(m){
  try{ localStorage.removeItem(tonKey(m)); }catch(x){}
}

function openTON(){
  if(curMod === null || curMod === undefined) return;
  const lbl = document.getElementById("ton-modlabel");
  if(lbl) lbl.textContent = mLabel(curMod);
  renderTONRows();
  document.getElementById("ton-ov").classList.add("open");
}
function closeTON(){ document.getElementById("ton-ov").classList.remove("open"); }
function closeTONOut(ev){ if(ev.target===document.getElementById("ton-ov")) closeTON(); }

function renderTONRows(){
  const tbody = document.getElementById("ton-tbody");
  if(!tbody) return;
  const ton  = loadTON(curMod);
  const _tqn = loadTqNames(curMod);
  let html = "";
  for(let i=0;i<TQS;i++){
    const v = (ton["ton_"+i] !== undefined && ton["ton_"+i] !== null) ? ton["ton_"+i] : "";
    html += `<tr>
      <td class="cs-tqc">${tqCell(curMod,i,_tqn)}</td>
      <td><input type="number" name="ton_in_${i}" value="${v===""?"":escapeHtml(v)}"
            min="0" step="any" placeholder="Ej: 0.85"
            oninput="tonUpdateSummary()" title="Toneladas cosechadas de este tanque"></td>
    </tr>`;
  }
  tbody.innerHTML = html;
  tonUpdateSummary();
  tonUpdateClearBtn();
}
function tonUpdateSummary(){
  const sum = document.getElementById("ton-summary");
  if(!sum) return;
  let tot=0, n=0;
  for(let i=0;i<TQS;i++){
    const el = document.querySelector(`[name="ton_in_${i}"]`);
    if(el && el.value !== ""){
      const v = parseFloat(el.value);
      if(isFinite(v) && v > 0){ tot += v; n++; }
    }
  }
  sum.innerHTML = "Tanques con dato: <b>"+n+"</b> · Total: <b>"+tot.toLocaleString("es-EC",{maximumFractionDigits:3})+"</b> ton";
}
function tonUpdateClearBtn(){
  const btn = document.getElementById("ton-clear-btn");
  if(!btn) return;
  const ton = loadTON(curMod);
  const has = Object.keys(ton).some(k => k.startsWith("ton_") && ton[k] !== "" && ton[k] !== null && ton[k] !== undefined);
  btn.disabled = !has;
}
function saveTONData(){
  const data = {};
  for(let i=0;i<TQS;i++){
    const el = document.querySelector(`[name="ton_in_${i}"]`);
    if(!el) continue;
    if(el.value === "") continue;
    const v = sanitizeNum(el.value, 0, 1e9);
    if(v === "" || v <= 0) continue;
    data["ton_"+i] = v;
  }
  saveTON(curMod, data);
  toast("Toneladas guardadas","ok",2200);
  closeTON();
  // Re-renderiza Despacho para reflejar el auto-cálculo de Densidad cosechada
  if(curTab === "despacho") renderDespacho();
}
function clearTONData(){
  const ton = loadTON(curMod);
  const has = Object.keys(ton).some(k => k.startsWith("ton_") && ton[k] !== "" && ton[k] !== null && ton[k] !== undefined);
  if(!has){ toast("No hay datos que borrar","info",2000); return; }
  if(!confirm("¿Borrar las toneladas de "+mLabel(curMod)+"?\nLa densidad cosechada dejará de calcularse automáticamente.")) return;
  clearTON(curMod);
  toast("Toneladas borradas","ok",2200);
  closeTON();
  if(curTab === "despacho") renderDespacho();
}


/* ══════════════════════════════════════════
   PDF DOWNLOAD — A4 con código verificador
══════════════════════════════════════════ */

// Contador monotónico (mod 0xFFFF) que se incorpora al seed para
// garantizar códigos distintos cuando dos genCodigo se invocan en el
// mismo milisegundo (p. ej. PDFs masivos por día desde Bitácora/Maduración).
let _genCodigoSeq = 0;
function genCodigo(fid, mod, fecha){
  _genCodigoSeq = (_genCodigoSeq + 1) & 0xFFFF;
  const ts   = Date.now();
  const seed = (ts & 0xFFFFFF) ^ (mod * 7919) ^ (fid.charCodeAt(0) * 1031) ^ (_genCodigoSeq * 31);
  const hex  = Math.abs(seed).toString(16).toUpperCase().padStart(6,'0').slice(-6);
  const abb  = {calidad:'CAL',plg:'PLG',params:'PAR',poblacion:'POB',calagua:'CAG',despacho:'DES',algas:'ALG',salas:'SAL',tanques:'TAN',lotes:'LOT',biomol:'BIO',ast:'AST',micnuevo:'MIC',calnuevo:'CDA',patnuevo:'PAT'}[fid]||'FIC';
  const d    = (fecha||today()).replace(/-/g,'');
  return abb + String(mod).padStart(2,'0') + '-' + d + '-' + hex;
}

/* ── Nombre por defecto del PDF al guardar ─────────────────
   Formato: <CL|PL|PA|PB>_<YYYY-MM-DD>_<MOD>[-<corrida>]
   Ej. CL_2026-04-05_M01-544
   Se usa ISO YYYY-MM-DD para que los archivos ordenen lexicográficamente
   en orden cronológico real (la versión anterior con D/M/YY rompía el
   sort: "10/1/26" aparecía antes de "2/1/26"). El "-" es un carácter
   válido en filename en cualquier OS y no necesita reemplazo del browser. */
function pdfFilename(fid, mod, fecha, corrida){
  const codes  = { calidad:'CL', plg:'PL', params:'PA', poblacion:'PB', calagua:'CA', despacho:'DP' };
  const code   = codes[fid] || 'FIC';
  const dStr   = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) ? fecha : today();
  const modStr = mLabel(mod);
  // Limpia chars que rompen filename en cualquier OS
  const cor    = sanitizeStr(corrida || '').replace(/[\\\/:*?"<>|]/g,'').trim();
  const corPart = cor ? '-' + cor : '';
  return code + '_' + dStr + '_' + modStr + corPart;
}

/* ══════════════════════════════════════════
   FICHA DESINFECCIÓN  (M01–M10 + CIO)
   ──────────────────────────────────────────
   Hoja Google Sheets: "Registro_Desinfección" (formato tidy, 1 fila por
   elemento). 4 Tipos de Registro; un selector cambia la grilla visible.
   Las 4 grillas conviven en la misma ficha/día (todas se guardan juntas).
   Clave de upsert (GAS): Fecha+Módulo+Tipo+Categoría+Elemento → [0,1,3,4,5].
══════════════════════════════════════════ */
const DESINF_SHEET = "Registro_Desinfección";
const DESINF_CODE  = "OMR-LAB-FOR-042";

// Estructura declarativa que dirige TANTO el render como el payload y el PDF.
// Un elemento puede ser:
//   "Texto"                      → nombre fijo
//   { name:"Texto", obs:"..." }  → nombre fijo + Observación pre-cargada (editable)
//   { otro:true }                → fila con nombre editable ("Otro:")
// cat.cols define qué controles se muestran: "estado" (—/Sí/No),
//   "fec" (Fecha del elemento → 9ª columna), "obs" (Observaciones).
// t.sign: "supervisor" (una firma) | "cosecha" (Supervisor de Cosecha + Administrador).
const DESINF_TYPES = [
  { n:1, label:"Limpieza y desinfección del área de cosecha", sign:"supervisor", cats:[
    { key:"materiales", label:"Materiales", cols:["estado","fec","obs"],
      elems:["Reservorio","Líneas de agua","Líneas de aire","Tanques","Plásticos","Baldes","Piedras difusoras","Tarrinas","Chayos","Mangueras","Filtros"] },
    { key:"personal", label:"Personal", cols:["estado","obs"],
      elems:["Botas","Manos","Ropa"] }
  ]},
  { n:2, label:"Desinfección de módulo larvicultura", sign:"supervisor", cats:[
    { key:"materiales", label:"Materiales", cols:["estado","obs"], elems:[
      { name:"Líneas de aire",        obs:"Uso 1 Litro Alcohol" },
      { name:"Líneas de agua salada", obs:"Uso 300 ppm cloro" },
      { name:"Cosechadores",          obs:"Solución cloro 100 ppm en 20 litros de agua dulce" },
      { name:"Mangueras de aire",     obs:"Solución cloro 100 ppm en 20 litros de agua dulce" },
      { name:"Mangueras",             obs:"Solución cloro 100 ppm en 20 litros de agua dulce" },
      { name:"Piedras difusoras",     obs:"Solución cloro 100 ppm en 20 litros de agua dulce" },
      { name:"Tarrinas",              obs:"Solución cloro 100 ppm en 20 litros de agua dulce" },
      { name:"Plásticos",             obs:"Solución cloro 100 ppm en 20 litros de agua dulce" },
      { name:"Tanques",               obs:"300 ppm cloro para limpieza de materia orgánica" }
    ] },
    { key:"personal", label:"Personal", cols:["estado","obs"], elems:["Botas","Manos","Ropa"] }
  ]},
  { n:3, label:"Limpieza de materiales y equipos de larvicultura", sign:"supervisor", cats:[
    { key:"materiales", label:"Materiales", cols:["estado","fec","obs"],
      elems:["Baldes","Bolsos","Cosechadores","Chayos","Filtros","Jarras","Mangueras de aire","Mangueras","Mallas","Plásticos","Serpentines","Tanques","Tinas"] }
  ]},
  { n:4, label:"Limpieza de materiales y equipos de cosechas (Laboratorio)", sign:"cosecha", obsGen:true, pdfSplitAfter:4, cats:[
    { key:"materiales", label:"Materiales", cols:["estado"],
      elems:["Balanza","Redes","Cosechadora","Rodillos","Mangueras de aire","Mangueras de agua","Gavetas","Tinas Recepción","Tinas Transporte",{otro:true}] },
    { key:"epp", label:"Equipo de protección personal", cols:["estado"],
      elems:["Botas","Mandil plástico","Ropa","Guantes","Gafas","Mascarillas","Filtro de Gases","Capucha","Manos",{otro:true}] },
    { key:"insumos", label:"Insumos Limpieza Empleado", cols:["estado"],
      elems:["Jabón líquido","Agua","Hipoclorito sodio","Detergente",{otro:true}] },
    { key:"desechos", label:"Desechos generados (Recolección)", cols:["estado"],
      elems:["Sacos vacíos","Desecho común","Pomas vacías","Orgánicos",{otro:true}] },
    { key:"utilizados", label:"Materiales Utilizados (uso)", cols:["estado"],
      elems:["Baldes","Escoba","Cepillo",{otro:true}] }
  ]}
];

// Construye la sub-tabla de una categoría para el render en pantalla.
function _dxCatTable(t, cat, d){
  const hasFec = cat.cols.includes("fec");
  const hasObs = cat.cols.includes("obs");
  const head = `<tr>
      <th style="text-align:left;min-width:130px">Elemento</th>
      <th style="min-width:90px">Desinfección</th>
      ${hasFec?'<th style="min-width:120px">Fecha</th>':''}
      ${hasObs?'<th style="text-align:left;min-width:180px">Observaciones</th>':''}
    </tr>`;
  const rows = cat.elems.map((el, idx) => {
    const base   = `dx_${t.n}_${cat.key}_${idx}`;
    const isOtro = !!(el && el.otro);
    const est    = d[base+"_estado"] || "";
    const defObs = (el && el.obs) ? el.obs : "";
    const obsVal = (d[base+"_obs"]!==undefined && d[base+"_obs"]!=="") ? d[base+"_obs"] : defObs;
    const elemCell = isOtro
      ? `<input type="text" name="${base}_nom" value="${vl(d,base+'_nom')}" placeholder="Otro: especifique…" style="width:100%;min-width:130px;text-align:left">`
      : `<span style="font-weight:600">${escapeHtml(typeof el==="string"?el:el.name)}</span>`;
    const estSel = `<select name="${base}_estado" style="min-width:80px">
        <option value=""${est===""?" selected":""}>—</option>
        <option value="Sí"${est==="Sí"?" selected":""}>Sí</option>
        <option value="No"${est==="No"?" selected":""}>No</option>
      </select>`;
    const fecCell = hasFec ? `<td><input type="date" name="${base}_fec" value="${escapeHtml(d[base+'_fec'] || d.fecha || today())}"></td>` : "";
    const obsCell = hasObs ? `<td><input type="text" name="${base}_obs" value="${escapeHtml(obsVal)}" placeholder="Observación" style="width:100%;min-width:180px;text-align:left"></td>` : "";
    return `<tr>
      <td style="text-align:left">${elemCell}</td>
      <td>${estSel}</td>
      ${fecCell}${obsCell}
    </tr>`;
  }).join("");
  return `<div class="mad-section-title">${escapeHtml(cat.label)}</div>
    <div class="tw"><table class="ft"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

function renderDesinfeccion(){
  const fp = document.getElementById("fp-desinfeccion");
  if(!fp) return;
  // Render NATIVO (módulo ES fichas/desinfeccion.render.js). Ver renderCalidad.
  // Reutiliza DESINF_TYPES + _dxCatTable (generador de tablas por categoría).
  if(!window.__rgLib || typeof window.__rgLib.renderDesinfeccionFicha !== "function") return;
  const _e = loadE(curMod,"desinfeccion");
  const _saved = _e ? _e.data : {};
  const _data = (typeof window.__rgLib.resolveDesinfeccionData === "function")
    ? window.__rgLib.resolveDesinfeccionData({ saved: _saved, mod: curMod, engine: window })
    : _saved;
  const _lr = (typeof loadRecovery === "function") ? loadRecovery(curMod,"desinfeccion") : null;
  fp.innerHTML = window.__rgLib.renderDesinfeccionFicha({
    data: _data,
    modLabel: mLabel(curMod),
    types: (typeof DESINF_TYPES !== "undefined") ? DESINF_TYPES : [],
    catTable: (typeof _dxCatTable === "function") ? _dxCatTable : undefined,
    status: getStatus(curMod,"desinfeccion"),
    today: today(),
    lastSaved: _e ? new Date(_e.updatedAt).toLocaleString("es-EC") : "—",
    recover: _lr ? { label: new Date(_lr.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}) } : null,
  });
}

// Cambia la grilla visible sin re-renderizar (no pierde lo tecleado en otros tipos).
function dxSwitchType(v){
  const fp = document.getElementById("fp-desinfeccion");
  if(!fp) return;
  fp.querySelectorAll(".dx-type").forEach(b => {
    b.style.display = (b.dataset.tipo === String(v)) ? "block" : "none";
  });
  _formDirty = true;
}

// Propaga la fecha de la ficha a TODAS las celdas "Fecha" por elemento (col 9
// de Tipos 1 y 3). Sobrescribe el valor de cada fila para que la columna entera
// quede con la fecha seleccionada; el usuario puede luego editar filas puntuales.
// No re-renderiza (no pierde lo tecleado en otros campos) y marca _formDirty.
function dxFechaChange(v){
  const fp = document.getElementById("fp-desinfeccion");
  if(!fp) return;
  if(!isValidDate(v)) return;
  fp.querySelectorAll('input[type="date"][name^="dx_"]').forEach(el => { el.value = v; });
  _formDirty = true;
}

// Construye el payload tidy (1 fila por elemento con estado u observación editada).
function buildDesinfeccionPayload(m){
  const e = loadE(m,"desinfeccion"); const d = e?e.data:{};
  const fecha   = isValidDate(d.fecha||"") ? d.fecha : today();
  const corrida = sanitizeStr(d.corrida || _inheritShared(m,"corrida","desinfeccion") || "");
  const headers = ["Fecha","Módulo","Corrida","Tipo de Registro","Categoría","Elemento","Estado","Observaciones","Fecha Elemento"];
  const rows = [];
  DESINF_TYPES.forEach(t => {
    t.cats.forEach(cat => {
      const hasFec = cat.cols.includes("fec");
      cat.elems.forEach((el, idx) => {
        const base   = `dx_${t.n}_${cat.key}_${idx}`;
        const isOtro = !!(el && el.otro);
        const elemName = isOtro ? sanitizeStr(d[base+"_nom"]||"") : (typeof el==="string"?el:el.name);
        if(isOtro && !elemName) return;                 // "Otro" sin nombre → omitir
        const estado = sanitizeStr(d[base+"_estado"]||"");
        const defObs = (el && el.obs) ? el.obs : "";
        const obs    = sanitizeStr(d[base+"_obs"]||"");
        const obsEdited = obs!=="" && obs!==defObs;      // ignora la obs pre-cargada del Tipo 2
        if(estado==="" && !obsEdited) return;            // fila sin marcar y sin obs propia → omitir
        const fecEl = (hasFec && isValidDate(d[base+"_fec"]||"")) ? d[base+"_fec"] : "";
        rows.push([fecha, mLabel(m), corrida, t.label, cat.label, elemName, estado, obs, fecEl]);
      });
    });
    if(t.obsGen){
      const og = sanitizeStr(d["dx_"+t.n+"_obsgen"]||"");
      if(og) rows.push([fecha, mLabel(m), corrida, t.label, "Observaciones generales", "—", "", og, ""]);
    }
  });
  return { sheetName: DESINF_SHEET, headers, rows };
}

// PDF del Tipo de Registro activo (formato físico, portrait A4) con firmas y código.
function downloadDesinfeccionPDF(){
  if(!isValidMod(curMod)) return;
  const e = loadE(curMod,"desinfeccion"); const saved = e?e.data:{};
  const live = (curTab === "desinfeccion") ? collect("desinfeccion") : null;
  const d = live || saved;
  let tipo = String(d._tipo || saved._tipo || "1");
  const selEl = document.querySelector('#fp-desinfeccion [name="_tipo"]');
  if(selEl && selEl.value) tipo = selEl.value;
  const t = DESINF_TYPES.find(x => String(x.n)===String(tipo)) || DESINF_TYPES[0];

  const fecha   = d.fecha || today();
  const corrida = escapeHtml(String(d.corrida || '')) || '—';
  const ts      = new Date().toLocaleString('es-EC',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const mk = (est,val) => est===val ? '✓' : '';

  // Un bloque HTML por categoría (se mantiene como ARRAY para poder repartir las
  // categorías entre páginas en el Tipo 4; ver `pdfSplitAfter`).
  const catBlocks = t.cats.map(cat => {
    const hasFec = cat.cols.includes('fec');
    const hasObs = cat.cols.includes('obs');
    const head = `<tr>
        <th rowspan="2" style="text-align:left">Elemento</th>
        <th colspan="2">Desinfección</th>
        ${hasFec?'<th rowspan="2">Fecha</th>':''}
        ${hasObs?'<th rowspan="2" style="text-align:left">Observaciones</th>':''}
      </tr><tr><th style="width:32px">Sí</th><th style="width:32px">No</th></tr>`;
    const body = cat.elems.map((el, idx) => {
      const base   = `dx_${t.n}_${cat.key}_${idx}`;
      const isOtro = !!(el && el.otro);
      const nm     = isOtro ? escapeHtml(String(d[base+'_nom']||'')) : escapeHtml(typeof el==='string'?el:el.name);
      const est    = String(d[base+'_estado']||'');
      const defObs = (el && el.obs) ? el.obs : '';
      const obs    = (d[base+'_obs']!==undefined && d[base+'_obs']!=='') ? d[base+'_obs'] : defObs;
      const fec    = d[base+'_fec']||'';
      return `<tr>
        <td style="text-align:left">${nm || (isOtro?'<span class="dxblank"></span>':'')}</td>
        <td class="dxck">${mk(est,'Sí')}</td>
        <td class="dxck">${mk(est,'No')}</td>
        ${hasFec?`<td>${escapeHtml(String(fec||''))}</td>`:''}
        ${hasObs?`<td style="text-align:left">${escapeHtml(String(obs||''))}</td>`:''}
      </tr>`;
    }).join('');
    // Cada categoría se envuelve en .dxgrp (evita que una tabla se parta entre
    // páginas y agrupa título+tabla).
    return `<div class="dxgrp"><div class="dxcat">${escapeHtml(cat.label)}</div>
      <table class="dxt"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  });

  const obsGen = (t.obsGen && d['dx_'+t.n+'_obsgen'])
    ? `<div class="dxobs"><div class="dxobs-l">Observaciones generales</div><div>${escapeHtml(String(d['dx_'+t.n+'_obsgen']))}</div></div>`
    : '';

  const signs = (t.sign === 'cosecha')
    ? `<div class="dxsig"><div class="dxsig-line"></div>Supervisor de Cosecha</div>
       <div class="dxsig"><div class="dxsig-line"></div>Administrador</div>`
    : `<div class="dxsig"><div class="dxsig-line"></div>Supervisor</div>`;
  const footHtml = `<div class="dxfoot">${signs}</div>`;

  // Cuerpo del PDF. En el Tipo 4 (pdfSplitAfter=4) se reparte en 2 hojas:
  //  • Hoja 1 → primeras 4 categorías (Materiales, EPP, Insumos, Desechos).
  //  • Hoja 2 → 5ª categoría (Materiales Utilizados) + Observaciones + firmas,
  //    para que las firmas NO queden solas al final. El resto de tipos van en
  //    una sola hoja con sus tablas + obs + firmas como antes.
  let bodyHtml;
  if(t.pdfSplitAfter && catBlocks.length > t.pdfSplitAfter){
    const p1 = catBlocks.slice(0, t.pdfSplitAfter).join('');
    const p2 = catBlocks.slice(t.pdfSplitAfter).join('');
    bodyHtml = p1 + `<div class="dxbreak"></div>` + p2 + obsGen + footHtml;
  } else {
    bodyHtml = catBlocks.join('') + obsGen + footHtml;
  }

  const css = `
@page{size:A4 portrait;margin:10mm 9mm}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
html,body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#111;width:192mm;margin:0 auto}
.ph{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #09192e;padding-bottom:4px;margin-bottom:5px}
.ph .co{font-size:12pt;font-weight:800;color:#09192e}
.ph .su{font-size:7pt;color:#64748b;text-transform:uppercase;letter-spacing:.6px}
.ph .code{font-family:monospace;font-size:9pt;font-weight:800;color:#09192e;background:#f0fdfa;border:1.5px solid #99f6e4;border-radius:3px;padding:3px 9px}
.ph .mod{font-size:12pt;font-weight:800;color:#09192e;text-align:right}
.ftitle{font-size:10pt;font-weight:800;color:#fff;background:#09192e;padding:4px 10px;margin-bottom:6px;border-radius:2px}
.meta{display:flex;gap:4px 22px;flex-wrap:wrap;margin-bottom:8px}
.meta .mf{display:flex;flex-direction:column}
.meta label{font-size:7pt;text-transform:uppercase;letter-spacing:.4px;color:#0f766e;font-weight:800}
.meta span{font-size:9.5pt;font-weight:600;border-bottom:1px solid #cbd5e1;min-width:80px;padding-bottom:1px}
.dxcat{font-size:8.5pt;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:#0f766e;background:#ecfeff;border-left:3px solid #14b8a6;padding:3px 8px;margin:8px 0 3px;border-radius:0 4px 4px 0}
table.dxt{border-collapse:collapse;width:100%;margin-bottom:2px}
.dxt th{background:#0f2942;color:#fff;border:1px solid #1e3a5f;padding:2px 5px;font-size:7.5pt;text-align:center}
.dxt td{border:1px solid #cbd5e1;padding:2px 6px;font-size:8.5pt;text-align:center}
.dxt tr:nth-child(even) td{background:#f0fdfa}
.dxck{font-weight:800;color:#065f46}
.dxblank{display:inline-block;min-width:90px;border-bottom:1px solid #94a3b8}
.dxobs{border:1px solid #e2e8f0;background:#f8fafc;border-radius:3px;padding:5px 9px;margin-top:6px;font-size:8.5pt}
.dxobs-l{font-size:7pt;text-transform:uppercase;color:#0f766e;font-weight:800;margin-bottom:2px}
.dxfoot{margin-top:20px;display:flex;justify-content:space-around;gap:24px}
.dxsig{flex:1;text-align:center;font-size:8pt;font-weight:700;color:#0f172a}
/* Línea de firma corta y centrada (antes ocupaba todo el ancho del contenedor). */
.dxsig-line{border-top:1.5px solid #0f172a;width:210px;max-width:80%;margin:26px auto 4px}
.dxts{margin-top:10px;font-size:7pt;color:#94a3b8;text-align:right}
/* Salto de página forzado (Tipo 4: separa la última categoría + firmas). */
.dxbreak{page-break-before:always;break-before:page;height:0;margin:0;border:0}
/* Evita que una categoría (título+tabla) se parta entre páginas. */
.dxgrp{break-inside:avoid;page-break-inside:avoid}
  `;

  const page = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Desinfección ${mLabel(curMod)} Tipo ${t.n} ${fecha}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${css}</style></head><body>
    <div class="ph">
      <div><div class="co">OMARSA · Larvicultura</div><div class="su">Sistema de Fichas Larvicultura</div></div>
      <div><span class="code">${DESINF_CODE}</span></div>
      <div><div class="mod">${mLabel(curMod)}</div></div>
    </div>
    <div class="ftitle">🧴 ${escapeHtml(t.label)}</div>
    <div class="meta">
      <div class="mf"><label>Fecha</label><span>${escapeHtml(String(fecha))}</span></div>
      <div class="mf"><label>Módulo</label><span>${mLabel(curMod)}</span></div>
      <div class="mf"><label>Corrida</label><span>${corrida}</span></div>
    </div>
    ${bodyHtml}
    <div class="dxts">Generado el ${ts} · ${DESINF_CODE}</div>
    <script>
      var _p=false;function dp(){if(_p)return;_p=true;setTimeout(function(){window.print();},350);}
      if(document.readyState==='complete')dp();else window.addEventListener('load',dp,{once:true});
    <\/script></body></html>`;

  const w = window.open('','_blank','width=820,height=1000');
  if(!w){ toast('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.','warn',6000); return; }
  w.document.write(page); w.document.close();
}

function pdfCss(fid){
  /* A4 landscape = 297×210mm. Margins 7mm top/bottom, 8mm sides → usable 281×196mm.
     KEY FIX: Use mm units so the browser print engine maps content 1:1 to paper.
     Without mm units, the browser renders at screen pixels then shrinks to fit A4,
     causing the "content fills 1/3 of page" bug on mobile/desktop print.
     ── print-color-adjust: exact ── obliga al motor de impresión a respetar
     fondos y colores aunque el usuario NO active "Background graphics" en el
     diálogo de imprimir (Chrome/Edge/Safari). En navegadores antiguos cae al
     prefijo -webkit-. */
  const isP = fid === 'params';
  const isC = fid === 'calidad';
  return `
@page{size:A4 landscape;margin:5mm 8mm}
@page :first{size:A4 landscape;margin:5mm 8mm}
*{box-sizing:border-box;margin:0;padding:0;
  -webkit-print-color-adjust:exact !important;
  print-color-adjust:exact !important;
  color-adjust:exact !important;}
html,body{background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#111;width:281mm;margin:0 auto;
  -webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
.ppage{width:281mm;min-height:200mm;padding:0;display:flex;flex-direction:column}
@media print{
  html,body{width:281mm;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  .ppage{width:281mm;min-height:200mm;page-break-after:always}
  .ppage:last-child{page-break-after:auto}
  /* Reforzado por si el usuario tiene desactivado "Background graphics" */
  *,*::before,*::after{
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
    color-adjust:exact !important;
  }
}
/* HEADER */
.ph{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #09192e;padding-bottom:3px;margin-bottom:4px}
.ph-brand .co{font-size:11pt;font-weight:800;color:#09192e}
.ph-brand .su{font-size:6.5pt;color:#64748b;text-transform:uppercase;letter-spacing:.7px}
.ph-center{text-align:center;flex:1;padding:0 10px}
.ph-center .doc-code{font-family:monospace;font-size:8pt;font-weight:800;color:#09192e;letter-spacing:.5px;background:#f0fdfa;border:1.5px solid #99f6e4;border-radius:3px;padding:2px 8px;display:inline-block}
.ph-right{text-align:right}
.ph-right .mod{font-size:11pt;font-weight:800;color:#09192e}
.ph-right .mods{font-size:6.5pt;color:#64748b}
.ftitle{font-size:9pt;font-weight:800;color:#fff;background:#09192e;padding:3px 10px;margin-bottom:4px;border-radius:2px;display:flex;align-items:center;gap:5px}
/* META */
.mgrid,.mgrid2{display:flex;flex-wrap:wrap;gap:2px 18px;margin-bottom:4px}
.mf{display:flex;flex-direction:column;gap:0px}
.mf label{font-size:6.5pt;text-transform:uppercase;letter-spacing:.4px;color:#0f766e;font-weight:800}
.mf span{font-size:8.5pt;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:1px;min-width:60px}
/* TABLE */
table{border-collapse:collapse;width:100%}
th{background:#0f2942;color:#fff;padding:${isP?'2px 3px':isC?'2px 2px':'3px 4px'};text-align:center;font-size:${isP?'6.5pt':isC?'5.5pt':'7.5pt'};font-weight:700;border:1px solid #1e3a5f;white-space:nowrap}
td{border:1px solid #d1d5db;padding:${isP?'2px 2px':isC?'2px 2px':'3px 4px'};text-align:center;color:#111;font-size:${isP?'7pt':isC?'6.5pt':'8pt'};white-space:nowrap}
tr:nth-child(even) td{background:#f0fdfa}
.tqc{background:#09192e!important;color:#fff!important;font-weight:800;font-size:${isP?'7pt':'7.5pt'};width:28px;min-width:28px}
.thg {background:#0d6b5e!important;color:#fff!important;font-size:${isC?'5.5pt':'7pt'}!important;font-weight:800!important;letter-spacing:.2px!important}
.thg2{background:#312e81!important;color:#e0e7ff!important;font-size:${isC?'5.5pt':'7pt'}!important;font-weight:800!important}
.thg3{background:#166534!important;color:#dcfce7!important;font-size:${isC?'5.5pt':'7pt'}!important;font-weight:800!important}
.thgt{background:#fff!important;color:#0f172a!important;font-size:${isP?'6.5pt':'7pt'}!important;font-weight:700!important}
.empty{color:#9ca3af;font-style:italic;font-size:7pt}
/* OBS */
.obs-block{border:1px solid #e2e8f0;border-radius:3px;padding:4px 10px;margin-top:4px;background:#f8fafc}
.obs-block .lbl{font-size:6.5pt;text-transform:uppercase;color:#0f766e;font-weight:800;margin-bottom:1px}
.obs-block .txt{font-size:8pt;color:#0f172a;line-height:1.4}
/* FOOTER */
.spacer{flex:1;min-height:2px}
.pfoot{border-top:1.5px solid #cbd5e1;padding-top:4px;display:flex;align-items:flex-end;justify-content:space-between;margin-top:4px}
.code-box{font-family:monospace;font-size:7pt;font-weight:800;color:#09192e;background:#f0fdfa;padding:3px 8px;border-radius:3px;border:1.5px solid #99f6e4;letter-spacing:.6px}
.ts-txt{font-size:6.5pt;color:#9ca3af;margin-top:1px}
.rev-line{text-align:center;font-size:6.5pt;color:#64748b;letter-spacing:.3px;margin-top:4px;padding-top:3px;border-top:1px dashed #e2e8f0}
/* CHARTS PAGE — fits ONE A4 landscape page */
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;flex:1}
.chart-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:5px 8px;display:flex;flex-direction:column;max-height:86mm}
.chart-label{font-size:7pt;font-weight:800;color:#1e293b;text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px}
.chart-svg-wrap{flex:1;display:flex;align-items:flex-end;max-height:72mm;overflow:hidden}
.chart-svg-wrap svg{display:block;width:100%}
.metrics-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.metric-card{background:linear-gradient(135deg,#f0fdfa,#ecfdf5);border:1.5px solid #6ee7b7;border-radius:6px;padding:5px 8px;text-align:center;flex:1;min-width:70px}
.metric-card .mc-lbl{font-size:5.5pt;color:#0f766e;font-weight:800;text-transform:uppercase;letter-spacing:.3px}
.metric-card .mc-val{font-size:12pt;font-weight:800;color:#09192e;margin:1px 0}
.metric-card .mc-unit{font-size:5.5pt;color:#64748b}
  `;
}

function pdfHeader(fid, mod, d){
  const names={
    calidad:'Registro Sanidad y Calidad de Larvas',
    plg:'PL Gramo Externo',
    params:'Parámetros en Tanques — OD y Temperatura',
    poblacion:'Población Laboratorio',
    calagua:'Calidad de Agua',
    despacho:'Despacho'
  };
  const icons={calidad:'🔬',plg:'⚖️',params:'🌡️',poblacion:'🧮',calagua:'💧',despacho:'🚚'};
  const docCodes={
    calidad:'OMR-LAB-M-FOR-039',
    plg:'OMR-LAB-M-FOR-040',
    params:'OMR-LAB-M-FOR-045',
    poblacion:'OMR-LAB-M-FOR-040',
    calagua:'OMR-LAB-M-FOR-CAG',
    despacho:'OMR-LAB-M-FOR-DES'
  };
  const docCode = docCodes[fid] || '';
  // Extra meta row for params
  const extraMeta = fid==='params'
    ? `<div class="mf"><label>Estadío</label><span>${escapeHtml(String(d.estadio||'—'))}</span></div>
       <div class="mf"><label>Hora registro</label><span>${escapeHtml(String(d.hora||'—'))}</span></div>`
    : `<div class="mf"><label>Hora</label><span>${escapeHtml(String(d.hora||'—'))}</span></div>
       <div class="mf" style="visibility:hidden"></div>`;
  return `<div class="ph">
    <div class="ph-brand">
      <div class="co">OMARSA · Larvicultura</div>
      <div class="su">Sistema de Fichas Larvicultura</div>
    </div>
    ${docCode ? '<div class="ph-center"><span class="doc-code">' + docCode + '</span></div>' : ''}
    <div class="ph-right">
      <div class="mod">${mLabel(mod)}</div>
      <div class="mods">${mod === CIO_MOD ? 'Módulo CIO' : mod === LAB_MOD ? 'Lab. Algas' : 'Módulo '+mod}</div>
    </div>
  </div>
  <div class="ftitle">${icons[fid]||''} ${names[fid]||fid}</div>
  <div class="mgrid">
    <div class="mf"><label>${mod===CIO_MOD?'CIO':mod===LAB_MOD?'Lab. Algas':'Módulo'}</label><span>${mLabel(mod)}</span></div>
    <div class="mf"><label>Fecha</label><span>${d.fecha||today()}</span></div>
    <div class="mf"><label>Corrida</label><span>${escapeHtml(String(d.corrida||'—'))}</span></div>
    <div class="mf"><label>Técnico</label><span>${escapeHtml(String(d.tec||gcfg('tec','—')))}</span></div>
    ${extraMeta}
  </div>`;
}

function pdfFooter(codigo, tsStr, tec, fid){
  const revLines={
    calidad:'Revisión: 002 — Vigencia: 21/11/2025',
    params:'Versión 0 — Fecha de aprobación 1-ago.-2015'
  };
  const revHtml = revLines[fid]
    ? `<div class="rev-line">${revLines[fid]}</div>`
    : '';
  return `<div class="pfoot">
    <div>
      <div style="font-size:6pt;color:#64748b;margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px">Código verificador</div>
      <div class="code-box">${codigo}</div>
      <div class="ts-txt" style="margin-top:2px">Generado el ${tsStr}</div>
    </div>
    <div style="text-align:center;min-width:140px">
      <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">
        ${escapeHtml(tec||'Técnico Responsable')}
      </div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Firma del Responsable</div>
    </div>
    <div style="text-align:center;min-width:120px">
      <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">
        Supervisor
      </div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Visto Bueno</div>
    </div>
  </div>${revHtml}`;
}

function pdfVal(v){ return (v!==undefined&&v!==''&&v!==null)?String(v):'<span class="empty">—</span>'; }

function pdfTableCalidad(d, mod, tqN){
  const KEYS=['e','ll','sl','va','df','rt','mo','hg','nv','op','lp','fl','nc','cb','pr','cos','es'];
  const rows=Array.from({length:TQS},(_,i)=>{
    const hasAny = KEYS.some(k=>{const v=d[k+'_'+i]; return v!==undefined&&v!==''&&v!==null;});
    if(!hasAny) return '';
    return `<tr>
    <td class="tqc">${escapeHtml(tqN(i))}</td>
    <td>${pdfVal(d['e_'+i])}</td>
    <td>${pdfVal(d['ll_'+i])}</td><td>${pdfVal(d['sl_'+i])}</td><td>${pdfVal(d['va_'+i])}</td>
    <td>${pdfVal(d['df_'+i])}</td><td>${pdfVal(d['rt_'+i])}</td><td>${pdfVal(d['mo_'+i])}</td>
    <td>${pdfVal(d['hg_'+i])}</td><td>${pdfVal(d['nv_'+i])}</td><td>${pdfVal(d['op_'+i])}</td>
    <td>${pdfVal(d['lp_'+i])}</td>
    <td>${pdfVal(d['fl_'+i])}</td><td>${pdfVal(d['nc_'+i])}</td>
    <td>${pdfVal(d['cb_'+i])}</td><td>${pdfVal(d['pr_'+i])}</td>
    <td>${pdfVal(d['cos_'+i])}</td><td>${pdfVal(d['es_'+i])}</td>
  </tr>`;}).join('');
  return `<table>
    <thead>
      <tr><th rowspan="3">TQ</th><th rowspan="3">Estadio</th>
        <th colspan="9" class="thg">SANIDAD — Estadios N5–M3</th>
        <th colspan="5" class="thg2">SANIDAD — Post-larva</th>
        <th colspan="2" class="thg3">CALIDAD</th></tr>
      <tr><th colspan="3">Intestino</th><th colspan="3">Morfología</th><th colspan="3">Otros</th>
        <th>Hepatop.</th><th colspan="4">Morf. PL</th>
        <th>%Act.</th><th>%Estrés</th></tr>
      <tr><th>%Ll</th><th>%Semi</th><th>%Vac</th>
        <th>%Def</th><th>%Ret</th><th>%Mort</th>
        <th>%Hong</th><th>%NoV</th><th>%Opac</th>
        <th>%Líp</th>
        <th>%Flac</th><th>%Nec</th><th>%Can</th><th>%Par</th>
        <th>%Act</th><th>%Es</th></tr>
    </thead><tbody>${rows}</tbody></table>`;
}

function pdfTablePlg(d, mod, tqN){
  // Orden alineado a la hoja: Lote → Estadío → Plg → Plg manual (Talla eliminada)
  const rows=Array.from({length:TQS},(_,i)=>{
    const has = ['e','pg','pgm','lt'].some(k=>{const v=d[k+'_'+i];return v!==undefined&&v!==''&&v!==null;});
    if(!has) return '';
    return `<tr>
    <td class="tqc">${escapeHtml(tqN(i))}</td>
    <td>${pdfVal(d['lt_'+i])}</td>
    <td>${pdfVal(d['e_'+i])}</td>
    <td>${pdfVal(d['pg_'+i])}</td>
    <td>${pdfVal(d['pgm_'+i])}</td>
  </tr>`;
  }).join('');
  return `<table>
    <thead><tr><th>TQ</th><th>Lote</th><th>Estadio</th><th>PL / Gramo</th><th>Plg (manual)</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function pdfTableParams(d, mod, tqN){
  const th1 = PTIMES.map(t=>`<th colspan="2" class="thgt">${t}</th>`).join('');
  const th2 = PTIMES.map(()=>'<th>OD</th><th>°C</th>').join('');
  const rows = Array.from({length:TQS},(_,i)=>{
    const hasData = PTIMES.some(t=> (d['od_'+i+'_'+t]||'')!=='' || (d['tc_'+i+'_'+t]||'')!=='');
    if(!hasData) return '';
    const cells = PTIMES.map(t=>`<td>${pdfVal(d['od_'+i+'_'+t])}</td><td>${pdfVal(d['tc_'+i+'_'+t])}</td>`).join('');
    return `<tr><td class="tqc">${escapeHtml(tqN(i))}</td>${cells}</tr>`;
  }).join('');
  return `<table style="table-layout:fixed;width:100%">
    <thead>
      <tr><th style="min-width:26px;width:26px">TQ</th>${th1}</tr>
      <tr><th></th>${th2}</tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function pdfTableDespacho(d, mod, tqN){
  const rows = Array.from({length:TQS},(_,i)=>{
    const has = ['e','po','sv','pgm','pg','dc','bm','cj','de','ps'].some(k=>{
      const v=d[k+'_'+i]; return v!==undefined && v!=='' && v!==null;
    });
    if(!has) return '';
    return `<tr>
    <td class="tqc">${escapeHtml(tqN(i))}</td>
    <td>${pdfVal(d['e_'+i])}</td>
    <td>${pdfVal(d['po_'+i])}</td>
    <td>${pdfVal(d['sv_'+i])}</td>
    <td>${pdfVal(d['pgm_'+i])}</td>
    <td>${pdfVal(d['pg_'+i])}</td>
    <td>${pdfVal(d['dc_'+i])}</td>
    <td>${pdfVal(d['bm_'+i])}</td>
    <td>${pdfVal(d['cj_'+i])}</td>
    <td>${pdfVal(d['de_'+i])}</td>
    <td>${pdfVal(d['ps_'+i])}</td>
  </tr>`;
  }).join('');
  return `<table>
    <thead><tr>
      <th>TQ</th><th>Estadío</th>
      <th>Población<br>(miles)</th><th>% Superv.</th>
      <th>PLG<br>(manual)</th>
      <th>PL / Gramo</th>
      <th>Densidad<br>cosechada</th><th>Biomasa</th>
      <th>Cajas/<br>Tinas</th>
      <th>Destino</th><th>Piscina</th>
    </tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function pdfTableCalidadAgua(d, mod, tqN){
  const KEYS = ['e','cm','tr','ep','sc','rc','ob'];
  // Celda de Color: nombre + cuadrito con el tono de referencia.
  const colorCell = (v)=>{
    if(v===undefined||v===null||v==="") return '<span class="empty">—</span>';
    const hex = AGUA_COLOR_HEX[v] || "";
    const sw  = hex ? `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;border:1px solid #cbd5e1;background:${hex};margin-right:4px;vertical-align:middle"></span>` : "";
    return sw + escapeHtml(String(v));
  };
  const rows = Array.from({length:TQS},(_,i)=>{
    const hasAny = KEYS.some(k=>{const v=d[k+'_'+i]; return v!==undefined&&v!==''&&v!==null;});
    if(!hasAny) return '';
    return `<tr>
    <td class="tqc">${escapeHtml(tqN(i))}</td>
    <td>${pdfVal(d['e_'+i])}</td>
    <td>${pdfVal(d['cm_'+i])}</td>
    <td>${colorCell(d['tr_'+i])}</td>
    <td>${pdfVal(d['ep_'+i])}</td>
    <td>${pdfVal(d['sc_'+i])}</td>
    <td>${pdfVal(d['rc_'+i])}</td>
    <td>${pdfVal(d['ob_'+i])}</td>
  </tr>`;
  }).join('');
  return `<table>
    <thead><tr>
      <th>TQ</th><th>Estadío</th><th>Cel/ml</th>
      <th>Color</th><th>% Espuma</th><th>% Suciedad</th><th>% Recambio</th>
      <th>Observaciones</th>
    </tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function pdfTablePoblacion(d, mod, tqN){
  // Orden alineado a la hoja: Supervivencia → Población → Lote → Estadío → Salinidad
  let tot=0;
  for(let i=0;i<TQS;i++) tot+=(parseFloat(d['po_'+i])||0);
  const totReal = tot * 1000;
  const rows=Array.from({length:TQS},(_,i)=>{
    const raw = d['po_'+i];
    const hasVal = raw!==undefined&&raw!==''&&raw!==null;
    const hasAny = hasVal || ['e','sv','lt','sal'].some(k=>{const v=d[k+'_'+i];return v!==undefined&&v!==''&&v!==null;});
    if(!hasAny) return '';
    const realVal = hasVal ? (parseFloat(raw)*1000).toLocaleString('es-EC',{minimumFractionDigits:2}) : '';
    return `<tr>
    <td class="tqc">${escapeHtml(tqN(i))}</td>
    <td>${pdfVal(d['sv_'+i])}</td>
    <td>${hasVal ? parseFloat(raw).toLocaleString('es-EC') : '<span class="empty">—</span>'}</td>
    <td>${hasVal ? realVal : '<span class="empty">—</span>'}</td>
    <td>${pdfVal(d['lt_'+i])}</td>
    <td>${pdfVal(d['e_'+i])}</td>
    <td>${pdfVal(d['sal_'+i])}</td>
  </tr>`}).join('');
  const extra=`<div class="mgrid2">
    <div class="mf"><label>Total Ingresado</label><span>${tot.toLocaleString('es-EC')}</span></div>
    <div class="mf"><label>Total Población (real)</label><span style="color:#047857;font-size:9pt;font-weight:800">${totReal.toLocaleString('es-EC',{minimumFractionDigits:2})}</span></div>
    <div class="mf"><label>% Sobrevivencia</label><span>${pdfVal(d.sobrev)}</span></div>
    <div class="mf"><label>% Mort. Diaria</label><span>${pdfVal(d.mort_d)}</span></div>
    <div class="mf"><label>CTA Sembrada</label><span>${pdfVal(d.cta)}</span></div>
  </div>`;
  return `<table>
    <thead><tr><th>TQ</th><th>% Supervivencia</th><th>Ingresado</th><th>Población Real (×1000)</th><th>Lote</th><th>Estadío</th><th>Salinidad</th></tr></thead>
    <tbody>${rows}</tbody></table>${extra}`;
}


/* ── Charts page generator ───────────────── */
function pdfChartsPage(fid, d, mod, tqN){
  const vals = (keys) => {
    const arr = [];
    for(let i=0;i<TQS;i++){
      const v = parseFloat(d[keys+'_'+i]);
      if(isFinite(v)) arr.push({tq: tqN(i), v});
    }
    return arr;
  };
  const avg = (arr) => arr.length ? (arr.reduce((s,x)=>s+x.v,0)/arr.length).toFixed(2) : '—';
  const fmax = (arr) => arr.length ? Math.max(...arr.map(x=>x.v)).toFixed(2) : '—';
  const fmin = (arr) => arr.length ? Math.min(...arr.map(x=>x.v)).toFixed(2) : '—';
  const cnt = (arr) => arr.length;

  // Responsive SVG bar chart — viewBox scales, width:100% fills container
  const svgBar = (data, label, color) => {
    if(!data.length) return '<div class="chart-box"><div class="chart-label">'+escapeHtml(label)+'</div><div style="font-size:8pt;color:#94a3b8;text-align:center;padding:16px">Sin datos</div></div>';
    const n = data.length;
    const gap = 6;
    const bw = Math.max(16, Math.min(40, Math.floor((500 - 50) / n) - gap));
    const vbW = n * (bw + gap) + 50;
    const vbH = 130;
    const maxV = Math.max(...data.map(x=>x.v)) || 1;
    const chartH = vbH - 36;
    const bars = data.map((x,i) => {
      const bh = Math.max(3, (x.v / maxV) * chartH);
      const bx = 30 + i * (bw + gap);
      const by = vbH - 18 - bh;
      return '<rect x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+bh+'" fill="'+color+'" rx="2"/>'
        + '<text x="'+(bx+bw/2)+'" y="'+(by-3)+'" text-anchor="middle" font-size="8" fill="#0f172a" font-weight="700">'+x.v+'</text>'
        + '<text x="'+(bx+bw/2)+'" y="'+(vbH-4)+'" text-anchor="middle" font-size="7" fill="#475569" font-weight="600">'+escapeHtml(x.tq)+'</text>';
    }).join('');
    const axis = '<line x1="28" y1="4" x2="28" y2="'+(vbH-18)+'" stroke="#cbd5e1" stroke-width="1"/>'
      + '<line x1="28" y1="'+(vbH-18)+'" x2="'+(vbW-4)+'" y2="'+(vbH-18)+'" stroke="#cbd5e1" stroke-width="1"/>';
    return '<div class="chart-box"><div class="chart-label">'+escapeHtml(label)+'</div>'
      + '<div class="chart-svg-wrap"><svg viewBox="0 0 '+vbW+' '+vbH+'" xmlns="http://www.w3.org/2000/svg">'
      + axis + bars + '</svg></div></div>';
  };

  const mCard = (label, value, unit) =>
    '<div class="metric-card"><div class="mc-lbl">'+escapeHtml(label)+'</div>'
    + '<div class="mc-val">'+value+'</div>'
    + (unit ? '<div class="mc-unit">'+escapeHtml(unit)+'</div>' : '')
    + '</div>';

  let charts = '', metrics = '';

  if(fid === 'calidad'){
    const ll=vals('ll'), df=vals('df'), mo=vals('mo'), es=vals('es');
    if(!ll.length && !df.length && !mo.length && !es.length) return '';
    charts = '<div class="chart-grid">'
      + svgBar(ll, '% Intestino Lleno', '#0d9488')
      + svgBar(df, '% Deformidad', '#d97706')
      + svgBar(mo, '% Mortalidad', '#dc2626')
      + svgBar(es, '% Estrés', '#7c3aed')
      + '</div>';
    metrics = '<div class="metrics-row">'
      + mCard('Prom. Intestino Lleno', avg(ll), '%')
      + mCard('Prom. Deformidad', avg(df), '%')
      + mCard('Prom. Mortalidad', avg(mo), '%')
      + mCard('Max Estrés', fmax(es), '%')
      + mCard('TQ registrados', cnt(ll), 'tanques')
      + '</div>';
  } else if(fid === 'plg'){
    const pg=vals('pg');
    if(!pg.length) return '';
    charts = '<div class="chart-grid">'
      + svgBar(pg, 'PL / Gramo', '#0369a1')
      + '</div>';
    metrics = '<div class="metrics-row">'
      + mCard('Prom. PL/g', avg(pg), 'PL/g')
      + mCard('Min PL/g', fmin(pg), '')
      + mCard('Max PL/g', fmax(pg), '')
      + mCard('TQ registrados', cnt(pg), 'tanques')
      + '</div>';
  } else if(fid === 'params'){
    const odArr=[], tcArr=[];
    for(let i=0;i<TQS;i++){
      let oSum=0, oN=0, tSum=0, tN=0;
      PTIMES.forEach(t=>{
        const ov=parseFloat(d['od_'+i+'_'+t]), tv=parseFloat(d['tc_'+i+'_'+t]);
        if(isFinite(ov)){oSum+=ov;oN++;}
        if(isFinite(tv)){tSum+=tv;tN++;}
      });
      if(oN) odArr.push({tq:tqN(i), v:+(oSum/oN).toFixed(2)});
      if(tN) tcArr.push({tq:tqN(i), v:+(tSum/tN).toFixed(1)});
    }
    if(!odArr.length && !tcArr.length) return '';
    charts = '<div class="chart-grid">'
      + svgBar(odArr, 'Promedio OD por Tanque (mg/L)', '#0d9488')
      + svgBar(tcArr, 'Promedio Temperatura por Tanque (°C)', '#d97706')
      + '</div>';
    metrics = '<div class="metrics-row">'
      + mCard('Prom. OD global', avg(odArr), 'mg/L')
      + mCard('Prom. Temp global', avg(tcArr), '°C')
      + mCard('Min OD', fmin(odArr), 'mg/L')
      + mCard('Max Temp', fmax(tcArr), '°C')
      + mCard('TQ con lecturas', cnt(odArr), 'tanques')
      + '</div>';
  } else if(fid === 'poblacion'){
    const po=[];
    for(let i=0;i<TQS;i++){
      const v=parseFloat(d['po_'+i]);
      if(isFinite(v) && v>0) po.push({tq:tqN(i), v});
    }
    const sv=vals('sv');
    if(!po.length && !sv.length) return '';
    charts = '<div class="chart-grid">'
      + svgBar(po, 'Población por Tanque (miles)', '#0369a1')
      + svgBar(sv, '% Supervivencia por Tanque', '#16a34a')
      + '</div>';
    const totP = po.reduce((s,x)=>s+x.v,0);
    metrics = '<div class="metrics-row">'
      + mCard('Total Población', (totP*1000).toLocaleString('es-EC'), 'real')
      + mCard('Prom. Supervivencia', avg(sv), '%')
      + mCard('TQ activos', cnt(po), 'tanques')
      + mCard('Mort. Diaria', pdfVal(d.mort_d), '%')
      + '</div>';
  }

  if(!charts && !metrics) return '';

  return '<div class="ppage" style="page-break-before:always;max-height:200mm;overflow:hidden">'
    + '<div class="ftitle" style="margin-top:0">📊 Resumen y Métricas</div>'
    + charts + metrics
    + '<div class="spacer"></div>'
    + '</div>';
}

function downloadPDF(fid, dataOverride, opts){
  // algas ficha has no PDF template; FICHAS only includes standard fichas
  if(!FICHAS.includes(fid)) return;
  // Fuente de datos del PDF, por prioridad:
  //  1) dataOverride → snapshot explícito (Historial/Blanco → PDF).
  //  2) ficha ACTIVA en pantalla → se recolecta el DOM en vivo (quiet) para que
  //     el PDF refleje EXACTAMENTE lo visible, incluidos los campos CALCULADOS
  //     que rcPob deja en el DOM (CTA Sembrada, % Sobrevivencia Global, % Mort.
  //     Diaria) aunque la ficha no se haya guardado todavía. Antes el PDF leía
  //     solo el storage y esos campos salían vacíos si no se había guardado.
  //  3) fallback → datos guardados de la ficha.
  let d;
  if(dataOverride && typeof dataOverride === "object" && !Array.isArray(dataOverride)){
    d = dataOverride;
  } else if(curTab === fid && document.getElementById("fp-"+fid)){
    d = collect(fid, {quiet:true});
  } else {
    d = (loadE(curMod, fid) || {}).data || {};
  }
  const ts      = new Date();
  const tsStr   = ts.toLocaleString('es-EC',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const fecha   = d.fecha || today();
  const codigo  = genCodigo(fid, curMod, fecha);
  const tec     = d.tec || gcfg('tec','');
  // Cache tank names once for all PDF table functions
  const _tqn    = loadTqNames(curMod);
  const tqN     = (i) => (_tqn[i] || ("TQ " + (i+1)));

  // Dispatch table — add new fichas here only
  const PDF_TABLE_FN = {
    calidad:  pdfTableCalidad,
    plg:      pdfTablePlg,
    params:   pdfTableParams,
    poblacion:pdfTablePoblacion,
    calagua:  pdfTableCalidadAgua,
    despacho: pdfTableDespacho
  };
  const tableHtml = (PDF_TABLE_FN[fid] || (()=>''))(d, curMod, tqN);

  const obsHtml = d.obs
    ? `<div class="obs-block"><div class="lbl">Observaciones del turno</div><div class="txt">${escapeHtml(String(d.obs))}</div></div>`
    : '';

  const chartsHtml = pdfChartsPage(fid, d, curMod, tqN);

  // Nombre por defecto del PDF — el navegador lo usa como sugerencia al guardar
  const corridaStr = sanitizeStr(d.corrida || '');
  const fileName   = pdfFilename(fid, curMod, fecha, corridaStr);
  const title      = escapeHtml(fileName);

  // Mobile fix: use _printed flag to prevent duplicate print dialogs
  const page = `<!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${pdfCss(fid)}</style>
  </head><body>
  <div class="ppage">
    ${pdfHeader(fid, curMod, d)}
    ${tableHtml}
    ${obsHtml}
    <div class="spacer"></div>
    ${pdfFooter(codigo, tsStr, tec, fid)}
  </div>
  ${chartsHtml}
  <script>
    // Fija el título para que el navegador lo use como nombre por defecto
    // al "Guardar como PDF" (Chrome/Edge/Firefox/Safari).
    try { document.title = ${JSON.stringify(fileName)}; } catch(_){}
    var _printed=false;
    function doPrint(){if(_printed)return;_printed=true;setTimeout(function(){window.print();},350);}
    if(document.readyState==='complete')doPrint();
    else window.addEventListener('load',doPrint,{once:true});
  <\/script></body></html>`;

  // Modo "compartir": en vez de abrir la ventana de impresión, devuelve el HTML
  // del PDF (lo usa shareFichaPDF para que el GAS lo convierta a PDF en Drive).
  if(opts && opts.returnDoc) return { page, fileName, fecha, codigo };

  const w = window.open('','_blank','width=1100,height=720');
  if(!w){
    toast('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.','warn',6000);
    return;
  }
  w.document.write(page);
  w.document.close();
  // Refuerzo: algunos navegadores leen el title de la ventana padre
  try { w.document.title = fileName; } catch(_){}
  toast('📄 PDF: ' + fileName + ' · cód. ' + codigo,'ok',5500);
}

// Genera el PDF de una ficha de Larvicultura y lo envía al GAS, que lo convierte
// (HTML→PDF) y lo guarda/comparte en Drive (PDFs/Fecha) para descargarlo por el
// QR "PDFs del día" en otro dispositivo. NO sube un archivo: la app manda el HTML.
async function shareFichaPDF(fid){
  if(!FICHAS.includes(fid)) return;
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script en ⚙ Config","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL inválida","err"); return; }
  let d;
  if(curTab === fid && document.getElementById("fp-"+fid)) d = collect(fid, {quiet:true});
  else d = (loadE(curMod, fid) || {}).data || {};
  const doc = downloadPDF(fid, d, { returnDoc:true });
  if(!doc || !doc.page){ toast("No se pudo generar el PDF","err"); return; }
  toast("📤 Generando PDF y enviándolo a Drive…","info",4000);
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 30000);
    const r = await fetch(url, {
      method:"POST", headers:{"Content-Type":"text/plain"},
      body: JSON.stringify({ action:"pdfShare", token:EV_TOKEN, fecha:doc.fecha, modulo:_evModParam(), name:doc.fileName, html:doc.page }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    const j = JSON.parse(await r.text());
    if(j && j.status === "ok"){
      toast("✅ PDF compartido — disponible para descargar desde el QR “PDFs del día”.","ok",6000);
    } else {
      toast("No se pudo compartir el PDF" + (j && j.message ? (": "+j.message) : ""), "err", 6000);
    }
  }catch(x){
    toast(x.name==="AbortError" ? "Tiempo de espera agotado al enviar el PDF." : "Error de conexión al enviar el PDF.", "err", 5000);
  }
}

/* ══════════════════════════════════════════
   LAB. ALGAS — PAYLOAD BUILDER
   Sheet: Lab_Algas
   Cols: Fecha, Corrida_Larv, Modulo_Larv, Area_Algas, Sistema,
         Lote, Dia_Proceso, Cel_ml, Protozoarios, Especie,
         Salinidad_ppt, pH, Temperatura_C, Intensidad_Luz_%, Descartado,
         Observaciones, Ciliados, Filamentosos, Técnico
══════════════════════════════════════════ */
function buildAlgasPayload(m, histSnapshot){
  const headers = [
    "Fecha","Corrida_Larv","Modulo_Larv","Area_Algas","Sistema",
    "Lote","Dia_Proceso","Cel_ml","Protozoarios","Especie",
    "Salinidad_ppt","pH","Temperatura_C","Intensidad_Luz_%","Descartado",
    "Observaciones","Ciliados","Filamentosos","Técnico"
  ];
  // safeNum: returns the parsed number (including 0) or "" for blank/invalid
  const safeNum = (v) => { if(v===""||v===null||v===undefined) return ""; const n=parseFloat(v); return isFinite(n)?n:""; };
  // Convierte un objeto data → row (ordenado según headers)
  const dataToRow = (a) => [
    isValidDate(a.fecha||"") ? a.fecha : "",
    sanitizeStr(a.corrida_larv || ""),
    sanitizeStr(a.modulo_larv  || ""),
    sanitizeStr(a.area         || ""),
    sanitizeStr(a.sistema      || ""),
    (() => { const n = safeNum(a.lote); return (n !== "" && n >= 1 && n <= 30) ? n : ""; })(),
    safeNum(a.dia_proceso),
    safeNum(a.cel_ml),
    safeNum(a.protozoarios),
    sanitizeStr(a.especie || ""),
    safeNum(a.salinidad),
    safeNum(a.ph),
    safeNum(a.temperatura),
    safeNum(a.intensidad),
    (sanitizeStr(a.descarte || "") === "Si") ? "Si" : "",
    // obs es ahora un CSV de frases (multiselección); puede superar el tope de
    // 200 de sanitizeStr. Se permite hasta 480 (bajo el límite 500 del GAS) y
    // se elimina cualquier carácter inicial de fórmula por seguridad.
    String(a.obs || "").replace(/^[=+\-@]+/, "").slice(0, 480),
    safeNum(a.ciliados),
    safeNum(a.filamentosos),
    sanitizeStr(a.tec || gcfg("tec","") || "")
  ];
  const rows = [];
  const source = Array.isArray(histSnapshot) ? histSnapshot : loadAlgHist();
  source.forEach(h => { if(h && h.data) rows.push(dataToRow(h.data)); });
  return { sheetName:"Lab_Algas", headers, rows };
}

/* ══════════════════════════════════════════
   FICHA LAB. ALGAS — RENDER
   Dynamic selects: Sistema depends on Area_Algas.
   Lote shows only for FM/FP.
   Dia_Proceso shows for M…, PM…, PBR….
══════════════════════════════════════════ */

// Sistema options per area type
const ALG_SISTEMAS = {
  sala:   ["FM","FP"],
  mod:    [...Array.from({length:15},(_,i)=>"M"+(i+1)),
           ...Array.from({length:15},(_,i)=>"PM"+(i+1))],
  cepario:["C1","C2","C3","C4"],
  none:   ["PBR1","PBR2","PBR3","PBR4"]
};

// Observaciones de Lab. Algas: lista cerrada de frases para multiselección
// (chips), en lugar de texto libre. Se guardan como CSV en el campo `obs`.
const ALG_OBS_OPTS = [
  "Células llenas","Células semillenas","Células Vacías","Tanque con Filos",
  "Buena división celular","Baja división celular","Tanque con espuma verde",
  "Tanque pasado del día de uso","Células agrupadas","Grumos","Filamentosas"
];

function algAreaType(area){
  if(!area) return "none";
  if(area.startsWith("Sala"))    return "sala";
  if(area.startsWith("MOD"))     return "mod";
  if(area.startsWith("Cepario")) return "cepario";
  return "none";
}

function buildSistemaOpts(area, cur){
  const type = algAreaType(area);
  return ALG_SISTEMAS[type].map(s =>
    `<option value="${s}"${s===cur?" selected":""}>${s}</option>`
  ).join("");
}

function algSistemaType(sistema){
  if(!sistema) return "none";
  if(sistema==="FM"||sistema==="FP") return "fmfp";
  // M1-M15, PM1-PM15, PBR1-PBR4 → show Día Proceso
  if(/^P?M\d/.test(sistema)||sistema.startsWith("PBR")) return "masivo";
  return "none";
}

// Scope to fp-algas to avoid stale matches on hidden panels
function _algFp(){ return document.getElementById("fp-algas"); }

function algAreaChange(){
  const fp   = _algFp(); if(!fp) return;
  const area = fp.querySelector('[name="area"]')?.value || "";
  const sisEl = fp.querySelector('[name="sistema"]');
  if(!sisEl) return;
  sisEl.innerHTML = `<option value="">— Selecciona —</option>` + buildSistemaOpts(area, "");
  algSistemaChange();
}

function algSistemaChange(){
  const fp  = _algFp(); if(!fp) return;
  const sis   = fp.querySelector('[name="sistema"]')?.value || "";
  const stype = algSistemaType(sis);
  const loteRow = document.getElementById("alg-lote-row");
  const diaRow  = document.getElementById("alg-dia-row");
  if(loteRow) loteRow.style.display = (stype==="fmfp")   ? "flex" : "none";
  if(diaRow)  diaRow.style.display  = (stype==="masivo") ? "flex" : "none";
}

function renderAlgas(){
  const fp  = document.getElementById("fp-algas");
  if(!fp) return;
  const e   = loadE(curMod,"algas"); const d = e?e.data:{};
  const tec = escapeHtml(d.tec || gcfg("tec",""));
  const area    = d.area    || "";
  const sistema = d.sistema || "";
  const stype   = algSistemaType(sistema);

  const areaOpts = [
    `<optgroup label="Módulos">`,
    ...Array.from({length:10}, (_,i)=>`<option value="MOD${i+1}"${area==="MOD"+(i+1)?" selected":""}>MOD${i+1}</option>`),
    `</optgroup>`,
    `<optgroup label="Ceparios">`,
    `<option value="Cepario 1"${area==="Cepario 1"?" selected":""}>Cepario 1</option>`,
    `<option value="Cepario 2"${area==="Cepario 2"?" selected":""}>Cepario 2</option>`,
    `</optgroup>`,
    `<optgroup label="Salas">`,
    ...Array.from({length:4}, (_,i)=>`<option value="Sala ${i+1}"${area==="Sala "+(i+1)?" selected":""}>Sala ${i+1}</option>`),
    `</optgroup>`
  ].join("");

  const sistemaOpts = `<option value="">— Selecciona —</option>` + buildSistemaOpts(area, sistema);

  // Observaciones → multiselección por chips. Conjunto marcado derivado del CSV.
  const _obsSet = new Set((d.obs||"").split(",").map(s=>s.trim()).filter(Boolean));
  const obsChips = ALG_OBS_OPTS.map(s=>{
    const checked = _obsSet.has(s) ? " checked" : "";
    return `<label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;background:#fff;padding:5px 11px;border-radius:14px;border:1.5px solid var(--bdr)">
      <input type="checkbox" data-group="obs" value="${escapeHtml(s)}"${checked} style="margin:0;accent-color:var(--teal)">
      ${escapeHtml(s)}
    </label>`;
  }).join("");

  fp.innerHTML = `<div class="fc">
  <div class="fc-h">
    <div class="fc-t">🌿 Lab. Algas — Registro Diario</div>
    ${sspill(getStatus(curMod,"algas"))}
  </div>
  <div class="fc-b">
    <div class="meta">
      <div class="mf"><label>Módulo</label><input value="${mLabel(curMod)}" readonly></div>
      <div class="mf"><label>Fecha</label>
        <input type="date" name="fecha" value="${d.fecha||today()}"></div>
      <div class="mf"><label>Corrida Larv.</label>
        <input name="corrida_larv" value="${ev(d,'corrida_larv')}" placeholder="Ej. 332 ó 333-334">
        <span class="alg-hint">Único: 332 · Rango: 333-334</span></div>
      <div class="mf"><label>Módulo Larv.</label>
        <input name="modulo_larv" value="${ev(d,'modulo_larv')}" placeholder="Ej. 1 ó 5-6">
        <span class="alg-hint">Único: 1 · Rango: 5-6</span></div>
      <div class="mf"><label>Descarte</label>
        <select name="descarte">
          <option value=""${(d.descarte||"")===""?" selected":""}>— No aplica —</option>
          <option value="Si"${(d.descarte||"")==="Si"?" selected":""}>Si</option>
        </select></div>
    </div>
    <div class="meta">
      <div class="mf"><label>Área Algas</label>
        <select name="area" onchange="algAreaChange()">
          <option value="">— Selecciona —</option>
          ${areaOpts}
        </select></div>
      <div class="mf"><label>Sistema</label>
        <select name="sistema" onchange="algSistemaChange()">
          ${sistemaOpts}
        </select></div>
      <div class="mf alg-row" id="alg-lote-row" style="display:${stype==="fmfp"?"flex":"none"}">
        <label>Lote (solo FM/FP, 1-30)</label>
        <input type="number" name="lote" value="${vl(d,'lote')}" placeholder="1 – 30" min="1" max="30" step="1"></div>
      <div class="mf alg-row" id="alg-dia-row" style="display:${stype==="masivo"?"flex":"none"}">
        <label>Día Proceso (0-5)</label>
        <input type="number" name="dia_proceso" value="${vl(d,'dia_proceso')}" min="0" max="5" step="1"></div>
    </div>
    <div class="meta">
      <div class="mf"><label>Cel/mL</label>
        <input type="number" name="cel_ml" value="${vl(d,'cel_ml')}" placeholder="Ej. 280000" step="1000" min="0"></div>
      <div class="mf"><label>Protozoarios</label>
        <input type="number" name="protozoarios" value="${vl(d,'protozoarios')}" placeholder="Conteo" step="1" min="0"></div>
      <div class="mf"><label>Especie</label>
        <select name="especie">
          ${["","Tw","Tt","Iso","Ch"].map(s=>
            `<option value="${s}"${(d.especie||"")===s?" selected":""}>${s||"— Selecciona —"}</option>`
          ).join("")}
        </select></div>
      <div class="mf"><label>Ciliados</label>
        <input type="number" name="ciliados" value="${vl(d,'ciliados')}" placeholder="Conteo" step="1" min="0"></div>
      <div class="mf"><label>Filamentosos</label>
        <input type="number" name="filamentosos" value="${vl(d,'filamentosos')}" placeholder="Conteo" step="1" min="0"></div>
    </div>
    <div class="meta">
      <div class="mf"><label>Salinidad (ppt)</label>
        <input type="number" name="salinidad" value="${vl(d,'salinidad')}" placeholder="32.22" step="0.01" min="0"></div>
      <div class="mf"><label>pH</label>
        <input type="number" name="ph" value="${vl(d,'ph')}" placeholder="7.33" step="0.01" min="0" max="14"></div>
      <div class="mf"><label>Temperatura (°C)</label>
        <input type="number" name="temperatura" value="${vl(d,'temperatura')}" placeholder="8.67" step="0.01"></div>
      <div class="mf"><label>Intensidad Luz (%)</label>
        <input type="number" name="intensidad" value="${vl(d,'intensidad')}" placeholder="40.5" step="0.1" min="0" max="100"></div>
    </div>
    <div class="ffoot">
      <div class="ff" style="min-width:260px;flex-basis:100%"><label>Observaciones <span style="font-weight:500;text-transform:none;color:#64748b">— selecciona las que apliquen</span></label>
        <div style="display:flex;flex-wrap:wrap;gap:6px 8px;padding:8px;background:var(--surf);border:1.5px solid var(--bdr);border-radius:10px">
          ${obsChips}
        </div></div>
      <div class="ff"><label>Técnico Responsable</label>
        <input name="tec" value="${tec}" placeholder="Nombre del técnico"></div>
    </div>
    ${algHistBlock()}
    ${saveArea("algas")}
  </div>
</div>`;
}

/* ── Bloque visual del historial Lab. Algas (lista de pendientes) ── */
function algHistBlock(){
  const list = loadAlgHist();
  const head = `<div class="alg-hist-h">
      <div class="alg-hist-h-l">
        📋 Historial pendiente de sincronizar
        <span class="alg-hist-cnt">${list.length}/${ALGHIST_MAX}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${list.length ? `<button class="btn bd" onclick="clearAlgHistConfirm()" style="font-size:10.5px;padding:5px 10px">🗑 Vaciar todo</button>` : ""}
      </div>
    </div>`;
  if(!list.length){
    return `<div class="alg-hist">
      ${head}
      <div class="alg-hist-empty">
        Aún no hay registros en el historial.<br>
        Llena el formulario y pulsa <b>📋 Agregar al historial</b> para encolarlo.<br>
        Al pulsar <b>☁️ Guardar y sincronizar</b> se enviarán todos a la hoja <code>Lab_Algas</code>.
      </div>
    </div>`;
  }
  const items = list.map((h,i)=>{
    const ts = new Date(h.ts).toLocaleString("es-EC",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
    const a  = h.data || {};
    const fld = (lbl, val) => `<span><b>${lbl}:</b> ${escapeHtml(String(val===0?0:(val||'—')))}</span>`;
    const isEditing = (h.id === _algEditingId);
    const safeId = escapeHtml(h.id);
    return `<div class="alg-hist-item${isEditing?' editing':''}">
      <span class="alg-hist-num">#${i+1}</span>
      <div class="alg-hist-body">
        <div class="alg-hist-ts">📅 ${escapeHtml(ts)} · Fecha: ${escapeHtml(a.fecha||today())}${isEditing?' · <b style="color:#7c3aed">✏️ Editando</b>':''}</div>
        <div class="alg-hist-fields">
          ${fld("Área",       a.area)}
          ${fld("Sistema",    a.sistema)}
          ${fld("Especie",    a.especie)}
          ${fld("Cel/mL",     a.cel_ml)}
          ${fld("Día Proc.",  a.dia_proceso)}
          ${fld("Lote",       a.lote)}
          ${fld("Sal (ppt)",  a.salinidad)}
          ${fld("pH",         a.ph)}
          ${fld("T (°C)",     a.temperatura)}
          ${fld("Luz (%)",    a.intensidad)}
          ${fld("Proto.",     a.protozoarios)}
          ${fld("Ciliados",   a.ciliados)}
          ${fld("Filam.",     a.filamentosos)}
          ${fld("Corrida L.", a.corrida_larv)}
          ${fld("Mód. L.",    a.modulo_larv)}
          ${a.descarte === "Si" ? `<span style="background:#fee2e2;color:#991b1b;font-weight:800;padding:1px 8px;border-radius:8px"><b>Descarte:</b> Si</span>` : ""}
        </div>
      </div>
      <div class="alg-hist-actions">
        <button class="alg-hist-edit" onclick="editAlgHistEntry('${safeId}')" title="Editar este registro · al pulsar 💾 se actualizará en lugar de duplicarse">✏️</button>
        <button class="alg-hist-del"  onclick="removeAlgHistConfirm('${safeId}')" title="Eliminar este registro del historial">🗑</button>
      </div>
    </div>`;
  }).join("");
  return `<div class="alg-hist">
    ${head}
    <div class="alg-hist-list">${items}</div>
    <div style="margin-top:8px;font-size:10.5px;color:#0f766e;line-height:1.6">
      ℹ️ Solo los registros del historial se sincronizan a <code>Lab_Algas</code>. Tras un envío exitoso pasan a la <b>Bitácora</b> (72 h) y el historial se vacía automáticamente.
    </div>
  </div>`;
}

/* ══════════════════════════════════════════
   BITÁCORA — vista de registros sincronizados
   (TTL 72 h). Cada registro tiene menú "⋮"
   con Editar (vuelca a la ficha) y Borrar.
══════════════════════════════════════════ */
function renderBitacora(){
  const fp = document.getElementById("fp-bitacora");
  if(!fp) return;
  if(!isLabMod(curMod)){ fp.innerHTML = ""; return; }

  const list = loadAlgLog(); // ya filtrada por TTL 72 h, ordenada desc

  if(list.length === 0){
    fp.innerHTML = `<div class="fc">
      <div class="fc-h">
        <div class="fc-t">📑 Bitácora · Lab. Algas</div>
        <span class="ssp ssp-mt">0 registros · 72 h</span>
      </div>
      <div class="fc-b">
        <div class="bit-empty">
          <span class="bit-empty-ico">📑</span>
          Aún no hay registros sincronizados en las últimas 72 horas.<br>
          <small style="margin-top:6px;display:block;opacity:.75">Cada vez que sincronices el historial a <code>Lab_Algas</code>, los registros aparecerán aquí.</small>
        </div>
      </div>
    </div>`;
    return;
  }

  const fmtTtl = (syncedAt) => {
    const left = ALGLOG_TTL_MS - (Date.now() - syncedAt);
    if(left <= 0) return "expira pronto";
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    return h >= 1 ? ("expira en "+h+" h "+m+" min") : ("expira en "+m+" min");
  };

  // ── Agrupa registros por fecha (a.fecha) y arma un bloque por día ──
  const groups = {};
  list.forEach(h => {
    const f = (h.data && h.data.fecha) ? h.data.fecha : "sin-fecha";
    if(!groups[f]) groups[f] = [];
    groups[f].push(h);
  });
  // Días ordenados descendente (más reciente primero)
  const days = Object.keys(groups).sort((a,b) => b.localeCompare(a));

  const itemHtml = (h) => {
    const a = h.data || {};
    const fechaSinc = new Date(h.syncedAt).toLocaleString("es-EC",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
    const fecha   = a.fecha || "—";
    const modL    = a.modulo_larv || "—";
    const area    = a.area    || "—";
    const sistema = a.sistema || "—";
    const especie = a.especie || "";
    const cel     = (a.cel_ml === 0 || a.cel_ml) ? a.cel_ml : "";
    const descarte = a.descarte === "Si";
    return `<div class="bit-item">
      <div class="bit-icon" aria-hidden="true">🌿</div>
      <div class="bit-body">
        <div class="bit-title">
          <span><b>📅 ${escapeHtml(fecha)}</b></span>
          <span class="bit-tag mod">Mód. L. ${escapeHtml(String(modL))}</span>
          <span class="bit-tag area">${escapeHtml(area)}</span>
          <span class="bit-tag sis">${escapeHtml(sistema)}</span>
          ${descarte ? `<span class="bit-tag" style="background:#fee2e2;color:#991b1b">Descarte: Si</span>` : ""}
        </div>
        <div class="bit-meta">
          ${especie ? `<span><b>Especie:</b> ${escapeHtml(especie)}</span>` : ""}
          ${cel!=="" ? `<span><b>Cel/mL:</b> ${escapeHtml(String(cel))}</span>` : ""}
          <span><b>Sincronizado:</b> ${escapeHtml(fechaSinc)}</span>
          <span class="bit-ttl">⏱ ${escapeHtml(fmtTtl(h.syncedAt))}</span>
        </div>
      </div>
      <button class="hist-more" type="button"
        aria-label="Acciones del registro"
        onclick="openBitMenu(event,'${escapeHtml(h.id)}')">⋮</button>
    </div>`;
  };

  const dayBlocks = days.map(d => {
    const items = groups[d].map(itemHtml).join("");
    const safeD = escapeHtml(d);
    return `<div class="bit-day-group">
      <div class="bit-day-header">
        <span class="bit-day-date">📅 ${safeD} <span style="color:#0e7490;font-weight:600;font-size:11px;margin-left:6px">· ${groups[d].length} registro${groups[d].length!==1?'s':''}</span></span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="bit-day-pdf" type="button"
            style="background:linear-gradient(135deg,#0f766e,#00bfa5);border-color:rgba(0,191,165,.45);box-shadow:0 2px 8px rgba(0,191,165,.25)"
            onclick="resyncBitacoraDay('${safeD}')"
            title="Reenvía a Google Sheets (hoja Lab_Algas) todos los registros sincronizados de este día">☁️ Reenviar día</button>
          <button class="bit-day-pdf" type="button" onclick="downloadBitacoraPDF('${safeD}')" title="Genera un PDF con todos los registros sincronizados de este día">📄 PDF del día</button>
        </div>
      </div>
      <div class="bit-list">${items}</div>
    </div>`;
  }).join("");

  fp.innerHTML = `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📑 Bitácora · Lab. Algas</div>
      <span class="ssp ssp-mt">${list.length} registro${list.length!==1?'s':''} · 72 h</span>
    </div>
    <div class="fc-b">
      ${dayBlocks}
      <div style="margin-top:10px;font-size:10.5px;color:var(--tx3);line-height:1.6">
        ℹ️ Los registros se eliminan automáticamente tras <b>72 horas</b> desde su sincronización. Usa <b>⋮</b> para editar o borrar; <b>📄 PDF del día</b> genera un reporte con todos los registros de esa fecha.
      </div>
    </div>
  </div>`;
}

/* ── PDF de la Bitácora · un PDF por día con todos los registros ── */
function downloadBitacoraPDF(fecha){
  if(!isLabMod(curMod)){ toast("Solo disponible en Lab. Algas","warn"); return; }
  const list = loadAlgLog().filter(h => h && h.data && (h.data.fecha||"") === fecha);
  if(list.length === 0){ toast("Sin registros para "+fecha,"warn"); return; }

  const ts     = new Date();
  const tsStr  = ts.toLocaleString('es-EC',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const codigo = genCodigo('algas', curMod, fecha);
  const tec    = gcfg('tec','');

  // Reusa pdfVal para celdas vacías (— en gris)
  const cell = (v) => (v!==undefined && v!=="" && v!==null) ? escapeHtml(String(v)) : '<span class="empty">—</span>';

  const headers = ['#','Sinc.','Corrida L.','Mód. L.','Área','Sistema','Lote','Día Proc.','Especie','Cel/mL','Proto.','Ciliados','Filam.','Sal (ppt)','pH','T (°C)','Luz (%)','Descarte','Observaciones','Técnico'];
  const rowsHtml = list
    .slice()
    .sort((a,b)=> (a.syncedAt||0) - (b.syncedAt||0))
    .map((h, idx) => {
      const a = h.data || {};
      const sinc = new Date(h.syncedAt).toLocaleString('es-EC',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      return `<tr>
        <td class="tqc">${idx+1}</td>
        <td>${escapeHtml(sinc)}</td>
        <td>${cell(a.corrida_larv)}</td>
        <td>${cell(a.modulo_larv)}</td>
        <td>${cell(a.area)}</td>
        <td>${cell(a.sistema)}</td>
        <td>${cell(a.lote)}</td>
        <td>${cell(a.dia_proceso)}</td>
        <td>${cell(a.especie)}</td>
        <td>${cell(a.cel_ml)}</td>
        <td>${cell(a.protozoarios)}</td>
        <td>${cell(a.ciliados)}</td>
        <td>${cell(a.filamentosos)}</td>
        <td>${cell(a.salinidad)}</td>
        <td>${cell(a.ph)}</td>
        <td>${cell(a.temperatura)}</td>
        <td>${cell(a.intensidad)}</td>
        <td>${a.descarte==='Si' ? '<b style="color:#991b1b">Si</b>' : '<span class="empty">—</span>'}</td>
        <td style="text-align:left;max-width:140px;white-space:normal;word-break:break-word">${cell(a.obs)}</td>
        <td>${cell(a.tec)}</td>
      </tr>`;
    }).join('');

  // Nombre por defecto del archivo
  const fDate = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : today();
  const fileName = 'BIT_' + fDate + '_' + mLabel(curMod);
  const title    = escapeHtml(fileName);

  const headHtml = `<div class="ph">
    <div class="ph-brand">
      <div class="co">OMARSA · Larvicultura</div>
      <div class="su">Bitácora Lab. Algas</div>
    </div>
    <div class="ph-center"><span class="doc-code">OMR-LAB-ALG-BIT</span></div>
    <div class="ph-right">
      <div class="mod">${mLabel(curMod)}</div>
      <div class="mods">Lab. Algas</div>
    </div>
  </div>
  <div class="ftitle">📑 Bitácora · ${escapeHtml(fecha)}</div>
  <div class="mgrid">
    <div class="mf"><label>Fecha</label><span>${escapeHtml(fecha)}</span></div>
    <div class="mf"><label>Registros</label><span>${list.length}</span></div>
    <div class="mf"><label>Generado</label><span>${escapeHtml(tsStr)}</span></div>
    <div class="mf"><label>Técnico</label><span>${escapeHtml(tec||'—')}</span></div>
  </div>`;

  const footHtml = `<div class="pfoot">
    <div>
      <div style="font-size:6pt;color:#64748b;margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px">Código verificador</div>
      <div class="code-box">${codigo}</div>
      <div class="ts-txt" style="margin-top:2px">Generado el ${escapeHtml(tsStr)}</div>
    </div>
    <div style="text-align:center;min-width:140px">
      <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">
        ${escapeHtml(tec||'Técnico Responsable')}
      </div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Firma del Responsable</div>
    </div>
    <div style="text-align:center;min-width:120px">
      <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">Supervisor</div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Visto Bueno</div>
    </div>
  </div>`;

  const page = `<!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${pdfCss('params')}</style>
  </head><body>
  <div class="ppage">
    ${headHtml}
    <table>
      <thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="spacer"></div>
    ${footHtml}
  </div>
  <script>
    try { document.title = ${JSON.stringify(fileName)}; } catch(_){}
    var _printed=false;
    function doPrint(){if(_printed)return;_printed=true;setTimeout(function(){window.print();},350);}
    if(document.readyState==='complete')doPrint();
    else window.addEventListener('load',doPrint,{once:true});
  <\/script></body></html>`;

  const w = window.open('','_blank','width=1100,height=720');
  if(!w){ toast('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.','warn',6000); return; }
  w.document.write(page);
  w.document.close();
  try { w.document.title = fileName; } catch(_){}
  toast('📄 PDF Bitácora: ' + fileName + ' · ' + list.length + ' reg.','ok',5500);
}

/* ── Reenviar a Google Sheets los registros de la Bitácora de un día ──
   La Bitácora guarda los registros ya sincronizados (TTL 72 h). Este botón
   reconstruye el payload Lab_Algas SÓLO con los registros cuya data.fecha
   coincide con la fecha pedida y los reenvía. Con la clave de upsert ampliada
   (Fecha+Corrida+Módulo+Área+Sistema+Lote+Día), cada registro distinto crea o
   actualiza su propia fila — útil para recuperar registros que se hubieran
   fusionado con la clave anterior. No altera la Bitácora local. */
async function resyncBitacoraDay(fecha){
  if(!isLabMod(curMod)){ toast("Solo disponible en Lab. Algas","warn"); return; }
  const list = loadAlgLog().filter(h => h && h.data && (h.data.fecha||"") === fecha);
  if(list.length === 0){ toast("Sin registros en la bitácora para "+fecha,"warn",3000); return; }
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script primero","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL de script inválida","err"); openCfg(); return; }
  if(!confirm("¿Reenviar a Google Sheets los "+list.length+" registro(s) del "+fecha+"?\nSe crearán o actualizarán las filas correspondientes en la hoja Lab_Algas. No afecta a otras fechas.")) return;
  if(!syncRateOk()) return;

  setSyncUI("pend","Reenviando "+list.length+" registro(s) del "+fecha+"…");
  toast("Reenviando "+list.length+" registro(s) del "+fecha+"…","info",2500);
  const payload = buildAlgasPayload(curMod, list);
  if(!payload.rows.length){
    setSyncUI("idle","Sin datos");
    toast("No hay filas válidas para reenviar","warn",3500);
    return;
  }
  const sent = await postPayload(payload, url);
  if(sent){
    setSyncUI("ok", list.length+" registro(s) reenviado(s) ✔");
    toast("✅ "+list.length+" registro(s) del "+fecha+" reenviados a Lab_Algas","ok",4500);
    setTimeout(()=> setSyncUI("idle","Todo sincronizado"), 3500);
  } else {
    setSyncUI("err","Error al reenviar");
    toast("No fue posible reenviar a Google Sheets. Revisa la conexión y reintenta.","err",4500);
  }
}

/* ── Menú flotante ⋮ específico de Bitácora ── */
function openBitMenu(ev, id){
  if(ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
  closeHistMenu();
  if(!ev || !ev.currentTarget) return;
  const btn = ev.currentTarget;
  const menu = document.createElement("div");
  menu.className = "hist-menu";
  menu.setAttribute("role","menu");
  const safeId = escapeHtml(id);
  menu.innerHTML =
    `<button type="button" role="menuitem" onclick="bitEdit('${safeId}')">✏️ Editar</button>` +
    `<button type="button" role="menuitem" class="del" onclick="bitDelete('${safeId}')">🗑 Borrar</button>`;
  document.body.appendChild(menu);
  const rect   = btn.getBoundingClientRect();
  const menuW  = 160;
  const left   = Math.max(8, Math.min(window.innerWidth - menuW - 8, rect.right - menuW));
  const top    = Math.min(window.innerHeight - 110, rect.bottom + 4);
  menu.style.top  = top + "px";
  menu.style.left = left + "px";
  _histMenu = menu;
  setTimeout(() => document.addEventListener("click", closeHistMenu, {once:true}), 0);
}

function bitEdit(id){
  closeHistMenu();
  const h = getAlgLogEntry(id);
  if(!h){ toast("Registro no encontrado o expirado","warn"); return; }
  // Vuelca el registro a la ficha de Lab. Algas, lo elimina de la bitácora
  // (cuando el usuario vuelva a registrar/agregar al historial y sincronizar
  // se actualizará la fila existente en Sheets vía upsert por
  // Fecha|Corrida_Larv|Modulo_Larv|Area_Algas|Sistema|Lote|Dia_Proceso —
  // ver upsertAlgasRows en la GAS).
  _algEditingId = null;  // limpia modo edición del historial pendiente, si lo había
  saveE(curMod, "algas", Object.assign({}, h.data), false);
  removeAlgLogById(id);
  selTab("algas");
  renderAlgas();
  updateDots(); updateSyncUI();
  toast("✏️ Registro cargado · modifícalo, agrégalo al historial y sincroniza para actualizar Sheets","ok",5500);
}

function bitDelete(id){
  closeHistMenu();
  const h = getAlgLogEntry(id);
  if(!h){ toast("Registro no encontrado","warn"); return; }
  if(!confirm("¿Borrar este registro de la bitácora?\nNo afecta a lo ya enviado a Google Sheets.")) return;
  removeAlgLogById(id);
  renderBitacora();
  toast("Registro eliminado de la bitácora","ok",2500);
}
/* ══════════════════════════════════════════
   MADURACIÓN — módulo CRUD con 3 vistas
   (Salas / Tanques / Lotes).
   Almacenamiento por ficha en una única clave
   (lista JSON) con flag `synced`. Sync por upsert:
     • Maduración Sala     → Fecha + Sala
     • Maduración Tanques  → Fecha + Sala + Tanque
     • Maduración Lotes    → Fecha + Sala + Fila
══════════════════════════════════════════ */
function madKey(ficha){ return MAD_PRE + ficha; }
function loadMad(ficha){
  if(!MAD_FICHAS.includes(ficha)) return [];
  try{
    const raw = localStorage.getItem(madKey(ficha));
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(x){ return []; }
}
function saveMadList(ficha, list){
  if(!MAD_FICHAS.includes(ficha)) return false;
  // Persistencia VERIFICADA (igual que Mic/Bio/AsT): _lsSet hace lectura-tras-
  // escritura + reclaim y devuelve false si el navegador NO persistió (cuota /
  // incógnito). Antes era setItem crudo con el retorno descartado → los guardados
  // de Maduración podían reportar "guardado" en falso.
  const ok = _lsSet(madKey(ficha), JSON.stringify(list||[]));
  if(!ok && !_reclaiming) toast("❌ Este navegador NO está guardando los datos (almacenamiento lleno, en modo privado o bloqueado). Usa ☁️ Guardar y sincronizar para no perderlos.","err",7000);
  return ok;
}

// ── Maduración · estado "grilla sin guardar" + commit/recuperación ───────
let _madGridDirty = false;                          // grilla activa con datos AÚN sin guardar
const _madRendered = { salas:null, tanques:null, lotes:null };  // {sala,fecha} con que se renderizó cada grilla
function _madDirty(ev){
  // Solo celdas de la grilla; ignora los selectores Sala/Fecha (viven en .meta).
  if(ev && ev.target && ev.target.closest && ev.target.closest(".meta")) return;
  _madGridDirty = true;
}
// Bind del marcado "sin guardar" + registro del contexto renderizado. Se llama al
// final de cada renderMadX (el panel persiste → addEventListener una sola vez).
function _madAfterRender(ficha){
  const fp = document.getElementById("fp-"+ficha);
  if(!fp) return;
  if(!fp._madDirtyBound){
    fp._madDirtyBound = true;
    fp.addEventListener("input",  _madDirty);
    fp.addEventListener("change", _madDirty);
  }
  const fechaEl = document.getElementById("mad-"+ficha+"-fecha");
  const fecha = (fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today();
  const sala = ficha==="salas" ? "" : (ficha==="tanques" ? _madTanquesSala : _madLotesSala);
  _madRendered[ficha] = { sala, fecha };
  _madGridDirty = false;   // la grilla recién renderizada refleja lo persistido (limpio)
}
// Merge de una fila recolectada en la lista persistida (clave por ficha).
function _madMergeRow(list, ficha, data){
  let ex;
  if(ficha==="salas")        ex = list.find(r=> r&&r.data&&r.data.fecha===data.fecha&&r.data.sala===data.sala);
  else if(ficha==="tanques") ex = list.find(r=> r&&r.data&&r.data.fecha===data.fecha&&r.data.sala===data.sala&&String(r.data.tanque)===String(data.tanque));
  else                       ex = list.find(r=> r&&r.data&&r.data.fecha===data.fecha&&r.data.sala===data.sala&&String(r.data.fila)===String(data.fila));
  if(ex){
    const merged = Object.assign({}, ex.data);
    Object.keys(data).forEach(k=>{ if(data[k]!==""&&data[k]!=null) merged[k]=data[k]; });
    ex.data = merged; ex.synced=false; ex.ts=Date.now();
  } else {
    list.unshift({ id: Date.now().toString(36)+Math.random().toString(36).slice(2,6), ts:Date.now(), synced:false, syncedAt:null, data });
  }
}
// Persiste (silencioso, sin re-render) la grilla activa usando el contexto con que
// se renderizó. Se llama ANTES de cambiar de sala/fecha o de pestaña.
function _madCommitActive(){
  if(!isMadMod(curMod) || !MAD_FICHAS.includes(curTab)) return;
  const r = _madRendered[curTab]; if(!r) return;
  try{
    if(curTab==="salas")        saveMadSalasGrid({ fechaOverride:r.fecha, silent:true, noRender:true });
    else if(curTab==="tanques") saveMadTanquesGrid({ salaOverride:r.sala, fechaOverride:r.fecha, silent:true, noRender:true });
    else                        saveMadLotesGrid({ salaOverride:r.sala, fechaOverride:r.fecha, silent:true, noRender:true });
  }catch(_){}
}
// Autoguardado de recuperación (espejo de Biomol): la grilla activa cada 60s y en goBack.
function saveMadRecovery(){
  if(!isMadMod(curMod) || !MAD_FICHAS.includes(curTab)) return;
  const ficha = curTab;
  let rows = [];
  try{ rows = ficha==="salas" ? _collectSalasGrid() : ficha==="tanques" ? _collectTanquesGrid() : _collectLotesGrid(); }catch(_){ return; }
  if(!rows.length) return;
  const sala = ficha==="salas" ? "" : (ficha==="tanques" ? _madTanquesSala : _madLotesSala);
  const fechaEl = document.getElementById("mad-"+ficha+"-fecha");
  const fecha = (fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today();
  _lsSet(MAD_RECOV_KEY, JSON.stringify({ ficha, sala, fecha, ts:Date.now(), rows }));
}
function loadMadRecovery(){
  try{
    const raw = localStorage.getItem(MAD_RECOV_KEY);
    if(!raw) return null;
    const e = JSON.parse(raw);
    if(!e || !MAD_FICHAS.includes(e.ficha) || !Array.isArray(e.rows) || !e.ts) return null;
    if(Date.now() - e.ts > RTTL){ localStorage.removeItem(MAD_RECOV_KEY); return null; }
    return e;
  }catch(_){ return null; }
}
function recoverMadGrid(){
  const rec = loadMadRecovery();
  if(!rec){ toast("No hay datos de recuperación disponibles","warn"); return; }
  const ts = new Date(rec.ts).toLocaleString("es-EC");
  if(!confirm("¿Recuperar las "+rec.rows.length+" fila(s) autoguardadas el "+ts+"?\nSe combinarán con la grilla guardada.")) return;
  if(rec.ficha==="tanques") _madTanquesSala = rec.sala;
  if(rec.ficha==="lotes")   _madLotesSala   = rec.sala;
  const list = loadMad(rec.ficha);
  rec.rows.forEach(data=>{
    _madMergeRow(list, rec.ficha, data);
    if(rec.ficha==="tanques" && data.lote) setMadLote(rec.sala, data.tanque, data.lote);
  });
  saveMadList(rec.ficha, list);
  try{ localStorage.removeItem(MAD_RECOV_KEY); }catch(_){}
  _madGridDirty = false;
  renderMad(rec.ficha);
  const fEl = document.getElementById("mad-"+rec.ficha+"-fecha");
  if(fEl && isValidDate(rec.fecha)){ fEl.value = rec.fecha; renderMad(rec.ficha); }
  toast("✅ Filas recuperadas del autoguardado","ok",4000);
}

// ── (Maduración) CRUD viejo de formulario/lista ELIMINADO ─────────────
// El flujo form+lista+filtros+sync-uno-a-uno quedó obsoleto al migrar
// Salas/Tanques/Lotes a grillas del día. Funciones huérfanas eliminadas.
// Se conservan applyMadFilters (la usa downloadMadPDF) y _madSalaOpts
// (la usan las grillas de Tanques/Lotes).
function applyMadFilters(ficha, list){
  const f = _madFilters[ficha] || {};
  return list.filter(r => {
    const d = r.data || {};
    if(f.fecha && d.fecha !== f.fecha) return false;
    if(f.sala  && d.sala  !== f.sala)  return false;
    if(f.lote  && String(d.lote||"").toLowerCase().indexOf(String(f.lote).toLowerCase()) === -1) return false;
    if(f.search){
      const s = String(f.search).toLowerCase();
      const hay = Object.values(d).some(v => String(v==null?"":v).toLowerCase().indexOf(s) !== -1);
      if(!hay) return false;
    }
    return true;
  }).sort((a,b) => (b.ts||0) - (a.ts||0));
}

// ── Helpers de render ──────────────────────────────────
function _madSalaOpts(sel){
  return MAD_SALA_OPTS.map(s => `<option value="${s}"${sel===s?" selected":""}>${s}</option>`).join("");
}
// ── (Maduración) helpers de la lista vieja ELIMINADOS ──────────────────
// _madTanqueOpts/madSalaChangeTanques (la grilla usa _madSalaOpts +
// madTanquesSalaChange) y _madActionBtns/_madStatusBadge/_madItemActions/
// _madListHeader/_madFilterBar/syncOneMadFromList/syncAllPendingMad:
// sin referencias vivas (verificado por grep).

// ── Render dispatcher ──────────────────────────────────
function renderMad(ficha){
  if(ficha === "salas")   renderMadSalas();
  else if(ficha === "tanques") renderMadTanques();
  else if(ficha === "lotes")   renderMadLotes();
  else return;
  // Accesibilidad: asocia labels↔inputs después de cada render de
  // Maduración (igual que renderFicha). El flujo CRUD/sync no cambia.
  fixupLabels(document.getElementById("fp-"+ficha));
}

// ── Render Salas — GRILLA tipo Parámetros ─────────────
// Las 7 salas son filas fijas. Columnas: Estado, RAS, 12 Temperaturas
// (cada 2h), 4 Oxígenos (cada 6h). Un indicador ⏳/✅ por sala.
// Sin historial visual — la grilla ES la vista del día.
const _SALA_TEMP_KEYS = ["temp_02","temp_04","temp_06","temp_08","temp_10","temp_12","temp_14","temp_16","temp_18","temp_20","temp_22","temp_00"];
const _SALA_OX_KEYS   = ["ox_06","ox_12","ox_18","ox_00"];

function renderMadSalas(){
  const fp = document.getElementById("fp-salas");
  if(!fp) return;
  const list = loadMad("salas");
  // #3: la fecha la gobierna el input (antes la vista usaba siempre today() pero
  // el guardado tomaba el input → disonancia). Ahora coinciden.
  const _fechaEl = document.getElementById("mad-salas-fecha");
  const todayStr = (_fechaEl && isValidDate(_fechaEl.value)) ? _fechaEl.value : today();
  const madRec = loadMadRecovery();
  const madRecBtn = (madRec && madRec.ficha === "salas")
    ? `<button class="btn brec" type="button" onclick="recoverMadGrid()" title="Recuperar autoguardado de ${escapeHtml(new Date(madRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))}">↩ Recuperar (${escapeHtml(new Date(madRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))})</button>`
    : "";

  // Mapea registros del día actual a cada sala
  const bySala = {};
  list.forEach(r => {
    if(r && r.data && r.data.fecha === todayStr && r.data.sala){
      bySala[r.data.sala] = r;
    }
  });

  const estadoOpts = (cur) => `<option value="">—</option>
    <option value="Cuarentena"${cur==="Cuarentena"?" selected":""}>Cuarentena</option>
    <option value="Producción"${cur==="Producción"?" selected":""}>Producción</option>`;
  const rasOpts = (cur) => `<option value="">—</option>
    <option value="SI"${cur==="SI"?" selected":""}>SI</option>
    <option value="NO"${cur==="NO"?" selected":""}>NO</option>`;

  const rows = MAD_SALA_OPTS.map((sala,si) => {
    const r = bySala[sala];
    const d = r ? r.data : {};
    const st = r ? (r.synced ? "✅" : "⏳") : "○";
    const tempCells = _SALA_TEMP_KEYS.map((k,ki) =>
      `<td><input class="pinp" type="number" name="sg_${si}_${k}" data-r="${si}" data-c="${2+ki}" onpaste="madGridPaste(event,'salas')" value="${vl(d,k)}" min="0" max="50" step="0.1" inputmode="decimal" placeholder="-"></td>`
    ).join("");
    const oxCells = _SALA_OX_KEYS.map((k,ki) =>
      `<td><input class="pinp" type="number" name="sg_${si}_${k}" data-r="${si}" data-c="${14+ki}" onpaste="madGridPaste(event,'salas')" value="${vl(d,k)}" min="0" max="20" step="0.01" inputmode="decimal" placeholder="-"></td>`
    ).join("");
    return `<tr>
      <td class="tqc" style="font-size:10px;min-width:60px">${escapeHtml(sala)}</td>
      <td style="font-size:10px;text-align:center">${st}</td>
      <td><select name="sg_${si}_estado" data-r="${si}" data-c="0" onpaste="madGridPaste(event,'salas')" style="font-size:10px;min-width:70px">${estadoOpts(d.estado||"")}</select></td>
      <td><select name="sg_${si}_ras" data-r="${si}" data-c="1" onpaste="madGridPaste(event,'salas')" style="font-size:10px;min-width:44px">${rasOpts(d.ras||"")}</select></td>
      ${tempCells}${oxCells}
    </tr>`;
  }).join("");

  const thTemp = _SALA_TEMP_KEYS.map(k => {
    const h = k.replace("temp_","");
    return `<th>${h.slice(0,2)}:${h.slice(2)}</th>`;
  }).join("");
  const thOx = _SALA_OX_KEYS.map(k => {
    const h = k.replace("ox_","");
    return `<th>${h.slice(0,2)}:${h.slice(2)}</th>`;
  }).join("");

  const pending = list.filter(r => r.data && r.data.fecha === todayStr && !r.synced).length;

  fp.innerHTML = `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">🏠 Maduración · Salas</div>
      <span class="ssp ssp-mt">${todayStr} · ${pending ? pending+" pendiente(s)" : "sin pendientes"}</span>
    </div>
    <div class="fc-b">
      <div class="meta" style="margin-bottom:8px">
        <div class="mf"><label>Fecha</label><input type="date" id="mad-salas-fecha" value="${todayStr}" onchange="madSalasFechaChange()"></div>
      </div>
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:11px;color:#065f46;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">ℹ️</span>
        <span>Completa los valores a medida que los registres. Al guardar se crea/actualiza automáticamente la fila de cada sala.</span>
      </div>
      <div class="tw"><table class="ft" style="font-size:10.5px">
        <thead>
          <tr>
            <th class="tqh" style="min-width:60px">Sala</th>
            <th style="min-width:28px">St</th>
            <th>Estado</th>
            <th>RAS</th>
            <th colspan="12" class="thg">Temperatura (°C) · cada 2 horas</th>
            <th colspan="4" class="thg2">O₂ (mg/L) · cada 6 horas</th>
          </tr>
          <tr>
            <th></th><th></th><th></th><th></th>
            ${thTemp}${thOx}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="sa" style="margin-top:12px">
        <div class="sa-info"><span>💾 Guarda para persistir las 7 salas a la vez</span></div>
        <div class="sa-btns">
          <button class="btn bd" type="button" onclick="clearMadSalasGrid()" title="Borrar todos los registros de Salas del día seleccionado">🗑 Borrar día</button>
          <button class="btn bpdf" type="button" onclick="downloadMadPDF('salas')" title="PDF con todos los registros visibles">📄 PDF</button>
          ${madRecBtn}
          <button class="btn bs" type="button" onclick="saveMadSalasGrid()">💾 Guardar local</button>
          <button class="btn bp" type="button" onclick="syncMadSalasGrid()">☁️ Guardar y sincronizar</button>
        </div>
      </div>
    </div>
  </div>`;
  _madAfterRender("salas");
}

// ── Recolecta las 7 filas de la grilla de Salas ────────
function _collectSalasGrid(fechaOverride){
  const fp = document.getElementById("fp-salas");
  if(!fp) return [];
  const fechaEl = document.getElementById("mad-salas-fecha");
  const fecha = isValidDate(fechaOverride) ? fechaOverride : ((fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today());
  const result = [];
  MAD_SALA_OPTS.forEach((sala,si) => {
    const g = (k) => {
      const el = fp.querySelector(`[name="sg_${si}_${k}"]`);
      return el ? el.value : "";
    };
    const data = { fecha, sala, estado: sanitizeStr(g("estado")), ras: sanitizeStr(g("ras")) };
    let hasAny = !!(data.estado || data.ras);
    _SALA_TEMP_KEYS.forEach(k => { const v = g(k); if(v !== ""){ data[k] = sanitizeNum(v,0,50); hasAny = true; } else { data[k] = ""; } });
    _SALA_OX_KEYS.forEach(k =>   { const v = g(k); if(v !== ""){ data[k] = sanitizeNum(v,0,20); hasAny = true; } else { data[k] = ""; } });
    if(hasAny) result.push(data);
  });
  return result;
}

function saveMadSalasGrid(opts){
  opts = opts || {};
  const silent = !!opts.silent;
  const rows = _collectSalasGrid(opts.fechaOverride);
  if(rows.length === 0){ if(!silent) toast("No hay datos para guardar","warn"); return 0; }
  // Carga la lista UNA vez, mergea en memoria y persiste UNA vez (O(n)).
  const list = loadMad("salas");
  let saved = 0;
  rows.forEach(data => { if(!isValidDate(data.fecha)) return; _madMergeRow(list, "salas", data); saved++; });
  const _ok = saveMadList("salas", list);
  if(_ok) _madGridDirty = false;
  if(!opts.noRender) renderMadSalas();
  updateDots(); updateSyncUI();
  if(!_ok) return -1;                  // almacenamiento falló (ya avisó); no mentir "guardado"
  if(!silent) toast("💾 "+saved+" sala(s) guardada(s) localmente","ok",2500);
  return saved;
}

async function syncMadSalasGrid(){
  if(saveMadSalasGrid() === -1) return;   // almacenamiento falló (ya avisó): no enviar datos no persistidos
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL inválida","err"); return; }
  if(!syncRateOk()) return;
  const pending = loadMad("salas").filter(r => !r.synced);
  if(pending.length === 0){ toast("Sin pendientes","info"); return; }
  setSyncUI("pend","Enviando "+pending.length+" sala(s)…");
  const payload = buildMadPayload("salas", pending);
  const sent = await postPayload(payload, url);
  if(sent){
    const list2 = loadMad("salas");
    pending.forEach(p => { const idx = list2.findIndex(x => x.id === p.id); if(idx >= 0){ list2[idx].synced = true; list2[idx].syncedAt = Date.now(); } });
    saveMadList("salas", list2);
    setSyncUI("ok",pending.length+" sala(s) sincronizada(s) ✔");
    toast("✅ Salas enviadas a Google Sheets","ok");
    setTimeout(()=> setSyncUI("idle","Todo sincronizado"), 3500);
  } else {
    setSyncUI("err","Error al sincronizar Salas");
    toast("Error al sincronizar","err",4500);
  }
  renderMadSalas();
  updateDots(); updateSyncUI();
}

function clearMadSalasGrid(){
  const fechaEl = document.getElementById("mad-salas-fecha");
  const fecha = (fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today();
  const list = loadMad("salas");
  const matching = list.filter(r => r && r.data && r.data.fecha === fecha);
  if(matching.length === 0){
    toast("No hay registros de Salas para "+fecha,"info",2500);
    return;
  }
  if(!confirm("¿Borrar los "+matching.length+" registro(s) de Salas del "+fecha+"?\nNo se eliminan las filas ya enviadas a Google Sheets.")) return;
  const ids = new Set(matching.map(r => r.id));
  saveMadList("salas", list.filter(r => !ids.has(r.id)));
  renderMadSalas();
  updateDots(); updateSyncUI();
  toast("🗑 "+matching.length+" registro(s) de Salas borrados","ok",3000);
}

// ── Grilla Tanques (filas = tanques de la sala) ───────
// Columnas EDITABLES en orden — el índice es el data-c usado para el pegado
// desde Excel. El Lote se prellena con el último usado por tanque (editable).
const _TANQ_GRID_COLS = [
  {k:"lote",            type:"text", ph:"BB"},
  {k:"rel_hm",          type:"text", ph:"1:1"},
  {k:"pob_hembras",     type:"int"},
  {k:"pob_machos",      type:"int"},
  {k:"machos_muertos",  type:"int"},
  {k:"hembras_muertas", type:"int"},
  {k:"machos_descarte", type:"int"},
  {k:"hembras_descarte",type:"int"},
  {k:"copulas",         type:"int"},
  {k:"muda",            type:"int"}
];
const _TANQ_GRID_NUM_KEYS = _TANQ_GRID_COLS.filter(c => c.type === "int").map(c => c.k);

function renderMadTanques(){
  const fp = document.getElementById("fp-tanques");
  if(!fp) return;
  const list = loadMad("tanques");
  const sala = _madTanquesSala;
  const fechaEl = document.getElementById("mad-tanques-fecha");
  const fecha = (fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today();
  const madRec = loadMadRecovery();
  const madRecBtn = (madRec && madRec.ficha === "tanques")
    ? `<button class="btn brec" type="button" onclick="recoverMadGrid()" title="Recuperar autoguardado de ${escapeHtml(new Date(madRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))}">↩ Recuperar (${escapeHtml(new Date(madRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))})</button>`
    : "";

  const salaSel = `<div class="mf"><label>Sala</label>
    <select id="mad-tanques-sala" onchange="madTanquesSalaChange()">
      <option value="">— Selecciona —</option>${_madSalaOpts(sala)}
    </select></div>`;
  const fechaInp = `<div class="mf"><label>Fecha</label>
    <input type="date" id="mad-tanques-fecha" value="${escapeHtml(fecha)}" onchange="madTanquesFechaChange()"></div>`;

  if(!sala){
    fp.innerHTML = `<div class="fc">
      <div class="fc-h"><div class="fc-t">🛢️ Maduración · Tanques</div>
        <span class="ssp ssp-mt">${fecha}</span></div>
      <div class="fc-b">
        <div class="meta" style="margin-bottom:8px">${salaSel}${fechaInp}</div>
        <div class="mad-empty">🛢️ Selecciona una sala para ver sus tanques.</div>
      </div></div>`;
    return;
  }

  const tanks = MAD_TANQUES_POR_SALA[sala] || [];
  const byTank = {};
  list.forEach(r => { if(r && r.data && r.data.fecha===fecha && r.data.sala===sala && r.data.tanque!=null && r.data.tanque!=="") byTank[String(r.data.tanque)] = r; });
  const pending = list.filter(r => r.data && r.data.fecha===fecha && r.data.sala===sala && !r.synced).length;

  const rows = tanks.map((tank, ri) => {
    const r = byTank[String(tank)];
    const d = r ? r.data : {};
    const st = r ? (r.synced ? "✅" : "⏳") : "○";
    const loteVal = (d.lote!=null && d.lote!=="") ? d.lote : getMadLote(sala, tank);
    const cells = _TANQ_GRID_COLS.map((col, ci) => {
      const attrs = `name="tg_${tank}_${col.k}" data-r="${ri}" data-c="${ci}" onpaste="madGridPaste(event,'tanques')"`;
      if(col.k === "lote"){
        return `<td><input class="pinp" type="text" ${attrs} value="${escapeHtml(loteVal||"")}" maxlength="40" placeholder="${col.ph||""}" style="min-width:60px"></td>`;
      }
      if(col.type === "text"){
        return `<td><input class="pinp" type="text" ${attrs} value="${vl(d,col.k)}" maxlength="20" placeholder="${col.ph||"-"}" style="min-width:52px"></td>`;
      }
      return `<td><input class="pinp" type="number" ${attrs} value="${vl(d,col.k)}" min="0" step="1" inputmode="numeric" placeholder="-"></td>`;
    }).join("");
    return `<tr>
      <td class="tqc" style="font-size:10px;min-width:44px;text-align:center">${tank}</td>
      <td style="font-size:10px;text-align:center">${st}</td>
      ${cells}
    </tr>`;
  }).join("");

  fp.innerHTML = `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">🛢️ Maduración · Tanques</div>
      <span class="ssp ssp-mt">${escapeHtml(sala)} · ${fecha} · ${pending ? pending+" pendiente(s)" : "sin pendientes"}</span>
    </div>
    <div class="fc-b">
      <div class="meta" style="margin-bottom:8px">${salaSel}${fechaInp}</div>
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:11px;color:#065f46;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">ℹ️</span>
        <span>Completa los valores por tanque. El Lote se prellena con el último usado (editable). Puedes pegar bloques desde Excel.</span>
      </div>
      <div class="tw"><table class="ft" style="font-size:10.5px">
        <thead>
          <tr>
            <th class="tqh" style="min-width:44px">Tanque</th>
            <th style="min-width:28px">St</th>
            <th>Lote</th>
            <th>Relación<br>H:M</th>
            <th>Población<br>Hembras</th>
            <th>Población<br>Machos</th>
            <th>Machos<br>Muertos</th>
            <th>Hembras<br>Muertas</th>
            <th>Machos<br>Descarte</th>
            <th>Hembras<br>Descarte</th>
            <th>Cópulas</th>
            <th>Muda</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="sa" style="margin-top:12px">
        <div class="sa-info"><span>💾 Guarda para persistir los tanques de ${escapeHtml(sala)}</span></div>
        <div class="sa-btns">
          <button class="btn bd" type="button" onclick="clearMadTanquesGrid()" title="Borrar registros de Tanques de esta sala y fecha">🗑 Borrar sala</button>
          <button class="btn bpdf" type="button" onclick="madGridPDF('tanques')" title="PDF de esta sala y fecha">📄 PDF</button>
          ${madRecBtn}
          <button class="btn bs" type="button" onclick="saveMadTanquesGrid()">💾 Guardar local</button>
          <button class="btn bp" type="button" onclick="syncMadTanquesGrid()">☁️ Guardar y sincronizar</button>
        </div>
      </div>
    </div>
  </div>`;
  _madAfterRender("tanques");
}

// ── Grilla Lotes (filas libres por sala, 6 por defecto + botón) ──
// Cada fila se identifica por su Nº (data.fila), no por tanque. La clave de
// upsert es Fecha+Sala+Fila → editar el texto del Lote no duplica filas.
const _LOTES_GRID_NUM_KEYS   = ["total_nauplios","total_huevos","n2_lote","desoves_lote","no_viables_lote"];
const MAD_LOTES_DEFAULT_ROWS = 6;
const MAD_LOTES_MAX_ROWS     = 8;   // 6 por defecto + hasta 2 extra
let _madLotesExtra = {};            // { "fecha|sala": filas extra agregadas (0..2) }

function _madLotesShownRows(fecha, sala){
  let maxFila = 0;
  loadMad("lotes").forEach(r => {
    if(r && r.data && r.data.fecha===fecha && r.data.sala===sala){
      const f = parseInt(r.data.fila,10);
      if(Number.isFinite(f) && f > maxFila) maxFila = f;
    }
  });
  const extra = _madLotesExtra[fecha+"|"+sala] || 0;
  return Math.min(MAD_LOTES_MAX_ROWS, Math.max(MAD_LOTES_DEFAULT_ROWS + extra, maxFila));
}

function renderMadLotes(){
  const fp = document.getElementById("fp-lotes");
  if(!fp) return;
  const list = loadMad("lotes");
  const sala = _madLotesSala;
  const fechaEl = document.getElementById("mad-lotes-fecha");
  const fecha = (fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today();
  const madRec = loadMadRecovery();
  const madRecBtn = (madRec && madRec.ficha === "lotes")
    ? `<button class="btn brec" type="button" onclick="recoverMadGrid()" title="Recuperar autoguardado de ${escapeHtml(new Date(madRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))}">↩ Recuperar (${escapeHtml(new Date(madRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))})</button>`
    : "";

  const salaSel = `<div class="mf"><label>Sala</label>
    <select id="mad-lotes-sala" onchange="madLotesSalaChange()">
      <option value="">— Selecciona —</option>${_madSalaOpts(sala)}
    </select></div>`;
  const fechaInp = `<div class="mf"><label>Fecha</label>
    <input type="date" id="mad-lotes-fecha" value="${escapeHtml(fecha)}" onchange="madLotesFechaChange()"></div>`;

  if(!sala){
    fp.innerHTML = `<div class="fc">
      <div class="fc-h"><div class="fc-t">📦 Maduración · Lotes</div>
        <span class="ssp ssp-mt">${fecha}</span></div>
      <div class="fc-b">
        <div class="meta" style="margin-bottom:8px">${salaSel}${fechaInp}</div>
        <div class="mad-empty">📦 Selecciona una sala para registrar sus lotes.</div>
      </div></div>`;
    return;
  }

  const byFila = {};
  list.forEach(r => { if(r && r.data && r.data.fecha===fecha && r.data.sala===sala && r.data.fila!=null && r.data.fila!=="") byFila[String(r.data.fila)] = r; });
  const pending = list.filter(r => r.data && r.data.fecha===fecha && r.data.sala===sala && !r.synced).length;
  const nRows = _madLotesShownRows(fecha, sala);

  const histOpts = (cur) => `<option value="">—</option>
    <option value="Activo"${cur==="Activo"?" selected":""}>Activo</option>
    <option value="Agrupación"${cur==="Agrupación"?" selected":""}>Agrupación</option>
    <option value="Descarte"${cur==="Descarte"?" selected":""}>Descarte</option>`;

  let rows = "";
  for(let fila=1; fila<=nRows; fila++){
    const ri = fila-1;
    const r = byFila[String(fila)];
    const d = r ? r.data : {};
    const st = r ? (r.synced ? "✅" : "⏳") : "○";
    const numCells = _LOTES_GRID_NUM_KEYS.map((k, j) => {
      const ci = 2 + j; // 0=lote, 1=historial, luego numéricos
      return `<td><input class="pinp" type="number" name="lg_${fila}_${k}" data-r="${ri}" data-c="${ci}" onpaste="madGridPaste(event,'lotes')" value="${vl(d,k)}" min="0" step="1" inputmode="numeric" placeholder="-"></td>`;
    }).join("");
    rows += `<tr>
      <td class="tqc" style="font-size:10px;min-width:34px;text-align:center">${fila}</td>
      <td style="font-size:10px;text-align:center">${st}</td>
      <td><input class="pinp" type="text" name="lg_${fila}_lote" data-r="${ri}" data-c="0" onpaste="madGridPaste(event,'lotes')" value="${escapeHtml(d.lote||"")}" maxlength="40" placeholder="BB" style="min-width:66px"></td>
      <td><select class="pinp" name="lg_${fila}_historial" data-r="${ri}" data-c="1" style="min-width:96px">${histOpts(d.historial||"")}</select></td>
      ${numCells}
    </tr>`;
  }

  const canAdd = nRows < MAD_LOTES_MAX_ROWS;

  fp.innerHTML = `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📦 Maduración · Lotes</div>
      <span class="ssp ssp-mt">${escapeHtml(sala)} · ${fecha} · ${pending ? pending+" pendiente(s)" : "sin pendientes"}</span>
    </div>
    <div class="fc-b">
      <div class="meta" style="margin-bottom:8px">${salaSel}${fechaInp}</div>
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:11px;color:#065f46;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">ℹ️</span>
        <span>6 filas por sala. Usa “➕ Agregar fila” si necesitas más (hasta ${MAD_LOTES_MAX_ROWS}). Puedes pegar bloques desde Excel.</span>
      </div>
      <div class="tw"><table class="ft" style="font-size:10.5px">
        <thead>
          <tr>
            <th class="tqh" style="min-width:34px">#</th>
            <th style="min-width:28px">St</th>
            <th>Lote</th><th>Historial</th>
            <th>Total nauplios</th><th>Total huevos</th>
            <th>N2/lote</th><th>Desoves/lote</th><th>No viables/lote</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div style="margin-top:8px">
        <button class="btn bo" type="button" onclick="madLotesAddRow()" ${canAdd?"":"disabled"} title="Agregar una fila más (máximo ${MAD_LOTES_MAX_ROWS})">➕ Agregar fila</button>
      </div>
      <div class="sa" style="margin-top:12px">
        <div class="sa-info"><span>💾 Guarda para persistir los lotes de ${escapeHtml(sala)}</span></div>
        <div class="sa-btns">
          <button class="btn bd" type="button" onclick="clearMadLotesGrid()" title="Borrar registros de Lotes de esta sala y fecha">🗑 Borrar sala</button>
          <button class="btn bpdf" type="button" onclick="madGridPDF('lotes')" title="PDF de esta sala y fecha">📄 PDF</button>
          ${madRecBtn}
          <button class="btn bs" type="button" onclick="saveMadLotesGrid()">💾 Guardar local</button>
          <button class="btn bp" type="button" onclick="syncMadLotesGrid()">☁️ Guardar y sincronizar</button>
        </div>
      </div>
    </div>
  </div>`;
  _madAfterRender("lotes");
}

// ── Cambios de sala en las grillas ────────────────────
function madTanquesSalaChange(){
  _madCommitActive();   // persiste la grilla de la sala ANTERIOR antes de cambiar
  const el = document.getElementById("mad-tanques-sala");
  _madTanquesSala = el ? el.value : "";
  renderMadTanques();
}
function madLotesSalaChange(){
  _madCommitActive();
  const el = document.getElementById("mad-lotes-sala");
  _madLotesSala = el ? el.value : "";
  renderMadLotes();
}
// Cambio de fecha en las grillas: commit anti-pérdida del día anterior antes de re-render.
function madSalasFechaChange(){   _madCommitActive(); renderMadSalas();   }
function madTanquesFechaChange(){ _madCommitActive(); renderMadTanques(); }
function madLotesFechaChange(){   _madCommitActive(); renderMadLotes();   }

// ── Pegado desde Excel: derrama un bloque tab/newline desde la celda origen ──
function madGridPaste(ev, ficha){
  const cd = ev.clipboardData || window.clipboardData;
  if(!cd) return;
  const txt = cd.getData('text');
  if(!txt || (txt.indexOf('\t')===-1 && txt.indexOf('\n')===-1)) return; // celda única → pegado normal
  ev.preventDefault();
  const lines = txt.replace(/\r/g,'').split('\n');
  if(lines.length && lines[lines.length-1] === "") lines.pop();
  const matrix = lines.map(l => l.split('\t'));
  const t = ev.target;
  const r0 = parseInt(t.getAttribute('data-r'),10);
  const c0 = parseInt(t.getAttribute('data-c'),10);
  if(!Number.isFinite(r0) || !Number.isFinite(c0)) return;
  const fp = document.getElementById('fp-'+ficha);
  if(!fp) return;
  matrix.forEach((cells, dr) => {
    cells.forEach((raw, dc) => {
      const el = fp.querySelector(`[data-r="${r0+dr}"][data-c="${c0+dc}"]`);
      if(!el) return;
      const val = String(raw).trim();
      if(el.tagName === 'SELECT'){
        const opt = Array.from(el.options).find(o => o.value.toLowerCase()===val.toLowerCase() || o.text.toLowerCase()===val.toLowerCase());
        if(opt) el.value = opt.value;
      } else {
        el.value = val;
      }
    });
  });
  // El pegado escribe value directamente (sin disparar input); emite un 'input' en
  // la celda destino para marcar "cambios sin guardar" (Biomol: _bioDirty; demás
  // grillas: su propio oninput, p.ej. madDraftTouch).
  try{ ev.target.dispatchEvent(new Event('input', {bubbles:true})); }catch(_){}
}

// ── Navegación tipo Excel entre celdas de las grillas de Maduración ──
// Listener delegado (una sola vez) para Salas/Tanques/Lotes. Las celdas se
// identifican por data-r (fila) y data-c (columna). Flechas ↑↓←→ y Enter mueven
// el foco entre celdas; en inputs de texto, ←/→ solo saltan de columna cuando el
// cursor está en el borde del texto (resto del tiempo mueven el cursor normal).
function madGridKey(ev){
  const k = ev.key;
  const isArrow = (k==="ArrowUp"||k==="ArrowDown"||k==="ArrowLeft"||k==="ArrowRight");
  if(!isArrow && k!=="Enter") return;
  const t = ev.target;
  if(!t || (t.tagName!=="INPUT" && t.tagName!=="SELECT") || typeof t.getAttribute!=="function") return;
  const rA = t.getAttribute("data-r"), cA = t.getAttribute("data-c");
  if(rA===null || cA===null) return;
  const panel = t.closest("#fp-salas,#fp-tanques,#fp-lotes,#fp-biomol");
  if(!panel) return;
  const r = parseInt(rA,10), c = parseInt(cA,10);
  if(!Number.isFinite(r) || !Number.isFinite(c)) return;

  // En inputs de texto, ←/→ solo cambian de columna si el cursor está en el borde.
  if((k==="ArrowLeft" || k==="ArrowRight") && t.tagName==="INPUT" && t.type!=="number" && t.type!=="checkbox"){
    try{
      const len = (t.value||"").length;
      if(k==="ArrowLeft"  && !(t.selectionStart===0   && t.selectionEnd===0))   return;
      if(k==="ArrowRight" && !(t.selectionStart===len && t.selectionEnd===len)) return;
    }catch(_){ /* number-like sin selección: tratar como borde y saltar de columna */ }
  }

  let dr=0, dc=0;
  if(k==="ArrowUp") dr=-1;
  else if(k==="ArrowDown" || k==="Enter") dr=1;
  else if(k==="ArrowLeft") dc=-1;
  else if(k==="ArrowRight") dc=1;

  // Flechas verticales / Enter: navegan (evitan el spinner del number y el cambio
  // de opción del select) aunque no haya celda destino.
  if(dr!==0) ev.preventDefault();
  const next = panel.querySelector('[data-r="'+(r+dr)+'"][data-c="'+(c+dc)+'"]');
  if(!next) return;
  if(dc!==0) ev.preventDefault();
  if(typeof next.focus==="function") next.focus();
  if(next.tagName==="INPUT"){ try{ next.select(); }catch(_){ } }
}
if(typeof document!=="undefined" && !window.__madKeyNav){
  window.__madKeyNav = true;
  document.addEventListener("keydown", madGridKey);
}

// ── PDF de la grilla: fija el filtro fecha+sala y reutiliza downloadMadPDF ──
function madGridPDF(ficha){
  const sala = ficha==='tanques' ? _madTanquesSala : _madLotesSala;
  if(!sala){ toast("Selecciona una sala primero","warn",2500); return; }
  const fechaEl = document.getElementById("mad-"+ficha+"-fecha");
  const fecha = (fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today();
  _madFilters[ficha] = { fecha, sala };
  downloadMadPDF(ficha);
}

// ── Grilla Tanques: recolección / guardado / sync / borrado ──
function _collectTanquesGrid(salaOverride, fechaOverride){
  const fp = document.getElementById("fp-tanques");
  if(!fp) return [];
  const sala = salaOverride || _madTanquesSala;
  if(!sala) return [];
  const tanks = MAD_TANQUES_POR_SALA[sala] || [];
  const fechaEl = document.getElementById("mad-tanques-fecha");
  const fecha = isValidDate(fechaOverride) ? fechaOverride : ((fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today());
  const result = [];
  tanks.forEach(tank => {
    const g = (k) => { const el = fp.querySelector(`[name="tg_${tank}_${k}"]`); return el ? el.value : ""; };
    // El Lote prellenado NO cuenta como dato por sí solo: la fila se guarda
    // sólo si hay algún otro campo. Si la hay, el Lote se persiste con ella.
    const data = { fecha, sala, tanque: tank, lote: sanitizeStr(g("lote")), rel_hm: sanitizeStr(g("rel_hm")) };
    let hasData = !!data.rel_hm;
    _TANQ_GRID_NUM_KEYS.forEach(k => { const v = g(k); if(v !== ""){ data[k] = sanitizeNum(v,0,1e9); hasData = true; } else { data[k] = ""; } });
    if(hasData) result.push(data);
  });
  return result;
}

function saveMadTanquesGrid(opts){
  opts = opts || {};
  const silent = !!opts.silent;
  const sala = opts.salaOverride || _madTanquesSala;
  if(!sala){ if(!silent) toast("Selecciona una sala","warn"); return 0; }
  const rows = _collectTanquesGrid(opts.salaOverride, opts.fechaOverride);
  if(rows.length === 0){ if(!silent) toast("No hay datos para guardar","warn"); return 0; }
  const list = loadMad("tanques");
  let saved = 0;
  rows.forEach(data => {
    if(!isValidDate(data.fecha)) return;
    _madMergeRow(list, "tanques", data);
    if(data.lote) setMadLote(sala, data.tanque, data.lote);
    saved++;
  });
  const _ok = saveMadList("tanques", list);
  if(_ok) _madGridDirty = false;
  if(!opts.noRender) renderMadTanques();
  updateDots(); updateSyncUI();
  if(!_ok) return -1;
  if(!silent) toast("💾 "+saved+" tanque(s) guardado(s) localmente","ok",2500);
  return saved;
}

async function syncMadTanquesGrid(){
  if(saveMadTanquesGrid() === -1) return;
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL inválida","err"); return; }
  if(!syncRateOk()) return;
  const pending = loadMad("tanques").filter(r => !r.synced);
  if(pending.length === 0){ toast("Sin pendientes","info"); return; }
  setSyncUI("pend","Enviando "+pending.length+" tanque(s)…");
  const payload = buildMadPayload("tanques", pending);
  const sent = await postPayload(payload, url);
  if(sent){
    const list2 = loadMad("tanques");
    pending.forEach(p => { const idx = list2.findIndex(x => x.id===p.id); if(idx>=0){ list2[idx].synced = true; list2[idx].syncedAt = Date.now(); } });
    saveMadList("tanques", list2);
    setSyncUI("ok",pending.length+" tanque(s) sincronizado(s) ✔");
    toast("✅ Tanques enviados a Google Sheets","ok");
    setTimeout(()=> setSyncUI("idle","Todo sincronizado"), 3500);
  } else {
    setSyncUI("err","Error al sincronizar Tanques");
    toast("Error al sincronizar","err",4500);
  }
  renderMadTanques();
  updateDots(); updateSyncUI();
}

function clearMadTanquesGrid(){
  const sala = _madTanquesSala;
  if(!sala){ toast("Selecciona una sala","warn"); return; }
  const fechaEl = document.getElementById("mad-tanques-fecha");
  const fecha = (fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today();
  const list = loadMad("tanques");
  const matching = list.filter(r => r && r.data && r.data.fecha===fecha && r.data.sala===sala);
  if(matching.length === 0){ toast("No hay registros de Tanques para "+sala+" ("+fecha+")","info",2500); return; }
  if(!confirm("¿Borrar los "+matching.length+" registro(s) de Tanques de "+sala+" del "+fecha+"?\nNo se eliminan las filas ya enviadas a Google Sheets.")) return;
  const ids = new Set(matching.map(r => r.id));
  saveMadList("tanques", list.filter(r => !ids.has(r.id)));
  renderMadTanques();
  updateDots(); updateSyncUI();
  toast("🗑 "+matching.length+" registro(s) de Tanques borrados","ok",3000);
}

// ── Grilla Lotes: recolección / guardado / sync / borrado / agregar fila ──
function _collectLotesGrid(salaOverride, fechaOverride){
  const fp = document.getElementById("fp-lotes");
  if(!fp) return [];
  const sala = salaOverride || _madLotesSala;
  if(!sala) return [];
  const fechaEl = document.getElementById("mad-lotes-fecha");
  const fecha = isValidDate(fechaOverride) ? fechaOverride : ((fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today());
  const nRows = _madLotesShownRows(fecha, sala);
  const result = [];
  for(let fila=1; fila<=nRows; fila++){
    const g = (k) => { const el = fp.querySelector(`[name="lg_${fila}_${k}"]`); return el ? el.value : ""; };
    const data = { fecha, sala, fila, lote: sanitizeStr(g("lote")), historial: sanitizeStr(g("historial")) };
    let hasData = !!(data.lote || data.historial);
    _LOTES_GRID_NUM_KEYS.forEach(k => { const v = g(k); if(v !== ""){ data[k] = sanitizeNum(v,0,1e9); hasData = true; } else { data[k] = ""; } });
    if(hasData) result.push(data);
  }
  return result;
}

function saveMadLotesGrid(opts){
  opts = opts || {};
  const silent = !!opts.silent;
  const sala = opts.salaOverride || _madLotesSala;
  if(!sala){ if(!silent) toast("Selecciona una sala","warn"); return 0; }
  const rows = _collectLotesGrid(opts.salaOverride, opts.fechaOverride);
  if(rows.length === 0){ if(!silent) toast("No hay datos para guardar","warn"); return 0; }
  const list = loadMad("lotes");
  let saved = 0;
  rows.forEach(data => { if(!isValidDate(data.fecha)) return; _madMergeRow(list, "lotes", data); saved++; });
  const _ok = saveMadList("lotes", list);
  if(_ok) _madGridDirty = false;
  if(!opts.noRender) renderMadLotes();
  updateDots(); updateSyncUI();
  if(!_ok) return -1;
  if(!silent) toast("💾 "+saved+" lote(s) guardado(s) localmente","ok",2500);
  return saved;
}

async function syncMadLotesGrid(){
  if(saveMadLotesGrid() === -1) return;
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL inválida","err"); return; }
  if(!syncRateOk()) return;
  const pending = loadMad("lotes").filter(r => !r.synced);
  if(pending.length === 0){ toast("Sin pendientes","info"); return; }
  setSyncUI("pend","Enviando "+pending.length+" lote(s)…");
  const payload = buildMadPayload("lotes", pending);
  const sent = await postPayload(payload, url);
  if(sent){
    const list2 = loadMad("lotes");
    pending.forEach(p => { const idx = list2.findIndex(x => x.id===p.id); if(idx>=0){ list2[idx].synced = true; list2[idx].syncedAt = Date.now(); } });
    saveMadList("lotes", list2);
    setSyncUI("ok",pending.length+" lote(s) sincronizado(s) ✔");
    toast("✅ Lotes enviados a Google Sheets","ok");
    setTimeout(()=> setSyncUI("idle","Todo sincronizado"), 3500);
  } else {
    setSyncUI("err","Error al sincronizar Lotes");
    toast("Error al sincronizar","err",4500);
  }
  renderMadLotes();
  updateDots(); updateSyncUI();
}

function clearMadLotesGrid(){
  const sala = _madLotesSala;
  if(!sala){ toast("Selecciona una sala","warn"); return; }
  const fechaEl = document.getElementById("mad-lotes-fecha");
  const fecha = (fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today();
  const list = loadMad("lotes");
  const matching = list.filter(r => r && r.data && r.data.fecha===fecha && r.data.sala===sala);
  if(matching.length === 0){ toast("No hay registros de Lotes para "+sala+" ("+fecha+")","info",2500); return; }
  if(!confirm("¿Borrar los "+matching.length+" registro(s) de Lotes de "+sala+" del "+fecha+"?\nNo se eliminan las filas ya enviadas a Google Sheets.")) return;
  const ids = new Set(matching.map(r => r.id));
  saveMadList("lotes", list.filter(r => !ids.has(r.id)));
  _madLotesExtra[fecha+"|"+sala] = 0;
  renderMadLotes();
  updateDots(); updateSyncUI();
  toast("🗑 "+matching.length+" registro(s) de Lotes borrados","ok",3000);
}

function madLotesAddRow(){
  const sala = _madLotesSala;
  if(!sala){ toast("Selecciona una sala","warn"); return; }
  const fechaEl = document.getElementById("mad-lotes-fecha");
  const fecha = (fechaEl && isValidDate(fechaEl.value)) ? fechaEl.value : today();
  const cur = _madLotesShownRows(fecha, sala);
  if(cur >= MAD_LOTES_MAX_ROWS){ toast("Máximo "+MAD_LOTES_MAX_ROWS+" filas por sala","info",2500); return; }
  // Persiste lo ya escrito antes de re-renderizar (no perder datos no guardados).
  const typed = _collectLotesGrid();
  _madLotesExtra[fecha+"|"+sala] = Math.min(MAD_LOTES_MAX_ROWS - MAD_LOTES_DEFAULT_ROWS, cur - MAD_LOTES_DEFAULT_ROWS + 1);
  if(typed.length){ saveMadLotesGrid(); } else { renderMadLotes(); }
}

// ── PDF horizontal con tabla de registros (todos los visibles) ──
function downloadMadPDF(ficha){
  if(!MAD_FICHAS.includes(ficha)) return;
  const list = applyMadFilters(ficha, loadMad(ficha));
  if(list.length === 0){
    toast("Sin registros para imprimir en "+FICHA_LABELS[ficha],"warn",2500);
    return;
  }
  if(ficha === 'tanques')      list.sort((a,b) => (parseInt((a.data||{}).tanque,10)||0) - (parseInt((b.data||{}).tanque,10)||0));
  else if(ficha === 'lotes')   list.sort((a,b) => (parseInt((a.data||{}).fila,10)||0)   - (parseInt((b.data||{}).fila,10)||0));

  const ts    = new Date();
  const tsStr = ts.toLocaleString('es-EC',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const fecha = today();
  const codigo = genCodigo(ficha, MAD_MOD, fecha);
  const tec    = gcfg('tec','');

  let headers, rowsHtml, titleIco, titleText, docCode;
  if(ficha === 'salas'){
    titleIco = '🏠'; titleText = 'Maduración · Salas'; docCode = 'OMR-MAD-SAL';
    headers = ['#','Fecha','Sala','Estado','RAS',
      'T 02:00','T 04:00','T 06:00','T 08:00','T 10:00','T 12:00','T 14:00','T 16:00','T 18:00','T 20:00','T 22:00','T 00:00',
      'O₂ 06:00','O₂ 12:00','O₂ 18:00','O₂ 00:00','Estado sync'];
    rowsHtml = list.map((r, idx) => {
      const d = r.data || {};
      const st = r.synced ? '<b style="color:#166534">✔ Sinc.</b>' : '<b style="color:#92400e">⏳ Pend.</b>';
      return `<tr>
        <td class="tqc">${idx+1}</td>
        <td>${escapeHtml(d.fecha||'—')}</td>
        <td>${escapeHtml(d.sala||'—')}</td>
        <td>${escapeHtml(d.estado||'—')}</td>
        <td>${escapeHtml(d.ras||'—')}</td>
        <td>${pdfVal(d.temp_02)}</td>
        <td>${pdfVal(d.temp_04)}</td>
        <td>${pdfVal(d.temp_06)}</td>
        <td>${pdfVal(d.temp_08)}</td>
        <td>${pdfVal(d.temp_10)}</td>
        <td>${pdfVal(d.temp_12)}</td>
        <td>${pdfVal(d.temp_14)}</td>
        <td>${pdfVal(d.temp_16)}</td>
        <td>${pdfVal(d.temp_18)}</td>
        <td>${pdfVal(d.temp_20)}</td>
        <td>${pdfVal(d.temp_22)}</td>
        <td>${pdfVal(d.temp_00)}</td>
        <td>${pdfVal(d.ox_06)}</td>
        <td>${pdfVal(d.ox_12)}</td>
        <td>${pdfVal(d.ox_18)}</td>
        <td>${pdfVal(d.ox_00)}</td>
        <td>${st}</td>
      </tr>`;
    }).join('');
  } else if(ficha === 'tanques'){
    titleIco = '🛢️'; titleText = 'Maduración · Tanques'; docCode = 'OMR-MAD-TAN';
    headers = ['#','Fecha','Sala','Lote','Tanque','Relación H:M','Población Hembras','Población Machos','Machos Muertos','Hembras Muertas','Machos Descarte','Hembras Descarte','Cópulas','Muda','Sync'];
    rowsHtml = list.map((r, idx) => {
      const d = r.data || {};
      const st = r.synced ? '<b style="color:#166534">✔</b>' : '<b style="color:#92400e">⏳</b>';
      return `<tr>
        <td class="tqc">${idx+1}</td>
        <td>${escapeHtml(d.fecha||'—')}</td>
        <td>${escapeHtml(d.sala||'—')}</td>
        <td>${escapeHtml(String(d.lote||'—'))}</td>
        <td>${pdfVal(d.tanque)}</td>
        <td>${escapeHtml(d.rel_hm||'—')}</td>
        <td>${pdfVal(d.pob_hembras)}</td>
        <td>${pdfVal(d.pob_machos)}</td>
        <td>${pdfVal(d.machos_muertos)}</td>
        <td>${pdfVal(d.hembras_muertas)}</td>
        <td>${pdfVal(d.machos_descarte)}</td>
        <td>${pdfVal(d.hembras_descarte)}</td>
        <td>${pdfVal(d.copulas)}</td>
        <td>${pdfVal(d.muda)}</td>
        <td>${st}</td>
      </tr>`;
    }).join('');
  } else {
    titleIco = '📦'; titleText = 'Maduración · Lotes'; docCode = 'OMR-MAD-LOT';
    headers = ['#','Fecha','Sala','Fila','Lote','Historial','Total nauplios','Total huevos','N2/lote','Desoves/lote','No viables/lote','Estado sync'];
    rowsHtml = list.map((r, idx) => {
      const d = r.data || {};
      const st = r.synced ? '<b style="color:#166534">✔ Sinc.</b>' : '<b style="color:#92400e">⏳ Pend.</b>';
      return `<tr>
        <td class="tqc">${idx+1}</td>
        <td>${escapeHtml(d.fecha||'—')}</td>
        <td>${escapeHtml(d.sala||'—')}</td>
        <td>${pdfVal(d.fila)}</td>
        <td>${escapeHtml(String(d.lote||'—'))}</td>
        <td>${escapeHtml(d.historial||'—')}</td>
        <td>${pdfVal(d.total_nauplios)}</td>
        <td>${pdfVal(d.total_huevos)}</td>
        <td>${pdfVal(d.n2_lote)}</td>
        <td>${pdfVal(d.desoves_lote)}</td>
        <td>${pdfVal(d.no_viables_lote)}</td>
        <td>${st}</td>
      </tr>`;
    }).join('');
  }

  const fl = _madFilters[ficha] || {};
  const fParts = [];
  if(fl.fecha)  fParts.push("Fecha: "+fl.fecha);
  if(fl.sala)   fParts.push("Sala: "+fl.sala);
  if(fl.lote)   fParts.push("Lote: "+fl.lote);
  if(fl.search) fParts.push("Búsqueda: "+fl.search);
  const filterStr = fParts.length ? fParts.join(' · ') : 'Todos los registros';

  const code3 = ficha === 'salas' ? 'SAL' : ficha === 'tanques' ? 'TAN' : 'LOT';
  const fileName = 'MAD-' + code3 + '_' + fecha.replace(/-/g,'') + '_' + list.length + 'reg';
  const title    = escapeHtml(fileName);

  const headHtml = `<div class="ph">
    <div class="ph-brand">
      <div class="co">OMARSA · Maduración</div>
      <div class="su">Sistema de Fichas Larvicultura</div>
    </div>
    <div class="ph-center"><span class="doc-code">${docCode}</span></div>
    <div class="ph-right">
      <div class="mod">MAD</div>
      <div class="mods">Maduración</div>
    </div>
  </div>
  <div class="ftitle">${titleIco} ${titleText}</div>
  <div class="mgrid">
    <div class="mf"><label>Registros</label><span>${list.length}</span></div>
    <div class="mf"><label>Filtros activos</label><span>${escapeHtml(filterStr)}</span></div>
    <div class="mf"><label>Generado</label><span>${escapeHtml(tsStr)}</span></div>
    <div class="mf"><label>Técnico</label><span>${escapeHtml(tec||'—')}</span></div>
  </div>`;

  const footHtml = `<div class="pfoot">
    <div>
      <div style="font-size:6pt;color:#64748b;margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px">Código verificador</div>
      <div class="code-box">${codigo}</div>
      <div class="ts-txt" style="margin-top:2px">Generado el ${escapeHtml(tsStr)}</div>
    </div>
    <div style="text-align:center;min-width:140px">
      <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">
        ${escapeHtml(tec||'Técnico Responsable')}
      </div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Firma del Responsable</div>
    </div>
    <div style="text-align:center;min-width:120px">
      <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">Supervisor</div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Visto Bueno</div>
    </div>
  </div>`;

  // Usa la hoja A4 LANDSCAPE estándar del sistema (pdfCss('params'))
  const page = `<!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${pdfCss('params')}</style>
  </head><body>
  <div class="ppage">
    ${headHtml}
    <table>
      <thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="spacer"></div>
    ${footHtml}
  </div>
  <script>
    try { document.title = ${JSON.stringify(fileName)}; } catch(_){}
    var _printed=false;
    function doPrint(){if(_printed)return;_printed=true;setTimeout(function(){window.print();},350);}
    if(document.readyState==='complete')doPrint();
    else window.addEventListener('load',doPrint,{once:true});
  <\/script></body></html>`;

  const w = window.open('','_blank','width=1100,height=720');
  if(!w){ toast('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.','warn',6000); return; }
  w.document.write(page);
  w.document.close();
  try { w.document.title = fileName; } catch(_){}
  toast('📄 PDF: ' + fileName + ' · ' + list.length + ' registro(s)','ok',5000);
}

// ── Payload builder ────────────────────────────────────
function buildMadPayload(ficha, records){
  const num = (v) => { if(v===""||v==null) return ""; const n=parseFloat(v); return isFinite(n)?n:""; };
  const int = (v) => { if(v===""||v==null) return ""; const n=parseInt(v,10); return Number.isFinite(n)?n:""; };
  if(ficha === "salas"){
    return {
      sheetName: "Maduración Sala",
      headers: ["Fecha","Sala","Estado",
        "Temperatura 2:00","Temperatura 4:00","Temperatura 6:00","Temperatura 8:00","Temperatura 10:00","Temperatura 12:00","Temperatura 14:00","Temperatura 16:00","Temperatura 18:00","Temperatura 20:00","Temperatura 22:00","Temperatura 0:00",
        "Oxígeno 06:00","Oxígeno 12:00","Oxígeno 18:00","Oxígeno 00:00","RAS"],
      rows: records.map(r => {
        const d = r.data || {};
        return [d.fecha, d.sala, d.estado,
          num(d.temp_02), num(d.temp_04), num(d.temp_06), num(d.temp_08), num(d.temp_10), num(d.temp_12),
          num(d.temp_14), num(d.temp_16), num(d.temp_18), num(d.temp_20), num(d.temp_22), num(d.temp_00),
          num(d.ox_06), num(d.ox_12), num(d.ox_18), num(d.ox_00), d.ras];
      })
    };
  }
  if(ficha === "tanques"){
    return {
      sheetName: "Maduración Tanques",
      headers: ["Fecha","Sala","Lote","Tanque","Relación H:M","Población inicial hembras","Población inicial machos","Machos muertos","Hembras muertas","Machos muertos por descarte de selección","Hembras muertas por descarte de selección","Cópulas","Muda"],
      rows: records.map(r => {
        const d = r.data || {};
        return [d.fecha, d.sala, d.lote, int(d.tanque), d.rel_hm, int(d.pob_hembras), int(d.pob_machos), int(d.machos_muertos), int(d.hembras_muertas), int(d.machos_descarte), int(d.hembras_descarte), int(d.copulas), int(d.muda)];
      })
    };
  }
  if(ficha === "lotes"){
    return {
      sheetName: "Maduración Lotes",
      headers: ["Fecha","Sala","Fila","Lote","Historial",
        "Total de nauplios","Total de huevos","N2 por lote","Desoves por lote","No viables por lote"],
      rows: records.map(r => {
        const d = r.data || {};
        return [d.fecha, d.sala, int(d.fila), d.lote, d.historial,
          int(d.total_nauplios), int(d.total_huevos), int(d.n2_lote), int(d.desoves_lote), int(d.no_viables_lote)];
      })
    };
  }
  return null;
}


/* ══════════════════════════════════════════
   BIOMOL — módulo de diagnóstico molecular
   ──────────────────────────────────────────
   • Almacenamiento: clave única BIO_REC_KEY → JSON array de hasta BIO_MAX
     registros. Cada registro caduca a las BIO_TTL ms (7 días).
   • Flujo: formulario único + lista de historial inline. Cada registro
     tiene `synced` y se envía a la hoja "BIOMOL" en Google Sheets.
   • Hoja destino (append-only): Fecha, Código, Corrida, Lugar, Tanque,
     Muestra, Estadío, Sexo, IHHNV, WSSV, BP, AHPND/EMS, NHPB.
══════════════════════════════════════════ */
let _bioEditing = null;

function _bioRaw(){
  try{
    const raw = localStorage.getItem(BIO_REC_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(x){ _silent("_bioRaw", x); return []; }
}
function _bioSave(list){
  const ok = _lsSet(BIO_REC_KEY, JSON.stringify(list||[]));
  if(!ok && !_reclaiming) toast("❌ Este navegador NO está guardando los datos (almacenamiento lleno, en modo privado o bloqueado). Usa ☁️ Guardar y sincronizar para no perderlos.","err",7000);
  return ok;
}
function pruneBio(){
  const now = Date.now();
  const raw = _bioRaw();
  const list = raw.filter(r => r && r.ts && (now - r.ts) < BIO_TTL);
  if(list.length !== raw.length) _bioSave(list);
  return list;
}
function loadBio(){
  return pruneBio().slice().sort((a,b) => (b.ts||0) - (a.ts||0));
}
function removeBioById(id){
  const list = _bioRaw().filter(r => r.id !== id);
  _bioSave(list);
}

// ── Biomol: GRILLA para pegar (reemplaza el formulario uno-por-uno) ─────
// La grilla es de UN día (selector de fecha arriba). Las columnas son los 16
// encabezados EXACTOS de la hoja "BIOMOL". Todas las celdas son texto libre
// para copiar/pegar la tabla del PDF (estilo Excel). Al sincronizar se
// REEMPLAZAN en la hoja todas las filas de esa fecha (sin duplicados). No hay
// campo Técnico. Editar = editar celdas y volver a sincronizar.
const BIO_GRID_COLS = [
  { k:"fecha",   label:"Fecha"     },   // gobernada por el selector de día
  { k:"codigo",  label:"Código"    },
  { k:"corrida", label:"Corrida"   },
  { k:"piscina", label:"Piscina"   },
  { k:"lugar",   label:"Lugar"     },
  { k:"tanque",  label:"Tanque"    },
  { k:"otros",   label:"Otros"     },
  { k:"muestra", label:"Muestra"   },
  { k:"estadio", label:"Estadío"   },
  { k:"sexo",    label:"Sexo"      },
  { k:"ihhnv",   label:"IHHNV"     },
  { k:"wssv",    label:"WSSV"      },
  { k:"bp",      label:"BP"        },
  { k:"ahpnd",   label:"AHPND/EMS" },
  { k:"nhpb",    label:"NHPB"      },
  { k:"ehp",     label:"EHP"       }
];
const BIO_GRID_HEADERS      = BIO_GRID_COLS.map(c => c.label);
const BIO_GRID_DEFAULT_ROWS = 20;
const BIO_GRID_ROW_STEP     = 10;
const BIO_GRID_MAX_ROWS     = 50;
const BIO_WIDE_KEYS         = { codigo:1, lugar:1, otros:1, tanque:1 };  // celdas más anchas
let _bioGridExtra = {};   // { "YYYY-MM-DD": filas extra agregadas (0..30) }
let _bioRenderedFecha = null;   // día con el que se renderizó la grilla en pantalla (para commit al cambiar de día)
let _bioGridDirty = false;      // hay datos tecleados/pegados en la grilla aún SIN guardar (protege ante cambio de día / cierre)
function _bioDirty(){ _bioGridDirty = true; }

// Fecha activa de la grilla (selector). Si aún no existe el input → today().
function bioGridFecha(){
  const el = document.getElementById("bio-grid-fecha");
  return (el && isValidDate(el.value)) ? el.value : today();
}

// Nº de filas a mostrar: máx(20+extra, mayor Fila guardada para esa fecha).
function _bioShownRows(fecha, preList){
  let maxFila = 0;
  (preList || loadBio()).forEach(r => {
    if(r && r.data && r.data.fecha === fecha){
      const f = parseInt(r.data.fila, 10);
      if(Number.isFinite(f) && f > maxFila) maxFila = f;
    }
  });
  const extra = _bioGridExtra[fecha] || 0;
  return Math.min(BIO_GRID_MAX_ROWS, Math.max(BIO_GRID_DEFAULT_ROWS + extra, maxFila));
}

// Recolecta las filas con datos (la Fecha la fija el selector, no la celda).
function _collectBioGrid(fechaOverride){
  const fp = document.getElementById("fp-biomol");
  if(!fp) return [];
  const fecha = isValidDate(fechaOverride) ? fechaOverride : bioGridFecha();
  const n = _bioShownRows(fecha);
  const result = [];
  for(let fila=1; fila<=n; fila++){
    const g = (k) => { const el = fp.querySelector(`[name="bg_${fila}_${k}"]`); return el ? el.value : ""; };
    const data = { fecha, fila };
    let hasData = false;
    BIO_GRID_COLS.forEach(c => {
      if(c.k === "fecha") return;            // la fecha la gobierna el selector
      const v = sanitizeStr(g(c.k));
      data[c.k] = v;
      if(v !== "") hasData = true;
    });
    if(hasData) result.push(data);
  }
  return result;
}

// Persiste localmente las muestras del día (merge por Fila; conserva id estable).
// Las filas vacías del día se descartan; las de otras fechas quedan intactas.
function saveBioGrid(opts){
  opts = opts || {};
  const silent = !!opts.silent;
  // fecha: por defecto el día activo del selector; con opts.fecha se persiste el
  // día que estaba EN PANTALLA antes de cambiar de día (commit anti-pérdida),
  // tomando los valores actuales de la grilla (que aún no se ha re-renderizado).
  const fecha = isValidDate(opts.fecha) ? opts.fecha : bioGridFecha();
  const rows  = _collectBioGrid(fecha);
  if(rows.length === 0){ if(!silent) toast("No hay datos para guardar","warn"); return 0; }
  const list  = _bioRaw();
  const prevByFila = {};
  list.forEach(r => { if(r && r.data && r.data.fecha === fecha && r.data.fila != null) prevByFila[String(r.data.fila)] = r; });
  const others = list.filter(r => !(r && r.data && r.data.fecha === fecha));
  const nowTs  = Date.now();
  const updated = rows.map(data => {
    const prev = prevByFila[String(data.fila)];
    return {
      id: prev ? prev.id : (Date.now().toString(36) + Math.random().toString(36).slice(2,6)),
      ts: nowTs, synced: false, syncedAt: null, data
    };
  });
  const _ok = _bioSave(others.concat(updated));
  if(_ok) _bioGridDirty = false;       // lo tecleado/pegado quedó persistido
  if(!opts.noRender) renderBiomol();
  updateDots(); updateSyncUI(); buildGrid();
  if(!_ok) return -1;                  // almacenamiento lleno: NO mentir "guardado"
  return updated.length;
}

function saveBioGridLocal(){
  const n = saveBioGrid();
  if(n > 0) toast("💾 "+n+" muestra(s) guardada(s) localmente","ok",2500);
}

// Payload BIOMOL — 16 columnas + marca de "reemplazo por fecha" para el GAS.
function buildBioPayload(fecha, records){
  const headers = BIO_GRID_HEADERS.slice();
  const rows = records.map(r => {
    const a = r.data || {};
    return [
      isValidDate(a.fecha||"") ? a.fecha : (isValidDate(fecha) ? fecha : ""),
      sanitizeStr(a.codigo||""), sanitizeStr(a.corrida||""), sanitizeStr(a.piscina||""),
      sanitizeStr(a.lugar||""),  sanitizeStr(a.tanque||""),  sanitizeStr(a.otros||""),
      sanitizeStr(a.muestra||""),sanitizeStr(a.estadio||""), sanitizeStr(a.sexo||""),
      sanitizeStr(a.ihhnv||""),  sanitizeStr(a.wssv||""),    sanitizeStr(a.bp||""),
      sanitizeStr(a.ahpnd||""),  sanitizeStr(a.nhpb||""),    sanitizeStr(a.ehp||"")
    ];
  });
  return { sheetName: BIO_SHEET, headers, rows,
           replaceDate: (isValidDate(fecha) ? fecha : ""), dateCol: 0 };
}

// Sincroniza el día: reemplaza en la hoja BIOMOL todas las filas de esa fecha.
async function syncBioGrid(){
  if(saveBioGrid() === -1) return;     // almacenamiento lleno (ya avisó): no enviar datos no persistidos
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL inválida","err"); return; }
  if(!syncRateOk()) return;
  const fecha   = bioGridFecha();
  const dayRows = loadBio().filter(r => r.data && r.data.fecha === fecha);
  if(dayRows.length === 0){ toast("No hay muestras para "+fecha,"info",2500); return; }
  const payload = buildBioPayload(fecha, dayRows);
  if(!payload.rows.length){ toast("No hay filas válidas para enviar","warn",3000); return; }
  setSyncUI("pend","Enviando "+payload.rows.length+" muestra(s) del "+fecha+"…");
  const sent = await postPayload(payload, url);
  if(sent){
    const list2 = _bioRaw();
    list2.forEach(r => { if(r.data && r.data.fecha === fecha){ r.synced = true; r.syncedAt = Date.now(); } });
    _bioSave(list2);
    setSyncUI("ok", payload.rows.length+" muestra(s) sincronizada(s) ✔");
    toast("✅ "+payload.rows.length+" muestra(s) del "+fecha+" enviadas a BIOMOL (día reemplazado)","ok",4500);
    setTimeout(()=> setSyncUI("idle","Todo sincronizado"), 3500);
  } else {
    setSyncUI("err","Error al sincronizar Biomol");
    toast("No fue posible sincronizar con Google Sheets","err",4500);
  }
  renderBiomol(); updateDots(); updateSyncUI(); buildGrid();
}

// El botón "Sincronizar" del topbar (syncAll → isBioMod) sincroniza el día activo.
async function syncAllPendingBio(){ await syncBioGrid(); }

// Agrega BIO_GRID_ROW_STEP filas más (hasta el máximo), sin perder lo tecleado.
function bioGridAddRows(){
  const fecha = bioGridFecha();
  const cur = _bioShownRows(fecha);
  if(cur >= BIO_GRID_MAX_ROWS){ toast("Máximo "+BIO_GRID_MAX_ROWS+" filas","info",2500); return; }
  const typed = _collectBioGrid();
  _bioGridExtra[fecha] = Math.min(BIO_GRID_MAX_ROWS - BIO_GRID_DEFAULT_ROWS,
                                  (cur - BIO_GRID_DEFAULT_ROWS) + BIO_GRID_ROW_STEP);
  if(typed.length){ saveBioGrid(); } else { renderBiomol(); }
}

// Borra las muestras LOCALES del día (no toca lo ya enviado a Google Sheets).
function clearBioGrid(){
  const fecha = bioGridFecha();
  const list  = _bioRaw();
  const matching = list.filter(r => r && r.data && r.data.fecha === fecha);
  if(matching.length === 0){ toast("No hay muestras locales para "+fecha,"info",2500); return; }
  if(!confirm("¿Borrar las "+matching.length+" muestra(s) locales de "+fecha+"?\nNo elimina lo ya enviado a Google Sheets.")) return;
  _bioSave(list.filter(r => !(r && r.data && r.data.fecha === fecha)));
  _bioGridExtra[fecha] = 0;
  renderBiomol(); updateDots(); updateSyncUI(); buildGrid();
  toast("🗑 Muestras locales de "+fecha+" borradas","ok",3000);
}

/* ── BIOMOL · Recuperación (autoguardado de lo NO guardado) ──────────────
   Igual idea que el recovery de las fichas estándar: cada 60s (y al salir del
   módulo) se respalda la grilla tecleada; el botón ↩ Recuperar la restaura si
   se perdió por no guardar. TTL 1 h (RTTL). */
function saveBioRecovery(){
  if(!isBioMod(curMod)) return;
  let rows = [];
  try{ rows = _collectBioGrid(); }catch(_){ return; }
  if(!rows.length) return;                       // nada que respaldar
  _lsSet(BIO_RECOV_KEY, JSON.stringify({ fecha: bioGridFecha(), ts: Date.now(), rows }));
}
function loadBioRecovery(){
  try{
    const raw = localStorage.getItem(BIO_RECOV_KEY);
    if(!raw) return null;
    const e = JSON.parse(raw);
    if(!e || !Array.isArray(e.rows) || !e.ts) return null;
    if(Date.now() - e.ts > RTTL){ localStorage.removeItem(BIO_RECOV_KEY); return null; }
    return e;
  }catch(_){ return null; }
}
function recoverBioGrid(){
  const rec = loadBioRecovery();
  if(!rec){ toast("No hay datos de recuperación disponibles","warn"); return; }
  const ts = new Date(rec.ts).toLocaleString("es-EC");
  if(!confirm("¿Recuperar las "+rec.rows.length+" fila(s) autoguardadas el "+ts+" (fecha "+rec.fecha+")?\nSe combinarán con la grilla de esa fecha.")) return;
  const list = _bioRaw();
  const prevByFila = {};
  list.forEach(r => { if(r && r.data && r.data.fecha === rec.fecha && r.data.fila != null) prevByFila[String(r.data.fila)] = r; });
  const others = list.filter(r => !(r && r.data && r.data.fecha === rec.fecha));
  const nowTs = Date.now();
  const restored = rec.rows.map(data => {
    const prev = prevByFila[String(data.fila)];
    return { id: prev ? prev.id : (Date.now().toString(36)+Math.random().toString(36).slice(2,6)), ts: nowTs, synced:false, syncedAt:null, data };
  });
  _bioSave(others.concat(restored));
  try{ localStorage.removeItem(BIO_RECOV_KEY); }catch(_){}
  const el = document.getElementById("bio-grid-fecha");
  if(el) el.value = rec.fecha;
  renderBiomol(); updateDots(); updateSyncUI(); buildGrid();
  toast("✅ Muestras recuperadas del autoguardado","ok",4000);
}

// ── BIOMOL · Historial 48 h (por día) ───────────────────────────────────
// Texto de "último guardado" del día activo (deriva de los registros → es
// persistente: sobrevive a re-render y recarga).
function _bioSavedText(fecha, preList){
  const recs = (preList || loadBio()).filter(r => r.data && r.data.fecha === fecha);
  if(!recs.length) return "○ Sin guardar localmente";
  const maxTs = Math.max.apply(null, recs.map(r => r.ts || 0));
  const allSynced = recs.every(r => r.synced);
  return (allSynced ? "✅ Sincronizado · " : "⏳ Guardado local · ") + new Date(maxTs).toLocaleString("es-EC");
}
// Bloque visual del historial (lista de días con muestras guardadas, 48 h).
function _bioHistBlock(curFecha, preList){
  const list = preList || loadBio();
  const byFecha = {};
  list.forEach(r => { if(r && r.data && r.data.fecha){ (byFecha[r.data.fecha] = byFecha[r.data.fecha] || []).push(r); } });
  const fechas = Object.keys(byFecha).sort((a,b)=> b.localeCompare(a));
  const head = `<div class="alg-hist-h" style="border-bottom-color:#fbcfe8">
      <div class="alg-hist-h-l" style="color:#9d174d">🧬 Historial de muestras (48 h)
        <span class="alg-hist-cnt" style="background:#db2777">${fechas.length} día(s)</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${fechas.length ? `<button class="btn bd" type="button" onclick="clearAllBio()" style="font-size:10.5px;padding:5px 10px">🗑 Borrar todo</button>` : ""}
      </div></div>`;
  if(!fechas.length){
    return `<div class="alg-hist" style="background:#fdf2f8;border-color:#fbcfe8">${head}
      <div class="alg-hist-empty" style="border-color:#fbcfe8;color:#9d174d">Aún no hay muestras guardadas. Guarda la grilla para verlas aquí (se conservan 48 h).</div></div>`;
  }
  const items = fechas.map(f=>{
    const rs = byFecha[f]; const pend = rs.some(r=>!r.synced);
    const ts = new Date(Math.max.apply(null, rs.map(r=>r.ts||0))).toLocaleString("es-EC",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
    const isCur = (f===curFecha);
    const safeF = escapeHtml(f);
    return `<div class="alg-hist-item${isCur?' editing':''}">
      <span class="alg-hist-num" style="background:#db2777">${rs.length}</span>
      <div class="alg-hist-body">
        <div class="alg-hist-ts" style="color:#9d174d">📅 ${safeF} · guardado ${escapeHtml(ts)}${isCur?' · <b>en pantalla</b>':''}</div>
        <div class="alg-hist-fields" style="color:#831843">
          <span><b>Muestras:</b> ${rs.length}</span>
          ${pend ? '<span class="ssp ssp-pend">⏳ Pendiente</span>' : '<span class="ssp ssp-ok">✅ Sincronizado</span>'}
        </div>
      </div>
      <div class="alg-hist-actions">
        <button class="alg-hist-edit" onclick="bioVerDia('${safeF}')" title="Cargar este día en la grilla">👁</button>
        <button class="alg-hist-del" onclick="bioBorrarDia('${safeF}')" title="Borrar muestras locales de este día (no afecta a Google Sheets)">🗑</button>
      </div>
    </div>`;
  }).join("");
  return `<div class="alg-hist" style="background:#fdf2f8;border-color:#fbcfe8">${head}
    <div class="alg-hist-list">${items}</div>
    <div style="margin-top:8px;font-size:10.5px;color:#9d174d;line-height:1.6">ℹ️ Las muestras se conservan localmente <b>48 h</b>. <b>👁</b> carga ese día en la grilla; <b>🗑</b> borra solo lo local (no afecta a Google Sheets).</div></div>`;
}
function bioVerDia(fecha){
  // Persiste lo no guardado del día EN PANTALLA antes de cargar otro día.
  try{ saveBioGrid({ fecha:_bioRenderedFecha, silent:true, noRender:true }); }catch(_){}
  const el = document.getElementById("bio-grid-fecha");
  if(el) el.value = fecha;
  renderBiomol();
}
// Cambio de día desde el selector de fecha: mismo commit anti-pérdida antes de
// re-renderizar el día nuevo (antes el onchange llamaba a renderBiomol() directo
// y descartaba lo tecleado/pegado sin guardar).
function bioFechaChange(){
  try{ saveBioGrid({ fecha:_bioRenderedFecha, silent:true, noRender:true }); }catch(_){}
  renderBiomol();
}
function bioBorrarDia(fecha){
  const list = _bioRaw();
  const matching = list.filter(r => r && r.data && r.data.fecha === fecha);
  if(matching.length === 0){ toast("No hay muestras locales para "+fecha,"info",2500); return; }
  if(!confirm("¿Borrar las "+matching.length+" muestra(s) locales de "+fecha+"?\nNo elimina lo ya enviado a Google Sheets.")) return;
  _bioSave(list.filter(r => !(r && r.data && r.data.fecha === fecha)));
  _bioGridExtra[fecha] = 0;
  renderBiomol(); updateDots(); updateSyncUI(); buildGrid();
  toast("🗑 Muestras locales de "+fecha+" borradas","ok",3000);
}
function clearAllBio(){
  const list = _bioRaw();
  if(list.length === 0){ toast("El historial ya está vacío","info",2000); return; }
  if(!confirm("¿Borrar TODAS las "+list.length+" muestra(s) locales del historial Biomol (48 h)?\nNo afecta a lo ya enviado a Google Sheets.")) return;
  _bioSave([]);
  _bioGridExtra = {};
  renderBiomol(); updateDots(); updateSyncUI(); buildGrid();
  toast("🗑 Historial Biomol vaciado","ok",3000);
}

// ── Render de la grilla Biomol ──────────────────────────
function renderBiomol(){
  const fp = document.getElementById("fp-biomol");
  if(!fp) return;
  const fecha = bioGridFecha();
  _bioRenderedFecha = fecha;               // día actualmente en pantalla (commit al cambiar de día)
  const list  = loadBio();                 // se parsea UNA vez y se reutiliza abajo
  const byFila = {};
  list.forEach(r => { if(r && r.data && r.data.fecha === fecha && r.data.fila != null) byFila[String(r.data.fila)] = r; });
  const pending = list.filter(r => r.data && r.data.fecha === fecha && !r.synced).length;
  const nRows = _bioShownRows(fecha, list);

  const ths = BIO_GRID_COLS.map(c => `<th>${escapeHtml(c.label)}</th>`).join("");

  let rowsHtml = "";
  for(let fila=1; fila<=nRows; fila++){
    const r  = byFila[String(fila)];
    const d  = r ? r.data : {};
    const st = r ? (r.synced ? "✅" : "⏳") : "○";
    const cells = BIO_GRID_COLS.map((c, ci) => {
      if(c.k === "fecha"){
        return `<td><input class="pinp" type="text" name="bg_${fila}_fecha" data-r="${fila-1}" data-c="0" onpaste="madGridPaste(event,'biomol')" oninput="_bioDirty()" value="${escapeHtml(fecha)}" title="La fecha de todas las filas la define el selector de día (este valor se normaliza al guardar)" style="min-width:88px;background:#f0fdf4;color:#065f46;font-weight:600"></td>`;
      }
      const w = BIO_WIDE_KEYS[c.k] ? 120 : 70;
      return `<td><input class="pinp" type="text" name="bg_${fila}_${c.k}" data-r="${fila-1}" data-c="${ci}" onpaste="madGridPaste(event,'biomol')" oninput="_bioDirty()" value="${escapeHtml(d[c.k]||"")}" maxlength="200" style="min-width:${w}px"></td>`;
    }).join("");
    rowsHtml += `<tr>
      <td class="tqc" style="font-size:10px;min-width:34px;text-align:center">${fila}</td>
      <td style="font-size:10px;text-align:center">${st}</td>
      ${cells}
    </tr>`;
  }

  const canAdd = nRows < BIO_GRID_MAX_ROWS;
  const bioRec = loadBioRecovery();
  const bioRecBtn = bioRec
    ? `<button class="btn brec" type="button" onclick="recoverBioGrid()" title="Recuperar autoguardado de ${escapeHtml(new Date(bioRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))}">↩ Recuperar (${escapeHtml(new Date(bioRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))})</button>`
    : `<button class="btn brec" type="button" disabled style="opacity:.35;cursor:not-allowed">↩ Recuperar</button>`;

  fp.innerHTML = `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">🧬 Biomol · Diagnóstico Molecular</div>
      <span class="ssp ssp-mt">${escapeHtml(fecha)} · ${pending ? pending+" pendiente(s)" : "sin pendientes"}</span>
    </div>
    <div class="fc-b">
      <div class="meta" style="margin-bottom:8px">
        <div class="mf"><label>Fecha (día)</label>
          <input type="date" id="bio-grid-fecha" value="${escapeHtml(fecha)}" onchange="bioFechaChange()"></div>
      </div>
      <div style="background:#fdf2f8;border:1.5px solid #fbcfe8;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:11px;color:#9d174d;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">🧬</span>
        <span>Pega tu tabla del PDF (copiar/pegar desde Excel). La columna <b>Fecha</b> la define el día de arriba. Al sincronizar se <b>reemplazan</b> en la hoja todas las filas de esa fecha (sin duplicados). Guarda antes de cambiar de día.</span>
      </div>
      <div class="tw"><table class="ft" style="font-size:10.5px">
        <thead><tr>
          <th class="tqh" style="min-width:34px">#</th>
          <th style="min-width:28px">St</th>
          ${ths}
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>
      <div style="margin-top:8px">
        <button class="btn bo" type="button" onclick="bioGridAddRows()" ${canAdd?"":"disabled"} title="Agregar ${BIO_GRID_ROW_STEP} filas más (máximo ${BIO_GRID_MAX_ROWS})">➕ Agregar ${BIO_GRID_ROW_STEP} filas</button>
      </div>
      <div class="sa" style="margin-top:12px">
        <div class="sa-info">
          <span>💾 Guarda para persistir las muestras del ${escapeHtml(fecha)} · máx ${BIO_GRID_MAX_ROWS} filas</span>
          <span id="bio-saved-ind" style="font-weight:600">${_bioSavedText(fecha, list)}</span>
        </div>
        <div class="sa-btns">
          <button class="btn bd" type="button" onclick="clearBioGrid()" title="Borrar muestras locales de este día">🗑 Borrar día</button>
          ${bioRecBtn}
          <button class="btn bs" type="button" onclick="saveBioGridLocal()">💾 Guardar local</button>
          <button class="btn bp" type="button" onclick="syncBioGrid()">☁️ Guardar y sincronizar</button>
        </div>
      </div>
      <div style="margin-top:10px;font-size:10.5px;color:var(--tx3);line-height:1.6">
        ℹ️ La grilla es del día seleccionado. Al sincronizar se reemplazan en la hoja <code>BIOMOL</code> todas las filas de esa fecha por las de la grilla (editar y reenviar no duplica). Empieza con ${BIO_GRID_DEFAULT_ROWS} filas; agrega de ${BIO_GRID_ROW_STEP} en ${BIO_GRID_ROW_STEP} hasta ${BIO_GRID_MAX_ROWS}. Las filas vacías no se envían.
      </div>
      ${_bioHistBlock(fecha, list)}
    </div>
  </div>`;
  fixupLabels(fp);
  _bioGridDirty = false;   // la grilla recién renderizada refleja lo persistido (limpio)
}


/* ══════════════════════════════════════════
   AS TÉCNICO (AsT) — módulo de supervisión técnica
   ──────────────────────────────────────────
   • Almacenamiento: clave única AST_REC_KEY → JSON array de hasta AST_MAX
     registros con TTL AST_TTL (48 h), purga vía pruneAst().
   • Hoja destino (append-only): Registro_Supervisión.
   • Tipo_revisión se DERIVA automáticamente de Estadío_observado.
   • Observaciones y Acción son multiselección (chips/checkboxes), se
     persisten como string CSV.
══════════════════════════════════════════ */
let _astEditing = null;
let _astFormDirty = false;          // hay datos en el formulario AÚN sin guardar (aviso de cierre)
let _astRecovered = null;           // datos a precargar en renderAst tras "↩ Recuperar"
function _astMarkDirty(){ _astFormDirty = true; }

// ── As Técnico · Recuperación del formulario en curso (espejo de Biomol) ──
// El timer de 60s (y goBack) respaldan lo tecleado; ↩ Recuperar lo restaura si
// se perdió por no guardar. TTL 1h (RTTL). NO respalda en modo edición (ese flujo
// usa el registro real; restaurarlo como "nuevo" duplicaría al guardar).
function saveAstRecovery(){
  if(!isAstMod(curMod) || _astEditing) return;
  let data;
  try{ data = collectAst(); }catch(_){ return; }
  const hasData = ["supervisor","modulo","siembra","corrida","estadio","deformidad",
    "atraso","hernia","hernia_grado","opacidad","asimilacion","semillenas","vacias",
    "intestino","actividad","condicion","observaciones","accion","comentario","comentario_vesp"]
    .some(k => data[k] !== "" && data[k] !== null && data[k] !== undefined);
  if(!hasData) return;
  _lsSet(AST_RECOV_KEY, JSON.stringify({ ts: Date.now(), data }));
}
function loadAstRecovery(){
  try{
    const raw = localStorage.getItem(AST_RECOV_KEY);
    if(!raw) return null;
    const e = JSON.parse(raw);
    if(!e || !e.data || !e.ts) return null;
    if(Date.now() - e.ts > RTTL){ localStorage.removeItem(AST_RECOV_KEY); return null; }
    return e;
  }catch(_){ return null; }
}
function recoverAstForm(){
  const rec = loadAstRecovery();
  if(!rec){ toast("No hay datos de recuperación disponibles","warn"); return; }
  const ts = new Date(rec.ts).toLocaleString("es-EC");
  if(!confirm("¿Recuperar el formulario autoguardado el "+ts+"?\nSe reemplazará lo que haya ahora en el formulario.")) return;
  _astEditing = null;
  _astRecovered = rec.data;
  renderAst();
  _astRecovered = null;
  _astFormDirty = false;
  try{ localStorage.removeItem(AST_RECOV_KEY); }catch(_){}
  toast("✅ Formulario recuperado del autoguardado","ok",4000);
}

function _astRaw(){
  try{
    const raw = localStorage.getItem(AST_REC_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(x){ _silent("_astRaw", x); return []; }
}
function _astSave(list){
  const ok = _lsSet(AST_REC_KEY, JSON.stringify(list||[]));
  if(!ok && !_reclaiming) toast("❌ Este navegador NO está guardando los datos (almacenamiento lleno, en modo privado o bloqueado). Usa ☁️ Guardar y sincronizar para no perderlos.","err",7000);
  return ok;
}
function pruneAst(){
  const now = Date.now();
  const raw = _astRaw();
  const list = raw.filter(r => r && r.ts && (now - r.ts) < AST_TTL);
  if(list.length !== raw.length) _astSave(list);
  return list;
}
function loadAst(){
  return pruneAst().slice().sort((a,b) => (b.ts||0) - (a.ts||0));
}
function removeAstById(id){
  const list = _astRaw().filter(r => r.id !== id);
  _astSave(list);
}

// ── Derivación de Tipo_revisión a partir del Estadío observado ──
// Defensa: normaliza el estadío a MAYÚSCULAS+trim antes de comparar. En el
// flujo normal el select ya produce valores en mayúsculas, pero datos
// importados desde el historial, edición manual o futuras opciones podrían
// no respetar el case — esta normalización evita falsos "Rápida".
function astRevisionType(estadio){
  if(!estadio) return "";
  const norm = String(estadio).toUpperCase().trim();
  return AST_COMPLETA_STAGES.indexOf(norm) !== -1 ? "Completa" : "Rápida";
}

// ── Recolección de formulario (incluye multiselección por data-group) ──
function collectAst(){
  const fp = document.getElementById("fp-ast");
  if(!fp) return {};
  const d = {};
  // Campos simples (excluye checkboxes y el display de tipo_revisión)
  fp.querySelectorAll(".mad-form [name]").forEach(el=>{
    if(el.type === "checkbox") return;
    if(el.dataset && el.dataset.skipCollect === "1") return;
    if(el.type === "number"){
      d[el.name] = el.value === "" ? "" : sanitizeNum(el.value, 0, 1e9);
    } else if(el.type === "date"){
      d[el.name] = isValidDate(el.value) ? el.value : "";
    } else {
      d[el.name] = sanitizeStr(el.value);
    }
  });
  // Multiselecciones → CSV "valor1, valor2, ..."
  const obs = Array.from(fp.querySelectorAll('[data-group="obs"]:checked')).map(x=>x.value);
  const acc = Array.from(fp.querySelectorAll('[data-group="acc"]:checked')).map(x=>x.value);
  d.observaciones = obs.join(", ");
  d.accion        = acc.join(", ");
  // Tipo_revisión se DERIVA del estadio (no se lee del display)
  d.tipo_revision = astRevisionType(d.estadio||"");
  return d;
}

// ── Validación ─────────────────────────────────────────
function validateAst(data){
  if(!isValidDate(data.fecha||"")){ toast("⚠️ Fecha inválida o no seleccionada","warn",3500); return false; }
  if(!sanitizeStr(data.supervisor||"")){ toast("⚠️ Selecciona un Supervisor","warn",3500); return false; }
  if(!sanitizeStr(data.modulo||""))    { toast("⚠️ Selecciona un Módulo","warn",3500); return false; }
  if(!sanitizeStr(data.siembra||""))   { toast("⚠️ Selecciona la Siembra","warn",3500); return false; }
  if(!sanitizeStr(data.estadio||""))   { toast("⚠️ Selecciona el Estadío observado","warn",3500); return false; }
  const _pctFields = [["deformidad","Deformidad"],["atraso","% Atraso"],["hernia","% Hernia"],
                      ["semillenas","Semillenas (%)"],["vacias","Vacías (%)"]];
  for(const [k,label] of _pctFields){
    const v = data[k];
    if(v !== "" && v !== null && v !== undefined){
      const n = parseFloat(v);
      if(!isFinite(n) || n < 0 || n > 100){
        toast("⚠️ "+label+" debe estar entre 0 y 100 %","warn",3500); return false;
      }
    }
  }
  // Comentario matutino obligatorio (el vespertino es opcional)
  if(!sanitizeStr(data.comentario||"")){
    toast("⚠️ El Comentario matutino es obligatorio","warn",3500); return false;
  }
  return true;
}

// ── Live: actualiza el display de Tipo_revisión al cambiar Estadío ──
function astEstadioChange(){
  const fp = document.getElementById("fp-ast");
  if(!fp) return;
  const sel  = fp.querySelector('[name="estadio"]');
  const est  = sel ? sel.value : "";
  const type = astRevisionType(est);
  const el   = document.getElementById("ast-tipo-display");
  if(!el) return;
  el.value = type || "—";
  if(type === "Completa"){
    el.style.background = "#f0fdf4"; el.style.color = "#065f46"; el.style.borderColor = "#86efac";
  } else if(type === "Rápida"){
    el.style.background = "#fef3c7"; el.style.color = "#92400e"; el.style.borderColor = "#fde68a";
  } else {
    el.style.background = "var(--surf)"; el.style.color = "var(--tx3)"; el.style.borderColor = "var(--bdr)";
  }
}

// ── CRUD ───────────────────────────────────────────────
function _persistAst(){
  const data = collectAst();
  if(!validateAst(data)) return null;
  const editingId = _astEditing;
  const list = _astRaw();

  if(editingId){
    const idx = list.findIndex(r => r.id === editingId);
    if(idx >= 0){
      list[idx] = Object.assign({}, list[idx], {
        ts: Date.now(),
        synced: false,
        syncedAt: null,
        data: data
      });
      // #2: si el almacenamiento falló, _astSave ya avisó; NO mentir "guardado" ni
      // re-renderizar (conserva el formulario para reintentar/sincronizar).
      if(!_astSave(list)) return null;
      try{ localStorage.removeItem(AST_RECOV_KEY); }catch(_){}
      _astFormDirty = false;
      _astEditing = null;
      renderAst();
      updateDots(); updateSyncUI(); buildGrid();
      return { id: editingId, wasUpdate: true };
    }
    _astEditing = null;
  }
  if(list.length >= AST_MAX){
    toast("Historial lleno ("+AST_MAX+" registros). Borra alguno antes de agregar más.","warn",4500);
    return null;
  }
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    ts: Date.now(),
    synced: false,
    syncedAt: null,
    data: data
  };
  list.unshift(entry);
  if(!_astSave(list)) return null;     // #2: conserva el form si la persistencia falló
  try{ localStorage.removeItem(AST_RECOV_KEY); }catch(_){}
  _astFormDirty = false;
  _astEditing = null;
  renderAst();
  updateDots(); updateSyncUI(); buildGrid();
  return { id: entry.id, wasUpdate: false };
}

function saveAstLocal(){
  const res = _persistAst();
  if(!res) return;
  toast((res.wasUpdate ? "Registro actualizado" : "Registro guardado")
        + " localmente (pendiente de sincronizar)","ok",3000);
}
async function saveAstSync(){
  const res = _persistAst();
  if(!res) return;
  toast(res.wasUpdate ? "Registro actualizado" : "Registro guardado","ok",2200);
  await syncOneAstFromList(res.id);
}
function editAstRecord(id){
  const r = loadAst().find(x => x.id === id);
  if(!r){ toast("Registro no encontrado","warn"); return; }
  _astEditing = id;
  renderAst();
  try{ document.getElementById("fp-ast").scrollIntoView({behavior:"smooth", block:"start"}); }catch(_){}
  toast("✏️ Editando registro · al guardar se ACTUALIZARÁ esa entrada","info",4500);
}
function cancelAstEdit(){
  if(!_astEditing) return;
  _astEditing = null;
  renderAst();
  toast("Edición cancelada","info",1800);
}
function deleteAstRecord(id){
  const r = loadAst().find(x => x.id === id);
  if(!r){ toast("Registro no encontrado","warn"); return; }
  if(!confirm("¿Eliminar este registro del historial?\nNo afecta a lo ya enviado a Google Sheets.")) return;
  removeAstById(id);
  if(_astEditing === id) _astEditing = null;
  renderAst();
  updateDots(); updateSyncUI(); buildGrid();
  toast("Registro eliminado","ok",2500);
}
function clearAstForm(){
  const data = collectAst();
  const hasData = ["supervisor","modulo","siembra","corrida","estadio","deformidad",
                   "atraso","hernia","hernia_grado","opacidad","asimilacion","semillenas","vacias",
                   "intestino","actividad","condicion","observaciones","accion","comentario","comentario_vesp"]
    .some(k => data[k] !== "" && data[k] !== null && data[k] !== undefined);
  if(hasData){
    if(!confirm("¿Descartar lo que estás registrando?\nLos datos del formulario se perderán.")) return;
  }
  _astEditing = null;
  try{ localStorage.removeItem(AST_RECOV_KEY); }catch(_){}
  _astFormDirty = false;
  renderAst();
  toast("🧹 Formulario en blanco","info",1500);
}

// ── Sync ────────────────────────────────────────────────
function buildAstPayload(records){
  // Col "ID" (última) = identificador local estable del registro. Es la CLAVE
  // de upsert del GAS: al re-sincronizar un registro editado, su fila se
  // REEMPLAZA en lugar de duplicarse. Compatible hacia atrás — si el GAS aún
  // no se redesplegó (sigue en append-only), la columna ID simplemente viaja
  // como un dato más sin romper nada.
  // Orden alineado al nuevo esquema del Google Sheet (22 cols + ID al final).
  // Columnas nuevas: Hernia (grado), Opacidad, Asimilación, Semillenas (%),
  // Vacías (%), y Comentario (vespertino). "Comentario" pasó a "Comentario
  // (matutino)" conservando el nombre interno `comentario` (compat. histórica).
  const headers = ["Fecha","Supervisor","Módulo","Siembra","Corrida",
                   "Estadío_observado","Tipo_revisión","Deformidad_%",
                   "% Atraso","% Hernia","Hernia","Opacidad","Asimilación",
                   "Semillenas (%)","Vacías (%)",
                   "Intestino","Actividad","Condición_biológica",
                   "Observaciones","Acción","Comentario (matutino)","Comentario (vespertino)","ID"];
  const numOrEmpty = (v) => { if(v===""||v==null) return ""; const n=parseFloat(v); return isFinite(n)?n:""; };
  const rows = records.map(r => {
    const a = r.data || {};
    return [
      isValidDate(a.fecha||"") ? a.fecha : "",
      sanitizeStr(a.supervisor||""),
      sanitizeStr(a.modulo||""),
      sanitizeStr(a.siembra||""),
      sanitizeStr(a.corrida||""),
      sanitizeStr(a.estadio||""),
      sanitizeStr(a.tipo_revision || astRevisionType(a.estadio||"")),
      numOrEmpty(a.deformidad),
      numOrEmpty(a.atraso),
      numOrEmpty(a.hernia),
      sanitizeStr(a.hernia_grado||""),
      sanitizeStr(a.opacidad||""),
      sanitizeStr(a.asimilacion||""),
      numOrEmpty(a.semillenas),
      numOrEmpty(a.vacias),
      sanitizeStr(a.intestino||""),
      sanitizeStr(a.actividad||""),
      sanitizeStr(a.condicion||""),
      sanitizeStr(a.observaciones||""),
      sanitizeStr(a.accion||""),
      sanitizeStr(a.comentario||""),
      sanitizeStr(a.comentario_vesp||""),
      String(r.id||"")
    ];
  });
  return { sheetName: AST_SHEET, headers, rows };
}

async function syncOneAstFromList(id){
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script primero","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL de script inválida","err"); return; }
  if(!syncRateOk()) return;

  const r = _astRaw().find(x => x.id === id);
  if(!r) return;

  setSyncUI("pend","Sincronizando…");
  const payload = buildAstPayload([r]);
  const sent = await postPayload(payload, url, {dedupeSalt: id});
  if(sent){
    const list2 = _astRaw();
    const idx = list2.findIndex(x => x.id === id);
    if(idx >= 0){ list2[idx].synced = true; list2[idx].syncedAt = Date.now(); }
    _astSave(list2);
    setSyncUI("ok","Sincronizado ✔");
    setTimeout(()=>{ setSyncUI("idle","Todo sincronizado"); }, 3000);
    if(curTab === "ast") renderAst();
    updateDots(); updateSyncUI(); buildGrid();
  } else {
    setSyncUI("err","No fue posible sincronizar");
    toast("No fue posible sincronizar con Google Sheets","err",4500);
  }
}

async function syncAllPendingAst(){
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script primero","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL de script inválida","err"); return; }
  if(!syncRateOk()) return;

  const pending = loadAst().filter(r => !r.synced);
  if(pending.length === 0){
    setSyncUI("idle","Todo sincronizado");
    toast("No hay registros pendientes","info",2500);
    return;
  }
  setSyncUI("pend","Enviando "+pending.length+" registro(s)…");
  toast("Enviando "+pending.length+" registro(s) a Registro_Supervisión…","info",2200);
  const payload = buildAstPayload(pending);
  const sent = await postPayload(payload, url, {dedupeSalt: pending.map(p=>p.id).join(",")});
  if(sent){
    const list2 = _astRaw();
    pending.forEach(p => {
      const idx = list2.findIndex(x => x.id === p.id);
      if(idx >= 0){ list2[idx].synced = true; list2[idx].syncedAt = Date.now(); }
    });
    _astSave(list2);
    setSyncUI("ok", pending.length+" registro(s) enviado(s) ✔");
    toast(pending.length+" registro(s) sincronizados","ok",3000);
    setTimeout(()=>{ setSyncUI("idle","Todo sincronizado"); }, 3000);
    if(curTab === "ast") renderAst();
    updateDots(); updateSyncUI(); buildGrid();
  } else {
    setSyncUI("err","No fue posible sincronizar");
    toast("No fue posible sincronizar con Google Sheets","err",4500);
  }
}

// ── PDF (tabla horizontal con todos los registros vigentes) ──
function downloadAstPDF(){
  const list = loadAst();
  if(list.length === 0){
    toast("Sin registros para imprimir","warn",2500); return;
  }
  const ts     = new Date();
  const tsStr  = ts.toLocaleString('es-EC',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const fecha  = today();
  const codigo = genCodigo('ast', AST_MOD, fecha);

  const headers = ['#','Sinc.','Fecha','Supervisor','Módulo','Siembra','Corrida',
                   'Estadío','Tipo rev.','Def. %','Atraso %','Hernia %','Hernia','Opacidad','Asimil.','Semill. %','Vacías %',
                   'Intestino','Actividad','Cond.',
                   'Observaciones','Acción','Coment. mat.','Coment. vesp.'];
  const cell    = (v) => (v!==undefined && v!=="" && v!==null) ? escapeHtml(String(v)) : '<span class="empty">—</span>';

  const rowsHtml = list
    .slice()
    .sort((a,b) => (b.ts||0) - (a.ts||0))
    .map((r, idx) => {
      const a = r.data || {};
      const st = r.synced ? '<b style="color:#166534">✔</b>' : '<b style="color:#92400e">⏳</b>';
      return `<tr>
        <td class="tqc">${idx+1}</td>
        <td>${st}</td>
        <td>${cell(a.fecha)}</td>
        <td>${cell(a.supervisor)}</td>
        <td>${cell(a.modulo)}</td>
        <td>${cell(a.siembra)}</td>
        <td>${cell(a.corrida)}</td>
        <td>${cell(a.estadio)}</td>
        <td>${cell(a.tipo_revision || astRevisionType(a.estadio||''))}</td>
        <td>${cell(a.deformidad)}</td>
        <td>${cell(a.atraso)}</td>
        <td>${cell(a.hernia)}</td>
        <td>${cell(a.hernia_grado)}</td>
        <td>${cell(a.opacidad)}</td>
        <td>${cell(a.asimilacion)}</td>
        <td>${cell(a.semillenas)}</td>
        <td>${cell(a.vacias)}</td>
        <td>${cell(a.intestino)}</td>
        <td>${cell(a.actividad)}</td>
        <td>${cell(a.condicion)}</td>
        <td style="text-align:left;max-width:130px;white-space:normal;word-break:break-word">${cell(a.observaciones)}</td>
        <td style="text-align:left;max-width:130px;white-space:normal;word-break:break-word">${cell(a.accion)}</td>
        <td style="text-align:left;max-width:130px;white-space:normal;word-break:break-word">${cell(a.comentario)}</td>
        <td style="text-align:left;max-width:130px;white-space:normal;word-break:break-word">${cell(a.comentario_vesp)}</td>
      </tr>`;
    }).join('');

  const fileName = 'AsT_' + fecha.replace(/-/g,'') + '_' + list.length + 'reg';
  const title    = escapeHtml(fileName);

  const headHtml = `<div class="ph">
    <div class="ph-brand">
      <div class="co">OMARSA · As Técnico</div>
      <div class="su">Sistema de Fichas — Supervisión Técnica</div>
    </div>
    <div class="ph-center"><span class="doc-code">OMR-AST-SUP</span></div>
    <div class="ph-right">
      <div class="mod">AsT</div>
      <div class="mods">As Técnico</div>
    </div>
  </div>
  <div class="ftitle">📋 As Técnico · Registro_Supervisión</div>
  <div class="mgrid">
    <div class="mf"><label>Registros</label><span>${list.length}</span></div>
    <div class="mf"><label>Generado</label><span>${escapeHtml(tsStr)}</span></div>
  </div>`;

  const footHtml = `<div class="pfoot">
    <div>
      <div style="font-size:6pt;color:#64748b;margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px">Código verificador</div>
      <div class="code-box">${codigo}</div>
      <div class="ts-txt" style="margin-top:2px">Generado el ${escapeHtml(tsStr)}</div>
    </div>
    <div style="text-align:center;min-width:140px">
      <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">
        Supervisor responsable
      </div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Firma</div>
    </div>
    <div style="text-align:center;min-width:120px">
      <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">Jefatura</div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Visto Bueno</div>
    </div>
  </div>`;

  const page = `<!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${pdfCss('params')}</style>
  </head><body>
  <div class="ppage">
    ${headHtml}
    <table>
      <thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="spacer"></div>
    ${footHtml}
  </div>
  <script>
    try { document.title = ${JSON.stringify(fileName)}; } catch(_){}
    var _printed=false;
    function doPrint(){if(_printed)return;_printed=true;setTimeout(function(){window.print();},350);}
    if(document.readyState==='complete')doPrint();
    else window.addEventListener('load',doPrint,{once:true});
  <\/script></body></html>`;

  const w = window.open('','_blank','width=1100,height=720');
  if(!w){ toast('El navegador bloqueó la ventana emergente.','warn',6000); return; }
  w.document.write(page);
  w.document.close();
  try { w.document.title = fileName; } catch(_){}
  toast('📄 PDF: ' + fileName + ' · ' + list.length + ' registro(s)','ok',5000);
}

// ── Render ──────────────────────────────────────────────
function renderAst(){
  const fp = document.getElementById("fp-ast");
  if(!fp) return;
  const list = loadAst();
  const editingId = _astEditing;
  const rec = editingId ? list.find(r => r.id === editingId) : null;
  const d = rec ? rec.data : (_astRecovered || {});
  // ↩ Recuperar: solo en formulario nuevo (no en edición) y si hay snapshot válido.
  const astRec = (!editingId) ? loadAstRecovery() : null;
  const astRecBtn = astRec
    ? `<button class="btn brec" type="button" onclick="recoverAstForm()" title="Recuperar el formulario autoguardado de ${escapeHtml(new Date(astRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))}">↩ Recuperar (${escapeHtml(new Date(astRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))})</button>`
    : "";

  const optList = (arr, cur) => arr.map(s =>
    `<option value="${escapeHtml(s)}"${cur===s?" selected":""}>${escapeHtml(s)}</option>`
  ).join("");

  // Conjuntos seleccionados en multiselección, derivados del CSV almacenado
  const obsSet = new Set((d.observaciones||"").split(",").map(s => s.trim()).filter(Boolean));
  const accSet = new Set((d.accion       ||"").split(",").map(s => s.trim()).filter(Boolean));

  const chipsHtml = (arr, group, set) => arr.map(s => {
    const checked = set.has(s) ? " checked" : "";
    return `<label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;background:#fff;padding:5px 11px;border-radius:14px;border:1.5px solid var(--bdr);transition:all .12s">
      <input type="checkbox" data-group="${group}" value="${escapeHtml(s)}"${checked}
        style="margin:0;accent-color:var(--teal)">
      ${escapeHtml(s)}
    </label>`;
  }).join("");

  const tipoCur = astRevisionType(d.estadio || "");
  const tipoBg  = tipoCur === "Completa" ? "background:#f0fdf4;color:#065f46;border-color:#86efac"
                 : tipoCur === "Rápida"   ? "background:#fef3c7;color:#92400e;border-color:#fde68a"
                 : "background:var(--surf);color:var(--tx3)";

  const formHtml = `<div class="mad-form">
    <div class="meta">
      <div class="mf"><label>Fecha *</label><input type="date" name="fecha" value="${escapeHtml(d.fecha||today())}"></div>
      <div class="mf"><label>Supervisor *</label>
        <select name="supervisor">
          <option value="">— Selecciona —</option>${optList(AST_SUPERVISOR_OPTS, d.supervisor||"")}
        </select></div>
      <div class="mf"><label>Módulo *</label>
        <select name="modulo">
          <option value="">— Selecciona —</option>${optList(AST_MODULO_OPTS, d.modulo||"")}
        </select></div>
      <div class="mf"><label>Siembra *</label>
        <select name="siembra">
          <option value="">— Selecciona —</option>${optList(AST_SIEMBRA_OPTS, d.siembra||"")}
        </select></div>
      <div class="mf"><label>Corrida</label>
        <input name="corrida" value="${ev(d,'corrida')}" placeholder="Ej. 444, 554, 314" maxlength="20"></div>
    </div>
    <div class="meta">
      <div class="mf"><label>Estadío observado *</label>
        <select name="estadio" onchange="astEstadioChange()">
          <option value="">— Selecciona —</option>${optList(AST_ESTADIO_OPTS, d.estadio||"")}
        </select></div>
      <div class="mf"><label>Tipo de revisión <span style="font-weight:500;text-transform:none;color:#64748b">(automático)</span></label>
        <input id="ast-tipo-display" data-skip-collect="1" readonly
          value="${escapeHtml(tipoCur||"—")}"
          style="${tipoBg};font-weight:700;font-family:var(--mono);cursor:not-allowed"
          title="Se asigna automáticamente: N5–M3 → Completa · PL1+ → Rápida"></div>
      <div class="mf"><label>Deformidad (%)</label>
        <input type="number" name="deformidad" value="${vl(d,'deformidad')}" min="0" max="100" step="0.1" inputmode="decimal" placeholder="0 – 100"></div>
      <div class="mf"><label>% Atraso</label>
        <input type="number" name="atraso" value="${vl(d,'atraso')}" min="0" max="100" step="0.1" inputmode="decimal" placeholder="0 – 100"></div>
      <div class="mf"><label>% Hernia</label>
        <input type="number" name="hernia" value="${vl(d,'hernia')}" min="0" max="100" step="0.1" inputmode="decimal" placeholder="0 – 100"></div>
      <div class="mf"><label>Semillenas (%)</label>
        <input type="number" name="semillenas" value="${vl(d,'semillenas')}" min="0" max="100" step="0.1" inputmode="decimal" placeholder="0 – 100"></div>
      <div class="mf"><label>Vacías (%)</label>
        <input type="number" name="vacias" value="${vl(d,'vacias')}" min="0" max="100" step="0.1" inputmode="decimal" placeholder="0 – 100"></div>
    </div>
    <div class="meta">
      <div class="mf"><label>Intestino</label>
        <select name="intestino">
          <option value="">— Selecciona —</option>${optList(AST_INTESTINO_OPTS, d.intestino||"")}
        </select></div>
      <div class="mf"><label>Actividad</label>
        <select name="actividad">
          <option value="">— Selecciona —</option>${optList(AST_ACTIVIDAD_OPTS, d.actividad||"")}
        </select></div>
      <div class="mf"><label>Condición biológica</label>
        <select name="condicion">
          <option value="">— Selecciona —</option>${optList(AST_CONDICION_OPTS, d.condicion||"")}
        </select></div>
      <div class="mf"><label>Opacidad</label>
        <select name="opacidad">
          <option value="">— Selecciona —</option>${optList(AST_OPACIDAD_OPTS, d.opacidad||"")}
        </select></div>
      <div class="mf"><label>Hernia</label>
        <select name="hernia_grado">
          <option value="">— Selecciona —</option>${optList(AST_HERNIA_OPTS, d.hernia_grado||"")}
        </select></div>
      <div class="mf"><label>Asimilación</label>
        <select name="asimilacion">
          <option value="">— Selecciona —</option>${optList(AST_ASIMILACION_OPTS, d.asimilacion||"")}
        </select></div>
    </div>
    <div class="mad-section-title">👁 Observaciones <span style="font-weight:500;text-transform:none;letter-spacing:.2px;color:#64748b">— multiselección (marca todas las que apliquen)</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px 8px;padding:10px;background:var(--surf);border:1.5px solid var(--bdr);border-radius:10px;margin-bottom:6px">
      ${chipsHtml(AST_OBS_OPTS, "obs", obsSet)}
    </div>
    <div class="mad-section-title">🛠 Acción <span style="font-weight:500;text-transform:none;letter-spacing:.2px;color:#64748b">— multiselección (marca todas las que apliquen)</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px 8px;padding:10px;background:var(--surf);border:1.5px solid var(--bdr);border-radius:10px;margin-bottom:6px">
      ${chipsHtml(AST_ACCION_OPTS, "acc", accSet)}
    </div>
    <div class="ffoot">
      <div class="ff" style="min-width:260px"><label>Comentario matutino *</label>
        <textarea name="comentario" placeholder="Comentario del turno matutino (obligatorio)…">${escapeHtml(d.comentario||"")}</textarea></div>
      <div class="ff" style="min-width:260px"><label>Comentario vespertino</label>
        <textarea name="comentario_vesp" placeholder="Comentario del turno vespertino (opcional)…">${escapeHtml(d.comentario_vesp||"")}</textarea></div>
    </div>
    <div class="sa">
      <div class="sa-info">
        <span>${editingId ? "✏️ Editando registro #"+escapeHtml(String(editingId).slice(0,5)) : "📝 Crear nuevo registro de supervisión"}</span>
      </div>
      <div class="sa-btns">
        ${editingId
          ? `<button class="btn bo" type="button" onclick="cancelAstEdit()" title="Descartar la edición">✖ Cancelar</button>`
          : `${astRecBtn}<button class="btn bo" type="button" onclick="clearAstForm()" title="Vaciar todos los campos del formulario sin guardar">🧹 Limpiar formulario</button>`}
        <button class="btn bs" type="button" onclick="saveAstLocal()" title="Guardar en el historial sin enviar a Google Sheets">💾 Guardar local</button>
        <button class="btn bpdf" type="button" onclick="downloadAstPDF()" title="PDF horizontal con todos los registros del historial">📄 PDF</button>
        <button class="btn bp" type="button" onclick="saveAstSync()">☁️ ${editingId ? "Actualizar y sincronizar" : "Guardar y sincronizar"}</button>
      </div>
    </div>
  </div>`;

  // ── Historial inline ──
  const itemHtml = (r) => {
    const a = r.data || {};
    const safeId = escapeHtml(r.id);
    const left = AST_TTL - (Date.now() - r.ts);
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    const ttlTxt = left <= 0 ? "expira pronto"
                : (h >= 1 ? ("expira en "+h+" h "+m+" min")
                          : ("expira en "+m+" min"));
    const tipoTxt = a.tipo_revision || astRevisionType(a.estadio||"");
    const tipoBadge = tipoTxt === "Completa"
      ? `<span class="bit-tag sis">🔍 Completa</span>`
      : tipoTxt === "Rápida"
      ? `<span class="bit-tag mod">⚡ Rápida</span>`
      : "";
    const syncBtn = !r.synced
      ? `<button class="alg-hist-edit"
          style="border-color:rgba(0,191,165,.4);color:#0f766e;background:#ecfeff"
          onclick="syncOneAstFromList('${safeId}')"
          title="Enviar este registro a Google Sheets">☁️</button>`
      : '';
    return `<div class="mad-item${r.id===editingId?' editing':''}">
      <div class="mad-item-body">
        <div class="mad-item-title">
          <span><b>📅 ${escapeHtml(a.fecha||"—")}</b></span>
          <span class="bit-tag mod">${escapeHtml(a.supervisor||"—")}</span>
          <span class="bit-tag area">${escapeHtml(a.modulo||"—")}</span>
          ${tipoBadge}
          ${r.synced
            ? '<span class="ssp ssp-ok">✅ Sincronizado</span>'
            : '<span class="ssp ssp-pend">⏳ Pendiente</span>'}
        </div>
        <div class="mad-item-meta">
          <span><b>Siembra:</b> ${escapeHtml(a.siembra||"—")}</span>
          ${a.corrida ? `<span><b>Corrida:</b> ${escapeHtml(String(a.corrida))}</span>` : ''}
          <span><b>Estadío:</b> ${escapeHtml(a.estadio||"—")}</span>
          <span><b>Def:</b> ${escapeHtml(String(a.deformidad==null||a.deformidad===""?"—":a.deformidad+"%"))}</span>
          <span><b>Atraso:</b> ${escapeHtml(String(a.atraso==null||a.atraso===""?"—":a.atraso+"%"))}</span>
          <span><b>% Hernia:</b> ${escapeHtml(String(a.hernia==null||a.hernia===""?"—":a.hernia+"%"))}</span>
          <span><b>Semillenas:</b> ${escapeHtml(String(a.semillenas==null||a.semillenas===""?"—":a.semillenas+"%"))}</span>
          <span><b>Vacías:</b> ${escapeHtml(String(a.vacias==null||a.vacias===""?"—":a.vacias+"%"))}</span>
          <span><b>Intestino:</b> ${escapeHtml(a.intestino||"—")}</span>
          <span><b>Actividad:</b> ${escapeHtml(a.actividad||"—")}</span>
          <span><b>Condición:</b> ${escapeHtml(a.condicion||"—")}</span>
          <span><b>Opacidad:</b> ${escapeHtml(a.opacidad||"—")}</span>
          <span><b>Hernia:</b> ${escapeHtml(a.hernia_grado||"—")}</span>
          <span><b>Asimilación:</b> ${escapeHtml(a.asimilacion||"—")}</span>
          ${a.observaciones ? `<span style="flex-basis:100%"><b>Obs:</b> ${escapeHtml(a.observaciones)}</span>` : ''}
          ${a.accion        ? `<span style="flex-basis:100%"><b>Acción:</b> ${escapeHtml(a.accion)}</span>` : ''}
          ${a.comentario     ? `<span style="flex-basis:100%"><b>Coment. mat.:</b> ${escapeHtml(a.comentario)}</span>` : ''}
          ${a.comentario_vesp? `<span style="flex-basis:100%"><b>Coment. vesp.:</b> ${escapeHtml(a.comentario_vesp)}</span>` : ''}
          <span style="color:#94a3b8;font-size:10px">⏱ ${escapeHtml(ttlTxt)}</span>
        </div>
      </div>
      <div class="mad-item-actions">
        <button class="alg-hist-edit" onclick="editAstRecord('${safeId}')" title="Editar">✏️</button>
        ${syncBtn}
        <button class="alg-hist-del" onclick="deleteAstRecord('${safeId}')" title="Eliminar">🗑</button>
      </div>
    </div>`;
  };

  const items = list.length === 0
    ? '<div class="mad-empty">📋 No hay registros en el historial. Llena el formulario y pulsa <b>💾 Guardar local</b> o <b>☁️ Guardar y sincronizar</b>.</div>'
    : list.map(itemHtml).join('');

  const pending = list.filter(r => !r.synced).length;
  const listHeader = pending > 0
    ? `<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin:8px 0 4px">
        <span style="font-size:11px;color:var(--tx2)">
          ${pending} registro${pending!==1?'s':''} pendiente${pending!==1?'s':''} de sincronizar
        </span>
        <button class="btn bp" type="button" onclick="syncAllPendingAst()"
          style="font-size:11px;padding:6px 14px"
          title="Envía todos los pendientes en una sola llamada">
          ☁️ Enviar todos
        </button>
      </div>`
    : '';

  fp.innerHTML = `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📋 As Técnico · Registro de Supervisión</div>
      <span class="ssp ssp-mt">${list.length}/${AST_MAX} · TTL ${Math.round(AST_TTL/3600000)} h</span>
    </div>
    <div class="fc-b">
      ${formHtml}
      ${listHeader}
      <div class="mad-list">${items}</div>
      <div style="margin-top:10px;font-size:10.5px;color:var(--tx3);line-height:1.6">
        ℹ️ Los registros se conservan localmente hasta <b>${Math.round(AST_TTL/3600000)} horas</b> (máx <b>${AST_MAX}</b>). Tras este período se borran automáticamente. Los enviados quedan en la hoja <code>${AST_SHEET}</code> de Google Sheets.
      </div>
    </div>
  </div>`;
  fixupLabels(fp);
  // Marca el formulario como "con datos sin guardar" (cobertura del aviso de
  // cierre). Delegado en el panel: sobrevive a los reemplazos de innerHTML.
  if(!fp._astDirtyBound){
    fp._astDirtyBound = true;
    fp.addEventListener("input",  _astMarkDirty);
    fp.addEventListener("change", _astMarkDirty);
  }
  _astFormDirty = false;   // el formulario recién renderizado refleja lo guardado/recuperado (limpio)
}


/* ══════════════════════════════════════════
   MICROBIOLOGÍA (Mic) — FASE 1
   ──────────────────────────────────────────
   Bacteriología: Larvicultura·Muestra (Animal/Agua) y Maduración·Principal.
   El técnico teclea el CONTEO natural; el sistema calcula UFC = conteo × factor
   (editable por parámetro/área en la vista Factores), lo muestra en notación
   científica y colorea el Nivel (Mínimo/Leve/Moderado/Elevado). V.Totales se
   auto-suma. Se sincroniza a la hoja ancha "Microbiología" (reemplazo por
   sesión: Fecha muestreo + Corrida + Departamento + Formato → sin duplicados).
══════════════════════════════════════════ */
const MIC_PRE         = "larv4_mic_";
const MIC_REC_KEY     = "larv4_mic_records";
const MIC_DRAFT_KEY   = "larv4_mic_draft";
const MIC_RECOV_KEY   = RPRE + "micdraft";            // recuperación del Nuevo análisis (espejo de Biomol; TTL 1h = RTTL)
const MIC_TTL         = 7 * 24 * 60 * 60 * 1000;      // Historial Microbiología: retención 7 días (decisión del usuario)
const MIC_FACTORS_KEY = "larv4_mic_factors";
const MIC_SHEET       = "Microbiología";
const MIC_TABS        = ["micnuevo","michist","micfact","micrep","fotos"];

const MIC_DEFAULT_ROWS = 8, MIC_ROW_STEP = 4, MIC_MAX_ROWS = 50;
let _micExtra = {};        // { fmtKey: filas extra agregadas }
let _micEditing = null;    // compat (reservado)
let _micDraftTm = null;

const MIC_ESTADIOS = ["","AS","N5 (MB)","N5 TEX","Z1","Z2","Z3","M1","M2","M3",
  "PL1","PL2","PL3","PL4","PL5","PL6","PL7","PL8","PL9","PL10","PL11","PL12","PL13","PL14"];
const MIC_SALAS    = ["","Sala 1","Sala 2","Sala 3","Sala 4","Sala 5"];      // sin 4A/4B
const MIC_MODULOS  = ["","1","2","3","4","5","6","7","8","9","10"];
const MIC_TQS_LARV = ["", "1","2","3","4","5","6","7","8","9","10","11","12"];
const MIC_SEXO     = ["","Machos","Hembras"];
const MIC_TIPO_M   = ["","Animal","Agua"];
const MIC_PA_OPTS  = ["","Presencia","Ausencia"];
// Catálogos de los formatos nuevos (Algas Mensual/R, Maduración desinfección)
const MIC_ALGM_LUGAR   = ["","Cepario 1","Cepario 2","Cepario 3","Sala 1","Sala 2","Sala 3"];
const MIC_ALGM_MUESTRA = ["","Nutriente 1","Nutriente 2","Nutriente 3","Nutriente 4","Tubo","Fiola 150 ml","Fiola 1 L","Fiola 2 L","Funda Matriz","Funda Producción"];
const MIC_DIAS         = ["","1","2","3","4","5"];
const MIC_ALGR_MUESTRA = ["","Fundas producción","Fundas Matriz","Masivo","Premasivo","PBR","Carboys 1","Carboys 2","Carboys 3","Carboys 4","Reservorio"];
const MIC_ALGR_ESPECIE = ["","Tw","TT"];
const MIC_MADDES_MUESTRA = ["","Agua del huevo antes de desinfección","Agua del huevo después de desinfección","Huevo antes desinfección","Huevo después de desinfección","Agua del nauplio 2 antes de desinfección","Agua del nauplio 2 después de desinfección","Nauplio 2 antes de desinfección","Nauplio 2 después de desinfección","Agua del nauplio 5 antes de desinfección","Agua del nauplio 5 después de desinfección","Nauplio 5 antes desinfección","Nauplio 5 después de desinfección"];

// Catálogo de parámetros: l=etiqueta, noRange=sin nivel, pa=presencia/ausencia,
// auto=suma de otros.
const MIC_PARAMS = {
  vamar:  { l:"C. Amarillas" },
  vverd:  { l:"C. Verdes" },
  vtot:   { l:"C. Totales", auto:["vamar","vverd"] },
  valg:   { l:"V.alginolyticus" },
  vpara:  { l:"V.parahaemolyticus" },
  vvuln:  { l:"V.vulnificus" },
  pseudo: { l:"Pseudomonas" },
  aero:   { l:"Aeromonas" },
  btot:   { l:"Bact.Totales" },
  bnar:   { l:"Bact.Naranjas" },
  hongos: { l:"Hongos" },
  pseudoGsp: { l:"Pseudomonas GSP" },
  aeroGsp:   { l:"Aeromonas GSP" },
  brojas: { l:"Bact.Rojas", noRange:true },
  entero: { l:"Enterobact.", noRange:true },
  levad:  { l:"Levaduras",   noRange:true },
  vlum:   { l:"V.Luminiscentes", pa:true }
};

// Formatos de Fase 1
const MIC_FORMATS = {
  "larv-muestra": {
    depto:"Larvicultura", label:"Larvicultura · Muestra",
    rkeyFn:(d)=> (d && d.tipoMuestra === "Agua") ? "larv-agua" : "larv-animal",
    ctx:[
      { k:"tipoMuestra", l:"Tipo de muestra", type:"sel", opts:MIC_TIPO_M,   w:92, recalc:true },
      { k:"modulo",      l:"Módulo",          type:"sel", opts:MIC_MODULOS,  w:58 },
      { k:"estadio",     l:"Estadío",         type:"sel", opts:MIC_ESTADIOS, w:84 },
      { k:"tq",          l:"TQ/N°",           type:"sel", opts:MIC_TQS_LARV, w:56 }
    ],
    params:["vamar","vverd","vtot","valg","vpara","vvuln","pseudo","aero","btot","bnar","hongos","entero","vlum","levad"]
  },
  "mad-principal": {
    depto:"Maduración", label:"Maduración · Principal",
    rkeyFn:()=> "mad-reprod",
    ctx:[
      { k:"sala", l:"Sala",  type:"sel", opts:MIC_SALAS, w:72 },
      { k:"sexo", l:"Sexo",  type:"sel", opts:MIC_SEXO,  w:80 },
      { k:"tq",   l:"TQ/N°", type:"txt", w:56 }
    ],
    params:["vamar","vverd","vtot","vlum","valg","vpara","vvuln","pseudo","aero","btot","bnar","hongos","entero"]
  },
  "mad-ensayo": {
    depto:"Maduración", label:"Maduración · Ensayo",
    rkeyFn:()=> "mad-reprod",
    ctx:[ { k:"muestras", l:"Muestras", type:"txt", w:180 } ],
    params:["vamar","vverd","vtot","valg","vpara","vvuln","pseudo","aero","btot","bnar","hongos","entero","vlum","levad"]
  },
  "reservorios": {
    depto:"Larvicultura", label:"Larvicultura · Reservorios",
    rkeyFn:()=> "larv-agua",
    ctx:[
      { k:"modulo",     l:"Módulo",     type:"sel", opts:MIC_MODULOS, w:58 },
      { k:"tanqueResv", l:"Reservorio", type:"txt", w:84 }
    ],
    params:["vamar","vverd","vtot","valg","vpara","vvuln","pseudo","aero","btot","bnar","hongos","entero","vlum","levad"]
  },
  "placa-amb": {
    depto:"Larvicultura", label:"Larvicultura · Placa ambiental",
    rkeyFn:()=> "ambiental",
    ctx:[ { k:"modulo", l:"Módulo", type:"sel", opts:MIC_MODULOS, w:58 } ],
    params:["vamar","vverd","valg","vpara","vvuln","pseudoGsp","aeroGsp","btot","hongos","levad"]
  },
  "artemia": {
    depto:"Larvicultura", label:"Larvicultura · Artemia",
    rkeyFn:()=> "artemia",
    ctx:[
      { k:"modulo", l:"Módulo", type:"sel", opts:MIC_MODULOS, w:58 },
      { k:"etapa",  l:"Etapa",  type:"sel", opts:["","Antes de desinfección","Después de desinfección"], w:150 }
    ],
    params:["vamar","vverd","vtot","btot","levad","hongos"]
  },
  "alim-vivo": {
    depto:"Maduración", label:"Maduración · Alimento vivo",
    rkeyFn:()=> "larv-animal",
    ctx:[ { k:"origen", l:"Origen/Tipo", type:"txt", w:160 } ],
    params:["vamar","vverd","hongos","aero","pseudo","levad","btot"]
  },
  "ras": {
    depto:"Maduración", label:"Maduración · RAS",
    rkeyFn:()=> "ras-agua",
    ctx:[ { k:"componente", l:"Componente", type:"sel", opts:["","Colector","Salida"], w:96 } ],
    params:["vamar","vverd","vtot","aero","pseudo","btot","brojas"]
  },
  "agua-mar": {
    depto:"Maduración", label:"Maduración · Agua de Mar", fixedTipo:"Agua de mar",
    rkeyFn:()=> "larv-agua",
    ctx:[],
    params:["vamar","vverd","vtot","valg","vpara","vvuln","aero","pseudo","btot"]
  },
  "externas": {
    depto:"Otras", label:"Muestras externas",
    rkeyFn:()=> "larv-animal",
    ctx:[
      { k:"laboratorio", l:"Laboratorio", type:"txt", w:120 },
      { k:"raceways",    l:"Raceways",    type:"txt", w:70 },
      { k:"tanques",     l:"Tanques",     type:"txt", w:70 }
    ],
    params:["vamar","vverd","vtot","vlum"]
  },
  "hisopados": {
    depto:"Otras", label:"Hisopados",
    rkeyFn:()=> "ambiental",
    ctx:[
      { k:"laboratorio", l:"Laboratorio (MB)", type:"txt", w:110 },
      { k:"modulo",      l:"Módulo",           type:"sel", opts:MIC_MODULOS, w:58 },
      { k:"tanqueResv",  l:"Tanque/Reservorio",type:"txt", w:110 },
      { k:"punto",       l:"Punto de muestreo",type:"sel", opts:["","Fondo","Brida","Línea de agua salada","Tubos","Línea de aire"], w:150 }
    ],
    params:["vamar","vverd","vtot","pseudo","aero","hongos","levad"]
  },
  "hisopados-despacho": {
    // Antes/Después por Carro/Tina = DOS filas (columna Etapa = Antes / Después),
    // usando las columnas de bacteria YA existentes (valg/vvuln/vpara/pseudo/aero).
    // No crea columnas de bacteria nuevas; Módulo→"Módulo/Sala", Etapa→"Etapa"
    // (existentes), y se añaden "Carro"/"Tina" a la hoja (al final).
    depto:"Otras", label:"Hisopados (despacho)",
    rkeyFn:()=> "ambiental",
    ctx:[
      { k:"modulo", l:"Módulo", type:"sel", opts:MIC_MODULOS, w:58 },
      { k:"carro",  l:"Carro",  type:"txt", w:80 },
      { k:"tina",   l:"Tina",   type:"txt", w:80 },
      { k:"etapa",  l:"Etapa",  type:"sel", opts:["","Antes","Después"], w:96 }
    ],
    params:["valg","vvuln","vpara","pseudo","aero"]
  },
  "algas": {
    depto:"Otras", label:"Algas",
    rkeyFn:()=> "ambiental",
    ctx:[
      { k:"punto", l:"Punto de muestreo", type:"sel", opts:["","PBR 1 Tubo A","PBR 2 Tubo B","Pared","Mesa cerámica","Vidrio","Aire acondicionado","Tubos de la línea de aire"], w:165 }
    ],
    params:["vamar","vverd","vtot","pseudo","aero","hongos","levad"]
  },
  "mad-desinf": {
    depto:"Maduración", label:"Maduración · Desinfección",
    rkeyFn:()=> "mad-agua",
    ctx:[
      { k:"origen",      l:"Origen",  type:"txt", w:100 },
      { k:"siembra",     l:"Siembra", type:"txt", w:80 },
      { k:"corrida",     l:"Corrida", type:"txt", w:70 },
      { k:"tipoMuestra", l:"Muestra", type:"sel", opts:MIC_MADDES_MUESTRA, w:240 }
    ],
    params:["vamar","vverd","vtot","vlum"]
  },
  "algas-mensual": {
    depto:"Otras", label:"Algas Mensual",
    rkeyFn:()=> "algas",
    ctx:[
      { k:"lugar",       l:"Lugar",    type:"sel", opts:MIC_ALGM_LUGAR,   w:92 },
      { k:"tipoMuestra", l:"Muestra",  type:"sel", opts:MIC_ALGM_MUESTRA, w:130 },
      { k:"variedad",    l:"Variedad", type:"txt", w:110 },
      { k:"dias",        l:"Días",     type:"sel", opts:MIC_DIAS,         w:56 }
    ],
    params:["vamar","vverd","vtot","btot"]
  },
  "algas-r": {
    depto:"Otras", label:"Algas R",
    rkeyFn:()=> "algas",
    ctx:[
      { k:"tipoMuestra", l:"Muestras", type:"sel", opts:MIC_ALGR_MUESTRA, w:130 },
      { k:"especie",     l:"Especie",  type:"sel", opts:MIC_ALGR_ESPECIE, w:72 },
      { k:"modulo",      l:"Módulo",   type:"txt", w:64 }
    ],
    params:["vamar","vverd","vtot","pseudo","aero"]
  }
};
const MIC_FORMAT_KEYS = ["larv-muestra","reservorios","placa-amb","artemia","mad-principal","mad-ensayo","alim-vivo","ras","agua-mar","mad-desinf","externas","hisopados","hisopados-despacho","algas","algas-mensual","algas-r"];
// Formatos en los que la Corrida es obligatoria para guardar/sincronizar.
const MIC_CORRIDA_REQ = new Set(["larv-muestra"]);
function micFormatLabel(fmtKey){ return (MIC_FORMATS[fmtKey] && MIC_FORMATS[fmtKey].label) || fmtKey || ""; }

// Factores/umbrales base (de la app de referencia). Editables en la vista
// Factores; el UFC se clasifica sobre el valor multiplicado (conteo × f).
const MIC_DR_BASE = {
  "larv-animal":{
    vamar:{f:100,l:1000,m:5000,e:10000}, vverd:{f:100,l:300,m:600,e:1000},
    vtot:{f:100,l:1000,m:5000,e:10000},
    valg:{f:100,l:1000,m:5000,e:10000}, vpara:{f:100,l:300,m:600,e:1000}, vvuln:{f:100,l:300,m:600,e:1000},
    pseudo:{f:100,l:300,m:600,e:1000}, aero:{f:100,l:1000,m:5000,e:10000},
    btot:{f:1000,l:10000,m:100000,e:1000000}, bnar:{f:1000,l:1000,m:5000,e:10000},
    hongos:{f:20,l:20,m:200,e:400}, entero:{f:1}, levad:{f:1}
  },
  "larv-agua":{
    vamar:{f:10,l:1000,m:5000,e:10000}, vverd:{f:10,l:100,m:200,e:300},
    vtot:{f:10,l:1000,m:5000,e:10000},
    valg:{f:10,l:1000,m:5000,e:10000}, vpara:{f:10,l:100,m:200,e:300}, vvuln:{f:10,l:100,m:200,e:300},
    pseudo:{f:10,l:100,m:200,e:300}, aero:{f:10,l:1000,m:5000,e:10000},
    btot:{f:1000,l:10000,m:100000,e:1000000}, bnar:{f:1000,l:1000,m:5000,e:10000},
    hongos:{f:20,l:2,m:20,e:40}, entero:{f:1}, levad:{f:1}
  },
  "mad-reprod":{
    vamar:{f:200,l:1000,m:10000,e:100000}, vverd:{f:200,l:500,m:3000,e:5000},
    vtot:{f:200,l:1000,m:10000,e:100000},
    valg:{f:200,l:500,m:3000,e:5000}, vpara:{f:200,l:500,m:3000,e:5000}, vvuln:{f:200,l:500,m:3000,e:5000},
    pseudo:{f:200,l:500,m:3000,e:5000}, aero:{f:200,l:1000,m:10000,e:100000},
    btot:{f:1000,l:10000,m:100000,e:1000000}, bnar:{f:1000,l:100,m:500,e:1000},
    hongos:{f:20,l:20,m:200,e:400}, entero:{f:1}, levad:{f:1}
  },
  "ambiental":{
    vamar:{f:1,l:25,m:50,e:500}, vverd:{f:1,l:10,m:30,e:300}, vtot:{f:1,l:25,m:50,e:500},
    valg:{f:1,l:25,m:50,e:500}, vpara:{f:1,l:10,m:30,e:300}, vvuln:{f:1,l:10,m:30,e:300},
    pseudo:{f:1,l:10,m:30,e:300}, aero:{f:1,l:25,m:50,e:500},
    pseudoGsp:{f:1,l:10,m:30,e:300}, aeroGsp:{f:1,l:25,m:50,e:500},
    btot:{f:1,l:10,m:100,e:500}, hongos:{f:1}, levad:{f:1}
  },
  "artemia":{
    vamar:{f:20,l:1000,m:10000,e:100000}, vverd:{f:20,l:500,m:3000,e:5000}, vtot:{f:20,l:1000,m:10000,e:100000},
    pseudo:{f:20,l:500,m:3000,e:5000}, aero:{f:20,l:1000,m:10000,e:100000},
    btot:{f:1000,l:10000,m:100000,e:1000000}, hongos:{f:20,l:20,m:200,e:400}, levad:{f:1}
  },
  "ras-agua":{
    vamar:{f:5,l:100,m:500,e:1000}, vverd:{f:5,l:50,m:100,e:200}, vtot:{f:5,l:100,m:500,e:1000},
    pseudo:{f:10,l:50,m:100,e:200}, aero:{f:10,l:100,m:500,e:1000},
    btot:{f:1000,l:10000,m:100000,e:1000000}, bnar:{f:1000,l:1000,m:5000,e:10000},
    brojas:{f:1000}
  },
  "algas":{
    vamar:{f:1,l:1,m:2,e:10}, vverd:{f:1,l:1,m:2,e:10}, vtot:{f:1,l:1,m:2,e:10},
    pseudo:{f:1,l:1,m:2,e:10}, aero:{f:1,l:1,m:2,e:10}, btot:{f:1,l:10,m:100,e:500}
  },
  "mad-agua":{
    vamar:{f:10,l:100,m:500,e:1000}, vverd:{f:10,l:50,m:100,e:200}, vtot:{f:10,l:100,m:500,e:1000},
    valg:{f:10,l:100,m:500,e:1000}, vpara:{f:10,l:50,m:100,e:200}, vvuln:{f:10,l:50,m:100,e:200},
    pseudo:{f:10,l:50,m:100,e:200}, aero:{f:10,l:100,m:500,e:1000},
    btot:{f:1000,l:10000,m:100000,e:1000000}, bnar:{f:1000,l:100,m:500,e:1000}, hongos:{f:20,l:2,m:20,e:40}
  }
};
const MIC_LVL_TXT = { v:"Mínimo", y:"Leve", o:"Moderado", r:"Elevado" };
function _micLegendHtml(){
  const b=(c,bd)=>`<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${c};border:1px solid ${bd};vertical-align:middle;margin-right:3px"></span>`;
  return `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:10px;margin-bottom:10px;padding:7px 10px;background:#f8fafc;border:1px solid var(--bdr);border-radius:8px"><b>Niveles (UFC/mL):</b><span>${b("#bbf7d0","#4ade80")}Mínimo</span><span>${b("#fef08a","#facc15")}Leve</span><span>${b("#fed7aa","#fb923c")}Moderado</span><span>${b("#fecaca","#f87171")}Elevado</span></div>`;
}
const MIC_PDF_CSS = "td.mic-v{background:#bbf7d0!important;color:#14532d!important;font-weight:700}td.mic-y{background:#fef08a!important;color:#713f12!important;font-weight:700}td.mic-o{background:#fed7aa!important;color:#7c2d12!important;font-weight:700}td.mic-r{background:#fecaca!important;color:#7f1d1d!important;font-weight:700}.miclegend{display:flex;gap:12px;flex-wrap:wrap;font-size:7.5pt;margin:3px 0 8px;padding:4px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px}.micbox{display:inline-block;width:9px;height:9px;border-radius:2px;border:1px solid;vertical-align:middle;margin-right:3px}tr.critline th{background:#eef2f7!important;border-top:none!important}th.pcrit{font-size:5pt!important;font-weight:400!important;color:#475569!important;letter-spacing:0;padding:1px 2px!important;white-space:normal!important}@page{size:A4 landscape}table{table-layout:fixed!important;width:100%!important}th,td{white-space:normal!important;overflow-wrap:break-word;word-break:normal;font-size:6pt!important;padding:1.5px 2px!important}thead th:first-child,.tqc{width:14px!important;min-width:14px!important}";
const MIC_PDF_LEGEND = '<div class="miclegend"><b>Niveles (UFC/mL):</b><span><span class="micbox" style="background:#bbf7d0;border-color:#4ade80"></span>Mínimo</span><span><span class="micbox" style="background:#fef08a;border-color:#facc15"></span>Leve</span><span><span class="micbox" style="background:#fed7aa;border-color:#fb923c"></span>Moderado</span><span><span class="micbox" style="background:#fecaca;border-color:#f87171"></span>Elevado</span><span style="color:#64748b">· bajo cada columna: umbrales Mín/Leve/Mod (UFC/mL)</span></div>';

// ── Helpers de cálculo ─────────────────────────────────
function micToSci(v){
  const n = parseFloat(v);
  if(!isFinite(n) || v === "" || v === null) return "—";
  if(n === 0) return "0.0E+00";
  const e = Math.floor(Math.log10(Math.abs(n)));
  const m = (n / Math.pow(10, e)).toFixed(1);
  return m + "E" + (e >= 0 ? "+" : "-") + String(Math.abs(e)).padStart(2,"0");
}
function micLvl(ufc, r){
  if(!r || !isFinite(ufc) || r.l == null) return null;
  if(ufc < r.l) return "v";
  // Umbrales parciales: un umbral superior no definido se trata como +∞, para que
  // un valor por encima del Mínimo NO escale a "Elevado" solo porque falten Leve
  // o Moderado (antes `ufc < undefined` era false → caía a "r"/rojo de forma
  // engañosa). Así solo se llega a "Elevado" si se define el umbral Moderado.
  const m = (r.m == null) ? Infinity : r.m;
  const e = (r.e == null) ? Infinity : r.e;
  if(ufc < m) return "y";
  if(ufc < e) return "o";
  return "r";
}
function loadMicFactors(){
  const out = JSON.parse(JSON.stringify(MIC_DR_BASE));
  try{
    const raw = localStorage.getItem(MIC_FACTORS_KEY);
    if(raw){ const o = JSON.parse(raw); if(o && typeof o === "object"){
      Object.keys(o).forEach(ak=>{ out[ak] = out[ak] || {};
        Object.keys(o[ak]||{}).forEach(pk=>{ out[ak][pk] = Object.assign({}, out[ak][pk]||{}, o[ak][pk]||{}); });
      });
    } }
  }catch(_){}
  return out;
}
function saveMicFactors(F){ try{ localStorage.setItem(MIC_FACTORS_KEY, JSON.stringify(F||{})); }catch(_){ toast("No se pudo guardar factores","err"); } }
function micFactorOf(rkey, pk){ const F = loadMicFactors(); return (F[rkey] && F[rkey][pk]) ? F[rkey][pk] : { f:1 }; }

// Calcula crudo/ufc/lvl por parámetro de un registro (usa los factores actuales).
function micComputeRecord(rec){
  const d = rec.data || {};
  const fmt = MIC_FORMATS[d.formato];
  const rkey = fmt ? fmt.rkeyFn(d) : "larv-animal";
  const out = {};
  const amar = parseFloat(d.vamar), verd = parseFloat(d.vverd);
  Object.keys(MIC_PARAMS).forEach(pk=>{
    const p = MIC_PARAMS[pk];
    if(p.pa){ out[pk] = { pa: d[pk] || "" }; return; }
    if(pk === "vtot"){
      if(!isFinite(amar) && !isFinite(verd)){ out.vtot = { crudo:"", ufc:"", lvl:null }; return; }
      const fa = micFactorOf(rkey,"vamar").f || 1, fb = micFactorOf(rkey,"vverd").f || 1;
      const ufc = (isFinite(amar)?amar*fa:0) + (isFinite(verd)?verd*fb:0);
      const crudo = (isFinite(amar)?amar:0) + (isFinite(verd)?verd:0);
      out.vtot = { crudo, ufc, lvl: micLvl(ufc, micFactorOf(rkey,"vtot")) };
      return;
    }
    const raw = parseFloat(d[pk]);
    if(!isFinite(raw)){ out[pk] = { crudo:"", ufc:"", lvl:null }; return; }
    const r = micFactorOf(rkey, pk); const f = r.f || 1; const ufc = raw * f;
    // Clasifica cuando hay umbrales definidos para ese (área, parámetro). micLvl
    // devuelve null si no hay umbral (r.l == null), así que los antes "noRange"
    // (Enterobact./Levaduras/Bact.Rojas) solo se colorean si el usuario fijó
    // Mínimo/Leve/Moderado en Factores para esa área.
    out[pk] = { crudo: raw, ufc, lvl: micLvl(ufc, r) };
  });
  return out;
}

// ── Storage ────────────────────────────────────────────
function _micRaw(){ try{ const raw = localStorage.getItem(MIC_REC_KEY); if(!raw) return []; const a = JSON.parse(raw); return Array.isArray(a)?a:[]; }catch(_){ return []; } }
function _micSave(list){
  const ok = _lsSet(MIC_REC_KEY, JSON.stringify(list||[]));
  if(!ok && !_reclaiming) toast("❌ Este navegador NO está guardando los datos (almacenamiento lleno, en modo privado o bloqueado). Usa ☁️ Guardar y sincronizar para no perderlos.","err",7000);
  return ok;
}
// Purga del historial: elimina solo sesiones YA SINCRONIZADAS con más de 7 días
// (MIC_TTL). Las pendientes (no sincronizadas) se CONSERVAN para no perder datos
// sin enviar. Se aplica al leer el historial y desde cleanup() en el arranque.
function pruneMic(){
  const now = Date.now(); const raw = _micRaw();
  const list = raw.filter(r=> !(r && r.synced && r.ts && (now - r.ts) > MIC_TTL));
  if(list.length !== raw.length) _micSave(list);
  return list;
}
function loadMic(){ return pruneMic().slice().sort((a,b)=>(b.ts||0)-(a.ts||0)); }
// Id de sesión por "Nuevo análisis". Si el registro tiene sid, ESA es su sesión;
// los registros antiguos (sin sid) se agrupan por la clave compuesta heredada.
function _micNewSid(){ return "s"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
// Clave de sesión = compuesta (Fecha+Corrida+Departamento+Formato) + sid. Espeja
// la clave de upsert de la hoja (keyCols [0,2,4,5,SID]). Así formatos / fechas /
// corridas / análisis distintos son sesiones SEPARADAS que se acumulan (como el
// historial de Larvicultura). Registros heredados (sin sid) usan solo la compuesta.
function micSessionKey(d){
  const comp = [d.fechaMuestreo, d.corrida, d.departamento, d.formato].join("|");
  return d.sid ? comp + "|" + d.sid : comp;
}

function loadMicDraft(){
  const def = { meta:{ fechaMuestreo:today(), fechaResultados:"", corrida:"", responsable:"", hdrModulo:"", hdrEstadio:"" }, sections:{}, activeFmt:"larv-muestra" };
  try{ const raw = localStorage.getItem(MIC_DRAFT_KEY); if(raw){ const o = JSON.parse(raw); if(o && typeof o === "object")
    return { meta: Object.assign({}, def.meta, o.meta||{}), sections: o.sections || {}, activeFmt: o.activeFmt || "larv-muestra" }; } }catch(_){}
  return def;
}
function saveMicDraft(d){ _lsSet(MIC_DRAFT_KEY, JSON.stringify(d||{})); }

// ── Recolección del borrador desde el DOM ──────────────
function collectMicDraft(){
  const prev = loadMicDraft();
  const meta = Object.assign({ fechaMuestreo:today(), fechaResultados:"", corrida:"", responsable:"" }, prev.meta||{});
  const fm = document.getElementById("mic-fm"), fr = document.getElementById("mic-fr"),
        co = document.getElementById("mic-corr"), re = document.getElementById("mic-resp");
  if(fm) meta.fechaMuestreo  = isValidDate(fm.value) ? fm.value : "";
  if(fr) meta.fechaResultados= isValidDate(fr.value) ? fr.value : "";
  if(co) meta.corrida        = sanitizeStr(co.value);
  if(re) meta.responsable    = sanitizeStr(re.value);
  // Item 3: valores de cabecera Módulo/Estadío (rellenan todas las filas).
  const _hm=document.getElementById("mic-hdr-modulo");  if(_hm) meta.hdrModulo  = sanitizeStr(_hm.value);
  const _he=document.getElementById("mic-hdr-estadio"); if(_he) meta.hdrEstadio = sanitizeStr(_he.value);
  // Conserva los formatos NO visibles (solo se renderiza el activo).
  const sections = Object.assign({}, prev.sections || {});
  MIC_FORMAT_KEYS.forEach(fmtKey=>{
    const fmt = MIC_FORMATS[fmtKey];
    const tbody = document.getElementById("mic-tb-"+fmtKey);
    if(!tbody) return;
    const rows = [];
    tbody.querySelectorAll("tr").forEach((tr, idx)=>{
      const fila = idx + 1; const d = {};
      const get = (k)=>{ const el = tr.querySelector(`[name="mic_${fmtKey}_${fila}_${k}"]`); return el ? el.value : ""; };
      fmt.ctx.forEach(c=>{ d[c.k] = sanitizeStr(get(c.k)); });
      fmt.params.forEach(pk=>{ if(pk === "vtot") return; d[pk] = sanitizeStr(get(pk)); });
      rows.push(d);
    });
    const obsEl = document.getElementById("mic-obs-"+fmtKey);
    sections[fmtKey] = { rows, obs: obsEl ? sanitizeStr(obsEl.value) : "" };
  });
  const selEl = document.getElementById("mic-fmt-sel");
  const activeFmt = (selEl && selEl.value) ? selEl.value : (prev.activeFmt || "larv-muestra");
  return { meta, sections, activeFmt };
}
function micDraftTouch(){ clearTimeout(_micDraftTm); _micDraftTm = setTimeout(()=>{ try{ saveMicDraft(collectMicDraft()); }catch(_){} }, 500); }
function micRowHasData(fmt, d){ return fmt.params.some(pk=> pk !== "vtot" && d[pk] != null && String(d[pk]).trim() !== ""); }

// OBSOLETO desde el modelo de "id de sesión": la identidad de una sesión ya NO
// depende de la Corrida (cada "Nuevo análisis" tiene su sid). Cambiar la Corrida
// en el borrador actual solo cambia ese campo de la MISMA sesión; no crea otra.
// Se deja como no-op para no romper a los llamadores (oninput de los inputs).
function _sessionCorridaWarn(){ /* no-op */ }
function micCorridaChange(){ _sessionCorridaWarn(_micRaw, document.getElementById("mic-fm"), document.getElementById("mic-corr")); micDraftTouch(); }
function calCorridaChange(){ _sessionCorridaWarn(_calRaw, document.getElementById("cal-fm"), document.getElementById("cal-corr")); calDraftTouch(); }
function patCorridaChange(){ _sessionCorridaWarn(_patRaw, document.getElementById("pat-fm"), document.getElementById("pat-corr")); patDraftTouch(); }

// ── Cálculo en vivo ────────────────────────────────────
function micRowRkey(tr, fmtKey){
  const fmt = MIC_FORMATS[fmtKey]; if(!fmt) return "larv-animal";
  const tm = tr.querySelector('select[name$="_tipoMuestra"]');
  return fmt.rkeyFn({ tipoMuestra: tm ? tm.value : "" });
}
function _micApply(inp, rkey){
  const pk = inp.dataset.param;
  const sub = inp.parentNode ? inp.parentNode.querySelector(".mic-sci") : null;
  const p = MIC_PARAMS[pk] || {};
  const raw = parseFloat(inp.value);
  if(inp.value.trim() === "" || !isFinite(raw)){ inp.className = "mic-in"; if(sub) sub.textContent = ""; return; }
  const r = micFactorOf(rkey, pk); const f = r.f || 1; const ufc = raw * f;
  if(sub) sub.textContent = micToSci(ufc);
  // Colorea si hay umbral definido (micLvl → null sin umbral). Vale también para
  // los antes "noRange" cuando el usuario fija umbrales en Factores.
  const lvl = micLvl(ufc, r);
  inp.className = "mic-in" + (lvl ? " mic-" + lvl : "");
}
function _micRecalcVtot(tr, rkey){
  const vtotInp = tr.querySelector('input[data-param="vtot"]'); if(!vtotInp) return;
  const amarInp = tr.querySelector('input[data-param="vamar"]');
  const verdInp = tr.querySelector('input[data-param="vverd"]');
  const ar = amarInp ? parseFloat(amarInp.value) : NaN;
  const vr = verdInp ? parseFloat(verdInp.value) : NaN;
  const sub = vtotInp.parentNode ? vtotInp.parentNode.querySelector(".mic-sci") : null;
  if(!isFinite(ar) && !isFinite(vr)){ vtotInp.value = ""; vtotInp.className = "mic-in"; if(sub) sub.textContent = ""; return; }
  const a = isFinite(ar)?ar:0, b = isFinite(vr)?vr:0;
  const fa = micFactorOf(rkey,"vamar").f || 1, fb = micFactorOf(rkey,"vverd").f || 1;
  const ufc = a*fa + b*fb;
  vtotInp.value = a + b;
  if(sub) sub.textContent = micToSci(ufc);
  const r = micFactorOf(rkey,"vtot"); const lvl = micLvl(ufc, r);
  vtotInp.className = "mic-in" + (lvl ? " mic-" + lvl : "");
}
function micCalcCell(inp){
  const tr = inp.closest("tr"); if(!tr) return;
  const rkey = micRowRkey(tr, inp.dataset.fmt);
  _micApply(inp, rkey);
  _micRecalcVtot(tr, rkey);
  micDraftTouch();
}
function micRowRecalc(el){
  const tr = el.closest("tr"); if(!tr) return;
  // Usa el data-fmt del propio elemento; si no lo tuviera, cae al primer
  // [data-fmt] de la fila. (Antes: `a || b ? c : d` tenía la precedencia rota
  // —`(a||b) ? c : d`— por lo que descartaba el valor de el.dataset.fmt y SIEMPRE
  // reconsultaba el DOM, funcionando solo por la estructura de la grilla; además
  // podía lanzar si el querySelector no encontraba nodo.)
  const _df = tr.querySelector("[data-fmt]");
  const fmtKey = el.dataset.fmt || (_df ? _df.dataset.fmt : null);
  const rkey = micRowRkey(tr, fmtKey);
  tr.querySelectorAll('input[data-param]').forEach(i=>{ if(i.dataset.param !== "vtot") _micApply(i, rkey); });
  _micRecalcVtot(tr, rkey);
  micDraftTouch();
}
function micRecalcSection(fmtKey){
  const tbody = document.getElementById("mic-tb-"+fmtKey); if(!tbody) return;
  tbody.querySelectorAll("tr").forEach(tr=>{
    const rkey = micRowRkey(tr, fmtKey);
    tr.querySelectorAll('input[data-param]').forEach(i=>{ if(i.dataset.param !== "vtot") _micApply(i, rkey); });
    _micRecalcVtot(tr, rkey);
  });
}

// ── Ocultar columnas + pegado por columnas visibles + navegación ──────
// Ocultar/mostrar columnas por formato (reversible, persistido).
const MIC_HIDCOLS_KEY = "larv4_mic_hidcols";
function loadMicHidden(fmtKey){
  try{ const o = JSON.parse(localStorage.getItem(MIC_HIDCOLS_KEY)||"{}"); return new Set(Array.isArray(o[fmtKey])?o[fmtKey]:[]); }catch(_){ return new Set(); }
}
function saveMicHidden(fmtKey, set){
  try{ const o = JSON.parse(localStorage.getItem(MIC_HIDCOLS_KEY)||"{}"); o[fmtKey] = Array.from(set); localStorage.setItem(MIC_HIDCOLS_KEY, JSON.stringify(o)); }catch(_){}
}
function micToggleCol(fmtKey, key){
  const hid = loadMicHidden(fmtKey);
  if(hid.has(key)) hid.delete(key); else hid.add(key);
  saveMicHidden(fmtKey, hid);
  const draft = collectMicDraft(); saveMicDraft(draft);   // no perder lo escrito
  renderMicNuevo();
}
// Celdas editables/auto VISIBLES de una fila, en orden de columna (salta ocultas).
function _micVisRow(tr){
  return Array.from(tr.children)
    .filter(td => td.style.display !== "none")
    .map(td => td.querySelector("input.mic-in, select.mic-in"))
    .filter(Boolean);
}
// Pegado desde Excel mapeado sobre columnas VISIBLES (respeta columnas ocultas).
function micGridPaste(ev, fmtKey){
  const cd = ev.clipboardData || window.clipboardData; if(!cd) return;
  const txt = cd.getData("text"); if(!txt || (txt.indexOf("\t") === -1 && txt.indexOf("\n") === -1)) return;
  ev.preventDefault();
  const lines = txt.replace(/\r/g,"").split("\n"); if(lines.length && lines[lines.length-1] === "") lines.pop();
  const matrix = lines.map(l=>l.split("\t"));
  const t = ev.target; const tbody = t.closest("tbody"); if(!tbody) return;
  const trs = Array.from(tbody.querySelectorAll("tr"));
  const startTr = t.closest("tr"); const r0 = trs.indexOf(startTr); if(r0 < 0) return;
  const c0 = _micVisRow(startTr).indexOf(t); if(c0 < 0) return;
  matrix.forEach((cells, dr)=>{
    const tr = trs[r0+dr]; if(!tr) return;
    const vis = _micVisRow(tr);
    cells.forEach((raw, dc)=>{
      const el = vis[c0+dc]; if(!el || el.readOnly) return;       // salta V.Totales (auto)
      const val = String(raw).trim();
      if(el.tagName === "SELECT"){ const opt = Array.from(el.options).find(o=> o.value.toLowerCase() === val.toLowerCase() || o.text.toLowerCase() === val.toLowerCase()); if(opt) el.value = opt.value; }
      else el.value = val;
    });
  });
  micRecalcSection(fmtKey);
  micDraftTouch();
}
// Navegación tipo Excel (↑↓←→ + Enter) entre columnas VISIBLES de las grillas Mic.
function micGridKey(ev){
  const k = ev.key;
  if(k!=="ArrowUp" && k!=="ArrowDown" && k!=="ArrowLeft" && k!=="ArrowRight" && k!=="Enter") return;
  const t = ev.target;
  if(!t || (t.tagName!=="INPUT" && t.tagName!=="SELECT") || !t.classList || !t.classList.contains("mic-in")) return;
  const tbody = t.closest("tbody"); if(!tbody || String(tbody.id).indexOf("mic-tb-") !== 0) return;
  if((k==="ArrowLeft" || k==="ArrowRight") && t.tagName==="INPUT" && t.type!=="number"){
    try{ const len=(t.value||"").length;
      if(k==="ArrowLeft"  && !(t.selectionStart===0   && t.selectionEnd===0))   return;
      if(k==="ArrowRight" && !(t.selectionStart===len && t.selectionEnd===len)) return;
    }catch(_){}
  }
  const trs = Array.from(tbody.querySelectorAll("tr"));
  const tr = t.closest("tr"); const r = trs.indexOf(tr);
  const vis = _micVisRow(tr); const c = vis.indexOf(t);
  if(r < 0 || c < 0) return;
  const focusCell = (el)=>{ if(el && typeof el.focus==="function"){ el.focus(); if(el.tagName==="INPUT"){ try{ el.select(); }catch(_){} } } };
  if(k==="ArrowUp" || k==="ArrowDown" || k==="Enter"){
    ev.preventDefault();
    const ntr = trs[r + (k==="ArrowUp"?-1:1)]; if(!ntr) return;
    const nvis = _micVisRow(ntr);
    focusCell(nvis[Math.min(c, nvis.length-1)]);
    return;
  }
  // horizontal: salta columnas ocultas (ya excluidas de vis) y readonly (auto)
  let nc = c + (k==="ArrowLeft" ? -1 : 1);
  while(nc >= 0 && nc < vis.length && vis[nc] && vis[nc].readOnly) nc += (k==="ArrowLeft" ? -1 : 1);
  if(nc < 0 || nc >= vis.length) return;
  ev.preventDefault();
  focusCell(vis[nc]);
}
if(typeof document !== "undefined" && !window.__micKeyNav){
  window.__micKeyNav = true;
  document.addEventListener("keydown", micGridKey);
}

// ── Render: Nuevo análisis ─────────────────────────────
function micRowHtml(fmt, fmtKey, fila, d, hid, hdrDef){
  hid = hid || new Set();
  const cols = [...fmt.ctx.map(c=>({ kind:"ctx", c })), ...fmt.params.map(pk=>({ kind:"param", pk }))];
  let cells = "";
  cols.forEach((col, ci)=>{
    const ckey = col.kind === "ctx" ? col.c.k : col.pk;
    const tdAttr = `data-colkey="${ckey}"${hid.has(ckey) ? ' style="display:none"' : ''}`;
    const pos = `data-r="${fila-1}" data-c="${ci}"`;
    if(col.kind === "ctx"){
      // Item 3/4: valor = guardado > default de cabecera (Módulo/Estadío) > def fijo del formato.
      const c = col.c; const base = `mic_${fmtKey}_${fila}_${c.k}`; const val = d[c.k] || (hdrDef && hdrDef[c.k]) || c.def || "";
      const recalc = c.recalc ? `onchange="micRowRecalc(this)"` : `oninput="micDraftTouch()"`;
      if(c.type === "sel"){
        cells += `<td ${tdAttr}><select class="mic-in" name="${base}" data-fmt="${fmtKey}" ${pos} onpaste="micGridPaste(event,'${fmtKey}')" ${recalc} style="min-width:${c.w||60}px">`
          + c.opts.map(o=>`<option value="${escapeHtml(o)}"${val===o?" selected":""}>${escapeHtml(o)||"—"}</option>`).join("")
          + `</select></td>`;
      } else {
        cells += `<td ${tdAttr}><input class="mic-in" type="text" name="${base}" data-fmt="${fmtKey}" ${pos} onpaste="micGridPaste(event,'${fmtKey}')" oninput="micDraftTouch()" value="${escapeHtml(val)}" style="min-width:${c.w||56}px"></td>`;
      }
    } else {
      const pk = col.pk; const p = MIC_PARAMS[pk]; const base = `mic_${fmtKey}_${fila}_${pk}`; const val = d[pk] || "";
      if(pk === "vtot"){
        cells += `<td ${tdAttr}><input class="mic-in" type="text" name="${base}" data-fmt="${fmtKey}" data-param="vtot" ${pos} readonly value="${escapeHtml(val)}" title="C. Totales = C. Amarillas + C. Verdes (auto)" style="min-width:62px;background:#f1f5f9;color:#334155;font-weight:700"><div class="mic-sci" data-sci="${base}"></div></td>`;
      } else if(p.pa){
        cells += `<td ${tdAttr}><select class="mic-in" name="${base}" data-fmt="${fmtKey}" data-param="${pk}" ${pos} onpaste="micGridPaste(event,'${fmtKey}')" oninput="micDraftTouch()" style="min-width:90px">`
          + MIC_PA_OPTS.map(o=>`<option value="${escapeHtml(o)}"${val===o?" selected":""}>${escapeHtml(o)||"—"}</option>`).join("")
          + `</select></td>`;
      } else {
        cells += `<td ${tdAttr}><input class="mic-in" type="text" inputmode="decimal" name="${base}" data-fmt="${fmtKey}" data-param="${pk}" ${pos} oninput="micCalcCell(this)" onpaste="micGridPaste(event,'${fmtKey}')" value="${escapeHtml(val)}" style="min-width:58px"><div class="mic-sci" data-sci="${base}"></div></td>`;
      }
    }
  });
  return `<tr><td class="tqc" style="font-size:10px;min-width:30px;text-align:center">${fila}</td>${cells}</tr>`;
}
function micSectionHtml(fmtKey, draft){
  const fmt = MIC_FORMATS[fmtKey];
  const sec = (draft.sections && draft.sections[fmtKey]) || { rows:[], obs:"" };
  const drows = sec.rows || [];
  const extra = _micExtra[fmtKey] || 0;
  const nRows = Math.min(MIC_MAX_ROWS, Math.max(MIC_DEFAULT_ROWS + extra, drows.length));
  const hid = loadMicHidden(fmtKey);
  const allCols = [...fmt.ctx.map(c=>({k:c.k,l:c.l})), ...fmt.params.map(pk=>({k:pk,l:MIC_PARAMS[pk].l}))];
  const chips = allCols.map(co=> `<span class="mic-colchip${hid.has(co.k)?' off':''}" onclick="micToggleCol('${fmtKey}','${co.k}')" title="Clic para ocultar/mostrar esta columna en el registro">${escapeHtml(co.l)}</span>`).join("");
  const thFor = (key,l)=> `<th data-colkey="${key}"${hid.has(key)?' style="display:none"':''}>${escapeHtml(l)}</th>`;
  const ths = [...fmt.ctx.map(c=>thFor(c.k,c.l)), ...fmt.params.map(pk=>thFor(pk,MIC_PARAMS[pk].l))].join("");
  const hdrDef = { modulo: (draft.meta && draft.meta.hdrModulo) || "", estadio: (draft.meta && draft.meta.hdrEstadio) || "" };
  let rowsHtml = "";
  for(let fila=1; fila<=nRows; fila++){ rowsHtml += micRowHtml(fmt, fmtKey, fila, drows[fila-1] || {}, hid, hdrDef); }
  const canAdd = nRows < MIC_MAX_ROWS;
  return `<div class="fc" style="margin-bottom:10px">
    <div class="fc-h" style="background:linear-gradient(135deg,#0e7490,#0891b2)">
      <div class="fc-t">${escapeHtml(fmt.label)}</div>
      <div class="sa-btns">
        <button class="btn bo" type="button" onclick="micAddRow('${fmtKey}')" ${canAdd?"":"disabled"} style="font-size:11px;padding:4px 10px">➕ Fila</button>
      </div>
    </div>
    <div class="fc-b" id="mic-body-${fmtKey}">
      <div style="font-size:9.5px;color:var(--tx3);margin-bottom:3px">🧩 Columnas (clic para ocultar/mostrar; reversible):</div>
      <div style="margin-bottom:8px">${chips}</div>
      <div class="tw"><table class="ft" style="font-size:10.5px"><thead><tr><th class="tqh" style="min-width:30px">#</th>${ths}</tr></thead><tbody id="mic-tb-${fmtKey}">${rowsHtml}</tbody></table></div>
      <div class="ff" style="margin-top:8px"><label>Observaciones — ${escapeHtml(fmt.label)}</label>
        <textarea id="mic-obs-${fmtKey}" placeholder="Observaciones (opcional)…" oninput="micDraftTouch()" style="width:100%;min-height:44px">${escapeHtml(sec.obs||"")}</textarea></div>
    </div>
  </div>`;
}
function renderMicNuevo(){
  const fp = document.getElementById("fp-micnuevo"); if(!fp) return;
  const draft = loadMicDraft(); const meta = draft.meta;
  let activeFmt = draft.activeFmt || "larv-muestra";
  if(!MIC_FORMATS[activeFmt]) activeFmt = "larv-muestra";
  const groups = {};
  MIC_FORMAT_KEYS.forEach(k=>{ const dep = MIC_FORMATS[k].depto; (groups[dep] = groups[dep] || []).push(k); });
  const fmtOpts = Object.keys(groups).map(dep=>
    `<optgroup label="${escapeHtml(dep)}">` +
    groups[dep].map(k=>`<option value="${k}"${k===activeFmt?" selected":""}>${escapeHtml(MIC_FORMATS[k].label)}</option>`).join("") +
    `</optgroup>`).join("");
  const sections = micSectionHtml(activeFmt, draft);
  // Item 3: campos de cabecera Módulo/Estadío (solo si el formato activo tiene esa columna).
  const _afMic = MIC_FORMATS[activeFmt];
  const _optSel = (arr,cur)=> arr.map(o=>`<option value="${escapeHtml(o)}"${o===cur?" selected":""}>${escapeHtml(o)||"—"}</option>`).join("");
  const micHdrMod = _afMic.ctx.some(c=>c.k==="modulo")
    ? `<div class="mf"><label>Módulo (todas)</label><select id="mic-hdr-modulo" onchange="micHdrFill('modulo',this.value)" title="Aplica este Módulo a TODAS las filas; luego edita las distintas">${_optSel(MIC_MODULOS, meta.hdrModulo||"")}</select></div>` : "";
  const micHdrEst = _afMic.ctx.some(c=>c.k==="estadio")
    ? `<div class="mf"><label>Estadío (todas)</label><select id="mic-hdr-estadio" onchange="micHdrFill('estadio',this.value)" title="Aplica este Estadío a TODAS las filas; luego edita las distintas">${_optSel(MIC_ESTADIOS, meta.hdrEstadio||"")}</select></div>` : "";
  const micRec = loadMicRecovery();
  const micRecBtn = micRec
    ? `<button class="btn brec" type="button" onclick="recoverMicGrid()" title="Recuperar autoguardado de ${escapeHtml(new Date(micRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))}">↩ Recuperar (${escapeHtml(new Date(micRec.ts).toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit"}))})</button>`
    : `<button class="btn brec" type="button" disabled style="opacity:.35;cursor:not-allowed" title="No hay autoguardado reciente">↩ Recuperar</button>`;
  fp.innerHTML = `${micTypeBar()}<div class="fc">
    <div class="fc-h"><div class="fc-t">🧫 Microbiología · Nuevo análisis (Bacteriología)</div>
      <span class="ssp ssp-mt">${escapeHtml(meta.fechaMuestreo||today())}</span></div>
    <div class="fc-b">
      <div class="meta">
        <div class="mf"><label>Fecha muestreo</label><input type="date" id="mic-fm" value="${escapeHtml(meta.fechaMuestreo||today())}" oninput="micDraftTouch()"></div>
        <div class="mf"><label>Fecha resultados</label><input type="date" id="mic-fr" value="${escapeHtml(meta.fechaResultados||"")}" oninput="micDraftTouch()"></div>
        <div class="mf"><label>N° Corrida</label><input id="mic-corr" value="${escapeHtml(meta.corrida||"")}" placeholder="Ej. 562" oninput="micDraftTouch()" onchange="micCorridaChange()"></div>
        <div class="mf"><label>Responsable</label><input id="mic-resp" value="${escapeHtml(meta.responsable||"")}" placeholder="Analista" oninput="micDraftTouch()"></div>
        <div class="mf"><label>Formato</label><select id="mic-fmt-sel" onchange="micFmtChange(this.value)" style="font-weight:600">${fmtOpts}</select></div>
        ${micHdrMod}${micHdrEst}
      </div>
      <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:11px;color:#075985;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">🧫</span>
        <span>Teclea el <b>conteo natural</b>; el sistema calcula el <b>UFC/mL = conteo × factor</b> en notación científica y colorea el nivel. V.Totales se suma solo. Puedes pegar desde Excel. Guarda antes de cambiar de pestaña.</span>
      </div>
      ${sections}
      <div class="sa" style="margin-top:12px">
        <div class="sa-info">
          <span>💾 Guarda para registrar el análisis (sin duplicados al reenviar)</span>
          <span id="mic-saved-ind" style="font-weight:600">${_micLastSavedText(meta)}</span>
        </div>
        <div class="sa-btns">
          <button class="btn bo" type="button" onclick="micNuevoReset()" title="Vaciar el análisis actual">🧹 Vaciar</button>
          ${micRecBtn}
          <button class="btn bs" type="button" onclick="micGuardarLocal()">💾 Guardar local</button>
          <button class="btn bp" type="button" onclick="syncMic()">☁️ Guardar y sincronizar</button>
        </div>
      </div>
    </div>
  </div>`;
  micRecalcSection(activeFmt);
  fixupLabels(fp);
}
// Texto de referencia del último guardado local del análisis activo (Mic).
// Derivado de los registros guardados (sobrevive a re-render y recarga).
function _micLastSavedText(meta){
  const recs = _micRaw().filter(r => r.data && r.data.fechaMuestreo === meta.fechaMuestreo &&
    (!meta.corrida || String(r.data.corrida) === String(meta.corrida)));
  if(!recs.length) return "○ Sin guardar localmente";
  const maxTs = Math.max.apply(null, recs.map(r => r.ts || 0));
  const allSynced = recs.every(r => r.synced);
  return (allSynced ? "✅ Sincronizado · " : "⏳ Guardado local · ") + new Date(maxTs).toLocaleString("es-EC");
}
/* ── Item 3: relleno masivo de columna por cabecera (Módulo/Estadío) ──────
   Pone <val> en la columna <key> de TODAS las filas del formato activo y
   persiste el borrador (incluido el valor de cabecera en meta, para que las
   filas nuevas hereden el default). prefix = "mic" (Bacteriología) | "cal". */
function _gridHdrFill(prefix, key, val){
  const selFmt = document.getElementById(prefix+"-fmt-sel");
  const fmtKey = selFmt ? selFmt.value : "";
  if(fmtKey){
    const tb = document.getElementById(prefix+"-tb-"+fmtKey);
    if(tb){
      const pre = prefix+"_"+fmtKey+"_";
      tb.querySelectorAll('select[name$="_'+key+'"]').forEach(sel=>{
        if(sel.name.indexOf(pre) === 0) sel.value = val;   // solo celdas ctx de este formato
      });
    }
  }
  if(prefix === "mic") saveMicDraft(collectMicDraft());
  else                 saveCalDraft(collectCalDraft());
}
function micHdrFill(key, val){ _gridHdrFill("mic", key, val); }
function calHdrFill(key, val){ _gridHdrFill("cal", key, val); }

// Cambia el formato visible sin perder lo escrito (lo persiste en el borrador).
function micFmtChange(val){
  const draft = collectMicDraft();
  draft.activeFmt = val;
  saveMicDraft(draft);
  renderMicNuevo();
}
function micAddRow(fmtKey){
  const draft = collectMicDraft(); saveMicDraft(draft);
  const drows = (draft.sections[fmtKey] && draft.sections[fmtKey].rows) ? draft.sections[fmtKey].rows.length : 0;
  const cur = Math.max(MIC_DEFAULT_ROWS + (_micExtra[fmtKey]||0), drows);
  if(cur >= MIC_MAX_ROWS){ toast("Máximo "+MIC_MAX_ROWS+" filas","info",2500); return; }
  _micExtra[fmtKey] = Math.min(MIC_MAX_ROWS - MIC_DEFAULT_ROWS, (cur - MIC_DEFAULT_ROWS) + MIC_ROW_STEP);
  renderMicNuevo();
}
function micNuevoReset(){
  if(!confirm("¿Vaciar el análisis actual? Se perderá lo no guardado.")) return;
  // Sid nuevo → lo siguiente que captures será una sesión SEPARADA en el historial
  // (no reemplaza al análisis anterior aunque coincidan día/corrida/formato).
  saveMicDraft({ meta:{ fechaMuestreo:today(), fechaResultados:"", corrida:"", responsable:"", sid:_micNewSid() }, sections:{} });
  _micExtra = {}; renderMicNuevo(); toast("🧹 Análisis en blanco","info",1800);
}

// ── Recuperación del Nuevo análisis (autoguardado, TTL 1h) ─────────────
//   Espejo del recovery de Biomol: cada 60s (startAutoRecovery) se respalda el
//   borrador tecleado en Bacteriología; ↩ Recuperar lo restaura si se perdió por
//   no guardar. Vive bajo RPRE → cleanup() lo purga a la hora (RTTL).
function saveMicRecovery(){
  if(!isMicMod(curMod)) return;
  if(curTab !== "micnuevo" || micTypeGet() !== "bact") return;   // solo el Nuevo análisis de Bacteriología
  let draft; try{ draft = collectMicDraft(); }catch(_){ return; }
  const hasData = MIC_FORMAT_KEYS.some(fmtKey=>{
    const sec = draft.sections && draft.sections[fmtKey];
    return sec && (sec.rows||[]).some(d=> micRowHasData(MIC_FORMATS[fmtKey], d));
  });
  if(!hasData) return;                          // nada que respaldar
  _lsSet(MIC_RECOV_KEY, JSON.stringify({ ts: Date.now(), draft }));
}
function loadMicRecovery(){
  try{
    const raw = localStorage.getItem(MIC_RECOV_KEY); if(!raw) return null;
    const e = JSON.parse(raw);
    if(!e || !e.draft || !e.ts) return null;
    if(Date.now() - e.ts > RTTL){ localStorage.removeItem(MIC_RECOV_KEY); return null; }
    return e;
  }catch(_){ return null; }
}
function recoverMicGrid(){
  const rec = loadMicRecovery();
  if(!rec){ toast("No hay datos de recuperación disponibles","warn"); return; }
  const ts = new Date(rec.ts).toLocaleString("es-EC");
  if(!confirm("¿Recuperar el análisis autoguardado el "+ts+"?\nSe reemplazará lo que tengas ahora en Nuevo análisis (Bacteriología).")) return;
  saveMicDraft(rec.draft); _micExtra = {};
  try{ localStorage.removeItem(MIC_RECOV_KEY); }catch(_){}
  renderMicNuevo();
  toast("✅ Análisis recuperado del autoguardado","ok",4000);
}

// ── Guardar / Sincronizar ──────────────────────────────
// Devuelve -1 (validación falló), 0 (sin filas con datos) o N (guardadas).
function saveMicLocal(){
  const draft = collectMicDraft(); saveMicDraft(draft);
  if(!isValidDate(draft.meta.fechaMuestreo)){ toast("⚠️ Ingresa una Fecha de muestreo válida","warn",3500); return -1; }
  // Corrida requerida SOLO si el formato ACTIVO es de Larvicultura · Muestra y
  // tiene datos (Maduración y Otras no usan corrida). Como solo se guarda el
  // formato activo, la validación también mira solo ese formato.
  const needsCorrida = (()=>{
    const fmtKey = draft.activeFmt;
    if(!MIC_CORRIDA_REQ.has(fmtKey)) return false;
    const sec = draft.sections[fmtKey]; if(!sec) return false;
    return (sec.rows||[]).some(d=> micRowHasData(MIC_FORMATS[fmtKey], d));
  })();
  if(needsCorrida && !draft.meta.corrida){ toast("⚠️ Ingresa el N° de corrida (requerido en Larvicultura · Muestra)","warn",3800); return -1; }
  // Identidad de sesión: cada "Nuevo análisis" tiene un sid estable. Así dos
  // análisis del mismo día/corrida/formato NO se pisan: cada uno es su propia
  // sesión (historial y hoja). Re-guardar el MISMO borrador (mismo sid) o editar
  // una sesión desde el historial SÍ la reemplaza (sin duplicar). sid === ""
  // marca una sesión HEREDADA (registros antiguos): conserva su clave compuesta.
  if(draft.meta.sid === undefined){ draft.meta.sid = _micNewSid(); }
  saveMicDraft(draft);
  const sid = draft.meta.sid;
  // Guarda SOLO el formato ACTIVO (el que está en pantalla). Cada formato es un
  // registro independiente —como cada ficha en Larvicultura—: cambiar de formato y
  // guardar NO regenera ni re-marca como pendiente los formatos ya guardados, así
  // que no reaparecen/duplican en el historial ni se vuelven a sincronizar.
  const actFmt = draft.activeFmt;
  const fmt = MIC_FORMATS[actFmt];
  const newRecords = [];
  if(fmt){
    const sec = draft.sections[actFmt] || { rows:[], obs:"" };
    const dataRows = (sec.rows||[]).filter(d=> micRowHasData(fmt, d));
    dataRows.forEach((d, i)=>{
      const data = Object.assign({
        fechaMuestreo:   draft.meta.fechaMuestreo,
        fechaResultados: draft.meta.fechaResultados,
        corrida:         draft.meta.corrida,
        responsable:     draft.meta.responsable,
        departamento:    fmt.depto,
        formato:         actFmt,
        fila:            i + 1,
        obs:             sec.obs || ""
      }, d);
      if(!data.corrida) data.corrida = draft.meta.corrida;   // formato sin corrida por fila → usa la del análisis
      data.sid = sid;                                        // sesión a la que pertenece ("" = heredada)
      newRecords.push({ id: Date.now().toString(36)+Math.random().toString(36).slice(2,6), ts: Date.now(), synced:false, syncedAt:null, data });
    });
  }
  let list = _micRaw();
  // Reemplazo ESPEJO de la hoja (replaceByKeyRows) SOLO para la(s) clave(s) del
  // formato activo: quita los registros cuya clave de sesión coincida con la de
  // algún registro nuevo y re-añade los nuevos. Otros formatos/fechas/corridas
  // quedan INTACTOS (conservan su estado synced). Editar una sesión (misma clave)
  // la actualiza; para registrar otro análisis igual usa 🧹 (rota el sid).
  const newKeys = new Set(newRecords.map(r=> micSessionKey(r.data)));
  list = list.filter(r=> !(r.data && newKeys.has(micSessionKey(r.data))));
  list = list.concat(newRecords);
  const saved = newRecords.length;
  const _ok = _micSave(list);
  updateDots(); updateSyncUI(); buildGrid();
  if(!_ok) return -2;                  // almacenamiento lleno: NO mentir "guardado"
  return saved;
}
function micGuardarLocal(){
  const n = saveMicLocal();
  if(n === -2) return;                  // _micSave ya avisó del fallo de almacenamiento
  if(n === 0){ toast("No hay muestras con datos para guardar","warn",3000); return; }
  if(n > 0){
    toast("💾 "+n+" muestra(s) guardada(s) en el historial","ok",2800);
    const ind = document.getElementById("mic-saved-ind");
    if(ind) ind.textContent = "⏳ Guardado local · "+new Date().toLocaleString("es-EC");
  }
}
async function syncMic(){
  const n = saveMicLocal();
  if(n < 0) return;                    // validación (-1) o almacenamiento lleno (-2): ya avisó
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL inválida","err"); return; }
  if(!syncRateOk()) return;
  const list = _micRaw();
  const pendKeys = new Set();
  list.forEach(r=>{ if(!r.synced && r.data) pendKeys.add(micSessionKey(r.data)); });
  if(pendKeys.size === 0){ toast("No hay muestras pendientes","info",2500); return; }
  // Envía TODAS las filas de cada sesión con pendientes (la hoja reemplaza la sesión completa).
  const toSend = list.filter(r=> r.data && pendKeys.has(micSessionKey(r.data)));
  const payload = buildMicPayload(toSend);
  if(!payload.rows.length){ toast("No hay filas para enviar","warn",3000); return; }
  setSyncUI("pend","Enviando "+payload.rows.length+" muestra(s)…");
  const sent = await postPayload(payload, url);
  if(sent){
    const l2 = _micRaw();
    l2.forEach(r=>{ if(r.data && pendKeys.has(micSessionKey(r.data))){ r.synced = true; r.syncedAt = Date.now(); } });
    _micSave(l2);
    setSyncUI("ok", payload.rows.length+" muestra(s) sincronizada(s) ✔");
    toast("✅ "+payload.rows.length+" muestra(s) enviadas a Microbiología (sesión reemplazada)","ok",4500);
    const ind = document.getElementById("mic-saved-ind");
    if(ind) ind.textContent = "✅ Sincronizado · "+new Date().toLocaleString("es-EC");
    setTimeout(()=> setSyncUI("idle","Todo sincronizado"), 3500);
  } else {
    setSyncUI("err","Error al sincronizar Microbiología");
    toast("No fue posible sincronizar con Google Sheets","err",4500);
  }
  updateDots(); updateSyncUI(); buildGrid();
  if(curTab === "michist" && micTypeGet() === "bact") renderMicHist();
}

// ── Payload (hoja ancha) ───────────────────────────────
const MIC_LEVEL_PARAMS = ["vamar","vverd","vtot","valg","vpara","vvuln","pseudo","aero","btot","bnar","hongos"];
const MIC_SHEET_HEADERS = (function(){
  const h = ["Fecha muestreo","Fecha resultados","Corrida","Responsable","Departamento","Formato","Tipo de muestra","Módulo/Sala","Sexo","Estadío","TQ/N°"];
  MIC_LEVEL_PARAMS.forEach(pk=>{ const l = MIC_PARAMS[pk].l; h.push(l+" (crudo)", l+" UFC", l+" Nivel"); });
  h.push("V.Luminiscentes");
  h.push("Enterobact. (crudo)","Enterobact. UFC");
  h.push("Levaduras (crudo)","Levaduras UFC");
  h.push("Observaciones");
  // Fase 2 — contexto y parámetros nuevos (a la derecha de la hoja)
  h.push("Origen/Tipo","Etapa","Componente","Laboratorio","Raceways","Tanques","Tanque/Reservorio","Punto de muestreo");
  h.push("Pseudomonas GSP (crudo)","Pseudomonas GSP UFC","Pseudomonas GSP Nivel");
  h.push("Aeromonas GSP (crudo)","Aeromonas GSP UFC","Aeromonas GSP Nivel");
  // Fase 2.1 — contexto adicional
  h.push("Lugar","Variedad","Días","Especie","Siembra");
  // Fase 3 — Muestras (Ensayo) + Bacterias Rojas (RAS)
  h.push("Muestras");
  h.push("Bacterias Rojas (crudo)","Bacterias Rojas UFC");
  // Hisopados (despacho) — contexto Carro/Tina (Etapa y Módulo reusan columnas existentes)
  h.push("Carro","Tina");
  // Identidad de sesión: id único por "Nuevo análisis". Permite varios análisis
  // el mismo día/corrida/formato sin que uno reemplace al otro (forma parte de la
  // clave de upsert). Filas antiguas la tienen vacía → conservan su clave compuesta.
  h.push("Sesión");
  return h;
})();
const MIC_SID_COL = MIC_SHEET_HEADERS.indexOf("Sesión");
function buildMicPayload(records){
  const _n = (v)=> (v === 0 || v) ? v : "";
  const rows = records.map(rec=>{
    const d = rec.data || {}; const comp = micComputeRecord(rec);
    const _fmt = MIC_FORMATS[d.formato];
    const modSala = d.modulo || d.sala || "";
    const tipoM = d.tipoMuestra || (_fmt && _fmt.fixedTipo) || "";
    const row = [
      isValidDate(d.fechaMuestreo||"")   ? d.fechaMuestreo   : "",
      isValidDate(d.fechaResultados||"") ? d.fechaResultados : "",
      sanitizeStr(d.corrida||""), sanitizeStr(d.responsable||""),
      sanitizeStr(d.departamento||""), micFormatLabel(d.formato), sanitizeStr(tipoM),
      sanitizeStr(modSala), sanitizeStr(d.sexo||""), sanitizeStr(d.estadio||""), sanitizeStr(d.tq||"")
    ];
    MIC_LEVEL_PARAMS.forEach(pk=>{ const c = comp[pk]||{}; row.push(_n(c.crudo), _n(c.ufc), c.lvl ? MIC_LVL_TXT[c.lvl] : ""); });
    row.push((comp.vlum && comp.vlum.pa) || "");
    const en = comp.entero||{}, le = comp.levad||{};
    row.push(_n(en.crudo), _n(en.ufc));
    row.push(_n(le.crudo), _n(le.ufc));
    row.push(sanitizeStr(d.obs||""));
    // Fase 2 — contexto nuevo
    row.push(sanitizeStr(d.origen||""), sanitizeStr(d.etapa||""), sanitizeStr(d.componente||""),
             sanitizeStr(d.laboratorio||""), sanitizeStr(d.raceways||""), sanitizeStr(d.tanques||""),
             sanitizeStr(d.tanqueResv||""), sanitizeStr(d.punto||""));
    // Fase 2 — Pseudomonas/Aeromonas GSP
    const pg = comp.pseudoGsp||{}, ag = comp.aeroGsp||{};
    row.push(_n(pg.crudo), _n(pg.ufc), pg.lvl ? MIC_LVL_TXT[pg.lvl] : "");
    row.push(_n(ag.crudo), _n(ag.ufc), ag.lvl ? MIC_LVL_TXT[ag.lvl] : "");
    // Fase 2.1 — contexto adicional
    row.push(sanitizeStr(d.lugar||""), sanitizeStr(d.variedad||""), sanitizeStr(d.dias||""), sanitizeStr(d.especie||""), sanitizeStr(d.siembra||""));
    // Fase 3 — Muestras (Ensayo) + Bacterias Rojas (RAS)
    const br = comp.brojas||{};
    row.push(sanitizeStr(d.muestras||""));
    row.push(_n(br.crudo), _n(br.ufc));
    // Hisopados (despacho) — Carro / Tina
    row.push(sanitizeStr(d.carro||""), sanitizeStr(d.tina||""));
    // Identidad de sesión (última columna). "" en sesiones heredadas (sin sid).
    row.push(sanitizeStr(d.sid||""));
    return row;
  });
  return { sheetName: MIC_SHEET, headers: MIC_SHEET_HEADERS, rows, replaceKey:true, keyCols:[0,2,4,5,MIC_SID_COL] };
}

// ── Vista Historial ────────────────────────────────────
function renderMicHist(){
  const fp = document.getElementById("fp-michist"); if(!fp) return;
  const list = loadMic();
  const groups = {};
  list.forEach(r=>{ const k = micSessionKey(r.data); (groups[k] = groups[k] || []).push(r); });
  const keys = Object.keys(groups).sort((a,b)=>
    Math.max(...groups[b].map(r=>r.ts||0)) - Math.max(...groups[a].map(r=>r.ts||0)));
  if(keys.length === 0){
    fp.innerHTML = `${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">📜 Historial · Microbiología</div><span class="ssp ssp-mt">0 sesiones</span></div>
      <div class="fc-b"><div class="hist-empty"><span class="hist-empty-ico">📜</span>Aún no hay análisis guardados.<br><small style="opacity:.75;display:block;margin-top:6px">Guarda un análisis en <b>Nuevo análisis</b> para verlo aquí.</small></div></div></div>`;
    return;
  }
  const cards = keys.map(k=>{
    const rs = groups[k]; const d = rs[0].data; const pend = rs.some(r=>!r.synced);
    return `<div class="mad-item">
      <div class="mad-item-body">
        <div class="mad-item-title">
          <span><b>📅 ${escapeHtml(d.fechaMuestreo||"—")}</b></span>
          <span class="bit-tag mod">Corrida ${escapeHtml(String(d.corrida||"—"))}</span>
          <span class="bit-tag area">${escapeHtml(d.departamento||"")}</span>
          <span class="bit-tag sis">${escapeHtml(micFormatLabel(d.formato))}</span>
          ${pend ? '<span class="ssp ssp-pend">⏳ Pendiente</span>' : '<span class="ssp ssp-ok">✅ Sincronizado</span>'}
        </div>
        <div class="mad-item-meta">
          <span><b>Muestras:</b> ${rs.length}</span>
          ${d.responsable ? `<span><b>Responsable:</b> ${escapeHtml(d.responsable)}</span>` : ""}
          ${d.fechaResultados ? `<span><b>Resultados:</b> ${escapeHtml(d.fechaResultados)}</span>` : ""}
        </div>
      </div>
      <div class="mad-item-actions">
        <button class="alg-hist-edit" onclick="micEditSession('${escapeHtml(k)}')" title="Cargar en Nuevo análisis para editar">✏️</button>
        <button class="alg-hist-pdf" onclick="micSessionPDF('${escapeHtml(k)}')" title="Descargar PDF de esta sesión">📄</button>
        <button class="alg-hist-del" onclick="micDeleteSession('${escapeHtml(k)}')" title="Eliminar sesión del historial local (no afecta a Google Sheets)">🗑</button>
      </div>
    </div>`;
  }).join("");
  fp.innerHTML = `${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">📜 Historial · Microbiología</div><span class="ssp ssp-mt">${keys.length} sesión(es)</span></div>
    <div class="fc-b"><div class="mad-list">${cards}</div>
    <div style="margin-top:10px;font-size:10.5px;color:var(--tx3)">ℹ️ Solo se guarda/sincroniza el <b>formato que tienes en pantalla</b>: cada formato es un registro independiente. Cambia de formato y guarda y los anteriores no se tocan ni se reenvían. Para registrar <b>otro</b> análisis del mismo día/corrida/formato, usa <b>🧹 Análisis en blanco</b>. <b>✏️</b> edita una sesión (re-guardar la actualiza, no la duplica), <b>📄</b> descarga su PDF, <b>🗑</b> la elimina <b>solo del historial local</b> (no afecta lo ya enviado a Google Sheets). Las sesiones <b>sincronizadas</b> se conservan localmente <b>7 días</b> y luego se borran solas; las pendientes, hasta que las sincronices.</div></div></div>`;
}
function micEditSession(k){
  const list = loadMic(); const rs = list.filter(r=> micSessionKey(r.data) === k);
  if(!rs.length){ toast("Sesión no encontrada","warn"); return; }
  const d0 = rs[0].data; const fmtKey = d0.formato; const fmt = MIC_FORMATS[fmtKey];
  if(!fmt){ toast("Formato no soportado en esta versión","warn"); return; }
  const rows = rs.slice().sort((a,b)=>(parseInt(a.data.fila)||0)-(parseInt(b.data.fila)||0)).map(r=>{
    const d = r.data; const row = {};
    fmt.ctx.forEach(c=> row[c.k] = d[c.k] || "");
    fmt.params.forEach(pk=>{ if(pk !== "vtot") row[pk] = d[pk] || ""; });
    return row;
  });
  const draft = { meta:{ fechaMuestreo:d0.fechaMuestreo, fechaResultados:d0.fechaResultados||"", corrida:d0.corrida, responsable:d0.responsable||"" }, sections:{} };
  // Conserva la identidad de sesión para que re-guardar ACTUALICE esta sesión (la
  // clave compuesta+sid coincide → la reemplaza). Heredada (sin sid) → sid "".
  draft.meta.sid = d0.sid || "";
  draft.sections[fmtKey] = { rows, obs: d0.obs || "" };
  draft.activeFmt = fmtKey;
  saveMicDraft(draft); _micExtra = {};
  micTypeSet("bact"); selTab("micnuevo"); renderMicNuevo();
  toast("✏️ Sesión cargada en Nuevo análisis · edita y guarda/sincroniza para actualizar","ok",5000);
}
function micDeleteSession(k){
  // Borra SOLO del historial local (como Larvicultura). Lo ya enviado a Google
  // Sheets NO se toca: el historial local es un registro de trabajo independiente.
  const list = _micRaw(); const rs = list.filter(r=> micSessionKey(r.data) === k);
  if(!rs.length) return;
  if(!confirm("¿Eliminar esta sesión del historial local ("+rs.length+" muestra(s))?\nSolo se borra del sistema; lo ya enviado a Google Sheets NO se elimina.")) return;
  _micSave(list.filter(r=> micSessionKey(r.data) !== k));
  renderMicHist(); updateDots(); updateSyncUI(); buildGrid();
  toast("🗑 Sesión eliminada del historial local","ok",3000);
}

// ── Vista Factores ─────────────────────────────────────
function renderMicFactores(){
  const fp = document.getElementById("fp-micfact"); if(!fp) return;
  const F = loadMicFactors();
  const areaLabel = { "larv-animal":"Larvicultura · Animal", "larv-agua":"Larvicultura · Agua", "mad-reprod":"Maduración · Reproductores", "ambiental":"Ambiental / Hisopados / Algas swab (×1)", "artemia":"Artemia (×20)", "ras-agua":"Maduración · RAS (Agua)", "algas":"Algas Mensual / R (×1)", "mad-agua":"Maduración · Agua / Desinfección" };
  const blocks = Object.keys(MIC_DR_BASE).map(ak=>{
    const rows = Object.keys(MIC_DR_BASE[ak]).map(pk=>{
      const r = (F[ak] && F[ak][pk]) || {};
      const inp = (field, w)=> `<input type="number" class="pinp" value="${r[field]!=null?r[field]:""}" onchange="micFactorSet('${ak}','${pk}','${field}',this.value)" step="any" min="0" placeholder="—" style="width:${w}px">`;
      // TODOS los parámetros muestran Mínimo/Leve/Moderado editables (incluidos
      // Enterobact./Levaduras/Bact.Rojas, antes "sin umbrales"). Si se dejan
      // vacíos, ese parámetro no se clasifica por color (solo registra el UFC).
      return `<tr><td style="text-align:left;font-weight:600">${escapeHtml(MIC_PARAMS[pk]?MIC_PARAMS[pk].l:pk)}</td>
        <td>${inp("f",70)}</td>
        <td>${inp("l",84)}</td><td>${inp("m",84)}</td><td>${inp("e",84)}</td>
      </tr>`;
    }).join("");
    return `<div class="fc" style="margin-bottom:12px"><div class="fc-h"><div class="fc-t">${escapeHtml(areaLabel[ak]||ak)}</div></div>
      <div class="fc-b"><div class="tw"><table class="ft" style="font-size:11px"><thead><tr>
        <th style="text-align:left">Parámetro</th><th>Factor ×</th><th>Mínimo &lt;</th><th>Leve &lt;</th><th>Moderado &lt;</th>
      </tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
  }).join("");
  fp.innerHTML = `${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">✖️ Factores y umbrales</div>
      <div class="sa-btns">
        <button class="btn bo" type="button" onclick="micFactoresReset()">↺ Restaurar</button>
        <button class="btn bp" type="button" onclick="micFactoresGuardar()">💾 Guardar factores</button>
      </div></div>
    <div class="fc-b"><div style="font-size:10.5px;color:var(--tx3);margin-bottom:8px">El conteo se multiplica por el <b>Factor</b>; el <b>UFC/mL</b> resultante se clasifica con los umbrales (Elevado ≥ Moderado). <b>Enterobact., Levaduras y Bact.Rojas</b> también aceptan umbrales: déjalos vacíos si aún no los tienes (no se clasifican). Se guarda automáticamente en este dispositivo al editar; el botón <b>Guardar factores</b> confirma el guardado.</div>${blocks}</div></div>`;
}
function micFactorSet(ak, pk, field, val){
  const F = loadMicFactors(); F[ak] = F[ak] || {}; F[ak][pk] = F[ak][pk] || {};
  const n = parseFloat(val);
  if(val === "" || !isFinite(n)) delete F[ak][pk][field]; else F[ak][pk][field] = n;
  saveMicFactors(F);
  toast("Factor actualizado","ok",1400);
}
// Confirmación explícita de guardado (los cambios ya se persisten al editar
// vía micFactorSet; este botón re-persiste y avisa para tranquilidad del usuario).
function micFactoresGuardar(){
  try{ saveMicFactors(loadMicFactors()); }catch(_){}
  toast("✅ Factores y umbrales (Bacteriología) guardados","ok",2500);
}
function micFactoresReset(){
  if(!confirm("¿Restaurar los factores/umbrales predeterminados? Se perderán tus ajustes.")) return;
  try{ localStorage.removeItem(MIC_FACTORS_KEY); }catch(_){}
  renderMicFactores(); toast("Factores restaurados","ok",2500);
}

// ── Vista Reporte ──────────────────────────────────────
function _micReportBody(draft){
  let body = "";
  MIC_FORMAT_KEYS.forEach(fmtKey=>{
    const fmt = MIC_FORMATS[fmtKey];
    const sec = (draft.sections && draft.sections[fmtKey]) || { rows:[] };
    const rows = (sec.rows||[]).filter(d=> micRowHasData(fmt, d));
    if(!rows.length) return;
    const heads = [...fmt.ctx.map(c=>c.l), ...fmt.params.map(pk=>MIC_PARAMS[pk].l)];
    const trs = rows.map((d, i)=>{
      const comp = micComputeRecord({ data: Object.assign({ departamento:fmt.depto, formato:fmtKey }, d) });
      const tds = [...fmt.ctx.map(c=>`<td>${escapeHtml(d[c.k]||"—")}</td>`), ...fmt.params.map(pk=>{
        if(MIC_PARAMS[pk].pa) return `<td>${escapeHtml((comp[pk]&&comp[pk].pa)||"—")}</td>`;
        const c = comp[pk]||{}; const cls = c.lvl ? ("mic-"+c.lvl) : "";
        return `<td class="${cls}">${(c.ufc!=="" && c.ufc!=null) ? escapeHtml(micToSci(c.ufc)) : "—"}</td>`;
      })];
      return `<tr><td class="tqc">${i+1}</td>${tds.join("")}</tr>`;
    }).join("");
    body += `<div class="fc" style="margin-bottom:12px"><div class="fc-h"><div class="fc-t">${escapeHtml(fmt.label)}</div></div>
      <div class="fc-b"><div class="tw"><table class="ft" style="font-size:10.5px"><thead><tr><th class="tqh">#</th>${heads.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${trs}</tbody></table></div></div></div>`;
  });
  return body;
}
function renderMicReporte(){
  const fp = document.getElementById("fp-micrep"); if(!fp) return;
  const draft = loadMicDraft();
  const body = _micReportBody(draft) ||
    `<div class="hist-empty"><span class="hist-empty-ico">📊</span>Sin datos en el análisis actual. Llena el <b>Nuevo análisis</b> para ver el reporte.</div>`;
  fp.innerHTML = `${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">📊 Reporte · Microbiología</div>
      <div class="sa-btns"><button class="btn bpdf" type="button" onclick="downloadMicPDF()">📄 PDF</button></div></div>
    <div class="fc-b"><div style="font-size:10.5px;color:var(--tx3);margin-bottom:8px">Resultados en <b>UFC/mL</b> (notación científica) con nivel por color. Refleja el <b>Nuevo análisis</b> actual.</div>${_micLegendHtml()}${body}</div></div>`;
}
// Matriz de factores representativa del formato (si todas las filas comparten
// rkey, esa; si no, la del formato por defecto). Para el sub-encabezado de criterio.
function _micFmtRkey(fmt, rows){
  if(!rows.length) return fmt.rkeyFn({});
  const set = new Set(rows.map(d=> fmt.rkeyFn(d)));
  return set.size === 1 ? fmt.rkeyFn(rows[0]) : fmt.rkeyFn({});
}
// Texto de criterio por parámetro: "Mín/Leve/Mod" en notación científica
// (o "sin umbral" / "P/A"). El factor de multiplicación NO se muestra.
function _micCritText(rkey, pk){
  const p = MIC_PARAMS[pk] || {};
  if(p.pa) return "P/A";
  const r = micFactorOf(rkey, pk);
  if(p.noRange || r.l == null) return "sin umbral";
  return micToSci(r.l)+"/"+micToSci(r.m)+"/"+micToSci(r.e);
}
// Columnas a mostrar en el PDF: respeta columnas ocultas (chips) y descarta vacías.
function _micPdfCols(fmt, fmtKey, comps, rows){
  const hid = loadMicHidden(fmtKey); const cols = [];
  fmt.ctx.forEach(c=>{ if(hid.has(c.k)) return;
    if(rows.some(d=> d[c.k]!=null && String(d[c.k]).trim()!=="")) cols.push({ kind:"ctx", key:c.k, label:c.l }); });
  fmt.params.forEach(pk=>{ if(hid.has(pk)) return;
    const p = MIC_PARAMS[pk];
    const has = comps.some(comp=>{ const c = comp[pk]||{}; return p.pa ? (c.pa!=null && c.pa!=="") : (c.ufc!=="" && c.ufc!=null); });
    if(has) cols.push({ kind:"param", key:pk, label:p.l }); });
  return cols;
}
function downloadMicPDF(srcDraft){
  const draft = srcDraft || loadMicDraft(); const meta = draft.meta;
  const tsStr = new Date().toLocaleString("es-EC",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  const codigo = genCodigo("micnuevo", MIC_MOD, meta.fechaMuestreo||today());
  let body = "";
  MIC_FORMAT_KEYS.forEach(fmtKey=>{
    const fmt = MIC_FORMATS[fmtKey]; const sec = (draft.sections && draft.sections[fmtKey]) || { rows:[] };
    const rows = (sec.rows||[]).filter(d=> micRowHasData(fmt, d));
    if(!rows.length) return;
    const comps = rows.map(d=> micComputeRecord({ data: Object.assign({ departamento:fmt.depto, formato:fmtKey }, d) }));
    const vis = _micPdfCols(fmt, fmtKey, comps, rows);
    if(!vis.length) return;
    const rkey = _micFmtRkey(fmt, rows);
    const headH = vis.map(co=>`<th>${escapeHtml(co.label)}</th>`).join("");
    const critH = vis.map(co=> co.kind==="param" ? `<th class="pcrit">${escapeHtml(_micCritText(rkey, co.key))}</th>` : `<th class="pcrit"></th>`).join("");
    const trs = comps.map((comp, i)=>{
      const d = rows[i];
      const tds = vis.map(co=>{
        if(co.kind==="ctx") return `<td>${escapeHtml(d[co.key]||"—")}</td>`;
        const pk = co.key; const p = MIC_PARAMS[pk]; const c = comp[pk]||{};
        if(p.pa) return `<td>${escapeHtml(c.pa||"—")}</td>`;
        const _cls = c.lvl ? (' class="mic-'+c.lvl+'"') : '';
        return `<td${_cls}>${(c.ufc!=="" && c.ufc!=null) ? escapeHtml(micToSci(c.ufc)) : "—"}</td>`;
      }).join("");
      return `<tr><td class="tqc">${i+1}</td>${tds}</tr>`;
    }).join("");
    body += `<div class="ftitle">${escapeHtml(fmt.label)}</div><table><thead><tr><th>#</th>${headH}</tr><tr class="critline"><th></th>${critH}</tr></thead><tbody>${trs}</tbody></table>`;
    if(sec.obs) body += `<div class="obs-block"><div class="lbl">Observaciones</div><div class="txt">${escapeHtml(sec.obs)}</div></div>`;
  });
  if(!body){ toast("Sin datos para el PDF","warn"); return; }
  const fileName = "MICRO_" + (meta.fechaMuestreo||today()).replace(/-/g,"") + (meta.corrida ? "_"+sanitizeStr(meta.corrida) : "");
  const head = `<div class="ph"><div class="ph-brand"><div class="co">OMARSA · Microbiología</div><div class="su">Análisis microbiológico — UFC/mL (notación científica)</div></div>
    <div class="ph-center"><span class="doc-code">OMR-MIC</span></div>
    <div class="ph-right"><div class="mod">Mic</div><div class="mods">Microbiología</div></div></div>
    <div class="mgrid"><div class="mf"><label>Fecha muestreo</label><span>${escapeHtml(meta.fechaMuestreo||today())}</span></div>
      <div class="mf"><label>Fecha resultados</label><span>${escapeHtml(meta.fechaResultados||"—")}</span></div>
      <div class="mf"><label>Corrida</label><span>${escapeHtml(String(meta.corrida||"—"))}</span></div>
      <div class="mf"><label>Responsable</label><span>${escapeHtml(meta.responsable||"—")}</span></div></div>`;
  const foot = `<div class="pfoot"><div><div style="font-size:6pt;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Código verificador</div>
      <div class="code-box">${codigo}</div><div class="ts-txt" style="margin-top:2px">Generado el ${escapeHtml(tsStr)}</div></div>
    <div style="text-align:center;min-width:140px"><div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">${escapeHtml(meta.responsable||"Responsable")}</div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Analista</div></div></div>`;
  const page = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${escapeHtml(fileName)}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"><style>${pdfCss('params')}${MIC_PDF_CSS}</style></head><body>
    <div class="ppage">${head}${MIC_PDF_LEGEND}${body}<div class="spacer"></div>${foot}</div>
    <script>try{document.title=${JSON.stringify(fileName)};}catch(_){}var _p=false;function dp(){if(_p)return;_p=true;setTimeout(function(){window.print();},350);}if(document.readyState==='complete')dp();else window.addEventListener('load',dp,{once:true});<\/script></body></html>`;
  const w = window.open("","_blank","width=1100,height=720");
  if(!w){ toast("El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.","warn",6000); return; }
  w.document.write(page); w.document.close(); try{ w.document.title = fileName; }catch(_){}
  toast("📄 PDF: " + fileName, "ok", 5000);
}
// PDF de UNA sesión del historial: reconstruye un borrador con esa sesión y
// reutiliza downloadMicPDF (mismo formato/colores/leyenda que el del Nuevo análisis).
function micSessionPDF(k){
  const list = loadMic(); const rs = list.filter(r=> micSessionKey(r.data) === k);
  if(!rs.length){ toast("Sesión no encontrada","warn"); return; }
  const d0 = rs[0].data; const fmtKey = d0.formato; const fmt = MIC_FORMATS[fmtKey];
  if(!fmt){ toast("Formato no soportado en esta versión","warn"); return; }
  const rows = rs.slice().sort((a,b)=>(parseInt(a.data.fila)||0)-(parseInt(b.data.fila)||0)).map(r=>{
    const d = r.data; const row = {};
    fmt.ctx.forEach(c=> row[c.k] = d[c.k] || "");
    fmt.params.forEach(pk=>{ if(pk !== "vtot") row[pk] = d[pk] || ""; });
    return row;
  });
  const draft = { meta:{ fechaMuestreo:d0.fechaMuestreo, fechaResultados:d0.fechaResultados||"", corrida:d0.corrida, responsable:d0.responsable||"" }, sections:{} };
  draft.sections[fmtKey] = { rows, obs: d0.obs || "" };
  downloadMicPDF(draft);
}


/* ════════════════════════════════════════════════════════
   CALIDAD DE AGUA (físico-química) — subsistema dentro del módulo
   Microbiología (toggle 🧫 Bacteriología | 💧 Calidad de Agua).
   Funciona como Bacteriología pero clasifica por RANGO (dentro/fuera),
   no por factor/UFC. Hoja propia "Calidad de Agua".
════════════════════════════════════════════════════════ */
const CAL_REC_KEY    = "larv4_cal_records";
const CAL_DRAFT_KEY  = "larv4_cal_draft";
const CAL_RANGES_KEY = "larv4_cal_ranges";
const CAL_HIDCOLS_KEY= "larv4_cal_hidcols";
const CAL_TYPE_KEY   = "larv4_mic_type";
const CAL_SHEET      = "Calidad de Agua";
const CAL_DEFAULT_ROWS = 8, CAL_ROW_STEP = 4, CAL_MAX_ROWS = 50;
let _calExtra = {};
let _calDraftTm = null;

// Parámetros físico-químicos (label).
const CAL_PARAMS = {
  sal:{l:"S‰"}, ph:{l:"pH"}, alc:{l:"Alcalinidad"}, temp:{l:"Temperatura"},
  nitrito:{l:"Nitrito"}, tan:{l:"TAN"}, amtox:{l:"Am.Tóxico"}, nitrato:{l:"Nitrato"},
  amonio:{l:"Amonio"}, ntot:{l:"Nitrógeno total"}, calcio:{l:"Calcio"}, magnesio:{l:"Magnesio"},
  potasio:{l:"Potasio"}, dureza:{l:"Dureza total"}, hierro:{l:"Hierro"}, fosforo:{l:"Fósforo"},
  cobre:{l:"Cobre"}, manganeso:{l:"Manganeso"},
  sal_a:{l:"S‰ antes"}, sal_d:{l:"S‰ después"}, ph_a:{l:"pH antes"}, ph_d:{l:"pH después"},
  calcio_a:{l:"Calcio antes"}, calcio_d:{l:"Calcio después"},
  magnesio_a:{l:"Magnesio antes"}, magnesio_d:{l:"Magnesio después"},
  potasio_a:{l:"Potasio antes"}, potasio_d:{l:"Potasio después"},
  cl_libre:{l:"Cloro libre (mg/L)"}, cl_total:{l:"Cloro total (mg/L)"}, cl_comb:{l:"Cloro combinado (mg/L)"}
};
// Orden estable de columnas de parámetros en la hoja ancha.
const CAL_PARAM_ORDER = ["sal","ph","alc","temp","nitrito","tan","amtox","nitrato","amonio","ntot","calcio","magnesio","potasio","dureza","hierro","fosforo","cobre","manganeso","sal_a","sal_d","ph_a","ph_d","calcio_a","calcio_d","magnesio_a","magnesio_d","potasio_a","potasio_d","cl_libre","cl_total","cl_comb"];
const CAL_PARAMS_FULL = ["sal","ph","alc","temp","nitrito","tan","amtox","nitrato","amonio","ntot","calcio","magnesio","potasio","dureza","hierro","fosforo","cobre","manganeso"];
const CAL_ALGAS_MUESTRA = ["Funda producción","Funda matriz","Reservorio PBR"];
const CAL_PDF_LEGEND = '<div class="miclegend"><b>Rangos:</b><span><span class="micbox" style="background:#bbf7d0;border-color:#4ade80"></span>Dentro</span><span><span class="micbox" style="background:#fecaca;border-color:#f87171"></span>Fuera de rango</span><span><span class="micbox" style="background:#fff;border-color:#cbd5e1"></span>Sin rango</span><span style="color:#64748b">· bajo cada columna: rango objetivo y unidad</span></div>';

const CAL_FORMATS = {
  "larv": {
    depto:"Larvicultura", label:"Larvicultura",
    ctx:[
      { k:"tipoMuestra", l:"Tipo de muestra", type:"sel", opts:["Agua"], def:"Agua", w:92 },
      { k:"modulo",      l:"Módulo",          type:"sel", opts:MIC_MODULOS,  w:58 },
      { k:"estadio",     l:"Estadío",         type:"sel", opts:MIC_ESTADIOS, w:84 },
      { k:"tq",          l:"TQ/N°",           type:"sel", opts:MIC_TQS_LARV, w:56 }
    ],
    params: CAL_PARAMS_FULL
  },
  "mad": {
    depto:"Maduración", label:"Maduración",
    ctx:[
      { k:"sala",   l:"Sala",   type:"sel", opts:MIC_SALAS, w:72 },
      { k:"estado", l:"Estado", type:"sel", opts:["","Cuarentena","Producción"], w:110 },
      { k:"tq",     l:"TQ/N°",  type:"txt", w:56 }
    ],
    params: CAL_PARAMS_FULL
  },
  "mad-agua": {
    depto:"Maduración", label:"Maduración · Agua",
    ctx:[ { k:"tipoMuestra", l:"Muestra", type:"sel", opts:["","Agua Camaronera","Agua Enjuague"], w:150 } ],
    params:["alc","ph","sal"]
  },
  "mad-ras": {
    depto:"Maduración", label:"Maduración · RAS",
    ctx:[ { k:"componente", l:"Componente", type:"sel", opts:["","Colector","Salida"], w:96 } ],
    params:["alc","sal","ph","temp","nitrito","nitrato","ntot","tan","amtox"]
  },
  "mad-ensayo": {
    depto:"Maduración", label:"Maduración · Ensayo",
    ctx:[
      { k:"sala", l:"Sala",   type:"sel", opts:MIC_SALAS, w:72 },
      { k:"tq",   l:"Tanque", type:"txt", w:90 }
    ],
    params:["sal_a","sal_d","ph_a","ph_d","calcio_a","calcio_d","magnesio_a","magnesio_d","potasio_a","potasio_d"]
  },
  "algas": {
    depto:"Algas", label:"Algas",
    ctx:[ { k:"muestras", l:"Muestras", type:"txtlist", opts:CAL_ALGAS_MUESTRA, w:150 } ],
    params:["cl_libre","cl_total","cl_comb"]
  }
};
const CAL_FORMAT_KEYS = ["larv","mad","mad-agua","mad-ras","mad-ensayo","algas"];
function calFormatLabel(k){ return (CAL_FORMATS[k] && CAL_FORMATS[k].label) || k || ""; }

// Rangos por parámetro (globales). Editables; sin rango = solo registro (sin color).
const CAL_RANGE_BASE = {
  ph:{min:7.5,max:8.5}, alc:{min:120,max:150},
  nitrito:{max:0.2}, tan:{max:2}, amtox:{max:0.1},
  calcio:{min:300,max:560}, magnesio:{min:1200,max:1800}, potasio:{min:380,max:420}
};
function loadCalRanges(){
  const out = JSON.parse(JSON.stringify(CAL_RANGE_BASE));
  try{ const raw = localStorage.getItem(CAL_RANGES_KEY);
    if(raw){ const o = JSON.parse(raw); if(o && typeof o==="object")
      Object.keys(o).forEach(pk=>{ out[pk] = Object.assign({}, out[pk]||{}, o[pk]||{}); }); }
  }catch(_){}
  return out;
}
function saveCalRanges(R){ try{ localStorage.setItem(CAL_RANGES_KEY, JSON.stringify(R||{})); }catch(_){ toast("No se pudo guardar rangos","err"); } }
function calRangeOf(pk){ const R = loadCalRanges(); return R[pk] || {}; }
// null (sin rango/sin valor) · "in" (dentro) · "out" (fuera)
function calClassify(val, r){
  if(!r || !isFinite(val)) return null;
  const hasMin = r.min != null, hasMax = r.max != null;
  if(!hasMin && !hasMax) return null;
  if(hasMin && val < r.min) return "out";
  if(hasMax && val > r.max) return "out";
  return "in";
}

// ── Storage ────────────────────────────────────────────
function _calRaw(){ try{ const raw=localStorage.getItem(CAL_REC_KEY); if(!raw) return []; const a=JSON.parse(raw); return Array.isArray(a)?a:[]; }catch(_){ return []; } }
function _calSave(list){
  const ok = _lsSet(CAL_REC_KEY, JSON.stringify(list||[]));
  if(!ok && !_reclaiming) toast("❌ Este navegador NO está guardando los datos (almacenamiento lleno, en modo privado o bloqueado). Usa ☁️ Guardar y sincronizar para no perderlos.","err",7000);
  return ok;
}
// Poda Calidad de Agua: igual que pruneMic → borra SOLO sesiones sincronizadas con
// más de MIC_TTL (7 d); las pendientes se conservan. Consistencia del módulo Mic.
function pruneCal(){
  const now = Date.now(); const raw = _calRaw();
  const list = raw.filter(r=> !(r && r.synced && r.ts && (now - r.ts) > MIC_TTL));
  if(list.length !== raw.length) _calSave(list);
  return list;
}
function loadCal(){ return pruneCal().slice().sort((a,b)=>(b.ts||0)-(a.ts||0)); }
// Id de sesión por "Nuevo análisis" (igual que Bacteriología): cada análisis es
// su propia sesión; los registros antiguos (sin sid) usan la clave compuesta.
function _calNewSid(){ return "c"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
// Clave = compuesta (Fecha+Corrida+Departamento+Formato) + sid (espeja keyCols
// [0,2,4,5,SID]). Formatos/fechas/corridas/análisis distintos = sesiones separadas.
function calSessionKey(d){
  const comp = [d.fechaMuestreo, d.corrida, d.departamento, d.formato].join("|");
  return d.sid ? comp + "|" + d.sid : comp;
}

function loadCalDraft(){
  const def = { meta:{ fechaMuestreo:today(), fechaResultados:"", corrida:"", responsable:"", hdrModulo:"", hdrEstadio:"" }, sections:{}, activeFmt:"larv" };
  try{ const raw=localStorage.getItem(CAL_DRAFT_KEY); if(raw){ const o=JSON.parse(raw); if(o && typeof o==="object")
    return { meta:Object.assign({},def.meta,o.meta||{}), sections:o.sections||{}, activeFmt:o.activeFmt||"larv" }; } }catch(_){}
  return def;
}
function saveCalDraft(d){ _lsSet(CAL_DRAFT_KEY, JSON.stringify(d||{})); }

function collectCalDraft(){
  const prev = loadCalDraft();
  const meta = Object.assign({ fechaMuestreo:today(), fechaResultados:"", corrida:"", responsable:"" }, prev.meta||{});
  const fm=document.getElementById("cal-fm"), fr=document.getElementById("cal-fr"),
        co=document.getElementById("cal-corr"), re=document.getElementById("cal-resp");
  if(fm) meta.fechaMuestreo  = isValidDate(fm.value) ? fm.value : "";
  if(fr) meta.fechaResultados= isValidDate(fr.value) ? fr.value : "";
  if(co) meta.corrida        = sanitizeStr(co.value);
  if(re) meta.responsable    = sanitizeStr(re.value);
  // Item 3: valores de cabecera Módulo/Estadío (rellenan todas las filas).
  const _hm=document.getElementById("cal-hdr-modulo");  if(_hm) meta.hdrModulo  = sanitizeStr(_hm.value);
  const _he=document.getElementById("cal-hdr-estadio"); if(_he) meta.hdrEstadio = sanitizeStr(_he.value);
  const sections = Object.assign({}, prev.sections || {});
  CAL_FORMAT_KEYS.forEach(fmtKey=>{
    const fmt = CAL_FORMATS[fmtKey];
    const tbody = document.getElementById("cal-tb-"+fmtKey);
    if(!tbody) return;
    const rows = [];
    tbody.querySelectorAll("tr").forEach((tr, idx)=>{
      const fila = idx+1; const d = {};
      const get=(k)=>{ const el=tr.querySelector(`[name="cal_${fmtKey}_${fila}_${k}"]`); return el?el.value:""; };
      fmt.ctx.forEach(c=> d[c.k] = sanitizeStr(get(c.k)));
      fmt.params.forEach(pk=> d[pk] = sanitizeStr(get(pk)));
      rows.push(d);
    });
    const obsEl = document.getElementById("cal-obs-"+fmtKey);
    sections[fmtKey] = { rows, obs: obsEl ? sanitizeStr(obsEl.value) : "" };
  });
  const selEl = document.getElementById("cal-fmt-sel");
  const activeFmt = (selEl && selEl.value) ? selEl.value : (prev.activeFmt || "larv");
  return { meta, sections, activeFmt };
}
function calDraftTouch(){ clearTimeout(_calDraftTm); _calDraftTm = setTimeout(()=>{ try{ saveCalDraft(collectCalDraft()); }catch(_){} }, 500); }
function calRowHasData(fmt, d){ return fmt.params.some(pk=> d[pk]!=null && String(d[pk]).trim()!==""); }

// ── Cálculo en vivo (clasificación por rango) ──────────
function _calApplyCls(inp){
  const raw = parseFloat(inp.value);
  if(inp.value.trim()==="" || !isFinite(raw)){ inp.className = "mic-in"; return; }
  const cls = calClassify(raw, calRangeOf(inp.dataset.param));
  inp.className = "mic-in" + (cls==="in" ? " mic-v" : cls==="out" ? " mic-r" : "");
}
function calCalcCell(inp){ _calApplyCls(inp); calDraftTouch(); }
function calRecalcSection(fmtKey){
  const tbody = document.getElementById("cal-tb-"+fmtKey); if(!tbody) return;
  tbody.querySelectorAll('input[data-param]').forEach(_calApplyCls);
}

// ── Ocultar columnas + pegado + navegación ─────────────
function loadCalHidden(fmtKey){ try{ const o=JSON.parse(localStorage.getItem(CAL_HIDCOLS_KEY)||"{}"); return new Set(Array.isArray(o[fmtKey])?o[fmtKey]:[]); }catch(_){ return new Set(); } }
function saveCalHidden(fmtKey,set){ try{ const o=JSON.parse(localStorage.getItem(CAL_HIDCOLS_KEY)||"{}"); o[fmtKey]=Array.from(set); localStorage.setItem(CAL_HIDCOLS_KEY,JSON.stringify(o)); }catch(_){} }
function calToggleCol(fmtKey,key){
  const hid=loadCalHidden(fmtKey); if(hid.has(key)) hid.delete(key); else hid.add(key);
  saveCalHidden(fmtKey,hid);
  const draft=collectCalDraft(); saveCalDraft(draft);
  renderCalNuevo();
}
function _calVisRow(tr){
  return Array.from(tr.children).filter(td=>td.style.display!=="none")
    .map(td=>td.querySelector("input.mic-in, select.mic-in")).filter(Boolean);
}
function calGridPaste(ev, fmtKey){
  const cd=ev.clipboardData||window.clipboardData; if(!cd) return;
  const txt=cd.getData("text"); if(!txt || (txt.indexOf("\t")===-1 && txt.indexOf("\n")===-1)) return;
  ev.preventDefault();
  const lines=txt.replace(/\r/g,"").split("\n").filter((l,i,a)=> !(i===a.length-1 && l===""));
  const matrix=lines.map(l=>l.split("\t"));
  const t=ev.target; const tbody=t.closest("tbody"); if(!tbody) return;
  const trs=Array.from(tbody.querySelectorAll("tr"));
  const startTr=t.closest("tr"); const r0=trs.indexOf(startTr); if(r0<0) return;
  const c0=_calVisRow(startTr).indexOf(t); if(c0<0) return;
  matrix.forEach((cells,dr)=>{
    const tr=trs[r0+dr]; if(!tr) return;
    const vis=_calVisRow(tr);
    cells.forEach((raw,dc)=>{
      const el=vis[c0+dc]; if(!el||el.readOnly) return;
      const val=String(raw).trim();
      if(el.tagName==="SELECT"){ const opt=Array.from(el.options).find(o=> o.value.toLowerCase()===val.toLowerCase() || o.text.toLowerCase()===val.toLowerCase()); if(opt) el.value=opt.value; }
      else el.value=val;
    });
  });
  calRecalcSection(fmtKey);
  calDraftTouch();
}
function calGridKey(ev){
  const k=ev.key;
  if(k!=="ArrowUp"&&k!=="ArrowDown"&&k!=="ArrowLeft"&&k!=="ArrowRight"&&k!=="Enter") return;
  const t=ev.target;
  if(!t||(t.tagName!=="INPUT"&&t.tagName!=="SELECT")||!t.classList||!t.classList.contains("mic-in")) return;
  const tbody=t.closest("tbody"); if(!tbody||String(tbody.id).indexOf("cal-tb-")!==0) return;
  if((k==="ArrowLeft"||k==="ArrowRight")&&t.tagName==="INPUT"&&t.type!=="number"){
    try{ const len=(t.value||"").length;
      if(k==="ArrowLeft"&&!(t.selectionStart===0&&t.selectionEnd===0)) return;
      if(k==="ArrowRight"&&!(t.selectionStart===len&&t.selectionEnd===len)) return;
    }catch(_){}
  }
  const trs=Array.from(tbody.querySelectorAll("tr"));
  const tr=t.closest("tr"); const r=trs.indexOf(tr);
  const vis=_calVisRow(tr); const c=vis.indexOf(t);
  if(r<0||c<0) return;
  const focusCell=(el)=>{ if(el&&typeof el.focus==="function"){ el.focus(); if(el.tagName==="INPUT"){ try{ el.select(); }catch(_){} } } };
  if(k==="ArrowUp"||k==="ArrowDown"||k==="Enter"){
    ev.preventDefault();
    const ntr=trs[r+(k==="ArrowUp"?-1:1)]; if(!ntr) return;
    const nvis=_calVisRow(ntr);
    focusCell(nvis[Math.min(c,nvis.length-1)]);
    return;
  }
  let nc=c+(k==="ArrowLeft"?-1:1);
  while(nc>=0&&nc<vis.length&&vis[nc]&&vis[nc].readOnly) nc+=(k==="ArrowLeft"?-1:1);
  if(nc<0||nc>=vis.length) return;
  ev.preventDefault();
  focusCell(vis[nc]);
}
if(typeof document!=="undefined" && !window.__calKeyNav){
  window.__calKeyNav=true;
  document.addEventListener("keydown", calGridKey);
}

/* ══════════════════════════════════════════════════════════════════════════
   SELECCIÓN TIPO EXCEL EN GRILLAS  (#2)
   ──────────────────────────────────────────────────────────────────────────
   Aplica a las grillas: Maduración (Salas/Tanques/Lotes), Biomol, y
   Microbiología/Calidad de Agua (Nuevo análisis). Permite:
     • Click en una celda = ancla (selección simple, edición normal).
     • Shift+Click en otra = selecciona el RECTÁNGULO ancla→destino.
     • Arrastrar (mousedown + mover) = selecciona rango.
     • Pegar (Ctrl+V) con un rango activo:
         - valor único  → rellena TODAS las celdas seleccionadas.
         - bloque (tabs/saltos) → lo derrama el handler por-grilla (sin tocar).
     • Tecla Supr (Delete) con un rango activo → borra todas las celdas del rango.
   Es genérico: identifica celdas por su posición física (fila del tbody ×
   columna del td) y opera sobre el input/select/textarea editable de cada celda,
   disparando eventos input/change para que los recálculos por-grilla existentes
   (mic/cal) y el marcado "sin guardar" se ejecuten igual que al teclear.
   Las fichas estándar (Calidad/Población/etc.) NO están incluidas (no tienen
   panel en la allowlist), así que conservan su comportamiento.
══════════════════════════════════════════════════════════════════════════ */
const _GSEL_PANELS = "#fp-salas,#fp-tanques,#fp-lotes,#fp-biomol,#fp-micnuevo";
let _gsel = null;                 // { tbody, ar, ac, fr, fc }
let _gselMouseDown = false, _gselDragged = false;

function _gselValid(){
  if(_gsel && _gsel.tbody && !_gsel.tbody.isConnected){ _gsel = null; _gselClearHighlight(); }
  return !!_gsel;
}
function _gridCellInfo(el){
  if(!el || (el.tagName!=="INPUT" && el.tagName!=="SELECT" && el.tagName!=="TEXTAREA")) return null;
  if(el.readOnly || el.disabled) return null;
  const td = el.closest ? el.closest("td") : null; if(!td) return null;
  const tr = td.parentElement; if(!tr || tr.tagName!=="TR") return null;
  const tbody = tr.parentElement; if(!tbody || tbody.tagName!=="TBODY") return null;
  if(!tbody.closest || !tbody.closest(_GSEL_PANELS)) return null;
  const r = Array.prototype.indexOf.call(tbody.rows, tr);
  const c = Array.prototype.indexOf.call(tr.cells, td);
  if(r < 0 || c < 0) return null;
  return { tbody, tr, td, r, c, el };
}
function _gselClearHighlight(scope){
  // Limpia solo dentro de `scope` (la grilla activa) cuando se conoce; así el
  // repintado durante un arrastre NO escanea todo el documento en cada mouseover
  // (era O(DOM) por evento → jank/“congelamiento” en equipos lentos).
  const root = (scope && scope.querySelectorAll) ? scope : document;
  const sel = root.querySelectorAll("td.gridsel-cell");
  for(let i=0;i<sel.length;i++) sel[i].classList.remove("gridsel-cell");
}
function _gselEditable(td){
  if(!td || td.style.display==="none") return null;
  return td.querySelector("input:not([readonly]):not([disabled]), select:not([disabled]), textarea:not([readonly])");
}
function _gselRect(){
  if(!_gsel) return null;
  return { r0:Math.min(_gsel.ar,_gsel.fr), r1:Math.max(_gsel.ar,_gsel.fr),
           c0:Math.min(_gsel.ac,_gsel.fc), c1:Math.max(_gsel.ac,_gsel.fc) };
}
function _gselIsMulti(){
  if(!_gselValid()) return false;
  return !(_gsel.ar===_gsel.fr && _gsel.ac===_gsel.fc);
}
function _gselControls(){
  if(!_gselValid()) return [];
  const R = _gselRect(); const tb = _gsel.tbody; const out = [];
  for(let r=R.r0;r<=R.r1;r++){
    const tr = tb.rows[r]; if(!tr) continue;
    for(let c=R.c0;c<=R.c1;c++){
      const td = tr.cells[c]; const ctl = _gselEditable(td);
      if(ctl) out.push(ctl);
    }
  }
  return out;
}
function _gselPaint(){
  _gselClearHighlight(_gsel && _gsel.tbody);   // limpia solo la grilla activa (rápido)
  if(!_gselValid()) return;
  const R = _gselRect(); if(R.r0===R.r1 && R.c0===R.c1) return;   // celda única → sin resaltar
  const tb = _gsel.tbody;
  for(let r=R.r0;r<=R.r1;r++){
    const tr = tb.rows[r]; if(!tr) continue;
    for(let c=R.c0;c<=R.c1;c++){
      const td = tr.cells[c];
      if(td && _gselEditable(td)) td.classList.add("gridsel-cell");
    }
  }
}
// Asigna un valor a una celda disparando los handlers existentes (recálculos).
function _gselSetVal(ctl, val){
  if(ctl.tagName==="SELECT"){
    const opt = Array.prototype.find.call(ctl.options, o =>
      o.value===val || o.value.toLowerCase()===String(val).toLowerCase() || (o.text||"").toLowerCase()===String(val).toLowerCase());
    ctl.value = opt ? opt.value : "";
    ctl.dispatchEvent(new Event("change", {bubbles:true}));
  } else {
    ctl.value = val;
    ctl.dispatchEvent(new Event("input", {bubbles:true}));
  }
}
function _gselMouseDownH(ev){
  const info = _gridCellInfo(ev.target);
  if(!info){ if(_gsel){ _gsel=null; _gselClearHighlight(); } return; }
  if(ev.shiftKey && _gsel && _gsel.tbody===info.tbody){
    _gsel.fr=info.r; _gsel.fc=info.c; _gselDragged=true; _gselPaint();
    ev.preventDefault();                 // evita reposicionar caret / selección de texto
    return;
  }
  _gsel = { tbody:info.tbody, ar:info.r, ac:info.c, fr:info.r, fc:info.c };
  _gselMouseDown = true; _gselDragged = false;
  _gselClearHighlight();                  // celda única → sin resaltado
}
function _gselMouseOverH(ev){
  if(!_gselMouseDown) return;
  if(!(ev.buttons & 1)){ _gselMouseDown=false; return; }
  const info = _gridCellInfo(ev.target);
  if(!info || !_gsel || info.tbody!==_gsel.tbody) return;
  if(info.r===_gsel.fr && info.c===_gsel.fc) return;
  _gsel.fr=info.r; _gsel.fc=info.c; _gselDragged=true;
  try{ window.getSelection().removeAllRanges(); }catch(_){}
  _gselPaint();
}
function _gselMouseUpH(){ _gselMouseDown=false; }
function _gselClickH(ev){ if(_gselDragged){ _gselDragged=false; } }
function _gselKeyH(ev){
  if(ev.key!=="Delete") return;
  if(!_gselIsMulti()) return;
  const info = _gridCellInfo(ev.target);
  if(!info || info.tbody!==_gsel.tbody) return;
  const ctls = _gselControls(); if(!ctls.length) return;
  ev.preventDefault();
  ctls.forEach(c=>_gselSetVal(c,""));
  toast("🧹 "+ctls.length+" celda(s) borradas","ok",1800);
}
function _gselPasteH(ev){
  if(!_gselIsMulti()) return;            // sin rango → lo maneja el onpaste por-grilla
  const info = _gridCellInfo(ev.target);
  if(!info || info.tbody!==_gsel.tbody) return;
  const cd = ev.clipboardData || window.clipboardData; if(!cd) return;
  const txt = cd.getData("text"); if(txt==null) return;
  const norm = String(txt).replace(/\r/g,"").replace(/\n$/,"");
  if(norm.indexOf("\t")!==-1 || norm.indexOf("\n")!==-1) return;  // bloque → derrame por-grilla
  ev.preventDefault(); ev.stopImmediatePropagation();
  const val = norm.trim();
  const ctls = _gselControls();
  ctls.forEach(c=>_gselSetVal(c,val));
  toast("📋 Pegado en "+ctls.length+" celda(s)","ok",1800);
}
if(typeof document!=="undefined" && !window.__gridSel){
  window.__gridSel = true;
  // Blindaje: un error en un handler en CAPTURA a nivel document podría dejar el
  // estado de arrastre "pegado" (_gselMouseDown=true) y hacer sentir la grilla
  // congelada. _safeGsel resetea el estado ante cualquier excepción.
  const _safeGsel = (fn)=> function(ev){
    try{ return fn(ev); }
    catch(x){ _gselMouseDown=false; _gsel=null; try{ _gselClearHighlight(); }catch(_){} _silent("gsel", x); }
  };
  document.addEventListener("mousedown", _safeGsel(_gselMouseDownH), true);
  document.addEventListener("mouseover", _safeGsel(_gselMouseOverH), true);
  document.addEventListener("mouseup",   _safeGsel(_gselMouseUpH),   true);
  document.addEventListener("click",     _safeGsel(_gselClickH),     true);
  document.addEventListener("keydown",   _safeGsel(_gselKeyH),       true);   // captura: antes que la navegación
  document.addEventListener("paste",     _safeGsel(_gselPasteH),     true);   // captura: antes que el onpaste por-grilla
}

// ── Render: grilla ─────────────────────────────────────
function calRowHtml(fmt, fmtKey, fila, d, hid, hdrDef){
  hid = hid || new Set();
  const cols=[...fmt.ctx.map(c=>({kind:"ctx",c})), ...fmt.params.map(pk=>({kind:"param",pk}))];
  let cells="";
  cols.forEach((col,ci)=>{
    const ckey = col.kind==="ctx" ? col.c.k : col.pk;
    const tdAttr = `data-colkey="${ckey}"${hid.has(ckey)?' style="display:none"':''}`;
    const pos = `data-r="${fila-1}" data-c="${ci}"`;
    if(col.kind==="ctx"){
      // Item 3/4: valor = guardado > default de cabecera (Módulo/Estadío) > def fijo del formato.
      const c=col.c; const base=`cal_${fmtKey}_${fila}_${c.k}`; const val=d[c.k] || (hdrDef && hdrDef[c.k]) || c.def || "";
      if(c.type==="sel"){
        cells += `<td ${tdAttr}><select class="mic-in" name="${base}" data-fmt="${fmtKey}" ${pos} onpaste="calGridPaste(event,'${fmtKey}')" oninput="calDraftTouch()" style="min-width:${c.w||60}px">`
          + c.opts.map(o=>`<option value="${escapeHtml(o)}"${val===o?" selected":""}>${escapeHtml(o)||"—"}</option>`).join("")
          + `</select></td>`;
      } else if(c.type==="txtlist"){
        cells += `<td ${tdAttr}><input class="mic-in" type="text" name="${base}" data-fmt="${fmtKey}" ${pos} list="cal-dl-${fmtKey}-${c.k}" onpaste="calGridPaste(event,'${fmtKey}')" oninput="calDraftTouch()" value="${escapeHtml(val)}" style="min-width:${c.w||90}px"></td>`;
      } else {
        cells += `<td ${tdAttr}><input class="mic-in" type="text" name="${base}" data-fmt="${fmtKey}" ${pos} onpaste="calGridPaste(event,'${fmtKey}')" oninput="calDraftTouch()" value="${escapeHtml(val)}" style="min-width:${c.w||56}px"></td>`;
      }
    } else {
      const pk=col.pk; const base=`cal_${fmtKey}_${fila}_${pk}`; const val=d[pk]||"";
      cells += `<td ${tdAttr}><input class="mic-in" type="text" inputmode="decimal" name="${base}" data-fmt="${fmtKey}" data-param="${pk}" ${pos} oninput="calCalcCell(this)" onpaste="calGridPaste(event,'${fmtKey}')" value="${escapeHtml(val)}" style="min-width:64px"></td>`;
    }
  });
  return `<tr><td class="tqc" style="font-size:10px;min-width:30px;text-align:center">${fila}</td>${cells}</tr>`;
}
function calSectionHtml(fmtKey, draft){
  const fmt=CAL_FORMATS[fmtKey];
  const sec=(draft.sections && draft.sections[fmtKey]) || { rows:[], obs:"" };
  const drows=sec.rows||[];
  const extra=_calExtra[fmtKey]||0;
  const nRows=Math.min(CAL_MAX_ROWS, Math.max(CAL_DEFAULT_ROWS+extra, drows.length));
  const hid=loadCalHidden(fmtKey);
  const allCols=[...fmt.ctx.map(c=>({k:c.k,l:c.l})), ...fmt.params.map(pk=>({k:pk,l:CAL_PARAMS[pk].l}))];
  const chips=allCols.map(co=>`<span class="mic-colchip${hid.has(co.k)?' off':''}" onclick="calToggleCol('${fmtKey}','${co.k}')" title="Clic para ocultar/mostrar esta columna">${escapeHtml(co.l)}</span>`).join("");
  const datalists=fmt.ctx.filter(c=>c.type==="txtlist").map(c=>
    `<datalist id="cal-dl-${fmtKey}-${c.k}">`+ (c.opts||[]).map(o=>`<option value="${escapeHtml(o)}">`).join("") +`</datalist>`).join("");
  const thFor=(key,l)=>`<th data-colkey="${key}"${hid.has(key)?' style="display:none"':''}>${escapeHtml(l)}</th>`;
  const ths=[...fmt.ctx.map(c=>thFor(c.k,c.l)), ...fmt.params.map(pk=>thFor(pk,CAL_PARAMS[pk].l))].join("");
  const hdrDef = { modulo: (draft.meta && draft.meta.hdrModulo) || "", estadio: (draft.meta && draft.meta.hdrEstadio) || "" };
  let rowsHtml="";
  for(let fila=1; fila<=nRows; fila++){ rowsHtml += calRowHtml(fmt, fmtKey, fila, drows[fila-1]||{}, hid, hdrDef); }
  const canAdd=nRows<CAL_MAX_ROWS;
  return `<div class="fc" style="margin-bottom:10px">
    <div class="fc-h" style="background:linear-gradient(135deg,#0369a1,#0284c7)">
      <div class="fc-t">${escapeHtml(fmt.label)}</div>
      <div class="sa-btns">
        <button class="btn bo" type="button" onclick="calAddRow('${fmtKey}')" ${canAdd?"":"disabled"} style="font-size:11px;padding:4px 10px">➕ Fila</button>
      </div>
    </div>
    <div class="fc-b" id="cal-body-${fmtKey}">${datalists}
      <div style="font-size:9.5px;color:var(--tx3);margin-bottom:3px">🧩 Columnas (clic para ocultar/mostrar; reversible):</div>
      <div style="margin-bottom:8px">${chips}</div>
      <div class="tw"><table class="ft" style="font-size:10.5px"><thead><tr><th class="tqh" style="min-width:30px">#</th>${ths}</tr></thead><tbody id="cal-tb-${fmtKey}">${rowsHtml}</tbody></table></div>
      <div class="ff" style="margin-top:8px"><label>Observaciones — ${escapeHtml(fmt.label)}</label>
        <textarea id="cal-obs-${fmtKey}" placeholder="Observaciones (opcional)…" oninput="calDraftTouch()" style="width:100%;min-height:44px">${escapeHtml(sec.obs||"")}</textarea></div>
    </div>
  </div>`;
}

// ── Toggle de tipo de análisis (Bacteriología | Calidad de Agua) ──
function micTypeGet(){ try{ const v=localStorage.getItem(CAL_TYPE_KEY); return (v==="cal"||v==="pat")?v:"bact"; }catch(_){ return "bact"; } }
function micTypeSet(v){ try{ localStorage.setItem(CAL_TYPE_KEY, (v==="cal"||v==="pat")?v:"bact"); }catch(_){} }
function micTypeBar(){
  const t=micTypeGet();
  const b=(v,ic,lbl)=>`<button type="button" onclick="micTypeToggle('${v}')" style="flex:1;padding:8px 10px;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;transition:.15s;${t===v?'background:#0891b2;color:#fff;box-shadow:0 1px 4px rgba(8,145,178,.4)':'background:transparent;color:#475569'}">${ic} ${lbl}</button>`;
  return `<div class="mic-typebar" style="display:flex;gap:4px;background:#e2e8f0;border-radius:11px;padding:4px;margin-bottom:12px">${b('bact','🧫','Bacteriología')}${b('cal','💧','Calidad de Agua')}${b('pat','🔬','Patología en Fresco')}</div>`;
}
function micDispatchNuevo(){ const t=micTypeGet(); if(t==="cal") renderCalNuevo(); else if(t==="pat") renderPatNuevo(); else renderMicNuevo(); }
function micDispatchHist(){  const t=micTypeGet(); if(t==="cal") renderCalHist();  else if(t==="pat") renderPatHist();  else renderMicHist(); }
function micDispatchFact(){  const t=micTypeGet(); if(t==="cal") renderCalRangos(); else if(t==="pat") renderPatFact();  else renderMicFactores(); }
function micDispatchRep(){   const t=micTypeGet(); if(t==="cal") renderCalReporte(); else if(t==="pat") renderPatReporte(); else renderMicReporte(); }
function micTypeToggle(v){
  if(micTypeGet()===v) return;
  // Preserva lo tecleado en Nuevo análisis del tipo actual antes de cambiar.
  if(curTab==="micnuevo"){
    try{ const cur=micTypeGet(); if(cur==="cal") saveCalDraft(collectCalDraft()); else if(cur==="pat") savePatDraft(collectPatDraft()); else saveMicDraft(collectMicDraft()); }catch(_){}
  }
  micTypeSet(v);
  const t=curTab;
  if(t==="michist") micDispatchHist();
  else if(t==="micfact") micDispatchFact();
  else if(t==="micrep") micDispatchRep();
  else micDispatchNuevo();
}

// ── Render: Nuevo análisis ─────────────────────────────
function renderCalNuevo(){
  const fp=document.getElementById("fp-micnuevo"); if(!fp) return;
  const draft=loadCalDraft(); const meta=draft.meta;
  let activeFmt=draft.activeFmt||"larv"; if(!CAL_FORMATS[activeFmt]) activeFmt="larv";
  const groups={};
  CAL_FORMAT_KEYS.forEach(k=>{ const dep=CAL_FORMATS[k].depto; (groups[dep]=groups[dep]||[]).push(k); });
  const fmtOpts=Object.keys(groups).map(dep=>
    `<optgroup label="${escapeHtml(dep)}">`+groups[dep].map(k=>`<option value="${k}"${k===activeFmt?" selected":""}>${escapeHtml(CAL_FORMATS[k].label)}</option>`).join("")+`</optgroup>`).join("");
  const section=calSectionHtml(activeFmt, draft);
  // Item 3: campos de cabecera Módulo/Estadío (solo si el formato activo tiene esa columna).
  const _afCal = CAL_FORMATS[activeFmt];
  const _optSelC = (arr,cur)=> arr.map(o=>`<option value="${escapeHtml(o)}"${o===cur?" selected":""}>${escapeHtml(o)||"—"}</option>`).join("");
  const calHdrMod = _afCal.ctx.some(c=>c.k==="modulo")
    ? `<div class="mf"><label>Módulo (todas)</label><select id="cal-hdr-modulo" onchange="calHdrFill('modulo',this.value)" title="Aplica este Módulo a TODAS las filas; luego edita las distintas">${_optSelC(MIC_MODULOS, meta.hdrModulo||"")}</select></div>` : "";
  const calHdrEst = _afCal.ctx.some(c=>c.k==="estadio")
    ? `<div class="mf"><label>Estadío (todas)</label><select id="cal-hdr-estadio" onchange="calHdrFill('estadio',this.value)" title="Aplica este Estadío a TODAS las filas; luego edita las distintas">${_optSelC(MIC_ESTADIOS, meta.hdrEstadio||"")}</select></div>` : "";
  fp.innerHTML = `${micTypeBar()}<div class="fc">
    <div class="fc-h" style="background:linear-gradient(135deg,#0369a1,#0284c7)"><div class="fc-t">💧 Calidad de Agua · Nuevo análisis</div>
      <span class="ssp ssp-mt">${escapeHtml(meta.fechaMuestreo||today())}</span></div>
    <div class="fc-b">
      <div class="meta">
        <div class="mf"><label>Fecha muestreo</label><input type="date" id="cal-fm" value="${escapeHtml(meta.fechaMuestreo||today())}" oninput="calDraftTouch()"></div>
        <div class="mf"><label>Fecha resultados</label><input type="date" id="cal-fr" value="${escapeHtml(meta.fechaResultados||"")}" oninput="calDraftTouch()"></div>
        <div class="mf"><label>N° Corrida (opcional)</label><input id="cal-corr" value="${escapeHtml(meta.corrida||"")}" placeholder="Opcional" oninput="calDraftTouch()" onchange="calCorridaChange()"></div>
        <div class="mf"><label>Responsable</label><input id="cal-resp" value="${escapeHtml(meta.responsable||"")}" placeholder="Analista" oninput="calDraftTouch()"></div>
        <div class="mf"><label>Formato</label><select id="cal-fmt-sel" onchange="calFmtChange(this.value)" style="font-weight:600">${fmtOpts}</select></div>
        ${calHdrMod}${calHdrEst}
      </div>
      <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:11px;color:#1e40af;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">💧</span>
        <span>Teclea el <b>valor medido</b>; se colorea <b>verde</b> si está dentro del rango y <b>rojo</b> si se desvía. Los parámetros sin rango definido no se colorean. Puedes pegar desde Excel. Guarda antes de cambiar de pestaña.</span>
      </div>
      ${section}
      <div class="sa" style="margin-top:12px">
        <div class="sa-info">
          <span>💾 Guarda para registrar el análisis (sin duplicados al reenviar)</span>
          <span id="cal-saved-ind" style="font-weight:600">${_calLastSavedText(meta)}</span>
        </div>
        <div class="sa-btns">
          <button class="btn bo" type="button" onclick="calNuevoReset()" title="Vaciar el análisis actual">🧹 Vaciar</button>
          <button class="btn bs" type="button" onclick="calGuardarLocal()">💾 Guardar local</button>
          <button class="btn bp" type="button" onclick="syncCal()">☁️ Guardar y sincronizar</button>
        </div>
      </div>
    </div>
  </div>`;
  calRecalcSection(activeFmt);
  fixupLabels(fp);
}
function calFmtChange(val){ const draft=collectCalDraft(); draft.activeFmt=val; saveCalDraft(draft); renderCalNuevo(); }
function calAddRow(fmtKey){
  const draft=collectCalDraft(); saveCalDraft(draft);
  const drows=(draft.sections[fmtKey]&&draft.sections[fmtKey].rows)?draft.sections[fmtKey].rows.length:0;
  const cur=Math.max(CAL_DEFAULT_ROWS+(_calExtra[fmtKey]||0), drows);
  if(cur>=CAL_MAX_ROWS){ toast("Máximo "+CAL_MAX_ROWS+" filas","info",2500); return; }
  _calExtra[fmtKey]=Math.min(CAL_MAX_ROWS-CAL_DEFAULT_ROWS, (cur-CAL_DEFAULT_ROWS)+CAL_ROW_STEP);
  renderCalNuevo();
}
function calNuevoReset(){
  if(!confirm("¿Vaciar el análisis actual? Se perderá lo no guardado.")) return;
  const af = loadCalDraft().activeFmt || "larv";
  saveCalDraft({ meta:{ fechaMuestreo:today(), fechaResultados:"", corrida:"", responsable:"", sid:_calNewSid() }, sections:{}, activeFmt: af });
  _calExtra={}; renderCalNuevo(); toast("🧹 Análisis en blanco","info",1800);
}

// ── Guardar / Sincronizar ──────────────────────────────
function saveCalLocal(){
  const draft=collectCalDraft(); saveCalDraft(draft);
  if(!isValidDate(draft.meta.fechaMuestreo)){ toast("⚠️ Ingresa una Fecha de muestreo válida","warn",3500); return -1; }
  // Identidad de sesión: cada "Nuevo análisis" tiene un sid estable (ver Bacteriología).
  if(draft.meta.sid === undefined){ draft.meta.sid = _calNewSid(); }
  saveCalDraft(draft);
  const sid = draft.meta.sid;
  // Guarda SOLO el formato ACTIVO (igual que Bacteriología): cada formato es un
  // registro independiente; cambiar de formato y guardar no toca los anteriores.
  const actFmt = draft.activeFmt;
  const fmt = CAL_FORMATS[actFmt];
  const newRecords=[];
  if(fmt){
    const sec=draft.sections[actFmt]||{ rows:[], obs:"" };
    const dataRows=(sec.rows||[]).filter(d=> calRowHasData(fmt,d));
    dataRows.forEach((d,i)=>{
      const data=Object.assign({
        fechaMuestreo:draft.meta.fechaMuestreo, fechaResultados:draft.meta.fechaResultados,
        corrida:draft.meta.corrida, responsable:draft.meta.responsable,
        departamento:fmt.depto, formato:actFmt, fila:i+1, obs:sec.obs||""
      }, d);
      data.sid = sid;
      newRecords.push({ id:Date.now().toString(36)+Math.random().toString(36).slice(2,6), ts:Date.now(), synced:false, syncedAt:null, data });
    });
  }
  let list=_calRaw();
  // Reemplazo espejo de la hoja SOLO para la clave del formato activo: quita las
  // sesiones cuya clave coincide con la de algún registro nuevo y re-añade los
  // nuevos. Otros formatos quedan intactos (conservan su estado synced).
  const newKeys = new Set(newRecords.map(r=> calSessionKey(r.data)));
  list = list.filter(r=> !(r.data && newKeys.has(calSessionKey(r.data))));
  list = list.concat(newRecords);
  const saved = newRecords.length;
  const _ok = _calSave(list);
  updateDots(); updateSyncUI(); buildGrid();
  if(!_ok) return -2;
  return saved;
}
// Texto de referencia del último guardado local del análisis activo (Cal).
function _calLastSavedText(meta){
  const recs = _calRaw().filter(r => r.data && r.data.fechaMuestreo === meta.fechaMuestreo &&
    (!meta.corrida || String(r.data.corrida) === String(meta.corrida)));
  if(!recs.length) return "○ Sin guardar localmente";
  const maxTs = Math.max.apply(null, recs.map(r => r.ts || 0));
  const allSynced = recs.every(r => r.synced);
  return (allSynced ? "✅ Sincronizado · " : "⏳ Guardado local · ") + new Date(maxTs).toLocaleString("es-EC");
}
function calGuardarLocal(){
  const n=saveCalLocal();
  if(n===-2) return;
  if(n===0){ toast("No hay muestras con datos para guardar","warn",3000); return; }
  if(n>0){
    toast("💾 "+n+" muestra(s) guardada(s) en el historial","ok",2800);
    const ind=document.getElementById("cal-saved-ind");
    if(ind) ind.textContent = "⏳ Guardado local · "+new Date().toLocaleString("es-EC");
  }
}
async function syncCal(){
  const n=saveCalLocal();
  if(n<0) return;
  const url=gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL inválida","err"); return; }
  if(!syncRateOk()) return;
  const list=_calRaw();
  const pendKeys=new Set();
  list.forEach(r=>{ if(!r.synced && r.data) pendKeys.add(calSessionKey(r.data)); });
  if(pendKeys.size===0){ toast("No hay muestras pendientes","info",2500); return; }
  const toSend=list.filter(r=> r.data && pendKeys.has(calSessionKey(r.data)));
  const payload=buildCalPayload(toSend);
  if(!payload.rows.length){ toast("No hay filas para enviar","warn",3000); return; }
  setSyncUI("pend","Enviando "+payload.rows.length+" muestra(s)…");
  const sent=await postPayload(payload, url);
  if(sent){
    const l2=_calRaw();
    l2.forEach(r=>{ if(r.data && pendKeys.has(calSessionKey(r.data))){ r.synced=true; r.syncedAt=Date.now(); } });
    _calSave(l2);
    setSyncUI("ok", payload.rows.length+" muestra(s) sincronizada(s) ✔");
    toast("✅ "+payload.rows.length+" muestra(s) enviadas a Calidad de Agua (sesión reemplazada)","ok",4500);
    const ind=document.getElementById("cal-saved-ind");
    if(ind) ind.textContent = "✅ Sincronizado · "+new Date().toLocaleString("es-EC");
    setTimeout(()=> setSyncUI("idle","Todo sincronizado"), 3500);
  } else {
    setSyncUI("err","Error al sincronizar Calidad de Agua");
    toast("No fue posible sincronizar con Google Sheets","err",4500);
  }
  updateDots(); updateSyncUI(); buildGrid();
  if(curTab==="michist" && micTypeGet()==="cal") renderCalHist();
}

// ── Payload (hoja ancha) ───────────────────────────────
const CAL_SHEET_HEADERS = (function(){
  const h=["Fecha muestreo","Fecha resultados","Corrida","Responsable","Departamento","Formato",
    "Tipo de muestra","Módulo","Estadío","TQ/N°","Sala","Estado","Componente","Muestras"];
  CAL_PARAM_ORDER.forEach(pk=> h.push(CAL_PARAMS[pk].l));
  h.push("Sesión");   // id único por análisis (clave de upsert; vacío en filas heredadas)
  return h;
})();
const CAL_SID_COL = CAL_SHEET_HEADERS.indexOf("Sesión");
function buildCalPayload(records){
  const rows=records.map(rec=>{
    const d=rec.data||{};
    const row=[
      isValidDate(d.fechaMuestreo||"")?d.fechaMuestreo:"",
      isValidDate(d.fechaResultados||"")?d.fechaResultados:"",
      sanitizeStr(d.corrida||""), sanitizeStr(d.responsable||""),
      sanitizeStr(d.departamento||""), calFormatLabel(d.formato),
      sanitizeStr(d.tipoMuestra||""), sanitizeStr(d.modulo||""), sanitizeStr(d.estadio||""), sanitizeStr(d.tq||""),
      sanitizeStr(d.sala||""), sanitizeStr(d.estado||""), sanitizeStr(d.componente||""), sanitizeStr(d.muestras||"")
    ];
    CAL_PARAM_ORDER.forEach(pk=>{ const v=parseFloat(d[pk]); row.push(isFinite(v)?v:""); });
    row.push(sanitizeStr(d.sid||""));   // Sesión (última columna)
    return row;
  });
  return { sheetName:CAL_SHEET, headers:CAL_SHEET_HEADERS, rows, replaceKey:true, keyCols:[0,2,4,5,CAL_SID_COL] };
}

// ── Vista Historial ────────────────────────────────────
function renderCalHist(){
  const fp=document.getElementById("fp-michist"); if(!fp) return;
  const list=loadCal();
  const groups={};
  list.forEach(r=>{ const k=calSessionKey(r.data); (groups[k]=groups[k]||[]).push(r); });
  const keys=Object.keys(groups).sort((a,b)=> Math.max(...groups[b].map(r=>r.ts||0)) - Math.max(...groups[a].map(r=>r.ts||0)));
  if(keys.length===0){
    fp.innerHTML=`${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">📜 Historial · Calidad de Agua</div><span class="ssp ssp-mt">0 sesiones</span></div>
      <div class="fc-b"><div class="hist-empty"><span class="hist-empty-ico">📜</span>Aún no hay análisis guardados.<br><small style="opacity:.75;display:block;margin-top:6px">Guarda un análisis en <b>Nuevo análisis</b> para verlo aquí.</small></div></div></div>`;
    return;
  }
  const cards=keys.map(k=>{
    const rs=groups[k]; const d=rs[0].data; const pend=rs.some(r=>!r.synced);
    return `<div class="mad-item">
      <div class="mad-item-body">
        <div class="mad-item-title">
          <span><b>📅 ${escapeHtml(d.fechaMuestreo||"—")}</b></span>
          ${d.corrida?`<span class="bit-tag mod">Corrida ${escapeHtml(String(d.corrida))}</span>`:""}
          <span class="bit-tag area">${escapeHtml(d.departamento||"")}</span>
          <span class="bit-tag sis">${escapeHtml(calFormatLabel(d.formato))}</span>
          ${pend?'<span class="ssp ssp-pend">⏳ Pendiente</span>':'<span class="ssp ssp-ok">✅ Sincronizado</span>'}
        </div>
        <div class="mad-item-meta">
          <span><b>Muestras:</b> ${rs.length}</span>
          ${d.responsable?`<span><b>Responsable:</b> ${escapeHtml(d.responsable)}</span>`:""}
          ${d.fechaResultados?`<span><b>Resultados:</b> ${escapeHtml(d.fechaResultados)}</span>`:""}
        </div>
      </div>
      <div class="mad-item-actions">
        <button class="alg-hist-edit" onclick="calEditSession('${escapeHtml(k)}')" title="Cargar en Nuevo análisis para editar">✏️</button>
        <button class="alg-hist-del" onclick="calDeleteSession('${escapeHtml(k)}')" title="Eliminar sesión del historial local (no afecta a Google Sheets)">🗑</button>
      </div>
    </div>`;
  }).join("");
  fp.innerHTML=`${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">📜 Historial · Calidad de Agua</div><span class="ssp ssp-mt">${keys.length} sesión(es)</span></div>
    <div class="fc-b"><div class="mad-list">${cards}</div>
    <div style="margin-top:10px;font-size:10.5px;color:var(--tx3)">ℹ️ Solo se guarda/sincroniza el <b>formato que tienes en pantalla</b> (cada formato es un registro independiente; cambiar de formato no toca los anteriores). Para registrar <b>otro</b> análisis igual, usa <b>🧹 Análisis en blanco</b>. <b>✏️</b> editar y re-guardar actualiza la sesión; <b>🗑</b> borra <b>solo del historial local</b> (no afecta a Google Sheets).</div></div></div>`;
}
function calEditSession(k){
  const list=loadCal(); const rs=list.filter(r=> calSessionKey(r.data)===k);
  if(!rs.length){ toast("Sesión no encontrada","warn"); return; }
  const d0=rs[0].data; const fmtKey=d0.formato; const fmt=CAL_FORMATS[fmtKey];
  if(!fmt){ toast("Formato no soportado","warn"); return; }
  const rows=rs.slice().sort((a,b)=>(parseInt(a.data.fila)||0)-(parseInt(b.data.fila)||0)).map(r=>{
    const d=r.data; const row={};
    fmt.ctx.forEach(c=> row[c.k]=d[c.k]||"");
    fmt.params.forEach(pk=> row[pk]=(d[pk]!=null?String(d[pk]):""));
    return row;
  });
  const draft={ meta:{ fechaMuestreo:d0.fechaMuestreo, fechaResultados:d0.fechaResultados||"", corrida:d0.corrida||"", responsable:d0.responsable||"" }, sections:{}, activeFmt:fmtKey };
  draft.meta.sid = d0.sid || "";   // "" = sesión heredada (clave compuesta sin sid)
  draft.sections[fmtKey]={ rows, obs:d0.obs||"" };
  saveCalDraft(draft); _calExtra={};
  micTypeSet("cal"); selTab("micnuevo"); renderCalNuevo();
  toast("✏️ Sesión cargada en Nuevo análisis · edita y guarda/sincroniza para actualizar","ok",5000);
}
function calDeleteSession(k){
  // Borra SOLO del historial local (como Larvicultura). Lo ya enviado a Google
  // Sheets NO se toca.
  const list=_calRaw(); const rs=list.filter(r=> calSessionKey(r.data)===k);
  if(!rs.length) return;
  if(!confirm("¿Eliminar esta sesión del historial local ("+rs.length+" muestra(s))?\nSolo se borra del sistema; lo ya enviado a Google Sheets NO se elimina.")) return;
  _calSave(list.filter(r=> calSessionKey(r.data)!==k));
  renderCalHist(); updateDots(); updateSyncUI(); buildGrid();
  toast("🗑 Sesión eliminada del historial local","ok",3000);
}

// ── Vista Rangos ───────────────────────────────────────
function renderCalRangos(){
  const fp=document.getElementById("fp-micfact"); if(!fp) return;
  const R=loadCalRanges();
  const groupDefs=[
    { t:"Parámetros generales (Larvicultura / Maduración / RAS / Agua)", keys:CAL_PARAMS_FULL },
    { t:"Ensayo (antes / después)", keys:["sal_a","sal_d","ph_a","ph_d","calcio_a","calcio_d","magnesio_a","magnesio_d","potasio_a","potasio_d"] },
    { t:"Cloro (Algas)", keys:["cl_libre","cl_total","cl_comb"] }
  ];
  const inp=(pk,field,w)=>{ const r=R[pk]||{}; return `<input type="number" class="pinp" value="${r[field]!=null?r[field]:""}" onchange="calRangeSet('${pk}','${field}',this.value)" step="any" placeholder="—" style="width:${w}px">`; };
  const blocks=groupDefs.map(g=>{
    const rows=g.keys.map(pk=>`<tr><td style="text-align:left;font-weight:600">${escapeHtml(CAL_PARAMS[pk]?CAL_PARAMS[pk].l:pk)}</td><td>${inp(pk,"min",90)}</td><td>${inp(pk,"max",90)}</td></tr>`).join("");
    return `<div class="fc" style="margin-bottom:12px"><div class="fc-h"><div class="fc-t">${escapeHtml(g.t)}</div></div>
      <div class="fc-b"><div class="tw"><table class="ft" style="font-size:11px"><thead><tr><th style="text-align:left">Parámetro</th><th>Mínimo</th><th>Máximo</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
  }).join("");
  fp.innerHTML=`${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">📐 Rangos (Calidad de Agua)</div>
      <div class="sa-btns">
        <button class="btn bo" type="button" onclick="calRangosReset()">↺ Restaurar</button>
        <button class="btn bp" type="button" onclick="calRangosGuardar()">💾 Guardar rangos</button>
      </div></div>
    <div class="fc-b"><div style="font-size:10.5px;color:var(--tx3);margin-bottom:8px">El valor medido se clasifica <b>verde</b> (dentro) o <b>rojo</b> (fuera). Si dejas <b>Mínimo y Máximo</b> vacíos, ese parámetro no se colorea (solo registro). Se guarda automáticamente al editar; el botón <b>Guardar rangos</b> confirma el guardado.</div>${blocks}</div></div>`;
}
// Confirmación explícita (ya se persiste al editar vía calRangeSet).
function calRangosGuardar(){
  try{ saveCalRanges(loadCalRanges()); }catch(_){}
  toast("✅ Rangos (Calidad de Agua) guardados","ok",2500);
}
function calRangeSet(pk, field, val){
  const R=loadCalRanges(); R[pk]=R[pk]||{};
  const n=parseFloat(val);
  if(val===""||!isFinite(n)) delete R[pk][field]; else R[pk][field]=n;
  saveCalRanges(R);
  toast("Rango actualizado","ok",1400);
}
function calRangosReset(){
  if(!confirm("¿Restaurar los rangos predeterminados? Se perderán tus ajustes.")) return;
  try{ localStorage.removeItem(CAL_RANGES_KEY); }catch(_){}
  renderCalRangos(); toast("Rangos restaurados","ok",2500);
}

// ── Vista Reporte + PDF ────────────────────────────────
function _calLegendHtml(){
  const b=(c,bd)=>`<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${c};border:1px solid ${bd};vertical-align:middle;margin-right:3px"></span>`;
  return `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:10px;margin-bottom:10px;padding:7px 10px;background:#f8fafc;border:1px solid var(--bdr);border-radius:8px"><b>Rangos:</b><span>${b("#bbf7d0","#4ade80")}Dentro</span><span>${b("#fecaca","#f87171")}Fuera de rango</span><span>${b("#ffffff","#cbd5e1")}Sin rango</span></div>`;
}
function _calReportBody(draft){
  let body="";
  CAL_FORMAT_KEYS.forEach(fmtKey=>{
    const fmt=CAL_FORMATS[fmtKey];
    const sec=(draft.sections && draft.sections[fmtKey])||{ rows:[] };
    const rows=(sec.rows||[]).filter(d=> calRowHasData(fmt,d));
    if(!rows.length) return;
    const heads=[...fmt.ctx.map(c=>c.l), ...fmt.params.map(pk=>CAL_PARAMS[pk].l)];
    const trs=rows.map((d,i)=>{
      const tds=[...fmt.ctx.map(c=>`<td>${escapeHtml(d[c.k]||"—")}</td>`), ...fmt.params.map(pk=>{
        const v=parseFloat(d[pk]);
        if(!isFinite(v)) return `<td>—</td>`;
        const cls=calClassify(v, calRangeOf(pk));
        const c=cls==="in"?"mic-v":cls==="out"?"mic-r":"";
        return `<td class="${c}">${escapeHtml(String(d[pk]))}</td>`;
      })];
      return `<tr><td class="tqc">${i+1}</td>${tds.join("")}</tr>`;
    }).join("");
    body+=`<div class="fc" style="margin-bottom:12px"><div class="fc-h"><div class="fc-t">${escapeHtml(fmt.label)}</div></div>
      <div class="fc-b"><div class="tw"><table class="ft" style="font-size:10.5px"><thead><tr><th class="tqh">#</th>${heads.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${trs}</tbody></table></div></div></div>`;
  });
  return body;
}
function renderCalReporte(){
  const fp=document.getElementById("fp-micrep"); if(!fp) return;
  const draft=loadCalDraft();
  const body=_calReportBody(draft) || `<div class="hist-empty"><span class="hist-empty-ico">📊</span>Sin datos en el análisis actual. Llena el <b>Nuevo análisis</b> para ver el reporte.</div>`;
  fp.innerHTML=`${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">📊 Reporte · Calidad de Agua</div>
      <div class="sa-btns"><button class="btn bpdf" type="button" onclick="downloadCalPDF()">📄 PDF</button></div></div>
    <div class="fc-b"><div style="font-size:10.5px;color:var(--tx3);margin-bottom:8px">Valores medidos con clasificación por rango. Refleja el <b>Nuevo análisis</b> actual.</div>${_calLegendHtml()}${body}</div></div>`;
}
// Unidad por parámetro (los pares antes/después heredan la del parámetro base).
const CAL_UNITS = { sal:"‰", temp:"°C", alc:"mg/L", nitrito:"mg/L", tan:"mg/L", amtox:"mg/L",
  nitrato:"mg/L", amonio:"mg/L", ntot:"mg/L", calcio:"mg/L", magnesio:"mg/L", potasio:"mg/L",
  dureza:"mg/L", hierro:"mg/L", fosforo:"mg/L", cobre:"mg/L", manganeso:"mg/L" };
function calUnit(pk){ return CAL_UNITS[pk.replace(/_(a|d)$/,"")] || ""; }
function _calHeadLabel(pk){
  const l = CAL_PARAMS[pk] ? CAL_PARAMS[pk].l : pk;
  if(l.indexOf("(") !== -1) return l;          // ya trae unidad (cloros)
  const u = calUnit(pk); return u ? l+" ("+u+")" : l;
}
function _calCritText(pk){
  const r = calRangeOf(pk); const hasMin = r.min!=null, hasMax = r.max!=null;
  if(hasMin && hasMax) return r.min+"–"+r.max;
  if(hasMax) return "≤"+r.max;
  if(hasMin) return "≥"+r.min;
  return "—";
}
// Columnas a mostrar en el PDF: respeta columnas ocultas (chips) y descarta vacías.
function _calPdfCols(fmt, fmtKey, rows){
  const hid = loadCalHidden(fmtKey); const cols = [];
  fmt.ctx.forEach(c=>{ if(hid.has(c.k)) return;
    if(rows.some(d=> d[c.k]!=null && String(d[c.k]).trim()!=="")) cols.push({ kind:"ctx", key:c.k, label:c.l }); });
  fmt.params.forEach(pk=>{ if(hid.has(pk)) return;
    if(rows.some(d=> isFinite(parseFloat(d[pk])))) cols.push({ kind:"param", key:pk, label:_calHeadLabel(pk) }); });
  return cols;
}
function downloadCalPDF(){
  const draft=loadCalDraft(); const meta=draft.meta;
  const tsStr=new Date().toLocaleString("es-EC",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  const codigo=genCodigo("calnuevo", MIC_MOD, meta.fechaMuestreo||today());
  let body="";
  CAL_FORMAT_KEYS.forEach(fmtKey=>{
    const fmt=CAL_FORMATS[fmtKey]; const sec=(draft.sections && draft.sections[fmtKey])||{ rows:[] };
    const rows=(sec.rows||[]).filter(d=> calRowHasData(fmt,d));
    if(!rows.length) return;
    const vis=_calPdfCols(fmt, fmtKey, rows);
    if(!vis.length) return;
    const headH=vis.map(co=>`<th>${escapeHtml(co.label)}</th>`).join("");
    const critH=vis.map(co=> co.kind==="param" ? `<th class="pcrit">${escapeHtml(_calCritText(co.key))}</th>` : `<th class="pcrit"></th>`).join("");
    const trs=rows.map((d,i)=>{
      const tds=vis.map(co=>{
        if(co.kind==="ctx") return `<td>${escapeHtml(d[co.key]||"—")}</td>`;
        const pk=co.key; const v=parseFloat(d[pk]);
        if(!isFinite(v)) return `<td>—</td>`;
        const cls=calClassify(v, calRangeOf(pk));
        const _cls=cls==="in"?' class="mic-v"':cls==="out"?' class="mic-r"':'';
        return `<td${_cls}>${escapeHtml(String(d[pk]))}</td>`;
      }).join("");
      return `<tr><td class="tqc">${i+1}</td>${tds}</tr>`;
    }).join("");
    body+=`<div class="ftitle">${escapeHtml(fmt.label)}</div><table><thead><tr><th>#</th>${headH}</tr><tr class="critline"><th></th>${critH}</tr></thead><tbody>${trs}</tbody></table>`;
    if(sec.obs) body+=`<div class="obs-block"><div class="lbl">Observaciones</div><div class="txt">${escapeHtml(sec.obs)}</div></div>`;
  });
  if(!body){ toast("Sin datos para el PDF","warn"); return; }
  const fileName="CALAGUA_"+(meta.fechaMuestreo||today()).replace(/-/g,"")+(meta.corrida?"_"+sanitizeStr(meta.corrida):"");
  const head=`<div class="ph"><div class="ph-brand"><div class="co">OMARSA · Calidad de Agua</div><div class="su">Análisis físico-químico — clasificación por rango</div></div>
    <div class="ph-center"><span class="doc-code">OMR-CDA</span></div>
    <div class="ph-right"><div class="mod">CA</div><div class="mods">Calidad de Agua</div></div></div>
    <div class="mgrid"><div class="mf"><label>Fecha muestreo</label><span>${escapeHtml(meta.fechaMuestreo||today())}</span></div>
      <div class="mf"><label>Fecha resultados</label><span>${escapeHtml(meta.fechaResultados||"—")}</span></div>
      <div class="mf"><label>Corrida</label><span>${escapeHtml(String(meta.corrida||"—"))}</span></div>
      <div class="mf"><label>Responsable</label><span>${escapeHtml(meta.responsable||"—")}</span></div></div>`;
  const foot=`<div class="pfoot"><div><div style="font-size:6pt;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Código verificador</div>
      <div class="code-box">${codigo}</div><div class="ts-txt" style="margin-top:2px">Generado el ${escapeHtml(tsStr)}</div></div>
    <div style="text-align:center;min-width:140px"><div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">${escapeHtml(meta.responsable||"Responsable")}</div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Analista</div></div></div>`;
  const page=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${escapeHtml(fileName)}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"><style>${pdfCss('params')}${MIC_PDF_CSS}</style></head><body>
    <div class="ppage">${head}${CAL_PDF_LEGEND}${body}<div class="spacer"></div>${foot}</div>
    <script>try{document.title=${JSON.stringify(fileName)};}catch(_){}var _p=false;function dp(){if(_p)return;_p=true;setTimeout(function(){window.print();},350);}if(document.readyState==='complete')dp();else window.addEventListener('load',dp,{once:true});<\/script></body></html>`;
  const w=window.open("","_blank","width=1100,height=720");
  if(!w){ toast("El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.","warn",6000); return; }
  w.document.write(page); w.document.close(); try{ w.document.title=fileName; }catch(_){}
  toast("📄 PDF: "+fileName,"ok",5000);
}


/* ════════════════════════════════════════════════════════
   PATOLOGÍA EN FRESCO (pat) — tercer análisis del módulo Microbiología
   ──────────────────────────────────────────────────────────
   Toggle 🔬 junto a Bacteriología y Calidad de Agua. NO usa factores/umbrales.
   Una sola grilla con columnas AGRUPADAS (Hepatopáncreas/Branquias/Intestino),
   valores numéricos libres + Peso, y una fila "Grado" = promedio por columna
   (incluida Peso) que se muestra en pantalla y PDF (NO se envía a la hoja).
   Sincroniza a la hoja "Patología en Fresco" (reemplazo por sesión Fecha+Corrida).
════════════════════════════════════════════════════════ */
const PAT_REC_KEY    = "larv4_pat_records";
const PAT_DRAFT_KEY  = "larv4_pat_draft";
const PAT_SHEET      = "Patología en Fresco";
const PAT_DEFAULT_ROWS = 8, PAT_ROW_STEP = 4, PAT_MAX_ROWS = 50;
let _patExtra = 0;        // filas extra agregadas (grilla única, sin formatos)
let _patDraftTm = null;

const PAT_GROUPS = [
  { label:"Hepatopáncreas", cols:[
    {k:"hp_vac", l:"Vacuolas lipídicas"}, {k:"hp_mel", l:"Melanización"},
    {k:"hp_bac", l:"Baculovirus sp."},    {k:"hp_atr", l:"Atrofia tubular"}
  ]},
  { label:"Branquias", cols:[
    {k:"br_mel", l:"Melanización"}, {k:"br_nec", l:"Necrosis"}, {k:"br_pro", l:"Protozoarios"},
    {k:"br_det", l:"Detritos"},     {k:"br_fil", l:"Bacterias filamentosas"}
  ]},
  { label:"Intestino", cols:[
    {k:"in_gre", l:"Gregarinas"}, {k:"in_bac", l:"Baculovirus sp."}, {k:"in_nem", l:"Nemátodos"},
    {k:"in_bal", l:"Balanceado"}, {k:"in_alg", l:"Algas"},          {k:"in_det", l:"Detritos"}
  ]}
];
const PAT_GROUP_KEYS = PAT_GROUPS.reduce((a,g)=> a.concat(g.cols.map(c=>c.k)), []);  // 15 claves
const PAT_NUM_KEYS   = PAT_GROUP_KEYS.concat(["peso"]);                              // numéricas (Grado)
const PAT_SHEET_HEADERS = (function(){
  const h = ["Fecha muestreo","Fecha resultados","Corrida","Responsable","Muestra","Sexo"];
  PAT_GROUPS.forEach(g => g.cols.forEach(c => h.push(g.label + " — " + c.l)));
  h.push("Peso","Observaciones");
  h.push("Sesión");   // id único por análisis (clave de upsert; vacío en filas heredadas)
  return h;
})();
const PAT_SID_COL = PAT_SHEET_HEADERS.indexOf("Sesión");

// ── Storage / draft ────────────────────────────────────
function _patRaw(){ try{ const raw=localStorage.getItem(PAT_REC_KEY); if(!raw) return []; const a=JSON.parse(raw); return Array.isArray(a)?a:[]; }catch(_){ return []; } }
function _patSave(list){
  const ok = _lsSet(PAT_REC_KEY, JSON.stringify(list||[]));
  if(!ok && !_reclaiming) toast("❌ Este navegador NO está guardando los datos (almacenamiento lleno, en modo privado o bloqueado). Usa ☁️ Guardar y sincronizar para no perderlos.","err",7000);
  return ok;
}
// Poda Patología: igual que pruneMic/pruneCal (sincronizadas con +7 d). Consistencia.
function prunePat(){
  const now = Date.now(); const raw = _patRaw();
  const list = raw.filter(r=> !(r && r.synced && r.ts && (now - r.ts) > MIC_TTL));
  if(list.length !== raw.length) _patSave(list);
  return list;
}
function loadPat(){ return prunePat().slice().sort((a,b)=>(b.ts||0)-(a.ts||0)); }
function _patNewSid(){ return "p"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
// Clave = compuesta (Fecha+Corrida) + sid (espeja keyCols [0,2,SID]). Fechas/
// corridas/análisis distintos = sesiones separadas que se acumulan.
function patSessionKey(d){
  const comp = [d.fechaMuestreo, d.corrida].join("|");
  return d.sid ? comp + "|" + d.sid : comp;
}
function loadPatDraft(){
  const def={ meta:{ fechaMuestreo:today(), fechaResultados:"", corrida:"", responsable:"" }, rows:[] };
  try{ const raw=localStorage.getItem(PAT_DRAFT_KEY); if(raw){ const o=JSON.parse(raw); if(o && typeof o==="object")
    return { meta:Object.assign({},def.meta,o.meta||{}), rows:Array.isArray(o.rows)?o.rows:[] }; } }catch(_){}
  return def;
}
function savePatDraft(d){ _lsSet(PAT_DRAFT_KEY, JSON.stringify(d||{})); }
function collectPatDraft(){
  const prev=loadPatDraft();
  const meta=Object.assign({ fechaMuestreo:today(), fechaResultados:"", corrida:"", responsable:"" }, prev.meta||{});
  const fm=document.getElementById("pat-fm"), fr=document.getElementById("pat-fr"),
        co=document.getElementById("pat-corr"), re=document.getElementById("pat-resp");
  if(fm) meta.fechaMuestreo  = isValidDate(fm.value)?fm.value:"";
  if(fr) meta.fechaResultados= isValidDate(fr.value)?fr.value:"";
  if(co) meta.corrida        = sanitizeStr(co.value);
  if(re) meta.responsable    = sanitizeStr(re.value);
  const tbody=document.getElementById("pat-tb"); const rows=[];
  if(tbody){
    tbody.querySelectorAll("tr").forEach((tr,idx)=>{
      const fila=idx+1; const d={};
      const get=(k)=>{ const el=tr.querySelector(`[name="pat_${fila}_${k}"]`); return el?el.value:""; };
      d.muestra=sanitizeStr(get("muestra")); d.sexo=sanitizeStr(get("sexo"));
      PAT_GROUP_KEYS.forEach(k=> d[k]=sanitizeStr(get(k)));
      d.peso=sanitizeStr(get("peso")); d.obs=sanitizeStr(get("obs"));
      rows.push(d);
    });
  }
  return { meta, rows };
}
function patDraftTouch(){ clearTimeout(_patDraftTm); _patDraftTm=setTimeout(()=>{ try{ savePatDraft(collectPatDraft()); }catch(_){} }, 500); }
function patRowHasData(d){
  if(d.muestra && String(d.muestra).trim()!=="") return true;
  if(d.obs && String(d.obs).trim()!=="") return true;
  if(d.sexo) return true;
  return PAT_NUM_KEYS.some(k=> d[k]!=null && String(d[k]).trim()!=="");
}

// ── Promedios por columna ("Grado") ────────────────────
function _patAverages(rows){
  const sums={}, counts={};
  PAT_NUM_KEYS.forEach(k=>{ sums[k]=0; counts[k]=0; });
  rows.forEach(d=>{ PAT_NUM_KEYS.forEach(k=>{ const v=parseFloat(d[k]); if(isFinite(v)){ sums[k]+=v; counts[k]++; } }); });
  const avg={}; PAT_NUM_KEYS.forEach(k=>{ avg[k]= counts[k]>0 ? (Math.round((sums[k]/counts[k])*100)/100) : ""; });
  return avg;
}
function patGradoRecalc(){
  const tbody=document.getElementById("pat-tb"), foot=document.getElementById("pat-foot");
  if(!tbody || !foot) return;
  const rows=[];
  tbody.querySelectorAll("tr").forEach((tr,idx)=>{
    const fila=idx+1; const d={};
    PAT_NUM_KEYS.forEach(k=>{ const el=tr.querySelector(`[name="pat_${fila}_${k}"]`); d[k]=el?el.value:""; });
    rows.push(d);
  });
  const avg=_patAverages(rows);
  let cells=`<td class="tqc" style="background:#5b21b6!important;color:#fff;font-weight:800">Grado</td><td></td><td></td>`;
  PAT_GROUP_KEYS.forEach(k=>{ cells+=`<td style="font-weight:700;color:#5b21b6;background:#f5f3ff;text-align:center">${avg[k]===""?"—":avg[k]}</td>`; });
  cells+=`<td style="font-weight:700;color:#5b21b6;background:#f5f3ff;text-align:center">${avg.peso===""?"—":avg.peso}</td><td></td>`;
  foot.innerHTML=`<tr>${cells}</tr>`;
}

// ── Render: grilla ─────────────────────────────────────
function patRowHtml(fila, d){
  const txt=(k,w,ph)=>`<td><input class="mic-in" type="text" name="pat_${fila}_${k}" oninput="patDraftTouch()" onpaste="patGridPaste(event)" value="${escapeHtml(d[k]||"")}" placeholder="${ph||""}" style="min-width:${w}px"></td>`;
  const num=(k)=>`<td><input class="mic-in" type="text" inputmode="decimal" name="pat_${fila}_${k}" oninput="patGradoRecalc();patDraftTouch()" onpaste="patGridPaste(event)" value="${escapeHtml(d[k]||"")}" style="min-width:54px;text-align:center"></td>`;
  const sexo=`<td><select class="mic-in" name="pat_${fila}_sexo" oninput="patDraftTouch()" onpaste="patGridPaste(event)" style="min-width:80px">`
    + ["","Macho","Hembra"].map(o=>`<option value="${o}"${(d.sexo||"")===o?" selected":""}>${o||"—"}</option>`).join("") + `</select></td>`;
  let cells = txt("muestra",120,"Muestra") + sexo;
  PAT_GROUP_KEYS.forEach(k=> cells += num(k));
  cells += num("peso") + txt("obs",160,"Observaciones");
  return `<tr><td class="tqc" style="font-size:10px;min-width:30px;text-align:center">${fila}</td>${cells}</tr>`;
}
function patGridPaste(ev){
  const cd=ev.clipboardData||window.clipboardData; if(!cd) return;
  const txt=cd.getData("text"); if(!txt || (txt.indexOf("\t")===-1 && txt.indexOf("\n")===-1)) return;
  ev.preventDefault();
  const lines=txt.replace(/\r/g,"").split("\n"); if(lines.length && lines[lines.length-1]==="") lines.pop();
  const matrix=lines.map(l=>l.split("\t"));
  const t=ev.target; const tbody=document.getElementById("pat-tb"); if(!tbody) return;
  const trs=Array.from(tbody.querySelectorAll("tr"));
  const startTr=t.closest("tr"); const r0=trs.indexOf(startTr); if(r0<0) return;
  const visRow=(tr)=> Array.from(tr.querySelectorAll("input.mic-in, select.mic-in"));
  const c0=visRow(startTr).indexOf(t); if(c0<0) return;
  matrix.forEach((cells,dr)=>{
    const tr=trs[r0+dr]; if(!tr) return; const vis=visRow(tr);
    cells.forEach((raw,dc)=>{
      const el=vis[c0+dc]; if(!el) return; const val=String(raw).trim();
      if(el.tagName==="SELECT"){ const opt=Array.from(el.options).find(o=>o.value.toLowerCase()===val.toLowerCase()||(o.text||"").toLowerCase()===val.toLowerCase()); if(opt) el.value=opt.value; }
      else el.value=val;
    });
  });
  patGradoRecalc(); patDraftTouch();
}
// Navegación con flechas ←/→/↑/↓/Enter entre celdas de la grilla de Patología
// (espejo de micGridKey). Sin esto, las flechas no movían el foco entre celdas.
function patGridKey(ev){
  const k = ev.key;
  if(k!=="ArrowUp" && k!=="ArrowDown" && k!=="ArrowLeft" && k!=="ArrowRight" && k!=="Enter") return;
  const t = ev.target;
  if(!t || (t.tagName!=="INPUT" && t.tagName!=="SELECT") || !t.classList || !t.classList.contains("mic-in")) return;
  const tbody = t.closest("tbody"); if(!tbody || tbody.id !== "pat-tb") return;
  if((k==="ArrowLeft" || k==="ArrowRight") && t.tagName==="INPUT"){
    try{ const len=(t.value||"").length;
      if(k==="ArrowLeft"  && !(t.selectionStart===0   && t.selectionEnd===0))   return;
      if(k==="ArrowRight" && !(t.selectionStart===len && t.selectionEnd===len)) return;
    }catch(_){}
  }
  const trs = Array.from(tbody.querySelectorAll("tr"));
  const tr = t.closest("tr"); const r = trs.indexOf(tr);
  const visRow = (row)=> Array.from(row.querySelectorAll("input.mic-in, select.mic-in"));
  const vis = visRow(tr); const c = vis.indexOf(t);
  if(r < 0 || c < 0) return;
  const focusCell = (el)=>{ if(el && typeof el.focus==="function"){ el.focus(); if(el.tagName==="INPUT"){ try{ el.select(); }catch(_){} } } };
  if(k==="ArrowUp" || k==="ArrowDown" || k==="Enter"){
    ev.preventDefault();
    const ntr = trs[r + (k==="ArrowUp"?-1:1)]; if(!ntr) return;
    const nvis = visRow(ntr);
    focusCell(nvis[Math.min(c, nvis.length-1)]);
    return;
  }
  // horizontal
  let nc = c + (k==="ArrowLeft" ? -1 : 1);
  while(nc >= 0 && nc < vis.length && vis[nc] && vis[nc].readOnly) nc += (k==="ArrowLeft" ? -1 : 1);
  if(nc < 0 || nc >= vis.length) return;
  ev.preventDefault();
  focusCell(vis[nc]);
}
if(typeof document !== "undefined" && !window.__patKeyNav){
  window.__patKeyNav = true;
  document.addEventListener("keydown", patGridKey);
}
function renderPatNuevo(){
  const fp=document.getElementById("fp-micnuevo"); if(!fp) return;
  const draft=loadPatDraft(); const meta=draft.meta; const drows=draft.rows||[];
  const nRows=Math.min(PAT_MAX_ROWS, Math.max(PAT_DEFAULT_ROWS+_patExtra, drows.length));
  const grpHead=PAT_GROUPS.map((g,i)=>`<th colspan="${g.cols.length}" class="${i===0?'thg':i===1?'thg2':'thg3'}">${escapeHtml(g.label)}</th>`).join("");
  const subHead=PAT_GROUPS.reduce((a,g)=> a.concat(g.cols.map(c=>`<th>${escapeHtml(c.l)}</th>`)), []).join("");
  let rowsHtml=""; for(let fila=1; fila<=nRows; fila++){ rowsHtml += patRowHtml(fila, drows[fila-1]||{}); }
  const canAdd=nRows<PAT_MAX_ROWS;
  fp.innerHTML = `${micTypeBar()}<div class="fc">
    <div class="fc-h" style="background:linear-gradient(135deg,#7c3aed,#a78bfa)"><div class="fc-t">🔬 Patología en Fresco · Nuevo análisis</div>
      <span class="ssp ssp-mt">${escapeHtml(meta.fechaMuestreo||today())}</span></div>
    <div class="fc-b">
      <div class="meta">
        <div class="mf"><label>Fecha muestreo</label><input type="date" id="pat-fm" value="${escapeHtml(meta.fechaMuestreo||today())}" oninput="patDraftTouch()"></div>
        <div class="mf"><label>Fecha resultados</label><input type="date" id="pat-fr" value="${escapeHtml(meta.fechaResultados||"")}" oninput="patDraftTouch()"></div>
        <div class="mf"><label>N° Corrida (opcional)</label><input id="pat-corr" value="${escapeHtml(meta.corrida||"")}" placeholder="Opcional" oninput="patDraftTouch()" onchange="patCorridaChange()"></div>
        <div class="mf"><label>Responsable</label><input id="pat-resp" value="${escapeHtml(meta.responsable||"")}" placeholder="Analista" oninput="patDraftTouch()"></div>
      </div>
      <div style="background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:11px;color:#5b21b6;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">🔬</span>
        <span>Una fila por muestra. Valores numéricos libres. La fila <b>Grado</b> (abajo) promedia cada columna numérica, incluida <b>Peso</b> — es informativa, NO se envía a la hoja. Puedes pegar desde Excel y seleccionar rangos. Guarda antes de cambiar de pestaña.</span>
      </div>
      <div class="tw"><table class="ft" style="font-size:10.5px">
        <thead>
          <tr>
            <th class="tqh" rowspan="2" style="min-width:30px">#</th>
            <th rowspan="2">Muestra</th>
            <th rowspan="2">Sexo</th>
            ${grpHead}
            <th rowspan="2">Peso</th>
            <th rowspan="2">Observaciones</th>
          </tr>
          <tr>${subHead}</tr>
        </thead>
        <tbody id="pat-tb">${rowsHtml}</tbody>
        <tfoot id="pat-foot"></tfoot>
      </table></div>
      <div style="margin-top:8px">
        <button class="btn bo" type="button" onclick="patAddRow()" ${canAdd?"":"disabled"} style="font-size:11px;padding:4px 10px">➕ Fila</button>
      </div>
      <div class="sa" style="margin-top:12px">
        <div class="sa-info">
          <span>💾 Guarda para registrar el análisis (sin duplicados al reenviar)</span>
          <span id="pat-saved-ind" style="font-weight:600">${_patLastSavedText(meta)}</span>
        </div>
        <div class="sa-btns">
          <button class="btn bo" type="button" onclick="patNuevoReset()" title="Vaciar el análisis actual">🧹 Vaciar</button>
          <button class="btn bpdf" type="button" onclick="downloadPatPDF()">📄 PDF</button>
          <button class="btn bs" type="button" onclick="patGuardarLocal()">💾 Guardar local</button>
          <button class="btn bp" type="button" onclick="syncPat()">☁️ Guardar y sincronizar</button>
        </div>
      </div>
    </div>
  </div>`;
  patGradoRecalc();
  fixupLabels(fp);
}
function patAddRow(){
  const draft=collectPatDraft(); savePatDraft(draft);
  const cur=Math.max(PAT_DEFAULT_ROWS+_patExtra, (draft.rows||[]).length);
  if(cur>=PAT_MAX_ROWS){ toast("Máximo "+PAT_MAX_ROWS+" filas","info",2500); return; }
  _patExtra=Math.min(PAT_MAX_ROWS-PAT_DEFAULT_ROWS, (cur-PAT_DEFAULT_ROWS)+PAT_ROW_STEP);
  renderPatNuevo();
}
function patNuevoReset(){
  if(!confirm("¿Vaciar el análisis actual? Se perderá lo no guardado.")) return;
  savePatDraft({ meta:{ fechaMuestreo:today(), fechaResultados:"", corrida:"", responsable:"", sid:_patNewSid() }, rows:[] });
  _patExtra=0; renderPatNuevo(); toast("🧹 Análisis en blanco","info",1800);
}

// ── Guardar / Sincronizar ──────────────────────────────
function _patLastSavedText(meta){
  const recs=_patRaw().filter(r=> r.data && r.data.fechaMuestreo===meta.fechaMuestreo && (!meta.corrida || String(r.data.corrida)===String(meta.corrida)));
  if(!recs.length) return "○ Sin guardar localmente";
  const maxTs=Math.max.apply(null, recs.map(r=>r.ts||0));
  const allSynced=recs.every(r=>r.synced);
  return (allSynced?"✅ Sincronizado · ":"⏳ Guardado local · ")+new Date(maxTs).toLocaleString("es-EC");
}
function savePatLocal(){
  const draft=collectPatDraft(); savePatDraft(draft);
  if(!isValidDate(draft.meta.fechaMuestreo)){ toast("⚠️ Ingresa una Fecha de muestreo válida","warn",3500); return -1; }
  // Identidad de sesión: cada "Nuevo análisis" tiene un sid estable (ver Bacteriología).
  if(draft.meta.sid === undefined){ draft.meta.sid = _patNewSid(); }
  savePatDraft(draft);
  const sid = draft.meta.sid;
  const dataRows=(draft.rows||[]).filter(patRowHasData);
  const newRecords=[];
  dataRows.forEach((d,i)=>{
    const data=Object.assign({ fechaMuestreo:draft.meta.fechaMuestreo, fechaResultados:draft.meta.fechaResultados,
      corrida:draft.meta.corrida, responsable:draft.meta.responsable, fila:i+1 }, d);
    data.sid = sid;
    newRecords.push({ id:Date.now().toString(36)+Math.random().toString(36).slice(2,6), ts:Date.now(), synced:false, syncedAt:null, data });
  });
  let list=_patRaw();
  // Reemplazo espejo de la hoja: quita la sesión cuya clave coincide y re-añade.
  const newKeys = new Set(newRecords.map(r=> patSessionKey(r.data)));
  list = list.filter(r=> !(r.data && newKeys.has(patSessionKey(r.data))));
  list = list.concat(newRecords);
  const saved = newRecords.length;
  const _ok = _patSave(list);
  updateDots(); updateSyncUI(); buildGrid();
  if(!_ok) return -2;
  return saved;
}
function patGuardarLocal(){
  const n=savePatLocal();
  if(n===-2) return;
  if(n===0){ toast("No hay muestras con datos para guardar","warn",3000); return; }
  if(n>0){
    toast("💾 "+n+" muestra(s) guardada(s) en el historial","ok",2800);
    const ind=document.getElementById("pat-saved-ind"); if(ind) ind.textContent="⏳ Guardado local · "+new Date().toLocaleString("es-EC");
  }
}
function buildPatPayload(records){
  const _n=(v)=>{ const x=parseFloat(v); return isFinite(x)?x:""; };
  const rows=records.map(rec=>{
    const d=rec.data||{};
    const row=[
      isValidDate(d.fechaMuestreo||"")?d.fechaMuestreo:"",
      isValidDate(d.fechaResultados||"")?d.fechaResultados:"",
      sanitizeStr(d.corrida||""), sanitizeStr(d.responsable||""),
      sanitizeStr(d.muestra||""), sanitizeStr(d.sexo||"")
    ];
    PAT_GROUP_KEYS.forEach(k=> row.push(_n(d[k])));
    row.push(_n(d.peso), sanitizeStr(d.obs||""));
    row.push(sanitizeStr(d.sid||""));   // Sesión (última columna)
    return row;
  });
  return { sheetName:PAT_SHEET, headers:PAT_SHEET_HEADERS, rows, replaceKey:true, keyCols:[0,2,PAT_SID_COL] };
}
async function syncPat(){
  const n=savePatLocal();
  if(n<0) return;
  const url=gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script","warn"); openCfg(); return; }
  if(!isValidGasUrl(url)){ toast("URL inválida","err"); return; }
  if(!syncRateOk()) return;
  const list=_patRaw();
  const pendKeys=new Set();
  list.forEach(r=>{ if(!r.synced && r.data) pendKeys.add(patSessionKey(r.data)); });
  if(pendKeys.size===0){ toast("No hay muestras pendientes","info",2500); return; }
  const toSend=list.filter(r=> r.data && pendKeys.has(patSessionKey(r.data)));
  const payload=buildPatPayload(toSend);
  if(!payload.rows.length){ toast("No hay filas para enviar","warn",3000); return; }
  setSyncUI("pend","Enviando "+payload.rows.length+" muestra(s)…");
  const sent=await postPayload(payload, url);
  if(sent){
    const l2=_patRaw();
    l2.forEach(r=>{ if(r.data && pendKeys.has(patSessionKey(r.data))){ r.synced=true; r.syncedAt=Date.now(); } });
    _patSave(l2);
    setSyncUI("ok", payload.rows.length+" muestra(s) sincronizada(s) ✔");
    toast("✅ "+payload.rows.length+" muestra(s) enviadas a Patología en Fresco (sesión reemplazada)","ok",4500);
    const ind=document.getElementById("pat-saved-ind"); if(ind) ind.textContent="✅ Sincronizado · "+new Date().toLocaleString("es-EC");
    setTimeout(()=> setSyncUI("idle","Todo sincronizado"), 3500);
  } else {
    setSyncUI("err","Error al sincronizar Patología en Fresco");
    toast("No fue posible sincronizar con Google Sheets","err",4500);
  }
  updateDots(); updateSyncUI(); buildGrid();
  if(curTab==="michist" && micTypeGet()==="pat") renderPatHist();
}

// ── Historial ──────────────────────────────────────────
function renderPatHist(){
  const fp=document.getElementById("fp-michist"); if(!fp) return;
  const list=loadPat();
  const groups={};
  list.forEach(r=>{ const k=patSessionKey(r.data); (groups[k]=groups[k]||[]).push(r); });
  const keys=Object.keys(groups).sort((a,b)=> Math.max(...groups[b].map(r=>r.ts||0)) - Math.max(...groups[a].map(r=>r.ts||0)));
  if(keys.length===0){
    fp.innerHTML=`${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">📜 Historial · Patología en Fresco</div><span class="ssp ssp-mt">0 sesiones</span></div>
      <div class="fc-b"><div class="hist-empty"><span class="hist-empty-ico">📜</span>Aún no hay análisis guardados.<br><small style="opacity:.75;display:block;margin-top:6px">Guarda un análisis en <b>Nuevo análisis</b> para verlo aquí.</small></div></div></div>`;
    return;
  }
  const cards=keys.map(k=>{
    const rs=groups[k]; const d=rs[0].data; const pend=rs.some(r=>!r.synced);
    return `<div class="mad-item">
      <div class="mad-item-body">
        <div class="mad-item-title">
          <span><b>📅 ${escapeHtml(d.fechaMuestreo||"—")}</b></span>
          ${d.corrida?`<span class="bit-tag mod">Corrida ${escapeHtml(String(d.corrida))}</span>`:""}
          <span class="bit-tag sis">Patología en Fresco</span>
          ${pend?'<span class="ssp ssp-pend">⏳ Pendiente</span>':'<span class="ssp ssp-ok">✅ Sincronizado</span>'}
        </div>
        <div class="mad-item-meta">
          <span><b>Muestras:</b> ${rs.length}</span>
          ${d.responsable?`<span><b>Responsable:</b> ${escapeHtml(d.responsable)}</span>`:""}
        </div>
      </div>
      <div class="mad-item-actions">
        <button class="alg-hist-edit" onclick="patEditSession('${escapeHtml(k)}')" title="Cargar en Nuevo análisis para editar">✏️</button>
        <button class="alg-hist-del" onclick="patDeleteSession('${escapeHtml(k)}')" title="Eliminar del historial local (no afecta a Google Sheets)">🗑</button>
      </div>
    </div>`;
  }).join("");
  fp.innerHTML=`${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">📜 Historial · Patología en Fresco</div><span class="ssp ssp-mt">${keys.length} sesión(es)</span></div>
    <div class="fc-b"><div class="mad-list">${cards}</div>
    <div style="margin-top:10px;font-size:10.5px;color:var(--tx3)">ℹ️ Cada <b>Nuevo análisis</b> que guardes es una <b>sesión separada</b> (puedes registrar varios el mismo día/corrida). Para empezar otro, usa <b>🧹 Análisis en blanco</b>. <b>✏️</b> editar y re-guardar actualiza la sesión; <b>🗑</b> borra <b>solo del historial local</b> (no afecta a Google Sheets).</div></div></div>`;
}
function patEditSession(k){
  const list=loadPat(); const rs=list.filter(r=> patSessionKey(r.data)===k);
  if(!rs.length){ toast("Sesión no encontrada","warn"); return; }
  const d0=rs[0].data;
  const rows=rs.slice().sort((a,b)=>(parseInt(a.data.fila)||0)-(parseInt(b.data.fila)||0)).map(r=>{
    const d=r.data; const row={ muestra:d.muestra||"", sexo:d.sexo||"", peso:(d.peso!=null?String(d.peso):""), obs:d.obs||"" };
    PAT_GROUP_KEYS.forEach(k2=> row[k2]=(d[k2]!=null?String(d[k2]):""));
    return row;
  });
  const _pdraft={ meta:{ fechaMuestreo:d0.fechaMuestreo, fechaResultados:d0.fechaResultados||"", corrida:d0.corrida||"", responsable:d0.responsable||"" }, rows };
  _pdraft.meta.sid = d0.sid || "";   // "" = sesión heredada (clave compuesta sin sid)
  savePatDraft(_pdraft);
  _patExtra=0;
  micTypeSet("pat"); selTab("micnuevo"); renderPatNuevo();
  toast("✏️ Sesión cargada en Nuevo análisis · edita y guarda/sincroniza para actualizar","ok",5000);
}
function patDeleteSession(k){
  // Borra SOLO del historial local (como Larvicultura). Lo ya enviado a Google
  // Sheets NO se toca.
  const list=_patRaw(); const rs=list.filter(r=> patSessionKey(r.data)===k);
  if(!rs.length) return;
  if(!confirm("¿Eliminar esta sesión del historial local ("+rs.length+" muestra(s))?\nSolo se borra del sistema; lo ya enviado a Google Sheets NO se elimina.")) return;
  _patSave(list.filter(r=> patSessionKey(r.data)!==k));
  renderPatHist(); updateDots(); updateSyncUI(); buildGrid();
  toast("🗑 Sesión eliminada del historial local","ok",3000);
}

// ── Vista Factores (no aplica) ─────────────────────────
function renderPatFact(){
  const fp=document.getElementById("fp-micfact"); if(!fp) return;
  fp.innerHTML=`${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">✖️ Factores</div></div>
    <div class="fc-b"><div class="hist-empty"><span class="hist-empty-ico">🔬</span><b>Patología en Fresco</b> no usa factores ni umbrales.<br><small style="opacity:.75;display:block;margin-top:6px">Los valores se promedian directamente en la fila <b>Grado</b>.</small></div></div></div>`;
}

// ── Vista Reporte + PDF ────────────────────────────────
function _patReportTable(rows){
  const avg=_patAverages(rows);
  const grpHead=PAT_GROUPS.map((g,i)=>`<th colspan="${g.cols.length}" class="${i===0?'thg':i===1?'thg2':'thg3'}">${escapeHtml(g.label)}</th>`).join("");
  const subHead=PAT_GROUPS.reduce((a,g)=> a.concat(g.cols.map(c=>`<th>${escapeHtml(c.l)}</th>`)), []).join("");
  const cell=(v)=>(v!==undefined && v!=="" && v!==null)?escapeHtml(String(v)):"—";
  const trs=rows.map((d,i)=>{
    let cs=`<td>${cell(d.muestra)}</td><td>${cell(d.sexo)}</td>`;
    PAT_GROUP_KEYS.forEach(k=> cs+=`<td>${cell(d[k])}</td>`);
    cs+=`<td>${cell(d.peso)}</td><td style="text-align:left">${cell(d.obs)}</td>`;
    return `<tr><td class="tqc">${i+1}</td>${cs}</tr>`;
  }).join("");
  let g=`<td class="tqc" style="background:#5b21b6!important;color:#fff">Grado</td><td></td><td></td>`;
  PAT_GROUP_KEYS.forEach(k=> g+=`<td style="font-weight:700;color:#5b21b6;background:#f5f3ff;text-align:center">${avg[k]===""?"—":avg[k]}</td>`);
  g+=`<td style="font-weight:700;color:#5b21b6;background:#f5f3ff;text-align:center">${avg.peso===""?"—":avg.peso}</td><td></td>`;
  return `<div class="tw"><table class="ft" style="font-size:10.5px"><thead>
    <tr><th class="tqh" rowspan="2">#</th><th rowspan="2">Muestra</th><th rowspan="2">Sexo</th>${grpHead}<th rowspan="2">Peso</th><th rowspan="2">Observaciones</th></tr>
    <tr>${subHead}</tr></thead><tbody>${trs}</tbody><tfoot><tr>${g}</tr></tfoot></table></div>`;
}
function renderPatReporte(){
  const fp=document.getElementById("fp-micrep"); if(!fp) return;
  const draft=loadPatDraft();
  const rows=(draft.rows||[]).filter(patRowHasData);
  const body=rows.length ? _patReportTable(rows)
    : `<div class="hist-empty"><span class="hist-empty-ico">📊</span>Sin datos en el análisis actual. Llena el <b>Nuevo análisis</b> para ver el reporte.</div>`;
  fp.innerHTML=`${micTypeBar()}<div class="fc"><div class="fc-h"><div class="fc-t">📊 Reporte · Patología en Fresco</div>
      <div class="sa-btns"><button class="btn bpdf" type="button" onclick="downloadPatPDF()">📄 PDF</button></div></div>
    <div class="fc-b"><div style="font-size:10.5px;color:var(--tx3);margin-bottom:8px">Refleja el <b>Nuevo análisis</b> actual. La fila <b>Grado</b> es el promedio por columna (incluida Peso).</div>${body}</div></div>`;
}
function downloadPatPDF(){
  const draft=loadPatDraft(); const meta=draft.meta;
  const rows=(draft.rows||[]).filter(patRowHasData);
  if(!rows.length){ toast("Sin datos para el PDF","warn"); return; }
  const tsStr=new Date().toLocaleString("es-EC",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  const codigo=genCodigo("patnuevo", MIC_MOD, meta.fechaMuestreo||today());
  const avg=_patAverages(rows);
  const grpHead=PAT_GROUPS.map((g,i)=>`<th colspan="${g.cols.length}" class="${i===0?'thg':i===1?'thg2':'thg3'}">${escapeHtml(g.label)}</th>`).join("");
  const subHead=PAT_GROUPS.reduce((a,g)=> a.concat(g.cols.map(c=>`<th>${escapeHtml(c.l)}</th>`)), []).join("");
  const pc=(v)=>(v!==undefined && v!=="" && v!==null)?escapeHtml(String(v)):'<span class="empty">—</span>';
  const trs=rows.map((d,i)=>{
    let cs=`<td>${pc(d.muestra)}</td><td>${pc(d.sexo)}</td>`;
    PAT_GROUP_KEYS.forEach(k=> cs+=`<td>${pc(d[k])}</td>`);
    cs+=`<td>${pc(d.peso)}</td><td style="text-align:left">${pc(d.obs)}</td>`;
    return `<tr><td class="tqc">${i+1}</td>${cs}</tr>`;
  }).join("");
  let gc=`<td class="tqc" style="background:#5b21b6!important">Grado</td><td></td><td></td>`;
  PAT_GROUP_KEYS.forEach(k=> gc+=`<td>${avg[k]===""?"—":avg[k]}</td>`);
  gc+=`<td>${avg.peso===""?"—":avg.peso}</td><td></td>`;
  const table=`<table><thead>
      <tr><th rowspan="2">#</th><th rowspan="2">Muestra</th><th rowspan="2">Sexo</th>${grpHead}<th rowspan="2">Peso</th><th rowspan="2">Observaciones</th></tr>
      <tr>${subHead}</tr></thead><tbody>${trs}</tbody><tfoot><tr>${gc}</tr></tfoot></table>`;
  const fileName="PATFRESCO_"+(meta.fechaMuestreo||today()).replace(/-/g,"")+(meta.corrida?"_"+sanitizeStr(meta.corrida):"");
  const head=`<div class="ph"><div class="ph-brand"><div class="co">OMARSA · Patología en Fresco</div><div class="su">Análisis de patología en fresco</div></div>
    <div class="ph-center"><span class="doc-code">OMR-PAT</span></div>
    <div class="ph-right"><div class="mod">Pat</div><div class="mods">Patología</div></div></div>
    <div class="mgrid"><div class="mf"><label>Fecha muestreo</label><span>${escapeHtml(meta.fechaMuestreo||today())}</span></div>
      <div class="mf"><label>Fecha resultados</label><span>${escapeHtml(meta.fechaResultados||"—")}</span></div>
      <div class="mf"><label>Corrida</label><span>${escapeHtml(String(meta.corrida||"—"))}</span></div>
      <div class="mf"><label>Responsable</label><span>${escapeHtml(meta.responsable||"—")}</span></div></div>`;
  const foot=`<div class="pfoot"><div><div style="font-size:6pt;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Código verificador</div>
      <div class="code-box">${codigo}</div><div class="ts-txt" style="margin-top:2px">Generado el ${escapeHtml(tsStr)}</div></div>
    <div style="text-align:center;min-width:140px"><div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">${escapeHtml(meta.responsable||"Responsable")}</div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Analista</div></div></div>`;
  const page=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${escapeHtml(fileName)}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"><style>${pdfCss('params')}tfoot td{background:#f5f3ff!important;font-weight:800;color:#5b21b6}</style></head><body>
    <div class="ppage">${head}${table}<div class="spacer"></div>${foot}</div>
    <script>try{document.title=${JSON.stringify(fileName)};}catch(_){}var _p=false;function dp(){if(_p)return;_p=true;setTimeout(function(){window.print();},350);}if(document.readyState==='complete')dp();else window.addEventListener('load',dp,{once:true});<\/script></body></html>`;
  const w=window.open("","_blank","width=1100,height=720");
  if(!w){ toast("El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.","warn",6000); return; }
  w.document.write(page); w.document.close(); try{ w.document.title=fileName; }catch(_){}
  toast("📄 PDF: "+fileName,"ok",5000);
}


let _gasCache = null;
function GAS(){
  if(_gasCache !== null) return _gasCache;
  _gasCache = `// ════════════════════════════════════════════════════════
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
const EV_FOLDER_ID = "${EV_FOLDER_ID}";
const EV_TOKEN     = "${EV_TOKEN}";
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
  algas:   { maxRows: 500, maxCols: 20 },
  mad:     { maxRows: 500, maxCols: 25 },
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
    var isMad   = madKeyCols !== null;
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
    if (isMicro || isCal || isPat) ensureHeaders(ws, payload.headers || []);

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
    //   • Lab_Algas: UPSERT por (Fecha, Corrida_Larv, Modulo_Larv, Area_Algas, Sistema, Lote, Dia_Proceso).
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
      result = upsertMadRows(ws, rows, madKeyCols);
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
// Borra TODAS las filas cuya columna \`dateCol\` coincide con \`dateStr\`
// (yyyy-MM-dd) y luego agrega \`newRows\`. Permite "pegar y sincronizar" un día
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
// HTML las secuencias \\d colapsarían); la normalización de fecha la hace
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

// ── Upsert Lab_Algas ──────────────────────────────────────
// Clave compuesta: Fecha | Corrida_Larv | Modulo_Larv | Area_Algas |
//                  Sistema | Lote | Dia_Proceso (cols 0..6).
//   - Si la clave coincide con una fila ya existente, se hace merge:
//     cada columna NO clave se reemplaza por el nuevo valor (si no está vacío)
//     o se conserva el valor anterior cuando el nuevo viene vacío.
//   - Si no existe la clave, la fila se añade al final.
// Esto permite que al editar un registro desde la Bitácora (o desde el
// Historial pendiente) y volver a sincronizar, NO se duplique la fila en
// Sheets — la información existente se actualiza en sitio.
// IMPORTANTE: Sistema/Lote/Dia_Proceso forman parte de la clave porque varios
// registros del MISMO día/corrida/módulo/área pero distinto sistema (FM, FP,
// M1…, PBR…), lote o día de proceso son registros DISTINTOS. Antes la clave
// sólo usaba cols 0..3, por lo que esos registros colapsaban en una sola fila
// (sólo sobrevivía el último valor de cada campo) al sincronizar el historial.
function upsertAlgasRows(ws, newRows) {
  var lastR = ws.getLastRow();
  var data  = ws.getDataRange().getValues();
  var map   = {};
  for (var i = 1; i < data.length; i++) {
    var k = algasRowKey(data[i]);
    if (k) map[k] = { row: i + 1, idx: i };
  }
  var keySet     = {0:1, 1:1, 2:1, 3:1, 4:1, 5:1, 6:1};
  var toAdd      = [];
  var updated    = 0;
  var pendingMap = {};
  for (var r = 0; r < newRows.length; r++) {
    var nr    = newRows[r];
    var k2    = algasInKey(nr);
    var entry = map[k2];
    if (entry && entry.row > 0) {
      // ── Fila existente: merge campo a campo ─────────────
      var ex     = data[entry.idx];
      var nc     = Math.max(ex.length, nr.length);
      var merged = [];
      for (var c = 0; c < nc; c++) {
        var e      = c < ex.length ? ex[c] : "";
        var n      = c < nr.length ? nr[c] : "";
        var nEmpty = (n === "" || n === null || n === undefined);
        if (keySet[c]) {
          // Las columnas clave preservan el valor previo (son la identidad)
          merged.push((e === "" || e === null || e === undefined) ? n : e);
        } else {
          // Las columnas de datos toman el nuevo valor; si viene vacío,
          // conserva el anterior (no se borra accidentalmente).
          merged.push(nEmpty ? e : n);
        }
      }
      ws.getRange(entry.row, 1, 1, merged.length).setValues([merged]);
      fmtData(ws, entry.row, 1, merged.length, false);
      updated++;
    } else if (pendingMap[k2] !== undefined) {
      // ── Clave duplicada dentro del mismo batch: fusionar ──
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
    var nc2 = toAdd[0].length;
    ws.getRange(startRow, 1, toAdd.length, nc2).setValues(toAdd);
    fmtData(ws, startRow, toAdd.length, nc2, false);
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
function upsertMadRows(ws, newRows, keyCols) {
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
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
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
  return ContentService.createTextOutput("FichasLarv-OK");
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
    + "<\\/script></body></html>";
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
// Valida fecha YYYY-MM-DD sin regex (los escapes \\d colapsan dentro del GAS).
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
    + "<\\/script></body></html>";
  return HtmlService.createHtmlOutput(h)
    .setTitle("Evidencias Larvicultura")
    .addMetaTag("viewport", "width=device-width,initial-scale=1");
}

// ── Respuesta JSON ────────────────────────────────────────
function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}`;
  return _gasCache;
}

function openCfg(){
  // Muestra la URL efectiva: la guardada por el usuario o, si no hay, la anclada.
  document.getElementById("cfg-url").value     = gcfg("gas-url","") || DEFAULT_GAS_URL;
  document.getElementById("cfg-token").value   = gcfg("gas-token","");
  document.getElementById("cfg-tec").value     = gcfg("tec","");
  document.getElementById("gas-code").value    = GAS();
  document.getElementById("cfg-ov").classList.add("open");
}
function closeCfg(){ document.getElementById("cfg-ov").classList.remove("open"); }
function closeCfgOut(ev){ if(ev.target===document.getElementById("cfg-ov")) closeCfg(); }
function saveCfg(){
  const url    = document.getElementById("cfg-url").value.trim();
  if(url    && !isValidGasUrl(url))   { toast("URL inválida","warn"); return; }
  // Token compartido: cualquier cadena no vacía es válida (la validación
  // efectiva ocurre del lado del GAS). Se sanea para evitar caracteres de
  // control u overflow; se almacena obfuscado vía scfg (clave sensible).
  const tokenIn = sanitizeStr(document.getElementById("cfg-token").value);
  scfg("gas-url",     url);
  scfg("gas-token",   tokenIn);
  scfg("tec", sanitizeStr(document.getElementById("cfg-tec").value));
  closeCfg(); toast("Configuración guardada","ok");
}

// Returns the GAS URL — single URL for all modules. Si el usuario no guardó una
// propia en Config, usa la URL ANCLADA en código (DEFAULT_GAS_URL) → la app
// sincroniza out-of-the-box sin pegar nada. Una URL guardada la sobrescribe.
function gasUrl(){
  const u = gcfg("gas-url","");
  return (u && u.trim()) ? u : DEFAULT_GAS_URL;
}

async function testConn(){
  const url = document.getElementById("cfg-url").value.trim();
  if(!url){ toast("Ingresa la URL primero","warn"); return; }
  if(!isValidGasUrl(url)){ toast("URL inválida","warn"); return; }
  toast("Probando conexión…","info",2000);
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 8000);
    const r = await fetch(url, {signal: ctrl.signal});
    clearTimeout(timer);
    const t = await r.text();
    // doGet() del GAS responde exactamente "FichasLarv-OK"; validar esa cadena
    // (no un "OK" genérico) evita falsos positivos con páginas de error/login
    // de Google que pudieran contener "OK" en su HTML.
    t.includes("FichasLarv-OK")
      ? toast("✅ Conexión exitosa","ok")
      : toast("Respuesta: " + t.slice(0,80),"warn");
  }catch(x){
    toast(x.name==="AbortError" ? "Tiempo de espera agotado" : "Error de conexión","err");
  }
}


/* ══════════════════════════════════════════
   FOTOS + VIDEOS — por módulo (24h TTL)
   Storage: FPRE + mLabel(m) + "_" + id
   Max FMAX medios por módulo, auto-borrar a 24h
   Fotos: canvas 900px JPEG q=0.76
   Videos: máx 30s, máx 2MB, almacenados como dataURL
══════════════════════════════════════════ */
const VMAX_SEC = 30;   // max video duration seconds
const VMAX_BYTES = 2 * 1024 * 1024; // max video file size 2MB

function fotoKey(m, id){ return FPRE + mLabel(m) + "_" + id; }

// ── Caché en memoria para listFotos ────────────────────────────────────
// listFotos() escanea TODO localStorage; en dispositivos con muchas claves
// es costoso, y renderFotos() lo invoca varias veces seguidas (apertura
// del tab, edición de nota, etc.). El caché por módulo con TTL corto
// (5s) elimina escaneos redundantes sin perder consistencia: cualquier
// mutación (saveMedia, deleteFoto, saveNota) lo invalida explícitamente.
const _fotosCache = new Map();
const _FOTOS_CACHE_TTL = 5000;
function _invalidateFotosCache(){ _fotosCache.clear(); }

function listFotos(m){
  const cacheKey = mLabel(m);
  const cached = _fotosCache.get(cacheKey);
  if(cached && (Date.now() - cached.ts) < _FOTOS_CACHE_TTL){
    // Copia defensiva: el caller podría mutar el array.
    return cached.list.slice();
  }
  const prefix = FPRE + cacheKey + "_";
  const now = Date.now();
  const list = [];
  const toRemove = [];
  for(let i=0; i<localStorage.length; i++){
    const k = localStorage.key(i);
    if(!k || !k.startsWith(prefix)) continue;
    try{
      const e = JSON.parse(localStorage.getItem(k));
      if(!e || !e.ts) { toRemove.push(k); continue; }
      if(now - e.ts > FTTL){ toRemove.push(k); continue; }
      list.push({key:k, ...e});
    }catch(x){ toRemove.push(k); }
  }
  toRemove.forEach(k=>localStorage.removeItem(k));
  list.sort((a,b)=>b.ts-a.ts);
  _fotosCache.set(cacheKey, { ts: Date.now(), list });
  return list.slice();
}

// ── Purga de fotos vencidas en TODOS los módulos ──────────────────────
// Complementa cleanup() (que sólo corre al arranque): se ejecuta también
// cuando el usuario sale de un módulo (goBack), evitando que medios
// vencidos en módulos no visitados sigan ocupando localStorage durante
// sesiones largas. Es idempotente y silenciosa.
function purgeExpiredFotosAllModules(){
  const now = Date.now();
  const toRemove = [];
  for(let i=0; i<localStorage.length; i++){
    const k = localStorage.key(i);
    if(!k || !k.startsWith(FPRE)) continue;
    try{
      const e = JSON.parse(localStorage.getItem(k));
      if(!e || !e.ts || (now - e.ts) > FTTL) toRemove.push(k);
    }catch(_){ toRemove.push(k); }
  }
  if(toRemove.length){
    toRemove.forEach(k => localStorage.removeItem(k));
    _invalidateFotosCache();
  }
}

// Estima el espacio actual ocupado en localStorage (UTF-16 → 2 bytes/char).
// Heurística suficiente para detección temprana de "cerca del límite"; no
// reemplaza el manejo robusto de QuotaExceededError dentro de safeSetItem.
function _estimateLocalStorageBytes(){
  let total = 0;
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if(!k) continue;
    try{
      const v = localStorage.getItem(k);
      total += (k.length + (v ? v.length : 0)) * 2;
    }catch(_){}
  }
  return total;
}

function saveMedia(m, dataUrl, nota, type){
  const fotos = listFotos(m);
  if(fotos.length >= FMAX){
    toast("Límite de "+FMAX+" medios alcanzado. Elimina alguno primero.","warn"); return false;
  }
  // ── Aviso preventivo de cuota para VIDEOS (los más pesados) ─────────
  // Safari históricamente limita localStorage a ~10 MB por origen. Un
  // video de ~2 MB se vuelve ~2.7 MB tras base64, así que llegar al
  // umbral conservador de 9 MB es factible con 3-4 videos + fichas +
  // historial. Aviso NO bloquea — el usuario decide si proceder; si la
  // cuota se agota durante safeSetItem, la cascada de purga intentará
  // liberar espacio automáticamente.
  if((type||"image") === "video"){
    const cur = _estimateLocalStorageBytes();
    const projected = cur + (dataUrl ? dataUrl.length * 2 : 0);
    if(projected > 9 * 1024 * 1024){
      const mb = (cur / (1024*1024)).toFixed(1);
      toast("⚠ Almacenamiento local ~"+mb+" MB — añadir este video puede exceder el límite del navegador. Exporta backup y elimina fotos viejas si falla.","warn",6000);
    }
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const entry = { ts: Date.now(), nota: sanitizeStr(nota||""), img: dataUrl, type: type||"image" };
  const ok = safeSetItem(fotoKey(m,id), JSON.stringify(entry), {
    errorMsg: "No se pudo guardar (espacio insuficiente). Intenta eliminar otros medios."
  });
  if(ok) _invalidateFotosCache();
  return ok;
}

function deleteFoto(key){
  if(!key.startsWith(FPRE)) return;
  localStorage.removeItem(key);
  _invalidateFotosCache();
  renderFotos();
  toast("Eliminado","ok",2000);
}

function saveNota(key, val){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return;
    const e = JSON.parse(raw);
    e.nota = sanitizeStr(val);
    localStorage.setItem(key, JSON.stringify(e));
    _invalidateFotosCache();
  }catch(x){}
}

// ── Compresión de imagen ──────────────────
function compressImage(file, cb){
  const MAX  = 900;
  const QUAL = 0.76;
  const reader = new FileReader();
  reader.onerror = ()=>toast("No se pudo leer la imagen","err");
  reader.onload = ev=>{
    const img = new Image();
    img.onerror = ()=>toast("Imagen inválida o corrupta","err");
    img.onload = ()=>{
      let w = img.width, h = img.height;
      if(w > MAX || h > MAX){
        if(w >= h){ h = Math.round(h * MAX/w); w = MAX; }
        else       { w = Math.round(w * MAX/h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL("image/jpeg", QUAL));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Validación y lectura de video ─────────
function processVideo(file, cb){
  if(file.size > VMAX_BYTES){
    const sizeMB = (file.size / (1024*1024)).toFixed(1);
    toast("Video demasiado grande ("+sizeMB+" MB). Máximo 2 MB.","warn",5000);
    return;
  }
  const url = URL.createObjectURL(file);
  const vid = document.createElement("video");
  vid.preload = "metadata";
  vid.onloadedmetadata = ()=>{
    URL.revokeObjectURL(url);
    if(vid.duration > VMAX_SEC + 1){
      toast("Video demasiado largo ("+Math.round(vid.duration)+"s). Máximo "+VMAX_SEC+" segundos.","warn",5000);
      return;
    }
    // Read as dataURL
    const reader = new FileReader();
    reader.onerror = ()=>toast("No se pudo leer el video","err");
    reader.onload = ev => cb(ev.target.result);
    reader.readAsDataURL(file);
  };
  vid.onerror = ()=>{
    URL.revokeObjectURL(url);
    toast("Video inválido o formato no soportado","err");
  };
  vid.src = url;
}

// ── Abrir cámara / selector (fotos) ──────
function openCamera(){
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*";
  inp.setAttribute("capture","environment");
  inp.onchange = e=>{
    const file = e.target.files[0];
    if(!file) return;
    compressImage(file, dataUrl=>{
      if(saveMedia(curMod, dataUrl, "", "image")){
        renderFotos();
        toast("Foto guardada — válida por 24 h","ok",3500);
      }
    });
  };
  inp.click();
}

// ── Grabar / seleccionar video ────────────
function openVideoCapture(){
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "video/*";
  inp.setAttribute("capture","environment");
  inp.onchange = e=>{
    const file = e.target.files[0];
    if(!file) return;
    toast("Procesando video…","info",2000);
    processVideo(file, dataUrl=>{
      if(saveMedia(curMod, dataUrl, "", "video")){
        renderFotos();
        toast("Video guardado — válido por 24 h","ok",3500);
      }
    });
  };
  inp.click();
}

// ── Lightbox (imagen o video) ────────────
function openLb(src, type){
  const imgEl = document.getElementById("foto-lb-img");
  const vidEl = document.getElementById("foto-lb-vid");
  if(type === "video"){
    imgEl.style.display = "none";
    vidEl.style.display = "block";
    vidEl.src = src;
  } else {
    vidEl.style.display = "none";
    vidEl.src = "";
    imgEl.style.display = "block";
    imgEl.src = src;
  }
  document.getElementById("foto-lb").classList.add("on");
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", _lbKeyHandler);
}
function _lbKeyHandler(e){
  if(e.key === "Escape") closeLb();
}
function closeLb(){
  document.removeEventListener("keydown", _lbKeyHandler);
  const lb = document.getElementById("foto-lb");
  if(lb) lb.classList.remove("on");
  const imgEl = document.getElementById("foto-lb-img");
  if(imgEl){ imgEl.src = ""; imgEl.style.display = "none"; }
  const vidEl = document.getElementById("foto-lb-vid");
  if(vidEl){
    try{ vidEl.pause(); }catch(_){ /* el elemento puede no haber cargado aún */ }
    vidEl.src = "";
    vidEl.style.display = "none";
  }
  document.body.style.overflow = "";
}
function openLbKey(key){
  try{
    const e = JSON.parse(localStorage.getItem(key));
    if(e && e.img) openLb(e.img, e.type||"image");
  }catch(x){}
}

// ── Render tab Fotos + Videos ───────────
/* ══════════════════════════════════════════
   EVIDENCIAS por QR (Fase 1) — Larvicultura M01-M10 + CIO
   Reemplaza la pestaña Fotos local: muestra un QR (por módulo) que abre el
   portal servido por el GAS para subir fotos a Drive (Módulo/Fecha/Corrida/
   Tanque). El QR se genera con una librería liviana cargada bajo demanda; sin
   internet se muestra el enlace y el botón "Abrir portal". El resto de módulos
   conserva el guardado de medios local.
══════════════════════════════════════════ */
function _evModParam(){ return (curMod === CIO_MOD) ? "CIO" : String(curMod); }
function evPortalUrl(){
  const u = gasUrl(); if(!u) return "";
  return u + (u.indexOf("?") === -1 ? "?" : "&") +
    "p=ev&t=" + encodeURIComponent(EV_TOKEN) + "&m=" + encodeURIComponent(_evModParam());
}
function evCopyUrl(){
  const u = evPortalUrl(); if(!u) return;
  try{ navigator.clipboard.writeText(u); toast("🔗 Enlace copiado","ok",2000); }
  catch(_){ toast("Copia manual el enlace de abajo","info",2500); }
}
// F3: portal de DESCARGA de PDFs del día (?p=pdf). Mismo token; solo descarga (los
// PDFs los pone la app con "📤 Compartir PDF" desde cada ficha; aquí se bajan en otro equipo).
function evPdfUrl(){
  const u = gasUrl(); if(!u) return "";
  return u + (u.indexOf("?") === -1 ? "?" : "&") +
    "p=pdf&t=" + encodeURIComponent(EV_TOKEN) + "&m=" + encodeURIComponent(_evModParam());
}
function evPdfCopyUrl(){
  const u = evPdfUrl(); if(!u) return;
  try{ navigator.clipboard.writeText(u); toast("🔗 Enlace de PDFs copiado","ok",2000); }
  catch(_){ toast("Copia manual el enlace de abajo","info",2500); }
}
// La librería QR va EMBEBIDA (bloque <script> propio arriba) → 100% offline,
// sin CDN. cb(false) si está disponible; cb(true) activa el respaldo por enlace.
function _ensureQr(cb){ cb(typeof window.qrcode !== "function"); }
function _evRenderQr(text, elId){
  _ensureQr(function(failed){
    const el = document.getElementById(elId || "ev-qr"); if(!el) return;
    if(failed || !window.qrcode){ el.innerHTML = '<div style="color:#64748b;font-size:11px;padding:24px 8px">QR no disponible sin internet.<br>Usa “Abrir portal” o el enlace de abajo.</div>'; return; }
    try{ const qr = qrcode(0,"M"); qr.addData(text); qr.make(); el.innerHTML = qr.createImgTag(5,8); }
    catch(_){ el.innerHTML = '<div style="color:#64748b;font-size:11px;padding:24px 8px">No se pudo generar el QR. Usa el enlace de abajo.</div>'; }
  });
}
function renderEvidenciaPortal(fp){
  const url = evPortalUrl();
  const modLbl = mLabel(curMod);
  const folder = "https://drive.google.com/drive/folders/" + EV_FOLDER_ID;
  fp.innerHTML = `<div class="fc">
    <div class="fc-h"><div class="fc-t">📷 Evidencias · ${escapeHtml(modLbl)}</div>
      <span class="ssp ssp-mt">Subida por QR a Drive</span></div>
    <div class="fc-b">` + (url ? `
      <div style="text-align:center">
        <div id="ev-qr" style="display:inline-block;background:#fff;padding:12px;border-radius:12px;min-height:150px;min-width:150px"></div>
        <div style="font-size:12px;color:var(--tx3);margin-top:8px">Escanea con el teléfono para subir fotos de <b>${escapeHtml(modLbl)}</b></div>
      </div>
      <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:8px;padding:10px 12px;margin:12px 0;font-size:12px;color:#075985;line-height:1.6">
        📲 En el teléfono eliges <b>Módulo · Fecha · Corrida · Tanque</b> y tomas <b>una o varias fotos</b>. Se guardan solas en Google Drive, organizadas por Módulo/Fecha/Corrida/Tanque. Ya no ocupa el almacenamiento del dispositivo.
      </div>
      <div class="sa-btns" style="justify-content:center;flex-wrap:wrap;gap:8px">
        <button class="btn bp" type="button" onclick="window.open(evPortalUrl(),'_blank')">⬆️ Abrir portal de subida</button>
        <button class="btn bs" type="button" onclick="openEvGallery()">🖼️ Ver galería</button>
        <button class="btn bo" type="button" onclick="evCopyUrl()">🔗 Copiar enlace</button>
        <button class="btn bo" type="button" onclick="window.open('${folder}','_blank')">📁 Ver carpeta en Drive</button>
      </div>
      <div style="font-size:10px;color:var(--tx3);margin-top:10px;word-break:break-all">${escapeHtml(url)}</div>
    ` : `
      <div class="foto-empty"><span class="foto-empty-ico">⚙️</span>
        Configura primero la <b>URL de Google Apps Script</b> en ⚙ Config para generar el QR de evidencias.</div>
    `) + `</div>
  </div>` + (url ? `
  <div class="fc" style="margin-top:12px">
    <div class="fc-h"><div class="fc-t">📄 PDFs del día</div>
      <span class="ssp ssp-mt">Descarga por QR</span></div>
    <div class="fc-b">
      <div style="text-align:center">
        <div id="evpdf-qr" style="display:inline-block;background:#fff;padding:12px;border-radius:12px;min-height:150px;min-width:150px"></div>
        <div style="font-size:12px;color:var(--tx3);margin-top:8px">Escanea para <b>descargar</b> en otro dispositivo los PDFs compartidos</div>
      </div>
      <div style="background:#fefce8;border:1.5px solid #fde68a;border-radius:8px;padding:10px 12px;margin:12px 0;font-size:12px;color:#854d0e;line-height:1.6">
        📄 En cada ficha usa <b>📤 Compartir PDF</b>: el sistema genera el PDF y lo deja en Google Drive (<b>PDFs/Fecha</b>). Cualquier equipo que escanee este QR puede <b>descargarlo</b> sin instalar nada — útil para enviar la ficha a otra persona.
      </div>
      <div class="sa-btns" style="justify-content:center;flex-wrap:wrap;gap:8px">
        <button class="btn bp" type="button" onclick="window.open(evPdfUrl(),'_blank')">📥 Abrir descargas de PDF</button>
        <button class="btn bo" type="button" onclick="evPdfCopyUrl()">🔗 Copiar enlace</button>
      </div>
      <div style="font-size:10px;color:var(--tx3);margin-top:10px;word-break:break-all">${escapeHtml(evPdfUrl())}</div>
    </div>
  </div>` : ``);
  if(url){ _evRenderQr(url); _evRenderQr(evPdfUrl(), "evpdf-qr"); }
}

/* ── GALERÍA DE EVIDENCIAS (F2) ──────────────────────────────
   Lee la hoja "Evidencias" vía GET (?p=evlist) y muestra miniaturas de Drive
   (cada foto se comparte "cualquiera con el enlace" al subirse). Por defecto el
   módulo actual + fecha de hoy; Corrida/Tanque filtran en cliente sin re-pedir. */
let _evgRows = [];
let _evgFiltered = [];

function openEvGallery(){
  const lbl = document.getElementById("evg-modlabel"); if(lbl) lbl.textContent = mLabel(curMod);
  const fEl = document.getElementById("evg-fecha");
  const d = new Date(), z = n => (n<10?"0":"")+n;
  if(fEl) fEl.value = d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate());
  const cEl = document.getElementById("evg-corr"); if(cEl) cEl.value = "";
  const tEl = document.getElementById("evg-tq");   if(tEl) tEl.value = "";
  document.getElementById("evg-ov").classList.add("open");
  loadEvGallery();
}
function closeEvGallery(){ document.getElementById("evg-ov").classList.remove("open"); }
function closeEvGalleryOut(ev){ if(ev.target===document.getElementById("evg-ov")) closeEvGallery(); }

async function loadEvGallery(){
  const grid = document.getElementById("evg-grid");
  const status = document.getElementById("evg-status");
  const base = gasUrl();
  if(!base){
    status.textContent = "";
    grid.innerHTML = '<div class="evg-empty">⚙️ Configura la URL de Google Apps Script en ⚙ Config para ver la galería.</div>';
    return;
  }
  const fecha = (document.getElementById("evg-fecha").value||"").trim();
  const u = base + (base.indexOf("?")===-1 ? "?" : "&") +
    "p=evlist&t=" + encodeURIComponent(EV_TOKEN) +
    "&m=" + encodeURIComponent(_evModParam()) +
    (fecha ? "&f=" + encodeURIComponent(fecha) : "");
  status.textContent = "Cargando…";
  grid.innerHTML = "";
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 15000);
    const r = await fetch(u, {signal: ctrl.signal});
    clearTimeout(timer);
    const j = JSON.parse(await r.text());
    if(!j || !j.ok){
      _evgRows = []; _evgFiltered = []; grid.innerHTML = "";
      status.textContent = "No se pudo cargar" + (j && j.error ? (": " + j.error) : ".");
      return;
    }
    _evgRows = Array.isArray(j.rows) ? j.rows : [];
    evgApplyFilter();
  }catch(x){
    _evgRows = []; _evgFiltered = []; grid.innerHTML = "";
    status.textContent = x.name==="AbortError"
      ? "Tiempo de espera agotado."
      : "Error de conexión. Si acabas de añadir esta función, re-despliega el GAS.";
  }
}

function evgApplyFilter(){
  const corr = (document.getElementById("evg-corr").value||"").trim().toLowerCase();
  const tq   = (document.getElementById("evg-tq").value||"").trim().toLowerCase();
  _evgFiltered = _evgRows.filter(row=>{
    if(corr && String(row.corrida||"").toLowerCase().indexOf(corr)===-1) return false;
    if(tq   && String(row.tanque||"").toLowerCase()!==tq) return false;
    return true;
  });
  evgRenderGrid();
}

function evgRenderGrid(){
  const grid = document.getElementById("evg-grid");
  const status = document.getElementById("evg-status");
  if(!_evgFiltered.length){
    grid.innerHTML = '<div class="evg-empty">📭 No hay fotos para estos filtros.</div>';
    status.textContent = _evgRows.length
      ? (_evgRows.length + " foto(s) en la fecha; ninguna coincide con el filtro.")
      : "Sin fotos para esta fecha.";
    return;
  }
  status.textContent = _evgFiltered.length + " foto(s)";
  grid.innerHTML = _evgFiltered.map((row,i)=>{
    const thumb = "https://drive.google.com/thumbnail?id=" + encodeURIComponent(row.fileId||"") + "&sz=w400";
    const cap = "TQ " + escapeHtml(row.tanque||"?") + (row.hora ? (" · " + escapeHtml(row.hora)) : "");
    const ttl = escapeHtml("Corrida " + (row.corrida||"-") + " · TQ " + (row.tanque||"-") + " · " + (row.fecha||""));
    return `<div class="evg-cell" title="${ttl}" onclick="evgOpen(${i})">
      <img loading="lazy" src="${thumb}" alt="evidencia" onerror="this.closest('.evg-cell').classList.add('evg-broken')">
      <div class="evg-cap">${cap}</div>
    </div>`;
  }).join("");
}

function evgOpen(i){
  const row = _evgFiltered[i]; if(!row) return;
  const u = row.url || (row.fileId ? ("https://drive.google.com/file/d/" + row.fileId + "/view") : "");
  if(u) window.open(u, "_blank");
}

function renderFotos(){
  const fp = document.getElementById("fp-fotos");
  if(!fp) return;
  // Fase 1 evidencias: en Larvicultura (M01-M10 + CIO) la pestaña Fotos es el
  // portal de subida por QR a Drive. El resto de módulos conserva el local.
  if(isStdMod(curMod)){ renderEvidenciaPortal(fp); return; }
  const fotos = listFotos(curMod);
  const remaining = FMAX - fotos.length;
  const ttlH = 24;
  const nFotos = fotos.filter(f=>(f.type||"image")==="image").length;
  const nVids  = fotos.filter(f=>f.type==="video").length;

  const grid = fotos.length === 0
    ? `<div class="foto-empty">
        <span class="foto-empty-ico">📷</span>
        No hay fotos ni videos guardados para este módulo.<br>
        <small style="margin-top:6px;display:block;opacity:.7">Los medios se borran automáticamente a las ${ttlH} horas.</small>
       </div>`
    : `<div class="foto-grid">${fotos.map(f=>{
        const ts = new Date(f.ts).toLocaleString("es-EC",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
        const exp = new Date(f.ts + FTTL);
        const expStr = exp.toLocaleString("es-EC",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"});
        const isVid = f.type === "video";
        // Defensa en profundidad: aunque f.key/f.img/f.nota provienen de
        // localStorage controlado por la app, se escapan al inyectar en HTML.
        // HTML decodifica las entidades en atributos, por lo que los dataURLs
        // (que contienen "/" y "+") se recomponen correctamente al renderizar.
        const safeKey = escapeHtml(f.key);
        const safeImg = escapeHtml(f.img||"");
        const safeTs  = escapeHtml(ts);
        const safeExp = escapeHtml(expStr);
        const thumb = isVid
          ? `<div class="foto-vid-wrap">
              <video class="foto-vid-thumb" src="${safeImg}" preload="metadata" muted playsinline
                onclick="openLbKey('${safeKey}')"></video>
              <span class="foto-vid-badge">🎬 Video</span>
              <div class="foto-vid-play"></div>
            </div>`
          : `<img class="foto-thumb" src="${safeImg}" alt="Foto ${safeTs}"
               onclick="openLbKey('${safeKey}')">`;
        return `<div class="foto-card">
          ${thumb}
          <div class="foto-info">
            <div class="foto-ts">${isVid?'🎬':'📅'} ${safeTs} · ⏳ vence ${safeExp}</div>
            <div class="foto-ttl-bar">Nota</div>
            <textarea class="foto-nota" rows="2"
              onchange="saveNota('${safeKey}',this.value)"
              placeholder="Añade una nota…">${escapeHtml(f.nota||"")}</textarea>
            <button class="foto-delbtn" onclick="deleteFoto('${safeKey}')">🗑 Eliminar</button>
          </div>
        </div>`;
      }).join("")}</div>`;

  fp.innerHTML = `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📷 Fotos y Videos · ${mLabel(curMod)}</div>
      <span class="ssp ssp-mt">${nFotos} foto${nFotos!==1?'s':''} · ${nVids} video${nVids!==1?'s':''} · ${ttlH}h TTL</span>
    </div>
    <div class="fc-b">
      <div class="foto-toolbar">
        <button class="foto-capbtn" onclick="openCamera()">
          📷 Tomar foto
        </button>
        <button class="foto-vidbtn" onclick="openVideoCapture()">
          🎬 Grabar video
        </button>
        <div class="foto-cnt">
          ${remaining > 0
            ? remaining + " espacio(s) disponible(s)"
            : "⚠️ Límite alcanzado — elimina un medio para agregar más"}
        </div>
      </div>
      ${grid}
      <div style="margin-top:14px;font-size:10.5px;color:var(--tx3);line-height:1.7">
        ℹ️ Fotos y videos se almacenan localmente y se borran automáticamente a las 24 horas.<br>
        No se sincronizan con Google Sheets. Máximo ${FMAX} medios por módulo.<br>
        📹 Videos: máximo ${VMAX_SEC} segundos, máximo 2 MB de tamaño.
      </div>
    </div>
  </div>`;
}


/* ══════════════════════════════════════════
   NOTA DEL MÓDULO — eliminada (2026-06-12, decisión del usuario: nadie la usaba).
   Se conserva solo `NPRE` porque SKIP_PREFIXES (cleanup) lo referencia; las claves
   larv4_note_* antiguas quedan inertes (cleanup las salta por no tener savedAt).
══════════════════════════════════════════ */
const NPRE = "larv4_note_";


/* ══════════════════════════════════════════
   HISTORIAL — registro de envíos a Google Sheets
   Storage: HIST_PRE + mLabel(m)  →  JSON array
   Identidad de un registro: (ficha, fecha, regId).
   Sincronizar el mismo registro varias veces
   actualiza la entrada en lugar de duplicarla.
══════════════════════════════════════════ */
const HIST_PRE = "larv4_hist_";
const HIST_MAX = 200;                     // entradas máximas por módulo
const HIST_TTL = 60 * 24 * 60 * 60 * 1000; // 60 días

function histKey(m){ return HIST_PRE + mLabel(m); }

function loadHist(m){
  if(!isValidMod(m)) return [];
  try{
    const raw = localStorage.getItem(histKey(m));
    if(!raw) return [];
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return [];
    // Filtra entradas inválidas o caducadas (TTL 60 días)
    const cutoff = Date.now() - HIST_TTL;
    return arr.filter(h =>
      h && typeof h === "object" &&
      typeof h.id === "string" &&
      typeof h.ts === "number" && h.ts > cutoff &&
      FICHAS.includes(h.ficha) &&
      h.data && typeof h.data === "object"
    );
  }catch(x){ _silent("loadHist", x); return []; }
}

function saveHistList(m, list){
  try{ localStorage.setItem(histKey(m), JSON.stringify(list||[])); }
  catch(x){ /* silent — best-effort */ }
}

function pushHist(m, ficha, data){
  if(!isValidMod(m)) return;
  if(!FICHAS.includes(ficha)) return;
  if(!data || typeof data !== "object" || Array.isArray(data)) return;

  const fecha = isValidDate(data.fecha||"") ? data.fecha : today();

  const list = loadHist(m);
  // Identidad de un registro = (ficha, fecha)
  const idx  = list.findIndex(h => h.ficha === ficha && h.fecha === fecha);

  const entry = {
    id:    idx >= 0 ? list[idx].id : (Date.now().toString(36) + Math.random().toString(36).slice(2,6)),
    ts:    Date.now(),
    mod:   m,
    ficha,
    fecha,
    data:  Object.assign({}, data)
  };

  if(idx >= 0){
    list[idx] = entry;
  } else {
    list.unshift(entry);
    if(list.length > HIST_MAX) list.length = HIST_MAX;
  }
  saveHistList(m, list);
}

function getHistEntry(m, id){
  return loadHist(m).find(h => h.id === id) || null;
}

function removeHistEntry(m, id){
  const list = loadHist(m).filter(h => h.id !== id);
  saveHistList(m, list);
}

// ── Limpieza efectiva del Historial general ─────────────────────────
// loadHist() ya filtra por TTL/MAX al leer, pero NO persiste el resultado.
// En módulos que dejaron de sincronizarse hace tiempo, las entradas
// caducadas siguen ocupando localStorage hasta el próximo pushHist().
// pruneHist() reescribe la lista filtrada para todos los módulos en una
// sola pasada. Se invoca desde cleanup() en el arranque y es complementario
// a la cascada de purga de safeSetItem (que también lo usa bajo presión
// de cuota).
function pruneHist(){
  const cutoff = Date.now() - HIST_TTL;
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if(!k || !k.startsWith(HIST_PRE)) continue;
    try{
      const raw = localStorage.getItem(k);
      if(!raw) continue;
      const arr = JSON.parse(raw);
      if(!Array.isArray(arr)) continue;
      const filtered = arr.filter(h =>
        h && typeof h === "object" &&
        typeof h.id === "string" &&
        typeof h.ts === "number" && h.ts > cutoff &&
        FICHAS.includes(h.ficha) &&
        h.data && typeof h.data === "object"
      );
      const trimmed = filtered.slice(0, HIST_MAX);
      if(trimmed.length !== arr.length){
        localStorage.setItem(k, JSON.stringify(trimmed));
      }
    }catch(_){}
  }
}

/* ── Menú flotante (3 puntos) ─────────────── */
let _histMenu = null;

function openHistMenu(ev, id){
  if(ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
  closeHistMenu();
  if(!ev || !ev.currentTarget) return;
  const btn = ev.currentTarget;
  const menu = document.createElement("div");
  menu.className = "hist-menu";
  menu.setAttribute("role","menu");
  // id is generated by us (alphanumeric base36) — escape defensivamente
  const safeId = escapeHtml(id);
  menu.innerHTML =
    `<button type="button" role="menuitem" onclick="histEdit('${safeId}')">✏️ Editar</button>` +
    `<button type="button" role="menuitem" onclick="histPDF('${safeId}')">📄 PDF</button>` +
    `<button type="button" role="menuitem" class="del" onclick="histDelete('${safeId}')">🗑 Borrar</button>`;
  document.body.appendChild(menu);
  // Posicionar bajo el botón, ajustando si se sale del viewport
  const rect   = btn.getBoundingClientRect();
  const menuW  = 160;
  const left   = Math.max(8, Math.min(window.innerWidth - menuW - 8, rect.right - menuW));
  const top    = Math.min(window.innerHeight - 130, rect.bottom + 4);
  menu.style.top  = top + "px";
  menu.style.left = left + "px";
  _histMenu = menu;
  // Cierra al hacer clic fuera (siguiente tick para no cazar el clic actual)
  setTimeout(() => document.addEventListener("click", closeHistMenu, {once:true}), 0);
}

function closeHistMenu(){
  if(!_histMenu) return;
  _histMenu.remove();
  _histMenu = null;
}
function _closeHistMenuOnScroll(){
  if(_histMenu) closeHistMenu();
}
window.addEventListener("scroll", _closeHistMenuOnScroll, true);
window.addEventListener("resize", _closeHistMenuOnScroll);

/* ── Acciones del menú ────────────────────── */
function histEdit(id){
  closeHistMenu();
  const h = getHistEntry(curMod, id);
  if(!h){ toast("Registro no encontrado","warn"); return; }
  // Carga en Blanco en lugar de sobrescribir la ficha activa.
  _blancoState = { ficha: h.ficha, histId: id, data: Object.assign({}, h.data) };
  selTab("blanco");
  renderBlanco();
  toast("📝 Registro cargado en Blanco · edita y sincroniza sin afectar las fichas del día","ok",5000);
}

function histPDF(id){
  closeHistMenu();
  const h = getHistEntry(curMod, id);
  if(!h){ toast("Registro no encontrado","warn"); return; }
  // Reusa downloadPDF con un snapshot — no toca la ficha actual
  downloadPDF(h.ficha, h.data);
}

function histDelete(id){
  closeHistMenu();
  const h = getHistEntry(curMod, id);
  if(!h){ toast("Registro no encontrado","warn"); return; }
  if(!confirm("¿Eliminar este registro del historial local?\nNo afecta a lo ya enviado a Google Sheets.")) return;
  removeHistEntry(curMod, id);
  renderHistorial();
  toast("Registro eliminado del historial","ok",2500);
}

// ── Borra TODO el historial local del módulo actual ──
// Solo afecta al registro local (loadHist); las filas ya escritas en
// Google Sheets NO se tocan, igual que histDelete individual.
function clearAllHist(){
  if(curMod === null || curMod === undefined) return;
  const list = loadHist(curMod);
  if(list.length === 0){ toast("El historial ya está vacío","info",2000); return; }
  if(!confirm("¿Borrar TODOS los "+list.length+" registro(s) del historial local de "+mLabel(curMod)+"?\nEsta acción no se puede deshacer y no afecta a lo ya enviado a Google Sheets.")) return;
  saveHistList(curMod, []);
  renderHistorial();
  toast("🗑 Historial local vaciado ("+list.length+" registro(s))","ok",3000);
}

/* ── Render de la pestaña Historial ───────── */
const HIST_ICO = { calidad:"🔬", plg:"⚖️", params:"🌡️", poblacion:"🧮", calagua:"💧", despacho:"🚚" };

/* ── Datos congelados (lote/corrida) — panel para descongelar desde el Historial ──
   Decisión del usuario (2026-06-12): poder olvidar el lote o la corrida congelados
   (memoria de 25 d que prellena las fichas estándar). Solo módulos estándar. */
function _frozenDataPanel(){
  if(!isValidMod(curMod) || isLabMod(curMod) || isMadMod(curMod) ||
     isBioMod(curMod) || isAstMod(curMod) || isMicMod(curMod)) return "";
  const corr = getCorr(curMod);
  const pref = mLabel(curMod) + "|";
  const lmem = loadStdLoteMem();
  const loteCount = Object.keys(lmem).filter(k => k.indexOf(pref) === 0 && lmem[k] && lmem[k].lote).length;
  if(!corr && !loteCount) return "";
  let btns = "";
  if(corr) btns += `<button class="btn bo" type="button" onclick="unfreezeCorr()" style="font-size:10.5px;padding:5px 10px" title="Olvidar la corrida congelada de este módulo">🔓 Corrida: <b>${escapeHtml(corr)}</b> ✕</button>`;
  if(loteCount) btns += `<button class="btn bo" type="button" onclick="unfreezeLotes()" style="font-size:10.5px;padding:5px 10px" title="Olvidar los lotes congelados de este módulo">🔓 Lotes congelados: <b>${loteCount}</b> ✕</button>`;
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;padding:9px 11px;background:var(--surf);border:1px solid var(--bdr);border-radius:8px">
    <span style="font-size:10.5px;color:var(--tx2);font-weight:600">❄️ Datos congelados (25 días):</span>
    ${btns}
  </div>`;
}
function unfreezeCorr(){
  if(!isValidMod(curMod)) return;
  if(!confirm("¿Descongelar la corrida de " + mLabel(curMod) + "? Las fichas dejarán de prellenarla automáticamente.")) return;
  const mem = loadStdCorrMem();
  if(mem[mLabel(curMod)]){ delete mem[mLabel(curMod)]; try{ localStorage.setItem(STDCORR_KEY, JSON.stringify(mem)); }catch(_){} }
  toast("Corrida descongelada.","ok");
  renderHistorial();
}
function unfreezeLotes(){
  if(!isValidMod(curMod)) return;
  if(!confirm("¿Descongelar todos los lotes de " + mLabel(curMod) + "? Población y PLG dejarán de prellenarlos.")) return;
  const mem = loadStdLoteMem();
  const pref = mLabel(curMod) + "|";
  let changed = false;
  Object.keys(mem).forEach(k => { if(k.indexOf(pref) === 0){ delete mem[k]; changed = true; } });
  if(changed){ try{ localStorage.setItem(STDLOTE_KEY, JSON.stringify(mem)); }catch(_){} }
  toast("Lotes descongelados.","ok");
  renderHistorial();
}

function renderHistorial(){
  const fp = document.getElementById("fp-historial");
  if(!fp) return;
  if(curMod === null || curMod === undefined){ fp.innerHTML = ""; return; }

  const list = loadHist(curMod);

  if(list.length === 0){
    fp.innerHTML = `<div class="fc">
      <div class="fc-h">
        <div class="fc-t">📜 Historial · ${escapeHtml(mLabel(curMod))}</div>
        <span class="ssp ssp-mt">0 registros</span>
      </div>
      <div class="fc-b">
        ${_frozenDataPanel()}
        <div class="hist-empty">
          <span class="hist-empty-ico">📜</span>
          Aún no hay registros sincronizados para este módulo.<br>
          <small style="margin-top:6px;display:block;opacity:.75">Cada vez que envíes una ficha a Google Sheets, aparecerá aquí.</small>
        </div>
      </div>
    </div>`;
    return;
  }

  const items = list.map(h => {
    const fechaSinc = new Date(h.ts).toLocaleString("es-EC",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
    const ico = HIST_ICO[h.ficha] || "📋";
    const lbl = FICHA_LABELS[h.ficha] || h.ficha;
    return `<div class="hist-item">
      <div class="hist-icon" aria-hidden="true">${ico}</div>
      <div class="hist-body">
        <div class="hist-title">${escapeHtml(lbl)}</div>
        <div class="hist-meta">
          <span><b>Fecha:</b> ${escapeHtml(h.fecha)}</span>
          <span><b>Sincronizado:</b> ${escapeHtml(fechaSinc)}</span>
        </div>
      </div>
      <button class="hist-more" type="button"
        aria-label="Acciones del registro"
        onclick="openHistMenu(event,'${escapeHtml(h.id)}')">⋮</button>
    </div>`;
  }).join("");

  fp.innerHTML = `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📜 Historial · ${escapeHtml(mLabel(curMod))}</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="ssp ssp-mt">${list.length} registro${list.length!==1?'s':''}</span>
        <button class="btn bd" type="button" onclick="clearAllHist()" style="font-size:10.5px;padding:5px 10px" title="Eliminar todos los registros del historial local de este módulo (no afecta a Google Sheets)">🗑 Borrar todos</button>
      </div>
    </div>
    <div class="fc-b">
      ${_frozenDataPanel()}
      <div class="hist-list">${items}</div>
      <div style="margin-top:14px;font-size:10.5px;color:var(--tx3);line-height:1.7">
        ℹ️ Aquí aparece cada ficha que se envió a Google Sheets. Toca <b>⋮</b> para <b>Editar</b> (carga los valores en la ficha para corregir y volver a sincronizar), generar el <b>PDF</b> o <b>Borrar</b> el registro local.
        <br>El borrar local <b>no</b> elimina la fila ya escrita en Google Sheets.
      </div>
    </div>
  </div>`;
}


/* ══════════════════════════════════════════
   BLANCO — sandbox para editar registros históricos
   sin tocar las fichas del día. Renderiza la ficha
   COMPLETA (mismo diseño que la ficha normal) usando
   los datos del registro histórico seleccionado.
══════════════════════════════════════════ */
function _blancoWarningBanner(){
  return `<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11.5px;color:#92400e;display:flex;align-items:center;gap:8px">
    <span style="font-size:16px">⚠️</span>
    <span>Los cambios aquí <b>NO</b> afectan las fichas activas del día. Al sincronizar, se actualiza la fila original en Google Sheets (por Fecha+Módulo+Tanque).</span>
  </div>`;
}
function _blancoSaveArea(ficha, fecha){
  const lbl = FICHA_LABELS[ficha] || ficha;
  return `<div class="sa" style="margin-top:14px">
    <div class="sa-info"><span>📝 ${escapeHtml(lbl)} · ${escapeHtml(fecha)}</span></div>
    <div class="sa-btns">
      <button class="btn bo" type="button" onclick="clearBlanco()">🗑 Vaciar Blanco</button>
      <button class="btn bpdf" type="button" onclick="downloadPDF('${ficha}',collectBlanco())">📄 PDF</button>
      <button class="btn bp" type="button" onclick="syncBlanco()">☁️ Sincronizar cambios</button>
    </div>
  </div>`;
}

function renderBlanco(){
  const fp = document.getElementById("fp-blanco");
  if(!fp) return;
  if(!_blancoState){
    fp.innerHTML = `<div class="fc">
      <div class="fc-h"><div class="fc-t">📝 Blanco</div><span class="ssp ssp-mt">Sin registro</span></div>
      <div class="fc-b">
        <div class="hist-empty">
          <span class="hist-empty-ico">📝</span>
          Sin registro cargado.<br>
          <small style="margin-top:6px;display:block;opacity:.7">Desde <b>Historial → ⋮ → Editar</b> para cargar un registro aquí sin pisar los datos del día.</small>
        </div>
      </div>
    </div>`;
    return;
  }
  const { ficha, histId, data } = _blancoState;
  const lbl = FICHA_LABELS[ficha] || ficha;
  const fecha = data.fecha || today();
  const _tqn = loadTqNames(curMod);
  const tec = escapeHtml(data.tec || gcfg("tec",""));
  const _corrida = escapeHtml(data.corrida || "");

  const renderFn = {
    calidad:  _renderBlancoCalidad,
    plg:      _renderBlancoPlg,
    params:   _renderBlancoParams,
    poblacion:_renderBlancoPoblacion,
    calagua:  _renderBlancoCalidadAgua,
    despacho: _renderBlancoDespacho
  }[ficha];

  if(!renderFn){
    fp.innerHTML = `<div class="fc"><div class="fc-h"><div class="fc-t">📝 Blanco · ${escapeHtml(lbl)}</div></div>
      <div class="fc-b"><p>Tipo de ficha no soportado para edición en Blanco.</p></div></div>`;
    return;
  }
  renderFn(fp, data, _tqn, tec, _corrida, fecha, lbl);
  fixupLabels(fp);
}

function _renderBlancoCalidad(fp, d, _tqn, tec, _corrida, fecha, lbl){
  const rows = tqHtml(i=>{
    return `<tr>
    <td class="tqc">${tqCell(curMod,i,_tqn)}</td>
    <td><input type="text" name="e_${i}" value="${vlU(d,"e_"+i)}" placeholder="N5…M3" style="min-width:58px;text-transform:uppercase" oninput="upInp(this)"></td>
    <td><input type="number" name="ll_${i}" value="${vl(d,"ll_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="sl_${i}" value="${vl(d,"sl_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="va_${i}" value="${vl(d,"va_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="df_${i}" value="${vl(d,"df_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="rt_${i}" value="${vl(d,"rt_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="mo_${i}" value="${vl(d,"mo_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="hg_${i}" value="${vl(d,"hg_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="nv_${i}" value="${vl(d,"nv_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="op_${i}" value="${vl(d,"op_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="lp_${i}" value="${vl(d,"lp_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="fl_${i}" value="${vl(d,"fl_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="nc_${i}" value="${vl(d,"nc_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="cb_${i}" value="${vl(d,"cb_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="pr_${i}" value="${vl(d,"pr_"+i)}" min="0" max="100" step="0.1"></td>
    <td><input type="number" name="cos_${i}" value="${vl(d,"cos_"+i)}" min="0" max="100" step="0.1" title="% Actividad"></td>
    <td><input type="number" name="es_${i}" value="${vl(d,"es_"+i)}" min="0" max="100" step="0.1"></td>
  </tr>`;});

  fp.innerHTML=`<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📝 Blanco · 🔬 ${escapeHtml(lbl)}</div>
      <span class="ssp ssp-pend">Editando ${escapeHtml(fecha)}</span>
    </div>
    <div class="fc-b">
      ${_blancoWarningBanner()}
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${mLabel(curMod)}" readonly></div>
        <div class="mf"><label>Corrida</label><input name="corrida" value="${_corrida}" placeholder="Ej. 552"></div>
        <div class="mf"><label>Fecha</label><input type="date" name="fecha" value="${d.fecha||today()}"></div>
        <div class="mf"><label>Hora</label><input type="time" name="hora" value="${ev(d,'hora','')}"></div>
      </div>
      <div class="tw"><table class="ft">
        <thead>
          <tr>
            <th rowspan="3" class="tqh">TQ</th>
            <th rowspan="3">Estadio</th>
            <th colspan="9" class="thg">SANIDAD — Estadios N5–M3</th>
            <th colspan="5" class="thg2">SANIDAD — Post-larva</th>
            <th colspan="2" class="thg3">CALIDAD</th>
          </tr>
          <tr>
            <th colspan="3">Intestino</th>
            <th colspan="3">Morfología General</th>
            <th colspan="3">Otros</th>
            <th>Hepatopáncreas</th>
            <th colspan="4">Morfología PL</th>
            <th>%Actividad</th><th>%Estrés</th>
          </tr>
          <tr>
            <th>%Llenas</th><th>%Semillenas</th><th>%Vacías</th>
            <th>%Deformidad</th><th>%Retraso</th><th>%Mortalidad</th>
            <th>%Hongos</th><th>%NoViab</th><th>%Opac</th>
            <th>%Lípidos</th>
            <th>%Flacidez</th><th>%Necrosis</th><th>%Canibalismo</th><th>%Parásitos</th>
            <th>%Act</th><th>%Estrés</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ffoot">
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${tec}" placeholder="Nombre del técnico"></div>
      </div>
      ${_blancoSaveArea("calidad", fecha)}
    </div>
  </div>`;
}

function _renderBlancoPlg(fp, d, _tqn, tec, _corrida, fecha, lbl){
  const rows = tqHtml(i=>{
    return `<tr>
    <td class="tqc">${tqCell(curMod,i,_tqn)}</td>
    <td><input type="text" name="lt_${i}" value="${vlU(d,"lt_"+i)}" placeholder="Lote" style="text-transform:uppercase" oninput="upInp(this)"></td>
    <td><input type="text" name="e_${i}" value="${vlU(d,"e_"+i)}" placeholder="PL12…" style="min-width:58px;text-transform:uppercase" oninput="upInp(this)"></td>
    <td><input type="number" name="pg_${i}" value="${vl(d,"pg_"+i)}" step="0.001" placeholder="0.000"></td>
    <td><input type="number" name="pgm_${i}" value="${vl(d,"pgm_"+i)}" step="0.001" placeholder="0.000"></td>
  </tr>`;});

  fp.innerHTML=`<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📝 Blanco · ⚖️ ${escapeHtml(lbl)}</div>
      <span class="ssp ssp-pend">Editando ${escapeHtml(fecha)}</span>
    </div>
    <div class="fc-b">
      ${_blancoWarningBanner()}
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${mLabel(curMod)}" readonly></div>
        <div class="mf"><label>Fecha</label><input type="date" name="fecha" value="${d.fecha||today()}"></div>
        <div class="mf"><label>Corrida</label><input name="corrida" value="${_corrida}" placeholder="Ej. 552"></div>
        <div class="mf"><label>N° Siembra</label><input name="siembra" value="${ev(d,'siembra')}" placeholder="1"></div>
      </div>
      <div class="tw"><table class="ft">
        <thead>
          <tr>
            <th class="tqh">Tanque</th>
            <th>Lote</th>
            <th>Estadio</th>
            <th>PL / Gramo</th>
            <th>Plg (manual)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ffoot">
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${tec}" placeholder="Nombre del técnico"></div>
      </div>
      ${_blancoSaveArea("plg", fecha)}
    </div>
  </div>`;
}

function _renderBlancoParams(fp, d, _tqn, tec, _corrida, fecha, lbl){
  const th1 = PTIMES.map(t=>`<th colspan="2" class="thgt" style="min-width:80px">${t}</th>`).join("");
  const th2 = PTIMES.map(()=>`<th>OD</th><th>°C</th>`).join("");

  const rows = Array.from({length:TQS},(_,i)=>{
    const cells = PTIMES.map(t=>
      `<td><input class="pinp" type="number" name="od_${i}_${t}" value="${escapeHtml(d["od_"+i+"_"+t]||"")}" step="0.01" placeholder="-" oninput="chkParam(this,3,10)"></td>
       <td><input class="pinp" type="number" name="tc_${i}_${t}" value="${escapeHtml(d["tc_"+i+"_"+t]||"")}" step="0.01" placeholder="-" oninput="chkParam(this,20,40)"></td>`
    ).join("");
    return `<tr><td class="tqc">${tqCell(curMod,i,_tqn)}</td>${cells}</tr>`;
  }).join("");

  fp.innerHTML=`<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📝 Blanco · 🌡️ ${escapeHtml(lbl)}</div>
      <span class="ssp ssp-pend">Editando ${escapeHtml(fecha)}</span>
    </div>
    <div class="fc-b">
      ${_blancoWarningBanner()}
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${mLabel(curMod)}" readonly></div>
        <div class="mf"><label>Fecha</label><input type="date" name="fecha" value="${d.fecha||today()}"></div>
        <div class="mf"><label>Corrida</label><input name="corrida" value="${_corrida}" placeholder="Ej. 552"></div>
        <div class="mf"><label>Estadío</label><input name="estadio" value="${evU(d,'estadio')}" placeholder="Ej. PL1" style="text-transform:uppercase" oninput="upInp(this)"></div>
      </div>
      <div class="tw"><table class="ft" style="font-size:10.5px">
        <thead>
          <tr><th class="tqh">TQ</th>${th1}</tr>
          <tr><th class="tqh" style="background:var(--bg)"></th>${th2}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ffoot">
        <div class="ff" style="min-width:260px"><label>Observaciones del turno</label>
          <textarea name="obs" placeholder="Notas generales…">${escapeHtml(d.obs||"")}</textarea></div>
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${tec}" placeholder="Nombre del técnico"></div>
      </div>
      ${_blancoSaveArea("params", fecha)}
    </div>
  </div>`;
  // Aplica alertas OD/°C
  fp.querySelectorAll('input[name^="od_"]').forEach(el => chkParam(el, 3, 10));
  fp.querySelectorAll('input[name^="tc_"]').forEach(el => chkParam(el, 20, 40));
}

function _renderBlancoPoblacion(fp, d, _tqn, tec, _corrida, fecha, lbl){
  const rows = Array.from({length:TQS},(_,i)=>{
    return `<tr>
    <td class="tqc">${tqCell(curMod,i,_tqn)}</td>
    <td><input type="number" name="sv_${i}" value="${vl(d,"sv_"+i)}" min="0" max="100" step="0.01" placeholder="%"></td>
    <td><input type="number" name="po_${i}" value="${vl(d,"po_"+i)}" placeholder="Ej: 4300" title="Ingrese en miles. Ej: 4300 = 4,300,000"></td>
    <td><input type="text" name="lt_${i}" value="${vlU(d,"lt_"+i)}" placeholder="Lote" style="text-transform:uppercase" oninput="upInp(this)"></td>
    <td><input type="text" name="e_${i}" value="${vlU(d,"e_"+i)}" placeholder="N5…PL" style="text-transform:uppercase" oninput="upInp(this)"></td>
    <td><input type="number" name="sal_${i}" value="${vl(d,"sal_"+i)}" step="0.01" placeholder="ppt"></td>
  </tr>`;
  }).join("");

  fp.innerHTML=`<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📝 Blanco · 🧮 ${escapeHtml(lbl)}</div>
      <span class="ssp ssp-pend">Editando ${escapeHtml(fecha)}</span>
    </div>
    <div class="fc-b">
      ${_blancoWarningBanner()}
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${mLabel(curMod)}" readonly></div>
        <div class="mf"><label>Fecha</label><input type="date" name="fecha" value="${d.fecha||today()}"></div>
        <div class="mf"><label>Hora</label><input type="time" name="hora" value="${ev(d,'hora','')}"></div>
        <div class="mf"><label>Corrida</label><input name="corrida" value="${_corrida}" placeholder="Ej. 552"></div>
        <div class="mf"><label>N° Siembra</label><input name="siembra" value="${ev(d,'siembra')}" placeholder="1"></div>
      </div>
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:11px;color:#065f46;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">ℹ️</span>
        <span><strong>Multiplicador ×1000:</strong> Ingrese el valor en miles. Ej: escribir <strong>4300</strong> → se envía <strong>4.300.000,00</strong> a Google Sheets.</span>
      </div>
      <div class="tw"><table class="ft">
        <thead>
          <tr>
            <th class="tqh">Tanque</th>
            <th>% Supervivencia</th>
            <th>Población <span style="font-weight:400;font-size:8px;opacity:.8">(en miles)</span></th>
            <th>Lote</th>
            <th>Estadío</th>
            <th>Salinidad</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ffoot">
        <div class="ff" style="min-width:260px"><label>Observaciones</label>
          <textarea name="obs" placeholder="Notas adicionales…">${escapeHtml(d.obs||"")}</textarea></div>
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${tec}" placeholder="Nombre del técnico"></div>
      </div>
      ${_blancoSaveArea("poblacion", fecha)}
    </div>
  </div>`;
}

function _renderBlancoCalidadAgua(fp, d, _tqn, tec, _corrida, fecha, lbl){
  const rows = tqHtml(i=>{
    const _estRaw = (d["e_"+i]!==undefined && d["e_"+i]!==null && d["e_"+i]!=="") ? String(d["e_"+i]).toUpperCase().trim() : "";
    const _colorVal = (d["tr_"+i]!==undefined && d["tr_"+i]!==null) ? String(d["tr_"+i]) : "";
    return `<tr>
    <td class="tqc">${tqCell(curMod,i,_tqn)}</td>
    <td><input type="text" name="e_${i}" value="${escapeHtml(_estRaw)}" placeholder="N5…PL" style="min-width:58px;text-transform:uppercase" oninput="upInp(this)" onchange="aguaSyncRowColor(this)"></td>
    <td><input type="number" name="cm_${i}" value="${vl(d,"cm_"+i)}" step="1" placeholder="Cel/ml"></td>
    <td>${aguaColorSelectHtml(i, _estRaw, _colorVal)}</td>
    <td><input type="number" name="ep_${i}" value="${vl(d,"ep_"+i)}" min="0" max="100" step="0.1" placeholder="%"></td>
    <td><input type="number" name="sc_${i}" value="${vl(d,"sc_"+i)}" min="0" max="100" step="0.1" placeholder="%"></td>
    <td><input type="number" name="rc_${i}" value="${vl(d,"rc_"+i)}" min="0" max="100" step="0.1" placeholder="%"></td>
    <td><input type="text" name="ob_${i}" value="${vl(d,"ob_"+i)}" placeholder="Observación del tanque" style="min-width:140px"></td>
  </tr>`;});

  fp.innerHTML=`<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📝 Blanco · 💧 ${escapeHtml(lbl)}</div>
      <span class="ssp ssp-pend">Editando ${escapeHtml(fecha)}</span>
    </div>
    <div class="fc-b">
      ${_blancoWarningBanner()}
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${mLabel(curMod)}" readonly></div>
        <div class="mf"><label>Fecha</label><input type="date" name="fecha" value="${d.fecha||today()}"></div>
        <div class="mf"><label>Corrida</label><input name="corrida" value="${_corrida}" placeholder="Ej. 552"></div>
        <div class="mf"><label>N° Siembra</label><input name="siembra" value="${ev(d,'siembra')}" placeholder="1"></div>
      </div>
      <div class="tw"><table class="ft">
        <thead>
          <tr>
            <th class="tqh">Tanque</th>
            <th>Estadío</th>
            <th>Cel/ml</th>
            <th>Color</th>
            <th>% Espuma</th>
            <th>% Suciedad</th>
            <th>% Recambio</th>
            <th>Observaciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ffoot">
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${tec}" placeholder="Nombre del técnico"></div>
      </div>
      ${_blancoSaveArea("calagua", fecha)}
    </div>
  </div>`;
}

function _renderBlancoDespacho(fp, d, _tqn, tec, _corrida, fecha, lbl){
  const destOpts = (sel) => DESTINO_OPTS.map(o =>
    `<option value="${escapeHtml(o)}"${sel===o?" selected":""}>${escapeHtml(o)}</option>`
  ).join("");

  const rows = tqHtml(i=>{
    return `<tr>
      <td class="tqc">${tqCell(curMod,i,_tqn)}</td>
      <td><input type="text" name="e_${i}" value="${vlU(d,"e_"+i)}" placeholder="N5…PL" style="min-width:58px;text-transform:uppercase" oninput="upInp(this)"></td>
      <td><input type="number" name="po_${i}" value="${vl(d,"po_"+i)}" placeholder="miles" oninput="rcBlancoDespBiomasa()" title="En miles. Ej: 4300 = 4.300.000"></td>
      <td><input type="number" name="sv_${i}" value="${vl(d,"sv_"+i)}" min="0" max="100" step="0.01" placeholder="%"></td>
      <td><input type="number" name="pgm_${i}" value="${vl(d,"pgm_"+i)}" step="0.001" placeholder="0.000" oninput="rcBlancoDespBiomasa()"></td>
      <td><input type="number" name="pg_${i}" value="${vl(d,"pg_"+i)}" step="0.001" placeholder="0.000"></td>
      <td><input type="number" name="dc_${i}" value="${vl(d,"dc_"+i)}" step="0.01" min="0" placeholder="0.00"></td>
      <td><input type="number" name="bm_${i}" value="${vl(d,"bm_"+i)}" class="sv-auto" readonly title="Calculado automáticamente: Población (×1000) ÷ PLG (manual)"></td>
      <td><input type="number" name="cj_${i}" value="${vl(d,"cj_"+i)}" step="1" min="0" placeholder="0"></td>
      <td><select name="de_${i}" style="min-width:120px">
        <option value=""${(d["de_"+i]||"")===""?" selected":""}>— Selecciona —</option>
        ${destOpts(d["de_"+i]||"")}
      </select></td>
      <td><input type="text" name="ps_${i}" value="${vl(d,"ps_"+i)}" placeholder="55 ó 55-60" style="min-width:90px"></td>
    </tr>`;
  });

  fp.innerHTML=`<div class="fc">
    <div class="fc-h">
      <div class="fc-t">📝 Blanco · 🚚 ${escapeHtml(lbl)}</div>
      <span class="ssp ssp-pend">Editando ${escapeHtml(fecha)}</span>
    </div>
    <div class="fc-b">
      ${_blancoWarningBanner()}
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${mLabel(curMod)}" readonly></div>
        <div class="mf"><label>Fecha</label><input type="date" name="fecha" value="${d.fecha||today()}"></div>
        <div class="mf"><label>Hora</label><input type="time" name="hora" value="${ev(d,'hora','')}"></div>
        <div class="mf"><label>Corrida</label><input name="corrida" value="${_corrida}" placeholder="Ej. 552"></div>
      </div>
      <div class="tw"><table class="ft">
        <thead>
          <tr>
            <th class="tqh">Tanque</th>
            <th>Estadío</th>
            <th>Población<br><span style="font-weight:400;font-size:8px;opacity:.8">(miles)</span></th>
            <th>% Superv.</th>
            <th>PLG<br>(manual)</th>
            <th>PL / Gramo</th>
            <th>Densidad<br>cosechada</th>
            <th>Biomasa</th>
            <th>Cajas/<br>Tinas</th>
            <th>Destino</th>
            <th>Piscina</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ffoot">
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${tec}" placeholder="Nombre del técnico"></div>
      </div>
      ${_blancoSaveArea("despacho", fecha)}
    </div>
  </div>`;
  rcBlancoDespBiomasa();
}

function collectBlanco(){
  if(!_blancoState) return null;
  const fp = document.getElementById("fp-blanco");
  if(!fp) return null;
  const data = {};
  fp.querySelectorAll("[name]").forEach(el => {
    if(el.type === "number"){
      if(el.value === ""){ data[el.name] = ""; return; }
      const lo = el.min !== "" ? parseFloat(el.min) : -1e9;
      const hi = el.max !== "" ? parseFloat(el.max) :  1e9;
      data[el.name] = sanitizeNum(el.value, lo, hi);
    } else if(el.type === "date"){
      data[el.name] = isValidDate(el.value) ? el.value : "";
    } else if(el.type === "time"){
      data[el.name] = /^\d{2}:\d{2}$/.test(el.value) ? el.value : "";
    } else if(el.tagName === "TEXTAREA"){
      data[el.name] = sanitizeStr(el.value);
    } else {
      data[el.name] = sanitizeStr(el.value);
    }
  });
  return data;
}

async function syncBlanco(){
  if(!_blancoState){ toast("No hay registro en Blanco","warn"); return; }
  const data = collectBlanco();
  if(!data) return;
  const url = gasUrl();
  if(!url){ toast("Configura la URL de Google Apps Script","warn"); return; }
  if(!isValidGasUrl(url)){ toast("URL inválida","err"); return; }
  if(!syncRateOk()) return;

  const ficha = _blancoState.ficha;
  setSyncUI("pend","Sincronizando Blanco…");

  // Guarda temporalmente en la clave de la ficha, construye payload, restaura.
  const origE = loadE(curMod, ficha);
  saveE(curMod, ficha, data, false);
  let payload, sent = false;
  try{
    if(ficha === "params"){
      payload = buildControlPayload(curMod);
    } else {
      payload = buildDatosPayload(curMod, [ficha]);
    }
  } finally {
    if(origE){
      saveE(curMod, ficha, origE.data, origE.synced);
    } else {
      localStorage.removeItem(skey(curMod, ficha));
      _invalidateLoadE(skey(curMod, ficha));
    }
  }

  if(!payload || !payload.rows || payload.rows.length === 0){
    setSyncUI("idle","Sin datos"); toast("No hay filas para sincronizar","warn"); return;
  }
  sent = await postPayload(payload, url);
  if(sent){
    pushHist(curMod, ficha, data);
    setSyncUI("ok","Blanco sincronizado ✔");
    setTimeout(()=> setSyncUI("idle","Todo sincronizado"), 3500);
    toast("✅ Registro actualizado en Google Sheets","ok",4000);
    _blancoState = null;
    renderBlanco();
  } else {
    setSyncUI("err","Error al sincronizar Blanco");
    toast("Error al sincronizar desde Blanco","err",4500);
  }
  updateDots(); updateSyncUI();
}

function clearBlanco(){
  _blancoState = null;
  renderBlanco();
  toast("Blanco vaciado","ok",2000);
}


/* ══════════════════════════════════════════
   STORAGE NAMESPACES — descriptor central
   ──────────────────────────────────────────
   Catálogo único de los namespaces que la app maneja en localStorage.
   Lo consume:
     • _allAppStorageKeys() → lista las claves "propias" para backup/restore
     • Documentación viva: añadir un nuevo namespace aquí lo hace visible
       inmediatamente para todos los flujos que usan este descriptor.
   No reemplaza las constantes existentes (PRE, FPRE, etc.); las referencia.
   IMPORTANTE: este bloque DEBE quedar DESPUÉS de que estén declaradas
   TODAS las constantes que aquí se referencian (HIST_PRE, HIST_TTL, NPRE,
   TQNAME_PRE, etc.). Colocarlo antes provoca ReferenceError por TDZ
   que aborta el resto del script (incluido el INIT con buildGrid).
══════════════════════════════════════════ */
const STORAGE_NAMESPACES = {
  ficha:    { prefix: PRE,         ttl: TTL,            desc: "Fichas (24h tras sincronizar)" },
  recovery: { prefix: RPRE,        ttl: RTTL,           desc: "Snapshots auto-guardado (1h)" },
  foto:     { prefix: FPRE,        ttl: FTTL,           desc: "Fotos/Videos (24h)" },
  alghist:  { prefix: ALGHIST_PRE, ttl: TTL,            desc: "Historial Lab. Algas pendiente (24h, máx 10/día)" },
  alglog:   { key:    ALGLOG_KEY,  ttl: ALGLOG_TTL_MS,  desc: "Bitácora Lab. Algas sincronizada (72h)" },
  cs:       { prefix: CS_PRE,                           desc: "Cantidad Sembrada por módulo (sin TTL — sólo local)" },
  ton:      { prefix: TON_PRE,                          desc: "Toneladas por tanque (Despacho — sin TTL — sólo local)" },
  mad:      { prefix: MAD_PRE,                          desc: "Maduración (Salas/Tanques/Lotes — sin TTL)" },
  biomol:   { key:    BIO_REC_KEY, ttl: BIO_TTL,        desc: "Biomol (48 h)" },
  ast:      { key:    AST_REC_KEY, ttl: AST_TTL,        desc: "AsT (48h, máx 40)" },
  hist:     { prefix: HIST_PRE,    ttl: HIST_TTL,       desc: "Historial general (60d, máx 200)" },
  note:     { prefix: NPRE,                             desc: "Notas por módulo (sin TTL)" },
  tqname:   { prefix: TQNAME_PRE,                       desc: "Nombres editables de tanques (sin TTL — sólo local)" },
  stdlote:  { key:    STDLOTE_KEY, ttl: STDLOTE_TTL,    desc: "Lote congelado por módulo+tanque (25 d)" },
  stdcorr:  { key:    STDCORR_KEY, ttl: STDCORR_TTL,    desc: "Corrida congelada por módulo (25 d)" },
  session:  { key:    "larv4_sid",                      desc: "Identificador de sesión" },
  cfg:      { prefix: "lcfg_",                          desc: "Configuración (URL GAS, token, técnico)" }
};

// Devuelve la lista de claves de localStorage que pertenecen a la app
// según el descriptor. Usada por backup/restore para no exportar claves
// ajenas (otras apps en el mismo origen) ni dejar fuera nada propio.
function _allAppStorageKeys(){
  const keys = [];
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if(!k) continue;
    for(const ns of Object.values(STORAGE_NAMESPACES)){
      if((ns.prefix && k.startsWith(ns.prefix)) || (ns.key && k === ns.key)){
        keys.push(k);
        break;
      }
    }
  }
  return keys;
}

/* ══════════════════════════════════════════
   BACKUP / RESTORE — export e import JSON
   ──────────────────────────────────────────
   Mitigación robusta del riesgo principal de pérdida de datos: limpieza
   accidental de localStorage (modo privado, "borrar datos del sitio",
   reseteo de quota). El backup incluye TODO lo de la app (incluso CS y
   nombres de TQ que sólo existen local) y se puede restaurar después.
══════════════════════════════════════════ */
const BACKUP_VERSION = 1;

function exportBackup(){
  try{
    const keys = _allAppStorageKeys();
    const items = {};
    keys.forEach(k => { try{ items[k] = localStorage.getItem(k); }catch(_){} });
    const dump = {
      v:       BACKUP_VERSION,
      ts:      Date.now(),
      iso:     new Date().toISOString(),
      appHost: location.hostname || "local",
      count:   Object.keys(items).length,
      items
    };
    const json = JSON.stringify(dump, null, 2);
    const bytes = json.length;
    if(bytes > 5 * 1024 * 1024){
      const mb = (bytes / (1024*1024)).toFixed(1);
      if(!confirm("⚠ El backup pesa ~"+mb+" MB (incluye fotos/videos). ¿Descargar de todas formas?")) return;
    }
    const blob = new Blob([json], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fichas-larv-backup_" + today() + "_" + dump.count + "items.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 1500);
    toast("📥 Backup exportado: "+dump.count+" elemento(s)","ok",4000);
  }catch(err){
    console.error("[backup] export error:", err);
    toast("Error al generar backup","err",4000);
  }
}

function importBackup(file){
  const reader = new FileReader();
  reader.onerror = ()=>toast("No se pudo leer el archivo","err");
  reader.onload = ev=>{
    let dump;
    try{ dump = JSON.parse(ev.target.result); }
    catch(_){ toast("Archivo JSON inválido","err"); return; }
    if(!dump || typeof dump !== "object" || !dump.items || typeof dump.items !== "object"){
      toast("Estructura de backup no válida","err"); return;
    }
    if(dump.v !== BACKUP_VERSION){
      if(!confirm("⚠ El backup tiene versión "+dump.v+" y la app espera "+BACKUP_VERSION+". ¿Continuar de todas formas?")) return;
    }
    // Whitelist por prefixes/keys conocidos — evita escribir claves ajenas
    const allowedKeys = Object.keys(dump.items).filter(k => {
      if(typeof k !== "string") return false;
      for(const ns of Object.values(STORAGE_NAMESPACES)){
        if((ns.prefix && k.startsWith(ns.prefix)) || (ns.key && k === ns.key)) return true;
      }
      return false;
    });
    if(allowedKeys.length === 0){
      toast("No hay claves válidas en el backup","warn"); return;
    }
    const tsLabel = dump.iso ? new Date(dump.iso).toLocaleString("es-EC") : "(sin fecha)";
    if(!confirm("¿Importar "+allowedKeys.length+" elemento(s) del backup de "+tsLabel+"?\n\nSe SOBRESCRIBEN las claves locales con el mismo nombre. Las claves no incluidas en el backup se conservan.")) return;
    let ok = 0, fail = 0;
    allowedKeys.forEach(k => {
      try{
        const v = dump.items[k];
        if(typeof v === "string"){ localStorage.setItem(k, v); ok++; }
        else fail++;
      }catch(_){ fail++; }
    });
    try{ _invalidateFotosCache(); }catch(_){}
    toast("📤 Importados "+ok+" elemento(s)"+(fail>0?" ("+fail+" fallaron)":"")+". Recarga la página para refrescar.","ok",6500);
  };
  reader.readAsText(file);
}

function pickAndImportBackup(){
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "application/json,.json";
  inp.onchange = e=>{
    const file = e.target.files && e.target.files[0];
    if(file) importBackup(file);
  };
  inp.click();
}

/* ══════════════════════════════════════════
   GUARD: aviso al cerrar la pestaña con datos sin sincronizar
   Solo se activa cuando hay un módulo abierto y se detecta
   contenido pendiente. El mensaje real lo decide el navegador.
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   R3 · DETECCIÓN DE CAMBIOS SIN GUARDAR
   _formDirty se activa al teclear en cualquier ficha estándar y se limpia al
   guardar/sincronizar/borrar, al recuperar autoguardado, o al cambiar de
   módulo. El guard beforeunload lo consulta para advertir antes de cerrar.
══════════════════════════════════════════ */
var _formDirty = false;
function _markFormDirty(){
  if(curMod === null || curMod === undefined) return;
  // Sólo módulos estándar (M01–M10, CIO): su modelo es collect()+saveE().
  // Lab/Mad/Bio/AsT tienen sus propios flujos y detección de pendientes.
  if(isLabMod(curMod) || isMadMod(curMod) || isBioMod(curMod) ||
     isAstMod(curMod)) return;
  _formDirty = true;
}

window.addEventListener("beforeunload", function(e){
  try{
    if(curMod === null || curMod === undefined) return;
    let hasPending = false;
    if(isMadMod(curMod)){
      hasPending = _madGridDirty || MAD_FICHAS.some(f => loadMad(f).some(r => !r.synced));
    } else if(isLabMod(curMod)){
      hasPending = loadAlgHist().length > 0;
    } else if(isBioMod(curMod)){
      hasPending = _bioGridDirty || loadBio().some(r => !r.synced);
    } else if(isAstMod(curMod)){
      hasPending = _astFormDirty || loadAst().some(r => !r.synced);
    } else if(isMicMod(curMod)){
      hasPending = loadMic().some(r => !r.synced) || (typeof _calRaw==="function" && _calRaw().some(r => !r.synced)) || (typeof _patRaw==="function" && _patRaw().some(r => !r.synced));
    } else {
      // R3: advierte tanto por datos guardados-sin-sincronizar (pending) como
      // por datos TECLEADOS pero aún no guardados (_formDirty). Antes esto
      // último se perdía al cerrar la pestaña sin ningún aviso.
      hasPending = _formDirty || FICHAS.some(f => getStatus(curMod, f) === "pending");
    }
    if(hasPending){
      e.preventDefault();
      e.returnValue = "";  // Chrome/Edge/Firefox necesitan este string
      return "";
    }
  }catch(_){ /* nunca bloquear cierre por un error en el guard */ }
});

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
// Pinta primero la UI del login (buildGrid) para tiempo-a-interactivo
// mínimo. cleanup() escanea TODO localStorage y puede tardar varios ms
// en dispositivos con mucha historia; se difiere a `requestIdleCallback`
// con timeout máximo de 2s para garantizar que también corra en navegadores
// que rara vez entran en estado idle (móviles bajo carga). Tras la purga
// se hace un segundo buildGrid() para reflejar dots con datos depurados.
buildGrid();
// Pide almacenamiento PERSISTENTE: en Chrome/Android reduce que el navegador
// borre el localStorage por presión de espacio (una causa de "se guardó pero
// desapareció"). No bloquea ni molesta si el navegador lo deniega.
try{
  if(navigator.storage && typeof navigator.storage.persist === "function"){
    navigator.storage.persisted().then(p=>{ if(!p) navigator.storage.persist().catch(()=>{}); }).catch(()=>{});
  }
}catch(_){}
// R3: marca "sin guardar" al teclear dentro del área de fichas. Se adjunta a
// .main, que excluye la barra de notas y los modales (Config/CS), que tienen
// su propio guardado y no deben disparar el aviso de cierre.
try{
  const _mainEl = document.querySelector(".main");
  if(_mainEl){
    _mainEl.addEventListener("input",  _markFormDirty, true);
    _mainEl.addEventListener("change", _markFormDirty, true);
  }
}catch(_){}
// S3: reintenta automáticamente la cola de sincronización al volver la conexión.
try{ window.addEventListener("online", function(){ try{ flushSyncQueue(); }catch(_){} }); }catch(_){}
const _bootCleanup = () => {
  let _changed = false;
  try{ _changed = cleanup(); }catch(_){}
  // #10: solo se re-pinta el grid si cleanup() purgó algo (caso común: nada que
  // purgar → se evita un buildGrid() redundante con sus parseos de localStorage).
  try{ if(_changed) buildGrid(); }catch(_){}
  try{ flushSyncQueue(); }catch(_){}   // S3: vacía lo que quedó pendiente en sesiones previas
};
if(typeof requestIdleCallback === "function"){
  requestIdleCallback(_bootCleanup, { timeout: 2000 });
} else {
  setTimeout(_bootCleanup, 50);
}

/* ── Integración con la vista "Registros" del dashboard modular ──
   El host (index.js) es persistente y se re-adjunta conservando estado, así que
   no hace falta re-inicializar el motor al re-montar. Solo se marca como cargado. */
try { window.__rgLoaded = true; } catch(_) {}
