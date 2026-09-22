// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · REGISTRO REPRODUCTIVO · ♻ MICROCHIPS RECICLADOS EN LA FICHA (2026-09-14)

   Pedido del usuario: dar de alta hembras nuevas —otro lote, otra piscina, otro código genético—
   con el microchip de una hembra que YA MURIÓ. El alta masiva lo rechazaba como «ya existente».

   Lo que se prueba aquí es el motor ENTERO sobre el shell real, con el GAS y la red simulados:
     · el alta: desde el 2026-09-16 un individuo es su CUATERNA (Trovan · Piscina · Código genético ·
       Lote), así que el mismo chip entra tantas veces como cuaternas distintas tenga —viva o muerta la
       anterior, sin mirar fechas— y ya no se le pregunta nada al GAS. Lo único que no sale es repetir
       la MISMA cuaterna. (Hasta ese día sólo salía con el chip de una MUERTA y si el GAS anunciaba
       «matriz-reciclaje»: esa regla y esa pregunta se retiraron con la cuaterna.);
     · lo anterior al ingreso de la hembra vigente no se registra;
     · la Consulta separa a las hembras de un mismo chip;
     · sin la MATRIZ no hay traslado (RD1), y con dos vivas en un chip elige el usuario (R5).
   La regla en sí la prueban reproductivo.data.test.js y, del lado del servidor, mad-gas-dopost.test.js
   (que desde V2 también defiende la MATRIZ de un cliente anterior a la cuaterna).
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
  '_reproEnsureMatrix',    // RD1 (2026-09-16) · una lectura buena, que es la que deja la copia local
  'madReproRegistrarElegidas',   // R5 (2026-09-18) · con dos vivas elige el usuario
  '_reproLoadSheets'];           // 1a (2026-09-21) · la carga de la Consulta, para dejarla EN VUELO
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
    /* 1a (2026-09-21) · unas lecturas «puestas a mano» no son una lectura de la hoja: se olvida de dónde y cuándo salió la
       anterior, o una prueba heredaría de la de antes una «lectura recién hecha» y no confirmaría lo que debe. */
    + '\ntry{ H.setLecturas=function(hojas){ _reproSheets=hojas; _reproTrunc={}; _reproSheetsState="ready"; _reproSheetsErr="";'
    + ' _reproMatrixSrc=""; _reproMatrixTs=0; _reproFresca=null; _reproUltimaEscritura=0; }; }catch(_){}'
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

const CHIP = '0007219380';
const VIEJA = { 'Número': '7', 'Trovan ID': CHIP, 'Piscina': 'P2', 'Código genético': 'G01', 'Lote': 'L12', 'Sala actual': 'S1',
  'Tanque actual': 'T1', 'Estado': 'Muerto', 'Fecha muerte': '2026-07-08', 'Fecha ingreso': '2026-01-05' };
const NUEVA = { 'Número': '31', 'Trovan ID': CHIP, 'Piscina': 'P9', 'Código genético': 'G07', 'Lote': 'L20', 'Sala actual': 'S3',
  'Tanque actual': 'T4', 'Estado': 'Vivo', 'Fecha muerte': '', 'Fecha ingreso': '2026-08-01' };
const VIVA = { 'Trovan ID': '0007218CCC', 'Sala actual': 'S5', 'Tanque actual': 'T1', 'Estado': 'Vivo', 'Fecha ingreso': '2026-02-01' };
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
    teclearAlta('2026-09-10', [['0007218CCC', 'P4', 'G09', 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(envios).toHaveLength(1);
    expect(trovanes()).toEqual(['0007218CCC']);
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

  /* 1b (2026-09-22) · ESTA PRUEBA EXIGÍA LO CONTRARIO —que el informe avisara «♻ con Trovan ya usado»— y el usuario
     retiró ese aviso: reutilizar el chip con otra piscina, código o lote es el proceso normal. El fixture es justo ese
     caso (el chip era de VIEJA, que murió), así que si el aviso vuelve, por el chip del resumen o por el renglón de
     detalle, esto se pone rojo. «1 registrado» es el control: sin él, un informe que no se pintara pasaría el `not`. */
  it('el informe ya NO avisa del Trovan reutilizado con otra cuaterna (1b: es lo normal), y el alta sale', async () => {
    teclearAlta('2026-07-20', [[CHIP, 'P4', 'G09', 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(envios).toHaveLength(1);
    expect(informeAlta()).toContain('1 registrado');
    expect(informeAlta()).not.toContain('ya usado');   // ni el chip del resumen ni el renglón de detalle
    expect(informeAlta()).not.toContain('♻');
  });

  it('1b · el formulario ya no enseña la regla vieja del chip reciclado («muerta», «posterior a la muerte»)', () => {
    const html = H._reproAltaHTML();
    expect(html).toContain('Alta masiva de individuos');   // control: el formulario se pinta
    expect(html).not.toContain('se puede volver a usar');
    expect(html).not.toContain('a la muerte de la anterior');
    expect(html).not.toContain('♻');
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
    H.setLecturas({ [S.matriz]: [VIVA], [S.bitacora]: [{ 'Trovan ID': '0007218CCC', 'Fecha': '2026-03-01', 'Tipo': 'Desove' }], [S.transfer]: [] });
    const t = trazar('0007218CCC');
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

/* 🔴 R5 (2026-09-18) · UN CHIP QUE LLEVAN DOS VIVAS YA NO SE QUEDA SIN SALIDA. D17 sigue sin dejar que el sistema
   elija, pero la app ofrece las dos hembras y registra a la que elija el usuario —y SÓLO esos chips: nada de lo que
   ya salió se repite, y un traslado conserva su TR-ID—. Aquí se prueba con el motor entero, que es donde vive el
   selector; la regla (qué elección vale) la prueba reproductivo.data.test.js. */
describe('🔴 R5 · con dos hembras vivas en un chip, elige el USUARIO', () => {
  const VIVA_A = Object.assign({}, NUEVA);                                   // P9 · G07 · L20, en S3/T4
  const VIVA_B = Object.assign({}, NUEVA, { 'Número': '32', 'Piscina': 'P3', 'Código genético': 'G11', 'Lote': 'L44',
    'Sala actual': 'S8', 'Tanque actual': 'T2' });                            // la vigente (más abajo en la hoja)
  const radio = (caja, lote) => [...document.querySelectorAll('#' + caja + ' .repro-elegir input[type="radio"]')]
    .find((r) => r.parentElement.textContent.includes(lote));
  const valor = (p, h) => p.rows[0][p.headers.indexOf(h)];
  /* Pulsa el botón como lo haría el navegador: con la marca que lleva ESCRITA en su onclick. Llamar al handler a mano
     sin ella se saltaría justo lo que ata el botón al pendiente del que se pintó. */
  const marcaDe = (caja) => {
    const m = /^madReproRegistrarElegidas\((\d+)\)$/.exec(document.querySelector('#' + caja + ' .repro-elegir button').getAttribute('onclick'));
    expect(m, 'el botón tiene que estar CABLEADO, con la marca de su pendiente').toBeTruthy();
    return Number(m[1]);
  };
  const pulsar = (caja) => H.madReproRegistrarElegidas(marcaDe(caja));
  const procesarEvento = async (tipo) => {
    caja('rc-eventos').innerHTML = H._reproEventosHTML();
    document.getElementById('repro-fecha').value = '2026-09-12';
    document.getElementById('repro-tipo').value = tipo;
    document.getElementById('repro-codes').value = CHIP;
    await H.madReproProcess();
  };

  it('🔴 evento: no se registra solo, se OFRECEN las dos, y al elegir va a la elegida', async () => {
    H.setLecturas({ [S.matriz]: [VIVA_A, VIVA_B], [S.bitacora]: [], [S.transfer]: [] });
    await procesarEvento('Mortalidad');
    expect(envios, 'D17: el sistema no elige').toHaveLength(0);
    expect(document.querySelectorAll('#repro-report .repro-elegir input[type="radio"]')).toHaveLength(2);
    radio('repro-report', 'L20').checked = true;                              // la A, que NO es la vigente
    await pulsar('repro-report');
    const m = envios.find((p) => p.sheetName === S.matriz), b = envios.find((p) => p.sheetName === S.bitacora);
    expect([valor(m, 'Lote'), valor(m, 'Estado')]).toEqual(['L20', 'Muerto']);
    expect([valor(b, 'Sala'), valor(b, 'Tanque')], 'la Bitácora lleva la ubicación de la ELEGIDA').toEqual(['S3', 'T4']);
    expect(document.querySelector('#repro-report .repro-elegir'), 'registrada, ya no hay nada que elegir').toBeNull();
  });

  it('🔴 sin marcar ninguna no se envía nada, y se dice', async () => {
    H.setLecturas({ [S.matriz]: [VIVA_A, VIVA_B], [S.bitacora]: [], [S.transfer]: [] });
    await procesarEvento('Desove');
    await pulsar('repro-report');
    expect(envios).toHaveLength(0);
    expect(avisos[avisos.length - 1].msg).toContain('Marca de qué hembra');
  });

  it('🔴 el botón sólo vale para el pendiente del que se PINTÓ', async () => {
    /* La carrera real: un traslado que termina de leer sus hojas con el técnico ya en Eventos reemplaza el pendiente
       sin repintar ese informe. Aquí el reemplazo lo hace un segundo proceso: el botón del primero (una MORTALIDAD)
       no puede acabar registrando lo del segundo (un DESOVE). */
    H.setLecturas({ [S.matriz]: [VIVA_A, VIVA_B], [S.bitacora]: [], [S.transfer]: [] });
    await procesarEvento('Mortalidad');
    const vieja = marcaDe('repro-report');
    await procesarEvento('Desove');
    radio('repro-report', 'L20').checked = true;
    await H.madReproRegistrarElegidas(vieja);
    expect(envios, 'el botón viejo no registra nada').toHaveLength(0);
    expect(avisos[avisos.length - 1].msg).toContain('ya no está vigente');
    await pulsar('repro-report');                                              // control: el de ahora sí registra
    expect(valor(envios.find((p) => p.sheetName === S.bitacora), 'Tipo')).toBe('Desove');
  });

  it('🔴 se registra la hembra que se VIO, aunque la MATRIZ se relea en otro orden', async () => {
    H.setLecturas({ [S.matriz]: [VIVA_A, VIVA_B], [S.bitacora]: [], [S.transfer]: [] });
    await procesarEvento('Mortalidad');
    radio('repro-report', 'L20').checked = true;                              // la A, pintada la PRIMERA
    H.setLecturas({ [S.matriz]: [VIVA_B, VIVA_A], [S.bitacora]: [], [S.transfer]: [] });   // relectura: B primero
    await pulsar('repro-report');
    expect(valor(envios.find((p) => p.sheetName === S.matriz), 'Lote'), 'muere la que se marcó, no la que quedó primera').toBe('L20');
  });

  it('🔴 traslado: no mueve a la vigente; al elegir mueve ESA, con el mismo TR-ID y sólo ese chip', async () => {
    H.setLecturas({ [S.matriz]: [VIVA_A, VIVA_B, VIVA], [S.bitacora]: [], [S.transfer]: [{ 'TR-ID': 'TR-000007', 'Trovan ID': 'X' }] });
    caja('rc-transfer').innerHTML = H._reproTransferHTML();
    document.getElementById('repro-t-fecha').value = '2026-09-12';
    document.getElementById('repro-t-osala').value = 'S3';
    document.getElementById('repro-t-otanque').value = 'T4';
    document.querySelector('#repro-t-dests .repro-dest-sala').value = 'S6';
    document.querySelector('#repro-t-dests .repro-dest-tanque').value = 'T2';
    document.querySelector('#repro-t-dests .repro-dest-codes').value = CHIP;
    await H.madReproTransfer();
    expect(envios, 'D17 también en el traslado: no se movió a la vigente').toHaveLength(0);
    radio('repro-t-report', 'L20').checked = true;
    await pulsar('repro-t-report');
    const m = envios.find((p) => p.sheetName === S.matriz), t = envios.find((p) => p.sheetName === S.transfer);
    expect([valor(m, 'Lote'), valor(m, 'Sala actual'), valor(m, 'Tanque actual')]).toEqual(['L20', 'S6', 'T2']);
    expect([valor(t, 'TR-ID'), valor(t, 'Trovan ID')]).toEqual(['TR-000008', CHIP]);
    expect(t.rows, 'sólo el chip elegido').toHaveLength(1);
  });

  it('🔴 el ALTA avisa de que el chip ya lo lleva una hembra VIVA', async () => {
    H.setLecturas({ [S.matriz]: [VIVA_A], [S.bitacora]: [], [S.transfer]: [] });
    teclearAlta('2026-09-10', [[CHIP, 'P4', 'G09', 'L33', 'S2', 'T8']]);
    await H.madReproAltaBatch();
    expect(envios, 'entra igual: la identidad es la cuaterna').toHaveLength(1);
    /* Dos aserciones y no una: el chip del resumen y el renglón de detalle dicen los dos «hembra VIVA», así que con un
       solo `toContain` se podía apagar cualquiera de los dos y la prueba seguía en verde (lo mismo que cazó E07/E10). */
    expect(informeAlta()).toContain('con el chip de una hembra VIVA');          // el chip del resumen
    expect(informeAlta()).toContain('te pedirá elegir de cuál es');            // el renglón de detalle
  });
});

/* 🔴 1a (2026-09-21) · EL CHIP RECICLADO VA A LA HEMBRA NUEVA AUNQUE LA COPIA EN USO SEA DE ANTES DE SU ALTA.
   Lo reportó el usuario: «si registro algún microchip reciclado para otro lote, piscina y código, no lo permite porque
   ya da por muerto». Medido con la librería real: con una MATRIZ anterior al alta de la nueva, el desove salía «ya
   muerta» y la mortalidad —peor— marcaba OTRA VEZ a la anterior, con su ubicación vieja, y dejaba viva a la nueva sin un
   aviso. En producción la copia vieja es el store del tablero (se recarga cada minuto, pero no mientras se teclea), lo
   leído antes en la sesión o la copia local. Decisión del usuario: confirmar con la hoja SÓLO cuando hay dudas. */
describe('🔴 1a · el chip reciclado va a la hembra NUEVA aunque la copia en uso sea anterior a su alta', () => {
  const FRESCA = [VIEJA, NUEVA];
  const hoja = (filas) => (url) => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true,
    rows: decodeURIComponent(url).includes('MATRIZ') ? filas : [] }) });
  const googleCaido = () => { throw new Error('Failed to fetch'); };
  const lecturasMatriz = () => pedidas.filter((u) => u.includes('p=rows') && decodeURIComponent(u).includes('MATRIZ')).length;
  const evento = async (tipo, fecha = '2026-09-10', codes = CHIP) => {
    caja('rc-eventos').innerHTML = H._reproEventosHTML();
    document.getElementById('repro-fecha').value = fecha;
    document.getElementById('repro-tipo').value = tipo;
    document.getElementById('repro-codes').value = codes;
    await H.madReproProcess();
    return document.getElementById('repro-report').textContent;
  };
  const traslado = async (oSala, oTanque) => {
    caja('rc-transfer').innerHTML = H._reproTransferHTML();
    document.getElementById('repro-t-fecha').value = '2026-09-12';
    document.getElementById('repro-t-osala').value = oSala;
    document.getElementById('repro-t-otanque').value = oTanque;
    document.querySelector('#repro-t-dests .repro-dest-sala').value = 'S9';
    document.querySelector('#repro-t-dests .repro-dest-tanque').value = 'T9';
    document.querySelector('#repro-t-dests .repro-dest-codes').value = CHIP;
    await H.madReproTransfer();
    return document.getElementById('repro-t-report').textContent;
  };
  const bitacora = () => envios.find((p) => p.sheetName === S.bitacora);
  const matriz = () => envios.find((p) => p.sheetName === S.matriz);
  const celda = (p, h) => p.rows[0][p.headers.indexOf(h)];
  beforeEach(() => {
    localStorage.removeItem('larv4_mad_matriz');
    window.__rgLib.reproStoreVersion = undefined;
    H.setLecturas({ [S.matriz]: [VIEJA], [S.bitacora]: [], [S.transfer]: [] });   // la copia en uso NO sabe de la nueva
  });

  it('🔴 desove: se confirma con la hoja y va a la NUEVA, con su ubicación (antes: «ya muerta»)', async () => {
    lecturaRows = hoja(FRESCA);
    const inf = await evento('Desove');
    expect(lecturasMatriz()).toBe(1);
    expect(bitacora().rows.map((r) => [r[0], r[3], r[4]])).toEqual([[CHIP, 'S3', 'T4']]);
    expect(inf).not.toContain('ya muerta');
  });

  it('🔴 mortalidad: marca muerta a la NUEVA, no otra vez a la anterior', async () => {
    lecturaRows = hoja(FRESCA);
    await evento('Mortalidad');
    const m = matriz();
    expect([celda(m, 'Piscina'), celda(m, 'Código genético'), celda(m, 'Lote'), celda(m, 'Estado')]).toEqual(['P9', 'G07', 'L20', 'Muerto']);
    expect(celda(bitacora(), 'Sala')).toBe('S3');
  });

  it('🔴 un chip NUEVO (no reciclado) dado de alta después de la copia tampoco sale «no está en la MATRIZ»', async () => {
    const OTRO = { 'Trovan ID': '000721BBB1', 'Piscina': 'P3', 'Código genético': 'G03', 'Lote': 'L30', 'Sala actual': 'S2',
      'Tanque actual': 'T5', 'Estado': 'Vivo', 'Fecha ingreso': '2026-09-01' };
    lecturaRows = hoja([VIEJA, OTRO]);
    const inf = await evento('Desove', '2026-09-10', '000721BBB1');
    expect(lecturasMatriz()).toBe(1);
    expect(bitacora().rows[0][3]).toBe('S2');
    expect(inf).not.toContain('no está(n) en la MATRIZ');
  });

  it('sin dudas no se relee nada: un lote que la copia ya resuelve no paga ninguna lectura', async () => {
    H.setLecturas({ [S.matriz]: FRESCA, [S.bitacora]: [], [S.transfer]: [] });
    lecturaRows = googleCaido;                     // si leyera, fallaría
    const inf = await evento('Desove');
    expect(lecturasMatriz()).toBe(0);
    expect(bitacora().rows[0][3]).toBe('S3');
    expect(inf).not.toContain('sin confirmar');
  });

  it('🔴 con Google caído no se confirma: el desove no sale, y el informe dice «sin confirmar», no «ya muerta»', async () => {
    lecturaRows = googleCaido;
    const inf = await evento('Desove');
    expect(envios).toHaveLength(0);
    /* Dos aserciones: la etiqueta del resumen y el renglón de detalle lo dicen los dos, y con una sola se podía apagar
       cualquiera de ellos (la lección de E07/E10 de este mismo banco). */
    expect(inf).toContain('sin confirmar con la hoja');
    expect(inf).toContain('Sin confirmar con «Maduración MATRIZ»');
    expect(inf).toContain('cuando Google responda: ' + CHIP);
    expect(inf).not.toContain('ya muerta');
  }, 15000);

  it('🔴 con Google caído, una mortalidad NO se manda a la hembra muerta de la copia', async () => {
    lecturaRows = googleCaido;
    const inf = await evento('Mortalidad');
    expect(envios).toHaveLength(0);                // antes: una fila para la anterior (L12) y su ubicación vieja
    expect(inf).toContain('sin confirmar');
  }, 15000);

  it('una muerta DE VERDAD (la hoja lo confirma) sigue siendo «ya muerta», tras una sola lectura', async () => {
    lecturaRows = hoja([VIEJA]);
    const inf = await evento('Desove');
    expect(lecturasMatriz()).toBe(1);
    expect(envios).toHaveLength(0);
    expect(inf).toContain('ya muerta');
    expect(inf).not.toContain('sin confirmar');
  });

  it('lo confirmado hace nada no se vuelve a leer… salvo que la MATRIZ haya cambiado después', async () => {
    lecturaRows = hoja([VIEJA]);
    await evento('Desove');
    await evento('Desove');
    expect(lecturasMatriz()).toBe(1);             // la duda que queda es de verdad
    teclearAlta('2026-09-11', [[CHIP, 'P5', 'G05', 'L55', 'S4', 'T2']]);
    await H.madReproAltaBatch();                  // una hembra NUEVA con ese chip
    lecturaRows = hoja([VIEJA, { ...NUEVA, 'Piscina': 'P5', 'Código genético': 'G05', 'Lote': 'L55', 'Sala actual': 'S4', 'Tanque actual': 'T2' }]);
    envios.length = 0;
    await evento('Desove', '2026-09-12');
    expect(lecturasMatriz()).toBe(2);             // el alta invalida la lectura anterior
    expect(bitacora().rows[0][3]).toBe('S4');
  });

  it('🔴 MCP: con el store del tablero anterior al alta, manda lo leído de la hoja… hasta que el tablero se recarga', async () => {
    const V1 = { version: 1 }, V2 = { version: 2 };
    let version = V1, delStore = [VIEJA];
    window.__rgLib.reproReadSheet = (h) => (h === S.matriz ? delStore : []);
    window.__rgLib.reproStoreVersion = () => version;
    lecturaRows = hoja(FRESCA);
    await evento('Desove');
    expect(lecturasMatriz()).toBe(1);
    expect(bitacora().rows[0][3]).toBe('S3');
    envios.length = 0;
    await evento('Desove', '2026-09-11');         // sin dudas ya: manda lo leído, no el store viejo
    expect(lecturasMatriz()).toBe(1);
    expect(bitacora().rows[0][3]).toBe('S3');
    version = V2;                                 // el tablero se recarga, ya con la nueva (y movida)
    delStore = [VIEJA, { ...NUEVA, 'Sala actual': 'S8' }];
    envios.length = 0;
    await evento('Desove', '2026-09-12');
    expect(bitacora().rows[0][3]).toBe('S8');     // vuelve a mandar el store
    expect(lecturasMatriz()).toBe(1);
  });

  it('la confirmación LEE aunque la Consulta esté cargando (y no pida la MATRIZ: el store del tablero ya la trae)', async () => {
    window.__rgLib.reproReadSheet = (h) => (h === S.matriz ? [VIEJA] : []);
    window.__rgLib.reproStoreVersion = () => 'v1';
    lecturaRows = hoja(FRESCA);
    const carga = H._reproLoadSheets(true);      // la Consulta, EN VUELO
    await evento('Desove');
    await carga;
    expect(lecturasMatriz()).toBe(1);
    expect(bitacora().rows[0][3]).toBe('S3');
  });

  it('🔴 traslado: la copia vieja no conoce a la nueva; se confirma y se mueve a la NUEVA', async () => {
    lecturaRows = hoja(FRESCA);
    await traslado('S3', 'T4');
    const m = matriz();
    expect([celda(m, 'Piscina'), celda(m, 'Código genético'), celda(m, 'Lote'), celda(m, 'Sala actual')]).toEqual(['P9', 'G07', 'L20', 'S9']);
  });

  it('un chip con DOS vivas no es una duda: no se relee ni sale «sin confirmar» (se le pide elegir, R5)', async () => {
    const OTRA = { ...NUEVA, 'Piscina': 'P6', 'Código genético': 'G06', 'Lote': 'L66', 'Sala actual': 'S7', 'Tanque actual': 'T7' };
    H.setLecturas({ [S.matriz]: [NUEVA, OTRA], [S.bitacora]: [], [S.transfer]: [] });
    lecturaRows = googleCaido;                     // si leyera, fallaría y lo diría
    const inf = await traslado('S3', 'T4');       // el origen de UNA de las dos: la «vigente» puede ser la otra
    expect(lecturasMatriz()).toBe(0);
    expect(inf).not.toContain('sin confirmar');
    expect(inf).toContain('DOS hembras vivas');
  });

  it('🔴 traslado con Google caído: no se mueve a la hembra que la copia da por muerta', async () => {
    lecturaRows = googleCaido;
    const inf = await traslado('S1', 'T1');       // el origen de la ANTERIOR: sin el arreglo, la movía a ella
    expect(envios).toHaveLength(0);
    expect(inf).toContain('sin confirmar con la hoja');
    expect(inf).toContain('Sin confirmar con «Maduración MATRIZ»');
    expect(inf).toContain('cuando Google responda: ' + CHIP);
  }, 15000);
});
