import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { etiquetaEstado, formatearFecha, formatearPrecio, mensajeError } from '../utils/format';
import { GestionCatalogo } from './gestion/gestion';

type Tab = 'resumen' | 'productos' | 'pedidos' | 'gestion';

interface UsuarioResumen {
    nombre?: string;
    apellido?: string;
    email?: string;
}

interface PedidoAdmin {
    _id?: string;
    numeroOrden?: string;
    estado?: string;
    estadoPago?: string;
    total?: number;
    createdAt?: string;
    usuario?: UsuarioResumen;
    items?: { nombre?: string; cantidad?: number; precioUnitario?: number }[];
}

interface ProductoAdmin {
    _id?: string;
    nombre?: string;
    precio?: number;
    stock?: number;
    activo?: boolean;
    imagenes?: { url?: string; esPrincipal?: boolean }[];
    marca?: { nombre?: string } | string;
    categoria?: { nombre?: string } | string;
}

/** Lo que el administrador puede cambiar de un producto sin salir del panel. */
interface BorradorProducto {
    precio: number;
    stock: number;
    activo: boolean;
}

interface Estadisticas {
    totalUsers?: number;
    totalProducts?: number;
    totalOrders?: number;
    totalRevenue?: number;
    revenueToday?: number;
    ordersByStatus?: Record<string, number>;
    recentOrders?: PedidoAdmin[];
}

const SIGUIENTE_ESTADO: Record<string, string> = {
    pendiente: 'confirmado',
    confirmado: 'procesando',
    procesando: 'enviado',
    enviado: 'entregado',
    entregado: 'reembolsado',
};

@Component({
    selector: 'app-admin',
    imports: [RouterLink, FormsModule, GestionCatalogo],
    templateUrl: './admin.html',
    styleUrl: './admin.scss',
})
export class Admin {
    private api = inject(ApiService);

    readonly tab = signal<Tab>('resumen');
    readonly acceso = signal<'comprobando' | 'ok' | 'login' | 'denegado'>('comprobando');
    readonly estadisticas = signal<Estadisticas | null>(null);
    readonly productos = signal<ProductoAdmin[]>([]);
    readonly pedidos = signal<PedidoAdmin[]>([]);
    readonly cargando = signal(true);
    readonly cargandoTab = signal(false);
    readonly error = signal<string | null>(null);
    readonly aviso = signal<string | null>(null);
    readonly actualizando = signal<string | null>(null);
    // Borradores de edicion: los valores que el admin esta escribiendo todavia
    // no se han guardado. Se guardan por producto para que el formulario no
    // se pise con la recarga de la lista.
    readonly borradores = signal<Record<string, BorradorProducto>>({});
    readonly guardandoId = signal<string | null>(null);

    readonly formatearPrecio = formatearPrecio;
    readonly formatearFecha = formatearFecha;
    readonly etiquetaEstado = etiquetaEstado;

    readonly pedidosPorEstado = computed(() => {
        const estados = this.estadisticas()?.ordersByStatus ?? {};
        return Object.entries(estados)
            .map(([estado, cantidad]) => ({ estado, cantidad }))
            .sort((a, b) => b.cantidad - a.cantidad);
    });

    ngOnInit(): void {
        void this.iniciar();
    }

    private async iniciar(): Promise<void> {
        this.cargando.set(true);
        this.error.set(null);

        if (!this.api.usuario()) {
            await this.api.getMe();
        }

        if (!this.api.usuario()) {
            this.acceso.set('login');
            this.cargando.set(false);
            return;
        }

        if (!this.api.esAdmin()) {
            this.acceso.set('denegado');
            this.cargando.set(false);
            return;
        }

        this.acceso.set('ok');
        await this.cargarResumen();
        this.cargando.set(false);
    }

    async cargarResumen(): Promise<void> {
        this.error.set(null);
        const respuesta = await this.api.getAdminDashboard();
        if (!respuesta.ok) {
            this.error.set(mensajeError(respuesta, 'No se pudieron cargar las estadísticas.'));
            return;
        }
        this.estadisticas.set(respuesta.data?.stats ?? null);
    }

    async actualizarCatalogo(): Promise<void> {
        await Promise.all([this.cargarProductos(), this.cargarResumen()]);
    }

    async cambiarTab(tab: Tab): Promise<void> {
        this.tab.set(tab);
        this.aviso.set(null);
        if (tab === 'productos' && this.productos().length === 0) {
            await this.cargarProductos();
        }
        if (tab === 'pedidos' && this.pedidos().length === 0) {
            await this.cargarPedidos();
        }
    }

    async cargarProductos(): Promise<void> {
        this.cargandoTab.set(true);
        this.error.set(null);
        const respuesta = await this.api.getAdminProducts({ limit: 50 });
        if (!respuesta.ok) {
            this.error.set(mensajeError(respuesta, 'No se pudieron cargar los productos.'));
            this.cargandoTab.set(false);
            return;
        }
        this.productos.set(Array.isArray(respuesta.data?.products) ? respuesta.data.products : []);
        this.cargandoTab.set(false);
    }

    async cargarPedidos(): Promise<void> {
        this.cargandoTab.set(true);
        this.error.set(null);
        const respuesta = await this.api.getAdminOrders({ limit: 50 });
        if (!respuesta.ok) {
            this.error.set(mensajeError(respuesta, 'No se pudieron cargar los pedidos.'));
            this.cargandoTab.set(false);
            return;
        }
        this.pedidos.set(Array.isArray(respuesta.data?.orders) ? respuesta.data.orders : []);
        this.cargandoTab.set(false);
    }

    nombreMarca(producto: ProductoAdmin): string {
        if (!producto.marca) return '—';
        return typeof producto.marca === 'string' ? producto.marca : producto.marca.nombre ?? '—';
    }

    nombreCategoria(producto: ProductoAdmin): string {
        if (!producto.categoria) return '—';
        return typeof producto.categoria === 'string' ? producto.categoria : producto.categoria.nombre ?? '—';
    }

    imagenProducto(producto: ProductoAdmin): string {
        const imagenes = producto.imagenes ?? [];
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

    cliente(pedido: PedidoAdmin): string {
        const usuario = pedido.usuario;
        if (!usuario) return '—';
        return `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim() || usuario.email || '—';
    }

    siguienteEstado(estado: string | undefined): string | null {
        if (!estado) return null;
        return SIGUIENTE_ESTADO[estado] ?? null;
    }

    puedeCancelar(estado: string | undefined): boolean {
        return !!estado && ['pendiente', 'confirmado', 'procesando'].includes(estado);
    }

    async actualizarEstado(pedido: PedidoAdmin, estado: string): Promise<void> {
        const id = pedido._id;
        if (!id || this.actualizando()) return;
        this.actualizando.set(id);
        this.aviso.set(null);
        const respuesta = await this.api.updateAdminOrder(id, { estado });
        this.actualizando.set(null);
        if (!respuesta.ok) {
            this.aviso.set(mensajeError(respuesta, 'No se pudo actualizar el pedido.'));
            return;
        }
        this.pedidos.update((pedidos) => pedidos.map((p) => (p._id === id ? { ...p, estado } : p)));
        this.aviso.set(`Pedido ${pedido.numeroOrden ?? ''} actualizado a ${etiquetaEstado(estado)}.`);
        await this.cargarResumen();
    }

    // -----------------------------------------------------------------
    // Edicion de productos: precio, stock y si esta activo.
    //
    // Sin esto el panel era de solo lectura: la tienda no se podia reponer ni
    // cambiar un precio, y la unica forma de arreglar un producto agotado era
    // entrar en la base de datos a mano.
    // -----------------------------------------------------------------

    private claveDe(producto: ProductoAdmin): string {
        return producto._id ?? producto.nombre ?? '';
    }

    /** Valor del campo en edicion (o el del producto si no se ha tocado). */
    valor(producto: ProductoAdmin, campo: keyof BorradorProducto): number | boolean {
        const borrador = this.borradores()[this.claveDe(producto)];
        if (borrador) return borrador[campo];
        if (campo === 'activo') return producto.activo !== false;
        return (producto[campo] as number) ?? 0;
    }

    /** Escribe en el borrador. No guarda: el guardado es explicito. */
    cambiar(producto: ProductoAdmin, campo: keyof BorradorProducto, valor: number | boolean): void {
        const clave = this.claveDe(producto);
        const base: BorradorProducto = {
            precio: Number(this.valor(producto, 'precio')) || 0,
            stock: Number(this.valor(producto, 'stock')) || 0,
            activo: this.valor(producto, 'activo') !== false,
        };
        this.borradores.update((borradores) => ({ ...borradores, [clave]: { ...base, [campo]: valor } }));
    }

    async guardarProducto(producto: ProductoAdmin): Promise<void> {
        const id = producto._id;
        if (!id || this.guardandoId()) return;

        const precio = Number(this.valor(producto, 'precio'));
        const stock = Number(this.valor(producto, 'stock'));
        const activo = this.valor(producto, 'activo') !== false;

        // Los importes son enteros (la moneda no tiene centavos) y el stock no
        // puede ser negativo: se comprueba aqui para que el error salga pegado
        // al campo y no como un 400 generico del servidor.
        if (!Number.isInteger(precio) || precio < 0) {
            this.aviso.set('El precio debe ser un número entero mayor o igual que 0.');
            return;
        }
        if (!Number.isInteger(stock) || stock < 0) {
            this.aviso.set('El stock debe ser un número entero mayor o igual que 0.');
            return;
        }

        this.guardandoId.set(id);
        this.aviso.set(null);
        const respuesta = await this.api.updateAdminProduct(id, { precio, stock, activo });
        this.guardandoId.set(null);

        if (!respuesta.ok) {
            this.aviso.set(mensajeError(respuesta, 'No se pudo guardar el producto.'));
            return;
        }

        this.productos.update((productos) => productos.map((p) => (p._id === id ? { ...p, precio, stock, activo } : p)));
        this.borradores.update((borradores) => {
            const copia = { ...borradores };
            delete copia[this.claveDe(producto)];
            return copia;
        });
        this.aviso.set(`${producto.nombre ?? 'Producto'} guardado.`);
    }
}
