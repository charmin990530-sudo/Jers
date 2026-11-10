import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './services/api.service';

@Component({
  selector: 'app-root',
  host: { class: 'liquid-ui' },
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly api = inject(ApiService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly menuAbierto = signal(false);
  readonly menuCuenta = signal(false);
  readonly errorSesion = signal<string | null>(null);
  readonly cerrandoSesion = signal(false);
  readonly anio = new Date().getFullYear();
  readonly whatsappUrl = 'https://wa.me/573114333561';

  constructor() {
    void this.api.getMe();
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((evento) => {
      if (evento instanceof NavigationEnd) {
        this.menuAbierto.set(false);
        this.menuCuenta.set(false);
      }
    });
  }

  alternarMenu(): void {
    this.menuAbierto.update((abierto) => !abierto);
  }

  alternarCuenta(): void {
    this.menuCuenta.update((abierto) => !abierto);
  }

  cerrarMenu(): void {
    this.menuAbierto.set(false);
    this.menuCuenta.set(false);
  }

  async cerrarSesion(): Promise<void> {
    if (this.cerrandoSesion()) return;
    this.cerrandoSesion.set(true);
    this.errorSesion.set(null);
    const respuesta = await this.api.logout();
    this.cerrandoSesion.set(false);
    if (!respuesta.ok) {
      this.errorSesion.set('No se pudo cerrar la sesión. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
    this.cerrarMenu();
    await this.router.navigateByUrl('/');
  }
}
