// ============================================
// Este mismo script.js se carga en las 5 páginas
// (index, maquillaje, cabello, resenas, contacto).
// Como no todas tienen los mismos elementos, cada bloque
// revisa primero si su elemento existe antes de usarlo.
// Así evitamos errores como "no se puede leer 'addEventListener' de null".
// ============================================


// ============================================
// MENÚ HAMBURGUESA (móvil) — existe en todas las páginas
// ============================================

const botonMenu = document.querySelector('.menu-toggle');
const listaMenu = document.querySelector('.menulist');

if (botonMenu && listaMenu) {
    botonMenu.addEventListener('click', () => {
        listaMenu.classList.toggle('activo');
    });

    document.querySelectorAll('.menulist a').forEach(link => {
        link.addEventListener('click', () => {
            listaMenu.classList.remove('activo');
        });
    });
}


// ============================================
// RESALTAR EL LINK DE LA PÁGINA ACTUAL EN EL MENÚ
// ============================================

const paginaActual = window.location.pathname.split('/').pop() || 'index.html';

document.querySelectorAll('.menuitem a').forEach(link => {
    const hrefArchivo = link.getAttribute('href').split('#')[0];
    if (hrefArchivo === paginaActual) {
        link.classList.add('pagina-actual');
    }
});


// ============================================
// BOTÓN "VER PRODUCTOS" DEL HERO (solo existe en index.html)
// ============================================

const botonHero = document.querySelector('.herobtn');
if (botonHero) {
    botonHero.addEventListener('click', () => {
        document.querySelector('#categorias').scrollIntoView({ behavior: 'smooth' });
    });
}


// ============================================
// CATÁLOGO
// Cada categoría es una lista de marcas, y cada marca trae sus
// productos. Para vender más marcas, se agrega un objeto nuevo
// dentro del arreglo de la categoría que corresponda.
// ============================================

const catalogoMaquillaje = {
    rostro: [
        {
            marca: 'Atenea Profesional',
            productos: [
                { nombre: 'Base Atenea', precio: 58000, imagen: 'Imagenes/base-atenea.jpg' },
                { nombre: 'Corrector Atenea', precio: 38000, imagen: 'Imagenes/corrector-atenea.jpg' },
            ],
        },
        {
            marca: "L'Bel",
            productos: [
                { nombre: "Base Matte L'Bel", precio: 62000, imagen: 'Imagenes/base-lbel.jpg' },
            ],
        },
    ],
    ojos: [
        {
            marca: 'Atenea Profesional',
            productos: [
                { nombre: 'Sombras Atenea', precio: 45000, imagen: 'Imagenes/sombras-atenea.jpg' },
            ],
        },
        {
            marca: 'Jorge de la Garza',
            productos: [
                { nombre: 'Delineador en Gel JDG', precio: 34000, imagen: 'Imagenes/delineador-jdg.jpg' },
            ],
        },
    ],
    labios: [
        {
            marca: 'Atenea Profesional',
            productos: [
                { nombre: 'Lip Gloss', precio: 32000, imagen: 'Imagenes/lip-gloss.jpg' },
            ],
        },
        {
            marca: "L'Bel",
            productos: [
                { nombre: "Labial Mate L'Bel", precio: 36000, imagen: 'Imagenes/labial-lbel.jpg' },
            ],
        },
    ],
};

// Cuidado capilar: igual que maquillaje, cada categoría agrupa
// varias marcas y cada marca trae su lista de productos.
const catalogoCabello = {
    shampoo: [
        {
            marca: 'Atenea Profesional',
            productos: [
                { nombre: 'Shampoo Hidratación Profunda', precio: 46000, imagen: 'Imagenes/shampoo-hidratacion.jpg' },
            ],
        },
        {
            marca: "L'Bel",
            productos: [
                { nombre: "Shampoo Anticaída L'Bel", precio: 52000, imagen: 'Imagenes/shampoo-anticaida.jpg' },
            ],
        },
        {
            marca: 'Jorge de la Garza',
            productos: [
                { nombre: 'Shampoo Nutritivo JDG', precio: 41000, imagen: 'Imagenes/shampoo-nutritivo.jpg' },
            ],
        },
    ],
    acondicionador: [
        {
            marca: 'Atenea Profesional',
            productos: [
                { nombre: 'Acondicionador Reparador', precio: 46000, imagen: 'Imagenes/acondicionador-reparador.jpg' },
            ],
        },
        {
            marca: "L'Bel",
            productos: [
                { nombre: "Acondicionador Nutrición Intensa L'Bel", precio: 50000, imagen: 'Imagenes/acondicionador-nutricion.jpg' },
            ],
        },
    ],
    tratamientos: [
        {
            marca: 'Atenea Profesional',
            productos: [
                { nombre: 'Tratamiento Control de Frizz', precio: 58000, imagen: 'Imagenes/tratamiento-frizz.jpg' },
            ],
        },
        {
            marca: 'Jorge de la Garza',
            productos: [
                { nombre: 'Ampolletas de Keratina JDG', precio: 39000, imagen: 'Imagenes/ampolletas-keratina.jpg' },
            ],
        },
    ],
};

// Productos en promoción (solo se usan en index.html)
const productosPromo = [
    { nombre: 'Paleta de Sombras Nude', precio: 45000, precioAnterior: 58000, imagen: 'Imagenes/paleta-nude.jpg' },
    { nombre: 'Labial Mate Larga Duración', precio: 29000, precioAnterior: 38000, imagen: 'Imagenes/labial-mate.jpg' },
    { nombre: 'Shampoo Hidratación Profunda', precio: 38000, precioAnterior: 46000, imagen: 'Imagenes/shampoo-hidratacion.jpg' },
];


// ============================================
// RENDERIZAR CATÁLOGO AGRUPADO POR MARCA
// ============================================

function renderizarCatalogo(grupoMarcas, contenedor) {
    contenedor.innerHTML = '';

    if (!grupoMarcas || grupoMarcas.length === 0) {
        contenedor.innerHTML = '<p class="catalogo-vacio">Aún no hay productos en esta categoría.</p>';
        return;
    }

    grupoMarcas.forEach(grupo => {
        const bloque = document.createElement('div');
        bloque.className = 'marca-bloque';

        const tarjetasHTML = grupo.productos.map(producto => `
            <div class="card" data-nombre="${producto.nombre}" data-precio="${producto.precio}">
                <img src="${producto.imagen}" alt="${producto.nombre}" class="cardimage">
                <h3 class="cardname">${producto.nombre}</h3>
                <p class="cardprecio">$${producto.precio.toLocaleString('es-CO')}</p>
                <button class="cardbtn" type="button">Añadir al carrito</button>
            </div>
        `).join('');

        bloque.innerHTML = `
            <div class="marca-header">
                <h3 class="marca-nombre">${grupo.marca}</h3>
                <span class="marca-cantidad">${grupo.productos.length} producto(s)</span>
            </div>
            <div class="tarjetas">${tarjetasHTML}</div>
        `;

        contenedor.appendChild(bloque);
    });
}


// ============================================
// TABS: cada grupo de tabs controla su propio contenedor de catálogo
// ============================================

function inicializarTabs(grupoSelector, catalogo, contenedorId) {
    const grupoTabs = document.querySelector(`.tabs[data-grupo="${grupoSelector}"]`);
    if (!grupoTabs) return;

    const botones = grupoTabs.querySelectorAll('.tab-btn');
    const contenedor = document.getElementById(contenedorId);

    botones.forEach(boton => {
        boton.addEventListener('click', () => {
            botones.forEach(b => b.classList.remove('tab-activo'));
            boton.classList.add('tab-activo');
            renderizarCatalogo(catalogo[boton.dataset.categoria], contenedor);
        });
    });

    const categoriaDesdeHash = window.location.hash.replace('#', '');
    const botonInicial = [...botones].find(b => b.dataset.categoria === categoriaDesdeHash) || botones[0];

    botones.forEach(b => b.classList.remove('tab-activo'));
    botonInicial.classList.add('tab-activo');
    renderizarCatalogo(catalogo[botonInicial.dataset.categoria], contenedor);
}

inicializarTabs('maquillaje', catalogoMaquillaje, 'catalogoMaquillaje');
inicializarTabs('cabello', catalogoCabello, 'catalogoCabello');


// ============================================
// PROMOCIONES (solo en index.html)
// ============================================

const contenedorPromo = document.getElementById('promoGrid');
if (contenedorPromo) {
    contenedorPromo.innerHTML = productosPromo.map(producto => `
        <div class="card" data-nombre="${producto.nombre}" data-precio="${producto.precio}">
            <span class="descuento-badge">Oferta</span>
            <img src="${producto.imagen}" alt="${producto.nombre}" class="cardimage">
            <h3 class="cardname">${producto.nombre}</h3>
            <p class="cardprecio">
                <span class="precio-anterior">$${producto.precioAnterior.toLocaleString('es-CO')}</span>
                $${producto.precio.toLocaleString('es-CO')}
            </p>
            <button class="cardbtn" type="button">Añadir al carrito</button>
        </div>
    `).join('');
}


// ============================================
// CARRITO DE COMPRAS
// ============================================

const CARRITO_KEY = 'jers_carrito';

function cargarCarrito() {
    try {
        return JSON.parse(localStorage.getItem(CARRITO_KEY)) || [];
    } catch (error) {
        return [];
    }
}

function guardarCarrito() {
    localStorage.setItem(CARRITO_KEY, JSON.stringify(carrito));
}

let carrito = cargarCarrito();

document.addEventListener('click', (evento) => {
    const boton = evento.target.closest('.cardbtn');
    if (!boton) return;

    const card = boton.closest('.card');
    const nombre = card.dataset.nombre;
    const precio = Number(card.dataset.precio);
    agregarAlCarrito(nombre, precio);
});

function agregarAlCarrito(nombre, precio) {
    const itemExistente = carrito.find(item => item.nombre === nombre);

    if (itemExistente) {
        itemExistente.cantidad++;
    } else {
        carrito.push({ nombre, precio, cantidad: 1 });
    }

    guardarCarrito();
    actualizarCarritoUI();
    abrirCarrito();
}

function actualizarCarritoUI() {
    const lista = document.querySelector('.carrito-lista');
    const contador = document.querySelector('.carrito-contador');
    const totalTexto = document.querySelector('.carrito-total');
    if (!lista || !contador || !totalTexto) return;

    lista.innerHTML = '';
    let total = 0;
    let totalItems = 0;

    carrito.forEach((item, index) => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        totalItems += item.cantidad;

        const li = document.createElement('li');
        li.classList.add('carrito-item');
        li.innerHTML = `
            <span>${item.nombre} x${item.cantidad}</span>
            <span>$${subtotal.toLocaleString('es-CO')}</span>
            <button class="quitar-item" data-index="${index}" aria-label="Quitar producto">✕</button>
        `;
        lista.appendChild(li);
    });

    contador.textContent = totalItems;
    totalTexto.textContent = `$${total.toLocaleString('es-CO')}`;
}

actualizarCarritoUI();

window.addEventListener('storage', (evento) => {
    if (evento.key === CARRITO_KEY) {
        carrito = cargarCarrito();
        actualizarCarritoUI();
    }
});

const listaCarritoEl = document.querySelector('.carrito-lista');
if (listaCarritoEl) {
    listaCarritoEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('quitar-item')) {
            const index = Number(e.target.dataset.index);
            carrito.splice(index, 1);
            guardarCarrito();
            actualizarCarritoUI();
        }
    });
}

const panelCarrito = document.querySelector('.carrito-panel');
const fondoCarrito = document.querySelector('.carrito-fondo');
const iconoCarrito = document.querySelector('.carrito-icono');
const cerrarCarritoBtn = document.querySelector('.carrito-cerrar');

function abrirCarrito() {
    if (panelCarrito) panelCarrito.classList.add('abierto');
    if (fondoCarrito) fondoCarrito.classList.add('visible');
}

function cerrarCarrito() {
    if (panelCarrito) panelCarrito.classList.remove('abierto');
    if (fondoCarrito) fondoCarrito.classList.remove('visible');
}

if (iconoCarrito) iconoCarrito.addEventListener('click', abrirCarrito);
if (cerrarCarritoBtn) cerrarCarritoBtn.addEventListener('click', cerrarCarrito);
if (fondoCarrito) fondoCarrito.addEventListener('click', cerrarCarrito);

const botonFinalizar = document.querySelector('.finalizar-pedido');
if (botonFinalizar) {
    botonFinalizar.addEventListener('click', () => {
        if (carrito.length === 0) {
            alert('Tu carrito está vacío. Agrega algún producto primero 💕');
            return;
        }

        const numeroWhatsapp = '573000000000'; // TODO: cambia esto por tu número real (código de país + número, sin + ni espacios)

        let mensaje = 'Hola, quiero hacer este pedido:\n\n';
        let total = 0;

        carrito.forEach(item => {
            const subtotal = item.precio * item.cantidad;
            total += subtotal;
            mensaje += `• ${item.nombre} x${item.cantidad} - $${subtotal.toLocaleString('es-CO')}\n`;
        });

        mensaje += `\nTotal: $${total.toLocaleString('es-CO')}`;

        const url = `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
    });
}


// ============================================
// FORMULARIO DE CONTACTO (solo existe en contacto.html)
// ============================================

const formulario = document.querySelector('.formulario-contacto');

if (formulario) {
    formulario.addEventListener('submit', (e) => {
        e.preventDefault();

        const nombre = document.querySelector('#nombre').value.trim();
        const telefono = document.querySelector('#telefono').value.trim();
        const correo = document.querySelector('#correo').value.trim();

        if (nombre === '' || telefono === '' || correo === '') {
            mostrarMensajeFormulario('Por favor completa todos los campos.', 'error');
            return;
        }

        const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
        if (!correoValido) {
            mostrarMensajeFormulario('Revisa tu correo, no parece válido.', 'error');
            return;
        }

        mostrarMensajeFormulario('¡Gracias! Te contactaremos pronto 💕', 'exito');
        formulario.reset();
    });
}

function mostrarMensajeFormulario(texto, tipo) {
    const mensajeEstado = document.querySelector('.formulario-mensaje');
    if (!mensajeEstado) return;
    mensajeEstado.textContent = texto;
    mensajeEstado.classList.remove('error', 'exito');
    mensajeEstado.classList.add(tipo);
}


// ============================================
// BOTÓN FLOTANTE DE WHATSAPP
// A los pocos segundos de cargar la página aparece una burbuja
// con un mensaje que invita a preguntar/comprar. Al hacer clic en
// el botón se abre WhatsApp con un mensaje ya escrito.
// ============================================

const NUMERO_WHATSAPP = '573000000000'; // TODO: mismo número que en el carrito

const mensajesAtraccion = [
    '¡Hola! 👋 ¿Buscas tu <strong>tono ideal</strong>? Escríbenos y te asesoramos gratis.',
    '✨ Tenemos <strong>25% de descuento</strong> este mes. ¿Te contamos cuáles productos aplican?',
    '💬 ¿Tienes dudas sobre algún producto? Pregúntanos por WhatsApp, respondemos rápido.',
];

function crearBotonWhatsapp() {
    const contenedor = document.createElement('div');
    contenedor.className = 'whatsapp-flotante';

    const mensajeAleatorio = mensajesAtraccion[Math.floor(Math.random() * mensajesAtraccion.length)];

    contenedor.innerHTML = `
        <div class="whatsapp-burbuja" id="whatsappBurbuja">
            <button class="whatsapp-burbuja-cerrar" type="button" aria-label="Cerrar mensaje">✕</button>
            <p>${mensajeAleatorio}</p>
        </div>
        <button class="whatsapp-boton pulso" type="button" aria-label="Escribir por WhatsApp">📲</button>
    `;

    document.body.appendChild(contenedor);

    const burbuja = contenedor.querySelector('#whatsappBurbuja');
    const cerrarBurbuja = contenedor.querySelector('.whatsapp-burbuja-cerrar');
    const boton = contenedor.querySelector('.whatsapp-boton');

    // La burbuja aparece sola después de 3 segundos, como un vendedor
    // que se acerca a saludar, sin ser invasivo desde el inicio.
    setTimeout(() => {
        burbuja.classList.add('visible');
    }, 3000);

    cerrarBurbuja.addEventListener('click', (e) => {
        e.stopPropagation();
        burbuja.classList.remove('visible');
    });

    boton.addEventListener('click', () => {
        const mensaje = '¡Hola! Vi la página de By Jers y quiero saber más sobre sus productos ✨';
        const url = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
    });
}

crearBotonWhatsapp();


// ============================================
// CHATBOT DE PREGUNTAS SOBRE PRODUCTOS
// Es un chatbot sencillo por palabras clave: NO usa IA ni una API,
// solo compara el texto que escribe la persona contra un pequeño
// "banco" de productos y responde según coincidencias, con if/else
// y recorriendo arreglos, tal como se ve en el curso.
// ============================================

const bancoProductos = [
    {
        palabrasClave: ['base', 'rostro'],
        nombre: 'la Base Atenea',
        uso: 'Se usa para unificar el tono de la piel y cubrir imperfecciones, dejando un acabado natural.',
        componentes: 'Contiene pigmentos minerales, ácido hialurónico y protector solar FPS 15.',
    },
    {
        palabrasClave: ['corrector'],
        nombre: 'el Corrector Atenea',
        uso: 'Se usa para cubrir ojeras, manchas o granitos antes de aplicar la base.',
        componentes: 'Contiene pigmentos de alta cobertura y vitamina E.',
    },
    {
        palabrasClave: ['sombra', 'sombras', 'ojos'],
        nombre: 'las Sombras Atenea',
        uso: 'Se usan para dar color y profundidad a los párpados, en looks de día o de noche.',
        componentes: 'Contienen mica, talco cosmético y pigmentos libres de crueldad animal.',
    },
    {
        palabrasClave: ['delineador', 'delineado'],
        nombre: 'el Delineador en Gel JDG',
        uso: 'Se usa para marcar la línea de las pestañas y definir la mirada.',
        componentes: 'Fórmula en gel a base de ceras naturales y pigmentos negros de larga duración.',
    },
    {
        palabrasClave: ['labial', 'labios', 'gloss'],
        nombre: 'el Labial Mate',
        uso: 'Se usa para dar color a los labios con un acabado mate de larga duración.',
        componentes: 'Contiene manteca de karité, vitamina E y pigmentos mate.',
    },
    {
        palabrasClave: ['shampoo', 'champú'],
        nombre: 'el Shampoo de Hidratación Profunda',
        uso: 'Se usa para limpiar el cabello mientras lo hidrata, ideal para cabello seco o maltratado.',
        componentes: 'Contiene keratina, aceite de argán y extracto de aloe vera.',
    },
    {
        palabrasClave: ['acondicionador'],
        nombre: 'el Acondicionador Reparador',
        uso: 'Se usa después del shampoo para desenredar y sellar la fibra capilar.',
        componentes: 'Contiene proteínas de seda, manteca de karité y pantenol.',
    },
    {
        palabrasClave: ['frizz', 'tratamiento', 'ampolleta', 'keratina'],
        nombre: 'el Tratamiento Control de Frizz',
        uso: 'Se usa para controlar el encrespamiento y dar brillo al cabello.',
        componentes: 'Contiene siliconas suaves, keratina hidrolizada y aceite de coco.',
    },
];

const palabrasUso = ['sirve', 'uso', 'usa', 'para que', 'para qué', 'beneficio'];
const palabrasComponentes = ['componente', 'ingrediente', 'contiene', 'lleva', 'hecho'];
const palabrasPrecio = ['precio', 'cuesta', 'vale', 'costo'];
const palabrasSaludo = ['hola', 'buenas', 'buenos dias', 'buenas tardes'];

function buscarProducto(texto) {
    return bancoProductos.find(producto =>
        producto.palabrasClave.some(palabra => texto.includes(palabra))
    );
}

function contienePalabraDeLista(texto, lista) {
    return lista.some(palabra => texto.includes(palabra));
}

function generarRespuestaBot(mensajeUsuario) {
    const texto = mensajeUsuario.toLowerCase();

    if (contienePalabraDeLista(texto, palabrasSaludo)) {
        return '¡Hola! 💕 Pregúntame por un producto, por ejemplo: "¿para qué sirve el shampoo?" o "¿qué componentes tiene el labial?".';
    }

    const producto = buscarProducto(texto);

    if (producto && contienePalabraDeLista(texto, palabrasComponentes)) {
        return `${producto.componentes}`;
    }

    if (producto && contienePalabraDeLista(texto, palabrasPrecio)) {
        return `Los precios de ${producto.nombre} los puedes ver en su sección del catálogo, ¡varían según la presentación! 🛍️`;
    }

    if (producto) {
        // Si preguntó por el producto pero no especificó qué quiere
        // saber, asumimos que quiere conocer para qué sirve.
        return `${producto.uso}`;
    }

    if (contienePalabraDeLista(texto, palabrasUso) || contienePalabraDeLista(texto, palabrasComponentes)) {
        return 'Cuéntame sobre qué producto es tu pregunta (base, corrector, sombras, delineador, labial, shampoo, acondicionador o tratamiento) y te cuento para qué sirve y qué contiene.';
    }

    return 'No tengo información sobre eso todavía 🙈 Puedes preguntarme por: base, corrector, sombras, delineador, labial, shampoo, acondicionador o tratamiento. Si prefieres, escríbenos por WhatsApp y te ayudamos personalmente.';
}

function crearChatbot() {
    const boton = document.createElement('button');
    boton.className = 'chatbot-boton';
    boton.type = 'button';
    boton.setAttribute('aria-label', 'Abrir asistente de productos');
    boton.textContent = '💄';

    const panel = document.createElement('div');
    panel.className = 'chatbot-panel';
    panel.innerHTML = `
        <div class="chatbot-cabecera">
            <div>
                <h3>Asesora By Jers</h3>
                <p>Pregúntame sobre nuestros productos</p>
            </div>
            <button class="chatbot-cerrar" type="button" aria-label="Cerrar chat">✕</button>
        </div>
        <div class="chatbot-mensajes" id="chatbotMensajes"></div>
        <div class="chatbot-sugerencias">
            <button class="chatbot-chip" type="button" data-pregunta="¿Para qué sirve el shampoo?">¿Para qué sirve el shampoo?</button>
            <button class="chatbot-chip" type="button" data-pregunta="¿Qué componentes tiene el labial?">Componentes del labial</button>
        </div>
        <form class="chatbot-form">
            <input type="text" class="chatbot-input" placeholder="Escribe tu pregunta..." aria-label="Escribe tu pregunta">
            <button class="chatbot-enviar" type="submit" aria-label="Enviar pregunta">➤</button>
        </form>
    `;

    document.body.appendChild(boton);
    document.body.appendChild(panel);

    const mensajesEl = panel.querySelector('#chatbotMensajes');
    const formEl = panel.querySelector('.chatbot-form');
    const inputEl = panel.querySelector('.chatbot-input');
    const cerrarEl = panel.querySelector('.chatbot-cerrar');

    function agregarMensaje(texto, tipo) {
        const burbuja = document.createElement('div');
        burbuja.className = `chatbot-msg ${tipo}`;
        burbuja.textContent = texto;
        mensajesEl.appendChild(burbuja);
        mensajesEl.scrollTop = mensajesEl.scrollHeight;
    }

    function enviarPregunta(pregunta) {
        if (pregunta.trim() === '') return;

        agregarMensaje(pregunta, 'usuario');

        const respuesta = generarRespuestaBot(pregunta);

        // Practicando lo visto en el curso: dejamos también el
        // registro de la pregunta y la respuesta en la consola.
        console.log('Pregunta del usuario:', pregunta);
        console.log('Respuesta del chatbot:', respuesta);

        setTimeout(() => {
            agregarMensaje(respuesta, 'bot');
        }, 400);
    }

    // Mensaje de bienvenida al abrir el chat por primera vez
    let chatIniciado = false;

    boton.addEventListener('click', () => {
        panel.classList.toggle('abierto');
        if (!chatIniciado) {
            agregarMensaje('¡Hola! Soy la asesora virtual de By Jers 💄 Pregúntame para qué sirve un producto o qué componentes tiene.', 'bot');
            chatIniciado = true;
        }
    });

    cerrarEl.addEventListener('click', () => {
        panel.classList.remove('abierto');
    });

    formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        enviarPregunta(inputEl.value);
        inputEl.value = '';
    });

    panel.querySelectorAll('.chatbot-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            enviarPregunta(chip.dataset.pregunta);
        });
    });
}

crearChatbot();


// ============================================
// ANIMACIÓN AL APARECER (scroll reveal) — existe en todas las páginas
// ============================================

const elementosRevelar = document.querySelectorAll('.revelar');

const observador = new IntersectionObserver((entradas) => {
    entradas.forEach(entrada => {
        if (entrada.isIntersecting) {
            entrada.target.classList.add('visible');
        }
    });
}, { threshold: 0.15 });

elementosRevelar.forEach(el => observador.observe(el));