import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { formatearPrecio, mensajeError } from '../utils/format';

interface ItemCarrito {
    _id?: string;
    producto?: {
        _id?: string;
        nombre?: string;
        slug?: string;
        precio?: number;
        imagenes?: { url?: string; posicion?: string; esPrincipal?: boolean }[];
    };
    cantidad?: number;
    precioUnitario?: number;
}

interface CarritoResumen {
    items?: ItemCarrito[];
    totalItems?: number;
    subtotal?: number;
    costoEnvio?: number;
    impuestos?: number;
    total?: number;
    envioGratisDesde?: number;
}

interface OrdenCreada {
    _id?: string;
    id?: string;
    numeroOrden?: string;
    total?: number;
    estado?: string;
    whatsappUrl?: string | null;
}

interface EstadoEnvio {
    alias: string;
    nombreCompleto: string;
    telefono: string;
    direccion: string;
    ciudad: string;
    departamento: string;
    codigoPostal: string;
    notas: string;
}

@Component({
    selector: 'app-checkout',
    imports: [FormsModule, RouterLink],
    templateUrl: './checkout.html',
    styleUrl: './checkout.scss',
})
export class Checkout {
    private api = inject(ApiService);

    readonly cargando = signal(true);
    readonly error = signal<string | null>(null);
    readonly errorCarga = signal<string | null>(null);
    readonly enviando = signal(false);
    readonly exito = signal(false);
    readonly requiereLogin = signal(false);
    readonly carrito = signal<CarritoResumen | null>(null);
    readonly orden = signal<OrdenCreada | null>(null);
    readonly formatearPrecio = formatearPrecio;

    private idempotencyKey = this.crearIdempotencyKey();

    readonly envio: EstadoEnvio = {
        alias: 'Casa',
        nombreCompleto: '',
        telefono: '',
        direccion: '',
        ciudad: '',
        departamento: '',
        codigoPostal: '',
        notas: '',
    };

    ngOnInit(): void {
        void this.cargar();
    }

    private crearIdempotencyKey(): string {
        const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return `checkout-${random}`;
    }

    async cargar(): Promise<void> {
        this.cargando.set(true);
        this.error.set(null);
        this.errorCarga.set(null);
        this.requiereLogin.set(false);
        const respuesta = await this.api.getCart();
        if (!respuesta.ok) {
            if (respuesta.data?.status === 401) {
                this.requiereLogin.set(true);
            } else {
                this.errorCarga.set(mensajeError(respuesta, 'No se pudo cargar el carrito.'));
            }
            this.cargando.set(false);
            return;
        }
        this.carrito.set(respuesta.data?.cart ?? null);

        const usuario = this.api.usuario();
        if (usuario) {
            this.envio.nombreCompleto = `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim();
            this.envio.telefono = usuario.telefono ?? '';
        }
        this.cargando.set(false);
    }

    async confirmar(): Promise<void> {
        if (this.enviando() || this.exito()) return;
        const e = this.envio;
        const faltantes: string[] = [];
        if (!e.alias.trim() || e.alias.trim().length < 2) faltantes.push('alias');
        if (!e.nombreCompleto.trim() || e.nombreCompleto.trim().length < 2) faltantes.push('nombre');
        if (!/^[\d\s\-+()]{7,20}$/.test(e.telefono.trim())) faltantes.push('teléfono');
        if (!e.direccion.trim() || e.direccion.trim().length < 5) faltantes.push('dirección');
        if (!e.ciudad.trim() || e.ciudad.trim().length < 2) faltantes.push('ciudad');
        if (!e.departamento.trim() || e.departamento.trim().length < 2) faltantes.push('departamento');

        if (faltantes.length) {
            this.error.set(`Revisa los datos de envío: ${faltantes.join(', ')}.`);
            return;
        }

        this.enviando.set(true);
        this.error.set(null);
        const respuesta = await this.api.createOrder(
            {
                direccionEnvio: {
                    alias: e.alias.trim(),
                    nombreCompleto: e.nombreCompleto.trim(),
                    telefono: e.telefono.trim(),
                    direccion: e.direccion.trim(),
                    ciudad: e.ciudad.trim(),
                    departamento: e.departamento.trim(),
                    codigoPostal: e.codigoPostal.trim() || undefined,
                },
                notas: e.notas.trim() || undefined,
            },
            { idempotencyKey: this.idempotencyKey },
        );
        this.enviando.set(false);
        if (!respuesta.ok) {
            this.error.set(mensajeError(respuesta, 'No se pudo crear el pedido.'));
            return;
        }

        this.orden.set(respuesta.data?.order ?? null);
        this.exito.set(true);
        this.carrito.set(null);
        void this.api.refrescarCarrito();
    }

    imagenUrl(item: ItemCarrito): string {
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
