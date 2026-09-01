/* ============================================================
   H1 · «encolado» NO es un error — y las 28 llamadas lo saben

   `postPayload` devuelve true SÓLO con "ok". Un envío ENCOLADO devuelve false, así que
   16 de las 28 rutas caían en su `else` y gritaban «No fue posible sincronizar — revisa
   la conexión» justo cuando el sistema había hecho bien su trabajo: el dato estaba a
   salvo en la cola y se entrega solo al reconectar. Desde el camión, ese mensaje empuja
   a reenviar a mano algo que ya estaba entregado.

   Lo que se fija aquí, por orden de importancia:
     A · NINGUNA llamada a postPayload puede volver a ir sin `opts`. Es una prueba
         ESTRUCTURAL sobre el fuente: la única que caza el defecto cuando alguien añade
         una ruta nueva mañana, que es exactamente como nacieron las 16.
     B · Los `kind` de las marcas EXISTEN en `_reconcileMark`. Una marca con un kind que
         nadie reconoce es peor que no ponerla: parece que reconcilia y no reconcilia
         nada, sin dar un solo síntoma.
     C · El clasificador `_syncAllBucket` distingue cola / en-curso / error de verdad.
     D · `_madReproNotOk` no llama error a lo que está en cola.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const engine = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

/** Extrae funciones del motor y las corre en una caja, con los stubs que pidan. */
function fnDelMotor(nombres, extra = {}) {
  const code = nombres.map((n) => {
    const i = engine.indexOf('function ' + n + '(');
    if (i < 0) throw new Error('no se halló ' + n + ' en engine.js');
    const j = engine.indexOf('\n}\n', i);
    return engine.slice(i, j + 2);
  }).join('\n');
  const ctx = { String, ...extra };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__api = { ' + nombres.join(', ') + ' };').runInContext(ctx);
  return ctx.__api;
}

/* ── A · ninguna llamada sin opts ────────────────────────────────────── */
describe('A · las llamadas a postPayload pasan opts', () => {
  // Se recogen las llamadas REALES del fuente. Es la prueba que caza una ruta nueva
  // escrita mañana sin opts — el defecto no fue escribir mal 16 sitios, fue que nada
  // vigilaba que se escribieran bien.
  const llamadas = engine.split('\n')
    .map((l, i) => ({ n: i + 1, t: l.trim() }))
    .filter((x) => x.t.includes('await postPayload('));

  it('hay llamadas que auditar (el fixture no se ha quedado vacío)', () => {
    expect(llamadas.length).toBeGreaterThanOrEqual(25);
  });

  it('TODAS pasan un tercer argumento', () => {
    // postPayload(payload, url, opts) — una llamada con sólo 2 argumentos es el defecto.
    const desnudas = llamadas.filter((x) => {
      const m = /await postPayload\(([^;]*)\)/.exec(x.t);
      if (!m) return false;
      // cuenta comas de primer nivel dentro de los paréntesis
      let prof = 0, comas = 0;
      for (const c of m[1]) {
        if (c === '(' || c === '[' || c === '{') prof++;
        else if (c === ')' || c === ']' || c === '}') prof--;
        else if (c === ',' && prof === 0) comas++;
      }
      return comas < 2;
    });
    expect(desnudas.map((x) => 'L' + x.n + ': ' + x.t.slice(0, 70))).toEqual([]);
  });
});

/* ── B · los kind de las marcas existen ──────────────────────────────── */
describe('B · toda marca usa un kind que _reconcileMark sabe reconciliar', () => {
  const i = engine.indexOf('function _reconcileMark(');
  const cuerpo = engine.slice(i, engine.indexOf('\n}\n', i));

  const kindsReconocidos = [...cuerpo.matchAll(/mark\.kind === "([a-z:]+)"/g)].map((m) => m[1]);
  const prefijos = [...cuerpo.matchAll(/mark\.kind\.indexOf\("([a-z:]+)"\)/g)].map((m) => m[1]);

  it('_reconcileMark declara los kinds esperados', () => {
    expect(kindsReconocidos).toEqual(expect.arrayContaining(['mic', 'cal', 'pat', 'bio', 'ast', 'tras']));
    expect(prefijos).toContain('mad:');
  });

  it('ningún kind emitido queda huérfano', () => {
    // ⚠ Sólo los kinds de MARCA. Un `/kind\s*:\s*"…"/` a secas también caza
    // `{ kind:"ctx" }` y `{ kind:"param" }`, que son descriptores de COLUMNA del export
    // de Calidad de Agua y no tienen nada que ver con la cola. Ese falso positivo puso
    // roja esta prueba la primera vez.
    const emitidos = [...engine.matchAll(/mark\s*:\s*\{\s*kind\s*:\s*"([^"]*)"/g)].map((m) => m[1]);
    expect(emitidos.length).toBeGreaterThan(0);
    const huerfanos = [...new Set(emitidos)].filter(
      (k) => !kindsReconocidos.includes(k) && !prefijos.some((p) => k.indexOf(p) === 0),
    );
    expect(huerfanos).toEqual([]);
  });

  it('el fixture distingue: un kind inventado SÍ se detectaría', () => {
    // Sin esto, la prueba de arriba pasaría igual si la extracción devolviera [].
    const inventado = ['mad:salas', 'bio', 'kind-que-nadie-reconcilia'];
    const huerfanos = inventado.filter(
      (k) => !kindsReconocidos.includes(k) && !prefijos.some((p) => k.indexOf(p) === 0),
    );
    expect(huerfanos).toEqual(['kind-que-nadie-reconcilia']);
  });

  it('la marca de Maduración de syncAll compone un kind válido', () => {
    // Se emite como "mad:"+f con f ∈ MAD_FICHAS. Si MAD_FICHAS cambiara, loadMad lo
    // rechazaría y la marca sería INERTE sin dar síntoma.
    expect(engine).toContain('kind:"mad:"+f');
    const m = /const MAD_FICHAS\s*=\s*\[([^\]]*)\]/.exec(engine);
    expect(m).toBeTruthy();
    const fichas = m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    expect(fichas).toEqual(['salas', 'tanques', 'lotes']);
    // y loadMad valida contra esa misma lista
    expect(engine).toContain('if(!MAD_FICHAS.includes(ficha)) return [];');
  });
});

/* ── C · el clasificador de syncAll ──────────────────────────────────── */
describe('C · _syncAllBucket', () => {
  function conToast() {
    const dichos = [];
    const api = fnDelMotor(['_syncAllBucket', '_gasMotivo'], {
      toast: (msg, tipo) => dichos.push({ msg, tipo }),
    });
    return { ...api, dichos };
  }

  it('«queued» NO es un fallo y no dice error', () => {
    const { _syncAllBucket, dichos } = conToast();
    expect(_syncAllBucket({ outcome: 'queued' }, 'Salas')).toBe('queued');
    expect(dichos).toHaveLength(1);
    expect(dichos[0].tipo).toBe('info');
    expect(dichos[0].msg).toContain('en cola');
    expect(dichos[0].msg).not.toMatch(/no fue posible/i);
  });

  it('«inflight» no cuenta ni avisa (postPayload ya avisó)', () => {
    const { _syncAllBucket, dichos } = conToast();
    expect(_syncAllBucket({ outcome: 'inflight' }, 'Salas')).toBe('');
    expect(dichos).toHaveLength(0);
  });

  it('«rejected» SÍ es un fallo y enseña el motivo del GAS', () => {
    const { _syncAllBucket, dichos } = conToast();
    expect(_syncAllBucket({ outcome: 'rejected', gasMessage: 'Hoja no permitida' }, 'Datos')).toBe('fail');
    expect(dichos[0].tipo).toBe('err');
    expect(dichos[0].msg).toContain('Hoja no permitida');
    expect(dichos[0].msg).toContain('Datos');
  });

  it('sin outcome (fallo de red sin clasificar) cuenta como fallo', () => {
    const { _syncAllBucket } = conToast();
    expect(_syncAllBucket({}, 'Algas')).toBe('fail');
    expect(_syncAllBucket(null, 'Algas')).toBe('fail');
  });
});

/* ── D · el mensaje del Registro reproductivo ────────────────────────── */
describe('D · _madReproNotOk', () => {
  function conToast() {
    const dichos = [];
    const api = fnDelMotor(['_madReproNotOk', '_gasMotivo'], {
      toast: (msg, tipo) => dichos.push({ msg, tipo }),
    });
    return { ...api, dichos };
  }

  it('los dos envíos en cola → aviso de cola, no error', () => {
    const { _madReproNotOk, dichos } = conToast();
    _madReproNotOk([{ outcome: 'queued' }, { outcome: 'queued' }]);
    expect(dichos[0].tipo).toBe('info');
    expect(dichos[0].msg).toContain('EN COLA');
    expect(dichos[0].msg).toContain('NO lo repitas');
  });

  it('uno entregado y otro en cola sigue siendo cola', () => {
    const { _madReproNotOk, dichos } = conToast();
    _madReproNotOk([{ outcome: 'ok' }, { outcome: 'queued' }]);
    expect(dichos[0].tipo).toBe('info');
  });

  it('un rechazo manda: es error y enseña el motivo', () => {
    const { _madReproNotOk, dichos } = conToast();
    _madReproNotOk([{ outcome: 'queued' }, { outcome: 'rejected', gasMessage: 'Límite de filas excedido' }]);
    expect(dichos[0].tipo).toBe('err');
    expect(dichos[0].msg).toContain('Límite de filas');
  });

  it('sin datos de outcome cae del lado del error', () => {
    const { _madReproNotOk, dichos } = conToast();
    _madReproNotOk([{}, {}]);
    expect(dichos[0].tipo).toBe('err');
  });
});

/* ── E · el resumen de syncAll distingue los tres estados ────────────── */
describe('E · el resumen de syncAll', () => {
  const i = engine.indexOf('async function syncAll(){');
  const cuerpo = engine.slice(i, engine.indexOf('\n}\n\n', i));

  it('lleva un contador de encolados aparte de ok/fail', () => {
    // ⚠ Se afirma que el contador EXISTE y se usa, no cómo está escrita su declaración.
    // Fijar la línea literal hacía la prueba frágil: el banco lo destapó con una
    // reescritura equivalente que debía sobrevivir y la ponía roja.
    expect(cuerpo).toMatch(/\bqueued\s*=\s*0\b/);   // se inicializa
    expect(cuerpo).toMatch(/\bqueued\+\+/);          // y alguien lo incrementa
    expect(cuerpo).toMatch(/\bfail\s*=\s*0\b/);      // sin haber perdido el de fallos
  });

  it('el «todo bien» exige que TAMPOCO haya nada en cola', () => {
    expect(cuerpo).toContain('if(!fail && !queued){');
  });

  it('hay una rama propia para «sólo quedó en cola»', () => {
    expect(cuerpo).toMatch(/else if\(!fail\)\{/);
    expect(cuerpo).toContain('hoja(s) en cola');
  });

  it('ninguna rama de syncAll cuenta un encolado como fallo', () => {
    // Todas las ramas pasan por el clasificador; ningún `fail++` suelto tras un envío.
    const sueltos = cuerpo.split('\n').filter((l) => /fail\+\+/.test(l) && !/_syncAllBucket/.test(l));
    expect(sueltos.map((s) => s.trim())).toEqual([]);
  });
});
