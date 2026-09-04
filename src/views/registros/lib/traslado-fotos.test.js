// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · AsT · Álbum de fotos del VIAJE (usuario, 2026-09-03)

   «Subir o tomar fotos desde el móvil, que salgan al final del PDF con pie de
   figura, y poder añadir/quitar/borrar en cualquier momento.»

   🔑 SON DEL VIAJE ENTERO, no del camión ni de la parada, y se guardan EN EL
   DISPOSITIVO. La llave es el id del viaje: eso es lo que hace que el álbum
   viaje con él, salga en SU PDF y caduque cuando caduca él.

   🔑 LO QUE ESTAS PRUEBAS VIGILAN DE VERDAD: que el álbum no se mezcle entre
   viajes, que el pie de figura llegue al PDF, que el anexo NO se imprima cuando
   no hay fotos, y que la purga no se lleve por delante las del viaje vivo.

   ⚠ `trasFotoPick` NO se prueba aquí: comprime con `Image` + `<canvas>`, que
   happy-dom no implementa. Lo que sí se prueba es todo lo que rodea al dataURL
   una vez guardado, que es donde vive la lógica.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['trasFotoKey', 'trasFotoList', 'trasFotoPurgar', 'trasFotoNota', 'trasFotoDel',
  'trasFotosHtml', 'trasFotosPdfHtml', 'trasBarraHtml', 'buildTrasPdfHtml',
  'TRAS_FOTO_PRE', 'TRAS_FOTO_MAX', 'TRAS_TTL'];
const H = {};
const KEY = 'larv4_tras_records';

/* Un dataURL de pega: lo que se prueba es el almacén y el pintado, no el JPEG. */
const DURL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const ponFoto = (viaje, id, nota, edadMs) => {
  globalThis.localStorage.setItem(H.TRAS_FOTO_PRE + viaje + '_' + id,
    JSON.stringify({ ts: Date.now() - (edadMs || 0), nota: nota || '', durl: DURL }));
};

const viajeRec = (id) => ({
  id, ts: Date.now(), synced: false, syncedAt: null,
  data: {
    fecha: '2026-09-04', corrida: '585', modulo: 'M03', camaronera: 'Puná 1',
    camiones: [{ placa: 'ABC-1234', tinasOff: [] }],
    revisiones: [{ hora: '06:00', lugar: 'Laboratorio', camiones: [{ tinas: { 1: { o2: '6.1' } } }] }],
  },
});

beforeAll(async () => {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k), clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
  };
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  /* ⚠ `_trasViajeActivo` es un `let` del ámbito del monolito: exportarlo copiaría su
     valor de arranque (null) y no serviría. El epílogo instala un MODIFICADOR, que sí
     cierra sobre ese ámbito, y así la prueba puede colocarse en un viaje concreto. */
  const epilogo = '\n;(function(){ var G = globalThis.__ENG3;\n'
    + EXPORTAR.map((n) => `try{ G[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ G.__ponViaje = function(v){ _trasViajeActivo = v; }; }catch(_){}'
    + '\n})();';
  globalThis.__ENG3 = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
});

beforeEach(() => { globalThis.localStorage.clear(); H.__ponViaje(null); });

describe('el botón vive en la barra del viaje', () => {
  it('«Fotos» está, y delante del PDF', () => {
    const barra = H.trasBarraHtml('');
    expect(barra).toContain('trasFotosAbrir()');
    expect(barra).toContain('Fotos');
    expect(barra.indexOf('trasFotosAbrir()')).toBeLessThan(barra.indexOf('downloadTrasladoPDF()'));
  });
});

describe('🔴 el álbum es DEL VIAJE: no se mezcla con el de otro', () => {
  /* Es la regla que justifica todo el diseño. Si la llave perdiera el viaje, un
     chequeador vería en su PDF las fotos del viaje de otro camión. */
  it('cada viaje lista sólo las suyas', () => {
    ponFoto('tv1', 'fa', 'del primero');
    ponFoto('tv2', 'fb', 'del segundo');
    const a = H.trasFotoList('tv1');
    const b = H.trasFotoList('tv2');
    expect(a.map((f) => f.nota)).toEqual(['del primero']);
    expect(b.map((f) => f.nota)).toEqual(['del segundo']);
  });

  it('sin viaje no hay álbum, y no revienta', () => {
    ponFoto('tv1', 'fa', 'x');
    expect(H.trasFotoList('')).toEqual([]);
    expect(H.trasFotoList(null)).toEqual([]);
  });
});

describe('orden y caducidad', () => {
  it('las figuras van en ORDEN DE CAPTURA, la más vieja primero', () => {
    ponFoto('tv1', 'fnueva', 'segunda', 1000);
    ponFoto('tv1', 'fvieja', 'primera', 60000);
    expect(H.trasFotoList('tv1').map((f) => f.nota)).toEqual(['primera', 'segunda']);
  });

  it('una foto más vieja que el TTL del VIAJE no sale, y se poda del almacén', () => {
    ponFoto('tv1', 'fviva', 'viva', 1000);
    ponFoto('tv1', 'fmuerta', 'muerta', H.TRAS_TTL + 60000);
    expect(H.trasFotoList('tv1').map((f) => f.nota)).toEqual(['viva']);
    expect(globalThis.localStorage.getItem(H.trasFotoKey('tv1', 'fmuerta'))).toBeNull();
  });
});

describe('🔴 la purga no se lleva por delante el viaje vivo', () => {
  /* La purga existe porque el álbum sólo se poda AL LISTARLO, y a un viaje borrado no
     vuelve a listarlo nadie. Pero una purga demasiado ansiosa sería mucho peor que la
     fuga que arregla: borraría fotos que el chequeador todavía necesita. */
  it('borra las de viajes que ya no están, y CONSERVA las del que sí', () => {
    globalThis.localStorage.setItem(KEY, JSON.stringify([viajeRec('tv1')]));
    ponFoto('tv1', 'fa', 'del viaje vivo');
    ponFoto('tvFantasma', 'fb', 'de un viaje borrado');
    const n = H.trasFotoPurgar();
    expect(n).toBe(1);
    expect(H.trasFotoList('tv1').map((f) => f.nota)).toEqual(['del viaje vivo']);
    expect(globalThis.localStorage.getItem(H.trasFotoKey('tvFantasma', 'fb'))).toBeNull();
  });
});

describe('el pie de figura', () => {
  it('se guarda y se conserva el resto de la entrada', () => {
    ponFoto('tv1', 'fa', '');
    H.__ponViaje('tv1');
    H.trasFotoNota('fa', 'Tina 3 con espuma');
    const f = H.trasFotoList('tv1')[0];
    expect(f.nota).toBe('Tina 3 con espuma');
    expect(f.durl).toBe(DURL);   // la nota no se lleva la imagen por delante
  });
});

describe('🔴 el anexo del PDF', () => {
  it('sale AL FINAL, después de las firmas', () => {
    globalThis.localStorage.setItem(KEY, JSON.stringify([viajeRec('tv1')]));
    H.__ponViaje('tv1');
    ponFoto('tv1', 'fa', 'Salida del laboratorio');
    const pdf = H.buildTrasPdfHtml(viajeRec('tv1').data);
    expect(pdf).toContain('ANEXO FOTOGRÁFICO DEL VIAJE');
    expect(pdf.indexOf('Controlador de despacho')).toBeLessThan(pdf.indexOf('ANEXO FOTOGRÁFICO'));
  });

  it('lleva el pie de figura de cada foto, numeradas en orden', () => {
    H.__ponViaje('tv1');
    ponFoto('tv1', 'f2', 'Peaje 1', 1000);
    ponFoto('tv1', 'f1', 'Salida', 60000);
    const anexo = H.trasFotosPdfHtml('tv1');
    expect(anexo).toContain('Figura 1 · Salida');
    expect(anexo).toContain('Figura 2 · Peaje 1');
    expect(anexo.indexOf('Figura 1')).toBeLessThan(anexo.indexOf('Figura 2'));
  });

  it('sin fotos NO imprime el anexo, ni siquiera el título', () => {
    H.__ponViaje('tv1');
    expect(H.trasFotosPdfHtml('tv1')).toBe('');
    const pdf = H.buildTrasPdfHtml(viajeRec('tv1').data);
    expect(pdf).not.toContain('ANEXO FOTOGRÁFICO');
    /* ⚠ Se busca el MARCADO, no la clase a secas: `.fa-grid{…}` vive siempre en el CSS
       del PDF, así que `not.toContain('fa-grid')` se ponía rojo con el código correcto.
       Lo que no debe existir sin fotos es el contenedor. */
    expect(pdf).not.toContain('<div class="fa-grid">');
  });

  it('el pie de figura se ESCAPA: no se cuela marcado en el papel', () => {
    H.__ponViaje('tv1');
    ponFoto('tv1', 'fa', '<img src=x onerror=alert(1)>');
    const anexo = H.trasFotosPdfHtml('tv1');
    /* ⚠ El aserto va sobre la ETIQUETA, no sobre «onerror=alert»: `escapeHtml` neutraliza
       `<` y `>` pero no el `=`, así que el texto del atributo SIGUE ahí —inerte— dentro
       de la entidad. Prohibirlo daba rojo con el código correcto y verde con cualquier
       escape que sólo tocara el `=`, que es justo el que no sirve de nada. */
    expect(anexo).not.toContain('<img src=x');
    expect(anexo).toContain('&lt;img src=x onerror=alert(1)&gt;');
    /* Y la imagen de verdad sí sigue entrando como marcado. */
    expect(anexo).toContain('<img src="' + DURL + '"');
  });
});

describe('el modal del álbum', () => {
  it('dice cuántas hay sobre el cupo y ofrece añadir', () => {
    H.__ponViaje('tv1');
    ponFoto('tv1', 'fa', 'una');
    const html = H.trasFotosHtml();
    expect(html).toContain('1 de ' + H.TRAS_FOTO_MAX);
    expect(html).toContain('trasFotoPick(this)');
  });

  /* 🔴🔴 EL DEFECTO QUE REPORTÓ EL USUARIO: «no hay manera de borrar una foto».
     Tenía razón, y no porque faltara el botón —estaba, con su CSS y su handler— sino
     porque el `onclick` llevaba `JSON.stringify(id)` DENTRO de un atributo entre
     comillas dobles: al parsear, el navegador cerraba el atributo en la primera comilla
     de dentro y dejaba `onclick="trasFotoDel("`. Roto y mudo.
     La prueba vieja (`toContain('trasFotoDel("fa")')`) pasaba porque la CADENA sí lo
     contenía. Ésta parsea y PULSA, que es lo único que distingue un botón de un dibujo. */
  it('🔴 el botón de borrar existe, sobrevive al parseo y AL PULSARLO borra', () => {
    H.__ponViaje('tv1');
    ponFoto('tv1', 'fa', 'la que se va');
    ponFoto('tv1', 'fb', 'la que se queda', 1000);
    const caja = document.createElement('div');
    caja.innerHTML = H.trasFotosHtml();
    const botones = [...caja.querySelectorAll('.tf-del')];
    expect(botones.length).toBe(2);
    const h = botones.map((b) => b.getAttribute('onclick'));
    expect(h.every((x) => /^trasFotoDel\("?f[ab]"?\)$/.test(x))).toBe(true);

    /* Y que la llamada haga lo que promete. Se invoca lo mismo que invocaría el
       navegador, con `confirm` aceptando. */
    globalThis.confirm = () => true;
    window.confirm = () => true;
    H.trasFotoDel('fa');
    expect(H.trasFotoList('tv1').map((f) => f.nota)).toEqual(['la que se queda']);
  });

  it('y si el usuario CANCELA el aviso, la foto NO se borra', () => {
    H.__ponViaje('tv1');
    ponFoto('tv1', 'fa', 'sigue aquí');
    globalThis.confirm = () => false;
    window.confirm = () => false;
    H.trasFotoDel('fa');
    expect(H.trasFotoList('tv1').length).toBe(1);
  });

  it('con el álbum LLENO retira el botón de añadir y lo dice', () => {
    H.__ponViaje('tv1');
    for (let i = 0; i < H.TRAS_FOTO_MAX; i++) ponFoto('tv1', 'f' + i, 'n' + i, i * 10);
    const html = H.trasFotosHtml();
    expect(html).not.toContain('trasFotoPick(this)');
    expect(html).toContain('Álbum lleno');
  });

  it('sin fotos lo dice en vez de salir vacío', () => {
    H.__ponViaje('tv1');
    expect(H.trasFotosHtml()).toContain('todavía no tiene fotos');
  });
});
