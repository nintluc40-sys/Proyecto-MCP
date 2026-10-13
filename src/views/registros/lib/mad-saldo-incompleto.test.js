// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · UN LIBRO A MEDIAS NO PUEDE PASAR POR ENTERO

   Dos defectos reales del 2026-09-09, los dos en el mismo camino y ninguno visible para la
   suite, el lint ni las tres copias «a la par».

   1 · EL RECORTE MUDO. `sheetRows` del GAS corta a 5000 filas y desde el 2026-09-09 lo DICE
       (`truncated` + `limit`), pero el cliente tiraba ese aviso: `_reproFetchSheet` devolvía
       `j.rows` y nada más. El libro mayor SUMA sobre lo devuelto, así que media hoja daba un
       saldo incompleto que la vista cantaba como «✅ Sin discrepancias» — exactamente la
       señal que ese módulo existe para dar. `Maduración Tanques` crece hasta 38 filas al día:
       el tope no es teórico.

   2 · LA PROPUESTA IMPOSIBLE. `_madSalasPintaEstado` hacía `selEl.value = est` sin comprobar
       que el desplegable tuviera ese valor. Asignar a un `<select>` un valor que no está
       entre sus opciones NO da error: lo deja EN BLANCO. Y esta vista es la única del módulo
       que GUARDA lo propuesto, así que borraba el Estado que el operario ya hubiera puesto y
       encima lo contaba como «propuesto» en el rótulo. No era teórico: hasta ese mismo día un
       lote cerrado que volvía a recibir animales hacía que `madEstadoDeSala` devolviera
       «Cerrado», que este desplegable no tiene.

   🔑 POR QUÉ AQUÍ Y NO EN LA PARIDAD. Nada de esto tiene gemelo en `src/`: vive sólo en el
   monolito, que está fuera de ESLint y de vitest. Se arranca el monolito ENTERO sobre
   happy-dom (la receta del banco de `engine.js`) y se ejercen las funciones REALES.

   ⚠ El libro de los casos de abajo se construye A MANO, con la forma que devuelve
   `madConstruirLibro`. Es a propósito: permite fijar el estado imposible («Cerrado» con
   animales) sin depender de que siga siendo alcanzable — la guarda tiene que aguantar
   aunque el camino que lo producía se cierre, que es justo lo que pasó ese día.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madLibroIncompleto', '_madSalasPintaEstado', 'renderMadSalas',
  '_collectSalasGrid', 'madEstadoDeSala', 'MAD_SALA_OPTS', 'MAD_EST_CUAR', 'MAD_EST_PROD',
  'madSaldoCargar', 'MAD_LIBRO_SHEETS', '_madSaldoHTML', 'MAD_EST_CERRADO', 'MAD_EST_MIXTO',
  'madSaldoRefrescar', '_madIngGasAlDia', '_reproFetchSheet', 'MAD_TRAT_SHEET', 'MAD_DESOVE_SHEET'];
const H = {};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };

  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);

  /* ⚠ `new Function` NO deja nada en globalThis: sin este epílogo el monolito se ejecuta
     entero y no se puede tocar ni una de sus funciones. Es la trampa nº 1 del banco. */
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    /* Acceso a las dos cachés de lectura, que son `var` del monolito: permite construir el
       libro sin red, con las hojas ya «leídas» y el aviso de recorte que habría dado el GAS. */
    + '\ntry{ H.setLecturas=function(hojas, trunc){ _reproSheets=hojas; _reproTrunc=trunc; }; }catch(_){}'
    /* A2: sustituir la pregunta a ?p=ver y la lectura de una hoja, para contar sin red. */
    + '\ntry{ H.setRed=function(gas, leer){ _madIngGasAlDia=gas; _reproFetchSheet=leer; }; }catch(_){}'
    + '\ntry{ H.getResumen=function(){ return _madResumen; }; }catch(_){}'
    + '\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

/* Libro con la forma REAL de `madConstruirLibro`: objetos planos (el monolito no usa Map).
   `estado` lo deduce `madEstadoDeLote` de `ingreso`/`copulaDesde`/`cerrado`, así que se dan
   esos campos y no el estado ya masticado — si no, la prueba no ejercería la deducción. */
const libroCon = (lote, extra) => Object.assign({
  posiciones: [],
  tanques: { 'Sala 1|1': { sala: 'Sala 1', tanque: 1, machos: 10, hembras: 10,
    composicion: [{ lote: 'AB', codigoGenetico: 'CG1', machos: 10, hembras: 10 }] } },
  lotes: { AB: Object.assign({ lote: 'AB', ingreso: '2026-01-01', copulaDesde: null, cerrado: null,
    machos: 10, hembras: 10, ubicaciones: ['Sala 1|1'] }, lote) },
  avisos: [], hasta: '2026-01-01', fallos: [], recortadas: [],
}, extra || {});

const selEstado = (si) => document.querySelector(`[name="sg_${si}_estado"]`);
const nota = () => document.getElementById('sal-estado-nota');

describe('Maduración · el veredicto de «este libro no se puede creer»', () => {
  it('un libro entero no tiene nada que decir', () => {
    expect(H.madLibroIncompleto(libroCon())).toBe('');
  });

  it('una hoja ILEGIBLE lo dice, y la nombra', () => {
    const v = H.madLibroIncompleto(libroCon(null, { fallos: ['Maduración Ingreso'] }));
    expect(v).toContain('Maduración Ingreso');
    expect(v).not.toBe('');
  });

  it('🔴 una hoja RECORTADA también lo dice: leerla a medias no es haberla leído', () => {
    const v = H.madLibroIncompleto(libroCon(null, { recortadas: ['Maduración Tanques'] }));
    expect(v).toContain('Maduración Tanques');
    expect(v).toContain('RECORTADA');
  });

  it('las dos a la vez se dicen las dos, no una', () => {
    const v = H.madLibroIncompleto(libroCon(null, {
      fallos: ['Maduración Ingreso'], recortadas: ['Maduración Tanques'],
    }));
    expect(v).toContain('Maduración Ingreso');
    expect(v).toContain('Maduración Tanques');
  });

  it('un libro sin los campos (GAS viejo, o llamada antigua) no revienta ni inventa aviso', () => {
    expect(H.madLibroIncompleto({})).toBe('');
    expect(H.madLibroIncompleto(null)).toBe('');
  });
});

describe('Maduración · la propuesta de Estado de sala sólo escribe lo que se puede guardar', () => {
  const pinta = (libro) => { H.renderMadSalas(); H._madSalasPintaEstado(libro); };

  it('el fixture ejerce algo: con un estado NORMAL, propone y lo cuenta', () => {
    /* Sin este caso, los dos de abajo podrían pasar por el motivo equivocado —que la
       propuesta no escriba NUNCA— y estarían verdes sin significar nada.
       ⚠ 2026-09-14: la sala va LLENA (8 de sus 15 tanques). Con un solo tanque ocupado el estado
       propuesto es ahora «Desinfección - Producción agrupada», que tiene su propia prueba. */
    const l = libroCon({ ingreso: '2026-01-01', copulaDesde: '2026-01-03' });
    for (let t = 2; t <= 8; t++) {
      l.tanques['Sala 1|' + t] = { sala: 'Sala 1', tanque: t, machos: 10, hembras: 10,
        composicion: [{ lote: 'AB', codigoGenetico: 'CG1', machos: 10, hembras: 10 }] };
    }
    pinta(l);
    expect(selEstado(0).value).toBe(H.MAD_EST_PROD);
    expect(nota().innerHTML).toContain('Propuesto');
  });

  it('🔴 un estado que el desplegable NO tiene deja la casilla como estaba, y lo avisa', () => {
    /* El caso real: «Cerrado». El desplegable de «Maduración Sala» sólo tiene —, Cuarentena,
       Producción y Mixto. Antes del arreglo esto vaciaba la casilla EN SILENCIO y lo contaba
       como propuesta; y esta vista es la única del módulo que GUARDA lo propuesto. */
    H.renderMadSalas();
    selEstado(0).value = 'Producción';                       // lo que el operario ya tenía
    H._madSalasPintaEstado(libroCon({ ingreso: '2026-01-01', cerrado: '2026-01-05' }));
    expect(selEstado(0).value).toBe('Producción');           // antes del arreglo: ''
    expect(nota().innerHTML).toContain('Sala 1');
    expect(nota().innerHTML).toContain('Cerrado');
    expect(nota().innerHTML).not.toContain('Propuesto');
  });

  it('🔴 con una hoja RECORTADA no rellena nada: una propuesta a medias aquí se GUARDA', () => {
    H.renderMadSalas();
    selEstado(0).value = 'Cuarentena';
    H._madSalasPintaEstado(libroCon({ copulaDesde: '2026-01-03' }, { recortadas: ['Maduración Tanques'] }));
    expect(selEstado(0).value).toBe('Cuarentena');           // intacto
    expect(nota().innerHTML).toContain('RECORTADA');
    expect(nota().innerHTML).toContain('no se ha rellenado nada');
  });
});

/* ── Y la mitad que no se puede ejercer sin red: que el aviso del GAS se recoja ──────────
   `_reproFetchSheet` habla con Google. Lo que sí se puede fijar es la FORMA: que el aviso se
   anote al leer y que el libro lo consulte. Es una comprobación estructural, como
   `handlers-existen`, y cubre la familia entera en vez del caso concreto. */
describe('Maduración · el aviso de recorte del GAS llega hasta el libro', () => {
  const src = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

  it('la lectura ANOTA el recorte, y lo hace en cada lectura buena', () => {
    expect(src).toContain('_reproTrunc[name] = !!j.truncated;');
    // Antes del `return`, o se anotaría después de salir de la función.
    const i = src.indexOf('_reproTrunc[name] = !!j.truncated;');
    const j = src.indexOf('return j.rows || [];');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(j);
  });

  it('el libro consulta las CUATRO hojas que suma', () => {
    const b = src.slice(src.indexOf('async function madSaldoCargar('), src.indexOf('function _madSaldoAvisoHTML('));
    expect(b).toContain('const recortadas = []');
    expect(b).toContain('_madLibro.recortadas = recortadas;');
    for (const k of ['ingreso', 'movimientos', 'tanques', 'cierres', 'mortDesove']) {
      expect(b).toContain('MAD_LIBRO_SHEETS.' + k);
    }
  });

  /* ⚠⚠ LA COMPROBACIÓN QUE MÁS VALE. Los CUATRO consumidores del libro tienen que dar el
     MISMO veredicto: si uno se queda mirando `libro.fallos` por su cuenta, dirá «✅» sobre un
     libro recortado y nadie se enterará hasta que las cifras no cuadren. Es la misma familia
     del hueco de `estadoPorLoteTexto`: una copia que se queda atrás en silencio. */
  it('🔴 ningún consumidor deduce el veredicto por su cuenta', () => {
    expect(src).not.toContain('!!(libro.fallos && libro.fallos.length)');
    expect(src).not.toContain('(libro.fallos&&libro.fallos.length)');
    // Y los cuatro pasan por el mismo sitio.
    expect(src.split('madLibroIncompleto(libro)').length - 1).toBeGreaterThanOrEqual(4);
  });
});

/* ── 2026-09-13 · la otra mitad, ejercida y no sólo leída ──────────────────────────────
   El banco de mutación destapó un hueco en la comprobación estructural de arriba: vaciando
   el bucle que recoge las hojas recortadas, `recortadas` se quedaba en [] y NINGUNA prueba se
   ponía roja, porque sólo se miraba que la variable existiera. El resultado habría sido el
   defecto entero de vuelta —un saldo sobre media hoja cantado como completo—. Aquí se
   construye el libro de verdad, sin red: con las cuatro hojas ya leídas y una marcada como
   recortada por el GAS, como la dejaría `_reproFetchSheet`. */
describe('Maduración · el libro RECOGE el aviso de recorte al construirse', () => {
  const leidas = () => {
    const h = {};
    for (const k of ['ingreso', 'movimientos', 'tanques', 'cierres', 'mortDesove']) h[H.MAD_LIBRO_SHEETS[k]] = [];
    return h;
  };

  /* 🔴 2026-09-16 · ESTE BLOQUE DECÍA «sin red» Y SALÍA A PRODUCCIÓN. `setLecturas` deja las hojas
     puestas, sí, pero `madSaldoCargar` pregunta antes a `?p=ver` y ese portón NO estaba sustituido:
     cada una de las tres pruebas lanzaba un fetch REAL al GAS de producción y esperaba a que el
     navegador falso lo bloqueara por CORS. Verde, pero lento y a merced de la red.
     Se destapó al entrar la comparación de sello (R4): el trabajo extra empujó la primera prueba
     por encima del timeout de 5 s. Una prueba que falla según cómo vaya internet no mide nada, así
     que la red se sustituye AQUÍ — que es lo que el comentario de arriba ya afirmaba. */
  const originales = {};
  beforeAll(() => { originales.gas = H._madIngGasAlDia; originales.leer = H._reproFetchSheet; });
  afterAll(() => H.setRed(originales.gas, originales.leer));
  beforeEach(() => H.setRed(async () => true, originales.leer));   // el GAS desplegado es el de esta app

  it('el fixture ejerce algo: sin recortes, el libro sale entero y sin fallos', async () => {
    H.setLecturas(leidas(), {});
    const libro = await H.madSaldoCargar(false);
    expect(libro.recortadas).toEqual([]);
    expect(libro.fallos).toEqual([]);
    expect(H.madLibroIncompleto(libro)).toBe('');
  });

  it('🔴 una hoja que el GAS devolvió RECORTADA llega al libro y al veredicto', async () => {
    H.setLecturas(leidas(), { [H.MAD_LIBRO_SHEETS.tanques]: true });
    const libro = await H.madSaldoCargar(false);
    expect(libro.recortadas).toEqual([H.MAD_LIBRO_SHEETS.tanques]);
    expect(H.madLibroIncompleto(libro)).toContain('RECORTADA');
  });

  it('un aviso de recorte de una hoja que el libro NO suma no lo contamina', async () => {
    H.setLecturas(leidas(), { 'Maduración MATRIZ': true });
    const libro = await H.madSaldoCargar(false);
    expect(libro.recortadas).toEqual([]);
  });
});

/* ── 2026-09-15 · A2 → 2026-10-12 · 3.15 (b): LAS LECTURAS DEL SALDO NO DEPENDEN DEL SELLO ────────────
   A2 hacía que 🔄 Recalcular preguntara a ?p=ver UNA vez y pasara la respuesta al libro y al resumen; con
   «otro GAS», Mortalidad Desove se daba por vacía SIN pedirla y Tratamientos no se pedía. Pero un sello
   distinto no es un GAS sin la hoja: el 09-10 (app 29b3, GAS 7c03) la hoja tenía filas y el Saldo daba
   +2 ♀. Desde el 12-10 nadie pregunta: las hojas se leen siempre y sólo «Hoja no permitida» (el GAS aún no
   la conoce, A1) las da por vacías.
   ?p=ver contesta aquí «otro GAS» (false): si alguien volviera a atar la lectura al sello, se notaría.
   ⚠ El fallo de los fixtures es un fallo de VERDAD salvo donde se dice: «Hoja no permitida» NO es un fallo
   (A1), y con él estas pruebas medirían lo contrario de lo que dicen. */
describe('Maduración · 3.15 (b) · el Saldo lee sin mirar el sello', () => {
  let preguntas = 0, hojas = {}, pedidas = [];
  const fila = { Fecha: '2026-10-09', Lote: 'AB', 'Tipo de tanque': 'Desove', 'Hembras que entran': 10, 'Hembras muertas': 2 };
  const red = (error) => {
    preguntas = 0; hojas = {}; pedidas = [];
    const nuevas = [H.MAD_LIBRO_SHEETS.mortDesove, H.MAD_TRAT_SHEET];
    H.setLecturas(hojas, {});
    H.setRed(async () => { preguntas++; return false; },
      async (hoja) => {
        pedidas.push(hoja);
        if (!nuevas.includes(hoja)) return [];
        if (error) throw new Error(error);
        return hoja === H.MAD_LIBRO_SHEETS.mortDesove ? [fila] : [];
      });
  };
  const originales = {};
  beforeAll(() => { originales.gas = H._madIngGasAlDia; originales.leer = H._reproFetchSheet; });
  afterAll(() => H.setRed(originales.gas, originales.leer));

  it('🔴 con OTRO GAS que sí tiene las hojas nuevas, se leen: sus filas llegan al libro y el resumen no avisa', async () => {
    red();
    await H.madSaldoRefrescar();
    const R = H.getResumen();
    expect(preguntas, 'el Saldo volvió a preguntar a ?p=ver').toBe(0);
    expect(hojas[H.MAD_LIBRO_SHEETS.mortDesove], 'Mortalidad Desove se dio por vacía').toEqual([fila]);
    expect(pedidas).toContain(H.MAD_TRAT_SHEET);
    expect(R.libro.fallos).toEqual([]);
    expect(R.faltan).toEqual([]);
  });

  it('🔴 los demás llamadores del libro tampoco preguntan, y leen la quinta hoja', async () => {
    red();
    const libro = await H.madSaldoCargar(true);
    expect(preguntas).toBe(0);
    expect(hojas[H.MAD_LIBRO_SHEETS.mortDesove]).toEqual([fila]);
    expect(libro.fallos).toEqual([]);
  });

  /* ── 2026-09-15 · A1: una hoja que el GAS aún no conoce está VACÍA, no ilegible ──────────
     El defecto: sólo se daba por vacía cuando ?p=ver CONTESTABA «GAS viejo». Sin respuesta en
     6 s se leía, el GAS devolvía «Hoja no permitida», el error se tragaba y la hoja quedaba sin
     entrada → el Saldo se declaraba INCOMPLETO en rojo sin faltar un dato, que es exactamente
     la señal que esta vista existe para dar. Es seguro darla por vacía porque las fichas de esas
     hojas se niegan a enviar contra un GAS que no las conoce: no puede tener filas de esta app.
     ⚠ Lo que NO se relaja: cualquier otro error sigue contando como fallo — lo fija la última. */
  it('🔴 «Hoja no permitida» NO deja el libro incompleto: la hoja queda leída y vacía', async () => {
    red('Hoja no permitida');
    await H.madSaldoRefrescar();
    const R = H.getResumen();
    expect(R.libro.fallos).toEqual([]);
    expect(hojas[H.MAD_LIBRO_SHEETS.mortDesove]).toEqual([]);
  });

  it('🔴 y el resumen da su motivo («aún no la tiene»), no «no se pudo leer»', async () => {
    red('Hoja no permitida');
    await H.madSaldoRefrescar();
    const R = H.getResumen();
    expect(R.faltan).toContain(H.MAD_TRAT_SHEET + ' (el GAS publicado aún no la tiene)');
    expect(R.faltan).not.toContain(H.MAD_TRAT_SHEET);
  });

  it('un fallo de VERDAD sigue dejando el libro incompleto', async () => {
    red('Google devolvió una página de error, no datos');
    await H.madSaldoRefrescar();
    const R = H.getResumen();
    expect(R.libro.fallos).toEqual([H.MAD_LIBRO_SHEETS.mortDesove]);
    expect(R.faltan).toEqual([H.MAD_TRAT_SHEET]);
  });
});

/* ── 2026-09-15 (usuario) · LOS BOTONES LENTOS PIDEN LAS HOJAS A LA VEZ ────────────────────
   «Mejorar tiempos de carga de los botones: Saldo, Proponer estado, Ver vivos, Leer hoja,
   Revisar, Leer saldos y pesos.» Los seis pasan por `madSaldoCargar`, que lee cinco hojas, y
   ⚖️ Recalcular lee tres más. Iban una detrás de otra.

   MEDIDO contra el GAS vivo (`medir-lectura-saldo.mjs`): las ocho, en fila, 13,5 s; a la vez,
   3,4 s (−75 %). Cada petición suelta tarda casi lo mismo en los dos casos, así que el tiempo
   se va en la RED y el servidor sí las atiende a la vez.

   🔑 SE MIDE EL PICO DE PETICIONES VIVAS, no el reloj. Un caso que cronometrara sería lento y
   dependería de la máquina; el pico dice exactamente lo que se quiere saber —¿se pidieron a la
   vez?— y se rompe en cuanto alguien vuelva a encadenarlas con un await. */
describe('Maduración · las hojas se piden en paralelo', () => {
  const originales = {};
  beforeAll(() => { originales.gas = H._madIngGasAlDia; originales.leer = H._reproFetchSheet; });
  afterAll(() => H.setRed(originales.gas, originales.leer));

  /** Sustituye la red contando cuántas lecturas hay VIVAS a la vez. */
  const contador = (respuestaVer, demora) => {
    const est = { vivas: 0, pico: 0, orden: [] };
    H.setLecturas({}, {});
    H.setRed(async () => respuestaVer, async (hoja) => {
      est.vivas++;
      est.pico = Math.max(est.pico, est.vivas);
      await new Promise((r) => setTimeout(r, demora ? demora(hoja) : 5));
      est.vivas--;
      est.orden.push(hoja);
      return [];
    });
    return est;
  };

  it('🔴 el libro pide sus CINCO hojas a la vez', async () => {
    const est = contador(true);
    await H.madSaldoCargar(true);
    expect(est.pico, 'se pidieron de una en una').toBe(5);
  });

  // Punto 2 (2026-10-04) · eran OCHO: el resumen lee también «Maduración Alimentación» (sus pesos tecleados).
  it('🔴 ⚖️ Recalcular pide las NUEVE a la vez: el libro y las del resumen', async () => {
    const est = contador(true);
    await H.madSaldoRefrescar();
    expect(est.pico, 'el resumen esperó a que terminara el libro').toBe(9);
  });

  // 3.15 (b) (2026-10-12) · eran CUATRO: con otro GAS la hoja nueva no se pedía. Ya no depende del sello.
  it('🔴 con OTRO GAS siguen siendo cinco: la hoja nueva se pide igual', async () => {
    const est = contador(false);
    await H.madSaldoCargar(true);
    expect(est.pico).toBe(5);
  });

  /* 🔑 PV7 (2026-09-16) · el comentario de madSaldoCargar lo AFIRMA —«estas CUATRO arrancan sin esperar a
     ?p=ver: mientras el GAS contesta quién es, ellas ya están viajando»— y ninguna prueba lo miraba: con un
     ?p=ver instantáneo, preguntar primero y leer después da el MISMO pico. Aquí ?p=ver no contesta hasta que la
     prueba lo suelta, y se cuenta cuántas lecturas hay en vuelo mientras tanto.
     3.15 (b) (2026-10-12) · ahora son las CINCO: el libro ya no pregunta a ?p=ver. */
  it('🔴 las cinco hojas arrancan SIN esperar a que ?p=ver conteste', async () => {
    let soltar;
    const ver = new Promise((r) => { soltar = r; });
    const est = { vivas: 0 };
    H.setLecturas({}, {});
    H.setRed(async () => { await ver; return true; }, async () => {
      est.vivas++;
      await new Promise((r) => setTimeout(r, 30));
      est.vivas--;
      return [];
    });
    const carga = H.madSaldoCargar(true);
    await new Promise((r) => setTimeout(r, 5));
    const enVueloMientrasPregunta = est.vivas;
    soltar();
    await carga;
    expect(enVueloMientrasPregunta, 'esperaron a que ?p=ver contestara para salir').toBe(5);
  });

  it('🔴 el orden de los avisos es el de la FICHA, no el de la red', async () => {
    /* La hoja de Sala se hace la lenta y Tratamientos contesta la primera. Si `faltan` se armara
       por orden de llegada, el mismo problema saldría listado distinto en cada recálculo y se
       leería como si hubiera cambiado la causa. */
    const lento = (hoja) => (hoja === 'Maduración Sala' ? 30 : 1);
    const est = contador(true, lento);
    H.setRed(async () => true, async (hoja) => {
      est.vivas++;
      await new Promise((r) => setTimeout(r, lento(hoja)));
      est.vivas--;
      throw new Error('Google devolvió una página de error, no datos');
    });
    await H.madSaldoRefrescar();
    expect(H.getResumen().faltan).toEqual(['Maduración Sala', H.MAD_DESOVE_SHEET, H.MAD_TRAT_SHEET,
      'Maduración Alimentación (los pesos tecleados en ella no se cuentan)']);   // punto 2: sólo aporta pesos, y se dice así
  });
});

/* ── 2026-09-13 · V1: el color de «Cerrado» en la vista Saldo ───────────────────────────
   La tanda B le dio a «Cerrado» un color PROPIO: con dos ramas caía en el verde de Producción,
   y un lote terminado pintado como uno en producción se lee mal justo cuando más importa.
   Ninguna prueba lo miraba — se comprobó al montar su banco de mutación. */
describe('Maduración · la vista Saldo pinta «Cerrado» con su propio color', () => {
  const lote = (nombre, estado) => ({ lote: nombre, ingreso: '2026-01-01', copulaDesde: null, cerrado: null,
    estado, machos: 0, hembras: 0, ubicaciones: [] });
  const insignia = (html, nombre) => {
    const caja = document.createElement('div');
    caja.innerHTML = html;
    const fila = Array.from(caja.querySelectorAll('tr')).find((tr) => tr.cells[0] && tr.cells[0].textContent === nombre);
    return fila ? fila.querySelector('span').getAttribute('style') : '';
  };
  const html = () => H._madSaldoHTML({ tanques: {}, avisos: [], fallos: [], recortadas: [],
    lotes: { AB: lote('AB', H.MAD_EST_PROD), CD: lote('CD', H.MAD_EST_CERRADO), EF: lote('EF', H.MAD_EST_CUAR) } });

  it('el fixture ejerce algo: Producción va en verde y Cuarentena en ámbar', () => {
    expect(insignia(html(), 'AB')).toContain('#dcfce7');
    expect(insignia(html(), 'EF')).toContain('#fef3c7');
  });

  it('🔴 un lote CERRADO no se pinta con el verde de Producción', () => {
    const estilo = insignia(html(), 'CD');
    expect(estilo).toContain('#e2e8f0');
    expect(estilo).not.toContain('#dcfce7');
  });
});

/* 2026-09-14 (usuario) · UN LOTE PUEDE ESTAR EN VARIAS SALAS, y su cuarentena es de cada sala. El
   saldo «Por lote» dice «Mixto» cuando sus salas no coinciden —con color propio, no el verde de
   Producción— y nombra el estado de cada sala: «Mixto» sin desglose no dice cuál es cuál. */
describe('Maduración · la vista Saldo dice el estado del lote en CADA sala', () => {
  const fila = (html, nombre) => {
    const caja = document.createElement('div');
    caja.innerHTML = html;
    return Array.from(caja.querySelectorAll('tr')).find((tr) => tr.cells[0] && tr.cells[0].textContent === nombre);
  };
  const html = () => H._madSaldoHTML({ tanques: {}, avisos: [], fallos: [], recortadas: [], lotes: {
    AB: { lote: 'AB', ingreso: '2026-01-20', copulaDesde: null, cerrado: null, estado: H.MAD_EST_MIXTO, machos: 15, hembras: 15,
      ubicaciones: ['Sala 1|1', 'Sala 2|16'], salas: [{ sala: 'Sala 1', estado: H.MAD_EST_PROD }, { sala: 'Sala 2', estado: H.MAD_EST_CUAR }] },
    BC: { lote: 'BC', ingreso: '2026-01-02', copulaDesde: null, cerrado: null, estado: H.MAD_EST_PROD, machos: 10, hembras: 10,
      ubicaciones: ['Sala 1|2'], salas: [{ sala: 'Sala 1', estado: H.MAD_EST_PROD }] },
  } });

  it('🔴 con el lote en dos salas, cada una con su estado, y «Mixto» con color propio', () => {
    const f = fila(html(), 'AB');
    expect(f.cells[6].textContent).toBe('Sala 1: Producción · Sala 2: Cuarentena');
    expect(f.querySelector('span').getAttribute('style')).toContain('#e0f2fe');
    expect(f.querySelector('span').getAttribute('style')).not.toContain('#dcfce7');
  });

  it('con una sola sala basta su nombre (el estado ya va en su columna)', () => {
    expect(fila(html(), 'BC').cells[6].textContent).toBe('Sala 1');
  });
});
