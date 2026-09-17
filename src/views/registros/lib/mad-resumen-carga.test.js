// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · ⚖️ SALDO · LO NUEVO EN EL RESUMEN, Y LA CARGA POR TANQUE

   Pedido del usuario (2026-09-15): «en Saldos actualiza las variables del resumen con todo lo
   nuevo integrado, y añade al resumen por tanque la estimación de Carga métrica y Carga
   volumétrica promedio».

   LAS DOS CARGAS SON ESTIMACIONES, y estas pruebas fijan de qué:
     · CARGA MÉTRICA = biomasa viva del tanque en kg = (♀ × peso♀ + ♂ × peso♂) ÷ 1000, con los
       ÚLTIMOS pesos registrados del lote. Sin ningún peso queda VACÍA, nunca en cero.
     · CARGA VOLUMÉTRICA PROMEDIO = esa biomasa ÷ el volumen de UN tanque de su sala (1 t de agua
       = 1 m³). Las toneladas registradas YA SON las de un tanque, así que no se dividen entre
       nada: es «promedio» porque la cifra es la misma para todos los tanques de la sala —el
       volumen típico de uno—, no porque se reparta.

   ⚠⚠ ESTE PÁRRAFO DECÍA LO CONTRARIO —«las toneladas de la sala ENTRE SUS TANQUES»— y era el
   modelo equivocado, el que se retiró el 2026-09-16 con el Excel del módulo delante: repartirlas
   multiplicaba la carga por el número de tanques (14,8 kg/m³ donde el Excel da 1,17). Las
   aserciones de abajo sí se corrigieron ese día; la prosa no, y se quedó nueve líneas por encima
   de un «Sala 1: 5,5 t POR TANQUE» que decía justo lo opuesto. Un comentario que contradice a su
   propio fixture es peor que no tenerlo: enseña a no leer los de al lado.

   Y las otras cinco variables que el resumen no veía: las toneladas, la alcalinidad por área (de
   la sala y del RAS), la revisión de nauplios con el fototropismo y la aireación nuevos, y las
   observaciones sanitarias y operativas de los tanques.

   🔑 EL FIXTURE ESTÁ ELEGIDO PARA QUE DISTINGA. Las dos salas tienen volúmenes muy distintos
   (Sala 1: 5,5 t por tanque · Sala 2: 21 t), así que tomar el de la sala equivocada NO da lo
   mismo; y la alcalinidad del RAS y la de la sala llevan cifras distintas,
   para que cruzarlas se note.

   El cálculo puro ya lo prueba `mad-resumen.test.js` (y su paridad con el monolito). Aquí se
   comprueba lo que sólo vive en el monolito: que las variables existan en ⚙️ Variables, que cada
   una pinte lo suyo y que apagarla lo quite.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadSaldo', 'madSaldoRefrescar', 'madResVarsAbrir', 'madResVarsAplicar', 'MAD_RES_VARS_KEY',
  '_gasVersionLocal'];   // 2026-09-16 · el portón compara el SELLO: el fixture usa el de esta app
const H = {};

/* Lote AB: ingresa con 30♂ y 60♀ en la Sala 1 t1, y 10♂ y 20♀ en la Sala 2 t16.
   Pesos del último día con peso (01-20): ♂ 40 g · ♀ 50 g.
   🔑 La carga va sobre los animales VIVOS del libro, no sobre los ingresados: la hembra que muere
   en el tanque de desove (01-11) deja la Sala 1 t1 en 59♀, y por eso la cifra no es la del
   ingreso. Si alguien «simplificara» leyendo los ingresos, estas dos cuentas lo dirían:
     → Sala 1 t1: (59×50 + 30×40) ÷ 1000 = 4,15 kg ÷ 5,5 m³ = 0,75 kg/m³
     → Sala 2 t16: (20×50 + 10×40) ÷ 1000 = 1,4 kg ÷ 21 m³ = 0,07 kg/m³ */
const HOJAS = {
  'Maduración Ingreso': [
    { Fecha: '2026-01-01', Lote: 'AB', 'Código genético': 'CG1', Sala: 'Sala 1', Tanque: 1, Machos: 30, Hembras: 60 },
    { Fecha: '2026-01-01', Lote: 'AB', 'Código genético': 'CG1', Sala: 'Sala 2', Tanque: 16, Machos: 10, Hembras: 20 },
  ],
  'Maduración Movimientos': [],
  'Maduración Tanques': [
    { Fecha: '2026-01-20', Sala: 'Sala 1', Tanque: 1, 'Peso promedio machos (g)': 40, 'Peso promedio hembras (g)': 50,
      'Observaciones sanitarias': 'Necrosis en urópodos · Branquias oscuras', 'Observaciones operativas': 'Aireación baja' },
    { Fecha: '2026-01-20', Sala: 'Sala 2', Tanque: 16, 'Peso promedio machos (g)': 40, 'Peso promedio hembras (g)': 50 },
  ],
  'Maduración Fin de Ciclo': [],
  'Maduración Mortalidad Desove': [
    { Fecha: '2026-01-11', Lote: 'AB', 'Tipo de tanque': 'Desove', 'Hembras que entran': 10, 'Hembras muertas': 1 },
    // La revisión de nauplios: la columna que sólo ella trae es «Revisión».
    { Fecha: '2026-01-21', Lote: 'AB', 'Revisión': 'Entrada', Deformidad: 'Baja', Actividad: 'Alta', Hongos: 'Ausente',
      Fototropismo: 'Alta', 'Aireación': 'Media', Salinidad: 33, Temperatura: 28.5 },
    /* La alcalinidad: la columna que sólo ella trae es «Área». Dos áreas con cifras distintas.
       PE1.5 (2026-09-16): de día y de noche, cada turno su columna; la de noche de la Sala 1 llega otro día. */
    { Fecha: '2026-01-21', 'Área': 'Sala 1', 'Alcalinidad día': 142 },
    { Fecha: '2026-01-22', 'Área': 'Sala 1', 'Alcalinidad noche': 139 },
    { Fecha: '2026-01-21', 'Área': 'RAS', 'Alcalinidad día': 118, 'Alcalinidad noche': 116 },
  ],
  'Maduración Sala': [
    { Fecha: '2026-01-20', Sala: 'Sala 1', Estado: 'Producción', RAS: '25%', 'Temperatura 2:00': 28, 'Oxígeno 06:00': 5 },
    // La Sala 2 no registra toneladas: tira del catálogo (21 t).
    { Fecha: '2026-01-20', Sala: 'Sala 2', Estado: 'Producción', RAS: 'No' },
  ],
  'Maduración Lotes': [],
  'Maduración Tratamientos': [],
};

let respuestaVer = null;

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
      clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; } };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, globalThis.localStorage, globalThis);
  H.setToast(() => {});
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify(respuestaVer) };
    const m = /sheet=([^&]+)/.exec(u);
    const filas = m && HOJAS[m[1]];
    const cuerpo = filas ? JSON.stringify({ ok: true, headers: [], rows: filas }) : JSON.stringify({ ok: false, error: 'Hoja no permitida' });
    return { ok: true, status: 200, text: async () => cuerpo };
  };
});

const cuerpo = () => document.getElementById('ms-body');
const texto = () => cuerpo().textContent.replace(/\s+/g, ' ');

/** Deja marcadas SÓLO las variables pedidas y repinta. */
const soloEstas = (ids) => {
  H.madResVarsAbrir();
  document.querySelectorAll('#ms-vars .ms-var').forEach((c) => { c.checked = ids.indexOf(c.value) !== -1; });
  H.madResVarsAplicar();
};

beforeEach(async () => {
  localStorage.removeItem(H.MAD_RES_VARS_KEY);
  respuestaVer = { ok: true, version: H._gasVersionLocal() };   // el GAS desplegado ES el de esta app
  document.getElementById('fp-saldo').innerHTML = '';
  H.renderMadSaldo();
  await H.madSaldoRefrescar();
});

describe('Saldo · el fixture llega entero (si no, lo de abajo no prueba nada)', () => {
  it('se leyeron las hojas y el lote AB está en sus dos salas', () => {
    expect(texto()).not.toContain('No se pudieron leer las hojas');
    expect(texto()).toContain('Lote AB');
    expect(texto()).toContain('🏠 Sala 1');
    expect(texto()).toContain('🏠 Sala 2');
  });
});

describe('Saldo · Carga métrica y Carga volumétrica promedio por tanque', () => {
  it('🔴 cada tanque con su biomasa, su carga y el volumen con el que se dividió', () => {
    soloEstas(['lote-carga']);
    const t = texto();
    expect(t).toContain('Sala 1 t1: 4.15 kg · 0.75 kg/m³ (5.5 m³)');
    expect(t).toContain('Sala 2 t16: 1.4 kg · 0.07 kg/m³ (21 m³)');
  });

  it('🔑 las dos salas NO dan lo mismo: el volumen sale de SU sala, no de una cualquiera', () => {
    soloEstas(['lote-carga']);
    // 5,5 m³ frente a 21 m³. Si se cruzaran, la prueba de arriba caería.
    expect(texto()).not.toContain('Sala 1 t1: 4.15 kg · 0.2 kg/m³');
  });

  it('se enseña el volumen usado: una carga que no se puede comprobar no sirve', () => {
    soloEstas(['lote-carga']);
    expect(texto()).toMatch(/kg\/m³ \(5\.5 m³\)/);
  });

  it('apagar la variable la quita del resumen', () => {
    soloEstas(['lote-poblacion']);
    expect(texto()).not.toContain('Carga por tanque');
    expect(texto()).toContain('Población actual');
  });
});

describe('Saldo · las toneladas de la sala', () => {
  it('lo registrado va con su fecha; lo que sale del catálogo lo dice', () => {
    soloEstas(['sala-toneladas']);
    const t = texto();
    // La Sala 1 no registró toneladas en el fixture → catálogo, y se avisa.
    expect(t).toContain('5.5 t (por defecto) = 5.5 m³ (15 tanques en la sala)');
    expect(t).toContain('21 t (por defecto) = 21 m³ (6 tanques en la sala)');
  });

  it('🔑 lo REGISTRADO manda, y entonces el gris es la fecha y no «por defecto»', async () => {
    HOJAS['Maduración Sala'].push({ Fecha: '2026-01-22', Sala: 'Sala 2', Toneladas: 10.5 });
    try {
      await H.madSaldoRefrescar();
      soloEstas(['sala-toneladas']);
      expect(texto()).toContain('10.5 t (2026-01-22) = 10.5 m³ (6 tanques en la sala)');
    } finally { HOJAS['Maduración Sala'].pop(); }
  });
});

describe('Saldo · la alcalinidad por área (Inf. Supervisor)', () => {
  it('🔴 la de la SALA va a su tarjeta y la del RAS a la suya, sin cruzarse', () => {
    soloEstas(['sala-alcalinidad', 'ras-alc']);
    const t = texto();
    expect(t).toContain('142 mg/L');                       // Sala 1 · día
    expect(t).toContain('139 mg/L');                       // Sala 1 · noche
    expect(t).toContain('118 mg/L');                       // RAS · día
    expect(t).toContain('116 mg/L');                       // RAS · noche
    expect(t).toContain('💧 RAS');
    /* La Sala 2 no tiene alcalinidad registrada: sale «—». Se cuentan LAS cifras: si la del
       RAS se colara como respaldo, el 118 aparecería también en la tarjeta de la Sala 2. */
    for (const v of ['142', '139', '118', '116']) expect(t.match(new RegExp(v + ' mg/L', 'g')), v).toHaveLength(1);
  });

  it('🔴 PE1.5 · una fila por TURNO, cada una con su fecha: la de noche no borra la de día', () => {
    soloEstas(['sala-alcalinidad']);
    const t = texto();
    expect(t).toContain('Alcalinidad ☀️ día');
    expect(t).toContain('Alcalinidad 🌙 noche');
    expect(t).toMatch(/142 mg\/L\s*\(?2026-01-21/);
    expect(t).toMatch(/139 mg\/L\s*\(?2026-01-22/);
  });

  it('la tarjeta del RAS aparece por la alcalinidad SOLA, sin tratamientos', () => {
    soloEstas(['ras-alc']);
    expect(texto()).toContain('💧 RAS');
    expect(texto()).not.toContain('Últimos tratamientos');
  });

  it('🔑 las variables del RAS no se cuelan en la tarjeta de cada lote', () => {
    soloEstas(['ras-alc']);
    expect(texto()).not.toContain('Lote AB');
  });
});

describe('Saldo · la revisión de nauplios y las observaciones de los tanques', () => {
  it('🔴 cada categoría con su etiqueta, incluidos el fototropismo y la aireación nuevos', () => {
    soloEstas(['naup-calidad']);
    const t = texto();
    expect(t).toContain('Entrada Def. Baja · Act. Alta · Hongos Ausente · Fototrop. Alta · Aireac. Media');
    expect(t).toContain('(2026-01-21)');
  });

  it('la salinidad y la temperatura de esa misma revisión, con sus unidades', () => {
    soloEstas(['naup-agua']);
    expect(texto()).toContain('Sal. 33 ‰ · T° 28.5 °C');
  });

  it('🔴 las observaciones de multiselección salen por tanque, y sólo las que dicen algo', () => {
    soloEstas(['lote-obs']);
    const t = texto();
    expect(t).toContain('Sala 1 t1: Necrosis en urópodos · Branquias oscuras · Aireación baja');
    expect(t).not.toContain('Sala 2 t16:');               // esa fila no trae observaciones
  });
});
