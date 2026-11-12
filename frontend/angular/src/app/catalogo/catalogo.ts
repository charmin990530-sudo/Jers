import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { formatearPrecio, mensajeError } from '../utils/format';
import { DepthCard } from '../utils/depth-card';

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

const TITULOS: Record<string, { titulo: string; descripcion: string }> = {
    labios: { titulo: 'Labios', descripcion: 'Labiales, brillos y color para expresarte a tu manera.' },
    ojos: { titulo: 'Ojos', descripcion: 'Sombras, delineadores y pestañas para una mirada única.' },
    rostro: { titulo: 'Rostro', descripcion: 'Bases, correctores, rubores e iluminadores para tu piel.' },
    maquillaje: {
        titulo: 'Maquillaje',
        descripcion: 'Color, textura y acabados para crear tu rutina ideal.',
    },
    cabello: {
        titulo: 'Cuidado capilar',
        descripcion: 'Fórmulas que limpian, hidratan y protegen tu cabello.',
    },
};

@Component({
    selector: 'app-catalogo',
    imports: [FormsModule, RouterLink, DepthCard],
    templateUrl: './catalogo.html',
    styleUrl: './catalogo.scss',
})
export class Catalogo {
    private api = inject(ApiService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private destroyRef = inject(DestroyRef);
    private solicitud = 0;
    private demoraBusqueda: ReturnType<typeof setTimeout> | undefined;

    readonly productos = signal<Producto[]>([]);
    readonly cargando = signal(true);
    readonly error = signal<string | null>(null);
    readonly aviso = signal<string | null>(null);
    readonly agregandoId = signal<string | null>(null);
    readonly busqueda = signal('');
    readonly slug = signal('maquillaje');
    readonly pagina = signal(1);
    readonly paginas = signal(0);
    readonly total = signal(0);
    readonly formatearPrecio = formatearPrecio;

    readonly titulo = computed(() => TITULOS[this.slug()]?.titulo ?? 'Catálogo');
    readonly descripcion = computed(() => TITULOS[this.slug()]?.descripcion ?? 'Productos seleccionados por By Jers.');
    ngOnInit(): void {
        this.destroyRef.onDestroy(() => {
            this.solicitud++;
            clearTimeout(this.demoraBusqueda);
        });
        this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
            const slug = params.get('slug') || 'maquillaje';
            this.slug.set(slug);
            this.busqueda.set('');
            clearTimeout(this.demoraBusqueda);
            void this.cargar(slug);
        });
    }

    buscar(valor: string): void {
        this.busqueda.set(valor);
        this.solicitud++;
        clearTimeout(this.demoraBusqueda);
        this.demoraBusqueda = setTimeout(() => void this.cargar(this.slug()), 300);
    }

    async cargar(slug: string, pagina = 1): Promise<void> {
        const solicitud = ++this.solicitud;
        this.cargando.set(true);
        this.error.set(null);
        this.aviso.set(null);
        const respuesta = await this.api.getProductsByCategory(slug, {
            page: pagina, limit: 12, search: this.busqueda().trim() || undefined,
        });
        if (solicitud !== this.solicitud) return;
        if (!respuesta.ok) {
            this.error.set(mensajeError(respuesta, 'No se pudieron cargar los productos.'));
            this.cargando.set(false);
            return;
        }
        const data = respuesta.data;
        const lista: any[] = Array.isArray(data?.products) ? data.products : [];
        this.productos.set(lista.filter((p) => p && (p._id || p.id)));
        this.pagina.set(data.page ?? pagina);
        this.paginas.set(data.pages ?? 0);
        this.total.set(data.total ?? lista.length);
        this.cargando.set(false);
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

    imagenUrl(producto: Producto): string | null {
        const imagenes = producto.imagenes ?? [];
        const principal = imagenes.find((i) => i?.esPrincipal) ?? imagenes[0];
        const candidatas = [producto.imagen, producto.imagenPrincipal, principal?.url];
        for (const candidata of candidatas) {
            const url = this.safeAssetUrl(candidata);
            if (url) return url;
        }
        return '/img/placeholder.svg';
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
