// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Biomol — las columnas de qPCR salen AL TECLEAR, no al soltar el foco

   LO QUE REPORTÓ EL USUARIO (2026-09-01), dos síntomas con UNA sola causa:

     1. «pongo Positivo en IHHNV y no salen las columnas de Ct y Copias; la única
        manera de que salgan es pulsando Guardar local».
     2. «sólo me deja escribir el resultado de la PRIMERA fila; las demás se quedan
        bloqueadas aunque marque positivo».

   LA CAUSA. La celda de resultado llevaba `onchange="bioPatCambio()"`, y en un
   `<input type="text">` el evento `change` NO se dispara al teclear: sólo cuando el
   campo PIERDE EL FOCO. El otro asa, `oninput`, sólo marcaba la grilla como sucia.
   Así que mientras el analista escribía no se repintaba nada, y cualquier cosa que le
   quitara el foco —pulsar «Guardar local», por ejemplo— parecía ser lo que «arreglaba»
   la pantalla.

   Y el segundo síntoma es el MISMO defecto: al marcar positiva la fila 2, sus celdas de
   Ct y Copias sólo se abren tras un repintado; si el analista va directo a pinchar esa
   celda —que está DESHABILITADA— el clic no produce un blur fiable, `change` nunca se
   dispara y la fila se queda congelada para siempre.

   ⚠⚠ POR QUÉ NO LO CAZÓ NADA. `biomol-qpcr.test.js` sí cubre varias filas positivas,
   pero lo hace con un ayudante que ejecuta A MANO el atributo `onchange`
   (`new Function(..., c.getAttribute('onchange'))`), porque happy-dom no ejecuta los
   handlers inline. Eso prueba que `bioPatCambio` hace bien su trabajo — y no prueba
   NADA sobre CUÁNDO se le llama, que es justo donde estaba el defecto. Esta batería
   cubre el asa, no la función: mira `oninput`.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');

const EXPORTAR = ['renderBiomol', '_collectBioGrid', 'bioGridFecha', 'saveBioGrid',
  'bioPatCambio', 'bioPatInput', '_bioDirty', '_bioPositivoEstricto', 'BIO_QPCR_PATS'];
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
    // `_bioGridDirty` es un `let` de módulo: hace falta un lector, o no se puede
    // comprobar que el repintado NO se lleve por delante el aviso de «sin guardar».
    + '\ntry{ H.getDirty=function(){return _bioGridDirty;}; }catch(_){}'
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}'
    + '\ntry{ H.setTab=function(t){curTab=t;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  H.setMod(12);
  H.setTab('biomol');
});

const fp = () => document.getElementById('fp-biomol');
const celda = (fila, k) => fp().querySelector(`[name="bg_${fila}_${k}"]`);
const cabeceras = () => [...fp().querySelectorAll('thead th')].map((t) => t.textContent.trim());

/** Teclea en una celda y ejecuta SU asa `oninput`, que es la que dispara al escribir.
 *  happy-dom no corre los handlers inline, así que se ejecuta el atributo tal cual,
 *  con `this` apuntando al elemento — igual que haría el navegador. */
function teclear(fila, k, valor) {
  const c = celda(fila, k);
  expect(c, `no existe la celda bg_${fila}_${k}`).toBeTruthy();
  c.value = valor;
  const attr = c.getAttribute('oninput');
  expect(attr, `la celda de resultado ${k} no tiene asa oninput`).toBeTruthy();
  new Function('bioPatCambio', 'bioPatInput', '_bioDirty', attr)
    .call(c, H.bioPatCambio, H.bioPatInput, H._bioDirty);
}

describe('Biomol · las columnas de qPCR salen mientras se escribe', () => {
  it('SÍNTOMA 1 · marcar Positivo en IHHNV saca sus columnas SIN salir del campo', () => {
    localStorage.clear();
    H.renderBiomol();
    expect(cabeceras(), 'de partida no debería haber columnas de qPCR').not.toContain('Ct IHHNV');

    teclear(1, 'ihhnv', 'Positivo');

    expect(cabeceras(), 'las columnas de IHHNV deberían salir al teclear').toContain('Ct IHHNV');
    expect(cabeceras()).toContain('Copias IHHNV');
    // Y sólo las suyas: abrir de más sería el defecto contrario.
    expect(cabeceras()).not.toContain('Ct WSSV');
    expect(cabeceras()).not.toContain('Ct AHPND');
  });

  it('SÍNTOMA 2 · la SEGUNDA fila positiva abre SUS celdas, con la columna ya abierta', () => {
    localStorage.clear();
    H.renderBiomol();

    teclear(1, 'wssv', 'Positivo');
    expect(celda(1, 'ciclo_wssv').disabled, 'la 1.ª fila debería abrirse').toBe(false);

    // Aquí es donde el analista se quedaba encallado: la columna YA existe por la
    // fila 1, así que nada cambiaba en la cabecera y la fila 2 seguía bloqueada.
    teclear(2, 'wssv', 'Positivo');
    expect(celda(2, 'ciclo_wssv').disabled, 'la 2.ª fila sigue bloqueada').toBe(false);
    expect(celda(2, 'copias_wssv').disabled).toBe(false);

    // Y una fila que NO es positiva sigue bloqueada: abrirlas todas sería el defecto
    // contrario y la tabla dejaría de decir dónde toca escribir.
    expect(celda(3, 'ciclo_wssv').disabled, 'una fila sin positivo no debe abrirse').toBe(true);
  });

  it('la TERCERA y la CUARTA también: no es un caso especial de la segunda', () => {
    localStorage.clear();
    H.renderBiomol();
    teclear(1, 'ihhnv', 'Positivo');
    teclear(3, 'ihhnv', 'Positivo');
    teclear(4, 'ihhnv', 'positivo');       // en minúscula, a propósito

    expect(celda(3, 'ciclo_ihhnv').disabled).toBe(false);
    expect(celda(4, 'ciclo_ihhnv').disabled).toBe(false);
    expect(celda(2, 'ciclo_ihhnv').disabled, 'la 2 no se marcó: debe seguir bloqueada').toBe(true);
  });

  it('rectificar a Negativo vuelve a cerrar la celda, también al teclear', () => {
    localStorage.clear();
    H.renderBiomol();
    teclear(1, 'wssv', 'Positivo');
    expect(celda(1, 'ciclo_wssv').disabled).toBe(false);

    teclear(1, 'wssv', 'Negativo');
    // La columna puede seguir visible (otra fila podría necesitarla), pero ESTA celda
    // ya no se escribe. Si trajera dato NO se cerraría, y eso lo cubre `biomol-qpcr`.
    const c = celda(1, 'ciclo_wssv');
    if (c) expect(c.disabled, 'al rectificar a Negativo la celda debe cerrarse').toBe(true);
  });

  /* ⚠ El repintado recrea TODO el panel. Sin cuidarlo, el cursor salta fuera del campo
     justo al completar la palabra «positivo» — es decir, en mitad del tecleo. */
  it('el FOCO y el cursor se quedan donde estaban tras repintar', () => {
    localStorage.clear();
    H.renderBiomol();
    const antes = celda(2, 'ihhnv');
    antes.focus();
    antes.value = 'Positivo';
    try { antes.setSelectionRange(8, 8); } catch (_) { /* happy-dom */ }

    const attr = antes.getAttribute('oninput');
    new Function('bioPatCambio', 'bioPatInput', '_bioDirty', attr)
      .call(antes, H.bioPatCambio, H.bioPatInput, H._bioDirty);

    const despues = celda(2, 'ihhnv');
    expect(document.activeElement, 'el foco se fue del campo que se estaba escribiendo')
      .toBe(despues);
    expect(despues.value).toBe('Positivo');
  });

  /* `renderBiomol` termina con `_bioGridDirty = false` («lo pintado es lo persistido»).
     En un repintado por TECLEO eso es falso: hay trabajo escrito y sin guardar, y perder
     la marca deja al analista salir del módulo sin el aviso de cambios pendientes. */
  it('repintar al teclear NO borra el aviso de «cambios sin guardar»', () => {
    localStorage.clear();
    H.renderBiomol();
    expect(H.getDirty(), 'una grilla recién pintada está limpia').toBe(false);

    teclear(1, 'ahpnd', 'Positivo');

    expect(H.getDirty(), 'se perdió la marca de sin guardar: el analista puede salir y perderlo').toBe(true);
  });

  it('lo tecleado sobrevive al repintado (no se pierde al abrir las columnas)', () => {
    localStorage.clear();
    H.renderBiomol();
    celda(1, 'codigo').value = 'M-001';
    celda(1, 'corrida').value = '590';
    teclear(1, 'ihhnv', 'Positivo');

    expect(celda(1, 'codigo').value, 'el repintado se llevó lo ya tecleado').toBe('M-001');
    expect(celda(1, 'corrida').value).toBe('590');
    expect(celda(1, 'ihhnv').value).toBe('Positivo');
  });

  /* El asa `onchange` NO se retira: cubre lo que `input` no ve (autocompletado del
     navegador y algún pegado), y es el respaldo si el gate de `oninput` se afinara. */
  it('el asa onchange sigue estando en las tres celdas de resultado con qPCR', () => {
    localStorage.clear();
    H.renderBiomol();
    H.BIO_QPCR_PATS.forEach((p) => {
      const c = celda(1, p);
      expect(c, `falta la celda de resultado de ${p}`).toBeTruthy();
      expect(c.getAttribute('onchange'), `${p} perdió su asa onchange`).toBeTruthy();
      expect(c.getAttribute('oninput'), `${p} perdió su asa oninput`).toBeTruthy();
    });
  });
});
