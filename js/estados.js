/**
 * estados.js - Estados de carga, vacío, error y reintento para el catálogo
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Antes, cada página repetía su propio markup y, sobre todo, cometía el mismo
 * error: cuando la API devolvía una lista vacía o fallaba, se pintaba un
 * catálogo de DEMOSTRACIÓN hardcodeado (js/fallbackCatalog.js) sin avisar. El
 * cliente veía 16 productos con precios y stock inventados, indistinguibles de
 * los reales, y no podía comprarlos porque no tenían `_id`. Es el peor tipo de
 * fallo posible en una tienda: mostrar un precio que no es el real.
 *
 * Aqui la regla es una sola: si no hay datos DE LA API, no se inventan datos.
 *   - cargando  -> spinner
 *   - error     -> mensaje + boton de reintentar
 *   - vacio     -> "no hay productos" (que es informacion real, no un fallo)
 *   - con datos -> se pintan
 *
 * MODO DEMO
 * ---------
 * El catalogo de demostracion sigue existiendo, pero solo se usa si se activa
 * `localStorage.byJersDemo = '1'` de forma explicita, y las tarjetas que produce
 * llevan una insignia "Demo" visible. Apagado por defecto.
 */

import { escapeHTML } from './sanitize.js';

const CLAVE_DEMO = 'byJersDemo';

/** ¿El modo demo está activado a mano? Apagado salvo que se pida. */
export const demoActivado = () => {
    try {
        return localStorage.getItem(CLAVE_DEMO) === '1';
    } catch {
        return false;
    }
};

export const activarDemo = valor => {
    try {
        if (valor) localStorage.setItem(CLAVE_DEMO, '1');
        else localStorage.removeItem(CLAVE_DEMO);
    } catch {
        /* modo privado: se queda en false */
    }
};

/** Estado de carga. */
export const renderCargando = (contenedor, mensaje = 'Cargando productos...') => {
    if (!contenedor) return;
    contenedor.innerHTML = `
        <div class="catalogo-loading" role="status" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <p>${escapeHTML(mensaje)}</p>
        </div>
    `;
};

/**
 * Estado vacío: la API respondió bien y no hay nada. NO es un error, asi que no
 * lleva botón de reintentar.
 */
export const renderVacio = (contenedor, mensaje = 'No hay productos por aquí todavía.') => {
    if (!contenedor) return;
    contenedor.innerHTML = `<p class="catalogo-vacio">${escapeHTML(mensaje)}</p>`;
};

/**
 * Estado de error con botón de reintentar.
 *
 * @param {HTMLElement} contenedor
 * @param {string} [mensaje]
 * @param {Function} [alReintentar] - Callback del botón. Sin él, no se pinta botón.
 * @param {number} [intento] - Se incrementa en cada fallo y se muestra para que
 *   el usuario sepa que ya lo intentó varias veces.
 */
export const renderError = (contenedor, mensaje = 'No pudimos cargar los productos.', alReintentar, intento = 1) => {
    if (!contenedor) return;
    const reintentos = intento > 1
        ? `<p class="catalogo-error__detalle">Intento ${intento}. Revisa tu conexión.</p>`
        : '';
    const boton = typeof alReintentar === 'function'
        ? `<button type="button" class="catalogo-error__boton" data-reintentar>Reintentar</button>`
        : '';

    contenedor.innerHTML = `
        <div class="catalogo-error" role="alert">
            <p class="catalogo-error__mensaje">${escapeHTML(mensaje)}</p>
            ${reintentos}
            ${boton}
        </div>
    `;

    if (typeof alReintentar === 'function') {
        contenedor.querySelector('[data-reintentar]')?.addEventListener('click', () => alReintentar());
    }
};

/**
 * Resuelve el catálogo aplicando la política de estados.
 *
 * @param {HTMLElement} contenedor
 * @param {{ok: boolean, data: any, msg: string}} respuesta - Respuesta de apiClient.
 * @param {object} opciones
 * @param {string[]} opciones.claves - Ruta al array dentro de la respuesta ('products').
 * @param {Function} opciones.alReintentar
 * @param {string} [opciones.vacio]
 * @param {Function} [opciones.alRecibir] - Recibe la lista y la pinta.
 * @returns {Array} La lista de productos, o [] si no hubo datos válidos.
 */
export const resolverCatalogo = (contenedor, respuesta, opciones) => {
    const { claves, alReintentar, vacio, alRecibir, intento = 1 } = opciones;

    // 1) Fallo de red o de servidor: NO se inventan productos.
    if (!respuesta?.ok) {
        renderError(
            contenedor,
            respuesta?.msg || 'No pudimos conectar con la tienda.',
            alReintentar,
            intento,
        );
        return [];
    }

    // 2) Respuesta correcta: se extrae la lista sin asumir que existe.
    let productos = respuesta.data;
    for (const clave of claves) {
        productos = productos?.[clave];
    }
    if (!Array.isArray(productos)) productos = [];

    // 3) Lista vacía: es información real ("no hay"), no un fallo.
    if (productos.length === 0) {
        renderVacio(contenedor, vacio);
        return [];
    }

    return alRecibir ? alRecibir(productos) : productos;
};
