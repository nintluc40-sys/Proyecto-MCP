/* ============================================================
   PLANTA · LA META DE PRODUCCIÓN DEL MES, guardada en ESTE equipo (decisión del usuario, 2026-10-04, como ⚙️ Rangos de
   Microbiología): sin ella, la de por defecto (400 M). La comparten la maqueta (escena.js) y 📊 Análisis (analisis.js);
   vivía en la escena y se trajo aquí con la T1 de Análisis (2026-10-05) para que Análisis no cargue el 3D.
   ============================================================ */
import { META_POR_DEFECTO, META_N5_DIA, normalizarMeta } from './cifras.js';

const META_KEY = 'planta_meta_mes';
export const leerMeta = () => { try { return normalizarMeta(localStorage.getItem(META_KEY)); } catch (_) { return META_POR_DEFECTO; } };
export const guardarMeta = (v) => { try { if (v === META_POR_DEFECTO) localStorage.removeItem(META_KEY); else localStorage.setItem(META_KEY, String(v)); } catch (_) { /* sin almacenamiento: sólo en esta sesión */ } };

/* Punto 10 (07-10 noche, usuario): la meta DIARIA de nauplios N5 (65 M por defecto), igual: guardada en este equipo y
   compartida por los dos modos. La del mes no se guarda: es la diaria × DIAS_PRODUCCION_N5. */
const META_N5_KEY = 'planta_meta_n5_dia';
export const leerMetaN5 = () => { try { return normalizarMeta(localStorage.getItem(META_N5_KEY), META_N5_DIA); } catch (_) { return META_N5_DIA; } };
export const guardarMetaN5 = (v) => { try { if (v === META_N5_DIA) localStorage.removeItem(META_N5_KEY); else localStorage.setItem(META_N5_KEY, String(v)); } catch (_) { /* sin almacenamiento: sólo en esta sesión */ } };
