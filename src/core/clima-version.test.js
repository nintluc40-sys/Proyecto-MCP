/* ============================================================
   GAS/Clima.gs · EL SELLO (A36, 2026-11-08, usuario: «En el código y en su registro»)

   El script del clima es un proyecto APARTE, sin Web App: no hay `?p=ver` que preguntar. Hasta hoy no había forma de
   saber si lo instalado en «MCP · clima» era lo del repo. Ahora:
     · `CLIMA_VERSION` es la HUELLA (sha-256, 12 caracteres) del resto de `GAS/Clima.gs`, como `GAS_VERSION` en Code.gs;
     · esta prueba la recalcula: tocar el script sin actualizarla pone la suite en rojo, y el mensaje dice la nueva;
     · cada pasada la escribe en el registro de ejecuciones (en su propia línea: la última sigue siendo el resumen en
       JSON) y `probar` la dice antes que nada. Las hojas no cambian.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const SRC = readFileSync(join(process.cwd(), 'GAS/Clima.gs'), 'utf8').split('\r\n').join('\n');
const LINEA = /\nvar CLIMA_VERSION = "([0-9a-f]*)";\n/;
const selloDeclarado = () => { const m = SRC.match(LINEA); return m ? m[1] : null; };
const huella = (texto) => createHash('sha256')
  .update(texto.replace(LINEA, '\nvar CLIMA_VERSION = "";\n'), 'utf8').digest('hex').slice(0, 12);

/** El script con un Logger que apunta; el resto de servicios, ausentes (sólo se llama a lo que no los usa). */
function cargar() {
  const log = [];
  const api = new Function('Logger', SRC + '\nreturn { cerrar_, CLIMA_VERSION };')({ log: (s) => log.push(String(s)) });
  return { api, log };
}

describe('Clima.gs · el sello de versión no puede quedarse atrás', () => {
  it('declara un sello de 12 caracteres, una sola vez', () => {
    expect(selloDeclarado(), 'falta «var CLIMA_VERSION = "…";» en Clima.gs').toMatch(/^[0-9a-f]{12}$/);
    expect(SRC.match(/CLIMA_VERSION = /g)).toHaveLength(1);
  });

  it('🔴 el sello ES la huella del resto del archivo', () => {
    const esperado = huella(SRC);
    expect(selloDeclarado(), 'Clima.gs cambió y su sello no. Pon CLIMA_VERSION = "' + esperado + '" en GAS/Clima.gs').toBe(esperado);
  });

  it('cambiar una sola letra del resto cambia la huella', () => {
    expect(huella(SRC.replace('Observado SESA', 'Observado SESB'))).not.toBe(huella(SRC));
  });
});

describe('Clima.gs · el sello llega al registro de ejecuciones', () => {
  it('cada pasada lo escribe, en su línea, ANTES del resumen (que sigue siendo JSON y sigue siendo la última)', () => {
    const { api, log } = cargar();
    api.cerrar_('', { metar: true, horasCambiadas: 0 }, []);
    expect(log).toEqual(['MCP · clima · versión ' + selloDeclarado(), '{"metar":true,"horasCambiadas":0}']);
    expect(JSON.parse(log.at(-1))).toEqual({ metar: true, horasCambiadas: 0 });
  });

  it('también cuando alguna fuente falló (la ejecución termina en error, con el sello ya escrito)', () => {
    const { api, log } = cargar();
    expect(() => api.cerrar_('', {}, ['MET: 503'])).toThrow(/Fuentes caídas/);
    expect(log[0]).toBe('MCP · clima · versión ' + selloDeclarado());
  });

  it('`probar` lo dice antes que nada, aunque luego falle el libro', () => {
    const log = [];
    const api = new Function('Logger', 'SpreadsheetApp', SRC + '\nreturn { probar };')(
      { log: (s) => log.push(String(s)) },
      { openById: () => { throw new Error('sin libro en la prueba'); } },
    );
    expect(() => api.probar()).toThrow(/sin libro/);
    expect(log[0]).toBe('MCP · clima · versión ' + selloDeclarado() + ' (compárala con la línea CLIMA_VERSION de GAS/Clima.gs del repo)');
  });
});
