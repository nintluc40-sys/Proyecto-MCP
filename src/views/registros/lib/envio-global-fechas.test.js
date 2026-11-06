// @vitest-environment happy-dom
/* ============================================================
   🔄 GLOBAL EN LARVICULTURA · UNA FECHA POR ENVÍO (pauta A12, 2026-11-05)

   La fecha es llave de la fila de Datos Larvicultura (Fecha + Módulo + Tanque), y un envío lleva una sola. Con Población de
   hoy y Calidad de ayer, 🔄 escribía la Calidad en la fila de HOY, mientras el ☁️ de la ficha la mandaba a la suya. Y también
   al revés: lo ya enviado de otra fecha volvía a viajar dentro del envío de hoy.
   Si todas las fichas coinciden, el envío no cambia.
   Motor entero; las cifras son inventadas.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['saveE', 'loadE', 'getStatus', 'syncAll', 'buildDatosPayload', 'today', '_invalidateLoadE', 'PRE'];
const H = {};
const avisos = [];
const envios = [];
let alPost = null;
const mapa = new Map();
const almacen = { getItem: (k) => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => mapa.set(k, String(v)), removeItem: (k) => mapa.delete(k),
  clear: () => mapa.clear(), key: (i) => Array.from(mapa.keys())[i] ?? null, get length() { return mapa.size; } };

beforeAll(async () => {
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
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setCola=function(f){flushSyncQueue=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  H.setCola(async () => {});
  H.setPost(async (p, url, t) => { envios.push({ p, t }); return alPost ? alPost(p, t) : true; });
});

let hoy, ayer, anteayer;
const dia = (n) => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const corto = (d) => d.slice(8) + '/' + d.slice(5, 7);
beforeEach(() => {
  mapa.clear(); H._invalidateLoadE();
  avisos.length = 0; envios.length = 0; alPost = null;
  hoy = H.today(); ayer = dia(1); anteayer = dia(2);
  H.setMod(1);
});

const COMUN = { corrida: 'C-7', tec: 'Técnico de prueba' };
const pob = (fecha, extra) => ({ ...COMUN, fecha, po_0: '12', sv_0: '80', ...extra });
const cal = (fecha, extra) => ({ ...COMUN, fecha, mo_0: '5', ...extra });
const plg = (fecha, extra) => ({ ...COMUN, fecha, pg_0: '90', ...extra });
const celda = (e, h, i = 0) => e.p.rows[i][e.p.headers.indexOf(h)];
const fechas = () => envios.map((e) => celda(e, 'Fecha'));

describe('🔄 Datos Larvicultura · cada ficha va a la fila de SU fecha', () => {
  it('🔴 Población de hoy y Calidad de ayer: dos envíos, cada uno con lo suyo, y lo más viejo primero', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer));
    await H.syncAll();
    expect(fechas()).toEqual([ayer, hoy]);
    expect(celda(envios[0], '% Mortalidad'), 'la Calidad, en la fila de ayer').toBe('5');
    expect(celda(envios[0], 'Población'), 'la Población no viaja con la Calidad de ayer').toBe('');
    expect(celda(envios[1], 'Población')).not.toBe('');
    expect(celda(envios[1], '% Mortalidad'), 'la Calidad de ayer no cae en la fila de hoy').toBe('');
  });

  it('🔴 cada envío marca sólo sus fichas, y al llegar las dos quedan enviadas', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer));
    await H.syncAll();
    expect(envios[0].t.mark.keys).toEqual([`1|calidad|${hoy}`]);
    expect(envios[1].t.mark.keys).toEqual([`1|poblacion|${hoy}`]);
    expect(H.getStatus(1, 'calidad')).toBe('synced');
    expect(H.getStatus(1, 'poblacion')).toBe('synced');
  });

  it('🔴 dos fichas del mismo día distinto de hoy viajan juntas, en un solo envío', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer));
    H.saveE(1, 'plg', plg(ayer));
    await H.syncAll();
    expect(fechas()).toEqual([ayer, hoy]);
    expect(celda(envios[0], '% Mortalidad')).toBe('5');
    expect(celda(envios[0], 'Plg')).toBe('90');
  });

  it('🔴 tres fechas, de la más vieja a la más nueva', async () => {
    H.saveE(1, 'poblacion', pob(ayer));
    H.saveE(1, 'calidad', cal(hoy));
    H.saveE(1, 'plg', plg(anteayer));
    await H.syncAll();
    expect(fechas()).toEqual([anteayer, ayer, hoy]);
  });

  it('🔴 sólo la Calidad de ayer pendiente, con la Población de hoy ya enviada: va a ayer, sin arrastrar la Población', async () => {
    H.saveE(1, 'poblacion', pob(hoy), true);
    H.saveE(1, 'calidad', cal(ayer));
    await H.syncAll();
    expect(fechas()).toEqual([ayer]);
    expect(celda(envios[0], 'Población')).toBe('');
    expect(celda(envios[0], '% Mortalidad')).toBe('5');
    expect(H.getStatus(1, 'poblacion'), 'lo enviado sigue enviado').toBe('synced');
    expect(H.getStatus(1, 'calidad')).toBe('synced');
  });

  it('🔴 lo ya enviado de otra fecha no vuelve a viajar dentro del envío de hoy', async () => {
    H.saveE(1, 'calidad', cal(ayer), true);
    H.saveE(1, 'poblacion', pob(hoy));
    await H.syncAll();
    expect(fechas()).toEqual([hoy]);
    expect(celda(envios[0], '% Mortalidad')).toBe('');
    expect(celda(envios[0], 'Población')).not.toBe('');
  });

  it('🔴 el aviso dice de qué día es cada envío', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer));
    await H.syncAll();
    expect(avisos.some((a) => a.includes('Datos Larvicultura del ' + corto(ayer)))).toBe(true);
    expect(avisos.some((a) => a.includes('Datos Larvicultura del ' + corto(hoy)))).toBe(true);
  });

  it('🔴 la corrida y el técnico de la ficha que los lleva valen para la que no: como en el envío único', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer, { corrida: '', tec: '' }));
    await H.syncAll();
    expect(celda(envios[0], 'Fecha')).toBe(ayer);
    expect(celda(envios[0], 'Corrida')).toBe('C-7');
    expect(celda(envios[0], 'Técnico')).toBe('Técnico de prueba');
  });

  it('🔴 la corrida propia de una ficha no se cambia por la de otra', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer, { corrida: 'C-6', tec: 'Otra persona' }));
    await H.syncAll();
    expect(celda(envios[0], 'Corrida')).toBe('C-6');
    expect(celda(envios[0], 'Técnico')).toBe('Otra persona');
    expect(celda(envios[1], 'Corrida')).toBe('C-7');
  });

  it('🔴 una ficha sin fecha propia va con la fecha general, la que le daba el envío único', async () => {
    H.saveE(1, 'poblacion', pob(ayer));
    H.saveE(1, 'calidad', cal(hoy));
    H.saveE(1, 'plg', plg(''));
    await H.syncAll();
    expect(fechas()).toEqual([ayer, hoy]);
    expect(celda(envios[0], 'Plg'), 'general: la de Población, que manda').toBe('90');
    expect(celda(envios[1], 'Plg')).toBe('');
  });

  it('🔴 aunque sea lo único pendiente, una ficha sin fecha va con la general, no con la de hoy', async () => {
    H.saveE(1, 'poblacion', pob(ayer), true);
    H.saveE(1, 'calidad', cal(anteayer), true);
    H.saveE(1, 'plg', plg(''));
    await H.syncAll();
    expect(fechas()).toEqual([ayer]);
    expect(celda(envios[0], 'Plg')).toBe('90');
    expect(celda(envios[0], 'Población')).toBe('');
  });

  it('🔴 sin Datos pendientes no sale ningún envío de Datos, aunque las fechas no coincidan', async () => {
    H.saveE(1, 'poblacion', pob(hoy), true);
    H.saveE(1, 'calidad', cal(ayer), true);
    H.saveE(1, 'params', { ...COMUN, fecha: hoy, 'od_0_02:00': '5,5' });
    await H.syncAll();
    expect(envios.map((e) => e.p.sheetName)).toEqual(['Control_Tanque M01']);
  });

  it('🔴 un envío en cola no frena al otro, y su ficha sigue pendiente hasta que se entregue', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer));
    alPost = (p, t) => { if (p.rows[0][0] === ayer) { t.outcome = 'queued'; return false; } return true; };
    await H.syncAll();
    expect(fechas()).toEqual([ayer, hoy]);
    expect(H.getStatus(1, 'calidad')).toBe('pending');
    expect(H.getStatus(1, 'poblacion')).toBe('synced');
    expect(avisos.some((a) => a.includes('quedaron en cola'))).toBe(true);
  });

  /* 2026-11-05 (auditoría) · los datos de cada envío se copiaban todos al empezar y la marca se leía al salir: una corrección guardada
     mientras salía el primero viajaba vieja con la marca nueva, y quedaba «enviada» sin haber viajado. */
  it('🔴 lo guardado mientras sale el primer envío viaja en el segundo, con su marca', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer));
    alPost = (p) => { if (p.rows[0][0] === ayer) H.saveE(1, 'poblacion', pob(hoy, { po_0: '13' })); return true; };
    await H.syncAll();
    expect(fechas()).toEqual([ayer, hoy]);
    expect(celda(envios[1], 'Población'), 'viaja la corregida').toBe(13 * 1000);
    expect(H.getStatus(1, 'poblacion')).toBe('synced');
  });

  it('🔴 una ficha que cambió de fecha mientras salía el primer envío va con su fecha nueva', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer));
    alPost = (p) => { if (p.rows[0][0] === ayer) H.saveE(1, 'poblacion', pob(anteayer)); return true; };
    await H.syncAll();
    expect(fechas()).toEqual([ayer, anteayer]);
  });

  it('🔴 una ficha sin valores por tanque no se envía ni se da por enviada; la otra sale', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer, { mo_0: '' }));
    await H.syncAll();
    expect(fechas()).toEqual([hoy]);
    expect(H.getStatus(1, 'calidad')).toBe('pending');
    expect(avisos.some((a) => a.includes('sin valores por tanque'))).toBe(true);
  });
});

describe('🔄 Datos Larvicultura · con una sola fecha, un solo envío', () => {
  /* 2026-11-05 (auditoría; usuario: «Lo incluyo yo») · viaja SÓLO lo pendiente, lo que lleva la marca. Antes viajaban también las ya
     enviadas: si ese envío se quedaba en la cola y luego se corregía una de ellas, la entrega escribía encima su valor viejo (el GAS
     escribe toda celda no vacía) y la app decía «enviado», porque la marca no llevaba esa ficha. */
  it('🔴 todas de hoy: un solo envío, y lo ya enviado no vuelve a viajar', async () => {
    H.saveE(1, 'poblacion', pob(hoy), true);
    H.saveE(1, 'calidad', cal(hoy));
    await H.syncAll();
    expect(envios).toHaveLength(1);
    expect(fechas()).toEqual([hoy]);
    expect(celda(envios[0], '% Mortalidad')).toBe('5');
    expect(celda(envios[0], 'Población'), 'la Población ya enviada no viaja').toBe('');
    expect(envios[0].t.mark.keys).toEqual([`1|calidad|${hoy}`]);
  });

  it('🔴 lo que viaja es lo que marca, también con la corrida heredada', async () => {
    H.saveE(1, 'poblacion', pob(hoy), true);
    H.saveE(1, 'calidad', cal(hoy, { corrida: '', tec: '' }));
    await H.syncAll();
    expect(celda(envios[0], 'Corrida')).toBe('C-7');
    expect(celda(envios[0], 'Técnico')).toBe('Técnico de prueba');
  });

  it('todas de ayer: un solo envío, a la fila de ayer', async () => {
    H.saveE(1, 'poblacion', pob(ayer));
    H.saveE(1, 'calidad', cal(ayer));
    await H.syncAll();
    expect(fechas()).toEqual([ayer]);
    expect(avisos.some((a) => a.includes('Enviando Datos Larvicultura…')), 'el aviso de siempre').toBe(true);
  });

  it('una ficha sin fecha junto a otras iguales no parte el envío', async () => {
    H.saveE(1, 'poblacion', pob(ayer));
    H.saveE(1, 'calidad', cal(''));
    await H.syncAll();
    expect(fechas()).toEqual([ayer]);
    expect(celda(envios[0], '% Mortalidad')).toBe('5');
  });

  it('sin nada pendiente, ningún envío', async () => {
    H.saveE(1, 'poblacion', pob(hoy), true);
    await H.syncAll();
    expect(envios).toHaveLength(0);
  });

  /* 2026-11-05 (auditoría; usuario: «Decirlo bien») · 🔄 no envía lo de días anteriores (eso es «☁️ Enviarlas»), pero tampoco puede
     decir «No hay datos pendientes» mientras la cabecera y el aviso dicen que sí. */
  it('🔴 con sólo lo de días anteriores, lo dice y la cabecera lo sigue contando', async () => {
    mapa.set(H.PRE + 'M01_calidad_' + ayer, JSON.stringify({ mod: 1, ficha: 'calidad', date: ayer, savedAt: 1, updatedAt: 1, synced: false, data: cal(ayer) }));
    await H.syncAll();
    expect(envios).toHaveLength(0);
    expect(avisos.some((a) => /No hay datos pendientes/.test(a)), 'no puede decir que no hay nada').toBe(false);
    expect(avisos.some((a) => /días anteriores/.test(a) && /Enviarlas/.test(a))).toBe(true);
    expect(document.getElementById('slbl').textContent).not.toMatch(/Sin datos nuevos|Todo sincronizado/);
  });

  it('sin nada de hoy ni de antes, el aviso de siempre', async () => {
    await H.syncAll();
    expect(avisos.some((a) => /No hay datos pendientes/.test(a))).toBe(true);
  });

  it('sin ninguna fecha, un envío con la de hoy', async () => {
    H.saveE(1, 'calidad', cal(''));
    await H.syncAll();
    expect(fechas()).toEqual([hoy]);
  });

  it('Parámetros y Desinfección siguen con su envío propio', async () => {
    H.saveE(1, 'poblacion', pob(hoy));
    H.saveE(1, 'calidad', cal(ayer));
    H.saveE(1, 'params', { ...COMUN, fecha: anteayer, 'od_0_02:00': '5,5' });
    await H.syncAll();
    expect(envios.map((e) => e.p.sheetName)).toEqual(['Datos Larvicultura - M01', 'Datos Larvicultura - M01', 'Control_Tanque M01']);
  });
});
