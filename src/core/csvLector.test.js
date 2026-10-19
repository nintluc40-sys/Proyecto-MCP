/* ============================================================
   Carga lenta C (pauta 2.3, 2026-10-19, usuario) · el LECTOR DE CSV propio (csvLector.js) da lo MISMO que SheetJS
   Lo que se fija, contra el SheetJS de verdad (public/vendor, el que leía hasta el 19-10 con `raw` + sheet_to_json):
   · casos límite escritos a mano: \r\n, \r suelto, saltos y comas entre comillas, «""», comilla sin cerrar, comilla en
     medio de un campo sin comillas, cabeceras vacías y repetidas (también «constructor» y una «A_1» real), filas más
     largas o más cortas que la cabecera, filas en blanco, espacios, texto vacío;
   · miles de CSV al azar (semilla fija), con un control de que el generador sí produce esos casos;
   · el orden de las claves también (JSON, no toEqual: toEqual no mira el orden);
   · y lo que hace distinto a propósito: lee siempre CSV con coma (SheetJS adivina el formato por el comienzo y el
     separador por lo que más abunda al principio).
   Las 44 hojas reales se compararon aparte el 19-10 (idénticas: 224 116 filas).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { leerCsv } from './csvLector.js';

const ctx = {};
vm.runInNewContext(readFileSync(join(process.cwd(), 'public/vendor/xlsx.full.min.js'), 'utf8'), ctx);
const X = ctx.XLSX;
// el camino de antes, tal cual (sheets.js · filasDeCsv hasta el 19-10)
const deSheetJS = (t) => { const wb = X.read(t, { type: 'string', raw: true, dense: true }); return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false, dateNF: 'dd/mm/yyyy' }); };
const igual = (t) => expect(JSON.stringify(leerCsv(t)), JSON.stringify(t)).toBe(JSON.stringify(deSheetJS(t)));

describe('leerCsv · lo mismo que SheetJS (raw + sheet_to_json), con el orden de las claves', () => {
  it('casos límite escritos a mano', () => {
    const casos = [
      '', 'A', 'A\n', 'A,B\n1,2', 'A,B\r\n1,2\r\n', 'A,B\r1,2\r', 'A,B\r\n"a\r\nb",c\r\n',
      'A,,B\n1,2,3\n', ',,\n1,2,3', ',\n,\n', 'A,A,A_1,A\n1,2,3,4', 'constructor,toString,__EMPTY,\nx,y,z,w',
      'Fecha,Obs\n01/09/2026,"1,5"\n02/09/2026,"línea 1\nlínea 2"\n', 'A,B\n"con ""comillas""",x\n', 'A,B\nx"y,z\n',
      'A,B\n"sin cerrar,1\n2,3', 'A,B\n"",""\n"x",""\n', 'A\n\n\nx\n\n', 'A,B\n , \n  ,x\n', 'A,B\n1,2,3,4\n5\n',
      ' Sala,B\n1,2', 'A,B\n1,2,', 'A,B\n1,"2"x,3\n', '"A","B"\n"1","2"', 'Población,Ñ\n7.400.000,0,🦐\n',
    ];
    for (const t of casos) igual(t);
  });

  it('miles de CSV al azar (semilla fija)', () => {
    let semilla = 20261019;
    const rnd = () => { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646; };
    const elige = (a) => a[Math.floor(rnd() * a.length)];
    const TROZOS = ['a', 'B', '1', '7,5', '8.48', ' ', '  x ', '""', '"', ',', '\n', '\r\n', '\r', 'Fecha', 'constructor',
      '__EMPTY', 'A_1', 'ñandú', '🦐', '-3', '1.061', 'x"y', ''];
    const campo = () => {
      const r = rnd();
      if (r < 0.25) return '';
      const txt = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => elige(TROZOS)).join('');
      if (r < 0.6) return '"' + txt.replace(/"/g, '""') + '"';   // bien entrecomillado (como Google)
      if (r < 0.65) return '"' + txt;                               // comilla sin cerrar
      return txt.replace(/[,\n\r]/g, '');                           // sin comillas
    };
    const control = { crSuelto: 0, sinCerrar: 0, cabVacia: 0, cabRepetida: 0, filaLarga: 0, enBlanco: 0 };
    for (let i = 0; i < 3000; i++) {
      const cols = 1 + Math.floor(rnd() * 6), fin = elige(['\n', '\r\n', '\r']);
      const cab = Array.from({ length: cols }, () => (rnd() < 0.2 ? '' : elige(['Fecha', 'Lote', 'A', 'A', 'A_1', 'constructor', '"x,y"', ' Sala'])));
      const lineas = [cab.join(',')];
      for (let f = Math.floor(rnd() * 7); f > 0; f--) lineas.push(Array.from({ length: rnd() < 0.15 ? Math.floor(rnd() * (cols + 3)) : cols }, campo).join(','));
      const t = lineas.join(fin) + (rnd() < 0.6 ? fin : '');
      igual(t);
      if (/\r(?!\n)/.test(t)) control.crSuelto++;
      if (/(^|,)"[^"]*$/m.test(t)) control.sinCerrar++;
      if (cab.includes('')) control.cabVacia++;
      if (new Set(cab).size < cab.length) control.cabRepetida++;
      if (lineas.slice(1).some((l) => l.split(',').length > cols)) control.filaLarga++;
      if (lineas.slice(1).some((l) => /^,*$/.test(l))) control.enBlanco++;
    }
    for (const [k, n] of Object.entries(control)) expect(n, 'control: el generador produce ' + k).toBeGreaterThan(30);
  });
});

describe('leerCsv · lo que hace distinto a propósito: siempre CSV con coma', () => {
  it('un CSV que empieza por «ID» (SheetJS lo tomaba por otro formato) se lee como CSV', () => {
    expect(leerCsv('ID,Lote\n1,BN\n')).toEqual([{ ID: '1', Lote: 'BN' }]);
  });
  it('con más «;» que comas al principio (SheetJS cambiaba de separador), el separador sigue siendo la coma', () => {
    expect(leerCsv('Obs,Lote\na;b;c;d;e,BN\n')).toEqual([{ Obs: 'a;b;c;d;e', Lote: 'BN' }]);
  });
});
