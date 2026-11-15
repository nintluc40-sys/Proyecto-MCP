// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TRAER UN BORRADOR O UN ENVÍO DEL 📜 SIN LO VIEJO QUE NO SE TECLEÓ (punto 7 de la pauta del 2026-11-12)

   Un borrador y la copia para ✏️ Editar son el HTML del panel tal como estaba. Al traerlos (madBorrTraerDelDia, madBorrFechaChange,
   madHistEditar) volvían como eran al guardarse: el cuadro ℹ️ de ayuda (el texto nuevo del de Inf. Supervisor no salía), la lista 💾
   y el registro de envíos, el veredicto 🔍 y, en Desoves, los totales y la lista de pendientes. Y al cambiar de día, una corrección
   (fecha de SÓLO LECTURA, la llave de lo que se corrige) recibía la fecha elegida: se habría guardado como fila nueva de otro día.
   Decisión del usuario sobre el 🔍 viejo: «Quitarlo al abrir».

   Cada caso «estropea» el panel antes de guardarlo (texto viejo donde no se teclea) y comprueba que al traerlo vuelve lo tecleado
   y NO lo viejo. Motor REAL sobre el shell real. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const RENDER = { mortdes: 'renderMadMortDesove', tratamientos: 'renderMadTratamientos', fin: 'renderMadFinCiclo', desoves: 'renderMadDesoves' };
const EXPORTAR = ['MAD_BORR_FICHAS', 'madBorrGuardar', 'madBorrTraerDelDia', 'madBorrFechaChange', 'madHistEditar', 'MAD_HIST_KEY',
  'MAD_HIST_PANEL_PRE', 'selTab', 'today', 'MAD_MOD', ...Object.values(RENDER)];
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
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast(() => {});
});

beforeEach(() => {
  globalThis.localStorage.clear();
  window.confirm = () => true;
  globalThis.confirm = window.confirm;
});

const corre = (iso, dias) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const panel = (f) => document.getElementById(H.MAD_BORR_FICHAS[f].panel);
const campoFecha = (f) => document.getElementById(H.MAD_BORR_FICHAS[f].fecha);
const informe = (f) => document.getElementById(H.MAD_BORR_FICHAS[f].fecha.replace(/-fecha$/, '-report'));
const lista = (f) => document.getElementById(H.MAD_BORR_FICHAS[f].fecha.replace(/-fecha$/, '-loc'));
/** El texto del cuadro ℹ️ de ayuda (su segundo <span>). */
const ayuda = (f) => { const s = [...panel(f).querySelectorAll('.fc-b > div > span:first-child')].find((x) => x.textContent.trim() === 'ℹ️'); return s ? s.parentElement : null; };
/** Monta la ficha de cero, como al entrar en su pestaña. */
const montar = (f) => { panel(f).innerHTML = ''; H.setVista(H.MAD_MOD, f); H[RENDER[f]](); };
/** Lo que el panel trae y NO se teclea, con texto viejo: la ayuda, el veredicto 🔍 y la lista 💾. */
const estropear = (f) => {
  ayuda(f).lastElementChild.textContent = 'AYUDA VIEJA';
  informe(f).innerHTML = '<div>VEREDICTO VIEJO: sin errores</div>';
  lista(f).innerHTML = '<div>LISTA VIEJA (3)</div>';
};
const sinLoViejo = (f) => {
  expect(ayuda(f), 'sin cuadro de ayuda').toBeTruthy();
  expect(ayuda(f).textContent, 'volvió la ayuda vieja').not.toContain('AYUDA VIEJA');
  expect(informe(f).textContent, 'volvió el veredicto 🔍 viejo').toBe('');
  expect(lista(f).textContent, 'volvió la lista 💾 vieja').not.toContain('LISTA VIEJA');
};

describe('al traer el borrador del día (al entrar en la ficha)', () => {
  it('🔴 Inf. Supervisor: vuelve lo tecleado, con la ayuda de ahora, sin el 🔍 ni la lista 💾 de entonces', () => {
    montar('mortdes');
    const ahora = ayuda('mortdes').textContent;
    panel('mortdes').querySelector('.mm-lote').value = 'AB';
    estropear('mortdes');
    expect(H.madBorrGuardar('mortdes', H.today())).not.toBe(false);
    montar('mortdes');
    H.madBorrTraerDelDia('mortdes');
    expect(panel('mortdes').querySelector('.mm-lote').value, 'no volvió lo tecleado (control)').toBe('AB');
    sinLoViejo('mortdes');
    expect(ayuda('mortdes').textContent).toBe(ahora);
  });

  it('🔴 Desoves: los totales y la lista de pendientes se repintan', () => {
    montar('desoves');
    document.getElementById('md-pend-tot').innerHTML = 'TOTAL VIEJO';
    document.getElementById('md-pend').innerHTML = 'PENDIENTES VIEJOS';
    expect(H.madBorrGuardar('desoves', H.today())).not.toBe(false);
    montar('desoves');
    H.madBorrTraerDelDia('desoves');
    expect(document.getElementById('md-pend-tot').textContent).not.toContain('TOTAL VIEJO');
    expect(document.getElementById('md-pend').textContent).not.toContain('PENDIENTES VIEJOS');
  });
});

describe('al cambiar de fecha a un día con borrador', () => {
  it('🔴 Tratamientos: el día elegido vuelve sin lo viejo', () => {
    const AYER = corre(H.today(), -1);
    montar('tratamientos');
    estropear('tratamientos');
    expect(H.madBorrGuardar('tratamientos', AYER)).not.toBe(false);
    montar('tratamientos');
    campoFecha('tratamientos').value = AYER;
    H.madBorrFechaChange('tratamientos');
    expect(campoFecha('tratamientos').value, 'una ficha normal toma el día elegido (control)').toBe(AYER);
    sinLoViejo('tratamientos');
  });

  it('🔴 una corrección (fecha de SÓLO LECTURA) conserva SU fecha: no toma la del día elegido', () => {
    const AYER = corre(H.today(), -1), LLAVE = corre(H.today(), -9);
    montar('fin');
    const f = campoFecha('fin');
    f.value = LLAVE; f.setAttribute('value', LLAVE); f.readOnly = true; f.setAttribute('readonly', '');
    expect(H.madBorrGuardar('fin', AYER)).not.toBe(false);   // la corrección se tecleó el día de AYER
    montar('fin');
    campoFecha('fin').value = AYER;
    H.madBorrFechaChange('fin');
    expect(campoFecha('fin').hasAttribute('readonly'), 'el caso: es la corrección').toBe(true);
    expect(campoFecha('fin').value, 'la corrección pasó a ser de otro día').toBe(LLAVE);
  });
});

describe('al abrir un envío del 📜 Historial con ✏️ Editar', () => {
  it('🔴 Fin de Ciclo: su copia vuelve sin lo viejo, con su fecha fija', () => {
    montar('fin');
    estropear('fin');
    const copia = panel('fin').innerHTML;
    const FECHA = corre(H.today(), -5);
    localStorage.setItem(H.MAD_HIST_KEY, JSON.stringify([{ id: 'h1', ficha: 'fin', envio: 'e1', ts: Date.now() - 1000, fecha: FECHA, filas: 1, panel: true,
      payload: { sheetName: 'Maduración Fin', headers: ['ID'], rows: [['r1']] } }]));
    localStorage.setItem(H.MAD_HIST_PANEL_PRE + 'h1', copia);
    montar('fin');
    H.madHistEditar('h1');
    expect(campoFecha('fin').value, 'no se abrió la copia (control)').toBe(FECHA);
    sinLoViejo('fin');
  });
});
