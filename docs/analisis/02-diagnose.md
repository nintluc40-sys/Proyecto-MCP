# Diagnose — barrido de defectos candidatos

> Skill `diagnose`. **Importante:** la skill está diseñada para **un bug concreto y
> reproducible**, y su Fase 1 ("construye un bucle de feedback") es el 90% del trabajo.
> No hay un bug reportado todavía, así que esto es un *barrido estático* de defectos
> candidatos. Cada uno incluye una **hipótesis falsable** y cómo construirías el bucle.
> Confirma el síntoma real antes de aplicar el fix.

## Fase 1 — el bucle de feedback que hoy NO existe

El proyecto **no tiene tests ni harness**. Antes de diagnosticar cualquier bug en serio,
el primer entregable es un bucle:

- **Opción A (recomendada):** Vitest sobre `src/core/*` — son funciones puras sin DOM
  (`parseAnyDate`, `svLevel`/`odLevel`/`tmpLevel`, `autoCalcMortalidad`, `detectSheetName`,
  `parseCSV`). Bucle determinista de <2 s.
- **Opción B:** script CLI que cargue un fixture XLSX/CSV real (anonimizado) y haga diff de
  `store.globalData` contra un snapshot conocido.
- **Opción C (UI):** Playwright headless contra `npm run dev`, asercionando sobre el DOM de
  cada vista. Más lento, pero cubre los bugs de render.

Sin uno de estos, los defectos de abajo no se pueden *cerrar* con confianza.

---

## Defectos candidatos (ranqueados)

### D1 — `getLatestStage` puede no devolver el estadio del día más reciente · **Media**

`core/fields.js:97`. Ordena por fecha desc y recorre días buscando el primer día con estadio.
Correcto. **Pero** `stageRank` usa `STAGE_ORDER.indexOf(...)`: cualquier estadio fuera de la
lista (p.ej. `"PL31"`, o un tipeo `"Z4"`) devuelve `-1` y queda por **debajo** de un `N1`.

- **Hipótesis falsable:** *Si* una fila tiene un estadio no listado (`PL31`), *entonces* el
  resumen mostrará un estadio anterior en lugar del real.
- **Bucle:** test unitario `getLatestStage([{Fecha, Estadío:'PL31'}])` → espera `'PL31'`,
  observa `'N/A'` o el menor.
- **Fix probable:** ampliar `STAGE_ORDER` (PL hasta 40) o tratar desconocidos como rank alto.

### D2 — Parseo de serial Excel ignora fechas < 1970 · **Baja**

`core/dates.js:21`: `asNum > 25569` descarta seriales por debajo de 1970-01-01. Si alguna hoja
trae fechas históricas como serial, se pierden silenciosamente (caen al fallback `new Date(s)`,
que con un número da fecha inválida).

- **Hipótesis falsable:** *Si* una celda fecha es el serial `20000` (1954), *entonces*
  `parseAnyDate` devuelve `null` y la fila se excluye de rangos/últimas fechas.
- **Bucle:** `expect(parseAnyDate('20000')).not.toBeNull()`.
- **Nota:** probablemente irrelevante para datos de 2025–2026; documentar el límite y cerrar.

### D3 — `dataFingerprint` muestrea solo 3 filas → cambios intermedios invisibles · **Media**

`core/sheets.js:270`: la huella usa `rows[0]`, `rows[n-1]` y `rows[mitad]` + el conteo. Si una
edición en el Sheet **no cambia el número de filas** y ocurre en una fila no muestreada, el
auto-refresco la marca "sin cambios" y **no re-renderiza** (`refresh.js:43`).

- **Hipótesis falsable:** *Si* editas un valor en una fila intermedia sin añadir/quitar filas,
  *entonces* el dashboard no refleja el cambio hasta un cambio de conteo o reconexión manual.
- **Bucle:** dos snapshots de hojas idénticos salvo una fila interior; `dataFingerprint(a) === dataFingerprint(b)` debería ser `false` y hoy puede ser `true`.
- **Fix probable:** hash incremental sobre todas las filas (cheap rolling hash) en lugar de muestreo.

### D4 — Mensajes de error sin escapar en `innerHTML` · **Baja (robustez)**

`ui/router.js:29`, `ui/shell.js:53`, `views/registros/index.js:55`: `${e.message}` va directo a
`innerHTML`. Un mensaje con `<` rompe el markup del estado de error.

- **Hipótesis falsable:** *Si* `e.message` contiene `<svg>`, *entonces* el panel de error
  renderiza mal / inyecta nodos.
- **Bucle:** forzar un throw con mensaje `"<b>x"` y observar el DOM.
- **Fix:** envolver con `esc(e.message)` (la convención del repo ya lo usa en 184 sitios).

### D5 — Detección de hoja por columnas: orden frágil · **Media**

`core/sheets.js:63` (`detectSheetName`, ruta de fallback CSV). El propio comentario advierte que
`Registro_Supervision` comparte columnas con `Morfologia/Larvicultura` y debe detectarse antes.
El orden de los `if` es la única garantía; un cambio de columnas en el Sheet puede misclasificar
y **contaminar** vistas (justo el bug que el README dice haber corregido).

- **Hipótesis falsable:** *Si* una hoja de Larvicultura gana una columna `Supervisor`,
  *entonces* `detectSheetName` la etiqueta como `Registro_Supervision` y desaparece del Supervisor.
- **Bucle:** tabla de fixtures `(columnas) → origen esperado` como test parametrizado.
- **Nota:** esto solo aplica al fallback CSV; el camino XLSX usa el nombre real de pestaña.

### D6 — `autoCalcMortalidad` muta filas in-place y se re-ejecuta en cada refresh · **Baja**

`core/fields.js:118` añade `Mortalidad`/`_MortCalc`. En cada `tick()` de `refresh.js` se vuelve a
llamar sobre `rows` nuevas (ok), pero si alguna vez se reusara el mismo array, el guard `hasMort`
ya vería la mortalidad calculada como "existente". Hoy no ocurre (cada fetch crea filas nuevas),
pero es una trampa latente.

- **Hipótesis falsable:** *Si* se llamara dos veces sobre el mismo array, *entonces* `_MortCalc`
  no se recalcula aunque cambie `Supervivencia`.
- **Cierre:** documentar la precondición "filas frescas" o recalcular ignorando `_MortCalc`.

---

## Fase 6 — qué prevendría estos bugs

Todos los candidatos de **datos** (D1, D2, D3, D5, D6) son funciones puras de `core/` y son
**triviales de blindar con tests unitarios**. La ausencia de un seam de test es, en sí misma,
el hallazgo principal: el código está bien estructurado *para* testear, pero nadie lo hizo.
Recomendación: montar Vitest sobre `core/` como primer paso de la versión definitiva
(es también el "bucle" que esta skill exige para cualquier diagnóstico serio posterior).
