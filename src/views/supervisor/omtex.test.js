// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../core/store.js';
import { buildContext } from './stats.js';
import { renderOmTex, lotBrand, omtexTie } from './omtex.js';

const row = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });

// Contexto real de la vista a partir del store (mismo camino que el dashboard).
const ctxFor = (rows) => {
  store.globalData = rows;
  store.dateFrom = null;
  store.dateTo = null;
  const ctx = buildContext({ corrida: null });
  ctx.vState = { corrida: null };
  return ctx;
};

describe('omtex · lotBrand (clasificación de marca por lote)', () => {
  it('lote de dos letras = Omarsa', () => {
    expect(lotBrand('AB')).toBe('OM');
    expect(lotBrand('BB')).toBe('OM');
    expect(lotBrand('BA')).toBe('OM');
    expect(lotBrand('ab')).toBe('OM');
    expect(lotBrand(' AB ')).toBe('OM');
  });

  // REGRESIÓN: los lotes combinados de Omarsa ("AB+BI") caían en Texcumar porque
  // el patrón exigía que la cadena ENTERA fueran 2 letras. Confirmado con el
  // usuario: '+' es el ÚNICO separador que usan y la combinación sigue siendo Omarsa.
  it('lote COMBINADO con "+" sigue siendo Omarsa', () => {
    expect(lotBrand('AB+BI')).toBe('OM');
    expect(lotBrand('AB + BI')).toBe('OM');
    expect(lotBrand('BC+BA')).toBe('OM');
    expect(lotBrand('AB+BB+BA')).toBe('OM');
  });

  // Texcumar tiene firma PROPIA (mezcla números y letras, o usa guion), así que
  // no es el cajón de sastre de lo que no sea Omarsa.
  it('lote con dígito o guion = Texcumar', () => {
    expect(lotBrand('L1')).toBe('TEX');
    expect(lotBrand('J-D2')).toBe('TEX');
    expect(lotBrand('D-2')).toBe('TEX');
    expect(lotBrand('D2')).toBe('TEX');
    expect(lotBrand('12')).toBe('TEX');
    expect(lotBrand('L1+L2')).toBe('TEX');
  });

  // Confirmado por el usuario: un lote de un solo carácter es de Texcumar.
  it('lote de un solo carácter = Texcumar', () => {
    expect(lotBrand('J')).toBe('TEX');
    expect(lotBrand('2')).toBe('TEX');
    expect(lotBrand('j')).toBe('TEX');
  });

  // El guion es de Texcumar, NO un separador de combinación: no debe partirse.
  it('el guion no se trata como separador', () => {
    expect(lotBrand('J-D2')).toBe('TEX');
    expect(lotBrand('A-B')).toBe('TEX');
  });

  it('lo que no encaja limpio en ninguna marca = ambiguo (null)', () => {
    expect(lotBrand('AB+L1')).toBeNull();   // parte Omarsa + parte Texcumar
    expect(lotBrand('ABC')).toBeNull();     // tres letras, sin dígito ni guion
  });

  it('lote vacío/nulo = sin marca', () => {
    expect(lotBrand('')).toBeNull();
    expect(lotBrand(null)).toBeNull();
    expect(lotBrand(undefined)).toBeNull();
  });
});

describe('omtex · tanques sin marca clara (empate)', () => {
  beforeEach(() => { store.dateFrom = null; store.dateTo = null; });

  // Antes el desempate era `c.OM >= c.TEX`, que mandaba SIEMPRE el tanque empatado
  // a Omarsa en silencio y contaminaba sus promedios y el veredicto.
  it('un tanque con igual nº de lotes de cada marca queda EXCLUIDO y se declara', () => {
    const ctx = ctxFor([
      // TQ 1 → empate exacto (1 lote OM, 1 lote TEX)
      row({ Tanque: '1', Fecha: '2026-06-01', Lote: 'AB', 'Población': '1000000', Supervivencia: '90' }),
      row({ Tanque: '1', Fecha: '2026-06-02', Lote: 'L1', 'Población': '1000000', Supervivencia: '90' }),
      // TQ 2 → mayoría Omarsa
      row({ Tanque: '2', Fecha: '2026-06-01', Lote: 'CD', 'Población': '2000000', Supervivencia: '80' }),
      row({ Tanque: '2', Fecha: '2026-06-02', Lote: 'CD', 'Población': '2000000', Supervivencia: '80' }),
      // TQ 3 → mayoría Texcumar
      row({ Tanque: '3', Fecha: '2026-06-01', Lote: 'L2', 'Población': '3000000', Supervivencia: '70' }),
      row({ Tanque: '3', Fecha: '2026-06-02', Lote: 'L2', 'Población': '3000000', Supervivencia: '70' }),
    ]);
    const { html } = renderOmTex(ctx, 'M01');
    expect(html).toContain('sin marca clara');
    expect(html).toContain('1 tanque(s) sin marca clara');
    // Cada marca conserva SÓLO su tanque inequívoco.
    expect(html).toContain('🟧 Texcumar');
    expect(html).toContain('🟦 Omarsa');
  });

  // Con lotBrand devolviendo null en lotes ambiguos, un tanque cuyos lotes NO se
  // pueden atribuir se quedaba sin marca y desaparecía por completo del informe.
  it('un tanque con lotes presentes pero INATRIBUIBLES se declara, no se descarta', () => {
    const ctx = ctxFor([
      row({ Tanque: '1', Fecha: '2026-06-01', Lote: 'AB+L1', 'Población': '1000000', Supervivencia: '90' }),
      row({ Tanque: '2', Fecha: '2026-06-01', Lote: 'CD', 'Población': '2000000', Supervivencia: '80' }),
      row({ Tanque: '3', Fecha: '2026-06-01', Lote: 'L2', 'Población': '3000000', Supervivencia: '70' }),
    ]);
    const { html } = renderOmTex(ctx, 'M01');
    expect(html).toContain('1 tanque(s) sin marca clara');
  });

  it('un tanque SIN ningún lote anotado no genera aviso (no hay nada que comparar)', () => {
    const ctx = ctxFor([
      row({ Tanque: '1', Fecha: '2026-06-01', Lote: '', 'Población': '1000000', Supervivencia: '90' }),
      row({ Tanque: '2', Fecha: '2026-06-01', Lote: 'CD', 'Población': '2000000', Supervivencia: '80' }),
      row({ Tanque: '3', Fecha: '2026-06-01', Lote: 'L2', 'Población': '3000000', Supervivencia: '70' }),
    ]);
    const { html } = renderOmTex(ctx, 'M01');
    expect(html).not.toContain('sin marca clara');
  });

  it('sin empates no aparece el aviso', () => {
    const ctx = ctxFor([
      row({ Tanque: '1', Fecha: '2026-06-01', Lote: 'AB', 'Población': '1000000', Supervivencia: '90' }),
      row({ Tanque: '2', Fecha: '2026-06-01', Lote: 'L1', 'Población': '2000000', Supervivencia: '80' }),
    ]);
    const { html } = renderOmTex(ctx, 'M01');
    expect(html).not.toContain('sin marca clara');
  });
});

describe('omtex · veredicto', () => {
  beforeEach(() => { store.dateFrom = null; store.dateTo = null; });

  it('se ABSTIENE cuando demasiados tanques quedaron sin marca clara', () => {
    // 2 tanques empatados de 3 → 66% sin clasificar, por encima del umbral (30%).
    const ctx = ctxFor([
      row({ Tanque: '1', Fecha: '2026-06-01', Lote: 'AB', 'Población': '1000000', Supervivencia: '90' }),
      row({ Tanque: '1', Fecha: '2026-06-02', Lote: 'L1', 'Población': '1000000', Supervivencia: '90' }),
      row({ Tanque: '2', Fecha: '2026-06-01', Lote: 'CD', 'Población': '1000000', Supervivencia: '85' }),
      row({ Tanque: '2', Fecha: '2026-06-02', Lote: 'L2', 'Población': '1000000', Supervivencia: '85' }),
      row({ Tanque: '3', Fecha: '2026-06-01', Lote: 'EF', 'Población': '2000000', Supervivencia: '60' }),
      row({ Tanque: '4', Fecha: '2026-06-01', Lote: 'L3', 'Población': '3000000', Supervivencia: '95' }),
    ]);
    const { html } = renderOmTex(ctx, 'M01');
    expect(html).toContain('Sin veredicto');
    expect(html).not.toContain('rinde mejor');
  });

  it('corona ganador cuando la clasificación es fiable', () => {
    const ctx = ctxFor([
      row({ Tanque: '1', Fecha: '2026-06-01', Lote: 'AB', 'Población': '2000000', Supervivencia: '95' }),
      row({ Tanque: '2', Fecha: '2026-06-01', Lote: 'L1', 'Población': '1000000', Supervivencia: '60' }),
    ]);
    const { html } = renderOmTex(ctx, 'M01');
    expect(html).toContain('rinde mejor');
    expect(html).not.toContain('Sin veredicto');
  });
});

describe('omtex · tabla Δ (puntos porcentuales vs % relativo)', () => {
  beforeEach(() => { store.dateFrom = null; store.dateTo = null; });

  // Δ de Supervivencia/Deformidad son PUNTOS porcentuales; antes se rotulaban '%'
  // igual que el Δ relativo de la columna contigua, y no había forma de distinguirlos.
  it('la diferencia de variables porcentuales se rotula en p.p.', () => {
    const ctx = ctxFor([
      row({ Tanque: '1', Fecha: '2026-06-01', Lote: 'AB', 'Población': '1000000', Supervivencia: '80', Deformidad: '2' }),
      row({ Tanque: '2', Fecha: '2026-06-01', Lote: 'L1', 'Población': '1000000', Supervivencia: '60', Deformidad: '5' }),
    ]);
    const { html } = renderOmTex(ctx, 'M01');
    expect(html).toContain('p.p.');
    expect(html).toContain('Δ absoluto');
    expect(html).toContain('Δ % relativo');
    // Deformidad: Texcumar 5% − Omarsa 2% = +3 PUNTOS porcentuales (no "+3%").
    expect(html).toContain('+3.0 p.p.');
    // El Δ relativo de la columna contigua sigue siendo un % de verdad.
    expect(html).toContain('150.0%');
  });
});

/* ============================================================
   Empate al nivel de detalle que se MUESTRA. El corte era |t−o| < 1e-9 mientras la tabla
   redondea a un decimal: con Supervivencia 70,04 % vs 70,01 % las dos columnas decían
   «70,0 %», el Δ decía «+0,0 p.p.» y el veredicto coronaba igualmente a una marca,
   sumándole un voto al 🏆 que decide proveedor.
   ============================================================ */
describe('omtexTie · empate por el valor mostrado', () => {
  const sv = { key: 'sv', dir: 'up', fmt: (v) => (v == null ? '—' : v.toFixed(1) + '%') };
  const plg = { key: 'plg', dir: 'down', fmt: (v) => (v == null ? '—' : v.toFixed(1)) };
  const pop = { key: 'pop', dir: 'up', fmt: (v) => (v == null ? '—' : String(Math.round(v))) };

  it('empata cuando ambas columnas muestran lo mismo', () => {
    expect(omtexTie(sv, 70.04, 70.01)).toBe(true);   // ambas «70.0%»
    expect(omtexTie(plg, 12.31, 12.34)).toBe(true);  // ambas «12.3»
    expect(omtexTie(pop, 1000000.4, 1000000.1)).toBe(true);
  });

  it('NO empata cuando el valor mostrado difiere', () => {
    expect(omtexTie(sv, 70.04, 70.06)).toBe(false);  // «70.0%» vs «70.1%»
    expect(omtexTie(sv, 70, 71)).toBe(false);
    expect(omtexTie(plg, 12.3, 12.4)).toBe(false);
  });

  it('valores idénticos empatan y los ausentes NO empatan (sin dato ≠ empate)', () => {
    expect(omtexTie(sv, 70, 70)).toBe(true);
    expect(omtexTie(sv, null, 70)).toBe(false);
    expect(omtexTie(sv, 70, undefined)).toBe(false);
    expect(omtexTie(sv, null, null)).toBe(false);
  });
});
