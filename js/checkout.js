/**
 * checkout.js - Finalizar pedido
 *
 * FLUJO, CON Y SIN SESIÓN
 * -----------------------
 * 1. Si no hay sesión se redirige a `login.html?redirect=/checkout`. El carrito de
 *    invitado vive en localStorage, así que sobrevive a la redirección.
 * 2. Al iniciar sesión, `js/carrito.js` fusiona el carrito de invitado con el del
 *    servidor (quedándose con la cantidad mayor de cada producto) y limpia el
 *    localStorage. Este archivo ya no tiene que hacerlo.
 * 3. Con sesión, el carrito se pide a la API y se muestra el resumen.
 * 4. Al enviar, se crea el pedido con cabecera `Idempotency-Key` para que un
 *    doble clic no genere dos pedidos.
 *
 * Lo que NO hace ya: leer y escribir `localStorage['jers_carrito']` a mano ni
 * reimplementar la fusión. Eso vivía duplicado y era la causa del
 * envenenamiento del carrito.
 */

import { api } from './apiClient.js';
import { safeExternalUrl } from './sanitize.js';
import { sincronizar } from './carrito.js';
import { formatearPrecio } from './config.js';
import { protegerRuta } from './rutas.js';

const form = document.getElementById('checkout-form');
const itemsElement = document.getElementById('checkout-items');
const totalElement = document.getElementById('checkout-total');
const messageElement = document.getElementById('checkout-message');
const addressSelect = document.getElementById('saved-address');
const submitButton = document.getElementById('checkout-submit');
const whatsappLink = document.getElementById('whatsapp-link');

const createIdempotencyKey = () =>
    globalThis.crypto?.randomUUID?.() || `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// La clave identifica UN intento de compra. Si se reutilizara, el backend
// respondería "El pedido ya había sido creado" con el pedido anterior, esta
// pantalla lo tomaría como éxito, vaciaría el carrito y mostraría el número
// viejo, y la segunda compra del cliente nunca existiría.
let idempotencyKey = createIdempotencyKey();
const renovarIdempotencyKey = () => { idempotencyKey = createIdempotencyKey(); };

const setMessage = (text, type = 'error') => {
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.className = `formulario-mensaje ${type}`;
};

const renderCart = cart => {
    if (!itemsElement) return;
    itemsElement.replaceChildren();
    let total = 0;
    for (const item of cart || []) {
        const precio = item.precioUnitario ?? item.precio ?? 0;
        const cantidad = item.cantidad ?? 1;
        const subtotal = precio * cantidad;
        total += subtotal;

        const li = document.createElement('li');
        const nombre = document.createElement('span');
        nombre.textContent = `${item.nombreSnapshot ?? item.nombre ?? 'Producto'} x${cantidad}`;
        const valor = document.createElement('strong');
        // formatearPrecio evita "$NaN"/"$undefined" si la API devolviera un
        // importe inesperado.
        valor.textContent = formatearPrecio(subtotal);
        li.append(nombre, valor);
        itemsElement.append(li);
    }
    if (totalElement) totalElement.textContent = formatearPrecio(total);
};

const fillAddress = address => {
    if (!address || !form) return;
    form.elements.alias.value = address.alias || 'Casa';
    form.elements.nombreCompleto.value = address.nombreCompleto || '';
    form.elements.telefono.value = address.telefono || '';
    form.elements.direccion.value = address.direccion || '';
    form.elements.ciudad.value = address.ciudad || '';
    form.elements.departamento.value = address.departamento || '';
    form.elements.codigoPostal.value = address.codigoPostal || '';
};

const loadAddresses = addresses => {
    if (!addressSelect) return;
    addressSelect.replaceChildren();
    const nueva = document.createElement('option');
    nueva.value = '';
    nueva.textContent = 'Nueva dirección';
    addressSelect.append(nueva);
    for (const address of addresses || []) {
        const item = document.createElement('option');
        item.value = address._id;
        item.textContent = `${address.alias}: ${address.direccion}`;
        addressSelect.append(item);
    }
    if (addresses?.[0]) {
        addressSelect.value = addresses[0]._id;
        fillAddress(addresses[0]);
    }
};

const main = async () => {
    if (!form || !submitButton) return;

    // El guard central decide si esta pantalla exige sesión y a dónde va el
    // invitado. Además devuelve el usuario, así no hace falta un segundo getMe.
    const { ok, user } = await protegerRuta();
    if (!ok) return;

    // Por si el carrito de invitado quedó sin fusionar (por ejemplo, el usuario
    // se identificó en otra pestaña). Es idempotente: si localStorage ya está
    // vacío solo vuelve a leer el carrito del servidor.
    await sincronizar();

    const response = await api.getCart();
    if (!response.ok) {
        setMessage(response.msg || 'No se pudo cargar el carrito.');
        return;
    }

    const cart = response.data?.cart?.items || [];
    if (cart.length === 0) {
        setMessage('Tu carrito está vacío. Agrega productos antes de finalizar.');
        submitButton.disabled = true;
        return;
    }

    renderCart(cart);
    loadAddresses(user?.direcciones || []);
};

addressSelect?.addEventListener('change', async () => {
    if (!addressSelect.value) return;
    const me = await api.getMe();
    if (!me.ok) return;
    const address = me.data?.user?.direcciones?.find(item => item._id === addressSelect.value);
    fillAddress(address);
});

form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    // Protección contra doble envío: el botón se deshabilita hasta que la
    // petición termine. La cabecera Idempotency-Key es la segunda barrera, por
    // si el usuario recarga o hay dos pestañas.
    submitButton.disabled = true;
    setMessage('Creando pedido...', 'exito');

    try {
        const data = {
            direccionEnvio: {
                alias: form.elements.alias.value.trim(),
                nombreCompleto: form.elements.nombreCompleto.value.trim(),
                telefono: form.elements.telefono.value.trim(),
                direccion: form.elements.direccion.value.trim(),
                ciudad: form.elements.ciudad.value.trim(),
                departamento: form.elements.departamento.value.trim(),
                ...(form.elements.codigoPostal.value.trim()
                    ? { codigoPostal: form.elements.codigoPostal.value.trim() }
                    : {}),
            },
            ...(form.elements.notas.value.trim() ? { notas: form.elements.notas.value.trim() } : {}),
        };

        const response = await api.createOrder(data, { idempotencyKey });
        if (!response.ok) throw new Error(response.msg || 'No se pudo crear el pedido');

        // El intento ya se consumió: la siguiente compra necesita su propia clave.
        renovarIdempotencyKey();

        const order = response.data.order;
        form.reset();
        renderCart([]);
        setMessage(`Pedido ${order.numeroOrden} creado correctamente.`, 'exito');

        const whatsappUrl = safeExternalUrl(order.whatsappUrl);
        if (whatsappUrl && whatsappLink) {
            whatsappLink.href = whatsappUrl;
            whatsappLink.hidden = false;
        }
    } catch (error) {
        setMessage(error.message || 'No se pudo crear el pedido.');
    } finally {
        submitButton.disabled = false;
    }
});

main().catch(error => {
    setMessage(error?.message || 'No se pudo conectar con el servidor.');
});
