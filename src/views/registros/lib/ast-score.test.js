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
    + '\ntry{ H.olvidarModelo=function(){ _scoreModel=null; _scoreTq=1; }; }catch(_){}\n})();';
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
