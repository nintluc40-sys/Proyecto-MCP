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

> SheetJS (XLSX) y D3 se sirven desde `public/vendor/` —el mismo origen, con su `integrity` en
> `index.html`—, no desde un CDN (las versiones de npm están deprecadas/desactualizadas). Chart.js sí
> es dependencia de npm. El gemelo `index (8)` no tiene servidor del que pedirlo: lleva SheetJS
> **incrustado**, byte a byte el de `public/vendor/` (lo vigila `verificar-xlsx-index8`).

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
  ♻ **Un Trovan ID es de un CHIP, no de una hembra**, así que la MATRIZ puede tener varias suyas.
  Lo que identifica a un individuo es la **cuaterna** (Trovan · Piscina · Código genético · Lote);
  la regla vive en `src/core/trovan.js` y está detallada en «Reglas vigentes», más abajo.
  *(Hasta el 2026-09-16 la regla era otra —una hembra «sucedía» a otra si la anterior había muerto
  y la nueva ingresaba después—; se retiró entera, y con ella sus dos rechazos por fechas.)*
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
| 📈 **Broodstock** | `Maduración Broodstock` | (fecha de corte, piscina): la carga SEMANAL del Excel del área |
| 🏠 **Salas** · 🛢️ **Tanques** | `Maduración Sala` · `Maduración Tanques` | la grilla diaria; en Tanques, cada ronda de mortalidad es un **parte** con su hora |

**Todas guardan un BORRADOR POR FECHA en el dispositivo (2026-09-15).** Salas y Tanques ya lo
hacían por ser grillas —su lista local lleva la fecha dentro de cada fila—; desde esa fecha las
siete fichas de formulario también: al cambiar el campo Fecha se guarda el día que se deja y se
trae el que se elige, y lo mismo al cambiar de pestaña o volver atrás. Se guardan los últimos
**30 días** por ficha. Es lo tecleado en ESE dispositivo, no lo que hay en la hoja. (📈 Broodstock
no lleva borrador: no se teclea, se carga un archivo que sigue en el equipo de quien lo sube.)

En **🛢️ Tanques**, los pesos ♂ y ♀ **bajan por su columna**: al teclear uno se copia a las filas
de abajo que tengan animales vivos. Una fila corregida a mano ya no se pisa. Cada ronda de mortalidad
del día es un **PARTE** con su número y su **hora**, que pone el sistema al abrirlo y es la misma para
todos sus tanques: guardar otra vez el mismo parte no lo duplica, y el último del día se puede reabrir.
La hora va en la llave del GAS, así que se guarda como TEXTO (Sheets convierte «08:30» en una hora).
En **🏠 Salas**, la columna `RAS` dice **en qué porcentaje** usa el RAS esa sala (`No`, `10%` …
`100%`); lo que falta hasta el 100 es agua de playa y no se anota.

**🍤 Alimentación** es la única ficha que no registra lo ocurrido sino lo que hay que dar: por
sala se define una agenda de tomas (hora · alimento · % de biomasa) y la ración sale de
`biomasa (♀+♂) × % ÷ 100`, con los animales del libro mayor y el peso de la biometría de
Tanques del lote en ese tanque (si no hay, del Ingreso ponderado; y siempre se puede teclear
a mano). La agenda se comparte por la columna `Tomas` de la última fila de la sala, así que
un dispositivo que lee la hoja adopta la del resto salvo que tenga cambios sin guardar.
Como las demás, sólo envía al **GAS de esta app** (compara el sello): sin él calcula pero no envía.

**📈 Broodstock** es la única ficha de **carga masiva**: no se teclea, se elige el Excel semanal del
área. El lector va **por cabecera, no por posición** —la plantilla de julio no tiene «Camaronera» y la
de septiembre sí: por posición, el código genético acabaría en «Camaronera» sin un error—. La fecha de
corte es la de **A3** (no el nombre de la hoja); del bloque de pesos salen el ÚLTIMO peso con la fecha
de su columna y el de la columna anterior, que da el incremento de **una** semana; la sobrevivencia en
fracción pasa a %, y «130.pl» son **Pl/g**, no gramos. Densidad, días, edad, incremento y crecimiento
se RECALCULAN. Un libro trae una hoja por semana: se marca sólo la más reciente. Subir otra vez la
misma semana **reemplaza** sus filas.

**El Saldo estima la carga de cada tanque:** la **métrica en g/m²** —la biomasa (♀ + ♂ con sus últimos
pesos) entre el ÁREA del tanque (`MAD_TANQUE_AREA_M2`: una por sala, y la Sala 5 tanque a tanque)— y la
**volumétrica en kg/m³**, entre las toneladas de un tanque de su sala. Sin área o sin pesos, vacía.

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
`Tanques` y `Lotes` se identifican por POSICIÓN (`[0,1]`, `[0,1,3,16,17]` —Fecha, Sala, Tanque,
Hora y Parte— y `[0,1,2]`), igual que `Broodstock` (`[0,1]`, Fecha de corte · Piscina, que además
REEMPLAZA en vez de fundir), así que mover una columna de las primeras destruye datos en cada
sincronización; `Ingreso`, `Movimientos` y `Fin de Ciclo` van por la columna `ID`, que el GAS
localiza por su cabecera.
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
                           Maduración (todas sus fichas: la lista viva es MAD_TABS). Su
                           cálculo sí tiene gemelo en src/
  vendor/                  SheetJS y D3, servidos desde aquí (no por CDN)
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

- **Vitest** (`npm test`): la capa de datos (`core/*`, `supervisor/stats`, `microbiologia/data`,
  las fichas de Registros…) y el monolito `public/registros/engine.js`, que se arranca entero en
  happy-dom sobre el shell real. **ESLint flat v9 + Prettier** (`npm run lint`).
- **Bancos de mutación** (fuera del repo, en `Documents\_herramientas-traslado`). Una prueba en
  verde no dice que vigile nada: cada regla que importa tiene su banco, que reintroduce el defecto
  a propósito y exige que alguna prueba se ponga roja. Cada banco se corre con `node mutar-<tema>.mjs`.
  🔴 **Escriben en el archivo mientras corren y lo restauran al salir. Tras cualquier corrida,
  `git status`** — y antes de correr uno, copiar a un lado los archivos que toca: un corte de
  corriente a media corrida no deja el archivo mutado, lo deja **a ceros** (pasó el 2026-09-16).
- **`node verificar-todo.mjs`** (mismo sitio) corre todos los invariantes de la carpeta: la paridad
  repo ↔ `index (8)` función a función, los estilos, el marcado, las tres copias del GAS, las anclas
  de todos los bancos y sus guardas de banderas.
- ⚠ **Las cifras de pruebas, de funciones y de líneas no se anotan aquí**: las dice cada herramienta
  al correr. Un número escrito en un README caduca sin avisar.
- **Convenciones del repo:** ver `CLAUDE.md`. El flujo es consultivo (proponer → aprobar →
  implementar quirúrgico → validar lint/tests/build → revisión visual), un cambio por commit.

### Los DOS destinos

Todo cambio de Registros va a **dos** sitios: este repo y `C:\Users\Usuario\Music\index (8).html`,
el monolito gemelo *standalone* (misma app, mismo GAS, mismas claves `larv4_`), que **no está
versionado**. Lo que los mantiene juntos no es la disciplina sino los verificadores, y para portar
hay herramienta: `portar-engine-a-index8.mjs` deriva los bloques del `git diff` de `engine.js` y los
aplica al gemelo; `portar-code-gs-a-plantillas.mjs` hace lo propio con `GAS/Code.gs` y las dos
plantillas `GAS()`. Copiar a mano es lo que los separa. ⚠ Con `--contexto` bajo, un bloque que INSERTA
se ancla sólo en lo de alrededor: el portador se niega si la mitad de sus líneas ya están en el
destino, porque una vez insertó un bloque dos veces.

> ⚠ **Ninguna prueba del repo puede leer `index (8).html`.** En GitHub Actions el checkout no tiene
> `Music\`, así que un `readFileSync` sobre él revienta el paso «Pruebas» y arrastra al deploy. La
> suite vigila el repo; la paridad con el gemelo la vigilan los verificadores, que corren en la
> máquina donde ese archivo existe.

## El contrato con Google Sheets: sello, firma y cola

Escribir en las hojas de Maduración no es un `POST` cualquiera. Hay tres cerrojos, y conviene
entender qué protege cada uno antes de tocarlos.

### 1 · El SELLO (`GAS_VERSION`) — «¿el servidor es el de esta app?»

`GAS_VERSION` es la **huella de `GAS/Code.gs`**: si el archivo cambia y el sello no, `gas-version.test.js`
falla y dice cuál poner. Vive en **tres copias** que tienen que rendir idénticas (`Code.gs` y las
plantillas `GAS()` de `engine.js` e `index (8)`), porque lo que el usuario pega en Apps Script sale
de la app.

Antes de enviar, las fichas de Maduración que escriben por posición o en hojas nuevas preguntan a
`?p=ver` y **comparan el sello** con el suyo (la lista viva es `_madHojaPideGasNuevo` en `engine.js`;
no se copia aquí porque ya caducó una vez: decía «seis» y hoy son más, Tanques y Broodstock incluidas).
No basta con que el GAS conteste: eso sólo medía «está vivo».

> 🔒 **Es un fallo seguro, no un error.** Tocar `Code.gs` y no re-desplegar deja esas fichas
> **sin enviar**: calculan, guardan en el dispositivo y lo avisan. Lo mismo si `?p=ver` no contesta.
> Nada se pierde — pero **la cola descarta a las 24 h**, así que no conviene dejar pasar días entre
> publicar el cliente y re-desplegar el GAS.

⚙ Config → **«🔗 Probar conexión»** es quien dice si el sello entró, sin escribir nada.

### 2 · La FIRMA (`MAD_ESQUEMA_FIRMA`) — «¿el CLIENTE trae el esquema de hoy?»

Un cliente viejo que cree una hoja le fija la cabecera equivocada **para siempre**, y desde ahí el
GAS rechaza a todos los clientes al día. La firma lo impide: cada hoja declara una o varias columnas
que **sólo tiene el esquema actual**, y un envío que no las traiga no escribe — **aunque la hoja esté
vacía o no exista**, que es justo cuando el daño se hace.

| Hoja | Columnas firmadas |
|---|---|
| Maduración Ingreso | 14 `Crecimiento semanal promedio` |
| Maduración Lotes (Desoves) | 7 `Hembras no viables` |
| Maduración Fin de Ciclo | 5 `Sala` · 10 `Rojos` |
| Maduración Mortalidad Desove | 11 `Fototropismo` · 15 `Área` · 16 `Alcalinidad día` |
| Maduración Tratamientos | 8 `Productos RAS` |
| Maduración Alimentación | 9 `Fuente del peso` |
| Maduración Movimientos | 9 `Agua destino` · 12 `ID` |
| Maduración Sala | 20 `RAS` |
| Maduración Tanques | 15 `Observaciones sanitarias` |
| Maduración MATRIZ | 6 `Lote` · 11 `Fecha ingreso` |
| Maduración Bitácora | 3 `Tipo` · 5 `Tanque` |
| Maduración Transferencias | 4 `Trovan ID` · 12 `Piscinas presentes` |
| Maduración Broodstock | 2 `Piscina` · 8 `Pl/g` |

> 🔑 **Movimientos no ha cambiado nunca de columnas**: su firma no arregla ningún desfase, es el
> cerrojo puesto ANTES de necesitarlo — una firma añadida después del desfase llega tarde por
> definición. Firma dos posiciones porque no hay ninguna columna «nueva» que delate al cliente
> viejo: la 9 caza una inserción anterior y la 12 una posterior.
> ✅ **`Maduración Sala` y `Maduración Tanques` tienen firma** (la tabla de arriba), además de la guarda
> V3, que compara contra la cabecera de la HOJA y no actúa si la hoja está vacía: la firma sí.

⚠⚠ **Si una columna firmada cambia de nombre o de sitio, `MAD_ESQUEMA_FIRMA` se actualiza EN EL
MISMO CAMBIO**, o la firma rechazará a los clientes al día.

### 3 · El ORDEN: `push` → GAS → Probar conexión

**Y lo decide UNA pregunta: ¿alguna hoja ganó una columna EN MEDIO?**

Añadir **al final** es inocuo: `ensureHeaders` alarga la cabecera que falte y «el envío trae menos
columnas» no cuenta como desfase. Por eso da igual quién cree `Maduración Sala` o `Maduración Tanques`.

`Maduración Mortalidad Desove` es el caso contrario: pasó de 14 a 19 columnas **insertando**
(Fototropismo/Aireación en la 11-12, Área/Alcalinidad en la 15-16, y la alcalinidad partida en día 16
y noche 17). Si el GAS entra **antes** que el push, un dispositivo con la app anterior crea esa hoja
con su cabecera de 14 y desde ese momento el GAS rechaza a TODOS los clientes al día; sólo se sale
vaciando la hoja **con su fila 1**.

### 4 · La cola, y qué pasó con CADA envío

Un envío que no puede salir entra en la cola con su **marca** (`madlog:<ficha>` + su id). Al
entregarse, la cola la reconcilia y el registro «Registrado desde este dispositivo» de esa ficha
enseña **📶 en cola**, **✅ enviado** o **⚠ no llegó**. El estado es de cada envío, no de la cola
entera. **A las 24 h, lo que siga en la cola se descarta.**

## Reglas vigentes (lo que no es obvio leyendo el código)

### Identidad en el registro reproductivo

- **Un individuo es una CUATERNA: Trovan · Piscina · Código genético · Lote.** El mismo chip entra
  tantas veces como haga falta mientras esas tres no se repitan a la vez; ni el estado de la anterior
  ni las fechas deciden. El único rechazo es que esa cuaterna ya exista.
- 🔴 **Por eso TODO envío a la MATRIZ tiene que traer las cuatro columnas.** La mortalidad y el
  traslado sólo conocen el Trovan: copian el resto de lo que ya leyeron. Si una faltara, la fila no
  casaría con la suya y el upsert **añadiría una suelta** en vez de actualizar.
- 🛡 **Y el GAS se defiende de un cliente ANTERIOR a la cuaterna** (V2), que manda la mortalidad y el
  traslado con sólo el Trovan: una fila sin Piscina, Código ni Lote se resuelve por su Trovan si la hoja
  tiene **una** fila con él; con **varias**, se rechaza el envío entero y se dice que se actualice la app.
- **Sin la MATRIZ no se arma nada.** Ni eventos ni traslados: con Google caído se trabaja sobre la
  copia local, que guarda **la misma proyección que se le pide al GAS** y anota cuáles; una copia a
  la que le falte alguna de esas columnas no se usa.
- **Un chip con DOS hembras vivas: el SISTEMA no elige; elige el USUARIO** (D17, R5). El evento sólo
  trae el Trovan, así que apuntarlo a una sería una convención — y como la lectura **no pide las
  columnas de fecha** (cuestan 10×), el desempate caería en «la de más abajo en la hoja». Así que el
  evento y el TRASLADO se rechazan y el informe ofrece las dos, por su cuaterna, para registrar con la
  elegida (el traslado conserva su TR-ID). El alta ya avisa cuando el chip lo lleva una viva. Medido en
  producción el 2026-09-17: 1665 filas, 1665 chips, ninguno con más de una.

### Cuarentena

- **La cuarentena es de cada (lote, sala)**, no del lote: un lote puede estar en varias salas y una
  sala tener varios lotes. El ingreso reinicia el reloj **en su sala**, la cópula lo rompe **en su
  sala**, y el cierre sigue siendo del lote entero.
- **Lo que se mueve lleva su reloj.** La sala destino, si el lote no estaba, lo hereda; si ya estaba,
  manda **la cuarentena que termina más tarde**. Unos animales en cuarentena no dejan de estarlo por
  llegar a una sala que produce, y a la inversa la sala sigue en la suya. *(Revisado y ratificado el
  2026-09-17: la alternativa —que mandara el reloj del destino— permitiría «lavar» la cuarentena
  moviendo animales a una sala más adelantada, que es lo que la cuarentena existe para impedir.)*

### Las fichas de Maduración

- **Cada ficha guarda un borrador POR FECHA** (30 días): al cambiar la fecha se guarda el día que se
  deja y se trae el elegido. Se guarda el panel, no un modelo, así que una ficha que cambia después
  deja borradores con campos que ya no existen: `_madBorrAdaptar` los adapta al traerlos.
- **💾 Guardar local, separado de ☁️.** 💾 guarda el envío **ya construido** en el dispositivo sin
  tocar la red (no lo tecleado: reconstruirlo podría dar otras filas). ☁️ envía primero lo guardado
  —lo más viejo antes— y después lo de pantalla; si lo guardado falla de verdad se para ahí.
  Vive en `larv4_mad_loc_<ficha>`, **no caduca**, y con 30 sin enviar 💾 se niega.
  ⚠ Un guardado que se hizo con un esquema anterior (la hoja ganó una columna en medio después)
  **ya no se puede enviar**: se detecta en el cliente, se dice, y la lista lo marca en rojo para que
  🗑 sea lo evidente. No se descarta solo — es trabajo que hay que volver a registrar.
- **Desoves · las fechas de N2 y N5 salen automáticas, pero se pueden editar.** N2 lleva la del
  desove y N5 la del día siguiente; vienen puestas y **siguen** a la del desove hasta que alguien las
  toque, y entonces quedan **fijadas** (fondo amarillo, como la fecha de aplicación de Fin de Ciclo).
  Cada una se escribe **sólo junto a su cifra**, y el candado «N5 exige N2» mira la CIFRA, no la fecha
  —que viene puesta de oficio en todas—. Una fecha tecleada se valida como **día real**: `2026-02-31`
  pasa el patrón y no existe.
- **Fin de Ciclo · la fecha de aplicación** sale igual que la del registro y la sigue salvo que se
  cambie a mano. Mismo mecanismo `data-fijo`.
- **Inf. Supervisor** (`Maduración Mortalidad Desove`) lleva TRES cosas en la misma hoja: mortalidad
  de hembras, revisión de nauplios (una fila por revisión) y **alcalinidad por área, de día y de
  noche** — en la MISMA fila del área, así que anotar la de noche horas después no pisa la de día.
  ⚠ Fototropismo y Aireación llevan su PROPIA lista de valores aunque hoy coincida con la de
  Actividad: compartir el array haría que retocar una cambiara las otras dos en silencio.
- **Tanques · las observaciones son de multiselección** y llegan a la hoja **en el orden del
  catálogo**, no en el de marcado: si no, contarlas después sería imposible.
- **Salas · «Toneladas»** son las de CADA tanque, y el valor por defecto **se pre-rellena, no se
  impone**: manda lo que hay en la celda, un 0 incluido, y un defecto que nadie tecleó no cuenta como
  registro. Mandan las cifras del catálogo, no las del Excel de un módulo concreto.
- **Los botones lentos leen en PARALELO.** Medido contra el GAS vivo: 13,5 s → 3,4 s.

### Otras que han costado caras

- **Población / Supervivencia = 0 es un valor REAL** (tanque vaciado o agrupado): se honra el 0 en
  vez de arrastrar el valor previo.
- **Microbiología:** los niveles se RECALCULAN desde el UFC con los umbrales por área × parámetro.
- **El analista, en una sola grafía, CON tilde.** La captura canoniza al guardar y el tablero pliega
  al leer, así que las filas ya escritas **no se migran**. Un nombre fuera del catálogo se respeta.
- **Biomol:** el tope del cliente y el del GAS **no pueden ser el mismo número**; la prueba exige la
  desigualdad, no el valor.
- **Un tope de espera a `?p=ver` tiene que contar con el arranque en frío de Apps Script.** Medido:
  2,5–4,9 s en caliente, 10,8 s la primera llamada.

## Pendiente

> Lo que depende del despliegue **se comprueba contra el despliegue**, no se lee de aquí. Esta lista
> ya ha estado equivocada dos veces por describir un estado en vez de apuntar dónde mirarlo.
> 🔍 Para medir el estado real: `node estado-maduracion.mjs` (sólo lectura).

**Bloquea producción**

1. 🔴 **La cadena, en este orden:** `git push` → re-desplegar `GAS/Code.gs` en Apps Script
   (publicando una **versión nueva**; guardar sin publicar no cambia lo que sirve el Web App) →
   ⚙ Config → «🔗 Probar conexión». Mientras los dos primeros no estén hechos, **las fichas de
   Maduración que comparan el sello no envían**. ⚠ Copiar el `Code.gs` de la app al día o del repo:
   una copia antigua de la app lleva un GAS viejo.
2. 🔴 **El token compartido.** `SHARED_TOKEN` está vacío: la escritura sobre las hojas de producción
   sigue siendo anónima. Se activa desde el panel de Apps Script (Propiedades del script), sin tocar
   código, pero el código que lo lee tiene que estar desplegado.

**Decidido, a la espera del usuario**

3. **Vaciado de las hojas de Maduración** salvo las del reproductivo: lo que hay son datos de prueba.
   Mientras no se haga, `Maduración Ingreso` y `Maduración Lotes` **rechazan** por su cabecera vieja,
   y eso es lo esperado, no un fallo. Es el momento de retirar las tres columnas vacías de
   `Maduración Tanques`, cambiando `madKeyCols` **en el mismo despliegue** (la Hora y el Parte de la
   llave se correrían de posición con ellas).

**Abierto**

4. **`Maduración Transferencias` sigue sin estrenar**: la ficha está escrita y probada; la hoja nace
   con el primer traslado, y hasta entonces el panel se dibuja vacío, que es lo correcto.
5. **Microbiología · Patología en fresco** espera a que los usuarios estrenen su hoja.
6. **Paridad · las funciones que sólo se comparan por NOMBRE** entre `engine.js` e `index (8)`
   (el repo delega en `__rgLib`, el gemelo las lleva en línea). Es el único hueco de la paridad; su
   número lo dice `verificar-3copias-v3` al correr («delegación __rgLib»).
7. **La CI no vigila `index (8)`**: `deploy.yml` corre lint, vitest, auditorías y build, pero ninguno
   de los verificadores de copias, que viven fuera del repo. La paridad depende de correrlos a mano.
8. **Control Broodstock · decisiones del usuario:** las notas de texto bajo la tabla ¿sólo se enseñan o
   van a la Observación de la piscina que nombran?; re-subir una semana ¿debe borrar las piscinas que ya
   no vienen?; una última columna de pesos distinta del corte ¿bloquea o avisa (hoy avisa)?; el origen
   «902ch» de julio ¿se parte en piscina y camaronera?; ¿se carga el histórico de julio?
9. **Carga volumétrica de la Sala 5:** usa 13 t para todos sus tanques, y los de 27 m² son más pequeños
   que los de 40. Hace falta el volumen de cada tipo para no subestimarla en los pequeños.

**Una vez, a mano, en la hoja**

10. **MATRIZ · la columna «Número» con aspecto de fecha.** Un GAS anterior le daba formato de fecha
    (un 7 se veía «06/01/1900»). El GAS actual ya no lo hace, pero las celdas escritas conservan el
    formato: seleccionar la columna → Formato → Número → **Automático**. El dato no cambió.
