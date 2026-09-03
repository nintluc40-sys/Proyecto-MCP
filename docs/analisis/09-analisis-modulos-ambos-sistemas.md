<!-- AVISO-VIGENCIA -->
> # 📄 DOCUMENTO HISTÓRICO · 2026-08-03 — no es el estado actual
>
> Se conserva por TRAZABILIDAD: explica por qué el sistema es como es hoy.
> **No usarlo como estado actual.** El estado vivo está en la memoria del proyecto
> (`project_punto-guardado-*`) y, ante cualquier discrepancia, **manda el CÓDIGO**.
>
> ✅ **CONTUVO un segundo «PUNTO DE GUARDADO» (2026-08-03), RETIRADO el 2026-09-03.**
>   Durante semanas la memoria afirmó tener el «único» punto de guardado mientras éste vivía
>   aquí dentro, versionado, y sus pendientes no los miró nadie. Triado el 2026-09-02 y
>   retirado el 09-03, dejando al final constancia de dónde fue cada una de sus 4 entradas.
>   **El estado del proyecto vive ahora en UN solo sitio: la memoria.**
> ⚠ Su comparación engine.js ↔ Music es de agosto. Hoy las tres copias se vigilan solas
>   con `verificar-3copias-v3.mjs`, que es la fuente buena.
>
> *(Aviso puesto el 2026-09-02. **Deliberadamente sin cifras**: el aviso de*
> *`04-refactor-plan.md` escribió las suyas y ha caducado TRES veces. Se nombra la*
> *clase de dato caducado y el comando que da el del día.)*

# 09 · Análisis de módulos — Sistema de Registro (Larvicultura) · AMBOS sistemas

> **Fecha:** 2026-08-03 · Alcance: los dos ejecutables gemelos de la vista Registro.
> **Estado:** primer pase (arquitectura + todos los módulos a nivel funcional/estructural/sync
> + paridad entre sistemas). Marcados con 🔎 los puntos que merecen un pase más profundo.
> Su punto de guardado se retiró el 2026-09-03; al final queda la constancia de adónde fue
> cada pendiente.

## 0. Los dos sistemas y su relación

| | `engine.js` (Proyecto Beta 17) | `index (8).html` (Music) |
|---|---|---|
| Ruta | `…\Proyecto Beta 17\public\registros\engine.js` (+ `dist/` copia) | `…\Music\index (8).html` |
| Naturaleza | Lógica de la vista **Registros** dentro del **dashboard modular Vite**; monolito heredado que delega helpers puros en `window.__rgLib` (módulos ES de `src/views/registros/`) | **Monolito standalone** autocontenido, 100% offline (CSS + marcado + librería QR + toda la lógica inline) |
| Contenedor DOM | `#rgApp` / `#rgLogin` (montado por el host) | `#app` / `#login` (página completa) |
| Origen común | Ambos descienden del monolito `sistema F.html` |

**Conclusión de la reconciliación (T1+T2+T3, ver [reconciliación en memoria]):** el HTML de Music
es hoy el **superconjunto de features**; el engine solo aventaja en (1) refactor arquitectónico
(`__rgLib`) y (2) adaptaciones al host del dashboard (`#rgApp`, guard de host-detach). **El código
de negocio de los módulos es esencialmente el mismo en ambos** (mismos formatos, mismas hojas,
mismo contrato de sync). Las diferencias vivas se detallan en §4.

---

## 1. Arquitectura de sincronización (común a TODOS los módulos)

Flujo de datos único para todo el sistema:

```
UI (ficha/grid) → collect() → localStorage "larv4_*" → cola "larv4_syncqueue"
   → POST al GAS Web App (DEFAULT_GAS_URL) → Google Sheets (una hoja por formato)
```

- **Contrato externo GAS:** `DEFAULT_GAS_URL` (despliegue estable anclado en código) + `EV_TOKEN`.
  Sobrescribible en ⚙ Config. `doPost` recibe `{action, …}`; `doGet` sirve portales (`?p=ev/pdf/…`).
  **No renombrar** claves `larv4_` ni endpoints (contrato externo, ver CLAUDE.md §Datos).
- **Cola de sync** (`larv4_syncqueue`): reintentos y vaciado diferido (`flushSyncQueue`); permite
  trabajar offline y sincronizar después.
- **Taxonomía de claves `localStorage`:**
  | Tipo | Claves | Sincroniza a Sheets |
  |---|---|---|
  | Datos + estado por ficha/módulo | `larv4_` + sufijo | **Sí** (vía payload) |
  | Cola de sync | `larv4_syncqueue` | mecanismo |
  | Recuperación (autoguardado, TTL 1 h) | `larv4_rec_*` | No (respaldo local) |
  | Fotos (TTL 24 h, máx 8) | `larv4_foto_*` | Suben a Drive por QR, no a la hoja |
  | Historial Algas (cola 10) / Bitácora (72 h) | `larv4_alghist_*`, `larv4_alglog` | Sí / retención local |
  | Muestras Biomol (TTL 48 h) | `larv4_biomol_records` | Sí |
  | **Memoria local-only (NO sincroniza)** | `larv4_cs_*` (Cant. Sembrada), `larv4_ton_*` (Toneladas), `larv4_lotemem` (lotes congelados 25 d), `larv4_corrmem` (corrida congelada), `larv4_mic_factors` (factores editables), `larv4_note` (notas) | **No** (solo cálculo/UX local) |

**Payload builders (uno por formato):** `buildDatosPayload` (fichas estándar), `buildControlPayload`
(control por tanque), `buildDesinfeccionPayload`, `buildAlgasPayload`, `buildMadPayload`,
`buildAstPayload`, `buildMareaPayload`, `buildBioPayload`, `buildMicPayload`, `buildCalPayload`,
`buildPatPayload`.

---

## 2. Índice de módulos

| Idx | Módulo | PIN | Pestañas | Hoja(s) de Sheets |
|---|---|---|---|---|
| 0 | **CIO** | 2025 | (estándar) | Datos Larvicultura · Control_Tanque · Registro_Desinfección |
| 1–10 | **M01–M10** (Larvicultura estándar) | 1111…1010 | `calidad, plg, params, poblacion, calagua, despacho, desinfeccion, fotos, historial, blanco` | ídem CIO |
| 11 | **Lab. Algas** | 2026 | `algas, bitacora, fotos` | Lab_Algas |
| 12 | **Maduración** | 2027 | `salas, tanques, lotes, reproductivo, fotos` | Maduración Sala · Maduración Tanques · Maduración Lotes |
| 13 | **As. Técnico** | 2020 | `ast, marea, fotos` | Registro_Supervisión · Marea |
| 14 | **Microbiología** | 2121 | `micnuevo, michist, micfact, micrep, fotos` | Microbiología · Calidad de Agua · Patología en Fresco |
| 15 | **Biomol** | 2023 | `biomol, fotos` | BIOMOL |
| — | **Evidencias / PDFs** (transversal) | — | dentro de `fotos` | Evidencias · PDFs_Dia |

---

## 3. Análisis por módulo

### 3.1 CIO + M01–M10 · Larvicultura estándar
- **Funcionamiento:** captura diaria por **tanque** (TQS=12) de las 6 fichas de "Datos Larvicultura"
  (Calidad larvaria, PLG, Parámetros, Población, Calidad de Agua, Despacho) + Desinfección (hoja
  propia). Autocálculos: `rcPob` (población/%superv. desde CS), `rcDesp*` (biomasa/densidad/superv.
  de despacho). "Congelado" de corrida/lotes 25 días (prellenado). `Historial` (lo sincronizado) y
  `Blanco` (editar un registro histórico sin tocar el día).
- **Estructura:** `renderPoblacion/Calidad/Plg/Params/CalidadAgua/Desinfeccion/Despacho`
  (en el engine delegan a `fichas/*.render.js` vía `__rgLib`; en el HTML son inline).
  `buildGrid` pinta la grilla de módulos. `saveArea` = zona de guardado por ficha.
- **Sincronización:** `buildDatosPayload` → *Datos Larvicultura -*; `buildControlPayload` →
  *Control_Tanque*; `buildDesinfeccionPayload` → *Registro_Desinfección*. Estado por
  `larv4_<mod>_<ficha>`; CS y Toneladas **solo locales**.
- **Paridad entre sistemas:** cálculo `rc*` **idéntico**; helpers de seguridad **idénticos**;
  render de ficha = mismo comportamiento (engine modularizado, HTML inline). Diferencia viva:
  `saveArea` usa **Compartir-QR** en el HTML (decisión del usuario) vs Compartir-PDF en el engine.
  Freeze-panel (T1a) ya presente en ambos.

### 3.2 Lab. Algas (11)
- **Funcionamiento:** registro del laboratorio de algas; cola de hasta 10 registros
  (`larv4_alghist_`) antes de sincronizar + **bitácora** local 72 h (`larv4_alglog`) para
  edición/consulta rápida de lo ya enviado.
- **Estructura:** pestañas `algas · bitacora · fotos`. Área de captura + historial/bitácora.
- **Sincronización:** `buildAlgasPayload` → hoja **Lab_Algas**. Retención local diferenciada
  (cola vs bitácora). 🔎 *Pendiente pase profundo del render y validaciones internas.*
- **Paridad:** en sync (constantes ALGHIST/ALGLOG idénticas). 🔎

### 3.3 Maduración (12)
- **Funcionamiento:** tres formatos — **Salas**, **Tanques**, **Lotes** — + **Reproductivo**
  (trazabilidad individual de reproductores). Memoria local `larv4_mad_`.
- **Estructura:** pestañas `salas · tanques · lotes · reproductivo · fotos`. Reproductivo en el
  HTML es una **matriz de desoves con trazabilidad por chip Trovan** (subsistema `_repro*`
  ampliado, ~34 funciones); en el engine está parcialmente extraído a `lib/reproductivo.data.js`.
- **Sincronización:** `buildMadPayload` → hojas *Maduración Sala / Tanques / Lotes*. Reproductivo
  lee/escribe su MATRIZ (rechaza lote sin Sala/Tanque → `rep.sinUbicacion`).
- **Paridad:** ⚠ **el HTML es la rama más avanzada** en Reproductivo (matriz completa); el engine
  delega a un módulo nativo más pequeño. Salas/Tanques/Lotes en sync. 🔎 *Detalle de la matriz
  pendiente de pase profundo.*

### 3.4 As. Técnico (13)
- **Funcionamiento:** registro de supervisión técnica + registro de **Marea** (con perfiles
  horarios; `normHr` acepta horas compactas).
- **Estructura:** pestañas `ast · marea · fotos`.
- **Sincronización:** `buildAstPayload` → *Registro_Supervisión*; `buildMareaPayload` → *Marea*.
  🔎 *Pendiente pase profundo.*
- **Paridad:** en sync. 🔎

### 3.5 Microbiología (14) — Bacteriología / Calidad de Agua / Patología
- **Funcionamiento:** tres **sub-módulos** conmutados en la misma vista: `micnuevo`
  (Bacteriología), `calnuevo` (Calidad de Agua), `patnuevo` (Patología en Fresco). Cada análisis
  es una **sesión** (varias muestras). Conteos crudos × **factor** (editable en la pestaña
  Factores `micfact`) → UFC clasificado por umbrales (Leve/Moderado/Elevado). Historial `michist`,
  reportes `micrep`.
- **Estructura:**
  - **Bacteriología** (`MIC_FORMATS`, 21 formatos por depto Larvicultura/Maduración/Algas/Otras):
    cada formato = `ctx[]` (columnas identificadoras) + `params[]` (mediciones). Factores en
    `MIC_DR_BASE` por área (rkey). Áreas de factores compartidas entre formatos afines.
  - **Calidad de Agua** (`CAL_FORMATS`, 6 formatos): química de agua; `CAL_PARAMS` + orden fijo de
    hoja `CAL_PARAM_ORDER`; rangos `CAL_RANGE_BASE`.
  - **Patología** (`patnuevo`): fresco por grupos `PAT_GROUP_KEYS`.
- **Sincronización:** `buildMicPayload` → *Microbiología*; `buildCalPayload` → *Calidad de Agua*;
  `buildPatPayload` → *Patología en Fresco*. Retención local 7 d desde **`syncedAt`** (fix del
  HTML; prunes `pruneMic/Cal/Pat`). Borrado de sesión con gate `_micDelAuth` (HTML). Factores
  local-only (`larv4_mic_factors`).
- **Paridad:** en sync + el HTML añade el gate de borrado y el fix `syncedAt`. **Cambios recientes
  aplicados a AMBOS (2026-08-03):** algas-mensual +Pseudomonas/Aeromonas/Hongos con área de
  factores dedicada; Calidad·mad-agua +Sala/Tanque +17 columnas de química; Bacteriología·mad-agua
  Tanque→escritura (ver [memoria microbiología]).

### 3.6 Biomol (15)
- **Funcionamiento:** grilla del día de muestras Biomol (Estadío/Sexo/Resultado Positivo-Negativo);
  cada fila expira a 48 h (`pruneBio`). Autoguardado de lo no guardado (`larv4_rec_biomolgrid`).
- **Estructura:** pestañas `biomol · fotos`. `BIO_ESTADIO_OPTS`, `BIO_SEX_OPTS`, `BIO_RES_OPTS`.
- **Sincronización:** `buildBioPayload` → hoja **BIOMOL**. Muestras en `larv4_biomol_records`.
- **Paridad:** en sync. 🔎 *Pendiente pase profundo (⚠ nota histórica en memoria: fuga de Escape en
  `fsCard` colgante — verificar en ambos).*

### 3.7 Transversal · Fotos / Evidencias / PDFs
- **Funcionamiento:** pestaña `fotos` en todos los módulos. Subida de fotos a **Drive por QR**
  (portal `?p=ev`), galería, carpeta Drive. El HTML añade **Compartir ficha por QR**
  (`shareFichaQR`, página viva temporal). El engine tiene además Compartir-PDF a Drive
  (`shareFichaPDF` + portal `?p=pdf`) — **NO portado al HTML por decisión del usuario**.
- **Sincronización:** hojas *Evidencias* / *PDFs_Dia* (solo el engine usa PDFs_Dia). Fotos locales
  TTL 24 h; no van a la hoja.

---

## 4. Paridad de código entre sistemas (resumen accionable)

- **Idéntico (negocio):** helpers de seguridad (escapeHtml/isValidDate/isValidGasUrl/sanitizeStr/
  sanitizeNum/pad/mLabel/is*Mod), cálculo de fichas (`rc*`), formatos de Microbiología, hojas y
  contrato de sync.
- **Solo en el HTML (features que el engine no tiene):** matriz Reproductores/Trovan, Notas,
  Compartir-QR, gate de borrado `_micDelAuth`, fix de retención `syncedAt`, `despDestWidget`,
  biomasa **manual** del Blanco (decisión de diseño).
- **Solo en el engine (NO portar al HTML):** delegación a `__rgLib`/módulos ES (refactor), IDs de
  entorno `#rgApp`/`#rgLogin`, guard de host-detach en `buildGrid`, Compartir-PDF (`shareFichaPDF`,
  `evPdfUrl`) — descartado por el usuario.
- **Ya reconciliado esta sesión:** T1a (panel de datos congelados) portado al HTML.


---

## 🗄 Aquí había un segundo «PUNTO DE GUARDADO» (2026-08-03) — RETIRADO el 2026-09-03

Durante semanas la memoria del proyecto afirmó tener el «único» punto de guardado mientras
éste vivía aquí dentro, versionado y sin que nadie lo mirara. Se triaron sus cuatro
pendientes el 2026-09-02 y se retira el bloque el 09-03, con constancia de dónde fue cada
uno para que no haga falta recuperarlo:

- **Pase profundo por módulo** (Lab. Algas, As. Técnico, Biomol, matriz Reproductores) →
  duplicaba, con menos alcance, la **auditoría por vista** del punto de guardado vigente,
  que cubre las **9** vistas con su cobertura medida. Sigue abierta allí.
- **Comparación línea a línea de la maquetación de las 7 fichas** → sigue ABIERTA, y hoy es
  un pendiente numerado del punto de guardado vigente. El cálculo ya se verificó idéntico
  en agosto; falta sólo el marcado.
- **Fuga de Escape en Biomol (`fsCard` colgante)** → **muerta**: medido el 2026-09-02,
  `fsCard` ya no existe en ninguno de los tres destinos.
- **Revisión visual del usuario** → hecha entonces para T1a y Microbiología, y la de los
  formatos T1/T2/T3 la dio por buena el usuario el 2026-09-02.

⚠ **La lección, que es la que justifica retirarlo:** un punto de guardado escondido dentro
de un documento de análisis no lo lee nadie, y compite con el que sí se mantiene. El estado
del proyecto vive en UN solo sitio — la memoria — y este documento se queda con lo que sabe
hacer bien: el análisis por módulo.
