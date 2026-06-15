# Revisión completa — Paso 5 (reconstrucción nativa de la ficha estándar)

> Fecha: 2026-06-13. Revisión minuciosa de todo lo realizado hasta ahora en la
> carpeta definitiva `Music\Nuevo proyecto definitivo`.

## 1. Alcance revisado

Pasos 1–4 (copia limpia, Vitest, ESLint/Prettier, CLAUDE.md, fixes D1/D3/escapes) +
Paso 5 completo: las **7 sub-fichas estándar** reconstruidas como módulos nativos
(calidad, plg, params, poblacion, calagua, despacho, desinfeccion), reutilizando la capa
de datos/sync validada del monolito `public/registros/engine.js`.

## 2. Estado objetivo (evidencia verificada)

| Comprobación | Resultado |
|---|---|
| `npm test` | **159/159 verdes** (20 archivos) |
| `npm run lint` | **0 errores, 10 warnings** (todos preexistentes en vistas del dashboard; **0 en código nuevo**) |
| `npm run build` | **OK** |
| `node --check` engine.js | **OK** |
| Flag viejo `__rgNativeCalidad` | **0 referencias** (unificado a `window.__rgNative`) |
| Branches nativos en el motor | **7/7** con flag correcto |
| Funciones/constantes del motor invocadas por código nativo | **30 funciones + 5 constantes: todas existen** |
| Matriz schema/render/data/branch por ficha | **7/7 completas** |

## 3. Arquitectura del enfoque

- **Estrangulador por delegación + puente** (`window.__rgLib`): los módulos ES nativos se
  exponen al motor (script clásico) en `index.js`; los `render*Ficha()` del motor delegan
  en ellos detrás del flag `window.__rgNative` (APAGADO por defecto → cero impacto productivo).
- **Reutilización de la capa validada** (no se reimplementa la escritura a producción):
  - Persistencia/sync/recolección: `localSave`/`localSync` del motor (leen `#fp-<ficha>`).
  - Herencia: `_inheritShared`/`_inheritPerTank`/`getCorr`/`gcfg`/`getStdLote` vía `inherit.js`.
  - Widgets de dominio reutilizados inyectados: color de agua (`aguaColorSelectHtml`),
    tablas de desinfección (`_dxCatTable`), opciones (`DESTINO_OPTS`, `PTIMES`, `DESINF_TYPES`).
- **Sin handlers inline propios**: todo por `data-*` + delegación única en el host
  (`ficha-events.js`): upInp, rcPob, chkParam, save/sync/clear/recover/pdf/share, CS/TON,
  recalcs de despacho, resync de color, fecha/tipo de desinfección.
- **Render puro y testeable**: cada `*.render.js` es `string → string`, dirigido por su
  esquema; los datos dinámicos (CS, TON, horarios, tipos) se inyectan desde el motor.

## 4. Hallazgos

### Resueltos en esta revisión
- **`vlU` importado sin usar en `calagua.render.js`** → eliminado (devolvió el lint a 10 warnings).

### Compromisos conocidos (decisiones, no defectos)
- **Celda Color (calagua)**: reutiliza el widget del motor, que conserva su `onchange` inline
  (`aguaColorSwatch`). Funciona (es global); candidato a nativizar más adelante.
- **Tablas de desinfección**: se reutiliza `_dxCatTable` (genera HTML limpio, sin inline).
- **`engine.js` creció a 13.260 líneas (+111)**: los 7 branches gated son *andamiaje temporal*.
  Se eliminan —junto con los `render*` viejos— al confirmar en navegador (ver §5).
- **`openCS`/`openTON`** reciben el id de ficha como argumento (lo ignoran): inocuo.

### Riesgo principal — abierto
- **NINGUNA verificación en navegador todavía.** Toda la fidelidad visual y de runtime
  (guardado/sync reales contra el GAS, computados de `rcPob`/`rcDesp*`, widget de color,
  cambio de tipo en desinfección) está respaldada por: transcripción fiel del monolito,
  tests unitarios/DOM, y verificación de que las dependencias del motor existen — **pero no
  por ejecución real**. Es el último eslabón pendiente.

## 5. Próximos pasos recomendados (en orden)

1. **VERIFICAR EN NAVEGADOR** (bloqueante): `npm run dev` → Registros → módulo estándar →
   consola `window.__rgNative = true` → recorrer las 7 sub-fichas: ver que se renderizan
   igual, escribir datos, Guardar local y Guardar y sincronizar, y confirmar en el Sheet.
2. Si OK: **retirar del monolito** los 7 branches gated y los cuerpos `render*` viejos
   (recién entonces `engine.js` encoge de verdad). Hacerlo ficha por ficha, re-verificando.
3. Nativizar el widget de color (quitar su último `onchange` inline).
4. (Opcional) Extraer la capa de datos/sync `larv4_`/GAS a módulos propios, dejando el
   adaptador `fichas-data.js` como única frontera.

## 6. Veredicto

El trabajo está **internamente consistente, probado y construible**, con una arquitectura
limpia y reutilización segura de la lógica que escribe a producción. La cobertura de las 7
sub-fichas es completa y fiel a nivel de campos (verificado por tests). **La única reserva
seria es la ausencia de validación en navegador**, que debe resolverse antes de retirar nada
del monolito o de dar la migración por cerrada.
