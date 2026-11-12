import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { mensajeError } from '../utils/format';

@Component({ selector: 'app-contacto', imports: [FormsModule], templateUrl: './contacto.html', styleUrl: './contacto.scss' })
export class Contacto {
  private api = inject(ApiService);
  readonly enviando = signal(false);
  readonly enviado = signal(false);
  readonly error = signal<string | null>(null);
  nombre = ''; email = ''; telefono = ''; mensaje = ''; website = ''; consentimiento = false;
  async enviar(): Promise<void> {
    if (this.enviando() || this.enviado()) return;
    const body = { nombre: this.nombre.trim(), email: this.email.trim(), telefono: this.telefono.trim(), mensaje: this.mensaje.trim(), website: this.website, consentimiento: this.consentimiento };
    if (body.nombre.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.mensaje.length < 10 || body.mensaje.length > 2000 || !this.consentimiento) {
      this.error.set('Completa tu nombre, un correo válido, un mensaje de al menos 10 caracteres y la autorización de contacto.'); return;
    }
    this.error.set(null); this.enviando.set(true);
    const response = await this.api.createContact(body);
    this.enviando.set(false);
    if (!response.ok) { this.error.set(mensajeError(response, 'No pudimos enviar tu mensaje. Conservamos lo que escribiste para que puedas reintentar.')); return; }
    this.enviado.set(true); this.mensaje = '';
  }
}
