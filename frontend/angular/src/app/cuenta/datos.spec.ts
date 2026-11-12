import { TestBed } from '@angular/core/testing';
import { MisDatos } from './datos';
import { ApiService } from '../services/api.service';
describe('Gestión de datos personales',()=>{
  let component: MisDatos;let api:any;
  beforeEach(()=>{
    api=jasmine.createSpyObj('ApiService',['getDataRequests','exportData','requestDataAction']);
    TestBed.configureTestingModule({providers:[{provide:ApiService,useValue:api}]});
    component=TestBed.runInInjectionContext(()=>new MisDatos());
  });
  it('no exporta ni registra solicitudes sin confirmar la contraseña',async()=>{
    await component.descargar();await component.solicitar();expect(api.exportData).not.toHaveBeenCalled();expect(api.requestDataAction).not.toHaveBeenCalled();
  });
  it('descarta la contraseña introducida si se rechaza la exportación',async()=>{
    component.password='Ficticia-de-prueba';api.exportData.and.resolveTo({ok:false,msg:'Confirma tu contraseña'});
    await component.descargar();expect(component.password).toBe('');expect(component.aviso()).toBeNull();expect(component.error()).toContain('contraseña');
  });
  it('una solicitud de supresión queda registrada para revisión sin prometer borrado',async()=>{
    component.password='Ficticia-de-prueba';component.tipo='supresion';component.mensaje='Revisar datos.';
    api.requestDataAction.and.resolveTo({ok:true,msg:'Solicitud registrada para revisión'});api.getDataRequests.and.resolveTo({ok:true,data:{requests:[{tipo:'supresion',estado:'pendiente'}]}});
    await component.solicitar();expect(api.requestDataAction).toHaveBeenCalledWith({currentPassword:'Ficticia-de-prueba',tipo:'supresion',mensaje:'Revisar datos.'});expect(component.password).toBe('');expect(component.solicitudes()[0].estado).toBe('pendiente');
  });
  it('solicita iniciar sesión cuando la API rechaza el acceso',async()=>{
    api.getDataRequests.and.resolveTo({ok:false,msg:'Sin sesión',data:{status:401}});await component.cargar();expect(component.login()).toBeTrue();expect(component.solicitudes()).toEqual([]);
  });
});
