// @vitest-environment happy-dom
/* ============================================================
   TAREA 5 (2026-10-23, usuario) · las siete vistas de cada día se bajan AL ABRIRLAS
   Qué se exige:
   · main.js no importa de forma ESTÁTICA ninguna de las siete (Supervisor, Larvicultura, Revisiones, Visitante, Algas,
     Microbiología y la entrada de Maduración): cada una se registra con `diferida` y su `import()`. Si una vuelve a ser
     estática, el bloque principal vuelve a llevarla y TODOS los roles la bajan antes de la pantalla de roles;
   · `diferida` conserva las opciones de la vista (`usaBarraFecha`…), enseña «Cargando…», pinta al llegar, dice si el
     bloque no llegó (y si es por la señal), dice si la vista falló al pintar, no pinta en una vista ya abandonada y
     devuelve la promesa de la vista.
   2026-10-29 (ronda 12) · 🔧 Mantenimiento (2026-10-28) también es diferida y esta prueba no la miraba: va en la lista.
   ============================================================ */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diferida } from './vistaDiferida.js';

const main = readFileSync(join(process.cwd(), 'src/main.js'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const DIFERIDAS = {
  supervisor: './views/supervisor/index.js', larvicultura: './views/larvicultura/index.js',
  revisiones: './views/revisiones/index.js', visitante: './views/visitante/index.js', algas: './views/algas/index.js',
  microbiologia: './views/microbiologia/index.js', maduracion: './views/maduracion/entrada.js',
  mantenimiento: './views/mantenimiento/index.js',
};

describe('main.js · las siete vistas de cada día y la de Mantenimiento son DIFERIDAS', () => {
  it('🔴 ninguna se importa de forma estática: ninguna vista entra por un `import … from` en el bloque principal', () => {
    const estaticas = [...main.matchAll(/^import\s[^;]*?from\s+'(\.\/views\/[^']+)'/gm)].map((m) => m[1]);
    expect(estaticas).toEqual([]);
  });

  it('🔴 cada una se registra con `diferida` y el import() de su módulo', () => {
    for (const [id, ruta] of Object.entries(DIFERIDAS)) {
      const linea = main.split('\n').find((l) => l.includes(`registerView('${id}'`));
      expect(linea, id).toBeTruthy();
      expect(linea, id).toContain('diferida(');
      expect(linea, id).toContain(`import('${ruta}')`);
    }
  });
});

describe('ui/vistaDiferida · diferida(def, carga)', () => {
  let errSpy;
  afterEach(() => { if (errSpy) errSpy.mockRestore(); errSpy = null; document.body.innerHTML = ''; vi.unstubAllGlobals(); });
  const montado = () => { const root = document.createElement('div'); document.body.appendChild(root); return root; };

  it('conserva las opciones de la vista y añade su render', () => {
    const def = diferida({ label: 'Supervisor', icon: '👁️', usaBarraFecha: true }, () => Promise.resolve(() => {}));
    expect(def).toMatchObject({ label: 'Supervisor', icon: '👁️', usaBarraFecha: true });
    expect(typeof def.render).toBe('function');
  });

  it('🔴 «Cargando…» mientras llega el bloque; al llegar, pinta la vista en su contenedor', async () => {
    let llega;
    const carga = () => new Promise((r) => { llega = r; });
    const root = montado();
    const p = diferida({ label: 'Visitante', icon: '🚪' }, carga).render(root);
    expect(root.textContent).toContain('Cargando Visitante…');
    llega((r) => { r.innerHTML = '<p class="vista">la vista</p>'; });
    await p;
    expect(root.querySelector('.vista').textContent).toBe('la vista');
  });

  it('🔑 devuelve la promesa de la vista (la de Maduración llega con su propio import)', async () => {
    let terminaVista;
    const vista = new Promise((r) => { terminaVista = r; });
    const root = montado();
    let hecho = false;
    const p = diferida({ label: 'Maduración', icon: '🥚' }, () => Promise.resolve(() => vista)).render(root).then(() => { hecho = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(hecho).toBe(false);
    terminaVista();
    await p;
    expect(hecho).toBe(true);
  });

  it('🔴 si el bloque no llega, lo dice; si es por la señal, lo dice así', async () => {
    const root = montado();
    await diferida({ label: 'Algas', icon: '🌿' }, () => Promise.reject(new Error('fallo raro'))).render(root);
    expect(root.textContent).toContain('Error al cargar Algas.');
    expect(root.textContent).toContain('fallo raro');
    await diferida({ label: 'Algas', icon: '🌿' }, () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: x.js'))).render(root);
    expect(root.textContent).toContain('Algas necesita señal');
    vi.stubGlobal('navigator', { onLine: false });
    await diferida({ label: 'Algas', icon: '🌿' }, () => Promise.reject(new Error('cualquiera'))).render(root);
    expect(root.textContent).toContain('Algas necesita señal');
  });

  it('🔴 si la vista falla AL PINTAR, lo dice como el router (y lo registra)', async () => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const root = montado();
    await diferida({ label: 'Revisiones', icon: '🔍' }, () => Promise.resolve(() => { throw new Error('dato raro'); })).render(root);
    expect(root.textContent).toContain('Error al renderizar la vista.');
    expect(root.textContent).toContain('dato raro');
    expect(errSpy).toHaveBeenCalled();
  });

  it('🔑 si se cambió de vista antes de que llegara el bloque, no pinta nada en el contenedor abandonado', async () => {
    let llega;
    const pintar = vi.fn((r) => { r.innerHTML = 'la vista'; });
    const root = montado();
    const p = diferida({ label: 'Microbiología', icon: '🧫' }, () => new Promise((r) => { llega = r; })).render(root);
    root.remove();                                        // el router vació el contenedor para otra vista
    llega(pintar);
    await p;
    expect(pintar).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Cargando Microbiología…');
  });
});
