# Review — dos ejes (Estándares · Spec)

> Skill `review`. La fuente no es repo git, así que se revisó el árbol `src/` completo
> (más `public/registros/`) como si fuera el diff. No existe documento de estándares en el
> repo, de modo que el eje **Estándares** se evalúa contra las convenciones que el propio
> código y el README establecen.

---

## Eje Estándares

**Fuentes de estándares encontradas:** ninguna formal. No hay `CLAUDE.md`, `CONTRIBUTING.md`,
`STANDARDS.md`, `.editorconfig`, ESLint ni Prettier. El único contrato implícito es el README
y la consistencia interna del propio `src/`.

> ⚠️ **Hallazgo de proceso (no del código):** sin estándares documentados ni linter, las
> convenciones excelentes que hoy mantiene `src/` dependen de la disciplina manual. Recomendado
> crear `CLAUDE.md` + ESLint antes de seguir creciendo. Ver `04-refactor-plan.md`.

Convenciones que `src/` **sí cumple** de forma consistente (esto es lo bueno):

- Capa `core/` sin DOM, reutilizable y testeable (separación de responsabilidades real).
- Estado por `store` + bus de eventos; nada colgado de `window` (0 coincidencias).
- Escapado de HTML con `esc()` (184 usos) frente a 91 `innerHTML`.
- Gestión centralizada de Chart.js con destrucción (`makeChart`/`destroyAllCharts`), evitando
  fugas de canvas al cambiar de vista.
- Cabeceras de archivo que documentan el propósito y el origen en el monolito.

Violaciones de la convención interna (juicio, no regla automática):

| Severidad | Ubicación | Hallazgo |
|-----------|-----------|----------|
| **Alta** | `public/registros/engine.js`, `src/views/registros/shell.html` | Rompe TODAS las convenciones del proyecto: 13k líneas en un solo archivo, `onclick="exportBackup()"` inline (la convención es delegación de eventos), arranque automático contra el DOM global. Vive en `public/` por lo que Vite **no lo procesa** (sin minificar, sin tree-shaking). |
| Media | `src/ui/router.js:29`, `src/ui/shell.js:53`, `src/views/registros/index.js:55` | `${e.message}` y `${e.message}` se interpolan en `innerHTML` **sin** `esc()`. La convención del repo es escapar; aquí un mensaje de error con `<` rompería el render (XSS de bajo riesgo, pero inconsistente). |
| Baja | `src/core/store.js:16` | Comentario obsoleto: `currentView: 'supervisor' | 'larvicultura'` cuando ya hay 9 vistas registradas. |
| Baja | `src/core/dates.js:81` y `src/ui/shell.js:193` | Dos funciones distintas llamadas `rangeLabel` (una exportada que recibe una lista, otra local sin argumentos). Colisión de nombres confusa. |

---

## Eje Spec

**Fuente del spec:** `README.md` del proyecto (describe arquitectura, flujo de datos y un
apartado explícito "Implementado" / "Pendiente").

Requisitos del README **cumplidos** (verificado en código):

- ✅ Refactor de globals → `store` + eventos. Confirmado: `store.js` + `on/emit/EV`, sin
  `window.x =` en `src/`.
- ✅ Navegación por delegación de eventos en vez de `onclick` embebido — **se cumple en `src/`**
  (ver `shell.js:153` `drawerNav.addEventListener`), pero **se incumple en la vista Registros**
  (engine.js/shell.html usan `onclick` inline). El README no menciona esta excepción.
- ✅ Corrección del filtro Supervisor a `_SheetOrigin === 'Larvicultura'` — confirmado en
  `core/fields.js:87` (`isLarviculturaRow`).
- ✅ XLSX-first con fallback CSV por gid + scraping — confirmado en `core/sheets.js`.
- ✅ Auto-refresco con fingerprint e inactividad — confirmado en `core/refresh.js`.

Desajustes spec ↔ código:

| Tipo | Detalle |
|------|---------|
| **Scope creep / no documentado** | El README dice que la migración cubre **"las dos vistas útiles"** (Supervisor y Larvicultura) y lista Despacho/Comparador como *pendientes*. Sin embargo el código ya incluye vistas **Revisiones, Biología Molecular, Visitante, Despacho y Comparar Tanques** implementadas. El README quedó **desactualizado** respecto al alcance real. |
| **Parcial** | El README lista "Maduración, Algas, Microbiología, Visitante" — en `main.js` esas son *placeholders* navegables (`🚧 en desarrollo`), salvo que `visitante` **sí** tiene `index.js` real (143 líneas) pero está marcada `pending: true` en `shell.js:83`. Incoherencia: la vista existe pero el rol no la ve por estar marcada pendiente. |
| **Confuso (heredado, ya anotado en README)** | El rol llamado `supervisor` **no** da acceso a la vista `supervisor` (da maduración/algas/biomol/microbiología). El propio README §"Nota de etiquetas" reconoce el lío de rótulos del original; vale la pena cerrarlo en la versión definitiva. |

---

## Resumen

- **Estándares:** 1 hallazgo alto (el monolito `engine.js`), 1 medio (error sin escapar), 2 bajos.
- **Spec:** núcleo fiel al README; el **README está desactualizado** frente al alcance ya implementado.
- **Peor issue único:** `public/registros/engine.js` (13.149 líneas) — viola todas las convenciones
  del proyecto y concentra el riesgo. Es el objetivo central de `04-refactor-plan.md`.
