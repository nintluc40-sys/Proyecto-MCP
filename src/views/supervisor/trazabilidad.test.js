import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../core/store.js';
import { buildFichaPages, downloadTrazabilidad } from './trazabilidad.js';
import { buildFichaPdfDoc } from './fichaPdf.js';

const row = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });

describe('trazabilidad · adaptador Población (store→ficha)', () => {
  beforeEach(() => {
    store.globalData = [
      // 2026-06-01 — dos tanques con Población (valor REAL en la hoja).
      row({ Tanque: '1', Fecha: '2026-06-01', 'Población': '2000000', Supervivencia: '85', Lote: 'L1', 'Estadío': 'Z2', Salinidad: '32', 'Técnico': 'Ana' }),
      row({ Tanque: '2', Fecha: '2026-06-01', 'Población': '1500000', Supervivencia: '80', Lote: 'L1', 'Estadío': 'Z2', Salinidad: '33', 'Técnico': 'Ana' }),
      // 2026-06-02 — un tanque con Población.
      row({ Tanque: '1', Fecha: '2026-06-02', 'Población': '1900000', Supervivencia: '90', Lote: 'L1', 'Estadío': 'Z3', Salinidad: '32', 'Técnico': 'Ana' }),
      // 2026-06-03 — SIN Población (solo estadío) → NO debe generar página de Población.
      row({ Tanque: '1', Fecha: '2026-06-03', 'Estadío': 'M1', Salinidad: '31' }),
    ];
  });

  it('genera una página por día CON población (excluye días sin población), ascendente', () => {
    const pages = buildFichaPages('poblacion', { mod: 'M01', corrida: '573' });
    expect(pages.map((p) => p.d.fecha)).toEqual(['2026-06-01', '2026-06-02']);
    expect(pages[0].tanks).toEqual(['1', '2']);
  });

  it('convierte Población de la hoja (real) a "Ingresado" en miles (÷1000)', () => {
    const pages = buildFichaPages('poblacion', { mod: 'M01', corrida: '573' });
    expect(pages[0].d.po_0).toBe(2000);   // 2000000 / 1000
    expect(pages[0].d.po_1).toBe(1500);   // 1500000 / 1000
    expect(pages[0].d.sv_0).toBe('85');
    expect(pages[0].d.e_1).toBe('Z2');
  });

  it('la tabla incluye cabeceras y los datos del día (lote/estadío/salinidad)', () => {
    const pages = buildFichaPages('poblacion', { mod: 'M01', corrida: '573' });
    const html = pages[0].tableHtml;
    expect(html).toContain('% Supervivencia');
    expect(html).toContain('Población Real (×1000)');
    expect(html).toContain('L1');
    expect(html).toContain('Z2');
    expect(html).toContain('Total Población (real)');
  });

  it('respeta el rango de fechas (from/to)', () => {
    const pages = buildFichaPages('poblacion', { mod: 'M01', corrida: '573', from: '2026-06-02' });
    expect(pages.map((p) => p.d.fecha)).toEqual(['2026-06-02']);
  });

  it('downloadTrazabilidad resume generadas/vacías/pendientes sin lanzar (sin pop-ups)', () => {
    const res = downloadTrazabilidad({ mod: 'M01', corrida: '573', fids: ['poblacion'], from: '', to: '' });
    expect(res.generated.map((g) => g.fid)).toEqual(['poblacion']);
    expect(res.generated[0].pages).toBe(2);
    expect(res.empty).toEqual([]);
    expect(res.pending).toEqual([]);
    expect(res).not.toHaveProperty('blocked');
    // Ficha válida sin datos en el rango → va a "empty".
    const res2 = downloadTrazabilidad({ mod: 'M01', corrida: '573', fids: ['despacho'], from: '', to: '' });
    expect(res2.empty).toContain('Despacho');
    expect(res2.generated).toEqual([]);
  });

  it('las 6 fichas estándar están implementadas; una desconocida devuelve null', () => {
    ['poblacion', 'calidad', 'plg', 'params', 'calagua', 'despacho'].forEach((fid) => {
      expect(Array.isArray(buildFichaPages(fid, { mod: 'M01' }))).toBe(true);
    });
    expect(buildFichaPages('algas', { mod: 'M01' })).toBeNull();
  });
});

describe('trazabilidad · adaptador Parámetros (Control_Tanque → ficha)', () => {
  const tRow = (o) => ({ _SheetOrigin: 'Control_Tanque M01', 'Módulo': 'M01', Corrida: '573', ...o });
  beforeEach(() => {
    store.globalData = [
      tRow({ Tanque: '1', Fecha: '2026-06-01', Hora: '08:00', OD: '6.2', Temperatura: '29.5' }),
      tRow({ Tanque: '1', Fecha: '2026-06-01', Hora: '10:00', OD: '6.0', Temperatura: '30.1' }),
      tRow({ Tanque: '2', Fecha: '2026-06-01', Hora: '08:00', OD: '5.8', Temperatura: '29.8' }),
      tRow({ Tanque: '1', Fecha: '2026-06-02', Hora: '02:00', OD: '6.5', Temperatura: '28.9' }),
      // Fila de Control_Tanque SIN lecturas (OD/Temp vacías) → NO debe generar página.
      tRow({ Tanque: '1', Fecha: '2026-06-09', Hora: '08:00', OD: '', Temperatura: '' }),
    ];
  });

  it('coloca cada toma OD/°C en su hora (normaliza) por tanque y día; excluye días sin lecturas', () => {
    const pages = buildFichaPages('params', { mod: 'M01', corrida: '573' });
    expect(pages.map((p) => p.d.fecha)).toEqual(['2026-06-01', '2026-06-02']);  // 06-09 excluido
    expect(pages[0].tanks).toEqual(['1', '2']);
    expect(pages[0].d['od_0_08:00']).toBe('6.2');
    expect(pages[0].d['tc_0_08:00']).toBe('29.5');
    expect(pages[0].d['od_0_10:00']).toBe('6.0');
    expect(pages[0].d['od_1_08:00']).toBe('5.8');   // tanque 2, misma hora
    expect(pages[1].d['od_0_02:00']).toBe('6.5');   // 2026-06-02
  });

  it('la tabla trae las columnas por hora (pares OD/°C)', () => {
    const pages = buildFichaPages('params', { mod: 'M01', corrida: '573' });
    const html = pages[0].tableHtml;
    expect(html).toContain('08:00');
    expect(html).toContain('<th>OD</th><th>°C</th>');
  });
});

describe('trazabilidad · adaptador Calidad de Agua (Larvicultura → ficha)', () => {
  beforeEach(() => {
    store.globalData = [
      row({ Tanque: '1', Fecha: '2026-06-01', 'Estadío': 'Z2', 'Cel/ml': '5000', Color: 'Café', '% Espuma': '2', '% Suciedad': '1', '% Recambio': '30', Observaciones: 'ok' }),
      row({ Tanque: '2', Fecha: '2026-06-01', 'Estadío': 'Z2', 'Cel/ml': '4800', Color: 'Transparente' }),
      // Día sin parámetros de agua (solo estadío) → NO genera página.
      row({ Tanque: '1', Fecha: '2026-06-05', 'Estadío': 'M1' }),
    ];
  });

  it('incluye sólo días con parámetros de agua y mapea las columnas + swatch de Color', () => {
    const pages = buildFichaPages('calagua', { mod: 'M01', corrida: '573' });
    expect(pages.map((p) => p.d.fecha)).toEqual(['2026-06-01']);
    expect(pages[0].d.cm_0).toBe('5000');   // Cel/ml (ya convertida en la hoja)
    expect(pages[0].d.tr_0).toBe('Café');   // Color
    expect(pages[0].d.rc_0).toBe('30');     // % Recambio
    expect(pages[0].d.e_0).toBe('Z2');
    const html = pages[0].tableHtml;
    expect(html).toContain('Cel/ml');
    expect(html).toContain('% Recambio');
    expect(html).toContain('Café');
    expect(html).toContain('width:9px');    // cuadrito de color
  });
});

describe('trazabilidad · adaptador Calidad Larvaria (store→ficha)', () => {
  beforeEach(() => {
    store.globalData = [
      row({ Tanque: '1', Fecha: '2026-06-01', 'Estadío': 'Z2', 'Intestino_Lleno': '80', 'Intestino_Semilleno': '15', Deformidad: '2', '% Actividad': '95', 'Estrés': '10', 'Técnico': 'Ana' }),
      row({ Tanque: '2', Fecha: '2026-06-01', 'Estadío': 'Z2', 'Intestino_Lleno': '78', '% Actividad': '90', 'Estrés': '12' }),
      // Día con SÓLO población (sin columnas de calidad) → NO genera página de Calidad.
      row({ Tanque: '1', Fecha: '2026-06-05', 'Población': '1000000', 'Estadío': 'M1' }),
    ];
  });

  it('incluye sólo días con datos de calidad y mapea las columnas exactas de la hoja', () => {
    const pages = buildFichaPages('calidad', { mod: 'M01', corrida: '573' });
    expect(pages.map((p) => p.d.fecha)).toEqual(['2026-06-01']);
    expect(pages[0].d.ll_0).toBe('80');   // Intestino_Lleno
    expect(pages[0].d.cos_0).toBe('95');  // % Actividad
    expect(pages[0].d.es_0).toBe('10');   // Estrés
    expect(pages[0].d.e_0).toBe('Z2');    // Estadío
  });

  it('la tabla trae las 3 filas de cabecera (SANIDAD/CALIDAD)', () => {
    const pages = buildFichaPages('calidad', { mod: 'M01', corrida: '573' });
    const html = pages[0].tableHtml;
    expect(html).toContain('SANIDAD — Estadios N5–M3');
    expect(html).toContain('SANIDAD — Post-larva');
    expect(html).toContain('%Act');
  });
});

describe('trazabilidad · adaptador PLG (store→ficha)', () => {
  beforeEach(() => {
    store.globalData = [
      row({ Tanque: '1', Fecha: '2026-06-01', 'Estadío': 'Z2', Lote: 'L1', Plg: '55', 'Plg (manual)': '52' }),
      row({ Tanque: '2', Fecha: '2026-06-01', 'Estadío': 'Z2', Lote: 'L1', 'Plg (manual)': '48' }),
      // Día sin PLG (externo ni manual) → NO genera página de PLG.
      row({ Tanque: '1', Fecha: '2026-06-05', 'Estadío': 'M1' }),
    ];
  });

  it('incluye sólo días con PL/gramo (externo o manual) y separa "Plg" de "Plg (manual)"', () => {
    const pages = buildFichaPages('plg', { mod: 'M01', corrida: '573' });
    expect(pages.map((p) => p.d.fecha)).toEqual(['2026-06-01']);
    expect(pages[0].d.pg_0).toBe('55');    // col "Plg" (externo)
    expect(pages[0].d.pgm_0).toBe('52');   // col "Plg (manual)"
    expect(pages[0].d.pgm_1).toBe('48');
    expect(pages[0].d.lt_0).toBe('L1');
    expect(pages[0].tableHtml).toContain('PL / Gramo');
    expect(pages[0].tableHtml).toContain('Plg (manual)');
  });
});

describe('trazabilidad · adaptador Despacho (store→ficha)', () => {
  beforeEach(() => {
    store.globalData = [
      row({ Tanque: '1', Fecha: '2026-06-10', 'Estadío': 'PL10', 'Población': '2000000', Supervivencia: '70', 'Plg (manual)': '60', Plg: '62', 'Densidad cosechada': '120', Biomasa: '15', 'Cajas/Tinas': '4', Destino: 'Piscina 3', Piscina: 'P3' }),
      row({ Tanque: '2', Fecha: '2026-06-10', 'Estadío': 'PL10', 'Densidad cosechada': '110', Destino: 'Piscina 4' }),
      // Día sin datos de despacho (solo estadío) → NO genera página de Despacho.
      row({ Tanque: '1', Fecha: '2026-06-05', 'Estadío': 'M1' }),
    ];
  });

  it('incluye sólo días con datos de despacho y mapea cosecha/destino/piscina (+población en miles)', () => {
    const pages = buildFichaPages('despacho', { mod: 'M01', corrida: '573' });
    expect(pages.map((p) => p.d.fecha)).toEqual(['2026-06-10']);
    expect(pages[0].d.po_0).toBe(2000);        // 2000000 / 1000
    expect(pages[0].d.dc_0).toBe('120');       // Densidad cosechada
    expect(pages[0].d.de_0).toBe('Piscina 3'); // Destino
    expect(pages[0].d.ps_0).toBe('P3');        // Piscina
    expect(pages[0].d.pg_0).toBe('62');
    expect(pages[0].d.pgm_0).toBe('60');
    const html = pages[0].tableHtml;
    expect(html).toContain('Densidad');
    expect(html).toContain('Piscina');
    expect(html).toContain('Biomasa');
  });
});

describe('trazabilidad · integración e2e (una fila con TODAS las fichas → 6 PDF)', () => {
  beforeEach(() => {
    store.globalData = [
      // Una fila "Datos Larvicultura" con datos de las 5 fichas de esa hoja.
      row({
        Tanque: '1', Fecha: '2026-06-01', 'Técnico': 'Ana',
        'Población': '2000000', Supervivencia: '85', Lote: 'L1', 'Estadío': 'Z2', Salinidad: '32',
        'Intestino_Lleno': '80', Deformidad: '2', '% Mortalidad': '1', '% Actividad': '95', 'Estrés': '10',
        Plg: '55', 'Plg (manual)': '52',
        'Densidad cosechada': '120', Biomasa: '15', 'Cajas/Tinas': '4', Destino: 'P3', Piscina: 'P3',
        'Cel/ml': '5000', Color: 'Café', '% Espuma': '2', '% Suciedad': '1', '% Recambio': '30', Observaciones: 'ok',
      }),
      // Control_Tanque para Parámetros (hoja distinta).
      { _SheetOrigin: 'Control_Tanque M01', 'Módulo': 'M01', Corrida: '573', Tanque: '1', Fecha: '2026-06-01', Hora: '08:00', OD: '6.2', Temperatura: '29.5' },
    ];
  });

  it('las 6 fichas producen ≥1 página y un documento PDF válido', () => {
    ['poblacion', 'calidad', 'plg', 'params', 'calagua', 'despacho'].forEach((fid) => {
      const pages = buildFichaPages(fid, { mod: 'M01', corrida: '573' });
      expect(pages.length, `${fid} debe tener páginas`).toBeGreaterThanOrEqual(1);
      const doc = buildFichaPdfDoc({ fid, mod: 'M01', fileName: `X_${fid}`, pages });
      expect(doc, `${fid} doc válido`).toContain('</html>');
      expect(doc).toContain('class="ppage"');
      expect(doc).toContain('OMARSA · Larvicultura');
      expect(doc).toContain('Código verificador');
    });
  });
});
