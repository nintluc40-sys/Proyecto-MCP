// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildFichaPdfDoc, isFichaId, pdfFilename, FICHA_IDS, fichaLabel, printFichaDocs } from './fichaPdf.js';

describe('fichaPdf · núcleo PDF nativo (Trazabilidad)', () => {
  it('FICHA_IDS = las fichas en orden de presentación; isFichaId discrimina', () => {
    expect(FICHA_IDS).toEqual(['calidad', 'plg', 'poblacion', 'params', 'calagua', 'despacho', 'desinfeccion']);
    expect(isFichaId('poblacion')).toBe(true);
    expect(isFichaId('desinfeccion')).toBe(true);
    expect(isFichaId('algas')).toBe(false);
    // fichaLabel = etiqueta CORTA de UI (no el título formal del PDF).
    expect(fichaLabel('calidad')).toBe('Calidad Larvaria');
    expect(fichaLabel('calagua')).toBe('Calidad de Agua');
    expect(fichaLabel('desinfeccion')).toBe('Desinfección');
  });

  it('pdfFilename compone code_fecha_mod-corrida y limpia caracteres inválidos', () => {
    expect(pdfFilename('poblacion', 'M01', '2026-06-01', '573')).toBe('PB_2026-06-01_M01-573');
    expect(pdfFilename('calidad', 'CIO', '2026-06-01', '')).toBe('CL_2026-06-01_CIO');
    expect(pdfFilename('plg', 'M02', '2026-06-01', 'a/b:c')).toBe('PL_2026-06-01_M02-abc');
  });

  it('pdfFilename normaliza fechas dd/mm/yyyy del Sheet a ISO (sin barras)', () => {
    expect(pdfFilename('poblacion', 'M01', '01/06/2026', '573')).toBe('PB_2026-06-01_M01-573');
    expect(pdfFilename('calidad', 'CIO', '3/6/2026', '')).toBe('CL_2026-06-03_CIO');
  });

  it('buildFichaPdfDoc: documento multipágina (1 .ppage por día) con cabecera/pie/tabla', () => {
    const doc = buildFichaPdfDoc({
      fid: 'poblacion', mod: 'M01', fileName: 'PB_2026-06-01_M01-573',
      pages: [
        { d: { fecha: '2026-06-01', corrida: '573', tec: 'Ana' }, tableHtml: '<table><tr><td>DIA1</td></tr></table>' },
        { d: { fecha: '2026-06-02', corrida: '573', tec: 'Ana' }, tableHtml: '<table><tr><td>DIA2</td></tr></table>', obs: 'nota' },
      ],
    });
    // Estructura general
    expect(doc).toContain('@page{size:A4 landscape');
    expect(doc).toContain('<title>PB_2026-06-01_M01-573</title>');
    expect(doc).toContain('window.print()');
    // Título de ficha (ftitle) + código de documento
    expect(doc).toContain('Población Laboratorio');
    expect(doc).toContain('OMR-LAB-M-FOR-040');
    // Dos páginas (una por día) con sus tablas
    expect((doc.match(/class="ppage"/g) || []).length).toBe(2);
    expect(doc).toContain('DIA1');
    expect(doc).toContain('DIA2');
    // Cabecera con módulo/fecha/corrida/técnico
    expect(doc).toContain('M01');
    expect(doc).toContain('2026-06-01');
    expect(doc).toContain('573');
    expect(doc).toContain('Ana');
    // Pie: código verificador + observaciones del 2º día
    expect(doc).toContain('code-box');
    expect(doc).toContain('POB01-20260601-');
    expect(doc).toContain('nota');
  });

  it('autoPrint:false omite el script de auto-impresión (lo controla el padre / iframe)', () => {
    const opts = { fid: 'poblacion', mod: 'M01', fileName: 'PB', pages: [{ d: { fecha: '2026-06-01' }, tableHtml: '<table></table>' }] };
    expect(buildFichaPdfDoc({ ...opts })).toContain('window.print()');            // por defecto sí
    expect(buildFichaPdfDoc({ ...opts, autoPrint: false })).not.toContain('window.print()');
  });

  it('el código verificador es DETERMINISTA: el mismo documento da el mismo código', () => {
    // Antes salía de Date.now()+contador de sesión: cada exportación daba un código
    // distinto para el MISMO documento, así que no verificaba nada.
    const opts = () => ({
      fid: 'poblacion', mod: 'M01', fileName: 'PB',
      pages: [{ d: { fecha: '2026-06-01', tec: 'Ana' }, tableHtml: '<table><tr><td>1000</td></tr></table>' }],
    });
    const code = (doc) => (doc.match(/POB01-20260601-[0-9A-F]{6}/) || [])[0];
    const a = code(buildFichaPdfDoc(opts()));
    const b = code(buildFichaPdfDoc(opts()));
    expect(a).toBeTruthy();
    expect(b).toBe(a);
  });

  it('el código CAMBIA si cambia el contenido, la fecha o el módulo', () => {
    const base = { fid: 'poblacion', mod: 'M01', fileName: 'PB', pages: [{ d: { fecha: '2026-06-01' }, tableHtml: '<table><tr><td>1000</td></tr></table>' }] };
    const codeOf = (o) => (buildFichaPdfDoc(o).match(/POB\d\d-\d{8}-[0-9A-F]{6}/) || [])[0];
    const ref = codeOf(base);
    // Un dato distinto en la tabla → otro código.
    expect(codeOf({ ...base, pages: [{ d: { fecha: '2026-06-01' }, tableHtml: '<table><tr><td>9999</td></tr></table>' }] })).not.toBe(ref);
    // Otra fecha → otro código.
    expect(codeOf({ ...base, pages: [{ d: { fecha: '2026-06-02' }, tableHtml: '<table><tr><td>1000</td></tr></table>' }] })).not.toBe(ref);
    // Otro módulo → otro código.
    expect(codeOf({ ...base, mod: 'M02' })).not.toBe(ref);
    // Y las observaciones también entran en la huella.
    expect(codeOf({ ...base, pages: [{ d: { fecha: '2026-06-01' }, tableHtml: '<table><tr><td>1000</td></tr></table>', obs: 'nota' }] })).not.toBe(ref);
  });

  it('cada página de un documento multipágina tiene su propio código', () => {
    const doc = buildFichaPdfDoc({
      fid: 'poblacion', mod: 'M01', fileName: 'PB',
      pages: [
        { d: { fecha: '2026-06-01' }, tableHtml: '<table><tr><td>A</td></tr></table>' },
        { d: { fecha: '2026-06-02' }, tableHtml: '<table><tr><td>B</td></tr></table>' },
      ],
    });
    const codes = doc.match(/POB01-\d{8}-[0-9A-F]{6}/g) || [];
    expect(codes.length).toBe(2);
    expect(codes[0]).not.toBe(codes[1]);
  });

  it('printFichaDocs avisa del progreso del PRIMER documento y no rompe si el aviso falla', () => {
    // La secuencia abre un "Guardar como PDF" por documento; sin onProgress el usuario no
    // sabe por cuál va. Los siguientes se encadenan por onafterprint (no simulable aquí),
    // así que se comprueba el primer aviso y que un callback que lanza no tumba la impresión.
    const avisos = [];
    expect(printFichaDocs([
      { page: '<html></html>', fileName: 'A' },
      { page: '<html></html>', fileName: 'B' },
    ], (n, total, fileName) => avisos.push([n, total, fileName]))).toBe(true);
    expect(avisos[0]).toEqual([1, 2, 'A']);

    expect(printFichaDocs([{ page: '<html></html>', fileName: 'X' }], () => { throw new Error('boom'); })).toBe(true);
    // Sin callback sigue funcionando igual.
    expect(printFichaDocs([{ page: '<html></html>', fileName: 'Y' }])).toBe(true);
    expect(printFichaDocs([])).toBe(false);
  });

  it('params añade Estadío/Hora registro en la cabecera', () => {
    const doc = buildFichaPdfDoc({
      fid: 'params', mod: 'M03', fileName: 'PA_2026-06-01_M03',
      pages: [{ d: { fecha: '2026-06-01', estadio: 'Z2', hora: '08:00' }, tableHtml: '<table></table>' }],
    });
    expect(doc).toContain('Estadío');
    expect(doc).toContain('Z2');
    expect(doc).toContain('Hora registro');
    expect(doc).toContain('Versión 0'); // rev-line de params
  });
});
