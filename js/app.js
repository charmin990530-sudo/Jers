/**
 * app.js
 * ------------------------------------------------------------------
 * Este archivo reúne la lógica que se reutiliza en varias páginas
 * de By Jers.
 * Las funciones se exportan para que cada página importe solamente
 * lo que usa.
 * 
 * NOTA: Los catálogos de productos (maquillaje, cabello, promociones)
 * ya NO están aquí. Se cargan dinámicamente desde la API:
 * - maquillaje.js -> GET /api/products/categoria/rostro|ojos|labios
 * - cabello.js   -> GET /api/products/categoria/shampoo|acondicionador|tratamientos
 * - index.js     -> GET /api/products/featured + /api/products/promociones
 */

import { CONFIG } from './config.js';
import { escapeHTML, safeAssetUrl, safePosition } from './sanitize.js';
import {
    mostrarErrorCampo,
    limpiarErrorCampo,
    limpiarErroresFormulario,
    mostrarMensajeGlobal,
    setBtnLoading,
    validarEmail,
    validarTelefono,
    calcularFortalezaPassword,
    textoFortaleza,
    passwordsCoinciden,
    inicializarTogglePassword,
} from './auth.js';

export {
    mostrarErrorCampo,
    limpiarErrorCampo,
    limpiarErroresFormulario,
    mostrarMensajeGlobal,
    setBtnLoading,
    validarEmail,
    validarTelefono,
    calcularFortalezaPassword,
    textoFortaleza,
    passwordsCoinciden,
    inicializarTogglePassword,
};

// Número de WhatsApp desde config (se puede sobrescribir via meta tag o variable global)
export const NUMERO_WHATSAPP = CONFIG.WHATSAPP_NUMBER;


// ==================================================================
// OBTENER PÁGINA ACTUAL
// ==================================================================

/**
 * Devuelve el nombre del archivo HTML abierto en este momento.
 */
export function obtenerPaginaActual() {
    return window.location.pathname.split('/').pop() || 'index.html';
}


// ==================================================================
// MENÚ MÓVIL
// ==================================================================

/**
 * Activa o cierra el menú hamburguesa en pantallas pequeñas.
 * Mantiene sincronizado el estado accesible (aria-expanded / aria-label),
 * permite cerrarlo con Escape o tocando fuera, y devuelve el foco al botón
 * para que nunca quede sobre un enlace que ya está oculto.
 */
export function iniciarMenuMovil() {
    const botonMenu = document.querySelector('.menu-toggle');
    const listaMenu = document.querySelector('.menulist');

    if (!botonMenu || !listaMenu) return;

    if (!listaMenu.id) listaMenu.id = 'menu-principal';
    botonMenu.setAttribute('aria-controls', listaMenu.id);
    botonMenu.setAttribute('aria-expanded', 'false');

    const estaAbierto = () => listaMenu.classList.contains('activo');

    const setAbierto = (abierto, devolverFoco = false) => {
        listaMenu.classList.toggle('activo', abierto);
        botonMenu.setAttribute('aria-expanded', String(abierto));
        botonMenu.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
        if (devolverFoco) botonMenu.focus();
    };

    botonMenu.addEventListener('click', () => {
        setAbierto(!estaAbierto());
    });

    listaMenu.querySelectorAll('a').forEach(enlace => {
        enlace.addEventListener('click', () => {
            setAbierto(false);
        });
    });

    document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && estaAbierto()) {
            setAbierto(false, true);
        }
    });

    document.addEventListener('click', evento => {
        if (!estaAbierto()) return;
        if (evento.target.closest('.menu')) return;
        setAbierto(false);
    });

    // Al pasar a escritorio el menú deja de colapsarse: limpiar el estado móvil.
    const escritorio = window.matchMedia('(min-width: 769px)');
    const alCambiarViewport = evento => {
        if (evento.matches) setAbierto(false);
    };
    if (typeof escritorio.addEventListener === 'function') {
        escritorio.addEventListener('change', alCambiarViewport);
    } else if (typeof escritorio.addListener === 'function') {
        escritorio.addListener(alCambiarViewport);
    }
}


// ==================================================================
// RESALTAR PÁGINA ACTUAL
// ==================================================================

/**
 * Marca visualmente el enlace que corresponde a la página actual.
 */
export function resaltarPaginaActual() {
    const paginaActual = obtenerPaginaActual();

    document.querySelectorAll('.menuitem a').forEach(enlace => {
        const archivoEnlace = enlace.getAttribute('href').split('#')[0];

        enlace.classList.toggle(
            'pagina-actual',
            archivoEnlace === paginaActual
        );
    });
}


const archivosImagenLocales = new Set([
    'acondicionador-nutricion-intensa.webp',
    'acondicionador-reparador.webp',
    'base-atenea.webp',
    'base-matte-lbel.webp',
    'corrector-atenea.webp',
    'delineador-en-gel-jdg.webp',
    'keratina-ampolleta.webp',
    'labial-mate-lbl.webp',
    'lip-gloss.webp',
    'shampoo-anti-caida.webp',
    'shampoo-hidratacion-profunda.webp',
    'shampoo-nutritivo.webp',
    'sombras-atenea.webp',
    'tratamiento-control-de-frizz.webp',
    'labial-mate.webp',
    'paleta-de-sombras.webp',
]);

const imagenesPorNombre = {
    'acondicionador-nutricion-intensa': '/img/productos/acondicionador-nutricion-intensa.webp',
    'acondicionador-reparador': '/img/productos/acondicionador-reparador.webp',
    'base-atenea': '/img/productos/base-atenea.webp',
    'base-matte-l-bel': '/img/productos/base-matte-lbel.webp',
    'corrector-atenea': '/img/productos/corrector-atenea.webp',
    'delineador-en-gel-jdg': '/img/productos/delineador-en-gel-jdg.webp',
    'keratina-ampolleta': '/img/productos/keratina-ampolleta.webp',
    'labial-mate-l-bel': '/img/productos/labial-mate-lbl.webp',
    'lip-gloss': '/img/productos/lip-gloss.webp',
    'shampoo-anti-caida-l-bel': '/img/productos/shampoo-anti-caida.webp',
    'shampoo-hidratacion-profunda': '/img/productos/shampoo-hidratacion-profunda.webp',
    'shampoo-nutritivo-jdg': '/img/productos/shampoo-nutritivo.webp',
    'ampolletas-de-keratina-jdg': '/img/productos/keratina-ampolleta.webp',
    'sombras-atenea': '/img/productos/sombras-atenea.webp',
    'tratamiento-control-de-frizz': '/img/productos/tratamiento-control-de-frizz.webp',
    'paleta-de-sombras-nude': '/img/promociones/paleta-de-sombras.webp',
    'labial-mate-larga-duracion': '/img/promociones/labial-mate.webp',
};

function normalizarNombre(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

/**
 * Enlace al detalle de un producto.
 *
 * Con backend el producto trae _id y se consulta por id. Sin backend el
 * catálogo local no tiene _id, así que se enlaza por slug y producto.js lo
 * resuelve contra el catálogo local. Antes, en modo sin backend, la tarjeta se
 * quedaba sin botón "Ver detalle" y el producto era inalcanzable.
 *
 * @param {Object} producto
 * @returns {string} HTML del ancla, o cadena vacía si no hay forma de identificarlo
 */
export function enlaceDetalle(producto) {
    if (!producto) return '';
    const id = producto._id || producto.id;
    if (id) {
        return `<a class="cardlink" href="producto.html?id=${encodeURIComponent(id)}">Ver detalle</a>`;
    }
    const slug = producto.slug || (producto.nombre ? normalizarNombre(producto.nombre) : '');
    if (!slug) return '';
    return `<a class="cardlink" href="producto.html?slug=${encodeURIComponent(slug)}">Ver detalle</a>`;
}

export function obtenerImagenProducto(producto) {
    const candidatas = [
        producto.imagen,
        producto.imagenPrincipal,
        ...(producto.imagenes || []).map(imagen => imagen.url),
    ].filter(Boolean);

    for (const candidata of candidatas) {
        if (typeof candidata !== 'string') continue;
        const safeUrl = safeAssetUrl(candidata);
        if (!safeUrl) continue;
        if (safeUrl.startsWith('/')) {
            const legacyMatch = safeUrl.match(/^\/img\/(productos|promociones)\/(.+)\.(?:jpe?g|png)$/i);
            if (legacyMatch) {
                const migrated = `/img/${legacyMatch[1]}/${legacyMatch[2]}.webp`;
                if (archivosImagenLocales.has(legacyMatch[2] + '.webp')) return migrated;
            }
            return safeUrl;
        }

        try {
            const pathname = new URL(safeUrl).pathname;
            const archivo = decodeURIComponent(pathname.split('/').pop() || '');
            const archivoWebp = archivo.replace(/\.(?:jpe?g|png)$/i, '.webp');
            if (archivosImagenLocales.has(archivoWebp)) {
                const carpeta = /\/promociones?\//i.test(pathname) ? 'promociones' : 'productos';
                return `/img/${carpeta}/${archivoWebp}`;
            }
        } catch {
            continue;
        }

        return safeUrl;
    }

    return imagenesPorNombre[normalizarNombre(producto.slug || producto.nombre)] || null;
}


// ==================================================================
// CREAR IMAGEN DEL PRODUCTO
// ==================================================================

/**
 * Muestra la imagen real del producto si existe.
 * Si no existe, muestra un ícono de respaldo.
 * Acepta tanto el formato API (con imagenes[] e imagenPrincipal virtual)
 * como formato simplificado (con imagen y posicion directa).
 */
export function crearImagenProducto(producto) {
    const imagen = safeAssetUrl(obtenerImagenProducto(producto));
    const posicion = safePosition(producto.posicion || producto.imagenes?.[0]?.posicion);
    const nombre = escapeHTML(producto.nombre || '');

    if (imagen) {
        return `
            <img
                class="cardimage"
                src="${escapeHTML(imagen)}"
                alt="${nombre}"
                loading="lazy"
                decoding="async"
                style="object-position: ${escapeHTML(posicion)};"
            >
        `;
    }

    const nombreNormalizado = nombre.toLowerCase();

    let icono = '✨';

    if (/shampoo|acondicionador|tratamiento|ampolletas/.test(nombreNormalizado)) {
        icono = '🧴';
    }

    if (/labial|gloss/.test(nombreNormalizado)) {
        icono = '💄';
    }

    if (/sombra|delineador/.test(nombreNormalizado)) {
        icono = '👁️';
    }

    if (/base|corrector/.test(nombreNormalizado)) {
        icono = '✦';
    }

    return `
        <div
            class="cardimage producto-placeholder"
            role="img"
             aria-label="Presentación de ${escapeHTML(producto.nombre || 'producto')}"
        >
            <span aria-hidden="true">${icono}</span>
            <small>By Jers</small>
        </div>
    `;
}


// ==================================================================
// RENDERIZAR CATÁLOGO
// ==================================================================

/**
 * Convierte una lista de productos en tarjetas HTML
 * y la coloca en el contenedor indicado.
 */
export function renderizarCatalogo(gruposDeMarca, contenedor) {

    if (!contenedor) return;

    if (!gruposDeMarca?.length) {
        contenedor.innerHTML = `
            <p class="catalogo-vacio">
                Aún no hay productos en esta categoría.
            </p>
        `;
        return;
    }

    contenedor.innerHTML = gruposDeMarca.map(grupo => {

        const tarjetas = grupo.productos.map(producto => {
            const id = producto._id || producto.id || '';
            const nombre = escapeHTML(producto.nombre || 'Producto');
            return `
            <article
                class="card"
                ${id ? `data-id="${escapeHTML(id)}"` : ''}
                data-nombre="${nombre}"
                data-precio="${Number(producto.precio) || 0}"
            >
                ${crearImagenProducto(producto)}

                <h3 class="cardname">
                    ${nombre}
                </h3>

                <p class="cardprecio">
                    ${escapeHTML(formatearPrecio(producto.precio))}
                </p>

                <div class="card-acciones">
                    ${enlaceDetalle(producto)}
                    <button
                        class="cardbtn"
                        type="button"
                    >
                        Añadir al carrito
                    </button>
                </div>
            </article>
        `;
        }).join('');

        return `
            <section class="marca-bloque">

                <div class="marca-header">
                    <h3 class="marca-nombre">
                        ${escapeHTML(grupo.marca || 'Sin marca')}
                    </h3>

                    <span class="marca-cantidad">
                        ${grupo.productos.length} producto(s)
                    </span>
                </div>

                <div class="tarjetas">
                    ${tarjetas}
                </div>

            </section>
        `;

    }).join('');
}


// ==================================================================
// PESTAÑAS DEL CATÁLOGO
// ==================================================================


// ==================================================================
// RENDERIZAR PROMOCIONES
// ==================================================================

/**
 * Muestra las ofertas de inicio y conserva
 * los datos necesarios para el carrito.
 */
export function renderizarPromociones(
    productos,
    contenedor
) {

    if (!contenedor) return;

    contenedor.innerHTML = productos.map(producto => {
        const imagenPrincipal = safeAssetUrl(obtenerImagenProducto(producto));
        const posicion = safePosition(producto.imagenes?.[0]?.posicion);
        const tieneDescuento = producto.precioAnterior && producto.precioAnterior > producto.precio;
        const id = producto._id || producto.id || '';
        const nombre = escapeHTML(producto.nombre || 'Producto');

        return `
        <article
            class="card"
            ${id ? `data-id="${escapeHTML(id)}"` : ''}
            data-nombre="${nombre}"
            data-precio="${Number(producto.precio) || 0}"
        >
            <span class="descuento-badge">Oferta</span>
            ${imagenPrincipal ? `
              <img class="cardimage" src="${escapeHTML(imagenPrincipal)}" alt="${nombre}" loading="lazy" decoding="async" style="object-position: ${escapeHTML(posicion)};">
            ` : crearImagenProducto({ nombre: producto.nombre })}
            <h3 class="cardname">${nombre}</h3>
            <p class="cardprecio">
                ${tieneDescuento ? `<span class="precio-anterior">${escapeHTML(formatearPrecio(producto.precioAnterior))}</span>` : ''}
                ${escapeHTML(formatearPrecio(producto.precio))}
            </p>
            <div class="card-acciones">
                ${enlaceDetalle(producto)}
                <button class="cardbtn" type="button">Añadir al carrito</button>
            </div>
        </article>
        `;
    }).join('');
}


// ==================================================================
// CARRITO (Híbrido: API cuando autenticado, localStorage como fallback)
// ==================================================================

/**
 * Carrito
 * -------
 * La implementación vive en `js/carrito.js`. Aquí solo se delega, para que
 * exista una sola copia de la lógica de carrito, fusión y formato en toda la
 * tienda. Antes vivía aquí, en auth.js y en checkout.js, con tres
 * comportamientos distintos.
 */
// OJO: un `export { x } from './y.js'` solo reexporta; NO crea un binding local,
// así que aquí dentro `iniciarCarrito` sería undefined y `iniciarAplicacion()`
// reventaría con ReferenceError en todas las páginas. Por eso se importa y
// además se reexporta, que es lo que necesitan las páginas que usan app.js.
import { iniciarCarrito } from './carrito.js';
import { formatearPrecio } from './config.js';

export { iniciarCarrito, formatearPrecio };

// ==================================================================
// FORMULARIO DE CONTACTO
// ==================================================================

/**
 * Valida los datos del formulario y muestra un mensaje local,
 * sin enviar información a un servidor.
 */
export function iniciarFormularioContacto() {
    const formulario = document.querySelector('.formulario-contacto');
    const mensaje = formulario?.querySelector('.formulario-mensaje');
    if (!formulario || !mensaje) return;

    formulario.addEventListener('submit', async evento => {
        evento.preventDefault();
        const nombre = formulario.elements.nombre.value.trim();
        const telefono = formulario.elements.telefono.value.trim();
        const correo = formulario.elements.correo.value.trim();
        const texto = formulario.elements.mensaje.value.trim();
        const website = formulario.elements.website?.value || '';

        if (!nombre || !telefono || !correo || texto.length < 10) {
            mostrarMensajeGlobal(formulario, 'Completa todos los campos correctamente.', 'error');
            return;
        }
        if (!validarEmail(correo)) {
            mostrarMensajeGlobal(formulario, 'Revisa tu correo, no parece válido.', 'error');
            return;
        }

        const boton = formulario.querySelector('button[type="submit"]');
        setBtnLoading(boton, true);
        try {
            const { api } = await import('./apiClient.js');
            const response = await api.post('/contact', { nombre, telefono, email: correo, mensaje: texto, website });
            if (!response.ok) throw new Error(response.msg || 'No se pudo enviar el mensaje');
            mostrarMensajeGlobal(formulario, response.data?.message || '¡Gracias! Te contactaremos pronto.', 'exito');
            formulario.reset();
        } catch (error) {
            mostrarMensajeGlobal(formulario, error.message || 'No se pudo enviar el mensaje.', 'error');
        } finally {
            setBtnLoading(boton, false);
        }
    });
}


// ==================================================================
// WHATSAPP FLOTANTE
// ==================================================================

/**
 * Añade el botón flotante de WhatsApp.
 */
export function iniciarWhatsapp() {

    const contenedor =
        document.createElement('div');

    contenedor.className =
        'whatsapp-flotante';

    contenedor.innerHTML = `
        <div class="whatsapp-burbuja">

            <button
                class="whatsapp-burbuja-cerrar"
                type="button"
                aria-label="Cerrar mensaje"
            >
                ✕
            </button>

            <p>
                💬 ¿Tienes dudas sobre un producto?
                Escríbenos por WhatsApp.
            </p>

        </div>

        <button
            class="whatsapp-boton pulso"
            type="button"
            aria-label="Escribir por WhatsApp"
        >
            📲
        </button>
    `;

    document.body.appendChild(contenedor);

    const burbuja =
        contenedor.querySelector('.whatsapp-burbuja');

    setTimeout(() => {
        burbuja.classList.add('visible');
    }, 3000);

    contenedor
        .querySelector('.whatsapp-burbuja-cerrar')
        .addEventListener('click', () => {
            burbuja.classList.remove('visible');
        });

    contenedor
        .querySelector('.whatsapp-boton')
        .addEventListener('click', () => {

            if (!NUMERO_WHATSAPP || !/^\d{10,15}$/.test(NUMERO_WHATSAPP)) {
                alert('Número de WhatsApp no configurado correctamente. Contacta al administrador.');
                return;
            }

            window.open(
                `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(
                    '¡Hola! Vi la página de By Jers y quiero saber más sobre sus productos ✨'
                )}`,
                '_blank',
                'noopener,noreferrer'
            );
        });
}


// ==================================================================
// BANCO DE PRODUCTOS PARA EL CHATBOT
// ==================================================================

const BANCO_PRODUCTOS = [

    {
        claves: ['base', 'rostro'],
        uso: 'La base unifica el tono de la piel y cubre imperfecciones.',
        componentes: 'Contiene pigmentos minerales, ácido hialurónico y FPS 15.'
    },

    {
        claves: ['corrector'],
        uso: 'El corrector cubre ojeras, manchas o granitos.',
        componentes: 'Contiene pigmentos de alta cobertura y vitamina E.'
    },

    {
        claves: ['sombra', 'sombras', 'ojos'],
        uso: 'Las sombras dan color y profundidad a los párpados.',
        componentes: 'Contienen mica, talco cosmético y pigmentos.'
    },

    {
        claves: ['delineador', 'delineado'],
        uso: 'El delineador define la mirada.',
        componentes: 'Tiene ceras naturales y pigmentos de larga duración.'
    },

    {
        claves: ['labial', 'labios', 'gloss'],
        uso: 'El labial da color a los labios con acabado mate.',
        componentes: 'Contiene manteca de karité y vitamina E.'
    },

    {
        claves: ['shampoo', 'champú'],
        uso: 'El shampoo limpia e hidrata el cabello.',
        componentes: 'Contiene keratina, argán y aloe vera.'
    },

    {
        claves: ['acondicionador'],
        uso: 'El acondicionador desenreda y sella la fibra capilar.',
        componentes: 'Contiene proteínas de seda y pantenol.'
    },

    {
        claves: [
            'frizz',
            'tratamiento',
            'ampolleta',
            'keratina'
        ],
        uso: 'El tratamiento controla el encrespamiento y aporta brillo.',
        componentes: 'Contiene keratina hidrolizada y aceite de coco.'
    }

];


// ==================================================================
// RESPUESTA DEL CHATBOT
// ==================================================================

/**
 * Genera la respuesta del chatbot con palabras clave.
 * No usa IA ni servicios externos.
 */
export function generarRespuestaChatbot(mensaje) {

    const texto = mensaje.toLowerCase();

    if (
        /(hola|buenas|buenos dias|buenas tardes)/.test(texto)
    ) {
        return '¡Hola! 💕 Pregúntame para qué sirve un producto o qué componentes tiene.';
    }

    const producto =
        BANCO_PRODUCTOS.find(item =>
            item.claves.some(clave =>
                texto.includes(clave)
            )
        );

    if (!producto) {
        return 'Puedes preguntarme por base, corrector, sombras, delineador, labial, shampoo, acondicionador o tratamiento.';
    }

    if (
        /(componente|ingrediente|contiene|lleva|hecho)/.test(texto)
    ) {
        return producto.componentes;
    }

    if (
        /(precio|cuesta|vale|costo)/.test(texto)
    ) {
        return 'Los precios aparecen en el catálogo y cambian según la presentación.';
    }

    return producto.uso;
}


// ==================================================================
// CHATBOT
// ==================================================================

/**
 * Crea la interfaz del chatbot y conecta sus botones
 * con la función de respuesta.
 */
export function iniciarChatbot() {

    const boton =
        document.createElement('button');

    boton.className = 'chatbot-boton';
    boton.type = 'button';

    boton.setAttribute(
        'aria-label',
        'Abrir asistente de productos'
    );

    boton.textContent = '💄';


    const panel =
        document.createElement('aside');

    panel.className = 'chatbot-panel';

    panel.innerHTML = `
        <div class="chatbot-cabecera">

            <div>
                <h3>Asesora By Jers</h3>

                <p>
                    Pregúntame sobre nuestros productos
                </p>
            </div>

            <button
                class="chatbot-cerrar"
                type="button"
                aria-label="Cerrar chat"
            >
                ✕
            </button>

        </div>

        <div class="chatbot-mensajes"></div>

        <div class="chatbot-sugerencias">

            <button
                class="chatbot-chip"
                type="button"
                data-pregunta="¿Para qué sirve el shampoo?"
            >
                ¿Para qué sirve el shampoo?
            </button>

            <button
                class="chatbot-chip"
                type="button"
                data-pregunta="¿Qué componentes tiene el labial?"
            >
                Componentes del labial
            </button>

        </div>

        <form class="chatbot-form">

            <input
                class="chatbot-input"
                aria-label="Escribe tu pregunta"
                placeholder="Escribe tu pregunta..."
            >

            <button
                class="chatbot-enviar"
                type="submit"
                aria-label="Enviar pregunta"
            >
                ➤
            </button>

        </form>
    `;


    document.body.append(
        boton,
        panel
    );


    const mensajes =
        panel.querySelector('.chatbot-mensajes');


    const agregarMensaje = (texto, tipo) => {

        const elemento =
            document.createElement('p');

        elemento.className =
            `chatbot-msg ${tipo}`;

        elemento.textContent = texto;

        mensajes.appendChild(elemento);

        mensajes.scrollTop =
            mensajes.scrollHeight;
    };


    const responder = pregunta => {

        if (!pregunta.trim()) return;

        agregarMensaje(
            pregunta,
            'usuario'
        );

        setTimeout(() => {

            agregarMensaje(
                generarRespuestaChatbot(pregunta),
                'bot'
            );

        }, 300);
    };


    let saludado = false;


    boton.addEventListener('click', () => {

        panel.classList.toggle('abierto');

        if (!saludado) {

            agregarMensaje(
                '¡Hola! Soy tu asesora virtual 💄',
                'bot'
            );

            saludado = true;
        }
    });


    panel
        .querySelector('.chatbot-cerrar')
        .addEventListener('click', () => {

            panel.classList.remove('abierto');

        });


    panel
        .querySelector('.chatbot-form')
        .addEventListener('submit', evento => {

            evento.preventDefault();

            const entrada =
                panel.querySelector('.chatbot-input');

            responder(entrada.value);

            entrada.value = '';
        });


    panel
        .querySelectorAll('.chatbot-chip')
        .forEach(chip => {

            chip.addEventListener('click', () => {

                responder(
                    chip.dataset.pregunta
                );

            });

        });
}


// ==================================================================
// ANIMACIONES SCROLL
// ==================================================================

/**
 * Hace visibles gradualmente los elementos que tienen
 * la clase .revelar al desplazarse.
 */
export function iniciarAnimacionesScroll() {

    const elementos = document.querySelectorAll('.revelar');

    if (!('IntersectionObserver' in window)) {
        elementos.forEach(elemento => elemento.classList.add('visible'));
        return;
    }

    const observador = new IntersectionObserver(
        entradas => {
            entradas.forEach(entrada => {
                if (entrada.isIntersecting) {
                    entrada.target.classList.add('visible');
                }
            });
        },
        {
            threshold: 0.15
        }
    );

    elementos.forEach(elemento => {
        observador.observe(elemento);
    });
}


// ==================================================================
// LOGOUT GLOBAL
// ==================================================================

/**
 * Cierra sesión del usuario
 * Llama a API logout y notifica al carrito para cambiar a modo localStorage
 * Útil para menú de usuario futuro
 */
export async function cerrarSesion() {
    try {
        const { api } = await import('./apiClient.js');
        const result = await api.logout();
        if (!result.ok) throw new Error(result.msg || 'No se pudo cerrar sesión');

        window.location.href = 'index.html';
    } catch (error) {
        console.error('[Auth] Error en logout:', error);
        // Aun así notificar cambio de auth
        window.dispatchEvent(new Event('auth-cambio'));
        window.location.href = 'index.html';
    }
}


// ==================================================================
// INICIAR APLICACIÓN
// ==================================================================

/**
 * Inicializa las funciones comunes.
 * Cada script de página llama esta función una sola vez.
 */
export function iniciarAplicacion() {

    iniciarMenuMovil();
    resaltarPaginaActual();
    iniciarCarrito().catch(error => {
        console.error('[Carrito] No se pudo inicializar:', error);
    });
    inicializarSesionUI();
    iniciarWhatsapp();
    iniciarChatbot();
    iniciarAnimacionesScroll();
}

async function inicializarSesionUI() {
    const menu = document.querySelector('.menulist');
    if (!menu || menu.querySelector('[data-session-ui]')) return;
    try {
        const { api } = await import('./apiClient.js');

        // La capa de red ya no manda al login por su cuenta: eso lo decide
        // protegerRuta() en las pantallas que exigen sesión. Lo que sí hace falta
        // es reaccionar a que la sesiónMUERA con la pantalla ya abierta, que es
        // justo lo que emite js/api.js. Este es el único punto que escucha, y
        // solo entra cuando el usuario tenía sesión, así que un invitado que
        // recibe un 401 al mirar su carrito no se ve expulsado.
        window.addEventListener('sesion-caducada', () => api.irAlLogin());

        const response = await api.getMe();
        const item = document.createElement('li');
        item.className = 'menuitem sesion-menu';
        item.dataset.sessionUi = 'true';
        if (response.ok && response.data?.user) {
            const profile = document.createElement('a');
            profile.href = 'mi-perfil.html';
            profile.textContent = 'Mi perfil';
            const orders = document.createElement('a');
            orders.href = 'mis-pedidos.html';
            orders.textContent = 'Mis pedidos';
            const logout = document.createElement('button');
            logout.type = 'button';
            logout.className = 'menu-logout';
            logout.textContent = 'Cerrar sesión';
            logout.addEventListener('click', () => cerrarSesion());
            item.append(profile, orders, logout);
        } else {
            const login = document.createElement('a');
            login.href = 'login.html';
            login.textContent = 'Iniciar sesión';
            item.append(login);
        }
        menu.append(item);
    } catch {
        return;
    }
}