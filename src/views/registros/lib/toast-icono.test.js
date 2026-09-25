/* ============================================================
   F2 (auditoría del 2026-09-25, usuario) · UN AVISO, UN ICONO

   `toast()` del monolito antepone el icono de su tipo (✅ ok · ❌ err · ⚠️ warn · ℹ️ info). Una treintena de avisos ya
   traían el suyo delante —«✅ N envío(s) pendiente(s) de la cola completados», «⚠️ Se descartaron…», «📶 Conexión
   inestable…»— y salían con DOS: «✅ ✅», «❌ ⚠️». Decisión del usuario: se arregla en `toast()` y para toda la familia:
   si el mensaje ya empieza por un emoji, no se le antepone otro.
   Aquí se ejecuta la función REAL de engine.js en una caja, con un DOM mínimo que recoge lo que se pinta. La paridad con
   `index (8)` la vigila `verificar-3copias-v3`, en la máquina donde ese archivo existe (en la CI no está).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const engineSrc = readFileSync(new URL('../../../../public/registros/engine.js', import.meta.url), 'utf8').split('\r\n').join('\n');

/* De `_avisoTraeIcono` al final de `toast`: las dos funciones REALES, seguidas en el fuente. */
function avisosDelMonolito() {
  const i = engineSrc.indexOf('function _avisoTraeIcono(');
  const t = engineSrc.indexOf('function toast(', i);
  if (i < 0 || t < 0) throw new Error('no se encontraron _avisoTraeIcono y toast en engine.js');
  const fin = engineSrc.indexOf('\n}\n', t);
  const pintados = [];
  const caja = { appendChild: (el) => pintados.push(el) };
  const document = { getElementById: (id) => (id === 'toasts' ? caja : null), createElement: () => ({ className: '', textContent: '', style: {} }) };
  const ctx = { document, setTimeout: () => 0 };
  createContext(ctx);
  new Script(engineSrc.slice(i, fin + 2) + '\n;globalThis.__toast = toast;').runInContext(ctx);
  return { toast: ctx.__toast, pintados };
}

describe('F2 · toast: un aviso, un solo icono', () => {
  it('sin emoji propio, el aviso lleva el icono de su tipo (como siempre)', () => {
    const { toast, pintados } = avisosDelMonolito();
    toast('12 desove(s) registrado(s).', 'ok');
    toast('No se pudo enviar a Google Sheets. Reintenta.', 'err');
    toast('Todavía se está enviando el registro anterior.', 'warn');
    toast('Leyendo las hojas…', 'info');
    toast('«Maduración Lotes» no llegó', 'err');   // unas comillas no son un icono
    toast('Toca ✏️ en la fila para corregirla', 'info');   // lo que cuenta es cómo EMPIEZA
    expect(pintados.map((el) => el.textContent)).toEqual([
      '✅ 12 desove(s) registrado(s).', '❌ No se pudo enviar a Google Sheets. Reintenta.',
      '⚠️ Todavía se está enviando el registro anterior.', 'ℹ️ Leyendo las hojas…', '❌ «Maduración Lotes» no llegó',
      'ℹ️ Toca ✏️ en la fila para corregirla']);
  });

  it('🔴 con emoji propio NO se le antepone otro: se acabaron «✅ ✅» y «❌ ⚠️»', () => {
    const { toast, pintados } = avisosDelMonolito();
    toast('✅ 1 envío(s) pendiente(s) de la cola completados', 'ok');
    toast('⚠️ Se descartaron 1 envío(s) de la cola sin llegar a la hoja', 'err');
    toast('📶 Conexión inestable — guardado en cola', 'warn');
    toast('⏳ 2 envío(s) esperando en la cola', 'warn');
    toast('✏️ Corregido en el envío que espera en la cola', 'ok');
    expect(pintados.map((el) => el.textContent)).toEqual([
      '✅ 1 envío(s) pendiente(s) de la cola completados', '⚠️ Se descartaron 1 envío(s) de la cola sin llegar a la hoja',
      '📶 Conexión inestable — guardado en cola', '⏳ 2 envío(s) esperando en la cola', '✏️ Corregido en el envío que espera en la cola']);
    expect(pintados.map((el) => el.className)).toEqual(['toast ok', 'toast err', 'toast warn', 'toast warn', 'toast ok']);
  });
});
