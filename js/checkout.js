import { api } from './apiClient.js';
import { sincronizarCarritoTrasAuth } from './auth.js';
import { safeExternalUrl } from './sanitize.js';

const form = document.getElementById('checkout-form');
const itemsElement = document.getElementById('checkout-items');
const totalElement = document.getElementById('checkout-total');
const messageElement = document.getElementById('checkout-message');
const addressSelect = document.getElementById('saved-address');
const submitButton = document.getElementById('checkout-submit');
const whatsappLink = document.getElementById('whatsapp-link');
const createIdempotencyKey = () => globalThis.crypto?.randomUUID?.() || `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let idempotencyKey = createIdempotencyKey();

const money = value => `$${Number(value || 0).toLocaleString('es-CO')}`;
const setMessage = (text, type = 'error') => {
    messageElement.textContent = text;
    messageElement.className = `formulario-mensaje ${type}`;
};

const fillAddress = address => {
    if (!address) return;
    form.elements.alias.value = address.alias || 'Casa';
    form.elements.nombreCompleto.value = address.nombreCompleto || '';
    form.elements.telefono.value = address.telefono || '';
    form.elements.direccion.value = address.direccion || '';
    form.elements.ciudad.value = address.ciudad || '';
    form.elements.departamento.value = address.departamento || '';
    form.elements.codigoPostal.value = address.codigoPostal || '';
};

const renderCart = cart => {
    itemsElement.replaceChildren();
    let total = 0;
    for (const item of cart || []) {
        const price = item.precioUnitario ?? item.precio ?? 0;
        const quantity = item.cantidad ?? 1;
        total += price * quantity;
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = `${item.nombreSnapshot ?? item.nombre ?? 'Producto'} x${quantity}`;
        const value = document.createElement('strong');
        value.textContent = money(price * quantity);
        li.append(name, value);
        itemsElement.append(li);
    }
    totalElement.textContent = money(total);
};

const loadAddresses = addresses => {
    addressSelect.replaceChildren();
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Nueva dirección';
    addressSelect.append(option);
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
    const apiClient = api;
    const me = await apiClient.getMe();
    if (!me.ok) {
        window.location.replace('login.html?redirect=checkout.html');
        return;
    }

    await sincronizarCarritoTrasAuth();
    const response = await api.getCart();
    if (!response.ok) {
        setMessage(response.msg || 'No se pudo cargar el carrito.');
        return;
    }
    const cart = response.data?.cart?.items || [];
    if (!cart.length) {
        setMessage('Tu carrito está vacío.');
        submitButton.disabled = true;
        return;
    }
    renderCart(cart);
    loadAddresses(me.data?.user?.direcciones || []);
};

addressSelect.addEventListener('change', async () => {
    if (!addressSelect.value) return;
    const apiClient = api;
    const response = await apiClient.getMe();
    const address = response.data?.user?.direcciones?.find(item => item._id === addressSelect.value);
    fillAddress(address);
});

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submitButton.disabled = true;
    setMessage('Creando pedido...', 'exito');
    try {
        const apiClient = api;
        const data = {
            direccionEnvio: {
                alias: form.elements.alias.value.trim(),
                nombreCompleto: form.elements.nombreCompleto.value.trim(),
                telefono: form.elements.telefono.value.trim(),
                direccion: form.elements.direccion.value.trim(),
                ciudad: form.elements.ciudad.value.trim(),
                departamento: form.elements.departamento.value.trim(),
                ...(form.elements.codigoPostal.value.trim() ? { codigoPostal: form.elements.codigoPostal.value.trim() } : {}),
            },
            ...(form.elements.notas.value.trim() ? { notas: form.elements.notas.value.trim() } : {}),
        };
        const response = await apiClient.createOrder(data, { headers: { 'Idempotency-Key': idempotencyKey } });
        if (!response.ok) throw new Error(response.msg || 'No se pudo crear el pedido');
        const order = response.data.order;
        localStorage.removeItem('jers_carrito');
        form.reset();
        renderCart([]);
        setMessage(`Pedido ${order.numeroOrden} creado correctamente.`, 'exito');
        const whatsappUrl = safeExternalUrl(order.whatsappUrl);
        if (whatsappUrl) {
            whatsappLink.href = whatsappUrl;
            whatsappLink.hidden = false;
        }
    } catch (error) {
        setMessage(error.message || 'No se pudo crear el pedido.');
    } finally {
        submitButton.disabled = false;
    }
});

main().catch(() => setMessage('No se pudo conectar con el servidor.'));
