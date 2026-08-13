// @vitest-environment happy-dom
/* ============================================================
   SUPERVISOR · Despacho — cableado del modal de descarga
   Cubre el pegamento con el DOM, que es donde la matriz ya probada puede llegar bien
   y el archivo salir mal: cascada mes→módulo, recuento en pantalla, botón inhabilitado
   cuando no hay nada, y la llamada real a SheetJS (stub) con su nombre de archivo.
   Usa el `bindModal` REAL del Supervisor, no un doble: parte del contrato es que el KPI
   abra el overlay y que Escape/backdrop lo cierren.
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { despachoExportModalHTML, bindDespachoExport } from './despachoExport.js';
import { bindModal } from './ui.js';

const R = (o) => ({
  'Módulo': o.mod, Corrida: o.cor, Tanque: o.tq, Fecha: o.fecha,
  'Población': o.pob === undefined ? '' : o.pob,
  'Densidad Cosechada': o.dens ?? '', Biomasa: o.bio ?? '',
  'Plg (manual)': o.plg ?? '', 'Cajas/Tinas': '', Destino: o.dest ?? '', Piscina: o.pisc ?? '',
});

// mes 5 (Junio) → corridas 573/574 · mes 6 (Julio) → corrida 579
const ROWS = [
  R({ mod: 'M01', cor: '573', tq: 'T1', fecha: '05/06/2026', pob: 800, dens: 12, bio: 3.5, plg: 60, dest: 'Piscina A', pisc: 'P-1' }),
  R({ mod: 'M02', cor: '574', tq: 'T1', fecha: '06/06/2026', pob: 400, bio: 1.1, dest: 'Piscina B' }),
  R({ mod: 'M09', cor: '579', tq: 'T1', fecha: '01/07/2026', pob: 300, dest: 'Piscina C' }),
];

function montar(rows, { mIdx = 5, mod = null } = {}) {
  document.body.innerHTML = '';
  document.body.classList.remove('modal-open');
  const root = document.createElement('div');
  // El KPI real lleva estos atributos (ver kpiGlass(..., 'data-despx-open ...')).
  root.innerHTML = `<div class="sv-kpi-glass" data-despx-open role="button" tabindex="0">3</div>`
    + despachoExportModalHTML(rows, { mIdx });
  document.body.appendChild(root);
  const toasts = [];
  const ctrl = bindDespachoExport(root, rows, {
    mIdx, mod, bindModal, toast: (msg, kind) => toasts.push({ msg, kind }),
  });
  const q = (sel) => root.querySelector(sel);
  return {
    root, ctrl, toasts, q,
    overlay: q('#svDespExportModal'),
    kpi: q('[data-despx-open]'),
    mes: q('[data-despx-month]'),
    mod: q('[data-despx-mod]'),
    info: q('[data-despx-info]'),
    btn: q('[data-despx-download]'),
  };
}

describe('supervisor · despacho · cableado del modal', () => {
  beforeEach(() => { delete window.XLSX; });

  it('el KPI abre el overlay', () => {
    const t = montar(ROWS);
    expect(t.overlay.classList.contains('sv-open')).toBe(false);
    t.kpi.click();
    expect(t.overlay.classList.contains('sv-open')).toBe(true);
    expect(document.body.classList.contains('modal-open')).toBe(true);
  });

  it('el selector de mes ofrece sólo los meses con datos, con el activo preseleccionado', () => {
    const t = montar(ROWS, { mIdx: 5 });
    expect([...t.mes.options].map((o) => o.value)).toEqual(['5', '6']);
    expect(t.mes.value).toBe('5');
    expect([...t.mes.options].map((o) => o.textContent)).toEqual(['Junio', 'Julio']);
  });

  it('los módulos son los del mes elegido, y cambiar de mes los recalcula', () => {
    const t = montar(ROWS, { mIdx: 5 });
    expect([...t.mod.options].map((o) => o.value)).toEqual(['', 'M01', 'M02']);
    expect(t.mod.options[0].textContent).toContain('Todos los módulos (2)');

    t.mes.value = '6';
    t.mes.dispatchEvent(new Event('change'));
    expect([...t.mod.options].map((o) => o.value)).toEqual(['', 'M09']);
    expect(t.mod.options[0].textContent).toContain('Todos los módulos (1)');
  });

  it('al cambiar de mes, un módulo que ya no existe cae en «Todos» y no en blanco', () => {
    // ⚠ Aquí NO basta comprobar `value`: asignar a un <select> un valor que no está entre
    // sus opciones deja `value` en '' por sí solo, así que la aserción pasaba igual sin la
    // guarda de fillModules. Lo que la guarda cambia es `selectedIndex`: sin ella queda
    // en -1 y el desplegable se PINTA VACÍO, aunque `value` mienta diciendo ''.
    const t = montar(ROWS, { mIdx: 5 });
    t.mod.value = 'M01';
    t.mod.dispatchEvent(new Event('change'));
    t.mes.value = '6';                       // M01 no está en el mes 6
    t.mes.dispatchEvent(new Event('change'));
    expect(t.mod.selectedIndex).toBe(0);     // la opción "Todos" queda REALMENTE elegida
    expect(t.mod.options[t.mod.selectedIndex].textContent).toContain('Todos los módulos');
    expect(t.mod.value).toBe('');
  });

  it('el recuento en pantalla sigue al filtro', () => {
    const t = montar(ROWS, { mIdx: 5 });
    expect(t.info.textContent).toContain('2 fila(s)');
    expect(t.info.textContent).toContain('todos los módulos');
    t.mod.value = 'M01';
    t.mod.dispatchEvent(new Event('change'));
    expect(t.info.textContent).toContain('1 fila(s)');
    expect(t.info.textContent).toContain('M01');
  });

  it('sin registros el botón queda inhabilitado y lo dice', () => {
    const t = montar([], { mIdx: 5 });
    expect(t.btn.disabled).toBe(true);
    expect(t.info.textContent).toContain('Sin registros');
  });

  it('descarga: llama a SheetJS con la matriz y el nombre esperados', () => {
    const t = montar(ROWS, { mIdx: 5 });
    const writeFile = vi.fn();
    const appended = [];
    window.XLSX = {
      utils: {
        book_new: () => ({}),
        aoa_to_sheet: (aoa) => ({ aoa }),
        book_append_sheet: (wb, ws, name) => appended.push({ ws, name }),
      },
      writeFile,
    };
    t.mod.value = 'M01';
    t.mod.dispatchEvent(new Event('change'));
    t.btn.click();

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][1]).toBe('Despacho_Junio_M01.xlsx');
    expect(appended[0].name).toBe('Despacho');
    const aoa = appended[0].ws.aoa;
    expect(aoa[0][0]).toBe('Módulo');
    expect(aoa[0][8]).toBe('Cantidad Cosechada');
    expect(aoa).toHaveLength(2);                       // cabecera + 1 despacho
    expect(aoa[1].slice(0, 4)).toEqual(['M01', '573', '05/06/2026', 'T1']);
    expect(t.toasts.some((x) => x.kind === 'ok')).toBe(true);
  });

  it('«Todos los módulos» exporta el mes entero y lo marca en el nombre', () => {
    const t = montar(ROWS, { mIdx: 5 });
    const writeFile = vi.fn();
    window.XLSX = {
      utils: { book_new: () => ({}), aoa_to_sheet: (aoa) => ({ aoa }), book_append_sheet: () => {} },
      writeFile,
    };
    t.btn.click();
    expect(writeFile.mock.calls[0][1]).toBe('Despacho_Junio_TODOS.xlsx');
  });

  it('sin SheetJS avisa en vez de romperse', () => {
    const t = montar(ROWS, { mIdx: 5 });
    expect(() => t.btn.click()).not.toThrow();
    expect(t.toasts.some((x) => x.kind === 'err' && /SheetJS/.test(x.msg))).toBe(true);
  });
});
