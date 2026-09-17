import { describe, it, expect } from 'vitest';
import {
  MAD_TRAT_SHEET, MAD_TRAT_HEADERS, MAD_TRAT_ESTADOS, MAD_TRAT_PREVENTIVOS, MAD_TRAT_RAS, MAD_TRAT_DESINFECTANTES, MAD_TRAT_AREAS,
  plantillaTrat, productosDeArea, productosDe, lotesDe, tratIdPreventivo, tratIdDesinfeccion, buildTratRows, buildTratPayload, validarTrat,
} from './ficha-maduracion-tratamientos.schema.js';

const col = (h) => MAD_TRAT_HEADERS.indexOf(h);
const base = () => ({
  fecha: '2026-09-15', sala: 'Sala 4', estado: 'Producción',
  preventivos: [{ lotes: 'bp, BC', productos: ['Vitamina C', 'Bacmil'], ras: ['EM-1'], dosis: 'Bacmil 2 g/L' }],
  desinfecciones: [{ area: 'RAS y tuberías', productos: ['Cloro', 'Vitamina C'], dosis: '' }],
});

describe('Tratamientos · la hoja y los catálogos del usuario', () => {
  it('hoja nueva, columnas y el ID el último', () => {
    expect(MAD_TRAT_SHEET).toBe('Maduración Tratamientos');
    expect(MAD_TRAT_HEADERS).toEqual(['Fecha', 'Sala', 'Estado de la sala', 'Tipo', 'Área', 'Lotes', 'Productos', 'Productos RAS', 'Dosis y observaciones', 'ID']);
  });

  it('🔴 los productos y las áreas, en el orden en que los dio el usuario', () => {
    expect(MAD_TRAT_PREVENTIVOS).toEqual(['Cooper', 'Formol', 'Bacmil', 'Lactosac', 'Lipofeed', 'Carbonato de Calcio', 'Complex B', 'Vitamina C', 'Full Calcio', 'Prokura']);
    expect(MAD_TRAT_RAS).toEqual(['Bicarbonato', 'EM-1', 'Full Calcio', 'Prokura']);
    /* 2026-09-15 (usuario): Ácido Nítrico, Peróxido y Trilon B al final de la lista; «Reservorio» y
       «Colectores» como áreas propias. «Reservorio» convive con «Líneas de agua y aire, tinas y
       reservorios»: son áreas distintas para el usuario y el ID las separa por su etiqueta. */
    // 2026-09-16 (usuario, PE1.7): «Treflam», al final.
    expect(MAD_TRAT_DESINFECTANTES).toEqual(['Formol', 'Cloro', 'Jabón neutro', 'Virkon', 'Vitamina C', 'Bicarbonato', 'Full Calcio', 'EM-1', 'Prokura', 'Cooper',
      'Ácido Nítrico', 'Peróxido', 'Trilon B', 'Treflam']);
    expect(MAD_TRAT_AREAS).toEqual(['Salas y tanques', 'RAS y tuberías', 'Líneas de agua y aire, tinas y reservorios', 'Desove, Eclosión y Despacho', 'Conos, baldes, tinas y tuberías',
      'Reservorio', 'Colectores']);
    expect(MAD_TRAT_ESTADOS).toEqual(['Producción', 'Cuarentena', 'Mixto', 'Desinfección', 'Desinfección - Producción agrupada']);
  });

  it('🔴 PE1.7 · «Treflam» se ofrece y se guarda, pero NO sale marcado en ningún área ni plantilla', () => {
    /* El usuario no dijo dónde se usa: adivinarlo dejaría casillas puestas que nadie pidió. */
    for (const area of MAD_TRAT_AREAS) expect(productosDeArea(area), area).not.toContain('Treflam');
    for (const estado of MAD_TRAT_ESTADOS) expect(plantillaTrat(estado).desinfeccion, estado).not.toContain('Treflam');
    // Marcado a mano, se escribe con su grafía y en el orden del catálogo (el último).
    expect(productosDe(MAD_TRAT_DESINFECTANTES, [' treflam ', 'Cloro'])).toEqual(['Cloro', 'Treflam']);
  });
});

describe('Tratamientos · plantillas por estado de la sala (el ejemplo del usuario)', () => {
  const PROD = { preventivos: ['Bacmil', 'Lactosac', 'Lipofeed', 'Vitamina C', 'Complex B', 'Full Calcio'], ras: ['Bicarbonato', 'EM-1'], desinfeccion: [] };
  it('🔴 Producción, Cuarentena y Mixto: los preventivos y el RAS; nada de desinfección', () => {
    for (const e of ['Producción', 'Cuarentena', 'Mixto']) expect(plantillaTrat(e), e).toEqual(PROD);
  });
  it('🔴 Desinfección: Formol, Cooper y Virkon; la agrupada, las dos', () => {
    expect(plantillaTrat('Desinfección')).toEqual({ preventivos: [], ras: [], desinfeccion: ['Formol', 'Cooper', 'Virkon'] });
    expect(plantillaTrat('Desinfección - Producción agrupada')).toEqual({ ...PROD, desinfeccion: ['Formol', 'Cooper', 'Virkon'] });
  });
  it('un estado desconocido (o «constructor») no pre-marca nada, y la plantilla es una COPIA', () => {
    expect(plantillaTrat('constructor')).toEqual({ preventivos: [], ras: [], desinfeccion: [] });
    plantillaTrat('Producción').preventivos.push('X');
    expect(plantillaTrat('Producción')).toEqual(PROD);
  });
  it('lo habitual de cada área', () => {
    expect(productosDeArea('RAS y tuberías')).toEqual(['Cloro', 'Vitamina C', 'Bicarbonato', 'Full Calcio', 'EM-1', 'Prokura']);
    expect(productosDeArea('Salas y tanques')).toEqual(['Formol', 'Cloro', 'Jabón neutro', 'Virkon', 'Vitamina C']);
    expect(productosDeArea('toString')).toEqual([]);
  });
});

describe('Tratamientos · filas', () => {
  it('🔴 una fila por tarjeta: productos en el orden del catálogo, lotes normalizados y ordenados', () => {
    const [p, d] = buildTratRows(base());
    expect([p[col('Tipo')], p[col('Área')], p[col('Lotes')], p[col('Productos')], p[col('Productos RAS')], p[col('Dosis y observaciones')]])
      .toEqual(['Preventivo', 'Lotes', 'BC, BP', 'Bacmil, Vitamina C', 'EM-1', 'Bacmil 2 g/L']);
    expect([d[col('Tipo')], d[col('Área')], d[col('Lotes')], d[col('Productos')], d[col('Productos RAS')]])
      .toEqual(['Desinfección', 'RAS y tuberías', '', 'Cloro, Vitamina C', '']);
    expect([p[col('Fecha')], p[col('Sala')], p[col('Estado de la sala')]]).toEqual(['2026-09-15', 'Sala 4', 'Producción']);
    expect(buildTratPayload(base())).toMatchObject({ sheetName: MAD_TRAT_SHEET, headers: MAD_TRAT_HEADERS });
  });

  it('🔴 el ID: el mismo grupo de lotes da la misma fila aunque se teclee en otro orden; sin sala, «GEN»', () => {
    expect(tratIdPreventivo('2026-09-15', 'Sala 4', 'bp, BC')).toBe('2026-09-15-S4-P-BC.BP');
    expect(tratIdPreventivo('2026-09-15', 'Sala 4', ['BC', 'bp'])).toBe('2026-09-15-S4-P-BC.BP');
    expect(tratIdDesinfeccion('2026-09-15', '', 'Desove, Eclosión y Despacho')).toBe('2026-09-15-GEN-D-DESOVE');
    expect(tratIdDesinfeccion('2026-09-15', 'Sala 2', 'Líneas de agua y aire, tinas y reservorios')).toBe('2026-09-15-S2-D-LINEAS');
    /* 🔴 «Reservorio» y «Líneas de agua y aire, tinas y reservorios» tienen que dar IDs DISTINTOS:
       si compartieran etiqueta, desinfectar las dos el mismo día en la misma sala escribiría una
       sola fila y la segunda se comería a la primera con el MERGE. */
    expect(tratIdDesinfeccion('2026-09-15', 'Sala 2', 'Reservorio')).toBe('2026-09-15-S2-D-RESERVORIO');
    expect(tratIdDesinfeccion('2026-09-15', 'Sala 2', 'Colectores')).toBe('2026-09-15-S2-D-COLECTORES');
    expect(tratIdDesinfeccion('2026-09-15', 'Sala 2', 'Reservorio'))
      .not.toBe(tratIdDesinfeccion('2026-09-15', 'Sala 2', 'Líneas de agua y aire, tinas y reservorios'));
    expect(buildTratRows(base()).map((f) => f[col('ID')])).toEqual(['2026-09-15-S4-P-BC.BP', '2026-09-15-S4-D-RAS']);
  });

  it('lo desconocido no se escribe; una tarjeta incompleta no da fila', () => {
    expect(productosDe(MAD_TRAT_PREVENTIVOS, 'vitamina c, Inventado, Bacmil, bacmil')).toEqual(['Bacmil', 'Vitamina C']);
    expect(lotesDe(' bp , , BP, b c')).toEqual(['BC', 'BP']);
    const m = base();
    m.preventivos.push({ lotes: 'BX', productos: [] }, { lotes: '', productos: ['Bacmil'] });
    m.desinfecciones.push({ area: 'Inventada', productos: ['Formol'] }, { area: 'Salas y tanques', productos: [] });
    expect(buildTratRows(m)).toHaveLength(2);
  });

  it('un preventivo sólo con RAS también es fila', () => {
    const m = base();
    m.preventivos[0].productos = [];
    expect(buildTratRows(m)[0][col('Productos RAS')]).toBe('EM-1');
  });
});

describe('Tratamientos · validación', () => {
  it('el modelo base es válido y una tarjeta vacía se ignora', () => {
    const m = base();
    m.preventivos.push({ lotes: '', productos: [], ras: [], dosis: '' });
    m.desinfecciones.push({ area: '', productos: [], dosis: '' });
    expect(validarTrat(m)).toEqual({ errores: [], avisos: [] });
  });

  it('🔴 ERROR si una tarjeta queda a medias', () => {
    const m = base();
    m.preventivos = [{ lotes: 'BP', productos: [] }, { lotes: '', productos: ['Bacmil'] }];
    m.desinfecciones = [{ area: '', productos: ['Formol'] }, { area: 'Salas y tanques', productos: [] }];
    expect(validarTrat(m).errores).toEqual([
      'En el preventivo 1 no hay ningún producto marcado.',
      'Falta el lote de el preventivo 2.',
      'Falta el área de la desinfección 1.',
      'En la desinfección 2 no hay ningún producto marcado.',
    ]);
  });

  it('🔴 ERROR sin sala en un preventivo o en «Salas y tanques»; otra área sin sala vale', () => {
    const m = base();
    m.sala = '';
    m.desinfecciones = [{ area: 'Salas y tanques', productos: ['Formol'] }, { area: 'Desove, Eclosión y Despacho', productos: ['Cloro'] }];
    expect(validarTrat(m).errores).toEqual([
      'Falta la sala de el preventivo 1: los lotes se tratan en su sala.',
      'Falta la sala de la desinfección 1: es la desinfección de sus salas y tanques.',
    ]);
  });

  it('🔴 ERROR si dos tarjetas escribirían la misma fila', () => {
    const m = base();
    m.preventivos.push({ lotes: 'BP,bc', productos: ['Lactosac'] });
    m.desinfecciones.push({ area: 'RAS y tuberías', productos: ['EM-1'] });
    const { errores } = validarTrat(m);
    expect(errores).toHaveLength(2);
    expect(errores[0]).toMatch(/BC, BP tienen dos preventivos/);
    expect(errores[1]).toMatch(/«RAS y tuberías» se desinfecta dos veces/);
  });

  it('ERROR si no hay nada que registrar; fecha inválida; AVISO de sala o estado desconocidos', () => {
    expect(validarTrat({ fecha: '2026-09-15', preventivos: [], desinfecciones: [] }).errores)
      .toEqual(['No hay ningún tratamiento que registrar: marca al menos un producto.']);
    const m = base();
    m.fecha = '15/09/2026';
    m.sala = 'Sala 9';
    m.estado = 'Otro';
    const r = validarTrat(m);
    expect(r.errores).toEqual(['La fecha no es válida.']);
    expect(r.avisos).toEqual(['«Sala 9» no es una sala conocida.', '«Otro» no es un estado de sala conocido.']);
  });
});
