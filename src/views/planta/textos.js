/* ============================================================
   PLANTA · LOS TEXTOS DEL TABLERO (puros: ni DOM ni 3D) — T1 de la vista 📊 Análisis (2026-10-05, usuario)
   Lo que dicen las fichas, las cifras, la tarjeta de producción, «Qué atender hoy», los reproductores y las filas de
   las listas, a partir del estado que calculan estado.js y cifras.js. Vivía dentro de la escena 3D (escena.js) y se
   trajo aquí TAL CUAL para que la maqueta y 📊 Análisis digan exactamente lo mismo (decisión del usuario: «módulo
   compartido»): la escena y el análisis sólo deciden dónde y cómo se pinta. Desde la T2 (2026-10-06), también la tabla
   «Detalle por tanque» de 📊 Análisis (tablaDeTanques).
   Un «grupo» es un módulo o una sala: { id, kind: 'larv'|'mat', name, short, st, tanks: [{ num, st, g }], desove: [] };
   un tanque, { num, st, g, desove? }. `ctx` = { cargado: hay datos pintados, mesPasado: { mes, cierre } | null }.
   ============================================================ */
import { fmtPop } from '../../core/format.js';
import { fmtShort } from '../../core/dates.js';
import { STAGE_ORDER } from '../../config.js';

/* ---------- Formatos ---------- */
export const fmt = (v, d = 2) => v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (v) => (v === null || v === undefined || isNaN(v)) ? '—' : fmt(v, 1) + ' %';
export const num = (v, d, u) => (v === null || v === undefined || isNaN(v)) ? '—' : fmt(v, d) + u;
export const ent = (v) => (v === '' || v === null || v === undefined || isNaN(v)) ? '—' : Math.round(Number(v)).toLocaleString('es-EC');
export const dec = (v, d) => (v === '' || v === null || v === undefined || isNaN(v)) ? '—' : fmt(Number(v), d);
export const dm = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');
// es-EC como fmtPop: agrupa los miles también en cuatro cifras («1.006,0 M»; 'es' daba «1006,0 M»)
export const millones = (v, d = 1) => (v / 1e6).toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' M';
const SEM = { ok: 'en rango', bajo: 'bajo el rango', alto: 'sobre el rango' };
export const ESTADO_TXT = { vacio: 'Vacío', despachado: 'Despachado', agrupado: 'Agrupado', descartado: 'Descartado', desinfeccion: 'Desinfección (pre-siembra)' };

/* ---------- Colores ---------- */
// Maduración: los colores del modo «Estado» del mapa de salas (operativo.css: Producción --c-bueno, Cuarentena
// --c-malo, Mixto #7e57c2, Sin estado --c-sin-dato; Vacío sin color).
export const MAD_HEX = { 'Producción': '#5cb860', 'Cuarentena': '#f2b705', 'Mixto': '#8a63c9', 'Vacío': '#d9e8ea', 'Sin estado': '#b0bec5' };
const ESTADO_SALA_HEX = (e) => /desinfec/i.test(e || '') ? '#9e9e9e' : /cuarentena/i.test(e || '') ? MAD_HEX['Cuarentena'] : /producci/i.test(e || '') ? MAD_HEX['Producción'] : 'var(--mat)';
/** El color de un módulo (su etapa) o de una sala (su estado anotado): el del rótulo, la fila y «Qué atender». */
export function colorGrupo(g) {
  const st = g.st;
  if (g.kind !== 'larv') return st ? ESTADO_SALA_HEX(st.registrado.estado) : 'var(--mat)';
  if (!st) return 'var(--larv)';
  if (st.estado === 'cultivo') return st.etapa ? st.etapa.color : 'var(--larv)';
  return st.estado === 'desinfeccion' ? '#9e9e9e' : '#b9c7cf';
}

/** El color de un tanque, el mismo que pinta su agua la maqueta (escena.js · colorTanque): en cultivo, su etapa; si no,
 *  su estado; en maduración, el estado del tanque (modo «Estado» del mapa de salas); sin datos, el agua de su lugar. */
export const ESTADO_HEX = { vacio: '#d9e8ea', despachado: '#a9bcc8', agrupado: '#5b6266', descartado: '#5b6266', desinfeccion: '#9e9e9e' };
export function colorTanque(t) {
  const st = t.st;
  if (t.g.kind === 'mat' && st) return MAD_HEX[st.estado] || MAD_HEX['Sin estado'];
  if (st && st.estado === 'cultivo') return st.etapa ? st.etapa.color : '#3f8f74';
  if (st) return ESTADO_HEX[st.estado] || ESTADO_HEX.vacio;
  return t.desove ? '#3a6fa8' : t.g.kind === 'larv' ? '#3f8f74' : '#2d6f8a';
}

/* ---------- Fichas: { kind, name, rows: [[etiqueta, valor]] } ---------- */
/** La siembra de la corrida: fecha promedio (la de la tabla Producción Omarsa), tanques sembrados y nauplios. */
function txtSiembra(sb) {
  if (!sb || !sb.fecha) return '—';
  return fmtShort(sb.fecha) + ' · ' + sb.tanques + (sb.tanques === 1 ? ' tanque' : ' tanques') + (sb.nauplios ? ' · ' + fmt(sb.nauplios / 1e6, 1) + ' M nauplios' : '');
}
/** La ficha de un módulo (las cifras de su tarjeta en la Vista Ejecutiva) o, si es una sala, la de la sala. */
export function fichaGrupo(g, ctx) {
  if (g.kind !== 'larv') return fichaSala(g, ctx);
  const st = g.st, kind = 'Módulo de larvicultura', f = (rows) => ({ kind, name: g.name, rows });
  if (!ctx.cargado) return f([['Estado', 'Cargando datos de producción…']]);
  if (!st || st.estado === 'sin-datos') return f([['Estado', 'Sin datos de producción']]);
  if (st.estado === 'desinfeccion') {
    return f([['Estado', 'Desinfección · pre-siembra'], ['Corrida', 'C' + st.corrida + ' en preparación'], ['Registros', String(st.registros)], ['Último registro', st.ultimo ? fmtShort(st.ultimo) : '—']]);
  }
  if (st.estado === 'despachado') {
    const r = st.resultado || {};
    return f([['Estado', ctx.mesPasado ? 'Corrida despachada' : 'Vacío · corrida despachada'], ['Corrida', 'C' + st.corrida + ' despachada por completo'], ['Siembra', txtSiembra(st.siembra)],
      ['Población final', fmtPop(r.poblacion)], ['Supervivencia', pct(r.superv)], ['PL/g (manual)', num(r.plg, 1, '')], ['Último dato', st.ultimo ? fmtShort(st.ultimo) : '—']]);
  }
  const c = st.cuenta, partes = [c.cultivo + ' en cultivo', c.vacio && c.vacio + ' vacíos', c.despachado && c.despachado + ' despachados', c.fuera && c.fuera + ' agrupados o descartados'].filter(Boolean);
  return f([
    ['Corrida', 'C' + st.corrida + (st.despachando ? ' · despachando' : '')],
    ['Siembra', txtSiembra(st.siembra)],
    ['Estadío', st.estadio + ' · día ' + st.dias + (st.etapa ? ' · ' + st.etapa.label : '')],
    ['Supervivencia', pct(st.sv)], ['Mortalidad', pct(st.mort)], ['Población', fmtPop(st.pop)],
    ['PL/g (manual)', num(st.plg, 1, '')], ['OD', num(st.od, 2, ' mg/L')], ['Temperatura', num(st.tmp, 1, ' °C')],
    ['Tanques', partes.join(' · ')],
    ['Alertas', c.alerta ? c.alerta + ' tanque' + (c.alerta !== 1 ? 's' : '') + (st.motivos.length ? ' · módulo: ' + st.motivos.join(', ') : '') : (st.motivos.length ? 'Módulo: ' + st.motivos.join(', ') : 'Ninguna')],
    ['Técnicos', st.tecnicos && st.tecnicos.length ? st.tecnicos.join(', ') : '—'],
    ['Lote', st.lotes && st.lotes.length ? st.lotes.join(' · ') : '—'],
    ['Actualizado', st.fresco ? st.fresco.label : '—'],
  ]);
}
/** Ficha de la sala: su estado registrado y el que calcula el libro, ocupación, reproductores y su semana. */
function fichaSala(g, ctx) {
  const st = g.st, kind = 'Sala de maduración', f = (rows) => ({ kind, name: g.name, rows });
  if (!ctx.cargado) return f([['Estado', 'Cargando datos de producción…']]);
  if (!st) return f([['Estado', 'Sin datos de maduración']]);
  const lec = (l, u) => l ? l.fuera + ' de ' + l.lecturas + ' lecturas fuera' + (u && u.referencia ? ' (' + u.referencia + ')' : '') : 'En rango';
  const rows = [
    ['Estado', (st.registrado.estado || '—') + (st.registrado.fecha ? ' · anotado el ' + dm(st.registrado.fecha) : '')],
    ['Calculado', (st.propuesto.estado || '—') + (st.coinciden === false ? ' · difiere de lo anotado' : '')],
    ['Ocupación', st.ocupados + ' de ' + st.total + ' tanques' + (st.fueraDeCatalogo ? ' · ' + st.fueraDeCatalogo + ' fuera del catálogo' : '')],
    ['Reproductores', ent(st.hembras) + ' ♀ · ' + ent(st.machos) + ' ♂'],
    ['Lotes', st.lotes.length ? st.lotes.join(' · ') : '—'],
    ['Últimos 7 días', ent(st.periodo.bajas) + ' bajas · ' + ent(st.periodo.descartes) + ' descartes · ' + ent(st.periodo.copulas) + ' cópulas'],
    ['Temperatura', lec(st.lecturas.temperatura, st.lecturas.umbralT)],
    ['Oxígeno', lec(st.lecturas.oxigeno, st.lecturas.umbralO)],
    ['Tanques en alerta', st.alertaTanques ? st.alertaTanques + ' (H:M o densidad fuera de rango)' : 'Ninguno'],
  ];
  if (st.reemplazo) rows.push(['Reemplazo', st.reemplazo.map((r) => '⏳ ' + r.lote + ' · ' + r.dias + ' d en producción').join(' | ') + ' (más de 60)']);
  if (g.desove.length) rows.push(['Desove', g.desove.length + ' tanques · sin registro por tanque en el MCP']);
  return f(rows);
}
/** Ficha de un tanque: de larvicultura o, en una sala, el lienzo del mapa de salas. */
export function fichaTanque(t, ctx) {
  return t.g.kind === 'larv' ? fichaTanqueLarv(t, ctx) : fichaTanqueMad(t, ctx);
}
function fichaTanqueMad(t, ctx) {
  const name = t.g.name + ' · ' + (t.desove ? 'desove ' : 'tanque ') + t.num, kind = 'Tanque de maduración', f = (rows) => ({ kind, name, rows });
  if (t.desove) return f([['Estado', 'Tanque de desove'], ['Datos', 'El MCP no lleva registro por tanque de desove']]);
  const st = t.st;
  if (!st) return f([['Estado', ctx.cargado ? 'Sin datos' : 'Cargando datos de producción…']]);
  if (!st.vivos) return f([['Estado', 'Vacío'], ['Último parte', dm(st.ultimoParte)]]);
  const p = st.periodo;
  return f([
    ['Estado', st.estado],
    ['Lotes', st.lotes.map((l) => l.lote + (l.estado ? ' · ' + l.estado : '') + (l.dias !== '' ? ' ' + l.dias + ' d' : '') + (l.codigos.length ? ' · ' + l.codigos.join('/') : '')).join(' | ')],
    ['Reproductores', ent(st.hembras) + ' ♀ · ' + ent(st.machos) + ' ♂ · ' + ent(st.vivos) + ' en total'],
    ['H:M', dec(st.hm, 2) + (SEM[st.hmEstado] ? ' · ' + SEM[st.hmEstado] : '')],
    ['Densidad', dec(st.densidad, 1) + ' animales/m²' + (SEM[st.densidadEstado] ? ' · ' + SEM[st.densidadEstado] : '')],
    ['Últimos 7 días', ent(p.bajas) + ' bajas · ' + ent(p.descartes) + ' descartes · ' + ent(p.copulas) + ' cópulas' + (p.pctCopulas !== '' && p.pctCopulas !== undefined ? ' (' + dec(p.pctCopulas, 1) + ' %)' : '')],
    ['Partes', ent(p.diasConParte) + ' de 7 días · último ' + dm(st.ultimoParte)],
    ['Alerta', st.alerta ? '⚠ ' + st.motivos.join(' y ') + ' fuera de rango' : 'Ninguna'],
  ]);
}
function fichaTanqueLarv(t, ctx) {
  const st = t.st, name = t.g.name + ' · tanque ' + t.num, kind = 'Tanque de larvicultura', f = (rows) => ({ kind, name, rows });
  if (!st) return f([['Estado', ctx.cargado ? 'Sin datos' : 'Cargando datos de producción…']]);
  if (st.estado !== 'cultivo') {
    const rows = [['Estado', ESTADO_TXT[st.estado] || st.estado]];
    if (st.nombre) rows.push(['En el registro', st.nombre], ['Estadío', st.estadio || '—'], ['Población', fmtPop(st.pop)]);
    return f(rows);
  }
  return f([
    ['Estado', 'En cultivo' + (st.etapa ? ' · ' + st.etapa.label : '')], ['En el registro', st.nombre],
    ['Estadío', st.estadio], ['Supervivencia', pct(st.sv)], ['Población', fmtPop(st.pop)],
    ['OD', num(st.od, 2, ' mg/L')], ['Temperatura', num(st.tmp, 1, ' °C')],
    ['Alerta', st.alerta ? '⚠ ' + st.motivos.join(', ') + ' fuera de rango' : 'Ninguna'],
    ['Lote', st.lotes && st.lotes.length ? st.lotes.join(' · ') : '—'],
  ]);
}

/* ---------- Fila de las listas de módulos y salas: { sub, ct } ---------- */
export function textoFila(g, ctx) {
  const st = g.st;
  if (g.kind !== 'larv') {
    if (!ctx.cargado) return { sub: 'Cargando…', ct: '' };
    if (!st) return { sub: 'Sin datos', ct: '' };
    const n = st.alertaTanques + (st.alerta ? 1 : 0);
    return { sub: (st.registrado.estado || 'Sin estado') + ' · ' + ent(st.hembras) + ' ♀ · ' + ent(st.machos) + ' ♂', ct: n ? '⚠ ' + n : st.ocupados + '/' + st.total };
  }
  if (!ctx.cargado) return { sub: 'Cargando…', ct: '' };
  if (!st || st.estado === 'sin-datos') return { sub: 'Sin datos', ct: '' };
  if (st.estado === 'desinfeccion') return { sub: 'Desinfección · C' + st.corrida, ct: '' };
  if (st.estado === 'despachado') return { sub: (ctx.mesPasado ? '' : 'Vacío · ') + 'C' + st.corrida + ' despachada' + (ctx.mesPasado && st.resultado && st.resultado.superv !== null ? ' · ' + pct(st.resultado.superv) : ''), ct: '' };
  return { sub: 'C' + st.corrida + ' · ' + st.estadio + ' · día ' + st.dias + (st.despachando ? ' · despachando' : ''), ct: st.cuenta.alerta ? '⚠ ' + st.cuenta.alerta : st.cuenta.cultivo + '/' + g.tanks.length };
}

/* ---------- Cifras: cuatro fichas { valor, titulo, detalle } ---------- */
export function cifrasDelPanel(E) {
  const r = E && E.resumen, rm = E && E.mad && E.mad.resumen;
  return [
    { valor: r ? r.cultivo : '—', titulo: 'tanques en cultivo',
      detalle: r ? 'de ' + r.total + ' · ' + Math.round(r.cultivo / r.total * 100) + ' % de ocupación · ' + r.vacio + ' vacíos · ' + r.despachado + ' despachados' + (r.desinfeccion ? ' · ' + r.desinfeccion + ' en desinfección' : '') : 'Cargando datos…' },
    { valor: r ? r.alerta : '—', titulo: 'tanques en alerta', detalle: 'larvicultura · OD, temperatura o supervivencia fuera de rango' },
    { valor: rm ? ent(rm.hembras + rm.machos) : '—', titulo: 'reproductores',
      detalle: rm ? ent(rm.hembras) + ' ♀ · ' + ent(rm.machos) + ' ♂ · ' + rm.ocupados + ' de ' + rm.tanques + ' tanques (' + Math.round(rm.ocupados / rm.tanques * 100) + ' % de ocupación)' : (E ? 'Sin datos de maduración' : 'Cargando datos…') },
    { valor: rm ? rm.alertaTanques + rm.alertaSalas : '—', titulo: 'alertas de maduración',
      detalle: rm ? rm.alertaTanques + ' tanques (H:M o densidad) · ' + rm.alertaSalas + ' salas (temperatura u oxígeno, 7 días)' : 'H:M, densidad, temperatura u oxígeno' },
  ];
}

/* ---------- Producción del mes frente a la meta ---------- */
/** Los textos y las medidas de la tarjeta. Sin cifras (C null), los guiones y la nota de carga. */
export function textosProduccion(C, meta, ctx) {
  const metaTxt = 'de ' + millones(meta, meta % 1e6 ? 1 : 0);
  if (!C) {
    return { vacia: true, metaTxt, total: '—', sv: '—', n5: '—', des: '—', desp: '—', cult: '—', pct: '', ok: false,
      nota: ctx.cargado ? 'Sin corridas con mes de producción' : 'Cargando datos…', anchoDesp: '0%', anchoCult: '0%', meta: '100%' };
  }
  const p = C.total / meta * 100, escala = Math.max(C.total, meta);
  return {
    vacia: false, metaTxt, total: millones(C.total), pct: fmt(p, 0) + ' % de la meta', ok: p >= 100,
    anchoDesp: (C.despachado / escala * 100) + '%', anchoCult: (C.enCultivo / escala * 100) + '%', meta: (meta / escala * 100) + '%',
    aria: millones(C.total) + ' de ' + millones(meta) + ': ' + millones(C.despachado) + ' despachados y ' + millones(C.enCultivo) + ' en cultivo',
    desp: 'despachado ' + millones(C.despachado) + ' · ' + C.modulosDespachados + ' de ' + C.modulos + ' módulos',
    cult: 'en cultivo ' + millones(C.enCultivo),
    sv: C.supervivencia === null ? '—' : fmt(C.supervivencia, 1) + ' %',
    n5: millones(C.nauplios.n5),
    n5sub: 'nauplios N5' + (C.nauplios.desde ? ' · ' + dm(C.nauplios.desde) + ' al ' + dm(C.nauplios.hasta) : ''),
    des: ent(C.nauplios.desoves),
    nota: C.enCultivo > 0 ? 'Lo que sigue en cultivo aún puede bajar con la supervivencia.' : '',
  };
}
/** El rótulo del mes: «Octubre» y «corridas 597–601». */
export function textoMes(C) {
  if (!C) return { mes: '—', corridas: '' };
  const cs = C.corridas;
  return { mes: C.mes, corridas: cs.length ? 'corridas ' + cs[0] + (cs.length > 1 ? '–' + cs[cs.length - 1] : '') : '' };
}

/* ---------- Qué atender hoy: las mismas alertas que las balizas y las cifras ---------- */
const MOTIVO_TXT = { 'Superv.': 'supervivencia', OD: 'OD', Temp: 'temperatura', 'H:M': 'H:M', Densidad: 'densidad', Temperatura: 'temperatura', 'Oxígeno': 'oxígeno' };
export const motivosTxt = (ms) => ms.map((m) => MOTIVO_TXT[m] || m).join(' y ');
const salasTxt = (ss) => (ss.length > 1 ? 'Salas ' : 'Sala ') + ss.map((x) => x.sala.replace('Sala ', '')).join(', ').replace(/, ([^,]+)$/, ' y $1');
/**
 * { titulo, total, items, vacio }: un ítem por módulo o sala con alertas —{ tipo: 'grupo', g, color, nombre, detalle,
 * tanques: [{ t, texto, aria }] }— y uno por lote que pasa de los 60 días —{ tipo: 'lote', g (su primera sala), nombre,
 * detalle }—; `vacio` es el texto cuando no hay nada (o mientras carga).
 */
export function alertasParaAtender(grupos, reemplazo, ctx) {
  const titulo = ctx.mesPasado ? 'Alertas al cierre de ' + ctx.mesPasado.mes : 'Qué atender hoy';
  if (!ctx.cargado) return { titulo, total: null, items: [], vacio: 'Cargando datos…' };
  const items = [];
  let total = 0;
  grupos.forEach((g) => {
    const enAlerta = g.tanks.filter((t) => t.st && t.st.alerta);
    const sala = g.kind === 'mat' && g.st && g.st.alerta ? g.st.motivos : [];
    if (!enAlerta.length && !sala.length) return;
    total += enAlerta.length + (sala.length ? 1 : 0);
    // si todos sus tanques tienen el mismo motivo, va en el renglón; si no, junto a cada número
    const firmas = new Set(enAlerta.map((t) => t.st.motivos.join('|')));
    const comun = firmas.size === 1 ? enAlerta[0].st.motivos : null;
    const partes = [];
    if (sala.length) partes.push(motivosTxt(sala) + ' de la sala');
    if (enAlerta.length) partes.push(enAlerta.length + (enAlerta.length === 1 ? ' tanque' : ' tanques') + (comun ? ' · ' + motivosTxt(comun) : ''));
    items.push({ tipo: 'grupo', g, color: colorGrupo(g), nombre: g.name, detalle: partes.join(' · '),
      tanques: enAlerta.sort((a, b) => a.num - b.num).map((t) => ({ t, texto: String(t.num) + (comun ? '' : ' · ' + motivosTxt(t.st.motivos)),
        aria: g.name + ', tanque ' + t.num + ': ' + motivosTxt(t.st.motivos) + ' fuera de rango' })) });
  });
  // lotes que pasan de 60 días en producción (⏳ Permanencia): tocar el renglón abre su primera sala
  ((reemplazo && reemplazo.vencidos) || []).forEach((v) => {
    total++;
    items.push({ tipo: 'lote', g: grupos.find((x) => x.id === (v.salas[0] || {}).id) || null, nombre: 'Lote ' + v.lote, detalle: v.dias + ' d en producción · ' + salasTxt(v.salas) });
  });
  return { titulo, total, items, vacio: total ? '' : (ctx.mesPasado ? 'Sin alertas al cierre de ' + ctx.mesPasado.mes : 'Sin alertas hoy') };
}

/* ---------- Reproductores: días en producción frente al límite (60, el del tablero de Maduración) ---------- */
/** { titulo, vacio, lotes: [{ pasa, nombre, salas, dias, ancho, title }], nota } */
export function reproductoresPorDias(R, ctx) {
  const titulo = 'Reproductores · días en producción' + (ctx.mesPasado ? ' al ' + dm(ctx.mesPasado.cierre) : '');
  if (!ctx.cargado) return { titulo, vacio: 'Cargando datos…', lotes: [], nota: '' };
  if (!R || !R.lotes.length) return { titulo, vacio: R ? 'Ningún lote en producción' : 'Sin datos de maduración', lotes: [], nota: '' };
  return {
    titulo, vacio: '',
    lotes: R.lotes.map((L) => {
      const pasa = L.dias > R.limite;
      return { pasa, nombre: (pasa ? '⏳ ' : '') + L.lote, salas: (L.salas.length > 1 ? 'Salas ' : 'Sala ') + L.salas.map((x) => x.sala.replace('Sala ', '')).join(', ').replace(/, ([^,]+)$/, ' y $1'),
        dias: L.dias + ' d', ancho: Math.min(100, L.dias / R.limite * 100) + '%', title: L.lote + ': ' + L.dias + ' días en producción (reemplazo al pasar de ' + R.limite + ')' };
    }),
    nota: 'Reemplazo al pasar de ' + R.limite + ' días en producción, la regla del tablero de Maduración.',
  };
}

/* ---------- 📊 Detalle por tanque (T2 de Análisis, 2026-10-06, usuario) ----------
   Una tabla con TODOS los tanques activos del laboratorio —larvicultura: los en cultivo; maduración: los que tienen
   reproductores— para compararlos y ordenarlos por cualquier columna; «sólo en alerta» deja los que están fuera de rango.
   Las mismas cifras que la ficha del tanque (fichaTanque). Cada celda trae su texto, su valor para ordenar (null = sin
   dato: va al final en los dos sentidos) y `mal` cuando es la causa de la alerta del tanque. Los de desove no entran: el
   MCP no lleva registro por tanque de desove. */
export const COLUMNAS_TANQUES = {
  larv: [
    { k: 'tq', titulo: 'Tanque' }, { k: 'estadio', titulo: 'Estadío' }, { k: 'pop', titulo: 'Población', num: true },
    { k: 'sv', titulo: 'Superv.', num: true }, { k: 'od', titulo: 'OD (mg/L)', num: true }, { k: 'tmp', titulo: 'Temp. (°C)', num: true },
    { k: 'lote', titulo: 'Lote' }, { k: 'alerta', titulo: '⚠', aria: 'Alerta', desc: true },
  ],
  mat: [
    { k: 'tq', titulo: 'Tanque' }, { k: 'estado', titulo: 'Estado' }, { k: 'h', titulo: '♀', aria: 'Hembras', num: true },
    { k: 'm', titulo: '♂', aria: 'Machos', num: true }, { k: 'hm', titulo: 'H:M', num: true }, { k: 'dens', titulo: 'Densidad (/m²)', num: true },
    { k: 'bajas', titulo: 'Bajas 7 d', num: true }, { k: 'desc', titulo: 'Descartes 7 d', num: true },
    { k: 'cop', titulo: 'Cópulas 7 d', num: true }, { k: 'parte', titulo: 'Último parte' },
    { k: 'alerta', titulo: '⚠', aria: 'Alerta', desc: true },
  ],
};
const valorNum = (v) => (v === '' || v === null || v === undefined || isNaN(v) ? null : Number(v));
/** El estadío en su orden biológico (N → Z → M → PL): «PL10» va DESPUÉS de «PL2», no antes como en el abecedario. */
const ordenEstadio = (est) => { const i = STAGE_ORDER.indexOf(String(est || '').toUpperCase().replace(/\s+/g, '')); return i < 0 ? null : i; };
function filaDeTanque(g, t, gi) {
  const st = t.st, mot = st.motivos || [], orden = gi * 1000 + t.num;
  const c = (txt, v, mal = false) => ({ txt, v, mal });
  const celdas = { tq: c(g.short + ' · ' + t.num, orden), alerta: c(mot.length ? '⚠ ' + mot.join(', ') : '', mot.length) };
  if (g.kind === 'larv') {
    const lote = st.lotes && st.lotes.length ? st.lotes.join(' · ') : null;
    Object.assign(celdas, {
      estadio: c(st.estadio || '—', ordenEstadio(st.estadio)), pop: c(fmtPop(st.pop), valorNum(st.pop)),
      sv: c(pct(st.sv), valorNum(st.sv), mot.includes('Superv.')), od: c(num(st.od, 2, ''), valorNum(st.od), mot.includes('OD')),
      tmp: c(num(st.tmp, 1, ''), valorNum(st.tmp), mot.includes('Temp')), lote: c(lote || '—', lote),
    });
  } else {
    const p = st.periodo || {}, cop = valorNum(p.pctCopulas), parte = /^\d{4}-\d{2}-\d{2}$/.test(st.ultimoParte || '') ? st.ultimoParte : null;
    Object.assign(celdas, {
      estado: c(st.estado || '—', st.estado || null), h: c(ent(st.hembras), valorNum(st.hembras)), m: c(ent(st.machos), valorNum(st.machos)),
      hm: c(dec(st.hm, 2), valorNum(st.hm), mot.includes('H:M')), dens: c(dec(st.densidad, 1), valorNum(st.densidad), mot.includes('Densidad')),
      bajas: c(ent(p.bajas), valorNum(p.bajas)), desc: c(ent(p.descartes), valorNum(p.descartes)),
      cop: c(cop === null ? '—' : dec(cop, 1) + ' %', cop), parte: c(dm(parte), parte),
    });
  }
  return { g, t, orden, alerta: !!st.alerta, celdas };
}
/** Ordena por la columna `k` (`dir` 'asc' | 'desc'); sin dato, siempre al final; los empates, por módulo y tanque. */
export function ordenarTanques(filas, k, dir) {
  const s = dir === 'desc' ? -1 : 1;
  return filas.slice().sort((a, b) => {
    const x = a.celdas[k].v, y = b.celdas[k].v;
    if (x === null || y === null) return x === y ? a.orden - b.orden : x === null ? 1 : -1;
    const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true });
    return d ? d * s : a.orden - b.orden;
  });
}
/** La tabla de un área ('larv' | 'mat'): { columnas, filas, resumen, vacio, k, dir }. `opc` = { soloAlerta, k, dir }. */
export function tablaDeTanques(grupos, area, opc, ctx) {
  const columnas = COLUMNAS_TANQUES[area], col = columnas.find((x) => x.k === opc.k) || columnas[0];
  const k = col.k, dir = col.k === opc.k && opc.dir === 'desc' ? 'desc' : 'asc';   // otra área sin esa columna: por tanque
  const base = { columnas, filas: [], resumen: '', k, dir };
  if (!ctx.cargado) return { ...base, vacio: 'Cargando datos de producción…' };
  const activo = area === 'larv' ? (st) => st.estado === 'cultivo' : (st) => st.vivos > 0;
  const todas = [];
  grupos.forEach((g, gi) => { if (g.kind === area) g.tanks.forEach((t) => { if (t.st && activo(t.st)) todas.push(filaDeTanque(g, t, gi)); }); });
  const que = area === 'larv' ? 'en cultivo' : 'con reproductores', enAlerta = todas.filter((f) => f.alerta).length;
  if (!todas.length) return { ...base, vacio: 'Ningún tanque ' + que + (ctx.mesPasado ? ' en ' + ctx.mesPasado.mes : '') + '.' };
  const resumen = ent(todas.length) + (todas.length === 1 ? ' tanque ' : ' tanques ') + que + ' · '
    + (enAlerta ? ent(enAlerta) + ' en alerta' : 'ninguno en alerta') + (ctx.mesPasado ? ' (' + ctx.mesPasado.mes + ')' : '');
  const visibles = opc.soloAlerta ? todas.filter((f) => f.alerta) : todas;
  if (!visibles.length) return { ...base, resumen, vacio: 'Ningún tanque en alerta.' };
  return { ...base, resumen, vacio: '', filas: ordenarTanques(visibles, k, dir) };
}
