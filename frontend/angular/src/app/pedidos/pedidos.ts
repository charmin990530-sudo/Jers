import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { etiquetaEstado, formatearFecha, formatearPrecio, mensajeError } from '../utils/format';

interface ItemPedido {
    _id?: string;
    nombre?: string;
    cantidad?: number;
    precioUnitario?: number;
    producto?: { nombre?: string; imagenes?: { url?: string; esPrincipal?: boolean }[] };
}

interface Pedido {
    _id?: string;
    numeroOrden?: string;
    estado?: string;
    estadoPago?: string;
    items?: ItemPedido[];
    subtotal?: number;
    costoEnvio?: number;
    impuestos?: number;
    total?: number;
    createdAt?: string;
    puedeCancelar?: boolean;
}

@Component({
    selector: 'app-pedidos',
    imports: [RouterLink],
    templateUrl: './pedidos.html',
    styleUrl: './pedidos.scss',
})
export class Pedidos {
    private api = inject(ApiService);

    readonly pedidos = signal<Pedido[]>([]);
    readonly cargando = signal(true);
    readonly error = signal<string | null>(null);
    readonly requiereLogin = signal(false);
    readonly aviso = signal<string | null>(null);
    readonly cancelandoId = signal<string | null>(null);

    readonly formatearPrecio = formatearPrecio;
    readonly formatearFecha = formatearFecha;
    readonly etiquetaEstado = etiquetaEstado;

    ngOnInit(): void {
        void this.cargar();
    }

    async cargar(): Promise<void> {
        this.cargando.set(true);
        this.error.set(null);
        this.requiereLogin.set(false);
        const respuesta = await this.api.getOrders();
        if (!respuesta.ok) {
            if (respuesta.data?.status === 401) {
                this.requiereLogin.set(true);
            } else {
                this.error.set(mensajeError(respuesta, 'No se pudieron cargar los pedidos.'));
            }
            this.cargando.set(false);
            return;
        }
        const data = respuesta.data;
        this.pedidos.set(Array.isArray(data?.orders) ? data.orders : []);
        this.cargando.set(false);
    }

    async cancelar(pedido: Pedido): Promise<void> {
        const id = pedido._id;
        if (!id) return;
        if (!confirm(`¿Cancelar el pedido ${pedido.numeroOrden ?? ''}?`)) return;

        this.aviso.set(null);
        this.cancelandoId.set(id);
        const respuesta = await this.api.cancelOrder(id, 'Cancelado por el cliente');
        this.cancelandoId.set(null);
        if (!respuesta.ok) {
            this.aviso.set(mensajeError(respuesta, 'No se pudo cancelar el pedido.'));
            return;
        }
        await this.cargar();
    }

    totalItems(pedido: Pedido): number {
        return (pedido.items ?? []).reduce((total, item) => total + (item.cantidad ?? 0), 0);
    }

    nombreItem(item: ItemPedido): string {
        return item.nombre || item.producto?.nombre || 'Producto';
    }
}
