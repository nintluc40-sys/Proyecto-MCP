/* ============================================================
   MADURACIÓN · RESUMEN RÁPIDO (pestaña ⚖️ Saldo, 2026-09-15, usuario)

   «Lo actual que se tiene en maduración y cómo van todas sus variables», deducido de las hojas:
   el libro mayor (vivos, muertos, estados) + Sala (ambiente) + Tanques (pesos, mudas, cópulas) +
   Desoves + Tratamientos. Módulo PURO; el monolito lleva su copia inline y la paridad la ata.

   Definiciones (decididas por el usuario, 2026-09-15):
     · Tasa de mortalidad = muertos acumulados ÷ animales ingresados al lote × 100, por sexo y total.
     · % Mudas y % Cópulas = los del ÚLTIMO registro diario de los tanques del lote ÷ vivos de ese día
       (mudas sobre vivos totales; cópulas sobre hembras vivas), con el libro al cierre de ese día.
     · Nauplios/Hembra = N5 ÷ desoves · Tasa de fertilidad = N2 ÷ Total de huevos × 100. Las dos sólo
       sobre los desoves que YA tienen su N5 / su N2: un desove pendiente no diluye la cifra.
   Confirmadas por el usuario el 2026-09-15: Δ = promedio del último registro de la sala menos el del registro
   anterior; CV = desviación estándar MUESTRAL de las lecturas del último registro ÷ su promedio × 100;
   el peso es el promedio de los tanques del lote en la última fecha con peso. «Último registro» es el último
   que TRAE esa variable (H2): un registro de sólo estado no borra la T° del día anterior.
   ============================================================ */

import { construirLibro, sumarDias, ubicKey, CUARENTENA_DIAS, ESTADO_PRODUCCION, ESTADO_CUARENTENA, ESTADO_CERRADO } from './mad-libro.js';

export const RESUMEN_TEMPS = ['Temperatura 2:00', 'Temperatura 4:00', 'Temperatura 6:00', 'Temperatura 8:00', 'Temperatura 10:00', 'Temperatura 12:00',
  'Temperatura 14:00', 'Temperatura 16:00', 'Temperatura 18:00', 'Temperatura 20:00', 'Temperatura 22:00', 'Temperatura 0:00'];
export const RESUMEN_OXIGENOS = ['Oxígeno 06:00', 'Oxígeno 12:00', 'Oxígeno 18:00', 'Oxígeno 00:00'];
export const RESUMEN_MAX_TRAT = 5;

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v) => {
  const t = txt(v);
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const ent = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const r2 = (n) => Math.round(n * 100) / 100;
const fecha10 = (v) => txt(v).slice(0, 10);
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const loteKey = (s) => txt(s).toUpperCase().replace(/\s+/g, '');
const porNombre = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Días entre dos fechas `YYYY-MM-DD` (b − a), en UTC. */
export function diasEntre(a, b) {
  const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(a));
  const y = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(b));
  if (!x || !y) return '';
  return Math.round((Date.UTC(+y[1], +y[2] - 1, +y[3]) - Date.UTC(+x[1], +x[2] - 1, +x[3])) / 86400000);
}

/** Lecturas de un registro, en el orden del día: promedio, última, CV (muestral) y cuántas hay. */
export function estadisticaDia(valores) {
  const v = (valores || []).map((x) => num(x)).filter((n) => n !== null);
  if (!v.length) return { n: 0, prom: '', ultima: '', cv: '' };
  const prom = v.reduce((a, b) => a + b, 0) / v.length;
  let cv = '';
  if (v.length >= 2 && prom !== 0) {
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - prom) * (b - prom), 0) / (v.length - 1));
    cv = r2((sd / Math.abs(prom)) * 100);
  }
  return { n: v.length, prom: r2(prom), ultima: r2(v[v.length - 1]), cv };
}

const recientes = (filas) => filas.slice().sort((a, b) => porNombre(fecha10(b.Fecha), fecha10(a.Fecha))).slice(0, RESUMEN_MAX_TRAT);
const lotesDeCelda = (v) => txt(v).split(',').map(loteKey).filter(Boolean);

function resumenSalas(filasSala, libro, filasTrat) {
  const porSala = new Map();
  (filasSala || []).forEach((r) => {
    const s = txt(r.Sala);
    if (!s || !esFecha(fecha10(r.Fecha))) return;
    if (!porSala.has(s)) porSala.set(s, []);
    porSala.get(s).push(r);
  });
  const nombres = new Set(porSala.keys());
  for (const T of libro.tanques.values()) if (T.machos + T.hembras > 0) nombres.add(T.sala);
  return [...nombres].sort(porNombre).map((sala) => {
    const filas = (porSala.get(sala) || []).slice().sort((a, b) => porNombre(fecha10(a.Fecha), fecha10(b.Fecha)));
    /* H2 (2026-09-15) · CADA VARIABLE SALE DEL ÚLTIMO REGISTRO QUE LA TRAE, no del último registro a secas: un
       registro con sólo el estado (el de «Proponer estado», medido en producción) dejaba la T° y el O2 en blanco, y
       uno con sólo lecturas dejaba el estado en blanco. El Δ compara con el registro anterior que también la trae. */
    const ultimaCon = (tiene) => filas.filter(tiene).pop() || null;
    const variable = (cols) => {
      const con = filas.filter((r) => cols.some((c) => num(r[c]) !== null));
      const u = con.length ? con[con.length - 1] : null;
      const f = u ? fecha10(u.Fecha) : '';
      const p = con.filter((r) => fecha10(r.Fecha) < f).pop() || null;
      const a = estadisticaDia(u ? cols.map((c) => u[c]) : []);
      const b = estadisticaDia(p ? cols.map((c) => p[c]) : []);
      return { prom: a.prom, ultima: a.ultima, cv: a.cv, delta: a.prom === '' || b.prom === '' ? '' : r2(a.prom - b.prom), fecha: f };
    };
    const conEstado = ultimaCon((r) => txt(r.Estado) !== '');
    const conRas = ultimaCon((r) => txt(r.RAS) !== '');
    const lotes = [];
    let animalesProduccion = 0;
    let animalesCuarentena = 0;
    for (const L of libro.lotes.values()) {
      const S = (L.salas || []).find((x) => x.sala === sala);
      if (!S || S.machos + S.hembras === 0) continue;
      lotes.push({ lote: L.lote, estado: S.estado, machos: S.machos, hembras: S.hembras });
      if (S.estado === ESTADO_PRODUCCION) animalesProduccion += S.machos + S.hembras;
      if (S.estado === ESTADO_CUARENTENA) animalesCuarentena += S.machos + S.hembras;
    }
    lotes.sort((a, b) => porNombre(a.lote, b.lote));
    const enProduccion = new Set(lotes.filter((l) => l.estado === ESTADO_PRODUCCION).map((l) => l.lote));
    let tanquesProduccion = 0;
    for (const T of libro.tanques.values()) {
      if (T.sala === sala && T.composicion.some((c) => (c.machos > 0 || c.hembras > 0) && enProduccion.has(c.lote))) tanquesProduccion++;
    }
    const tratamientos = recientes((filasTrat || []).filter((r) => txt(r.Sala) === sala))
      .map((r) => ({ fecha: fecha10(r.Fecha), tipo: txt(r.Tipo), area: txt(r['Área']), lotes: txt(r.Lotes), productos: txt(r.Productos), ras: txt(r['Productos RAS']) }));
    return {
      sala, fecha: conEstado ? fecha10(conEstado.Fecha) : '', estado: conEstado ? txt(conEstado.Estado) : '',
      ras: conRas ? txt(conRas.RAS) : '', fechaRas: conRas ? fecha10(conRas.Fecha) : '', lotes,
      temp: variable(RESUMEN_TEMPS),
      ox: variable(RESUMEN_OXIGENOS),
      tanquesProduccion, animalesProduccion, animalesCuarentena, tratamientos,
    };
  });
}

function acumularDesoves(filas) {
  const m = new Map();
  (filas || []).forEach((r) => {
    const k = loteKey(r.Lote);
    if (!k) return;
    if (!m.has(k)) m.set(k, { desoves: 0, huevos: 0, noViables: 0, n2: 0, n5: 0, huevosConN2: 0, desovesConN5: 0 });
    const a = m.get(k);
    const n2 = ent(r.N2);
    const n5 = ent(r.N5);
    a.desoves += ent(r.Desoves);
    a.huevos += ent(r['Total de huevos']);
    a.noViables += ent(r['Hembras no viables']);
    a.n2 += n2;
    a.n5 += n5;
    if (n2 > 0) a.huevosConN2 += ent(r['Total de huevos']);
    if (n5 > 0) a.desovesConN5 += ent(r.Desoves);
  });
  return m;
}

function resumenLotes(fuentes, libro, hoy) {
  const alDia = new Map();
  const libroAl = (fecha) => {
    if (!alDia.has(fecha)) alDia.set(fecha, construirLibro(fuentes, { hoy: fecha, hasta: fecha }));
    return alDia.get(fecha);
  };
  const filasTanque = (fuentes.tanques || []).filter((r) => txt(r.Sala) && ent(r.Tanque) && esFecha(fecha10(r.Fecha)));
  const desoves = acumularDesoves(fuentes.desoves);
  const trat = fuentes.tratamientos || [];
  const tasa = (m, i) => (i > 0 ? r2((m / i) * 100) : '');
  const out = [];
  for (const L of libro.lotes.values()) {
    if (L.machos + L.hembras === 0 && L.estado === ESTADO_CERRADO) continue;
    const tanques = [];
    for (const T of libro.tanques.values()) {
      if (!T.composicion.some((c) => c.lote === L.lote && (c.machos > 0 || c.hembras > 0))) continue;
      tanques.push({ sala: T.sala, tanque: T.tanque, machos: T.machos, hembras: T.hembras, relacion: T.machos > 0 ? r2(T.hembras / T.machos) : '' });
    }
    tanques.sort((a, b) => porNombre(a.sala, b.sala) || a.tanque - b.tanque);
    /* H1 (2026-09-15) · UNA FILA DE TANQUES ES DEL LOTE SI ESE DÍA EL TANQUE LO TENÍA, según el libro al cierre de
       ese día. La hoja no guarda el lote por fila y los tanques se reutilizan: con «las filas de los tanques donde está
       hoy» un lote recién entrado heredaba el peso y las mudas del lote anterior de su tanque, y el que se movió perdía
       lo pesado en su tanque de antes. Se busca de la fecha más reciente hacia atrás, sin bajar de su ingreso. */
    const candidatas = filasTanque.filter((r) => !L.ingreso || fecha10(r.Fecha) >= L.ingreso);
    const ultimoDia = (filas) => {
      const fechas = [...new Set(filas.map((r) => fecha10(r.Fecha)))].sort().reverse();
      for (const f of fechas) {
        const lib = libroAl(f);
        const del = filas.filter((r) => {
          if (fecha10(r.Fecha) !== f) return false;
          const T = lib.tanques.get(ubicKey(r.Sala, r.Tanque));
          return !!T && T.composicion.some((c) => c.lote === L.lote && (c.machos > 0 || c.hembras > 0));
        });
        if (del.length) return { fecha: f, filas: del };
      }
      return { fecha: '', filas: [] };
    };
    const peso = (col) => {
      const d = ultimoDia(candidatas.filter((r) => num(r[col]) !== null && num(r[col]) > 0));
      if (!d.fecha) return { valor: '', fecha: '' };
      const del = d.filas.map((r) => num(r[col]));
      return { valor: r2(del.reduce((a, b) => a + b, 0) / del.length), fecha: d.fecha };
    };
    const dia = ultimoDia(candidatas);
    const fDia = dia.fecha;
    let pctMudas = '';
    let pctCopulas = '';
    if (fDia) {
      const delDia = dia.filas;
      const lib = libroAl(fDia);
      const vistos = new Set();
      let vivosDia = 0;
      let hembrasDia = 0;
      delDia.forEach((r) => {
        const k = ubicKey(r.Sala, r.Tanque);
        const T = lib.tanques.get(k);
        if (vistos.has(k) || !T) return;
        vistos.add(k);
        vivosDia += T.machos + T.hembras;
        hembrasDia += T.hembras;
      });
      const mudas = delDia.reduce((a, r) => a + ent(r.Muda), 0);
      const copulas = delDia.reduce((a, r) => a + ent(r['Cópulas']), 0);
      pctMudas = vivosDia > 0 ? r2((mudas / vivosDia) * 100) : '';
      pctCopulas = hembrasDia > 0 ? r2((copulas / hembrasDia) * 100) : '';
    }
    const dias = (L.salas || []).filter((s) => s.machos + s.hembras > 0).map((s) => {
      const q15 = sumarDias(s.ingreso, CUARENTENA_DIAS);
      const fin = s.copulaDesde && s.copulaDesde < q15 ? s.copulaDesde : q15;
      return {
        sala: s.sala, estado: s.estado,
        diasCuarentena: s.estado === ESTADO_CUARENTENA ? diasEntre(s.ingreso, hoy) : diasEntre(s.ingreso, fin),
        diasProduccion: s.estado === ESTADO_PRODUCCION ? diasEntre(fin, hoy) : 0,
      };
    });
    const d = desoves.get(loteKey(L.lote)) || { desoves: 0, huevos: 0, noViables: 0, n2: 0, n5: 0, huevosConN2: 0, desovesConN5: 0 };
    const ing = L.ingresados;
    const mu = L.muertos;
    const mort = (o) => ({ entran: o.entran, muertas: o.muertas, pct: tasa(o.muertas, o.entran) });
    out.push({
      lote: L.lote, estado: L.estado, machos: L.machos, hembras: L.hembras,
      ingresados: { machos: ing.machos, hembras: ing.hembras },
      muertos: { machos: mu.machos, hembras: mu.hembras },
      descartes: { machos: L.descartes.machos, hembras: L.descartes.hembras },
      tasaMortalidad: { machos: tasa(mu.machos, ing.machos), hembras: tasa(mu.hembras, ing.hembras), total: tasa(mu.machos + mu.hembras, ing.machos + ing.hembras) },
      dias, tanques,
      pesoMachos: peso('Peso promedio machos (g)'), pesoHembras: peso('Peso promedio hembras (g)'),
      fechaDia: fDia, pctMudas, pctCopulas,
      desoves: {
        desoves: d.desoves, noViables: d.noViables, huevos: d.huevos, n2: d.n2, n5: d.n5,
        naupliosPorHembra: d.desovesConN5 > 0 ? Math.round(d.n5 / d.desovesConN5) : '',
        fertilidad: d.huevosConN2 > 0 ? r2((d.n2 / d.huevosConN2) * 100) : '',
      },
      mortDesove: mort(L.mortDesove), mortRecuperacion: mort(L.mortRecuperacion),
      tratamientos: recientes(trat.filter((r) => txt(r.Tipo) === 'Preventivo' && lotesDeCelda(r.Lotes).indexOf(loteKey(L.lote)) !== -1))
        .map((r) => ({ fecha: fecha10(r.Fecha), sala: txt(r.Sala), productos: txt(r.Productos), ras: txt(r['Productos RAS']) })),
    });
  }
  return out.sort((a, b) => porNombre(a.lote, b.lote));
}

/**
 * El resumen entero. `fuentes`: las del libro (ingresos, movimientos, tanques, cierres, mortDesove) más
 * `sala`, `desoves` y `tratamientos`, filas tal como las devuelve `?p=rows`. `opts.hoy`: fecha de cálculo.
 */
export function resumenMaduracion(fuentes, opts) {
  const f = fuentes || {};
  const hoy = txt((opts || {}).hoy);
  const libro = construirLibro(f, { hoy });
  const ras = recientes((f.tratamientos || []).filter((r) => txt(r['Productos RAS']) !== '' || txt(r['Área']) === 'RAS y tuberías'))
    .map((r) => ({ fecha: fecha10(r.Fecha), sala: txt(r.Sala), tipo: txt(r.Tipo), productos: txt(r['Área']) === 'RAS y tuberías' ? txt(r.Productos) : txt(r['Productos RAS']) }));
  return { hoy, hasta: libro.hasta, avisos: libro.avisos.length, salas: resumenSalas(f.sala, libro, f.tratamientos), lotes: resumenLotes(f, libro, hoy), ras };
}
