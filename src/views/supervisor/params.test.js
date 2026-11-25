import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { waterSemaforo, iclSeries, buildParamSection } from './params.js';

/* Punto 8 · en el panel «Diagnóstico por parámetros» del tanque: Manejo de agua con sólo el recambio (que no se juzga) era
   «✅ Normal». Cifras INVENTADAS. */
describe('punto 8 · Supervisor › Manejo de agua sin nada que juzgar', () => {
  const fila = (fecha, v) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '600', Tanque: 'TQ1', Fecha: fecha, 'Estadío': 'Z1', ...v });
  const cabecera = (html) => (html.match(/<div class="lv-grp-sem lv-grp-[a-z]+">\s*<span class="lv-grp-sem-status">💧[^]*?<\/div>/) || [''])[0];
  it('🔴 sólo con el recambio: franja gris «⚪ Sin datos», no «✅ Normal»', () => {
    const { html } = buildParamSection([fila('01/10/2026', { '% Recambio': '30' })], 'larv', [], null);
    const c = cabecera(html);
    expect(c).toContain('lv-grp-sin');
    expect(c).toContain('⚪ <b>Sin datos</b>');
    expect(c).not.toContain('Normal');
  });
  it('control: con espuma y suciedad en rango, verde «✅ Normal»', () => {
    const { html } = buildParamSection([fila('01/10/2026', { '% Espuma': '3', '% Suciedad': '4', '% Recambio': '30' })], 'larv', [], null);
    const c = cabecera(html);
    expect(c).toContain('lv-grp-verde');
    expect(c).toContain('✅ <b>Normal</b>');
  });
  it('el gris tiene su estilo, con los tonos neutros del tema (cambian en oscuro)', () => {
    const css = readFileSync(new URL('./supervisor.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.lv-grp-sin\s*\{\s*background: var\(--c-surface-2\); border-color: var\(--c-border\); color: var\(--c-text-soft\); \}/);
  });
});

describe('waterSemaforo', () => {
  it('todo en rango → verde', () => {
    expect(waterSemaforo(4, 5, 'ok').level).toBe('verde');
  });

  // Punto 8 (pauta del 12-11, usuario: «Sí, también Supervisor») · antes, sin nada que juzgar salía «✅ Normal».
  it('sin espuma, sin suciedad y sin color juzgado → «sin» (⚪ Sin datos), no verde', () => {
    expect(waterSemaforo(null, null, null)).toEqual({ level: 'sin', label: 'Sin datos', icon: '⚪' });
    expect(waterSemaforo(undefined, undefined, undefined).level).toBe('sin');
  });
  it('con el color juzgado (aunque falten espuma y suciedad) ya hay juicio', () => {
    expect(waterSemaforo(null, null, 'ok')).toEqual({ level: 'verde', label: 'Normal', icon: '✅' });
    expect(waterSemaforo(null, null, 'warn').level).toBe('rojo');
  });
  it('con una de las dos ya se juzga', () => {
    expect(waterSemaforo(4, null, null).level).toBe('verde');
    expect(waterSemaforo(null, 12, null).level).toBe('ambar');
  });

  it('una variable sobre umbral → ámbar', () => {
    expect(waterSemaforo(12, 5, 'ok').level).toBe('ambar');
    expect(waterSemaforo(4, 11, 'ok').level).toBe('ambar');
  });

  it('color de problema → rojo aunque espuma/suciedad estén bien', () => {
    expect(waterSemaforo(2, 3, 'warn').level).toBe('rojo');
  });

  it('espuma y suciedad ambas altas → rojo', () => {
    expect(waterSemaforo(11, 12, 'ok').level).toBe('rojo');
  });

  it('un valor muy alto (≥15) → rojo', () => {
    expect(waterSemaforo(16, 3, 'ok').level).toBe('rojo');
  });

  it('punto 28 · la Suciedad con la escala 5/15/30 (como Larvicultura); la Espuma sigue en 10/15', () => {
    const s = (x) => waterSemaforo(null, x, 'ok').level;
    expect([s(5), s(5.5), s(15), s(30), s(30.5)]).toEqual(['verde', 'ambar', 'ambar', 'ambar', 'rojo']);
    const e = (x) => waterSemaforo(x, null, 'ok').level;
    expect([e(9.9), e(10), e(15)]).toEqual(['verde', 'ambar', 'rojo']);
    expect(waterSemaforo(10, 6, 'ok').level).toBe('rojo');
  });

  it('punto 28 · la referencia de % Suciedad es ≤ 5 (Óptimo 0–5)', () => {
    const fila = (fecha, v) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '600', Tanque: 'TQ1', Fecha: fecha, 'Estadío': 'Z1', ...v });
    const cabecera = (html) => (html.match(/<div class="lv-grp-sem lv-grp-[a-z]+">\s*<span class="lv-grp-sem-status">💧[^]*?<\/div>/) || [''])[0];
    const { html } = buildParamSection([fila('01/10/2026', { '% Espuma': '3', '% Suciedad': '6', '% Recambio': '30' })], 'larv', [], null);
    expect(html).toContain('obj ≤ 5%');
    expect(cabecera(html)).toContain('lv-grp-ambar');
  });
});

describe('iclSeries · término SV (híbrido: rellena huecos con SV por población)', () => {
  const row = (fecha, pob, extra) => ({
    _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1',
    Fecha: fecha, 'Población': String(pob), 'Intestino_Lleno': '90', ...extra,
  });
  it('día CON columna cruda usa el valor crudo (no lo pisa la SV por población)', () => {
    // pob 1000 (base) → SV por población sería 100; pero hay SV cruda 80 → ICL = 80 + IL 90.
    const { values } = iclSeries([row('01/06/2026', 1000, { 'Supervivencia': '80' })]);
    expect(values[0]).toBeCloseTo(170, 6);
  });
  it('día SIN columna cruda se rellena con SV por población (no se descarta el término)', () => {
    const rows = [
      row('01/06/2026', 1000, { 'Supervivencia': '80' }), // base de población = 1000
      row('05/06/2026', 500),                              // sin Supervivencia → 500/1000×100 = 50
    ];
    const { values } = iclSeries(rows);
    expect(values[0]).toBeCloseTo(170, 6); // 80 (cruda) + 90 (IL)
    expect(values[1]).toBeCloseTo(140, 6); // 50 (población) + 90 (IL) — antes habría sido 90
  });
});

describe('iclSeries · reutiliza el agrupado por día de lvDaily', () => {
  const row = (extra) => ({
    _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1',
    'Supervivencia': '80', ...extra,
  });

  it('la supervivencia diaria sale del MISMO agrupado, sin reconstruirlo', () => {
    // Dos lecturas el mismo día + una en otro: el agrupado debe promediar por día, que es
    // justo lo que hace lvDaily. Antes iclSeries recorría `rows` una segunda vez para
    // rehacer un Map idéntico; tener el agrupado definido dos veces invita a que uno de
    // los dos derive.
    const { days, values } = iclSeries([
      row({ Fecha: '01/06/2026', 'Supervivencia': '80' }),
      row({ Fecha: '01/06/2026', 'Supervivencia': '90' }),
      row({ Fecha: '02/06/2026', 'Supervivencia': '70' }),
    ]);
    expect(days).toEqual(['01/06/2026', '02/06/2026']);
    expect(values[0]).toBeCloseTo(85, 6);   // promedio del día, no la última lectura
    expect(values[1]).toBeCloseTo(70, 6);
  });

  it('una fila sin fecha no entra en el agrupado ni desplaza los días', () => {
    const { days, values } = iclSeries([
      row({ Fecha: '', 'Supervivencia': '10' }),
      row({ Fecha: '01/06/2026', 'Supervivencia': '80' }),
    ]);
    expect(days).toEqual(['01/06/2026']);
    expect(values[0]).toBeCloseTo(80, 6);
  });
});

describe('iclSeries · el Estrés se escala a 0–100 antes de restar', () => {
  const row = (extra) => ({
    _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1',
    Fecha: '01/06/2026', 'Supervivencia': '80', ...extra,
  });

  it('un Estrés de 8/10 resta 80, no 8', () => {
    // Estrés es la única variable `kind: idx` (0–10); el resto son porcentajes 0–100.
    // Sumándolo en crudo, un estrés catastrófico pesaba lo mismo que un 8 % de deformidad.
    const sinEstres = iclSeries([row({})]).values[0];
    const conEstres = iclSeries([row({ 'Estrés': '8' })]).values[0];
    expect(sinEstres - conEstres).toBeCloseTo(80, 6);
  });

  it('el desglose muestra la CONTRIBUCIÓN escalada y la etiqueta lo advierte', () => {
    const { negByDay } = iclSeries([row({ 'Estrés': '8', 'Deformidad': '30' })]);
    const est = negByDay[0].find((x) => /Estrés/.test(x.label));
    expect(est.val).toBeCloseTo(80, 6);
    expect(est.label).toContain('×10');
    // Y por tanto ordena bien: 80 de estrés resta más que 30 de deformidad.
    expect(negByDay[0][0].label).toContain('Estrés');
  });

  it('las variables porcentuales siguen restando en crudo', () => {
    const base = iclSeries([row({})]).values[0];
    const conDef = iclSeries([row({ 'Deformidad': '12' })]).values[0];
    expect(base - conDef).toBeCloseTo(12, 6);
  });
});
