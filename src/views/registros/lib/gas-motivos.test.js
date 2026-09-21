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
    /* «Esquema desactualizado» entró el 2026-09-13 (V3): la hoja y la app no tienen las mismas
       columnas y el GAS no escribió nada. El registro está bien, así que ESPERA en la cola. */
    const DE_ENTORNO = ['Hoja no permitida', 'No autorizado', 'Límite de columnas', 'Esquema desactualizado'];
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

    it('🔴 «Esquema desactualizado» manda a ACTUALIZAR LA APP, no a re-desplegar el GAS', () => {
      /* Es el caso contrario a «Hoja no permitida»: aquí lo viejo es la app, no el GAS.
         Mandar a re-desplegar sería mandar a arreglar lo que ya está bien. */
      const t = _gasMotivo(mensajeDelGas('Esquema desactualizado'));
      expect(t).toContain('actualizarla');
      expect(t).not.toContain('vuelve a desplegarlo');
    });

    /* PE1.2 (2026-09-16) · el GAS nuevo ya dice quién tiene la cabecera vieja; la pista de siempre («recarga la app
       para actualizarla») lo contradiría justo cuando la app está al día. Los textos salen del PROPIO GAS. */
    it('🔴 PE1.2 · cuando el GAS ya dijo que la vieja es la HOJA, el cliente no manda a actualizar la app', () => {
      const literal = (frag) => { const m = new RegExp('"([^"]*' + frag + '[^"]*)"').exec(gas); if (!m) throw new Error('el GAS ya no dice «' + frag + '»'); return m[1]; };
      const cabeza = 'Esquema desactualizado en «Maduración Ingreso» (columna 14: la hoja espera «Camarones por m2»). ';
      const conFirma = cabeza + literal('Esta app trae el esquema vigente');
      expect(_gasMotivo(conFirma)).toContain(conFirma);
      expect(_gasMotivo(conFirma)).not.toContain('actualizarla');
      const sinFirma = cabeza + literal('si ya está al día');
      expect(_gasMotivo(sinFirma)).not.toContain('recarga la app');
      // Con el aviso del GAS ANTERIOR (sin diagnóstico) sigue la pista de siempre.
      expect(_gasMotivo('Esquema desactualizado en «X» (columna 3: la hoja espera «Y»). Actualiza la app antes de sincronizar.')).toContain('actualizarla');
    });

    it('siempre incluye el mensaje literal del servidor', () => {
      const msg = mensajeDelGas('Hoja no permitida');
      expect(_gasMotivo(msg)).toContain(msg);
    });
  });

  /* ── B2 (2026-09-21) · LA TERCERA LECTURA DEL MISMO MENSAJE, que no se probaba ──
     Además de las dos de arriba, `_postOnce` lo lee con `_BUSY_RE` y decide algo distinto y
     ANTERIOR: si el envío se reintenta (y se conserva) o si se da por rechazado. Un mensaje podía
     pasar las dos comprobaciones de arriba y perderse aquí, que es lo que le ocurría al catch final
     de `doPost`: un fallo TRANSITORIO de Google —«Service Spreadsheets failed…»— se descartaba de
     la cola y se le decía al usuario «revisa los datos» con el dato perfecto.
     🔑 Los mensajes se siguen EXTRAYENDO del GAS: si alguien reescribe uno, esto se pone rojo en
     vez de dejar de reconocerlo en silencio. */
  describe('_BUSY_RE · ¿el envío se REINTENTA o se da por rechazado?', () => {
    const busy = (() => {
      const m = /const _BUSY_RE = (\/[^\n]*\/[a-z]*);/.exec(engine);
      if (!m) throw new Error('engine.js ya no declara _BUSY_RE');
      return new Function('return ' + m[1])();
    })();

    const TRANSITORIOS = ['Servidor ocupado', 'Demasiadas solicitudes', 'Error interno'];
    const PERMANENTES = ['Hoja no permitida', 'Formato inválido', 'Límite de filas', 'Error en datos'];

    for (const frag of TRANSITORIOS) {
      it(`«${frag}» → TRANSITORIO: se reintenta, no se descarta`, () => {
        expect(busy.test(mensajeDelGas(frag))).toBe(true);
      });
    }

    for (const frag of PERMANENTES) {
      it(`«${frag}» → permanente: reintentar no serviría`, () => {
        expect(busy.test(mensajeDelGas(frag))).toBe(false);
      });
    }

    it('🔴 el catch final de doPost es lo que Google devuelve cuando falla a rachas', () => {
      // Si alguien lo reescribiera sin «error interno», el envío volvería a descartarse de la cola.
      expect(mensajeDelGas('Error interno').toLowerCase()).toContain('error interno');
      expect(busy.test(mensajeDelGas('Error interno'))).toBe(true);
    });
  });
});
