/* ============================================================
   PLANTA · DATOS DEL PLANO (puros, sin DOM ni 3D)
   Módulos de larvicultura y salas de maduración del Laboratorio Mar Bravo, tomados del plano
   ARQ-A3 V4 (septiembre): posición de cada tanque (detectada sobre el dibujo, en metros), sus
   medidas nominales (las cotas del plano) y la numeración de cada tanque tal como figura en él.
   x crece hacia el este del dibujo y z hacia la calle. Las «otras áreas» son sólo volumen de
   referencia. Lo consume planta/escena.js; lo fija plano.test.js.
   Tanda 3 (2026-10-04, decisión del usuario): las salas 4 y 5 siguen al MCP y no al plano. El plano dibuja
   4 + 4 tanques (28–35); el MCP registra 6 en la Sala 4 (1–6) y 5 en la Sala 5 (7–11), con la numeración que
   repite la 4 y la 1 (MAD_TANQUES_POR_SALA). Se redibujan en el mismo espacio; su disposición y su tamaño son
   aproximados (`assumed`). Las salas 1, 2 y 3 coinciden con el MCP. Los 6 tanques de desove de la Sala 1 no
   tienen registro por tanque en el MCP.
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
  { id: 'S1', n: 1, sala: 'Sala 1', box: [143.9, 1.4, 176.4, 17.6], circ: { xs: [156.9, 161.22, 165.54, 169.86, 174.18], zs: [4.7, 9.65, 14.6], d: 4.15, h: .9, num: (r, c) => (2 - r) * 5 + c + 1 },
    desove: { xs: [146.1, 151.6], zs: [4.7, 9.65, 14.6], d: 4.25, h: 1.0, num: (r, c) => c === 0 ? 3 - r : 4 + r }, partition: 154.3 },
  { id: 'S2', n: 2, sala: 'Sala 2', box: [116.6, 1.4, 143.9, 17.6], cols: [118.24, 131.2], rows: [2.9, 7.95, 13.05], L: 12.1, W: 3.7, real: [12.55, 3.95], h: .92, num: (r, c) => c === 0 ? 17 + 2 * r : 16 + 2 * r },
  { id: 'S3', n: 3, sala: 'Sala 3', box: [83.6, 1.4, 111.2, 17.6], cols: [84.9, 98.5], rows: [2.85, 8.0, 13.15], L: 12.3, W: 3.8, real: [12.55, 3.95], h: .92, num: (r, c) => c === 0 ? 23 + 2 * r : 22 + 2 * r },
  // Sala 4 · 6 tanques en 3 × 2 y Sala 5 · 5 tanques en 3 + 2 (MCP); `pos`: [x, z, número] de cada uno
  { id: 'S4', n: 4, sala: 'Sala 4', box: [24.2, 1.4, 46.7, 12.0], L: 6.49, W: 3.5, real: [6.49, 3.5], h: .9, assumed: true,
    pos: [[25.02, 3.0, 1], [32.21, 3.0, 2], [39.4, 3.0, 3], [25.02, 7.5, 4], [32.21, 7.5, 5], [39.4, 7.5, 6]] },
  { id: 'S5', n: 5, sala: 'Sala 5', box: [0.6, 1.4, 24.2, 12.0], L: 6.85, W: 3.5, real: [6.85, 3.5], h: .9, assumed: true,
    pos: [[1.42, 3.0, 7], [8.97, 3.0, 8], [16.52, 3.0, 9], [1.42, 7.5, 10], [8.97, 7.5, 11]] },
];
/** Los tanques rectangulares de una sala (2 a 5): { x, z, num }, con x y z en la esquina del tanque. */
export function tanquesDeSala(m) {
  if (m.pos) return m.pos.map(([x, z, num]) => ({ x, z, num }));
  return m.rows.flatMap((z, r) => m.cols.map((x, c) => ({ x, z, num: m.num(r, c) })));
}
// otras áreas: [x0, z0, x1, z1, altura, tipo]  (bld = edificio, res = reservorio, alg = piletas de algas)
/* Otras áreas: [x0, z0, x1, z1, alto, tipo, nombre, forma]. El NOMBRE sale de los rótulos del plano ARQ-A3 V4, ubicados
   sobre cada área con un ajuste lineal entre la posición de los rótulos «MODULO # n» y el centro de cada módulo (error
   medio 0,5 m; 2026-10-04, opción F): «título · detalle». Un área sin rótulo en el plano queda con un nombre genérico.
   La FORMA (opcional) elige sus detalles en la maqueta: maquinas, diesel, filtros, lab, admin, comedor. El canal
   sedimentador era una caja de 2,8 m: es tipo 'canal' (abierto, con agua). */
export const OTHERS = [
  [79.3, 38.2, 84.2, 66.4, 2.2, 'res', 'Algas premasivos'], [85.6, 38.2, 94.1, 66.4, 3.4, 'bld', 'Filtros y tratamiento de agua · Turbidex, tanques elevados, dosificación', 'filtros'],
  [98.6, 38.2, 110.2, 66.4, 1.2, 'alg', 'Algas masivos'], [112, 38.2, 117, 66.4, 2.2, 'res', 'Reservorio'], [118.3, 38.2, 126.4, 66.4, 3.4, 'bld', 'Generador diésel · y reservorio de agua salada', 'diesel'],
  [130.8, 38.2, 142.5, 66.4, 1.2, 'alg', 'Algas masivos'], [144.3, 38.2, 149.2, 66.4, 2.2, 'res', 'Reservorio'], [150.5, 38.2, 158.6, 66.4, 3.4, 'bld', 'Reservorio de agua salada'],
  [164, 38.2, 175.6, 66.4, 1.2, 'alg', 'Algas masivos'],
  [78, 68.6, 95.4, 74.8, 3.4, 'bld', 'Administración · dirección, asistencia, espera', 'admin'], [99, 68.6, 128.6, 74.8, 3.4, 'bld', 'Fotobiorreactor y CIO · cisterna de agua salada'],
  [131.7, 68.6, 160.4, 74.8, 3.4, 'bld', 'Edificio de servicio'], [164.4, 68.6, 173, 74.8, 2.2, 'res', 'Reservorio'],
  [78, 79, 170, 88.6, 3.6, 'bld', 'Comedor, cocina y bodegas · insumos, carboys', 'comedor'], [56.2, 49.4, 71.7, 88.6, 3.4, 'bld', 'Cuarto de máquinas · bombas, calderos, blowers', 'maquinas'],
  [64.4, 19.3, 70.8, 48.4, 2.2, 'res', 'Reservorio'], [36.3, 13.4, 63.6, 17.2, 2.2, 'res', 'Reservorio de agua dulce'],
  [46.9, 2.2, 66.8, 11.6, 3.6, 'bld', 'Laboratorio · microbiología, PCR, fisicoquímico, artemia', 'lab'],
  [67.4, 1.6, 83.2, 18, 3.4, 'bld', 'Oficina de maduración · alimentos, paneles eléctricos'], [111.4, 1.6, 116.4, 17.4, 3.4, 'bld', 'Edificio de servicio'],
  [79.2, 18.4, 176.5, 20.1, .6, 'canal', 'Canal sedimentador y recolector'],
];
export const SITE = [0.9, 0.9, 176.6, 89.2], C0 = [88.7, 45], STREET = [97, 107];

/* ---------- 📊 Plano 2D (T4 de Análisis, 2026-10-06, usuario) ----------
   Las formas del plano esquemático visto desde arriba, en METROS del dibujo (el SVG usa x, z tal cual: x al este, z hacia
   la calle): el terreno; delante, la grava, la calle a escala y una franja de playa y otra de mar SÓLO de orientación (la
   orilla real queda a ~20 m de la calle: a escala dejaría medio plano vacío); las otras áreas con su nombre; y cada módulo y
   sala con su contorno y sus tanques —rectángulos por su esquina con el largo hacia el este, círculos por su centro—, los
   mismos de la maqueta (escena.js). */
export function formasDelPlano() {
  const r2 = (v) => Math.round(v * 100) / 100;
  const caja = (b) => ({ x: b[0], z: b[1], w: r2(b[2] - b[0]), h: r2(b[3] - b[1]) });
  const ancho = r2(SITE[2] + SITE[0]), playa = STREET[1] + 2.5, fin = playa + 5.5;
  const grupos = [
    ...LARV.map((m) => ({ id: m.id, kind: 'larv', ...caja(m.box),
      tanques: m.rows.flatMap((z, r) => m.cols.map((x, c) => ({ num: m.num(r, c), forma: 'rect', x, z, w: m.L, h: m.W }))) })),
    ...MAT.map((m) => ({ id: m.id, kind: 'mat', ...caja(m.box),
      tanques: m.circ
        ? [...m.circ.zs.flatMap((z, r) => m.circ.xs.map((x, c) => ({ num: m.circ.num(r, c), forma: 'circ', cx: x, cz: z, r: m.circ.d / 2 }))),
          ...m.desove.zs.flatMap((z, r) => m.desove.xs.map((x, c) => ({ num: m.desove.num(r, c), desove: true, forma: 'circ', cx: x, cz: z, r: m.desove.d / 2 })))]
        : tanquesDeSala(m).map(({ x, z, num }) => ({ num, forma: 'rect', x, z, w: m.L, h: m.W })) })),
  ];
  return {
    vista: { x: 0, z: 0, w: ancho, h: fin },
    terreno: caja(SITE),
    bandas: [
      { tipo: 'grava', x: 0, z: SITE[3], w: ancho, h: r2(STREET[0] - SITE[3]) },
      { tipo: 'calle', x: 0, z: STREET[0], w: ancho, h: STREET[1] - STREET[0] },
      { tipo: 'playa', x: 0, z: STREET[1], w: ancho, h: r2(playa - STREET[1]) },
      { tipo: 'mar', x: 0, z: playa, w: ancho, h: r2(fin - playa) },
    ],
    otras: OTHERS.map((o) => ({ ...caja([o[0], o[1], o[2], o[3]]), tipo: o[5], nombre: o[6] })),
    grupos,
  };
}
