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
  'BIO_GRID_COLS', 'BIO_GRID_HEADERS', 'BIO_GRID_CELDAS', 'BIO_PATOGENOS', 'BIO_QPCR_KEYS', 'bioNivelCopias',
  '_bioPositivoEstricto', 'BIO_QPCR_PATS', 'bioPatCambio'];
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
  it('🔴 las columnas genéricas YA NO existen: cada patógeno tiene las suyas', () => {
    const labels = H.BIO_GRID_HEADERS;
    // Retiradas el 2026-08-23 por el usuario. Tener el mismo dato en dos sitios es
    // la costura que este proyecto paga caro; y no había nada que migrar (0 filas).
    expect(labels, 'la pareja genérica sigue en el esquema').not.toContain('Ciclo de amplificación');
    expect(labels).not.toContain('Copias/μl');
    // ⚠ Desde 2026-08-23 estas dos son LEGADO: la cuantificación pasó a ser POR
    // PATÓGENO. NO se borran del payload aunque estén vacías en producción, porque
    // se escribe por POSICIÓN y `ensureHeaders` del GAS sólo sabe AÑADIR columnas:
    // quitarlas correría todo lo que hay a su derecha y los datos nuevos entrarían
    // bajo cabeceras equivocadas. Su sitio es intocable, y esto lo vigila.
    // ⚠ Quitarlas EXIGE borrarlas también a mano de la hoja: el payload se escribe
    // por POSICIÓN, así que mientras sigan ahí «Sesión» caería sobre la del Ciclo.
    expect(labels[16]).toBe('Sesión');
    // Y la cuantificación va detrás del bloque de patógenos.
    expect(labels.indexOf('Ciclo de amplificación WSSV')).toBeGreaterThan(labels.indexOf('EHP'));
  });

  it('🔴 la cuantificación POR PATÓGENO va DESPUÉS de «Sesión»', () => {
    // No es un descuido de orden: `ensureHeaders` sólo añade al final, así que es
    // la única posición en la que la hoja de producción se migra sola. Meterlas
    // junto a las genéricas habría desplazado «Sesión» y roto el upsert.
    const labels = H.BIO_GRID_HEADERS;
    expect(labels.slice(17)).toEqual([
      'Ciclo de amplificación WSSV', 'Copias/μl WSSV',
      'Ciclo de amplificación IHHNV', 'Copias/μl IHHNV',
      'Ciclo de amplificación AHPND/EMS', 'Copias/μl AHPND/EMS',
    ]);
    expect(labels).toHaveLength(23);
  });

  it('🔴 «Sesión» conserva su índice: de él depende el upsert del GAS', () => {
    // `keyCols` se calcula con `indexOf("Sesión")`. Si las columnas nuevas se
    // hubieran colado antes, el GAS reemplazaría filas por la columna equivocada.
    expect(H.BIO_GRID_HEADERS.indexOf('Sesión')).toBe(16);
  });

  it('se pintan como celdas editables en la grilla', () => {
    localStorage.clear();
    H.renderBiomol();
    const fp = document.getElementById('fp-biomol');
    const cabeceras = [...fp.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    // Sin ningún positivo no hay columnas de qPCR que pintar: ésa es la regla.
    expect(cabeceras).not.toContain('Ct WSSV');
    expect(fp.querySelector('[name="bg_1_ciclo_wssv"]')).toBeNull();
    // La cabecera de la tabla y las celdas de una fila miden lo mismo: si el render
    // pintase una columna de menos, la tabla saldría dentada y nadie lo vería.
    const celdas = fp.querySelectorAll('tbody tr:first-child td').length;
    expect(celdas).toBe(cabeceras.length);
  });

  it('cada valor viaja bajo SU cabecera, no una columna corrida', () => {
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-001', wssv: 'Positivo' });
    H.bioPatCambio();                       // saca las columnas de WSSV, sin guardar
    rellenar(1, { ciclo_wssv: '22.4', copias_wssv: '1500' });
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
    expect(celda('Ciclo de amplificación WSSV')).toBe('22.4');
    expect(celda('Copias/μl WSSV')).toBe('1500');
    // Y las que no se tocaron siguen vacías (no arrastradas desde la vecina).
    expect(celda('EHP')).toBe('');
    expect(celda('IHHNV')).toBe('');
  });

  it('el payload sale igual con la fila desnuda que con el registro guardado', () => {
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-003', ihhnv: 'Negativo' });
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
    // Tabla de 2 filas × 15 columnas: el esquema visible entero salvo Fecha (la
    // gobierna el selector). Orden: Código·Corrida·Piscina·Lugar·Tanque·Otros·
    // Muestra·Estadío·Sexo·IHHNV·WSSV·BP·AHPND·NHPB·EHP.
    // ⚠ Desde el 2026-08-23 las columnas de qPCR ya NO están aquí: no se pintan
    // hasta que hay un positivo, así que un pegado desde Excel no puede contar con
    // ellas. Lo que se sigue vigilando es que las 15 caigan cada una en su sitio.
    const fila = (n) => ['L-' + n, 'C1', 'P1', 'Sala 2', 'TQ1', '-', String(n), 'Adulto',
      'Hembra', 'Negativo', 'Positivo', '', '', '', ''].join('\t');
    pegar(fp.querySelector('[name="bg_1_codigo"]'), fila(1) + '\n' + fila(2));

    const recogidas = H._collectBioGrid();
    expect(recogidas).toHaveLength(2);              // control: el pegado SÍ entró
    expect(recogidas[0].codigo).toBe('L-1');
    expect(recogidas[0].sexo).toBe('Hembra');       // control: no hay desfase a mitad
    expect(recogidas[0].ihhnv).toBe('Negativo');
    expect(recogidas[0].wssv).toBe('Positivo');     // la última columna pegada
    expect(recogidas[1].wssv).toBe('Positivo');
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
    // Sin ningún positivo, las columnas de qPCR ni se pintan: no hay dónde
    // arrastrar el último valor pegado, que era el riesgo que vigilaba esta prueba.
    // El recolector siempre devuelve la forma completa: una columna que no está
    // pintada llega VACÍA, no ausente. Lo que se vigila es que no traiga el último
    // valor pegado, que era el riesgo real.
    expect(r.ciclo_wssv, 'arrastró un valor de la columna vecina').toBe('');
    expect(r.ciclo_ihhnv).toBe('');
    expect(r.copias_wssv).toBe('');
  });

  it('el envío cabe en el límite de columnas que aplica el GAS', () => {
    const tope = topeGas();
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-002', wssv: 'Positivo' });
    H.bioPatCambio();
    rellenar(1, { ciclo_wssv: '30', copias_wssv: '10' });
    const payload = H.buildBioPayload(H.bioGridFecha(), H._collectBioGrid());
    // doPost hace row.slice(0, maxCols) SIN avisar: pasarse no da error, borra datos.
    expect(payload.headers.length).toBeLessThanOrEqual(tope.maxCols);
    expect(payload.rows[0].length).toBeLessThanOrEqual(tope.maxCols);
  });
});

describe('Biomol · la Descripción del análisis elige PCR o qPCR', () => {
  const soloPcr = [{ wssv: 'Positivo' }];
  const conCiclo = [{ wssv: 'Positivo', ciclo_wssv: '22.4' }];
  const conCopias = [{ wssv: 'Positivo', copias_wssv: '1500' }];

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
    expect(H.bioDescAuto([{ ihhnv: 'Negativo', ciclo_ihhnv: '28' }])).toBe(
      'Detección del Virus de la necrosis infecciosa hipodérmica y hematopoyética (IHHNV), '
      + 'mediante reacción en cadena de la polimerasa cuantitativa en tiempo real (qPCR).',
    );
  });

  it('un día con las DOS técnicas las separa en dos frases', () => {
    const t = H.bioDescAuto([
      { wssv: 'Positivo', ciclo_wssv: '22.4', copias_wssv: '1500' },   // qPCR
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
      { wssv: 'Positivo', ciclo_wssv: '22.4' },
      { wssv: 'Negativo' },
    ]);
    expect(t.match(/WSSV/g)).toHaveLength(1);
    expect(t).toContain('(qPCR)');
    expect(t).not.toContain('polimerasa (PCR)');
  });

  it('con varios patógenos enumera sin artículo, como se venía redactando', () => {
    const t = H.bioDescAuto([{ wssv: 'Positivo', ihhnv: 'Negativo', ciclo_wssv: '25' }]);
    expect(t.startsWith('Detección de Virus')).toBe(true);
    expect(t).toContain('(WSSV)');
    expect(t).toContain('(IHHNV)');
  });

  it('sin resultados no inventa descripción', () => {
    expect(H.bioDescAuto([])).toBe('');
    expect(H.bioDescAuto([{ ciclo_wssv: '22', copias_wssv: '10' }])).toBe('');   // datos sin patógeno
  });

  it('_bioEsQpcr ignora celdas en blanco', () => {
    expect(H._bioEsQpcr({ ciclo_wssv: '  ', copias_wssv: '' })).toBe(false);
    expect(H._bioEsQpcr({ ciclo_wssv: '0' })).toBe(true);
    expect(H._bioEsQpcr({})).toBe(false);
  });
});

describe('Biomol · el PDF sigue cuadrando con las columnas nuevas', () => {
  it('la fila de resumen mide lo mismo que la cabecera de la tabla', () => {
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-010', wssv: 'Positivo', ihhnv: 'Negativo' });
    rellenar(2, { codigo: 'L-011', wssv: 'Negativo', ihhnv: 'Negativo' });
    H.bioPatCambio();                       // saca las columnas de WSSV
    rellenar(1, { ciclo_wssv: '22.4', copias_wssv: '1500' });

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
    expect(html).toContain('Ciclo de amplificación WSSV');
    expect(html).toContain('Copias/μl');
    expect(html).toContain('22.4');
    expect(html).toContain('1500');
  });

  it('los controles llevan sus valores bajo Ciclo y Copias', () => {
    localStorage.clear();
    H.renderBiomol();
    rellenar(1, { codigo: 'L-030', wssv: 'Positivo' });
    H.bioPatCambio();
    rellenar(1, { ciclo_wssv: '22.4', copias_wssv: '1500' });

    let html = '';
    const abrirOriginal = window.open;
    window.open = () => ({ document: { write: (s) => { html += s; }, close: () => {}, set title(v) {} } });
    try { H.downloadBioPDF(); } finally { window.open = abrirOriginal; }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cab = [...doc.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    const iCiclo = cab.indexOf('Ciclo de amplificación WSSV');
    const iCopias = cab.indexOf('Copias/μl WSSV');
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
    rellenar(1, { codigo: 'L-040', wssv: 'Positivo', ihhnv: 'Negativo' });
    rellenar(2, { codigo: 'L-041', wssv: 'Negativo', ihhnv: 'Negativo' });
    H.bioPatCambio();
    rellenar(1, { ciclo_wssv: '22.4', copias_wssv: '1.00E+05' });
    rellenar(2, { ciclo_wssv: '31.0', copias_wssv: '2.00E+01' });

    let html = '';
    const abrirOriginal = window.open;
    window.open = () => ({ document: { write: (s) => { html += s; }, close: () => {}, set title(v) {} } });
    try { H.downloadBioPDF(); } finally { window.open = abrirOriginal; }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cab = [...doc.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    // Pegada a Copias/μl, no al final de la tabla.
    expect(cab[cab.indexOf('Copias/μl WSSV') + 1]).toBe('Nivel');

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
    rellenar(1, { codigo: 'L-050', wssv: 'Positivo' });
    H.bioPatCambio();
    rellenar(1, { ciclo_wssv: '22.4', copias_wssv: '1.00E+05' });

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
    expect(html).not.toContain('Ciclo de amplificación WSSV');
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

describe('Biomol · la cuantificación es POR PATÓGENO', () => {
  const cabeceras = () => [...document.getElementById('fp-biomol')
    .querySelectorAll('thead th')].map((t) => t.textContent.trim());
  const celda = (fila, k) => document.getElementById('fp-biomol')
    .querySelector(`[name="bg_${fila}_${k}"]`);

  it('🔴 sólo «Positivo», pero en cualquier caja', () => {
    // ⚠ En producción conviven «Positivo» y «positivo» (medido el 2026-08-23), así
    // que comparar texto exacto habría dejado sin columnas de qPCR a las filas en
    // minúscula, sin dar ningún error.
    ['Positivo', 'positivo', 'POSITIVO', '  Positivo  '].forEach((v) => {
      expect(H._bioPositivoEstricto(v), `«${v}» debería contar como positivo`).toBe(true);
    });
    // Y NADA MÁS: la regla del laboratorio es escribir «Positivo». Admitir «P», «+»
    // o «Sí» sólo abriría la puerta a que cada quien escriba lo suyo — el mismo
    // problema de las dos grafías, por la puerta de atrás.
    ['Pos', 'P', '+', 'Sí', 'si', 'Negativo', 'negativo', 'N', '', '   ', null, undefined]
      .forEach((v) => {
        expect(H._bioPositivoEstricto(v), `«${v}» NO debe contar como positivo`).toBe(false);
      });
  });

  it('🔴 sin ningún positivo, las columnas de qPCR ni se pintan', () => {
    // Es lo que pidió el usuario: no dejar seis campos más pidiendo que los llenen.
    localStorage.clear();
    H.renderBiomol();
    const th = cabeceras();
    expect(th).not.toContain('Ct WSSV');
    expect(th).not.toContain('Ct IHHNV');
    expect(th).not.toContain('Ct AHPND');
  });

  it('🔴 marcar WSSV positivo saca SUS dos columnas, y sólo las suyas', () => {
    localStorage.clear();
    H.renderBiomol();
    celda(1, 'wssv').value = 'Positivo';
    H.saveBioGrid();
    H.renderBiomol();
    const th = cabeceras();
    expect(th).toContain('Ct WSSV');
    expect(th).toContain('Copias WSSV');
    expect(th, 'salieron columnas de un patógeno sin positivos').not.toContain('Ct IHHNV');
    expect(th).not.toContain('Ct AHPND');
  });

  it('🔴 DOS patógenos positivos en la MISMA muestra: cada uno con su pareja', () => {
    // El caso que motivó el cambio: antes el segundo no tenía dónde ir.
    localStorage.clear();
    H.renderBiomol();
    celda(1, 'ihhnv').value = 'Positivo';
    celda(1, 'wssv').value = 'positivo';        // en minúscula, a propósito
    H.saveBioGrid();
    H.renderBiomol();
    celda(1, 'ciclo_ihhnv').value = '22.4';
    celda(1, 'ciclo_wssv').value = '18.1';
    celda(1, 'copias_ihhnv').value = '3.40E+04';
    celda(1, 'copias_wssv').value = '9.10E+05';
    H.saveBioGrid();
    const { rows, headers } = H.buildBioPayload(H.bioGridFecha(), H._collectBioGrid());
    const v = (h) => rows[0][headers.indexOf(h)];
    expect(v('Ciclo de amplificación IHHNV')).toBe('22.4');
    expect(v('Ciclo de amplificación WSSV')).toBe('18.1');
    expect(v('Copias/μl IHHNV')).toBe('3.40E+04');
    expect(v('Copias/μl WSSV')).toBe('9.10E+05');
    // Y no se pisan entre sí ni caen en la pareja genérica.
    expect(v('Ciclo de amplificación AHPND/EMS')).toBe('');
    expect(v('Copias/μl AHPND/EMS')).toBe('');
  });

  it('🔴 las columnas salen al TECLEAR el resultado, sin pasar por «Guardar»', () => {
    // Es la petición literal del usuario (2026-08-23): antes sólo aparecían tras el
    // guardado local, que es al revés de como se trabaja —primero se marca el resultado
    // y sólo entonces se tiene el Ct que anotar—.
    //
    // ⚠⚠ ESTA PRUEBA DISPARA UN EVENTO `change` DE VERDAD, y no es un capricho. Todas
    // las demás de este bloque llaman a `saveBioGrid()` o a `bioPatCambio()` a mano:
    // prueban la FUNCIÓN, no el CABLEADO. Medido por mutación el 2026-08-23, borrar el
    // `onchange` del render dejaba la suite entera en verde mientras la función quedaba
    // huérfana y la vista volvía a "sólo al guardar", que es el defecto original.
    //
    // ⚠⚠ happy-dom NO EJECUTA los manejadores inline puestos por `innerHTML` (sondeado
    // el 2026-08-23: el atributo está, pero `dispatchEvent` no lo corre). Así que se
    // hace lo que haría el navegador: LEER el atributo y ejecutar ESE código. Es la
    // diferencia entre probar el cableado y probar la función — llamar a
    // `bioPatCambio()` a mano dejaría pasar el borrado del `onchange`.
    localStorage.clear();
    H.renderBiomol();
    expect(cabeceras()).not.toContain('Ct IHHNV');

    const c = celda(1, 'ihhnv');
    expect(c.getAttribute('onchange'), 'la celda de resultado perdió su cableado').toBe('bioPatCambio()');
    c.value = 'Positivo';
    // Se ejecuta el código DEL ATRIBUTO, no una llamada escrita aquí.
    new Function('bioPatCambio', c.getAttribute('onchange'))(H.bioPatCambio);

    const th = cabeceras();
    expect(th, 'las columnas no salieron: siguen esperando al guardado').toContain('Ct IHHNV');
    expect(th).toContain('Copias IHHNV');
    expect(th, 'salieron columnas de un patógeno sin positivos').not.toContain('Ct WSSV');
    // Y lo tecleado sigue en su sitio tras el repintado: sacar las columnas no puede
    // costar el dato que las sacó.
    expect(celda(1, 'ihhnv').value).toBe('Positivo');
  });

  it('🔴 sólo las tres celdas con qPCR llevan el cableado, no las seis', () => {
    // BP, NHPB y EHP no se corren por qPCR: darles el aviso repintaría la grilla —y
    // robaría el foco— cada vez que se teclea un resultado que nunca abre columnas.
    localStorage.clear();
    H.renderBiomol();
    const con = ['ihhnv', 'wssv', 'ahpnd'];
    const sin = ['bp', 'nhpb', 'ehp'];
    con.forEach((k) => expect(celda(1, k).getAttribute('onchange'), `${k} debería avisar`).toBe('bioPatCambio()'));
    sin.forEach((k) => expect(celda(1, k).getAttribute('onchange'), `${k} NO debería avisar`).toBe(null));
    // Control: los tres cableados son exactamente los de BIO_QPCR_PATS, no una lista aparte.
    expect(con.slice().sort()).toEqual(H.BIO_QPCR_PATS.slice().sort());
  });

  it('🔴 en una fila NO positiva la celda queda bloqueada', () => {
    // La columna existe porque otra fila sí es positiva, pero aquí no se teclea.
    localStorage.clear();
    H.renderBiomol();
    celda(1, 'wssv').value = 'Positivo';
    H.saveBioGrid();
    H.renderBiomol();
    expect(celda(1, 'ciclo_wssv').disabled, 'la fila positiva no debe bloquearse').toBe(false);
    expect(celda(2, 'ciclo_wssv').disabled, 'una fila sin positivo debe bloquearse').toBe(true);
  });

  it('🔴 una columna CON DATO se sigue viendo aunque el resultado cambie', () => {
    // Esconderla dejaría el dato invisible mientras sigue viajando a la hoja.
    localStorage.clear();
    H.renderBiomol();
    celda(1, 'wssv').value = 'Positivo';
    H.saveBioGrid();
    H.renderBiomol();
    celda(1, 'ciclo_wssv').value = '18.1';
    H.saveBioGrid();
    H.renderBiomol();
    celda(1, 'wssv').value = 'Negativo';         // el analista rectifica
    H.saveBioGrid();
    H.renderBiomol();
    expect(cabeceras(), 'se escondió una columna con dato dentro').toContain('Ct WSSV');
    expect(celda(1, 'ciclo_wssv').value).toBe('18.1');
  });

  it('una fila con Ct por patógeno cuenta como qPCR', () => {
    expect(H._bioEsQpcr({ ciclo_wssv: '18.1' })).toBe(true);
    expect(H._bioEsQpcr({ copias_ahpnd: '1E+03' })).toBe(true);
    expect(H._bioEsQpcr({ ciclo: '20' }), 'la clave genérica ya no existe').toBe(false);
    expect(H._bioEsQpcr({ wssv: 'Positivo' })).toBe(false); // un resultado no es qPCR
  });

  it('los tres patógenos con qPCR son WSSV, IHHNV y AHPND/EMS', () => {
    expect(H.BIO_QPCR_PATS).toEqual(['wssv', 'ihhnv', 'ahpnd']);
    H.BIO_QPCR_PATS.forEach((p) => {
      expect(H.BIO_PATOGENOS.some((x) => x.k === p), `«${p}» no está en el catálogo`).toBe(true);
    });
  });
});

describe('Biomol · las DOS reglas de «positivo» conviven a propósito', () => {
  it('🔴 la del PDF es permisiva y la de qPCR es estricta, y se sabe cuál es cuál', () => {
    // `_bioEsPositivo` (histórica) RESALTA un resultado en el informe: ahí ser
    // permisivo no rompe nada. `_bioPositivoEstricto` ABRE campos que viajan a la
    // hoja: ahí sí importa. Dos funciones casi homónimas con reglas distintas es la
    // costura que este proyecto paga caro, así que la diferencia se deja escrita.
    const src = readFileSync(ENGINE, 'utf8');
    expect(src, 'el nombre volvió a ser confundible').toContain('_bioPositivoEstricto');
    expect(src).toContain('function _bioEsPositivo(');
    // Y la que decide las columnas es la ESTRICTA, no la del PDF.
    expect(src).toContain('_bioPositivoEstricto((d||{})[p])');
  });

  it('🔴 «Pos» resalta en el PDF pero NO abre columnas de qPCR', () => {
    // El caso que delata la diferencia. Si algún día se unifican, esta prueba dirá
    // en qué dirección se hizo — que es lo que hay que decidir a conciencia.
    expect(H._bioPositivoEstricto('Pos')).toBe(false);
    expect(H._bioPositivoEstricto('Positivo')).toBe(true);
    expect(H._bioPositivoEstricto('positivo')).toBe(true);
  });
});
