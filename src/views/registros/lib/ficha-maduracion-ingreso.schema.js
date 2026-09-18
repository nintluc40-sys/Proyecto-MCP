/* ============================================================
   REGISTROS · esquema de la ficha "Ingreso a Maduración" (madIngreso)

   Registra la ENTRADA de un lote al departamento de Maduración: de qué piscina
   broodstock y camaronera viene, con qué código genético, y cómo se reparte por
   salas y tanques. Modelo PURO — sin DOM, sin localStorage, sin red.
   El monolito `engine.js` lleva una copia inline de esta lógica (las copias de
   Music no tienen módulos ES); la prueba de paridad exige que las dos produzcan
   el mismo payload.

   ── UN LOTE, VARIAS COMPOSICIONES, VARIOS TANQUES ──────────
   El LOTE es el código de entrada (AB, BC, BD…) y es UNO aunque se reparta entre
   varias salas: no hay «un lote por sala». Dentro, el lote puede traer más de una
   pareja (código genético, piscina) —lo que el laboratorio llama una composición—
   y los operarios sí saben qué tanques reciben cada una.

   Por eso el grano de la hoja es (lote, composición, sala, tanque), y la cabecera
   del lote se repite en cada fila. Es la misma forma que `ficha-traslado.schema.js`
   resuelve con (viaje, camión, revisión, tina).

   ⚠ NO confundir con `Maduración Transferencias`, que es el registro REPRODUCTIVO
   por individuo con microchip Trovan. Aquí no hay individuos identificados: hay
   conteos. Son dos sistemas distintos y viven en hojas distintas (decisión del
   usuario, 2026-09-08).

   LLAVE: `ID = <lote>-<códgen>-s<sala>-t<tanque>`, DETERMINISTA y en la ÚLTIMA
   columna. El GAS hace UPSERT por ella.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';

/** Hoja destino. La crea el propio GAS (`ss.insertSheet`) al primer envío. */
export const MAD_INGRESO_SHEET = 'Maduración Ingreso';

/** Salas de Maduración.
 *
 *  ⚠⚠ SALA 4A Y 4B SE RETIRARON el 2026-09-08 (decisión del usuario: quedaron
 *  disueltas). Se midió antes de quitarlas: 4A se usó hasta el 2026-09-01 y 4B
 *  hasta el 2026-08-29, y sus 57 filas siguen en `Maduración Sala`.
 *  🔑 Quitarlas de aquí las saca del SELECTOR, no del pasado: cualquier lectura
 *  del histórico tiene que seguir tolerándolas, y por eso no se filtran al leer. */
export const MAD_SALA_OPTS = ['Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5'];

/** Tanques por sala. La numeración NO es global: se repite entre salas (la 4 y la
 *  1 tienen ambas un tanque 1), así que un tanque sólo identifica algo junto a su
 *  sala. Por eso la llave de fila lleva las dos. */
export const MAD_TANQUES_POR_SALA = {
  'Sala 1': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  'Sala 2': [16, 17, 18, 19, 20, 21],
  'Sala 3': [22, 23, 24, 25, 26, 27],
  'Sala 4': [1, 2, 3, 4, 5, 6],
  'Sala 5': [7, 8, 9, 10, 11],
};

/** Toneladas de agua que lleva CADA tanque de la sala (usuario, 2026-09-15).
 *  ⚠⚠ Este párrafo decía «las toneladas ENTRE LOS TANQUES dan el volumen medio» y describía el
 *  modelo EQUIVOCADO, el que se retiró el 2026-09-16: la cifra ya es la de UN tanque, y volver a
 *  repartirla entre los de la sala multiplicaba la carga por su número (14,8 kg/m³ donde el Excel
 *  del módulo da 1,17). Se quedó viejo el mismo día que se corrigió el cálculo.
 *  ✅ MANDAN ESTAS CIFRAS, NO LAS DEL EXCEL (decisión del usuario, 2026-09-16): aquella hoja probó
 *  la FORMA de la cuenta, pero sus divisores (4,65 y 19) son la medición de ESE módulo en
 *  septiembre, no el catálogo del sistema. La diferencia entre 5,5 y 4,65 está decidida.
 *  🔑 Es un valor POR DEFECTO, no un candado: la ficha de Salas pre-rellena la celda con él, el
 *  usuario puede pisarlo, y lo registrado manda siempre sobre esta tabla. */
export const MAD_SALA_TONELADAS = { 'Sala 1': 5.5, 'Sala 2': 21, 'Sala 3': 21, 'Sala 4': 14, 'Sala 5': 13 };

/** ÁREA de cada tanque, en m² (usuario, 2026-09-18 · D16): el divisor de la CARGA MÉTRICA, que va en g/m².
 *  Va por TANQUE y no por sala porque la Sala 5 no es uniforme: sus dos primeros tanques (7 y 8) son de 40 m² y los
 *  otros tres (9, 10 y 11) de 27 —es la única sala así—. En las demás, todos sus tanques miden lo mismo.
 *  Un tanque que no esté aquí NO tiene área: su carga métrica queda vacía, nunca calculada con un área supuesta. */
export const MAD_TANQUE_AREA_M2 = {
  'Sala 1': 13.14, 'Sala 2': 50, 'Sala 3': 50, 'Sala 4': 40,
  'Sala 5': { 7: 40, 8: 40, 9: 27, 10: 27, 11: 27 },
};
/** Área (m²) del tanque `tanque` de la sala `sala`, o '' si no se conoce. */
export function areaTanqueM2(sala, tanque) {
  const a = MAD_TANQUE_AREA_M2[String(sala == null ? '' : sala).trim()];
  const v = (a !== null && typeof a === 'object') ? a[Number(tanque)] : a;
  return typeof v === 'number' ? v : '';
}

/** Origen del agua de un TANQUE en su ingreso. Es una elección entre dos y puede cambiar por día.
 *  ⚠ NO confundir con la columna `RAS` de `Maduración Sala`, que es otra cosa desde el
 *  2026-09-15: allí no se dice «sí o no», se dice EN QUÉ PORCENTAJE usa el RAS esa sala
 *  (`MAD_RAS_OPTS` en el monolito), y lo que falta hasta el 100 es agua de playa. Aquí se sigue
 *  eligiendo entre los dos orígenes porque un tanque concreto se llena de uno o del otro. */
export const AGUA_OPTS = ['RAS', 'Agua de playa'];
/** Agua con la que NACE cada tanque del ingreso (usuario, 2026-09-13). Medido ese día: las 6 filas
 *  reales llevaban «Agua de playa» y el formulario nacía en RAS. Es el valor por defecto, no un
 *  candado: RAS se sigue eligiendo. Sólo el Ingreso; Movimientos no se tocó. */
export const AGUA_DEFECTO = 'Agua de playa';

/* ── Columnas ──────────────────────────────────────────────
   Se declaran UNA vez y las cabeceras se DERIVAN de aquí. Es deliberado: una lista
   de cabeceras escrita aparte se desincroniza del constructor de filas en silencio,
   y entonces la hoja recibe valores en la columna equivocada sin un solo error.

   `grain` dice a qué nivel del modelo pertenece cada columna:
     lote        → cabecera, se repite en todas las filas del ingreso
     composicion → se repite en todas las filas de esa (códgen, piscina)
     reparto     → propio de cada (sala, tanque) */
export const MAD_INGRESO_COLUMNS = [
  { h: 'Fecha', k: 'fecha', grain: 'lote' },
  { h: 'Lote', k: 'lote', grain: 'lote' },
  { h: 'Código genético', k: 'codigoGenetico', grain: 'composicion' },
  { h: 'Piscina Broodstock', k: 'piscina', grain: 'composicion' },
  { h: 'Camaronera origen', k: 'camaronera', grain: 'composicion' },
  /* 🔗 GRUPO · vacío casi siempre. Se rellena («766/767») cuando dos piscinas de códigos
     genéticos distintos entran MEZCLADAS en el mismo lote y por eso comparten tanque.
     🔑 No sustituye al código genético: lo acompaña. Cada composición sigue escribiendo
     SUS cifras en SUS filas, así que «¿cuántos machos entraron con la 766?» se responde
     sumando sus filas, y «¿cuántos entraron en la mezcla?» sumando las del grupo. La
     primera versión de Combinar fundía las dos en una sola fila y perdía la primera
     pregunta para siempre. */
  { h: 'Grupo', k: 'grupo', grain: 'composicion' },
  { h: 'Sala', k: 'sala', grain: 'reparto' },
  { h: 'Tanque', k: 'tanque', grain: 'reparto', num: true },
  { h: 'Machos', k: 'machos', grain: 'reparto', num: true },
  { h: 'Hembras', k: 'hembras', grain: 'reparto', num: true },
  { h: 'Peso promedio machos (g)', k: 'pesoMachos', grain: 'composicion', num: true },
  { h: 'Peso promedio hembras (g)', k: 'pesoHembras', grain: 'composicion', num: true },
  // Las cuatro siguientes son REFERENCIALES de la camaronera: las teclea quien
  // registra y el sistema sólo las arrastra a la reportería (decisión del usuario).
  { h: 'Supervivencia piscina (%)', k: 'supervivencia', grain: 'composicion', num: true },
  /* 2026-09-13 (usuario): «Camarones por m2» se BORRA y en su sitio va «Crecimiento semanal
     promedio»; «Libras por hectárea promedio» entra justo detrás.
     ⚠⚠ LA HOJA SE ESCRIBE POR POSICIÓN y esto corre Densidad, Agua e ID un sitio. No se migra
     (sus filas eran de prueba, decisión del usuario del 2026-09-14), pero mientras conserve la
     cabecera vieja el GAS nuevo RECHAZA el envío (guarda de esquema), y contra el GAS viejo el
     cliente no escribe (`_madIngGasAlDia`). Ver el README. */
  { h: 'Crecimiento semanal promedio', k: 'crecimientoSemanal', grain: 'composicion', num: true },
  { h: 'Libras por hectárea promedio', k: 'librasHectarea', grain: 'composicion', num: true },
  { h: 'Densidad de siembra', k: 'densidad', grain: 'composicion', num: true },
  { h: 'Agua', k: 'agua', grain: 'reparto' },
  { h: 'ID', k: 'id', grain: 'llave' },
];

/** Cabeceras de la hoja. DERIVADAS de las columnas — nunca tecleadas aparte. */
export const MAD_INGRESO_HEADERS = MAD_INGRESO_COLUMNS.map((c) => c.h);

/* ── Normalización ─────────────────────────────────────────
   ⚠⚠ POR QUÉ SE NORMALIZA Y NO SE GUARDA TAL CUAL. En producción ya conviven `"Ab"`
   y `"AB"` como código de lote, y `"BC/BA"` tecleado a mano. Dos grafías del mismo
   valor es el defecto que ya costó caro con los nombres del analista: parten los
   filtros, duplican las filas de un informe y no dan ningún síntoma.
   Normalizando AQUÍ —y no sólo al pintar— dos personas que escriben el mismo lote
   con distinta caja producen la MISMA llave, así que la segunda actualiza la fila
   de la primera en vez de crear una gemela. */

/** Código de lote en su forma canónica: sin espacios y en MAYÚSCULAS. */
export function normLote(s) {
  return sanitizeStr(s, 40).toUpperCase().replace(/\s+/g, '');
}

/** Código genético canónico. Mismo criterio que el lote. */
export function normCodigoGenetico(s) {
  return sanitizeStr(s, 60).toUpperCase().replace(/\s+/g, '');
}

/** Sala en forma compacta para la llave: 'Sala 4' → 'S4'. Sólo para el ID; en la
 *  columna `Sala` se guarda el nombre completo, que es lo que la gente lee. */
export function salaTag(sala) {
  const s = sanitizeStr(sala, 30);
  const m = s.match(/(\d+[A-Za-z]*)\s*$/);
  return m ? 'S' + m[1].toUpperCase() : 'S' + s.toUpperCase().replace(/\s+/g, '');
}

/* ── Identidad ─────────────────────────────────────────────
   La llave es NATURAL —hecha de los valores del propio ingreso— y no un id opaco.
   Es una decisión con dos caras y conviene tenerlas escritas:

   ✅ A favor: dos dispositivos que registren el mismo ingreso producen la MISMA
      llave, así que el segundo ACTUALIZA en vez de duplicar. Con «todos registran»
      y captura sin conexión, un duplicado silencioso es peor que un huérfano.
   ⚠ En contra: corregir la fecha, el lote, el código genético, la sala o el tanque
      DESPUÉS de sincronizar cambia la llave y deja huérfana la fila anterior en la hoja.
      Es visible y arreglable a mano; el duplicado no se ve.

   🔴 LA FECHA VA EN LA LLAVE desde el 2026-09-13 (D1). Sin ella, un SEGUNDO ingreso del mismo
   lote y código genético al MISMO tanque, otro día, caía en la misma fila y el merge del GAS
   SUSTITUÍA los conteos del primero: el libro mayor perdía esos animales sin un síntoma. Con
   ella, cada ingreso es su fila y el libro los suma; y el mismo ingreso reenviado el mismo día
   sigue actualizando. Va delante, como en Movimientos y Fin de Ciclo.
   ⚠ Las filas escritas ANTES de este cambio conservan su llave sin fecha: reenviarlas desde la
   app crearía otra fila. Se arregla poniendo la fecha delante de su ID en la hoja.

   🔑 Y por eso la llave se construye sobre los valores NORMALIZADOS: si no, `ab` y
   `AB` serían dos filas distintas y volveríamos justo al problema que se quiere
   evitar. */

/** Llave de fila: determinista y estable para (fecha, lote, código genético, sala, tanque).
 *  El mismo ingreso —misma fecha, composición, tanque y lote— produce SIEMPRE el
 *  mismo ID, se registre desde donde se registre y se escriba como se escriba. */
export function ingresoRowId(fecha, lote, codigoGenetico, sala, tanque) {
  return (
    sanitizeStr(fecha, 10) +
    '-' + normLote(lote) +
    '-' + normCodigoGenetico(codigoGenetico) +
    '-' + salaTag(sala) +
    '-t' + Number(tanque)
  );
}

/* ── Construcción de filas ─────────────────────────────────── */

const num = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
};

/** Entero no negativo, o '' si no lo es. Para conteos de individuos. */
const int = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : '';
};

/** Suma de un campo del reparto, ignorando lo que no sea número. */
export function sumaReparto(reparto, campo) {
  return (reparto || []).reduce((acc, r) => {
    const n = parseInt(r && r[campo], 10);
    return acc + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/** Filas de la hoja, una por (composición, entrada de reparto).
 *
 *  El orden de las celdas sale de `MAD_INGRESO_COLUMNS`, no de una lista aparte:
 *  añadir una columna en la declaración la añade aquí sola y en la cabecera sola.
 */
export function buildIngresoRows(model) {
  const m = model || {};
  const fecha = sanitizeStr(m.fecha, 10);
  const lote = normLote(m.lote);
  const filas = [];

  (m.composiciones || []).forEach((comp) => {
    const c = comp || {};
    const codigoGenetico = normCodigoGenetico(c.codigoGenetico);
    (c.reparto || []).forEach((rep) => {
      const r = rep || {};
      const sala = sanitizeStr(r.sala, 30);
      const tanque = int(r.tanque);
      if (sala === '' || tanque === '') return; // sin ubicación no hay fila que escribir
      const valores = {
        fecha,
        lote,
        codigoGenetico,
        piscina: sanitizeStr(c.piscina, 60),
        camaronera: sanitizeStr(c.camaronera, 80),
        grupo: sanitizeStr(c.grupo, 60),
        sala,
        tanque,
        machos: int(r.machos),
        hembras: int(r.hembras),
        pesoMachos: num(c.pesoMachos),
        pesoHembras: num(c.pesoHembras),
        supervivencia: num(c.supervivencia),
        crecimientoSemanal: num(c.crecimientoSemanal),
        librasHectarea: num(c.librasHectarea),
        densidad: num(c.densidad),
        agua: sanitizeStr(r.agua, 20),
        id: ingresoRowId(fecha, lote, codigoGenetico, sala, tanque),
      };
      filas.push(MAD_INGRESO_COLUMNS.map((col) => valores[col.k]));
    });
  });

  return filas;
}

/** Payload listo para `doPost`. Misma forma que el resto de fichas del monolito. */
export function buildIngresoPayload(model) {
  return {
    sheetName: MAD_INGRESO_SHEET,
    headers: MAD_INGRESO_HEADERS,
    rows: buildIngresoRows(model),
  };
}

/* ── Validación ────────────────────────────────────────────
   Dos niveles, y la diferencia importa:
     · ERROR  → impide guardar. Sólo lo que produciría PÉRDIDA de datos.
     · AVISO  → deja guardar. Es el criterio que eligió el usuario para el descuadre
                de fin de ciclo, y se aplica igual aquí: avisar y dejar seguir, porque
                bloquear impide registrar hoy un error que viene de antes. */

/** Revisa el modelo y devuelve `{ errores, avisos }`, ambos arrays de texto. */
export function validarIngreso(model) {
  const m = model || {};
  const errores = [];
  const avisos = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha || ''))) errores.push('La fecha no es válida.');
  if (normLote(m.lote) === '') errores.push('Falta el código de lote.');

  const comps = m.composiciones || [];
  if (!comps.length) errores.push('El ingreso no tiene ninguna composición (código genético + piscina).');

  /* ⚠⚠ ESTA ES LA COMPROBACIÓN QUE EVITA UNA PÉRDIDA SILENCIOSA, no una molestia de
     formulario. Dos filas de la MISMA composición en el MISMO tanque generan el MISMO
     ID, y el upsert del GAS escribe la segunda ENCIMA de la primera: los animales de
     la primera desaparecen de la hoja sin ningún aviso. Es exactamente el defecto que
     ya se pagó en Traslado con la llave posicional. Por eso es ERROR y no aviso.
     🔑🔑 Y DESDE EL 2026-09-08 ALCANZA A TODO EL INGRESO, no sólo a la composición.
     Antes repetir (sala, tanque) entre composiciones DISTINTAS valía: era la vía para
     declarar un tanque mezclado. El usuario decidió lo contrario, y la razón es del
     dominio, no de la interfaz: cuando dos piscinas se mezclan AL ENTRAR, nadie sabe
     cuántos animales de cada código quedan en cada tanque. Registrarlas por separado en
     el mismo tanque habría sido INVENTAR un desglose que nadie midió. La mezcla se declara
     antes, con «Combinar», y entra como UNA composición de dos códigos (767/766). */
  const vistos = new Set();
  const ocupante = new Map();
  const codigosVistos = new Set();
  comps.forEach((comp, i) => {
    const c = comp || {};
    const cg = normCodigoGenetico(c.codigoGenetico);
    const grupo = sanitizeStr(c.grupo, 60);
    const etiqueta = cg || 'composición ' + (i + 1);
    if (cg === '') errores.push('Falta el código genético de la composición ' + (i + 1) + '.');
    else if (codigosVistos.has(cg)) errores.push('El código genético «' + cg + '» está repetido en este ingreso.');
    else codigosVistos.add(cg);

    if (sanitizeStr(c.piscina, 60) === '') avisos.push('«' + etiqueta + '» no declara piscina broodstock.');

    const reparto = c.reparto || [];
    if (!reparto.length) errores.push('«' + etiqueta + '» no se repartió en ningún tanque.');

    reparto.forEach((rep) => {
      const r = rep || {};
      const sala = sanitizeStr(r.sala, 30);
      const tanque = int(r.tanque);
      if (sala === '' || tanque === '') return;
      /* DOS controles distintos, y conviene no confundirlos:
         1) la MISMA composición dos veces en el mismo tanque → mismo ID, el upsert borra
            la primera. Es pérdida de datos, y por eso mira el código genético.
         2) DOS OCUPANTES distintos en el mismo tanque → un tanque se ocupa una vez. Aquí
            un GRUPO cuenta como un solo ocupante: sus composiciones entraron mezcladas y
            comparten tanque a propósito, cada una con sus propias cifras y su propio ID. */
      const llaveComp = cg + '|' + salaTag(sala) + '|' + tanque;
      if (vistos.has(llaveComp)) {
        errores.push('«' + etiqueta + '» aparece dos veces en ' + sala + ' tanque ' + tanque + '. La segunda borraría a la primera.');
      }
      vistos.add(llaveComp);

      const ubic = salaTag(sala) + '|' + tanque;
      const quien = grupo || cg;
      if (ocupante.has(ubic) && ocupante.get(ubic) !== quien) {
        errores.push(
          'El tanque ' + tanque + ' de ' + sala + ' lo ocupan dos ingresos distintos (' +
          ocupante.get(ubic) + ' y ' + quien + '). Un tanque se ocupa UNA vez: si entraron ' +
          'mezclados, agrúpalos antes con «Combinar».'
        );
      } else if (!ocupante.has(ubic)) {
        ocupante.set(ubic, quien);
      }

      const permitidos = MAD_TANQUES_POR_SALA[sala];
      if (permitidos && permitidos.indexOf(tanque) === -1) {
        avisos.push('El tanque ' + tanque + ' no es de ' + sala + '.');
      }
      if (!permitidos) avisos.push('«' + sala + '» no es una sala conocida.');
    });

    /* El total declarado frente a lo repartido. Es AVISO y no error: el usuario puede
       estar a medio repartir, y bloquear ahí obligaría a rehacer el trabajo. Pero se
       dice, porque un descuadre aquí es justo la clase de error de registro que este
       módulo existe para cazar. */
    ['machos', 'hembras'].forEach((sexo) => {
      const declarado = parseInt(c[sexo], 10);
      if (!Number.isFinite(declarado)) return;
      const repartido = sumaReparto(reparto, sexo);
      if (repartido !== declarado) {
        avisos.push(
          '«' + etiqueta + '»: se declararon ' + declarado + ' ' + sexo +
          ' y se repartieron ' + repartido + ' (diferencia ' + (declarado - repartido) + ').'
        );
      }
    });
  });

  return { errores, avisos };
}

/* ── Reparto sugerido ──────────────────────────────────────── */

/** Reparte `total` entre `n` tanques lo más parejo posible, dando el resto a los
 *  primeros. `repartirParejo(10, 3)` → `[4, 3, 3]`.
 *
 *  ⚠ Es un reparto por CONTEO, no por capacidad: hoy no existe una tabla de
 *  capacidades de tanque (el usuario la dará más adelante). Mientras no exista,
 *  esto NO puede avisar de sobrecarga y sólo pretende ahorrar tecleo — el operario
 *  ajusta después, que es lo que va a pasar casi siempre. */
export function repartirParejo(total, n) {
  const t = parseInt(total, 10);
  const k = parseInt(n, 10);
  if (!Number.isFinite(t) || t < 0 || !Number.isFinite(k) || k <= 0) return [];
  const base = Math.floor(t / k);
  const resto = t - base * k;
  return Array.from({ length: k }, (_, i) => base + (i < resto ? 1 : 0));
}

/** Reparte `total` RESPETANDO lo tecleado a mano (pedido del usuario, 2026-09-13): «100 en 2
 *  tanques da 50 y 50; si pongo 43 en uno, al recalcular debería dar 43 y 57».
 *  `valores[i]` es lo que hay en la celda i y `fijos[i]` si la tecleó una persona. Las fijadas
 *  conservan su número; lo que falta se reparte parejo entre las LIBRES (el sobrante, a las
 *  primeras libres). Una fijada VACÍA cuenta como libre: no se fija un cero que nadie tecleó.
 *  Devuelve `{ valores, resto, estado }`:
 *    'ok'         → `valores` listos (fijadas intactas, libres repartidas), resto 0;
 *    'excede'     → lo fijado supera el total: `valores` null y `resto` negativo (no se toca nada);
 *    'sin-libres' → todo está fijado y no suma el total: `resto` es lo que falta;
 *    'sin-total'  → total no válido o sin tanques: no hay nada que hacer. */
export function repartirRespetando(total, valores, fijos) {
  const t = parseInt(total, 10);
  const vals = valores || [];
  if (!Number.isFinite(t) || t < 0 || !vals.length) return { valores: [], resto: 0, estado: 'sin-total' };
  const fijo = vals.map((v, i) => {
    const n = parseInt(v, 10);
    return !!(fijos && fijos[i]) && Number.isFinite(n) && n >= 0;
  });
  const suma = vals.reduce((a, v, i) => a + (fijo[i] ? parseInt(v, 10) : 0), 0);
  const resto = t - suma;
  if (resto < 0) return { valores: null, resto, estado: 'excede' };
  const libres = fijo.reduce((a, f, i) => (f ? a : a.concat(i)), []);
  const out = vals.map((v, i) => (fijo[i] ? parseInt(v, 10) : v));
  if (!libres.length) return { valores: out, resto, estado: resto === 0 ? 'ok' : 'sin-libres' };
  const reparto = repartirParejo(resto, libres.length);
  libres.forEach((idx, k) => { out[idx] = reparto[k]; });
  return { valores: out, resto: 0, estado: 'ok' };
}
