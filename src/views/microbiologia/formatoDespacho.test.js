// Auditoría definitiva · Microbiología · el formato «Larvicultura · Despacho».
//
// `classifyFormato` lo hacía caer en la regla GENÉRICA de "despacho" → 'hisopados-despacho'
// → umbrales del área AMBIENTAL (los de un hisopado de superficie: C. Verdes Leve ≥10)
// sobre muestras de AGUA y ANIMAL de Larvicultura. Seis líneas más arriba, «Maduración ·
// Despacho» sí tenía su regla propia puesta ANTES de la genérica, con un comentario que lo
// explicaba: el gemelo de Larvicultura nunca la recibió.
//
// Medido sobre las 3.146 filas reales de la hoja «Microbiología», contrastando el Nivel que
// ESCRIBIÓ la app de captura contra el que RECALCULA el tablero:
//
//   FORMATO                       discrepancia   umbrales usados
//   los otros 12 formatos ......... 0 % (0/9.089)
//   Larvicultura · Despacho ....... 65 % (285/441)   ambiental
//
// y siempre escalando (C. Verdes 40 UFC: hoja «Mínimo» → tablero «Moderado»). Probadas las
// 9 áreas contra el Nivel del laboratorio: ambiental 35 %, larv-animal 90 %, larv-agua 92 %,
// y (Agua→larvdes-agua / Animal→larvdes-animal) 441/441 = 100 %. Las áreas larvdes-* ya
// estaban definidas en el motor de la ficha (public/registros/engine.js): mismos umbrales
// l/m/e que Larvicultura, solo cambian los factores de dilución —que aquí no se usan, porque
// el UFC llega ya multiplicado— y SOLO cubren los 6 conteos que ese formato registra.
import { describe, it, expect } from 'vitest';
import { classifyFormato, areaForFormat, deptoOfFormato, FORMATO_LABEL, meltRow } from './data.js';

const R = (o) => ({ _SheetOrigin: 'Microbiología', ...o });
/** Nivel que el tablero asigna a un patógeno de una fila. */
const nivelDe = (row, key) => (meltRow(row).find((m) => m.key === key) || {}).nivel ?? null;

describe('«Larvicultura · Despacho» · clasificación', () => {
  it('tiene formato propio, no cae en la regla genérica de "despacho"', () => {
    expect(classifyFormato('Larvicultura · Despacho')).toBe('larv-despacho');
    expect(classifyFormato('Larvicultura · Despacho')).not.toBe('hisopados-despacho');
    expect(FORMATO_LABEL['larv-despacho']).toBe('Larvicultura · Despacho');
  });

  it('tolera la grafía, como la regla gemela de Maduración', () => {
    // La etiqueta EXACTA ya la resuelve el índice `_FMT_BY_FOLDED` en cuanto el formato
    // existe en MIC_FORMATS; lo que sostiene la regla explícita son las variantes que se
    // teclean en la hoja (sin el separador «·», en minúsculas, con espacios de más). Sin
    // ella vuelven a caer en la genérica de "despacho" → umbrales ambientales.
    ['Larvicultura Despacho', 'larvicultura  despacho', 'LARVICULTURA · DESPACHO'].forEach((v) => {
      expect(classifyFormato(v), v).toBe('larv-despacho');
    });
  });

  it('pertenece a Larvicultura, no a «Otros»', () => {
    expect(deptoOfFormato('larv-despacho')).toBe('Larvicultura');
  });

  it('resuelve el área por tipo de muestra, como «Larvicultura · Muestra»', () => {
    expect(areaForFormat('larv-despacho', 'Agua')).toBe('larvdes-agua');
    expect(areaForFormat('larv-despacho', 'Animal')).toBe('larvdes-animal');
  });

  it('no rompe a sus vecinos de la cascada de reglas', () => {
    expect(classifyFormato('Maduración · Despacho')).toBe('mad-desinf');
    expect(classifyFormato('Maduración · Desinfección')).toBe('mad-desinf');
    expect(classifyFormato('Hisopados (despacho)')).toBe('hisopados-despacho');
    expect(classifyFormato('Larvicultura · Muestra')).toBe('larv-muestra');
  });
});

/* ============================================================
   Los otros formatos que la ficha ya define y el port no recibía. Se comprobó etiqueta a
   etiqueta contra `MIC_FORMATS` de public/registros/engine.js: de sus 20 nombres, 3 no
   llegaban bien al tablero. Los tres caían en una regla genérica que se les parecía.
   ============================================================ */
describe('formatos de la ficha que caían en una regla genérica', () => {
  it('«Maduración · Hisopado» no es un hisopado de planta', () => {
    // Caía en 'hisopados' → departamento «Otros» y umbrales `ambiental`, cuando la ficha le
    // da área propia con umbrales ~10× más altos (C. Amarillas Leve ≥250 vs ≥25).
    expect(classifyFormato('Maduración · Hisopado')).toBe('mad-hisopado');
    expect(classifyFormato('maduracion hisopado')).toBe('mad-hisopado');
    expect(deptoOfFormato('mad-hisopado')).toBe('Maduración');
    expect(areaForFormat('mad-hisopado', '')).toBe('mad-hisopado');
    // Y los hisopados de planta siguen donde estaban.
    expect(classifyFormato('Hisopados')).toBe('hisopados');
    expect(classifyFormato('Algas Hisopado')).toBe('algas');
  });

  it('«Agua de mar y Reservorios» (nombre nuevo) no es un reservorio de Larvicultura', () => {
    // La ficha renombró «Agua Limpia y Mar»; con el nombre nuevo, la regla de "reservorio"
    // se disparaba antes y lo mandaba a Larvicultura con umbrales 10× más laxos.
    expect(classifyFormato('Agua de mar y Reservorios')).toBe('agua-limpia-mar');
    expect(deptoOfFormato('agua-limpia-mar')).toBe('Maduración');
    // El nombre viejo y los reservorios de verdad siguen resolviéndose igual.
    expect(classifyFormato('Agua Limpia y Mar')).toBe('agua-limpia-mar');
    expect(classifyFormato('Larvicultura · Reservorios')).toBe('reservorios');
    expect(deptoOfFormato('reservorios')).toBe('Larvicultura');
  });

  it('«Larvicultura · EM» queda catalogado, y sin semaforizar conteos que no mide', () => {
    expect(classifyFormato('Larvicultura · EM')).toBe('larv-em');
    expect(deptoOfFormato('larv-em')).toBe('Larvicultura');
    // Sus parámetros (`cba`/`clev`) no están en PATHOGENS y su área no define umbrales: si
    // alguna vez llegara un conteo de vibrios en este formato, NO debe recibir nivel de un
    // área vecina. Antes caía en el defecto 'larv-animal' y sí lo recibía.
    const row = R({ Formato: 'Larvicultura · EM', 'V.Totales UFC': '900000' });
    expect(nivelDe(row, 'totales')).toBe('');
  });
});

describe('«Larvicultura · Despacho» · el Nivel concuerda con el laboratorio', () => {
  // Los DOS casos reales medidos en la hoja. Con los umbrales ambientales el tablero
  // contradecía a la app de captura; con los de Larvicultura coinciden.
  //   C. Verdes 40 UFC   → ambiental (vverd l:10 m:30) = Moderado · larvdes-agua (l:100) = Mínimo
  //   V.alginolyticus 540 → ambiental (valg l:25 e:500) = Elevado · larvdes-agua (l:1000) = Mínimo
  const AGUA = R({
    'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura',
    Formato: 'Larvicultura · Despacho', 'Tipo de muestra': 'Agua',
    'V.Verdes UFC': '40', 'V.alginolyticus UFC': '540',
  });

  it('C. Verdes 40 UFC en agua es «Mínimo», no «Moderado»', () => {
    expect(nivelDe(AGUA, 'verdes')).toBe('Mínimo');
  });

  it('V. alginolyticus 540 UFC en agua es «Mínimo», no «Elevado»', () => {
    expect(nivelDe(AGUA, 'algino')).toBe('Mínimo');
  });

  it('agua y animal NO comparten umbral (el área depende del tipo de muestra)', () => {
    // V. parahaemolyticus 180 UFC: agua {l:100,m:200} = Leve · animal {l:300} = Mínimo.
    const con = (tipo) => R({
      Formato: 'Larvicultura · Despacho', 'Tipo de muestra': tipo, 'V.parahaemolyticus UFC': '180',
    });
    expect(nivelDe(con('Agua'), 'para')).toBe('Leve');
    expect(nivelDe(con('Animal'), 'para')).toBe('Mínimo');
  });

  it('el formato hermano «Larvicultura · Muestra» conserva su clasificación', () => {
    // Guarda contra pasarse de corrección: los umbrales l/m/e son los MISMOS, así que la
    // misma medición tiene que dar el mismo nivel en los dos formatos.
    const muestra = R({ Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'V.Verdes UFC': '250' });
    const despacho = R({ Formato: 'Larvicultura · Despacho', 'Tipo de muestra': 'Agua', 'V.Verdes UFC': '250' });
    expect(nivelDe(muestra, 'verdes')).toBe('Moderado'); // vverd agua {l:100,m:200,e:300}
    expect(nivelDe(despacho, 'verdes')).toBe('Moderado');
  });

  it('un patógeno que este formato NO mide no recibe nivel por la puerta de atrás', () => {
    // larvdes-* cubre solo los 6 conteos, igual que la ficha: Pseudomonas no está.
    // Sin umbral y sin columna Nivel escrita, el registro se queda sin nivel en vez de
    // heredar el de un área vecina.
    const row = R({ Formato: 'Larvicultura · Despacho', 'Tipo de muestra': 'Agua', 'Pseudomonas UFC': '500' });
    expect(nivelDe(row, 'pseudo')).toBe('');
    // …pero el UFC sigue registrándose: el dato no se pierde, solo no se semaforiza.
    expect((meltRow(row).find((m) => m.key === 'pseudo') || {}).ufc).toBe(500);
  });
});
