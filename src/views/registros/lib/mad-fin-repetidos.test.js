// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · FIN DE CICLO: EL MISMO DÍA, LOTE Y MOTIVO, MÁS DE UNA VEZ (pendiente 26, 2026-11-09)

   El defecto: el ID de la fila era fecha + lote + motivo, y el GAS escribe esta hoja por ID con merge. Un segundo cierre del
   mismo lote con el mismo motivo, el mismo día (otra tanda de descarte, otro pedido), caía en la fila del primero y le
   sustituía las cifras, sin ningún error; y el 📜 Historial lo tomaba por un reenvío y borraba la entrada del primero.

   DECISIÓN DEL USUARIO (no re-preguntar): «Como en Movimientos» (A3). Cada formulario lleva su identidad en el ID y, antes de
   enviar, se pregunta «¿Cierre REPETIDO?» si ese lote ya tiene otro cierre con ese motivo ese día (en la hoja, en el Historial
   del equipo o en este mismo envío). Reintentar y corregir desde el Historial siguen reemplazando su propia fila; las filas de
   antes conservan su ID. La identidad NO es el «Registro»: ése lo llevan también las copias de ✏️ de antes.

   Motor REAL sobre el shell real; la red, la hoja y el `confirm`, simulados. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_FIN_HEADERS, finRowId } from './ficha-maduracion-fin-ciclo.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madFinReiniciar', 'madFinGuardar', 'madFinGuardarLocal', 'madFinTipoChange', 'madFinRowId', 'madFinRepetidos',
  'madHistLeer', 'madHistEditar', 'madLocLeer', 'syncAll', '_gasVersionLocal', '_lastSyncFingerprint'];
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
  /* El GAS desplegado ES el de esta app (el portón de Fin de Ciclo pregunta ?p=ver). */
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
  };
});

const FECHA = '2026-02-10';
const col = (h) => MAD_FIN_HEADERS.indexOf(h);
const ids = () => hojaEnviada.flatMap((p) => p.rows.map((f) => f[col('ID')]));
const BASE = finRowId(FECHA, 'AB', 'Pedido');

const $ = (s) => document.querySelector(s);
const pon = (el, v) => { el.value = v; return el; };
/* Un cierre parcial de un lote. Valores inventados. */
const llenar = (machos, { lote = 'AB', motivo = 'Pedido', fecha = FECHA } = {}) => {
  pon($('#mf-fecha'), fecha);
  const c = $('#fp-fin .mf-cierre');
  H.madFinTipoChange(pon(c.querySelector('.mf-tipo'), 'Parcial'));
  pon(c.querySelector('.mf-lote'), lote); pon(c.querySelector('.mf-motivo'), motivo);
  pon(c.querySelector('.mf-machos'), String(machos));
};
/* happy-dom no respeta el `selected` de un <select> restaurado por innerHTML; un navegador, sí. */
const editarDelHistorial = (id) => {
  H.madHistEditar(id);
  document.querySelectorAll('#fp-fin select').forEach((s) => { const o = s.querySelector('option[selected]'); if (o) s.value = o.value; });
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
  H.setMod(H.MAD_MOD, 'fin');
  H.madFinReiniciar();
});

describe('Fin de Ciclo · la llave lleva la identidad del formulario', () => {
  it('con identidad, la llave de siempre más un sufijo; sin ella (las filas de antes), la de siempre', () => {
    expect(H.madFinRowId(FECHA, 'AB', 'Pedido')).toBe(BASE);
    expect(H.madFinRowId(FECHA, 'AB', 'Pedido', 'x1y2z3')).toBe(BASE + '-x1y2z3');
  });
});

describe('🔴 el mismo día, lote y motivo, dos veces', () => {
  it('🔴 van en dos filas: el segundo ya no reemplaza al primero', async () => {
    llenar(4);
    await H.madFinGuardar();
    llenar(3);
    await H.madFinGuardar();
    expect(hojaEnviada).toHaveLength(2);
    const [a, b] = ids();
    expect(a).not.toBe(b);
    expect(a.startsWith(BASE + '-')).toBe(true);
    expect(b.startsWith(BASE + '-')).toBe(true);
  });

  it('🔴 el segundo pregunta «¿Cierre REPETIDO?» y dice lo que ya hay', async () => {
    llenar(4);
    await H.madFinGuardar();
    expect(preguntas).toEqual([]);
    llenar(3);
    await H.madFinGuardar();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('¿Cierre REPETIDO?');
    expect(preguntas[0]).toContain('4 ♂ y 0 ♀ en este equipo');
  });

  it('🔴 «Cancelar» no envía nada y lo tecleado se queda', async () => {
    llenar(4);
    await H.madFinGuardar();
    llenar(3);
    red.confirma = false;
    await H.madFinGuardar();
    expect(hojaEnviada).toHaveLength(1);
    expect($('#fp-fin .mf-machos').value).toBe('3');
    expect(toasts.some((t) => /Fin de Ciclo NO enviado/.test(t))).toBe(true);
  });

  it('🔴 lo que ya está en la HOJA también cuenta, aunque sea una fila de antes, sin identidad', async () => {
    red.hoja = [{ ID: BASE, Machos: 7, Hembras: 8 }];
    llenar(3);
    await H.madFinGuardar();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('7 ♂ y 8 ♀ en la hoja');
  });

  it('otro motivo u otro día no preguntan', async () => {
    red.hoja = [{ ID: finRowId(FECHA, 'AB', 'Descarte parcial') + '-zz9', Machos: 7, Hembras: 8 },
      { ID: finRowId('2026-02-11', 'AB', 'Pedido'), Machos: 7, Hembras: 8 }];
    llenar(3);
    await H.madFinGuardar();
    expect(preguntas).toEqual([]);
    expect(hojaEnviada).toHaveLength(1);
  });

  it('🔴 «Descarte» no es «Descarte parcial»: el guion separa la llave de la identidad', () => {
    const fila = (motivo, id) => {
      const r = MAD_FIN_HEADERS.map(() => '');
      r[col('Fecha')] = FECHA; r[col('Lote')] = 'AB'; r[col('Motivo')] = motivo; r[col('ID')] = id;
      return r;
    };
    const hoja = [{ ID: finRowId(FECHA, 'AB', 'Descarte parcial') + '-zz9', Machos: 1, Hembras: 1 }];
    expect(H.madFinRepetidos([fila('Descarte', finRowId(FECHA, 'AB', 'Descarte', 'k1'))], hoja, [])).toEqual([]);
    expect(H.madFinRepetidos([fila('Descarte parcial', finRowId(FECHA, 'AB', 'Descarte parcial', 'k1'))], hoja, [])).toHaveLength(1);
  });
});

describe('reintentar y corregir siguen reemplazando su propia fila', () => {
  it('🔴 un envío rechazado, reenviado desde el mismo formulario, lleva el MISMO ID y no pregunta por sí mismo', async () => {
    llenar(4);
    red.respuesta = () => 'rejected';
    await H.madFinGuardar();
    const identidad = $('#mf-envio') && $('#mf-envio').value;
    expect(identidad).toBeTruthy();
    red.respuesta = () => 'ok';
    await H.madFinGuardar();
    expect(preguntas).toEqual([]);
    expect(ids()).toEqual([BASE + '-' + identidad]);
  });

  it('🔴 corregir desde 📜 Historial reemplaza su fila (mismo ID) y no pregunta', async () => {
    llenar(4);
    await H.madFinGuardar();
    const [primero] = ids();
    const entrada = H.madHistLeer().find((e) => e.ficha === 'fin');
    editarDelHistorial(entrada.id);
    pon($('#fp-fin .mf-machos'), '5');
    await H.madFinGuardar();
    expect(preguntas).toEqual([]);
    expect(ids()).toEqual([primero, primero]);
  });

  it('🔴 corregir desde 📜 un cierre de ANTES (sin identidad) reemplaza su fila de siempre, no crea otra', async () => {
    llenar(4);
    await H.madFinGuardar();
    /* Se convierte lo enviado en un envío «de antes»: su fila con el ID sin sufijo y su copia de ✏️ sin el campo de identidad. */
    const lista = JSON.parse(localStorage.getItem('larv4_mad_hist'));
    const entrada = lista.find((e) => e.ficha === 'fin');
    entrada.payload.rows.forEach((r) => { r[col('ID')] = BASE; });
    localStorage.setItem('larv4_mad_hist', JSON.stringify(lista));
    const kPanel = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .find((k) => k !== 'larv4_mad_hist' && k.indexOf(entrada.id) !== -1);   // la copia de ✏️ de esa entrada
    localStorage.setItem(kPanel, localStorage.getItem(kPanel).replace(/<input[^>]*id="mf-envio"[^>]*>/, ''));
    hojaEnviada.length = 0;
    editarDelHistorial(entrada.id);
    pon($('#fp-fin .mf-machos'), '5');
    await H.madFinGuardar();
    expect(ids()).toEqual([BASE]);
    expect(preguntas).toEqual([]);
  });
});

describe('🔄 lo guardado con 💾 también pregunta', () => {
  it('🔴 un cierre guardado que repite uno enviado: con «Cancelar», no sale y queda pendiente', async () => {
    llenar(4);
    await H.madFinGuardar();
    llenar(3);
    H.madFinGuardarLocal();
    expect(H.madLocLeer('fin')).toHaveLength(1);
    red.confirma = false;
    await H.syncAll();
    expect(preguntas.some((p) => p.includes('¿Cierre REPETIDO?'))).toBe(true);
    expect(hojaEnviada).toHaveLength(1);
    expect(H.madLocLeer('fin')).toHaveLength(1);
    expect(toasts.some((t) => /Fin de Ciclo NO enviado/.test(t))).toBe(true);
  });
});
