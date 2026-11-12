import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { mensajeError, formatearFecha } from '../../utils/format';

type Seccion = 'producto' | 'categorias' | 'marcas' | 'mensajes' | 'datos';
interface Entidad { _id: string; nombre: string; descripcion?: string; activo?: boolean; orden?: number; }
interface Mensaje { _id: string; nombre: string; email: string; telefono?: string; mensaje: string; estado: 'nuevo' | 'atendido'; createdAt: string; }
const productoVacio = () => ({ nombre: '', descripcion: '', descripcionCorta: '', categoria: '', marca: '', precio: null as number | null, precioAnterior: null as number | null, stock: 0 as number | null, imagen: '', destacado: false, enPromocion: false, activo: true });

export function imagenValida(value: string): boolean {
  if (!value || /[\u0000-\u001f\\]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.includes('..');
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}

@Component({ selector: 'app-gestion-catalogo', imports: [FormsModule], templateUrl: './gestion.html', styleUrl: './gestion.scss' })
export class GestionCatalogo {
  private api = inject(ApiService);
  readonly productoCreado = output<void>();
  readonly seccion = signal<Seccion>('producto');
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly categorias = signal<Entidad[]>([]);
  readonly marcas = signal<Entidad[]>([]);
  readonly mensajes = signal<Mensaje[]>([]);
  readonly solicitudesDatos = signal<any[]>([]);
  readonly paginaDatos = signal(1);
  readonly paginasDatos = signal(0);
  respuestasDatos: Record<string, string> = {};
  readonly paginaMensajes = signal(1);
  readonly paginasMensajes = signal(0);
  readonly editandoId = signal<string | null>(null);
  readonly categoriasPermitidas = ['rostro', 'ojos', 'labios', 'shampoo', 'acondicionador', 'tratamientos'];
  readonly categoriasNuevas = computed(() => this.categoriasPermitidas.filter(nombre => !this.categorias().some(item => item.nombre === nombre)));
  readonly activas = computed(() => this.categorias().filter(item => item.activo !== false));
  readonly marcasActivas = computed(() => this.marcas().filter(item => item.activo !== false));
  readonly formatearFecha = formatearFecha;
  readonly imagenValida = imagenValida;
  producto = productoVacio();
  entidad = { nombre: '', descripcion: '', orden: 0 as number | null, activo: true };

  ngOnInit(): void { void this.cargar(); }
  async cargar(): Promise<void> {
    this.cargando.set(true); this.error.set(null);
    const [categories, brands] = await Promise.all([this.api.getAdminCategories(), this.api.getAdminBrands()]);
    if (!categories.ok || !brands.ok) {
      this.error.set(mensajeError(!categories.ok ? categories : brands, 'No se pudieron cargar las categorías y marcas.'));
      this.cargando.set(false); return;
    }
    this.categorias.set(categories.data?.categories ?? []); this.marcas.set(brands.data?.brands ?? []);
    this.cargando.set(false);
  }
  cambiarSeccion(value: Seccion): void {
    if (this.guardando()) return;
    this.seccion.set(value); this.editandoId.set(null); this.entidad = { nombre: '', descripcion: '', orden: 0, activo: true };
    this.error.set(null); this.aviso.set(null);
    if (value === 'mensajes') void this.cargarMensajes(1);
    if (value === 'datos') void this.cargarSolicitudes(1);
  }
  async crearProducto(): Promise<void> {
    if (this.guardando() || this.cargando()) return;
    this.error.set(null); this.aviso.set(null);
    const p = this.producto;
    if (p.nombre.trim().length < 2 || p.descripcion.trim().length < 10 || !this.activas().some(c => c._id === p.categoria) || !this.marcasActivas().some(m => m._id === p.marca)) {
      this.error.set('Completa el nombre, una descripción de al menos 10 caracteres, una categoría y una marca activas.'); return;
    }
    if (p.precio === null || !Number.isSafeInteger(p.precio) || p.precio < 0 || p.stock === null || !Number.isSafeInteger(p.stock) || p.stock < 0) {
      this.error.set('El precio y el stock deben ser números enteros no negativos.'); return;
    }
    if (p.precioAnterior !== null && (!Number.isSafeInteger(p.precioAnterior) || p.precioAnterior <= p.precio)) {
      this.error.set('El precio anterior debe ser un entero mayor que el precio actual.'); return;
    }
    if (!imagenValida(p.imagen.trim())) { this.error.set('Usa una URL HTTP(S) o una ruta local válida para la imagen.'); return; }
    this.guardando.set(true);
    const response = await this.api.createAdminProduct({
      nombre: p.nombre.trim(), descripcion: p.descripcion.trim(), descripcionCorta: p.descripcionCorta.trim(), precio: p.precio,
      ...(p.precioAnterior !== null ? { precioAnterior: p.precioAnterior } : {}), stock: p.stock, categoria: p.categoria, marca: p.marca,
      imagenes: [{ url: p.imagen.trim(), alt: p.nombre.trim(), esPrincipal: true }], destacado: p.destacado, enPromocion: p.enPromocion, activo: p.activo,
    });
    this.guardando.set(false);
    if (!response.ok) { this.error.set(mensajeError(response, 'No se pudo crear el producto.')); return; }
    this.producto = productoVacio(); this.aviso.set('Producto creado. Ya puedes consultarlo en la sección Productos.'); this.productoCreado.emit();
  }
  editarEntidad(value: Entidad): void {
    if (this.guardando()) return;
    this.editandoId.set(value._id);
    this.entidad = { nombre: value.nombre, descripcion: value.descripcion ?? '', orden: value.orden ?? 0, activo: value.activo !== false };
    this.error.set(null); this.aviso.set(null);
  }
  cancelarEdicion(): void { this.editandoId.set(null); this.entidad = { nombre: '', descripcion: '', orden: 0, activo: true }; }
  async guardarEntidad(): Promise<void> {
    if (this.guardando() || this.cargando()) return;
    const category = this.seccion() === 'categorias';
    if (!category && this.seccion() !== 'marcas') return;
    this.error.set(null); this.aviso.set(null);
    const body = { nombre: this.entidad.nombre.trim(), descripcion: this.entidad.descripcion.trim(), orden: this.entidad.orden, activo: this.entidad.activo };
    if (body.nombre.length < 2 || body.orden === null || !Number.isSafeInteger(body.orden) || body.orden < 0 || (category && !this.categoriasPermitidas.includes(body.nombre))) {
      this.error.set('Revisa el nombre y un orden entero no negativo.'); return;
    }
    const id = this.editandoId();
    this.guardando.set(true);
    const response = category
      ? (id ? await this.api.updateAdminCategory(id, body) : await this.api.createAdminCategory(body))
      : (id ? await this.api.updateAdminBrand(id, body) : await this.api.createAdminBrand(body));
    this.guardando.set(false);
    if (!response.ok) { this.error.set(mensajeError(response, 'No se pudo guardar.')); return; }
    this.cancelarEdicion();
    await this.cargar();
    this.aviso.set(category ? 'Categoría guardada.' : 'Marca guardada.');
  }
  async cargarMensajes(page: number): Promise<void> {
    if (this.guardando()) return;
    this.cargando.set(true); this.error.set(null);
    const response = await this.api.getAdminContacts({ page, limit: 20 });
    this.cargando.set(false);
    if (!response.ok) { this.error.set(mensajeError(response, 'No pudimos cargar los mensajes.')); return; }
    this.mensajes.set(response.data?.contacts ?? []); this.paginaMensajes.set(page); this.paginasMensajes.set(response.data?.pages ?? 0);
  }
  async marcarMensaje(value: Mensaje): Promise<void> {
    if (this.guardando()) return;
    this.guardando.set(true); this.error.set(null);
    const estado = value.estado === 'nuevo' ? 'atendido' : 'nuevo';
    const response = await this.api.updateAdminContact(value._id, estado);
    this.guardando.set(false);
    if (!response.ok) { this.error.set(mensajeError(response, 'No se pudo actualizar el mensaje.')); return; }
    this.mensajes.update(items => items.map(item => item._id === value._id ? { ...item, estado } : item));
    this.aviso.set('Estado del mensaje actualizado.');
  }
  async cargarSolicitudes(page: number): Promise<void> {
    if (this.guardando()) return;
    this.cargando.set(true); this.error.set(null);
    const response = await this.api.getAdminDataRequests({page,limit:20});
    this.cargando.set(false);
    if (!response.ok) { this.error.set(mensajeError(response, 'No se pudieron cargar las solicitudes.')); return; }
    this.solicitudesDatos.set(response.data?.requests ?? []); this.paginaDatos.set(page); this.paginasDatos.set(response.data?.pages ?? 0);
  }
  async responderSolicitud(id: string): Promise<void> {
    const respuesta = (this.respuestasDatos[id] ?? '').trim();
    if (this.guardando() || respuesta.length < 10) return;
    this.guardando.set(true); this.error.set(null);
    const response = await this.api.resolveDataRequest(id, respuesta);
    this.guardando.set(false);
    if (!response.ok) { this.error.set(mensajeError(response, 'No se pudo guardar la respuesta.')); return; }
    this.respuestasDatos[id] = ''; await this.cargarSolicitudes(this.paginaDatos()); this.aviso.set('Respuesta registrada. Comprueba que las actuaciones indicadas se hayan realizado.');
  }
}
