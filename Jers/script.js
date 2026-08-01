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
// Compara el nombre del archivo actual con el href de cada link
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

const catalogoCabello = {
    shampoo: [
        {
            marca: 'Marca por definir',
            productos: [
                { nombre: 'Shampoo Hidratación Profunda', precio: 46000, imagen: 'Imagenes/shampoo-hidratacion.jpg' },
            ],
        },
    ],
    acondicionador: [
        {
            marca: 'Marca por definir',
            productos: [
                { nombre: 'Acondicionador Reparador', precio: 46000, imagen: 'Imagenes/acondicionador-reparador.jpg' },
            ],
        },
    ],
    tratamientos: [
        {
            marca: 'Marca por definir',
            productos: [
                { nombre: 'Tratamiento Control de Frizz', precio: 58000, imagen: 'Imagenes/tratamiento-frizz.jpg' },
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
// Solo se activa si existe ese grupo de tabs en la página actual
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

    // Si llegamos con un hash en la URL (ej: maquillaje.html#ojos porque
    // vinimos de un tile de Categorías en Inicio), abrimos esa categoría.
    // Si no hay hash, usamos la primera tab por defecto.
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
// Como cada sección ahora es una pestaña nueva del navegador, el
// carrito no puede vivir solo en una variable de JavaScript (esa
// variable se perdería al cambiar de pestaña). Por eso lo guardamos
// en localStorage: un almacenamiento que el navegador comparte entre
// todas las pestañas del mismo sitio.
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

// Delegación de eventos: como el catálogo se genera dinámicamente,
// escuchamos los clics en todo el documento y revisamos si vinieron
// de un botón ".cardbtn".
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

// Muestra el contador correcto apenas carga la página, aunque el
// carrito se haya llenado desde otra pestaña.
actualizarCarritoUI();

// Si el carrito cambia en OTRA pestaña (por ejemplo, agregas algo en
// maquillaje.html y tienes cabello.html abierto al mismo tiempo),
// el navegador dispara el evento "storage" para que nos actualicemos.
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

// Abrir / cerrar el panel del carrito
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

// Finalizar pedido: arma un mensaje con el resumen de la compra
// y abre WhatsApp con el mensaje ya escrito
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

        // Nota: esto valida y confirma en pantalla, pero todavía no ENVÍA
        // el formulario a ningún lado (no hay backend conectado).
        // Cuando quieras que te llegue de verdad, podemos conectarlo a
        // un servicio como EmailJS o Formspree.
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