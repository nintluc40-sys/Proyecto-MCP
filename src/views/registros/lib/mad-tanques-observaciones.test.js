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
  'MAD_TANQUES_POR_SALA', 'today',
  'saveMadTanquesGrid', 'loadMad', 'saveMadList', '_madParteSiguiente', '_madParteAbierto'];   // parte de mortalidad
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
  /* ⚠ 2026-09-17 · AQUÍ SE EXIGÍA QUE «Observaciones operativas» FUERA LA ÚLTIMA, y eso fijaba una foto en
     vez de la regla: el parte de mortalidad le puso «Hora» y «Parte» detrás, que es exactamente el
     movimiento PERMITIDO. Lo que hay que exigir es lo que de verdad protege —que ninguna columna YA
     EXISTENTE se mueva de sitio— porque esta hoja se escribe POR POSICIÓN: insertar una en medio corre
     todas las de detrás y destruye datos en cada sync. */
  it('🔴 lo que ya existía no se mueve: una columna nueva sólo puede ir DETRÁS', () => {
    const YA_EXISTÍAN = ['Fecha', 'Sala', 'Lote', 'Tanque', 'Población inicial hembras', 'Población inicial machos',
      'Machos muertos', 'Hembras muertas', 'Machos muertos por descarte de selección',
      'Hembras muertas por descarte de selección', 'Cópulas', 'Muda', 'Peso promedio machos (g)',
      'Peso promedio hembras (g)', 'Observaciones sanitarias', 'Observaciones operativas'];
    marcar(7, 'obs_sanitarias', 'Animales aclimatados');
    const p = H.buildMadPayload('tanques', H._collectTanquesGrid().map((d) => ({ data: d })));
    expect(p.headers.slice(0, YA_EXISTÍAN.length), 'una columna se movió de sitio').toEqual(YA_EXISTÍAN);
    expect(p.rows[0]).toHaveLength(p.headers.length);
  });

  it('🔴 «Hora» y «Parte» van al final, y en las posiciones que declara la llave del GAS', () => {
    marcar(7, 'obs_sanitarias', 'Animales aclimatados');
    const p = H.buildMadPayload('tanques', H._collectTanquesGrid().map((d) => ({ data: d })));
    expect(p.headers.slice(-2)).toEqual(['Hora', 'Parte']);
    // 16 y 17 en base 0: es lo que dice `madKeyCols = [0,1,3,16,17]` en el GAS para esta hoja.
    expect([p.headers.indexOf('Hora'), p.headers.indexOf('Parte')]).toEqual([16, 17]);
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

/* ══════════════════════════════════════════════════════════════
   EL PARTE DE LA RONDA (usuario, 2026-09-17)

   «Se recogen mortalidades 5 veces al día… lo que hacen es en una hoja ir llenando poco a poco lo que
   encuentran y al finalizar del día suman.» Antes la llave era (Fecha, Sala, Tanque) y el segundo
   registro del día PISABA al primero, así que sumar a mano era la única salida.
   Ahora cada ronda es su propia fila, con su HORA y su número de PARTE puestos por EL SISTEMA.

   🔑 Y la suma sale bien porque cada parte trae LO DE SU RONDA, no el acumulado: la muda se recoge
   junto con la mortalidad —sumarla es lo correcto— y las cópulas se registran una sola vez, así que
   en los demás partes van vacías.
   ══════════════════════════════════════════════════════════════ */
describe('Tanques · cada ronda es un PARTE', () => {
  const guardado = () => H.loadMad('tanques');
  const deTanque = (tq) => guardado().filter((r) => String(r.data.tanque) === String(tq));
  const poner = (tq, k, v) => {
    const el = document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]');
    if (!el) throw new Error('sin celda ' + k + ' del tanque ' + tq);
    el.value = String(v);
  };

  it('🔴 dos guardados del mismo día son DOS filas, no una que pisa a la otra', () => {
    poner(7, 'machos_muertos', 3);
    H.saveMadTanquesGrid();
    poner(7, 'machos_muertos', 2);
    H.saveMadTanquesGrid();
    const filas = deTanque(7);
    expect(filas, 'el segundo parte pisó al primero').toHaveLength(2);
    expect(filas.map((r) => r.data.machos_muertos).sort()).toEqual([2, 3]);
    expect(filas.map((r) => r.data.parte).sort()).toEqual([1, 2]);
  });

  it('🔴 la hora y el parte los pone el SISTEMA, no el usuario', () => {
    poner(7, 'machos_muertos', 1);
    H.saveMadTanquesGrid();
    const d = deTanque(7)[0].data;
    expect(d.parte, 'el primero del día es el 1').toBe(1);
    expect(d.hora, 'la hora es HH:MM del dispositivo').toMatch(/^\d{2}:\d{2}$/);
    expect(document.querySelector('#fp-tanques [name$="_parte"]'), 'no se teclea').toBeNull();
    expect(document.querySelector('#fp-tanques [name$="_hora"]')).toBeNull();
  });

  it('🔴 el parte se cierra al guardar: la grilla queda limpia para la ronda siguiente', () => {
    /* Sin esto, el auto-guardado de al navegar escribiría la ronda 2 ENCIMA de la 1 y se perderían. */
    poner(7, 'machos_muertos', 4);
    H.saveMadTanquesGrid();
    expect(document.querySelector('#fp-tanques [name="tg_7_machos_muertos"]').value).toBe('');
    expect(H._collectTanquesGrid(), 'la grilla vacía no tiene nada que recoger').toEqual([]);
  });

  it('🔴 el AUTO-guardado actualiza el parte abierto, NO abre otro', () => {
    poner(7, 'machos_muertos', 5);
    H.saveMadTanquesGrid({ silent: true, noRender: true });          // como al cambiar de sala o pestaña
    poner(7, 'hembras_muertas', 2);
    H.saveMadTanquesGrid({ silent: true, noRender: true });
    const filas = deTanque(7);
    expect(filas, 'navegar no puede inflar los partes').toHaveLength(1);
    expect([filas[0].data.machos_muertos, filas[0].data.hembras_muertas]).toEqual([5, 2]);
  });

  it('🔴 y el parte SIGUIENTE se cuenta por (fecha, sala): el día es la suma de sus rondas', () => {
    expect(H._madParteSiguiente(guardado(), H.today(), SALA), 'sin nada guardado, el primero').toBe(1);
    poner(7, 'machos_muertos', 1); H.saveMadTanquesGrid();
    poner(8, 'machos_muertos', 1); H.saveMadTanquesGrid();
    expect(H._madParteSiguiente(guardado(), H.today(), SALA)).toBe(3);
    // Tras un guardado EXPLÍCITO no queda ninguno abierto: eso es lo que deja la grilla limpia.
    expect(H._madParteAbierto(guardado(), H.today(), SALA)).toBe('');
    poner(9, 'machos_muertos', 1);
    H.saveMadTanquesGrid({ silent: true, noRender: true });
    expect(H._madParteAbierto(guardado(), H.today(), SALA), 'el auto-guardado abre el 3').toBe(3);
  });

  it('el fixture ejerce algo: las cuatro columnas de mortalidad van en el parte, y las cópulas pueden ir vacías', () => {
    poner(7, 'machos_muertos', 3);
    poner(7, 'muda', 4);
    H.saveMadTanquesGrid();                       // ronda 1: mortalidad + muda, sin cópulas
    poner(7, 'machos_muertos', 2);
    poner(7, 'muda', 1);
    poner(7, 'copulas', 9);                       // las cópulas, una sola vez, a su hora
    H.saveMadTanquesGrid();
    const d = deTanque(7).sort((a, b) => a.data.parte - b.data.parte).map((r) => r.data);
    expect([d[0].machos_muertos, d[1].machos_muertos], 'la mortalidad suma 5 entre las dos rondas').toEqual([3, 2]);
    expect([d[0].muda, d[1].muda], 'la muda también, porque se recoge con ella').toEqual([4, 1]);
    expect(d[0].copulas || '', 'en la ronda sin cópulas la celda va vacía').toBe('');
    expect(d[1].copulas).toBe(9);
  });
});

describe('Tanques · el parte se cuenta por SALA, no sólo por fecha', () => {
  const guardado = () => H.loadMad('tanques');
  const poner = (tq, k, v) => {
    const el = document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]');
    if (!el) throw new Error('sin celda ' + k + ' del tanque ' + tq);
    el.value = String(v);
  };
  const irASala = (s) => { document.getElementById('mad-tanques-sala').value = s; H.madTanquesSalaChange(); };

  /* 🔴 Cada sala lleva SU ronda: el chequeador de la Sala 1 no va a la vez que el de la Sala 5. Si la
     numeración fuera sólo por fecha, el primer parte de una sala saldría con el número que dejó la otra
     —«parte 4» sin que hubiera habido tres— y el orden del día dejaría de significar nada. */
  it('🔴 el primer parte de cada sala es el 1, aunque la otra ya vaya por el 2', () => {
    irASala('Sala 5');
    poner(7, 'machos_muertos', 1); H.saveMadTanquesGrid();
    poner(7, 'machos_muertos', 2); H.saveMadTanquesGrid();
    expect(H._madParteSiguiente(guardado(), H.today(), 'Sala 5'), 'la Sala 5 va por dos').toBe(3);

    irASala('Sala 1');
    poner(1, 'machos_muertos', 5); H.saveMadTanquesGrid();
    const enSala1 = guardado().filter((r) => r.data.sala === 'Sala 1');
    expect(enSala1, 'el fixture ejerce algo: se guardó en la otra sala').toHaveLength(1);
    expect(enSala1[0].data.parte, 'heredó la numeración de la Sala 5').toBe(1);
  });
});
