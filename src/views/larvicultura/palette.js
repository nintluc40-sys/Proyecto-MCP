/* ============================================================
   LARVICULTURA · paleta unificada ("Acuícola": teal + semáforo cálido)
   Tres roles reutilizados en los 8 gráficos para que guarden relación:
     ACCENT  → serie única / títulos (Lollipop, Población actual)
     NEUTRAL → secundario (Población inicial, grid, Déficit)
     SEM     → escala ordenada bueno→malo (Histograma, Composición,
               Centro algal, Registros, zonas del Score)
     CAT     → categórica sin orden (morfología, agua, tanques)
   ============================================================ */
export const ACCENT = '#00838F';
export const NEUTRAL = '#90A4AE';

export const SEM = {
  optimo: '#2E9E5B',
  bueno: '#8FBF3F',
  atencion: '#F4B740',
  alerta: '#EF7D3B',
  critico: '#E0413E',
};

export const CAT = ['#1E88E5', '#8E5BD9', '#00ACC1', '#FB8C00', '#6D8B3A'];

/** Color categórico por índice (cíclico). */
export const catColor = (i) => CAT[i % CAT.length];
