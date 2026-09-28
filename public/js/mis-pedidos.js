/**
 * mis-pedidos.js - Página de Historial de Pedidos
 * 
 * FLUJO:
 * 1. Verifica autenticación (GET /api/auth/me)
 * 2. GET /api/orders con paginación y filtro por estado
 * 3. Renderiza lista con tarjetas de pedidos
 * 4. Click en "Ver detalle" abre modal con info completa
 * 5. Botón "Cancelar" para pedidos en estado pendiente/confirmado
 */

import { getMe, getOrders, getOrder, cancelOrder, handleApiError } from './apiClient.js';
import { formatearPrecio } from './config.js';
import { iniciarAplicacion } from './app.js';
import { escapeHTML, safeAssetUrl } from './sanitize.js';

// Estado
let paginaActual = 1;
let estadoFiltro = '';
let totalPaginas = 1;
let pedidosCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    iniciarAplicacion();
    await verificarAuthYCargar();
    inicializarFiltros();
    inicializarPaginacion();
    inicializarModal();
});

/**
 * Verifica autenticación y carga pedidos
 */
async function verificarAuthYCargar() {
    const response = await getMe();
    if (!response.ok) {
        if (response.data?.status === 401 || response.msg?.includes('expirada') || response.msg?.includes('No autenticado')) {
            mostrarSinSesion();
        } else {
            handleApiError({ message: response.msg, status: response.data?.status }, 'mis-pedidos');
            mostrarError('No se pudieron cargar los pedidos');
        }
        return;
    }
    await cargarPedidos();
}

/**
 * Muestra mensaje para usuarios sin sesión
 */
function mostrarSinSesion() {
    const contenedor = document.getElementById('pedidosContenido');
    contenedor.innerHTML = `
        <div class="pedidos-vacio">
            <div class="vacio-icon">📦</div>
            <h3>Inicia sesión para ver tus pedidos</h3>
            <p>Tu historial de compras aparecerá aquí después de iniciar sesión.</p>
            <a href="login.html" class="btn-primario">Iniciar sesión</a>
        </div>
    `;
    document.getElementById('paginacion').hidden = true;
}

/**
 * Carga pedidos desde API
 * @param {number} page - Página a cargar
 */
async function cargarPedidos(page = 1) {
    const contenedor = document.getElementById('pedidosContenido');
    
    if (page === 1) {
        contenedor.innerHTML = `
            <div class="pedidos-loading" aria-live="polite">
                <div class="spinner"></div>
                <p>Cargando pedidos...</p>
            </div>
        `;
    }

    const response = await getOrders({ page, limit: 10, ...(estadoFiltro && { estado: estadoFiltro }) });
    
    if (!response.ok) {
        handleApiError({ message: response.msg, status: response.data?.status }, 'mis-pedidos');
        if (page === 1) {
            mostrarError('Error al cargar pedidos');
        }
        return;
    }

    const pedidos = Array.isArray(response.data?.orders) ? response.data.orders : [];
    paginaActual = Number(response.data?.page) || page;
    totalPaginas = Number(response.data?.pages) || 1;

    pedidosCache = pedidos;
    renderizarPedidos(pedidos);
    actualizarPaginacion(paginaActual, totalPaginas, Number(response.data?.total) || pedidos.length);
}

/**
 * Renderiza lista de pedidos
 * @param {Array} pedidos
 */
function renderizarPedidos(pedidos) {
    const contenedor = document.getElementById('pedidosContenido');
    const listaPedidos = Array.isArray(pedidos) ? pedidos : [];

    if (!listaPedidos.length) {
        const mensaje = estadoFiltro
            ? `No hay pedidos en estado "${formatearEstado(estadoFiltro)}"`
            : 'No tienes pedidos aún';
        contenedor.innerHTML = `
            <div class="pedidos-vacio">
                <div class="vacio-icon">📦</div>
                <h3>${escapeHTML(mensaje)}</h3>
                <p>${estadoFiltro ? 'Prueba con otro filtro' : 'Cuando hagas tu primera compra, aparecerá aquí.'}</p>
                ${!estadoFiltro ? '<a href="maquillaje.html" class="btn-primario">Ir a comprar</a>' : ''}
            </div>
        `;
        return;
    }

    contenedor.innerHTML = listaPedidos.map(pedido => {
        const id = escapeHTML(pedido?._id || '');
        const numeroOrden = escapeHTML(pedido?.numeroOrden || 'N/A');
        const estado = escapeHTML(pedido?.estado || '');
        const items = Array.isArray(pedido?.items) ? pedido.items : [];

        return `
        <article class="pedido-card" data-id="${id}">
            <div class="pedido-header">
                <div class="pedido-numero">
                    <span class="pedido-orden">Orden <strong>${numeroOrden}</strong></span>
                    <span class="pedido-fecha">${escapeHTML(formatearFecha(pedido?.createdAt))}</span>
                </div>
                <span class="pedido-estado estado-${estado}">${escapeHTML(formatearEstado(pedido?.estado))}</span>
            </div>

            <div class="pedido-resumen">
                <div class="pedido-items-preview">
                    ${items.slice(0, 3).map(item => {
                        const imagen = escapeHTML(safeAssetUrl(item?.imagen) || 'img/placeholder.svg');
                        return `
                            <div class="item-preview">
                                <img src="${imagen}" alt="${escapeHTML(item?.nombre || 'Producto')}" loading="lazy">
                                <span>${escapeHTML(item?.nombre || 'Producto')} ×${escapeHTML(item?.cantidad ?? 0)}</span>
                            </div>
                        `;
                    }).join('')}
                    ${items.length > 3 ? `<span class="item-mas">+${escapeHTML(items.length - 3)} más</span>` : ''}
                </div>
                <div class="pedido-total">
                    <span class="total-label">Total</span>
                    <span class="total-valor">$${escapeHTML(formatearMonto(pedido?.total))}</span>
                </div>
            </div>

            <div class="pedido-acciones">
                <button class="btn-ver-detalle" type="button" data-id="${id}">
                    Ver detalle
                </button>
                ${pedido?.puedeCancelar ? `
                    <button class="btn-cancelar" type="button" data-id="${id}" data-orden="${escapeHTML(pedido?.numeroOrden || '')}">
                        Cancelar pedido
                    </button>
                ` : ''}
            </div>
        </article>
    `;
    }).join('');

    // Event listeners
    contenedor.querySelectorAll('.btn-ver-detalle').forEach(btn => {
        btn.addEventListener('click', () => abrirModalDetalle(btn.dataset.id));
    });

    contenedor.querySelectorAll('.btn-cancelar').forEach(btn => {
        btn.addEventListener('click', () => confirmarCancelacion(btn.dataset.id, btn.dataset.orden));
    });
}

/**
 * Inicializa botones de filtro por estado
 */
function inicializarFiltros() {
    const botones = document.querySelectorAll('.filtro-btn');
    
    botones.forEach(btn => {
        btn.addEventListener('click', () => {
            botones.forEach(b => b.classList.remove('activo'));
            btn.classList.add('activo');
            estadoFiltro = btn.dataset.estado || '';
            paginaActual = 1;
            cargarPedidos(1);
        });
    });
}

/**
 * Inicializa controles de paginación
 */
function inicializarPaginacion() {
    document.getElementById('pagAnterior')?.addEventListener('click', () => {
        if (paginaActual > 1) cargarPedidos(paginaActual - 1);
    });

    document.getElementById('pagSiguiente')?.addEventListener('click', () => {
        if (paginaActual < totalPaginas) cargarPedidos(paginaActual + 1);
    });
}

/**
 * Actualiza UI de paginación
 */
function actualizarPaginacion(page, pages, total) {
    const paginacion = document.getElementById('paginacion');
    const info = document.getElementById('pagInfo');
    const btnAnt = document.getElementById('pagAnterior');
    const btnSig = document.getElementById('pagSiguiente');

    if (pages <= 1) {
        paginacion.hidden = true;
        return;
    }

    paginacion.hidden = false;
    info.textContent = `Página ${page} de ${pages} (${total} pedidos)`;
    btnAnt.disabled = page <= 1;
    btnSig.disabled = page >= pages;
}

/**
 * Abre modal con detalle del pedido
 * @param {string} pedidoId
 */
async function abrirModalDetalle(pedidoId) {
    const modal = document.getElementById('modalDetallePedido');
    const cuerpo = document.getElementById('modalCuerpo');
    const titulo = document.getElementById('modalTitulo');

    // Loading en modal
    cuerpo.innerHTML = `
        <div class="pedidos-loading">
            <div class="spinner"></div>
            <p>Cargando detalle...</p>
        </div>
    `;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    const response = await getOrder(pedidoId);
    if (!response.ok) {
        handleApiError({ message: response.msg, status: response.data?.status }, 'detalle-pedido');
        cuerpo.innerHTML = `
            <div class="pedido-error">
                <p>No se pudo cargar el detalle del pedido.</p>
            </div>
        `;
        return;
    }

    const pedido = response.data?.order;
    if (!pedido) {
        cuerpo.innerHTML = `
            <div class="pedido-error">
                <p>No se encontró el pedido.</p>
            </div>
        `;
        return;
    }

    titulo.textContent = `Pedido ${pedido.numeroOrden ?? ''}`;
    renderizarModalDetalle(pedido, cuerpo);
}

/**
 * Renderiza contenido del modal de detalle
 * @param {Object} pedido
 * @param {HTMLElement} contenedor
 */
function renderizarModalDetalle(pedido, contenedor) {
    const puedeCancelar = ['pendiente', 'confirmado'].includes(pedido?.estado);
    const items = Array.isArray(pedido?.items) ? pedido.items : [];
    const direccion = pedido?.direccionEnvio || {};
    const id = escapeHTML(pedido?._id || '');
    const numeroOrden = escapeHTML(pedido?.numeroOrden || 'N/A');
    const orden = escapeHTML(pedido?.numeroOrden || '');
    const estado = escapeHTML(pedido?.estado || '');

    contenedor.innerHTML = `
        <div class="detalle-pedido">
            <!-- Header del pedido -->
            <div class="detalle-header">
                <div>
                    <h3>Orden ${numeroOrden}</h3>
                    <p class="detalle-meta">
                        <span class="estado-badge estado-${estado}">${escapeHTML(formatearEstado(pedido?.estado))}</span>
                        <span class="fecha">${escapeHTML(formatearFechaCompleta(pedido?.createdAt))}</span>
                    </p>
                </div>
                <div class="detalle-total">
                    $${escapeHTML(formatearMonto(pedido?.total))}
                </div>
            </div>

            <!-- Items -->
            <div class="detalle-items">
                <h4>Productos</h4>
                ${items.map(item => {
                    const imagen = escapeHTML(safeAssetUrl(item?.imagen) || 'img/placeholder.svg');
                    return `
                        <div class="detalle-item">
                            <img src="${imagen}" alt="${escapeHTML(item?.nombre || 'Producto')}" loading="lazy">
                            <div class="item-info">
                                <strong>${escapeHTML(item?.nombre || 'Producto')}</strong>
                                <span class="item-cantidad">×${escapeHTML(item?.cantidad ?? 0)}</span>
                            </div>
                            <span class="item-subtotal">$${escapeHTML(formatearMonto(item?.subtotal))}</span>
                        </div>
                    `;
                }).join('')}
            </div>

            <!-- Resumen precios -->
            <div class="detalle-resumen">
                <div class="resumen-fila">
                    <span>Subtotal</span>
                    <span>$${escapeHTML(formatearMonto(pedido?.subtotal))}</span>
                </div>
                <div class="resumen-fila">
                    <span>Envío</span>
                    <span>${Number(pedido?.costoEnvio) === 0 ? 'Gratis' : `$${escapeHTML(formatearMonto(pedido?.costoEnvio))}`}</span>
                </div>
                ${Number(pedido?.descuento) > 0 ? `
                    <div class="resumen-fila descuento">
                        <span>Descuento</span>
                        <span>-$${escapeHTML(formatearMonto(pedido?.descuento))}</span>
                    </div>
                ` : ''}
                <div class="resumen-fila total">
                    <span>Total</span>
                    <span>$${escapeHTML(formatearMonto(pedido?.total))}</span>
                </div>
            </div>

            <!-- Dirección de envío -->
            <div class="detalle-direccion">
                <h4>Dirección de envío</h4>
                <address>
                    <strong>${escapeHTML(direccion.nombreCompleto || 'N/A')}</strong><br>
                    ${escapeHTML(direccion.direccion || 'N/A')}<br>
                    ${escapeHTML(direccion.ciudad || 'N/A')}, ${escapeHTML(direccion.departamento || 'N/A')}
                    ${direccion.codigoPostal ? ` ${escapeHTML(direccion.codigoPostal)}` : ''}<br>
                    Tel: ${escapeHTML(direccion.telefono || 'N/A')}
                </address>
            </div>

            ${pedido?.notas ? `
                <div class="detalle-notas">
                    <h4>Notas</h4>
                    <p>${escapeHTML(pedido.notas)}</p>
                </div>
            ` : ''}

            <!-- Timeline de estados -->
            <div class="detalle-timeline">
                <h4>Seguimiento</h4>
                <div class="timeline">
                    ${renderizarTimeline(pedido)}
                </div>
            </div>

            ${puedeCancelar ? `
                <div class="detalle-acciones">
                    <button class="btn-cancelar-modal" type="button" data-id="${id}" data-orden="${orden}">
                        Cancelar este pedido
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    // Event listener para cancelar desde modal
    const btnCancelarModal = contenedor.querySelector('.btn-cancelar-modal');
    if (btnCancelarModal) {
        btnCancelarModal.addEventListener('click', () => {
            cerrarModal();
            confirmarCancelacion(btnCancelarModal.dataset.id, btnCancelarModal.dataset.orden);
        });
    }
}

/**
 * Renderiza timeline de estados
 * @param {Object} pedido
 */
function renderizarTimeline(pedido) {
    const estados = [
        { key: 'pendiente', label: 'Pendiente', icon: '⏳' },
        { key: 'confirmado', label: 'Confirmado', icon: '✅' },
        { key: 'procesando', label: 'Procesando', icon: '📦' },
        { key: 'enviado', label: 'Enviado', icon: '🚚' },
        { key: 'entregado', label: 'Entregado', icon: '🎉' },
    ];

    const estadoActual = pedido.estado;
    const estadoIdx = estados.findIndex(e => e.key === estadoActual);

    return estados.map((estado, idx) => {
        const completado = idx <= estadoIdx;
        const esActual = idx === estadoIdx && !['cancelado', 'reembolsado'].includes(estadoActual);
        
        let fecha = '';
        if (completado) {
            if (estado.key === 'pendiente') fecha = formatearFechaHora(pedido.createdAt);
            else if (estado.key === 'enviado' && pedido.fechaEnvio) fecha = formatearFechaHora(pedido.fechaEnvio);
            else if (estado.key === 'entregado' && pedido.fechaEntrega) fecha = formatearFechaHora(pedido.fechaEntrega);
            else if (estado.key === 'cancelado' && pedido.canceladoEn) fecha = formatearFechaHora(pedido.canceladoEn);
        }

        return `
            <div class="timeline-item ${completado ? 'completado' : ''} ${esActual ? 'actual' : ''}">
                <div class="timeline-marker">${estado.icon}</div>
                <div class="timeline-content">
                    <strong>${estado.label}</strong>
                    ${fecha ? `<span class="timeline-fecha">${escapeHTML(fecha)}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Confirma y ejecuta cancelación de pedido
 * @param {string} pedidoId
 * @param {string} numeroOrden
 */
async function confirmarCancelacion(pedidoId, numeroOrden) {
    const motivo = prompt(`¿Cancelar pedido ${numeroOrden}?\nEscribe el motivo (opcional):`);
    if (motivo === null) return; // Usuario canceló el prompt

    const response = await cancelOrder(pedidoId, motivo || 'Cancelado por el usuario');
    
    if (!response.ok) {
        handleApiError({ message: response.msg, status: response.data?.status }, 'cancelar-pedido');
        return;
    }

    alert('Pedido cancelado correctamente');
    cerrarModal();
    cargarPedidos(paginaActual); // Recargar lista
}

/**
 * Inicializa modal (cerrar con X, click fuera, Escape)
 */
function inicializarModal() {
    const modal = document.getElementById('modalDetallePedido');
    
    modal?.addEventListener('click', (e) => {
        if (e.target === modal || e.target.matches('.modal-cerrar')) {
            cerrarModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.hidden) {
            cerrarModal();
        }
    });
}

function cerrarModal() {
    const modal = document.getElementById('modalDetallePedido');
    if (modal) {
        modal.hidden = true;
        document.body.style.overflow = '';
    }
}

/**
 * Muestra error genérico
 */
function mostrarError(mensaje) {
    const contenedor = document.getElementById('pedidosContenido');
    contenedor.innerHTML = `
        <div class="pedido-error">
            <p>${escapeHTML(mensaje)}</p>
            <button class="btn-reintentar" type="button">Reintentar</button>
        </div>
    `;
    contenedor.querySelector('.btn-reintentar')?.addEventListener('click', () => window.location.reload());
}

/* ===== HELPERS DE FORMATO ===== */

function formatearEstado(estado) {
    const map = {
        pendiente: 'Pendiente',
        confirmado: 'Confirmado',
        procesando: 'Procesando',
        enviado: 'Enviado',
        entregado: 'Entregado',
        cancelado: 'Cancelado',
        reembolsado: 'Reembolsado',
    };
    return map[estado] || estado;
}

function formatearMonto(valor) {
    const monto = Number(valor);
    return formatearPrecio(monto);
}

function formatearFecha(fechaStr) {
    const fecha = new Date(fechaStr);
    return fecha.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatearFechaCompleta(fechaStr) {
    const fecha = new Date(fechaStr);
    return fecha.toLocaleDateString('es-CO', { 
        weekday: 'long', 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatearFechaHora(fechaStr) {
    const fecha = new Date(fechaStr);
    return fecha.toLocaleDateString('es-CO', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}