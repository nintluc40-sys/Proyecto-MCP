import { describe, it, expect, afterEach } from 'vitest';
import { store } from './store.js';
import { monthIndexOfCorrida, monthLabelAt, modCorStats, modCorDispatched } from './prodCalendar.js';

afterEach(() => { store.globalData = []; });

// MESES_PROD definido: Enero(544) … Junio(573). Auto-extensión +6 desde Junio.
describe('monthIndexOfCorrida (auto-extensión +6)', () => {
  it('mapea corridas dentro de los meses definidos', () => {
    expect(monthIndexOfCorrida(544)).toBe(0); // Enero
    expect(monthIndexOfCorrida(573)).toBe(5); // Junio
    expect(monthIndexOfCorrida(578)).toBe(5); // sigue Junio (578-573 < 6)
  });

  it('Julio (579+) ya NO cae en Junio sino en el mes siguiente', () => {
    expect(monthIndexOfCorrida(579)).toBe(6); // Julio (virtual)
    expect(monthIndexOfCorrida(584)).toBe(6); // sigue Julio
    expect(monthIndexOfCorrida(585)).toBe(7); // Agosto
  });

  it('corridas por debajo del primer mes → -1; no numérico → -1', () => {
    expect(monthIndexOfCorrida(500)).toBe(-1);
    expect(monthIndexOfCorrida(NaN)).toBe(-1);
  });
});

describe('monthLabelAt (etiquetas, incl. meses virtuales)', () => {
  it('meses definidos', () => {
    expect(monthLabelAt(0)).toBe('Enero');
    expect(monthLabelAt(5)).toBe('Junio');
  });
  it('meses virtuales continúan la secuencia y reinician a Enero', () => {
    expect(monthLabelAt(6)).toBe('Julio');
    expect(monthLabelAt(7)).toBe('Agosto');
    expect(monthLabelAt(11)).toBe('Diciembre');
    expect(monthLabelAt(12)).toBe('Enero'); // ciclo
  });
});

describe('modCorStats: cosecha honra el 0 (tanque vaciado/agrupado)', () => {
  it('última población = 0 → cosecha 0 y superv 0 (no el valor previo); siembra intacta', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', 'Población': '800', Fecha: '03/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', 'Población': '0', Fecha: '05/06/2026', Observaciones: 'Agrupado' },
    ];
    const s = modCorStats('M01', '573');
    expect(s.siembra).toBe(1000); // primera población real
    expect(s.cosecha).toBe(0);    // honra el 0, no arrastra 800
    expect(s.superv).toBe(0);     // 0/1000
    expect(s.nSie).toBe(1);       // un solo tanque con siembra
  });
  it('despachado = true solo si hay ≥1 fila con datos de la ficha de Despacho', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M03', Corrida: '575', Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M03', Corrida: '575', Tanque: 'TQ1', 'Población': '700', Fecha: '05/06/2026', 'Destino': 'Piscina 4', 'Biomasa': '12' },
    ];
    expect(modCorStats('M03', '575').despachado).toBe(true);
  });
  it('despachado = false si ninguna fila trae columnas de Despacho', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M04', Corrida: '576', Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M04', Corrida: '576', Tanque: 'TQ1', 'Población': '700', Fecha: '05/06/2026' },
    ];
    expect(modCorStats('M04', '576').despachado).toBe(false);
  });
  it('despachadoFull = false con despacho PARCIAL (no todos los tanques reales)', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M05', Corrida: '577', Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026', 'Destino': 'Piscina 4' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M05', Corrida: '577', Tanque: 'TQ2', 'Población': '1000', Fecha: '01/06/2026' }, // TQ2 sin despacho
    ];
    const s = modCorStats('M05', '577');
    expect(s.despachado).toBe(true);       // ≥1 fila con despacho
    expect(s.despachadoFull).toBe(false);  // pero no TODOS los tanques reales
    expect(modCorDispatched('M05', '577')).toBe(false);
  });
  it('despachadoFull = true: todos los tanques reales despachados (agrupado se excluye)', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '578', Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026', 'Destino': 'Piscina 4' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '578', Tanque: 'TQ2', 'Población': '0', Fecha: '01/06/2026', Observaciones: 'Agrupado' }, // fuera de despacho
    ];
    expect(modCorStats('M06', '578').despachadoFull).toBe(true);
    expect(modCorDispatched('M06', '578')).toBe(true);
  });
  it('despachadoFull ignora "Piscina" sola (no implica cosecha)', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M07', Corrida: '579', Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026', 'Piscina': 'P-9' },
    ];
    expect(modCorStats('M07', '579').despachado).toBe(false);
    expect(modCorStats('M07', '579').despachadoFull).toBe(false);
  });
  it('nSie cuenta solo tanques con siembra real (base de la densidad de siembra)', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '574', Tanque: 'TQ1', 'Población': '2800', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '574', Tanque: 'TQ2', 'Población': '1400', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '574', Tanque: 'TQ3', 'Población': '0', Fecha: '01/06/2026' },
    ];
    const s = modCorStats('M02', '574');
    expect(s.nSie).toBe(2);        // TQ3 nunca tuvo población real (>0)
    expect(s.siembra).toBe(4200);  // 2800 + 1400
    // densidad de siembra = (siembra/nSie)/28/1000 = (4200/2)/28/1000
    expect((s.siembra / s.nSie) / 28 / 1000).toBeCloseTo(0.075, 6);
  });
});
