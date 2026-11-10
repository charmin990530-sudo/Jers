import { TestBed } from '@angular/core/testing';
import { Carrito } from './carrito';
import { ApiService, ApiResponse } from '../services/api.service';

describe('Consistencia del carrito Angular', () => {
  let carrito: Carrito;
  let api: jasmine.SpyObj<ApiService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('ApiService', ['updateCartItem', 'removeFromCart', 'clearCart']);
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    carrito = TestBed.runInInjectionContext(() => new Carrito());
  });

  it('no envía cantidades superiores a 99 ni al stock', async () => {
    await carrito.actualizarCantidad({ _id: 'item', cantidad: 99, producto: { stock: 200 } }, 1);
    await carrito.actualizarCantidad({ _id: 'item', cantidad: 4, producto: { stock: 4 } }, 1);
    expect(api.updateCartItem).not.toHaveBeenCalled();
  });

  it('impide que quitar o vaciar se solapen con una actualización pendiente', async () => {
    let terminar!: (result: ApiResponse) => void;
    api.updateCartItem.and.returnValue(new Promise(resolve => terminar = resolve));
    const actualizando = carrito.actualizarCantidad({ _id: 'item', cantidad: 1 }, 1);
    await carrito.quitar({ _id: 'otro' });
    await carrito.limpiar();
    expect(api.removeFromCart).not.toHaveBeenCalled();
    expect(api.clearCart).not.toHaveBeenCalled();
    terminar({ ok: true, msg: '', data: { cart: { items: [] } } });
    await actualizando;
    expect(carrito.actualizandoId()).toBeNull();
  });
});
