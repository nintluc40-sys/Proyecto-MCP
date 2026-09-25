/* ============================================================
   MADURACIÓN · OPERATIVO — el mapa de planta: capas, colores y lienzo (0f · 3, 2026-09-25)

   Qué se exige, con una planta en la que cada regla EQUIVOCADA da otro resultado:
   · MORTALIDAD por día de parte: MA suma MÁS bajas (6) pero en más partes (1 por parte); MB suma menos (4) en dos
     partes (2 por parte). La más alta es MB; con la suma sería MA.
   · CÓPULAS con las hembras del tanque ESE día: MB copula 3 por parte con 10 hembras (30 %) y MA 4 con 20 (20 %).
     La más alta es MB; sumando cópulas, o por parte, sería MA.
   · ÚLTIMO PARTE hasta la foto: un parte de MB con fecha POSTERIOR a la foto no cuenta (sería «hoy»).
   · LOTE frente a CÓDIGO: MF es UN lote con DOS códigos: por lote tiene su color; por código, su PAREJA «CA/CB» es su
     categoría (decisión del usuario, 2026-09-25) —la misma que el tanque de MD (CA) y ME (CB), aunque MF entró con CB
     PRIMERO: la pareja se reconoce venga en el orden que venga—. Y MG y MH son DOS lotes del MISMO código: por lote,
     rayado; por código, su color.
   · La PALETA va por orden de NOMBRE, no de aparición: M0 (código C0) está en el último tanque y es el primero.
   · DÍAS: los del Saldo, en la sala; MA pasa de 60 en producción y MF tiene 60 JUSTOS (no resalta); un tanque con un
     lote en cuarentena y otro en producción no tiene «sus días»; con dos en cuarentena, manda el que MÁS lleva.
   · Un tanque VACÍO es vacío en todos los modos.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  PALETA, PALETA_NUMERO_BLANCO, GRUPOS_MAPA, capasDelMapa, contextoDelMapa, colorDeTanque, leyendaDelMapa, resumenDeTanque,
} from './operativo.mapa.js';
import { modeloOperativo, diasDeTanque, serieDiaria } from './operativo.data.js';
import { periodoDe, normalizarFiltro, mapaDePlanta, MODOS_MAPA } from './operativo.tablero.js';
import { cargasPorTanque } from './operativo.tanques.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { sumarDias } from '../registros/lib/mad-libro.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: fecha,
  Lote: lote, 'Código genético': cg, 'Piscina Broodstock': 'P1', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const dias = (desde, n) => Array.from({ length: n }, (_, i) => sumarDias(desde, i));

const FOTO = '2026-09-19';
/* Con «7 d», el período va del 13 al 19/09.
   · MA — Sala 1, tanque 1 (10♂ 20♀, CA), ingreso 01/07: produce desde el 16/07 → 65 días. Partes del 13 al 18/09
     con 1 baja y 4 cópulas cada uno; el del 13 trae pesos (la única carga del mapa).
   · MB — Sala 1, tanque 2 (10♂ 10♀, CB), ingreso 20/08: produce desde el 04/09 → 15 días. Partes el 14 y el 15/09
     con 2 bajas y 3 cópulas; y uno del 20/09, POSTERIOR a la foto.
   · MC — Sala 2, tanque 16 (5♂ 5♀, CA), ingreso 10/09: 9 días de cuarentena. Su tanque sólo tiene un parte, del 01/09.
   · MG y MH — Sala 2, tanque 17, los dos de CA y en cuarentena: MG entró el 05/09 (14 días), MH el 15/09 (4).
   · MD y ME — Sala 4, tanque 2: MD (4♂ 4♀, CA) entró el 12/09, en cuarentena; ME (2♂ 2♀, CB), el 01/07, en
     producción. Un parte del 18/09 sin bajas ni cópulas.
   · MF — Sala 5, tanque 7: UN lote con DOS códigos (6♂ 3♀ de CA y 6♂ 3♀ de CB), ingreso 06/07 → 60 días justos;
     H:M 0,5. Partes del 12/09 (fuera del período) y del 19/09.
   · M0 — Sala 5, tanque 8 (5♂ 5♀, código C0), ingreso 01/08 → 34 días. Sin partes. */
const PLANTA = [
  ING('2026-07-01', 'MA', 'Sala 1', 1, 10, 20, 'CA'),
  ING('2026-08-20', 'MB', 'Sala 1', 2, 10, 10, 'CB'),
  ING('2026-09-10', 'MC', 'Sala 2', 16, 5, 5, 'CA'),
  ING('2026-09-05', 'MG', 'Sala 2', 17, 3, 3, 'CA'),
  ING('2026-09-15', 'MH', 'Sala 2', 17, 3, 3, 'CA'),
  ING('2026-09-12', 'MD', 'Sala 4', 2, 4, 4, 'CA'),
  ING('2026-07-01', 'ME', 'Sala 4', 2, 2, 2, 'CB'),
  ING('2026-07-06', 'MF', 'Sala 5', 7, 6, 3, 'CB'),   // CB antes que CA, a propósito (ver la cabecera)
  ING('2026-07-06', 'MF', 'Sala 5', 7, 6, 3, 'CA'),
  ING('2026-08-01', 'M0', 'Sala 5', 8, 5, 5, 'C0'),
  ...dias('2026-09-13', 6).map((f, i) => TQ(f, 'Sala 1', 1, { 'Machos muertos': 1, 'Cópulas': 4,
    ...(i === 0 ? { 'Peso promedio hembras (g)': 40, 'Peso promedio machos (g)': 30 } : {}) })),
  TQ('2026-09-14', 'Sala 1', 2, { 'Machos muertos': 2, 'Cópulas': 3 }),
  TQ('2026-09-15', 'Sala 1', 2, { 'Machos muertos': 2, 'Cópulas': 3 }),
  TQ('2026-09-20', 'Sala 1', 2, { 'Machos muertos': 1 }),
  TQ('2026-09-01', 'Sala 2', 16, { 'Observaciones operativas': 'Limpieza' }),
  TQ('2026-09-18', 'Sala 4', 2, {}),
  TQ('2026-09-12', 'Sala 5', 7, {}),
  TQ('2026-09-19', 'Sala 5', 7, {}),
];
const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const P7 = periodoDe('7d', FOTO, M.fuentes);
const SERIE = serieDiaria(M.fuentes, sumarDias(P7.desde, -1), P7.hasta);
const PARTES = diasDeTanque(M.fuentes.tanques);
const MAPA = mapaDePlanta(M.libro, normalizarFiltro({}));
const CAPAS = capasDelMapa(M, SERIE, PARTES, P7);
const CTX = contextoDelMapa(MAPA, CAPAS, M.fecha);
const celda = (sala, t) => MAPA.salas.find((s) => s.sala === sala).tanques.find((x) => x.tanque === t);
const color = (sala, t, modo) => colorDeTanque(celda(sala, t), modo, CTX);
const leyenda = (modo) => leyendaDelMapa(MAPA, modo, CTX).map((x) => [x.etiqueta, x.n]);

describe('Maduración · mapa · las capas de cada tanque', () => {
  it('los partes del período: bajas por día de parte y % de cópulas con las hembras del tanque ese día', () => {
    expect(CAPAS.capas.get('Sala 1|1')).toMatchObject({ partes: 6, bajas: 6, mortalidad: 1, copulas: 24, hembrasDia: 120, pctCopulas: 20 });
    expect(CAPAS.capas.get('Sala 1|2')).toMatchObject({ partes: 2, bajas: 4, mortalidad: 2, copulas: 6, hembrasDia: 20, pctCopulas: 30 });
    expect(CAPAS.capas.get('Sala 5|7')).toMatchObject({ partes: 1, bajas: 0, mortalidad: 0, pctCopulas: 0 });
  });

  it('el ÚLTIMO parte llega hasta la foto, aunque sea de antes del período; el de después no cuenta', () => {
    expect(CAPAS.capas.get('Sala 1|2').ultimoParte).toBe('2026-09-15');
    expect(CAPAS.capas.get('Sala 2|16')).toMatchObject({ ultimoParte: '2026-09-01', partes: 0, mortalidad: '', pctCopulas: '' });
    expect(CAPAS.capas.get('Sala 5|7').ultimoParte).toBe('2026-09-19');
  });

  it('la carga métrica es la de cargasPorTanque; sin pesos, vacía', () => {
    const c = cargasPorTanque(M).get('Sala 1|1').cargaMetrica;
    expect(typeof c).toBe('number');
    expect(CAPAS.capas.get('Sala 1|1').carga).toBe(c);
    expect(CTX.max.carga).toBe(c);
    expect(CAPAS.capas.get('Sala 1|2').carga).toBe('');
  });

  it('los días de cada lote en cada sala son los del Saldo', () => {
    expect(CAPAS.dias.get('MA|Sala 1')).toEqual({ estado: 'Producción', dias: 65 });
    expect(CAPAS.dias.get('MB|Sala 1')).toEqual({ estado: 'Producción', dias: 15 });
    expect(CAPAS.dias.get('MC|Sala 2')).toEqual({ estado: 'Cuarentena', dias: 9 });
    expect(CAPAS.dias.get('MD|Sala 4')).toEqual({ estado: 'Cuarentena', dias: 7 });
  });

  it('la paleta va por orden de NOMBRE (M0 y C0, en el último tanque, van primero); el máximo, el del mapa', () => {
    expect([...CTX.lotes.keys()]).toEqual(['M0', 'MA', 'MB', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH']);
    expect([...CTX.lotes.values()]).toEqual(PALETA.slice(0, 9));
    // Por CÓDIGO, las categorías son las COMBINACIONES de los tanques ocupados (la pareja «CA/CB» es una más).
    expect([...CTX.codigos.entries()]).toEqual([['C0', PALETA[0]], ['CA', PALETA[1]], ['CA/CB', PALETA[2]], ['CB', PALETA[3]]]);
    expect([CTX.max.mortalidad, CTX.max.copulas]).toEqual([2, 30]);
  });
});

describe('Maduración · mapa · los ocho colores nuevos', () => {
  it('son los que aprobó el usuario, en tres grupos', () => {
    expect(GRUPOS_MAPA.map((g) => g.grupo)).toEqual(['lote', 'tanque', 'partes']);
    for (const g of GRUPOS_MAPA) expect(MODOS_MAPA.some((x) => x.grupo === g.grupo), g.grupo).toBe(true);
  });

  it('la PALETA se lee: en tema claro, sobre cada color su número (oscuro, o blanco en los oscuros) llega a 4,5:1', () => {
    // Fórmula de WCAG, aquí aparte (no la del código). El fondo es el de operativo.css: el color al 85 % sobre la superficie
    // blanca del tema claro; el número oscuro es su --c-text (#1f2a30). Decisión del usuario del 2026-09-25.
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const contraste = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const c of PALETA) {
      const fondo = rgb(c).map((x) => x * 0.85 + 255 * 0.15);
      const numero = PALETA_NUMERO_BLANCO.has(c) ? [255, 255, 255] : rgb('#1f2a30');
      expect(contraste(fondo, numero), c).toBeGreaterThanOrEqual(4.5);
    }
    expect([...PALETA_NUMERO_BLANCO].filter((c) => !PALETA.includes(c))).toEqual([]);
  });

  it('un tanque VACÍO es vacío en todos los modos', () => {
    for (const modo of ['lote', 'codigo', 'dias', 'hm', 'carga', 'mortalidad', 'copulas', 'parte']) {
      expect(color('Sala 1', 3, modo), modo).toMatchObject({ clase: 'is-e-vacio', clave: 'vacio' });
    }
  });

  it('LOTE: su color en todos sus tanques; dos lotes, rayado; MF (un lote con dos códigos) tiene color', () => {
    expect(color('Sala 1', 1, 'lote')).toEqual({ clase: 'is-cat', estilo: '--mop-c:' + PALETA[1], clave: 'MA', texto: 'MA' });
    expect(color('Sala 4', 2, 'lote')).toMatchObject({ clase: 'is-varios', clave: 'varios' });
    expect(color('Sala 2', 17, 'lote')).toMatchObject({ clase: 'is-varios', clave: 'varios', texto: 'varios lotes' });
    // MF cae en el marrón de la paleta, uno de los oscuros: su número va BLANCO (`is-tx-cla`); el de MA (verde), oscuro.
    expect(color('Sala 5', 7, 'lote')).toMatchObject({ clase: 'is-cat is-tx-cla', estilo: '--mop-c:' + PALETA[6] });
    expect(color('Sala 5', 8, 'lote')).toMatchObject({ clase: 'is-cat', estilo: '--mop-c:' + PALETA[0], clave: 'M0' });
    // la leyenda: los lotes con tanque PROPIO (MD, ME, MG y MH sólo están en tanques compartidos), los varios, los vacíos
    expect(leyenda('lote')).toEqual([['M0', 1], ['MA', 1], ['MB', 1], ['MC', 1], ['MF', 1], ['Varios lotes', 2], ['Vacío', 31]]);
  });

  it('CÓDIGO: la pareja es su propia categoría —MF (CB y CA) y el tanque de MD (CA) con ME (CB) son la MISMA «CA/CB»—; MG y MH, dos lotes del mismo código, tienen el suyo', () => {
    expect(color('Sala 1', 1, 'codigo')).toMatchObject({ clase: 'is-cat', estilo: '--mop-c:' + PALETA[1], clave: 'CA' });
    expect(color('Sala 1', 2, 'codigo')).toMatchObject({ clave: 'CB' });
    expect(color('Sala 2', 17, 'codigo')).toMatchObject({ clase: 'is-cat', clave: 'CA' });
    // 0f · 3 (decisión del usuario, 2026-09-25): antes una pareja iba RAYADA («varios códigos») y no decía cuál era.
    expect(color('Sala 5', 7, 'codigo')).toEqual({ clase: 'is-cat', estilo: '--mop-c:' + PALETA[2], clave: 'CA/CB', texto: 'CA/CB' });
    expect(color('Sala 4', 2, 'codigo')).toEqual(color('Sala 5', 7, 'codigo'));
    expect(leyenda('codigo')).toEqual([['C0', 1], ['CA', 3], ['CA/CB', 2], ['CB', 1], ['Sin código', 0], ['Vacío', 31]]);
  });

  it('DÍAS: más de 60 en producción resalta (60 justos, no); la cuarentena, por sus 15 días; dos estados, «distintos»', () => {
    expect(color('Sala 1', 1, 'dias')).toEqual({ clase: 'is-pr60', estilo: '', clave: 'mas', texto: '65 d en producción' });
    // Sin `is-claro` desde el 2026-09-25: el color del número lo pone operativo.css según el tema (decisión del usuario).
    expect(color('Sala 1', 2, 'dias')).toEqual({ clase: 'is-pr', estilo: '--mop-i:36%', clave: 'produccion', texto: '15 d en producción' });
    expect(color('Sala 2', 16, 'dias')).toEqual({ clase: 'is-q', estilo: '--mop-i:66%', clave: 'cuarentena', texto: '9 d en cuarentena' });
    // dos lotes en cuarentena: manda el que más lleva (MG, 14 días), no MH (4)
    expect(color('Sala 2', 17, 'dias')).toEqual({ clase: 'is-q', estilo: '--mop-i:94%', clave: 'cuarentena', texto: '14 d en cuarentena' });
    expect(color('Sala 4', 2, 'dias')).toMatchObject({ clase: 'is-e-mixto', clave: 'mixto' });
    expect(color('Sala 5', 7, 'dias')).toEqual({ clase: 'is-pr', estilo: '--mop-i:100%', clave: 'produccion', texto: '60 d en producción' });
    expect(color('Sala 5', 8, 'dias')).toMatchObject({ clase: 'is-pr', estilo: '--mop-i:63%' });
    expect(leyenda('dias')).toEqual([['Cuarentena (hasta 15 d)', 2], ['Producción (hasta 60 d)', 3], ['Más de 60 d en producción', 1],
      ['Lotes en estados distintos', 1], ['Sin estado', 0], ['Vacío', 31]]);
  });

  it('H:M: el semáforo bibliográfico (1–2 hembras por macho); el globo lo dice en palabras (la cifra ya la lleva)', () => {
    expect(color('Sala 1', 1, 'hm')).toMatchObject({ clase: 'is-d-alto', texto: 'H:M por encima de su rango' });
    expect(color('Sala 1', 2, 'hm')).toMatchObject({ clase: 'is-d-ok', texto: 'H:M dentro de su rango' });
    expect(color('Sala 5', 7, 'hm')).toMatchObject({ clase: 'is-d-bajo', texto: 'H:M por debajo de su rango' });
    expect(leyenda('hm').map(([, n]) => n)).toEqual([5, 1, 1, 0, 31]);
  });

  it('MORTALIDAD: por día de parte —la más alta es MB, no MA, que suma más—; sin partes, gris', () => {
    expect(color('Sala 1', 2, 'mortalidad')).toMatchObject({ clase: 'is-im', estilo: '--mop-i:100%', texto: '2 bajas por día de parte' });
    expect(color('Sala 1', 1, 'mortalidad')).toMatchObject({ clase: 'is-im', estilo: '--mop-i:58%' });
    expect(color('Sala 4', 2, 'mortalidad')).toMatchObject({ clase: 'is-im', estilo: '--mop-i:15%' });
    expect(color('Sala 2', 16, 'mortalidad')).toMatchObject({ clase: 'is-sd', clave: 'sin', texto: 'sin partes en el período' });
    expect(leyenda('mortalidad')).toEqual([['Menos', ''], ['El más alto: 2 bajas por día de parte', 4], ['Sin partes en el período', 3], ['Vacío', 31]]);
  });

  it('CÓPULAS: con las hembras del tanque ese día —la más alta es MB (30 %), no MA (20 %)—', () => {
    expect(color('Sala 1', 2, 'copulas')).toMatchObject({ clase: 'is-ic', estilo: '--mop-i:100%', texto: '30 % de cópulas' });
    expect(color('Sala 1', 1, 'copulas')).toMatchObject({ clase: 'is-ic', estilo: '--mop-i:72%' });
    expect(color('Sala 2', 16, 'copulas')).toMatchObject({ clase: 'is-sd' });
  });

  it('CARGA: la del Saldo, con coma decimal en el globo; sin pesos, gris', () => {
    expect(color('Sala 1', 1, 'carga')).toMatchObject({ clase: 'is-ik', estilo: '--mop-i:100%' });
    expect(CTX.max.carga % 1).not.toBe(0);   // el fixture da una carga con decimales: si no, esta prueba no diría nada
    expect(color('Sala 1', 1, 'carga').texto).toMatch(/^\d+,\d{1,2} g\/m²$/);
    expect(color('Sala 1', 2, 'carga')).toMatchObject({ clase: 'is-sd', texto: 'sin peso registrado' });
  });

  it('ÚLTIMO PARTE: hoy, ayer, esta semana, antiguo (el de MB del 20/09, posterior a la foto, no cuenta)', () => {
    expect(color('Sala 5', 7, 'parte')).toMatchObject({ clase: 'is-p-hoy', texto: 'último parte el 19/09' });
    expect(color('Sala 1', 1, 'parte')).toMatchObject({ clase: 'is-p-ayer' });
    expect(color('Sala 1', 2, 'parte')).toMatchObject({ clase: 'is-p-semana', texto: 'último parte el 15/09' });
    expect(color('Sala 2', 16, 'parte')).toMatchObject({ clase: 'is-p-antiguo' });
    expect(color('Sala 5', 8, 'parte')).toMatchObject({ clase: 'is-p-sin', texto: 'sin ningún parte' });
    expect(leyenda('parte').map(([, n]) => n)).toEqual([1, 2, 1, 1, 2, 31]);
  });

  it('un modo desconocido no pinta nada (la vista cae en los de siempre)', () => {
    expect(color('Sala 1', 1, 'otro')).toEqual({ clase: '', estilo: '', clave: '', texto: '' });
    expect(leyendaDelMapa(MAPA, 'otro', CTX)).toEqual([]);
  });
});

/* Los datos IMPOSIBLES de los partes se DICEN, no se esconden ni se corrigen (decisión del usuario, 2026-09-25, a raíz
   de un parte real con más cópulas que hembras en el tanque). Una planta aparte para no mover las cifras de la de arriba:
   · NA — Sala 1, tanque 1 (2♂ 5♀): 1 cópula el 17/09 y 12 el 18/09 → 13 ÷ (5 + 5) = 130 %, IMPOSIBLE.
   · NB — Sala 2, tanque 16 (2♂ 10♀), ingresa el 15/09: 3 cópulas el 14/09 —el libro aún no tiene hembras ahí— y 2 el
     16/09 → el % es 2 ÷ 10 = 20 % (el único normal: fija la escala) y las 3 se cuentan aparte. */
describe('Maduración · mapa · los datos IMPOSIBLES se dicen', () => {
  const PL = [
    ING('2026-08-01', 'NA', 'Sala 1', 1, 2, 5, 'CA'),
    ING('2026-09-15', 'NB', 'Sala 2', 16, 2, 10, 'CB'),
    TQ('2026-09-17', 'Sala 1', 1, { 'Cópulas': 1 }),
    TQ('2026-09-18', 'Sala 1', 1, { 'Cópulas': 12 }),
    TQ('2026-09-14', 'Sala 2', 16, { 'Cópulas': 3 }),
    TQ('2026-09-16', 'Sala 2', 16, { 'Cópulas': 2 }),
  ];
  const M2 = modeloOperativo(PL, { hoy: FOTO, fecha: FOTO });
  const P2 = periodoDe('7d', FOTO, M2.fuentes);
  const S2 = serieDiaria(M2.fuentes, sumarDias(P2.desde, -1), P2.hasta);
  const PA2 = diasDeTanque(M2.fuentes.tanques);
  const MP2 = mapaDePlanta(M2.libro, normalizarFiltro({}));
  const CX2 = contextoDelMapa(MP2, capasDelMapa(M2, S2, PA2, P2), M2.fecha);
  const celda2 = (sala, t) => MP2.salas.find((s) => s.sala === sala).tanques.find((x) => x.tanque === t);

  it('MÁS cópulas que hembras: se enseña como vino, MARCADO, con su entrada en la leyenda, y no fija la escala', () => {
    expect(colorDeTanque(celda2('Sala 1', 1), 'copulas', CX2))
      .toEqual({ clase: 'is-imposible', estilo: '', clave: 'imposible', texto: '130 % de cópulas · ⚠ más cópulas que hembras' });
    expect(CX2.max.copulas).toBe(20);
    expect(colorDeTanque(celda2('Sala 2', 16), 'copulas', CX2)).toMatchObject({ clase: 'is-ic', estilo: '--mop-i:100%' });
    expect(leyendaDelMapa(MP2, 'copulas', CX2).map((x) => [x.etiqueta, x.n])).toContainEqual(['Más cópulas que hembras', 1]);
  });

  it('las cópulas de un día SIN hembras en el libro no entran en el %, y el lienzo las cuenta aparte', () => {
    expect(resumenDeTanque(celda2('Sala 2', 16), CX2, S2, PA2, P2).periodo).toMatchObject({ copulas: 5, pctCopulas: 20, copulasSinHembras: 3 });
    expect(resumenDeTanque(celda2('Sala 1', 1), CX2, S2, PA2, P2).periodo).toMatchObject({ copulas: 13, pctCopulas: 130, copulasSinHembras: 0 });
  });
});

describe('Maduración · mapa · el lienzo de un tanque', () => {
  it('sus lotes con su código, su estado EN LA SALA y sus días; lo del período; su último parte; su curva', () => {
    const r = resumenDeTanque(celda('Sala 1', 1), CTX, SERIE, PARTES, P7);
    expect(r).toMatchObject({ sala: 'Sala 1', tanque: 1, vacio: false, fueraDeCatalogo: false,
      lotes: [{ lote: 'MA', codigos: ['CA'], estado: 'Producción', dias: 65, machos: 4, hembras: 20 }],
      vivos: { machos: 4, hembras: 20, total: 24 }, hm: 5, hmEstado: 'alto',
      periodo: { diasConParte: 6, bajas: 6, descartes: 0, copulas: 24, muda: 0, pctCopulas: 20 }, ultimoParte: '2026-09-18' });
    expect(r.cargaMetrica).toBe(CTX.max.carga);
    expect(r.curva.map((d) => d.fecha)).toEqual(dias('2026-09-12', 8));
    expect(r.curva.map((d) => d.total)).toEqual([30, 29, 28, 27, 26, 25, 24, 24]);
  });

  it('lo del PERÍODO (el parte de MB posterior a la foto no cuenta) y el último parte HASTA la foto (el de MC es de antes)', () => {
    expect(resumenDeTanque(celda('Sala 1', 2), CTX, SERIE, PARTES, P7)).toMatchObject({
      periodo: { diasConParte: 2, bajas: 4, copulas: 6, pctCopulas: 30 }, ultimoParte: '2026-09-15' });
    expect(resumenDeTanque(celda('Sala 2', 16), CTX, SERIE, PARTES, P7)).toMatchObject({
      periodo: { diasConParte: 0, bajas: 0, pctCopulas: '' }, ultimoParte: '2026-09-01' });
  });

  it('un tanque compartido dice los días de CADA lote en su propio estado', () => {
    const r = resumenDeTanque(celda('Sala 4', 2), CTX, SERIE, PARTES, P7);
    expect(r.lotes.map((l) => [l.lote, l.estado, l.dias])).toEqual([['MD', 'Cuarentena', 7], ['ME', 'Producción', 65]]);
  });

  it('un tanque vacío: vacío, sin lotes; y su último parte si lo tuvo', () => {
    const r = resumenDeTanque(celda('Sala 1', 3), CTX, SERIE, PARTES, P7);
    expect(r).toMatchObject({ vacio: true, lotes: [], vivos: { total: 0 }, ultimoParte: '', periodo: { diasConParte: 0 } });
  });

  it('modelos DEGENERADOS: sin filas, sin serie, sin partes, sin período: no lanza', () => {
    const vacio = modeloOperativo([], { hoy: FOTO, fecha: FOTO });
    const mp = mapaDePlanta(vacio.libro, normalizarFiltro({}));
    for (const args of [[vacio, [], [], P7], [vacio, null, null, null], [{}, undefined, undefined, undefined]]) {
      const cx = contextoDelMapa(mp, capasDelMapa(...args), FOTO);
      for (const m of MODOS_MAPA) expect(leyendaDelMapa(mp, m.clave, cx)).toBeInstanceOf(Array);
      expect(resumenDeTanque(mp.salas[0].tanques[0], cx, args[1], args[2], args[3] || P7)).toMatchObject({ vacio: true });
    }
  });
});
