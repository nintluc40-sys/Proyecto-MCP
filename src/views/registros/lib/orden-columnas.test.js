/* ============================================================
   REGISTROS · orden VISUAL de columnas en los formatos de laboratorio (2026-08)

   Pedido por el usuario, y es COSMÉTICO: los compuestos nitrogenados salen siempre como
   Nitrato · Nitrito · TAN · Am.Tóxico · Amonio, y los vibrios como
   V.alginolyticus · V.vulnificus · V.parahaemolyticus.

   ⚠ LA MITAD IMPORTANTE DE ESTA PRUEBA ES LA SEGUNDA. El orden NO debe cambiar en el
   Google Sheet: ahí las filas se escriben por POSICIÓN desde dos arrays fijos
   —`CAL_PARAM_ORDER` y `MIC_LEVEL_PARAMS`— que contienen exactamente las MISMAS claves
   que los arrays de pantalla. Un reemplazo global "para dejarlo todo igual" los tocaría y
   movería datos de columna en hojas con miles de filas ya escritas. Por eso se fija su
   contenido literal aquí: si alguien los reordena, esto se pone rojo.

   Separación medida en el monolito:
     · presentación → `fmt.params` de MIC_FORMATS/CAL_FORMATS, CAL_PARAMS_FULL,
       CAL_PARAMS_MAD_AGUA. Se leen por NOMBRE (d[pk]), nunca por posición.
     · hoja         → CAL_PARAM_ORDER (buildCalPayload) y MIC_LEVEL_PARAMS (buildMicPayload).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CAL_PARAMS } from '../../microbiologia/calagua.data.js';
import { PATHOGENS } from '../../microbiologia/data.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const engine = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

const NITRO = ['nitrato', 'nitrito', 'tan', 'amtox', 'amonio'];
const VIBRIOS = ['valg', 'vvuln', 'vpara'];

/** Todos los arrays de PRESENTACIÓN, con su nombre para poder señalar al culpable. */
function arraysDePantalla() {
  const out = [];
  const re = /(params\s*:\s*|const\s+(CAL_PARAMS_FULL|CAL_PARAMS_MAD_AGUA)\s*=\s*)\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(engine)) !== null) {
    const claves = [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    if (claves.length) out.push({ nombre: m[2] || 'params:[…]', claves, pos: m.index });
  }
  return out;
}

/** Array por nombre de constante (los que mandan en la hoja). */
function arrayPorNombre(nombre) {
  const m = new RegExp('const ' + nombre + ' = \\[([^\\]]*)\\]').exec(engine);
  if (!m) throw new Error('No encontrado: ' + nombre);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** Subsecuencia de `grupo` tal como aparece en `claves`. */
const relativo = (claves, grupo) => claves.filter((k) => grupo.includes(k));

describe('registros · orden visual de los compuestos nitrogenados', () => {
  const conNitro = arraysDePantalla().filter((a) => NITRO.every((k) => a.claves.includes(k)));

  it('el barrido encuentra formatos que los llevan (si no, la prueba no probaría nada)', () => {
    expect(conNitro.length).toBeGreaterThanOrEqual(3);
  });

  it('SIEMPRE salen como Nitrato · Nitrito · TAN · Am.Tóxico · Amonio', () => {
    conNitro.forEach((a) => {
      expect(relativo(a.claves, NITRO), `array «${a.nombre}» en el offset ${a.pos}`).toEqual(NITRO);
    });
  });
});

describe('registros · orden visual de los vibrios', () => {
  const conVib = arraysDePantalla().filter((a) => VIBRIOS.every((k) => a.claves.includes(k)));

  it('el barrido encuentra formatos que los llevan', () => {
    expect(conVib.length).toBeGreaterThanOrEqual(9);
  });

  it('SIEMPRE salen como V.alginolyticus · V.vulnificus · V.parahaemolyticus', () => {
    conVib.forEach((a) => {
      expect(relativo(a.claves, VIBRIOS), `array «${a.nombre}» en el offset ${a.pos}`).toEqual(VIBRIOS);
    });
  });
});

describe('registros · el orden del GOOGLE SHEET no se toca', () => {
  // Estos dos arrays fijan la POSICIÓN física de cada columna en su hoja. Reordenarlos
  // desplazaría los datos de miles de filas ya escritas. El contenido va literal a
  // propósito: es un candado, no una derivación.
  it('CAL_PARAM_ORDER conserva su orden original (hoja «Calidad de Agua»)', () => {
    expect(arrayPorNombre('CAL_PARAM_ORDER')).toEqual([
      'sal', 'ph', 'alc', 'temp', 'nitrito', 'tan', 'amtox', 'nitrato', 'amonio', 'ntot',
      'calcio', 'magnesio', 'potasio', 'dureza', 'hierro', 'fosforo', 'cobre', 'manganeso',
      'sal_a', 'sal_d', 'ph_a', 'ph_d', 'calcio_a', 'calcio_d', 'magnesio_a', 'magnesio_d',
      'potasio_a', 'potasio_d', 'cl_libre', 'cl_total', 'cl_comb',
    ]);
  });

  it('MIC_LEVEL_PARAMS conserva su orden original (hoja «Microbiología»)', () => {
    expect(arrayPorNombre('MIC_LEVEL_PARAMS')).toEqual([
      'vamar', 'vverd', 'vtot', 'valg', 'vpara', 'vvuln', 'pseudo', 'aero', 'btot', 'bnar', 'hongos',
    ]);
  });

  it('control: los dos arrays de la hoja NO están en el orden de pantalla', () => {
    // Si algún día coincidieran, los dos candados de arriba dejarían de distinguir nada.
    expect(relativo(arrayPorNombre('CAL_PARAM_ORDER'), NITRO)).not.toEqual(NITRO);
    expect(relativo(arrayPorNombre('MIC_LEVEL_PARAMS'), VIBRIOS)).not.toEqual(VIBRIOS);
  });
});

describe('el TABLERO de Microbiología usa el mismo orden que la captura', () => {
  // El técnico ve estas columnas en dos sitios: la ficha donde captura (monolito) y el
  // tablero donde consulta. Con órdenes distintos, la misma tabla se lee de dos formas.
  // El tablero solo LEE: localiza las columnas por cabecera (`col`/`alias` en CAL_PARAMS,
  // `base`/`altBases` en PATHOGENS), nunca por posición, así que reordenar es inocuo.
  it('los nitrogenados de CAL_PARAMS van en el orden pactado', () => {
    const claves = CAL_PARAMS.map((p) => p.key);
    expect(claves.filter((k) => NITRO.includes(k))).toEqual(NITRO);
  });

  it('los vibrios de PATHOGENS van en el orden pactado', () => {
    // PATHOGENS usa claves propias; se traduce por su `fkey`, que es la del monolito.
    const porFkey = PATHOGENS.filter((p) => VIBRIOS.includes(p.fkey)).map((p) => p.fkey);
    expect(porFkey).toEqual(VIBRIOS);
  });

  it('control: el tablero declara los tres vibrios y los cinco nitrogenados', () => {
    // Sin esto, un filtro que no encontrara nada dejaría pasar la prueba con [] === [].
    expect(PATHOGENS.filter((p) => VIBRIOS.includes(p.fkey))).toHaveLength(3);
    expect(CAL_PARAMS.filter((p) => NITRO.includes(p.key))).toHaveLength(5);
  });
});
