import { describe, it, expect, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { presentMonths } from '../../core/prodCalendar.js';
import { prodTableHTML } from './prodOmarsa.js';

afterEach(() => { store.globalData = []; });

// Fila de Larvicultura ("Datos Larvicultura"). `desp` añade columnas de la ficha
// de Despacho (Destino/Biomasa) → marca el módulo+corrida como despachado.
const row = (mod, cor, tq, pob, fecha, desp = false) => ({
  _SheetOrigin: 'Larvicultura', 'Módulo': mod, Corrida: cor, Tanque: tq,
  'Población': String(pob), Fecha: fecha,
  ...(desp ? { 'Destino': 'Piscina 4', 'Biomasa': '10' } : {}),
});

// Fila con la columna «Toneladas» (la última de "Datos Larvicultura", la escribe la ficha
// de Calidad de Agua). `ton` a null deja la celda vacía, que es como están hoy las hojas.
const rowTon = (mod, cor, tq, pob, fecha, ton) => ({
  ...row(mod, cor, tq, pob, fecha),
  ...(ton === null || ton === undefined ? {} : { Toneladas: String(ton) }),
});

describe('prodTableHTML · fila "Subtotal actual" (despachados)', () => {
  it('aparece entre la corrida despachada y la pendiente, sin igualar al Total', () => {
    // Corrida 579 (M06) despachada · Corrida 580 (M08) pendiente. Ambas = mes Julio.
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026', true),
      row('M08', '580', 'TQ1', 2000, '01/07/2026'),
      row('M08', '580', 'TQ1', 1500, '10/07/2026'),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).toContain('Subtotal actual');
    // Ubicación: tras M06 (despachado) y antes de M08 (pendiente).
    expect(html.indexOf('M06')).toBeLessThan(html.indexOf('Subtotal actual'));
    expect(html.indexOf('Subtotal actual')).toBeLessThan(html.indexOf('M08'));
  });

  it('NO aparece cuando TODAS las corridas están despachadas (sería igual al Total)', () => {
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026', true),
      row('M08', '580', 'TQ1', 2000, '01/07/2026'),
      row('M08', '580', 'TQ1', 1500, '10/07/2026', true),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).not.toContain('Subtotal actual');
  });

  it('NO aparece si el subtotal IGUALA numéricamente al Total aunque queden corridas pendientes (sin siembra/cosecha)', () => {
    // 579 (M06) despachada con datos · 580 (M08) pendiente PERO sin población (no aporta
    // siembra ni cosecha) → subtotal == total → la franja sería redundante y desaparece.
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026', true),
      row('M08', '580', 'TQ1', 0, '01/07/2026'),
      row('M08', '580', 'TQ1', 0, '10/07/2026'),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).not.toContain('Subtotal actual');
  });

  it('aparece aunque la corrida despachada NO sea el prefijo inicial (suma solo las despachadas)', () => {
    // 579 (M06) PENDIENTE · 580 (M08) DESPACHADA → el subtotal debe aparecer igual,
    // ubicado tras M08 (la última despachada), no ausente por no ser prefijo contiguo.
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026'),
      row('M08', '580', 'TQ1', 2000, '01/07/2026'),
      row('M08', '580', 'TQ1', 1500, '10/07/2026', true),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).toContain('Subtotal actual');
    expect(html.indexOf('M08')).toBeLessThan(html.indexOf('Subtotal actual'));
  });

  it('despacho PARCIAL de una corrida (no todos los tanques) NO la cuenta como despachada', () => {
    // 579 M06 con 2 tanques, solo TQ1 despachado → corrida NO despachada → sin subtotal.
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026', true),
      row('M06', '579', 'TQ2', 2000, '01/07/2026'),
      row('M06', '579', 'TQ2', 1500, '10/07/2026'),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).not.toContain('Subtotal actual');
  });

  it('NO aparece cuando NINGUNA corrida está despachada', () => {
    store.globalData = [
      row('M06', '579', 'TQ1', 1000, '01/07/2026'),
      row('M06', '579', 'TQ1', 700, '10/07/2026'),
      row('M08', '580', 'TQ1', 2000, '01/07/2026'),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).not.toContain('Subtotal actual');
  });
});

// El panel configurable de toneladas por mes se retiró (decisión del usuario, 2026-08-05)
// y el tonelaje pasó a registrarse como un dato más de la operación (columna «Toneladas»).
// Este bloque vigila que no reaparezca ningún resto de aquel panel.
describe('prodTableHTML · sin configuración de toneladas', () => {
  const datos = () => [
    row('M06', '579', 'TQ1', 1000, '01/07/2026'),
    row('M06', '579', 'TQ2', 1200, '01/07/2026'),
    row('M08', '580', 'TQ1', 2000, '01/07/2026'),
  ];

  it('no renderiza el engranaje ⚙ ni el modal de toneladas', () => {
    store.globalData = datos();
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).not.toContain('data-prodgear');
    expect(html).not.toContain('data-ptmodal');
    expect(html).not.toContain('Toneladas por tanque');
    expect(html).not.toContain('data-pt-sec');
  });

  it('sin tonelaje registrado, la densidad usa el respaldo de 28 t', () => {
    store.globalData = [row('M06', '579', 'TQ1', 1000, '01/07/2026')];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    // 1 tanque con siembra 1000 y sin dato ⇒ 1000 / (1 × 28) / 1000 = 0,04
    expect(html).toContain('>0.04<');
  });
});

/* Densidad de siembra alimentada por la columna «Toneladas» (2026-08-18).
   Mientras la operación no la llene, TODOS los tanques caen al respaldo de 28 t y la tabla
   muestra exactamente lo que mostraba antes — eso lo vigila el caso de arriba. Aquí se
   comprueba lo otro: que en cuanto haya tonelaje, la estimación lo use.

   Los números están elegidos para que el resultado CON dato y SIN dato no coincidan al
   redondear a 2 decimales. Si coincidieran, la prueba pasaría sin distinguir nada. */
describe('prodTableHTML · la Dens. siembra se alimenta de «Toneladas»', () => {
  // La densidad es la única celda con el title de la densidad, así que se lee por él.
  const dens = (html) => {
    const m = html.match(/<td title="Σ siembra[^"]*">([^<]*)</);
    return m ? m[1] : null;
  };

  it('usa el tonelaje registrado el día de la siembra', () => {
    store.globalData = [rowTon('M06', '579', 'TQ1', 1000, '01/07/2026', 20)];
    const months = presentMonths();
    // 1000 / (20 × 1000) = 0,05 — con el respaldo de 28 t habría dado 0,04
    expect(dens(prodTableHTML(months, months.length - 1))).toBe('0.05');
  });

  it('el respaldo se aplica TANQUE A TANQUE, no al módulo entero', () => {
    store.globalData = [
      rowTon('M06', '579', 'TQ1', 1000, '01/07/2026', 10),
      rowTon('M06', '579', 'TQ2', 1000, '01/07/2026', null),
    ];
    const months = presentMonths();
    // 2000 / ((10 + 28) × 1000) = 0,0526 → 0,05. Con 28 t para los dos: 0,04; y
    // descartando el módulo por venir incompleto, también 0,04.
    expect(dens(prodTableHTML(months, months.length - 1))).toBe('0.05');
  });

  it('si el día de la siembra vino vacío, aprovecha otra medición del MISMO tanque', () => {
    store.globalData = [
      rowTon('M06', '579', 'TQ1', 1000, '01/07/2026', null),   // siembra, sin tonelaje
      rowTon('M06', '579', 'TQ1', 900, '05/07/2026', 15),      // medido días después
    ];
    const months = presentMonths();
    // 1000 / (15 × 1000) = 0,0667 → 0,07. Caer al respaldo daría 0,04: peor estimación
    // teniendo una medición real de ese mismo tanque.
    expect(dens(prodTableHTML(months, months.length - 1))).toBe('0.07');
  });

  it('manda el día de la siembra, no cualquier medición del tanque', () => {
    store.globalData = [
      rowTon('M06', '579', 'TQ1', 0, '01/07/2026', 40),        // tanque aún vacío
      rowTon('M06', '579', 'TQ1', 1000, '02/07/2026', 20),     // SIEMBRA (1ª población >0)
      rowTon('M06', '579', 'TQ1', 900, '05/07/2026', 40),      // se rellenó después
    ];
    const months = presentMonths();
    // Cuenta el tonelaje del día que se sembró: 1000 / (20 × 1000) = 0,05.
    // Con el primero del tanque, o con el último, saldría 1000 / (40 × 1000) = 0,03.
    expect(dens(prodTableHTML(months, months.length - 1))).toBe('0.05');
  });

  it('un tonelaje de 0 cae al respaldo en vez de romper la división', () => {
    store.globalData = [rowTon('M06', '579', 'TQ1', 1000, '01/07/2026', 0)];
    const months = presentMonths();
    expect(dens(prodTableHTML(months, months.length - 1))).toBe('0.04');
  });
});

describe('prodTableHTML · columna Fecha (siembra promedio del módulo)', () => {
  it('añade la cabecera Fecha y la tabla pasa a 11 columnas', () => {
    store.globalData = [row('M06', '579', 'TQ1', 1000, '01/07/2026')];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).toContain('<th>Fecha</th>');
    // `<th` sin cerrar: algunas cabeceras llevan title= y no casarían con `<th>`.
    const ths = (html.match(/<th[\s>]/g) || []).length;
    expect(ths).toBe(11); // 10 + la columna «PL/g» (Larvia) añadida el 2026-08-08
  });

  it('muestra la fecha promedio de siembra de los tanques del módulo', () => {
    // TQ1 siembra el 02/07 y TQ2 el 06/07 → promedio 04/07.
    store.globalData = [
      row('M06', '579', 'TQ1', 4000, '02/07/2026'),
      row('M06', '579', 'TQ2', 4200, '06/07/2026'),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    // fmtShort → "04 jul 26" (es-EC, día 2 dígitos + mes abreviado + año 2 dígitos).
    expect(html).toMatch(/>04\s+\S*jul\S*\s+26</i);
  });

  it('la fila "sin datos" abarca las 11 columnas', () => {
    store.globalData = [row('M06', '579', 'TQ1', 1000, '01/07/2026')];
    const months = presentMonths();
    store.globalData = [];
    const html = prodTableHTML(months, months.length - 1);
    expect(html).toContain('colspan="11"');
  });
});

// ── Columna «PL/g» (Larvia) ────────────────────────────────────────────────
// Lee la columna «Plg» del Sheet (biometría LARVIA, diaria) y la resume con la MISMA
// regla que PL/g (manual): última lectura >0 de cada tanque, promediada entre tanques.
describe('prodTableHTML · columna PL/g (Larvia)', () => {
  // `plg` = columna Plg (Larvia) · `plgm` = columna Plg (manual). Valores DISTINTOS a
  // propósito: si el código leyera la columna equivocada, la prueba lo delataría.
  const rowP = (mod, cor, tq, pob, fecha, plg, plgm) => ({
    _SheetOrigin: 'Larvicultura', 'Módulo': mod, Corrida: cor, Tanque: tq,
    'Población': String(pob), Fecha: fecha,
    ...(plg == null ? {} : { Plg: String(plg) }),
    ...(plgm == null ? {} : { 'Plg (manual)': String(plgm) }),
  });

  it('toma la ÚLTIMA lectura de cada tanque y promedia entre tanques', () => {
    store.globalData = [
      // TQ1: 210 → 168 (última) · TQ2: 205 → 172 (última) ⇒ (168+172)/2 = 170.0
      rowP('M06', '579', 'TQ1', 1000, '01/07/2026', 210, 90),
      rowP('M06', '579', 'TQ1', 900, '10/07/2026', 168, 95),
      rowP('M06', '579', 'TQ2', 1000, '01/07/2026', 205, 90),
      rowP('M06', '579', 'TQ2', 900, '10/07/2026', 172, 95),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).toContain('>170.0<');
    // Promediar TODAS las lecturas diarias daría 188.8 y el promedio por día 188.8/…:
    // ninguna de las dos debe aparecer.
    expect(html).not.toContain('>188.8<');
  });

  it('no se confunde con la columna PL/g (manual)', () => {
    store.globalData = [
      rowP('M06', '579', 'TQ1', 1000, '01/07/2026', 210, 90),
      rowP('M06', '579', 'TQ1', 900, '10/07/2026', 168, 95),
    ];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    // Larvia = 168.0 · manual = 95.0, cada uno en su columna.
    expect(html).toContain('>168.0<');
    expect(html).toContain('>95.0<');
    const iL = html.indexOf('>168.0<'), iM = html.indexOf('>95.0<');
    expect(iL).toBeLessThan(iM); // PL/g (Larvia) va ANTES de PL/g (manual)
  });

  it('la columna nueva va justo después de «Dens. siembra»', () => {
    store.globalData = [rowP('M06', '579', 'TQ1', 1000, '01/07/2026', 168, 95)];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    const head = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
    const orden = [...head.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]*>/g, '').trim());
    // El rótulo dice «(Larvia)» explícitamente: junto a «PL/g (manual)», un «PL/g» a secas
    // obligaba a pasar el ratón por encima para saber cuál era cuál, y es el MISMO indicador
    // que el KPI «PL/g (Larvia)» del Resumen Operativo (module.js).
    expect(orden.indexOf('PL/g (Larvia)')).toBe(orden.indexOf('Dens. siembra') + 1);
    expect(orden.indexOf('PL/g (manual)')).toBe(orden.indexOf('PL/g (Larvia)') + 1);
  });

  it('sin lecturas de Plg la celda queda en «—», no en 0', () => {
    store.globalData = [rowP('M06', '579', 'TQ1', 1000, '01/07/2026', null, 95)];
    const months = presentMonths();
    const html = prodTableHTML(months, months.length - 1);
    expect(html).not.toContain('>0.0<');
    expect(html).toContain('>95.0<'); // el manual sí se muestra
  });
});
