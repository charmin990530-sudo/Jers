import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../services/api.service';
import { mensajeError } from '../utils/format';

export interface Direccion {
  _id?: string; alias: string; nombreCompleto: string; telefono: string;
  direccion: string; ciudad: string; departamento: string; codigoPostal: string; esPrincipal: boolean;
}
const nuevaDireccion = (): Direccion => ({ alias: '', nombreCompleto: '', telefono: '', direccion: '', ciudad: '', departamento: '', codigoPostal: '', esPrincipal: false });

@Component({ selector: 'app-cuenta', imports: [FormsModule, RouterLink], templateUrl: './cuenta.html', styleUrl: './cuenta.scss' })
export class Cuenta {
  readonly api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private destroy = inject(DestroyRef);
  readonly modo = signal<'perfil' | 'direcciones'>('perfil');
  readonly estado = signal<'cargando' | 'listo' | 'login' | 'error'>('cargando');
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly guardando = signal(false);
  readonly direcciones = signal<Direccion[]>([]);
  readonly formularioDireccion = signal(false);
  readonly editandoId = signal<string | null>(null);
  readonly confirmarEliminar = signal<string | null>(null);
  perfil = { nombre: '', apellido: '', telefono: '' };
  direccion = nuevaDireccion();

  ngOnInit(): void {
    this.route.data.pipe(takeUntilDestroyed(this.destroy)).subscribe(data => {
      this.modo.set(data['modo'] === 'direcciones' ? 'direcciones' : 'perfil');
      this.error.set(null); this.aviso.set(null);
    });
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.estado.set('cargando'); this.error.set(null);
    const response = await this.api.getMe();
    if (!response.ok) {
      this.estado.set(response.data?.status === 401 ? 'login' : 'error');
      this.error.set(mensajeError(response, 'No pudimos cargar tu cuenta.'));
      return;
    }
    const user = response.data?.user;
    this.perfil = { nombre: user?.nombre ?? '', apellido: user?.apellido ?? '', telefono: user?.telefono ?? '' };
    this.direcciones.set(Array.isArray(user?.direcciones) ? user.direcciones : []);
    this.estado.set('listo');
  }

  async guardarPerfil(): Promise<void> {
    if (this.guardando()) return;
    const body = { nombre: this.perfil.nombre.trim(), apellido: this.perfil.apellido.trim(), telefono: this.perfil.telefono.trim() };
    if (body.nombre.length < 2 || body.apellido.length < 2 || (body.telefono && !/^[\d\s\-+()]{7,20}$/.test(body.telefono))) {
      this.error.set('Revisa tu nombre, apellido y teléfono.'); return;
    }
    this.guardando.set(true); this.error.set(null); this.aviso.set(null);
    const response = await this.api.updateProfile(body);
    this.guardando.set(false);
    if (!response.ok) { this.fallo(response); return; }
    this.perfil = body;
    this.aviso.set('Tus datos quedaron actualizados.');
  }

  abrirDireccion(address?: Direccion): void {
    this.editandoId.set(address?._id ?? null);
    this.direccion = address ? { ...address } : { ...nuevaDireccion(), nombreCompleto: `${this.perfil.nombre} ${this.perfil.apellido}`.trim(), telefono: this.perfil.telefono };
    this.error.set(null); this.aviso.set(null); this.formularioDireccion.set(true);
  }

  async guardarDireccion(): Promise<void> {
    if (this.guardando()) return;
    const d = this.direccion;
    const body = { alias: d.alias.trim(), nombreCompleto: d.nombreCompleto.trim(), telefono: d.telefono.trim(), direccion: d.direccion.trim(), ciudad: d.ciudad.trim(), departamento: d.departamento.trim(), codigoPostal: (d.codigoPostal ?? '').trim(), esPrincipal: d.esPrincipal };
    if (body.alias.length < 2 || body.nombreCompleto.length < 2 || !/^[\d\s\-+()]{7,20}$/.test(body.telefono) || body.direccion.length < 5 || body.ciudad.length < 2 || body.departamento.length < 2) {
      this.error.set('Completa los datos de la dirección y un teléfono válido.'); return;
    }
    this.guardando.set(true); this.error.set(null); this.aviso.set(null);
    const id = this.editandoId();
    const response = id ? await this.api.updateAddress(id, body) : await this.api.addAddress(body);
    this.guardando.set(false);
    if (!response.ok) { this.fallo(response); return; }
    this.aplicarDirecciones(response.data?.direcciones);
    this.formularioDireccion.set(false);
    this.aviso.set('Dirección guardada.');
  }

  async eliminarDireccion(id: string): Promise<void> {
    if (this.guardando() || this.confirmarEliminar() !== id) return;
    this.guardando.set(true); this.error.set(null); this.aviso.set(null);
    const response = await this.api.deleteAddress(id);
    this.guardando.set(false);
    if (!response.ok) { this.fallo(response); return; }
    this.aplicarDirecciones(response.data?.direcciones);
    this.confirmarEliminar.set(null);
    if (this.editandoId() === id) this.formularioDireccion.set(false);
    this.aviso.set('Dirección eliminada.');
  }

  private aplicarDirecciones(value: unknown): void {
    this.direcciones.set(Array.isArray(value) ? value : []);
  }
  private fallo(response: any): void {
    if (response.data?.status === 401) this.estado.set('login');
    this.error.set(mensajeError(response, 'No se pudo guardar el cambio.'));
  }
}
