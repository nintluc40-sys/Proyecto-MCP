// @vitest-environment happy-dom
/* H3 · Patología en Fresco — el aviso es CONDICIONAL, no una constante.
   Contexto medido el 2026-08-31 contra el despliegue real: el documento tiene 35
   pestañas y ninguna casa /patolog/i, y el GAS crea la hoja en el primer envío
   (Code.gs:273-275) — luego nunca se ha capturado un análisis y el mensaje de «aún no
   está disponible» es CIERTO hoy. Lo que estas pruebas fijan es que deje de serlo solo
   el día que entren filas, que es cuando el cartel fijo pasaba a mentir.

   Cada prueba de aquí distingue la regla correcta de la equivocada: si se revierte la
   corrección, falla. Verificado por mutación (ver el bloque al pie). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { fmtShort, parseAnyDate } from '../../core/dates.js';
import { classifyOrigin, detectSheetName } from '../../core/sheets.js';
import { isPatRow, patFecha } from './data.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
function click(el) { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }

// Cabeceras REALES de la hoja, copiadas de PAT_SHEET_HEADERS (engine.js:14140).
// 6 de contexto + 15 de hallazgos (3 grupos) + Peso + Observaciones + Sesión + Lote.
const PAT_HEADERS = [
  'Fecha muestreo', 'Fecha resultados', 'Corrida', 'Responsable', 'Muestra', 'Sexo',
  'Hepatopáncreas — Vacuolas lipídicas', 'Hepatopáncreas — Melanización',
  'Hepatopáncreas — Baculovirus sp.', 'Hepatopáncreas — Atrofia tubular',
  'Branquias — Melanización', 'Branquias — Necrosis', 'Branquias — Protozoarios',
  'Branquias — Detritos', 'Branquias — Bacterias filamentosas',
  'Intestino — Gregarinas', 'Intestino — Baculovirus sp.', 'Intestino — Nemátodos',
  'Intestino — Balanceado', 'Intestino — Algas', 'Intestino — Detritos',
  'Peso', 'Observaciones', 'Sesión', 'Lote',
];
const patRow = (over = {}) => Object.assign(
  Object.fromEntries(PAT_HEADERS.map((h) => [h, ''])),
  { _SheetOrigin: 'Patología en Fresco', 'Fecha muestreo': '04/09/2026', Corrida: '590', Responsable: 'J. Pérez' },
  over,
);

let root;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'microbiologia';
  document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; });

describe('H3 · classifyOrigin reconoce Patología en Fresco', () => {
  it('devuelve la cadena canónica para el nombre que escribe el monolito', () => {
    expect(classifyOrigin('Patología en Fresco')).toBe('Patología en Fresco');
  });

  it('aguanta grafías: sin acento, en minúscula, con espacios de sobra', () => {
    expect(classifyOrigin('Patologia en fresco')).toBe('Patología en Fresco');
    expect(classifyOrigin('  PATOLOGÍA EN FRESCO  ')).toBe('Patología en Fresco');
    expect(classifyOrigin('Patología')).toBe('Patología en Fresco');
  });

  // ⚠ LA PRUEBA QUE JUSTIFICA EL ORDEN. Sin la regla POR DELANTE de /microbiolog/i,
  // esta pestaña cae en 'Microbiología' y sus 25 columnas entran en Bacteriología,
  // que lee tríos "<patógeno> UFC"/"Nivel" que aquí no existen.
  it('una pestaña "Microbiología — Patología en Fresco" NO cae en Microbiología', () => {
    expect(classifyOrigin('Microbiología — Patología en Fresco')).toBe('Patología en Fresco');
  });

  it('no le roba la hoja a Microbiología ni a Morfología', () => {
    expect(classifyOrigin('Microbiología')).toBe('Microbiología');
    expect(classifyOrigin('Morfologia')).toBe('Morfologia');
    expect(classifyOrigin('Calidad de Agua')).toBe('Calidad de Agua');
  });
});

describe('H3 · detectSheetName: Patología no se confunde con Morfología', () => {
  // Esta es la rama del respaldo CSV cuando el gid llegó SIN título (sheets.js:320
  // llama detectSheetName con 2 argumentos). La ficha de Patología trae SEIS columnas
  // «Intestino — …» que disparan la heurística `intestino` de Morfologia.
  it('un gid sin título con las columnas de Patología se identifica como Patología', () => {
    expect(detectSheetName([patRow()], 7)).toBe('Patología en Fresco');
  });

  it('Morfología de verdad (Intestino/Deformidad, sin los grupos de la ficha) sigue siendo Morfologia', () => {
    const morfo = [{ Fecha: '04/09/2026', Corrida: '590', Intestino: 'Lleno', Deformidad: 'No', Lleno: '80' }];
    expect(detectSheetName(morfo, 9)).toBe('Morfologia');
  });

  it('con título reconocible el nombre manda y ni se miran las columnas', () => {
    expect(detectSheetName([patRow()], 7, 'Patología en Fresco')).toBe('Patología en Fresco');
  });
});

describe('H3 · isPatRow / patFecha', () => {
  it('reconoce las filas por su origen y no toca las de Microbiología', () => {
    expect(isPatRow(patRow())).toBe(true);
    expect(isPatRow({ _SheetOrigin: 'Microbiología' })).toBe(false);
    expect(isPatRow({ _SheetOrigin: 'Morfologia' })).toBe(false);
    expect(isPatRow(null)).toBe(false);
  });

  it('la fecha sale de «Fecha muestreo» y cae a «Fecha resultados» si falta', () => {
    expect(patFecha(patRow())).toBe('04/09/2026');
    expect(patFecha(patRow({ 'Fecha muestreo': '', 'Fecha resultados': '06/09/2026' }))).toBe('06/09/2026');
  });
});

describe('H3 · el aviso de la sub-vista depende del DATO', () => {
  // Hace falta al menos una fila para que la vista pase del "Conectando…".
  const semilla = { _SheetOrigin: 'Microbiología', 'Fecha muestreo': '01/09/2026', Corrida: '590', Departamento: 'Larvicultura', Formato: 'Larvicultura' };

  function abrirPatologia(rows) {
    store.globalData = [semilla, ...rows];
    microbiologiaView(root);
    click(root.querySelector('[data-mic-sub="patologia"]'));
    return root.querySelector('.empty-state')?.textContent || '';
  }

  it('SIN registros mantiene EXACTAMENTE el mensaje acordado con el usuario', () => {
    const txt = abrirPatologia([]);
    expect(txt).toContain('La hoja de Patología en fresco aún no está disponible en el Google Sheet origen; se conectará cuando exista.');
    expect(txt).toContain('🚧');
    expect(txt).not.toContain('sincronizado');
  });

  // ⚠ EL DEFECTO DE H3. Antes esto pasaba igual que la prueba de arriba: el mensaje
  // era una constante y seguía diciendo «aún no está disponible» con datos delante.
  it('CON registros deja de decir que no está disponible y los declara', () => {
    const txt = abrirPatologia([patRow(), patRow({ 'Fecha muestreo': '05/09/2026' })]);
    expect(txt).not.toContain('aún no está disponible');
    expect(txt).toContain('2 análisis de Patología en Fresco sincronizados');
    expect(txt).toContain('✅');
  });

  it('con UN solo registro concuerda en singular y da su fecha, no un rango', () => {
    const txt = abrirPatologia([patRow()]);
    expect(txt).toContain('1 análisis de Patología en Fresco sincronizado');
    expect(txt).not.toContain('sincronizados');
    expect(txt).toContain('del'.replace('del', '')); // sin rango
    expect(txt).not.toMatch(/del .+ al /);
  });

  // ⚠ Las filas se dan DESORDENADAS a propósito, y se exigen las fechas CONCRETAS en el
  // orden correcto. Afirmar sólo /del .+ al / dejaba viva la mutación que quita el
  // .sort(): el rango salía «del 05 al 03» y la prueba lo daba por bueno.
  it('con varias fechas anuncia el rango de la MÁS ANTIGUA a la MÁS NUEVA', () => {
    const txt = abrirPatologia([
      patRow({ 'Fecha muestreo': '05/09/2026' }),
      patRow({ 'Fecha muestreo': '01/09/2026' }),
      patRow({ 'Fecha muestreo': '03/09/2026' }),
    ]);
    const primera = fmtShort(parseAnyDate('01/09/2026'));
    const ultima = fmtShort(parseAnyDate('05/09/2026'));
    expect(primera).not.toBe(ultima); // el fixture sirve para distinguir
    expect(txt).toContain(`del ${primera} al ${ultima}`);
    expect(txt).not.toContain(`del ${ultima} al ${primera}`);
    expect(txt).toContain('3 análisis');
  });

  it('las filas de Patología NO se cuelan en Bacteriología', () => {
    store.globalData = [semilla, patRow(), patRow()];
    microbiologiaView(root);
    click(root.querySelector('[data-mic-sub="bacteriologia"]'));
    // Si isPatRow/classifyOrigin fallaran y las filas entrasen como Microbiología,
    // la ficha de Patología (sin columnas UFC) rompería o inflaría los conteos.
    expect(root.querySelector('.mic-scada')).toBeTruthy();
    expect(root.textContent).not.toContain('Hepatopáncreas');
  });

  it('las otras sub-vistas sin tablero conservan su mensaje genérico', () => {
    // Blindaje del refactor de placeholderHTML: sólo Patología es condicional.
    store.globalData = [semilla];
    microbiologiaView(root);
    // 'general', 'bacteriologia' y 'calidad' sí tienen tablero; sólo queda Patología,
    // así que se comprueba que el genérico sigue existiendo en la función.
    const txt = abrirPatologia([]);
    expect(txt).not.toContain('Esta sub-vista llega en una tanda posterior.');
  });
});
