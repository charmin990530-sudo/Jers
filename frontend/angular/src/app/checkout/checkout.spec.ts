import { TestBed } from '@angular/core/testing';
import { Checkout } from './checkout';
import { ApiResponse, ApiService } from '../services/api.service';
import { provideRouter } from '@angular/router';

describe('Confirmación de pedidos Angular', () => {
  it('cotiza el premio con el servidor antes de enviar su ID y el total confirmado', async () => {
    const api = jasmine.createSpyObj('ApiService', ['getCart', 'createOrder', 'refrescarCarrito']);
    api.getCart.and.resolveTo({ ok: true, data: { cart: { items: [{ _id: 'item' }], total: 60000, descuento: 5000 } } });
    api.createOrder.and.resolveTo({ ok: true, data: { order: { id: 'pedido' } } }); api.refrescarCarrito.and.resolveTo();
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    const checkout = TestBed.runInInjectionContext(() => new Checkout());
    await checkout.aplicarPremio('premio-ficticio');
    expect(api.getCart).toHaveBeenCalledWith('premio-ficticio'); expect(checkout.carrito()?.descuento).toBe(5000);
    Object.assign(checkout.envio, { nombreCompleto: 'Cliente Prueba', telefono: '3111234567', direccion: 'Calle ficticia 10', ciudad: 'Bogotá', departamento: 'Cundinamarca' });
    await checkout.confirmar();
    expect(api.createOrder.calls.first().args[0].rewardId).toBe('premio-ficticio');
    expect(api.createOrder.calls.first().args[0].expectedTotal).toBe(60000);
  });
  it('un premio rechazado no cambia el total ni el premio previamente seleccionado', async () => {
    const api = jasmine.createSpyObj('ApiService', ['getCart']);
    api.getCart.and.resolveTo({ ok: false, msg: 'El subtotal debe superar $150.000', data: {} });
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    const checkout = TestBed.runInInjectionContext(() => new Checkout()); checkout.carrito.set({ total: 50000 });
    await checkout.aplicarPremio('premio-no-aplicable');
    expect(checkout.carrito()?.total).toBe(50000); expect(checkout.premioElegido()).toBe('');
    expect(checkout.errorPremios()).toContain('$150.000'); expect(checkout.calculandoPremio()).toBeFalse();
  });
  it('actualiza el total que cambió y espera otra confirmación sin perder el formulario', async () => {
    const api = jasmine.createSpyObj('ApiService', ['createOrder', 'getCart', 'refrescarCarrito']);
    api.createOrder.and.resolveTo({ ok: false, msg: 'El total cambió. Revisa y confirma nuevamente.', data: { code: 'PRICE_CHANGED', status: 409 } });
    api.getCart.and.resolveTo({ ok: true, data: { cart: { items: [{ _id: 'item' }], total: 65000 } } });
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    const checkout = TestBed.runInInjectionContext(() => new Checkout());
    checkout.carrito.set({ items: [{ _id: 'item' }], total: 50000 });
    Object.assign(checkout.envio, { nombreCompleto: 'Cliente Prueba', telefono: '3111234567', direccion: 'Calle 10 número 20', ciudad: 'Bogotá', departamento: 'Cundinamarca' });
    await checkout.confirmar();
    expect(api.createOrder.calls.first().args[0].expectedTotal).toBe(50000);
    expect(api.createOrder).toHaveBeenCalledTimes(1);
    expect(checkout.carrito()?.total).toBe(65000);
    expect(checkout.envio.direccion).toBe('Calle 10 número 20');
    expect(checkout.error()).toContain('total cambió');
    expect(checkout.exito()).toBeFalse();
  });
  it('precarga la dirección principal del usuario autenticado', async () => {
    const principal = { _id: 'office', alias: 'Oficina', nombreCompleto: 'Ana Prueba', telefono: '3111111111', direccion: 'Carrera 20 número 30', ciudad: 'Bogotá', departamento: 'Cundinamarca', esPrincipal: true };
    const api = jasmine.createSpyObj('ApiService', ['getCart', 'usuario', 'getStudioRewards']);
    api.getStudioRewards.and.resolveTo({ ok: true, data: { rewards: [] } });
    api.getCart.and.resolveTo({ ok: true, data: { cart: { items: [], total: 0 } } });
    api.usuario.and.returnValue({ nombre: 'Ana', apellido: 'Prueba', direcciones: [{ ...principal, _id: 'home', alias: 'Casa', esPrincipal: false }, principal] });
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    const checkout = TestBed.runInInjectionContext(() => new Checkout());
    await checkout.cargar();
    expect(checkout.direccionElegida).toBe('office');
    expect(checkout.envio.direccion).toBe(principal.direccion);
    expect(checkout.envio.alias).toBe('Oficina');
  });

  it('limpia los datos de la dirección al volver a envío manual', () => {
    const address = { _id: 'saved', alias: 'Oficina', nombreCompleto: 'Otra Persona', telefono: '3111111111', direccion: 'Carrera 20 número 30', ciudad: 'Bogotá', departamento: 'Cundinamarca', codigoPostal: '110111' };
    const api = jasmine.createSpyObj('ApiService', ['usuario']);
    api.usuario.and.returnValue({ nombre: 'Ana', apellido: 'Prueba', telefono: '3000000000', direcciones: [address] });
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    const checkout = TestBed.runInInjectionContext(() => new Checkout());
    checkout.seleccionarDireccion('saved'); checkout.seleccionarDireccion('');
    expect(checkout.envio.nombreCompleto).toBe('Ana Prueba');
    expect(checkout.envio.telefono).toBe('3000000000');
    expect(checkout.envio.direccion).toBe(''); expect(checkout.envio.codigoPostal).toBe('');
  });

  it('conserva el formulario y los datos cuando hay un error de validación', async () => {
    const api = jasmine.createSpyObj('ApiService', ['getCart', 'usuario', 'getStudioRewards']);
    api.getStudioRewards.and.resolveTo({ ok: true, data: { rewards: [] } });
    api.getCart.and.resolveTo({ ok: true, data: { cart: { items: [{ _id: 'item', cantidad: 1 }], total: 25000 } } });
    api.usuario.and.returnValue({ nombre: 'Cliente', direcciones: [] });
    TestBed.configureTestingModule({ imports: [Checkout], providers: [provideRouter([]), { provide: ApiService, useValue: api }] });
    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges(); await fixture.whenStable();
    fixture.componentInstance.envio.direccion = 'Calle de prueba';
    await fixture.componentInstance.confirmar();
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[name="direccion"]').value).toBe('Calle de prueba');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Revisa los datos');
  });

  it('envía una sola solicitud aunque se confirme dos veces mientras responde el servidor', async () => {
    let terminar!: (result: ApiResponse) => void;
    const api = jasmine.createSpyObj('ApiService', ['createOrder', 'refrescarCarrito']);
    api.createOrder.and.returnValue(new Promise(resolve => terminar = resolve));
    api.refrescarCarrito.and.resolveTo();
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    const checkout = TestBed.runInInjectionContext(() => new Checkout());
    Object.assign(checkout.envio, { nombreCompleto: 'Cliente Prueba', telefono: '3111234567', direccion: 'Calle 10 número 20', ciudad: 'Bogotá', departamento: 'Cundinamarca' });
    const primero = checkout.confirmar();
    await checkout.confirmar();
    expect(api.createOrder).toHaveBeenCalledTimes(1);
    terminar({ ok: true, msg: '', data: { order: { _id: 'pedido-prueba' } } });
    await primero;
    await checkout.confirmar();
    expect(api.createOrder).toHaveBeenCalledTimes(1);
    expect(checkout.exito()).toBeTrue();
  });
});
