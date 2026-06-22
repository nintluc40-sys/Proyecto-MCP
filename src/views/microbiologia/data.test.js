import { describe, it, expect } from 'vitest';
import {
  isMicroRow, normNivel, classifyFormato, normTipoMuestra, luminPresence,
  intStr, meltRow, rowContext, pathogenRecords, PATHOGENS, NIVEL_RANK, isAlerta,
  AGGREGATE_KEYS, areaForFormat,
} from './data.js';

// Fila representativa (cabeceras reales de la hoja "Microbiología").
const baseRow = {
  _SheetOrigin: 'Microbiología',
  'Fecha muestreo': '46181', 'Corrida': '578.0', 'Departamento': 'Larvicultura',
  'Formato': 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo/Sala': '9.0',
  'Estadío': 'Z2', 'TQ/N°': '8.0', 'Responsable': 'Ana',
  // UFC coherentes con el área larv-agua (la vista recalcula el Nivel desde el UFC):
  // amarillas 50<1000→Mínimo · verdes 100≤150<200→Leve · totales 5000≤6000<10000→Moderado.
  'C. Amarillas (crudo)': '5', 'C. Amarillas UFC': '50',
  'C. Verdes (crudo)': '15', 'C. Verdes UFC': '150',
  'C. Totales (crudo)': '600', 'C. Totales UFC': '6000',
  'Enterobact. (crudo)': '2', 'Enterobact. UFC': '20',
  'V.Luminiscentes': 'Ausencia',
};

describe('AGGREGATE_KEYS', () => {
  it('marca los conteos agregados (C./Bact. Totales), no patógenos específicos', () => {
    expect(AGGREGATE_KEYS.has('totales')).toBe(true);
    expect(AGGREGATE_KEYS.has('bactTot')).toBe(true);
    // un patógeno específico NO es agregado
    expect(AGGREGATE_KEYS.has('para')).toBe(false);
    expect(AGGREGATE_KEYS.has('algino')).toBe(false);
  });
});

describe('isMicroRow', () => {
  it('reconoce la hoja Microbiología (con/sin tilde)', () => {
    expect(isMicroRow(baseRow)).toBe(true);
    expect(isMicroRow({ _SheetOrigin: 'Microbiologia' })).toBe(true);
  });
  it('rechaza otras hojas', () => {
    expect(isMicroRow({ _SheetOrigin: 'Lab_Algas' })).toBe(false);
    expect(isMicroRow(null)).toBe(false);
  });
});

describe('normNivel', () => {
  it('mapea a las 4 etiquetas canónicas, tolerante a tildes/caso', () => {
    expect(normNivel('Mínimo')).toBe('Mínimo');
    expect(normNivel('minimo')).toBe('Mínimo');
    expect(normNivel('LEVE')).toBe('Leve');
    expect(normNivel('Moderado')).toBe('Moderado');
    expect(normNivel('elevado')).toBe('Elevado');
  });
  it('devuelve "" si vacío o desconocido', () => {
    expect(normNivel('')).toBe('');
    expect(normNivel('raro')).toBe('');
  });
});

describe('NIVEL_RANK / isAlerta', () => {
  it('ordena de menor a mayor severidad', () => {
    expect(NIVEL_RANK['Mínimo']).toBeLessThan(NIVEL_RANK['Elevado']);
  });
  it('alerta solo en Moderado/Elevado', () => {
    expect(isAlerta('Mínimo')).toBe(false);
    expect(isAlerta('Leve')).toBe(false);
    expect(isAlerta('Moderado')).toBe(true);
    expect(isAlerta('Elevado')).toBe(true);
  });
});

describe('classifyFormato', () => {
  it('reconoce las etiquetas reales de los 16 formatos', () => {
    expect(classifyFormato('Larvicultura · Muestra')).toBe('larv-muestra');
    expect(classifyFormato('Larvicultura · Reservorios')).toBe('reservorios');
    expect(classifyFormato('Larvicultura · Placa ambiental')).toBe('placa-amb');
    expect(classifyFormato('Maduración · Principal')).toBe('mad-principal');
    expect(classifyFormato('Maduración · Agua de Mar')).toBe('agua-mar');
    expect(classifyFormato('Hisopados (despacho)')).toBe('hisopados-despacho');
    expect(classifyFormato('Algas Mensual')).toBe('algas-mensual');
  });
  it('"" si vacío o no reconocido', () => {
    expect(classifyFormato('')).toBe('');
    expect(classifyFormato('Algo raro')).toBe('');
  });
});

describe('areaForFormat', () => {
  it('mapea formato→área como las fichas (rkeyFn)', () => {
    expect(areaForFormat('larv-muestra', 'Agua')).toBe('larv-agua');
    expect(areaForFormat('larv-muestra', 'Animal')).toBe('larv-animal');
    expect(areaForFormat('mad-principal', '')).toBe('mad-reprod');
    expect(areaForFormat('ras', '')).toBe('ras-agua');
    expect(areaForFormat('algas', '')).toBe('ambiental');     // formato "Algas" (swab) → ambiental
    expect(areaForFormat('algas-mensual', '')).toBe('algas');
    expect(areaForFormat('', '')).toBe('larv-animal');        // desconocido → defecto
  });
});

describe('normTipoMuestra', () => {
  it('canoniza Agua/Animal', () => {
    expect(normTipoMuestra('agua')).toBe('Agua');
    expect(normTipoMuestra('Animal')).toBe('Animal');
    expect(normTipoMuestra('')).toBe('');
  });
});

describe('luminPresence', () => {
  it('detecta presencia/ausencia/sin dato', () => {
    expect(luminPresence({ 'V.Luminiscentes': 'Presencia' })).toBe(true);
    expect(luminPresence({ 'V.Luminiscentes': 'Ausencia' })).toBe(false);
    expect(luminPresence({ 'V.Luminiscentes': '' })).toBe(null);
  });
});

describe('intStr', () => {
  it('limpia el ".0" de enteros del XLSX y conserva texto', () => {
    expect(intStr('578.0')).toBe('578');
    expect(intStr('9.0')).toBe('9');
    expect(intStr('Z2')).toBe('Z2');
    expect(intStr('N5 (MB)')).toBe('N5 (MB)');
    expect(intStr('')).toBe('');
  });
});

describe('meltRow', () => {
  it('produce un registro por patógeno con dato y preserva el UFC de la hoja', () => {
    const recs = meltRow(baseRow);
    const keys = recs.map((r) => r.key);
    expect(keys).toContain('amarillos');
    expect(keys).toContain('totales');
    expect(keys).toContain('entero');
    const tot = recs.find((r) => r.key === 'totales');
    expect(tot.crudo).toBe(600);
    expect(tot.ufc).toBe(6000);
  });
  it('RECALCULA el nivel desde el UFC con los umbrales del área (larv-agua)', () => {
    const by = Object.fromEntries(meltRow(baseRow).map((r) => [r.key, r]));
    expect(by.amarillos.nivel).toBe('Mínimo');  // 50 < 1000
    expect(by.verdes.nivel).toBe('Leve');       // 100 ≤ 150 < 200
    expect(by.totales.nivel).toBe('Moderado');  // 5000 ≤ 6000 < 10000
  });
  it('respaldo: sin UFC usa el Nivel escrito en la hoja', () => {
    const row = {
      _SheetOrigin: 'Microbiología', Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua',
      'C. Amarillas (crudo)': '3', 'C. Amarillas Nivel': 'Elevado',
    };
    const am = meltRow(row).find((r) => r.key === 'amarillos');
    expect(am.ufc).toBe(null);
    expect(am.nivel).toBe('Elevado');
  });
  it('los patógenos sin medir se omiten', () => {
    const keys = meltRow(baseRow).map((r) => r.key);
    expect(keys).not.toContain('hongos'); // no presente en baseRow
  });
  it('los patógenos noNivel no traen nivel', () => {
    const ent = meltRow(baseRow).find((r) => r.key === 'entero');
    expect(ent.nivel).toBe('');
    expect(ent.ufc).toBe(20);
  });
});

describe('rowContext', () => {
  it('extrae y limpia el contexto', () => {
    const c = rowContext(baseRow);
    expect(c.corrida).toBe('578');
    expect(c.modulo).toBe('9');
    expect(c.tipoMuestra).toBe('Agua');
    expect(c.estadio).toBe('Z2');
    expect(c.ubicacion).toBe('T8');
    expect(c.formatoKey).toBe('larv-muestra');
    expect(c.lumin).toBe(false);
  });
  it('ubicación usa Reservorio cuando existe', () => {
    const c = rowContext({ ...baseRow, 'TQ/N°': '', 'Tanque/Reservorio': '3' });
    expect(c.ubicacion).toBe('R3');
  });
});

describe('pathogenRecords', () => {
  it('aplana varias filas fusionando el contexto', () => {
    const recs = pathogenRecords([baseRow, baseRow]);
    expect(recs.length).toBe(meltRow(baseRow).length * 2);
    expect(recs[0].corrida).toBe('578');
    expect(recs[0]).toHaveProperty('label');
  });
  it('ignora entradas vacías sin reventar', () => {
    expect(pathogenRecords([]).length).toBe(0);
  });
});

describe('PATHOGENS catalog', () => {
  it('tiene claves únicas', () => {
    const keys = PATHOGENS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Vibrios Amarillos/Verdes/Totales: acepta V.* (hoja actual) y C.* (compatibilidad)', () => {
  it('lee los conteos desde las columnas V.Amarillos/V.Verdes/V.Totales', () => {
    const vRow = {
      _SheetOrigin: 'Microbiología', 'Formato': 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua',
      'V.Amarillos (crudo)': '5', 'V.Amarillos UFC': '50',
      'V.Verdes (crudo)': '15', 'V.Verdes UFC': '150',
      'V.Totales (crudo)': '600', 'V.Totales UFC': '6000',
    };
    const byKey = Object.fromEntries(meltRow(vRow).map((x) => [x.key, x]));
    expect(byKey.amarillos.ufc).toBe(50);
    expect(byKey.verdes.ufc).toBe(150);
    expect(byKey.totales.ufc).toBe(6000);
  });
  it('sigue leyendo las columnas C.* antiguas (compatibilidad)', () => {
    const cRow = { _SheetOrigin: 'Microbiología', 'Formato': 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'C. Totales (crudo)': '600', 'C. Totales UFC': '6000' };
    const t = meltRow(cRow).find((x) => x.key === 'totales');
    expect(t.ufc).toBe(6000);
  });
});
