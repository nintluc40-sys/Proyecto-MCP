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
  En su REGISTRO, el informe ofrece dos imágenes: el gel de agarosa y las **curvas de los
  ciclos de amplificación**. Las curvas se ofrecen cuando la grilla trae qPCR **o cuando el
  método declarado es de tiempo real** (Kit Comercial IQ REAL, Reacción dúplex, Kit Comercial
  DHELIX), aunque el día salga sin un solo positivo: las columnas de Ct y Copias/μl sólo se
  rellenan con positivos, y un día limpio también hay que poder demostrarlo. El único método
  convencional del catálogo es la PCR Nested de punto final, que revela en gel y no tiene curva.
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

Fichas de captura más una vista derivada (Saldo), todas dentro del módulo Maduración
de Registros. **Su interfaz vive ÚNICAMENTE en `public/registros/engine.js`** (y en su gemelo
autónomo `Music\index (8).html`), porque ese monolito no tiene módulos ES.
⚠ Ojo al buscarlo: **`src/views/maduracion/` NO es esto** —es la vista del reproductivo por
Trovan— y no hay ninguna carpeta nativa para el operativo. Lo que sí tiene gemelo probado en
`src/views/registros/lib/` es el CÁLCULO: los esquemas de cada ficha y el libro mayor, con
una prueba de paridad que exige que las dos implementaciones coincidan y que ningún export
del módulo se quede sin contraparte en el monolito.

> ⚠ **La lista de abajo NO se cuenta de memoria.** Aquí ponía «seis fichas» y llevaba tres
> tandas siendo falso: Tratamientos, Inf. Supervisor y Alimentación entraron sin que nadie
> tocara esta frase, y la auditoría del 2026-09-15 se encontró una ficha entera —Alimentación,
> con su hoja y su capacidad del GAS— sin una sola mención en este archivo. El inventario
> vivo es **`MAD_TABS` en `engine.js`**; esta tabla es su explicación, no su fuente.

| Ficha | Hoja | Grano |
|---|---|---|
| 📥 **Ingreso** | `Maduración Ingreso` | (lote, composición, sala, tanque) |
| ⚖️ **Saldo** | *(derivada)* | vista del libro mayor y resumen por sala y lote, no escribe |
| 🔄 **Movimientos** | `Maduración Movimientos` | el **tramo** origen → destino |
| 🥚 **Desoves** | `Maduración Lotes` | (fecha, lote, código genético) |
| 📋 **Inf. Supervisor** | `Maduración Mortalidad Desove` | (fecha, lote): mortalidad ♀ + una fila por revisión de nauplios |
| 🏁 **Fin de Ciclo** | `Maduración Fin de Ciclo` | (fecha, lote, motivo, sala si es Parcial) · Registro y sus pesos |
| 🧪 **Tratamientos** | `Maduración Tratamientos` | una fila por tarjeta: preventivo por lote o desinfección por área |
| 🍤 **Alimentación** | `Maduración Alimentación` | (fecha, sala, tanque): agenda de tomas y ración calculada |
| 🏠 **Salas** · 🛢️ **Tanques** | `Maduración Sala` · `Maduración Tanques` | la grilla diaria |

**Todas guardan un BORRADOR POR FECHA en el dispositivo (2026-09-15).** Salas y Tanques ya lo
hacían por ser grillas —su lista local lleva la fecha dentro de cada fila—; desde esa fecha las
siete fichas de formulario también: al cambiar el campo Fecha se guarda el día que se deja y se
trae el que se elige, y lo mismo al cambiar de pestaña o volver atrás. Se guardan los últimos
**30 días** por ficha. Es lo tecleado en ESE dispositivo, no lo que hay en la hoja.

En **🛢️ Tanques**, los pesos ♂ y ♀ **bajan por su columna**: al teclear uno se copia a las filas
de abajo que tengan animales vivos. Una fila corregida a mano ya no se pisa.
En **🏠 Salas**, la columna `RAS` dice **en qué porcentaje** usa el RAS esa sala (`No`, `10%` …
`100%`); lo que falta hasta el 100 es agua de playa y no se anota.

**🍤 Alimentación** es la única ficha que no registra lo ocurrido sino lo que hay que dar: por
sala se define una agenda de tomas (hora · alimento · % de biomasa) y la ración sale de
`biomasa (♀+♂) × % ÷ 100`, con los animales del libro mayor y el peso de la biometría de
Tanques del lote en ese tanque (si no hay, del Ingreso ponderado; y siempre se puede teclear
a mano). La agenda se comparte por la columna `Tomas` de la última fila de la sala, así que
un dispositivo que lee la hoja adopta la del resto salvo que tenga cambios sin guardar.
Necesita que el GAS anuncie la capacidad **`mad-alimentacion`**: sin ella calcula pero no envía.

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
nueve hojas del registro operativo (`MAD_ESQUEMA_VIGILADO`), si una cabecera del envío no coincide con la de la hoja en
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

- ✅ **La guarda de esquema, la prueba de versión, el tope de `?p=rows` en 20000 filas, el reemplazo
  por clave que nunca borra a ciegas y la MATRIZ con microchips reciclados YA ESTÁN DESPLEGADOS**, y
  las nueve hojas del registro operativo están en la lista blanca —incluidas `Maduración
  Tratamientos`, `Mortalidad Desove` y `Alimentación`, con su capacidad `mad-alimentacion`—.
  *(Este punto pedía re-desplegar todo eso y llevaba días siendo falso; medido con `?p=ver` el
  2026-09-16. Es la segunda vez que le pasa a esta lista, y por eso arriba está el aviso.)*
- 🔴 **Queda UN re-despliegue pendiente: el de los cambios de `Code.gs` del 2026-09-16** —la firma de
  las tres hojas nuevas y la holgura de `LIMITS.biomol`—. Hasta que entre, **el cliente al día no
  enviará las seis fichas de Maduración**, porque desde ese mismo día el portón compara el SELLO y el
  desplegado ya no es el suyo. Es deliberado: calcula, guarda en el dispositivo y lo avisa.
  Pegar `GAS/Code.gs` en Apps Script y publicar una **versión nueva**; guardar sin publicar no cambia
  lo que sirve el Web App. ⚠ Copiarlo siempre de `GAS/Code.gs` o de la app al día: una copia antigua
  de la app lleva un GAS viejo. ⚠⚠ **Y va DESPUÉS del push** (ver el orden, más abajo).
  🔑 **Cómo saber si entró, sin escribir nada:** ⚙ Config → «🔗 Probar conexión» compara el
  GAS desplegado con el de la app y dice si hay que volver a desplegar. Por debajo, la URL
  del Web App con `?p=ver` devuelve el sello `GAS_VERSION`, que es la huella de `Code.gs`
  y lo exige `gas-version.test.js`: no puede quedarse atrás sin poner la suite en rojo.
- ℹ **El cliente se publica con cada push a `master`** (GitHub Pages). Un dispositivo que siga
  con la app en caché envía aún el esquema anterior: con la guarda desplegada, sus envíos de
  las hojas que cambiaron se **rechazan** en vez de escribir columnas corridas, y lo tecleado
  se queda en el dispositivo hasta que la app se recargue.
- ⚠ **Mientras el GAS desplegado no sea EL DE LA APP, las seis fichas de Maduración no envían**
  (Ingreso, Desoves, Fin de Ciclo, Tratamientos, Inf. Supervisor y Alimentación): se escriben por
  posición y un GAS que no es el suyo podría escribirlas corridas. La app lo pregunta antes con
  `?p=ver` y **compara el sello** (desde el 2026-09-16; antes le bastaba con que contestara, que es
  justo lo que dejaba pasar a un cliente viejo). 🔒 **Si esa pregunta no contesta** (6 s, o la
  página 404 de Google) **tampoco se escribe** (PV3, 2026-09-16; antes se enviaba igual): el envío
  entra en la cola sin salir y la cola sólo lo entrega cuando `?p=ver` confirma el sello, preguntando
  una vez por vaciado. Alimentación compara el sello como las otras cinco: ya no le basta con que el
  GAS anuncie `mad-alimentacion`. Y un envío que espera en la cola más de 24 h **se descarta**, así
  que conviene no dejar pasar días entre publicar el cliente y re-desplegar el GAS.
- 📋 **«Registrado desde este dispositivo» dice qué pasó con CADA envío (PE1.2, 2026-09-16).** Los siete
  registros (Ingreso, Movimientos, Desoves, Fin de Ciclo, Tratamientos, Inf. Supervisor y Alimentación)
  decidían «en cola» o «enviado» mirando si la cola ENTERA tenía algo: un envío atascado de cualquier
  ficha dejaba todo «en cola», y uno que caducaba (24 h) o que la hoja rechazaba se pintaba «✅ enviado».
  Ahora cada envío viaja con su marca (`madlog:<ficha>` y su id), la cola la reconcilia al entregarlo y
  el registro enseña **📶 en cola**, **✅ enviado** o **⚠ no llegó** (salió de la cola sin entregarse).
  Las entradas anteriores, sin marca, conservan la regla de antes. Lo prueba `mad-log-envios.test.js`.
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
- 🛡 **A4 · la firma del esquema vigente.** El GAS nuevo exige a los envíos de Ingreso, Lotes, Fin de
  Ciclo, Mortalidad Desove, Tratamientos y Alimentación las cabeceras que sólo tiene su esquema
  actual («Crecimiento semanal promedio»; «Hembras no viables»; «Sala» y «Rojos»; «Fototropismo» y
  «Área»; «Productos RAS»; «Fuente del peso»), **aunque la hoja esté vacía o no exista**: una app
  vieja (Pages antes del push, o una copia en caché) ya no puede fijar la cabecera vieja y bloquear
  a las apps al día. Si una de esas cabeceras cambia, se actualiza `MAD_ESQUEMA_FIRMA` en el mismo
  cambio; la lista que manda es esa constante de `Code.gs`.
- 🔎 **Y por eso el rechazo dice DE QUIÉN es la cabecera vieja (PE1.2, 2026-09-16).** En esas seis
  hojas la firma se comprueba antes que la guarda de esquema, así que un «Esquema desactualizado»
  sólo puede venir de la HOJA: el GAS lo dice así («Esta app trae el esquema vigente: la cabecera
  vieja es la de la HOJA, que hay que vaciar con su fila 1») y la app lo enseña tal cual, sin el
  «Actualiza la app» que mandaba a arreglar una app que ya estaba al día. En las hojas sin firma
  (Sala, Tanques y Movimientos) no se puede saber y el mensaje nombra las dos salidas. Cambia el
  `Code.gs`, así que el sello pasa a `afe439753273` y **exige re-desplegar el GAS**. Lo prueban
  `mad-gas-dopost.test.js` y `gas-motivos.test.js`.
- ⚠⚠ **EL ORDEN ES `push → GAS`, y lo decide UNA pregunta: ¿alguna hoja ganó una columna EN
  MEDIO?** Añadir AL FINAL es inocuo —`ensureHeaders` alarga la cabecera que falte, y «el envío
  trae menos columnas» no cuenta como desfase—, así que da igual quién cree `Maduración Sala`
  (21→22 con Toneladas) o `Maduración Tanques` (15→16 con Observaciones operativas).
  `Maduración Mortalidad Desove` es el caso contrario: pasó de 14 a 18 columnas **insertando**
  Fototropismo y Aireación en la 11-12 y Área y Alcalinidad en la 15-16. Si el GAS entra ANTES que
  el push, un dispositivo con la app anterior crea esa hoja con su cabecera de 14 y desde ese
  momento la guarda rechaza a TODOS los clientes al día («Esquema desactualizado… columna 11»):
  sólo se sale vaciando la hoja **con su fila 1**.
  🔑 Aquí ponía «hasta desplegarlo, el orden seguro sigue siendo push → GAS» mientras la lista de
  la memoria ponía el GAS primero y el push al final. **Manda esta línea**, y el motivo ya no es
  una opinión: está medido comparando las cabeceras de las dos versiones del cliente.
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
- ⚖️ **Saldo = resumen rápido (2026-09-15).** 🔄 Recalcular lee todas las fichas y resume por **sala** (estado
  y el de sus lotes, lotes, RAS, T° y O2 con promedio, última lectura, Δ con el registro anterior y CV, tanques y
  animales en producción y cuarentena, desinfecciones) y por **lote** (población, muertos y descartes con tasas
  sobre lo ingresado, días de cuarentena y producción, H:M por tanque, último peso, % mudas y % cópulas del último
  día, desoves con Nauplios/Hembra = N5 ÷ desoves y fertilidad = N2 ÷ huevos, mortalidad en desove y
  recuperación, preventivos). **⚙️ Variables** elige qué se ve (se recuerda en el dispositivo) y hay **🖨 PDF**
  por sala o lote y **de todo**. Lógica en `mad-resumen.js`; el detalle del libro sigue debajo.
  La **mortalidad va en dos filas**: la **del día** (con su fecha) y la **acumulada** con el rango
  «ingreso → hoy» al lado, para que un total no se lea como si fuera del día. 🔑 La del día se saca
  **restando dos libros** —el del cierre de ese día y el de la víspera—, no sumando las filas de
  Tanques: en un tanque mezclado las bajas son del TANQUE y repartirlas entre sus lotes es lo que
  hace el libro. Su % va sobre los animales **en riesgo ese día**, no sobre el total ingresado.
- 📋 **Inf. Supervisor (2026-09-15/16), hoja nueva `Maduración Mortalidad Desove`.** TRES cosas en la
  MISMA hoja, por decisión del usuario. (1) **Mortalidad de hembras** en tanques de desove y de recuperación: por
  fecha y lote, las que entran y las que mueren; el % se calcula. Las muertas **se descuentan del saldo** del lote
  (el libro las reparte entre sus tanques). (2) **Revisión de nauplios por lote**, *una fila por revisión*
  (Entrada · Lavado · Lavado 2 · Postlavado) con deformidad, actividad, hongos, **fototropismo**, **aireación**,
  salinidad y temperatura; esas filas llevan «Revisión» y el «Tipo de tanque» vacío, y **el libro mayor las salta**.
  Salinidad y temperatura **bajan por su columna** a las revisiones de abajo, y cada fila sigue siendo editable.
  (3) **Alcalinidad diaria por ÁREA**: el RAS y las cinco salas, en filas propias con «Área» y «Alcalinidad».
  Las observaciones del lote se escriben en todas sus filas.
  ⚠ **Fototropismo y Aireación llevan su PROPIA lista de valores** aunque hoy coincida con la de Actividad
  (Alta/Media/Baja): compartir el array haría que retocar una cambiara las otras dos en silencio, y son tres
  juicios distintos del laboratorio.
  🔴 **Esta hoja es la única que ganó columnas EN MEDIO** (Fototropismo y Aireación en la 11-12, Área y
  Alcalinidad en la 15-16), y de ahí sale el orden `push → GAS` de más abajo.
- 🍤 **Alimentación (2026-09-15), hoja nueva `Maduración Alimentación` (21 columnas, `ID` = fecha-S*n*-T*tanque*,
  MERGE).** Ver la sección de Maduración. **Necesita EL GAS DE ESTA APP** (el sello, como las otras cinco; hasta el
  2026-09-16 bastaba la capacidad `mad-alimentacion`): sin él calcula, imprime y guarda la agenda en el dispositivo,
  pero no envía ni lee la agenda compartida — y lo avisa.
- 🧪 **Tratamientos (2026-09-15), hoja nueva `Maduración Tratamientos`.** Preventivos por lote
  (productos + RAS) y desinfección por área, una fila por tarjeta, por `ID` con MERGE. El estado de la
  sala elegido en la ficha pre-marca sus productos. **Necesita el GAS nuevo**: contra el publicado hoy
  la ficha no envía y lo tecleado se queda.
  **2026-09-15 · entran tres desinfectantes —Ácido Nítrico, Peróxido y Trilon B— y dos áreas nuevas,
  Reservorio y Colectores.** Son valores de catálogo: la hoja NO cambió de columnas.
- 🛢️ **Tanques · las observaciones son de MULTISELECCIÓN (2026-09-15).** «Observaciones sanitarias» pasa
  a marcarse de una lista de 8 y entra **«Observaciones operativas»** con 11, las dos con bajada por
  columna y con `data-fijo` (una fila corregida a mano ya no se pisa). 🔑 Llegan a la hoja **en el ORDEN
  DEL CATÁLOGO, no en el de marcado**: si no, contarlas después sería imposible. La columna nueva va
  **al final**, así que no mueve nada de lo que ya hay.
- 🏠 **Salas · columna «Toneladas» junto al RAS (2026-09-15).** Las toneladas de agua de **CADA tanque**
  de la sala, con su valor por defecto (5,5 · 21 · 21 · 14 · 13). El defecto **se pre-rellena, no se
  impone**: manda lo que hay en la celda, y al repintar manda lo guardado —un 0 incluido—; un defecto que
  nadie tecleó **no cuenta** como registro. En la hoja va **al final**, detrás de «Estado por lote».
  ✅ **Mandan las cifras del catálogo, no las del Excel del módulo** (decisión del usuario, 2026-09-16):
  aquella hoja probó la FORMA de la cuenta, pero sus divisores son la medición de ESE módulo en septiembre.
- ⚖️ **Saldo · ⚙️ Variables gana seis, y la tarjeta de lote la CARGA POR TANQUE (2026-09-15/16).** Las seis:
  toneladas, alcalinidad de la sala y del RAS, revisión de nauplios (calidad y agua) y observaciones de los
  tanques. Y por tanque: **carga métrica** (kg de biomasa viva) y **volumétrica** (kg/m³ = esa biomasa ÷ el
  volumen de UN tanque). 🔴 **Corregido el 2026-09-16 con el Excel del módulo**: las toneladas son **POR
  TANQUE**, no de la sala entera; repartirlas además entre sus tanques multiplicaba la carga por su número
  (14,8 kg/m³ donde el Excel da 1,17). Fijado como prueba, al decimal.
- ⚡ **Los botones lentos leen EN PARALELO (2026-09-15).** Saldo, Proponer estado, Ver vivos, Leer hoja,
  Revisar y Leer saldos y pesos pasan por el mismo coste: `madSaldoCargar` lee CINCO hojas y ⚖️ Recalcular
  tres más, y iban una detrás de otra. **Medido contra el GAS vivo, no supuesto: 13,5 s → 3,4 s (−75 %).**
  Las cuatro hojas que se piden siempre arrancan sin esperar a `?p=ver`; la quinta sí depende de su respuesta.
- 🎨 **Traslado en ruta · los cinco KPI del viaje se veían en blanco (2026-09-16).** O₂, Temp., Actividad,
  Observaciones y Tiempo usaban `.sv-kpi-glass`, que es vidrio blanco, sobre `.sv-tras-viaje`, que no tiene
  fondo. Opacados con los tokens de superficie, y el override va **SIEMPRE prefijado**: sin prefijo se
  despintaban los KPI de Despacho, Módulo y Tanque, que sí van sobre color. Lo vigila `trasladoKpiContraste.test.js`.
- 🛡 **2026-09-16 · las TRES hojas nuevas entran en `MAD_ESQUEMA_FIRMA`.** `Mortalidad Desove`,
  `Tratamientos` y `Alimentación` no existían todavía en producción, así que la guarda V3 no tenía con qué
  compararlas y quien las creara primero les fijaba la cabecera para siempre. Ahora el GAS exige a sus
  envíos una columna que **sólo tiene el esquema actual** (Fototropismo en la 11 y Área en la 15 · Productos
  RAS en la 8 · Fuente del peso en la 9). Las otras dos no cambiaron nunca de columnas y van igualmente: el
  día que cambien, el cerrojo tiene que existir YA. **Exige re-desplegar el GAS.**
- 🛡 **2026-09-16 · «¿el GAS está al día?» pasa a comparar el SELLO, no a preguntar si contesta.** El portón
  de las seis fichas de Maduración (`_madIngGasAlDia`) devolvía `true` en cuanto `?p=ver` traía un JSON con
  `version`, **sin mirar el valor**: se llamaba «al día» y sólo medía «está vivo», así que un cliente de hace
  tres tandas se creía tan al día como el recién publicado. Ahora se compara contra el sello que lleva la
  propia app. 🔑 El efecto es de **fallo seguro**: tocar `Code.gs` y no re-desplegar deja esas seis fichas
  **sin enviar** (calculan, guardan en el dispositivo y lo avisan) en vez de dejarlas escribir contra un
  servidor que no es el suyo. Lo tecleado no se pierde: la cola lo conserva.
- 🔬 **2026-09-16 · el analista, en una sola grafía.** El campo «Responsable» es texto libre y la misma
  persona quedó escrita de dos formas: medido en Calidad de Agua, «Ramirez» 512 filas contra «Ramírez» 191 y
  «Macias» 323 contra «Macías» 212 — el 63 % sin tilde. Cualquier recuento por analista partía a la persona
  en dos. **Decisión del usuario: la forma correcta es CON tilde.** La captura canoniza al guardar y el
  tablero pliega al leer, así que **las filas que ya están en la hoja no hay que migrarlas**. ⚠ Un nombre
  que no esté en el catálogo se respeta tal cual: no se convierte a nadie en otro.
- 📏 **2026-09-16 · Biomol · el tope del cliente y el del GAS dejan de ser el mismo número.**
  `BIO_GRID_MAX_ROWS` y `LIMITS.biomol.maxRows` valían los dos 100: una grilla llena mandaba 100 filas y
  pasaba sólo porque «100 > 100» es falso. El del GAS sube a 200, y una prueba exige la **desigualdad** (no
  el número, que caducaría). **Exige re-desplegar el GAS.**
- ⚠ **MATRIZ · «Número» con aspecto de fecha (P16).** El GAS anterior daba formato de fecha a la
  columna 1 de toda fila escrita, y en la MATRIZ esa columna es «Número» (un 7 se veía
  «06/01/1900»). El GAS nuevo lo corrige en cada escritura, pero las celdas ya escritas conservan
  el formato: una vez, seleccionar la columna «Número» → Formato → Número → **Automático**. El dato
  no cambió, sólo cómo se ve. En el mismo despliegue entra P15: las fechas se formatean una vez por
  petición (`?p=rows` de la MATRIZ tardaba 40-64 s por formatear celda a celda).
- **Maduración · el reproductivo: `Maduración Transferencias` sigue sin estrenar.** Medido el
  2026-09-15: la hoja **no existe** (0 cabeceras), mientras `MATRIZ` va por 1665 filas y `Bitácora`
  por 2227. La ficha de traslado de hembras está escrita y probada; lo que falta es que alguien
  registre la primera, y la hoja nace con ese envío. Hasta entonces, el panel de transferencias del
  tablero reproductivo se dibuja vacío y eso es lo correcto, no un fallo.
- **Maduración · vaciado de las hojas antiguas**: cuando el registro operativo se dé por
  listo se borran los datos anteriores. Es el momento de retirar las tres columnas vacías
  de `Maduración Tanques`, cambiando `madKeyCols` **en el mismo despliegue**.
- Microbiología: la sub-vista **Patología en fresco** se construye cuando los usuarios
  estrenen su hoja (hoy no existe). General y Calidad de Agua ya están completas.
