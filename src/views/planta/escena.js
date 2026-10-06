/* ============================================================
   PLANTA · ESCENA 3D DEL LABORATORIO (vista 🏭 Planta, rol Gerencia)
   Maqueta navegable del Laboratorio Mar Bravo: los 10 módulos de larvicultura y las 5 salas de
   maduración a escala desde el plano (planta/plano.js), en su entorno real —playa y mar al
   frente; canal de salida, dique y piscina de sal atrás—, con día, tarde y noche.
   Origen: la maqueta publicada como artefacto (2026-10-04), traída tal cual con el mismo three.js
   (0.128.0) para que se vea igual que la que se validó; sólo cambia lo que exige vivir dentro de
   la app: las búsquedas se limitan a su contenedor y la escena se libera sola (dispose) cuando la
   vista sale del documento, porque el router no avisa al cambiar de vista.
   Tanda 2 (2026-10-04): pinta el ESTADO de producción de cada tanque de larvicultura que le pasa
   planta/estado.js (color de su etapa, vacío, despachado, agrupado o desinfección; baliza roja si
   está en alerta), con rótulos, tooltip y ficha de producción. Sin medidas (decisión del usuario).
   Tanda 3 (2026-10-04): maduración con el modo «Estado» del mapa de salas (Producción, Cuarentena, Mixto,
   Vacío), reproductores sólo en los tanques ocupados, baliza en el tanque con H:M o densidad fuera de rango y en
   la sala con temperatura u oxígeno fuera de rango (últimos 7 días), y fichas de sala y de tanque.
   Tanda 4 (2026-10-04): la tarjeta «Producción del mes» frente a la meta (planta/cifras.js), con la meta editable (⚙)
   y guardada en el equipo, y la ocupación en las fichas de cifras.
   «Qué atender hoy» (2026-10-04): las alertas que ya marcan las balizas, agrupadas por módulo o sala; tocar un tanque
   lleva la cámara a él y abre su ficha.
   Ahorro de batería (2026-10-04, usuario): tras 5 s sin tocarla la maqueta sigue animada a ~15 cuadros por segundo
   y vuelve a ~60 al tocarla o al moverse la cámara; fuera de pantalla no se dibuja.
   Sombras más baratas (2026-10-05, usuario, velocidad · 1): mapa de 2048 con borde normal (no suave), recalculado sólo
   cuando cambia algo que las proyecta; personas, técnicos y autos sin sombra. Medido: las sombras eran el mayor coste
   de la tarjeta gráfica (sin ellas, el giro pasaba de ~21 a ~38 cuadros por segundo).
   Selector de mes (2026-10-04, usuario): ◀ ▶ y un deslizador como la tabla Producción Omarsa, que mueven TODA la vista:
   en un mes pasado, la maqueta con las corridas de ese mes y maduración a su cierre, y las alertas «al cierre de <mes>».
   Reflejos del cielo (2026-10-04, usuario, opción A): un mapa de entorno generado del propio cielo (PMREM), uno por hora
   del día y guardado; en toda la maqueta, tenue en el agua de los tanques para que se siga leyendo la etapa. Desde el
   2026-10-05 (usuario, velocidad · 3), sólo en el agua: tanques, mar, canal y piscina de sal (ver «Reflejos del cielo» abajo).
   Pantalla completa (2026-10-05, usuario, punto 3): ⛶ junto a las vistas pone la maqueta en pantalla completa con un
   resumen flotante (mes, producción frente a la meta y alertas); sale con el mismo botón o Esc. Donde el navegador no
   la permite (iPhone), la maqueta se expande dentro de la página y el gesto de volver también la cierra.
   Orilla viva (2026-10-05, usuario, opción L): la espuma rompe en la orilla, sube por la arena húmeda y se retira (dos
   lenguas desfasadas), y el sol destella en el mar de día y de tarde (apagado de noche).
   Personal donde hay trabajo (2026-10-05, usuario, opción K): con el mes en curso, un técnico de chaleco naranja junto a
   cada tanque en alerta, tres en cada despacho (junto al camión) y uno recorriendo cada módulo con cultivo; quien camina
   por dentro de un módulo vacío desaparece.
   Luces de noche según el estado (2026-10-05, usuario, opción J): las lámparas de cada módulo y sala se encienden según su
   estado (cultivo o reproductores: encendidas; desinfección: a media luz; vacío o despachado: apagadas), con un resplandor
   cálido suave encima de los encendidos.
   Camión de despacho (2026-10-05, usuario, opción I): un camión con tinas junto a cada módulo que se está despachando
   (tanques despachados y otros en cultivo), sólo con el mes en curso; en la capa de vehículos.
   Detalle del tanque (2026-10-05, usuario, opción H): remate de hormigón en el borde de todos los tanques y mangueras de
   aireación en el fondo (dos líneas en los rectangulares, un anillo en los circulares).
   Cerco y portón (2026-10-05, usuario, opción G): pilares cada 3 m y concertina sobre el cerramiento, portón corredizo de
   reja abierto junto a la pluma (corrido por el lado de la calle), y la garita de guardianía adentro, en el borde este de la calle interior (donde la rotula
   el plano; la calle queda de un carril en ese tramo).
   Otras áreas (2026-10-04, usuario, opción F): cada área con su nombre del plano (globo al pasar o tocar) y su forma:
   cuarto de máquinas con sopladores y chimeneas, generador diésel con tanque y escape, filtros Turbidex y tanques elevados,
   laboratorio y administración con alero de ingreso y aire acondicionado, comedor con portones y chimenea, canal abierto.
   Fachadas (2026-10-04, usuario, opción E): los invernaderos cierran sus dos culatas con lámina, con marco y puerta
   corrediza; las salas suman puerta metálica al frente, columnas y zócalo. Todo en mallas de instancias.
   Sol y luna reales (2026-10-04, usuario, opción C): Día, Tarde y Noche ponen el sol (o la luna) donde están hoy en Mar
   Bravo a las 10:00, 17:30 y 21:00, orientados con el norte de la brújula.
   Texturas de superficie (2026-10-04, usuario, opción B): hormigón con juntas, humedad, desgaste y fisuras; zinc ondulado
   con canaleta y óxido; asfalto con grietas, parches y huellas de rodadura; arena con ondas de viento; bloques con mortero
   y salpicaduras al pie. Relieve (mapa de normales) sólo en el zinc y en las juntas del hormigón.
   Rótulos sin encimarse (2026-10-04, usuario): de lejos y en pantallas angostas se acortan («7 ⚠6»); si aún chocan,
   se oculta el de menor prioridad (el elegido, luego el de más alertas, luego larvicultura) hasta que se acerque o gire.
   Reemplazo por tiempo (2026-10-04): los días en producción de cada lote frente a los 60; el que pasa va a «Qué atender
   hoy» y sus salas llevan ⏳ en el rótulo.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LARV, LARV_H, MAT, OTHERS, SITE, C0, STREET, tanquesDeSala } from './plano.js';
import { STAGE_CATS } from '../supervisor/etapas.js';
import { fmtPop } from '../../core/format.js';
import { fmtShort } from '../../core/dates.js';
import { META_POR_DEFECTO, normalizarMeta } from './cifras.js';

/** Monta la maqueta en `root` (que ya trae el marcado de planta/index.js).
 *  Devuelve { dispose, pintarEstado(estado|null), aviso(texto), alElegirMes(fn(mIdx, esUltimo)) }. */
export function montarPlanta(root) {
const $ = s => root.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (v, d = 2) => v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a, b) => a + rnd() * (b - a);

/* ---------- Tanques ---------- */
const groups = [], tanks = [];
LARV.forEach(m => {
  const g = { id: m.id, kind: 'larv', name: 'Módulo ' + m.n, short: 'M' + m.n, box: m.box, H: LARV_H, ridge: m.ridge, canals: m.canals || [], tanks: [], desove: [] };
  m.rows.forEach((z, r) => m.cols.forEach((x, c) => { const t = { g, num: m.num(r, c), type: 'rect', cx: x + m.L / 2, cz: z + m.W / 2, L: m.L + .3, W: m.W + .3, H: LARV_H, real: m.real, c }; t.vol = m.real[0] * m.real[1] * LARV_H; g.tanks.push(t); tanks.push(t); }));
  groups.push(g);
});
MAT.forEach(m => {
  const g = { id: m.id, kind: 'mat', sala: m.sala, name: 'Maduración ' + m.n, short: 'S' + m.n, box: m.box, H: 3.2, tanks: [], desove: [], partition: m.partition };
  if (m.circ) {
    const k = m.circ; k.zs.forEach((z, r) => k.xs.forEach((x, c) => { const t = { g, num: k.num(r, c), type: 'circ', cx: x, cz: z, r: k.d / 2, H: k.h, real: [k.d] }; t.vol = Math.PI * (k.d / 2) ** 2 * k.h; g.tanks.push(t); tanks.push(t); }));
    const d = m.desove; d.zs.forEach((z, r) => d.xs.forEach((x, c) => { const t = { g, num: d.num(r, c), type: 'circ', desove: true, cx: x, cz: z, r: d.d / 2, H: d.h, real: [d.d] }; t.vol = Math.PI * (d.d / 2) ** 2 * d.h; g.desove.push(t); tanks.push(t); }));
  } else {
    tanquesDeSala(m).forEach(({ x, z, num }) => { const t = { g, num, type: 'rect', cx: x + m.L / 2, cz: z + m.W / 2, L: m.L + .3, W: m.W + .3, H: m.h, real: m.real }; t.vol = m.real[0] * m.real[1] * m.h; g.tanks.push(t); tanks.push(t); });
    g.assumed = m.assumed; g.tankH = m.h;
  }
  groups.push(g);
});
groups.forEach(g => { g.vol = g.tanks.reduce((s, t) => s + t.vol, 0); const nums = g.tanks.map(t => t.num); g.range = Math.min(...nums) + '–' + Math.max(...nums); g.cx = (g.box[0] + g.box[2]) / 2; g.cz = (g.box[1] + g.box[3]) / 2; g.roof = new THREE.Group(); });

/* ---------- Renderizador, cámara y luz ---------- */
const vp = $('#vp'), canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const DPR_MAX = Math.min(devicePixelRatio || 1, 2), DPR_MIN = Math.min(DPR_MAX, 1.25);
renderer.setPixelRatio(DPR_MAX);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
// sombras: se recalculan sólo cuando cambia algo que las proyecta (hora del día, techo del módulo elegido, capas, datos);
// lo que se mueve (personas, técnicos, autos) no proyecta sombra
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, .5, 4000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI * .47; controls.minDistance = 8; controls.maxDistance = 420; controls.screenSpacePanning = false;
const col = hx => new THREE.Color(hx).convertSRGBToLinear();
const hemi = new THREE.HemisphereLight(0xeaf2f4, 0x9a917e, .75); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e2, 1.25); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -112, right: 112, top: 78, bottom: -78, near: 10, far: 500 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
scene.add(sun, sun.target);
const P = (x, z) => [x - C0[0], z - C0[1]];

/* ---------- Texturas generadas en el navegador ---------- */
function canvasTex(size, draw, opts) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (!(opts && opts.linear)) t.encoding = THREE.sRGBEncoding; return t;
}
function grain(g, n, base, spread, amount, size) { // ruido y motas sobre un color base
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (let i = 0; i < amount; i++) { const v = Math.floor(R(-spread, spread)); g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`; const s = R(.6, size); g.fillRect(R(0, n), R(0, n), s, s); }
}
function blotches(g, n, colors, count, rmin, rmax) { for (let i = 0; i < count; i++) { const x0 = R(0, n), y0 = R(0, n), r = R(rmin, rmax), c = colors[Math.floor(R(0, colors.length))];
  for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { const x = x0 + ox, y = y0 + oy; if (x + r < 0 || y + r < 0 || x - r > n || y - r > n) continue; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } } }
function fisuras(g, n, cuantas, color, ancho) { // líneas quebradas finas (grietas), repetibles en los bordes
  g.strokeStyle = color; g.lineWidth = ancho; g.lineCap = 'round';
  for (let i = 0; i < cuantas; i++) {
    let x = R(0, n), y = R(0, n), a = R(0, 6.28); const pasos = Math.floor(R(4, 10)), pts = [[x, y]];
    for (let k = 0; k < pasos; k++) { a += R(-.7, .7); x += Math.cos(a) * R(6, 22); y += Math.sin(a) * R(6, 22); pts.push([x, y]); }
    // se dibuja también desplazada una baldosa a cada lado: la grieta que cruza el borde sigue en la baldosa vecina
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy))); g.stroke(); }
  }
}
/** Mapa de normales (lineal, repetible) de una altura h(x, y) en [0, n): el relieve que hace reaccionar a la luz el
 *  ondulado del zinc y las juntas del hormigón. Se dibuja una vez al montar (n² píxeles, n = 256). */
function normalDeAltura(n, h, fuerza) {
  const cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d'), img = g.createImageData(n, n);
  const H = (x, y) => h(((x % n) + n) % n, ((y % n) + n) % n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const nx = -(H(x + 1, y) - H(x - 1, y)) * fuerza, ny = (H(x, y + 1) - H(x, y - 1)) * fuerza, l = Math.hypot(nx, ny, 1), i = (y * n + x) * 4;
    img.data[i] = (nx / l * .5 + .5) * 255; img.data[i + 1] = (ny / l * .5 + .5) * 255; img.data[i + 2] = (1 / l * .5 + .5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const TX = {
  sand: canvasTex(1024, (g, n) => { grain(g, n, '#d9c9a3', 40, 9000, 2); blotches(g, n, ['rgba(160,140,95,.16)', 'rgba(240,226,190,.2)', 'rgba(120,120,70,.1)'], 30, 20, 70);
    // ondas de viento: crestas sinuosas, con su sombra debajo; ondas enteras a lo ancho y crestas a paso exacto a lo alto,
    // para que la baldosa repita sin corte
    for (let i = 0; i < 79; i++) { const y = 6 + i * n / 79, fase = R(0, 6.28), amp = R(2, 5);   // 79 crestas exactas: sin franja en el borde
      for (const [dy, c] of [[0, 'rgba(255,248,225,.18)'], [2, 'rgba(120,100,60,.12)']]) { g.strokeStyle = c; g.lineWidth = 1.4; g.beginPath();
        for (let x = 0; x <= n; x += 8) { const yy = y + dy + amp * Math.sin(x / n * 6.2832 * 4 + fase); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); } g.stroke(); } } }),
  concrete: canvasTex(1024, (g, n) => { grain(g, n, '#d9d6cf', 22, 7000, 1.6); blotches(g, n, ['rgba(150,145,135,.12)', 'rgba(255,255,255,.12)'], 25, 30, 110);
    blotches(g, n, ['rgba(105,110,108,.13)', 'rgba(120,118,100,.1)'], 9, 60, 170);    // humedad y desgaste
    fisuras(g, n, 7, 'rgba(80,78,72,.35)', 1.2);
    // juntas de dilatación: 2 paneles por baldosa, con la sombra de un lado y el canto claro del otro
    for (let k = 0; k <= n; k += n / 2) for (const [d, c, w] of [[0, 'rgba(70,70,66,.55)', 3], [3, 'rgba(255,255,255,.35)', 1.5]]) {
      g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(k + d, 0); g.lineTo(k + d, n); g.stroke(); g.beginPath(); g.moveTo(0, k + d); g.lineTo(n, k + d); g.stroke(); } }),
  asphalt: canvasTex(512, (g, n) => { grain(g, n, '#4b4f53', 30, 14000, 1.8); blotches(g, n, ['rgba(20,20,20,.25)', 'rgba(120,120,120,.12)'], 20, 30, 120);
    for (const v of [.3, .7]) { const gr = g.createLinearGradient(0, v * n - 22, 0, v * n + 22); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(15,15,15,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, v * n - 22, n, 44); }   // huellas de rodadura
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(30,32,34,.35)'; g.fillRect(R(0, n - 90), R(0, n - 60), R(40, 90), R(25, 60)); }   // parches
    blotches(g, n, ['rgba(10,10,12,.3)'], 6, 6, 16);   // manchas de aceite
    fisuras(g, n, 9, 'rgba(15,15,15,.55)', 1.3); }),
  gravel: canvasTex(1024, (g, n) => { grain(g, n, '#b3aa99', 60, 22000, 3); }),
  grass: canvasTex(512, (g, n) => { grain(g, n, '#7f9a4d', 50, 16000, 2); blotches(g, n, ['rgba(70,100,40,.35)', 'rgba(170,170,90,.3)'], 40, 15, 70); }),
  wallBlock: canvasTex(256, (g, n) => { grain(g, n, '#dcd6ca', 16, 3000, 1.5);
    for (const [d, c] of [[0, 'rgba(110,102,90,.45)'], [1.5, 'rgba(255,255,255,.3)']]) { g.strokeStyle = c; g.lineWidth = 1.5;
      for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + d); g.lineTo(n, y + d); g.stroke(); for (let x = (y / 32) % 2 ? 0 : 32; x < n; x += 64) { g.beginPath(); g.moveTo(x + d, y); g.lineTo(x + d, y + 32); g.stroke(); } } }
    const pie = g.createLinearGradient(0, n * .72, 0, n); pie.addColorStop(0, 'rgba(110,95,70,0)'); pie.addColorStop(1, 'rgba(110,95,70,.4)'); g.fillStyle = pie; g.fillRect(0, n * .72, n, n * .28);   // salpicadura y polvo al pie
    blotches(g, n, ['rgba(90,85,75,.12)'], 6, 10, 30); }),
  zinc: canvasTex(256, (g, n) => { const gr = g.createLinearGradient(0, 0, n, 0); for (let i = 0; i <= 64; i++) { const k = Math.sin(i / 64 * 6.2832 * 16); gr.addColorStop(i / 64, 'rgb(' + Math.round(186 + 18 * k) + ',' + Math.round(196 + 16 * k) + ',' + Math.round(202 + 14 * k) + ')'); } g.fillStyle = gr; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 10; i++) { const x = R(0, n), y = R(0, n * .6); const o = g.createLinearGradient(0, y, 0, y + R(40, 120)); o.addColorStop(0, 'rgba(150,90,50,.0)'); o.addColorStop(.3, 'rgba(150,90,50,.18)'); o.addColorStop(1, 'rgba(150,90,50,0)'); g.fillStyle = o; g.fillRect(x, y, R(2, 5), 120); }   // chorreaduras de óxido
    g.fillStyle = 'rgba(70,78,84,.55)'; g.fillRect(0, n - 9, n, 9); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, n - 10, n, 1.5); }),   // canaleta
  film: canvasTex(256, (g, n) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n); g.fillStyle = 'rgba(60,70,60,.22)'; for (let x = 0; x < n; x += 64) g.fillRect(x, 0, 30, n); g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < n; y += 64) g.fillRect(0, y, n, 3); }),
};
const TXN = {
  zinc: normalDeAltura(256, (x) => Math.sin(x / 256 * 6.2832 * 16) * 2.2, .9),
  // la junta es un surco de 2 px de cada lado de las líneas de la baldosa (0 y 128 de 256 = 0 y 512 de 1024)
  concrete: normalDeAltura(256, (x, y) => { const d = (v) => Math.min(v % 128, 128 - (v % 128)); return -Math.max(0, 2.5 - Math.min(d(x), d(y))); }, 1.1),
};
const repN = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };
function windowsTex(wallHex, lit) { // fachada con ventanas; de noche se usa como mapa de luz
  return canvasTex(256, (g, n) => {
    if (lit) { g.fillStyle = '#000'; g.fillRect(0, 0, n, n); } else { grain(g, n, wallHex, 14, 2500, 1.4); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, n - 10, n, 10); }
    for (let x = 18; x < n; x += 64) { g.fillStyle = lit ? (rnd() < .75 ? '#ffd28a' : '#2a2a2a') : '#5d7684'; g.fillRect(x, 70, 30, 46); if (!lit) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 2, 72, 10, 42); g.fillStyle = '#e9e4da'; g.fillRect(x - 2, 116, 34, 4); } }
  });
}
const waterNormal = (() => { // relieve de olas suaves y repetible
  const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d'), img = g.createImageData(n, n);
  const waves = Array.from({ length: 7 }, () => ({ kx: Math.round(R(-6, 6)) || 1, ky: Math.round(R(-6, 6)) || 2, a: R(.4, 1), p: R(0, 6.28) }));
  const h = (x, y) => waves.reduce((s, w) => s + w.a * Math.sin(2 * Math.PI * (w.kx * x + w.ky * y) / n + w.p), 0);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1); const nx = -dx * .9, ny = -dy * .9, nz = 1; const l = Math.hypot(nx, ny, nz); const i = (y * n + x) * 4; img.data[i] = (nx / l * .5 + .5) * 255; img.data[i + 1] = (ny / l * .5 + .5) * 255; img.data[i + 2] = (nz / l * .5 + .5) * 255; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();
const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };

/* ---------- Cielo con sol y estrellas ---------- */
const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top, mid, bot, sunDir, sunCol; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bot, pow(-h, 0.35)); float s = max(dot(normalize(vP), normalize(sunDir)), 0.0); c += sunCol * (pow(s, 900.0) * 1.6 + pow(s, 12.0) * 0.22); gl_FragColor = vec4(c, 1.0); }',
}));
scene.add(sky);
const stars = (() => { const n = 700, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const th = R(0, 6.28), ph = R(.08, 1.45), r = 1700; pos.set([r * Math.cos(ph) * Math.cos(th), r * Math.sin(ph), r * Math.cos(ph) * Math.sin(th)], i * 3); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .85 })); })();
stars.visible = false; scene.add(stars);
/* Reflejos del cielo: el entorno de los materiales se genera del MISMO cielo (otra malla con su material), así reflejan
   el degradado y el sol de la hora elegida. Cada uno se genera la primera vez que se elige su hora (unos ms) y queda
   guardado: volver a esa hora sólo lo cambia, nunca se rehace por cuadro. Desde el 2026-10-05 (usuario, velocidad · 3)
   sólo lo refleja el AGUA (AGUA: tanques, mar con su orilla baja, canal y piscina de sal): en el resto costaba ~+50 % de
   tarjeta gráfica y con sus acabados mates casi no se veía. Así la luz ambiente vuelve a ser entera (antes bajaba al 40 %
   porque el entorno también iluminaba) y la de la tarde toma el color del cielo crepuscular que antes reflejaban techos y
   películas. Medido (brillo medio de la vista general, de 255): día 173 → 172, tarde 110 → 110, noche 69 → 69; el mar,
   ~+8. El cielo pinta sus colores tal cual (toneMapped: false), así que su
   copia los recibe pasados a lineal: si no, el reflejo saldría más claro que el cielo que se ve. */
const pmrem = new THREE.PMREMGenerator(renderer);
const envSkyMat = sky.material.clone();
// el cielo de la pantalla escribe su color en crudo; dentro del mapa de entorno (codificado en RGBE) eso se lee como una
// intensidad enorme y el reflejo sale negro (medido): su copia lo codifica como cualquier material, con linearToOutputTexel
envSkyMat.fragmentShader = envSkyMat.fragmentShader.replace('gl_FragColor = vec4(c, 1.0);', 'gl_FragColor = linearToOutputTexel(vec4(c, 1.0));');
const envSky = new THREE.Mesh(sky.geometry, envSkyMat); const envScene = new THREE.Scene(); envScene.add(envSky);
const envRTs = {};
const ENV_AMBIENTE = 1, ENV_REFLEJO = .6;   // luz ambiente (entera: el entorno ya sólo lo refleja el agua) e intensidad de los reflejos
function generarEntorno(T) {
  const e = envSky.material.uniforms;
  e.top.value.set(T.sky[0]).convertSRGBToLinear(); e.mid.value.set(T.sky[1]).convertSRGBToLinear(); e.bot.value.set(T.sky[2]).convertSRGBToLinear();
  e.sunCol.value.set(T.skySun).convertSRGBToLinear(); e.sunDir.value.set(...T.sun).normalize();
  return pmrem.fromScene(envScene, 0.04, 1, 4000);
}

/* ---------- Materiales ---------- */
const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: .9, envMapIntensity: ENV_REFLEJO }, o));
const M = {
  sand: std({ map: rep(TX.sand, 90, 90), roughness: 1 }),
  site: std({ map: rep(TX.concrete, 30, 15), normalMap: repN(TXN.concrete, 30, 15), normalScale: new THREE.Vector2(.6, .6) }),
  asphalt: std({ map: rep(TX.asphalt, 40, 2) }),
  gravel: std({ map: rep(TX.gravel, 40, 2), roughness: 1 }),
  grass: std({ map: rep(TX.grass, 4, 4), roughness: 1 }),
  paint: std({ color: col('#f2f0e8') }), yellow: std({ color: col('#e8c34a') }),
  fence: std({ map: rep(TX.wallBlock, 40, 1) }),
  slabL: std({ map: rep(TX.concrete, 4, 4), color: col('#f2efe8'), normalMap: repN(TXN.concrete, 4, 4), normalScale: new THREE.Vector2(.6, .6) }),
  slabM: std({ map: rep(TX.concrete, 4, 4), color: col('#c8ccc6'), normalMap: repN(TXN.concrete, 4, 4), normalScale: new THREE.Vector2(.6, .6) }),
  wall: std({ map: rep(TX.wallBlock, 6, 1), roughness: .85 }),
  canal: std({ color: col('#4e5a5e'), roughness: .5 }),
  steel: std({ color: col('#a7b0b5'), roughness: .45, metalness: .5 }),
  film: std({ map: TX.film, color: col('#f7f8f2'), roughness: .5, transparent: true, opacity: .42, side: THREE.DoubleSide, depthWrite: false }),
  zinc: std({ map: rep(TX.zinc, 6, 1), roughness: .5, metalness: .4, normalMap: repN(TXN.zinc, 6, 1), normalScale: new THREE.Vector2(.7, .7) }),
  tankWall: std({ map: rep(TX.concrete, 1, 1), color: col('#f4f2ee'), roughness: .75 }),
  waterL: std({ color: 0xffffff, roughness: .08, metalness: .1, normalMap: waterNormal, normalScale: new THREE.Vector2(.35, .35), emissive: 0x000000, transparent: true, opacity: .62 }),
  waterM: std({ color: 0xffffff, roughness: .08, metalness: .1, normalMap: waterNormal, normalScale: new THREE.Vector2(.35, .35), emissive: 0x000000, transparent: true, opacity: .72 }),
  algae: std({ color: col('#4f9a35'), roughness: .1, metalness: .05, normalMap: waterNormal, normalScale: new THREE.Vector2(.3, .3) }),
  lid: std({ color: col('#7d8a8f'), roughness: .6, metalness: .3 }),
  pipe: std({ color: col('#e9e6dc'), roughness: .5 }),
  bubble: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: col('#ffd9a0'), emissiveIntensity: 0 }),
};
const WATER = { larv: col('#3f8f74'), mat: col('#2d6f8a'), desove: col('#3a6fa8'), hover: col('#f2a35f'), sel: col('#6fd2c1') };

const edgeMat = new THREE.LineBasicMaterial({ color: 0x1d2629, transparent: true, opacity: .34 });
function addEdges(m) { if (m.userData.edged) return; m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), edgeMat)); m.userData.edged = true; }
function box(x0, z0, x1, z1, y0, h, mat, cast, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), h, Math.abs(z1 - z0)), mat);
  const [x, z] = P((x0 + x1) / 2, (z0 + z1) / 2); m.position.set(x, y0 + h / 2, z); m.castShadow = !!cast; m.receiveShadow = true; (parent || scene).add(m);
  if (h >= .2 && Math.abs(x1 - x0) < 400 && !(Array.isArray(mat) ? mat[0] : mat).transparent) addEdges(m);
  return m;
}
function plane(x0, z0, x1, z1, y, mat, parent) { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat); m.rotation.x = -Math.PI / 2; const [x, z] = P((x0 + x1) / 2, (z0 + z1) / 2); m.position.set(x, y, z); m.receiveShadow = true; (parent || scene).add(m); return m; }

/* ---------- Terreno, calle, parqueadero y cerramiento ---------- */
{ const g = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), M.sand); g.rotation.x = -Math.PI / 2; g.position.y = -.03; g.receiveShadow = true; scene.add(g); }
plane(SITE[0], SITE[1], SITE[2], SITE[3], .01, M.site);
plane(-60, 89.4, 240, STREET[0] - 1.2, .015, M.gravel);                  // piedra 3/4 entre el cerramiento y la calle
plane(-60, STREET[0] - 1.2, 240, STREET[0], .03, M.paint);              // bordillo
plane(-60, STREET[0], 240, STREET[1], .02, M.asphalt);
for (let x = -58; x < 238; x += 7) plane(x, (STREET[0] + STREET[1]) / 2 - .08, x + 3.5, (STREET[0] + STREET[1]) / 2 + .08, .035, M.paint);
plane(-60, STREET[1], 240, STREET[1] + 1.4, .03, M.paint);
for (let x = 30; x < 64; x += 3.2) plane(x, 89.6, x + .12, 95.2, .03, M.paint);  // líneas de parqueo
// vías internas de evacuación
// la calle interior va a lo largo de z: la textura gira para que las huellas de rodadura sigan la calle
const roadM = std({ map: (() => { const t = rep(TX.asphalt, 12, 1); t.center.set(.5, .5); t.rotation = Math.PI / 2; return t; })(), roughness: .95 });
plane(72, 18.5, 77.6, 89.2, .02, roadM); plane(76, 75.2, 176, 78.6, .02, std({ map: rep(TX.asphalt, 16, 1), roughness: .95 }));
// cerramiento perimetral con ingreso
const fenceSegs = [[SITE[0], SITE[1], SITE[2], SITE[1] + .25], [SITE[0], SITE[1], SITE[0] + .25, SITE[3]], [SITE[2] - .25, SITE[1], SITE[2], SITE[3]], [SITE[0], SITE[3] - .25, 71.5, SITE[3]], [78.2, SITE[3] - .25, SITE[2], SITE[3]]];
fenceSegs.forEach(([a, b, c, d]) => box(a, b, c, d, 0, 2.4, M.fence, true));
box(71.5, 88.6, 71.9, 89.4, 0, 2.8, M.wall, true); box(77.8, 88.6, 78.2, 89.4, 0, 2.8, M.wall, true);
{ const bar = box(72, 89, 75.5, 89.15, 1, .1, std({ color: col('#d9473a') }), true); bar.rotation.y = 0; }
// césped y jardineras junto a oficinas

/* ---------- Entorno real: playa y mar al frente; canal de salida, dique y piscina de sal atrás ---------- */
const SHORE = 127, CH = [-26, -10], DIKE = [-37, -26];
const coast = new THREE.Group(); scene.add(coast);
plane(-1500, STREET[1] + 1.4, 1500, SHORE - 7, .012, std({ map: rep(TX.sand, 90, 2), color: col('#f3e7c8'), roughness: 1 }), coast);       // playa seca
plane(-1500, SHORE - 7, 1500, SHORE + 1, .014, std({ color: col('#b59f78'), roughness: .3, metalness: .05 }), coast);                       // arena húmeda
const seaNormal = waterNormal.clone(); seaNormal.needsUpdate = true; seaNormal.repeat.set(260, 70);
const seaM = std({ color: col('#2c7290'), roughness: .1, metalness: .2, normalMap: seaNormal, normalScale: new THREE.Vector2(.9, .9) });
plane(-1500, SHORE, 1500, SHORE + 1400, .02, seaM, coast);
const shallowTex = canvasTex(64, (g, n) => { const gr = g.createLinearGradient(0, 0, 0, n); gr.addColorStop(0, 'rgba(126,206,196,.8)'); gr.addColorStop(1, 'rgba(126,206,196,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); });
const bajoM = std({ map: shallowTex, transparent: true, depthWrite: false, roughness: .2 });
plane(-1500, SHORE, 1500, SHORE + 50, .024, bajoM, coast);
// espuma de las olas que llegan a la orilla
const foamTex = canvasTex(512, (g, n) => { g.clearRect(0, 0, n, n); for (let i = 0; i < 1400; i++) { const x = R(0, n), spread = n * (.12 + .18 * Math.abs(Math.sin(x / n * Math.PI * 4 + 1))); const y = n / 2 + R(-1, 1) * spread * R(0, 1); g.fillStyle = 'rgba(255,255,255,' + R(.2, .75).toFixed(2) + ')'; g.beginPath(); g.ellipse(x, y, R(3, 14), R(2, 6), 0, 0, 6.29); g.fill(); } });
const foams = [];
for (let k = 0; k < 5; k++) { const m = std({ map: rep(foamTex, 70, 1), transparent: true, depthWrite: false, roughness: .9, opacity: 0 }); const f = plane(-1500, 0, 1500, 7, .03, m, coast); f.userData.ph = k / 5; foams.push(f); }
// orilla viva (opción L): la espuma que rompe sube por la arena húmeda y se retira; dos lenguas desfasadas con borde de encaje
const encajeTex = canvasTex(512, (g, n) => {
  g.clearRect(0, 0, n, n);
  const borde = (x) => n * .38 + 14 * Math.sin(x / n * 6.2832 * 3) + 7 * Math.sin(x / n * 6.2832 * 7 + 1);   // ondas enteras: repite sin corte
  for (let i = 0; i < 2600; i++) { const x = R(0, n), y = borde(x) + Math.pow(rnd(), 1.7) * n * .5; g.fillStyle = 'rgba(255,255,255,' + R(.2, .8).toFixed(2) + ')'; g.beginPath(); g.arc(x, y, R(1.2, 4.5), 0, 6.2832); g.fill(); }
  for (let x = 0; x < n; x += 2) { const y = borde(x); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x, y - 2, 2, 5); }   // la línea del frente de la espuma
});
const lenguas = [0, .5].map((ph) => { const m = std({ map: rep(encajeTex, 60, 1), transparent: true, depthWrite: false, roughness: .85, opacity: 0 }); const f = plane(-1500, 0, 1500, 5, .03, m, coast); f.userData.ph = ph; return f; });
// destellos del sol en el mar: dos capas de chispas que se cruzan y titilan; su intensidad la pone la hora del día
const chispaTex = canvasTex(256, (g, n) => { g.clearRect(0, 0, n, n); for (let i = 0; i < 26; i++) { const x = R(8, n - 8), y = R(8, n - 8), r = R(.5, 1.3); const gr = g.createRadialGradient(x, y, 0, x, y, r * 3); gr.addColorStop(0, 'rgba(255,255,245,1)'); gr.addColorStop(1, 'rgba(255,255,245,0)'); g.fillStyle = gr; g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6); } });
const brillos = [0, 1].map((i) => plane(-1500, SHORE + 4, 1500, SHORE + 700, .026 + i * .001, new THREE.MeshBasicMaterial({ map: rep(chispaTex, 170 + i * 37, 46 + i * 11), color: col('#fff4d6'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), coast));
let brilloBase = .32;
// atrás: tierra con matorral, canal de salida de agua, dique con camino y piscina de sal
plane(-1500, CH[1], 1500, .8, .012, std({ map: rep(TX.sand, 90, 1), color: col('#b9aa86'), roughness: 1 }), coast);
plane(-1500, CH[1] - 1.2, 1500, CH[1], .014, std({ color: col('#6b6450'), roughness: .9 }), coast);
plane(-1500, CH[0], 1500, CH[0] + 1.2, .014, std({ color: col('#6b6450'), roughness: .9 }), coast);
const chNormal = waterNormal.clone(); chNormal.needsUpdate = true; chNormal.repeat.set(300, 4);
const canalM = std({ color: col('#2f4136'), roughness: .12, metalness: .15, normalMap: chNormal, normalScale: new THREE.Vector2(.5, .5) });
plane(-1500, CH[0] + 1.2, 1500, CH[1] - 1.2, .016, canalM, coast);
box(-1500, DIKE[0], 1500, DIKE[1], 0, 1.5, std({ map: rep(TX.gravel, 300, 2), color: col('#c4b08a'), roughness: 1 }), false, coast);
plane(-1500, DIKE[0] + 3, 1500, DIKE[1] - 3, 1.52, std({ map: rep(TX.gravel, 300, 1), color: col('#ddd0b1'), roughness: 1 }), coast);   // camino del dique
const saltTex = canvasTex(512, (g, n) => { grain(g, n, '#6f8e84', 10, 5000, 1.5); blotches(g, n, ['rgba(160,190,175,.14)', 'rgba(80,110,98,.14)'], 40, 20, 80); g.strokeStyle = 'rgba(200,220,210,.10)'; for (let i = 0; i < 90; i++) { const y = R(0, n); g.lineWidth = R(.5, 2); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(n * .3, y + R(-6, 6), n * .7, y + R(-6, 6), n, y); g.stroke(); } });
const pondNormal = waterNormal.clone(); pondNormal.needsUpdate = true; pondNormal.repeat.set(160, 60);
const salM = std({ map: rep(saltTex, 60, 18), color: col('#86ad9f'), roughness: .45, metalness: 0, normalMap: pondNormal, normalScale: new THREE.Vector2(.1, .1) });
plane(-1500, -900, 1500, DIKE[0], .45, salM, coast);
// el reflejo del cielo, sólo en el agua (velocidad · 3): los tanques, el mar con su orilla baja, el canal y la piscina de sal
const AGUA = [M.waterL, M.waterM, seaM, bajoM, canalM, salM];
// tuberías de descarga del laboratorio al canal
const outlets = [];
[58, 104, 150].forEach(x => {
  const [px] = P(x, 0), len = 12.2, pipe = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, len, 14), M.pipe);
  pipe.rotation.x = Math.PI / 2; const [, pz] = P(x, 1 - len / 2); pipe.position.set(px, .55, pz); pipe.castShadow = true; coast.add(pipe);
  const f = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .6, depthWrite: false, roughness: .9 }));
  f.rotation.x = -Math.PI / 2; const [, fz] = P(x, -11.6); f.position.set(px, .03, fz); coast.add(f); outlets.push(f);
});
function animateCoast(t) {
  seaNormal.offset.set(t * .004, -t * .02); chNormal.offset.set(t * .03, 0); pondNormal.offset.set(t * .002, t * .001);
  foams.forEach(f => { const k = (t * .07 + f.userData.ph) % 1; const [, z] = P(0, SHORE + 24 - 26 * k); f.position.z = z + 3.5; f.material.opacity = Math.sin(Math.PI * Math.min(1, k * 1.15)) * .85; f.scale.y = 1 + k * .6; });
  outlets.forEach((o, i) => { const k = .75 + .25 * Math.sin(t * 2.2 + i); o.scale.set(k, k, 1); o.material.opacity = .35 + .25 * Math.sin(t * 2.2 + i + 1); });
  // la lengua de espuma sube hasta ~5,5 m por la arena húmeda (rápido) y se retira (lento), desvaneciéndose al bajar
  lenguas.forEach((l) => { const k = (t * .1 + l.userData.ph) % 1, sube = k < .35, u = sube ? Math.sin(k / .35 * Math.PI / 2) : Math.cos((k - .35) / .65 * Math.PI / 2);
    const [, z] = P(0, SHORE + 1.5 - 5.5 * u); l.position.z = z + 2.5; l.material.opacity = sube ? .9 : .9 * Math.pow(u, .6); });
  brillos.forEach((b, i) => { b.material.map.offset.set(t * (i ? -.006 : .009), t * (i ? .004 : -.003)); b.material.opacity = brilloBase * (.55 + .45 * Math.sin(t * 1.7 + i * 2.1)); });
}

{ const patchTex = canvasTex(128, (g, n) => { const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); gr.addColorStop(0, 'rgba(150,135,95,.55)'); gr.addColorStop(1, 'rgba(150,135,95,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); });
  const pm = new THREE.MeshBasicMaterial({ map: patchTex, transparent: true, depthWrite: false, opacity: .55 });
  for (let i = 0; i < 70; i++) { const x = R(-300, 480), z = R(-260, 380); if (x > -5 && x < 182 && z > -5 && z < STREET[1] + 2) continue; const r = R(15, 60), m = new THREE.Mesh(new THREE.PlaneGeometry(r, r * R(.6, 1.2)), pm); m.rotation.set(-Math.PI / 2, 0, R(0, 6.28)); const [px, pz] = P(x, z); m.position.set(px, -.02, pz); scene.add(m); } }
/* ---------- Otras áreas del laboratorio ---------- */
const others = new THREE.Group(); scene.add(others);
const nightMats = [];
const WALLS = ['#f1ece2', '#e7eef0', '#efe6d6', '#e8e2f0'];
const cil = (x, z, r, h, y0, mat, tumbado) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat); const [px, pz] = P(x, z); m.position.set(px, y0 + (tumbado ? r : h / 2), pz); if (tumbado) m.rotation.x = Math.PI / 2; m.castShadow = m.receiveShadow = true; others.add(m); return m; };
const M_SOPLADOR = std({ color: col('#3d6fa0'), roughness: .5, metalness: .3 }), M_ACERO = std({ color: col('#9aa3a8'), roughness: .35, metalness: .7 });
const M_VIDRIO = std({ color: col('#2c3e48'), roughness: .15, metalness: .4 }), M_PORTON = std({ map: rep(TX.zinc, 1, 1), color: col('#b8c0c4'), roughness: .5, metalness: .4 });
const M_DIESEL = std({ color: col('#c9a23a'), roughness: .5, metalness: .3 });
/** Alero de ingreso con su puerta de vidrio, en el lado de `z` del edificio (centro `xm`). */
function ingreso(xm, z, sale) { box(xm - 1.7, Math.min(z, z + sale * 1.5), xm + 1.7, Math.max(z, z + sale * 1.5), 2.6, .12, M.paint, true, others); [-1.55, 1.55].forEach((dx) => box(xm + dx - .06, z + sale * 1.38, xm + dx + .06, z + sale * 1.5, 0, 2.6, M.steel, true, others)); box(xm - .7, Math.min(z, z + sale * .05), xm + .7, Math.max(z, z + sale * .05), 0, 2.2, M_VIDRIO, false, others); }
/** Equipos de aire acondicionado sobre el techo. */
function aires(a, b, c, d, h, n) { for (let i = 0; i < n; i++) { const x = a + (c - a) * (i + 1) / (n + 1), z = b + (d - b) * .3; box(x - .5, z - .35, x + .5, z + .35, h, .6, M_ACERO, true, others); } }
OTHERS.forEach(([a, b, c, d, h, type, , forma], k) => {
  const w = c - a, dd = d - b;
  if (type === 'canal') {
    // canal sedimentador abierto: dos bordes bajos y el agua adentro
    box(a, b, c, b + .18, 0, h, M.tankWall, true, others); box(a, d - .18, c, d, 0, h, M.tankWall, true, others);
    plane(a, b + .18, c, d - .18, h - .15, std({ color: col('#3d6670'), roughness: .12, metalness: .15, normalMap: repN(waterNormal, 40, 1), normalScale: new THREE.Vector2(.4, .4) }), others);
    return;
  }
  if (forma === 'maquinas') {   // sopladores y su tubería sobre el techo (no hay patio: lo rodean M10, M4, la calle interior y el cerco) y dos chimeneas de calderos
    for (let zz = b + 4; zz < d - 3; zz += 6) box(a + 1, zz, a + 2.4, zz + 1.6, h, 1.2, M_SOPLADOR, true, others);
    box(a + 2.7, b + 3, a + 3, d - 3, h, .3, M.pipe, true, others);
    cil(c - 3, b + 4, .35, 4.2, h, M_ACERO); cil(c - 5, b + 4, .35, 4.2, h, M_ACERO);
  } else if (forma === 'diesel') {   // tanque de combustible tumbado sobre sus soportes y escape en el techo
    cil(c + 2.2, d - 8, 1.1, 5, .35, M_DIESEL, true); box(c + 1.4, d - 10, c + 3, d - 9.6, 0, .4, M.steel, true, others); box(c + 1.4, d - 6.4, c + 3, d - 6, 0, .4, M.steel, true, others);
    cil(a + w / 2, b + 3, .25, 2.6, h, M_ACERO);
  } else if (forma === 'filtros') {   // filtros Turbidex al costado este y dos tanques elevados en el techo
    for (let i = 0; i < 4; i++) cil(c + 2.2, d - 3 - i * 2.6, .75, 2.4, 0, M_ACERO);   // al fondo del pasillo: el frente es el ingreso del M3 (opción I)
    [d - 7, d - 3.5].forEach((zz) => { box(a + w / 2 - 1, zz - 1, a + w / 2 + 1, zz + 1, h, .8, M.steel, true, others); cil(a + w / 2, zz, 1.2, 1.8, h + .8, M.paint); });
  } else if (forma === 'lab' || forma === 'admin') {   // alero de ingreso con puerta de vidrio hacia el interior del predio y aires en el techo
    ingreso(a + w / 2, d, 1); aires(a, b, c, d, h, forma === 'lab' ? 4 : 3);
  } else if (forma === 'comedor') {   // portones de bodega y puerta de servicio hacia la calle, chimenea de cocina
    [140, 146, 152, 158].forEach((x) => box(x - 1.6, d, x + 1.6, d + .08, 0, 3, M_PORTON, true, others));
    box(99.4, d, 100.6, d + .06, 0, 2.2, M.lid, true, others);
    cil(105, b + 3, .32, 2.2, h, M_ACERO);
  }
  if (type === 'bld') {
    const hex = WALLS[k % WALLS.length], side = windowsTex(hex, false), lit = windowsTex(hex, true);
    const mk = (len) => { const m = std({ map: rep(side, Math.max(1, Math.round(len / 4)), 1), emissiveMap: rep(lit, Math.max(1, Math.round(len / 4)), 1), emissive: col('#ffffff'), emissiveIntensity: 0 }); nightMats.push(m); return m; };
    const roof = std({ map: rep(TX.zinc, Math.max(1, w / 3), 1), roughness: .5, metalness: .35, normalMap: repN(TXN.zinc, Math.max(1, w / 3), 1), normalScale: new THREE.Vector2(.7, .7) });
    const mats = [mk(dd), mk(dd), roof, roof, mk(w), mk(w)];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mats); const [x, z] = P(a + w / 2, b + dd / 2); m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; others.add(m);
  } else if (type === 'res') {
    box(a, b, c, d, 0, h, M.tankWall, true, others); box(a + .3, b + .3, c - .3, d - .3, h, .12, M.lid, true, others);
    for (let zz = b + 2; zz < d - 1; zz += 4) box(a + w / 2 - .4, zz, a + w / 2 + .4, zz + .8, h + .12, .25, M.steel, true, others); // escotillas
  } else {
    // piletas de algas: cada una con agua verde de microalgas
    const n = Math.max(3, Math.round(dd / 4.6)), step = dd / n;
    for (let i = 0; i < n; i++) {
      const z0 = b + i * step + .3, z1 = b + (i + 1) * step - .3;
      box(a, z0, c, z1, 0, h, M.tankWall, true, others);
      const wm = M.algae.clone(); wm.color = col(['#4f9a35', '#6a9a2e', '#8a8a3a', '#3f8f4a'][i % 4]);
      box(a + .25, z0 + .25, c - .25, z1 - .25, .05, h - .1, wm, false, others);
    }
  }
});
// tuberías principales (ambientación de forma)
[[2, 14.2, 64, 14.5], [79, 19.9, 176, 20.2], [7.5, 86.2, 55.6, 86.5]].forEach(([a, b, c, d]) => box(a, b, c, d, .9, .3, M.pipe, true, others));

others.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !(Array.isArray(o.material) ? o.material[0] : o.material).transparent) addEdges(o); });
// cajas invisibles para saber sobre qué área está el puntero (no se dibujan: material.visible = false)
const M_TOQUE = new THREE.MeshBasicMaterial({ visible: false }), cajaToque = new THREE.BoxGeometry(1, 1, 1);   // unitBox se declara más abajo
const areaHits = OTHERS.map(([a, b, c, d, h, , nombre]) => { const m = new THREE.Mesh(cajaToque, M_TOQUE); const [x, z] = P((a + c) / 2, (b + d) / 2); m.position.set(x, (h + .3) / 2, z); m.scale.set(c - a, h + .3, d - b); m.userData.area = nombre; others.add(m); return m; });
/* ---------- Módulos y salas ---------- */
const unitBox = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), qt = new THREE.Quaternion(), eu = new THREE.Euler();
const roofs = new THREE.Group(); scene.add(roofs);
/** Una malla de instancias con cajas dadas en coordenadas del PLANO: [x0, z0, x1, z1, y0, alto]. */
function cajasInst(lista, mat, parent, sombra) {
  const im = new THREE.InstancedMesh(unitBox, mat, lista.length); im.castShadow = !!sombra; im.receiveShadow = true;
  lista.forEach(([a, b, c, d, y0, h], k) => { const [x, z] = P((a + c) / 2, (b + d) / 2); m4.compose(v.set(x, y0 + h / 2, z), q0, s.set(Math.abs(c - a), h, Math.abs(d - b))); im.setMatrixAt(k, m4); });
  (parent || scene).add(im); return im;
}
const M_PUERTA_INV = std({ color: col('#e9ece8'), roughness: .55, metalness: .25 });   // puerta corrediza del invernadero
const M_COLUMNA = std({ color: col('#d9d5cc'), roughness: .9 }), M_ZOCALO = std({ color: col('#6b6f6c'), roughness: .85 });
const salaCols = [], salaZoc = [], salaPuertas = [], salaMarcos = [];   // las cinco salas, en cuatro mallas al final
groups.forEach(g => {
  const [x0, z0, x1, z1] = g.box, top = .26;
  g.slab = box(x0, z0, x1, z1, 0, top, g.kind === 'larv' ? M.slabL.clone() : M.slabM.clone(), false);
  g.slab.userData.group = g; roofs.add(g.roof);
  if (g.kind === 'larv') {
    g.canals.forEach(([a, b]) => box(a, z0 + .6, b, z1 - .6, top - .04, .05, M.canal));
    // invernadero: arcos metálicos cada ~5 m, cumbrera y lámina traslúcida con malla de sombra
    const eave = 3.2, rise = 1.9, w = x1 - x0, d = z1 - z0, [cx, cz] = P(g.cx, g.cz), along = g.ridge === 'x', span = along ? d : w, len = along ? w : d;
    const nArch = Math.max(3, Math.round(len / 5)), steel = [];
    const archCurve = (u) => { const a = Math.PI * u; return [(-Math.cos(a)) * span / 2, eave + Math.sin(a) * rise]; };
    for (let i = 0; i <= nArch; i++) {
      const s = -len / 2 + len * i / nArch;
      for (let k = 0; k < 10; k++) {
        const [u0, y0] = archCurve(k / 10), [u1, y1] = archCurve((k + 1) / 10), lenSeg = Math.hypot(u1 - u0, y1 - y0);
        const mx = (u0 + u1) / 2, my = (y0 + y1) / 2, ang = Math.atan2(u1 - u0, y1 - y0);
        if (along) steel.push([cx + s, top + my, cz + mx, ang, 0, .09, lenSeg]); else steel.push([cx + mx, top + my, cz + s, 0, -ang, .09, lenSeg]);
      }
      for (const side of [-1, 1]) { if (along) steel.push([cx + s, top + eave / 2, cz + side * span / 2, 0, 0, .16, eave]); else steel.push([cx + side * span / 2, top + eave / 2, cz + s, 0, 0, .16, eave]); }
    }
    // culatas (opción E): marco de la puerta corrediza, riel y dos montantes, en cada extremo
    const PU = 1.6, PH = 2.8;   // media anchura y alto del vano de la puerta
    const enCulata = (e, u) => (along ? [cx + e, cz + u] : [cx + u, cz + e]);
    const horiz = along ? [Math.PI / 2, 0] : [0, Math.PI / 2];   // pieza tendida a lo ancho de la culata
    for (const e of [-len / 2, len / 2]) {
      for (const u of [-PU, PU]) { const [x, z] = enCulata(e, u); steel.push([x, top + PH / 2, z, 0, 0, .14, PH]); }
      { const [x, z] = enCulata(e, 0); steel.push([x, top + PH, z, horiz[0], horiz[1], .14, PU * 2 + .14]); }
      { const [x, z] = enCulata(e, -PU); steel.push([x, top + PH + .16, z, horiz[0], horiz[1], .08, PU * 4]); }   // riel de la corrediza
      for (const u of [-span / 4, span / 4]) { const hy = eave + rise * Math.sin(Math.PI * .25); const [x, z] = enCulata(e, u); steel.push([x, top + hy / 2, z, 0, 0, .09, hy]); }
    }
    // todas las piezas metálicas del módulo en una sola malla de instancias
    const si = new THREE.InstancedMesh(unitBox, M.steel, steel.length); si.castShadow = true;
    steel.forEach(([x, y, z, rx, rz, th, ln], k) => { m4.compose(v.set(x, y, z), qt.setFromEuler(eu.set(rx, 0, rz)), s.set(th, ln, th)); si.setMatrixAt(k, m4); });
    g.roof.add(si);
    // lámina curva del invernadero
    const segs = 14, geo = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) { const [u, y] = archCurve(i / segs); for (const e of [-len / 2, len / 2]) { if (along) pos.push(e, y, u); else pos.push(u, y, e); uv.push(i / segs * span / 4, (e + len / 2) / 4); } }
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const film = new THREE.Mesh(geo, M.film); film.position.set(cx, top, cz); film.renderOrder = 2; g.roof.add(film);
    // culatas cerradas con la misma lámina: el perfil del arco hasta el suelo, en los dos extremos
    { const contorno = [new THREE.Vector2(-span / 2, 0)]; for (let i = 0; i <= segs; i++) { const [u, y] = archCurve(i / segs); contorno.push(new THREE.Vector2(u, y)); } contorno.push(new THREE.Vector2(span / 2, 0));
      const tris = THREE.ShapeUtils.triangulateShape(contorno, []), gp = [], gu = [], gi = [];
      for (const e of [-len / 2, len / 2]) { const b = gp.length / 3; contorno.forEach((p) => { if (along) gp.push(e, p.y, p.x); else gp.push(p.x, p.y, e); gu.push(p.x / 4, p.y / 4); }); tris.forEach((t) => gi.push(b + t[0], b + t[1], b + t[2])); }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2)); gg.setIndex(gi); gg.computeVertexNormals();
      const culatas = new THREE.Mesh(gg, M.film); culatas.position.set(cx, top, cz); culatas.renderOrder = 2; g.roof.add(culatas); }
    // puertas corredizas cerradas, un poco por fuera de la culata (en el plano: el centro del módulo es g.cx, g.cz)
    cajasInst([-1, 1].map((sg) => { const e = sg * (len / 2 + .06); return along ? [g.cx + e - .03, g.cz - 1.5, g.cx + e + .03, g.cz + 1.5, top, 2.7] : [g.cx - 1.5, g.cz + e - .03, g.cx + 1.5, g.cz + e + .03, top, 2.7]; }), M_PUERTA_INV, g.roof, true);
    // cortina lateral baja
    if (along) { box(x0, z0, x1, z0 + .06, top, 1.0, M.film, false, g.roof); box(x0, z1 - .06, x1, z1, top, 1.0, M.film, false, g.roof); }
    else { box(x0, z0, x0 + .06, z1, top, 1.0, M.film, false, g.roof); box(x1 - .06, z0, x1, z1, top, 1.0, M.film, false, g.roof); }
    // soplador junto a cada módulo
    const bx = along ? x0 + 1 : x0 + 1.2, bz = along ? z0 - .2 : z1 + .3;
    box(bx, bz - .6, bx + 1.4, bz + .6, 0, 1.1, std({ color: col('#3d6fa0'), roughness: .5, metalness: .3 }), true);
  } else {
    // sala cerrada: muros altos con el frente bajo para ver el interior
    const t = .22, H = g.H;
    box(x0, z0, x1, z0 + t, top, H, M.wall, true); box(x0, z0, x0 + t, z1, top, H, M.wall, true); box(x1 - t, z0, x1, z1, top, H, M.wall, true);
    box(x0, z1 - t, x1, z1, top, 1.0, M.wall, true);
    if (g.partition) box(g.partition - .1, z0, g.partition + .1, z1 - 2.2, top, H, M.wall, true);
    // columnas de hormigón cada ~4 m, asomando por fuera del muro (el frente, a la altura de su muro bajo)
    const paso = (a, b) => { const n = Math.max(1, Math.round((b - a) / 4)); return Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n); };
    paso(x0, x1).forEach((x) => { salaCols.push([x - .16, z0 - .12, x + .16, z0 + .2, top, H]); salaCols.push([x - .16, z1 - .2, x + .16, z1 + .12, top, 1.12]); });
    paso(z0, z1).forEach((z) => { salaCols.push([x0 - .12, z - .16, x0 + .2, z + .16, top, H]); salaCols.push([x1 - .2, z - .16, x1 + .12, z + .16, top, H]); });
    // zócalo oscuro al pie de los cuatro muros
    salaZoc.push([x0, z0 - .04, x1, z0 + t + .04, top, .45], [x0, z1 - t - .04, x1, z1 + .04, top, .45], [x0 - .04, z0, x0 + t + .04, z1, top, .45], [x1 - t - .04, z0, x1 + .04, z1, top, .45]);
    // puerta metálica al frente (el muro que da al pasillo), con su marco
    { const xm = (x0 + x1) / 2; salaPuertas.push([xm - .9, z1 + .02, xm + .9, z1 + .08, top, 2.2]);
      salaMarcos.push([xm - 1.02, z1 - .02, xm - .9, z1 + .1, top, 2.32], [xm + .9, z1 - .02, xm + 1.02, z1 + .1, top, 2.32], [xm - 1.02, z1 - .02, xm + 1.02, z1 + .1, top + 2.2, .12]); }
    // techo de policarbonato transparente sobre vigas metálicas: deja ver los reproductores
    const roof = std({ map: rep(TX.zinc, (x1 - x0) / 3, 1), color: col('#eaf4f6'), roughness: .25, metalness: .1, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide });
    const panel = box(x0 - .3, z0 - .3, x1 + .3, z1 + .3, top + H, .08, roof, false, g.roof); panel.renderOrder = 2;
    const nb = Math.max(3, Math.round((x1 - x0) / 4));
    for (let i = 0; i <= nb; i++) { const bx = x0 + (x1 - x0) * i / nb; box(bx - .07, z0, bx + .07, z1, top + H - .16, .16, M.steel, true, g.roof); }
    box(x0, z0 + .1, x1, z0 + .26, top + H - .16, .16, M.steel, true, g.roof); box(x0, z1 - .26, x1, z1 - .1, top + H - .16, .16, M.steel, true, g.roof);
  }
});

cajasInst(salaCols, M_COLUMNA, null, true); cajasInst(salaZoc, M_ZOCALO); cajasInst(salaPuertas, M.lid, null, true); cajasInst(salaMarcos, M.steel, null, true);

/* ---------- Cerco y portón (opción G): pilares, concertina, portón corredizo y garita ---------- */
{
  // pilares cada ~3 m, asomando del muro y un poco más altos; en los extremos de cada tramo también
  const pilares = [];
  fenceSegs.forEach(([a, b, c, d]) => {
    const largoX = c - a > d - b, L = largoX ? c - a : d - b, n = Math.max(1, Math.round(L / 3));
    for (let i = 0; i <= n; i++) { const t = i / n; if (largoX) { const x = a + L * t, zm = (b + d) / 2; pilares.push([x - .2, zm - .2, x + .2, zm + .2, 0, 2.62]); } else { const z = b + L * t, xm = (a + c) / 2; pilares.push([xm - .2, z - .2, xm + .2, z + .2, 0, 2.62]); } }
  });
  cajasInst(pilares, M.wall, null, true);
  // concertina: anillos de alambre inclinados, uno cada 0,32 m sobre el borde del muro, en una malla de instancias
  const anillo = new THREE.TorusGeometry(.24, .012, 3, 12), aros = [];
  fenceSegs.forEach(([a, b, c, d]) => {
    const largoX = c - a > d - b, L = largoX ? c - a : d - b;
    for (let u = .2; u < L - .2; u += .32) aros.push(largoX ? [a + u, (b + d) / 2, Math.PI / 2] : [(a + c) / 2, b + u, 0]);
  });
  const conc = new THREE.InstancedMesh(anillo, std({ color: col('#7c8489'), roughness: .4, metalness: .7 }), aros.length);
  aros.forEach(([x, z, giro], k) => { const [px, pz] = P(x, z); m4.compose(v.set(px, 2.4 + .26, pz), qt.setFromEuler(eu.set(.35 * Math.sin(k * 1.7), giro, 0)), s.set(1, 1, 1)); conc.setMatrixAt(k, m4); });
  scene.add(conc);
  // portón corredizo de reja, ABIERTO: corrido hacia el este, por el lado de la calle (por dentro quedaba oculto tras el
  // muro del cerco), sobre su riel en la franja de grava
  const portonX0 = 78.4, ancho = 6.3, zp = 89.42, barras = [];
  barras.push([portonX0, zp - .04, portonX0 + ancho, zp + .04, .12, .08], [portonX0, zp - .04, portonX0 + ancho, zp + .04, 2.05, .08]);   // largueros
  for (let x = portonX0; x <= portonX0 + ancho + .01; x += .16) barras.push([x - .015, zp - .015, x + .015, zp + .015, .12, 1.98]);      // barrotes
  barras.push([portonX0 - .4, zp - .03, portonX0 + ancho + .3, zp + .03, 0, .06]);                                                      // riel
  cajasInst(barras, M.steel, null, true);
  // garita de guardianía: adentro, en el borde este de la calle interior, con banda de vidrio, alero y puerta hacia la calle
  box(75.2, 83.4, 77.6, 86, 0, 2.6, M.paint, true);
  box(75.17, 83.6, 77.63, 85.8, 1.05, .95, M_VIDRIO, false);
  box(74.9, 83.1, 77.9, 86.3, 2.6, .14, M.lid, true);
  box(75.14, 84.2, 75.2, 85.1, 0, 2.1, M.lid, false);
}

/* ---------- Tanques: muros, agua animada y burbujas de aireación ---------- */
const rect = tanks.filter(t => t.type === 'rect'), circ = tanks.filter(t => t.type === 'circ');
const rectL = rect.filter(t => t.g.kind === 'larv'), rectM = rect.filter(t => t.g.kind === 'mat');
const unit = unitBox;
const wallsI = new THREE.InstancedMesh(unit, M.tankWall, rect.length * 4); wallsI.castShadow = true; wallsI.receiveShadow = true;
const waterRL = new THREE.InstancedMesh(unit, M.waterL, rectL.length), waterRM = new THREE.InstancedMesh(unit, M.waterM, rectM.length);
const cylO = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), cyl = new THREE.CylinderGeometry(1, 1, 1, 40);
const ringI = new THREE.InstancedMesh(cylO, std({ color: col('#f4f2ee'), roughness: .7, side: THREE.DoubleSide }), circ.length); ringI.castShadow = true;
const waterC = new THREE.InstancedMesh(cyl, M.waterM, circ.length);
const waterMeshes = [waterRL, waterRM, waterC];
const Y0 = .26, TH = .16;
rect.forEach((t, i) => {
  const [x, z] = P(t.cx, t.cz), h = t.H;
  [[0, -t.W / 2 + TH / 2, t.L, TH], [0, t.W / 2 - TH / 2, t.L, TH], [-t.L / 2 + TH / 2, 0, TH, t.W], [t.L / 2 - TH / 2, 0, TH, t.W]].forEach(([dx, dz, sx, sz], k) => { m4.compose(v.set(x + dx, Y0 + h / 2, z + dz), q0, s.set(sx, h, sz)); wallsI.setMatrixAt(i * 4 + k, m4); });
});
[[rectL, waterRL], [rectM, waterRM]].forEach(([list, mesh]) => list.forEach((t, i) => {
  const [x, z] = P(t.cx, t.cz), h = t.H;
  m4.compose(v.set(x, Y0 + (h - .18) / 2, z), q0, s.set(t.L - TH * 2, h - .18, t.W - TH * 2)); mesh.setMatrixAt(i, m4);
  t.inst = i; t.mesh = mesh; t.tint = R(-.06, .06);
}));
circ.forEach((t, i) => {
  const [x, z] = P(t.cx, t.cz), h = t.H;
  m4.compose(v.set(x, Y0 + h / 2, z), q0, s.set(t.r, h, t.r)); ringI.setMatrixAt(i, m4);
  m4.compose(v.set(x, Y0 + (h - .14) / 2, z), q0, s.set(t.r - .1, h - .14, t.r - .1)); waterC.setMatrixAt(i, m4);
  t.inst = i; t.mesh = waterC; t.tint = R(-.04, .04);
});
scene.add(wallsI, ringI, waterRL, waterRM, waterC);
let selected = null, hovered = null, estadoCargado = false, mesPasado = null;   // mesPasado: { mes, cierre } o null (hoy)
// Estado de producción (planta/estado.js) → color del agua. En cultivo, el color de su ETAPA (el de las
// tarjetas de la Vista Ejecutiva); la alerta no repinta el tanque: va como baliza.
const ESTADO_COLOR = { vacio: col('#d9e8ea'), despachado: col('#a9bcc8'), agrupado: col('#5b6266'), descartado: col('#5b6266'), desinfeccion: col('#9e9e9e') };
const _etapaCol = {};
const colEtapa = (e) => _etapaCol[e.key] || (_etapaCol[e.key] = col(e.color));
function colorTanque(t) {
  const st = t.st;
  if (t.g.kind === 'mat' && st) return (MAD_COLOR[st.estado] || MAD_COLOR['Sin estado']).clone();
  if (st && st.estado === 'cultivo') return st.etapa ? colEtapa(st.etapa).clone() : WATER.larv.clone();
  if (st) return (ESTADO_COLOR[st.estado] || ESTADO_COLOR.vacio).clone();
  const c = (t.desove ? WATER.desove : t.g.kind === 'larv' ? WATER.larv : WATER.mat).clone();
  return c.offsetHSL(t.tint * .3, 0, t.tint);
}
// Maduración: los colores del modo «Estado» del mapa de salas (operativo.css: Producción --c-bueno, Cuarentena
// --c-malo, Mixto #7e57c2, Sin estado --c-sin-dato; Vacío sin color).
const MAD_COLOR = { 'Producción': col('#5cb860'), 'Cuarentena': col('#f2b705'), 'Mixto': col('#8a63c9'), 'Vacío': col('#d9e8ea'), 'Sin estado': col('#b0bec5') };
const MAD_HEX = { 'Producción': '#5cb860', 'Cuarentena': '#f2b705', 'Mixto': '#8a63c9', 'Vacío': '#d9e8ea', 'Sin estado': '#b0bec5' };
const conLarvas = (t) => (t.g.kind === 'mat' ? !estadoCargado || (t.st ? t.st.vivos > 0 : !!t.desove) : !t.st || t.st.estado === 'cultivo');
function paintWater() {
  tanks.forEach(t => {
    let c = colorTanque(t);
    if (selected === t.g) c.lerp(WATER.sel, .3);
    if (hovered === t) c = WATER.hover;
    t.mesh.setColorAt(t.inst, c);
  });
  waterMeshes.forEach(m => { m.instanceColor.needsUpdate = true; });
}
// aireación: burbujas que aparecen y revientan en la superficie
const bubbles = [], BUB_PER = { larv: 7, mat: 3 };
tanks.forEach(t => { const n = t.desove ? 2 : BUB_PER[t.g.kind]; for (let i = 0; i < n; i++) bubbles.push({ t, ph: R(0, 1), sp: R(.5, 1.1), x: 0, z: 0 }); });
const bubI = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10), M.bubble, bubbles.length);
const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
function seatBubble(b) { const t = b.t; if (t.type === 'rect') { b.x = R(-t.L / 2 + .5, t.L / 2 - .5); b.z = R(-t.W / 2 + .5, t.W / 2 - .5); } else { const a = R(0, 6.28), rr = R(0, t.r - .5); b.x = Math.cos(a) * rr; b.z = Math.sin(a) * rr; } }
bubbles.forEach(seatBubble); scene.add(bubI);

/* ---------- Postlarvas y reproductores (a escala aumentada para que se distingan) ---------- */
function shrimpGeo() {
  const pos = [], cols = [], tri = (a, b, c, cl) => { pos.push(...a, ...b, ...c); cols.push(...cl, ...cl, ...cl); };
  const N = 9, RG = 6, rings = [];
  const spine = u => [-.5 + u, .05 * Math.sin(Math.PI * u) - (u < .15 ? (.15 - u) * .35 : 0), 0];
  const rad = u => .028 + .08 * Math.pow(Math.sin(Math.PI * Math.min(1, u * .8 + .08)), .8);
  for (let i = 0; i <= N; i++) { const u = i / N, c = spine(u), r = rad(u), ring = []; for (let k = 0; k < RG; k++) { const a = k / RG * Math.PI * 2; ring.push([c[0], c[1] + r * Math.cos(a), c[2] + r * .72 * Math.sin(a)]); } rings.push(ring); }
  const body = [1, 1, 1], back = [.8, .76, .74], fan = [1, .58, .45], eye = [.05, .05, .06];
  for (let i = 0; i < N; i++) for (let k = 0; k < RG; k++) { const a = rings[i][k], b = rings[i][(k + 1) % RG], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % RG], cl = k === 0 || k === RG - 1 ? back : body; tri(a, c, b, cl); tri(b, c, d, cl); }
  const head = [.64, .08, 0], tail = [-.52, -.05, 0];
  for (let k = 0; k < RG; k++) { tri(rings[N][k], rings[N][(k + 1) % RG], head, body); tri(rings[0][(k + 1) % RG], rings[0][k], tail, body); }
  tri([-.5, -.05, 0], [-.7, -.13, .12], [-.73, -.1, 0], fan); tri([-.5, -.05, 0], [-.73, -.1, 0], [-.7, -.13, -.12], fan);
  for (const sd of [-1, 1]) {
    tri([.4, .05, sd * .055], [.47, .09, sd * .1], [.45, .02, sd * .1], eye);
    const a0 = [.48, .03, sd * .03], a1 = [-.36, .17, sd * .27]; tri(a0, a1, [a0[0], a0[1] + .012, a0[2]], fan); tri(a1, [a1[0], a1[1] + .012, a1[2]], [a0[0], a0[1] + .012, a0[2]], fan);
  }
  for (let j = 0; j < 5; j++) { const x = -.22 + j * .12; tri([x, -.05, 0], [x - .04, -.14, .03], [x + .03, -.05, 0], fan); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
}
const SHR = shrimpGeo(), pls = [], brood = [];
tanks.forEach(t => { const [wx, wz] = P(t.cx, t.cz); t.wx = wx; t.wz = wz; });
rectL.forEach(t => { for (let i = 0; i < 26; i++) pls.push({ t, ph: R(0, 6.28), sp: R(.25, .6) * (rnd() < .5 ? 1 : -1), rx: R(.15, .95), rz: R(.15, .95), d: R(.03, .1), s: R(.2, .25) }); });
tanks.filter(t => t.g.kind === 'mat').forEach(t => { const n = t.desove ? 2 : t.type === 'circ' ? 7 : 9; for (let i = 0; i < n; i++) brood.push({ t, ph: R(0, 6.28), sp: R(.06, .14), lane: R(-.8, .8), rf: R(.25, .85), d: R(.06, .12), s: R(.5, .6), dir: rnd() < .5 ? 1 : -1 }); });
const plI = new THREE.InstancedMesh(SHR, std({ vertexColors: true, roughness: .5, side: THREE.DoubleSide }), pls.length);
const brI = new THREE.InstancedMesh(SHR, std({ vertexColors: true, roughness: .45, side: THREE.DoubleSide }), brood.length);
plI.frustumCulled = brI.frustumCulled = false;
pls.forEach((p, i) => plI.setColorAt(i, col(['#7a5c42', '#8c6b4c', '#6e5440'][i % 3])));
brood.forEach((b, i) => brI.setColorAt(i, col(['#c4603f', '#b4553a', '#d27a55', '#a85a45'][i % 4])));
scene.add(plI, brI);
function animateShrimp(time) {
  const near = camera.position.distanceTo(controls.target) < 150;
  const mid = camera.position.distanceTo(controls.target) < 240;
  plI.visible = near; brI.visible = mid; if (!mid) return;
  if (near) pls.forEach((p, i) => {
    if (!conLarvas(p.t) || Math.abs(p.t.wx - controls.target.x) > 45 || Math.abs(p.t.wz - controls.target.z) > 45) { if (!p.off) { m4.makeScale(0, 0, 0); plI.setMatrixAt(i, m4); p.off = true; } return; }
    p.off = false;
    const t = p.t, a = p.ph + time * p.sp + .35 * Math.sin(time * 1.7 + p.ph), ex = (t.L / 2 - TH - .3) * p.rx, ez = (t.W / 2 - TH - .3) * p.rz;
    const [cx, cz] = P(t.cx, t.cz), sg = Math.sign(p.sp), dx = -Math.sin(a) * ex * sg, dz = Math.cos(a) * ez * sg;
    qt.setFromEuler(eu.set(0, -Math.atan2(dz, dx), .15 * Math.sin(time * 9 + p.ph)));
    m4.compose(v.set(cx + Math.cos(a) * ex, Y0 + t.H - .18 - p.d + .015 * Math.sin(time * 3 + p.ph), cz + Math.sin(a) * ez), qt, s.setScalar(p.s)); plI.setMatrixAt(i, m4);
  });
  brood.forEach((b, i) => {
    if (!conLarvas(b.t)) { if (!b.off) { m4.makeScale(0, 0, 0); brI.setMatrixAt(i, m4); b.off = true; } return; }
    b.off = false;
    const t = b.t, [cx, cz] = P(t.cx, t.cz), k = time * b.sp + b.ph; let x, z, dx, dz;
    if (t.type === 'rect') { const ex = t.L / 2 - TH - .5, ez = t.W / 2 - TH - .4; x = cx + Math.sin(k) * ex; z = cz + b.lane * ez + .25 * Math.sin(k * 3); dx = Math.cos(k) * ex; dz = .75 * Math.cos(k * 3); }
    else { const rr = (t.r - .45) * b.rf, a = k * b.dir; x = cx + Math.cos(a) * rr; z = cz + Math.sin(a) * rr; dx = -Math.sin(a) * b.dir; dz = Math.cos(a) * b.dir; }
    qt.setFromEuler(eu.set(0, -Math.atan2(dz, dx), 0));
    m4.compose(v.set(x, Y0 + t.H - .15, z), qt, s.setScalar(b.s)); brI.setMatrixAt(i, m4);   // a flor de agua: el color del estado se lee y ellos también
  });
  plI.instanceMatrix.needsUpdate = brI.instanceMatrix.needsUpdate = true;
}

/* ---------- Detalles internos de módulos y salas ---------- */
const interior = new THREE.Group(); scene.add(interior);
const D = { corona: [], mang: [], pipeB: [], pipeW: [], cos: [], cosW: [], floorL: [], floorM: [], lamp: [], grate: [], bar: [], tray: [], bench: [], fan: [], drain: [], discM: [], bucket: [], jar: [] };
const bx = (arr, x, y, z, sx, sy, sz) => arr.push([x, y, z, sx, sy, sz]);
const lampG = new Map();   // las lámparas de cada módulo y sala, aparte: se encienden según su estado (opción J)
const bxL = (g, ...caja) => { if (!lampG.has(g)) lampG.set(g, []); bx(lampG.get(g), ...caja); };
const IM = {
  pipeB: std({ color: col('#2f6fb3'), roughness: .4 }), floorL: std({ color: col('#d8e8ea'), roughness: .55 }), floorM: std({ color: col('#1f272b'), roughness: .6 }),
  drain: std({ color: col('#3a4246'), roughness: .6 }), cosW: std({ color: col('#3f8f74'), roughness: .1, transparent: true, opacity: .7 }),
  tray: std({ color: col('#3b4044'), roughness: .7 }), bench: std({ color: col('#c9ccc8'), roughness: .5, metalness: .2 }), fan: std({ color: col('#4a5258'), roughness: .5, metalness: .3 }),
  bucket: std({ roughness: .6 }), jar: std({ color: col('#e8f3f3'), roughness: .1, transparent: true, opacity: .75 }),
};
// tanques: piso interior, desagüe central, línea de agua (azul) y de aire (blanca) sobre los muros, bajantes de aire y comederos
tanks.filter(t => t.type === 'rect').forEach(t => {
  const [x, z] = P(t.cx, t.cz), top = Y0 + t.H, larv = t.g.kind === 'larv';
  bx(larv ? D.floorL : D.floorM, x, Y0 + .012, z, t.L - TH * 2, .02, t.W - TH * 2);
  D.drain.push([x, Y0 + .03, z, .2]);
  // remate de hormigón: una corona algo más ancha que el muro sobre sus cuatro lados (opción H)
  for (const [dx, dz, sx, sz] of [[0, -t.W / 2 + TH / 2, t.L + .1, TH + .1], [0, t.W / 2 - TH / 2, t.L + .1, TH + .1], [-t.L / 2 + TH / 2, 0, TH + .1, t.W], [t.L / 2 - TH / 2, 0, TH + .1, t.W]]) bx(D.corona, x + dx, top + .03, z + dz, sx, .06, sz);
  // mangueras de aireación: dos líneas de difusores sobre el piso, a lo largo del tanque
  for (const k of [-.25, .25]) bx(D.mang, x, Y0 + .045, z + k * (t.W - TH * 2), t.L - TH * 2 - .5, .045, .045);
  // las líneas de agua y de aire apoyan sobre la corona (6 cm más arriba que sobre el muro)
  bx(D.pipeB, x, top + .15, z + t.W / 2 - TH / 2, t.L - .2, .1, .1);
  bx(D.pipeW, x, top + .13, z - t.W / 2 + TH / 2, t.L - .2, .07, .07);
  for (const k of [-.33, 0, .33]) bx(D.pipeW, x + k * t.L, top - .35, z - t.W / 2 + TH + .06, .03, .8, .03);   // bajantes de aire
  bx(D.pipeB, x - t.L / 2 + .55, top - .12, z + t.W / 2 - TH - .08, .1, .45, .1);                             // entrada de agua
  if (larv) {
    // cosechador al extremo del tanque, hacia el borde del módulo o el canal
    const side = t.c % 2 === 0 ? -1 : 1, cx = x + side * (t.L / 2 + .36);
    bx(D.cos, cx, Y0 + .4, z, .6, .8, 1.1); bx(D.cosW, cx, Y0 + .72, z, .44, .08, .94);
  } else {
    for (const k of [-.3, .3]) bx(D.tray, x + k * t.L, top - .3, z + t.W / 2 - TH - .3, .42, .03, .42);           // comederos
  }
});
tanks.filter(t => t.type === 'circ').forEach(t => { const [x, z] = P(t.cx, t.cz); D.discM.push([x, Y0 + .012, z, t.r - .12]); D.drain.push([x, Y0 + .03, z, .2]); });
// invernaderos: lámparas colgantes, baldes de alimento y canales de drenaje con rejilla
groups.filter(g => g.kind === 'larv').forEach(g => {
  const [x0, z0, x1, z1] = g.box, [cx, cz] = P(g.cx, g.cz), w = x1 - x0, d = z1 - z0;
  if (g.ridge === 'x') for (let u = 4; u < w - 2; u += 6) for (const sz of [-1, 1]) bxL(g, cx - w / 2 + u, .26 + 3.15, cz + sz * d / 4, 1.2, .07, .16);
  else for (let u = 4; u < d - 2; u += 6) for (const sx of [-1, 1]) bxL(g, cx + sx * w / 4, .26 + 3.15, cz - d / 2 + u, .16, .07, 1.2);
  const rowsZ = [...new Set(g.tanks.map(t => +t.cz.toFixed(1)))].sort((a, b) => a - b);
  for (let r = 0; r + 1 < rowsZ.length; r++) for (let k = 0; k < 2; k++) { const [bxw, bzw] = P(R(x0 + 1.5, x1 - 1.5), (rowsZ[r] + rowsZ[r + 1]) / 2 + R(-.15, .15)); D.bucket.push([bxw, bzw, ['#2f6fb3', '#f4f2ea', '#f08a2c'][(r + k) % 3]]); }
  g.canals.forEach(([a, b]) => D.grate.push([a, z0 + .6, b, z1 - .6]));
});
[[15.0, 16.0, 16.4, 48.6], [46.55, 18.2, 47.15, 48.8], [22.95, 50.4, 24.45, 85.0], [38.85, 50.4, 40.35, 85.0], [47.4, 30.0, 63.6, 30.8], [47.4, 36.05, 63.6, 36.85]].forEach(c => D.grate.push(c));
D.grate.forEach(([a, b, c, d]) => {
  const [gx, gz] = P((a + c) / 2, (b + d) / 2), w = c - a, l = d - b, alongZ = l > w;
  bx(D.bar, gx, .27, gz, alongZ ? w : w, .02, alongZ ? l : l); // marco
  const n = Math.floor((alongZ ? l : w) / .45);
  for (let i = 0; i <= n; i++) { const u = -(alongZ ? l : w) / 2 + i * .45; if (alongZ) bx(D.bar, gx, .3, gz + u, w, .04, .06); else bx(D.bar, gx + u, .3, gz, .06, .04, l); }
});
// salas de maduración: lámparas sobre los tanques, ventiladores en la pared y mesa de trabajo en la zona de desove
groups.filter(g => g.kind === 'mat').forEach(g => {
  const [x0, z0, x1] = g.box;
  g.tanks.concat(g.desove).forEach(t => { const [x, z] = P(t.cx, t.cz); if (t.type === 'rect') for (const k of [-.25, .25]) bxL(g, x + k * t.L, .26 + 2.95, z, 1.4, .07, .18); else bxL(g, x, .26 + 2.95, z, 1.1, .07, .18); });
  for (let u = x0 + 4; u < x1 - 2; u += 8) { const [fx, fz] = P(u, z0 + .24); D.fan.push([fx, 2.5, fz]); }
  if (g.desove.length) {
    const [mx, mz] = P(148.6, 16.4); bx(D.bench, mx, .26 + .82, mz, 3.2, .06, .8); for (const dx of [-1.5, 1.5]) for (const dz of [-.35, .35]) bx(D.bench, mx + dx, .26 + .41, mz + dz, .06, .8, .06);
    for (let j = 0; j < 7; j++) D.jar.push([mx - 1.3 + j * .42, .26 + .97, mz + R(-.15, .15)]);
  }
});
function instBoxes(list, mat, cast) {
  if (!list.length) return null; const im = new THREE.InstancedMesh(unitBox, mat, list.length);
  list.forEach(([x, y, z, sx, sy, sz], i) => { m4.compose(v.set(x, y, z), q0, s.set(sx, sy, sz)); im.setMatrixAt(i, m4); });
  im.castShadow = !!cast; im.receiveShadow = true; interior.add(im); return im;
}
instBoxes(D.corona, std({ color: col('#ece8df'), roughness: .85 }), true); instBoxes(D.mang, std({ color: col('#4f5b62'), roughness: .6 }));
// tanques circulares: corona y anillo de manguera en el fondo, toros agrupados por radio (una malla por tamaño)
{ const porRadio = new Map(); circ.forEach((t) => { const k = t.r.toFixed(2); if (!porRadio.has(k)) porRadio.set(k, []); porRadio.get(k).push(t); });
  const qPlano = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const mCorona = std({ color: col('#ece8df'), roughness: .85 }), mMang = std({ color: col('#4f5b62'), roughness: .6 });
  porRadio.forEach((lista) => {
    const r = lista[0].r, corona = new THREE.InstancedMesh(new THREE.TorusGeometry(r, .07, 6, 48), mCorona, lista.length), mang = new THREE.InstancedMesh(new THREE.TorusGeometry(r * .6, .022, 4, 40), mMang, lista.length);
    corona.castShadow = true;
    lista.forEach((t, i) => { const [x, z] = P(t.cx, t.cz); m4.compose(v.set(x, Y0 + t.H + .03, z), qPlano, s.set(1, 1, 1)); corona.setMatrixAt(i, m4); m4.compose(v.set(x, Y0 + .045, z), qPlano, s.set(1, 1, 1)); mang.setMatrixAt(i, m4); });
    interior.add(corona, mang);
  }); }
instBoxes(D.floorL, IM.floorL); instBoxes(D.floorM, IM.floorM); instBoxes(D.pipeB, IM.pipeB, true); instBoxes(D.pipeW, M.pipe, true);
instBoxes(D.cos, M.tankWall, true); instBoxes(D.cosW, IM.cosW);
// lámparas de cada grupo en su propia malla; su material (encendida, a media luz, apagada) lo elige pintarLuces
const M_LAMP_MEDIA = M.lamp.clone(), M_LAMP_OFF = new THREE.MeshStandardMaterial({ color: col('#d8d8d4'), roughness: .5 });
lampG.forEach((lista, g) => { g.lamps = instBoxes(lista, M.lamp); }); instBoxes(D.bar, M.steel); instBoxes(D.tray, IM.tray); instBoxes(D.bench, IM.bench, true);
{ const cylG = new THREE.CylinderGeometry(1, 1, 1, 28);
  const disc = new THREE.InstancedMesh(cylG, IM.floorM, D.discM.length); D.discM.forEach(([x, y, z, r], i) => { m4.compose(v.set(x, y, z), q0, s.set(r, .02, r)); disc.setMatrixAt(i, m4); }); interior.add(disc);
  const dr = new THREE.InstancedMesh(cylG, IM.drain, D.drain.length); D.drain.forEach(([x, y, z, r], i) => { m4.compose(v.set(x, y, z), q0, s.set(r, .02, r)); dr.setMatrixAt(i, m4); }); interior.add(dr);
  const qFan = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const fan = new THREE.InstancedMesh(cylG, IM.fan, D.fan.length); D.fan.forEach(([x, y, z], i) => { m4.compose(v.set(x, y, z), qFan, s.set(.45, .12, .45)); fan.setMatrixAt(i, m4); }); interior.add(fan);
  const bk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.2, .16, .36, 12), IM.bucket, D.bucket.length); bk.castShadow = true;
  D.bucket.forEach(([x, z, hex], i) => { m4.compose(v.set(x, .26 + .18, z), q0, s.set(1, 1, 1)); bk.setMatrixAt(i, m4); bk.setColorAt(i, col(hex)); }); interior.add(bk);
  const jar = new THREE.InstancedMesh(new THREE.CylinderGeometry(.09, .09, .26, 12), IM.jar, D.jar.length); D.jar.forEach(([x, y, z], i) => { m4.compose(v.set(x, y, z), q0, s.set(1, 1, 1)); jar.setMatrixAt(i, m4); }); interior.add(jar);
}

/* ---------- Vegetación: solo matorral detrás del laboratorio, junto al canal ---------- */
const nature = new THREE.Group(); scene.add(nature);
const blobGeo = (() => { const g = new THREE.SphereGeometry(1, 12, 9), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + .16 * Math.sin(x * 6.1 + y * 3.7) * Math.cos(z * 5.3 - y * 2.1); p.setXYZ(i, x * k, y * k * .8, z * k); } g.computeVertexNormals(); return g; })();
const shrubs = [];
for (let i = 0; i < 190; i++) { const b = rnd(), z = b < .5 ? R(-8.8, -1.6) : b < .82 ? R(-11, -9.2) : R(-26.4, -25.2); shrubs.push({ x: R(-40, 220), z, r: R(.6, 1.9), hex: ['#5d7f3a', '#6f8a45', '#4f6f34', '#7d8a50'][i % 4] }); }
const shrubI = new THREE.InstancedMesh(blobGeo, std({ roughness: 1 }), shrubs.length); shrubI.castShadow = true; shrubI.receiveShadow = true;
shrubs.forEach((b, i) => { const [x, z] = P(b.x, b.z); m4.compose(v.set(x, b.r * .6, z), q0, s.set(b.r, b.r, b.r)); shrubI.setMatrixAt(i, m4); shrubI.setColorAt(i, col(b.hex)); });
nature.add(shrubI);

/* ---------- Letrero de Omarsa en el ingreso ---------- */
(function sign() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 440; const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const img = new Image();
  const draw = () => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 440); g.fillStyle = '#d40416'; g.fillRect(0, 404, 1024, 36);
    if (img.complete && img.naturalWidth) g.drawImage(img, 36, 38, 330, 330);
    let fs = 150; do { g.font = '800 ' + fs + 'px "Segoe UI", "Arial Black", Arial, sans-serif'; fs -= 4; } while (g.measureText('OMARSA').width > 860 && fs > 40);
    g.fillStyle = '#d40416'; g.textBaseline = 'alphabetic'; g.textAlign = 'center'; g.fillText('OMARSA', 512, 236);
    g.fillStyle = '#3a4448'; g.font = '600 50px "Segoe UI", Arial, sans-serif'; g.fillText('Laboratorio Mar Bravo', 512, 318); g.textAlign = 'left';
    tex.needsUpdate = true;
  };
  draw();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  const face = std({ map: tex, emissiveMap: tex, emissive: col('#ffffff'), emissiveIntensity: 0, roughness: .5 }); nightMats.push(face);
  const edge = std({ color: col('#e9e7e1'), roughness: .6 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.24, .18), [edge, edge, edge, edge, face, face]);
  const [x, z] = P(68.2, 91.8); board.position.set(x, 3.5, z); board.castShadow = true; scene.add(board);
  for (const dx of [-2.1, 2.1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 4.6, 8), M.steel); post.position.set(x + dx, 2.3, z - .14); post.castShadow = true; scene.add(post); }
})();

/* ---------- Postes de luz ---------- */
const lampSpots = [[74.8, 22], [74.8, 40], [74.8, 58], [74.8, 76], [92, 76.8], [112, 76.8], [132, 76.8], [152, 76.8], [172, 76.8], [26, 87.5], [46, 87.5], [6, 47], [6, 13], [100, 19.2], [150, 19.2], [20, 93], [60, 93], [100, 93], [140, 93]];
const poleI = new THREE.InstancedMesh(new THREE.CylinderGeometry(.08, .12, 1, 6), M.steel, lampSpots.length);
const headI = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, .18, .35), M.lamp, lampSpots.length); poleI.castShadow = true;
lampSpots.forEach(([x, z], i) => { const [px, pz] = P(x, z); m4.compose(v.set(px, 3.5, pz), q0, s.set(1, 7, 1)); poleI.setMatrixAt(i, m4); m4.compose(v.set(px + .3, 7, pz), q0, s.set(1, 1, 1)); headI.setMatrixAt(i, m4); });
scene.add(poleI, headI);
const glowTex = canvasTex(64, (g, n) => { const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(.3, 'rgba(255,200,130,.45)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); });
const glows = new THREE.Group(); glows.visible = false; scene.add(glows);
lampSpots.forEach(([x, z]) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); const [px, pz] = P(x, z); sp.position.set(px + .3, 6.9, pz); sp.scale.set(5, 5, 1); glows.add(sp); });
const nightLights = [[74.8, 40], [74.8, 76], [120, 76.8], [160, 76.8], [36, 87.5], [100, 19.2]].map(([x, z]) => { const l = new THREE.PointLight(0xffc98a, 0, 34, 1.6); const [px, pz] = P(x, z); l.position.set(px, 6.5, pz); scene.add(l); return l; });

/* ---------- Vida: personal, vehículos y aves ---------- */
const life = new THREE.Group(); scene.add(life);
const PATHS = [
  [[74.5, 21], [74.5, 87]], [[78, 77], [172, 77]], [[23.8, 50.5], [23.8, 85]], [[39.7, 50.5], [39.7, 85]], [[8, 86.6], [55, 86.6]],
  [[80, 19.3], [175, 19.3]], [[2, 14.6], [63, 14.6]], [[46.8, 18], [46.8, 49]], [[15.6, 16], [15.6, 49]], [[112, 37.6], [112, 20.8]], [[128, 37.4], [175, 37.4]], [[60, 52], [60, 86]], [[113, 26.7], [143, 26.7]], [[80.5, 32.1], [110, 32.1]], [[30.5, 30.4], [46, 30.4]], [[8.5, 61.7], [23, 61.7]], [[40.6, 73.4], [55, 73.4]], [[146, 9.9], [153, 9.9]],
];
const people = []; const SHIRTS = ['#f4f4f0', '#2f5d8f', '#1f3f6b', '#8a6d4f', '#f4f4f0', '#3c8a5c'];   // sin naranja: es el chaleco del personal de tarea (opción K)
for (let i = 0; i < 30; i++) { const p = PATHS[i % PATHS.length]; people.push({ path: p, u: R(0, 1), dir: rnd() < .5 ? 1 : -1, sp: R(.9, 1.4), pause: 0, shirt: SHIRTS[i % SHIRTS.length] }); }
const bodyI = new THREE.InstancedMesh(new THREE.CylinderGeometry(.2, .24, 1.05, 8), std({ roughness: .8 }), people.length);
const headPI = new THREE.InstancedMesh(new THREE.SphereGeometry(.15, 10, 8), std({ roughness: .8 }), people.length);
const legI = new THREE.InstancedMesh(new THREE.CylinderGeometry(.16, .14, .7, 6), std({ color: col('#2b3440'), roughness: .9 }), people.length);
// sin sombra, como los autos y los técnicos: se mueven, y las sombras ya no se recalculan en cada cuadro
people.forEach((p, i) => { bodyI.setColorAt(i, col(p.shirt)); headPI.setColorAt(i, col(['#c99a73', '#a8764f', '#e0b896', '#8a5d3e'][i % 4])); });
life.add(bodyI, headPI, legI);
// carros: carrocería, cabina y ruedas
const CARS = ['#d8dde2', '#2a2f36', '#b33a32', '#e9e6dc', '#355f8f', '#8b9197', '#f2f2f2', '#c9a24a'];
const cars = [];
for (let i = 0; i < 8; i++) cars.push({ parked: true, x: 31.6 + i * 4.1 + (i > 4 ? 1.4 : 0), z: 92.4, rot: Math.PI / 2 + .45, hex: CARS[i % CARS.length], pickup: i === 2 || i === 6 });
[[118, 92.6], [121, 92.6], [158, 92.6]].forEach(([x, z], k) => cars.push({ parked: true, x, z, rot: 0, hex: CARS[(k + 3) % 8], moto: true }));
for (let i = 0; i < 4; i++) cars.push({ parked: false, lane: i % 2, x: R(-50, 230), sp: R(9, 14) * (i % 2 ? -1 : 1), hex: CARS[(i + 2) % 8], pickup: i === 1 });
const carBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std({ roughness: .35, metalness: .5 }), cars.length);
const carCab = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std({ color: col('#24303a'), roughness: .1, metalness: .6 }), cars.length);
const wheelI = new THREE.InstancedMesh(new THREE.CylinderGeometry(.33, .33, .24, 12), std({ color: col('#161616') }), cars.length * 4);
cars.forEach((c, i) => carBody.setColorAt(i, col(c.hex)));
life.add(carBody, carCab, wheelI);
function placeCar(c, i) {
  const [x, z] = P(c.x, c.z); qt.setFromEuler(eu.set(0, c.rot, 0));
  const L = c.moto ? 1.9 : c.pickup ? 5.1 : 4.3, Wd = c.moto ? .6 : 1.85, Hb = c.moto ? .5 : .75;
  m4.compose(v.set(x, .35 + Hb / 2, z), qt, s.set(L, Hb, Wd)); carBody.setMatrixAt(i, m4);
  const cabL = c.moto ? .5 : c.pickup ? 1.8 : 2.3, cabOff = c.pickup ? .9 : -.1;
  m4.compose(v.set(x, .35 + Hb + .32, z).add(new THREE.Vector3(cabOff, 0, 0).applyQuaternion(qt)), qt, s.set(cabL, c.moto ? .4 : .62, Wd * .92)); carCab.setMatrixAt(i, m4);
  const wq = qt.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b], k) => { const off = new THREE.Vector3(a * L * .33, 0, b * Wd * .45).applyQuaternion(qt); m4.compose(v.set(x, .33, z).add(off), wq, s.set(c.moto ? .7 : 1, 1, 1)); wheelI.setMatrixAt(i * 4 + k, m4); });
}
cars.forEach((c, i) => { if (!c.parked) { c.z = c.lane ? STREET[0] + 2.6 : STREET[1] - 2.6; c.rot = c.sp > 0 ? 0 : Math.PI; } placeCar(c, i); });
// gaviotas
const birds = []; const wingGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.18, 0, 0, .18, 1.1, .1, 0], 3)); g.computeVertexNormals(); return g; })();
const birdMat = std({ color: col('#f7f7f4'), side: THREE.DoubleSide, roughness: .7 });
for (let i = 0; i < 9; i++) {
  const b = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(.55, .14, .16), birdMat), wl = new THREE.Mesh(wingGeo, birdMat), wr = new THREE.Mesh(wingGeo, birdMat);
  wl.rotation.y = Math.PI / 2; wr.rotation.y = -Math.PI / 2; b.add(body, wl, wr); b.userData = { wl, wr, r: R(20, 60), h: R(22, 36), sp: R(.12, .22) * (i % 2 ? 1 : -1), ph: R(0, 6.28), cx: R(-60, 60), cz: R(-20, 150) };
  b.scale.setScalar(1.3); birds.push(b); life.add(b);
}

// el agua de los tanques refleja el cielo TENUE (decisión del usuario): su color es el dato de la etapa
M.waterL.envMapIntensity = M.waterM.envMapIntensity = .25 * ENV_REFLEJO;

/* ---------- Hora del día ---------- */
const TOD = {
  day: { sun: [-55, 140, 75], sunI: 1.5, sunC: '#fff1dc', hemiI: .6, sky: ['#5f9fd8', '#cfe3ee', '#e5dccb'], skySun: '#fff4dc', exp: 1.0, lights: 0 },
  dusk: { sun: [-150, 30, 175], sunI: 1.15, sunC: '#ffad73', hemiI: .5, sky: ['#3f5f9a', '#f2b487', '#c99a76'], skySun: '#ffb070', exp: 1.0, lights: .55 },
  night: { sun: [70, 110, -40], sunI: .22, sunC: '#a9bdff', hemiI: .16, sky: ['#030914', '#14223f', '#0b0f17'], skySun: '#20304f', exp: 1.25, lights: 1 },
};
/* Sol y luna en su posición real (opción C, 2026-10-04, usuario): Laboratorio Mar Bravo (Salinas, Santa Elena, ≈ 2,23° S,
   80,97° O), la fecha de hoy y una hora fija por botón —Día 10:00, Tarde 17:30, Noche 21:00, hora de Ecuador (UTC−5)—.
   Las fórmulas son las de SunCalc (V. Agafonkin, BSD): de baja precisión, sobradas para la luz de una maqueta. De noche
   alumbra la luna; si a esa hora está bajo el horizonte (o el astro va muy bajo), queda la posición fija de siempre. */
const SITIO = { lat: -2.23, lng: -80.97 }, HORA_TOD = { day: 10, dusk: 17.5, night: 21 };
const RAD = Math.PI / 180, OBL = RAD * 23.4397;
const diasJ2000 = (fecha) => fecha.valueOf() / 864e5 - 0.5 + 2440588 - 2451545;
const ascRecta = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
const declin = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
const coordsSol = (d) => { const M = RAD * (357.5291 + 0.98560028 * d), L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI; return { ra: ascRecta(L, 0), dec: declin(L, 0) }; };
const coordsLuna = (d) => { const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.229350 * d), l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F); return { ra: ascRecta(l, b), dec: declin(l, b) }; };
/** Altura y acimut (radianes; el acimut desde el norte, hacia el este) de un astro sobre el laboratorio. */
function horizonte(fecha, coords) {
  const d = diasJ2000(fecha), { ra, dec } = coords(d), phi = RAD * SITIO.lat, H = RAD * (280.16 + 360.9856235 * d) + RAD * SITIO.lng - ra;
  return { alt: Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)),
    az: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI };   // SunCalc lo da desde el sur, hacia el oeste
}
/** Posición (a 180 m) del astro que alumbra el botón `k` hoy, en la orientación de la maqueta; null si va muy bajo. */
function astroDe(k) {
  const h = new Date(), fecha = new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()) + (HORA_TOD[k] + 5) * 36e5);
  const { alt, az } = horizonte(fecha, k === 'night' ? coordsLuna : coordsSol);
  if (alt < RAD * 4) return null;
  const este = [-NORTH.y, NORTH.x], c = Math.cos(alt) * 180;   // el este, a 90° del norte de la brújula
  return [(Math.sin(az) * este[0] + Math.cos(az) * NORTH.x) * c, Math.sin(alt) * 180, (Math.sin(az) * este[1] + Math.cos(az) * NORTH.y) * c];
}
function setTod(k) {
  const T = { ...TOD[k], sun: astroDe(k) || TOD[k].sun };
  sun.position.set(...T.sun); sun.intensity = T.sunI; sun.color = col(T.sunC); hemi.intensity = T.hemiI * ENV_AMBIENTE; renderer.shadowMap.needsUpdate = true;
  // de tarde, el lila del cielo crepuscular (su azul de arriba con el naranja del horizonte): es lo que techos y películas
  // reflejaban cuando todo reflejaba el cielo (velocidad · 3); día y noche quedaban iguales con su color de siempre
  hemi.color = col(k === 'night' ? '#36486e' : k === 'dusk' ? '#cdb9c3' : '#eaf2f4'); hemi.groundColor = col(k === 'night' ? '#141820' : '#9a917e');
  const u = sky.material.uniforms; u.top.value.set(T.sky[0]); u.mid.value.set(T.sky[1]); u.bot.value.set(T.sky[2]); u.sunCol.value.set(T.skySun); u.sunDir.value.set(...T.sun).normalize();
  scene.fog = new THREE.Fog(col(T.sky[1]), 380, 1300);
  if (!envRTs[k]) envRTs[k] = generarEntorno(T);
  AGUA.forEach((m) => { m.envMap = envRTs[k].texture; });
  renderer.toneMappingExposure = T.exp; stars.visible = k === 'night';
  nightMats.forEach(m => { m.emissiveIntensity = T.lights * .9; });
  M.lamp.emissiveIntensity = T.lights * 3; M_LAMP_MEDIA.emissiveIntensity = T.lights * 1.1; glows.visible = T.lights > 0; nightLights.forEach(l => { l.intensity = T.lights * 1.6; });
  [M.waterL, M.waterM].forEach(m => { m.emissive = col(k === 'night' ? '#0e3a3a' : k === 'dusk' ? '#06201f' : '#000000'); });
  M.film.opacity = k === 'night' ? .3 : .42;
  brilloBase = k === 'night' ? 0 : k === 'dusk' ? .3 : .32; brillos.forEach((b) => { b.visible = k !== 'night'; b.material.color = col(k === 'dusk' ? '#ffc58a' : '#fff4d6'); });
  root.querySelectorAll('#tod button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === k));
  root.style.setProperty('--scene', T.sky[1]);
}
root.querySelectorAll('#tod button').forEach(b => b.addEventListener('click', () => setTod(b.dataset.t)));

/* ---------- Cámara ---------- */
let W = 1, H = 1, fly = null, userMoved = false;
function resize() {
  const r = vp.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
  renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
  wasFar = null;   // el ancho decide si el rótulo va corto: rehacerlos
  if (!userMoved && !selected && camera.position.lengthSq() > 0) { frameView('iso'); fly.dur = 1; }
}
controls.addEventListener('start', () => { userMoved = true; fly = null; hideTip(); });
function hideTip() { const tp = $('#tip'); if (tp) tp.hidden = true; if (hovered) { hovered = null; paintWater(); } }
function frameView(kind, target, size) {
  const tH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dir = (kind === 'top' ? new THREE.Vector3(0, 1, .002) : kind === 'back' ? new THREE.Vector3(0, .74, -.95) : new THREE.Vector3(0, .8, .95)).normalize();
  let tgt, dist;
  if (target) { tgt = new THREE.Vector3(...target); dist = size / (2 * tH) / Math.min(1, camera.aspect * 1.1) * 1.15; }
  else { // encuadra los 10 módulos y las 5 salas (≈ 178 × 90 m) lo más cerca posible
    tgt = new THREE.Vector3(0, 0, kind === 'top' ? 0 : kind === 'back' ? -6 : 6);
    dist = Math.max(182 / (2 * tH * camera.aspect), (kind === 'top' ? 96 : 66) / (2 * tH)) * (kind === 'top' ? 1.02 : 1.1);
  }
  const pos = tgt.clone().addScaledVector(dir, dist);
  hideTip();
  fly = { t0: performance.now(), dur: reduced ? 1 : 900, p0: camera.position.clone(), p1: pos, c0: controls.target.clone(), c1: tgt };
}
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

/* ---------- Etiquetas, tooltip y selección ---------- */
const labelsEl = $('#labels'), tip = $('#tip');
groups.forEach(g => {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'lbl'; el.setAttribute('aria-label', g.name);
  const i = document.createElement('i'); i.style.background = g.kind === 'larv' ? 'var(--larv)' : 'var(--mat)';
  const tx = document.createElement('span'); tx.textContent = g.name; el.append(i, tx); el.dataset.ty = '-100%';
  // el rótulo deja pasar el arrastre y la rueda a la maqueta; un clic sin mover selecciona el módulo
  el.addEventListener('pointerdown', e => { el._d = [e.clientX, e.clientY]; canvas.dispatchEvent(new PointerEvent('pointerdown', e)); });
  el.addEventListener('wheel', e => { e.preventDefault(); canvas.dispatchEvent(new WheelEvent('wheel', e)); }, { passive: false });
  el.addEventListener('click', e => { const d = el._d; if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) < 6) select(g, true); });
  labelsEl.append(el); g.label = el; g.labelText = tx; g.labelDot = i;
  const [ax, az] = P(g.cx, g.cz); g.anchor = new THREE.Vector3(ax, g.kind === 'larv' ? 6.6 : 5, az);
});
const GEO = [['Mar', 90, 165, 1], ['Playa', 90, 117, 1], ['Canal de salida', 90, -18, 1.5], ['Piscina de sal', 90, -115, 2]].map(([txt, x, z, y]) => { const el = document.createElement('span'); el.className = 'geo'; el.textContent = txt; labelsEl.append(el); const [px, pz] = P(x, z); return { el, p: new THREE.Vector3(px, y, pz) }; });
const NORTH = new THREE.Vector2(-1, -1).normalize(), needle = $('#needle');
const pct = (v) => (v === null || v === undefined || isNaN(v)) ? '—' : fmt(v, 1) + ' %';
const num = (v, d, u) => (v === null || v === undefined || isNaN(v)) ? '—' : fmt(v, d) + u;
/** Texto del rótulo de un módulo: su nombre (corto si la cámara está lejos) y su estado de producción. */
const compacto = () => W < 600;   // pantalla angosta (celular): de lejos, el rótulo corto
function textoRotulo(g, far) {
  const base = far ? g.short : g.name, st = g.st;
  if (far && compacto()) {
    const n = !st ? 0 : g.kind === 'larv' ? (st.cuenta ? st.cuenta.alerta : 0) : st.alertaTanques + (st.alerta ? 1 : 0);
    return (g.kind === 'larv' ? g.short.replace(/^M/, '') : g.short) + (g.kind === 'mat' && st && st.reemplazo ? '⏳' : '') + (n ? ' ⚠' + n : '');
  }
  if (!st) return base;
  if (g.kind === 'mat') {
    const n = st.alertaTanques + (st.alerta ? 1 : 0), reloj = st.reemplazo ? ' · ⏳' : '';
    if (far) return base + reloj + (n ? ' · ⚠ ' + n : '');
    return base + ' · ' + (st.registrado.estado || 'sin estado') + ' · ' + st.ocupados + '/' + st.total + reloj + (n ? ' · ⚠ ' + n : '');
  }
  // de lejos, sólo el nombre corto y las alertas: el color del punto ya dice la etapa (si no, se enciman)
  if (far) return base + (st.cuenta && st.cuenta.alerta ? ' · ⚠ ' + st.cuenta.alerta : '');
  if (st.estado === 'cultivo') return base + ' · ' + st.estadio + ' · día ' + st.dias + (st.despachando ? ' · despachando' : '') + (st.cuenta.alerta ? ' · ⚠ ' + st.cuenta.alerta : '');
  if (st.estado === 'desinfeccion') return base + ' · desinfección';
  if (st.estado === 'despachado') return base + ' · C' + st.corrida + ' despachada';
  return base + ' · sin datos';
}
const ESTADO_SALA_HEX = (e) => /desinfec/i.test(e || '') ? '#9e9e9e' : /cuarentena/i.test(e || '') ? MAD_HEX['Cuarentena'] : /producci/i.test(e || '') ? MAD_HEX['Producción'] : 'var(--mat)';
function colorRotulo(g) {
  const st = g.st;
  if (g.kind !== 'larv') return st ? ESTADO_SALA_HEX(st.registrado.estado) : 'var(--mat)';
  if (!st) return 'var(--larv)';
  if (st.estado === 'cultivo') return st.etapa ? st.etapa.color : 'var(--larv)';
  return st.estado === 'desinfeccion' ? '#9e9e9e' : '#b9c7cf';
}
const nums = [];
let prioridadSucia = false;   // el elegido cambia la prioridad de los rótulos
function select(g, focus) {
  selected = g; prioridadSucia = true;
  root.querySelectorAll('.list button').forEach(b => b.setAttribute('aria-current', b.dataset.id === (g && g.id)));
  groups.forEach(x => { x.label.classList.toggle('on', x === g); x.slab.material.color.copy(col(x === g ? '#f0c6a6' : x.kind === 'larv' ? '#f2efe8' : '#c8ccc6')); x.roof.visible = x !== g; });
  renderer.shadowMap.needsUpdate = true;   // el techo del elegido se abre: su sombra también
  nums.forEach(n => n.el.remove()); nums.length = 0;
  if (!g) { $('#card').hidden = true; paintWater(); return; }
  [...g.tanks, ...g.desove].forEach(t => { const el = document.createElement('span'); el.className = 'num'; el.textContent = (t.desove ? 'D' : '') + t.num; labelsEl.append(el); const [x, z] = P(t.cx, t.cz); nums.push({ el, p: new THREE.Vector3(x, Y0 + t.H + .3, z) }); });
  fichaModulo(g); paintWater();
  if (focus) { const [x, z] = P(g.cx, g.cz); frameView('iso', [x, 0, z], Math.max(g.box[2] - g.box[0], g.box[3] - g.box[1]) * 1.25 + 8); }
}
function llenarFicha(kind, name, rows) {
  $('#card-kind').textContent = kind; $('#card-name').textContent = name;
  const dl = $('#card-dl'); dl.textContent = '';
  rows.forEach(([k, val]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = val; dl.append(dt, dd); });
  $('#card').hidden = false;
}
let tanqueFicha = null;
/** La siembra de la corrida: fecha promedio (la de la tabla Producción Omarsa), tanques sembrados y nauplios. */
function txtSiembra(sb) {
  if (!sb || !sb.fecha) return '—';
  return fmtShort(sb.fecha) + ' · ' + sb.tanques + (sb.tanques === 1 ? ' tanque' : ' tanques') + (sb.nauplios ? ' · ' + fmt(sb.nauplios / 1e6, 1) + ' M nauplios' : '');
}
/** Resumen de la ficha de estado del módulo (las cifras de su tarjeta en la Vista Ejecutiva). */
function fichaModulo(g) {
  tanqueFicha = null;
  if (g.kind !== 'larv') { fichaSala(g); return; }
  const st = g.st, kind = 'Módulo de larvicultura';
  if (!estadoCargado) { llenarFicha(kind, g.name, [['Estado', 'Cargando datos de producción…']]); return; }
  if (!st || st.estado === 'sin-datos') { llenarFicha(kind, g.name, [['Estado', 'Sin datos de producción']]); return; }
  if (st.estado === 'desinfeccion') {
    llenarFicha(kind, g.name, [['Estado', 'Desinfección · pre-siembra'], ['Corrida', 'C' + st.corrida + ' en preparación'], ['Registros', String(st.registros)], ['Último registro', st.ultimo ? fmtShort(st.ultimo) : '—']]);
    return;
  }
  if (st.estado === 'despachado') {
    const r = st.resultado || {};
    llenarFicha(kind, g.name, [['Estado', mesPasado ? 'Corrida despachada' : 'Vacío · corrida despachada'], ['Corrida', 'C' + st.corrida + ' despachada por completo'], ['Siembra', txtSiembra(st.siembra)],
      ['Población final', fmtPop(r.poblacion)], ['Supervivencia', pct(r.superv)], ['PL/g (manual)', num(r.plg, 1, '')], ['Último dato', st.ultimo ? fmtShort(st.ultimo) : '—']]);
    return;
  }
  const c = st.cuenta, partes = [c.cultivo + ' en cultivo', c.vacio && c.vacio + ' vacíos', c.despachado && c.despachado + ' despachados', c.fuera && c.fuera + ' agrupados o descartados'].filter(Boolean);
  llenarFicha(kind, g.name, [
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
const ent = (v) => (v === '' || v === null || v === undefined || isNaN(v)) ? '—' : Math.round(Number(v)).toLocaleString('es-EC');
const dec = (v, d) => (v === '' || v === null || v === undefined || isNaN(v)) ? '—' : fmt(Number(v), d);
const SEM = { ok: 'en rango', bajo: 'bajo el rango', alto: 'sobre el rango' };
const dm = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');
/** Ficha de la sala: su estado registrado y el que calcula el libro, ocupación, reproductores y su semana. */
function fichaSala(g) {
  const st = g.st, kind = 'Sala de maduración';
  if (!estadoCargado) { llenarFicha(kind, g.name, [['Estado', 'Cargando datos de producción…']]); return; }
  if (!st) { llenarFicha(kind, g.name, [['Estado', 'Sin datos de maduración']]); return; }
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
  llenarFicha(kind, g.name, rows);
}
/** Ficha de un tanque de maduración (al tocarlo con su sala ya elegida): el lienzo del mapa de salas. */
function fichaTanqueMad(t) {
  tanqueFicha = t;
  const name = t.g.name + ' · ' + (t.desove ? 'desove ' : 'tanque ') + t.num, kind = 'Tanque de maduración';
  if (t.desove) { llenarFicha(kind, name, [['Estado', 'Tanque de desove'], ['Datos', 'El MCP no lleva registro por tanque de desove']]); return; }
  const st = t.st;
  if (!st) { llenarFicha(kind, name, [['Estado', estadoCargado ? 'Sin datos' : 'Cargando datos de producción…']]); return; }
  if (!st.vivos) { llenarFicha(kind, name, [['Estado', 'Vacío'], ['Último parte', dm(st.ultimoParte)]]); return; }
  const p = st.periodo;
  llenarFicha(kind, name, [
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
const ESTADO_TXT = { vacio: 'Vacío', despachado: 'Despachado', agrupado: 'Agrupado', descartado: 'Descartado', desinfeccion: 'Desinfección (pre-siembra)' };
/** Ficha de un tanque de larvicultura (al tocarlo con su módulo ya elegido). */
function fichaTanque(t) {
  tanqueFicha = t;
  const st = t.st, name = t.g.name + ' · tanque ' + t.num;
  if (!st) { llenarFicha('Tanque de larvicultura', name, [['Estado', estadoCargado ? 'Sin datos' : 'Cargando datos de producción…']]); return; }
  if (st.estado !== 'cultivo') {
    const rows = [['Estado', ESTADO_TXT[st.estado] || st.estado]];
    if (st.nombre) rows.push(['En el registro', st.nombre], ['Estadío', st.estadio || '—'], ['Población', fmtPop(st.pop)]);
    llenarFicha('Tanque de larvicultura', name, rows); return;
  }
  llenarFicha('Tanque de larvicultura', name, [
    ['Estado', 'En cultivo' + (st.etapa ? ' · ' + st.etapa.label : '')], ['En el registro', st.nombre],
    ['Estadío', st.estadio], ['Supervivencia', pct(st.sv)], ['Población', fmtPop(st.pop)],
    ['OD', num(st.od, 2, ' mg/L')], ['Temperatura', num(st.tmp, 1, ' °C')],
    ['Alerta', st.alerta ? '⚠ ' + st.motivos.join(', ') + ' fuera de rango' : 'Ninguna'],
    ['Lote', st.lotes && st.lotes.length ? st.lotes.join(' · ') : '—'],
  ]);
}
$('#card-close').addEventListener('click', () => select(null));
$('#v-iso').addEventListener('click', () => frameView('iso'));
$('#v-top').addEventListener('click', () => frameView('top'));
$('#v-back').addEventListener('click', () => frameView('back'));

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pickAt(e) {
  const r = canvas.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects([...waterMeshes, wallsI, ringI, ...groups.map(g => g.slab), ...(others.visible ? areaHits : [])], false);
  if (!hits.length) return null;
  const h = hits[0];
  if (h.object.userData.area) return { area: h.object.userData.area };
  if (waterMeshes.includes(h.object)) return { tank: tanks.find(t => t.mesh === h.object && t.inst === h.instanceId) };
  if (h.object === wallsI) return { tank: rect[Math.floor(h.instanceId / 4)] };
  if (h.object === ringI) return { tank: circ[h.instanceId] };
  return { group: h.object.userData.group };
}
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const p = pickAt(e); if (!p) { select(null); return; }
  // un área (opción F): se suelta lo elegido y, con el dedo, se muestra su nombre unos segundos
  if (p.area) { select(null); if (e.pointerType !== 'mouse') { tipArea(p.area, e); clearTimeout(tipTimer); tipTimer = setTimeout(() => { tip.hidden = true; }, 3500); } return; }
  // con el módulo ya elegido, tocar uno de sus tanques abre la ficha del tanque
  if (p.tank && p.tank.g === selected) { if (p.tank.g.kind === 'larv') fichaTanque(p.tank); else fichaTanqueMad(p.tank); return; }
  select(p.tank ? p.tank.g : p.group, true);
});
canvas.addEventListener('pointermove', e => {
  if (e.buttons) { tip.hidden = true; return; }
  const p = pickAt(e), t = p && p.tank;
  if (t !== hovered) { hovered = t || null; paintWater(); }
  if (p && p.area) { canvas.style.cursor = 'help'; tipArea(p.area, e); return; }
  if (!t) { tip.hidden = true; canvas.style.cursor = p && p.group ? 'pointer' : 'grab'; return; }
  canvas.style.cursor = 'pointer'; tip.textContent = '';
  const b = document.createElement('b'); b.textContent = t.g.name + ' · ' + (t.desove ? 'desove ' : 'tanque ') + t.num;
  tip.append(b);
  lineasTip(t).forEach((txt) => { const sp = document.createElement('span'); sp.textContent = txt; sp.style.display = 'block'; tip.append(sp); });
  const r = vp.getBoundingClientRect(); tip.hidden = false;
  tip.style.left = Math.min(W - 250, e.clientX - r.left + 14) + 'px'; tip.style.top = Math.max(8, e.clientY - r.top - 54) + 'px';
});
/** Globo con el nombre de un área: «título · detalle» del plano. */
let tipTimer = 0;
function tipArea(nombre, e) {
  const [titulo, detalle] = nombre.split(' · ');
  tip.textContent = ''; const b = document.createElement('b'); b.textContent = titulo; tip.append(b);
  if (detalle) { const sp = document.createElement('span'); sp.textContent = detalle; sp.style.display = 'block'; tip.append(sp); }
  const r = vp.getBoundingClientRect(); tip.hidden = false;
  tip.style.left = Math.min(W - 250, e.clientX - r.left + 14) + 'px'; tip.style.top = Math.max(8, e.clientY - r.top - 54) + 'px';
}
/** Resumen del tanque para el tooltip (lo que se lee de un vistazo; el detalle va en la ficha). */
function lineasTip(t) {
  if (t.g.kind !== 'larv') {
    if (t.desove) return ['Tanque de desove · sin registro por tanque'];
    const sm = t.st;
    if (!sm) return [estadoCargado ? 'Sin datos de maduración' : 'Cargando datos…'];
    if (!sm.vivos) return ['Vacío'];
    return [sm.estado + ' · ' + sm.lotes.map((l) => l.lote).join(' + '), ent(sm.hembras) + ' ♀ · ' + ent(sm.machos) + ' ♂ · H:M ' + dec(sm.hm, 2),
      'Densidad ' + dec(sm.densidad, 1) + ' /m²', ...(sm.alerta ? ['⚠ ' + sm.motivos.join(' y ') + ' fuera de rango'] : [])];
  }
  const st = t.st;
  if (!st) return [estadoCargado ? 'Sin datos de producción' : 'Cargando datos…'];
  if (st.estado !== 'cultivo') return [ESTADO_TXT[st.estado] || st.estado];
  return [
    st.estadio + (st.etapa ? ' · ' + st.etapa.label : ''),
    'Pob. ' + fmtPop(st.pop) + ' · SV ' + pct(st.sv),
    'OD ' + num(st.od, 1, '') + ' · ' + num(st.tmp, 1, ' °C'),
    ...(st.alerta ? ['⚠ ' + st.motivos.join(', ') + ' fuera de rango'] : []),
  ];
}
// con el dedo, el navegador «sale» del lienzo justo al soltar: eso no oculta el nombre de un área (se oculta solo, a los 3,5 s)
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; if (hovered) { hovered = null; paintWater(); } });
canvas.addEventListener('keydown', e => { if (e.key === 'Escape') select(null); });

/* ---------- Panel ---------- */
const larvG = groups.filter(g => g.kind === 'larv'), matG = groups.filter(g => g.kind === 'mat');
const tile = (color) => { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<b>—</b><span><i></i><em></em></span><small></small>'; d.querySelector('i').style.background = color; $('#stats').append(d); return d; };
const tileCultivo = tile('var(--larv)'), tileAlerta = tile('#e53935'), tileRepro = tile('var(--mat)'), tileAlertaMad = tile('#e53935');
function pintarCifras(E) {
  const r = E && E.resumen;
  tileCultivo.querySelector('b').textContent = r ? r.cultivo : '—';
  tileCultivo.querySelector('em').textContent = 'tanques en cultivo';
  tileCultivo.querySelector('small').textContent = r ? 'de ' + r.total + ' · ' + Math.round(r.cultivo / r.total * 100) + ' % de ocupación · ' + r.vacio + ' vacíos · ' + r.despachado + ' despachados' + (r.desinfeccion ? ' · ' + r.desinfeccion + ' en desinfección' : '') : 'Cargando datos…';
  tileAlerta.querySelector('b').textContent = r ? r.alerta : '—';
  tileAlerta.querySelector('em').textContent = 'tanques en alerta';
  tileAlerta.querySelector('small').textContent = 'larvicultura · OD, temperatura o supervivencia fuera de rango';
  const rm = E && E.mad && E.mad.resumen;
  tileRepro.querySelector('b').textContent = rm ? ent(rm.hembras + rm.machos) : '—';
  tileRepro.querySelector('em').textContent = 'reproductores';
  tileRepro.querySelector('small').textContent = rm ? ent(rm.hembras) + ' ♀ · ' + ent(rm.machos) + ' ♂ · ' + rm.ocupados + ' de ' + rm.tanques + ' tanques (' + Math.round(rm.ocupados / rm.tanques * 100) + ' % de ocupación)' : (E ? 'Sin datos de maduración' : 'Cargando datos…');
  tileAlertaMad.querySelector('b').textContent = rm ? rm.alertaTanques + rm.alertaSalas : '—';
  tileAlertaMad.querySelector('em').textContent = 'alertas de maduración';
  tileAlertaMad.querySelector('small').textContent = rm ? rm.alertaTanques + ' tanques (H:M o densidad) · ' + rm.alertaSalas + ' salas (temperatura u oxígeno, 7 días)' : 'H:M, densidad, temperatura u oxígeno';
}
pintarCifras(null);

/* ---------- Producción del mes frente a la meta (tanda 4) ---------- */
// La meta vive en ESTE equipo (decisión del usuario, como ⚙️ Rangos de Microbiología): sin ella, la de por defecto.
const META_KEY = 'planta_meta_mes';
const leerMeta = () => { try { return normalizarMeta(localStorage.getItem(META_KEY)); } catch (_) { return META_POR_DEFECTO; } };
const guardarMeta = (v) => { try { if (v === META_POR_DEFECTO) localStorage.removeItem(META_KEY); else localStorage.setItem(META_KEY, String(v)); } catch (_) { /* sin almacenamiento: sólo en esta sesión */ } };
let meta = leerMeta(), ultimasCifras = null;
let alertasTotal = null;   // lo que cuenta «Qué atender hoy» (o «Alertas al cierre»): lo repite el resumen de pantalla completa (punto 3)
// es-EC como fmtPop: agrupa los miles también en cuatro cifras («1.006,0 M»; 'es' daba «1006,0 M»)
const millones = (v, d = 1) => (v / 1e6).toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' M';
function pintarProduccion(C) {
  ultimasCifras = C; pintarResumenFS();
  $('#prod-meta').textContent = 'de ' + millones(meta, meta % 1e6 ? 1 : 0);
  pintarSelectorMes(C);
  if (!C) {
    ['#prod-total', '#prod-sv', '#prod-n5', '#prod-des', '#prod-desp', '#prod-cult'].forEach((q) => { $(q).textContent = '—'; });
    $('#prod-pct').textContent = ''; $('#prod-nota').textContent = estadoCargado ? 'Sin corridas con mes de producción' : 'Cargando datos…';
    $('#prod-bar-d').style.width = $('#prod-bar-c').style.width = '0%'; $('#prod-goal').style.left = '100%';
    return;
  }
  const pct = C.total / meta * 100, escala = Math.max(C.total, meta);
  $('#prod-total').textContent = millones(C.total);
  $('#prod-pct').textContent = fmt(pct, 0) + ' % de la meta';
  $('#prod-pct').classList.toggle('ok', pct >= 100);
  $('#prod-bar-d').style.width = (C.despachado / escala * 100) + '%';
  $('#prod-bar-c').style.width = (C.enCultivo / escala * 100) + '%';
  $('#prod-goal').style.left = (meta / escala * 100) + '%';
  $('#prod-bar').setAttribute('aria-label', millones(C.total) + ' de ' + millones(meta) + ': ' + millones(C.despachado) + ' despachados y ' + millones(C.enCultivo) + ' en cultivo');
  $('#prod-desp').textContent = 'despachado ' + millones(C.despachado) + ' · ' + C.modulosDespachados + ' de ' + C.modulos + ' módulos';
  $('#prod-cult').textContent = 'en cultivo ' + millones(C.enCultivo);
  $('#prod-sv').textContent = C.supervivencia === null ? '—' : fmt(C.supervivencia, 1) + ' %';
  $('#prod-n5').textContent = millones(C.nauplios.n5);
  $('#prod-n5-sub').textContent = 'nauplios N5' + (C.nauplios.desde ? ' · ' + dm(C.nauplios.desde) + ' al ' + dm(C.nauplios.hasta) : '');
  $('#prod-des').textContent = ent(C.nauplios.desoves);
  $('#prod-nota').textContent = C.enCultivo > 0 ? 'Lo que sigue en cultivo aún puede bajar con la supervivencia.' : '';
}
/* El selector de mes: ◀ ▶ y el deslizador por los meses con datos (como la tabla Producción Omarsa). El deslizador
   sólo cambia el rótulo mientras se arrastra y elige al soltar (`change`), igual que el de la tabla. */
let alMes = null;
function pintarSelectorMes(C) {
  const prev = $('#mes-prev'), next = $('#mes-next'), sl = $('#mes-slider');
  if (!C) { $('#prod-mes').textContent = '—'; $('#prod-cor').textContent = ''; prev.disabled = next.disabled = true; sl.hidden = true; return; }
  const cs = C.corridas, n = C.meses.length;
  $('#prod-mes').textContent = C.mes;
  $('#prod-cor').textContent = cs.length ? 'corridas ' + cs[0] + (cs.length > 1 ? '–' + cs[cs.length - 1] : '') : '';
  prev.disabled = C.pos <= 0; next.disabled = C.pos >= n - 1;
  sl.hidden = n < 2; sl.max = String(n - 1); sl.value = String(C.pos);
}
function elegirMes(pos) {
  const C = ultimasCifras;
  if (!C || !alMes || pos < 0 || pos >= C.meses.length || pos === C.pos) return;
  alMes(C.meses[pos].mIdx, pos === C.meses.length - 1);
}
$('#mes-prev').addEventListener('click', () => { if (ultimasCifras) elegirMes(ultimasCifras.pos - 1); });
$('#mes-next').addEventListener('click', () => { if (ultimasCifras) elegirMes(ultimasCifras.pos + 1); });
$('#mes-slider').addEventListener('input', (e) => { const m = ultimasCifras && ultimasCifras.meses[+e.target.value]; if (m) $('#prod-mes').textContent = m.mes; });
$('#mes-slider').addEventListener('change', (e) => elegirMes(+e.target.value));
{
  const btn = $('#meta-btn'), form = $('#meta-form'), inp = $('#meta-in');
  const abrir = (si) => { form.hidden = !si; btn.setAttribute('aria-expanded', String(si)); if (si) { inp.value = String(Math.round(meta / 1e6)); inp.focus(); } };
  btn.addEventListener('click', () => abrir(form.hidden));
  form.addEventListener('submit', (e) => { e.preventDefault(); const v = Number(inp.value); if (!(v > 0)) { inp.focus(); return; } meta = normalizarMeta(v * 1e6); guardarMeta(meta); abrir(false); pintarProduccion(ultimasCifras); });
  $('#meta-reset').addEventListener('click', () => { meta = META_POR_DEFECTO; guardarMeta(meta); abrir(false); pintarProduccion(ultimasCifras); });
}
pintarProduccion(null);
// leyenda: las etapas de la Vista Ejecutiva y los estados sin larvas
{ const lg = $('#legend'); if (lg) {
  const item = (color, txt) => { const sp = document.createElement('span'); sp.className = 'lg'; const i = document.createElement('i'); i.style.background = color; sp.append(i, document.createTextNode(txt)); lg.append(sp); };
  STAGE_CATS.forEach((c) => item(c.color, c.label + ' · ' + c.range));
  item('#d9e8ea', 'Vacío'); item('#a9bcc8', 'Despachado'); item('#5b6266', 'Agrupado o descartado');
  const sub = document.createElement('span'); sub.className = 'lg-sub'; sub.textContent = 'Maduración'; lg.append(sub);
  ['Producción', 'Cuarentena', 'Mixto'].forEach((e) => item(MAD_HEX[e], e));
  const al = document.createElement('span'); al.className = 'lg lg-alerta'; al.textContent = '⚠ Baliza roja: tanque en alerta'; lg.append(al);
} }
function fillList(el, list) {
  list.forEach(g => {
    const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.dataset.id = g.id;
    const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = g.short; tg.style.background = g.kind === 'larv' ? 'var(--larv)' : 'var(--mat)';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = g.name; const sm = document.createElement('small'); nm.append(sm);
    const ct = document.createElement('span'); ct.className = 'ct';
    g.listTag = tg; g.listSub = sm; g.listCt = ct; pintarFila(g);
    b.append(tg, nm, ct); b.addEventListener('click', () => select(g, true)); li.append(b); el.append(li);
  });
}
function pintarFila(g) {
  const st = g.st;
  g.listTag.style.background = colorRotulo(g) === '#b9c7cf' ? '#8fa3ad' : colorRotulo(g);
  if (g.kind !== 'larv') {
    if (!estadoCargado) { g.listSub.textContent = 'Cargando…'; g.listCt.textContent = ''; return; }
    if (!st) { g.listSub.textContent = 'Sin datos'; g.listCt.textContent = ''; return; }
    const n = st.alertaTanques + (st.alerta ? 1 : 0);
    g.listSub.textContent = (st.registrado.estado || 'Sin estado') + ' · ' + ent(st.hembras) + ' ♀ · ' + ent(st.machos) + ' ♂';
    g.listCt.textContent = n ? '⚠ ' + n : st.ocupados + '/' + st.total;
    return;
  }
  if (!estadoCargado) { g.listSub.textContent = 'Cargando…'; g.listCt.textContent = ''; return; }
  if (!st || st.estado === 'sin-datos') { g.listSub.textContent = 'Sin datos'; g.listCt.textContent = ''; return; }
  if (st.estado === 'desinfeccion') { g.listSub.textContent = 'Desinfección · C' + st.corrida; g.listCt.textContent = ''; return; }
  if (st.estado === 'despachado') { g.listSub.textContent = (mesPasado ? '' : 'Vacío · ') + 'C' + st.corrida + ' despachada' + (mesPasado && st.resultado && st.resultado.superv !== null ? ' · ' + pct(st.resultado.superv) : ''); g.listCt.textContent = ''; return; }
  g.listSub.textContent = 'C' + st.corrida + ' · ' + st.estadio + ' · día ' + st.dias + (st.despachando ? ' · despachando' : '');
  g.listCt.textContent = st.cuenta.alerta ? '⚠ ' + st.cuenta.alerta : st.cuenta.cultivo + '/' + g.tanks.length;
}
fillList($('#list-larv'), larvG); fillList($('#list-mat'), matG);
$('#t-roof').addEventListener('change', e => { roofs.visible = e.target.checked; renderer.shadowMap.needsUpdate = true; });
$('#t-other').addEventListener('change', e => { others.visible = e.target.checked; renderer.shadowMap.needsUpdate = true; });
$('#t-life').addEventListener('change', e => { life.visible = e.target.checked; renderer.shadowMap.needsUpdate = true; });
$('#t-labels').addEventListener('change', e => { labelsEl.style.display = e.target.checked ? '' : 'none'; if (e.target.checked) { groups.forEach((g) => { g.label._w = 0; }); prioridadSucia = true; } });

/* ---------- Balizas de alerta (decisión del usuario: no repintan el tanque) ---------- */
const balizas = new THREE.Group(); scene.add(balizas);
const texAlerta = canvasTex(128, (g2, n) => { g2.clearRect(0, 0, n, n); g2.fillStyle = '#e53935'; g2.beginPath(); g2.arc(n / 2, n / 2, n * .44, 0, 6.29); g2.fill(); g2.strokeStyle = '#ffffff'; g2.lineWidth = 8; g2.stroke(); g2.fillStyle = '#ffffff'; g2.font = '900 84px Arial, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('!', n / 2, n / 2 + 4); });
const anilloGeo = new THREE.RingGeometry(.86, 1, 48);
function pintarBalizas() {
  balizas.children.slice().forEach((o) => { balizas.remove(o); if (o.material) o.material.dispose(); });
  tanks.forEach((t) => {
    if (!t.st || !t.st.alerta) return;
    const [x, z] = P(t.cx, t.cz), r = (t.type === 'circ' ? t.r : Math.max(t.L, t.W) / 2) + .25;
    const ring = new THREE.Mesh(anilloGeo, new THREE.MeshBasicMaterial({ color: 0xe53935, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, Y0 + t.H + .06, z); ring.scale.setScalar(r); ring.userData.r = r; ring.userData.ph = t.num * .7;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texAlerta, depthTest: false, transparent: true }));
    sp.position.set(x, Y0 + t.H + 2.4, z); sp.scale.set(1.5, 1.5, 1); sp.renderOrder = 5;
    balizas.add(ring, sp);
  });
  groups.forEach((g) => {
    if (g.kind !== 'mat' || !g.st || !g.st.alerta) return;
    // en la esquina de la sala que da al canal, para no tapar su rótulo (que va en el centro)
    const [x, z] = P(g.box[2] - 2.2, g.box[1] + 2.2);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texAlerta, depthTest: false, transparent: true }));
    sp.position.set(x, .26 + g.H + 1.6, z); sp.scale.set(2.2, 2.2, 1); sp.renderOrder = 5;
    balizas.add(sp);
  });
}
function latirBalizas(time) {
  balizas.children.forEach((o) => { if (!o.isSprite) { const k = (time * .9 + o.userData.ph) % 1; o.scale.setScalar(o.userData.r * (1 + .35 * k)); o.material.opacity = .9 * (1 - k); } });
}

/* ---------- Luces según el estado (opción J): lámparas y resplandor de cada módulo y sala ---------- */
groups.forEach((g) => {
  const [x0, z0, x1, z1] = g.box, [hx, hz] = P(g.cx, g.cz);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: col('#ffcf8a'), transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(hx, (g.kind === 'larv' ? 5.4 : 3.6) + .3, hz); m.scale.set((x1 - x0) * 1.25, (z1 - z0) * 1.25, 1); m.renderOrder = 3;
  glows.add(m); g.halo = m;   // glows: visible cuando la hora del día enciende las luces
});
/** Encendida, a media luz o apagada, según el estado del grupo. Sin datos todavía, todo encendido (como antes). */
function luzDe(g) {
  if (!estadoCargado) return 'on';
  const st = g.st;
  if (g.kind === 'mat') return st && st.ocupados === 0 ? 'off' : 'on';
  if (!st) return 'off';
  return st.estado === 'cultivo' ? 'on' : st.estado === 'desinfeccion' ? 'media' : 'off';
}
function pintarLuces() {
  groups.forEach((g) => {
    const l = luzDe(g);
    if (g.lamps) g.lamps.material = l === 'on' ? M.lamp : l === 'media' ? M_LAMP_MEDIA : M_LAMP_OFF;
    if (g.halo) { g.halo.visible = l !== 'off'; g.halo.material.opacity = l === 'on' ? .3 : .14; }
  });
}

/* ---------- Personal donde hay trabajo (opción K) ---------- */
const PERSONAL_MAX = 96;
const pBody = new THREE.InstancedMesh(new THREE.CylinderGeometry(.2, .24, 1.05, 8), std({ roughness: .8 }), PERSONAL_MAX);
const pHead = new THREE.InstancedMesh(new THREE.SphereGeometry(.15, 10, 8), std({ roughness: .8 }), PERSONAL_MAX);
const pLeg = new THREE.InstancedMesh(new THREE.CylinderGeometry(.16, .14, .7, 6), std({ color: col('#2b3440'), roughness: .9 }), PERSONAL_MAX);
// los colores por instancia se reservan con la cuenta de instancias del momento (three 0.128: setColorAt usa this.count):
// se ponen con la malla llena, antes del primer cuadro, y recién después la cuenta baja a 0 (medido: con la cuenta en 0
// antes, el buffer de colores salía vacío y los chalecos, oscuros). pintarPersonal sólo los cambia.
for (let i = 0; i < PERSONAL_MAX; i++) { pHead.setColorAt(i, col(['#c99a73', '#a8764f', '#e0b896', '#8a5d3e'][i % 4])); pBody.setColorAt(i, col('#f08a2c')); }
pBody.count = pHead.count = pLeg.count = 0;
life.add(pBody, pHead, pLeg);
let personal = [];
// el módulo por el que pasa cada recorrido de los caminantes: si está vacío, quien lo recorre no aparece
const moduloDe = (x, z) => groups.find((g) => g.kind === 'larv' && x > g.box[0] && x < g.box[2] && z > g.box[1] && z < g.box[3]) || null;
people.forEach((p) => { const [a, b] = p.path; p.modulo = moduloDe((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); });
/** Un lado libre junto al tanque (a 0,45 m de su muro), sin pisar otro tanque y dentro de su grupo; [x, z, yaw] o null. */
function junto(t) {
  const otros = t.g.tanks.concat(t.g.desove).filter((o) => o !== t), [x0, z0, x1, z1] = t.g.box;
  const cand = t.type === 'circ' ? [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [t.cx + dx * (t.r + .45), t.cz + dz * (t.r + .45)])
    : [[t.cx, t.cz + t.W / 2 + .45], [t.cx, t.cz - t.W / 2 - .45], [t.cx + t.L / 2 + .45, t.cz], [t.cx - t.L / 2 - .45, t.cz]];
  const libre = ([x, z]) => x > x0 + .3 && x < x1 - .3 && z > z0 + .3 && z < z1 - .3
    && !otros.some((o) => (o.type === 'circ' ? Math.hypot(x - o.cx, z - o.cz) < o.r + .15 : Math.abs(x - o.cx) < o.L / 2 + .15 && Math.abs(z - o.cz) < o.W / 2 + .15));
  const c = cand.find(libre); if (!c) return null;
  return [c[0], c[1], Math.atan2(t.cx - c[0], t.cz - c[1])];   // mirando al tanque
}
/** El recorrido de un módulo con cultivo: M1–M3 por su canal central; M4–M10 a lo ancho, entre las filas del medio. */
function recorridoDe(g) {
  const m = LARV.find((x) => x.id === g.id); if (!m) return null;
  const [x0, z0, x1, z1] = g.box;
  if (m.canals && m.canals.length) { const xc = (m.canals[0][0] + m.canals[0][1]) / 2; return [[xc, z0 + 1], [xc, z1 - 1]]; }
  const k = Math.floor(m.rows.length / 2) - 1, zc = (m.rows[k] + m.W + m.rows[k + 1]) / 2;
  return [[x0 + 1, zc], [x1 - 1, zc]];
}
function pintarPersonal() {
  personal = [];
  // caminantes: fuera de los módulos que no tienen cultivo
  people.forEach((p) => { p.oculto = !!(p.modulo && estadoCargado && !(p.modulo.st && p.modulo.st.estado === 'cultivo')); });
  if (mesPasado || !estadoCargado) { pBody.count = pHead.count = pLeg.count = 0; return; }   // el personal es el trabajo de HOY
  const NAR = '#f08a2c';
  groups.forEach((g) => {
    if (!g.st) return;
    g.tanks.forEach((t) => { if (t.st && t.st.alerta) { const j = junto(t); if (j) personal.push({ x: j[0], z: j[1], yaw: j[2], color: NAR, ph: R(0, 6.28) }); } });
    if (g.kind !== 'larv' || g.st.estado !== 'cultivo') return;
    if (g.st.despachando && ESTACION[g.id]) {
      const [x, z, eje] = ESTACION[g.id], lado = eje === 'x' ? Math.sign(g.cz - z) : Math.sign(g.cx - x);
      [-2, 0, 1.6].forEach((d) => { const px = eje === 'x' ? x + d : x + lado * 1.9, pz = eje === 'x' ? z + lado * 1.9 : z + d; personal.push({ x: px, z: pz, yaw: Math.atan2(x - px, z - pz), color: NAR, ph: R(0, 6.28) }); });
    }
    const r = recorridoDe(g); if (r) personal.push({ path: r, u: R(0, 1), dir: 1, sp: R(.8, 1.1), pause: 0, color: SHIRTS[personal.length % SHIRTS.length], ph: R(0, 6.28) });
  });
  personal = personal.slice(0, PERSONAL_MAX);
  personal.forEach((p, i) => pBody.setColorAt(i, col(p.color)));
  if (pBody.instanceColor) pBody.instanceColor.needsUpdate = true;
  pBody.count = pHead.count = pLeg.count = personal.length;
  animarPersonal(0, 0);
}
/** Quietos (con un leve vaivén) los de tarea; el de recorrido va y viene por su pasillo. */
function animarPersonal(t, dt) {
  personal.forEach((p, i) => {
    let x = p.x, z = p.z, yaw = p.yaw, walk = 0;
    if (p.path) {
      const [a, b] = p.path, len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (p.pause > 0) p.pause -= dt; else { p.u += p.dir * p.sp * dt / len; if (p.u > 1 || p.u < 0) { p.dir *= -1; p.u = Math.min(1, Math.max(0, p.u)); p.pause = R(1, 3); } }
      x = a[0] + (b[0] - a[0]) * p.u; z = a[1] + (b[1] - a[1]) * p.u; yaw = Math.atan2((b[0] - a[0]) * p.dir, (b[1] - a[1]) * p.dir);
      walk = p.pause > 0 ? 0 : Math.abs(Math.sin(t * 7 * p.sp + p.ph));
    } else yaw += .25 * Math.sin(t * .8 + p.ph);
    const [px, pz] = P(x, z); qt.setFromEuler(eu.set(0, yaw, 0));
    m4.compose(v.set(px, .7 + .55 + walk * .04, pz), qt, s.set(1, 1, 1)); pBody.setMatrixAt(i, m4);
    m4.compose(v.set(px, .7 + 1.22 + walk * .04, pz), qt, s.set(1, 1, 1)); pHead.setMatrixAt(i, m4);
    m4.compose(v.set(px, .35, pz), qt, s.set(1, 1, 1)); pLeg.setMatrixAt(i, m4);
  });
  pBody.instanceMatrix.needsUpdate = pHead.instanceMatrix.needsUpdate = pLeg.instanceMatrix.needsUpdate = true;
}

/* ---------- Camión de despacho (opción I): junto a cada módulo que se está despachando, con el mes en curso ---------- */
// Dónde estaciona, en el plano: [x, z, a lo largo de 'x' o de 'z']. M8–M10, en la franja hasta el cerco del frente; M5–M7,
// entre los módulos y las salas 4 y 5; M1–M3, en el pasillo de su ingreso (rótulos «INGRESO» del plano); M4 está encerrado
// (reservorios y cuarto de máquinas) y va a la calle interior, a su altura.
const ESTACION = { M8: [15.6, 87.3, 'x'], M9: [31.7, 87.3, 'x'], M10: [47.7, 87.3, 'x'], M7: [8.3, 13.6, 'x'], M6: [22.9, 13.6, 'x'], M5: [32.4, 14.6, 'x'],
  M4: [74.8, 33.4, 'z'], M3: [96.35, 43, 'z'], M2: [128.6, 43, 'z'], M1: [161.3, 43, 'z'] };
const camiones = new THREE.Group(); life.add(camiones);
const CG = { cabina: new THREE.BoxGeometry(1.9, 2.3, 2.4), vidrio: new THREE.BoxGeometry(.05, .8, 2.1), chasis: new THREE.BoxGeometry(5.2, .35, 2.4), baranda: new THREE.BoxGeometry(5.2, .5, .08), tina: new THREE.CylinderGeometry(.48, .42, .7, 14), rueda: new THREE.CylinderGeometry(.46, .46, .32, 14) };
const CM = { cabina: std({ color: col('#eef1f2'), roughness: .4, metalness: .3 }), vidrio: M_VIDRIO, chasis: std({ color: col('#3a3f43'), roughness: .6 }), tina: std({ color: col('#2f6fb3'), roughness: .45 }), rueda: std({ color: col('#1c1f21'), roughness: .9 }) };
function camion(x, z, eje) {
  const g = new THREE.Group(), pieza = (geo, mat, px, py, pz, rx) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); if (rx) m.rotation.x = rx; m.castShadow = true; g.add(m); };
  pieza(CG.cabina, CM.cabina, 2.6, 1.55, 0); pieza(CG.vidrio, CM.vidrio, 3.56, 1.95, 0);
  pieza(CG.chasis, CM.chasis, -1.05, .82, 0); pieza(CG.baranda, CM.cabina, -1.05, 1.25, 1.16); pieza(CG.baranda, CM.cabina, -1.05, 1.25, -1.16);
  for (const tx of [-2.9, -1.7, -.5]) for (const tz of [-.55, .55]) pieza(CG.tina, CM.tina, tx, 1.35, tz);   // tinas de despacho
  for (const wx of [2.6, -.4, -2.7]) for (const wz of [-1.05, 1.05]) pieza(CG.rueda, CM.rueda, wx, .46, wz, Math.PI / 2);
  const [px, pz] = P(x, z); g.position.set(px, 0, pz); if (eje === 'z') g.rotation.y = Math.PI / 2;
  camiones.add(g);
}
function pintarCamiones() {
  camiones.clear();   // geometrías y materiales compartidos: no se liberan aquí (lo hace dispose)
  if (mesPasado) return;   // el camión es el despacho de HOY (decisión del usuario)
  groups.forEach((g) => { if (g.kind === 'larv' && g.st && g.st.estado === 'cultivo' && g.st.despachando && ESTACION[g.id]) camion(...ESTACION[g.id]); });
}

/* ---------- Estado de producción (lo pasa planta/index.js; null mientras no hay libro) ---------- */
const LEDE_HOY = $('.planta .lede').textContent;
function pintarEstado(E) {
  estadoCargado = !!E;
  mesPasado = (E && E.mes) || null;
  $('.planta .lede').textContent = mesPasado
    ? mesPasado.mes + ': cada módulo de larvicultura con su corrida de ese mes y cada sala de maduración al ' + dm(mesPasado.cierre) + '.'
    : LEDE_HOY;
  groups.forEach((g) => {
    g.st = !E ? null : g.kind === 'larv' ? E.modulos[g.id] || null : (E.mad && E.mad.salas[g.id]) || null;
    g.tanks.forEach((t) => { t.st = g.st && g.st.tanques ? g.st.tanques[t.num] || null : null; });
  });
  paintWater(); pintarBalizas(); pintarCamiones(); pintarLuces(); pintarPersonal(); pintarCifras(E); pintarProduccion(E && E.cifras); pintarReemplazo(E && E.mad ? E.mad.reemplazo : null); pintarAtender(); groups.forEach(pintarFila);
  renderer.shadowMap.needsUpdate = true;   // los camiones de despacho cambian con los datos y el mes
  wasFar = null;   // rehace los rótulos en el próximo cuadro
  if (selected) { if (tanqueFicha && tanqueFicha.g === selected) (selected.kind === 'larv' ? fichaTanque : fichaTanqueMad)(tanqueFicha); else fichaModulo(selected); }
}
/* ---------- Qué atender hoy: las mismas alertas que las balizas y las cifras, en una lista ---------- */
const MOTIVO_TXT = { 'Superv.': 'supervivencia', OD: 'OD', Temp: 'temperatura', 'H:M': 'H:M', Densidad: 'densidad', Temperatura: 'temperatura', 'Oxígeno': 'oxígeno' };
const motivosTxt = (ms) => ms.map((m) => MOTIVO_TXT[m] || m).join(' y ');
/** Lleva la cámara a un tanque y abre su ficha. Si el panel está debajo de la maqueta (celular), salta a ella: al
 *  instante y no en suave, que no se puede comprobar en todos los navegadores; la cámara ya se anima hasta el tanque. */
function irATanque(t) {
  select(t.g, false);
  const [x, z] = P(t.cx, t.cz);
  frameView('iso', [x, 0, z], 16);
  (t.g.kind === 'larv' ? fichaTanque : fichaTanqueMad)(t);
  if (vp.getBoundingClientRect().top < 0) vp.scrollIntoView({ block: 'start' });
}
function irAGrupo(g) {
  select(g, true);
  if (vp.getBoundingClientRect().top < 0) vp.scrollIntoView({ block: 'start' });
}
function pintarAtender() {
  const ul = $('#atender'), h = $('#atender-h');
  ul.textContent = '';
  const nota = (txt) => { const li = document.createElement('li'); li.className = 'at-vacio'; li.textContent = txt; ul.append(li); };
  const titulo = mesPasado ? 'Alertas al cierre de ' + mesPasado.mes : 'Qué atender hoy';
  $('.planta .atender').setAttribute('aria-label', titulo);
  if (!estadoCargado) { h.textContent = titulo; nota('Cargando datos…'); return; }
  let total = 0;
  groups.forEach((g) => {
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
    const li = document.createElement('li'); li.className = 'at';
    const gb = document.createElement('button'); gb.type = 'button'; gb.className = 'at-g';
    const dot = document.createElement('i'); dot.style.background = colorRotulo(g);
    const nm = document.createElement('b'); nm.textContent = g.name;
    const sm = document.createElement('span'); sm.textContent = partes.join(' · ');
    gb.append(dot, nm, sm); gb.addEventListener('click', () => irAGrupo(g)); li.append(gb);
    if (enAlerta.length) {
      const fila = document.createElement('div'); fila.className = 'at-t';
      enAlerta.sort((a, b) => a.num - b.num).forEach((t) => {
        const b = document.createElement('button'); b.type = 'button';
        b.textContent = String(t.num) + (comun ? '' : ' · ' + motivosTxt(t.st.motivos));
        b.setAttribute('aria-label', g.name + ', tanque ' + t.num + ': ' + motivosTxt(t.st.motivos) + ' fuera de rango');
        b.addEventListener('click', () => irATanque(t)); fila.append(b);
      });
      li.append(fila);
    }
    ul.append(li);
  });
  // lotes que pasan de 60 días en producción (⏳ Permanencia): tocar el renglón abre su primera sala
  const salasTxt = (ss) => (ss.length > 1 ? 'Salas ' : 'Sala ') + ss.map((x) => x.sala.replace('Sala ', '')).join(', ').replace(/, ([^,]+)$/, ' y $1');
  ((reemplazoActual && reemplazoActual.vencidos) || []).forEach((v) => {
    total++;
    const li = document.createElement('li'); li.className = 'at';
    const gb = document.createElement('button'); gb.type = 'button'; gb.className = 'at-g';
    const dot = document.createElement('i'); dot.className = 'reloj'; dot.textContent = '⏳';
    const nm = document.createElement('b'); nm.textContent = 'Lote ' + v.lote;
    const sm = document.createElement('span'); sm.textContent = v.dias + ' d en producción · ' + salasTxt(v.salas);
    gb.append(dot, nm, sm);
    const g = groups.find((x) => x.id === (v.salas[0] || {}).id);
    if (g) gb.addEventListener('click', () => irAGrupo(g));
    li.append(gb); ul.append(li);
  });
  h.textContent = total ? '⚠ ' + titulo + ' · ' + total : titulo;
  alertasTotal = total; pintarResumenFS();
  if (!total) nota(mesPasado ? 'Sin alertas al cierre de ' + mesPasado.mes : 'Sin alertas hoy');
}
/* ---------- Reproductores: días en producción frente al límite (60, el del tablero de Maduración) ---------- */
let reemplazoActual = null;
function pintarReemplazo(R) {
  reemplazoActual = R;
  $('#repro-h').textContent = 'Reproductores · días en producción' + (mesPasado ? ' al ' + dm(mesPasado.cierre) : '');
  const ul = $('#repro'); ul.textContent = '';
  const nota = (txt) => { const li = document.createElement('li'); li.className = 'at-vacio'; li.textContent = txt; ul.append(li); };
  if (!estadoCargado) { nota('Cargando datos…'); return; }
  if (!R || !R.lotes.length) { nota(R ? 'Ningún lote en producción' : 'Sin datos de maduración'); return; }
  R.lotes.forEach((L) => {
    const pasa = L.dias > R.limite;
    const li = document.createElement('li'); li.className = 'rp' + (pasa ? ' pasa' : '');
    const nm = document.createElement('b'); nm.textContent = (pasa ? '⏳ ' : '') + L.lote;
    const ss = document.createElement('span'); ss.textContent = (L.salas.length > 1 ? 'Salas ' : 'Sala ') + L.salas.map((x) => x.sala.replace('Sala ', '')).join(', ').replace(/, ([^,]+)$/, ' y $1');
    const d = document.createElement('em'); d.textContent = L.dias + ' d';
    const bar = document.createElement('div'); bar.className = 'rp-bar'; bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('i'); fill.style.width = Math.min(100, L.dias / R.limite * 100) + '%'; bar.append(fill);
    li.title = L.lote + ': ' + L.dias + ' días en producción (reemplazo al pasar de ' + R.limite + ')';
    li.append(nm, ss, d, bar); ul.append(li);
  });
  const lim = document.createElement('li'); lim.className = 'rp-nota'; lim.textContent = 'Reemplazo al pasar de ' + R.limite + ' días en producción, la regla del tablero de Maduración.'; ul.append(lim);
}
pintarReemplazo(null);
pintarAtender();
function aviso(texto) { const a = $('#estado-datos'); if (a) a.textContent = texto || ''; }

/* ---------- Pantalla completa (punto 3) ---------- */
const btnFS = $('#v-full');
const fsElemento = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const enPantallaCompleta = () => fsElemento() === vp || root.classList.contains('expandida');
/** El resumen flotante: mes, producción frente a la meta y alertas (lo mismo que el panel, en una línea). */
// se llama desde el arranque (tarjeta de producción y «Qué atender»), antes de esta sección: busca su elemento al usarse
function pintarResumenFS() {
  const resumenFS = $('#resumen-fs'); if (!resumenFS) return;
  const C = ultimasCifras, partes = [];
  if (C) partes.push(C.mes, millones(C.total) + ' de ' + millones(meta, meta % 1e6 ? 1 : 0), fmt(C.total / meta * 100, 0) + ' % de la meta');
  else partes.push(estadoCargado ? 'Sin producción del mes' : 'Cargando datos…');
  if (alertasTotal !== null && estadoCargado) partes.push(alertasTotal ? '⚠ ' + alertasTotal + (mesPasado ? ' al cierre' : ' alertas') : 'sin alertas');
  resumenFS.textContent = partes.join(' · ');
}
function alCambiarPantallaCompleta() {
  const on = enPantallaCompleta();
  btnFS.textContent = on ? '⛶ Salir' : '⛶ Pantalla completa'; btnFS.setAttribute('aria-pressed', String(on));
  $('#resumen-fs').hidden = !on; if (on) pintarResumenFS();
  wasFar = null; despertar();   // el ancho cambia: rehacer los rótulos y dibujar a ritmo pleno
}
// expandida dentro de la página (sin la API, como en el iPhone): una entrada en el historial para que «volver» la cierre
let entradaHistorial = false;
function expandir(on) {
  root.classList.toggle('expandida', on);
  if (on) { try { history.pushState({ plantaExpandida: true }, ''); entradaHistorial = true; } catch (_) { entradaHistorial = false; } }
  alCambiarPantallaCompleta();
}
function salirDePantallaCompleta() {
  if (fsElemento() === vp) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  if (root.classList.contains('expandida')) { if (entradaHistorial) { entradaHistorial = false; history.back(); } else expandir(false); }
}
btnFS.addEventListener('click', () => {
  if (enPantallaCompleta()) { salirDePantallaCompleta(); return; }
  const pedir = vp.requestFullscreen || vp.webkitRequestFullscreen;
  if (pedir && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    try { const p = pedir.call(vp); if (p && p.catch) p.catch(() => expandir(true)); } catch (_) { expandir(true); }
  } else expandir(true);
});
const alPopstate = () => { if (root.classList.contains('expandida')) { entradaHistorial = false; expandir(false); } };
const alTeclaFS = (e) => { if (e.key === 'Escape' && root.classList.contains('expandida')) salirDePantallaCompleta(); };
document.addEventListener('fullscreenchange', alCambiarPantallaCompleta); document.addEventListener('webkitfullscreenchange', alCambiarPantallaCompleta);
window.addEventListener('popstate', alPopstate); document.addEventListener('keydown', alTeclaFS);

/* ---------- Bucle ---------- */
const tmp = new THREE.Vector3(); let wasFar = null, last = performance.now();
/** Coloca un rótulo sobre su punto. Devuelve true si cambió su posición o si entró o salió de la pantalla. */
function place(el, p) {
  tmp.copy(p).project(camera);
  const off = tmp.z > 1 || tmp.x < -1.2 || tmp.x > 1.2 || tmp.y < -1.2 || tmp.y > 1.2;
  if (off) { if (el._v !== 0) { el.style.visibility = 'hidden'; el._v = 0; return true; } return false; }
  let cambio = false;
  if (el._v !== 1) { el.style.visibility = ''; el._v = 1; cambio = true; }
  const x = Math.round((tmp.x + 1) / 2 * W * 2) / 2, y = Math.round((1 - tmp.y) / 2 * H * 2) / 2;
  if (x === el._x && y === el._y) return cambio;
  el._x = x; el._y = y; el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,' + (el.dataset.ty || '-50%') + ')';
  return true;
}
/* Rótulos que aún chocan: se ocultan (clase .tapado) los de menor prioridad. Gana el módulo o sala elegido, luego el que
   tiene más alertas (⚠ y ⏳), luego larvicultura sobre maduración, y a igualdad el orden del plano. El rótulo va
   centrado en x y apoyado en su punto (translate -50%, -100%); su tamaño se mide al cambiar su texto. */
const prioridadRotulo = (g) => {
  const st = g.st, n = !st ? 0 : g.kind === 'larv' ? (st.cuenta ? st.cuenta.alerta : 0) : st.alertaTanques + (st.alerta ? 1 : 0) + (st.reemplazo ? 1 : 0);
  return [g === selected ? 1 : 0, n, g.kind === 'larv' ? 1 : 0];
};
const porPrioridad = (a, b) => b.p[0] - a.p[0] || b.p[1] - a.p[1] || b.p[2] - a.p[2] || a.i - b.i;
function despejarRotulos() {
  if (labelsEl.style.display === 'none') return;
  const puestos = [], M = 2;
  groups.map((g, i) => ({ g, i, p: prioridadRotulo(g) })).sort(porPrioridad).forEach(({ g }) => {
    const el = g.label;
    if (el._v !== 1) { el.classList.remove('tapado'); return; }
    if (!el._w) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
    const r = [el._x - el._w / 2 - M, el._y - el._h - M, el._x + el._w / 2 + M, el._y + M];
    const choca = puestos.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
    el.classList.toggle('tapado', choca);
    if (!choca) puestos.push(r);
  });
}
function animateLife(t, dt) {
  // agua: el relieve se desplaza despacio
  waterNormal.offset.set(t * .012, t * .008);
  animateCoast(t);
  // burbujas de aireación
  bubbles.forEach((b, i) => {
    const k = (t * b.sp * .6 + b.ph) % 1; if (k < .02 && !b.seated) { seatBubble(b); b.seated = true; } if (k > .5) b.seated = false;
    const sc = conLarvas(b.t) ? .04 + .13 * Math.sin(Math.PI * k) : 1e-4, [x, z] = P(b.t.cx, b.t.cz);
    m4.compose(v.set(x + b.x, Y0 + b.t.H - .17, z + b.z), qFlat, s.set(sc, sc, sc)); bubI.setMatrixAt(i, m4);
  });
  bubI.instanceMatrix.needsUpdate = true;
  if (!life.visible) return;
  // personas caminando de ida y vuelta por pasillos y vías
  people.forEach((p, i) => {
    if (p.oculto) { if (!p.yaOculto) { m4.makeScale(0, 0, 0); bodyI.setMatrixAt(i, m4); headPI.setMatrixAt(i, m4); legI.setMatrixAt(i, m4); p.yaOculto = true; } return; }
    p.yaOculto = false;
    const [a, b] = p.path, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (p.pause > 0) p.pause -= dt; else { p.u += p.dir * p.sp * dt / len; if (p.u > 1 || p.u < 0) { p.dir *= -1; p.u = Math.min(1, Math.max(0, p.u)); p.pause = R(1, 4); } }
    const x = a[0] + (b[0] - a[0]) * p.u, z = a[1] + (b[1] - a[1]) * p.u, [px, pz] = P(x, z), walk = p.pause > 0 ? 0 : Math.abs(Math.sin(t * 7 * p.sp + i));
    const yaw = Math.atan2((b[0] - a[0]) * p.dir, (b[1] - a[1]) * p.dir); qt.setFromEuler(eu.set(0, yaw, 0));
    m4.compose(v.set(px, .7 + .55 + walk * .04, pz), qt, s.set(1, 1, 1)); bodyI.setMatrixAt(i, m4);
    m4.compose(v.set(px, .7 + 1.22 + walk * .04, pz), qt, s.set(1, 1, 1)); headPI.setMatrixAt(i, m4);
    m4.compose(v.set(px, .35, pz), qt, s.set(1, 1, 1)); legI.setMatrixAt(i, m4);
  });
  bodyI.instanceMatrix.needsUpdate = headPI.instanceMatrix.needsUpdate = legI.instanceMatrix.needsUpdate = true;
  // carros en la calle
  cars.forEach((c, i) => { if (c.parked) return; c.x += c.sp * dt; if (c.x > 240) c.x = -60; if (c.x < -60) c.x = 240; placeCar(c, i); });
  carBody.instanceMatrix.needsUpdate = carCab.instanceMatrix.needsUpdate = wheelI.instanceMatrix.needsUpdate = true;
  // gaviotas planeando en círculos
  birds.forEach(b => { const d = b.userData, a = t * d.sp + d.ph; b.position.set(d.cx + Math.cos(a) * d.r, d.h + Math.sin(t * .7 + d.ph) * 1.5, d.cz + Math.sin(a) * d.r); b.rotation.y = -a + (d.sp > 0 ? Math.PI : 0); const f = Math.sin(t * 6 + d.ph) * .5; d.wl.rotation.x = f; d.wr.rotation.x = -f; });
}
let rafId = 0, disposed = false;
/* Ahorro de batería: en REPOSO (5 s sin tocarla y sin vuelo de cámara) se dibuja a ~15 cuadros por segundo; fuera de
   pantalla (en el celular, al bajar al panel) no se dibuja: sólo se mira una vez por segundo si volvió o si la vista se
   cerró, para liberarla igual (el router no avisa al salir). */
const REPOSO_MS = 5000, REPOSO_FPS = 15;
let ultimoToque = performance.now(), ultimoCuadro = 0, enPantalla = true, timerFuera = 0;
const despertar = () => { ultimoToque = performance.now(); };
['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown'].forEach((ev) => canvas.addEventListener(ev, despertar, { passive: true }));
controls.addEventListener('change', despertar);   // también mientras la inercia sigue moviendo la cámara
const io = new IntersectionObserver((es) => {
  enPantalla = es[es.length - 1].isIntersecting;
  if (enPantalla && timerFuera) { clearTimeout(timerFuera); timerFuera = 0; despertar(); rafId = requestAnimationFrame(loop); }
});
io.observe(vp);
/* Libera todo lo de la tarjeta gráfica: el router vacía el contenedor al cambiar de vista y no avisa. */
function dispose() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(rafId); clearTimeout(timerFuera);
  // la vista se cierra: fuera de la pantalla completa y sin oyentes en el documento
  document.removeEventListener('fullscreenchange', alCambiarPantallaCompleta); document.removeEventListener('webkitfullscreenchange', alCambiarPantallaCompleta);
  window.removeEventListener('popstate', alPopstate); document.removeEventListener('keydown', alTeclaFS);
  if (fsElemento() && !fsElemento().isConnected) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) { /* ya salió */ } }
  Object.values(envRTs).forEach((rt) => rt.dispose()); pmrem.dispose(); envSky.material.dispose();
  io.disconnect();
  if (typeof ro !== 'undefined') ro.disconnect();
  controls.dispose();
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    ms.forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
  });
  renderer.dispose();
  if (renderer.forceContextLoss) renderer.forceContextLoss();
}
let slowFrames = 0, fastFrames = 0;
function loop(now) {
  if (!root.isConnected) { dispose(); return; }
  // con la pantalla de elegir rol encima (shell.js · showEntry pone .is-entry en .app) la maqueta no se ve, aunque para el
  // navegador siga en pantalla: también se pausa (medido en la auditoría: seguía a 15 cps detrás)
  if (!enPantalla || root.closest('.is-entry')) { timerFuera = setTimeout(() => { timerFuera = 0; rafId = requestAnimationFrame(loop); }, 1000); return; }
  rafId = requestAnimationFrame(loop);
  const activo = !!fly || now - ultimoToque < REPOSO_MS;
  if (!activo && now - ultimoCuadro < 1000 / REPOSO_FPS - 2) return;
  ultimoCuadro = now;
  const rawDt = (now - last) / 1000;
  // la nitidez se ajusta sólo con el ritmo pleno: los cuadros espaciados del reposo no son «equipo lento»
  if (activo) {
    slowFrames = rawDt > .055 ? slowFrames + 1 : Math.max(0, slowFrames - .5);
    fastFrames = rawDt < .022 ? fastFrames + 1 : 0;
    if (slowFrames > 90 && renderer.getPixelRatio() > DPR_MIN) { renderer.setPixelRatio(Math.max(DPR_MIN, renderer.getPixelRatio() - .25)); renderer.setSize(W, H, false); slowFrames = 0; }
    if (fastFrames > 240 && renderer.getPixelRatio() < DPR_MAX) { renderer.setPixelRatio(Math.min(DPR_MAX, renderer.getPixelRatio() + .25)); renderer.setSize(W, H, false); fastFrames = 0; }
  }
  try { frameBody(now); } catch (err) { console.error(err); }
}
function frameBody(now) {
  const dt = Math.min(.08, (now - last) / 1000); last = now; const t = now / 1000;   // .08: el paso del reposo (~15 cps) sin frenar a la gente
  if (fly) { const k = Math.min(1, (now - fly.t0) / fly.dur), e = ease(k); camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.c0, fly.c1, e); if (k >= 1) fly = null; }
  controls.update();
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  if (!reduced) { animateLife(t, dt); animarPersonal(t, dt); }
  const far = camera.position.distanceTo(controls.target) > 135;
  let movidos = false;
  if (far !== wasFar) { wasFar = far; movidos = true; groups.forEach(g => { g.labelText.textContent = textoRotulo(g, far); g.labelDot.style.background = colorRotulo(g); g.label._w = 0; }); }
  groups.forEach(g => { if (place(g.label, g.anchor)) movidos = true; });
  if (movidos || prioridadSucia) { prioridadSucia = false; despejarRotulos(); }
  GEO.forEach(g => place(g.el, g.p));
  if (!reduced) latirBalizas(now / 1000);
  animateShrimp(reduced ? 0 : now / 1000);
  { const fx = controls.target.x - camera.position.x, fz = controls.target.z - camera.position.z, l = Math.hypot(fx, fz) || 1, f = [fx / l, fz / l], r = [-f[1], f[0]];
    needle.style.transform = 'rotate(' + Math.atan2(NORTH.x * r[0] + NORTH.y * r[1], NORTH.x * f[0] + NORTH.y * f[1]) + 'rad)'; }
  nums.forEach(n => place(n.el, n.p));
  renderer.render(scene, camera);
}
setTod('day'); paintWater(); renderer.shadowMap.needsUpdate = true;
if (reduced) animateLife(0, 0);
camera.position.set(-30, 150, 175); controls.target.set(0, 0, 0);
const ro = new ResizeObserver(resize); ro.observe(vp); resize(); frameView('iso'); fly.dur = 1;
rafId = requestAnimationFrame(loop);
return { dispose, pintarEstado, aviso, alElegirMes: (fn) => { alMes = fn; } };
}
