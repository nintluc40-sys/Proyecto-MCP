// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · INGRESO: EL MISMO DÍA, LOTE, CÓDIGO Y TANQUE, MÁS DE UNA VEZ (pendiente 26, 2026-11-09)

   El defecto: el ID de la fila era fecha + lote + código + sala + tanque, y el GAS escribe esta hoja por ID con merge. Una
   segunda guía del mismo lote y código al mismo tanque, el mismo día, caía en la fila de la primera y le sustituía los
   conteos: el libro perdía esos animales, sin ningún error.

   DECISIÓN DEL USUARIO (no re-preguntar): «Como en Movimientos» (A3, `mad-movimientos-repetidos.test.js`). Cada formulario
   lleva su propia identidad en el ID y, antes de enviar, se avisa si ese lote y código ya tienen otro ingreso ese día en ese
   tanque (en la hoja, en el Historial del equipo o en este mismo envío). Reintentar un envío fallido y corregir desde el
   Historial siguen reemplazando su propia fila; las filas de antes conservan su ID.

   Motor REAL sobre el shell real; la red, la hoja y el `confirm`, simulados. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_INGRESO_HEADERS, ingresoRowId } from './ficha-maduracion-ingreso.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadIngreso', 'madIngReiniciar', 'madIngGuardar', 'madIngGuardarLocal', 'madIngRepetidos', 'madIngRowId',
  'madHistLeer', 'madHistEditar', 'madLocLeer', 'syncAll', '_madIngRepHTML', '_gasVersionLocal', '_lastSyncFingerprint', 'MAD_ING_SHEET'];
const H = {};
const hojaEnviada = [];
const toasts = [];
const preguntas = [];
const red = { respuesta: () => 'ok', hoja: null, confirma: true };

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  window.confirm = (t) => { preguntas.push(String(t)); return red.confirma; };
  globalThis.confirm = window.confirm;
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setHoja=function(f){_madHojaFresca=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m,t){curMod=m;curTab=t;}; H.MAD_MOD=MAD_MOD; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
  H.setRate(() => true);
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setHoja(async () => red.hoja);
  H.setPostOnce(async (body) => {
    const r = red.respuesta(body);
    if (r === 'ok') hojaEnviada.push(JSON.parse(JSON.stringify(body)));
    return r;
  });
  /* El GAS desplegado ES el de esta app (el portón de Ingreso pregunta ?p=ver). */
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
  };
});

const FECHA = '2026-02-10';
const col = (h) => MAD_INGRESO_HEADERS.indexOf(h);
const ids = () => hojaEnviada.flatMap((p) => p.rows.map((f) => f[col('ID')]));
const BASE = ingresoRowId(FECHA, 'AB', 'CG-01', 'Sala 4', 1);

const q = (s) => document.querySelector('#fp-ingreso ' + s);
/* Un ingreso de un lote y código a UN tanque. Valores inventados. */
const llenar = (machos, hembras, { tanque = 1, fecha = FECHA } = {}) => {
  document.getElementById('mi-fecha').value = fecha;
  document.getElementById('mi-lote').value = 'AB';
  q('.mi-cg').value = 'CG-01';
  q('.mi-tmachos').value = String(machos);
  q('.mi-thembras').value = String(hembras);
  /* ⚠ happy-dom descarta un <tr> insertado con insertAdjacentHTML sobre un <tbody>: se parsea la fila REAL del motor. */
  const t = document.createElement('table');
  t.innerHTML = '<tbody>' + H._madIngRepHTML('Sala 4', tanque) + '</tbody>';
  q('.mi-reps').appendChild(t.querySelector('tr'));
  q('tr.mi-rep .mi-machos').value = String(machos);
  q('tr.mi-rep .mi-hembras').value = String(hembras);
};
/* happy-dom no respeta el `selected` de un <select> restaurado por innerHTML; un navegador, sí. */
const editarDelHistorial = (id) => {
  H.madHistEditar(id);
  document.querySelectorAll('#fp-ingreso select').forEach((s) => {
    const o = s.querySelector('option[selected]');
    if (o) s.value = o.value;
  });
};

beforeEach(() => {
  globalThis.localStorage.clear();
  H._lastSyncFingerprint.clear();
  hojaEnviada.length = 0;
  toasts.length = 0;
  preguntas.length = 0;
  red.respuesta = () => 'ok';
  red.hoja = null;
  red.confirma = true;
  H.setMod(H.MAD_MOD, 'ingreso');
  H.madIngReiniciar();
});

describe('Ingreso · la llave lleva la identidad del formulario', () => {
  it('con identidad, la llave de siempre más un sufijo; sin ella (las filas de antes), la de siempre', () => {
    expect(H.madIngRowId(FECHA, 'AB', 'CG-01', 'Sala 4', 1)).toBe(BASE);
    expect(H.madIngRowId(FECHA, 'AB', 'CG-01', 'Sala 4', 1, 'x1y2z3')).toBe(BASE + '-x1y2z3');
  });
});

describe('🔴 el mismo día, lote, código y tanque, dos veces', () => {
  it('🔴 van en dos filas: el segundo ya no reemplaza al primero', async () => {
    llenar(10, 12);
    await H.madIngGuardar();
    llenar(5, 6);
    await H.madIngGuardar();
    expect(hojaEnviada).toHaveLength(2);
    const [a, b] = ids();
    expect(a).not.toBe(b);
    expect(a.startsWith(BASE + '-')).toBe(true);
    expect(b.startsWith(BASE + '-')).toBe(true);
  });

  it('🔴 el segundo pregunta «¿Ingreso REPETIDO?» y dice lo que ya hay', async () => {
    llenar(10, 12);
    await H.madIngGuardar();
    expect(preguntas).toEqual([]);                                     // el primero no pregunta
    llenar(5, 6);
    await H.madIngGuardar();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('¿Ingreso REPETIDO?');
    expect(preguntas[0]).toContain('10 ♂ y 12 ♀ en este equipo');
  });

  it('🔴 «Cancelar» no envía nada y lo tecleado se queda', async () => {
    llenar(10, 12);
    await H.madIngGuardar();
    llenar(5, 6);
    red.confirma = false;
    await H.madIngGuardar();
    expect(hojaEnviada).toHaveLength(1);
    expect(q('tr.mi-rep .mi-machos').value).toBe('5');
    expect(toasts.some((t) => /Ingreso NO enviado/.test(t))).toBe(true);
  });

  it('🔴 lo que ya está en la HOJA también cuenta, aunque sea una fila de antes, sin identidad', async () => {
    red.hoja = [{ ID: BASE, Machos: 7, Hembras: 8 }];
    llenar(5, 6);
    await H.madIngGuardar();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('7 ♂ y 8 ♀ en la hoja');
  });

  it('otro tanque u otro día no preguntan; y el tanque 1 no es el 12', async () => {
    red.hoja = [{ ID: ingresoRowId(FECHA, 'AB', 'CG-01', 'Sala 4', 12) + '-zz9', Machos: 7, Hembras: 8 },
      { ID: ingresoRowId('2026-02-11', 'AB', 'CG-01', 'Sala 4', 1), Machos: 7, Hembras: 8 }];
    llenar(5, 6);
    await H.madIngGuardar();
    expect(preguntas).toEqual([]);
    expect(hojaEnviada).toHaveLength(1);
  });
});

describe('reintentar y corregir siguen reemplazando su propia fila', () => {
  it('🔴 un envío rechazado, reenviado desde el mismo formulario, lleva el MISMO ID y no pregunta por sí mismo', async () => {
    llenar(10, 12);
    red.respuesta = () => 'rejected';
    await H.madIngGuardar();
    const idDelRechazado = q('#mi-envio') && q('#mi-envio').value;
    expect(idDelRechazado).toBeTruthy();
    red.respuesta = () => 'ok';
    await H.madIngGuardar();
    expect(preguntas).toEqual([]);
    expect(ids()).toEqual([BASE + '-' + idDelRechazado]);
  });

  it('🔴 corregir desde 📜 Historial reemplaza su fila (mismo ID) y no pregunta', async () => {
    llenar(10, 12);
    await H.madIngGuardar();
    const [primero] = ids();
    const entrada = H.madHistLeer().find((e) => e.ficha === 'ingreso');
    editarDelHistorial(entrada.id);
    q('tr.mi-rep .mi-machos').value = '11';
    await H.madIngGuardar();
    expect(preguntas).toEqual([]);
    expect(ids()).toEqual([primero, primero]);
  });
});

describe('lo enviado ANTES de este cambio conserva su ID', () => {
  it('🔴 corregir desde 📜 un ingreso de antes (sin identidad) reemplaza su fila de siempre, no crea otra', async () => {
    llenar(10, 12);
    await H.madIngGuardar();
    /* Se convierte lo enviado en un envío «de antes»: su fila con el ID sin sufijo y su copia de ✏️ sin el campo de identidad. */
    const lista = JSON.parse(localStorage.getItem('larv4_mad_hist'));
    const entrada = lista.find((e) => e.ficha === 'ingreso');
    entrada.payload.rows.forEach((r) => { r[col('ID')] = BASE; });
    localStorage.setItem('larv4_mad_hist', JSON.stringify(lista));
    const kPanel = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .find((k) => k !== 'larv4_mad_hist' && k.indexOf(entrada.id) !== -1);   // la copia de ✏️ de esa entrada
    localStorage.setItem(kPanel, localStorage.getItem(kPanel).replace(/<input[^>]*id="mi-envio"[^>]*>/, ''));
    hojaEnviada.length = 0;
    editarDelHistorial(entrada.id);
    q('tr.mi-rep .mi-machos').value = '11';
    await H.madIngGuardar();
    expect(ids()).toEqual([BASE]);
    expect(preguntas).toEqual([]);
  });
});

describe('🔄 lo guardado con 💾 también pregunta', () => {
  it('🔴 un ingreso guardado que repite uno enviado: con «Cancelar», no sale y queda pendiente', async () => {
    llenar(10, 12);
    await H.madIngGuardar();
    llenar(5, 6);
    H.madIngGuardarLocal();
    expect(H.madLocLeer('ingreso')).toHaveLength(1);
    red.confirma = false;
    await H.syncAll();
    expect(preguntas.some((p) => p.includes('¿Ingreso REPETIDO?'))).toBe(true);
    expect(hojaEnviada).toHaveLength(1);                              // sólo el primero
    expect(H.madLocLeer('ingreso')).toHaveLength(1);                  // sigue guardado
    expect(toasts.some((t) => /Ingreso NO enviado/.test(t))).toBe(true);
  });
});
