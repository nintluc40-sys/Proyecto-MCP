/* ============================================================
   PLANTA · 📊 ANÁLISIS — el tablero de Gerencia SIN la maqueta 3D (T1, 2026-10-05, usuario)
   Lo mismo que muestra la maqueta, en una página que no carga three.js: producción del mes frente a la meta (con su
   selector de mes y la meta ⚙), las cuatro cifras, «Qué atender hoy», cada módulo y sala en una fila que se despliega
   con su ficha y sus tanques (tocables: la ficha del tanque), los días en producción de los reproductores y los colores.
   Decisiones del usuario: selector «🏭 Maqueta | 📊 Análisis» dentro de Planta (index.js), que el equipo recuerda; filas
   desplegables; los textos los arma textos.js —compartido con la maqueta—, así ambas dicen exactamente lo mismo.
   La monta index.js con la misma interfaz que la escena: { pintarEstado(E|null), aviso(texto), alElegirMes(fn) }.
   ============================================================ */
import { LARV, MAT, tanquesDeSala } from './plano.js';
import { STAGE_CATS } from '../supervisor/etapas.js';
import { META_POR_DEFECTO, normalizarMeta } from './cifras.js';
import { leerMeta, guardarMeta } from './meta.js';
import { dm, MAD_HEX, colorGrupo, colorTanque, fichaGrupo, fichaTanque, textoFila, cifrasDelPanel, textosProduccion, textoMes,
  alertasParaAtender, reproductoresPorDias } from './textos.js';

const MARCO = `
<div class="planta planta-an">
  <header class="an-cab">
    <div>
      <h1>Laboratorio Mar Bravo</h1>
      <p class="lede" data-k="lede"></p>
      <p class="datos" data-k="datos" role="status">Cargando datos de producción…</p>
    </div>
    <a class="compartir" href="./?qr=gerencia" target="_blank" rel="noopener">🔗 Compartir acceso de Gerencia (QR)</a>
  </header>
  <div class="an-cols">
    <div class="an-col">
      <section class="prod" aria-label="Producción del mes">
        <div class="prod-head"><h2>Producción del mes</h2><button type="button" class="meta-btn" data-k="meta-btn" aria-expanded="false">⚙ Meta</button></div>
        <form class="meta-form" data-k="meta-form" hidden>
          <label>Meta del mes, en millones de larvas
            <span class="meta-row"><input data-k="meta-in" type="number" min="1" step="1" inputmode="numeric" required><button type="submit">Guardar</button><button type="button" data-k="meta-reset">Volver a 400</button></span>
          </label>
          <small>Se guarda sólo en este equipo.</small>
        </form>
        <div class="prod-nav">
          <button type="button" class="mes-btn" data-k="mes-prev" aria-label="Mes anterior" disabled>◀</button>
          <div class="prod-mes"><b data-k="prod-mes">—</b><span data-k="prod-cor"></span></div>
          <button type="button" class="mes-btn" data-k="mes-next" aria-label="Mes siguiente" disabled>▶</button>
        </div>
        <input type="range" class="mes-slider" data-k="mes-slider" min="0" max="0" value="0" step="1" aria-label="Mes de producción" hidden>
        <div class="prod-big"><b data-k="prod-total">—</b><span data-k="prod-meta"></span><em data-k="prod-pct"></em></div>
        <div class="prod-bar" data-k="prod-bar" role="img" aria-label="Producción del mes frente a la meta"><i class="d" data-k="prod-bar-d"></i><i class="c" data-k="prod-bar-c"></i><span class="goal" data-k="prod-goal"></span></div>
        <div class="prod-split"><span><i class="d"></i><span data-k="prod-desp">—</span></span><span><i class="c"></i><span data-k="prod-cult">—</span></span></div>
        <div class="prod-mini">
          <div><b data-k="prod-sv">—</b><span>supervivencia del mes</span></div>
          <div><b data-k="prod-n5">—</b><span data-k="prod-n5-sub">nauplios N5</span></div>
          <div><b data-k="prod-des">—</b><span>desoves</span></div>
        </div>
        <small class="prod-nota" data-k="prod-nota"></small>
      </section>
      <div class="stats" data-k="stats"></div>
      <section class="atender" data-k="atender-sec" aria-label="Qué atender hoy"><h2 data-k="atender-h">Qué atender hoy</h2><ul class="at-list" data-k="atender"></ul></section>
      <section class="repro" aria-label="Reproductores: días en producción"><h2 data-k="repro-h">Reproductores · días en producción</h2><ul class="repro-list" data-k="repro"></ul></section>
    </div>
    <div class="an-col">
      <section aria-label="Larvicultura"><h2>Larvicultura</h2><ul class="an-filas" data-k="larv"></ul></section>
      <section aria-label="Maduración"><h2>Maduración</h2><ul class="an-filas" data-k="mat"></ul></section>
      <section aria-label="Colores"><h2>Colores</h2><div class="legend" data-k="legend"></div></section>
    </div>
  </div>
</div>`;
const LEDE_HOY = 'El estado de hoy de cada módulo de larvicultura y de cada sala de maduración.';

/** Los módulos y salas del plano, con sus tanques (los mismos nombres y números que la maqueta). */
function gruposDelPlano() {
  const grupos = [];
  LARV.forEach((m) => {
    const g = { id: m.id, kind: 'larv', name: 'Módulo ' + m.n, short: 'M' + m.n, st: null, tanks: [], desove: [] };
    m.rows.forEach((z, r) => m.cols.forEach((x, c) => g.tanks.push({ g, num: m.num(r, c), st: null })));
    grupos.push(g);
  });
  MAT.forEach((m) => {
    const g = { id: m.id, kind: 'mat', sala: m.sala, name: 'Maduración ' + m.n, short: 'S' + m.n, st: null, tanks: [], desove: [] };
    if (m.circ) {
      m.circ.zs.forEach((z, r) => m.circ.xs.forEach((x, c) => g.tanks.push({ g, num: m.circ.num(r, c), st: null })));
      m.desove.zs.forEach((z, r) => m.desove.xs.forEach((x, c) => g.desove.push({ g, num: m.desove.num(r, c), desove: true, st: null })));
    } else tanquesDeSala(m).forEach(({ num }) => g.tanks.push({ g, num, st: null }));
    grupos.push(g);
  });
  return grupos;
}
/** Texto oscuro o claro sobre un color (luminancia relativa del sRGB). */
function tintaSobre(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4));
  return .2126 * r + .7152 * g + .0722 * b > .4 ? '#15232a' : '#fff';
}
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

/** Monta 📊 Análisis en `host`. */
export function montarAnalisis(host) {
  host.innerHTML = MARCO;
  const root = host.querySelector('.planta-an');
  const $ = (k) => root.querySelector('[data-k="' + k + '"]');
  const grupos = gruposDelPlano();
  let cargado = false, mesPasado = null, meta = leerMeta(), ultimasCifras = null, alMes = null;
  const abiertos = new Set();   // módulos y salas desplegados (sobreviven al refresco y al cambio de mes)
  let tanqueVisto = null;       // { id, num }: el tanque cuya ficha se ve
  const ctx = () => ({ cargado, mesPasado });

  /* ---- Producción del mes ---- */
  function pintarProduccion(C) {
    ultimasCifras = C;
    const T = textosProduccion(C, meta, ctx()), M = textoMes(C);
    $('prod-meta').textContent = T.metaTxt;
    $('prod-mes').textContent = M.mes; $('prod-cor').textContent = M.corridas;
    const prev = $('mes-prev'), next = $('mes-next'), sl = $('mes-slider');
    if (C) { const n = C.meses.length; prev.disabled = C.pos <= 0; next.disabled = C.pos >= n - 1; sl.hidden = n < 2; sl.max = String(n - 1); sl.value = String(C.pos); }
    else { prev.disabled = next.disabled = true; sl.hidden = true; }
    if (T.vacia) {
      ['prod-total', 'prod-sv', 'prod-n5', 'prod-des', 'prod-desp', 'prod-cult'].forEach((k) => { $(k).textContent = '—'; });
      $('prod-pct').textContent = ''; $('prod-nota').textContent = T.nota;
      $('prod-bar-d').style.width = $('prod-bar-c').style.width = '0%'; $('prod-goal').style.left = '100%';
      return;
    }
    $('prod-total').textContent = T.total; $('prod-pct').textContent = T.pct; $('prod-pct').classList.toggle('ok', T.ok);
    $('prod-bar-d').style.width = T.anchoDesp; $('prod-bar-c').style.width = T.anchoCult; $('prod-goal').style.left = T.meta;
    $('prod-bar').setAttribute('aria-label', T.aria);
    $('prod-desp').textContent = T.desp; $('prod-cult').textContent = T.cult;
    $('prod-sv').textContent = T.sv; $('prod-n5').textContent = T.n5; $('prod-n5-sub').textContent = T.n5sub; $('prod-des').textContent = T.des;
    $('prod-nota').textContent = T.nota;
  }
  // el selector de mes: como el de la maqueta (y el de la tabla Producción Omarsa): el deslizador elige al soltar
  const elegirMes = (pos) => { const C = ultimasCifras; if (!C || !alMes || pos < 0 || pos >= C.meses.length || pos === C.pos) return; alMes(C.meses[pos].mIdx, pos === C.meses.length - 1); };
  $('mes-prev').addEventListener('click', () => { if (ultimasCifras) elegirMes(ultimasCifras.pos - 1); });
  $('mes-next').addEventListener('click', () => { if (ultimasCifras) elegirMes(ultimasCifras.pos + 1); });
  $('mes-slider').addEventListener('input', (e) => { const m = ultimasCifras && ultimasCifras.meses[+e.target.value]; if (m) $('prod-mes').textContent = m.mes; });
  $('mes-slider').addEventListener('change', (e) => elegirMes(+e.target.value));
  {
    const btn = $('meta-btn'), form = $('meta-form'), inp = $('meta-in');
    const abrir = (si) => { form.hidden = !si; btn.setAttribute('aria-expanded', String(si)); if (si) { inp.value = String(Math.round(meta / 1e6)); inp.focus(); } };
    btn.addEventListener('click', () => abrir(form.hidden));
    form.addEventListener('submit', (e) => { e.preventDefault(); const v = Number(inp.value); if (!(v > 0)) { inp.focus(); return; } meta = normalizarMeta(v * 1e6); guardarMeta(meta); abrir(false); pintarProduccion(ultimasCifras); });
    $('meta-reset').addEventListener('click', () => { meta = META_POR_DEFECTO; guardarMeta(meta); abrir(false); pintarProduccion(ultimasCifras); });
  }

  /* ---- Cifras ---- */
  const colores = ['var(--larv)', '#e53935', 'var(--mat)', '#e53935'];
  function pintarCifras(E) {
    const box = $('stats'); box.textContent = '';
    cifrasDelPanel(E).forEach((c, i) => {
      const d = el('div', 'stat'), b = el('b', '', String(c.valor)), sp = el('span'), dot = el('i'), em = el('em', '', c.titulo);
      dot.style.background = colores[i]; sp.append(dot, em); d.append(b, sp, el('small', '', c.detalle)); box.append(d);
    });
  }

  /* ---- Módulos y salas: una fila que se despliega con su ficha y sus tanques ---- */
  const dl = (rows) => { const d = el('dl', 'an-ficha'); rows.forEach(([k, v]) => d.append(el('dt', '', k), el('dd', '', v))); return d; };
  function filaGrupo(g) {
    const li = el('li', 'an-fila'), abierto = abiertos.has(g.id);
    li.dataset.id = g.id;
    const cab = el('button', 'an-cabeza'); cab.type = 'button'; cab.setAttribute('aria-expanded', String(abierto)); cab.setAttribute('aria-controls', 'an-det-' + g.id);
    const color = colorGrupo(g), fondo = color === '#b9c7cf' ? '#8fa3ad' : color;   // como la fila de la maqueta
    const tag = el('span', 'tag', g.short); tag.style.background = fondo;
    const f = textoFila(g, ctx()), nm = el('span', 'nm', g.name); nm.append(el('small', '', f.sub));
    cab.append(tag, nm, el('span', 'ct', f.ct), el('span', 'chev', abierto ? '▾' : '▸'));
    cab.querySelector('.chev').setAttribute('aria-hidden', 'true');
    cab.addEventListener('click', () => { if (abiertos.has(g.id)) abiertos.delete(g.id); else abiertos.add(g.id); pintarFilas(); });
    li.append(cab);
    const det = el('div', 'an-det'); det.id = 'an-det-' + g.id; det.hidden = !abierto;
    if (abierto) {
      det.append(dl(fichaGrupo(g, ctx()).rows));
      const lista = [...g.tanks, ...g.desove].sort((a, b) => (a.desove === b.desove ? a.num - b.num : a.desove ? 1 : -1));
      if (lista.length) {
        det.append(el('div', 'an-tq-tit', g.kind === 'larv' ? 'Tanques · toca uno para su ficha' : 'Tanques y desove · toca uno para su ficha'));
        const box = el('div', 'an-tqs');
        lista.forEach((t) => {
          const b = el('button', 'an-tq' + (t.st && t.st.alerta ? ' alerta' : '') + (t.desove ? ' desove' : ''), (t.desove ? 'D' : '') + t.num + (t.st && t.st.alerta ? ' ⚠' : ''));
          const c = colorTanque(t); b.type = 'button'; b.style.background = c; b.style.color = tintaSobre(c);
          const visto = tanqueVisto && tanqueVisto.id === g.id && tanqueVisto.num === t.num && !!tanqueVisto.desove === !!t.desove;
          b.setAttribute('aria-pressed', String(visto));
          const ft = fichaTanque(t, ctx()); b.setAttribute('aria-label', ft.name + ': ' + ft.rows[0][1] + (t.st && t.st.alerta ? ', en alerta' : ''));
          b.addEventListener('click', () => { tanqueVisto = visto ? null : { id: g.id, num: t.num, desove: !!t.desove }; pintarFilas(); });
          box.append(b);
        });
        det.append(box);
        const t = tanqueVisto && tanqueVisto.id === g.id ? lista.find((x) => x.num === tanqueVisto.num && !!x.desove === !!tanqueVisto.desove) : null;
        if (t) { const ft = fichaTanque(t, ctx()), w = el('div', 'an-tq-ficha'); w.append(el('h4', '', ft.name), dl(ft.rows)); det.append(w); }
      }
    }
    li.append(det);
    return li;
  }
  function pintarFilas() {
    const larv = $('larv'), mat = $('mat'); larv.textContent = ''; mat.textContent = '';
    grupos.forEach((g) => (g.kind === 'larv' ? larv : mat).append(filaGrupo(g)));
  }
  /** Abre (y lleva a la vista) la fila de un módulo o sala; con un tanque, también su ficha. */
  function irA(g, t) {
    abiertos.add(g.id);
    if (t) tanqueVisto = { id: g.id, num: t.num, desove: !!t.desove };
    pintarFilas();
    const li = root.querySelector('.an-fila[data-id="' + g.id + '"]');
    if (!li || !li.scrollIntoView) return;
    // la cabecera de la app es fija (y en el celular ocupa dos líneas): la fila queda justo debajo, no tapada
    const cab = document.querySelector('.app-header');
    li.style.scrollMarginTop = ((cab ? cab.getBoundingClientRect().height : 0) + 8) + 'px';
    li.scrollIntoView({ block: 'start' });
  }

  /* ---- Qué atender hoy y reproductores ---- */
  function pintarAtender(reemplazo) {
    const ul = $('atender'), h = $('atender-h'); ul.textContent = '';
    const nota = (txt) => ul.append(el('li', 'at-vacio', txt));
    const A = alertasParaAtender(grupos, reemplazo, ctx());
    $('atender-sec').setAttribute('aria-label', A.titulo);
    if (A.total === null) { h.textContent = A.titulo; nota(A.vacio); return; }
    A.items.forEach((it) => {
      const li = el('li', 'at'), gb = el('button', 'at-g'); gb.type = 'button';
      const dot = el('i');
      if (it.tipo === 'lote') { dot.className = 'reloj'; dot.textContent = '⏳'; } else dot.style.background = it.color;
      gb.append(dot, el('b', '', it.nombre), el('span', '', it.detalle));
      if (it.g) gb.addEventListener('click', () => irA(it.g));
      li.append(gb);
      if (it.tanques && it.tanques.length) {
        const fila = el('div', 'at-t');
        it.tanques.forEach(({ t, texto, aria }) => { const b = el('button', '', texto); b.type = 'button'; b.setAttribute('aria-label', aria); b.addEventListener('click', () => irA(t.g, t)); fila.append(b); });
        li.append(fila);
      }
      ul.append(li);
    });
    h.textContent = A.total ? '⚠ ' + A.titulo + ' · ' + A.total : A.titulo;
    if (!A.total) nota(A.vacio);
  }
  function pintarReproductores(R) {
    const P = reproductoresPorDias(R, ctx());
    $('repro-h').textContent = P.titulo;
    const ul = $('repro'); ul.textContent = '';
    if (P.vacio) { ul.append(el('li', 'at-vacio', P.vacio)); return; }
    P.lotes.forEach((L) => {
      const li = el('li', 'rp' + (L.pasa ? ' pasa' : '')), bar = el('div', 'rp-bar'), fill = el('i');
      bar.setAttribute('aria-hidden', 'true'); fill.style.width = L.ancho; bar.append(fill);
      li.title = L.title; li.append(el('b', '', L.nombre), el('span', '', L.salas), el('em', '', L.dias), bar); ul.append(li);
    });
    ul.append(el('li', 'rp-nota', P.nota));
  }

  /* ---- Colores (los de la maqueta) ---- */
  {
    const lg = $('legend');
    const item = (color, txt) => { const sp = el('span', 'lg'), i = el('i'); i.style.background = color; sp.append(i, document.createTextNode(txt)); lg.append(sp); };
    STAGE_CATS.forEach((c) => item(c.color, c.label + ' · ' + c.range));
    item('#d9e8ea', 'Vacío'); item('#a9bcc8', 'Despachado'); item('#5b6266', 'Agrupado o descartado');
    lg.append(el('span', 'lg-sub', 'Maduración'));
    ['Producción', 'Cuarentena', 'Mixto'].forEach((e) => item(MAD_HEX[e], e));
    lg.append(el('span', 'lg lg-alerta', '⚠ Tanque en alerta'));
  }

  /** Pinta el estado (lo calcula index.js con estado.js y cifras.js; null mientras no hay libro). */
  function pintarEstado(E) {
    cargado = !!E; mesPasado = (E && E.mes) || null;
    $('lede').textContent = mesPasado ? mesPasado.mes + ': cada módulo de larvicultura con su corrida de ese mes y cada sala de maduración al ' + dm(mesPasado.cierre) + '.' : LEDE_HOY;
    grupos.forEach((g) => {
      g.st = !E ? null : g.kind === 'larv' ? E.modulos[g.id] || null : (E.mad && E.mad.salas[g.id]) || null;
      g.tanks.forEach((t) => { t.st = g.st && g.st.tanques ? g.st.tanques[t.num] || null : null; });
    });
    const reemplazo = E && E.mad ? E.mad.reemplazo : null;
    pintarProduccion(E && E.cifras); pintarCifras(E); pintarReproductores(reemplazo); pintarAtender(reemplazo); pintarFilas();
  }
  pintarEstado(null);
  return {
    pintarEstado,
    aviso: (texto) => { $('datos').textContent = texto || ''; },
    alElegirMes: (fn) => { alMes = fn; },
  };
}
