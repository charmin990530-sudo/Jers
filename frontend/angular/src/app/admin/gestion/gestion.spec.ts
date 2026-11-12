import { TestBed } from '@angular/core/testing';
import { GestionCatalogo, imagenValida } from './gestion';
import { ApiService } from '../../services/api.service';

describe('Altas del catálogo',()=>{
  let component:GestionCatalogo; let api:jasmine.SpyObj<ApiService>;
  beforeEach(()=>{
    api=jasmine.createSpyObj('ApiService',['createAdminProduct','createAdminBrand','createAdminCategory','updateAdminBrand','updateAdminCategory','getAdminBrands','getAdminCategories']);
    TestBed.configureTestingModule({providers:[{provide:ApiService,useValue:api}]});
    component=TestBed.runInInjectionContext(()=>new GestionCatalogo());
    component.cargando.set(false);component.categorias.set([{_id:'categoria',nombre:'rostro'}]);component.marcas.set([{_id:'marca',nombre:'Jers'}]);
    Object.assign(component.producto,{nombre:'Labial Prueba',descripcion:'Descripción completa del labial',categoria:'categoria',marca:'marca',precio:29000,stock:5,imagen:'/img/productos/labial-mate-lbl.webp'});
  });
  it('no acepta imágenes con esquemas ejecutables ni rutas que escapen del sitio',()=>{
    for(const value of ['javascript:alert(1)','//otro.example/imagen','/img/../privado','data:text/html,script']) expect(imagenValida(value)).toBeFalse();
    expect(imagenValida('/img/productos/labial.webp')).toBeTrue();
  });
  it('rechaza importes fraccionarios antes de crear el producto',async()=>{
    component.producto.precio=100.5; await component.crearProducto(); expect(api.createAdminProduct).not.toHaveBeenCalled();
  });
  it('rechaza un precio anterior menor que el actual',async()=>{
    component.producto.precioAnterior=25000; await component.crearProducto();expect(api.createAdminProduct).not.toHaveBeenCalled();
  });
  it('no permite crear productos con categorías inactivas',async()=>{
    component.categorias.set([{_id:'categoria',nombre:'rostro',activo:false}]); await component.crearProducto();expect(api.createAdminProduct).not.toHaveBeenCalled();
  });
  it('no pierde el formulario si falla el alta',async()=>{
    api.createAdminProduct.and.resolveTo({ok:false,msg:'Nombre duplicado',data:{status:400}});
    await component.crearProducto();expect(component.producto.nombre).toBe('Labial Prueba');expect(component.error()).toBe('Nombre duplicado');
  });
  it('envía la imagen principal y omite el precio anterior vacío',async()=>{
    api.createAdminProduct.and.resolveTo({ok:true,msg:'',data:{product:{_id:'nuevo'}}});
    await component.crearProducto();const body=api.createAdminProduct.calls.first().args[0];
    expect(body.imagenes[0].esPrincipal).toBeTrue();expect(body.precioAnterior).toBeUndefined();expect(component.producto.nombre).toBe('');
  });
});
