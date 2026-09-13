// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Lab. Algas — las observaciones son una lista CERRADA de chips

   Se eligen marcando chips (multiselección) y se guardan como CSV en el campo
   `obs`. Al ser cerrada, lo que NO esté en `ALG_OBS_OPTS` no se puede registrar:
   por eso añadir una frase es un cambio de dato, no de maquetación.

   🔴 «Descartado nm» la pidió el usuario el 2026-09-04. Se añade AL FINAL a
   propósito: quien rellena esto a diario busca los chips por posición, y meter
   uno en medio movería los 17 que ya estaban.
   🔴 2026-09-13 · el usuario la RENOMBRA: «Descartado por bueno». Es la misma
   observación con otro texto, así que conserva su sitio (al final) y lo guardado con
   el texto viejo se traduce al nuevo en los dos puntos donde si no se perdería o
   viajaría mal: al pintar el formulario (el chip saldría desmarcado y al guardar se
   borraría la marca) y al armar el envío a la hoja. Medido ese día: 0 filas de
   Lab_Algas llevaban el texto viejo, así que en la hoja no hay nada que migrar.

   QUÉ VIGILA ESTA PRUEBA, Y POR QUÉ ASÍ
   No basta con mirar la constante: un chip que no se pinte, o que se pinte con
   un valor distinto del que se guarda, dejaría la observación inalcanzable
   aunque la constante fuese perfecta. Se comprueba el RECORRIDO entero — que la
   frase esté en el catálogo, que salga como chip, y que un registro que ya la
   trae la muestre marcada.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderAlgas', 'ALG_OBS_OPTS', 'saveE', 'collect', 'buildAlgasPayload',
  'pushAlgLog', 'downloadBitacoraPDF', 'today'];
const H = {};
const NUEVA = 'Descartado por bueno';
const VIEJA = 'Descartado nm';

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

  const epilogo = '\n;(function(){ var H = globalThis.__ENG2;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}\n})();';
  globalThis.__ENG2 = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

const fp = () => document.getElementById('fp-algas');
const chips = () => [...fp().querySelectorAll('input[data-group="obs"]')];

describe('Algas · observaciones', () => {
  it('🔴 «Descartado por bueno» está en el catálogo, y AL FINAL', () => {
    expect(H.ALG_OBS_OPTS).toContain(NUEVA);
    expect(H.ALG_OBS_OPTS[H.ALG_OBS_OPTS.length - 1]).toBe(NUEVA);
  });

  it('🔴 y el texto viejo «Descartado nm» ya no se ofrece', () => {
    expect(H.ALG_OBS_OPTS).not.toContain(VIEJA);
  });

  it('🔴 y llega hasta el formulario como un chip que se puede marcar', () => {
    /* La constante puede ser perfecta y el chip no pintarse: la observación quedaría
       inalcanzable. Lo que importa es el recorrido completo. */
    H.renderAlgas();
    const valores = chips().map((c) => c.value);
    expect(valores, 'no se pintó ningún chip de observación').not.toHaveLength(0);
    expect(valores).toContain(NUEVA);
  });

  it('los chips salen de la constante, no de un literal tecleado', () => {
    /* Si alguien añade una frase a `ALG_OBS_OPTS`, tiene que aparecer sola. */
    H.renderAlgas();
    expect(chips().map((c) => c.value)).toEqual(H.ALG_OBS_OPTS);
  });

  it('no se coló ninguna frase repetida', () => {
    /* Dos chips con el mismo texto se guardarían igual y se marcarían a la vez: parece
       un fallo de la app y en realidad sería del catálogo. */
    expect(new Set(H.ALG_OBS_OPTS).size).toBe(H.ALG_OBS_OPTS.length);
  });
});

/* 🔴 Lo guardado ANTES del cambio de nombre. Un borrador del día (o un registro del historial
   pendiente) con «Descartado nm» no tiene ya chip con ese valor: sin traducción, el formulario
   lo pintaría desmarcado y el siguiente guardado BORRARÍA la observación sin avisar. */
describe('Algas · observaciones · el texto viejo guardado no se pierde', () => {
  it('🔴 un borrador con «Descartado nm» pinta MARCADO «Descartado por bueno»', () => {
    H.setMod(1);
    expect(H.saveE(1, 'algas', { obs: 'Grumos, ' + VIEJA })).not.toBe(false);
    H.renderAlgas();
    const marcados = chips().filter((c) => c.checked).map((c) => c.value);
    expect(marcados).toEqual(['Grumos', NUEVA]);
  });

  it('🔴 y al volver a recoger el formulario se guarda con el texto NUEVO', () => {
    H.setMod(1);
    H.saveE(1, 'algas', { obs: VIEJA });
    H.renderAlgas();
    const d = H.collect('algas', { quiet: true });
    expect(d.obs).toBe(NUEVA);
  });

  it('🔴 un registro pendiente con el texto viejo viaja a la hoja con el NUEVO', () => {
    const p = H.buildAlgasPayload(1, [
      { ts: 1, data: { fecha: '2026-09-13', obs: 'Grumos, ' + VIEJA, sid: 'a1' } },
      { ts: 2, data: { fecha: '2026-09-13', obs: 'Grumos', sid: 'a2' } },
    ]);
    const col = p.headers.indexOf('Observaciones');
    expect(p.rows.map((r) => r[col])).toEqual(['Grumos, ' + NUEVA, 'Grumos']);
  });

  it('🔴 la bitácora en PDF de un día ya sincronizado dice el texto NUEVO', () => {
    /* La bitácora lee lo sincronizado de las últimas 72 h: puede traer registros de antes del
       cambio. Si imprimiera el texto viejo, el papel y la hoja dirían cosas distintas. */
    H.setMod(11); // Lab. Algas
    const hoy = H.today();
    H.pushAlgLog({ fecha: hoy, obs: 'Grumos, ' + VIEJA, sid: 'pdf1' });
    let html = '';
    const abrir = window.open;
    window.open = () => ({ document: { write(s) { html += s; }, close() {}, title: '' } });
    try { H.downloadBitacoraPDF(hoy); } finally { window.open = abrir; }
    expect(html).toContain(NUEVA);
    expect(html).not.toContain(VIEJA);
  });

  it('la traducción no toca una frase que sólo se PARECE', () => {
    const p = H.buildAlgasPayload(1, [{ ts: 1, data: { fecha: '2026-09-13', obs: 'Descartado nmx', sid: 'a3' } }]);
    expect(p.rows[0][p.headers.indexOf('Observaciones')]).toBe('Descartado nmx');
  });
});
