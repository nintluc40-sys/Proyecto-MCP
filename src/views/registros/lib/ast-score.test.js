// @vitest-environment happy-dom
/* ============================================================
   AsT · 🎯 SCORE · análisis de calidad de postlarvas por TANQUE (2026-10-02)

   Pedido del usuario: la planilla «CONTROL DE CALIDAD POST - LARVAS - 12C» como ficha del módulo AsT, más rápida de
   llenar, por tanque, con su hoja nueva en el Google Sheet y su sincronización por el GAS. Decisiones del usuario:
   tanque a tanque (cada criterio, un toque entre sus 5 puntos); hoja «Registro_Score», UNA FILA POR TANQUE con los
   PUNTOS de cada criterio; Camaronera de los destinos de Despacho, Módulo M01–M10/CIO, tanques 1–12; la Prueba de
   estrés en %; y un tanque sólo sale con sus 13 criterios («los 13 o nada»).
   Se ejerce la ficha REAL del motor (engine.js), como las demás pruebas de Registros.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['SCORE_SHEET', 'SCORE_HEADERS', 'SCORE_CRITERIOS', 'SCORE_EXTRAS', 'SCORE_TANQUES', 'SCORE_DRAFT_KEY',
  'scoreTotal', 'scoreInterp', 'scoreEstado', 'scoreValidar', 'scoreRowId', 'buildScorePayload',
  'renderScore', 'scorePick', 'scoreTanque', 'scoreSiguiente', 'scoreGuardar', 'scoreNueva', 'scoreAbrir', 'scoreCampo', 'scorePickEl',
  'scoreAbrirEl', 'scoreBorrarEl', 'scoreVaciarTanque', 'downloadScorePDF', 'scoreExtra',   // 2026-10-04 · 🧹 y 📄
  '_scoreRaw', 'loadScore', '_reconcileMark', 'AST_TABS', 'TAB_META'];
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
    + '\ntry{ H.olvidarModelo=function(){ _scoreModel=null; _scoreTq=1; _scoreOrigen=null; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => { H.ultimoAviso = m; });
});

beforeEach(() => {
  globalThis.localStorage.clear();
  H.olvidarModelo();
  window.confirm = () => true;
  H.renderScore();
});

const fp = () => document.getElementById('fp-score');
const col = (h) => H.SCORE_HEADERS.indexOf(h);
/** Un tanque con los 13 criterios: `nivel` 0–4 (el mismo para todos) o una lista de 13 niveles. */
const tanque = (nivel, extras = {}) => {
  const t = { ...extras };
  H.SCORE_CRITERIOS.forEach((c, i) => { t[c.k] = c.pts[Array.isArray(nivel) ? nivel[i] : nivel]; });
  return t;
};
const evaluacion = (tanques, cab = {}) => ({ fecha: '2026-10-02', modulo: 'M03', corrida: '598', camaronera: 'Taura',
  laboratorio: 'Lab A', realizado: 'Ana', revisado: 'Luis', observaciones: '', tanques, ...cab });
/** Marca en la ficha REAL los 13 criterios del tanque en pantalla con el nivel dado (0–4). */
const marcarTodo = (nivel) => H.SCORE_CRITERIOS.forEach((c) => H.scorePick(c.k, c.pts[nivel]));

describe('Score · la planilla 12C', () => {
  it('13 criterios, 5 niveles cada uno, y los máximos suman 100', () => {
    expect(H.SCORE_CRITERIOS).toHaveLength(13);
    for (const c of H.SCORE_CRITERIOS) {
      expect(c.pts, c.k).toHaveLength(5);
      expect(c.d, c.k).toHaveLength(5);
      expect(c.d.every((x) => x.trim().length > 5), c.k).toBe(true);
      expect([...c.pts].sort((a, b) => a - b), c.k + ' ascendente').toEqual(c.pts);
    }
    expect(H.SCORE_CRITERIOS.reduce((a, c) => a + Math.max(...c.pts), 0)).toBe(100);
    expect(H.SCORE_CRITERIOS.map((c) => c.pts[4])).toEqual([10, 15, 15, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5]);
  });

  it('🔴 la interpretación, con los tramos de la planilla (95, 85 y 70)', () => {
    expect([100, 95, 94, 85, 84, 70, 69, 0].map((x) => H.scoreInterp(x))).toEqual(['Muy buena calidad', 'Muy buena calidad',
      'Buena calidad', 'Buena calidad', 'Calidad mejorable', 'Calidad mejorable', 'Calidad pobre', 'Calidad pobre']);
    expect(H.scoreInterp('')).toBe('');
  });

  it('🔴 el Score es la SUMA de los 13 puntos, y sólo con los 13 («los 13 o nada»)', () => {
    expect(H.scoreTotal(tanque(4))).toBe(100);
    expect(H.scoreTotal(tanque(0))).toBe(20);
    const t = tanque(3);
    delete t.actividad;
    expect(H.scoreTotal(t), 'falta uno').toBe('');
    expect(H.scoreTotal({ ...tanque(4), actividad: 7 }), 'un valor que no es de la planilla no cuenta').toBe('');
    expect(H.scoreEstado({})).toBe('vacio');
    expect(H.scoreEstado(t)).toBe('incompleto');
    expect(H.scoreEstado({ sobr: '90' }), 'sólo con los datos del tanque también está a medias').toBe('incompleto');
    expect(H.scoreEstado(tanque(2))).toBe('completo');
  });
});

describe('Score · la hoja «Registro_Score»', () => {
  it('29 columnas, una por criterio con su grupo, y el ID la ÚLTIMA', () => {
    expect(H.SCORE_SHEET).toBe('Registro_Score');
    expect(H.SCORE_HEADERS).toHaveLength(29);
    expect(H.SCORE_HEADERS.slice(0, 6)).toEqual(['Fecha', 'Laboratorio', 'Camaronera', 'Módulo', 'Corrida', 'Tanque']);
    expect(H.SCORE_HEADERS.slice(19, 25)).toEqual(['Score', 'Interpretación', 'Días de cultivo', 'PL/gramo', '% Sobrevivencia',
      'Prueba de estrés (%)']);
    expect(H.SCORE_HEADERS.slice(-4)).toEqual(['Observaciones', 'Realizado por', 'Revisado por', 'ID']);
    expect(new Set(H.SCORE_HEADERS).size).toBe(29);
  });

  it('🔴 una fila por tanque COMPLETO, en orden, con sus puntos, su Score, su interpretación y un ID fijo', () => {
    const p = H.buildScorePayload([{ id: 'x', ts: 1, data: evaluacion({ 3: tanque(4, { dias: '18', plg: '120,5', sobr: '92', estres: '85' }),
      1: tanque([3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4]), 5: { actividad: 8, sobr: '90' } }) }]);
    expect(p.sheetName).toBe('Registro_Score');
    // El TQ 5, a medias, no se escribe (la validación ya lo bloquea; esto es la segunda red).
    expect(p.headers).toEqual(H.SCORE_HEADERS);
    expect(p.rows.map((r) => r[col('Tanque')])).toEqual([1, 3]);
    const [t1, t3] = p.rows;
    expect(t1[col('Actividad')]).toBe(8);
    expect(t1[col('Score')]).toBe(8 + 12 + 12 + 8 + 8 + 5 * 8);
    expect(t1[col('Interpretación')]).toBe('Buena calidad');
    expect(t3[col('Score')]).toBe(100);
    expect(t3[col('PL/gramo')], 'la coma decimal se lee').toBe(120.5);
    expect(t3[col('Días de cultivo')]).toBe(18);
    expect(t3[col('Corrida')], 'la corrida, tal cual (texto)').toBe('598');
    expect(t3[col('ID')]).toBe(H.scoreRowId(evaluacion({}), 3));
    expect(H.scoreRowId(evaluacion({}), 3)).toBe('SC-2026-10-02-M03-598-t3');
    expect(p.rows.every((r) => r.length === 29)).toBe(true);
  });

  it('🔴 la validación: cabecera obligatoria, un tanque a medias BLOQUEA (y dice cuál), y los % de 0 a 100', () => {
    expect(H.scoreValidar(evaluacion({ 2: tanque(1) }))).toEqual([]);
    expect(H.scoreValidar(evaluacion({ 2: tanque(1) }, { modulo: '', corrida: '' })).join(' ')).toMatch(/módulo.*corrida/);
    expect(H.scoreValidar(evaluacion({})).join(' ')).toContain('al menos un tanque');
    const medio = tanque(1);
    delete medio.actividad;
    delete medio.disparidad;
    expect(H.scoreValidar(evaluacion({ 2: tanque(1), 5: medio })).join(' ')).toContain('TQ 5 incompleto (faltan 2');
    expect(H.scoreValidar(evaluacion({ 2: tanque(1, { sobr: '120' }) })).join(' ')).toContain('TQ 2');
    expect(H.scoreValidar(evaluacion({ 2: tanque(1, { estres: '-1' }) })).join(' ')).toContain('Prueba de estrés');
    expect(H.scoreValidar(evaluacion({ 2: tanque(1, { dias: '12.5' }) })).join(' ')).toContain('Días de cultivo');
  });
});

describe('Score · la ficha en el módulo AsT', () => {
  it('es una pestaña del AsT, «🎯 Score»', () => {
    expect(H.AST_TABS).toContain('score');
    expect(H.TAB_META.score).toEqual(['🎯', 'Score']);
  });

  it('🔴 pinta los 12 tanques y los 13 criterios con sus 5 puntos; un toque marca, el total sale solo', () => {
    expect(fp().querySelectorAll('[data-sc-tq]')).toHaveLength(12);
    expect(fp().querySelectorAll('[data-sc-k]')).toHaveLength(65);
    marcarTodo(3);
    expect(fp().textContent).toContain('Calidad mejorable');   // 8 + 12 + 12 + 8 + 8 + 8 × 4 = 80
    const btn = fp().querySelector('[data-sc-k="actividad"][data-sc-p="8"]');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(fp().textContent).toContain('Robustos con moderada actividad');
    H.scorePick('actividad', 8);   // el mismo toque, otra vez: desmarca
    expect(fp().querySelector('[data-sc-k="actividad"][data-sc-p="8"]').getAttribute('aria-pressed')).toBe('false');
    expect(fp().textContent).toContain('12 de 13');
    // El manejador REAL del botón (su onclick no interpola nada: lee sus data-).
    H.scorePickEl(fp().querySelector('[data-sc-k="actividad"][data-sc-p="10"]'));
    expect(fp().querySelector('[data-sc-k="actividad"][data-sc-p="10"]').getAttribute('aria-pressed')).toBe('true');
    expect(fp().querySelector('[data-sc-k="actividad"]').getAttribute('onclick')).toBe('scorePickEl(this)');
  });

  it('🔴 «Siguiente tanque» pasa al 2, y el 1 queda con su Score en el selector', () => {
    marcarTodo(4);
    H.scoreSiguiente();
    expect(fp().querySelector('[data-sc-tq="2"]').getAttribute('aria-pressed')).toBe('true');
    expect(fp().querySelector('[data-sc-tq="1"]').textContent).toContain('100');
    expect(fp().querySelectorAll('[data-sc-k][aria-pressed="true"]'), 'el 2 empieza en blanco').toHaveLength(0);
  });

  it('🔴 lo marcado se guarda al instante: si la app se cierra, vuelve', () => {
    marcarTodo(2);
    expect(globalThis.localStorage.getItem(H.SCORE_DRAFT_KEY)).toContain('actividad');
    H.olvidarModelo();
    H.renderScore();
    expect(fp().querySelectorAll('[data-sc-k][aria-pressed="true"]')).toHaveLength(13);
  });

  it('🔴 Guardar: valida, queda PENDIENTE; volver a guardar la MISMA evaluación la sustituye; «Nueva» empieza en blanco', () => {
    marcarTodo(1);
    H.scoreGuardar();
    expect(H._scoreRaw(), 'sin módulo ni corrida no se guarda').toHaveLength(0);
    expect(H.ultimoAviso).toContain('módulo');
    // (En la prueba el motor no es global: los onchange/oninput del marcado no lo alcanzan; se llama a su manejador.)
    const mod = fp().querySelector('[data-sk="modulo"]');
    mod.value = 'M03';
    H.scoreCampo(mod);
    const cor = fp().querySelector('[data-sk="corrida"]');
    cor.value = '598';
    H.scoreCampo(cor);
    H.scoreGuardar();
    expect(H._scoreRaw()).toHaveLength(1);
    expect(H._scoreRaw()[0]).toMatchObject({ synced: false });
    expect(H.buildScorePayload(H._scoreRaw()).rows).toHaveLength(1);
    H.scoreSiguiente();
    marcarTodo(4);
    H.scoreGuardar();
    expect(H._scoreRaw(), 'la misma fecha, módulo y corrida: una sola evaluación').toHaveLength(1);
    expect(H.buildScorePayload(H._scoreRaw()).rows).toHaveLength(2);
    H.scoreNueva();
    expect(fp().querySelectorAll('[data-sc-k][aria-pressed="true"]')).toHaveLength(0);
    expect(fp().querySelector('[data-sk="corrida"]').value).toBe('');
    H.scoreAbrir(H._scoreRaw()[0].id);
    expect(fp().querySelector('[data-sk="corrida"]').value).toBe('598');
  });

  it('🔴 «✏️ Abrir» y «🗑» llevan el id en data-sc-id, no en el onclick: una Corrida con «\'» o «\\» no los rompe', () => {
    const corrida = "59'8\\x";
    const id = 'SCE-2026-10-02-M03-' + corrida;
    globalThis.localStorage.setItem('larv4_score_records', JSON.stringify([{ id, ts: 5, synced: false, data: evaluacion({ 1: tanque(1) }, { corrida }) }]));
    H.renderScore();
    const botones = [...fp().querySelectorAll('button[data-sc-id]')];
    expect(botones).toHaveLength(2);
    for (const b of botones) {
      expect(b.getAttribute('data-sc-id')).toBe(id);
      expect(b.getAttribute('onclick'), 'el onclick no interpola el id').toMatch(/^score(Abrir|Borrar)El\(this\)$/);
    }
    H.scoreAbrirEl(botones.find((b) => b.getAttribute('onclick') === 'scoreAbrirEl(this)'));
    expect(fp().querySelector('[data-sk="corrida"]').value).toBe(corrida);
    H.scoreBorrarEl(fp().querySelector('button[onclick="scoreBorrarEl(this)"]'));
    expect(H._scoreRaw()).toHaveLength(0);
  });

  it('B5 · 🗑 de una evaluación NO enviada: «se pierde» sólo si no espera en la cola (si espera, llegará igual)', () => {
    globalThis.localStorage.setItem('larv4_score_records', JSON.stringify([{ id: 'SCE-a', ts: 5, synced: false, data: evaluacion({ 1: tanque(1) }) }]));
    H.renderScore();
    const vistas = [];
    window.confirm = (m) => { vistas.push(m); return false; };
    const borrar = () => H.scoreBorrarEl(fp().querySelector('button[onclick="scoreBorrarEl(this)"]'));
    const cola = (items) => globalThis.localStorage.setItem('larv4_syncqueue', JSON.stringify(items));
    borrar();
    expect(vistas[0]).toContain('se pierde');
    // Otra hoja, o un id que sólo EMPIEZA igual, no es esta evaluación.
    cola([{ ts: 1, payload: {}, mark: { kind: 'auditoria', keys: ['SCE-a@5'] } }, { ts: 2, payload: {}, mark: { kind: 'score', keys: ['SCE-ab@5'] } }]);
    borrar();
    expect(vistas[1]).toContain('se pierde');
    // Una versión anterior suya en la cola: llegará a la hoja aunque se quite de aquí.
    cola([{ ts: 1, payload: { sheetName: 'Registro_Score' }, mark: { kind: 'score', keys: ['SCE-a@4'] } }]);
    borrar();
    expect(vistas[2]).toContain('esperando en la cola: llegará a la hoja aunque la quites de este dispositivo');
    expect(vistas[2]).not.toContain('se pierde');
    expect(H._scoreRaw(), '«no» no la quita').toHaveLength(1);
  });

  it('🔴 la cola reconcilia por evaluación Y versión: lo corregido después de encolar NO se da por enviado', () => {
    globalThis.localStorage.setItem('larv4_score_records', JSON.stringify([{ id: 'SCE-a', ts: 5, synced: false, data: evaluacion({ 1: tanque(1) }) }]));
    expect(H._reconcileMark({ kind: 'score', keys: ['SCE-a@4'] }), 'una versión anterior no la marca').toBe(false);
    expect(H._scoreRaw()[0].synced).toBe(false);
    expect(H._reconcileMark({ kind: 'score', keys: ['SCE-a@5'] })).toBe(true);
    expect(H._scoreRaw()[0].synced).toBe(true);
  });

  it('lo pendiente NO caduca; lo enviado se purga a los 7 días', () => {
    const viejo = Date.now() - 10 * 24 * 3600 * 1000;
    globalThis.localStorage.setItem('larv4_score_records', JSON.stringify([
      { id: 'SCE-p', ts: viejo, synced: false, data: evaluacion({}) },
      { id: 'SCE-e', ts: viejo, synced: true, syncedAt: viejo, data: evaluacion({}) },
    ]));
    expect(H.loadScore().map((r) => r.id)).toEqual(['SCE-p']);
  });
});

/* 2026-10-04 (usuario) · «🧹 Vaciar» y «📄 PDF» en el Score. Vaciar es SÓLO el tanque en pantalla (decisión del usuario):
   el resto de la evaluación no cambia; «🗑 Nueva evaluación» sigue para vaciarla entera. El PDF es la evaluación en tabla. */
describe('Score · 🧹 Vaciar TQ y 📄 PDF', () => {
  let ventana = null;
  beforeEach(() => {
    ventana = null;
    window.open = () => { ventana = { html: '', document: { write(h) { ventana.html += h; }, close() {}, title: '' } }; return ventana; };
  });

  it('los dos botones están, con el onclick literal', () => {
    expect(fp().querySelector('button[onclick="scoreVaciarTanque()"]').textContent).toContain('Vaciar TQ 1');
    expect(fp().querySelector('button[onclick="downloadScorePDF()"]').textContent).toContain('PDF');
  });

  it('🔴 Vaciar borra criterios y extras del tanque EN PANTALLA; los demás tanques y la cabecera no cambian', () => {
    const campo = (attr, k, v) => { const el = document.createElement('input'); el.setAttribute(attr, k); el.value = v; return el; };
    H.scoreCampo(campo('data-sk', 'corrida', '598'));
    marcarTodo(2);
    H.scoreExtra(campo('data-se', 'dias', '18'));
    H.scoreTanque(2);
    marcarTodo(4);
    H.scoreTanque(1);
    let pregunta = '';
    window.confirm = (m) => { pregunta = m; return false; };
    H.scoreVaciarTanque();
    expect(H.scoreEstado(JSON.parse(localStorage.getItem(H.SCORE_DRAFT_KEY)).tanques[1]), '«no» lo deja como estaba').toBe('completo');
    window.confirm = (m) => { pregunta = m; return true; };
    H.scoreVaciarTanque();
    expect(pregunta).toContain('TQ 1');
    const d = JSON.parse(localStorage.getItem(H.SCORE_DRAFT_KEY));
    expect(H.scoreEstado(d.tanques[1])).toBe('vacio');
    expect(H.scoreEstado(d.tanques[2]), 'el TQ 2 sigue').toBe('completo');
    expect(d.corrida, 'la cabecera sigue').toBe('598');
    expect(fp().querySelector('#sc-criterios').textContent).toContain('TQ 1');
  });

  it('un tanque ya vacío no pregunta: lo dice', () => {
    let preguntas = 0;
    window.confirm = () => { preguntas++; return true; };
    H.scoreVaciarTanque();
    expect(preguntas).toBe(0);
    expect(H.ultimoAviso).toContain('ya está vacío');
  });

  it('🔴 PDF: una fila por tanque evaluado con sus puntos, Score, Interpretación y extras; el incompleto, dicho; firmas y texto escapado', () => {
    localStorage.setItem(H.SCORE_DRAFT_KEY, JSON.stringify(evaluacion({ 1: tanque(4, { dias: 18, plg: 160 }), 3: { actividad: 6 } },
      { observaciones: '<b>ojo</b>', realizado: 'Ana', revisado: 'Luis' })));
    H.olvidarModelo();
    H.downloadScorePDF();
    expect(ventana).not.toBeNull();
    const h = ventana.html;
    for (const txt of ['Score · calidad de postlarvas', 'M03', '598', 'Taura', 'Lab A', 'Ana', 'Luis', 'Muy buena calidad', '160',
      'Incompleto (1 de ' + H.SCORE_CRITERIOS.length + ')']) expect(h, txt).toContain(txt);
    expect(h).toContain('<td style="font-weight:800">100</td>');
    const tbody = h.slice(h.indexOf('<tbody>'), h.indexOf('</tbody>'));
    expect((tbody.match(/<tr>/g) || []).length, 'TQ 1 y TQ 3').toBe(2);
    expect(h).not.toContain('<b>ojo</b>');
    expect(h).toContain('&lt;b&gt;ojo&lt;/b&gt;');
  });

  it('sin ningún tanque evaluado no abre nada y lo dice', () => {
    H.downloadScorePDF();
    expect(ventana).toBeNull();
    expect(H.ultimoAviso).toContain('al menos un tanque');
  });
});

describe('A9 · abrir o repetir no pisa lo que no se ha guardado', () => {
  const campo = (k, v) => { const el = document.createElement('input'); el.setAttribute('data-sk', k); el.value = v; H.scoreCampo(el); };
  /** Evalúa en pantalla, en la corrida dada, los tanques { tanque: nivel } (el mismo toque desmarca: otro nivel para corregir). */
  const evaluar = (tanques, corrida = '598') => {
    campo('modulo', 'M03');
    campo('corrida', corrida);
    Object.entries(tanques).forEach(([n, nivel]) => { H.scoreTanque(Number(n)); marcarTodo(nivel); });
  };
  /** Lo que `confirm` contestará; devuelve lo que se le pregunte. */
  const responder = (respuesta) => { const vistas = []; window.confirm = (m) => { vistas.push(m); return respuesta; }; return vistas; };
  const borrador = () => JSON.parse(localStorage.getItem(H.SCORE_DRAFT_KEY));
  const idDe = (corrida) => H._scoreRaw().find((r) => r.data.corrida === corrida).id;
  const tanquesDe = (corrida) => {
    const t = H._scoreRaw().find((r) => r.data.corrida === corrida).data.tanques;
    return Object.keys(t).filter((n) => H.scoreEstado(t[n]) === 'completo').map(Number);
  };
  const marcarEnviada = () => {
    const l = H._scoreRaw();
    l[0].synced = true;
    localStorage.setItem('larv4_score_records', JSON.stringify(l));
  };

  it('🔴 ✏️ Abrir, con tanques sin guardar, pregunta: «no» deja la pantalla y el borrador; «sí» abre la guardada', () => {
    evaluar({ 1: 2 });
    H.scoreGuardar();
    H.scoreNueva();
    evaluar({ 2: 3 }, '599');
    const no = responder(false);
    H.scoreAbrir(idDe('598'));
    expect(no).toHaveLength(1);
    expect(no[0]).toContain('NO se ha guardado');
    expect(borrador().corrida).toBe('599');
    expect(H.scoreEstado(borrador().tanques[2])).toBe('completo');
    expect(fp().querySelector('[data-sk="corrida"]').value).toBe('599');
    responder(true);
    H.scoreAbrir(idDe('598'));
    expect(borrador().corrida).toBe('598');
    expect(fp().querySelector('[data-sk="corrida"]').value).toBe('598');
  });

  it('🔴 «🗑 Nueva evaluación», con tanques sin guardar, pregunta: «no» deja la pantalla; «sí» empieza en blanco', () => {
    evaluar({ 1: 2 });
    const no = responder(false);
    H.scoreNueva();
    expect(no).toHaveLength(1);
    expect(no[0]).toContain('NO se ha guardado');
    expect(borrador().corrida).toBe('598');
    responder(true);
    H.scoreNueva();
    expect(borrador().corrida).toBe('');
  });

  it('🔴 ✏️ Abrir no pregunta si lo de pantalla ya está guardado ni si no hay nada evaluado', () => {
    evaluar({ 1: 2 });
    H.scoreGuardar();
    const vistas = responder(false);
    H.scoreAbrir(idDe('598'));
    H.scoreNueva();
    expect(borrador().corrida, 'guardada: «Nueva» no pregunta').toBe('');
    H.scoreAbrir(idDe('598'));
    expect(vistas).toEqual([]);
    expect(borrador().corrida).toBe('598');
  });

  it('🔴 una NUEVA con la llave de una PENDIENTE dice qué tanque se perdería: «no» no toca nada; «sí» la reemplaza', () => {
    evaluar({ 1: 2, 2: 2 });
    H.scoreGuardar();
    H.scoreNueva();
    evaluar({ 4: 3 });
    const no = responder(false);
    H.scoreGuardar();
    expect(no).toHaveLength(1);
    expect(no[0]).toContain('pendiente de enviar');
    expect(no[0]).toContain('Se perdería, sin llegar a la hoja: TQ 1, TQ 2.');
    expect(no[0]).not.toContain('TQ 4');
    expect(tanquesDe('598')).toEqual([1, 2]);
    responder(true);
    H.scoreGuardar();
    expect(H._scoreRaw()).toHaveLength(1);
    expect(tanquesDe('598')).toEqual([4]);
  });

  it('🔴 el mismo tanque con otros puntos se dice aparte, sin hablar de pérdidas', () => {
    evaluar({ 1: 2, 2: 2 });
    H.scoreGuardar();
    H.scoreNueva();
    evaluar({ 1: 3, 2: 2 });
    const no = responder(false);
    H.scoreGuardar();
    expect(no).toHaveLength(1);
    expect(no[0]).toContain('Se sustituiría: TQ 1.');
    expect(no[0]).not.toContain('TQ 2');
    expect(no[0]).not.toContain('Se perdería');
    const t = H._scoreRaw()[0].data.tanques[1];
    expect(H.SCORE_CRITERIOS.map((c) => t[c.k]), '«no» conserva los puntos').toEqual(H.SCORE_CRITERIOS.map((c) => c.pts[2]));
  });

  /* 2026-11-05 (auditoría; usuario: «Contarlas también») · los datos de la evaluación entera viajan en cada fila: con los mismos tanques y
     otras observaciones no preguntaba, y al enviarla la hoja se quedaba con las nuevas, o vacías. */
  it('🔴 los mismos tanques con otras observaciones, o vaciadas, también preguntan y lo dicen', () => {
    evaluar({ 1: 2 });
    campo('observaciones', 'Nota de prueba');
    campo('camaronera', 'Camaronera de prueba');
    H.scoreGuardar();
    H.scoreNueva();
    evaluar({ 1: 2 });
    campo('observaciones', 'Otra nota');
    const no = responder(false);
    H.scoreGuardar();
    expect(no).toHaveLength(1);
    expect(no[0]).toContain('Observaciones');
    expect(no[0]).toContain('Camaronera');
    expect(no[0]).not.toContain('TQ 1');
    expect(H._scoreRaw()[0].data.observaciones, '«no» las conserva').toBe('Nota de prueba');
  });

  it('🔴 rellenar un dato que la guardada no tenía no pisa nada: no pregunta', () => {
    evaluar({ 1: 2 });
    H.scoreGuardar();
    H.scoreNueva();
    evaluar({ 1: 2 });
    campo('observaciones', 'Nota nueva');
    const vistas = responder(false);
    H.scoreGuardar();
    expect(vistas).toEqual([]);
    expect(H._scoreRaw()[0].data.observaciones).toBe('Nota nueva');
  });

  it('🔴 ya ENVIADA: lo que falta sigue en la hoja y no pregunta; lo que cambia sí, y dice que se corrige allí', () => {
    evaluar({ 1: 2 });
    H.scoreGuardar();
    marcarEnviada();
    H.scoreNueva();
    evaluar({ 4: 3 });
    const vistas = responder(false);
    H.scoreGuardar();
    expect(vistas).toEqual([]);
    expect(tanquesDe('598')).toEqual([4]);
    marcarEnviada();
    H.scoreNueva();
    evaluar({ 4: 1 });
    H.scoreGuardar();
    expect(vistas).toHaveLength(1);
    expect(vistas[0]).toContain('ya enviada');
    expect(vistas[0]).toContain('Se corregiría en la hoja: TQ 4.');
    expect(H._scoreRaw()[0].synced, '«no» la deja como enviada').toBe(true);
  });

  it('🔴 seguir con la misma no pregunta: añadir, corregir y vaciar un tanque, también en la abierta con ✏️', () => {
    evaluar({ 1: 2 });
    H.scoreGuardar();
    let vistas = responder(false);
    H.scoreTanque(4);
    marcarTodo(3);
    H.scoreGuardar();
    expect(tanquesDe('598'), 'añadir').toEqual([1, 4]);
    H.scoreTanque(1);
    marcarTodo(4);
    H.scoreGuardar();
    expect(H._scoreRaw()[0].data.tanques[1][H.SCORE_CRITERIOS[0].k], 'corregir').toBe(H.SCORE_CRITERIOS[0].pts[4]);
    expect(vistas).toEqual([]);
    responder(true);
    H.scoreVaciarTanque();
    vistas = responder(false);
    H.scoreGuardar();
    expect(tanquesDe('598'), 'vaciar').toEqual([4]);
    H.scoreNueva();
    H.scoreAbrir(idDe('598'));
    H.scoreTanque(4);
    marcarTodo(1);
    H.scoreGuardar();
    expect(H._scoreRaw()[0].data.tanques[4][H.SCORE_CRITERIOS[0].k], 'la abierta').toBe(H.SCORE_CRITERIOS[0].pts[1]);
    expect(vistas).toEqual([]);
  });

  it('🔴 recargada la página sólo pregunta si algo se pierde o cambia', () => {
    evaluar({ 1: 2 });
    H.scoreGuardar();
    H.olvidarModelo();
    H.renderScore();
    const vistas = responder(false);
    H.scoreTanque(4);
    marcarTodo(3);
    H.scoreGuardar();
    expect(vistas, 'sólo añade').toEqual([]);
    expect(tanquesDe('598')).toEqual([1, 4]);
    H.olvidarModelo();
    H.renderScore();
    H.scoreTanque(1);
    marcarTodo(4);
    H.scoreGuardar();
    expect(vistas).toHaveLength(1);
    expect(vistas[0]).toContain('Se sustituiría: TQ 1.');
  });

  // A10 (2026-11-06, usuario: «Preguntar cada vez») · antes, la pregunta de A10 (¿corrección u otra?) y, después, la de A9.
  it('🔴 llevar una evaluación a la llave de otra también pregunta: la de allí no se pisa', () => {
    evaluar({ 1: 2 });
    H.scoreGuardar();
    H.scoreNueva();
    evaluar({ 2: 3 }, '599');
    H.scoreGuardar();
    campo('corrida', '598');
    const no = [], resp = [true, false];   // «es una corrección», pero «no» a pisar la de allí
    window.confirm = (m) => { no.push(m); return resp.shift(); };
    H.scoreGuardar();
    expect(no).toHaveLength(2);
    expect(no[0]).toContain('CORRECCIÓN');
    expect(no[1]).toContain('Se perdería, sin llegar a la hoja: TQ 1.');
    expect(H._scoreRaw()).toHaveLength(2);
    expect(tanquesDe('598')).toEqual([1]);
  });

  it('🔴 los mismos puntos marcados en otro orden no son un cambio', () => {
    evaluar({ 1: 2 });
    H.scoreGuardar();
    H.scoreNueva();
    campo('modulo', 'M03');
    campo('corrida', '598');
    [...H.SCORE_CRITERIOS].reverse().forEach((c) => H.scorePick(c.k, c.pts[2]));
    const vistas = responder(false);
    H.scoreGuardar();
    expect(vistas).toEqual([]);
    expect(tanquesDe('598')).toEqual([1]);
  });
});
