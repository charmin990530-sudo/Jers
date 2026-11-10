import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { formatearPrecio, mensajeError } from '../utils/format';

interface CarritoItem {
    _id?: string;
    producto?: {
        _id?: string;
        nombre?: string;
        slug?: string;
        precio?: number;
        precioAnterior?: number;
        imagenes?: { url?: string; posicion?: string; esPrincipal?: boolean }[];
        stock?: number;
        activo?: boolean;
    };
    cantidad?: number;
    precioUnitario?: number;
}

export interface Carrito {
    items?: CarritoItem[];
    totalItems?: number;
    subtotal?: number;
    costoEnvio?: number;
    impuestos?: number;
    total?: number;
    envioGratisDesde?: number;
}

@Component({
    selector: 'app-carrito',
    imports: [RouterLink],
    templateUrl: './carrito.html',
    styleUrl: './carrito.scss',
})
export class Carrito {
    private api = inject(ApiService);

    readonly carrito = signal<Carrito | null>(null);
    readonly cargando = signal(true);
    readonly error = signal<string | null>(null);
    readonly requiereLogin = signal(false);
    readonly aviso = signal<string | null>(null);
    readonly actualizandoId = signal<string | null>(null);
    readonly vaciando = signal(false);
    readonly formatearPrecio = formatearPrecio;

    ngOnInit(): void {
        void this.cargar();
    }

    async cargar(): Promise<void> {
        this.cargando.set(true);
        this.error.set(null);
        this.requiereLogin.set(false);
        const respuesta = await this.api.getCart();
        if (!respuesta.ok) {
            if (respuesta.data?.status === 401) {
                this.requiereLogin.set(true);
            } else {
                this.error.set(mensajeError(respuesta, 'No se pudo cargar el carrito.'));
            }
            this.cargando.set(false);
            return;
        }
        this.carrito.set(respuesta.data?.cart ?? null);
        this.cargando.set(false);
    }

    async actualizarCantidad(item: CarritoItem, delta: number): Promise<void> {
        if (this.actualizandoId() || this.vaciando()) return;
        const id = item._id;
        const maximo = Math.max(1, Math.min(99, item.producto?.stock ?? 99));
        const cantidad = Math.max(1, Math.min((item.cantidad ?? 1) + delta, maximo));
        if (!id || cantidad === item.cantidad) return;
        this.aviso.set(null);
        this.actualizandoId.set(id);
        const respuesta = await this.api.updateCartItem(id, cantidad);
        this.actualizandoId.set(null);
        if (!respuesta.ok) {
            this.aviso.set(mensajeError(respuesta, 'No se pudo actualizar la cantidad.'));
            return;
        }
        this.carrito.set(respuesta.data?.cart ?? null);
    }

    async quitar(item: CarritoItem): Promise<void> {
        if (this.actualizandoId() || this.vaciando()) return;
        const id = item._id;
        if (!id) return;
        this.aviso.set(null);
        this.actualizandoId.set(id);
        const respuesta = await this.api.removeFromCart(id);
        this.actualizandoId.set(null);
        if (!respuesta.ok) {
            this.aviso.set(mensajeError(respuesta, 'No se pudo quitar el producto.'));
            return;
        }
        this.carrito.set(respuesta.data?.cart ?? null);
    }

    async limpiar(): Promise<void> {
        if (this.actualizandoId() || this.vaciando()) return;
        this.vaciando.set(true);
        this.aviso.set(null);
        const respuesta = await this.api.clearCart();
        this.vaciando.set(false);
        if (!respuesta.ok) {
            this.aviso.set(mensajeError(respuesta, 'No se pudo vaciar el carrito.'));
            return;
        }
        this.carrito.set(respuesta.data?.cart ?? null);
    }

    imagenUrl(item: CarritoItem): string {
        const imagenes = item.producto?.imagenes ?? [];
        const principal = imagenes.find((i) => i?.esPrincipal) ?? imagenes[0];
        const url = String(principal?.url ?? '').trim();
        if (url.startsWith('/') && !url.startsWith('//')) return url;
        try {
            const parsed = new URL(url);
            if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href;
        } catch {
            /* sin imagen válida */
        }
        return '/img/placeholder.svg';
    }
}
