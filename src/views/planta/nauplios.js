/* ============================================================
   PLANTA · la sección «Nauplios N5 · maduración» (punto 10 de la lista del 07-10 noche, usuario) — el DOM COMPARTIDO por
   la maqueta (el panel de index.js, lo monta escena.js) y 📊 Análisis (analisis.js), bajo «Producción del mes»: el N5 del
   mes frente a su meta, una barra por día con la línea de la meta diaria (tocar una da el desglose por lote de ese día) y
   el desglose del último día completo. Lo que dice, textos.js (textosNauplios); los datos, cifras.js (nauplios.dias).
   La meta diaria se edita con ⚙ y se guarda en el equipo (meta.js); se RELEE en cada pintado, porque el otro modo pudo
   cambiarla mientras éste estaba oculto (los modos no se rehacen). Todo con textContent.
   ============================================================ */
import { META_N5_DIA, DIAS_PRODUCCION_N5, normalizarMeta } from './cifras.js';
import { leerMetaN5, guardarMetaN5 } from './meta.js';
import { textosNauplios } from './textos.js';

const MARCO = `
  <div class="prod-head"><h2>Nauplios N5 · maduración</h2><button type="button" class="meta-btn" data-n5="meta-btn" aria-expanded="false">⚙ Meta</button></div>
  <form class="meta-form" data-n5="meta-form" hidden>
    <label>Meta diaria de N5, en millones
      <span class="meta-row"><input data-n5="meta-in" type="number" min="1" step="1" inputmode="numeric" required><button type="submit">Guardar</button><button type="button" data-n5="meta-reset">Volver a ${META_N5_DIA / 1e6}</button></span>
    </label>
    <small>La del mes es la diaria × ${DIAS_PRODUCCION_N5} días de producción. Se guarda sólo en este equipo.</small>
  </form>
  <div class="prod-big"><b data-n5="mes">—</b><span data-n5="mes-meta"></span><em data-n5="mes-pct"></em></div>
  <div class="prod-bar" data-n5="mes-bar-r" role="img" aria-label="N5 del mes frente a su meta"><i class="d" data-n5="mes-bar"></i></div>
  <small class="n5-sub" data-n5="mes-sub"></small>
  <div class="n5-graf" data-n5="graf">
    <div class="n5-barras" data-n5="barras" role="group" aria-label="N5 de cada día del mes: toca un día para ver sus lotes"></div>
    <span class="n5-linea" data-n5="linea" aria-hidden="true"></span>
  </div>
  <div class="n5-eje" data-n5="eje" aria-hidden="true"><span></span><span></span></div>
  <div class="n5-dia" data-n5="dia" role="status">
    <p class="n5-dia-t"><b data-n5="dia-t"></b><span data-n5="dia-v"></span><em data-n5="dia-pct"></em></p>
    <ul class="n5-lotes" data-n5="lotes"></ul>
    <small class="n5-dia-nota" data-n5="dia-nota"></small>
  </div>
  <small class="prod-nota" data-n5="nota"></small>`;

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

/** Monta la sección en `sec` (vacía). Devuelve { pintar(nauplios|null, ctx) }. */
export function montarNauplios(sec) {
  sec.innerHTML = MARCO;
  const $ = (k) => sec.querySelector('[data-n5="' + k + '"]');
  let ultimo = null, ultimoCtx = { cargado: false, mesPasado: null }, elegido = null;

  function pintar(N, ctx) {
    ultimo = N; ultimoCtx = ctx;
    const meta = leerMetaN5();
    const T = textosNauplios(N, meta, DIAS_PRODUCCION_N5, ctx, elegido);
    $('mes').textContent = T.mes.txt; $('mes-meta').textContent = T.mes.metaTxt;
    $('mes-pct').textContent = T.mes.pct; $('mes-pct').classList.toggle('ok', T.mes.ok);
    $('mes-bar').style.width = T.mes.ancho; $('mes-sub').textContent = T.mes.sub;
    $('nota').textContent = T.vacia || !T.dia ? T.nota : T.pendientes;
    $('graf').hidden = $('eje').hidden = !T.barras.length;
    const caja = $('barras'); caja.textContent = '';
    T.barras.forEach((b) => {
      const x = el('button', 'n5-b' + (b.sin ? ' sin' : '') + (b.pendiente ? ' pend' : ''));
      x.type = 'button'; x.dataset.fecha = b.fecha; x.disabled = b.sin;
      x.setAttribute('aria-label', b.aria); x.setAttribute('aria-pressed', String(b.sel));
      const i = el('i'); i.style.height = b.alto; x.append(i); caja.append(x);
    });
    $('linea').style.bottom = T.metaAlto;
    const [a, z] = $('eje').children; a.textContent = T.eje[0]; z.textContent = T.eje[1];
    $('dia').hidden = !T.dia;
    if (T.dia) {
      $('dia-t').textContent = T.dia.titulo; $('dia-v').textContent = T.dia.txt + ' ' + T.dia.metaTxt;
      $('dia-pct').textContent = T.dia.pct; $('dia-pct').classList.toggle('ok', T.dia.ok);
      const ul = $('lotes'); ul.textContent = '';
      T.dia.lotes.forEach((l) => { const li = el('li'); li.append(el('b', '', l.lote), el('span', '', l.txt)); ul.append(li); });
      $('dia-nota').textContent = T.dia.nota;
    }
  }
  // tocar un día: su desglose (otra vez, vuelve al último completo); el elegido sobrevive al refresco si sigue en el mes
  $('barras').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-fecha]'); if (!b || b.disabled) return;
    elegido = b.getAttribute('aria-pressed') === 'true' && elegido === b.dataset.fecha ? null : b.dataset.fecha;
    pintar(ultimo, ultimoCtx);
    const otra = $('barras').querySelector('button[data-fecha="' + b.dataset.fecha + '"]');
    if (otra) otra.focus({ preventScroll: true });
  });
  // ⚙ Meta diaria, como la de producción
  const btn = $('meta-btn'), form = $('meta-form'), inp = $('meta-in');
  const abrir = (si) => { form.hidden = !si; btn.setAttribute('aria-expanded', String(si)); if (si) { inp.value = String(Math.round(leerMetaN5() / 1e6)); inp.focus(); } };
  btn.addEventListener('click', () => abrir(form.hidden));
  form.addEventListener('submit', (e) => { e.preventDefault(); const v = Number(inp.value); if (!(v > 0)) { inp.focus(); return; } guardarMetaN5(normalizarMeta(v * 1e6, META_N5_DIA)); abrir(false); pintar(ultimo, ultimoCtx); });
  $('meta-reset').addEventListener('click', () => { guardarMetaN5(META_N5_DIA); abrir(false); pintar(ultimo, ultimoCtx); });
  pintar(null, ultimoCtx);
  return { pintar };
}
