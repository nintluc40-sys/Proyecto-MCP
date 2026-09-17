// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · «Registrado desde este dispositivo»: EL ESTADO DE UN ENVÍO ES EL SUYO (PE1.2, 2026-09-16)

   Lo reportó el usuario: «se quedan en cola o no se sincronizan». Medido en el código: los siete registros de
   las fichas de Maduración decidían «📶 en cola» / «✅ enviado» mirando si la cola GLOBAL tenía algo.
     · Con un solo envío atascado en la cola —un Ingreso contra su cabecera vieja, por ejemplo—, TODOS los de
       TODAS las fichas seguían «en cola», aunque hubieran llegado.
     · Y cuando la cola se vaciaba porque un envío CADUCÓ (24 h) o la hoja lo RECHAZÓ, se pintaba «✅ enviado»
       sin haber llegado nunca a la hoja. Ése es el peor de los dos: miente a favor.
   Ahora cada envío viaja con su MARCA y el registro deduce el estado de SU envío. Se ejerce con Tratamientos y
   Movimientos arrancando el monolito entero; el cableado de las siete, con su fuente.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madTratReiniciar', 'madTratGuardar', 'madTratEstadoChange', 'madTratAreaChange', 'madTratAddDes', 'MAD_TRAT_SHEET',
  'madTratLogHTML', 'madTratLogLeer', 'MAD_TRAT_LOG_KEY', 'flushSyncQueue', '_gasVersionLocal',
  'madMovReiniciar', 'madMovGuardar', 'madMovSalaChange', 'madMovLogHTML', 'MAD_MOV_LOG_KEY'];
const H = {};
const envios = [];
let respuestaVer = null;
let respuestaPost = () => 'ok';

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
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  /* Se sustituye el POST de UN intento (no postPayload): así la marca viaja por la cañería real —encolar,
     vaciar, reconciliar— y sólo la red es de mentira. */
  H.setPostOnce(async (body, url, info) => {
    envios.push(body);
    const r = respuestaPost(body);
    if (info && r === 'rejected') info.message = 'Error en datos';
    return r;
  });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    if (respuestaVer === 'red') throw new Error('sin red');
    return { ok: true, status: 200, text: async () => JSON.stringify(respuestaVer) };
  };
});

const cola = () => JSON.parse(localStorage.getItem('larv4_syncqueue') || '[]');
const ponCola = (q) => localStorage.setItem('larv4_syncqueue', JSON.stringify(q));
const estados = (html) => {
  const caja = document.createElement('div');
  caja.innerHTML = html;
  return [...caja.querySelectorAll('tbody tr td:last-child')].map((td) => td.textContent.trim());
};
const q = (s) => document.querySelector('#fp-tratamientos ' + s);
const pon = (el, v) => { el.value = v; return el; };
const llenarTrat = () => {
  pon(q('#mt-fecha'), '2026-09-15');
  pon(q('#mt-sala'), 'Sala 4');
  H.madTratEstadoChange(pon(q('#mt-estado'), 'Producción'));
  pon(q('#mt-prevs .mt-lotes'), 'BP');
};
const AJENO = { ts: Date.now(), url: 'https://script.google.com/macros/s/AKfycbPRUEBA/exec', payload: { sheetName: 'Datos Larvicultura', headers: ['A'], rows: [['x']] } };
/* Un tratamiento que queda EN COLA sin salir: con ?p=ver mudo, PV3 lo encola con su marca y no lo envía. */
const tratEnCola = async () => {
  llenarTrat();
  respuestaVer = 'red';
  await H.madTratGuardar();
  respuestaVer = { ok: true, version: H._gasVersionLocal() };
};

beforeEach(() => {
  envios.length = 0;
  respuestaPost = () => 'ok';
  localStorage.removeItem('larv4_syncqueue');
  localStorage.removeItem(H.MAD_TRAT_LOG_KEY);
  localStorage.removeItem(H.MAD_MOV_LOG_KEY);
  respuestaVer = { ok: true, version: H._gasVersionLocal() };
  H.madTratReiniciar();
});

describe('Registro de envíos · cada entrada dice el estado de SU envío', () => {
  it('el fixture ejerce algo: el envío en cola lleva la marca de su entrada y el registro dice «en cola»', async () => {
    await tratEnCola();
    const [entrada] = H.madTratLogLeer();
    expect(entrada.estado).toBe('cola');
    expect(entrada.marca).toBe(true);
    expect(cola()).toHaveLength(1);
    expect(cola()[0].mark).toEqual({ kind: 'madlog:tratamientos', keys: [entrada.id] });
    expect(estados(H.madTratLogHTML())).toEqual(['📶 en cola']);
  });

  it('🔴 entregado desde la cola pasa a «enviado» AUNQUE quede otro envío AJENO atascado en la cola', async () => {
    await tratEnCola();
    ponCola(cola().concat([AJENO]));
    respuestaPost = (b) => (b.sheetName === 'Datos Larvicultura' ? 'retry' : 'ok');   // el ajeno sigue atascado
    await H.flushSyncQueue();
    expect(cola().map((it) => it.payload.sheetName)).toEqual(['Datos Larvicultura']);
    expect(H.madTratLogLeer()[0].estado).toBe('ok');
    expect(estados(H.madTratLogHTML())).toEqual(['✅ enviado']);
    // Y el registro que está A LA VISTA se repinta solo: no hace falta salir y volver a la pestaña.
    expect(document.getElementById('mt-log').textContent).toContain('✅ enviado');
    expect(document.getElementById('mt-log').textContent).not.toContain('en cola');
  });

  it('🔴 si CADUCA en la cola (24 h) dice «no llegó», NO «enviado» (antes mentía a favor)', async () => {
    await tratEnCola();
    ponCola(cola().map((it) => ({ ...it, ts: Date.now() - 25 * 3600e3 })));
    await H.flushSyncQueue();
    expect(cola()).toHaveLength(0);
    expect(envios).toHaveLength(0);
    expect(estados(H.madTratLogHTML())).toEqual(['⚠ no llegó']);
  });

  it('🔴 si la hoja lo RECHAZA por los datos, «no llegó»', async () => {
    await tratEnCola();
    respuestaPost = () => 'rejected';
    await H.flushSyncQueue();
    expect(envios).toHaveLength(1);
    expect(cola()).toHaveLength(0);
    expect(estados(H.madTratLogHTML())).toEqual(['⚠ no llegó']);
  });

  it('🔴 el mismo tratamiento guardado DOS veces mientras espera: se entrega una vez y las dos entradas lo saben', async () => {
    await tratEnCola();
    await tratEnCola();                                    // idéntico: misma huella, no se encola otra vez
    expect(cola()).toHaveLength(1);
    const ids = H.madTratLogLeer().map((e) => e.id);
    expect(ids).toHaveLength(2);
    expect(cola()[0].mark.keys).toEqual(ids);
    await H.flushSyncQueue();
    expect(envios).toHaveLength(1);
    expect(estados(H.madTratLogHTML())).toEqual(['✅ enviado', '✅ enviado']);
  });

  it('las entradas de ANTES (sin marca) conservan el criterio viejo: no se inventa nada sobre ellas', () => {
    localStorage.setItem(H.MAD_TRAT_LOG_KEY, JSON.stringify([{ ts: Date.now(), fecha: '2026-09-10', filas: 2, estado: 'cola' }]));
    ponCola([AJENO]);
    expect(estados(H.madTratLogHTML())).toEqual(['📶 en cola']);
    ponCola([]);
    expect(estados(H.madTratLogHTML())).toEqual(['✅ enviado']);
  });

  it('🔴 Movimientos (que no pregunta el sello): un envío que falla por red queda en cola CON su marca', async () => {
    H.madMovReiniciar();
    const f = document.querySelector('#fp-movimientos #mv-tramos tr.mv-tramo');
    H.madMovSalaChange(pon(f.querySelector('.mv-so'), 'Sala 1')); pon(f.querySelector('.mv-to'), '1');
    H.madMovSalaChange(pon(f.querySelector('.mv-sd'), 'Sala 2')); pon(f.querySelector('.mv-td'), '16');
    pon(f.querySelector('.mv-machos'), '5'); pon(f.querySelector('.mv-hembras'), '5');
    respuestaPost = () => 'retry';
    await H.madMovGuardar();
    const l = JSON.parse(localStorage.getItem(H.MAD_MOV_LOG_KEY) || '[]');
    expect(l.map((e) => e.estado)).toEqual(['cola']);
    expect(cola()[0].mark).toEqual({ kind: 'madlog:movimientos', keys: [l[0].id] });
    expect(estados(H.madMovLogHTML())).toEqual(['📶 en cola']);
    // La nota cuenta los envíos de ESTA ficha, no los de la cola entera.
    ponCola(cola().concat([AJENO]));
    expect(H.madMovLogHTML()).toContain('📶 1 envío(s) de esta ficha en cola');
    /* Y si caduca, «no llegó»: en este registro la reconciliación barata («cola vacía = todo llegó») sigue viva para
       las entradas de ANTES, y no puede tragarse las nuevas. */
    ponCola([]);
    expect(estados(H.madMovLogHTML())).toEqual(['⚠ no llegó']);
    expect(JSON.parse(localStorage.getItem(H.MAD_MOV_LOG_KEY))[0].estado, 'la reconciliación barata la dio por llegada').toBe('cola');
  });
});

describe('Registro de envíos · las siete fichas están cableadas', () => {
  const src = readFileSync(ENGINE, 'utf8');
  const FICHAS = [['ingreso', 'Ing'], ['movimientos', 'Mov'], ['desoves', 'Des'], ['fin', 'Fin'], ['tratamientos', 'Trat'], ['mortdes', 'Mort'], ['alimentacion', 'Alim']];
  it.each(FICHAS)('%s manda su marca, reconcilia su lista y pinta el estado de SU envío', (ficha, pre) => {
    expect(src).toContain('_t={ mark:_madLogMarca("' + ficha + '", _envio) }');
    expect(src).toContain('ficha==="' + ficha + '" ? [mad' + pre + 'LogLeer, mad' + pre + 'LogGuardar, mad' + pre + 'LogHTML,');
    expect(src).toContain('_madLogEstado("' + ficha + '", e');
    expect(src, 'anota sin el id de su envío').toMatch(new RegExp('mad' + pre + 'LogAnota\\([^;]*"ok"[^;]*_envio\\)'));
  });
  it('ningún registro vuelve a decidir por la cola global', () => {
    expect(src).not.toMatch(/const st=\(e\.estado==="cola" && enCola\)/);
    expect(src).not.toMatch(/if\(e\.estado==="cola"\)\{ e\.estado="ok"; cambio=true; \}/);
  });
});
