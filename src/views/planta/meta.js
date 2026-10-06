/* ============================================================
   PLANTA · LA META DE PRODUCCIÓN DEL MES, guardada en ESTE equipo (decisión del usuario, 2026-10-04, como ⚙️ Rangos de
   Microbiología): sin ella, la de por defecto (400 M). La comparten la maqueta (escena.js) y 📊 Análisis (analisis.js);
   vivía en la escena y se trajo aquí con la T1 de Análisis (2026-10-05) para que Análisis no cargue el 3D.
   ============================================================ */
import { META_POR_DEFECTO, normalizarMeta } from './cifras.js';

const META_KEY = 'planta_meta_mes';
export const leerMeta = () => { try { return normalizarMeta(localStorage.getItem(META_KEY)); } catch (_) { return META_POR_DEFECTO; } };
export const guardarMeta = (v) => { try { if (v === META_POR_DEFECTO) localStorage.removeItem(META_KEY); else localStorage.setItem(META_KEY, String(v)); } catch (_) { /* sin almacenamiento: sólo en esta sesión */ } };
