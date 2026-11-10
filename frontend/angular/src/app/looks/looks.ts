import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { formatearPrecio, mensajeError } from '../utils/format';

interface Look {
    id: number;
    nombre: string;
    descripcion: string;
    imagen: string;
    tags: string[];
}

interface ProductoLook {
    _id?: string;
    id?: string;
    nombre: string;
    precio: number;
    imagen?: string;
    imagenPrincipal?: string;
    imagenes?: { url?: string; esPrincipal?: boolean }[];
    stock?: number;
}

const LOOKS: Look[] = [
    {
        id: 1,
        nombre: 'Glow natural',
        descripcion: 'Piel luminosa, labios suaves y un acabado que se siente como tu propia piel. Ideal para todos los días.',
        imagen: '/img/hero/soficora.webp',
        tags: ['Nude', 'Luminoso', 'Día'],
    },
    {
        id: 2,
        nombre: 'Noche intensa',
        descripcion: 'Ojos protagonistas con sombras cálidas y un delineado que sostiene la mirada hasta el final de la noche.',
        imagen: '/img/hero-secuencia/frame_0034.webp',
        tags: ['Ojos', 'Ahumado', 'Noche'],
    },
    {
        id: 3,
        nombre: 'Labios que hablan',
        descripcion: 'Un labial mate de larga duración para un look mínimo con un gesto de color muy claro.',
        imagen: '/img/hero-secuencia/frame_0059.webp',
        tags: ['Labios', 'Mate', 'Editorial'],
    },
    {
        id: 4,
        nombre: 'Base impecable',
        descripcion: 'Cobertura modulable y textura ligera para una piel uniforme sin perder la naturalidad.',
        imagen: '/img/hero-secuencia/frame_0087.webp',
        tags: ['Rostro', 'Cobertura', 'Natural'],
    },
    {
        id: 5,
        nombre: 'Ritual capilar',
        descripcion: 'Limpieza profunda y nutrición para devolverle el movimiento y el brillo a tu cabello.',
        imagen: '/img/hero-secuencia/frame_0115.webp',
        tags: ['Cabello', 'Hidratación', 'Rutina'],
    },
    {
        id: 6,
        nombre: 'Edición regalo',
        descripcion: 'Una selección de favoritos para regalar o regalarte. Detalles que siempre suman.',
        imagen: '/img/hero-secuencia/frame_0148.webp',
        tags: ['Regalo', 'Favoritos', 'Selección'],
    },
];

@Component({
    selector: 'app-looks',
    imports: [RouterLink],
    templateUrl: './looks.html',
    styleUrl: './looks.scss',
})
export class Looks {
    private api = inject(ApiService);
    private router = inject(Router);

    readonly looks = LOOKS;
    readonly actual = signal(0);
    readonly productos = signal<ProductoLook[]>([]);
    readonly cargandoProductos = signal(true);
    readonly errorProductos = signal<string | null>(null);
    readonly aviso = signal<string | null>(null);
    readonly agregandoId = signal<string | null>(null);
    readonly favoritos = signal<Set<string>>(new Set());
    readonly formatearPrecio = formatearPrecio;

    readonly lookActivo = computed(() => this.looks[this.actual()] ?? this.looks[0]);
    readonly total = this.looks.length;

    private inicioX = 0;
    private arrastrando = false;
    private ultimoWheel = 0;
    private timeoutArrastre: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        void this.cargarProductos();
    }

    async cargarProductos(): Promise<void> {
        this.cargandoProductos.set(true);
        this.errorProductos.set(null);
        const respuesta = await this.api.getProducts({ limit: 8 });
        if (!respuesta.ok) {
            this.errorProductos.set(mensajeError(respuesta, 'No se pudieron cargar los productos del look.'));
            this.cargandoProductos.set(false);
            return;
        }
        const lista: any[] = Array.isArray(respuesta.data?.products) ? respuesta.data.products : [];
        this.productos.set(lista.filter((p) => p && (p._id || p.id)).slice(0, 8));
        this.cargandoProductos.set(false);
    }

    siguiente(): void {
        this.actual.update((indice) => (indice + 1) % this.total);
    }

    anterior(): void {
        this.actual.update((indice) => (indice - 1 + this.total) % this.total);
    }

    irA(indice: number): void {
        if (indice < 0 || indice >= this.total) return;
        this.actual.set(indice);
    }

    alPresionar(event: PointerEvent): void {
        this.arrastrando = true;
        this.inicioX = event.clientX;
        if (this.timeoutArrastre) clearTimeout(this.timeoutArrastre);
    }

    alSoltar(event: PointerEvent): void {
        if (!this.arrastrando) return;
        this.arrastrando = false;
        const delta = event.clientX - this.inicioX;
        if (Math.abs(delta) > 48) {
            if (delta < 0) this.siguiente();
            else this.anterior();
        }
    }

    alCancelarArrastre(): void {
        this.arrastrando = false;
    }

    alRodar(event: WheelEvent): void {
        event.preventDefault();
        const ahora = Date.now();
        if (ahora - this.ultimoWheel < 420) return;
        this.ultimoWheel = ahora;
        if (event.deltaY > 0 || event.deltaX > 0) this.siguiente();
        else if (event.deltaY < 0 || event.deltaX < 0) this.anterior();
    }

    alTeclear(event: KeyboardEvent): void {
        const objetivo = event.target as HTMLElement | null;
        const editable = !!objetivo && (objetivo.tagName === 'INPUT' || objetivo.tagName === 'TEXTAREA' || objetivo.tagName === 'SELECT' || !!objetivo.isContentEditable);
        if (editable) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            event.preventDefault();
            this.siguiente();
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            event.preventDefault();
            this.anterior();
        }
    }

    imagenProducto(producto: ProductoLook): string {
        const imagenes = producto.imagenes ?? [];
        const principal = imagenes.find((i) => i?.esPrincipal) ?? imagenes[0];
        const candidatas = [producto.imagen, producto.imagenPrincipal, principal?.url];
        for (const candidata of candidatas) {
            const url = String(candidata ?? '').trim();
            if (url.startsWith('/') && !url.startsWith('//')) return url;
            try {
                const parsed = new URL(url);
                if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href;
            } catch {
                /* sin imagen válida */
            }
        }
        return '/img/placeholder.svg';
    }

    idProducto(producto: ProductoLook): string {
        return producto._id ?? producto.id ?? '';
    }

    esFavorito(producto: ProductoLook): boolean {
        return this.favoritos().has(this.idProducto(producto));
    }

    alternarFavorito(producto: ProductoLook): void {
        const id = this.idProducto(producto);
        if (!id) return;
        this.favoritos.update((favoritos) => {
            const siguiente = new Set(favoritos);
            if (siguiente.has(id)) siguiente.delete(id);
            else siguiente.add(id);
            return siguiente;
        });
    }

    async agregarAlCarrito(producto: ProductoLook): Promise<void> {
        const id = this.idProducto(producto);
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
}
