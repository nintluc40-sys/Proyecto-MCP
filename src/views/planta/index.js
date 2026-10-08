/* ============================================================
   PLANTA · vista 🏭 (rol Gerencia) — tablero de producción sobre la maqueta 3D del laboratorio
   Tanda 1 (2026-10-04): el marco de la vista y la maqueta del Laboratorio Mar Bravo.
   Tanda 2 (2026-10-04): el estado de producción de cada tanque de larvicultura (planta/estado.js).
   Tanda 3 (2026-10-04): y el de cada sala y tanque de maduración (estadoMaduracion, del mismo archivo).
   Tanda 4 (2026-10-04): las cifras de gerencia (planta/cifras.js): producción del mes frente a la meta, supervivencia,
   nauplios y desoves. Las tres partes se calculan por separado: si una falla, las otras se siguen viendo.
   Acceso de Gerencia (2026-10-05): «Compartir acceso» abre, en otra pestaña, la página del QR 3D (qr/index.js, ?qr=gerencia).
   Selector de mes (2026-10-04, usuario): el mes elegido mueve TODA la vista. El en curso es hoy; uno pasado pinta cada
   módulo con su corrida de ese mes (como las tarjetas del Supervisor) y maduración al cierre de su mes de calendario.
   Mes sin congelar (2026-10-05, usuario, velocidad · 2): lo calculado de cada mes visitado se guarda mientras el libro y
   el día no cambien, y volver a él no recalcula; las filas de cada módulo se agrupan una vez (estado.js).
   La vista se monta SIN esperar al libro (`necesitaLibro: false`): la maqueta sale al instante, pide
   el libro si no está y pinta los estados al llegar; en cada refresco (EV.DATA) sólo vuelve a pintar
   los colores (`repintaConDatos: false`: rehacer la escena perdería la cámara).
   📊 Análisis (T1, 2026-10-05, usuario): un selector «🏭 Maqueta | 📊 Análisis» arriba elige entre la maqueta y una
   página analítica sin 3D (planta/analisis.js) con los mismos datos y textos (planta/textos.js); el equipo recuerda la
   elección. La escena (three.js, planta/escena.js) llega en su PROPIO bloque diferido, que sólo se pide en Maqueta: ni
   el resto de la app ni Análisis cargan three.js (y, como sólo se llega a ellos por esta vista, quedan fuera de la
   precarga del service worker: vite.config.js · ENTRADAS_FUERA_DE_PRECACHE).
   Los marcos son estáticos (no llevan contenido dinámico); lo que cambia lo escriben escena.js y analisis.js con
   textContent.
   ============================================================ */
import './planta.css';
import { esc } from '../../core/format.js';
import { store, on, EV } from '../../core/store.js';
import { asegurarLibro } from '../../core/refresh.js';
import { estadoPlantaPorPartes, estadoMaduracion, cronogramaPlanta, hoyLocal } from './estado.js';
import { cifrasGerencia } from './cifras.js';

/** Cede el turno al navegador (pinta y atiende toques) y sigue enseguida. Por MessageChannel y no por setTimeout: con la
 *  pestaña en segundo plano los temporizadores se espacian a 1 s y el cálculo por partes tardaría segundos de más. */
const ceder = () => new Promise((seguir) => {
  if (typeof MessageChannel === 'undefined') { setTimeout(seguir, 0); return; }
  const c = new MessageChannel();
  c.port1.onmessage = () => { c.port1.close(); seguir(); };
  c.port2.postMessage(0);
});

const MAQUETA = `
<div class="planta">
  <main class="viewport" id="vp">
    <canvas id="c" tabindex="0" aria-label="Maqueta 3D del laboratorio"></canvas>
    <div class="labels" id="labels"></div>
    <div class="tip" id="tip" hidden></div>
    <div class="views"><button type="button" id="v-iso">Vista general</button><button type="button" id="v-back">Desde atrás</button><button type="button" id="v-top">Planta</button><button type="button" id="v-full" aria-pressed="false">⛶ Pantalla completa</button></div>
    <p class="resumen-fs" id="resumen-fs" role="status" hidden></p>
    <div class="compass" aria-hidden="true"><div class="needle" id="needle"><b>N</b><i></i></div></div>
    <section class="card" id="card" hidden aria-live="polite">
      <header><div><div class="kind" id="card-kind"></div><h3 id="card-name"></h3></div><button type="button" id="card-close">Cerrar</button></header>
      <dl id="card-dl"></dl>
    </section>
    <p class="hintline">Arrastra para girar · rueda o pellizco para acercar · toca un módulo o un tanque</p>
  </main>
  <aside class="panel" aria-label="Resumen del laboratorio">
    <header>
      <h1>Laboratorio Mar Bravo</h1>
      <p class="lede">El estado de hoy de cada módulo de larvicultura y de cada sala de maduración.</p>
      <p class="datos" id="estado-datos" role="status">Cargando datos de producción…</p>
      <a class="compartir" href="./?qr=gerencia" target="_blank" rel="noopener">🔗 Compartir acceso de Gerencia (QR)</a>
    </header>
    <section class="prod" aria-label="Producción del mes">
      <div class="prod-head"><h2>Producción del mes</h2><button type="button" class="meta-btn" id="meta-btn" aria-expanded="false" aria-controls="meta-form">⚙ Meta</button></div>
      <form class="meta-form" id="meta-form" hidden>
        <label for="meta-in">Meta del mes, en millones de larvas</label>
        <div class="meta-row"><input id="meta-in" type="number" min="1" step="1" inputmode="numeric" required><button type="submit">Guardar</button><button type="button" id="meta-reset">Volver a 400</button></div>
        <small>Se guarda sólo en este equipo.</small>
      </form>
      <div class="prod-nav">
        <button type="button" class="mes-btn" id="mes-prev" aria-label="Mes anterior" disabled>◀</button>
        <div class="prod-mes"><b id="prod-mes">—</b><span id="prod-cor"></span></div>
        <button type="button" class="mes-btn" id="mes-next" aria-label="Mes siguiente" disabled>▶</button>
      </div>
      <input type="range" class="mes-slider" id="mes-slider" min="0" max="0" value="0" step="1" aria-label="Mes de producción" hidden>
      <div class="prod-big"><b id="prod-total">—</b><span id="prod-meta"></span><em id="prod-pct"></em></div>
      <div class="prod-bar" id="prod-bar" role="img" aria-label="Producción del mes frente a la meta"><i class="d" id="prod-bar-d"></i><i class="c" id="prod-bar-c"></i><span class="goal" id="prod-goal"></span></div>
      <div class="prod-split"><span><i class="d"></i><span id="prod-desp">—</span></span><span><i class="c"></i><span id="prod-cult">—</span></span></div>
      <div class="prod-mini">
        <div><b id="prod-sv">—</b><span>supervivencia del mes</span></div>
        <div><b id="prod-n5">—</b><span id="prod-n5-sub">nauplios N5</span></div>
        <div><b id="prod-des">—</b><span>desoves</span></div>
      </div>
      <small class="prod-nota" id="prod-nota"></small>
    </section>
    <section class="n5" id="n5" aria-label="Nauplios N5 de maduración"></section>
    <section class="atender" aria-label="Qué atender hoy"><h2 id="atender-h">Qué atender hoy</h2><ul class="at-list" id="atender"></ul></section>
    <div class="stats" id="stats"></div>
    <section aria-label="Hora del día"><h2>Hora del día</h2>
      <div class="seg" id="tod"><button type="button" data-t="day" aria-pressed="true">Día</button><button type="button" data-t="dusk" aria-pressed="false">Tarde</button><button type="button" data-t="night" aria-pressed="false">Noche</button></div>
    </section>
    <section><h2>Larvicultura</h2><ul class="list" id="list-larv"></ul></section>
    <section aria-label="Leyenda"><h2>Colores</h2><div class="legend" id="legend"></div></section>
    <section><h2>Maduración</h2><ul class="list" id="list-mat"></ul></section>
    <section class="repro" aria-label="Reproductores: días en producción"><h2 id="repro-h">Reproductores · días en producción</h2><ul class="repro-list" id="repro"></ul></section>
    <section class="toggles" aria-label="Capas">
      <h2>Capas</h2>
      <label><input type="checkbox" id="t-roof" checked> Techos (se abren al elegir un módulo)</label>
      <label><input type="checkbox" id="t-other" checked> Otras áreas del laboratorio</label>
      <label><input type="checkbox" id="t-life" checked> Personas, vehículos y aves</label>
      <label><input type="checkbox" id="t-labels" checked> Nombres de módulos y salas</label>
    </section>
  </aside>
</div>`;

/* El selector «🏭 Maqueta | 📊 Análisis» (T1 de Análisis, 2026-10-05, usuario): la maqueta (escena.js, con three.js) o la
   página analítica sin 3D (analisis.js). Las dos reciben lo MISMO —el mes elegido, la memoria por mes, los avisos— por la
   misma interfaz ({ pintarEstado, aviso, alElegirMes }), y el equipo recuerda la última elección (planta_modo). Cada una
   se carga sólo al elegirla: en Análisis no se descarga three.js. */
const MODO_KEY = 'planta_modo';
const leerModo = () => { try { return localStorage.getItem(MODO_KEY) === 'analisis' ? 'analisis' : 'maqueta'; } catch (_) { return 'maqueta'; } };
const guardarModo = (m) => { try { localStorage.setItem(MODO_KEY, m); } catch (_) { /* sin almacenamiento: sólo en esta sesión */ } };
const MARCO = `
<div class="planta-vista">
  <div class="planta-modos" role="group" aria-label="Cómo ver la planta"><button type="button" data-modo="maqueta" aria-pressed="false">🏭 Maqueta</button><button type="button" data-modo="analisis" aria-pressed="false">📊 Análisis</button></div>
  <div class="planta-cuerpo"></div>
  <div class="planta-nuevos" role="status" hidden><span></span><button type="button">🔄 Actualizar</button></div>
</div>`;
/* Datos nuevos: avisar y actualizar al tocar (2026-10-07, usuario). Antes cada refresco (los 5 min, ⟳, volver a la app)
   recalculaba y repintaba la vista sola: en un celular eran ~4 s de pantalla congelada (medido con CPU ×4) en mitad de
   lo que se estaba mirando. Ahora, con datos a la vista, lo nuevo sólo se ANUNCIA; se recalcula al tocar «Actualizar»
   (o al cambiar de mes, que ya obliga a recalcular), y el desplazamiento —la página y las cajas con scroll propio— se
   guarda antes y se repone después. Se pinta solo: lo primero que llega, un cálculo ya en marcha (se rehace con lo
   último) y, al abrir con el libro GUARDADO del equipo (puede tener días), su puesta al día si la vista aún no se usó. */
const DESPLAZABLES = '.panel, .an-tabla-caja, .an-plano-caja';

/** Pinta la vista con el modo que el equipo eligió la última vez. Sin WebGL, la maqueta avisa y Análisis sigue a mano. */
export function plantaView(root) {
  root.innerHTML = MARCO;
  const marco = root.querySelector('.planta-vista'), cuerpo = marco.querySelector('.planta-cuerpo');
  let vista = null, modo = null, turno = 0;
  // El mes elegido: null = el último con datos (sigue al mes en curso); al elegir uno anterior se conserva en cada
  // actualización de datos, como en la tabla Producción Omarsa. Mueve toda la vista, no sólo la tarjeta. Lo comparten
  // los dos modos: cambiar de Maqueta a Análisis sigue en el mismo mes.
  let mesElegido = null;
  // Memoria por mes (velocidad · 2, 2026-10-05, usuario): lo calculado de cada mes ya visitado se guarda mientras el
  // libro (`store.globalData`, que cada refresco reemplaza entero) y el día sean los mismos —la clave de las demás
  // memorias del proyecto—, y volver a él no recalcula. Con un fallo no se guarda: se reintenta en el próximo pintado.
  let memo = { datos: null, hoy: '', meses: new Map() };
  // Por partes (2026-10-06, usuario, punto 5): al llegar datos el cálculo entero eran ~0,9 s seguidos en escritorio (×4 en
  // un celular) sin que la pantalla respondiera. Ahora cede el turno entre producción, cada módulo de larvicultura,
  // maduración y cronograma (tareas de ≤ ~0,2 s), y pinta al acabar. Mismo resultado que de una vez.
  const calcularMes = async (hoy, mes) => {
    const fallos = [];
    let larv = null, mad = null, cifras = null, crono = null;
    await ceder();
    try { cifras = cifrasGerencia(store.globalData, hoy, mes); } catch (e) { console.error('[planta] cifras', e); fallos.push('producción del mes (' + e.message + ')'); }
    const pasado = cifras && !cifras.actual ? cifras : null;   // sin cifras, hoy
    try { larv = await estadoPlantaPorPartes(pasado ? pasado.corridas : undefined, ceder); } catch (e) { console.error('[planta] larvicultura', e); fallos.push('larvicultura (' + e.message + ')'); }
    await ceder();
    try { mad = estadoMaduracion(store.globalData, hoy, pasado ? pasado.cierre : undefined); } catch (e) { console.error('[planta] maduración', e); fallos.push('maduración (' + e.message + ')'); }
    await ceder();
    // el cronograma del ciclo (T3 de 📊 Análisis): las corridas que pinta larv, hasta hoy o el cierre del mes elegido
    if (larv) try { crono = cronogramaPlanta(larv.modulos, pasado ? pasado.cierre : hoy); } catch (e) { console.error('[planta] cronograma', e); fallos.push('cronograma (' + e.message + ')'); }
    return { cifras, pasado, larv, mad, crono, fallos };
  };
  // El cálculo en curso: sólo pinta si sigue siendo el último pedido (llegó otro libro, cambió el día o el mes, o se
  // pintó un mes ya guardado: entonces se descarta). Un mes recién calculado se guarda aunque ya no se pinte.
  let enCurso = null;
  // Datos nuevos (2026-10-07, ver DESPLAZABLES): `aceptados` es el libro que la vista enseña (o está calculando);
  // `pintadoCon[modo]`, con qué libro, mes y día se pintó cada modo; `posicion`, lo guardado al tocar «Actualizar».
  let aceptados = null, yaPintado = false, posicion = null, usada = false, deGuardado = false;
  const pintadoCon = {};
  const aviso = marco.querySelector('.planta-nuevos');
  const avisarNuevos = () => {
    aviso.querySelector('span').textContent = 'Hay datos nuevos (' + new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) + ')';
    aviso.hidden = false;
  };
  const guardarPosicion = () => {
    const caja = cuerpo.querySelector('[data-cuerpo="' + modo + '"]');
    posicion = { x: window.scrollX, y: window.scrollY, cajas: caja ? [...caja.querySelectorAll(DESPLAZABLES)].map((el) => [el, el.scrollTop, el.scrollLeft]) : [] };
  };
  const reponerPosicion = () => {
    if (!posicion) return;
    const p = posicion; posicion = null;
    p.cajas.forEach(([el, arriba, izq]) => { if (el.isConnected) { el.scrollTop = arriba; el.scrollLeft = izq; } });
    if (Math.abs(window.scrollY - p.y) > 1 || Math.abs(window.scrollX - p.x) > 1) window.scrollTo(p.x, p.y);
  };
  const pintar = () => {
    if (!vista) return;   // la del modo elegido aún se está cargando: pinta al montarse
    if (!store.connected || !store.globalData.length) { enCurso = null; vista.pintarEstado(null); return; }
    aceptados = store.globalData; aviso.hidden = true;   // pintar es enseñar lo último: el aviso sobra
    const hoy = hoyLocal();
    if (memo.datos !== store.globalData || memo.hoy !== hoy) memo = { datos: store.globalData, hoy, meses: new Map() };
    const calc = memo.meses.get(mesElegido);
    if (calc) { enCurso = null; pintarCalculo(calc); return; }
    if (enCurso && enCurso.memo === memo && enCurso.mes === mesElegido) return;   // ya se está calculando ese mismo
    const yo = enCurso = { memo, mes: mesElegido };
    calcularMes(hoy, yo.mes).then((c) => {
      if (!c.fallos.length && yo.memo === memo) yo.memo.meses.set(yo.mes, c);
      if (enCurso !== yo) return;
      enCurso = null;
      if (vista && marco.isConnected) pintarCalculo(c);
    });
  };
  const pintarCalculo = (calc) => {
    const { cifras, pasado, larv, mad, crono, fallos } = calc;
    vista.pintarEstado({ modulos: larv ? larv.modulos : {}, resumen: larv ? larv.resumen : null, mad, cifras, crono,
      mes: pasado ? { mes: pasado.mes, cierre: pasado.cierre } : null });
    yaPintado = true; pintadoCon[modo] = { datos: aceptados, mes: mesElegido, hoy: memo.hoy };
    reponerPosicion();
    const hora = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    vista.aviso(fallos.length ? 'No se pudo calcular: ' + fallos.join(' · ')
      : 'Datos del MCP · puestos al día a las ' + hora + (pasado ? ' · mostrando ' + pasado.mes + ' (maduración al ' + pasado.cierre.slice(8, 10) + '/' + pasado.cierre.slice(5, 7) + ')' : ''));
  };
  // Cada modo vive en su propia caja y NO se destruye al cambiar (2026-10-06, usuario): el que se deja sólo se oculta
  // —la escena se pausa sola fuera de la vista (escena.js · IntersectionObserver)— y volver a él es inmediato, con su
  // cámara, lo elegido y los filtros. Medido antes: volver a la Maqueta la reconstruía entera (6,5 s en escritorio y
  // 8,9 s en celular ×4: texturas, geometría y 26 sombreadores). Todo se libera al salir de Planta (escena.js · dispose).
  // Un modo que falló o que se dejó mientras cargaba no queda montado: al volver a elegirlo se intenta de nuevo.
  const montados = {};
  async function montar(nuevo) {
    const mio = ++turno; modo = nuevo; vista = null; guardarModo(nuevo);
    marco.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === nuevo)));
    [...cuerpo.children].forEach((c) => { c.hidden = c.dataset.cuerpo !== nuevo; });
    if (montados[nuevo]) {
      vista = montados[nuevo];
      // con datos nuevos sin aceptar, el modo que ya enseña lo aceptado (mismo mes y día) se deja como está: sigue el aviso
      const p = pintadoCon[nuevo];
      if (store.globalData !== aceptados && p && p.datos === aceptados && p.mes === mesElegido && p.hoy === hoyLocal()) return;
      pintar(); return;
    }
    cuerpo.querySelectorAll('[data-cuerpo="' + nuevo + '"]').forEach((c) => c.remove());
    const caja = document.createElement('div');
    caja.className = 'planta-modo'; caja.dataset.cuerpo = nuevo;
    caja.innerHTML = '<div class="planta planta-carga"><p>' + (nuevo === 'maqueta' ? 'Cargando la maqueta…' : 'Cargando…') + '</p></div>';
    cuerpo.appendChild(caja);
    let v;
    try {
      if (nuevo === 'maqueta') {
        const { montarPlanta } = await import('./escena.js');
        if (mio !== turno || !marco.isConnected) { caja.remove(); return; }
        caja.innerHTML = MAQUETA;
        const host = caja.querySelector('.planta');
        try { v = montarPlanta(host); } catch (e) {
          host.querySelector('.viewport').innerHTML = '<div class="empty-state" style="padding:48px">No se pudo mostrar la maqueta 3D en este equipo: usa 📊 Análisis.<br>'
            + `<small class="mono">${esc(e.message)}</small></div>`;
          return;
        }
      } else {
        const { montarAnalisis } = await import('./analisis.js');
        if (mio !== turno || !marco.isConnected) { caja.remove(); return; }
        v = montarAnalisis(caja);
      }
    } catch (e) {
      if (mio !== turno || !marco.isConnected) { caja.remove(); return; }
      console.error('[planta] modo', e);
      caja.innerHTML = '<div class="planta planta-carga"><p>No se pudo cargar esta vista. Revisa la conexión y vuelve a elegirla.<br>' + `<small class="mono">${esc(e.message)}</small></p></div>`;
      return;
    }
    montados[nuevo] = v;
    vista = v;
    vista.alElegirMes((mIdx, esUltimo) => { mesElegido = esUltimo ? null : mIdx; pintar(); });
    pintar();
  }
  marco.querySelector('.planta-modos').addEventListener('click', (e) => { const b = e.target.closest('[data-modo]'); if (b && b.dataset.modo !== modo) montar(b.dataset.modo); });
  aviso.querySelector('button').addEventListener('click', () => { guardarPosicion(); pintar(); });
  // «Usada»: un toque, una tecla, la rueda o un desplazamiento desde que se abrió (decide la puesta al día del libro guardado)
  const marcarUso = () => { usada = true; };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => marco.addEventListener(t, marcarUso, { capture: true, passive: true }));
  const alDesplazar = () => { removeEventListener('scroll', alDesplazar); if (marco.isConnected) usada = true; };
  addEventListener('scroll', alDesplazar, { passive: true });
  montar(leerModo());
  if (!store.connected) asegurarLibro();
  // Se desuscribe solo cuando la vista ya no está en el documento (el router no avisa al salir; su contenedor sigue). UNA
  // limpieza para las tres vías (2026-10-07, auditoría C1): la de EV.CONN no quitaba la escucha de scroll de la ventana y
  // ésta retenía la vista entera —su DOM y su escena— hasta el siguiente desplazamiento.
  const soltar = () => { offData(); offConn(); offView(); removeEventListener('scroll', alDesplazar); };
  // C2 (2026-10-07, usuario): también al cambiar de vista, sin esperar al siguiente EV.DATA/EV.CONN (hasta 5 min con la
  // vista entera retenida). EV.VIEW llega ANTES de que el router pinte la vista nueva: se mira después.
  const offView = on(EV.VIEW, () => setTimeout(() => { if (!marco.isConnected) soltar(); }, 0));
  const offData = on(EV.DATA, (d) => {
    if (!marco.isConnected) { soltar(); return; }
    const guardado = !!(d && d.guardado);
    const solo = !yaPintado || !!enCurso || guardado || (deGuardado && !usada);
    deGuardado = guardado;
    if (solo) pintar(); else avisarNuevos();
  });
  const offConn = on(EV.CONN, (c) => {
    if (!marco.isConnected) { soltar(); return; }
    if (vista && c && c.state === 'error' && !store.connected) vista.aviso('No se pudieron cargar los datos de producción. Pulsa ⟳ arriba para reintentar.');
  });
}
