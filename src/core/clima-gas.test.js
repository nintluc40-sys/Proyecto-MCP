/* GAS/Clima.gs · el Apps Script APARTE «MCP · clima» (2026-10-27, Sesión A, tarea 5).
   Escribe en el libro «Clima horas» (una fila por hora) y «Clima» (una por día: registro + pronóstico de 3 días), con
   cada hora tomada de la MEJOR fuente que la tenga: lo observado en el aeropuerto de Salinas (METAR SESA) > MET Noruega
   (≤ 3 h vista) > NASA POWER (malla gruesa: sólo historial, huecos y radiación).
   El archivo se carga tal cual con `new Function`, con los servicios de Apps Script SIMULADOS (un libro en memoria, las
   fuentes con respuestas FICTICIAS y el reloj de vitest). Ninguna cifra de aquí es real.
   Lo que se guarda:
     · la regla de prioridad grupo a grupo (base, lluvia, nubosidad, extras de MET, tiempo observado, radiación);
     · las conversiones (nudos y m/s → km/h, kPa → hPa, UTC → hora de Ecuador, octas → %, el METAR en palabras);
     · los resúmenes diarios SÓLO con las 24 horas (13 horas diurnas daban una «media» 2–3 °C alta, medido el 27-10);
     · que una pasada sin cambios no escribe nada (la consulta ligera del MCP lee la fecha de modificación del libro);
     · la instalación: zona del libro, cabeceras, activadores sin duplicar. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'GAS/Clima.gs'), 'utf8');
const H = 3600000;
const utc = (s) => Date.parse(s + 'Z');

/* ── Servicios de Apps Script simulados ──────────────────────────────────────────── */
/** Utilities.formatDate / parseDate con zonas horarias REALES (Intl), para los patrones que usa Clima.gs. */
const partes = (ms, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).formatToParts(ms).map((x) => [x.type, x.value]));
const UTIL = {
  formatDate(d, tz, patron) {
    const p = partes(d.getTime(), tz);
    return patron.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
  },
  parseDate(s, tz) {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
    const pared = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    let ms = pared;   // el instante cuya hora de pared en `tz` es `pared` (dos vueltas: el desfase puede cambiar)
    for (let i = 0; i < 2; i++) { const p = partes(ms, tz); ms += pared - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second); }
    return new Date(ms);
  },
};
function libroSimulado(zona = 'America/Guayaquil') {
  const hojas = new Map();
  const nueva = (nombre) => {
    const filas = [];
    const h = {
      nombre, filas, escritas: 0,
      getLastRow() { for (let i = filas.length - 1; i >= 0; i--) if (filas[i] && filas[i].some((x) => x !== '' && x != null)) return i + 1; return 0; },
      getRange(r, c, nr, nc) {
        return {
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
            const x = (filas[r - 1 + i] || [])[c - 1 + j]; return x == null ? '' : x instanceof Date ? new Date(x) : x;
          })),
          setValues(v) { v.forEach((f, i) => { const k = r - 1 + i; filas[k] = filas[k] || []; f.forEach((x, j) => { filas[k][c - 1 + j] = x; }); }); if (r > 1) h.escritas += v.length; return this; },
          setNumberFormat() { return this; },
          setFontWeight() { return this; },
          clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (filas[r - 1 + i]) filas[r - 1 + i][c - 1 + j] = ''; return this; },
        };
      },
      setFrozenRows() {},
    };
    return h;
  };
  return {
    hojas,
    getName: () => 'libro de prueba',
    getSpreadsheetTimeZone: () => zona,
    getSheetByName: (n) => hojas.get(n) || null,
    insertSheet: (n) => { const h = nueva(n); hojas.set(n, h); return h; },
  };
}

/** Carga Clima.gs. `fuentes(url, cabeceras)` devuelve {codigo, cuerpo, cabeceras}; cada pedido queda en `pedidos`. */
function cargar({ libro = libroSimulado(), fuentes = () => ({ codigo: 500, cuerpo: '' }) } = {}) {
  const props = new Map(), triggers = [], log = [], pedidos = [];
  const servicios = {
    UrlFetchApp: {
      fetch(url, o) {
        pedidos.push({ url, cabeceras: o.headers });
        const r = fuentes(url, o.headers || {});
        return { getResponseCode: () => r.codigo, getContentText: () => (typeof r.cuerpo === 'string' ? r.cuerpo : JSON.stringify(r.cuerpo)), getAllHeaders: () => r.cabeceras || {} };
      },
    },
    SpreadsheetApp: { openById: () => libro },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, v) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'America/Guayaquil' },
    Utilities: UTIL,
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger(fn) {
        const t = { fn, cfg: [], getHandlerFunction: () => fn };
        const b = new Proxy({}, { get: (_, k) => (k === 'create' ? () => { triggers.push(t); return t; } : (...a) => { t.cfg.push(k + '(' + a.join(',') + ')'); return b; }) });
        return b;
      },
    },
    Logger: { log: (s) => log.push(String(s)) },
  };
  const funciones = [...SRC.matchAll(/^function ([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]);
  const nombres = Object.keys(servicios);
  const api = new Function(...nombres, SRC + '\nreturn {' + funciones.join(',') + ', CLIMA, COL_HORAS, COL_DIAS, FUENTE };')(...nombres.map((n) => servicios[n]));
  return { api, libro, props, triggers, log, pedidos };
}

/* ── Respuestas ficticias de las fuentes ─────────────────────────────────────────── */
/** Un METAR de AWC. `hora` en UTC («2026-10-20T15:00»). */
const metar = (hora, o = {}) => ({ obsTime: utc(hora) / 1000, metarType: 'METAR', temp: 28, dewp: 22, wdir: 250, wspd: 10, altim: 1011, clouds: [{ cover: 'SCT', base: 1500 }], wxString: null, ...o });

/** Un JSON de MET (`complete`) con pasos [{t: «…T..», g: 1|6, …valores}]. */
function met(pasos) {
  return {
    properties: {
      timeseries: pasos.map((p) => {
        const det = { air_temperature: p.t ?? 25, relative_humidity: p.hr ?? 80, wind_speed: p.ws ?? 5, wind_from_direction: p.wd ?? 200,
          air_pressure_at_sea_level: p.p ?? 1010, cloud_area_fraction: p.nube ?? 50, apparent_air_temperature: p.sens ?? 27 };
        if (p.g === 1 || p.uv !== undefined) { det.ultraviolet_index_clear_sky = p.uv ?? 3; det.fog_area_fraction = p.niebla ?? 0; }
        if (p.sinUv) { delete det.ultraviolet_index_clear_sky; delete det.fog_area_fraction; }
        const data = { instant: { details: det } };
        if (p.g === 1) data.next_1_hours = { details: { precipitation_amount: p.mm ?? 0 } };
        data.next_6_hours = { details: { precipitation_amount: p.mm6 ?? 0, air_temperature_min: p.min ?? 24, air_temperature_max: p.max ?? 27 } };
        return { time: p.time + ':00Z', data };
      }),
    },
  };
}
/** Pasos horarios consecutivos desde `desde` (UTC). */
const horarios = (desde, n, f = () => ({})) => Array.from({ length: n }, (_, i) => ({ time: new Date(utc(desde) + i * H).toISOString().slice(0, 16), g: 1, ...f(i) }));

/** NASA POWER por hora: `valores(clave UTC «AAAAMMDDHH») → {T2M,…}` para las horas de [desde, hasta) UTC. */
function nasaHoras(desde, horas, valores = () => ({})) {
  const par = { T2M: {}, RH2M: {}, PRECTOTCORR: {}, WS10M: {}, WD10M: {}, PS: {}, CLOUD_AMT: {}, ALLSKY_SFC_SW_DWN: {} };
  for (let i = 0; i < horas; i++) {
    const d = new Date(utc(desde) + i * H), k = d.toISOString().slice(0, 13).replace(/[-T]/g, '');
    const v = { T2M: 24, RH2M: 85, PRECTOTCORR: 0.1, WS10M: 5, WD10M: 210, PS: 100.9, CLOUD_AMT: -999, ALLSKY_SFC_SW_DWN: -999, ...valores(k) };
    for (const p in par) par[p][k] = v[p];
  }
  return { properties: { parameter: par } };
}

const leer = (libro, nombre) => (libro.hojas.get(nombre)?.filas || []);
const filaDeHora = (api, libro, dia, hora) => {
  const filas = leer(libro, 'Clima horas').slice(1);
  return filas.map(api.deFila_(['dia', 'hora', 'fuente', 't', 'hr', 'v', 'dir', 'p', 'lluvia', 'fLluvia', 'nube', 'fNube', 'wx', 'sens', 'niebla', 'uv', 'rad', 'act']))
    .find((f) => f.dia === dia && f.hora === hora);
};

describe('Clima.gs · conversiones', () => {
  const { api } = cargar();

  it('la hora de Ecuador es UTC − 5 todo el año, sin depender de la zona del script', () => {
    expect(api.claveDia_(utc('2026-10-28T04:59'))).toBe('2026-10-27');
    expect(api.claveDia_(utc('2026-10-28T05:00'))).toBe('2026-10-28');
    expect(api.horaLocal_(utc('2026-10-28T05:00'))).toBe(0);
    expect(new Date(api.msDeClave_('2026-10-28', 0)).toISOString()).toBe('2026-10-28T05:00:00.000Z');
    expect(api.sumarDias_('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('una celda de fecha se lee como Date o como «dd/mm/aaaa» tecleado', () => {
    expect(api.claveDeCelda_(new Date(api.msDeClave_('2026-08-01', 0)))).toBe('2026-08-01');
    expect(api.claveDeCelda_('3/9/2026')).toBe('2026-09-03');
    expect(api.claveDeCelda_('basura')).toBe('');
  });

  it('el tiempo presente del METAR, en palabras', () => {
    expect(api.traducirWx_('-RA')).toBe('lluvia débil');
    expect(api.traducirWx_('VCSH')).toBe('chubascos en las cercanías');
    expect(api.traducirWx_('-SHRA')).toBe('chubasco de lluvia débil');
    expect(api.traducirWx_('+TSRA')).toBe('tormenta con lluvia fuerte');
    expect(api.traducirWx_('MIFG')).toBe('niebla baja');
    expect(api.traducirWx_('DZ BR')).toBe('llovizna, neblina');
    expect(api.traducirWx_(null)).toBe('');
  });

  it('la nubosidad del METAR: la capa más cubierta, en el centro de su rango de octas; sin nubes informadas = null', () => {
    expect(api.nubosidadMetar_({ clouds: [{ cover: 'FEW' }, { cover: 'BKN' }, { cover: 'SCT' }] })).toBe(75);
    expect(api.nubosidadMetar_({ clouds: [], cover: 'CAVOK' })).toBe(0);
    expect(api.nubosidadMetar_({ clouds: [{ cover: 'VV' }] })).toBe(100);
    expect(api.nubosidadMetar_({ clouds: [] })).toBeNull();
  });

  it('la dirección dominante es la media VECTORIAL: 350° y 10° dan 0°, no 180°', () => {
    expect(api.direccionMedia_([[10, 350], [10, 10]])).toBe(0);
    expect(api.direccionMedia_([[20, 90], [5, 180]])).toBe(104);
    expect(api.direccionMedia_([[null, 90]])).toBeNull();
  });

  it('la humedad sale del punto de rocío (Magnus) y nunca pasa de 100', () => {
    expect(Math.round(api.humedad_(28, 22))).toBe(70);
    expect(api.humedad_(25, 26)).toBe(100);
  });
});

describe('Clima.gs · las fuentes → candidatos por hora', () => {
  const { api } = cargar();

  it('METAR: nudos → km/h, hora local, calma sin dirección, humedad del rocío', () => {
    const [c] = api.horasDeMetar_([metar('2026-10-20T15:00', { wspd: 10, wdir: 250 })]);
    expect(c).toMatchObject({ dia: '2026-10-20', hora: 10, fuente: 'Observado SESA', t: 28, hr: 70, v: 18.5, dir: 250, p: 1011, nube: 44, wx: '' });
    const [calma] = api.horasDeMetar_([metar('2026-10-20T16:00', { wspd: 0, wdir: 0 })]);
    expect(calma.v).toBe(0);
    expect(calma.dir).toBeNull();
    const [vrb] = api.horasDeMetar_([metar('2026-10-20T17:00', { wdir: 'VRB' })]);
    expect(vrb.dir).toBeNull();
  });

  it('METAR: una observación por hora, la ordinaria antes que la especial y, entre iguales, la más cercana a la hora en punto', () => {
    const lista = [
      metar('2026-10-20T14:40', { metarType: 'SPECI', temp: 31 }),   // se redondea a las 15Z
      metar('2026-10-20T15:00', { temp: 29 }),
      metar('2026-10-20T15:20', { metarType: 'SPECI', temp: 33 }),
      metar('2026-10-20T18:10', { metarType: 'SPECI', temp: 30 }),
      metar('2026-10-20T17:55', { metarType: 'SPECI', temp: 27 }),
      metar('2026-10-20T20:50', { temp: 26 }),                          // la ordinaria, aunque la especial esté más cerca
      metar('2026-10-20T21:02', { metarType: 'SPECI', temp: 35 }),
    ];
    const c = api.horasDeMetar_(lista).sort((a, b) => a.hora - b.hora);
    expect(c.map((x) => [x.hora, x.t])).toEqual([[10, 29], [13, 27], [16, 26]]);
    expect(api.horasDeMetar_([metar('2026-10-20T15:00', { temp: null })])).toEqual([]);
  });

  it('MET: sólo los pasos HORARIOS de hoy y de antes (los días siguientes van al pronóstico), m/s → km/h', () => {
    const j = met([...horarios('2026-10-27T21:00', 4, () => ({ ws: 5, mm: 0.4 })), { time: '2026-10-28T01:00', g: 6 }]);
    const c = api.horasDeMet_(j, '2026-10-27');
    expect(c.map((x) => x.hora)).toEqual([16, 17, 18, 19]);
    expect(c[0]).toMatchObject({ fuente: 'MET', v: 18, lluvia: 0.4, sens: 27, uv: 3, niebla: 0 });
    expect(api.horasDeMet_(j, '2026-10-26')).toEqual([]);
  });

  it('NASA: UTC → hora local, kPa → hPa, −999 = aún no; el grupo base sólo si viene ENTERO', () => {
    const j = nasaHoras('2026-10-01T05:00', 3, (k) => (k === '2026100106' ? { WS10M: -999 } : k === '2026100107' ? { CLOUD_AMT: 60, ALLSKY_SFC_SW_DWN: 120 } : {}));
    const c = api.horasDeNasa_(j);
    expect(c[0]).toMatchObject({ dia: '2026-10-01', hora: 0, fuente: 'NASA', t: 24, v: 18, p: 1009, lluvia: 0.1, nube: null, rad: null });
    expect(c[1]).toMatchObject({ hora: 1, t: null, v: null, lluvia: 0.1 });
    expect(c[2]).toMatchObject({ hora: 2, nube: 60, rad: 120 });
    expect(api.radiacionDiaria_({ properties: { parameter: { ALLSKY_SFC_SW_DWN: { 20261001: 5.123, 20261002: -999 } } } })).toEqual({ '2026-10-01': 5.12 });
  });
});

describe('Clima.gs · la regla de prioridad (SESA > MET > NASA)', () => {
  const { api } = cargar();
  const base = (fuente, o = {}) => ({ dia: '2026-10-20', hora: 10, fuente, t: 25, hr: 80, v: 10, dir: 200, p: 1010, ...o });

  it('una fuente PEOR nunca pisa a una mejor; una igual sí (MET corrige su pronóstico)', () => {
    let h = api.fusionarHora_(null, base('MET', { t: 26, lluvia: 0.5, nube: 40, sens: 29, niebla: 5, uv: 7 })).fila;
    h = api.fusionarHora_(h, base('Observado SESA', { t: 30, nube: 75, wx: 'lluvia débil' })).fila;
    expect(h).toMatchObject({ fuente: 'Observado SESA', t: 30, lluvia: 0.5, fLluvia: 'MET', nube: 75, fNube: 'Observado SESA', wx: 'lluvia débil', sens: 29, uv: 7 });
    const r = api.fusionarHora_(h, base('MET', { t: 20, lluvia: 0.9, nube: 10, sens: 31 }));
    expect(r.fila).toMatchObject({ fuente: 'Observado SESA', t: 30, nube: 75, lluvia: 0.9, sens: 31 });
    const n = api.fusionarHora_(r.fila, base('NASA', { t: 22, lluvia: 3, nube: 90, rad: 400 }));
    expect(n.fila).toMatchObject({ fuente: 'Observado SESA', t: 30, lluvia: 0.9, fLluvia: 'MET', nube: 75, rad: 400 });
  });

  it('NASA llena lo que nadie tiene, y el tiempo observado y los extras de MET sólo vienen de su fuente', () => {
    const h = api.fusionarHora_(null, base('NASA', { lluvia: 1.2, nube: null })).fila;
    expect(h).toMatchObject({ fuente: 'NASA', t: 25, lluvia: 1.2, fLluvia: 'NASA', nube: null, fNube: '' });
    const s = api.fusionarHora_(h, { dia: '2026-10-20', hora: 10, fuente: 'NASA', sens: 40, wx: 'x' }).fila;
    expect(s.sens).toBeNull();
    expect(s.wx).toBe('');
  });

  it('dice si la hora cambió (una pasada repetida no cambia nada)', () => {
    const h = api.fusionarHora_(null, base('MET')).fila;
    expect(api.fusionarHora_(h, base('MET')).cambio).toBe(false);
    expect(api.fusionarHora_(h, base('MET', { t: 25.1 })).cambio).toBe(true);
  });
});

describe('Clima.gs · el resumen del día y el pronóstico', () => {
  const { api } = cargar();
  const horas = (n, f = () => ({})) => Array.from({ length: n }, (_, h) => ({ ...api.horaVacia_('2026-10-20', h), fuente: 'MET', t: 20 + h * 0.5, hr: 80, v: 10, dir: 200, p: 1010, lluvia: 0.1, nube: 50, sens: 30, niebla: 0, uv: h === 12 ? 11 : 1, ...f(h) }));

  it('con las 24 horas: mínimo, máximo, media, lluvia, máximos de MET y de dónde vino cada hora', () => {
    const d = api.resumenDia_('2026-10-20', horas(24, (h) => (h >= 6 && h <= 18 ? { fuente: 'Observado SESA', wx: h < 9 ? 'lluvia débil' : '' } : {})), 5.5);
    expect(d).toMatchObject({ tipo: 'Registro', tMin: 20, tMax: 31.5, tMed: 25.8, hr: 80, lluvia: 2.4, nube: 50, v: 10, vMax: 10, dir: 200, p: 1010, uvMax: 11, rad: 5.5, hSesa: 13, hMet: 11, hNasa: 0 });
    expect(d.wx).toBe('lluvia débil (3 h)');
  });

  it('con menos de 24 horas de una variable, esa cifra queda VACÍA (una media de 13 horas diurnas no es la del día)', () => {
    const d = api.resumenDia_('2026-10-20', horas(13), null);
    expect([d.tMin, d.tMax, d.tMed, d.hr, d.lluvia, d.nube, d.v, d.dir, d.p, d.uvMax]).toEqual([null, null, null, null, null, null, null, null, null, null]);
    expect(d.hMet).toBe(13);
    const sinLluvia = api.resumenDia_('2026-10-20', horas(24, (h) => (h === 3 ? { lluvia: null } : {})), null);
    expect(sinLluvia.lluvia).toBeNull();
    expect(sinLluvia.tMed).toBe(25.8);
  });

  it('el pronóstico reparte la lluvia de un bloque de 6 h entre los dos días que toca y deja fuera los días a medias', () => {
    // hoy = 27-10 (local). 50 pasos horarios: el 28 y el 29 enteros y el 30 de 00 a 01; luego bloques de 6 h que
    // empiezan a las 02, 08, 14 y 20 local (el de las 20 cruza la medianoche: 4 h en el 30, 2 h en el 31).
    const pasos = [...horarios('2026-10-28T05:00', 50, (i) => ({ mm: 0.1, t: 24 + (i % 24) / 4, uv: i % 24 === 12 ? 12 : 1 })),
      ...['2026-10-30T07:00', '2026-10-30T13:00', '2026-10-30T19:00', '2026-10-31T01:00', '2026-10-31T07:00', '2026-10-31T13:00', '2026-10-31T19:00']
        .map((t) => ({ time: t, g: 6, mm6: 1.2, sinUv: true, min: 22, max: 30 }))];
    const p = api.pronosticoDeMet_(met(pasos), '2026-10-27', 3);
    expect(Object.keys(p)).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
    expect(p['2026-10-28']).toMatchObject({ tipo: 'Pronóstico', lluvia: 2.4, uvMax: 12, tMin: 24, tMax: 29.8, hMet: 24 });
    expect(p['2026-10-29']).toMatchObject({ lluvia: 2.4, uvMax: 12 });
    // 30-10: 2 horas de 0,1 + tres bloques enteros de 1,2 + 4/6 del que cruza la medianoche.
    expect(p['2026-10-30'].lluvia).toBe(4.6);
    expect(p['2026-10-30'].uvMax).toBeNull();      // el UV sólo viene en los pasos horarios: 2 de 24
    expect(p['2026-10-30'].tMin).toBe(22);         // los extremos de los bloques de 6 h cuentan
    expect(p['2026-10-30'].tMax).toBe(30);
    // El 31 sólo tiene 20 horas (2 + 6 + 6 + 6): no es un pronóstico del día.
    expect(Object.keys(api.pronosticoDeMet_(met(pasos), '2026-10-27', 4))).not.toContain('2026-10-31');
  });
});

describe('Clima.gs · las pasadas sobre el libro', () => {
  let ctx, metResp, metarResp, nasaH, nasaD;
  const fuentes = (url, cab) => {
    if (url.includes('aviationweather')) return metarResp === null ? { codigo: 204, cuerpo: '' } : { codigo: 200, cuerpo: metarResp };
    if (url.includes('api.met.no')) {
      if (cab['If-Modified-Since'] && metResp.lm === cab['If-Modified-Since']) return { codigo: 304, cuerpo: '' };
      return { codigo: 200, cuerpo: metResp.json, cabeceras: { 'Last-Modified': metResp.lm } };
    }
    if (url.includes('temporal/hourly')) return { codigo: 200, cuerpo: nasaH };
    if (url.includes('temporal/daily')) return { codigo: 200, cuerpo: nasaD };
    return { codigo: 404, cuerpo: '' };
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T17:10:00Z'));   // 12:10 en Ecuador
    // MET: desde las 12:00 local de hoy, 60 pasos horarios.
    metResp = { lm: 'Tue, 27 Oct 2026 17:00:00 GMT', json: met(horarios('2026-10-27T17:00', 60, () => ({ t: 26, mm: 0.1, nube: 40 }))) };
    metarResp = [metar('2026-10-27T15:00', { temp: 30, wxString: '-RA' }), metar('2026-10-27T16:00', { temp: 31 })];
    // NASA: del 25-10 00:00 local al 26-10 23:00 local, entero.
    nasaH = nasaHoras('2026-10-25T05:00', 48);
    nasaD = { properties: { parameter: { ALLSKY_SFC_SW_DWN: { 20261025: 5.1, 20261026: -999 } } } };
    ctx = cargar({ fuentes });
    ctx.api.CLIMA.desde = '2026-10-25';
  });
  afterEach(() => vi.useRealTimers());

  it('instalar crea las dos hojas con sus cabeceras, carga el historial y deja DOS activadores aunque se repita', () => {
    ctx.api.instalar();
    ctx.api.instalar();
    const { libro, api, triggers } = ctx;
    expect(leer(libro, 'Clima horas')[0]).toEqual(api.COL_HORAS);
    expect(leer(libro, 'Clima')[0]).toEqual(api.COL_DIAS);
    expect(triggers.map((t) => t.fn + ' ' + t.cfg.join('.'))).toEqual(['cadaTresHoras timeBased().everyHours(3)', 'nocturno timeBased().everyDays(1).atHour(2).nearMinute(30)']);
    // 48 horas de NASA + hoy: 10 y 11 observadas, de 12 a 23 MET (las de 00 a 09 aún no las tiene nadie).
    expect(leer(libro, 'Clima horas').length - 1).toBe(48 + 14);
    expect(filaDeHora(api, libro, '2026-10-27', 10)).toMatchObject({ fuente: 'Observado SESA', t: 30, wx: 'lluvia débil' });
    expect(filaDeHora(api, libro, '2026-10-27', 12)).toMatchObject({ fuente: 'MET', t: 26, lluvia: 0.1 });
    expect(filaDeHora(api, libro, '2026-10-25', 0)).toMatchObject({ fuente: 'NASA', t: 24, p: 1009 });
    const dias = leer(libro, 'Clima').slice(1).map(api.deFila_(['dia', 'tipo', 'tMin', 'tMax', 'tMed', 'hr', 'lluvia', 'nube', 'v', 'vMax', 'dir', 'p', 'sensMax', 'nieblaMax', 'uvMax', 'rad', 'wx', 'hSesa', 'hMet', 'hNasa', 'act']));
    expect(dias.map((d) => d.dia + ' ' + d.tipo)).toEqual(['2026-10-25 Registro', '2026-10-26 Registro', '2026-10-27 Registro', '2026-10-28 Pronóstico', '2026-10-29 Pronóstico']);
    expect(dias[0]).toMatchObject({ tMed: 24, lluvia: 2.4, rad: 5.1, hNasa: 24 });
    expect(dias[2]).toMatchObject({ tMed: null, hSesa: 2, hMet: 12 });   // hoy aún sin las 24 horas
    // Las fechas se escriben a la medianoche de Ecuador.
    expect(leer(libro, 'Clima horas')[1][0].toISOString()).toBe('2026-10-25T05:00:00.000Z');
  });

  it('una pasada sin nada nuevo NO escribe (MET responde 304 con If-Modified-Since)', () => {
    ctx.api.instalar();
    const h = ctx.libro.hojas.get('Clima horas'), d = ctx.libro.hojas.get('Clima');
    const antes = [h.escritas, d.escritas];
    ctx.pedidos.length = 0;
    ctx.api.cadaTresHoras();
    expect(ctx.pedidos.find((p) => p.url.includes('api.met.no')).cabeceras['If-Modified-Since']).toBe(metResp.lm);
    expect([h.escritas, d.escritas]).toEqual(antes);
    expect(JSON.parse(ctx.log.at(-1))).toMatchObject({ met: false, horasCambiadas: 0, filasEscritasHoras: 0, filasEscritasDias: 0 });
  });

  it('tres horas después: lo observado pisa al pronóstico de esa hora y sólo se reescribe desde la primera fila que cambió', () => {
    ctx.api.instalar();
    const h = ctx.libro.hojas.get('Clima horas');
    vi.setSystemTime(new Date('2026-10-27T20:10:00Z'));
    metarResp = [metar('2026-10-27T18:00', { temp: 33, clouds: [{ cover: 'OVC' }] })];   // 13:00 local
    metResp = { lm: 'Tue, 27 Oct 2026 20:00:00 GMT', json: met(horarios('2026-10-27T20:00', 60, () => ({ t: 27, mm: 0.2 }))) };
    const antes = h.escritas;
    ctx.api.cadaTresHoras();
    const { api, libro } = ctx;
    expect(filaDeHora(api, libro, '2026-10-27', 12)).toMatchObject({ fuente: 'MET', t: 26, lluvia: 0.1 });   // ya pasó: queda
    expect(filaDeHora(api, libro, '2026-10-27', 13)).toMatchObject({ fuente: 'Observado SESA', t: 33, nube: 100, fNube: 'Observado SESA', lluvia: 0.1, fLluvia: 'MET' });
    expect(filaDeHora(api, libro, '2026-10-27', 15)).toMatchObject({ fuente: 'MET', t: 27, lluvia: 0.2 });
    // Las 48 horas de NASA y las de hoy hasta las 12 no cambian: se escribe de la fila de las 13 en adelante.
    expect(h.escritas - antes).toBe(11);
  });

  it('al día siguiente, la fila de «Pronóstico» de hoy pasa a «Registro» y una de un día pasado sin horas se borra', () => {
    ctx.api.instalar();
    const { api, libro } = ctx;
    const d = libro.hojas.get('Clima');
    // Un pronóstico viejo (24-10) que nunca llegó a tener horas.
    d.filas.splice(1, 0, api.aFilaDias_({ ...api.resumenDia_('2026-10-24', [], null), tipo: 'Pronóstico' }));
    vi.setSystemTime(new Date('2026-10-28T08:10:00Z'));   // 03:10 del 28-10
    metarResp = null;
    metResp = { lm: 'Wed, 28 Oct 2026 08:00:00 GMT', json: met(horarios('2026-10-28T08:00', 70)) };
    ctx.api.cadaTresHoras();
    const dias = leer(libro, 'Clima').slice(1).map((f) => api.claveDeCelda_(f[0]) + ' ' + f[1]);
    expect(dias).toEqual(['2026-10-25 Registro', '2026-10-26 Registro', '2026-10-27 Registro', '2026-10-28 Registro', '2026-10-29 Pronóstico', '2026-10-30 Pronóstico']);
  });

  it('la pasada nocturna pide a NASA sólo desde el primer día con hueco, con un día UTC de más', () => {
    ctx.api.instalar();
    ctx.pedidos.length = 0;
    ctx.api.nocturno();
    const url = ctx.pedidos.find((p) => p.url.includes('temporal/hourly')).url;
    expect(url).toContain('start=20261025');   // a las horas de NASA les falta la nubosidad y la radiación
    expect(url).toContain('end=20261028');
    expect(url).toContain('time-standard=UTC');
    expect(ctx.pedidos.find((p) => p.url.includes('temporal/daily')).url).toContain('start=20261026');
    expect(ctx.api.primerDiaConHueco_([], '2026-10-01', '2026-09-30')).toBeNull();
  });

  it('se identifica ante MET y AWC con el agente del proyecto', () => {
    ctx.api.instalar();
    for (const p of ctx.pedidos) expect(p.cabeceras['User-Agent']).toBe(ctx.api.CLIMA.agente);
    expect(ctx.api.CLIMA.agente).toMatch(/^MCP-Omarsa-clima\/\d/);
  });

  /* El del MCP está en «America/Los_Angeles» (medido el 27-10); Madrid, al ESTE de Ecuador, porque allí la medianoche
     cae el día ANTERIOR en Ecuador: leer la fecha sin la zona del libro acertaría por casualidad en Los Ángeles. */
  it.each(['America/Los_Angeles', 'Europe/Madrid'])('en un libro de OTRA zona (%s) escribe el día y la hora de Ecuador, y repetir no escribe', (zona) => {
    const la = cargar({ libro: libroSimulado(zona), fuentes });
    la.api.CLIMA.desde = '2026-10-25';
    la.api.instalar();
    const { libro, api, log } = la;
    expect(log.some((l) => l.includes('«' + zona + '»'))).toBe(true);   // lo dice, no se niega
    // Lo que ENSEÑA el libro (y su CSV, que lee el MCP) es la celda en la zona del LIBRO.
    const enLibro = (d, patron) => UTIL.formatDate(d, zona, patron);
    const horas = leer(libro, 'Clima horas').slice(1);
    expect(enLibro(horas[0][0], 'yyyy-MM-dd') + ' ' + horas[0][1]).toBe('2026-10-25 0');
    expect(enLibro(horas.at(-1)[0], 'yyyy-MM-dd') + ' ' + horas.at(-1)[1]).toBe('2026-10-27 23');
    expect(enLibro(horas[0].at(-1), 'yyyy-MM-dd HH:mm')).toBe('2026-10-27 12:10');   // «Actualizado»: las 12:10 de Ecuador
    expect(leer(libro, 'Clima').slice(1).map((f) => enLibro(f[0], 'yyyy-MM-dd') + ' ' + f[1]))
      .toEqual(['2026-10-25 Registro', '2026-10-26 Registro', '2026-10-27 Registro', '2026-10-28 Pronóstico', '2026-10-29 Pronóstico']);
    // y se RELEE igual: las mismas horas que en un libro de Ecuador
    expect(filaDeHora(api, libro, '2026-10-27', 10)).toMatchObject({ fuente: 'Observado SESA', t: 30 });
    expect(filaDeHora(api, libro, '2026-10-25', 0)).toMatchObject({ fuente: 'NASA', t: 24 });
    // Repetir no reescribe nada: escribir y releer son inversas (si no, «Actualizado» se correría en cada pasada).
    const antes = [libro.hojas.get('Clima horas').escritas, libro.hojas.get('Clima').escritas];
    la.api.cadaTresHoras();
    expect([libro.hojas.get('Clima horas').escritas, libro.hojas.get('Clima').escritas]).toEqual(antes);
    expect(JSON.parse(log.at(-1))).toMatchObject({ horasCambiadas: 0, filasEscritasHoras: 0, filasEscritasDias: 0 });
  });

  it('no escribe en una hoja «Clima» con otras columnas', () => {
    const ajeno = libroSimulado();
    ajeno.insertSheet('Clima').filas.push(['Fecha', 'Otra cosa']);
    expect(() => cargar({ libro: ajeno, fuentes }).api.cadaTresHoras()).toThrow(/columnas esperadas/);
  });

  it('una fuente caída no impide guardar las demás, y la ejecución termina EN ERROR (Apps Script la marca)', () => {
    ctx = cargar({ fuentes: (url) => (url.includes('api.met.no') ? { codigo: 503, cuerpo: '' } : fuentes(url, {})) });
    expect(() => ctx.api.cadaTresHoras()).toThrow(/Fuentes caídas.*MET Noruega: HTTP 503/);
    expect(leer(ctx.libro, 'Clima horas').length - 1).toBe(2);   // las dos horas observadas en SESA
    expect(JSON.parse(ctx.log.at(-1))).toMatchObject({ metar: true, met: false });
    // Y la instalación deja sus activadores aunque una fuente falle: la pasada siguiente lo recupera.
    const inst = cargar({ fuentes: (url) => (url.includes('temporal/daily') ? { codigo: 500, cuerpo: 'x' } : fuentes(url, {})) });
    expect(() => inst.api.instalar()).toThrow(/NASA POWER \(días\): HTTP 500/);
    expect(inst.triggers).toHaveLength(2);
  });
});
