// @vitest-environment happy-dom
// Regresión de los defectos hallados en la auditoría de la vista Visitante:
//   · V-01 el deslizador de mes re-renderiza al SOLTAR, no en cada movimiento.
//   · V-02 las hojas de laboratorio se reconocen con los predicados canónicos del sistema.
//   · V-04 el detalle es un diálogo accesible (role, foco, trampa de Tab, retorno de foco).
// Y de la auditoría de verificación posterior:
//   · A-03 la tarjeta de Cobertura no inventa un 100 % cuando no hay módulos en producción.
//   · A-04 las tarjetas de resumen se dibujan por clase, no con la caja entera inline.
// Todas estas pruebas están verificadas POR MUTACIÓN: con el defecto reintroducido en el
// código real, cada una se pone en rojo. Ver `feedback_fixtures-que-no-prueban-nada`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { visitanteView } from './index.js';
import { isMicroRow } from '../microbiologia/data.js';
import { isCalAguaRow } from '../microbiologia/calagua.data.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

// Tres meses internos con datos (544=Enero, 549=Febrero, 555=Marzo).
function prod() {
  const rows = [];
  [544, 549, 555].forEach((c, i) => {
    rows.push(L({ 'Módulo': 'M01', Corrida: String(c), Tanque: 'TQ1', Fecha: `0${i + 1}/06/2026`, 'Estadío': 'N5', 'Población': '1000000' }));
    rows.push(L({ 'Módulo': 'M01', Corrida: String(c), Tanque: 'TQ1', Fecha: `1${i + 1}/06/2026`, 'Estadío': 'PL8', 'Población': '800000' }));
  });
  return rows;
}

let root;
beforeEach(() => {
  store.globalData = prod();
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); });

describe('V-01 · el deslizador de mes sobrevive al arrastre', () => {
  it('un movimiento («input») NO re-renderiza: el nodo arrastrado sigue en el DOM', () => {
    visitanteView(root);
    const sl = root.querySelector('[data-vtslider]');
    expect(sl).toBeTruthy();
    sl.value = '0';
    fire(sl, 'input');
    // Antes `paint()` corría aquí y arrancaba el propio deslizador del documento, así que
    // el arrastre se cortaba y cada agarre avanzaba un único paso.
    expect(sl.isConnected).toBe(true);
    expect(root.querySelector('[data-vtslider]')).toBe(sl);
  });

  it('durante el arrastre el rótulo del mes SÍ sigue al deslizador', () => {
    visitanteView(root);
    const sl = root.querySelector('[data-vtslider]');
    const antes = root.querySelector('[data-vtmonthlbl]').textContent;
    sl.value = '0';
    fire(sl, 'input');
    const durante = root.querySelector('[data-vtmonthlbl]').textContent;
    expect(durante).not.toBe(antes);
    // Y el recuento de corridas se blanquea en vez de mentir con el del mes anterior.
    expect(root.querySelector('[data-vtcorrlbl]').textContent).toBe('');
  });

  it('al soltar («change») se repinta el panel completo en el mes elegido', () => {
    visitanteView(root);
    const sl = root.querySelector('[data-vtslider]');
    sl.value = '0';
    fire(sl, 'input');
    fire(sl, 'change');
    const nuevo = root.querySelector('[data-vtslider]');
    expect(nuevo).not.toBe(sl);          // hubo repintado
    expect(nuevo.value).toBe('0');
    expect(root.querySelector('[data-vtcorrlbl]').textContent).toContain('corrida');
  });

  it('las flechas ◀ ▶ siguen navegando', () => {
    visitanteView(root);
    const lbl = () => root.querySelector('[data-vtmonthlbl]').textContent;
    // `vtState` recuerda el mes ENTRE MONTAJES (es intencional), así que la posición de
    // partida depende de lo que hicieran las pruebas anteriores: se fija explícitamente
    // en el mes del medio para que ambas flechas estén habilitadas.
    const sl = root.querySelector('[data-vtslider]');
    sl.value = '1';
    fire(sl, 'change');
    const medio = lbl();

    click(root.querySelector('[data-vtprev]'));
    const previo = lbl();
    expect(previo).not.toBe(medio);

    click(root.querySelector('[data-vtnext]'));
    expect(lbl()).toBe(medio);
  });
});

describe('V-02 · las hojas de laboratorio usan el criterio del sistema', () => {
  // Grafías sin tilde / en minúscula. OJO con lo que esto prueba y lo que NO:
  // `classifyOrigin` (core/sheets.js:41) normaliza el nombre de pestaña a 'Microbiología' /
  // 'Calidad de Agua' ANTES de sellar la fila, y es el único productor de `_SheetOrigin`
  // (store.globalData solo se asigna en sheets.js:304). O sea que estos valores NO se dan
  // hoy en producción y esto no reproduce un fallo vivo: fija que el panel dependa del
  // predicado canónico y no de una cadena literal propia, que es lo que podría
  // desincronizarse de la vista Microbiología si mañana cambia la cadena canónica.
  const MIC = { _SheetOrigin: 'Microbiologia', Fecha: '10/06/2026', 'Módulo': 'M01', Corrida: '544' };
  const CAL = { _SheetOrigin: 'Calidad de agua', Fecha: '10/06/2026', 'Módulo': 'M01', Corrida: '544' };
  // Sitúa la vista en el mes de la corrida 544 (el primero) con las filas de lab indicadas.
  const enElMesDe544 = (...labs) => {
    store.globalData = [...prod(), ...labs];
    visitanteView(root);
    const sl = root.querySelector('[data-vtslider]');
    if (sl) { sl.value = '0'; fire(sl, 'change'); }
  };

  it('los predicados canónicos reconocen esas grafías', () => {
    expect([MIC, CAL].filter(isMicroRow)).toHaveLength(1);
    expect([MIC, CAL].filter(isCalAguaRow)).toHaveLength(1);
  });

  // UNA PRUEBA POR HOJA. Con las dos filas juntas el guardián no discriminaba: verificado
  // por mutación, volver UNA sola de las dos líneas a la cadena exacta dejaba los 24 tests
  // en verde, porque `labSummaryBlock` pinta la sección si hay filas de CUALQUIERA de las
  // dos y la prueba solo miraba el título del bloque. Aisladas, cada línea tiene su testigo.
  it('con SOLO una fila de microbiología la sección aparece y la cuenta', () => {
    enElMesDe544(MIC);
    expect(root.textContent).toContain('Laboratorio de agua y sanidad');
    const card = root.querySelector('[data-sum="labMicro"]');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('1 muestra(s)');
  });

  it('con SOLO una fila de calidad de agua la sección aparece y la cuenta', () => {
    enElMesDe544(CAL);
    expect(root.textContent).toContain('Laboratorio de agua y sanidad');
    const card = root.querySelector('[data-sum="labAgua"]');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('1 muestra(s)');
  });

  it('sin ninguna fila de laboratorio la sección sigue sin pintarse', () => {
    store.globalData = prod();
    visitanteView(root);
    expect(root.textContent).not.toContain('Laboratorio de agua y sanidad');
  });
});

describe('A-03 · la tarjeta de Cobertura no inventa un 100 %', () => {
  // Producción SOLO en "CIO": `modNum` no le saca dígitos, así que el conjunto de módulos
  // en producción queda vacío. Antes la tarjeta caía a contar los módulos REVISADOS como si
  // fueran el total ("2 de 2", barra llena) mientras su propio detalle decía justo lo
  // contrario. Los dos deben decir lo mismo.
  const soloCIO = () => [
    { _SheetOrigin: 'Larvicultura', 'Módulo': 'CIO', Corrida: '544', Tanque: 'TQ1', Fecha: '01/06/2026', 'Población': '1000' },
    { _SheetOrigin: 'Larvicultura', 'Módulo': 'CIO', Corrida: '544', Tanque: 'TQ1', Fecha: '10/06/2026', 'Población': '800' },
    { _SheetOrigin: 'Registro_Supervision', 'Módulo': 'Módulo 1', Corrida: '544', Fecha: '05/06/2026', Observaciones: 'Continuar' },
    { _SheetOrigin: 'Registro_Supervision', 'Módulo': 'Módulo 2', Corrida: '544', Fecha: '05/06/2026', Observaciones: 'Continuar' },
  ];

  it('sin módulos en producción lo declara en vez de mostrar cobertura total', () => {
    store.globalData = soloCIO();
    visitanteView(root);
    const card = root.querySelector('[data-sum="cobertura"]');
    expect(card.textContent).toContain('Sin módulos en producción');
    expect(card.textContent).not.toContain('2 de 2');
    // Y no queda ninguna barra de progreso llena contradiciendo al texto.
    expect(card.querySelector('div[style*="width:100%"]')).toBeNull();
  });

  it('la tarjeta y el detalle que ella abre dicen lo mismo', () => {
    store.globalData = soloCIO();
    visitanteView(root);
    click(root.querySelector('[data-sum="cobertura"]'));
    expect(document.getElementById('vtSumBody').textContent).toContain('Sin módulos en producción');
  });

  it('con módulos numerados la cuenta sigue siendo la de siempre', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '544', Tanque: 'TQ1', Fecha: '01/06/2026', 'Población': '1000' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '544', Tanque: 'TQ1', Fecha: '10/06/2026', 'Población': '800' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '544', Tanque: 'TQ1', Fecha: '01/06/2026', 'Población': '1000' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '544', Tanque: 'TQ1', Fecha: '10/06/2026', 'Población': '800' },
      { _SheetOrigin: 'Registro_Supervision', 'Módulo': 'Módulo 1', Corrida: '544', Fecha: '05/06/2026', Observaciones: 'Continuar' },
    ];
    visitanteView(root);
    const card = root.querySelector('[data-sum="cobertura"]');
    expect(card.textContent).toContain('1 de 2');
    expect(card.textContent).not.toContain('Sin módulos en producción');
  });
});

describe('A-04 · la clase de las tarjetas de resumen ya tiene regla propia', () => {
  it('la caja no se dibuja con estilos inline y el acento sí sigue inline', () => {
    // Las DOS filas de laboratorio a propósito: con una sola, romper ese predicado hacía
    // caer también esta prueba (la sección desaparecía) y ensuciaba la atribución del fallo.
    store.globalData = [
      ...prod(),
      { _SheetOrigin: 'Microbiologia', Fecha: '10/06/2026', 'Módulo': 'M01', Corrida: '544' },
      { _SheetOrigin: 'Calidad de agua', Fecha: '10/06/2026', 'Módulo': 'M01', Corrida: '544' },
    ];
    visitanteView(root);
    const sl = root.querySelector('[data-vtslider]');
    if (sl) { sl.value = '0'; fire(sl, 'change'); }
    // Tarjeta sin acento (Resumen del mes): sin atributo style, todo por clase.
    const plana = root.querySelector('[data-sum="superv"]');
    expect(plana.classList.contains('vt-sum-card')).toBe(true);
    expect(plana.getAttribute('style')).toBeNull();
    // Tarjeta con acento (Laboratorio): conserva SOLO el borde superior inline.
    const conAcento = root.querySelector('[data-sum="labMicro"]');
    expect(conAcento.getAttribute('style')).toBe('border-top:3px solid #00838f');
  });
});

describe('V-04 · el detalle es un diálogo accesible', () => {
  const abrir = () => {
    visitanteView(root);
    const card = root.querySelector('[data-sum="superv"]');
    click(card);
    return { card, modal: root.querySelector('#vtSumModal'), dlg: root.querySelector('#vtSumCard') };
  };

  it('se anuncia como diálogo y está rotulado por su título', () => {
    const { dlg } = abrir();
    expect(dlg.getAttribute('role')).toBe('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.getAttribute('aria-labelledby')).toBe('vtSumTitle');
    expect(root.querySelector('#vtSumTitle').textContent).toBeTruthy();
  });

  it('el foco entra en el diálogo al abrir', () => {
    const { dlg } = abrir();
    expect(dlg.contains(document.activeElement)).toBe(true);
  });

  it('Tab no se escapa del diálogo: desde el último vuelve al primero', () => {
    const { dlg } = abrir();
    const foco = [...dlg.querySelectorAll('button')];
    expect(foco.length).toBeGreaterThan(0);
    foco[foco.length - 1].focus();
    const ev = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dlg.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(foco[0]);
  });

  it('al cerrar, el foco vuelve a la tarjeta que lo abrió', () => {
    const { card } = abrir();
    click(root.querySelector('#vtSumClose'));
    expect(document.activeElement).toBe(card);
  });

  it('Escape cierra y también devuelve el foco', () => {
    const { card, modal } = abrir();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.style.display).toBe('none');
    expect(document.activeElement).toBe(card);
  });
});
