import { describe, it, expect, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { desinfeccionEnCurso, desinfeccionDetalle } from './desinfeccion.js';

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
