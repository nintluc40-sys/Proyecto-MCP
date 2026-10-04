/* ============================================================
   PLANTA · estado de cada módulo y tanque (tanda 2): las reglas de la Vista Ejecutiva, en la maqueta
   Datos FICTICIOS (corridas 880–905; ningún dato real): un módulo en cultivo con un tanque de cada
   estado, uno con la corrida despachada entera, uno en desinfección y uno sin datos.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { store } from '../../core/store.js';
import { estadoPlanta } from './estado.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const CT = (o) => ({ _SheetOrigin: 'Control_Tanque M07', ...o });
const larv = (mod, cor, tq, fecha, pob, est, extra = {}) => L({ Fecha: fecha, Corrida: cor, 'Módulo': mod, Tanque: tq, 'Población': pob, 'Estadío': est, ...extra });

let E;
beforeAll(() => {
  const filas = [
    // M07 · corrida vieja (880) que NO debe contar, y la actual (900)
    larv('M07', '880', 'TQ 9', '01/06/2026', 1000, 'PL12'),
    larv('M07', '900', 'TQ 1', '01/09/2026', 100000, 'PL6'), larv('M07', '900', 'TQ 1', '05/09/2026', 90000, 'PL8'),
    larv('M07', '900', 'TQ 2', '01/09/2026', 100000, 'PL6'), larv('M07', '900', 'TQ 2', '05/09/2026', 95000, 'PL8'),
    larv('M07', '900', 'TQ 3', '01/09/2026', 100000, 'PL6'), larv('M07', '900', 'TQ 3', '05/09/2026', 0, 'PL8', { Observaciones: 'Agrupado con TQ 1' }),
    larv('M07', '900', 'TQ 4', '01/09/2026', 100000, 'PL6'), larv('M07', '900', 'TQ 4', '05/09/2026', 80000, 'PL12', { Destino: 'Piscina 1' }),
    CT({ Fecha: '05/09/2026', Corrida: '900', 'Módulo': 'M07', Tanque: 'TQ 1', OD: 5.6, Temperatura: 32 }),
    CT({ Fecha: '05/09/2026', Corrida: '900', 'Módulo': 'M07', Tanque: 'TQ 2', OD: 2.1, Temperatura: 32 }),
    // M09 · corrida 890 despachada en sus 2 tanques reales
    larv('M09', '890', 'TQ 1', '01/09/2026', 1000, 'PL12', { Destino: 'Piscina 2' }),
    larv('M09', '890', 'TQ 2', '01/09/2026', 1000, 'PL12', { Biomasa: '10' }),
    // M03 · desinfección de la corrida 905 sin siembra todavía
    { _SheetOrigin: 'Registro_Desinfección', 'Tipo de Registro': 'Desinfección de módulo larvicultura', 'Módulo': 'M03', Corrida: '905', Fecha: '03/10/2026' },
    // CIO no está en el plano: no debe colarse en ningún módulo
    larv('CIO', '900', 'TQ 1', '05/09/2026', 500, 'Z2'),
  ];
  store.globalData = filas;
  E = estadoPlanta();
});

describe('estado · módulo en cultivo (M7)', () => {
  it('usa la corrida más alta del módulo y su estadío más avanzado, con la etapa del Supervisor', () => {
    const m = E.modulos.M7;
    expect(m.estado).toBe('cultivo');
    expect(m.corrida).toBe('900');
    expect(m.estadio).toBe('PL12');
    expect(m.etapa.key).toBe('cosecha');
    expect(m.despachando).toBe(true);
  });

  it('cada tanque toma su estado: cultivo con etapa, alerta como marca, agrupado, despachado y vacío', () => {
    const t = E.modulos.M7.tanques;
    expect(t[1]).toMatchObject({ estado: 'cultivo', nombre: 'TQ 1', alerta: false });
    expect(t[1].etapa.key).toBe('crecimiento');                       // PL8 → Crecimiento
    expect(t[2]).toMatchObject({ estado: 'cultivo', alerta: true, motivos: ['OD'] });
    expect(t[2].etapa.key).toBe('crecimiento');                       // la alerta NO cambia su etapa
    expect(t[3].estado).toBe('agrupado');
    expect(t[4].estado).toBe('despachado');
    expect(t[9].estado).toBe('vacio');                                // estaba en la corrida 880, no en la actual
    expect(Object.keys(t)).toHaveLength(10);                          // M7 tiene 10 tanques en el plano
  });

  it('la cuenta del módulo cuadra con sus tanques', () => {
    expect(E.modulos.M7.cuenta).toEqual({ cultivo: 2, vacio: 6, despachado: 1, fuera: 1, alerta: 1 });
  });
});

describe('estado · otros casos', () => {
  it('corrida despachada entera: el módulo queda vacío, con su corrida', () => {
    const m = E.modulos.M9;
    expect(m).toMatchObject({ estado: 'despachado', corrida: '890' });
    expect(Object.values(m.tanques).every((t) => t.estado === 'vacio')).toBe(true);
  });

  it('desinfección sin siembra: todo el módulo en pre-siembra', () => {
    const m = E.modulos.M3;
    expect(m).toMatchObject({ estado: 'desinfeccion', corrida: '905' });
    expect(Object.values(m.tanques).every((t) => t.estado === 'desinfeccion')).toBe(true);
  });

  it('módulo sin datos: vacío; y CIO no se cuela en ningún módulo del plano', () => {
    expect(E.modulos.M1.estado).toBe('sin-datos');
    expect(Object.values(E.modulos).map((m) => m.mod)).not.toContain('CIO');
  });

  it('el resumen suma los 112 tanques del plano', () => {
    const r = E.resumen;
    expect(r.total).toBe(112);
    expect(r.cultivo + r.vacio + r.despachado + r.fuera + r.desinfeccion).toBe(112);
    expect(r).toMatchObject({ cultivo: 2, despachado: 1, fuera: 1, alerta: 1, desinfeccion: 12 });
  });
});
