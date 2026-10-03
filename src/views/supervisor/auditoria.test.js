// @vitest-environment happy-dom
/* ============================================================
   SUPERVISOR · 🧾 Auditoría de corrida (F2 del punto 6 del usuario, 2026-10-03)

   🔑 LA PARIDAD: `resumenAuditoria` (MCP) es una COPIA de `audResumen` (engine.js, la ficha que registra) —el motor es
   un guion clásico y no se puede importar—. Aquí se ejecutan LAS DOS: la ficha REAL escribe las filas de la hoja
   (`audFilas`), el MCP las lee como las leería del libro (`auditoriasDelModulo`) y los dos resúmenes tienen que ser
   IGUALES. Si alguien cambia uno sin el otro, esto se pone rojo.
   Además: qué filas entran en la auditoría de un módulo (los módulos que une una transferencia, en las dos
   direcciones), los cruces con Datos Larvicultura y la sub-vista. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { store } from '../../core/store.js';
import { classifyOrigin, detectSheetName } from '../../core/sheets.js';
import { auditoriasDelModulo, resumenAuditoria, crucesConLarvicultura, facturadaDe, esExcepcion } from './auditoria.js';
import { renderAuditoria } from './auditoria.view.js';

const ENG = {};
beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
  }
  const seguridad = await import('../registros/lib/security.js');
  const modulos = await import('../registros/lib/modules.js');
  const repro = await import('../registros/lib/reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };
  const host = document.createElement('div');     // el motor necesita su marco (shell.html) para arrancar
  host.className = 'registros-app';
  host.innerHTML = readFileSync(join(process.cwd(), 'src/views/registros/shell.html'), 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENGAUD; H.audFilas = audFilas; H.audResumen = audResumen; H.AUD_HEADERS = AUD_HEADERS;'
    + ' H.audFacturada = audFacturada; H.audFacturadaEsExcepcion = audFacturadaEsExcepcion; })();';
  globalThis.__ENGAUD = ENG;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(join(process.cwd(), 'public/registros/engine.js'), 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
});
afterEach(() => { store.globalData = []; });

/** Lo que la ficha escribiría en la hoja, como filas del libro (objetos por cabecera, con su origen). */
const comoHoja = (aud) => ENG.audFilas(aud).map((f) => ({ _SheetOrigin: 'Registro_Auditoria', ...Object.fromEntries(ENG.AUD_HEADERS.map((h, i) => [h, f[i]])) }));
const SI = (o) => ({ siembra: '1ª', modulo: 'M04', tanque: '1', fecha: '2026-03-03', origen: 'Omarsa', guia: '1001', cantidad: '5,000,000', ton: '28',
  lote: 'ZZ', codigo: 'CG-PRUEBA.1G', fechaIng: '2026-01-21', guiasIng: '9001', ...o });
const TR = (o) => ({ fecha: '2026-03-14', modulo: 'M04', tanque: '1', moduloDest: 'M05', tanqueDest: '1', cantidad: '', estadio: 'PL5', plg: '870', larvasPeq: '6', ...o });
const CO = (o) => ({ fecha: '2026-03-22', modulo: 'M04', tanque: '1', partida: 1, cantidad: '', ton: '', estadio: 'PL13', plg: '195', camaronera: 'Cachugrán',
  piscinas: '96', guia: '2001', guiaDespacho: '3001', facturada: '', tinas: '12', placa: 'GBA-1', ...o });
const aud = (o) => ({ corrida: '901', modulo: 'M04', registrado: 'Ana', obs: '', siembras: [], transferencias: [], cosechas: [], ...o });

const CASOS = {
  'sin transferencias, con partidas y una excepción de facturada': aud({
    siembras: [SI({}), SI({ tanque: '2', siembra: '2ª', cantidad: '6,300,000', ton: '27', fecha: '2026-03-04' })],
    cosechas: [CO({ modulo: 'M04', cantidad: '3,300,000' }), CO({ modulo: 'M04', partida: 2, cantidad: '1,300,000', fecha: '2026-03-23', camaronera: 'Puná 2', placa: 'GBA-2' }),
      CO({ modulo: 'M04', tanque: '2', cantidad: '5,265,000', facturada: '4,000,000', plg: '150' })],
  }),
  'con transferencia a OTRO módulo (dos orígenes, dos destinos)': aud({
    siembras: [SI({}), SI({ tanque: '2' })],
    transferencias: [TR({ cantidad: '3,000,000' }), TR({ tanque: '2', cantidad: '1,000,000' }), TR({ tanque: '2', tanqueDest: '2', cantidad: '2,000,000' })],
    cosechas: [CO({ modulo: 'M05', cantidad: '2,000,000', ton: '27' }), CO({ modulo: 'M05', tanque: '2', cantidad: '1,500,000' })],
  }),
};

describe('Auditoría · el MCP calcula LO MISMO que la ficha (paridad con engine.js)', () => {
  for (const [nombre, a] of Object.entries(CASOS)) {
    it('🔑 ' + nombre, () => {
      const leida = auditoriasDelModulo(comoHoja(a), 'M04', '901');
      expect(leida).toHaveLength(1);
      expect(resumenAuditoria(leida[0])).toEqual(ENG.audResumen(a));
    });
  }
});

describe('Auditoría · la facturada (90 % propuesto; la tecleada distinta es excepción)', () => {
  it('🔴 una celda de facturada VACÍA en la hoja (la ficha siempre la escribe; a mano, puede no estar) vale el 90 %, como en la ficha', () => {
    const casos = [{ cantidad: '1,000,000', facturada: '' }, { cantidad: '1,000,000', facturada: '900,000' }, { cantidad: '1,000,000', facturada: '800000' },
      { cantidad: '', facturada: '' }, { cantidad: '333', facturada: '' }];
    for (const c of casos) {
      expect(facturadaDe(c)).toBe(ENG.audFacturada(c));
      expect(esExcepcion(c)).toBe(ENG.audFacturadaEsExcepcion(c));
    }
    expect(facturadaDe(casos[0])).toBe(900000);
    const a = auditoriasDelModulo([{ _SheetOrigin: 'Registro_Auditoria', Tipo: 'Cosecha', Corrida: '901', 'Módulo': 'M04', Tanque: '1', Fecha: '2026-03-22',
      Partida: '1', Cantidad: '1000000', Camaronera: 'Cachugrán', 'Cantidad facturada': '' }], 'M04', '901')[0];
    expect(resumenAuditoria(a).camaroneras[0]).toMatchObject({ real: 1000000, facturada: 900000, excepciones: 0 });
  });
});

describe('Auditoría · qué entra en la de un módulo', () => {
  let filas;    // se arma con el motor ya cargado (beforeAll), no al recolectar
  beforeAll(() => {
    filas = [...comoHoja(CASOS['con transferencia a OTRO módulo (dos orígenes, dos destinos)']),
      ...comoHoja(aud({ corrida: '900', siembras: [SI({ modulo: 'M04' })] })),
      ...comoHoja(aud({ corrida: '901', modulo: 'M07', siembras: [SI({ modulo: 'M07', tanque: '9' })] }))];
  });

  it('🔴 la de M04 trae las cosechas del M05 al que transfirió; la del M05, las siembras del M04 de las que recibió', () => {
    const a04 = auditoriasDelModulo(filas, 'M04', '901')[0];
    expect(a04.modulos).toEqual(['M04', 'M05']);
    expect(a04.cosechas.map((c) => c.modulo)).toEqual(['M05', 'M05']);
    const a05 = auditoriasDelModulo(filas, 'M05', '901')[0];
    expect(a05.modulos).toEqual(['M04', 'M05']);
    expect(a05.siembras).toHaveLength(2);
    expect(resumenAuditoria(a05)).toEqual(resumenAuditoria(a04));
  });

  it('un módulo que nada une queda fuera; sin corrida, una auditoría por corrida, la más reciente primero', () => {
    expect(auditoriasDelModulo(filas, 'M04', '901')[0].siembras.some((s) => s.modulo === 'M07')).toBe(false);
    expect(auditoriasDelModulo(filas, 'M04', null).map((a) => a.corrida)).toEqual(['901', '900']);
    expect(auditoriasDelModulo(filas, 'M04', '900').map((a) => a.corrida)).toEqual(['900']);
    expect(auditoriasDelModulo(filas, 'M07', '901')[0].modulos).toEqual(['M07']);
    expect(auditoriasDelModulo(filas, 'M09', null)).toEqual([]);
  });

  it('un módulo que sólo RECIBE (aún sin cosecha propia) también encuentra la auditoría', () => {
    const sinCosecha = comoHoja(aud({ siembras: [SI({})], transferencias: [TR({ cantidad: '3,000,000' })] }));
    const a05 = auditoriasDelModulo(sinCosecha, 'M05', '901');
    expect(a05).toHaveLength(1);
    expect(a05[0].modulos).toEqual(['M04', 'M05']);
    expect(a05[0].transferencias).toHaveLength(1);
  });

  it('«Módulo 4» y «M04» son el mismo; otras hojas no cuentan', () => {
    const otra = [{ _SheetOrigin: 'Larvicultura', 'Módulo': 'M04', Corrida: '901', Tipo: 'Siembra' }];
    expect(auditoriasDelModulo([...comoHoja(CASOS['sin transferencias, con partidas y una excepción de facturada']), ...otra], 'Módulo 4', '901')[0].filas).toBe(5);
  });
});

describe('Auditoría · el cruce con Datos Larvicultura', () => {
  it('🔴 el sembrado del N5 y lo cosechado (última población) del mismo tanque y corrida, con su diferencia', () => {
    const a = auditoriasDelModulo(comoHoja(CASOS['sin transferencias, con partidas y una excepción de facturada']), 'M04', '901')[0];
    const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M04', Corrida: '901', ...o });
    const larv = [
      L({ Tanque: 'TQ 1', Fecha: '03/03/2026', 'Estadío': 'N5', 'Población': '5000000' }),
      L({ Tanque: 'TQ 1', Fecha: '22/03/2026', 'Estadío': 'PL13', 'Población': '4000000' }),
      L({ Tanque: 'TQ 2', Fecha: '04/03/2026', 'Estadío': 'N5', 'Población': '6000000' }),
      L({ Tanque: 'TQ 1', Corrida: '902', Fecha: '03/04/2026', 'Estadío': 'N5', 'Población': '9' }),   // otra corrida: no cuenta
    ];
    const c = crucesConLarvicultura(a, larv);
    const t1 = c.find((x) => x.llave === 'M04·1'), t2 = c.find((x) => x.llave === 'M04·2');
    expect(t1).toMatchObject({ sembrado: 5000000, sembradoLarv: 5000000, difSiembra: 0, cosechado: 4600000, cosechadoLarv: 4000000 });
    expect(t1.difCosecha).toBeCloseTo(0.15, 9);
    // la MISMA regla que la «Cantidad cosechada» de 🚛 Despacho (`lastPop`): la última población leída, aunque sea la del N5
    expect(t2).toMatchObject({ sembrado: 6300000, sembradoLarv: 6000000, cosechado: 5265000, cosechadoLarv: 6000000 });
    expect(t2.difSiembra).toBeCloseTo(0.05, 9);
    expect(t2.difCosecha).toBeCloseTo(-0.1225, 9);
    expect(crucesConLarvicultura(a, [])[0]).toMatchObject({ sembradoLarv: null, difSiembra: null, cosechadoLarv: null, difCosecha: null });
  });
});

describe('Auditoría · la hoja se reconoce (no cae en Larvicultura, aunque lleve Módulo, Corrida y Tanque)', () => {
  it('por su nombre, también con otra grafía', () => {
    for (const n of ['Registro_Auditoria', 'Registro Auditoría', 'registro_auditoria']) expect(classifyOrigin(n)).toBe('Registro_Auditoria');
  });
  it('sin título, por sus columnas (las que escribe la ficha)', () => {
    expect(detectSheetName([Object.fromEntries(ENG.AUD_HEADERS.map((h) => [h, '']))], 7, '')).toBe('Registro_Auditoria');
  });
});

describe('Supervisor · la sub-vista 🧾 Auditoría', () => {
  const ctx = (corrida) => ({ vState: { corrida }, allMods: ['M04', 'M05'], larvAll: [] });
  it('🔴 pinta la auditoría de la corrida: KPI, tanques (≈ si es estimada), despacho por camaronera, partidas (★ excepción) y cruce', () => {
    store.globalData = [...comoHoja(CASOS['con transferencia a OTRO módulo (dos orígenes, dos destinos)']),
      ...comoHoja(aud({ corrida: '902', cosechas: [CO({ cantidad: '1,000,000', facturada: '500,000' })] }))];
    const { html } = renderAuditoria(ctx(null), 'M04');
    expect(html).toContain('AUDITORÍA DE CORRIDA');
    expect(html).toContain('2 auditoría(s)');
    expect(html.indexOf('Corrida 902')).toBeLessThan(html.indexOf('Corrida 901'));
    expect(html).toContain('M04, M05');
    expect(html).toContain('title="Estimada:');                       // el «≈» de la CELDA, no sólo la nota de abajo
    expect(html).toContain('Despacho por camaronera');
    expect(html).toContain('title="No es el 90 % de la real">★');     // el ★ de la PARTIDA (el título de la tabla también lleva uno)
    expect(html).toContain('(1 ≠ 90 %)');
    expect(html).toContain('Cruce con Datos Larvicultura');
  });
  it('sin auditorías lo dice, y dónde se registran', () => {
    store.globalData = [];
    expect(renderAuditoria(ctx('901'), 'M04').html).toContain('Aún no hay auditorías de M04 en la corrida 901');
  });
});
