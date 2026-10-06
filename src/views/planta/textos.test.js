/* PLANTA · textos.js: lo que dicen fichas, filas, cifras, producción, «Qué atender hoy» y reproductores (compartido por
   la maqueta y 📊 Análisis). Fixtures mínimos con la forma de estado.js y cifras.js. */
import { describe, it, expect } from 'vitest';
import { fichaGrupo, fichaTanque, textoFila, cifrasDelPanel, textosProduccion, textoMes, alertasParaAtender, reproductoresPorDias, colorGrupo } from './textos.js';

const HOY = { cargado: true, mesPasado: null };
const PASADO = { cargado: true, mesPasado: { mes: 'Septiembre', cierre: '2026-09-30' } };
const etapa = { key: 'cos', label: 'Cosecha', color: '#123456' };
const tq = (num, st, g) => ({ num, st, g });
function modulo(st, nT = 3) { const g = { id: 'M7', kind: 'larv', name: 'Módulo 7', short: 'M7', st, tanks: [], desove: [] }; for (let k = 1; k <= nT; k++) g.tanks.push(tq(k, st && st.tanques ? st.tanques[k] || null : null, g)); return g; }
const cultivo = (over = {}) => ({ estado: 'cultivo', corrida: '597', despachando: false, siembra: { fecha: new Date(2026, 8, 14), tanques: 3, nauplios: 9.6e6 },
  estadio: 'PL13', dias: 20, etapa, sv: 34.6, mort: 65.4, pop: 2.8e6, plg: null, od: 5.17, tmp: 33.1, tecnicos: ['Técnico A'], lotes: ['BN'],
  fresco: { label: 'hoy' }, motivos: [], cuenta: { cultivo: 2, vacio: 1, despachado: 0, fuera: 0, alerta: 2 },
  tanques: { 1: { estado: 'cultivo', nombre: 'TQ 1', estadio: 'PL13', sv: 30, pop: 1e6, od: 5, tmp: 33, alerta: true, motivos: ['Superv.'], etapa, lotes: ['BN'] },
    2: { estado: 'cultivo', nombre: 'TQ 2', estadio: 'PL13', sv: 31, pop: 1.8e6, od: 5.3, tmp: 33.2, alerta: true, motivos: ['Superv.'], etapa, lotes: ['BN'] },
    3: { estado: 'vacio' } }, ...over });
const sala = (over = {}) => ({ registrado: { estado: 'Producción', fecha: '2026-10-01' }, propuesto: { estado: 'Producción' }, coinciden: true, ocupados: 10, total: 15,
  fueraDeCatalogo: 0, hembras: 372, machos: 396, lotes: ['BN'], periodo: { bajas: 4, descartes: 1, copulas: 30 }, lecturas: { temperatura: null, oxigeno: null },
  alertaTanques: 1, alerta: false, motivos: [], reemplazo: null, tanques: {}, ...over });

describe('fichas', () => {
  it('módulo: cargando, sin datos, desinfección, despachado y en cultivo', () => {
    expect(fichaGrupo(modulo(null), { cargado: false, mesPasado: null }).rows).toEqual([['Estado', 'Cargando datos de producción…']]);
    expect(fichaGrupo(modulo(null), HOY).rows).toEqual([['Estado', 'Sin datos de producción']]);
    expect(fichaGrupo(modulo({ estado: 'desinfeccion', corrida: '602', registros: 4, ultimo: null }), HOY).rows[1]).toEqual(['Corrida', 'C602 en preparación']);
    const desp = modulo({ estado: 'despachado', corrida: '596', siembra: null, resultado: { poblacion: 3e6, superv: 70, plg: null }, ultimo: null });
    expect(fichaGrupo(desp, HOY).rows[0]).toEqual(['Estado', 'Vacío · corrida despachada']);
    expect(fichaGrupo(desp, PASADO).rows[0]).toEqual(['Estado', 'Corrida despachada']);
    const f = fichaGrupo(modulo(cultivo()), HOY);
    expect(f.kind).toBe('Módulo de larvicultura'); expect(f.name).toBe('Módulo 7');
    const r = Object.fromEntries(f.rows);
    expect(r['Estadío']).toBe('PL13 · día 20 · Cosecha');
    expect(r['Supervivencia']).toBe('34,6 %');
    expect(r['Tanques']).toBe('2 en cultivo · 1 vacíos');
    expect(r['Alertas']).toBe('2 tanques');
    expect(r['Siembra']).toMatch(/· 3 tanques · 9,6 M nauplios$/);
  });
  it('sala y tanques (larvicultura, maduración y desove)', () => {
    const g = { id: 'S1', kind: 'mat', name: 'Maduración 1', short: 'S1', st: sala(), tanks: [], desove: [{ num: 1, desove: true }] };
    const r = Object.fromEntries(fichaGrupo(g, HOY).rows);
    expect(r['Estado']).toBe('Producción · anotado el 01/10');
    expect(r['Ocupación']).toBe('10 de 15 tanques');
    expect(r['Desove']).toBe('1 tanques · sin registro por tanque en el MCP');
    const m = modulo(cultivo());
    expect(fichaTanque(m.tanks[0], HOY).rows.at(-2)).toEqual(['Alerta', '⚠ Superv. fuera de rango']);
    expect(fichaTanque(m.tanks[2], HOY).rows).toEqual([['Estado', 'Vacío']]);
    expect(fichaTanque({ num: 2, desove: true, st: null, g }, HOY).name).toBe('Maduración 1 · desove 2');
  });
});

describe('filas, cifras y color', () => {
  it('la fila del módulo y de la sala', () => {
    expect(textoFila(modulo(cultivo()), HOY)).toEqual({ sub: 'C597 · PL13 · día 20', ct: '⚠ 2' });
    expect(textoFila(modulo(cultivo({ cuenta: { cultivo: 2, vacio: 1, despachado: 0, fuera: 0, alerta: 0 } })), HOY).ct).toBe('2/3');
    const g = { kind: 'mat', st: sala({ alertaTanques: 0 }) };
    expect(textoFila(g, HOY)).toEqual({ sub: 'Producción · 372 ♀ · 396 ♂', ct: '10/15' });
    // la alerta de la sala (temperatura u oxígeno) cuenta junto a la de sus tanques
    expect(textoFila({ kind: 'mat', st: sala({ alertaTanques: 1, alerta: true }) }, HOY).ct).toBe('⚠ 2');
  });
  it('las cuatro cifras; sin datos, los guiones', () => {
    const E = { resumen: { cultivo: 89, total: 112, vacio: 12, despachado: 11, desinfeccion: 0, alerta: 6 },
      mad: { resumen: { hembras: 3320, machos: 3029, ocupados: 26, tanques: 38, alertaTanques: 12, alertaSalas: 2 } } };
    const c = cifrasDelPanel(E);
    expect(c.map((x) => x.valor)).toEqual([89, 6, '6.349', 14]);
    expect(c[0].detalle).toBe('de 112 · 79 % de ocupación · 12 vacíos · 11 despachados');
    expect(cifrasDelPanel(null).map((x) => x.valor)).toEqual(['—', '—', '—', '—']);
  });
  it('el color: la etapa del módulo y el estado de la sala', () => {
    expect(colorGrupo(modulo(cultivo()))).toBe('#123456');
    expect(colorGrupo({ kind: 'mat', st: sala({ registrado: { estado: 'Cuarentena' } }) })).toBe('#f2b705');
  });
});

describe('producción del mes', () => {
  const C = { mes: 'Octubre', corridas: ['597', '601'], total: 524.6e6, despachado: 0, enCultivo: 524.6e6, modulos: 8, modulosDespachados: 0,
    supervivencia: 72.94, nauplios: { n5: 93.2e6, desoves: 483, desde: '2026-10-01', hasta: '2026-10-05' } };
  it('frente a la meta, con la barra a escala de lo mayor', () => {
    const T = textosProduccion(C, 400e6, HOY);
    expect(T.total).toBe('524,6 M'); expect(T.metaTxt).toBe('de 400 M'); expect(T.pct).toBe('131 % de la meta'); expect(T.ok).toBe(true);
    expect(T.meta).toBe((400e6 / 524.6e6 * 100) + '%'); expect(T.anchoCult).toBe('100%');
    expect(T.n5sub).toBe('nauplios N5 · 01/10 al 05/10'); expect(T.sv).toBe('72,9 %');
    expect(textosProduccion({ ...C, total: 200e6, enCultivo: 200e6 }, 400e6, HOY).ok).toBe(false);
    expect(textosProduccion(C, 450.5e6, HOY).metaTxt).toBe('de 450,5 M');
  });
  it('sin cifras: cargando o sin corridas; el rótulo del mes', () => {
    expect(textosProduccion(null, 400e6, { cargado: false }).nota).toBe('Cargando datos…');
    expect(textosProduccion(null, 400e6, HOY).nota).toBe('Sin corridas con mes de producción');
    expect(textoMes(C)).toEqual({ mes: 'Octubre', corridas: 'corridas 597–601' });
    expect(textoMes(null)).toEqual({ mes: '—', corridas: '' });
  });
});

describe('Qué atender hoy y reproductores', () => {
  it('agrupa por módulo: motivo común en el renglón, distinto junto a cada tanque; y los lotes vencidos', () => {
    const m = modulo(cultivo());
    const s = { id: 'S1', kind: 'mat', name: 'Maduración 1', st: sala({ alerta: true, motivos: ['Temperatura'] }), tanks: [], desove: [] };
    s.tanks.push(tq(4, { alerta: true, motivos: ['H:M'] }, s), tq(5, { alerta: true, motivos: ['Densidad'] }, s));
    const A = alertasParaAtender([m, s], { vencidos: [{ lote: 'BQ', dias: 72, salas: [{ id: 'S1', sala: 'Sala 1' }, { id: 'S2', sala: 'Sala 2' }] }] }, HOY);
    expect(A.total).toBe(2 + 3 + 1);
    expect(A.items[0]).toMatchObject({ tipo: 'grupo', nombre: 'Módulo 7', detalle: '2 tanques · supervivencia' });
    expect(A.items[0].tanques.map((x) => x.texto)).toEqual(['1', '2']);
    expect(A.items[1].detalle).toBe('temperatura de la sala · 2 tanques');
    expect(A.items[1].tanques.map((x) => x.texto)).toEqual(['4 · H:M', '5 · densidad']);
    expect(A.items[2]).toMatchObject({ tipo: 'lote', g: s, nombre: 'Lote BQ', detalle: '72 d en producción · Salas 1 y 2' });
    expect(alertasParaAtender([], null, PASADO)).toEqual({ titulo: 'Alertas al cierre de Septiembre', total: 0, items: [], vacio: 'Sin alertas al cierre de Septiembre' });
    expect(alertasParaAtender([m], null, { cargado: false, mesPasado: null }).total).toBe(null);
  });
  it('los días en producción frente al límite', () => {
    const P = reproductoresPorDias({ limite: 60, lotes: [{ lote: 'BN', dias: 30, salas: [{ sala: 'Sala 1' }] }, { lote: 'BQ', dias: 75, salas: [{ sala: 'Sala 2' }, { sala: 'Sala 3' }] }] }, PASADO);
    expect(P.titulo).toBe('Reproductores · días en producción al 30/09');
    expect(P.lotes.map((l) => [l.nombre, l.salas, l.dias, l.ancho, l.pasa])).toEqual([['BN', 'Sala 1', '30 d', '50%', false], ['⏳ BQ', 'Salas 2 y 3', '75 d', '100%', true]]);
    expect(reproductoresPorDias({ limite: 60, lotes: [] }, HOY).vacio).toBe('Ningún lote en producción');
    expect(reproductoresPorDias(null, HOY).vacio).toBe('Sin datos de maduración');
  });
});
