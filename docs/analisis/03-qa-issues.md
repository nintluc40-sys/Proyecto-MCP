# QA — issues candidatos

> Skill `qa`. Issues redactados con la plantilla de la skill: **orientados a comportamiento,
> sin rutas de archivo ni nombres internos**, en lenguaje de dominio. Normalmente esta sesión
> la conduces tú reportando fallos; aquí se infirieron del código y la UX. Revisa cada uno
> contra el uso real y descarta los que no apliquen.
>
> Para crearlos en GitHub (cuando instales `gh`): copia cada bloque a `gh issue create`.

---

## QA-1 — La vista "Visitante" existe pero ningún rol la ve

**Qué pasó**
La vista Visitante está desarrollada, pero al ingresar con cualquier rol (incluido Visitante)
aparece marcada como "en desarrollo" y no se puede abrir su contenido real.

**Qué esperaba**
Que el rol Visitante (y/o Administrativo) abra la vista Visitante funcional.

**Pasos para reproducir**
1. Abrir la app y elegir el rol **Visitante** en la pantalla de ingreso.
2. Observar el menú de vistas.
3. La entrada aparece como pendiente / no muestra el dashboard de visitante real.

**Contexto adicional**
La vista tiene contenido implementado, pero está marcada como "pendiente" en la configuración de
navegación. Es una incoherencia de configuración, no de la vista en sí.

---

## QA-2 — El rol "Supervisor" no da acceso a la vista "Supervisor"

**Qué pasó**
Al ingresar con el rol **Supervisor**, el menú no incluye la vista llamada Supervisor; en su
lugar muestra Maduración, Algas, Biología Molecular y Microbiología (varias en desarrollo).

**Qué esperaba**
Que el rol Supervisor acceda a la vista de supervisión, o que los nombres de rol y vista dejen
de coincidir de forma engañosa.

**Pasos para reproducir**
1. Ingresar con el rol **Supervisor**.
2. Revisar las vistas disponibles en el menú lateral.
3. Notar que "Supervisor" (la vista) no está, y sí varias marcadas "en desarrollo".

**Contexto adicional**
Es un lío de rótulos heredado del sistema original (ya anotado en la documentación). Conviene
resolverlo en la versión definitiva para que rol y vista no se contradigan.

---

## QA-3 — Un rol sin vistas asignadas deja la pantalla en un estado muerto

**Qué pasó**
Al ingresar con el rol **Chequeador** (sin vistas asignadas), la pantalla queda en un mensaje de
"tu rol aún no tiene vistas" sin forma evidente de avanzar salvo cambiar de rol.

**Qué esperaba**
Que el rol Chequeador tenga al menos una vista, o que la pantalla guíe claramente a cambiar de rol.

**Pasos para reproducir**
1. Ingresar con el rol **Chequeador**.
2. Observar que no hay vistas y la pantalla queda inerte.

**Contexto adicional**
El acceso de este rol está marcado como "a definir a futuro". Mientras tanto, conviene que el
estado vacío ofrezca el botón de cambiar rol de forma prominente.

---

## QA-4 — Cambios en una fila intermedia del Sheet pueden no reflejarse hasta reconectar

**Qué pasó**
Tras editar un valor en el Google Sheet sin añadir ni quitar filas, el dashboard puede seguir
mostrando el dato anterior durante el auto-refresco, hasta que se pulsa "Refrescar" o cambia el
número de filas.

**Qué esperaba**
Que cualquier cambio de dato se refleje en el siguiente ciclo de auto-refresco.

**Pasos para reproducir**
1. Dejar el dashboard abierto y conectado.
2. En el Sheet, editar un valor de una fila que no sea la primera, la última ni la del medio,
   sin agregar/eliminar filas.
3. Esperar el ciclo de auto-refresco (~60 s) y observar que el cambio no aparece.
4. Pulsar "Refrescar ahora" y ver que entonces sí aparece.

**Contexto adicional**
El mecanismo de detección de cambios compara una muestra de filas, no todas; cambios fuera de la
muestra pueden pasar desapercibidos hasta una reconexión.

---

## QA-5 — El resumen puede mostrar un estadio anterior si aparece uno fuera de la escala conocida

**Qué pasó**
Cuando una fila trae un estadio que no está en la escala biológica configurada (por ejemplo un
post-larva muy avanzado o un tipeo), el resumen de estadio "más avanzado" puede mostrar uno
anterior en lugar del real.

**Qué esperaba**
Que el estadio más reciente/avanzado se muestre correctamente aunque caiga fuera de la escala.

**Pasos para reproducir**
1. Cargar datos donde el día más reciente tenga un estadio no contemplado en la escala.
2. Abrir la vista que muestra el estadio actual del módulo/tanque.
3. Observar que muestra un estadio menor o "N/A".

**Contexto adicional**
La escala de estadios tiene un rango fijo; valores fuera de ese rango se ordenan por debajo de
todos los demás.

---

## QA-6 — Un mensaje de error con caracteres especiales puede romper el panel de error

**Qué pasó**
Si la app cae en un estado de error cuyo mensaje contiene caracteres como `<` o `>`, el panel de
error puede renderizarse mal en lugar de mostrar el texto del error.

**Qué esperaba**
Que el panel de error muestre siempre el mensaje como texto plano legible.

**Pasos para reproducir**
1. Provocar un fallo de carga/render cuyo mensaje incluya un carácter tipo `<`.
2. Observar el recuadro de error.

**Contexto adicional**
Afecta a los estados de error de carga de vistas y de la vista de captura. Bajo impacto, pero
empobrece el diagnóstico cuando más se necesita.

---

> **Priorización sugerida:** QA-1, QA-2 y QA-3 son de configuración/UX y se arreglan rápido.
> QA-4 y QA-5 son de datos y conviene cubrirlos con tests (ver `02-diagnose.md`). QA-6 es cosmético.
