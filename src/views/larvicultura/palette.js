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

/** HSL→hex. Se devuelve HEX (no `hsl(...)`) porque los consumidores concatenan un
 *  alfa de 8 dígitos (`color + '22'`), que solo es válido sobre hex. */
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
/** Color categórico por índice. Los primeros 5 usan la paleta curada; a partir de ahí
 *  se sintetiza un tono distinto por ángulo áureo (137.5°) para que dos tanques NO
 *  compartan color en Población cuando hay más de 5 tanques. */
export const catColor = (i) => (i < CAT.length ? CAT[i] : hslHex(Math.round((i * 137.508) % 360), 62, 48));
