import { describe, it, expect, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { desinfeccionEnCurso, desinfeccionDetalle } from './desinfeccion.js';
import { applySheets } from '../../core/sheets.js';
import { buildFichaPages } from './trazabilidad.js';

const dz = (origin, extra) => ({ _SheetOrigin: origin, ...extra });

afterEach(() => { store.globalData = []; });

describe('desinfeccionEnCurso', () => {
  it('agrupa por módulo+corrida los tipos de INICIO (T2/T3) sin siembra, con tildes', () => {
    store.globalData = [
      dz('Registro_Desinfección', { 'Módulo': 'M01', Corrida: '580', 'Tipo de Registro': 'Desinfección de módulo larvicultura', Fecha: '10/06/2026' }),
      dz('Registro_Desinfección', { 'Módulo': 'M01', Corrida: '580', 'Tipo de Registro': 'Limpieza de materiales y equipos de larvicultura', Fecha: '11/06/2026' }),
    ];
    const res = desinfeccionEnCurso();
    expect(res).toHaveLength(1);
    expect(res[0].mod).toBe('M01');
    expect(res[0].corrida).toBe('580');
    expect(res[0].count).toBe(2);
    expect(res[0].monthIdx).toBe(6); // 580 → Julio (auto-extensión: Junio=573–578, Julio=579+)
    expect(res[0].lastDate.getDate()).toBe(11); // fecha más reciente
  });

  it('EXCLUYE el módulo/corrida que ya tiene datos de Larvicultura (ya sembrado)', () => {
    store.globalData = [
      dz('Registro_Desinfección', { 'Módulo': 'M02', Corrida: '573', 'Tipo de Registro': 'Desinfección de módulo larvicultura', Fecha: '01/06/2026' }),
      dz('Larvicultura', { 'Módulo': 'M02', Corrida: '573', 'Estadío': 'N5' }),
    ];
    expect(desinfeccionEnCurso()).toHaveLength(0);
  });

  it('IGNORA los tipos de cierre (T1/T4, post-cosecha)', () => {
    store.globalData = [
      dz('Registro_Desinfección', { 'Módulo': 'M03', Corrida: '581', 'Tipo de Registro': 'Limpieza y desinfección del área de cosecha', Fecha: '01/06/2026' }),
      dz('Registro_Desinfección', { 'Módulo': 'M03', Corrida: '581', 'Tipo de Registro': 'Limpieza de materiales y equipos de cosechas (Laboratorio)', Fecha: '02/06/2026' }),
    ];
    expect(desinfeccionEnCurso()).toHaveLength(0);
  });

  it('sin hoja de desinfección → arreglo vacío', () => {
    store.globalData = [dz('Larvicultura', { 'Módulo': 'M01', Corrida: '580' })];
    expect(desinfeccionEnCurso()).toEqual([]);
  });

  /* Revisión de la B (2026-11-07) · un módulo con TODO desmarcado en Registros sólo tiene filas en blanco (A10): no está
     «en desinfección». Pasa por la carga real (`applySheets`), que es la que las deja fuera. */
  it('🔴 con todo desmarcado (filas en blanco), no sale «en desinfección» ni en el PDF (antes, gris y una página de «—»)', () => {
    const blanco = (elem) => dz('Registro_Desinfección', { 'Módulo': 'M01', Corrida: '580', 'Tipo de Registro': 'Desinfección de módulo larvicultura',
      'Categoría': 'Materiales', Elemento: elem, Estado: '', Observaciones: '', Fecha: '2026-06-10' });
    applySheets({ 'Registro_Desinfección': [blanco('Reservorio'), blanco('Líneas de agua')],
      Larvicultura: [dz('Larvicultura', { 'Módulo': 'M09', Corrida: '590', Fecha: '2026-06-10' })] });
    expect(store.globalData).toHaveLength(1);   // la carga sí se aplicó
    expect(desinfeccionEnCurso()).toEqual([]);
    expect(desinfeccionDetalle('M01', '580')).toBeNull();
    expect(buildFichaPages('desinfeccion', { mod: 'M01', corrida: '580' })).toEqual([]);
  });
});

describe('desinfeccionDetalle', () => {
  it('agrupa por Tipo→Categoría y calcula cumplimiento = %Sí (sobre Sí+No)', () => {
    store.globalData = [
      dz('Registro_Desinfección', { 'Módulo': 'M01', Corrida: '580', 'Tipo de Registro': 'Desinfección de módulo larvicultura', 'Categoría': 'Materiales', Elemento: 'Botas', Estado: 'Sí', Fecha: '01/06/2026' }),
      dz('Registro_Desinfección', { 'Módulo': 'M01', Corrida: '580', 'Tipo de Registro': 'Desinfección de módulo larvicultura', 'Categoría': 'Materiales', Elemento: 'Manos', Estado: 'No', Fecha: '01/06/2026' }),
      dz('Registro_Desinfección', { 'Módulo': 'M01', Corrida: '580', 'Tipo de Registro': 'Desinfección de módulo larvicultura', 'Categoría': 'Personal', Elemento: 'Ropa', Estado: 'Sí', Fecha: '01/06/2026' }),
      // Otro módulo: NO debe incluirse.
      dz('Registro_Desinfección', { 'Módulo': 'M02', Corrida: '580', 'Tipo de Registro': 'X', 'Categoría': 'Y', Elemento: 'Z', Estado: 'Sí', Fecha: '01/06/2026' }),
    ];
    const d = desinfeccionDetalle('M01', '580');
    expect(d).not.toBeNull();
    expect(d.si).toBe(2);
    expect(d.no).toBe(1);
    expect(d.cumplimiento).toBe(67); // 2/3 → 66.7 redondeado
    expect(d.tipos).toHaveLength(1);
    expect(d.tipos[0].cats).toHaveLength(2); // Materiales + Personal
  });

  it('null si el módulo/corrida no tiene registros', () => {
    store.globalData = [];
    expect(desinfeccionDetalle('M09', '999')).toBeNull();
  });
});

/* A29 (2026-11-06) · una corrida escrita como rango («580-581») va al mes de su primer número; antes, `+c` = NaN: ningún mes. */
describe('A29 · desinfección con la corrida escrita como rango', () => {
  it('«580-581» cae en el mes de la 580', () => {
    store.globalData = [
      dz('Registro_Desinfección', { 'Módulo': 'M02', Corrida: '580-581', 'Tipo de Registro': 'Desinfección de módulo larvicultura', Fecha: '10/06/2026' }),
    ];
    const res = desinfeccionEnCurso();
    expect(res).toHaveLength(1);
    expect(res[0].monthIdx).toBe(6);   // como la 580
  });
});
