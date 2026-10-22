/* ============================================================
   MADURACIÓN · OPERATIVO — los UMBRALES del tablero (Fase 0.4, 2026-09-19)

   Decisión del usuario (2026-09-19): «los umbrales por ahora ponlos por datos bibliográficos y luego le pones el del
   laboratorio». Cada umbral lleva su valor BIBLIOGRÁFICO con la fuente, y un hueco para el del LABORATORIO: cuando se
   rellene, manda ése. Un umbral para el que no se encontró fuente fiable se deja SIN valor —«pendiente del
   laboratorio»— en vez de inventarlo: un semáforo con una cifra sin respaldo avisaría de lo que no se sabe.
   Módulo PURO.

   ⚠ No son las validaciones de captura (los 40 °C de la Sala, los 60 ‰ y 40 °C de la revisión de nauplios): ésas dicen
   «esto no puede ser un dato» y bloquean o avisan al teclear; éstos dicen «esto está fuera de lo recomendable».
   Fuentes consultadas el 2026-09-19 (las cifras de Albalat et al. citan el manual de la FAO de 2003).

   2026-10-22 (usuario): «deja los umbrales en correlación a nivel bibliográfico y en base al manejo del laboratorio».
   Los tres que esperaban (la mortalidad del día y las dos cargas) llevan ya su cifra publicada y la del LABORATORIO, que
   es el percentil 90 de su propio registro (medido ese día en la hoja: elegido por el usuario frente al P75 y a la
   bibliografía sola). La bibliográfica queda al lado como referencia: el laboratorio trabaja unas tres veces por encima
   de ella y, sola, pondría en rojo casi todos los días y todos los tanques.
   ============================================================ */
import { MAD_ALIM_PCT_MIN, MAD_ALIM_PCT_MAX } from '../registros/lib/ficha-maduracion-alimentacion.schema.js';

export const FUENTES = {
  FAO2003: 'FAO (2003). Health management and biosecurity maintenance in white shrimp (Penaeus vannamei) hatcheries in Latin America. FAO Fisheries Technical Paper 450. Roma: FAO.',
  ALBALAT2022: 'Albalat, A., Zacarias, S., Coates, C. J., Neil, D. M. y Rey Planellas, S. (2022). Welfare in farmed decapod crustaceans, with particular reference to Penaeus vannamei. Frontiers in Marine Science 9: 886024. doi:10.3389/fmars.2022.886024 (cita a FAO, 2003).',
  FAO_FICHA: 'FAO. Cultured Aquatic Species Information Programme — Penaeus vannamei (Boone, 1931). FAO Fisheries and Aquaculture Department.',
  REN2020: 'Ren, S., Mather, P. B., Tang, B. y Hurwood, D. A. (2020). Comparison of reproductive performance of domesticated Litopenaeus vannamei females reared in recirculating tanks and earthen ponds. Frontiers in Marine Science 7: 560.',
  AQUACOP1979: 'AQUACOP (1979). Penaeid reared brood stock: closing the cycle of P. monodon, P. stylirostris and P. vannamei. Proceedings of the World Mariculture Society 10: 445–452.',
  FICHA_ALIMENTACION: 'Laboratorio: rango de la ficha 🍤 Alimentación del registro (MAD_ALIM_PCT_MIN / MAD_ALIM_PCT_MAX).',
  LAB_ALCALINIDAD: 'Laboratorio: rango de alcalinidad indicado por el usuario el 2026-09-26 (120–150 mg/L CaCO₃), el mismo que usa 🧫 Calidad de Agua.',
  USUARIO: 'Usuario: decisión del 2026-09-25 para las alertas de 📉 Tendencias y ⏳ Permanencia del tablero (UMBRALES_DE_AVISO).',
  LAB_MANEJO: 'Laboratorio: percentil 90 de su propio registro, medido el 2026-10-22 en la hoja (la mortalidad del día por lote y día; las cargas, en los tanques con peso). Decisión del usuario del 2026-10-22.',
};

/* `min`/`max` vacíos (null) = ese lado no se comprueba. `referencia` es el dato publicado tal cual, para enseñarlo. */
export const UMBRALES = {
  temperatura: { nombre: 'Temperatura del agua de la sala', unidad: '°C',
    bibliografia: { min: 28, max: 29, referencia: '28–29 °C', fuente: ['FAO2003', 'ALBALAT2022'] }, laboratorio: null },
  oxigeno: { nombre: 'Oxígeno disuelto', unidad: 'mg/L',
    bibliografia: { min: 4, max: null, referencia: '≥ 4 mg/L', fuente: ['FAO2003', 'ALBALAT2022'] }, laboratorio: null },
  alcalinidad: { nombre: 'Alcalinidad', unidad: 'mg/L CaCO₃',
    bibliografia: { min: 100, max: null, referencia: '≥ 100 mg/L CaCO₃', fuente: ['FAO2003', 'ALBALAT2022'] },
    /* 2026-09-26 (usuario): «el rango de alcalinidad se maneja de 120-150». Manda sobre el bibliográfico. */
    laboratorio: { min: 120, max: 150, referencia: '120–150 mg/L CaCO₃', fuente: ['LAB_ALCALINIDAD'] } },
  salinidad: { nombre: 'Salinidad', unidad: '‰',
    bibliografia: { min: 30, max: 35, referencia: '30–35 ‰', fuente: ['FAO2003', 'ALBALAT2022'] }, laboratorio: null },
  densidad: { nombre: 'Densidad del tanque', unidad: 'animales/m²',
    bibliografia: { min: 6, max: 15, referencia: '6–15 animales/m²', fuente: ['FAO2003', 'ALBALAT2022'] }, laboratorio: null },
  proporcionHM: { nombre: 'Proporción sexual', unidad: 'hembras por macho',
    bibliografia: { min: 1, max: 2, referencia: 'macho:hembra 1:1, 1:1,5 o 1:2', fuente: ['FAO2003', 'ALBALAT2022'] }, laboratorio: null },
  tasaDeDesove: { nombre: 'Tasa de desove', unidad: '% de hembras por noche',
    bibliografia: { min: 5, max: null, referencia: '5–15 % por noche', fuente: ['FAO_FICHA'] }, laboratorio: null },
  huevosPorDesove: { nombre: 'Huevos por desove', unidad: 'huevos',
    bibliografia: { min: 100000, max: null, referencia: '100 000–250 000 (hembras de 30–45 g)', fuente: ['FAO_FICHA'] }, laboratorio: null },
  naupliosPorDesove: { nombre: 'Nauplios por desove', unidad: 'nauplios',
    bibliografia: { min: 195300, max: null, referencia: '195 300–198 500 de media por desove (recuento a la eclosión; el laboratorio cuenta N5)', fuente: ['REN2020'] }, laboratorio: null },
  fertilidad: { nombre: 'Fertilidad (eclosión)', unidad: '%',
    bibliografia: { min: 83, max: null, referencia: 'tasa de eclosión por desove 0,83–0,85', fuente: ['REN2020'] }, laboratorio: null },
  /* Ren et al.: 92–94 % de las hembras sobreviven 30 días (el segundo mes tras la ablación), o sea 6–8 % al mes; el 8 %
     repartido en 30 días da 0,27 % por día. AQUACOP (1979) es más estricto: un 10 % de pérdidas en tres meses. */
  mortalidadDiaria: { nombre: 'Mortalidad del día', unidad: '%',
    bibliografia: { min: null, max: 0.27, referencia: '≤ 0,27 % por día (92–94 % de supervivencia de las hembras en 30 días)', fuente: ['REN2020'] },
    laboratorio: { min: null, max: 2.6, referencia: '≤ 2,6 % por día, P90 de su registro', fuente: ['LAB_MANEJO'] } },
  /* AQUACOP (1979): «for biomass above 300 g/m², maturations are rare and spawning does not occur», en tanques de 12 m²
     con 80 cm de agua; la volumétrica es esa misma cifra en esa profundidad (0,3 kg ÷ 0,8 m³). */
  cargaMetrica: { nombre: 'Carga métrica', unidad: 'g/m²',
    bibliografia: { min: null, max: 300, referencia: '≤ 300 g/m² (por encima, las maduraciones son raras y no hay desove)', fuente: ['AQUACOP1979'] },
    laboratorio: { min: null, max: 640, referencia: '≤ 640 g/m², P90 de su registro', fuente: ['LAB_MANEJO'] } },
  cargaVolumetrica: { nombre: 'Carga volumétrica', unidad: 'kg/m³',
    bibliografia: { min: null, max: 0.375, referencia: '≤ 0,375 kg/m³ (300 g/m² en tanques con 80 cm de agua)', fuente: ['AQUACOP1979'] },
    laboratorio: { min: null, max: 1.8, referencia: '≤ 1,8 kg/m³, P90 de su registro', fuente: ['LAB_MANEJO'] } },
  alimentoPctToma: { nombre: 'Alimento por toma', unidad: '% de biomasa', bibliografia: null,
    laboratorio: { min: MAD_ALIM_PCT_MIN, max: MAD_ALIM_PCT_MAX, referencia: MAD_ALIM_PCT_MIN + '–' + MAD_ALIM_PCT_MAX + ' %', fuente: ['FICHA_ALIMENTACION'] } },
};

/** El umbral que MANDA: el del laboratorio si lo hay (el de `laboratorio` pasado, o el del catálogo); si no, el
 *  bibliográfico; si no hay ninguno, null. Dice de dónde sale, para enseñarlo junto a la cifra. */
export function umbralVigente(id, laboratorio) {
  const U = UMBRALES[id];
  if (!U) return null;
  const lab = (laboratorio && laboratorio[id]) || U.laboratorio;
  if (lab) return { min: lab.min ?? null, max: lab.max ?? null, origen: 'laboratorio', referencia: lab.referencia || '', fuente: lab.fuente || [] };
  if (U.bibliografia) return { ...U.bibliografia, origen: 'bibliografía' };
  return null;
}

/** «bajo», «alto» u «ok» (los extremos cuentan como dentro); vacío si no hay valor o no hay umbral. */
export function evaluar(id, valor, laboratorio) {
  const u = umbralVigente(id, laboratorio);
  const v = typeof valor === 'number' ? valor : (String(valor ?? '').trim() === '' ? NaN : Number(valor));
  if (!u || !Number.isFinite(v)) return '';
  if (u.min !== null && v < u.min) return 'bajo';
  if (u.max !== null && v > u.max) return 'alto';
  return 'ok';
}

/* Los umbrales de las ALERTAS NUEVAS de la portada (0f · 2b, 2026-09-25): 📉 Tendencias y ⏳ Permanencia
   (operativo.tendencias.js). No son el rango de una variable —por eso no van en UMBRALES, que `evaluar` lee como
   mínimo y máximo—, sino cuánto tiene que cambiar algo frente al período anterior para avisar, con cuántos
   registros, y cuántos días en producción son muchos. Los fijó el USUARIO («20 % y datos suficientes»; «más de 60
   días en producción»), no un libro ni el laboratorio: se cambian AQUÍ, y la prueba exige que la referencia que se
   enseña siga diciendo la cifra que se usa. */
export const UMBRALES_DE_AVISO = {
  cambio: { nombre: 'Cambio frente al período anterior', unidad: '%', valor: 20,
    referencia: 'un cambio del 20 % o más', fuente: ['USUARIO'] },
  registros: { nombre: 'Registros mínimos para comparar', unidad: 'registros', valor: 3,
    referencia: 'al menos 3 registros (desoves o partes)', fuente: ['USUARIO'] },
  produccion: { nombre: 'Permanencia en producción', unidad: 'días', valor: 60,
    referencia: 'más de 60 días desde el fin de la cuarentena', fuente: ['USUARIO'] },
};
