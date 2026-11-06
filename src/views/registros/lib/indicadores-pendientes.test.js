// @vitest-environment happy-dom
/* ============================================================
   A14 · LOS INDICADORES DE LO PENDIENTE (2026-11-05)

   Tres sitios dicen qué falta por enviar y cada uno contaba otra cosa: la cabecera, la baldosa del módulo y el aviso al
   cerrar la página. Y más de veinte sitios escriben «Todo sincronizado» al terminar un envío sin mirar si queda algo en el
   módulo. Lo decide `setSyncUI`, igual que ya hacía con la cola: lo pide quien lo pida, lo pendiente manda.
   Decisión del usuario: las fichas de días anteriores también cuentan en la cabecera y al cerrar.
   Motor entero, con un almacén propio. Registros inventados.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['setSyncUI', 'updateSyncUI', 'buildGrid', 'today', 'saveE', 'saveMadList', 'madLocGuardar', '_astSave', '_trasSave', '_bioSave',
  '_micSave', '_enqueueSync', 'syncAllPendingScore', '_invalidateLoadE', 'SCORE_REC_KEY', 'AUD_REC_KEY', 'MNT_RONDA_KEY', 'MNT_TRAB_KEY',
  'CAL_REC_KEY', 'PAT_REC_KEY', 'ALGHIST_PRE', 'PRE', 'AST_MOD', 'MAD_MOD', 'LAB_MOD', 'BIO_MOD', 'MIC_MOD', 'MNT_MOD', 'CIO_MOD'];
const H = {};
const mapa = new Map();
const almacen = {
  getItem: (k) => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => mapa.set(k, String(v)), removeItem: (k) => mapa.delete(k),
  clear: () => mapa.clear(), key: (i) => Array.from(mapa.keys())[i] ?? null, get length() { return mapa.size; },
};

beforeAll(async () => {
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
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}'
    + '\ntry{ H.tecleado=function(v){ _madGridDirty=v; _bioGridDirty=v; _astFormDirty=v; _formDirty=v; }; }catch(_){}'
    + '\ntry{ H.marca=function(c,v){ if(c==="mad") _madGridDirty=v; if(c==="bio") _bioGridDirty=v; if(c==="ast") _astFormDirty=v; if(c==="form") _formDirty=v; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast(() => {});
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  window.confirm = () => true;
});

const lbl = () => document.getElementById('slbl').textContent;
const punto = () => document.getElementById('sdot').className;
const DIA = 86400000;
const ayer = () => new Date(new Date(H.today() + 'T12:00:00Z').getTime() - DIA).toISOString().slice(0, 10);
let n = 0;
const rec = (synced = false) => ({ id: 'R-' + (++n), ts: Date.now(), synced, ...(synced ? { syncedAt: Date.now() } : {}), data: {} });
const lista = (clave, synced) => almacen.setItem(clave, JSON.stringify([rec(synced)]));
const fichaDe = (m, f, dia, synced = false) => {
  const t = Date.now() - 30 * 3600 * 1000;
  almacen.setItem(H.PRE + 'M' + String(m).padStart(2, '0') + '_' + f + '_' + dia, JSON.stringify({ mod: m, ficha: f, date: dia, savedAt: t, updatedAt: t, synced, data: { x: '1' } }));
};
/** Una cosa pendiente, por su nombre: [módulo, cómo se apunta, lo que dice la cabecera]. */
const CASOS = () => ({
  'As Técnico · Supervisión': [H.AST_MOD, () => H._astSave([rec()]), '1 registro(s) pendiente(s)'],
  'As Técnico · 🚚 Traslado': [H.AST_MOD, () => H._trasSave([rec()]), '1 registro(s) pendiente(s)'],
  'As Técnico · 🎯 Score': [H.AST_MOD, () => lista(H.SCORE_REC_KEY), '1 registro(s) pendiente(s)'],
  'As Técnico · 🧾 Auditoría': [H.AST_MOD, () => lista(H.AUD_REC_KEY), '1 registro(s) pendiente(s)'],
  'Maduración · una grilla': [H.MAD_MOD, () => H.saveMadList('salas', [rec()]), '1 registro(s) pendiente(s)'],
  'Maduración · 💾 en una ficha de formulario': [H.MAD_MOD, () => H.madLocGuardar('desoves', [{ id: 'd1', payload: { rows: [[1]] } }]), '1 registro(s) pendiente(s)'],
  'Biomol': [H.BIO_MOD, () => H._bioSave([rec()]), '1 registro(s) pendiente(s)'],
  'Microbiología': [H.MIC_MOD, () => H._micSave([rec()]), '1 muestra(s) pendiente(s)'],
  'Microbiología · Calidad': [H.MIC_MOD, () => lista(H.CAL_REC_KEY), '1 muestra(s) pendiente(s)'],
  'Microbiología · Patología': [H.MIC_MOD, () => lista(H.PAT_REC_KEY), '1 muestra(s) pendiente(s)'],
  '🔧 Mantenimiento · ronda': [H.MNT_MOD, () => lista(H.MNT_RONDA_KEY), '1 registro(s) pendiente(s)'],
  '🔧 Mantenimiento · trabajo': [H.MNT_MOD, () => lista(H.MNT_TRAB_KEY), '1 registro(s) pendiente(s)'],
  'Módulo · una ficha de hoy': [1, () => H.saveE(1, 'calidad', { x: '1' }), '1 ficha(s) pendiente(s)'],
  'Módulo · Desinfección': [1, () => H.saveE(1, 'desinfeccion', { x: '1' }), '1 ficha(s) pendiente(s)'],
  'Módulo · una ficha de AYER': [1, () => fichaDe(1, 'calidad', ayer()), '1 ficha(s) pendiente(s)'],
  'Lab Algas · hoy': [H.LAB_MOD, () => almacen.setItem(H.ALGHIST_PRE + H.today(), JSON.stringify([rec()])), '1 ficha(s) pendiente(s)'],
  'Lab Algas · AYER': [H.LAB_MOD, () => almacen.setItem(H.ALGHIST_PRE + ayer(), JSON.stringify([rec()])), '1 ficha(s) pendiente(s)'],
});
const NOMBRES = ['As Técnico · Supervisión', 'As Técnico · 🚚 Traslado', 'As Técnico · 🎯 Score', 'As Técnico · 🧾 Auditoría', 'Maduración · una grilla',
  'Maduración · 💾 en una ficha de formulario', 'Biomol', 'Microbiología', 'Microbiología · Calidad', 'Microbiología · Patología', '🔧 Mantenimiento · ronda',
  '🔧 Mantenimiento · trabajo', 'Módulo · una ficha de hoy', 'Módulo · Desinfección', 'Módulo · una ficha de AYER', 'Lab Algas · hoy', 'Lab Algas · AYER'];
const MODULOS = () => [H.AST_MOD, H.MAD_MOD, H.BIO_MOD, H.MIC_MOD, H.MNT_MOD, H.LAB_MOD, H.CIO_MOD, 1];

beforeEach(() => {
  mapa.clear();
  H._invalidateLoadE();
  H.setMod(null);
  H.tecleado(false);
  H.setSyncUI('idle', 'Todo sincronizado');
});

describe('A14 · la cabecera cuenta lo pendiente de TODO el módulo', () => {
  it.each(NOMBRES)('🔴 %s', (nombre) => {
    const [mod, poner, dice] = CASOS()[nombre];
    H.setMod(mod);
    poner();
    H.updateSyncUI();
    expect(lbl()).toBe(dice);
    expect(punto()).toBe('sdot pend');
  });

  it('🔴 As Técnico suma sus cuatro listas', () => {
    H.setMod(H.AST_MOD);
    H._astSave([rec()]);
    H._trasSave([rec()]);
    lista(H.SCORE_REC_KEY);
    lista(H.AUD_REC_KEY);
    H.updateSyncUI();
    expect(lbl()).toBe('4 registro(s) pendiente(s)');
  });

  it('🔴 un módulo suma las fichas de hoy y las de días anteriores', () => {
    H.setMod(1);
    H.saveE(1, 'calidad', { x: '1' });
    fichaDe(1, 'plg', ayer());
    H.updateSyncUI();
    expect(lbl()).toBe('2 ficha(s) pendiente(s)');
  });

  it('una ficha de ayer ya ENVIADA no cuenta', () => {
    H.setMod(1);
    fichaDe(1, 'calidad', ayer(), true);
    H.updateSyncUI();
    expect(lbl()).toBe('Todo sincronizado');
  });

  it('sin módulo abierto no revienta', () => {
    H.setMod(null);
    H.updateSyncUI();
    expect(lbl()).toBe('Todo sincronizado');
  });
});

describe('A14 · «Todo sincronizado» lo decide lo pendiente, no quien lo pide', () => {
  it.each(NOMBRES)('🔴 tras un envío, con %s sin enviar, dice lo pendiente', (nombre) => {
    const [mod, poner, dice] = CASOS()[nombre];
    H.setMod(mod);
    poner();
    H.setSyncUI('idle', 'Todo sincronizado');
    expect(lbl()).toBe(dice);
    expect(punto()).toBe('sdot pend');
  });

  it('con nada pendiente sí lo dice, en cualquier módulo y sin módulo abierto', () => {
    for (const mod of MODULOS()) {
      H.setMod(mod);
      H.setSyncUI('idle', 'Todo sincronizado');
      expect(lbl(), 'módulo ' + mod).toBe('Todo sincronizado');
      expect(punto(), 'módulo ' + mod).toBe('sdot idle');
    }
    H.setMod(null);
    H.saveE(1, 'calidad', { x: '1' });
    H.setSyncUI('idle', 'Todo sincronizado');
    expect(lbl(), 'sin módulo abierto no hay de quién decirlo').toBe('Todo sincronizado');
  });

  it('🔴 sólo cuenta lo del módulo abierto', () => {
    H.saveMadList('salas', [rec()]);
    H.setMod(H.AST_MOD);
    H.setSyncUI('idle', 'Todo sincronizado');
    expect(lbl()).toBe('Todo sincronizado');
  });

  it('🔴 con cola, dice las dos cosas', () => {
    H.setMod(H.AST_MOD);
    lista(H.SCORE_REC_KEY);
    H._enqueueSync({ sheetName: 'X', headers: ['a'], rows: [['1']] }, 'r1', '', null);
    H.setSyncUI('idle', 'Todo sincronizado');
    expect(lbl()).toBe('1 registro(s) pendiente(s) · 1 en cola');
    almacen.removeItem(H.SCORE_REC_KEY);
    H.setSyncUI('idle', 'Todo sincronizado');
    expect(lbl(), 'sin pendientes, la cola sola').toBe('1 en cola');
  });

  it('los otros estados no cambian: quien avisa de otra cosa la sigue diciendo', () => {
    H.setMod(H.AST_MOD);
    lista(H.SCORE_REC_KEY);
    H.setSyncUI('idle', 'Sin datos');
    expect(lbl()).toBe('Sin datos');
    H.setSyncUI('ok', 'Sincronizado ✔');
    expect(lbl()).toBe('Sincronizado ✔');
    expect(punto()).toBe('sdot ok');
  });

  it('🔴 con el envío real: Score entregado y un traslado sin enviar, a los 3 s no dice «Todo sincronizado»', async () => {
    H.setMod(H.AST_MOD);
    H._trasSave([rec()]);
    almacen.setItem(H.SCORE_REC_KEY, JSON.stringify([{ id: 'SCE-1', ts: Date.now(), synced: false, data: { fecha: '2026-10-02', modulo: 'M03', corrida: '598', tanques: {} } }]));
    H.setPost(async () => true);
    await H.syncAllPendingScore();
    await new Promise((r) => { setTimeout(r, 3100); });
    expect(lbl()).toBe('1 registro(s) pendiente(s)');
  });
});

describe('A14 · la baldosa de As Técnico cuenta sus cuatro listas', () => {
  const baldosa = () => {
    document.getElementById('rgApp')?.classList.remove('on');
    H.buildGrid();
    return document.getElementById('mc13').className;
  };
  it.each(['As Técnico · Supervisión', 'As Técnico · 🚚 Traslado', 'As Técnico · 🎯 Score', 'As Técnico · 🧾 Auditoría'])('🔴 %s pendiente la enciende', (nombre) => {
    CASOS()[nombre][1]();
    expect(baldosa()).toContain('pend');
  });
  it('🔴 Score o Auditoría sólo enviados: enviado, no pendiente', () => {
    lista(H.SCORE_REC_KEY, true);
    expect(baldosa()).toContain('sync');
    expect(baldosa()).not.toContain('pend');
    mapa.clear();
    lista(H.AUD_REC_KEY, true);
    expect(baldosa()).toContain('sync');
    expect(baldosa()).not.toContain('pend');
  });
  it('sin nada, apagada', () => {
    expect(baldosa()).not.toMatch(/pend|sync/);
  });
});

describe('A14 · al cerrar la página se avisa de lo pendiente', () => {
  const avisa = () => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  };
  it.each(NOMBRES)('🔴 %s', (nombre) => {
    const [mod, poner] = CASOS()[nombre];
    H.setMod(mod);
    expect(avisa(), 'sin nada, no avisa').toBe(false);
    poner();
    expect(avisa()).toBe(true);
  });
  it('🔴 lo TECLEADO aún sin guardar avisa donde se vigila: Maduración, Biomol, As Técnico y los módulos', () => {
    H.tecleado(true);
    for (const mod of [H.MAD_MOD, H.BIO_MOD, H.AST_MOD, H.CIO_MOD, 1]) {
      H.setMod(mod);
      expect(avisa(), 'módulo ' + mod).toBe(true);
    }
  });
  it('🔴 Microbiología, Lab Algas y Mantenimiento no miran ninguna de esas marcas', () => {
    H.tecleado(true);
    for (const mod of [H.MIC_MOD, H.LAB_MOD, H.MNT_MOD]) {
      H.setMod(mod);
      expect(avisa(), 'módulo ' + mod).toBe(false);
    }
  });
  /* 2026-11-05 (auditoría) · encender las cuatro a la vez no prueba de quién es cada una: si Maduración mirara `_formDirty` en vez de
     `_madGridDirty`, la prueba de arriba seguía pasando. Una a una. */
  it.each([['mad', 'MAD_MOD'], ['bio', 'BIO_MOD'], ['ast', 'AST_MOD'], ['form', 1]])('🔴 la marca «%s» sólo vale en su módulo', (cual, suyo) => {
    const propio = typeof suyo === 'number' ? suyo : H[suyo];
    H.tecleado(false);
    H.marca(cual, true);
    try {
      for (const mod of [H.MAD_MOD, H.BIO_MOD, H.AST_MOD, 1]) {
        H.setMod(mod);
        expect(avisa(), 'módulo ' + mod).toBe(mod === propio);
      }
    } finally { H.tecleado(false); }
  });
  it('lo ya enviado no avisa', () => {
    H.setMod(H.AST_MOD);
    H._trasSave([rec(true)]);
    expect(avisa()).toBe(false);
    H.setMod(1);
    fichaDe(1, 'calidad', ayer(), true);
    expect(avisa()).toBe(false);
  });
  it('sin módulo abierto no avisa', () => {
    H.saveE(1, 'calidad', { x: '1' });
    H.setMod(null);
    expect(avisa()).toBe(false);
  });
});
