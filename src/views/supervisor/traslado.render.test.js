// @vitest-environment happy-dom
/* ============================================================
   SUPERVISOR · Traslado — la vista montada

   Renderiza la sub-vista de verdad y la maneja como el supervisor: filtra placas,
   abre los desgloses y comprueba que lo que se lee en pantalla es lo que dicen los
   datos. La agregación se prueba aparte, en `traslado.data.test.js`.
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildTrasladoPayload } from '../registros/lib/ficha-traslado.schema.js';
import { readFileSync, readdirSync } from 'node:fs';
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
  const LUGARES = ['Laboratorio', 'Peaje 1', 'Gabarra 1', 'Camaronera'];
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

/* Elegir camión. Desde el 2026-08-27 el filtro es un `<select>` y no pastillas:
   cadena vacía = todos. El `change` mueve el estado y pide el repintado pulsando el
   testigo oculto, que es lo que el enrutador del Supervisor sabe escuchar. */
const elegirCamion = (root, placa) => {
  const sel = root.querySelector('[data-tras-placa-sel]');
  sel.value = placa;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
};
const camionElegido = (root) => root.querySelector('[data-tras-placa-sel]').value;

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
    elegirCamion(root, 'PBX-0392');
    const placas = [...root.querySelectorAll('.sv-tras-placa')].map((e) => e.textContent).join(' ');
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    expect(placas).toContain('PBX-0392');
    expect(placas).not.toContain('GSA-1147');
  });

  it('🔴 y los KPIs pasan a hablar de ESE camión', () => {
    // Si el KPI siguiera dando el promedio de los dos, el filtro mentiría.
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    expect(kpi(root, 'o2')).toBe('7.05');                 // los dos
    elegirCamion(root, 'PBX-0392');
    expect(kpi(root, 'o2'), 'el KPI no se recalculó').toBe('6.80');
    elegirCamion(root, 'GSA-1147');
    expect(kpi(root, 'o2')).toBe('7.30');
  });

  it('🔴 el selector NO alterna: elegir el mismo camión lo MANTIENE', () => {
    /* Con pastillas, volver a pulsar la misma placa devolvía todos. Un `<select>`
       no funciona así —ni debe—: lo que elige es lo que se ve, y para volver a
       todos está la opción «Todos». Se fija aquí porque es un cambio de conducta
       deliberado (usuario, 2026-08-27) y no un descuido. */
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    elegirCamion(root, 'PBX-0392');
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    elegirCamion(root, 'PBX-0392');
    expect(root.querySelectorAll('.sv-tras-card'), 'el selector alternó').toHaveLength(1);
    expect(camionElegido(root)).toBe('PBX-0392');
  });

  it('«Todos» devuelve la vista completa', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    elegirCamion(root, 'GSA-1147');
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    elegirCamion(root, '');
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(2);
  });

  it('🔴 la opción seleccionada es la que se está viendo', () => {
    /* Un select que enseñara «Todos» mientras la vista tiene un solo camión sería
       peor que no tener filtro: el supervisor creería estar viendo el viaje entero. */
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2)))));
    expect(camionElegido(root), 'de inicio manda «Todos»').toBe('');
    elegirCamion(root, 'PBX-0392');
    expect(camionElegido(root)).toBe('PBX-0392');
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
  });

  it('🔴 NUNCA se puede llegar a cero camiones', () => {
    // Dejaría la vista sin nada que mirar y todos los KPIs en «—».
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    elegirCamion(root, 'GSA-1147');
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    elegirCamion(root, '');
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(1);
    expect(kpi(root, 'o2')).toBe('7.30');
  });

  it('🔴 el filtro NO se hereda al cambiar de corrida', () => {
    const filas = aFilas(buildTrasladoPayload(viaje(2)));
    const root = montar(ctxCon(filas));
    elegirCamion(root, 'PBX-0392');
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

  it('🔴 una observación del viaje NO se cuenta una vez por camión', () => {
    /* Una observación es de la PARADA (`grain: 'revision'` en el esquema) y
       `buildTrasladoPayload` escribe el mismo texto en las filas de TODOS los
       camiones de esa parada. Este fixture es un viaje con DOS camiones y UNA sola
       observación: contándolas por camión el KPI decía «2» y el desglose repetía
       la misma frase, así que el supervisor leía dos incidencias donde hubo una.
       ⚠ Hasta el 2026-08-26 esta prueba EXIGÍA el «2» —fijaba el defecto como si
       fuera la regla—, y por eso nadie lo vio. */
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2, [1])))));
    expect(kpi(root, 'obs'), 'una observación y dos camiones: el KPI es 1').toBe('1');
    const c = abrir(root, 'obs');
    // El desglose sigue diciendo QUIÉN llevaba el viaje…
    expect(c).toContain('GSA-1147');
    expect(c).toContain('PBX-0392');
    expect(c).toContain('Parada 2');
    // …pero la observación se enseña UNA vez. Ésta es la aserción que vigila la
    // regla: el `toContain` de arriba pasaba igual con el texto duplicado.
    expect(c.split('Tracto digestivo').length - 1,
      'la misma observación no puede salir dos veces').toBe(1);
  });

  it('🔴 dos viajes distintos SÍ suman sus observaciones', () => {
    // La deduplicación no puede pasarse de lista: la parada 2 de un viaje y la
    // parada 2 de otro son dos incidencias distintas aunque compartan número.
    const segundo = viaje(2, [1]);
    segundo.id = 'tv2';
    segundo.data.fecha = '2026-08-28';
    segundo.data.revisiones[1].obs = 'Espuma en la tina 3.';
    const root = montar(ctxCon(
      aFilas(buildTrasladoPayload(viaje(2, [1])))
        .concat(aFilas(buildTrasladoPayload(segundo))),
    ));
    /* Desde que hay UNA SECCIÓN POR VIAJE, cada uno lleva su propio KPI: no hay un
       número global que sumar. Lo que se comprueba es que salgan DOS secciones y
       que cada una cuente SÓLO la suya — antes los dos viajes caían en la misma
       tarjeta y uno tapaba al otro. */
    /* Desde el índice (2026-08-27) el conteo de cada viaje vive en SU FILA; en
       pantalla sólo hay un KPI de observaciones, el del viaje abierto. La regla que
       se vigila no cambia: cada viaje cuenta LA SUYA y no la del otro. */
    const obsPorFila = [...root.querySelectorAll('[data-tras-viajesel]')]
      .map((tr) => tr.children[8].textContent.trim());
    expect(obsPorFila, 'cada viaje cuenta sólo su observación').toEqual(['1', '1']);

    // Y el desglose de cada viaje enseña la observación de ESE viaje, no la del otro.
    root.querySelector('[data-tras-modal="obs"]').click();
    const c1 = root.querySelector('#sv-tras-modal-b').textContent;
    root.querySelectorAll('[data-tras-viajesel]')[1].click();
    const root2 = montar(ctxCon(
      aFilas(buildTrasladoPayload(viaje(2, [1])))
        .concat(aFilas(buildTrasladoPayload(segundo))),
    ));
    root2.querySelector('[data-tras-modal="obs"]').click();
    const c2 = root2.querySelector('#sv-tras-modal-b').textContent;
    expect(c1).toContain('Tracto digestivo');
    expect(c1).not.toContain('Espuma en la tina 3');
    expect(c2).toContain('Espuma en la tina 3');
    expect(c2).not.toContain('Tracto digestivo');
  });

  it('sin observaciones el desglose lo dice en vez de salir vacío', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    expect(kpi(root, 'obs')).toBe('0');
    expect(abrir(root, 'obs')).toContain('Ninguna parada dejó observaciones');
  });

  it('🔴 el desglose respeta el filtro de placas', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2, [1])))));
    elegirCamion(root, 'GSA-1147');   // sólo ese
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
    // ⚠ Los desgloses se enumeran DESDE EL DOM, no a mano. La lista escrita a mano
    //   decía [o2, temp, act, obs] y se quedó atrás en cuanto se añadió el KPI de
    //   tiempo: su contenido no lo miraba nadie, que es justo el agujero por el que
    //   ya se colaron tres clases inventadas en esta vista.
    const desgloses = [...root.querySelectorAll('[data-tras-modal]')]
      .map((el) => el.dataset.trasModal);
    expect(desgloses, 'la vista dejó de tener KPIs con desglose').toContain('tiempo');
    desgloses.forEach((k) => {
      root.querySelector(`[data-tras-modal="${k}"]`).click();
      const cuerpo = root.querySelector('#sv-tras-modal-b');
      expect(cuerpo.textContent.trim(), `el desglose «${k}» se abrió vacío`).not.toBe('');
      recoger(cuerpo);
    });
    expect(clases.size).toBeGreaterThan(20);
    clases.forEach((c) => {
      if (c.startsWith('leaflet')) return;          // vive en el CSS de Leaflet
      expect(CSS.includes('.' + c), `la clase «${c}» no tiene CSS: saldría sin estilo`).toBe(true);
    });
  });

  it('🔴 las superficies de Traslado salen del TEMA, no de un hex escrito a mano', () => {
    /* El bloque nació con la paleta clara a mano —138 hex contra 4 tokens— mientras
       la app SÍ tiene conmutador de tema oscuro (`shell.js`): en oscuro la vista se
       quedaba clara. Ahora los NEUTROS (fondo, borde, texto) salen de tokens.

       Lo que sigue en hex es deliberado y no entra aquí: la marca (el teal), la
       paleta de semáforo (verdes, ámbares, rojos), los valores dentro de reglas
       `[data-theme="dark"]`, y el `color:#fff` de los chips —ahí el blanco es «texto
       sobre el acento» y tokenizarlo daría texto oscuro sobre teal—. */
    const bloque = CSS.slice(CSS.indexOf('TRASLADO EN RUTA (sub-vista de Despacho)'));
    expect(bloque.length, 'no se localizó el bloque de Traslado').toBeGreaterThan(1000);

    // Se miran sólo las reglas que NO son de tema oscuro.
    const normales = bloque.split(/(?=[^{}]*\{)/).filter((r) => !r.includes('[data-theme="dark"]')).join('');
    const claros = [
      ['background:#fff', 'fondo blanco fijo'],
      ['background:#f8fafc', 'superficie clara fija'],
      ['background:#f1f5f9', 'superficie clara fija'],
      ['#e2e8f0', 'borde claro fijo'],
      ['color:#0f172a', 'texto oscuro fijo'],
      ['color:#64748b', 'texto secundario fijo'],
    ];
    /* ⚠ Coincidencia con LÍMITE de color, no `includes`: «background:#fff» es
       subcadena de «#fffbeb» y «#fff7ed» —dos ámbares del semáforo— y a secas los
       señalaba como paleta clara colada. Basta mirar el carácter SIGUIENTE: si es
       hexadecimal, el color era más largo y no es el que se busca. */
    const coladoEn = (h) => {
      let i = normales.indexOf(h);
      while (i !== -1) {
        if (!/[0-9a-fA-F]/.test(normales[i + h.length] || '')) return true;
        i = normales.indexOf(h, i + 1);
      }
      return false;
    };
    const colados = claros.filter(([h]) => coladoEn(h));
    expect(colados.map(([h, q]) => h + ' (' + q + ')'),
      'volvió a colarse la paleta clara escrita a mano: en tema oscuro no cambiará').toEqual([]);

    // Y la guarda de que esto prueba algo: el bloque tiene que USAR tokens de verdad.
    expect((bloque.match(/var\(--c-(surface|border|text)/g) || []).length,
      'el bloque dejó de usar tokens: la comprobación de arriba pasaría sola').toBeGreaterThan(40);
  });
  it('🔴 toda variable CSS usada existe en tokens.css', () => {
    // Una variable inventada NO da error: cae al valor de respaldo y el estilo se
    // queda congelado en claro, así que el tema oscuro deja de aplicarle. Es la
    // misma trampa que las clases inventadas, y ya pasó con `--c-soft` y `--bdr`
    // (las reales son `--c-surface-2` y `--c-border-soft`).
    const TOKENS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    // Una variable puede venir de DOS sitios legítimos: del tema, o puesta en línea
    // por el propio JS de la vista (style="--pc:${color}", que es como se pintan las
    // píldoras y los medidores). Cualquier otro nombre está inventado.
    const dirJs = join(process.cwd(), 'src/views/supervisor');
    const JS = readdirSync(dirJs)
      .filter((f) => f.endsWith('.js') && !f.includes('.test.'))
      .map((f) => readFileSync(join(dirJs, f), 'utf8')).join('');
    const usadas = [...new Set((CSS.match(/var\(--[a-z0-9-]+/g) || []).map((v) => v.slice(4)))];
    expect(usadas.length, 'no se leyó ninguna variable: el guardián no probaría nada')
      .toBeGreaterThan(10);
    usadas.forEach((v) => {
      const viva = TOKENS.includes(v + ':') || JS.includes(v + ':');
      expect(viva, `la variable «${v}» no está en tokens.css ni la pone el JS: su`
        + ' respaldo escrito a mano se congela y el tema oscuro deja de aplicarle')
        .toBe(true);
    });
  });

  it('🔴 el contenido del modal LLENA la tarjeta, no se queda a la izquierda', () => {
    // La revisión visual del 2026-08-25 encontró media tarjeta en blanco: la tabla
    // se quedaba a su ancho natural. happy-dom no calcula diseño, así que aquí se
    // fija la DECISIÓN de CSS que lo evita; el hueco sólo se ve en pantalla.
    const regla = (sel) => (CSS.split(sel)[1] || '').split('}')[0];
    expect(regla('#sv-tras-modal .sv-tras-tbl'), 'la tabla dejó de llenar el ancho')
      .toContain('min-width:100%');
    expect(regla('#sv-tras-modal .sv-sie-wrap'), 'la envoltura volvió a encogerse')
      .toContain('display:block');
    expect(regla('#sv-tras-modal .sv-tras-mcard'), 'la tarjeta volvió a un ancho según contenido')
      .toContain('width:min(');
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

describe('Traslado · el KPI de tiempo en la cabecera', () => {
  it('enseña el tiempo en ruta y, debajo, el puerta a puerta', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    const el = root.querySelector('[data-tras-modal="tiempo"]');
    expect(el, 'no hay KPI de tiempo').toBeTruthy();
    // El fixture va de 20:30 a 01:00 en cuatro paradas.
    expect(el.querySelector('.sv-kpi-value').textContent.trim()).toBe('4 h 30 min');
    expect(el.querySelector('.sv-kpi-sub').textContent).toContain('puerta a puerta');
  });

  it('🔴 el KPI habla de lo que el filtro deja ver', () => {
    // ⚠ Un fixture con los dos camiones parando a la MISMA hora no prueba nada: el
    //   número sale igual mirando a los visibles o a todos. Aquí el segundo camión
    //   se quedó sin registrar las dos últimas paradas —pasa cuando se avería el
    //   oxigenómetro a mitad de ruta—, así que su tiempo SÍ es distinto.
    const filas = aFilas(buildTrasladoPayload(viaje(2)))
      .filter((f) => !(f.Placa === 'PBX-0392' && Number(f['Revisión']) > 2));
    const root = montar(ctxCon(filas));
    expect(root.querySelector('[data-tras-modal="tiempo"] .sv-kpi-value').textContent.trim())
      .toBe('4 h 30 min');
    elegirCamion(root, 'PBX-0392');
    expect(root.querySelector('[data-tras-modal="tiempo"] .sv-kpi-value').textContent.trim(),
      'el KPI siguió hablando del camión escondido').toBe('1 h 30 min');
  });

  it('el desglose enumera los tramos y marca el que se pasa de cadencia', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(1)))));
    root.querySelector('[data-tras-modal="tiempo"]').click();
    const cuerpo = root.querySelector('#sv-tras-modal-b');
    const txt = cuerpo.textContent.replace(/\s+/g, ' ');
    expect(txt).toContain('En ruta');
    expect(txt).toContain('Puerta a puerta');
    // Cuatro paradas: la primera sin tramo, tres con tiempo.
    expect(cuerpo.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(4);
    // 23:30 → 01:00 son 90 min: dentro. 20:30→22:00 son 90. Ninguno se pasa de 120.
    expect(cuerpo.querySelectorAll('.sv-t-excede').length).toBe(0);
  });
});

describe('Traslado · una sección por VIAJE', () => {
  /* El defecto que esto cierra: la vista trataba todo lo visible como UN traslado.
     Los KPI de medición mezclaban los viajes de la corrida, y el de tiempo ni
     siquiera mezclaba — `paradasDelViaje` deduplica por número de parada, así que
     enseñaba el PRIMER viaje y el resto desaparecía. Medido: un segundo viaje de
     10 h se anunciaba como 4 h. */
  function dosViajes() {
    const v1 = viaje(1, []);
    v1.data.horaSalida = '20:00';
    v1.data.horaLlegada = '00:00';
    ['20:00', '21:00', '22:00', '00:00'].forEach((h, i) => { v1.data.revisiones[i].hora = h; });

    const v2 = viaje(1, []);
    v2.id = 'tvLARGO';
    v2.data.fecha = '2026-08-28';
    v2.data.camaronera = 'Taura';
    v2.data.horaSalida = '20:00';
    v2.data.horaLlegada = '06:00';
    ['20:00', '23:00', '02:00', '06:00'].forEach((h, i) => { v2.data.revisiones[i].hora = h; });
    return aFilas(buildTrasladoPayload(v1)).concat(aFilas(buildTrasladoPayload(v2)));
  }

  /* ⚠⚠ DÓNDE VIVE AHORA LA SEÑAL. Hasta el 2026-08-27 el tablero pintaba una
     SECCIÓN entera por viaje y estas pruebas contaban secciones y mapas. Con el
     índice, la separación entre viajes se demuestra en las FILAS de la tabla: si
     `viajesDe` volviera a fundirlos, saldría UNA fila en vez de dos. Contar
     secciones ya no probaría nada —siempre hay una, la del viaje abierto—, así que
     la aserción se mudó con la señal. */
  const filasIdx = (root) => [...root.querySelectorAll('[data-tras-viajesel]')];

  it('🔴 cada viaje enseña SU tiempo, no el del primero', () => {
    const root = montar(ctxCon(dosViajes()));
    // v1: 20:00→00:00 son 4 h en ruta. v2: 20:00→06:00 son 10 h.
    const enRuta = filasIdx(root).map((tr) => tr.children[4].textContent.trim());
    /* Sin marca de cadencia en la fila (usuario, 2026-08-27): el aviso de los 120 min
       sigue vivo donde hace falta —el desglose de Tiempo y la ficha de captura—, pero
       la tabla es de consulta y el ⚠ la ensuciaba. */
    expect(enRuta, 'el segundo viaje tiene que traer SU tiempo').toEqual(['4 h', '10 h']);
    expect(filasIdx(root)[1].className, 'volvió la marca de cadencia a la fila')
      .not.toContain('sv-t-excede');

    // Y el KPI del detalle habla del viaje ABIERTO, que es el primero por defecto.
    const kpi = root.querySelector('[data-tras-modal="tiempo"] .sv-kpi-value').textContent.trim();
    expect(kpi, 'el KPI del detalle no es el del viaje abierto').toBe('4 h');
  });

  it('🔴 el índice trae una fila por viaje, con su fecha y su destino', () => {
    const root = montar(ctxCon(dosViajes()));
    expect(filasIdx(root), 'los dos viajes tienen que salir por separado').toHaveLength(2);
    const t = txt(root);
    expect(t).toContain('Puná 1');
    expect(t).toContain('Taura');
    expect(t).toContain('2026-08-28');
  });

  it('🔴 al elegir otro viaje, el detalle pasa a ser SUYO', () => {
    /* Es la prueba que sostiene todo el layout: si el clic no cambiara el detalle,
       el índice sería decorativo y el supervisor vería siempre el primer viaje
       creyendo que mira el segundo. */
    const root = montar(ctxCon(dosViajes()));
    expect(txt(root.querySelector('.sv-tras-viaje-t'))).toContain('Puná 1');
    filasIdx(root)[1].click();
    const root2 = montar(ctxCon(dosViajes()));   // el clic repinta la vista
    expect(txt(root2.querySelector('.sv-tras-viaje-t')), 'el detalle no siguió al índice')
      .toContain('Taura');
    expect(root2.querySelector('[data-tras-viajesel][aria-pressed="true"]')
      .textContent, 'la fila elegida no quedó marcada').toContain('2026-08-28');
  });

  it('🔴 se monta UN solo mapa, el del viaje abierto', () => {
    // Antes se instanciaba un Leaflet por viaje de la corrida —420 px y una
    // instancia viva cada uno— aunque el supervisor sólo mirase uno.
    const root = montar(ctxCon(dosViajes()));
    expect(root.querySelectorAll('[data-tras-mapa]')).toHaveLength(1);
  });

  it('🔴 el desglose de Tiempo ofrece el PDF del viaje, y el modal sigue entero', () => {
    /* Lo que se vigila NO es que el PDF salga bien —eso lo hace `trasladoPdf.test.js`—
       sino que añadirlo no se haya llevado por delante el modal: el desglose de
       tiempo tiene que seguir enseñando sus tramos, y el botón tiene que estar
       cableado a un viaje concreto. Un botón que se pinta pero no se cablea se ve
       exactamente igual que uno que funciona. */
    const root = montar(ctxCon(dosViajes()));
    root.querySelector('[data-tras-modal="tiempo"]').click();
    const cuerpo = root.querySelector('#sv-tras-modal-b');
    expect(cuerpo.textContent, 'el desglose de tiempo perdió sus tramos').toContain('En ruta');
    const b = cuerpo.querySelector('[data-tras-pdf]');
    expect(b, 'no hay botón de PDF en el desglose de tiempo').toBeTruthy();
    expect(b.disabled, 'el botón nació deshabilitado: no se identificó el viaje').toBe(false);

    // Los OTROS desgloses no lo llevan: el PDF es del viaje y se pide desde el tiempo.
    ['o2', 'temp', 'act', 'obs'].forEach((k) => {
      root.querySelector(`[data-tras-modal="${k}"]`).click();
      expect(root.querySelector('#sv-tras-modal-b [data-tras-pdf]'),
        `el desglose «${k}» no debería ofrecer el PDF`).toBeNull();
    });
  });

  it('con UN viaje no hay índice: la vista es la de siempre', () => {
    const root = montar(ctxCon(aFilas(buildTrasladoPayload(viaje(2, [1])))));
    expect(root.querySelectorAll('.sv-tras-idx'), 'un índice de una fila es ruido').toHaveLength(0);
    expect(root.querySelectorAll('.sv-tras-viaje')).toHaveLength(1);
    expect(root.querySelectorAll('[data-tras-mapa]')).toHaveLength(1);
    // Y sus dos camiones siguen siendo dos tarjetas dentro de esa sección.
    expect(root.querySelectorAll('.sv-tras-card')).toHaveLength(2);
  });
});
