import { Injectable, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FeedbackService } from './feedback.service';

export interface ApiResponse<T = any> {
    ok: boolean;
    msg: string;
    data: T;
}

export interface ApiErrorData {
    code: string;
    message: string;
    details?: any;
    errors?: any;
    status: number;
    requestId?: string | null;
}

export interface ApiRequestOptions {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    requiereCsrf?: boolean;
}

const CODIGOS_SESION = new Set([
    'UNAUTHENTICATED',
    'INVALID_TOKEN',
    'TOKEN_EXPIRED',
    'TOKEN_REVOKED',
    'USER_NOT_FOUND',
]);

const CLAVE_CSRF = 'jers_csrf';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private doc = inject(DOCUMENT);
    private feedback = inject(FeedbackService);

    readonly usuario = signal<any>(null);
    readonly carritoCantidad = signal(0);
    readonly estaLogueado = computed(() => this.usuario() !== null);
    readonly esAdmin = computed(() => this.usuario()?.role === 'admin');

    private expirada = false;
    private versionSesion = 0;

    private apiBaseUrl: string;

    constructor() {
        this.apiBaseUrl = this.calcularApiBaseUrl();
    }

    private get windowRef(): any {
        return this.doc.defaultView ?? null;
    }

    private normalizar(valor: string): string | null {
        try {
            if (typeof valor !== 'string') return null;
            const url = new URL(valor);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== this.windowRef?.location?.origin) return null;
            const ruta = url.pathname.replace(/\/+$/, '');
            if (ruta !== '/api' && !ruta.endsWith('/api')) url.pathname = `${ruta}/api`;
            return url.toString().replace(/\/$/, '');
        } catch {
            return null;
        }
    }

    private calcularApiBaseUrl(): string {
        const w = this.windowRef;
        if (typeof w !== 'undefined' && w?.API_BASE_URL) {
            const desdeGlobal = this.normalizar(w.API_BASE_URL);
            if (desdeGlobal) return desdeGlobal;
        }
        if (typeof this.doc !== 'undefined') {
            const meta = this.doc.querySelector('meta[name="api-base-url"]') as HTMLMetaElement | null;
            const desdeMeta = this.normalizar(meta?.content || '');
            if (desdeMeta) return desdeMeta;
        }
        const origin = w?.location?.origin;
        if (origin) return `${origin}/api`;
        return 'http://localhost:3000/api';
    }

    private leerCookie(nombre: string): string | null {
        if (typeof this.doc === 'undefined') return null;
        const prefijo = `${encodeURIComponent(nombre)}=`;
        const hallada = this.doc.cookie.split('; ').find((c) => c.startsWith(prefijo));
        try {
            return hallada ? decodeURIComponent(hallada.slice(prefijo.length)) : null;
        } catch {
            return null;
        }
    }

    private obtenerCsrf(): string | null {
        return this.leerCookie(CLAVE_CSRF);
    }

    private async asegurarCsrf(): Promise<string | null> {
        const actual = this.obtenerCsrf();
        if (actual) return actual;
        if (typeof fetch === 'undefined') return null;
        try {
            await this.request('/auth/csrf', { method: 'GET', requiereCsrf: false });
        } catch {
            return null;
        }
        return this.obtenerCsrf();
    }

    private construirError(respuesta: Response, cuerpo: any): ApiErrorData {
        return {
            code: cuerpo?.error?.code || 'UNKNOWN_ERROR',
            message: cuerpo?.error?.message || 'Error inesperado',
            details: cuerpo?.error?.details || cuerpo?.error?.errors || null,
            requestId: cuerpo?.requestId || respuesta.headers.get('X-Request-ID') || null,
            status: respuesta.status,
            errors: cuerpo?.error?.details || cuerpo?.error?.errors || null,
        };
    }

    async request(endpoint: string, options: ApiRequestOptions = {}): Promise<ApiResponse> {
        const versionSesion = this.versionSesion;
        const { method: metodoCrudo = 'GET', body, headers: cabecerasExtra = {}, requiereCsrf = true } = options;
        const metodo = String(metodoCrudo).toUpperCase();
        const muta = !['GET', 'HEAD', 'OPTIONS'].includes(metodo);
        const cabeceras: Record<string, string> = {
            'X-Requested-With': 'XMLHttpRequest',
            ...cabecerasExtra,
        };

        let cuerpoFinal: BodyInit | undefined;
        if (body instanceof FormData) cuerpoFinal = body;
        if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string') {
            cabeceras['Content-Type'] = 'application/json';
            cuerpoFinal = JSON.stringify(body);
        } else if (typeof body === 'string') {
            const declaraContentType = Object.keys(cabeceras).some((k) => k.toLowerCase() === 'content-type');
            if (!declaraContentType) cabeceras['Content-Type'] = 'application/json';
            cuerpoFinal = body;
        }

        if (muta && requiereCsrf) {
            const token = await this.asegurarCsrf();
            if (token) cabeceras['X-CSRF-Token'] = token;
        }

        let respuesta: Response;
        try {
            respuesta = await fetch(`${this.apiBaseUrl}${endpoint}`, {
                method: metodo,
                credentials: 'include',
                headers: cabeceras,
                body: cuerpoFinal,
            });
        } catch (error) {
            if (error instanceof TypeError) {
                return {
                    ok: false,
                    msg: 'No se puede conectar con la tienda. Revisa tu conexión.',
                    data: { code: 'NETWORK_ERROR', status: 0, message: error.message },
                };
            }
            return {
                ok: false,
                msg: 'Error inesperado al contactar con la tienda.',
                data: { code: 'UNKNOWN_ERROR', status: 0, message: (error as Error)?.message },
            };
        }

        if (respuesta.status === 204) {
            return { ok: true, msg: 'Operación exitosa', data: null };
        }

        let datos: any;
        try {
            datos = await respuesta.json();
        } catch {
            return {
                ok: false,
                msg: `La API no devolvió JSON (HTTP ${respuesta.status}) al pedir ${this.apiBaseUrl}. `,
                data: { code: 'INVALID_RESPONSE', status: respuesta.status },
            };
        }

        if (respuesta.ok) {
            // Solo operaciones guardadas por el servidor disparan el aviso solicitado.
            if (muta) {
                const title = /^\/admin\/(?:productos|categorias|marcas|contactos|solicitudes-datos)(?:\/|$)/.test(endpoint)
                    || /^\/auth\/(?:profile|addresses)(?:\/|$)/.test(endpoint)
                    ? 'Los cambios se guardaron'
                    : endpoint === '/auth/login' ? 'Inicio de sesión correcto'
                    : endpoint === '/auth/logout' ? 'Sesión cerrada'
                    : endpoint === '/auth/password' || endpoint === '/auth/reset-password' ? 'Contraseña actualizada'
                    : endpoint === '/auth/data-requests' ? 'Solicitud registrada'
                    : endpoint === '/contact' ? 'Mensaje recibido'
                    : endpoint === '/orders' ? 'Pedido creado' : null;
                if (title) void this.feedback.success(title);
            }
            return { ok: true, msg: datos?.message || 'Operación exitosa', data: datos };
        }

        const error = this.construirError(respuesta, datos);

        if (CODIGOS_SESION.has(error.code) && !this.expirada && versionSesion === this.versionSesion) {
            this.expirada = true;
            this.notificarSesion(null);
        }

        if (!CODIGOS_SESION.has(error.code)) {
            this.expirada = false;
        }

        return { ok: false, msg: error.message, data: error };
    }

    // -------------------------------------------------------------
    // Sesión
    // -------------------------------------------------------------
    private notificarSesion(usuario: any) {
        this.versionSesion++;
        this.usuario.set(usuario || null);
        if (!usuario) this.carritoCantidad.set(0);
    }

    private aplicarCarrito(data: any): void {
        const carrito = data?.cart ?? data;
        if (carrito && typeof carrito.totalItems === 'number') {
            this.carritoCantidad.set(carrito.totalItems);
        }
    }

    async refrescarCarrito(): Promise<void> {
        if (!this.usuario()) {
            this.carritoCantidad.set(0);
            return;
        }
        await this.getCart();
    }

    // -------------------------------------------------------------
    // Auth
    // -------------------------------------------------------------
    async register(datos: any): Promise<ApiResponse> {
        const r = await this.request('/auth/register', { method: 'POST', body: datos });
        if (r.ok) { this.expirada = false; this.notificarSesion(null); }
        return r;
    }

    async login(credenciales: any): Promise<ApiResponse> {
        const r = await this.request('/auth/login', { method: 'POST', body: credenciales });
        if (r.ok) {
            this.expirada = false;
            this.notificarSesion(r.data?.user ?? null);
            void this.refrescarCarrito();
        }
        return r;
    }

    async logout(): Promise<ApiResponse> {
        const r = await this.request('/auth/logout', { method: 'POST', body: {} });
        if (r.ok) {
            this.notificarSesion(null);
            this.expirada = false;
        }
        return r;
    }

    async getMe(): Promise<ApiResponse> {
        const versionSesion = this.versionSesion;
        const r = await this.request('/auth/me', { requiereCsrf: false });
        if (r.ok && versionSesion === this.versionSesion) {
            this.expirada = false;
            this.notificarSesion(r.data?.user ?? null);
            void this.refrescarCarrito();
        }
        return r;
    }

    forgotPassword(email: string) { return this.request('/auth/forgot-password', { method: 'POST', body: { email } }); }
    resetPassword(datos: any) { return this.request('/auth/reset-password', { method: 'POST', body: datos }); }
    async updateProfile(datos: any): Promise<ApiResponse> {
        const version = ++this.versionSesion;
        const response = await this.request('/auth/profile', { method: 'PATCH', body: datos });
        if (response.ok && version === this.versionSesion && this.usuario() && response.data?.user) {
            this.notificarSesion(response.data.user);
        }
        return response;
    }
    changePassword(datos: any) { return this.request('/auth/password', { method: 'PATCH', body: datos }); }
    exportData(currentPassword: string) { return this.request('/auth/data-export', { method: 'POST', body: { currentPassword } }); }
    getDataRequests() { return this.request('/auth/data-requests'); }
    requestDataAction(datos: any) { return this.request('/auth/data-requests', { method: 'POST', body: datos }); }
    getAdminDataRequests(params: Record<string, any> = {}) { return this.request(this.conQuery('/admin/solicitudes-datos', params)); }
    resolveDataRequest(id: string, respuesta: string) { return this.request(`/admin/solicitudes-datos/${encodeURIComponent(id)}`, { method: 'PATCH', body: { respuesta } }); }
    private async cambiarDirecciones(endpoint: string, method: string, body?: any): Promise<ApiResponse> {
        const version = ++this.versionSesion;
        const response = await this.request(endpoint, { method, body });
        if (response.ok && version === this.versionSesion && this.usuario() && Array.isArray(response.data?.direcciones)) {
            this.notificarSesion({ ...this.usuario(), direcciones: response.data.direcciones });
        }
        return response;
    }
    addAddress(dir: any) { return this.cambiarDirecciones('/auth/addresses', 'POST', dir); }
    updateAddress(id: any, dir: any) { return this.cambiarDirecciones(`/auth/addresses/${encodeURIComponent(id)}`, 'PATCH', dir); }
    deleteAddress(id: any) { return this.cambiarDirecciones(`/auth/addresses/${encodeURIComponent(id)}`, 'DELETE'); }

    // -------------------------------------------------------------
    // Productos
    // -------------------------------------------------------------
    private conQuery(endpoint: string, params: Record<string, any> = {}): string {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== '') q.set(k, v);
        }
        const s = q.toString();
        return s ? `${endpoint}?${s}` : endpoint;
    }

    getProducts(params: Record<string, any> = {}): Promise<ApiResponse> {
        return this.request(this.conQuery('/products', params), { requiereCsrf: false });
    }
    getProduct(id: any): Promise<ApiResponse> { return this.request(`/products/${id}`, { requiereCsrf: false }); }
    getFeaturedProducts(): Promise<ApiResponse> { return this.request('/products/featured', { requiereCsrf: false }); }
    getPromoProducts(): Promise<ApiResponse> { return this.request('/products/promociones', { requiereCsrf: false }); }
    getBrands(): Promise<ApiResponse> { return this.request('/products/marcas', { requiereCsrf: false }); }
    getProductsByCategory(slug: string, params: Record<string, any> = {}): Promise<ApiResponse> {
        return this.request(this.conQuery(`/products/categoria/${encodeURIComponent(slug)}`, params), { requiereCsrf: false });
    }
    searchProducts(q: string, params: Record<string, any> = {}): Promise<ApiResponse> {
        return this.request(this.conQuery('/products/buscar', { q, ...params }), { requiereCsrf: false });
    }

    // -------------------------------------------------------------
    // Carrito
    // -------------------------------------------------------------
    getCart(rewardId?: string): Promise<ApiResponse> {
        const versionSesion = this.versionSesion;
        return this.request(this.conQuery('/cart', rewardId ? { rewardId } : {}), { requiereCsrf: false }).then((r) => {
            if (r.ok && versionSesion === this.versionSesion) this.aplicarCarrito(r.data);
            return r;
        });
    }
    private mutarCarrito(endpoint: string, method: string, body?: any): Promise<ApiResponse> {
        const version = this.versionSesion;
        return this.request(endpoint, { method, body }).then(response => {
            if (response.ok && version === this.versionSesion) this.aplicarCarrito(response.data);
            return response;
        });
    }
    addToCart(item: any): Promise<ApiResponse> { return this.mutarCarrito('/cart', 'POST', item); }
    updateCartItem(itemId: any, cantidad: number): Promise<ApiResponse> { return this.mutarCarrito(`/cart/${encodeURIComponent(itemId)}`, 'PATCH', { cantidad }); }
    removeFromCart(itemId: any): Promise<ApiResponse> { return this.mutarCarrito(`/cart/${encodeURIComponent(itemId)}`, 'DELETE'); }
    clearCart(): Promise<ApiResponse> { return this.mutarCarrito('/cart', 'DELETE'); }

    getStudioProducts(): Promise<ApiResponse> { return this.request('/studio/products', { requiereCsrf: false }); }
    getStudioRewards(): Promise<ApiResponse> { return this.request('/studio/rewards', { requiereCsrf: false }); }
    startStudioAttempt(challenge: string): Promise<ApiResponse> { return this.request('/studio/attempts', { method: 'POST', body: { challenge } }); }
    updateStudioStep(id: string, body: unknown): Promise<ApiResponse> { return this.request(`/studio/attempts/${encodeURIComponent(id)}/step`, { method: 'PATCH', body }); }
    completeStudioAttempt(id: string): Promise<ApiResponse> { return this.request(`/studio/attempts/${encodeURIComponent(id)}/complete`, { method: 'POST', body: {} }); }

    // -------------------------------------------------------------
    // Pedidos
    // -------------------------------------------------------------
    createOrder(datos: any, opciones: any = {}): Promise<ApiResponse> {
        const clave = opciones?.idempotencyKey || opciones?.headers?.['Idempotency-Key'];
        return this.request('/orders', {
            method: 'POST',
            body: datos,
            headers: clave ? { 'Idempotency-Key': clave } : {},
        });
    }
    getOrders(params: Record<string, any> = {}): Promise<ApiResponse> { return this.request(this.conQuery('/orders', params), { requiereCsrf: false }); }
    getOrder(id: any): Promise<ApiResponse> { return this.request(`/orders/${id}`, { requiereCsrf: false }); }
    cancelOrder(id: any, motivo: any): Promise<ApiResponse> { return this.request(`/orders/${id}/cancelar`, { method: 'PATCH', body: { motivo } }); }

    // -------------------------------------------------------------
    // Contacto
    // -------------------------------------------------------------
    createContact(datos: any): Promise<ApiResponse> { return this.request('/contact', { method: 'POST', body: datos }); }

    // -------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------
    getAdminDashboard(): Promise<ApiResponse> { return this.request('/admin/dashboard', { requiereCsrf: false }); }
    getAdminProducts(params: Record<string, any> = {}): Promise<ApiResponse> { return this.request(this.conQuery('/admin/productos', params), { requiereCsrf: false }); }
    createAdminProduct(datos: any): Promise<ApiResponse> { return this.request('/admin/productos', { method: 'POST', body: datos }); }
    createAdminCategory(datos: any): Promise<ApiResponse> { return this.request('/admin/categorias', { method: 'POST', body: datos }); }
    updateAdminCategory(id: string, datos: any): Promise<ApiResponse> { return this.request(`/admin/categorias/${encodeURIComponent(id)}`, { method: 'PATCH', body: datos }); }
    createAdminBrand(datos: any): Promise<ApiResponse> { return this.request('/admin/marcas', { method: 'POST', body: datos }); }
    updateAdminBrand(id: string, datos: any): Promise<ApiResponse> { return this.request(`/admin/marcas/${encodeURIComponent(id)}`, { method: 'PATCH', body: datos }); }
    getAdminContacts(params: Record<string, any> = {}): Promise<ApiResponse> { return this.request(this.conQuery('/admin/contactos', params), { requiereCsrf: false }); }
    updateAdminContact(id: string, estado: 'nuevo' | 'atendido'): Promise<ApiResponse> { return this.request(`/admin/contactos/${encodeURIComponent(id)}`, { method: 'PATCH', body: { estado } }); }
    updateAdminProduct(id: any, datos: any): Promise<ApiResponse> { return this.request(`/admin/productos/${id}`, { method: 'PATCH', body: datos }); }
    getAdminCategories(): Promise<ApiResponse> { return this.request('/admin/categorias', { requiereCsrf: false }); }
    getAdminBrands(): Promise<ApiResponse> { return this.request('/admin/marcas', { requiereCsrf: false }); }
    getAdminOrders(params: Record<string, any> = {}): Promise<ApiResponse> { return this.request(this.conQuery('/admin/pedidos', params), { requiereCsrf: false }); }
    getAdminOrder(id: any): Promise<ApiResponse> { return this.request(`/admin/pedidos/${id}`, { requiereCsrf: false }); }
    updateAdminOrder(id: any, datos: any): Promise<ApiResponse> { return this.request(`/admin/pedidos/${id}`, { method: 'PATCH', body: datos }); }

    // -------------------------------------------------------------
    // Usuarios
    // -------------------------------------------------------------
    getUsers(params: Record<string, any> = {}): Promise<ApiResponse> { return this.request(this.conQuery('/users', params), { requiereCsrf: false }); }
    updateUserRole(id: any, role: any): Promise<ApiResponse> { return this.request(`/users/${id}/role`, { method: 'PATCH', body: { role } }); }
    toggleUserActive(id: any): Promise<ApiResponse> { return this.request(`/users/${id}/toggle-active`, { method: 'PATCH', body: {} }); }
    deleteUser(id: any): Promise<ApiResponse> { return this.request(`/users/${id}`, { method: 'DELETE' }); }

}
