/* ============================================================
   LARVICULTURA · configuración de etapas y variables de calidad
   Escala 0–100 donde MENOR = MEJOR. `peso` pondera el ICL.
   `tips` = acción recomendada por zona (atención/alerta/crítico).
   Portado fielmente de window._lqStages / window._lqCombos del original.
   ============================================================ */
export const STAGES = {
  larv: {
    label: 'Larvicultura',
    vars: [
      { key: 'iv', keys: ['Intestino_Vacio', 'intestino_vacio', 'Intestino Vacío', 'Intestino_Vacío', 'Intestino Vacio'], label: 'Intestino Vacío', short: 'Intestino', peso: 0.25, color: '#1E88E5',
        tips: { atencion: 'Revisar protocolo de alimentación y densidad de siembra.', alerta: 'Ajustar frecuencia y calidad de alimentación. Evaluar densidad.', critico: 'Suspender o reducir alimentación. Análisis de contenido estomacal.' } },
      { key: 'def', keys: ['Deformidad', 'deformidad', 'Deformidades', 'deformidades'], label: 'Deformidad', short: 'Deformidad', peso: 0.20, color: '#8E5BD9',
        tips: { atencion: 'Revisar incubación y calidad de agua de maduración.', alerta: 'Evaluar calidad genética. Verificar T° de desarrollo.', critico: 'Detener siembra. Análisis de causa raíz en reproductores.' } },
      { key: 'ret', keys: ['Retraso', 'retraso'], label: 'Retraso', short: 'Retraso', peso: 0.20, color: '#00ACC1',
        tips: { atencion: 'Verificar T°, salinidad y oxigenación.', alerta: 'Evaluar calidad del agua (T°, pH, O₂, NH₃). Reducir estrés.', critico: 'Diagnóstico urgente de parámetros fisicoquímicos.' } },
      { key: 'hng', keys: ['Hongos', 'hongos'], label: 'Hongos', short: 'Hongos', peso: 0.20, color: '#FB8C00',
        tips: { atencion: 'Incrementar recambio. Revisar sanidad de instalaciones.', alerta: 'Aplicar tratamiento antimicótico preventivo. Higiene.', critico: 'Tratamiento antimicótico inmediato. Desinfección del sistema.' } },
      { key: 'nvi', keys: ['No_Viables', '% No_viables', '%No_viables', '% No_Viables', 'no_viables', 'NoViables', 'No Viables', 'No viables'], label: 'No Viables', short: 'No Viab.', peso: 0.15, color: '#6D8B3A',
        tips: { atencion: 'Revisar progenitores e incubación.', alerta: 'Calidad genética y nutricional de reproductores.', critico: 'Revisar proceso de desove. Posible cambio de lote.' } },
    ],
  },
  postl: {
    label: 'Post-Larva',
    vars: [
      { key: 'op', keys: ['% Opacidad', 'Opacidad', 'opacidad', '%Opacidad'], label: 'Opacidad', short: 'Opacidad', peso: 0.25, color: '#1E88E5',
        tips: { atencion: 'Revisar calidad de agua y alimentación.', alerta: 'Etiología bacteriana vs ambiental. Muestreo histológico.', critico: 'Laboratorio urgente. Posible síndrome de opacidad muscular.' } },
      { key: 'fl', keys: ['Flácidez', 'Flacidez', 'flácidez', 'flacidez'], label: 'Flacidez', short: 'Flacidez', peso: 0.22, color: '#8E5BD9',
        tips: { atencion: 'Revisar oxigenación y manejo del tanque.', alerta: 'Calidad nutricional. Análisis de vibrios.', critico: 'Microbiología urgente. Reducir densidad.' } },
      { key: 'ne', keys: ['Necrosis', 'necrosis'], label: 'Necrosis', short: 'Necrosis', peso: 0.22, color: '#00ACC1',
        tips: { atencion: 'Revisar heridas físicas y estrés.', alerta: 'Tratamiento preventivo. Aislamiento de afectados.', critico: 'Posible infección bacteriana severa. Veterinario.' } },
      { key: 'ca', keys: ['Canibalismo', 'canibalismo'], label: 'Canibalismo', short: 'Canib.', peso: 0.18, color: '#FB8C00',
        tips: { atencion: 'Revisar densidad y homogeneidad de tallas.', alerta: 'Reducir densidad. Separar por tallas. Más alimento.', critico: 'Reducción drástica de densidad. Revisar protocolo.' } },
      { key: 'pa', keys: ['Parasitos', 'parasitos', 'Parásitos', 'parásitos'], label: 'Parásitos', short: 'Parásitos', peso: 0.13, color: '#6D8B3A',
        tips: { atencion: 'Inspección visual. Revisar fuentes de agua/alimento.', alerta: 'Muestreo parasitológico. Bioseguridad.', critico: 'Antiparasitario urgente. Cuarentena.' } },
    ],
  },
};

/** Combinaciones de variables que disparan alertas correlacionadas. */
export const LARVI_COMBOS = [
  { keys: ['ret', 'def'], threshold: 45, msg: 'Retraso + Deformidad → Revisar T° y nutrición de reproductores.' },
  { keys: ['ret', 'nvi'], threshold: 45, msg: 'Retraso + No Viables → Calidad de agua y densidad. Protocolo de selección.' },
  { keys: ['hng', 'iv'], threshold: 40, msg: 'Hongos + Intestino Vacío → Contaminación fúngica. Reducir densidad y tratar.' },
  { keys: ['ret', 'hng'], threshold: 40, msg: 'Retraso + Hongos → O₂/NH₃ y contaminación ambiental sistémica.' },
  { keys: ['fl', 'ne'], threshold: 35, msg: 'Flacidez + Necrosis → Posible Vibrio. Microbiología urgente. Densidad.' },
  { keys: ['ca', 'fl'], threshold: 30, msg: 'Canibalismo + Flacidez → Densidad excesiva y déficit nutricional.' },
  { keys: ['op', 'ne'], threshold: 35, msg: 'Opacidad + Necrosis → Síndrome multifactorial. Histopatología urgente.' },
];
