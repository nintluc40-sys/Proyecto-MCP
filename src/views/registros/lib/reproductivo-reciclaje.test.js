// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · REGISTRO REPRODUCTIVO · ♻ MICROCHIPS RECICLADOS EN LA FICHA (2026-09-14)

   Pedido del usuario: dar de alta hembras nuevas —otro lote, otra piscina, otro código genético—
   con el microchip de una hembra que YA MURIÓ. El alta masiva lo rechazaba como «ya existente».

   Lo que se prueba aquí es el motor ENTERO sobre el shell real, con el GAS y la red simulados:
     · el alta de un chip reciclado sólo SALE si el GAS publicado dice «matriz-reciclaje» en ?p=ver.
       Un GAS anterior fundiría el alta sobre la fila de la hembra muerta, y el GAS vivo hoy es
       anterior: sin esta salvaguarda, el primer reciclaje en campo corrompería su fila;
     · la pregunta al GAS sólo se hace si hay algún chip reciclado en el lote;
     · los informes dicen qué pasó con cada chip;
     · la Consulta separa a las hembras de un mismo chip.
   La regla en sí (qué es un reciclaje válido) la prueban reproductivo.data.test.js y, del lado
   del servidor, mad-gas-dopost.test.js.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const ENGINE = join(RAIZ, 'public/registros/engine.js');
const SHELL = join(RAIZ, 'src/views/registros/shell.html');

const EXPORTAR = ['_REPRO_SHEETS', '_reproAltaHTML', 'madReproAltaBatch', '_reproEventosHTML', 'madReproProcess',
  '_reproTransferHTML', 'madReproTransfer', '_reproConsultaHTML', 'madReproTrace'];
const H = {};
const avisos = [];
const envios = [];
const pedidas = [];
let respuestaVer;

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
  /* ⚠ `new Function` NO deja nada en globalThis: sin este epílogo no se toca ni una función. */
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setLecturas=function(hojas){ _reproSheets=hojas; _reproTrunc={}; _reproSheetsState="ready"; _reproSheetsErr=""; }; }catch(_){}'
    + '\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPost(async (payload) => { envios.push(payload); return true; });
  globalThis.fetch = async (url) => {
    pedidas.push(String(url));
    if (!String(url).includes('p=ver')) throw new Error('esta prueba sólo simula ?p=ver: ' + url);
    if (respuestaVer instanceof Error) throw respuestaVer;
    return { text: async () => respuestaVer };
  };
});

const CHIP = '0008219380';
const VIEJA = { 'Número': '7', 'Trovan ID': CHIP, 'Piscina': 'P2', 'Código genético': 'G01', 'Lote': 'L12', 'Sala actual': 'S1',
  'Tanque actual': 'T1', 'Estado': 'Muerto', 'Fecha muerte': '2026-07-08', 'Fecha ingreso': '2026-01-05' };
const NUEVA = { 'Número': '31', 'Trovan ID': CHIP, 'Piscina': 'P9', 'Código genético': 'G07', 'Lote': 'L20', 'Sala actual': 'S3',
  'Tanque actual': 'T4', 'Estado': 'Vivo', 'Fecha muerte': '', 'Fecha ingreso': '2026-08-01' };
const VIVA = { 'Trovan ID': '0008218CCC', 'Sala actual': 'S5', 'Tanque actual': 'T1', 'Estado': 'Vivo', 'Fecha ingreso': '2026-02-01' };
const CON_CAPS = JSON.stringify({ ok: true, version: 'abcdefabcdef', caps: ['matriz-reciclaje'] });
const SIN_CAPS = JSON.stringify({ ok: true, version: '63498421af0b' });
let S;

beforeEach(() => {
  S = H._REPRO_SHEETS;
  avisos.length = 0;
  envios.length = 0;
  pedidas.length = 0;
  respuestaVer = CON_CAPS;
  window.__rgLib.reproReadSheet = undefined;
  H.setLecturas({ [S.matriz]: [VIEJA, VIVA], [S.bitacora]: [], [S.transfer]: [] });
});

const caja = (id) => {
  let c = document.getElementById(id);
  if (!c) { c = document.createElement('div'); c.id = id; document.body.appendChild(c); }
  return c;
};
/** Pinta la grilla de alta y teclea las filas: [trovan, lote, sala, tanque]. */
function teclearAlta(fecha, filas) {
  caja('rc-alta').innerHTML = H._reproAltaHTML();
  document.getElementById('repro-a-fecha').value = fecha;
  const trs = document.querySelectorAll('#repro-a-tbody tr');
  filas.forEach(([trovan, lote, sala, tanque], i) => {
    const pon = (c, v) => { trs[i].querySelector(`[data-c="${c}"]`).value = v; };
    pon(1, trovan); pon(5, lote); pon(6, sala); pon(7, tanque);
  });
}
const trovanes = () => envios.flatMap((p) => p.rows.map((r) => r[1]));
const informeAlta = () => document.getElementById('repro-a-report').textContent;
const preguntoVer = () => pedidas.some((u) => u.includes('p=ver'));

describe('♻ alta · el chip de una hembra muerta sólo sale hacia un GAS que sabe reciclar', () => {
  it('🔴 con «matriz-reciclaje» en ?p=ver, la hembra nueva SE ENVÍA con sus datos', async () => {
    teclearAlta('2026-07-20', [[CHIP, 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(preguntoVer()).toBe(true);
    expect(trovanes()).toEqual([CHIP]);
    expect(envios[0].rows[0][5]).toBe('L33');
    expect(informeAlta()).toContain('reciclado');
  });

  for (const [caso, respuesta] of [
    ['un GAS con sello pero SIN la capacidad', SIN_CAPS],
    ['un GAS anterior a la prueba de versión (texto)', 'FichasLarv-OK'],
    ['un GAS que no responde', new Error('sin red')],
  ]) {
    it(`🔴 con ${caso} NO se envía, y lo demás del lote sí`, async () => {
      respuestaVer = respuesta;
      teclearAlta('2026-07-20', [['000821BC99', 'L33', 'S2', 'T8'], [CHIP, 'L33', 'S2', 'T9']]);
      await H.madReproAltaBatch();
      expect(trovanes()).toEqual(['000821BC99']);
      expect(informeAlta()).toContain(CHIP);
      expect(informeAlta()).toContain('GAS');
      expect(avisos.some((a) => a.tipo === 'warn' && a.msg.includes('GAS'))).toBe(true);
    });
  }

  it('🔴 si SÓLO había chips reciclados y el GAS no sabe, no sale nada y el aviso dice por qué (no «¿falta el Trovan?»)', async () => {
    respuestaVer = SIN_CAPS;
    teclearAlta('2026-07-20', [[CHIP, 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(envios).toHaveLength(0);
    const aviso = avisos[avisos.length - 1];
    expect(aviso.msg).toContain('GAS');
    expect(aviso.msg).not.toContain('falta el Trovan');
    expect(document.querySelector('#repro-a-tbody [data-c="1"]').value).toBe(CHIP);   // lo tecleado sigue ahí
  });

  it('un lote SIN chips reciclados no pregunta nada al GAS y se envía como siempre', async () => {
    respuestaVer = new Error('no debería preguntarse');
    teclearAlta('2026-09-10', [['000821BC99', 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(preguntoVer()).toBe(false);
    expect(trovanes()).toEqual(['000821BC99']);
  });

  it('el chip de una hembra VIVA sigue siendo «ya existente», sin preguntar al GAS', async () => {
    teclearAlta('2026-09-10', [['0008218CCC', 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(preguntoVer()).toBe(false);
    expect(envios).toHaveLength(0);
    expect(informeAlta()).toContain('ya existente');
  });

  it('🔴 con una fecha que no es posterior a la muerte, no sale ni se pregunta al GAS, y el informe lo explica', async () => {
    teclearAlta('2026-07-08', [[CHIP, 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(preguntoVer()).toBe(false);
    expect(envios).toHaveLength(0);
    expect(informeAlta()).toContain(CHIP);
    expect(informeAlta()).toContain('posterior');
  });
});

describe('♻ eventos y traslados · lo anterior al ingreso de la hembra vigente no se registra', () => {
  it('🔴 un desove anterior al ingreso de la hembra que lleva hoy el chip no sale, y el informe dice por qué', async () => {
    H.setLecturas({ [S.matriz]: [VIEJA, NUEVA], [S.bitacora]: [], [S.transfer]: [] });
    caja('rc-eventos').innerHTML = H._reproEventosHTML();
    document.getElementById('repro-fecha').value = '2026-07-30';
    document.getElementById('repro-tipo').value = 'Desove';
    document.getElementById('repro-codes').value = CHIP;
    await H.madReproProcess();
    expect(envios).toHaveLength(0);
    const inf = document.getElementById('repro-report').textContent;
    expect(inf).toContain(CHIP);
    expect(inf).toContain('ingreso');
  });

  it('🔴 un traslado anterior a su ingreso tampoco, y el informe lo nombra', async () => {
    H.setLecturas({ [S.matriz]: [VIEJA, NUEVA], [S.bitacora]: [], [S.transfer]: [{ 'TR-ID': 'TR-000001', 'Trovan ID': 'X' }] });
    caja('rc-transfer').innerHTML = H._reproTransferHTML();
    document.getElementById('repro-t-fecha').value = '2026-07-30';
    document.getElementById('repro-t-osala').value = 'S3';
    document.getElementById('repro-t-otanque').value = 'T4';
    document.querySelector('#repro-t-dests .repro-dest-sala').value = 'S6';
    document.querySelector('#repro-t-dests .repro-dest-tanque').value = 'T2';
    document.querySelector('#repro-t-dests .repro-dest-codes').value = CHIP;
    await H.madReproTransfer();
    expect(envios).toHaveLength(0);
    const inf = document.getElementById('repro-t-report').textContent;
    expect(inf).toContain(CHIP);
    expect(inf).toContain('ingreso');
  });
});

describe('♻ Consulta · cada hembra de un chip, por separado', () => {
  const BIT = [
    { 'Trovan ID': CHIP, 'Fecha': '2026-06-01', 'Tipo': 'Desove' },
    { 'Trovan ID': CHIP, 'Fecha': '2026-08-10', 'Tipo': 'Desove' },
  ];
  const trazar = (id) => {
    caja('rc-consulta').innerHTML = H._reproConsultaHTML();
    document.getElementById('repro-trace-id').value = id;
    H.madReproTrace();
    return document.getElementById('repro-trace-out').textContent;
  };

  it('🔴 la matriz de desoves da una fila por hembra', () => {
    H.setLecturas({ [S.matriz]: [VIEJA, NUEVA], [S.bitacora]: BIT, [S.transfer]: [] });
    const h = H._reproConsultaHTML();
    expect(h).toContain(CHIP + '·2026-01-05');
    expect(h).toContain('2 hembra(s)');
  });

  it('🔴 la trazabilidad es la de la hembra que lleva hoy el chip, y nombra a la anterior', () => {
    H.setLecturas({ [S.matriz]: [VIEJA, NUEVA], [S.bitacora]: BIT, [S.transfer]: [] });
    const t = trazar(CHIP);
    expect(t).toContain('Vivo');
    expect(t).toContain('2026-08-10');
    expect(t).not.toContain('2026-06-01');
    expect(t).toContain('reciclado');
    expect(t).toContain('2026-01-05');                 // la hembra anterior: su ingreso
    expect(t).toContain('L12');                        // y su lote
  });

  it('sin fechas en la lectura no se puede partir, y lo dice', () => {
    const sinF = (o) => ({ 'Trovan ID': o['Trovan ID'], 'Sala actual': o['Sala actual'], 'Tanque actual': o['Tanque actual'], 'Estado': o['Estado'] });
    H.setLecturas({ [S.matriz]: [sinF(VIEJA), sinF(NUEVA)], [S.bitacora]: BIT, [S.transfer]: [] });
    const t = trazar(CHIP);
    expect(t).toContain('2026-06-01');
    expect(t).toContain('2026-08-10');
    expect(t).toContain('fechas');
  });

  it('un chip de una sola hembra se traza como siempre, sin avisos de reciclaje', () => {
    H.setLecturas({ [S.matriz]: [VIVA], [S.bitacora]: [{ 'Trovan ID': '0008218CCC', 'Fecha': '2026-03-01', 'Tipo': 'Desove' }], [S.transfer]: [] });
    const t = trazar('0008218CCC');
    expect(t).toContain('2026-03-01');
    expect(t).not.toContain('reciclado');
  });
});
