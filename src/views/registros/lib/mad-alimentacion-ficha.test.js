// @vitest-environment happy-dom
/* MADURACIÓN · la ficha 🍤 Alimentación en el monolito arrancado entero (2026-09-15): lee el saldo y los pesos, calcula
   en pantalla, respeta la agenda guardada en la hoja salvo cambios sin guardar, guarda por tanque y no envía a un GAS
   que no conoce la hoja. */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_ALIM_HEADERS } from './ficha-maduracion-alimentacion.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadAlimentacion', 'madAlimLeer', 'madAlimTomaCambio', 'madAlimTomaOrdenar', 'madAlimTanqueCambio', 'madAlimTomaAgregar', 'madAlimTomaQuitar',
  'madAlimEstandar', 'madAlimCopiarATodas', 'madAlimGuardar', 'madAlimRevisar', 'madAlimPdf', 'madAlimVaciar', 'MAD_ALIM_CFG_KEY'];
const H = {};
const avisos = [];
const envios = [];
let respuestaVer = null;
let impreso = null;

const HOJAS = {
  'Maduración Ingreso': [
    { Fecha: '2026-01-01', Lote: 'AB', 'Código genético': 'CG1', Sala: 'Sala 1', Tanque: 1, Machos: 20, Hembras: 40, 'Peso promedio machos (g)': 50, 'Peso promedio hembras (g)': 60 },
    { Fecha: '2026-01-02', Lote: 'CD', 'Código genético': 'CG2', Sala: 'Sala 2', Tanque: 16, Machos: 10, Hembras: 10, 'Peso promedio machos (g)': 40, 'Peso promedio hembras (g)': 45 },
  ],
  'Maduración Movimientos': [],
  'Maduración Tanques': [{ Fecha: '2026-01-10', Sala: 'Sala 1', Tanque: 1, 'Machos muertos': 0, 'Hembras muertas': 0, 'Peso promedio machos (g)': 55, 'Peso promedio hembras (g)': 70 }],
  'Maduración Fin de Ciclo': [],
  'Maduración Mortalidad Desove': [],
  // La Sala 2 tiene una agenda guardada: sólo Krill al 1 % a las 07:00.
  'Maduración Alimentación': [{ Fecha: '2026-01-11', Sala: 'Sala 2', Tanque: 16, Tomas: '07:00 Krill 1; 14:00 —' }],
};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
      clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; } };
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
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, globalThis.localStorage, globalThis);
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPost(async (payload) => { envios.push(payload); return true; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  window.confirm = () => true;
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.indexOf('p=ver') !== -1) {
      const cuerpo = typeof respuestaVer === 'string' ? respuestaVer : JSON.stringify(respuestaVer);
      return { ok: true, status: 200, text: async () => cuerpo };
    }
    const m = /sheet=([^&]+)/.exec(u);
    const filas = m && HOJAS[m[1]];
    const cuerpo = filas ? JSON.stringify({ ok: true, headers: [], rows: filas }) : JSON.stringify({ ok: false, error: 'Hoja no permitida' });
    return { ok: true, status: 200, text: async () => cuerpo };
  };
  window.open = () => ({ document: { write: (s) => { impreso = s; }, close() {} } });
});

const q = (s) => document.querySelector('#fp-alimentacion ' + s);
const sala = (n) => document.querySelector('#fp-alimentacion .ma-sala[data-sala="' + n + '"]');
const cfg = () => JSON.parse(localStorage.getItem(H.MAD_ALIM_CFG_KEY) || '{}');

beforeEach(() => {
  avisos.length = 0;
  envios.length = 0;
  impreso = null;
  respuestaVer = { ok: true, version: 'abc123def456', caps: ['matriz-reciclaje', 'mad-alimentacion'] };
  localStorage.removeItem(H.MAD_ALIM_CFG_KEY);
  H.madAlimVaciar();   // olvida la lectura anterior y vuelve a pintar
});

describe('Alimentación · la ficha', () => {
  it('la pestaña está cableada y, sin leer, cada sala enseña la agenda estándar', () => {
    const src = readFileSync(ENGINE, 'utf8');
    expect(src).toContain('alimentacion: ["🍤","Alimentación"]');
    expect(src).toContain('if(t==="alimentacion") renderMadAlimentacion();');
    expect(src).toMatch(/const MAD_TABS\s+= \[[^\]]*"tratamientos","alimentacion"/);
    /* 2026-09-15 · su hoja es NUEVA, así que entra en la lista que impide entregarla a un GAS viejo.
       Faltaba: las otras cuatro hojas nuevas sí estaban, y cada una lo fija en su prueba. Sin ella, un
       envío encolado salía a la red para volver con «Hoja no permitida» en vez de esperar en la cola. */
    expect(src).toMatch(/function _madHojaPideGasNuevo\(hoja\)\{[^}]*hoja === MAD_ALIM_SHEET/);
    expect(q('.fc-t').textContent).toBe('🍤 Maduración · Alimentación');
    expect(sala('Sala 1').querySelectorAll('.ma-toma')).toHaveLength(14);
    expect(sala('Sala 1').querySelector('.ma-tq')).toBeNull();
    expect(q('#ma-leer-btn').getAttribute('onclick')).toBe('madAlimLeer()');
  });

  it('🔴 Leer: tanques del saldo con su peso (biometría del lote o Ingreso), kg por tanque y resumen general', async () => {
    await H.madAlimLeer();
    const t1 = sala('Sala 1').querySelector('.ma-tq[data-tq="1"]');
    // Sala 1 · T1: 40 ♀ × 70 g (biometría del 01-10) + 20 ♂ × 55 g = 3,9 kg; agenda estándar 14,05 % → 0,548 kg/día.
    expect([t1.querySelector('.ma-h').value, t1.querySelector('.ma-m').value, t1.querySelector('.ma-ph').value, t1.querySelector('.ma-pm').value]).toEqual(['40', '20', '70', '55']);
    expect(t1.querySelector('.ma-fuente').textContent).toBe('♀ Biometría 2026-01-10 · ♂ Biometría 2026-01-10');
    expect([t1.querySelector('.ma-bio').textContent, t1.querySelector('.ma-kgdia').textContent]).toEqual(['3.9', '0.548']);
    // Sala 2 · T16: sin biometría → Ingreso (45 g ♀, 40 g ♂) = 0,85 kg; la agenda guardada en la hoja (Krill 1 %) → 0,009 kg/día.
    const t16 = sala('Sala 2').querySelector('.ma-tq[data-tq="16"]');
    expect(t16.querySelector('.ma-fuente').textContent).toBe('♀ Ingreso 2026-01-02 · ♂ Ingreso 2026-01-02');
    expect(sala('Sala 2').querySelectorAll('.ma-toma')).toHaveLength(2);
    expect(t16.querySelector('.ma-kgdia').textContent).toBe('0.009');
    expect(cfg()['Sala 2']).toMatchObject({ pendiente: false, desde: '2026-01-11' });
    const general = q('#ma-general').textContent;
    expect(general).toContain('Resumen general');
    expect(general).toContain('0.557');   // 0,548 + 0,009 kg/día
    expect(q('#ma-nota').textContent).toContain('agenda(s) guardada(s) traída(s) de la hoja');
    expect(sala('Sala 1').querySelector('.ma-grid table')).not.toBeNull();
  });

  it('🔴 cambiar un % recalcula en el acto y deja la agenda como pendiente; una agenda pendiente no la pisa la hoja', async () => {
    await H.madAlimLeer();
    const el = sala('Sala 2');
    const pct = el.querySelector('.ma-toma .ma-pct');
    pct.value = '2';
    H.madAlimTomaCambio(pct);
    expect(el.querySelector('.ma-tq[data-tq="16"] .ma-kgdia').textContent).toBe('0.017');
    expect(el.querySelector('.ma-pend').hidden).toBe(false);
    expect(cfg()['Sala 2'].pendiente).toBe(true);
    await H.madAlimLeer();
    expect(sala('Sala 2').querySelector('.ma-toma .ma-pct').value).toBe('2');
  });

  it('🔴 J1: cambiar la hora NO repinta (se sigue escribiendo); al salir del campo reordena por el día de alimentación', async () => {
    await H.madAlimLeer();
    const el = sala('Sala 2');
    const hora = el.querySelector('.ma-toma .ma-hora');
    expect([hora.getAttribute('onchange'), hora.getAttribute('onblur')]).toEqual(['madAlimTomaCambio(this)', 'madAlimTomaOrdenar(this)']);
    hora.value = '02:00';
    H.madAlimTomaCambio(hora);
    expect(el.querySelector('.ma-toma .ma-hora')).toBe(hora);   // la misma fila, el mismo input: el foco no se pierde
    expect(cfg()['Sala 2'].tomas.map((t) => t.hora)).toEqual(['02:00', '14:00']);
    H.madAlimTomaOrdenar(hora);
    expect([...el.querySelectorAll('.ma-hora')].map((h) => h.value)).toEqual(['14:00', '02:00']);
    // Ya ordenadas, salir de otra hora no repinta.
    const primera = el.querySelector('.ma-toma .ma-hora');
    H.madAlimTomaOrdenar(primera);
    expect(el.querySelector('.ma-toma .ma-hora')).toBe(primera);
  });

  it('➕ y ✕ tomas (J2: la vacía no se guarda en la agenda); ↺ Estándar y 📋 Copiar a todas', async () => {
    await H.madAlimLeer();
    const el = sala('Sala 2');
    H.madAlimTomaAgregar(el.querySelector('.ma-toma button'));
    expect(el.querySelectorAll('.ma-toma')).toHaveLength(3);
    const pct = el.querySelector('.ma-toma .ma-pct');
    H.madAlimTomaCambio(pct);
    expect(cfg()['Sala 2'].tomas).toHaveLength(2);
    H.madAlimTomaQuitar(el.querySelector('.ma-toma:last-child button'));
    expect(el.querySelectorAll('.ma-toma')).toHaveLength(2);
    H.madAlimEstandar(el.querySelector('.ma-toma button'));
    expect(sala('Sala 2').querySelectorAll('.ma-toma')).toHaveLength(14);
    const s1 = sala('Sala 1');
    const p = s1.querySelector('.ma-toma .ma-pct');
    p.value = '1';
    H.madAlimTomaCambio(p);
    H.madAlimCopiarATodas(s1.querySelector('.ma-toma button'));
    expect(cfg()['Sala 3'].tomas[0]).toMatchObject({ hora: '06:00', producto: 'Redy Mate', pct: '1' });
  });

  it('🔴 Guardar: una fila por tanque con kg por alimento, fuente del peso y la agenda; la agenda deja de estar pendiente', async () => {
    await H.madAlimLeer();
    const t1 = sala('Sala 1').querySelector('.ma-tq[data-tq="1"]');
    t1.querySelector('.ma-ph').value = '72';
    H.madAlimTanqueCambio(t1.querySelector('.ma-ph'));
    expect(t1.querySelector('.ma-fuente').textContent).toBe('♀ Manual · ♂ Biometría 2026-01-10');
    const pct = sala('Sala 2').querySelector('.ma-toma .ma-pct');
    H.madAlimTomaCambio(pct);
    q('#ma-fecha').value = '2026-01-12';
    await H.madAlimGuardar();
    expect(envios).toHaveLength(1);
    const { sheetName, headers, rows } = envios[0];
    const c = (h) => MAD_ALIM_HEADERS.indexOf(h);
    expect([sheetName, headers]).toEqual(['Maduración Alimentación', MAD_ALIM_HEADERS]);
    // Sala 1 · T1 con el peso ♀ corregido: 40 × 72 + 20 × 55 = 3980 g; Krill 4,5 % del día → 0,179 kg; Calamar 7 % → 0,279 kg.
    expect(rows.map((r) => [r[c('Sala')], r[c('Tanque')], r[c('Peso hembras (g)')], r[c('Fuente del peso')], r[c('Krill (kg/día)')], r[c('ID')]])).toEqual([
      ['Sala 1', 1, 72, '♀ Manual · ♂ Biometría 2026-01-10', 0.179, '2026-01-12-S1-T1'],
      ['Sala 2', 16, 45, '♀ Ingreso 2026-01-02 · ♂ Ingreso 2026-01-02', 0.009, '2026-01-12-S2-T16'],
    ]);
    expect(rows[1][c('Tomas')]).toBe('07:00 Krill 1; 14:00 —');
    expect(rows[0][c('Calamar (kg/día)')]).toBe(0.279);
    expect(cfg()['Sala 2'].pendiente).toBe(false);
    expect(avisos.some((a) => a.msg.includes('Alimentación registrada'))).toBe(true);
    expect(q('#ma-log').textContent).toContain('Registrado desde este dispositivo');
  });

  it('🔴 un GAS que no anuncia «mad-alimentacion» (o el viejo) no recibe nada y lo calculado se queda', async () => {
    await H.madAlimLeer();
    for (const r of [{ ok: true, version: 'x', caps: ['matriz-reciclaje'] }, 'FichasLarv-OK']) {
      respuestaVer = r;
      await H.madAlimGuardar();
      expect(envios).toHaveLength(0);
      expect(q('#ma-report').textContent).toContain('no conoce la hoja «Maduración Alimentación»');
    }
    expect(sala('Sala 1').querySelector('.ma-tq')).not.toBeNull();
  });

  it('sin leer no hay nada que guardar ni imprimir; el PDF de una sala lleva su ración por tanque y toma', async () => {
    await H.madAlimGuardar();
    expect(envios).toHaveLength(0);
    expect(q('#ma-report').textContent).toContain('No hay tanques con animales');
    H.madAlimPdf('todo');
    expect(impreso).toBeNull();
    await H.madAlimLeer();
    const b = sala('Sala 1').querySelector('button[data-a="sala:Sala 1"]');
    expect(b.getAttribute('onclick')).toBe('madAlimPdf(this.dataset.a)');
    H.madAlimPdf(b.dataset.a);
    expect(impreso).toContain('Alimentación · Sala 1');
    expect(impreso).toContain('08:30');
    expect(impreso).not.toContain('Resumen general');
    expect(impreso).not.toContain('🏠 Sala 2');
    H.madAlimPdf('todo');
    expect(impreso).toContain('🏠 Sala 2');
    expect(impreso).toContain('Resumen general');
    H.madAlimVaciar();
    expect(sala('Sala 1').querySelector('.ma-tq')).toBeNull();
  });
});
