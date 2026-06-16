import { describe, it, expect } from 'vitest';
import {
  isMicroRow, normNivel, classifyFormato, normTipoMuestra, luminPresence,
  intStr, meltRow, rowContext, pathogenRecords, PATHOGENS, NIVEL_RANK, isAlerta,
} from './data.js';

// Fila representativa (cabeceras reales de la hoja "Microbiología").
const baseRow = {
  _SheetOrigin: 'Microbiología',
  'Fecha muestreo': '46181', 'Corrida': '578.0', 'Departamento': 'Larvicultura',
  'Formato': 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo/Sala': '9.0',
  'Estadío': 'Z2', 'TQ/N°': '8.0', 'Responsable': 'Ana',
  'V.Amarillos (crudo)': '5', 'V.Amarillos UFC': '50', 'V.Amarillos Nivel': 'Mínimo',
  'V.Verdes (crudo)': '8', 'V.Verdes UFC': '80', 'V.Verdes Nivel': 'Leve',
  'V.Totales (crudo)': '13', 'V.Totales UFC': '130', 'V.Totales Nivel': 'Moderado',
  'Enterobact. (crudo)': '2', 'Enterobact. UFC': '20',
  'V.Luminiscentes': 'Ausencia',
};

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
  it('clasifica los 4 formatos de larvicultura', () => {
    expect(classifyFormato('Larvicultura · Muestra')).toBe('muestras');
    expect(classifyFormato('Larvicultura Reservorios')).toBe('reservorios');
    expect(classifyFormato('Placa ambiental')).toBe('placa-amb');
    expect(classifyFormato('Artemia')).toBe('artemia');
  });
  it('"" si vacío; "otros" si no reconocido', () => {
    expect(classifyFormato('')).toBe('');
    expect(classifyFormato('Algo raro')).toBe('otros');
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
  it('produce un registro por patógeno con dato y preserva el factor crudo→UFC', () => {
    const recs = meltRow(baseRow);
    const keys = recs.map((r) => r.key);
    expect(keys).toContain('amarillos');
    expect(keys).toContain('totales');
    expect(keys).toContain('entero');
    const tot = recs.find((r) => r.key === 'totales');
    expect(tot.crudo).toBe(13);
    expect(tot.ufc).toBe(130); // factor ×10 ya aplicado en la hoja
    expect(tot.nivel).toBe('Moderado');
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
    expect(c.formatoKey).toBe('muestras');
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
