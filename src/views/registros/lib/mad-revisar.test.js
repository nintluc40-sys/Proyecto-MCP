// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · EL BOTÓN «🔍 Revisar» DE LAS CUATRO FICHAS (auditado el 2026-09-14 a pedido del usuario)

   PARA QUÉ ES: comprobar lo tecleado SIN ENVIAR NADA y adelantar lo que hará «☁️ Guardar y
   sincronizar» — los errores que lo impiden, los avisos que dejan guardar y cuántas filas se
   escribirán en qué hoja.

   La auditoría encontró que no cumplía del todo ese papel:
   1) con todo bien sólo decía «Se escribirán N fila(s)» en gris, sin decir que estaba bien;
   2) en Ingreso y Desoves, con el GAS publicado VIEJO, prometía filas que Guardar se niega a
      enviar (la protección `_madIngGasAlDia`) — y el GAS vivo ERA el viejo ese mismo día;
   3) el veredicto se quedaba en pantalla aunque se cambiara lo tecleado;
   4) el botón no decía para qué servía.
   Cada prueba de abajo fija una de esas correcciones, y que Revisar NUNCA envía.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madIngReiniciar', 'madIngRevisar', '_madIngRepHTML', 'madMovReiniciar', 'madMovRevisar',
  'madMovSalaChange', 'madDesReiniciar', 'madDesRevisar', 'madFinReiniciar', 'madFinRevisar', 'MAD_REVISAR_TITLE',
  'madFinGuardar', 'madFinTipoChange', 'madFinAddCard', 'madIngRefrescar', 'buildMadMovPayload', 'madMovCollect',
  '_gasVersionLocal'];   // 2026-09-16 · el portón compara el SELLO: el fixture usa el de esta app
const H = {};
const envios = [];
let respuestaVer = null;
let preguntasVer = 0;
let soltarVer = null;   // si se fija, la respuesta de ?p=ver espera a que la prueba la suelte

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
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    // D13: un libro «leído» sin red, con las filas dadas (null lo olvida).
    + '\ntry{ H.setLibro=function(f){ if(!f){ _madLibro=null; return; }'
    + ' ["ingreso","movimientos","tanques","cierres"].forEach(function(k){ _reproPutRows(MAD_LIBRO_SHEETS[k], f[k==="ingreso"?"ingresos":k]||[]); });'
    + ' _madLibro=madConstruirLibro(madLibroFuentes(), { hoy: today() }); _madLibro.fallos=[]; _madLibro.recortadas=[]; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  H.setPost(async (p) => { envios.push(p); return true; });
  H.setPostOnce(async (b) => { envios.push(b); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    preguntasVer++;
    if (soltarVer) await soltarVer.promesa;
    if (respuestaVer === 'red') throw new Error('sin red');
    const cuerpo = typeof respuestaVer === 'string' ? respuestaVer : JSON.stringify(respuestaVer);
    return { ok: true, status: 200, text: async () => cuerpo };
  };
});

const $ = (fp, s) => document.querySelector('#' + fp + ' ' + s);
const pon = (el, v) => { el.value = v; return el; };

const FICHAS = [
  { nombre: 'Ingreso', fp: 'fp-ingreso', rep: 'mi-report', pideGas: true, reiniciar: 'madIngReiniciar', revisar: 'madIngRevisar',
    llenar: () => {
      pon(document.getElementById('mi-lote'), 'BP');
      pon($('fp-ingreso', '.mi-cg'), 'OLF5.F2');
      pon($('fp-ingreso', '.mi-tmachos'), '10');
      pon($('fp-ingreso', '.mi-thembras'), '10');
      // happy-dom descarta un <tr> insertado sobre un <tbody>: se parsea la fila REAL dentro de una tabla.
      const t = document.createElement('table');
      t.innerHTML = '<tbody>' + H._madIngRepHTML('Sala 4', 1) + '</tbody>';
      $('fp-ingreso', '.mi-reps').appendChild(t.querySelector('tr'));
      pon($('fp-ingreso', 'tr.mi-rep .mi-machos'), '10');
      pon($('fp-ingreso', 'tr.mi-rep .mi-hembras'), '10');
    },
    campo: () => document.getElementById('mi-lote') },
  { nombre: 'Movimientos', fp: 'fp-movimientos', rep: 'mv-report', pideGas: false, reiniciar: 'madMovReiniciar', revisar: 'madMovRevisar',
    llenar: () => {
      const f = $('fp-movimientos', '#mv-tramos tr.mv-tramo');
      H.madMovSalaChange(pon(f.querySelector('.mv-so'), 'Sala 1')); pon(f.querySelector('.mv-to'), '1');
      H.madMovSalaChange(pon(f.querySelector('.mv-sd'), 'Sala 2')); pon(f.querySelector('.mv-td'), '16');
      pon(f.querySelector('.mv-machos'), '5'); pon(f.querySelector('.mv-hembras'), '5');
    },
    campo: () => $('fp-movimientos', '.mv-machos') },
  { nombre: 'Desoves', fp: 'fp-desoves', rep: 'md-report', pideGas: true, reiniciar: 'madDesReiniciar', revisar: 'madDesRevisar',
    llenar: () => {
      pon($('fp-desoves', '.md-lote'), 'BP'); pon($('fp-desoves', '.md-cg'), 'OLF5.F2'); pon($('fp-desoves', '.md-desoves'), '64');
    },
    campo: () => $('fp-desoves', '.md-desoves') },
  /* D14 (2026-09-14): Fin de Ciclo estrena Sala y pesos, así que tampoco se entrega a un GAS viejo. */
  { nombre: 'Fin de Ciclo', fp: 'fp-fin', rep: 'mf-report', pideGas: true, reiniciar: 'madFinReiniciar', revisar: 'madFinRevisar',
    llenar: () => {
      pon($('fp-fin', '.mf-lote'), 'BP'); pon($('fp-fin', '.mf-tipo'), 'Parcial'); pon($('fp-fin', '.mf-motivo'), 'Pedido');
      pon($('fp-fin', '.mf-machos'), '5'); pon($('fp-fin', '.mf-hembras'), '5');
    },
    campo: () => $('fp-fin', '.mf-machos') },
];

beforeEach(() => {
  envios.length = 0;
  preguntasVer = 0;
  soltarVer = null;
  respuestaVer = { ok: true, version: H._gasVersionLocal() };   // el GAS desplegado ES el de esta app
});

describe.each(FICHAS)('«🔍 Revisar» · $nombre', (F) => {
  const rep = () => document.getElementById(F.rep);
  beforeEach(() => { H[F.reiniciar](); });

  it('🔴 el botón dice para qué sirve (title) y el texto lo explica: sin enviar nada', () => {
    const btn = Array.from(document.querySelectorAll('#' + F.fp + ' button')).find((b) => b.textContent.includes('Revisar'));
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('title')).toBe(H.MAD_REVISAR_TITLE);
    expect(H.MAD_REVISAR_TITLE).toMatch(/sin enviar nada/);
  });

  it('🔴 con todo bien lo DICE (✅) y cuenta las filas, y NO envía nada', async () => {
    F.llenar();
    await H[F.revisar]();
    expect(rep().textContent).toMatch(/✅ Sin errores/);
    expect(rep().textContent).toMatch(/1 fila\(s\)/);
    expect(envios).toHaveLength(0);
  });

  it('con errores dice que no se puede guardar, no promete filas y no pregunta al GAS', async () => {
    await H[F.revisar]();
    expect(rep().textContent).toContain('No se puede guardar');
    expect(rep().textContent).not.toContain('✅');
    expect(preguntasVer).toBe(0);
    expect(envios).toHaveLength(0);
  });

  it('🔴 si se cambia el formulario después de revisar, el veredicto se marca DESACTUALIZADO', async () => {
    F.llenar();
    await H[F.revisar]();
    F.campo().dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(rep().textContent).toContain('Cambiaste el formulario');
    await H[F.revisar]();
    expect(rep().textContent).not.toContain('Cambiaste el formulario');
  });

  it('sin revisar todavía (informe vacío), teclear NO saca el aviso de desactualizado', async () => {
    await H[F.revisar]();       // engancha la vigilancia de la ficha…
    H[F.reiniciar]();           // …y Vaciar deja el informe en blanco: la vigilancia sigue viva
    F.campo().dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(rep().innerHTML).toBe('');
  });

  it('el aviso de desactualizado sale UNA vez por muchos cambios que se hagan', async () => {
    F.llenar();
    await H[F.revisar]();
    for (let i = 0; i < 3; i++) F.campo().dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(rep().querySelectorAll('.mad-rev-caduco')).toHaveLength(1);
  });

  if (F.pideGas) {
    it('🔴 con el GAS VIEJO avisa de que Guardar NO lo enviará (no promete lo que no pasará)', async () => {
      F.llenar();
      respuestaVer = 'FichasLarv-OK';
      await H[F.revisar]();
      expect(rep().textContent).toMatch(/NO se enviará/);
      expect(envios).toHaveLength(0);
    });

    it('sin respuesta del GAS (sin señal) no se inventa el aviso: Guardar lo dejará en la cola hasta confirmar el GAS', async () => {
      F.llenar();
      respuestaVer = 'red';
      await H[F.revisar]();
      expect(rep().textContent).toMatch(/✅ Sin errores/);
      expect(rep().textContent).not.toMatch(/NO se enviará/);
    });

    it('con el GAS nuevo no hay aviso de GAS, y se pregunta una sola vez', async () => {
      F.llenar();
      await H[F.revisar]();
      expect(rep().textContent).not.toMatch(/NO se enviará/);
      expect(preguntasVer).toBe(1);
    });

    it('🔴 si el formulario cambia mientras responde el GAS, el aviso no se pega a un veredicto viejo', async () => {
      F.llenar();
      respuestaVer = 'FichasLarv-OK';
      let soltar;
      soltarVer = { promesa: new Promise((r) => { soltar = r; }) };
      const p = H[F.revisar]();
      F.campo().dispatchEvent(new window.Event('input', { bubbles: true }));
      soltar();
      await p;
      expect(rep().textContent).not.toMatch(/NO se enviará/);
    });
  } else {
    it('esta hoja no depende de la versión del GAS: Revisar no pregunta', async () => {
      F.llenar();
      respuestaVer = 'FichasLarv-OK';
      await H[F.revisar]();
      expect(preguntasVer).toBe(0);
      expect(rep().textContent).not.toMatch(/NO se enviará/);
    });
  }
});

/* D14 + pesos (2026-09-14): la sala de un Parcial y los pesos del REGISTRO llegan al envío. */
describe('Fin de Ciclo · la sala del Parcial y los pesos del registro, en el envío', () => {
  beforeEach(() => { H.madFinReiniciar(); });
  const cols = () => document.querySelectorAll('#fp-fin .mf-cierre');

  it('un Total deshabilita y vacía la sala; un Parcial la devuelve', () => {
    const c = cols()[0];
    pon(c.querySelector('.mf-sala'), 'Sala 2');
    H.madFinTipoChange(pon(c.querySelector('.mf-tipo'), 'Total'));
    expect(c.querySelector('.mf-sala').disabled).toBe(true);
    expect(c.querySelector('.mf-sala').value).toBe('');
    H.madFinTipoChange(pon(c.querySelector('.mf-tipo'), 'Parcial'));
    expect(c.querySelector('.mf-sala').disabled).toBe(false);
  });

  it('🔴 Guardar manda la sala, los rojos y los pesos promedio de CADA lote, y el MISMO peso total en cada fila', async () => {
    H.madFinAddCard();
    const [a, b] = cols();
    for (const c of [a, b]) pon(c.querySelector('.mf-tipo'), 'Parcial');   // happy-dom no respeta el `selected` de las opciones
    pon(a.querySelector('.mf-lote'), 'BP'); pon(a.querySelector('.mf-motivo'), 'Pedido'); pon(a.querySelector('.mf-sala'), 'Sala 2');
    pon(a.querySelector('.mf-machos'), '5'); pon(a.querySelector('.mf-rojos'), '1'); pon(a.querySelector('.mf-ppm'), '45.5');
    pon(b.querySelector('.mf-lote'), 'BQ'); pon(b.querySelector('.mf-motivo'), 'Pedido'); pon(b.querySelector('.mf-hembras'), '4'); pon(b.querySelector('.mf-pph'), '60');
    pon($('fp-fin', '#mf-ptotal'), '0.47');
    expect($('fp-fin', '#mf-ptm')).toBeNull();
    const reg = $('fp-fin', '#mf-registro').value;
    expect(reg).toMatch(/^R-[0-9A-Z]{8,}$/);
    await H.madFinGuardar();
    expect(envios).toHaveLength(1);
    const { headers, rows } = envios[0];
    const v = (f, h) => f[headers.indexOf(h)];
    expect(rows.map((f) => v(f, 'Sala'))).toEqual(['Sala 2', '']);
    expect(v(rows[0], 'ID')).toMatch(/-BP-PEDIDO-S2$/);
    expect(rows.map((f) => [v(f, 'Rojos'), v(f, 'Peso promedio machos (g)'), v(f, 'Peso promedio hembras (g)'), v(f, 'Peso total (kg)')]))
      .toEqual([[1, 45.5, '', 0.47], ['', '', 60, 0.47]]);
    // A3: el MISMO registro en todas las filas del envío, y uno NUEVO para el siguiente formulario.
    expect(rows.map((f) => v(f, 'Registro'))).toEqual([reg, reg]);
    expect($('fp-fin', '#mf-registro').value).toMatch(/^R-[0-9A-Z]{8,}$/);
    expect($('fp-fin', '#mf-registro').value).not.toBe(reg);
  });

  it('🔴 con el GAS VIEJO Guardar NO envía (la hoja cambió de columnas) y lo dice', async () => {
    const c = cols()[0];
    pon(c.querySelector('.mf-tipo'), 'Parcial');
    pon(c.querySelector('.mf-lote'), 'BP'); pon(c.querySelector('.mf-motivo'), 'Pedido'); pon(c.querySelector('.mf-machos'), '5');
    respuestaVer = 'FichasLarv-OK';
    await H.madFinGuardar();
    expect(envios).toHaveLength(0);
    expect(document.getElementById('mf-report').textContent).toContain('«Maduración Fin de Ciclo»');
  });

  /* PV3 (2026-09-16) · sin respuesta de ?p=ver no se sabe a qué GAS se escribiría: a la cola, sin salir. */
  it('🔴 PV3 · sin respuesta del GAS Guardar NO envía el cierre: queda en la cola sin salir', async () => {
    localStorage.removeItem('larv4_syncqueue');
    const c = cols()[0];
    pon(c.querySelector('.mf-tipo'), 'Parcial');
    pon(c.querySelector('.mf-lote'), 'BP'); pon(c.querySelector('.mf-motivo'), 'Pedido'); pon(c.querySelector('.mf-machos'), '5');
    respuestaVer = 'red';
    await H.madFinGuardar();
    expect(envios).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('larv4_syncqueue') || '[]').map((it) => it.payload.sheetName)).toEqual(['Maduración Fin de Ciclo']);
    localStorage.removeItem('larv4_syncqueue');
  });
});

/* D13 (2026-09-14): con el libro leído, Revisar avisa del tanque que compartirían dos lotes. */
describe('D13 · Ingreso y Movimientos avisan del tanque compartido con OTRO lote', () => {
  const ING = (Lote, Tanque, Machos) => ({ Fecha: '2026-01-01', Lote, 'Código genético': 'CG', Sala: 'Sala 1', Tanque, Machos, Hembras: 0 });
  beforeEach(() => {
    H.setLibro({ ingresos: [ING('AB', 1, 20), ING('BC', 2, 20)] });
    H.madIngReiniciar(); H.madMovReiniciar();
  });
  afterEach(() => { H.setLibro(null); });

  it('🔴 Ingreso: el tanque con otro lote sale en ámbar y Revisar lo avisa (se puede guardar igual)', async () => {
    pon(document.getElementById('mi-lote'), 'AB');
    pon($('fp-ingreso', '.mi-cg'), 'CG'); pon($('fp-ingreso', '.mi-tmachos'), '10'); pon($('fp-ingreso', '.mi-thembras'), '0');
    pon($('fp-ingreso', '.mi-sala'), 'Sala 1');
    H.madIngRefrescar();
    const boton = (t) => $('fp-ingreso', '.mi-tq[data-t="' + t + '"]');
    expect(boton(2).getAttribute('title')).toContain('⚠ Tiene vivo el lote BC');
    expect(boton(1).getAttribute('title')).not.toContain('⚠');   // el propio lote no avisa
    const t = document.createElement('table');
    t.innerHTML = '<tbody>' + H._madIngRepHTML('Sala 1', 2) + '</tbody>';
    $('fp-ingreso', '.mi-reps').appendChild(t.querySelector('tr'));
    pon($('fp-ingreso', 'tr.mi-rep .mi-machos'), '10'); pon($('fp-ingreso', 'tr.mi-rep .mi-hembras'), '0');
    await H.madIngRevisar();
    const rep = document.getElementById('mi-report').textContent;
    expect(rep).toContain('El tanque 2 de Sala 1 ya tiene animales vivos del lote BC: el lote AB lo compartiría.');
    expect(rep).toMatch(/✅ Sin errores/);
  });

  it('🔴 Movimientos: una Transferencia a un tanque con otro lote lo avisa; una Mezcla no', async () => {
    const f = $('fp-movimientos', '#mv-tramos tr.mv-tramo');
    H.madMovSalaChange(pon(f.querySelector('.mv-so'), 'Sala 1')); pon(f.querySelector('.mv-to'), '1');
    H.madMovSalaChange(pon(f.querySelector('.mv-sd'), 'Sala 1')); pon(f.querySelector('.mv-td'), '2');
    pon(f.querySelector('.mv-machos'), '5'); pon(f.querySelector('.mv-hembras'), '0');
    pon(document.getElementById('mv-tipo'), 'Transferencia');
    await H.madMovRevisar();
    expect(document.getElementById('mv-report').textContent).toContain('Tramo 1: el tanque 2 de Sala 1 ya tiene animales vivos del lote BC, que no está en el origen');
    pon(document.getElementById('mv-tipo'), 'Mezcla');
    await H.madMovRevisar();
    expect(document.getElementById('mv-report').textContent).not.toContain('Tramo 1: el tanque 2');
  });

  it('🔴 A1: un lote leído de la hoja con comillas NO inyecta atributos en la rejilla', () => {
    H.setLibro({ ingresos: [ING('AB', 1, 20), ING('X" onmouseover="alert(1)', 3, 20)] });
    pon(document.getElementById('mi-lote'), 'AB');
    pon($('fp-ingreso', '.mi-sala'), 'Sala 1');
    H.madIngRefrescar();
    const b = $('fp-ingreso', '.mi-tq[data-t="3"]');
    expect(b.hasAttribute('onmouseover')).toBe(false);
    expect(b.getAttribute('title')).toContain('⚠ Tiene vivo el lote X" onmouseover="alert(1)');
  });

  it('🔴 A2: corregir una Transferencia YA guardada que vació su origen no avisa en falso', async () => {
    const f = $('fp-movimientos', '#mv-tramos tr.mv-tramo');
    H.madMovSalaChange(pon(f.querySelector('.mv-so'), 'Sala 1')); pon(f.querySelector('.mv-to'), '1');
    H.madMovSalaChange(pon(f.querySelector('.mv-sd'), 'Sala 1')); pon(f.querySelector('.mv-td'), '4');
    pon(f.querySelector('.mv-machos'), '20'); pon(f.querySelector('.mv-hembras'), '0');
    pon(document.getElementById('mv-tipo'), 'Transferencia');
    // La misma transferencia, ya en la hoja: AB entero de T1 a T4 (vacío), con el ID que da este formulario.
    const { headers, rows } = H.buildMadMovPayload(H.madMovCollect());
    const guardada = rows.map((fila) => Object.fromEntries(headers.map((h, i) => [h, fila[i]])));
    H.setLibro({ ingresos: [ING('AB', 1, 20)], movimientos: guardada });
    await H.madMovRevisar();
    expect(document.getElementById('mv-report').textContent).not.toContain('ya tiene animales vivos');
  });

  it('sin libro leído no se inventa ningún aviso de tanque compartido', async () => {
    H.setLibro(null);
    const f = $('fp-movimientos', '#mv-tramos tr.mv-tramo');
    H.madMovSalaChange(pon(f.querySelector('.mv-so'), 'Sala 1')); pon(f.querySelector('.mv-to'), '1');
    H.madMovSalaChange(pon(f.querySelector('.mv-sd'), 'Sala 1')); pon(f.querySelector('.mv-td'), '2');
    pon(f.querySelector('.mv-machos'), '5');
    pon(document.getElementById('mv-tipo'), 'Transferencia');
    await H.madMovRevisar();
    expect(document.getElementById('mv-report').textContent).not.toContain('ya tiene animales vivos');
    // Y en Ingreso, que tiene su propio camino (la rejilla): las filas de la última lectura siguen en caché.
    pon(document.getElementById('mi-lote'), 'AB');
    pon($('fp-ingreso', '.mi-sala'), 'Sala 1');
    H.madIngRefrescar();
    expect($('fp-ingreso', '.mi-tq[data-t="2"]').getAttribute('title')).not.toContain('⚠');
  });
});
