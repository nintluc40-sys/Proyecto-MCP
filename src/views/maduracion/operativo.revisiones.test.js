/* ============================================================
   MADURACIÓN · OPERATIVO — REVISIONES (F3.2)

   Qué se exige, con fixtures que distinguen lo correcto de lo equivocado:
   · Las TRES clases de fila de la misma hoja no se confunden: una revisión no es una mortalidad, y sumar sus
     hembras descontaría animales que nadie perdió.
   · Sólo llevan veredicto las tres reglas que EXISTEN (salinidad > 60, temperatura > 40 y hongos «Presente»);
     deformidad, actividad, fototropismo y aireación se devuelven tal cual, sin juicio inventado.
   · El historial va de lo más reciente a lo más antiguo, y dentro del mismo día por el ORDEN de las etapas.
   · La alcalinidad guarda el último valor de CADA TURNO por separado: una fila sin la de noche no borra la del
     día, que es como funciona el merge de la hoja.
   · El RAS no es una sala: un filtro de sala lo deja pasar, porque su alcalinidad vale para todas.
   · Lo que una pieza no puede filtrar lo DICE.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  esMortalidad, esRevision, esAlcalinidad, VARIABLES_REVISION, ETAPAS_REVISION, TOPES_REVISION,
  revisionesDeNauplios, alcalinidadPorArea, mortalidadEnDesove, frecuenciaDeObservaciones,
} from './operativo.revisiones.js';
import { modeloOperativo, diasDeTanque } from './operativo.data.js';
import { normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX',
  Fecha: fecha, Lote: lote, 'Código genético': 'CA', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
/* Las tres clases de fila de «Maduración Mortalidad Desove» (la firma de la hoja es «Tipo de tanque»). */
const REV = (fecha, lote, etapa, v) => ({ _SheetOrigin: O, 'Tipo de tanque': '', Fecha: fecha, Lote: lote, 'Revisión': etapa, ...v });
const MORT = (fecha, lote, tipo, entran, muertas) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote,
  'Tipo de tanque': tipo, 'Hembras que entran': entran, 'Hembras muertas': muertas });
const ALC = (fecha, area, dia, noche) => ({ _SheetOrigin: O, 'Tipo de tanque': '', Fecha: fecha, 'Área': area,
  'Alcalinidad día': dia, 'Alcalinidad noche': noche });
const TQ = (fecha, sala, tanque, san, ope) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala,
  Tanque: tanque, 'Observaciones sanitarias': san, 'Observaciones operativas': ope });

const FOTO = '2026-09-20';
const PLANTA = [
  ING('2026-09-01', 'LA', 'Sala 3', 1, 100, 100),
  /* Revisiones: dos del 18 (Entrada y Postlavado) y una del 16 (Lavado). La de Postlavado trae las tres cosas
     que SÍ tienen regla: hongos presentes, salinidad por encima de 60 y temperatura por encima de 40. */
  REV('2026-09-18', 'LA', 'Entrada', { Deformidad: 'Baja', Actividad: 'Alta', Hongos: 'Ausente',
    Fototropismo: 'Alta', 'Aireación': 'Alta', Salinidad: 38, Temperatura: 29.1 }),
  REV('2026-09-18', 'LA', 'Postlavado', { Deformidad: 'Media', Actividad: 'Baja', Hongos: 'Presente',
    Fototropismo: 'Baja', 'Aireación': 'Media', Salinidad: 65, Temperatura: 41 }),
  REV('2026-09-16', 'LA', 'Lavado', { Deformidad: 'Media', Actividad: 'Media', Hongos: 'Ausente',
    Fototropismo: 'Media', 'Aireación': 'Alta', Salinidad: 37, Temperatura: 28.8 }),
  /* Una Entrada MÁS VIEJA (para que «la última de cada etapa» no dé lo mismo que «la primera») y otra FUERA
     del período de 30 días, que no debe aparecer. */
  REV('2026-09-14', 'LA', 'Entrada', { Deformidad: 'Alta', Actividad: 'Baja', Hongos: 'Ausente' }),
  REV('2026-08-01', 'LA', 'Entrada', { Deformidad: 'Baja', Actividad: 'Alta', Hongos: 'Presente' }),
  /* Mortalidad: en los dos tipos de tanque, el mismo día. */
  MORT('2026-09-17', 'LA', 'Desove', 30, 3),
  MORT('2026-09-17', 'LA', 'Recuperación', 10, 1),
  /* Alcalinidad: la Sala 1 anota la de día el 18 y SÓLO la de noche el 19. */
  ALC('2026-09-18', 'RAS', 118, 125),
  ALC('2026-09-18', 'Sala 1', 95, 120),
  ALC('2026-09-19', 'Sala 1', '', 130),
  ALC('2026-09-17', 'Sala 2', 105, ''),
  /* Observaciones de tanque. */
  TQ('2026-09-18', 'Sala 3', 1, 'Animales en muda', 'En recambio'),
  TQ('2026-09-18', 'Sala 3', 2, '', 'En recambio'),
  TQ('2026-09-17', 'Sala 3', 1, '', 'En recambio, Falta de sifoneo'),
];

const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const P30 = periodoDe('30d', FOTO, M.fuentes);
const PARTES = diasDeTanque(M.fuentes.tanques);
const SIN = normalizarFiltro({});
const F = (o) => normalizarFiltro(o);

describe('Maduración · revisiones · las tres clases de fila de la misma hoja', () => {
  it('🔴 una revisión NO es una mortalidad, ni al revés', () => {
    const rev = { 'Revisión': 'Entrada', 'Tipo de tanque': '' };
    const mort = { 'Tipo de tanque': 'Desove' };
    const alc = { 'Área': 'RAS', 'Tipo de tanque': '' };
    expect([esRevision(rev), esMortalidad(rev), esAlcalinidad(rev)]).toEqual([true, false, false]);
    expect([esRevision(mort), esMortalidad(mort), esAlcalinidad(mort)]).toEqual([false, true, false]);
    expect([esRevision(alc), esMortalidad(alc), esAlcalinidad(alc)]).toEqual([false, false, true]);
    // Una fila con etapa Y tipo de tanque es una MORTALIDAD: el tipo manda (es lo que el libro descuenta).
    const ambas = { 'Revisión': 'Entrada', 'Tipo de tanque': 'Desove' };
    expect([esRevision(ambas), esMortalidad(ambas)]).toEqual([false, true]);
    // Un tipo que no está en el catálogo no cuela como mortalidad.
    expect(esMortalidad({ 'Tipo de tanque': 'Otro' })).toBe(false);
  });

  it('🔴 y por eso la mortalidad NO cuenta las hembras de una revisión', () => {
    const m = mortalidadEnDesove(M.fuentes, SIN, P30);
    expect(m.filas.map((t) => [t.tipo, t.entran, t.muertas, t.pct])).toEqual([['Desove', 30, 3, 10], ['Recuperación', 10, 1, 10]]);
    expect([m.entran, m.muertas, m.pct]).toEqual([40, 4, 10]);
    expect(m.filas[0].lotes).toEqual(['LA']);
  });
});

describe('Maduración · revisiones · la revisión de nauplios', () => {
  it('las cinco variables y las cuatro etapas, con sus catálogos', () => {
    expect(VARIABLES_REVISION.map((v) => v.id)).toEqual(['deformidad', 'actividad', 'hongos', 'fototropismo', 'aireacion']);
    expect(ETAPAS_REVISION).toEqual(['Entrada', 'Lavado', 'Lavado 2', 'Postlavado']);
    expect(TOPES_REVISION.salinidad.max).toBe(60);
    expect(TOPES_REVISION.temperatura.max).toBe(40);
  });

  it('🔴 SÓLO llevan veredicto las tres reglas que existen; las otras cuatro van sin juicio', () => {
    expect(VARIABLES_REVISION.filter((v) => v.veredicto).map((v) => v.id)).toEqual(['hongos']);
    const r = revisionesDeNauplios(M.fuentes, SIN, P30);
    const post = r.filas.find((f) => f.etapa === 'Postlavado');
    const entrada = r.filas.find((f) => f.etapa === 'Entrada');
    // Los valores cualitativos se devuelven TAL CUAL, sin convertirse en ok/mal.
    expect(post.valores).toEqual({ deformidad: 'Media', actividad: 'Baja', hongos: 'Presente', fototropismo: 'Baja', aireacion: 'Media' });
    expect(entrada.valores.deformidad).toBe('Baja');
    // Y las tres que sí tienen regla, marcadas.
    expect(post.hongos).toBe(true);
    expect(post.salinidad).toEqual({ valor: 65, aviso: true, max: 60, unidad: '‰' });
    expect(post.temperatura).toEqual({ valor: 41, aviso: true, max: 40, unidad: '°C' });
    expect(entrada.hongos).toBe(false);
    expect(entrada.salinidad.aviso).toBe(false);
    expect(entrada.temperatura.aviso).toBe(false);
  });

  it('🔴 el historial va de lo más reciente a lo más antiguo, y dentro del día POR EL ORDEN DE LAS ETAPAS', () => {
    const r = revisionesDeNauplios(M.fuentes, SIN, P30);
    // El 18 hay dos: Postlavado va DESPUÉS de Entrada en la tanda, así que es la más reciente de ese día.
    expect(r.filas.map((f) => [f.fecha, f.etapa])).toEqual([
      ['2026-09-18', 'Postlavado'], ['2026-09-18', 'Entrada'], ['2026-09-16', 'Lavado'], ['2026-09-14', 'Entrada'],
    ]);
    // La del 01/08 queda FUERA del período de 30 días, y su 'Presente' no ensucia los avisos.
    expect(r.filas.some((f) => f.fecha === '2026-08-01')).toBe(false);
    expect(r.ultima.etapa).toBe('Postlavado');
  });

  it('cada etapa guarda su última, aunque sean de días distintos, y «Lavado 2» no se inventa', () => {
    const r = revisionesDeNauplios(M.fuentes, SIN, P30);
    expect(r.porEtapa.map((e) => [e.etapa, e.ultima ? e.ultima.fecha : null])).toEqual([
      ['Entrada', '2026-09-18'], ['Lavado', '2026-09-16'], ['Lavado 2', null], ['Postlavado', '2026-09-18'],
    ]);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].etapa).toBe('Postlavado');
  });

  it('honra el lote y DICE lo que no puede filtrar: una revisión es de un lote, no de una ubicación', () => {
    expect(revisionesDeNauplios(M.fuentes, F({ lote: 'LA' }), P30).filas).toHaveLength(4);
    expect(revisionesDeNauplios(M.fuentes, F({ lote: 'OTRO' }), P30).filas).toEqual([]);
    expect(revisionesDeNauplios(M.fuentes, F({ sala: 'Sala 3', tanque: 1 }), P30).ignora).toEqual(['sala', 'tanque']);
    expect(revisionesDeNauplios(M.fuentes, F({ sala: 'Sala 3' }), P30).filas).toHaveLength(4);   // no las esconde
    expect(revisionesDeNauplios(M.fuentes, SIN, P30).ignora).toEqual([]);
  });
});

describe('Maduración · revisiones · la alcalinidad por área', () => {
  it('🔴 cada TURNO guarda su última lectura por separado: una fila sin la de noche no borra la del día', () => {
    const a = alcalinidadPorArea(M.fuentes, SIN, P30);
    expect(a.areas.map((x) => x.area)).toEqual(['RAS', 'Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5']);
    const s1 = a.areas.find((x) => x.area === 'Sala 1');
    // El 18 trajo día 95 y noche 120; el 19, SÓLO noche 130. El día se queda en el 95 del 18.
    expect(s1.dia).toMatchObject({ valor: 95, fecha: '2026-09-18', estado: 'bajo' });
    expect(s1.noche).toMatchObject({ valor: 130, fecha: '2026-09-19', estado: 'ok' });
    const s2 = a.areas.find((x) => x.area === 'Sala 2');
    expect(s2.dia).toMatchObject({ valor: 105, estado: 'ok' });
    expect(s2.noche).toMatchObject({ valor: null, estado: '' });      // sin lectura: sin veredicto
    expect(a.areas.find((x) => x.area === 'Sala 3').dia.valor).toBe(null);
    expect(a.conDato).toBe(3);
    expect(a.umbral).toMatchObject({ min: 100 });
  });

  it('🔴 el RAS no es una sala: pasa el filtro de sala, porque alimenta a todas', () => {
    const a = alcalinidadPorArea(M.fuentes, F({ sala: 'Sala 1' }), P30);
    expect(a.areas.map((x) => x.area)).toEqual(['RAS', 'Sala 1']);
    expect(a.areas.find((x) => x.area === 'RAS').esRas).toBe(true);
    expect(a.areas.find((x) => x.area === 'Sala 1').esRas).toBe(false);
  });
});

describe('Maduración · revisiones · la frecuencia de las observaciones', () => {
  it('🔴 cuenta UNA por (día, sala, tanque) y ordena de la más frecuente a la menos', () => {
    const f = frecuenciaDeObservaciones(PARTES, SIN, P30);
    // «En recambio» está en los tres partes; «Falta de sifoneo» y «Animales en muda», en uno cada uno.
    expect(f.operativas.map((x) => [x.obs, x.veces, x.tanques])).toEqual([
      ['En recambio', 3, 2], ['Falta de sifoneo', 1, 1],
    ]);
    expect(f.sanitarias.map((x) => [x.obs, x.veces])).toEqual([['Animales en muda', 1]]);
    expect(f.registros).toBe(3);
    expect(f.operativas[0].pct).toBe(100);
  });

  it('honra sala y tanque, y dice que el lote no puede', () => {
    expect(frecuenciaDeObservaciones(PARTES, F({ sala: 'Sala 3', tanque: 2 }), P30).operativas.map((x) => x.obs)).toEqual(['En recambio']);
    expect(frecuenciaDeObservaciones(PARTES, F({ sala: 'Sala 4' }), P30).registros).toBe(0);
    expect(frecuenciaDeObservaciones(PARTES, F({ lote: 'LA' }), P30).ignora).toEqual(['lote']);
  });

  it('sin partes ni filas, todo vacío y sin lanzar (es lo que hay en producción hoy)', () => {
    expect(frecuenciaDeObservaciones([], SIN, P30)).toMatchObject({ sanitarias: [], operativas: [], registros: 0 });
    expect(revisionesDeNauplios({ mortDesove: [] }, SIN, P30).filas).toEqual([]);
    expect(mortalidadEnDesove({ mortDesove: [] }, SIN, P30).entran).toBe(0);
    expect(alcalinidadPorArea({ mortDesove: [] }, SIN, P30).conDato).toBe(0);
  });
});
