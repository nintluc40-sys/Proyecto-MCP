/* PLANTA · textos.js: lo que dicen fichas, filas, cifras, producción, «Qué atender hoy» y reproductores (compartido por
   la maqueta y 📊 Análisis). Fixtures mínimos con la forma de estado.js y cifras.js. */
import { describe, it, expect } from 'vitest';
import { fichaGrupo, fichaTanque, textoFila, cifrasDelPanel, textosProduccion, textoMes, alertasParaAtender, reproductoresPorDias, colorGrupo, tablaDeTanques, cronogramaParaPintar } from './textos.js';

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

describe('detalle por tanque (T2 de Análisis)', () => {
  const larv = (num, over = {}) => ({ estado: 'cultivo', nombre: 'TQ ' + num, estadio: 'PL5', sv: 80, pop: 1e6, od: 5, tmp: 30, alerta: false, motivos: [], lotes: ['BN'], ...over });
  const mad = (over = {}) => ({ estado: 'Producción', vivos: 20, hembras: 10, machos: 10, hm: 1, hmEstado: 'ok', densidad: 4, densidadEstado: 'ok', lotes: [],
    periodo: { bajas: 1, descartes: 0, copulas: 3, pctCopulas: 4.3 }, ultimoParte: '2026-10-05', alerta: false, motivos: [], ...over });
  function grupo(id, kind, tanques) { const g = { id, kind, name: id, short: id, st: {}, tanks: [], desove: [] }; Object.entries(tanques).forEach(([n, st]) => g.tanks.push(tq(+n, st, g))); return g; }
  const M1 = grupo('M1', 'larv', { 1: larv(1, { estadio: 'PL10', sv: 61, alerta: true, motivos: ['Superv.'] }), 2: larv(2, { estadio: 'PL2', sv: null }), 3: { estado: 'vacio' }, 4: larv(4, { estado: 'despachado' }) });
  const M2 = grupo('M2', 'larv', { 1: larv(1, { estadio: 'Z3', sv: 92, od: 3.2, alerta: true, motivos: ['OD'] }) });
  const S1 = grupo('S1', 'mat', { 1: mad(), 2: mad({ vivos: 0, hembras: 0, machos: 0 }),
    3: mad({ estado: 'Cuarentena', hm: 2.5, alerta: true, motivos: ['H:M'], periodo: { bajas: 4, descartes: 2, copulas: 0, pctCopulas: '' }, ultimoParte: '' }) });
  const G = [M1, M2, S1];
  const T = (area, opc = {}, ctx = HOY) => tablaDeTanques(G, area, { soloAlerta: false, k: 'tq', dir: 'asc', ...opc }, ctx);
  const tqs = (r) => r.filas.map((f) => f.celdas.tq.txt);

  it('sólo los activos (en cultivo; con reproductores), por módulo y tanque, con su resumen', () => {
    expect(tqs(T('larv'))).toEqual(['M1 · 1', 'M1 · 2', 'M2 · 1']);
    expect(T('larv').resumen).toBe('3 tanques en cultivo · 2 en alerta');
    expect(T('larv', {}, PASADO).resumen).toBe('3 tanques en cultivo · 2 en alerta (Septiembre)');
    expect(tqs(T('mat'))).toEqual(['S1 · 1', 'S1 · 3']);
    expect(T('mat').resumen).toBe('2 tanques con reproductores · 1 en alerta');
  });
  it('los textos de cada celda y la causa de la alerta marcada', () => {
    const [a, b, c] = T('larv').filas;
    expect(a.celdas.sv).toEqual({ txt: '61,0 %', v: 61, mal: true });
    expect(a.celdas.od.mal).toBe(false);
    expect(a.celdas.alerta.txt).toBe('⚠ Superv.');
    expect([b.celdas.sv.txt, b.celdas.sv.v, b.celdas.alerta.txt, b.celdas.lote.txt]).toEqual(['—', null, '', 'BN']);
    expect(c.celdas.od).toMatchObject({ txt: '3,20', mal: true });
    const [s1, s3] = T('mat').filas;
    expect([s1.celdas.cop.txt, s1.celdas.parte.txt, s1.celdas.h.txt]).toEqual(['4,3 %', '05/10', '10']);
    expect(s3.celdas.hm).toMatchObject({ txt: '2,50', mal: true });
    expect([s3.celdas.cop.txt, s3.celdas.cop.v, s3.celdas.parte.txt, s3.celdas.parte.v]).toEqual(['—', null, '—', null]);
  });
  it('ordena: el estadío en su orden biológico y, sin dato, al final en los dos sentidos', () => {
    expect(tqs(T('larv', { k: 'estadio' }))).toEqual(['M2 · 1', 'M1 · 2', 'M1 · 1']);   // Z3 < PL2 < PL10
    expect(tqs(T('larv', { k: 'estadio', dir: 'desc' }))).toEqual(['M1 · 1', 'M1 · 2', 'M2 · 1']);
    expect(tqs(T('larv', { k: 'sv' }))).toEqual(['M1 · 1', 'M2 · 1', 'M1 · 2']);   // 61, 92, sin dato
    expect(tqs(T('larv', { k: 'sv', dir: 'desc' }))).toEqual(['M2 · 1', 'M1 · 1', 'M1 · 2']);
    expect(tqs(T('mat', { k: 'parte', dir: 'desc' }))).toEqual(['S1 · 1', 'S1 · 3']);
    expect(tqs(T('mat', { k: 'alerta', dir: 'desc' }))).toEqual(['S1 · 3', 'S1 · 1']);
    expect(tqs(T('mat', { k: 'estado', dir: 'desc' }))).toEqual(['S1 · 1', 'S1 · 3']);   // Producción > Cuarentena
  });
  it('«sólo en alerta», una columna de la otra área, cargando y vacío', () => {
    expect(tqs(T('larv', { soloAlerta: true }))).toEqual(['M1 · 1', 'M2 · 1']);
    const r = T('mat', { k: 'sv', dir: 'desc' });
    expect([r.k, r.dir, tqs(r)]).toEqual(['tq', 'asc', ['S1 · 1', 'S1 · 3']]);
    expect(T('larv', {}, { cargado: false, mesPasado: null })).toMatchObject({ filas: [], vacio: 'Cargando datos de producción…' });
    expect(tablaDeTanques([grupo('M3', 'larv', { 1: { estado: 'vacio' } })], 'larv', { soloAlerta: false }, PASADO).vacio).toBe('Ningún tanque en cultivo en Septiembre.');
    expect(tablaDeTanques([grupo('M3', 'larv', { 1: larv(1) })], 'larv', { soloAlerta: true }, HOY))
      .toMatchObject({ resumen: '1 tanque en cultivo · ninguno en alerta', filas: [], vacio: 'Ningún tanque en alerta.' });
  });
});

describe('cronograma del ciclo (T3 de Análisis): lo que se dibuja', () => {
  const g = (id) => ({ id, kind: 'larv', name: 'Módulo ' + id.slice(1), short: id, st: null, tanks: [], desove: [] });
  const G = ['M1', 'M2', 'M3', 'M4'].map(g).concat([{ id: 'S1', kind: 'mat', name: 'Maduración 1', short: 'S1', tanks: [], desove: [] }]);
  const tr = (key, label, range, desde, hasta, dias) => ({ key, label, range, color: '#000', desde, hasta, dias });
  const crono = (m1inicio = '2026-09-17') => ({ hasta: '2026-10-06', modulos: {
    M1: { tipo: 'cultivo', corrida: '900', inicio: m1inicio, fin: '2026-10-06', dias: 20, estadio: 'PL8', despacho: { desde: '2026-10-05', hasta: '2026-10-05' },
      tramos: [tr('desarrollo', 'Desarrollo', 'Z3–PL3', m1inicio, '2026-09-30', 14), tr('crecimiento', 'Crecimiento', 'PL7–PL10', '2026-10-01', '2026-10-06', 6)] },
    M2: { tipo: 'despachado', corrida: '890', inicio: '2026-09-08', fin: '2026-10-02', dias: 25, estadio: 'PL12', despacho: { desde: '2026-09-30', hasta: '2026-10-02' },
      tramos: [tr('cosecha', 'Cosecha', 'PL11+', '2026-09-08', '2026-10-02', 25)] },
    M3: { tipo: 'desinfeccion', corrida: '905', ultimo: '2026-10-03' },
    M4: { tipo: 'sin' } } });

  it('eje común desde la siembra más antigua hasta hoy, con los tramos, el despacho y la desinfección en %', () => {
    const P = cronogramaParaPintar(G, crono(), HOY);   // del 08/09 al 06/10: 29 días
    expect([P.desde, P.hasta, P.corte, P.cortePct]).toEqual(['2026-09-08', '2026-10-06', 'hoy', 98.28]);
    // la del 06/10 caería sobre «hoy»: fuera
    expect(P.marcas).toEqual([{ pct: 0, txt: '08/09' }, { pct: 24.14, txt: '15/09' }, { pct: 48.28, txt: '22/09' }, { pct: 72.41, txt: '29/09' }]);
    expect(P.filas.map((f) => f.id)).toEqual(['M1', 'M2', 'M3', 'M4']);   // sólo larvicultura, los 4 siempre
    const [m1, m2, m3, m4] = P.filas;
    expect(m1.tramos.map((t) => [t.left, t.width])).toEqual([[31.03, 48.28], [79.31, 20.69]]);
    expect(m1.tramos[0].detalle).toBe('M1 · C900 · Desarrollo (Z3–PL3) · 17/09–30/09 · 14 días');
    expect(m1.tramos[1].detalle).toBe('M1 · C900 · Crecimiento (PL7–PL10) · 01/10–06/10 · 6 días · sigue hoy');
    expect([m1.camion, m1.desp, m1.etiqueta]).toEqual([93.1, { left: 93.1, width: 6.9 }, 'día 20 · PL8 · despachando desde 05/10']);
    expect([m2.etiqueta, m2.desp, m2.tramos[0].detalle.endsWith('25 días')]).toEqual(['despachada 02/10 · C890', { left: 75.86, width: 10.34 }, true]);
    expect([m3.etiqueta, m3.desinf, m3.tramos]).toEqual(['pre-siembra (C905) · desinfección 03/10', 87.93, []]);
    expect([m4.etiqueta, m4.tramos, m4.camion]).toEqual(['sin corrida', [], null]);
  });
  it('un mes pasado dice «cierre»; una siembra de hace más de 60 días se corta; sin datos, cargando', () => {
    const P = cronogramaParaPintar(G, crono(), PASADO);
    expect([P.corte, P.filas[0].tramos[1].detalle.endsWith('· sigue al cierre')]).toEqual(['cierre', true]);
    expect(P.nota).toContain('al cierre de Septiembre');
    const V = cronogramaParaPintar(G, crono('2026-07-01'), HOY);
    expect([V.desde, V.filas[0].cortada, V.filas[0].tramos[0].left]).toEqual(['2026-08-08', true, 0]);
    expect(V.nota).toContain('Se ven los últimos 60 días.');
    expect(cronogramaParaPintar(G, null, { cargado: false, mesPasado: null }).vacio).toBe('Cargando datos de producción…');
  });
});
