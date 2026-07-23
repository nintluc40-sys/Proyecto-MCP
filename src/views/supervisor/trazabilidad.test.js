import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../core/store.js';
import { buildFichaPages, downloadTrazabilidad, moduleDateRange } from './trazabilidad.js';
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

  it('las fichas soportadas están implementadas; una desconocida devuelve null', () => {
    ['poblacion', 'calidad', 'plg', 'params', 'calagua', 'despacho', 'desinfeccion'].forEach((fid) => {
      expect(Array.isArray(buildFichaPages(fid, { mod: 'M01' }))).toBe(true);
    });
    expect(buildFichaPages('algas', { mod: 'M01' })).toBeNull();
  });
});

describe('trazabilidad · adaptador Desinfección (Registro_Desinfección → ficha)', () => {
  const dx = (o) => ({ _SheetOrigin: 'Registro_Desinfección', 'Módulo': 'M01', Corrida: '573', ...o });
  beforeEach(() => {
    store.globalData = [
      dx({ Fecha: '2026-06-01', 'Tipo de Registro': 'Desinfección de módulo larvicultura', 'Categoría': 'Materiales', Elemento: 'Tanques', Estado: 'Sí', Observaciones: '300 ppm cloro' }),
      dx({ Fecha: '2026-06-01', 'Tipo de Registro': 'Desinfección de módulo larvicultura', 'Categoría': 'Personal', Elemento: 'Botas', Estado: 'Sí', Observaciones: '' }),
      dx({ Fecha: '2026-06-03', 'Tipo de Registro': 'Limpieza de materiales', 'Categoría': 'Materiales', Elemento: 'Filtros', Estado: 'No', Observaciones: '', 'Fecha Elemento': '2026-06-03' }),
      // Otro módulo → no debe aparecer.
      dx({ 'Módulo': 'M02', Fecha: '2026-06-01', 'Tipo de Registro': 'X', 'Categoría': 'Y', Elemento: 'Z', Estado: 'Sí' }),
    ];
  });

  it('genera una página por día (ascendente) y agrupa por Tipo → Categoría', () => {
    const pages = buildFichaPages('desinfeccion', { mod: 'M01', corrida: '573' });
    expect(pages.map((p) => p.d.fecha)).toEqual(['2026-06-01', '2026-06-03']);
    const html = pages[0].tableHtml;
    expect(html).toContain('Desinfección de módulo larvicultura');
    expect(html).toContain('Materiales');
    expect(html).toContain('Personal');
    expect(html).toContain('Tanques');
    expect(html).toContain('300 ppm cloro');
    // La fila de M02 no se incluye.
    expect(html).not.toContain('>Z<');
  });

  it('respeta el rango de fechas (from/to)', () => {
    const pages = buildFichaPages('desinfeccion', { mod: 'M01', corrida: '573', from: '2026-06-02' });
    expect(pages.map((p) => p.d.fecha)).toEqual(['2026-06-03']);
  });
});

describe('trazabilidad · moduleDateRange (primer↔último registro del módulo)', () => {
  beforeEach(() => {
    store.globalData = [
      row({ Tanque: '1', Fecha: '2026-06-05', 'Población': '1000000' }),
      row({ Tanque: '1', Fecha: '2026-06-01', 'Población': '1000000' }),
      { _SheetOrigin: 'Control_Tanque M01', 'Módulo': 'M01', Corrida: '573', Tanque: '1', Fecha: '2026-06-08', Hora: '08:00', OD: '6' },
      { _SheetOrigin: 'Registro_Desinfección', 'Módulo': 'M01', Corrida: '573', Fecha: '2026-05-28', 'Tipo de Registro': 'T', 'Categoría': 'C', Elemento: 'E', Estado: 'Sí' },
      // Otro módulo → ignorado.
      row({ 'Módulo': 'M02', Tanque: '1', Fecha: '2026-01-01', 'Población': '1' }),
    ];
  });

  it('cubre todas las fuentes (Larvicultura + Control_Tanque + Desinfección) en ISO', () => {
    const r = moduleDateRange('M01', '573');
    expect(r.from).toBe('2026-05-28');   // Desinfección es el más antiguo
    expect(r.to).toBe('2026-06-08');     // Control_Tanque es el más reciente
  });

  it('sin registros del módulo → rango vacío', () => {
    expect(moduleDateRange('M09', '')).toEqual({ from: '', to: '' });
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

describe('trazabilidad · duplicados tanque+hora en la ficha de Parámetros', () => {
  const CT = (o) => ({ _SheetOrigin: 'Control_Tanque M01', 'Módulo': 'M01', Corrida: '573', ...o });

  it('gana la PRIMERA lectura, igual que el resto de fichas (antes ganaba la última)', () => {
    store.globalData = [
      CT({ Tanque: '1', Fecha: '2026-06-01', Hora: '08:00', OD: '6.2', Temperatura: '29.5' }),
      CT({ Tanque: '1', Fecha: '2026-06-01', Hora: '08:00', OD: '9.9', Temperatura: '99.9' }), // duplicado
    ];
    const pages = buildFichaPages('params', { mod: 'M01', corrida: '573' });
    expect(pages.length).toBe(1);
    expect(pages[0].d.od_0_0800).toBeUndefined();       // la clave lleva el rótulo 'HH:MM'
    expect(pages[0].d['od_0_08:00']).toBe('6.2');
    expect(pages[0].d['tc_0_08:00']).toBe('29.5');
  });

  it('un segundo registro con la celda vacía no borra la lectura buena', () => {
    store.globalData = [
      CT({ Tanque: '1', Fecha: '2026-06-01', Hora: '08:00', OD: '6.2', Temperatura: '' }),
      CT({ Tanque: '1', Fecha: '2026-06-01', Hora: '08:00', OD: '', Temperatura: '29.5' }),
    ];
    const pages = buildFichaPages('params', { mod: 'M01', corrida: '573' });
    // Cada celda se completa con la primera lectura NO vacía de esa hora.
    expect(pages[0].d['od_0_08:00']).toBe('6.2');
    expect(pages[0].d['tc_0_08:00']).toBe('29.5');
  });

  it('horas distintas del mismo tanque no se pisan entre sí', () => {
    store.globalData = [
      CT({ Tanque: '1', Fecha: '2026-06-01', Hora: '08:00', OD: '6.2' }),
      CT({ Tanque: '1', Fecha: '2026-06-01', Hora: '10:00', OD: '7.1' }),
    ];
    const pages = buildFichaPages('params', { mod: 'M01', corrida: '573' });
    expect(pages[0].d['od_0_08:00']).toBe('6.2');
    expect(pages[0].d['od_0_10:00']).toBe('7.1');
  });

  it('las fichas de Larvicultura ya resolvían el empate con la PRIMERA fila', () => {
    store.globalData = [
      row({ Tanque: '1', Fecha: '2026-06-01', 'Población': '2000000' }),
      row({ Tanque: '1', Fecha: '2026-06-01', 'Población': '9000000' }),   // duplicado
    ];
    expect(buildFichaPages('poblacion', { mod: 'M01', corrida: '573' })[0].d.po_0).toBe(2000);
  });
});

describe('trazabilidad · caché de filas por fuente', () => {
  const FIDS = ['poblacion', 'calidad', 'plg', 'despacho', 'params', 'calagua', 'desinfeccion'];
  const OPTS = { mod: 'M01', corrida: '573' };
  // Una fila por fuente, con señal suficiente para que cada ficha genere página.
  const threeSources = () => [
    row({ Tanque: '1', Fecha: '2026-06-01', 'Técnico': 'Ana', 'Población': '2000000', 'Estadío': 'Z2',
      'Intestino_Lleno': '80', Plg: '55', Biomasa: '15', 'Cel/ml': '5000' }),
    { _SheetOrigin: 'Control_Tanque M01', 'Módulo': 'M01', Corrida: '573', Tanque: '1', Fecha: '2026-06-01', Hora: '08:00', OD: '6.2', Temperatura: '29.5' },
    { _SheetOrigin: 'Registro_Desinfección', 'Módulo': 'M01', Corrida: '573', Fecha: '2026-06-01', 'Tipo de Registro': 'Áreas', 'Categoría': 'Piso', Elemento: 'E1', Estado: 'OK' },
  ];

  // CORRECTITUD: la caché se invalida por identidad de store.globalData, que sheets.js
  // reemplaza por un array NUEVO en cada refresco. Sin esto se servirían PDF con datos viejos.
  it('un refresco de datos invalida la caché: las fichas reflejan lo nuevo', () => {
    store.globalData = [row({ Tanque: '1', Fecha: '2026-06-01', 'Población': '2000000' })];
    expect(buildFichaPages('poblacion', OPTS).map((p) => p.d.fecha)).toEqual(['2026-06-01']);
    expect(moduleDateRange('M01', '573')).toEqual({ from: '2026-06-01', to: '2026-06-01' });

    store.globalData = [
      row({ Tanque: '1', Fecha: '2026-06-01', 'Población': '2000000' }),
      row({ Tanque: '1', Fecha: '2026-06-05', 'Población': '1800000' }),
    ];
    expect(buildFichaPages('poblacion', OPTS).map((p) => p.d.fecha)).toEqual(['2026-06-01', '2026-06-05']);
    expect(moduleDateRange('M01', '573')).toEqual({ from: '2026-06-01', to: '2026-06-05' });
  });

  // RENDIMIENTO (guardián): descargar las 7 fichas recorría el store 7 veces, +3 de
  // moduleDateRange. Ahora es 1 escaneo por fuente y las fichas reutilizan el resultado.
  it('las 7 fichas + moduleDateRange escanean el store 3 veces (1 por fuente), no 10', () => {
    const rows = threeSources();
    let scans = 0;
    const realFilter = Array.prototype.filter;
    rows.filter = function (...args) { scans++; return realFilter.apply(this, args); };
    store.globalData = rows;

    moduleDateRange('M01', '573');
    FIDS.forEach((fid) => buildFichaPages(fid, OPTS));
    expect(scans).toBe(3);

    store.globalData = [];
  });

  // Cada (fuente · módulo · corrida) tiene su propia entrada: no se sirven filas de otro módulo.
  it('la clave de caché distingue módulo y corrida', () => {
    store.globalData = [
      row({ Tanque: '1', Fecha: '2026-06-01', 'Población': '2000000' }),
      row({ 'Módulo': 'M02', Tanque: '1', Fecha: '2026-06-09', 'Población': '900000' }),
      row({ Corrida: '574', Tanque: '1', Fecha: '2026-07-02', 'Población': '700000' }),
    ];
    expect(buildFichaPages('poblacion', OPTS).map((p) => p.d.fecha)).toEqual(['2026-06-01']);
    expect(buildFichaPages('poblacion', { mod: 'M02', corrida: '573' }).map((p) => p.d.fecha)).toEqual(['2026-06-09']);
    expect(buildFichaPages('poblacion', { mod: 'M01', corrida: '574' }).map((p) => p.d.fecha)).toEqual(['2026-07-02']);
  });
});
