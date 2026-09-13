// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · SALAS · LA TEMPERATURA NO PASA DE 40 °C, Y FUERA DE RANGO NO SE RECORTA

   Decisión del usuario (2026-09-12, punto D13): «la temperatura no debe ser mayor a 40 °C».

   🔴 EL DEFECTO QUE HABÍA DEBAJO, y que hace que bajar el número no baste. El colector de la
   grilla hacía sanitizeNum(v, 0, 50), y sanitizeNum RECORTA al rango. Un «289» tecleado sin la
   coma se guardaba como 50 —el 50 de la Sala 5 del 2026-09-09, rodeado de 28,8 y 28,9, tiene
   toda la pinta de ser eso—, y con el tope en 40 se habría guardado como 40: una cifra
   plausible y FALSA, sin un solo aviso. Las fichas estándar ya lo resolvieron con la regla R2
   («ya NO se recorta al rango»: se marca el campo y se bloquea el guardado); esta grilla nunca
   la adoptó.

   🔑 LAS DOS FORMAS DE GUARDAR NO PUEDEN COMPORTARSE IGUAL, y las pruebas lo fijan:
     · a mano (💾 / ☁️): se BLOQUEA entero y se dice, como R2. La celda queda en rojo y con lo
       tecleado, para corregirlo ahí mismo.
     · silencioso (al cambiar de fecha o de pestaña): bloquearlo perdería TODO lo demás que se
       tecleó, así que se guardan las celdas válidas y se avisa de las que no.

   Vive sólo en el monolito, así que se arranca ENTERO sobre happy-dom.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadSalas', '_collectSalasGrid', 'saveMadSalasGrid', 'loadMad'];
const H = {};
const avisos = [];

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

  /* ⚠ `new Function` NO deja nada en globalThis: sin este epílogo no se alcanza ninguna
     función del monolito. */
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
});

beforeEach(() => {
  localStorage.clear();
  avisos.length = 0;
  H.renderMadSalas();                             // grilla limpia, del día
});

/* Sala 1 es la fila 0 de la grilla. */
const celda = (k) => document.querySelector('[name="sg_0_' + k + '"]');
const teclea = (k, v) => { celda(k).value = v; };

describe('Maduración · Salas · el rango de temperatura (D13)', () => {
  it('la celda declara 0–40 °C, que es lo que ve el navegador', () => {
    expect(celda('temp_02').min).toBe('0');
    expect(celda('temp_02').max).toBe('40');
    // y las doce horas, no sólo la primera
    for (const k of ['temp_02', 'temp_04', 'temp_12', 'temp_00']) expect(celda(k).max).toBe('40');
  });

  it('el fixture ejerce algo: una temperatura normal se recoge tal cual y sin marca', () => {
    teclea('temp_02', '28.9');
    const rows = H._collectSalasGrid();
    expect(rows).toHaveLength(1);
    expect(rows[0].temp_02).toBe(28.9);
    expect(rows.fueraDeRango || []).toHaveLength(0);
    expect(celda('temp_02').classList.contains('inp-bad')).toBe(false);
  });

  it('el tope es 40 INCLUIDO: 40 entra y 40.1 no', () => {
    teclea('temp_02', '40');
    teclea('temp_04', '40.1');
    const rows = H._collectSalasGrid();
    expect(rows[0].temp_02).toBe(40);
    expect(rows[0].temp_04).toBe('');
    expect(rows.fueraDeRango).toEqual([{ sala: 'Sala 1', hora: 'Temperatura 4:00', valor: '40.1' }]);
  });

  it('🔴 fuera de rango NO se recorta: «289» no se convierte en 40 ni en 50', () => {
    teclea('temp_06', '289');
    const rows = H._collectSalasGrid();
    expect(rows).toHaveLength(0);                   // la única celda tecleada no vale: no hay fila
    expect(rows.fueraDeRango).toHaveLength(1);
    expect(rows.fueraDeRango[0]).toMatchObject({ sala: 'Sala 1', hora: 'Temperatura 6:00', valor: '289' });
    expect(celda('temp_06').classList.contains('inp-bad')).toBe(true);
  });

  it('🔴 por debajo tampoco: «-5» no se convierte en 0', () => {
    teclea('temp_02', '28.9');
    teclea('temp_08', '-5');
    const rows = H._collectSalasGrid();
    expect(rows[0].temp_08).toBe('');
    expect(rows[0].temp_02).toBe(28.9);
    expect(rows.fueraDeRango.map((x) => x.hora)).toEqual(['Temperatura 8:00']);
  });

  it('al corregir la celda se le quita la marca roja', () => {
    teclea('temp_02', '289');
    H._collectSalasGrid();
    expect(celda('temp_02').classList.contains('inp-bad')).toBe(true);
    teclea('temp_02', '28.9');
    H._collectSalasGrid();
    expect(celda('temp_02').classList.contains('inp-bad')).toBe(false);
  });

  it('el oxígeno NO cambia: sigue su propio rango y no entra en el aviso de temperatura', () => {
    teclea('ox_06', '4.3');
    const rows = H._collectSalasGrid();
    expect(rows[0].ox_06).toBe(4.3);
    expect(rows.fueraDeRango).toHaveLength(0);
  });
});

describe('Maduración · Salas · qué pasa al GUARDAR con una temperatura fuera de rango (D13)', () => {
  it('sin nada fuera de rango, el guardado a mano funciona como siempre', () => {
    teclea('temp_02', '28.9');
    expect(H.saveMadSalasGrid()).toBe(1);
    expect(H.loadMad('salas')).toHaveLength(1);
    expect(avisos.some((a) => a.tipo === 'err')).toBe(false);
  });

  it('🔴 a mano: NO guarda NADA, devuelve -1 (la sincronización no envía) y lo dice', () => {
    teclea('temp_02', '28.9');
    teclea('temp_04', '289');
    expect(H.saveMadSalasGrid()).toBe(-1);
    expect(H.loadMad('salas')).toHaveLength(0);
    const err = avisos.find((a) => a.tipo === 'err');
    expect(err && err.msg).toContain('Temperatura 4:00');
    // toast() ya antepone su propio icono: el mensaje empieza por la sala, no por otro «⚠️»
    expect(err.msg.startsWith('Sala 1')).toBe(true);
    expect(err.msg).toContain('289');
    expect(err.msg).toContain('40');
    // lo tecleado sigue ahí para corregirlo, y marcado
    expect(celda('temp_04').value).toBe('289');
    expect(celda('temp_04').classList.contains('inp-bad')).toBe(true);
  });

  it('🔑 silencioso (al cambiar de pestaña): guarda lo válido, NO lo inválido, y avisa', () => {
    teclea('temp_02', '28.9');
    teclea('temp_04', '289');
    expect(H.saveMadSalasGrid({ silent: true, noRender: true })).toBe(1);
    const guardada = H.loadMad('salas')[0].data;
    expect(guardada.temp_02).toBe(28.9);
    expect(guardada.temp_04).toBe('');              // ni 289, ni 40, ni 50
    const warn = avisos.find((a) => a.tipo === 'warn');
    expect(warn && warn.msg).toContain('Temperatura 4:00');
    expect(warn.msg).toContain('NO se guardó');
    expect(warn.msg.startsWith('Sala 1')).toBe(true);
  });
});
