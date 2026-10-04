// @vitest-environment happy-dom
/* ============================================================
   RETENCIÓN · lo NO enviado se conserva (auditoría final, 2026-10-04, decisión del usuario)

   Biomol, AsT (Supervisión) y Traslado borraban a las 48 h TODO lo guardado en el dispositivo, enviado o no, sin aviso.
   Ahora, como Score, Auditoría y Microbiología: a las 48 h sólo se retira lo YA ENVIADO, contadas desde su envío; lo
   pendiente se queda hasta enviarlo o borrarlo a mano.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['pruneBio', 'pruneAst', 'pruneTras', 'BIO_REC_KEY', 'AST_REC_KEY', 'TRAS_REC_KEY', 'BIO_TTL', 'AST_TTL', 'TRAS_TTL'];
const H = {};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
      clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; } };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n') + '\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, globalThis.localStorage, globalThis);
});

beforeEach(() => { localStorage.clear(); });

const H_ = 3600000;
/** Un registro creado hace `edadH` horas; enviado hace `envioH` horas (null = sin enviar). */
const reg = (id, edadH, envioH) => ({ id, ts: Date.now() - edadH * H_, synced: envioH !== null, syncedAt: envioH === null ? null : Date.now() - envioH * H_,
  data: { fecha: '2026-10-01', sid: 's-' + id } });

for (const [nombre, poda, clave, ttl] of [['Biomol', 'pruneBio', 'BIO_REC_KEY', 'BIO_TTL'], ['AsT', 'pruneAst', 'AST_REC_KEY', 'AST_TTL'], ['Traslado', 'pruneTras', 'TRAS_REC_KEY', 'TRAS_TTL']]) {
  describe(nombre + ' · la poda de las 48 h', () => {
    it('el TTL sigue siendo de 48 h', () => { expect(H[ttl]).toBe(48 * H_); });

    it('🔴 lo NO enviado se conserva aunque tenga más de 48 h', () => {
      localStorage.setItem(H[clave], JSON.stringify([reg('p', 100, null)]));
      expect(H[poda]().map((r) => r.id)).toEqual(['p']);
      expect(JSON.parse(localStorage.getItem(H[clave])).map((r) => r.id), 'y sigue en el almacén').toEqual(['p']);
    });

    it('lo ENVIADO hace más de 48 h se retira', () => {
      localStorage.setItem(H[clave], JSON.stringify([reg('e', 100, 60), reg('p', 100, null)]));
      expect(H[poda]().map((r) => r.id)).toEqual(['p']);
    });

    it('🔴 lo enviado se cuenta desde su ENVÍO: creado hace 100 h y enviado hace 1 h, se queda', () => {
      localStorage.setItem(H[clave], JSON.stringify([reg('r', 100, 1)]));
      expect(H[poda]().map((r) => r.id)).toEqual(['r']);
    });
  });
}
