// @vitest-environment happy-dom
/* ============================================================
   LOS LÍMITES DEL ENTORNO DE PRUEBAS, FIJADOS (2026-09-15)

   POR QUÉ EXISTE ESTE ARCHIVO. Varias pruebas de Maduración y de Biomol guardan un trozo de
   formulario como HTML y lo vuelven a montar. En un navegador eso conserva lo elegido en un
   `<select>`; en happy-dom NO. Se descubrió dos veces el mismo día y de la peor manera: la
   primera, una prueba en rojo que parecía un defecto del código y no lo era; la segunda, una
   prueba en VERDE que no probaba nada — pedía `select.value` y le devolvían justo la opción
   que ocupaba ese sitio, así que habría pasado igual con el código roto.

   🔑 QUÉ SE HACE CON ESTO. Un límite del entorno que sólo vive en un comentario se vuelve a
   pisar. Aquí se fija como un HECHO MEDIDO, con dos consecuencias:
     · mientras esté en rojo el `selected`, lo elegido se comprueba en el ATRIBUTO —nunca en
       `select.value`— en cualquier prueba que reparse HTML;
     · el día que happy-dom lo arregle, ESTA prueba se pondrá roja. No es un fallo: es el aviso
       de que los rodeos de `mad-borrador-fecha.test.js` y `mad-salas-desinfeccion.test.js` ya
       no hacen falta y se pueden retirar. Una excepción declarada que deja de ser cierta es
       una excepción que tapa la siguiente.

   ⚠ Lo que NO se toca: el código de la app. Un navegador se comporta bien, así que rebajar el
   código para que el entorno de pruebas lo entienda sería arreglar el termómetro.
   ============================================================ */
import { describe, it, expect } from 'vitest';

/** Serializa y vuelve a montar, que es lo que hace el borrador por fecha. */
const idaYVuelta = (html) => {
  const a = document.createElement('div');
  a.innerHTML = html;
  return a;
};

describe('happy-dom · lo que SÍ sobrevive a un ida y vuelta por innerHTML', () => {
  it('el atributo `value` de un input vuelve', () => {
    const d = idaYVuelta('<input value="tecleado">');
    expect(d.querySelector('input').value).toBe('tecleado');
  });

  it('el atributo `checked` de una casilla vuelve', () => {
    const d = idaYVuelta('<input type="checkbox" checked="checked">');
    expect(d.querySelector('input').checked).toBe(true);
  });

  it('el texto de un textarea vuelve', () => {
    const d = idaYVuelta('<textarea>párrafo</textarea>');
    expect(d.querySelector('textarea').value).toBe('párrafo');
  });
});

describe('happy-dom · lo que NO sobrevive: `selected` de un <option>', () => {
  /* El volcado de valores vivos a atributos —`_madBorrFijarValores` en el monolito— produce
     exactamente este HTML, y es correcto: un navegador monta el select con B elegida. */
  const CON_VACIA = '<select><option value=""></option><option value="A">A</option>'
    + '<option value="B" selected="selected">B</option></select>';
  const SIN_VACIA = '<select><option value="A">A</option>'
    + '<option value="B" selected="selected">B</option></select>';

  it('el ATRIBUTO sí está: lo que se guarda es correcto', () => {
    const marcadas = (html) => Array.from(idaYVuelta(html).querySelectorAll('option'))
      .filter((o) => o.hasAttribute('selected')).map((o) => o.value);
    expect(marcadas(CON_VACIA)).toEqual(['B']);
    expect(marcadas(SIN_VACIA)).toEqual(['B']);
  });

  it('🔴 con una opción VACÍA delante —como todos los de la app— `select.value` lo IGNORA', () => {
    /* Medido el 2026-09-15 con happy-dom 20.10.3. Lo que lo hace peligroso: no devuelve vacío
       ni revienta, devuelve OTRA opción. Una prueba que pida `value` pasa o falla por
       casualidad, según qué sitio ocupe la que buscaba — que es exactamente lo que pasó con
       «SI» en el desplegable del RAS, que estaba en el sitio que happy-dom devuelve. */
    expect(idaYVuelta(CON_VACIA).querySelector('select').value).not.toBe('B');
  });

  it('y ésa es la causa: SIN la opción vacía, el mismo HTML sí monta bien', () => {
    /* Se fija para que el aviso sea preciso. Todos los desplegables de estas fichas abren con
       `<option value="">—</option>`, así que el rodeo hace falta en TODOS; pero si algún día se
       escribe uno sin ella, esta línea explica por qué aquél no necesita rodeo. */
    expect(idaYVuelta(SIN_VACIA).querySelector('select').value).toBe('B');
  });

  it('asignar `value` a mano SÍ funciona: es la otra salida cuando hace falta el valor', () => {
    // Lo usa la prueba del payload de Salas: elegir como elegiría el usuario, sin reparsear.
    const s = idaYVuelta(CON_VACIA).querySelector('select');
    s.value = 'B';
    expect(s.value).toBe('B');
  });
});
