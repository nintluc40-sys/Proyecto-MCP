/* ============================================================
   PLANTA · el plano de las piscinas de Broodstock (piscinas.js, M3, 2026-10-27). Las reglas que dio el usuario se
   comprueban sobre la geometría, sin escribir aquí los números: cuántas hay por zona, el SENTIDO de la numeración
   (San Rafael de derecha a izquierda, Roche de arriba abajo), que ninguna pisa a otra, que cada una cae dentro de su
   zona y que el nombre casa como lo guarda la carga de Broodstock (texto sin espacios).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { ZONAS, CAJA_GENERAL, zonaDePiscina, nombreDePiscina } from './piscinas.js';
import { normPiscina } from '../registros/lib/ficha-maduracion-broodstock.schema.js';

const Z = Object.fromEntries(ZONAS.map((z) => [z.id, z]));
const conNombre = (z) => z.piscinas.filter((p) => p.nombre);
const cx = (p) => (p.rect[0] + p.rect[2]) / 2, cy = (p) => (p.rect[1] + p.rect[3]) / 2;
const pisa = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const dentro = (r, c) => r[0] >= c[0] && r[1] >= c[1] && r[2] <= c[2] && r[3] <= c[3];
const consecutivos = (ns) => ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);

describe('🦐 Broodstock · el plano de las piscinas (M3, 2026-10-27)', () => {
  it('🔴 las tres zonas, con las piscinas que dio el usuario', () => {
    expect(ZONAS.map((z) => z.nombre)).toEqual(['San Rafael', 'Roche', 'Niágara']);
    expect(Z['san-rafael'].piscinas.length).toBe(12);
    expect(conNombre(Z['san-rafael']).length, 'San Rafael: las 12 con número').toBe(12);
    const roche = Z.roche.piscinas;
    expect(roche.filter((p) => !p.larga).length, 'Roche: 9 en columna').toBe(9);
    expect(roche.filter((p) => p.larga).length, 'Roche: 4 largas (la 739 y 3 sin nombre)').toBe(4);
    expect(roche.filter((p) => p.larga && p.nombre).length, 'una sola larga con nombre').toBe(1);
    expect(Z.niagara.piscinas.length).toBe(5);
    expect(conNombre(Z.niagara).length, 'Niágara: aún sin nombre').toBe(0);
    expect(Z.niagara.aparte, 'Niágara está en otro sector').toBe(true);
  });

  it('🔴 San Rafael se numera de DERECHA a IZQUIERDA, seguidas', () => {
    const deDerechaAIzquierda = [...Z['san-rafael'].piscinas].sort((a, b) => cx(b) - cx(a)).map((p) => +p.nombre);
    expect(consecutivos(deDerechaAIzquierda), deDerechaAIzquierda.join(' ')).toBe(true);
    expect(Z['san-rafael'].piscinas.every((p) => cy(p) === cy(Z['san-rafael'].piscinas[0])), 'en una sola fila').toBe(true);
  });

  it('🔴 Roche se numera de ARRIBA hacia ABAJO, seguidas, y la larga con nombre va a la derecha de la columna', () => {
    const columna = Z.roche.piscinas.filter((p) => !p.larga);
    const deArribaAAbajo = [...columna].sort((a, b) => cy(a) - cy(b)).map((p) => +p.nombre);
    expect(consecutivos(deArribaAAbajo), deArribaAAbajo.join(' ')).toBe(true);
    expect(columna.every((p) => cx(p) === cx(columna[0])), 'en una sola columna').toBe(true);
    const larga = Z.roche.piscinas.find((p) => p.larga && p.nombre);
    const derechaDeLaColumna = Math.max(...columna.map((p) => p.rect[2]));
    expect(larga.rect[0]).toBeGreaterThan(derechaDeLaColumna);
    const sinNombre = Z.roche.piscinas.filter((p) => p.larga && !p.nombre);
    expect(sinNombre.every((p) => p.rect[0] > larga.rect[2]), 'las tres sin nombre, a la derecha de la larga').toBe(true);
    // larga: más alta que ancha, y más alta que cualquiera de la columna
    expect(larga.rect[3] - larga.rect[1]).toBeGreaterThan(3 * (larga.rect[2] - larga.rect[0]));
  });

  it('🔴 ninguna piscina pisa a otra; cada una dentro de su zona; las zonas no se pisan; todo dentro de la vista general', () => {
    const todas = ZONAS.flatMap((z) => z.piscinas.map((p) => ({ z, p })));
    for (let i = 0; i < todas.length; i++) {
      expect(dentro(todas[i].p.rect, todas[i].z.caja), `${todas[i].p.id} dentro de ${todas[i].z.nombre}`).toBe(true);
      expect(todas[i].p.rect[2] > todas[i].p.rect[0] && todas[i].p.rect[3] > todas[i].p.rect[1], todas[i].p.id + ' tiene área').toBe(true);
      for (let j = i + 1; j < todas.length; j++) expect(pisa(todas[i].p.rect, todas[j].p.rect), `${todas[i].p.id} / ${todas[j].p.id}`).toBe(false);
    }
    for (let i = 0; i < ZONAS.length; i++) {
      expect(dentro(ZONAS[i].caja, CAJA_GENERAL), ZONAS[i].nombre + ' en la vista general').toBe(true);
      for (let j = i + 1; j < ZONAS.length; j++) expect(pisa(ZONAS[i].caja, ZONAS[j].caja), ZONAS[i].nombre + ' / ' + ZONAS[j].nombre).toBe(false);
    }
    expect(new Set(todas.map((t) => t.p.id)).size, 'ids únicos').toBe(todas.length);
  });

  it('🔴 Niágara: dos recintos partidos en dos (cuatro piscinas pegadas de dos en dos) y una más grande', () => {
    const [a, b, c, d, grande] = Z.niagara.piscinas.map((p) => p.rect);
    const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
    expect(b[0] - a[2], 'pareja 1: sólo la división').toBeLessThan(c[0] - b[2]);
    expect(d[0] - c[2], 'pareja 2: sólo la división').toBeLessThan(c[0] - b[2]);
    expect(Math.min(...[a, b, c, d].map((r) => area(grande) / area(r))), 'la grande, más del 50 % mayor que cada una').toBeGreaterThan(1.5);
  });

  it('🔴 el nombre casa como lo guarda la carga de Broodstock (texto sin espacios), y lo que no está en el plano, null', () => {
    for (const z of ZONAS) for (const p of conNombre(z)) {
      expect(zonaDePiscina(p.nombre)).toBe(z.id);
      expect(zonaDePiscina(' ' + p.nombre + ' '), 'con espacios').toBe(z.id);
      expect(zonaDePiscina(+p.nombre), 'como número').toBe(z.id);
      expect(nombreDePiscina(' ' + p.nombre + ' ')).toBe(normPiscina(' ' + p.nombre + ' '));
    }
    const fuera = String(Math.max(...ZONAS.flatMap((z) => conNombre(z).map((p) => +p.nombre))) + 1000);
    expect(zonaDePiscina(fuera)).toBeNull();
    expect(zonaDePiscina('')).toBeNull();
    expect(zonaDePiscina(null)).toBeNull();
    expect(zonaDePiscina(Z.niagara.piscinas[0].id), 'el id de una sin nombre no es un nombre').toBeNull();
  });
});
