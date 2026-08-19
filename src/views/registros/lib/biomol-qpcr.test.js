// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Biomol «Diagnóstico Molecular» — las dos columnas de qPCR

   Petición del usuario (2026-08-18): la grilla registra además «Ciclo de amplificación»
   y «Copias/μl», los dos datos cuantitativos que deja una corrida de qPCR (normalmente
   WSSV o IHHNV), y la «Descripción del análisis» debe redactarse en qPCR cuando esos
   datos están presentes.

   TRES COSTURAS QUE UN VERDE FÁCIL NO TOCARÍA, y que son las que se vigilan aquí:

   1. EL ORDEN DEL ENVÍO CONTRA LA CABECERA. `buildBioPayload` enumeraba las 16 celdas a
      mano; ahora recorre el esquema. Lo que hay que probar no es que manda 18 valores,
      sino que el valor de cada columna cae bajo SU cabecera: un desfase de una posición
      escribiría las copias en la columna del ciclo y la hoja no se quejaría.

   2. EL ACOPLE CON EL GAS. Las columnas nuevas caben porque `LIMITS.biomol.maxCols` vale
      20 y ahora se usan 18 — y `doPost` RECORTA la fila a maxCols en silencio, no falla.
      El límite se lee del propio GAS/Code.gs, no de un número escrito aquí: si alguien
      añade columnas por encima del tope, se pone roja aquí y no en producción, donde el
      síntoma sería que las últimas columnas llegan vacías sin ningún aviso.

   3. EL CUADRE DE LA FILA DE RESUMEN DEL PDF. Daba por hecho que los patógenos eran las
      ÚLTIMAS columnas de la tabla. Con Ciclo y Copias detrás, la fila «Porcentajes (%)»
      quedaba dos celdas corta y descuadraba el pie del informe. Se cuenta el ancho real
      de cada fila renderizada, que es lo único que delata ese descuadre.

   Verificado por mutación: ver biomol-qpcr.mutaciones (registro de la sesión 2026-08-18).
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const GAS = readFileSync(join(process.cwd(), 'GAS/Code.gs'), 'utf8');

/** Límites que el GAS aplica a la hoja BIOMOL, leídos del fuente real. */
function topeGas() {
  const m = GAS.match(/biomol:\s*\{\s*maxRows:\s*(\d+),\s*maxCols:\s*(\d+)/);
  if (!m) throw new Error('No se encontró LIMITS.biomol en GAS/Code.gs');
  return { maxRows: Number(m[1]), maxCols: Number(m[2]) };
}

const EXPORTAR = ['renderBiomol', '_collectBioGrid', 'buildBioPayload', 'bioGridFecha', 'madGridPaste',
  'bioDescAuto', '_bioEsQpcr', 'downloadBioPDF', 'saveBioGrid',
  'BIO_GRID_COLS', 'BIO_GRID_HEADERS', 'BIO_GRID_CELDAS', 'BIO_PATOGENOS', 'BIO_QPCR_KEYS', 'bioNivelCopias'];
const H = {};
const avisos = [];

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

  // `new Function` no deja nada en globalThis: hace falta un epílogo que exporte.
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}'
    + '\ntry{ H.setTab=function(t){curTab=t;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => { avisos.push(String(m)); });
  H.setMod(12);            // BIO_MOD
  H.setTab('biomol');
});

/** Rellena celdas de una fila de la grilla por su NOMBRE real (bg_<fila>_<clave>).
 *  Escribir en «el primer input de la fila» NO la marca como fila con datos. */
function rellenar(fila, datos) {
  const fp = document.getElementById('fp-biomol');
  let puestas = 0;
  Object.keys(datos).forEach((k) => {
    const el = fp.querySelector(`[name="bg_${fila}_${k}"]`);
    if (el) { el.value = String(datos[k]); puestas++; }
  });
  expect(puestas).toBe(Object.keys(datos).length);   // control: el fixture SÍ escribió
  return puestas;
}

describe('Biomol · las columnas Ciclo de amplificación y Copias/μl', () => {
  it('están en el esquema, al final y con el nombre exacto de la hoja', () => {
    const labels = H.BIO_GRID_HEADERS;
    expect(labels).toContain('Ciclo de amplificación');
    expect(labels).toContain('Copias/μl');
    // Al FINAL y en ese orden: `ensureHeaders` del GAS sólo sabe añadir columnas al
    // final, así que ponerlas en medio dejaría la hoja de producción sin migrar.
    // Detrás sólo va «Sesión», que es metadato y también nació al final.
    expect(labels.slice(-3)).toEqual(['Ciclo de amplificación', 'Copias/μl', 'Sesión']);
    // Son las dos últimas columnas TECLEABLES (Sesión no se escribe a mano).
    expect(H.BIO_GRID_CELDAS.map((c) => c.label).slice(-2))
      .toEqual(['Ciclo de amplificación', 'Copias/μl']);
    // Y detrás del bloque de patógenos, que es lo que la fila de resumen del PDF
    // ya no puede dar por sentado.
    expect(labels.indexOf('Ciclo de amplificación')).toBeGreaterThan(labels.indexOf('EHP'));
  });

  it('se pintan como celdas editables en la grilla', () => {
    localStorage.clear();
    H.renderBiomol();
    const fp = document.getElementById('fp-biomol');
    const cabeceras = [...fp.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    expect(cabeceras).toContain('Ciclo de amplificación');
    expect(cabeceras).toContain('Copias/μl');
    expect(fp.querySelector('[name="bg_1_ciclo"]')).toBeTruthy();
    expect(fp.querySelector('[name="bg_1_copias"]')).toBeTruthy();
    // La cabecera de la tabla y las celdas de una fila miden lo mismo: si el render
    // pintase una columna de menos, la tabla saldría dentada y nadie lo vería.
    const celdas = fp.querySelectorAll('tbody tr:first-child td').length;
    expect(celdas).toBe(cabeceras.length);
  });

  it('cada valor viaja bajo SU cabecera, no una columna corrida', () => {
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-001', wssv: 'Positivo', ciclo: '22.4', copias: '1500' });
    // La forma que manda syncBioGrid es el REGISTRO GUARDADO ({…, data:{…}}), no la
    // fila desnuda: se prueba esa, que es la que corre en producción.
    const guardados = H._collectBioGrid().map((d) => ({ id: 'x', ts: 1, data: d }));
    const payload = H.buildBioPayload(H.bioGridFecha(), guardados);

    expect(payload.headers.length).toBe(H.BIO_GRID_COLS.length);
    expect(payload.rows[0].length).toBe(payload.headers.length);

    // El emparejamiento cabecera↔valor es la costura: se lee por NOMBRE de columna.
    const celda = (nombre) => payload.rows[0][payload.headers.indexOf(nombre)];
    expect(celda('Código')).toBe('L-001');
    expect(celda('WSSV')).toBe('Positivo');
    expect(celda('Ciclo de amplificación')).toBe('22.4');
    expect(celda('Copias/μl')).toBe('1500');
    // Y las que no se tocaron siguen vacías (no arrastradas desde la vecina).
    expect(celda('EHP')).toBe('');
    expect(celda('IHHNV')).toBe('');
  });

  it('el payload sale igual con la fila desnuda que con el registro guardado', () => {
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-003', ihhnv: 'Negativo', ciclo: '28.1', copias: '42' });
    const desnudas = H._collectBioGrid();
    const conSobre = desnudas.map((d) => ({ id: 'x', ts: 1, data: d }));
    const f = H.bioGridFecha();
    // Antes, pasarle la forma desnuda no fallaba: mandaba filas VACÍAS a la hoja.
    expect(H.buildBioPayload(f, desnudas).rows).toEqual(H.buildBioPayload(f, conSobre).rows);
    expect(H.buildBioPayload(f, desnudas).rows[0]).toContain('L-003');
  });

  // Pegar desde Excel es LA vía de entrada de esta grilla, así que el mapeo de columnas
  // del pegado tiene que estar cubierto. ⚠ happy-dom NO dispara los manejadores en línea
  // (`onpaste="…"`) con un evento sintético —se comprobó: el atributo está puesto y el
  // evento se despacha, pero el manejador no corre—, así que se le llama directamente
  // con el mismo objeto que le llegaría del navegador. Lo que se prueba es su lógica de
  // reparto por data-r/data-c, que es donde las columnas nuevas podrían descolocarse.
  const pegar = (celda, texto) => H.madGridPaste(
    { clipboardData: { getData: () => texto }, preventDefault() {}, target: celda }, 'biomol',
  );

  it('el pegado desde Excel llena las columnas nuevas', () => {
    localStorage.clear();
    H.renderBiomol();
    const fp = document.getElementById('fp-biomol');
    // Tabla de 2 filas × 17 columnas (el esquema entero salvo Fecha, que la gobierna el
    // selector): las dos últimas deben caer en Ciclo y Copias. El orden es
    // Código·Corrida·Piscina·Lugar·Tanque·Otros·Muestra·Estadío·Sexo·IHHNV·WSSV·BP·
    // AHPND·NHPB·EHP·Ciclo·Copias — los cuatro huecos son BP, AHPND, NHPB y EHP.
    const fila = (n) => ['L-' + n, 'C1', 'P1', 'Sala 2', 'TQ1', '-', String(n), 'Adulto',
      'Hembra', 'Negativo', 'Positivo', '', '', '', '', '2' + n + '.5', '1000' + n].join('\t');
    pegar(fp.querySelector('[name="bg_1_codigo"]'), fila(1) + '\n' + fila(2));

    const recogidas = H._collectBioGrid();
    expect(recogidas).toHaveLength(2);              // control: el pegado SÍ entró
    expect(recogidas[0].codigo).toBe('L-1');
    expect(recogidas[0].sexo).toBe('Hembra');       // control: no hay desfase a mitad
    expect(recogidas[0].ciclo).toBe('21.5');
    expect(recogidas[0].copias).toBe('10001');
    expect(recogidas[1].ciclo).toBe('22.5');
    expect(recogidas[1].copias).toBe('10002');
    // La Fecha no se pisa: la manda el selector del día, no la tabla pegada.
    expect(recogidas[0].fecha).toBe(H.bioGridFecha());
  });

  it('una tabla ANTIGUA, sin las dos columnas, se sigue pegando sin descolocarse', () => {
    localStorage.clear();
    H.renderBiomol();
    const fp = document.getElementById('fp-biomol');
    // Lo que ya tienen guardado los analistas: las 15 columnas de antes (el esquema
    // viejo de 16 menos Fecha), terminando en EHP.
    pegar(fp.querySelector('[name="bg_1_codigo"]'), ['L-9', 'C2', 'P2', 'Chongón', 'TQ4', '-',
      '7', 'Reproductores', 'Macho', 'Negativo', 'Negativo', '', '', '', 'Negativo'].join('\t'));

    const [r] = H._collectBioGrid();
    expect(r.codigo).toBe('L-9');
    expect(r.estadio).toBe('Reproductores');
    expect(r.sexo).toBe('Macho');
    expect(r.ihhnv).toBe('Negativo');
    expect(r.ehp).toBe('Negativo');                  // control: la última SÍ llegó a EHP
    // Las columnas nuevas quedan vacías, no arrastran el último valor pegado.
    expect(r.ciclo).toBe('');
    expect(r.copias).toBe('');
  });

  it('el envío cabe en el límite de columnas que aplica el GAS', () => {
    const tope = topeGas();
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-002', ciclo: '30', copias: '10' });
    const payload = H.buildBioPayload(H.bioGridFecha(), H._collectBioGrid());
    // doPost hace row.slice(0, maxCols) SIN avisar: pasarse no da error, borra datos.
    expect(payload.headers.length).toBeLessThanOrEqual(tope.maxCols);
    expect(payload.rows[0].length).toBeLessThanOrEqual(tope.maxCols);
  });
});

describe('Biomol · la Descripción del análisis elige PCR o qPCR', () => {
  const soloPcr = [{ wssv: 'Positivo' }];
  const conCiclo = [{ wssv: 'Positivo', ciclo: '22.4' }];
  const conCopias = [{ wssv: 'Positivo', copias: '1500' }];

  it('sin ningún dato cuantitativo mantiene la redacción en PCR', () => {
    const t = H.bioDescAuto(soloPcr);
    expect(t).toContain('reacción en cadena de la polimerasa (PCR)');
    expect(t).not.toContain('qPCR');
  });

  it('con Ciclo de amplificación redacta el texto de qPCR que pidió el usuario', () => {
    expect(H.bioDescAuto(conCiclo)).toBe(
      'Detección del Virus del síndrome de la mancha blanca (WSSV), mediante reacción '
      + 'en cadena de la polimerasa cuantitativa en tiempo real (qPCR).',
    );
  });

  it('basta con Copias/μl: un Ct sin cuantificar sigue siendo tiempo real', () => {
    expect(H.bioDescAuto(conCopias)).toContain('cuantitativa en tiempo real (qPCR)');
    expect(H.bioDescAuto(conCopias)).not.toContain('polimerasa (PCR)');
  });

  it('IHHNV, el otro patógeno habitual de qPCR, también contrae el artículo', () => {
    expect(H.bioDescAuto([{ ihhnv: 'Negativo', ciclo: '28' }])).toBe(
      'Detección del Virus de la necrosis infecciosa hipodérmica y hematopoyética (IHHNV), '
      + 'mediante reacción en cadena de la polimerasa cuantitativa en tiempo real (qPCR).',
    );
  });

  it('un día con las DOS técnicas las separa en dos frases', () => {
    const t = H.bioDescAuto([
      { wssv: 'Positivo', ciclo: '22.4', copias: '1500' },   // qPCR
      { ihhnv: 'Negativo' },                                  // PCR convencional
      { ehp: 'Negativo' },                                    // PCR convencional
    ]);
    const [frase1, frase2] = t.split(/(?<=\.)\s+/);
    expect(frase1).toBe('Detección del Virus del síndrome de la mancha blanca (WSSV), '
      + 'mediante reacción en cadena de la polimerasa cuantitativa en tiempo real (qPCR).');
    expect(frase2).toContain('(IHHNV)');
    expect(frase2).toContain('(EHP)');
    expect(frase2).toContain('polimerasa (PCR).');
    // Lo que NO puede pasar: atribuir qPCR a lo que se corrió por PCR convencional.
    expect(frase1).not.toContain('IHHNV');
    expect(frase1).not.toContain('EHP');
  });

  it('un patógeno corrido por las dos vías se nombra UNA vez, en la frase de qPCR', () => {
    const t = H.bioDescAuto([
      { wssv: 'Positivo', ciclo: '22.4' },
      { wssv: 'Negativo' },
    ]);
    expect(t.match(/WSSV/g)).toHaveLength(1);
    expect(t).toContain('(qPCR)');
    expect(t).not.toContain('polimerasa (PCR)');
  });

  it('con varios patógenos enumera sin artículo, como se venía redactando', () => {
    const t = H.bioDescAuto([{ wssv: 'Positivo', ihhnv: 'Negativo', ciclo: '25' }]);
    expect(t.startsWith('Detección de Virus')).toBe(true);
    expect(t).toContain('(WSSV)');
    expect(t).toContain('(IHHNV)');
  });

  it('sin resultados no inventa descripción', () => {
    expect(H.bioDescAuto([])).toBe('');
    expect(H.bioDescAuto([{ ciclo: '22', copias: '10' }])).toBe('');   // datos sin patógeno
  });

  it('_bioEsQpcr ignora celdas en blanco', () => {
    expect(H._bioEsQpcr({ ciclo: '  ', copias: '' })).toBe(false);
    expect(H._bioEsQpcr({ ciclo: '0' })).toBe(true);
    expect(H._bioEsQpcr({})).toBe(false);
  });
});

describe('Biomol · el PDF sigue cuadrando con las columnas nuevas', () => {
  it('la fila de resumen mide lo mismo que la cabecera de la tabla', () => {
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-010', wssv: 'Positivo', ihhnv: 'Negativo', ciclo: '22.4', copias: '1500' });
    rellenar(2, { codigo: 'L-011', wssv: 'Negativo', ihhnv: 'Negativo', ciclo: '31.0', copias: '20' });

    // Sonda de render: se intercepta la ventana emergente y se lee el HTML del informe.
    let html = '';
    const abrirOriginal = window.open;
    window.open = () => ({
      document: { write: (s) => { html += s; }, close: () => {}, set title(v) {} },
    });
    try { H.downloadBioPDF(); } finally { window.open = abrirOriginal; }
    expect(html).toContain('Reporte de Análisis Molecular');   // control: sí se generó

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchoCabecera = doc.querySelectorAll('thead tr th').length;
    expect(anchoCabecera).toBeGreaterThan(0);

    // Cada fila del cuerpo —datos Y resumen— debe medir lo mismo contando colspan.
    const filas = [...doc.querySelectorAll('tbody tr')];
    expect(filas.length).toBeGreaterThan(2);                   // control: hay resumen
    filas.forEach((tr, i) => {
      const ancho = [...tr.children]
        .reduce((n, td) => n + (Number(td.getAttribute('colspan')) || 1), 0);
      expect(`fila ${i}: ${ancho}`).toBe(`fila ${i}: ${anchoCabecera}`);
    });

    // Y las columnas nuevas salen impresas con su valor.
    expect(html).toContain('Ciclo de amplificación');
    expect(html).toContain('Copias/μl');
    expect(html).toContain('22.4');
    expect(html).toContain('1500');
  });

  it('los controles llevan sus valores bajo Ciclo y Copias', () => {
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-030', wssv: 'Positivo', ciclo: '22.4', copias: '1500' });

    let html = '';
    const abrirOriginal = window.open;
    window.open = () => ({ document: { write: (s) => { html += s; }, close: () => {}, set title(v) {} } });
    try { H.downloadBioPDF(); } finally { window.open = abrirOriginal; }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cab = [...doc.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    const iCiclo = cab.indexOf('Ciclo de amplificación');
    const iCopias = cab.indexOf('Copias/μl');
    expect(iCiclo).toBeGreaterThan(-1);            // control: las columnas SÍ se imprimen

    // Cada fila de resumen se lee por POSICIÓN de columna, contando el colspan de la
    // etiqueta: es la única forma de comprobar que el valor cae bajo su cabecera.
    const celdasDe = (tr) => {
      const out = [];
      [...tr.children].forEach((td) => {
        const n = Number(td.getAttribute('colspan')) || 1;
        for (let i = 0; i < n; i++) out.push(i === 0 ? td.textContent.trim() : '');
      });
      return out;
    };
    const filaLlamada = (etiqueta) => celdasDe([...doc.querySelectorAll('tbody tr')]
      .find((tr) => tr.textContent.trim().startsWith(etiqueta)));

    const pos = filaLlamada('Control Positivo');
    expect(pos[iCiclo]).toBe('22');
    expect(pos[iCopias]).toBe('1.00E+05');

    ['Control Negativo', 'Control de Extracción'].forEach((nombre) => {
      const f = filaLlamada(nombre);
      expect(`${nombre} ciclo: ${f[iCiclo]}`).toBe(`${nombre} ciclo: N/A`);
      expect(`${nombre} copias: ${f[iCopias]}`).toBe(`${nombre} copias: N/A`);
    });

    // Los controles siguen diciendo "Excelente" en los patógenos…
    expect(pos[cab.indexOf('WSSV')]).toBe('Excelente');
    // …y la fila de porcentajes NO se cuantifica: esas dos celdas van en blanco.
    const pct = filaLlamada('Porcentajes (%)');
    expect(pct[iCiclo]).toBe('');
    expect(pct[iCopias]).toBe('');
    expect(pct[cab.indexOf('WSSV')]).toBe('100%');   // control: la fila es la correcta
  });

  it('clasifica Copias/μl por el exponente y no inventa nivel donde no hay número', () => {
    // Criterio del laboratorio: +01 o menos = Bajo · +02 y +03 = Medio · +04 o más = Alto.
    const casos = [
      ['2.00E+01', 'Bajo'], ['9.99E+01', 'Bajo'], ['1.00E+01', 'Bajo'],
      ['1.00E+02', 'Medio'], ['4.30E+02', 'Medio'], ['9.99E+03', 'Medio'],
      ['1.00E+04', 'Alto'], ['1.00E+05', 'Alto'], ['3.00E+06', 'Alto'],
    ];
    casos.forEach(([v, esperado]) => expect(`${v} → ${H.bioNivelCopias(v)}`).toBe(`${v} → ${esperado}`));
    // Los límites exactos entre categorías, que es donde un signo mal puesto se nota.
    expect(H.bioNivelCopias('9.99E+01')).toBe('Bajo');
    expect(H.bioNivelCopias('1.00E+02')).toBe('Medio');
    expect(H.bioNivelCopias('9.99E+03')).toBe('Medio');
    expect(H.bioNivelCopias('1.00E+04')).toBe('Alto');
    // Número llano: la celda es texto libre y también se escribe así.
    expect(H.bioNivelCopias('1500')).toBe('Medio');
    expect(H.bioNivelCopias('20')).toBe('Bajo');
    // Lo que no es una medida no se clasifica: poner un nivel ahí afirmaría una carga
    // que nadie midió. «N/A» es justo lo que llevan dos de los tres controles.
    ['', '   ', 'N/A', 'n/d', '0', '-5'].forEach((v) => expect(`${JSON.stringify(v)} → ${H.bioNivelCopias(v)}`).toBe(`${JSON.stringify(v)} → `));
  });

  it('el PDF añade la columna Nivel pegada a Copias/μl y marca los positivos', () => {
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-040', wssv: 'Positivo', ihhnv: 'Negativo', ciclo: '22.4', copias: '1.00E+05' });
    rellenar(2, { codigo: 'L-041', wssv: 'Negativo', ihhnv: 'Negativo', ciclo: '31.0', copias: '2.00E+01' });

    let html = '';
    const abrirOriginal = window.open;
    window.open = () => ({ document: { write: (s) => { html += s; }, close: () => {}, set title(v) {} } });
    try { H.downloadBioPDF(); } finally { window.open = abrirOriginal; }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cab = [...doc.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    // Pegada a Copias/μl, no al final de la tabla.
    expect(cab[cab.indexOf('Copias/μl') + 1]).toBe('Nivel');

    // La cabecera ya incluye la columna «#», así que el índice del <th> coincide
    // con el del <td> de la misma columna: no hay desplazamiento que compensar.
    const cuerpo = [...doc.querySelectorAll('tbody tr')];
    const celdas = (tr) => [...tr.children].map((td) => td.textContent.trim());
    expect(celdas(cuerpo[0])[cab.indexOf('Nivel')]).toBe('Alto');
    expect(celdas(cuerpo[1])[cab.indexOf('Nivel')]).toBe('Bajo');

    // Positivos realzados; los negativos NO (si se pintara todo, el color no diría nada).
    const clases = (tr) => [...tr.children].map((td) => td.className);
    expect(clases(cuerpo[0])[cab.indexOf('WSSV')]).toContain('bp-pos');
    expect(clases(cuerpo[0])[cab.indexOf('IHHNV')]).not.toContain('bp-pos');
    expect(clases(cuerpo[1])[cab.indexOf('WSSV')]).not.toContain('bp-pos');
    expect(html).toContain('td.bp-pos{background:');            // la regla viaja en el PDF

    // Y la fila de resumen sigue cuadrando con la columna nueva dentro.
    const anchoCab = cab.length;
    cuerpo.forEach((tr, i) => {
      const ancho = [...tr.children].reduce((n, td) => n + (Number(td.getAttribute('colspan')) || 1), 0);
      expect(`fila ${i}: ${ancho}`).toBe(`fila ${i}: ${anchoCab}`);
    });
  });

  it('el Control Positivo deriva su Nivel de sus propias copias', () => {
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-050', wssv: 'Positivo', ciclo: '22.4', copias: '1.00E+05' });

    let html = '';
    const abrirOriginal = window.open;
    window.open = () => ({ document: { write: (s) => { html += s; }, close: () => {}, set title(v) {} } });
    try { H.downloadBioPDF(); } finally { window.open = abrirOriginal; }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cab = [...doc.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    const iNivel = cab.indexOf('Nivel');
    const desplegar = (tr) => {
      const out = [];
      [...tr.children].forEach((td) => {
        const n = Number(td.getAttribute('colspan')) || 1;
        for (let i = 0; i < n; i++) out.push(i === 0 ? td.textContent.trim() : '');
      });
      return out;
    };
    const fila = (etq) => desplegar([...doc.querySelectorAll('tbody tr')]
      .find((tr) => tr.textContent.trim().startsWith(etq)));
    // 1.00E+05 es Alto: el control no puede anunciar una carga y un nivel que no cuadren.
    expect(fila('Control Positivo')[iNivel]).toBe('Alto');
    // Los otros dos no se cuantifican: N/A no se clasifica.
    expect(fila('Control Negativo')[iNivel]).toBe('');
    expect(fila('Control de Extracción')[iNivel]).toBe('');
  });

  it('la columna vacía no se imprime y el resumen sigue cuadrando', () => {
    localStorage.clear();
    H.renderBiomol();
    // Sin Ciclo ni Copias: el PDF omite esas columnas (sólo imprime las que tienen dato).
    rellenar(1, { codigo: 'L-020', wssv: 'Positivo' });

    let html = '';
    const abrirOriginal = window.open;
    window.open = () => ({
      document: { write: (s) => { html += s; }, close: () => {}, set title(v) {} },
    });
    try { H.downloadBioPDF(); } finally { window.open = abrirOriginal; }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchoCabecera = doc.querySelectorAll('thead tr th').length;
    expect(html).not.toContain('Ciclo de amplificación');
    // «Nivel» se deriva de Copias/μl: sin esa columna no tiene nada que clasificar y
    // tampoco debe imprimirse. Sin esto, colgarla del final en vez de de Copias pasaría
    // desapercibido, porque Copias es hoy la última columna imprimible.
    expect(html).not.toContain('>Nivel<');
    [...doc.querySelectorAll('tbody tr')].forEach((tr, i) => {
      const ancho = [...tr.children]
        .reduce((n, td) => n + (Number(td.getAttribute('colspan')) || 1), 0);
      expect(`fila ${i}: ${ancho}`).toBe(`fila ${i}: ${anchoCabecera}`);
    });
  });
});
