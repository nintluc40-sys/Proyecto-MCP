// @vitest-environment happy-dom
/* ============================================================
   SHELL · el aviso de una carga INCOMPLETA del libro (punto 3 de la pauta del 12-11)

   🔴 LO QUE PASABA. El shell sólo avisaba con `warn` (1 hoja o menos: «Solo se cargó 1 hoja…»). Un libro que llegaba
   con 40 de 44 hojas abría sin ningún aviso, y las vistas de esas 4 hojas quedaban vacías sin explicación.

   🔑 AHORA (usuario: «Avisar hasta que llegue completo»). connectSheets (la primera carga y ⟳) manda `incompleta`
   con los nombres de las hojas que no llegaron (`faltan`; null si no se sabe cuáles), y el shell saca un aviso que las
   nombra y dice que se reintenta solo. Con 1 hoja o menos manda el aviso de siempre. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mountShell, MAIN_VIEWS, textoCargaIncompleta } from './shell.js';
import { registerView } from './router.js';
import { store, emit, EV } from '../core/store.js';
import { REFRESH_INTERVAL_S } from '../config.js';

beforeAll(() => {
  store.connected = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  for (const v of MAIN_VIEWS) registerView(v.id, { label: v.label, icon: v.icon, render: () => {} });
  mountShell(host);
});
beforeEach(() => { document.querySelectorAll('.app-toast').forEach((t) => t.remove()); });
const avisos = () => [...document.querySelectorAll('.app-toast')];

describe('punto 3 · aviso de carga incompleta', () => {
  it('con la lista de las que faltan: un aviso (warn) que las nombra y dice que se reintenta solo', () => {
    emit(EV.CONN, { state: 'connected', label: '42 hojas · 10:00 · faltaron 2 hojas (se reintenta)', warn: false,
      incompleta: { faltan: ['Datos Larvicultura - M09', 'Control_Tanque M10'] } });
    const a = avisos();
    expect(a).toHaveLength(1);
    expect(a[0].classList.contains('app-toast--warn')).toBe(true);
    expect(a[0].textContent).toContain('faltaron 2 hojas (Datos Larvicultura - M09, Control_Tanque M10)');
    expect(a[0].textContent).toContain(`cada ${REFRESH_INTERVAL_S / 60} minutos`);
    expect(a[0].textContent).not.toMatch(/Solo se cargó 1 hoja/);
  });

  it('sin saber cuáles (null): el aviso lo dice sin nombres', () => {
    emit(EV.CONN, { state: 'connected', label: '42 hojas · 10:00 · llegó incompleto (se reintenta)', incompleta: { faltan: null } });
    expect(avisos()).toHaveLength(1);
    expect(avisos()[0].textContent).toMatch(/no se pudo saber qué hojas faltan/);
  });

  it('con 1 hoja o menos (`warn`) sale el aviso de siempre, y uno solo', () => {
    emit(EV.CONN, { state: 'connected', label: '1 hoja · 10:00', warn: true, incompleta: { faltan: ['X'] } });
    expect(avisos()).toHaveLength(1);
    expect(avisos()[0].textContent).toMatch(/^Solo se cargó 1 hoja/);
  });

  it('control: una carga completa no avisa', () => {
    emit(EV.CONN, { state: 'connected', label: '44 hojas · 10:00', warn: false });
    expect(avisos()).toHaveLength(0);
  });

  it('textoCargaIncompleta: 1 hoja en singular y, con muchas, las 6 primeras y «y N más»', () => {
    expect(textoCargaIncompleta(['A'])).toMatch(/^El libro llegó incompleto: faltó 1 hoja \(A\)\./);
    const muchas = Array.from({ length: 9 }, (_, i) => 'H' + (i + 1));
    expect(textoCargaIncompleta(muchas)).toMatch(/faltaron 9 hojas \(H1, H2, H3, H4, H5, H6 y 3 más\)/);
  });
});
