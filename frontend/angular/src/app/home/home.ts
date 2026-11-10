import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { formatearPrecio, mensajeError } from '../utils/format';
import { BeautyScene } from './beauty-scene';

interface Producto {
    _id?: string;
    id?: string;
    nombre: string;
    precio: number;
    precioAnterior?: number;
    descuentoPorcentaje?: number;
    descripcionCorta?: string;
    imagen?: string;
    imagenPrincipal?: string;
    imagenes?: { url?: string; posicion?: string; esPrincipal?: boolean }[];
    slug?: string;
    stock?: number;
    marca?: { nombre?: string } | string;
}

interface Marca {
    _id?: string;
    nombre?: string;
    slug?: string;
    logo?: string;
}

@Component({
    selector: 'app-home',
    imports: [RouterLink, BeautyScene],
    templateUrl: './home.html',
    styleUrl: './home.scss',
})
export class Home {
    private api = inject(ApiService);
    private router = inject(Router);
    private host = inject(ElementRef<HTMLElement>);
    private destroyRef = inject(DestroyRef);

    readonly destacados = signal<Producto[]>([]);
    readonly promociones = signal<Producto[]>([]);
    readonly marcas = signal<Marca[]>([]);
    readonly cargando = signal(true);
    readonly cargandoPromos = signal(true);
    readonly cargandoMarcas = signal(true);
    readonly error = signal<string | null>(null);
    readonly aviso = signal<string | null>(null);
    readonly agregandoId = signal<string | null>(null);
    readonly envioGratis = 200000;
    readonly formatearPrecio = formatearPrecio;

    constructor() {
        afterNextRender(() => this.observarSecciones());
        void this.cargarDestacados();
        void this.cargarPromociones();
        void this.cargarMarcas();
    }

    async cargarDestacados(): Promise<void> {
        this.cargando.set(true);
        this.error.set(null);
        const respuesta = await this.api.getFeaturedProducts();
        if (!respuesta.ok) {
            this.error.set(mensajeError(respuesta, 'No se pudieron cargar las novedades.'));
            this.cargando.set(false);
            return;
        }
        const data = respuesta.data;
        const lista: any[] = Array.isArray(data?.products) ? data.products : [];
        this.destacados.set(lista.filter((p) => p && (p._id || p.id)));
        this.cargando.set(false);
    }

    async cargarPromociones(): Promise<void> {
        this.cargandoPromos.set(true);
        const respuesta = await this.api.getPromoProducts();
        if (respuesta.ok) {
            const lista: any[] = Array.isArray(respuesta.data?.products) ? respuesta.data.products : [];
            this.promociones.set(lista.filter((p) => p && (p._id || p.id)).slice(0, 4));
        }
        this.cargandoPromos.set(false);
    }

    async cargarMarcas(): Promise<void> {
        this.cargandoMarcas.set(true);
        const respuesta = await this.api.getBrands();
        if (respuesta.ok) {
            const lista: any[] = Array.isArray(respuesta.data?.brands) ? respuesta.data.brands : [];
            this.marcas.set(lista.filter((m) => m?.nombre));
        }
        this.cargandoMarcas.set(false);
    }

    async agregarAlCarrito(producto: Producto): Promise<void> {
        const id = producto._id || producto.id;
        if (!id || this.agregandoId()) return;

        this.aviso.set(null);
        if (!this.api.estaLogueado()) {
            await this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
            return;
        }

        this.agregandoId.set(id);
        const respuesta = await this.api.addToCart({ productoId: id, cantidad: 1 });
        this.agregandoId.set(null);

        if (!respuesta.ok) {
            if (respuesta.data?.status === 401) {
                await this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
                return;
            }
            this.aviso.set(mensajeError(respuesta, 'No se pudo añadir el producto.'));
            return;
        }
        this.aviso.set(`${producto.nombre} se añadió al carrito.`);
    }

    imagenUrl(producto: Producto): string {
        const imagenes = producto.imagenes ?? [];
        const principal = imagenes.find((i) => i?.esPrincipal) ?? imagenes[0];
        const candidatas = [producto.imagen, producto.imagenPrincipal, principal?.url];
        for (const candidata of candidatas) {
            const url = this.safeAssetUrl(candidata);
            if (url) return url;
        }
        return '/img/placeholder.svg';
    }

    imagenAlterna(producto: Producto): string | null {
        const principal = this.imagenUrl(producto);
        const alternativa = (producto.imagenes ?? [])
            .filter((imagen) => imagen && !imagen.esPrincipal)
            .map((imagen) => this.safeAssetUrl(imagen.url))
            .find((url): url is string => Boolean(url && url !== principal));
        return alternativa ?? null;
    }

    desplazarCarrusel(carrusel: HTMLElement, direccion: number): void {
        const contenedor = carrusel.matches('.ofertas-lista, .marcas-lista')
            ? carrusel
            : carrusel.querySelector<HTMLElement>('.ofertas-lista');
        if (!contenedor) return;
        const tarjeta = contenedor.querySelector<HTMLElement>(':scope > *');
        const ancho = tarjeta?.getBoundingClientRect().width ?? contenedor.clientWidth * 0.8;
        contenedor.scrollBy({ left: direccion * (ancho + 16), behavior: 'smooth' });
    }

    private observarSecciones(): void {
        const secciones = (this.host.nativeElement as HTMLElement).querySelectorAll('.scroll-reveal');
        if (!('IntersectionObserver' in globalThis)) {
            secciones.forEach((seccion) => seccion.classList.add('is-visible'));
            return;
        }
        const observador = new IntersectionObserver((entradas) => {
            for (const entrada of entradas) {
                if (!entrada.isIntersecting) continue;
                entrada.target.classList.add('is-visible');
                observador.unobserve(entrada.target);
            }
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
        secciones.forEach((seccion) => observador.observe(seccion));
        this.destroyRef.onDestroy(() => observador.disconnect());
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

    nombreMarca(producto: Producto): string {
        if (!producto.marca) return '';
        return typeof producto.marca === 'string' ? producto.marca : producto.marca.nombre ?? '';
    }

    descuento(producto: Producto): number {
        const precioAnterior = producto.precioAnterior;
        const tieneDescuento = precioAnterior !== undefined && precioAnterior > producto.precio;
        if (tieneDescuento && precioAnterior) {
            return Number(producto.descuentoPorcentaje) || Math.round(((precioAnterior - producto.precio) / precioAnterior) * 100);
        }
        return Number(producto.descuentoPorcentaje) || 0;
    }

    precioAnterior(producto: Producto): number {
        const precioAnterior = producto.precioAnterior;
        return precioAnterior && precioAnterior > producto.precio ? precioAnterior : producto.precio;
    }
}
