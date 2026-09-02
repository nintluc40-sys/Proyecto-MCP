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
  'BIO_GRID_COLS', '_bioPruneRpt', 'saveBioRpt', 'loadBioRpt', 'bioPatCambio', 'downloadBioPDF', 'bioRptDelSes'];
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
