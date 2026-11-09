const SS_ID = '1Rrpff6bD1pOQFsi2Lsagan3ttjncxJzXoXLPgtHM0Gs';
function doGet() {
  let out;
  try { out = { ok: true, mod: DriveApp.getFileById(SS_ID).getLastUpdated().getTime() }; }
  catch (e) { out = { ok: false, error: String((e && e.message) || e) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
