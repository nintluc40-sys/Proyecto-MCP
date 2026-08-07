// GUARDIÁN de sincronía entre las DOS copias de la clasificación de sistemas de algas:
//   · `sysCat` / `SYS_CATS`      → views/algas/index.js   (original)
//   · `algSysCat` / `ALG_SYS_CATS` → views/visitante/index.js (copia literal)
//
// Visitante no importa la vista Algas para no arrastrarla a su bundle base, así que la
// función está duplicada. Ambos ficheros llevaban un comentario diciendo que este test
// existía; NO existía —ni podía, porque la copia era privada—, de modo que las dos
// versiones podían divergir en silencio y el panel público habría clasificado los cultivos
// de forma distinta a la vista Algas.
//
// El contraste se hace sobre entradas que ejercitan TODAS las ramas y los bordes conocidos,
// no sobre un puñado de casos felices: si una copia cambia una regla, alguna entrada de
// esta lista tiene que cambiar de categoría.
import { describe, it, expect } from 'vitest';
import { sysCat, SYS_CATS } from '../algas/index.js';
import { algSysCat, ALG_SYS_CATS } from './index.js';

// Cada rama de la función + los bordes que motivaron su forma actual.
const ENTRADAS = [
  // PBR y Premasivos (prefijo; Premasivos ANTES que Masivos)
  'PBR', 'PBR1', 'pbr12', 'PM', 'PM2', 'pm10',
  // Fundas ACOTADA: F, FM, FP con dígitos opcionales — y lo que NO debe entrar
  'F', 'FM', 'FP', 'F3', 'FM1', 'FP2', 'FILTRO', 'FUCUS', 'FX1', 'FMM1',
  // Carboys y Masivos exigen dígito
  'C1', 'C12', 'C', 'CARBOY', 'M1', 'M10', 'M', 'MASIVO',
  // Vacíos y ruido
  '', '   ', null, undefined, 0, 'XYZ', 'Otros', 'pbr', '  m2  ', 'Pm3',
];

describe('algSysCat (Visitante) sincronizada con sysCat (Algas)', () => {
  it('las dos copias clasifican IGUAL todas las entradas', () => {
    const dif = ENTRADAS.filter((e) => sysCat(e) !== algSysCat(e))
      .map((e) => `${JSON.stringify(e)}: algas=${sysCat(e)} · visitante=${algSysCat(e)}`);
    expect(dif).toEqual([]);
  });

  it('la lista de categorías es la misma y en el mismo orden', () => {
    expect(ALG_SYS_CATS).toEqual(SYS_CATS);
  });

  it('el juego de entradas ejercita de verdad todas las categorías', () => {
    // Si una futura poda dejara la lista sin cubrir alguna rama, el guardián de arriba
    // pasaría sin comparar nada relevante.
    const vistas = new Set(ENTRADAS.map((e) => sysCat(e)));
    SYS_CATS.forEach((c) => expect(vistas.has(c)).toBe(true));
    expect(vistas.has(null)).toBe(true); // y el caso "sin sistema"
  });
});
