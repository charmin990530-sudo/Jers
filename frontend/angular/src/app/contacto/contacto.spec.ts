import { TestBed } from '@angular/core/testing';
import { Contacto } from './contacto';
import { ApiService } from '../services/api.service';

describe('Formulario de contacto', () => {
  let form: Contacto; let api: jasmine.SpyObj<ApiService>;
  beforeEach(() => {
    api=jasmine.createSpyObj('ApiService',['createContact']);
    TestBed.configureTestingModule({providers:[{provide:ApiService,useValue:api}]});
    form=TestBed.runInInjectionContext(()=>new Contacto());
    Object.assign(form,{nombre:'Cliente Prueba',email:'cliente@example.com',mensaje:'Consulta sobre una compra de prueba',consentimiento:true});
  });
  it('requiere autorización antes de enviar los datos',async()=>{
    form.consentimiento=false; await form.enviar(); expect(api.createContact).not.toHaveBeenCalled();
  });
  it('conserva el mensaje si falla la red',async()=>{
    api.createContact.and.resolveTo({ok:false,msg:'Sin conexión',data:{status:0}});
    await form.enviar(); expect(form.enviado()).toBeFalse(); expect(form.mensaje).toContain('compra');
  });
  it('evita duplicados mientras el envío está en curso y después de confirmarlo',async()=>{
    let resolve!: (value:any)=>void;
    api.createContact.and.returnValue(new Promise(done=>resolve=done));
    const first=form.enviar(); await form.enviar(); expect(api.createContact).toHaveBeenCalledTimes(1);
    resolve({ok:true,data:{}}); await first; await form.enviar(); expect(api.createContact).toHaveBeenCalledTimes(1); expect(form.enviado()).toBeTrue();
  });
});
