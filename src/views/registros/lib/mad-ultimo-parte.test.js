// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · ⚖️ SALDO · «🖨 Último parte» (plan 0t · 12, 2026-09-29, usuario)

   Un informe en PDF del REGISTRO MÁS RECIENTE llenado —una ronda de mortalidad; al día hay 5 o 6—, con TODAS las salas
   y sus tanques en una tabla. Decisiones del usuario (NO re-preguntar):
   · el parte de cada sala es su ronda de HORA más tardía en la fecha elegida (por defecto, la del último registro
     llenado): el NÚMERO de parte no decide —medido el 29-09: Sala 1 con P2 a las 16:01 y P1 a las 17:20; Sala 3 con
     tres rondas distintas todas «P1»—;
   · una fila por TANQUE con sus lotes (lo que trae el parte es del tanque: nada se reparte);
   · de ese parte: muertos, descarte, cópulas, muda, pesos ♂/♀ y observaciones; y los VIVOS, del libro con todos los
     partes registrados hasta esa fecha;
   · los tanques con animales que no están en ese parte salen igual, «sin dato en este parte»; una sala con animales y
     sin partes ese día, también;
   · subtotal por sala y total de la granja (suma de lo que dicen los últimos partes); sólo PDF.
   Se arranca el monolito ENTERO (receta de `mad-saldo-origen-total.test.js`) y se ejercen sus funciones REALES.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madUltimoParteModelo', 'madUltimoParteFechaDefecto', 'madUltimoParteDoc', 'madUltimoPartePdf',
  'renderMadSaldo', 'MAD_LIBRO_SHEETS'];
const H = {};
let avisos = [];

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
    + '\ntry{ H.setSheets=function(o){_reproSheets=o;}; }catch(_){}'
    + '\ntry{ H.setResumen=function(r){_madResumen=r;}; }catch(_){}'
    /* 🔄 Recalcular sin red: las funciones del monolito son enlaces MUTABLES (receta del banco de engine.js). */
    + '\ntry{ H.sinRed=function(){ _madIngGasAlDia=async function(){ return true; };'
    + ' madSaldoCargar=async function(){ return madConstruirLibro(madLibroFuentes(), {}); };'
    + ' _madResLeerExtra=async function(){ return { sala:[], desoves:[], tratamientos:[], faltan:[] }; }; }; }catch(_){}'
    + '\ntry{ H.madSaldoRefrescar=madSaldoRefrescar; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m, tipo) => { avisos.push([String(m), tipo]); });
});

beforeEach(() => { avisos = []; });

const ING = (Lote, cg, Sala, Tanque, Machos, Hembras) => ({ Fecha: '2026-09-01', Lote, 'Código genético': cg, Sala, Tanque, Machos, Hembras });
const TQ = (Fecha, Sala, Tanque, Hora, Parte, extra = {}) => Object.assign({
  Fecha, Sala, Tanque, 'Machos muertos': '', 'Hembras muertas': '', 'Machos muertos por descarte de selección': '',
  'Hembras muertas por descarte de selección': '', 'Cópulas': '', Muda: '', 'Peso promedio machos (g)': '',
  'Peso promedio hembras (g)': '', 'Observaciones sanitarias': '', 'Observaciones operativas': '', Hora, Parte,
}, extra);
const M_ = (m, h) => ({ 'Machos muertos': m, 'Hembras muertas': h });

/* La planta, con lo que distingue la regla buena de las malas:
   · Sala 1: tres rondas el 29-09 —06:26 P1, 16:01 P2 y 17:20 P1—: la más reciente es la de MENOR número. En t1 el
     libro resta las tres (vivos 48♂ 92♀); en t2 (AB+BC, compartido) el parte de las 17:20 NO trae fila → sin dato.
   · Sala 3: rondas «02:31», «9:05» y «15:53»: comparadas como TEXTO ganaría «9:05»; por hora gana la de las 15:53.
   · Sala 4: animales y NINGÚN parte ese día.
   · El 30-09 hay otro parte en Sala 1 · t1 (5/5): ni es del día ni puede tocar los vivos del 29. */
const FUENTES = () => ({
  ingresos: [ING('AB', 'CG1', 'Sala 1', 1, 50, 100), ING('AB', 'CG1', 'Sala 1', 2, 40, 90), ING('BC', 'CG2', 'Sala 1', 2, 10, 10),
    ING('CD', 'CG3', 'Sala 3', 22, 30, 60), ING('EF', 'CG4', 'Sala 4', 1, 20, 40)],
  movimientos: [], cierres: [], mortDesove: [],
  tanques: [
    TQ('2026-09-29', 'Sala 1', 1, '06:26', 1, M_(1, 2)),
    TQ('2026-09-29', 'Sala 1', 2, '06:26', 1, M_(0, 1)),
    TQ('2026-09-29', 'Sala 1', 1, '16:01', 2, { ...M_(0, 3), 'Machos muertos por descarte de selección': 1, 'Cópulas': 5, Muda: 2 }),
    TQ('2026-09-29', 'Sala 1', 2, '16:01', 2, M_(2, 0)),
    TQ('2026-09-29', 'Sala 1', 1, '17:20', 1, { ...M_(0, 1), 'Hembras muertas por descarte de selección': 2, Muda: 1,
      'Peso promedio machos (g)': 35, 'Peso promedio hembras (g)': 52,
      'Observaciones sanitarias': 'Animales estresados', 'Observaciones operativas': 'En recambio' }),
    TQ('2026-09-29', 'Sala 3', 22, '02:31', 1, M_(1, 0)),
    TQ('2026-09-29', 'Sala 3', 22, '9:05', 1, M_(0, 1)),
    TQ('2026-09-29', 'Sala 3', 22, '15:53', 1, { ...M_(0, 2), 'Cópulas': 7 }),
    TQ('2026-09-30', 'Sala 1', 1, '06:00', 1, M_(5, 5)),
  ],
});
const par = (m, h) => ({ machos: m, hembras: h });

describe('🖨 Último parte · el modelo', () => {
  it('🔴 de cada sala, su ronda de HORA más tardía: el número de parte no decide, ni el orden del texto', () => {
    const M = H.madUltimoParteModelo(FUENTES(), '2026-09-29');
    expect(M.salas.map((s) => [s.sala, s.hora, s.parte, s.sinPartes])).toEqual([
      ['Sala 1', '17:20', '1', false],     // no la de las 16:01, que es la «P2»
      ['Sala 3', '15:53', '1', false],     // no «9:05», que como texto sería la mayor
      ['Sala 4', '', '', true],
    ]);
  });

  it('🔴 los valores son SÓLO los de ese parte, y los vivos los del libro hasta esa fecha', () => {
    const s1 = H.madUltimoParteModelo(FUENTES(), '2026-09-29').salas[0];
    const t1 = s1.tanques.find((t) => t.tanque === 1);
    expect(t1.lotes).toBe('AB');
    expect(t1.vivos).toEqual(par(48, 92));            // 50/100 menos las tres rondas del 29; NO el parte del 30
    expect(t1.dato).toEqual({ muertos: par(0, 1), descarte: par(0, 2), copulas: '', muda: 1,
      peso: par(35, 52), obs: 'Animales estresados · En recambio' });
  });

  it('🔴 un tanque con animales que no está en ese parte sale igual, sin dato; y con sus DOS lotes', () => {
    const s1 = H.madUltimoParteModelo(FUENTES(), '2026-09-29').salas[0];
    expect(s1.tanques.map((t) => t.tanque)).toEqual([1, 2]);
    const t2 = s1.tanques.find((t) => t.tanque === 2);
    expect(t2).toMatchObject({ lotes: 'AB+BC', vivos: par(48, 99), dato: null });
  });

  it('🔴 una sala con animales y sin partes ese día sale con sus tanques y sin dato', () => {
    const s4 = H.madUltimoParteModelo(FUENTES(), '2026-09-29').salas[2];
    expect(s4.tanques).toEqual([{ tanque: 1, lotes: 'EF', vivos: par(20, 40), dato: null }]);
  });

  it('🔴 subtotal por sala y total de la granja: la suma de lo que dicen los ÚLTIMOS partes', () => {
    const M = H.madUltimoParteModelo(FUENTES(), '2026-09-29');
    expect(M.salas[0].total).toEqual({ vivos: par(96, 191), muertos: par(0, 1), descarte: par(0, 2), copulas: '', muda: 1 });
    expect(M.salas[1].total).toEqual({ vivos: par(29, 57), muertos: par(0, 2), descarte: par(0, 0), copulas: 7, muda: '' });
    expect(M.total).toEqual({ vivos: par(145, 288), muertos: par(0, 3), descarte: par(0, 2), copulas: 7, muda: 1 });
  });

  it('la fecha por defecto es la del último registro llenado hasta hoy (un parte futuro no cuenta)', () => {
    const t = FUENTES().tanques;
    expect(H.madUltimoParteFechaDefecto(t, '2026-09-29')).toBe('2026-09-29');
    expect(H.madUltimoParteFechaDefecto(t, '2026-10-02')).toBe('2026-09-30');
    expect(H.madUltimoParteFechaDefecto([], '2026-10-02')).toBe('2026-10-02');
  });
});

describe('🖨 Último parte · el documento', () => {
  it('🔴 dice qué es: el último parte de cada sala con su hora, los sin dato, los totales y que no es el día entero', () => {
    const doc = H.madUltimoParteDoc(H.madUltimoParteModelo(FUENTES(), '2026-09-29')).replace(/\s+/g, ' ');
    expect(doc).toContain('Maduración · Último parte registrado · 29/09/2026');
    expect(doc).toContain('Sala 1 · parte de las 17:20');
    expect(doc).toContain('Sala 4 · sin partes en esta fecha');
    expect(doc).toContain('sin dato en este parte');
    expect(doc).toContain('Total Sala 1');
    expect(doc).toContain('TOTAL GRANJA');
    expect(doc).toContain('no las del día entero');
    expect(doc).toContain('Animales estresados · En recambio');
  });

  it('🔴 escapa lo que viene de la hoja', () => {
    const f = FUENTES();
    f.tanques[4]['Observaciones sanitarias'] = '<img src=x onerror=alert(1)>';
    const doc = H.madUltimoParteDoc(H.madUltimoParteModelo(f, '2026-09-29'));
    expect(doc).not.toContain('<img src=x');
    expect(doc).toContain('&lt;img src=x');
  });
});

describe('🖨 Último parte · en la pestaña ⚖️ Saldo', () => {
  it('🔴 el botón y su fecha están en la barra del Saldo', () => {
    const fp = document.getElementById('fp-saldo');
    fp.innerHTML = '';
    H.renderMadSaldo();
    const b = [...fp.querySelectorAll('button')].find((x) => /Último parte/.test(x.textContent));
    expect(b, 'falta el botón «🖨 Último parte»').toBeTruthy();
    expect(b.getAttribute('onclick')).toContain('madUltimoPartePdf');
    expect(fp.querySelector('input[type=date]#ms-up-fecha')).toBeTruthy();
  });

  it('🔴 🔄 Recalcular deja la fecha del ÚLTIMO registro llenado (y la renueva en cada recálculo)', async () => {
    const f = FUENTES();
    const S = H.MAD_LIBRO_SHEETS;
    H.setSheets({ [S.ingreso]: f.ingresos, [S.movimientos]: [], [S.tanques]: f.tanques, [S.cierres]: [], [S.mortDesove]: [] });
    const fp = document.getElementById('fp-saldo');
    fp.innerHTML = '';
    H.renderMadSaldo();
    document.getElementById('ms-up-fecha').value = '2026-01-01';   // lo de un recálculo anterior
    H.sinRed();
    await H.madSaldoRefrescar();
    /* `today()` es la de hoy de verdad (posterior a la planta): el último registro llenado es el del 30-09. */
    expect(document.getElementById('ms-up-fecha').value).toBe('2026-09-30');
  });

  it('🔴 sin 🔄 Recalcular, avisa y no abre nada', () => {
    H.setResumen(null);
    let abierto = false;
    window.open = () => { abierto = true; return null; };
    H.madUltimoPartePdf();
    expect(abierto).toBe(false);
    expect(avisos.some(([m]) => /Recalcular/.test(m))).toBe(true);
  });

  it('🔴 con lo leído, imprime el parte de la fecha elegida (por defecto, la del último registro)', () => {
    const f = FUENTES();
    const S = H.MAD_LIBRO_SHEETS;
    H.setSheets({ [S.ingreso]: f.ingresos, [S.movimientos]: [], [S.tanques]: f.tanques, [S.cierres]: [], [S.mortDesove]: [] });
    H.setResumen({ hoy: '2026-09-29' });
    const fp = document.getElementById('fp-saldo');
    fp.innerHTML = '';
    H.renderMadSaldo();
    let escrito = '';
    window.open = () => ({ document: { write: (s) => { escrito += s; }, close: () => {} } });
    H.madUltimoPartePdf();
    expect(escrito).toContain('Último parte registrado · 29/09/2026');
    expect(escrito).toContain('Sala 1 · parte de las 17:20');
    document.getElementById('ms-up-fecha').value = '2026-09-30';
    escrito = '';
    H.madUltimoPartePdf();
    expect(escrito).toContain('Último parte registrado · 30/09/2026');
    expect(escrito).toContain('Sala 1 · parte de las 06:00');
  });
});
