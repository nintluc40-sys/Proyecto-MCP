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

### `npm audit` avisa de 9, y se quedan · MEDIDO el 2026-09-21

`npm audit` da **9 avisos (3 moderate, 5 high, 1 critical)**. Los nueve son de **desarrollo**:
`dependencies` sólo lleva `chart.js` y `leaflet`, y ninguno de los paquetes señalados
—vitest, vite, esbuild, postcss, nanoid, js-yaml, brace-expansion— entra en el bundle. **Exposición
en producción: cero.** Antes de volver a abrir esto, esto es lo que ya se midió:

- **`npm audit fix` (sin `--force`) NO cambia ni un paquete**: 0 añadidos, 0 quitados, 0 cambiados
  sobre 142 auditados. ⚠ Y aun así npm imprime «fix available via `npm audit fix`» en cuatro de
  ellos: **ese mensaje engaña**, y es lo que hace que esto se re-litigue cada pocas semanas.
- Los **cinco** restantes sólo se cierran con saltos MAYORES —`vitest` 2.1.9 → 5.0.1 y `vite`
  5.4.21 → 8.3.0—, que es exactamente lo que la decisión **D-6** descartó: tres versiones mayores
  cada uno, con miles de pruebas y la puerta a producción encima, a cambio de nada en producción.
- La única vía que movería los otros cuatro es `npm update`, y **no es quirúrgica**: arrastra
  `happy-dom` 20.10.3 → 20.14.5 —la versión contra la que está MEDIDO el comportamiento raro del
  `<select>` pintado con `innerHTML`, del que dependen pruebas—, `@types/node` 25 → 26 y
  `undici-types` 7 → 8.
- ⚠ Trampa de medición, por si alguien la repite: **`npm ls <paquete>` no dice lo que hay
  instalado** sino lo que npm resolvería hoy (dio `js-yaml@4.3.2` cuando el fichero y el lockfile
  dicen `4.3.0`). Lo que instala la CI es el **lockfile**, y es contra él que audita `npm audit`.

## Vistas

- **Supervisor** (👁️): Vista Ejecutiva (tarjetas por módulo/corrida) → Resumen
  Operativo del módulo → Visualización del Tanque → Análisis Biométrico LARVIA.
  Incluye navegación táctil (botón "Volver" + migas), tabla "Producción Omarsa"
  (con columna **Dens. siembra** = promedio por tanque de siembra ÷ 28 ÷ 1000),
  estado de despacho ("Despachado"/"Despachando" excluyendo tanques agrupados/
  descartados) y modales: Comparativa de tanques, OM vs Tex, Desinfección,
  Biomol, **Microbiología** (Placa de agar + Tabla + Heatmap + Tendencias por corrida+módulo; el
  análisis **EM** de Larvicultura —pH, BA y levaduras, columnas que no son de ningún patógeno— no entra
  en ésas: va en su pestaña **🧪 EM**, con el último análisis, su evolución y la tabla, sin semáforo
  porque la ficha no les da rango)
  y **Trazabilidad** (desde la tarjeta "Días proceso": descarga en PDF las
  fichas del módulo —Calidad Larvaria, PLG, Población, Parámetros, Calidad de
  Agua, Despacho y Desinfección— con la información del Google Sheet, un PDF por
  tipo; el rango Desde/Hasta se prellena con el primer y último registro).
  En el Resumen Operativo, el KPI **👤 Técnico** va en una línea: el nombre abreviado, «…» si no cabe
  y el completo en el globo.
  Desde el registro de **Despacho** (su KPI «Rendimiento cosecha») se abre **Traslado en ruta**
  (`supervisor/traslado.js`): los camiones de esa corrida, sus insumos y check, oxígeno, temperatura y
  actividad parada a parada, y el recorrido en un mapa cuyos filtros —**Camión** y **Paradas**, que
  encuadra las elegidas— actúan sólo sobre el mapa. El tiempo tramo a tramo va CON SIGNO: una parada
  sellada antes de la salida o después de la llegada, o una hora que retrocede, se DICE en ámbar en su
  fila (antes salía como ~22 h); «En ruta» y «Puerta a puerta» no cambian.
  El registro de **🚛 Despacho** lleva también el **🎯 Score** de calidad de postlarvas (2026-10-03,
  `supervisor/score.js`): el KPI «🎯 Score promedio» con su interpretación y una tabla con la ÚLTIMA evaluación de cada
  tanque —de cada corrida y tanque con «Todas las corridas»—, de la hoja `Registro_Score` (la ficha del AsT, en
  Registros). Y cada módulo tiene su acción **🧾 Auditoría (N)** (`supervisor/auditoria.view.js`): lee la hoja
  `Registro_Auditoria` —también la del módulo con el que una transferencia lo une, en las dos direcciones— y pinta, por
  corrida y la más reciente primero, el MISMO resumen que la ficha (`resumenAuditoria`, en `supervisor/auditoria.js`:
  copia de `audResumen` del monolito, con una prueba de paridad que ejecuta los dos) y el cruce con Datos Larvicultura
  —el sembrado del N5 y la última población de 🚛 Despacho—, sólo informativo. Las dos hojas se reconocen por su nombre
  y, sin título, por sus columnas, antes de que las reclamen Patología en Fresco o Larvicultura.
- **Larvicultura** (🦐): calidad larvaria — radar, evolución diaria, heatmap,
  ICL, ranking, población por tanque y modales Comparar/Historia/Decisión.
- **Revisiones** (🔍): hoja `Registro_Supervisión` — calidad, morfología
  ⚠ **No confundir con «🔍 Revisiones del supervisor»**, sub-vista del tablero de Maduración. Fue el
  tercer par de homónimos del proyecto (tras los dos «ICL» y las dos «Fase»), y el único que se
  deshizo: la de Maduración era nueva y no había costumbre que romper. Ésta se queda así.
  cuantitativa (% Atraso / Protusión / Deformidad / No viables), treemap,
  Sankey hallazgo→acción, cobertura por supervisor y mapa de cobertura
  módulo×día (cada día clicable abre los registros).
- **Algas** (🌿): `Lab_Algas` por sistema (Masivos/Premasivos/PBR/Fundas/Carboys),
  con filtro de módulo, curva de crecimiento conmutable
  (Líneas/Normalizado/Mini-curvas/Heatmap), parámetros fisicoquímicos, sanidad,
  Índices del mes y export Excel por rango de fechas.
- **Visitante** (🚪): resumen mensual en lenguaje llano (supervivencia, sanidad,
  microalgas) mediante tarjetas que abren ventanas de detalle. Con datos de Maduración, el bloque
  **🥚 Maduración**: los nauplios (N5) producidos por lote y por sala, con las MISMAS funciones del
  tablero —un desove cuenta en las salas donde estaba su lote la víspera o ese día, así que un lote que
  se mudó cuenta en las dos y el detalle avisa de que las salas no suman el total—; el mes es el de
  calendario del desove, y el módulo (`visitante/maduracion.produccion.js`) se carga diferido. Los dos
  detalles llevan la **fertilidad** (2026-10-02) con la regla del tablero —N2 ÷ huevos, sólo de los desoves
  que traen los dos; «—» si ninguno— y el de lotes dice la del mes y de cuántos desoves sale (casi
  ninguno trae sus huevos contados).
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
  La barra de mes de General, Bacteriología y Calidad de Agua acaba, tras el último mes, en
  **📅 Todo el registro**, y una muestra SIN corrida (Maduración, Algas, Otras) va al mes de su fecha
  de muestreo (`monthIndexOfDate`: aproximado, y la barra lo dice) en vez de repetirse en todos los
  meses (2026-10-01). Calidad de Agua trae **Sulfuros** (mg/L, sin rango por defecto) en la ficha de
  Larvicultura, en la de Maduración y en los tres de agua de Maduración, y en su tablero: en la hoja es
  la columna 49, AL FINAL —el GAS añade la cabecera solo—, y Sulfato es la 48 que ya usaba Algas.
  **La auditoría de la vista** (H-002…H-016, 2026-10-03): el KPI «Σ UFC total» ya no suma los conteos AGREGADOS
  —Bact. Totales lo inflaba ×3,7— (H-002); la luminiscencia cuenta sólo con presencia o ausencia explícitas (H-016);
  alertas y reporte TXT dicen el Módulo o la Sala, no «MCIO» ni «M—» (H-009); los rangos viven en cada navegador, y
  «⚠️ Umbrales modificados en este equipo (N)», junto a «⚙️ Rangos» de Bacteriología y de Calidad de Agua (abre ese
  editor) y en un aviso de Visitante, lo dice (H-003); el Excel de Bacteriología añade al final el nivel de la VISTA,
  por patógeno y el peor de la muestra (H-010); las cabeceras de cada patógeno se calculan una vez —`meltRow`, de 624 a
  75 ms sobre la hoja real— (H-004); la carta de control es de individuos (I-MR, σ por rango móvil, en orden de fecha) y
  de UN proceso —la ubicación sin el estadío; con varios, avisa de elegir uno— (H-005); la «cinética» se rotula como
  tendencia de la suma diaria en % por día, sin tiempo de duplicación (H-007); el WQI dice sobre cuántos parámetros con
  rango se calcula (H-008); el PDF de la Placa firma con una línea por cada analista del día (H-006); las colonias van
  en escala fija de 10⁰ a 10⁷ UFC, también en la Placa del Supervisor (H-012); ejes y leyendas de todos los gráficos
  toman el color del tema (H-013); las pestañas llevan `aria-selected`, foco itinerante y ← → Inicio Fin (H-014); y las
  fechas del rango van por `parseAnyDate`, con las cotas del % de alerta en `config.js` (H-015). El PDF de la Placa
  lleva la UNIDAD en el título de cada tabla —agua UFC/mL, animal UFC/g, hisopados y placa ambiental UFC/placa;
  Muestras externas y el Despacho de Maduración según su tipo, y sin él «UFC»— (`unidadUFC`, en `data.js`; H-011,
  2026-10-04): una tabla nunca mezcla dos unidades. La ficha de captura sigue rotulando «UFC/mL».
- **Maduración** (🥚): una entrada con DOS familias (selector interno; abre en Operativo).
  - **📋 Operativo** — el TABLERO del registro operativo, cargado DIFERIDO. Barra de filtros común
    (período —con **Rango** (2026-10-03): desde la fecha elegida hasta la foto, que es su «Hasta»— · foto al día ·
    sala → tanque · lote → código · estado · sexo · piscina · camaronera, con los
    activos como etiquetas quitables) y sus sub-vistas (la lista viva es `SUBS`, en `operativo.view.js`):
    **📊 Estado actual** (siete indicadores; el mapa de planta, que se colorea por el lote, por el tanque o por
    sus partes —los modos viven en `MODOS_MAPA`— y abre bajo él el LIENZO del tanque pulsado; las alertas, con
    📉 Tendencias y ⏳ Permanencia; últimos registros y ⏳ **Cuarentena por lote y sala**, una barra por par con su
    fecha de ingreso —la de la sala, y la del lote si entró antes en otra—), **🏠 Salas** (tarjeta por sala y su detalle
    —con la hora de su último parte—,
    con la temperatura y el oxígeno por hora de UN día —«Día», por defecto el de la foto, con ◀ ▶— o del período
    entero —«Período»: el mapa de calor y las líneas por día—),
    **🧬 Lotes** (tabla maestra —con el peso ♀ y ♂ de cada lote, el del ⚖️ Saldo al cierre de la foto—,
    ficha de un lote —origen, CASCADA DEL CUADRE, curva de vivos y reproducción—,
    comparativa por lote, código genético o piscina —por código y por piscina, cada lote con el origen de su Ingreso:
    sus parejas «juntas» (la fila «A/B», por defecto) o «separadas» (los desoves de la pareja, enteros en cada uno y con
    «*»), con el ingreso ♀ y ♂ junto a los ingresados y la edad —por código y por piscina, el rango de la de sus
    lotes (2026-10-02; hasta ese día salía vacía)— y, debajo, **📈 Piscinas de origen** (su desempeño es esa misma comparativa, «separadas», de todo el registro):
    el Broodstock del
    último corte con los lotes que entraron de cada piscina y, al pulsarla, su ficha con el peso por semana), **💀 Bajas** (muerte natural frente a descarte,
    desglose cruzado por sala · tanque · lote, Pareto de motivos de cierre, distribución por hora, calor
    sala × día y lotes cerrados), **🔍 Revisiones del supervisor** (nauplios en sus 4 etapas, alcalinidad por área día y
    noche, mortalidad en desove y recuperación —con la temperatura del tanque de desove: la última y la media del período,
    avisando por encima de 40 °C—, y frecuencia de observaciones de tanque), **🛢 Tanques** (tabla
    maestra de los ocupados —con el día y la HORA de su último parte— y, al pulsar una fila, su ficha:
    composición, curva de vivos, partes con su hora,
    observaciones y movimientos), **🥚 Reproducción** (totales, los desoves pendientes de N5 arriba, la tabla
    por lote —al pulsar un lote, sus N2 y N5 por destino, de más a menos N5— y «A dónde fueron», plegada con
    los tres primeros destinos y con «**Dividir el N5 de cada destino por**» lote, código genético, piscina o fecha de
    N5 (2026-10-03; lote, código y piscina tal como los dice la hoja, y lo de un desove con varios destinos, entero en
    cada uno y marcado «*»)), **🔄 Manejo** (movimientos en matriz sala → sala con su registro debajo, y los
    tratamientos: calendario sala × día, productos por área y cobertura preventiva por lote), **🦐 Alimentación**
    (la ración PLANIFICADA por producto frente a la agenda estándar, con cada toma juzgada con el rango de la
    ficha, y de dónde sale el peso de la ración) y **🩺 Calidad del dato** (las hojas y su calendario, los partes esperados —uno por tanque ocupado— frente
    a los registrados —cada fecha y cada celda abren la ventana de ESE día: cobertura por sala, los partes tanque a
    tanque y los de tanques que el libro tenía vacíos, marcados «no esperado»—, el estado registrado de cada sala frente al propuesto, los avisos del libro y el cruce
    con 🧬 Microchips, que marca sólo lo que no puede ser y se hace con el libro de HOY).
    ⚠ **Lo que NO se juzga** se enseña tal cual, rotulado «sin criterio»: deformidad, actividad,
    fototropismo y aireación. Sólo llevan veredicto salinidad > 60 ‰, temperatura > 40 °C, hongos
    «Presente» y la alcalinidad — el resto no tiene fuente que lo respalde.
    🔑 **Las reglas del mapa y de las alertas nuevas** (0f · 2b y 3, decididas por el usuario el 2026-09-25):
    📉 Tendencias compara el período elegido con el anterior de igual duración y avisa desde un cambio del
    20 % con 3 registros (umbrales editables, «fuente: usuario»); ⏳ Permanencia, más de 60 días en
    producción contados desde el fin de la cuarentena. En el mapa, la mortalidad es POR DÍA DE PARTE y las
    cópulas se dividen entre las hembras del tanque ESE día (la regla del Saldo); dos lotes en un tanque van
    rayados, y dos códigos son su propia categoría (la pareja). Un dato IMPOSIBLE de los partes —más cópulas
    que hembras, o cópulas un día sin hembras en el libro— se enseña MARCADO: no se esconde ni se corrige.
    En tema claro el número de cada tanque va oscuro (≥ 4,5:1); en tema oscuro, blanco.
    📈 **Los gráficos** (0q, 2026-09-27): ejes de 12 px en el color de texto del tema, barras sólidas, líneas
    rectas; en los de días, una raya marca el día y el globo va arriba a su lado (`arribaJunto`, en
    `core/charts.js`), y con «reducir movimiento» no se animan. Todos pasan por `graficoOp` (o
    `graficoDispersionOp`, los de puntos) en `operativo.view.js`.
    🦠 / 🧬 **Las dos sub-vistas del laboratorio** (pastillas de la sub-nav tras 🖨 Reportes; hasta el 2026-09-29,
    ventanas) traen **sus propios filtros** —Mes · Lote · Sala · Piscina · Sexo, sobre TODO el registro; al entrar
    empiezan con la sala, el sexo y el lote del tablero, cuya barra no enseñan porque no les aplica—:
    **🦠 Microbiología y agua** (① reproductores: al escoger un patógeno, sus UFC muestra a muestra en
    escala logarítmica, la mediana semanal y los umbrales Moderado/Elevado; ② desinfección; ③ agua y RAS por
    formato —cada uno con sus umbrales— y la calidad de agua por parámetro con su rango) y **🧬 Biomol ·
    reproductores** (prevalencia, tabla lote × patógeno sombreada, la tendencia semanal del patógeno escogido
    con sus muestras analizadas, y Maduración por tipo de muestra —Heces, Branquias, Pleópodo, Agua,
    Hisopado, de la columna «Otros»—). La piscina de una muestra es la que dice o, en Microbiología, la de su
    lote en Ingresos; una combinada («P554/556») cuenta en las dos. Las cuentas, en `operativo.laboratorio.js`.
    🌊 **Mareas** (0r, 2026-09-28), la sub-vista que sigue a 🦠 y 🧬: lo MISMO que el modal de Larvicultura, en el sitio
    —Día y Mes (la Correlación se queda en Larvicultura); su marcado y su cableado viven una sola vez en
    `supervisor/mareas.js` (el modal, `cablearMareas`; la sub-vista, `cablearPanelMareas`), y leen la hoja
    «Marea»— con una pestaña propia, **🦐 Cópulas**: «Ver» cópulas o desoves, cada día (cópulas ÷ hembras de los
    tanques ESE día, la regla del Saldo; o desoves por 100 ♀) frente a la amplitud de la marea y la luz de la luna,
    con la r de Pearson y su umbral (2/√n), y una tabla por fase lunar con la cantidad y el %; filtros propios (mes,
    sala, lote, código genético, fase lunar —resalta sus días— y «sólo en producción»). Sin frases de conclusión:
    las cifras se recalculan con cada parte, y las definiciones van en un ⓘ. Un día sin NINGUNA cópula (o desove)
    registrado en toda la granja es un hueco del registro: queda fuera, y se dice. La luna se dibuja con la fase que
    dice la hoja. 🗓 **Calendario** (0v, 2026-09-29), entre Mes y Cópulas y sólo en Maduración: el mes de lunes a
    domingo, cada día con su luna dibujada, su % y su marea (viva o muerta) —un día que la hoja no trae sale en gris,
    «sin dato»: nada se calcula—; al pulsar un día, su panel debajo (lecturas, amplitud, la ola y la granja ese día:
    cópulas y desoves con las reglas de 🦐 Cópulas) y «Ver en 📅 Día».
    ⚡ **🦠 y 🧬** preparan sus muestras UNA vez por carga de datos —en reposo (`requestIdleCallback`), así que
    la primera entrada ya no espera; sin él (Safari), al entrar— y un clic dentro rehace SÓLO su contenido, no
    el tablero entero.
    🔑 **Una PAREJA de códigos** («C1/C2», como la escriben los Desoves) **cuenta como sus dos** en el filtro de
    código de todo el tablero: casan si comparten alguno (`codigoEnFiltro`, en `operativo.tablero.js`). «C1» trae
    también el desove de la pareja, que cuenta ENTERO en cada uno de sus códigos, como el despacho en cada destino.
    🔑 **La fertilidad (N2 ÷ huevos) y los huevos por desove sólo cuentan los desoves con sus huevos contados**
    (2026-10-01), en el ⚖️ Saldo y en todo el tablero, comparativa incluida: muchos desoves traen N2 sin «Total de
    huevos», y su N2 entraba arriba sin sus huevos abajo —salían tasas de más del 100 %—.
  - **🧬 Microchips** — seguimiento reproductivo por Trovan ID sobre
    las hojas `Maduración MATRIZ`/`Bitácora`/`Transferencias`.
    ⚠ **Es el REPRODUCTIVO. Hay otra «Maduración» distinta** —el registro OPERATIVO, por
    conteos— que no es una vista sino un grupo de fichas de captura: ver más abajo.
    Cuatro sub-vistas —
    **Panorama** (KPIs, distribución de estados activa/inactiva/transferida/fallecida,
    tendencias de desoves/mortalidad/fertilidad, top salas y tanques), **Salas y
    Tanques** (producción, fertilidad y eficiencia por ubicación + mortalidad),
    **Hembras** (ranking por desoves, buscador de Trovan, hembras que nunca han
    desovado, distribución del intervalo de recuperación e historial completo por
    individuo) y **🩺 Calidad** (comprobaciones del registro, con su contador en la pastilla).
    Filtros de período (mes o todo) + Sala + Tanque.
    *(0o y 0p, 2026-09-27: mapa de salas por bandas de tasa que filtra al pulsarlo, calendario de desoves
    tanque × día —sustituido el 2026-09-29 por «Hembras por su último desove»: las vivas de cada tanque en
    ≤ 7 · 8–21 · > 21 días desde su último desove, o que nunca desovaron—, línea de vida de cada hembra, familias, supervivencia por familia, alerta de reemplazo por
    tanque, la VENTANA de desove —no una fecha: acertar la fecha salía un 41 %—, la mortalidad tras el desove
    con su riesgo relativo y una tarjeta honesta sobre la marea, que no muestra efecto. Las reglas, en
    `src/views/maduracion/data.js`.)*
    ♻ **Un Trovan ID es de un CHIP, no de una hembra**, así que la MATRIZ puede tener varias suyas.
    Lo que identifica a un individuo es la **cuaterna** (Trovan · Piscina · Código genético · Lote);
    la regla vive en `src/core/trovan.js` y está detallada en «Reglas vigentes», más abajo.
    *(Hasta el 2026-09-16 la regla era otra —una hembra «sucedía» a otra si la anterior había muerto
    y la nueva ingresaba después—; se retiró entera, y con ella sus dos rechazos por fechas.)*
- **Planta** (🏭, 2026-10-04/06): el tablero de producción de **Gerencia** sobre la maqueta 3D del laboratorio
  (los módulos de larvicultura y las salas de maduración a escala del plano, en su entorno). El color de cada tanque
  es su estado —larvicultura con las reglas de la Vista Ejecutiva (`supervisor/etapas.js`, compartido), maduración con
  el «Estado» del mapa de salas—, con su ficha al tocarlo, balizas de alerta y «Qué atender hoy»; las cifras del mes
  (producción de «Producción Omarsa» frente a una **meta de 400 M editable** con ⚙, guardada en el equipo,
  supervivencia, nauplios y desoves) y el reemplazo de reproductores a los 60 días. El selector de mes mueve TODA la
  vista (un mes pasado, con las corridas de ese mes); un mes ya visitado no se recalcula mientras no cambien el libro
  ni el día. Un selector **«🏭 Maqueta | 📊 Análisis»**, que el equipo recuerda, cambia la maqueta por una página
  analítica SIN 3D (`planta/analisis.js`) con lo mismo: producción con su selector de mes y su meta, las cifras, «Qué
  atender hoy», módulos y salas en filas desplegables con su ficha y sus tanques, y los reproductores; los textos de
  los dos modos salen del mismo módulo puro (`planta/textos.js`), así dicen exactamente lo mismo, y three.js sólo se
  descarga en Maqueta. La maqueta baja su nitidez cuando va lenta, hasta la de la pantalla normal (1×), y la recupera
  cuando va holgada. Es del **rol Gerencia**, sin clave, que sólo ve esta vista; el
  enlace `…/?rol=gerencia` entra directo y el equipo lo **recuerda** hasta «Cambiar rol» (`ui/accesoRol.js`), y
  `…/?qr=gerencia` es la página con su **QR de acceso** («🔗 Compartir acceso»). Vive SÓLO en la web: **no va a
  `index (8)`** (excepción expresa a los dos destinos). `three` va FIJO en **0.128.0** y la vista queda **fuera de la
  precarga** (`ENTRADAS_FUERA_DE_PRECACHE` en `vite.config.js`): sólo la descarga quien la abre.
- **Registros**: fichas de captura (estrangulamiento gradual del monolito
  `public/registros/engine.js`) que escriben al Sheet vía Google Apps Script.
  Incluye el **registro operativo de Maduración**, que tiene su propia sección aquí abajo
  por ser lo único del sistema que además CALCULA.
  En el módulo **AsT** (As Técnico), junto a la supervisión, Traslado y Mareas, está **🎯 Score** (2026-10-02): la
  planilla «CONTROL DE CALIDAD POST - LARVAS - 12C» por tanque (1–12) —cada uno de sus 13 criterios, un toque entre
  sus 5 puntos; el Score es su suma (máx. 100) y la interpretación sale de los tramos de la planilla (95 · 85 · 70)—.
  Escribe en la hoja **`Registro_Score`**, una fila por tanque con los PUNTOS de cada criterio y un ID fijo (fecha ·
  módulo · corrida · tanque) el último: reenviar una evaluación la CORRIGE (el GAS la upserta sin merge). Un tanque
  sólo sale con sus 13 criterios, y lo marcado se guarda al instante en el equipo. «🧹 Vaciar TQ n» borra SÓLO el
  tanque en pantalla (decisión del usuario, 2026-10-04; «🗑 Nueva evaluación» vacía la entera) y «📄 PDF» imprime la
  evaluación en pantalla: A4 horizontal, una fila por tanque evaluado, con observaciones y firmas.
  Y **🧾 Auditoría** (2026-10-03): las planillas «AUDITORIAS (MES) Cxxx» de una corrida y su módulo como ficha —la
  **siembra** (origen, guía, cantidad, toneladas del tanque, lote, código genético y el ingreso de reproductores: su
  fecha y sus guías, tecleados), la **transferencia** origen → destino (cantidad, estadío, PL/g y % de larvas pequeñas)
  y la **cosecha** por partida con su despacho (camaronera, piscinas, guías de remisión y de despacho, cantidad real y
  **facturada**: el 90 % se PROPONE y se puede teclear otra, que queda marcada ★; tinas y placa)—. Escribe en la hoja
  **`Registro_Auditoria`**, UNA FILA POR EVENTO con su «Tipo» (Siembra · Transferencia · Cosecha), 29 columnas y un ID
  fijo el último (upsert sin merge); la corrida, los tanques, las piscinas, las guías y la placa van como TEXTO. El
  resumen se CALCULA y no se guarda: densidades con las toneladas de cada tanque, sobrevivencias, días, subtotales por
  siembra y despacho por camaronera (PL/g ponderado; camiones = placas distintas). Con transferencia, la cosecha de los
  destinos se atribuye a sus orígenes **en proporción a lo transferido**, rotulada «≈» (las planillas repartían a partes
  iguales); un tanque sembrado que además recibe atribuye toda su cosecha a sus orígenes (caso anotado: en las planillas
  los destinos eran tanques vacíos). Cambiar una celda pone al día lo calculado EN SU SITIO, sin rehacer la tabla
  —rehacerla perdía el Tab y el clic siguiente—. Como `Registro_Score`, la hoja la crea el GAS con su primer envío.
  Desde el 2026-10-04/05 (usuario) cada tabla se **pega como en Excel** —desde la celda elegida, añadiendo filas—: sin
  títulos, por el ORDEN de sus columnas; con su fila de títulos, **por NOMBRE** (los de la ficha, la cabecera de la hoja
  o los de las planillas AUDITORIAS), así que el bloque de una planilla se pega tal cual en cada tabla y cada una toma lo
  suyo. Se entienden las fechas como las copia Excel de las planillas («21-dic-25», «2-ene»: sin año, la más reciente no
  futura) y las listas con sus formas (1ra → 1ª, M3 → M03); lo no reconocido queda vacío y se avisa, y la Partida se
  recalcula. Enter y las flechas recorren cada tabla; «🧹 Vaciar» borra UNA tabla («🗑 Nueva auditoría», la entera) y
  «📄 PDF» imprime las tablas con filas, el resumen calculado, observaciones y firmas.
  🗂 **El histórico (F3, escrito el 2026-10-05):** las planillas de enero a mayo —29 auditorías, una por corrida y
  módulo— se importaron a `Registro_Auditoria` con el importador del utillaje (`f3-importar-auditorias.mjs`, que construye
  las filas con las funciones de la ficha y comprueba cada corrida contra la planilla y el MCP). Se reconocen por
  «Registrado por» = **«Importación F3»** y la planilla de origen en Observaciones; lo calculado no se importó (lo
  recalculan la ficha y el MCP) y el despacho, que va por guía y mezcla tanques, no se atribuye. Junio queda fuera
  hasta que sus planillas estén terminadas (la 573, hasta corregir sus fechas de siembra).

### Maduración · el registro OPERATIVO

> ⚠⚠ **No confundirlo con «Microchips».** Conviven dos «Maduración» y registran cosas
> distintas: aquélla sigue **individuos** con microchip Trovan y es una vista de lectura;
> ésta cuenta **animales** por sala/tanque/lote y es captura. No comparten hojas ni código.

Fichas de captura más una vista derivada (Saldo), todas dentro del módulo Maduración
de Registros. **Su interfaz vive ÚNICAMENTE en `public/registros/engine.js`** (y en su gemelo
autónomo `Music\index (8).html`), porque ese monolito no tiene módulos ES.
⚠ Ojo al buscarlo: la CAPTURA de este registro no tiene carpeta nativa. En **`src/views/maduracion/`**
están los dos TABLEROS de Maduración —el del reproductivo (🧬 Microchips) y, desde el 2026-09-19, el de
este registro (📋 Operativo, los `operativo.*.js`)—, que LEEN estas hojas y no escriben en ellas. *(Aquí
decía que esa carpeta «NO es esto» y que no había carpeta nativa para el operativo: era cierto antes del
tablero.)* Lo que sí tiene gemelo probado en
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
| ⚖️ **Saldo** | *(derivada)* | vista del libro mayor y resumen por sala y lote —sus PDF («🖨 PDF de todo» y el de cada sala o lote) en **dos presentaciones**, elegidas en ⚙️ Variables (usuario, 2026-10-04): la **estándar** en tarjetas y la **tabulada** «como el Último parte» (por sala, su franja y la tabla de sus tanques con su total —un tanque de dos lotes es UNA fila—; los lotes en tablas por tema; totales sólo de lo que se suma, los % en «—»; A4 horizontal)—, y «🖨 Último parte»: el PDF del último parte de mortalidad registrado en cada sala (la ronda de hora más tardía de la fecha, con todos sus tanques y los vivos del libro); no escribe |
| 🔄 **Movimientos** | `Maduración Movimientos` | el **tramo** origen → destino |
| 🥚 **Desoves** | `Maduración Lotes` | (fecha, lote, código genético) |
| 📋 **Inf. Supervisor** | `Maduración Mortalidad Desove` | (fecha, lote, código genético): mortalidad ♀ + una fila por revisión de nauplios |
| 🏁 **Fin de Ciclo** | `Maduración Fin de Ciclo` | (fecha, lote, motivo, sala si es Parcial) · Registro y sus pesos |
| 🧪 **Tratamientos** | `Maduración Tratamientos` | una fila por tarjeta: preventivo por lote o desinfección por área |
| 🍤 **Alimentación** | `Maduración Alimentación` | (fecha, sala, tanque): agenda de tomas y ración calculada |
| 📈 **Broodstock** | `Maduración Broodstock` | (fecha de corte, piscina): la carga SEMANAL del Excel del área |
| 🏠 **Salas** · 🛢️ **Tanques** | `Maduración Sala` · `Maduración Tanques` | la grilla diaria; en Tanques, cada ronda de mortalidad es un **parte** con su hora |
| 📜 **Historial** | *(lo enviado desde ESTE equipo)* | cada envío de las fichas de formulario y de Salas/Tanques: revisarlo, 📄 PDF, 🗑 y ✏️ corregirlo (ver «Las fichas de Maduración»); no escribe por sí mismo |

**Todas guardan un BORRADOR POR FECHA en el dispositivo (2026-09-15).** Salas y Tanques ya lo
hacían por ser grillas —su lista local lleva la fecha dentro de cada fila—; desde esa fecha las
siete fichas de formulario también. Se guardan los últimos **30 días** por ficha. Es lo tecleado en
ESE dispositivo, no lo que hay en la hoja. (📈 Broodstock no lleva borrador: no se teclea, se carga
un archivo que sigue en el equipo de quien lo sube.)

🔴 **Y la FECHA con algo tecleado (2026-09-24, decisión del usuario).** Cambiar la fecha escondía lo
tecleado bajo la anterior —«se borra todo»—, y en las siete fichas el borrador sólo se guardaba al
cambiar la fecha (no al cambiar de pestaña, como aquí se decía) y no volvía al abrirlas: recargar la
app lo perdía. Desde ese día, en las siete fichas y en las grillas de Salas y Tanques:
- lo tecleado se guarda **al teclear** y vuelve **al abrir** la ficha; una ficha sin tocar no se
  guarda nunca (pisaría el borrador de su día);
- al cambiar la fecha, si lo de pantalla es **trabajo nuevo** (su día no tenía nada guardado al
  abrirlo) y el día elegido tampoco tiene nada, **se lleva** al elegido; si no, **se pregunta**
  (Aceptar lo lleva; Cancelar lo deja en su día y enseña el elegido); sin teclear nada, la fecha
  enseña lo guardado de cada día, como antes;
- en las grillas, lo **ya enviado no se mueve** (la hoja lo tiene con su fecha); en Tanques la ronda
  llevada es un **parte de ese día** —los partes cerrados son otras rondas y no cuentan como
  conflicto— y conserva la hora con que se abrió.

🔴 **Y la fecha que puso la APP en las grillas se renueva sola (2026-09-30, decisión del usuario).**
Salas y Tanques se pintan con la fecha que ya tiene su campo (un repintado no pierde el día elegido),
y con la app abierta de un día para otro la ronda de la mañana acababa guardada con la fecha de ayer.
Desde ese día, la fecha que puso la app —no la que alguien eligió— pasa a **hoy** al repintar la
grilla o al volver a la app, **desde las 02:00**: la lectura de las 0:00 de Salas, que se teclea
pasada la medianoche, sigue yendo al día que termina; por lo mismo, si la app se **abre o se
recarga** entre las 00:00 y las 02:00, la grilla arranca en el día que termina. No se mueve nada a
medio teclear; y en Tanques, un parte que quedó **abierto** del día anterior (el 🔄 lo envía sin
cerrarlo) se **cierra** al renovar —lo no enviado sigue pendiente, con su fecha y su hora—, para que
la ronda de la mañana no se escriba encima de la de la noche. Una fecha elegida a mano se respeta, y
la grilla dice **«⚠ no es hoy»** mientras su fecha no sea la de hoy.

En **🛢️ Tanques**, los pesos ♂ y ♀ **bajan por su columna**: al teclear uno se copia a las filas
de abajo que tengan animales vivos. Las observaciones sanitarias y operativas bajan igual (a todas
las filas), y la salinidad y la temperatura de la Revisión de nauplios de Inf. Supervisor también.
**Cambiar una fila que tenía el valor copiado sólo cambia ESA fila**: se marca en amarillo, no baja,
y las de abajo conservan el primer valor; corregir la primera arrastra sus copias, no las marcadas
(usuario, 2026-09-24). Lo que ya estaba —guardado, pegado o de antes de repintar— no se pisa nunca:
la bajada sólo rellena filas vacías o copias. Cada ronda de mortalidad
del día es un **PARTE** con su número y su **hora**, que pone el sistema al abrirlo y es la misma para
todos sus tanques: guardar otra vez el mismo parte no lo duplica, y el último del día se puede reabrir.
Sólo el último, sin otro abierto y desde el dispositivo que lo registró: uno anterior se corrige en la
hoja (decisión del usuario, 2026-09-18).
La hora va en la llave del GAS, así que se guarda como TEXTO (Sheets convierte «08:30» en una hora).
*(2026-09-30, usuarios: «partes duplicados en la hoja».)* El número de parte lo cuenta **cada dispositivo**
(y la app de Pages y `index (8)` como archivo son dos), así que la misma ronda dada desde dos llega con
dos partes. Antes de enviar Tanques (☁️ o 🔄), la app lee la hoja fresca y, si el mismo tanque ya tiene
las mismas bajas —o las mismas cópulas y muda— en **otro** parte de la última hora, **pregunta**;
«Cancelar» lo deja pendiente sin borrar nada. «↩ Recuperar» ya no reinyecta lo guardado, y una fila
enviada no vuelve a pendiente si no cambió. En `index (8)` como archivo sólo se puede leer por el GAS,
que tarda ~35 s: con el tope de 15 s el aviso no llega a salir y se envía como antes.
*(2026-09-30, noche, decisión del usuario.)* En la grilla, **borrar una cifra la corrige**: en el parte que se
está pintando, una celda vaciada se guarda vaciada —las de conteo (muertes, descartes, cópulas, muda) como
**0**, que corrige también en la hoja un parte ya enviado; pesos y observaciones, vacíos (en un parte ya
enviado, la hoja conserva el valor anterior: se corrige allí)—; antes, tras un autoguardado, la cifra
borrada se seguía enviando. Y **«🗑 Borrar sala» borra sólo lo NO enviado**: lo enviado se conserva y su
parte, si seguía abierto, se cierra; la numeración sigue, y para corregirlo está «✏️ Reabrir el parte».
*(2026-10-01, auditoría de Maduración.)* Si el parte que pinta la grilla **ya se envió** (el 🔄 lo envía sin
cerrarlo), la grilla lo **avisa**: lo que se teclee lo corrige; para una ronda nueva, 💾 primero. Y en
**🏠 Salas**, borrar una lectura también la corrige; si esa fila ya estaba en la hoja, la app avisa de que
allí sigue (el GAS no vacía celdas) para borrarla a mano.
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
fracción pasa a %, y un «120.pl» son **Pl/g**, no gramos. Densidad, días, edad, incremento y crecimiento
se RECALCULAN. Un libro trae una hoja por semana: se marca sólo la más reciente (el histórico de julio
**no se carga**: decisión del usuario). Subir otra vez la misma semana **reemplaza** las filas de las
piscinas que vienen con datos; las que no vienen, o vienen sin datos productivos, **ni se borran ni se
suben**. Decisiones del usuario del 2026-09-18:
- Las **notas de debajo de la tabla** van a la **Observación de las piscinas que nombran** (por número
  entero y sólo piscinas de esa tabla; a una piscina sin datos, no). Se leen sólo en el ancho de la tabla:
  los libros de julio traen a la derecha bloques auxiliares de cálculo que no son notas.
- El origen de julio con la camaronera pegada («902 ch», «903ch») se separa en **piscina de origen** y
  **camaronera** (`MAD_BS_SUFIJO_CAMARONERA`: «ch» = Chongón). No pisa una camaronera que venga en su
  columna, y un sufijo que no esté en la tabla no se adivina. El área pedirá las dos columnas por separado.
- Una última columna de pesos distinta del corte **se avisa**, no bloquea.
- Sube el Excel **cualquiera que entre al módulo de Maduración**.

**El Saldo estima la carga de cada tanque:** la **métrica en g/m²** —la biomasa (♀ + ♂ con sus últimos
pesos) entre el ÁREA del tanque (`MAD_TANQUE_AREA_M2`: una por sala, y la Sala 5 tanque a tanque)— y la
**volumétrica en kg/m³**, entre las toneladas de un tanque de su sala. Sin área o sin pesos, vacía.
(La Sala 5 lleva 13 t en todos sus tanques, también en los de 27 m²: confirmado por el usuario el 2026-09-18.)

**El libro mayor** (`src/views/registros/lib/mad-libro.js` + su gemelo inline) responde
*«¿cuántos animales hay vivos ahora en cada tanque y en cada lote?»*. Nadie teclea un saldo:
se DEDUCE de `+ ingreso − bajas ± movimientos − la diferencia de un cierre Total`: lo que declara
🏁 Fin de Ciclo es sólo registro, porque esos animales ya salen por las bajas (muertos y descartes)
de los partes de 🛢 Tanques. El objetivo no es que la
cifra cuadre siempre, sino que **cuando no cuadre se vea el mismo día**. Con la opción
`hasta`, el libro se construye **al cierre de un día**: es lo que usa «🔄 Proponer estado» de
Salas, que propone —y al guardar escribe— el estado de la fecha elegida en la ficha.
Una sala **sin animales** es `Desinfección`, y en «Estado por lote» dice sólo
`sin ingreso - Desinfección`; una en producción con los animales **agrupados** en la mitad de sus
tanques o menos es `Desinfección - Producción agrupada` en las dos columnas; si no, el desglose
por lote (usuario, 2026-09-14 y 2026-09-24). Son estados de la SALA, nunca de un lote. Una sala que
el libro **no conoce** no se toca: sus dos columnas se quedan como estaban.
«🔄 Ver saldo de los orígenes» de Movimientos y «🔄 Ver vivos» de Tanques dicen lo mismo de cada
tanque —una sola función escribe las dos celdas—: **el lote o lotes que lo ocupan, delante de las
cifras** —`AB · 12♂ 34♀ · 46`; mezclado, `BA+BC · …`, el nombre de la columna «Lote(s)» del
Saldo— (usuario, 2026-09-24). Un tanque vaciado no lo ocupa nadie: `0♂ 0♀ · 0`.
🔒 **En Tanques, un tanque SIN ANIMALES se bloquea** (usuario, 2026-10-04): con la referencia de vivos que haya —la de 🔄 o
la última guardada en el equipo, aunque sea de otro día—, un tanque con 0 vivos o «sin ingreso» va en rojo y con sus casillas
deshabilitadas; tras un ingreso o una transferencia, 🔄 Ver vivos con cantidad lo habilita. Sin desbloqueo a mano; sólo en la
fecha de hoy (también entre las 00:00 y las 02:00, el día de trabajo de la grilla); un tanque que ya trae cifras no se
bloquea (va en ámbar, avisado); y sin referencia o con el libro incompleto no se bloquea nada (`_madTqAplicarBloqueo`).

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
  **Un cierre Parcial puede indicar la sala (D14)**, que queda como dato de dónde salieron; un Total
  es siempre del lote entero. **Ningún cierre resta lo que declara**: el Total cierra el lote y anota
  como **diferencia** lo que el libro aún tenga tras los partes del día, y el cuadre de 🧬 Lotes lo
  enseña aparte («Registrado en Fin de Ciclo», fuera de la resta). Los **pesos** (promedio y total de machos y hembras) son del registro entero —se
  pesan juntos todos los lotes— y se escriben iguales en cada fila con el mismo **«Registro»** (un
  identificador por formulario): para no multiplicarlos, se leen una vez por Registro.

⚠ **Las llaves del GAS mandan sobre el diseño de estas hojas.** `Maduración Sala`,
`Tanques` y `Lotes` se identifican por POSICIÓN (`[0,1]`, `[0,1,2,13,14]` —Fecha, Sala, Tanque,
Hora y Parte— y `[0,1,2]`), igual que `Broodstock` (`[0,1]`, Fecha de corte · Piscina, que además
REEMPLAZA en vez de fundir), así que mover una columna de las primeras destruye datos en cada
sincronización; `Ingreso`, `Movimientos` y `Fin de Ciclo` van por la columna `ID`, que el GAS
localiza por su cabecera.
✅ **P12 (2026-09-20): `Maduración Tanques` YA NO conserva las tres columnas vacías.** Durante meses
llevó `Lote` y las dos `Población inicial` viajando en blanco porque quitarlas habría corrido la
llave; se retiraron **en el mismo cambio** que bajó `madKeyCols` de `[0,1,3,16,17]` a `[0,1,2,13,14]`,
movió la firma de la columna 15 a la 12 y el formato de la `Hora` de la 17 a la 14. El cliente y el
`Code.gs` emiten las **15**, y el 2026-09-21 se desplegó el GAS y se recortó la hoja: comprobado después,
la cabecera es la del código, los datos no se corrieron y la `Hora` sigue siendo texto. Cómo está hoy
lo dice `estado-maduracion.mjs`. 🔑 La cifra de esta línea es la del código: `madKeyCols` en `GAS/Code.gs`.

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
    sheets.js              Motor Google Sheets: XLSX-first + respaldo hoja a hoja + clasificación
    sheets.worker.js       La descarga y la lectura del libro (y su respaldo) en un Web Worker
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
    accesoRol.js           Rol por enlace (`?rol=gerencia`) y el rol RECORDADO en el equipo
  views/
    supervisor/            Ejecutiva · módulo · tanque · larvia · despacho · traslado · omtex · compareTanks
    larvicultura/          Radar, evolución, heatmap, registros, ICL, ranking, modales
    revisiones/            Calidad, morfología, treemap, Sankey, cobertura
    algas/                 Subvistas por sistema, curva, fisicoquímicos, índices, export
    visitante/             Resumen mensual en lenguaje llano + microalgas + producción de Maduración
    biomolecular/          D3 (heatmap/treemap/swarm/sankey/E.D.T.) + reporte + export
    microbiologia/         data.js (capa pura) · index.js · petri.js (placa de agar SVG)
    maduracion/            🧬 Microchips (el REPRODUCTIVO, por Trovan) y el TABLERO del registro
                           OPERATIVO (operativo.*) · ⚠ sus FICHAS de captura NO están aquí: ver engine.js
    planta/                🏭 Gerencia: maqueta 3D (escena.js, three.js) · 📊 Análisis sin 3D (analisis.js) ·
                           textos (lo que dicen ambos) · meta · plano · estado · cifras · qr/ (acceso)
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
- Los bloques **diferidos** (Registros, Biología Molecular, el tablero de Maduración, el Worker
  de lectura del libro) no salen en `index.html`: el build escribe la lista de TODO `assets/`
  en `precache-assets.json` (`vite.config.js · listaDePrecache`) y el worker los guarda también
  al instalarse (`assetsDelBuild`, 2026-10-01). Sin eso, tras un despliegue, un equipo que no
  abriera Registros con red no podía abrirlo sin señal. La lista sale del bundle DEFINITIVO (`generateBundle` con
  `order: 'post'`, 2026-10-03): antes se escribía antes de que `vite:css-post` borrara los trozos de sólo-CSS, y
  anunciaba un `leaflet-*.js` que no existía (404 en Pages).
- **La instalación tiene tope: 3 min** (`TOPE_INSTALACION`, 2026-10-01). El navegador da por
  fallida una instalación que pasa de 5 min y BORRA el registro: con señal pésima el equipo se
  quedaba sin modo sin conexión (medido en la app publicada; reproducido en local con una descarga
  colgada: sin registro a los 306 s). Al cumplirse, se cortan las descargas en vuelo —todas las
  peticiones de la instalación llevan esa señal: después no sale ninguna más— y se instala con lo
  guardado; lo que falte lo guarda el `fetch` cuando se pida con red. Además pide con
  `cache: 'no-cache'`: revalida con el ETag (304) lo que la página acaba de bajar en vez de
  repetirlo (medido en local, sin compresión, a 40 KB/s: 2,9 MB en vez de 5,2), y no vuelve a
  pedir los `assets/` que ya guardó un intento anterior.

## Flujo de datos (Google Sheets)

0. **Arranque sin espera** (2026-10-01): la pantalla de roles responde al instante; el libro se
   pide al entrar en la PRIMERA vista que lo necesita (todas salvo Registros, que declara
   `necesitaLibro: false` y lee lo suyo por el GAS) y, mientras llega, esa vista enseña un aviso
   de carga —o el fallo, con ⟳— (`router.js · viewNeedsBook`, `refresh.js · asegurarLibro`).
   SheetJS va con `defer` y D3 se carga al abrir Biología Molecular (`main.js · cargarD3`).
   Mientras se ve la entrada no hay pestaña ☰ ni menú lateral (`.app.is-entry`, en `shell.js`).
   **Libro guardado en el equipo** (P4, 2026-10-01): el Worker deja el último libro leído en
   IndexedDB (`core/libroGuardado.js`: sólo las hojas que cambiaron, meta en la misma
   transacción; sólo un libro que llegó COMPLETO y todo por XLSX, ver el paso 1) y la primera
   vista que lo necesita lo enseña AL INSTANTE —medido: 0,6 s en vez de
   23 s, también sin señal— con «datos de las hh:mm · actualizando…», y se revalida en el acto
   (aplica en reposo). **Caduca a los 7 días** (decisión del usuario): más viejo, no se usa y se
   borra. Una descarga que llega vacía (sin señal) cuenta como fallo: se conservan los datos.
   **La primera carga dice cómo va** (2026-10-03): el Worker cuenta lo que baja y avisa cuando empieza a leer, y el
   aviso de carga y la píldora lo enseñan (`textoProgreso`, en `core/sheets.js`: «Descargando el libro… 7,7 MB» →
   «Leyendo el libro (13,1 MB)…»), con la explicación de que la primera vez en un equipo tarda y después abre al
   instante con lo guardado. Los refrescos no avisan.
1. `connectSheets()` descarga el libro **completo** vía `export?format=xlsx`
   (1 petición, todas las hojas), con reintento y backoff. Si falla, el **respaldo** pide CADA hoja
   por su XLSX (`export?format=xlsx&gid=`; los `gid` salen de `/htmlview`) y sólo la que no llegue,
   por su CSV (`respaldoPorHojas`). 🔴 **No va por gviz desde el 2026-10-01**: con un FILTRO puesto en
   la hoja —el laboratorio los deja a menudo—, gviz y el CSV dan sólo las filas visibles (medido:
   Datos M03, 20 de 1 579), y ese recorte pisaba el libro bueno sin avisar; el XLSX de una hoja las
   da todas, igual que el libro entero. El respaldo lo hace el Worker (en la página, cada hoja grande
   por XLSX congelaba ~1,3 s), y el libro sólo se guarda en el equipo si ninguna hoja vino por CSV
   ni faltó ninguna. Comprobado en Chrome el 2026-10-06 contra lo publicado, con el libro entero
   bloqueado en el Worker: el respaldo pide cada hoja por su XLSX y ninguna por gviz.
   Límite conocido: el tope del Worker (`LIMITE_MS`, en `sheets.lector.js`, 165 s) cubre la lectura
   ENTERA, respaldo incluido, no sólo el libro. Si el libro entero falla por tiempo, o si falla al
   instante pero la red va lenta, el respaldo puede no terminar a tiempo (el 2026-10-06, con la red
   lenta, leyó 31 de 43 hojas): el Worker se descarta con lo que llevaba leído. En un refresco se
   conservan los datos que había; en la primera carga la página vuelve a empezar en el hilo
   principal y puede tardar varios minutos. Es raro: el libro entero falla en torno al 0,05 % de las
   lecturas.
   **El XLSX se descarga y se lee en un Web Worker** (`core/sheets.worker.js`, clásico, con
   `importScripts` del SheetJS de `public/vendor`; lectura `dense`): la pantalla no se
   congela (medido el 2026-10-01 con el libro real: 21 s → 0,9 s al abrir y 12 s → 0 en cada
   refresco). El Worker calcula la huella de cada hoja y sólo devuelve las que cambiaron
   respecto a lo aplicado (`planDelta` / `fundirDelta` en `core/sheets.js`). Si no arranca o
   no carga SheetJS, se lee en el hilo principal como antes (`core/sheets.lector.js`); si se
   cae con datos ya cargados, se conservan y se reintenta en el siguiente ciclo.
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
4. `startAutoRefresh()` comprueba cada **5 min** (`REFRESH_INTERVAL_S`) comparando un
   *fingerprint* (no re-renderiza si no hubo cambios). Con la pestaña oculta no descarga; al
   volver comprueba si ya tocaba. Con el Worker descarga aunque el usuario esté
   trabajando (sin Worker, no descarga mientras interactúa: leer aquí congela) y los datos nuevos se **aplican sólo en reposo**: sin interacción
   reciente, sin modal y sin un campo de texto con el foco; hasta entonces quedan pendientes
   («datos nuevos en espera» en la píldora). Registros no se repinta nunca por un refresco
   (`repintaConDatos: false`). ⟳ y la píldora refrescan a mano y nunca lanzan dos descargas
   a la vez (`refrescoManual`).
   Al aplicar datos nuevos, la vista **se queda donde estaba** (2026-10-03, `router.js · renderCurrentView({
   conservarPosicion })`): el contenedor sostiene su alto mientras se repinta —si el `render` devuelve una promesa, como
   Maduración o Biología Molecular con su segundo paso, hasta que se cumple— y el desplazamiento vuelve a su sitio; antes
   la página encogía y saltaba ARRIBA (medido en Maduración: 731 → 0). Igual con el tema 🌙 y con los atajos de fecha
   («Todo», «30 días», «7 días»). Cambiar de vista sí empieza arriba.

## Testing y calidad

- **Vitest** (`npm test`): la capa de datos (`core/*`, `supervisor/stats`, `microbiologia/data`,
  las fichas de Registros…) y el monolito `public/registros/engine.js`, que se arranca entero en
  happy-dom sobre el shell real. **ESLint flat v9 + Prettier** (`npm run lint`).
- ⚠ **La CI corre las pruebas con Node 24** (`deploy.yml`; hasta el 2026-09-19, con Node 20), no con el
  Node de tu equipo, y happy-dom no se comporta igual en todas las versiones: el 2026-09-18 una prueba en
  verde aquí tumbó la CI —y con ella el despliegue— porque su simulación del `localStorage` no
  interceptaba en Node 20. Antes de un push, la suite con el Node de la CI de verdad:
  `TZ=UTC npx -y -p node@24 -- node node_modules/vitest/vitest.mjs run`.
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
el monolito gemelo *standalone* (misma app, mismo GAS, mismas claves `larv4_`), que **no está en
este repo**: se versiona aparte, en el suyo de `Music` (desde el 2026-09-20; sin remoto y sin conversión
de fin de línea, porque su sha1 es su identidad). Lo que los mantiene juntos no es la disciplina
sino los verificadores, y para portar
hay herramienta: `portar-engine-a-index8.mjs` deriva los bloques del `git diff` de `engine.js` y los
aplica al gemelo; `portar-code-gs-a-plantillas.mjs` hace lo propio con `GAS/Code.gs` y las dos
plantillas `GAS()`. Copiar a mano es lo que los separa. ⚠ Con `--contexto` bajo, un bloque que INSERTA
se ancla sólo en lo de alrededor: el portador se niega si la mitad de sus líneas ya están en el
destino, porque una vez insertó un bloque dos veces.

> ⚠ **Ninguna prueba del repo puede DEPENDER de `index (8).html`.** En GitHub Actions el checkout no
> tiene `Music\`, así que un `readFileSync` a secas sobre él revienta el paso «Pruebas» y arrastra al
> deploy. La suite vigila el repo; la paridad con el gemelo la vigilan los verificadores, que corren en
> la máquina donde ese archivo existe. Si una prueba necesita mirarlo —lo hace `analistaGrafia.test.js`—,
> lo lee con `try/catch` y se SALTA visiblemente (`it.skip`) cuando no está.

## El contrato con Google Sheets: sello, firma, cola y lectura

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
Desde el 2026-09-24 (punto 2a · C, decisión del usuario) **el «sí» se recuerda 30 min** en el dispositivo,
también al recargar, para ESE GAS y ESTA versión de la app: con el GAS de producción tardando 3–45 s en
contestar, preguntar en cada envío mandaba casi todo a la cola. Sólo se recuerda el «sí», y un envío
rechazado por su entorno (esquema, hoja no permitida…) lo olvida; entre medias protege la firma.

> 🔒 **Es un fallo seguro, no un error.** Tocar `Code.gs` y no re-desplegar deja esas fichas
> **sin enviar**: calculan, guardan en el dispositivo y lo avisan. Lo mismo si `?p=ver` no contesta.
> Nada se pierde — pero **la cola descarta a los 7 días** (avisando qué), así que no conviene dejar
> pasar días entre publicar el cliente y re-desplegar el GAS.

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
| Maduración Mortalidad Desove | 13 `Fototropismo` · 17 `Área` · 18 `Alcalinidad día` |
| Maduración Tratamientos | 8 `Productos RAS` |
| Maduración Alimentación | 9 `Fuente del peso` |
| Maduración Movimientos | 9 `Agua destino` · 12 `ID` |
| Maduración Sala | 20 `RAS` |
| Maduración Tanques | 12 `Observaciones sanitarias` |
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

### 3 · El ORDEN: GAS → `push` → repartir `index (8)` → Probar conexión

*(Hasta el 2026-09-25 este título decía «`push` → GAS», que era el orden de ANTES del sello y de la firma.)*

**Lo deciden el SELLO y la FIRMA, y los dos protegen en ESE orden.** Con el GAS nuevo desplegado, una
copia anterior de la app —Pages antes del push, o un `index (8)` sin repartir— ve un sello que no es el
suyo y NO escribe las fichas selladas (`_madHojaPideGasNuevo`): calcula, lo guarda en el dispositivo y
lo dice. Y si lo intentara, la firma del GAS nuevo rechaza a un cliente con el esquema viejo, también con
la hoja vacía o sin crear. Al revés —push antes que GAS— no se protege nada: la copia nueva espera en la
cola, pero las viejas y el GAS viejo siguen casando y escribiendo con el esquema anterior.

El caso que lo hace urgente: `Maduración Mortalidad Desove` pasó de 14 a 21 columnas **insertando**
(Fototropismo/Aireación en la 11-12, Área/Alcalinidad en la 15-16, la alcalinidad partida en día 16
y noche 17, y el 2026-09-24 Código genético/Piscina Broodstock en la 3-4, que corren todo dos puestos).
Mientras siga desplegado el GAS anterior, una copia vieja que envíe Inf. Supervisor crea esa hoja con su
cabecera antigua, y el GAS nuevo rechazará después a TODOS los clientes al día hasta vaciarla **con su
fila 1**. Por eso, justo antes de publicar, `estado-maduracion.mjs` tiene que decir que esa hoja sigue
sin existir; si existiera, se vacía con su fila 1 antes de desplegar.

Añadir **al final**, en cambio, es inocuo: `ensureHeaders` alarga la cabecera que falte y «el envío trae
menos columnas» no cuenta como desfase. Por eso da igual quién cree `Maduración Sala` o `Maduración Tanques`.

Y al re-desplegar, dos detalles: en Apps Script hay que publicar una **versión nueva** del Web App
(guardar sin publicar no cambia lo que sirve), y el `Code.gs` se copia del repo o de una app AL DÍA:
una copia antigua de la app lleva dentro un GAS viejo.

### 4 · La cola, y qué pasó con CADA envío

Un envío que no puede salir entra en la cola con su **marca** (`madlog:<ficha>` + su id). Al
entregarse, la cola la reconcilia y el registro «Registrado desde este dispositivo» de esa ficha
enseña **📶 en cola**, **✅ enviado** o **⚠ no llegó**. El estado es de cada envío, no de la cola
entera.

Desde el 2026-09-24 (punto 2a, correcciones A y B, decisiones del usuario):
- **La cola se reintenta SOLA** mientras tenga algo: cada 60 s con la app a la vista y con red,
  espaciándose ×2 hasta 5 min si no avanza, y de vuelta a 60 s en cuanto algo llega. Es silenciosa
  con lo que espera: lo dice el indicador de la cabecera, que **cuenta la cola** («N en cola») y ya no
  dice «Todo sincronizado» con envíos esperando.
- **Nada sale sin avisar**: lo que lleva **7 días** sin poder salir (antes 24 h, en silencio) o lo que
  la cola tira al llegar a su tope de 50 se avisa diciendo qué hoja y de cuándo. Contrapartida
  aceptada: un envío que llega días después puede pisar una corrección hecha a mano entre medias.
- **Vaciarla no pierde nada**: al terminar se relee la cola y sólo se quita lo que ese vaciado
  resolvió; lo que se guardó, se purgó o se sustituyó mientras tanto se respeta.

Y desde el 2026-10-04 (auditoría final de la sincronización, decisiones del usuario) **lo no enviado no se pierde
sin avisar**:
- **Sin espacio, un envío no se da por «en cola».** Si no cabe en el almacenamiento —o el navegador acepta el
  guardado sin hacerlo, como en el modo privado de algunos: se comprueba LEYENDO tras escribir—, el envío da
  **error** con su motivo y lo tecleado se queda en pantalla. Antes decía «📶 en cola», vaciaba el formulario y se
  perdía.
- **Biomol, As Técnico (supervisión) y Traslado CONSERVAN lo no enviado.** A las 48 h sólo se retira lo ya
  enviado, contadas desde su envío (como ya hacían Score, Auditoría y Microbiología); lo pendiente se queda hasta
  enviarlo o borrarlo. Las fotos de un viaje caducan con su viaje.
- **Larvicultura y Lab. Algas: lo de días anteriores.** Se guardan por día y la app lee los de hoy, así que lo no
  enviado dejaba de verse a medianoche y la limpieza lo borraba. Ahora la limpieza no lo toca y, al abrir el módulo,
  un aviso dice qué quedó y de qué día, con **«☁️ Enviarlas»** (cada ficha a su hoja con SU fecha) y
  **«🗑 Descartarlas»**.
- **Reproductivo · elegir la hembra:** si el envío falla de verdad, los microchips elegidos **siguen** en la lista
  para reintentar (entregado o en cola, salen como antes).

Y en el **registro reproductivo** (punto 2a · E, decisiones del usuario) cada acción —un desove o una
mortalidad, un alta, un traslado, elegir la hembra— da **un solo aviso** al terminar: el resultado y, detrás,
lo que requiere atención (naranja; rojo si no se registró nada). Lo que va pasando se lee en la línea junto a
su botón, que se borra al terminar, y sus dos envíos (MATRIZ y Bitácora o Transferencias) no avisan por su
cuenta (`postPayload` con `sinAvisos`): se resumen en ese aviso. El resto de fichas avisa como siempre.

### 5 · La LECTURA de Registros: por la exportación de Google, con el GAS de respaldo

Desde el 2026-09-24 (punto 2a · D, decisiones del usuario) todo lo que Registros lee de una hoja —el
registro reproductivo y los botones de Maduración (🔄 Recalcular, Ver saldo, Ver vivos, Proponer estado,
📥 Cargar…)— pasa primero por la **exportación directa del libro** (`_reproFetchSheet` → `_exportLeerHoja`
en `engine.js`), también justo después de guardar, y el GAS (`?p=rows`) queda de **respaldo**. Medido ese
día contra producción: el GAS tardaba de 17 a 140 s por hoja y fallaba a menudo; la exportación, de 0,4 a 5 s.

- **El XLSX de la hoja** (desde el 2026-09-29, 0v·2): `export?format=xlsx&gid=` —el `gid` lo da `/htmlview`—
  trae UNA hoja con todas sus filas y el tipo de cada celda, y se lee con el SheetJS de la página, como la da el
  GAS (fechas «yyyy-MM-dd», números y booleanos con su tipo, el texto tal cual, sin filas vacías). Hasta ese día
  eran dos exportaciones combinadas —gviz, con tipos pero que deja en blanco lo minoritario de una columna que
  mezcla números y texto, y el CSV—, y 🔴 **con un filtro puesto en la hoja gviz sólo da las filas visibles**: el
  emparejamiento se descuadraba y todo caía al GAS (pasó con MATRIZ, Bitácora y Tanques). Medido ese día: 11
  hojas y 7 336 filas iguales al GAS celda a celda, en 0,5–1,8 s. gviz queda sólo para saber si existe una hoja
  que no está en la lista (por un nombre que no existe devuelve otra hoja sin avisar).
- **Lo que no se sabe imitar, o no es la hoja, se lee por el GAS, como antes**: un libro que no es de UNA hoja
  con ese nombre desde A1, una hora sola o una fecha anterior al 1-3-1900, un error (#N/A), una cabecera que es
  fecha, una página sin SheetJS, un fallo o 20 s sin respuesta. Una hoja que no existe se da por vacía, como la
  da el GAS.
- **Lo que se lee por el GAS se reintenta según POR QUÉ falló** (`_reproFetchSheet`). Sin red, no se reintenta
  (y no se culpa a Google). Un corte («Failed to fetch»): hasta 4 intentos, con esperas de 1,5 · 3 · 6 s, y
  ninguno nuevo pasados 30 s (1c, 2026-09-22). Un fallo de **ENTREGA** de Google: también hasta 4, con su propio
  tope de **90 s** (punto 5, 2026-10-01; `_reproEsEntrega`, `_REPRO_ENTREGA_TOPE_MS`). Medido ese día: el GAS se
  ejecuta siempre (`/exec` → 302); lo que falla a ratos es el segundo salto, en el que Google ENTREGA la respuesta
  (`script.googleusercontent.com`): un 404, 429 o 5xx, o una página en vez de datos, que suele llegar tras
  20–40 s. Es puntual en cada petición, así que insistir sí lo arregla, y por eso «no respondió en 30 s» cuenta
  también como fallo de entrega (decisión del usuario, que cambia la del 1c). Un 403 o un error del propio GAS
  siguen con 2 intentos. Comprobado en Chrome el 2026-10-06 con `index (8)` como archivo y los fallos
  provocados: un 404, una página de Google y un 404 sin cabecera CORS (que el navegador ve como un corte) se
  reintentan y la lectura llega; cuatro seguidos acaban en «Google respondió HTTP 404». Ese día, además, la
  primera lectura de la MATRIZ tardó más de 30 s en las dos corridas, y fue el reintento el que la trajo.
  🔑 Importa sobre todo en los equipos: `index (8)` abierto como archivo lee SIEMPRE por
  aquí (ver el punto siguiente). `?p=ver` y el aviso de ronda repetida de Tanques (`_madTqHojaFresca`) hacen UN
  intento a propósito.
- **Sólo con el GAS de producción y desde una página https**: el libro que se exporta es el que escribe ese
  GAS, y Google no deja leer la exportación a una página abierta como archivo. En `index (8)`, además, su
  CSP tiene que permitir `https://docs.google.com` y `https://*.googleusercontent.com`.
- **La confirmación de un chip dudoso** (1a) sigue leyendo por el GAS.
- ⚠ **Depende de que el libro siga compartido «cualquiera con el enlace»**, como el tablero: si se
  restringe, todo vuelve a leerse por el GAS, con la espera de antes.

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
  trae el Trovan, así que apuntarlo a una sería una convención — y sin las columnas de fecha (que la
  lectura no pidió hasta el 2026-09-24) el desempate caería en «la de más abajo en la hoja». Así que el
  evento y el TRASLADO se rechazan y el informe ofrece las dos, por su cuaterna, para registrar con la
  elegida (el traslado conserva su TR-ID). El alta ya avisa cuando el chip lo lleva una viva. Medido en
  producción el 2026-09-17: 1665 filas, 1665 chips, ninguno con más de una. (El 2026-09-22 ya eran 67 chips
  con dos hembras: los del lote del 29-08.)
- 🔴 **Un chip reciclado es de la hembra que lo llevaba ESE día: la de ingreso más reciente, pero no antes
  de que muera la anterior.** La fecha de ingreso es la del LOTE, no la del chip: el lote del 29-08 recibió
  chips de hembras que murieron del 06 al 10-09. Un evento o traslado con fecha ANTERIOR a esa muerte no es
  de la nueva: no se envía y no la toca. **El DÍA de esa muerte sólo es de la que murió su mortalidad**; un
  desove o un traslado de ese día es de la nueva, viva, si ya había ingresado (usuario, 2026-09-24: «el
  sistema no debe atribuirle desoves a un organismo muerto»; caso real: un desove del 10-09, el día en que murió la anterior).
  Cada llamada a `individuoEnFecha` dice si el evento es mortalidad. 🔴 Para eso la lectura **pide
  «Fecha ingreso» y «Fecha muerte»** desde el 2026-09-24: `index (8)`, sin el store del tablero, no las
  tenía, y una mortalidad atrasada de la anterior iba a la nueva —viva— y la marcaba muerta. (Dejaron de
  pedirse el 09-14 porque costaban 10×; P15 las abarató y, medido, cuestan lo mismo.) Una copia local sin
  ellas ya no se usa. Sólo con una fecha en BLANCO no se puede comprobar: el evento va a la vigente con
  aviso, y la Consulta no parte el chip en hembras.
- **Ninguna fecha posterior a hoy** en el alta, el evento ni el traslado (2026-09-22: un alta grabada con
  29-09 en vez de 29-08 dejó a 67 hembras sin poder registrar nada en el MCP).

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

- **Cada ficha guarda un borrador POR FECHA** (30 días), al teclear, y lo trae al abrirse. Al cambiar
  la fecha con algo tecleado, lo tecleado **se lleva** al día elegido o se pregunta (2026-09-24: ver
  «La FECHA con algo tecleado», arriba). Se guarda el panel, no un modelo, así que una ficha que cambia
  después deja borradores con campos que ya no existen: `_madBorrAdaptar` los adapta al traerlos.
- **💾 Guardar local, separado de ☁️.** 💾 guarda el envío **ya construido** en el dispositivo sin
  tocar la red (no lo tecleado: reconstruirlo podría dar otras filas). ☁️ envía primero lo guardado
  —lo más viejo antes— y después lo de pantalla; si lo guardado falla de verdad se para ahí.
  Vive en `larv4_mad_loc_<ficha>`, **no caduca**, y con 30 sin enviar 💾 se niega.
  ⚠ Un guardado que se hizo con un esquema anterior (la hoja ganó una columna en medio después)
  **ya no se puede enviar**: se detecta en el cliente, se dice, y la lista lo marca en rojo para que
  🗑 sea lo evidente. No se descarta solo — es trabajo que hay que volver a registrar.
- **Desoves · las fechas de N2 y N5 salen automáticas, pero se pueden editar.** Desde el 2026-10-04
  (usuario): **N2 es el día siguiente al desove y N5 el día siguiente al N2** —también si la N2 se
  tecleó: la N5 sin fijar la sigue en el acto—. Vienen puestas y **siguen** a la del desove hasta que
  alguien las toque, y entonces quedan **fijadas** (fondo amarillo, como la fecha de aplicación de Fin
  de Ciclo); una N5 fijada no la mueve la N2. Lo ya escrito en la hoja no se toca. Un borrador de antes
  del cambio pone al día sus fechas de oficio sin fijar (salvo en un ✏️ Completar, donde la N2 viene de
  la hoja). El aviso «N2 ANTERIOR al desove» compara con la **fecha del desove** (un N2 contado ese mismo
  día no avisa). En el tablero (🥚 Reproducción), el N5 pendiente se espera el día siguiente a la
  «Fecha N2» de la hoja, o dos días después del desove si no la trae.
  Cada una se escribe **sólo junto a su cifra**, y el candado «N5 exige N2» mira la CIFRA, no la fecha
  —que viene puesta de oficio en todas—. Una fecha tecleada se valida como **día real**: `2026-02-31`
  pasa el patrón y no existe.
- **Desoves · pendientes (sin N5) · «🗑 Eliminar»** (usuario, 2026-10-04), junto a «✏️ Completar»: quita
  el desove **de este dispositivo, no de la hoja**. Lo guardado aquí se borra y la llave se **oculta** en
  este equipo (una fila de la hoja volvería a salir en cada lectura); en los demás equipos sigue saliendo.
  Pide confirmación; «👁 Mostrar ocultos (N)» y «↩ Volver a mostrar» lo recuperan (lo que aún no estaba en
  la hoja leída no se puede recuperar desde aquí, y se avisa). Volver a guardar ese desove en este equipo lo
  des-oculta. Los ocultos se podan solos cuando la hoja trae ese desove completo. Sólo interfaz: el cálculo de pendientes (motor y gemelo) no cambia.
- **Desoves · «📥 Cargar»** (usuario, 2026-09-24), al lado de «✕ Quitar»: lista lo que está en
  **producción** a la fecha del desove —cada composición del Ingreso con vivos en una sala donde su
  lote produce— y un toque rellena lote, código genético y piscina **a la vez**, para que no se
  crucen. Una **pareja** del Ingreso (mismo «Grupo») es UNA opción, con códigos y piscinas unidos por
  «/» en el orden del grupo, como ya se escribía a mano (`AB · CG1/CG2 · 101/102`). Se toca, no se
  arrastra (arrastrar no funciona en pantallas táctiles). Usa la última lectura del libro, con
  «🔄 Releer»; no sale al completar un desove, cuya llave no cambia.
- **Desoves · ✏️ en el historial de 36 h** (usuario, 2026-09-24): a la izquierda de cada desove, lo
  abre para **corregirlo**, con la llave (fecha, lote, código) fija, como ✏️ Completar. Si ya llegó a la
  hoja **sólo viaja lo que cambió** —lo demás va vacío y el MERGE conserva lo que la hoja tenga, también lo
  que otro dispositivo completara después—, así que **vaciar un campo no lo borra** de la hoja (se
  avisa); si sigue **en cola**, se corrige **el envío pendiente en su sitio**, con huella nueva (con la
  vieja el GAS lo daría por escrito); si **no llegó**, se envía completo. La fila dice «✏️ corregido
  hh:mm» y conserva su hora. Una llave equivocada se corrige borrando esa fila en la hoja y registrando
  el desove de nuevo: la app no borra filas.
  ⚠ Y la fecha de un desove que se completa o se corrige es su **llave**: traer su borrador no la mueve
  al día en que se tecleó (hasta el 2026-09-24 la movía, y el guardado iba a una fila nueva de hoy).
- **Fin de Ciclo · la fecha de aplicación** sale igual que la del registro y la sigue salvo que se
  cambie a mano. Mismo mecanismo `data-fijo`.
- **Inf. Supervisor** (`Maduración Mortalidad Desove`) lleva TRES cosas en la misma hoja: mortalidad
  de hembras, revisión de nauplios (una fila por revisión) y **alcalinidad por área, de día y de
  noche** — en la MISMA fila del área, así que anotar la de noche horas después no pisa la de día.
  ⚠ Fototropismo y Aireación llevan su PROPIA lista de valores aunque hoy coincida con la de
  Actividad: compartir el array haría que retocar una cambiara las otras dos en silencio.
  Cada registro lleva **Código genético y Piscina Broodstock** detrás del lote (usuario, 2026-09-24),
  con el mismo «📥 Cargar» de Desoves. El código es parte de la **llave**, como en Desoves —un pool es
  lote + código—: el mismo lote con otro código es otro registro, y sin código no se guarda.
  En «Tanques de desove», junto a las hembras, la **temperatura del tanque de desove** (usuario, 2026-10-04): va en su
  columna PROPIA, **«Temperatura tanque desove», la 22, DETRÁS del ID** —como la «Guía de ingreso»—, así que la hoja no
  se migra y el GAS no cambia (la añade `ensureHeaders`, el ID se localiza por su cabecera y la guarda de esquema sólo
  compara las columnas comunes). Sola también crea la fila de Desove; una que no es cifra es error y por encima de 40 °C
  avisa. Un borrador guardado antes del cambio recupera el campo al abrirse.
- **Ingreso · «Guía de ingreso»** (usuario, 2026-10-02): texto libre y opcional, UNA por ingreso (junto a la
  Fecha y el Lote), repetida en todas sus filas. En la hoja es la columna 19, **DETRÁS del ID**, a propósito:
  añadida al final, la hoja de producción no se migra —el GAS alarga la cabecera solo— y un equipo sin
  actualizar sigue escribiendo (le falta el final; el merge conserva la guía). Dos consecuencias en el GAS:
  la columna se escribe como texto «@» (localizada por la cabecera del envío; si no, Sheets guardaría
  «000123» como 123) y, como el ID ya no es la última, `upsertAstRows` lo busca por la cabecera de la hoja
  y, si ésta faltara, por la del ENVÍO —no por «la última columna», que sería la guía y duplicaría filas—.
- **Tanques · las observaciones son de multiselección** y llegan a la hoja **en el orden del
  catálogo**, no en el de marcado: si no, contarlas después sería imposible.
- **Salas · «Toneladas»** son las de CADA tanque, y el valor por defecto **se pre-rellena, no se
  impone**: manda lo que hay en la celda, un 0 incluido, y un defecto que nadie tecleó no cuenta como
  registro. Mandan las cifras del catálogo, no las del Excel de un módulo concreto.
- **Los pesos ♂/♀ del tanque, desde Tanques o desde Alimentación** (usuario, 2026-10-04). Un peso tecleado A MANO
  en 🍤 Alimentación —los «Manual» de «Fuente del peso», ya en su hoja— cuenta como peso del tanque **donde se usa
  el peso**: la ración al leer (fuente «Alimentación <fecha>»), el ⚖️ Saldo (peso del lote y carga; lee también esa
  hoja y, si aún no existe, sigue sin aviso) y, en el MCP, el resumen, el KPI de biomasa, los pesos de los lotes y
  los últimos pesos de Tanques y del detalle de sala. **El mismo día, sexo a sexo, manda 🛢 Tanques.** Los partes del
  día no cambian. Pieza común `madPesosDeAlimentacion` (motor) ↔ `pesosDeAlimentacion` (`mad-libro.js`), con
  paridad. Reenviar Alimentación el mismo día tras releer no pierde el peso tecleado.
- **📜 Historial** (usuario, 2026-10-04): lo enviado desde ESTE equipo en los últimos **60 días** (hasta 200 POR
  ficha) de las siete fichas de formulario y de Salas/Tanques (de sus propios registros); Broodstock, fuera. Cada
  envío —directo, en cola o desde 💾— guarda sus filas: se revisa, se imprime (📄) y se borra (🗑, sólo del
  equipo). **✏️ Editar** abre la ficha tal como se envió, en corrección (fecha FIJA y aviso), en los últimos
  **10** envíos de cada ficha (Alimentación, 3); guardar reescribe las MISMAS filas (mismo ID) y avisa antes si
  cambió la llave. Desoves usa su propia corrección (sólo viaja lo cambiado). Un reenvío con las mismas filas
  SUSTITUYE a su entrada («🔁 reenviado»). Sin espacio se liberan primero las copias para Editar y después la mitad
  más vieja del Historial; la cola, nunca.
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
- **Traslado · la Ubicación lleva su «-».** El saneado anti-fórmulas del texto (`sanitizeStr` en el cliente,
  `cleanCell` en el GAS) quita el «-» inicial, y la latitud de Ecuador es negativa. Las coordenadas van por su
  vía numérica, y la Ubicación «lat, lon» por la suya: tal cual SÓLO si es exactamente «número, número» —el
  mismo patrón en el cliente (`trasUbicacion` / `celdaUbicacion`) y en el GAS (`ubicacionConSigno_`)—. Arreglar
  sólo el GAS no bastó: el cliente la saneaba en DOS sitios (al enviar y al pasar la pantalla al registro), y el
  segundo sólo lo vio un navegador real.
- **`inset` no existe en los navegadores viejos** (llega con Chrome 87 / Safari 14.1): allí una capa a pantalla
  completa con `inset:0` sale como una caja arriba a la izquierda (le pasó a la entrada el 2026-10-01). Con
  `target: 'es2019'` a secas, esbuild lo deja pasar —y hasta junta los cuatro lados en `inset:0`—, así que
  desde el 2026-10-02 el build declara navegadores (`build.cssTarget`, `CSS_NAVEGADORES` en `vite.config.js`)
  y esbuild TRADUCE todo `inset` del CSS de `src/` a los cuatro lados (medido: además sólo añade prefijos).
  Lo que el build no toca se escribe ya con los cuatro lados: los estilos en el código (`style="…"`),
  `engine.js` —que se publica tal cual— y el CSS de Registros, que tiene que seguir igual que el de
  `index (8)`. Lo vigila `src/sinInset.test.js` (y `entryScreen.test.js`, las tres capas de la shell).

## Pendiente

> Lo que depende del despliegue **se comprueba contra el despliegue**, no se lee de aquí. Esta lista
> ya ha estado equivocada dos veces por describir un estado en vez de apuntar dónde mirarlo.
> 🔍 Para medir el estado real: `node estado-maduracion.mjs` (sólo lectura).

**Bloquea producción**

1. 🔴 **El token compartido.** `SHARED_TOKEN` está vacío: la escritura sobre las hojas de producción
   sigue siendo anónima. Se activa desde el panel de Apps Script (Propiedades del script), sin tocar
   código: el código que lo lee ya está desplegado. ⚠ El orden importa: primero el token en ⚙ Config
   de TODOS los dispositivos y después la propiedad; al revés, nadie puede escribir.

**Por validar en producción**

2. **Estrenar lo desplegado.** Si el GAS desplegado es el del repo NO se lee de aquí: esta línea lo afirmó
   «desde el 2026-09-21» y caducó el 24, cuando la firma nueva cambió el sello. 🔑 El sello del
   día tampoco —esta línea citó dos sellos que caducaron el mismo día—: lo dicen `?p=ver` y
   `estado-maduracion.mjs`. Falta que lo desplegado se use de verdad:
   - Las hojas que aún no existen nacen con su primer envío y tienen que nacer con la cabecera actual.
     Cuáles existen ya, y con cuántas columnas, lo dice `estado-maduracion.mjs`, no esta lista.
   - Un parte de Tanques REENVIADO tiene que corregir su fila, no añadir otra: es la llave nueva de P12
     (`[0,1,2,13,14]`), y todavía no se ha ejercido en producción.
   - En cada dispositivo, recargar la app y pasar ⚙ Config → «🔗 Probar conexión»: tiene que mostrar
     ese sello. Una copia de `index (8)` con OTRO sello no envía las fichas selladas —calcula, guarda
     en el dispositivo y lo dice— y se sustituye por la actual.
     ⚠⚠ **Ese sello es necesario pero NO suficiente, y conviene saber por qué** (medido el 2026-09-20).
     El sello es la huella de `GAS/Code.gs`, así que **todas** las copias hechas entre dos cambios de
     `Code.gs` enseñan el mismo y pasan «Probar conexión» igual, aunque a una le falte código: así
     estuvieron los tres `index (8)` de Music con `55acbff1b746` durante dos días. Lo que prueba es
     que la app habla con ESTE GAS; no prueba que sea la build de hoy.
     🔑 **La única identidad fiable de una copia es su sha1**, y la app no lo enseña por ningún sitio:
     se compara con `sha1sum` tras copiarla. ⚠ **El sha1 del día NO se escribe aquí** —caducó una vez,
     el 2026-09-20, cuando esta línea siguió diciendo `2e806a50…` después de que P12 dejara la copia
     buena en otro sha1, y quien la siguiera habría dado por buena la build ANTERIOR—. Se pregunta:
     `git -C "C:/Users/Usuario/Music" log --oneline -1` y `sha1sum "index (8).html"`.

**Hecho, y comprobado**

3. ✅ **El vaciado (2026-09-20) y P12 (2026-09-21).** Se retiraron del documento todas las hojas de
   Maduración salvo las del reproductivo —`MATRIZ` y `Bitácora` siguen ahí, con sus miles de filas— y el
   registro se está estrenando. Y `Maduración Tanques` quedó en sus 15 columnas: se re-desplegó
   `GAS/Code.gs` (P12, `1006532`: `madKeyCols` de `[0,1,3,16,17]` a `[0,1,2,13,14]`) y se borraron de la
   hoja `Lote` y las dos `Población inicial`, que estaban vacías en todas las filas. Comprobado después:
   la cabecera es la del código, los datos no se corrieron y la `Hora` sigue siendo texto —si volviera a
   ser una hora de Sheets, la llave dejaría de casar y cada reenvío duplicaría el parte—.
   🔑 Cuántas filas tiene hoy, y si la cabecera sigue siendo la del código, **no se lee de aquí**: lo dice
   `estado-maduracion.mjs`, que mira también `Tanques` y `Sala`.

**Abierto**

4. **`Maduración Transferencias` se estrenó el 2026-09-26** (primer traslado): queda contrastar su panel con
   dato real, y hace falta una comprobación propia: `auditar-tablero-mad-real.mjs` no lee esa hoja (lee
   las diez del operativo; Transferencias es del reproductivo). Cuántas filas tiene, lo dice
   `estado-maduracion.mjs`.
5. **Microbiología · Patología en fresco** espera a que los usuarios estrenen su hoja.
6. **Paridad · las funciones que sólo se comparan por NOMBRE** entre `engine.js` e `index (8)`. Desde el
   2026-09-22, `verificar-3copias-v3` saca las funciones con un parser y compara las que delegan en `__rgLib`
   TRADUCIENDO la llamada (`window.__rgLib.x` ↔ `_reproX`): tienen que salir iguales. Sólo quedan por nombre
   las de su lista cerrada `SOLO_POR_NOMBRE` —las siete fichas (su maquetación es P10), utilidades de una
   línea de `src/core` y la lectura del store—; cuántas son lo dice él al correr («sólo por nombre»).
   (Hasta ese día toda función que delegara pasaba sin mirarla, y así divergió la Consulta del reproductivo.)
   Las contrapartes EN LÍNEA de la librería del reproductivo no las compara él: las ejecuta
   `paridad-repro-reciclaje`, sobre los mismos casos que el módulo.
7. **El tablero de Maduración: COMPLETO (Fase 0 y F1–F7).** Están sus sub-vistas —de
   📊 Estado actual a 🖨 Reportes; la lista viva es `SUBS`—, con los filtros, el período «ciclo del lote»,
   las etiquetas de filtros activos y el KPI de biomasa, y el Broodstock dentro de 🧬 Lotes.
   🖨 **Reportes** (F7, 2026-09-22) trae los CUATRO del plan. **F7.1**, el **parte diario de UNA página**, en pantalla, en PDF y en Excel
   (`operativo.reportes.js`). 🔑 No calcula cifras propias: llama a las mismas funciones puras del tablero con
   un período de **un día**, para que el papel no pueda contradecir a la pantalla. Reglas cerradas con el
   usuario: el parte es el **día de la foto** y **hereda los filtros**, que se IMPRIMEN en la cabecera
   («⚠ PARTE FILTRADO — Sala 2»); el día se cambia desde el panel y **mueve la foto del tablero**; las tablas
   caben en una hoja y dicen «**+ N más** (total N)» al recortar, mientras el **Excel lleva las filas
   completas, una hoja por bloque**; el PDF se imprime con la maquinaria del Supervisor (`printFichaDocs`:
   iframe oculto, sin pop-ups) y lleva **código verificador del CONTENIDO** —el sello de generación queda
   FUERA del hash, así que dos impresiones del mismo parte dan el mismo código—. La vista previa es ese mismo
   documento, dentro de un iframe.
   🆕 **F7.2** añade dos reportes más en la misma barra: el **semanal por lote** —los siete días que terminan en la
   foto (el período «7 d» del tablero, no la semana natural) con **una página por lote**: los que tienen vivos más
   los que **cerraron dentro de la semana**— y el **cierre de lote**, que cubre la **vida** del lote
   (`cicloDelLote`: de su ÚLTIMO ingreso a su cierre, o a la foto) con la **cascada del cuadre** y el rótulo
   «EN CURSO» si sigue abierto. Las curvas se dibujan con un SVG en línea (un PDF se imprime en un iframe sin
   librerías cargadas) y cada página del documento lleva **su propio** código verificador.
   🆕 **F7.3 cierra F7** con el reporte de **Broodstock**: una página de resumen con la tabla del **último corte**
   y sus dos avisos (la piscina que dejó de cargar y la que el Ingreso nombra sin Broodstock), y **una página por
   piscina** con su curva de peso, sus cortes, los lotes que salieron de ella y sus observaciones. ⚠ Es el único
   reporte que sigue el **período del tablero** (los otros tres llevan el suyo), y una **sobrevivencia que no puede
   ser un porcentaje se imprime como vino y marcada**, igual que en pantalla.
   🆕 **0r·4** (2026-09-28): el diario y el semanal llevan en SU barra el «Lote → Código genético» del tablero —los
   MISMOS filtros, como el día del parte: no puede haber dos que discrepen—, y en el parte diario las bajas, que van
   por tanque, **dicen** que no se filtran por lote ni por código genético.
   ⚠ Se desarrolla con fixtures FICTICIOS, y se contrasta con `auditar-tablero-mad-real.mjs` y
   `medir-tablero-mad-real.mjs` (utillaje). 🔑 Desde el 2026-09-20 esas dos **cuentan cuántas
   comprobaciones ejercitaron dato y cuántas salieron verdes EN VACÍO**, y nombran las hojas sin
   ninguna fila: tras el vaciado daban «todo en ok» sobre cero, que es un verde que no prueba nada.
   Cuánto cubre hoy el contraste **no se lee de aquí**: lo dicen ellas al correr.
   ✅ **Y que hoy salgan muchas EN VACÍO no es un defecto del tablero** (decisión del usuario,
   2026-09-21): el registro se está estrenando en producción y varias de sus diez hojas siguen sin
   filas (cuántas, lo dice `estado-maduracion.mjs`), así que no hay con qué contrastar. Cada pieza se contrasta **cuando su hoja reciba sus
   primeras filas**, no antes — y el censo sigue diciéndolo en crudo a propósito, para que ese verde
   sobre cero no se confunda nunca con una prueba.
8. **La CI sigue sin poder vigilar `index (8)`** —`deploy.yml` corre lint, vitest, auditorías y build, y
   ninguna de las cuatro ve un archivo que no está en el repo—, pero desde el 2026-09-20 **ya no depende
   de acordarse**: un hook `pre-push` corre `node verificar-todo.mjs --copias` (las que comparan
   repo ↔ `index (8)` —funciones, constantes, estilos, marcado, SheetJS, plantillas del GAS, sintaxis
   y que esté versionado—, ~1,8 s; **cuántas son lo dice ella al correr**: aquí ponía «seis» y eran
   ocho desde que entraron `verificar-constantes` y `verificar-index8-git`) y
   **para el push** si divergen. Falla CERRADO: si falta el utillaje o falta `index (8)`, también para y
   lo dice. Salida deliberada: `git push --no-verify`.
   🔑 Y desde el 2026-09-21 hace una segunda pregunta, porque este repo es PÚBLICO: `verificar-sin-reales.mjs`
   mira el rango EXACTO que se empuja —las líneas añadidas por cada commit y sus mensajes— y **para el push**
   si se va a publicar un dato real (textos del Excel de Broodstock, sus variantes o Trovan de la MATRIZ). Lo
   que ya estaba publicado avisa sin bloquear, y nunca imprime el valor.
   ⚠ El hook vive en `.git/hooks/`, que **no se versiona**: es local a esta máquina, igual que
   `index (8)`. Quien clone el repo en otro sitio no lo tiene — y allí tampoco hay `index (8)` que
   comparar. La lógica sí está versionada, en el utillaje.
