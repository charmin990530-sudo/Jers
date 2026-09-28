import { api, handleApiError } from '../../js/apiClient.js';
import { iniciarAplicacion } from '../../js/app.js';
import { escapeHTML } from '../../js/sanitize.js';

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

const iconosEstado = {
    pendiente: '⏳',
    confirmado: '✅',
    procesando: '📦',
    enviado: '🚚',
    entregado: '🎉',
    cancelado: '❌',
    reembolsado: '💸'
};

document.addEventListener('DOMContentLoaded', async () => {
    iniciarAplicacion();
    await verificarAdminYCargar();
});

async function verificarAdminYCargar() {
    try {
        const response = await api.getMe();
        if (!response.ok) {
            const status = response.data?.status;
            if (status === 401 || status === 403) {
                window.location.href = '../login.html?redirect=admin/dashboard.html';
            } else {
                handleApiError({ message: response.msg, status }, 'admin-dashboard');
                mostrarError(response.msg || 'No se pudo verificar la sesión');
            }
            return;
        }

        const user = response.data?.user;
        if (!user || user.role !== 'admin') {
            window.location.href = '../index.html';
            return;
        }

        await cargarDashboard();
    } catch (error) {
        handleApiError({ message: error.message }, 'admin-dashboard');
        mostrarError('Error al cargar el dashboard');
    }
}

async function cargarDashboard() {
    try {
        const response = await api.request('/admin/dashboard');
        if (!response.ok) {
            throw new Error(response.msg || 'Error al cargar estadísticas');
        }

        const stats = response.data?.stats;
        if (!stats) {
            throw new Error('La respuesta del dashboard no contiene estadísticas');
        }

        renderStats(stats);
        renderOrdersStatus(stats.ordersByStatus || {});
        renderRecentOrders(Array.isArray(stats.recentOrders) ? stats.recentOrders : []);
    } catch (error) {
        handleApiError({ message: error.message }, 'admin-dashboard');
        mostrarError('Error al cargar el dashboard');
    }
}

function renderStats(stats) {
    const statUsers = document.getElementById('statUsers');
    const statProducts = document.getElementById('statProducts');
    const statOrders = document.getElementById('statOrders');
    const statRevenue = document.getElementById('statRevenue');

    if (statUsers) statUsers.textContent = String(Number(stats.totalUsers) || 0);
    if (statProducts) statProducts.textContent = String(Number(stats.totalProducts) || 0);
    if (statOrders) statOrders.textContent = String(Number(stats.totalOrders) || 0);
    if (statRevenue) statRevenue.textContent = formatearMoneda(stats.totalRevenue);
}

function renderOrdersStatus(ordersByStatus) {
    Object.entries(iconosEstado).forEach(([key, icon]) => {
        const element = document.querySelector(`.status-item[data-status="${key}"]`);
        if (!element) return;

        const count = ordersByStatus?.[key] || 0;
        const label = etiquetasEstado[key];
        element.classList.remove('loading');
        element.innerHTML = `
            <span class="status-icon">${icon}</span>
            <span class="status-name">${label}</span>
            <span class="status-count">${escapeHTML(count)}</span>
        `;
    });
}

function renderRecentOrders(orders) {
    const tbody = document.getElementById('recentOrdersBody');
    if (!tbody) return;

    if (!orders.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">No hay pedidos recientes</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = orders.map(order => {
        const orderId = order?._id ? encodeURIComponent(String(order._id)) : '';
        const customer = obtenerNombreCliente(order?.usuario);
        const estado = normalizarEstado(order?.estado);
        const action = orderId
            ? `<a href="pedidos.html?id=${escapeHTML(orderId)}" class="btn-accion" title="Ver detalle">Ver</a>`
            : '<span class="text-muted">—</span>';

        return `
            <tr>
                <td><strong>${escapeHTML(order?.numeroOrden || 'N/A')}</strong></td>
                <td>${escapeHTML(customer)}</td>
                <td>${escapeHTML(formatearFecha(order?.createdAt))}</td>
                <td><span class="estado-badge estado-${escapeHTML(estado)}">${escapeHTML(formatearEstado(order?.estado))}</span></td>
                <td>${escapeHTML(formatearMoneda(order?.total))}</td>
                <td>${action}</td>
            </tr>
        `;
    }).join('');
}

function obtenerNombreCliente(usuario) {
    if (!usuario) return 'N/A';
    return usuario.nombreCompleto
        || [usuario.nombre, usuario.apellido].filter(Boolean).join(' ')
        || usuario.email
        || 'N/A';
}

function normalizarEstado(estado) {
    return estadosPedido.has(estado) ? estado : '';
}

function formatearEstado(estado) {
    return etiquetasEstado[estado] || 'Desconocido';
}

function formatearMoneda(valor) {
    return `$${(Number(valor) || 0).toLocaleString('es-CO')}`;
}

function formatearFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    const fecha = new Date(fechaStr);
    if (Number.isNaN(fecha.getTime())) return 'N/A';
    return fecha.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
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
