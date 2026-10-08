// @vitest-environment happy-dom
/* ============================================================
   PLANTA · 📊 Análisis en el DOM — la tabla «Detalle por tanque» (T2, 2026-10-06, usuario)
   Lo que se exige: sin datos dice que carga; con datos, sólo los tanques activos del área elegida, con la causa de la
   alerta marcada; un encabezado ordena (y el mismo invierte); «sólo en alerta» filtra; el área cambia la tabla; tocar
   una fila abre ese tanque en su módulo o sala; y un refresco conserva área, filtro y orden. Los textos se escriben como
   texto (un lote con marcas no crea elementos). Fixtures con la forma de estado.js; los números de tanque, del plano.
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import { montarAnalisis } from './analisis.js';
import { LARV, MAT, OTHERS } from './plano.js';
import { MAD_HEX } from './textos.js';
import { guardarMeta } from './meta.js';

const etapa = { key: 'cos', label: 'Cosecha', color: '#123456' };
const n1 = LARV[0].num(0, 0), n2 = LARV[0].num(0, 1);           // dos tanques del Módulo 1
const s1 = MAT[0].circ.num(2, 0), s2 = MAT[0].circ.num(2, 1);   // dos de la Sala 1
const tqLarv = (over) => ({ estado: 'cultivo', nombre: 'TQ', estadio: 'PL5', sv: 80, pop: 1e6, od: 5, tmp: 30, alerta: false, motivos: [], etapa, lotes: ['BN'], ...over });
const tqMad = (over) => ({ estado: 'Producción', vivos: 20, hembras: 10, machos: 10, hm: 1, hmEstado: 'ok', densidad: 4, densidadEstado: 'ok',
  lotes: [{ lote: 'BN', estado: 'Producción', dias: 30, codigos: [] }], periodo: { bajas: 1, descartes: 0, copulas: 3, pctCopulas: 4.3, diasConParte: 7 },
  ultimoParte: '2026-10-05', alerta: false, motivos: [], ...over });
function estado() {
  const M1 = { estado: 'cultivo', corrida: '597', despachando: false, siembra: { fecha: new Date(2026, 8, 14), tanques: 2, nauplios: 9.6e6 },
    estadio: 'PL5', dias: 20, etapa, sv: 70, mort: 30, pop: 2e6, plg: null, od: 5, tmp: 30, tecnicos: ['Técnico A'], lotes: ['BN'],
    fresco: { label: 'hoy' }, motivos: [], cuenta: { cultivo: 2, vacio: 0, despachado: 0, fuera: 0, alerta: 1 },
    tanques: { [n1]: tqLarv({ sv: 61, alerta: true, motivos: ['Superv.'], lotes: ['<b>X</b>'] }), [n2]: tqLarv({ sv: 92 }) } };
  const S1 = { registrado: { estado: 'Producción', fecha: '2026-10-01' }, propuesto: { estado: 'Producción' }, coinciden: true, ocupados: 2, total: 15,
    fueraDeCatalogo: 0, hembras: 20, machos: 20, lotes: ['BN'], periodo: { bajas: 2, descartes: 0, copulas: 6 }, lecturas: { temperatura: null, oxigeno: null },
    alertaTanques: 1, alerta: false, motivos: [], tanques: { [s1]: tqMad({ hm: 2.5, alerta: true, motivos: ['H:M'] }), [s2]: tqMad() } };
  const tr = (key, label, desde, hasta, dias) => ({ key, label, range: '', color: '#123456', desde, hasta, dias });
  const crono = { hasta: '2026-10-06', modulos: {   // los demás módulos no vienen: «sin corrida»
    M1: { tipo: 'cultivo', corrida: '597', inicio: '2026-09-17', fin: '2026-10-06', dias: 20, estadio: 'PL5', despacho: { desde: '2026-10-05', hasta: '2026-10-05' },
      tramos: [tr('desarrollo', 'Desarrollo', '2026-09-17', '2026-09-30', 14), tr('transferencia', 'Transferencia', '2026-10-01', '2026-10-06', 6)] },
    M2: { tipo: 'desinfeccion', corrida: '602', ultimo: '2026-10-03' } } };
  return { modulos: { M1 }, resumen: null, mad: { salas: { S1 }, resumen: null, reemplazo: null }, cifras: null, mes: null, crono };
}

let host, v;
const $ = (s) => host.querySelector(s);
const filas = () => [...host.querySelectorAll('.an-tq-tabla tbody tr')].map((tr) => tr.querySelector('th').textContent);
const ordenar = (texto) => [...host.querySelectorAll('.an-tq-tabla thead button')].find((b) => b.textContent.startsWith(texto)).click();
beforeEach(() => { document.body.innerHTML = ''; host = document.createElement('div'); document.body.append(host); v = montarAnalisis(host); });

describe('📊 Análisis · detalle por tanque', () => {
  it('sin datos dice que carga; con datos, los activos de larvicultura con la causa marcada', () => {
    expect($('[data-k="tabla-vacio"]').hidden).toBe(false);
    expect($('[data-k="tabla-vacio"]').textContent).toBe('Cargando datos de producción…');
    expect($('[data-k="tabla-caja"]').hidden).toBe(true);
    v.pintarEstado(estado());
    expect($('[data-k="tabla-caja"]').hidden).toBe(false);
    expect($('[data-k="tabla-res"]').textContent).toBe('2 tanques en cultivo · 1 en alerta');
    expect(filas()).toEqual(['M1 · ' + Math.min(n1, n2), 'M1 · ' + Math.max(n1, n2)]);
    const tr = host.querySelector('.an-tq-tabla tbody tr.alerta');
    expect(tr.querySelector('th').textContent).toBe('M1 · ' + n1);
    expect(tr.querySelector('td.mal').textContent).toBe('61,0 %');
    expect(tr.querySelector('td.al').textContent).toBe('⚠ Superv.');
    expect(tr.querySelector('b')).toBe(null);   // el lote con marcas va como texto
    expect([...tr.querySelectorAll('td')].some((td) => td.textContent === '<b>X</b>')).toBe(true);
  });
  it('un encabezado ordena y el mismo invierte; «sólo en alerta» filtra; el área cambia la tabla', () => {
    v.pintarEstado(estado());
    ordenar('Superv.');
    expect(filas()).toEqual(['M1 · ' + n1, 'M1 · ' + n2]);   // 61 % antes que 92 %
    expect($('thead th[aria-sort]').getAttribute('aria-sort')).toBe('ascending');
    ordenar('Superv.');
    expect(filas()).toEqual(['M1 · ' + n2, 'M1 · ' + n1]);
    expect($('thead th[aria-sort]').getAttribute('aria-sort')).toBe('descending');
    const solo = $('[data-k="solo-alerta"]'); solo.checked = true; solo.dispatchEvent(new Event('change'));
    expect(filas()).toEqual(['M1 · ' + n1]);
    $('.an-area [data-area="mat"]').click();
    expect($('.an-area [data-area="mat"]').getAttribute('aria-pressed')).toBe('true');
    expect(filas()).toEqual(['S1 · ' + s1]);
    expect($('[data-k="tabla-res"]').textContent).toBe('2 tanques con reproductores · 1 en alerta');
    expect($('tbody td.mal').textContent).toBe('2,50');
  });
  it('un refresco conserva área, filtro y orden; tocar una fila despliega su evolución y «Ver en su módulo →» abre el tanque en su sala', () => {
    v.pintarEstado(estado());
    $('.an-area [data-area="mat"]').click();
    ordenar('H:M'); ordenar('H:M');
    expect(filas()).toEqual(['S1 · ' + s1, 'S1 · ' + s2]);   // 2,50 antes que 1,00
    v.pintarEstado(estado());
    expect($('.an-area [data-area="mat"]').getAttribute('aria-pressed')).toBe('true');
    expect(filas()).toEqual(['S1 · ' + s1, 'S1 · ' + s2]);
    host.querySelectorAll('.an-tq-tabla tbody tr[data-i]')[1].querySelector('td').click();
    expect($('.an-fila[data-id="S1"] .an-det').hidden).toBe(true);   // ya no salta a la sala: despliega
    expect($('tr.an-evo')).not.toBe(null);
    $('tr.an-evo [data-evo-ir]').click();
    const fila = $('.an-fila[data-id="S1"]');
    expect(fila.querySelector('.an-det').hidden).toBe(false);
    expect(fila.querySelector('.an-tq-ficha h4').textContent).toBe('Maduración 1 · tanque ' + s2);
  });
});

describe('📊 Análisis · evolución de un tanque (punto 9, 07-10 noche)', () => {
  const evoLarv = [
    { fecha: '2026-10-01', pop: 1.1e6, sv: 100, estadio: 'PL3', od: 5.2, tmp: 30 },
    { fecha: '2026-10-02', pop: 1e6, sv: 90.9, estadio: '', od: null, tmp: null },
    { fecha: '2026-10-04', pop: 0.9e6, sv: 81.8, estadio: 'PL5', od: null, tmp: null },
  ];
  const conEvo = () => {
    const E = estado();
    E.modulos.M1.tanques[n1].evolucion = evoLarv;
    E.mad.salas.S1.tanques[s1].evolucion = [
      { fecha: '2026-09-29', hembras: 10, machos: 10, bajas: null, descartes: null, copulas: null },
      { fecha: '2026-09-30', hembras: 10, machos: 9, bajas: 1, descartes: 0, copulas: 3 },
    ];
    return E;
  };
  const fila = (txt) => [...host.querySelectorAll('.an-tq-tabla tbody tr[data-i]')].find((tr) => tr.querySelector('th').textContent === txt);

  it('🔴 tocar un tanque despliega DEBAJO su evolución; otra vez, la cierra; uno a la vez', () => {
    v.pintarEstado(conEvo());
    expect($('tr.an-evo')).toBe(null);
    fila('M1 · ' + n1).querySelector('td').click();
    const evo = $('tr.an-evo');
    expect(evo.previousElementSibling.querySelector('th').textContent).toBe('M1 · ' + n1);   // justo debajo de su fila
    expect(fila('M1 · ' + n1).querySelector('th button').getAttribute('aria-expanded')).toBe('true');
    expect(evo.querySelector('td').colSpan).toBe(8);
    expect(evo.querySelector('.an-evo-rango').textContent).toBe('01/10 al 04/10 · 4 días');
    expect([...evo.querySelectorAll('.an-evo-est span')].map((s) => s.textContent)).toEqual(['PL3 · 01/10–02/10', 'PL5 · 04/10']);
    const graf = [...evo.querySelectorAll('.an-evo-s')];
    expect(graf.map((g) => g.querySelector('b').textContent)).toEqual(['Supervivencia', 'Población', 'OD (mg/L)', 'Temp. (°C)']);
    expect(graf[0].querySelector('span').textContent).toBe('100,0 % (01/10) → 81,8 % (04/10)');
    expect(graf[0].querySelectorAll('circle').length).toBe(3);
    expect(graf[0].querySelector('path').getAttribute('d')).toMatch(/^M\S+ \S+ L\S+ \S+ M\S+ \S+$/);   // el 03/10 falta: hueco
    expect(graf[2].querySelector('span').textContent).toBe('5,20 (01/10)');
    expect(evo.querySelector('.an-evo-nota').textContent).toBe('OD y temperatura: sin lecturas desde el 01/10 (Control_Tanque).');
    fila('M1 · ' + n2).querySelector('td').click();                          // otro tanque: se cierra el primero
    expect(host.querySelectorAll('tr.an-evo').length).toBe(1);
    expect($('tr.an-evo').querySelector('.an-evo-rango').textContent).toBe('Sin registros diarios de este tanque.');
    fila('M1 · ' + n2).querySelector('td').click();                          // el mismo: se cierra
    expect($('tr.an-evo')).toBe(null);
  });

  it('lo abierto sobrevive al refresco; en otra área no se ve; maduración, sus 7 días con la nota de los días sin parte', () => {
    v.pintarEstado(conEvo());
    fila('M1 · ' + n1).querySelector('td').click();
    v.pintarEstado(conEvo());
    expect($('tr.an-evo').previousElementSibling.querySelector('th').textContent).toBe('M1 · ' + n1);
    $('.an-area [data-area="mat"]').click();
    expect($('tr.an-evo')).toBe(null);
    fila('S1 · ' + s1).querySelector('td').click();
    const evo = $('tr.an-evo');
    expect(evo.classList.contains('mat')).toBe(true);
    expect([...evo.querySelectorAll('.an-evo-s b')].map((b) => b.textContent)).toEqual(['♀ vivas', '♂ vivos', 'Bajas', 'Cópulas']);
    expect(evo.querySelectorAll('.an-evo-s')[2].querySelector('span').textContent).toBe('1 (30/09)');
    expect(evo.querySelector('.an-evo-nota').textContent).toBe('Un día sin parte queda en blanco: no cuenta como 0.');
    $('.an-area [data-area="larv"]').click();
    expect($('tr.an-evo')).toBe(null);
  });
});

describe('📊 Análisis · cronograma del ciclo', () => {
  const fila = (id) => host.querySelector('.an-cr-fila[data-id="' + id + '"]');
  it('sin datos dice que carga; con datos, los 10 módulos con sus tramos, el despacho y su etiqueta', () => {
    expect($('[data-k="crono-vacio"]').textContent).toBe('Cargando datos de producción…');
    expect($('[data-k="crono"]').hidden).toBe(true);
    v.pintarEstado(estado());
    expect(host.querySelectorAll('.an-cr-fila').length).toBe(10);
    expect(fila('M1').querySelectorAll('.an-cr-tramo').length).toBe(2);
    expect(fila('M1').querySelector('.an-cr-camion').textContent).toBe('🚚');
    expect(fila('M1').querySelector('.an-cr-et').textContent).toBe('día 20 · PL5 · despachando desde 05/10');
    expect(fila('M2').querySelector('.an-cr-desinf')).not.toBe(null);
    expect(fila('M3').querySelector('.an-cr-et').textContent).toBe('sin corrida');
    expect(host.querySelector('.an-cr-marcas b').textContent).toBe('hoy');
  });
  it('tocar un tramo da su detalle (y otra vez lo quita); «Ver» y la etiqueta abren el módulo; el refresco lo conserva', () => {
    v.pintarEstado(estado());
    const det = $('[data-k="crono-det"]');
    expect(det.hidden).toBe(true);
    fila('M1').querySelectorAll('.an-cr-tramo')[1].click();
    expect(det.hidden).toBe(false);
    expect($('[data-k="crono-det-txt"]').textContent).toBe('M1 · C597 · Transferencia · 01/10–06/10 · 6 días · sigue hoy');
    expect(fila('M1').querySelectorAll('.an-cr-tramo')[1].getAttribute('aria-pressed')).toBe('true');
    v.pintarEstado(estado());
    expect($('[data-k="crono-det"]').hidden).toBe(false);   // el refresco conserva el tramo elegido
    $('[data-k="crono-det-ir"]').click();
    expect($('.an-fila[data-id="M1"] .an-det').hidden).toBe(false);
    fila('M1').querySelectorAll('.an-cr-tramo')[1].click();
    expect($('[data-k="crono-det"]').hidden).toBe(true);
    fila('M2').querySelector('.an-cr-et').click();
    expect($('.an-fila[data-id="M2"] .an-det').hidden).toBe(false);
    // otro mes trae OTRA corrida al módulo: el tramo elegido de la anterior deja de estarlo
    fila('M1').querySelectorAll('.an-cr-tramo')[0].click();
    expect($('[data-k="crono-det"]').hidden).toBe(false);
    const otro = estado(); otro.crono.modulos.M1 = { ...otro.crono.modulos.M1, corrida: '601' };
    v.pintarEstado(otro);
    expect($('[data-k="crono-det"]').hidden).toBe(true);
  });
});

describe('📊 Análisis · plano del laboratorio', () => {
  const tq = (id, num, desove) => host.querySelector('.an-pl-tq[data-grupo="' + id + '"][data-num="' + num + '"]' + (desove ? '[data-desove]' : ':not([data-desove])'));
  const tocar = (e) => e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const aviso = (e) => e.nextElementSibling.nextElementSibling;   // forma · número · ⚠
  it('dibuja todos los tanques (112 + 38 + 6 de desove), los 15 módulos y salas y las otras áreas; color de su ficha y alerta', () => {
    expect(host.querySelectorAll('.an-pl-tq').length).toBe(156);
    expect(host.querySelectorAll('.an-pl-grupo').length).toBe(15);
    expect(host.querySelectorAll('.an-pl-otra').length).toBe(OTHERS.length);
    expect($('[data-k="plano-nota"]').textContent).toBe('Cargando datos de producción…');
    const E = estado(); E.mad.salas.S1.alerta = true;
    v.pintarEstado(E);
    expect([tq('M1', n1).getAttribute('fill'), tq('M1', n1).classList.contains('alerta'), aviso(tq('M1', n1)).style.display]).toEqual(['#123456', true, '']);
    expect([tq('M1', n2).classList.contains('alerta'), aviso(tq('M1', n2)).style.display]).toEqual([false, 'none']);
    expect(tq('M1', n1).nextElementSibling.textContent).toBe(String(n1));
    expect([tq('S1', s2).getAttribute('fill'), tq('S1', s1).classList.contains('alerta')]).toEqual([MAD_HEX['Producción'], true]);
    expect(tq('S1', 1, true).nextElementSibling.textContent).toBe('D1');
    expect($('.an-pl-grupo[data-grupo="S1"]').classList.contains('alerta')).toBe(true);
    expect($('.an-pl-grupo[data-grupo="S2"]').classList.contains('alerta')).toBe(false);
  });
  it('tocar un tanque da su ficha debajo y «Ver en su módulo» lo abre; el refresco la conserva; tocarlo otra vez la quita', () => {
    v.pintarEstado(estado());
    const card = $('[data-k="plano-ficha"]');
    expect(card.hidden).toBe(true);
    tocar(tq('M1', n1));
    expect([card.hidden, $('[data-k="plano-ficha-h"]').textContent, $('[data-k="plano-ficha-ir"]').hidden]).toEqual([false, 'Módulo 1 · tanque ' + n1, false]);
    expect(tq('M1', n1).classList.contains('sel')).toBe(true);
    v.pintarEstado(estado());
    expect(card.hidden).toBe(false);
    $('[data-k="plano-ficha-ir"]').click();
    const fila = $('.an-fila[data-id="M1"]');
    expect([fila.querySelector('.an-det').hidden, fila.querySelector('.an-tq-ficha h4').textContent]).toEqual([false, 'Módulo 1 · tanque ' + n1]);
    tocar(tq('M1', n1));
    expect(card.hidden).toBe(true);
  });
  it('tocar el contorno de una sala da su ficha; un área, su nombre y su uso (sin «Ver en su módulo»)', () => {
    v.pintarEstado(estado());
    tocar($('.an-pl-grupo[data-grupo="S1"]'));
    expect([$('[data-k="plano-ficha-h"]').textContent, $('[data-k="plano-ficha-ir"]').hidden]).toEqual(['Maduración 1', false]);
    tocar($('.an-pl-otra[data-area="1"]'));
    const [tit, uso] = OTHERS[1][6].split(' · ');
    expect([$('[data-k="plano-ficha-h"]').textContent, $('[data-k="plano-ficha-dl"]').textContent, $('[data-k="plano-ficha-ir"]').hidden]).toEqual([tit, 'Uso' + uso, true]);
  });
});

describe('📊 Análisis · la meta compartida con la maqueta', () => {
  it('cada pintado lee la meta guardada: la que cambió la maqueta mientras Análisis estaba oculto se ve al volver', () => {
    guardarMeta(400e6);
    v.pintarEstado(estado());
    expect($('[data-k="prod-meta"]').textContent).toBe('de 400 M');
    guardarMeta(500e6);   // como la guarda el ⚙ de la maqueta (los modos ya no se rehacen al cambiar)
    v.pintarEstado(estado());
    expect($('[data-k="prod-meta"]').textContent).toBe('de 500 M');
    guardarMeta(400e6);
  });
});
