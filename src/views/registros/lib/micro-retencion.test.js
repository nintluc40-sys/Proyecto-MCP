/* ============================================================
   REGISTROS · Microbiología — el historial local se mide desde que se SINCRONIZA

   Bacteriología, Calidad de Agua y Patología guardan sus análisis en el dispositivo
   y los descartan a los 7 días (MIC_TTL). La pregunta es 7 días DESDE CUÁNDO.

   Hasta el 2026-08-30 el motor del repo contaba desde `ts` —cuando se creó el
   registro—, y eso rompe el caso normal del laboratorio: se acumulan análisis
   pendientes de varios días y se sincronizan de una vez. Con el reloj en `ts`, los de
   hace más de una semana desaparecían del historial local EN EL MISMO INSTANTE en que
   se enviaban, que es justo cuando el analista puede querer revisarlos. El monolito de
   Music ya contaba desde `syncedAt`; esta prueba fija esa regla en las dos.

   Un pendiente NUNCA se descarta, tenga la edad que tenga: sin sincronizar, el
   dispositivo es el único sitio donde existe ese dato.

   🔑 Se ejecuta el código REAL de las tres funciones, extraído de engine.js. Escribir
   aquí una copia de la condición sólo probaría la copia — y una copia siempre está de
   acuerdo consigo misma.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const src = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

const DIA = 24 * 60 * 60 * 1000;
const MIC_TTL = 7 * DIA;

/** Extrae una función completa del monolito por su cabecera y su cierre. */
function fnDe(nombre) {
  const i = src.indexOf('function ' + nombre + '(){');
  if (i < 0) throw new Error('no se halló ' + nombre + ' en engine.js');
  const j = src.indexOf('\n}\n', i);
  if (j < 0) throw new Error('no se halló el cierre de ' + nombre);
  return src.slice(i, j + 2);
}

/* El TTL que usa el motor no se transcribe: se lee de su propia declaración, para que
   cambiarlo allí no deje esta prueba midiendo contra otro número. */
function ttlDelMotor() {
  const m = /const MIC_TTL\s*=\s*([^;]+);/.exec(src);
  if (!m) throw new Error('no se halló MIC_TTL');
  return Function('return (' + m[1] + ')')();
}

/** Corre la poda REAL sobre una lista, con el almacenamiento simulado. */
function poda(nombre, sufijo, lista) {
  const guardado = { llamado: false, lista: null };
  const ctx = {
    Date,
    MIC_TTL: ttlDelMotor(),
    [`_${sufijo}Raw`]: () => lista,
    [`_${sufijo}Save`]: (l) => { guardado.llamado = true; guardado.lista = l; },
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(fnDe(nombre) + `\n;globalThis.__r = ${nombre}();`).runInContext(ctx);
  return { quedan: ctx.__r, guardado };
}

const ahora = Date.now();
const hace = (d) => ahora - d * DIA;

/* Las tres funciones son la misma regla sobre tres almacenes distintos, así que se
   les pasa la misma batería: si una se toca y las otras no, esto lo dice. */
const CASOS = [
  ['pruneMic', 'mic', 'Bacteriología'],
  ['pruneCal', 'cal', 'Calidad de Agua'],
  ['prunePat', 'pat', 'Patología en Fresco'],
];

describe('Microbiología · retención del historial local', () => {
  it('el TTL del motor son 7 días', () => {
    expect(ttlDelMotor()).toBe(MIC_TTL);
  });

  for (const [fn, sufijo, etiqueta] of CASOS) {
    describe(etiqueta + ' (' + fn + ')', () => {
      it('🔴 conserva lo sincronizado HOY aunque se creara hace 10 días', () => {
        // El caso que motivó el arreglo: pendientes acumulados que se envían de golpe.
        const r = { id: 'a', ts: hace(10), synced: true, syncedAt: ahora };
        const { quedan } = poda(fn, sufijo, [r]);
        expect(quedan).toHaveLength(1);
      });

      it('descarta lo que se sincronizó hace más de 7 días', () => {
        const r = { id: 'b', ts: hace(12), synced: true, syncedAt: hace(10) };
        const { quedan } = poda(fn, sufijo, [r]);
        expect(quedan).toHaveLength(0);
      });

      it('conserva lo sincronizado hace menos de 7 días', () => {
        const r = { id: 'c', ts: hace(30), synced: true, syncedAt: hace(3) };
        const { quedan } = poda(fn, sufijo, [r]);
        expect(quedan).toHaveLength(1);
      });

      it('NUNCA descarta un pendiente, por viejo que sea', () => {
        const r = { id: 'd', ts: hace(90), synced: false, syncedAt: null };
        const { quedan } = poda(fn, sufijo, [r]);
        expect(quedan).toHaveLength(1);
      });

      it('en los heredados sin syncedAt cae a ts, y ahí sí descarta el viejo', () => {
        const viejo = { id: 'e', ts: hace(10), synced: true };
        const nuevo = { id: 'f', ts: hace(2), synced: true };
        const { quedan } = poda(fn, sufijo, [viejo, nuevo]);
        expect(quedan.map((x) => x.id)).toEqual(['f']);
      });

      it('sólo reescribe el almacenamiento cuando algo se ha descartado', () => {
        const intactos = [{ id: 'g', ts: hace(1), synced: true, syncedAt: hace(1) }];
        expect(poda(fn, sufijo, intactos).guardado.llamado).toBe(false);
        const conBaja = [{ id: 'h', ts: hace(20), synced: true, syncedAt: hace(20) }];
        expect(poda(fn, sufijo, conBaja).guardado.llamado).toBe(true);
      });
    });
  }
});
