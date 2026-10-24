/* ============================================================
   MADURACIÓN · la REFERENCIA de la tasa de desove (bloque 4, tarea 1, 2026-10-23, usuario)

   Una sola cifra para las dos piezas que la usan: el catálogo de umbrales del tablero (`operativo.umbrales.js`,
   `tasaDeDesove`) y 🔬 Microchips (`data.js`, `TASA_DESOVE_REF`: la banda de cada tanque y el color de la tasa). Antes
   cada una llevaba la suya y no coincidían: el catálogo decía «5–15 %» sin máximo y Microchips pintaba en amarillo lo
   que pasa de 15. Decisión del usuario: 5–15 % por noche (la ficha de la FAO), la misma en las dos.

   Vive aparte y sin dependencias para que ninguna vista baje código de más: el catálogo arrastra la ficha de
   Alimentación y `mad-libro.js`, y `data.js` es el modelo entero de Microchips; Microchips y Microbiología cargan uno,
   Visitante y Planta el otro.
   ============================================================ */

export const TASA_DESOVE = { min: 5, max: 15, referencia: '5–15 % por noche' };
