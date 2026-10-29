// @vitest-environment happy-dom
/* ============================================================
   PLANTA · el selector «🏭 Maqueta | 📊 Análisis» conserva cada modo montado (2026-10-06, usuario)
   Lo que se exige: cada modo se monta UNA vez y el que se deja sólo se oculta (volver a la Maqueta no reconstruye la
   escena, que costaba 6,5 s en escritorio y 8,9 s en celular); volver repinta con el estado del momento; un modo dejado
   mientras cargaba no queda montado ni a la vista; y uno que falló se reintenta al volver a elegirlo, sin cajas
   repetidas. La escena (three.js) y Análisis se simulan: aquí sólo se prueba el orquestador (index.js).
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const vistaFalsa = (nombre) => ({ nombre, pintarEstado: vi.fn(), aviso: vi.fn(), alElegirMes: vi.fn() });
const montarPlanta = vi.fn((host) => { host.querySelector('.viewport').dataset.escena = '1'; return vistaFalsa('maqueta'); });
const montarAnalisis = vi.fn((host) => { host.innerHTML = '<div class="planta planta-an"></div>'; return vistaFalsa('analisis'); });
vi.mock('./escena.js', () => ({ montarPlanta: (...a) => montarPlanta(...a) }));
vi.mock('./analisis.js', () => ({ montarAnalisis: (...a) => montarAnalisis(...a) }));
// M3 (2026-10-27) · el tercer modo, el mapa de Broodstock
const montarBroodstock = vi.fn((host) => { host.innerHTML = '<div class="bs"></div>'; return vistaFalsa('broodstock'); });
vi.mock('./broodstock.js', () => ({ montarBroodstock: (...a) => montarBroodstock(...a) }));
vi.mock('../../core/refresh.js', () => ({ asegurarLibro: vi.fn() }));
// el cálculo de larvicultura, controlado desde la prueba: cada pedido queda esperando hasta que se le contesta
const calculos = [];
const estadoPlantaPorPartes = vi.fn(() => new Promise((contestar) => calculos.push(contestar)));
vi.mock('./estado.js', () => ({
  estadoPlantaPorPartes: (...a) => estadoPlantaPorPartes(...a),
  estadoMaduracion: () => ({ salas: {} }),
  cronogramaPlanta: () => ({ modulos: {} }),
  hoyLocal: () => '2026-10-06',
}));
// hallazgo 4 (ronda 11) · el mes de la foto que pide el mapa 🦐: null = sin meses (la foto es hoy), o el que fije la prueba
let mesDeLaFoto = null;
const mesYCierre = vi.fn(() => mesDeLaFoto);
vi.mock('./cifras.js', () => ({ cifrasGerencia: () => null, mesYCierre: (...a) => mesYCierre(...a) }));

const { plantaView } = await import('./index.js');
const { store, emit, EV } = await import('../../core/store.js');
const espera = () => new Promise((r) => setTimeout(r, 0));
let root;
const cajas = (modo) => [...root.querySelectorAll('.planta-cuerpo > [data-cuerpo="' + modo + '"]')];
const elegir = (modo) => root.querySelector('[data-modo="' + modo + '"]').click();

beforeEach(() => {
  montarPlanta.mockClear(); montarAnalisis.mockClear(); montarBroodstock.mockClear(); estadoPlantaPorPartes.mockClear(); calculos.length = 0;
  mesYCierre.mockClear(); mesDeLaFoto = null;
  store.connected = false; store.globalData = [];
  localStorage.removeItem('planta_modo');
  document.body.innerHTML = '<div id="r"></div>';
  root = document.getElementById('r');
});

describe('🏭 Planta · cambiar de modo no destruye el que se deja', () => {
  it('Maqueta → Análisis → Maqueta: cada uno se monta UNA vez; el que se deja se oculta y volver lo repinta', async () => {
    plantaView(root); await espera();
    expect(montarPlanta).toHaveBeenCalledTimes(1);
    const maqueta = montarPlanta.mock.results[0].value;
    expect(cajas('maqueta')).toHaveLength(1);
    expect(cajas('maqueta')[0].hidden).toBe(false);

    elegir('analisis'); await espera();
    expect(montarAnalisis).toHaveBeenCalledTimes(1);
    expect(cajas('maqueta')[0].hidden).toBe(true);
    expect(cajas('maqueta')[0].querySelector('[data-escena="1"]')).not.toBeNull();   // sigue ahí, oculta
    expect(cajas('analisis')[0].hidden).toBe(false);
    expect(localStorage.getItem('planta_modo')).toBe('analisis');

    const antes = maqueta.pintarEstado.mock.calls.length;
    elegir('maqueta'); await espera();
    expect(montarPlanta).toHaveBeenCalledTimes(1);   // no se reconstruye
    expect(maqueta.pintarEstado.mock.calls.length).toBe(antes + 1);
    expect(cajas('maqueta')[0].hidden).toBe(false);
    expect(cajas('analisis')[0].hidden).toBe(true);
    expect(root.querySelector('[data-modo="maqueta"]').getAttribute('aria-pressed')).toBe('true');

    elegir('analisis'); await espera();
    expect(montarAnalisis).toHaveBeenCalledTimes(1);
    expect(cajas('analisis')).toHaveLength(1);
    expect(cajas('maqueta')).toHaveLength(1);
  });

  it('M3 (2026-10-27): el tercer modo, 🦐 Broodstock, se monta UNA vez, se recuerda y abre la próxima vez; los otros se ocultan', async () => {
    expect(root.querySelector('[data-modo="broodstock"]'), 'control: antes de montar no hay botón').toBeNull();
    plantaView(root); await espera();
    expect(root.querySelector('[data-modo="broodstock"]').textContent).toBe('🦐 Broodstock');
    elegir('broodstock'); await espera();
    expect(montarBroodstock).toHaveBeenCalledTimes(1);
    expect(cajas('broodstock')[0].hidden).toBe(false);
    expect(cajas('maqueta')[0].hidden).toBe(true);
    expect(root.querySelector('[data-modo="broodstock"]').getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('planta_modo')).toBe('broodstock');
    elegir('maqueta'); await espera();
    elegir('broodstock'); await espera();
    expect(montarBroodstock, 'volver no lo reconstruye').toHaveBeenCalledTimes(1);
    // la próxima vez que se abre Planta, empieza en Broodstock (y no baja la maqueta)
    document.body.innerHTML = '<div id="r"></div>'; root = document.getElementById('r'); montarPlanta.mockClear();
    plantaView(root); await espera();
    expect(montarBroodstock).toHaveBeenCalledTimes(2);
    expect(montarPlanta).not.toHaveBeenCalled();
    expect(cajas('broodstock')[0].hidden).toBe(false);
  });

  it('un modo dejado mientras cargaba no queda montado ni a la vista; al volver se monta una sola vez', async () => {
    plantaView(root);                 // empieza a cargar la Maqueta…
    elegir('analisis');               // …y se cambia antes de que llegue
    await espera();
    expect(montarPlanta).not.toHaveBeenCalled();
    expect(cajas('maqueta')).toHaveLength(0);
    expect(cajas('analisis')[0].hidden).toBe(false);
    elegir('maqueta'); await espera();
    expect(montarPlanta).toHaveBeenCalledTimes(1);
    expect(cajas('maqueta')).toHaveLength(1);
  });

  it('si la Maqueta falla (sin WebGL) lo dice, y al volver a elegirla se reintenta sin cajas repetidas', async () => {
    montarPlanta.mockImplementationOnce(() => { throw new Error('sin WebGL'); });
    plantaView(root); await espera();
    expect(cajas('maqueta')[0].textContent).toContain('No se pudo mostrar la maqueta 3D');
    elegir('analisis'); await espera();
    elegir('maqueta'); await espera();
    expect(montarPlanta).toHaveBeenCalledTimes(2);
    expect(cajas('maqueta')).toHaveLength(1);
    expect(cajas('maqueta')[0].querySelector('[data-escena="1"]')).not.toBeNull();
  });
});

describe('🏭 Planta · al llegar datos calcula por partes y pinta al acabar (punto 5, 2026-10-06)', () => {
  const conDatos = (v) => v.pintarEstado.mock.calls.filter((c) => c[0]);
  it('pinta sólo al acabar; un cálculo superado por datos nuevos no pinta; un mes ya calculado sale de la memoria', async () => {
    store.connected = true; store.globalData = [{ a: 1 }];
    plantaView(root);
    await vi.waitFor(() => expect(calculos).toHaveLength(1));
    const maqueta = montarPlanta.mock.results[0].value;
    expect(conDatos(maqueta)).toHaveLength(0);   // aún calculando: no pinta a medias

    store.globalData = [{ a: 2 }]; emit(EV.DATA, {});   // llega otro libro antes de acabar
    await vi.waitFor(() => expect(calculos).toHaveLength(2));
    calculos[0]({ modulos: { viejo: 1 }, resumen: null });
    await espera(); await espera(); await espera();
    expect(conDatos(maqueta)).toHaveLength(0);   // el del libro viejo se descarta

    calculos[1]({ modulos: { nuevo: 1 }, resumen: null });
    await vi.waitFor(() => expect(conDatos(maqueta)).toHaveLength(1));
    expect(conDatos(maqueta)[0][0].modulos).toEqual({ nuevo: 1 });

    elegir('analisis'); await espera();   // el mismo mes con el mismo libro: de la memoria, al instante
    const analisis = montarAnalisis.mock.results[0].value;
    expect(conDatos(analisis)).toHaveLength(1);
    expect(conDatos(analisis)[0][0].modulos).toEqual({ nuevo: 1 });
    expect(estadoPlantaPorPartes).toHaveBeenCalledTimes(2);
  });
});

describe('🏭 Planta · el mapa 🦐 sólo pide el mes de su foto (hallazgo 4 de la auditoría de la A; ronda 11, Sesión B)', () => {
  const conDatos = (v) => v.pintarEstado.mock.calls.filter((c) => c[0]);
  const ultimoAviso = (v) => v.aviso.mock.calls.at(-1)[0];
  const tresTurnos = async () => { await espera(); await espera(); await espera(); };

  it('con datos se pinta YA, sin lanzar el cálculo de la Maqueta: la foto de hoy y «puestos al día»', async () => {
    localStorage.setItem('planta_modo', 'broodstock');
    mesDeLaFoto = { mes: 'Octubre 2026', cierre: '2026-10-06', actual: true };   // el mes en curso
    store.connected = true; store.globalData = [{ a: 1 }];
    plantaView(root);
    await vi.waitFor(() => expect(montarBroodstock).toHaveBeenCalledTimes(1));
    const mapa = montarBroodstock.mock.results[0].value;
    await vi.waitFor(() => expect(conDatos(mapa)).toHaveLength(1));
    expect(estadoPlantaPorPartes, 'no espera ni lanza el cálculo de larvicultura').not.toHaveBeenCalled();
    expect(mesYCierre).toHaveBeenCalledWith('2026-10-06', null);
    expect(conDatos(mapa)[0][0].mes).toBeNull();   // el mes en curso: la foto es hoy
    expect(ultimoAviso(mapa)).toMatch(/^Datos del MCP · puestos al día a las [^·]+$/);
  });

  it('si saber el mes falla, lo dice (es lo único que el mapa pide) y pinta la foto de hoy', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      localStorage.setItem('planta_modo', 'broodstock');
      mesYCierre.mockImplementationOnce(() => { throw new Error('mes raro'); });
      store.connected = true; store.globalData = [{ a: 1 }];
      plantaView(root);
      await vi.waitFor(() => expect(montarBroodstock).toHaveBeenCalledTimes(1));
      const mapa = montarBroodstock.mock.results[0].value;
      await vi.waitFor(() => expect(conDatos(mapa)).toHaveLength(1));
      expect(conDatos(mapa)[0][0].mes).toBeNull();
      expect(ultimoAviso(mapa)).toBe('No se pudo calcular: el mes elegido (mes raro)');
      expect(err).toHaveBeenCalledWith('[planta] mes', expect.any(Error));
    } finally { err.mockRestore(); }
  });

  it('un mes pasado elegido en la Maqueta llega al mapa con su cierre, y el aviso lo dice', async () => {
    store.connected = true; store.globalData = [{ a: 1 }];
    plantaView(root);
    await vi.waitFor(() => expect(calculos).toHaveLength(1));
    const maqueta = montarPlanta.mock.results[0].value;
    mesDeLaFoto = { mes: 'Septiembre 2026', cierre: '2026-09-30', actual: false };
    maqueta.alElegirMes.mock.calls[0][0](3, false);   // elegir septiembre
    elegir('broodstock');
    await vi.waitFor(() => expect(montarBroodstock).toHaveBeenCalledTimes(1));
    const mapa = montarBroodstock.mock.results[0].value;
    await vi.waitFor(() => expect(conDatos(mapa)).toHaveLength(1));
    expect(mesYCierre).toHaveBeenLastCalledWith('2026-10-06', 3);
    expect(conDatos(mapa)[0][0].mes).toEqual({ mes: 'Septiembre 2026', cierre: '2026-09-30' });
    expect(ultimoAviso(mapa)).toMatch(/mostrando Septiembre 2026 \(maduración al 30\/09\)$/);
  });

  it('un cálculo entero en curso no repinta el mapa ni le avisa; al volver a la Maqueta sale de la memoria, sin repetirlo', async () => {
    store.connected = true; store.globalData = [{ a: 1 }];
    plantaView(root);
    await vi.waitFor(() => expect(calculos).toHaveLength(1));   // la Maqueta empezó a calcular…
    const maqueta = montarPlanta.mock.results[0].value;
    elegir('broodstock');                                        // …y se pasa al mapa antes de que acabe
    await vi.waitFor(() => expect(montarBroodstock).toHaveBeenCalledTimes(1));
    const mapa = montarBroodstock.mock.results[0].value;
    await vi.waitFor(() => expect(conDatos(mapa)).toHaveLength(1));
    const avisos = mapa.aviso.mock.calls.length;
    calculos[0]({ modulos: { m: 1 }, resumen: null });           // acaba el de la Maqueta
    await tresTurnos();
    expect(conDatos(mapa), 'no lo repinta').toHaveLength(1);
    expect(mapa.aviso.mock.calls.length, 'ni le avisa').toBe(avisos);
    elegir('maqueta'); await espera();
    expect(conDatos(maqueta)).toHaveLength(1);
    expect(conDatos(maqueta)[0][0].modulos).toEqual({ m: 1 });
    expect(estadoPlantaPorPartes).toHaveBeenCalledTimes(1);
  });

  it('…y si se vuelve a la Maqueta ANTES de que acabe, espera ese mismo cálculo (no lanza otro) y lo pinta', async () => {
    store.connected = true; store.globalData = [{ a: 1 }];
    plantaView(root);
    await vi.waitFor(() => expect(calculos).toHaveLength(1));
    const maqueta = montarPlanta.mock.results[0].value;
    elegir('broodstock');
    await vi.waitFor(() => expect(montarBroodstock).toHaveBeenCalledTimes(1));
    elegir('maqueta'); await tresTurnos();
    expect(calculos).toHaveLength(1);
    calculos[0]({ modulos: { m: 2 }, resumen: null });
    await vi.waitFor(() => expect(conDatos(maqueta)).toHaveLength(1));
    expect(conDatos(maqueta)[0][0].modulos).toEqual({ m: 2 });
    expect(estadoPlantaPorPartes).toHaveBeenCalledTimes(1);
  });

  it('si ese cálculo en curso se RECHAZA, el fallo no sale en el mapa (no es suyo); la Maqueta lo calcula al volver', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const real = globalThis.MessageChannel;
    try {
      store.connected = true; store.globalData = [{ a: 1 }];
      plantaView(root);
      await vi.waitFor(() => expect(calculos).toHaveLength(1));
      elegir('broodstock');
      await vi.waitFor(() => expect(montarBroodstock).toHaveBeenCalledTimes(1));
      const mapa = montarBroodstock.mock.results[0].value;
      await vi.waitFor(() => expect(conDatos(mapa)).toHaveLength(1));
      // el siguiente `ceder()` del cálculo de la Maqueta falla: su promesa se rechaza
      globalThis.MessageChannel = function () { globalThis.MessageChannel = real; throw new Error('sin canal'); };
      calculos[0]({ modulos: { m: 1 }, resumen: null });
      await vi.waitFor(() => expect(err).toHaveBeenCalledWith('[planta] calcular', expect.any(Error)));
      await tresTurnos();
      expect(mapa.aviso.mock.calls.map((c) => c[0]).filter((t) => /No se pudieron poner al día/.test(t))).toEqual([]);
      elegir('maqueta');
      await vi.waitFor(() => expect(calculos).toHaveLength(2));   // el mes no quedó bloqueado: se calcula de nuevo
    } finally { globalThis.MessageChannel = real; err.mockRestore(); }
  });
});

describe('🏭 Planta · datos nuevos: se avisan y se actualizan al tocar (2026-10-07, usuario)', () => {
  const conDatos = (v) => v.pintarEstado.mock.calls.filter((c) => c[0]);
  const aviso = () => root.querySelector('.planta-nuevos');
  /** Monta con un libro a la vista (ya calculado y pintado en la Maqueta). */
  const conLibroPintado = async (guardado) => {
    if (guardado) { plantaView(root); await espera(); store.connected = true; store.globalData = [{ g: 1 }]; emit(EV.DATA, { firstLoad: true, guardado: true }); }
    else { store.connected = true; store.globalData = [{ a: 1 }]; plantaView(root); }
    await vi.waitFor(() => expect(calculos).toHaveLength(1));
    calculos[0]({ modulos: { m: 1 }, resumen: null });
    const maqueta = montarPlanta.mock.results[0].value;
    await vi.waitFor(() => expect(conDatos(maqueta)).toHaveLength(1));
    return maqueta;
  };

  it('con datos a la vista, un refresco sólo avisa; «Actualizar» recalcula, pinta lo nuevo y repone el desplazamiento', async () => {
    const maqueta = await conLibroPintado(false);
    expect(aviso().hidden).toBe(true);
    store.globalData = [{ a: 2 }]; emit(EV.DATA, { firstLoad: false });
    await espera(); await espera();
    expect(calculos).toHaveLength(1);             // no recalcula…
    expect(conDatos(maqueta)).toHaveLength(1);    // …ni repinta
    expect(aviso().hidden).toBe(false);
    expect(aviso().textContent).toMatch(/Hay datos nuevos \(.+\)/);

    // un repintado que «salta» arriba: tras «Actualizar» la página vuelve a donde estaba
    let y = 900;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    Object.defineProperty(window, 'scrollX', { configurable: true, get: () => 0 });
    window.scrollTo = vi.fn((x0, y0) => { y = y0; });
    maqueta.pintarEstado.mockImplementation((E) => { if (E) y = 0; });
    aviso().querySelector('button').click();
    expect(aviso().hidden).toBe(true);
    await vi.waitFor(() => expect(calculos).toHaveLength(2));
    calculos[1]({ modulos: { m: 2 }, resumen: null });
    await vi.waitFor(() => expect(conDatos(maqueta)).toHaveLength(2));
    expect(conDatos(maqueta)[1][0].modulos).toEqual({ m: 2 });
    expect(y).toBe(900);
  });

  it('A1 (2026-10-11): lo pedido a mano (⟳, la píldora) se pinta YA, sin aviso, y repone el desplazamiento', async () => {
    const maqueta = await conLibroPintado(false);
    let y = 700;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    Object.defineProperty(window, 'scrollX', { configurable: true, get: () => 0 });
    window.scrollTo = vi.fn((x0, y0) => { y = y0; });
    maqueta.pintarEstado.mockImplementation((E) => { if (E) y = 0; });
    store.globalData = [{ a: 2 }]; emit(EV.DATA, { firstLoad: false, manual: true });
    expect(aviso().hidden).toBe(true);
    await vi.waitFor(() => expect(calculos).toHaveLength(2));
    calculos[1]({ modulos: { m: 2 }, resumen: null });
    await vi.waitFor(() => expect(conDatos(maqueta)).toHaveLength(2));
    expect(conDatos(maqueta)[1][0].modulos).toEqual({ m: 2 });
    expect(y).toBe(700);
    expect(aviso().hidden).toBe(true);
  });

  it('al abrir con el libro GUARDADO, su puesta al día se aplica sola si la vista no se usó; desde ahí, aviso', async () => {
    const maqueta = await conLibroPintado(true);
    store.globalData = [{ g: 2 }]; emit(EV.DATA, { firstLoad: false });   // la revalidación
    await vi.waitFor(() => expect(calculos).toHaveLength(2));
    calculos[1]({ modulos: { m: 2 }, resumen: null });
    await vi.waitFor(() => expect(conDatos(maqueta)).toHaveLength(2));
    expect(aviso().hidden).toBe(true);
    store.globalData = [{ g: 3 }]; emit(EV.DATA, { firstLoad: false });   // el siguiente refresco
    await espera(); await espera();
    expect(calculos).toHaveLength(2);
    expect(aviso().hidden).toBe(false);
  });

  it('…y si ya se usó (un toque en la vista), la puesta al día del libro guardado también sólo avisa', async () => {
    await conLibroPintado(true);
    root.querySelector('.planta-vista').dispatchEvent(new Event('pointerdown'));
    store.globalData = [{ g: 2 }]; emit(EV.DATA, { firstLoad: false });
    await espera(); await espera();
    expect(calculos).toHaveLength(1);
    expect(aviso().hidden).toBe(false);
  });

  it('al salir de la vista, un EV.CONN suelta TODO: el bus y la escucha de scroll de la ventana (auditoría C1)', async () => {
    const puestas = [];
    const add = vi.spyOn(window, 'addEventListener').mockImplementation((t, fn) => { if (t === 'scroll') puestas.push(fn); });
    const quitar = vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
    try {
      const maqueta = await conLibroPintado(false);
      expect(puestas).toHaveLength(1);
      document.body.innerHTML = '';                   // el router pinta otra vista: Planta deja el documento
      emit(EV.CONN, { state: 'connected', label: 'x' });
      expect(quitar).toHaveBeenCalledWith('scroll', puestas[0]);
      const antes = maqueta.pintarEstado.mock.calls.length;
      store.globalData = [{ a: 9 }]; emit(EV.DATA, { firstLoad: false });   // ya no escucha
      await espera(); await espera();
      expect(maqueta.pintarEstado.mock.calls.length).toBe(antes);
      expect(calculos).toHaveLength(1);
    } finally { add.mockRestore(); quitar.mockRestore(); }
  });

  it('al cambiar de vista lo suelta TODO en ese momento, sin esperar al siguiente aviso (C2, 2026-10-07)', async () => {
    const puestas = [];
    const add = vi.spyOn(window, 'addEventListener').mockImplementation((t, fn) => { if (t === 'scroll') puestas.push(fn); });
    const quitar = vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
    try {
      const maqueta = await conLibroPintado(false);
      emit(EV.VIEW, 'planta');                        // un cambio de vista que la deja en el documento: sigue escuchando
      await espera();
      expect(quitar).not.toHaveBeenCalledWith('scroll', puestas[0]);
      emit(EV.VIEW, 'supervisor');                    // el router avisa ANTES de pintar la otra vista…
      expect(quitar).not.toHaveBeenCalledWith('scroll', puestas[0]);
      document.body.innerHTML = '';                   // …la pinta, y Planta deja el documento
      await espera();
      expect(quitar).toHaveBeenCalledWith('scroll', puestas[0]);
      const antes = maqueta.pintarEstado.mock.calls.length;
      store.globalData = [{ a: 9 }]; emit(EV.DATA, { firstLoad: false });   // ya no escucha
      await espera(); await espera();
      expect(maqueta.pintarEstado.mock.calls.length).toBe(antes);
      expect(calculos).toHaveLength(1);
    } finally { add.mockRestore(); quitar.mockRestore(); }
  });

  it('cambiar de modo no recalcula el que ya enseña lo aceptado (sigue el aviso); cambiar de mes acepta lo nuevo', async () => {
    const maqueta = await conLibroPintado(false);
    elegir('analisis'); await espera();
    const analisis = montarAnalisis.mock.results[0].value;
    expect(conDatos(analisis)).toHaveLength(1);   // mismo libro: de la memoria
    store.globalData = [{ a: 2 }]; emit(EV.DATA, { firstLoad: false });
    await espera();
    const antes = maqueta.pintarEstado.mock.calls.length;
    elegir('maqueta'); await espera(); await espera();
    expect(maqueta.pintarEstado.mock.calls.length).toBe(antes);
    expect(calculos).toHaveLength(1);
    expect(aviso().hidden).toBe(false);

    maqueta.alElegirMes.mock.calls[0][0](3, false);   // elegir otro mes
    expect(aviso().hidden).toBe(true);
    await vi.waitFor(() => expect(calculos).toHaveLength(2));
  });
});

describe('🏭 Planta · pintar puede fallar sin colgar el panel (C5, 2026-10-18, usuario)', () => {
  const conDatos = (v) => v.pintarEstado.mock.calls.filter((c) => c[0]);
  const ultimoAviso = (v) => v.aviso.mock.calls.at(-1)[0];
  /** Monta con un libro y deja su cálculo esperando; devuelve la Maqueta. */
  const montarConLibro = async () => {
    store.connected = true; store.globalData = [{ a: 1 }];
    plantaView(root);
    await vi.waitFor(() => expect(calculos).toHaveLength(1));
    return montarPlanta.mock.results[0].value;
  };

  it('los pasos que la vista no pudo pintar se nombran en el aviso, en lugar de «puestos al día»', async () => {
    const maqueta = await montarConLibro();
    maqueta.pintarEstado.mockImplementation((E) => (E ? ['cifras', 'balizas'] : undefined));
    calculos[0]({ modulos: { m: 1 }, resumen: null });
    await vi.waitFor(() => expect(conDatos(maqueta)).toHaveLength(1));
    expect(ultimoAviso(maqueta)).toBe('No se pudo pintar: cifras · balizas');
  });

  it('si pintar falla entera: lo avisa, no queda como pintada y el siguiente refresco vuelve a pintar (no sólo avisa)', async () => {
    const maqueta = await montarConLibro();
    maqueta.pintarEstado.mockImplementation((E) => { if (E) throw new Error('dato raro'); });
    calculos[0]({ modulos: { m: 1 }, resumen: null });
    await vi.waitFor(() => expect(conDatos(maqueta)).toHaveLength(1));
    await espera();
    expect(ultimoAviso(maqueta)).toBe('No se pudieron pintar los datos: dato raro');

    maqueta.pintarEstado.mockImplementation(() => {});
    store.globalData = [{ a: 2 }]; emit(EV.DATA, { firstLoad: false });   // refresco automático
    await vi.waitFor(() => expect(calculos).toHaveLength(2));
    calculos[1]({ modulos: { m: 2 }, resumen: null });
    await vi.waitFor(() => expect(conDatos(maqueta)).toHaveLength(2));
    expect(root.querySelector('.planta-nuevos').hidden).toBe(true);
    expect(ultimoAviso(maqueta)).toMatch(/^Datos del MCP · puestos al día/);
  });
});

describe('🏭 Planta · si el cálculo se rechaza, lo avisa y lo suelta (pauta 16, 2026-10-22, usuario)', () => {
  const conDatos = (v) => v.pintarEstado.mock.calls.filter((c) => c[0]);
  let err;
  beforeEach(() => { err = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { err.mockRestore(); });

  it('🔴 un cálculo que se RECHAZA se avisa y no deja el mes bloqueado: al volver a pintar se calcula de nuevo', async () => {
    // el canal con el que `ceder()` cede el turno falla UNA vez: la promesa del cálculo se rechaza antes de empezar
    const real = globalThis.MessageChannel;
    globalThis.MessageChannel = function () { globalThis.MessageChannel = real; throw new Error('sin canal'); };
    try {
      store.connected = true; store.globalData = [{ a: 1 }];
      plantaView(root);
      await vi.waitFor(() => expect(montarPlanta).toHaveBeenCalledTimes(1));
      const maqueta = montarPlanta.mock.results[0].value;
      await vi.waitFor(() => expect(maqueta.aviso).toHaveBeenCalledWith('No se pudieron poner al día los datos: sin canal'));
      expect(err).toHaveBeenCalledWith('[planta] calcular', expect.any(Error));
      expect(estadoPlantaPorPartes).not.toHaveBeenCalled();
      // el mismo libro y el mismo mes: antes seguía «calculándose» para siempre y no se pedía nada
      elegir('analisis');
      await vi.waitFor(() => expect(calculos).toHaveLength(1));
      calculos[0]({ modulos: { m: 1 }, resumen: null });
      const analisis = montarAnalisis.mock.results[0].value;
      await vi.waitFor(() => expect(conDatos(analisis)).toHaveLength(1));
    } finally { globalThis.MessageChannel = real; }
  });

  it('un fallo DESPUÉS de pintar (el aviso final) se registra y se dice, en vez de quedar como un rechazo sin atrapar', async () => {
    store.connected = true; store.globalData = [{ a: 1 }];
    plantaView(root);
    await vi.waitFor(() => expect(calculos).toHaveLength(1));
    const maqueta = montarPlanta.mock.results[0].value;
    maqueta.aviso.mockImplementation((t) => { if (/^Datos del MCP/.test(t)) throw new Error('aviso roto'); });
    calculos[0]({ modulos: { m: 1 }, resumen: null });
    await vi.waitFor(() => expect(err).toHaveBeenCalledWith('[planta] calcular', expect.any(Error)));
    expect(conDatos(maqueta)).toHaveLength(1);
    expect(maqueta.aviso.mock.calls.at(-1)[0]).toBe('No se pudieron poner al día los datos: aviso roto');
  });
});

describe('🔧 F3 · el blower de cada módulo llega a la vista con el cálculo de hoy (2026-10-29, usuario)', () => {
  const conDatos = (v) => v.pintarEstado.mock.calls.filter((c) => c[0]);
  const ultimoAviso = (v) => v.aviso.mock.calls.at(-1)[0];
  it('de las hojas de Mantenimiento del libro: el BLW-04 del Módulo 4, con su cambio de aceite vencido', async () => {
    store.connected = true;
    store.globalData = [
      { _SheetOrigin: 'Mantenimiento Equipos', 'Código': 'BLW-04', Modelo: 'FB 441 C', 'Ubicación': 'Módulo 4', Estado: 'En servicio' },
      { _SheetOrigin: 'Mantenimiento Plan', Actividad: 'Cambio de aceite', 'Intervalo (h)': '3000', 'Primer cambio (h)': '500' },
      { _SheetOrigin: 'Mantenimiento Lecturas', Fecha: '2026-10-05', Hora: '08:00', Equipo: 'BLW-04', 'Horómetro (h)': '513,38' },
    ];
    plantaView(root);
    await vi.waitFor(() => expect(calculos).toHaveLength(1));
    const maqueta = montarPlanta.mock.results[0].value;
    calculos[0]({ modulos: {}, resumen: null });
    await vi.waitFor(() => expect(conDatos(maqueta)).toHaveLength(1));
    const E = conDatos(maqueta)[0][0];
    expect(E.mes, 'hoy').toBe(null);
    expect(E.blowers.porModulo.M4.map((b) => [b.codigo, b.vencidos.map((p) => p.actividad)])).toEqual([['BLW-04', ['Cambio de aceite']]]);
    expect(ultimoAviso(maqueta)).toMatch(/^Datos del MCP · puestos al día/);
  });
});
