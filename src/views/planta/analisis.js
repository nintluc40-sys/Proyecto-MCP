/* ============================================================
   PLANTA · 📊 ANÁLISIS — el tablero de Gerencia SIN la maqueta 3D (T1, 2026-10-05, usuario)
   Lo mismo que muestra la maqueta, en una página que no carga three.js: producción del mes frente a la meta (con su
   selector de mes y la meta ⚙), las cuatro cifras, «Qué atender hoy», cada módulo y sala en una fila que se despliega
   con su ficha y sus tanques (tocables: la ficha del tanque), los días en producción de los reproductores y los colores.
   Decisiones del usuario: selector «🏭 Maqueta | 📊 Análisis» dentro de Planta (index.js), que el equipo recuerda; filas
   desplegables; los textos los arma textos.js —compartido con la maqueta—, así ambas dicen exactamente lo mismo.
   La monta index.js con la misma interfaz que la escena: { pintarEstado(E|null), aviso(texto), alElegirMes(fn) }.
   Detalle por tanque (T2, 2026-10-06, usuario): al final, una tabla con TODOS los tanques activos (Larvicultura |
   Maduración), «sólo en alerta», ordenable tocando un encabezado; tocar una fila abre ese tanque en su módulo o sala, como
   «Qué atender hoy». En el celular se desliza a los lados con la columna del tanque fija. Lo que dice, tablaDeTanques.
   Cronograma del ciclo (T3, 2026-10-06, usuario): encima, los 10 módulos en un calendario común, cada uno de su siembra a
   hoy (o al despacho) en tramos por etapa, con 🚚 y rayado desde el despacho, la marca de la desinfección y «día · estadío»;
   tocar un tramo da su detalle (con «Ver módulo»), y el módulo o su etiqueta lo abren. Cálculo: estado.js
   (cronogramaPlanta); lo que se dibuja: textos.js (cronogramaParaPintar).
   Plano del laboratorio (T4, 2026-10-06, usuario): encima del cronograma, el plano esquemático en SVG (plano.js ·
   formasDelPlano: los módulos y salas con sus tanques a escala, las otras áreas, la calle y una franja de playa y mar de
   orientación), cada tanque con el color de su ficha, su número y ⚠ con borde rojo si está en alerta (la sala en alerta,
   con su borde rojo); tocar un tanque, un módulo o sala, o un área da su ficha debajo, con «Ver en su módulo →». En el
   celular conserva 720 px de ancho y se desliza dentro de su caja.
   ============================================================ */
import { LARV, MAT, tanquesDeSala, formasDelPlano } from './plano.js';
import { STAGE_CATS } from '../supervisor/etapas.js';
import { META_POR_DEFECTO, normalizarMeta } from './cifras.js';
import { leerMeta, guardarMeta } from './meta.js';
import { dm, MAD_HEX, colorGrupo, colorTanque, fichaGrupo, fichaTanque, textoFila, cifrasDelPanel, textosProduccion, textoMes,
  alertasParaAtender, reproductoresPorDias, tablaDeTanques, COLUMNAS_TANQUES, cronogramaParaPintar } from './textos.js';

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
  <section class="an-plano" aria-label="Plano del laboratorio">
    <h2>Plano del laboratorio</h2>
    <p class="an-tabla-res" data-k="plano-nota"></p>
    <div class="an-plano-caja" data-k="plano"></div>
    <div class="an-tq-ficha an-pl-ficha" data-k="plano-ficha" role="status" hidden><h4 data-k="plano-ficha-h"></h4><dl class="an-ficha" data-k="plano-ficha-dl"></dl><button type="button" data-k="plano-ficha-ir">Ver en su módulo →</button></div>
  </section>
  <section class="an-crono" aria-label="Cronograma del ciclo">
    <h2>Cronograma del ciclo</h2>
    <p class="an-tabla-res" data-k="crono-nota"></p>
    <p class="at-vacio" data-k="crono-vacio" hidden></p>
    <div class="an-crono-caja" data-k="crono"></div>
    <div class="an-cr-det" data-k="crono-det" role="status" hidden><span data-k="crono-det-txt"></span><button type="button" data-k="crono-det-ir"></button></div>
  </section>
  <section class="an-tabla" aria-label="Detalle por tanque">
    <div class="an-tabla-cab">
      <h2>Detalle por tanque</h2>
      <div class="seg an-area" role="group" aria-label="Área"><button type="button" data-area="larv" aria-pressed="true">Larvicultura</button><button type="button" data-area="mat" aria-pressed="false">Maduración</button></div>
      <label class="an-solo"><input type="checkbox" data-k="solo-alerta"> Sólo en alerta</label>
    </div>
    <p class="an-tabla-res" data-k="tabla-res" role="status"></p>
    <p class="at-vacio" data-k="tabla-vacio" hidden></p>
    <div class="an-tabla-caja" data-k="tabla-caja" tabindex="0" role="region" aria-label="Tabla de tanques: toca un encabezado para ordenar y una fila para ver el tanque">
      <table class="an-tq-tabla"><thead data-k="tabla-cab"></thead><tbody data-k="tabla-filas"></tbody></table>
    </div>
  </section>
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

  /* ---- Plano 2D: el dibujo se arma UNA vez (plano.js · formasDelPlano); cada pintado sólo cambia colores, alertas y lo
     elegido. Tocar un tanque, un módulo o sala (su contorno) o un área da su ficha debajo, sin mover la página. ---- */
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, cls) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v))); return e; };
  const PL = formasDelPlano(), tanquesPlano = [];   // { g, t, forma, txt, aviso }
  let planoSel = null;   // { tipo: 'tanque', id, num, desove } | { tipo: 'grupo', id } | { tipo: 'area', i }
  {
    const V = PL.vista, svg = sv('svg', { viewBox: [V.x, V.z, V.w, V.h].join(' '), role: 'group', 'aria-label': 'Plano del laboratorio visto desde arriba' }, 'an-pl');
    PL.bandas.forEach((b) => svg.append(sv('rect', { x: b.x, y: b.z, width: b.w, height: b.h }, 'an-pl-' + b.tipo)));
    const ca = PL.bandas.find((b) => b.tipo === 'calle');
    svg.append(sv('line', { x1: ca.x, x2: ca.x + ca.w, y1: ca.z + ca.h / 2, y2: ca.z + ca.h / 2 }, 'an-pl-raya'));
    svg.append(sv('rect', { x: PL.terreno.x, y: PL.terreno.z, width: PL.terreno.w, height: PL.terreno.h, rx: 0.6 }, 'an-pl-terreno'));
    PL.otras.forEach((o, i) => { const r = sv('rect', { x: o.x, y: o.z, width: o.w, height: o.h, rx: 0.4 }, 'an-pl-otra ' + o.tipo); r.dataset.area = String(i); svg.append(r); });
    PL.grupos.forEach((G) => {
      const g = grupos.find((x) => x.id === G.id); if (!g) return;
      const caja = sv('rect', { x: G.x, y: G.z, width: G.w, height: G.h, rx: 0.5, tabindex: 0, role: 'button', 'aria-label': 'Ficha de ' + g.name }, 'an-pl-grupo');
      caja.dataset.grupo = G.id; svg.append(caja);
      G.tanques.forEach((F) => {
        const t = (F.desove ? g.desove : g.tanks).find((x) => x.num === F.num); if (!t) return;
        const circ = F.forma === 'circ';
        const forma = circ ? sv('circle', { cx: F.cx, cy: F.cz, r: F.r }, 'an-pl-tq') : sv('rect', { x: F.x, y: F.z, width: F.w, height: F.h, rx: 0.3 }, 'an-pl-tq');
        forma.dataset.grupo = G.id; forma.dataset.num = String(F.num); if (F.desove) forma.dataset.desove = '1';
        // el número al centro; con alerta, el ⚠ a su derecha (rectángulos, que son anchos) o encima (círculos) y el número
        // se corre para no pisarse (medido: «10⚠» se tocaban en los tanques chicos)
        const cx = circ ? F.cx : F.x + F.w / 2, cz = circ ? F.cz : F.z + F.h / 2;
        const pos = { base: [cx, cz], alerta: circ ? [cx, cz + 0.65] : [cx - 0.8, cz] };
        const txt = sv('text', { x: cx, y: cz, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, 'an-pl-num');
        txt.textContent = (F.desove ? 'D' : '') + F.num;
        const aviso = sv('text', circ ? { x: cx, y: cz - 0.95, 'text-anchor': 'middle', 'dominant-baseline': 'central' }
          : { x: F.x + F.w - 0.3, y: cz, 'text-anchor': 'end', 'dominant-baseline': 'central' }, 'an-pl-aviso');
        aviso.textContent = '⚠';
        svg.append(forma, txt, aviso);
        tanquesPlano.push({ g, t, forma, txt, aviso, pos });
      });
    });
    $('plano').append(svg);
  }
  function fichaDelPlano() {
    if (!planoSel) return null;
    if (planoSel.tipo === 'area') {
      const o = PL.otras[planoSel.i], [tit, det] = o.nombre.split(' · ');
      return { ficha: { name: tit, rows: det ? [['Uso', det]] : [] }, g: null, t: null };
    }
    const g = grupos.find((x) => x.id === planoSel.id); if (!g) return null;
    if (planoSel.tipo === 'grupo') return { ficha: fichaGrupo(g, ctx()), g, t: null };
    const t = (planoSel.desove ? g.desove : g.tanks).find((x) => x.num === planoSel.num);
    return t ? { ficha: fichaTanque(t, ctx()), g, t } : null;
  }
  function pintarPlano() {
    $('plano-nota').textContent = !cargado ? 'Cargando datos de producción…'
      : (mesPasado ? 'Al cierre de ' + mesPasado.mes : 'Hoy') + ': cada tanque con el color de su ficha (⚠ en alerta). Toca un tanque, un módulo o sala, o un área.';
    const es = (t) => planoSel && planoSel.tipo === 'tanque' && planoSel.id === t.g.id && planoSel.num === t.num && !!planoSel.desove === !!t.desove;
    tanquesPlano.forEach(({ t, forma, txt, aviso, pos }) => {
      const c = colorTanque(t), al = !!(t.st && t.st.alerta), [x, y] = al ? pos.alerta : pos.base;
      forma.setAttribute('fill', c); txt.setAttribute('fill', tintaSobre(c)); txt.setAttribute('x', String(x)); txt.setAttribute('y', String(y));
      forma.classList.toggle('alerta', al); forma.classList.toggle('sel', !!es(t));
      aviso.style.display = al ? '' : 'none';
    });
    root.querySelectorAll('.an-pl-grupo').forEach((b) => {
      const g = grupos.find((x) => x.id === b.dataset.grupo);
      b.classList.toggle('alerta', !!(g && g.kind === 'mat' && g.st && g.st.alerta));
      b.classList.toggle('sel', !!(planoSel && planoSel.tipo === 'grupo' && planoSel.id === b.dataset.grupo));
    });
    root.querySelectorAll('.an-pl-otra').forEach((r) => r.classList.toggle('sel', !!(planoSel && planoSel.tipo === 'area' && planoSel.i === +r.dataset.area)));
    const F = fichaDelPlano(), card = $('plano-ficha');
    card.hidden = !F;
    if (!F) return;
    $('plano-ficha-h').textContent = F.ficha.name;
    const d = $('plano-ficha-dl'); d.textContent = '';
    F.ficha.rows.forEach(([k, v]) => d.append(el('dt', '', k), el('dd', '', v)));
    $('plano-ficha-ir').hidden = !F.g;
  }
  const elegirEnPlano = (target) => {
    const f = target.closest('.an-pl-tq'), b = target.closest('.an-pl-grupo'), a = target.closest('.an-pl-otra');
    const s = f ? { tipo: 'tanque', id: f.dataset.grupo, num: +f.dataset.num, desove: !!f.dataset.desove } : b ? { tipo: 'grupo', id: b.dataset.grupo } : a ? { tipo: 'area', i: +a.dataset.area } : null;
    if (!s) return;
    planoSel = planoSel && JSON.stringify(planoSel) === JSON.stringify(s) ? null : s;   // tocar lo mismo otra vez lo quita
    pintarPlano();
  };
  $('plano').addEventListener('click', (e) => elegirEnPlano(e.target));
  $('plano').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.an-pl-grupo')) { e.preventDefault(); elegirEnPlano(e.target); } });
  $('plano-ficha-ir').addEventListener('click', () => { const F = fichaDelPlano(); if (F && F.g) irA(F.g, F.t || undefined); });

  /* ---- Cronograma del ciclo: una fila por módulo; tocar un tramo da su detalle, y el módulo o su etiqueta lo abren ---- */
  let cronoSel = null;   // { id, i }: el tramo cuyo detalle se ve (sobrevive al refresco si sigue existiendo)
  function pintarCrono(crono) {
    const P = cronogramaParaPintar(grupos, crono, ctx()), caja = $('crono');
    caja.textContent = '';
    $('crono-nota').textContent = P.nota || '';
    $('crono-vacio').textContent = P.vacio; $('crono-vacio').hidden = !P.vacio; caja.hidden = !!P.vacio;
    // el tramo elegido sigue elegido sólo en SU corrida (otro mes del selector trae otra corrida al mismo módulo)
    const fSel = cronoSel && P.filas.find((f) => f.id === cronoSel.id && f.corrida === cronoSel.corrida), tSel = fSel && fSel.tramos[cronoSel.i];
    if (!tSel) cronoSel = null;
    $('crono-det').hidden = !tSel;
    if (tSel) { $('crono-det-txt').textContent = tSel.detalle; $('crono-det-ir').textContent = 'Ver ' + fSel.g.name + ' →'; }
    if (P.vacio) return;
    const ejes = el('div', 'an-cr-ejes'), marcas = el('div', 'an-cr-marcas');
    ejes.setAttribute('aria-hidden', 'true');
    P.marcas.forEach((m) => { const s = el('span', m.pct > 88 ? 'fin' : '', m.txt); s.style.left = m.pct + '%'; marcas.append(s); });
    const corte = el('b', 'corte', P.corte); corte.style.left = P.cortePct + '%'; marcas.append(corte);
    ejes.append(el('span'), marcas, el('span'));
    caja.append(ejes);
    P.filas.forEach((f) => {
      const fila = el('div', 'an-cr-fila ' + f.tipo); fila.dataset.id = f.id;
      const mod = el('button', 'an-cr-mod'), tag = el('span', 'tag', f.short); mod.type = 'button';
      tag.style.background = colorGrupo(f.g) === '#b9c7cf' ? '#8fa3ad' : colorGrupo(f.g); mod.append(tag); mod.setAttribute('aria-label', 'Ver ' + f.g.name);
      const pista = el('div', 'an-cr-pista' + (f.cortada ? ' cortada' : ''));
      f.tramos.forEach((t, i) => {
        const b = el('button', 'an-cr-tramo'); b.type = 'button'; b.dataset.i = String(i);
        b.style.left = t.left + '%'; b.style.width = t.width + '%'; b.style.background = t.color;
        b.setAttribute('aria-label', t.detalle); b.setAttribute('aria-pressed', String(!!(fSel === f && cronoSel.i === i)));
        pista.append(b);
      });
      if (f.desp) { const d = el('i', 'an-cr-desp'); d.style.left = f.desp.left + '%'; d.style.width = f.desp.width + '%'; pista.append(d); }
      if (f.camion !== null) { const k = el('span', 'an-cr-camion', '🚚'); k.style.left = f.camion + '%'; k.setAttribute('aria-hidden', 'true'); pista.append(k); }
      if (f.desinf !== null) { const k = el('i', 'an-cr-desinf'); k.style.left = f.desinf + '%'; k.title = f.etiqueta; pista.append(k); }
      const hoy = el('i', 'an-cr-hoy'); hoy.style.left = P.cortePct + '%'; pista.append(hoy);
      const et = el('button', 'an-cr-et', f.etiqueta); et.type = 'button'; et.setAttribute('aria-label', 'Ver ' + f.aria);
      fila.append(mod, pista, et);
      caja.append(fila);
    });
  }
  let ultimoCrono = null;
  $('crono').addEventListener('click', (e) => {
    const fila = e.target.closest('.an-cr-fila'), g = fila && grupos.find((x) => x.id === fila.dataset.id);
    if (!g) return;
    const t = e.target.closest('.an-cr-tramo');
    if (t) {
      const i = +t.dataset.i, corrida = (ultimoCrono && ultimoCrono.modulos[g.id] && ultimoCrono.modulos[g.id].corrida) || null;
      cronoSel = cronoSel && cronoSel.id === g.id && cronoSel.i === i ? null : { id: g.id, i, corrida };
      pintarCrono(ultimoCrono); return;
    }
    if (e.target.closest('.an-cr-mod, .an-cr-et')) irA(g);
  });
  $('crono-det-ir').addEventListener('click', () => { const g = cronoSel && grupos.find((x) => x.id === cronoSel.id); if (g) irA(g); });

  /* ---- Detalle por tanque: área, «sólo en alerta» y el orden sobreviven al refresco y al cambio de mes ---- */
  const tabla = { area: 'larv', soloAlerta: false, k: 'tq', dir: 'asc', filas: [] };
  function pintarTabla() {
    const T = tablaDeTanques(grupos, tabla.area, tabla, ctx());
    tabla.k = T.k; tabla.dir = T.dir; tabla.filas = T.filas;
    root.querySelectorAll('.an-area [data-area]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.area === tabla.area)));
    $('tabla-res').textContent = T.resumen;
    $('tabla-vacio').textContent = T.vacio; $('tabla-vacio').hidden = !T.vacio; $('tabla-caja').hidden = !!T.vacio;
    const cab = $('tabla-cab'), cuerpo = $('tabla-filas'); cab.textContent = ''; cuerpo.textContent = '';
    if (T.vacio) return;
    const tr = el('tr');
    T.columnas.forEach((c) => {
      const th = el('th', c.num ? 'an-num' : ''), b = el('button', '', c.titulo + (c.k === T.k ? (T.dir === 'asc' ? ' ▲' : ' ▼') : ''));
      th.scope = 'col'; b.type = 'button'; b.dataset.col = c.k;
      b.setAttribute('aria-label', 'Ordenar por ' + (c.aria || c.titulo));
      if (c.k === T.k) th.setAttribute('aria-sort', T.dir === 'asc' ? 'ascending' : 'descending');
      th.append(b); tr.append(th);
    });
    cab.append(tr);
    T.filas.forEach((f, i) => {
      const fila = el('tr', f.alerta ? 'alerta' : ''); fila.dataset.i = String(i);
      T.columnas.forEach((c, j) => {
        const v = f.celdas[c.k];
        if (!j) { const th = el('th'), b = el('button', '', v.txt); th.scope = 'row'; b.type = 'button'; b.setAttribute('aria-label', 'Ver ' + fichaTanque(f.t, ctx()).name); th.append(b); fila.append(th); return; }
        fila.append(el('td', [c.num ? 'an-num' : '', v.mal ? 'mal' : '', c.k === 'alerta' && v.txt ? 'al' : ''].filter(Boolean).join(' '), v.txt));
      });
      cuerpo.append(fila);
    });
  }
  root.querySelector('.an-area').addEventListener('click', (e) => {
    const b = e.target.closest('[data-area]'); if (!b || b.dataset.area === tabla.area) return;
    tabla.area = b.dataset.area; pintarTabla();
  });
  $('solo-alerta').addEventListener('change', (e) => { tabla.soloAlerta = e.target.checked; pintarTabla(); });
  $('tabla-cab').addEventListener('click', (e) => {
    const b = e.target.closest('[data-col]'); if (!b) return;
    const c = b.dataset.col;   // la misma columna invierte el sentido; otra empieza en el suyo (⚠: primero las alertas)
    if (c === tabla.k) tabla.dir = tabla.dir === 'asc' ? 'desc' : 'asc';
    else { tabla.k = c; tabla.dir = (COLUMNAS_TANQUES[tabla.area].find((x) => x.k === c) || {}).desc ? 'desc' : 'asc'; }
    pintarTabla();
  });
  $('tabla-filas').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-i]'), f = tr && tabla.filas[+tr.dataset.i];
    if (f) irA(f.g, f.t);
  });

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
    pintarPlano();
    ultimoCrono = (E && E.crono) || null; pintarCrono(ultimoCrono);
    pintarTabla();
  }
  pintarEstado(null);
  return {
    pintarEstado,
    aviso: (texto) => { $('datos').textContent = texto || ''; },
    alElegirMes: (fn) => { alMes = fn; },
  };
}
