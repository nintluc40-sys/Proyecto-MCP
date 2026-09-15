# Sistema MCP · Dashboards de Larvicultura, Maduración y Algas

Aplicación **Vite + ES modules** que centraliza la operación de un laboratorio de
larvicultura de camarón en varias vistas/dashboards conectados **en vivo** al
Google Sheet de producción. Es la migración modular y refinada del monolito
`sistema F.html` (~17.800 líneas) a una arquitectura limpia con capa de datos
pura y testeada, sistema de diseño por tokens (tema claro/oscuro) y Chart.js
gestionado centralmente.

## Puesta en marcha

```bash
npm install        # dependencias (Vite + Chart.js)
npm run dev        # servidor de desarrollo con hot-reload  → http://localhost:5173
npm run build      # build de producción optimizado en /dist
npm run preview    # sirve el build de /dist
npm test           # Vitest (tests de la capa de datos)
npm run lint       # ESLint
```

> SheetJS (XLSX) y D3 se cargan por CDN desde `index.html` (las versiones de npm
> están deprecadas/desactualizadas). Chart.js sí es dependencia de npm.

## Vistas

- **Supervisor** (👁️): Vista Ejecutiva (tarjetas por módulo/corrida) → Resumen
  Operativo del módulo → Visualización del Tanque → Análisis Biométrico LARVIA.
  Incluye navegación táctil (botón "Volver" + migas), tabla "Producción Omarsa"
  (con columna **Dens. siembra** = promedio por tanque de siembra ÷ 28 ÷ 1000),
  estado de despacho ("Despachado"/"Despachando" excluyendo tanques agrupados/
  descartados) y modales: Comparativa de tanques, OM vs Tex, Desinfección,
  Biomol, **Microbiología** (Placa de agar + Tabla + Heatmap por corrida+módulo)
  y **Trazabilidad** (desde la tarjeta "Días proceso": descarga en PDF las
  fichas del módulo —Calidad Larvaria, PLG, Población, Parámetros, Calidad de
  Agua, Despacho y Desinfección— con la información del Google Sheet, un PDF por
  tipo; el rango Desde/Hasta se prellena con el primer y último registro).
- **Larvicultura** (🦐): calidad larvaria — radar, evolución diaria, heatmap,
  ICL, ranking, población por tanque y modales Comparar/Historia/Decisión.
- **Revisiones** (🔍): hoja `Registro_Supervisión` — calidad, morfología
  cuantitativa (% Atraso / Protusión / Deformidad / No viables), treemap,
  Sankey hallazgo→acción, cobertura por supervisor y mapa de cobertura
  módulo×día (cada día clicable abre los registros).
- **Algas** (🌿): `Lab_Algas` por sistema (Masivos/Premasivos/PBR/Fundas/Carboys),
  con filtro de módulo, curva de crecimiento conmutable
  (Líneas/Normalizado/Mini-curvas/Heatmap), parámetros fisicoquímicos, sanidad,
  Índices del mes y export Excel por rango de fechas.
- **Visitante** (🚪): resumen mensual en lenguaje llano (supervivencia, sanidad,
  microalgas) mediante tarjetas que abren ventanas de detalle.
- **Biología Molecular** (🧬): heatmap/calendario/treemap/swarm/sankey/E.D.T.,
  reporte comparativo y export Excel por rango de fechas.
- **Microbiología** (🧫): Bacteriología con **filtros dinámicos por formato**
  (Larvicultura/Maduración/Otros), Conglomerado (niveles por patógeno, Agua vs
  Animal, carga total por patógeno, distribución por nivel), Placa de agar,
  Matriz patógeno×ubicación, tendencias y export Excel. Restyle tipo SCADA.
  Incluye el panorama **General** (tablero-scorecard por área) y **Calidad de
  Agua** (analizador multiparamétrico con WQI, doble lente Por parámetro/Por
  ubicación). Sub-vista **Patología en fresco** pendiente (a la espera de su
  hoja en el Google Sheet).
- **Maduración · "Microchips"** (🥚): seguimiento reproductivo por Trovan ID sobre
  las hojas `Maduración MATRIZ`/`Bitácora`/`Transferencias`.
  ⚠ **Es el REPRODUCTIVO. Hay otra «Maduración» distinta** —el registro OPERATIVO, por
  conteos— que no es una vista sino un grupo de fichas de captura: ver más abajo.
  Tres sub-vistas —
  **Panorama** (KPIs, distribución de estados activa/inactiva/transferida/fallecida,
  tendencias de desoves/mortalidad/fertilidad, top salas y tanques), **Salas y
  Tanques** (producción, fertilidad y eficiencia por ubicación + mortalidad) y
  **Hembras** (ranking por desoves, buscador de Trovan, hembras que nunca han
  desovado, distribución del intervalo de recuperación e historial completo por
  individuo). Filtros de período (mes o todo) + Sala + Tanque.
  ♻ **Microchips reciclados (2026-09-14):** el chip de una hembra **muerta** se puede dar de
  alta en otra, así que un Trovan ID es de un chip y la MATRIZ puede tener varias hembras
  suyas. La regla vive en `src/core/trovan.js`: una hembra sucede a otra si la anterior murió
  y la nueva ingresó **después**; cada evento es de la que había ingresado en su fecha. La que
  lleva hoy el chip se llama como él y las anteriores, `chip·fecha de ingreso`.
- **Registros**: fichas de captura (estrangulamiento gradual del monolito
  `public/registros/engine.js`) que escriben al Sheet vía Google Apps Script.
  Incluye el **registro operativo de Maduración**, que tiene su propia sección aquí abajo
  por ser lo único del sistema que además CALCULA.

### Maduración · el registro OPERATIVO

> ⚠⚠ **No confundirlo con «Microchips».** Conviven dos «Maduración» y registran cosas
> distintas: aquélla sigue **individuos** con microchip Trovan y es una vista de lectura;
> ésta cuenta **animales** por sala/tanque/lote y es captura. No comparten hojas ni código.

Seis fichas de captura más una vista derivada (Saldo), todas dentro del módulo Maduración
de Registros. **Su interfaz vive ÚNICAMENTE en `public/registros/engine.js`** (y en su gemelo
autónomo `Music\index (8).html`), porque ese monolito no tiene módulos ES.
⚠ Ojo al buscarlo: **`src/views/maduracion/` NO es esto** —es la vista del reproductivo por
Trovan— y no hay ninguna carpeta nativa para el operativo. Lo que sí tiene gemelo probado en
`src/views/registros/lib/` es el CÁLCULO: los esquemas de cada ficha y el libro mayor, con
una prueba de paridad que exige que las dos implementaciones coincidan y que ningún export
del módulo se quede sin contraparte en el monolito.

| Ficha | Hoja | Grano |
|---|---|---|
| 📥 **Ingreso** | `Maduración Ingreso` | (lote, composición, sala, tanque) |
| ⚖️ **Saldo** | *(derivada)* | vista del libro mayor, no escribe |
| 🔄 **Movimientos** | `Maduración Movimientos` | el **tramo** origen → destino |
| 🥚 **Desoves** | `Maduración Lotes` | (fecha, lote, código genético) |
| 🏁 **Fin de Ciclo** | `Maduración Fin de Ciclo` | (fecha, lote, motivo, sala si es Parcial) · Registro y sus pesos |
| 🏠 **Salas** · 🛢️ **Tanques** | `Maduración Sala` · `Maduración Tanques` | la grilla diaria |

**El libro mayor** (`src/views/registros/lib/mad-libro.js` + su gemelo inline) responde
*«¿cuántos animales hay vivos ahora en cada tanque y en cada lote?»*. Nadie teclea un saldo:
se DEDUCE de `+ ingreso − bajas ± movimientos − fin de ciclo`. El objetivo no es que la
cifra cuadre siempre, sino que **cuando no cuadre se vea el mismo día**. Con la opción
`hasta`, el libro se construye **al cierre de un día**: es lo que usa «🔄 Proponer estado» de
Salas, que propone —y al guardar escribe— el estado de la fecha elegida en la ficha.

🔑 Dos reglas que explican casi todo el diseño y no se deducen del código:

- **Es cronológico, no una suma.** En un tanque mezclado la mortalidad se reparte entre sus
  lotes en proporción a los vivos **de ese día**, así que el peso de hoy depende del
  resultado de ayer. Aplanar por tipo da números plausibles y equivocados.
- **Movimientos y Desoves no dicen de qué lote salió cada animal, y es deliberado.** En un
  tanque mezclado nadie lo sabe, y las copuladas de un desove se juntan en un pool de varios
  tanques. Lo deduce el libro; inventarlo sería registrar lo que no se midió.
- **La cuarentena es de cada SALA (2026-09-14).** Un lote puede estar en varias salas —en
  tanques distintos, salvo mezcla o agrupación— y una sala tener varios lotes. Cada (lote, sala)
  lleva su reloj: el ingreso lo reinicia en su sala, la cópula lo rompe en su sala y el cierre es
  del lote entero. Lo que se mueve a otra sala lleva su reloj; si el lote ya estaba allí, manda la
  cuarentena que termina más tarde. El Saldo da `Mixto` a un lote cuyas salas no coinciden y dice
  el estado de cada una. **Dos lotes en un mismo tanque sólo por mezcla o agrupación (D13):** con
  el libro leído, Ingreso marca en ámbar los tanques con otro lote vivo y Revisar/Guardar lo avisan,
  igual que Movimientos con un tramo de tipo Transferencia hacia un tanque con otro lote (aviso, no error;
  al corregir una Transferencia ya guardada no cuenta la fila que el envío reemplaza).
  **Un cierre Parcial puede indicar la sala (D14)** y descuenta sólo de ella; un Total es siempre
  del lote entero. Los **pesos** (promedio y total de machos y hembras) son del registro entero —se
  pesan juntos todos los lotes— y se escriben iguales en cada fila con el mismo **«Registro»** (un
  identificador por formulario): para no multiplicarlos, se leen una vez por Registro.

⚠ **Las llaves del GAS mandan sobre el diseño de estas hojas.** `Maduración Sala`,
`Tanques` y `Lotes` se identifican por POSICIÓN (`[0,1]`, `[0,1,3]` y `[0,1,2]`), así que
mover una columna de las primeras destruye datos en cada sincronización; `Ingreso`,
`Movimientos` y `Fin de Ciclo` van por la columna `ID`, que el GAS localiza por su cabecera.
Por eso `Maduración Tanques` conserva tres columnas **vacías a propósito** (`Lote` y las dos
`Población inicial`): sólo se pueden limpiar en el mismo despliegue en que cambie
`madKeyCols`.

🛡 **Y como se escriben por posición, el GAS comprueba el esquema antes de escribir.** En las
seis hojas del registro operativo, si una cabecera del envío no coincide con la de la hoja en
su misma posición, `doPost` responde «Esquema desactualizado» y **no toca nada**. Existe porque
estas hojas cambiaron de columnas y siguen vivos clientes con el esquema anterior: sin la
guarda, un guardado de Tanques desde uno de ellos corría una columna todo lo que va detrás de
«Tanque» con respuesta «ok». Que el envío traiga **menos** columnas no es un desfase (le falta
el final, no está corrida). Lo prueba `mad-gas-dopost.test.js`, que ejecuta el `Code.gs`
entero con una hoja de Google simulada.

## Arquitectura

> Este árbol es una **guía de lectura**, no un inventario. La lista viva sale de
> `ls src/core src/ui src/views` — se comprueba en segundos y no caduca. *(Se advierte
> porque caducó: llegó a listar 8 vistas de 9, 7 módulos de `core/` de 11 y 2 de `ui/` de 5,
> y omitía entera la PWA.)*

```
src/
  main.js                  Entry: registra vistas, monta el shell, conecta y arranca refresco
  config.js                URL del Sheet, timeouts, umbrales de semáforo, orden de estadios
  styles/                  tokens.css (diseño + tema oscuro) · base.css · app.css
  core/                    ── Capa de datos (sin DOM, reutilizable y testeable) ──
    store.js               Estado central + bus de eventos
    dates.js               parseAnyDate (serial Excel, dd/mm/yyyy, ISO) + formato es-EC
    fields.js              Acceso tolerante a cabeceras, estadio, mortalidad derivada
    format.js              Formato numérico + semáforos
    sheets.js              Motor Google Sheets: XLSX-first + fallback CSV + clasificación
    refresh.js             Auto-refresco silencioso con fingerprint e inactividad
    charts.js              Registro central de Chart.js + destrucción gestionada
    prodCalendar.js        Calendario de producción: el «mes interno» como rango de corridas
    aguaColor.js           Color del agua → tono, clasificación y mensaje (espejo de la ficha)
    trovan.js              Identidad de un Trovan ID — definición ÚNICA (escritura y lectura)
    util.js                Helpers puros compartidos (avg, natCmp, fmtPct)
  ui/
    router.js              Registro y conmutación de vistas
    shell.js               Cabecera, pestañas, filtro de fecha global, loader
    modal.js               Diálogos accesibles compartidos (role/aria, foco atrapado)
    modalEscape.js         Cierre con Escape, uniforme para todas las vistas
    toast.js               Aviso efímero no bloqueante (sustituye a window.alert)
  views/
    supervisor/            Ejecutiva · módulo · tanque · larvia · despacho · omtex · compareTanks
    larvicultura/          Radar, evolución, heatmap, registros, ICL, ranking, modales
    revisiones/            Calidad, morfología, treemap, Sankey, cobertura
    algas/                 Subvistas por sistema, curva, fisicoquímicos, índices, export
    visitante/             Resumen mensual en lenguaje llano + microalgas
    biomolecular/          D3 (heatmap/treemap/swarm/sankey/E.D.T.) + reporte + export
    microbiologia/         data.js (capa pura) · index.js · petri.js (placa de agar SVG)
    maduracion/            Registro REPRODUCTIVO por Trovan: panorama · salas y tanques · hembras
                           ⚠ el registro OPERATIVO de Maduración NO está aquí: ver engine.js
    registros/             Fichas nativas (lib/ + fichas/) sobre el motor engine.js
                           lib/ tiene los esquemas y el LIBRO MAYOR de Maduración, con su
                           prueba de paridad contra el gemelo inline del monolito
  sw.test.js               Ejerce las reglas de enrutado de public/sw.js en un ámbito falso
public/
  registros/engine.js      Monolito heredado de las fichas (se estrangula gradualmente)
                           ⚠ ÚNICO sitio donde vive la INTERFAZ del registro operativo de
                           Maduración (Ingreso · Saldo · Movimientos · Desoves · Fin de
                           Ciclo · Salas · Tanques). Su cálculo sí tiene gemelo en src/
  sw.js                    Service worker: la app arranca y captura SIN CONEXIÓN
  manifest.webmanifest     PWA instalable (standalone) + icons/ 192 · 512 · maskable
```

### La PWA no es un adorno: es lo que permite capturar en campo

La vista **Registros** se usa de noche y en carretera, donde no hay señal. `public/sw.js`
sirve el shell desde caché y la cola de sincronización se vacía al recuperar cobertura.
Dos consecuencias que conviene tener presentes al desplegar:

- **El service worker es el único código del proyecto capaz de dejar a alguien viendo una
  versión ANTIGUA durante días sin que nadie se entere.** Por eso se prueba de verdad
  (`src/sw.test.js` lo carga en un ámbito falso y comprueba qué hace con cada petición).
  «Está desplegado» y «los dispositivos lo ven» **no son la misma afirmación**.
- Los `assets/` de Vite llevan hash, así que no pueden escribirse a mano en el precache:
  el worker los deduce leyendo el `index.html` que acaba de guardar (`assetsDelShell`).
  Gracias a eso la app arranca sin conexión **a la primera carga, no a la segunda**.

## Flujo de datos (Google Sheets)

1. `connectSheets()` descarga el libro **completo** vía `export?format=xlsx`
   (1 petición, todas las hojas). Si falla, cae a **CSV por `gid`** con
   descubrimiento por scraping del HTML publicado, con reintento y backoff.
2. Cada fila se etiqueta con `_SheetOrigin` (Larvicultura, Control_Tanque,
   Maduracion, `Lab_Algas`, `Registro_Supervision`, `Biomol`, `Microbiología`…) y
   se sella el `Módulo` desde el nombre de pestaña.
   ⚠ Cuando el `gid` llega sin título, el origen se deduce de las CABECERAS
   (`detectSheetName`). Una hoja que no case cae a `Hoja<N>` y su vista se queda **vacía sin
   dar error**: ya pasó, y por eso la firma de Maduración admite «sala» **o** «código
   genético» — la hoja de Desoves no tiene columna `Sala`, porque un desove es de un lote y
   un código, nunca de un tanque.
3. Se aplanan a `store.globalData` y se emite `EV.DATA`; las vistas se
   re-renderizan reactivamente.
4. `startAutoRefresh()` repite cada 60 s comparando un *fingerprint* (no
   re-renderiza si no hubo cambios) y se pausa mientras el usuario interactúa
   (modales abiertos, dropdowns).

## Testing y calidad

- **Vitest** (`npm test`): tests de caracterización sobre la capa de datos
  (`core/*`, `supervisor/stats`, `microbiologia/data`, fichas de Registros, etc.).
- **ESLint flat v9 + Prettier** (`npm run lint`): sin warnings.
- **Convenciones del repo:** ver `CLAUDE.md`. El flujo de trabajo es consultivo
  (proponer → aprobar → implementar quirúrgico → validar lint/tests/build →
  revisión visual).

## Decisiones y correcciones destacadas

- **Refactor de globals → store + eventos**; navegación por **delegación de
  eventos** en vez de `onclick` embebido.
- **Población/Supervivencia = 0 es un valor REAL** (tanque vaciado/agrupado): se
  honra el 0 en vez de arrastrar el valor previo (Supervisor, Producción Omarsa,
  Población por tanque). Detección de tanques "Agrupado"/"Descartado".
- **Microbiología:** los niveles se RECALCULAN desde el UFC con los umbrales por
  ÁREA × parámetro (`MIC_DR_BASE`, editables vía `localStorage`); columnas de
  Vibrios leídas como `V.Amarillos/V.Verdes/V.Totales` (con compatibilidad
  `C.*`); filtros que se adaptan a las columnas de cada formato.
- **Revisiones / Registros:** renombrado `Hernia → Protusión` y nueva variable
  `% No viables`, alineados con el Google Sheet y los formularios de captura.

## Pendiente / siguientes pasos

> Esta lista describe el estado de un día, no un inventario: lo que depende del despliegue
> se comprueba contra el despliegue, no se lee de aquí. *(La versión anterior pedía
> re-desplegar un GAS que ya estaba re-desplegado.)*

- 🔴 **Re-desplegar el GAS** para activar la **guarda de esquema** del registro operativo
  (ver la sección de Maduración), la **prueba de versión**, la **llave de Desoves guardada
  como texto**, el **tope de lectura de `?p=rows` en 20000 filas** (antes 5000; el registro
  reproductivo avisa si una hoja llega recortada) y el **reemplazo por clave que nunca borra a
  ciegas** (BIOMOL, Microbiología, Calidad de Agua, Patología y Marea: un `keyCols` inválido o
  una clave en blanco ya no vacían la hoja; lo prueba `gas-replace-clave.test.js`), y la
  **MATRIZ con microchips reciclados** (`llaveMatriz_`: el alta de una hembra con el chip de una
  muerta añade su fila en vez de fundirse sobre la de la muerta; lo prueba
  `mad-gas-dopost.test.js`). Las tres
  hojas nuevas —Ingreso, Movimientos y Fin de Ciclo— **ya escriben**: ese despliegue entró
  entre el 09-09 y el 09-12. Pegar `GAS/Code.gs` en Apps Script y publicar una **versión
  nueva**; guardar sin publicar no cambia lo que sirve el Web App. ⚠ Copiarlo siempre de
  `GAS/Code.gs` o de la app al día: una copia antigua de la app lleva un GAS viejo.
  🔑 **Cómo saber si entró, sin escribir nada:** ⚙ Config → «🔗 Probar conexión» compara el
  GAS desplegado con el de la app y dice si hay que volver a desplegar. Por debajo, la URL
  del Web App con `?p=ver` devuelve el sello `GAS_VERSION`, que es la huella de `Code.gs`
  y lo exige `gas-version.test.js`: no puede quedarse atrás sin poner la suite en rojo.
- ℹ **El cliente se publica con cada push a `master`** (GitHub Pages). Un dispositivo que siga
  con la app en caché envía aún el esquema anterior: con la guarda desplegada, sus envíos de
  las hojas que cambiaron se **rechazan** en vez de escribir columnas corridas, y lo tecleado
  se queda en el dispositivo hasta que la app se recargue.
- ⚠ **Mientras el GAS publicado sea el anterior**, la app **no envía Ingreso, Desoves ni Fin de
  Ciclo**: sus columnas cambiaron (Fin de Ciclo ganó «Sala», «Registro» y los cuatro pesos el 2026-09-14; su
  hoja sigue vacía, así que no hay nada que migrar) y ese GAS, sin guarda, las escribiría corridas. Lo pregunta antes con
  `?p=ver`; si esa pregunta no contesta en 6 s, envía como siempre (y la cola vuelve a
  preguntar antes de entregar). Y un envío que espera en la cola más de 24 h se descarta, así
  que conviene no dejar pasar días entre publicar el cliente y re-desplegar el GAS.
- ⚠ **Y tampoco envía el alta de un microchip reciclado.** Un GAS anterior la fundiría sobre la
  fila de la hembra muerta (su llave era sólo el Trovan), así que la app pregunta a `?p=ver` si
  el GAS anuncia `"matriz-reciclaje"` en `caps`, y si no lo confirma —o no contesta— envía el
  resto del lote y deja esas filas en la grilla con el motivo. El GAS nuevo es además quien
  rechaza, sin escribir nada, el alta del chip de una hembra **viva** o con una fecha de
  ingreso que no es posterior a la muerte de la anterior.
- ℹ La hoja «Calidad de Agua» ganará la columna 48 «Sulfato» en la primera sincronización del
  formato Algas: la añade el GAS al final, sin mover las anteriores, y no exige re-desplegarlo.
- 🔴 **Maduración Ingreso y Maduración Lotes (Desoves): sin migración, pero sin la cabecera
  vieja.** Sus columnas cambiaron el 2026-09-13/14 —Ingreso: «Camarones por m2» pasa a
  «Crecimiento semanal promedio» y entra «Libras por hectárea promedio» (18 columnas); Lotes:
  fuera «Total de nauplios (miles)» y «No viables (miles)» pasa a «Hembras no viables», un
  conteo sin ×1000 (13 columnas)— y las dos se escriben **por posición**. Las filas que tenían
  eran **de prueba**, así que no se migran: se descartan. ⚠ Lo que no puede quedarse es la
  **fila de cabeceras vieja**: con ella, la guarda de esquema del GAS nuevo rechaza cada envío
  («Esquema desactualizado… columna N») y lo tecleado se queda en el dispositivo. Basta con
  eliminar la pestaña, o vaciarla **incluida la fila 1**: el primer envío escribe las
  cabeceras nuevas. La pestaña de Desoves se sigue reconociendo en el tablero por «Hembras no
  viables» (ya no queda ninguna cabecera con «nauplio»).
- 🛡 **A4 · la firma del esquema vigente.** El GAS nuevo exige a los envíos de Ingreso, Lotes y Fin
  de Ciclo las cabeceras que sólo tiene su esquema actual («Crecimiento semanal promedio»,
  «Hembras no viables», «Sala» y «Registro»), **aunque la hoja esté vacía o no exista**: una app
  vieja (Pages antes del push, o una copia en caché) ya no puede fijar la cabecera vieja y bloquear
  a las apps al día. Si una de esas cabeceras cambia, se actualiza `MAD_ESQUEMA_FIRMA` en el mismo
  cambio. Hasta desplegarlo, el orden seguro sigue siendo push → GAS.
- **Desoves · Despacho y pendientes (2026-09-14).** Despacho se elige de una lista de 19 destinos
  (varios a la vez); la celda los guarda separados por «, » en el orden de la lista. La ficha lista
  los **desoves pendientes** (sin cifra de N5) de la hoja —bajo 🔄— y de este dispositivo;
  ✏️ Completar abre el desove con su fecha, lote y código fijos para añadir N2 o N5, y con el N5
  guardado sale de la lista. Lo guardado en el dispositivo vive en `larv4_mad_des_pend`. Debajo, el
  **historial de este dispositivo** enseña cada desove guardado en las últimas **36 h** con sus cifras
  (`larv4_mad_des_log`; lo más viejo se borra solo).
- **Fin de Ciclo (2026-09-15).** «Rojos» y los pesos **promedio** van **por lote** (los rojos van dentro
  de los machos y hembras que salen: no mueven el saldo), y hay **un solo «Peso total (kg)»** de todos
  los lotes del registro. La hoja sigue vacía, así que no hay nada que migrar; la firma A4 de Fin de
  Ciclo pasa a «Sala» (col. 5) y «Rojos» (col. 10).
- 🧪 **Tratamientos (2026-09-15), hoja nueva `Maduración Tratamientos`.** Preventivos por lote
  (productos + RAS) y desinfección por área, una fila por tarjeta, por `ID` con MERGE. El estado de la
  sala elegido en la ficha pre-marca sus productos. **Necesita el GAS nuevo**: contra el publicado hoy
  la ficha no envía y lo tecleado se queda.
- ⚠ **MATRIZ · «Número» con aspecto de fecha (P16).** El GAS anterior daba formato de fecha a la
  columna 1 de toda fila escrita, y en la MATRIZ esa columna es «Número» (un 7 se veía
  «06/01/1900»). El GAS nuevo lo corrige en cada escritura, pero las celdas ya escritas conservan
  el formato: una vez, seleccionar la columna «Número» → Formato → Número → **Automático**. El dato
  no cambió, sólo cómo se ve. En el mismo despliegue entra P15: las fechas se formatean una vez por
  petición (`?p=rows` de la MATRIZ tardaba 40-64 s por formatear celda a celda).
- **Maduración · histórico** (Fase 5): la única fase del registro operativo sin construir.
  Aplazada a propósito hasta probar el resto en operación.
- **Maduración · vaciado de las hojas antiguas**: cuando el registro operativo se dé por
  listo se borran los datos anteriores. Es el momento de retirar las tres columnas vacías
  de `Maduración Tanques`, cambiando `madKeyCols` **en el mismo despliegue**.
- Microbiología: la sub-vista **Patología en fresco** se construye cuando los usuarios
  estrenen su hoja (hoy no existe). General y Calidad de Agua ya están completas.
