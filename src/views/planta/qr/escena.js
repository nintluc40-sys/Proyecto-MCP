/* ============================================================
   PLANTA · QR 3D de acceso de Gerencia (2026-10-05, decisión del usuario)
   El artefacto «Camarón QR» (claude.ai, 2026-10-03) traído a la app: las piezas de una figura 3D —camarón de cinco
   especies, nauplio, zoea, mysis, postlarva y los logos de Omarsa y Mar Bravo— se reacomodan como módulos de un código
   QR al tocarlas. Aquí el código es FIJO: el enlace exclusivo de Gerencia (ui/accesoRol.js · enlaceGerencia), que entra
   directo a 🏭 Planta. Se quitaron del original el campo para escribir otro enlace, la subida de un logo propio y el
   guardado por el visor de claude.ai (aquí la imagen se descarga directo). three.js r128 es el mismo del artefacto
   (three@0.128.0); el codificador, qrcode-generator 1.4.4 (MIT), el mismo que usaba por CDN.
   Las búsquedas se limitan a `root`; la escena se libera sola (dispose) cuando su contenedor deja el documento.
   ============================================================ */
import * as THREE from 'three';
import qrcode from 'qrcode-generator';

/** Monta el QR 3D en `root` (que trae el marcado de qr/index.js) con el enlace `enlace`. Devuelve { dispose }. */
export function montarQR(root, { enlace }) {
const $ = s => root.querySelector(s);
const loading = $('#loading');
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
const DEFAULT_LOGO = { src: 'data:image/png;base64,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', name: 'Omarsa' };

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2, GA = Math.PI * (3 - Math.sqrt(5));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ZA = V(0, 0, 1);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
const ellPerim = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
function frameQuat(xAxis, normal) {
  const z = normal.clone().normalize();
  const x = xAxis.clone().addScaledVector(z, -xAxis.dot(z));
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0).addScaledVector(z, -z.x);
  x.normalize();
  const y = z.clone().cross(x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}

/* ---------- Especies ---------- */
const SPECIES = [
  { id: 'blanco', label: 'Blanco', sci: 'Penaeus vannamei', auth: 'Boone, 1931', common: 'camarón blanco del Pacífico', pattern: 'plain',
    accL: '#8f4a2f', accD: '#e0a07f', body: '#b5b39d', body2: '#8b8b78', belly: '#d2cbad', band: '#77786a', tail: '#bfae86', rim: '#9c4a34', leg: '#cfc19c', antenna: '#a0563a', eye: '#141619', glint: '#8e999e', ink: '#1e2a2c' },
  { id: 'tigre', label: 'Tigre', sci: 'Penaeus monodon', auth: 'Fabricius, 1798', common: 'camarón tigre gigante', pattern: 'tiger',
    accL: '#866812', accD: '#e3bd52', body: '#545b4c', body2: '#3b4137', belly: '#b3a57c', band: '#dcc061', stripe: '#191c18', tail: '#3a4d63', rim: '#e0c35e', leg: '#d1aa50', antenna: '#a07f42', eye: '#0e1011', glint: '#7c8a8f', ink: '#191c17' },
  { id: 'azul', label: 'Azul', sci: 'Penaeus stylirostris', auth: 'Stimpson, 1871', common: 'camarón azul', pattern: 'plain',
    accL: '#2c5c95', accD: '#8bb5e8', body: '#aac5d9', body2: '#7f9fbd', belly: '#e0eaf0', band: '#6688aa', tail: '#4573a6', rim: '#1f3f6b', leg: '#cddde9', antenna: '#5a83b0', eye: '#111720', glint: '#b9cddb', ink: '#12273e' },
  { id: 'rosado', label: 'Rosado', sci: 'Penaeus duorarum', auth: 'Burkenroad, 1939', common: 'camarón rosado', pattern: 'plain',
    accL: '#a5425b', accD: '#ef9cb0', body: '#e7aca5', body2: '#cf8a87', belly: '#f5e0d9', band: '#bf716f', tail: '#b4506a', rim: '#6e2236', leg: '#f1c9c0', antenna: '#c2606f', eye: '#191113', glint: '#d9b9bd', ink: '#46142a' },
  { id: 'cocido', label: 'Cocido', sci: 'Penaeus sp.', auth: 'al ajillo', common: 'listo para servir', pattern: 'cooked',
    accL: '#bd431b', accD: '#f5a074', body: '#ee6233', body2: '#d6461e', belly: '#f9c7aa', band: '#fde3d3', tail: '#cc3a1c', rim: '#8a1d0b', leg: '#f49e78', antenna: '#e2592c', eye: '#1b0e0a', glint: '#c99a8a', ink: '#541306' },
];
const SP = id => SPECIES.find(s => s.id === id) || SPECIES[0];
const C = {};
SPECIES.forEach(s => { C[s.id] = {}; for (const k in s) if (typeof s[k] === 'string' && s[k][0] === '#') C[s.id][k] = new THREE.Color(s[k]); });
const LARVA = { amber: new THREE.Color('#cf9a55'), core: new THREE.Color('#b5692e'), pale: new THREE.Color('#eee1c3'), neye: new THREE.Color('#2a0b07'),
  glass: new THREE.Color('#d4d0bf'), chromo: new THREE.Color('#8a3a22'), gut: new THREE.Color('#6a4a2c') };

/* ---------- Formas ---------- */
// En orden del ciclo de vida. len: largo del cuerpo en unidades locales; show: largo mostrado,
// para que cada estadio larval se vea más pequeño que el siguiente.
const FORMS = [
  { id: 'nauplio', label: 'Nauplio', code: 'N', noun: 'el nauplio', back: 'al nauplio', stage: 'nauplio (N1–N6)', size: '0,3–0,5 mm', len: 1.9, show: .62, target: 840 },
  { id: 'zoea', label: 'Zoea', code: 'Z', noun: 'la zoea', back: 'a la zoea', stage: 'zoea (Z1–Z3)', size: '0,9–2,4 mm', len: 2.65, show: 1.4, target: 900 },
  { id: 'mysis', label: 'Mysis', code: 'M', noun: 'la mysis', back: 'a la mysis', stage: 'mysis (M1–M3)', size: '2,6–3,8 mm', len: 3.5, show: 2.45, target: 1000, glass: true },
  { id: 'pl1', label: 'Postlarva', code: 'PL1', noun: 'la postlarva', back: 'a la postlarva', stage: 'postlarva 1 (PL1)', size: '≈ 4,5 mm', len: 3.9, show: 3.3, target: 1000, glass: true },
  { id: 'adulto', label: 'Adulto', code: '', noun: 'el camarón', back: 'al camarón', stage: 'adulto', size: 'hasta ~23 cm', target: 900 },
  { id: 'logo', label: 'Logo', code: '', noun: 'el logo', back: 'al logo', stage: '', size: '', target: 2400, logo: true },
  { id: 'marbravo', label: 'Mar Bravo', code: '', noun: 'el logo', back: 'al logo', stage: '', size: '', target: 3200, logo: true },
];
const FORM = id => FORMS.find(f => f.id === id) || FORMS[0];

const ADULT = {
  spine: [[1.2, 0], [.7, .12], [.15, .24], [-.3, .3], [-.72, .18], [-.98, -.12], [-1.02, -.45]],
  cara: .36, segs: [.15, .15, .16, .16, .16, .22], rFront: .15, rMax: .33, rTail: .12, latC: .8, latA: .7,
  W: { tail: .12, ros: .03, eye: .04, ant: .1, antl: .03, leg: .07, pleo: .06, scale: .02 },
  eye: { r: .085, z: .19, fwd: .06, up: .07 },
  ros: { len: .62, ang: .42, teeth: true, w: .055 },
  ant: [[[1.22, -.02, .11], [1.6, .06, .16], [1.85, .35, .24], [1.7, .85, .32], [1.05, 1.2, .4], [.1, 1.32, .46], [-.8, 1.2, .5], [-1.55, .9, .52]],
        [[1.22, -.02, -.11], [1.62, .02, -.17], [1.95, .25, -.26], [1.9, .75, -.34], [1.35, 1.1, -.42], [.45, 1.28, -.5], [-.45, 1.22, -.55], [-1.25, .98, -.58]]],
  antW: [.034, .012],
  fan: { tilt: .6, blades: [{ ang: 0, len: .6, w: .09, off: .03, wt: .16, telson: true }, { ang: .42, len: .66, w: .12, off: .01, wt: .22 }, { ang: -.42, len: .66, w: .12, off: .01, wt: .22 }, { ang: .92, len: .58, w: .11, off: -.02, wt: .2 }, { ang: -.92, len: .58, w: .11, off: -.02, wt: .2 }] },
  leg: { u0: .08, du: .06, d1: .2, d2: .16, f1: .1, f2: .16, w: [.03, .018] },
  pleo: { len: .3, w: .05 },
};
const PL1 = {
  spine: [[1.25, .02], [.8, .06], [.3, .1], [-.25, .12], [-.8, .08], [-1.3, 0], [-1.75, -.1]],
  cara: .3, segs: [.14, .14, .14, .15, .15, .28], rFront: .09, rMax: .2, rTail: .065, latC: .85, latA: .8,
  W: { tail: .1, ros: .025, eye: .07, ant: .1, antl: .04, leg: .07, pleo: .07, scale: .02 },
  eye: { r: .11, z: .17, fwd: .04, up: .05 },
  ros: { len: .42, ang: .32, teeth: false, w: .04 },
  ant: [[[1.22, 0, .08], [1.6, .1, .14], [1.85, .3, .2], [1.7, .55, .26], [1.1, .68, .32], [.2, .7, .36], [-.7, .62, .4]],
        [[1.22, 0, -.08], [1.62, .06, -.15], [1.95, .22, -.22], [1.9, .48, -.28], [1.4, .62, -.34], [.5, .68, -.38], [-.4, .64, -.42]]],
  antW: [.026, .01],
  fan: { tilt: .7, blades: [{ ang: 0, len: .48, w: .06, off: .02, wt: .18, telson: true }, { ang: .26, len: .5, w: .08, off: .01, wt: .21 }, { ang: -.26, len: .5, w: .08, off: .01, wt: .21 }, { ang: .55, len: .44, w: .07, off: -.01, wt: .2 }, { ang: -.55, len: .44, w: .07, off: -.01, wt: .2 }] },
  leg: { u0: .07, du: .05, d1: .16, d2: .14, f1: .08, f2: .12, w: [.022, .014] },
  pleo: { len: .26, w: .035 },
  larval: true,
};
// Mysis: cuerpo de camarón con exopoditos plumosos en las patas; nada cabeza abajo
const MYSIS = {
  spine: [[1.15, 0], [.75, .05], [.3, .08], [-.2, .07], [-.68, 0], [-1.1, -.12], [-1.45, -.3]],
  cara: .36, segs: [.13, .13, .14, .15, .15, .3], rFront: .1, rMax: .24, rTail: .075, latC: .85, latA: .8,
  W: { tail: .1, ros: .025, eye: .06, ant: .05, antl: .035, leg: .17, pleo: .025, scale: .03 },
  eye: { r: .1, z: .17, fwd: .03, up: .05 },
  ros: { len: .36, ang: .25, teeth: false, w: .04 },
  ant: [[[1.18, -.02, .08], [1.55, .02, .13], [1.95, .1, .18], [2.3, .22, .22]],
        [[1.18, -.02, -.08], [1.55, -.02, -.13], [1.9, .02, -.18], [2.25, .1, -.22]]],
  antW: [.024, .01],
  fan: { tilt: .7, blades: [{ ang: 0, len: .46, w: .06, off: .02, wt: .2, telson: true }, { ang: .3, len: .44, w: .075, off: .01, wt: .2 }, { ang: -.3, len: .44, w: .075, off: .01, wt: .2 }, { ang: .6, len: .38, w: .065, off: -.01, wt: .2 }, { ang: -.6, len: .38, w: .065, off: -.01, wt: .2 }] },
  leg: { u0: .1, du: .055, d1: .14, d2: .1, f1: .04, f2: .06, w: [.022, .014] },
  pleo: { len: .1, w: .03 },
  exopods: true, larval: true, tilt: -.45,
};

/* Herramientas para colocar piezas */
function makeKit(P) {
  const push = (p, q, s, part, extra) => P.push(Object.assign({ p, q, s, part }, extra || {}));
  // hoja plana muestreada con Halton (abanico caudal, escama antenal, pleópodos)
  function leaf(origin, dir, wdir, len, w, count, shape, part, extra) {
    const pts = []; let i = 1;
    while (pts.length < count && i < count * 40) { const s = halton(i, 2), v = halton(i, 3) * 2 - 1; i++; const hw = shape(s); if (Math.abs(v) <= hw) pts.push([s, v, hw]); }
    const area = (pts.length / Math.max(1, i - 1)) * len * 2 * w;
    const size = Math.sqrt(area / Math.max(1, pts.length)) * 1.15;
    const nrm = dir.clone().cross(wdir).normalize(), q = frameQuat(dir, nrm);
    for (const [s, v, hw] of pts) {
      const pos = origin.clone().addScaledVector(dir, s * len).addScaledVector(wdir, v * w);
      push(pos, q, V(size * 1.1, size * .95, size * .32), part, Object.assign({ rim: s > .74 || (s > .45 && Math.abs(v) > hw * .8) }, extra || {}));
    }
  }
  // cadena de piezas a lo largo de una curva (antenas, patas, setas)
  function strand(points, count, w0, w1, part, extra) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal'), len = curve.getLength();
    for (let i = 0; i < count; i++) {
      const s = (i + .5) / count, p = curve.getPointAt(s), t = curve.getTangentAt(s);
      let nrm = ZA.clone().addScaledVector(t, -t.z); if (nrm.lengthSq() < 1e-6) nrm = V(0, 1, 0);
      const w = w0 + (w1 - w0) * s;
      push(p, frameQuat(t, nrm), V(len / count * 1.6, w, w * .6), part, Object.assign({ sa: s, base: points[0].clone() }, extra || {}));
    }
  }
  // superficie tubular de anillos de placas a lo largo de un eje (cuerpo)
  function tube(nb, frameAt, segB, part, extraFn, flatVentral) {
    const STEPS = 300, ms = [0]; let prev = frameAt(0);
    for (let i = 1; i <= STEPS; i++) { const f = frameAt(i / STEPS); ms.push(ms[i - 1] + Math.hypot(f.p.distanceTo(prev.p), f.ry - prev.ry)); prev = f; }
    const mAt = u => { const x = clamp(u, 0, 1) * STEPS, i = Math.min(STEPS - 1, Math.floor(x)); return ms[i] + (ms[i + 1] - ms[i]) * (x - i); };
    const uAt = m => { let lo = 0, hi = STEPS; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ms[mid] < m) lo = mid; else hi = mid; } const d = ms[hi] - ms[lo]; return (lo + (d > 0 ? (m - ms[lo]) / d : 0)) / STEPS; };
    const fv = flatVentral ? .91 : 1;
    function layout(size) {
      const rings = [];
      for (let s = 0; s < segB.length - 1; s++) {
        const m0 = mAt(segB[s]), m1 = mAt(segB[s + 1]), len = m1 - m0, k = Math.max(1, Math.round(len / size));
        for (let j = 0; j < k; j++) {
          const u = uAt(m0 + (j + .5) / k * len), f = frameAt(u), c = ellPerim(f.ry * fv, f.rz);
          rings.push({ u, len: len / k, c, cnt: Math.max(5, Math.round(c / size)) });
        }
      }
      return rings;
    }
    const total = rs => rs.reduce((a, r) => a + r.cnt, 0);
    let lo = .004, hi = 1.2;
    for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (total(layout(mid)) > nb) lo = mid; else hi = mid; }
    const rings = layout(hi); let tot = total(rings);
    while (tot < nb) { let best = rings[0], bv = -1; for (const r of rings) { const v = r.c / r.cnt; if (v > bv) { bv = v; best = r; } } best.cnt++; tot++; }
    rings.forEach((rg, j) => {
      const f = frameAt(rg.u), around = rg.c / rg.cnt, extra = extraFn ? extraFn(rg.u) : {};
      for (let i = 0; i < rg.cnt; i++) {
        const a = (i + (j % 2) * .5) / rg.cnt * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const ry = flatVentral && ca < 0 ? f.ry * .82 : f.ry;
        const pos = f.p.clone().addScaledVector(f.d, ry * ca).addScaledVector(ZA, f.rz * sa);
        const nrm = f.d.clone().multiplyScalar(ca / ry).addScaledVector(ZA, sa / f.rz).normalize();
        push(pos, frameQuat(f.t, nrm), V(rg.len * 1.16, around * 1.2, Math.min(rg.len, around) * .45), part, Object.assign({ a, u: rg.u }, extra));
      }
    });
  }
  function sphere(center, r, count, partFn) {
    const size = Math.sqrt(4 * Math.PI * r * r / Math.max(1, count)) * 1.2;
    for (let i = 0; i < count; i++) {
      const y = 1 - 2 * (i + .5) / count, rad = Math.sqrt(1 - y * y), th = i * GA;
      const nrm = V(Math.cos(th) * rad, y, Math.sin(th) * rad);
      const tx = V(0, 1, 0).cross(nrm); if (tx.lengthSq() < 1e-4) tx.set(1, 0, 0);
      push(center.clone().addScaledVector(nrm, r), frameQuat(tx, nrm), V(size, size, size * .5), partFn(nrm));
    }
  }
  return { push, leaf, strand, tube, sphere };
}
const split = (total, parts) => { const out = []; let left = total; for (let i = 0; i < parts; i++) { const k = Math.round(left / (parts - i)); out.push(k); left -= k; } return out; };
const toV = a => V(a[0], a[1], a[2] || 0);

/* ---------- Camarón (adulto o postlarva) ---------- */
function buildShrimp(K, cfg, R) {
  const P = [], { push, leaf, strand, tube, sphere } = makeKit(P);
  const spine = new THREE.CatmullRomCurve3(cfg.spine.map(toV), false, 'centripetal');
  const SEG = [0, cfg.cara]; { let a = cfg.cara; for (const f of cfg.segs) { a += f * (1 - cfg.cara); SEG.push(a); } SEG[7] = 1; }
  const segOf = u => { for (let i = 0; i < 7; i++) if (u < SEG[i + 1]) return i; return 6; };
  const spineAt = u => { u = clamp(u, 0, 1); const p = spine.getPointAt(u), t = spine.getTangentAt(u); return { p, t, d: new THREE.Vector3().crossVectors(t, ZA).normalize() }; };
  const radius = u => {
    const c = cfg.cara;
    let ry = u < c ? cfg.rFront + (cfg.rMax - cfg.rFront) * smooth(0, c * .55, u) - .02 * smooth(c * .7, c, u)
                   : (cfg.rMax - .02) - (cfg.rMax - .02 - cfg.rTail) * Math.pow((u - c) / (1 - c), 1.15);
    const s = segOf(u), f = (u - SEG[s]) / (SEG[s + 1] - SEG[s]);
    ry *= 1 + .07 * smooth(.5, 1, f); // el borde posterior de cada placa monta sobre la siguiente
    return { ry, rz: ry * (s === 0 ? cfg.latC : cfg.latA), s, f };
  };
  const n = {}; let used = 0;
  for (const k in cfg.W) { n[k] = Math.max(4, Math.round(cfg.W[k] * K)); used += n[k]; }
  n.body = K - used;

  // caparazón y abdomen, alineados a los 7 segmentos
  tube(n.body, u => { const f = spineAt(u), r = radius(u); return { p: f.p, t: f.t, d: f.d, ry: r.ry, rz: r.rz }; }, SEG, 'body', u => { const r = radius(u); return { seg: r.s, f: r.f }; }, true);

  // abanico caudal: telson + 2 pares de urópodos
  (function tail(nt) {
    const E = spineAt(1), O = E.p.clone().addScaledVector(E.t, -.05);
    const spread = E.d.clone().multiplyScalar(Math.cos(cfg.fan.tilt)).addScaledVector(ZA, Math.sin(cfg.fan.tilt)).normalize();
    const fanN = E.t.clone().cross(spread).normalize();
    const uro = s => Math.pow(Math.sin(Math.PI * clamp(s, 0, 1)), .5) * (.55 + .45 * s) + .04;
    let left = nt;
    cfg.fan.blades.forEach((b, i) => {
      const cnt = i === cfg.fan.blades.length - 1 ? left : Math.round(nt * b.wt); left -= cnt;
      const dir = E.t.clone().multiplyScalar(Math.cos(b.ang)).addScaledVector(spread, Math.sin(b.ang)).normalize();
      const wdir = fanN.clone().cross(dir).normalize();
      leaf(O.clone().addScaledVector(fanN, b.off), dir, wdir, b.len, b.w, cnt, b.telson ? (s => (1 - s) * .88 + .1) : uro, 'tail', { base: O.clone() });
    });
  })(n.tail);

  // rostro
  (function rostrum(nr) {
    const H = spineAt(.02), base = H.p.clone().addScaledVector(H.d, cfg.rFront * .85);
    const dir = H.t.clone().negate().multiplyScalar(Math.cos(cfg.ros.ang)).addScaledVector(H.d, Math.sin(cfg.ros.ang)).normalize();
    const up = ZA.clone().cross(dir).normalize(), len = cfg.ros.len, q = frameQuat(dir, ZA);
    for (let i = 0; i < nr; i++) {
      const s = (i + .5) / nr, row = i % 2 ? 1 : -1, tooth = cfg.ros.teeth && i % 5 === 0 && s < .85, w = cfg.ros.w * (1 - s) + .014;
      const pos = base.clone().addScaledVector(dir, s * len).addScaledVector(up, row * w * .45 + (tooth ? w * .9 : 0));
      push(pos, q, V(len / nr * 2.6, w * 1.15, .03), 'ros');
    }
  })(n.ros);

  // ojos pedunculados
  split(n.eye, 2).forEach((cnt, k) => {
    const side = k ? -1 : 1, H = spineAt(.04), E = cfg.eye;
    const Cc = H.p.clone().addScaledVector(H.t, -E.fwd).addScaledVector(H.d, E.up).addScaledVector(ZA, side * E.z);
    const stalkN = Math.max(2, Math.round(cnt * .18)), S7 = spineAt(.07);
    const sb = S7.p.clone().addScaledVector(S7.d, .02).addScaledVector(ZA, side * .08);
    for (let i = 0; i < stalkN; i++) { const s = (i + .5) / stalkN; push(sb.clone().lerp(Cc, s * .8), frameQuat(Cc.clone().sub(sb), ZA.clone().multiplyScalar(side)), V(.06, .05, .03), 'stalk'); }
    const G = V(.35, .6, side * .72).normalize();
    sphere(Cc, E.r, cnt - stalkN, nrm => nrm.dot(G) > .9 ? 'glint' : 'eye');
  });

  // antenas largas
  split(n.ant, 2).forEach((cnt, k) => strand(cfg.ant[k].map(toV), cnt, cfg.antW[0], cfg.antW[1], 'ant', { side: k ? -1 : 1 }));

  // anténulas
  (function antennules(nl) {
    const paths = [], x0 = cfg.spine[0][0] + .05;
    for (const z of [1, -1]) {
      paths.push([V(x0, .04, z * .06), V(x0 + .25, .1, z * .08), V(x0 + .47, .2, z * .1), V(x0 + .63, .34, z * .12)]);
      paths.push([V(x0, 0, z * .05), V(x0 + .27, 0, z * .09), V(x0 + .53, .06, z * .12)]);
    }
    split(nl, 4).forEach((cnt, k) => strand(paths[k], cnt, .026, .012, 'antl', { k }));
  })(n.antl);

  // escama antenal
  split(n.scale, 2).forEach((cnt, k) => {
    const side = k ? -1 : 1, O = V(cfg.spine[0][0] - .08, 0, side * .15), dir = V(1, .12, side * .18).normalize();
    const wdir = V(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    leaf(O, dir, wdir, .42, .085, cnt, s => Math.pow(Math.sin(Math.PI * Math.min(1, .12 + s * .88)), .6) * .9 + .08, 'scale');
  });

  // pereiópodos: 5 pares de patas caminadoras
  split(n.leg, 10).forEach((cnt, k) => {
    const i = k >> 1, side = k % 2 ? -1 : 1, L = cfg.leg, u = L.u0 + i * L.du, S = spineAt(u), r = radius(u);
    const fwd = S.t.clone().negate();
    const b = S.p.clone().addScaledVector(S.d, -r.ry * .7).addScaledVector(ZA, side * r.rz * .8);
    const knee = b.clone().addScaledVector(S.d, -L.d1).addScaledVector(fwd, L.f1 - i * .03).addScaledVector(ZA, side * .08);
    const foot = knee.clone().addScaledVector(S.d, -L.d2).addScaledVector(fwd, L.f2 - i * .05).addScaledVector(ZA, side * .03);
    if (!cfg.exopods) { strand([b, knee, foot], Math.max(2, cnt), L.w[0], L.w[1], 'leg', { i, side }); return; }
    // mysis: endopodito + exopodito con setas, que rema
    const ce = Math.max(2, Math.round(cnt * .3)), cx = Math.max(2, Math.round(cnt * .25)), cs = Math.max(4, cnt - ce - cx);
    strand([b, knee, foot], ce, L.w[0], L.w[1], 'leg', { i, side });
    const A = { base: b.clone(), amp: .32, ph: i * .7, side: 1 };
    const exDir = S.d.clone().negate().multiplyScalar(Math.cos(.75)).addScaledVector(S.t, Math.sin(.75)).normalize();
    const e0 = b.clone().addScaledVector(ZA, side * .04), e1 = e0.clone().addScaledVector(exDir, .26);
    strand([e0, e0.clone().lerp(e1, .5).addScaledVector(S.t, .02), e1], cx, .026, .018, 'limb', A);
    split(cs, 4).forEach((c2, m) => {
      const from = e0.clone().lerp(e1, .4 + m * .2), sd = exDir.clone().applyAxisAngle(ZA, -(.2 + m * .12));
      strand([from, from.clone().addScaledVector(sd, .14).addScaledVector(S.t, .02), from.clone().addScaledVector(sd, .28)], Math.max(2, c2), .018, .008, 'seta', A);
    });
  });

  // pleópodos: 5 pares de nadadores bajo el abdomen
  split(n.pleo, 10).forEach((cnt, k) => {
    const seg = (k >> 1) + 1, side = k % 2 ? -1 : 1, u = (SEG[seg] + SEG[seg + 1]) / 2, S = spineAt(u), r = radius(u);
    const b = S.p.clone().addScaledVector(S.d, -r.ry * .78).addScaledVector(ZA, side * .07);
    const dir = S.d.clone().negate().multiplyScalar(Math.cos(.35)).addScaledVector(S.t, Math.sin(.35)).normalize();
    const wdir = ZA.clone().cross(dir).normalize();
    leaf(b, dir, wdir, cfg.pleo.len * (1 - seg * .07), cfg.pleo.w, Math.max(2, cnt), s => .45 + .55 * Math.sin(Math.PI * s), 'pleo', { seg, side, base: b.clone() });
  });

  // cromatóforos larvales: puntos rojizos, más densos en el vientre
  if (cfg.larval) P.forEach(pc => {
    if (pc.part === 'body') pc.chromo = R() < (Math.cos(pc.a) < -.2 ? .1 : .02);
    else if (/^(ant|antl|leg|pleo|tail)$/.test(pc.part)) pc.chromo = R() < .08;
  });
  if (cfg.tilt) rotateShape(P, cfg.tilt);
  return P;
}
function rotateShape(P, ang) {
  const q = new THREE.Quaternion().setFromAxisAngle(ZA, ang), seen = new Set();
  P.forEach(pc => {
    pc.p.applyQuaternion(q);
    if (!seen.has(pc.q)) { seen.add(pc.q); pc.q.premultiply(q); }
    if (pc.base && !seen.has(pc.base)) { seen.add(pc.base); pc.base.applyQuaternion(q); }
  });
}

/* Apéndices larvales: segmentos con setas que reman alrededor de su base */
function limbMaker(specs) {
  const dirA = (deg, side) => V(side * Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), 0);
  return function seg(from, deg, len, side, w0, w1, part, anim, bend, dz) {
    const d = dirA(deg, side), perp = V(-d.y, d.x, 0).multiplyScalar(side);
    const end = from.clone().addScaledVector(d, len), mid = from.clone().addScaledVector(d, len * .5).addScaledVector(perp, (bend || 0) * len);
    if (dz) { end.z += dz; mid.z += dz * .5; }
    specs.push({ pts: [from.clone(), mid, end], len, w0, w1, part, anim });
    return end;
  };
}
function sizeSpecs(specs, budget) {
  const totLen = specs.reduce((a, s) => a + s.len, 0);
  specs.forEach(s => s.cnt = Math.max(2, Math.round(budget * s.len / totLen)));
  return specs.reduce((a, s) => a + s.cnt, 0);
}
function emitSpecs(strand, specs) {
  specs.forEach(s => strand(s.pts, s.cnt, s.w0, s.w1, s.part, s.anim ? { base: s.anim.base, amp: s.anim.amp, ph: s.anim.ph, side: s.anim.side } : {}));
}

/* ---------- Zoea (vista dorsal, cabeza hacia +y) ---------- */
function buildZoea(K, R) {
  const P = [], { strand, tube, sphere } = makeKit(P), specs = [], seg = limbMaker(specs);
  for (const side of [1, -1]) {
    // anténula y antena: los remos de la zoea
    const A1 = { base: V(side * .1, 1, .06), amp: .1, ph: 0, side };
    const e1 = seg(A1.base, 72, .72, side, .05, .035, 'limb', A1, .06);
    [90, 74, 58].forEach(d => seg(e1, d, .5, side, .022, .01, 'seta', A1, .1));
    const A2 = { base: V(side * .28, .9, .04), amp: .28, ph: 1.2, side };
    const j2 = seg(A2.base, 30, .34, side, .065, .055, 'limb', A2);
    const ex = seg(j2, 44, .46, side, .05, .035, 'limb', A2, .06), en = seg(j2, 12, .32, side, .045, .035, 'limb', A2, -.04);
    [72, 57, 42, 27].forEach(d => seg(ex, d, .55, side, .022, .01, 'seta', A2, .12));
    [20, 4].forEach(d => seg(en, d, .42, side, .022, .01, 'seta', A2, .1));
    // maxilípedos 1 y 2, birrámeos
    const X1 = { base: V(side * .38, .45, 0), amp: .2, ph: 2.2, side };
    const j3 = seg(X1.base, -8, .28, side, .055, .045, 'limb', X1);
    const ex3 = seg(j3, 2, .3, side, .045, .035, 'limb', X1, .04), en3 = seg(j3, -32, .22, side, .04, .03, 'limb', X1, -.04);
    [12, -4, -20].forEach(d => seg(ex3, d, .38, side, .02, .01, 'seta', X1, .1));
    [-38, -54].forEach(d => seg(en3, d, .3, side, .02, .01, 'seta', X1, .1));
    const X2 = { base: V(side * .34, .2, 0), amp: .2, ph: 2.9, side };
    const j4 = seg(X2.base, -34, .26, side, .05, .04, 'limb', X2);
    const ex4 = seg(j4, -24, .28, side, .04, .03, 'limb', X2, .04), en4 = seg(j4, -58, .2, side, .035, .03, 'limb', X2, -.04);
    [-14, -30, -46].forEach(d => seg(ex4, d, .34, side, .02, .01, 'seta', X2, .1));
    [-62, -78].forEach(d => seg(en4, d, .26, side, .02, .01, 'seta', X2, .1));
    // furca del telson con espinas largas
    const FU = { base: V(side * .03, -1.6, 0), amp: .03, ph: .4, side };
    const f = seg(FU.base, -68, .3, side, .055, .03, 'zspine', null);
    [-48, -70, -94].forEach((d, k) => seg(f, d, [.42, .5, .38][k], side, .022, .01, 'seta', FU, .05));
    seg(V(side * .16, .95, .08), 42, .2, side, .05, .045, 'zstalk', null); // pedúnculo ocular
  }
  seg(V(0, 1, .12), 90, .32, 1, .05, .015, 'zspine', null); // rostro
  for (let k = 0; k < 4; k++) seg(V(0, -.5 - k * .28, .1), -90, .1, 1, .03, .01, 'zspine', null, 0, .08); // espinas dorsales
  const nEye = Math.max(16, Math.round(K * .05)), used = sizeSpecs(specs, Math.round(K * .42));
  const rest = K - nEye - used, nCara = Math.round(rest * .58);
  // caparazón ovalado que cubre el cefalotórax
  tube(nCara, u => { const s = 2 * u - 1, b = Math.sqrt(Math.max(0, 1 - s * s * .96)); return { p: V(0, 1.05 - u, 0), t: V(0, -1, 0), d: V(-1, 0, 0), ry: .46 * b * (1 - .12 * u) + .02, rz: .24 * b + .02 }; }, [0, 1], 'zcara', null, false);
  // tórax y abdomen segmentados
  const ZS = [0, .1, .2, .3, .42, .54, .66, .8, 1];
  tube(rest - nCara, u => {
    let k = 0; while (k < 7 && u >= ZS[k + 1]) k++;
    const f = (u - ZS[k]) / (ZS[k + 1] - ZS[k]), bump = 1 + .12 * smooth(.5, 1, f), tp = 1 - .5 * u;
    return { p: V(0, .15 - 1.75 * u, -.02), t: V(0, -1, 0), d: V(-1, 0, 0), ry: .16 * tp * bump, rz: .12 * tp * bump };
  }, ZS, 'zabd', null, false);
  sphere(V(.34, 1.11, .08), .11, nEye >> 1, () => 'zeye');
  sphere(V(-.34, 1.11, .08), .11, nEye - (nEye >> 1), () => 'zeye');
  emitSpecs(strand, specs);
  P.forEach(pc => { if (pc.part === 'zabd') pc.chromo = R() < .07; });
  return P;
}

/* ---------- Nauplio ---------- */
function buildNauplius(K, _R) {   // _R: misma firma que los demás constructores
  const P = [], { strand, tube, sphere } = makeKit(P), specs = [];
  const dirA = (deg, side) => V(side * Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), 0);
  function seg(from, deg, len, side, w0, w1, part, anim, bend) {
    const d = dirA(deg, side), perp = V(-d.y, d.x, 0).multiplyScalar(side);
    const end = from.clone().addScaledVector(d, len);
    const mid = from.clone().addScaledVector(d, len * .5).addScaledVector(perp, (bend || 0) * len);
    specs.push({ pts: [from.clone(), mid, end], len, w0, w1, part, anim });
    return end;
  }
  for (const side of [1, -1]) {
    // anténula (A1): unirrámea, con setas apicales
    const A1 = { base: V(side * .26, .7, .12), amp: .12, ph: 0, side };
    const e1 = seg(A1.base, 62, .62, side, .06, .045, 'limb', A1, .08);
    [84, 66, 48].forEach(d => seg(e1, d, .55, side, .026, .01, 'seta', A1, .1));
    // antena (A2): birrámea, el remo principal
    const A2 = { base: V(side * .5, .32, .06), amp: .3, ph: 1.2, side };
    const j2 = seg(A2.base, 16, .4, side, .07, .06, 'limb', A2);
    const ex = seg(j2, 32, .5, side, .055, .04, 'limb', A2, .06), en = seg(j2, -10, .36, side, .05, .04, 'limb', A2, -.05);
    [56, 40, 24, 8].forEach(d => seg(ex, d, .58, side, .024, .01, 'seta', A2, .12));
    [-4, -20].forEach(d => seg(en, d, .46, side, .024, .01, 'seta', A2, .1));
    // mandíbula (Md): birrámea
    const MD = { base: V(side * .47, -.04, .03), amp: .24, ph: 2.3, side };
    const j3 = seg(MD.base, -22, .3, side, .065, .055, 'limb', MD);
    const ex3 = seg(j3, -8, .36, side, .05, .04, 'limb', MD, .05), en3 = seg(j3, -42, .26, side, .045, .035, 'limb', MD, -.05);
    [0, -14, -28].forEach(d => seg(ex3, d, .42, side, .022, .01, 'seta', MD, .1));
    [-44, -60].forEach(d => seg(en3, d, .34, side, .022, .01, 'seta', MD, .1));
    // espinas furcales
    const FU = { base: V(side * .07, -.9, 0), amp: .04, ph: .5, side };
    seg(FU.base, -74, .36, side, .045, .02, 'furca', FU);
    seg(FU.base.clone().add(V(side * .05, .04, 0)), -55, .26, side, .03, .012, 'furca', FU);
  }
  const nEye = Math.max(12, Math.round(K * .025)), budget = Math.round(K * .44);
  const totLen = specs.reduce((a, s) => a + s.len, 0);
  specs.forEach(s => s.cnt = Math.max(2, Math.round(budget * s.len / totLen)));
  const nBody = K - nEye - specs.reduce((a, s) => a + s.cnt, 0);
  // cuerpo piriforme, ancho adelante; eje a lo largo de y, ancho en x, grosor en z
  tube(nBody, u => {
    const s = 2 * u - 1, base = Math.sqrt(Math.max(0, 1 - s * s * .97)), taper = 1 - .3 * u;
    return { p: V(0, .95 - 1.9 * u, 0), t: V(0, -1, 0), d: V(-1, 0, 0), ry: .62 * base * taper + .02, rz: .4 * base * taper + .02 };
  }, [0, 1], 'nbody', null, false);
  sphere(V(0, .8, .2), .075, nEye, () => 'neye'); // ojo naupliar
  specs.forEach(s => strand(s.pts, s.cnt, s.w0, s.w1, s.part, { base: s.anim.base, amp: s.anim.amp, ph: s.anim.ph, side: s.anim.side }));
  return P;
}

/* ---------- Logo a partir de una imagen ---------- */
function analyzeImage(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const sc = Math.min(1, 300 / Math.max(iw, ih)), w = Math.max(8, Math.round(iw * sc)), h = Math.max(8, Math.round(ih * sc));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, n = w * h, fg = new Uint8Array(n).fill(1);
  let transp = 0; for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 128) transp++;
  if (transp > n * .02) { for (let i = 0; i < n; i++) fg[i] = d[i * 4 + 3] >= 128 ? 1 : 0; }
  else {
    // fondo liso: relleno desde el borde con el color más común del borde
    const border = []; for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
    const hist = new Map(); border.forEach(i => { const k = (d[i * 4] >> 4) << 8 | (d[i * 4 + 1] >> 4) << 4 | d[i * 4 + 2] >> 4; hist.set(k, (hist.get(k) || 0) + 1); });
    const key = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0];
    let rr = 0, gg = 0, bb = 0, cnt = 0;
    border.forEach(i => { const k = (d[i * 4] >> 4) << 8 | (d[i * 4 + 1] >> 4) << 4 | d[i * 4 + 2] >> 4; if (k === key) { rr += d[i * 4]; gg += d[i * 4 + 1]; bb += d[i * 4 + 2]; cnt++; } });
    rr /= cnt; gg /= cnt; bb /= cnt;
    const near = i => { const dr = d[i * 4] - rr, dg = d[i * 4 + 1] - gg, db = d[i * 4 + 2] - bb; return dr * dr + dg * dg + db * db < 48 * 48; };
    const stack = border.filter(near); stack.forEach(i => fg[i] = 0);
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && fg[j] && near(j)) { fg[j] = 0; stack.push(j); }
    }
  }
  // paleta: colores dominantes de la figura
  const bins = new Map(); let fgCount = 0;
  for (let i = 0; i < n; i++) if (fg[i]) {
    fgCount++;
    const k = (d[i * 4] >> 4) << 8 | (d[i * 4 + 1] >> 4) << 4 | d[i * 4 + 2] >> 4;
    let b = bins.get(k); if (!b) { b = { n: 0, r: 0, g: 0, b: 0 }; bins.set(k, b); }
    b.n++; b.r += d[i * 4]; b.g += d[i * 4 + 1]; b.b += d[i * 4 + 2];
  }
  if (fgCount < 40) throw new Error('empty');
  const pal = [];
  [...bins.values()].sort((a, b) => b.n - a.n).forEach(b => {
    const m = [b.r / b.n, b.g / b.n, b.b / b.n];
    const hit = pal.find(p => (p.r / p.n - m[0]) ** 2 + (p.g / p.n - m[1]) ** 2 + (p.b / p.n - m[2]) ** 2 < 70 * 70);
    if (hit) { hit.n += b.n; hit.r += b.r; hit.g += b.g; hit.b += b.b; } else if (pal.length < 6) pal.push(Object.assign({}, b));
  });
  const palette = pal.filter((p, i) => i === 0 || p.n / fgCount >= .025).sort((a, b) => b.n - a.n)
    .map(p => ({ share: p.n / fgCount, rgb: [p.r / p.n, p.g / p.n, p.b / p.n], c: new THREE.Color(p.r / p.n / 255, p.g / p.n / 255, p.b / p.n / 255) }));
  const label = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (fg[i]) {
    let best = 0, bd = 1e9;
    palette.forEach((p, k) => { const dd = (d[i * 4] - p.rgb[0]) ** 2 + (d[i * 4 + 1] - p.rgb[1]) ** 2 + (d[i * 4 + 2] - p.rgb[2]) ** 2; if (dd < bd) { bd = dd; best = k; } });
    label[i] = best;
  }
  return { w, h, fg, label, palette, fgCount, thumb: cv.toDataURL('image/png') };
}

// Mosaico adaptativo (quadtree): piezas grandes en zonas de un solo color y piezas finas
// en los bordes del dibujo, para que letras pequeñas como la «a» conserven su forma.
function buildLogo(target, L) {
  const { w, h, fg, label, palette } = L, np = palette.length, W1 = w + 1;
  const sat = []; for (let k = 0; k <= np; k++) sat.push(new Int32Array(W1 * (h + 1)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = (y + 1) * W1 + x + 1;
    for (let k = 0; k <= np; k++) { const v = k === np ? fg[i] : (fg[i] && label[i] === k ? 1 : 0), S = sat[k]; S[o] = v + S[o - 1] + S[o - W1] - S[o - W1 - 1]; }
  }
  const area = (k, x0, y0, x1, y1) => { const S = sat[k]; return S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0]; };
  const fgAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && fg[y * w + x] === 1;
  function leaves(f) {
    const out = [], B = f * 4;
    (function walk() {
      for (let y = 0; y < h; y += B) for (let x = 0; x < w; x += B) rec(x, y, B);
    })();
    function rec(x, y, sz) {
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w, Math.floor(x + sz)), y1 = Math.min(h, Math.floor(y + sz));
      if (x1 <= x0 || y1 <= y0) return;
      const tot = (x1 - x0) * (y1 - y0), nf = area(np, x0, y0, x1, y1);
      if (nf / tot <= .03) return;
      let b = 0, bv = -1; for (let k = 0; k < np; k++) { const v = area(k, x0, y0, x1, y1); if (v > bv) { bv = v; b = k; } }
      if ((nf / tot >= .97 && bv / nf >= .95) || sz <= f * 1.01) { if (nf / tot >= .5) out.push({ x0, y0, x1, y1, lb: b }); return; }
      const hs = sz / 2; rec(x, y, hs); rec(x + hs, y, hs); rec(x, y + hs, hs); rec(x + hs, y + hs, hs);
    }
    out.forEach(c => {
      let rim = false;
      for (let x = c.x0 - 1; x <= c.x1 && !rim; x++) if (!fgAt(x, c.y0 - 1) || !fgAt(x, c.y1)) rim = true;
      for (let y = c.y0; y < c.y1 && !rim; y++) if (!fgAt(c.x0 - 1, y) || !fgAt(c.x1, y)) rim = true;
      c.rim = rim;
    });
    return out;
  }
  const count = lv => lv.reduce((a, c) => a + (c.rim ? 2 : 1), 0);
  let lo = .75, hi = Math.max(w, h) / 8, best = null;
  for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2, lv = leaves(mid); if (count(lv) > target) lo = mid; else { hi = mid; best = lv; } }
  if (!best) best = leaves(hi);
  const P = [], { push } = makeKit(P), s = 3.4 / Math.max(w, h), R0 = 1.75, d = 2 * hi * s;
  best.forEach(c => {
    const x = ((c.x0 + c.x1) / 2 - w / 2) * s, y = (h / 2 - (c.y0 + c.y1) / 2) * s;
    const z0 = .2 * (1 - Math.min(1, (x * x + y * y) / (R0 * R0))); // leve cúpula, como una moneda
    const q = frameQuat(V(1, 0, 0), V(.4 * x / (R0 * R0), .4 * y / (R0 * R0), 1));
    const col = palette[c.lb].c, raised = c.lb !== 0; // el color secundario queda en relieve
    const sx = (c.x1 - c.x0) * s * 1.02, sy = (c.y1 - c.y0) * s * 1.02;
    push(V(x, y, z0 + (raised ? d * .3 : 0)), q, V(sx, sy, d * (raised ? 1.2 : .6)), 'logo', { lc: col });
    if (c.rim) push(V(x, y, z0 - d * .7), q, V(sx, sy, d * .6), 'logo', { lc: col.clone().multiplyScalar(.62) });
  });
  return P;
}
function brandColors(L) {
  const hsl = { h: 0, s: 0, l: 0 };
  let pick = null, best = -1;
  L.palette.forEach(p => { p.c.getHSL(hsl); const sc = hsl.s * Math.pow(p.share, .3); if (hsl.s > .2 && sc > best) { best = sc; pick = p; } });
  if (!pick) return { accL: '#3d4a4d', accD: '#b9c6c8', ink: '#1d2226' };
  pick.c.getHSL(hsl);
  const hex = (h, s, l) => '#' + new THREE.Color().setHSL(h, s, l).getHexString();
  let inkL = Math.min(hsl.l, .22), ink;
  do { ink = new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, .85), inkL); inkL -= .02; } while (lum(ink) > .045 && inkL > .04);
  return { accL: hex(hsl.h, Math.min(hsl.s, .75), .36), accD: hex(hsl.h, Math.min(hsl.s, .8), .72), ink: '#' + ink.getHexString() };
}
function lum(c) { const f = v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); }

/* ---------- Color de cada pieza ---------- */
function pieceColor(pc, sid, r, out) {
  const c = C[sid], sp = SP(sid), L = LARVA;
  switch (pc.part) {
    case 'logo': return out.copy(pc.lc).multiplyScalar(.96 + r * .08).convertSRGBToLinear();
    case 'nbody': {
      const facing = Math.sin(pc.a), edge = Math.abs(Math.cos(pc.a));
      out.copy(L.amber).lerp(c.body, .22);
      out.lerp(L.core, smooth(.1, .9, facing) * smooth(.12, .5, pc.u) * (1 - smooth(.72, .95, pc.u)) * .75); // vitelo
      out.lerp(L.pale, smooth(.55, 1, edge) * .4);
      break;
    }
    case 'neye': out.copy(L.neye); break;
    case 'limb': out.copy(L.amber).lerp(L.pale, .4).lerp(c.leg, .2); break;
    case 'seta': out.copy(L.pale).lerp(c.leg, .25); break;
    case 'furca': out.copy(L.pale).lerp(L.amber, .3); break;
    case 'zcara': {
      const facing = Math.sin(pc.a);
      out.copy(L.glass).lerp(L.amber, .3).lerp(c.body, .12);
      out.lerp(L.gut, smooth(.75, .98, facing) * smooth(.25, .5, pc.u) * .55); // glándula digestiva con microalgas
      out.lerp(L.pale, smooth(.6, 1, Math.abs(Math.cos(pc.a))) * .3);
      break;
    }
    case 'zabd': out.copy(L.glass).lerp(c.body, .12); if (Math.sin(pc.a) > .8) out.lerp(L.gut, .55); if (pc.chromo) out.copy(L.chromo); break;
    case 'zeye': out.copy(L.neye).lerp(c.eye, .5); break;
    case 'zstalk': out.copy(L.glass); break;
    case 'zspine': out.copy(L.glass).lerp(L.pale, .5); break;
    case 'body': {
      const dors = Math.cos(pc.a);
      out.copy(c.belly).lerp(c.body, smooth(-.7, .4, dors)).lerp(c.body2, smooth(.25, 1, dors) * .55);
      if (sp.pattern === 'tiger') {
        if (pc.seg > 0) { if (pc.f > .7) out.lerp(c.stripe, .85); else if (pc.f > .55) out.lerp(c.band, .7); }
        else if (Math.sin(pc.u * 70) > .55) out.lerp(c.stripe, .6);
      } else if (sp.pattern === 'cooked') {
        if (pc.seg > 0 && pc.f > .74) out.lerp(c.band, .7 - .3 * Math.max(0, dors));
      } else if (pc.seg > 0 && pc.f > .78) out.lerp(c.band, .5);
      break;
    }
    case 'tail': out.copy(pc.rim ? c.rim : c.tail); break;
    case 'ros': out.copy(c.body2).lerp(c.rim, .25); break;
    case 'eye': out.copy(c.eye); break;
    case 'glint': out.copy(c.glint); break;
    case 'stalk': out.copy(c.body).lerp(c.leg, .5); break;
    case 'ant': case 'antl': out.copy(c.antenna); break;
    case 'scale': out.copy(pc.rim ? c.body2 : c.belly).lerp(c.body, .35); break;
    case 'leg': out.copy(c.leg); break;
    case 'pleo': out.copy(pc.rim ? c.rim : c.leg).lerp(c.leg, pc.rim ? .45 : 0); break;
    default: out.copy(c.body);
  }
  if (FORM(formId).glass && pc.part !== 'eye' && pc.part !== 'glint') {
    out.lerp(L.glass, .45); // cuerpo translúcido de mysis y postlarva
    if (pc.part === 'body' && pc.seg > 0 && Math.abs(Math.cos(pc.a)) < .22) out.lerp(L.gut, .5); // intestino visible
    if (pc.chromo) out.copy(L.chromo).lerp(c.rim, .25);
  }
  return out.multiplyScalar(.95 + r * .1).convertSRGBToLinear();
}

/* ---------- Escena ---------- */
const stage = $('#stage'), canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa3a5, .72));
const key = new THREE.DirectionalLight(0xffffff, .9); key.position.set(2.5, 4, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xd6e8ff, .35); fill.position.set(-4, -1, 3); scene.add(fill);

const CARD = 4; // lado de la tarjeta del QR en unidades de mundo
const card = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(CARD, CARD, .16), 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false }));
scene.add(card);
const shadowTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64); grd.addColorStop(0, 'rgba(10,30,34,.32)'); grd.addColorStop(1, 'rgba(10,30,34,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv);
})();
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(CARD * 1.32, CARD * 1.32), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0, depthWrite: false }));
shadow.position.set(0, -.08, -.02); scene.add(shadow);
// tinta impresa bajo las piezas: rellena las juntas para que el lector vea módulos sólidos
const print = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
print.position.z = .003; scene.add(print);
shadow.renderOrder = 0; card.renderOrder = 1; print.renderOrder = 2;

const tileGeo = (() => {
  const b = .1, shape = roundedRect(1 - 2 * b, 1 - 2 * b, .14);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1 - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 2 });
  g.center(); g.computeVertexNormals(); return g;
})();
const tileMat = new THREE.MeshPhysicalMaterial({ roughness: .58, metalness: 0, clearcoat: .22, clearcoatRoughness: .5 });

/* ---------- Estado ---------- */
let qrDark = [], mesh = null, pieces = [], qrN = 0, darkCount = 0, center = V(0, 0, 0), SCALE = 1;
let speciesId = 'blanco', formId = 'adulto', colorFade = 1;
let phase = 0, target = 0, T = 0, last = performance.now();
let userYaw = 0, userPitch = 0, currentUrl = '';
const logos = {}; // por forma: { data, name, src, brand, uploaded }
const curLogo = () => (FORM(formId).logo && logos[formId]) || null;
const MAXD = .44, DUR = .56;

function build(text) {
  const qr = qrcode(0, 'Q'); qr.addData(text, 'Byte'); qr.make();
  const N = qr.getModuleCount(), M = N * N, R = rng(7 + text.length * 131);
  const fm = FORM(formId), Kt = Math.max(M, fm.target);
  const make = {
    nauplio: () => buildNauplius(Kt, R), zoea: () => buildZoea(Kt, R), mysis: () => buildShrimp(Kt, MYSIS, R),
    pl1: () => buildShrimp(Kt, PL1, R),
  };
  const shape = curLogo() ? buildLogo(fm.target, curLogo().data) : (make[formId] || (() => buildShrimp(Kt, ADULT, R)))();
  const K = Math.max(M, shape.length); // el logo decide su propio número de piezas
  for (let k = 0; shape.length < K; k++) { const src = shape[(k * 7919) % shape.length]; shape.push(Object.assign({}, src, { p: src.p.clone().add(V(0, 0, -.004)) })); }
  const box = new THREE.Box3(); shape.forEach(p => box.expandByPoint(p.p));
  center = box.getCenter(V(0, 0, 0));
  SCALE = Math.min(4.15 / (box.max.x - box.min.x), 3.5 / (box.max.y - box.min.y));
  if (fm.show) SCALE = Math.min(SCALE, fm.show / fm.len); // tamaño relativo entre estadios
  // columnas del QR ↔ franjas de la figura de izquierda a derecha; filas ↔ altura.
  // Si hay más piezas que módulos, la primera de cada celda es el módulo y las demás se funden en la tarjeta.
  const order = shape.map((p, i) => ({ i, k: p.p.x + (R() - .5) * .16 })).sort((a, b) => a.k - b.k);
  const cell = CARD / (N + 8), th = cell * .32;
  qrDark = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) qrDark.push(qr.isDark(r, c));
  print.scale.set(N * cell, N * cell, 1);
  darkCount = 0;
  for (let c = 0, idx = 0; c < N; c++) {
    const size = Math.round((c + 1) * K / N) - Math.round(c * K / N);
    const col = order.slice(idx, idx + size).map(o => ({ i: o.i, k: shape[o.i].p.y + (R() - .5) * .12 })).sort((a, b) => b.k - a.k);
    idx += size;
    col.forEach((o, j) => {
      const r = Math.floor(j * N / size), primary = j === Math.ceil(r * size / N);
      const pc = shape[o.i], dark = primary && qr.isDark(r, c);
      if (dark) darkCount++;
      pc.dark = dark;
      pc.qp = V((c - (N - 1) / 2) * cell, ((N - 1) / 2 - r) * cell, th / 2 + .004);
      // 1,02 y no ,95 (2026-10-05): con la junta abierta, el brillo del bisel entre piezas cortaba los patrones de
      // posición y un lector no leía la imagen nítida (jsQR: sólo reducida); cerrada, se lee también a tamaño completo
      pc.qs = dark ? V(cell * 1.02, cell * 1.02, th) : V(1e-4, 1e-4, 1e-4);
      pc.delay = MAXD * .75 * (c / (N - 1)) + MAXD * .25 * R();
    });
  }
  shape.forEach(pc => {
    pc.rc = R();
    const dir = V(pc.p.x - center.x, pc.p.y - center.y, 0); if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    pc.scat = reduced ? V(0, 0, 0) : dir.normalize().multiplyScalar(.5 + R() * .9).add(V(0, 0, .6 + R() * 1.4));
    pc.axis = V(R() - .5, R() - .5, R() - .5).normalize();
    pc.turns = reduced ? 0 : (R() < .65 ? (R() < .5 ? 1 : -1) : 0);
    pc.cs = new THREE.Color(); pc.cq = new THREE.Color(); pc.csP = new THREE.Color(); pc.cqP = new THREE.Color();
  });
  if (mesh) { scene.remove(mesh); if (mesh.dispose) mesh.dispose(); }
  mesh = new THREE.InstancedMesh(tileGeo, tileMat, K);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color()); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  pieces = shape; qrN = N;
  applyColors(speciesId, true);
}

const inkHex = () => curLogo() ? curLogo().brand.ink : SP(speciesId).ink;
function applyColors(sid, instant) {
  const ink = new THREE.Color(inkHex());
  pieces.forEach(pc => {
    pc.csP.copy(pc.cs); pc.cqP.copy(pc.cq);
    pieceColor(pc, sid, pc.rc, pc.cs);
    if (pc.dark) pc.cq.copy(ink).multiplyScalar(.88 + pc.rc * .24).convertSRGBToLinear(); else pc.cq.copy(pc.cs);
  });
  colorFade = instant ? 1 : 0;
  paintPrint();
}
function paintPrint() {
  const cv = document.createElement('canvas'); cv.width = cv.height = qrN;
  const g = cv.getContext('2d'); g.fillStyle = inkHex();
  for (let i = 0; i < qrDark.length; i++) if (qrDark[i]) g.fillRect(i % qrN, Math.floor(i / qrN), 1, 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.encoding = THREE.sRGBEncoding;
  if (print.material.map) print.material.map.dispose();
  print.material.map = tex; print.material.needsUpdate = true;
}

/* ---------- Cámara y tamaño ---------- */
let W = 1, H = 1;
function resize() {
  const r = stage.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2, fit = .8;
  camera.position.set(0, 0, camera.aspect >= 1 ? CARD / (fit * t) : CARD / (fit * t * camera.aspect));
  camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
}
const ro = new ResizeObserver(resize); ro.observe(stage);
resize();

/* ---------- Bucle de animación ---------- */
const m4 = new THREE.Matrix4(), qG = new THREE.Quaternion(), eul = new THREE.Euler(), qa = new THREE.Quaternion(), qs = new THREE.Quaternion(), qI = new THREE.Quaternion();
const vL = V(0, 0, 0), vP = V(0, 0, 0), sA = V(0, 0, 0), sP = V(0, 0, 0), col = new THREE.Color(), colB = new THREE.Color();
function animLocal(pc, out) {
  out.copy(pc.p);
  if (reduced || !pc.base) return out;
  let th;
  switch (pc.part) {
    case 'pleo': th = .32 * Math.sin(T * 8.5 - pc.seg * .9 + (pc.side > 0 ? 0 : .5)); break;
    case 'leg': th = .07 * Math.sin(T * 2.4 + pc.i * .9 + pc.side); break;
    case 'ant': th = .045 * Math.sin(T * 1.1 + pc.side * 1.7) + .035 * pc.sa * Math.sin(T * 2.1 - pc.sa * 5 + pc.side); break;
    case 'antl': th = .09 * Math.sin(T * 3 + pc.k * 1.3); break;
    case 'tail': th = .035 * Math.sin(T * 1.4); break;
    case 'limb': case 'seta': case 'furca': th = pc.amp * Math.sin(T * 5.2 + pc.ph) * pc.side; break; // remada del nauplio
    default: return out;
  }
  const x = out.x - pc.base.x, y = out.y - pc.base.y, c = Math.cos(th), s = Math.sin(th);
  out.x = pc.base.x + x * c - y * s; out.y = pc.base.y + x * s + y * c;
  return out;
}
let rafId = 0, disposed = false;
function frame(now) {
  if (!root.isConnected) { dispose(); return; }
  rafId = requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }   // pestaña oculta: no se dibuja (batería)
  const dt = Math.min(.05, (now - last) / 1000); last = now; T += dt;
  const speed = 1 / (reduced ? .9 : 2.6);
  if (phase < target) phase = Math.min(target, phase + dt * speed); else if (phase > target) phase = Math.max(target, phase - dt * speed);
  if (colorFade < 1) colorFade = Math.min(1, colorFade + dt / .5);
  draw();
}
function draw() {
  if (!mesh) return;
  const idle = reduced ? 0 : 1;
  const sway = FORM(formId).logo ? .5 : 1; // el logo se mantiene casi de frente para leerse
  eul.set(userPitch + idle * .07 * sway * Math.sin(T * .47), userYaw + idle * .42 * sway * Math.sin(T * .33), idle * .03 * sway * Math.sin(T * .6), 'YXZ');
  qG.setFromEuler(eul);
  const bob = idle * .06 * Math.sin(T * 1.1), Pp = phase * (MAXD + DUR), cf = colorFade;
  for (let i = 0; i < pieces.length; i++) {
    const pc = pieces[i];
    const raw = clamp((Pp - pc.delay) / DUR, 0, 1), e = ease(raw);
    if (raw < 1) {
      animLocal(pc, vL).sub(center).multiplyScalar(SCALE).applyQuaternion(qG); vL.y += bob;
      qa.copy(qG).multiply(pc.q); sA.copy(pc.s).multiplyScalar(SCALE);
    }
    if (raw <= 0) { vP.copy(vL); sP.copy(sA); }
    else if (raw >= 1) { vP.copy(pc.qp); qa.copy(qI); sP.copy(pc.qs); }
    else {
      vP.copy(vL).lerp(pc.qp, e).addScaledVector(pc.scat, Math.sin(Math.PI * e));
      qa.slerp(qI, e); if (pc.turns) qa.multiply(qs.setFromAxisAngle(pc.axis, TAU * pc.turns * e));
      if (pc.dark) sP.copy(sA).lerp(pc.qs, e); else sP.copy(sA).multiplyScalar(Math.max(1e-4, 1 - smooth(.5, 1, raw)));
    }
    m4.compose(vP, qa, sP); mesh.setMatrixAt(i, m4);
    const ce = smooth(.25, .85, raw);
    col.copy(pc.cs).lerp(pc.cq, ce);
    if (cf < 1) { colB.copy(pc.csP).lerp(pc.cqP, ce); col.lerp(colB, 1 - cf); }
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  const ct = smooth(.18, .72, phase);
  card.material.opacity = ct; shadow.material.opacity = ct; card.visible = shadow.visible = ct > .002;
  card.scale.setScalar(.94 + .06 * ct); shadow.scale.setScalar(.94 + .06 * ct);
  const pt = smooth(.72, 1, phase); print.material.opacity = pt; print.visible = pt > .002;
  renderer.render(scene, camera);
}

/* ---------- Interfaz ---------- */
const hint = $('#hint'), toggleBtn = $('#toggle');
function setTarget(t) {
  target = t;
  const fm = FORM(formId);
  hint.textContent = t ? 'Toca el código para volver ' + fm.back : 'Toca ' + fm.noun + ' para formar el QR';
  toggleBtn.textContent = t ? 'Volver ' + fm.back : 'Formar QR';
  canvas.setAttribute('aria-label', t ? 'Código QR. Pulsa Enter para volver ' + fm.back + '.' : 'Figura 3D: ' + fm.noun + '. Pulsa Enter para formar el código QR.');
}
toggleBtn.addEventListener('click', () => setTarget(target ? 0 : 1));

let down = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, yaw: userYaw, pitch: userPitch, moved: false, id: e.pointerId }; });
canvas.addEventListener('pointermove', e => {
  if (!down || e.pointerId !== down.id) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (!down.moved && Math.hypot(dx, dy) > 7) { down.moved = true; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
  if (down.moved && target === 0) { userYaw = down.yaw + dx * .008; if (e.pointerType === 'mouse') userPitch = clamp(down.pitch + dy * .005, -.5, .5); }
});
canvas.addEventListener('pointerup', () => { if (down && !down.moved) setTarget(target ? 0 : 1); down = null; });
canvas.addEventListener('pointercancel', () => { down = null; });
canvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTarget(target ? 0 : 1); } });

function radioGroup(container, items, make, onPick, getSel) {
  items.forEach(it => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.id = container.id + '-' + it.id; b.setAttribute('role', 'radio'); b.dataset.id = it.id;
    make(b, it);
    b.addEventListener('click', () => onPick(it.id));
    container.append(b);
  });
  container.addEventListener('keydown', e => {
    const list = items.filter(it => !$('#' + container.id + '-' + it.id).disabled);
    const i = list.findIndex(it => it.id === getSel());
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % list.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + list.length) % list.length;
    if (j >= 0) { e.preventDefault(); onPick(list[j].id); $('#' + container.id + '-' + list[j].id).focus(); }
  });
}
function markGroup(container, sel) { container.querySelectorAll('.chip').forEach(b => { const on = b.dataset.id === sel; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; }); }

const chips = $('#chips'), forms = $('#forms');
radioGroup(chips, SPECIES, (b, sp) => {
  b.classList.add('sw-chip');
  const sw = document.createElement('span'); sw.className = 'sw';
  sw.style.background = 'linear-gradient(135deg,' + sp.body + ' 0 55%,' + sp.tail + ' 55% 100%)';
  b.append(sw, document.createTextNode(sp.label));
}, id => setSpecies(id), () => speciesId);
radioGroup(forms, FORMS, (b, f) => {
  const t = document.createElement('span'); t.className = 'lbl'; t.textContent = f.id === 'logo' ? ((restore() || {}).logoName || DEFAULT_LOGO.name || f.label) : f.label;
  b.append(t);
  if (f.code) { const c = document.createElement('span'); c.className = 'code'; c.textContent = f.code; b.append(c); }
}, id => setForm(id), () => formId);

function hostOf(u) { try { return new URL(u).host.replace(/^www\./, ''); } catch (_) { return u; } }
function tagText() {
  const lg = curLogo(); if (lg) return { sci: lg.name || 'Logo', auth: '', common: 'colores tomados de la imagen' };
  const sp = SP(speciesId);
  return { sci: sp.sci, auth: sp.auth, common: sp.common };
}
function renderTag() {
  const t = tagText(), sci = $('#sci'); sci.textContent = '';
  const em = document.createElement('em'); em.textContent = t.sci; sci.append(em);
  if (t.auth) { const au = document.createElement('span'); au.className = 'auth'; au.textContent = ' ' + t.auth; sci.append(au); }
  $('#common').textContent = t.common;
  $('#loc').textContent = hostOf(currentUrl);
  const fm = FORM(formId); $('#stage-dt').hidden = $('#stage-dd').hidden = !fm.stage; $('#stage-dd').textContent = fm.stage;
  $('#size-dt').hidden = $('#size-dd').hidden = !fm.size; $('#size-dd').textContent = fm.size;
  $('#code').textContent = 'v' + ((qrN - 17) / 4) + ' · ' + qrN + ' × ' + qrN + ' · nivel Q';
  $('#pieces').textContent = pieces.length.toLocaleString('es') + ' · ' + darkCount.toLocaleString('es') + ' forman el código';
  $('#dest').textContent = '→ ' + hostOf(currentUrl);
}
function setAccent(l, d) { root.style.setProperty('--acc-l', l); root.style.setProperty('--acc-d', d); }
function syncAccent() { const lg = curLogo(); if (lg) setAccent(lg.brand.accL, lg.brand.accD); else { const sp = SP(speciesId); setAccent(sp.accL, sp.accD); } }
function setSpecies(id, instant) {
  if (FORM(formId).logo) return;
  speciesId = SP(id).id;
  markGroup(chips, speciesId); syncAccent();
  if (pieces.length) applyColors(speciesId, instant || reduced);
  renderTag(); save();
}
async function setForm(id, opts) {
  const fm = FORM(id);
  if (fm.logo && !logos[fm.id]) { try { await ensureLogo(fm.id); } catch (_) { showLogoError('No se pudo leer la imagen del logo.'); return; } }
  formId = fm.id;
  markGroup(forms, formId);
  const isLogo = !!fm.logo;
  $('#sp-note').hidden = !isLogo;
  chips.querySelectorAll('.chip').forEach(b => { b.disabled = isLogo; });
  if (isLogo) markGroup(chips, ''); else markGroup(chips, speciesId);
  syncAccent();
  loading.textContent = 'Armando ' + fm.noun + '…';
  build(currentUrl); renderTag(); save();
  if (!(opts && opts.keepPhase)) { phase = 0; setTarget(0); } else setTarget(target);
}

// el enlace es fijo (el de Gerencia): se arma una vez al arrancar
function generate(v, opts) {
  build(v);
  currentUrl = v;
  renderTag(); save();
  if (opts && opts.bloom) { phase = 0; setTarget(0); setTimeout(() => setTarget(1), reduced ? 100 : 450); }
  return true;
}

/* ---------- Logo ---------- */
function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
function placeholderLogo() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 200; const g = cv.getContext('2d');
  g.fillStyle = '#1d6b73'; g.beginPath(); g.arc(100, 100, 94, 0, TAU); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.beginPath(); g.arc(100, 100, 78, 0, TAU); g.stroke();
  g.fillStyle = '#ffffff'; g.font = '800 50px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LOGO', 100, 103);
  return cv.toDataURL('image/png');
}
async function useLogo(src, name, key, uploaded) {
  const data = analyzeImage(await loadImg(src));
  logos[key] = { data, name, src: data.thumb, brand: brandColors(data), uploaded: !!uploaded };
}
async function ensureLogo(key) {
  if (logos[key]) return;
  if (key === 'marbravo') { await useLogo(await marBravoLogo(), 'Mar Bravo', key); return; }
  if (DEFAULT_LOGO.src) { try { await useLogo(DEFAULT_LOGO.src, DEFAULT_LOGO.name, key); return; } catch (_) {} }
  await useLogo(placeholderLogo(), '', key);
}
// Mismo estilo del logo de Omarsa: disco rojo con 32 puntas; «Omarsa» pequeño arriba y «Mar Bravo» en dos líneas, todo centrado
async function marBravoLogo() {
  const fam = 'Nunito, "Arial Black", "Segoe UI Black", Arial, sans-serif';
  try { await document.fonts.load('900 76px Nunito'); } catch (_) {}
  const S = 300, c = S / 2, R = 148, r = 128, n = 32, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#d40416'; g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU - Math.PI / 2, rr = i % 2 ? r : R; g.lineTo(c + rr * Math.cos(a), c + rr * Math.sin(a)); }
  g.closePath(); g.fill();
  const fit = (txt, max, f) => { do { g.font = '900 ' + f + 'px ' + fam; f--; } while (g.measureText(txt).width > max && f > 12); return f + 1; };
  const F = fit('Bravo', 196, 76), sF = Math.round(F * .5);
  const capB = F * .7, capS = sF * .7, gap = sF * .45, lead = F * .96;
  const yS = c - (capS + gap + capB + lead) / 2 + 4 + capS, yM = yS + gap + capB, yB = yM + lead;
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.setTransform(1, 0, -.2, 1, .2 * c, 0); // cursiva uniforme, con o sin la fuente cargada
  // la inclinación desplaza cada línea según su altura; se compensa para que todas queden centradas
  const line = (txt, f, y) => { g.font = '900 ' + f + 'px ' + fam; g.fillText(txt, c + .2 * (y - f * .35 - c), y); };
  line('Omarsa', sF, yS); line('Mar', F, yM); line('Bravo', F, yB);
  return cv.toDataURL('image/png');
}
function showLogoError(msg) { const el = $('#logo-err'); el.textContent = msg; el.hidden = !msg; }

function save() {
  try {
    localStorage.setItem('planta_qr', JSON.stringify({ species: speciesId, form: formId }));
  } catch (_) {}
}
function restore() { try { return JSON.parse(localStorage.getItem('planta_qr') || 'null'); } catch (_) { return null; } }

/* ---------- Toast, imagen y descarga ---------- */
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }

function renderImage() {
  const pr0 = renderer.getPixelRatio(), minD = Math.min(W, H);
  renderer.setPixelRatio(clamp(2000 / minD, 1, 4)); renderer.setSize(W, H, false); draw();
  const src = renderer.domElement, sw = src.width, sh = src.height;
  const vis = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const cardPx = CARD / vis * sh;
  const side = Math.round(Math.min(Math.min(sw, sh), cardPx * (target ? 1.1 : 1.2)));
  const cap = Math.round(side * .14), out = document.createElement('canvas');
  out.width = side; out.height = side + cap;
  const g = out.getContext('2d');
  g.fillStyle = '#e8eeed'; g.fillRect(0, 0, out.width, out.height);
  g.drawImage(src, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, side, side);
  renderer.setPixelRatio(pr0); renderer.setSize(W, H, false); draw();
  const t = tagText(), pad = Math.round(side * .05), title = t.sci + ' · ' + t.common;
  g.fillStyle = '#13262a'; g.textBaseline = 'alphabetic';
  let fs = Math.round(cap * .34);
  do { g.font = 'italic 400 ' + fs + 'px Newsreader, Georgia, serif'; fs = Math.floor(fs * .94); } while (g.measureText(title).width > side - pad * 2 && fs > 8);
  g.fillText(title, pad, side + cap * .42);
  g.fillStyle = '#55686b'; g.font = '400 ' + Math.round(cap * .22) + 'px "IBM Plex Mono", Consolas, monospace';
  let u = currentUrl; while (g.measureText(u).width > side - pad * 2 && u.length > 8) u = u.slice(0, -2);
  if (u !== currentUrl) u = u.slice(0, -1) + '…';
  g.fillText(u, pad, side + cap * .78);
  return new Promise(res => out.toBlob(res, 'image/png'));
}

$('#save').addEventListener('click', async () => {
  const btn = $('#save'); btn.disabled = true;
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const blob = await renderImage();
    const who = curLogo() && curLogo().name ? curLogo().name : FORM(formId).id;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'qr-acceso-gerencia-' + who.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Imagen descargada');
  } catch (_) { toast('No se pudo crear la imagen'); } finally { btn.disabled = false; }
});

/* ---------- Arranque ---------- */
(async function start() {
  const saved = restore() || {};
  const tokens = (location.hash || '').slice(1).toLowerCase().split('-');
  speciesId = SP(tokens.find(t => SPECIES.some(s => s.id === t)) || saved.species || 'blanco').id;
  const wantForm = FORM(tokens.find(t => FORMS.some(f => f.id === t)) || saved.form || 'marbravo').id;
  markGroup(chips, speciesId); markGroup(forms, 'adulto'); syncAccent();
  generate(enlace);
  if (wantForm !== 'adulto') await setForm(wantForm);
  if (tokens.includes('qr')) { phase = 1; setTarget(1); } else setTarget(0);
  loading.hidden = true;
  rafId = requestAnimationFrame(t => { last = t; frame(t); });
})();

function dispose() {
  if (disposed) return; disposed = true;
  cancelAnimationFrame(rafId); ro.disconnect(); clearTimeout(toastT);
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); });
  tileGeo.dispose(); tileMat.dispose(); renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();
}
return { dispose };
}
