# Spec — Ficha Larvicultura estándar (reconstrucción nativa)

> Mapa de la ficha estándar extraído del monolito `public/registros/engine.js`, para
> reconstruirla como módulos nativos integrados al sistema (store/eventos, tokens,
> sin `onclick` inline), **reutilizando** la capa de datos/sync validada del motor.
> Decisión (2026-06-12): empezar por esta ficha; reutilizar la capa de datos.

## Flujo del monolito (cómo funciona hoy)

```
login (rejilla de módulos)  →  pickMod(m)  →  chkPin()  →  enter() valida PIN
   → abre #rgApp.on, curTab="calidad", buildTabs() + renderAll()
```

Un **módulo estándar** (M01–M10 + CIO) agrupa **7 sub-fichas** (pestañas):

| ficha (id) | Contenido |
|---|---|
| `calidad` | Registro Sanidad y Calidad de Larvas (la principal — ver abajo) |
| `plg` | PL/gramo (externo + manual) + lote por tanque |
| `params` | Parámetros físico-químicos |
| `poblacion` | Población / mortalidad diaria |
| `calagua` | Calidad de agua |
| `despacho` | Despacho/cosecha |
| `desinfeccion` | Desinfección |

Constantes: `MODS=10`, `TQS=12` (tanques 13–20 retirados). Listas en engine: `FICHAS`,
`STD_FICHAS_ALL`, `ESTADIO_FICHAS`, `LOTE_FICHAS`.

## Capa de datos (la REUTILIZAMOS, no se reescribe)

Funciones globales del motor (engine.js es script clásico → quedan en `window.*`):

| Global | Firma | Qué hace |
|---|---|---|
| `skey(m,f)` | → string | clave: `larv4_rec_<MOD>_<ficha>_<YYYY-MM-DD>` (p.ej. `larv4_rec_M01_calidad_2026-06-12`) |
| `loadE(m,f)` | → `{mod,ficha,date,savedAt,updatedAt,synced,data}` \| null | lee (con caché + validación + freeze) |
| `saveE(m,f,data,synced)` | → bool | escribe con persistencia VERIFICADA (lectura-tras-escritura) |
| `getStatus(m,f)` | → `'empty'\|'pending'\|'synced'` | estado de la ficha |

Acceso desde los módulos nativos: **`src/views/registros/lib/fichas-data.js`** (adaptador
testeado que envuelve esos globales). Los módulos nativos NUNCA tocan `localStorage` ni el GAS
directamente — pasan por el adaptador. Cuando esa capa se extraiga a módulos propios, solo cambia
el interior del adaptador.

> **Sync a GAS:** pendiente de mapear el flujo del botón Guardar (saveArea/localSave/localSync) en
> una próxima rebanada; se añadirá al adaptador como passthrough cuando se construya el botón nativo.

## Sub-ficha "Calidad" — modelo de campos

Render del monolito: `renderCalidad()` (engine.js). Estructura del objeto `data`:

- **Cabecera:** `corrida` (texto), `fecha` (date, default hoy), `hora` (time, default ahora).
- **Por tanque** `i` (1..12): `e_<i>` (estadio, texto mayúsculas "N5…M3") + 16 campos numéricos
  `<code>_<i>` (% 0–100, step 0.1):

  | Banda | Subgrupo | Códigos |
  |---|---|---|
  | Sanidad N5–M3 | Intestino | `ll` %Llenas · `sl` %Semillenas · `va` %Vacías |
  | Sanidad N5–M3 | Morfología General | `df` %Deformidad · `rt` %Retraso · `mo` %Mortalidad* |
  | Sanidad N5–M3 | Otros | `hg` %Hongos · `nv` %NoViab · `op` %Opac |
  | Post-larva | Hepatopáncreas | `lp` %Lípidos |
  | Post-larva | Morfología PL | `fl` %Flacidez · `nc` %Necrosis · `cb` %Canibalismo · `pr` %Parásitos |
  | Calidad | — | `cos` %Actividad · `es` %Estrés |

  \* `mo` (%Mortalidad) promedia hacia el %Mort. Diaria de la ficha Población (`rcPob()`).

- **Pie:** `tec` (técnico responsable).

Este modelo está codificado como datos puros en
**`src/views/registros/lib/ficha-calidad.schema.js`** (con tests), y será el motor del render
nativo (cabecera + tabla 12 tanques × columnas + pie).

### Comportamientos a preservar (del monolito)

- **Herencia de valores** entre fichas del mismo módulo/día: `_inheritShared` (corrida, técnico) y
  `_inheritPerTank` (estadio, lote). Pre-rellena campos vacíos desde otras fichas ya capturadas.
- **Nombres de tanque** personalizables: `loadTqNames(m)` / `tqCell`.
- **Pill de estado** por ficha (`sspill`/`getStatus`).
- Default de corrida desde `getCorr(m)`, técnico desde `gcfg("tec")`.

## Plan de reconstrucción (rebanadas, poco a poco)

1. ✅ Adaptador de datos (`fichas-data.js`) + esquema Calidad (`ficha-calidad.schema.js`) + tests. **(hecho)**
2. **Render nativo de la tabla Calidad** desde el esquema (HTML por tokens, sin `onclick` inline;
   delegación de eventos). Solo lectura/edición en memoria.
3. Recolección de datos del DOM → objeto `data` + **Guardar** vía `saveFicha()` (reutiliza `saveE`).
4. Estado/pill + herencia (`_inherit*`) + nombres de tanque.
5. Mapear y reutilizar el **sync a GAS** (passthrough en el adaptador) + botón.
6. Integrar como pestaña real de la vista Registros detrás de un flag, comparar contra el motor,
   y al verificar en navegador, **retirar** `renderCalidad` del engine.
7. Repetir el patrón para `plg`, `params`, `poblacion`, `calagua`, `despacho`, `desinfeccion`.

## Verificación

Lo testeable por mí (adaptador, esquema, render puro) va con Vitest. El **guardado/sync reales y el
arranque** requieren **verificación en navegador del usuario** (escribe a GAS de producción): tras
cada rebanada, abrir Registros, capturar una ficha de prueba y confirmar guardado + sync.
