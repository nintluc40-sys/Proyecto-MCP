// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TRATAMIENTOS: EL MISMO DÍA Y LA MISMA LLAVE, MÁS DE UNA VEZ (pendiente 26, 2026-11-09)

   El defecto: el ID de la fila era fecha + sala + (P + lotes | D + área), y el GAS escribe esta hoja por ID con merge. Un
   segundo preventivo a los mismos lotes el mismo día (mañana y tarde), o una segunda desinfección de la misma área, caía en la
   fila del primero y le sustituía los productos, sin ningún error.

   DECISIÓN DEL USUARIO (no re-preguntar): «Como en Movimientos» (A3). Cada formulario lleva su identidad en el ID y, antes de
   enviar, se pregunta «¿Tratamiento REPETIDO?» si ya hay otro igual ese día (en la hoja, en el Historial del equipo o en este
   mismo envío). Reintentar y corregir desde el Historial siguen reemplazando su propia fila; las filas de antes conservan su ID.

   Motor REAL sobre el shell real; la red, la hoja y el `confirm`, simulados. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_TRAT_HEADERS, tratIdPreventivo, tratIdDesinfeccion } from './ficha-maduracion-tratamientos.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madTratReiniciar', 'madTratGuardar', 'madTratGuardarLocal', 'madTratEstadoChange', 'madTratIdPreventivo',
  'madTratRepetidos', 'madHistLeer', 'madHistEditar', 'madLocLeer', 'syncAll', '_gasVersionLocal', '_lastSyncFingerprint'];
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
  /* El GAS desplegado ES el de esta app (el portón de Tratamientos pregunta ?p=ver). */
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
  };
});

const FECHA = '2026-02-10';
const col = (h) => MAD_TRAT_HEADERS.indexOf(h);
const ids = () => hojaEnviada.flatMap((p) => p.rows.map((f) => f[col('ID')]));
const BASE = tratIdPreventivo(FECHA, 'Sala 4', 'AB');

const q = (s) => document.querySelector('#fp-tratamientos ' + s);
const pon = (el, v) => { el.value = v; return el; };
/* Un preventivo a un lote, con lo que la plantilla de Producción pre-marca. Valores inventados. */
const llenar = ({ lotes = 'AB', fecha = FECHA, dosis = '' } = {}) => {
  pon(q('#mt-fecha'), fecha);
  pon(q('#mt-sala'), 'Sala 4');
  H.madTratEstadoChange(pon(q('#mt-estado'), 'Producción'));
  pon(q('#mt-prevs .mt-lotes'), lotes);
  if (dosis) pon(q('#mt-prevs .mt-dosis'), dosis);
};
/* happy-dom no respeta el `selected` de un <select> restaurado por innerHTML; un navegador, sí. */
const editarDelHistorial = (id) => {
  H.madHistEditar(id);
  document.querySelectorAll('#fp-tratamientos select').forEach((s) => { const o = s.querySelector('option[selected]'); if (o) s.value = o.value; });
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
  H.setMod(H.MAD_MOD, 'tratamientos');
  H.madTratReiniciar();
});

describe('Tratamientos · la llave lleva la identidad del formulario', () => {
  it('con identidad, la llave de siempre más un sufijo; sin ella (las filas de antes), la de siempre', () => {
    expect(H.madTratIdPreventivo(FECHA, 'Sala 4', 'AB')).toBe(BASE);
    expect(H.madTratIdPreventivo(FECHA, 'Sala 4', 'AB', 'x1y2z3')).toBe(BASE + '-x1y2z3');
  });
});

describe('🔴 el mismo día y la misma llave, dos veces', () => {
  it('🔴 van en dos filas: el segundo ya no reemplaza al primero', async () => {
    llenar();
    await H.madTratGuardar();
    llenar();
    await H.madTratGuardar();
    expect(hojaEnviada).toHaveLength(2);
    const [a, b] = ids();
    expect(a).not.toBe(b);
    expect(a.startsWith(BASE + '-')).toBe(true);
    expect(b.startsWith(BASE + '-')).toBe(true);
  });

  it('🔴 el segundo pregunta «¿Tratamiento REPETIDO?» y dice con qué productos está el anterior', async () => {
    llenar();
    await H.madTratGuardar();
    expect(preguntas).toEqual([]);
    llenar();
    await H.madTratGuardar();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('¿Tratamiento REPETIDO?');
    expect(preguntas[0]).toContain('Preventivo a AB en Sala 4');
    expect(preguntas[0]).toContain('Bacmil');
    expect(preguntas[0]).toContain('en este equipo');
  });

  it('🔴 «Cancelar» no envía nada y lo tecleado se queda', async () => {
    llenar();
    await H.madTratGuardar();
    llenar();
    red.confirma = false;
    await H.madTratGuardar();
    expect(hojaEnviada).toHaveLength(1);
    expect(q('#mt-prevs .mt-lotes').value).toBe('AB');
    expect(toasts.some((t) => /Tratamientos NO enviado/.test(t))).toBe(true);
  });

  it('🔴 lo que ya está en la HOJA también cuenta, aunque sea una fila de antes, sin identidad', async () => {
    red.hoja = [{ ID: BASE, Productos: 'Formol', 'Productos RAS': '' }];
    llenar();
    await H.madTratGuardar();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('ya hay uno (Formol) en la hoja');
  });

  it('otros lotes u otro día no preguntan', async () => {
    red.hoja = [{ ID: tratIdPreventivo(FECHA, 'Sala 4', 'AB, AC') + '-zz9', Productos: 'Formol' },
      { ID: tratIdPreventivo('2026-02-11', 'Sala 4', 'AB'), Productos: 'Formol' }];
    llenar();
    await H.madTratGuardar();
    expect(preguntas).toEqual([]);
    expect(hojaEnviada).toHaveLength(1);
  });

  it('🔴 los lotes «AB» no son «AB.AC»: el guion separa la llave de la identidad', () => {
    const fila = (lotes, id) => {
      const r = MAD_TRAT_HEADERS.map(() => '');
      r[col('Fecha')] = FECHA; r[col('Sala')] = 'Sala 4'; r[col('Tipo')] = 'Preventivo'; r[col('Lotes')] = lotes; r[col('ID')] = id;
      return r;
    };
    const hoja = [{ ID: tratIdPreventivo(FECHA, 'Sala 4', 'AB, AC'), Productos: 'Formol' }];
    expect(H.madTratRepetidos([fila('AB', tratIdPreventivo(FECHA, 'Sala 4', 'AB', 'k1'))], hoja, [])).toEqual([]);
    expect(H.madTratRepetidos([fila('AB, AC', tratIdPreventivo(FECHA, 'Sala 4', 'AB, AC', 'k1'))], hoja, [])).toHaveLength(1);
  });

  it('🔴 una desinfección de la misma área ese día también se avisa, y otra área no', () => {
    const fila = (area, id) => {
      const r = MAD_TRAT_HEADERS.map(() => '');
      r[col('Fecha')] = FECHA; r[col('Sala')] = 'Sala 4'; r[col('Tipo')] = 'Desinfección'; r[col('Área')] = area; r[col('ID')] = id;
      return r;
    };
    const hoja = [{ ID: tratIdDesinfeccion(FECHA, 'Sala 4', 'Reservorio'), Productos: 'Cloro' }];
    const rep = H.madTratRepetidos([fila('Reservorio', tratIdDesinfeccion(FECHA, 'Sala 4', 'Reservorio', 'k1'))], hoja, []);
    expect(rep).toHaveLength(1);
    expect(rep[0].que).toBe('Desinfección de «Reservorio»');
    expect(rep[0].productos).toBe('Cloro');
    expect(H.madTratRepetidos([fila('Colectores', tratIdDesinfeccion(FECHA, 'Sala 4', 'Colectores', 'k1'))], hoja, [])).toEqual([]);
  });
});

describe('reintentar y corregir siguen reemplazando su propia fila', () => {
  it('🔴 un envío rechazado, reenviado desde el mismo formulario, lleva el MISMO ID y no pregunta por sí mismo', async () => {
    llenar();
    red.respuesta = () => 'rejected';
    await H.madTratGuardar();
    const identidad = q('#mt-envio') && q('#mt-envio').value;
    expect(identidad).toBeTruthy();
    red.respuesta = () => 'ok';
    await H.madTratGuardar();
    expect(preguntas).toEqual([]);
    expect(ids()).toEqual([BASE + '-' + identidad]);
  });

  it('🔴 corregir desde 📜 Historial reemplaza su fila (mismo ID) y no pregunta', async () => {
    llenar();
    await H.madTratGuardar();
    const [primero] = ids();
    const entrada = H.madHistLeer().find((e) => e.ficha === 'tratamientos');
    editarDelHistorial(entrada.id);
    pon(q('#mt-prevs .mt-dosis'), 'otra dosis');
    await H.madTratGuardar();
    expect(preguntas).toEqual([]);
    expect(ids()).toEqual([primero, primero]);
  });

  it('🔴 corregir desde 📜 un tratamiento de ANTES (sin identidad) reemplaza su fila de siempre, no crea otra', async () => {
    llenar();
    await H.madTratGuardar();
    const lista = JSON.parse(localStorage.getItem('larv4_mad_hist'));
    const entrada = lista.find((e) => e.ficha === 'tratamientos');
    entrada.payload.rows.forEach((r) => { r[col('ID')] = BASE; });
    localStorage.setItem('larv4_mad_hist', JSON.stringify(lista));
    const kPanel = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .find((k) => k !== 'larv4_mad_hist' && k.indexOf(entrada.id) !== -1);   // la copia de ✏️ de esa entrada
    localStorage.setItem(kPanel, localStorage.getItem(kPanel).replace(/<input[^>]*id="mt-envio"[^>]*>/, ''));
    hojaEnviada.length = 0;
    editarDelHistorial(entrada.id);
    pon(q('#mt-prevs .mt-dosis'), 'otra dosis');
    await H.madTratGuardar();
    expect(ids()).toEqual([BASE]);
    expect(preguntas).toEqual([]);
  });
});

describe('🔄 lo guardado con 💾 también pregunta', () => {
  it('🔴 un tratamiento guardado que repite uno enviado: con «Cancelar», no sale y queda pendiente', async () => {
    llenar();
    await H.madTratGuardar();
    llenar();
    H.madTratGuardarLocal();
    expect(H.madLocLeer('tratamientos')).toHaveLength(1);
    red.confirma = false;
    await H.syncAll();
    expect(preguntas.some((p) => p.includes('¿Tratamiento REPETIDO?'))).toBe(true);
    expect(hojaEnviada).toHaveLength(1);
    expect(H.madLocLeer('tratamientos')).toHaveLength(1);
    expect(toasts.some((t) => /Tratamientos NO enviado/.test(t))).toBe(true);
  });
});
