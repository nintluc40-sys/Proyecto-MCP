import { describe, it, expect, afterEach } from 'vitest';
import { store } from './store.js';
import { monthIndexOfCorrida, monthLabelAt, modCorStats, modCorDispatched, modulesOfCorrida, corridasOfMonth } from './prodCalendar.js';

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

/* ── GUARDIÁN de la invariante del array de filas (F1) ─────────────────────────
   Hoy `larvRows()` re-filtra `store.globalData` en cada llamada, de modo que cada
   consumidor trabaja sobre su PROPIA copia y los `.sort()` internos son inocuos.
   Si algún día se memoiza (para dejar de escanear el store una vez por llamada),
   ese array pasará a estar COMPARTIDO entre los 6 consumidores de este módulo
   —Supervisor, Larvicultura, Revisiones, Algas, Microbiología y Visitante— y
   bastará con perder un `.filter()` intermedio para que un `.sort()` reordene el
   array de todos, con resultados que dependerían del orden de las llamadas.
   Estos dos tests congelan la invariante ANTES de que eso ocurra. No prueban una
   implementación: prueban que el resultado no depende de cuántas veces ni en qué
   orden se llame, y que el store no se reordena por el camino. */
describe('prodCalendar · guardián: agregados estables e independientes del orden de llamada', () => {
  // A propósito DESORDENADO: fechas y tanques entremezclados, dos módulo+corrida.
  const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
  const desordenado = () => [
    L({ 'Módulo': 'M02', Corrida: '574', Tanque: 'TQ3', 'Población': '500', Fecha: '10/06/2026' }),
    L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ2', 'Población': '700', Fecha: '05/06/2026', Destino: 'Piscina 1', Biomasa: '9' }),
    L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026' }),
    L({ 'Módulo': 'M02', Corrida: '574', Tanque: 'TQ1', 'Población': '900', Fecha: '02/06/2026' }),
    L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ2', 'Población': '1200', Fecha: '01/06/2026' }),
    L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', 'Población': '800', Fecha: '05/06/2026', Destino: 'Piscina 2', Biomasa: '11' }),
    L({ 'Módulo': 'M02', Corrida: '574', Tanque: 'TQ3', 'Población': '600', Fecha: '02/06/2026' }),
  ];
  const huella = () => store.globalData.map((r) => `${r['Módulo']}/${r.Corrida}/${r.Tanque}/${r.Fecha}`).join('|');

  it('llamadas repetidas e intercaladas devuelven exactamente lo mismo', () => {
    store.globalData = desordenado();
    const a1 = modCorStats('M01', '573');
    const b1 = modCorStats('M02', '574');
    const d1 = modCorDispatched('M01', '573');
    const m1 = modulesOfCorrida('573');
    // Mismas consultas, intercaladas y en otro orden.
    const b2 = modCorStats('M02', '574');
    const d2 = modCorDispatched('M01', '573');
    const a2 = modCorStats('M01', '573');
    const m2 = modulesOfCorrida('573');
    const a3 = modCorStats('M01', '573');

    expect(a2).toEqual(a1);
    expect(a3).toEqual(a1);
    expect(b2).toEqual(b1);
    expect(d2).toBe(d1);
    expect(m2).toEqual(m1);
    // Y los valores son los correctos, no solo "estables entre sí".
    expect(a1.siembra).toBe(2200);   // TQ1 1000 + TQ2 1200 (primera población real)
    expect(a1.cosecha).toBe(1500);   // TQ1 800 + TQ2 700 (última registrada)
    expect(a1.despachadoFull).toBe(true);
    expect(b1.despachado).toBe(false);
  });

  it('no re-escanea el store en llamadas repetidas (memo por identidad)', () => {
    const rows = desordenado();
    let scans = 0;
    const realFilter = Array.prototype.filter;
    rows.filter = function (...args) { scans++; return realFilter.apply(this, args); };
    store.globalData = rows;

    // Un "render ejecutivo": varias tarjetas, cada una con sus dos consultas.
    modCorStats('M01', '573'); modCorDispatched('M01', '573');
    modCorStats('M02', '574'); modCorDispatched('M02', '574');
    modulesOfCorrida('573'); corridasOfMonth(monthIndexOfCorrida(573));
    modCorStats('M01', '573');   // repetida
    // Antes cada llamada re-filtraba el store entero (7 escaneos); ahora basta uno.
    expect(scans).toBe(1);

    // Un refresco (array NUEVO) sí invalida y vuelve a escanear.
    const nuevas = desordenado();
    nuevas.filter = function (...args) { scans++; return realFilter.apply(this, args); };
    store.globalData = nuevas;
    scans = 0;
    modCorStats('M01', '573');
    expect(scans).toBe(1);
  });

  it('tras un refresco, los agregados reflejan los datos NUEVOS (no el memo viejo)', () => {
    store.globalData = desordenado();
    expect(modCorStats('M01', '573').cosecha).toBe(1500);
    // Mismo módulo+corrida, población distinta → el memo debe invalidarse.
    store.globalData = [
      L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', 'Población': '400', Fecha: '01/06/2026' }),
      L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', 'Población': '300', Fecha: '05/06/2026' }),
    ];
    expect(modCorStats('M01', '573').cosecha).toBe(300);
  });

  it('la clave del memo no confunde ("M1","23") con ("M12","3")', () => {
    store.globalData = [
      L({ 'Módulo': 'M1', Corrida: '23', Tanque: 'TQ1', 'Población': '100', Fecha: '01/06/2026' }),
      L({ 'Módulo': 'M12', Corrida: '3', Tanque: 'TQ1', 'Población': '900', Fecha: '01/06/2026' }),
    ];
    expect(modCorStats('M1', '23').siembra).toBe(100);
    expect(modCorStats('M12', '3').siembra).toBe(900);
  });

  it('no reordena store.globalData (nada ordena el array del store in situ)', () => {
    store.globalData = desordenado();
    const antes = huella();
    modCorStats('M01', '573');
    modCorDispatched('M01', '573');
    modulesOfCorrida('573');
    corridasOfMonth(monthIndexOfCorrida(573));
    modCorStats('M02', '574');
    modCorStats('M01', '573');
    expect(huella()).toBe(antes);
  });
});
