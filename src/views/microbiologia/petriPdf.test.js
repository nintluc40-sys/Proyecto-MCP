// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildPetriPdfDoc, groupForPdf, toSci, thresholdBands, dayKeyOf } from './petriPdf.js';

// Filas con las cabeceras reales de la hoja "Microbiología" (mismo patrón que data.test.js).
const row = (o) => ({
  _SheetOrigin: 'Microbiología', Corrida: '578.0', Departamento: 'Larvicultura',
  Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo/Sala': '9.0',
  Responsable: 'Ana', ...o,
});
// larv-agua: amarillas <1000 Mínimo · verdes 100..199 Leve · totales 5000..9999 Moderado.
const ufc = { 'C. Amarillas UFC': '50', 'C. Verdes UFC': '150', 'C. Totales UFC': '6000' };

describe('petriPdf · toSci (notación científica normalizada)', () => {
  it('SIEMPRE devuelve M.ME±XX, también en los valores pequeños', () => {
    // Antes estos tres salían como "100", "200" y "9.3e3": tres formatos en la misma
    // columna. Ahora todos comparten forma y se pueden comparar de un vistazo.
    expect(toSci(0)).toBe('0.0E+00');
    expect(toSci(100)).toBe('1.0E+02');
    expect(toSci(130)).toBe('1.3E+02');
    expect(toSci(50)).toBe('5.0E+01');
    expect(toSci(6000)).toBe('6.0E+03');
    expect(toSci(23000)).toBe('2.3E+04');
    expect(toSci(1100000)).toBe('1.1E+06');
  });
  it('renormaliza cuando el redondeo empuja la mantisa a 10', () => {
    // 9.99e3 redondea a 10.0 → debe salir 1.0E+04, nunca "10.0E+03".
    expect(toSci(9990)).toBe('1.0E+04');
    expect(toSci(99900)).toBe('1.0E+05');
  });
  it('exponente negativo y signo se representan bien', () => {
    expect(toSci(0.5)).toBe('5.0E-01');
    expect(toSci(-200)).toBe('-2.0E+02');
  });
  it('sin dato devuelve raya, no "NaN"', () => {
    expect(toSci(null)).toBe('—');
    expect(toSci(undefined)).toBe('—');
    expect(toSci(NaN)).toBe('—');
    expect(toSci('')).toBe('—');
  });
});

describe('petriPdf · thresholdBands (umbrales por área)', () => {
  it('devuelve las CUATRO bandas con su corte y su color', () => {
    // larv-agua · verdes: l=100, m=200, e=300.
    const b = thresholdBands('larv-agua', 'vverd');
    expect(b.map((x) => x.n)).toEqual(['Mín', 'Leve', 'Mod', 'Elev']);
    expect(b.map((x) => x.txt)).toEqual(['<1.0E+02', '1.0E+02', '2.0E+02', '≥3.0E+02']);
    // Los colores son los MISMOS de la leyenda de semaforización.
    expect(b[0].color).toBe('#1ec86a');
    expect(b[3].color).toBe('#e8303e');
  });
  it('parámetro o área sin umbrales no inventa criterio', () => {
    expect(thresholdBands('larv-agua', 'noExiste')).toBeNull();
    expect(thresholdBands('areaInexistente', 'vtot')).toBeNull();
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
  it('separa el MISMO formato en tablas distintas si el área difiere por tipo de muestra', () => {
    // 'Larvicultura · Muestra' es larv-agua con Tipo=Agua y larv-animal con Animal, y
    // cada área tiene sus propios umbrales: mezclarlas dejaría una sola línea de
    // umbrales contradiciendo el color de la mitad de las filas.
    const g = groupForPdf([
      row({ 'Fecha muestreo': '01/06/2026', 'Tipo de muestra': 'Agua', ...ufc }),
      row({ 'Fecha muestreo': '01/06/2026', 'Tipo de muestra': 'Animal', ...ufc }),
    ]);
    expect(g[0].fmts.size).toBe(2);
    expect([...g[0].fmts.values()].map((x) => x.area).sort()).toEqual(['larv-agua', 'larv-animal']);
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
    expect(doc.page).toContain('critline');            // línea de umbrales
    // La leyenda explica qué es la línea de umbrales de debajo de cada patógeno.
    expect(doc.page).toContain('umbrales Mín / Leve / Mod / Elevado (UFC/mL)');
    // Y bajo la columna salen las cuatro bandas con sus cortes (larv-agua · verdes),
    // EN HORIZONTAL, separadas por '/' y sin etiqueta (el color y la leyenda las
    // identifican; con etiqueta solo cabrían tres patógenos por hoja).
    const celda = doc.page.match(/<th class="pcrit">(?:(?!<\/th>)[\s\S])*≥3\.0E\+02[\s\S]*?<\/th>/)[0];
    expect(celda).toContain('&lt;1.0E+02');
    expect(celda).toContain('1.0E+02');
    expect(celda).toContain('2.0E+02');
    expect(celda).toContain('≥3.0E+02');
    expect(celda.match(/class="thsep"/g).length).toBe(3);   // 4 bandas ⇒ 3 separadores
    // Nada de apilado vertical: los valores son inline, no bloques.
    expect(celda).not.toContain('display:block');
    expect(doc.page).toContain('Código verificador');
    expect(doc.page).toContain('Analista');
    expect(doc.page).toContain('Ana');                 // responsable en firma/metadatos
  });

  it('semaforiza la celda con el color del nivel recalculado desde el UFC', () => {
    const doc = docOf([row({ 'Fecha muestreo': '01/06/2026', ...ufc })]);
    // Totales 6000 en larv-agua → Moderado (#f07830).
    expect(doc.page).toContain('background:#f0783022');
    expect(doc.page).toContain('6.0E+03');
  });

  it('TODOS los resultados salen en notación científica, sin mezclar formatos', () => {
    const doc = docOf([row({ 'Fecha muestreo': '01/06/2026', 'C. Amarillas UFC': '100', 'C. Verdes UFC': '200', 'C. Totales UFC': '9300' })]);
    // Ninguno de los tres valores queda como número crudo en su celda (en este fixture
    // 100/200/9300 solo pueden aparecer como resultado: el contexto es M9/578/Agua/Ana).
    [100, 200, 9300].forEach((v) => {
      expect(doc.page).not.toMatch(new RegExp(`<td[^>]*>${v}</td>`));
    });
    expect(doc.page).toContain('1.0E+02');
    expect(doc.page).toContain('2.0E+02');
    expect(doc.page).toContain('9.3E+03');
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

  it('cada tabla lleva SU umbral, y el título distingue el área cuando hay dos', () => {
    // Verdes: larv-agua l=100 · larv-animal l=300. Deben salir AMBOS umbrales, no uno.
    const doc = docOf([
      row({ 'Fecha muestreo': '01/06/2026', 'Tipo de muestra': 'Agua', 'C. Verdes UFC': '150' }),
      row({ 'Fecha muestreo': '01/06/2026', 'Tipo de muestra': 'Animal', 'C. Verdes UFC': '150' }),
    ]);
    expect(doc.page).toContain('&lt;1.0E+02');   // larv-agua
    expect(doc.page).toContain('&lt;3.0E+02');   // larv-animal
    // El título desambigua para que se sepa qué tabla es cuál.
    expect(doc.page).toContain('Larvicultura · Agua');
    expect(doc.page).toContain('Larvicultura · Animal');
  });

  it('con un solo área el título NO se ensucia con el nombre del área', () => {
    const doc = docOf([row({ 'Fecha muestreo': '01/06/2026', ...ufc })]);
    expect(doc.page).toContain('Larvicultura · Muestra<');
    expect(doc.page).not.toContain('Muestra · Larvicultura · Agua');
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
