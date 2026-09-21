/* ============================================================
   MADURACIÓN · OPERATIVO — MANEJO (F5.1)

   Qué se exige, con fixtures montados para DISTINGUIR: si la regla se rompe, la cifra es OTRA.

   · Un movimiento le ocurre a DOS ubicaciones: filtrando por la Sala 5 —que sólo aparece como ORIGEN de uno y
     como DESTINO de otro— tienen que salir los dos. Mirar un solo lado deja fuera la mitad.
   · El motivo FUERA del catálogo se marca, no se disimula entre los siete.
   · Los kg de alimento se reparten entre los DÍAS del período, no entre las filas: con dos tanques el mismo
     día, dividir por filas daría la mitad.
   · El % de cada producto se calcula sobre la biomasa de ESAS MISMAS filas, y se compara con la agenda
     estándar DERIVADA de las 14 tomas, no con una tabla escrita aparte.
   · Un día SIN tratamiento es `null`, no cero: pintar un cero diría que se trató y no se aplicó nada.
   · Un lote sin ningún preventivo sale con '' y `cubierto:false`, no con cero días —cero diría «hoy mismo»—.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  matrizDeMovimientos, registroDeMovimientos, ignoraDeMovimientos,
  agendaPorProducto, alimentacionPorProducto, procedenciaDelPeso, ignoraDeAlimentacion,
  calendarioDeTratamientos, productosPorArea, coberturaPreventiva, ignoraDeTratamientos,
} from './operativo.manejo.js';
import { modeloOperativo } from './operativo.data.js';
import { normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import {
  MAD_ALIM_TOMAS_ESTANDAR, MAD_ALIM_PCT_MAX, alimTomasTexto,
} from '../registros/lib/ficha-maduracion-alimentacion.schema.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX',
  Fecha: fecha, Lote: lote, 'Código genético': 'CA', 'Piscina Broodstock': 'P1',
  Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const MOV = (fecha, tipo, so, to, sd, td, machos, hembras, motivo, agua = 'RAS') => ({ _SheetOrigin: O,
  Fecha: fecha, Tipo: tipo, 'Sala origen': so, 'Tanque origen': to, 'Sala destino': sd, 'Tanque destino': td,
  Machos: machos, Hembras: hembras, 'Agua destino': agua, Motivo: motivo, Observaciones: '',
  ID: fecha + so + to + sd + td });
const ALIM = (fecha, sala, tanque, lotes, biomasa, kg, fuente = 'Biometría', tomas = '') => ({ _SheetOrigin: O,
  Fecha: fecha, Sala: sala, Tanque: tanque, Lotes: lotes, Hembras: 10, Machos: 10,
  'Peso hembras (g)': 70, 'Peso machos (g)': 50, 'Fuente del peso': fuente,
  'Biomasa hembras (kg)': biomasa / 2, 'Biomasa machos (kg)': biomasa / 2, 'Biomasa total (kg)': biomasa,
  'Poliqueto (kg/día)': kg.pol || '', 'Redy Mate (kg/día)': kg.redy || '', 'Calamar (kg/día)': kg.cal || '',
  'Mejillón (kg/día)': kg.mej || '', 'Krill (kg/día)': kg.kri || '', 'Vitallis (kg/día)': kg.vit || '',
  'Total (kg/día)': Object.values(kg).reduce((a, b) => a + (b || 0), 0), Tomas: tomas, ID: fecha + sala + tanque });
const FIN = (fecha, lote, tipo, machos, hembras) => ({ _SheetOrigin: O, 'Metabisulfito (kg)': '',
  Fecha: fecha, Lote: lote, Tipo: tipo, Machos: machos, Hembras: hembras });
const TRAT = (fecha, sala, tipo, area, lotes, productos, ras = '') => ({ _SheetOrigin: O, Fecha: fecha,
  Sala: sala, 'Estado de la sala': 'Producción', Tipo: tipo, 'Área': area, Lotes: lotes,
  Productos: productos, 'Productos RAS': ras, 'Dosis y observaciones': '', ID: fecha + sala + area });

const FOTO = '2026-09-20';

/* La planta: SA en la Sala 1 (t1) y SB en la Sala 5 (t9).
   · Movimientos: uno de S1→S5 y otro de S5→S2, para que filtrar por la Sala 5 tenga que encontrar los DOS.
     Uno lleva un motivo que NO está en el catálogo.
   · Alimentación: DOS tanques el MISMO día (18/09) y uno el 19/09 → 2 días, 3 filas.
   · Tratamientos: uno preventivo a SA el 15/09 y uno de desinfección sin preventivos el 19/09. SB, ninguno. */
const PLANTA = [
  ING('2026-09-01', 'SA', 'Sala 1', 1, 20, 20),
  ING('2026-09-01', 'SB', 'Sala 5', 9, 10, 10),
  ING('2026-09-01', 'SC', 'Sala 2', 16, 5, 5),
  FIN('2026-09-16', 'SC', 'Total', 5, 5),

  MOV('2026-09-10', 'Transferencia', 'Sala 1', 1, 'Sala 5', 9, 5, 0, 'Anillado'),
  MOV('2026-09-12', 'Agrupación', 'Sala 5', 9, 'Sala 2', 16, 0, 4, 'Motivo inventado', 'Agua de playa'),
  MOV('2026-09-14', 'Mezcla', 'Sala 1', 1, 'Sala 1', 1, 1, 1, 'Logística'),

  ALIM('2026-09-18', 'Sala 1', 1, 'SA', 100, { cal: 2, kri: 1.5, pol: 1 }),
  ALIM('2026-09-18', 'Sala 5', 9, 'SB', 100, { cal: 2, kri: 1.5, pol: 1 }),
  ALIM('2026-09-19', 'Sala 1', 1, 'SA', 100, { cal: 2, kri: 1.5, pol: 1 }, 'Tecleado'),

  TRAT('2026-09-15', 'Sala 1', 'Preventivo', 'Salas y tanques', 'SA', 'Cooper, Formol'),
  /* ⚠ Lleva LOTE y un producto que NO es preventivo (Bicarbonato es de RAS): si la cobertura dejara de
     filtrar por el catálogo de preventivos, SB saldría cubierto y no lo está. Lo delató la mutación N14. */
  TRAT('2026-09-19', 'Sala 1', 'Desinfección', 'RAS y tuberías', 'SB', '', 'Bicarbonato'),
  // Un área INVENTADA, para que marcarla o no se note (N12).
  TRAT('2026-09-17', 'Sala 5', 'Preventivo', 'Área inventada', '', 'Vitamina C'),
];

const M = modeloOperativo(PLANTA, { fecha: FOTO, hoy: FOTO });
const P30 = periodoDe('30d', FOTO, M.fuentes);
const F = (extra) => normalizarFiltro({ ...(extra || {}) }, M.indice);
const SIN = F();

describe('Maduración · operativo · 🔄 Manejo (F5.1)', () => {
  describe('🔄 movimientos', () => {
    it('🔑 un movimiento le ocurre a las DOS ubicaciones: filtrar por una sala encuentra ambos lados', () => {
      const m = matrizDeMovimientos(M.fuentes, P30, F({ sala: 'Sala 5' }), M.libro);
      // el del 10 (destino S5) y el del 12 (origen S5); mirar un solo lado dejaría uno fuera
      expect(m.total).toBe(2);
      expect(m.celdas.map((c) => c.origen + '→' + c.destino).sort()).toEqual(['Sala 1→Sala 5', 'Sala 5→Sala 2']);
    });

    it('la matriz suma movimientos y animales por par origen → destino', () => {
      const m = matrizDeMovimientos(M.fuentes, P30, SIN, M.libro);
      expect(m.total).toBe(3);
      expect(m.animales).toBe(5 + 4 + 2);
      expect(m.salas).toEqual(['Sala 1', 'Sala 2', 'Sala 5']);
      const c = m.celdas.find((x) => x.origen === 'Sala 1' && x.destino === 'Sala 5');
      expect(c).toMatchObject({ movimientos: 1, animales: 5 });
    });

    it('🔑 un motivo fuera del catálogo se MARCA, no se disimula entre los siete', () => {
      const m = matrizDeMovimientos(M.fuentes, P30, SIN, M.libro);
      const inventado = m.porMotivo.find((x) => x.clave === 'Motivo inventado');
      const bueno = m.porMotivo.find((x) => x.clave === 'Anillado');
      expect(inventado.enCatalogo).toBe(false);
      expect(bueno.enCatalogo).toBe(true);
    });

    it('cuenta por tipo y por agua, y dice lo que no puede filtrar', () => {
      const m = matrizDeMovimientos(M.fuentes, P30, SIN, M.libro);
      expect(m.porTipo.map((x) => x.clave).sort()).toEqual(['Agrupación', 'Mezcla', 'Transferencia']);
      expect(m.porAgua.find((x) => x.clave === 'Agua de playa').movimientos).toBe(1);
      expect(ignoraDeMovimientos(SIN)).toEqual([]);
      expect(ignoraDeMovimientos(F({ lote: 'SA' }))).toEqual(['lote']);
    });

    it('el registro va del más reciente al más antiguo, y marca el circular', () => {
      const r = registroDeMovimientos(M.fuentes, P30, SIN);
      expect(r.map((x) => x.fecha)).toEqual(['2026-09-14', '2026-09-12', '2026-09-10']);
      expect(r[0].circular).toBe(true);        // Sala 1 · 1 → Sala 1 · 1
      expect(r[1].circular).toBe(false);
    });
  });

  describe('🦐 alimentación', () => {
    it('🔑 la agenda por producto se DERIVA de las 14 tomas, no se escribe aparte', () => {
      const a = agendaPorProducto();
      /* 🔑 La agenda tiene 14 huecos y UNO viene en blanco a propósito (las 14:00, sin producto ni %). La
         primera versión lo descartaba en silencio; ahora el recuento CUADRA porque se devuelve aparte. */
      const sumaTomas = a.productos.reduce((x, p) => x + p.tomas, 0);
      expect(a.tomas).toBe(MAD_ALIM_TOMAS_ESTANDAR.length);
      expect(a.sinProducto).toBe(1);
      expect(sumaTomas + a.sinProducto).toBe(a.tomas);
      const cal = a.productos.find((p) => p.producto === 'Calamar');
      const esperado = MAD_ALIM_TOMAS_ESTANDAR.filter((t) => t.producto === 'Calamar')
        .reduce((x, t) => x + t.pct, 0);
      expect(cal.pct).toBeCloseTo(esperado, 3);
    });

    it('🔑 los kg se reparten entre los DÍAS del período, no entre las filas', () => {
      const a = alimentacionPorProducto(M.fuentes, P30, SIN);
      expect(a.filas).toBe(3);
      expect(a.dias).toBe(2);                   // el 18 y el 19
      const cal = a.productos.find((p) => p.producto === 'Calamar');
      // 3 filas × 2 kg = 6 kg en 2 días = 3 kg/día. Dividir por filas daría 2.
      expect(cal.kg).toBe(6);
      expect(cal.kgDia).toBe(3);
    });

    it('🔑 el % se calcula sobre la biomasa de ESAS filas y se compara con la agenda', () => {
      const a = alimentacionPorProducto(M.fuentes, P30, SIN);
      expect(a.biomasa).toBe(300);
      expect(a.biomasaDia).toBe(150);           // 300 en 2 días
      const cal = a.productos.find((p) => p.producto === 'Calamar');
      expect(cal.pct).toBe(2);                  // 3 kg/día sobre 150 kg
      expect(cal.agendaPct).toBeGreaterThan(0);
      expect(cal.desvio).toBe(Math.round((cal.pct - cal.agendaPct) * 100) / 100);
    });

    it('un producto sin planificar no inventa un porcentaje', () => {
      const a = alimentacionPorProducto(M.fuentes, P30, SIN);
      const mej = a.productos.find((p) => p.producto === 'Mejillón');
      expect(mej.kg).toBe(0);
      expect(mej.kgDia).toBe(0);
      // Sin tomas en la fila no hay nada que juzgar: ni tomas, ni tomas fuera de rango.
      expect([mej.tomas, mej.tomasFuera, mej.fuera]).toEqual([0, 0, []]);
    });

    /* 🔑🔑 EL RANGO DE LA FICHA (0,25–2 %) ES POR TOMA. La primera versión lo aplicaba al % DIARIO de cada producto,
       y con la agenda estándar Calamar suma 7 % en cuatro tomas de 1,5–2 %: la ración correcta salía en rojo.
       Este fixture DISTINGUE las dos reglas: Calamar supera el 2 % al DÍA (6 kg/día sobre 150 kg) con todas sus
       tomas dentro del rango; dos tanques de la Sala 1 el MISMO día llevan la misma agenda (se cuenta una vez); y
       la Sala 5 planifica una toma de Krill al 2,5 %, que es la única fuera. */
    describe('el rango se juzga POR TOMA', () => {
      const ESTANDAR = alimTomasTexto(MAD_ALIM_TOMAS_ESTANDAR);
      const M2 = modeloOperativo([
        ING('2026-09-01', 'SA', 'Sala 1', 1, 20, 20),
        ING('2026-09-01', 'SB', 'Sala 5', 9, 10, 10),
        ALIM('2026-09-18', 'Sala 1', 1, 'SA', 100, { cal: 6 }, 'Biometría', ESTANDAR),
        ALIM('2026-09-18', 'Sala 1', 2, 'SA', 100, { cal: 6 }, 'Biometría', ESTANDAR),
        ALIM('2026-09-19', 'Sala 5', 9, 'SB', 100, { kri: 1 }, 'Biometría', '07:00 Krill 2.5; 10:00 Poliqueto 1'),
      ], { fecha: FOTO, hoy: FOTO });
      const a = alimentacionPorProducto(M2.fuentes, periodoDe('30d', FOTO, M2.fuentes), normalizarFiltro({}, M2.indice));
      const de = (p) => a.productos.find((x) => x.producto === p);

      it('🔑 la agenda estándar no sale en rojo aunque Calamar supere el 2 % al día', () => {
        expect(de('Calamar').pct).toBeGreaterThan(MAD_ALIM_PCT_MAX);   // el fixture distingue: juzgar el día la marcaría
        expect(de('Calamar').tomasFuera).toBe(0);
        expect(a.productos.filter((p) => p.producto !== 'Krill').every((p) => p.tomasFuera === 0)).toBe(true);
      });

      it('las tomas se cuentan UNA vez por sala y día, aunque dos tanques lleven la misma agenda', () => {
        expect(de('Calamar').tomas).toBe(MAD_ALIM_TOMAS_ESTANDAR.filter((t) => t.producto === 'Calamar').length);
        expect(de('Poliqueto').tomas).toBe(2);   // la de la Sala 1 el 18 y la de la Sala 5 el 19
      });

      it('la toma fuera de rango se cuenta y se dice cuál es: día, sala, hora y %', () => {
        expect(de('Krill').tomasFuera).toBe(1);
        expect(de('Krill').fuera).toEqual([{ fecha: '2026-09-19', sala: 'Sala 5', hora: '07:00', pct: 2.5 }]);
        expect(a.tomasFuera).toBe(1);
        expect(a.tomas).toBe(a.productos.reduce((x, p) => x + p.tomas, 0));
      });
    });

    it('la proyección mensual es aritmética sobre el ritmo del período', () => {
      const a = alimentacionPorProducto(M.fuentes, P30, SIN);
      expect(a.proyeccionMensual).toBe(Math.round(a.totalDia * 30 * 100) / 100);
    });

    it('el filtro de lote mira si el lote APARECE entre los de la fila', () => {
      const a = alimentacionPorProducto(M.fuentes, P30, F({ lote: 'SB' }));
      expect(a.filas).toBe(1);
      expect(a.dias).toBe(1);
      expect(ignoraDeAlimentacion(F({ codigo: 'CA' }))).toEqual(['código genético']);
    });

    it('dice de dónde salió el peso con el que se calculó la ración', () => {
      const p = procedenciaDelPeso(M.fuentes, P30, SIN);
      expect(p.map((x) => [x.fuente, x.n])).toEqual([['Biometría', 2], ['Tecleado', 1]]);
    });
  });

  describe('🧪 tratamientos', () => {
    it('🔑 un día SIN tratamiento es null, no cero', () => {
      const c = calendarioDeTratamientos(M.fuentes, P30, SIN);
      const s1 = c.filas.find((f) => f.sala === 'Sala 1');
      const i15 = c.dias.indexOf('2026-09-15');
      const i16 = c.dias.indexOf('2026-09-16');
      expect(s1.celdas[i15]).toMatchObject({ tratamientos: 1 });
      expect(s1.celdas[i16]).toBeNull();        // un 0 diría «se trató y no se aplicó nada»
      expect(c.total).toBe(3);
    });

    it('el calendario cubre el período entero y dice que no puede filtrar por tanque', () => {
      const c = calendarioDeTratamientos(M.fuentes, P30, SIN);
      expect(c.dias[0]).toBe(P30.desde);
      expect(c.dias[c.dias.length - 1]).toBe(P30.hasta);
      expect(ignoraDeTratamientos(F({ sala: 'Sala 1', tanque: '1' }))).toContain('tanque');
    });

    it('agrupa los productos por área y marca el área fuera del catálogo', () => {
      const a = productosPorArea(M.fuentes, P30, SIN);
      const salas = a.find((x) => x.area === 'Salas y tanques');
      expect(salas.enCatalogo).toBe(true);
      // 🔑 un área inventada a mano NO se disimula entre las siete (lo delató la mutación N12)
      expect(a.find((x) => x.area === 'Área inventada').enCatalogo).toBe(false);
      expect(salas.productos.map((p) => p.producto).sort()).toEqual(['Cooper', 'Formol']);
      const ras = a.find((x) => x.area === 'RAS y tuberías');
      expect(ras.productos.map((p) => p.producto)).toEqual(['Bicarbonato']);
    });

    it('🔑 un lote SIN preventivo sale sin días, no con cero, y primero', () => {
      const c = coberturaPreventiva(M.fuentes, M.libro, P30, SIN, FOTO);
      expect(c.map((x) => x.lote)).toEqual(['SB', 'SA']);   // el descubierto, delante
      const sb = c.find((x) => x.lote === 'SB');
      const sa = c.find((x) => x.lote === 'SA');
      expect(sb).toMatchObject({ cubierto: false, dias: '', fecha: '' });
      /* 🔑 SB SÍ recibió un tratamiento el 19/09, pero con Bicarbonato, que no es preventivo: si la cobertura
         dejara de filtrar por el catálogo, saldría cubierto. Lo delató la mutación N14. */
      // 🔑 Y SC, cerrado el 16/09, no entra: un lote sin animales no necesita cobertura (N15).
      expect(c.map((x) => x.lote)).not.toContain('SC');
      expect(sa).toMatchObject({ cubierto: true, fecha: '2026-09-15' });
      expect(sa.dias).toBe(5);                              // del 15 al 20
      expect(sa.productos.sort()).toEqual(['Cooper', 'Formol']);
    });

    it('la desinfección NO cuenta como cobertura preventiva', () => {
      // el tratamiento del 19/09 lleva Bicarbonato (RAS) y ningún lote: no cubre a nadie
      const c = coberturaPreventiva(M.fuentes, M.libro, P30, SIN, FOTO);
      expect(c.find((x) => x.lote === 'SA').fecha).toBe('2026-09-15');
    });
  });
});
