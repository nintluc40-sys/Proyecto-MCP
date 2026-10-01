// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES · una cifra BORRADA en la grilla se corrige de verdad (usuario, 2026-09-30, punto 5 · A)

   LO QUE PASABA (simulado con el motor real): se teclean 2 hembras muertas en el tanque 7, se cambia de sala —el
   autoguardado guarda el parte ABIERTO con ese 2—, se vuelve, se BORRA el 2 (estaba en el tanque equivocado) y se pulsa
   💾: el registro seguía diciendo 2 y se enviaba a la hoja con 2. La fusión (`_madMergeRow`) no dejaba que una celda
   vacía pisara lo guardado, y el GAS tampoco vacía una celda de la hoja con un envío vacío. Tras el 💾 la grilla queda
   limpia, así que nadie lo veía: el Saldo restaba muertes que el operario había quitado.

   DECISIÓN DEL USUARIO: una cifra borrada se guarda BORRADA. Las de CONTEO (muertes, descartes, cópulas, muda) viajan
   como 0 —«ninguna», que es lo que significa borrarlas—, y así corrigen también un parte ya enviado; pesos y
   observaciones, vacíos. Sólo al guardar la MISMA grilla que se pintó: llevar lo tecleado a otro día no vacía lo que
   ese día ya tenía, y la recuperación (↩) no vacía nada.

   El arnés es el de mad-tanques-pendientes.test.js (engine.js entero en happy-dom; sólo se sustituye el POST de un
   intento). La «hoja» se simula con la llave del GAS. ⚠ Cifras PROPIAS por prueba: el motor omite un envío idéntico a
   otro de hace menos de 30 s.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'madTanquesSalaChange', 'madTanquesFechaChange', 'saveMadTanquesGrid',
  'syncMadTanquesGrid', 'syncAll', 'loadMad', 'saveMadList', '_gasVersionLocal', 'MAD_MOD', 'today'];
const H = {};
const envios = [];

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
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  H.setPostOnce(async (body) => { envios.push(JSON.parse(JSON.stringify(body))); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    if (u.indexOf('p=rows') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) };
    throw new Error('fetch inesperado: ' + u);
  };
});

const poner = (tq, k, v) => {
  const el = document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]');
  if (!el) throw new Error('sin celda ' + k + ' del tanque ' + tq);
  el.value = String(v);
};
const teclear = (tq, k, v) => {   // como una persona: valor + «input» (marca la grilla como «sin guardar»)
  poner(tq, k, v);
  document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]').dispatchEvent(new Event('input', { bubbles: true }));
};
const irASala = (s) => { document.getElementById('mad-tanques-sala').value = s; H.madTanquesSalaChange(); };
const valor = (tq, k) => document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]').value;
const guardado = (sala, tq, fecha) => H.loadMad('tanques').filter((r) => r.data.sala === sala && String(r.data.tanque) === String(tq)
  && (!fecha || r.data.fecha === fecha));
/** La HOJA como la deja el GAS: una fila por llave ([0,1,2,13,14]); una celda vacía NO pisa la que había (merge). */
const hoja = () => {
  const filas = new Map();
  envios.filter((b) => b.sheetName === 'Maduración Tanques').forEach((b) => {
    b.rows.forEach((r) => {
      const k = [r[0], r[1], r[2], r[13], r[14]].join('|');
      const ex = filas.get(k);
      filas.set(k, ex ? ex.map((e, i) => (r[i] === '' || r[i] == null ? e : r[i])) : r.slice());
    });
  });
  return [...filas.values()];
};
const deHoja = (sala, tq) => hoja().filter((r) => r[1] === sala && String(r[2]) === String(tq));

beforeEach(() => {
  localStorage.clear();
  envios.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
  H.setVista(H.MAD_MOD, 'tanques');
  H.renderMadTanques();
});
afterEach(() => { vi.useRealTimers(); });

describe('Tanques · una cifra BORRADA en la grilla se corrige (punto 5 · A)', () => {
  it('🔴 el caso: 2 ♀ en T7, salir y volver (autoguardado), BORRARLAS y 💾 → se guarda 0 y la hoja recibe 0', async () => {
    irASala('Sala 5');
    poner(7, 'hembras_muertas', 2);
    poner(8, 'machos_muertos', 1);
    irASala('Sala 2');
    irASala('Sala 5');
    expect(valor(7, 'hembras_muertas'), 'el fixture ejerce algo: el parte abierto se vuelve a pintar').toBe('2');
    poner(7, 'hembras_muertas', '');
    H.saveMadTanquesGrid();
    expect(guardado('Sala 5', 7).map((r) => r.data.hembras_muertas), 'la cifra borrada sigue en el registro').toEqual([0]);
    await H.syncMadTanquesGrid();
    expect(deHoja('Sala 5', 7).map((r) => r[4]), 'la hoja recibe la cifra borrada').toEqual([0]);
    expect(deHoja('Sala 5', 8).map((r) => r[3]), 'lo no borrado se pierde').toEqual([1]);
  });

  it('🔴 un parte YA ENVIADO (🔄) se corrige borrando: vuelve a pendiente y la hoja pasa a 0 con la MISMA llave', async () => {
    irASala('Sala 5');
    poner(9, 'machos_muertos', 5);
    irASala('Sala 2');
    await H.syncAll();
    const antes = deHoja('Sala 5', 9);
    expect(antes.map((r) => r[3]), 'el fixture ejerce algo: se envió').toEqual([5]);
    irASala('Sala 5');
    poner(9, 'machos_muertos', '');
    irASala('Sala 2');
    expect(guardado('Sala 5', 9).map((r) => r.synced), 'la corrección no quedó pendiente').toEqual([false]);
    await H.syncAll();
    const despues = deHoja('Sala 5', 9);
    expect(despues, 'la corrección llegó con OTRA llave: sería un duplicado').toHaveLength(1);
    expect([despues[0][3], despues[0][13], despues[0][14]]).toEqual([0, antes[0][13], antes[0][14]]);
  });

  it('🔴 un PESO u observación borrados se guardan VACÍOS (un peso 0 no existe)', () => {
    irASala('Sala 5');
    poner(7, 'hembras_muertas', 1);
    poner(7, 'peso_hembras', '52.5');
    irASala('Sala 2');
    irASala('Sala 5');
    expect(valor(7, 'peso_hembras'), 'el fixture ejerce algo').toBe('52.5');
    poner(7, 'peso_hembras', '');
    H.saveMadTanquesGrid();
    expect(guardado('Sala 5', 7).map((r) => [r.data.peso_hembras, r.data.hembras_muertas])).toEqual([['', 1]]);
  });

  it('lo que nunca se tecleó sigue vacío: no se convierte en 0', () => {
    irASala('Sala 5');
    poner(7, 'machos_descarte', 3);
    irASala('Sala 2');
    irASala('Sala 5');
    H.saveMadTanquesGrid();
    const d = guardado('Sala 5', 7)[0].data;
    expect([d.machos_descarte, d.machos_muertos, d.copulas, d.muda, d.peso_machos]).toEqual([3, '', '', '', '']);
  });

  it('un 0 que ya se envió, vuelto a vaciar, no se reenvía (no es otro cambio)', async () => {
    irASala('Sala 5');
    poner(10, 'machos_muertos', 3);
    poner(11, 'hembras_muertas', 1);
    irASala('Sala 2');
    irASala('Sala 5');
    poner(10, 'machos_muertos', '');
    irASala('Sala 2');
    await H.syncAll();
    expect(guardado('Sala 5', 10).map((r) => [r.data.machos_muertos, r.synced]), 'el fixture ejerce algo').toEqual([[0, true]]);
    irASala('Sala 5');
    expect(valor(10, 'machos_muertos')).toBe('0');
    poner(10, 'machos_muertos', '');
    irASala('Sala 2');
    expect(guardado('Sala 5', 10).map((r) => r.synced), 'vaciar un 0 lo volvió a pendiente').toEqual([true]);
  });

  it('🔴 llevar lo tecleado a OTRO día no vacía lo que ese día ya tenía en el tanque', () => {
    const AYER = '2026-09-14';
    H.saveMadList('tanques', [{ id: 'y1', ts: 1, synced: false, syncedAt: null,
      data: { fecha: AYER, sala: 'Sala 5', tanque: 7, hembras_muertas: 1, peso_hembras: 50, parte: 1, hora: '06:00', cerrado: 0 } }]);
    irASala('Sala 5');
    teclear(7, 'machos_muertos', '4');
    document.getElementById('mad-tanques-fecha').value = AYER;
    H.madTanquesFechaChange();
    const d = guardado('Sala 5', 7, AYER).map((r) => [r.data.machos_muertos, r.data.hembras_muertas, r.data.peso_hembras]);
    expect(d, 'lo del día de destino se vació al llevar').toEqual([[4, 1, 50]]);
  });
});
