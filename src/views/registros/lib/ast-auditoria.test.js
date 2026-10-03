// @vitest-environment happy-dom
/* ============================================================
   AsT · 🧾 AUDITORÍA · siembra, transferencia y cosecha de una corrida (2026-10-03)

   Pedido del usuario: las planillas «AUDITORIAS (MES) Cxxx» como ficha del AsT, OTRO tipo de registro que el Despacho
   de Datos Larvicultura, reutilizando lo que se pueda. Decisiones del usuario: UNA hoja «Registro_Auditoria» con columna
   «Tipo» (una fila por evento, su ID fijo el último); facturada = 90 % PROPUESTO y editable (la excepción se marca); con
   transferencia, la cosecha se atribuye a los orígenes PROPORCIONAL a lo transferido (estimación rotulada); placa y
   tinas tecleadas en cada partida; el ingreso de reproductores tecleado en la siembra. Lo calculado no se guarda.
   Se ejerce la ficha REAL del motor (engine.js), como las demás pruebas de Registros. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['AUD_SHEET', 'AUD_HEADERS', 'AUD_SIEMBRAS', 'AUD_DRAFT_KEY', 'audEntero', 'audDecimal', 'audFacturadaPropuesta',
  'audFacturada', 'audFacturadaEsExcepcion', 'audRowId', 'audSiguientePartida', 'audValidar', 'audFilas', 'buildAudPayload',
  'audResumen', 'renderAud', 'audCampo', 'audFila', 'audAgregarEl', 'audOtraPartidaEl', 'audQuitarEl', 'audGuardar', 'audNueva',
  'audAbrirEl', 'audBorrarEl', '_audRaw', 'loadAud', '_reconcileMark', 'AST_TABS', 'TAB_META'];
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
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.olvidarModelo=function(){ _audModel=null; }; }catch(_){}'
    + '\ntry{ H.modelo=function(){ return _audActual(); }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => { H.ultimoAviso = m; });
});

beforeEach(() => {
  globalThis.localStorage.clear();
  H.olvidarModelo();
  window.confirm = () => true;
  H.renderAud();
});

const fp = () => document.getElementById('fp-auditoria');
const col = (h) => H.AUD_HEADERS.indexOf(h);
const SI = (o) => ({ siembra: '1ª', modulo: 'M04', tanque: '1', fecha: '2026-03-03', origen: 'Omarsa', guia: '1001', cantidad: '7,000,000',
  ton: '28', lote: 'ZZ', codigo: 'CG-PRUEBA.1G', fechaIng: '2026-01-21', guiasIng: '9001 - 9002', ...o });
const TR = (o) => ({ fecha: '2026-03-14', modulo: 'M04', tanque: '1', moduloDest: 'M04', tanqueDest: '1', cantidad: '', estadio: 'PL5', plg: '870', larvasPeq: '6', ...o });
const CO = (o) => ({ fecha: '2026-03-22', modulo: 'M04', tanque: '1', partida: 1, cantidad: '', ton: '', estadio: 'PL13', plg: '195', camaronera: 'Cachugrán',
  piscinas: '96', guia: '2001', guiaDespacho: '3001', facturada: '', tinas: '12', placa: 'GBA-1234', ...o });
const audit = (o) => ({ corrida: '901', modulo: 'M04', registrado: 'Ana', obs: '', siembras: [], transferencias: [], cosechas: [], ...o });

describe('Auditoría · la hoja «Registro_Auditoria»', () => {
  it('29 columnas: «Tipo» la primera y el ID la ÚLTIMA', () => {
    expect(H.AUD_SHEET).toBe('Registro_Auditoria');
    expect(H.AUD_HEADERS).toHaveLength(29);
    expect(H.AUD_HEADERS[0]).toBe('Tipo');
    expect(H.AUD_HEADERS[28]).toBe('ID');
    expect(new Set(H.AUD_HEADERS).size).toBe(29);
  });

  it('🔴 una fila por EVENTO, con su Tipo y su ID fijo; las Observaciones de la auditoría en todas', () => {
    const d = audit({ obs: 'nota', siembras: [SI({})], transferencias: [TR({ cantidad: '6,200,000' })], cosechas: [CO({ cantidad: '3,290,000' })] });
    const f = H.audFilas(d);
    expect(f).toHaveLength(3);
    expect(f.map((x) => x[col('Tipo')])).toEqual(['Siembra', 'Transferencia', 'Cosecha']);
    expect(f.map((x) => x[col('ID')])).toEqual(['AU-S-901-M04-t1-s1', 'AU-T-901-M04-t1-M04-t1', 'AU-C-901-M04-t1-p1']);
    expect(f.every((x) => x[col('Observaciones')] === 'nota' && x[col('Registrado por')] === 'Ana' && x[col('Corrida')] === '901')).toBe(true);
    expect(f[0][col('Cantidad')]).toBe(7000000);                        // sin separadores
    expect(f[0][col('Guías ingreso reproductores')]).toBe('9001 - 9002');
    expect(f[1][col('Tanque destino')]).toBe('1');
    expect(f[2][col('Cantidad facturada')], 'la propuesta: el 90 %').toBe(2961000);
    expect(H.buildAudPayload([{ data: d }])).toMatchObject({ sheetName: 'Registro_Auditoria', headers: H.AUD_HEADERS });
  });

  it('las cantidades admiten separadores; «TQ 1» es el tanque 1 y los del CIO conservan su letra', () => {
    expect(['6,300,000', '6.300.000', '6 300 000', '6300000'].map(H.audEntero)).toEqual([6300000, 6300000, 6300000, 6300000]);
    expect(H.audDecimal('3,5')).toBe(3.5);
    expect(H.audRowId('cosechas', audit({}), { modulo: 'M04', tanque: 'TQ 3', partida: 2 })).toBe('AU-C-901-M04-t3-p2');
    expect(H.audRowId('siembras', audit({}), { modulo: 'CIO', tanque: '1a', siembra: '2ª' })).toBe('AU-S-901-CIO-t1A-s2');
  });
});

describe('Auditoría · la facturada', () => {
  it('🔴 vacía = el 90 % de la real; tecleada, la tecleada, y se marca si no es el 90 %', () => {
    expect(H.audFacturadaPropuesta('2,288,000')).toBe(2059200);
    expect(H.audFacturada({ cantidad: '2,288,000', facturada: '' })).toBe(2059200);
    expect(H.audFacturada({ cantidad: '2,840,000', facturada: '1,556,000' })).toBe(1556000);
    expect(H.audFacturadaEsExcepcion({ cantidad: '2,840,000', facturada: '1,556,000' })).toBe(true);
    expect(H.audFacturadaEsExcepcion({ cantidad: '2,288,000', facturada: '' })).toBe(false);
    expect(H.audFacturadaEsExcepcion({ cantidad: '2,288,000', facturada: '2059200' })).toBe(false);
  });
});

describe('Auditoría · la validación', () => {
  it('🔴 la cabecera, los campos de cada fila y las filas repetidas', () => {
    expect(H.audValidar(audit({ corrida: '', modulo: '' })).join(' ')).toContain('la corrida, el módulo');
    expect(H.audValidar(audit({})).join(' ')).toContain('al menos una siembra');
    expect(H.audValidar(audit({ siembras: [SI({ cantidad: '' })] })).join(' ')).toContain('Siembra 1');
    expect(H.audValidar(audit({ siembras: [SI({}), SI({})] })).join(' ')).toContain('ya tiene esa siembra');
    expect(H.audValidar(audit({ siembras: [SI({}), SI({ siembra: '2ª' })] }))).toEqual([]);   // otra siembra del mismo tanque: vale
    expect(H.audValidar(audit({ transferencias: [TR({ cantidad: '1', larvasPeq: '120' })] })).join(' ')).toContain('% larvas pequeñas');
    expect(H.audValidar(audit({ cosechas: [CO({ cantidad: '1' }), CO({ cantidad: '2' })] })).join(' ')).toContain('esa partida del tanque');
  });
});

describe('Auditoría · el resumen (calculado, no se envía)', () => {
  it('🔴 sin transferencias: la cosecha de cada tanque es suya; densidades con SUS toneladas; subtotales por siembra', () => {
    const d = audit({
      siembras: [SI({ tanque: '1' }), SI({ tanque: '2', siembra: '2ª', cantidad: '6,300,000', ton: '27' })],
      cosechas: [CO({ tanque: '1', cantidad: '3,300,000' }), CO({ tanque: '1', partida: 2, cantidad: '1,300,000', fecha: '2026-03-23' }),
        CO({ tanque: '2', cantidad: '5,265,000' })],
    });
    const r = H.audResumen(d);
    const t1 = r.tanques.find((t) => t.tanque === '1');
    expect(t1).toMatchObject({ sembrado: 7000000, densidad: 250, cosechado: 4600000, dias: 20, estimada: false });
    expect(t1.sob).toBeCloseTo(4600000 / 7000000, 9);
    expect(r.bloques.map((b) => [b.siembra, b.tanques, b.sembrado, b.cosechado])).toEqual([['1ª', 1, 7000000, 4600000], ['2ª', 1, 6300000, 5265000]]);
    expect(r.cosechados.find((c) => c.llave === 'M04·2').densidad).toBe(195);   // 5 265 000 / 27 t
    expect(r.estimada).toBe(false);
  });

  it('🔑 con transferencia: la cosecha de cada destino se reparte PROPORCIONAL a lo que dio cada origen (y se rotula)', () => {
    // dos orígenes (TQ1 y TQ2 del M04) llenan dos destinos: TQ1 del M05 recibe 3 M de TQ1 y 1 M de TQ2; TQ2 del M05, 2 M de TQ2
    const d = audit({
      siembras: [SI({ tanque: '1', cantidad: '5,000,000' }), SI({ tanque: '2', cantidad: '5,000,000' })],
      transferencias: [TR({ tanque: '1', moduloDest: 'M05', tanqueDest: '1', cantidad: '3,000,000' }),
        TR({ tanque: '2', moduloDest: 'M05', tanqueDest: '1', cantidad: '1,000,000' }),
        TR({ tanque: '2', moduloDest: 'M05', tanqueDest: '2', cantidad: '2,000,000' })],
      cosechas: [CO({ modulo: 'M05', tanque: '1', cantidad: '2,000,000', ton: '27' }), CO({ modulo: 'M05', tanque: '2', cantidad: '1,500,000' })],
    });
    const r = H.audResumen(d);
    const o1 = r.tanques.find((t) => t.tanque === '1'), o2 = r.tanques.find((t) => t.tanque === '2');
    expect(o1.cosechado).toBe(1500000);                // 2 M × 3/4
    expect(o2.cosechado).toBe(500000 + 1500000);       // 2 M × 1/4 + todo el TQ2 del M05
    expect(o1.cosechado + o2.cosechado).toBe(r.cosechado);   // la atribución no inventa ni pierde larvas
    expect(o1.transferido).toBe(3000000);
    expect(o1.sobFase1).toBeCloseTo(0.6, 9);
    expect(o1.estimada && o2.estimada && r.estimada).toBe(true);
    const dst = r.cosechados.find((c) => c.llave === 'M05·1');
    expect(dst).toMatchObject({ recibido: 4000000, densidad: 74 });   // 2 M / 27 t
    expect(dst.sobFase2).toBeCloseTo(0.5, 9);
  });

  it('el despacho por camaronera: real, facturada, PL/g ponderado, tinas, camiones (placas distintas) y las excepciones', () => {
    const r = H.audResumen(audit({ cosechas: [
      CO({ tanque: '1', cantidad: '2,000,000', plg: '200', tinas: '10', placa: 'gba-1' }),
      CO({ tanque: '2', cantidad: '1,000,000', plg: '100', tinas: '5', placa: 'GBA-1', facturada: '500,000' }),
      CO({ tanque: '3', cantidad: '1,000,000', camaronera: 'Puná 2', plg: '', tinas: '', placa: '' }),
    ] }));
    const cach = r.camaroneras.find((c) => c.camaronera === 'Cachugrán');
    expect(cach).toMatchObject({ real: 3000000, facturada: 1800000 + 500000, plg: 167, tinas: 15, camiones: 1, partidas: 2, excepciones: 1 });
    expect(r.camaroneras.find((c) => c.camaronera === 'Puná 2')).toMatchObject({ real: 1000000, plg: null, camiones: 0 });
  });
});

describe('Auditoría · la ficha en el módulo AsT', () => {
  it('es una pestaña del AsT, «🧾 Auditoría», con sus tres secciones', () => {
    expect(H.AST_TABS).toContain('auditoria');
    expect(H.TAB_META.auditoria).toEqual(['🧾', 'Auditoría']);
    const t = fp().textContent;
    for (const s of ['Siembra', 'Transferencia', 'Cosecha y despacho', 'Resumen']) expect(t).toContain(s);
  });

  it('🔴 «➕ Añadir» copia la fila anterior con el tanque SIGUIENTE; «➕ partida» abre otra del MISMO tanque', () => {
    const anadir = (sec) => H.audAgregarEl(fp().querySelector(`button[data-as="${sec}"][onclick="audAgregarEl(this)"]`));
    anadir('siembras');
    const m = H.modelo();
    Object.assign(m.siembras[0], { fecha: '2026-03-03', lote: 'ZZ', ton: '28' });
    anadir('siembras');
    expect(m.siembras[1]).toMatchObject({ tanque: '2', fecha: '2026-03-03', lote: 'ZZ', ton: '28', siembra: '1ª' });
    anadir('cosechas');
    expect(m.cosechas[0].partida).toBe(1);
    H.audOtraPartidaEl(fp().querySelector('button[onclick="audOtraPartidaEl(this)"]'));
    expect(m.cosechas.map((c) => [c.tanque, c.partida])).toEqual([['1', 1], ['1', 2]]);
    expect(fp().querySelectorAll('input[data-as="cosechas"][data-af="cantidad"]')).toHaveLength(2);
  });

  it('🔴 cambiar el tanque de una partida le da la siguiente libre de SU tanque', () => {
    const m = H.modelo();
    Object.assign(m, audit({ cosechas: [CO({ tanque: '1', partida: 1 }), CO({ tanque: '2', partida: 1 })] }));
    H.renderAud();
    const tq = fp().querySelector('input[data-as="cosechas"][data-ai="1"][data-af="tanque"]');
    tq.value = '1';
    H.audFila(tq, true);
    expect(m.cosechas[1].partida).toBe(2);
    expect(fp().querySelector('[data-aud-partida="1"]').textContent).toBe('2');   // y la celda lo dice sin rehacer la tabla
  });

  it('🔴 cambiar una celda NO rehace la tabla (el Tab y el clic siguiente no se pierden): lo calculado se pone al día EN SU SITIO', () => {
    // Revisión del 2026-10-03, medido en Chrome: rehacer la ficha en cada «change» mandaba el foco al <body> (lo tecleado
    // después se perdía) y se llevaba el botón pulsado justo después de teclear.
    const m = H.modelo();
    Object.assign(m, audit({ siembras: [SI({ cantidad: '7,000,000' })], cosechas: [CO({ cantidad: '1,000,000' })] }));
    H.renderAud();
    const q = (s) => fp().querySelector(s);
    const otra = q('input[data-as="siembras"][data-ai="0"][data-af="ton"]');   // la celda a la que iría el Tab
    const anadir = q('button[data-as="transferencias"][onclick="audAgregarEl(this)"]');
    const cant = q('input[data-as="siembras"][data-ai="0"][data-af="cantidad"]');
    cant.value = '5,000,000';
    H.audFila(cant, true);
    expect(otra.isConnected && anadir.isConnected && cant.isConnected).toBe(true);
    expect(q('[data-aud-resumen]').textContent).toContain((5000000).toLocaleString('es-EC'));   // el resumen, al día
    // en una cosecha: la facturada propuesta y la marca de excepción
    const real = q('input[data-as="cosechas"][data-ai="0"][data-af="cantidad"]');
    real.value = '2,000,000';
    H.audFila(real, true);
    const td = q('[data-aud-fact="0"]');
    expect(td.querySelector('input').getAttribute('placeholder')).toBe((1800000).toLocaleString('es-EC'));
    expect(td.getAttribute('title')).toBeNull();
    const fact = td.querySelector('input');
    fact.value = '1,500,000';
    H.audFila(fact, true);
    expect(td.getAttribute('title')).toBe('No es el 90 % de la real');
    expect(fact.isConnected && real.isConnected).toBe(true);
  });

  it('🔴 Guardar valida, queda PENDIENTE; la misma corrida · módulo la sustituye; la cola reconcilia por versión', () => {
    H.audGuardar();
    expect(H._audRaw()).toHaveLength(0);
    expect(H.ultimoAviso).toContain('la corrida');
    Object.assign(H.modelo(), audit({ siembras: [SI({})] }));
    H.audGuardar();
    expect(H._audRaw()).toHaveLength(1);
    expect(H._audRaw()[0]).toMatchObject({ id: 'AUE-901-M04', synced: false });
    H.modelo().cosechas.push(CO({ cantidad: '1,000' }));
    H.audGuardar();
    expect(H._audRaw()).toHaveLength(1);
    const ts = H._audRaw()[0].ts;
    expect(H._reconcileMark({ kind: 'auditoria', keys: ['AUE-901-M04@' + (ts - 1)] })).toBe(false);
    expect(H._reconcileMark({ kind: 'auditoria', keys: ['AUE-901-M04@' + ts] })).toBe(true);
    expect(H._audRaw()[0].synced).toBe(true);
  });

  it('«✏️ Abrir» y «🗑» llevan el id en data-aud-id (no interpolado en el onclick)', () => {
    globalThis.localStorage.setItem('larv4_aud_records', JSON.stringify([{ id: "AUE-90'1-M04", ts: 5, synced: false, data: audit({ corrida: "90'1", siembras: [SI({})] }) }]));
    H.renderAud();
    const b = [...fp().querySelectorAll('button[data-aud-id]')];
    expect(b).toHaveLength(2);
    expect(b.map((x) => x.getAttribute('onclick'))).toEqual(['audAbrirEl(this)', 'audBorrarEl(this)']);
    H.audAbrirEl(b[0]);
    expect(H.modelo().corrida).toBe("90'1");
    H.audBorrarEl(fp().querySelector('button[onclick="audBorrarEl(this)"]'));
    expect(H._audRaw()).toHaveLength(0);
  });

  it('lo pendiente NO caduca; lo enviado se purga a los 7 días', () => {
    const viejo = Date.now() - 10 * 24 * 3600 * 1000;
    globalThis.localStorage.setItem('larv4_aud_records', JSON.stringify([
      { id: 'AUE-p', ts: viejo, synced: false, data: audit({}) },
      { id: 'AUE-e', ts: viejo, synced: true, syncedAt: viejo, data: audit({}) },
    ]));
    expect(H.loadAud().map((r) => r.id)).toEqual(['AUE-p']);
  });
});
