/* ============================================================
   DESPACHO · con «Todas las corridas», las cifras de cosecha MEZCLAN corridas — y lo dicen.

   D-4 (2026-09-20). `cosechadaTotal` suma `lastPop` de cada tanque, que es su ÚLTIMA lectura: con
   varias corridas en el módulo, eso es la cosecha de la ÚLTIMA de cada tanque y deja fuera las
   anteriores. Y «Rendimiento cosecha» divide eso por `firstPop`, la siembra de la PRIMERA, así que
   compara dos corridas distintas; el `Math.min(…, 100)` remata tapando el desajuste.

   🔑 La decisión del usuario fue NO cambiar la cifra —movería números que la gente ya conoce— sino
   DECIRLO. Esta prueba existe porque un aviso sin prueba se borra en el primer refactor y nadie se
   entera: es lo mismo que ya pasó con las cifras de `deploy.yml`. Exige las tres cosas: que aparezca
   cuando se mezclan corridas, que NO aparezca al elegir una, y que no se contagie a los KPI que no
   mezclan nada (Biomasa y PL/g suman todas las filas del período: ésos no mienten).
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { renderDespacho } from './despacho.js';

/* Dos corridas en el MISMO tanque, que es el caso que la cifra no distingue. */
const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', ...o });
const FILAS = [
  // Corrida 573 · TQ1: siembra 1 M → cosecha 400 k
  L({ Corrida: '573', Tanque: 'TQ1', Fecha: '01/06/2026', 'Estadío': 'N5', 'Población': '1000000' }),
  L({ Corrida: '573', Tanque: 'TQ1', Fecha: '20/06/2026', 'Estadío': 'PL10', 'Población': '400000', Destino: 'Piscina 1', Biomasa: '5' }),
  // Corrida 574 · TQ1 otra vez: siembra 900 k → cosecha 300 k
  L({ Corrida: '574', Tanque: 'TQ1', Fecha: '01/07/2026', 'Estadío': 'N5', 'Población': '900000' }),
  L({ Corrida: '574', Tanque: 'TQ1', Fecha: '20/07/2026', 'Estadío': 'PL10', 'Población': '300000', Destino: 'Piscina 2', Biomasa: '4' }),
];

const ctx = (corrida) => ({ vState: { corrida: corrida || null }, allMods: ['M01'], larvCM: FILAS });

const AVISO = 'las cifras de cosecha mezclan corridas';
const SUB_COSECHA = 'la ÚLTIMA corrida de cada tanque';
const SUB_RENDIMIENTO = 'mezcla corridas';

describe('Despacho · «Todas las corridas» avisa de que mezcla', () => {
  it('sin corrida elegida: el aviso del encabezado y las dos sub-líneas', () => {
    const { html } = renderDespacho(ctx(null), 'M01');
    expect(html).toContain('Todas las corridas');
    expect(html, 'falta el aviso del encabezado').toContain(AVISO);
    expect(html, 'falta la sub-línea de Cantidad cosechada').toContain(SUB_COSECHA);
    expect(html, 'falta la sub-línea de Rendimiento cosecha').toContain(SUB_RENDIMIENTO);
  });

  it('con UNA corrida elegida no avisa de nada: ahí no se mezcla', () => {
    const { html } = renderDespacho(ctx('573'), 'M01');
    expect(html).toContain('Corrida: 573');
    expect(html, 'avisa de mezcla con una sola corrida elegida').not.toContain(AVISO);
    expect(html).not.toContain(SUB_COSECHA);
    expect(html).not.toContain(SUB_RENDIMIENTO);
  });

  it('🔑 y el fixture EJERCE la mezcla: la cifra sin corrida NO es la suma de las dos', () => {
    /* Sin esto, las dos pruebas de arriba pasarían con un fixture de una sola corrida y el aviso
       estaría avisando de algo que no ocurre. TQ1 cosechó 400 k en la 573 y 300 k en la 574; la
       cifra «Todas las corridas» enseña SÓLO la última lectura del tanque: 300 k. */
    const { html: todas } = renderDespacho(ctx(null), 'M01');
    expect(todas, 'la cifra debería ser la de la última corrida (300.000)').toContain('300.000');
    expect(todas, 'si enseñara la suma (700.000), este defecto ya no existiría y el aviso sobra').not.toContain('700.000');
  });

  it('el aviso NO se contagia a los KPI que no mezclan (Biomasa y PL/g suman todo el período)', () => {
    const { html } = renderDespacho(ctx(null), 'M01');
    const subs = [...html.matchAll(/<div class="sv-kpi-sub">([^<]*)<\/div>/g)].map((m) => m[1]);
    expect(subs, 'debería haber exactamente dos sub-líneas, no una por KPI').toHaveLength(2);
  });
});
