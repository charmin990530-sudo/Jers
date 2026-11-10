import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { ApiService } from './api.service';

describe('Contrato HTTP de Angular', () => {
  let api: ApiService;
  let fetchMock: jasmine.Spy;
  let doc: { cookie: string; defaultView: any; querySelector: () => null };
  beforeEach(() => {
    doc = { cookie: 'jers_csrf=token-prueba', defaultView: { location: { origin: 'http://localhost:3000' }, dispatchEvent: jasmine.createSpy() }, querySelector: () => null };
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: doc }] });
    api = TestBed.inject(ApiService);
    fetchMock = spyOn(globalThis, 'fetch');
  });

  it('rechaza HTML con estado 200 en vez de fingir un catálogo vacío exitoso', async () => {
    fetchMock.and.resolveTo(new Response('<html>Angular</html>', { status: 200 }));
    const result = await api.getProducts();
    expect(result.ok).toBeFalse();
    expect(result.data.code).toBe('INVALID_RESPONSE');
  });

  it('acepta una respuesta legítima sin contenido', async () => {
    fetchMock.and.resolveTo(new Response(null, { status: 204 }));
    expect((await api.clearCart()).ok).toBeTrue();
  });

  it('envía la cookie de sesión, el token CSRF y la clave de idempotencia al crear un pedido', async () => {
    fetchMock.and.resolveTo(Response.json({ success: true, order: { _id: 'orden' } }));
    await api.createOrder({ notas: 'Prueba' }, { idempotencyKey: 'checkout-prueba' });
    const [url, options] = fetchMock.calls.mostRecent().args;
    expect(url).toBe('http://localhost:3000/api/orders');
    expect(options.credentials).toBe('include');
    expect(options.headers['X-CSRF-Token']).toBe('token-prueba');
    expect(options.headers['Idempotency-Key']).toBe('checkout-prueba');
    expect(JSON.parse(options.body).notas).toBe('Prueba');
  });

  it('no descarta un formulario multipart ni fuerza su content-type', async () => {
    fetchMock.and.resolveTo(Response.json({ success: true }));
    const body = new FormData(); body.append('nombre', 'Prueba');
    await api.request('/contact', { method: 'POST', body });
    const options = fetchMock.calls.mostRecent().args[1];
    expect(options.body).toBe(body);
    expect(options.headers['Content-Type']).toBeUndefined();
  });

  it('conserva la sesión visible cuando el servidor no pudo cerrarla', async () => {
    const usuario = { id: 'prueba', nombre: 'Cliente' };
    api.usuario.set(usuario);
    fetchMock.and.rejectWith(new TypeError('Sin conexión'));
    expect((await api.logout()).ok).toBeFalse();
    expect(api.usuario()).toBe(usuario);
  });

  it('borra usuario y contador cuando el cierre sí se confirma', async () => {
    api.usuario.set({ id: 'prueba' }); api.carritoCantidad.set(3);
    fetchMock.and.resolveTo(Response.json({ success: true }));
    expect((await api.logout()).ok).toBeTrue();
    expect(api.usuario()).toBeNull();
    expect(api.carritoCantidad()).toBe(0);
  });

  it('recupera CSRF si la cookie no se puede decodificar', async () => {
    doc.cookie = 'jers_csrf=%XX';
    fetchMock.and.callFake(async (url: string) => {
      if (url.endsWith('/auth/csrf')) doc.cookie = 'jers_csrf=nuevo';
      return Response.json({ success: true });
    });
    const result = await api.request('/contact', { method: 'POST', body: {} });
    expect(result.ok).toBeTrue();
    expect(fetchMock.calls.mostRecent().args[1].headers['X-CSRF-Token']).toBe('nuevo');
  });

  it('una consulta de sesión antigua no borra un inicio de sesión más reciente', async () => {
    let terminar!: (response: Response) => void;
    fetchMock.and.callFake(async (url: string) => {
      if (url.endsWith('/auth/me')) return new Promise<Response>(resolve => terminar = resolve);
      if (url.endsWith('/auth/login')) return Response.json({ user: { id: 'nuevo', nombre: 'Cliente' } });
      return Response.json({ cart: { totalItems: 0 } });
    });
    const consultaAntigua = api.getMe();
    await api.login({ email: 'cliente@example.com', password: 'Prueba123!' });
    terminar(Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Sin sesión' } }, { status: 401 }));
    await consultaAntigua;
    expect(api.usuario()?.id).toBe('nuevo');
  });

  it('una consulta antigua no restaura el usuario después de cerrar sesión', async () => {
    let terminar!: (response: Response) => void;
    api.usuario.set({ id: 'anterior' });
    fetchMock.and.callFake(async (url: string) => url.endsWith('/auth/me')
      ? new Promise<Response>(resolve => terminar = resolve)
      : Response.json({ success: true }));
    const consultaAntigua = api.getMe();
    await api.logout();
    terminar(Response.json({ user: { id: 'anterior' } }));
    await consultaAntigua;
    expect(api.usuario()).toBeNull();
  });

  it('una respuesta antigua de carrito no repone su contador después de cerrar sesión', async () => {
    let terminar!: (response: Response) => void;
    api.usuario.set({ id: 'cliente' });
    fetchMock.and.callFake(async (url: string) => url.endsWith('/cart')
      ? new Promise<Response>(resolve => terminar = resolve)
      : Response.json({ success: true }));
    const consultaAntigua = api.getCart();
    await api.logout();
    terminar(Response.json({ cart: { totalItems: 4 } }));
    await consultaAntigua;
    expect(api.carritoCantidad()).toBe(0);
  });
});
