# CLAUDE.md — Convenciones del proyecto

Sistema de Monitoreo y Control Productivo (Larvicultura) — dashboard modular **Vite + ES modules**,
migración del monolito `sistema F.html`. Este documento es la **fuente de estándares** del repo
(la usa la skill `review` en su eje "Standards"). Respétalas al añadir código.

## Arquitectura (resumen)

- `src/config.js` — constantes (URL del Sheet, timeouts, umbrales de semáforo, orden de estadios).
- `src/core/` — **capa de datos SIN DOM**, pura y testeable: `store`, `dates`, `fields`, `format`,
  `sheets`, `refresh`, `charts`, `prodCalendar`, `aguaColor`, `trovan`, `util`.
- `src/ui/` — `router` (registro/cambio de vistas), `shell` (cabecera, drawer, roles, filtro de
  fecha) y las piezas transversales que tocan el DOM: `modal`, `modalEscape`, `toast`.
- `src/views/<vista>/` — cada vista es un módulo con su `index.js` orquestador y su `.css` propio.
  ⚠ **Estas tres listas se comprueban con `ls src/core src/ui src/views`, no se leen de aquí.**
  Se dice porque caducaron las tres a la vez: `core/` llegó a nombrar 7 módulos de 11, `ui/` 2
  de 5, y el `README.md` listaba 8 vistas de 9. Es la misma lección que la cifra de `engine.js`
  de abajo, aplicada a un inventario en vez de a un número.
- `public/sw.js` + `public/manifest.webmanifest` — **la app es una PWA**, y no por comodidad: la
  vista Registros captura en campo sin señal. ⚠ El service worker es el único código del
  proyecto capaz de dejar a alguien viendo una versión **antigua** durante días sin que nadie se
  entere, así que **«desplegado» no implica «los dispositivos lo ven»**. Se prueba de verdad en
  `src/sw.test.js`, que lo carga en un ámbito falso y comprueba qué hace con cada petición.
- `public/registros/engine.js` — **DEUDA TÉCNICA**: monolito heredado embebido de
  ~21.000 líneas (`wc -l public/registros/engine.js` da la cifra del día). No seguir su
  estilo. Ver `docs/analisis/04-refactor-plan.md`.
  ⚠ Aquí vivía la cifra exacta y caducaba cada pocos días, igual que la del número de
  pruebas en `.github/workflows/deploy.yml`. Se deja el orden de magnitud —que es lo
  único que informa una decisión: «esto es un monolito, no un módulo»— y el comando.

## Reglas (qué hace bueno a este código)

1. **`core/` no toca el DOM.** Lógica de datos/cálculo va en `core/` como funciones puras y
   testeables. El DOM vive en `ui/` y `views/`.

   **Excepciones vigentes** (adaptadores de infraestructura del navegador, no lógica de
   vista). Están documentadas porque la regla lisa y llana llevaba tiempo sin cumplirse, y
   una norma que todos saben que se incumple deja de guiar:
   - `core/charts.js` — envuelve Chart.js, que necesita el `<canvas>`: `getElementById`,
     `querySelectorAll('canvas')`, `devicePixelRatio`.
   - `core/refresh.js` — detecta interacción del usuario para pausar el auto-refresco:
     escucha eventos en `document` y consulta `.modal-open`.
   - `core/sheets.js` — usa `window.XLSX` (SheetJS por CDN) y `localStorage` (caché de gids).

   **Criterio para lo nuevo:** un módulo de `core/` solo puede tocar el navegador si es de
   esa misma naturaleza —un adaptador de una capacidad del entorno— y debe degradar sin
   romper cuando no hay DOM (los tests corren en Node sin él). Todo lo que sea leer, calcular
   o transformar datos sigue siendo puro y testeable sin navegador.
2. **Sin estado global colgado de `window`.** El estado compartido va en `core/store.js`; la
   comunicación entre módulos usa el bus de eventos (`on`/`emit`/`EV`).

   **Excepción vigente, y sólo una** (documentada por el mismo motivo que las de la regla 1:
   una norma que todos saben que se incumple deja de guiar):
   - `window.__rgLib` en `src/views/registros/index.js` — **no es estado, es el PUENTE** por el
     que el monolito `engine.js` alcanza los módulos ES nativos que renderizan las 7 fichas
     estándar. `engine.js` no es un módulo ES y no puede importarlos; `window` es el único
     canal que tienen en común. Se asigna una vez, es de sólo lectura para el monolito, y su
     retirada va atada a la del propio `engine.js`.
   ⚠ **No es decorativa: la vigila una herramienta.** `verificar-3copias-v3.mjs` cuenta las
   funciones que delegan a través de este puente y exige que las tres copias coincidan.
   Romperlo deja las fichas sin render, no da error de compilación y la suite no lo ve.

   **Criterio para lo nuevo:** que un módulo ES exponga algo en `window` sólo se acepta para
   hablar con código que **no puede importar** (hoy, únicamente el monolito heredado). Todo lo
   demás usa `store` y el bus.
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

## Skills vendorizadas

`.claude/skills/` trae las skills de `mattpocock/skills` que sirvieron de metodología para los
análisis de `docs/analisis/`; su procedencia y hash están en `skills-lock.json`.

⚠ **Hubo una SEGUNDA copia, `.agents/skills/`, byte a byte idéntica**, y las dos estaban
versionadas: 110 archivos en un repo público para 55 skills, sin tocar desde julio y sin ningún
`settings.json` que cableara su hook. Se retiró la de `.agents/` el 2026-09-16. **No se re-crea el
espejo**: si alguna herramienta necesitara leerlas desde otra ruta, se resuelve con un enlace o
con su configuración, no duplicando el árbol —dos copias divergen en silencio, que es justo lo
que este repo ya vigila a mano en los tres sitios donde no le queda más remedio—.

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
