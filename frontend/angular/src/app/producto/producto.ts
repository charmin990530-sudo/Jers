import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { formatearPrecio, mensajeError } from '../utils/format';

interface Referencia {
    _id?: string;
    nombre?: string;
    slug?: string;
}

export interface Producto {
    _id?: string;
    id?: string;
    nombre: string;
    slug?: string;
    descripcion?: string;
    descripcionCorta?: string;
    precio: number;
    precioAnterior?: number;
    descuentoPorcentaje?: number;
    stock?: number;
    imagenes?: { url?: string; alt?: string; posicion?: string; esPrincipal?: boolean }[];
    categoria?: Referencia | string;
    marca?: Referencia | string;
}

@Component({
    selector: 'app-producto',
    imports: [RouterLink],
    templateUrl: './producto.html',
    styleUrl: './producto.scss',
})
export class Producto {
    private api = inject(ApiService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private destroyRef = inject(DestroyRef);
    private solicitud = 0;

    readonly producto = signal<Producto | null>(null);
    readonly cargando = signal(true);
    readonly error = signal<string | null>(null);
    readonly cantidad = signal(1);
    readonly agregando = signal(false);
    readonly aviso = signal<string | null>(null);
    readonly errorAgregar = signal<string | null>(null);
    readonly formatearPrecio = formatearPrecio;

    ngOnInit(): void {
        this.destroyRef.onDestroy(() => this.solicitud++);
        this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
            const id = params.get('id');
            if (id) void this.cargar(id);
        });
    }

    async cargar(id: string): Promise<void> {
        const solicitud = ++this.solicitud;
        this.cargando.set(true);
        this.error.set(null);
        this.aviso.set(null);
        this.errorAgregar.set(null);
        this.cantidad.set(1);
        const respuesta = await this.api.getProduct(id);
        if (solicitud !== this.solicitud) return;
        if (!respuesta.ok) {
            this.error.set(mensajeError(respuesta, 'No se pudo cargar el producto.'));
            this.cargando.set(false);
            return;
        }
        const data = respuesta.data;
        this.producto.set((data?.product ?? null) as Producto | null);
        this.cargando.set(false);
    }

    imagenUrl(producto: Producto): string | null {
        const imagenes = producto?.imagenes ?? [];
        const principal = imagenes.find((i) => i?.esPrincipal) ?? imagenes[0];
        return this.safeAssetUrl(principal?.url) ?? '/img/placeholder.svg';
    }

    private safeAssetUrl(value: unknown): string | null {
        const url = String(value ?? '').trim();
        if (url.startsWith('/') && !url.startsWith('//')) return url;
        try {
            const parsed = new URL(url);
            return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
        } catch {
            return null;
        }
    }

    nombreReferencia(valor: Referencia | string | undefined): string {
        if (!valor) return '';
        return typeof valor === 'string' ? valor : valor.nombre ?? '';
    }

    slugReferencia(valor: Referencia | string | undefined): string | null {
        if (!valor || typeof valor === 'string') return null;
        return valor.slug ?? null;
    }

    descuento(producto: Producto): number {
        const precioAnterior = producto?.precioAnterior;
        const tieneDescuento = precioAnterior !== undefined && precioAnterior > (producto?.precio ?? 0);
        if (tieneDescuento && precioAnterior) {
            return Number(producto?.descuentoPorcentaje) || Math.round(((precioAnterior - (producto?.precio ?? 0)) / precioAnterior) * 100);
        }
        return Number(producto?.descuentoPorcentaje) || 0;
    }

    precioAnteriorValor(producto: Producto): number {
        const precioAnterior = producto?.precioAnterior;
        return precioAnterior && precioAnterior > (producto?.precio ?? 0) ? precioAnterior : producto?.precio ?? 0;
    }

    cambiarCantidad(delta: number): void {
        const stock = this.producto()?.stock ?? 99;
        const maximo = Math.max(1, Math.min(99, stock));
        this.cantidad.set(Math.max(1, Math.min(maximo, this.cantidad() + delta)));
    }

    async agregarAlCarrito(producto: Producto): Promise<void> {
        const id = producto._id ?? producto.id;
        if (!id || this.agregando()) return;

        this.aviso.set(null);
        this.errorAgregar.set(null);

        if (!this.api.estaLogueado()) {
            await this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
            return;
        }

        this.agregando.set(true);
        const respuesta = await this.api.addToCart({ productoId: id, cantidad: this.cantidad() });
        this.agregando.set(false);

        if (!respuesta.ok) {
            if (respuesta.data?.status === 401) {
                await this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
                return;
            }
            this.errorAgregar.set(mensajeError(respuesta, 'No se pudo añadir el producto al carrito.'));
            return;
        }

        this.aviso.set('Producto añadido al carrito.');
    }
}
