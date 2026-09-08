/* ============================================================
   MADURACIÓN · EL LIBRO MAYOR (Fase 2, 2026-09-08)

   Responde una sola pregunta, y de ella cuelga todo lo demás:
   **¿cuántos animales hay VIVOS ahora mismo en cada tanque y en cada lote?**

   ── POR QUÉ SE DEDUCE Y NO SE GUARDA ───────────────────────
   Nadie teclea un saldo. El saldo es la suma de los EVENTOS:

       + Ingreso           (Maduración Ingreso)
       − Mortalidad        (Maduración Tanques)
       − Descarte          (Maduración Tanques)
       ± Movimientos       (Maduración Movimientos · Fase 3)
       − Fin de ciclo      (Maduración Fin de Ciclo · Fase 4)

   Un saldo tecleado se equivoca y nadie se entera. Un saldo deducido no puede
   mentir sin que la resta lo cante: un olvido o una cifra mal escrita separan el
   libro de la realidad, y esa separación es LA SEÑAL que este módulo produce.
   El objetivo no es que el número cuadre siempre: es que **cuando no cuadre, se
   vea el mismo día** en vez de descubrirse meses después o no descubrirse.

   ── POR QUÉ ES CRONOLÓGICO Y NO UNA SUMA ───────────────────
   Decisión del usuario (2026-09-08): en un tanque MEZCLADO, la mortalidad se
   reparte entre sus lotes **en proporción a los animales vivos que cada uno tiene
   ESE DÍA**, no a lo que aportó al ingreso. Eso obliga a recorrer los días EN
   ORDEN: el peso del reparto de hoy depende del resultado de ayer. Sumar por
   separado y repartir al final daría números plausibles y equivocados.

   ⚠ CONSECUENCIA QUE HAY QUE SABER: el reparto es una VISTA DERIVADA, no un dato
   guardado. Corregir hoy un registro de la semana pasada recalcula todos los
   repartos posteriores — que es lo correcto, pero significa que un informe impreso
   hoy puede no cuadrar con el mismo informe dentro de un mes. Por eso todo informe
   que salga de aquí debe llevar su fecha de cálculo.

   Módulo PURO: sin DOM, sin red, sin localStorage. Recibe filas ya leídas.
   ============================================================ */

/** Días de cuarentena de un lote recién ingresado (decisión del usuario). */
export const CUARENTENA_DIAS = 15;

export const ESTADO_CUARENTENA = 'Cuarentena';
export const ESTADO_PRODUCCION = 'Producción';
/** Una sala con lotes en estados distintos. El usuario confirmó que ocurre: no se
 *  elige uno de los dos y se esconde el otro — se dice que hay de las dos cosas. */
export const ESTADO_MIXTO = 'Mixto';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const ent = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Clave de una ubicación física. El número de tanque se repite entre salas, así que
 *  sólo identifica algo junto a la suya. */
export const ubicKey = (sala, tanque) => txt(sala) + '|' + ent(tanque);
/** Clave de una posición: qué composición está en qué tanque. */
export const posKey = (sala, tanque, lote, cg) => ubicKey(sala, tanque) + '|' + txt(lote) + '|' + txt(cg);

/* ── El reparto proporcional ────────────────────────────────
   El corazón del módulo, y el sitio donde un error da números que NADIE
   sospecharía: repartir 15 muertos entre dos lotes puede dar 8+7 o 10+5 y las dos
   parecen razonables. Sólo una es la proporcional.

   Se usa el método del RESTO MAYOR: se reparte la parte entera y los sobrantes van
   a quienes tenían la fracción más grande. Garantiza lo único que no puede fallar
   —que lo repartido sume EXACTAMENTE el total—, cosa que redondear cada parte por
   separado no garantiza: 3 lotes iguales con 10 muertos redondeando dan 3+3+3=9 y
   un animal desaparece del libro sin que nada lo diga. */

/** Reparte `total` entre los `pesos` dados, proporcionalmente. Devuelve enteros que
 *  suman exactamente `total`. Si todos los pesos son 0 devuelve ceros: no hay a quién
 *  atribuir, y quien llama debe tratarlo como discrepancia, no como reparto válido. */
export function repartirProporcional(total, pesos) {
  const t = ent(total);
  const w = (pesos || []).map((p) => (Number.isFinite(+p) && +p > 0 ? Math.floor(+p) : 0));
  const suma = w.reduce((a, b) => a + b, 0);
  if (t === 0 || suma === 0) return w.map(() => 0);

  const exactos = w.map((p) => (p * t) / suma);
  const base = exactos.map((e) => Math.floor(e));
  let resto = t - base.reduce((a, b) => a + b, 0);

  /* Los sobrantes van por fracción descendente. El desempate es por ÍNDICE y no por
     azar ni por orden de iteración: el mismo libro tiene que dar el mismo reparto
     cada vez que se calcula, o dos pantallas abiertas a la vez enseñarían cifras
     distintas del mismo día. */
  const orden = exactos
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));

  for (let k = 0; resto > 0 && k < orden.length; k++, resto--) base[orden[k].i]++;
  return base;
}

/* ── Construcción del libro ─────────────────────────────────── */

function nuevaPos(sala, tanque, lote, cg) {
  return { sala: txt(sala), tanque: ent(tanque), lote: txt(lote), codigoGenetico: txt(cg), machos: 0, hembras: 0 };
}

/** Aplica una baja de `cantidad` sobre las posiciones dadas, repartida en proporción
 *  al sexo indicado. Devuelve cuánto NO se pudo descontar (el déficit).
 *
 *  ⚠ El saldo se detiene en 0 y el sobrante se cuenta aparte en vez de dejarlo
 *  negativo. Un «−5 vivos» en pantalla no significa nada para quien lo lee; un
 *  «0 vivos y 5 muertes sin explicar» es exactamente la señal que se busca. */
function descontar(posiciones, sexo, cantidad) {
  const total = ent(cantidad);
  if (total === 0) return 0;
  const pesos = posiciones.map((p) => p[sexo]);
  const disponible = pesos.reduce((a, b) => a + b, 0);
  if (disponible === 0) return total;                 // nada a lo que atribuir
  const aplicable = Math.min(total, disponible);
  const partes = repartirProporcional(aplicable, pesos);
  posiciones.forEach((p, i) => { p[sexo] -= partes[i]; });
  return total - aplicable;
}

/* Prioridad dentro de un mismo día. Un animal que entra hoy puede morir hoy, así que
   el ingreso se aplica antes que la baja. */
const PRIORIDAD = { ingreso: 0, tanque: 1 };

/** Funde TODAS las fuentes en un solo flujo cronológico.
 *
 *  ⚠⚠ NO se puede procesar «todos los ingresos y luego todas las bajas», y es un error
 *  que este archivo cometió en su primera versión. Con un lote que entra el día 3, una
 *  baja del día 2 se le habría repartido igualmente: el reparto es al saldo vivo DE ESE
 *  DÍA, y ese saldo depende de qué había entrado hasta entonces. Aplanar por tipo da
 *  números plausibles y equivocados, que es la peor clase de error aquí.
 *
 *  `Array.prototype.sort` es estable, así que dos filas del mismo día y del mismo tipo
 *  conservan el orden en que llegaron: el resultado no depende de cómo las devolvió el
 *  Sheet. */
function flujo(fuentes) {
  const ev = [];
  for (const r of fuentes.ingresos || []) ev.push({ fecha: txt(r.Fecha), tipo: 'ingreso', r });
  for (const r of fuentes.tanques || []) ev.push({ fecha: txt(r.Fecha), tipo: 'tanque', r });
  return ev.sort((a, b) => a.fecha.localeCompare(b.fecha) || (PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo]));
}

/**
 * Construye el libro a partir de las filas ya leídas de las hojas.
 *
 * @param {{ingresos?:object[], tanques?:object[]}} fuentes filas tal como las devuelve
 *        `?p=rows` (objetos con las cabeceras por clave).
 * @param {{hoy?:string}} [opts] fecha de referencia para el estado de cuarentena.
 * @returns {{posiciones, tanques, lotes, avisos, hasta}}
 */
export function construirLibro(fuentes, opts) {
  const f = fuentes || {};
  const hoy = txt((opts || {}).hoy) || null;

  const pos = new Map();      // posKey → posición
  const lotes = new Map();    // lote   → { lote, ingreso, copulaDesde }
  const avisos = [];
  let hasta = '';

  const anota = (fecha, tipo, texto, extra) => {
    avisos.push(Object.assign({ fecha: txt(fecha), tipo, texto }, extra || {}));
  };

  /* ── 1 · El recorrido cronológico ────────────────────────
     Un solo bucle sobre TODOS los eventos en orden. El saldo con que se reparte una
     baja es el que hay en ese instante del recorrido, ni antes ni después. */
  for (const { fecha, tipo, r } of flujo(f)) {
    if (fecha > hasta) hasta = fecha;

    if (tipo === 'ingreso') {
      const lote = txt(r.Lote);
      const cg = txt(r['Código genético']);
      const sala = txt(r.Sala);
      const tq = ent(r.Tanque);
      if (!lote || !sala || !tq) {
        anota(fecha, 'ingreso-incompleto', 'Un ingreso sin lote, sala o tanque no entra en el libro.', { lote, sala, tanque: tq });
        continue;
      }
      const k = posKey(sala, tq, lote, cg);
      if (!pos.has(k)) pos.set(k, nuevaPos(sala, tq, lote, cg));
      const p = pos.get(k);
      p.machos += ent(r.Machos);
      p.hembras += ent(r.Hembras);

      if (!lotes.has(lote)) lotes.set(lote, { lote, ingreso: fecha, copulaDesde: null });
      const L = lotes.get(lote);
      if (!L.ingreso || fecha < L.ingreso) L.ingreso = fecha;
      continue;
    }

    /* Bajas del día. Mortalidad y descarte se registran POR TANQUE, como bloque, porque
       en un tanque mezclado no se distingue de qué lote era cada animal. */
    const sala = txt(r.Sala);
    const tq = ent(r.Tanque);
    if (!sala || !tq) continue;

    const uk = ubicKey(sala, tq);
    const enTanque = [...pos.values()].filter((p) => ubicKey(p.sala, p.tanque) === uk);

    const bajas = {
      machos: ent(r['Machos muertos']) + ent(r['Machos muertos por descarte de selección']),
      hembras: ent(r['Hembras muertas']) + ent(r['Hembras muertas por descarte de selección']),
    };

    if (!enTanque.length) {
      if (bajas.machos || bajas.hembras) {
        anota(fecha, 'sin-ingreso',
          'Se registraron bajas en ' + sala + ' tanque ' + tq + ' y ningún ingreso explica qué había ahí.',
          { sala, tanque: tq, machos: bajas.machos, hembras: bajas.hembras });
      }
    } else {
      for (const sexo of ['machos', 'hembras']) {
        const sobra = descontar(enTanque, sexo, bajas[sexo]);
        if (sobra > 0) {
          anota(fecha, 'deficit',
            'En ' + sala + ' tanque ' + tq + ' se registraron ' + sobra + ' ' + sexo +
            ' de baja de más de los que quedaban vivos.',
            { sala, tanque: tq, sexo, cantidad: sobra });
        }
      }
    }

    /* La CÓPULA rompe la cuarentena: es la señal real de que dejó de estarlo, antes de
       que se cumplan los 15 días. Se apunta la primera fecha por lote. */
    if (ent(r['Cópulas']) > 0) {
      for (const p of enTanque) {
        const L = lotes.get(p.lote);
        if (L && (!L.copulaDesde || fecha < L.copulaDesde)) L.copulaDesde = fecha;
      }
    }
  }

  /* ── 3 · Vistas derivadas ────────────────────────────────── */
  const porTanque = new Map();
  const porLote = new Map();

  for (const p of pos.values()) {
    const uk = ubicKey(p.sala, p.tanque);
    if (!porTanque.has(uk)) porTanque.set(uk, { sala: p.sala, tanque: p.tanque, machos: 0, hembras: 0, composicion: [] });
    const T = porTanque.get(uk);
    T.machos += p.machos;
    T.hembras += p.hembras;
    T.composicion.push({ lote: p.lote, codigoGenetico: p.codigoGenetico, machos: p.machos, hembras: p.hembras });

    if (!porLote.has(p.lote)) {
      const L = lotes.get(p.lote) || { lote: p.lote, ingreso: '', copulaDesde: null };
      porLote.set(p.lote, { lote: p.lote, ingreso: L.ingreso, copulaDesde: L.copulaDesde, machos: 0, hembras: 0, ubicaciones: [] });
    }
    const Lo = porLote.get(p.lote);
    Lo.machos += p.machos;
    Lo.hembras += p.hembras;
    if (Lo.ubicaciones.indexOf(uk) === -1) Lo.ubicaciones.push(uk);
  }

  /* El estado de cada lote se DEDUCE; el operario deja de teclearlo. */
  for (const L of porLote.values()) L.estado = estadoDeLote(L, hoy || hasta);

  return { posiciones: [...pos.values()], tanques: porTanque, lotes: porLote, avisos, hasta };
}

/* ── Cuarentena ─────────────────────────────────────────────── */

/** Suma días a una fecha `YYYY-MM-DD` sin depender de la zona horaria del navegador:
 *  se opera en UTC. Con `new Date('2026-09-08')` + horas locales, un dispositivo al
 *  oeste de Greenwich retrocede un día y la cuarentena terminaría con 24 h de desfase. */
export function sumarDias(fecha, dias) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(fecha));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

/** Estado de un lote en una fecha: Cuarentena hasta cumplir los 15 días desde su
 *  ingreso, o hasta que se le registre una cópula — lo que ocurra ANTES. */
export function estadoDeLote(lote, fecha) {
  const L = lote || {};
  const hoy = txt(fecha);
  if (!L.ingreso || !hoy) return '';
  if (L.copulaDesde && L.copulaDesde <= hoy) return ESTADO_PRODUCCION;
  return hoy < sumarDias(L.ingreso, CUARENTENA_DIAS) ? ESTADO_CUARENTENA : ESTADO_PRODUCCION;
}

/** Estado de una SALA: el de sus lotes, y `Mixto` cuando conviven los dos.
 *
 *  ⚠ La hoja `Maduración Sala` tiene UNA columna `Estado` por (Fecha, Sala), así que no
 *  puede llevar el detalle por lote sin migrarla. `Mixto` es más veraz que elegir uno de
 *  los dos y esconder el otro; el desglose va en la columna «Estado por lote». */
export function estadoDeSala(libro, sala, fecha) {
  const dentro = new Set();
  for (const T of (libro.tanques || new Map()).values()) {
    if (T.sala !== txt(sala)) continue;
    for (const c of T.composicion) if (c.machos > 0 || c.hembras > 0) dentro.add(c.lote);
  }
  const estados = [...dentro]
    .map((n) => estadoDeLote(libro.lotes.get(n), fecha))
    .filter(Boolean);
  if (!estados.length) return '';
  const unicos = [...new Set(estados)];
  return unicos.length === 1 ? unicos[0] : ESTADO_MIXTO;
}

/** Desglose legible para la columna «Estado por lote»: `AB: Cuarentena · BC: Producción`. */
export function estadoPorLoteTexto(libro, sala, fecha) {
  const partes = [];
  const vistos = new Set();
  for (const T of (libro.tanques || new Map()).values()) {
    if (T.sala !== txt(sala)) continue;
    for (const c of T.composicion) {
      if ((c.machos <= 0 && c.hembras <= 0) || vistos.has(c.lote)) continue;
      vistos.add(c.lote);
      const e = estadoDeLote(libro.lotes.get(c.lote), fecha);
      if (e) partes.push(c.lote + ': ' + e);
    }
  }
  return partes.sort().join(' · ');
}

/** Nombre visible de un tanque mezclado: `AB+BC`. Lo PROPONE el sistema para que nadie
 *  vuelva a teclearlo de dos maneras — en producción ya convive `BC/BA` escrito a mano. */
export function nombreComposicion(tanque) {
  const vivos = ((tanque && tanque.composicion) || []).filter((c) => c.machos > 0 || c.hembras > 0);
  const lotes = [...new Set(vivos.map((c) => c.lote))].sort();
  return lotes.join('+');
}
