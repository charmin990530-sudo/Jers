import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../services/api.service';
import { Estudio } from './estudio';
import { RULES } from './makeup-state';

describe('Experiencia del estudio y conexión con carrito', () => {
  function setup(logged = false) {
    const api = jasmine.createSpyObj('ApiService', ['startStudioAttempt', 'updateStudioStep', 'completeStudioAttempt', 'getStudioRewards', 'getStudioProducts', 'addToCart']);
    api.usuario = signal(logged ? { id: 'ficticio' } : null); api.estaLogueado = () => !!api.usuario();
    api.getStudioRewards.and.resolveTo({ ok: true, data: { rewards: [] } });
    api.startStudioAttempt.and.resolveTo({ ok: true, data: { attempt: { id: 'attempt-ficticio', revision: 0 } } });
    let revision = 0;
    api.updateStudioStep.and.callFake(async () => ({ ok: true, data: { revision: ++revision } }));
    api.completeStudioAttempt.and.resolveTo({ ok: true, data: { rewards: [] } });
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiService, useValue: api }] });
    const studio = TestBed.runInInjectionContext(() => new Estudio()); studio.ready.set(true);
    return { api, studio };
  }
  it('se juega sin cuenta y no envía el look al servidor', async () => {
    const { api, studio } = setup();
    studio.apply(); expect(studio.options().length).toBe(1);
    await studio.finish(); expect(studio.finished()).toBeTrue();
    expect(api.startStudioAttempt).not.toHaveBeenCalled(); expect(api.updateStudioStep).not.toHaveBeenCalled();
    studio.undo(); expect(studio.options().length).toBe(0); expect(studio.finished()).toBeFalse();
  });
  it('solo termina el reto tras cumplir los cuatro pasos', async () => {
    const { studio } = setup(); studio.selectMode('natural');
    expect(studio.canFinish()).toBeFalse();
    for (const step of RULES.challenges[0].steps) {
      studio.selectTool(step.category); studio.shade.set(step.shades[0]); studio.intensity.set(Math.round((step.min + step.max) / 2)); studio.apply();
    }
    expect(studio.progress()).toBe(4); await studio.finish(); expect(studio.finished()).toBeTrue();
    studio.remove(); expect(studio.progress()).toBe(3); expect(studio.finished()).toBeFalse();
  });
  it('un fallo al registrar actividad no simula un premio ganado', async () => {
    const { api, studio } = setup(true);
    api.startStudioAttempt.and.resolveTo({ ok: false, msg: 'Servicio no disponible', data: {} });
    studio.apply(); await studio.finish();
    expect(studio.finished()).toBeFalse(); expect(studio.serverError()).toContain('Servicio no disponible');
    expect(api.completeStudioAttempt).not.toHaveBeenCalled();
    expect(studio.options().length).toBe(1);
  });
  it('añade un producto con la API existente, sin enviar precio ni descuento', async () => {
    const { api, studio } = setup(true);
    api.addToCart.and.resolveTo({ ok: true, data: { cart: { totalItems: 1 } } });
    await studio.addProduct({ _id: 'labial-ficticio', nombre: 'Labial de prueba', precio: 10000, stock: 2, cosmeticType: 'labios' });
    expect(api.addToCart).toHaveBeenCalledWith({ productoId: 'labial-ficticio', cantidad: 1 });
    expect(studio.message()).toContain('añadido'); expect(studio.adding()).toBe('');
  });
  it('muestra el error real de stock y permite reintentar', async () => {
    const { api, studio } = setup(true);
    api.addToCart.and.resolveTo({ ok: false, msg: 'Stock insuficiente', data: {} });
    await studio.addProduct({ _id: 'labial-ficticio', nombre: 'Labial de prueba', precio: 10000, stock: 2, cosmeticType: 'labios' });
    expect(studio.message()).toBe('Stock insuficiente'); expect(studio.adding()).toBe('');
  });
});
