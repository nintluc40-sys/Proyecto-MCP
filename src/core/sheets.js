/* ============================================================
   GOOGLE SHEETS — motor de conexión y extracción
   Portado y refinado del original (autoConnectSheets, _fetchAsXLSX,
   fetchCSVRobust, parseCSV, getSheetGids, detectSheetName,
   processAndDisplaySheetsData).

   Estrategia (4.2-B, 2026-10-11; la MISMA en el Worker y aquí desde la pauta 17, 2026-10-22):
     1) Cada hoja por su CSV de exportación → hojasPorCsv (descubre las pestañas por /htmlview y
        pide CSV_A_LA_VEZ a la vez; lo lee csvLector, sin SheetJS)
     2) Si eso no llega completo, el libro XLSX entero → export?format=xlsx (fetchXlsxSheets)
     3) Si tampoco, el respaldo por hojas → el XLSX de cada hoja por gid; si el de una falla, su
        CSV de exportación, y gviz/tq?out:csv sólo si ése tampoco llega (B4, 2026-10-22)
     4) Sin libro ni respaldo, lo que llegó por CSV, como INCOMPLETO (isDegraded no lo deja pisar
        un set mayor)

   Cada fila se etiqueta con _SheetOrigin (Larvicultura, Control_Tanque,
   Maduracion, Lab_Algas, Morfologia) y se sella el Módulo desde el
   nombre de pestaña cuando aplica.
   ============================================================ */
import { SHEETS_URL, FETCH_TIMEOUT_MS, XLSX_TIMEOUT_MS, SIN_DATOS_MS } from '../config.js';
import { store, emit, EV } from './store.js';
import { autoCalcMortalidad, getField, F } from './fields.js';
import { parseAnyDate, clearDateCache } from './dates.js';
import { isUnsafeKey } from './util.js';
import { leerCsv } from './csvLector.js';

// ---------- utilidades de red ----------
// Cada respuesta con el control que puede cortarla: su reloj (`ms`) cubre sólo hasta las cabeceras; el cuerpo lo vigila
// cuerpoDe/textoDe, más abajo (2026-10-07, punto 9).
const _cortes = new WeakMap();
function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, ms);
  opts.signal = ctrl.signal;
  return fetch(url, opts)
    .then((r) => { if (r && typeof r === 'object') _cortes.set(r, ctrl); return r; })
    .finally(() => clearTimeout(t));
}

export function parseSheetsIds(url) {
  const pub = url.match(/\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (pub) return { type: 'pub', pubId: pub[1] };
  const real = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (real) return { type: 'real', realId: real[1] };
  return null;
}

export function activeUrl() {
  return (store.sheetsUrlOverride && store.sheetsUrlOverride.trim()) || SHEETS_URL;
}

// ---------- clasificación ----------
export function classifyOrigin(name) {
  const n = String(name).trim();
  if (/^Control_Tanque/i.test(n)) return 'Control_Tanque';
  if (/registro[_\s]*supervisi/i.test(n)) return 'Registro_Supervision';
  // ⚠ Va ANTES que la regla de «larvicultura|larvi»: la hoja del traslado no lleva
  // esa palabra hoy, pero dejarla detrás sería confiar en que nunca la lleve. Su
  // origen alimenta la sub-vista de Traslado del Supervisor.
  if (/registro[_\s]*traslado/i.test(n)) return 'Registro_Traslado';
  // 🎯 Score del AsT (2026-10-03): su hoja lleva Módulo, Corrida y Tanque, así que sin esta regla —y por las cabeceras,
  // en `detectSheetName`— caería en Larvicultura. Alimenta la sub-vista Despacho del Supervisor.
  if (/registro[_\s]*score/i.test(n)) return 'Registro_Score';
  // 🧾 Auditoría del AsT (2026-10-03): también lleva Módulo, Corrida y Tanque —sin esta regla, Larvicultura—. Alimenta
  // la sub-vista 🧾 Auditoría del Supervisor.
  if (/registro[_\s]*auditor/i.test(n)) return 'Registro_Auditoria';
  // ⚠ Va ANTES que la regla de «microbiolog»: "Patología en Fresco" es una hoja del
  // módulo Microbiología, así que una pestaña renombrada a "Microbiología — Patología
  // en Fresco" la reclamaría /microbiolog/i y sus filas entrarían en Bacteriología,
  // que lee un juego de columnas por completo distinto. Delante, cae donde debe.
  // Sin esta regla el origen era el nombre CRUDO de la pestaña: nada lo consumía mal,
  // pero tampoco había cadena canónica contra la que comparar (acentos, "fresco" en
  // minúscula). La hoja la escribe el monolito como PAT_SHEET (engine.js).
  if (/patolog/i.test(n)) return 'Patología en Fresco';
  if (/microbiolog/i.test(n)) return 'Microbiología';
  if (/calidad\s*de\s*agua/i.test(n)) return 'Calidad de Agua';
  if (/^marea/i.test(n)) return 'Marea';
  // 🌦 Clima (2026-10-27): las dos hojas que escribe el Apps Script APARTE «MCP · clima» (GAS/Clima.gs). «horas» va
  // ANTES: si no, la regla de «Clima» se la quedaría. `\b`: «Climatización» no es una de ellas.
  if (/^clima\s+horas/i.test(n)) return 'Clima horas';
  if (/^clima\b/i.test(n)) return 'Clima';
  if (/biomol/i.test(n)) return 'Biomol';
  if (/larvicultura|larvi/i.test(n)) return 'Larvicultura';
  // Hojas del Registro reproductivo (Maduración): _SheetOrigin específico para que la
  // Consulta las lea por nombre exacto (el resto de Maduración cae en 'Maduracion').
  if (/maduraci[oó]n\s+matriz/i.test(n)) return 'Maduración MATRIZ';
  if (/maduraci[oó]n\s+bit[aá]cora/i.test(n)) return 'Maduración Bitácora';
  if (/maduraci[oó]n\s+transferencias/i.test(n)) return 'Maduración Transferencias';
  if (/maduracion|maduración/i.test(n)) return 'Maduracion';
  if (/algas|lab_algas/i.test(n)) return 'Lab_Algas';
  if (/morfolog/i.test(n)) return 'Morfologia';
  return n;
}

/** Detecta el módulo embebido en el nombre de pestaña (p.ej. "Larvicultura - M01"). */
function moduleFromTabName(name, isTanque) {
  const dash = name.match(/[-–]\s*([A-Za-z0-9]+)\s*$/);
  const tq = isTanque ? name.match(/Control_Tanque\s+([A-Za-z0-9]+)/i) : null;
  const generic = name.match(/\b(M\d+|CIO|[A-Z]{2,4}\d*)\b/);
  const m = (dash || tq || generic || [])[1] || null;
  return m ? m.toUpperCase() : null;
}

/** Detecta nombre de hoja por título o por columnas (para el fallback CSV).
 *  Exportada SÓLO para poder probarla: es la rama que se recorre cuando el gid llegó
 *  sin título, y su orden de heurísticas es justo lo que hay que fijar con pruebas. */
export function detectSheetName(rows, gid, rawTitle) {
  if (rawTitle) {
    const origin = classifyOrigin(rawTitle);
    if (origin !== String(rawTitle).trim()) return origin;
  }
  if (!rows?.length) return 'Hoja' + (gid + 1);
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase().trim());
  const has = (pred) => keys.some(pred);
  // 🎯 Score del AsT (2026-10-03): «Score» + «Interpretación» es su firma. Va la PRIMERA porque sus criterios
  // («Hepatopáncreas · …», «Branquias · …») la harían pasar por Patología en Fresco, y Módulo/Corrida por Larvicultura.
  if (has((k) => k === 'score') && has((k) => k.startsWith('interpretaci'))) return 'Registro_Score';
  // 🧾 Auditoría (2026-10-03): «Tipo» + «Cantidad facturada» es su firma; también antes que Larvicultura.
  if (has((k) => k === 'tipo') && has((k) => k === 'cantidad facturada')) return 'Registro_Auditoria';
  if (has((k) => k === 'hora') && has((k) => k === 'tanque') &&
      has((k) => k === 'od' || k.startsWith('ox') || k === 'temperatura' || k === 'temp')) return 'Control_Tanque';
  if (has((k) => k.includes('cel_ml') || k.includes('tipo_cultivo') || k.includes('corrida_algas'))) return 'Lab_Algas';
  if (has((k) => k.includes('ihhnv') || k.includes('wssv') || k.includes('ahpnd'))) return 'Biomol';
  // Microbiología: tríos "<patógeno> UFC"/"… Nivel" + V.Luminiscentes (firma propia).
  if (has((k) => k.includes('luminiscent')) || has((k) => k.includes('v.totales') || k.includes('v.amarillos'))) return 'Microbiología';
  // Registro reproductivo (MATRIZ / Bitácora / Transferencias). El «Trovan ID» es su
  // firma y NO aparece en ninguna otra hoja del documento (medido el 2026-08-31 sobre
  // las cabeceras reales de las 35 pestañas: sólo lo llevan estas). Sin esta rama las
  // tres caían al final y salían como "Hoja<N>", con lo que MAD_MATRIZ_ORIGIN y sus
  // hermanas no casaban y la vista de Maduración se quedaba VACÍA — el mismo fallo
  // silencioso que tenía Patología, y por la misma razón: ninguna firma por columnas.
  // Se distinguen entre sí por su columna exclusiva; el orden va de la más específica
  // a la más genérica.
  if (has((k) => k.includes('trovan'))) {
    if (has((k) => k.includes('tr-id'))) return 'Maduración Transferencias';
    if (has((k) => k.includes('sala actual') || k.includes('color anillo'))) return 'Maduración MATRIZ';
    return 'Maduración Bitácora';
  }
  // Maduración Lotes / Tanques: «Sala» MÁS una columna de población reproductiva.
  // ⚠ Son DOS `has` independientes a propósito. Hasta el 2026-09-01 esto pedía que UNA
  //   MISMA cabecera contuviera «sala» Y «machos|hembras|nauplio», y en las hojas reales
  //   son columnas SEPARADAS («Sala» por un lado, «Total de nauplios» por otro): la
  //   condición no podía cumplirse NUNCA. Medido, casaba 0 de 35 pestañas, y Lotes y
  //   Tanques caían al final como "Hoja<N>". Corregida casa esas dos y sólo esas.
  /* ⚠⚠ «CÓDIGO GENÉTICO» ENTRA COMO SEGUNDA FIRMA · 2026-09-08, y no es un adorno.
     La hoja `Maduración Lotes` se rediseñó a evento de DESOVE (Fase 4A) y en el camino perdió
     su columna «Sala» —un desove es de (lote, código genético), NUNCA de un tanque ni de una
     sala—. Con sólo la firma «sala» dejó de reconocerse y caía a «Hoja<N>», que es EXACTAMENTE
     el fallo silencioso que el comentario de arriba describe para MATRIZ/Bitácora: la vista se
     queda vacía y nadie ve un error.
     🔑 Se eligió «código genético» porque sólo lo llevan hojas de Maduración —`Lotes` e
     `Ingreso`—, así que ensancha lo justo. Que no se lleve por delante ninguna de las otras lo
     comprueba la prueba de las 35 pestañas, que exige que el camino por COLUMNAS y el camino
     por NOMBRE coincidan en todas.
     ⚠ Va con y sin tilde: las cabeceras se comparan en minúsculas pero nadie garantiza la
     acentuación de una pestaña tecleada a mano. */
  if ((has((k) => k.includes('sala')) || has((k) => k.includes('genético') || k.includes('genetico'))) &&
      has((k) => k.includes('machos') || k.includes('hembras') || k.includes('nauplio'))) return 'Maduracion';
  /* ⚠⚠ «Maduración Fin de Ciclo» NO TENÍA NI «Sala» NI «código genético», así que la regla
     de arriba no la alcanzaba: un cierre es de un LOTE entero. (Del 2026-09-14 —D14— al 2026-10-09 llevó
     «Sala» para el Parcial; desde entonces ya no la lleva, así que esta firma es la que la reconoce.) Sin esta línea cae al final como «Hoja<N>» — el mismo
     fallo silencioso que se cazó el 2026-09-08 con «Maduración Lotes», y por el mismo
     motivo: un diseño nuevo la dejó sin la columna que le servía de firma.
     Medido el 2026-09-09 sobre sus cabeceras reales: por COLUMNAS daba «Hoja1» y por
     NOMBRE «Maduracion». Entonces la hoja aún no existía en producción —nació con el
     re-despliegue del GAS— y se corrigió ANTES de que nadie pudiera verlo roto; hoy existe
     (medido el 2026-10-23) y es esta firma la que la reconoce.
     🔑 «metabisulfito» es firma PROPIA: no aparece en ninguna cabecera de las 35 pestañas
     vivas (medido sobre cabeceras-produccion.json), así que no le roba nada a nadie. */
  if (has((k) => k.includes('metabisulfito'))) return 'Maduracion';
  // «Maduración Tratamientos» (2026-09-15): «Productos RAS», por igualdad exacta, es firma propia.
  if (has((k) => k === 'productos ras')) return 'Maduracion';
  // «Maduración Mortalidad Desove» (2026-09-15): «Tipo de tanque», por igualdad exacta, es firma propia.
  if (has((k) => k === 'tipo de tanque')) return 'Maduracion';
  /* «Maduración Broodstock» (V1, 2026-09-18): «Pl/g», por igualdad exacta, es firma propia —Larvicultura lleva «Plg»
     y «Plg (manual)», que no son iguales—. Medido antes de ponerla: por COLUMNAS daba «Hoja1» y por NOMBRE
     «Maduracion», el mismo fallo que tuvieron Fin de Ciclo y Lotes, y se corrige antes de que la hoja exista. */
  if (has((k) => k === 'pl/g')) return 'Maduracion';
  // Maduración Sala es la hoja de AMBIENTE: no lleva machos ni hembras ni nauplios, así
  // que la regla de arriba no la alcanza. Su firma es la columna «RAS».
  // ⚠⚠ POR IGUALDAD EXACTA, nunca por `includes`: como subcadena, «ras» casa 16 de las
  //   35 pestañas —«% Atraso», «Muestras», «Levaduras», «Hembras muertas», «Retraso»…—
  //   y se las robaría todas. Medido el 2026-09-01 sobre las cabeceras reales.
  if (has((k) => k === 'ras') || has((k) => k.includes('temperatura 2:00'))) return 'Maduracion';
  // Registro_Supervisión comparte columnas (Intestino, Deformidad, Módulo) con
  // Morfologia/Larvicultura; debe detectarse ANTES por su firma propia.
  if (has((k) => k.includes('supervisor')) &&
      has((k) => k.includes('tipo_revis') || k.includes('condici') || k.includes('acci'))) return 'Registro_Supervision';
  // Patología en Fresco tiene firma PROPIA: los grupos «Hepatopáncreas» y «Branquias»
  // de su ficha, que ninguna otra hoja del documento lleva. Esta rama sólo se recorre
  // cuando el gid llegó SIN título (respaldo CSV, sheets.js:320), que es justo cuando
  // no hay nombre del que tirar.
  if (has((k) => k.includes('hepatop') || k.includes('branquias'))) return 'Patología en Fresco';
  /* ❌ NO devolver 'Morfologia' por `intestino|deformidad|lleno`. Esa regla vivió aquí
     hasta el 2026-09-01 y era un MISCLASIFICADOR puro: «Intestino» y «Deformidad» no
     son firma de Morfología —los llevan también las ONCE hojas «Datos Larvicultura» y
     Registro_Supervisión—, así que las once salían como 'Morfologia' cuando el gid
     llegaba sin título. Y como `isLarviculturaRow` (core/fields.js) compara la cadena
     EXACTA, TODA la producción de Larvicultura desaparecía del tablero sin un solo
     error visible.
     No existe ninguna pestaña «Morfologia» en el documento (35 medidas el 2026-09-01)
     y NADIE consume ese origen. Si algún día la hubiera, `classifyOrigin` la reconoce
     por NOMBRE (/morfolog/i), que sí es una firma específica. Una regla cuya firma no
     distingue su objetivo de otras hojas es peor que no tener regla. */
  /* ── Hojas que caían en el cajón genérico por no tener firma propia ───────────────
     Las cuatro llevan Corrida y/o Módulo, así que sin firma propia caían en
     'Larvicultura' —la regla de abajo— y sus filas entraban en el tablero equivocado.
     Cada token de aquí está MEDIDO como único entre las 35 pestañas reales
     (2026-09-01); van antes de 'Larvicultura' justo porque ésa es quien las capturaba. */
  if (has((k) => k.includes('viaje')) && has((k) => k.includes('placa'))) return 'Registro_Traslado';
  if (has((k) => k.includes('alcalinidad') || k.includes('am.tóxico')
              || k.includes('cloro libre'))) return 'Calidad de Agua';
  if (has((k) => k.includes('tipo de registro')) &&
      has((k) => k.includes('elemento'))) return 'Registro_Desinfección';
  if (has((k) => k.includes('pleamar') || k.includes('bajamar')
              || k.includes('fase lunar'))) return 'Marea';
  // 🌦 Clima (2026-10-27): sus cabeceras son las de GAS/Clima.gs (COL_HORAS y COL_DIAS); ninguna otra pestaña lleva
  // «Fuente nubosidad» ni «Temp mín (°C)».
  if (has((k) => k === 'fuente nubosidad') && has((k) => k === 'hora')) return 'Clima horas';
  if (has((k) => k === 'temp mín (°c)') && has((k) => k === 'tipo')) return 'Clima';
  // 🔧 Mantenimiento (2026-10-29, usuario: «Sí, las 4 firmas»): sus cuatro hojas (las cabeceras, en
  // ficha-mantenimiento.schema.js y mantenimiento.data.js). Ninguna otra pestaña lleva «Equipo», «Parada…»,
  // «Ajuste hor…» ni «Intervalo…». Sin esto caían en «Hoja<N>» y la vista 🔧 decía «Falta la hoja».
  // «Unidad» (2026-10-30, usuario: «Aceptar "Unidad"»): el lector (mantenimiento.data.js) la acepta en lugar de «Equipo».
  const equipo = (k) => k === 'equipo' || k === 'unidad';
  if (has(equipo) && has((k) => k.startsWith('parada'))) return 'Mantenimiento Trabajos';
  if (has(equipo) && has((k) => k.startsWith('corriente'))) return 'Mantenimiento Lecturas';
  if (has((k) => k.startsWith('ajuste hor'))) return 'Mantenimiento Equipos';
  if (has((k) => k === 'actividad') && has((k) => k.startsWith('intervalo'))) return 'Mantenimiento Plan';
  if (has((k) => k.includes('corrida') || k.includes('módulo') || k.includes('modulo') || k.includes('supervivencia'))) return 'Larvicultura';
  return rawTitle || ('Hoja' + (gid + 1));
}

// ---------- normalización de filas ----------
function stampRows(rows, name) {
  const origin = classifyOrigin(name);
  const isTanque = origin === 'Control_Tanque';
  const isLarv = origin === 'Larvicultura';
  const modStamp = (isTanque || isLarv) ? moduleFromTabName(name, isTanque) : null;
  rows.forEach((row) => {
    row._SheetOrigin = origin;
    if (modStamp) {
      if (isLarv) {
        row['Módulo'] = modStamp;
      } else if (isTanque) {
        const hasMod = F.modulo.some((k) => row[k] && String(row[k]).trim());
        if (!hasMod) row['Módulo'] = modStamp;
      }
    }
  });
  return rows;
}

// ---------- XLSX (camino principal) ----------
function getXLSX() {
  const X = window.XLSX;
  if (!X) throw new Error('SheetJS (XLSX) no se cargó: revisa la conexión y recarga');
  return X;
}

/** Opciones de lectura del libro. `dense: true` (P1, 2026-10-01): misma salida que sin él —lo fija
 *  src/core/sheets.delta.test.js con un Excel real—, pero cada hoja se guarda en arrays y no en un
 *  objeto por celda: menos memoria y una lectura bastante más rápida. */
export const XLSX_LECTURA = { type: 'array', cellDates: true, dense: true };
/** Cómo se convierte cada hoja en filas: la MISMA para el libro entero y para el respaldo por hojas. */
const FILAS_LECTURA = { defval: '', raw: false, dateNF: 'dd/mm/yyyy' };
/* B3 (2026-10-22, usuario) · LOS MILES DEL CAMINO DEL XLSX. Con `raw: false` cada número sale con el formato de su celda,
   y SheetJS lo escribe SIEMPRE a la inglesa: «1,061», «7,400,000.0». `parseNum` los leía 1,061 y 7,4. Medido el 22-10 con
   el libro real: 16 celdas, en Plg, Biomasa y Población de Larvicultura. Se quita la coma de miles en las celdas
   NUMÉRICAS antes de sacar las filas: el texto formateado (`w`) es lo que da `sheet_to_json`, y en un número la coma sólo
   puede ser de miles. Los textos no se tocan («556,557» sigue igual). Se corrige en la lectura y no en `parseNum`: aquí se
   sabe qué es cada celda; allí «1,025» o «1.061» no se pueden leer sin adivinar. */
function sinMilesEnNumeros(hoja) {
  const quitar = (c) => { if (c && c.t === 'n' && typeof c.w === 'string' && c.w.includes(',')) c.w = c.w.replace(/,/g, ''); };
  if (Array.isArray(hoja['!data'])) { for (const fila of hoja['!data']) if (fila) for (const c of fila) quitar(c); }   // dense
  else for (const k in hoja) if (k[0] !== '!') quitar(hoja[k]);
  return hoja;
}
/** Las filas de una hoja del XLSX (FILAS_LECTURA), con sus números sin separador de miles. */
function filasDeXlsx(XLSX, hoja) {
  return XLSX.utils.sheet_to_json(sinMilesEnNumeros(hoja), FILAS_LECTURA);
}

/* Punto 7 del usuario (2026-10-03) · la PRIMERA carga dice cómo va: `avisar` recibe { fase: 'descarga', bytes } cada
   AVISO_CADA bytes y { fase: 'lectura', bytes } antes de leer (medido: ~8 s de descarga de 13 MB y 16 s de lectura).
   Google no manda Content-Length (va troceado): se cuenta lo que llega, sin porcentaje.
   Punto 9 del usuario (2026-10-07) · el cuerpo se lee SIEMPRE por trozos y se corta si pasan SIN_DATOS_MS sin recibir
   nada: antes el reloj de fetchWithTimeout se apagaba con las cabeceras y una red atascada a mitad dejaba la descarga
   esperando para siempre (medido el 06-10: «0,5 MB» fijos 14 min). Cortada, falla con NO_AVANZA y entran los reintentos
   y el respaldo de siempre. Sólo sin flujo en la respuesta (navegadores muy viejos) se lee de una vez, sin vigilar. */
const AVISO_CADA = 512 * 1024;
const NO_AVANZA = `La red no avanza: ${SIN_DATOS_MS / 1000} s sin recibir datos.`;
async function cuerpoDe(resp, avisar = null) {
  if (!resp.body || typeof resp.body.getReader !== 'function') return resp.arrayBuffer();
  const lector = resp.body.getReader();
  const ctrl = _cortes.get(resp);
  let vigia = 0, atascada = false;
  const vigilar = () => {
    clearTimeout(vigia);
    vigia = setTimeout(() => { atascada = true; try { if (ctrl) ctrl.abort(); else lector.cancel(); } catch (_) { /* ya terminó */ } }, SIN_DATOS_MS);
  };
  const trozos = [];
  let bytes = 0, avisado = 0;
  try {
    vigilar();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      vigilar();
      trozos.push(value);
      bytes += value.length;
      if (avisar && bytes - avisado >= AVISO_CADA) { avisado = bytes; avisar({ fase: 'descarga', bytes }); }
    }
  } catch (e) {
    throw atascada ? new Error(NO_AVANZA) : e;
  } finally {
    clearTimeout(vigia);
  }
  if (atascada) throw new Error(NO_AVANZA);   // cortada con cancel(): la lectura acaba como si terminara
  const todo = new Uint8Array(bytes);
  let o = 0;
  for (const t of trozos) { todo.set(t, o); o += t.length; }
  return todo.buffer;
}
/** El cuerpo como texto, con la misma vigilancia (UTF-8, como Response.text()). */
async function textoDe(resp) {
  if (!resp.body || typeof resp.body.getReader !== 'function') return resp.text();
  return new TextDecoder('utf-8').decode(await cuerpoDe(resp));
}
const mb = (b) => (b / 1048576).toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB';
/** El rótulo de un aviso de `avisar` (el aviso de carga y la píldora). Punto 9 (2026-10-07): también dice cuándo la red
 *  no avanzó y se reintenta (y en qué intento va la descarga), y cuándo se pasa al respaldo hoja a hoja. */
export function textoProgreso(p) {
  if (p && p.fase === 'lectura') return `Leyendo el libro (${mb(p.bytes)})…`;
  if (p && p.fase === 'reintento') return `Descargando el libro… ${mb(p.bytes || 0)} · ${p.atascada ? 'la red no avanza, ' : ''}reintento ${p.intento} de ${p.de}`;
  if (p && p.fase === 'hojas') return `Descargando las hojas… ${p.hechas} de ${p.de}`;   // 4.2-B: cada hoja por su CSV
  if (p && p.fase === 'respaldo') return 'El libro entero no llegó: probando hoja por hoja…' + (p.de ? ` ${p.hechas} de ${p.de}` : '');
  const intento = p && p.intento > 1 ? ` · intento ${p.intento} de ${p.de}` : '';
  return `Descargando el libro… ${mb((p && p.bytes) || 0)}${intento}`;
}

async function fetchWorkbook(ids, obtenerXLSX = getXLSX, avisar = null) {
  const realId = ids.type === 'real' ? ids.realId : null;
  if (!realId) return null;
  const url = `https://docs.google.com/spreadsheets/d/${realId}/export?format=xlsx&_cb=${Math.floor(Date.now() / 30000)}`;
  // Timeout propio (más generoso): Google genera el workbook en el servidor antes
  // de transferirlo. Un timeout corto aquí es la causa raíz del "solo carga 1 hoja".
  const resp = await fetchWithTimeout(url, { cache: 'no-store' }, XLSX_TIMEOUT_MS);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const buf = await cuerpoDe(resp, avisar);
  if (avisar) {
    avisar({ fase: 'lectura', bytes: buf.byteLength });
    await new Promise((r) => setTimeout(r, 0));   // sin Worker, que el aviso se pinte antes de que la lectura ocupe la página
  }
  const XLSX = obtenerXLSX();
  const wb = XLSX.read(new Uint8Array(buf), XLSX_LECTURA);
  return wb?.SheetNames?.length ? wb : null;
}

/** Convierte un workbook XLSX en el store de hojas { name: rows[] }. `XLSX` es SheetJS
 *  (window.XLSX aquí; en el Worker de lectura, el suyo). */
export function workbookToSheets(wb, XLSX = getXLSX()) {
  const sheets = {};
  wb.SheetNames.forEach((name) => {
    const rows = filasDeXlsx(XLSX, wb.Sheets[name]);
    if (rows?.length) sheets[name] = stampRows(rows, name);
  });
  return sheets;
}

// ---------- CSV (fallback) ----------
/** Trocea el texto CSV en filas de campos respetando las comillas (RFC 4180).
 *
 *  El salto de línea DENTRO de un campo entrecomillado pertenece al campo y NO separa
 *  filas. Antes se partía por `\n` ANTES de mirar las comillas, así que una celda con un
 *  Enter —«Observaciones» es texto libre tecleado a mano— rompía el bloque: medido sobre
 *  un CSV de 2 filas, devolvía 3, la fila real perdía su ID y se colaba una fila fantasma
 *  con el resto del texto en la primera columna. Esa fila entraba al store con su
 *  `_SheetOrigin` y contaba en KPIs y gráficos, y la legítima quedaba sin ID (justo la
 *  clase de fila que el upsert no puede emparejar).
 *
 *  Devuelve `string[][]`. Una comilla doble escapada («""») produce una comilla literal. */
function splitCSVRows(text) {
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch !== '"') { field += ch; continue; }
      if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      continue;
    }
    if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch; // el \r de CRLF lo cierra el \n
  }
  // Última fila sin salto final. Si el texto termina en '\n', no queda nada pendiente
  // y no se añade una fila vacía de más.
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Exportada para el test que fija el trato de los saltos de línea entrecomillados;
 *  el pipeline la sigue usando sólo desde `fetchViaCsv`. */
export function parseCSV(text) {
  const raw = splitCSVRows(text);
  if (raw.length < 2) return [];
  const headers = raw[0].map((h) => h.trim());
  const validIdx = headers.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const vals = raw[i];
    if (!vals.length) continue;
    // Línea en blanco: equivalente exacto del `!lines[i].trim()` anterior, que sólo
    // descartaba líneas SIN comas. Una fila de comas sueltas (",,") seguía produciendo
    // un objeto de campos vacíos y lo sigue haciendo.
    if (vals.length === 1 && !vals[0].trim()) continue;
    const row = {};
    validIdx.forEach((k) => { row[headers[k]] = vals[k] !== undefined ? vals[k].trim() : ''; });
    rows.push(row);
  }
  return rows;
}

function buildCsvUrl(ids, gid = 0) {
  const bust = '&_cb=' + Math.floor(Date.now() / 60000);
  if (ids.type === 'pub') {
    const base = `https://docs.google.com/spreadsheets/d/e/${ids.pubId}/pub?output=csv`;
    return (gid === 0 ? base : base + '&gid=' + gid) + bust;
  }
  return `https://docs.google.com/spreadsheets/d/${ids.realId}/gviz/tq?tqx=out:csv&gid=${gid}${bust}`;
}

async function fetchCSV(url, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetchWithTimeout(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      let text = await textoDe(r);
      if (/^<!DOCTYPE|^<html/i.test(text.trim())) {
        throw new Error('Documento no accesible. Compártelo como "Cualquier persona con el enlace" o publícalo (Archivo → Compartir → Publicar en la web).');
      }
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      return text;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((res) => setTimeout(res, 600 * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** Extrae las pestañas (gid + nombre) del HTML de una hoja de Google. Fuente principal:
 *  el bloque `items.push({name:"Hoja", pageUrl:"...gid=NNN"})` de /htmlview (nombre y gid
 *  autoritativos, disponible con permiso de lectura por enlace SIN publicar el documento).
 *  Respaldo: cualquier gid suelto del HTML. Puro y testeable. */
export function extractSheetTabs(html) {
  const found = new Map(); // gid -> title
  const nameRe = /items\.push\(\{name:\s*"([^"]+)"[\s\S]{1,200}?gid=(\d+)/g;
  let m;
  while ((m = nameRe.exec(html)) !== null) { const g = +m[2]; if (!found.has(g)) found.set(g, m[1]); }
  // Respaldo sin nombre: gids sueltos (≥4 dígitos para evitar falsos positivos).
  [/[?&#"'=]gid=(\d{4,})/g, /"gid"\s*:\s*"(\d+)"/g, /data-gid="(\d+)"/g].forEach((re) => {
    let mm; while ((mm = re.exec(html)) !== null) { const g = +mm[1]; if (g > 0 && !found.has(g)) found.set(g, ''); }
  });
  return [...found.entries()].map(([gid, title]) => ({ gid, title }));
}

// Caché persistente de las pestañas descubiertas (por documento). Permite recuperar todas
// las hojas aunque la enumeración falle puntualmente (p. ej. un 5xx transitorio de Google).
const GID_CACHE_KEY = 'larv4_sheet_tabs';
function cacheTabs(docId, list) {
  // `docId` sale de la URL del Sheet, que el usuario puede sobrescribir, y el patrón
  // [a-zA-Z0-9_-]+ admite literalmente "__proto__". Asignarlo sobre un objeto de
  // JSON.parse invoca el setter y le cambia el prototipo. Es el guard que util.js ya
  // define para este caso exacto; aquí faltaba.
  if (isUnsafeKey(docId)) return;
  try { const all = JSON.parse(localStorage.getItem(GID_CACHE_KEY) || '{}'); all[docId] = list; localStorage.setItem(GID_CACHE_KEY, JSON.stringify(all)); } catch (_) {}
}
/** Rellena con la caché los títulos de pestaña que el raspado no trajo. Puro y testeable.
 *  Sólo toca los vacíos: un título recién raspado SIEMPRE manda sobre el recordado (una
 *  pestaña renombrada tiene que poder cambiar de nombre). Un gid que ya no aparece en el
 *  raspado NO se resucita desde la caché: puede haberse borrado la hoja. */
export function fillTitlesFromCache(list, cached) {
  const previos = new Map((cached || []).map((t) => [Number(t && t.gid), t && t.title]));
  return (list || []).map(({ gid, title }) => ({ gid, title: title || previos.get(Number(gid)) || '' }));
}

function cachedTabs(docId) {
  try { const all = JSON.parse(localStorage.getItem(GID_CACHE_KEY) || '{}'); return Array.isArray(all[docId]) ? all[docId] : []; } catch (_) { return []; }
}

// Ejecuta `fn` sobre `items` con concurrencia acotada (acelera el fallback CSV de N hojas
// sin saturar/limitar la API de Google). Conserva el orden en el array de resultados.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Descubre las pestañas (gid + nombre) de un documento accesible por enlace, SIN depender
 *  de que esté "publicado en la web": raspa /htmlview (funciona con lectura por enlace),
 *  con /pub como respaldo, y cachea el resultado. Si la enumeración falla, usa la caché.
 *  `recordadas` (carga lenta D, 2026-10-19): la lista que recuerda la PÁGINA. En el Worker —donde se lee desde el 12-10—
 *  no hay localStorage: sin ella, el rescate de nombres y la caché de abajo no hacían nada (y se bajaba el libro entero). */
export async function discoverGids(ids, recordadas = null) {
  let realId = ids.type === 'real' ? ids.realId : null;
  if (!realId && ids.type === 'pub') {
    try {
      const r = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/e/${ids.pubId}/pub`, { cache: 'no-store' });
      const mm = (await textoDe(r)).match(/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
      if (mm) realId = mm[1];
    } catch (_) {}
  }
  const docId = realId || ids.pubId || '';
  const merge = new Map();
  const scrape = async (url) => {
    try {
      const r = await fetchWithTimeout(url, { cache: 'no-store' });
      if (!r.ok) return;
      extractSheetTabs(await textoDe(r)).forEach((t) => { if (!merge.has(t.gid) || (!merge.get(t.gid) && t.title)) merge.set(t.gid, t.title); });
    } catch (_) {}
  };
  if (realId) await scrape(`https://docs.google.com/spreadsheets/d/${realId}/htmlview`);
  if (!merge.size) {
    const pubUrl = ids.type === 'pub'
      ? `https://docs.google.com/spreadsheets/d/e/${ids.pubId}/pub`
      : (realId ? `https://docs.google.com/spreadsheets/d/${realId}/pub` : null);
    if (pubUrl) await scrape(pubUrl);
  }
  // ⚠ Un gid puede llegar SIN nombre: `extractSheetTabs` tiene un respaldo que recoge
  // gids sueltos del HTML sin título. Antes esos caían directos a `detectSheetName`, que
  // los adivina POR COLUMNAS — y adivina mal casi siempre: medido el 2026-08-31 sobre las
  // cabeceras reales, las once hojas «Datos Larvicultura» salían como 'Morfologia', y
  // `isLarviculturaRow` (core/fields.js:143) compara la cadena EXACTA, así que toda la
  // producción de Larvicultura habría desaparecido del tablero sin un solo error.
  // El sistema YA sabe cómo se llama esa pestaña —la cacheó en una carga anterior— y no
  // se lo estaba preguntando. Un nombre real recordado gana a cualquier adivinanza.
  const memoria = Array.isArray(recordadas) && recordadas.length ? recordadas : (docId ? cachedTabs(docId) : []);
  const list = fillTitlesFromCache(
    [...merge.entries()].map(([gid, title]) => ({ gid, title })),
    memoria,
  );
  // Al guardar se escribe la lista YA rellenada, no la cruda: antes un raspado incompleto
  // (30 pestañas con nombre y 3 sin él) machacaba en la caché los nombres buenos de esas 3
  // con cadenas vacías, y a partir de ahí ni la caché podía rescatarlas. La caché se
  // degradaba sola, y el único síntoma habría sido el tablero vacío.
  if (list.length) { if (docId) cacheTabs(docId, list); return list; }
  return memoria;
}

/** 2026-10-01 (usuario) · EL RESPALDO LEE CADA HOJA POR SU XLSX, NO POR gviz. Con un FILTRO puesto en la hoja
 *  —el laboratorio los deja a menudo— gviz sólo da las filas VISIBLES (medido en producción: Datos M03, 20 de 1 579;
 *  Control_Tanque M10, 806 de 14 777; el CSV de EXPORTACIÓN, `export?format=csv`, NO recorta: medido el 09 y el 11-10, y
 *  por eso lo usa hojasPorCsv; aquí antes decía que también), y ese set recortado pisaba en silencio el bueno
 *  (`isDegraded` sólo cuenta hojas). El XLSX de la hoja las da TODAS (lo mismo que hace Registros desde el 0v·2) y se
 *  lee con las mismas opciones que el libro entero: las filas salen iguales que por el camino principal.
 *  Devuelve { nombre, filas } (`nombre`: el de la pestaña dentro del XLSX), o null si no se puede (documento
 *  publicado, sin SheetJS, red, 401/403 o lo que llega no es un XLSX —una página de acceso, p. ej.—): entonces ESA hoja
 *  va al CSV de siempre. `obtenerXLSX` da SheetJS (window.XLSX aquí; en el Worker, el suyo). */
async function filasPorXlsxDeHoja(ids, gid, obtenerXLSX = getXLSX) {
  if (ids.type !== 'real') return null;
  let XLSX;
  try { XLSX = obtenerXLSX(); } catch (_) { return null; }
  if (!XLSX) return null;
  const url = `https://docs.google.com/spreadsheets/d/${ids.realId}/export?format=xlsx&gid=${gid}&_cb=${Math.floor(Date.now() / 60000)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchWithTimeout(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = new Uint8Array(await cuerpoDe(r));
      if (buf[0] !== 0x50 || buf[1] !== 0x4B) return null;   // un XLSX es un ZIP («PK»); lo demás, al CSV
      const wb = XLSX.read(buf, XLSX_LECTURA);
      const nombre = wb.SheetNames[0] || '';
      return { nombre, filas: nombre ? filasDeXlsx(XLSX, wb.Sheets[nombre]) : [] };
    } catch (e) {
      if (/\b(401|403)\b/.test(String((e && e.message) || ''))) return null;
      if (attempt < 1) await new Promise((res) => setTimeout(res, 600));
    }
  }
  return null;
}

/** El respaldo cuando el XLSX del libro entero no llega: cada hoja por su XLSX y, sólo si el de ESA hoja no llega, su
 *  CSV. Devuelve { sheets, porCsv, perdidas, sinPestanas }: las hojas leídas; cuántas llegaron por el CSV (pueden venir
 *  recortadas por un filtro); cuántas no llegaron por ningún camino; y si no se pudo saber qué pestañas hay (entonces
 *  sólo se intenta la primera). Lo usan la página (fetchViaCsv) y el Worker (sheets.worker.js), que así lo hace sin
 *  congelar la pantalla: leer una hoja grande por XLSX cuesta ~1,3 s en PC (Control_Tanque M08, 24 743 filas).
 *  `recordadas`: la lista de pestañas que recuerda la página (ver discoverGids). `previas`: las huellas aplicadas.
 *  B4 (2026-10-22, usuario) · el CSV de una hoja es primero el de EXPORTACIÓN, que no recorta por filtros (el que lee
 *  hojasPorCsv), y gviz sólo si ése tampoco llega: gviz da sólo las filas VISIBLES (M08: 3 379 de 24 743) y esa hoja
 *  recortada entraba como buena y pisaba la aplicada sin avisar. Ahora, si gviz trae MENOS filas que lo aplicado, la
 *  hoja cuenta como perdida: el refresco no la aplica (isDegraded) y la píldora dice que faltó. */
export async function respaldoPorHojas(ids, obtenerXLSX = getXLSX, avisar = null, recordadas = null, previas = {}) {
  if (avisar) avisar({ fase: 'respaldo' });   // punto 9: que el aviso de carga no se quede en «reintento 3 de 3»
  const sheets = {};
  let porCsv = 0;
  let perdidas = 0;
  const senales = { es: 0, en: 0 };   // B4: el formato regional de lo que llegue por el CSV de exportación
  const discovered = await discoverGids(ids, recordadas);
  // Con pestañas descubiertas (o cacheadas) se bajan TODAS por gid; sin ninguna, último
  // recurso: la 1ª hoja (gid 0) para no dejar el sistema completamente vacío.
  const targets = discovered.length ? discovered : [{ gid: 0, title: '' }];
  // A1 (2026-10-07): el aviso cuenta las hojas que ya terminaron (bien o mal), para que no se quede quieto minutos
  let hechas = 0;
  const results = await mapLimit(targets, 6, async ({ gid, title }) => {
    try {
      // Su XLSX primero (inmune a los filtros de la hoja); el CSV, sólo si el de ESTA hoja no llega. Una pestaña sin
      // nombre (el Worker no tiene la caché de pestañas) toma el que trae su propio XLSX antes que adivinarlo.
      const x = await filasPorXlsxDeHoja(ids, gid, obtenerXLSX);
      if (x) return x.filas.length ? { name: title || x.nombre || detectSheetName(x.filas, gid), rows: x.filas } : null;
      if (ids.type === 'real') {
        let filas = null;
        try { filas = filasDeCsv(await csvDeHoja(ids, gid), senales); } catch (_) { /* a gviz */ }
        if (filas) return filas.length ? { name: title || detectSheetName(filas, gid), rows: filas, csv: true, exportacion: true } : null;
      }
      const rows = parseCSV(await fetchCSV(buildCsvUrl(ids, gid), 1));
      if (!rows.length) return null;
      const name = title || detectSheetName(rows, gid);
      if (ids.type === 'real' && rows.length < filasAplicadas(previas, name)) { perdidas++; return null; }   // B4: gviz recortó
      // B3 · gviz sale con el formato regional del libro, como el CSV de exportación: se convierte igual y cuenta para la
      // misma guarda (un libro en otro formato no se convierte a ciegas: la hoja falta). El enlace publicado no se midió.
      if (ids.type === 'real') return { name, rows: convertirNumeros(rows, valorDeCsv, senales), csv: true, gviz: true };
      return { name, rows, csv: true };
    } catch (_) { perdidas++; return null; } finally {
      hechas++;
      if (avisar) avisar({ fase: 'respaldo', hechas, de: targets.length });
    }
  });
  const otroFormato = senales.en > senales.es;   // como en hojasPorCsv: la conversión de los números no valdría
  results.forEach((res) => {
    if (!res || sheets[res.name]) return;
    if ((res.exportacion || res.gviz) && otroFormato) { perdidas++; return; }
    sheets[res.name] = stampRows(res.rows, res.name);
    if (res.csv) porCsv++;
  });
  return { sheets, porCsv, perdidas, sinPestanas: !discovered.length };
}

/* ---------- B · cada hoja por su CSV de EXPORTACIÓN (2026-10-11, usuario, punto 4.2-B) ----------
   El libro entero en XLSX pesaba 14,5 MB y leerlo costaba 12–16 s de CPU (el XML); en un celular, más de un minuto.
   `export?format=csv&gid=` (no gviz: ése recorta por filtros) trae TODAS las filas de cada hoja, ~1,4 MB comprimidos las
   44, y leerlas cuesta ~2 s. Medido con el libro real el 11-10: mismas filas y mismas columnas en las 44 hojas y el
   99,998 % de las celdas idénticas al camino del XLSX; difieren 32 celdas con separador de miles que el XLSX deja como
   «7,400,000.0» y la app leía 7,4 (ahora se leen bien, decidido por el usuario) y 24 redondeos en los que el CSV da lo que
   se ve en Sheets (pH 8,475 → «8,48»; SheetJS daba 8.47). Se lee sin adivinar tipos y con las MISMAS opciones de filas
   que el XLSX, así que cabeceras, columnas sin nombre y filas en blanco salen igual: hasta el 19-10 con SheetJS (`raw`);
   desde entonces con el lector propio (csvLector.js, carga lenta C), que da lo mismo en menos de la mitad del tiempo. */
// ⚠ Estas dos expresiones y las dos SENAL_ de abajo empiezan por «-» o una cifra: convertirNumeros salta sin probarlas
// los textos que no empiezan así. Si alguna cambia de comienzo, hay que quitar ese filtro.
const CSV_DECIMAL = /^-?\d+,\d+(E[+-]?\d+)?%?$/;
const CSV_MILES = /^-?\d{1,3}(\.\d{3})+(,\d+)?%?$/;
/** Un valor del CSV, que sale con el formato regional del libro (es: coma decimal, punto de miles), en la forma en que
 *  lo da el camino del XLSX (punto decimal, sin separador de miles). Lo demás —textos, fechas, horas— no se toca. */
export function valorDeCsv(s) {
  if (CSV_DECIMAL.test(s)) return s.replace(',', '.');
  if (CSV_MILES.test(s)) return s.replace(/\./g, '').replace(',', '.');
  return s;
}
// Señales del formato regional: «8,48» sólo puede ser es; «8.48» (1–2 decimales) sólo en-US. Las de miles no deciden.
const SENAL_ES = /^-?\d+,\d{1,2}$/;
const SENAL_EN = /^-?\d+\.\d{1,2}$/;
/** Convierte EN SU SITIO, con `conv`, los valores de `filas` que empiezan por «-» o una cifra, y devuelve las filas.
 *  `senales` (opcional) cuenta cuántos parecen es y cuántos en-US. */
function convertirNumeros(filas, conv, senales = null) {
  for (const f of filas) {
    for (const k in f) {
      const v = f[k];
      if (typeof v !== 'string' || !v) continue;
      const c0 = v.charCodeAt(0);
      if (c0 !== 45 && (c0 < 48 || c0 > 57)) continue;   // ni «-» ni cifra: no casa con ninguna expresión (ver arriba)
      if (senales) { if (SENAL_ES.test(v)) senales.es++; else if (SENAL_EN.test(v)) senales.en++; }
      f[k] = conv(v);
    }
  }
  return filas;
}
/** Las filas de una hoja a partir del texto de su CSV, como las da sheet_to_json del XLSX (FILAS_LECTURA), con los
 *  valores ya convertidos. `senales` (opcional) cuenta cuántos valores parecen es y cuántos en-US. Carga lenta C
 *  (2026-10-19): ya no recibe SheetJS; lee el lector propio (csvLector.js). */
export function filasDeCsv(texto, senales = null) {
  const t = texto.charCodeAt(0) === 0xFEFF ? texto.slice(1) : texto;
  return convertirNumeros(leerCsv(t), valorDeCsv, senales);
}
/** Las filas de la hoja `nombre` según su huella aplicada ('nombre:filas:hash;'), o -1 si no hay. */
function filasAplicadas(previas, nombre) {
  const h = previas && previas[nombre];
  if (!h) return -1;
  const p = String(h).replace(/;$/, '').split(':');
  return p.length >= 3 ? Number(p[p.length - 2]) : -1;
}
async function csvDeHoja(ids, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${ids.realId}/export?format=csv&gid=${gid}&_cb=${Math.floor(Date.now() / 30000)}`;
  const r = await fetchWithTimeout(url, { cache: 'no-store' }, XLSX_TIMEOUT_MS);   // Google genera el CSV: margen del XLSX
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const t = await textoDe(r);
  if (/^\s*<(!DOCTYPE|html)/i.test(t.slice(0, 300))) throw new Error('No llegó un CSV (¿página de acceso?).');
  return t;
}
// Hojas que se piden A LA VEZ (pauta 3.5, 2026-10-15; antes 6): manda la latencia de Google por petición, no el tamaño, y
// con 10 las 44 hojas llegan en ~3,2 s frente a ~4,6 s, sin fallos (medido en el PC con el libro real).
// 2026-10-18 (usuario, opción A de «la carga es más lenta») · 16: Google ya no sirve la exportación «en caliente» y con 10
// el Worker pasaba los primeros 3–4 s de la fase CSV ESPERANDO; medido desde Chrome y desde Node: 10 → 3,8–6,4 s, 15 → 3,5 s,
// 22 → 2,5–3,1 s, sin errores; con 44 Google empieza a contestar 429 (7 de 44). 16 deja margen frente a ese freno.
export const CSV_A_LA_VEZ = 16;
// Si la PRIMERA TANDA entera (las CSV_A_LA_VEZ primeras hojas) falla a la primera sin que llegue NINGUNA hoja (sin red, o
// el CSV bloqueado), se deja el camino del CSV: con la red colgada, cada intento espera su tiempo máximo y 44 hojas lo
// multiplicarían (A1 del 07-10). R1 (auditoría del 1.1, 2026-10-18): se cuentan HOJAS de esa tanda, una vez cada una, no
// intentos: antes 5 hojas que rechazaban rápido dos veces (o las de tandas siguientes) sumaban 10 y se abandonaba aunque el
// resto de la primera tanda fuese a llegar; se descartaba lo que llegaba y se bajaba el libro de 14,5 MB.
/** Todas las hojas por su CSV: { sheets, completo, porXlsx, pestanas } o null si este camino no sirve (sin pestanas o
 *  alguna sin nombre, formato regional que no es el esperado, o nada llega): entonces se lee el libro entero, como antes.
 *  Cada hoja cuyo CSV no llega —o trae MENOS filas que lo aplicado— se pide por su XLSX (`filasPorXlsxDeHoja`);
 *  `completo`: todas llegaron. Lo usa el Worker (sheets.worker.js · atenderLectura). `previas`: las huellas aplicadas.
 *  `recordadas` (carga lenta D, 2026-10-19, usuario): la lista de pestañas de la lectura anterior (la guarda la página).
 *  Con ella, la primera tanda se pide YA, mientras llega /htmlview (0,2–4,8 s medidos el 19-10), y /htmlview sigue
 *  MANDANDO: de lo adelantado sólo se usa lo de las pestañas que él da (una borrada se tira; una nueva se pide; el nombre
 *  es el suyo); si /htmlview falla, se lee con la recordada (discoverGids). `pestanas`: la lista usada, para recordarla.
 *  Pauta 18 (2026-10-22, usuario) · NO necesita SheetJS: el CSV lo lee csvLector (carga lenta C, 2026-10-19). Sólo lo usa
 *  el XLSX de una hoja suelta, que sin él no se pide (`filasPorXlsxDeHoja`). Antes, sin SheetJS, este camino se apartaba
 *  entero y en el Worker no llegaba a probarse. */
export async function hojasPorCsv(ids, obtenerXLSX = getXLSX, avisar = null, previas = {}, recordadas = null) {
  if (!ids || ids.type !== 'real') return null;
  const adelantadas = new Map();   // gid → la petición de su CSV, hecha antes de saber las pestañas
  for (const p of (Array.isArray(recordadas) ? recordadas : []).slice(0, CSV_A_LA_VEZ)) {
    const gid = Number(p && p.gid);
    if (!Number.isFinite(gid) || adelantadas.has(gid)) continue;
    const pedida = csvDeHoja(ids, gid);
    pedida.catch(() => {});   // si falla antes de usarse, lo verá el primer intento de su hoja (o se tira con ella)
    adelantadas.set(gid, pedida);
  }
  const pestanas = await discoverGids(ids, recordadas);
  if (!pestanas.length || pestanas.some((p) => !p.title)) return null;
  const senales = { es: 0, en: 0 };
  const primeraTanda = new Set(pestanas.slice(0, CSV_A_LA_VEZ).map((p) => p.gid));
  let exitos = 0, fallidasDeLaPrimera = 0, perdidas = 0, porXlsx = 0, hechas = 0, abandonado = false;
  const leidas = await mapLimit(pestanas, CSV_A_LA_VEZ, async ({ gid, title }) => {
    try {
      let filas = null;
      for (let intento = 0; intento < 2 && !filas && !abandonado; intento++) {
        try {
          const adelantada = intento === 0 ? adelantadas.get(Number(gid)) : undefined;
          if (adelantada) adelantadas.delete(Number(gid));   // su texto no se retiene hasta el final
          filas = filasDeCsv(await (adelantada || csvDeHoja(ids, gid)), senales); exitos++;
        } catch (_) {
          if (intento === 0 && primeraTanda.has(gid)) fallidasDeLaPrimera++;
          if (!exitos && fallidasDeLaPrimera >= primeraTanda.size) abandonado = true;
          else if (intento < 1) await new Promise((res) => setTimeout(res, 600));
        }
      }
      if (abandonado) return null;
      // sin CSV, o con MENOS filas que lo aplicado (el CSV de exportación no recorta por filtros, pero por si acaso), su XLSX
      if (!filas || filas.length < filasAplicadas(previas, title)) {
        const x = await filasPorXlsxDeHoja(ids, gid, obtenerXLSX);
        if (x) { filas = x.filas; porXlsx++; } else if (!filas) { perdidas++; return null; }
      }
      return { title, filas };
    } finally {
      hechas++;
      if (avisar) avisar({ fase: 'hojas', hechas, de: pestanas.length });
    }
  });
  if (abandonado || !exitos) return null;
  if (senales.en > senales.es) return null;   // el libro ya no está en formato es: la conversión no valdría
  const sheets = {};
  leidas.forEach((h) => { if (h && h.filas.length && !sheets[h.title]) sheets[h.title] = stampRows(h.filas, h.title); });
  return { sheets, completo: !perdidas, porXlsx, pestanas };
}

/** El respaldo leído aquí: { sheets, completo } (A4, 2026-10-11: `completo` = llegaron TODAS sus pestañas). B4: con las
 *  huellas aplicadas, para que una hoja recortada por gviz no pise la buena. */
async function fetchViaCsv(ids, avisar = null) {
  const r = await respaldoPorHojas(ids, getXLSX, avisar, null, _huellasAplicadas);
  return { sheets: r.sheets, completo: !r.perdidas && !r.sinPestanas };
}

// ---------- pipeline público ----------
/** Los orígenes que NO cuentan para la fecha más reciente del store (`latestDateMs`): hojas de referencia del sitio,
 *  no registros del laboratorio. */
// 🔧 2026-10-28 · ni las cuatro de Mantenimiento: una ronda de hoy no es producción, y movería la «última fecha» de las demás vistas.
const FUERA_DEL_RANGO = new Set(['Marea', 'Clima', 'Clima horas',
  'Mantenimiento Trabajos', 'Mantenimiento Lecturas', 'Mantenimiento Equipos', 'Mantenimiento Plan']);

/** Aplica un set de hojas { name: rows } al store: aplana las filas, limpia la caché
 *  de fechas, fija globalData/sheetNames/latestDateMs y deriva Mortalidad. NO emite
 *  eventos ni toca el estado de conexión/fingerprint: eso lo decide cada caller
 *  (carga inicial vs auto-refresco). No muta el store si el set viene vacío.
 *  Devuelve el nº de filas aplicadas (0 = nada que aplicar). */
export function applySheets(sheets) {
  const rows = [];
  for (const name in sheets) rows.push(...sheets[name]);
  if (!rows.length) return 0;

  clearDateCache();
  store.globalData = rows;
  store.sheetNames = Object.keys(sheets);

  let latest = 0;
  rows.forEach((row) => {
    // La hoja "Marea" trae PREDICCIONES futuras (INOCAR): no deben estirar el rango de
    // fecha global (presets 7/30 días, "última fecha") del resto de vistas operativas.
    // 🌦 2026-10-27 · tampoco las del clima: «Clima» trae el pronóstico de 3 días y «Clima horas» se escribe cada 3 h,
    // así que la última fecha sería siempre hoy aunque el último registro del laboratorio fuera de ayer.
    if (FUERA_DEL_RANGO.has(row._SheetOrigin)) return;
    const d = parseAnyDate(getField(row, F.fecha));
    if (d && !isNaN(d) && d.getTime() > latest) latest = d.getTime();
  });
  store.latestDateMs = latest;

  try { autoCalcMortalidad(rows); } catch (_) {}
  return rows.length;
}

/** Devuelve qué pasó con la descarga: 'aplicado', 'sin-cambios' o 'degradado' (connectSheets lo dice en la píldora). */
function commit(d, firstLoad) {
  // No pisar un set bueno con uno degradado (p.ej. reconexión manual que cae al
  // fallback CSV y sólo trae 1 hoja). En la primera carga no hay con qué comparar.
  if (!firstLoad && isDegraded(d.sheets, d.completo)) return 'degradado';
  // A2 (2026-10-11, usuario): si lo descargado es EXACTAMENTE lo aplicado, ni se aplica ni se avisa —«sin cambios», como
  // en el refresco automático—. Antes cada ⟳ emitía EV.DATA igual y Planta sacaba «Hay datos nuevos» sin haberlos.
  if (!firstLoad && d.fp === _lastFingerprint) return 'sin-cambios';

  // Cachea la huella del set recién comprometido para sembrar el auto-refresco SIN
  // re-descargar el workbook completo en el arranque (antes boot() hacía una 2ª
  // descarga íntegra sólo para calcular el fingerprint inicial).
  // La huella (d.fp) viene calculada de la descarga, ANTES de applySheets: autoCalcMortalidad
  // añade «Mortalidad» a las filas, y el auto-refresco calcula la suya sobre filas recién
  // descargadas, sin ella. Calculada después, el primer refresco tras abrir nunca decía
  // «sin cambios» y repintaba en balde.
  // applySheets no muta el store si viene vacío → un set vacío conserva los datos
  // previos y aquí se reporta como error (la reconexión manual no pierde lo cargado).
  if (!aplicarDescarga(d)) throw new Error('Sin datos en las hojas.');

  store.connected = true;
  // A1 (2026-10-11, usuario): `manual` = lo pidió el usuario —commit sólo llega por refrescoManual (⟳, la píldora o la
  // primera carga)—; Planta lo pinta ya en vez de avisar (planta/index.js).
  emit(EV.DATA, { firstLoad, manual: true });
  return 'aplicado';
}

// Huella del último set comprometido (por commit() o por el auto-refresco).
// ÚNICA fuente de verdad del fingerprint: si refresh.js llevara su propia copia,
// una reconexión manual la dejaría desfasada y el siguiente tick re-renderizaría
// toda la vista sin que hubiera cambios reales.
let _lastFingerprint = '';
export function getLastFingerprint() { return _lastFingerprint; }

/** Hash rodante barato (djb2) sobre las claves y los valores de todas las filas.
 *
 *  Recorre los caracteres directamente en vez de construir un JSON intermedio por fila:
 *  esto corre en CADA ciclo de auto-refresco (REFRESH_INTERVAL_S) sobre el store entero
 *  y bloquea el hilo principal mientras dura. Medido con filas de 27 columnas, mediana
 *  de 15 pasadas con el JIT caliente: 16.000 filas 79 → 49 ms y 30.000 filas 166 → 93 ms
 *  (~1,7×), además de evitar los ~12 MB de strings temporales que serializar generaba.
 *
 *  El separador 0x01 tras cada clave y cada valor es lo que impide que ('a','bc') y
 *  ('ab','c') colisionen, distinción que el JSON daba gratis con sus comillas. */
function hashRows(rows) {
  let h = 5381;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const keys = Object.keys(row);
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      for (let j = 0; j < key.length; j++) h = ((h << 5) + h + key.charCodeAt(j)) | 0;
      h = ((h << 5) + h + 1) | 0;
      const s = String(row[key]);
      for (let j = 0; j < s.length; j++) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
      h = ((h << 5) + h + 1) | 0;
    }
  }
  return h >>> 0;
}

/** Huella de datos para detectar cambios sin re-render innecesario.
 *  Antes muestreaba solo 3 filas (primera/última/media) y se perdía cambios en
 *  filas intermedias; ahora hashea TODAS las filas (fix D3). Corre 1×/refresco. */
export function dataFingerprint(sheets) {
  let fp = '';
  for (const name in sheets) {
    const rows = sheets[name];
    if (!rows?.length) continue;
    fp += `${name}:${rows.length}:${hashRows(rows)};`;
  }
  return fp;
}

/* ---------- lectura POR HOJAS (P1 del plan de carga y refresco, 2026-10-01) ----------
   El libro se lee en un Web Worker (sheets.worker.js) para no congelar la pantalla. El Worker
   calcula la huella de CADA hoja y sólo devuelve las que cambiaron respecto a lo APLICADO; aquí
   se funden con las ya aplicadas en un set completo. La huella global sale de las de cada hoja,
   en el mismo formato que dataFingerprint, y siempre sobre filas tal como llegan (antes de
   autoCalcMortalidad). */

/** Huella de cada hoja con filas: { nombre: 'nombre:filas:hash;' }. Unidas en orden, dan
 *  exactamente dataFingerprint del set. */
export function huellasPorHoja(sheets) {
  const out = {};
  for (const name in sheets) {
    const rows = sheets[name];
    if (rows?.length) out[name] = `${name}:${rows.length}:${hashRows(rows)};`;
  }
  return out;
}

/** Huella global a partir de las de cada hoja, en el orden del libro. */
export function huellaDe(huellas, orden = Object.keys(huellas)) {
  return orden.map((n) => huellas[n]).join('');
}

/** Qué mandar desde el Worker: el orden de las hojas, la huella de cada una y SÓLO las filas de
 *  las que cambiaron respecto a `previas` (las huellas de lo aplicado). */
export function planDelta(previas, sheets) {
  const huellas = huellasPorHoja(sheets);
  const orden = Object.keys(huellas);
  const cambiadas = {};
  for (const n of orden) if ((previas || {})[n] !== huellas[n]) cambiadas[n] = sheets[n];
  return { orden, huellas, cambiadas };
}

/** Set completo a partir de lo aplicado y de un delta: cada hoja, nueva si cambió y la ya
 *  aplicada si no. Una hoja que ni cambió ni está aplicada es un delta incoherente: error. */
export function fundirDelta(aplicadas, { orden, cambiadas }) {
  const out = {};
  for (const n of orden) {
    const rows = cambiadas[n] || (aplicadas || {})[n];
    if (!rows) throw new Error('Delta del libro incoherente: falta la hoja «' + n + '».');
    out[n] = rows;
  }
  return out;
}

/** { sheets, huellas, fp } de un set leído entero (camino sin Worker o CSV). */
function descargaCompleta(sheets, completo = false) {
  const huellas = huellasPorHoja(sheets);
  return { sheets, huellas, fp: huellaDe(huellas), completo };
}

// Lo último APLICADO, por hoja: contra eso compara el Worker y de ahí salen las hojas sin cambios.
let _hojasAplicadas = {};
let _huellasAplicadas = {};

// Lector en segundo plano (el del Worker, sheets.lector.js). Lo registra main.js; sin él (pruebas,
// navegador sin Worker) todo se lee aquí, como siempre.
let _lector = null;
export function setLectorLibro(lector) { _lector = lector; }
/** ¿La próxima lectura irá en segundo plano (sin congelar la pantalla)? */
export function lecturaEnSegundoPlano() {
  if (!_lector || !_lector.disponible()) return false;
  const ids = parseSheetsIds(activeUrl());
  return !!ids && ids.type === 'real';
}

/** A1: el aviso cuando no llegó NADA (ni el libro ni ninguna hoja): la culpa es de la conexión, no de las hojas. */
export const SIN_DATOS_DE_GOOGLE = 'No llegó ningún dato de Google (¿sin conexión?).';

/** Descarga el libro y devuelve { sheets, huellas, fp } con el set COMPLETO. Con el Worker, sólo
 *  viajan las hojas que cambiaron. Si el Worker no puede leer el XLSX, el CSV de siempre; si el
 *  Worker no arranca, el camino de siempre (aquí). Si se CAE con datos ya cargados (p. ej. sin
 *  memoria en un móvil), error: se conservan los datos y se reintenta en el siguiente ciclo, en
 *  vez de leer aquí y congelar (o tumbar) la página. Si no llegó nada o el Worker calló, error SIEMPRE (A1, dentro).
 *  `alAvanzar` (sólo la primera carga, punto 7): recibe cómo va la descarga y cuándo empieza la lectura. */
export async function descargarLibro({ alAvanzar } = {}) {
  const ids = parseSheetsIds(activeUrl());
  if (!ids) throw new Error('URL de Google Sheets inválida.');
  // A4 (2026-10-11, usuario): `completo` = la lista de hojas es la de verdad (el libro entero, o el respaldo con TODAS sus
  // pestañas): entonces una hoja que falta se vació o se borró y se aplica; si no, isDegraded la descarta (ver allí).
  let sheets, completo = false;
  if (ids.type === 'real' && _lector && _lector.disponible()) {
    // carga lenta D (2026-10-19): el Worker no tiene localStorage; la página le pasa las pestañas que recuerda y guarda
    // las que él trae (discoverGids · `recordadas`)
    const r = await _lector.leer({ realId: ids.realId, previas: _huellasAplicadas, alAvanzar, pestanas: cachedTabs(ids.realId) });
    if (r.ok && Array.isArray(r.pestanas) && r.pestanas.length) cacheTabs(ids.realId, r.pestanas);
    if (r.ok) return { sheets: fundirDelta(_hojasAplicadas, r), huellas: r.huellas, fp: huellaDe(r.huellas, r.orden), completo: r.completo === true };
    /* A1 (2026-10-07, usuario) · NO se repite aquí lo que el Worker ya intentó: si no le llegó nada, o si calló
       SILENCIO_MS (trabado), la página tampoco lo conseguiría y, en la primera carga, volvía a empezar toda la cadena
       (7–17 min con la red colgada). Sólo se lee aquí si el Worker no arrancó, o se cayó en la primera carga. */
    if (r.motivo === 'sin-datos') throw new Error(SIN_DATOS_DE_GOOGLE);
    if (r.motivo === 'tiempo' || (r.motivo === 'caido' && store.connected)) {
      throw new Error('No se pudo leer el libro en segundo plano.');
    }
    if (r.motivo === 'xlsx') ({ sheets, completo } = await fetchViaCsv(ids, alAvanzar));
  }
  if (!sheets) ({ sheets, completo } = await leerTodoAqui(alAvanzar));
  // Nada por ningún camino (sin Worker o tras su fallo): lo mismo que «sin-datos», no «Sin datos en las hojas.»
  if (!Object.keys(sheets).length) throw new Error(SIN_DATOS_DE_GOOGLE);
  return descargaCompleta(sheets, completo);
}

/** Aplica una descarga al store y la registra como lo APLICADO (hojas, huellas y huella global).
 *  Devuelve el nº de filas (0 = nada que aplicar: no toca nada). */
export function aplicarDescarga(d) {
  const n = applySheets(d.sheets);
  if (!n) return 0;
  _hojasAplicadas = d.sheets;
  _huellasAplicadas = d.huellas;
  _lastFingerprint = d.fp;
  return n;
}

/** P4 (2026-10-01): aplica el libro GUARDADO en este equipo (libroGuardado.js) como la carga
 *  inicial: la app arranca al instante con él y el auto-refresco lo revalida por detrás. Se registra
 *  como lo aplicado (hojas y huellas), así que esa revalidación sólo trae lo que cambió. */
export function aplicarLibroGuardado(g) {
  if (!aplicarDescarga(g)) return false;
  store.connected = true;
  emit(EV.DATA, { firstLoad: true, guardado: true });
  return true;
}

/** El libro por el export XLSX: { name: rows } o null si hay que ir al respaldo. Lo usan
 *  fetchAllSheets (aquí) y el Worker de lectura (sheets.worker.js): UNA sola implementación
 *  de la descarga, los reintentos y la lectura. `obtenerXLSX` da SheetJS. */
export async function fetchXlsxSheets(ids, obtenerXLSX = getXLSX, avisar = null) {
  // El libro XLSX CON REINTENTOS: desde el 2026-10-11 (4.2-B) es el SEGUNDO camino, después de cada hoja por su CSV
  // (hojasPorCsv). Trae TODAS las hojas en una sola petición; una caída
  // TRANSITORIA (timeout/red/5xx) NO debe degradar a la primera, así que reintentamos con
  // backoff. El respaldo es ROBUSTO: enumera TODAS las hojas por /htmlview (no requiere
  // publicar el documento) y las baja hoja a hoja por su XLSX, y por CSV sólo la que falle
  // (respaldoPorHojas: primero su CSV de exportación, y gviz sólo si tampoco llega —con un filtro en la hoja, gviz
  // recorta—, sin pisar una hoja con más filas; B4, 2026-10-22).
  // Punto 9 (2026-10-07): con `avisar` (la primera carga), cada reintento lo dice —y si fue porque la red no avanzó—, y
  // los avisos de descarga del intento siguiente llevan en qué intento va.
  // Pauta 18 (2026-10-22, usuario) · sin SheetJS el libro no se puede leer: no se descarga (eran tres descargas de 14,5 MB,
  // con sus esperas, para fallar al leerlo cada vez) y se pasa directo al respaldo, que sin él lee cada hoja por su CSV.
  try { if (!obtenerXLSX()) return null; } catch (_) { return null; }
  let intento = 1, bytes = 0;
  const av = avisar ? (p) => { if (p.bytes) bytes = p.bytes; avisar(intento > 1 && p.fase === 'descarga' ? { ...p, intento, de: 3 } : p); } : null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const wb = await fetchWorkbook(ids, obtenerXLSX, av);
      if (wb) return workbookToSheets(wb, obtenerXLSX());
      break; // wb nulo (sin hojas) no es transitorio: pasa directo al respaldo
    } catch (e) {
      // 401/403: el endpoint de exportación exige autenticación (documento compartido sólo
      // por enlace, no público para /export). Reintentar es inútil → pasa YA al respaldo.
      if (/\b(401|403)\b/.test(String((e && e.message) || ''))) break;
      if (attempt < 2) {
        intento = attempt + 2;
        if (av) av({ fase: 'reintento', intento, de: 3, bytes, atascada: String((e && e.message) || '') === NO_AVANZA });
        await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      }
    }
  }
  return null;
}

/** Descarga las hojas (cada una por su CSV; si no, el libro XLSX y el respaldo hoja a hoja) y devuelve { name: rows }.
 *  ⚠ La app NO la llama: la lectura sin Worker entra por `leerTodoAqui` (en `descargarLibro`). La usan SÓLO las pruebas
 *  (sheets.csv, .huella, .respaldo y .actualizacion), y es su puerta a ese camino: no se borra por «sin uso», o la
 *  lectura sin Worker se queda sin pruebas (bloque 4, tarea 6, 2026-10-23, usuario). */
export async function fetchAllSheets(avisar = null) {
  return (await leerTodoAqui(avisar)).sheets;
}
/** fetchAllSheets con `completo` (A4, 2026-10-11): el libro entero lo es; el respaldo, si llegaron todas sus pestañas.
 *  Pauta 17 (2026-10-22, usuario) · el MISMO orden que el Worker (sheets.worker.js · atenderLectura): primero cada hoja
 *  por su CSV (hojasPorCsv: ~1,4 MB y ~1,5 s de lectura, repartidos en una tarea corta por hoja) y el libro entero sólo
 *  si eso no llega completo. Antes empezaba por el libro: 14,5 MB y 12–16 s de SheetJS seguidos con la pantalla
 *  congelada, en cada refresco mientras el Worker estuviera roto y en la primera carga si se caía. */
async function leerTodoAqui(avisar = null) {
  const ids = parseSheetsIds(activeUrl());
  if (!ids) throw new Error('URL de Google Sheets inválida.');
  const recordadas = ids.type === 'real' ? cachedTabs(ids.realId) : null;
  const porCsv = await hojasPorCsv(ids, getXLSX, avisar, _huellasAplicadas, recordadas);
  if (porCsv && porCsv.completo) return { sheets: porCsv.sheets, completo: true };
  const libro = await fetchXlsxSheets(ids, getXLSX, avisar);
  if (libro) return { sheets: libro, completo: true };
  const r = await fetchViaCsv(ids, avisar);
  // como en el Worker: sin libro ni respaldo, lo que llegó por CSV (incompleto: isDegraded no lo deja pisar un set mayor)
  if (!Object.keys(r.sheets).length && porCsv && Object.keys(porCsv.sheets).length) return { sheets: porCsv.sheets, completo: false };
  return r;
}

/** ¿La descarga recién obtenida trae MENOS hojas que el set bueno ya cargado?
 *  Señal de un resultado degradado (típicamente el fallback CSV que sólo logró
 *  bajar la 1ª hoja). Evita pisar datos buenos con un parcial transitorio: el
 *  auto-refresco recupera el set completo en el siguiente ciclo, sin que el
 *  usuario tenga que refrescar a mano. Sólo aplica si YA estábamos conectados
 *  (en la primera carga no hay set previo con el que comparar).
 *  A4 (2026-10-11, usuario): con `completo` (la lista de hojas es la de verdad: el libro entero o el respaldo con todas
 *  sus pestañas) NO es degradada: la hoja que falta se vació o se borró, y descartarla dejaba cada refresco descartado
 *  hasta recargar. Lo que se descarta, y lo que se aplica con hojas de menos, lo dice la píldora (textoFaltan). */
export function isDegraded(sheets, completo = false) {
  const incoming = Object.keys(sheets || {}).length;
  return store.connected && incoming > 0 && incoming < store.sheetNames.length && !completo;
}

/** A4: las hojas aplicadas que no trae `sheets`. */
export function hojasQueFaltan(sheets) {
  return store.sheetNames.filter((n) => !(sheets && sheets[n]));
}

/** A4: lo que añade la píldora por las hojas que faltan: aplicada (se vaciaron o se borraron) o descartada (no llegaron). */
export function textoFaltan(faltan, aplicada) {
  const n = faltan.length;
  if (!n) return '';
  if (aplicada) return n === 1 ? ' · 1 hoja vacía o borrada' : ` · ${n} hojas vacías o borradas`;
  return n === 1 ? ' · faltó 1 hoja (se reintenta)' : ` · faltaron ${n} hojas (se reintenta)`;
}

/** Conexión inicial: descarga + commit + emisión de estado. */
export async function connectSheets() {
  emit(EV.CONN, { state: 'connecting', label: 'Descargando datos…' });
  try {
    const firstLoad = !store.connected;
    // Punto 7 (2026-10-03): la PRIMERA carga dice cómo va (el aviso de carga y la píldora); los refrescos, no.
    const alAvanzar = firstLoad ? (p) => emit(EV.CONN, { state: 'connecting', label: textoProgreso(p) }) : undefined;
    const d = await descargarLibro({ alAvanzar });
    const faltan = firstLoad ? [] : hojasQueFaltan(d.sheets);   // A4: antes de aplicar, contra lo que había
    const resultado = commit(d, firstLoad);
    const n = store.sheetNames.length;
    const ts = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
      + (resultado === 'sin-cambios' ? ' · sin cambios' : '') + textoFaltan(faltan, resultado === 'aplicado');
    // Señal de carga DEGRADADA: si tras conectar solo hay 1 hoja, casi siempre es
    // que el camino XLSX (todas las hojas) falló y se cayó al fallback CSV, que sin
    // el documento "publicado en la web" solo recupera la 1ª pestaña → la mayoría de
    // vistas quedan sin datos. Se marca `warn` para que la shell avise al usuario.
    emit(EV.CONN, { state: 'connected', label: `${n} hoja${n > 1 ? 's' : ''} · ${ts}`, warn: n <= 1 });
    return true;
  } catch (err) {
    const msg = err?.name === 'AbortError'
      ? `Timeout (${FETCH_TIMEOUT_MS / 1000}s) — reintentar`
      : (err?.message || 'Error desconocido');
    emit(EV.CONN, { state: 'error', label: msg.length > 60 ? msg.slice(0, 57) + '…' : msg });
    return false;
  }
}
