/* ============================================================
   MADURACIÓN · OPERATIVO — los umbrales (Fase 0.4)

   Qué se exige:
   · Todo umbral con cifra dice de dónde sale: una fuente del catálogo y la referencia publicada, que tiene que
     contener esa cifra (si alguien cambia el número sin cambiar la cita, esto lo ve).
   · Lo que no tiene fuente fiable se queda SIN cifra y lo dice: «pendiente del laboratorio».
   · El del LABORATORIO manda sobre el bibliográfico en cuanto existe (decisión del usuario, 2026-09-19).
   · Los extremos cuentan como dentro, y sin valor o sin umbral no hay veredicto.
   · No se contradicen con las validaciones de captura (que son «esto no puede ser un dato»).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { FUENTES, UMBRALES, UMBRALES_DE_AVISO, umbralVigente, evaluar } from './operativo.umbrales.js';
import { fueraDeRango } from './operativo.indicadores.js';
import { MAD_ALIM_PCT_MIN, MAD_ALIM_PCT_MAX } from '../registros/lib/ficha-maduracion-alimentacion.schema.js';
import { MAD_NAUP_SAL_MAX, MAD_NAUP_TEMP_MAX } from '../registros/lib/ficha-maduracion-mortdesove.schema.js';

const digitos = (s) => String(s).replace(/[^\d]/g, '');

describe('Maduración · umbrales · de dónde sale cada cifra', () => {
  it('todo umbral con cifra cita fuentes que EXISTEN, y su referencia contiene esas cifras', () => {
    for (const [id, U] of Object.entries(UMBRALES)) {
      expect(U.nombre && U.unidad, id).toBeTruthy();
      for (const b of [U.bibliografia, U.laboratorio].filter(Boolean)) {
        expect(b.fuente.length, id).toBeGreaterThan(0);
        for (const f of b.fuente) expect(FUENTES[f], id + ' cita «' + f + '»').toBeTruthy();
        expect(b.min !== null || b.max !== null, id).toBe(true);
        if (b.min !== null) expect(digitos(b.referencia), id + ' min').toContain(digitos(b.min));
        if (b.max !== null) expect(digitos(b.referencia), id + ' max').toContain(digitos(b.max));
      }
    }
  });

  it('sin fuente fiable no hay cifra: la mortalidad del día y las cargas esperan al laboratorio', () => {
    for (const id of ['mortalidadDiaria', 'cargaMetrica', 'cargaVolumetrica']) {
      expect(UMBRALES[id].bibliografia, id).toBe(null);
      expect(UMBRALES[id].laboratorio, id).toBe(null);
      expect(UMBRALES[id].nota, id).toMatch(/pendiente del valor del laboratorio/);
      expect(umbralVigente(id), id).toBe(null);
      expect(evaluar(id, 5), id).toBe('');
    }
  });

  it('el alimento por toma usa el rango de la ficha de Alimentación, que ya es del laboratorio', () => {
    expect(umbralVigente('alimentoPctToma')).toMatchObject({ min: MAD_ALIM_PCT_MIN, max: MAD_ALIM_PCT_MAX, origen: 'laboratorio' });
  });

  it('ningún umbral pasa de las validaciones de captura (40 °C, 60 ‰)', () => {
    expect(UMBRALES.temperatura.bibliografia.max).toBeLessThan(MAD_NAUP_TEMP_MAX);
    expect(UMBRALES.salinidad.bibliografia.max).toBeLessThan(MAD_NAUP_SAL_MAX);
  });

  it('0f · 2b · los umbrales de 📉 Tendencias y ⏳ Permanencia son del USUARIO, y su referencia dice la cifra que se usa', () => {
    for (const [id, U] of Object.entries(UMBRALES_DE_AVISO)) {
      expect(U.nombre && U.unidad, id).toBeTruthy();
      expect(U.fuente, id).toEqual(['USUARIO']);
      expect(FUENTES.USUARIO, id).toMatch(/^Usuario: decisión del 2026-09-25/);
      expect(Number.isFinite(U.valor) && U.valor > 0, id).toBe(true);
      expect(digitos(U.referencia), id).toContain(digitos(U.valor));
    }
    expect(Object.keys(UMBRALES_DE_AVISO)).toEqual(['cambio', 'registros', 'produccion']);
    // no son rangos de una variable: `umbralVigente` no los conoce
    for (const id of Object.keys(UMBRALES_DE_AVISO)) expect(umbralVigente(id), id).toBe(null);
  });
});

describe('Maduración · umbrales · el veredicto', () => {
  it('los valores publicados: 28–29 °C, ≥ 4 mg/L, ≥ 100 mg/L, 30–35 ‰, 6–15 /m², 1–2 hembras por macho', () => {
    expect(umbralVigente('temperatura')).toMatchObject({ min: 28, max: 29, origen: 'bibliografía' });
    expect(umbralVigente('oxigeno')).toMatchObject({ min: 4, max: null });
    // La alcalinidad publicada sigue siendo ≥ 100; desde el 2026-09-26 MANDA la del laboratorio (120–150, prueba de abajo).
    expect(UMBRALES.alcalinidad.bibliografia).toMatchObject({ min: 100, max: null });
    expect(umbralVigente('salinidad')).toMatchObject({ min: 30, max: 35 });
    expect(umbralVigente('densidad')).toMatchObject({ min: 6, max: 15 });
    expect(umbralVigente('proporcionHM')).toMatchObject({ min: 1, max: 2 });
  });

  it('los extremos cuentan como dentro; un lado vacío no se comprueba', () => {
    expect(evaluar('temperatura', 27.9)).toBe('bajo');
    expect(evaluar('temperatura', 28)).toBe('ok');
    expect(evaluar('temperatura', 29)).toBe('ok');
    expect(evaluar('temperatura', 29.1)).toBe('alto');
    expect(evaluar('oxigeno', 3.9)).toBe('bajo');
    expect(evaluar('oxigeno', 4.5)).toBe('ok');
    expect(evaluar('oxigeno', 12)).toBe('ok');
    expect(evaluar('huevosPorDesove', 99999)).toBe('bajo');
    expect(evaluar('huevosPorDesove', '150000')).toBe('ok');
  });

  it('sin valor, o con un umbral que no existe, no hay veredicto', () => {
    expect(evaluar('temperatura', '')).toBe('');
    expect(evaluar('temperatura', null)).toBe('');
    expect(evaluar('temperatura', 'n/d')).toBe('');
    expect(evaluar('noExiste', 5)).toBe('');
  });

  it('🔑 el del LABORATORIO manda en cuanto existe', () => {
    const lab = { temperatura: { min: 27, max: 30, referencia: '27–30 °C (laboratorio)', fuente: [] } };
    expect(evaluar('temperatura', 27.5)).toBe('bajo');
    expect(evaluar('temperatura', 27.5, lab)).toBe('ok');
    expect(umbralVigente('temperatura', lab)).toMatchObject({ min: 27, max: 30, origen: 'laboratorio' });
    expect(umbralVigente('oxigeno', lab).origen).toBe('bibliografía');
  });

  it('🔴 alcalinidad (2026-09-26, usuario): manda el rango del laboratorio, 120–150, con los extremos dentro', () => {
    expect(umbralVigente('alcalinidad')).toMatchObject({ min: 120, max: 150, origen: 'laboratorio', referencia: '120–150 mg/L CaCO₃' });
    expect([119.9, 120, 150, 150.1].map((v) => evaluar('alcalinidad', v))).toEqual(['bajo', 'ok', 'ok', 'alto']);
  });

  it('encaja con las lecturas fuera de rango del tablero', () => {
    const filas = [{ Fecha: '2026-09-10', Sala: 'Sala 1', 'Temperatura 2:00': 27, 'Temperatura 4:00': 28.5 }];
    expect(fueraDeRango(filas, ['Temperatura 2:00', 'Temperatura 4:00'], umbralVigente('temperatura'), '2026-09-01', '2026-09-30'))
      .toEqual({ 'Sala 1': { lecturas: 2, fuera: 1, pct: 50 } });
  });
});
