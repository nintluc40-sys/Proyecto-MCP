/* ============================================================
   SUPERVISOR · 🎯 Score en la sub-vista Despacho (punto 4 del usuario, 2026-10-03)

   Decisiones del usuario: KPI «Score promedio» + tabla por tanque; de varias evaluaciones de un tanque, la ÚLTIMA (con
   su fecha); y que la hoja «Registro_Score» se lea por su nombre y, sin título, por sus columnas —que no la reclamen
   Larvicultura (Módulo/Corrida) ni Patología en Fresco (Hepatopáncreas/Branquias)—.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { store } from '../../core/store.js';
import { classifyOrigin, detectSheetName } from '../../core/sheets.js';
import { renderDespacho } from './despacho.js';
import { scoreDelModulo, scorePromedio, scoreInterp, SCORE_INTERP, SCORE_COLOR } from './score.js';

const S = (o) => ({ _SheetOrigin: 'Registro_Score', Fecha: '02/10/2026', Laboratorio: 'Lab A', Camaronera: 'Taura', 'Módulo': 'M01',
  Corrida: '598', Tanque: '1', Score: '96', 'Interpretación': 'Muy buena calidad', 'Días de cultivo': '18', 'PL/gramo': '210',
  '% Sobrevivencia': '78', 'Prueba de estrés (%)': '95', 'Realizado por': 'Ana', ...o });

afterEach(() => { store.globalData = []; });

describe('Score · la tabla de interpretación es la del motor que la escribe', () => {
  it('SCORE_INTERP y SCORE_COLOR = los de public/registros/engine.js', () => {
    const motor = readFileSync(join(process.cwd(), 'public/registros/engine.js'), 'utf8');
    const interp = JSON.parse(/const SCORE_INTERP = (\[\[.*?\]\]);/.exec(motor)[1]);
    const color = JSON.parse(/const SCORE_COLOR\s*=\s*(\{.*?\});/.exec(motor)[1]);
    expect(SCORE_INTERP).toEqual(interp);
    expect(SCORE_COLOR).toEqual(color);
  });
  it('tramos 95 / 85 / 70', () => {
    expect([100, 95, 94.9, 85, 84, 70, 69, 0].map(scoreInterp)).toEqual(['Muy buena calidad', 'Muy buena calidad', 'Buena calidad',
      'Buena calidad', 'Calidad mejorable', 'Calidad mejorable', 'Calidad pobre', 'Calidad pobre']);
  });
});

describe('Score · las evaluaciones del módulo', () => {
  const FILAS = [
    S({ Tanque: '2', Fecha: '01/10/2026', Score: '80' }),
    S({ Tanque: '2', Fecha: '02/10/2026', Score: '90' }),            // la ÚLTIMA del TQ 2
    S({ Tanque: '1', Score: '96' }),
    S({ Tanque: '1', Score: '70', 'Realizado por': 'Luis' }),          // misma fecha: gana la que va DESPUÉS en la hoja
    S({ 'Módulo': 'M02', Tanque: '1', Score: '50' }),                  // otro módulo
    S({ Corrida: '597', Tanque: '1', Fecha: '20/09/2026', Score: '60' }),   // otra corrida
    { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '598', Tanque: 'TQ 1', Score: '1' },   // otra hoja
  ];

  it('con la corrida elegida: la última de cada tanque, en orden de tanque', () => {
    const ev = scoreDelModulo(FILAS, 'M01', '598');
    expect(ev.map((e) => [e.tanque, e.score, e.realizado])).toEqual([[1, 70, 'Luis'], [2, 90, 'Ana']]);
    expect(ev[1].fechaRaw).toBe('02/10/2026');
  });

  it('con «Todas las corridas»: la última de cada tanque EN CADA corrida', () => {
    expect(scoreDelModulo(FILAS, 'M01', null).map((e) => [e.corrida, e.tanque, e.score])).toEqual([['597', 1, 60], ['598', 1, 70], ['598', 2, 90]]);
  });

  it('el módulo se empareja por su número («Módulo 1» = «M01») y CIO por sus letras', () => {
    expect(scoreDelModulo([S({ 'Módulo': 'Módulo 1' })], 'M01', '598')).toHaveLength(1);
    expect(scoreDelModulo([S({ 'Módulo': 'CIO' })], 'CIO', '598')).toHaveLength(1);
    expect(scoreDelModulo([S({ 'Módulo': 'CIO' })], 'M01', '598')).toHaveLength(0);
  });

  it('el promedio, con su interpretación; sin Score, null', () => {
    const p = scorePromedio(scoreDelModulo(FILAS, 'M01', '598'));
    expect(p).toEqual({ media: 80, n: 2, interp: 'Calidad mejorable' });
    expect(scorePromedio([])).toBeNull();
  });
});

describe('Score · la hoja se reconoce (y no la reclaman Larvicultura ni Patología)', () => {
  const fila = Object.fromEntries(['Fecha', 'Laboratorio', 'Camaronera', 'Módulo', 'Corrida', 'Tanque', 'Actividad',
    'Hepatopáncreas · Lípidos', 'Branquias · Desarrollo', 'Score', 'Interpretación', 'Realizado por', 'ID'].map((h) => [h, '']));
  it('por su nombre, también con otra grafía', () => {
    expect(classifyOrigin('Registro_Score')).toBe('Registro_Score');
    expect(classifyOrigin('Registro Score')).toBe('Registro_Score');
    expect(classifyOrigin('registro_score')).toBe('Registro_Score');
  });
  it('sin título, por sus columnas', () => { expect(detectSheetName([fila], 7, '')).toBe('Registro_Score'); });
});

describe('Despacho · el 🎯 Score', () => {
  const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '598', Tanque: 'TQ 1', Fecha: '01/10/2026', 'Población': '1000', ...o });
  const ctx = { vState: { corrida: '598' }, allMods: ['M01'], larvCM: [L({})] };

  it('KPI «Score promedio» y una fila por tanque con su Score e interpretación', () => {
    store.globalData = [L({}), S({ Tanque: '1', Score: '96' }), S({ Tanque: '2', Score: '84', 'Interpretación': 'Calidad mejorable' })];
    const { html } = renderDespacho(ctx, 'M01');
    expect(html).toContain('Score promedio');
    expect(html).toContain('90,0');                                   // (96 + 84) / 2
    expect(html).toContain('Buena calidad · 2 tanque(s)');            // 90 → «Buena calidad» (85–94)
    const tabla = html.slice(html.indexOf('sv-score-table'));
    expect(tabla.match(/class="sv-score-row"/g)).toHaveLength(2);
    expect(tabla).toContain('TQ 2');
    expect(tabla).toContain('Calidad mejorable');
  });

  it('sin evaluaciones lo dice, y el KPI queda en «—»', () => {
    store.globalData = [L({})];
    const { html } = renderDespacho(ctx, 'M01');
    expect(html).toContain('Aún no hay evaluaciones de Score para M01 en la corrida 598');
    expect(html).toContain('sin evaluaciones');
  });
});
