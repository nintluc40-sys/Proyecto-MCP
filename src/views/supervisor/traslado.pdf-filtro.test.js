// @vitest-environment happy-dom
/* ============================================================
   A25 (2026-11-07, usuario: «Sí, los dos») · EL PDF DEL VIAJE LLEVA TODOS SUS CAMIONES, AUNQUE HAYA FILTRO DE PLACA

   LO QUE PASABA: el usuario decidió el 2026-08-27 que el PDF es del VIAJE ENTERO, y el código pasaba `v.camiones` para
   eso. Pero `v` salía de los viajes armados con lo VISIBLE: con el filtro de una placa, el papel decía que en el viaje
   iba un solo camión.

   Aparte del resto de la vista porque aquí se sustituye `printFichaDocs` (la impresión real abre un iframe), para leer
   el documento que se habría impreso. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTrasladoPayload } from '../registros/lib/ficha-traslado.schema.js';

const impresos = vi.hoisted(() => []);
vi.mock('./fichaPdf.js', async (original) => ({
  ...(await original()),
  printFichaDocs: (docs, alAvanzar) => { impresos.push(...docs); if (alAvanzar) alAvanzar(docs.length, docs.length, '', true); return true; },
}));
const { renderTraslado, resetTrasladoFiltro } = await import('./traslado.js');

function aFilas(payload) {
  return payload.rows.map((r) => {
    const o = { _SheetOrigin: 'Registro_Traslado' };
    payload.headers.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}
const tinas = (o2) => Object.fromEntries([1, 2, 3, 4].map((t) => ([t, { o2, temp: 26, act: 'Alta', alim: 'Artemia' }])));
function viaje() {
  const camiones = [{ placa: 'GSA-1147', tinasOff: [] }, { placa: 'PBX-0392', tinasOff: [] }];
  return {
    id: 'tv1',
    data: {
      fecha: '2026-08-18', corrida: '555', modulo: 'M07', camaronera: 'Puná 1',
      salinidad: '31.5', horaSalida: '20:30', horaLlegada: '06:00',
      insumos: ['Artemia'], check: ['Oxigenómetro'],
      controlador: 'Juanito', chequeador: 'Pepito', recepcion: 'María',
      camiones,
      revisiones: ['20:30', '22:00', '23:30', '01:00'].map((hora, i) => ({
        hora, lugar: 'Parada ' + (i + 1), lat: -2.2 - i * 0.01, lon: -80.9 - i * 0.01, precision: 12, ubicacion: 'x',
        horaRegistro: '2026-08-18T20:30:07', obs: '',
        camiones: camiones.map((_, ci) => ({ tinas: tinas(7.5 - ci) })),
      })),
    },
  };
}
function montar(ctx) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const pintar = () => { const r = renderTraslado(ctx, 'M07'); root.innerHTML = r.html; if (r.after) r.after(root, ctx); };
  pintar();
  root.addEventListener('click', (e) => { if (e.target.closest('[data-nav]')) pintar(); });
  return root;
}

beforeEach(() => { document.body.innerHTML = ''; resetTrasladoFiltro(); impresos.length = 0; });

describe('A25 · el PDF del viaje, con el filtro de una placa', () => {
  it('🔴 lleva los DOS camiones aunque la vista enseñe uno (antes, sólo el filtrado)', () => {
    const root = montar({ data: aFilas(buildTrasladoPayload(viaje())), allMods: ['M07'], vState: { corrida: '555' } });
    const sel = root.querySelector('[data-tras-placa-sel]');
    sel.value = 'PBX-0392';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);   // la vista, filtrada
    root.querySelector('[data-tras-modal="tiempo"]').click();
    root.querySelector('#sv-tras-modal-b [data-tras-pdf]').click();
    expect(impresos).toHaveLength(1);
    expect(impresos[0].page).toContain('GSA-1147');
    expect(impresos[0].page).toContain('PBX-0392');
  });

  it('sin filtro, el mismo papel', () => {
    const root = montar({ data: aFilas(buildTrasladoPayload(viaje())), allMods: ['M07'], vState: { corrida: '555' } });
    root.querySelector('[data-tras-modal="tiempo"]').click();
    root.querySelector('#sv-tras-modal-b [data-tras-pdf]').click();
    expect(impresos).toHaveLength(1);
    expect(impresos[0].page).toContain('GSA-1147');
    expect(impresos[0].page).toContain('PBX-0392');
  });
});
