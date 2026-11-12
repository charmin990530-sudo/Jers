import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { mensajeError } from '../utils/format';
import { returnPath } from '../utils/return-path';

type Modo = 'login' | 'registro' | 'recuperar' | 'reset-password';

@Component({
    selector: 'app-auth',
    imports: [FormsModule, RouterLink],
    templateUrl: './auth.html',
    styleUrl: './auth.scss',
})
export class Auth {
    private api = inject(ApiService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    readonly modo = signal<Modo>('login');
    readonly cargando = signal(false);
    readonly error = signal<string | null>(null);
    readonly exito = signal(false);
    readonly verPassword = signal(false);
    // Aviso neutro (no es un error): el endpoint de recuperacion responde
    // igual exista o no la cuenta, y el mensaje tiene que decirlo igual para
    // no convertir la pantalla en un oracle de correos registrados.
    readonly aviso = signal<string | null>(null);
    readonly tokenRecuperacion = signal<string | null>(null);

    email = '';
    password = '';
    confirmarPassword = '';
    nombre = '';
    apellido = '';
    telefono = '';
    aceptoTerminos = false;
    aceptoPrivacidad = false;

    ngOnInit(): void {
        this.aplicarModo();
    }

    /** El modo sale de la ruta, asi que la misma pantalla sirve para las cuatro. */
    private aplicarModo(): void {
        const modo = this.route.snapshot.data?.['modo'];
        if (modo === 'registro' || modo === 'recuperar' || modo === 'reset-password') {
            this.modo.set(modo);
        }
        if (modo === 'reset-password') {
            this.tokenRecuperacion.set(this.route.snapshot.queryParamMap.get('token'));
            // Conservar el token solo en memoria; quitarlo de la entrada de historial.
            const url = new URL(window.location.href);
            url.searchParams.delete('token');
            window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        }
    }

    cambiarModo(modo: Modo): void {
        this.modo.set(modo);
        this.error.set(null);
        this.aviso.set(null);
        this.exito.set(false);
    }

    async enviar(): Promise<void> {
        if (this.cargando()) return;
        this.error.set(null);

        if (this.modo() === 'login') {
            await this.ingresar();
            return;
        }
        if (this.modo() === 'registro') {
            await this.registrar();
            return;
        }
        if (this.modo() === 'recuperar') {
            await this.pedirEnlace();
            return;
        }
        await this.cambiarPassword();
    }

    private async ingresar(): Promise<void> {
        if (!this.email.trim() || !this.password) {
            this.error.set('Email y contraseña son obligatorios.');
            return;
        }

        this.cargando.set(true);
        const respuesta = await this.api.login({ email: this.email.trim(), password: this.password });
        this.cargando.set(false);

        if (!respuesta.ok) {
            this.error.set(mensajeError(respuesta, 'No se pudo iniciar sesión.'));
            return;
        }

        this.exito.set(true);
        this.irAlDestino();
    }

    private async registrar(): Promise<void> {
        if (!this.nombre.trim() || !this.apellido.trim()) {
            this.error.set('Nombre y apellido son obligatorios.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
            this.error.set('Ingresa un email válido.');
            return;
        }
        if (this.password.length < 8 || new TextEncoder().encode(this.password).length > 72) {
            this.error.set('Usa al menos 8 caracteres y hasta 72 bytes UTF-8 para la contraseña.');
            return;
        }
        if (!this.aceptoTerminos || !this.aceptoPrivacidad) {
            this.error.set('Debes aceptar los términos y la política de privacidad.');
            return;
        }

        this.cargando.set(true);
        const registro = await this.api.register({
            nombre: this.nombre.trim(),
            apellido: this.apellido.trim(),
            email: this.email.trim(),
            password: this.password,
            telefono: this.telefono.trim() || undefined,
            aceptoTerminos: true,
            aceptoPrivacidad: true,
        });

        if (!registro.ok) {
            this.cargando.set(false);
            this.error.set(mensajeError(registro, 'No se pudo crear la cuenta.'));
            return;
        }

        const sesion = await this.api.login({ email: this.email.trim(), password: this.password });
        this.cargando.set(false);

        if (!sesion.ok) {
            this.modo.set('login');
            this.error.set('Revisa tus datos para iniciar sesión o solicita recuperar el acceso.');
            return;
        }

        this.exito.set(true);
        this.irAlDestino();
    }

    /**
     * Pide el enlace de recuperacion.
     *
     * El servidor responde SIEMPRE con exito, exista o no la cuenta: decir
     * "no hay ninguna cuenta con ese correo" permitiria recorrer una lista de
     * correos y descubrir quien es cliente de la tienda. Por eso el mensaje que
     * se muestra aqui no depende del resultado.
     */
    private async pedirEnlace(): Promise<void> {
        const email = this.email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.error.set('Ingresa un email válido.');
            return;
        }

        this.cargando.set(true);
        const respuesta = await this.api.forgotPassword(email);
        this.cargando.set(false);

        if (!respuesta.ok) {
            this.error.set(mensajeError(respuesta, 'No se pudo enviar el correo de recuperación.'));
            return;
        }

        this.aviso.set(
            'Si ese correo tiene una cuenta, te enviamos un enlace para restablecer la contraseña. Revisa también la carpeta de spam.',
        );
    }

    /**
     * Cambia la contraseña con el token que llega en el enlace del correo.
     *
     * El backend deja al cliente con sesión iniciada (devuelve la cookie de
     * sesión), así que después de cambiar la contraseña se refresca la sesión
     * en el cliente antes de llevarle a la tienda.
     */
    private async cambiarPassword(): Promise<void> {
        const token = this.tokenRecuperacion();
        if (!token) {
            this.error.set('El enlace no es válido o ya caducó. Pide uno nuevo.');
            return;
        }
        if (this.password.length < 8 || new TextEncoder().encode(this.password).length > 72) {
            this.error.set('Usa al menos 8 caracteres y hasta 72 bytes UTF-8 para la contraseña.');
            return;
        }
        if (this.password !== this.confirmarPassword) {
            this.error.set('Las contraseñas no coinciden.');
            return;
        }

        this.cargando.set(true);
        const respuesta = await this.api.resetPassword({
            token,
            password: this.password,
            confirmPassword: this.confirmarPassword,
        });
        this.cargando.set(false);

        if (!respuesta.ok) {
            this.error.set(mensajeError(respuesta, 'No se pudo cambiar la contraseña.'));
            return;
        }

        await this.api.getMe();
        this.exito.set(true);
        this.aviso.set('Tu contraseña quedó actualizada. Entrando…');
        setTimeout(() => void this.router.navigateByUrl('/tienda'), 1200);
    }

    private irAlDestino(): void {
        const destino = this.obtenerDestino();
        void this.router.navigateByUrl(destino);
    }

    private obtenerDestino(): string {
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        return returnPath(redirect || '/tienda');
    }
}
