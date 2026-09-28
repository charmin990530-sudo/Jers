/**
 * apiClient.js - Cliente HTTP para comunicarse con el backend
 * Estructura basada en bootcamp: async function + try/catch + {ok, msg, data}
 */

import { API_BASE_URL } from './config.js';
import { ensureCsrfToken } from './csrf.js';

/**
 * Construye la URL completa
 * @param {string} endpoint - Ruta del endpoint (ej: '/products')
 * @returns {string} URL completa
 */
function buildUrl(endpoint) {
    return `${API_BASE_URL}${endpoint}`;
}

/**
 * Opciones por defecto para todas las peticiones
 * credentials: 'include' envía cookies automáticamente (necesario para JWT en cookie HttpOnly)
 * @returns {object} Opciones fetch
 */
function getDefaultOptions() {
    return {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    };
}

/**
 * Función genérica para hacer peticiones HTTP
 * @param {string} endpoint - Endpoint API
 * @param {object} options - Opciones fetch (method, body, etc.)
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function request(endpoint, options = {}) {
    const url = buildUrl(endpoint);
    const method = String(options.method || 'GET').toUpperCase();
    const defaultOptions = getDefaultOptions();

    const fetchOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {}),
        },
    };

    // Si hay body, stringify (excepto FormData que se envía tal cual)
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && typeof fetchOptions.body !== 'string') {
        fetchOptions.body = JSON.stringify(fetchOptions.body);
    }

    try {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const csrfToken = await ensureCsrfToken();
            if (!csrfToken) {
                return { ok: false, msg: 'No se pudo iniciar la sesión segura', data: { code: 'CSRF_TOKEN_MISSING' } };
            }
            if (!fetchOptions.headers['X-CSRF-Token']) fetchOptions.headers['X-CSRF-Token'] = csrfToken;
        }
        const response = await fetch(url, fetchOptions);

        // Si es 204 No Content, no hay body que parsear
        if (response.status === 204) {
            return {
                ok: true,
                msg: 'Operación exitosa',
                data: null
            };
        }

        let data;
        try {
            data = await response.json();
        } catch {
            return {
                ok: false,
                msg: 'Respuesta inválida del servidor',
                data: null
            };
        }

        // Si la respuesta no es exitosa (4xx, 5xx)
        if (!response.ok) {
            // El backend responde siempre { error: { code, message, details? }, requestId }.
            // Se aplana a data para que el resto del frontend siga leyendo
            // response.data.code / .message / .details igual que antes.
            const envelope = data && data.error ? data.error : {};
            return {
                ok: false,
                msg: envelope.message || data?.message || 'Error en la petición',
                data: {
                    ...envelope,
                    // `errors` se mantiene como alias de `details` porque varios
                    // formularios (register, mi-perfil, checkout) recorren
                    // error.errors para pintar el mensaje campo a campo.
                    errors: envelope.details || envelope.errors || data?.errors,
                    requestId: data?.requestId,
                    status: response.status,
                }
            };
        }

        return {
            ok: true,
            msg: data.message || 'Operación exitosa',
            data: data
        };

    } catch (error) {
        // Error de red o CORS
        if (error instanceof TypeError && error.message.includes('fetch')) {
            return {
                ok: false,
                msg: 'No se puede conectar con el servidor. Intenta de nuevo más tarde.',
                data: null
            };
        }
        return {
            ok: false,
            msg: error.message || 'Error inesperado',
            data: null
        };
    }
}

/**
 * GET - Obtener recursos
 * @param {string} endpoint
 * @param {object} params - Query params opcionales
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function get(endpoint, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            query.set(key, value);
        }
    });
    const queryString = query.toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return await request(url, { method: 'GET' });
}

/**
 * POST - Crear recurso
 * @param {string} endpoint
 * @param {object} body - Datos a enviar
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function post(endpoint, body) {
    return await request(endpoint, {
        method: 'POST',
        body,
    });
}

/**
 * PATCH - Actualizar parcialmente
 * @param {string} endpoint
 * @param {object} body - Datos a actualizar
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function patch(endpoint, body) {
    return await request(endpoint, {
        method: 'PATCH',
        body,
    });
}

/**
 * PUT - Reemplazar recurso completo
 * @param {string} endpoint
 * @param {object} body - Datos completos
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function put(endpoint, body) {
    return await request(endpoint, {
        method: 'PUT',
        body,
    });
}

/**
 * DELETE - Eliminar recurso
 * @param {string} endpoint
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function del(endpoint) {
    return await request(endpoint, { method: 'DELETE' });
}

// ================================================================
// MÉTODOS DE AUTENTICACIÓN
// ================================================================

/**
 * Registro de usuario
 * @param {object} userData - { nombre, apellido, email, password, telefono, aceptoTerminos, aceptoPrivacidad }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function register(userData) {
    return await post('/auth/register', userData);
}

/**
 * Login de usuario
 * @param {object} credentials - { email, password }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function login(credentials) {
    return await post('/auth/login', credentials);
}

/**
 * Logout - Limpia cookie del servidor
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function logout() {
    const result = await post('/auth/logout');
    if (result.ok && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth-cambio'));
    }
    return result;
}

/**
 * Obtener usuario actual (protegido - requiere cookie JWT)
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getMe() {
    return await get('/auth/me');
}

/**
 * Solicitar reset de password
 * @param {string} email
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function forgotPassword(email) {
    return await post('/auth/forgot-password', { email });
}

/**
 * Resetear password con token
 * @param {object} data - { token, password, confirmPassword }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function resetPassword(data) {
    return await post('/auth/reset-password', data);
}

// ================================================================
// MÉTODOS DE PRODUCTOS
// ================================================================

/**
 * Listar productos con filtros, paginación, búsqueda
 * @param {object} params - { page, limit, categoria, marca, search, minPrice, maxPrice, enPromocion, destacado, sort }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getProducts(params = {}) {
    return await get('/products', params);
}

/**
 * Obtener producto por ID
 * @param {string} id - ObjectId del producto
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getProduct(id) {
    return await get(`/products/${id}`);
}

/**
 * Productos destacados (home)
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getFeaturedProducts() {
    return await get('/products/featured');
}

/**
 * Productos en promoción (home)
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getPromoProducts() {
    return await get('/products/promociones');
}

/**
 * Listar categorías activas
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getCategories() {
    return await get('/products/categorias');
}

/**
 * Listar marcas activas
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getBrands() {
    return await get('/products/marcas');
}

/**
 * Productos por categoría (slug)
 * @param {string} slug - slug de la categoría (ej: 'rostro', 'shampoo')
 * @param {object} params - { page, limit, sort }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getProductsByCategory(slug, params = {}) {
    return await get(`/products/categoria/${slug}`, params);
}

/**
 * Búsqueda full-text
 * @param {string} q - Query de búsqueda
 * @param {object} params - { page, limit }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function searchProducts(q, params = {}) {
    return await get('/products/buscar', { q, ...params });
}

async function getAdminProducts(params = {}) {
    return await get('/admin/productos', params);
}

async function getAdminCategories() {
    return await get('/admin/categorias');
}

async function getAdminBrands() {
    return await get('/admin/marcas');
}

async function getAdminOrders(params = {}) {
    return await get('/admin/pedidos', params);
}

async function getAdminOrder(id) {
    return await get(`/admin/pedidos/${id}`);
}

async function updateAdminOrder(id, data) {
    return await patch(`/admin/pedidos/${id}`, data);
}

async function getContacts(params = {}) {
    return await get('/admin/contactos', params);
}

async function updateContact(id, data) {
    return await patch(`/admin/contactos/${id}`, data);
}

// ================================================================
// MÉTODOS DE CARRITO
// ================================================================

/**
 * Obtener carrito del usuario logueado
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getCart() {
    return await get('/cart');
}

/**
 * Agregar item al carrito
 * @param {object} item - { productoId, cantidad }  (el backend valida `productoId` como ObjectId)
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function addToCart(item) {
    return await post('/cart', item);
}

/**
 * Actualizar cantidad de item en carrito
 * @param {string} itemId - ObjectId del item en carrito
 * @param {number} cantidad
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function updateCartItem(itemId, cantidad) {
    return await patch(`/cart/${itemId}`, { cantidad });
}

/**
 * Eliminar item del carrito
 * @param {string} itemId
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function removeFromCart(itemId) {
    return await del(`/cart/${itemId}`);
}

/**
 * Vaciar carrito completo
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function clearCart() {
    return await del('/cart');
}

// ================================================================
// MÉTODOS DE PEDIDOS
// ================================================================

/**
 * Crear pedido (checkout)
 * @param {object} data - { direccionEnvio, notas? }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function createOrder(data, options = {}) {
    return await request('/orders', {
        method: 'POST',
        body: data,
        ...options,
    });
}

/**
 * Listar pedidos del usuario
 * @param {object} params - { page, limit, estado }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getOrders(params = {}) {
    return await get('/orders', params);
}

/**
 * Obtener detalle de un pedido
 * @param {string} id - ObjectId del pedido
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function getOrder(id) {
    return await get(`/orders/${id}`);
}

/**
 * Cancelar pedido
 * @param {string} id - ObjectId del pedido
 * @param {string} motivo - Motivo opcional
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function cancelOrder(id, motivo) {
    return await patch(`/orders/${id}/cancelar`, { motivo });
}

// ================================================================
// MÉTODOS DE PERFIL Y DIRECCIONES
// ================================================================

/**
 * Actualizar perfil (nombre, apellido, telefono)
 * @param {object} data - { nombre, apellido, telefono }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function updateProfile(data) {
    return await patch('/auth/profile', data);
}

/**
 * Cambiar contraseña
 * @param {object} data - { currentPassword, newPassword }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function changePassword(data) {
    return await patch('/auth/password', data);
}

/**
 * Agregar dirección
 * @param {object} address - { alias, nombreCompleto, telefono, direccion, ciudad, departamento, codigoPostal?, esPrincipal? }
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function addAddress(address) {
    return await post('/auth/addresses', address);
}

/**
 * Actualizar dirección
 * @param {string} addressId - ObjectId de la dirección
 * @param {object} address - Campos a actualizar
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function updateAddress(addressId, address) {
    return await patch(`/auth/addresses/${addressId}`, address);
}

/**
 * Eliminar dirección
 * @param {string} addressId - ObjectId de la dirección
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function deleteAddress(addressId) {
    return await del(`/auth/addresses/${addressId}`);
}

async function getUsers(params = {}) {
    return await get('/users', params);
}

async function updateUserRole(id, role) {
    return await patch(`/users/${id}/role`, { role });
}

async function toggleUserActive(id) {
    return await patch(`/users/${id}/toggle-active`, {});
}

async function deleteUser(id) {
    return await del(`/users/${id}`);
}

function handleApiError(error = {}, context = 'api') {
    const status = error.status || error.data?.status;
    const message = error.message || 'Error inesperado en la API';

    console.error(`[API:${context}]${status ? ` ${status}` : ''}: ${message}`);

    return {
        ...error,
        message,
        status,
    };
}

/**
 * Convierte una respuesta fallida de la API en un Error que conserva el payload.
 *
 * `new Error(response.msg)` solo conserva el mensaje y descarta `response.data`,
 * por lo que los `errors[]` de validación que devuelve el backend (Zod, Mongoose)
 * se pierden y el formulario nunca puede pintarlos campo por campo.
 *
 * @param {{ok: boolean, msg: string, data: any}} response - Respuesta de request()
 * @param {string} [fallbackMessage] - Mensaje si la API no envió ninguno
 * @returns {Error} Error con .data y .status para handleApiError y los forms
 */
function apiErrorFromResponse(response, fallbackMessage = 'Error en la petición') {
    const error = new Error(response?.msg || fallbackMessage);
    error.data = response?.data ?? null;
    error.status = response?.data?.status ?? null;
    return error;
}

const api = {
    request,
    get,
    post,
    patch,
    put,
    del,
    register,
    login,
    logout,
    getMe,
    forgotPassword,
    resetPassword,
    getProducts,
    getProduct,
    getFeaturedProducts,
    getPromoProducts,
    getCategories,
    getBrands,
    getProductsByCategory,
    searchProducts,
    getAdminProducts,
    getAdminCategories,
    getAdminBrands,
    getAdminOrders,
    getAdminOrder,
    updateAdminOrder,
    getContacts,
    updateContact,
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    createOrder,
    getOrders,
    getOrder,
    cancelOrder,
    updateProfile,
    changePassword,
    addAddress,
    updateAddress,
    deleteAddress,
    getUsers,
    updateUserRole,
    toggleUserActive,
    deleteUser,
    apiErrorFromResponse,
};

export {
    request,
    get,
    post,
    patch,
    put,
    del,
    register,
    login,
    logout,
    getMe,
    forgotPassword,
    resetPassword,
    getProducts,
    getProduct,
    getFeaturedProducts,
    getPromoProducts,
    getCategories,
    getBrands,
    getProductsByCategory,
    searchProducts,
    getAdminProducts,
    getAdminCategories,
    getAdminBrands,
    getAdminOrders,
    getAdminOrder,
    updateAdminOrder,
    getContacts,
    updateContact,
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    createOrder,
    getOrders,
    getOrder,
    cancelOrder,
    updateProfile,
    changePassword,
    addAddress,
    updateAddress,
    deleteAddress,
    getUsers,
    updateUserRole,
    toggleUserActive,
    deleteUser,
    handleApiError,
    apiErrorFromResponse,
    api,
};