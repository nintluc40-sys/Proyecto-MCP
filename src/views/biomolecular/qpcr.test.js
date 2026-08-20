// @vitest-environment happy-dom
// Las dos columnas CUANTITATIVAS de la hoja BIOMOL ("Ciclo de amplificación" y "Copias/μl")
// llegaban a la vista y morían ahí: se leían y se exportaban a Excel, pero ninguna pieza en
// pantalla las mostraba. Aquí se fija que ahora SÍ se ven, y —lo importante— que se ven
// donde deben y solo donde hay medición.
//
// El stub de D3 GRABA lo dibujado (mismo patrón que trazabilidad.test.js): el agujero negro
// de navigation.test.js sirve para comprobar que la vista no revienta, pero no permite
// afirmar QUÉ dice un tooltip, que es justo lo que hay que medir aquí.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const blackhole = new Proxy(function () {}, {
  get: (_t, prop) => {
    if (prop === Symbol.toPrimitive) return (h) => (h === 'string' ? '' : 0);
    if (prop === 'toString' || prop === Symbol.toStringTag) return () => '';
    if (prop === 'valueOf') return () => 0;
    if (prop === Symbol.iterator) return function* () {};
    return blackhole;
  },
  apply: () => blackhole,
});

// Grabadora: cada `append` cuelga un nodo con sus atributos, su texto y sus manejadores.
const REC = {};
const bucket = (sel) => (REC[sel] ||= { nodes: [] });
function recSel(sel, node) {
  const b = bucket(sel);
  const api = {
    append(tag) { const child = { tag, attrs: {}, text: null, events: {} }; b.nodes.push(child); return recSel(sel, child); },
    attr(k, v) { if (node) node.attrs[k] = v; return api; },
    text(t) { if (node) node.text = t; return api; },
    style() { return api; },
    on(ev, fn) { if (node) node.events[ev] = fn; return api; },
    selectAll() { return { remove() { b.nodes.length = 0; }, each() {}, attr() { return this; } }; },
    node() { return null; }, remove() { return api; }, datum() { return api; }, call() { return api; },
  };
  return api;
}
const RECORDED = ['#swarm'];
globalThis.window.d3 = new Proxy(function () {}, {
  get: (_t, prop) => {
    if (prop === 'select') return (s) => (RECORDED.includes(s) ? recSel(s, null) : blackhole);
    return Reflect.get(blackhole, prop);
  },
  apply: () => blackhole,
});
// Síncrono a propósito: `openRS` difiere el pintado del modal con requestAnimationFrame, y
// el de happy-dom es asíncrono de verdad, así que la tabla del modal aún no existía cuando
// la prueba iba a leerla. Se sustituye entero, no solo cuando falta.
globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

import { store } from '../../core/store.js';
import { biomolecularView } from './index.js';

const B = (o) => ({ _SheetOrigin: 'Biomol', ...o });
const SIN_MEDIR = { IHHNV: '', WSSV: '', BP: '', 'AHPND/EMS': '', NHPB: '', EHP: '' };

/* Un solo día, para que las tres muestras caigan a la vez en el swarm y en la tabla.
   Las tres se distinguen entre sí en lo único que se está midiendo:

   L-A · un solo diagnóstico informado (WSSV) + Ct + Copias  → atribuible: "· WSSV"
   L-B · DOS diagnósticos informados + solo Ct               → no atribuible + sin fila Copias
   L-C · un diagnóstico informado, sin cuantificar           → sin bloque qPCR

   Los valores de Ct y Copias son DISTINTOS entre sí en cada fila a propósito: si alguien
   intercambia las dos columnas o lee la vecina, la aserción cae. */
const DIA = '10/08/2026';
function fixture() {
  return [
    B({ Fecha: DIA, 'Código': 'L-A', Corrida: '586', Lugar: 'Módulo 8', Tanque: 'T1', 'Estadío': 'PL10',
      ...SIN_MEDIR, WSSV: 'Positivo',
      'Ciclo de amplificación': '24.8', 'Copias/μl': '3.40E+04' }),
    B({ Fecha: DIA, 'Código': 'L-B', Corrida: '586', Lugar: 'Módulo 8', Tanque: 'T2', 'Estadío': 'PL10',
      ...SIN_MEDIR, WSSV: 'Positivo', IHHNV: 'Negativo',
      'Ciclo de amplificación': '31.2', 'Copias/μl': '' }),
    B({ Fecha: DIA, 'Código': 'L-C', Corrida: '586', Lugar: 'Módulo 3', Tanque: 'T3', 'Estadío': 'N5',
      ...SIN_MEDIR, WSSV: 'Negativo' }),
  ];
}

const txt = (el) => (el ? el.textContent.trim() : null);
const click = (el) => { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };

/** Lee una tabla como {cabeceras, filas:[{cabecera: valor}]}, emparejando por POSICIÓN.
 *  Devolver también el recuento crudo de celdas permite cazar el desfase de columnas: un
 *  `<th>` sin su `<td>` produce un Excel plausible con los valores corridos una posición. */
function leerTabla(tabla) {
  const cabeceras = [...tabla.querySelectorAll('thead th')].map(txt);
  const filas = [...tabla.querySelectorAll('tbody tr')].map((tr) => {
    const celdas = [...tr.querySelectorAll('td')].map(txt);
    const obj = {};
    cabeceras.forEach((h, i) => { obj[h] = celdas[i]; });
    return { obj, nCeldas: celdas.length };
  });
  return { cabeceras, filas };
}

/** Dispara el `mouseenter` de cada punto del swarm y devuelve {código → HTML del tooltip}.
 *  Se indexa por código y no por posición para que el orden de pintado no falsee nada. */
function tooltipsDelSwarm() {
  const out = {};
  const puntos = (REC['#swarm']?.nodes || []).filter((n) => n.tag === 'circle' && n.events.mouseenter);
  puntos.forEach((p) => {
    p.events.mouseenter({ clientX: 10, clientY: 10 });
    const html = document.getElementById('bm-tooltip').innerHTML;
    const cod = (html.match(/L-[ABC]/) || [])[0];
    if (cod) out[cod] = html;
  });
  return out;
}

/** Valor de UNA fila del tooltip, buscada por su etiqueta. Comprobar solo que el número
 *  "aparece en el HTML" no distingue el tooltip correcto de uno con Ct y Copias
 *  intercambiados: los dos números siguen apareciendo. Hay que leer cada valor por su clave. */
function valorTip(html, clave) {
  const caja = document.createElement('div');
  caja.innerHTML = html;
  const fila = [...caja.querySelectorAll('.tt-row')].find((f) => txt(f.querySelector('.tt-key')) === clave);
  return fila ? txt(fila.querySelector('.tt-val')) : null;
}

let root;
beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'biomolecular';
  store.globalData = fixture();
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
  Object.keys(REC).forEach((k) => delete REC[k]);
  biomolecularView(root);
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); });

describe('Biología Molecular · qPCR en el Registro Detallado', () => {
  it('añade Ct y Copias/μl al final, y cada valor cae bajo SU cabecera', () => {
    const { cabeceras, filas } = leerTabla(document.querySelector('#c-table table'));
    expect(cabeceras.slice(-2)).toEqual(['Ct', 'Copias/μl']);

    const a = filas.find((f) => f.obj['Código'] === 'L-A').obj;
    expect(a['Ct']).toBe('24.8');
    expect(a['Copias/μl']).toBe('3.40E+04');
  });

  it('la muestra sin cuantificar deja las dos celdas en guion, no en blanco ni en cero', () => {
    const { filas } = leerTabla(document.querySelector('#c-table table'));
    const c = filas.find((f) => f.obj['Código'] === 'L-C').obj;
    expect(c['Ct']).toBe('—');
    expect(c['Copias/μl']).toBe('—');
    // Y la que solo trae Ct enseña Ct y nada más: media medición es media medición.
    const b = filas.find((f) => f.obj['Código'] === 'L-B').obj;
    expect(b['Ct']).toBe('31.2');
    expect(b['Copias/μl']).toBe('—');
  });

  it('ninguna fila queda con menos celdas que cabeceras (desfase de columnas)', () => {
    const { cabeceras, filas } = leerTabla(document.querySelector('#c-table table'));
    expect(filas.length).toBe(3);
    filas.forEach((f) => expect(f.nCeldas).toBe(cabeceras.length));
  });
});

describe('Biología Molecular · qPCR en el tooltip del swarm', () => {
  it('atribuye la cuantificación al ÚNICO diagnóstico informado de la fila', () => {
    const tips = tooltipsDelSwarm();
    expect(tips['L-A']).toContain('Cuantificación qPCR · WSSV');
    expect(valorTip(tips['L-A'], 'Ciclo (Ct)')).toBe('24.8');
    expect(valorTip(tips['L-A'], 'Copias/μl')).toBe('3.40E+04');
  });

  it('con VARIOS diagnósticos informados no atribuye a ninguno', () => {
    // Rotular uno sería inventarlo: en la hoja, Ct y Copias son de la fila, no de una
    // columna de patógeno. Si alguien "deduce" cogiendo el primero, saldría IHHNV (es el
    // primero de DIAGS) y esta prueba cae.
    const tips = tooltipsDelSwarm();
    expect(tips['L-B']).toContain('Cuantificación qPCR');
    expect(tips['L-B']).not.toContain('Cuantificación qPCR ·');
  });

  it('omite la fila del valor que no se midió', () => {
    const tips = tooltipsDelSwarm();
    expect(valorTip(tips['L-B'], 'Ciclo (Ct)')).toBe('31.2');
    expect(valorTip(tips['L-B'], 'Copias/μl')).toBe(null);
    expect(tips['L-B']).not.toContain('Copias/μl');
  });

  it('la muestra sin cuantificar no gana ningún apartado', () => {
    const tips = tooltipsDelSwarm();
    expect(tips['L-C']).toBeTruthy();          // el tooltip sigue existiendo…
    expect(tips['L-C']).not.toContain('tt-qpcr'); // …pero sin bloque de qPCR
    expect(tips['L-C']).not.toContain('Cuantificación');
  });
});

describe('Biología Molecular · qPCR en el registro del día (modal RS)', () => {
  it('la tabla del modal lleva las mismas dos columnas, con los mismos valores', () => {
    click(document.getElementById('rsd-btn'));
    const { cabeceras, filas } = leerTabla(document.querySelector('#rsd-detail table'));
    expect(cabeceras.slice(-2)).toEqual(['Ct', 'Copias/μl']);
    filas.forEach((f) => expect(f.nCeldas).toBe(cabeceras.length));

    const a = filas.find((f) => f.obj['Código'] === 'L-A').obj;
    expect(a['Ct']).toBe('24.8');
    expect(a['Copias/μl']).toBe('3.40E+04');
    const c = filas.find((f) => f.obj['Código'] === 'L-C').obj;
    expect(c['Ct']).toBe('—');
  });
});
