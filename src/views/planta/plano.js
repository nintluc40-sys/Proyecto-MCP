/* ============================================================
   PLANTA · DATOS DEL PLANO (puros, sin DOM ni 3D)
   Módulos de larvicultura y salas de maduración del Laboratorio Mar Bravo, tomados del plano
   ARQ-A3 V4 (septiembre): posición de cada tanque (detectada sobre el dibujo, en metros), sus
   medidas nominales (las cotas del plano) y la numeración de cada tanque tal como figura en él.
   x crece hacia el este del dibujo y z hacia la calle. Las «otras áreas» son sólo volumen de
   referencia. Lo consume planta/escena.js; lo fija plano.test.js.
   ============================================================ */
export const NUM_A = (r, c) => c < 2 ? 12 - 2 * r - c : (c === 2 ? 5 - 2 * r : 6 - 2 * r); // módulos 1–3
export const NUM_B = (r, c) => c === 0 ? 2 * (r + 1) : 2 * r + 1;                          // módulos 4–10
export const LARV = [
  { id: 'M1', n: 1, box: [144.6, 20.4, 176.5, 37.8], cols: [145.5, 152.7, 161.55, 168.73], rows: [21.6, 27.0, 32.4], L: 6.93, W: 4.18, real: [7.18, 4.63], num: NUM_A, ridge: 'x', canals: [[159.75, 161.35]] },
  { id: 'M2', n: 2, box: [111.9, 20.4, 143.9, 37.8], cols: [112.95, 120.06, 128.84, 135.94], rows: [21.7, 27.13, 32.54], L: 6.84, W: 4.18, real: [7.18, 4.63], num: NUM_A, ridge: 'x', canals: [[127.0, 128.7]] },
  { id: 'M3', n: 3, box: [79.2, 20.4, 111.2, 37.8], cols: [80.05, 87.22, 96.02, 103.22], rows: [21.9, 27.3, 32.72], L: 6.94, W: 4.18, real: [7.18, 4.63], num: NUM_A, ridge: 'x', canals: [[94.3, 95.9]] },
  { id: 'M4', n: 4, box: [47.2, 17.5, 64.0, 49.4], cols: [48.28, 55.68], rows: [18.85, 24.93, 31.0, 37.05, 43.12], L: 7.3, W: 4.88, real: [7.5, 5.06], num: NUM_B, ridge: 'z' },
  { id: 'M5', n: 5, box: [29.8, 17.5, 46.5, 49.4], cols: [30.9, 38.48], rows: [18.92, 25.0, 31.1, 37.13, 43.24], L: 7.3, W: 4.88, real: [7.5, 5.06], num: NUM_B, ridge: 'z' },
  { id: 'M6', n: 6, box: [16.4, 15.2, 29.4, 49.4], cols: [17.7, 23.2], rows: [16.5, 23.1, 29.68, 36.3, 42.9], L: 5.3, W: 5.3, real: [5.5, 5.5], num: NUM_B, ridge: 'z' },
  { id: 'M7', n: 7, box: [1.6, 15.2, 15.0, 49.4], cols: [3.0, 8.6], rows: [16.68, 23.3, 29.88, 36.5, 43.07], L: 5.35, W: 5.3, real: [5.5, 5.5], num: NUM_B, ridge: 'z' },
  { id: 'M8', n: 8, box: [7.5, 49.6, 23.7, 85.4], cols: [8.8, 15.92], rows: [50.7, 56.5, 62.28, 68.08, 73.86, 79.66], L: 6.84, W: 4.6, real: [7.05, 4.62], num: NUM_B, ridge: 'z' },
  { id: 'M9', n: 9, box: [23.9, 49.6, 39.6, 85.4], cols: [24.67, 31.8], rows: [50.63, 56.42, 62.2, 68.0, 73.78, 79.55], L: 6.84, W: 4.6, real: [7.05, 4.62], num: NUM_B, ridge: 'z' },
  { id: 'M10', n: 10, box: [39.8, 49.6, 55.6, 85.4], cols: [40.56, 47.72], rows: [50.56, 56.36, 62.13, 67.9, 73.68, 79.48], L: 6.84, W: 4.6, real: [7.05, 4.62], num: NUM_B, ridge: 'z' },
];
export const LARV_H = 1.25;
export const MAT = [
  { id: 'S1', n: 1, box: [143.9, 1.4, 176.4, 17.6], circ: { xs: [156.9, 161.22, 165.54, 169.86, 174.18], zs: [4.7, 9.65, 14.6], d: 4.15, h: .9, num: (r, c) => (2 - r) * 5 + c + 1 },
    desove: { xs: [146.1, 151.6], zs: [4.7, 9.65, 14.6], d: 4.25, h: 1.0, num: (r, c) => c === 0 ? 3 - r : 4 + r }, partition: 154.3 },
  { id: 'S2', n: 2, box: [116.6, 1.4, 143.9, 17.6], cols: [118.24, 131.2], rows: [2.9, 7.95, 13.05], L: 12.1, W: 3.7, real: [12.55, 3.95], h: .92, num: (r, c) => c === 0 ? 17 + 2 * r : 16 + 2 * r },
  { id: 'S3', n: 3, box: [83.6, 1.4, 111.2, 17.6], cols: [84.9, 98.5], rows: [2.85, 8.0, 13.15], L: 12.3, W: 3.8, real: [12.55, 3.95], h: .92, num: (r, c) => c === 0 ? 23 + 2 * r : 22 + 2 * r },
  { id: 'S4', n: 4, box: [24.2, 1.4, 46.7, 12.0], cols: [24.73, 35.9], rows: [3.0, 7.5], L: 10.1, W: 3.5, real: [10.6, 3.9], h: .9, assumed: true, num: (r, c) => r === 0 ? 29 - c : 33 - c },
  { id: 'S5', n: 5, box: [0.6, 1.4, 24.2, 12.0], cols: [1.15, 13.26], rows: [3.1, 7.6], L: 10.2, W: 3.5, real: [10.6, 3.9], h: .9, assumed: true, num: (r, c) => r === 0 ? 31 - c : 35 - c },
];
// otras áreas: [x0, z0, x1, z1, altura, tipo]  (bld = edificio, res = reservorio, alg = piletas de algas)
export const OTHERS = [
  [79.3, 38.2, 84.2, 66.4, 2.2, 'res'], [85.6, 38.2, 94.1, 66.4, 3.4, 'bld'], [98.6, 38.2, 110.2, 66.4, 1.2, 'alg'], [112, 38.2, 117, 66.4, 2.2, 'res'], [118.3, 38.2, 126.4, 66.4, 3.4, 'bld'],
  [130.8, 38.2, 142.5, 66.4, 1.2, 'alg'], [144.3, 38.2, 149.2, 66.4, 2.2, 'res'], [150.5, 38.2, 158.6, 66.4, 3.4, 'bld'], [164, 38.2, 175.6, 66.4, 1.2, 'alg'],
  [78, 68.6, 95.4, 74.8, 3.4, 'bld'], [99, 68.6, 128.6, 74.8, 3.4, 'bld'], [131.7, 68.6, 160.4, 74.8, 3.4, 'bld'], [164.4, 68.6, 173, 74.8, 2.2, 'res'],
  [78, 79, 170, 88.6, 3.6, 'bld'], [56.2, 49.4, 71.7, 88.6, 3.4, 'bld'], [64.4, 19.3, 70.8, 48.4, 2.2, 'res'], [36.3, 13.4, 63.6, 17.2, 2.2, 'res'], [46.9, 2.2, 66.8, 11.6, 3.6, 'bld'],
  [67.4, 1.6, 83.2, 18, 3.4, 'bld'], [111.4, 1.6, 116.4, 17.4, 3.4, 'bld'], [79.2, 18.4, 176.5, 20.1, 2.8, 'bld'],
];
export const SITE = [0.9, 0.9, 176.6, 89.2], C0 = [88.7, 45], STREET = [97, 107];
