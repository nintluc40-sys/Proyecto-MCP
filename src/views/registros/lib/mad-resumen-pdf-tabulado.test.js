// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · ⚖️ SALDO Y RESUMEN · el PDF en DOS presentaciones (punto 7, 2026-10-04)

   Pedido del usuario: «en los informes de PDF de la vista Saldo y Resumen necesito que tenga dos presentaciones, esta y
   otra con forma de informe tabulado similar al de partes, donde se vea todo estructurado y de fácil lectura; debe poder
   ser escogido en variables». Decisiones del usuario: la tabulada es «como el 🖨 Último parte» (por sala, su franja y la
   tabla de sus tanques con su total; los lotes en tablas por tema) y los totales, SÓLO de lo que se suma.
   Monolito arrancado entero (arnés de mad-resumen-ficha.test.js), con hojas propias: dos salas y un tanque COMPARTIDO
   por dos lotes, que es donde una tabla por tanque contaría los animales dos veces.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadSaldo', 'madSaldoRefrescar', 'madResVarsAbrir', 'madResVarsAplicar', 'madResumenPdf', 'MAD_RES_VARS_KEY',
  'MAD_RES_PDF_KEY', 'madResPdfModo', '_gasVersionLocal'];
const H = {};
let impreso = null;

const HOJAS = {
  'Maduración Ingreso': [
    { Fecha: '2026-01-01', Lote: 'AB', 'Código genético': 'CG1', Sala: 'Sala 1', Tanque: 1, Machos: 20, Hembras: 60 },
    { Fecha: '2026-01-01', Lote: 'AB', 'Código genético': 'CG1', Sala: 'Sala 1', Tanque: 2, Machos: 10, Hembras: 30 },
    { Fecha: '2026-01-01', Lote: 'CD', 'Código genético': 'CG2', Sala: 'Sala 1', Tanque: 2, Machos: 5, Hembras: 15 },
    { Fecha: '2026-01-01', Lote: 'CD', 'Código genético': 'CG2', Sala: 'Sala 2', Tanque: 3, Machos: 8, Hembras: 24 },
  ],
  'Maduración Movimientos': [],
  'Maduración Tanques': [
    { Fecha: '2026-01-10', Sala: 'Sala 1', Tanque: 1, 'Machos muertos': 2, 'Hembras muertas': 4, 'Cópulas': 3, Muda: 1, 'Observaciones sanitarias': 'Hongos en branquias' },
    { Fecha: '2026-01-10', Sala: 'Sala 2', Tanque: 3, 'Machos muertos': 1, 'Hembras muertas': 0 },
  ],
  'Maduración Fin de Ciclo': [],
  'Maduración Mortalidad Desove': [
    { Fecha: '2026-01-11', Lote: 'AB', 'Tipo de tanque': 'Desove', 'Hembras que entran': 10, 'Hembras muertas': 1 },
    { Fecha: '2026-01-11', Lote: 'CD', 'Tipo de tanque': 'Desove', 'Hembras que entran': 5, 'Hembras muertas': 0 },
  ],
  'Maduración Sala': [
    { Fecha: '2026-01-10', Sala: 'Sala 1', Estado: 'Producción', RAS: 'SI', 'Temperatura 2:00': 28, 'Oxígeno 06:00': 5 },
    { Fecha: '2026-01-10', Sala: 'Sala 2', Estado: 'Producción', RAS: 'SI', 'Temperatura 2:00': 27, 'Oxígeno 06:00': 6 },
  ],
  'Maduración Lotes': [
    { Fecha: '2026-01-05', Lote: 'AB', Desoves: 4, 'Total de huevos': 100000, N2: 50000, N5: 40000 },
    { Fecha: '2026-01-06', Lote: 'CD', Desoves: 2, 'Hembras no viables': 1, 'Total de huevos': 30000, N2: 12000, N5: 10000 },
  ],
  'Maduración Tratamientos': [],
};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
      clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; } };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, globalThis.localStorage, globalThis);
  H.setToast(() => {});
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    const m = /sheet=([^&]+)/.exec(u);
    const filas = m && HOJAS[m[1]];
    const cuerpo = filas ? JSON.stringify({ ok: true, headers: [], rows: filas }) : JSON.stringify({ ok: false, error: 'Hoja no permitida' });
    return { ok: true, status: 200, text: async () => cuerpo };
  };
  window.open = () => ({ document: { write: (s) => { impreso = s; }, close() {} } });
});

const doc = () => new DOMParser().parseFromString(impreso, 'text/html');
const tablaTras = (d, h2) => {
  const t = [...d.querySelectorAll('h2')].find((x) => x.textContent === h2);
  if (!t) return null;
  let n = t.nextElementSibling;
  while (n && n.tagName !== 'TABLE' && n.tagName !== 'H2') n = n.nextElementSibling;
  return n && n.tagName === 'TABLE' ? n : null;
};
// La tabla de TANQUES de una sala: la que tiene la cabecera «Tanque» después de su h2.
const tablaTanques = (d, h2) => {
  const t = [...d.querySelectorAll('h2')].find((x) => x.textContent === h2);
  let n = t ? t.nextElementSibling : null;
  while (n && n.tagName !== 'H2') {
    if (n.tagName === 'TABLE' && [...n.querySelectorAll('th')].some((th) => th.textContent === 'Tanque')) return n;
    n = n.nextElementSibling;
  }
  return null;
};
const columna = (tabla, th) => {
  // Con dos filas de encabezado, la columna se busca entre las HOJAS del encabezado (las que no agrupan).
  const filas = [...tabla.querySelectorAll('thead tr')];
  const hojas = [];
  filas[0].querySelectorAll('th').forEach((c) => { if (!c.hasAttribute('colspan')) hojas.push({ t: c.textContent, fila: 0 }); else hojas.push({ grupo: c.textContent, n: Number(c.getAttribute('colspan')) }); });
  const sub = filas[1] ? [...filas[1].querySelectorAll('th')].map((c) => c.textContent) : [];
  const planas = [];
  let k = 0;
  hojas.forEach((x) => { if (x.grupo) { for (let i = 0; i < x.n; i++) planas.push(x.grupo + ' · ' + sub[k++]); } else planas.push(x.t); });
  return planas.indexOf(th);
};
const celdas = (tr) => [...tr.querySelectorAll('td')].map((c) => c.textContent);

beforeEach(async () => {
  localStorage.removeItem('larv4_gas_sello_ok');
  localStorage.removeItem(H.MAD_RES_VARS_KEY);
  localStorage.removeItem(H.MAD_RES_PDF_KEY);
  impreso = null;
  document.getElementById('fp-saldo').innerHTML = '';
  H.renderMadSaldo();
  await H.madSaldoRefrescar();
});

const elegir = (modo) => {
  H.madResVarsAbrir();
  document.querySelectorAll('#ms-vars .ms-pdf-modo-op').forEach((r) => { r.checked = r.value === modo; });
  H.madResVarsAplicar();
};

describe('Saldo · la presentación del PDF se elige en ⚙️ Variables', () => {
  // 2026-10-13 (punto 2, usuario) · eran DOS; entra la tercera, «Administrativa» (como los reportes del MCP).
  it('🔴 por defecto es la ESTÁNDAR; las tres opciones están en Variables y la elegida se guarda y se recuerda', () => {
    expect(H.madResPdfModo()).toBe('estandar');
    H.madResVarsAbrir();
    const ops = [...document.querySelectorAll('#ms-vars .ms-pdf-modo-op')];
    expect(ops.map((r) => r.value)).toEqual(['estandar', 'tabulada', 'administrativa']);
    expect(ops.find((r) => r.checked).value).toBe('estandar');
    expect(document.querySelectorAll('#ms-vars fieldset')).toHaveLength(6);   // no es una ficha de variables más
    ops[1].checked = true; ops[0].checked = false;
    H.madResVarsAplicar();
    expect(localStorage.getItem(H.MAD_RES_PDF_KEY)).toBe('tabulada');
    H.madResVarsAbrir();
    expect([...document.querySelectorAll('#ms-vars .ms-pdf-modo-op')].find((r) => r.checked).value).toBe('tabulada');
    H.madResVarsAplicar();
  });

  it('🔴 la estándar sigue siendo la de tarjetas; la tabulada no tiene tarjetas y va en A4 horizontal', () => {
    H.madResumenPdf('todo');
    expect(impreso).toContain('ms-card');
    expect(impreso).not.toContain('size:A4 landscape');
    elegir('tabulada');
    H.madResumenPdf('todo');
    expect(impreso).not.toContain('ms-card');
    expect(impreso).toContain('size:A4 landscape');
    expect(doc().querySelector('h1').textContent).toBe(doc().title);
    elegir('estandar');
    H.madResumenPdf('todo');
    expect(impreso).toContain('ms-card');
  });

  it('la pantalla no cambia: sigue en tarjetas con la tabulada elegida', () => {
    elegir('tabulada');
    expect(document.querySelectorAll('#ms-body .ms-card').length).toBeGreaterThan(0);
  });
});

describe('Saldo · PDF tabulado «como el Último parte»', () => {
  beforeEach(() => { elegir('tabulada'); });

  it('🔴 por sala, su franja y la tabla de sus TANQUES: un tanque de dos lotes es UNA fila, y el total suma', () => {
    H.madResumenPdf('todo');
    const d = doc();
    const t1 = tablaTanques(d, '🏠 Sala 1');
    expect(t1, 'falta la tabla de tanques de la Sala 1').not.toBeNull();
    const filas = [...t1.querySelectorAll('tbody tr')];
    const datos = filas.filter((tr) => !tr.classList.contains('tot'));
    const [cT, cL, cM, cH] = ['Tanque', 'Lote(s)', 'Animales · ♂', 'Animales · ♀'].map((c) => columna(t1, c));
    expect(datos.map((tr) => celdas(tr)[cT])).toEqual(['1', '2']);
    expect(celdas(datos[1])[cL]).toBe('AB, CD');                                  // compartido: una fila, dos lotes
    const total = filas.find((tr) => tr.classList.contains('tot'));
    // El total va en colspan: sus celdas se leen desde el final de la fila del tanque.
    const suma = (c) => datos.reduce((a, tr) => a + Number(celdas(tr)[c]), 0);
    const tot = celdas(total);
    expect(tot[0]).toBe('Total Sala 1');
    expect([Number(tot[1]), Number(tot[2])]).toEqual([suma(cM), suma(cH)]);
    expect(suma(cM) + suma(cH)).toBeGreaterThan(0);
    // y el tanque 2 no se cuenta dos veces: sus ♂ son los del tanque (10 de AB + 5 de CD), no el doble
    expect(Number(celdas(datos[1])[cM])).toBe(15);
    // la Sala 2, con lo suyo
    const t2 = tablaTanques(d, '🏠 Sala 2');
    expect([...t2.querySelectorAll('tbody tr:not(.tot)')].map((tr) => celdas(tr)[cT])).toEqual(['3']);
    // la observación del tanque, en su fila
    expect(celdas(datos[0]).join(' ')).toContain('Hongos en branquias');
    // cada título va en el MISMO bloque que su tabla (no se queda solo al pie de una página)
    expect([...d.querySelectorAll('h2')].every((x) => x.parentElement.classList.contains('blk'))).toBe(true);
    expect(impreso).toContain('.blk{break-inside:avoid');
  });

  it('🔴 la franja de la sala lleva sus variables, y el TOTAL GRANJA suma los tanques de todas las salas', () => {
    H.madResumenPdf('todo');
    const d = doc();
    const h2 = [...d.querySelectorAll('h2')].find((x) => x.textContent === '🏠 Sala 1');
    const franja = h2.nextElementSibling;
    expect(franja.classList.contains('fr')).toBe(true);
    const cab = [...franja.querySelectorAll('th')].map((th) => th.textContent);
    expect(cab).toContain('Uso del RAS');
    expect(cab.some((t) => t.startsWith('Temperatura'))).toBe(true);
    const granja = tablaTras(d, 'TOTAL GRANJA');
    const cg = [...granja.querySelectorAll('th')].map((th) => th.textContent);
    const v = celdas(granja.querySelector('tr.tot'));
    const tanquesDe = (sala) => [...tablaTanques(d, sala).querySelectorAll('tbody tr:not(.tot)')];
    const sumaSexo = (c) => ['🏠 Sala 1', '🏠 Sala 2'].reduce((a, s) => a + tanquesDe(s).reduce((b, tr) => b + Number(celdas(tr)[c]), 0), 0);
    const t1 = tablaTanques(d, '🏠 Sala 1');
    expect(Number(v[cg.indexOf('♂ en tanques')])).toBe(sumaSexo(columna(t1, 'Animales · ♂')));
    expect(Number(v[cg.indexOf('♀ en tanques')])).toBe(sumaSexo(columna(t1, 'Animales · ♀')));
  });

  it('🔴 los lotes, una fila por lote; el total suma cifras y deja los % en «—»', () => {
    H.madResumenPdf('todo');
    const d = doc();
    const rep = tablaTras(d, '🥚 Lotes · Reproducción');
    const filas = [...rep.querySelectorAll('tbody tr')];
    expect(filas.filter((tr) => !tr.classList.contains('tot')).map((tr) => celdas(tr)[0])).toEqual(['AB', 'CD']);
    const tot = celdas(filas.find((tr) => tr.classList.contains('tot')));
    expect(tot[0]).toBe('Total · 2 lotes');
    expect(tot[columna(rep, 'Desoves')]).toBe('6');
    expect(tot[columna(rep, 'N5')]).toBe('50.000');
    expect(tot[columna(rep, 'Nauplios/Hembra')]).toBe('—');
    expect(tot[columna(rep, 'Fertilidad')]).toBe('—');
    expect(tot[columna(rep, 'Mortalidad de hembras · En desove')]).toBe('— (1 de 15)');
    // Población y mortalidad: el total de muertos lleva la cifra sin %; cada lote, con su %
    const pob = tablaTras(d, '🦐 Lotes · Población y mortalidad');
    const pf = [...pob.querySelectorAll('tbody tr')];
    const c = columna(pob, 'Muertos acumulados · Total');
    expect(celdas(pf[0])[c]).toMatch(/%\)$/);
    const totP = celdas(pf.find((tr) => tr.classList.contains('tot')));
    expect(totP[c]).not.toContain('%');
    const cm = columna(pob, 'Población · ♂');
    expect(Number(totP[cm])).toBe(pf.filter((tr) => !tr.classList.contains('tot')).reduce((a, tr) => a + Number(celdas(tr)[cm]), 0));
  });

  it('🔴 el PDF de UN lote: sólo ese lote, y sus tanques con su sala (sin las salas)', () => {
    H.madResumenPdf('lote:AB');
    const d = doc();
    expect(d.title).toContain('Resumen · Lote AB');
    expect([...d.querySelectorAll('h2')].some((x) => x.textContent.startsWith('🏠'))).toBe(false);
    const rep = tablaTras(d, '🥚 Lotes · Reproducción');
    expect([...rep.querySelectorAll('tbody tr:not(.tot)')].map((tr) => celdas(tr)[0])).toEqual(['AB']);
    const tq = tablaTanques(d, '🛢 Tanques del lote AB');
    expect(tq).not.toBeNull();
    expect(columna(tq, 'Sala')).toBe(0);
    const filasTq = [...tq.querySelectorAll('tbody tr:not(.tot)')];
    expect(filasTq.map((tr) => celdas(tr)[columna(tq, 'Tanque')])).toEqual(['1', '2']);
    // 🔴 el tanque 2 lo comparte con CD: sus animales son los del tanque entero, y la fila lo DICE (no esconde a CD)
    expect(celdas(filasTq[1])[columna(tq, 'Lote(s)')]).toBe('AB, CD');
    // con un solo lote, sin filas «Total · 1 lote» que repitan la suya
    expect(rep.querySelector('tr.tot')).toBeNull();
    expect(tablaTras(d, '🦐 Lotes · Población y mortalidad').querySelector('tr.tot')).toBeNull();
    expect(impreso).not.toContain('💧 RAS');
  });

  it('🔴 el PDF de UNA sala: sólo esa sala, sin lotes ni RAS', () => {
    H.madResumenPdf('sala:Sala 2');
    const d = doc();
    const h2 = [...d.querySelectorAll('h2')].map((x) => x.textContent);
    expect(h2).toEqual(['🏠 Sala 2']);
  });

  it('🔴 respeta las variables: lo desmarcado no sale (ni su columna)', () => {
    H.madResVarsAbrir();
    document.querySelectorAll('#ms-vars .ms-var').forEach((c) => { c.checked = !['sala-temp', 'lote-carga', 'des-totales'].includes(c.value); });
    H.madResVarsAplicar();
    H.madResumenPdf('todo');
    const d = doc();
    const franja = [...d.querySelectorAll('h2')].find((x) => x.textContent === '🏠 Sala 1').nextElementSibling;
    expect([...franja.querySelectorAll('th')].some((th) => th.textContent.startsWith('Temperatura'))).toBe(false);
    expect(impreso).not.toContain('g/m²');
    const rep = tablaTras(d, '🥚 Lotes · Reproducción');
    expect(columna(rep, 'Desoves')).toBe(-1);
    expect(columna(rep, 'Nauplios/Hembra')).toBeGreaterThan(0);
    // y con todo desmarcado, lo dice en vez de imprimir vacío
    H.madResVarsAbrir();
    document.querySelectorAll('#ms-vars .ms-var').forEach((c) => { c.checked = false; });
    H.madResVarsAplicar();
    H.madResumenPdf('todo');
    expect(impreso).toContain('Nada que mostrar con las variables elegidas.');
  });
});

/* ── Punto 2 (2026-10-13, usuario) · las variables NUEVAS en la tabulada: columnas en la franja de la sala y dos tablas
   PROPIAS de lotes (las de antes no cambian). El 11/01 la Sala 1 da dos partes y 🍤 Alimentación guarda 2,4 kg. */
describe('Saldo · la tabulada con las variables nuevas (punto 2)', () => {
  const conDia = async (fn) => {
    const tq = HOJAS['Maduración Tanques'];
    HOJAS['Maduración Tanques'] = tq.concat([
      { Fecha: '2026-01-11', Sala: 'Sala 1', Tanque: 1, Hora: '06:30', Parte: 1, 'Hembras muertas': 1, 'Machos muertos por descarte de selección': 1, 'Cópulas': 5, Muda: 2 },
    ]);
    HOJAS['Maduración Alimentación'] = [{ Fecha: '2026-01-11', Sala: 'Sala 1', Tanque: 1, 'Biomasa total (kg)': 4.1, 'Poliqueto (kg/día)': 2.4, 'Total (kg/día)': 2.4 }];
    try { await fn(); } finally { HOJAS['Maduración Tanques'] = tq; delete HOJAS['Maduración Alimentación']; }
  };

  it('🔴 la franja de la sala lleva partes, bajas, cópulas y alimento del último día', async () => {
    await conDia(() => H.madSaldoRefrescar());
    elegir('tabulada');
    H.madResumenPdf('todo');
    const d = doc();
    const franja = [...d.querySelectorAll('h2')].find((x) => x.textContent === '🏠 Sala 1').nextElementSibling;
    const ths = [...franja.querySelectorAll('th')].map((th) => th.textContent);
    for (const t of ['Partes del día', 'Cópulas · Mudas', 'Alimento del día (kg)']) expect(ths, t).toContain(t);
    expect(ths.some((t) => t.startsWith('Bajas del día'))).toBe(true);
    expect(franja.textContent).toContain('06:30');
    expect(franja.textContent).toContain('Poliqueto 2.4');
  });

  it('🔴 dos tablas nuevas de lotes, con su total: descartes, biomasa y alimento · huevos, N2 y desoves por 100 ♀', async () => {
    await conDia(() => H.madSaldoRefrescar());
    elegir('tabulada');
    H.madResumenPdf('todo');
    const d = doc();
    const t1 = tablaTras(d, '🦐 Lotes · Descartes, biomasa y alimento');
    expect(columna(t1, 'Alimento del día (kg)')).toBeGreaterThan(0);
    const filas1 = [...t1.querySelectorAll('tbody tr')];
    expect(celdas(filas1[0])[0]).toBe('AB');
    expect(filas1[filas1.length - 1].className).toBe('tot');
    const t2 = tablaTras(d, '🥚 Lotes · Huevos, N2 y desoves por 100 ♀');
    const filas2 = [...t2.querySelectorAll('tbody tr')];
    expect(celdas(filas2[0]).slice(0, 3)).toEqual(['AB', '100.000', '50.000']);
    expect(celdas(filas2[filas2.length - 1]).slice(0, 3)).toEqual(['Total · 2 lotes', '130.000', '62.000']);   // los % no se suman: «—»
    // las tablas de antes no cambian: la de reproducción sigue sin columna de huevos
    expect(columna(tablaTras(d, '🥚 Lotes · Reproducción'), 'Huevos')).toBe(-1);
  });
});

/* ── Punto 2 (2026-10-13, usuario) · la TERCERA presentación, «Administrativa»: la forma de los reportes del MCP (A4 vertical,
   cabecera, indicadores, tablas compactas, discrepancias, código verificador y firma) con el CONTENIDO de la tabulada. ── */
describe('Saldo · la presentación ADMINISTRATIVA del PDF (punto 2)', () => {
  const codigo = () => (/Código verificador <b>(MAD-SAL-\d{8}-[0-9A-F]{6})<\/b>/.exec(impreso) || [])[1];

  it('🔴 se elige en ⚙️ Variables, se recuerda y sale con la forma de los reportes del MCP', () => {
    elegir('administrativa');
    expect(H.madResPdfModo()).toBe('administrativa');
    H.madResumenPdf('todo');
    expect(impreso).toContain('size:A4 portrait');
    const d = doc();
    expect(d.querySelector('.rp-h1').textContent).toBe('Maduración · Saldo y resumen');
    expect(d.querySelector('.rp-h2').textContent).toMatch(/^(domingo|lunes|martes|miércoles|jueves|viernes|sábado), \d{2}\/\d{2}\/\d{4} · último registro del libro: /);
    expect(d.querySelector('.rp-h3').textContent).toMatch(/^Toda la planta · \d+ variable\(s\) elegida\(s\)/);
    expect([...d.querySelectorAll('.rp-kpi-lb')].map((x) => x.textContent))
      .toEqual(['Vivos ♂', 'Vivos ♀', 'Lotes', 'Tanques en producción', 'Bajas del último día', 'Alimento del día']);
    expect(d.querySelector('.ms-card'), 'no son las tarjetas de la estándar').toBeNull();
    expect(tablaTras(d, '🦐 Lotes · Población y mortalidad'), 'el contenido es el de la tabulada').toBeTruthy();
    expect([...d.querySelectorAll('h2')].some((h) => h.textContent.startsWith('⚠ Discrepancias del libro'))).toBe(true);
    expect(codigo()).toBeTruthy();
    expect(d.querySelector('.rp-firma').textContent).toBe('Responsable del turno');
  });

  it('🔴 los indicadores suman lo mismo que la tabulada: vivos de todos los lotes', () => {
    elegir('administrativa');
    H.madResumenPdf('todo');
    const d = doc();
    const v = (lb) => [...d.querySelectorAll('.rp-kpi')].find((k) => k.querySelector('.rp-kpi-lb').textContent === lb).querySelector('.rp-kpi-v').textContent;
    const pob = tablaTras(d, '🦐 Lotes · Población y mortalidad');
    const tot = [...pob.querySelectorAll('tbody tr')].pop();
    expect(tot.className).toBe('tot');
    expect([v('Vivos ♂'), v('Vivos ♀')]).toEqual([celdas(tot)[2], celdas(tot)[3]]);
  });

  it('🔴 el código verificador es la huella del contenido: el mismo informe, el mismo código; otras variables, otro', () => {
    elegir('administrativa');
    H.madResumenPdf('todo');
    const a = codigo();
    H.madResumenPdf('todo');
    expect(codigo()).toBe(a);
    H.madResVarsAbrir();
    document.querySelectorAll('#ms-vars .ms-var').forEach((c) => { c.checked = c.value !== 'sala-temp'; });
    H.madResVarsAplicar();
    H.madResumenPdf('todo');
    expect(codigo()).not.toBe(a);
  });

  it('🔴 respeta el alcance: el de un lote dice el lote y lleva sus indicadores; el de una sala, la sala', () => {
    elegir('administrativa');
    H.madResumenPdf('lote:AB');
    let d = doc();
    expect(d.querySelector('.rp-h3').textContent).toMatch(/^Lote AB · /);
    expect([...d.querySelectorAll('.rp-kpi-lb')].map((x) => x.textContent)).toEqual(['Vivos ♂', 'Vivos ♀', 'Estado', 'Tanques', 'Bajas del último día', 'Alimento del día']);
    H.madResumenPdf('sala:Sala 2');
    d = doc();
    expect(d.querySelector('.rp-h3').textContent).toMatch(/^Sala 2 · /);
    expect([...d.querySelectorAll('h2')].some((h) => h.textContent === '🏠 Sala 1')).toBe(false);
  });
});

describe('Saldo · los indicadores «del día» de la administrativa (punto 2)', () => {
  /* Medido con datos reales el 13-10: sumar «el último día de cada sala» metía el alimento de una sala ya vacía de días
     atrás. «Del día» = el día MÁS RECIENTE de las salas del alcance, y sólo las salas que lo tienen. */
  it('🔴 bajas y alimento suman sólo el día más reciente, y lo dicen', async () => {
    const tq = HOJAS['Maduración Tanques'];
    HOJAS['Maduración Tanques'] = tq.concat([{ Fecha: '2026-01-11', Sala: 'Sala 1', Tanque: 1, Hora: '06:30', Parte: 1, 'Hembras muertas': 3 }]);
    HOJAS['Maduración Alimentación'] = [
      { Fecha: '2026-01-11', Sala: 'Sala 1', Tanque: 1, 'Poliqueto (kg/día)': 2, 'Total (kg/día)': 2 },
      { Fecha: '2026-01-09', Sala: 'Sala 2', Tanque: 3, 'Calamar (kg/día)': 5, 'Total (kg/día)': 5 },
    ];
    try {
      await H.madSaldoRefrescar();
      elegir('administrativa');
      H.madResumenPdf('todo');
    } finally { HOJAS['Maduración Tanques'] = tq; delete HOJAS['Maduración Alimentación']; }
    const k = (lb) => [...doc().querySelectorAll('.rp-kpi')].find((x) => x.querySelector('.rp-kpi-lb').textContent === lb);
    expect(k('Bajas del último día').querySelector('.rp-kpi-v').textContent).toBe('3');   // la Sala 2 se quedó en el 10/01: no suma
    expect(k('Bajas del último día').querySelector('.rp-kpi-s').textContent).toBe('11/01/2026');
    expect(k('Alimento del día').querySelector('.rp-kpi-v').textContent).toBe('2 kg');     // no 7: el de la Sala 2 es del 09/01
    expect(k('Alimento del día').querySelector('.rp-kpi-s').textContent).toBe('11/01/2026');
  });
});
