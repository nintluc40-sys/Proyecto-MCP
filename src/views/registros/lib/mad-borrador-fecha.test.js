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

   🔴 2026-09-24 · «SI SE REGISTRA ALGO EN UNA FICHA Y SE CAMBIA LA FECHA, SE BORRA TODO» (punto 1 del usuario). Lo
   tecleado se escondía bajo la fecha anterior (R2), y el borrador sólo se guardaba al cambiar la fecha y no volvía al
   abrir la ficha, así que recargar la app lo perdía (R1). La regla nueva, decidida por él: lo tecleado se guarda AL
   TECLEAR y vuelve al abrir; al cambiar la fecha se LLEVA al día elegido si es trabajo nuevo y ese día no tiene nada,
   y si no se pregunta; sin teclear nada, la fecha enseña lo guardado de cada día. ⚠ Por eso aquí se teclea DE VERDAD
   (`teclear`, con su evento): un `value` puesto a mano no es teclear, y la ficha lo trata como no tocada.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['MAD_BORR_FICHAS', 'MAD_BORR_MAX', 'MAD_BORR_PRE', 'madBorrTodo', 'madBorrGuardar',
  'madBorrLeer', 'madBorrOlvidar', 'madBorrFechaChange', 'madBorrMontada', '_madBorrFijarValores',
  'renderMadTratamientos', 'renderMadFinCiclo', 'renderMadIngreso', '_madCommitActive', 'today',
  'selTab', 'madBorrGuardarYa', 'MAD_BORR_ESPERA_MS', 'goBack'];
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
/** Teclea como el usuario: el valor y su evento (un `value` a mano no es teclear: la ficha no se da por tocada). */
const teclear = (el, v) => {
  if (el.type === 'checkbox') el.checked = v; else el.value = v;
  el.dispatchEvent(new Event(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
  return el;
};
const MAD = 12;
/** Vuelve a abrir la ficha como tras recargar la app: panel vacío y se entra en su pestaña (`selTab` la monta). */
const reabrir = () => {
  panel('tratamientos').innerHTML = '';
  H.setVista(MAD, 'movimientos');
  H.selTab('tratamientos');
};
/** Un borrador en AYER hecho como lo hace el uso: se teclea hoy, se lleva a AYER cambiando la fecha y se vuelve a abrir
 *  la ficha (en hoy, que queda sin nada). */
const conAyer = (texto) => { teclear(dosis(), texto); irA('tratamientos', AYER); reabrir(); };
/** La respuesta a la pregunta de la fecha (Aceptar = llevar), y lo que se preguntó. Sin llamar a esto, preguntar es un fallo. */
const preguntas = [];
const responder = (si) => { globalThis.confirm = window.confirm = (m) => { preguntas.push(String(m)); return si; }; };

beforeEach(() => {
  localStorage.clear();
  preguntas.length = 0;
  globalThis.confirm = window.confirm = () => { throw new Error('esta prueba no esperaba una pregunta'); };
  ['tratamientos', 'fin', 'ingreso'].forEach((f) => { const p = panel(f); if (p) p.innerHTML = ''; });
  H.renderMadTratamientos();
});

describe('Maduración · la FECHA de una ficha con algo tecleado (punto 1, 2026-09-24)', () => {
  it('el fixture ejerce algo: la ficha se monta con la fecha de hoy', () => {
    expect(campoFecha('tratamientos').value).toBe(H.today());
    expect(H.getFechas().tratamientos).toBe(H.today());
  });

  it('🔴 R2 · lo tecleado se LLEVA al día elegido: corregir la fecha ya no deja la ficha vacía', () => {
    expect(dosis(), 'la ficha debería traer al menos una tarjeta').toBeTruthy();
    teclear(dosis(), 'formol 20 ppm');
    irA('tratamientos', AYER);
    expect(campoFecha('tratamientos').value, 'la fecha elegida manda sobre el today() del montaje').toBe(AYER);
    expect(dosis().value, 'se borró lo tecleado al cambiar la fecha').toBe('formol 20 ppm');
    expect(H.madBorrLeer('tratamientos', AYER), 'lo llevado no quedó guardado en su día').toContain('formol 20 ppm');
    expect(H.madBorrLeer('tratamientos', H.today()), 'el día que se deja se quedó con una copia').toBe('');
  });

  it('sin teclear nada, cambiar la fecha enseña lo de ese día: un día sin borrador sale LIMPIO, y no se guarda nada', () => {
    dosis().value = 'puesto a mano, sin teclear';   // no es teclear: la ficha sigue sin tocar
    irA('tratamientos', AYER);
    expect(campoFecha('tratamientos').value, 'la fecha elegida manda sobre el today() del montaje').toBe(AYER);
    expect(dosis().value).toBe('');
    expect(H.madBorrTodo('tratamientos'), 'una ficha sin tocar se guardó').toEqual({});
  });

  it('🔴 el borrador guarda el valor VIVO, no el atributo, y vuelve al abrir la ficha', () => {
    // Es el caso que distingue este arreglo de uno que guarde el formulario en blanco.
    teclear(dosis(), 'formol 20 ppm');
    H.madBorrGuardarYa('tratamientos');
    expect(H.madBorrLeer('tratamientos', H.today())).toContain('formol 20 ppm');
    reabrir();
    expect(dosis().value).toBe('formol 20 ppm');
  });

  it('🔴 también vuelve la casilla marcada, y la opción elegida se guarda con `selected`', () => {
    expect(salaSel() && prod(), 'la ficha debería traer el select de sala y casillas').toBeTruthy();
    const elegida = salaSel().options[salaSel().options.length - 1].value;
    teclear(salaSel(), elegida);
    teclear(prod(), true);
    H.madBorrGuardarYa('tratamientos');
    /* ⚠ EL SELECT SE COMPRUEBA EN LO GUARDADO, NO TRAS REPARSEAR, y no es una rebaja: es que
       happy-dom NO honra el atributo `selected` al parsear `innerHTML` (medido: con B marcada
       devuelve A). Un navegador sí lo honra, así que aquí se exige lo único que este código
       controla —que la opción elegida salga marcada en el HTML guardado— y se deja fuera lo
       que sólo prueba el parser del entorno de pruebas. La casilla y el input sí van y vuelven. */
    expect(H.madBorrLeer('tratamientos', H.today()))
      .toContain('value="' + elegida + '" selected="selected"');
    reabrir();
    expect(prod().checked, 'la casilla marcada no volvió').toBe(true);
  });

  it('cada día guarda el SUYO: sin teclear, ir y volver enseña lo de cada uno', () => {
    conAyer('lo de ayer');
    teclear(dosis(), 'lo de hoy');
    H.madBorrGuardarYa('tratamientos');
    reabrir();                                   // ya sin tocar: sólo se mira
    irA('tratamientos', AYER);
    expect(dosis().value).toBe('lo de ayer');
    irA('tratamientos', H.today());
    expect(dosis().value).toBe('lo de hoy');
  });

  it('🔴 si el día elegido YA tiene borrador, se pregunta; Aceptar lo lleva y sustituye el de ese día', () => {
    conAyer('lo de ayer');
    teclear(dosis(), 'lo nuevo');
    responder(true);
    irA('tratamientos', AYER);
    expect(preguntas, 'no preguntó').toHaveLength(1);
    expect(preguntas[0]).toContain('ya tiene datos');
    expect(dosis().value).toBe('lo nuevo');
    expect(H.madBorrLeer('tratamientos', AYER)).toContain('lo nuevo');
    expect(H.madBorrLeer('tratamientos', AYER)).not.toContain('lo de ayer');
  });

  it('🔴 …y Cancelar lo deja en su día y enseña lo del elegido', () => {
    conAyer('lo de ayer');
    teclear(dosis(), 'lo de hoy');
    responder(false);
    irA('tratamientos', AYER);
    expect(preguntas).toHaveLength(1);
    expect(dosis().value).toBe('lo de ayer');
    expect(H.madBorrLeer('tratamientos', H.today()), 'lo tecleado se perdió al cancelar').toContain('lo de hoy');
    // Lo traído del elegido está SIN tocar: volver no pregunta, y enseña lo de hoy.
    irA('tratamientos', H.today());
    expect(preguntas, 'preguntó sin haber tecleado nada').toHaveLength(1);
    expect(dosis().value).toBe('lo de hoy');
  });

  it('🔴 corregir un día que YA tenía borrador también se pregunta: Cancelar lo deja en su día; Aceptar lo lleva', () => {
    conAyer('lo de ayer');
    irA('tratamientos', AYER);                    // sólo mirar: no pregunta
    teclear(dosis(), 'corregido');
    responder(false);
    irA('tratamientos', H.today());
    expect(preguntas[0]).toContain('lo guardado del ' + AYER);
    expect(H.madBorrLeer('tratamientos', AYER)).toContain('corregido');
    expect(dosis().value).toBe('');

    irA('tratamientos', AYER);
    teclear(dosis(), 'corregido otra vez');
    responder(true);
    irA('tratamientos', H.today());
    expect(dosis().value).toBe('corregido otra vez');
    expect(H.madBorrLeer('tratamientos', H.today())).toContain('corregido otra vez');
    expect(H.madBorrLeer('tratamientos', AYER), 'el día que se dejó conservó una copia').toBe('');
  });

  it('🔴 tras ir a un día SIN nada, lo tecleado allí es trabajo nuevo: se lleva sin preguntar', () => {
    irA('tratamientos', AYER);                    // sólo mirar: sale limpio
    teclear(dosis(), 'tecleado en ayer');
    irA('tratamientos', '2026-09-13');            // no pregunta (preguntar aquí sería un fallo)
    expect(dosis().value).toBe('tecleado en ayer');
    expect(H.madBorrLeer('tratamientos', '2026-09-13')).toContain('tecleado en ayer');
  });

  it('una fecha ilegible no guarda ni borra nada: el borrador del día sigue intacto', () => {
    teclear(dosis(), 'lo de hoy');
    H.madBorrGuardarYa('tratamientos');
    campoFecha('tratamientos').value = '';
    H.madBorrFechaChange('tratamientos');
    expect(H.madBorrLeer('tratamientos', H.today()), 'una fecha vacía se llevó el borrador').toContain('lo de hoy');
    expect(dosis().value).toBe('lo de hoy');
  });

  /* 🔴 LO ENCONTRÓ EL BANCO, no el uso: teclear la fecha A MANO pasa por estados incompletos
     («2026-09-»), que el input entrega como cadena vacía. Si en ese momento se vaciara el panel
     —o se olvidara cuál era el último día válido— se perdería el día que se está llenando, y el
     usuario no tendría forma de saber que pasó. */
  it('🔴 una fecha a medio teclear no vacía la ficha ni pierde el día en curso', () => {
    teclear(dosis(), 'lo de hoy');
    campoFecha('tratamientos').value = '';
    H.madBorrFechaChange('tratamientos');
    expect(dosis().value, 'se llevó lo que había en pantalla').toBe('lo de hoy');
    expect(H.getFechas().tratamientos, 'olvidó el último día válido').toBe(H.today());

    irA('tratamientos', AYER);                    // ya con una fecha entera: se lleva
    expect(dosis().value, 'perdió el día que se estaba llenando').toBe('lo de hoy');
    expect(H.madBorrLeer('tratamientos', AYER)).toContain('lo de hoy');
  });

  it('sin una fecha entera no se guarda: una clave «» no la barrería nadie', () => {
    dosis().value = 'lo de hoy';
    expect(H.madBorrGuardar('tratamientos', '')).toBe(false);
    expect(H.madBorrGuardar('tratamientos', 'no es una fecha')).toBe(false);
    expect(Object.keys(H.madBorrTodo('tratamientos'))).toHaveLength(0);
  });
});

describe('Maduración · el borrador se guarda al TECLEAR y vuelve al abrir la ficha (R1, 2026-09-24)', () => {
  it('🔴 lo tecleado queda guardado solo, sin cambiar de pestaña ni de fecha', async () => {
    teclear(dosis(), 'sin tocar nada más');
    expect(H.madBorrLeer('tratamientos', H.today()), 'control: todavía no, se guarda al poco').toBe('');
    await new Promise((r) => setTimeout(r, H.MAD_BORR_ESPERA_MS + 150));
    expect(H.madBorrLeer('tratamientos', H.today())).toContain('sin tocar nada más');
  });

  it('🔴 cambiar de pestaña lo guarda YA (hasta el 2026-09-24 sólo lo hacía con las grillas)', () => {
    H.setVista(MAD, 'tratamientos');
    teclear(dosis(), 'antes de salir');
    H.selTab('movimientos');
    expect(H.madBorrLeer('tratamientos', H.today())).toContain('antes de salir');
  });

  it('🔴 volver atrás (salir del módulo) también lo guarda YA', () => {
    H.setVista(MAD, 'tratamientos');
    teclear(dosis(), 'antes de volver');
    H.goBack();
    expect(H.madBorrLeer('tratamientos', H.today())).toContain('antes de volver');
  });

  it('🔴 R1 · tras recargar la app, la ficha trae su borrador, y el siguiente cambio de pestaña no lo pisa', () => {
    H.setVista(MAD, 'tratamientos');
    teclear(dosis(), 'antes de recargar');
    H.selTab('movimientos');
    reabrir();
    expect(dosis().value, 'la ficha se abrió en blanco').toBe('antes de recargar');
    H.selTab('movimientos');
    expect(H.madBorrLeer('tratamientos', H.today()), 'el cambio de pestaña pisó el borrador').toContain('antes de recargar');
  });

  it('🔴 una ficha SIN TOCAR no se guarda nunca: no pisa el borrador de su día', () => {
    teclear(dosis(), 'lo de hoy');
    H.madBorrGuardarYa('tratamientos');
    panel('tratamientos').innerHTML = ''; H.renderMadTratamientos();   // montada en blanco, sin traer nada
    H.setVista(MAD, 'tratamientos');
    H._madCommitActive();
    expect(H.madBorrLeer('tratamientos', H.today()), 'la ficha en blanco pisó el borrador').toContain('lo de hoy');
  });

  it('fuera del módulo de Maduración no guarda nada', () => {
    teclear(dosis(), 'no es de aquí');
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
