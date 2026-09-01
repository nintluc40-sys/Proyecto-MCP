/* ============================================================
   REGISTROS · los motivos de rechazo del GAS y lo que el cliente hace con ellos

   Cuando el GAS rechaza un envío manda un `message`. El cliente lo lee DOS veces y
   decide cosas distintas con él:

     · `_esRechazoDeEntorno` → ¿el envío se CONSERVA en la cola o se descarta?
     · `_gasMotivo`          → qué acción concreta se le enseña a quien está capturando.

   Los dos comparan cadenas contra el texto que escribe el servidor. O sea que el
   contrato entre las dos mitades es una CADENA, y una cadena que sólo coincide por
   costumbre es exactamente la costura donde este proyecto ha encontrado sus defectos:
   basta reescribir un mensaje en el GAS para que el cliente deje de reconocerlo, sin
   un solo error y sin que ninguna prueba se ponga roja.

   🔑 Por eso los mensajes NO se escriben aquí a mano: se EXTRAEN de GAS/Code.gs y se
   le dan al clasificador REAL del motor. Si alguien cambia uno de los dos lados, esto
   se pone rojo.

   La distinción importa de verdad. Un rechazo de ENTORNO (el GAS desplegado es
   anterior a la app, falta el token) significa que el registro está PERFECTO y lo que
   falla se arregla fuera: tiene que esperar en la cola. Uno de DATOS significa que
   reintentar no serviría. Confundirlos fue lo que en agosto descartaba traslados
   buenos culpando al dato.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const GAS = new URL('../../../../GAS/Code.gs', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

const engine = leer(ENGINE);
const gas = leer(GAS);

/** Extrae una función del motor y la ejecuta en una caja. */
function fnDelMotor(nombres) {
  const code = nombres.map((n) => {
    const i = engine.indexOf('function ' + n + '(');
    if (i < 0) throw new Error('no se halló ' + n + ' en engine.js');
    const j = engine.indexOf('\n}\n', i);
    return engine.slice(i, j + 2);
  }).join('\n');
  const ctx = { String };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__api = { ' + nombres.join(', ') + ' };').runInContext(ctx);
  return ctx.__api;
}

const { _esRechazoDeEntorno, _gasMotivo } = fnDelMotor(['_esRechazoDeEntorno', '_gasMotivo']);

/** Los mensajes tal y como los escribe el GAS, leídos de su propio fuente. */
function mensajeDelGas(fragmento) {
  const re = new RegExp('message:\\s*"([^"]*' + fragmento + '[^"]*)"', 'i');
  const m = re.exec(gas);
  if (!m) throw new Error('el GAS ya no emite ningún mensaje con «' + fragmento + '»');
  return m[1];
}

describe('GAS ↔ cliente · los motivos de rechazo', () => {
  describe('el mensaje que emite el GAS lo reconoce el cliente', () => {
    const DE_ENTORNO = ['Hoja no permitida', 'No autorizado', 'Límite de columnas'];
    const DE_DATOS = ['Límite de filas', 'Error en datos', 'Formato inválido'];

    for (const frag of DE_ENTORNO) {
      it(`«${frag}» → de ENTORNO: el envío ESPERA en la cola`, () => {
        const msg = mensajeDelGas(frag);
        expect(_esRechazoDeEntorno(msg)).toBe(true);
      });
    }

    for (const frag of DE_DATOS) {
      it(`«${frag}» → de DATOS: no se conserva a la espera`, () => {
        const msg = mensajeDelGas(frag);
        expect(_esRechazoDeEntorno(msg)).toBe(false);
      });
    }
  });

  describe('_esRechazoDeEntorno', () => {
    it('sin mensaje no supone entorno (ante la duda, no se retiene)', () => {
      expect(_esRechazoDeEntorno('')).toBe(false);
      expect(_esRechazoDeEntorno(null)).toBe(false);
      expect(_esRechazoDeEntorno(undefined)).toBe(false);
    });

    it('no le afectan las mayúsculas', () => {
      expect(_esRechazoDeEntorno('HOJA NO PERMITIDA')).toBe(true);
      expect(_esRechazoDeEntorno('límite de COLUMNAS excedido')).toBe(true);
    });
  });

  describe('_gasMotivo · la acción que se le enseña a quien captura', () => {
    it('sin mensaje no añade nada', () => {
      expect(_gasMotivo('')).toBe('');
      expect(_gasMotivo(null)).toBe('');
    });

    it('«Hoja no permitida» manda a re-desplegar el GAS', () => {
      expect(_gasMotivo(mensajeDelGas('Hoja no permitida'))).toContain('vuelve a desplegarlo');
    });

    it('🔴 «Límite de columnas» manda a re-desplegar, no a tocar el registro', () => {
      const t = _gasMotivo(mensajeDelGas('Límite de columnas'));
      expect(t).toContain('vuelve a desplegarlo');
      expect(t).not.toContain('menos registros');
    });

    it('«Límite de filas» sí manda a enviar menos de una vez', () => {
      expect(_gasMotivo(mensajeDelGas('Límite de filas'))).toContain('menos registros');
    });

    it('«No autorizado» manda al token compartido', () => {
      expect(_gasMotivo(mensajeDelGas('No autorizado'))).toContain('token');
    });

    it('siempre incluye el mensaje literal del servidor', () => {
      const msg = mensajeDelGas('Hoja no permitida');
      expect(_gasMotivo(msg)).toContain(msg);
    });
  });
});
