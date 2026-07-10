/* ============================================================
   REGISTROS · constantes y predicados de módulo (extraídos de engine.js)
   Segunda tajada del estrangulamiento del monolito.
   Funciones PURAS sobre el índice de módulo. engine.js delega vía window.__rgLib.

   NOTA: las constantes ESPEJAN las de engine.js (mismo valor). engine.js conserva
   sus propias constantes top-level (usadas como identificadores en todo el archivo);
   estas son la copia canónica/testeada. Si alguna cambia, cambiar en AMBOS sitios.
   ============================================================ */

// Índices de módulo (mismos valores que engine.js).
const MODS = 10; // módulos de larvicultura estándar M01..M10
export const TQS = 12; // tanques por módulo (13–20 retirados)
export const CIO_MOD = 0;
export const LAB_MOD = 11; // Lab. Algas
export const MAD_MOD = 12; // Maduración
export const AST_MOD = 13; // Asistencia Técnica
export const MIC_MOD = 14; // Microbiología
export const BIO_MOD = 15; // Biomol

/** ¿Es un índice de módulo válido (especial o M01..M10)? */
export function isValidMod(m) {
  return (
    Number.isInteger(m) &&
    (m === CIO_MOD ||
      m === LAB_MOD ||
      m === MAD_MOD ||
      m === AST_MOD ||
      m === MIC_MOD ||
      m === BIO_MOD ||
      (m >= 1 && m <= MODS))
  );
}

export function isMicMod(m) { return m === MIC_MOD; }
export function isBioMod(m) { return m === BIO_MOD; }
export function isAstMod(m) { return m === AST_MOD; }
export function isLabMod(m) { return m === LAB_MOD; }
export function isMadMod(m) { return m === MAD_MOD; }

/** Larvicultura estándar = ni Lab, ni Maduración, ni Biomol, ni AsT, ni Mic. */
export function isStdMod(m) {
  return !isLabMod(m) && !isMadMod(m) && !isBioMod(m) && !isAstMod(m) && !isMicMod(m);
}

/** Etiqueta corta del módulo: CIO/Lab/MAD/AsT/Mic/Bio o "M01".."M10". */
export function mLabel(m) {
  if (m === CIO_MOD) return 'CIO';
  if (m === LAB_MOD) return 'Lab';
  if (m === MAD_MOD) return 'MAD';
  if (m === AST_MOD) return 'AsT';
  if (m === MIC_MOD) return 'Mic';
  if (m === BIO_MOD) return 'Bio';
  return 'M' + String(m).padStart(2, '0');
}
