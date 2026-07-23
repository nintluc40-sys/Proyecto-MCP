import { describe, it, expect } from 'vitest';
import { sysCat, SYS_CATS, growthByLote, tasaChartData, periodStats, cellCompositionByDay, dispatchByModule, covSpan, dailySeries } from './index.js';

// Fila de Lab_Algas con cabeceras canónicas (las que lee el acceso tolerante AF).
const row = (o) => ({ ...o });

describe('sysCat', () => {
  it('mapea cada patrón a su categoría', () => {
    expect(sysCat('PBR1')).toBe('PBR');
    expect(sysCat('PM2')).toBe('Premasivos');
    expect(sysCat('FP')).toBe('Fundas');
    expect(sysCat('FM')).toBe('Fundas');
    expect(sysCat('C3')).toBe('Carboys');
    expect(sysCat('M1')).toBe('Masivos');
  });
  it('sistema no contemplado → Otros (categoría visible)', () => {
    expect(sysCat('XYZ')).toBe('Otros');
    expect(SYS_CATS).toContain('Otros');
  });
  it('vacío → null', () => {
    expect(sysCat('')).toBeNull();
    expect(sysCat(null)).toBeNull();
  });
  it('Fundas acotada: F/FM/FP con dígitos, pero NO FILTRO ni FUCUS', () => {
    ['F', 'FM', 'FP', 'FM1', 'FP2', 'F3'].forEach((s) => expect(sysCat(s), s).toBe('Fundas'));
    // Antes /^F/ metía en Fundas cualquier sistema que empezara por F.
    expect(sysCat('FILTRO')).toBe('Otros');
    expect(sysCat('FUCUS')).toBe('Otros');
  });
  it('MASIVO (sin dígito) sigue cayendo en Otros — regla vigente, documentada', () => {
    expect(sysCat('MASIVO')).toBe('Otros');
    expect(sysCat('M1')).toBe('Masivos');
  });
});

describe('sysCat · sincronización con la copia de Visitante', () => {
  it('algas.sysCat y visitante.algSysCat clasifican IGUAL', async () => {
    // visitante/index.js no exporta algSysCat (es privada): se extrae del fuente y se
    // evalúa, para que el test falle si alguien toca una copia y no la otra.
    const fs = await import('node:fs');
    const url = new URL('../visitante/index.js', import.meta.url);
    const src = fs.readFileSync(url, 'utf8');
    const m = src.match(/function algSysCat\(s\)\s*\{[\s\S]*?\n\}/);
    expect(m, 'no se encontró algSysCat en visitante/index.js').toBeTruthy();
    const algSysCat = new Function(`${m[0]}; return algSysCat;`)();
    const casos = ['PBR1', 'PBR', 'PM2', 'PM', 'F', 'FM', 'FP', 'FM1', 'FP2', 'F3',
      'FILTRO', 'FUCUS', 'C1', 'C12', 'CARBOY', 'M1', 'M10', 'MASIVO', 'XYZ', '', null];
    casos.forEach((c) => expect(algSysCat(c), `caso ${JSON.stringify(c)}`).toBe(sysCat(c)));
  });
});

describe('growthByLote', () => {
  it('agrupa por sistema (no-Fundas) y promedia Cel/ml por día de proceso', () => {
    const rows = [
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '3000' }), // mismo día → promedio
      row({ Sistema: 'M1', Fecha: '2026-06-02', Dia_Proceso: '2', Cel_ml: '4000' }),
    ];
    const lotes = growthByLote(rows);
    expect(lotes).toHaveLength(1);
    expect(lotes[0].key).toBe('M1');
    expect(lotes[0].points).toEqual([{ day: 1, cel: 2000 }, { day: 2, cel: 4000 }]);
  });
  it('el Lote separa series (p. ej. Fundas FP·A vs FP·B)', () => {
    const rows = [
      row({ Sistema: 'FP', Lote: 'A', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '500' }),
      row({ Sistema: 'FP', Lote: 'B', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '900' }),
    ];
    const keys = growthByLote(rows).map((l) => l.key).sort();
    expect(keys).toEqual(['FP · LA', 'FP · LB']);
  });
  it('el mismo sistema en ÁREAS o ESPECIES distintas NO se fusiona (clave Área·Sistema·Especie·Lote)', () => {
    const rows = [
      row({ Área_Algas: 'A1', Sistema: 'M1', Especie: 'TW', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Área_Algas: 'A2', Sistema: 'M1', Especie: 'TW', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '2000' }), // otra área
      row({ Área_Algas: 'A1', Sistema: 'M1', Especie: 'IS', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '3000' }), // otra especie
    ];
    const keys = growthByLote(rows).map((l) => l.key).sort();
    expect(keys).toEqual(['A1 · M1 · IS', 'A1 · M1 · TW', 'A2 · M1 · TW']);
  });
  it('ignora filas sin Cel/ml', () => {
    const rows = [row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1' })];
    expect(growthByLote(rows)).toHaveLength(0);
  });
  it('separa las RESIEMBRAS del mismo sistema (reinicio de Dia_Proceso) sin promediarlas', () => {
    // M1 se resiembra dentro de la corrida: día de proceso vuelve a 1.
    const rows = [
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Sistema: 'M1', Fecha: '2026-06-02', Dia_Proceso: '2', Cel_ml: '2000' }),
      row({ Sistema: 'M1', Fecha: '2026-06-10', Dia_Proceso: '1', Cel_ml: '1500' }), // 2.ª siembra
      row({ Sistema: 'M1', Fecha: '2026-06-11', Dia_Proceso: '2', Cel_ml: '3000' }),
    ];
    const lotes = growthByLote(rows);
    expect(lotes.map((l) => l.key)).toEqual(['M1 · S1', 'M1 · S2']);
    // NO se promedian entre sí: el día 1 de S1 es 1000 y el de S2 es 1500 (no 1250).
    expect(lotes[0].points).toEqual([{ day: 1, cel: 1000 }, { day: 2, cel: 2000 }]);
    expect(lotes[1].points).toEqual([{ day: 1, cel: 1500 }, { day: 2, cel: 3000 }]);
  });
  it('una sola siembra conserva la etiqueta simple (sin sufijo)', () => {
    const rows = [
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Sistema: 'M1', Fecha: '2026-06-02', Dia_Proceso: '2', Cel_ml: '2000' }),
    ];
    expect(growthByLote(rows).map((l) => l.key)).toEqual(['M1']);
  });
  it('el Lote NO fragmenta los sistemas no-Fundas (Masivo con Lote ruidoso → una sola serie)', () => {
    const rows = [
      row({ Sistema: 'M1', Lote: 'X', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Sistema: 'M1', Lote: 'Y', Fecha: '2026-06-02', Dia_Proceso: '2', Cel_ml: '2000' }),
    ];
    // M1 es Masivo → el Lote se ignora en la clave: NO se parte en dos series.
    expect(growthByLote(rows).map((l) => l.key)).toEqual(['M1']);
  });
});

describe('growthByLote · robustez fecha/día (auditoría adversarial)', () => {
  it('Dia_Proceso PARCIAL: ancla los días derivados al día real (no colisiona 1-based con 0-based)', () => {
    // Solo la 1.ª fila trae Dia_Proceso (=1); el resto se deriva de la fecha.
    const rows = [
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '100' }),
      row({ Sistema: 'M1', Fecha: '2026-06-02', Cel_ml: '200' }),
      row({ Sistema: 'M1', Fecha: '2026-06-03', Cel_ml: '300' }),
    ];
    // Sin el anclaje, el día real 1 y el día derivado 1 (0-based) colisionaban y
    // promediaban 06-01 con 06-02 → [{day:1,cel:150},{day:2,cel:300}]. Correcto = 3 puntos.
    expect(growthByLote(rows)[0].points).toEqual([{ day: 1, cel: 100 }, { day: 2, cel: 200 }, { day: 3, cel: 300 }]);
  });

  it('Dia_Proceso PARCIAL con día real ≠ 1: preserva la cronología y el crecimiento', () => {
    const rows = [
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '5', Cel_ml: '100' }),
      row({ Sistema: 'M1', Fecha: '2026-06-02', Cel_ml: '200' }),
      row({ Sistema: 'M1', Fecha: '2026-06-03', Cel_ml: '300' }),
    ];
    expect(growthByLote(rows)[0].points).toEqual([{ day: 5, cel: 100 }, { day: 6, cel: 200 }, { day: 7, cel: 300 }]);
    // μ debe ser POSITIVO (100→300), no negativo por curva invertida.
    expect(tasaChartData(growthByLote(rows)).meta[0].mu).toBeGreaterThan(0);
  });

  it('fila SIN fecha no crea una siembra fantasma (se ordena al final por su día)', () => {
    const rows = [
      row({ Sistema: 'M6', Fecha: '', Dia_Proceso: '3', Cel_ml: '999' }), // sin fecha, con día
      row({ Sistema: 'M6', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '100' }),
      row({ Sistema: 'M6', Fecha: '2026-06-02', Dia_Proceso: '2', Cel_ml: '200' }),
    ];
    const lotes = growthByLote(rows);
    expect(lotes).toHaveLength(1); // NO se parte en S1/S2
    expect(lotes[0].points).toEqual([{ day: 1, cel: 100 }, { day: 2, cel: 200 }, { day: 3, cel: 999 }]);
  });

  it('resiembra por SALTO DE FECHA aunque una fila previa trajera Dia_Proceso (respaldo no muerto)', () => {
    const rows = [
      row({ Sistema: 'M5', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '100' }),
      row({ Sistema: 'M5', Fecha: '2026-06-02', Cel_ml: '200' }),          // sin día
      row({ Sistema: 'M5', Fecha: '2026-06-22', Cel_ml: '80' }),           // +20 d → resiembra
      row({ Sistema: 'M5', Fecha: '2026-06-23', Cel_ml: '160' }),
    ];
    expect(growthByLote(rows).map((l) => l.key)).toEqual(['M5 · S1', 'M5 · S2']);
  });
});

describe('growthByLote · etiqueta de display (l.label) — sin mezclar registros', () => {
  it('omite el componente invariante en el TEXTO, pero la agrupación conserva la clave completa', () => {
    const rows = [
      row({ Área_Algas: 'A1', Sistema: 'M1', Especie: 'TW', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Área_Algas: 'A1', Sistema: 'M2', Especie: 'TW', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '2000' }),
    ];
    const lotes = growthByLote(rows);
    // Área (A1) y Especie (TW) son constantes → no se muestran; solo se ve el sistema.
    expect(lotes.map((l) => l.label).sort()).toEqual(['M1', 'M2']);
    // La AGRUPACIÓN mantiene la clave completa (no se fusionan registros distintos).
    expect(lotes.map((l) => l.key).sort()).toEqual(['A1 · M1 · TW', 'A1 · M2 · TW']);
  });
  it('un componente que distingue SIEMPRE se muestra → etiquetas únicas', () => {
    const rows = [
      row({ Área_Algas: 'A1', Sistema: 'M1', Especie: 'TW', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Área_Algas: 'A2', Sistema: 'M1', Especie: 'TW', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '2000' }),
    ];
    const labels = growthByLote(rows).map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length); // sin colisiones
    expect(labels.sort()).toEqual(['A1 · M1', 'A2 · M1']); // el área varía → se muestra
  });
  it('componente presente en unas series y ausente en otras SÍ distingue (no colisiona)', () => {
    const rows = [
      row({ Área_Algas: 'A1', Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '2000' }), // sin área
    ];
    const labels = growthByLote(rows).map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length); // únicas: 'A1 · M1' vs 'M1'
    expect(labels.sort()).toEqual(['A1 · M1', 'M1']);
  });
});

describe('tasaChartData · μ específica (día⁻¹)', () => {
  it('μ = ln(final/inicial)/días', () => {
    const out = tasaChartData([{ key: 'M1', points: [{ day: 0, cel: 1000 }, { day: 2, cel: 4000 }] }]);
    expect(out.labels).toEqual(['M1']);
    // ln(4)/2 = 0.693 → redondeado a 3 decimales
    expect(out.values).toEqual([+(Math.log(4) / 2).toFixed(3)]);
    const m = out.meta[0];
    expect(m.days).toBe(2);
    expect(m.pctTotal).toBe(300);            // (4000-1000)/1000*100
    expect(m.dbl).toBeCloseTo(Math.log2(4) / 2, 5); // 1 duplicación/día
    expect(m.tDouble).toBeCloseTo(1, 5);     // se duplica cada día
  });
  it('excluye lotes con <2 puntos, inicial/final no positivo o sin tiempo', () => {
    const out = tasaChartData([
      { key: 'A', points: [{ day: 1, cel: 1000 }] },                       // 1 punto
      { key: 'B', points: [{ day: 1, cel: 0 }, { day: 2, cel: 500 }] },    // inicial 0
      { key: 'C', points: [{ day: 3, cel: 1000 }, { day: 3, cel: 2000 }] }, // días iguales → sin tiempo
    ]);
    expect(out.labels).toEqual([]);
    expect(out.values).toEqual([]);
  });
  it('μ negativa cuando el cultivo decrece', () => {
    const out = tasaChartData([{ key: 'D', points: [{ day: 0, cel: 4000 }, { day: 2, cel: 1000 }] }]);
    expect(out.values[0]).toBeLessThan(0);
    expect(out.meta[0].pctTotal).toBe(-75);
  });
});

describe('periodStats', () => {
  it('resume densidad, protozoarios en alerta y rango de fechas', () => {
    const rows = [
      row({ Sistema: 'M1', Fecha: '2026-06-01', Cel_ml: '1000', Protozoarios: '2' }),
      row({ Sistema: 'M2', Fecha: '2026-06-03', Cel_ml: '3000', Protozoarios: '6' }),
    ];
    const s = periodStats(rows);
    expect(s.n).toBe(2);
    expect(s.sistemas).toBe(2);
    expect(s.densMin).toBe(1000);
    expect(s.densMax).toBe(3000);
    expect(s.densAvg).toBe(2000);
    expect(s.protoAlert).toBe(1); // solo el de 6 (≥5)
    expect(s.from && s.from.getDate()).toBe(1);
    expect(s.to && s.to.getDate()).toBe(3);
  });
  it('sin filas → valores nulos seguros', () => {
    const s = periodStats([]);
    expect(s.n).toBe(0);
    expect(s.densAvg).toBeNull();
    expect(s.from).toBeNull();
  });
});

describe('cellCompositionByDay', () => {
  it('suma por fecha y calcula el % global de células muertas (header legado "Células Llenas")', () => {
    const rows = [
      row({ Fecha: '2026-07-10', 'Células Vacías': '2', 'Células Semillenas': '1', 'Células Alargadas': '1', 'Células Llenas': '6' }),
      row({ Fecha: '2026-07-10', 'Células Llenas': '4' }),
      row({ Fecha: '2026-07-11', 'Células Vacías': '5', 'Células Llenas': '5' }),
    ];
    const c = cellCompositionByDay(rows);
    expect(c.days.length).toBe(2);
    expect(c.series.muertas).toEqual([10, 5]);  // 10-jul: 6+4 · 11-jul: 5
    expect(c.series.vacias).toEqual([2, 5]);
    expect(c.pctMuertas).toBe(63);              // 15 / 24 = 62.5% → 63
  });
  it('lee el nuevo header "Células muertas" y conserva los alias legados', () => {
    const c = cellCompositionByDay([
      row({ Fecha: '2026-07-10', 'Células Vacías': '2', 'Células muertas': '8' }),
    ]);
    expect(c.series.muertas).toEqual([8]);  // el alias principal (header nuevo) resuelve el conteo
    expect(c.pctMuertas).toBe(80);          // 8 / 10
    // fallback: hojas antiguas con el header previo siguen leyéndose
    const legacy = cellCompositionByDay([
      row({ Fecha: '2026-07-11', 'Células Vacías': '5', 'Células en División': '5' }),
    ]);
    expect(legacy.series.muertas).toEqual([5]);
  });
  it('ignora filas sin ninguno de los 4 conteos', () => {
    expect(cellCompositionByDay([row({ Fecha: '2026-07-10', Cel_ml: '1000' })]).days.length).toBe(0);
    expect(cellCompositionByDay([]).pctMuertas).toBeNull();
  });
});

describe('dispatchByModule', () => {
  it('suma litros por módulo (orden natural) + total; ignora filas sin volumen', () => {
    const rows = [
      row({ Modulo_Larv: '2', 'Volumen de Despacho': '100' }),
      row({ Modulo_Larv: '1', 'Volumen de Despacho': '50' }),
      row({ Modulo_Larv: '1', 'Volumen de Despacho': '30' }),
      row({ Modulo_Larv: '1' }), // sin volumen → no suma
    ];
    const d = dispatchByModule(rows);
    expect(d.items).toEqual([{ modulo: '1', litros: 80 }, { modulo: '2', litros: 100 }]);
    expect(d.total).toBe(180);
  });
});

describe('covSpan · eje de cobertura del mes de PRODUCCIÓN', () => {
  // Un mes de producción que cruza junio→julio: 11 días de junio + 19 de julio.
  const cruzaMeses = () => {
    const rows = [];
    for (let d = 20; d <= 30; d++) rows.push(row({ Fecha: `2026-06-${String(d).padStart(2, '0')}` }));
    for (let d = 1; d <= 19; d++) rows.push(row({ Fecha: `2026-07-${String(d).padStart(2, '0')}` }));
    return rows;
  };

  it('deriva el eje de TODAS las fechas, no del mes de la primera fila', () => {
    const cov = covSpan(cruzaMeses());
    expect(cov.withData.size).toBe(30);          // los 30 días con registro, no 11 ni 19
    expect(cov.days[0]).toBe('2026-06-20');
    expect(cov.days[cov.days.length - 1]).toBe('2026-07-19');
    expect(cov.sparse).toBe(false);
  });

  it('el resultado NO depende del orden de las filas del Sheet', () => {
    // Con el anclaje anterior daba 11 o 19 según qué fila viniera primero.
    const asc = covSpan(cruzaMeses());
    const desc = covSpan([...cruzaMeses()].reverse());
    const barajado = covSpan([...cruzaMeses()].sort(() => Math.random() - 0.5));
    expect(desc.withData.size).toBe(asc.withData.size);
    expect(barajado.withData.size).toBe(asc.withData.size);
    expect(desc.days).toEqual(asc.days);
    expect(barajado.days).toEqual(asc.days);
  });

  it('distingue el 3 de julio del 3 de junio (clave completa, no nº de día)', () => {
    const cov = covSpan([row({ Fecha: '2026-06-03' }), row({ Fecha: '2026-07-03' })]);
    expect(cov.withData.has('2026-06-03')).toBe(true);
    expect(cov.withData.has('2026-07-03')).toBe(true);
    expect(cov.withData.size).toBe(2);
  });

  it('rango absurdo (fecha mal capturada) → modo sparse, sin generar miles de celdas', () => {
    const cov = covSpan([row({ Fecha: '2026-06-01' }), row({ Fecha: '2026-06-02' }), row({ Fecha: '2126-06-01' })]);
    expect(cov.sparse).toBe(true);
    expect(cov.days).toEqual(['2026-06-01', '2026-06-02', '2126-06-01']); // solo días CON dato
    expect(cov.span).toBeGreaterThan(120);
  });

  it('sin fechas → eje vacío, sin reventar', () => {
    const cov = covSpan([row({ Sistema: 'M1' })]);
    expect(cov.days).toEqual([]);
    expect(cov.withData.size).toBe(0);
  });
});

describe('dailySeries · agrupa por fecha PARSEADA, no por el texto crudo', () => {
  it('dos formatos del mismo día se promedian en UN punto', () => {
    // Ambas formas llegan del Sheet según cómo se haya capturado la celda.
    const s = dailySeries([
      row({ Fecha: '2026-06-05', Salinidad_ppt: '30' }),
      row({ Fecha: '05/06/2026', Salinidad_ppt: '34' }),
    ], 'salinidad');
    expect(s.days).toEqual(['2026-06-05']);   // antes: 2 claves → 2 puntos
    expect(s.values).toEqual([32]);           // promedio, no dos picos
  });

  it('usa la MISMA clave de día que cellCompositionByDay (coherencia del módulo)', () => {
    const rows = [row({ Fecha: '05/06/2026', Salinidad_ppt: '30', 'Células muertas': '2', 'Células Vacías': '1' })];
    const s = dailySeries(rows, 'salinidad');
    const c = cellCompositionByDay(rows);
    expect(s.days[0]).toBe('2026-06-05');
    expect(c.days[0].getDate()).toBe(5);
    expect(c.days[0].getMonth()).toBe(5);     // junio
  });

  it('ordena los días cronológicamente aunque crucen meses', () => {
    const s = dailySeries([
      row({ Fecha: '2026-07-02', Salinidad_ppt: '31' }),
      row({ Fecha: '2026-06-28', Salinidad_ppt: '29' }),
    ], 'salinidad');
    expect(s.days).toEqual(['2026-06-28', '2026-07-02']);
  });
});

describe('periodStats · arrays sin cota', () => {
  it('no lanza RangeError con 200.000 filas (Math.min(...arr) sí lo hacía)', () => {
    const rows = new Array(200000).fill(0).map((_, i) => row({ Cel_ml: String(1000 + (i % 50)), Fecha: '2026-06-01' }));
    const s = periodStats(rows);
    expect(s.densMin).toBe(1000);
    expect(s.densMax).toBe(1049);
    expect(s.n).toBe(200000);
  });
});
