import { Injectable, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

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

    readonly usuario = signal<any>(null);
    readonly carritoCantidad = signal(0);
    readonly estaLogueado = computed(() => this.usuario() !== null);
    readonly esAdmin = computed(() => this.usuario()?.role === 'admin');

    private expirada = false;
    private readonly oyentesSesion = new Set<(usuario: any) => void>();
    private redirigiendo = false;
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
            const url = new URL(valor);
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
            return { ok: true, msg: datos?.message || 'Operación exitosa', data: datos };
        }

        const error = this.construirError(respuesta, datos);

        if (CODIGOS_SESION.has(error.code) && !this.expirada && versionSesion === this.versionSesion) {
            const teniaSesion = this.usuario() !== null;
            this.expirada = true;
            this.notificarSesion(null);
            if (teniaSesion) {
                this.windowRef?.dispatchEvent?.(new Event('sesion-caducada'));
            }
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
        this.oyentesSesion.forEach((fn) => {
            try { fn(this.usuario()); } catch { /* oyente falló */ }
        });
    }

    alCambiarSesion(fn: (usuario: any) => void): () => void {
        this.oyentesSesion.add(fn);
        return () => this.oyentesSesion.delete(fn);
    }

    obtenerUsuario(): any {
        return this.usuario();
    }

    irAlLogin(): void {
        const w = this.windowRef;
        if (typeof w === 'undefined') return;
        if (this.redirigiendo) return;
        const actual = `${w.location?.pathname ?? ''}${w.location?.search ?? ''}${w.location?.hash ?? ''}`;
        if (actual.includes('/login') || actual.includes('/register')) return;
        this.redirigiendo = true;
        try { w.sessionStorage?.setItem('auth_redirect_url', actual); } catch { /* modo privado */ }
        void w.location.assign(`/login?redirect=${encodeURIComponent(actual)}`);
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
            this.windowRef?.dispatchEvent?.(new Event('auth-cambio'));
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
    updateProfile(datos: any) { return this.request('/auth/profile', { method: 'PATCH', body: datos }); }
    changePassword(datos: any) { return this.request('/auth/password', { method: 'PATCH', body: datos }); }
    addAddress(dir: any) { return this.request('/auth/addresses', { method: 'POST', body: dir }); }
    updateAddress(id: any, dir: any) { return this.request(`/auth/addresses/${id}`, { method: 'PATCH', body: dir }); }
    deleteAddress(id: any) { return this.request(`/auth/addresses/${id}`, { method: 'DELETE' }); }

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
    getCart(): Promise<ApiResponse> {
        const versionSesion = this.versionSesion;
        return this.request('/cart', { requiereCsrf: false }).then((r) => {
            if (r.ok && versionSesion === this.versionSesion) this.aplicarCarrito(r.data);
            return r;
        });
    }
    addToCart(item: any): Promise<ApiResponse> {
        return this.request('/cart', { method: 'POST', body: item }).then((r) => {
            if (r.ok) this.aplicarCarrito(r.data);
            return r;
        });
    }
    updateCartItem(itemId: any, cantidad: number): Promise<ApiResponse> {
        return this.request(`/cart/${itemId}`, { method: 'PATCH', body: { cantidad } }).then((r) => {
            if (r.ok) this.aplicarCarrito(r.data);
            return r;
        });
    }
    removeFromCart(itemId: any): Promise<ApiResponse> {
        return this.request(`/cart/${itemId}`, { method: 'DELETE' }).then((r) => {
            if (r.ok) this.aplicarCarrito(r.data);
            return r;
        });
    }
    clearCart(): Promise<ApiResponse> {
        return this.request('/cart', { method: 'DELETE' }).then((r) => {
            if (r.ok) this.aplicarCarrito(r.data);
            return r;
        });
    }

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

    // -------------------------------------------------------------
    // Utilidades
    // -------------------------------------------------------------
    apiErrorFromResponse(respuesta: ApiResponse, porDefecto = 'Error en la petición'): Error & { data: any; status: number | null } {
        const error = new Error(respuesta?.msg || porDefecto) as Error & { data: any; status: number | null };
        error.data = respuesta?.data ?? null;
        error.status = respuesta?.data?.status ?? null;
        return error;
    }

    handleApiError(error: any = {}, contexto = 'api'): any {
        const status = error?.status || error?.data?.status;
        const message = error?.message || error?.msg || 'Error inesperado en la API';
        console.error(`[API:${contexto}]${status ? ` ${status}` : ''}: ${message}`);
        return { ...error, message, status };
    }
}
