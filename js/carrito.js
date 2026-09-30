/**
 * carrito.js - Carrito unico del sitio
 *
 * POR QUE ESTE ARCHIVO EXISTE
 * ---------------------------
 * El carrito estaba repartido en tres sitios que reimplementaban la misma logica:
 * `iniciarCarrito()` en app.js, `sincronizarCarritoTrasAuth()` en auth.js y el
 * `borrado` manual de `jers_carrito` en checkout.js. Tres copias, tres
 * behaviours distintos, y por en medio se colaron los fallos que seTrying arreglar:
 *
 *  1. Envenenamiento del merge: un solo item local con un id que no era un
 *     ObjectId (o de un producto ya desactivado) hacia `throw`, abortaba el
 *     bucle entero y `jers_carrito` NO se limpiaba. Ese item se quedaba para
 *     siempre y hacia fallar el merge en cada login y en cada checkout.
 *  2. Degradacion por cualquier error: un 500 o un timeout de red ponian el
 *     carrito en modo local aunque el usuario estuviera logueado, y a partir de
 *     ahi se escribian en localStorage objetos con la forma de la API.
 *  3. `onComplete` se llamaba siempre, asi que "Comprar ahora" redirigia al
 *     checkout aunque no se hubiera agregado nada.
 *
 * Aqui hay UNA sola implementacion y las tres rutas usan estas funciones.
 *
 * MODELO
 * ------
 * - Invitado: el carrito vive en `localStorage['jers_carrito']`.
 * - Logueado: el carrito vive en el backend (`/api/cart`).
 * - Al iniciar sesion, el carrito de invitado se fusiona con el del servidor.
 *
 * REGLA DE FUSION: SE QUEDA LA CANTIDAD MAYOR
 * --------------------------------------------
 * Para un mismo producto se conserva `max(invitado, servidor)`, no la suma.
 * Sumar duplicaria unidades en cada inicio de sesion, porque el item de
 * invitado seguiria ahi hasta que se limpiara. Con `max`:
 *   - no se pierde ningun producto (si estaba en uno de los dos, queda);
 *   - no se infla el stock;
 *   - es idempotente: fusionar dos veces da el mismo resultado, asi que un
 *     reintento o una pestana duplicada no Rompen nada.
 *
 * Un item local que la API rechaza (producto borrado, desactivado o sin stock)
 * se DESCARTA y se avisa. Antes se quedaba atrapado y rompia la fusion para
 * siempre; ahora no puede volver a envenenar el carrito.
 */

import { getCart, addToCart, updateCartItem, removeFromCart, clearCart, getMe } from './apiClient.js';
import { escapeHTML, safeAssetUrl } from './sanitize.js';
import { formatearPrecio } from './config.js';

const CLAVE = 'jers_carrito';
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// ---------------------------------------------------------
// Estado interno
// ---------------------------------------------------------
let items = [];
let modoInvitado = true;
let instanciaUnica = false;

// ---------------------------------------------------------
// localStorage (invitado)
// ---------------------------------------------------------
const leerLocal = () => {
    try {
        const crudo = JSON.parse(localStorage.getItem(CLAVE) || '[]');
        if (!Array.isArray(crudo)) return [];
        // Se descartan en lectura los items con id invalido: son la causa del
        // envenenamiento y no sirven para nada contra la API.
        return crudo
            .filter(i => i && OBJECT_ID.test(String(i.id || '')))
            .map(i => ({
                id: String(i.id),
                nombre: String(i.nombre || 'Producto'),
                precio: Number(i.precio) || 0,
                cantidad: Math.max(1, Math.min(99, Number(i.cantidad) || 1)),
            }));
    } catch {
        return [];
    }
};

const escribirLocal = lista => {
    try {
        localStorage.setItem(CLAVE, JSON.stringify(lista));
    } catch {
        /* modo privado / cuota llena: se sigue en memoria */
    }
};

const limpiarLocal = () => {
    try { localStorage.removeItem(CLAVE); } catch { /* sin permisos */ }
};

// ---------------------------------------------------------
// Pintado de la UI
// ---------------------------------------------------------
const avisar = () => pintar();

// ---------------------------------------------------------
// API
// ---------------------------------------------------------
/** Normaliza un item del servidor a la misma forma que usa la UI. */
const desdeApi = item => ({
    id: String(item.producto?._id || item.producto),
    nombre: item.nombreSnapshot || item.producto?.nombre || 'Producto',
    precio: Number(item.precioUnitario) || 0,
    cantidad: Number(item.cantidad) || 1,
    imagen: item.imagenSnapshot || item.producto?.imagenes?.[0]?.url || '',
    itemId: item._id,
});

const desdeLocal = item => ({
    id: item.id,
    nombre: item.nombre,
    precio: Number(item.precio) || 0,
    cantidad: Number(item.cantidad) || 1,
    imagen: '',
    itemId: null,
});

const total = () => items.reduce((suma, i) => suma + i.precio * i.cantidad, 0);
const unidades = () => items.reduce((suma, i) => suma + i.cantidad, 0);

// ---------------------------------------------------------
// Pintado del panel (respeta los selectores que usan los HTML)
// ---------------------------------------------------------
function pintar() {
    const lista = document.querySelector('.carrito-lista');
    const contador = document.querySelector('.carrito-contador');
    const totalTexto = document.querySelector('.carrito-total');

    if (contador) contador.textContent = String(unidades());
    if (totalTexto) totalTexto.textContent = formatearPrecio(total());

    if (!lista) return;

    if (items.length === 0) {
        lista.innerHTML = '<li class="carrito-vacio">Tu carrito esta vacio.</li>';
        return;
    }

    lista.innerHTML = items.map((item, indice) => {
        const imagen = safeAssetUrl(item.imagen);
        const escapado = escapeHTML(item.nombre);
        return `
            <li class="carrito-item">
                ${imagen ? `<img class="carrito-item__img" src="${escapeHTML(imagen)}" alt="${escapado}">` : ''}
                <div class="carrito-item__datos">
                    <span class="carrito-item__nombre">${escapado}</span>
                    <span class="carrito-item__precio">${escapeHTML(formatearPrecio(item.precio * item.cantidad))}</span>
                    <span class="carrito-item__cantidad">Cant: ${item.cantidad}</span>
                </div>
                <button class="quitar-item" type="button" data-indice="${indice}"
                        ${item.itemId ? `data-item-id="${escapeHTML(item.itemId)}"` : ''}
                        aria-label="Quitar ${escapado} del carrito">&times;</button>
            </li>
        `;
    }).join('');
}

// El panel se oculta visualmente con `right: -420px`, pero eso NO lo saca del
// arbol de accesibilidad ni del orden de tabulacion: sus botones ("Cerrar
// carrito", "Finalizar pedido") seguian siendo alcanzables con el teclado estando
// fuera de pantalla, y el lector de pantalla los recorria en todas las paginas.
// Por eso el HTML lo marca `aria-hidden="true" inert` y aqui se quita al abrir.
// `inert` es lo que de verdad saca los descendientes del foco en los navegadores
// que lo soportan; `aria-hidden` cubre el resto.
const panelCarrito = () => document.getElementById('carritoPanel') || document.querySelector('.carrito-panel');
const botonCarrito = () => document.querySelector('.carrito-icono');
let ultimoFocoEnCarrito = null;

const marcarAbierto = abierto => {
    const panel = panelCarrito();
    if (panel) {
        panel.classList.toggle('abierto', abierto);
        panel.toggleAttribute('inert', !abierto);
        panel.setAttribute('aria-hidden', abierto ? 'false' : 'true');
    }
    document.querySelector('.carrito-fondo')?.classList.toggle('visible', abierto);
    botonCarrito()?.setAttribute('aria-expanded', abierto ? 'true' : 'false');
};

const abrirPanel = () => {
    ultimoFocoEnCarrito = document.activeElement;
    marcarAbierto(true);
    // El foco entra en el panel: si no, el Tab seguiria moviendose por el
    // contenido de fondo mientras el panel esta encima.
    panelCarrito()?.querySelector('.carrito-cerrar')?.focus();
};

const cerrarPanel = () => {
    if (!panelCarrito()?.classList.contains('abierto')) return;
    marcarAbierto(false);
    // Se devuelve el foco al boton que abrio el panel, para no perder al usuario
    // de teclado en un punto cualquiera del documento.
    (ultimoFocoEnCarrito || botonCarrito())?.focus?.();
    ultimoFocoEnCarrito = null;
};

// ---------------------------------------------------------
// Operaciones
// ---------------------------------------------------------

/**
 * Agrega un producto.
 * @param {{id: string, nombre: string, precio: number, cantidad?: number}} producto
 * @returns {Promise<{ok: boolean, motivo?: string}>} - El resultado importa:
 *   "Comprar ahora" solo continua si ok es true.
 */
export async function agregar(producto) {
    if (!producto?.id || !OBJECT_ID.test(String(producto.id))) {
        return { ok: false, motivo: 'Ese producto no se puede comprar.' };
    }
    const cantidad = Math.max(1, Math.min(99, Number(producto.cantidad) || 1));

    if (modoInvitado) {
        const existente = items.find(i => i.id === producto.id);
        if (existente) {
            existente.cantidad = Math.min(99, existente.cantidad + cantidad);
        } else {
            items.push({
                id: String(producto.id),
                nombre: String(producto.nombre || 'Producto'),
                precio: Number(producto.precio) || 0,
                cantidad,
                imagen: producto.imagen || '',
                itemId: null,
            });
        }
        escribirLocal(items.map(({ id, nombre, precio, cantidad: c }) => ({ id, nombre, precio, cantidad: c })));
        avisar();
        return { ok: true };
    }

    const respuesta = await addToCart({ productoId: producto.id, cantidad });
    if (!respuesta.ok) {
        // 401/403 = la sesion caduco. Se cae a modo invitado y se reintenta en
        // local para no perder la intencion del clic.
        if ([401, 403].includes(respuesta.data?.status)) {
            modoInvitado = true;
            return agregar(producto);
        }
        return { ok: false, motivo: respuesta.msg || 'No se pudo agregar el producto.' };
    }

    items = (respuesta.data?.cart?.items || []).map(desdeApi);
    avisar();
    return { ok: true };
}

/** Quita un producto por índice. */
export async function quitar(indice) {
    const item = items[indice];
    if (!item) return { ok: false };

    if (!modoInvitado && item.itemId) {
        const respuesta = await removeFromCart(item.itemId);
        if (!respuesta.ok) {
            if ([401, 403].includes(respuesta.data?.status)) { modoInvitado = true; return quitar(indice); }
            return { ok: false, motivo: respuesta.msg };
        }
        items = (respuesta.data?.cart?.items || []).map(desdeApi);
        avisar();
        return { ok: true };
    }

    items = items.filter((_, i) => i !== indice);
    escribirLocal(items.map(({ id, nombre, precio, cantidad }) => ({ id, nombre, precio, cantidad })));
    avisar();
    return { ok: true };
}

/** Cambia la cantidad. */
export async function cambiarCantidad(indice, cantidad) {
    const item = items[indice];
    if (!item) return { ok: false };
    const nueva = Math.max(1, Math.min(99, Number(cantidad) || 1));

    if (!modoInvitado && item.itemId) {
        const respuesta = await updateCartItem(item.itemId, nueva);
        if (!respuesta.ok) {
            if ([401, 403].includes(respuesta.data?.status)) { modoInvitado = true; return cambiarCantidad(indice, nueva); }
            return { ok: false, motivo: respuesta.msg };
        }
        items = (respuesta.data?.cart?.items || []).map(desdeApi);
        avisar();
        return { ok: true };
    }

    item.cantidad = nueva;
    escribirLocal(items.map(({ id, nombre, precio, cantidad: c }) => ({ id, nombre, precio, cantidad: c })));
    avisar();
    return { ok: true };
}

/** Vacía el carrito. */
export async function vaciar() {
    if (!modoInvitado) {
        const respuesta = await clearCart();
        if (!respuesta.ok && ![401, 403].includes(respuesta.data?.status)) {
            return { ok: false, motivo: respuesta.msg };
        }
    }
    items = [];
    limpiarLocal();
    avisar();
    return { ok: true };
}

// ---------------------------------------------------------
// Sesion
// ---------------------------------------------------------
/** Consulta si hay sesion. Un fallo de red NO significa "invitado". */
async function detectarSesion() {
    const respuesta = await getMe();
    if (respuesta.ok) {
        modoInvitado = false;
        return { logueado: true, user: respuesta.data?.user || null };
    }
    // 401/403 = sin sesion, es el caso normal de un invitado.
    if ([401, 403].includes(respuesta.data?.status)) {
        modoInvitado = true;
        return { logueado: false, user: null };
    }
    // Cualquier otro fallo (red caida, 500) no debe cambiar el modo actual: si el
    // usuario ya estaba operando en local, seguir en local; si ya estaba en API,
    // quedarse en API. Antes cualquier exception ponia el carrito en localStorage
    // y a partir de ahi se mezclaban objetos de dos formas distintas.
    return { logueado: !modoInvitado, user: null, degradado: true };
}

/**
 * Fusiona el carrito de invitado con el del servidor.
 *
 * - Por cada producto se queda la cantidad MAYOR de los dos lados.
 * - Un item que la API rechaza se descarta (no aborta el resto) y se avisa.
 * - Al terminar, el carrito local se limpia SIEMPRE: o sus productos estan en el
 *   servidor, o ya no existen. Dejarlo puesto es lo que hacia que un item malo
 *   rompiera la fusion en cada inicio de sesion.
 *
 * @returns {Promise<{ok: boolean, fusionados: number, descartados: string[]}>}
 */
export async function sincronizar() {
    const local = leerLocal();
    const respuestaServidor = await getCart();
    if (!respuestaServidor.ok) {
        return { ok: false, fusionados: 0, descartados: [] };
    }

    const delServidor = (respuestaServidor.data?.cart?.items || []).map(desdeApi);
    const descartados = [];

    for (const item of local) {
        const enServidor = delServidor.find(s => s.id === item.id);
        const objetivo = Math.max(item.cantidad, enServidor?.cantidad || 0);
        if (objetivo === (enServidor?.cantidad || 0)) continue;

        if (enServidor) {
            const r = await updateCartItem(enServidor.itemId, objetivo);
            if (!r.ok) descartados.push(item.nombre);
        } else {
            const r = await addToCart({ productoId: item.id, cantidad: item.cantidad });
            // Un 404 significa que el producto ya no existe. No es motivo para
            // tirar el resto del carrito: se descarta solo ese item.
            if (!r.ok) descartados.push(item.nombre);
        }
    }

    // Limpieza incondicional: es lo que rompe el ciclo de envenenamiento.
    limpiarLocal();

    const final = await getCart();
    items = final.ok ? (final.data?.cart?.items || []).map(desdeApi) : delServidor;
    modoInvitado = false;
    avisar();

    if (descartados.length) {
        console.warn('[carrito] Productos que ya no estan disponibles:', descartados.join(', '));
    }
    return { ok: true, fusionados: local.length, descartados };
}

/** Carga inicial: detecta sesion y trae el carrito que corresponda. */
async function cargar() {
    const sesion = await detectarSesion();
    if (sesion.degradado) {
        // No se pudo saber. Se mantiene lo que hubiera en memoria/local y se
        // deja la UI coherente.
        items = items.length ? items : leerLocal();
        avisar();
        return;
    }
    if (sesion.logueado) {
        const r = await getCart();
        items = r.ok ? (r.data?.cart?.items || []).map(desdeApi) : [];
    } else {
        items = leerLocal();
    }
    avisar();
}

// ---------------------------------------------------------
// API publica
// ---------------------------------------------------------
// Lacookie de sesion no se puede leer desde JS, asi que la unica forma de
// saber si hay sesion es preguntar al backend (js/api.js lo hace y cachea el
// resultado en api.obtenerUsuario).
export { obtenerUsuario, alCambiarSesion } from './api.js';

/**
 * Inicializa el carrito. Es idempotente: llamarlo dos veces NO duplica los
 * listeners, que era como un mismo clic acababa agregando el producto N veces.
 */
export async function iniciarCarrito() {
    if (instanciaUnica) {
        await cargar();
        return;
    }
    instanciaUnica = true;

    document.addEventListener('click', evento => {
        const boton = evento.target.closest('.cardbtn');
        if (!boton || boton.disabled) return;
        const tarjeta = boton.closest('.card');
        if (!tarjeta) return;
        agregar({
            id: tarjeta.dataset.id,
            nombre: tarjeta.dataset.nombre,
            precio: Number(tarjeta.dataset.precio) || 0,
        }).then(r => { if (r.ok) abrirPanel(); });
    });

    // Evento para el boton "Comprar ahora" de la ficha de producto.
    // onComplete SOLO se llama si el producto se agrego de verdad: antes se
    // llamaba siempre y el usuario llegaba al checkout con el carrito vacío.
    document.addEventListener('carrito-agregar', async evento => {
        const { id, nombre, precio, cantidad, onComplete } = evento.detail || {};
        const r = await agregar({ id, nombre, precio, cantidad });
        if (r.ok) {
            abrirPanel();
            onComplete?.(true);
        } else {
            console.warn('[carrito] No se agrego:', r.motivo);
            onComplete?.(false);
        }
    });

    document.querySelector('.carrito-lista')?.addEventListener('click', evento => {
        const boton = evento.target.closest('.quitar-item');
        if (!boton) return;
        const indice = Number(boton.dataset.indice);
        if (!Number.isNaN(indice)) quitar(indice);
    });

    document.querySelector('.carrito-icono')?.addEventListener('click', abrirPanel);
    document.querySelector('.carrito-cerrar')?.addEventListener('click', cerrarPanel);
    document.querySelector('.carrito-fondo')?.addEventListener('click', cerrarPanel);

    // Escape cierra el panel. Sin esto, un usuario de teclado lo abria y no
    // tenia forma de cerrarlo: el boton de cerrar quedaba debajo del panel
    // abierto y no habia ni atajo ni trampa de foco.
    document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && panelCarrito()?.classList.contains('abierto')) {
            cerrarPanel();
        }
    });

    // Al pulsar Tab dentro del panel abierto, el foco no debe salirse hacia el
    // contenido de fondo. `inert` ya lo impide en los navegadores que lo
    // soportan; esto cubre el resto conteniéndolo dentro del panel.
    panelCarrito()?.addEventListener('keydown', evento => {
        if (evento.key !== 'Tab') return;
        const focoables = panelCarrito()?.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focoables?.length) return;
        const primero = focoables[0];
        const ultimo = focoables[focoables.length - 1];
        if (evento.shiftKey && document.activeElement === primero) {
            evento.preventDefault();
            ultimo.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
            evento.preventDefault();
            primero.focus();
        }
    });

    document.querySelector('.finalizar-pedido')?.addEventListener('click', () => {
        if (items.length === 0) {
            window.alert('Tu carrito esta vacio. Agrega algun producto primero.');
            return;
        }
        window.location.href = '/checkout';
    });

    window.addEventListener('auth-cambio', () => { cargar(); });

    await cargar();
}
