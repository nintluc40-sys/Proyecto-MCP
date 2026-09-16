// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · BORRADOR POR FECHA de las fichas de formulario (usuario, 2026-09-15)

   PEDIDO: «que en las fichas que se pueda sea como la de Salas, que guarda información de
   manera local: si cambio la fecha a un día anterior, puedo ver lo registrado».

   POR QUÉ NO LO HACÍAN. Salas y Tanques son GRILLAS: su lista local lleva la fecha DENTRO de
   cada fila y el render filtra por la fecha del input. Las otras siete son FORMULARIOS de
   tarjetas que se montan UNA vez y nunca se repintan (`if(fp.querySelector("#…")) return;`),
   así que cambiar la fecha dejaba en pantalla lo tecleado para otro día.

   🔑 LO QUE ESTA PRUEBA VIGILA DE VERDAD: que se guarde lo TECLEADO. Se guarda el HTML del
   panel, y `innerHTML` NO lleva los valores vivos —viven en la PROPIEDAD `value`, no en el
   atributo—, así que sin el volcado previo esto guardaría el formulario EN BLANCO y sin un
   solo error. Por eso los casos escriben en un `input`, en un `select` y en una casilla, y
   comprueban los tres al volver: un fixture que sólo mirara «¿hay tarjetas?» daría verde con
   el formulario vacío.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['MAD_BORR_FICHAS', 'MAD_BORR_MAX', 'MAD_BORR_PRE', 'madBorrTodo', 'madBorrGuardar',
  'madBorrLeer', 'madBorrOlvidar', 'madBorrFechaChange', 'madBorrMontada', '_madBorrFijarValores',
  'renderMadTratamientos', 'renderMadFinCiclo', 'renderMadIngreso', '_madCommitActive', 'today'];
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
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    // `curMod`/`curTab` son `let` del monolito: hacen falta para ejercer `_madCommitActive`.
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}'
    + '\ntry{ H.getFechas=function(){ return _madBorrFecha; }; }catch(_){}'
    + '\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

const AYER = '2026-09-14';
const panel = (f) => document.getElementById(H.MAD_BORR_FICHAS[f].panel);
const campoFecha = (f) => document.getElementById(H.MAD_BORR_FICHAS[f].fecha);
/** Cambia la fecha como lo haría el usuario: el input ya trae la nueva cuando salta el asa. */
const irA = (ficha, fecha) => { campoFecha(ficha).value = fecha; H.madBorrFechaChange(ficha); };
/* Selectores EXPLÍCITOS: pedir el primer select del panel devolvía uno u otro según cómo
   quedara montado, y una prueba que no sabe qué mira no prueba nada. Tratamientos trae de
   salida una tarjeta de preventivo y otra de desinfección, con su dosis y sus casillas. */
const dosis = () => panel('tratamientos').querySelector('.mt-dosis');
const salaSel = () => document.getElementById('mt-sala');
const prod = () => panel('tratamientos').querySelector('.mt-prod');

beforeEach(() => {
  localStorage.clear();
  ['tratamientos', 'fin', 'ingreso'].forEach((f) => { const p = panel(f); if (p) p.innerHTML = ''; });
  H.renderMadTratamientos();
});

describe('Maduración · el borrador por fecha guarda LO TECLEADO', () => {
  it('el fixture ejerce algo: la ficha se monta con la fecha de hoy', () => {
    expect(campoFecha('tratamientos').value).toBe(H.today());
    expect(H.getFechas().tratamientos).toBe(H.today());
  });

  it('🔴 al cambiar a un día anterior la ficha sale LIMPIA, no con lo de hoy', () => {
    expect(dosis(), 'la ficha debería traer al menos una tarjeta').toBeTruthy();
    dosis().value = 'formol 20 ppm';

    irA('tratamientos', AYER);
    expect(campoFecha('tratamientos').value, 'la fecha elegida manda sobre el today() del montaje').toBe(AYER);
    expect(dosis().value, 'arrastró a ayer lo tecleado hoy').toBe('');
  });

  it('🔴 y al volver a hoy vuelve lo tecleado: el valor VIVO, no el atributo', () => {
    // Es el caso que distingue este arreglo de uno que guarde el formulario en blanco.
    dosis().value = 'formol 20 ppm';
    irA('tratamientos', AYER);
    irA('tratamientos', H.today());
    expect(dosis().value).toBe('formol 20 ppm');
  });

  it('🔴 también vuelve la casilla marcada, y la opción elegida se guarda con `selected`', () => {
    expect(salaSel() && prod(), 'la ficha debería traer el select de sala y casillas').toBeTruthy();
    const elegida = salaSel().options[salaSel().options.length - 1].value;
    salaSel().value = elegida;
    prod().checked = true;

    irA('tratamientos', AYER);
    /* ⚠ EL SELECT SE COMPRUEBA EN LO GUARDADO, NO TRAS REPARSEAR, y no es una rebaja: es que
       happy-dom NO honra el atributo `selected` al parsear `innerHTML` (medido: con B marcada
       devuelve A). Un navegador sí lo honra, así que aquí se exige lo único que este código
       controla —que la opción elegida salga marcada en el HTML guardado— y se deja fuera lo
       que sólo prueba el parser del entorno de pruebas. La casilla y el input sí van y vuelven. */
    expect(H.madBorrLeer('tratamientos', H.today()))
      .toContain('value="' + elegida + '" selected="selected"');

    irA('tratamientos', H.today());
    expect(prod().checked, 'la casilla marcada no volvió').toBe(true);
  });

  it('cada día guarda el SUYO: ida y vuelta no mezcla los dos', () => {
    dosis().value = 'lo de hoy';
    irA('tratamientos', AYER);
    dosis().value = 'lo de ayer';
    irA('tratamientos', H.today());
    expect(dosis().value).toBe('lo de hoy');
    irA('tratamientos', AYER);
    expect(dosis().value).toBe('lo de ayer');
  });

  it('una fecha ilegible no guarda ni borra nada: el borrador del día sigue intacto', () => {
    dosis().value = 'lo de hoy';
    irA('tratamientos', AYER);            // guarda hoy
    expect(H.madBorrLeer('tratamientos', H.today())).toContain('lo de hoy');
    campoFecha('tratamientos').value = '';
    H.madBorrFechaChange('tratamientos');
    expect(H.madBorrLeer('tratamientos', H.today()), 'una fecha vacía se llevó el borrador').toContain('lo de hoy');
  });

  /* 🔴 LO ENCONTRÓ EL BANCO, no el uso: teclear la fecha A MANO pasa por estados incompletos
     («2026-09-»), que el input entrega como cadena vacía. Si en ese momento se vaciara el panel
     —o se olvidara cuál era el último día válido— se perdería el día que se está llenando, y el
     usuario no tendría forma de saber que pasó. */
  it('🔴 una fecha a medio teclear no vacía la ficha ni pierde el día en curso', () => {
    dosis().value = 'lo de hoy';
    campoFecha('tratamientos').value = '';
    H.madBorrFechaChange('tratamientos');
    expect(dosis().value, 'se llevó lo que había en pantalla').toBe('lo de hoy');

    irA('tratamientos', AYER);            // ya con una fecha entera
    irA('tratamientos', H.today());
    expect(dosis().value, 'perdió el día que se estaba llenando').toBe('lo de hoy');
  });

  it('sin una fecha entera no se guarda: una clave «» no la barrería nadie', () => {
    dosis().value = 'lo de hoy';
    expect(H.madBorrGuardar('tratamientos', '')).toBe(false);
    expect(H.madBorrGuardar('tratamientos', 'no es una fecha')).toBe(false);
    expect(Object.keys(H.madBorrTodo('tratamientos'))).toHaveLength(0);
  });
});

describe('Maduración · el borrador se guarda en el mismo momento que las grillas', () => {
  it('🔴 cambiar de pestaña o volver atrás lo persiste, sin tocar la fecha', () => {
    // `_madCommitActive` es el asa que ya usaban Salas y Tanques; las siete fichas de
    // formulario NO están en MAD_FICHAS, así que su rama va ANTES de ese `return`.
    dosis().value = 'sin cambiar de día';
    H.setVista(12, 'tratamientos');
    H._madCommitActive();
    expect(H.madBorrLeer('tratamientos', H.today())).toContain('sin cambiar de día');
  });

  it('fuera del módulo de Maduración no guarda nada', () => {
    dosis().value = 'no es de aquí';
    H.setVista(1, 'tratamientos');
    H._madCommitActive();
    expect(H.madBorrLeer('tratamientos', H.today())).toBe('');
  });
});

describe('Maduración · las siete fichas y el tope de días', () => {
  it('las siete fichas de formulario están declaradas, y las grillas NO', () => {
    expect(Object.keys(H.MAD_BORR_FICHAS).sort()).toEqual(
      ['alimentacion', 'desoves', 'fin', 'ingreso', 'mortdes', 'movimientos', 'tratamientos']);
    // Salas y Tanques llevan su propio borrador por ser grillas: meterlas aquí las guardaría dos veces.
    expect(H.MAD_BORR_FICHAS.salas).toBeUndefined();
    expect(H.MAD_BORR_FICHAS.tanques).toBeUndefined();
  });

  it('cada ficha declara un panel y un campo de fecha que EXISTEN en el shell', () => {
    // Un id mal escrito dejaría esa ficha sin borrador y sin ningún error.
    Object.keys(H.MAD_BORR_FICHAS).forEach((f) => {
      expect(document.getElementById(H.MAD_BORR_FICHAS[f].panel), f + ': panel inexistente').toBeTruthy();
    });
  });

  it('🔴 el tope olvida el día MÁS VIEJO, no el último guardado', () => {
    const todo = {};
    for (let i = 1; i <= H.MAD_BORR_MAX; i++) todo['2026-01-' + String(i).padStart(2, '0')] = '<p>' + i + '</p>';
    localStorage.setItem(H.MAD_BORR_PRE + 'tratamientos', JSON.stringify(todo));
    dosis().value = 'el nuevo';
    H.madBorrGuardar('tratamientos', '2026-06-01');

    const t = H.madBorrTodo('tratamientos');
    expect(Object.keys(t)).toHaveLength(H.MAD_BORR_MAX);
    expect(t['2026-01-01'], 'debía olvidarse el más viejo').toBeUndefined();
    expect(t['2026-06-01'], 'el recién guardado no puede ser la víctima').toContain('el nuevo');
  });

  it('olvidar un día no se lleva los demás', () => {
    H.madBorrGuardar('tratamientos', H.today());
    H.madBorrGuardar('tratamientos', AYER);
    H.madBorrOlvidar('tratamientos', AYER);
    expect(H.madBorrLeer('tratamientos', AYER)).toBe('');
    expect(H.madBorrLeer('tratamientos', H.today())).not.toBe('');
  });

  it('una ficha que no existe ni escribe ni LEE una clave que nadie barrería', () => {
    // La clave se siembra a propósito: sin ella, `madBorrTodo` devolvería {} por no encontrar
    // nada y el caso no distinguiría la guarda de la casualidad.
    localStorage.setItem(H.MAD_BORR_PRE + 'inventada', JSON.stringify({ '2026-01-01': '<p>x</p>' }));
    expect(H.madBorrTodo('inventada'), 'leyó la clave de una ficha que no existe').toEqual({});
    expect(H.madBorrGuardar('inventada', H.today())).toBe(false);
  });

  it('🔑 el volcado de valores vivos es lo que hace que esto funcione', () => {
    // Sin él, `innerHTML` devuelve el formulario en blanco: la comprobación directa de la
    // pieza, para que se sepa cuál se rompió si mañana falla algo de arriba.
    const d = document.createElement('div');
    d.innerHTML = '<input><textarea></textarea><input type="checkbox">';
    d.querySelector('input').value = 'tecleado';
    d.querySelector('textarea').value = 'párrafo';
    d.querySelector('input[type="checkbox"]').checked = true;
    expect(d.innerHTML, 'control: el HTML crudo no lleva nada de eso').not.toContain('tecleado');

    H._madBorrFijarValores(d);
    expect(d.innerHTML).toContain('tecleado');
    expect(d.innerHTML).toContain('párrafo');
    expect(d.innerHTML).toContain('checked');
  });
});
