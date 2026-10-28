# Plan de `engine.js` · estrangular el monolito de Registros — VIGENTE desde el 2026-10-28

> **Qué es.** El plan de retirada de `public/registros/engine.js`. Sustituye a `04-refactor-plan.md` (junio) y al plan
> del artifact del 2026-08-11 que su aviso citaba: los dos describen otro monolito (§1). Lo pidió el usuario el
> 2026-10-28 («Plan nuevo, medido, en el repo»).
> **Las cifras.** Cada una lleva su fecha y el comando que da la del día. Un plan que se lee sin volver a medir miente
> a las pocas semanas: el aviso de 04 caducó tres veces por escribirlas sin eso.
> **Lo que NO es.** Una lista de tareas en curso. Ninguna tajada se empieza sin consultarla (el método del proyecto:
> análisis → consulta → cambio quirúrgico → verificación), y el orden en que se aborda la deuda lo fija la lista de
> trabajo del usuario, no este documento.

## 0. La regla de oro

**Estrangular, no reescribir.** El motor es lógica validada contra datos reales y un GAS desplegado; reescribirlo
arriesga regresiones que ninguna prueba cazaría a tiempo. Cada tajada saca una pieza a un módulo ES con sus pruebas,
deja el motor delegando en ella por el puente `window.__rgLib` (que se asigna ANTES de cargar el motor:
`src/views/registros/index.js`), deja todo funcionando y se publica sola. Y **el gemelo `index (8)` se mueve en el
MISMO cambio** (`CLAUDE.md`, regla 2; lo vigila el pre-push con `verificar-todo --copias`).

## 1. Por qué los dos planes anteriores ya no sirven

| | 04 (2026-06) | artifact (2026-08-11) | hoy (2026-10-28, `977a722`) |
|---|---|---|---|
| Líneas de `engine.js` | 13 149 | 13 971 | **31 278** — `wc -l public/registros/engine.js` |
| Pruebas que cargan el motor | 0 | 0 | **132 archivos** — `grep -rl "registros/engine.js" src --include=*.test.js \| wc -l` |
| `index (8)` | sin versionar | sin versionar | versionado (repo propio en `Music`) y vigilado función a función y por comportamiento |
| El GAS desplegado | — | por re-desplegar | el del repo (su sello es la huella de `Code.gs`: `?p=ver`) |

**Lo que se cumplió:** la red de seguridad (la «Fase A» de 04 y la «tajada 0» del artifact) existe de sobra: el motor
se carga entero en happy-dom en las pruebas, y sus gemelos se comparan función a función (`verificar-3copias-v3`), por
comportamiento (`paridad-fichas-std`, `paridad-repro-reciclaje`, `probar-paridad-mad-*`), en estilos, marcado,
constantes y GAS. El puente `__rgLib` lleva la seguridad, los módulos, el reproductivo y las 7 fichas estándar (su
render vive SÓLO en `src/views/registros/fichas/` desde el 2026-06-13).
**Lo que no:** la plantilla del GAS sigue copiada a mano (3 copias), y siguen en el motor los constructores de los
envíos, la persistencia local, el envío y la cola, y los manejadores en línea. Y el motor creció más del doble: casi
todo lo nuevo de Registros (el registro OPERATIVO de Maduración, Traslado, Score y Auditoría) entró en él.

## 2. Anatomía (medida el 2026-10-28 sobre `977a722`)

Las familias se cuentan por el NOMBRE de cada función de primer nivel (con `acorn`); una función cuenta en la primera
familia que casa. Es una foto para decidir el orden, no una cifra que mantener.

| Familia | Líneas | Funciones | Nota |
|---|---:|---:|---|
| Maduración (`mad*`, desoves, Broodstock, reproductivo) | 9 571 | 735 | La INTERFAZ del registro operativo vive sólo aquí; su LÓGICA tiene gemelo en `registros/lib` (`mad-libro.js`, `mad-resumen.js`, `ficha-maduracion-*.schema.js`), igualado por pruebas de paridad |
| Resto (fichas estándar, UI, utilidades) | 4 436 | 297 | |
| Plantilla del GAS (`GAS()`) | 2 146 | 1 | Un template literal de 2 142 líneas: `GAS/Code.gs` copiado |
| Traslado (`tras*`) | 1 730 | 102 | Idéntico en las tres copias (`verificar-3copias-v3`, bloque de Traslado) |
| Envío, cola y sincronización | 1 483 | 44 | Escribe en el libro de producción |
| Microbiología y agua | 1 405 | 109 | |
| Score y Auditoría del AsT | 1 155 | 90 | |
| Biología molecular (`bio*`) | 1 149 | 76 | |
| PDF, QR, fotos y evidencias | 1 064 | 30 | |
| Almacenamiento local | 590 | 58 | |
| Grilla y celdas | 550 | 32 | |
| Fuera de funciones (constantes, datos, comentarios) | 5 995 | — | |

Otras cifras del mismo día: 1 575 funciones de primer nivel; **22 constructores de envíos**
(`grep -oE "function build[A-Za-z]*Payload" public/registros/engine.js | sort -u`); **67 claves `larv4_`**
(`grep -oE "larv4_[A-Za-z0-9_]+" public/registros/engine.js | sort -u | wc -l`); 207 accesos a `localStorage`; **268
`onclick` en línea** (`grep -o 'onclick=' public/registros/engine.js | wc -l`); 10 `fetch(`.

## 3. Lo que no se puede romper

- **Las claves `larv4_`** están en el navegador de cada equipo, con trabajo sin enviar: renombrar una es perderlo.
- **El contrato con el GAS:** las hojas, sus llaves (varias POSICIONALES: cambiar una columna de sitio es una
  MIGRACIÓN), las firmas de esquema y el sello `GAS_VERSION` en las tres copias. Un cambio de `Code.gs` se publica el
  MISMO día: re-desplegar el GAS → push → repartir `index (8)`.
- **El puente `__rgLib`**, asignado antes de cargar el motor.
- **La cola sin conexión** y las fichas selladas de Maduración (`_madPostConSello`): un envío que se pierde no avisa.
- **`index (8)`**, que es lo que tienen los equipos: un único archivo, sin servidor del que importar módulos.

## 4. La decisión que condiciona todo: el gemelo `index (8)` 🙋

Hoy cada cambio del motor se hace DOS veces, y lo que se saca a un módulo ES vuelve a `index (8)` como copia en línea
(las 29 contrapartes de `__rgLib` que cuenta `verificar-3copias-v3`). Mientras sea así, sacar código del motor no
quita trabajo: lo cambia de sitio. Dos caminos:

- **A · Generar `index (8)` desde el repo.** Un script que junte `shell.html`, el CSS de Registros sin prefijo,
  `engine.js`, los módulos del puente (en línea) y SheetJS, y escriba `Music\index (8).html`. Desaparece la doble
  edición y cada tajada pasa a restar de verdad. Cómo se entra sin riesgo: primero el generador produce una copia y se
  compara con la actual (`paridad-fichas-std`, `verificar-3copias-v3` y los humos de `index (8)`) hasta que coincidan;
  sólo entonces sustituye a la edición a mano.
- **B · Seguir con el gemelo a mano.** Las tajadas de abajo siguen valiendo, pero cada una cuesta el doble, y su
  verificación es la de siempre (`verificar-todo --copias`).

## 5. Las tajadas, en orden de riesgo

Cada una: qué, por qué, cómo se verifica y cuándo está hecha. Ninguna cambia lo que ve ni lo que guarda el usuario.

1. **La plantilla del GAS, generada** (riesgo bajo). `GAS()` es `Code.gs` copiado a mano en dos sitios. Un script la
   escribe en `engine.js` e `index (8)` desde `Code.gs` (los dos escapes del template literal y los dos valores
   parametrizados se derivan). *Verificación:* `comparar-gas-4copias` y `gas-version.test.js` en verde sin edición a
   mano. *Hecha:* tocar `Code.gs` ya no exige copiarlo.
2. **Maduración delega en `registros/lib` lo que ya tiene gemelo** (riesgo medio). Hoy la misma regla (el libro, el
   Saldo, los esquemas) vive dos veces, igualada por las paridades `probar-paridad-mad-*`; delegar quita la copia del
   motor. *Verificación:* las paridades pasan a comprobar que el motor DELEGA, más la suite y los humos de
   `index (8)`. *Hecha:* sin gemelo en línea de esas funciones. Con el camino B, `index (8)` conserva sus copias.
3. **La persistencia local, declarada** (riesgo medio). Las 67 claves en un módulo con su nombre, su caducidad y quién
   las escribe, **sin renombrar ninguna**: hacerlas visibles y comprobables, no cambiarlas. *Verificación:* una prueba
   de inventario (todas las del motor están declaradas) y la suite. *Hecha:* ninguna clave fuera del módulo.
4. **Los constructores de los envíos** (riesgo medio-alto). Los 22 deciden qué llega a cada hoja; las cabeceras ya
   viven en los esquemas de `registros/lib`. Salen uno a uno, cada uno con su prueba de cabecera contra el GAS (llave y
   firma). *Verificación:* las pruebas de envío existentes, la de cada esquema contra el GAS real (por `doPost`, como
   `mad-zonas.test.js`) y, al publicar, un envío real de cada hoja tocada. *Hecha:* el motor sólo llama.
5. **El envío, la cola y la sincronización** (riesgo alto: el último). Escribe en producción. No empieza sin la 3 y
   la 4 hechas y sin el GAS desplegado = el del repo. *Verificación:* las pruebas de cola, reintento y huella, más
   una sesión real sin conexión. *Hecha:* el motor no tiene `fetch`.
6. **Los `onclick` en línea** (independiente, riesgo bajo por grupo). Por delegación con `data-action`, un grupo por
   commit; se puede intercalar entre tajadas de más riesgo. *Hecha:* `grep -o 'onclick=' public/registros/engine.js`
   da 0.

## 6. Cómo medir el avance

- El tamaño: `wc -l public/registros/engine.js`, y el de la familia que se trabaja, con la lista de sus funciones.
- Lo que sigue en línea en `index (8)`: `node verificar-3copias-v3.mjs` (utillaje) dice cuántas contrapartes de
  `__rgLib` lleva.
- Que nada se rompió: la suite como la CI, `verificar-todo` completo (con las paridades de Maduración) y los humos de
  `index (8)`.

## 7. Decisiones abiertas 🙋

1. `index (8)`: generado (A) o a mano (B) — §4. Es la que más cambia el coste de todo lo demás.
2. Cuándo se aborda la deuda: la lista de trabajo la tiene «al final».
3. El orden: la 1 primero (la mejor relación entre trabajo quitado y riesgo); la 6, cuando convenga un respiro.
