// @vitest-environment happy-dom
/* ============================================================
   UNA FECHA POSTERIOR A HOY (punto 46 de la pauta del 2026-11-12)

   Laboratorio (_labFechasError) y el reproductivo (_reproFechaFutura) ya la bloqueaban desde septiembre; las demás fichas la
   aceptaban: un año mal tecleado o un día de más dejaba los datos en un día que todavía no ha llegado. Decisión del usuario:
   «Bloquear, como Laboratorio» — la fecha principal de cada ficha no puede ser posterior a hoy (el del dispositivo): no se
   guarda ni se envía, y se dice por qué. Fuera, por ser futuras por naturaleza: las predicciones de 🌊 Mareas, las fechas de
   N2/N5 de Desoves y la próxima parada de 🔧 Mantenimiento.

   Cada caso 🔴 tiene su control con la fecha de HOY (o de ayer): sin él, una ficha que no guardara nada por otro motivo
   daría el 🔴 por bueno. Las fechas salen de `today()` del propio motor: la prueba no depende del día en que se corra.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['today', '_fechaPosterior', 'AST_MOD', 'MAD_MOD', 'BIO_MOD', 'MNT_MOD', 'MAD_BORR_FICHAS',
  'renderFicha', 'localSave', 'localSync', 'loadE', 'renderBlanco', 'syncBlanco',
  'renderMadIngreso', 'renderMadMovimientos', 'renderMadDesoves', 'renderMadFinCiclo', 'renderMadTratamientos', 'renderMadMortDesove',
  'renderMadAlimentacion', 'madIngRevisar', 'madMovRevisar', 'madDesRevisar', 'madFinRevisar', 'madTratRevisar', 'madMortRevisar',
  'madAlimRevisar', '_madIngPreparar', '_madMovPreparar', '_madDesPreparar', '_madFinPreparar', '_madTratPreparar', '_madMortPreparar',
  '_madAlimPreparar', 'renderMadSalas', 'madSalasFechaChange', 'renderBiomol', 'bioFechaChange',
  'renderAlgas', 'addToAlgHist', 'loadAlgHist', '_invalidateLoadE', 'renderAst', 'saveAstLocal', '_astRaw',
  'renderScore', 'scoreCampo', 'scorePick', 'scoreGuardar', 'SCORE_CRITERIOS', '_scoreRaw',
  'renderMntTrabajo', 'mntTrabCampo', 'mntTrabGuardar', 'loadMntTrabajos',
  'renderAud', 'audGuardar', '_audRaw', 'AUD_DRAFT_KEY',
  'renderTraslado', 'trasAgregarCamion', 'trasIrRevision', 'trasGuardarLocal', '_trasRaw',
  '_gasVersionLocal', '_lastSyncFingerprint'];
const H = {};
const avisos = [];
const envios = [];

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')),
    renderCalidadFicha: (await import('../fichas/calidad.render.js')).renderCalidadFicha,
    resolveCalidadData: (await import('../fichas/calidad.data.js')).resolveCalidadData };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setBlanco=function(b){ _blancoState=b; }; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}'
    + '\ntry{ H.olvidar=function(){'
    + ' try{ _scoreModel=null; _scoreTq=1; _scoreOrigen=null; }catch(_){}'
    + ' try{ _audModel=null; _audOrigen=null; }catch(_){}'
    + ' try{ _mntRonda=null; _mntTrab=null; }catch(_){}'
    + ' try{ _trasViajeActivo=null; _trasEnBlanco=false; }catch(_){}'
    + ' }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return 'ok'; });
  H.setPost(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return true; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) };
  };
});

beforeEach(() => {
  globalThis.localStorage.clear();
  avisos.length = 0;
  envios.length = 0;
  H._lastSyncFingerprint.clear();
  H.olvidar();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
  window.confirm = () => true;
});
afterEach(() => { vi.useRealTimers(); });

const corre = (iso, dias) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const HOY = () => H.today();
const MANANA = () => corre(H.today(), 1);
const AYER = () => corre(H.today(), -1);
const POSTERIOR = /es posterior a hoy \(\d{2}\/\d{2}\/\d{4} en este dispositivo\)/;
const aviso = (re) => avisos.some((a) => re.test(a));
const teclear = (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); return el; };

describe('_fechaPosterior · la regla', () => {
  it('🔴 mañana y un año de más: lo dice, con las dos fechas', () => {
    expect(H._fechaPosterior(MANANA())).toMatch(POSTERIOR);
    expect(H._fechaPosterior(MANANA())).toContain(MANANA().split('-').reverse().join('/'));
    expect(H._fechaPosterior(corre(H.today(), 366))).toMatch(POSTERIOR);
  });
  it('hoy, ayer o nada: vale ("")', () => {
    expect([H._fechaPosterior(HOY()), H._fechaPosterior(AYER()), H._fechaPosterior(''), H._fechaPosterior(undefined)]).toEqual(['', '', '', '']);
  });
});

describe('Larvicultura · una ficha con fecha posterior a hoy no se guarda ni se envía', () => {
  const fp = () => document.getElementById('fp-calidad');
  const fecha = () => fp().querySelector('input[type="date"][name="fecha"]');
  const llenar = () => {
    teclear(fp().querySelector('input[type="number"][name]'), '4');
    const co = fp().querySelector('[name="corrida"]'); if (co) teclear(co, '601');
    const te = fp().querySelector('[name="tec"]'); if (te) teclear(te, 'Prueba');
  };
  beforeEach(() => { H.setVista(1, 'calidad'); H.renderFicha('calidad'); });

  it('🔴 💾: no guarda y dice por qué', () => {
    llenar(); fecha().value = MANANA();
    H.localSave('calidad');
    expect(H.loadE(1, 'calidad'), 'se guardó con fecha de mañana').toBeFalsy();
    expect(aviso(/Calidad Larvaria: la fecha .* es posterior a hoy/), avisos.join(' | ')).toBe(true);
  });

  it('🔴 ☁️: no envía', async () => {
    llenar(); fecha().value = MANANA();
    await H.localSync('calidad');
    expect(envios, 'se envió con fecha de mañana').toHaveLength(0);
    expect(aviso(/No se guardó ni se envió/)).toBe(true);
  });

  it('con la fecha de hoy, lo de siempre: se guarda', () => {
    llenar(); fecha().value = HOY();
    H.localSave('calidad');
    expect(H.loadE(1, 'calidad').data.fecha).toBe(HOY());
  });
});

describe('📝 Blanco · la corrección no sale con una fecha posterior a hoy', () => {
  it('🔴 no se envía y se dice', async () => {
    H.setVista(1, 'blanco');
    H.setBlanco({ ficha: 'calidad', histId: 'h1', data: { fecha: MANANA(), corrida: '601', tec: 'Prueba', mo_0: '5' } });
    H.renderBlanco();
    await H.syncBlanco();
    expect(envios, 'salió con fecha de mañana').toHaveLength(0);
    expect(aviso(/Blanco: la fecha .* es posterior a hoy/), avisos.join(' | ')).toBe(true);
  });
});

describe('🦐 Maduración · los siete formularios: «Revisar» y guardar/enviar lo marcan como error', () => {
  const FORMS = [
    ['ingreso', 'renderMadIngreso', 'madIngRevisar', '_madIngPreparar', 'mi-report'],
    ['movimientos', 'renderMadMovimientos', 'madMovRevisar', '_madMovPreparar', 'mv-report'],
    ['desoves', 'renderMadDesoves', 'madDesRevisar', '_madDesPreparar', 'md-report'],
    ['fin', 'renderMadFinCiclo', 'madFinRevisar', '_madFinPreparar', 'mf-report'],
    ['tratamientos', 'renderMadTratamientos', 'madTratRevisar', '_madTratPreparar', 'mt-report'],
    ['mortdes', 'renderMadMortDesove', 'madMortRevisar', '_madMortPreparar', 'mm-report'],
    ['alimentacion', 'renderMadAlimentacion', 'madAlimRevisar', '_madAlimPreparar', 'ma-report'],
  ];
  const montar = (ficha, render) => {
    const p = document.getElementById(H.MAD_BORR_FICHAS[ficha].panel);
    expect(p, 'sin panel ' + ficha).toBeTruthy();
    p.innerHTML = '';
    H.setVista(H.MAD_MOD, ficha);
    H[render]();
    const f = document.getElementById(H.MAD_BORR_FICHAS[ficha].fecha);
    expect(f, 'sin campo de fecha en ' + ficha).toBeTruthy();
    return f;
  };
  const informe = (id) => (document.getElementById(id) || {}).textContent || '';

  it.each(FORMS)('🔴 %s · con fecha de mañana', async (ficha, render, revisar, preparar, rep) => {
    const f = montar(ficha, render);
    f.value = MANANA();
    await H[revisar]();
    expect(informe(rep), '«Revisar» no lo marca').toMatch(POSTERIOR);
    document.getElementById(rep).innerHTML = '';
    expect(H[preparar](false), 'guardar/enviar siguió adelante').toBeNull();
    expect(informe(rep), 'guardar/enviar no lo marca').toMatch(POSTERIOR);
  });

  it.each(FORMS)('%s · con la fecha de hoy no se marca (control)', async (ficha, render, revisar, preparar, rep) => {
    const f = montar(ficha, render);
    f.value = HOY();
    await H[revisar]();
    expect(informe(rep)).not.toMatch(/posterior a hoy/);
    H[preparar](false);
    expect(informe(rep)).not.toMatch(/posterior a hoy/);
  });
});

describe('Grillas · una fecha posterior a hoy no se elige (se vuelve a la que había y se dice)', () => {
  it('🔴 Maduración · Salas (y Tanques: la misma función)', () => {
    H.setVista(H.MAD_MOD, 'salas'); H.renderMadSalas();
    const el = () => document.getElementById('mad-salas-fecha');
    const antes = el().value;
    el().value = MANANA();
    H.madSalasFechaChange();
    expect(el().value, 'la grilla se quedó en mañana').toBe(antes);
    expect(aviso(POSTERIOR), avisos.join(' | ')).toBe(true);
    el().value = AYER();
    H.madSalasFechaChange();
    expect(el().value, 'un día pasado sí se elige (control)').toBe(AYER());
  });

  it('🔴 Biomol', () => {
    H.setVista(H.BIO_MOD, 'biomol'); H.renderBiomol();
    const el = () => document.getElementById('bio-grid-fecha');
    const antes = el().value;
    el().value = MANANA();
    H.bioFechaChange();
    expect(el().value).toBe(antes);
    expect(aviso(POSTERIOR), avisos.join(' | ')).toBe(true);
    el().value = AYER();
    H.bioFechaChange();
    expect(el().value, 'un día pasado sí se elige (control)').toBe(AYER());
  });
});

describe('Algas y As Técnico', () => {
  it('🔴 Algas: no se agrega al historial', () => {
    H._invalidateLoadE();
    H.setVista(11, 'algas'); H.renderAlgas();
    const c = (n) => document.querySelector(`#fp-algas [name="${n}"]`);
    c('cel_ml').value = '280000';
    c('fecha').value = MANANA();
    H.addToAlgHist();
    expect(H.loadAlgHist(), 'se agregó con fecha de mañana').toHaveLength(0);
    expect(aviso(/Algas: la fecha .* es posterior a hoy/), avisos.join(' | ')).toBe(true);
    c('fecha').value = HOY();
    H.addToAlgHist();
    expect(H.loadAlgHist(), 'con la de hoy sí (control)').toHaveLength(1);
  });

  it('🔴 As Técnico: no se guarda', () => {
    H.setVista(H.AST_MOD, 'ast'); H.renderAst();
    const c = (n) => document.querySelector(`#fp-ast .mad-form [name="${n}"]`);
    ['supervisor', 'modulo', 'siembra', 'estadio'].forEach((n) => {
      const s = c(n);
      expect(s, 'sin ' + n).toBeTruthy();
      let o = [...s.options].find((x) => x.value);
      if (!o) { o = document.createElement('option'); o.value = 'Prueba'; o.textContent = 'Prueba'; s.appendChild(o); }
      s.value = o.value;
    });
    c('comentario').value = 'Turno de prueba';
    c('fecha').value = MANANA();
    H.saveAstLocal();
    expect(H._astRaw(), 'se guardó con fecha de mañana').toHaveLength(0);
    expect(aviso(/As Técnico: la fecha .* es posterior a hoy/), avisos.join(' | ')).toBe(true);
    c('fecha').value = HOY();
    H.saveAstLocal();
    expect(H._astRaw(), 'con la de hoy sí (control)').toHaveLength(1);
  });
});

describe('Score, Mantenimiento, Auditoría y Traslado', () => {
  it('🔴 Score: no se guarda', () => {
    H.setVista(H.AST_MOD, 'score'); H.renderScore();
    const c = (k, v) => { const el = document.querySelector(`#fp-score [data-sk="${k}"]`); el.value = v; H.scoreCampo(el); };
    c('modulo', 'M03'); c('corrida', '598'); c('fecha', MANANA());
    H.SCORE_CRITERIOS.forEach((x) => H.scorePick(x.k, x.pts[2]));
    H.scoreGuardar();
    expect(H._scoreRaw(), 'se guardó con fecha de mañana').toHaveLength(0);
    expect(aviso(POSTERIOR), avisos.join(' | ')).toBe(true);
    c('fecha', HOY());
    H.scoreGuardar();
    expect(H._scoreRaw(), 'con la de hoy sí (control)').toHaveLength(1);
  });

  it('🔴 Mantenimiento · trabajo: no se guarda', () => {
    H.setVista(H.MNT_MOD, 'mnttrabajo'); H.renderMntTrabajo();
    const c = (k, v) => { const el = document.querySelector(`#fp-mnttrabajo [data-mk="${k}"]`); expect(el, 'sin ' + k).toBeTruthy(); el.value = v; H.mntTrabCampo(el); };
    c('equipo', 'BLW-03'); c('tipo', 'Preventivo'); c('actividad', 'Cambio de aceite'); c('horometro', '927,30'); c('fecha', MANANA());
    H.mntTrabGuardar();
    expect(H.loadMntTrabajos(), 'se guardó con fecha de mañana').toHaveLength(0);
    expect(aviso(POSTERIOR), avisos.join(' | ')).toBe(true);
    c('fecha', HOY());
    H.mntTrabGuardar();
    expect(H.loadMntTrabajos(), 'con la de hoy sí (control)').toHaveLength(1);
  });

  describe('Auditoría · cada siembra, transferencia y cosecha', () => {
    const SI = (o) => ({ siembra: '1ª', modulo: 'M04', tanque: '1', fecha: AYER(), origen: 'Omarsa', guia: '1001', cantidad: '7,000,000', ton: '28', ...o });
    const TR = (o) => ({ fecha: AYER(), modulo: 'M04', tanque: '1', moduloDest: 'M04', tanqueDest: '2', cantidad: '6,200,000', estadio: 'PL5', ...o });
    const CO = (o) => ({ fecha: AYER(), modulo: 'M04', tanque: '1', partida: 1, cantidad: '3,290,000', estadio: 'PL13', ...o });
    const cargar = (d) => {
      localStorage.setItem(H.AUD_DRAFT_KEY, JSON.stringify({ corrida: '901', modulo: 'M04', registrado: 'Ana', obs: '', siembras: [], transferencias: [], cosechas: [], ...d }));
      H.olvidar(); H.setVista(H.AST_MOD, 'auditoria'); H.renderAud();
    };
    it.each([
      ['siembras', 'Siembra', SI], ['transferencias', 'Transferencia', TR], ['cosechas', 'Cosecha', CO],
    ])('🔴 %s: con fecha de mañana no se guarda y se dice cuál', (sec, nombre, fila) => {
      cargar({ [sec]: [fila({ fecha: MANANA() })] });
      H.audGuardar();
      expect(H._audRaw(), 'se guardó con fecha de mañana').toHaveLength(0);
      expect(aviso(new RegExp(nombre + ' 1: la fecha .* es posterior a hoy')), avisos.join(' | ')).toBe(true);
    });
    it.each([['siembras', SI], ['transferencias', TR], ['cosechas', CO]])('%s: con fecha de ayer sí (control)', (sec, fila) => {
      cargar({ [sec]: [fila()] });
      H.audGuardar();
      expect(H._audRaw(), avisos.join(' | ')).toHaveLength(1);
    });
  });

  describe('🚚 Traslado', () => {
    const panel = () => document.getElementById('fp-traslado');
    const preparar = (fecha) => {
      H.setVista(H.AST_MOD, 'traslado'); H.renderTraslado();
      panel().querySelector('#tras-alta-placa').value = 'GSA-1147';
      H.trasAgregarCamion();
      expect(panel().querySelectorAll('.tras-camion').length, 'el alta no añadió el camión').toBe(1);
      panel().querySelector('.mad-form > .meta [data-k="fecha"], .mad-form > .mf [data-k="fecha"]').value = fecha;
      panel().querySelector('[data-k="camaronera"]').value = 'Puná 1';
    };
    it('🔴 💾: no se guarda, y se dice que es la fecha de entrega', () => {
      preparar(MANANA());
      expect(H.trasGuardarLocal()).toBe(false);
      expect(H._trasRaw()).toHaveLength(0);
      expect(aviso(/la fecha de entrega .* es posterior a hoy/), avisos.join(' | ')).toBe(true);
    });
    it('🔴 en silencio (☁️, cambiar de viaje, fotos): tampoco, y también se dice', () => {
      preparar(MANANA());
      expect(H.trasGuardarLocal({ callado: true })).toBe(false);
      expect(aviso(/la fecha de entrega .* es posterior a hoy/), avisos.join(' | ')).toBe(true);
    });
    it('con la de hoy sí (control)', () => {
      preparar(HOY());
      expect(H.trasGuardarLocal(), avisos.join(' | ')).toBe(true);
      expect(H._trasRaw()).toHaveLength(1);
    });
  });
});
