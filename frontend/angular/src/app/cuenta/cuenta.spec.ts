import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Cuenta } from './cuenta';
import { ApiService } from '../services/api.service';

describe('Cuenta y direcciones', () => {
  let cuenta: Cuenta;
  let api: any;
  beforeEach(() => {
    api = jasmine.createSpyObj('ApiService', ['getMe','updateProfile','addAddress','updateAddress','deleteAddress']);
    api.usuario = signal({ id: 'cliente' });
    TestBed.configureTestingModule({providers:[{provide:ApiService,useValue:api},{provide:ActivatedRoute,useValue:{}}]});
    cuenta = TestBed.runInInjectionContext(() => new Cuenta());
  });
  const direction = {alias:'Casa',nombreCompleto:'Cliente Prueba',telefono:'3110001234',direccion:'Calle 10 número 20',ciudad:'Bogotá',departamento:'Cundinamarca',codigoPostal:'',esPrincipal:true};
  it('no presenta un fallo de red como una cuenta vacía o sin sesión', async () => {
    api.getMe.and.resolveTo({ok:false,msg:'Sin conexión',data:{status:0}});
    await cuenta.cargar(); expect(cuenta.estado()).toBe('error'); expect(cuenta.error()).toBe('Sin conexión');
  });
  it('permite volver al login si la sesión caducó', async () => {
    api.getMe.and.resolveTo({ok:false,msg:'Sesión caducada',data:{status:401}});
    await cuenta.cargar(); expect(cuenta.estado()).toBe('login');
  });
  it('conserva los datos de perfil si el servidor rechaza el guardado', async () => {
    cuenta.perfil={nombre:'Cliente',apellido:'Prueba',telefono:''};
    api.updateProfile.and.resolveTo({ok:false,msg:'No se pudo guardar',data:{status:500}});
    await cuenta.guardarPerfil(); expect(cuenta.perfil.nombre).toBe('Cliente'); expect(cuenta.error()).toContain('guardar');
  });
  it('edita la dirección existente sin crear un duplicado', async () => {
    cuenta.abrirDireccion({...direction,_id:'direccion'});
    cuenta.direccion.ciudad='Chía';
    api.updateAddress.and.resolveTo({ok:true,data:{direcciones:[{...direction,_id:'direccion',ciudad:'Chía'}]}});
    await cuenta.guardarDireccion(); expect(api.updateAddress).toHaveBeenCalledWith('direccion',jasmine.objectContaining({ciudad:'Chía'}));
    expect(api.addAddress).not.toHaveBeenCalled(); expect(cuenta.direcciones()[0].ciudad).toBe('Chía');
  });
  it('no elimina una dirección sin la confirmación específica', async () => {
    await cuenta.eliminarDireccion('direccion'); expect(api.deleteAddress).not.toHaveBeenCalled();
    cuenta.confirmarEliminar.set('otra'); await cuenta.eliminarDireccion('direccion'); expect(api.deleteAddress).not.toHaveBeenCalled();
  });
  it('conserva las direcciones cuando falla una eliminación confirmada', async () => {
    cuenta.direcciones.set([{...direction,_id:'direccion'}]); cuenta.confirmarEliminar.set('direccion');
    api.deleteAddress.and.resolveTo({ok:false,msg:'Sin conexión',data:{status:0}});
    await cuenta.eliminarDireccion('direccion'); expect(cuenta.direcciones().length).toBe(1);
  });
});
