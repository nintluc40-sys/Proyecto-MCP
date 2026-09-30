import { describe, it, expect, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { isMareaRow, mareaDays, pearson, spearman, corrCandidate, monthStats, mareaMoonSVG, calendarioDelMes } from './mareas.js';

afterEach(() => { store.globalData = []; });

const M = (o) => ({ _SheetOrigin: 'Marea', ...o });

describe('mareas · capa de datos (hoja "Marea")', () => {
  it('isMareaRow reconoce la hoja Marea', () => {
    expect(isMareaRow(M({}))).toBe(true);
    expect(isMareaRow({ _SheetOrigin: 'Larvicultura' })).toBe(false);
    expect(isMareaRow(null)).toBe(false);
  });

  describe('formatos de hora de la hoja (se teclean a mano)', () => {
    const horaDe = (h) => {
      store.globalData = [M({ Fecha: '01/06/2026', 'Pleamar 1': h, 'Altura P1 (m)': '2.0' })];
      const ev = (mareaDays()[0] || { events: [] }).events.find((e) => e.type === 'P');
      return ev ? ev.label : null;
    };

    it('TRES dígitos = HMM sin cero a la izquierda', () => {
      // Sin rama propia caían al último recurso "el número son minutos", en silencio:
      // "800" → 13:20, "130" → 02:10, "945" → 15:45.
      expect(horaDe('800')).toBe('08:00');
      expect(horaDe('130')).toBe('01:30');
      expect(horaDe('945')).toBe('09:45');
      expect(horaDe('05')).toBe('05:00');   // 2 dígitos siguen siendo horas decimales
    });

    it('los formatos que ya funcionaban no cambian', () => {
      expect(horaDe('08:00')).toBe('08:00');
      expect(horaDe('0800')).toBe('08:00');
      expect(horaDe('1230')).toBe('12:30');
      expect(horaDe('23:03')).toBe('23:03');
      expect(horaDe('0.5')).toBe('12:00');    // fracción de día (Excel)
      expect(horaDe('8')).toBe('08:00');      // horas decimales
    });

    it('tres dígitos con minutos imposibles caen al respaldo, no inventan una hora', () => {
      // "999" → mi=99 no es válido: se interpreta como minutos (999 = 16:39), no como 9:99.
      expect(horaDe('999')).toBe('16:39');
    });
  });

  it('parsea eventos P/B, calcula pmax/bmin/amp, ordena por hora y lee fase/iluminación/tipo', () => {
    store.globalData = [M({
      Fecha: '05/06/2026', 'Fase Lunar': 'Luna llena', '%Iluminación': '100', 'Tipo de Marea': 'Viva',
      'Pleamar 1': '04:55', 'Altura P1 (m)': '2.02', 'Bajamar 1': '10:55', 'Altura B1 (m)': '0.71',
      'Pleamar 2': '16:46', 'Altura P2 (m)': '1.92', 'Bajamar 2': '23:03', 'Altura B2 (m)': '0.40',
      'Amplitud (m)': '1.62',
    })];
    const days = mareaDays();
    expect(days.length).toBe(1);
    const d = days[0];
    expect(d.events.length).toBe(4);
    expect(d.events.map((e) => e.label)).toEqual(['04:55', '10:55', '16:46', '23:03']); // asc por hora
    expect(d.events.map((e) => e.type)).toEqual(['P', 'B', 'P', 'B']);
    expect(d.pmax).toBeCloseTo(2.02, 5);
    expect(d.bmin).toBeCloseTo(0.40, 5);
    expect(d.amp).toBeCloseTo(1.62, 5);
    expect(d.tipo).toBe('Viva');
    expect(d.illum).toBe(100);
    expect(d.fase).toBe('Luna llena');
  });

  it('deriva la amplitud si falta y tolera coma decimal, HHMM y días de solo 2 eventos', () => {
    store.globalData = [M({
      Fecha: '06/06/2026', 'Tipo de Marea': 'muerta',
      'Pleamar 1': '0730', 'Altura P1 (m)': '2,20', // HHMM + coma decimal
      'Bajamar 1': '13:47', 'Altura B1 (m)': '0,50',
      // sin Pleamar 2 / Bajamar 2 · sin Amplitud → derivada
    })];
    const d = mareaDays()[0];
    expect(d.events.length).toBe(2);
    expect(d.events[0].label).toBe('07:30');
    expect(d.pmax).toBeCloseTo(2.20, 5);
    expect(d.bmin).toBeCloseTo(0.50, 5);
    expect(d.amp).toBeCloseTo(1.70, 5); // 2.20 - 0.50
    expect(d.tipo).toBe('Muerta');
  });

  it('ignora filas sin fecha válida y ordena los días ascendente', () => {
    store.globalData = [
      M({ Fecha: '10/06/2026', 'Pleamar 1': '05:00', 'Altura P1 (m)': '2.0' }),
      M({ Fecha: '', 'Pleamar 1': '05:00', 'Altura P1 (m)': '2.0' }), // sin fecha → ignorada
      M({ Fecha: '02/06/2026', 'Pleamar 1': '05:00', 'Altura P1 (m)': '2.1' }),
    ];
    const days = mareaDays();
    expect(days.length).toBe(2);
    expect(days[0].d.getTime()).toBeLessThan(days[1].d.getTime());
  });
});

describe('mareas · estadísticos del mes', () => {
  const day = (fecha, amp, pmax, bmin, tipo) => M({
    Fecha: fecha, 'Tipo de Marea': tipo, 'Amplitud (m)': String(amp),
    'Pleamar 1': '05:00', 'Altura P1 (m)': String(pmax),
    'Bajamar 1': '11:00', 'Altura B1 (m)': String(bmin),
  });

  it('calcula promedio, máx/mín con su día, extremos absolutos y régimen', () => {
    store.globalData = [
      day('01/06/2026', 1.20, 2.00, 0.80, 'Muerta'),
      day('02/06/2026', 1.80, 2.40, 0.60, 'Viva'),
      day('03/06/2026', 1.50, 2.10, 0.55, 'Viva'),
    ];
    const s = monthStats(mareaDays());
    expect(s.dias).toBe(3);
    expect(s.ampProm).toBeCloseTo(1.5, 5);
    expect(s.ampMax).toBeCloseTo(1.8, 5);
    expect(s.ampMaxDia).toBe(2);   // el día 2 tiene la amplitud mayor
    expect(s.ampMin).toBeCloseTo(1.2, 5);
    expect(s.ampMinDia).toBe(1);
    expect(s.pleamarMax).toBeCloseTo(2.40, 5);
    expect(s.bajamarMin).toBeCloseTo(0.55, 5);
    expect(s.viva).toBe(2);
    expect(s.muerta).toBe(1);
  });

  it('sin datos devuelve null, no NaN ni -Infinity', () => {
    // Math.max(...[]) daría -Infinity: el mes vacío debe rendirse como "—".
    const s = monthStats([]);
    expect(s.dias).toBe(0);
    [s.ampProm, s.ampMax, s.ampMin, s.pleamarMax, s.bajamarMin].forEach((v) => expect(v).toBe(null));
    expect(s.ampMaxDia).toBe(null);
  });

  it('tolera días sin amplitud registrada', () => {
    store.globalData = [
      day('01/06/2026', 1.20, 2.00, 0.80, 'Viva'),
      M({ Fecha: '02/06/2026', 'Tipo de Marea': 'Viva' }), // sin lecturas → sin amp/pmax/bmin
    ];
    const s = monthStats(mareaDays());
    expect(s.dias).toBe(2);
    expect(s.ampProm).toBeCloseTo(1.20, 5); // promedia solo los días con dato
    expect(s.ampMaxDia).toBe(1);
  });
});

describe('mareas · correlación (Pearson)', () => {
  it('r = 1 para relación lineal perfecta creciente; -1 para decreciente', () => {
    expect(pearson([[1, 2], [2, 4], [3, 6], [4, 8]])).toBeCloseTo(1, 6);
    expect(pearson([[1, 8], [2, 6], [3, 4], [4, 2]])).toBeCloseTo(-1, 6);
  });
  it('r ≈ 0 sin relación y null si no hay varianza o hay < 2 pares', () => {
    expect(Math.abs(pearson([[1, 5], [2, 5], [3, 5], [4, 5]]) ?? 0)).toBe(0); // y constante → sin varianza → null→0
    expect(pearson([[1, 5], [2, 5]])).toBe(null); // varianza cero en y
    expect(pearson([[1, 2]])).toBe(null);         // < 2 pares
  });
});

describe('mareas · Spearman (ρ sobre rangos)', () => {
  it('ρ = 1 en relación monótona NO lineal, donde Pearson se queda corto', () => {
    const mono = Array.from({ length: 12 }, (_, i) => [i - 6, Math.pow(i - 6, 3)]);
    expect(spearman(mono)).toBeCloseTo(1, 6);
    expect(pearson(mono)).toBeLessThan(0.95);   // Pearson penaliza la curvatura
  });
  it('ρ = -1 en relación monótona decreciente', () => {
    expect(spearman([[1, 90], [2, 40], [3, 12], [4, 3]])).toBeCloseTo(-1, 6);
  });
  it('empates: usa el rango PROMEDIO (no el orden de aparición)', () => {
    // x: 1,1,2,3 → rangos 1.5,1.5,3,4 ; y: 5,5,6,7 → idénticos ⇒ ρ = 1.
    expect(spearman([[1, 5], [1, 5], [2, 6], [3, 7]])).toBeCloseTo(1, 6);
    // Empates que NO se corresponden entre sí ⇒ ρ deja de ser perfecto.
    expect(spearman([[1, 5], [1, 6], [2, 5], [3, 7]])).toBeLessThan(1);
  });
  it('un outlier único infla Pearson pero NO Spearman', () => {
    const base = Array.from({ length: 11 }, (_, i) => [i % 3, (i * 7) % 5]);
    const withOutlier = [...base, [100, 100]];
    expect(pearson(withOutlier)).toBeGreaterThan(0.99);
    expect(Math.abs(spearman(withOutlier))).toBeLessThan(0.6);
  });
  it('null en los MISMOS casos que pearson (invariante r==null ⟺ ρ==null)', () => {
    expect(spearman([[1, 2]])).toBe(null);                    // < 2 pares
    expect(spearman([[1, 5], [2, 5], [3, 5]])).toBe(null);    // y constante → sin varianza
    expect(spearman([[7, 1], [7, 2], [7, 3]])).toBe(null);    // x constante
    // Sin varianza en crudo ⇒ todos los rangos iguales ⇒ tampoco hay varianza en rangos.
    [[[1, 2]], [[1, 5], [2, 5], [3, 5]], [[7, 1], [7, 2], [7, 3]]].forEach((p) => {
      expect(pearson(p) === null).toBe(spearman(p) === null);
    });
  });
});

describe('mareas · corrCandidate (cribado 🔎, NO prueba de significancia)', () => {
  it('marca solo con |r| y |ρ| ≥ 0.6, mismo signo y N ≥ 10', () => {
    expect(corrCandidate(0.8, 0.7, 12)).toBe(true);
    expect(corrCandidate(-0.8, -0.7, 12)).toBe(true);   // negativa consistente
  });
  it('no marca si Pearson y Spearman discrepan en signo', () => {
    expect(corrCandidate(0.8, -0.7, 20)).toBe(false);
  });
  it('no marca si alguno de los dos se queda bajo el umbral', () => {
    expect(corrCandidate(0.95, 0.3, 20)).toBe(false);   // caso del outlier único
    expect(corrCandidate(0.5, 0.9, 20)).toBe(false);
  });
  it('no marca con pocos días ni con coeficientes ausentes', () => {
    expect(corrCandidate(0.9, 0.9, 9)).toBe(false);     // N por debajo del mínimo
    expect(corrCandidate(null, 0.9, 20)).toBe(false);
    expect(corrCandidate(0.9, null, 20)).toBe(false);
  });
  it('NaN no marca (no se cuela por comparación con NaN)', () => {
    expect(corrCandidate(NaN, 0.9, 20)).toBe(false);
  });
});

/* ============================================================
   Extremos de amplitud con EMPATE. Ocurre de verdad: medido sobre la hoja cargada,
   en septiembre-2026 la amplitud máxima (2,15 m) se da los días 12 y 29, y la tarjeta
   mostraba sólo el 12, sugiriendo un día único.
   ============================================================ */
describe('monthStats · días que alcanzan el extremo de amplitud', () => {
  const day = (dia, amp) => ({ d: new Date(2026, 8, dia), amp, pmax: null, bmin: null, tipo: '' });

  it('devuelve TODOS los días empatados en el máximo', () => {
    const s = monthStats([day(12, 2.15), day(20, 1.80), day(29, 2.15)]);
    expect(s.ampMax).toBe(2.15);
    expect(s.ampMaxDias).toEqual([12, 29]);
  });

  it('y todos los empatados en el mínimo', () => {
    const s = monthStats([day(3, 1.10), day(15, 1.90), day(27, 1.10)]);
    expect(s.ampMin).toBe(1.10);
    expect(s.ampMinDias).toEqual([3, 27]);
  });

  it('sin empate devuelve un solo día en la lista', () => {
    const s = monthStats([day(5, 1.20), day(9, 2.40)]);
    expect(s.ampMaxDias).toEqual([9]);
    expect(s.ampMinDias).toEqual([5]);
  });

  it('conserva `ampMaxDia`/`ampMinDia` como el PRIMER día (contrato anterior)', () => {
    const s = monthStats([day(12, 2.15), day(29, 2.15)]);
    expect(s.ampMaxDia).toBe(12);
  });

  it('sin días o sin amplitudes no revienta', () => {
    const s = monthStats([]);
    expect(s.ampMax).toBeNull();
    expect(s.ampMaxDias).toEqual([]);
    expect(s.dias).toBe(0);
  });
});

/* 0r (2026-09-28, usuario) · la luna tiene que dibujar la fase que dice la hoja. Medido en Chrome: sólo 0, 50 y 100 % salían
   bien; en las demás la sombra iba INVERTIDA («Gibosa menguante 95 %» salía toda oscura). Se mide la GEOMETRÍA del trazado de
   la sombra —el semicírculo del lado oscuro y la semielipse de vuelta—, no cómo se escribe: la fracción OSCURA del disco tiene
   que ser 1 − iluminación, y la luz, del lado de su fase (creciente a la izquierda, menguante a la derecha: la convención que
   ya tenía el dibujo, la del cielo de Anconcito, al sur del ecuador). */
describe('mareas · la luna dibuja la fase que dice la hoja', () => {
  const R = 46;
  /** ¿El punto (u, v) —desde el centro— cae en la sombra que traza el SVG? null = el SVG no tiene sombra que medir. */
  const oscuroEn = (svg) => {
    const conLuz = svg.includes('url(#mMoonG)');
    const m = /d="M [\d.]+ [\d.]+ A [\d.]+ [\d.]+ 0 [01] ([01]) [\d.]+ [\d.]+ A ([\d.]+) [\d.]+ 0 [01] ([01]) /.exec(svg);
    if (!m) return () => !conLuz;
    const lado1 = m[1] === '1' ? 1 : -1;   // de arriba abajo en sentido horario = por la DERECHA
    const ex = Number(m[2]);
    const lado2 = m[3] === '1' ? -1 : 1;   // de abajo arriba en sentido horario = por la IZQUIERDA
    return (u, v) => {
      if (!conLuz) return true;   // sin el disco iluminado debajo, todo es sombra
      const w = Math.sqrt(R * R - v * v), we = ex * Math.sqrt(1 - (v * v) / (R * R)), x = lado1 * u;
      return lado1 === lado2 ? x >= we && x <= w : x >= -we && x <= w;
    };
  };
  const fraccionOscura = (osc) => {
    let n = 0, o = 0;
    for (let i = -R + 0.25; i < R; i += 0.5) for (let j = -R + 0.25; j < R; j += 0.5) {
      if (i * i + j * j > R * R) continue;
      n++; if (osc(i, j)) o++;
    }
    return o / n;
  };
  it.each([
    ['Creciente', 25, 'izq'], ['Cuarto creciente', 50, 'izq'], ['Gibosa creciente', 75, 'izq'], ['Gibosa creciente', 90, 'izq'],
    ['Menguante', 25, 'der'], ['Cuarto menguante', 50, 'der'], ['Gibosa menguante', 75, 'der'], ['Gibosa menguante', 95, 'der'],
  ])('%s %i %%: la sombra cubre 1 − iluminación y la luz queda a la %s', (fase, il, luz) => {
    const osc = oscuroEn(mareaMoonSVG(fase, il));
    expect(fraccionOscura(osc)).toBeCloseTo(1 - il / 100, 1);
    const s = luz === 'izq' ? -1 : 1;
    expect(osc(s * 0.9 * R, 0), 'el borde del lado iluminado').toBe(false);
    expect(osc(-s * 0.97 * R, 0), 'el borde del otro lado').toBe(true);
  });
  it('luna nueva: toda oscura; llena: toda iluminada', () => {
    expect(fraccionOscura(oscuroEn(mareaMoonSVG('Luna nueva', 0)))).toBe(1);
    expect(fraccionOscura(oscuroEn(mareaMoonSVG('Luna llena', 100)))).toBe(0);
  });
  /* 0v·1 (2026-09-29, usuario) · el 🗓 Calendario pinta una luna por día: con los ids de siempre, 30 lunas repetirían
     «mMoonG» en la página. La pequeña lleva los suyos y la MISMA geometría; la de siempre no cambia. */
  it('🔴 0v·1 · la luna pequeña del calendario: su tamaño, sus propios ids y la misma geometría; la de siempre, igual', () => {
    const grande = mareaMoonSVG('Gibosa creciente', 75);
    const chica = mareaMoonSVG('Gibosa creciente', 75, { px: 30, id: 'mMoonC26' });
    expect(grande).toContain('width="108" height="108"');
    expect(grande).toContain('id="mMoonG"');
    expect(grande).toContain('clip-path="url(#mMoonClip)"');
    expect(chica).toContain('width="30" height="30"');
    for (const id of ['mMoonC26G', 'mMoonC26Clip', 'mMoonC26Soft']) {
      expect(chica).toContain(`id="${id}"`);
      expect(chica).toContain(`url(#${id})`);
    }
    expect(chica).not.toMatch(/"mMoon(G|Clip|Soft)"|#mMoon(G|Clip|Soft)\)/);
    const trazo = (svg) => /<path d="([^"]+)"/.exec(svg)[1];
    expect(trazo(chica), 'la misma sombra').toBe(trazo(grande));
  });
});

/* 0v·1 (2026-09-29, usuario) · 🗓 el calendario lunar de un mes (pestaña de 🌊 Mareas en Maduración): semanas de LUNES a
   domingo con TODOS los días del mes; cada día con lo que trae la hoja «Marea» o sin dato (nada se calcula: una sola
   fuente, INOCAR). Septiembre de 2026 empieza en martes, junio en lunes y noviembre en DOMINGO. */
describe('mareas · 🗓 el calendario de un mes (0v·1)', () => {
  const dias = () => {
    store.globalData = [
      M({ Fecha: '15/09/2026', 'Fase Lunar': 'Luna nueva', '%Iluminación': '1', 'Tipo de Marea': 'Viva' }),
      M({ Fecha: '16/09/2026', 'Fase Lunar': 'Creciente', '%Iluminación': '8', 'Tipo de Marea': 'Viva' }),
      M({ Fecha: '18/09/2026', 'Fase Lunar': 'Cuarto creciente', '%Iluminación': '45', 'Tipo de Marea': 'Muerta' }),
      M({ Fecha: '25/09/2026', 'Fase Lunar': 'Luna llena', '%Iluminación': '99', 'Tipo de Marea': 'Viva' }),
      M({ Fecha: '30/09/2026', 'Fase Lunar': 'Gibosa menguante', '%Iluminación': '83', 'Tipo de Marea': 'Muerta' }),
      M({ Fecha: '04/09/2026', 'Fase Lunar': 'Cuarto menguante', '%Iluminación': '47', 'Tipo de Marea': 'Muerta' }),
      M({ Fecha: '31/08/2026', 'Fase Lunar': 'Menguante', '%Iluminación': '90', 'Tipo de Marea': 'Viva' }),
    ];
    return mareaDays();
  };

  it('🔴 todos los días del mes, en semanas de lunes a domingo; lo de fuera del mes, vacío', () => {
    const c = calendarioDelMes(dias(), '2026-09', '2026-09-29');
    expect(c.semanas).toHaveLength(5);
    expect(c.semanas.every((s) => s.length === 7)).toBe(true);
    const celdas = c.semanas.flat();
    expect(celdas[0], 'el lunes 31/08 es de otro mes').toBeNull();
    expect(celdas[1].key).toBe('2026-09-01');
    expect(celdas.filter(Boolean).map((x) => x.dia)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(celdas.slice(31).every((x) => x === null), 'el resto de la última semana').toBe(true);
    expect([c.conDato, c.sinDato]).toEqual([6, 24]);
  });

  it('🔴 cada día con su fase, su % y su marea; sin fila, sin dato (nada calculado); hoy, marcado', () => {
    const c = calendarioDelMes(dias(), '2026-09', '2026-09-29');
    const de = (d) => c.semanas.flat().find((x) => x && x.dia === d);
    expect(de(15)).toMatchObject({ key: '2026-09-15', conDato: true, fase: 'Luna nueva', illum: 1, tipo: 'Viva', hoy: false });
    expect(de(18)).toMatchObject({ conDato: true, fase: 'Cuarto creciente', illum: 45, tipo: 'Muerta' });
    expect(de(17)).toMatchObject({ key: '2026-09-17', conDato: false, fase: '', illum: null, tipo: '' });
    expect(de(29)).toMatchObject({ conDato: false, hoy: true });
    expect(c.semanas.flat().filter((x) => x && x.hoy)).toHaveLength(1);
  });

  it('🔴 las cuatro fases principales llevan su nombre corto; las demás, ninguno', () => {
    const c = calendarioDelMes(dias(), '2026-09', '2026-09-29');
    const corto = (d) => c.semanas.flat().find((x) => x && x.dia === d).principal;
    expect([corto(15), corto(18), corto(25), corto(4)]).toEqual(['Nueva', 'C. creciente', 'Llena', 'C. menguante']);
    expect([corto(16), corto(30), corto(17)]).toEqual(['', '', '']);
  });

  it('🔴 un mes que empieza en lunes no deja hueco; uno que empieza en domingo deja seis', () => {
    const junio = calendarioDelMes(dias(), '2026-06', '2026-09-29');
    expect(junio.semanas[0][0].key).toBe('2026-06-01');
    expect(junio.semanas).toHaveLength(5);
    expect([junio.conDato, junio.sinDato]).toEqual([0, 30]);
    const nov = calendarioDelMes(dias(), '2026-11', '2026-09-29');
    expect(nov.semanas[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(nov.semanas[0][6].key).toBe('2026-11-01');
    expect(nov.semanas).toHaveLength(6);
  });

  it('🔑 sólo los días de ESE mes (el 31/08 no entra en septiembre)', () => {
    const c = calendarioDelMes(dias(), '2026-08', '2026-09-29');
    expect(c.semanas.flat().filter((x) => x && x.conDato).map((x) => x.key)).toEqual(['2026-08-31']);
  });
});
