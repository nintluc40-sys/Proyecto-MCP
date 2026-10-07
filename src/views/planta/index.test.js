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

const { plantaView } = await import('./index.js');
const espera = () => new Promise((r) => setTimeout(r, 0));
let root;
const cajas = (modo) => [...root.querySelectorAll('.planta-cuerpo > [data-cuerpo="' + modo + '"]')];
const elegir = (modo) => root.querySelector('[data-modo="' + modo + '"]').click();

beforeEach(() => {
  montarPlanta.mockClear(); montarAnalisis.mockClear();
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
