// Auditoría de cierre · Módulo — «Sembrado» del cuadro de Siembras y «Siembra» de
// Producción Omarsa deben salir de la MISMA regla: primera población REAL (>0).
// Defectos hallados y MEDIDOS antes de corregirlos (N5 anotado con 0 y conteo real después):
//   · S-01 el cuadro daba «Sembrado 0» y superv. «—» donde el core daba 900.000 y 77,8 %.
//   · S-02 un tanque SIN ninguna población (p. ej. solo fila de despacho) ocupaba una fila
//     del cuadro y colaba su transferido al numerador del subtotal sin aportar denominador:
//     la supervivencia daba 130 % y solo el tope la disimulaba como 100 %.
//   · S-03 (introducido al corregir S-01 y detectado por esta misma sonda) al mover el ancla
//     de siembra a una fila posterior, las lecturas ANTERIORES seguían siendo candidatas a
//     «transferido» y el 0 previo se convertía en el transferido del tanque.
// El 0 en TRANSFERIDO es un dato real (la población cayó a cero) y debe conservarse: hay un
// test que lo fija para no pasarse de corrección.
// Verificadas por mutación. Ver `feedback_fixtures-que-no-prueban-nada`.
import { describe, it, expect, beforeEach } from 'vitest';
import { computeSiembras } from './siembras.js';
import { store } from '../../core/store.js';
import { modCorStats } from '../../core/prodCalendar.js';

const row = (fecha, tq, est, pob, extra = {}) => ({
  _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '579', Tanque: tq,
  Fecha: fecha, 'Estadío': est, ...(pob == null ? {} : { 'Población': String(pob) }), ...extra,
});

beforeEach(() => { store.globalData = []; });

describe('S-01 · el «Sembrado» del cuadro coincide con la «Siembra» del core', () => {
  it('un N5 anotado con 0 no es una siembra de cero: manda la primera lectura >0', () => {
    const rows = [
      row('01/07/2026', 'TQ1', 'N5', 0),       // aún no se había contado
      row('05/07/2026', 'TQ1', 'Z2', 900000),  // conteo real
      row('20/07/2026', 'TQ1', 'PL8', 700000),
    ];
    store.globalData = rows;
    const cuadro = computeSiembras(rows).siembras[0].tanks[0];
    const core = modCorStats('M06', '579');
    expect(cuadro.siembra).toBe(900000);
    expect(cuadro.siembra).toBe(core.siembra);          // las dos capas, una sola cifra
    expect(cuadro.superv).toBeCloseTo(core.superv, 6);  // 77,8 % en ambas
  });

  it('la agrupación sigue anclada a la fecha del N5, no a la del conteo', () => {
    const rows = [
      row('01/07/2026', 'TQ1', 'N5', 0),
      row('05/07/2026', 'TQ1', 'Z2', 900000),
      row('01/07/2026', 'TQ2', 'N5', 800000),
      row('06/07/2026', 'TQ2', 'Z2', 700000),
    ];
    const d = computeSiembras(rows);
    // Ambos sembraron el 01/07 ⇒ UNA sola siembra, aunque TQ1 se contara 4 días después.
    expect(d.nSiembras).toBe(1);
    expect(d.siembras[0].tanks.map((t) => t.tq)).toEqual(['TQ1', 'TQ2']);
  });
});

describe('S-02 · solo entran los tanques con siembra', () => {
  it('un tanque sin ninguna población queda fuera del cuadro', () => {
    const rows = [
      row('01/07/2026', 'TQ1', 'N5', 1000000),
      row('02/07/2026', 'TQ9', 'N5', null, { Destino: 'Piscina 4' }),
    ];
    const tqs = computeSiembras(rows).siembras.flatMap((s) => s.tanks).map((t) => t.tq);
    expect(tqs).toEqual(['TQ1']);
  });

  it('el subtotal no se infla: el denominador incluye a todo el que aporta numerador', () => {
    const rows = [
      row('01/07/2026', 'TQ1', 'N5', 0),
      row('20/07/2026', 'TQ1', 'PL8', 500000),   // su siembra REAL; sin lectura posterior
      row('01/07/2026', 'TQ2', 'N5', 1000000),
      row('20/07/2026', 'TQ2', 'PL8', 800000),
    ];
    const sub = computeSiembras(rows).siembras[0].subtotal;
    expect(sub.sembrado).toBe(1500000);   // 500 k (TQ1) + 1 M (TQ2)
    expect(sub.transferido).toBe(800000); // solo TQ2 transfirió
    expect(sub.superv).toBe(80);          // 800 k ÷ 1 M — TQ1 está en proceso
    expect(sub.superv).not.toBe(100);     // antes: 130 % disimulado por el tope
  });
});

describe('S-03 · el transferido es una lectura POSTERIOR a la siembra', () => {
  it('un 0 anterior al conteo real no puede ser el transferido', () => {
    const rows = [
      row('01/07/2026', 'TQ1', 'N5', 0),
      row('20/07/2026', 'TQ1', 'PL8', 500000),
    ];
    const t = computeSiembras(rows).siembras[0].tanks[0];
    expect(t.siembra).toBe(500000);
    expect(t.transferido).toBeNull(); // no hay lectura posterior ⇒ en proceso
    expect(t.enProceso).toBe(true);
    expect(t.superv).not.toBe(0);     // antes daba 0 % en un tanque sano
  });
});

describe('no pasarse de corrección · el 0 en TRANSFERIDO sí es real', () => {
  it('una población que cae a cero se conserva como transferido 0 y superv. 0 %', () => {
    const rows = [
      row('01/07/2026', 'TQ1', 'N5', 1000000),
      row('20/07/2026', 'TQ1', 'PL8', 0),
    ];
    const t = computeSiembras(rows).siembras[0].tanks[0];
    expect(t.siembra).toBe(1000000);
    expect(t.transferido).toBe(0);
    expect(t.superv).toBe(0);
    expect(t.enProceso).toBe(false);
  });
});
