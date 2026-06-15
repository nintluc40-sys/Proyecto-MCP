# Sistema Larvicultura · Vistas Supervisor & Larvicultura

Migración modular y refinada de las dos vistas útiles de `sistema F.html`
(monolito de ~17.800 líneas) a un proyecto **Vite + ES modules** limpio,
con separación de responsabilidades, un sistema de diseño por tokens y la
misma lógica analítica validada contra los datos reales del Google Sheet.

> La vista de calidad larvaria se denomina **Larvicultura** (antes "Check" en
> el original). El renombrado es consistente en ids, funciones, archivos y CSS.

## Puesta en marcha

```bash
npm install        # dependencias (Vite + Chart.js)
npm run dev        # servidor de desarrollo con hot-reload  → http://localhost:5173
npm run build      # build de producción optimizado en /dist
npm run preview    # sirve el build de /dist
```

> SheetJS (XLSX) se carga por CDN desde `index.html` (la versión de npm está
> deprecada). Chart.js sí es dependencia de npm.

## Arquitectura

```
src/
  config.js                Constantes: URL del Sheet, timeouts, umbrales, orden de estadios
  main.js                  Entry: registra vistas, monta el shell, conecta y arranca refresco
  styles/
    tokens.css             Tokens de diseño (color, espaciado, radios, sombras) + tema oscuro
    base.css               Reset + primitivas (card, chip, pill-btn, empty-state)
    app.css                Shell: cabecera, pestañas, pill de conexión, loader, toast
  core/                    ── Capa de datos (sin DOM, reutilizable y testeable) ──
    store.js               Estado central + bus de eventos (sustituye a las globales)
    dates.js               parseAnyDate (serial Excel, dd/mm/yyyy, ISO) + formato es-EC
    fields.js              Acceso tolerante a cabeceras, estadio, mortalidad derivada
    format.js              Formato numérico + semáforos (Supervisor y Check)
    sheets.js              Motor Google Sheets: XLSX-first + fallback CSV + clasificación
    refresh.js             Auto-refresco silencioso con fingerprint e inactividad
    charts.js              Registro central de Chart.js + destrucción gestionada
  ui/
    router.js              Registro y conmutación de vistas
    shell.js               Cabecera, pestañas, filtro de fecha global, toast, loader
  views/
    supervisor/            ── Vista Supervisor (👁️) ──
      index.js             Orquestador + navegación por delegación de eventos
      stats.js             Contexto de datos + estadísticas (supervivencia por población)
      executive.js         Vista Ejecutiva (tarjetas por módulo)
      module.js            Resumen Operativo del módulo
      tank.js              Visualización del Tanque (OD/Temp/Población)
      larvia.js            Análisis Biométrico LARVIA (bitácora + enlace app.larvia.ai)
      ui.js / supervisor.css
    larvicultura/          ── Vista Larvicultura (🦐 Calidad Larvaria) ──
      index.js             Orquestador (radar, evolución, heatmap, registros, ranking, modales)
      stages.js            Variables por etapa (Larv / Post-L), pesos, tips y combos
      compute.js           Series diarias, último estado, ICL, ranking
      charts.js            Radar + evolución diaria
      modals.js            Modales Comparar / Historia / Decisión
      larvicultura.css
```

### Flujo de datos (Google Sheets)

1. `connectSheets()` descarga el libro **completo** vía `export?format=xlsx`
   (1 petición, todas las hojas). Si falla, cae a **CSV por `gid`** con
   descubrimiento por scraping del HTML publicado.
2. Cada fila se etiqueta con `_SheetOrigin` (Larvicultura, Control_Tanque,
   Maduracion, Lab_Algas, Morfologia) y se sella el `Módulo` desde el nombre
   de pestaña (`Datos Larvicultura - M01` → `M01`).
3. Se aplanan a `store.globalData` y se emite `EV.DATA`; las vistas se
   re-renderizan reactivamente.
4. `startAutoRefresh()` repite cada 60 s, comparando un *fingerprint* para no
   re-renderizar si no hubo cambios, y se pausa mientras el usuario interactúa.

## Decisiones y correcciones respecto al original

- **Refactor de globals → store + eventos.** Las decenas de variables globales
  y funciones colgadas de `window` se sustituyen por un `store` central y un
  bus de eventos. La navegación interna usa **delegación de eventos** en lugar
  de `onclick="window.fn(...)"` embebido en strings.
- **Corrección (error heredado):** la Vista Supervisor del original incluía
  cualquier fila no-tanque con Corrida+Módulo, lo que **contaminaba** el listado
  con filas de `Registro_Supervisión` (módulos fantasma "Módulo 3/4/8"). Ahora
  se filtra estrictamente por `_SheetOrigin === 'Larvicultura'`.
- **Corrección (claves de columnas):** las variables Post-L de la vista
  Larvicultura apuntaban a `Opacidad`/`Flacidez`, pero las columnas reales son
  `% Opacidad` y `Flácidez` (con tilde). Corregido para que Post-L cargue datos.
- **Nota de etiquetas:** en el original, el rol-clave `supervisor` se rotulaba
  "Vista Técnica" y `visitante` se rotulaba "Supervisor". Aquí la vista migrada
  corresponde al contenido de `visitante` (la vista de supervisión de solo
  lectura) y se denomina simplemente **Supervisor**.

## Pendiente / siguientes pasos (no incluido en esta migración)

- Sub-vistas extra del Supervisor no solicitadas: Proyecciones, Despacho,
  Inventario, Comparador.
- Gating por PIN/rol, exportación a PDF/QR, modo histórico y carga de Excel
  local (eran del shell global, no de estas dos vistas).

## Implementado

- **Vista Supervisor:** ejecutiva → resumen módulo → tanque → análisis Larvia.
  - Resumen Operativo incluye **Técnico** (columna del Sheet) y botón
    **Registro de despacho**.
  - **Despacho:** historial por tanque (Fecha, Tanque, Densidad Cosechada,
    Biomasa, Plg manual, Cajas/Tinas, Destino, Cantidad Cosechada = última
    población registrada, Piscina) + gráficos de Cantidad Cosechada y Biomasa
    por tanque/destino.
  - **Análisis LARVIA:** gráficos de PL/g, peso, longitud, uniformidad de
    peso/longitud, CV de peso/longitud y pigmentación; bitácora **desplegable**
    (muestra el último registro y "Ver historial completo (N)").
- **Vista Larvicultura:** radar, evolución diaria, heatmap, registros, ICL,
  ranking en línea y modales **Comparar / Historia / Decisión**.
```
