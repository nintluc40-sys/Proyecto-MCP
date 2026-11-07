// @vitest-environment happy-dom
// Auditoría de cierre de la vista Visitante — defectos hallados leyendo el código y
// CONFIRMADOS POR MEDICIÓN antes de corregirlos:
//   · C-01 el memo de la vista ignoraba los umbrales de laboratorio (localStorage): tras
//     editar «⚙️ Rangos» en Microbiología, Visitante seguía mostrando el WQI y el % en
//     rango calculados con los umbrales ANTERIORES hasta el siguiente refresco de datos.
//   · C-02 con muchas muestras y muy pocas alertas el redondeo daba «0 % en alerta» en un
//     chip ÁMBAR, contradiciendo su propio color y el conteo de al lado.
//   · C-03 «Análisis realizados / muestras de laboratorio» contaba SOLO biología molecular
//     mientras la misma pantalla listaba además microbiología y calidad de agua.
// Verificadas por mutación: revirtiendo cada corrección en el código real, cada prueba se
// pone en rojo. Ver `feedback_fixtures-que-no-prueban-nada`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

// happy-dom no expone localStorage en este entorno y las capas de laboratorio lo leen en
// CADA cálculo: se instala un doble mínimo ANTES de importarlas.
const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => { _ls.set(k, String(v)); },
  removeItem: (k) => { _ls.delete(k); },
  clear: () => { _ls.clear(); },
};

const { store } = await import('../../core/store.js');
const { visitanteView } = await import('./index.js');
const { loadCalRanges, CAL_RANGES_KEY } = await import('../microbiologia/calagua.data.js');

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
// Corrida 544 → mes interno 0; fechas de junio/2026 → mes-calendario del laboratorio.
const base = () => [
  L({ 'Módulo': 'M01', Corrida: '544', Tanque: 'TQ1', Fecha: '01/06/2026', 'Población': '1000000' }),
  L({ 'Módulo': 'M01', Corrida: '544', Tanque: 'TQ1', Fecha: '11/06/2026', 'Población': '800000' }),
];
const aguaPh8 = () => ({ _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '10/06/2026', Corrida: '544', 'pH': '8.0' });
const micro = (extra = {}) => ({ _SheetOrigin: 'Microbiología', 'Fecha muestreo': '10/06/2026', Corrida: '544', ...extra });

let root;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  _ls.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); _ls.clear(); });

const abrirDetalle = (key) => {
  click(root.querySelector(`[data-sum="${key}"]`));
  return document.getElementById('vtSumBody').textContent;
};

describe('C-01 · los umbrales de laboratorio editados se reflejan al volver a la vista', () => {
  it('control: la capa de datos SÍ ve el cambio de rangos', () => {
    expect(loadCalRanges().ph).toEqual({ min: 7.5, max: 8.5 });
    localStorage.setItem(CAL_RANGES_KEY, JSON.stringify({ ph: { min: 9, max: 10 } }));
    expect(loadCalRanges().ph).toEqual({ min: 9, max: 10 });
  });

  it('con los MISMOS datos, cambiar los rangos cambia el WQI y el % en rango', () => {
    // Identidad de array constante: sin esto el memo se invalidaría por otra vía y la
    // prueba pasaría aunque el defecto siguiera ahí (no discriminaría).
    store.globalData = [...base(), aguaPh8()];

    visitanteView(root);
    expect(abrirDetalle('labAgua')).toContain('100% de parámetros en rango');
    click(document.getElementById('vtSumClose'));

    // El técnico edita los rangos objetivo en Microbiología: con pH 9–10, un 8.0 queda FUERA.
    localStorage.setItem(CAL_RANGES_KEY, JSON.stringify({ ph: { min: 9, max: 10 } }));

    visitanteView(root); // vuelve a entrar en Visitante
    const despues = abrirDetalle('labAgua');
    expect(despues).toContain('0% de parámetros en rango');
    expect(despues).not.toContain('100% de parámetros en rango');
  });
});

describe('C-02 · el porcentaje en alerta no se contradice con su semáforo', () => {
  // 201 muestras y UNA sola en alerta ⇒ 0,49 % ⇒ redondeaba a 0.
  const muchas = (nAlerta) => {
    const rows = [];
    for (let i = 0; i < 201; i++) {
      rows.push(micro(i < nAlerta ? { 'V.Amarillos Nivel': 'Elevado' } : { 'V.Amarillos Nivel': 'Mínimo' }));
    }
    return rows;
  };

  it('una alerta entre 201 muestras se anuncia como «<1%», no como «0%»', () => {
    store.globalData = [...base(), ...muchas(1)];
    visitanteView(root);
    const card = root.querySelector('[data-sum="labMicro"]');
    expect(card.textContent).toContain('<1% en alerta');
    expect(card.textContent).not.toContain('0% en alerta');
    expect(card.textContent).toContain('1 en nivel alto'); // el conteo real no cambia
  });

  it('sin ninguna alerta sigue diciendo «0%» en verde (no se pasa de corrección)', () => {
    store.globalData = [...base(), ...muchas(0)];
    visitanteView(root);
    const card = root.querySelector('[data-sum="labMicro"]');
    expect(card.textContent).toContain('0% en alerta');
    expect(card.textContent).not.toContain('<1%');
  });
});

/* A29 (2026-11-06, usuario: «La de Microbiología») · el rojo de la alerta micro empieza en la cota de config.js (15 %), la
   misma de Microbiología; antes, en el 20 %: un 18 % era ámbar aquí y «crítico» allí. Y el panel dice el mes de calendario
   de sus muestras (la regla V2 toma el de la moda; el título sólo decía el mes de producción). */
describe('A29 · el panel 🧫 de Visitante: la cota de la alerta y el mes de sus muestras', () => {
  const conAlertas = (nAlerta, total) => {
    const rows = [];
    for (let i = 0; i < total; i++) rows.push(micro(i < nAlerta ? { 'V.Amarillos Nivel': 'Elevado' } : { 'V.Amarillos Nivel': 'Mínimo' }));
    return rows;
  };
  const chip = () => root.querySelector('[data-sum="labMicro"]').innerHTML;

  it('🔴 18 % en alerta es ROJO (antes, ámbar); 10 % sigue ámbar', () => {
    store.globalData = [...base(), ...conAlertas(9, 50)];   // 18 %
    visitanteView(root);
    expect(chip()).toContain('🔴 18% en alerta');
    store.globalData = [...base(), ...conAlertas(5, 50)];   // 10 %
    visitanteView(root);
    expect(chip()).toContain('🟡 10% en alerta');
  });

  it('el borde es el de config.js: 15 % ya es rojo; 14 %, ámbar', () => {
    store.globalData = [...base(), ...conAlertas(15, 100)];
    visitanteView(root);
    expect(chip()).toContain('🔴 15% en alerta');
    store.globalData = [...base(), ...conAlertas(14, 100)];
    visitanteView(root);
    expect(chip()).toContain('🟡 14% en alerta');
  });

  it('🔴 una corrida de Algas escrita como rango («544-545») cuenta en el mes de la 544 (antes, en ninguno)', () => {
    const alga = (cel) => ({ _SheetOrigin: 'Lab_Algas', Corrida_Larv: '544-545', Modulo_Larv: 'M01', Sistema: 'M1', Fecha: '04/06/2026', Cel_ml: String(cel), Protozoarios: '2', Descartado: 'No' });
    store.globalData = [...base(), alga(20000), alga(30000)];
    visitanteView(root);
    const t = [...root.querySelectorAll('.vt-card-title')].find((x) => x.textContent.includes('Microalgas'));
    expect(t, 'el bloque de microalgas sale en el mes de la 544').toBeTruthy();
    expect(root.textContent).toContain('densidad prom.');
  });

  it('🔴 una revisión de supervisión con la corrida escrita como rango («544-545») cuenta en el mes de la 544', () => {
    const rev = (corrida, obs) => ({ _SheetOrigin: 'Registro_Supervision', 'Módulo': 'M01', Corrida: corrida, Fecha: '05/06/2026', Observaciones: obs });
    store.globalData = [...base(), rev('544-545', 'Malla rota'), rev('544-545', 'Fuga en la línea')];
    visitanteView(root);
    const card = root.querySelector('[data-sum="revisiones"]');
    expect(card, 'la tarjeta de revisiones sale').toBeTruthy();
    expect(card.textContent).not.toContain('Sin revisiones');
    expect(card.textContent).not.toContain('Sin novedades');   // sus hallazgos cuentan: están en el mes
    // y en el MISMO mes que la corrida 544 (con la lectura vieja, «544545», iban a un mes virtual lejano, sin módulos)
    expect(root.querySelector('[data-sum="cobertura"]').textContent.replace(/\s+/g, ' ')).toContain('1 de 1 módulos revisados');
  });

  it('el título dice el mes de calendario de las muestras', () => {
    store.globalData = [...base(), ...conAlertas(0, 3)];
    visitanteView(root);
    const t = [...root.querySelectorAll('.vt-card-title')].find((x) => x.textContent.includes('Laboratorio de agua y sanidad'));
    expect(t.textContent).toContain('· muestras de junio 2026');
  });
});

describe('C-04 · «Sin novedad» no puntúa peor que dejarlo en blanco', () => {
  const rev = (obs) => ({ _SheetOrigin: 'Registro_Supervision', 'Módulo': 'M01', Corrida: '544', Fecha: '05/06/2026', Observaciones: obs });
  const tarjeta = (rows) => { store.globalData = [...base(), ...rows]; visitanteView(root); return root.querySelector('[data-sum="revisiones"]').textContent; };

  it('declarar «nada que reportar» da el MISMO semáforo que la casilla vacía', () => {
    const enBlanco = tarjeta([rev(''), rev(''), rev('')]);
    expect(enBlanco).toContain('Sin novedades');
    ['Sin novedad', 'SIN NOVEDADES.', 'Ninguna', 'ok', 'N/A'].forEach((txt) => {
      expect(tarjeta([rev(txt), rev(txt), rev(txt)])).toContain('Sin novedades');
    });
  });

  it('un hallazgo REAL sigue contando (no se silencia todo)', () => {
    const t = tarjeta([rev('Tanque con espuma'), rev('Malla rota'), rev('Fuga en la línea')]);
    expect(t).not.toContain('Sin novedades');
  });

  it('mezclar «sin novedad» con un hallazgo real deja solo el hallazgo en el detalle', () => {
    store.globalData = [...base(), rev('Sin novedad, malla rota')];
    visitanteView(root);
    const detalle = abrirDetalle('revisiones');
    expect(detalle).toContain('malla rota');
    expect(detalle).not.toContain('Sin novedad');
  });
});

describe('C-03 · la tarjeta de análisis no promete más de lo que cuenta', () => {
  it('cuenta biología molecular y se rotula como tal, con micro y agua en pantalla', () => {
    store.globalData = [
      ...base(), aguaPh8(),
      micro(), micro(),
      { _SheetOrigin: 'Biomol', Corrida: '544', Fecha: '10/06/2026', IHHNV: 'Negativo' },
    ];
    visitanteView(root);
    const card = root.querySelector('[data-sum="analisis"]');
    // Sigue contando 1 (solo Biomol): la cifra no cambió, cambió lo que promete el rótulo.
    expect(card.textContent).toContain('1');
    expect(card.textContent).not.toContain('muestras de laboratorio');
    // …mientras la misma pantalla exhibe 2 de microbiología y 1 de agua, que NO están ahí.
    expect(root.querySelector('[data-sum="labMicro"]').textContent).toContain('2 muestra(s)');
    expect(root.querySelector('[data-sum="labAgua"]').textContent).toContain('1 muestra(s)');
  });
});
