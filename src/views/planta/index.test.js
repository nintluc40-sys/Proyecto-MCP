// @vitest-environment happy-dom
/* ============================================================
   PLANTA · el selector «🏭 Maqueta | 📊 Análisis» conserva cada modo montado (2026-10-06, usuario)
   Lo que se exige: cada modo se monta UNA vez y el que se deja sólo se oculta (volver a la Maqueta no reconstruye la
   escena, que costaba 6,5 s en escritorio y 8,9 s en celular); volver repinta con el estado del momento; un modo dejado
   mientras cargaba no queda montado ni a la vista; y uno que falló se reintenta al volver a elegirlo, sin cajas
   repetidas. La escena (three.js) y Análisis se simulan: aquí sólo se prueba el orquestador (index.js).
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const vistaFalsa = (nombre) => ({ nombre, pintarEstado: vi.fn(), aviso: vi.fn(), alElegirMes: vi.fn() });
const montarPlanta = vi.fn((host) => { host.querySelector('.viewport').dataset.escena = '1'; return vistaFalsa('maqueta'); });
const montarAnalisis = vi.fn((host) => { host.innerHTML = '<div class="planta planta-an"></div>'; return vistaFalsa('analisis'); });
vi.mock('./escena.js', () => ({ montarPlanta: (...a) => montarPlanta(...a) }));
vi.mock('./analisis.js', () => ({ montarAnalisis: (...a) => montarAnalisis(...a) }));
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
vi.mock('./cifras.js', () => ({ cifrasGerencia: () => null }));

const { plantaView } = await import('./index.js');
const { store, emit, EV } = await import('../../core/store.js');
const espera = () => new Promise((r) => setTimeout(r, 0));
let root;
const cajas = (modo) => [...root.querySelectorAll('.planta-cuerpo > [data-cuerpo="' + modo + '"]')];
const elegir = (modo) => root.querySelector('[data-modo="' + modo + '"]').click();

beforeEach(() => {
  montarPlanta.mockClear(); montarAnalisis.mockClear(); estadoPlantaPorPartes.mockClear(); calculos.length = 0;
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
