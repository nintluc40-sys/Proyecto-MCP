/* ============================================================
   PLANTA · página del QR de acceso de Gerencia (2026-10-05, decisión del usuario)
   `…/?qr=gerencia` (main.js la abre antes que la cabecera y la elección de rol; se llega desde «Compartir acceso» en el
   panel de Planta). Muestra el QR 3D (qr/escena.js, el del artefacto «Camarón QR») con el enlace exclusivo de Gerencia,
   que entra directo a 🏭 Planta y queda recordado en el equipo (ui/accesoRol.js). Con todos los diseños: el camarón,
   nauplio, zoea, mysis, postlarva y los logos de Omarsa y Mar Bravo.
   Presentación pulida (2026-10-07, usuario): el enlace sólo va DENTRO del QR (no se escribe en la página: sin campo,
   «Copiar», «Abrir…» ni el destino bajo el título), el color es Blanco o Cocido (por defecto) y no lleva la ficha
   descriptiva (especie, Loc., estadio, talla, código, piezas). El artefacto de claude.ai no cambia.
   El marco es estático; lo que cambia lo escribe escena.js con textContent.
   ============================================================ */
import './qr.css';
import { montarQR } from './escena.js';
import { enlaceGerencia } from '../../../ui/accesoRol.js';
import { esc } from '../../../core/format.js';

const MARCO = `
<div class="qr-acceso">
  <section class="stage" id="stage" aria-label="Escenario 3D">
    <canvas id="scene" tabindex="0" role="button" aria-label="Figura 3D. Pulsa Enter para formar el código QR."></canvas>
    <header class="brand">
      <span class="wordmark">Acceso <i>Gerencia</i></span>
    </header>
    <p class="hint" id="hint">Toca la figura para formar el QR</p>
    <p class="loading" id="loading">Armando el código…</p>
  </section>
  <aside class="panel">
    <div>
      <span class="label">Laboratorio Mar Bravo · MCP</span>
      <h1 class="titulo">Entrada directa para Gerencia</h1>
      <p class="lede">Escanea el código con la cámara del celular: abre el MCP directo en la vista 🏭 Planta, como Gerencia, y ese equipo lo recuerda hasta pulsar «Cambiar rol».</p>
    </div>
    <div>
      <span class="label" id="form-label">Forma</span>
      <div class="chips" id="forms" role="radiogroup" aria-labelledby="form-label"></div>
      <p class="err" id="logo-err" hidden></p>
    </div>
    <div>
      <span class="label" id="sp-label">Color</span>
      <div class="chips" id="chips" role="radiogroup" aria-labelledby="sp-label"></div>
      <p class="sub" id="sp-note" hidden>El logo usa los colores de su imagen.</p>
    </div>
    <div class="actions">
      <button type="button" class="primary" id="toggle">Formar QR</button>
      <button type="button" id="save">Descargar PNG</button>
    </div>
    <p class="note">Las piezas de la figura se reacomodan como módulos del código. Tócala para formarlo y escanéalo con la cámara del teléfono; arrástrala de lado para girarla. La imagen descargada sirve para imprimir o enviar.</p>
  </aside>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
</div>`;

/** Pinta la página en `app` y monta el QR 3D. Sin WebGL, lo avisa. */
export function paginaQR(app) {
  // el tema que eligió el equipo en la app (shell.js lo aplica al montarse; esta página no monta la cabecera)
  try { if (localStorage.getItem('larv4_theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); } catch (_) { /* tema claro */ }
  document.title = 'Acceso de Gerencia · MCP Mar Bravo';
  app.innerHTML = MARCO;
  const host = app.querySelector('.qr-acceso'), enlace = enlaceGerencia(location.href);
  try {
    montarQR(host, { enlace });
  } catch (e) {
    host.querySelector('.stage').innerHTML = '<div class="loading">No se pudo mostrar el QR 3D en este equipo.<br><small>' + esc(e.message) + '</small></div>';
  }
}
