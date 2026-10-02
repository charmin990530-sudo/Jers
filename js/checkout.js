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

import { api } from './api.js';
import { safeExternalUrl } from './sanitize.js';
import { sincronizar } from './carrito.js';
import { formatearPrecio } from './config.js';
import { protegerRuta } from './rutas.js';

const form = document.getElementById('checkout-form');
const itemsElement = document.getElementById('checkout-items');
const subtotalElement = document.getElementById('checkout-subtotal');
const envioElement = document.getElementById('checkout-envio');
const envioNotaElement = document.getElementById('checkout-envio-nota');
const ivaElement = document.getElementById('checkout-impuestos');
const ivaNotaElement = document.getElementById('checkout-iva-nota');
const ivaFilaElement = document.getElementById('checkout-impuestos-fila');
const totalElement = document.getElementById('checkout-total');
const avisoElement = document.getElementById('checkout-aviso');
const messageElement = document.getElementById('checkout-message');
const addressSelect = document.getElementById('saved-address');
const submitButton = document.getElementById('checkout-submit');
const whatsappLink = document.getElementById('whatsapp-link');

// Direcciones del usuario ya cargadas, para no volver a pedir el perfil cada vez
// que se cambia la direccion seleccionada.
let direccionesUsuario = [];

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

/**
 * Pinta el resumen del pedido.
 *
 * Los importes NO se calculan aquí. Vienen de la API (`subtotal`, `costoEnvio`,
 * `total`), que los calcula con la misma regla que usa `POST /api/orders`. Antes
 * esta función sumaba `precio * cantidad` y lo escribía en el hueco de "Total":
 * el cliente veía el subtotal y el servidor cobraba subtotal + envío, así que
 * los $15.000 de envío aparecían por sorpresa al confirmar.
 *
 * Si la API no troujera el desglose (por ejemplo, una versión antigua), se
 * calcula aquí el subtotal y se marca el envío como pendiente de confirmar, en
 * vez de mentir con un total incompleto.
 */
const renderCart = (items, desglose = null) => {
    if (!itemsElement) return;
    itemsElement.replaceChildren();
    for (const item of items || []) {
        const precio = item.precioUnitario ?? item.precio ?? 0;
        const cantidad = item.cantidad ?? 1;
        const subtotal = precio * cantidad;

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

    const subtotalApi = Number.isInteger(desglose?.subtotal) ? desglose.subtotal : null;
    const envioApi = Number.isInteger(desglose?.costoEnvio) ? desglose.costoEnvio : null;
    const totalApi = Number.isInteger(desglose?.total) ? desglose.total : null;

    const subtotal = subtotalApi
        ?? (items || []).reduce(
            (sum, item) => sum + (item.precioUnitario ?? item.precio ?? 0) * (item.cantidad ?? 1),
            0,
        );

    if (subtotalElement) subtotalElement.textContent = formatearPrecio(subtotal);

    if (envioApi !== null) {
        if (envioElement) envioElement.textContent = formatearPrecio(envioApi);
        const umbral = Number.isInteger(desglose?.envioGratisDesde) ? desglose.envioGratisDesde : null;
        if (envioNotaElement) {
            envioNotaElement.textContent = envioApi === 0 && umbral
                ? `(gratis desde ${formatearPrecio(umbral)})`
                : '';
        }
    } else if (envioElement) {
        envioElement.textContent = 'Se calcula al confirmar';
    }

    // IVA. Los precios del catálogo son sin impuestos: el IVA se suma en el
    // servidor, no aquí. Si la API no lo trae, la fila se esconde en vez de
    // pintar un "$0" que haría creer que el pedido no lleva impuestos.
    const ivaApi = Number.isInteger(desglose?.impuestos) ? desglose.impuestos : null;
    if (ivaFilaElement) ivaFilaElement.hidden = ivaApi === null || ivaApi === 0;
    if (ivaApi !== null && ivaElement) {
        ivaElement.textContent = formatearPrecio(ivaApi);
        const bp = Number.isInteger(desglose?.tasaImpuestosBp) ? desglose.tasaImpuestosBp : null;
        if (ivaNotaElement) {
            ivaNotaElement.textContent = bp === null ? '' : `(${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%)`;
        }
    }

    if (totalElement) {
        totalElement.textContent = formatearPrecio(totalApi ?? subtotal);
    }
    return { subtotal, envioApi, totalApi };
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

    renderCart(cart, response.data?.cart);
    direccionesUsuario = user?.direcciones || [];
    loadAddresses(direccionesUsuario);
};

addressSelect?.addEventListener('change', () => {
    if (!addressSelect.value) return;
    // No se vuelve a pedir el perfil: las direcciones ya vienen en el usuario que
    // devolvio `protegerRuta()` y se guardaron en `direccionesUsuario` al cargar.
    // Antes esta llamada a api.getMe() salia en cada cambio de selector.
    const address = direccionesUsuario.find(item => item._id === addressSelect.value);
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
        renderCart([], { subtotal: 0, costoEnvio: 0, impuestos: 0, total: 0 });
        setMessage(`Pedido ${order.numeroOrden} creado correctamente.`, 'exito');

        const whatsappUrl = safeExternalUrl(order.whatsappUrl);
        if (whatsappUrl && whatsappLink) {
            whatsappLink.href = whatsappUrl;
            whatsappLink.hidden = false;
        }

        // El pedido queda `pendiente`: el stock ya se descontó, pero el pago se
        // confirma hablando con la tienda. El mensaje verde de arriba decía
        // "creado correctamente" sin mencionar que faltaba ese paso, y quien
        // cerraba la pestaña dejaba la compra a medias sin saberlo.
        if (avisoElement) {
            avisoElement.textContent = whatsappUrl
                ? 'Tu pedido quedó registrado y el stock está reservado. Falta confirmar el pago: te abrimos el chat de WhatsApp en una pestaña nueva. Si no se abrió, usa el enlace de abajo.'
                : 'Tu pedido quedó registrado y el stock está reservado. Contacta a la tienda para confirmar el pago. Tu pedido aparece en "Mis pedidos".';
            avisoElement.hidden = false;
        }

        // WhatsApp en pestaña nueva, no en la misma: el usuario sigue viendo su
        // número de pedido y el aviso. El temporizador deja terminar el render
        // antes de que el bloqueador de ventanas emergentes pueda suspenderse; si aun
        // así lo bloquea, el enlace manual sigue ahí.
        if (whatsappUrl) {
            window.setTimeout(() => {
                window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
            }, 600);
        }

        // El pedido ya está hecho y el carrito vacío: el botón NO vuelve a
        // habilitarse. Antes el `finally` lo rehabilitaba siempre, así que un
        // segundo clic mandaba una clave nueva (ya renovada) y el backend
        // respondía EMPTY_CART, y ese error BORRABA el mensaje de éxito con el
        // número de pedido: el cliente veía "El carrito está vacío" después de
        // haber cerrado la compra.
        return;
    } catch (error) {
        setMessage(error.message || 'No se pudo crear el pedido.');
        // Solo si falló se permite reintentar: es un estado recuperable.
        submitButton.disabled = false;
    }
});

main().catch(error => {
    setMessage(error?.message || 'No se pudo conectar con el servidor.');
});
