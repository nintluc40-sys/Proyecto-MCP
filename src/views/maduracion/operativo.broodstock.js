/* ============================================================
   MADURACIÓN · OPERATIVO — BROODSTOCK, LAS PISCINAS DE ORIGEN (F6.1, 2026-09-21)

   Lo que enseña el bloque «📈 Piscinas de origen» de 🧬 Lotes, con el diseño que aprobó el usuario el 2026-09-21:
   Broodstock vive DENTRO de Lotes —es el ORIGEN de los lotes, junto a la comparativa por piscina que ya estaba ahí—
   como TABLA de piscinas con su FICHA debajo, igual que 🧬 Lotes y 🛢 Tanques. Módulo PURO: ni DOM ni red.

   La fuente es `Maduración Broodstock`, la carga SEMANAL del Excel del área: una fila por (Fecha de corte · Piscina).
   El histórico SON las semanas: no hay cinco columnas de pesos que rotar.

   🔑 LA TABLA ES UNA FOTO: el ÚLTIMO corte hasta el día elegido, como el mapa de 📊 Estado actual. Cada piscina con
   la fila de ESE corte, nunca una mezcla de semanas —y el último corte es el de la planta, no el del filtro: filtrar
   una piscina que dejó de venir no la enseña con su semana vieja como si fuera de ahora—. Las que vinieron en el
   corte anterior y no en éste se listan aparte (re-subir una semana NO borra las que ya no vienen, decisión del
   usuario del 09-18). La FICHA sí es del período: su curva son los cortes del período.

   🔑 EL ENLACE CON LOS LOTES es la «Piscina Broodstock» del Ingreso en su forma CANÓNICA (`normPiscina`, la que usa
   la carga: el Excel trae la piscina unas veces como número y otras como texto, y el Ingreso la guarda como se
   tecleó). Y el DESEMPEÑO de cada piscina no se recalcula con otra fórmula: es `desempenoPorOrigen(…, 'piscina')`,
   la de la comparativa de 🧬 Lotes, sobre las hojas hasta el día elegido. Mientras cada piscina se escriba de una
   sola forma en el Ingreso, las dos dan las mismas cifras; si se escribe de dos, la comparativa la parte en dos
   filas y aquí es una.

   ⚠ EL FILTRO ELIGE PISCINAS; cada piscina se enseña ENTERA (todos sus lotes y todo su desempeño):
     · piscina, camaronera y código genético: los de la FILA de Broodstock;
     · lote: las piscinas de las que ENTRÓ ese lote (su Ingreso);
     · sala, tanque, estado y sexo no aplican —una piscina de engorde no está en ninguna sala ni tiene sexo— y se
       dice (`ignora`) en vez de callarlo.

   ⏳ Sin dato real: la hoja aún no existe en producción (medido el 2026-09-21). Fixtures ficticios, y en pantalla
   vacío hasta la primera carga; el censo de `medir-tablero-mad-real` lo dirá en crudo.
   ============================================================ */
import { fechaDeFila } from './operativo.data.js';
import { desempenoPorOrigen, supervivencia } from './operativo.indicadores.js';
import { loteDelLibro, estadoDeLoteEntero } from './operativo.lotes.js';
import { normPiscina, faseCanonica } from '../registros/lib/ficha-maduracion-broodstock.schema.js';
import { normLote, normCodigoGenetico } from '../registros/lib/ficha-maduracion-desoves.schema.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const porNombre = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
const num = (v) => {
  const t = txt(v);
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const ent = (v) => { const n = num(v); return n !== null && n > 0 ? n : 0; };
/** Para comparar camaroneras sin que una tilde o una mayúscula las separe: la de Broodstock viene del Excel y la
 *  del filtro, del Ingreso, y nadie garantiza que se escriban igual. */
const plano = (s) => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const corteDe = (r) => fechaDeFila('broodstock', r);

/** Lo que el filtro no puede aplicar a una piscina de Broodstock. */
export function ignoraDeBroodstock(F) {
  const x = [];
  if (F && F.sala) x.push('sala');
  if (F && F.tanque !== null && F.tanque !== undefined) x.push('tanque');
  if (F && F.estado) x.push('estado');
  if (F && F.sexo) x.push('sexo');
  return x;
}

/** La sobrevivencia se guarda en PORCENTAJE (95). Entre 0 y 1 es casi seguro una fracción que no se convirtió, y
 *  fuera de 0–100 no puede ser: se enseña como vino, marcada, con el mismo criterio que avisa al subir la carga. */
export function sobrevivenciaDudosa(s) {
  if (s === null || s === undefined || s === '') return '';
  if (s < 0 || s > 100) return 'fuera';
  if (s > 0 && s < 1) return 'fraccion';
  return '';
}

/** Las hojas hasta el día elegido: lo registrado después todavía no ha pasado (el mismo corte que la comparativa). */
function hastaLaFoto(M) {
  const foto = txt(M && M.fecha);
  const H = {};
  for (const [k, v] of Object.entries((M && M.fuentes) || {})) H[k] = (v || []).filter((r) => !foto || !(fechaDeFila(k, r) > foto));
  return H;
}

/** La piscina del Ingreso y de los Desoves en su forma canónica, que es la de Broodstock. */
const canonica = (filas) => (filas || []).map((r) => ({ ...r, 'Piscina Broodstock': normPiscina(r['Piscina Broodstock']) }));

/** Las piscinas de las que entró cada lote, según su Ingreso. */
function piscinasPorLote(ingresos) {
  const m = new Map();
  for (const r of ingresos || []) {
    const l = normLote(r.Lote);
    const p = normPiscina(r['Piscina Broodstock']);
    if (!l || !p) continue;
    if (!m.has(l)) m.set(l, new Set());
    m.get(l).add(p);
  }
  return m;
}

/** ¿Pasa esta fila de Broodstock por el filtro? */
function filaEnFiltro(r, F, deLote) {
  if (!F) return true;
  const p = normPiscina(r.Piscina);
  if (F.piscina && p !== normPiscina(F.piscina)) return false;
  if (F.camaronera && plano(r.Camaronera) !== plano(F.camaronera)) return false;
  if (F.codigo && normCodigoGenetico(r['Código genético']) !== F.codigo) return false;
  if (F.lote && !(deLote.get(F.lote) || new Set()).has(p)) return false;
  return true;
}

/** ¿Pasa esta fila de Ingreso por el filtro? Con sus propias columnas: es el origen que declara el lote. */
function ingresoEnFiltro(r, F) {
  if (!F) return true;
  if (F.piscina && normPiscina(r['Piscina Broodstock']) !== normPiscina(F.piscina)) return false;
  if (F.camaronera && plano(r['Camaronera origen']) !== plano(F.camaronera)) return false;
  if (F.codigo && normCodigoGenetico(r['Código genético']) !== F.codigo) return false;
  if (F.lote && normLote(r.Lote) !== F.lote) return false;
  return true;
}

/** Una fila de Broodstock con la forma que pinta la vista. */
function piscinaDeFila(r) {
  const faseCruda = txt(r['Fase actual']);
  const sobrevivencia = num(r['Sobrevivencia estimada (%)']);
  return {
    piscina: normPiscina(r.Piscina),
    corte: corteDe(r),
    fase: faseCanonica(faseCruda) || faseCruda, faseEnCatalogo: !faseCruda || !!faseCanonica(faseCruda),
    peso: num(r['Peso actual (g)']), fechaPeso: txt(r['Fecha del peso']),
    incremento: num(r['Incremento última semana (g)']),
    crecimiento: num(r['Crecimiento fase actual (g/sem)']),
    sobrevivencia, sobrevivenciaDudosa: sobrevivenciaDudosa(sobrevivencia),
    densidad: num(r['Densidad (cam/m²)']),
    edad: num(r['Edad total (días)']),
    dias: { precria: num(r['Días fase 1 (precría)']), engorde: num(r['Días fase 2 (engorde)']), prerreproductor: num(r['Días fase 3 (pre-reproductor)']) },
    area: num(r['Área (ha)']), sembrada: num(r['Cantidad sembrada']), fechaSiembra: txt(r['Fecha siembra']),
    pesoSiembra: num(r['Peso de siembra (g)']), plg: num(r['Pl/g']),
    codigo: normCodigoGenetico(r['Código genético']), camaronera: txt(r.Camaronera), piscinaOrigen: txt(r['Piscina origen']),
    observacion: txt(r['Observación']),
  };
}

/**
 * La TABLA de piscinas al cierre del día elegido (`M.fecha`): cada piscina del ÚLTIMO corte con su fila de ese
 * corte, los lotes que entraron de ella y su desempeño como origen (ingresados, vivos, supervivencia, desoves,
 * fertilidad y nauplios por hembra, de `desempenoPorOrigen`). Y aparte:
 *  · `ausentes`: las del corte anterior que no vinieron en éste;
 *  · `sinBroodstock`: las piscinas del Ingreso que ninguna carga nombra —un lote que entró de ahí tiene un origen
 *    que no se puede enseñar—.
 */
export function tablaDePiscinas(M, F) {
  const H = hastaLaFoto(M);
  const ingresos = canonica(H.ingresos);
  const deLote = piscinasPorLote(ingresos);
  const todas = (H.broodstock || []).filter((r) => esIso(corteDe(r)) && normPiscina(r.Piscina));
  const cortes = [...new Set(todas.map(corteDe))].sort();
  const corte = cortes.length ? cortes[cortes.length - 1] : '';
  const previo = cortes.length > 1 ? cortes[cortes.length - 2] : '';
  const enCorte = new Set(todas.filter((r) => corteDe(r) === corte).map((r) => normPiscina(r.Piscina)));
  const pasa = (r) => filaEnFiltro(r, F, deLote);

  const desempeno = new Map(desempenoPorOrigen({ ...H, ingresos, desoves: canonica(H.desoves) }, ((M && M.libro) || {}).posiciones || [], 'piscina')
    .map((o) => [o.origen, o]));
  const piscinas = todas.filter((r) => corteDe(r) === corte && pasa(r)).map((r) => {
    const P = piscinaDeFila(r);
    const d = desempeno.get(P.piscina);
    return {
      ...P,
      lotes: d ? d.lotes : [],
      desempeno: d ? { ingresados: d.ingresados, vivos: d.vivos, supervivencia: d.supervivencia, desoves: d.desoves,
        fertilidad: d.fertilidad, naupliosPorHembra: d.naupliosPorHembra } : null,
    };
  }).sort((a, b) => porNombre(a.piscina, b.piscina));

  const ausentes = [...new Set(todas.filter((r) => previo && corteDe(r) === previo && pasa(r)).map((r) => normPiscina(r.Piscina)))]
    .filter((p) => !enCorte.has(p)).sort(porNombre);
  const nombradas = new Set(todas.map((r) => normPiscina(r.Piscina)));
  const sinBroodstock = [...new Set(ingresos.filter((r) => ingresoEnFiltro(r, F)).map((r) => r['Piscina Broodstock']))]
    .filter((p) => p && !nombradas.has(p)).sort(porNombre);

  return { corte, previo, cortes: cortes.length, piscinas, ausentes, sinBroodstock, ignora: ignoraDeBroodstock(F) };
}

/**
 * La FICHA de una piscina: su última fila hasta el día elegido, su serie semanal EN EL PERÍODO (los cortes de
 * `periodo.desde` a `periodo.hasta`, del más antiguo al más reciente), las observaciones de esos cortes y los lotes
 * que entraron de ella.
 * 🔑 Cada lote dice cuántos animales entraron DE ESTA piscina y de qué otras entró también: sus vivos y su
 * supervivencia son del lote entero —los de 🧬 Lotes—, y repartirlos entre piscinas sería inventar un dato que
 * nadie registró.
 * `null` si la piscina no tiene ninguna fila hasta el día elegido.
 */
export function fichaDePiscina(M, piscina, periodo) {
  const id = normPiscina(piscina);
  const H = hastaLaFoto(M);
  const suyas = (H.broodstock || []).filter((r) => normPiscina(r.Piscina) === id && esIso(corteDe(r)))
    .sort((a, b) => porNombre(corteDe(a), corteDe(b)));
  if (!id || !suyas.length) return null;
  const desde = txt((periodo || {}).desde);
  const hasta = txt((periodo || {}).hasta);
  const delPeriodo = suyas.filter((r) => (!desde || corteDe(r) >= desde) && (!hasta || corteDe(r) <= hasta)).map(piscinaDeFila);

  const ingresos = canonica(H.ingresos);
  const deLote = piscinasPorLote(ingresos);
  const entraron = new Map();
  for (const r of ingresos) {
    const l = normLote(r.Lote);
    if (!l || r['Piscina Broodstock'] !== id) continue;
    const e = entraron.get(l) || { machos: 0, hembras: 0 };
    e.machos += ent(r.Machos);
    e.hembras += ent(r.Hembras);
    entraron.set(l, e);
  }
  const lotes = [...entraron.entries()].map(([lote, e]) => {
    const L = loteDelLibro((M && M.libro) || null, lote);
    return {
      lote, entraron: { ...e, total: e.machos + e.hembras },
      otrasPiscinas: [...(deLote.get(lote) || [])].filter((p) => p !== id).sort(porNombre),
      vivos: L ? ent(L.machos) + ent(L.hembras) : null,
      supervivencia: L ? supervivencia(L).total : '',
      estado: L ? estadoDeLoteEntero(L, txt(M.fecha)) : '',
    };
  }).sort((a, b) => porNombre(a.lote, b.lote));

  return {
    piscina: id, ultimo: piscinaDeFila(suyas[suyas.length - 1]),
    serie: delPeriodo.map((P) => ({ corte: P.corte, fase: P.fase, peso: P.peso, incremento: P.incremento, crecimiento: P.crecimiento,
      sobrevivencia: P.sobrevivencia })),
    observaciones: delPeriodo.filter((P) => P.observacion).map((P) => ({ corte: P.corte, texto: P.observacion })).reverse(),
    lotes,
  };
}
