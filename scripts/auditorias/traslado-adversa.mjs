/* AUDITORÍA ADVERSA DE TRASLADO · el CICLO DE VIDA, no el viaje feliz.

   `auditoria-traslado-e2e.mjs` recorre UN viaje bien capturado y comprueba que el
   papel y el tablero cuenten lo mismo. Eso no toca donde vivía el defecto grave.

   El defecto de pérdida silenciosa (2026-08-25) no aparecía capturando: aparecía
   al QUITAR algo de un viaje YA SINCRONIZADO. La llave era posicional, la
   sincronización sólo da de alta y actualiza —nunca borra—, y el segundo camión
   ascendía a la posición del primero y le escribía encima. El GAS respondía
   «upserted: 4, appended: 0» —sincronización perfecta— y el tablero enseñaba un
   camión con medias correctas. Nada decía que faltaba un camión.

   Por eso esta auditoría sincroniza VARIAS VECES contra la MISMA hoja, quitando
   cosas entre envío y envío, y comprueba fila a fila que lo que no se tocó SIGUE
   AHÍ y con su valor. Se usa el código REAL de las tres mitades.

   Uso:  node auditoria-traslado-adversa.mjs
*/
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

/* La raíz del repo se deduce de dónde vive ESTE archivo (scripts/auditorias/), así que
   la auditoría corre igual desde el repo, desde la carpeta de herramientas o desde el
   ubuntu de la CI. Antes era una ruta absoluta de una máquina concreta, que es lo que
   impedía que la corriera nadie más. */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..') + '/';
/* `file:///` + ruta sólo funciona en Windows: en Linux la ruta ya empieza por `/` y
   quedaría `file:////home/...`. `pathToFileURL` acierta en los dos y además escapa los
   espacios del nombre de carpeta, que es lo que hacía el `.replace(/ /g, "%20")`. */
const urlDe = (rel) => pathToFileURL(RAIZ + rel).href;
const leer = (p) => readFileSync(RAIZ + p, 'utf8').split('\r\n').join('\n');
function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  const j = src.indexOf(hasta, i);
  if (i < 0 || j < 0) throw new Error('ancla perdida: ' + desde.slice(0, 50));
  return src.slice(i, j + hasta.length);
}

/* ── La captura (monolito) ────────────────────────────────── */
const src = leer('public/registros/engine.js');
const code = [
  bloque(src, 'const TRAS_REC_KEY   = "larv4_tras_records";',
    '  return { sheetName: TRAS_SHEET, headers: TRAS_HEADERS.slice(), rows: rows };\n}'),
  // «Quitar», sin DOM. Vive lejos del bloque anterior.
  bloque(src, 'function _trasOlvidar(data, sufijos){',
    '  revs.splice(i, 1);\n  data.revisiones = revs;\n  return data;\n}'),
].join('\n');

/* ── AUTOCOMPROBACIÓN DEL ARNÉS ───────────────────────────────
   Un verde no prueba nada por sí solo: prueba algo cuando aparece el ROJO al
   romper la regla. `--probar-arnes <clave>` devuelve el código a la conducta
   defectuosa ANTES de evaluarlo y exige que esta auditoría se ponga roja. La
   mutación se aplica en MEMORIA, sobre el texto ya extraído: no se escribe un
   solo byte en el proyecto, así que no puede dejar residuo como un banco
   interrumpido.

   Si una de estas mutaciones NO pone roja la auditoría, el escenario
   correspondiente no está comprobando lo que dice comprobar. */
const ROTURAS = {
  // El defecto histórico: la llave vuelve a ser POSICIONAL.
  llave: ['(cam && cam.cid) || nCam', 'nCam'],
  // La parada vuelve a identificarse por su posición.
  parada: ['(r && r.rid) || nRev', 'nRev'],
  // Se apaga aunque el viaje nunca saliera del dispositivo.
  apagado: ['if(reg && reg.everSynced){', 'if(true){'],
  // Se apaga una llave que este mismo envío escribe VIVA.
  viva: ['if(vivos[fid]) return;', 'if(false) return;'],
  // Las coordenadas pasan por el saneado de texto (mata el signo negativo).
  coords: ['trasNum(r.lon)', 'trasTxt(r.lon)'],
};
const iRot = process.argv.indexOf('--probar-arnes');
let codeFinal = code;
if (iRot >= 0) {
  const clave = process.argv[iRot + 1];
  const r = ROTURAS[clave];
  if (!r) {
    console.error('roturas disponibles: ' + Object.keys(ROTURAS).join(', '));
    process.exit(2);
  }
  const n = codeFinal.split(r[0]).length - 1;
  if (n === 0) { console.error('ANCLA NO ENCONTRADA para «' + clave + '»'); process.exit(2); }
  codeFinal = codeFinal.split(r[0]).join(r[1]);
  console.log('### ARNÉS EN PRUEBA · rotura «' + clave + '» aplicada en memoria ('
    + n + ' sitio/s). SE ESPERA QUE ESTA AUDITORÍA FALLE.\n');
}

/* ⚠⚠ EL `sanitizeStr` TIENE QUE SER EL DE VERDAD.
   El real BORRA los caracteres `= + - @` INICIALES (anti-inyección de fórmula en
   Sheets). La longitud de Ecuador es NEGATIVA (≈ −80.98): pasarla por ahí la
   convierte en +80.98, al otro lado del planeta y sin ningún error visible. Por
   eso el monolito separa `trasTxt` (sanea) de `trasNum` (nunca sanea).

   Un stub que sólo hiciera `trim().slice()` es MÁS PERMISIVO que el real, y
   entonces una regresión que mandara la longitud por la vía de texto pasaría
   en verde: el arnés no reproduciría el daño. Medido el 2026-08-26 — con el stub,
   la rotura «coords» sobrevivía a esta misma auditoría. */
const { sanitizeStr } = await import(
  urlDe('src/core/trovan.js'));

const ctx = {
  String, Number, Object, Array, JSON, Math, Date, parseFloat, isFinite, isNaN, Set,
  RPRE: 'larv4_recov_',
  sanitizeStr,
  escapeHtml: (s) => String(s == null ? '' : s),
};
ctx.globalThis = ctx;
createContext(ctx);
new Script(codeFinal + '\n;globalThis.__c = { buildTrasPayload, TRAS_HEADERS, _trasAsegurarIds,'
  + ' _trasSacarCamion, _trasSacarRevision, _trasOlvidar, _trasSufijos, _trasRids,'
  + ' trasFilaId, trasCamiones, trasTinasEnUso, _trasLotes, TRAS_MAX_FILAS };')
  .runInContext(ctx);
const cli = ctx.__c;

/* ── El GAS ───────────────────────────────────────────────── */
const gsrc = leer('GAS/Code.gs');
const gcode = bloque(gsrc, 'const ALLOWED = [', 'const RATE_MAX = 30, RATE_MS = 60000;')
  + '\n' + bloque(gsrc, 'function cleanCell(val) {', '\n}')
  + '\n' + bloque(gsrc, 'function lastRow(ws) {', '\n}')
  /* ⚠ M5 (2026-08-30) hizo que upsertAstRows llame a filasUniformes. Sin traerla al
     sandbox, el arnés muere con «filasUniformes is not defined» — y como estas dos
     auditorías NO están en `npm test`, se quedaron rotas EN SILENCIO hasta que se
     corrieron a mano. Se trae la REAL de Code.gs, nunca un stub: un arnés más
     benévolo que el producto no puede certificar al producto. */
  + '\n' + bloque(gsrc, 'function filasUniformes(filas) {', '  return { filas: out, ancho: ancho };\n}')
  + '\n' + bloque(gsrc, 'function upsertAstRows(ws, newRows) {',
    '  return { upserted: updated, appended: added };\n}');
const gctx = { String, Number, Object, Array, JSON, Math, isFinite, Date, fmtData() {} };
gctx.globalThis = gctx;
createContext(gctx);
new Script(gcode + '\n;globalThis.__g = { upsertAstRows };').runInContext(gctx);
const gas = gctx.__g;

function hojaFalsa(headers) {
  const filas = [headers.slice()];
  return {
    _filas: filas,
    getLastColumn: () => (filas[0] ? filas[0].length : 0),
    getLastRow: () => filas.length,
    getMaxColumns: () => 60,
    insertColumnsAfter() {},
    getDataRange: () => ({ getValues: () => filas.map((f) => f.slice()) }),
    getRange(r, c, nR, nC) {
      return {
        getValues: () => {
          const o = [];
          for (let i = 0; i < nR; i++) o.push((filas[r - 1 + i] || []).slice(c - 1, c - 1 + nC));
          return o;
        },
        setValues: (v) => {
          v.forEach((row, i) => {
            const f = filas[r - 1 + i] || (filas[r - 1 + i] = []);
            row.forEach((cell, k) => { f[c - 1 + k] = cell; });
          });
        },
      };
    },
  };
}

/* ── El tablero ───────────────────────────────────────────── */
const urlVista = urlDe('src/views/supervisor/traslado.data.js');
const { trasladoDe } = await import(urlVista);

/* ── Utilidades de lectura de la hoja ─────────────────────── */
const H = cli.TRAS_HEADERS;
const iID = H.length - 1;
const col = (n) => H.indexOf(n);
const filasDe = (ws) => ws._filas.slice(1);
const porId = (ws) => {
  const m = {};
  filasDe(ws).forEach((f) => { m[String(f[iID])] = f; });
  return m;
};
const comoObjetos = (ws) => filasDe(ws).map((f) => {
  const o = { _SheetOrigin: 'Registro_Traslado' };
  H.forEach((h, i) => { o[h] = f[i]; });
  return o;
});

let fallos = 0;
let pruebas = 0;
function comp(etq, real, esperado) {
  pruebas++;
  const ok = String(real) === String(esperado);
  if (!ok) fallos++;
  console.log('  ' + (ok ? 'ok  ' : '**  FALLA ') + etq.padEnd(52)
    + ' obtenido=' + JSON.stringify(real) + '  esperado=' + JSON.stringify(esperado));
}

/* ── El viaje base ────────────────────────────────────────── */
const TINAS = [1, 2, 3, 4, 5, 6];
const tinasDe = (base, act) => Object.fromEntries(TINAS.map((t) => ([t, {
  o2: (base + t * 0.1).toFixed(2), temp: '26', act, alim: 'Artemia',
}])));
function viajeBase() {
  const HORAS = ['20:45', '22:10', '23:55', '02:30'];
  const LUG = ['Laboratorio', 'Peaje 1', 'Gabarra 1', 'Camaronera'];
  return {
    fecha: '2026-08-26', corrida: '555', modulo: 'M07', camaronera: 'Puná 1',
    salinidad: '31.5', horaSalida: '20:30', horaLlegada: '06:00',
    insumos: ['Artemia'], check: ['Oxigenómetro'],
    controlador: 'Juan', chequeador: 'Pedro', recepcion: 'María',
    camiones: [{ placa: 'AAA-111', tinasOff: [7, 8] }, { placa: 'BBB-222', tinasOff: [7, 8] }],
    revisiones: HORAS.map((h, i) => ({
      hora: h, lugar: LUG[i], lat: -2.21 - i * 0.01, lon: -80.97 - i * 0.01,
      precision: 12, ubicacion: 'u', horaRegistro: 't', obs: '',
      camiones: [{ tinas: tinasDe(7.0 + i, 'Alta') }, { tinas: tinasDe(6.0 + i, 'Normal') }],
    })),
  };
}

console.log('======================================================================');
console.log(' AUDITORÍA ADVERSA · quitar cosas de un viaje YA SINCRONIZADO');
console.log('======================================================================\n');

/* ══ ESCENARIO A · quitar el PRIMER camión tras sincronizar ══════════════════
   Es el caso exacto del defecto: el que ascendía de posición y sobreescribía. */
console.log('A · se quita el PRIMER camión de un viaje ya sincronizado');
{
  const data = viajeBase();
  cli._trasAsegurarIds(data);
  const reg = { id: 'tvA', data, everSynced: false };
  const ws = hojaFalsa(H);

  // Envío 1: el viaje entero.
  const p1 = cli.buildTrasPayload([reg]);
  gas.upsertAstRows(ws, p1.rows);
  reg.everSynced = true;
  comp('envío 1 escribe 2 camiones x 4 paradas x 6 tinas', p1.rows.length, 48);

  // Fotografía de lo que el camión BBB tenía en la hoja ANTES de tocar nada.
  const antes = {};
  Object.entries(porId(ws)).forEach(([id, f]) => {
    if (f[col('Placa')] === 'BBB-222') antes[id] = f[col('Oxígeno (mg/L)')];
  });
  comp('el camión que se queda tenía 24 filas', Object.keys(antes).length, 24);

  // Se quita el PRIMER camión y se vuelve a sincronizar.
  cli._trasSacarCamion(data, 0);
  const p2 = cli.buildTrasPayload([reg]);
  gas.upsertAstRows(ws, p2.rows);

  const mapa = porId(ws);
  let intactas = 0; let pisadas = 0;
  Object.entries(antes).forEach(([id, o2]) => {
    const f = mapa[id];
    if (f && String(f[col('Oxígeno (mg/L)')]) === String(o2)
        && f[col('Placa')] === 'BBB-222') intactas++;
    else pisadas++;
  });
  comp('EL CAMIÓN QUE SE QUEDA CONSERVA SUS 24 FILAS', intactas, 24);
  comp('ninguna fila suya fue pisada', pisadas, 0);

  // Las del camión retirado deben quedar APAGADAS: en blanco menos el ID.
  const apagadas = filasDe(ws).filter((f) => f[col('Placa')] === '' && f[iID] !== '');
  comp('las 24 filas del camión retirado quedan en blanco', apagadas.length, 24);
  const conModulo = apagadas.filter((f) => f[col('Módulo')] !== '');
  comp('ninguna fila apagada conserva el Módulo', conModulo.length, 0);

  // Y el tablero tiene que ver UN camión, no dos ni un fantasma.
  const t = trasladoDe(comoObjetos(ws), 'M07', '555');
  comp('el tablero enseña 1 camión', t.camiones.length, 1);
  comp('y es el que se quedó', t.camiones[0].placa, 'BBB-222');
  comp('con sus 4 paradas', t.camiones[0].nParadas, 4);
}

/* ══ ESCENARIO B · quitar una parada INTERMEDIA ════════════════════════════ */
console.log('\nB · se quita una parada INTERMEDIA de un viaje ya sincronizado');
{
  const data = viajeBase();
  cli._trasAsegurarIds(data);
  const reg = { id: 'tvB', data, everSynced: false };
  const ws = hojaFalsa(H);
  gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);
  reg.everSynced = true;

  // Lo que tenía la parada 3 (Gabarra 1), la que NO se quita.
  const antes = {};
  Object.entries(porId(ws)).forEach(([id, f]) => {
    if (f[col('Lugar')] === 'Gabarra 1') antes[id] = f[col('Oxígeno (mg/L)')];
  });
  comp('la parada que se queda tenía 12 filas', Object.keys(antes).length, 12);

  cli._trasSacarRevision(data, 1);           // fuera «Peaje 1»
  gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);

  const mapa = porId(ws);
  const intactas = Object.entries(antes)
    .filter(([id, o2]) => mapa[id] && String(mapa[id][col('Oxígeno (mg/L)')]) === String(o2)).length;
  comp('LA PARADA POSTERIOR CONSERVA SUS 12 FILAS', intactas, 12);

  const vivasPeaje = filasDe(ws).filter((f) => f[col('Lugar')] === 'Peaje 1');
  comp('no queda ni una fila viva de la parada retirada', vivasPeaje.length, 0);

  const t = trasladoDe(comoObjetos(ws), 'M07', '555');
  comp('el tablero enseña 3 paradas, sin fantasma', t.camiones[0].nParadas, 3);
  comp('y sigue habiendo 2 camiones', t.camiones.length, 2);
}

/* ══ ESCENARIO C · apagar una tina YA sincronizada ═════════════════════════ */
console.log('\nC · se apaga una tina que ya tenía medición en la hoja');
{
  const data = viajeBase();
  cli._trasAsegurarIds(data);
  const reg = { id: 'tvC', data, everSynced: false };
  const ws = hojaFalsa(H);
  gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);
  reg.everSynced = true;

  const cam = data.camiones[0];
  const antesVivas = filasDe(ws).filter((f) => f[col('Placa')] === 'AAA-111'
    && String(f[col('Tina')]) === '3' && f[col('Oxígeno (mg/L)')] !== '').length;
  comp('la tina 3 del camión AAA tenía 4 filas con dato', antesVivas, 4);

  // Se apaga la tina 3 y se anotan sus llaves, como hace el commit real.
  cam.tinasOff = [3, 7, 8];
  cli._trasOlvidar(data, cli._trasSufijos([cam.cid], cli._trasRids(data), [3]));
  gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);

  const quedanConDato = filasDe(ws).filter((f) => f[col('Placa')] === 'AAA-111'
    && String(f[col('Tina')]) === '3' && f[col('Oxígeno (mg/L)')] !== '').length;
  comp('LA TINA APAGADA NO CONSERVA SU MEDICIÓN VIEJA', quedanConDato, 0);

  const otras = filasDe(ws).filter((f) => f[col('Placa')] === 'AAA-111'
    && String(f[col('Tina')]) === '4' && f[col('Oxígeno (mg/L)')] !== '').length;
  comp('las demás tinas del mismo camión siguen intactas', otras, 4);
}

/* ══ ESCENARIO D · quitar y VOLVER A AÑADIR un camión ══════════════════════
   El token natural del nuevo podría chocar con el del retirado y resucitar sus
   filas apagadas con datos de otro camión. */
console.log('\nD · se quita un camión y se añade otro después (choque de token)');
{
  const data = viajeBase();
  cli._trasAsegurarIds(data);
  const reg = { id: 'tvD', data, everSynced: false };
  const ws = hojaFalsa(H);
  gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);
  reg.everSynced = true;

  cli._trasSacarCamion(data, 0);                   // fuera AAA-111
  data.camiones.push({ placa: 'CCC-333', tinasOff: [7, 8] });
  data.revisiones.forEach((r) => r.camiones.push({ tinas: tinasDe(5.0, 'Baja') }));
  cli._trasAsegurarIds(data);
  gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);

  const cids = cli.trasCamiones(data).map((c) => c.cid);
  comp('los dos camiones vivos tienen tokens distintos', new Set(cids).size, 2);

  const t = trasladoDe(comoObjetos(ws), 'M07', '555');
  const placas = t.camiones.map((c) => c.placa).sort().join(',');
  comp('el tablero enseña exactamente los dos camiones vivos', placas, 'BBB-222,CCC-333');
  const filasCCC = filasDe(ws).filter((f) => f[col('Placa')] === 'CCC-333').length;
  comp('el camión nuevo escribe sus 24 filas propias', filasCCC, 24);
}

/* ══ ESCENARIO E · quitar SIN haber sincronizado nunca ═════════════════════
   Si el viaje nunca salió del dispositivo, esas filas no existen: mandarlas las
   CREARÍA. Es la regla que vigila la mutación M05. */
console.log('\nE · se quita un camión de un viaje que NUNCA se sincronizó');
{
  const data = viajeBase();
  cli._trasAsegurarIds(data);
  const reg = { id: 'tvE', data, everSynced: false };
  cli._trasSacarCamion(data, 0);
  const p = cli.buildTrasPayload([reg]);
  const enBlanco = p.rows.filter((f) => f[col('Placa')] === '' && f[iID] !== '').length;
  comp('NO se emite ni una fila de apagado', enBlanco, 0);
  comp('sólo van las filas del camión que queda', p.rows.length, 24);
}

/* ══ ESCENARIO F · el troceado en lotes ═══════════════════════════════════ */
console.log('\nF · troceado en lotes y su acople con el maxRows del GAS');
{
  const tope = cli.TRAS_MAX_FILAS;
  comp('TRAS_MAX_FILAS es el maxRows del GAS (600)', tope, 600);

  // Muchos viajes pendientes: el troceado no puede perder ni duplicar filas.
  const regs = [];
  for (let k = 0; k < 20; k++) {
    const d = viajeBase();
    cli._trasAsegurarIds(d);
    regs.push({ id: 'tvF' + k, data: d, everSynced: false });
  }
  const lotes = cli._trasLotes(regs, tope);
  const total = regs.length * 48;
  const sumadas = lotes.reduce((a, lote) => a + cli.buildTrasPayload(lote).rows.length, 0);
  comp('la suma de los lotes es el viaje entero', sumadas, total);
  const maxLote = Math.max(...lotes.map((l) => cli.buildTrasPayload(l).rows.length));
  comp('ningún lote supera el tope del GAS', maxLote <= tope, true);

  // Y contra la hoja: el resultado de enviar por lotes es el mismo que de una vez.
  const ws = hojaFalsa(H);
  lotes.forEach((l) => gas.upsertAstRows(ws, cli.buildTrasPayload(l).rows));
  comp('la hoja acaba con todas las filas, sin duplicar', filasDe(ws).length, total);
  const ids = new Set(filasDe(ws).map((f) => String(f[iID])));
  comp('y todos los IDs son distintos', ids.size, total);
}

/* ══ ESCENARIO G · idempotencia ═══════════════════════════════════════════
   Sincronizar dos veces lo mismo no puede duplicar ni una fila. */
console.log('\nG · sincronizar DOS VECES el mismo viaje sin cambios');
{
  const data = viajeBase();
  cli._trasAsegurarIds(data);
  const reg = { id: 'tvG', data, everSynced: false };
  const ws = hojaFalsa(H);
  const p = cli.buildTrasPayload([reg]);
  const r1 = gas.upsertAstRows(ws, p.rows);
  const r2 = gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);
  comp('el primer envío da de alta 48', r1.appended, 48);
  comp('el segundo NO da de alta ninguna', r2.appended, 0);
  comp('el segundo actualiza las 48', r2.upserted, 48);
  comp('la hoja sigue con 48 filas', filasDe(ws).length, 48);
}

/* ══ ESCENARIO H · las coordenadas negativas ══════════════════════════════ */
console.log('\nH · la longitud de Ecuador es NEGATIVA y no puede saneársele el signo');
{
  const data = viajeBase();
  cli._trasAsegurarIds(data);
  const p = cli.buildTrasPayload([{ id: 'tvH', data, everSynced: false }]);
  const lons = p.rows.map((f) => f[col('Longitud')]).filter((v) => v !== '');
  comp('todas las longitudes siguen siendo negativas', lons.every((v) => Number(v) < 0), true);
  const lats = p.rows.map((f) => f[col('Latitud')]).filter((v) => v !== '');
  comp('todas las latitudes siguen siendo negativas', lats.every((v) => Number(v) < 0), true);
}

/* ══ ESCENARIO I · apagar y VOLVER A ENCENDER antes de sincronizar ═════════
   La llave queda anotada en `_quitados` al apagar, pero el envío la escribe VIVA.
   Si el apagado ganara, la fila saldría en blanco y se perdería lo recién medido
   sin un solo aviso. Es la regla `if(vivos[fid]) return;`. */
console.log('\nI · se apaga una tina y se vuelve a encender ANTES de sincronizar');
{
  const data = viajeBase();
  cli._trasAsegurarIds(data);
  const reg = { id: 'tvI', data, everSynced: false };
  const ws = hojaFalsa(H);
  gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);
  reg.everSynced = true;

  const cam = data.camiones[0];
  // Se apaga la tina 3 —queda anotada para apagarla en la hoja—…
  cam.tinasOff = [3, 7, 8];
  cli._trasOlvidar(data, cli._trasSufijos([cam.cid], cli._trasRids(data), [3]));
  // …y el chequeador se da cuenta y la vuelve a encender, sin haber sincronizado.
  cam.tinasOff = [7, 8];

  const p = cli.buildTrasPayload([reg]);
  const filasT3 = p.rows.filter((f) => f[col('Placa')] === 'AAA-111'
    && String(f[col('Tina')]) === '3');
  comp('la tina reencendida vuelve a emitir sus 4 filas', filasT3.length, 4);
  const conDato = filasT3.filter((f) => f[col('Oxígeno (mg/L)')] !== '').length;
  comp('LAS 4 LLEVAN SU MEDICIÓN, no van en blanco', conDato, 4);
  const enBlanco = p.rows.filter((f) => f[col('Placa')] === '' && f[iID] !== '').length;
  comp('no se emite ningún apagado para una llave viva', enBlanco, 0);

  gas.upsertAstRows(ws, p.rows);
  const vivasHoja = filasDe(ws).filter((f) => f[col('Placa')] === 'AAA-111'
    && String(f[col('Tina')]) === '3' && f[col('Oxígeno (mg/L)')] !== '').length;
  comp('y en la hoja conserva su medición', vivasHoja, 4);
}

console.log('\n======================================================================');
console.log(fallos ? ' *** ' + fallos + ' FALLOS de ' + pruebas + ' comprobaciones ***'
                   : ' LAS ' + pruebas + ' COMPROBACIONES PASAN');
console.log('======================================================================');
process.exit(fallos ? 1 : 0);
