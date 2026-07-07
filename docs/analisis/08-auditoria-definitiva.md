# 08 · Auditoría Definitiva del Sistema

**Fecha:** 2026-07-06 · **Modelo:** Claude Fable 5 · **Alcance:** las 8 vistas + capa `core`/`ui` (incidental) + monolito `public/registros/engine.js` (12 866 líneas).

**Metodología:** una vista por tanda (inventariar → analizar → evidenciar → corregir solo cambios seguros/controlados → verificar no-regresión → reportar). Principio inviolable: **no regresión funcional**.

---

## Resumen ejecutivo

- **8/8 vistas APROBADAS** para comenzar el desarrollo de las interfaces definitivas.
- **Cero defectos Crítico o Alto** en todo el sistema.
- **Un único cambio de código** aplicado en toda la auditoría (fix seguro y verificado en Larvicultura).
- **Estado del sistema al cierre:** `356 tests · lint 0 · build OK` (certificado tras la última tanda).

**Veredicto:** el sistema está listo para el desarrollo definitivo. Las decisiones pendientes son **fortificaciones** (seguridad / UX / rendimiento), no defectos, y ninguna bloquea el arranque. Se recomienda abordar primero las dos de seguridad antes de exponer el sistema a más usuarios.

---

## Balance por vista

| # | Vista | Líneas | Veredicto | Bugs C/A/M | Acción |
|---|-------|--------|-----------|-----------|--------|
| 1 | Supervisor | 4321 | ✅ Aprobada | 0 | — |
| 2 | Larvicultura | 2018 | ✅ Aprobada | 0 | **1 fix aplicado** |
| 3 | Registros (+`engine.js`) | 1655 (+12 866) | ✅ con reserva | 0 | Auth pendiente de decisión |
| 4 | Biología Molecular | 1651 | ✅ Aprobada | 0 | SRI pendiente |
| 5 | Algas | 1553 | ✅ Aprobada | 0 | — |
| 6 | Microbiología | 1461 | ✅ Aprobada | 0 | Optimización opcional |
| 7 | Revisiones | 1157 | ✅ Aprobada | 0 | — |
| 8 | Visitante | 488 | ✅ Aprobada | 0 | — |

---

## Corrección aplicada (única)

### Larvicultura · `src/views/larvicultura/extra.js`
- **Hallazgo [Bajo · consistencia de datos]:** la constante local `ESTADIO_KEYS` (`['Estadío','Estadio','estadío','estadio']`) **omitía la variante `'ESTADIO'`** (mayúsculas sin tilde) que sí incluye el `F.estadio` compartido de `core/fields.js`. Si una cabecera del Sheet llegaba como `ESTADIO`, el gráfico «Centro algal» (`buildAlgae`) quedaría vacío, mientras el resto del sistema sí la honra. Violaba la regla 6 del `CLAUDE.md` (acceso tolerante a columnas).
- **Corrección (Controlada, riesgo de regresión nulo):** eliminada la constante duplicada; `buildAlgae` usa ahora `getField(r, F.estadio)`. Estrictamente aditivo (solo capta una variante extra ya reconocida en el resto del sistema).
- **Verificación:** `356 tests · lint 0 · build OK` (bundle 30 bytes menor).

---

## Decisiones pendientes (propuestas · ninguna bloquea el desarrollo)

### 1. [MEDIO · Seguridad] Autenticación de Registros solo-cliente con PINs hardcodeados
- **Evidencia:** `public/registros/engine.js:74-83` define `PINS` en texto plano (4 dígitos triviales: `1111`, `2222`, …) en un archivo **servido públicamente**. La verificación es solo cliente: `chkPin()` (`:1986`) y `enter()` (`:1996`) solo alternan clases CSS al validar. La URL del GAS está anclada (`:33`) y el token es **opcional** (`:1561-1563`).
- **Impacto:** cualquiera con acceso al JS ve los PINs; si el GAS no exige token server-side, cualquiera con la URL puede escribir al Sheet. Para una herramienta **interna** puede ser aceptable, pero debe ser una decisión consciente.
- **Fix real:** exigir el token en el **GAS** (server-side), no en `engine.js`. Clasificación: Riesgosa → propuesta, no aplicada.

### 2. [MEDIO · Supply-chain] Scripts de CDN sin Subresource Integrity (SRI)
- **Evidencia:** `index.html:17` (SheetJS `xlsx-0.20.3`) e `index.html:19` (D3 `7.8.5`), ambos **sin `integrity` ni `crossorigin`**. Versiones ancladas (bien), pero sin SRI no protege ante un CDN comprometido → ejecución de JS arbitrario en una app con permiso de escritura al Sheet.
- **Fix mínimo (hashes ya computados, listos para pegar):**

```html
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
        integrity="sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT"
        crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"
        integrity="sha384-su5kReKyYlIFrI62mbQRKXHzFobMa7BHp1cK6julLPbnYcCW9NIZKJiTODjLPeDh"
        crossorigin="anonymous"></script>
```

- **Verificación requerida:** confirmar en navegador que ningún proxy corporativo despoje los headers CORS del CDN. **Fix más robusto:** auto-hospedar D3 y SheetJS vía npm (como ya se hace con `chart.js`), eliminando el CDN. No aplicado (cambio global del shell, no verificable en navegador desde aquí).

### 3. [BAJO · UX] «Escape cierra modal» inconsistente
- **Estado:** Biología Molecular, Microbiología y Visitante **sí** cierran modales con Escape; Supervisor, Larvicultura, Algas y Revisiones **no** (solo ✕ o backdrop).
- **Fix:** extraer el patrón a un helper compartido y aplicarlo a las 4 vistas que faltan. Tarea transversal, no de una tanda de vista.

### 4. [BAJO · Rendimiento] Microbiología recomputa el contexto por render
- **Evidencia:** en cada render de Bacteriología, `pathogenRecords(rows)` se calcula **~6 veces** (lo invocan `ufcByPathogen`, `nivelDistribution`, `dominantPathogen`, `congByNivel`, `aguaAnimalAlertas`), más `rowSummary`/`meltRow` por fila. El `_ctxCache` de `renderBacteriologia:144` solo se usa para los filtros, no se comparte aguas abajo.
- **Fix:** calcular `records` y `summaries` **una sola vez** y pasarlos. Corrección Controlada (verificar salida idéntica). Prioridad baja (rinde bien a volúmenes reales).

### 5. [BAJO · UX] `alert()` nativo en el export
- **Evidencia:** Algas (`index.js:1146,1148`) y Microbiología (`index.js:751,768,770`) usan `window.alert()` en rutas de error del export (SheetJS ausente / rango vacío), divergente del estilo inline/toast del resto.

---

## Fortalezas transversales (confirmadas con evidencia)

- **Disciplina de arquitectura:** `core/` puro sin DOM; cero estado global en `window` (salvo el puente `__rgLib` deliberado del *strangler* de Registros); cero `onclick` inline; cero `new Chart` suelto; cero `console.log`/`debugger` en `src`.
- **Seguridad de salida (XSS):** escape omnipresente (`esc`/`escapeHtml` — 313 usos solo en `engine.js`); D3 usa `.text()` (auto-escape). Revisado vista por vista sin hallazgos de XSS.
- **Rendimiento:** memoización por identidad de `store.globalData`, renders/refrescos parciales, dibujo aislado por gráfico (un fallo no tumba los demás), carga diferida del motor de Registros y de D3.
- **Resiliencia de datos:** capa de sync offline **idempotente** (`reqId` + cola + TTL), validación `isValidGasUrl` antes de cada POST, acceso tolerante a cabeceras (`getField`), fechas siempre por `parseAnyDate`.
- **Calidad de capas puras/testeadas:** `microbiologia/data.js` (umbrales por área, caché por huella, melt), `algas` (splitSiembras, μ específica), `larvicultura/compute+status+stages`, `registros/lib` (security/modules/inherit).

---

## Notas por vista (referencia rápida)

- **Supervisor:** orquestador con delegación de eventos y un solo listener; 8 modales con render diferido; capa `stats.js`/`moduleTrends.js` pura y memoizada. Nit inocuo: `bmTipEl` (tooltip Biomol) puede quedar huérfano en `<body>` al navegar por breadcrumb, pero es `pointer-events:none`, singleton y no afecta al auto-refresco.
- **Larvicultura:** refrescos parciales bien aislados (`refreshTank`/`refreshHistogram`/`refreshPop` con `destroyChart` selectivo); gate por módulo. Fix aplicado (ver arriba).
- **Registros:** patrón *strangler* bien ejecutado (`window.__rgLib`, 42 delegaciones); capa modular limpia y testeada; sync robusto. Reserva: auth (punto 1). Recordatorio para editar `engine.js`: espejo de constantes `engine.js` ↔ `lib/modules.js` (sin test que lo guarde).
- **Biología Molecular:** port D3; degradación elegante si no carga D3; modo AUD **fabrica datos aleatorios** (deliberado, con indicador, se apaga en cada render). SRI (punto 2).
- **Algas:** memoización, dibujo aislado, cálculo puro testeado (resiembras + μ). `alert()` en export (punto 5).
- **Microbiología:** capa `data.js` pura excepcional; filtros en cascada progresiva; placa Petri SVG determinista. Optimización (punto 4) + `alert()` (punto 5).
- **Revisiones:** treemap *squarified*, Sankey y bullet hechos a mano; drill-downs diferidos; respeta el filtro de fecha global. Sin Escape (punto 3).
- **Visitante:** panel público en lenguaje llano con lectores locales ligeros; maneja Escape con limpieza de handler huérfano. `valueHtml` crudo verificado seguro (solo constantes/números).

---

## Estado de verificación al cierre

```
npm test  → 356 passed (42 files)
npm run lint  → 0 errores
npm run build → OK
```

---

## Orden recomendado para retomar

1. **Seguridad primero:** (a) diseñar la auth en el GAS (token obligatorio), (b) SRI o auto-hospedaje de CDN.
2. **UX/consistencia:** helper de Escape transversal.
3. **Rendimiento:** una-sola-vez de `pathogenRecords` en Microbiología.
4. **Pulido:** reemplazar `alert()` por avisos inline en los exports.

_Ninguno de estos es bloqueante para comenzar el desarrollo de las vistas definitivas._
