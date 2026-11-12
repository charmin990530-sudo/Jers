import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { formatearPrecio, mensajeError } from '../utils/format';
import { StudioReward } from '../estudio/studio.types';

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
    descuento?: number;
    premio?: { id: string; name: string } | null;
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

interface DireccionGuardada extends Omit<EstadoEnvio, 'notas'> { _id: string; esPrincipal?: boolean; }

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
    readonly premios = signal<StudioReward[]>([]);
    readonly premioElegido = signal('');
    readonly calculandoPremio = signal(false);
    readonly errorPremios = signal('');
    readonly direcciones = computed<DireccionGuardada[]>(() => this.api.usuario()?.direcciones ?? []);
    direccionElegida = '';

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
        const respuesta = await this.api.getCart(this.premioElegido() || undefined);
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
        await this.cargarPremios();

        if (!this.api.usuario()) await this.api.getMe();
        const usuario = this.api.usuario();
        if (usuario) {
            this.envio.nombreCompleto = `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim();
            this.envio.telefono = usuario.telefono ?? '';
            const principal = this.direcciones().find(d => d.esPrincipal) ?? this.direcciones()[0];
            if (principal) this.seleccionarDireccion(principal._id);
        }
        this.cargando.set(false);
    }

    async cargarPremios(): Promise<void> {
        const respuesta = await this.api.getStudioRewards();
        if (respuesta.ok) { this.premios.set((respuesta.data?.rewards ?? []).filter((reward: StudioReward) => !reward.redeemedAt)); this.errorPremios.set(''); }
        else this.errorPremios.set('No se pudieron consultar los premios. Puedes comprar sin premio o reintentar.');
    }

    async aplicarPremio(id: string): Promise<void> {
        if (this.calculandoPremio() || this.enviando()) return;
        this.calculandoPremio.set(true); this.errorPremios.set('');
        try {
            const response = await this.api.getCart(id || undefined);
            if (response.ok) { this.carrito.set(response.data?.cart ?? null); this.premioElegido.set(id); }
            else this.errorPremios.set(mensajeError(response, 'No se pudo aplicar el premio.'));
        } finally { this.calculandoPremio.set(false); }
    }

    async elegirPremio(event: Event): Promise<void> {
        const select = event.target as HTMLSelectElement;
        await this.aplicarPremio(select.value);
        select.value = this.premioElegido();
    }

    seleccionarDireccion(id: string): void {
        this.direccionElegida = id;
        const address = this.direcciones().find(d => d._id === id);
        const user = this.api.usuario();
        this.envio.alias = address?.alias ?? 'Casa';
        this.envio.nombreCompleto = address?.nombreCompleto ?? `${user?.nombre ?? ''} ${user?.apellido ?? ''}`.trim();
        this.envio.telefono = address?.telefono ?? user?.telefono ?? '';
        this.envio.direccion = address?.direccion ?? '';
        this.envio.ciudad = address?.ciudad ?? '';
        this.envio.departamento = address?.departamento ?? '';
        this.envio.codigoPostal = address?.codigoPostal ?? '';
    }

    async confirmar(): Promise<void> {
        if (this.enviando() || this.exito() || this.calculandoPremio()) return;
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
                expectedTotal: this.carrito()?.total,
                rewardId: this.premioElegido() || undefined,
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
            if (respuesta.data?.code === 'PRICE_CHANGED') {
                const actualizado = await this.api.getCart(this.premioElegido() || undefined);
                if (actualizado.ok) this.carrito.set(actualizado.data?.cart ?? null);
                else this.errorCarga.set(mensajeError(actualizado, 'No se pudo actualizar el total. Reintenta antes de confirmar.'));
            }
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
