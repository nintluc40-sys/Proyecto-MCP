# Auditoría técnica y funcional — Nuevo proyecto definitivo

> Fecha: 2026-06-13. Análisis **desde cero** del código real (arquitectura, calidad,
> rendimiento, UX, estabilidad, seguridad, mantenibilidad). Las correcciones seguras y
> verificables se aplicaron en esta misma auditoría; las de mayor riesgo o que son
> decisión de producto se documentan como recomendaciones.

## Veredicto general

Proyecto **sano y bien estructurado**. El análisis estático salió notablemente limpio:
sin `console.log`/`debugger`, sin referencias indefinidas, sin claves duplicadas, sin código
inalcanzable, sin comparaciones `NaN`, sin `fallthrough`; la igualdad no estricta es solo el
idioma `== null`. 159 tests verdes, lint en **0** tras la limpieza, build OK. El grueso de la
deuda es **un monolito heredado** (`engine.js`) y temas de **rendimiento de carga** y **producto**.

## Metodología

Estructura + tamaños; `eslint` con reglas de bug real (`no-undef`, `no-dupe-keys`, `no-unreachable`,
`no-cond-assign`, `use-isnan`, `no-fallthrough`…) sobre `src/` y `engine.js`; escaneo de timers,
listeners, XSS (`innerHTML` con datos del Sheet), `npm audit`, tamaños de bundle, duplicación.

---

## Hallazgos por criticidad

### 🔴 CRÍTICO
- **(RESUELTO en esta sesión)** `ReferenceError: _noteTm is not defined` en `enter()`/`goBack()`
  del motor — impedía entrar a cualquier módulo tras el PIN. Referencias colgadas de la
  eliminación de la "Nota del módulo". Heredado del original. **Corregido** (2 líneas muertas).
- No hay otros críticos abiertos.

### 🟠 ALTO (rendimiento de carga)
1. **`public/registros/engine.js` = 660 kB servido SIN minificar.** Vive en `public/`, así que
   Vite no lo procesa. Es el mayor asset; se descarga al entrar a Registros. → *Recomendación:*
   minificarlo (parte del endgame: modularizar el motor) o, mínimo, servir una versión minificada.
2. **Bundle principal de 503 kB (1 chunk).** **MITIGADO en esta auditoría:** `manualChunks` separa
   Chart.js → `vendor-chart` 194 kB (cacheable) + `index` 309 kB; desaparece el aviso ">500 kB".
   *Mejora adicional recomendada:* lazy-load de vistas pesadas (Biología Molecular, Supervisor) —
   hoy `main.js` las importa **eager**; solo Registros es diferida.

### 🟡 MEDIO
1. **Roles ↔ vistas inconsistentes (UX/funcional).** Decisión de producto, no bug de código:
   - El rol **"Supervisor"** NO da acceso a la vista **Supervisor**; 3 de sus 4 vistas
     (Maduración/Algas/Microbiología) son **placeholders "en desarrollo"**.
   - El rol **"Chequeador"** tiene `allow: []` → pantalla sin salida.
   *Recomendación:* redefinir el mapeo rol→vista.
2. **Duplicación divergente.** `natCmp` está copiado en **6 archivos** con **3 variantes distintas**
   (larvicultura con locale `es`+numeric; revisiones con `modNum`; supervisor sin locale); arrays
   de alias de columnas (PL/g, Peso, Estadío) duplicados en **5** archivos de supervisor.
   *Recomendación:* consolidar con cuidado (las variantes cambian el orden → revisar caso por caso).
3. **Vulnerabilidades de dependencias de desarrollo** (5: 1 crítica, 1 alta, 3 moderadas — en
   `vite`/`esbuild`/`vite-node`). **No afectan el bundle de producción** (solo build/test). `npm
   audit fix --force` sube a Vite v6 (rompedor). *Recomendación:* actualizar en ventana planificada.
4. **Monolito `engine.js` (12.798 líneas).** Mantenibilidad. Estrangulamiento en curso: las 7
   sub-fichas estándar ya son módulos ES nativos; faltan Algas/Maduración/Microbiología/Biomol/AsT.
5. **Listeners `keydown` (madGridKey/micGridKey/calGridKey) nunca removidos.** El navegador
   deduplica handlers idénticos → **no es fuga**, pero quedan activos globalmente al salir del
   módulo (smell). *Recomendación:* removerlos al salir, o guard por contexto.

### 🟢 BAJO (corregidos en esta auditoría salvo nota)
1. **~~10 warnings de lint~~ → 0.** `prefer-const` (Sets mutados no reasignados), escape `\-`
   innecesario en regex, variable `vars` muerta en `renderComparator`. **Corregido.**
2. **Vista `visitante` mal etiquetada `pending: true`** pese a estar implementada y ser
   accesible → mostraba "en desarrollo" falso. **Corregido** (quitado el flag).
3. **`esc` (core/format.js) y `escapeHtml` (registros/lib/security.js)** son lógica idéntica en
   dos dominios. Duplicación menor, aceptable (separación dashboard/registros). Sin acción.
4. Comentarios obsoletos sueltos (p. ej. `store.currentView`). Cosméticos.

---

## Correcciones aplicadas en esta auditoría

| Fix | Archivo(s) | Tipo |
|-----|-----------|------|
| Lint a 0 warnings (prefer-const, escape, var muerta) | biomolecular/index.js, larvicultura/modals.js | Calidad |
| `manualChunks` → Chart.js en chunk propio (vendor 194 kB cacheable; sin aviso) | vite.config.js | Rendimiento |
| **Lazy-load de Biología Molecular** (chunk propio 109 kB; bundle principal 503→**199 kB** gzip 63 kB) | main.js | Rendimiento |
| Quitado `pending` falso de la vista Visitante | ui/shell.js | UX |
| `npm audit fix` no rompedor (sin efecto: las 5 vulns requieren Vite v6) | — | Seguridad (dev) |
| (previo) Fix `_noteTm` que bloqueaba la entrada a módulos | engine.js | Crítico |

**Resultado de bundle:** principal **199 kB** (gzip 63) + vendor-chart 194 kB (cacheable) + biomolecular
109 kB (diferido) + registros 45 kB (diferido). Desde los 503 kB en un solo chunk del inicio.

**Verificación:** `npm test` 159/159 · `npm run lint` 0 · `npm run build` OK · `node --check` engine OK.

## Recomendaciones (no aplicadas — requieren decisión o ventana)

1. **Minificar/modularizar `engine.js`** (endgame del estrangulador) → mayor ganancia de carga.
2. **Lazy-load de vistas pesadas** (Biología Molecular, Supervisor) en `main.js`.
3. **Consolidar `natCmp` y arrays de alias** a utilidades compartidas (con cuidado por las variantes).
4. **Redefinir el mapeo roles→vistas** (Supervisor/Chequeador).
5. **Actualizar dependencias de desarrollo** en una ventana (Vite v6) y re-verificar.
6. Continuar la migración nativa de las fichas no estándar (Algas/Maduración/Microbiología/Biomol/AsT).

## Lo que esta auditoría NO cubre (requiere navegador)
La validación **funcional en runtime** de las vistas del dashboard (Supervisor/Larvicultura/
Revisiones/Biología Molecular) y de las fichas no estándar no se ejecutó en navegador. El análisis
es estático + por tests; la verificación visual/interactiva de esos flujos queda pendiente del usuario.
