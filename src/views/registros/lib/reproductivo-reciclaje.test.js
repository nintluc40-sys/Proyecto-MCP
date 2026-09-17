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
  '_reproTransferHTML', 'madReproTransfer', '_reproConsultaHTML', 'madReproTrace',
  /* 2026-09-16 · las columnas que se le piden a la MATRIZ. No es un detalle: desde que la llave es
     la cuaterna, si esta lista no trae Piscina, Código genético y Lote, la mortalidad y el traslado
     mandan la llave a medias y el upsert AÑADE una fila suelta en vez de actualizar la suya. Lo
     destapó el banco: dos mutaciones que recortaban esta lista SOBREVIVÍAN. */
  '_REPRO_MATRIZ_COLS',
  '_reproEnsureMatrix'];   // RD1 (2026-09-16) · una lectura buena, que es la que deja la copia local
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
    if (lecturaRows && String(url).includes('p=rows')) return lecturaRows(String(url));   // RD1: ?p=rows a medida
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
/* 2026-09-16 · `SIN_CAPS` se retira con el portón que lo usaba: el alta ya no le pregunta al GAS
   por ninguna capacidad, así que un GAS «sin ella» dejó de ser un caso. `CON_CAPS` se queda porque
   sigue siendo la respuesta normal de ?p=ver para el resto del arnés. */
const CON_CAPS = JSON.stringify({ ok: true, version: 'abcdefabcdef', caps: ['matriz-cuaterna'] });
let S;
let lecturaRows = null;

beforeEach(() => {
  S = H._REPRO_SHEETS;
  avisos.length = 0;
  envios.length = 0;
  pedidas.length = 0;
  respuestaVer = CON_CAPS;
  lecturaRows = null;
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
  /* 2026-09-16 · entran PISCINA y CÓDIGO: son parte de la identidad, y sin ellos ninguna prueba
     podría distinguir «la misma hembra otra vez» de «otra hembra con el mismo chip». */
  filas.forEach(([trovan, piscina, codigo, lote, sala, tanque], i) => {
    const pon = (c, v) => { trs[i].querySelector(`[data-c="${c}"]`).value = v; };
    pon(1, trovan); pon(3, piscina); pon(4, codigo); pon(5, lote); pon(6, sala); pon(7, tanque);
  });
}
const trovanes = () => envios.flatMap((p) => p.rows.map((r) => r[1]));
const informeAlta = () => document.getElementById('repro-a-report').textContent;
const preguntoVer = () => pedidas.some((u) => u.includes('p=ver'));

/* ⚠⚠ 2026-09-16 · ESTE BLOQUE PROBABA UN PORTÓN QUE YA NO EXISTE. Se llamaba «el chip de una hembra
   muerta sólo sale hacia un GAS que sabe reciclar» y fijaba, con siete pruebas, los tres rechazos
   que el usuario reportó: preguntar a ?p=ver por «matriz-reciclaje» y no enviar sin él, exigir que
   la anterior estuviera muerta, y exigir que la fecha fuera posterior a su muerte.
   Con la identidad por CUATERNA (Trovan · Piscina · Código genético · Lote) el alta no negocia nada
   con el servidor: sólo mira si esa cuaterna ya existe. Lo que se prueba aquí es eso, y sobre todo
   lo que ANTES fallaba — que el alta SALGA—. */
describe('alta masiva · el mismo Trovan entra tantas veces como cuaternas distintas tenga', () => {
  it('🔴 con el chip de una MUERTA sale, y ya no se le pregunta nada al GAS', async () => {
    teclearAlta('2026-07-20', [[CHIP, 'P4', 'G09', 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(preguntoVer()).toBe(false);          // antes preguntaba por «matriz-reciclaje»
    expect(trovanes()).toEqual([CHIP]);
    expect(envios[0].rows[0][5]).toBe('L33');
  });

  it('🔴 con el chip de una VIVA también sale: antes era «ya existente»', async () => {
    teclearAlta('2026-09-10', [['0008218CCC', 'P4', 'G09', 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(envios).toHaveLength(1);
    expect(trovanes()).toEqual(['0008218CCC']);
  });

  it('🔴 la FECHA ya no frena: el mismo día de la muerte de la anterior sale igual', async () => {
    teclearAlta('2026-07-08', [[CHIP, 'P4', 'G09', 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(envios).toHaveLength(1);
    expect(trovanes()).toEqual([CHIP]);
  });

  it('🔴 lo único que NO sale es repetir la MISMA cuaterna, y el informe lo dice', async () => {
    /* La que está en la MATRIZ del fixture es VIEJA = (CHIP · P2 · G01 · L12): se teclea igual. */
    teclearAlta('2026-09-11', [[CHIP, 'P2', 'G01', 'L12', 'S3', 'T4']]);
    await H.madReproAltaBatch();
    expect(envios).toHaveLength(0);
    expect(informeAlta()).toContain('ya existente');
    expect(avisos[avisos.length - 1].msg).not.toContain('falta el Trovan');
    expect(document.querySelector('#repro-a-tbody [data-c="1"]').value).toBe(CHIP);   // lo tecleado sigue ahí
  });

  it('el fixture ejerce algo: cambiando SÓLO el lote, esa misma fila ya sale', async () => {
    teclearAlta('2026-09-11', [[CHIP, 'P2', 'G01', 'L13', 'S3', 'T4']]);
    await H.madReproAltaBatch();
    expect(envios).toHaveLength(1);
    expect(trovanes()).toEqual([CHIP]);
  });

  it('el informe avisa de que ese Trovan ya lo usa otro individuo (informativo, no un freno)', async () => {
    teclearAlta('2026-07-20', [[CHIP, 'P4', 'G09', 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(envios).toHaveLength(1);
    /* Dos aserciones y no una: el chip de arriba y el renglón de detalle dicen los dos «ya usado»,
       así que con un solo `toContain` se podía apagar cualquiera de los dos y la prueba seguía en
       verde — lo destapó el banco, con E07 y E10 sobreviviendo. */
    expect(informeAlta()).toContain('con Trovan ya usado');                  // el chip del resumen
    expect(informeAlta()).toContain('Trovan ya usado por otro individuo');   // el renglón de detalle
  });

  it('🔴 a la MATRIZ se le piden las columnas de la IDENTIDAD, o la mortalidad rompería su fila', () => {
    /* Sin Piscina, Código genético y Lote en la lectura, `buildEventBatch` y `buildTransferBatch`
       mandarían la llave incompleta y el upsert añadiría una fila suelta en vez de actualizar. */
    for (const c of ['Trovan ID', 'Piscina', 'Código genético', 'Lote', 'Sala actual', 'Tanque actual', 'Estado']) {
      expect(H._REPRO_MATRIZ_COLS, c).toContain(c);
    }
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

/* 🔴 RD1 (2026-09-16) · LA MATRIZ DICE QUIÉN ES CADA TROVAN, y desde que su llave es la cuaterna no hay
   traslado sin ella: la fila iría sin piscina, código ni lote y la hoja ganaría una fila suelta. Con Google
   caído se trabaja con la copia local, que por eso tiene que guardar la identidad. */
describe('🔴 RD1 · sin la MATRIZ no hay traslado, y la copia local lleva la identidad', () => {
  const pegarTraslado = () => {
    caja('rc-transfer').innerHTML = H._reproTransferHTML();
    document.getElementById('repro-t-fecha').value = '2026-09-12';
    document.getElementById('repro-t-osala').value = 'S3';
    document.getElementById('repro-t-otanque').value = 'T4';
    document.querySelector('#repro-t-dests .repro-dest-sala').value = 'S9';
    document.querySelector('#repro-t-dests .repro-dest-tanque').value = 'T9';
    document.querySelector('#repro-t-dests .repro-dest-codes').value = CHIP;
  };
  const googleCaido = () => { throw new Error('Google no respondió en 30 s'); };
  beforeEach(() => { localStorage.removeItem('larv4_mad_matriz'); H.setLecturas({}); });

  it('🔴 sin MATRIZ (Google caído y sin copia) no se envía nada, se dice por qué y lo pegado se queda', async () => {
    lecturaRows = googleCaido;
    pegarTraslado();
    await H.madReproTransfer();
    expect(envios).toHaveLength(0);
    const err = avisos.filter((a) => a.tipo === 'err').map((a) => a.msg).join(' | ');
    expect(err).toContain('Maduración MATRIZ');
    expect(err).toContain('Google no respondió en 30 s');                    // el motivo REAL
    // y no se sigue: pedir el historial con Google caído serían otros dos intentos de espera para nada
    expect(pedidas.filter((u) => decodeURIComponent(u).includes('Transferencias'))).toEqual([]);
    expect(document.querySelector('#repro-t-dests .repro-dest-codes').value).toBe(CHIP);
  }, 15000);

  it('🔴 con Google caído, el traslado sale de la COPIA LOCAL y la fila de la MATRIZ lleva la cuaterna', async () => {
    // 1 · una lectura buena deja la copia…
    lecturaRows = (url) => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true,
      rows: decodeURIComponent(url).includes('MATRIZ') ? [VIEJA, NUEVA] : [] }) });
    await H._reproEnsureMatrix(true);
    // 2 · …Google deja de responder y lo leído en memoria ya no está (otra sesión, el mismo dispositivo)
    lecturaRows = googleCaido;
    H.setLecturas({});
    pegarTraslado();
    await H.madReproTransfer();
    const m = envios.find((p) => p.sheetName === S.matriz);
    expect(m).toBeTruthy();
    const v = (h) => m.rows[0][m.headers.indexOf(h)];
    expect([v('Trovan ID'), v('Piscina'), v('Código genético'), v('Lote'), v('Sala actual')]).toEqual([CHIP, 'P9', 'G07', 'L20', 'S9']);
    localStorage.removeItem('larv4_mad_matriz');
  }, 15000);
});
