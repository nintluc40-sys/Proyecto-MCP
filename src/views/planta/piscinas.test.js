/* ============================================================
   PLANTA · el plano de las piscinas de Broodstock (piscinas.js, M3, 2026-10-27; con su FORMA real, 2026-10-28). Las
   reglas que dio el usuario se comprueban sobre la geometría, sin escribir aquí los números: cuántas hay por zona, el
   SENTIDO de la numeración (San Rafael de derecha a izquierda, Roche de arriba abajo), que ninguna pisa a otra —entre
   POLÍGONOS: con la fila girada, las cajas de dos vecinas se solapan aunque las piscinas no—, que cada una cae dentro del
   contorno de su zona y que el nombre casa como lo guarda la carga de Broodstock (texto sin espacios). Y la forma de la
   captura: la fila de San Rafael sube hacia la derecha, la 772 no es la estrecha, las largas se alargan hacia la derecha.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { ZONAS, CAJA_GENERAL, RECUADRO_NIAGARA, ENTORNO, zonaDePiscina, nombreDePiscina, centro, area } from './piscinas.js';
import { normPiscina } from '../registros/lib/ficha-maduracion-broodstock.schema.js';

const Z = Object.fromEntries(ZONAS.map((z) => [z.id, z]));
const conNombre = (z) => z.piscinas.filter((p) => p.nombre);
const cx = (p) => centro(p.poly)[0], cy = (p) => centro(p.poly)[1];
const consecutivos = (ns) => ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
/** ¿Se pisan dos polígonos CONVEXOS? (ejes separadores: si en algún eje sus sombras no se tocan, no se pisan) */
function sePisan(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], n = [q[1] - p[1], p[0] - q[0]];
      const sombra = (pts) => pts.map((v) => v[0] * n[0] + v[1] * n[1]);
      const sa = sombra(a), sb = sombra(b);
      if (Math.max(...sa) <= Math.min(...sb) || Math.max(...sb) <= Math.min(...sa)) return false;
    }
  }
  return true;
}
/** ¿Está el punto dentro del polígono convexo? (del mismo lado de todos sus lados) */
function dentroDe(pt, poly) {
  const s = poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.sign((q[0] - p[0]) * (pt[1] - p[1]) - (q[1] - p[1]) * (pt[0] - p[0])); });
  return s.every((x) => x >= 0) || s.every((x) => x <= 0);
}
const enCaja = (pt, c) => pt[0] >= c[0] && pt[0] <= c[2] && pt[1] >= c[1] && pt[1] <= c[3];
const convexo = (poly) => {
  const s = poly.map((p, i) => { const q = poly[(i + 1) % poly.length], r = poly[(i + 2) % poly.length]; return Math.sign((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])); });
  return s.every((x) => x > 0) || s.every((x) => x < 0);
};

describe('🦐 Broodstock · el plano de las piscinas (M3, 2026-10-27; la forma, 2026-10-28)', () => {
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

  it('🔴 San Rafael se numera de DERECHA a IZQUIERDA, seguidas, en UNA fila que sube hacia la derecha', () => {
    const sr = [...Z['san-rafael'].piscinas].sort((a, b) => cx(b) - cx(a));
    expect(consecutivos(sr.map((p) => +p.nombre)), sr.map((p) => p.nombre).join(' ')).toBe(true);
    const izq = sr[sr.length - 1], der = sr[0];
    const pendiente = (cy(der) - cy(izq)) / (cx(der) - cx(izq));
    expect(pendiente, 'sube hacia la derecha (la y crece hacia abajo)').toBeLessThan(-0.15);
    expect(pendiente).toBeGreaterThan(-0.3);
    sr.forEach((p) => expect(Math.abs(cy(p) - (cy(izq) + pendiente * (cx(p) - cx(izq)))), p.nombre + ' en la línea de la fila').toBeLessThan(6));
    const ancho = (p) => p.poly[1][0] - p.poly[0][0];
    const [p772, p771, p770, p769] = [...Z['san-rafael'].piscinas];
    expect(p772.nombre).toBe(String(Math.max(...sr.map((p) => +p.nombre))));
    expect(ancho(p772), 'la de la izquierda NO es la estrecha').toBeGreaterThan(1.5 * ancho(p771));
    expect(Math.max(ancho(p771), ancho(p770), ancho(p769)), 'las estrechas son las tres siguientes').toBeLessThan(45);
  });

  it('🔴 Roche se numera de ARRIBA hacia ABAJO, seguidas; la larga con nombre va a la derecha de la columna', () => {
    const columna = Z.roche.piscinas.filter((p) => !p.larga);
    const deArribaAAbajo = [...columna].sort((a, b) => cy(a) - cy(b)).map((p) => +p.nombre);
    expect(consecutivos(deArribaAAbajo), deArribaAAbajo.join(' ')).toBe(true);
    columna.forEach((p) => expect(Math.abs(cx(p) - cx(columna[0])), p.nombre + ' en la columna').toBeLessThan(0.5));
    columna.forEach((p) => expect(p.poly[1][1], p.nombre + ': el bordo sube hacia la derecha, como la fila').toBeLessThan(p.poly[0][1]));
    const larga = Z.roche.piscinas.find((p) => p.larga && p.nombre);
    expect(larga.rect[0]).toBeGreaterThan(Math.max(...columna.map((p) => p.rect[2])));
    const sinNombre = Z.roche.piscinas.filter((p) => p.larga && !p.nombre);
    expect(sinNombre.every((p) => p.rect[0] > larga.rect[2]), 'las tres sin nombre, a la derecha de la larga').toBe(true);
    expect(larga.rect[3] - larga.rect[1]).toBeGreaterThan(3 * (larga.rect[2] - larga.rect[0]));
    const alto = (p) => (p.poly[3][1] - p.poly[0][1] + p.poly[2][1] - p.poly[1][1]) / 2;
    const largas = Z.roche.piscinas.filter((p) => p.larga).sort((a, b) => cx(a) - cx(b));
    largas.slice(1).forEach((p, i) => expect(alto(p), 'se alargan hacia la derecha').toBeGreaterThan(alto(largas[i])));
  });

  it('🔴 cada piscina es un cuadrilátero convexo con área; ninguna pisa a otra; cada una dentro del contorno de su zona', () => {
    const todas = ZONAS.flatMap((z) => z.piscinas.map((p) => ({ z, p })));
    for (let i = 0; i < todas.length; i++) {
      const { z, p } = todas[i];
      expect(p.poly, p.id).toHaveLength(4);
      expect(convexo(p.poly), p.id + ' convexo').toBe(true);
      expect(area(p.poly), p.id + ' tiene área').toBeGreaterThan(100);
      p.poly.forEach((v) => expect(dentroDe(v, z.contorno), `${p.id} dentro del contorno de ${z.nombre}`).toBe(true));
      for (let j = i + 1; j < todas.length; j++) expect(sePisan(p.poly, todas[j].p.poly), `${p.id} / ${todas[j].p.id}`).toBe(false);
    }
    expect(new Set(todas.map((t) => t.p.id)).size, 'ids únicos').toBe(todas.length);
  });

  it('🔴 los contornos de las zonas no se pisan y todo cabe en la vista general; Niágara, en su recuadro', () => {
    for (let i = 0; i < ZONAS.length; i++) {
      ZONAS[i].contorno.forEach((v) => expect(enCaja(v, CAJA_GENERAL), ZONAS[i].nombre + ' en la vista general').toBe(true));
      for (let j = i + 1; j < ZONAS.length; j++) expect(sePisan(ZONAS[i].contorno, ZONAS[j].contorno), ZONAS[i].nombre + ' / ' + ZONAS[j].nombre).toBe(false);
    }
    Z.niagara.contorno.forEach((v) => expect(enCaja(v, RECUADRO_NIAGARA), 'Niágara dentro de su recuadro').toBe(true));
    ZONAS.filter((z) => !z.aparte).forEach((z) => z.contorno.forEach((v) => expect(enCaja(v, RECUADRO_NIAGARA), z.nombre + ' fuera del recuadro').toBe(false)));
  });

  it('🔴 Niágara: dos recintos partidos en dos (cuatro piscinas pegadas de dos en dos) y una más grande', () => {
    const [a, b, c, d, grande] = Z.niagara.piscinas.map((p) => p.poly);
    const hueco = (x, y) => y[0][0] - x[1][0];   // de la esquina de arriba a la derecha de una a la de arriba a la izquierda de la otra
    expect(hueco(a, b), 'pareja 1: sólo la división').toBeLessThan(hueco(b, c));
    expect(hueco(c, d), 'pareja 2: sólo la división').toBeLessThan(hueco(b, c));
    expect(Math.min(...[a, b, c, d].map((p) => area(grande) / area(p))), 'la grande, más del 50 % mayor que cada una').toBeGreaterThan(1.5);
  });

  it('el nombre de cada zona va dentro del mapa y no encima de ninguna piscina (antes, «Roche» tapaba la 772)', () => {
    for (const z of ZONAS) {
      expect(enCaja(z.rotulo, CAJA_GENERAL), z.nombre).toBe(true);
      expect(z.rotulo[1] - 19, z.nombre + ': cabe por arriba').toBeGreaterThan(CAJA_GENERAL[1]);
      ZONAS.forEach((o) => o.piscinas.forEach((p) => expect(dentroDe(z.rotulo, p.poly), z.nombre + ' sobre ' + p.id).toBe(false)));
    }
    expect(enCaja(Z.niagara.rotulo, RECUADRO_NIAGARA), 'el de Niágara, en su recuadro').toBe(true);
  });

  it('el entorno: polígonos con área y caminos con ancho, dentro de la vista general', () => {
    const polys = [...ENTORNO.aguas, ...ENTORNO.vegetacion];
    expect(polys.length).toBeGreaterThan(4);
    polys.forEach((p, i) => { expect(area(p), 'polígono ' + i).toBeGreaterThan(50); p.forEach((v) => expect(enCaja(v, CAJA_GENERAL)).toBe(true)); });
    ENTORNO.caminos.forEach((c) => { expect(c.w).toBeGreaterThan(0); expect(c.p.length).toBeGreaterThan(1); });
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
