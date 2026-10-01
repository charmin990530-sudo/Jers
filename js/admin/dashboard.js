import { api, handleApiError } from '../../js/api.js';
import { protegerRuta } from '../rutas.js';
import { formatearPrecio, formatearFecha } from '../config.js';
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
    // Proteccion centralizada (js/rutas.js). Una sola politica para todo el
    // panel: sin sesion -> login con esta URL de vuelta; con sesion pero sin
    // rol de admin -> inicio. Antes cada script repetia el chequeo con rutas
    // relativas distintas ('../login.html' frente a '/login'), y se colgaba con
    // '../index.html' en una app que ya no tiene esa estructura.
    const { ok } = await protegerRuta({ requiereAdmin: true, pantalla: 'admin-dashboard' });
    if (!ok) return;
    await cargarDashboard();
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

/**
 * Marca el panel como cargando ANTES de pedir los datos.
 *
 * El dashboard se queda en blanco si la peticion falla o tarda, y el usuario no
 * puede distinguir "aun cargando" de "no hay datos". Con este estado y el botón
 * de reintentar de abajo, siempre queda claro en qué situación está.
 */
function marcarCargando() {
    document.querySelectorAll('.status-item').forEach(item => item.classList.add('loading'));
    const tbody = document.getElementById('recentOrdersBody');
    if (tbody && !tbody.children.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-vacio">Cargando pedidos recientes...</td></tr>';
    }
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
    return formatearPrecio(valor);
}

// `formatearFecha` viene de `js/config.js` (importada arriba). Antes había una
// función local idéntica que se llamaba a SÍ MISMA en su última línea, de modo
// que entraba en recursión infinita: como `fecha` ya era un `Date` (truthy) y
// `new Date(fecha)` es válido, nunca se salía por la guarda. El `RangeError` lo
// capturaba el `catch` de `cargarDashboard` y el panel se quedaba siempre en
// "Error al cargar el dashboard", aun con la API funcionando. El call site
// línea 142 no pasa estilo, así que conserva el default 'corta' de config.js.

function mostrarError(mensaje) {
    const container = document.querySelector('.container');
    if (!container) return;

    // Si es un fallo de sesion, tiene sentido ofrecer iniciar sesion. Si no, lo
    // util es reintentar: casi siempre es un corte de red momentaneo.
    const esSesion = /sesión|sesion|autorizado|401|403/i.test(mensaje || '');
    container.querySelector('.admin-error-global')?.remove();
    container.insertAdjacentHTML('afterbegin', `
        <div class="admin-error-global" role="alert">
            <p>${escapeHTML(mensaje)}</p>
            ${esSesion
                ? '<a href="../login.html" class="btn-primario">Iniciar sesión</a>'
                : '<button type="button" class="btn-primario" data-reintentar-panel>Reintentar</button>'}
        </div>
    `);

    container.querySelector('[data-reintentar-panel]')?.addEventListener('click', () => {
        container.querySelector('.admin-error-global')?.remove();
        verificarAdminYCargar();
    });
}
