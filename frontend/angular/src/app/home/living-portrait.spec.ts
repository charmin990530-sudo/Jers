import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LivingPortrait, PORTRAIT_CATEGORIES } from './living-portrait';
import { PortraitEngine } from './portrait-engine';

describe('LivingPortrait', () => {
    let navigate: jasmine.Spy;
    beforeEach(async () => {
        navigate = jasmine.createSpy('navigate').and.resolveTo(true);
        spyOn(PortraitEngine.prototype, 'start').and.resolveTo();
        spyOn(PortraitEngine.prototype, 'destroy');
        await TestBed.configureTestingModule({ imports: [LivingPortrait], providers: [{ provide: Router, useValue: { navigate } }] }).compileComponents();
    });

    it('ofrece enlaces nativos y accesibles para las cuatro categorías reales', () => {
        const fixture = TestBed.createComponent(LivingPortrait); fixture.detectChanges();
        const links = fixture.nativeElement.querySelectorAll('.portrait-zone') as NodeListOf<HTMLAnchorElement>;
        expect(links.length).toBe(4);
        links.forEach((link, index) => {
            expect(link.getAttribute('href')).toBe('/catalogo/' + PORTRAIT_CATEGORIES[index].slug);
            expect(link.getAttribute('aria-label')).toBeTruthy();
        });
    });

    it('acerca la zona y navega una sola vez ante clics repetidos', fakeAsync(() => {
        const fixture = TestBed.createComponent(LivingPortrait); fixture.detectChanges();
        const component = fixture.componentInstance;
        component.motion.set(true);
        component.choose(new MouseEvent('click', { cancelable: true }), PORTRAIT_CATEGORIES[3]);
        component.choose(new MouseEvent('click'), PORTRAIT_CATEGORIES[0]);
        expect(component.selected()?.slug).toBe('labios'); expect(navigate).not.toHaveBeenCalled();
        tick(760); flushMicrotasks();
        expect(navigate).toHaveBeenCalledOnceWith(['/catalogo', 'labios']);
    }));

    it('respeta abrir el enlace en otra pestaña', () => {
        const fixture = TestBed.createComponent(LivingPortrait); fixture.detectChanges();
        const event = new MouseEvent('click', { ctrlKey: true, cancelable: true });
        fixture.componentInstance.choose(event, PORTRAIT_CATEGORIES[3]);
        expect(event.defaultPrevented).toBeFalse(); expect(navigate).not.toHaveBeenCalled();
    });

    it('navega sin espera cuando el movimiento está pausado', fakeAsync(() => {
        const fixture = TestBed.createComponent(LivingPortrait); fixture.detectChanges();
        fixture.componentInstance.motion.set(false);
        fixture.componentInstance.choose(new MouseEvent('click'), PORTRAIT_CATEGORIES[1]); flushMicrotasks();
        expect(navigate).toHaveBeenCalledOnceWith(['/catalogo', 'ojos']);
    }));

    it('cancela la navegación pendiente si se desmonta el componente', fakeAsync(() => {
        const fixture = TestBed.createComponent(LivingPortrait); fixture.detectChanges();
        fixture.componentInstance.choose(new MouseEvent('click'), PORTRAIT_CATEGORIES[2]);
        fixture.destroy(); tick(1000);
        expect(navigate).not.toHaveBeenCalled(); expect(PortraitEngine.prototype.destroy).toHaveBeenCalled();
    }));

    it('permite reintentar cuando falla la navegación', fakeAsync(() => {
        navigate.and.rejectWith(new Error('fallo de navegación'));
        const fixture = TestBed.createComponent(LivingPortrait); fixture.detectChanges();
        fixture.componentInstance.motion.set(false);
        fixture.componentInstance.choose(new MouseEvent('click'), PORTRAIT_CATEGORIES[0]); flushMicrotasks();
        expect(fixture.componentInstance.selected()).toBeNull(); expect(fixture.componentInstance.error()).toContain('Inténtalo otra vez');
    }));
});
