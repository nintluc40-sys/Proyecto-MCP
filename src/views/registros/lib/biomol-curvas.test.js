// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Biomol — la imagen «Curvas de los ciclos de amplificación»

   PETICIÓN DEL USUARIO (2026-09-02): junto al cargador de la foto del gel de agarosa,
   otro que diga «Curvas de los ciclos de amplificación», con la misma funcionalidad
   —subir una imagen— y que **sólo viva para el PDF**. Debe salir cuando el análisis
   tenga valores de qPCR.

   LO QUE SE VIGILA AQUÍ, y por qué cada cosa:

   1. LA CONDICIÓN. El cargador de curvas sale con qPCR y NO sale sin él. El criterio
      no se reescribe: es `_bioEsQpcr`, el mismo que usa el resto del módulo (basta un
      Ct, aunque no se hayan cuantificado copias). Si alguien lo cambiara por «tiene
      copias», las curvas dejarían de ofrecerse en las corridas que sólo dan Ct.

   2. EL GEL NO SE VUELVE CONDICIONAL. Es el riesgo real de haber metido las dos
      imágenes en un mismo registro: que la condición de una se aplique a la otra y el
      gel desaparezca en los análisis de PCR convencional, que son la mayoría.

   3. QUE NO SE QUEDE HUÉRFANA. Con una imagen ya cargada, quitar los valores de qPCR
      NO puede esconder su botón de quitar: escondida seguiría ocupando localStorage y
      seguiría saliendo en el PDF, sin ninguna forma de borrarla.

   4. QUE NO VIAJE A LA HOJA. Es el contrato del bloque entero («solo para el PDF»):
      el payload de BIOMOL no puede crecer ni una celda por esto.

   5. QUE SE BARRA. Cada imagen son cientos de KB. Si la purga por retención no la
      recoge, se queda en el dispositivo para siempre y no hay ningún síntoma hasta que
      el almacenamiento se llena y deja de poder guardarse una foto legítima.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');

const EXPORTAR = ['renderBiomol', '_collectBioGrid', 'bioGridFecha', 'saveBioGrid',
  '_bioReportBlock', 'bioSidActivo', 'bioFotoKey', 'bioFotoGet', 'bioFotoClear',
  'BIO_FOTOS', 'BIO_GEL_PRE', 'BIO_CUR_PRE', '_bioEsQpcr', 'buildBioPayload',
  'BIO_GRID_COLS', '_bioPruneRpt', 'saveBioRpt', 'loadBioRpt', 'bioPatCambio', 'downloadBioPDF', 'bioRptDelSes', 'bioQpcrInput', 'renderBioReport', 'bioPatInput', 'gridEnLote', '_gselSetVal', '_bioDirty', '_gselPasteH', '_gselKeyH'];
const H = {};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
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
    // `_gsel` es un `let` de módulo: hace falta un setter para montar una selección
    // múltiple sin tener que simular el arrastre del ratón celda a celda.
    + '\ntry{ H.setGsel=function(g){_gsel=g;}; }catch(_){}'
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}'
    + '\ntry{ H.setTab=function(t){curTab=t;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  H.setMod(12);
  H.setTab('biomol');
});

/** Rellena celdas de una fila por su nombre real (bg_<fila>_<clave>).
 *  ⚠ FALLA si alguna celda no existe. Una versión que se las tragara en silencio
 *  dejaría pasar tests verdes que no escribieron nada — que es exactamente cómo se
 *  cuela un fixture que no prueba nada. */
function rellenar(fila, datos) {
  const fp = document.getElementById('fp-biomol');
  let puestas = 0;
  Object.entries(datos).forEach(([k, v]) => {
    const el = fp.querySelector(`[name="bg_${fila}_${k}"]`);
    if (el) { el.value = String(v); puestas++; }
  });
  expect(puestas, `el fixture no pudo escribir ${JSON.stringify(datos)}`).toBe(Object.keys(datos).length);
}

/** Deja la fila con un resultado positivo Y su medición de qPCR.
 *  ⚠ EN DOS FASES A PROPÓSITO: las celdas de Ct y Copias NO existen en el DOM hasta
 *  que el patógeno está en «Positivo» y la grilla se repinta. Escribirlas de una vez
 *  no falla — simplemente no encuentra las celdas—, así que hay que marcar el positivo,
 *  dejar que `bioPatCambio` abra las columnas, y sólo entonces escribir la medición. */
function rellenarQpcr(fila, base, qpcr) {
  rellenar(fila, base);
  H.bioPatCambio();
  rellenar(fila, qpcr);
}

/** El bloque del reporte, ya renderizado con las filas de la grilla. */
const bloque = () => H._bioReportBlock(H.bioGridFecha(), H._collectBioGrid(), H.bioSidActivo());

const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////'
  + '////////////////////////////////////////////////////////2wBDAf//////////////'
  + '////////////////////////////////////////////////////////wAARCAABAAEDASIA/8QA'
  + 'FQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAA'
  + 'AAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

beforeEach(() => {
  localStorage.clear();
  H.renderBiomol();
});

describe('Biomol · las curvas de amplificación son una imagen más del informe', () => {
  it('el registro declara las dos imágenes, y sólo las curvas dependen del qPCR', () => {
    // El fixture no vale nada si el registro tuviera una sola entrada.
    expect(Object.keys(H.BIO_FOTOS).sort()).toEqual(['curvas', 'gel']);
    expect(H.BIO_FOTOS.curvas.rotulo).toBe('Curvas de los ciclos de amplificación');
    expect(H.BIO_FOTOS.curvas.soloQpcr).toBe(true);
    expect(!!H.BIO_FOTOS.gel.soloQpcr, 'el gel NO puede volverse condicional').toBe(false);
    // Claves distintas: compartirlas haría que una foto pisara a la otra.
    expect(H.BIO_FOTOS.gel.pre).not.toBe(H.BIO_FOTOS.curvas.pre);
  });

  it('SIN valores de qPCR el cargador de curvas no aparece — y el del gel SÍ', () => {
    rellenar(1, { codigo: 'L-1', ihhnv: 'Negativo' });
    const b = bloque();
    expect(b).toContain('Foto del gel de agarosa');
    expect(b, 'las curvas no deberían ofrecerse sin qPCR').not.toContain('Curvas de los ciclos de amplificación');
  });

  it('CON un Ct aparece el cargador de curvas, junto al del gel', () => {
    rellenarQpcr(1, { codigo: 'L-1', wssv: 'Positivo' }, { ciclo_wssv: '22.4' });
    const b = bloque();
    expect(b).toContain('Curvas de los ciclos de amplificación');
    expect(b, 'el gel debe seguir estando').toContain('Foto del gel de agarosa');
    // El gel va primero: es el orden del registro y el que espera el analista.
    expect(b.indexOf('Foto del gel de agarosa')).toBeLessThan(b.indexOf('Curvas de los ciclos de amplificación'));
    // Y cada uno cablea SU tipo, o subir una imagen sobrescribiría la otra.
    expect(b).toContain("bioFotoPick(this,'gel')");
    expect(b).toContain("bioFotoPick(this,'curvas')");
  });

  it('basta el Ct, sin copias — el mismo criterio que usa el resto del módulo', () => {
    rellenarQpcr(1, { codigo: 'L-1', ihhnv: 'Positivo' }, { ciclo_ihhnv: '30' });
    expect(H._bioEsQpcr(H._collectBioGrid()[0]), 'control: la fila ES qPCR').toBe(true);
    expect(bloque()).toContain('Curvas de los ciclos de amplificación');
  });

  it('sólo con Copias/μl, sin Ct, también sale', () => {
    rellenarQpcr(1, { codigo: 'L-1', wssv: 'Positivo' }, { copias_wssv: '1500' });
    expect(bloque()).toContain('Curvas de los ciclos de amplificación');
  });

  it('una imagen YA cargada se sigue viendo aunque desaparezca el qPCR', () => {
    // Se carga con qPCR…
    rellenarQpcr(1, { codigo: 'L-1', wssv: 'Positivo' }, { ciclo_wssv: '22.4' });
    const sid = H.bioSidActivo();
    localStorage.setItem(H.bioFotoKey('curvas', sid), IMG);
    expect(bloque()).toContain('Curvas de los ciclos de amplificación');

    // …y ahora el análisis deja de tener qPCR.
    localStorage.clear();
    H.renderBiomol();
    const sid2 = H.bioSidActivo();
    localStorage.setItem(H.bioFotoKey('curvas', sid2), IMG);
    rellenar(1, { codigo: 'L-1', ihhnv: 'Negativo' });
    const b = bloque();
    // Escondida seguiría ocupando sitio y saliendo en el PDF, sin forma de borrarla.
    expect(b, 'la imagen huérfana quedó sin botón de quitar').toContain('Curvas de los ciclos de amplificación');
    expect(b).toContain("bioFotoClear('curvas'");
    expect(b).toContain('Este análisis ya no tiene valores de qPCR');
  });

  it('cada imagen se guarda y se borra por separado', () => {
    rellenarQpcr(1, { codigo: 'L-1', wssv: 'Positivo' }, { ciclo_wssv: '22.4' });
    const sid = H.bioSidActivo();
    localStorage.setItem(H.bioFotoKey('gel', sid), IMG);
    localStorage.setItem(H.bioFotoKey('curvas', sid), IMG + 'X');

    expect(H.bioFotoGet('gel', sid)).toBe(IMG);
    expect(H.bioFotoGet('curvas', sid), 'una pisó a la otra').toBe(IMG + 'X');

    H.bioFotoClear('curvas', sid, true);
    expect(H.bioFotoGet('curvas', sid)).toBe('');
    expect(H.bioFotoGet('gel', sid), 'borrar las curvas se llevó el gel por delante').toBe(IMG);
  });

  it('un tipo desconocido no fabrica una clave que nadie barrería', () => {
    // `bioFotoKey('loQueSea', sid)` devolviendo "undefinedsid" dejaría basura
    // permanente en localStorage: ningún prefijo del registro la recogería.
    expect(H.bioFotoKey('inventado', 'sid-1')).toBe('');
    expect(H.bioFotoGet('inventado', 'sid-1')).toBe('');
    expect(() => H.bioFotoClear('inventado', 'sid-1', true)).not.toThrow();
  });

  it('la imagen NO viaja a la hoja: el payload no crece ni una celda', () => {
    rellenarQpcr(1, { codigo: 'L-1', wssv: 'Positivo' }, { ciclo_wssv: '22.4' });
    const sid = H.bioSidActivo();
    const fecha = H.bioGridFecha();
    const anchoSin = H.buildBioPayload(fecha, H._collectBioGrid()).rows[0].length;

    localStorage.setItem(H.bioFotoKey('curvas', sid), IMG);
    const p = H.buildBioPayload(fecha, H._collectBioGrid());
    expect(p.rows[0].length, 'el payload creció al cargar una imagen').toBe(anchoSin);
    // Y la imagen no se ha colado dentro de ninguna celda.
    expect(p.rows[0].some((c) => String(c).indexOf('data:image') !== -1)).toBe(false);
  });

  it('la purga por retención se lleva las DOS imágenes de un análisis vencido', () => {
    /* Se va por la rama que recorre el ÍNDICE DE REPORTES, que es la que corre en cada
       purga. (El barrido general por prefijo existe además, pero lo gobierna
       `_bioGelSwept`, que sólo lo deja pasar UNA vez por sesión: al arrancar el motor
       ya se gastó, así que aquí no se puede volver a observar.) */
    const sidViejo = 'sid-que-ya-no-existe';
    H.saveBioRpt(sidViejo, H.loadBioRpt(sidViejo));   // le da entrada en el índice
    localStorage.setItem(H.BIO_GEL_PRE + sidViejo, IMG);
    localStorage.setItem(H.BIO_CUR_PRE + sidViejo, IMG);
    expect(localStorage.getItem(H.BIO_CUR_PRE + sidViejo)).toBeTruthy();  // control

    H._bioPruneRpt();

    expect(localStorage.getItem(H.BIO_GEL_PRE + sidViejo), 'el gel viejo no se barrió').toBeNull();
    expect(localStorage.getItem(H.BIO_CUR_PRE + sidViejo),
      'las CURVAS viejas se quedaron para siempre: fuga silenciosa de almacenamiento').toBeNull();
  });

  /* ── El PDF, que es el destino de todo esto ──────────────────────────
     Se intercepta `window.open` y se recoge lo que el motor escribe: es el único
     modo de mirar el informe REAL, y sin él las pruebas de arriba sólo dirían que la
     pantalla está bien mientras el papel podría salir sin la imagen. */
  function htmlDelPdf() {
    let html = '';
    const abrirOriginal = window.open;
    window.open = () => ({ document: { write: (s) => { html += s; }, close: () => {}, set title(v) {} } });
    try { H.downloadBioPDF(); } finally { window.open = abrirOriginal; }
    return html;
  }

  it('la imagen de curvas SALE en el PDF, detrás del gel', () => {
    rellenarQpcr(1, { codigo: 'L-1', wssv: 'Positivo' }, { ciclo_wssv: '22.4' });
    const sid = H.bioSidActivo();
    localStorage.setItem(H.bioFotoKey('gel', sid), IMG);
    localStorage.setItem(H.bioFotoKey('curvas', sid), IMG + 'X');

    const html = htmlDelPdf();
    expect(html, 'el PDF salió sin el título de las curvas').toContain('Curvas de los ciclos de amplificación');
    expect(html).toContain('Foto del gel de agarosa');
    expect(html, 'la imagen de las curvas no llegó al PDF').toContain(IMG + 'X');
    // El orden del informe: primero el gel, después las curvas.
    expect(html.indexOf('Foto del gel de agarosa')).toBeLessThan(html.indexOf('Curvas de los ciclos de amplificación'));
  });

  it('sin imagen cargada, el PDF no imprime un título con un hueco debajo', () => {
    rellenarQpcr(1, { codigo: 'L-1', wssv: 'Positivo' }, { ciclo_wssv: '22.4' });
    // Hay qPCR, pero el analista NO subió las curvas.
    const html = htmlDelPdf();
    expect(html, 'imprimió el título de una imagen que no existe')
      .not.toContain('Curvas de los ciclos de amplificación');
    expect(html, 'ni el del gel, que tampoco se cargó').not.toContain('Foto del gel de agarosa');
    // Control: el informe SÍ se generó.
    expect(html).toContain('Fecha de recepción');
  });

  it('un análisis de PCR convencional imprime su gel, sin rastro de curvas', () => {
    rellenar(1, { codigo: 'L-9', ihhnv: 'Negativo' });
    const sid = H.bioSidActivo();
    localStorage.setItem(H.bioFotoKey('gel', sid), IMG);

    const html = htmlDelPdf();
    expect(html).toContain('Foto del gel de agarosa');
    expect(html).toContain(IMG);
    expect(html, 'metió las curvas en un informe sin qPCR').not.toContain('Curvas de los ciclos de amplificación');
  });

  it('borrar un análisis se lleva sus DOS imágenes', () => {
    /* Lo cazó el banco de mutación: `bioRptDelSes` limpiaba sólo el gel y ninguna
       prueba lo miraba. Las curvas del análisis borrado se quedaban en el dispositivo
       sin dueño — el mismo goteo silencioso que vigila la purga por retención, pero
       por la puerta de al lado. */
    const sid = 'sid-a-borrar';
    H.saveBioRpt(sid, H.loadBioRpt(sid));
    localStorage.setItem(H.bioFotoKey('gel', sid), IMG);
    localStorage.setItem(H.bioFotoKey('curvas', sid), IMG);

    H.bioRptDelSes(sid);

    expect(H.bioFotoGet('gel', sid), 'el gel sobrevivió al borrado').toBe('');
    expect(H.bioFotoGet('curvas', sid), 'las CURVAS sobrevivieron al borrado del análisis').toBe('');
  });

  it('la purga NO toca las imágenes del análisis que está en pantalla', () => {
    rellenarQpcr(1, { codigo: 'L-1', wssv: 'Positivo' }, { ciclo_wssv: '22.4' });
    H.saveBioGrid();
    const sid = H.bioSidActivo();
    localStorage.setItem(H.bioFotoKey('gel', sid), IMG);
    localStorage.setItem(H.bioFotoKey('curvas', sid), IMG);

    H._bioPruneRpt();

    expect(H.bioFotoGet('gel', sid), 'la purga borró el gel del análisis vivo').toBe(IMG);
    expect(H.bioFotoGet('curvas', sid), 'la purga borró las curvas del análisis vivo').toBe(IMG);
  });
});

/* ============================================================
   REPORTADO POR EL USUARIO (2026-09-02): «las Curvas sólo salen cuando se hace
   guardado local de los resultados en Ct; no se identifica solo al ubicarlo».

   LA CAUSA. La celda de Ct llevaba `oninput="_bioDirty()"`, que se limita a marcar la
   grilla como sucia. El bloque del informe no se enteraba de nada, así que el cargador
   de curvas no aparecía hasta el siguiente `renderBioReport()` — que en la práctica era
   pulsar «Guardar local».

   ⚠⚠ ESTAS PRUEBAS EJERCITAN EL ASA, NO LA FUNCIÓN. happy-dom no corre los handlers en
   línea, así que se ejecuta el atributo tal cual, con `this` apuntando al elemento,
   igual que haría el navegador. Probar `renderBioReport()` a pelo habría pasado en
   verde sin decir nada de CUÁNDO se le llama, que es justo donde vivía el defecto.
   ============================================================ */
describe('Biomol · las curvas aparecen AL TECLEAR el Ct, sin guardar', () => {
  /** Teclea en una celda y ejecuta SU asa `oninput`, como haría el navegador. */
  function teclear(fila, k, valor) {
    const c = cel(fila, k);
    expect(c, `no existe la celda bg_${fila}_${k}`).toBeTruthy();
    c.value = valor;
    const attr = c.getAttribute('oninput');
    expect(attr, `la celda ${k} no tiene asa oninput`).toBeTruthy();
    new Function('bioPatCambio', 'bioPatInput', 'bioQpcrInput', '_bioDirty', attr)
      .call(c, H.bioPatCambio, H.bioPatInput, H.bioQpcrInput, H._bioDirty);
  }
  const cel = (f, k) => document.querySelector(`#fp-biomol [name="bg_${f}_${k}"]`);
  const ofreceCurvas = () => {
    const box = document.getElementById('bio-rpt-box');
    return !!(box && box.querySelector('[data-foto="curvas"]'));
  };

  beforeEach(() => { localStorage.clear(); H.renderBiomol(); });

  it('la celda de Ct tiene un asa propia, no la genérica de «marcar sucio»', () => {
    teclear(1, 'wssv', 'Positivo');
    const ct = cel(1, 'ciclo_wssv');
    expect(ct, 'la columna de Ct debería estar abierta').toBeTruthy();
    expect(ct.getAttribute('oninput'), 'el Ct seguía con el asa genérica').toBe('bioQpcrInput(this)');
  });

  it('🔴 EL DEFECTO: teclear el Ct saca el cargador de curvas SIN guardar', () => {
    teclear(1, 'wssv', 'Positivo');
    expect(ofreceCurvas(), 'de partida no debería ofrecerlas: aún no hay qPCR').toBe(false);

    teclear(1, 'ciclo_wssv', '22.4');

    expect(ofreceCurvas(), 'hubo que guardar para que salieran').toBe(true);
  });

  it('también con Copias/μl, que es la otra mitad del qPCR', () => {
    teclear(1, 'wssv', 'Positivo');
    teclear(1, 'copias_wssv', '1500');
    expect(ofreceCurvas()).toBe(true);
  });

  it('vaciar el último valor de qPCR vuelve a retirar la oferta', () => {
    teclear(1, 'wssv', 'Positivo');
    teclear(1, 'ciclo_wssv', '22.4');
    expect(ofreceCurvas()).toBe(true);

    teclear(1, 'ciclo_wssv', '');
    expect(ofreceCurvas(), 'sin ningún valor de qPCR ya no hay curvas que adjuntar').toBe(false);
  });

  it('seguir tecleando la misma celda NO repinta una y otra vez', () => {
    teclear(1, 'wssv', 'Positivo');
    const box1 = document.getElementById('bio-rpt-box');
    teclear(1, 'ciclo_wssv', '2');
    const box2 = document.getElementById('bio-rpt-box');
    expect(box2, 'el primer carácter SÍ debe repintar').not.toBe(box1);

    // A partir de aquí la oferta ya está puesta: repintar en cada tecla sería el
    // repaso completo del DOM que el gate de `bioPatInput` existe para evitar.
    teclear(1, 'ciclo_wssv', '22');
    teclear(1, 'ciclo_wssv', '22.');
    teclear(1, 'ciclo_wssv', '22.4');
    expect(document.getElementById('bio-rpt-box'), 'repintó en cada tecla').toBe(box2);
  });
});

/* ============================================================
   REPORTADO POR EL USUARIO (2026-09-02): «al pegar desde Excel resultados de Positivo
   en IHHNV / WSSV / AHPND/EMS no me deja pegar en tanda; sale un mensaje de que se pegó
   en las filas que subrayé pero no sale. Solo se pega una grilla por grilla».

   LA CAUSA, y es una REGRESIÓN de `fa5e439`. La selección múltiple tipo Excel captura el
   pegado antes que el `onpaste` de la grilla y escribe la MISMA celda en todo el rango:
   `ctls.forEach(c => _gselSetVal(c, val))`, sobre un array de elementos capturado ANTES.
   `_gselSetVal` despacha `input` en cada uno; desde que las celdas de resultado tienen
   `oninput="bioPatInput(this)"`, la PRIMERA del lote dispara `bioPatCambio`, que recrea
   la grilla entera — y las demás referencias del array quedan apuntando a nodos
   DESPRENDIDOS. Se les escribe el valor y no se ve nada. El aviso contaba las celdas
   SELECCIONADAS, de ahí «Pegado en N celda(s)» con una sola entrando.

   ⚠⚠ happy-dom no ejecuta los handlers en línea, así que un `dispatchEvent` aquí NO
   despierta a `bioPatInput` y el defecto NO se reproduce: la prueba pasaría en verde sin
   tocar el defecto. Por eso las asas se cablean como listeners reales antes del lote.
   ============================================================ */
describe('Biomol · pegar sobre una selección múltiple entra en TODAS las celdas', () => {
  const cel = (f, k) => document.querySelector(`#fp-biomol [name="bg_${f}_${k}"]`);

  /** Cablea el `oninput` en línea como listener real: es lo que hace el navegador y lo
   *  que happy-dom no hace. Sin esto el lote no dispara ningún repintado y la prueba
   *  no probaría nada. */
  function conAsasVivas(celdas, fn) {
    const quitar = celdas.map((c) => {
      const attr = c.getAttribute('oninput') || '';
      const h = () => new Function('bioPatCambio', 'bioPatInput', 'bioQpcrInput', '_bioDirty', attr)
        .call(c, H.bioPatCambio, H.bioPatInput, H.bioQpcrInput, H._bioDirty);
      c.addEventListener('input', h);
      return () => c.removeEventListener('input', h);
    });
    try { return fn(); } finally { quitar.forEach((f) => f()); }
  }

  beforeEach(() => { localStorage.clear(); H.renderBiomol(); });

  it('🔴 EL DEFECTO: 5 filas marcadas en WSSV reciben las 5, no sólo la primera', () => {
    const celdas = [1, 2, 3, 4, 5].map((f) => cel(f, 'wssv'));
    expect(celdas.every(Boolean), 'control: las 5 celdas existen').toBe(true);

    conAsasVivas(celdas, () => H.gridEnLote(() => celdas.forEach((c) => H._gselSetVal(c, 'Positivo'))));

    const vivos = [1, 2, 3, 4, 5].map((f) => { const c = cel(f, 'wssv'); return c ? c.value : '(no existe)'; });
    expect(vivos, 'sólo entró la primera: el resto se escribió sobre nodos desprendidos')
      .toEqual(['Positivo', 'Positivo', 'Positivo', 'Positivo', 'Positivo']);
    // Y lo que se recoge para guardar dice lo mismo: no es sólo pintura.
    expect(H._collectBioGrid().filter((r) => r.wssv === 'Positivo')).toHaveLength(5);
  });

  it('y el lote deja las columnas de qPCR abiertas en las 5 filas', () => {
    const celdas = [1, 2, 3, 4, 5].map((f) => cel(f, 'wssv'));
    conAsasVivas(celdas, () => H.gridEnLote(() => celdas.forEach((c) => H._gselSetVal(c, 'Positivo'))));

    // El repintado aplazado tiene que haber ocurrido: si no, las celdas de Ct no existen.
    [1, 2, 3, 4, 5].forEach((f) => {
      const ct = cel(f, 'ciclo_wssv');
      expect(ct, `la fila ${f} no abrió su celda de Ct`).toBeTruthy();
      expect(ct.disabled, `la fila ${f} quedó bloqueada`).toBe(false);
    });
  });

  it('borrar un rango también entra en todas', () => {
    const celdas = [1, 2, 3].map((f) => cel(f, 'wssv'));
    conAsasVivas(celdas, () => H.gridEnLote(() => celdas.forEach((c) => H._gselSetVal(c, 'Positivo'))));
    expect(H._collectBioGrid().filter((r) => r.wssv === 'Positivo')).toHaveLength(3);

    const vivas = [1, 2, 3].map((f) => cel(f, 'wssv'));
    conAsasVivas(vivas, () => H.gridEnLote(() => vivas.forEach((c) => H._gselSetVal(c, ''))));
    expect(H._collectBioGrid().filter((r) => r.wssv === 'Positivo'), 'quedaron positivos sin borrar').toHaveLength(0);
  });

  it('un lote sobre celdas SIN qPCR sigue funcionando igual (control)', () => {
    const celdas = [1, 2, 3, 4].map((f) => cel(f, 'bp'));
    conAsasVivas(celdas, () => H.gridEnLote(() => celdas.forEach((c) => H._gselSetVal(c, 'Negativo'))));
    expect(H._collectBioGrid().filter((r) => r.bp === 'Negativo')).toHaveLength(4);
  });

  it('fuera de un lote, una celda suelta sigue repintando al instante', () => {
    // El aplazamiento no puede volverse permanente: si `gridEnLote` no cerrara bien,
    // la grilla dejaría de reaccionar a un tecleo normal y nadie lo notaría aquí.
    const c = cel(1, 'ihhnv');
    c.value = 'Positivo';
    H.bioPatInput(c);
    expect(cel(1, 'ciclo_ihhnv'), 'el repintado quedó aplazado para siempre').toBeTruthy();
  });
});

/* Las pruebas de arriba llaman a `gridEnLote` DIRECTAMENTE, así que dejaban sin cubrir
   el CABLEADO: que los dos handlers de la selección múltiple lo usen de verdad. El banco
   lo cazó — `pegado-sin-lote` y `borrado-sin-lote` sobrevivían—. Es el mismo error que
   `fa5e439`: probar la función y no el asa. Aquí se llama a los handlers REALES. */
describe('Biomol · los handlers de la selección múltiple usan el lote', () => {
  const cel = (f, k) => document.querySelector(`#fp-biomol [name="bg_${f}_${k}"]`);

  /** Monta la selección de la columna `k` entre las filas `f0` y `f1`, como si el
   *  analista hubiera arrastrado el ratón, y devuelve las celdas del rango. */
  function seleccionar(f0, f1, k) {
    const a = cel(f0, k), b = cel(f1, k);
    const tdA = a.closest('td'), tdB = b.closest('td');
    const trA = tdA.parentElement, trB = tdB.parentElement;
    const tbody = trA.parentElement;
    /* ⚠⚠ happy-dom NO implementa `HTMLTableSectionElement.rows` — medido: sale
       `undefined`, mientras que `tr.cells` sí existe. Y `_gselControls` y
       `_gridCellInfo` lo usan, así que sin esto los handlers REALES no pueden correr
       aquí y estas pruebas serían imposibles. Se define sobre la instancia con la misma
       semántica que el navegador (las `<tr>` hijas): es compensar un hueco del arnés,
       igual que ejecutar a mano los handlers en línea, no maquillar el producto. */
    if (!tbody.rows) {
      Object.defineProperty(tbody, 'rows', {
        configurable: true,
        get() { return Array.prototype.filter.call(this.children, (n) => n.tagName === 'TR'); },
      });
    }
    // `cells` es HTMLCollection y en happy-dom no es iterable con spread: se indexa
    // como lo hace el propio motor, que además garantiza el mismo sistema de coordenadas.
    const idx = (col, el) => Array.prototype.indexOf.call(col, el);
    H.setGsel({
      tbody,
      ar: idx(tbody.rows, trA), ac: idx(trA.cells, tdA),
      fr: idx(tbody.rows, trB), fc: idx(trB.cells, tdB),
    });
    const celdas = [];
    for (let f = f0; f <= f1; f++) celdas.push(cel(f, k));
    return celdas;
  }

  /** Cablea el `oninput` en línea como listener real (happy-dom no lo hace). */
  function conAsasVivas(celdas, fn) {
    const quitar = celdas.map((c) => {
      const attr = c.getAttribute('oninput') || '';
      const h = () => new Function('bioPatCambio', 'bioPatInput', 'bioQpcrInput', '_bioDirty', attr)
        .call(c, H.bioPatCambio, H.bioPatInput, H.bioQpcrInput, H._bioDirty);
      c.addEventListener('input', h);
      return () => c.removeEventListener('input', h);
    });
    try { return fn(); } finally { quitar.forEach((f) => f()); }
  }

  const evento = (target, texto) => ({
    clipboardData: { getData: () => texto },
    preventDefault() {}, stopImmediatePropagation() {}, target,
  });

  beforeEach(() => { localStorage.clear(); H.renderBiomol(); });

  it('🔴 el PEGADO real sobre 5 filas de WSSV entra en las 5', () => {
    const celdas = seleccionar(1, 5, 'wssv');
    conAsasVivas(celdas, () => H._gselPasteH(evento(celdas[0], 'Positivo')));

    const vivos = [1, 2, 3, 4, 5].map((f) => cel(f, 'wssv').value);
    expect(vivos, 'el aviso decía «Pegado en 5» y sólo entró la primera')
      .toEqual(['Positivo', 'Positivo', 'Positivo', 'Positivo', 'Positivo']);
    expect(H._collectBioGrid().filter((r) => r.wssv === 'Positivo')).toHaveLength(5);
  });

  it('🔴 el BORRADO real (tecla Supr) sobre el rango vacía las 5', () => {
    let celdas = seleccionar(1, 5, 'wssv');
    conAsasVivas(celdas, () => H._gselPasteH(evento(celdas[0], 'Positivo')));
    expect(H._collectBioGrid().filter((r) => r.wssv === 'Positivo')).toHaveLength(5);

    celdas = seleccionar(1, 5, 'wssv');   // la grilla se repintó: hay que re-seleccionar
    conAsasVivas(celdas, () => H._gselKeyH({
      key: 'Delete', preventDefault() {}, target: celdas[0],
    }));
    expect(H._collectBioGrid().filter((r) => r.wssv === 'Positivo'), 'quedaron sin borrar').toHaveLength(0);
  });

  it('sin rango seleccionado el handler no toca nada: lo hace el onpaste de la grilla', () => {
    seleccionar(2, 2, 'wssv');            // una sola celda = no es rango múltiple
    const c = cel(2, 'wssv');
    H._gselPasteH(evento(c, 'Positivo'));
    expect(c.value, 'se adelantó al onpaste por grilla').toBe('');
  });
});

/* ============================================================
   PETICIÓN DEL USUARIO: «las dos imágenes, a lado».
   Se había interpretado como «a continuación» y salieron APILADAS en la misma
   columna. Aquí se fija que van EN PARALELO.

   ⚠⚠ happy-dom NO calcula diseño: no se puede medir que estén una al lado de otra
   en píxeles. Lo que sí se puede fijar —y es lo que de verdad decide el diseño— es
   la ESTRUCTURA que lo produce, y estas tres cosas separan lo correcto de lo que
   había antes:

     a) las dos cajas comparten padre  → antes YA lo cumplían (`.fc-b`), así que
        sola no distingue nada y no basta;
     b) ese padre es un contenedor DEDICADO, sólo para las imágenes → antes NO:
        colgaban sueltas entre los demás campos del formulario;
     c) ese padre declara varias columnas → antes NO existía tal declaración.

   (b) y (c) son las que fallan sobre el código sin corregir. Comprobado en rojo
   antes de tocar el motor.
   ============================================================ */
describe('Biomol · las dos imágenes del informe van EN PARALELO, no apiladas', () => {
  /** Renderiza el bloque del informe en un DOM aparte y devuelve su raíz. */
  function informe() {
    const d = document.createElement('div');
    d.innerHTML = bloque();
    return d;
  }
  const conQpcr = () =>
    rellenarQpcr(1, { codigo: 'L-1', wssv: 'Positivo' }, { ciclo_wssv: '22.4' });

  it('con qPCR hay DOS imágenes y cuelgan del MISMO contenedor', () => {
    conQpcr();
    const cajas = [...informe().querySelectorAll('[data-foto]')];
    expect(cajas.map((c) => c.getAttribute('data-foto')).sort()).toEqual(['curvas', 'gel']);
    expect(cajas[0].parentElement, 'quedaron en contenedores distintos')
      .toBe(cajas[1].parentElement);
  });

  it('🔴 ese contenedor es DEDICADO: no arrastra los demás campos del formulario', () => {
    conQpcr();
    const cajas = [...informe().querySelectorAll('[data-foto]')];
    const padre = cajas[0].parentElement;
    expect(padre.children.length,
      'el padre lleva más cosas dentro: las imágenes siguen sueltas entre los campos')
      .toBe(cajas.length);
  });

  it('🔴 ese contenedor declara VARIAS COLUMNAS, que es lo que las pone a lado', () => {
    conQpcr();
    const padre = informe().querySelector('[data-foto]').parentElement;
    const estilo = padre.getAttribute('style') || '';
    expect(estilo, 'sin rejilla declarada las imágenes se apilan')
      .toMatch(/grid-template-columns:\s*repeat\(/);
  });

  it('el ancho de columna cabe la vista previa (220px), o la imagen se desborda', () => {
    conQpcr();
    const padre = informe().querySelector('[data-foto]').parentElement;
    const m = (padre.getAttribute('style') || '').match(/minmax\((\d+)px/);
    expect(m, 'la rejilla no declara un mínimo por columna').toBeTruthy();
    expect(Number(m[1]),
      'la columna es más estrecha que la vista previa: se saldría de su celda')
      .toBeGreaterThanOrEqual(220);
  });

  /* 🔑 ACOPLE. No se comprueba contra un número escrito aquí —eso caduca— sino que se
     leen LOS DOS del HTML que produce el motor y se exige la relación entre ellos. Si
     alguien agranda la vista previa y no la columna, o encoge la columna y no la vista
     previa, esto se pone rojo solo. Es la misma idea que acopla `TRAS_MAX_FILAS` al
     `maxRows` del GAS, o el tope de la grilla de Biomol a `LIMITS.biomol.maxRows`. */
  it('🔑 ACOPLE · la columna nunca es más estrecha que la vista previa', () => {
    conQpcr();
    H.bioFotoClear('gel', H.bioSidActivo(), true);
    localStorage.setItem(H.bioFotoKey('gel', H.bioSidActivo()), IMG);

    const raiz = informe();
    const img = raiz.querySelector('[data-foto="gel"] img');
    expect(img, 'no se pintó la vista previa').toBeTruthy();

    const mImg = (img.getAttribute('style') || '').match(/max-width:\s*(\d+)px/);
    const mCol = (raiz.querySelector('[data-foto]').parentElement.getAttribute('style') || '')
      .match(/minmax\((\d+)px/);
    expect(mImg, 'la vista previa ya no declara un ancho máximo').toBeTruthy();
    expect(mCol, 'la rejilla ya no declara un mínimo por columna').toBeTruthy();

    const anchoImg = Number(mImg[1]);
    const minCol = Number(mCol[1]);
    expect(minCol,
      `la columna mide ${minCol}px y la vista previa ${anchoImg}px: la imagen se desbordaría`)
      .toBeGreaterThanOrEqual(anchoImg);
  });

  it('SIN qPCR el contenedor sigue existiendo y el gel no se pierde', () => {
    rellenar(1, { codigo: 'L-1', wssv: 'Negativo' });
    const cajas = [...informe().querySelectorAll('[data-foto]')];
    expect(cajas.map((c) => c.getAttribute('data-foto')), 'el gel es incondicional')
      .toEqual(['gel']);
    expect(cajas[0].parentElement.children.length).toBe(1);
  });
});
