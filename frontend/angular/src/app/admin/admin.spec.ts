import { TestBed } from '@angular/core/testing';
import { Admin } from './admin';
import { ApiService } from '../services/api.service';

describe('Edición de productos en el panel', () => {
    let admin: Admin;
    let api: jasmine.SpyObj<ApiService>;

    beforeEach(() => {
        api = jasmine.createSpyObj('ApiService', ['getAdminDashboard', 'getAdminProducts', 'getAdminOrders', 'updateAdminProduct']);
        TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
        admin = TestBed.runInInjectionContext(() => new Admin());
    });

    const producto = { _id: 'p1', nombre: 'Labial Mate', precio: 29000, stock: 4, activo: true };

    it('envía el precio, el stock y la visibilidad al guardar', async () => {
        api.updateAdminProduct.and.resolveTo({ ok: true, msg: '', data: { product: { ...producto, precio: 25000, stock: 9 } } });

        admin.cambiar(producto as any, 'precio', 25000);
        admin.cambiar(producto as any, 'stock', 9);
        admin.cambiar(producto as any, 'activo', false);
        await admin.guardarProducto(producto as any);

        expect(api.updateAdminProduct).toHaveBeenCalledWith('p1', { precio: 25000, stock: 9, activo: false });
    });

    it('no envía un precio con decimales', async () => {
        admin.cambiar(producto as any, 'precio', 25000.5);
        await admin.guardarProducto(producto as any);

        expect(api.updateAdminProduct).not.toHaveBeenCalled();
        expect(admin.aviso()).toContain('entero');
    });

    it('no envía un stock negativo', async () => {
        admin.cambiar(producto as any, 'stock', -1);
        await admin.guardarProducto(producto as any);

        expect(api.updateAdminProduct).not.toHaveBeenCalled();
        expect(admin.aviso()).toContain('stock');
    });

    it('muestra el error del servidor sin perder lo escrito', async () => {
        api.updateAdminProduct.and.resolveTo({
            ok: false,
            msg: 'El precio anterior debe ser mayor al precio actual',
            data: { code: 'VALIDATION_ERROR', status: 400 },
        });

        admin.cambiar(producto as any, 'precio', 99000);
        await admin.guardarProducto(producto as any);

        expect(admin.aviso()).toContain('precio anterior');
        expect(admin.valor(producto as any, 'precio')).toBe(99000);
    });
});
