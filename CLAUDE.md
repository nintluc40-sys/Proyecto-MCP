# CLAUDE.md — Convenciones del proyecto

Sistema de Monitoreo y Control Productivo (Larvicultura) — dashboard modular **Vite + ES modules**,
migración del monolito `sistema F.html`. Este documento es la **fuente de estándares** del repo
(la usa la skill `review` en su eje "Standards"). Respétalas al añadir código.

## Arquitectura (resumen)

- `src/config.js` — constantes (URL del Sheet, timeouts, umbrales de semáforo, orden de estadios).
- `src/core/` — **capa de datos SIN DOM**, pura y testeable: `store`, `dates`, `fields`, `format`,
  `sheets`, `refresh`, `charts`.
- `src/ui/` — `router` (registro/cambio de vistas) y `shell` (cabecera, drawer, roles, filtro de fecha).
- `src/views/<vista>/` — cada vista es un módulo con su `index.js` orquestador y su `.css` propio.
- `public/registros/engine.js` — **DEUDA TÉCNICA**: monolito heredado (~13k líneas) embebido. No
  seguir su estilo. Ver `docs/analisis/04-refactor-plan.md`.

## Reglas (qué hace bueno a este código)

1. **`core/` no toca el DOM.** Lógica de datos/cálculo va en `core/` como funciones puras y
   testeables. El DOM vive en `ui/` y `views/`.
2. **Sin estado global colgado de `window`.** El estado compartido va en `core/store.js`; la
   comunicación entre módulos usa el bus de eventos (`on`/`emit`/`EV`).
3. **Navegación por delegación de eventos.** Nada de `onclick="fn()"` inline en strings de HTML.
   Usa `addEventListener` con `data-*` y `closest()`. (El `engine.js` heredado viola esto; es deuda.)
4. **Escapa SIEMPRE el contenido dinámico en `innerHTML`** con `esc()` de `core/format.js`,
   incluidos los mensajes de error (`esc(e.message)`).
5. **Chart.js gestionado.** Crea gráficos con `makeChart()` y destrúyelos con `destroyAllCharts()`
   al cambiar de vista. Nunca instancies `new Chart` suelto.
6. **Acceso tolerante a columnas del Sheet** vía `getField(row, F.x)` / `parseNum(...)`. No leas
   `row['Columna']` directo: las cabeceras varían en mayúsculas/tildes.
7. **Fechas** siempre por `parseAnyDate()` (soporta serial Excel, dd/mm/yyyy, ISO). No uses
   `new Date(str)` directo.
8. **Cada archivo abre con una cabecera** de comentario que explica su propósito (y su origen en
   el monolito si aplica).

## Tests

- **Vitest.** `npm test` (run único) o `npm run test:watch`.
- Tests co-localizados como `*.test.js` junto al módulo.
- Prioridad: `core/` (es puro y de alto valor). Prueba **comportamiento externo**, no detalles
  de implementación. Los tests de `core/*.test.js` son **caracterización**: fijan el comportamiento
  actual, incluidos quirks documentados (ver comentarios que citan D1–D6 de `docs/analisis`).

## Estilo

- ESLint plano (`eslint.config.js`) + Prettier. `npm run lint` y `npm run format`.
- ES modules, `const`/`let` (nunca `var`), comillas simples, sin punto y coma omitido.

## Datos / integraciones (no cambiar sin querer)

- Origen: Google Sheet (XLSX-first, fallback CSV por gid). URL en `config.js`.
- La vista Registros persiste en `localStorage` con claves `larv4_` y sincroniza con un Apps
  Script (GAS) desplegado. Es un **contrato externo**: no renombrar claves ni endpoints.
