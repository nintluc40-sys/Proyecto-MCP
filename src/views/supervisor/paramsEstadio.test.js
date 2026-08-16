// Alineación entre lo que el ICL RESTA y lo que la pantalla puede EXPLICAR.
// `iclSeries` no filtra por estadío (correcto: las bandas ICL_BANDS se calibraron así),
// pero los tres consumidores de `v.stage` —alertas, heatmap morfológico y panel de
// parámetros— sí. Cuatro variables morfológicas estaban marcadas 'larv' aunque el
// laboratorio las registra en post-larva: bajaban el ICL sin que nada lo justificara.
// Medido sobre 550 filas reales en PL: No Viables 365 (66 %), Retraso 50, Hongos 25.
import { describe, it, expect } from 'vitest';
import { iclSeries, paramAlerts } from './params.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '585', Tanque: 'TQ1', ...o });

// Tanque en POST-LARVA con «No Viables» fuera de rango (umbral: < 10 %).
const filasPL = () => [
  L({ Fecha: '01/07/2026', 'Estadío': 'PL5', 'Población': '900000', '% Actividad': '90', 'No_Viables': '35' }),
  L({ Fecha: '02/07/2026', 'Estadío': 'PL6', 'Población': '880000', '% Actividad': '90', 'No_Viables': '40' }),
];

describe('variables morfológicas medidas en post-larva', () => {
  it('el ICL las resta (no filtra por estadío)', () => {
    const sinNvi = iclSeries([
      L({ Fecha: '01/07/2026', 'Estadío': 'PL5', 'Población': '900000', '% Actividad': '90' }),
    ]).values[0];
    const conNvi = iclSeries([filasPL()[0]]).values[0];
    expect(conNvi).toBeLessThan(sinNvi);          // resta
    expect(sinNvi - conNvi).toBeCloseTo(35, 6);   // exactamente su valor
  });

  it('y AHORA la alerta también las señala en post-larva', () => {
    const alerts = paramAlerts(filasPL(), 'postl');
    const nvi = alerts.find((a) => a.key === 'nvi');
    expect(nvi, 'No Viables debe alertar en post-larva').toBeTruthy();
    expect(nvi.label).toBe('No Viables');
  });

  it('Retraso y Hongos también se evalúan en post-larva', () => {
    const rows = [L({ Fecha: '01/07/2026', 'Estadío': 'PL5', 'Población': '900000', Retraso: '80', Hongos: '15' })];
    const keys = paramAlerts(rows, 'postl').map((a) => a.key);
    expect(keys).toContain('ret');
    expect(keys).toContain('hng');
  });

  it('siguen alertando en estadío larval (sin regresión)', () => {
    const rows = [L({ Fecha: '01/07/2026', 'Estadío': 'Z3', 'Población': '900000', 'No_Viables': '35' })];
    expect(paramAlerts(rows, 'larv').map((a) => a.key)).toContain('nvi');
  });

  it('sin dato NO inventan alerta, sea cual sea el estadío', () => {
    const rows = [L({ Fecha: '01/07/2026', 'Estadío': 'PL5', 'Población': '900000' })];
    const keys = paramAlerts(rows, 'postl').map((a) => a.key);
    expect(keys).not.toContain('nvi');
    expect(keys).not.toContain('ret');
    expect(keys).not.toContain('hng');
  });

  it('dentro de rango tampoco alertan', () => {
    const rows = [L({ Fecha: '01/07/2026', 'Estadío': 'PL5', 'Población': '900000', 'No_Viables': '2' })];
    expect(paramAlerts(rows, 'postl').map((a) => a.key)).not.toContain('nvi');
  });
});
