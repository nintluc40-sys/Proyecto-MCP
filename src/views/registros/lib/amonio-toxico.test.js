// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Calidad de Agua — el Amonio Tóxico se CALCULA

   El Amonio Tóxico (NH₃) no se mide: se deriva del TAN según la salinidad, el pH y
   la temperatura. El laboratorio lo venía sacando a mano con un Excel
   («Calculo NH3.xlsx»), y el usuario pidió (2026-08-26) que salga solo al
   completar las cuatro variables.

   EL FIXTURE NO ES INVENTADO: son las DOS filas del Excel del usuario, con el
   resultado que esa hoja tiene almacenado hasta el último decimal. Es lo único que
   demuestra que la app y la hoja dicen lo mismo — una fórmula «parecida» daría
   números plausibles y nadie notaría la diferencia hasta una reclamación.

   TRES REGLAS QUE NO SE VEN Y HAY QUE VIGILAR
   1. El modelo TIENE TOPE de salinidad: el Excel devuelve «↑S» cuando K > 0,85
      (S ≈ 40,9 ‰). Extrapolar daría un número con apariencia de bueno.
   2. Con alguna variable en blanco NO hay resultado. El Excel sí da uno (su fila
      13, con todo vacío, devuelve 8,8·10⁻¹¹); eso es un artefacto de la hoja y no
      se imita.
   3. El término de temperatura usa 273, no 273,15. Cambiarlo mueve el resultado en
      la cuarta cifra, que es justo la resolución con la que se decide si el valor
      pasa del límite de 0,1 mg/L.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['calAmonioTox', 'CAL_AMTOX_K_MAX', 'CAL_AMTOX_DEPS', 'CAL_FORMATS',
  'calCalcCell', 'renderCalNuevo', 'micTypeSet', 'loadCalDraft', 'saveCalDraft',
  'calEditSession', '_calSave', 'calSessionKey', 'collectCalDraft'];
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
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

describe('Amonio Tóxico · la app da EXACTAMENTE lo que da el Excel', () => {
  it('🔴 fila 1 del Excel: S=35 · pH=7,99 · T=28,7 · TAN=2', () => {
    const r = H.calAmonioTox(35, 7.99, 28.7, 2);
    expect(r.estado).toBe('ok');
    // Valor almacenado en la celda G11 de «Calculo NH3.xlsx».
    expect(r.valor).toBeCloseTo(0.11388236390272104, 12);
  });

  it('🔴 fila 2 del Excel: S=34,5 · pH=8,01 · T=27,9 · TAN=0,02', () => {
    const r = H.calAmonioTox(34.5, 8.01, 27.9, 0.02);
    expect(r.estado).toBe('ok');
    // Celda G12. Un TAN pequeño: comprueba que la proporcionalidad se mantiene.
    expect(r.valor).toBeCloseTo(0.0011273069021206746, 14);
  });

  it('el resultado es PROPORCIONAL al TAN', () => {
    // NH₃ = TAN · f, y `f` no depende del TAN: duplicarlo duplica el resultado.
    const a = H.calAmonioTox(35, 7.99, 28.7, 2).valor;
    const b = H.calAmonioTox(35, 7.99, 28.7, 4).valor;
    expect(b).toBeCloseTo(a * 2, 12);
  });
});

describe('Amonio Tóxico · cuándo NO hay resultado', () => {
  it('🔴 sin las cuatro variables no se inventa un número', () => {
    // El Excel sí lo hace (su fila vacía devuelve 8,8e-11). Aquí no.
    expect(H.calAmonioTox('', 7.99, 28.7, 2).estado).toBe('faltan');
    expect(H.calAmonioTox(35, '', 28.7, 2).estado).toBe('faltan');
    expect(H.calAmonioTox(35, 7.99, '', 2).estado).toBe('faltan');
    expect(H.calAmonioTox(35, 7.99, 28.7, '').estado).toBe('faltan');
    expect(H.calAmonioTox('a', 'b', 'c', 'd').estado).toBe('faltan');
  });

  it('🔴 por encima del tope de salinidad NO se extrapola', () => {
    // K > 0,85 ⇔ S ≈ 40,90 ‰. El Excel devuelve «↑S» y deja de calcular.
    expect(H.calAmonioTox(40, 7.99, 28.7, 2).estado, 'a 40 ‰ el modelo aún vale').toBe('ok');
    expect(H.calAmonioTox(45, 7.99, 28.7, 2).estado, 'a 45 ‰ ya no').toBe('fuera');
    // El corte se comprueba a los dos lados del umbral, no sólo lejos de él: un
    // tope movido a 0,9 o a 0,8 pasaría desapercibido midiendo sólo 35 y 45.
    expect(H.calAmonioTox(40.8, 7.99, 28.7, 2).estado).toBe('ok');
    expect(H.calAmonioTox(41, 7.99, 28.7, 2).estado).toBe('fuera');
  });

  it('el tope es el del Excel', () => {
    expect(H.CAL_AMTOX_K_MAX).toBe(0.85);
  });
});

describe('Amonio Tóxico · dónde se aplica', () => {
  it('🔴 los formatos con Am.Tóxico traen las CUATRO variables', () => {
    // Si un formato tuviera `amtox` sin alguna de las cuatro, su campo no se
    // rellenaría nunca y sería el único a mano, sin que nada lo explicara.
    // «Maduración · Agua» ganó Temperatura por esto (2026-08-26).
    const faltan = [];
    Object.entries(H.CAL_FORMATS).forEach(([k, f]) => {
      const p = f.params || [];
      if (!p.includes('amtox')) return;
      H.CAL_AMTOX_DEPS.forEach((d) => { if (!p.includes(d)) faltan.push(k + ' sin ' + d); });
    });
    expect(faltan).toEqual([]);
  });

  it('las cuatro dependencias son las del Excel', () => {
    expect([...H.CAL_AMTOX_DEPS].sort()).toEqual(['ph', 'sal', 'tan', 'temp']);
  });

  it('🔴 «Maduración · Agua» conserva el resto de sus parámetros', () => {
    // Añadir Temperatura no puede haberse llevado por delante ninguna columna.
    const p = H.CAL_FORMATS['mad-agua'].params;
    ['alc', 'ph', 'sal', 'temp', 'tan', 'amtox', 'cl_libre', 'cl_total', 'cl_comb']
      .forEach((k) => expect(p, 'falta ' + k).toContain(k));
  });
});

describe('Amonio Tóxico · en la grilla de verdad', () => {
  /* Las pruebas de arriba comprueban la FÓRMULA. Ésta comprueba que además llegue
     a la pantalla: un cálculo correcto que nadie cablea al campo se ve
     exactamente igual que no haberlo hecho. Se maneja la grilla como el analista:
     se escribe en las celdas y se dispara el mismo `oninput` que dispara el
     navegador. */
  const celda = (fmt, fila, k) => document.querySelector(`[name="cal_${fmt}_${fila}_${k}"]`);
  const escribir = (fmt, fila, k, v) => {
    const el = celda(fmt, fila, k);
    el.value = String(v);
    H.calCalcCell(el);
    return el;
  };

  function abrirGrilla() {
    localStorage.clear();
    H.micTypeSet('cal');
    H.renderCalNuevo();
  }

  it('🔴 el campo se rellena SOLO al completar las cuatro variables', () => {
    abrirGrilla();
    const out = celda('larv', 1, 'amtox');
    expect(out, 'no se encontró la celda de Amonio Tóxico').toBeTruthy();

    escribir('larv', 1, 'sal', 35);
    escribir('larv', 1, 'ph', 7.99);
    escribir('larv', 1, 'temp', 28.7);
    expect(out.value, 'con tres variables todavía no debe calcular').toBe('');

    escribir('larv', 1, 'tan', 2);
    expect(Number(out.value)).toBeCloseTo(0.1139, 4);
  });

  it('🔴 el campo NO se puede teclear: el valor se deriva', () => {
    abrirGrilla();
    expect(celda('larv', 1, 'amtox').hasAttribute('readonly')).toBe(true);
  });

  it('🔴 cambiar cualquiera de las cuatro rehace el cálculo', () => {
    abrirGrilla();
    escribir('larv', 1, 'sal', 35);
    escribir('larv', 1, 'ph', 7.99);
    escribir('larv', 1, 'temp', 28.7);
    escribir('larv', 1, 'tan', 2);
    const antes = Number(celda('larv', 1, 'amtox').value);
    // Subir el pH desplaza el equilibrio hacia el NH₃: tiene que SUBIR.
    escribir('larv', 1, 'ph', 8.5);
    const despues = Number(celda('larv', 1, 'amtox').value);
    expect(despues).toBeGreaterThan(antes);
  });

  it('🔴 con la salinidad fuera del modelo se vacía y se avisa', () => {
    abrirGrilla();
    escribir('larv', 1, 'sal', 35);
    escribir('larv', 1, 'ph', 7.99);
    escribir('larv', 1, 'temp', 28.7);
    escribir('larv', 1, 'tan', 2);
    expect(celda('larv', 1, 'amtox').value).not.toBe('');
    escribir('larv', 1, 'sal', 45);
    const out = celda('larv', 1, 'amtox');
    expect(out.value, 'no puede quedarse el valor viejo, que ya no aplica').toBe('');
    expect(out.title).toContain('fuera del rango');
  });

  it('🔴 cada fila calcula la SUYA', () => {
    // Con una sola fila, un cálculo que escribiera en la celda equivocada pasaría
    // desapercibido.
    abrirGrilla();
    escribir('larv', 2, 'sal', 35);
    escribir('larv', 2, 'ph', 7.99);
    escribir('larv', 2, 'temp', 28.7);
    escribir('larv', 2, 'tan', 2);
    expect(celda('larv', 1, 'amtox').value, 'la fila 1 no se ha tocado').toBe('');
    expect(Number(celda('larv', 2, 'amtox').value)).toBeCloseTo(0.1139, 4);
  });

  it('🔴 «Maduración · Agua» ya puede calcularlo', () => {
    // Era el formato que no tenía Temperatura.
    localStorage.clear();
    H.micTypeSet('cal');
    const d = H.loadCalDraft(); d.activeFmt = 'mad-agua'; H.saveCalDraft(d);
    H.renderCalNuevo();
    escribir('mad-agua', 1, 'sal', 35);
    escribir('mad-agua', 1, 'ph', 7.99);
    escribir('mad-agua', 1, 'temp', 28.7);
    escribir('mad-agua', 1, 'tan', 2);
    expect(Number(celda('mad-agua', 1, 'amtox').value)).toBeCloseTo(0.1139, 4);
  });
});

describe('Amonio Tóxico · «no tocar nunca lo ya guardado»', () => {
  /* Las dos decisiones del usuario chocan justo aquí: el campo es CALCULADO y de
     sólo lectura, pero un registro guardado ANTES de esta función puede traer un
     Amonio Tóxico tecleado a mano, y ése no se pisa.

     La reconciliación: lo que llega escrito desde el historial se marca como
     heredado, se conserva y se queda EDITABLE —bloquearlo dejaría un dato viejo
     imposible de corregir, que no es lo que se pidió—. Todo lo demás lo calcula
     la fórmula y va bloqueado. */
  const celda = (fmt, fila, k) => document.querySelector(`[name="cal_${fmt}_${fila}_${k}"]`);

  function sesionGuardada(amtox) {
    localStorage.clear();
    H.micTypeSet('cal');
    const base = {
      fechaMuestreo: '2026-08-01', fechaResultados: '', corrida: '900',
      departamento: 'Larvicultura', formato: 'larv', responsable: 'Ana',
      sid: 'cTEST', fila: '1',
      sal: '35', ph: '7.99', temp: '28.7', tan: '2', amtox,
    };
    H._calSave([{ id: 'r1', ts: Date.now(), synced: true, data: base }]);
    return H.calSessionKey(base);
  }

  it('🔴 un Amonio Tóxico heredado NO lo pisa la fórmula', () => {
    // 0.5 es un valor que la fórmula JAMÁS daría con esas cuatro variables
    // (daría ≈0.1139): si se recalculara, el 0.5 desaparecería.
    H.calEditSession(sesionGuardada('0.5'));
    const out = celda('larv', 1, 'amtox');
    expect(out.value, 'el valor guardado se ha perdido').toBe('0.5');
  });

  it('🔴 el heredado TAMPOCO se puede teclear', () => {
    /* Aclaración del usuario: lo registrado a mano hasta hoy no se modifica, así
       que el campo es SIEMPRE de sólo lectura. La marca `data-amtox-manual` no
       decide si se puede escribir —nunca se puede—: sólo impide que el cálculo
       lo pise. Es una regla sola y no dos, que era el riesgo de la versión
       anterior: un campo que unas veces se dejaba teclear y otras no. */
    H.calEditSession(sesionGuardada('0.5'));
    const out = celda('larv', 1, 'amtox');
    expect(out.hasAttribute('readonly')).toBe(true);
    expect(out.dataset.amtoxManual).toBe('1');
    expect(out.title).toContain('se conserva tal cual');
  });

  it('🔴 una sesión SIN Amonio Tóxico guardado sí se calcula', () => {
    // La marca no puede pegarse a todas las filas recuperadas: sólo a las que
    // traían un valor. Si no, recuperar una sesión desactivaría el cálculo.
    H.calEditSession(sesionGuardada(''));
    const out = celda('larv', 1, 'amtox');
    expect(out.hasAttribute('readonly'), 'debería estar bloqueado y calculado').toBe(true);
    expect(Number(out.value)).toBeCloseTo(0.1139, 4);
  });
});

describe('Amonio Tóxico · llega a la hoja', () => {
  /* Último eslabón: que el valor calculado no se quede en la pantalla. Un campo
     `readonly` se lee igual con `.value`, pero eso hay que demostrarlo — si el
     colector lo saltara, el analista vería el número y la hoja recibiría un hueco,
     que es el peor de los dos mundos. */
  it('🔴 el colector del borrador recoge el valor CALCULADO', () => {
    localStorage.clear();
    H.micTypeSet('cal');
    H.renderCalNuevo();
    const esc = (k, v) => {
      const el = document.querySelector(`[name="cal_larv_1_${k}"]`);
      el.value = String(v); H.calCalcCell(el);
    };
    esc('sal', 35); esc('ph', 7.99); esc('temp', 28.7); esc('tan', 2);

    const draft = H.collectCalDraft();
    const fila = draft.sections.larv.rows[0];
    expect(Number(fila.amtox), 'el Amonio Tóxico no llegó al borrador').toBeCloseTo(0.1139, 4);
    // Y las cuatro variables viajan con él: sin ellas la hoja no permitiría
    // rehacer el cálculo ni auditarlo.
    expect(Number(fila.sal)).toBe(35);
    expect(Number(fila.ph)).toBeCloseTo(7.99, 6);
    expect(Number(fila.temp)).toBeCloseTo(28.7, 6);
    expect(Number(fila.tan)).toBe(2);
  });
});
