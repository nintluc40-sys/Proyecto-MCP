// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Biomol — VARIOS ANÁLISIS EN EL MISMO DÍA

   El defecto que corrige (reportado por el usuario, 2026-08-18): los analistas ya no
   suben todo en una tanda, sino análisis a análisis dentro del mismo día, porque cada
   uno produce su propio PDF. Con la grilla indexada por FECHA, el envío decía
   "reemplaza TODAS las filas de esta fecha": subir reproductores y después larvas
   dejaba en la hoja SÓLO las larvas. Se perdía un análisis entero, en silencio.

   Ahora cada análisis reemplaza sólo SUS filas (clave = columna "Sesión"), igual que
   Lab_Algas y Microbiología. Lo que se vigila aquí:

   1. AISLAMIENTO LOCAL — teclear un análisis no puede tocar las filas del otro. Es el
      lado del defecto que ocurría antes incluso de sincronizar.
   2. EL ENVÍO — que lleve SÓLO las filas de su análisis y la marca de reemplazo por
      clave. Contar filas no basta: hay que mirar qué clave se manda, porque mandar
      `replaceDate` con las filas de un solo análisis es exactamente el borrado que
      estamos arreglando.
   3. EL ACOPLE CON EL GAS — la rama BIOMOL de doPost tiene que honrar `replaceKey`.
      Se lee del propio Code.gs: si alguien la quita, el envío degradaría a append y
      re-sincronizar duplicaría filas en producción sin ningún aviso.
   4. LA MIGRACIÓN — las filas escritas antes de existir la columna Sesión no tienen
      con qué emparejarse. Su primer envío debe ir por FECHA (comportamiento antiguo,
      correcto para un día que sólo tuvo un análisis) y arrastrar todos los análisis
      de esa fecha; después, cada uno por su cuenta.
   5. LA ETIQUETA CONGELADA — renombrar un análisis ya enviado movería la clave de sus
      filas y la siguiente sincronización las duplicaría en vez de reemplazarlas.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const GAS = readFileSync(join(process.cwd(), 'GAS/Code.gs'), 'utf8');

const EXPORTAR = ['renderBiomol', '_collectBioGrid', 'buildBioPayload', 'bioGridFecha',
  'saveBioGrid', 'syncBioGrid', 'bioSesCrear', 'bioSidActivo', 'bioSes', 'bioSesDelDia',
  'bioSesNombre', 'bioSesEtiqueta', '_bioSesAll', '_bioSesSave', '_bioRaw', '_bioSave',
  'loadBioRpt', 'saveBioRpt', '_bioMigrarSesiones', 'BIO_GRID_HEADERS',
  'bioVerSes', 'bioNuevoAnalisis', '_bioSesEnBlanco', 'syncAllPendingBio', 'bioSesEtiqueta'];
const H = {};
const toasts = [];
let enviados = [];

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

  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}'
    + '\ntry{ H.setTab=function(t){curTab=t;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setPost(async (payload) => { enviados.push(payload); return true; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/PRUEBA/exec');
  H.setRate(() => true);
  H.setToast((m) => { toasts.push(String(m)); });
  H.setMod(12);            // BIO_MOD
  H.setTab('biomol');
});

beforeEach(() => { localStorage.clear(); toasts.length = 0; enviados = []; });

const fp = () => document.getElementById('fp-biomol');
const ponDia = (d) => {
  if (!document.getElementById('bio-grid-fecha')) H.renderBiomol();
  document.getElementById('bio-grid-fecha').value = d;
};
/** Escribe en la grilla por el NOMBRE real de la celda y comprueba que entró. */
function escribir(fila, datos) {
  let puestas = 0;
  Object.keys(datos).forEach((k) => {
    const el = fp().querySelector(`[name="bg_${fila}_${k}"]`);
    if (el) { el.value = String(datos[k]); puestas++; }
  });
  expect(puestas).toBe(Object.keys(datos).length);
  return puestas;
}
/** Crea un análisis con nombre, lo deja en pantalla y le escribe una fila. */
function analisisCon(fecha, nombre, datos) {
  const sid = H.bioSesCrear(fecha, nombre);
  H.renderBiomol();
  escribir(1, datos);
  H.saveBioGrid({ noRender: true });
  return sid;
}
const filasDe = (sid) => H._bioRaw().filter((r) => r.data && r.data.sid === sid);

describe('Biomol · dos análisis del mismo día no se pisan', () => {
  it('cada uno guarda SUS filas; el segundo no borra al primero', () => {
    ponDia('2026-08-18'); H.renderBiomol();
    const a = analisisCon('2026-08-18', 'Reproductores', { codigo: 'REP-1', wssv: 'Positivo' });
    const b = analisisCon('2026-08-18', 'Larvas M8', { codigo: 'LAR-1', ihhnv: 'Negativo' });

    expect(a).not.toBe(b);
    expect(filasDe(a)).toHaveLength(1);
    expect(filasDe(b)).toHaveLength(1);
    expect(filasDe(a)[0].data.codigo).toBe('REP-1');
    expect(filasDe(b)[0].data.codigo).toBe('LAR-1');
    // Los dos son del MISMO día: es justo el caso que antes perdía uno. (Abrir el día
    // deja además un «Análisis 1» vacío listo para usar, así que el día lista 3.)
    const delDia = H.bioSesDelDia('2026-08-18').map((x) => x.sid);
    expect(delDia).toContain(a);
    expect(delDia).toContain(b);
  });

  it('la grilla en pantalla muestra sólo el análisis activo', () => {
    ponDia('2026-08-18'); H.renderBiomol();
    analisisCon('2026-08-18', 'Reproductores', { codigo: 'REP-1' });
    const b = H.bioSesCrear('2026-08-18', 'Larvas M8');
    H.renderBiomol();
    // Recién creado: su grilla está vacía aunque el día ya tenga otro análisis.
    expect(fp().querySelector('[name="bg_1_codigo"]').value).toBe('');
    expect(H._collectBioGrid()).toHaveLength(0);
    expect(H.bioSidActivo()).toBe(b);
  });

  it('el reporte del PDF es de cada análisis, no del día', () => {
    ponDia('2026-08-18'); H.renderBiomol();
    const a = analisisCon('2026-08-18', 'Reproductores', { codigo: 'REP-1' });
    const b = analisisCon('2026-08-18', 'Larvas M8', { codigo: 'LAR-1' });

    H.saveBioRpt(a, { ...H.loadBioRpt(a), desc: 'Descripción de reproductores' });
    H.saveBioRpt(b, { ...H.loadBioRpt(b), desc: 'Descripción de larvas' });
    expect(H.loadBioRpt(a).desc).toBe('Descripción de reproductores');
    expect(H.loadBioRpt(b).desc).toBe('Descripción de larvas');
  });
});

describe('Biomol · el envío reemplaza sólo las filas de su análisis', () => {
  it('manda las filas del análisis activo y la clave de la columna Sesión', async () => {
    ponDia('2026-08-18'); H.renderBiomol();
    const a = analisisCon('2026-08-18', 'Reproductores', { codigo: 'REP-1', wssv: 'Positivo' });
    const b = analisisCon('2026-08-18', 'Larvas M8', { codigo: 'LAR-1' });
    // Ambos nacen ya migrados (creados con el modelo nuevo), así que el envío va por clave.
    await H.syncBioGrid();

    expect(enviados).toHaveLength(1);
    const p = enviados[0];
    // 1) Sólo las filas del análisis activo (b), no las de a.
    expect(p.rows).toHaveLength(1);
    const iCod = p.headers.indexOf('Código');
    expect(p.rows[0][iCod]).toBe('LAR-1');
    // 2) Reemplazo POR CLAVE, no por fecha: mandar replaceDate aquí borraría a «a».
    expect(p.replaceKey).toBe(true);
    expect(p.replaceDate).toBeUndefined();
    expect(p.keyCols).toEqual([p.headers.indexOf('Sesión')]);
    // 3) La clave identifica al análisis y lleva su nombre delante.
    const etiqueta = p.rows[0][p.headers.indexOf('Sesión')];
    expect(etiqueta).toBe('Larvas M8 · ' + b);
    expect(etiqueta).not.toBe(H.bioSesEtiqueta(a));
  });

  it('sincronizar uno deja al otro intacto y pendiente', async () => {
    ponDia('2026-08-18'); H.renderBiomol();
    const a = analisisCon('2026-08-18', 'Reproductores', { codigo: 'REP-1' });
    analisisCon('2026-08-18', 'Larvas M8', { codigo: 'LAR-1' });
    await H.syncBioGrid();                       // sincroniza «Larvas M8»

    expect(filasDe(a).every((r) => !r.synced)).toBe(true);   // «a» sigue pendiente
    expect(filasDe(a)).toHaveLength(1);                       // y sigue ahí
  });

  it('la rama BIOMOL del GAS honra replaceKey (si no, duplicaría al reenviar)', () => {
    const rama = GAS.slice(GAS.indexOf('else if (isBiomol)'), GAS.indexOf('else if (isAst)'));
    expect(rama).toContain('payload.replaceKey');
    expect(rama).toContain('replaceByKeyRows');
    // Y la rama por fecha se conserva: la migración de días heredados la necesita.
    expect(rama).toContain('replaceByDateRows');
  });
});

describe('Biomol · una sesión por TANDA, sin pedir nada al analista', () => {
  /* El usuario pidió recuperar el flujo original —pegar, sincronizar, pegar,
     sincronizar— sin nombres obligatorios ni botones. Lo que lo consigue es que cada
     envío cierre su análisis y abra la grilla en blanco, como el sid por tanda de
     Microbiología. Si esto se rompiera, la segunda tanda se tecleaba ENCIMA de la
     primera y volvía el defecto que arreglamos. */
  it('tras sincronizar, la grilla queda en blanco y lista para la siguiente', async () => {
    ponDia('2026-08-18'); H.renderBiomol();
    escribir(1, { codigo: 'REP-1', wssv: 'Positivo' });
    H.saveBioGrid({ noRender: true });
    const primera = H.bioSidActivo();

    await H.syncBioGrid();

    const segunda = H.bioSidActivo();
    expect(segunda).not.toBe(primera);              // se cerró la tanda enviada
    expect(H._bioSesEnBlanco(segunda)).toBe(true);  // y la nueva está limpia
    expect(fp().querySelector('[name="bg_1_codigo"]').value).toBe('');
    // Lo enviado sigue guardado y marcado como sincronizado, no se pierde de vista.
    expect(filasDe(primera)).toHaveLength(1);
    expect(filasDe(primera)[0].synced).toBe(true);
  });

  it('dos tandas seguidas, sin tocar un solo botón, son dos análisis', async () => {
    ponDia('2026-08-18'); H.renderBiomol();
    escribir(1, { codigo: 'REP-1' });
    H.saveBioGrid({ noRender: true });
    await H.syncBioGrid();
    // Sin pulsar «Nuevo» ni nombrar nada: se pega la siguiente tanda y se envía.
    escribir(1, { codigo: 'LAR-1' });
    H.saveBioGrid({ noRender: true });
    await H.syncBioGrid();

    expect(enviados).toHaveLength(2);
    const clave = (p) => p.rows[0][p.headers.indexOf('Sesión')];
    expect(clave(enviados[0])).not.toBe(clave(enviados[1]));
    expect(enviados[1].replaceKey).toBe(true);
    // Y las dos tandas conviven: ninguna pisó a la otra.
    const cods = H._bioRaw().map((r) => r.data.codigo).sort();
    expect(cods).toEqual(['LAR-1', 'REP-1']);
  });

  it('sin nombre, la etiqueta de la hoja es sólo el identificador', async () => {
    ponDia('2026-08-18'); H.renderBiomol();
    escribir(1, { codigo: 'REP-1' });
    H.saveBioGrid({ noRender: true });
    const sid = H.bioSidActivo();
    await H.syncBioGrid();
    // Como en Microbiología: un id opaco, sin obligar a inventarse un nombre.
    expect(enviados[0].rows[0][enviados[0].headers.indexOf('Sesión')]).toBe(sid);
  });

  it('«En blanco» no encadena grillas vacías si ya estás en una', () => {
    ponDia('2026-08-18'); H.renderBiomol();
    const antes = H.bioSidActivo();
    H.bioNuevoAnalisis();
    expect(H.bioSidActivo()).toBe(antes);           // la reutiliza, no crea otra
    expect(toasts.some((t) => /ya está en blanco/.test(t))).toBe(true);
  });
});

describe('Biomol · el botón global cubre TODO el día', () => {
  /* Hallazgo de la auditoría final: el punto de pendientes se enciende mirando TODOS
     los registros, pero el botón «Sincronizar» del topbar pasó a enviar sólo el
     análisis en pantalla. Un análisis aparcado dejaba el punto naranja encendido sin
     forma de apagarlo desde ahí. Antes de existir los análisis, un envío cubría la
     fecha entera y esa promesa estaba implícita. */
  it('envía también los análisis aparcados, no sólo el de pantalla', async () => {
    ponDia('2026-08-18'); H.renderBiomol();
    const parado = analisisCon('2026-08-18', 'Reproductores', { codigo: 'REP-1' });
    const enPantalla = analisisCon('2026-08-18', 'Larvas M8', { codigo: 'LAR-1' });
    expect(filasDe(parado).every((r) => !r.synced)).toBe(true);   // control: hay pendiente

    await H.syncAllPendingBio();

    // Los dos salieron, cada uno con SU clave (no un envío por fecha que los mezcle).
    expect(enviados).toHaveLength(2);
    enviados.forEach((p) => expect(p.replaceKey).toBe(true));
    const claves = enviados.map((p) => p.rows[0][p.headers.indexOf('Sesión')]).sort();
    expect(claves).toEqual([H.bioSesEtiqueta(enPantalla), H.bioSesEtiqueta(parado)].sort());
    // Y no queda nada pendiente: el punto naranja ya se puede apagar.
    expect(H._bioRaw().every((r) => r.synced)).toBe(true);
  });

  it('no deja un reguero de grillas vacías al recorrer varios', async () => {
    ponDia('2026-08-18'); H.renderBiomol();
    analisisCon('2026-08-18', 'A', { codigo: 'A-1' });
    analisisCon('2026-08-18', 'B', { codigo: 'B-1' });
    analisisCon('2026-08-18', 'C', { codigo: 'C-1' });
    const antes = H.bioSesDelDia('2026-08-18').length;

    await H.syncAllPendingBio();

    // Sólo el último abre grilla nueva; los recorridos van con rotar:false.
    expect(H.bioSesDelDia('2026-08-18')).toHaveLength(antes + 1);
    expect(H._bioSesEnBlanco(H.bioSidActivo())).toBe(true);
  });

  it('con todo sincronizado avisa en vez de mandar un envío vacío', async () => {
    ponDia('2026-08-18'); H.renderBiomol();
    analisisCon('2026-08-18', 'Único', { codigo: 'U-1' });
    await H.syncAllPendingBio();
    enviados = []; toasts.length = 0;

    await H.syncAllPendingBio();          // ya no queda nada

    expect(enviados).toHaveLength(0);
    expect(toasts.some((t) => /No hay muestras para enviar/.test(t))).toBe(true);
    // UN solo mensaje, claro. Sin el guardia se cuela además «No hay datos para
    // guardar» del paso de guardado, y el analista recibe dos avisos seguidos que
    // parecen decir cosas distintas sobre lo mismo.
    expect(toasts.filter((t) => /No hay datos para guardar/.test(t))).toHaveLength(0);
    expect(toasts).toHaveLength(1);
  });
});

describe('Biomol · migración de lo guardado antes de los análisis', () => {
  /** Deja en el almacén filas SIN sid, como las que hay guardadas hoy. */
  function sembrarHeredado(fecha, codigos) {
    H._bioSave(codigos.map((c, i) => ({
      id: 'viejo' + i, ts: Date.now(), synced: true, syncedAt: Date.now(),
      data: { fecha, fila: i + 1, codigo: c, wssv: 'Negativo' },
    })));
  }

  it('adopta las filas sueltas en UN análisis por fecha, marcado como heredado', () => {
    sembrarHeredado('2026-08-18', ['V-1', 'V-2']);
    expect(H._bioMigrarSesiones()).toBe(true);

    const ses = H.bioSesDelDia('2026-08-18');
    expect(ses).toHaveLength(1);
    expect(ses[0].legacy).toBe(true);
    // Ninguna fila se queda sin análisis: perderlas sería perder el trabajo del día.
    const filas = H._bioRaw();
    expect(filas).toHaveLength(2);
    expect(filas.every((r) => r.data.sid === ses[0].sid)).toBe(true);
    // Es idempotente: una segunda pasada no crea otro análisis.
    expect(H._bioMigrarSesiones()).toBe(false);
    expect(H.bioSesDelDia('2026-08-18')).toHaveLength(1);
  });

  it('su PRIMER envío va por fecha y arrastra todo el día; el siguiente ya va por clave', async () => {
    sembrarHeredado('2026-08-18', ['V-1']);
    H._bioMigrarSesiones();
    ponDia('2026-08-18');
    const viejo = H.bioSesDelDia('2026-08-18')[0].sid;
    // Se añade un análisis NUEVO al mismo día heredado.
    H._bioSid = null;
    const nuevo = analisisCon('2026-08-18', 'Larvas M8', { codigo: 'LAR-1' });

    await H.syncBioGrid();
    expect(enviados).toHaveLength(1);
    const p1 = enviados[0];
    // Por FECHA, porque las filas viejas de la hoja no tienen columna Sesión con la
    // que emparejarse; y con TODO el día dentro, para no dejar fuera el análisis nuevo.
    expect(p1.replaceDate).toBe('2026-08-18');
    expect(p1.replaceKey).toBeUndefined();
    expect(p1.rows).toHaveLength(2);
    const cods = p1.rows.map((r) => r[p1.headers.indexOf('Código')]).sort();
    expect(cods).toEqual(['LAR-1', 'V-1']);

    // Ya migrados: el siguiente envío va por clave y sólo con lo suyo.
    expect(H.bioSes(viejo).legacy).toBe(false);
    expect(H.bioSes(nuevo).legacy).toBe(false);
    // Tras sincronizar, la grilla queda en blanco; se vuelve al análisis desde el
    // historial (👁) para reenviarlo, que es como se corrige una tanda ya enviada.
    enviados = [];
    H.bioVerSes(nuevo);
    await H.syncBioGrid();
    const p2 = enviados[0];
    expect(p2.replaceKey).toBe(true);
    expect(p2.rows).toHaveLength(1);
    expect(p2.rows[0][p2.headers.indexOf('Código')]).toBe('LAR-1');
  });
});

describe('Biomol · la etiqueta de la hoja se congela al sincronizar', () => {
  it('antes de sincronizar el nombre manda; después queda fijo', async () => {
    ponDia('2026-08-18'); H.renderBiomol();
    const sid = analisisCon('2026-08-18', 'Reproductores', { codigo: 'REP-1' });
    expect(H.bioSesEtiqueta(sid)).toBe('Reproductores · ' + sid);
    expect(H.bioSes(sid).etiqueta).toBeNull();      // aún no congelada

    await H.syncBioGrid();
    expect(H.bioSes(sid).etiqueta).toBe('Reproductores · ' + sid);

    // Renombrar después NO puede mover la clave: las filas ya escritas en la hoja se
    // emparejan por ella y la siguiente sincronización las duplicaría.
    const all = H._bioSesAll();
    all[sid].nombre = 'Otro nombre';
    H._bioSesSave(all);
    expect(H.bioSesEtiqueta(sid)).toBe('Reproductores · ' + sid);
  });

  it('sin nombre, la etiqueta es el identificador y el nombre se numera solo', () => {
    // Día virgen: no se renderiza antes, así que no hay ningún análisis implícito.
    const uno = H.bioSesCrear('2026-08-02', '');
    const dos = H.bioSesCrear('2026-08-02', '');
    expect(H.bioSesEtiqueta(uno)).toBe(uno);           // la clave es única aun sin nombre
    expect(H.bioSesEtiqueta(dos)).toBe(dos);
    expect(H.bioSesNombre(uno, '2026-08-02')).toBe('Análisis 1');
    expect(H.bioSesNombre(dos, '2026-08-02')).toBe('Análisis 2');
  });
});
