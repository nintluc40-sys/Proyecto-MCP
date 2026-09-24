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
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadSalas', 'renderMadTanques', 'madSalasFechaChange', 'madTanquesFechaChange',
  'madTanquesSalaChange', 'loadMad', 'saveMadList', 'MAD_SALA_OPTS', 'MAD_TANQUES_POR_SALA', 'today'];
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
    expect(filasS(H.today()), 'se quedó una copia en el día que se deja').toHaveLength(0);
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
    expect(filasS(H.today())).toHaveLength(0);
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
    expect(filasS(H.today()).map((r) => r.data.temp_08), 'lo tecleado se perdió al cancelar').toEqual([28]);
    expect(filasS(AYER).map((r) => r.data.temp_08)).toEqual([26]);
  });

  it('🔴 …y Aceptar lo lleva: lo tecleado reemplaza esas celdas del elegido', () => {
    H.saveMadList('salas', [fila({ fecha: AYER, sala: H.MAD_SALA_OPTS[0], temp_08: 26 })]);
    abrirS();
    teclearS(0, 'temp_08', '28');
    responder(true);
    fechaS(AYER);
    expect(filasS(AYER).map((r) => r.data.temp_08)).toEqual([28]);
    expect(filasS(H.today())).toHaveLength(0);
  });

  it('🔴 lo ya ENVIADO no se mueve: se queda en su día y se dice (moverlo dejaría dos filas en la hoja)', () => {
    H.saveMadList('salas', [fila({ fecha: H.today(), sala: H.MAD_SALA_OPTS[0], temp_08: 26 }, { synced: true })]);
    abrirS();
    teclearS(0, 'temp_10', '27');
    fechaS(AYER);                                  // no pregunta: no hay nada que decidir
    expect(avisos.some((a) => a.includes('ya se envió')), 'no avisó').toBe(true);
    expect(filasS(AYER)).toHaveLength(0);
    expect(filasS(H.today()).map((r) => r.data.temp_10)).toEqual([27]);
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
    expect(filasT(H.today()), 'se quedó una copia en el día que se deja').toHaveLength(0);
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
    expect(filasT(H.today())).toHaveLength(0);
  });

  it('🔴 corregir el parte abierto de un día: al llevarlo conserva SU hora y deja el día que se deja sin él', () => {
    H.saveMadList('tanques', [fila({ fecha: H.today(), sala: SALA, tanque: 7, machos_muertos: 2, parte: 1, hora: '07:15', cerrado: 0 })]);
    abrirT();
    expect(celT(7, 'machos_muertos').value, 'la grilla no pinta el parte abierto').toBe('2');
    teclearT(8, 'machos_muertos', '4');
    responder(true);
    fechaT(AYER);
    expect(preguntas[0]).toContain('lo guardado del ' + H.today());
    expect(resumenT(AYER)).toEqual([[7, 2, 1, false], [8, 4, 1, false]]);
    expect(filasT(AYER).map((r) => r.data.hora)).toEqual(['07:15', '07:15']);
    expect(filasT(H.today())).toHaveLength(0);
  });

  it('🔴 al llevar un parte abierto a un día con OTRO parte abierto, manda la hora del de destino (está en su llave)', () => {
    H.saveMadList('tanques', [
      fila({ fecha: H.today(), sala: SALA, tanque: 7, machos_muertos: 2, parte: 1, hora: '07:15', cerrado: 0 }),
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
    expect(resumenT(H.today())).toEqual([[7, 3, 1, false]]);
    expect(resumenT(AYER)).toEqual([[8, 1, 1, false]]);
  });
});
