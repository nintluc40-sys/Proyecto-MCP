// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildPetriPdfDoc, groupForPdf, toSci, critText, dayKeyOf } from './petriPdf.js';

// Filas con las cabeceras reales de la hoja "Microbiología" (mismo patrón que data.test.js).
const row = (o) => ({
  _SheetOrigin: 'Microbiología', Corrida: '578.0', Departamento: 'Larvicultura',
  Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo/Sala': '9.0',
  Responsable: 'Ana', ...o,
});
// larv-agua: amarillas <1000 Mínimo · verdes 100..199 Leve · totales 5000..9999 Moderado.
const ufc = { 'C. Amarillas UFC': '50', 'C. Verdes UFC': '150', 'C. Totales UFC': '6000' };

describe('petriPdf · toSci (notación científica de UFC)', () => {
  it('deja los valores pequeños tal cual y abrevia los grandes', () => {
    expect(toSci(0)).toBe('0');
    expect(toSci(50)).toBe('50');
    expect(toSci(6000)).toBe('6e3');
    expect(toSci(23000)).toBe('2.3e4');
  });
  it('sin dato devuelve raya, no "NaN"', () => {
    expect(toSci(null)).toBe('—');
    expect(toSci(undefined)).toBe('—');
    expect(toSci(NaN)).toBe('—');
  });
});

describe('petriPdf · critText (criterio de aceptación por área)', () => {
  it('usa el umbral de Leve del área, en notación científica', () => {
    // larv-agua · verdes: l = 100  → "< 100"
    expect(critText('larv-agua', 'vverd')).toBe('< 100');
    // larv-agua · totales: l = 1000 → "< 1e3"
    expect(critText('larv-agua', 'vtot')).toBe('< 1e3');
  });
  it('parámetro sin umbral definido no inventa criterio', () => {
    expect(critText('larv-agua', 'noExiste')).toBe('');
    expect(critText('areaInexistente', 'vtot')).toBe('');
  });
});

describe('petriPdf · agrupación', () => {
  it('agrupa por FECHA y, dentro del día, por formato', () => {
    const g = groupForPdf([
      row({ 'Fecha muestreo': '01/06/2026', ...ufc }),
      row({ 'Fecha muestreo': '01/06/2026', Formato: 'Larvicultura · Artemia', ...ufc }),
      row({ 'Fecha muestreo': '02/06/2026', ...ufc }),
    ]);
    expect(g.length).toBe(2);                 // dos días
    expect(g[0].key).toBe('2026-06-01');
    expect(g[0].fmts.size).toBe(2);           // dos formatos ese día
    expect(g[1].fmts.size).toBe(1);
  });
  it('ordena los días cronológicamente aunque lleguen desordenados', () => {
    const g = groupForPdf([
      row({ 'Fecha muestreo': '10/06/2026', ...ufc }),
      row({ 'Fecha muestreo': '02/06/2026', ...ufc }),
    ]);
    expect(g.map((x) => x.key)).toEqual(['2026-06-02', '2026-06-10']);
  });
  it('descarta filas sin fecha utilizable en vez de agrupar bajo una clave inválida', () => {
    expect(groupForPdf([row({ 'Fecha muestreo': '', ...ufc })]).length).toBe(0);
    expect(groupForPdf([]).length).toBe(0);
  });
});

describe('petriPdf · documento', () => {
  const docOf = (rows, opts) => buildPetriPdfDoc(rows, opts);

  it('genera UNA hoja por fecha de muestreo', () => {
    const doc = docOf([
      row({ 'Fecha muestreo': '01/06/2026', ...ufc }),
      row({ 'Fecha muestreo': '01/06/2026', 'TQ/N°': '3', ...ufc }),
      row({ 'Fecha muestreo': '02/06/2026', ...ufc }),
    ]);
    expect(doc.pages).toBe(2);
    expect(doc.days).toEqual(['2026-06-01', '2026-06-02']);
    // Una .ppage por hoja (es el contenedor que pagina el CSS de impresión).
    expect(doc.page.match(/class="ppage"/g).length).toBe(2);
  });

  it('cada hoja lleva cabecera OMARSA, leyenda, criterios y pie con firma', () => {
    const doc = docOf([row({ 'Fecha muestreo': '01/06/2026', ...ufc })]);
    expect(doc.page).toContain('OMARSA · Microbiología');
    expect(doc.page).toContain('OMR-MIC');
    expect(doc.page).toContain('Fecha muestreo');
    expect(doc.page).toContain('01/06/2026');          // fecha en formato legible
    expect(doc.page).toContain('Moderado');            // leyenda de semaforización
    expect(doc.page).toContain('critline');            // línea de criterios
    expect(doc.page).toContain('Código verificador');
    expect(doc.page).toContain('Analista');
    expect(doc.page).toContain('Ana');                 // responsable en firma/metadatos
  });

  it('semaforiza la celda con el color del nivel recalculado desde el UFC', () => {
    const doc = docOf([row({ 'Fecha muestreo': '01/06/2026', ...ufc })]);
    // Totales 6000 en larv-agua → Moderado (#f07830).
    expect(doc.page).toContain('background:#f0783022');
    expect(doc.page).toContain('6e3');
  });

  it('omite las columnas de patógenos sin ningún dato en el día', () => {
    const doc = docOf([row({ 'Fecha muestreo': '01/06/2026', 'C. Amarillas UFC': '50' })]);
    expect(doc.page).toContain('C. Amarillas');
    expect(doc.page).not.toContain('Pseudomonas');     // nunca se midió
  });

  it('incluye las observaciones del día una sola vez aunque se repitan', () => {
    const doc = docOf([
      row({ 'Fecha muestreo': '01/06/2026', Observaciones: 'revisar reservorio', ...ufc }),
      row({ 'Fecha muestreo': '01/06/2026', Observaciones: 'revisar reservorio', ...ufc }),
    ]);
    expect(doc.page).toContain('Observaciones');
    expect(doc.page.match(/revisar reservorio/g).length).toBe(1);
  });

  it('el código verificador es DETERMINISTA: el mismo contenido da el mismo código', () => {
    const rows = [row({ 'Fecha muestreo': '01/06/2026', ...ufc })];
    const codeOf = (d) => d.page.match(/class="code-box">([^<]+)</)[1];
    expect(codeOf(docOf(rows))).toBe(codeOf(docOf(rows)));
    // Y cambia si cambia un dato de la hoja (si no, no verificaría nada).
    const otros = [row({ 'Fecha muestreo': '01/06/2026', ...ufc, 'C. Totales UFC': '9000' })];
    expect(codeOf(docOf(otros))).not.toBe(codeOf(docOf(rows)));
  });

  it('sin filas imprimibles devuelve 0 hojas en vez de un documento en blanco', () => {
    expect(docOf([]).pages).toBe(0);
    expect(docOf([row({ 'Fecha muestreo': '' })]).pages).toBe(0);
  });

  it('el nombre del archivo refleja el rango elegido y no lleva caracteres ilegales', () => {
    const doc = docOf([row({ 'Fecha muestreo': '01/06/2026', ...ufc })], { from: '2026-06-01', to: '2026-06-30' });
    expect(doc.fileName).toBe('MICRO_PlacaPetri_2026-06-01_a_2026-06-30');
    expect(doc.fileName).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('escapa el contenido del Sheet (no se inyecta HTML desde una celda)', () => {
    const doc = docOf([row({ 'Fecha muestreo': '01/06/2026', Responsable: '<img src=x onerror=alert(1)>', ...ufc })]);
    expect(doc.page).not.toContain('<img src=x');
    expect(doc.page).toContain('&lt;img');
  });
});

describe('petriPdf · dayKeyOf', () => {
  it('usa la fecha LOCAL, no UTC (un muestreo de madrugada no se va al día anterior)', () => {
    expect(dayKeyOf(new Date(2026, 5, 1, 0, 30))).toBe('2026-06-01');
    expect(dayKeyOf(new Date(2026, 11, 31, 23, 45))).toBe('2026-12-31');
  });
});
