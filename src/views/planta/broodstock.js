/* ============================================================
   PLANTA · el modo «🦐 Broodstock» (M3, 2026-10-27, usuario): un MAPA 2D, tipo tablero, de las piscinas de Broodstock
   —donde crecen los reproductores antes de entrar a Maduración— con lo que trae su hoja.

   Diseño aprobado por el usuario: un esquema 2D (no la foto de satélite: el repo es público y es de Google) con una
   VISTA GENERAL de las tres zonas; al tocar una, el mapa se acerca a sus piscinas («← Todas las zonas» vuelve); al
   tocar una piscina, su FICHA. Cada piscina, con su número y su peso, pintada POR FASE (Precría, Engorde,
   Pre-reproductor), en gris si no vino en el último corte y con borde discontinuo si aún no tiene nombre. La geometría y
   la numeración son de `piscinas.js`.

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
import { ZONAS, CAJA_GENERAL, zonaDePiscina, nombreDePiscina } from './piscinas.js';

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

const MARCO = `
<div class="bs">
  <div class="bs-cab">
    <div><h2>🦐 Broodstock · piscinas</h2><p class="bs-sub" data-r="sub">Cargando datos de Broodstock…</p></div>
    <ul class="bs-leyenda">${FASES.map(([f, c]) => `<li><i class="bs-c-${c}"></i>${esc(f)}</li>`).join('')}<li><i class="bs-c-sin"></i>Sin datos en el último corte</li><li><i class="bs-c-sn"></i>Sin nombre aún</li></ul>
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
  function pintarMapa() {
    const z0 = zonaElegida && D.zonas.find((z) => z.id === zonaElegida);
    svg.setAttribute('viewBox', viewBox(z0 ? z0.caja : CAJA_GENERAL));
    svg.classList.toggle('general', !z0);
    // con una zona elegida, sólo ella: el SVG conserva su proporción y, si no, asomaban trozos de la zona de al lado
    svg.innerHTML = D.zonas.filter((z) => !z0 || z === z0).map((z) => {
      const [x0, y0, x1, y1] = z.caja;
      const titulo = z.nombre + (z.aparte ? ' · otro sector' : '') + ' · ' + z.piscinas.length + ' piscinas · ' + z.conDatos + ' con datos';
      const piscinas = z.piscinas.map((p) => {
        const [a, b, c, d] = p.rect, w = c - a, h = d - b, mx = a + w / 2, my = b + h / 2;
        const clase = !p.nombre ? 'sn' : p.dato ? claseDeFase(p.dato.fase) : 'sin';
        const peso = p.dato && n1(p.dato.peso) ? n1(p.dato.peso) + ' g' : '';
        const etiqueta = p.nombre ? 'Piscina ' + p.nombre + (p.dato ? ' · ' + (p.dato.fase || 'sin fase') + (peso ? ' · ' + peso : '') : ' · sin datos en el último corte')
          : 'Piscina sin nombre de ' + z.nombre;
        const tam = Math.max(9, Math.min(16, w * .32));   // el número cabe en la más estrecha
        return `<g class="bs-pisc bs-c-${clase}${p.id === piscinaElegida ? ' on' : ''}" data-piscina="${esc(p.id)}" tabindex="${z0 ? 0 : -1}" role="button" aria-label="${esc(etiqueta)}">`
          + `<rect x="${a}" y="${b}" width="${w}" height="${h}" rx="3"/>`
          + `<text class="bs-num" x="${mx}" y="${my - (peso ? tam * .35 : -tam * .35)}" font-size="${tam}">${esc(p.nombre || 's/n')}</text>`
          + (peso ? `<text class="bs-peso" x="${mx}" y="${my + tam * .95}" font-size="${tam * .8}">${esc(peso)}</text>` : '')
          + '</g>';
      }).join('');
      return `<g class="bs-zona${z.aparte ? ' aparte' : ''}" data-zona="${esc(z.id)}" tabindex="${z0 ? -1 : 0}" role="button" aria-label="${esc(titulo)}">`
        + `<rect class="bs-zona-marco" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="10"/>`
        + `<text class="bs-zona-nombre" x="${x0 + 10}" y="${y0 - 6}">${esc(titulo)}</text>${piscinas}</g>`;
    }).join('');
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

  function pintar() {
    if (!D) return;
    pintarMapa(); pintarFicha();
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

  const elegirZona = (id) => { zonaElegida = id; piscinaElegida = null; pintar(); };
  caja.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="general"]')) { elegirZona(null); return; }
    if (!D) return;
    const p = e.target.closest('[data-piscina]');
    if (zonaElegida && p) { piscinaElegida = p.dataset.piscina; pintar(); return; }
    const z = e.target.closest('[data-zona]');
    if (!zonaElegida && z) elegirZona(z.dataset.zona);
  });
  caja.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const b = e.target.closest('[data-piscina], [data-zona]');
    if (!b || !svg.contains(b)) return;
    e.preventDefault(); b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  return {
    pintarEstado(E) {
      if (!E) { $('sub').textContent = 'Cargando datos de Broodstock…'; return []; }
      const C = calcular(E);
      D = datosDelMapa(C.T); ficha = C.ficha; mesFoto = E.mes ? E.mes.mes : null;
      pintar();
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
  const pts = serie.map((s, i) => [m + i * (W - 2 * m) / (serie.length - 1), H - m - (+s.peso - lo) / rango * (H - 2 * m)]);
  return '<h4>Curva de peso</h4>'
    + `<svg class="bs-curva" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc('Peso por corte: ' + serie.map((s) => fechaIso(s.corte) + ' ' + n1(s.peso) + ' g').join(', '))}">`
    + `<polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ')}"/>`
    + pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`).join('')
    + `<text x="${m}" y="${H - 1}">${esc(fechaIso(serie[0].corte))}</text><text x="${W - m}" y="${H - 1}" text-anchor="end">${esc(fechaIso(serie[serie.length - 1].corte))}</text>`
    + '</svg>';
}
