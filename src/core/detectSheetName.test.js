/* ============================================================
   detectSheetName · el respaldo POR COLUMNAS, contra las 35 pestañas REALES

   Cuándo se recorre: `extractSheetTabs` tiene un respaldo que recoge gids sueltos del
   HTML SIN título; esos gids van a `detectSheetName`, que adivina la hoja por sus
   cabeceras. Pasa en la PRIMERA carga de un dispositivo, antes de que la caché de
   títulos tenga nada que ofrecer — o sea, en el peor momento posible.

   Qué se exige: que el respaldo por columnas dé EXACTAMENTE lo mismo que da el camino
   del nombre (`classifyOrigin`). Si divergen, el tablero clasifica el mismo dato de dos
   maneras según por dónde entró, y `isLarviculturaRow` y sus hermanas —que comparan la
   cadena EXACTA— hacen desaparecer filas sin un solo error a la vista.

   Estado medido el 2026-09-01: 18 de 35 pestañas se clasificaban MAL.
     · 11 «Datos Larvicultura» salían 'Morfologia' (regla `intestino` retirada);
     · Traslado, Calidad de Agua y Desinfección caían en 'Larvicultura' (sin firma propia);
     · las 3 de Maduración y Marea caían en 'Hoja<N>'.
   Hoy las 35 aciertan.

   ⚠ FIXTURE GENERADO, no tecleado: sale de `cabeceras-produccion.json` (las cabeceras
     vivas de las 35 pestañas) por `_herramientas-traslado/generar-prueba-detect.mjs`.
     Transcribir 35 hojas y hasta 81 columnas a mano produce erratas, y una errata aquí
     convierte el fixture en degenerado sin que nada avise. Si las cabeceras de
     producción cambian, se regenera y se revisa el diff.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { detectSheetName, classifyOrigin } from './sheets.js';

/** [nombre real de la pestaña, origen esperado, cabeceras REALES] */
const HOJAS = [
  ['Registro_Supervisión', 'Registro_Supervision', ['Fecha', 'Supervisor', 'Módulo', 'Siembra', 'Corrida', 'Estadío_observado', 'Tipo_revisión', 'Deformidad_%', '% Atraso', '% Protusión', 'Protusión', 'Opacidad', 'Asimilación', 'Semillenas (%)', 'Vacías (%)', 'Intestino', 'Actividad', 'Condición_biológica', '% No viables', 'Observaciones', 'Acción', 'Comentario (matutino)', 'Comentario (vespertino)', 'Flacidez', 'Necrosis', 'Disparidad', 'ID']],
  ['Registro_Traslado', 'Registro_Traslado', ['Fecha', 'Viaje', 'Corrida', 'Módulo', 'Camaronera', 'Placa', 'Salinidad', 'Hora salida', 'Hora llegada', 'Revisión', 'Hora', 'Lugar', 'Latitud', 'Longitud', 'Precisión (m)', 'Ubicación', 'Tina', 'Oxígeno (mg/L)', 'Temperatura (°C)', 'Actividad', 'Alimentación', 'Observaciones', 'Insumos', 'Check materiales', 'Controlador despacho', 'Chequeador entrega', 'Responsable recepción', 'Hora registro', 'ID']],
  ['Maduración Bitácora', 'Maduración Bitácora', ['Trovan ID', 'Fecha', 'Tipo', 'Sala', 'Tanque', 'Observaciones']],
  ['Maduración MATRIZ', 'Maduración MATRIZ', ['Número', 'Trovan ID', 'Color anillo', 'Piscina', 'Código genético', 'Lote', 'Sala actual', 'Tanque actual', 'Estado', 'Fecha muerte', 'Fecha ingreso', 'Observaciones']],
  ['Calidad de Agua', 'Calidad de Agua', ['Fecha muestreo', 'Fecha resultados', 'Corrida', 'Responsable', 'Departamento', 'Formato', 'Tipo de muestra', 'Módulo', 'Estadío', 'TQ/N°', 'Sala', 'Estado', 'Componente', 'Muestras', 'S‰', 'pH', 'Alcalinidad', 'Temperatura', 'Nitrito', 'TAN', 'Am.Tóxico', 'Nitrato', 'Amonio', 'Nitrógeno total', 'Calcio', 'Magnesio', 'Potasio', 'Dureza total', 'Hierro', 'Fósforo', 'Cobre', 'Manganeso', 'S‰ antes', 'S‰ después', 'pH antes', 'pH después', 'Calcio antes', 'Calcio después', 'Magnesio antes', 'Magnesio después', 'Potasio antes', 'Potasio después', 'Cloro libre (mg/L)', 'Cloro total (mg/L)', 'Cloro combinado (mg/L)', 'Sesión', 'Lote']],
  ['Microbiología', 'Microbiología', ['Fecha muestreo', 'Fecha resultados', 'Corrida', 'Responsable', 'Departamento', 'Formato', 'Tipo de muestra', 'Módulo/Sala', 'Sexo', 'Estadío', 'TQ/N°', 'V.Amarillos (crudo)', 'V.Amarillos UFC', 'V.Amarillos Nivel', 'V.Verdes (crudo)', 'V.Verdes UFC', 'V.Verdes Nivel', 'V.Totales (crudo)', 'V.Totales UFC', 'V.Totales Nivel', 'V.alginolyticus (crudo)', 'V.alginolyticus UFC', 'V.alginolyticus Nivel', 'V.parahaemolyticus (crudo)', 'V.parahaemolyticus UFC', 'V.parahaemolyticus Nivel', 'V.vulnificus (crudo)', 'V.vulnificus UFC', 'V.vulnificus Nivel', 'Pseudomonas (crudo)', 'Pseudomonas UFC', 'Pseudomonas Nivel', 'Aeromonas (crudo)', 'Aeromonas UFC', 'Aeromonas Nivel', 'Bact.Totales (crudo)', 'Bact.Totales UFC', 'Bact.Totales Nivel', 'Bact.Naranjas (crudo)', 'Bact.Naranjas UFC', 'Bact.Naranjas Nivel', 'Hongos (crudo)', 'Hongos UFC', 'Hongos Nivel', 'V.Luminiscentes', 'Enterobact. (crudo)', 'Enterobact. UFC', 'Levaduras (crudo)', 'Levaduras UFC', 'Observaciones', 'Origen/Tipo', 'Etapa', 'Componente', 'Laboratorio', 'Raceways', 'Tanques', 'Tanque/Reservorio', 'Punto de muestreo', 'Pseudomonas GSP (crudo)', 'Pseudomonas GSP UFC', 'Pseudomonas GSP Nivel', 'Aeromonas GSP (crudo)', 'Aeromonas GSP UFC', 'Aeromonas GSP Nivel', 'Lugar', 'Variedad', 'Días', 'Especie', 'Siembra', 'Muestras', 'Bacterias Rojas (crudo)', 'Bacterias Rojas UFC', 'Carro', 'Tina', 'Sesión', 'Lote', 'pH', 'Conteo BA (crudo)', 'Conteo BA UFC', 'Conteo Lev. (crudo)', 'Conteo Lev. UFC']],
  ['Biomol', 'Biomol', ['Fecha', 'Código', 'Corrida', 'Piscina', 'Lugar', 'Tanque', 'Otros', 'Muestra', 'Estadío', 'Sexo', 'IHHNV', 'WSSV', 'BP', 'AHPND/EMS', 'NHPB', 'EHP', 'Sesión', 'Ciclo de amplificación WSSV', 'Copias/μl WSSV', 'Ciclo de amplificación IHHNV', 'Copias/μl IHHNV', 'Ciclo de amplificación AHPND/EMS', 'Copias/μl AHPND/EMS']],
  ['Maduración Lotes', 'Maduracion', ['Fecha', 'Sala', 'Fila', 'Lote', 'Historial', 'Total de nauplios', 'Total de huevos', 'N2 por lote', 'Desoves por lote', 'No viables por lote']],
  ['Maduración Tanques', 'Maduracion', ['Fecha', 'Sala', 'Lote', 'Tanque', 'Relación H:M', 'Población inicial hembras', 'Población inicial machos', 'Machos muertos', 'Hembras muertas', 'Machos muertos por descarte de selección', 'Hembras muertas por descarte de selección', 'Cópulas', 'Muda']],
  ['Maduración Sala', 'Maduracion', ['Fecha', 'Sala', 'Estado', 'Temperatura 2:00', 'Temperatura 4:00', 'Temperatura 6:00', 'Temperatura 8:00', 'Temperatura 10:00', 'Temperatura 12:00', 'Temperatura 14:00', 'Temperatura 16:00', 'Temperatura 18:00', 'Temperatura 20:00', 'Temperatura 22:00', 'Temperatura 0:00', 'Oxígeno 06:00', 'Oxígeno 12:00', 'Oxígeno 18:00', 'Oxígeno 00:00', 'RAS']],
  ['Datos Larvicultura - M01', 'Larvicultura', ['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Plg (manual)', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación', 'Densidad cosechada', 'Biomasa', 'Cajas/Tinas', 'Destino', 'Piscina', 'Cel/ml', 'Color', '% Espuma', '% Suciedad', '% Recambio', 'Observaciones', 'Toneladas']],
  ['Control_Tanque M01', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Datos Larvicultura - M02', 'Larvicultura', ['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Plg (manual)', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación', 'Densidad cosechada', 'Biomasa', 'Cajas/Tinas', 'Destino', 'Piscina', 'Cel/ml', 'Color', '% Espuma', '% Suciedad', '% Recambio', 'Observaciones', 'Toneladas']],
  ['Control_Tanque M02', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Datos Larvicultura - M03', 'Larvicultura', ['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Plg (manual)', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación', 'Densidad cosechada', 'Biomasa', 'Cajas/Tinas', 'Destino', 'Piscina', 'Cel/ml', 'Color', '% Espuma', '% Suciedad', '% Recambio', 'Observaciones', 'Toneladas']],
  ['Control_Tanque M03', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Datos Larvicultura - M04', 'Larvicultura', ['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Plg (manual)', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación', 'Densidad cosechada', 'Biomasa', 'Cajas/Tinas', 'Destino', 'Piscina', 'Cel/ml', 'Color', '% Espuma', '% Suciedad', '% Recambio', 'Observaciones', 'Toneladas']],
  ['Control_Tanque M04', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Datos Larvicultura - M05', 'Larvicultura', ['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Plg (manual)', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación', 'Densidad cosechada', 'Biomasa', 'Cajas/Tinas', 'Destino', 'Piscina', 'Cel/ml', 'Color', '% Espuma', '% Suciedad', '% Recambio', 'Observaciones', 'Toneladas']],
  ['Control_Tanque M05', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Datos Larvicultura - M06', 'Larvicultura', ['Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Plg (manual)', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación', 'Densidad cosechada', 'Biomasa', 'Cajas/Tinas', 'Destino', 'Piscina', 'Cel/ml', 'Color', '% Espuma', '% Suciedad', '% Recambio', 'Observaciones', 'Toneladas']],
  ['Control_Tanque M06', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Datos Larvicultura - M07', 'Larvicultura', ['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Plg (manual)', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación', 'Densidad cosechada', 'Biomasa', 'Cajas/Tinas', 'Destino', 'Piscina', 'Cel/ml', 'Color', '% Espuma', '% Suciedad', '% Recambio', 'Observaciones', 'Toneladas']],
  ['Control_Tanque M07', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Datos Larvicultura - M08', 'Larvicultura', ['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Plg (manual)', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación', 'Densidad cosechada', 'Biomasa', 'Cajas/Tinas', 'Destino', 'Piscina', 'Cel/ml', 'Color', '% Espuma', '% Suciedad', '% Recambio', 'Observaciones', 'Toneladas']],
  ['Control_Tanque M08', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Datos Larvicultura - M09', 'Larvicultura', ['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Plg (manual)', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación', 'Densidad cosechada', 'Biomasa', 'Cajas/Tinas', 'Destino', 'Piscina', 'Cel/ml', 'Color', '% Espuma', '% Suciedad', '% Recambio', 'Observaciones', 'Toneladas']],
  ['Control_Tanque M09', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Datos Larvicultura - M10', 'Larvicultura', ['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Plg (manual)', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación', 'Densidad cosechada', 'Biomasa', 'Cajas/Tinas', 'Destino', 'Piscina', 'Cel/ml', 'Color', '% Espuma', '% Suciedad', '% Recambio', 'Observaciones', 'Toneladas']],
  ['Control_Tanque M10', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Datos Larvicultura - CIO', 'Larvicultura', ['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Supervivencia', 'Mortalidad', 'Población', 'Lote', 'Estadío', 'Intestino_Lleno', 'Intestino_Semilleno', 'Intestino_Vacio', 'Deformidad', 'Retraso', '% Mortalidad', 'Hongos', '% No_viables', '% Opacidad', 'Lípidos', 'Flácidez', 'Necrosis', 'Canibalismo', 'Parásitos', '% Actividad', 'Plg', 'Talla', 'Estrés', 'Salinidad', 'Técnico', 'ID de Análisis', 'Peso promedio (mg)', 'Longitud promedio (mm)', 'Uniformidad de peso', 'Uniformidad de longitud', 'CV de peso', 'CV de longitud', 'Pigmentación']],
  ['Control_Tanque CIO', 'Control_Tanque', ['Fecha', 'Hora', 'Corrida', 'Módulo', 'Tanque', 'OD', 'Temperatura', 'Observacion']],
  ['Lab_Algas', 'Lab_Algas', ['Fecha', 'Corrida_Larv', 'Modulo_Larv', 'Área_Algas', 'Sistema', 'Lote', 'Dia_Proceso', 'Cel_ml', 'Protozoarios', 'Especie', 'Salinidad_ppt', 'pH', 'Temperatura_C', 'Intensidad_Luz_%', 'Descartado', 'Observaciones', 'Ciliados', 'Filamentosos', 'Técnico', 'Células Vacías', 'Células Semillenas', 'Células Alargadas', 'Células muertas', 'Volumen de Despacho', 'Sesión']],
  ['Registro_Desinfección', 'Registro_Desinfección', ['Fecha', 'Módulo', 'Corrida', 'Tipo de Registro', 'Categoría', 'Elemento', 'Estado', 'Observaciones', 'Código']],
  ['Marea', 'Marea', ['Fecha', 'Día', 'Mes', 'Día Semana', 'Fase Lunar', '%Iluminación', 'Tipo de Marea', 'Pleamar 1', 'Altura P1 (m)', 'Bajamar 1', 'Altura B1 (m)', 'Pleamar 2', 'Altura P2 (m)', 'Bajamar 2', 'Altura B2 (m)', 'Amplitud (m)']],
];

/** Una fila con esas cabeceras y valores vacíos: detectSheetName sólo mira las CLAVES. */
const filaDe = (cabeceras) => Object.fromEntries(cabeceras.map((c) => [c, '']));

describe('detectSheetName · las 35 pestañas reales, con el gid SIN título', () => {
  it('el fixture no se ha quedado vacío ni a medias', () => {
    expect(HOJAS.length).toBe(35);
    for (const [n, , cab] of HOJAS) expect(cab.length, n + ' sin cabeceras').toBeGreaterThan(0);
  });

  for (const [nombre, esperado, cabeceras] of HOJAS) {
    it(`${nombre} → ${esperado}`, () => {
      expect(detectSheetName([filaDe(cabeceras)], 0)).toBe(esperado);
    });
  }

  /* La invariante de verdad, dicha una sola vez: los DOS caminos tienen que coincidir.
     Es lo que impide que el mismo dato se clasifique distinto según cómo se cargó. */
  it('el camino por COLUMNAS coincide con el camino por NOMBRE en las 35', () => {
    const divergen = HOJAS
      .filter(([n, , cab]) => detectSheetName([filaDe(cab)], 0) !== classifyOrigin(n))
      .map(([n]) => `${n}: columnas=${detectSheetName([filaDe(HOJAS.find((h) => h[0] === n)[2])], 0)} vs nombre=${classifyOrigin(n)}`);
    expect(divergen, 'hojas que se clasifican distinto según por dónde entraron:\n' + divergen.join('\n')).toHaveLength(0);
  });

  it('un título que classifyOrigin NORMALIZA manda sobre las columnas', () => {
    // Cabeceras de Marea, pero el título dice «Datos Larvicultura - M01»: gana el título,
    // porque classifyOrigin lo transforma ('Datos Larvicultura - M01' -> 'Larvicultura').
    const marea = HOJAS.find(([n]) => n === 'Marea')[2];
    expect(detectSheetName([filaDe(marea)], 0, 'Datos Larvicultura - M01')).toBe('Larvicultura');
  });

  /* ⚠ QUIRK VIGENTE, anotado a propósito (medido el 2026-09-01). El atajo del título
     sólo se toma cuando classifyOrigin CAMBIA la cadena:

         if (origin !== String(rawTitle).trim()) return origin;

     Un título que YA es canónico —'Biomol', 'Marea', 'Lab_Algas', 'Microbiología'— sale
     de classifyOrigin igual que entró, y por tanto es indistinguible de uno que no se
     reconoció: se cae al respaldo por columnas.
     Hoy NO hace daño, y precisamente por el arreglo del 2026-09-01: como las 35 pestañas
     aciertan también por columnas (es lo que garantiza la prueba de coincidencia de más
     arriba), los dos caminos dan lo mismo. Antes de ese arreglo, un título canónico caía
     en una adivinanza que fallaba 18 veces de 35.
     Se fija tal cual está en vez de arreglarse a escondidas: cambiar esa condición es una
     decisión aparte, y esta prueba obliga a tomarla a la vista. */
  it('un título YA canónico no corta: siguen decidiendo las columnas', () => {
    const marea = HOJAS.find(([n]) => n === 'Marea')[2];
    expect(detectSheetName([filaDe(marea)], 0, 'Biomol')).toBe('Marea');
  });
});

describe('detectSheetName · las trampas de subcadena', () => {
  /* «RAS» (la columna de Maduración Sala) se comprueba por IGUALDAD EXACTA. Como
     subcadena casaba 16 de las 35 pestañas y les robaba la hoja a todas. */
  it('«% Atraso» y «Retraso» NO convierten una hoja en Maduración', () => {
    expect(detectSheetName([filaDe(['Fecha', 'Corrida', '% Atraso'])], 0)).not.toBe('Maduracion');
    expect(detectSheetName([filaDe(['Fecha', 'Corrida', 'Retraso'])], 0)).not.toBe('Maduracion');
    expect(detectSheetName([filaDe(['Fecha', 'Corrida', 'Muestras'])], 0)).not.toBe('Maduracion');
    expect(detectSheetName([filaDe(['Fecha', 'Corrida', 'Levaduras UFC'])], 0)).not.toBe('Maduracion');
  });

  it('pero una columna «RAS» exacta sí', () => {
    expect(detectSheetName([filaDe(['Fecha', 'Sala', 'RAS'])], 0)).toBe('Maduracion');
  });

  /* «Sala» y «nauplios» viven en cabeceras SEPARADAS: la regla pide dos «has»
     independientes, no una sola clave que contenga las dos cosas. */
  it('«Sala» y «Total de nauplios» en columnas separadas bastan para Maduración', () => {
    expect(detectSheetName([filaDe(['Fecha', 'Sala', 'Total de nauplios'])], 0)).toBe('Maduracion');
  });

  /* Y la sobre-corrección: «Sala» a secas no puede reclamar la hoja, o Calidad de Agua
     —que tiene su propia columna «Sala»— se iría a Maduración. */
  it('«Sala» a secas NO basta: Calidad de Agua la tiene y no es Maduración', () => {
    const cal = HOJAS.find(([n]) => n === 'Calidad de Agua')[2];
    expect(cal.map((c) => c.toLowerCase())).toContain('sala');
    expect(detectSheetName([filaDe(cal)], 0)).toBe('Calidad de Agua');
  });
});
