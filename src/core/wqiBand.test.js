// Regresión de la banda del WQI, unificada el 2026-08-11.
//
// El defecto que estos tests cierran no es un cálculo malo: es DERIVA. Los cortes
// 85/70/50 vivían copiados en cuatro sitios y, el peor, disueltos en los anchos de
// arco del medidor de Visitante como [50, 20, 15, 15] — ahí el 85 no aparecía por
// ningún lado, estaba escondido dentro de un 15, así que un grep jamás lo hallaba.
// Mover un umbral en la etiqueta y no en las zonas descuadraba el medidor en
// silencio: la aguja decía «Óptimo» sobre un arco todavía amarillo, sin fallo.
//
// Por eso el test central no comprueba números literales (eso lo pasaría también
// una copia desincronizada) sino la COHERENCIA entre las dos derivaciones.
import { describe, it, expect } from 'vitest';
import { wqiBand, wqiSpans } from './format.js';
import { THRESHOLDS } from '../config.js';
import { calRiskLevel } from '../views/microbiologia/calagua.data.js';

describe('wqiBand · cortes de la banda', () => {
  it('clasifica cada banda en su cota inferior exacta', () => {
    expect(wqiBand(100).sev).toBe('optimo');
    expect(wqiBand(85).sev).toBe('optimo');
    expect(wqiBand(70).sev).toBe('vigilancia');
    expect(wqiBand(50).sev).toBe('fuera');
    expect(wqiBand(0).sev).toBe('critico');
  });

  it('el valor justo por debajo de cada corte cae a la banda inferior', () => {
    // Sin estos casos, un `>` en vez de `>=` (o un corte movido un punto) pasaría.
    expect(wqiBand(84.9).sev).toBe('vigilancia');
    expect(wqiBand(69.9).sev).toBe('fuera');
    expect(wqiBand(49.9).sev).toBe('critico');
  });

  it('sin dato devuelve «Sin datos» con mayúscula (Supervisor decía «sin datos»)', () => {
    expect(wqiBand(null)).toEqual({ sev: 'sin-rango', label: 'Sin datos' });
    expect(wqiBand(undefined).label).toBe('Sin datos');
  });

  it('cada severidad trae su etiqueta en español', () => {
    expect(wqiBand(90).label).toBe('Óptimo');
    expect(wqiBand(75).label).toBe('Vigilancia');
    expect(wqiBand(60).label).toBe('Deficiente');
    expect(wqiBand(20).label).toBe('Crítico');
  });
});

describe('wqiSpans · los tramos del medidor NO pueden divergir de la banda', () => {
  it('cubre 0–100 sin huecos ni solapes', () => {
    const spans = wqiSpans();
    expect(spans[0].from).toBe(0);
    expect(spans[spans.length - 1].to).toBe(100);
    spans.slice(1).forEach((s, i) => expect(s.from).toBe(spans[i].to));
    const total = spans.reduce((a, s) => a + (s.to - s.from), 0);
    expect(total).toBe(100);
  });

  it('cada tramo se corresponde con lo que wqiBand dice en su interior', () => {
    // ESTE es el test que caza la deriva: si alguien mueve un umbral en un solo
    // sitio, el tramo y la banda dejan de coincidir y esto se pone rojo.
    wqiSpans().forEach((s) => {
      expect(wqiBand(s.from).sev, `inicio del tramo ${s.sev}`).toBe(s.sev);
      expect(wqiBand(s.to - 0.1).sev, `final del tramo ${s.sev}`).toBe(s.sev);
      const medio = s.from + (s.to - s.from) / 2;
      expect(wqiBand(medio).sev, `centro del tramo ${s.sev}`).toBe(s.sev);
    });
  });

  it('los anchos siguen valiendo lo que el medidor pintaba a mano', () => {
    // Ancla contra el literal histórico [50, 20, 15, 15]: la unificación NO debía
    // mover ningún píxel del gráfico, solo dejar de repetir los umbrales.
    expect(wqiSpans().map((s) => s.to - s.from)).toEqual([50, 20, 15, 15]);
  });
});

describe('calRiskLevel · comparte los cortes, no el vocabulario', () => {
  // Es la única de las copias que NO es una banda: devuelve niveles de RIESGO y
  // aplica reglas de piso por críticos. Solo debe compartir los tres números.
  const limpias = ['dentro', 'dentro'];

  it('usa los mismos cortes que wqiBand, con su propio vocabulario', () => {
    expect(calRiskLevel(limpias, 85)).toBe('bajo');
    expect(calRiskLevel(limpias, 84.9)).toBe('medio');
    expect(calRiskLevel(limpias, 70)).toBe('medio');
    expect(calRiskLevel(limpias, 69.9)).toBe('alto');
    expect(calRiskLevel(limpias, 50)).toBe('alto');
    expect(calRiskLevel(limpias, 49.9)).toBe('critico');
  });

  it('conserva el piso por parámetros críticos (no lo diluye el promedio)', () => {
    // Un WQI excelente NO puede devolver riesgo bajo si hay críticos puntuales:
    // esta conducta es propia de calRiskLevel y la unificación no debía tocarla.
    expect(calRiskLevel(['critico', 'dentro'], 95)).toBe('medio');
    expect(calRiskLevel(['critico', 'critico'], 95)).toBe('alto');
  });

  it('los cortes salen de THRESHOLDS.wqi, no de literales sueltos', () => {
    const t = THRESHOLDS.wqi;
    expect(calRiskLevel(limpias, t.optimo)).toBe('bajo');
    expect(calRiskLevel(limpias, t.vigilancia)).toBe('medio');
    expect(calRiskLevel(limpias, t.deficiente)).toBe('alto');
  });
});
