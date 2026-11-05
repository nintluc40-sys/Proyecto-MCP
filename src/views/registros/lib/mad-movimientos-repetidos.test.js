// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · MOVIMIENTOS: EL MISMO DÍA Y LA MISMA RUTA, MÁS DE UNA VEZ (pauta A3, 2026-11-04)

   El defecto: el ID del tramo era fecha + ruta, y el GAS actualiza por ID. El segundo movimiento del día por la misma ruta reemplazaba al
   primero en la hoja, y el saldo perdía esos animales sin ningún error.

   DECISIÓN DEL USUARIO (no re-preguntar): «ID propio y aviso». Cada movimiento va en su propia fila y antes de enviar se avisa si esa ruta
   ya tiene uno ese día. Reintentar un envío fallido y corregir desde el Historial siguen reemplazando su propia fila.

   Motor REAL sobre el shell real; la red, la hoja y el `confirm`, simulados. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMovRows, movRowId, MAD_MOV_HEADERS } from './ficha-maduracion-movimientos.schema.js';
import { construirLibro } from './mad-libro.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madMovGuardar', 'madMovGuardarLocal', 'madMovReiniciar', 'madMovCollect', 'madMovRepetidos', 'madMovBuildRows', 'renderMadMovimientos', 'madHistLeer', 'madHistEditar', 'madLocLeer',
  '_loadSyncQueue', 'flushSyncQueue', '_lastSyncFingerprint', 'madConstruirLibro', 'syncAll', '_madMovFilasGuardadas', 'madMovSalaChange', '_madHistPanelKey', 'madLocGuardar', 'madMovRevisar'];
const H = {};
const hojaEnviada = [];
const toasts = [];
const preguntas = [];
const red = { respuesta: () => 'ok', hoja: null, confirma: true, lecturas: 0 };
const leerHoja = async () => { red.lecturas += 1; return red.hoja; };
const _setTimeout = globalThis.setTimeout;
afterAll(() => { globalThis.setTimeout = _setTimeout; });

beforeAll(async () => {
  /* Sin señal, el motor reintenta a los 1,2 s y vacía la cola a los 8 s: sin esto, ese vaciado caería en medio de otra prueba. */
  globalThis.setTimeout = (f, ms, ...r) => (ms === 8000 ? 0 : _setTimeout(f, ms === 1200 ? 0 : ms, ...r));
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  window.confirm = (t) => { preguntas.push(String(t)); return red.confirma; };
  globalThis.confirm = window.confirm;
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setVerify=function(f){_verifyReqId=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setHoja=function(f){_madHojaFresca=f;}; }catch(_){}'
    + '\ntry{ H.setGasAlDia=function(f){_madIngGasAlDia=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m,t){curMod=m;curTab=t;}; H.MAD_MOD=MAD_MOD; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
  H.setRate(() => true);
  H.setVerify(async () => false);
  H.setGasAlDia(async () => true);
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec');
  H.setHoja(leerHoja);
  H.setPostOnce(async (body) => {
    const r = red.respuesta(body);
    if (r === 'ok') hojaEnviada.push(JSON.parse(JSON.stringify(body)));
    return r;
  });
});

const FECHA = '2026-02-10';
const BASE = FECHA + '-S1t3-S2t16';
const col = (h) => MAD_MOV_HEADERS.indexOf(h);
const ids = () => hojaEnviada.flatMap((p) => p.rows.map((f) => f[col('ID')]));

const q = (s) => document.querySelector('#fp-movimientos ' + s);
const llenar = (machos, hembras, { to = '3', td = '16', sd = 'Sala 2' } = {}) => {
  q('#mv-fecha').value = FECHA;
  q('#mv-tipo').value = 'Transferencia';
  const motivo = q('#mv-motivo');
  motivo.value = [...motivo.options].map((o) => o.value).filter(Boolean)[0];
  q('.mv-so').value = 'Sala 1';
  H.madMovSalaChange(q('.mv-so'));
  q('.mv-to').value = to;
  q('.mv-sd').value = sd;
  H.madMovSalaChange(q('.mv-sd'));
  q('.mv-td').value = td;
  q('.mv-machos').value = String(machos);
  q('.mv-hembras').value = String(hembras);
};

/* happy-dom no respeta el `selected` de un <select> restaurado por innerHTML; un navegador, sí (ver reference_happy-dom-select-value). */
const editarDelHistorial = (id) => {
  H.madHistEditar(id);
  document.querySelectorAll('#fp-movimientos select').forEach((s) => {
    const o = s.querySelector('option[selected]');
    if (o) s.value = o.value;
  });
};

beforeEach(() => {
  globalThis.localStorage.clear();
  H._lastSyncFingerprint.clear();
  hojaEnviada.length = 0;
  toasts.length = 0;
  preguntas.length = 0;
  red.respuesta = () => 'ok';
  red.hoja = null;
  red.confirma = true;
  red.lecturas = 0;
  H.setMod(H.MAD_MOD, 'movimientos');
  H.madMovReiniciar();
});

describe('🔴 el mismo día y la misma ruta, dos veces', () => {
  it('🔴 van en dos filas: el segundo ya no reemplaza al primero', async () => {
    llenar(5, 5);
    await H.madMovGuardar();
    llenar(3, 3);
    await H.madMovGuardar();
    expect(ids().length).toBe(2);
    expect(new Set(ids()).size, 'el mismo ID: el GAS reemplazaría').toBe(2);
    ids().forEach((id) => expect(id.indexOf(BASE + '-')).toBe(0));
    expect(hojaEnviada.map((p) => p.rows[0][col('Machos')])).toEqual([5, 3]);
  });

  it('🔴 el aviso sale con lo enviado desde este equipo, y dice qué hay', async () => {
    llenar(5, 5);
    await H.madMovGuardar();
    expect(preguntas).toEqual([]);
    llenar(3, 3);
    await H.madMovGuardar();
    expect(preguntas.length).toBe(1);
    expect(preguntas[0]).toContain('Sala 1 T3 → Sala 2 T16');
    expect(preguntas[0]).toContain('5 ♂ y 5 ♀');
    expect(preguntas[0]).toContain('este equipo');
    expect(preguntas[0], 'teclearlo otra vez ya no corrige: dice dónde se corrige').toContain('✏️ Editar en 📜 Historial');
  });

  it('🔴 «Cancelar» no envía nada, y lo tecleado se queda', async () => {
    llenar(5, 5);
    await H.madMovGuardar();
    llenar(3, 3);
    red.confirma = false;
    await H.madMovGuardar();
    expect(ids().length).toBe(1);
    expect(q('.mv-machos').value).toBe('3');
    expect(toasts.at(-1)).toContain('NO enviado');
  });

  it('🔴 el aviso sale con lo de otro equipo, leído de la hoja', async () => {
    red.hoja = [{ ID: BASE + '-otroequipo', Machos: 9, Hembras: 8 }];
    llenar(3, 3);
    await H.madMovGuardar();
    expect(preguntas.length).toBe(1);
    expect(preguntas[0]).toContain('9 ♂ y 8 ♀');
    expect(preguntas[0]).toContain('la hoja');
  });

  it('🔴 también con una fila de antes, con el ID sin sufijo, y ésa no se reemplaza', async () => {
    red.hoja = [{ ID: BASE, Machos: 9, Hembras: 8 }];
    llenar(3, 3);
    await H.madMovGuardar();
    expect(preguntas.length).toBe(1);
    expect(ids()[0]).not.toBe(BASE);
  });

  it('🔴 sin poder leer la hoja, y sin nada en este equipo: se envía sin preguntar', async () => {
    red.hoja = null;
    llenar(3, 3);
    await H.madMovGuardar();
    expect(preguntas).toEqual([]);
    expect(ids().length).toBe(1);
  });

  it('🔴 otra ruta, otro día o el tanque 161 en vez del 16 no son la misma ruta', async () => {
    red.hoja = [{ ID: BASE + '1-xx', Machos: 1, Hembras: 1 }, { ID: '2026-02-11-S1t3-S2t16-xx', Machos: 1, Hembras: 1 }, { ID: FECHA + '-S1t3-S3t7-xx', Machos: 1, Hembras: 1 }, { ID: FECHA + '-S1t4-S2t16', Machos: 1, Hembras: 1 }];
    llenar(3, 3);
    await H.madMovGuardar();
    expect(preguntas).toEqual([]);
  });
});

describe('🔴 lo que debe seguir reemplazando su propia fila', () => {
  it('🔴 reintentar un envío rechazado escribe la misma fila', async () => {
    red.respuesta = () => 'rejected';
    llenar(5, 5);
    await H.madMovGuardar();
    expect(q('.mv-machos').value, 'un rechazo no limpia').toBe('5');
    const id = H.madMovBuildRows(H.madMovCollect())[0][col('ID')];
    red.respuesta = () => 'ok';
    await H.madMovGuardar();
    expect(ids()).toEqual([id]);
    expect(preguntas, 'su propia fila no es un repetido').toEqual([]);
  });

  it('🔴 en la cola: se entrega con su ID, y el siguiente formulario lleva otro', async () => {
    red.respuesta = () => 'retry';
    llenar(5, 5);
    await H.madMovGuardar();
    const enCola = H._loadSyncQueue()[0].payload.rows[0][col('ID')];
    expect(q('.mv-machos').value, 'en cola, el formulario se limpia').toBe('');
    red.respuesta = () => 'ok';
    llenar(3, 3);
    await H.madMovGuardar();
    expect(preguntas.length, 'lo que espera en la cola también cuenta').toBe(1);
    await H.flushSyncQueue();
    expect(ids().sort()).toEqual([enCola, ids().find((x) => x !== enCola)].sort());
    expect(new Set(ids()).size).toBe(2);
  });

  it('🔴 corregir desde el Historial reemplaza su fila, sin preguntar', async () => {
    llenar(5, 5);
    await H.madMovGuardar();
    const [id] = ids();
    const entrada = H.madHistLeer().find((e) => e.ficha === 'movimientos');
    editarDelHistorial(entrada.id);
    expect(q('#mv-envio'), 'el panel guardado no trae su identidad').toBeTruthy();
    q('.mv-machos').value = '6';
    red.lecturas = 0;
    await H.madMovGuardar();
    expect(ids()).toEqual([id, id]);
    expect(preguntas).toEqual([]);
    expect(red.lecturas, 'nada que mirar: no se lee la hoja').toBe(0);
    expect(hojaEnviada[1].rows[0][col('Machos')]).toBe(6);
  });

  it('🔴 corregir lo que aún espera en la cola: primero lo viejo y luego la corrección (pauta A1)', async () => {
    red.respuesta = () => 'retry';
    llenar(5, 5);
    await H.madMovGuardar();
    const id = H._loadSyncQueue()[0].payload.rows[0][col('ID')];
    red.respuesta = () => 'ok';
    editarDelHistorial(H.madHistLeer().find((e) => e.ficha === 'movimientos').id);
    q('.mv-machos').value = '6';
    await H.madMovGuardar();
    expect(hojaEnviada.map((p) => [p.rows[0][col('ID')], p.rows[0][col('Machos')]])).toEqual([[id, 5], [id, 6]]);
    expect(H._loadSyncQueue()).toEqual([]);
  });

  it('🔴 corregir uno de dos de la misma ruta tampoco pregunta, y sigue habiendo dos filas', async () => {
    llenar(5, 5);
    await H.madMovGuardar();
    llenar(3, 3);
    await H.madMovGuardar();
    preguntas.length = 0;
    editarDelHistorial(H.madHistLeer().find((e) => e.ficha === 'movimientos').id);
    q('.mv-machos').value = '6';
    await H.madMovGuardar();
    expect(preguntas).toEqual([]);
    expect(new Set(ids()).size).toBe(2);
  });

  it('🔴 corregir un envío de antes, sin sufijo, conserva su ID de siempre', async () => {
    llenar(5, 5);
    await H.madMovGuardar();
    const entrada = H.madHistLeer().find((e) => e.ficha === 'movimientos');
    // Un envío de antes: su panel y sus filas no llevan identidad.
    const clave = H._madHistPanelKey(entrada.id);
    localStorage.setItem(clave, localStorage.getItem(clave).replace(/<input[^>]*id="mv-envio"[^>]*>/, ''));
    editarDelHistorial(entrada.id);
    expect(q('#mv-envio')).toBeNull();
    q('.mv-machos').value = '6';
    await H.madMovGuardar();
    expect(ids().at(-1)).toBe(BASE);
  });

  it('🔴 lo que se corrige mientras se lee la hoja es lo que sale', async () => {
    let soltar;
    H.setHoja(() => new Promise((res) => { soltar = () => res(null); }));
    llenar(5, 5);
    const envio = H.madMovGuardar();
    await Promise.resolve();
    q('.mv-machos').value = '6';
    soltar();
    await envio;
    H.setHoja(leerHoja);
    expect(hojaEnviada[0].rows[0][col('Machos')]).toBe(6);
  });

  it('🔴 🔍 Revisar mira con el mismo ID que luego se envía', async () => {
    llenar(5, 5);
    H.madMovRevisar();
    const envio = q('#mv-envio').value;
    expect(envio).not.toBe('');
    await H.madMovGuardar();
    expect(ids()[0]).toBe(BASE + '-' + envio);
  });

  it('🔴 un formulario limpiado estrena identidad', async () => {
    llenar(5, 5);
    H.madMovGuardarLocal();
    llenar(3, 3);
    H.madMovGuardarLocal();
    const filas = H._madMovFilasGuardadas();
    expect(filas.length).toBe(2);
    expect(new Set(filas.map((f) => f[col('ID')])).size).toBe(2);
  });
});

describe('🔴 lo guardado con 💾', () => {
  it('🔴 dos guardados de la misma ruta: ☁️ pregunta antes de enviar nada, y «Cancelar» no envía', async () => {
    llenar(5, 5);
    H.madMovGuardarLocal();
    llenar(3, 3);
    H.madMovGuardarLocal();
    red.confirma = false;
    await H.madMovGuardar();
    expect(preguntas.length).toBe(1);
    expect(preguntas[0]).toContain('este envío');
    expect(ids()).toEqual([]);
    expect(H._madMovFilasGuardadas().length, 'lo guardado se queda').toBe(2);
  });

  it('🔴 con «Aceptar» salen los dos, cada uno en su fila', async () => {
    llenar(5, 5);
    H.madMovGuardarLocal();
    llenar(3, 3);
    H.madMovGuardarLocal();
    await H.madMovGuardar();
    expect(new Set(ids()).size).toBe(2);
    expect(H._madMovFilasGuardadas()).toEqual([]);
  });

  it('🔴 el 🔄 global también pregunta, y lo retenido se dice', async () => {
    llenar(5, 5);
    H.madMovGuardarLocal();
    red.hoja = [{ ID: BASE + '-otroequipo', Machos: 9, Hembras: 8 }];
    red.confirma = false;
    await H.syncAll();
    expect(preguntas.length).toBe(1);
    expect(ids()).toEqual([]);
    expect(H._madMovFilasGuardadas().length).toBe(1);
    expect(document.body.textContent).toContain('Movimientos pendiente');
    expect(toasts.some((t) => t.includes('NO enviado'))).toBe(true);
  });

  it('🔴 lo guardado con otro esquema no se mira: tampoco se enviará', () => {
    llenar(5, 5);
    H.madMovGuardarLocal();
    const [e] = H.madLocLeer('movimientos');
    e.payload.headers = ['otra'];
    H.madLocGuardar('movimientos', [e]);
    expect(H._madMovFilasGuardadas()).toEqual([]);
  });
});

describe('🔴 madMovRepetidos', () => {
  const FILA = (id, m = 1) => { const f = MAD_MOV_HEADERS.map(() => ''); f[col('ID')] = id; f[col('Fecha')] = FECHA; f[col('Sala origen')] = 'Sala 1'; f[col('Tanque origen')] = 3; f[col('Sala destino')] = 'Sala 2'; f[col('Tanque destino')] = 16; f[col('Machos')] = m; f[col('Hembras')] = m; return f; };

  it('la misma fila no es un repetido, se mire donde se mire', () => {
    const id = BASE + '-a';
    expect(H.madMovRepetidos([FILA(id)], [{ ID: id, Machos: 1, Hembras: 1 }], [{ ficha: 'movimientos', payload: { headers: MAD_MOV_HEADERS, rows: [FILA(id)] } }])).toEqual([]);
  });
  it('🔴 un mismo repetido en la hoja y en el Historial sale una vez', () => {
    const r = H.madMovRepetidos([FILA(BASE + '-a')], [{ ID: BASE + '-b', Machos: 2, Hembras: 2 }], [{ ficha: 'movimientos', payload: { headers: MAD_MOV_HEADERS, rows: [FILA(BASE + '-b', 2)] } }]);
    expect(r.length).toBe(1);
    expect(r[0].donde).toBe('la hoja');
  });
  it('dos filas del mismo envío se avisan una vez, no dos', () => {
    expect(H.madMovRepetidos([FILA(BASE + '-a', 1), FILA(BASE + '-b', 2)], null, null).length).toBe(1);
  });
  it('🔴 lo que no es de Movimientos o tiene otro esquema no cuenta', () => {
    expect(H.madMovRepetidos([FILA(BASE + '-a')], null, [
      { ficha: 'desoves', payload: { headers: MAD_MOV_HEADERS, rows: [FILA(BASE + '-b')] } },
      { ficha: 'movimientos', payload: { headers: ['otra'], rows: [FILA(BASE + '-c')] } },
      null,
    ])).toEqual([]);
  });
  it('una fila de la hoja sin ID no cuenta', () => {
    expect(H.madMovRepetidos([FILA(BASE + '-a')], [{ Machos: 1 }, null], null)).toEqual([]);
  });
});

describe('🔴 el saldo cuenta los dos', () => {
  const ING = (Sala, Tanque, Machos, Hembras) => ({ Fecha: '2026-01-01', Lote: 'XA', 'Código genético': 'CG-1', 'Piscina Broodstock': '901', Sala, Tanque, Machos, Hembras });
  const MOV = (id, Machos, Hembras) => ({ Fecha: FECHA, Tipo: 'Transferencia', 'Sala origen': 'Sala 1', 'Tanque origen': 3, 'Sala destino': 'Sala 2', 'Tanque destino': 16, Machos, Hembras, ID: id });
  const fuentes = { ingresos: [ING('Sala 1', 3, 50, 50)], movimientos: [MOV(BASE + '-a', 5, 5), MOV(BASE + '-b', 3, 3)] };
  const opts = { hoy: '2026-03-01', hasta: '2026-03-01' };
  const vivos = (l, s, t) => l.posiciones.filter((p) => p.sala === s && Number(p.tanque) === t).reduce((a, p) => a + p.machos + p.hembras, 0);

  it('🔴 en el módulo y en el motor', () => {
    [construirLibro(fuentes, opts), H.madConstruirLibro(fuentes, opts)].forEach((l) => {
      expect(vivos(l, 'Sala 1', 3)).toBe(84);
      expect(vivos(l, 'Sala 2', 16)).toBe(16);
    });
  });
});

describe('🔴 el esquema del módulo dice lo mismo que el motor', () => {
  const M = { fecha: FECHA, tipo: 'Transferencia', motivo: 'Logística', tramos: [{ salaOrigen: 'Sala 1', tanqueOrigen: 3, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 1, hembras: 1 }] };
  it('🔴 con identidad, sin ella, y al no caber', () => {
    [{ ...M, envio: 'abc123' }, M, { ...M, envio: 'x'.repeat(40) }].forEach((m) => expect(H.madMovBuildRows(m)).toEqual(buildMovRows(m)));
    expect(movRowId(FECHA, 'Sala 1', 3, 'Sala 2', 16, 'abc123')).toBe(BASE + '-abc123');
    expect(movRowId(FECHA, 'Sala 1', 3, 'Sala 2', 16)).toBe(BASE);
  });
});
