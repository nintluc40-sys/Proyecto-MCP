import { describe, it, expect, afterEach } from 'vitest';
import { store } from './store.js';
import { monthIndexOfCorrida, monthLabelAt, modCorStats, modCorDispatched, modulesOfCorrida, corridasOfMonth, presentMonths, ventanaDeMaduracion } from './prodCalendar.js';

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
  it('meses virtuales continúan la secuencia dentro del primer ciclo', () => {
    expect(monthLabelAt(6)).toBe('Julio');
    expect(monthLabelAt(7)).toBe('Agosto');
    expect(monthLabelAt(11)).toBe('Diciembre');
  });

  // Al dar la vuelta al calendario los nombres se repiten. Antes `monthLabelAt(12)`
  // devolvía 'Enero' a secas, indistinguible del mes 0 en el navegador ◀▶ de las
  // 7 vistas que usan esta etiqueta; ahora se desambigua.
  /* Revisión del 07-11 (usuario: «En la función del mes») · la corrida con rango la lee la propia función, en TODAS las llamadas. */
  it('una corrida con rango («581-582») es la de su primer número; sin cifras, -1', () => {
    expect(monthIndexOfCorrida('581-582')).toBe(monthIndexOfCorrida(581));
    expect(monthIndexOfCorrida(' 544 ')).toBe(0);
    expect(['', null, undefined, 'sin corrida', NaN].map(monthIndexOfCorrida)).toEqual([-1, -1, -1, -1, -1]);
  });
  it('🔴 el año base vota también con las corridas con rango (antes no votaban: sin año, «Enero» a secas)', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '616-617', Tanque: 'TQ1', Fecha: '15/01/2027' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '616-617', Tanque: 'TQ1', Fecha: '17/01/2027' },
    ];
    expect(monthLabelAt(12)).toBe('Enero 2027');
  });

  it('al reiniciar el ciclo añade el AÑO del mes de calendario (año base de las fechas + ciclos de 12)', () => {
    // Mes 12 = 12 meses × 6 corridas desde 544 → corrida 616.
    expect(monthIndexOfCorrida(616)).toBe(12);
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '616', Tanque: 'TQ1', Fecha: '15/01/2027' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '616', Tanque: 'TQ1', Fecha: '17/01/2027' },
    ];
    expect(monthLabelAt(12)).toBe('Enero 2027');
    expect(monthLabelAt(0)).toBe('Enero'); // el mes base no cambia
  });

  // A32 (2026-11-06): el mes de producción arranca ~2 semanas antes que el de calendario. Con el «Enero» recién
  // empezado, sus filas son todas de DICIEMBRE, y el año que más se repetía en ellas lo rotulaba «Enero 2026».
  it('A32: el «Enero» que empieza en diciembre ya es del año siguiente, aunque todas sus filas sean de diciembre', () => {
    const fila = (cor, fecha) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: String(cor), Tanque: 'TQ1', Fecha: fecha });
    store.globalData = [
      fila(544, '20/01/2026'), fila(544, '22/01/2026'),   // Enero (mes 0)
      fila(603, '10/11/2026'), fila(603, '12/11/2026'),   // Noviembre (mes 10)
      fila(609, '28/11/2026'), fila(609, '02/12/2026'),   // Diciembre (mes 11)
      fila(615, '14/12/2026'), fila(615, '15/12/2026'), fila(615, '16/12/2026'),   // Enero siguiente (mes 12), recién sembrado
    ];
    expect(monthIndexOfCorrida(615)).toBe(12);
    expect(monthLabelAt(12)).toBe('Enero 2027');
    expect(monthLabelAt(13)).toBe('Febrero 2027');
    expect(monthLabelAt(11)).toBe('Diciembre');
  });

  it('sin fechas utilizables cae al número de ciclo, pero NO repite la etiqueta', () => {
    store.globalData = [];
    expect(monthLabelAt(12)).toBe('Enero (ciclo 2)');
    expect(monthLabelAt(12)).not.toBe(monthLabelAt(0));
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
  it('siembraFecha = fecha PROMEDIO de la primera población real de cada tanque', () => {
    store.globalData = [
      // TQ1 siembra el 02/07, TQ2 el 06/07 → promedio 04/07/2026
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '579', Tanque: 'TQ1', 'Población': '0', Fecha: '01/07/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '579', Tanque: 'TQ1', 'Población': '4000', Fecha: '02/07/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '579', Tanque: 'TQ2', 'Población': '4200', Fecha: '06/07/2026' },
    ];
    const f = modCorStats('M06', '579').siembraFecha;
    expect(f).toBeInstanceOf(Date);
    expect(f.getDate()).toBe(4);
    expect(f.getMonth()).toBe(6); // julio
    expect(f.getFullYear()).toBe(2026);
  });

  it('siembraFecha es null si ningún tanque llegó a tener población real', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '579', Tanque: 'TQ1', 'Población': '0', Fecha: '01/07/2026' },
    ];
    expect(modCorStats('M06', '579').siembraFecha).toBeNull();
  });

  it('nSie cuenta solo tanques con siembra real, y el tonelaje los acompaña', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '574', Tanque: 'TQ1', 'Población': '2800', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '574', Tanque: 'TQ2', 'Población': '1400', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '574', Tanque: 'TQ3', 'Población': '0', Fecha: '01/06/2026' },
    ];
    const s = modCorStats('M02', '574');
    expect(s.nSie).toBe(2);        // TQ3 nunca tuvo población real (>0)
    expect(s.siembra).toBe(4200);  // 2800 + 1400
    // Desde 2026-08-18 el denominador de la densidad ya NO es nSie sino el volumen real de
    // los tanques (columna «Toneladas»); nSie sigue siendo el nº de tanques sembrados y es
    // lo que hay que repartir entre `tonSum` y `tonSin`. Sin tonelaje en la hoja, todos los
    // tanques sembrados caen del lado "sin dato" — que es lo que devuelve la densidad al
    // volumen fijo de antes. La fórmula en sí la prueban `volumenSiembra` y `densSiembra`.
    expect(s.tonSum).toBe(0);
    expect(s.tonSin).toBe(s.nSie);
  });

  it('el tonelaje registrado se acumula, y solo el de los tanques SEMBRADOS', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '575', Tanque: 'TQ1', 'Población': '2800', Fecha: '01/06/2026', Toneladas: '30' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '575', Tanque: 'TQ2', 'Población': '1400', Fecha: '01/06/2026' },
      // TQ3 trae tonelaje pero NUNCA se sembró: no debe aportar volumen a nada.
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '575', Tanque: 'TQ3', 'Población': '0', Fecha: '01/06/2026', Toneladas: '99' },
    ];
    const s = modCorStats('M02', '575');
    expect(s.nSie).toBe(2);
    expect(s.tonSum).toBe(30);     // solo TQ1; las 99 t de TQ3 quedan fuera
    expect(s.tonSin).toBe(1);      // TQ2, sembrado y sin medir
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

  /* `modulesOfCorrida` pasó a estar memoizada, así que su resultado queda cacheado entre
     la Vista Ejecutiva, el Resumen Operativo, Producción Omarsa y Visitante. Hoy todos lo
     consumen con map/forEach/every/join, pero basta que uno lo ordene in situ para
     reordenárselo a los demás. Estos dos tests congelan esa invariante.

     ⚠ El fixture `desordenado()` NO sirve aquí: su corrida 573 tiene un solo módulo, y
     ordenar una lista de un elemento no la cambia — el test pasaría con la caché
     compartida y sin copia, sin probar nada. Hace falta una corrida MULTI-MÓDULO. */
  const multiMod = () => [
    L({ 'Módulo': 'M07', Corrida: '573', Tanque: 'TQ1', 'Población': '900', Fecha: '01/06/2026' }),
    L({ 'Módulo': 'M06', Corrida: '573', Tanque: 'TQ1', 'Población': '800', Fecha: '01/06/2026' }),
    L({ 'Módulo': 'M02', Corrida: '574', Tanque: 'TQ1', 'Población': '700', Fecha: '01/06/2026' }),
  ];

  it('modulesOfCorrida: mismo resultado y sin re-escaneo en llamadas repetidas', () => {
    const rows = multiMod();
    let scans = 0;
    const realFilter = Array.prototype.filter;
    rows.filter = function (...args) { scans++; return realFilter.apply(this, args); };
    store.globalData = rows;

    const m1 = modulesOfCorrida('573');
    const m2 = modulesOfCorrida('573');
    expect(m1).toEqual(['M06', 'M07']); // orden natural, no el de aparición
    expect(m2).toEqual(m1);
    expect(scans).toBe(1); // el 2.º no vuelve a barrer el store

    // Corridas distintas no se pisan la entrada del memo.
    expect(modulesOfCorrida('574')).toEqual(['M02']);
    expect(modulesOfCorrida('573')).toEqual(['M06', 'M07']);
  });

  it('modulesOfCorrida: un consumidor que ordene su array no altera al siguiente', () => {
    store.globalData = multiMod();
    const antes = [...modulesOfCorrida('573')];
    expect(antes).toHaveLength(2); // si fuera 1, este test no probaría nada
    // El consumidor descuidado ordena in situ lo que recibió (aquí, al revés).
    modulesOfCorrida('573').reverse();
    // Si esto falla, uno puede corromperle la lista de módulos a las otras 3 vistas.
    expect(modulesOfCorrida('573')).toEqual(antes);
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

// 2026-10-22, pauta 28 · la regla vivía dos veces (Visitante · ventanaMad y Planta · cifras.js); ahora sólo aquí. El año
// base sale de las fechas de las corridas: Julio = 579–584, así que el mes interno 8 es septiembre de 2026.
describe('ventanaDeMaduracion · su mes de calendario o, si aún no empieza, el EN CURSO, dicho (2026-10-18, opción A)', () => {
  const L = (cor, fecha) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Tanque: 'TQ1', 'Población': '1000', Corrida: cor, Fecha: fecha });
  const conAnio = () => { store.globalData = [L('579', '05/07/2026'), L('585', '05/08/2026'), L('591', '05/09/2026')]; };

  it('empezado (desde su día 1) o pasado: su mes de calendario, sin `adelantado`', () => {
    conAnio();
    const SEP = { desde: '2026-09-01', hasta: '2026-09-30' };
    expect(ventanaDeMaduracion(8, '2026-09-01')).toEqual({ ventana: SEP, adelantado: null });
    expect(ventanaDeMaduracion(8, '2026-10-22')).toEqual({ ventana: SEP, adelantado: null });
  });

  it('sin empezar: el mes de calendario de hoy, del 1 a su ÚLTIMO día, y el mes elegido con el día en que empieza', () => {
    conAnio();
    expect(ventanaDeMaduracion(8, '2026-08-31')).toEqual({
      ventana: { desde: '2026-08-01', hasta: '2026-08-31' }, adelantado: { mes: 'Septiembre', empieza: '2026-09-01' } });
    expect(ventanaDeMaduracion(9, '2026-09-14').ventana, 'septiembre tiene 30 días').toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(ventanaDeMaduracion(14, '2027-02-10').ventana, 'febrero de 2027, 28').toEqual({ desde: '2027-02-01', hasta: '2027-02-28' });
  });

  it('sin mes de calendario (índice que no vale o sin año base): nada', () => {
    conAnio();
    expect(ventanaDeMaduracion(-1, '2026-09-14')).toEqual({ ventana: null, adelantado: null });
    store.globalData = [];
    expect(ventanaDeMaduracion(8, '2026-08-20')).toEqual({ ventana: null, adelantado: null });
  });
});

/* A29 (2026-11-06, usuario: «El de su primer número») · una corrida escrita como RANGO («581-582») cuenta en el mes de su
   PRIMER número, la regla que ya seguía Microbiología. Antes: con `+c`, NaN (ningún mes: Algas, Revisiones, Desinfección);
   quitando lo que no es cifra, 581582 (ningún mes: Visitante). */
describe('A29 · numeroDeCorrida', () => {
  it('el primer número: «581» y «581-582» → 581; «C581» sigue siendo 581; un número, tal cual', async () => {
    const { numeroDeCorrida } = await import('./prodCalendar.js');
    expect(numeroDeCorrida('581')).toBe(581);
    expect(numeroDeCorrida(' 581 ')).toBe(581);
    expect(numeroDeCorrida('581-582')).toBe(581);
    expect(numeroDeCorrida('581 - 582')).toBe(581);
    expect(numeroDeCorrida('C581')).toBe(581);
    expect(numeroDeCorrida(581)).toBe(581);
  });
  it('sin cifras, NaN (ningún mes, como antes)', async () => {
    const { numeroDeCorrida } = await import('./prodCalendar.js');
    for (const v of ['', null, undefined, 'sin corrida']) expect(Number.isNaN(numeroDeCorrida(v)), String(v)).toBe(true);
  });
  it('el rango cae en el mes de su primer número, no en ninguno', async () => {
    const { numeroDeCorrida } = await import('./prodCalendar.js');
    expect(monthIndexOfCorrida(numeroDeCorrida('581-582'))).toBe(monthIndexOfCorrida(581));
    expect(monthIndexOfCorrida(numeroDeCorrida('581-582'))).toBeGreaterThanOrEqual(0);
    expect(monthIndexOfCorrida(+'581-582'), 'control: así se leía en Algas').toBe(-1);
    // control: así se leía en Visitante: 581582 cae en un mes VIRTUAL absurdo (decenas de miles), que nadie elige
    expect(monthIndexOfCorrida(parseInt('581-582'.replace(/\D/g, ''), 10)), 'control: así, en Visitante').toBeGreaterThan(1000);
  });
});

/* Revisión del 07-11 (usuario: «Sí, sólo esas dos») · los meses con datos y las corridas de un mes leían la corrida con `+c`: una
   corrida con rango no salía en la lista de meses ni en el selector de corridas (Larvicultura, Planta, Vista Ejecutiva). */
describe('Revisión del 07-11 · presentMonths y corridasOfMonth con la corrida con rango', () => {
  const fila = (cor) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: cor, Tanque: 'TQ1', Fecha: '01/07/2026' });
  it('🔴 un mes con SÓLO corridas con rango sale en la lista de meses', () => {
    store.globalData = [fila('581-582'), fila('sin corrida'), fila('')];
    expect(presentMonths()).toEqual([monthIndexOfCorrida(581)]);
  });
  it('🔴 la corrida con rango sale entre las de su mes, por su primer número y tras la suya sola', () => {
    store.globalData = [fila('583'), fila('581-582'), fila('581'), fila('573'), fila('sin corrida')];
    expect(corridasOfMonth(monthIndexOfCorrida(581))).toEqual(['581', '581-582', '583']);
    expect(corridasOfMonth(monthIndexOfCorrida(573)), 'otro mes, sin cambios').toEqual(['573']);
  });
});
