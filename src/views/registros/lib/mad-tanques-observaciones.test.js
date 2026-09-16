// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES · las observaciones son MULTISELECCIÓN (usuario, 2026-09-15)

   PEDIDO: «que en vez de sólo escribir tenga estas opciones […]. Que sea multiselección, porque
   un tanque puede padecer por a o b motivo. A su vez, hacerle un desplazamiento vertical en
   todas las filas de cada tanque, pero que igual todas se puedan modificar». Y una columna
   nueva, «Observaciones operativas», igual.

   🔑 LO QUE DE VERDAD SE VIGILA AQUÍ:
     1 · que lo elegido llegue a la hoja EN EL ORDEN DE LA LISTA y no en el de marcado. Es lo
         que hace que dos tanques con lo mismo marcado produzcan la MISMA cadena, y sin eso
         volver a contar observaciones sería tan imposible como con el texto libre que sustituye;
     2 · que la columna nueva vaya AL FINAL. Esta hoja se escribe por posición (la llave del GAS
         es [0,1,3]) y ya tiene filas: insertar en medio las corre todas;
     3 · que la bajada respete lo que el usuario tocó a mano, igual que la de los pesos.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'madTanquesSalaChange', '_collectTanquesGrid', 'buildMadPayload',
  'madTqObsBaja', 'madTqObsLista', 'madTqObsTexto', 'MAD_TQ_OBS_SANITARIAS', 'MAD_TQ_OBS_OPERATIVAS',
  'MAD_TANQUES_POR_SALA', 'today'];
const H = {};

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
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

const SALA = 'Sala 5';                      // tanques 7, 8, 9, 10 y 11
const celda = (tq, k) => document.querySelector('#fp-tanques .tg-ms[data-k="' + k + '"][data-tq="' + tq + '"]');
const casilla = (tq, k, valor) => [...celda(tq, k).querySelectorAll('.tg-ms-op')].find((c) => c.value === valor);
const marcadas = (tq, k) => [...celda(tq, k).querySelectorAll('.tg-ms-op:checked')].map((c) => c.value);
const rotulo = (tq, k) => celda(tq, k).querySelector('.tg-ms-res').textContent;
/** Marcar como lo haría el usuario: tocar la casilla y disparar su asa. */
const marcar = (tq, k, valor, on = true) => { const c = casilla(tq, k, valor); c.checked = on; H.madTqObsBaja(c); };
const fila = (tq) => H._collectTanquesGrid().find((r) => r.tanque === tq) || {};

beforeEach(() => {
  localStorage.clear();
  H.renderMadTanques();
  document.getElementById('mad-tanques-sala').value = SALA;
  H.madTanquesSalaChange();
});

describe('Tanques · las observaciones son de catálogo, no texto libre', () => {
  it('el fixture ejerce algo: las dos columnas existen con sus opciones', () => {
    expect(H.MAD_TQ_OBS_SANITARIAS).toHaveLength(8);
    expect(H.MAD_TQ_OBS_OPERATIVAS).toHaveLength(11);
    expect(H.MAD_TQ_OBS_SANITARIAS[0]).toBe('Animales maduros — Nivel bajo');
    expect(H.MAD_TQ_OBS_OPERATIVAS[0]).toBe('Residuales de alimento — Nivel bajo');
    expect(celda(7, 'obs_sanitarias'), 'la celda debería ser multiselección').toBeTruthy();
    expect(celda(7, 'obs_operativas')).toBeTruthy();
    expect(celda(7, 'obs_sanitarias').querySelectorAll('.tg-ms-op')).toHaveLength(8);
  });

  it('🔴 varias a la vez: un tanque puede padecer por a o b motivo', () => {
    marcar(7, 'obs_sanitarias', 'Animales estresados');
    marcar(7, 'obs_sanitarias', 'Animales en muda');
    expect(marcadas(7, 'obs_sanitarias')).toEqual(['Animales estresados', 'Animales en muda']);
  });

  it('🔴 a la hoja llegan EN EL ORDEN DE LA LISTA, no en el de marcado', () => {
    /* Sin esto, dos tanques con lo mismo marcado darían cadenas distintas y volver a contarlas
       sería tan imposible como con el texto libre que esto sustituye. */
    marcar(7, 'obs_sanitarias', 'Animales en muda');          // la 7.ª de la lista
    marcar(7, 'obs_sanitarias', 'Animales aclimatados');      // la 4.ª
    expect(fila(7).obs_sanitarias).toBe('Animales aclimatados, Animales en muda');
  });

  it('el resumen de la celda enseña lo elegido, y «—» cuando no hay nada', () => {
    expect(rotulo(8, 'obs_operativas')).toBe('—');
    marcar(8, 'obs_operativas', 'Falta de sifoneo');
    expect(rotulo(8, 'obs_operativas')).toBe('Falta de sifoneo');
  });

  it('desmarcar deja la celda vacía y la fila no se guarda por ella sola', () => {
    marcar(9, 'obs_sanitarias', 'Animales estresados');
    expect(fila(9).obs_sanitarias).toBe('Animales estresados');
    marcar(9, 'obs_sanitarias', 'Animales estresados', false);
    expect(H._collectTanquesGrid().find((r) => r.tanque === 9), 'una fila sin nada no se guarda').toBeUndefined();
  });

  it('🔑 `madTqObsLista` descarta lo que no está en el catálogo', () => {
    // Una celda vieja con texto libre no puede inventarse como opción ni colarse en la hoja.
    expect(H.madTqObsLista(H.MAD_TQ_OBS_SANITARIAS, 'Animales en muda, lo que sea, Animales estresados'))
      .toEqual(['Animales estresados', 'Animales en muda']);
    expect(H.madTqObsTexto(H.MAD_TQ_OBS_SANITARIAS, 'nada de esto')).toBe('');
    expect(H.madTqObsTexto(H.MAD_TQ_OBS_SANITARIAS, '')).toBe('');
  });
});

describe('Tanques · las observaciones BAJAN por su columna', () => {
  const columna = (k) => H.MAD_TANQUES_POR_SALA[SALA].map((t) => marcadas(t, k).join(', '));

  it('🔴 lo marcado arriba baja a todas las de abajo', () => {
    marcar(7, 'obs_operativas', 'Recambio realizado');
    expect(columna('obs_operativas')).toEqual(['Recambio realizado', 'Recambio realizado', 'Recambio realizado', 'Recambio realizado', 'Recambio realizado']);
    expect(columna('obs_sanitarias'), 'se metió en la otra columna').toEqual(['', '', '', '', '']);
  });

  it('🔴 bajar una columna no BORRA lo que la otra ya había bajado', () => {
    /* Lo encontró el banco, no el uso. Sin el filtro por columna, la bajada recorre TODAS las
       celdas de abajo y les pone las casillas de la columna que se está tocando: las de la otra
       columna no coinciden con ninguna, así que se apagan. Con las dos columnas vacías el efecto
       no se ve —por eso el caso de arriba no bastaba—; se ve cuando la otra ya tenía algo. */
    marcar(7, 'obs_sanitarias', 'Animales estresados');
    expect(columna('obs_sanitarias')).toEqual(Array(5).fill('Animales estresados'));
    marcar(7, 'obs_operativas', 'Recambio realizado');
    expect(columna('obs_sanitarias'), 'la bajada de operativas se llevó las sanitarias')
      .toEqual(Array(5).fill('Animales estresados'));
  });

  it('🔴 una fila corregida a mano NO se pisa al retocar la de arriba', () => {
    marcar(7, 'obs_operativas', 'Recambio realizado');
    marcar(10, 'obs_operativas', 'Falta de recambio');            // corrección a mano
    marcar(7, 'obs_operativas', 'En recambio');                   // se retoca el de arriba
    expect(columna('obs_operativas')).toEqual([
      'En recambio, Recambio realizado', 'En recambio, Recambio realizado', 'En recambio, Recambio realizado',
      'Recambio realizado, Falta de recambio', 'En recambio, Recambio realizado',
    ]);
  });

  it('baja hacia ABAJO: marcar en medio no toca lo de arriba', () => {
    marcar(9, 'obs_sanitarias', 'Animales en muda');
    expect(columna('obs_sanitarias')).toEqual(['', '', 'Animales en muda', 'Animales en muda', 'Animales en muda']);
  });

  it('desmarcar también baja: se vacían las que no se tocaron', () => {
    marcar(7, 'obs_sanitarias', 'Animales estresados');
    marcar(7, 'obs_sanitarias', 'Animales estresados', false);
    expect(columna('obs_sanitarias')).toEqual(['', '', '', '', '']);
  });
});

describe('Tanques · la columna nueva va AL FINAL de la hoja', () => {
  it('🔴 «Observaciones operativas» es la ÚLTIMA cabecera', () => {
    /* Esta hoja se escribe POR POSICIÓN —la llave del GAS es [0,1,3]— y ya tiene filas en
       producción: insertar una columna en medio las corre todas y destruye datos en cada sync.
       Al final no mueve ninguna. */
    marcar(7, 'obs_sanitarias', 'Animales aclimatados');
    const p = H.buildMadPayload('tanques', H._collectTanquesGrid().map((d) => ({ data: d })));
    expect(p.headers[p.headers.length - 1]).toBe('Observaciones operativas');
    expect(p.headers[p.headers.length - 2]).toBe('Observaciones sanitarias');
    expect(p.headers.slice(0, 4), 'la llave [0,1,3] no se puede mover').toEqual(['Fecha', 'Sala', 'Lote', 'Tanque']);
    expect(p.rows[0]).toHaveLength(p.headers.length);
  });

  it('🔴 cada observación cae bajo SU cabecera, no corrida', () => {
    marcar(7, 'obs_sanitarias', 'Animales estresados');
    marcar(7, 'obs_operativas', 'Sifoneo bajo');
    const p = H.buildMadPayload('tanques', H._collectTanquesGrid().map((d) => ({ data: d })));
    const c = (h) => p.headers.indexOf(h);
    expect(p.rows[0][c('Observaciones sanitarias')]).toBe('Animales estresados');
    expect(p.rows[0][c('Observaciones operativas')]).toBe('Sifoneo bajo');
  });
});
