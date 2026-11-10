import { TestBed } from '@angular/core/testing';
import { Checkout } from './checkout';
import { ApiResponse, ApiService } from '../services/api.service';
import { provideRouter } from '@angular/router';

describe('Confirmación de pedidos Angular', () => {
  it('conserva el formulario y los datos cuando hay un error de validación', async () => {
    const api = jasmine.createSpyObj('ApiService', ['getCart', 'usuario']);
    api.getCart.and.resolveTo({ ok: true, data: { cart: { items: [{ _id: 'item', cantidad: 1 }], total: 25000 } } });
    api.usuario.and.returnValue(null);
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
