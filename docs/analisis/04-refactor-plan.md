# Plan de refactor — Domesticar el monolito `engine.js` + red de seguridad

> Skill `request-refactor-plan`. Plantilla completa, con el plan en **commits diminutos**
> (cada uno deja el código funcionando, al estilo de Martin Fowler). Salida como markdown;
> para convertir cada commit en issue de GitHub cuando instales `gh`, usa la sección "Commits".

## Problem Statement

La migración a Vite limpió de forma ejemplar las vistas Supervisor y Larvicultura, pero la vista
**Registros** se resolvió embebiendo el monolito original completo —`public/registros/engine.js`,
**13.149 líneas**— servido como asset estático que se auto-arranca contra el DOM, con
manejadores `onclick=` inline en `shell.html`. Es el ~70% del código del proyecto, no pasa por
el pipeline de Vite (sin minificar, sin tree-shaking, sin módulos) y es ilegible/inmantenible.

Además, **todo el proyecto carece de tests**, así que cualquier cambio —en `engine.js` o en el
`core/` limpio— se hace a ciegas.

## Solution

Dos líneas de trabajo, en este orden:

1. **Primero la red de seguridad** (tests sobre `core/`, que ya es testeable). Sin esto, refactorizar
   `engine.js` es ruleta rusa.
2. **Después, domesticar `engine.js` de forma incremental**: no reescribirlo de golpe, sino
   estrangularlo (*strangler fig*) — caracterizar su comportamiento, recortar tajadas hacia
   módulos ES bajo `src/views/registros/`, y eliminar los `onclick` inline a favor de delegación,
   un pedazo a la vez, manteniendo la vista funcionando en cada commit.

No se reescribe la lógica de negocio de Registros; se **traslada** sin cambiar comportamiento.

## Commits

> Cada punto = un commit que deja la app funcionando.

### Fase A — Tooling y red de seguridad (sin tocar comportamiento)

1. Añadir ESLint + Prettier con la config mínima que refleje las convenciones ya vigentes
   (no-`var`, `esc()` obligatorio en `innerHTML` vía regla custom o revisión). Commit solo de config.
2. Añadir `CLAUDE.md` documentando las convenciones reales del repo (capa `core/` sin DOM, store+eventos,
   delegación de eventos, `esc()` siempre, Chart.js gestionado). Esto da al eje "Standards" de `review`
   una fuente real.
3. Instalar Vitest + script `test`. Commit con un único test trivial verde (smoke).
4. Tests de caracterización de `core/dates.js` (`parseAnyDate` para serial Excel, dd/mm/yyyy, ISO; casos límite).
5. Tests de `core/format.js` (semáforos `svLevel`/`odLevel`/`tmpLevel`/`larviZone` en cada frontera de umbral).
6. Tests de `core/fields.js` (`getField`, `parseNum`, `normalizeTecnico`/`dedupeTecnicos`, `getLatestStage`, `autoCalcMortalidad`).
7. Tests de `core/sheets.js` puros: `parseCSV`, `parseCSVLine`, `classifyOrigin`, `detectSheetName`, `dataFingerprint` (con fixtures pequeños).

### Fase B — Corregir defectos baratos descubiertos (con test primero)

8. `getLatestStage`: ampliar `STAGE_ORDER` / manejar estadio desconocido (test D1 primero). 
9. `dataFingerprint`: hash incremental sobre todas las filas (test D3: dos snapshots que solo difieren en fila interior). 
10. Escapar `${e.message}` con `esc()` en los 3 paneles de error (router, shell, registros/index).
11. Limpiar comentario obsoleto de `store.currentView` y resolver la colisión de nombres `rangeLabel`.

### Fase C — Estrangular `engine.js` (caracterizar → extraer → delegar)

12. **Caracterización:** test e2e mínimo (Playwright headless) que abra la vista Registros, haga login
    por módulo+PIN con datos de prueba y verifique que la rejilla se construye. Este es el *bucle*
    que protege todo lo siguiente.
13. Mover `engine.js` y `qrcode.js` a un punto de entrada de módulo (importarlos desde
    `views/registros/index.js` en lugar de inyectar `<script>`), aunque sigan siendo un solo archivo.
    Objetivo: que Vite lo procese. Verificar e2e verde.
14. Extraer la **persistencia** (claves `larv4_`, export/import backup JSON) de `engine.js` a
    `views/registros/storage.js` como funciones exportadas. Reemplazar usos internos. e2e verde.
15. Extraer **sync con GAS** (las llamadas al Apps Script desplegado) a `views/registros/sync.js`. e2e verde.
16. Extraer **render de la rejilla/fichas** a `views/registros/grid.js`. e2e verde.
17. Reemplazar los `onclick="fn()"` de `shell.html` por delegación de eventos (`data-action`)
    en `views/registros/index.js`, función por función, un commit por grupo de acciones. e2e verde en cada uno.
18. Una vez vaciado, eliminar `public/registros/engine.js` y el arranque automático. e2e verde.

### Fase D — Cierre de spec

19. Actualizar `README.md` al alcance real (Revisiones, Biomolecular, Despacho, Comparar ya existen).
20. Resolver las incoherencias de roles/vistas (QA-1/QA-2/QA-3): que `visitante` no esté `pending`,
    y decidir el mapeo rol→vista del rol Supervisor y Chequeador.

## Decision Document

- **Estrangulamiento, no reescritura.** Registros es lógica de negocio validada contra datos reales y
  GAS desplegado; reescribir de cero arriesga regresiones invisibles. Se traslada por tajadas.
- **Módulos a crear:** `views/registros/{storage,sync,grid}.js` + delegación en `index.js`. La capa
  `core/` existente **no se toca** salvo los fixes de Fase B.
- **Persistencia y sync se mantienen idénticos** (claves `larv4_`, mismo GAS) — es un contrato externo.
- **Tooling:** Vitest (mismo ecosistema que Vite, cero config extra) para unitarios; Playwright headless
  solo para el seam e2e de Registros, que no tiene API pura.
- **Sin cambios de esquema** del Google Sheet ni de las URLs/GAS.

## Testing Decisions

- **Qué es un buen test aquí:** prueba comportamiento externo (entrada → salida de funciones `core/`,
  o "abrir vista → DOM esperado"), nunca detalles de implementación interna.
- **Módulos a testear (orden de valor):** `core/dates`, `core/format`, `core/fields`, `core/sheets`
  (las funciones puras) → luego el seam e2e de Registros.
- **Prior art:** no existe en el repo (es greenfield de testing). Los fixtures deben ser CSV/objetos
  pequeños anonimizados, no el Sheet real.
- **Regla:** todo fix de la Fase B y C entra con su test **primero en rojo**, luego en verde.

## Out of Scope

- Reescribir la lógica de negocio de Registros o cambiar su UX.
- Migrar las vistas placeholder (Maduración, Algas, Microbiología) a funcionales.
- Cambios en el Google Sheet, en el Apps Script (GAS) o en el esquema de datos.
- Optimizaciones de rendimiento de las vistas ya limpias (Supervisor/Larvicultura).
- Autenticación/gating real por PIN/rol más allá de lo ya existente.

## Further Notes

- El orden importa: **Fase A antes que C**. Sin tests, estrangular `engine.js` es inseguro.
- Las Fases A y B aportan valor inmediato y bajo riesgo aunque nunca se llegue a la C.
- Si se decide **no** invertir en domesticar `engine.js` ahora, el mínimo aceptable es la Fase A
  (red de seguridad) + el commit 13 (que Vite al menos lo procese), dejando el resto documentado.
