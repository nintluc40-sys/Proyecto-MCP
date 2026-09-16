// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES · los pesos BAJAN por su columna (usuario, 2026-09-15)

   PEDIDO: «en Peso ♂ (g) y Peso ♀ (g), que tengan un desplace vertical: si lleno la primera
   casilla, el mismo valor se pasa a todas las filas que lo componen mientras tengan animales
   vivos; sin embargo, si deseo modificar un número de alguna de esas filas lo puedo hacer».

   Las tres reglas que esto vigila, y que son las tres que se pueden perder en silencio:
     1 · baja hacia ABAJO y sólo por SU columna (bajar ♂ no puede tocar ♀);
     2 · se salta las filas SIN animales vivos — un tanque vacío no tiene peso que anotar, y
         escribírselo ensuciaría la hoja con una cifra que nadie midió;
     3 · se salta las filas que el usuario ya corrigió a mano, que es lo que hace cierta la
         segunda mitad del pedido. Sin eso, retocar el de arriba borraría las correcciones.

   🔑 Los fixtures dan a cada tanque un número de vivos DISTINTO y dejan uno a CERO: con todos
   iguales, «baja a los que tienen vivos» y «baja a todos» darían el mismo resultado y el verde
   no probaría nada.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'madTanquesSalaChange', '_madTanquesPintaVivos',
  'madTqPesoBaja', '_madTqFilaConVivos', 'MAD_TQ_VIVOS_KEY', 'MAD_TANQUES_POR_SALA', 'today'];
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
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

/* Sala 5 = tanques 7, 8, 9, 10 y 11. El 9 se deja SIN animales y los demás con cifras
   distintas: es lo que permite distinguir «baja a los que tienen vivos» de «baja a todos». */
const SALA = 'Sala 5';
const libro = () => ({
  posiciones: [], lotes: {}, avisos: [], hasta: '2026-09-15', fallos: [], recortadas: [],
  tanques: {
    'Sala 5|7': { sala: SALA, tanque: 7, machos: 10, hembras: 20, composicion: [] },
    'Sala 5|8': { sala: SALA, tanque: 8, machos: 3, hembras: 4, composicion: [] },
    'Sala 5|9': { sala: SALA, tanque: 9, machos: 0, hembras: 0, composicion: [] },
    'Sala 5|10': { sala: SALA, tanque: 10, machos: 1, hembras: 2, composicion: [] },
    'Sala 5|11': { sala: SALA, tanque: 11, machos: 6, hembras: 6, composicion: [] },
  },
});

const abrir = () => {
  H.renderMadTanques();
  document.getElementById('mad-tanques-sala').value = SALA;
  H.madTanquesSalaChange();
};
const cel = (tq, k) => document.querySelector('[name="tg_' + tq + '_' + k + '"]');
/** Teclear de verdad: poner el valor y disparar el asa, como hace el navegador. */
const teclear = (tq, k, v) => { const e = cel(tq, k); e.value = v; H.madTqPesoBaja(e); };
const columna = (k) => H.MAD_TANQUES_POR_SALA[SALA].map((t) => cel(t, k).value);

beforeEach(() => {
  localStorage.removeItem(H.MAD_TQ_VIVOS_KEY);
  abrir();
  H._madTanquesPintaVivos(libro());
});

describe('Tanques · el peso baja por su columna', () => {
  it('el fixture ejerce algo: cinco tanques, uno de ellos SIN animales vivos', () => {
    expect(H.MAD_TANQUES_POR_SALA[SALA]).toEqual([7, 8, 9, 10, 11]);
    expect(H._madTqFilaConVivos(cel(7, 'peso_machos'))).toBe(true);
    expect(H._madTqFilaConVivos(cel(9, 'peso_machos')), 'el 9 debería estar vacío').toBe(false);
    expect(columna('peso_machos'), 'la columna debería partir en blanco').toEqual(['', '', '', '', '']);
  });

  it('🔴 el asa la llevan LAS DOS columnas de peso, y ninguna otra', () => {
    /* Los casos de abajo llaman a `madTqPesoBaja` directamente, así que no verían que a una
       columna se le cayera el asa: quedaría muerta en pantalla y verde aquí. Esto lo cierra. */
    expect(cel(7, 'peso_machos').getAttribute('oninput')).toBe('madTqPesoBaja(this)');
    expect(cel(7, 'peso_hembras').getAttribute('oninput')).toBe('madTqPesoBaja(this)');
    expect(cel(7, 'copulas').getAttribute('oninput'), 'una columna de conteo no baja').toBeNull();
    expect(cel(7, 'muda').getAttribute('oninput')).toBeNull();
    /* ⚠ 2026-09-15 · las observaciones ya NO son un input con `name`: son multiselección y
       bajan por su propia vía (`madTqObsBaja`, ver mad-tanques-observaciones). Pedirlas aquí
       con `cel()` devolvía null y el caso reventaba en vez de decir lo que quería decir. */
    expect(cel(7, 'obs_sanitarias'), 'las observaciones dejaron de ser un input suelto').toBeNull();
  });

  it('🔴 teclear el primero lo pasa a los de abajo CON vivos, y salta el vacío', () => {
    teclear(7, 'peso_machos', '54');
    expect(columna('peso_machos')).toEqual(['54', '54', '', '54', '54']);
  });

  it('🔴 baja sólo por SU columna: ♂ no toca ♀', () => {
    teclear(7, 'peso_machos', '54');
    expect(columna('peso_hembras')).toEqual(['', '', '', '', '']);
    teclear(7, 'peso_hembras', '68');
    expect(columna('peso_hembras')).toEqual(['68', '68', '', '68', '68']);
    expect(columna('peso_machos'), '♀ se llevó por delante ♂').toEqual(['54', '54', '', '54', '54']);
  });

  it('🔴 baja hacia ABAJO: teclear en medio no reescribe lo de arriba', () => {
    teclear(7, 'peso_machos', '54');
    teclear(10, 'peso_machos', '61');
    expect(columna('peso_machos')).toEqual(['54', '54', '', '61', '61']);
  });

  it('🔴 una fila corregida a mano NO se pisa al retocar la de arriba', () => {
    // Es la segunda mitad del pedido: «si deseo modificar un número de alguna de esas filas
    // lo puedo hacer» tiene que seguir siendo cierto DESPUÉS de corregir el de arriba.
    teclear(7, 'peso_machos', '54');
    teclear(11, 'peso_machos', '70');      // corrección a mano del último
    teclear(7, 'peso_machos', '55');       // se retoca el de arriba
    expect(columna('peso_machos')).toEqual(['55', '55', '', '55', '70']);
  });

  it('borrar el de arriba también baja: se vacían los que no se tocaron', () => {
    teclear(7, 'peso_machos', '54');
    teclear(7, 'peso_machos', '');
    expect(columna('peso_machos')).toEqual(['', '', '', '', '']);
  });

  it('teclear el ÚLTIMO no toca a nadie y no revienta', () => {
    teclear(11, 'peso_machos', '70');
    expect(columna('peso_machos')).toEqual(['', '', '', '', '70']);
  });

  it('un repintado de la grilla olvida las marcas de mano: cada día se empieza limpio', () => {
    teclear(7, 'peso_machos', '54');
    teclear(11, 'peso_machos', '70');
    abrir();
    H._madTanquesPintaVivos(libro());
    expect(cel(11, 'peso_machos').getAttribute('data-fijo')).toBeNull();
  });
});

describe('Tanques · sin saber los vivos, la bajada no se queda sin efecto', () => {
  it('🔴 sin referencia ni lectura, baja a TODAS: filtrar dejaría la función muerta', () => {
    // Sin «🔄 Ver vivos» y sin referencia guardada, ninguna fila sabe sus vivos. Filtrar por
    // ellos no bajaría nada y parecería roto; sobrar un número se ve y se borra, faltar no.
    localStorage.removeItem(H.MAD_TQ_VIVOS_KEY);
    abrir();
    expect(H._madTqFilaConVivos(cel(7, 'peso_machos')), 'control: no se sabe nada').toBe(false);
    teclear(7, 'peso_machos', '54');
    expect(columna('peso_machos')).toEqual(['54', '54', '54', '54', '54']);
  });

  it('🔴 un tanque que el libro NO CONOCE declara «no se sabe», no cero', () => {
    /* No es cosmético: `data-vivos` es el dato del que cuelga toda la bajada, y escribir «0»
       donde no se sabe nada haría que la celda mintiera sobre un hecho. Hoy las dos cadenas
       dan el mismo resultado; el día que alguien distinga «vacío» de «0» —para avisar, para
       pintar— heredaría la mentira sin que nada se pusiera rojo. */
    const l = libro();
    delete l.tanques['Sala 5|9'];
    H._madTanquesPintaVivos(l);
    expect(document.querySelector('.tq-vivos[data-tq="9"]').getAttribute('data-vivos')).toBe('');
    expect(document.querySelector('.tq-vivos[data-tq="7"]').getAttribute('data-vivos')).toBe('30');
  });

  it('«no se sabe» NO es «cero»: la celda declara vacío, no 0', () => {
    localStorage.removeItem(H.MAD_TQ_VIVOS_KEY);
    abrir();
    expect(document.querySelector('.tq-vivos[data-tq="7"]').getAttribute('data-vivos')).toBe('');
    H._madTanquesPintaVivos(libro());
    expect(document.querySelector('.tq-vivos[data-tq="7"]').getAttribute('data-vivos')).toBe('30');
    expect(document.querySelector('.tq-vivos[data-tq="9"]').getAttribute('data-vivos')).toBe('0');
  });
});
