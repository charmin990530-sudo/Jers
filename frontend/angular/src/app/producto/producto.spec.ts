import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ApiService, ApiResponse } from '../services/api.service';
import { Producto } from './producto';

describe('Navegación entre productos', () => {
  it('una respuesta lenta del producto anterior no sustituye al producto actual', async () => {
    let resolveFirst!: (response: ApiResponse) => void;
    const api = jasmine.createSpyObj('ApiService', ['getProduct']);
    api.getProduct.and.callFake((id: string) => id === 'primero'
      ? new Promise<ApiResponse>(resolve => { resolveFirst = resolve; })
      : Promise.resolve({ ok: true, data: { product: { _id: 'segundo', nombre: 'Producto actual', precio: 2000 } } }));
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiService, useValue: api }, { provide: ActivatedRoute, useValue: {} }] });
    const component = TestBed.runInInjectionContext(() => new Producto());
    const first = component.cargar('primero');
    await component.cargar('segundo');
    resolveFirst({ ok: true, msg: '', data: { product: { _id: 'primero', nombre: 'Producto anterior', precio: 1000 } } });
    await first;
    expect(component.producto()?._id).toBe('segundo');
    expect(component.cargando()).toBeFalse();
  });
});
