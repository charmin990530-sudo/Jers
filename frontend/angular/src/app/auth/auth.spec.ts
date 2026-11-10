import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { Auth } from './auth';
import { ApiService } from '../services/api.service';

const rutaDe = (modo: string, query: Record<string, string> = {}): ActivatedRoute => ({
  snapshot: {
    data: { modo },
    queryParamMap: convertToParamMap(query),
  },
}) as unknown as ActivatedRoute;

describe('Recuperación de contraseña', () => {
  let api: jasmine.SpyObj<ApiService>;

  const crear = (modo: string, query: Record<string, string> = {}) => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ActivatedRoute, useValue: rutaDe(modo, query) },
      ],
    });
    const componente = TestBed.runInInjectionContext(() => new Auth());
    componente.ngOnInit();
    return componente;
  };

  beforeEach(() => {
    api = jasmine.createSpyObj('ApiService', ['forgotPassword', 'resetPassword', 'getMe', 'login', 'register']);
    api.getMe.and.resolveTo({ ok: true, msg: '', data: {} });
  });

  it('pide el enlace con el correo escrito', async () => {
    api.forgotPassword.and.resolveTo({ ok: true, msg: '', data: {} });
    const auth = crear('recuperar');
    auth.email = 'cliente@ejemplo.com';

    await auth.enviar();

    expect(api.forgotPassword).toHaveBeenCalledWith('cliente@ejemplo.com');
    expect(auth.aviso()).toContain('Si ese correo tiene una cuenta');
    expect(auth.error()).toBeNull();
  });

  it('no pide el enlace con un correo que no es válido', async () => {
    const auth = crear('recuperar');
    auth.email = 'esto-no-es-un-correo';

    await auth.enviar();

    expect(api.forgotPassword).not.toHaveBeenCalled();
    expect(auth.error()).toContain('email válido');
  });

  it('rechaza un enlace sin token antes de llamar al servidor', async () => {
    const auth = crear('reset-password');

    await auth.enviar();

    expect(api.resetPassword).not.toHaveBeenCalled();
    expect(auth.error()).toContain('no es válido');
  });

  it('cambia la contraseña con el token del enlace', async () => {
    api.resetPassword.and.resolveTo({ ok: true, msg: '', data: {} });
    const auth = crear('reset-password', { token: 'abc123' });
    auth.password = 'NuevaClave2026';
    auth.confirmarPassword = 'NuevaClave2026';

    await auth.enviar();

    expect(api.resetPassword).toHaveBeenCalledWith({
      token: 'abc123',
      password: 'NuevaClave2026',
      confirmPassword: 'NuevaClave2026',
    });
    expect(auth.error()).toBeNull();
  });

  it('avisa cuando las dos contraseñas no coinciden', async () => {
    const auth = crear('reset-password', { token: 'abc123' });
    auth.password = 'NuevaClave2026';
    auth.confirmarPassword = 'OtraClave2026';

    await auth.enviar();

    expect(api.resetPassword).not.toHaveBeenCalled();
    expect(auth.error()).toContain('no coinciden');
  });

  it('muestra el error del servidor cuando el token caducó', async () => {
    api.resetPassword.and.resolveTo({
      ok: false,
      msg: 'Token inválido o expirado',
      data: { code: 'INVALID_RESET_TOKEN', status: 400 },
    });
    const auth = crear('reset-password', { token: 'caducado' });
    auth.password = 'NuevaClave2026';
    auth.confirmarPassword = 'NuevaClave2026';

    await auth.enviar();

    expect(auth.error()).toContain('expirado');
    expect(auth.aviso()).toBeNull();
  });
});
