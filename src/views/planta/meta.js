/* ============================================================
   PLANTA · LA META DE PRODUCCIÓN DEL MES, guardada en ESTE equipo (decisión del usuario, 2026-10-04, como ⚙️ Rangos de
   Microbiología): sin ella, la de por defecto (400 M). La comparten la maqueta (escena.js) y 📊 Análisis (analisis.js);
   vivía en la escena y se trajo aquí con la T1 de Análisis (2026-10-05) para que Análisis no cargue el 3D.

   Punto 23 (pauta del 12-11, usuario: «Que valga ahora y avisar») · si el equipo NO puede guardarla (almacenamiento lleno
   o bloqueado), la meta nueva se queda en MEMORIA —este módulo lo comparten la maqueta, Análisis y nauplios, así que vale
   en las tres hasta recargar la página— y un aviso lo dice. Antes se perdía sin aviso: la del mes volvía a la guardada en
   cuanto un pintado la releía (al cambiar de modo) y la diaria de N5 ni se llegaba a ver. Cuando vuelve a poder guardar,
   la de memoria se suelta y manda lo guardado.
   ============================================================ */
import { META_POR_DEFECTO, META_N5_DIA, normalizarMeta } from './cifras.js';
import { toast } from '../../ui/toast.js';

export const AVISO_META_SIN_GUARDAR = 'No se pudo guardar la meta en este equipo (almacenamiento lleno o bloqueado): vale hasta que recargues la página.';

const enMemoria = new Map();   // clave → la meta que no se pudo guardar
const leer = (clave, porDefecto) => {
  if (enMemoria.has(clave)) return enMemoria.get(clave);
  try { return normalizarMeta(localStorage.getItem(clave), porDefecto); } catch (_) { return porDefecto; }
};
/** Guarda `v` (la de por defecto, quitándola). true si quedó en el equipo; si no, la deja en memoria, avisa y da false. */
const guardar = (clave, porDefecto, v) => {
  try {
    if (v === porDefecto) localStorage.removeItem(clave); else localStorage.setItem(clave, String(v));
  } catch (_) {
    enMemoria.set(clave, v);
    toast(AVISO_META_SIN_GUARDAR, 'warn', 9000);
    return false;
  }
  enMemoria.delete(clave);
  return true;
};

const META_KEY = 'planta_meta_mes';
export const leerMeta = () => leer(META_KEY, META_POR_DEFECTO);
export const guardarMeta = (v) => guardar(META_KEY, META_POR_DEFECTO, v);

/* Punto 10 (07-10 noche, usuario): la meta DIARIA de nauplios N5 (65 M por defecto), igual: guardada en este equipo y
   compartida por los dos modos. La del mes no se guarda: es la diaria × DIAS_PRODUCCION_N5. */
const META_N5_KEY = 'planta_meta_n5_dia';
export const leerMetaN5 = () => leer(META_N5_KEY, META_N5_DIA);
export const guardarMetaN5 = (v) => guardar(META_N5_KEY, META_N5_DIA, v);
