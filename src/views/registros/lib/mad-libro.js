/* ============================================================
   MADURACIÓN · EL LIBRO MAYOR (Fase 2, 2026-09-08)

   Responde una sola pregunta, y de ella cuelga todo lo demás:
   **¿cuántos animales hay VIVOS ahora mismo en cada tanque y en cada lote?**

   ── POR QUÉ SE DEDUCE Y NO SE GUARDA ───────────────────────
   Nadie teclea un saldo. El saldo es la suma de los EVENTOS:

       + Ingreso           (Maduración Ingreso)
       − Mortalidad        (Maduración Tanques)
       − Descarte          (Maduración Tanques)
       ± Movimientos       (Maduración Movimientos · Fase 3, 2026-09-08) ✔
       − Fin de ciclo      (Maduración Fin de Ciclo · Fase 4B, 2026-09-08) ✔

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
/** Un lote al que se le registró un cierre TOTAL. Se distingue de «0 vivos» a propósito:
 *  un lote cerrado está terminado, uno a cero puede ser un descuadre. */
export const ESTADO_CERRADO = 'Cerrado';

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
/** Saca `cantidad` de las posiciones dadas, repartida en proporción al sexo, y devuelve
 *  QUÉ se sacó de cada una además del déficit.
 *
 *  ⚠ Existe porque un MOVIMIENTO necesita las partes: lo que sale del tanque de origen
 *  tiene que llegar al de destino conservando su lote y su código genético. Una baja sólo
 *  necesita el déficit, y por eso `descontar` es una fachada de ésta — NO una segunda
 *  implementación. Dos cañerías con la misma aritmética habrían divergido en silencio, que
 *  es exactamente lo que este proyecto ya tiene escrito que no vuelve a hacer. */
function tomarDe(posiciones, sexo, cantidad) {
  const total = ent(cantidad);
  const nada = posiciones.map(() => 0);
  if (total === 0) return { partes: nada, sobra: 0 };
  const pesos = posiciones.map((p) => p[sexo]);
  const disponible = pesos.reduce((a, b) => a + b, 0);
  if (disponible === 0) return { partes: nada, sobra: total };   // nada a lo que atribuir
  const aplicable = Math.min(total, disponible);
  const partes = repartirProporcional(aplicable, pesos);
  posiciones.forEach((p, i) => { p[sexo] -= partes[i]; });
  return { partes, sobra: total - aplicable };
}

function descontar(posiciones, sexo, cantidad) {
  return tomarDe(posiciones, sexo, cantidad).sobra;
}

/* Prioridad dentro de un mismo día, y las tres posiciones están razonadas:
     ingreso (0)     un animal que entra hoy puede moverse hoy y puede morir hoy;
     movimiento (1)  el que llega hoy a un tanque puede morir hoy EN ESE tanque;
     tanque (2)      las bajas se registran por tanque al cerrar el día.
   🔑 Es el único orden que permite las dos cosas a la vez. Con el movimiento DESPUÉS de
   la baja, los animales que llegaron hoy no podrían aparecer en la mortalidad de hoy de su
   tanque nuevo, y esa baja se repartiría entre los que ya estaban — números plausibles y
   equivocados, la misma familia de error que la lección M01. */
/* El cierre va el ÚLTIMO: es lo que le pasa a un lote al final, después de que hayan
   entrado, se hayan movido y se hayan contado las bajas del día. Ponerlo antes haría que
   una baja registrada hoy se repartiera sobre animales que ya se habían ido. */
const PRIORIDAD = { ingreso: 0, movimiento: 1, tanque: 2, fin: 3 };

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
  for (const r of fuentes.movimientos || []) ev.push({ fecha: txt(r.Fecha), tipo: 'movimiento', r });
  for (const r of fuentes.tanques || []) ev.push({ fecha: txt(r.Fecha), tipo: 'tanque', r });
  for (const r of fuentes.cierres || []) ev.push({ fecha: txt(r.Fecha), tipo: 'fin', r });
  return ev.sort((a, b) => a.fecha.localeCompare(b.fecha) || (PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo]));
}

/**
 * Construye el libro a partir de las filas ya leídas de las hojas.
 *
 * @param {{ingresos?:object[], movimientos?:object[], tanques?:object[], cierres?:object[]}} fuentes filas tal como las devuelve
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

      if (!lotes.has(lote)) lotes.set(lote, { lote, ingreso: fecha, copulaDesde: null, cerrado: null });
      const L = lotes.get(lote);
      /* DECISIÓN DEL USUARIO (2026-09-08): un SEGUNDO ingreso REINICIA la cuarentena, así
         que manda la fecha MÁS RECIENTE. Antes se guardaba la MENOR.
         Y hay que BORRAR la cópula anterior, o la decisión no haría nada en el caso común:
         un lote que ya copuló arrastraría un copulaDesde viejo y estadoDeLote lo devolvería
         a Producción el mismo día en que llegan los animales nuevos. Sólo una cópula DESDE
         el último ingreso vuelve a romperla; el flujo va en orden cronológico, así que con
         borrarla aquí basta.
         Dos filas del MISMO día no reinician nada: la comparación es estricta.
         🔴 Y POR LA MISMA RAZÓN SE BORRA «cerrado» (2026-09-09). Sin esto, un lote que se
         cerró en Total y vuelve a recibir animales se quedaba «Cerrado» PARA SIEMPRE con
         vivos en el saldo: es el estado imposible que M19 de su propio banco declara
         inaceptable —«el lote quedaría cerrado y con animales vivos a la vez»—, y no se
         quedaba en la pantalla. estadoDeSala devolvía «Cerrado», que el desplegable de
         Estado de «Maduración Sala» NO TIENE, así que la propuesta VACIABA esa casilla y
         el operario la guardaba vacía sin enterarse.
         Cuenta el cierre POSTERIOR al último ingreso, igual que la cópula. */
      if (!L.ingreso || fecha > L.ingreso) { L.ingreso = fecha; L.copulaDesde = null; L.cerrado = null; }
      continue;
    }

    /* ── MOVIMIENTOS (Fase 3) ────────────────────────────────
       Un tramo saca animales de un tanque y los mete en otro. Lo MEDIDO es cuántos se
       movieron; DE QUÉ LOTE eran es una deducción, y por eso se calcula en vez de pedirse:
       se reparte en proporción a los vivos que cada lote tiene en el origen ESE DÍA —la
       misma regla que la mortalidad, y por el mismo motivo: en un tanque mezclado nadie
       sabe de qué lote era cada animal—.
       🔑 Lo que sale LLEGA conservando lote y código genético. Sin eso, el destino tendría
       animales sin dueño y el saldo por lote dejaría de cuadrar con el saldo por tanque. */
    if (tipo === 'movimiento') {
      const sO = txt(r['Sala origen']);
      const tO = ent(r['Tanque origen']);
      const sD = txt(r['Sala destino']);
      const tD = ent(r['Tanque destino']);
      const pedido = { machos: ent(r.Machos), hembras: ent(r.Hembras) };
      if (!sO || !tO || !sD || !tD) {
        anota(fecha, 'movimiento-incompleto',
          'Un movimiento sin origen o sin destino completos no entra en el libro.',
          { salaOrigen: sO, tanqueOrigen: tO, salaDestino: sD, tanqueDestino: tD });
        continue;
      }
      if (ubicKey(sO, tO) === ubicKey(sD, tD)) {
        anota(fecha, 'movimiento-circular',
          'Un movimiento de ' + sO + ' tanque ' + tO + ' a sí mismo no mueve nada.',
          { sala: sO, tanque: tO });
        continue;
      }
      const ukO = ubicKey(sO, tO);
      const origen = [...pos.values()].filter((p) => ubicKey(p.sala, p.tanque) === ukO);
      if (!origen.length) {
        if (pedido.machos || pedido.hembras) {
          anota(fecha, 'movimiento-sin-origen',
            'Se movieron animales desde ' + sO + ' tanque ' + tO + ' y ningún ingreso explica qué había ahí.',
            { sala: sO, tanque: tO, machos: pedido.machos, hembras: pedido.hembras });
        }
        continue;
      }
      for (const sexo of ['machos', 'hembras']) {
        const { partes, sobra } = tomarDe(origen, sexo, pedido[sexo]);
        origen.forEach((p, i) => {
          if (!partes[i]) return;
          const k = posKey(sD, tD, p.lote, p.codigoGenetico);
          if (!pos.has(k)) pos.set(k, nuevaPos(sD, tD, p.lote, p.codigoGenetico));
          pos.get(k)[sexo] += partes[i];
        });
        if (sobra > 0) {
          anota(fecha, 'deficit-movimiento',
            'Se movieron ' + sobra + ' ' + sexo + ' de más desde ' + sO + ' tanque ' + tO +
            ' de los que quedaban vivos: esos no llegaron al destino.',
            { sala: sO, tanque: tO, sexo, cantidad: sobra });
        }
      }
      continue;
    }

    /* ── FIN DE CICLO (Fase 4B) ───────────────────────────────
       Se cierra un LOTE, no un tanque (decisión del usuario): lo que sale se descuenta de
       cada tanque donde el lote esté, en proporción a lo que tenga vivo ese día. El
       operario no enumera tanques, igual que no los enumera al desovar.
       🔑🔑 Y en un cierre TOTAL, lo que el libro creía que quedaba y NO salió es LA
       DIFERENCIA: se anota con su fecha y el lote se pone a cero. No se esconde ni se
       bloquea — «la diferencia ES el producto», que es la regla del módulo entero. */
    if (tipo === 'fin') {
      const lote = txt(r.Lote);
      const esTotal = txt(r.Tipo) === 'Total';
      const pedido = { machos: ent(r.Machos), hembras: ent(r.Hembras) };
      if (!lote) {
        anota(fecha, 'cierre-incompleto', 'Un cierre sin lote no entra en el libro.');
        continue;
      }
      const posLote = [...pos.values()].filter((p) => p.lote === lote);
      if (!posLote.length) {
        anota(fecha, 'cierre-sin-lote',
          'Se cerró el lote ' + lote + ' y ningún ingreso explica dónde estaba.',
          { lote, machos: pedido.machos, hembras: pedido.hembras });
        continue;
      }
      for (const sexo of ['machos', 'hembras']) {
        const { sobra } = tomarDe(posLote, sexo, pedido[sexo]);
        if (sobra > 0) {
          anota(fecha, 'deficit-cierre',
            'Del lote ' + lote + ' salieron ' + sobra + ' ' + sexo + ' de más de los que el libro tenía vivos.',
            { lote, sexo, cantidad: sobra });
        }
      }
      if (esTotal) {
        for (const sexo of ['machos', 'hembras']) {
          const resto = posLote.reduce((a, p) => a + p[sexo], 0);
          if (resto > 0) {
            anota(fecha, 'diferencia-cierre',
              'Al cerrar el lote ' + lote + ' el libro contaba ' + resto + ' ' + sexo +
              ' que no salieron. Esa diferencia se anota y el lote queda a cero.',
              { lote, sexo, cantidad: resto });
            posLote.forEach((p) => { p[sexo] = 0; });
          }
        }
        const L = lotes.get(lote);
        if (L && (!L.cerrado || fecha > L.cerrado)) L.cerrado = fecha;
      }
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
       que se cumplan los 15 días. Se apunta la primera DESDE EL ÚLTIMO INGRESO: un ingreso
       nuevo la borra, porque reinicia la cuarentena (decisión del usuario, 2026-09-08). */
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
      porLote.set(p.lote, { lote: p.lote, ingreso: L.ingreso, copulaDesde: L.copulaDesde, cerrado: L.cerrado || null, machos: 0, hembras: 0, ubicaciones: [] });
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

/** Estado de un lote en una fecha: Cuarentena hasta cumplir los 15 días desde su ÚLTIMO
 *  ingreso, o hasta que se le registre una cópula POSTERIOR a ese ingreso — lo que ocurra
 *  ANTES. Un segundo ingreso reinicia el plazo y anula la cópula previa: los animales que
 *  acaban de llegar no quedan certificados por una cópula de los que ya estaban. */
export function estadoDeLote(lote, fecha) {
  const L = lote || {};
  const hoy = txt(fecha);
  if (!L.ingreso || !hoy) return '';
  /* Va PRIMERO: un lote cerrado ya no está en cuarentena ni en producción, está terminado.
     Y se distingue de «0 vivos» a propósito — un cero puede ser un descuadre; un cierre es
     una decisión que alguien registró. */
  if (L.cerrado && L.cerrado <= hoy) return ESTADO_CERRADO;
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
