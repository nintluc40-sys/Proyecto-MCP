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
import { LARV, MAT } from './plano.js';

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
  return { modulos: { M1 }, resumen: null, mad: { salas: { S1 }, resumen: null, reemplazo: null }, cifras: null, mes: null };
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
  it('un refresco conserva área, filtro y orden; tocar una fila abre el tanque en su sala', () => {
    v.pintarEstado(estado());
    $('.an-area [data-area="mat"]').click();
    ordenar('H:M'); ordenar('H:M');
    expect(filas()).toEqual(['S1 · ' + s1, 'S1 · ' + s2]);   // 2,50 antes que 1,00
    v.pintarEstado(estado());
    expect($('.an-area [data-area="mat"]').getAttribute('aria-pressed')).toBe('true');
    expect(filas()).toEqual(['S1 · ' + s1, 'S1 · ' + s2]);
    host.querySelectorAll('.an-tq-tabla tbody tr')[1].querySelector('td').click();
    const fila = $('.an-fila[data-id="S1"]');
    expect(fila.querySelector('.an-det').hidden).toBe(false);
    expect(fila.querySelector('.an-tq-ficha h4').textContent).toBe('Maduración 1 · tanque ' + s2);
  });
});
