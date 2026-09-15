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
       − Hembras muertas en tanques de desove y de recuperación
                           (Maduración Mortalidad Desove · 2026-09-15) ✔

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
/** 2026-09-14 (usuario): una SALA sin animales está en DESINFECCIÓN. Es un estado de la SALA,
 *  nunca de un lote: por eso sólo lo devuelve `estadoDeSala`, no `estadoDeLote`. */
export const ESTADO_DESINFECCION = 'Desinfección';
/** ...y el caso mixto que describió el usuario: la sala SÍ tiene animales, en producción, pero
 *  AGRUPADOS en pocos tanques mientras los demás están vacíos (y se desinfectan). */
export const ESTADO_DESINFECCION_AGRUPADA = 'Desinfección - Producción agrupada';
/** «Pocos tanques»: como mucho esta fracción de los tanques de la sala tiene animales (la
 *  mitad o menos ocupada → la otra mitad o más, vacía). CONFIRMADO por el usuario el 2026-09-14
 *  (D3): no es un valor provisional. Lo propuesto lo revisa el operario antes de guardar. */
export const AGRUPADA_MAX_FRACCION = 0.5;

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

/** Saca `cantidad` de las posiciones dadas, repartida en proporción al sexo, y devuelve
 *  QUÉ se sacó de cada una además del déficit.
 *
 *  ⚠ El saldo se detiene en 0 y el sobrante se cuenta aparte en vez de dejarlo
 *  negativo. Un «−5 vivos» en pantalla no significa nada para quien lo lee; un
 *  «0 vivos y 5 muertes sin explicar» es exactamente la señal que se busca.
 *
 *  ⚠ Es la ÚNICA cañería del reparto: la usan los movimientos (lo que sale llega al destino
 *  conservando lote y código genético), las bajas (desde el 2026-09-15 necesitan las partes
 *  para contar muertos y descartes de cada lote), los cierres y la mortalidad en desove. Dos
 *  cañerías con la misma aritmética habrían divergido en silencio. */
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
/* 2026-09-15 · la mortalidad de hembras en tanques de DESOVE y de RECUPERACIÓN va después de las bajas de
   los tanques (los animales salieron de ellos a desovar) y antes del cierre. */
const PRIORIDAD = { ingreso: 0, movimiento: 1, tanque: 2, mortdes: 3, fin: 4 };

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
  for (const r of fuentes.mortDesove || []) ev.push({ fecha: txt(r.Fecha), tipo: 'mortdes', r });
  return ev.sort((a, b) => a.fecha.localeCompare(b.fecha) || (PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo]));
}

/**
 * Construye el libro a partir de las filas ya leídas de las hojas.
 *
 * @param {{ingresos?:object[], movimientos?:object[], tanques?:object[], cierres?:object[]}} fuentes filas tal como las devuelve
 *        `?p=rows` (objetos con las cabeceras por clave).
 * @param {{hoy?:string, hasta?:string}} [opts] `hoy`: fecha de referencia para el estado de
 *        cuarentena. `hasta` (D4, 2026-09-14): si se da, sólo entran los eventos de esa fecha o
 *        anteriores —el libro «al cierre» de ese día—; sin ella, entran todos. La usa «🔄 Proponer
 *        estado» de Salas, que propone el estado de la fecha elegida en la ficha: con el libro de
 *        HOY, una fecha pasada heredaba qué lotes y cuántos tanques hay hoy.
 * @returns {{posiciones, tanques, lotes, avisos, hasta}}
 */
export function construirLibro(fuentes, opts) {
  const f = fuentes || {};
  const hoy = txt((opts || {}).hoy) || null;
  const corte = txt((opts || {}).hasta) || null;

  const pos = new Map();      // posKey → posición
  const lotes = new Map();    // lote   → { lote, ingreso, copulaDesde, cerrado, salas: Map sala → { sala, ingreso, copulaDesde } }
  const avisos = [];
  let hasta = '';

  const anota = (fecha, tipo, texto, extra) => {
    avisos.push(Object.assign({ fecha: txt(fecha), tipo, texto }, extra || {}));
  };
  /* 2026-09-15 · lo que el RESUMEN necesita por lote y el saldo sólo no dice: cuántos entraron, cuántos
     murieron y cuántos se descartaron (lo que salió de CADA lote en las bajas de sus tanques, repartido igual
     que el saldo), y la mortalidad de hembras en tanques de desove y de recuperación. */
  const contadores = () => ({
    ingresados: { machos: 0, hembras: 0 }, muertos: { machos: 0, hembras: 0 }, descartes: { machos: 0, hembras: 0 },
    mortDesove: { entran: 0, muertas: 0 }, mortRecuperacion: { entran: 0, muertas: 0 },
  });

  /* ── LA CUARENTENA ES DE CADA SALA (usuario, 2026-09-14) ──────────────────
     «Un lote puede estar en varias salas pero en distintos tanques, y a su vez en una misma sala
     pueden haber distintos lotes.» Hasta ese día la cuarentena y la cópula se llevaban POR LOTE,
     sin sala: un segundo ingreso del lote en la Sala 2 devolvía a «Cuarentena» a la Sala 1, que
     llevaba un mes produciendo, y una cópula en la Sala 1 sacaba de cuarentena a la Sala 2. Y
     «🔄 Proponer estado» de Salas GUARDA lo que propone.
     Ahora cada (lote, sala) lleva su propio reloj: el ingreso lo reinicia EN SU SALA (la decisión
     del 09-08 sobre el segundo ingreso, en la sala donde entran los animales), la cópula lo rompe EN
     SU SALA, y el cierre sigue siendo del lote entero. Los campos del lote (`ingreso`, `copulaDesde`)
     siguen calculándose como siempre; el estado del lote sale de sus salas.
     `finDeCuarentena`: el día en que el reloj deja de estar en cuarentena (su cópula, o sus 15 días). */
  const finDeCuarentena = (S) => S.copulaDesde || sumarDias(S.ingreso, CUARENTENA_DIAS);
  /* Lo que se MUEVE de sala lleva consigo su reloj: la sala destino, si el lote no estaba, lo
     hereda; si ya estaba, manda la cuarentena que termina MÁS TARDE —unos animales en cuarentena
     no dejan de estarlo por llegar a una sala que produce, y a la inversa la sala sigue en la suya—. */
  const llevaReloj = (lote, desde, hacia) => {
    const L = lotes.get(lote);
    if (!L || desde === hacia) return;
    const O = L.salas.get(desde);
    if (!O) return;
    const D = L.salas.get(hacia);
    if (!D) L.salas.set(hacia, { sala: hacia, ingreso: O.ingreso, copulaDesde: O.copulaDesde });
    else if (finDeCuarentena(O) > finDeCuarentena(D)) { D.ingreso = O.ingreso; D.copulaDesde = O.copulaDesde; }
  };

  /* ── 1 · El recorrido cronológico ────────────────────────
     Un solo bucle sobre TODOS los eventos en orden. El saldo con que se reparte una
     baja es el que hay en ese instante del recorrido, ni antes ni después. */
  for (const { fecha, tipo, r } of flujo(f)) {
    if (corte && fecha > corte) continue;       // D4: lo posterior al corte todavía no ha pasado
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

      if (!lotes.has(lote)) lotes.set(lote, { lote, ingreso: fecha, copulaDesde: null, cerrado: null, salas: new Map(), ...contadores() });
      const L = lotes.get(lote);
      L.ingresados.machos += ent(r.Machos);
      L.ingresados.hembras += ent(r.Hembras);
      /* ♻ El reloj de ESTA sala: el ingreso reinicia la cuarentena donde entran los animales. */
      const S = L.salas.get(sala);
      if (!S) L.salas.set(sala, { sala, ingreso: fecha, copulaDesde: null });
      else if (fecha > S.ingreso) { S.ingreso = fecha; S.copulaDesde = null; }
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
          llevaReloj(p.lote, p.sala, sD);   // ♻ los animales llegan con su cuarentena
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
      /* D14 (2026-09-14): un cierre PARCIAL que dice su sala descuenta sólo de los tanques del lote
         en esa sala. Un Total es siempre del lote entero: su sala, si la hubiera, no cuenta. */
      const salaCierre = esTotal ? '' : txt(r.Sala);
      const enSala = salaCierre ? { sala: salaCierre } : {};
      const posLote = [...pos.values()].filter((p) => p.lote === lote && (!salaCierre || p.sala === salaCierre));
      if (!posLote.length) {
        anota(fecha, 'cierre-sin-lote',
          salaCierre
            ? 'Se cerró el lote ' + lote + ' en ' + salaCierre + ' y ningún ingreso explica que estuviera allí.'
            : 'Se cerró el lote ' + lote + ' y ningún ingreso explica dónde estaba.',
          { lote, ...enSala, machos: pedido.machos, hembras: pedido.hembras });
        continue;
      }
      for (const sexo of ['machos', 'hembras']) {
        const { sobra } = tomarDe(posLote, sexo, pedido[sexo]);
        if (sobra > 0) {
          anota(fecha, 'deficit-cierre',
            'Del lote ' + lote + ' salieron ' + sobra + ' ' + sexo + ' de más de los que el libro tenía vivos' +
            (salaCierre ? ' en ' + salaCierre : '') + '.',
            { lote, ...enSala, sexo, cantidad: sobra });
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

    /* ── MORTALIDAD EN TANQUES DE DESOVE Y DE RECUPERACIÓN (2026-09-15, usuario) ──
       Las hembras salen de sus tanques a desovar y a recuperarse; las que mueren allí no vuelven, así que se
       descuentan del LOTE entero, repartidas entre sus tanques en proporción a sus hembras vivas (como un
       cierre parcial sin sala). Cuentan como MUERTAS del lote y se acumulan por tipo de tanque. */
    if (tipo === 'mortdes') {
      const lote = txt(r.Lote);
      const clase = txt(r['Tipo de tanque']);
      const reg = clase === 'Recuperación' ? 'mortRecuperacion' : clase === 'Desove' ? 'mortDesove' : '';
      const muertas = ent(r['Hembras muertas']);
      const donde = clase === 'Recuperación' ? 'recuperación' : 'desove';
      if (!reg) {
        anota(fecha, 'mortdes-tipo', '«' + clase + '» no es un tipo de tanque conocido (Desove o Recuperación): la fila no entra en el libro.', { lote });
        continue;
      }
      const L = lotes.get(lote);
      const posLote = [...pos.values()].filter((p) => p.lote === lote);
      if (!lote || !L || !posLote.length) {
        if (muertas) {
          anota(fecha, 'mortdes-sin-lote', 'Murieron ' + muertas + ' hembras del lote ' + (lote || '(sin lote)') +
            ' en tanques de ' + donde + ' y ningún ingreso explica dónde estaba.', { lote, hembras: muertas });
        }
        continue;
      }
      L[reg].entran += ent(r['Hembras que entran']);
      L[reg].muertas += muertas;
      const { partes, sobra } = tomarDe(posLote, 'hembras', muertas);
      L.muertos.hembras += partes.reduce((a, b) => a + b, 0);
      if (sobra > 0) {
        anota(fecha, 'deficit-mortdes', 'Del lote ' + lote + ' murieron ' + sobra + ' hembras de más en tanques de ' + donde +
          ' de las que el libro tenía vivas.', { lote, sexo: 'hembras', cantidad: sobra });
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

    const muertes = { machos: ent(r['Machos muertos']), hembras: ent(r['Hembras muertas']) };
    const selecc = { machos: ent(r['Machos muertos por descarte de selección']), hembras: ent(r['Hembras muertas por descarte de selección']) };
    const bajas = { machos: muertes.machos + selecc.machos, hembras: muertes.hembras + selecc.hembras };

    if (!enTanque.length) {
      if (bajas.machos || bajas.hembras) {
        anota(fecha, 'sin-ingreso',
          'Se registraron bajas en ' + sala + ' tanque ' + tq + ' y ningún ingreso explica qué había ahí.',
          { sala, tanque: tq, machos: bajas.machos, hembras: bajas.hembras });
      }
    } else {
      for (const sexo of ['machos', 'hembras']) {
        const { partes, sobra } = tomarDe(enTanque, sexo, bajas[sexo]);
        /* Lo que salió de cada lote se parte entre muertos y descartes en la proporción del tanque ese día:
           por resto mayor, así que muertos + descartes es EXACTAMENTE lo que el saldo le quitó al lote. */
        enTanque.forEach((p, i) => {
          if (!partes[i]) return;
          const L = lotes.get(p.lote);
          if (!L) return;
          const [m, d] = repartirProporcional(partes[i], [muertes[sexo], selecc[sexo]]);
          L.muertos[sexo] += m;
          L.descartes[sexo] += d;
        });
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
        const S = L ? L.salas.get(sala) : null;   // ♻ y la rompe EN ESTA SALA, no en las demás
        if (S && (!S.copulaDesde || fecha < S.copulaDesde)) S.copulaDesde = fecha;
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
      const L = lotes.get(p.lote) || { lote: p.lote, ingreso: '', copulaDesde: null, ...contadores() };
      const copia = (o) => ({ ...o });
      porLote.set(p.lote, { lote: p.lote, ingreso: L.ingreso, copulaDesde: L.copulaDesde, cerrado: L.cerrado || null, machos: 0, hembras: 0, ubicaciones: [], salas: [],
        ingresados: copia(L.ingresados), muertos: copia(L.muertos), descartes: copia(L.descartes),
        mortDesove: copia(L.mortDesove), mortRecuperacion: copia(L.mortRecuperacion) });
    }
    const Lo = porLote.get(p.lote);
    Lo.machos += p.machos;
    Lo.hembras += p.hembras;
    if (Lo.ubicaciones.indexOf(uk) === -1) Lo.ubicaciones.push(uk);
    let S = Lo.salas.find((s) => s.sala === p.sala);
    if (!S) {
      const reloj = ((lotes.get(p.lote) || {}).salas || new Map()).get(p.sala) || { ingreso: '', copulaDesde: null };
      S = { sala: p.sala, ingreso: reloj.ingreso, copulaDesde: reloj.copulaDesde, machos: 0, hembras: 0 };
      Lo.salas.push(S);
    }
    S.machos += p.machos;
    S.hembras += p.hembras;
  }

  /* El estado de cada lote se DEDUCE; el operario deja de teclearlo. ♻ Y sale de SUS SALAS: el de
     cada una con su reloj, y el del lote es el de las salas donde le quedan animales —si no le
     queda en ninguna, el de todas—; si no coinciden, `Mixto`, con el desglose en `salas`. Con el
     lote en una sola sala es exactamente el de siempre. */
  const ref = hoy || hasta;
  for (const L of porLote.values()) {
    L.salas.sort((a, b) => (a.sala < b.sala ? -1 : a.sala > b.sala ? 1 : 0));
    L.salas.forEach((s) => { s.estado = estadoDeLote({ ingreso: s.ingreso, copulaDesde: s.copulaDesde, cerrado: L.cerrado }, ref); });
    const conVivos = L.salas.filter((s) => s.machos > 0 || s.hembras > 0);
    const estados = [...new Set((conVivos.length ? conVivos : L.salas).map((s) => s.estado).filter(Boolean))];
    L.estado = estados.length > 1 ? ESTADO_MIXTO : (estados[0] || '');
  }

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

/** Estado de un lote DENTRO de una sala (2026-09-14): con el reloj de esa sala —su último ingreso
 *  y su cópula ahí— y el cierre del lote entero. Es el que usan la sala y su desglose: un lote
 *  repartido en dos salas puede estar en cuarentena en una y produciendo en la otra.
 *  Si el lote no tiene reloj en esa sala (no debería pasar: lo crean su ingreso o lo que se mueve
 *  ahí), cae al estado del lote. */
export function estadoDeLoteEnSala(lote, sala, fecha) {
  const L = lote || {};
  const S = (L.salas || []).find((s) => s.sala === txt(sala));
  return S ? estadoDeLote({ ingreso: S.ingreso, copulaDesde: S.copulaDesde, cerrado: L.cerrado }, fecha) : estadoDeLote(L, fecha);
}

/** Ocupación física de una SALA según el libro: cuántos tanques tienen animales vivos y de
 *  cuántos dispone. `tanquesDeSala` es la lista FÍSICA (MAD_TANQUES_POR_SALA): el libro sólo
 *  conoce los tanques que alguna vez recibieron animales, así que sin ella no sabe cuántos hay
 *  vacíos y `total` se queda en los ocupados (nunca sale «agrupada»). ⚠ Un tanque vaciado que el
 *  libro conoce NO se suma por su cuenta: la sala es la lista física, no la memoria del libro.
 *  `conocida` dice si el libro ha tenido ALGUNA vez animales en esa sala. */
export function ocupacionDeSala(libro, sala, tanquesDeSala) {
  const todos = new Set();
  const ocupados = new Set();
  let conocida = false;
  for (const t of (Array.isArray(tanquesDeSala) ? tanquesDeSala : [])) if (ent(t)) todos.add(ent(t));
  for (const T of (libro.tanques || new Map()).values()) {
    if (T.sala !== txt(sala)) continue;
    conocida = true;
    if (T.composicion.some((c) => c.machos > 0 || c.hembras > 0)) {
      ocupados.add(ent(T.tanque));
      todos.add(ent(T.tanque));
    }
  }
  return { conocida, ocupados: ocupados.size, total: todos.size };
}

/** Estado de una SALA: el de sus lotes, y `Mixto` cuando conviven los dos.
 *
 *  ⚠ La hoja `Maduración Sala` tiene UNA columna `Estado` por (Fecha, Sala), así que no
 *  puede llevar el detalle por lote sin migrarla. `Mixto` es más veraz que elegir uno de
 *  los dos y esconder el otro; el desglose va en la columna «Estado por lote».
 *
 *  2026-09-14 (usuario): sin animales es `Desinfección`; y en producción con los animales en
 *  pocos tanques (AGRUPADA_MAX_FRACCION) y el resto vacío, `Desinfección - Producción agrupada`.
 *  ⚠ Lo agrupado sólo se dice de una sala en PRODUCCIÓN: una en cuarentena o mixta sigue
 *  diciendo eso, que es lo sanitario, y el nombre del estado nombra la producción. */
export function estadoDeSala(libro, sala, fecha, tanquesDeSala) {
  const dentro = new Set();
  for (const T of (libro.tanques || new Map()).values()) {
    if (T.sala !== txt(sala)) continue;
    for (const c of T.composicion) if (c.machos > 0 || c.hembras > 0) dentro.add(c.lote);
  }
  const oc = ocupacionDeSala(libro, sala, tanquesDeSala);
  /* 🔴🔴 SÓLO UNA SALA QUE EL LIBRO CONOCE PUEDE DECLARARSE VACÍA. Medido el 2026-09-14: el
     libro sólo tenía ingresos de la Sala 4, y los operarios habían tecleado «Producción» en
     las Salas 1, 2 y 5 el 09-08 — animales de antes del registro que el libro no ve. Decir
     «Desinfección» de toda sala sin ingresos habría propuesto vaciar tres salas llenas, y
     lo propuesto SE GUARDA. Una sala que el libro nunca ha visto no tiene estado deducible. */
  if (!dentro.size) return oc.conocida ? ESTADO_DESINFECCION : '';
  const estados = [...dentro]
    .map((n) => estadoDeLoteEnSala(libro.lotes.get(n), sala, fecha))   // ♻ el de cada lote EN ESTA sala
    .filter(Boolean);
  if (!estados.length) return '';
  const unicos = [...new Set(estados)];
  const estado = unicos.length === 1 ? unicos[0] : ESTADO_MIXTO;
  if (estado === ESTADO_PRODUCCION && oc.ocupados <= oc.total * AGRUPADA_MAX_FRACCION) return ESTADO_DESINFECCION_AGRUPADA;
  return estado;
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
      const e = estadoDeLoteEnSala(libro.lotes.get(c.lote), sala, fecha);   // ♻ en ESTA sala
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

/* ── D13 (2026-09-14) · DOS LOTES EN UN TANQUE, SÓLO POR MEZCLA O AGRUPACIÓN ────────────────
   Decisión del usuario: un lote puede estar en varias salas y una sala tener varios lotes, pero dos
   lotes comparten TANQUE sólo en una mezcla o una agrupación, que se registran como tales en
   Movimientos. Un ingreso o una Transferencia que deje dos lotes juntos se AVISA, no se bloquea:
   el libro puede ir atrasado respecto a lo que hay en el agua, y la decisión es del operario. */

/** Los lotes con animales VIVOS en un tanque, ordenados. */
export function lotesVivosEnTanque(libro, sala, tanque) {
  const T = ((libro && libro.tanques) || new Map()).get(ubicKey(sala, tanque));
  const vivos = ((T && T.composicion) || []).filter((c) => c.machos > 0 || c.hembras > 0);
  return [...new Set(vivos.map((c) => c.lote))].sort();
}

const deLotes = (ls) => (ls.length > 1 ? 'de los lotes ' : 'del lote ') + ls.join(', ');

/** Ingreso: un aviso por cada tanque del reparto que ya tenga vivo OTRO lote. `lote` va normalizado. */
export function avisosIngresoCompartido(libro, lote, ubicaciones) {
  const avisos = [];
  const l = txt(lote);
  if (!l) return avisos;
  const vistos = new Set();
  for (const u of ubicaciones || []) {
    const sala = txt(u && u.sala);
    const t = ent(u && u.tanque);
    if (!sala || !t || vistos.has(ubicKey(sala, t))) continue;
    vistos.add(ubicKey(sala, t));
    const otros = lotesVivosEnTanque(libro, sala, t).filter((x) => x !== l);
    if (otros.length) {
      avisos.push('El tanque ' + t + ' de ' + sala + ' ya tiene animales vivos ' + deLotes(otros) + ': el lote ' + l +
        ' lo compartiría. Dos lotes sólo comparten tanque en una mezcla o una agrupación (🔄 Movimientos).');
    }
  }
  return avisos;
}

/** Movimientos: en una TRANSFERENCIA, un aviso por tramo cuyo destino tenga vivo un lote que no está
 *  en su origen. Agrupación y Mezcla juntan lotes a propósito: no avisan. */
export function avisosTransferenciaCompartida(libro, tipo, tramos) {
  const avisos = [];
  if (txt(tipo) !== 'Transferencia') return avisos;
  (tramos || []).forEach((tr, i) => {
    const x = tr || {};
    const sD = txt(x.salaDestino);
    const tD = ent(x.tanqueDestino);
    if (!sD || !tD) return;
    const vienen = lotesVivosEnTanque(libro, x.salaOrigen, x.tanqueOrigen);
    const otros = lotesVivosEnTanque(libro, sD, tD).filter((l) => vienen.indexOf(l) === -1);
    if (otros.length) {
      avisos.push('Tramo ' + (i + 1) + ': el tanque ' + tD + ' de ' + sD + ' ya tiene animales vivos ' + deLotes(otros) +
        (otros.length > 1 ? ', que no están' : ', que no está') + ' en el origen: la Transferencia los dejaría compartiendo tanque. ' +
        'Si se juntan lotes, el tipo es Mezcla o Agrupación.');
    }
  });
  return avisos;
}
