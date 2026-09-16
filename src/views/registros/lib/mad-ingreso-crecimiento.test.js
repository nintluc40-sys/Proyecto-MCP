// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · INGRESO · «Crecimiento semanal promedio» y «Libras por hectárea promedio»
   (pedido del usuario, 2026-09-13) — y por qué el envío pregunta antes al GAS

   1 · EL FORMULARIO. «Camarones por m²» desaparece; en su sitio va «Crecimiento semanal
       promedio» y a su lado «Libras por hectárea promedio». Son referenciales de la
       camaronera, como Supervivencia y Densidad: se teclean por composición y viajan en cada
       fila de ella.

   2 · 🔴🔴 EL RIESGO QUE ESTE CAMBIO TRAE, Y SU PROTECCIÓN. «Maduración Ingreso» se escribe POR
       POSICIÓN y ya tiene filas (medido el 2026-09-13: 6 filas, 17 columnas). Con la columna
       nueva el payload pasa a 18 y Densidad, Agua e ID se corren un sitio. Contra el GAS NUEVO
       no hay peligro: su guarda de esquema (V3) rechaza un envío cuyas cabeceras no casan con
       la hoja y no escribe nada. Pero el GAS PUBLICADO HOY es el anterior, sin guarda: un
       ingreso enviado contra él escribiría el crecimiento en «Camarones por m2», las libras en
       «Densidad», la densidad en «Agua»… y el ID fuera de su columna, rompiendo la llave.
       Por eso, SÓLO para esta hoja, el cliente pregunta al GAS por `?p=ver` antes de enviar:
         · responde con su sello (JSON)        → es el GAS nuevo, con guarda: se envía;
         · responde el texto «FichasLarv-OK»   → es el GAS viejo: NO se envía y lo tecleado se queda;
         · no responde (sin señal)            → no se sabe: sigue el camino de siempre (cola).
       Y la COLA hace la misma pregunta antes de entregar un ingreso guardado sin señal: si el
       GAS sigue siendo el viejo, el envío espera en la cola en vez de escribir desalineado.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_INGRESO_HEADERS } from './ficha-maduracion-ingreso.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadIngreso', 'madIngReiniciar', 'madIngCollect', 'buildMadIngresoPayload',
  'madIngGuardar', 'flushSyncQueue', '_madIngGasAlDia', 'MAD_ING_SHEET', '_madIngRepHTML',
  /* 2026-09-16 · el sello que lleva ESTA app. Desde que el portón lo compara, un fixture con un
     sello inventado ya no significa «GAS al día»: significa «otro GAS». */
  '_gasVersionLocal'];
const H = {};
const avisos = [];
const envios = [];
let respuestaVer = null;       // lo que contesta ?p=ver: string (texto), objeto (JSON) o 'red' (falla)

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

  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    /* 2026-09-16 · para poder ejercer el camino «no se pudo leer el sello local». Las dos viven en
       el EPÍLOGO del arnés, no en el motor: el código de producción no gana superficie por esto. */
    + '\ntry{ H.setGas=function(f){GAS=f;}; H.gasOriginal=GAS; }catch(_){}'
    + '\ntry{ H.olvidarSelloLocal=function(){_gasVerLocalCache=null;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPost(async (payload) => { envios.push(payload); return true; });
  H.setPostOnce(async (body) => { envios.push(body); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    if (respuestaVer === 'red') throw new Error('sin red');
    const cuerpo = typeof respuestaVer === 'string' ? respuestaVer : JSON.stringify(respuestaVer);
    return { ok: true, status: 200, text: async () => cuerpo };
  };
});

beforeEach(() => {
  avisos.length = 0;
  envios.length = 0;
  respuestaVer = { ok: true, version: H._gasVersionLocal() };   // el GAS desplegado ES el de esta app
  H.madIngReiniciar();
});

const q = (s) => document.querySelector('#fp-ingreso ' + s);
const llenarIngreso = () => {
  document.getElementById('mi-fecha').value = '2026-09-13';
  document.getElementById('mi-lote').value = 'BP';
  q('.mi-cg').value = 'OLF5.F2';
  q('.mi-tmachos').value = '10';
  q('.mi-thembras').value = '10';
  q('.mi-crec').value = '1.8';
  q('.mi-lbha').value = '2450';
  /* ⚠ happy-dom descarta un <tr> insertado con insertAdjacentHTML sobre un <tbody> (el navegador
     no); se parsea la fila REAL del motor dentro de una tabla y se mueve a su sitio. */
  const t = document.createElement('table');
  t.innerHTML = '<tbody>' + H._madIngRepHTML('Sala 4', 1) + '</tbody>';
  q('.mi-reps').appendChild(t.querySelector('tr'));
  q('tr.mi-rep .mi-machos').value = '10';
  q('tr.mi-rep .mi-hembras').value = '10';
};
const col = (h) => MAD_INGRESO_HEADERS.indexOf(h);

describe('Ingreso · los campos de la camaronera', () => {
  it('🔴 «Camarones por m²» ya no está en el formulario', () => {
    expect(q('.mi-cm2')).toBeNull();
    expect(document.getElementById('fp-ingreso').textContent).not.toContain('Camarones por m');
  });

  it('🔴 están «Crecimiento semanal promedio» y «Libras por hectárea promedio», numéricos', () => {
    const txt = document.getElementById('fp-ingreso').textContent;
    expect(txt).toContain('Crecimiento semanal promedio');
    expect(txt).toContain('Libras por hectárea promedio');
    expect(q('.mi-crec').getAttribute('type')).toBe('number');
    expect(q('.mi-lbha').getAttribute('type')).toBe('number');
  });

  it('🔴 el viaje: lo tecleado sale bajo SU cabecera en cada fila', () => {
    llenarIngreso();
    const p = H.buildMadIngresoPayload(H.madIngCollect());
    expect(p.headers).toEqual(MAD_INGRESO_HEADERS);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0][col('Crecimiento semanal promedio')]).toBe(1.8);
    expect(p.rows[0][col('Libras por hectárea promedio')]).toBe(2450);
    expect(p.rows[0][col('ID')]).toBe('2026-09-13-BP-OLF5.F2-S4-t1');
  });
});

describe('Ingreso · no se escribe contra el GAS viejo (hoja por posición)', () => {
  /* 🔴 2026-09-16 · ESTA PRUEBA FIJABA EL DEFECTO. Decía «distingue los tres casos» y daba por
     bueno `{version:'abc123def456'}`, o sea CUALQUIER sello: el portón sólo medía «¿contesta?».
     Con el GAS ya desplegado y Pages por detrás, era justo el cliente viejo el que se creía al día.
     Ahora son CUATRO casos, y el que faltaba —contesta, pero es OTRO GAS— es el que importa. */
  it('🔴 la pregunta al GAS distingue los CUATRO casos: el sello tiene que ser el de ESTA app', async () => {
    const sello = H._gasVersionLocal();
    expect(sello, 'sin sello local el fixture no prueba nada').toMatch(/^[0-9a-f]{12}$/);

    respuestaVer = { ok: true, version: sello };
    expect(await H._madIngGasAlDia(), 'el sello de esta app').toBe(true);
    respuestaVer = { ok: true, version: 'abc123def456' };
    expect(await H._madIngGasAlDia(), 'contesta, pero es OTRO GAS').toBe(false);
    respuestaVer = 'FichasLarv-OK';
    expect(await H._madIngGasAlDia(), 'GAS anterior a la prueba de versión').toBe(false);
    respuestaVer = 'red';
    expect(await H._madIngGasAlDia(), 'no contesta: no se sabe').toBe(null);
  });

  /* 🔑 El camino de escape, y por qué existe: si esta app no pudiera leer SU PROPIO sello, exigir
     que el desplegado coincida dejaría a TODOS sin enviar por un fallo interno del cliente. Se
     vuelve entonces al comportamiento anterior —basta con que el GAS conteste—, que es peor que
     comparar pero mucho mejor que parar el trabajo de campo. */
  it('🔑 si el sello local no se pudiera leer, se sigue como antes en vez de bloquear a todos', async () => {
    try {
      H.setGas(() => 'una plantilla sin la línea del sello');
      H.olvidarSelloLocal();
      expect(H._gasVersionLocal()).toBe('');
      respuestaVer = { ok: true, version: 'cualquier-otro' };
      expect(await H._madIngGasAlDia()).toBe(true);
    } finally {
      H.setGas(H.gasOriginal);
      H.olvidarSelloLocal();
    }
    // y al recuperar el sello vuelve a distinguir: el escape no se queda pegado
    respuestaVer = { ok: true, version: 'cualquier-otro' };
    expect(await H._madIngGasAlDia()).toBe(false);
  });

  it('el fixture ejerce algo: con el GAS nuevo el ingreso SE ENVÍA', async () => {
    llenarIngreso();
    await H.madIngGuardar();
    expect(envios).toHaveLength(1);
    expect(envios[0].sheetName).toBe(H.MAD_ING_SHEET);
  });

  it('🔴 con el GAS VIEJO no se envía, se dice por qué y lo tecleado se queda', async () => {
    llenarIngreso();
    respuestaVer = 'FichasLarv-OK';
    await H.madIngGuardar();
    expect(envios).toHaveLength(0);
    const err = avisos.find((a) => a.tipo === 'err');
    expect(err && err.msg).toMatch(/GAS/);
    expect(q('.mi-crec').value).toBe('1.8');
    expect(document.getElementById('mi-lote').value).toBe('BP');
  });

  it('sin respuesta del GAS (sin señal) sigue el camino de siempre: se intenta y, si hace falta, se encola', async () => {
    llenarIngreso();
    respuestaVer = 'red';
    await H.madIngGuardar();
    expect(envios).toHaveLength(1);
  });
});

describe('Ingreso · la cola tampoco entrega un ingreso al GAS viejo', () => {
  const encolar = (sheetName) => localStorage.setItem('larv4_syncqueue', JSON.stringify([
    { ts: Date.now(), url: 'https://script.google.com/macros/s/AKfycbPRUEBA/exec', payload: { sheetName, headers: ['A'], rows: [['x']] } },
  ]));
  const cola = () => JSON.parse(localStorage.getItem('larv4_syncqueue') || '[]');

  it('el fixture ejerce algo: con el GAS nuevo la cola entrega el ingreso', async () => {
    encolar(H.MAD_ING_SHEET);
    await H.flushSyncQueue();
    expect(envios).toHaveLength(1);
    expect(cola()).toHaveLength(0);
  });

  it('🔴 con el GAS VIEJO el ingreso ESPERA en la cola, sin enviarse', async () => {
    encolar(H.MAD_ING_SHEET);
    respuestaVer = 'FichasLarv-OK';
    await H.flushSyncQueue();
    expect(envios).toHaveLength(0);
    expect(cola()).toHaveLength(1);
    expect(avisos.some((a) => /cola/i.test(a.msg))).toBe(true);
  });

  it('las demás hojas no preguntan nada: se entregan como siempre', async () => {
    encolar('Datos Larvicultura');
    respuestaVer = 'FichasLarv-OK';
    await H.flushSyncQueue();
    expect(envios).toHaveLength(1);
  });
});
