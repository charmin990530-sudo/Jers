/*
 * app.js
 * ------------------------------------------------------------------
 * Este archivo reúne la lógica que se reutiliza en varias páginas
 * de By Jers.
 * Las funciones se exportan para que cada página importe solamente
 * lo que usa.
 */

// Número centralizado: se cambia una sola vez cuando tengas el número real.
export const NUMERO_WHATSAPP = '573114333561';


// ==================================================================
// CATÁLOGO DE MAQUILLAJE
// ==================================================================

export const CATALOGO_MAQUILLAJE = {
    rostro: [
        {
            marca: 'Atenea Profesional',
            productos: [
                {
                    nombre: 'Base Atenea',
                    precio: 58000,
                    imagen: '/img/productos/base-atenea.jpg',
                    posicion: 'center 80%'
                },
                {
                    nombre: 'Corrector Atenea',
                    precio: 38000,
                    imagen: '/img/productos/corrector-atenea.jpg',
                    posicion: 'center 50%'
                }
            ]
        },
        {
            marca: "L'Bel",
            productos: [
                {
                    nombre: "Base Matte L'Bel",
                    precio: 62000,
                    imagen: '/img/productos/base-matte-lbel.jpg',
                    posicion: 'center 50%'
                }
            ]
        }
    ],

    ojos: [
        {
            marca: 'Atenea Profesional',
            productos: [
                {
                    nombre: 'Sombras Atenea',
                    precio: 45000,
                    imagen: '/img/productos/sombras-atenea.jpg',
                    posicion: 'center 50%'
                }
            ]
        },
        {
            marca: 'Jorge de la Garza',
            productos: [
                {
                    nombre: 'Delineador en Gel JDG',
                    precio: 34000,
                    imagen: '/img/productos/delineador-en-gel-jdg.jpg',
                    posicion: 'center 90%'
                }
            ]
        }
    ],

    labios: [
        {
            marca: 'Atenea Profesional',
            productos: [
                {
                    nombre: 'Lip Gloss',
                    precio: 32000,
                    imagen: '/img/productos/lip-gloss.jpg',
                    posicion: '30% 50%'
                }
            ]
        },
        {
            marca: "L'Bel",
            productos: [
                {
                    nombre: "Labial Mate L'Bel",
                    precio: 36000,
                    imagen: '/img/productos/labial-mate-lbel.jpg',
                    posicion: 'center 50%'
                }
            ]
        }
    ]
};


// ==================================================================
// CATÁLOGO DE CUIDADO CAPILAR
// ==================================================================

export const CATALOGO_CABELLO = {

    shampoo: [
        {
            marca: 'Atenea Profesional',
            productos: [
                {
                    nombre: 'Shampoo Hidratación Profunda',
                    precio: 46000,
                    imagen: '/img/productos/shampoo-hidratacion-profunda.jpg'
                }
            ]
        },
        {
            marca: "L'Bel",
            productos: [
                {
                    nombre: "Shampoo Anticaída L'Bel",
                    precio: 52000,
                    imagen: '/img/productos/shampoo-anti-caida.jpg'
                }
            ]
        },
        {
            marca: 'Jorge de la Garza',
            productos: [
                {
                    nombre: 'Shampoo Nutritivo JDG',
                    precio: 41000,
                    imagen: '/img/productos/shampoo-nutritivo.jpg'
                }
            ]
        }
    ],


    // ==============================================================
    // ACONDICIONADOR
    // ==============================================================

    acondicionador: [
        {
            marca: 'Atenea Profesional',
            productos: [
                {
                    nombre: 'Acondicionador Reparador',
                    precio: 46000,
                    imagen: '/img/productos/acondicionador-reparador.jpg'
                }
            ]
        },
        {
            marca: "L'Bel",
            productos: [
                {
                    nombre: "Acondicionador Nutrición Intensa L'Bel",
                    precio: 50000,
                    imagen: '/img/productos/acondicionador-nutricion.jpg'
                }
            ]
        }
    ],


    // ==============================================================
    // TRATAMIENTOS
    // ==============================================================

    tratamientos: [
        {
            marca: 'Atenea Profesional',
            productos: [
                {
                    nombre: 'Tratamiento Control de Frizz',
                    precio: 58000,
                    imagen: '/img/productos/tratamiento-control-de-frizz.jpg'
                }
            ]
        },
        {
            marca: 'Jorge de la Garza',
            productos: [
                {
                    nombre: 'Ampolletas de Keratina JDG',
                    precio: 39000,
                    imagen: '/img/productos/keratina-ampolleta.webp',
                    posicion: 'center 70%'
                }
            ]
        }
    ]
};


// ==================================================================
// PRODUCTOS EN PROMOCIÓN
// ==================================================================

export const PRODUCTOS_PROMO = [
    {
        nombre: 'Paleta de Sombras Nude',
        precio: 45000,
        precioAnterior: 58000,
        imagen: '/img/promociones/paleta-de-sombras.jpg'
    },
    {
        nombre: 'Labial Mate Larga Duración',
        precio: 29000,
        precioAnterior: 38000,
        imagen: '/img/promociones/labial-mate.jpg',
        posicion: 'center 65%'
    },
    {
        nombre: 'Shampoo Hidratación Profunda',
        precio: 38000,
        precioAnterior: 46000,
        imagen: '/img/promociones/shampoo-hidratacion-profunda.jpg',
        posicion: 'center 75%'
    }
];


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
 */
export function iniciarMenuMovil() {
    const botonMenu = document.querySelector('.menu-toggle');
    const listaMenu = document.querySelector('.menulist');

    if (!botonMenu || !listaMenu) return;

    botonMenu.addEventListener('click', () => {
        listaMenu.classList.toggle('activo');
    });

    listaMenu.querySelectorAll('a').forEach(enlace => {
        enlace.addEventListener('click', () => {
            listaMenu.classList.remove('activo');
        });
    });
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


// ==================================================================
// CREAR IMAGEN DEL PRODUCTO
// ==================================================================

/**
 * Muestra la imagen real del producto si existe.
 * Si no existe, muestra un ícono de respaldo.
 */
export function crearImagenProducto(producto) {

    if (producto.imagen) {
        const posicion = producto.posicion || 'center';

        return `
            <img
                class="cardimage"
                src="${producto.imagen}"
                alt="${producto.nombre}"
                style="object-position: ${posicion};"
            >
        `;
    }

    const nombre = producto.nombre.toLowerCase();

    let icono = '✨';

    if (/shampoo|acondicionador|tratamiento|ampolletas/.test(nombre)) {
        icono = '🧴';
    }

    if (/labial|gloss/.test(nombre)) {
        icono = '💄';
    }

    if (/sombra|delineador/.test(nombre)) {
        icono = '👁️';
    }

    if (/base|corrector/.test(nombre)) {
        icono = '✦';
    }

    return `
        <div
            class="cardimage producto-placeholder"
            role="img"
            aria-label="Presentación de ${producto.nombre}"
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

        const tarjetas = grupo.productos.map(producto => `
            <article
                class="card"
                data-nombre="${producto.nombre}"
                data-precio="${producto.precio}"
            >
                ${crearImagenProducto(producto)}

                <h3 class="cardname">
                    ${producto.nombre}
                </h3>

                <p class="cardprecio">
                    $${producto.precio.toLocaleString('es-CO')}
                </p>

                <button
                    class="cardbtn"
                    type="button"
                >
                    Añadir al carrito
                </button>
            </article>
        `).join('');

        return `
            <section class="marca-bloque">

                <div class="marca-header">
                    <h3 class="marca-nombre">
                        ${grupo.marca}
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

/**
 * Conecta las pestañas de una página con el catálogo
 * y abre la categoría indicada en la URL.
 */
export function iniciarPestanasCatalogo(
    grupo,
    catalogo,
    idContenedor
) {

    const pestañas = document.querySelector(
        `.tabs[data-grupo="${grupo}"]`
    );

    const contenedor = document.getElementById(idContenedor);

    if (!pestañas || !contenedor) return;

    const botones = [
        ...pestañas.querySelectorAll('.tab-btn')
    ];

    const mostrarCategoria = categoria => {

        botones.forEach(boton => {
            boton.classList.toggle(
                'tab-activo',
                boton.dataset.categoria === categoria
            );
        });

        renderizarCatalogo(
            catalogo[categoria],
            contenedor
        );
    };

    botones.forEach(boton => {
        boton.addEventListener('click', () => {
            mostrarCategoria(boton.dataset.categoria);
        });
    });

    const categoriaInicial = window.location.hash.slice(1);

    mostrarCategoria(
        catalogo[categoriaInicial]
            ? categoriaInicial
            : botones[0].dataset.categoria
    );
}


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

    contenedor.innerHTML = productos.map(producto => `
        <article
            class="card"
            data-nombre="${producto.nombre}"
            data-precio="${producto.precio}"
        >
            <span class="descuento-badge">
                Oferta
            </span>

            ${crearImagenProducto(producto)}

            <h3 class="cardname">
                ${producto.nombre}
            </h3>

            <p class="cardprecio">
                <span class="precio-anterior">
                    $${producto.precioAnterior.toLocaleString('es-CO')}
                </span>

                $${producto.precio.toLocaleString('es-CO')}
            </p>

            <button
                class="cardbtn"
                type="button"
            >
                Añadir al carrito
            </button>
        </article>
    `).join('');
}


// ==================================================================
// CARRITO
// ==================================================================

/**
 * Crea y sincroniza el carrito usando localStorage
 * para conservarlo al cambiar de página.
 */
export function iniciarCarrito() {

    const clave = 'jers_carrito';

    const cargar = () => {
        try {
            return JSON.parse(
                localStorage.getItem(clave)
            ) || [];
        } catch {
            return [];
        }
    };

    let carrito = cargar();

    const lista = document.querySelector('.carrito-lista');
    const contador = document.querySelector('.carrito-contador');
    const totalTexto = document.querySelector('.carrito-total');
    const panel = document.querySelector('.carrito-panel');
    const fondo = document.querySelector('.carrito-fondo');


    /**
     * Actualiza el contador, total y lista visible
     * después de cada cambio.
     */
    const actualizarVista = () => {

        if (!lista || !contador || !totalTexto) return;

        let total = 0;
        let cantidadTotal = 0;

        lista.innerHTML = carrito.map((item, indice) => {

            const subtotal = item.precio * item.cantidad;

            total += subtotal;
            cantidadTotal += item.cantidad;

            return `
                <li class="carrito-item">
                    <span>
                        ${item.nombre} x${item.cantidad}
                    </span>

                    <span>
                        $${subtotal.toLocaleString('es-CO')}
                    </span>

                    <button
                        class="quitar-item"
                        data-indice="${indice}"
                        aria-label="Quitar producto"
                    >
                        ✕
                    </button>
                </li>
            `;

        }).join('');

        contador.textContent = cantidadTotal;

        totalTexto.textContent =
            `$${total.toLocaleString('es-CO')}`;
    };


    const guardar = () => {
        localStorage.setItem(
            clave,
            JSON.stringify(carrito)
        );
    };


    const abrir = () => {
        panel?.classList.add('abierto');
        fondo?.classList.add('visible');
    };


    const cerrar = () => {
        panel?.classList.remove('abierto');
        fondo?.classList.remove('visible');
    };


    document.addEventListener('click', evento => {

        const botonAgregar =
            evento.target.closest('.cardbtn');

        if (!botonAgregar) return;

        const tarjeta =
            botonAgregar.closest('.card');

        if (!tarjeta) return;

        const existente = carrito.find(
            item =>
                item.nombre === tarjeta.dataset.nombre
        );

        if (existente) {
            existente.cantidad += 1;
        } else {
            carrito.push({
                nombre: tarjeta.dataset.nombre,
                precio: Number(tarjeta.dataset.precio),
                cantidad: 1
            });
        }

        guardar();
        actualizarVista();
        abrir();
    });


    lista?.addEventListener('click', evento => {

        const botonQuitar =
            evento.target.closest('.quitar-item');

        if (!botonQuitar) return;

        carrito.splice(
            Number(botonQuitar.dataset.indice),
            1
        );

        guardar();
        actualizarVista();
    });


    document
        .querySelector('.carrito-icono')
        ?.addEventListener('click', abrir);


    document
        .querySelector('.carrito-cerrar')
        ?.addEventListener('click', cerrar);


    fondo?.addEventListener('click', cerrar);


    window.addEventListener('storage', () => {
        carrito = cargar();
        actualizarVista();
    });


    document
        .querySelector('.finalizar-pedido')
        ?.addEventListener('click', () => {

            if (!carrito.length) {
                alert(
                    'Tu carrito está vacío. Agrega algún producto primero 💕'
                );
                return;
            }

            if (NUMERO_WHATSAPP === '573000000000') {
                alert(
                    'Agrega el número real de WhatsApp en js/app.js antes de finalizar pedidos.'
                );
                return;
            }

            const detalle = carrito
                .map(
                    item =>
                        `• ${item.nombre} x${item.cantidad} - $${(
                            item.precio * item.cantidad
                        ).toLocaleString('es-CO')}`
                )
                .join('\n');

            const total = carrito.reduce(
                (acumulado, item) =>
                    acumulado +
                    item.precio * item.cantidad,
                0
            );

            window.open(
                `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(
                    `Hola, quiero hacer este pedido:\n\n${detalle}\n\nTotal: $${total.toLocaleString('es-CO')}`
                )}`,
                '_blank'
            );
        });

    actualizarVista();
}


// ==================================================================
// FORMULARIO DE CONTACTO
// ==================================================================

/**
 * Valida los datos del formulario y muestra un mensaje local,
 * sin enviar información a un servidor.
 */
export function iniciarFormularioContacto() {

    const formulario =
        document.querySelector('.formulario-contacto');

    const mensaje =
        document.querySelector('.formulario-mensaje');

    if (!formulario || !mensaje) return;

    formulario.addEventListener('submit', evento => {

        evento.preventDefault();

        const nombre =
            formulario.nombre.value.trim();

        const telefono =
            formulario.telefono.value.trim();

        const correo =
            formulario.correo.value.trim();

        let texto =
            '¡Gracias! Te contactaremos pronto 💕';

        let tipo = 'exito';

        if (!nombre || !telefono || !correo) {

            texto =
                'Por favor completa todos los campos.';

            tipo = 'error';

        } else if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
        ) {

            texto =
                'Revisa tu correo, no parece válido.';

            tipo = 'error';
        }

        mensaje.textContent = texto;

        mensaje.className =
            `formulario-mensaje ${tipo}`;

        if (tipo === 'exito') {
            formulario.reset();
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

            if (NUMERO_WHATSAPP === '573000000000') {
                alert(
                    'Agrega el número real de WhatsApp en js/app.js para recibir mensajes.'
                );
                return;
            }

            window.open(
                `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(
                    '¡Hola! Vi la página de By Jers y quiero saber más sobre sus productos ✨'
                )}`,
                '_blank'
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

    const elementos =
        document.querySelectorAll('.revelar');

    const observador =
        new IntersectionObserver(
            entradas => {

                entradas.forEach(entrada => {

                    if (entrada.isIntersecting) {

                        entrada.target.classList.add(
                            'visible'
                        );

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
// INICIAR APLICACIÓN
// ==================================================================

/**
 * Inicializa las funciones comunes.
 * Cada script de página llama esta función una sola vez.
 */
export function iniciarAplicacion() {

    iniciarMenuMovil();
    resaltarPaginaActual();
    iniciarCarrito();
    iniciarWhatsapp();
    iniciarChatbot();
    iniciarAnimacionesScroll();

}