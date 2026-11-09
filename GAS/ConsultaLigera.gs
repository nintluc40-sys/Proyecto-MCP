// Google Apps Script — MCP · consulta ligera. Es un proyecto APARTE: NO es el GAS del Registro (Code.gs) y NO se pega
// junto a él: los dos declaran SS_ID y doGet, y en el mismo proyecto el del Registro dejaría de funcionar. Se implementa
// como aplicación web («Ejecutar como: yo», «Cualquier usuario») con la cuenta dueña del libro. Ver README, «Consulta ligera».
const SS_ID = '1Rrpff6bD1pOQFsi2Lsagan3ttjncxJzXoXLPgtHM0Gs';
function doGet() {
  let out;
  try { out = { ok: true, mod: DriveApp.getFileById(SS_ID).getLastUpdated().getTime() }; }
  catch (e) { out = { ok: false, error: String((e && e.message) || e) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
