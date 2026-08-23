// @vitest-environment happy-dom
/* ============================================================
   SUPERVISOR · Traslado — la vista montada

   Renderiza la sub-vista de verdad y la maneja como el supervisor: filtra placas,
   abre los desgloses y comprueba que lo que se lee en pantalla es lo que dicen los
   datos. La agregación se prueba aparte, en `traslado.data.test.js`.
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildTrasladoPayload } from '../registros/lib/ficha-traslado.schema.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderTraslado, resetTrasladoFiltro } from './traslado.js';

function aFilas(payload) {
  return payload.rows.map((r) => {
    const o = { _SheetOrigin: 'Registro_Traslado' };
    payload.headers.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}
const tinasDe = (o2, temp, act) => Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7, 8].map((t) => ([t, { o2, temp, act, alim: 'Artemia' }])),
);
function viaje(nCam, obsEn) {
  const camiones = [{ placa: 'GSA-1147', tinasOff: [] }];
  if (nCam > 1) camiones.push({ placa: 'PBX-0392', tinasOff: [] });
  const HORAS = ['20:30', '22:00', '23:30', '01:00'];
  const LUGARES = ['Laboratorio', 'Peaje', 'Gabarra', 'Camaronera'];
  return {
    id: 'tv1',
    data: {
      fecha: '2026-08-18', corrida: '555', modulo: 'M07', camaronera: 'Puná 1',
      salinidad: '31.5', horaSalida: '20:30', horaLlegada: '06:00',
      insumos: ['Artemia', 'Flake', 'Prokura', 'Vitamina C'],
      check: ['Oxigenómetro', 'Linterna'],       // incompleto a propósito
      controlador: 'Juanito', chequeador: 'Pepito', recepcion: 'María',
      camiones,
      revisiones: [0, 1, 2, 3].map((i) => ({
        hora: HORAS[i], lugar: LUGARES[i],
        lat: -2.2135 - i * 0.01, lon: -80.9791 - i * 0.01, precision: 12, ubicacion: 'x',
        horaRegistro: '2026-08-18T20:30:07',
        obs: (obsEn || []).includes(i) ? 'Tracto digestivo vacío.' : '',
        camiones: camiones.map((_, ci) => ({
          tinas: tinasDe(7.6 - i * 0.2 - ci * 0.5, 26 - i, ['Alta', 'Alta', 'Normal', 'Media'][i]),
        })),
      })),
    },
  };
}

const ctxCon = (filas, corrida = '555') => ({
  data: filas, allMods: ['M07', 'M08'], vState: { corrida },
});

/** Monta la vista en un root real y ejecuta su `after`. */
function montar(ctx, mod = 'M07') {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const r = renderTraslado(ctx, mod);
  root.innerHTML = r.html;
  if (r.after) r.after(root, ctx);
  // El enrutador del Supervisor repinta al burbujear un [data-nav]: aquí se imita,
  // que es lo que hace que el filtro se vea.
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-nav]')) return;
    const r2 = renderTraslado(ctx, mod);
    root.innerHTML = r2.html;
    if (r2.after) r2.after(root, ctx);
  });
  return root;
}
const txt = (root) => root.textContent.replace(/\s+/g, ' ');
const kpi = (root, k) => root.querySelector(`[data-tras-modal="${k}"] .sv-kpi-value`).textContent.trim();

beforeEach(() => { document.body.innerHTML = ''; resetTrasladoFiltro(); });

describe('Traslado · la vista se dibuja', () => {
  it('sin datos lo dice, y no finge ceros', () => {
    const root = montar(ctxCon([]));
    expect(txt(root)).toContain('Todavía no hay traslados registrados');
    expect(txt(root)).toContain('Registro_Traslado');
    expect(root.querySelector('.sv-tras-cards')).toBeNull();
  });

  it('🔴 una tarjeta por camión, con su placa', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(2);
    expect(txt(root)).toContain('GSA-1147');
    expect(txt(root)).toContain('PBX-0392');
  });

  it('los KPIs muestran los promedios del conjunto', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    // Camión 1 promedia 7,30 y el 2 promedia 6,80 → conjunto 7,05.
    expect(kpi(root, 'o2')).toBe('7.05');
    expect(kpi(root, 'temp')).toBe('24.50');
    expect(kpi(root, 'act')).toBe('Alta');
  });

  it('🔴 el check incompleto dice QUÉ falta', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    expect(txt(root)).toContain('Falta: Bandeja, Esfero');
    expect(root.querySelector('.sv-tras-check.is-falta')).toBeTruthy();
  });

  it('no deja rastros de render', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2, [0])))));
    expect(txt(root)).not.toMatch(/undefined|NaN|\[object Object\]/);
  });
});

describe('Traslado · el selector de camiones', () => {
  it('🔴 pulsar una placa deja SÓLO ese camión', () => {
    // El primer diseño escondía el pulsado y obligaba a apagar los demás uno a uno
    // para quedarse con uno: con dos ya era incómodo y con tres, absurdo.
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(2);
    root.querySelector('[data-tras-placa="PBX-0392"]').click();
    const placas = [...root.querySelectorAll('.sv-tras-placa')].map((e) => e.textContent).join(' ');
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    expect(placas).toContain('PBX-0392');
    expect(placas).not.toContain('GSA-1147');
  });

  it('🔴 y los KPIs pasan a hablar de ESE camión', () => {
    // Si el KPI siguiera dando el promedio de los dos, el filtro mentiría.
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    expect(kpi(root, 'o2')).toBe('7.05');                 // los dos
    root.querySelector('[data-tras-placa="PBX-0392"]').click();
    expect(kpi(root, 'o2'), 'el KPI no se recalculó').toBe('6.80');
    root.querySelector('[data-tras-placa="GSA-1147"]').click();
    expect(kpi(root, 'o2')).toBe('7.30');
  });

  it('pulsar la MISMA placa otra vez devuelve todos', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    root.querySelector('[data-tras-placa="PBX-0392"]').click();
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    root.querySelector('[data-tras-placa="PBX-0392"]').click();
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(2);
  });

  it('«Todos» devuelve la vista completa', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    root.querySelector('[data-tras-placa="GSA-1147"]').click();
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    root.querySelector('[data-tras-placa="*"]').click();
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(2);
  });

  it('🔴 el chip marcado es el que se está viendo', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    // De inicio manda «Todos».
    expect(root.querySelector('[data-tras-placa="*"]').getAttribute('aria-pressed')).toBe('true');
    root.querySelector('[data-tras-placa="PBX-0392"]').click();
    expect(root.querySelector('[data-tras-placa="PBX-0392"]').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[data-tras-placa="GSA-1147"]').getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector('[data-tras-placa="*"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('🔴 NUNCA se puede llegar a cero camiones', () => {
    // Dejaría la vista sin nada que mirar y todos los KPIs en «—».
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    root.querySelector('[data-tras-placa="GSA-1147"]').click();
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    root.querySelector('[data-tras-placa="GSA-1147"]').click();
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    expect(kpi(root, 'o2')).toBe('7.30');
  });

  it('🔴 el filtro NO se hereda al cambiar de corrida', () => {
    const filas = aFilas(buildTrasladoPayload(viaje(2)));
    const root = montar(ctxCon(filas));
    root.querySelector('[data-tras-placa="PBX-0392"]').click();
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    const otro = montar(ctxCon(filas, '444'));   // otra corrida: ámbito distinto
    expect(txt(otro)).toContain('Todavía no hay traslados');
    const vuelta = montar(ctxCon(filas, '555'));
    expect(vuelta.querySelectorAll('.sv-tras-card'), 'el filtro se heredó').toHaveLength(2);
  });
});

describe('Traslado · los desgloses por parada', () => {
  const abrir = (root, k) => {
    root.querySelector(`[data-tras-modal="${k}"]`).click();
    return root.querySelector('#sv-tras-modal-b').textContent.replace(/\s+/g, ' ');
  };

  it('🔴 el desglose de O₂ trae una fila por parada y una columna por tina', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    root.querySelector('[data-tras-modal="o2"]').click();
    const tabla = root.querySelector('#sv-tras-modal-b table');
    expect(tabla).toBeTruthy();
    expect(tabla.querySelectorAll('tbody tr')).toHaveLength(4);          // 4 paradas
    expect(tabla.querySelectorAll('thead th')).toHaveLength(3 + 8 + 2);  // ctx + 8 tinas + media + Δ
    const c = abrir(root, 'o2');
    expect(c).toContain('7.6');   // parada 1
    expect(c).toContain('7.0');   // parada 4
  });

  it('el desglose de temperatura usa sus propios valores', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    const c = abrir(root, 'temp');
    expect(c).toContain('26.0');
    expect(c).toContain('23.0');
  });

  it('🔴 la actividad se desglosa por parada con su frecuencia', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    const c = abrir(root, 'act');
    expect(c).toContain('Alta');
    expect(c).toContain('dominante');
    // 8 tinas por parada: cada parada carga 8 en una sola categoría.
    expect(c).toContain('8');
  });

  it('🔴 las observaciones se desglosan por camión y parada', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2, [1])))));
    expect(kpi(root, 'obs')).toBe('2');       // una por camión
    const c = abrir(root, 'obs');
    expect(c).toContain('GSA-1147');
    expect(c).toContain('PBX-0392');
    expect(c).toContain('Parada 2');
    expect(c).toContain('Tracto digestivo');
  });

  it('sin observaciones el desglose lo dice en vez de salir vacío', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    expect(kpi(root, 'obs')).toBe('0');
    expect(abrir(root, 'obs')).toContain('Ninguna parada dejó observaciones');
  });

  it('🔴 el desglose respeta el filtro de placas', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2, [1])))));
    root.querySelector('[data-tras-placa="GSA-1147"]').click();   // sólo ese
    const c = abrir(root, 'obs');
    expect(c).toContain('GSA-1147');
    expect(c, 'el desglose enseñó un camión que el filtro dejó fuera').not.toContain('PBX-0392');
  });
});

describe('Traslado · un empate de actividad no se esconde', () => {
  it('🔴 con las cuatro categorías empatadas, el KPI lo dice', () => {
    // Pasa de verdad: un camión que se degrada parada a parada acaba con el mismo
    // número de «Alta» que de «Baja». Enseñar sólo «Alta» sería inventarse la
    // lectura, y justo lo que la regla de `actividadDe` prohíbe.
    const v = viaje(1);
    v.data.revisiones.forEach((r, i) => {
      const act = ['Alta', 'Normal', 'Media', 'Baja'][i];
      Object.values(r.camiones[0].tinas).forEach((t) => { t.act = act; });
    });
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(v))));
    expect(kpi(root, 'act')).toContain('empate');
    expect(root.querySelector('.sv-tras-mini').textContent).toContain('empate');
  });

  it('sin empate no aparece la coletilla', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    expect(kpi(root, 'act')).toBe('Alta');
  });
});

describe('Traslado · el modal usa las clases REALES del proyecto', () => {
  // Una clase inventada no da error en ningún sitio: el CSS simplemente no aplica.
  // La primera versión usó `sv-modal-box/-h/-t/-b`, que no existen, y la tarjeta
  // salía SIN FONDO: el desglose se leía encima de la vista. Se vigila contra el
  // CSS de verdad para que no vuelva a pasar en silencio.
  const CSS = readFileSync(join(process.cwd(), 'src/views/supervisor/supervisor.css'), 'utf8');

  it('🔴 cada clase de la vista Y del contenido de los modales existe en supervisor.css', () => {
    // ⚠ La primera versión sólo miraba la CÁSCARA del modal, y por eso no cazó que
    // el CONTENIDO usaba `sv-tbl`/`sv-tbl-wrap`, que tampoco existen (las reales son
    // `sv-table` y `sv-sie-wrap`). Ahora se abre cada desglose y se recorre todo.
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2, [1])))));
    const clases = new Set();
    const recoger = (el) => {
      el.classList.forEach((c) => clases.add(c));
      el.querySelectorAll('*').forEach((x) => x.classList.forEach((c) => clases.add(c)));
    };
    recoger(root);
    ['o2', 'temp', 'act', 'obs'].forEach((k) => {
      root.querySelector(`[data-tras-modal="${k}"]`).click();
      recoger(root.querySelector('#sv-tras-modal-b'));
    });
    expect(clases.size).toBeGreaterThan(20);
    clases.forEach((c) => {
      if (c.startsWith('leaflet')) return;          // vive en el CSS de Leaflet
      expect(CSS.includes('.' + c), `la clase «${c}» no tiene CSS: saldría sin estilo`).toBe(true);
    });
  });

  it('🔴 la tarjeta del modal tiene fondo propio, no transparente', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    expect(root.querySelector('#sv-tras-modal .sv-modal-card')).toBeTruthy();
    expect(root.querySelector('#sv-tras-modal .sv-modal-body')).toBeTruthy();
    expect(CSS).toMatch(/\.sv-modal-card\s*\{[^}]*background/);
  });

  it('🔴 el mapa queda por DEBAJO del modal', () => {
    // Leaflet coloca sus paneles en z-index 400-700 y el modal vive en 300, así que
    // sin un contexto de apilado propio el mapa se dibuja ENCIMA del desglose.
    expect(CSS).toMatch(/\.sv-tmap\s*\{[^}]*position:\s*relative/);
    expect(CSS).toMatch(/\.sv-tmap\s*\{[^}]*z-index:\s*0/);
  });
});

describe('Traslado · el desglose enriquecido de O₂ y temperatura', () => {
  const abrirTabla = (root, k) => {
    root.querySelector(`[data-tras-modal="${k}"]`).click();
    return root.querySelector('#sv-tras-modal-b');
  };

  it('🔴 cada medición lleva su nivel de semáforo', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    const b = abrirTabla(root, 'o2');
    const celdas = b.querySelectorAll('tbody .sv-hm');
    expect(celdas.length).toBe(4 * 8);                   // 4 paradas × 8 tinas
    celdas.forEach((c) => {
      expect(c.className, `celda sin nivel: ${c.className}`).toMatch(/sv-hm-[0-3]/);
    });
  });

  it('🔴 el O₂ más bajo del viaje se marca como alerta, y el más alto no', () => {
    // Escala relativa: el mínimo observado es el nivel 0.
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    const b = abrirTabla(root, 'o2');
    const filas = b.querySelectorAll('tbody tr');
    // Parada 1 = 7.6 (el máximo) · parada 4 = 7.0 (el mínimo)
    expect(filas[0].querySelector('.sv-hm').className).toContain('sv-hm-3');
    expect(filas[3].querySelector('.sv-hm').className).toContain('sv-hm-0');
  });

  it('🔴 el Δ compara con la parada anterior y la primera no lo inventa', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    const b = abrirTabla(root, 'o2');
    const ds = [...b.querySelectorAll('tbody .sv-hm-d')].map((e) => e.textContent.trim());
    expect(ds[0], 'la primera parada se inventó un Δ').toBe('—');
    expect(ds[1]).toContain('▼');
    expect(ds[1]).toContain('0.20');
  });

  it('🔴 el pie trae la media POR TINA y su recorrido', () => {
    // Es el «promedio por tina y carro» que se pidió y que no se estaba enseñando.
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    const b = abrirTabla(root, 'o2');
    const pie = b.querySelectorAll('tfoot tr');
    expect(pie).toHaveLength(2);
    expect(pie[0].textContent).toContain('Media por tina');
    expect(pie[1].textContent).toContain('Recorrido');
    expect(pie[0].querySelectorAll('td')).toHaveLength(8);
  });

  it('🔴 la tina más inestable se señala', () => {
    const filas = aFilas(buildTrasladoPayload(viaje(1)));
    // Se hunde la tina 6 en la última parada: media casi igual, recorrido disparado.
    filas.forEach((f) => { if (f['Tina'] === 6 && f['Revisión'] === 4) f['Oxígeno (mg/L)'] = 3.0; });
    const root = montar(ctxCon(filas));
    const b = abrirTabla(root, 'o2');
    expect(b.textContent).toContain('tina más inestable');
    expect(b.textContent).toContain('T6');
    expect(b.querySelector('.sv-hm-ojo'), 'no se marcó la tina inestable').toBeTruthy();
  });

  it('🔴 en TEMPERATURA se marcan los dos extremos, no sólo el bajo', () => {
    const filas = aFilas(buildTrasladoPayload(viaje(1)));
    // Una tina se calienta mucho: con la dirección del oxígeno saldría «verde».
    filas.forEach((f) => { if (f['Tina'] === 3 && f['Revisión'] === 1) f['Temperatura (°C)'] = 33; });
    const root = montar(ctxCon(filas));
    const b = abrirTabla(root, 'temp');
    const celda = b.querySelector('tbody tr td:nth-child(6)');   // parada 1, tina 3
    expect(celda.textContent.trim()).toBe('33.0');
    expect(celda.className, 'la tina más caliente salió como buena').toContain('sv-hm-0');
  });

  it('la leyenda explica que la escala es del propio viaje', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    expect(abrirTabla(root, 'o2').textContent).toContain('relativa a este viaje');
    expect(abrirTabla(root, 'temp').textContent).toContain('los dos extremos');
  });

  it('el rango del viaje se muestra en la cabecera del bloque', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    expect(abrirTabla(root, 'o2').textContent).toContain('rango del viaje');
  });
});
