import { describe, it, expect, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { presentMonths } from '../../core/prodCalendar.js';
import { prodTableHTML } from './prodOmarsa.js';

afterEach(() => { store.globalData = []; });

// Fila de Larvicultura ("Datos Larvicultura"). `desp` añade columnas de la ficha
// de Despacho (Destino/Biomasa) → marca el módulo+corrida como despachado.
const row = (mod, cor, tq, pob, fecha, desp = false) => ({
  _SheetOrigin: 'Larvicultura', 'Módulo': mod, Corrida: cor, Tanque: tq,
  'Población': String(pob), Fecha: fecha,
  ...(desp ? { 'Destino': 'Piscina 4', 'Biomasa': '10' } : {}),
});

describe('prodTableHTML · fila "Subtotal actual" (despachados)', () => {
  it('aparece entre la corrida despachada y la pendiente, sin igualar al Total', () => {
    // Corrida 579 (M06) despachada · Corrida 580 (M08) pendiente. Ambas = mes Julio.
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026', true),
      row('M08', '580', 'TQ1', 2000, '01/07/2026'),
      row('M08', '580', 'TQ1', 1500, '10/07/2026'),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).toContain('Subtotal actual');
    // Ubicación: tras M06 (despachado) y antes de M08 (pendiente).
    expect(html.indexOf('M06')).toBeLessThan(html.indexOf('Subtotal actual'));
    expect(html.indexOf('Subtotal actual')).toBeLessThan(html.indexOf('M08'));
  });

  it('NO aparece cuando TODAS las corridas están despachadas (sería igual al Total)', () => {
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026', true),
      row('M08', '580', 'TQ1', 2000, '01/07/2026'),
      row('M08', '580', 'TQ1', 1500, '10/07/2026', true),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).not.toContain('Subtotal actual');
  });

  it('NO aparece si el subtotal IGUALA numéricamente al Total aunque queden corridas pendientes (sin siembra/cosecha)', () => {
    // 579 (M06) despachada con datos · 580 (M08) pendiente PERO sin población (no aporta
    // siembra ni cosecha) → subtotal == total → la franja sería redundante y desaparece.
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026', true),
      row('M08', '580', 'TQ1', 0, '01/07/2026'),
      row('M08', '580', 'TQ1', 0, '10/07/2026'),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).not.toContain('Subtotal actual');
  });

  it('aparece aunque la corrida despachada NO sea el prefijo inicial (suma solo las despachadas)', () => {
    // 579 (M06) PENDIENTE · 580 (M08) DESPACHADA → el subtotal debe aparecer igual,
    // ubicado tras M08 (la última despachada), no ausente por no ser prefijo contiguo.
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026'),
      row('M08', '580', 'TQ1', 2000, '01/07/2026'),
      row('M08', '580', 'TQ1', 1500, '10/07/2026', true),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).toContain('Subtotal actual');
    expect(html.indexOf('M08')).toBeLessThan(html.indexOf('Subtotal actual'));
  });

  it('despacho PARCIAL de una corrida (no todos los tanques) NO la cuenta como despachada', () => {
    // 579 M06 con 2 tanques, solo TQ1 despachado → corrida NO despachada → sin subtotal.
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026', true),
      row('M06', '579', 'TQ2', 2000, '01/07/2026'),
      row('M06', '579', 'TQ2', 1500, '10/07/2026'),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).not.toContain('Subtotal actual');
  });

  it('NO aparece cuando NINGUNA corrida está despachada', () => {
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026'),
      row('M08', '580', 'TQ1', 2000, '01/07/2026'),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).not.toContain('Subtotal actual');
  });
});
