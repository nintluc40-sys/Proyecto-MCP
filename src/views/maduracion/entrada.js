/* ============================================================
   MADURACIÓN · la ENTRADA del menú (F1 del tablero, 2026-09-19)

   Una sola entrada «🥚 Maduración» con dos familias, como decidió el usuario el 2026-09-19 («selector interno, abre
   en Operativo»):
     🐚 Operativo  — el tablero del registro operativo (salas, tanques y lotes). Es la que abre.
     🧬 Microchips — el seguimiento reproductivo por Trovan (index.js), exactamente como estaba.
   El tablero del operativo se carga DIFERIDO, con `import()`, igual que Registros y Biología Molecular: el bloque
   principal ya pasa de los 700 kB y esta app se abre desde el móvil. Aquí sólo viven el selector y el reparto.
   La familia elegida se recuerda mientras dura la sesión (al volver a la vista, o cuando se refrescan los datos).
   ============================================================ */
import { destroyAllCharts } from '../../core/charts.js';
import { esc } from '../../core/format.js';
import { maduracionView as microchipsView } from './index.js';

export const FAMILIAS = [
  { clave: 'operativo', etiqueta: 'Operativo', icono: '🐚' },
  { clave: 'microchips', etiqueta: 'Microchips', icono: '🧬' },
];
const estado = { familia: 'operativo' };

/**
 * La vista del menú: el selector de familia y, debajo, la familia elegida, cada vez en un contenedor NUEVO (cada
 * familia engancha sus eventos al suyo). Devuelve una promesa que se cumple cuando la familia está pintada: la del
 * operativo llega con su import diferido.
 */
export function maduracionEntrada(root) {
  destroyAllCharts();
  root.innerHTML = `<div class="mad-fam" role="group" aria-label="Registro de Maduración">${FAMILIAS.map((f) => {
    const on = f.clave === estado.familia;
    return `<button class="mad-fam-b ${on ? 'is-on' : ''}" data-mad-fam="${f.clave}" aria-pressed="${on}">${f.icono} ${esc(f.etiqueta)}</button>`;
  }).join('')}</div><div class="mad-cuerpo"></div>`;
  enlazar(root);
  const cuerpo = root.querySelector('.mad-cuerpo');
  if (estado.familia === 'microchips') {
    microchipsView(cuerpo);
    return Promise.resolve();
  }
  cuerpo.innerHTML = '<div class="empty-state" style="padding:64px 20px"><div style="font-size:40px">🐚</div><p class="muted">Cargando el tablero del operativo…</p></div>';
  return import('./operativo.view.js')
    .then((m) => { if (cuerpo.isConnected) m.operativoView(cuerpo); })
    .catch((e) => {
      if (cuerpo.isConnected) cuerpo.innerHTML = `<div class="empty-state" style="padding:48px">Error al cargar el tablero del operativo.<br><small class="mono">${esc(e && e.message)}</small></div>`;
    });
}

function enlazar(root) {
  if (root._madFamBound) return;
  root._madFamBound = true;
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mad-fam]');
    if (!b) return;
    const f = b.dataset.madFam;
    if (f === estado.familia || !FAMILIAS.some((x) => x.clave === f)) return;
    estado.familia = f;
    maduracionEntrada(root);
  });
}
