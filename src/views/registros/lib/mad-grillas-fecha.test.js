// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · LAS GRILLAS (Salas y Tanques) Y LA FECHA CON ALGO TECLEADO (usuario, 2026-09-24)

   PEDIDO (punto 1): «cuando se registra algo en una ficha y se modifica la fecha, se borra todo». En las grillas
   pasaba lo mismo que en las fichas de formulario: al cambiar la fecha, lo tecleado se guardaba bajo la ANTERIOR y la
   grilla pasaba al día elegido. Decisión del usuario, la misma para las dos familias (ver mad-borrador-fecha.test.js):
     · trabajo NUEVO —al pintar la grilla, su día no tenía filas; en Tanques, ningún parte abierto de esa sala— y el
       día elegido sin nada → lo tecleado se LLEVA al elegido;
     · si el elegido ya tiene algo, o se estaba corrigiendo un día con datos → se PREGUNTA;
     · sin teclear nada → como hasta hoy.
   Dos reglas propias de las grillas, y las dos se prueban aquí:
     · lo ya ENVIADO no se mueve: la hoja lo tiene con su fecha, y moverlo en el dispositivo dejaría las dos filas;
     · en Tanques la ronda llevada es un PARTE de ese día: los cerrados son otras rondas y conviven (no hay conflicto);
       sólo un parte ABIERTO lo es. Y la ronda conserva la hora con que se abrió.
   🔑 Se teclea DE VERDAD (con su evento): la grilla sólo se da por tocada con un `input`/`change` en sus celdas.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadSalas', 'renderMadTanques', 'madSalasFechaChange', 'madTanquesFechaChange',
  'madTanquesSalaChange', 'loadMad', 'saveMadList', 'MAD_SALA_OPTS', 'MAD_TANQUES_POR_SALA', 'today', '_madGridDiaDeLaApp', 'saveMadTanquesGrid',
  'saveMadSalasGrid'];
const H = {};
/* 2026-09-30 (noche) · el día en que la app ABRE la grilla: hoy, y antes de las 02:00 el que termina (`_madGridDiaDeLaApp`).
   Lo sembrado para «el día de la grilla» va a ESE día: con H.today() la prueba fallaría si corre entre las 00:00 y las 02:00
   (en la CI, que va en UTC, un push de las 19:00 a las 21:00 de Ecuador). */
const HOY = () => H._madGridDiaDeLaApp();
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

  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    // `curMod`/`curTab` son `let` del monolito: sin ellos `_madCommitActive` —guardar en el día que se deja— no actúa.
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}'
    + '\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => { avisos.push(String(m)); });
});

const MAD = 12;
const AYER = '2026-09-14';
const preguntas = [];
const responder = (si) => { globalThis.confirm = window.confirm = (m) => { preguntas.push(String(m)); return si; }; };
const fila = (data, extra) => Object.assign({ id: 'f' + Math.random().toString(36).slice(2, 8), ts: 1, synced: false, syncedAt: null, data }, extra);

beforeEach(() => {
  localStorage.clear();
  avisos.length = 0;
  preguntas.length = 0;
  globalThis.confirm = window.confirm = () => { throw new Error('esta prueba no esperaba una pregunta'); };
});

/* ── SALAS ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const celS = (si, k) => document.querySelector('#fp-salas [name="sg_' + si + '_' + k + '"]');
const teclearS = (si, k, v) => { const e = celS(si, k); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
const fechaS = (f) => { document.getElementById('mad-salas-fecha').value = f; H.madSalasFechaChange(); };
const filasS = (fecha) => H.loadMad('salas').filter((r) => r.data && r.data.fecha === fecha);
const abrirS = (fecha) => {
  H.setVista(MAD, 'salas');
  document.getElementById('fp-salas').innerHTML = '';
  H.renderMadSalas();
  if (fecha) { document.getElementById('mad-salas-fecha').value = fecha; H.renderMadSalas(); }
};

describe('🔴 Salas · la fecha con algo tecleado', () => {
  it('🔴 lo tecleado en un día SIN datos se LLEVA al elegido, y no queda en el que se deja', () => {
    abrirS();
    teclearS(0, 'temp_08', '28');
    fechaS(AYER);
    expect(filasS(AYER).map((r) => [r.data.sala, r.data.temp_08])).toEqual([[H.MAD_SALA_OPTS[0], 28]]);
    expect(filasS(HOY()), 'se quedó una copia en el día que se deja').toHaveLength(0);
    expect(document.getElementById('mad-salas-fecha').value).toBe(AYER);
    expect(celS(0, 'temp_08').value, 'la grilla del día elegido no enseña lo llevado').toBe('28');
  });

  it('🔴 lo llevado sigue siendo lo tecleado: si la fecha elegida también era otra, se vuelve a llevar', () => {
    abrirS();
    teclearS(0, 'temp_08', '28');
    fechaS(AYER);
    fechaS('2026-09-13');
    expect(filasS('2026-09-13').map((r) => r.data.temp_08)).toEqual([28]);
    expect(filasS(AYER), 'se quedó en la fecha intermedia').toHaveLength(0);
  });

  it('sin teclear nada, cambiar la fecha es como hasta hoy: no se guarda ni se lleva nada', () => {
    abrirS();
    fechaS(AYER);
    expect(filasS(HOY())).toHaveLength(0);
    expect(filasS(AYER)).toHaveLength(0);
  });

  it('🔴 si el elegido YA tiene datos, se pregunta; Cancelar lo deja en su día', () => {
    H.saveMadList('salas', [fila({ fecha: AYER, sala: H.MAD_SALA_OPTS[0], temp_08: 26 })]);
    abrirS();
    teclearS(0, 'temp_08', '28');
    responder(false);
    fechaS(AYER);
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('ya tiene datos de Salas');
    expect(filasS(HOY()).map((r) => r.data.temp_08), 'lo tecleado se perdió al cancelar').toEqual([28]);
    expect(filasS(AYER).map((r) => r.data.temp_08)).toEqual([26]);
  });

  it('🔴 …y Aceptar lo lleva: lo tecleado reemplaza esas celdas del elegido', () => {
    H.saveMadList('salas', [fila({ fecha: AYER, sala: H.MAD_SALA_OPTS[0], temp_08: 26 })]);
    abrirS();
    teclearS(0, 'temp_08', '28');
    responder(true);
    fechaS(AYER);
    expect(filasS(AYER).map((r) => r.data.temp_08)).toEqual([28]);
    expect(filasS(HOY())).toHaveLength(0);
  });

  it('🔴 lo ya ENVIADO no se mueve: se queda en su día y se dice (moverlo dejaría dos filas en la hoja)', () => {
    H.saveMadList('salas', [fila({ fecha: HOY(), sala: H.MAD_SALA_OPTS[0], temp_08: 26 }, { synced: true })]);
    abrirS();
    teclearS(0, 'temp_10', '27');
    fechaS(AYER);                                  // no pregunta: no hay nada que decidir
    expect(avisos.some((a) => a.includes('ya se envió')), 'no avisó').toBe(true);
    expect(filasS(AYER)).toHaveLength(0);
    expect(filasS(HOY()).map((r) => r.data.temp_10)).toEqual([27]);
  });

  /* 🔴 Revisión en Chrome de la tanda 0d (2026-09-25, usuario) · la guarda miraba `synced`, y esa marca la QUITA la
     fusión al guardar la grilla (salir de la pestaña, o elegir en el calendario el mismo día) aunque nada cambie. Tras
     salir y volver, corregir y cambiar la fecha preguntaba como si fuera un borrador y, al Aceptar, movía la fila ya
     enviada a otro día. Lo que cuenta es si llegó ALGUNA VEZ a la hoja: `syncedAt`, que la fusión conserva. */
  it('🔴 lo que se envió ALGUNA VEZ tampoco se mueve, aunque ya no esté marcado como enviado', () => {
    H.saveMadList('salas', [fila({ fecha: HOY(), sala: H.MAD_SALA_OPTS[0], temp_08: 26 }, { synced: false, syncedAt: 1 })]);
    abrirS();
    teclearS(0, 'temp_10', '27');
    fechaS(AYER);                                  // no pregunta: no hay nada que decidir
    expect(avisos.some((a) => a.includes('ya se envió')), 'no avisó').toBe(true);
    expect(filasS(AYER)).toHaveLength(0);
    expect(filasS(HOY()).map((r) => r.data.temp_10)).toEqual([27]);
  });

  it('🔴 el camino real: elegir el MISMO día en el calendario guarda la grilla (y la desmarca); la fila enviada sigue sin moverse', () => {
    H.saveMadList('salas', [fila({ fecha: HOY(), sala: H.MAD_SALA_OPTS[0], temp_08: 26 }, { synced: true, syncedAt: 1 })]);
    abrirS();
    fechaS(HOY());                             // sin teclear: guarda la grilla y la fusión le quita `synced`
    expect(filasS(HOY())[0].synced, 'control: la fusión la desmarca (es lo que la guarda no puede usar)').toBe(false);
    teclearS(0, 'temp_10', '27');
    fechaS(AYER);                                  // sin la guarda por `syncedAt` preguntaría (y la prueba revienta)
    expect(avisos.some((a) => a.includes('ya se envió')), 'no avisó').toBe(true);
    expect(filasS(AYER)).toHaveLength(0);
  });
});

/* ── TANQUES ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
const SALA = 'Sala 5';
const celT = (tq, k) => document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]');
const teclearT = (tq, k, v) => { const e = celT(tq, k); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
const fechaT = (f) => { document.getElementById('mad-tanques-fecha').value = f; H.madTanquesFechaChange(); };
const filasT = (fecha) => H.loadMad('tanques').filter((r) => r.data && r.data.fecha === fecha && r.data.sala === SALA);
const abrirT = () => {
  H.setVista(MAD, 'tanques');
  document.getElementById('fp-tanques').innerHTML = '';
  H.renderMadTanques();
  document.getElementById('mad-tanques-sala').value = SALA;
  H.madTanquesSalaChange();
};
const resumenT = (fecha) => filasT(fecha).map((r) => [r.data.tanque, Number(r.data.machos_muertos), r.data.parte, !!r.data.cerrado])
  .sort((a, b) => a[2] - b[2] || a[0] - b[0]);

describe('🔴 Tanques · la ronda tecleada y la fecha', () => {
  it('el fixture ejerce algo: la Sala 5 tiene los tanques 7 y 8', () => {
    expect(H.MAD_TANQUES_POR_SALA[SALA]).toContain(7);
    expect(H.MAD_TANQUES_POR_SALA[SALA]).toContain(8);
  });

  it('🔴 la ronda tecleada en un día sin parte abierto se LLEVA al elegido, como un parte de ese día', () => {
    abrirT();
    teclearT(7, 'machos_muertos', '3');
    fechaT(AYER);
    expect(resumenT(AYER)).toEqual([[7, 3, 1, false]]);
    expect(filasT(AYER)[0].data.hora, 'el parte llevado no tiene hora').toMatch(/^\d{2}:\d{2}$/);
    expect(filasT(HOY()), 'se quedó una copia en el día que se deja').toHaveLength(0);
  });

  it('🔴 los partes CERRADOS del elegido no son conflicto: la ronda llevada es el parte SIGUIENTE', () => {
    H.saveMadList('tanques', [fila({ fecha: AYER, sala: SALA, tanque: 8, machos_muertos: 1, parte: 1, hora: '06:00', cerrado: 1 })]);
    abrirT();
    teclearT(7, 'machos_muertos', '3');
    fechaT(AYER);                                  // no pregunta: el cerrado es otra ronda
    expect(resumenT(AYER)).toEqual([[8, 1, 1, true], [7, 3, 2, false]]);
  });

  it('🔴 un parte ABIERTO en el elegido sí se pregunta; Aceptar funde la ronda en él, con SU hora', () => {
    H.saveMadList('tanques', [fila({ fecha: AYER, sala: SALA, tanque: 8, machos_muertos: 1, parte: 1, hora: '06:00', cerrado: 0 })]);
    abrirT();
    teclearT(7, 'machos_muertos', '3');
    responder(true);
    fechaT(AYER);
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('un parte abierto de ' + SALA);
    expect(resumenT(AYER)).toEqual([[7, 3, 1, false], [8, 1, 1, false]]);
    expect(filasT(AYER).map((r) => r.data.hora)).toEqual(['06:00', '06:00']);
    expect(filasT(HOY())).toHaveLength(0);
  });

  it('🔴 corregir el parte abierto de un día: al llevarlo conserva SU hora y deja el día que se deja sin él', () => {
    H.saveMadList('tanques', [fila({ fecha: HOY(), sala: SALA, tanque: 7, machos_muertos: 2, parte: 1, hora: '07:15', cerrado: 0 })]);
    abrirT();
    expect(celT(7, 'machos_muertos').value, 'la grilla no pinta el parte abierto').toBe('2');
    teclearT(8, 'machos_muertos', '4');
    responder(true);
    fechaT(AYER);
    expect(preguntas[0]).toContain('lo guardado del ' + HOY());
    expect(resumenT(AYER)).toEqual([[7, 2, 1, false], [8, 4, 1, false]]);
    expect(filasT(AYER).map((r) => r.data.hora)).toEqual(['07:15', '07:15']);
    expect(filasT(HOY())).toHaveLength(0);
  });

  it('🔴 al llevar un parte abierto a un día con OTRO parte abierto, manda la hora del de destino (está en su llave)', () => {
    H.saveMadList('tanques', [
      fila({ fecha: HOY(), sala: SALA, tanque: 7, machos_muertos: 2, parte: 1, hora: '07:15', cerrado: 0 }),
      fila({ fecha: AYER, sala: SALA, tanque: 8, machos_muertos: 1, parte: 1, hora: '06:00', cerrado: 0 }),
    ]);
    abrirT();
    teclearT(7, 'machos_muertos', '5');
    responder(true);
    fechaT(AYER);
    expect(filasT(AYER).map((r) => r.data.hora), 'el parte de destino quedó con dos horas').toEqual(['06:00', '06:00']);
  });

  it('Cancelar deja la ronda en su día, como hasta hoy', () => {
    H.saveMadList('tanques', [fila({ fecha: AYER, sala: SALA, tanque: 8, machos_muertos: 1, parte: 1, hora: '06:00', cerrado: 0 })]);
    abrirT();
    teclearT(7, 'machos_muertos', '3');
    responder(false);
    fechaT(AYER);
    expect(resumenT(HOY())).toEqual([[7, 3, 1, false]]);
    expect(resumenT(AYER)).toEqual([[8, 1, 1, false]]);
  });
});

/* ── LA FECHA QUE PUSO LA APP SE RENUEVA SOLA (usuario, 2026-09-30) ─────────────────────────────────────────────────────
   Caso real: la grilla se pinta con la fecha que YA tiene su campo, y con la app abierta de un día para otro la ronda de
   la mañana del 30-09 de Sala 2 y Sala 3 se guardó como del 29-09 (y ese día no tuvo ni un parte con su fecha). Decisión
   del usuario: la fecha que puso la APP pasa a HOY al volver a la app o al repintar, DESDE LAS 02:00 (la lectura de las
   0:00 de Salas, que se teclea pasada la medianoche, es del día que termina; la de las 2:00 ya es del nuevo); una fecha
   ELEGIDA a mano se respeta; nada a medio teclear se mueve; en Tanques, el parte que quedó ABIERTO del día anterior se
   cierra al renovar (2026-09-30 noche, ver sus dos pruebas); y la grilla dice «⚠ no es hoy» cuando su fecha no es la de
   hoy. */
describe('🔴 la fecha que puso la app se RENUEVA sola desde las 02:00 (usuario, 2026-09-30)', () => {
  const a = (d, h, m) => vi.setSystemTime(new Date(2026, 8, d, h, m, 0));   // septiembre de 2026, hora local
  const volver = () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const campo = (f) => document.getElementById('mad-' + f + '-fecha').value;
  const marca = (f) => document.getElementById('mad-' + f + '-noeshoy');
  beforeEach(() => { vi.useRealTimers(); vi.useFakeTimers({ toFake: ['Date'] }); a(29, 21, 30); });
  afterEach(() => { vi.useRealTimers(); });

  it('🔴 Tanques abierta desde ayer: al VOLVER a la app por la mañana pasa a hoy, y la ronda se guarda en hoy (el caso real)', () => {
    abrirT();
    expect(campo('tanques')).toBe('2026-09-29');
    a(30, 6, 25);
    volver();
    expect(campo('tanques'), 'la ronda de la mañana se guardaría con la fecha de ayer').toBe('2026-09-30');
    expect(marca('tanques'), 'marca sin motivo').toBeNull();
    teclearT(7, 'machos_muertos', '2');
    H.saveMadTanquesGrid();
    expect(resumenT('2026-09-30')).toEqual([[7, 2, 1, true]]);
    expect(filasT('2026-09-29')).toHaveLength(0);
  });

  it('🔴 …y también con cualquier repintado (volver a elegir la sala)', () => {
    abrirT();
    a(30, 6, 25);
    H.madTanquesSalaChange();
    expect(campo('tanques')).toBe('2026-09-30');
  });

  it('🔴 entre las 00:00 y las 02:00 sigue en el día que termina, y lo DICE; desde las 02:00, el nuevo', () => {
    abrirT();
    a(30, 1, 10);
    volver();
    expect(campo('tanques')).toBe('2026-09-29');
    expect(marca('tanques') && marca('tanques').textContent, 'no avisa de que no es hoy').toContain('no es hoy');
    a(30, 2, 0);
    volver();
    expect(campo('tanques')).toBe('2026-09-30');
    expect(marca('tanques')).toBeNull();
  });

  it('🔴 una fecha ELEGIDA a mano se respeta al día siguiente, y se marca', () => {
    abrirT();
    fechaT('2026-09-27');
    expect(marca('tanques') && marca('tanques').textContent, 'una fecha pasada elegida no se marca').toContain('no es hoy');
    a(30, 6, 25);
    volver();
    expect(campo('tanques')).toBe('2026-09-27');
    H.madTanquesSalaChange();
    expect(campo('tanques'), 'un repintado se llevó la fecha elegida').toBe('2026-09-27');
  });

  it('🔴 elegir HOY a mano deja la fecha como automática: al día siguiente se renueva', () => {
    abrirT();
    fechaT('2026-09-28');
    fechaT('2026-09-29');
    a(30, 6, 25);
    volver();
    expect(campo('tanques')).toBe('2026-09-30');
  });

  /* 2026-09-30 (noche, usuario) · UN PARTE QUE QUEDÓ ABIERTO DE UN DÍA ANTERIOR YA NO RETIENE LA GRILLA. El 🔄 global
     envía el parte abierto sin cerrarlo; a la mañana siguiente la grilla se quedaba en ayer pintando sus cifras, y la
     ronda de la mañana tecleada encima se guardaba en el parte de AYER con su misma llave: en la hoja SOBRESCRIBÍA la
     ronda de la noche (simulado: 3 machos muertos → 1). Ahora, al renovar, ese parte se CIERRA en el dispositivo —lo no
     enviado sigue pendiente, con su fecha y su hora— y la grilla pasa a hoy. */
  it('🔴 el parte que quedó ABIERTO y ENVIADO (🔄) del día anterior se cierra al renovar: la ronda de la mañana no lo sobrescribe', () => {
    abrirT();
    teclearT(7, 'machos_muertos', '3');
    H.saveMadTanquesGrid({ silent: true });            // el autoguardado: el parte queda ABIERTO…
    H.saveMadList('tanques', H.loadMad('tanques').map((r) => Object.assign(r, { synced: true, syncedAt: 1 }))   // …y el 🔄 lo envía sin cerrarlo
      .concat([fila({ fecha: '2026-09-30', sala: 'Sala 4', tanque: 3, machos_muertos: 1, parte: 1, hora: '06:20', cerrado: 0 })]));   // y una ronda de HOY en curso en otra sala
    a(30, 6, 25);
    volver();
    expect(campo('tanques'), 'la grilla se quedó en el parte abierto de ayer').toBe('2026-09-30');
    expect(H.loadMad('tanques').filter((r) => r.data.sala === 'Sala 4').map((r) => !!r.data.cerrado), 'se cerró una ronda de HOY en curso en otra sala').toEqual([false]);
    expect(marca('tanques'), 'marca sin motivo').toBeNull();
    expect(celT(7, 'machos_muertos').value, 'la grilla de hoy enseña las cifras de ayer').toBe('');
    teclearT(7, 'machos_muertos', '1');
    H.saveMadTanquesGrid();
    expect(resumenT('2026-09-29'), 'la ronda de la noche cambió').toEqual([[7, 3, 1, true]]);
    expect(filasT('2026-09-29')[0].synced, 'lo ya enviado volvió a pendiente: se reenviaría encima').toBe(true);
    expect(resumenT('2026-09-30')).toEqual([[7, 1, 1, true]]);
  });

  it('🔴 …y si tenía algo SIN ENVIAR, se cierra igual y sigue PENDIENTE con su fecha y su hora; antes de las 02:00 no se toca', () => {
    abrirT();
    teclearT(7, 'machos_muertos', '3');
    H.saveMadTanquesGrid({ silent: true });            // abierto y sin enviar, a las 21:30
    a(30, 1, 10);
    volver();
    expect(campo('tanques')).toBe('2026-09-29');
    expect(resumenT('2026-09-29'), 'antes de las 02:00 el parte sigue abierto').toEqual([[7, 3, 1, false]]);
    a(30, 6, 25);
    volver();
    expect(campo('tanques')).toBe('2026-09-30');
    const r = filasT('2026-09-29');
    expect(resumenT('2026-09-29')).toEqual([[7, 3, 1, true]]);
    expect([r[0].synced, r[0].data.hora], 'lo no enviado se perdió o cambió de hora').toEqual([false, '21:30']);
  });

  it('🔴 con la grilla a medio teclear no se repinta al volver: lo tecleado no se pierde', () => {
    abrirT();
    teclearT(7, 'machos_muertos', '4');
    a(30, 6, 25);
    volver();
    expect(celT(7, 'machos_muertos').value, 'se perdió lo tecleado').toBe('4');
    expect(campo('tanques')).toBe('2026-09-29');
  });

  it('🔴 Salas: la lectura de las 0:00 va al día que termina; desde las 02:00, la grilla pasa al nuevo', () => {
    abrirS();
    a(29, 22, 30);
    expect(campo('salas')).toBe('2026-09-29');
    a(30, 0, 20);
    volver();
    expect(campo('salas')).toBe('2026-09-29');
    expect(marca('salas') && marca('salas').textContent, 'no avisa de que no es hoy').toContain('no es hoy');
    a(30, 2, 10);
    volver();
    expect(campo('salas')).toBe('2026-09-30');
    expect(marca('salas')).toBeNull();
  });

  it('el mismo día no cambia nada y no hay marca', () => {
    abrirT();
    a(29, 23, 50);
    volver();
    expect(campo('tanques')).toBe('2026-09-29');
    expect(marca('tanques')).toBeNull();
  });

  it('🔴 elegir a mano, al día siguiente, el MISMO día que tenía la app también es elegirlo: se respeta', () => {
    abrirT();
    a(30, 1, 0);                                       // antes de las 02:00: la grilla sigue en el 29
    volver();
    fechaT('2026-09-29');                              // y alguien lo elige a propósito, para acabar ese día
    a(30, 6, 25);
    volver();
    expect(campo('tanques'), 'se llevó una fecha elegida').toBe('2026-09-29');
  });

  it('🔴 Salas: una fecha pasada ELEGIDA se marca al pintar la grilla', () => {
    abrirS();
    fechaS('2026-09-27');
    expect(marca('salas') && marca('salas').textContent).toContain('no es hoy');
  });

  it('🔴 volver dos veces sin renovar deja UNA sola marca', () => {
    abrirT();
    a(30, 1, 10);
    volver();
    volver();
    expect(document.querySelectorAll('#mad-tanques-noeshoy')).toHaveLength(1);
  });

  it('con la app OCULTA no se hace nada (se renueva al volver a verla)', () => {
    abrirT();
    a(30, 6, 25);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(campo('tanques')).toBe('2026-09-29');
    expect(marca('tanques')).toBeNull();
    volver();
    expect(campo('tanques')).toBe('2026-09-30');
  });

  /* 2026-09-30 (noche, usuario) · AL ABRIR O RECARGAR la app entre las 00:00 y las 02:00, la grilla arranca en el día que
     TERMINA —lo mismo que si ya estaba abierta—, lo dice, y a las 02:00 pasa sola a hoy. Antes arrancaba en el día nuevo y
     sin marca: la lectura de las 0:00 de Salas, tecleada a las 00:20 tras recargar, iba a la fila del día siguiente. */
  it('🔴 Salas abierta (o recargada) a las 00:20: arranca en el día que termina, lo dice, y la lectura de las 0:00 va a ese día', () => {
    a(30, 0, 20);
    abrirS();
    expect(campo('salas'), 'arrancó en el día nuevo').toBe('2026-09-29');
    expect(marca('salas') && marca('salas').textContent, 'no avisa de que no es hoy').toContain('no es hoy');
    teclearS(0, 'temp_00', '28');
    H.saveMadSalasGrid();
    expect(filasS('2026-09-29').map((r) => r.data.temp_00)).toEqual([28]);
    expect(filasS('2026-09-30'), 'la lectura de las 0:00 fue al día siguiente').toHaveLength(0);
    a(30, 2, 0);
    volver();
    expect(campo('salas'), 'a las 02:00 no pasó sola a hoy').toBe('2026-09-30');
  });

  it('🔴 Tanques igual: abierta a la 01:59 arranca en el día que termina y lo dice', () => {
    a(30, 1, 59);
    abrirT();
    expect(campo('tanques')).toBe('2026-09-29');
    expect(marca('tanques') && marca('tanques').textContent).toContain('no es hoy');
  });

  it('abierta a las 02:00 en punto arranca en hoy, sin marca', () => {
    a(30, 2, 0);
    abrirT();
    expect(campo('tanques')).toBe('2026-09-30');
    expect(marca('tanques')).toBeNull();
    abrirS();
    expect(campo('salas')).toBe('2026-09-30');
  });

  it('🔴 el día que termina se calcula bien también al cambiar de mes (00:30 del 1-10 → 30-09)', () => {
    vi.setSystemTime(new Date(2026, 9, 1, 0, 30, 0));
    abrirT();
    expect(campo('tanques')).toBe('2026-09-30');
  });
});
