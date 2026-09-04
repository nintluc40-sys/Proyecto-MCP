// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Lab. Algas — «Volumen de Despacho (L)» elige O escribe

   El usuario pidió (2026-08-26) que este campo sugiera los volúmenes habituales
   —700, 2500, 20000 y 25000— «como el campo de responsable/analista de
   microbiología»: una lista para escoger que NO impide teclear otro valor.

   ⚠⚠ CAMBIÓ LA FORMA, NO EL ENCARGO (2026-09-04). Al principio se resolvió con un
   `<datalist>`, y el motivo que había escrito aquí era bueno: un `<select>` CERRADO
   obligaría a inventar una opción «Otro» y convertiría en INVÁLIDO cualquier volumen
   que no esté en la lista, que es lo contrario de lo pedido. Pero el usuario reportó
   que **en el MÓVIL no sirve**: los navegadores de teléfono no despliegan el datalist
   de forma fiable, así que el campo se quedaba en un número suelto, sin lista y sin
   manera de escoger.

   LA FORMA DE AHORA cumple las dos mitades y sí funciona en un teléfono: un
   `<select>` NATIVO —que en móvil abre el selector del sistema— AL LADO del mismo
   `<input type="number">` de siempre.
   - el INPUT sigue siendo el dato: conserva su `name` (nada cambia al guardar),
     mantiene el teclado numérico y admite CUALQUIER volumen;
   - el SELECT sólo rellena, y **no lleva `name`**, así que nunca entra en el
     payload — los campos se recogen con `fp.querySelectorAll("[name]")`.
   Ningún volumen se vuelve inválido, que era el motivo REAL para descartar el select
   cerrado. El razonamiento viejo no era falso: era sobre otra cosa.

   QUÉ VIGILA ESTA PRUEBA, Y POR QUÉ ASÍ
   Que el desplegable EXISTA no basta, y que el input exista tampoco: lo que hay que
   distinguir es que los dos estén CONECTADOS (elegir rellena el campo) y que el
   campo siga aceptando un valor libre. Y una que sale barata y evita un defecto
   silencioso: que el select NO tenga `name`, porque si lo tuviera se colaría en el
   registro guardado.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderAlgas', 'ALG_VOL_DESPACHO_OPTS', 'algVolPick', 'algVolSync', 'collect'];
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
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

const fp = () => document.getElementById('fp-algas');
const campo = () => fp().querySelector('[name="vol_despacho"]');
const desplegable = () => fp().querySelector('.alg-vol-sel');

describe('Algas · el Volumen de Despacho se elige de una lista Y se escribe', () => {
  it('🔴 hay un DESPLEGABLE de verdad, que en el móvil sí se abre', () => {
    /* Es la mitad del encargo que el `datalist` no cumplía en un teléfono. Se exige un
       `<select>` nativo, no un adorno: el selector del sistema sólo aparece con éste. */
    H.renderAlgas();
    const sel = desplegable();
    expect(sel, 'no se encontró el desplegable de volúmenes').toBeTruthy();
    expect(sel.tagName).toBe('SELECT');
  });

  it('🔴 el desplegable NO se guarda: no lleva `name`', () => {
    /* Los campos del registro se recogen con `querySelectorAll("[name]")`. Si el select
       llevara `name`, se colaría en el payload y ensuciaría el registro con un duplicado
       del volumen. */
    H.renderAlgas();
    expect(desplegable().hasAttribute('name')).toBe(false);
  });

  it('🔴 ofrece exactamente los cuatro volúmenes que pidió el usuario', () => {
    H.renderAlgas();
    const valores = [...desplegable().querySelectorAll('option')]
      .map((o) => o.getAttribute('value')).filter(Boolean);
    expect(valores).toEqual(['700', '2500', '20000', '25000']);
    // Y salen de la constante, no de un literal tecleado: si alguien añade un volumen a
    // `ALG_VOL_DESPACHO_OPTS` tiene que aparecer solo.
    expect(valores).toEqual(H.ALG_VOL_DESPACHO_OPTS.map(String));
    // La primera opción es el rótulo, y no vale como volumen.
    expect(desplegable().querySelector('option').getAttribute('value')).toBe('');
  });

  it('🔴 elegir del desplegable RELLENA el campo', () => {
    /* Los dos elementos pueden existir y no estar conectados — se vería igual y no
       serviría de nada. Esto distingue «hay un select» de «el select funciona». */
    H.renderAlgas();
    const sel = desplegable(), inp = campo();
    inp.value = '';
    sel.value = '2500';
    H.algVolPick(sel);
    expect(inp.value).toBe('2500');
  });

  it('🔴 sigue admitiendo un volumen que NO está en la lista', () => {
    // La otra mitad del encargo: sugerir sin cerrar. Un select CERRADO rompería esto.
    H.renderAlgas();
    const inp = campo();
    expect(inp.tagName).toBe('INPUT');
    inp.value = '13750';
    expect(inp.value).toBe('13750');
    // `type=number` se conserva: el dato ES un número y así el móvil abre el teclado
    // numérico, que es media usabilidad del campo.
    expect(inp.getAttribute('type')).toBe('number');
  });

  it('🔴 el desplegable NUNCA dice un volumen distinto del que hay escrito', () => {
    /* Si se elige 2500 y luego se teclea 13750, un select que siguiera marcando 2500
       estaría mintiendo sobre el dato que se va a guardar. Se sincroniza al teclear. */
    H.renderAlgas();
    const sel = desplegable(), inp = campo();
    sel.value = '2500'; H.algVolPick(sel);
    expect(sel.value).toBe('2500');
    inp.value = '13750'; H.algVolSync(inp);
    expect(sel.value, 'con un volumen libre el select vuelve al rótulo').toBe('');
    inp.value = '700'; H.algVolSync(inp);
    expect(sel.value, 'y si coincide con uno habitual, lo refleja').toBe('700');
  });

  it('elegir vacío («Habituales…») NO borra lo que hay escrito', () => {
    /* Volver al rótulo es sólo dejar de sugerir; llevarse por delante un volumen ya
       tecleado sería perder un dato por tocar un desplegable. */
    H.renderAlgas();
    const sel = desplegable(), inp = campo();
    inp.value = '13750';
    sel.value = '';
    H.algVolPick(sel);
    expect(inp.value).toBe('13750');
  });
});

/* 🔴🔴 EL VIAJE COMPLETO — el hueco que destapó la auditoría del 2026-09-04.
   Todo lo de arriba mira el DOM. Pero lo que de verdad importa es qué DATO sale, y eso
   lo decide `collect()`, que recorre `[name]`. Entre «el input tiene el valor» y «el
   valor llega al registro» cabe justo el defecto que este cambio podía introducir: que
   el select se colara con un `name`, o que el input perdiera el suyo.
   Comprobar el DOM y no el dato es la versión de este campo del error que ya costó tres
   botones muertos: mirar la representación en vez del efecto. */
describe('Algas · Volumen de Despacho · lo que de verdad se GUARDA', () => {
  it('🔴 elegir en el desplegable llega hasta el dato recolectado', () => {
    H.renderAlgas();
    const sel = desplegable();
    sel.value = '20000';
    H.algVolPick(sel);
    const d = H.collect('algas', { quiet: true });
    expect(d.vol_despacho).toBe(20000);
  });

  it('🔴 un volumen LIBRE también llega, sin que el select lo pise', () => {
    H.renderAlgas();
    const inp = campo();
    inp.value = '13750';
    H.algVolSync(inp);
    const d = H.collect('algas', { quiet: true });
    expect(d.vol_despacho).toBe(13750);
  });

  it('🔴 el desplegable NO aporta ninguna clave al registro', () => {
    /* Si el select ganara un `name`, aparecería aquí una clave de más que acabaría en la
       hoja. Se comprueba que NINGUNA clave recolectada huela al desplegable. */
    H.renderAlgas();
    const sel = desplegable();
    sel.value = '700';
    H.algVolPick(sel);
    const claves = Object.keys(H.collect('algas', { quiet: true }));
    expect(claves).toContain('vol_despacho');
    expect(claves.filter((k) => k !== 'vol_despacho' && /vol/i.test(k))).toEqual([]);
  });
});
