// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · DESOVES · AVISO «¿Desove REPETIDO?» antes de enviar (H1, usuario, 2026-10-13)

   LO MEDIDO (auditoría del 13-10, la hoja de producción en sólo lectura): el 11/12-10 los cinco lotes del día quedaron
   DOS veces —con fecha 12-10, sin N2, escritos ANTES que los del 11-10, con N2 y Despacho— y el 08/09-10 pasó lo mismo con
   un lote. Es la llave del GAS, (Fecha, Lote, Código): un desove enviado con la fecha equivocada y reenviado con la buena
   crea una fila NUEVA y la de la fecha mala se queda. `madDesValidar` sólo miraba el MISMO envío.

   🔑 LA REGLA (la pura está en ficha-maduracion-desoves: `desovesRepetidos`, con su paridad):
     · se compara cada fila que va a CREAR una llave nueva con la hoja FRESCA y con las demás del envío;
     · «repetido» = el mismo lote y código, el día anterior o el siguiente, mismos desoves y mismo total de huevos (> 0);
     · UNA pregunta por envío. «Cancelar» = no se envía NADA de Desoves (tampoco lo guardado con 💾) y lo tecleado sigue;
       «Aceptar» = se envía como siempre;
     · en el ☁️ de la ficha y en el 🔄 global (que envía lo guardado); si la hoja no se puede leer, se envía sin preguntar.

   Datos INVENTADOS (lotes ZA/ZB, códigos TST.*): las pruebas no llevan valores reales.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_DESOVE_HEADERS } from './ficha-maduracion-desoves.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madDesReiniciar', 'madDesGuardar', 'madDesGuardarLocal', 'madLocLeer', 'syncAll', 'MAD_MOD', '_gasVersionLocal'];
const H = {};
const avisos = [];
const envios = [];
const preguntas = [];
let respuesta = true;       // lo que contesta el usuario al confirm
let hoja = [];              // «Maduración Lotes» tal como la devuelve ?p=rows
let hojaLegible = true;

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
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPost(async (payload, url, opts) => { envios.push(payload); if (opts) opts.outcome = 'ok'; return true; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.indexOf('p=ver') !== -1) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    }
    if (u.indexOf('p=rows') !== -1) {
      if (!hojaLegible) throw new TypeError('sin red');
      const nombre = decodeURIComponent((/[?&]sheet=([^&]*)/.exec(u) || [])[1] || '');
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: nombre === 'Maduración Lotes' ? hoja : [] }) };
    }
    throw new Error('fetch inesperado: ' + u);
  };
});

beforeEach(() => {
  localStorage.clear();
  avisos.length = 0; envios.length = 0; preguntas.length = 0;
  respuesta = true; hoja = []; hojaLegible = true;
  globalThis.confirm = (msg) => { preguntas.push(String(msg)); return respuesta; };
  H.setVista(H.MAD_MOD, 'desoves');
  H.madDesReiniciar();
});
afterEach(() => { H.setVista(null, 'calidad'); });

const q = (s) => document.querySelector('#fp-desoves ' + s);
/** Una fila de la hoja, objeto por cabecera; lo que no se dice, vacío. */
const fila = (fecha, lote, cg, desoves, huevos) => {
  const o = {};
  MAD_DESOVE_HEADERS.forEach((h) => { o[h] = ''; });
  return Object.assign(o, { Fecha: fecha, Lote: lote, 'Código genético': cg, Desoves: desoves, 'Total de huevos': huevos });
};
const llenar = (fecha, desoves = '12', huevos = '6500') => {
  document.getElementById('md-fecha').value = fecha;
  q('.md-lote').value = 'ZA'; q('.md-cg').value = 'TST.A1';
  q('.md-desoves').value = desoves; q('.md-huevos').value = huevos;
};
const aLotes = () => envios.filter((p) => p && p.sheetName === 'Maduración Lotes');
const DEL_11 = () => [fila('2026-09-11', 'ZA', 'TST.A1', 12, 6500000)];

describe('Desoves · ☁️ de la ficha: el mismo desove con la fecha de al lado se PREGUNTA antes de enviarlo', () => {
  it('el fixture ejerce algo: sin nada parecido en la hoja, envía sin preguntar', async () => {
    hoja = [fila('2026-09-11', 'ZA', 'TST.A1', 12, 6400000)];
    llenar('2026-09-12');
    await H.madDesGuardar();
    expect(preguntas).toEqual([]);
    expect(aLotes()).toHaveLength(1);
  });

  it('🔴 la fecha cambiada: UNA pregunta, con el lote y la fecha que ya tiene la hoja', async () => {
    hoja = DEL_11();
    respuesta = false;
    llenar('2026-09-12');
    await H.madDesGuardar();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toMatch(/¿Desove REPETIDO\?/);
    expect(preguntas[0]).toMatch(/ZA \(TST\.A1\) del 2026-09-12: 12 desoves y 6\.?500 mil huevos, igual que la hoja el 2026-09-11/);
  });

  it('🔴 «Cancelar» no envía nada y lo tecleado sigue en la ficha', async () => {
    hoja = DEL_11();
    respuesta = false;
    llenar('2026-09-12');
    await H.madDesGuardar();
    expect(aLotes(), 'se envió pese a «Cancelar»').toEqual([]);
    expect(q('.md-lote').value, 'lo tecleado no puede perderse').toBe('ZA');
    expect(avisos.some((a) => /Desoves NO enviado/.test(a.msg))).toBe(true);
  });

  it('🔴 «Cancelar» tampoco envía lo guardado con 💾 de antes', async () => {
    llenar('2026-09-05', '3', '900');
    H.madDesGuardarLocal();
    expect(H.madLocLeer('desoves')).toHaveLength(1);
    hoja = DEL_11();
    respuesta = false;
    llenar('2026-09-12');
    await H.madDesGuardar();
    expect(envios).toEqual([]);
    expect(H.madLocLeer('desoves'), 'lo guardado sigue en el dispositivo').toHaveLength(1);
  });

  it('🔴 el repetido que está en lo GUARDADO con 💾 (y no en pantalla) también se pregunta en el ☁️', async () => {
    llenar('2026-09-12');
    H.madDesGuardarLocal();
    hoja = DEL_11();
    respuesta = false;
    llenar('2026-09-20', '4', '700');   // lo de pantalla no se parece a nada
    await H.madDesGuardar();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toMatch(/del 2026-09-12/);
    expect(envios).toEqual([]);
  });

  it('«Aceptar» envía como siempre', async () => {
    hoja = DEL_11();
    respuesta = true;
    llenar('2026-09-12');
    await H.madDesGuardar();
    expect(preguntas).toHaveLength(1);
    expect(aLotes()).toHaveLength(1);
    expect(q('.md-lote').value).toBe('');
  });

  it('🔴 completar su propia llave (el mismo día de la hoja) no pregunta: actualiza la fila', async () => {
    hoja = DEL_11();
    llenar('2026-09-11');
    await H.madDesGuardar();
    expect(preguntas).toEqual([]);
    expect(aLotes()).toHaveLength(1);
  });

  it('si la hoja no se puede leer, envía sin preguntar (como hoy)', async () => {
    hoja = DEL_11();
    hojaLegible = false;
    llenar('2026-09-12');
    await H.madDesGuardar();
    expect(preguntas).toEqual([]);
    expect(aLotes()).toHaveLength(1);
  });
});

describe('Desoves · 🔄 global: lo guardado con 💾 pasa por la misma pregunta', () => {
  it('🔴 «Cancelar» lo deja guardado, no lo envía y la barra dice que Desoves queda pendiente', async () => {
    llenar('2026-09-12');
    H.madDesGuardarLocal();
    hoja = DEL_11();
    respuesta = false;
    await H.syncAll();
    expect(preguntas).toHaveLength(1);
    expect(aLotes()).toEqual([]);
    expect(H.madLocLeer('desoves')).toHaveLength(1);
    expect(document.getElementById('slbl').textContent).toMatch(/Desoves pendiente \(¿desove repetido\?\)/);
  });

  it('«Aceptar» lo envía', async () => {
    llenar('2026-09-12');
    H.madDesGuardarLocal();
    hoja = DEL_11();
    respuesta = true;
    await H.syncAll();
    expect(preguntas).toHaveLength(1);
    expect(aLotes()).toHaveLength(1);
    expect(H.madLocLeer('desoves')).toEqual([]);
  });
});
