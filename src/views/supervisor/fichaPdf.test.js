import { describe, it, expect } from 'vitest';
import { buildFichaPdfDoc, isFichaId, pdfFilename, FICHA_IDS, fichaLabel } from './fichaPdf.js';

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
