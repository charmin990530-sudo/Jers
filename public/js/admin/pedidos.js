import { api, handleApiError } from '../../js/apiClient.js';
import { protegerRuta } from '../rutas.js';
import { formatearPrecio } from '../config.js';
import { iniciarAplicacion, setBtnLoading } from '../../js/app.js';
import { escapeHTML, safeAssetUrl } from '../../js/sanitize.js';

let paginaActual = 1;
let totalPaginas = 1;

const estadosPedido = new Set([
    'pendiente',
    'confirmado',
    'procesando',
    'enviado',
    'entregado',
    'cancelado',
    'reembolsado'
]);

const etiquetasEstado = {
    pendiente: 'Pendiente',
    confirmado: 'Confirmado',
    procesando: 'Procesando',
    enviado: 'Enviado',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
    reembolsado: 'Reembolsado'
};

const estadosPago = new Set(['pendiente', 'pagado', 'fallido', 'reembolsado']);
const etiquetasPago = {
    pendiente: 'Pendiente',
    pagado: 'Pagado',
    fallido: 'Fallido',
    reembolsado: 'Reembolsado'
};

const etiquetasMetodo = {
    whatsapp: 'WhatsApp',
    transferencia: 'Transferencia',
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta'
};

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
    iniciarAplicacion();
    inicializarControles();
    await verificarAdminYCargar();
});

async function verificarAdminYCargar() {
    // Proteccion centralizada (js/rutas.js). Una sola politica para todo el
    // panel: sin sesion -> login con esta URL de vuelta; con sesion pero sin
    // rol de admin -> inicio. Antes cada script repetia el chequeo con rutas
    // relativas distintas ('../login.html' frente a '/login'), y se colgaba con
    // '../index.html' en una app que ya no tiene esa estructura.
    const { ok } = await protegerRuta({ requiereAdmin: true, pantalla: 'admin-pedidos' });
    if (!ok) return;
    await cargarPedidos();
}

function inicializarControles() {
    $('filtroEstado')?.addEventListener('change', () => {
        paginaActual = 1;
        cargarPedidos();
    });
    $('filtroPago')?.addEventListener('change', () => {
        paginaActual = 1;
        cargarPedidos();
    });
    $('pagAnterior')?.addEventListener('click', () => {
        if (paginaActual > 1) cargarPedidos(paginaActual - 1);
    });
    $('pagSiguiente')?.addEventListener('click', () => {
        if (paginaActual < totalPaginas) cargarPedidos(paginaActual + 1);
    });

    $('modalPedido')?.addEventListener('click', event => {
        if (event.target === $('modalPedido') || event.target.matches('.modal-cerrar')) {
            cerrarDetallePedido();
        }
    });
    $('btnCerrarPedido')?.addEventListener('click', cerrarDetallePedido);
    $('btnCancelarPedido')?.addEventListener('click', cerrarDetallePedido);
    $('formPedido')?.addEventListener('submit', guardarPedido);

    document.addEventListener('keydown', event => {
        const modal = $('modalPedido');
        if (event.key === 'Escape' && modal && !modal.hidden) {
            cerrarDetallePedido();
        }
    });
}

async function cargarPedidos(pagina = 1) {
    const body = $('pedidosBody');
    if (!body) return;

    if (pagina === 1) {
        body.innerHTML = '<tr class="loading-row"><td colspan="7"><div class="spinner"></div> Cargando...</td></tr>';
    }

    const params = {
        page: pagina,
        limit: 10,
        estado: $('filtroEstado')?.value || '',
        estadoPago: $('filtroPago')?.value || ''
    };

    try {
        const response = await api.getAdminOrders(params);
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudieron cargar los pedidos');
        }

        const data = response.data || {};
        const orders = Array.isArray(data.orders) ? data.orders : [];
        const total = Number(data.total) || 0;
        const pages = Math.max(0, Number(data.pages) || 0);
        renderPedidos(orders);
        paginaActual = Math.max(1, Number(data.page) || pagina);
        totalPaginas = Math.max(1, pages);

        const resultCount = $('resultCount');
        const pagination = $('pagination');
        const pagInfo = $('pagInfo');
        if (resultCount) resultCount.textContent = `${total} pedido${total !== 1 ? 's' : ''}`;
        if (pagination) pagination.hidden = pages <= 1;
        if (pagInfo) pagInfo.textContent = `Página ${paginaActual} de ${Math.max(pages, 1)}`;
        if ($('pagAnterior')) $('pagAnterior').disabled = paginaActual <= 1;
        if ($('pagSiguiente')) $('pagSiguiente').disabled = paginaActual >= totalPaginas;
    } catch (error) {
        handleApiError({ message: error.message }, 'cargar-pedidos');
        body.innerHTML = '<tr><td colspan="7" class="empty-state">No se pudieron cargar los pedidos</td></tr>';
    }
}

function renderPedidos(orders) {
    const body = $('pedidosBody');
    if (!body) return;

    if (!orders.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty-state">No hay pedidos</td></tr>';
        return;
    }

    body.innerHTML = orders.map(order => {
        const id = escapeHTML(order?._id || '');
        const estado = normalizarEstado(order?.estado);
        const pago = normalizarPago(order?.estadoPago);
        const accion = id
            ? `<button type="button" class="btn-accion btn-ver-pedido" data-id="${id}" title="Ver detalle">Ver</button>`
            : '<span class="text-muted">—</span>';

        return `
            <tr>
                <td><strong>${escapeHTML(order?.numeroOrden || 'N/A')}</strong></td>
                <td>${escapeHTML(obtenerNombreCliente(order?.usuario))}</td>
                <td>${escapeHTML(formatearFecha(order?.createdAt))}</td>
                <td><span class="estado-badge estado-${escapeHTML(estado)}">${escapeHTML(etiquetasEstado[order?.estado] || 'Desconocido')}</span></td>
                <td><span class="estado-badge estado-${escapeHTML(pago)}">${escapeHTML(etiquetasPago[order?.estadoPago] || 'Desconocido')}</span></td>
                <td>${escapeHTML(formatearMoneda(order?.total))}</td>
                <td>${accion}</td>
            </tr>
        `;
    }).join('');

    body.querySelectorAll('.btn-ver-pedido').forEach(button => {
        button.addEventListener('click', () => abrirDetallePedido(button.dataset.id));
    });
}

async function abrirDetallePedido(pedidoId) {
    if (!pedidoId) return;

    const modal = $('modalPedido');
    const detalle = $('pedidoDetalle');
    const form = $('formPedido');
    const titulo = $('modalPedidoTitulo');
    if (!modal || !detalle || !form || !titulo) return;

    form.hidden = true;
    form.reset();
    $('pedidoId').value = pedidoId;
    detalle.innerHTML = '<div class="loading-row"><div class="spinner"></div> Cargando pedido...</div>';
    titulo.textContent = 'Detalle del pedido';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    try {
        const response = await api.getAdminOrder(encodeURIComponent(pedidoId));
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudo cargar el pedido');
        }

        const order = response.data?.order;
        if (!order) {
            throw new Error('Pedido no encontrado');
        }

        renderDetallePedido(order);
        $('pedidoEstado').value = normalizarEstado(order.estado) || 'pendiente';
        $('pedidoPago').value = normalizarPago(order.estadoPago) || 'pendiente';
        $('pedidoNotas').value = order.notas || '';
        form.hidden = false;
        titulo.textContent = `Pedido ${order.numeroOrden || ''}`;
    } catch (error) {
        handleApiError({ message: error.message }, 'cargar-pedido');
        detalle.innerHTML = '<p class="empty-state">No se pudo cargar el pedido</p>';
    }
}

function renderDetallePedido(order) {
    const detalle = $('pedidoDetalle');
    if (!detalle) return;

    const items = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = items.length
        ? items.map(item => {
            const imagen = safeAssetUrl(item?.imagen || '');
            const imagenHtml = imagen
                ? `<img src="${escapeHTML(imagen)}" alt="${escapeHTML(item?.nombre || 'Producto')}" class="tabla-imagen">`
                : '';
            return `
                <li>
                    ${imagenHtml}
                    <span>${escapeHTML(item?.nombre || 'Producto')}</span>
                    <span>${escapeHTML(item?.cantidad ?? 0)} × ${escapeHTML(formatearMoneda(item?.precioUnitario))}</span>
                    <strong>${escapeHTML(formatearMoneda(item?.subtotal))}</strong>
                </li>
            `;
        }).join('')
        : '<li class="empty-state">Sin productos</li>';

    const direccion = obtenerDireccion(order?.direccionEnvio);
    const metodoPago = etiquetasMetodo[order?.metodoPago] || 'No especificado';
    const estado = etiquetasEstado[order?.estado] || 'Desconocido';
    const pago = etiquetasPago[order?.estadoPago] || 'Desconocido';

    detalle.innerHTML = `
        <div class="form-grid">
            <div>
                <p><strong>Cliente:</strong> ${escapeHTML(obtenerNombreCliente(order?.usuario))}</p>
                <p><strong>Email:</strong> ${escapeHTML(order?.usuario?.email || 'N/A')}</p>
                <p><strong>Teléfono:</strong> ${escapeHTML(order?.usuario?.telefono || 'N/A')}</p>
            </div>
            <div>
                <p><strong>Fecha:</strong> ${escapeHTML(formatearFecha(order?.createdAt))}</p>
                <p><strong>Método de pago:</strong> ${escapeHTML(metodoPago)}</p>
                <p><strong>Estado:</strong> ${escapeHTML(estado)} / ${escapeHTML(pago)}</p>
            </div>
        </div>
        <div class="form-grupo">
            <strong>Dirección de envío</strong>
            <p>${escapeHTML(direccion)}</p>
        </div>
        <div class="form-grupo">
            <strong>Productos</strong>
            <ul>${itemsHtml}</ul>
        </div>
        <div class="form-grupo">
            <p>Subtotal: ${escapeHTML(formatearMoneda(order?.subtotal))}</p>
            <p>Envío: ${escapeHTML(formatearMoneda(order?.costoEnvio))}</p>
            <p>Descuento: ${escapeHTML(formatearMoneda(order?.descuento))}</p>
            <p><strong>Total: ${escapeHTML(formatearMoneda(order?.total))}</strong></p>
        </div>
        ${order?.notas ? `<div class="form-grupo"><strong>Notas del pedido</strong><p>${escapeHTML(order.notas)}</p></div>` : ''}
    `;
}

async function guardarPedido(event) {
    event.preventDefault();
    const form = $('formPedido');
    const button = $('btnGuardarPedido');
    const message = $('pedidoMensaje');
    const id = $('pedidoId')?.value;
    if (!form || !button || !message || !id) return;

    message.textContent = '';
    setBtnLoading(button, true);

    try {
        const response = await api.updateAdminOrder(encodeURIComponent(id), {
            estado: $('pedidoEstado').value,
            estadoPago: $('pedidoPago').value,
            notas: $('pedidoNotas').value.trim()
        });
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudo actualizar el pedido');
        }

        mostrarToast('Pedido actualizado');
        cerrarDetallePedido();
        await cargarPedidos(paginaActual);
    } catch (error) {
        message.textContent = error.message || 'No se pudo actualizar el pedido';
    } finally {
        setBtnLoading(button, false);
    }
}

function cerrarDetallePedido() {
    const modal = $('modalPedido');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';

    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function obtenerNombreCliente(usuario) {
    if (!usuario) return 'N/A';
    return usuario.nombreCompleto
        || [usuario.nombre, usuario.apellido].filter(Boolean).join(' ')
        || usuario.email
        || 'N/A';
}

function obtenerDireccion(direccion) {
    if (!direccion) return 'N/A';
    return [
        direccion.direccion,
        direccion.ciudad,
        direccion.departamento,
        direccion.codigoPostal
    ].filter(Boolean).join(', ') || direccion.nombreCompleto || 'N/A';
}

function normalizarEstado(estado) {
    return estadosPedido.has(estado) ? estado : '';
}

function normalizarPago(estadoPago) {
    return estadosPago.has(estadoPago) ? estadoPago : '';
}

function formatearMoneda(valor) {
    return formatearPrecio(valor);
}

function formatearFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    const fecha = new Date(fechaStr);
    if (Number.isNaN(fecha.getTime())) return 'N/A';
    return formatearFecha(fecha, 'hora');
}

function mostrarToast(mensaje) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = mensaje;
    toast.style.cssText = `
        position: fixed; bottom: calc(100px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%);
            box-sizing: border-box; max-width: calc(100vw - 32px); text-align: center;
        background: var(--color-mauve); color: white; padding: 14px 24px;
        border-radius: 25px; font: 600 0.9rem var(--fuente-texto);
        box-shadow: 0 6px 20px rgb(0 0 0 / 20%); z-index: 1000;
        animation: slideUp 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function mostrarError(mensaje) {
    const container = document.querySelector('.container');
    if (!container || container.querySelector('.admin-error-global')) return;
    container.insertAdjacentHTML('afterbegin', `
        <div class="admin-error-global">
            <p>${escapeHTML(mensaje)}</p>
            <a href="../login.html" class="btn-primario">Iniciar sesión</a>
        </div>
    `);
}
