/**
 * busqueda.js - Buscador del encabezado
 *
 * POR QUE EXISTE
 * --------------
 * El backend exponía `GET /api/products/buscar` desde el principio, con índice
 * de texto completo, validación de longitud mínima y orden por `textScore`
 * (verificado: `?q=labial` devolvía 3 resultados). Pero `js/api.js` no tenía
 * ni un wrapper y ningún HTML tenía un `<input type="search">`: con 300
 * productos repartidos en 6 pestañas de categoría, la única forma de encontrar
 * "shampoo anticaída" era recordar en qué pestaña estaba.
 *
 * La barra se inyecta desde aquí en lugar de declararse en los 14 HTML que
 * llevan el encabezado, para que no haya 14 copias que mantener en sincronía y
 * cualquier página nueva la reciba sola. Es el mismo criterio que se aplicó al
 * aviso del carrito (`js/carrito.js`).
 *
 * ACCESIBILIDAD
 * -------------
 * El campo es un `combobox` con `aria-expanded` y `aria-controls` sobre la
 * lista de resultados: un lector de pantalla anuncia cuántos hay, y las flechas
 * y Enter/Moverse a él se mueven entre ellos. Escape cierra y devuelve el foco al
 * campo. `aria-live` anuncia el número de resultados al terminar la búsqueda.
 *
 * Solo se escribe texto con `textContent` y los `href` se construyen a mano con
 * `encodeURIComponent`, así que no hay superficie de inyección aquí.
 */

import { api } from './api.js';
import { escapeHTML, safeAssetUrl } from './sanitize.js';
import { formatearPrecio } from './config.js';

const MINIMO = 2;
const ESPERA_MS = 300;

/** Peticiones en vuelo y su número de secuencia, para descartar respuestas viejas. */
let secuencia = 0;
let temporizador = null;

const idCampo = 'busquedaCampo';
const idLista = 'busquedaResultados';
const idEstado = 'busquedaEstado';

/**
 * Inserta la barra en el encabezado, delante del botón del carrito.
 * Es idempotente: llamarlo dos veces no duplica nada.
 */
export function iniciarBusqueda() {
    const nav = document.querySelector('nav') || document.querySelector('.navbar');
    if (!nav || document.getElementById(idCampo)) return;

    const contenedor = document.createElement('form');
    contenedor.className = 'buscador';
    contenedor.id = 'buscadorHeader';
    // El buscador no envía nada: la consulta va por fetch. Sin esto, si el
    // JavaScript tardara en cargar, el form recargaría la página con un ?q=.
    contenedor.setAttribute('role', 'search');
    contenedor.setAttribute('novalidate', '');

    contenedor.innerHTML = `
        <label class="buscador__label" for="${idCampo}">Buscar productos</label>
        <div class="buscador__campo">
            <input
                type="search"
                id="${idCampo}"
                class="buscador__input"
                placeholder="Buscar productos..."
                autocomplete="off"
                role="combobox"
                aria-expanded="false"
                aria-controls="${idLista}"
                aria-autocomplete="list"
                spellcheck="false">
            <button type="button" class="buscador__limpiar" aria-label="Borrar la búsqueda" hidden>&times;</button>
        </div>
        <ul class="buscador__resultados" id="${idLista}" role="listbox" aria-label="Resultados de búsqueda" hidden></ul>
        <p class="buscador__estado" id="${idEstado}" role="status" aria-live="polite"></p>
    `;

    const input = contenedor.querySelector('.buscador__input');

    const botonCarrito = nav.querySelector('.carrito-icono');
    if (botonCarrito) botonCarrito.before(contenedor);
    else nav.append(contenedor);

    const lista = document.getElementById(idLista);
    const estado = document.getElementById(idEstado);
    const limpiar = contenedor.querySelector('.buscador__limpiar');

    let resultados = [];
    let indiceActivo = -1;

    const cerrar = () => {
        lista.hidden = true;
        lista.replaceChildren();
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        resultados = [];
        indiceActivo = -1;
    };

    const mover = delta => {
        if (!resultados.length) return;
        indiceActivo = (indiceActivo + delta + resultados.length) % resultados.length;
        const opciones = lista.querySelectorAll('.buscador__opcion');
        opciones.forEach((opcion, i) => {
            opcion.classList.toggle('activo', i === indiceActivo);
            opcion.setAttribute('aria-selected', i === indiceActivo ? 'true' : 'false');
        });
        const activa = opciones[indiceActivo];
        if (activa) {
            input.setAttribute('aria-activedescendant', activa.id);
            activa.scrollIntoView({ block: 'nearest' });
        }
    };

    const pintar = (productos, consulta) => {
        lista.replaceChildren();
        resultados = productos;
        indiceActivo = -1;

        if (!productos.length) {
            lista.innerHTML = `<li class="buscador__vacio">No encontramos nada para "${escapeHTML(consulta)}".</li>`;
            estado.textContent = 'Sin resultados.';
            lista.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            return;
        }

        productos.forEach((producto, i) => {
            const imagen = safeAssetUrl(producto.imagenPrincipal || producto.imagenes?.[0]?.url);
            const li = document.createElement('li');
            li.className = 'buscador__opcion';
            li.id = `${idLista}-${i}`;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', 'false');

            const enlace = document.createElement('a');
            // El href se arma con encodeURIComponent sobre el _id del servidor,
            // que es un ObjectId: no hay dato de usuario en la URL.
            enlace.href = `/producto?id=${encodeURIComponent(producto._id)}`;
            enlace.className = 'buscador__enlace';

            if (imagen) {
                const img = document.createElement('img');
                img.src = imagen;
                img.alt = '';
                img.className = 'buscador__img';
                img.loading = 'lazy';
                img.decoding = 'async';
                img.width = 40;
                img.height = 40;
                enlace.append(img);
            }

            const texto = document.createElement('span');
            texto.className = 'buscador__texto';
            const nombre = document.createElement('span');
            nombre.className = 'buscador__nombre';
            nombre.textContent = producto.nombre || 'Producto';
            const precio = document.createElement('span');
            precio.className = 'buscador__precio';
            precio.textContent = formatearPrecio(producto.precio ?? 0);
            texto.append(nombre, precio);
            enlace.append(texto);

            li.append(enlace);
            lista.append(li);
        });

        estado.textContent = `${productos.length} resultado${productos.length === 1 ? '' : 's'}.`;
        lista.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    };

    const buscar = async () => {
        const consulta = input.value.trim();
        limpiar.hidden = consulta.length === 0;

        // Por debajo del mínimo no se llama al servidor: el backend devolvería
        // una lista vacía, y una request por cada tecla es trabajo de nadie.
        if (consulta.length < MINIMO) {
            estado.textContent = '';
            cerrar();
            return;
        }

        const propia = ++secuencia;
        estado.textContent = 'Buscando...';
        const respuesta = await api.searchProducts(consulta, { limit: 8 });

        // Mientras esperábamos puede haber llegado otra búsqueda (escribes más
        // rápido de lo que responde el servidor). Solo pinta la última: si no,
        // los resultados de "sha" se amontonarían encima de los de "shampoo".
        if (propia !== secuencia) return;

        if (!respuesta.ok) {
            estado.textContent = 'No se pudo buscar. Inténtalo de nuevo.';
            cerrar();
            return;
        }
        pintar(respuesta.data?.products || [], consulta);
    };

    input.addEventListener('input', () => {
        clearTimeout(temporizador);
        temporizador = setTimeout(buscar, ESPERA_MS);
    });

    input.addEventListener('focus', () => {
        if (input.value.trim().length >= MINIMO) buscar();
    });

    limpiar.addEventListener('click', () => {
        input.value = '';
        limpiar.hidden = true;
        estado.textContent = '';
        cerrar();
        input.focus();
    });

    // Escape cierra; Enter con un resultado resaltado lo sigue.
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            cerrar();
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            mover(1);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            mover(-1);
            return;
        }
        if (event.key === 'Enter' && indiceActivo >= 0) {
            event.preventDefault();
            const activa = lista.querySelectorAll('.buscador__opcion')[indiceActivo];
            activa?.querySelector('a')?.click();
            return;
        }
        if (event.key === 'Enter' && !resultados.length) {
            // Sin resultados resaltados, Enter no debe hacer nada: el form no
            // tiene action, así que una recarga perdería la página.
            event.preventDefault();
            buscar();
        }
    });

    contenedor.addEventListener('submit', event => event.preventDefault());
    contenedor.addEventListener('click', event => {
        if (!contenedor.contains(event.target)) cerrar();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !lista.hidden) cerrar();
    });
}