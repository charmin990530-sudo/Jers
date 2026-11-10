import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Catalogo } from './catalogo';
import { ApiResponse, ApiService } from '../services/api.service';

describe('Navegación y paginación del catálogo Angular', () => {
  let catalogo: Catalogo;
  let api: jasmine.SpyObj<ApiService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('ApiService', ['getProductsByCategory']);
    TestBed.configureTestingModule({ providers: [
      { provide: ApiService, useValue: api }, { provide: ActivatedRoute, useValue: {} }, { provide: Router, useValue: {} },
    ] });
    catalogo = TestBed.runInInjectionContext(() => new Catalogo());
  });

  it('ignora una categoría antigua si su respuesta llega después de la categoría nueva', async () => {
    let terminar!: (result: ApiResponse) => void;
    api.getProductsByCategory.and.returnValues(new Promise(resolve => terminar = resolve), Promise.resolve({ ok: true, msg: '', data: { products: [{ _id: 'cabello', nombre: 'Shampoo' }], page: 1, pages: 1, total: 1 } }));
    const antiguo = catalogo.cargar('maquillaje');
    await catalogo.cargar('cabello');
    terminar({ ok: true, msg: '', data: { products: [{ _id: 'maquillaje', nombre: 'Labial' }] } });
    await antiguo;
    expect(catalogo.productos()[0]._id).toBe('cabello');
  });

  it('envía la página y busca en el servidor para encontrar productos fuera de la página actual', async () => {
    api.getProductsByCategory.and.resolveTo({ ok: true, msg: '', data: { products: [], page: 2, pages: 4, total: 45 } });
    catalogo.busqueda.set('labial');
    await catalogo.cargar('maquillaje', 2);
    expect(api.getProductsByCategory).toHaveBeenCalledWith('maquillaje', { page: 2, limit: 12, search: 'labial' });
    expect(catalogo.pagina()).toBe(2);
    expect(catalogo.paginas()).toBe(4);
    expect(catalogo.total()).toBe(45);
  });
});
