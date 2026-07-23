import { describe, it, expect } from 'vitest';
import { sysCat, SYS_CATS, growthByLote, tasaChartData, periodStats, cellCompositionByDay, dispatchByModule, covSpan, dailySeries, isMicAlgaeRow, micAlgSystem, algSysFromText, algSanitData, algCloroData } from './index.js';

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

// ── Control sanitario (microbiología de los cultivos de algas) ──
describe('Control sanitario · isMicAlgaeRow', () => {
  const mrow = (o) => ({ _SheetOrigin: 'Microbiología', Formato: 'Algas Hisopado', 'Fecha muestreo': '05/06/2026', Corrida: '573', ...o });
  it('reconoce solo las filas de Microbiología del departamento Algas', () => {
    expect(isMicAlgaeRow(mrow({}))).toBe(true);
    expect(isMicAlgaeRow(mrow({ Formato: 'Algas Mensual' }))).toBe(true);
    expect(isMicAlgaeRow(mrow({ Formato: 'Algas Fundas y Masivos' }))).toBe(true);
    // Microbiología pero de otro departamento → fuera.
    expect(isMicAlgaeRow(mrow({ Formato: 'Larvicultura · Muestra' }))).toBe(false);
    // Otra hoja → fuera.
    expect(isMicAlgaeRow({ _SheetOrigin: 'Lab_Algas', Sistema: 'M1' })).toBe(false);
  });
});

describe('Control sanitario · algSysFromText (sistema por palabra clave)', () => {
  it('reconoce los nombres reales de las hojas (texto descriptivo, no código)', () => {
    // Valores verificados en LARC - Microbiología / Calidad de Agua.
    expect(algSysFromText('Masivo 1')).toBe('Masivos');
    expect(algSysFromText('Masivo 6 Mod 1')).toBe('Masivos');
    expect(algSysFromText('Fundas producción 2')).toBe('Fundas');
    expect(algSysFromText('Funda matriz')).toBe('Fundas');
    expect(algSysFromText('Carboys 3')).toBe('Carboys');
    expect(algSysFromText('PBR #2 4 dias')).toBe('PBR');
    expect(algSysFromText('Premasivo 3 Mod 1')).toBe('Premasivos');
  });
  it('Premasivo NO se confunde con Masivo (lo contiene como subcadena)', () => {
    expect(algSysFromText('Premasivo 5')).toBe('Premasivos');
    expect(algSysFromText('premasivos mod 2')).toBe('Premasivos');
  });
  it('texto sin sistema reconocible → null', () => {
    expect(algSysFromText('Reservorio A')).toBeNull();
    expect(algSysFromText('')).toBeNull();
    expect(algSysFromText(null)).toBeNull();
  });
});

describe('Control sanitario · micAlgSystem (columna correcta por formato)', () => {
  it('deriva el sistema de "Tipo de muestra" (Fundas y Masivos)', () => {
    expect(micAlgSystem({ tipoMuestra: 'Masivo 1' })).toBe('Masivos');
    expect(micAlgSystem({ tipoMuestra: 'PBR #2 4 dias' })).toBe('PBR');
  });
  it('cae a "Muestras"/"Punto"/"Lugar" cuando Tipo de muestra no clasifica', () => {
    expect(micAlgSystem({ muestras: 'Funda matriz' })).toBe('Fundas');
    expect(micAlgSystem({ punto: 'Carboys 3' })).toBe('Carboys');
    // 'Tipo de muestra' tiene prioridad sobre 'Muestras'.
    expect(micAlgSystem({ tipoMuestra: 'Masivo 2', muestras: 'Funda matriz' })).toBe('Masivos');
  });
  it('si ningún candidato encaja, conserva el texto más informativo en vez de perder la muestra', () => {
    expect(micAlgSystem({ tipoMuestra: 'Estanque norte' })).toBe('Estanque norte');
    expect(micAlgSystem({ ubicacion: 'X' })).toBe('X');
    expect(micAlgSystem({})).toBe('—');
  });
});

describe('Control sanitario · algSanitData', () => {
  // Área 'algas': vtot l=5, m=10, e=50 → 2 Mínimo · 20 Moderado · 100 Elevado.
  // El sistema se registra como texto en "Tipo de muestra" (dato real de la hoja).
  const mrow = (sistema, ufcTot, extra) => ({
    _SheetOrigin: 'Microbiología', Formato: 'Algas Fundas y Masivos', 'Fecha muestreo': '05/06/2026',
    Corrida: '573', 'Tipo de muestra': sistema, 'V.Totales UFC': String(ufcTot), ...extra,
  });

  it('semáforo, alerta y patógeno dominante sobre análisis con nivel medido', () => {
    const d = algSanitData([
      mrow('Masivo 1', 100),   // Masivos · Elevado → alerta
      mrow('Masivo 1', 2),     // Masivos · Mínimo → sin alerta
      mrow('Fundas 2', 20),    // Fundas · Moderado → alerta
    ]);
    expect(d.n).toBe(3);
    expect(d.analizados).toBe(3);
    expect(d.enAlerta).toBe(2);
    expect(d.alertPct).toBeCloseTo(66.7, 1);
    expect(d.dominante[0]).toBe('C. Totales');   // el patógeno en alerta
    expect(d.sistemasAfectados).toBe(2);         // Masivos y Fundas
  });

  it('agrupa por sistema con % de alerta y peor nivel, ordenado por severidad', () => {
    const d = algSanitData([mrow('Masivo 1', 100), mrow('Masivo 1', 2), mrow('Fundas 2', 20)]);
    const mas = d.bySystem.find((s) => s.sistema === 'Masivos');
    const fun = d.bySystem.find((s) => s.sistema === 'Fundas');
    expect(mas).toMatchObject({ n: 2, alerta: 1, peor: 'Elevado' });
    expect(mas.alertPct).toBeCloseTo(50, 6);
    expect(fun).toMatchObject({ n: 1, alerta: 1, peor: 'Moderado', alertPct: 100 });
    // Fundas (100% alerta) va antes que Masivos (50%).
    expect(d.bySystem[0].sistema).toBe('Fundas');
  });

  it('desglosa por patógeno con % en alerta, ordenado por severidad', () => {
    // Área algas · Amarillas y Totales: l=5, m=10, e=50 (2 → Mínimo · 100 → Elevado).
    const d = algSanitData([
      mrow('Masivo 1', 100, { 'V.Amarillos UFC': '2' }),   // Totales Elevado · Amarillas Mínimo
      mrow('Masivo 1', 2, { 'V.Amarillos UFC': '100' }),   // Totales Mínimo · Amarillas Elevado
    ]);
    const tot = d.pathogens.find((p) => p.key === 'totales');
    const amar = d.pathogens.find((p) => p.key === 'amarillos');
    expect(tot).toMatchObject({ n: 2, alerta: 1, peor: 'Elevado' });
    expect(tot.alertPct).toBeCloseTo(50, 6);
    expect(amar).toMatchObject({ n: 2, alerta: 1, peor: 'Elevado' });
    expect(amar.alertPct).toBeCloseTo(50, 6);
  });

  it('construye la matriz Sistema × Patógeno con el PEOR nivel de cada celda', () => {
    const d = algSanitData([
      mrow('Masivo 1', 20),    // Masivos · Totales Moderado
      mrow('Masivo 1', 100),   // Masivos · Totales Elevado → la celda debe quedar en el peor
      mrow('Fundas 2', 2),     // Fundas · Totales Mínimo
    ]);
    expect(d.matrix.sistemas).toContain('Masivos');
    expect(d.matrix.sistemas).toContain('Fundas');
    expect(d.matrix.patogenos.some((p) => p.key === 'totales')).toBe(true);
    // Masivos × Totales: dos análisis (Moderado y Elevado) → celda = Elevado (el peor).
    expect(d.matrix.cell.get('Masivos|totales').nivel).toBe('Elevado');
    expect(d.matrix.cell.get('Fundas|totales').nivel).toBe('Mínimo');
    // Un par sistema×patógeno sin medición no está en el mapa.
    expect(d.matrix.cell.get('Fundas|aero')).toBeUndefined();
  });

  it('cada celda de la matriz lleva el PROMEDIO de UFC de sus mediciones (para el tooltip)', () => {
    const d = algSanitData([
      mrow('Masivo 1', 20),    // Totales UFC 20
      mrow('Masivo 1', 100),   // Totales UFC 100
    ]);
    const c = d.matrix.cell.get('Masivos|totales');
    expect(c.ufcN).toBe(2);
    expect(c.ufcAvg).toBeCloseTo(60, 6);   // (20 + 100) / 2
  });

  it('sin análisis, el modelo queda vacío sin reventar', () => {
    const d = algSanitData([]);
    expect(d.n).toBe(0);
    expect(d.alertPct).toBeNull();
    expect(d.dominante).toBeNull();
    expect(d.bySystem).toEqual([]);
    expect(d.pathogens).toEqual([]);
    expect(d.matrix.sistemas).toEqual([]);
    expect(d.matrix.cell.size).toBe(0);
  });

  it('un análisis sin ningún patógeno medido no cuenta como "en alerta"', () => {
    // Solo un patógeno sin UFC → sin nivel: entra en n pero no en analizados/alerta.
    const d = algSanitData([{ _SheetOrigin: 'Microbiología', Formato: 'Algas Hisopado', 'Fecha muestreo': '05/06/2026', Corrida: '573', Variedad: 'M1' }]);
    expect(d.n).toBe(1);
    expect(d.analizados).toBe(0);
    expect(d.alertPct).toBeNull();
  });
});

describe('Control sanitario · algCloroData (calidad de agua · cloro)', () => {
  // Formato "Algas" de Calidad de Agua: el sistema en "Muestras", cloro en mg/L (coma
  // decimal). Valores y cabeceras verificados en LARC - Calidad de Agua.
  const crow = (muestra, libre, extra) => ({
    _SheetOrigin: 'Calidad de Agua', Departamento: 'Algas', Formato: 'Algas',
    'Fecha muestreo': '20/07/2026', Muestras: muestra, 'Cloro libre (mg/L)': String(libre), ...extra,
  });

  it('reporta % con cloro libre detectable y promedios por parámetro', () => {
    const cl = algCloroData([
      crow('Masivo 6 Mod 1', '0,01', { 'Cloro total (mg/L)': '0,05' }),
      crow('Premasivo 3 Mod 1', '0'),
      crow('Funda matriz', '0,03'),
    ]);
    expect(cl.n).toBe(3);
    // 2 de 3 con cloro libre > 0 → 66.7%.
    expect(cl.detectPct).toBeCloseTo(66.7, 1);
    const libre = cl.params.find((p) => p.key === 'libre');
    expect(libre.n).toBe(3);
    expect(libre.avg).toBeCloseTo((0.01 + 0 + 0.03) / 3, 4);   // coma decimal parseada
    expect(libre.max).toBeCloseTo(0.03, 6);
    expect(libre.detPct).toBeCloseTo(66.7, 1);
  });

  it('agrupa el cloro por sistema (mismo criterio de sistema que la microbiología)', () => {
    const cl = algCloroData([
      crow('Masivo 6 Mod 1', '0,02'),
      crow('Masivo 7 Mod 1', '0'),
      crow('Funda matriz', '0,04'),
    ]);
    const mas = cl.bySystem.find((s) => s.sistema === 'Masivos');
    const fun = cl.bySystem.find((s) => s.sistema === 'Fundas');
    expect(mas).toMatchObject({ n: 2 });
    expect(mas.libreAvg).toBeCloseTo(0.01, 6);   // (0.02 + 0) / 2
    expect(mas.detPct).toBeCloseTo(50, 6);
    expect(fun).toMatchObject({ n: 1, detPct: 100 });
  });

  it('sin muestras de cloro, el modelo queda vacío sin reventar', () => {
    const cl = algCloroData([]);
    expect(cl.n).toBe(0);
    expect(cl.detectPct).toBeNull();
    expect(cl.bySystem).toEqual([]);
    expect(cl.params.every((p) => p.n === 0 && p.avg === null)).toBe(true);
  });
});
