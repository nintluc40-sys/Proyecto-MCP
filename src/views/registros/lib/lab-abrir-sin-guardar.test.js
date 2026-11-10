// @vitest-environment happy-dom
/* ============================================================
   ✏️ ABRIR DESDE EL HISTORIAL YA NO PISA LO NO GUARDADO (pendiente 12, 2026-11-09)

   LO QUE PASABA: en Microbiología, Calidad y Patología, ✏️ de una sesión sobrescribía el borrador de «Nuevo análisis»; en
   Algas, ✏️ del historial y de la Bitácora cargaban el registro encima de la ficha; y en la supervisión del AsT, ✏️ cargaba
   el registro sin mirar `_astFormDirty`. Lo tecleado y no guardado se perdía sin preguntar.

   AHORA (usuario: «Sólo si hay algo sin guardar», como A9 en Score, Auditoría y Mantenimiento):
   · Micro, Calidad y Patología: la HUELLA de lo guardado va en el propio borrador (meta.guardado) al guardar y al abrir una
     sesión; ✏️ pregunta sólo si el borrador tiene filas con datos y no es esa huella.
   · Algas: pregunta si la ficha tiene algo que no está en el historial (fecha, corrida, módulo y técnico, que se quedan tras
     «📋 Agregar», no cuentan; el Área sí, porque arranca vacía; si se está editando una entrada y la pantalla es ella, tampoco).
   · AsT: pregunta si `_astFormDirty`.
   «Cancelar» deja todo como estaba.

   Motor REAL sobre el shell real; el `confirm`, simulado. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['micTypeSet', 'MIC_FORMATS', 'MIC_FORMAT_KEYS', 'renderMicNuevo', 'loadMicDraft', 'saveMicDraft', 'saveMicLocal',
  'loadMic', 'micSessionKey', 'micEditSession', 'renderCalNuevo', 'loadCalDraft', 'saveCalDraft', 'saveCalLocal', 'loadCal',
  'calSessionKey', 'calEditSession', 'renderPatNuevo', 'savePatLocal', 'loadPat', 'patSessionKey', 'patEditSession',
  'renderAlgas', 'saveE', 'addToAlgHist', 'loadAlgHist', 'editAlgHistEntry', 'pushAlgLog', 'loadAlgLog', 'bitEdit', 'editAstRecord',
  '_invalidateLoadE'];
const H = {};
const preguntas = [];
let respuesta = true;

const almacen = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, clear: () => { m.clear(); },
    key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
  };
})();

beforeAll(async () => {
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  window.confirm = (m) => { preguntas.push(String(m)); return respuesta; };
  globalThis.confirm = window.confirm;
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; H.editandoAlg=function(){ return _algEditingId; }; }catch(_){}'
    + '\ntry{ H.setAstSucio=function(v){ _astFormDirty=v; }; H.editandoAst=function(){ return _astEditing; };'
    + ' H.setLoadAst=function(f){ loadAst=f; }; H.setRenderAst=function(f){ renderAst=f; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast(() => {});
});

beforeEach(() => {
  almacen.clear();
  H._invalidateLoadE();
  preguntas.length = 0;
  respuesta = true;
});

/* ── Calidad (las tres comparten la huella) ─────────────────── */
const celdaCal = (fila, k) => document.querySelector(`[name="cal_larv_${fila}_${k}"]`);
const pintarCal = () => {
  H.micTypeSet('cal');
  const d = H.loadCalDraft(); d.activeFmt = 'larv'; H.saveCalDraft(d);
  H.renderCalNuevo();
};
const llenarCal = (ph) => {
  document.getElementById('cal-resp').value = 'Analista QA';
  celdaCal(1, 'ph').value = ph;
};
/* Una sesión guardada «de otro día», para abrirla. */
const otraSesionCal = () => {
  const base = { fechaMuestreo: '2026-08-01', fechaResultados: '', corrida: '901', departamento: 'Larvicultura', formato: 'larv',
    responsable: 'Otra', sid: 'cOTRA', fila: '1', ph: '7.1' };
  const l = H.loadCal(); l.push({ id: 'otra', ts: Date.now(), synced: true, data: base });
  almacen.setItem('larv4_cal_records', JSON.stringify(l));   // CAL_REC_KEY (ver _calSave)
  return H.calSessionKey(base);
};

describe('Calidad · ✏️ pregunta sólo si hay algo sin guardar', () => {
  it('con «Nuevo análisis» en blanco, abre sin preguntar', () => {
    pintarCal();
    H.calEditSession(otraSesionCal());
    expect(preguntas).toEqual([]);
    expect(celdaCal(1, 'ph').value).toBe('7.1');   // y la abrió de verdad
  });

  it('🔴 lo guardado tal cual: abre sin preguntar', () => {
    pintarCal();
    llenarCal('7.5');
    expect(H.saveCalLocal()).toBe(1);
    H.calEditSession(otraSesionCal());
    expect(preguntas).toEqual([]);
    expect(celdaCal(1, 'ph').value).toBe('7.1');
  });

  it('🔴 tecleado y nunca guardado: pregunta; «Cancelar» deja lo tecleado', () => {
    pintarCal();
    llenarCal('7.5');
    respuesta = false;
    H.calEditSession(otraSesionCal());
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('NO se ha guardado');
    expect(celdaCal(1, 'ph').value).toBe('7.5');
  });

  it('🔴 guardado y cambiado después: pregunta', () => {
    pintarCal();
    llenarCal('7.5');
    H.saveCalLocal();
    celdaCal(1, 'ph').value = '7.6';
    H.calEditSession(otraSesionCal());
    expect(preguntas).toHaveLength(1);
  });

  it('🔴 lo recién abierto ES lo guardado: abrir otra no pregunta', () => {
    pintarCal();
    const k = otraSesionCal();
    H.calEditSession(k);
    H.calEditSession(k);
    expect(preguntas).toEqual([]);
  });
});

/* ── Microbiología y Patología: la misma regla con su borrador ─ */
describe('Microbiología y Patología · la misma regla', () => {
  it('🔴 Microbiología: guardado no pregunta; cambiado después, sí', () => {
    H.micTypeSet('bact');
    const fk = H.MIC_FORMAT_KEYS[0];
    const pk = H.MIC_FORMATS[fk].params.find((p) => p !== 'vtot');
    const d = H.loadMicDraft(); d.activeFmt = fk; H.saveMicDraft(d);
    H.renderMicNuevo();
    document.getElementById('mic-resp').value = 'Analista QA';
    document.getElementById('mic-corr').value = '901';   // ese formato la exige
    document.querySelector(`[name="mic_${fk}_1_${pk}"]`).value = '12';
    expect(H.saveMicLocal()).toBe(1);
    const k = H.micSessionKey(H.loadMic()[0].data);
    H.micEditSession(k);
    expect(preguntas).toEqual([]);
    H.micEditSession(k);                 // lo recién abierto ES lo guardado
    expect(preguntas).toEqual([]);
    document.querySelector(`[name="mic_${fk}_1_${pk}"]`).value = '13';
    respuesta = false;
    H.micEditSession(k);
    expect(preguntas).toHaveLength(1);
    expect(document.querySelector(`[name="mic_${fk}_1_${pk}"]`).value).toBe('13');
  });

  it('🔴 Patología: guardado no pregunta; cambiado después, sí', () => {
    H.micTypeSet('pat');
    H.renderPatNuevo();
    document.getElementById('pat-resp').value = 'Analista QA';
    document.querySelector('[name="pat_1_muestra"]').value = 'M-1';
    expect(H.savePatLocal()).toBe(1);
    const k = H.patSessionKey(H.loadPat()[0].data);
    H.patEditSession(k);
    expect(preguntas).toEqual([]);
    H.patEditSession(k);                 // lo recién abierto ES lo guardado
    expect(preguntas).toEqual([]);
    document.querySelector('[name="pat_1_muestra"]').value = 'M-2';
    respuesta = false;
    H.patEditSession(k);
    expect(preguntas).toHaveLength(1);
    expect(document.querySelector('[name="pat_1_muestra"]').value).toBe('M-2');
  });
});

/* ── Algas: historial y Bitácora ────────────────────────────── */
const LAB = 11;   // Lab. Algas
const campo = (n) => document.querySelector(`#fp-algas [name="${n}"]`);
const escribir = (n, v) => { campo(n).value = v; };
const abrirAlgas = () => { H.setVista(LAB, 'algas'); H.renderAlgas(); };

describe('Algas · ✏️ del historial y de la Bitácora', () => {
  it('con sólo lo que queda tras «📋 Agregar» (fecha, corrida, módulo, técnico): abre sin preguntar', () => {
    abrirAlgas();
    escribir('cel_ml', '280000');
    escribir('tec', 'Técnico QA');
    escribir('corrida_larv', '901');
    escribir('modulo_larv', 'M1');
    H.addToAlgHist();
    expect(campo('tec').value).toBe('Técnico QA');   // el fixture ejerce lo que se queda en la ficha
    expect(campo('corrida_larv').value).toBe('901');
    const id = H.loadAlgHist()[0].id;
    H.editAlgHistEntry(id);
    expect(preguntas).toEqual([]);
    expect(H.editandoAlg()).toBe(id);
  });

  it('🔴 elegir sólo el Área (arranca vacía, visto en Chrome) ya es algo sin agregar: pregunta', () => {
    abrirAlgas();
    escribir('cel_ml', '280000');
    H.addToAlgHist();
    const id = H.loadAlgHist()[0].id;
    const area = campo('area');
    area.querySelector('option[value="MOD1"]').selected = true;
    expect(area.value).toBe('MOD1');     // el fixture ejerce algo
    respuesta = false;
    H.editAlgHistEntry(id);
    expect(preguntas).toHaveLength(1);
  });

  it('🔴 con algo que no está en el historial: pregunta; «Cancelar» lo deja y no edita', () => {
    abrirAlgas();
    escribir('cel_ml', '280000');
    H.addToAlgHist();
    const id = H.loadAlgHist()[0].id;
    escribir('cel_ml', '310000');        // otro registro a medias, sin agregar
    respuesta = false;
    H.editAlgHistEntry(id);
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('NO está en el historial');
    expect(H.editandoAlg()).toBe(null);
    expect(campo('cel_ml').value).toBe('310000');
  });

  it('🔴 editando una entrada y cambiándola, abrir otra pregunta; «Cancelar» sigue en la primera', () => {
    abrirAlgas();
    escribir('cel_ml', '280000'); H.addToAlgHist();
    escribir('cel_ml', '290000'); H.addToAlgHist();
    const [a, b] = H.loadAlgHist().map((h) => h.id);
    H.editAlgHistEntry(a);
    escribir('cel_ml', '285000');
    respuesta = false;
    H.editAlgHistEntry(b);
    expect(preguntas).toHaveLength(1);
    expect(H.editandoAlg()).toBe(a);
    expect(campo('cel_ml').value).toBe('285000');
  });

  it('editando una entrada sin cambiarla, abrir otra no pregunta', () => {
    abrirAlgas();
    escribir('cel_ml', '280000'); H.addToAlgHist();
    escribir('cel_ml', '290000'); H.addToAlgHist();
    const [a, b] = H.loadAlgHist().map((h) => h.id);
    H.editAlgHistEntry(a);
    H.editAlgHistEntry(b);
    expect(preguntas).toEqual([]);
    expect(H.editandoAlg()).toBe(b);
  });

  it('🔴 Bitácora: con algo sin agregar, pregunta; «Cancelar» la deja en la Bitácora', () => {
    abrirAlgas();
    H.pushAlgLog({ fecha: '2026-08-01', cel_ml: 111000, sid: 'aOTRA' });
    const id = H.loadAlgLog()[0].id;
    escribir('cel_ml', '310000');
    respuesta = false;
    H.bitEdit(id);
    expect(preguntas).toHaveLength(1);
    expect(H.loadAlgLog().some((h) => h.id === id)).toBe(true);
    expect(campo('cel_ml').value).toBe('310000');
  });

  it('Bitácora: con la ficha sin nada propio, abre sin preguntar', () => {
    abrirAlgas();
    H.pushAlgLog({ fecha: '2026-08-01', cel_ml: 111000, sid: 'aOTRA' });
    const id = H.loadAlgLog()[0].id;
    H.bitEdit(id);
    expect(preguntas).toEqual([]);
    expect(H.loadAlgLog().some((h) => h.id === id)).toBe(false);
  });

  it('🔴 Bitácora con la ficha sin pintar (otra pestaña): mira lo guardado en el equipo, que es lo que se pisaría', () => {
    abrirAlgas();
    H.saveE(LAB, 'algas', { fecha: '2026-08-02', cel_ml: '310000' }, false);
    document.getElementById('fp-algas').innerHTML = '';
    H.pushAlgLog({ fecha: '2026-08-01', cel_ml: 111000, sid: 'aOTRA' });
    const id = H.loadAlgLog()[0].id;
    respuesta = false;
    H.bitEdit(id);
    expect(preguntas).toHaveLength(1);
    expect(H.loadAlgLog().some((h) => h.id === id)).toBe(true);
  });
});

/* ── AsT · supervisión ──────────────────────────────────────── */
describe('AsT · ✏️ mira lo que ya marca la ficha como sin guardar', () => {
  beforeEach(() => {
    H.setLoadAst(() => [{ id: 'r1', data: {} }]);
    H.setRenderAst(() => {});
  });

  it('🔴 con algo sin guardar: pregunta; «Cancelar» no abre', () => {
    H.setAstSucio(true);
    respuesta = false;
    H.editAstRecord('r1');
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('supervisión NO se ha guardado');
    expect(H.editandoAst()).not.toBe('r1');
  });

  it('sin nada sin guardar, abre sin preguntar', () => {
    H.setAstSucio(false);
    H.editAstRecord('r1');
    expect(preguntas).toEqual([]);
    expect(H.editandoAst()).toBe('r1');
  });
});
