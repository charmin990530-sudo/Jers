import { Component, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';

@Component({ selector: 'app-mis-datos', imports: [FormsModule, RouterLink], styleUrl: './cuenta.scss', template: `
  <section class="editor-page">
    <p class="eyebrow">Tu información</p><h1>Mis datos y solicitudes</h1>
    <p class="intro">Puedes corregir tu perfil y direcciones, descargar tus datos de cuenta o pedir una revisión del tratamiento.</p>
    <nav class="editor-nav"><a routerLink="/perfil">Mi perfil</a><a routerLink="/direcciones">Mis direcciones</a></nav>
    @if (error()) { <p class="message error" role="alert">{{ error() }}</p> }
    @if (aviso()) { <p class="message" role="status">{{ aviso() }}</p> }
    @if (login()) { <a class="btn" routerLink="/login" [queryParams]="{redirect:'/mis-datos'}">Ingresar</a> }
    @else {
      <div class="panel">
        <label class="field">Confirma tu contraseña actual<input type="password" name="currentPassword" [(ngModel)]="password" autocomplete="current-password" maxlength="72" /></label>
        <p class="muted">El archivo contiene datos personales. Se descarga en tu dispositivo; guárdalo en un lugar privado. No contiene contraseñas ni tokens.</p>
        <div class="actions"><button class="btn" type="button" [disabled]="ocupado() || !password" (click)="descargar()">Descargar mis datos</button></div>
      </div>
      <form class="panel" (ngSubmit)="solicitar()">
        <h2>Solicitar una revisión</h2>
        <p class="muted">La solicitud requiere revisión del responsable. No borra datos automáticamente. Algunos datos de pedidos pueden requerir conservación; recibirás una respuesta en esta página.</p>
        <label class="field">Tipo<select name="tipo" [(ngModel)]="tipo"><option value="acceso">Acceso o información adicional</option><option value="supresion">Supresión de datos</option><option value="revocacion">Revocación de autorización</option></select></label>
        <label class="field">Detalle opcional<textarea name="mensaje" [(ngModel)]="mensaje" maxlength="500" rows="3"></textarea><small>No incluyas documentos de identidad, contraseñas ni datos de otras personas.</small></label>
        <div class="actions"><button class="btn" type="submit" [disabled]="ocupado() || !password">Registrar solicitud</button></div>
      </form>
      <div class="panel"><h2>Mis solicitudes</h2><button class="btn secondary" type="button" [disabled]="ocupado()" (click)="cargar()">Actualizar solicitudes</button>
      @for (item of solicitudes(); track item._id) { <article><h3>{{ item.tipo }} · {{ item.estado }}</h3><p>{{ item.respuesta || 'Pendiente de revisión por el responsable.' }}</p></article> }
      @empty { <p class="muted">No tienes solicitudes registradas.</p> }</div>
    }
  </section>` })
export class MisDatos {
  private api = inject(ApiService);
  private doc = inject(DOCUMENT);
  readonly ocupado = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly login = signal(false);
  readonly solicitudes = signal<any[]>([]);
  password = ''; mensaje = ''; tipo: 'acceso' | 'supresion' | 'revocacion' = 'acceso';
  ngOnInit(): void { void this.cargar(); }
  async cargar(): Promise<void> {
    const response = await this.api.getDataRequests();
    this.login.set(response.data?.status === 401);
    if (!response.ok) { this.error.set(response.msg); return; }
    this.solicitudes.set(response.data?.requests ?? []);
  }
  async descargar(): Promise<void> {
    if (this.ocupado() || !this.password) return;
    this.ocupado.set(true); this.error.set(null); this.aviso.set(null);
    const response = await this.api.exportData(this.password);
    this.password = ''; this.ocupado.set(false);
    if (!response.ok) { this.error.set(response.msg); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(response.data.export, null, 2)], {type:'application/json'}));
    const link = this.doc.createElement('a'); link.href = url; link.download = 'by-jers-mis-datos.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.aviso.set(response.data.export.parcial ? 'Descarga parcial. Solicita acceso adicional para obtener el resto.' : 'Tus datos se descargaron en este dispositivo.');
  }
  async solicitar(): Promise<void> {
    if (this.ocupado() || !this.password) return;
    this.ocupado.set(true); this.error.set(null); this.aviso.set(null);
    const response = await this.api.requestDataAction({currentPassword:this.password,tipo:this.tipo,mensaje:this.mensaje.trim()});
    this.password = ''; this.ocupado.set(false);
    if (!response.ok) { this.error.set(response.msg); return; }
    this.mensaje = ''; this.aviso.set(response.msg); await this.cargar();
  }
}
