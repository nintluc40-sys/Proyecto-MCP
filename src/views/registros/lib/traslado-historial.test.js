// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · AsT · Historial de traslados (usuario, 2026-09-03)

   «Cada vez que se envíe algún traslado de algún camión (placa), y llegue al
   Google Sheet, salga ahí referenciado, y si uno lo quiere revisar tenga un
   botón para hacerlo.»

   🔑 SE LEE DEL DISPOSITIVO, NO DEL SHEET (decisión del usuario). Medido antes de
   decidir: `?p=rows` sobre Registro_Traslado ya funciona sin tocar el GAS, pero
   trae las 936 filas del histórico y tarda de 2 a 52 s.

   🔑 LO QUE ESTA PRUEBA VIGILA DE VERDAD: que «✅ Llegó al Sheet» dependa de
   `synced`, que lo sella la reconciliación con la respuesta del GAS. Si eso se
   pintara siempre, el historial mentiría justo en lo único que se le pide.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['trasHistHtml', 'trasHistResumen', 'trasHistTtl', 'trasBarraHtml', 'TRAS_TTL'];
const H = {};
const KEY = 'larv4_tras_records';

const rec = (id, placas, synced, edadMs) => ({
  id,
  ts: Date.now() - (edadMs || 0),
  synced: !!synced,
  syncedAt: synced ? Date.now() - (edadMs || 0) : null,
  data: {
    fecha: '2026-09-03', corrida: '585', modulo: 'M03', camaronera: 'Puná 1',
    camiones: placas.map((p) => ({ placa: p, tinasOff: [] })),
    revisiones: [
      { hora: '06:00', lugar: 'Laboratorio', camiones: [{ tinas: { 1: { ox: '6.1' } } }] },
      { hora: '07:30', lugar: 'Peaje 1', camiones: [{ tinas: { 1: { ox: '6.0' } } }] },
    ],
  },
});

beforeAll(async () => {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k), clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
  };
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var G = globalThis.__ENG3;\n'
    + EXPORTAR.map((n) => `try{ G[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\n})();';
  globalThis.__ENG3 = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
});

beforeEach(() => { globalThis.localStorage.clear(); });

describe('el botón vive en la barra del viaje', () => {
  it('«Historial» está, y delante del PDF', () => {
    const barra = H.trasBarraHtml('');
    expect(barra).toContain('trasHistAbrir()');
    expect(barra).toContain('Historial');
    expect(barra.indexOf('trasHistAbrir()')).toBeLessThan(barra.indexOf('downloadTrasladoPDF()'));
  });
});

describe('el historial referencia el camión por su PLACA', () => {
  it('saca las placas de los camiones del viaje', () => {
    localStorage.setItem(KEY, JSON.stringify([rec('v1', ['ABC-1234', 'XYZ-9876'], true)]));
    const html = H.trasHistHtml();
    expect(html).toContain('ABC-1234');
    expect(html).toContain('XYZ-9876');
  });

  it('resume el viaje: camiones, paradas y destino', () => {
    const s = H.trasHistResumen(rec('v1', ['ABC-1234', 'XYZ-9876'], true));
    expect(s.placas).toEqual(['ABC-1234', 'XYZ-9876']);
    expect(s.nCam).toBe(2);
    expect(s.nRev).toBe(2);
    expect(s.camaronera).toBe('Puná 1');
  });
});

describe('🔴 «Llegó al Sheet» sale de `synced`, que lo sella el servidor', () => {
  /* Las dos aserciones van JUNTAS: sola, la primera la aprobaría un historial que
     pintara «llegó» SIEMPRE — que es exactamente la mentira que hay que evitar,
     porque es lo único que el usuario le pide a esta vista. */
  it('el sincronizado lo dice y el pendiente NO', () => {
    /* ⚠ Se cuenta la ETIQUETA (`th-ok`/`th-pend`), no la cadena suelta: el aviso de
       la cabecera explica qué significa «Llegó al Sheet» y contiene esas palabras, así
       que buscar el texto crudo contaba de más. La clase sólo la pone el item. */
    localStorage.setItem(KEY, JSON.stringify([rec('v1', ['ABC-1234'], true)]));
    expect(H.trasHistHtml()).toContain('th-tag th-ok');

    localStorage.setItem(KEY, JSON.stringify([rec('v2', ['ABC-1234'], false)]));
    const pend = H.trasHistHtml();
    expect(pend).not.toContain('th-tag th-ok');
    expect(pend).toContain('th-tag th-pend');
  });

  it('con los dos a la vez, cada uno lleva lo suyo', () => {
    localStorage.setItem(KEY, JSON.stringify([rec('v1', ['AAA-1'], true), rec('v2', ['BBB-2'], false)]));
    const html = H.trasHistHtml();
    expect((html.match(/th-tag th-ok/g) || []).length).toBe(1);
    expect((html.match(/th-tag th-pend/g) || []).length).toBe(1);
    expect(html).toContain('1 con llegada confirmada al Sheet');
  });
});

describe('cada entrada trae su botón de revisar', () => {
  it('hay un botón Revisar por traslado, con su id', () => {
    localStorage.setItem(KEY, JSON.stringify([rec('v1', ['AAA-1'], true), rec('v2', ['BBB-2'], true)]));
    const html = H.trasHistHtml();
    expect(html).toContain('trasHistRevisar("v1")');
    expect(html).toContain('trasHistRevisar("v2")');
    // ⚠ Contar /Revisar/ a secas casaba TAMBIÉN dentro de `trasHistRevisar`: 4, no 2.
    expect((html.match(/🔍 Revisar/g) || []).length).toBe(2);
  });
});

describe('lo que caduca y lo que no', () => {
  it('un registro más viejo que el TTL no sale (lo poda loadTras)', () => {
    const viejo = H.TRAS_TTL + 60000;
    localStorage.setItem(KEY, JSON.stringify([rec('v1', ['AAA-1'], true, viejo), rec('v2', ['BBB-2'], true, 0)]));
    const html = H.trasHistHtml();
    expect(html).not.toContain('AAA-1');
    expect(html).toContain('BBB-2');
  });

  /* ⚠ NO se fija el minuto exacto: `trasHistTtl` llama a `Date.now()` por su cuenta y
     `Math.floor` vuelca en cada frontera, así que un registro recién creado da «48 h 0 min»
     o «47 h 59 min» según pase 1 ms. Esta prueba llegó a ser INTERMITENTE por eso: pasaba
     sola y fallaba con la batería entera cargando la máquina. Se mide el CONTRATO —forma,
     orden y el caso caducado—, que sí es determinista. */
  it('la cuenta atrás tiene forma de cuenta atrás', () => {
    expect(H.trasHistTtl(Date.now())).toMatch(/^caduca en 4[78] h \d+ min$/);
    expect(H.trasHistTtl(Date.now() - 47 * 3600000)).toMatch(/^caduca en \d+ min$|^caduca en 1 h \d+ min$/);
  });

  it('y va MENGUANDO: cuanto más viejo, menos queda', () => {
    const queda = (edadH) => {
      const t = H.trasHistTtl(Date.now() - edadH * 3600000);
      const m = t.match(/(?:(\d+) h )?(\d+) min/);
      return m ? Number(m[1] || 0) * 60 + Number(m[2]) : -1;
    };
    expect(queda(1)).toBeGreaterThan(queda(10));
    expect(queda(10)).toBeGreaterThan(queda(40));
  });

  it('pasado el TTL lo dice, sin números negativos', () => {
    expect(H.trasHistTtl(Date.now() - H.TRAS_TTL)).toBe('caduca ya');
    expect(H.trasHistTtl(Date.now() - H.TRAS_TTL * 3)).toBe('caduca ya');
  });
});

describe('sin nada guardado, lo dice en vez de salir vacío', () => {
  it('mensaje de lista vacía', () => {
    localStorage.setItem(KEY, JSON.stringify([]));
    expect(H.trasHistHtml()).toContain('Todavía no hay traslados guardados');
  });
});
