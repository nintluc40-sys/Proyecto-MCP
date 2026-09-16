/* ============================================================
   R7 · EL ANALISTA, EN UNA SOLA GRAFÍA (usuario, 2026-09-16)

   EL DEFECTO, MEDIDO. El campo «Responsable» es texto libre —su datalist sólo SUGIERE—, así que
   la misma persona quedó escrita de dos formas en la hoja: en «Calidad de Agua», «Ramirez» 512
   filas contra «Ramírez» 191, y «Macias» 323 contra «Macías» 212. El 63 % usaba una grafía que ni
   siquiera está en el catálogo. Consecuencia: cualquier recuento por analista partía a la persona
   en dos, y el PDF de la placa llegaba a firmar «Macías · Macias».

   DECISIÓN DEL USUARIO: se unifica, y la forma correcta es CON TILDE.

   SON DOS MITADES Y NINGUNA BASTA SOLA:
     · la CAPTURA (monolito) canoniza al guardar → arregla lo que se escriba de ahora en adelante;
     · el TABLERO (este módulo) pliega al leer  → arregla las 835 filas que YA están, sin migrar
       la hoja ni tocar un solo dato.

   🔑 POR QUÉ ESTA PRUEBA EJECUTA LAS DOS. Si las dos mitades divergieran, la captura escribiría
   una forma y el tablero plegaría a otra: volvería el mismo defecto por la puerta de atrás, y con
   los dos lados «verdes» por separado. Así que aquí se extrae la función REAL del monolito, se
   ejecuta en una caja, y se exige que conteste EXACTAMENTE lo mismo que la del módulo para una
   tabla que incluye los casos de borde (vacío, desconocido, y los que `sanitizeStr` recorta).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { canonAnalista, MIC_ANALISTAS } from './data.js';
import { sanitizeStr } from '../../core/trovan.js';

const leer = (u) => readFileSync(new URL(u, import.meta.url), 'utf8').split('\r\n').join('\n');
const engineSrc = leer('../../../public/registros/engine.js');

/* ⚠⚠ `Music\index (8).html` NO ESTÁ EN EL REPO, así que en la CI NO EXISTE. Una prueba que lo lea
   a secas deja el despliegue en rojo — pasó el 2026-09-16: la suite cayó en GitHub Actions y Pages
   no llegó a publicarse (la puerta hizo su trabajo, pero el rojo era mío, no del código).
   🔑 Por eso se lee si está y, si no, se SALTA sólo lo suyo. La paridad con `index (8)` no se
   pierde: la exige `verificar-3copias-v3` en la máquina donde ese archivo vive, que es justo el
   reparto de siempre —la CI vigila el repo; los verificadores de copias, los dos destinos—.
   ⚠ Lo que NO es opcional es lo del repo: `engine.js` se comprueba siempre. */
let musicSrc = null;
try {
  musicSrc = leer('../../../../../Music/index (8).html');
} catch (_) {
  musicSrc = null;
}
const conMusic = musicSrc ? it : it.skip;

/* El catálogo tal y como lo declara cada monolito, leído del fuente (no tecleado aquí). */
function catalogoDe(src, quien) {
  const m = src.match(/const MIC_ANALISTAS = (\[[^\]]*\]);/);
  if (!m) throw new Error('no se encontró MIC_ANALISTAS en ' + quien);
  return JSON.parse(m[1]);
}

/* La función REAL del monolito, ejecutada en una caja con el `sanitizeStr` de verdad. */
function canonDelMonolito() {
  const trozo = (nombre) => {
    const i = engineSrc.indexOf('function ' + nombre + '(');
    if (i < 0) throw new Error('no se encontró ' + nombre + ' en engine.js');
    const j = engineSrc.indexOf('\n}\n', i);
    return engineSrc.slice(i, j + 2);
  };
  const ctx = { sanitizeStr };
  createContext(ctx);
  new Script(
    'const MIC_ANALISTAS = ' + JSON.stringify(catalogoDe(engineSrc, 'engine.js')) + ';\n'
    + trozo('_analistaPlano') + '\n' + trozo('micAnalistaCanon')
    + '\n;globalThis.__canon = micAnalistaCanon;',
  ).runInContext(ctx);
  return ctx.__canon;
}

/* La tabla de casos. Se usa para las dos mitades, así que un caso que sólo pase en una se ve. */
const CASOS = [
  ['Macias', 'Macías'],
  ['macias', 'Macías'],
  ['MACÍAS', 'Macías'],
  ['  macías  ', 'Macías'],
  /* Los espacios de dentro se pliegan para COMPARAR, pero el valor devuelto es el tecleado: como
     «Ma  cias» no casa con ninguna entrada, sale tal cual —con sus dos espacios— en vez de
     inventarse una limpieza. Se deja en la tabla justo por eso. */
  ['Ma  cias', 'Ma  cias'],
  ['Ramirez', 'Ramírez'],
  ['RAMIREZ', 'Ramírez'],
  ['Ramírez', 'Ramírez'],
  ['Espinoza', 'Espinoza'],
  ['cayra', 'Cayra'],
  ['Chumo', 'Chumo'],
  ['', ''],
  ['   ', ''],
  ['Villamar', 'Villamar'],          // no está en el catálogo: se respeta tal cual
  ['villamar', 'villamar'],          // …y no se le cambia ni la caja
  ['=Macias', 'Macías'],             // sanitizeStr quita el '=' y entonces SÍ casa
];

describe('R7 · la grafía del analista se pliega a la del catálogo', () => {
  it('🔴 «Macias» y «Ramirez» dejan de ser personas distintas', () => {
    expect(canonAnalista('Macias')).toBe('Macías');
    expect(canonAnalista('Ramirez')).toBe('Ramírez');
    expect(canonAnalista('Macias')).toBe(canonAnalista('Macías'));
    expect(canonAnalista('Ramirez')).toBe(canonAnalista('RAMÍREZ'));
  });

  it('🔴 un nombre que NO está en el catálogo se respeta: no se convierte a nadie', () => {
    expect(canonAnalista('Villamar')).toBe('Villamar');
    expect(canonAnalista('Macíaz')).toBe('Macíaz');       // una letra distinta ya es otra persona
  });

  it('el fixture ejerce algo: el catálogo lleva las cinco, y con su tilde', () => {
    expect(MIC_ANALISTAS).toEqual(['Macías', 'Ramírez', 'Espinoza', 'Cayra', 'Chumo']);
    expect(MIC_ANALISTAS.filter((a) => a !== sanitizeStr(a))).toEqual([]);
  });

  it('la tabla entera, en el módulo', () => {
    for (const [dado, esperado] of CASOS) expect(canonAnalista(dado), JSON.stringify(dado)).toBe(esperado);
  });
});

describe('R7 · las dos mitades no pueden divergir', () => {
  it('🔴 el catálogo del módulo es el MISMO que el del motor del repo', () => {
    expect(catalogoDe(engineSrc, 'engine.js')).toEqual(MIC_ANALISTAS);
  });

  conMusic('🔴 …y el mismo que el de index (8), cuando ese archivo está a mano', () => {
    expect(catalogoDe(musicSrc, 'index (8).html')).toEqual(MIC_ANALISTAS);
  });

  it('🔴 la función del monolito contesta lo MISMO que la del módulo, caso por caso', () => {
    const canonMono = canonDelMonolito();
    for (const [dado, esperado] of CASOS) {
      expect(canonMono(dado), 'monolito · ' + JSON.stringify(dado)).toBe(esperado);
      expect(canonMono(dado), 'paridad · ' + JSON.stringify(dado)).toBe(canonAnalista(dado));
    }
  });

  /* Sin esto, `micAnalistaCanon` podría existir y no llamarla nadie: el defecto seguiría vivo con
     la función escrita justo al lado. Son tres formularios: Bacteriología, Calidad de Agua y
     Patología. */
  const laUsanLosTres = (src, quien) => {
    expect((src.match(/meta\.responsable\s*=\s*micAnalistaCanon\(re\.value\)/g) || []).length, quien).toBe(3);
    expect(src, quien).not.toMatch(/meta\.responsable\s*=\s*sanitizeStr\(re\.value\)/);
  };

  it('🔴 la captura la USA: los tres formularios del motor guardan el Responsable canonizado', () => {
    laUsanLosTres(engineSrc, 'engine.js');
  });

  conMusic('🔴 …y los tres de index (8) también, cuando ese archivo está a mano', () => {
    laUsanLosTres(musicSrc, 'index (8).html');
  });
});
