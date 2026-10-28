/* ============================================================
   PLANTA · el modo «🦐 Broodstock» (M3, 2026-10-27, usuario): el MAPA de las piscinas de Broodstock —donde crecen los
   reproductores antes de entrar a Maduración— con lo que trae su hoja.

   Diseño aprobado por el usuario: una VISTA GENERAL de las tres zonas; al tocar una, el mapa se acerca a sus piscinas
   («← Todas las zonas» vuelve); al tocar una piscina, su FICHA. La geometría y la numeración son de `piscinas.js`.
   🛰 2026-10-28 (usuario, ronda 10, tarea 2) · con ASPECTO DE SATÉLITE, relieve y la FORMA de la captura: la fila de San
   Rafael inclinada, las largas de Roche como en la foto, el entorno (las piscinas grandes vecinas, los canales, los
   caminos y la vegetación) y Niágara en su recuadro. Todo DIBUJADO por el SVG —texturas de ruido, la sombra del bordo
   sobre el agua, la luz sobre la tierra—: las capturas de Google NO se usan ni se guardan (repo público). Cada piscina,
   con agua TEÑIDA por su fase (Precría, Engorde, Pre-reproductor); la que no vino en el último corte, SECA, como las
   vacías de la foto; la que aún no tiene nombre, con el agua oscura de las de producción y el borde discontinuo.
   El SVG se CONSTRUYE una vez por cada dato nuevo; elegir una zona o una piscina sólo mueve el encuadre y cambia clases
   y roles: los filtros no se recalculan en cada toque y el FOCO del teclado no se pierde (hallazgo 3 de la auditoría
   de la Sesión A, 28-10, que también señaló los botones anidados: ahora en la vista general el botón es la ZONA, y al
   acercarse, cada PISCINA; las zonas vecinas se ven atenuadas y no se tocan).

   🔑 NO calcula nada propio: la tabla y la ficha son las de 🧬 Lotes de Maduración (`tablaDePiscinas` y
   `fichaDePiscina`, operativo.broodstock.js) sobre el mismo modelo (`modeloOperativo`), así que el mapa no puede
   contradecir al tablero. Es una FOTO: el ÚLTIMO corte hasta hoy, o hasta el cierre del mes que se eligió en los otros
   modos (el mismo `E.mes` que reciben). Lo que el mapa no puede ubicar no se calla: las piscinas del corte que no
   están en el plano salen «fuera del mapa», y las que vinieron en el corte anterior y no en éste, aparte.

   La monta index.js con la interfaz de los otros modos: { pintarEstado(E|null), aviso(texto), alElegirMes(fn) }.
   `opciones.calcular(E)` sustituye el cálculo en las pruebas.
   ============================================================ */
import './broodstock.css';
import { esc } from '../../core/format.js';
import { store } from '../../core/store.js';
import { modeloOperativo } from '../maduracion/operativo.data.js';
import { normalizarFiltro } from '../maduracion/operativo.tablero.js';
import { tablaDePiscinas, fichaDePiscina } from '../maduracion/operativo.broodstock.js';
import { hoyLocal } from './estado.js';
import { ZONAS, CAJA_GENERAL, TIERRA, ENTORNO, RECUADRO_NIAGARA, centro, zonaDePiscina, nombreDePiscina } from './piscinas.js';

/* Las fases del catálogo de la carga (MAD_BS_FASES), cada una con su clase; lo que no está en él, «otra». */
export const FASES = [['Precría', 'precria'], ['Engorde', 'engorde'], ['Pre-reproductor', 'prerrep']];
const CLASE_FASE = new Map(FASES);
export const claseDeFase = (fase) => (fase ? CLASE_FASE.get(fase) || 'otra' : 'otra');

const n1 = (v) => (v === null || v === undefined || v === '' || Number.isNaN(+v) ? '' : (+v).toLocaleString('es-EC', { maximumFractionDigits: 1 }));
const n0 = (v) => (v === null || v === undefined || v === '' || Number.isNaN(+v) ? '' : Math.round(+v).toLocaleString('es-EC'));
const fechaIso = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s || '');

/** El cálculo de siempre: el modelo de Maduración a la foto pedida, la tabla de piscinas y la ficha a demanda. */
function calcularDesdeElLibro(E) {
  const M = modeloOperativo(store.globalData, { hoy: hoyLocal(), fecha: E && E.mes ? E.mes.cierre : undefined });
  const T = tablaDePiscinas(M, normalizarFiltro({}, null));
  return { T, ficha: (nombre) => fichaDePiscina(M, nombre, { desde: '', hasta: '' }) };
}

/** Lo que pinta el mapa a partir de la tabla de piscinas: el dato de cada piscina del plano, y lo que no se ubica. */
export function datosDelMapa(T) {
  const porNombre = new Map((T.piscinas || []).map((p) => [nombreDePiscina(p.piscina), p]));
  const zonas = ZONAS.map((z) => {
    const piscinas = z.piscinas.map((p) => ({ ...p, dato: p.nombre ? porNombre.get(p.nombre) || null : null }));
    return { ...z, piscinas, conDatos: piscinas.filter((p) => p.dato).length };
  });
  const fuera = (T.piscinas || []).filter((p) => !zonaDePiscina(p.piscina)).map((p) => p.piscina);
  return { corte: T.corte || '', zonas, fuera, ausentes: T.ausentes || [] };
}

/* ── El aspecto de satélite: todo dibujado ─────────────────
   · bs-terreno: manchas grandes y grano fino, multiplicados sobre el color (tierra, monte, piscinas secas).
   · bs-agua: un rizo suave sobre el agua.
   · bs-hundido: la sombra del bordo sobre el agua (la piscina está más baja que su bordo): relieve.
   · bs-relieve: la luz del noroeste sobre los bordos y caminos de tierra (los realza).
   · bs-monte: el borde irregular y el moteado de la vegetación.
   Se aplican a GRUPOS (un pase por capa), no a cada piscina. */
const DEFS = `<defs>
<filter id="bs-terreno" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency=".018" numOctaves="3" seed="11" result="manchas"/>
  <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="4" result="grano"/>
  <feComposite in="manchas" in2="grano" operator="arithmetic" k2=".75" k3=".35" result="ruido"/>
  <feColorMatrix in="ruido" type="saturate" values="0" result="gris"/>
  <feComponentTransfer in="gris" result="mult"><feFuncR type="linear" slope=".55" intercept=".62"/><feFuncG type="linear" slope=".55" intercept=".62"/><feFuncB type="linear" slope=".55" intercept=".62"/></feComponentTransfer>
  <feBlend in="SourceGraphic" in2="mult" mode="multiply" result="b"/>
  <feComposite in="b" in2="SourceAlpha" operator="in"/>
</filter>
<filter id="bs-agua" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency=".05 .22" numOctaves="2" seed="8" result="rizo"/>
  <feColorMatrix in="rizo" type="saturate" values="0" result="gris"/>
  <feComponentTransfer in="gris" result="mult"><feFuncR type="linear" slope=".3" intercept=".82"/><feFuncG type="linear" slope=".3" intercept=".82"/><feFuncB type="linear" slope=".3" intercept=".82"/></feComponentTransfer>
  <feBlend in="SourceGraphic" in2="mult" mode="multiply" result="b"/>
  <feComposite in="b" in2="SourceAlpha" operator="in"/>
</filter>
<filter id="bs-hundido" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">
  <feComponentTransfer in="SourceAlpha" result="fuera"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>
  <feGaussianBlur in="fuera" stdDeviation="2.4" result="difusa"/>
  <feOffset in="difusa" dx="1.6" dy="2.2" result="corrida"/>
  <feFlood flood-color="#05090c" flood-opacity=".6"/>
  <feComposite in2="corrida" operator="in" result="sombra"/>
  <feComposite in="sombra" in2="SourceAlpha" operator="in" result="dentro"/>
  <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="dentro"/></feMerge>
</filter>
<filter id="bs-relieve" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="alto"/>
  <feDiffuseLighting in="alto" surfaceScale="4" diffuseConstant="1.15" lighting-color="#fff" result="luz"><feDistantLight azimuth="225" elevation="52"/></feDiffuseLighting>
  <feComposite in="luz" in2="SourceAlpha" operator="in" result="luz2"/>
  <feBlend in="SourceGraphic" in2="luz2" mode="multiply"/>
</filter>
<filter id="bs-monte" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="21" result="desvio"/>
  <feDisplacementMap in="SourceGraphic" in2="desvio" scale="16" xChannelSelector="R" yChannelSelector="G" result="borde"/>
  <feTurbulence type="fractalNoise" baseFrequency=".14" numOctaves="2" seed="9" result="copas"/>
  <feColorMatrix in="copas" type="saturate" values="0" result="gris"/>
  <feComponentTransfer in="gris" result="mult"><feFuncR type="linear" slope=".9" intercept=".35"/><feFuncG type="linear" slope=".9" intercept=".35"/><feFuncB type="linear" slope=".9" intercept=".35"/></feComponentTransfer>
  <feBlend in="borde" in2="mult" mode="multiply" result="b"/>
  <feComposite in="b" in2="borde" operator="in"/>
</filter>
${[['precria', '#4f93c4', '#25638f'], ['engorde', '#4c9a76', '#256a4c'], ['prerrep', '#c08a45', '#8a5a22'], ['otra', '#8a78c0', '#5a4a92'],
    ['sn', '#1d3a52', '#0e2131'], ['vecina', '#14283a', '#0a1622']]
    .map(([k, a, b]) => `<linearGradient id="bs-g-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('')}
<clipPath id="bs-recorte-niagara"><rect x="${RECUADRO_NIAGARA[0]}" y="${RECUADRO_NIAGARA[1]}" width="${RECUADRO_NIAGARA[2] - RECUADRO_NIAGARA[0]}" height="${RECUADRO_NIAGARA[3] - RECUADRO_NIAGARA[1]}" rx="10"/></clipPath>
</defs>`;

const pts = (poly) => poly.map((p) => p[0] + ',' + p[1]).join(' ');
const fondoHTML = (E, extra = '') => `<g class="bs-fondo"${extra}>`
  + `<g class="bs-monte" filter="url(#bs-monte)">${E.vegetacion.map((p) => `<polygon points="${pts(p)}"/>`).join('')}</g>`
  + `<g class="bs-aguas" filter="url(#bs-agua)">${E.aguas.map((p) => `<polygon points="${pts(p)}"/>`).join('')}</g>`
  + `<g class="bs-caminos" filter="url(#bs-relieve)">${E.caminos.map((c) => `<polyline points="${pts(c.p)}" stroke-width="${c.w}"/>`).join('')}</g></g>`;
const [TI0, TI1, TI2, TI3] = TIERRA, [RN0, RN1, RN2, RN3] = RECUADRO_NIAGARA;
/* El fondo: la tierra, el entorno del sector principal y el recuadro de Niágara con el suyo. Va UNA vez y no se toca. */
const FONDO = `<rect class="bs-tierra" x="${TI0}" y="${TI1}" width="${TI2 - TI0}" height="${TI3 - TI1}" filter="url(#bs-terreno)"/>`
  + fondoHTML(ENTORNO)
  + `<g class="bs-recuadro"><rect class="bs-recuadro-fondo" x="${RN0}" y="${RN1}" width="${RN2 - RN0}" height="${RN3 - RN1}" rx="10" filter="url(#bs-terreno)"/>`
  + fondoHTML(ENTORNO.recuadro, ' clip-path="url(#bs-recorte-niagara)"')
  + `<rect class="bs-recuadro-marco" x="${RN0}" y="${RN1}" width="${RN2 - RN0}" height="${RN3 - RN1}" rx="10"/></g>`;

const lado = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** Lo que se lee de una piscina: su número y, al acercarse, su peso. El tamaño, el que cabe en su ancho y su alto; si no
    hay alto para dos líneas (las nueve de Roche son anchas y bajas), número y peso van en UNA. */
function piscinaHTML(z, p) {
  const [mx, my] = centro(p.poly);
  const ancho = Math.min(lado(p.poly[0], p.poly[1]), lado(p.poly[3], p.poly[2]));
  const alto = Math.min(lado(p.poly[0], p.poly[3]), lado(p.poly[1], p.poly[2]));
  const clase = !p.nombre ? 'sn' : p.dato ? claseDeFase(p.dato.fase) : 'sin';
  const peso = p.dato && n1(p.dato.peso) ? n1(p.dato.peso) + ' g' : '';
  const etiqueta = p.nombre ? 'Piscina ' + p.nombre + (p.dato ? ' · ' + (p.dato.fase || 'sin fase') + (peso ? ' · ' + peso : '') : ' · sin datos en el último corte')
    : 'Piscina sin nombre de ' + z.nombre;
  const tam = Math.max(11, Math.min(18, ancho * .3, alto * .48));
  const unaLinea = alto < tam * 2.4;
  const x = mx.toFixed(1), num = esc(p.nombre || 's/n');
  const textos = !peso ? `<text class="bs-num" x="${x}" y="${(my + tam * .35).toFixed(1)}" font-size="${tam}">${num}</text>`
    : unaLinea ? `<text x="${x}" y="${(my + tam * .35).toFixed(1)}" font-size="${tam}"><tspan class="bs-num">${num}</tspan><tspan class="bs-peso" dx="${(tam * .45).toFixed(1)}" font-size="${(tam * .8).toFixed(1)}">${esc(peso)}</tspan></text>`
      : `<text class="bs-num" x="${x}" y="${(my - tam * .35).toFixed(1)}" font-size="${tam}">${num}</text>`
        + `<text class="bs-peso" x="${x}" y="${(my + tam * .95).toFixed(1)}" font-size="${(tam * .8).toFixed(1)}">${esc(peso)}</text>`;
  return `<g class="bs-pisc bs-c-${clase}" data-piscina="${esc(p.id)}" data-etiqueta="${esc(etiqueta)}">`
    + `<polygon class="bs-agua" points="${pts(p.poly)}"/>` + textos + '</g>';
}
/** Una zona: su contorno (lo que se toca en la vista general), los bordos en relieve, el agua hundida y los rótulos. */
function zonaHTML(z) {
  const titulo = z.nombre + (z.aparte ? ' · otro sector' : '') + ' · ' + z.piscinas.length + ' piscinas · ' + z.conDatos + ' con datos';
  const rotulo = z.rotulo;
  return `<g class="bs-zona${z.aparte ? ' aparte' : ''}" data-zona="${esc(z.id)}" data-titulo="${esc(titulo)}">`
    + `<polygon class="bs-zona-marco" points="${pts(z.contorno)}"/>`
    + `<g class="bs-bordos" filter="url(#bs-relieve)">${z.piscinas.map((p) => `<polygon points="${pts(p.bordo)}"/>`).join('')}</g>`
    + `<g class="bs-piscinas" filter="url(#bs-hundido)">${z.piscinas.map((p) => piscinaHTML(z, p)).join('')}</g>`
    + `<text class="bs-zona-nombre" x="${rotulo[0]}" y="${rotulo[1]}">${esc(z.nombre + (z.aparte ? ' · otro sector' : ''))}</text>`
    + '</g>';
}

const MARCO = `
<div class="bs">
  <div class="bs-cab">
    <div><h2>🦐 Broodstock · piscinas</h2><p class="bs-sub" data-r="sub">Cargando datos de Broodstock…</p></div>
    <ul class="bs-leyenda">${FASES.map(([f, c]) => `<li><i class="bs-c-${c}"></i>${esc(f)}</li>`).join('')}<li><i class="bs-c-sin"></i>Sin datos en el último corte (seca)</li><li><i class="bs-c-sn"></i>Sin nombre aún</li></ul>
  </div>
  <div class="bs-nav" data-r="nav" hidden><button type="button" data-accion="general">← Todas las zonas</button><strong data-r="zona"></strong></div>
  <div class="bs-cuerpo">
    <div class="bs-mapa"><svg class="bs-svg" data-r="svg" role="group" aria-label="Mapa de las piscinas de Broodstock"></svg></div>
    <aside class="bs-ficha" data-r="ficha"><p class="bs-ayuda">Toca una zona para acercarte a sus piscinas, y una piscina para ver su ficha.</p></aside>
  </div>
  <div class="bs-aparte" data-r="aparte" hidden></div>
  <p class="bs-datos mono" data-r="datos"></p>
</div>`;

/** Monta el modo en `caja`. */
export function montarBroodstock(caja, opciones = {}) {
  const calcular = opciones.calcular || calcularDesdeElLibro;
  caja.innerHTML = MARCO;
  const $ = (r) => caja.querySelector('[data-r="' + r + '"]');
  const svg = $('svg');
  let D = null, ficha = () => null, zonaElegida = null, piscinaElegida = null, mesFoto = null;

  const viewBox = (c) => `${c[0]} ${c[1]} ${c[2] - c[0]} ${c[3] - c[1]}`;
  /** El SVG entero, con los datos de ahora. Sólo al llegar datos nuevos. */
  function construirMapa() {
    svg.innerHTML = DEFS + FONDO + D.zonas.map(zonaHTML).join('');
  }
  /** El encuadre, las clases y los roles de la vista elegida. No reconstruye nada: el foco se queda donde estaba. */
  function ajustarVista() {
    const z0 = zonaElegida && D.zonas.find((z) => z.id === zonaElegida);
    svg.setAttribute('viewBox', viewBox(z0 ? z0.caja : CAJA_GENERAL));
    svg.classList.toggle('general', !z0);
    svg.querySelectorAll('[data-zona]').forEach((g) => {
      const elegida = !!z0 && g.dataset.zona === z0.id;
      g.classList.toggle('elegida', elegida);
      g.classList.toggle('ajena', !!z0 && !elegida);
      // en la vista general, el botón es la ZONA; al acercarse, cada PISCINA de la elegida (nunca uno dentro de otro)
      if (!z0) { g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-label', g.dataset.titulo); g.removeAttribute('aria-hidden'); }
      else { g.removeAttribute('role'); g.removeAttribute('tabindex'); g.removeAttribute('aria-label'); if (elegida) g.removeAttribute('aria-hidden'); else g.setAttribute('aria-hidden', 'true'); }
      g.querySelectorAll('[data-piscina]').forEach((p) => {
        p.classList.toggle('on', elegida && p.dataset.piscina === piscinaElegida);
        if (elegida) { p.setAttribute('role', 'button'); p.setAttribute('tabindex', '0'); p.setAttribute('aria-label', p.dataset.etiqueta); p.setAttribute('aria-pressed', String(p.dataset.piscina === piscinaElegida)); }
        else { ['role', 'tabindex', 'aria-label', 'aria-pressed'].forEach((a) => p.removeAttribute(a)); }
      });
    });
    $('nav').hidden = !z0;
    $('zona').textContent = z0 ? z0.nombre + (z0.aparte ? ' · otro sector' : '') : '';
  }

  function pintarFicha() {
    const el = $('ficha');
    const z = D && D.zonas.find((x) => x.piscinas.some((p) => p.id === piscinaElegida));
    const p = z && z.piscinas.find((x) => x.id === piscinaElegida);
    if (!p) { el.innerHTML = '<p class="bs-ayuda">' + (zonaElegida ? 'Toca una piscina para ver su ficha.' : 'Toca una zona para acercarte a sus piscinas, y una piscina para ver su ficha.') + '</p>'; return; }
    if (!p.nombre) { el.innerHTML = `<h3>Sin nombre · ${esc(z.nombre)}</h3><p class="bs-ayuda">Esta piscina aún no tiene número: cuando lo tenga, se enlazará con sus datos de Broodstock.</p>`; return; }
    if (!p.dato) { el.innerHTML = `<h3>Piscina ${esc(p.nombre)} · ${esc(z.nombre)}</h3><p class="bs-ayuda">No vino en el último corte${D.corte ? ' (' + esc(fechaIso(D.corte)) + ')' : ''}: no hay datos que enseñar.</p>`; return; }
    const P = p.dato, F = ficha(p.nombre);
    const fila = (k, v) => (v === '' || v === null || v === undefined ? '' : `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`);
    const sobrev = n1(P.sobrevivencia) ? n1(P.sobrevivencia) + ' %' + (P.sobrevivenciaDudosa ? ' (⚠ revisar: así vino en la hoja)' : '') : '';
    const dias = [['precría', P.dias && P.dias.precria], ['engorde', P.dias && P.dias.engorde], ['pre-reproductor', P.dias && P.dias.prerreproductor]]
      .filter(([, v]) => n0(v)).map(([k, v]) => n0(v) + ' en ' + k).join(' · ');
    const d = P.desempeno;
    const serie = F ? F.serie.filter((s) => n1(s.peso)) : [];
    el.innerHTML = `<h3>Piscina ${esc(p.nombre)} · ${esc(z.nombre)}</h3>`
      + `<p class="bs-fase"><i class="bs-c-${claseDeFase(P.fase)}"></i>${esc(P.fase || 'Sin fase')}${P.faseEnCatalogo ? '' : ' (fuera del catálogo: así vino en la hoja)'} · corte del ${esc(fechaIso(P.corte))}</p>`
      + '<dl>'
      + fila('Peso actual', n1(P.peso) ? n1(P.peso) + ' g' + (P.fechaPeso ? ' (' + fechaIso(P.fechaPeso) + ')' : '') : '')
      + fila('Incremento última semana', n1(P.incremento) ? n1(P.incremento) + ' g' : '')
      + fila('Crecimiento de la fase', n1(P.crecimiento) ? n1(P.crecimiento) + ' g/sem' : '')
      + fila('Sobrevivencia estimada', sobrev)
      + fila('Densidad', n1(P.densidad) ? n1(P.densidad) + ' cam/m²' : '')
      + fila('Área', n1(P.area) ? n1(P.area) + ' ha' : '')
      + fila('Siembra', [fechaIso(P.fechaSiembra), n0(P.sembrada) && n0(P.sembrada) + ' animales', n1(P.pesoSiembra) && n1(P.pesoSiembra) + ' g', n0(P.plg) && n0(P.plg) + ' PL/g'].filter(Boolean).join(' · '))
      + fila('Edad', n0(P.edad) ? n0(P.edad) + ' días' + (dias ? ' (' + dias + ')' : '') : dias)
      + fila('Código genético', P.codigo)
      + fila('Camaronera de origen', P.camaronera)
      + fila('Piscina de origen', P.piscinaOrigen)
      + fila('Observación', P.observacion)
      + '</dl>'
      + (d ? '<h4>Como origen de lotes de Maduración</h4><dl>'
        + fila('Lotes', (P.lotes || []).join(', ') || 'ninguno')
        + fila('Ingresados', n0(d.ingresados)) + fila('Vivos', n0(d.vivos))
        + fila('Supervivencia', n1(d.supervivencia) ? n1(d.supervivencia) + ' %' : '')
        + fila('Desoves', n0(d.desoves) + (d.compartido ? ' (con lotes de dos piscinas)' : ''))
        + fila('Fertilidad', n1(d.fertilidad) ? n1(d.fertilidad) + ' %' : '')
        + fila('Nauplios por hembra', n0(d.naupliosPorHembra))
        + '</dl>' : '')
      + curvaHTML(serie)
      + (F && F.observaciones.length ? '<h4>Observaciones</h4><ul class="bs-obs">' + F.observaciones.map((o) => `<li><b>${esc(fechaIso(o.corte))}</b> ${esc(o.texto)}</li>`).join('') + '</ul>' : '');
  }

  /** `mapa`: reconstruir el SVG (datos nuevos); si no, sólo el encuadre, las clases y la ficha. */
  function pintar({ mapa = false } = {}) {
    if (!D) return;
    if (mapa) construirMapa();
    ajustarVista(); pintarFicha();
    const z = zonaElegida && D.zonas.find((x) => x.id === zonaElegida);
    $('sub').textContent = (D.corte ? 'Último corte: ' + fechaIso(D.corte) : 'Aún no hay ningún corte de Broodstock cargado')
      + (mesFoto ? ' · foto al cierre de ' + mesFoto : '')
      + (z ? ' · ' + z.nombre + ': ' + z.conDatos + ' de ' + z.piscinas.length + ' piscinas con datos' : '');
    const partes = [];
    if (D.fuera.length) partes.push('<p><b>Fuera del mapa</b> (vinieron en el corte, pero no están en el plano): ' + D.fuera.map(esc).join(', ') + '</p>');
    if (D.ausentes.length) partes.push('<p><b>No vinieron en el último corte</b> (sí en el anterior): ' + D.ausentes.map(esc).join(', ') + '</p>');
    $('aparte').innerHTML = partes.join('');
    $('aparte').hidden = !partes.length;
  }

  /* Al acercarse, el foco pasa a la primera piscina de la zona; al volver a la general, a la zona que se dejó. Así quien
     usa el teclado sigue donde estaba (hallazgo 3 de la Sesión A). */
  const enfocar = (sel) => { const el = svg.querySelector(sel); if (el && el.focus) el.focus(); };
  const elegirZona = (id) => {
    const dejada = zonaElegida;
    zonaElegida = id; piscinaElegida = null; pintar();
    if (id) enfocar('[data-zona="' + id + '"] [data-piscina]');
    else if (dejada) enfocar('[data-zona="' + dejada + '"]');
  };
  caja.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="general"]')) { elegirZona(null); return; }
    if (!D) return;
    const p = e.target.closest('[data-piscina]');
    if (zonaElegida) {
      // al acercarse sólo cuentan las piscinas de la zona elegida (las vecinas se ven, atenuadas, y no se tocan)
      if (p && p.closest('[data-zona]').dataset.zona === zonaElegida) { piscinaElegida = p.dataset.piscina; pintar(); }
      return;
    }
    const z = e.target.closest('[data-zona]');
    if (z) elegirZona(z.dataset.zona);
  });
  caja.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const b = e.target.closest('[role="button"][data-piscina], [role="button"][data-zona]');
    if (!b || !svg.contains(b)) return;
    e.preventDefault(); b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  return {
    pintarEstado(E) {
      if (!E) { $('sub').textContent = 'Cargando datos de Broodstock…'; return []; }
      const C = calcular(E);
      D = datosDelMapa(C.T); ficha = C.ficha; mesFoto = E.mes ? E.mes.mes : null;
      pintar({ mapa: true });
      return [];
    },
    aviso: (texto) => { $('datos').textContent = texto || ''; },
    alElegirMes: () => {},   // el mes se elige en Maqueta y Análisis; aquí llega en `E.mes`
  };
}

/** La curva de peso de la piscina por cortes (SVG en línea). Con un solo corte, lo dice: la curva necesita dos. */
function curvaHTML(serie) {
  if (!serie.length) return '';
  if (serie.length < 2) return '<h4>Curva de peso</h4><p class="bs-ayuda">Un solo corte: la curva sale con dos o más.</p>';
  const W = 280, H = 90, m = 8, ps = serie.map((s) => +s.peso);
  const lo = Math.min(...ps), hi = Math.max(...ps), rango = hi - lo || 1;
  const pts2 = serie.map((s, i) => [m + i * (W - 2 * m) / (serie.length - 1), H - m - (+s.peso - lo) / rango * (H - 2 * m)]);
  return '<h4>Curva de peso</h4>'
    + `<svg class="bs-curva" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc('Peso por corte: ' + serie.map((s) => fechaIso(s.corte) + ' ' + n1(s.peso) + ' g').join(', '))}">`
    + `<polyline points="${pts2.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ')}"/>`
    + pts2.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`).join('')
    + `<text x="${m}" y="${H - 1}">${esc(fechaIso(serie[0].corte))}</text><text x="${W - m}" y="${H - 1}" text-anchor="end">${esc(fechaIso(serie[serie.length - 1].corte))}</text>`
    + '</svg>';
}
