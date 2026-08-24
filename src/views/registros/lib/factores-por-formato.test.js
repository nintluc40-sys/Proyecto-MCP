/* ============================================================
   REGISTROS · Maduración · Agua y Maduración · RAS (2026-08-24)

   Dos peticiones del usuario:
     1. «Maduración · Agua» (Calidad de Agua) suma la muestra «Agua de Desove».
     2. «Maduración · RAS» (Bacteriología) suma V.alginolyticus, V.vulnificus y
        V.parahaemolyticus DESPUÉS de C. Totales.

   🔑 LO QUE DE VERDAD HAY QUE VIGILAR NO ES QUE LOS PARÁMETROS ESTÉN, sino que tengan
   FACTOR DE DILUCIÓN en su área. `micFactorOf` devuelve `{f:1}` cuando no lo encuentra,
   así que un parámetro añadido a un formato y olvidado en `MIC_DR_BASE` no da ningún
   error: el UFC sale dividido entre su factor —×10 aquí— y el nivel se queda en blanco.
   Por eso la primera prueba es un BARRIDO de todos los formatos, no sólo del que se acaba
   de tocar: la próxima vez que alguien añada un parámetro, esto se pondrá rojo solo.

   Se lee el `engine.js` REAL como texto (no se reimplementa nada) y, para la última
   prueba, los umbrales REALES del tablero: los dos monolitos no se pueden importar entre
   sí y la regla vive escrita dos veces.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadMicThresholds } from '../../microbiologia/data.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const engine = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

/** Parámetros que se clasifican por nivel (los que necesitan factor y umbrales). */
const CON_NIVEL = new Set(['vamar', 'vverd', 'vtot', 'valg', 'vpara', 'vvuln', 'pseudo',
  'aero', 'btot', 'bnar', 'hongos', 'pseudoGsp', 'aeroGsp', 'brojas', 'cba', 'clev']);

/** Formatos de MIC_FORMATS cuya área es constante, con sus parámetros. */
function formatosConArea() {
  const re = /"([a-z0-9-]+)": \{\s*\n\s*depto:[^\n]*\n\s*rkeyFn:\(\)=> "([a-z0-9-]+)",([\s\S]*?)params:\[([^\]]*)\]/g;
  const out = [];
  let m;
  while ((m = re.exec(engine)) !== null) {
    out.push({ fmt: m[1], area: m[2], params: [...m[4].matchAll(/"([^"]+)"/g)].map((x) => x[1]) });
  }
  return out;
}

/** Un área de MIC_DR_BASE → { param: {f,l,m,e} }, leída del engine.js real. */
function areaDe(nombre) {
  const i = engine.indexOf('const MIC_DR_BASE');
  const bloque = engine.slice(i, engine.indexOf('\n};', i));
  const m = new RegExp('"' + nombre + '":\\{([\\s\\S]*?)\\n  \\}').exec(bloque);
  if (!m) throw new Error('área no encontrada en MIC_DR_BASE: ' + nombre);
  const out = {};
  [...m[1].matchAll(/(\w+):\{([^}]*)\}/g)].forEach((p) => {
    const o = {};
    [...p[2].matchAll(/(\w+):(\d+(?:\.\d+)?)/g)].forEach((kv) => { o[kv[1]] = Number(kv[2]); });
    out[p[1]] = o;
  });
  return out;
}

/** La lista `params:[…]` de un formato, por su clave. */
function paramsDe(fmtKey) {
  const f = formatosConArea().find((x) => x.fmt === fmtKey);
  if (!f) throw new Error('formato no encontrado: ' + fmtKey);
  return f.params;
}

describe('registros · todo parámetro de un formato tiene FACTOR en su área', () => {
  const formatos = formatosConArea();

  it('el barrido encuentra formatos (si no, la prueba no probaría nada)', () => {
    expect(formatos.length).toBeGreaterThan(10);
  });

  it('🔴 ningún parámetro se queda sin factor — si no, su UFC saldría dividido', () => {
    const huecos = [];
    formatos.forEach((f) => {
      const area = areaDe(f.area);
      f.params.filter((p) => CON_NIVEL.has(p) && !area[p])
        .forEach((p) => huecos.push(`${f.fmt} (área ${f.area}) → ${p}`));
    });
    expect(huecos, 'parámetros sin factor: su UFC saldría en ×1, sin nivel y sin error')
      .toEqual([]);
  });
});

describe('registros · Maduración · RAS suma los tres vibrios (2026-08-24)', () => {
  it('🔴 van DESPUÉS de C. Totales y en el orden pedido', () => {
    const p = paramsDe('ras');
    const i = p.indexOf('vtot');
    expect(i, 'C. Totales dejó de estar en el formato').toBeGreaterThanOrEqual(0);
    expect(p.slice(i + 1, i + 4)).toEqual(['valg', 'vvuln', 'vpara']);
  });

  it('🔴 no desplazaron a los que ya estaban', () => {
    // El orden de la HOJA lo fija MIC_LEVEL_PARAMS, no esto; pero perder un parámetro
    // aquí sí dejaría de capturarse, y eso no da ningún error.
    const p = paramsDe('ras');
    ['vamar', 'vverd', 'vtot', 'aero', 'pseudo', 'btot', 'brojas']
      .forEach((k) => expect(p, 'se perdió ' + k).toContain(k));
  });

  it('🔴 su factor es el de «Maduración · Agua» (×10), no el ×5 de las colonias', () => {
    /* Decisión del usuario. Se compara contra el área `mad-agua` REAL en vez de contra
       un 10 escrito aquí: si mañana se ajusta el factor del agua, esta prueba obliga a
       decidir a la vez qué pasa con el RAS, en vez de dejarlos divergir en silencio. */
    const ras = areaDe('ras-agua');
    const agua = areaDe('mad-agua');
    ['valg', 'vvuln', 'vpara'].forEach((k) => {
      expect(ras[k], 'sin factor en ras-agua: ' + k).toBeTruthy();
      expect(ras[k].f, `el factor de ${k} en RAS no es el de Maduración · Agua`).toBe(agua[k].f);
    });
    // Control: el factor de las colonias de esta área NO es el del agua, así que la
    // prueba de arriba distingue de verdad (con ×5 en los dos lados no probaría nada).
    expect(ras.vamar.f).not.toBe(agua.vamar.f);
  });

  it('🔴 sus umbrales salen del MISMO sitio que el factor', () => {
    // Los umbrales van en UFC (ya multiplicado): tomarlos de un área con otro factor
    // daría niveles que no cuadran con la escala del dato.
    const ras = areaDe('ras-agua');
    const agua = areaDe('mad-agua');
    ['valg', 'vvuln', 'vpara'].forEach((k) => {
      expect([ras[k].l, ras[k].m, ras[k].e]).toEqual([agua[k].l, agua[k].m, agua[k].e]);
    });
  });
});

describe('registros · el TABLERO clasifica el RAS igual que la ficha', () => {
  it('🔴 los umbrales de los tres vibrios coinciden en las dos apps', () => {
    /* La ficha y el tablero tienen cada uno su copia de MIC_DR_BASE y no se pueden
       importar entre sí. Con umbrales distintos, el MISMO lote saldría «Leve» al
       capturarlo y «Moderado» al mirarlo — que es exactamente la clase de costura que
       este proyecto paga caro. En el tablero sólo hay l/m/e: el factor ya viene
       aplicado en la columna UFC de la hoja. */
    const ficha = areaDe('ras-agua');
    const tablero = loadMicThresholds()['ras-agua'];
    expect(tablero, 'el tablero no conoce el área ras-agua').toBeTruthy();
    ['valg', 'vvuln', 'vpara'].forEach((k) => {
      expect(tablero[k], 'el tablero no clasifica ' + k + ' en RAS').toBeTruthy();
      expect([tablero[k].l, tablero[k].m, tablero[k].e],
        'los umbrales de ' + k + ' divergen entre la ficha y el tablero')
        .toEqual([ficha[k].l, ficha[k].m, ficha[k].e]);
    });
  });
});

describe('registros · Maduración · Agua suma la muestra «Agua de Desove»', () => {
  /** Las opciones de la columna «Muestra» del formato mad-agua de Calidad de Agua. */
  function opcionesDeMuestra() {
    const m = /\{ k:"tipoMuestra", l:"Muestra", type:"sel", opts:\[([^\]]*)\], w:170 \}/.exec(engine);
    if (!m) throw new Error('no se encontró la columna Muestra de Maduración · Agua');
    return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  }

  it('🔴 está, y con la grafía exacta de las tres anteriores', () => {
    /* La grafía es parte del DATO: viaja a la hoja y por ella se agrupa y se filtra.
       «Agua de desove» y «Agua de Desove» serían dos valores distintos para el tablero
       —el defecto que ya costó caro con el Analista—, así que se fija la caja aquí. */
    const opts = opcionesDeMuestra();
    expect(opts).toContain('Agua de Desove');
    expect(opts, 'se coló una segunda grafía del mismo valor').not.toContain('Agua de desove');
  });

  it('🔴 se añade al final, sin tocar las tres que ya existían', () => {
    expect(opcionesDeMuestra()).toEqual([
      '', 'Agua Camaronera', 'Agua Recepción Camaronera', 'Agua Enjuague', 'Agua de Desove',
    ]);
  });
});
