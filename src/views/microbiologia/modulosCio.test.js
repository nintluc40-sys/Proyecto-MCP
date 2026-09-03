/* ============================================================
   CIO como módulo · las etiquetas y el ORDEN de las dimensiones

   CIO entró en `MIC_MODULOS` (los 12 selectores del módulo de registro), así que
   desde entonces puede llegar al tablero un módulo que NO es un número. Aquí se
   cubre el ASA, no la función: se le piden a las dimensiones REALES su `fmt` y su
   `cmp`, que es donde estaba el defecto. Probar sólo `modLabel` habría dejado los
   cuatro sitios de `index.js` sin vigilar — el error de `fa5e439`, que probaba la
   función y nunca el asa.

   Lo que se arregló, y por qué cada aserción tiene su pareja numerada:
     · `fmt` componía `'M' + v` → «MCIO».
     · `cmp` era `(+a) - (+b)` → NaN con CIO. Y NaN no es «da igual el orden»:
       MEDIDO, el resultado depende del orden de ENTRADA — ['CIO','1','10','2','3']
       dejaba CIO el PRIMERO y ['10','2','CIO','3','1'] lo dejaba el ÚLTIMO. La
       lista del filtro se reordenaba sola según cómo salieran los datos.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { FILTER_DIMS, CAL_DIMS } from './index.js';
import { modLabel, isCio, cmpMod } from './data.js';

const dimModulo = (dims) => dims.find((d) => d.key === 'modulo');

describe('modLabel · CIO no lleva la M', () => {
  it('CIO es su propio nombre; los numerados conservan la M', () => {
    expect(modLabel('CIO')).toBe('CIO');
    expect(modLabel('3')).toBe('M3');
    expect(modLabel('10')).toBe('M10');
  });
  it('la comparación es indiferente a la caja, como la de «Sala» de al lado', () => {
    expect(isCio('cio')).toBe(true);
    expect(isCio(' CIO ')).toBe(true);
    expect(isCio('3')).toBe(false);
    expect(isCio('')).toBe(false);
    expect(isCio(null)).toBe(false);
  });
});

describe('cmpMod · orden estable con un módulo que no es número', () => {
  /* La aserción que de verdad importa: el MISMO conjunto en DOS órdenes de entrada
     distintos tiene que dar el MISMO resultado. Con el comparador viejo no lo daba. */
  it('el orden no depende del orden de entrada', () => {
    const esperado = ['1', '2', '3', '10', 'CIO'];
    expect(['3', '10', 'CIO', '1', '2'].sort(cmpMod)).toEqual(esperado);
    expect(['CIO', '1', '10', '2', '3'].sort(cmpMod)).toEqual(esperado);
    expect(['10', '2', 'CIO', '3', '1'].sort(cmpMod)).toEqual(esperado);
  });
  it('los numerados siguen yendo por valor, no por texto', () => {
    expect(['10', '2'].sort(cmpMod)).toEqual(['2', '10']);   // por texto daría 10 antes que 2
  });
});

describe('las dimensiones de Módulo usan las dos piezas (el ASA)', () => {
  it('Bacteriología: fmt sin «MCIO» y orden estable', () => {
    const d = dimModulo(FILTER_DIMS);
    expect(d.fmt('CIO')).toBe('CIO');
    expect(d.fmt('3')).toBe('M3');
    expect(['CIO', '1', '10', '2'].sort(d.cmp)).toEqual(['1', '2', '10', 'CIO']);
    expect(['1', '10', 'CIO', '2'].sort(d.cmp)).toEqual(['1', '2', '10', 'CIO']);
  });
  it('Calidad de Agua: fmt sin «MCIO» y orden estable', () => {
    const d = dimModulo(CAL_DIMS);
    expect(d.fmt('CIO')).toBe('CIO');
    expect(d.fmt('3')).toBe('M3');
    expect(['CIO', '1', '10', '2'].sort(d.cmp)).toEqual(['1', '2', '10', 'CIO']);
    expect(['1', '10', 'CIO', '2'].sort(d.cmp)).toEqual(['1', '2', '10', 'CIO']);
  });
  it('las OTRAS dimensiones numéricas no se tocaron', () => {
    const corrida = FILTER_DIMS.find((d) => d.key === 'corrida');
    const tq = FILTER_DIMS.find((d) => d.key === 'tq');
    expect(corrida.fmt('578')).toBe('C578');
    expect(tq.fmt('8')).toBe('TQ 8');
  });
});
