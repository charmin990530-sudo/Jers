import { afterNextRender, Component, DestroyRef, ElementRef, inject, NgZone, signal, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { PortraitEngine } from './portrait-engine';

export const PORTRAIT_CATEGORIES = [
    { slug: 'cabello', label: 'Cabello', accessible: 'Explorar cuidado capilar', detail: 'Cuida lo que te hace brillar.', u: .76, v: .26 },
    { slug: 'ojos', label: 'Ojos', accessible: 'Explorar maquillaje para ojos', detail: 'Una mirada que lo dice todo.', u: .40, v: .43 },
    { slug: 'rostro', label: 'Rostro', accessible: 'Explorar maquillaje para rostro', detail: 'Tu piel, en su mejor luz.', u: .35, v: .57 },
    { slug: 'labios', label: 'Labios', accessible: 'Explorar labiales', detail: 'Encuentra tu próximo color favorito.', u: .51, v: .65 },
] as const;
type Category = typeof PORTRAIT_CATEGORIES[number];

@Component({
    selector: 'app-living-portrait',
    templateUrl: './living-portrait.html',
    styleUrl: './living-portrait.scss',
})
export class LivingPortrait {
    @ViewChild('stage') private stage!: ElementRef<HTMLElement>;
    @ViewChild('canvas') private canvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('fallback') private fallback!: ElementRef<HTMLImageElement>;
    private router = inject(Router);
    private destroyRef = inject(DestroyRef);
    private zone = inject(NgZone);
    private engine?: PortraitEngine;
    private navigationTimer?: ReturnType<typeof setTimeout>;
    private destroyed = false;
    private reducedMotion = false;
    readonly categories = PORTRAIT_CATEGORIES;
    readonly selected = signal<Category | null>(null);
    readonly highlighted = signal<Category | null>(null);
    readonly motion = signal(true);
    readonly error = signal('');

    constructor() {
        this.destroyRef.onDestroy(() => {
            this.destroyed = true; clearTimeout(this.navigationTimer); this.engine?.destroy();
        });
        afterNextRender(() => {
            const preference = matchMedia('(prefers-reduced-motion: reduce)');
            this.reducedMotion = preference.matches; this.motion.set(!preference.matches);
            const change = () => {
                this.reducedMotion = preference.matches;
                if (preference.matches) { this.motion.set(false); this.engine?.setMotion(false); }
            };
            preference.addEventListener('change', change);
            this.destroyRef.onDestroy(() => preference.removeEventListener('change', change));
            this.zone.runOutsideAngular(() => {
                this.engine = new PortraitEngine(this.stage.nativeElement, this.canvas.nativeElement, this.fallback.nativeElement);
                void this.engine.start(this.motion());
            });
        });
    }

    toggleMotion(): void {
        this.motion.update(value => !value);
        this.engine?.setMotion(this.motion());
    }

    choose(event: MouseEvent, category: Category): void {
        // Preserve open-in-new-tab and the native link when modifier keys are used.
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        if (this.selected()) return;
        this.error.set(''); this.selected.set(category);
        this.engine?.setMotion(false);
        if (this.reducedMotion || !this.motion()) { void this.openCategory(category); return; }
        this.navigationTimer = setTimeout(() => void this.openCategory(category), 760);
    }

    private async openCategory(category: Category): Promise<void> {
        try {
            const navigated = await this.router.navigate(['/catalogo', category.slug]);
            if (!navigated && !this.destroyed) this.resetSelection();
        } catch {
            if (!this.destroyed) this.resetSelection();
        }
    }

    private resetSelection(): void {
        this.selected.set(null); this.engine?.setMotion(this.motion());
        this.error.set('No se pudo abrir la categoría. Inténtalo otra vez.');
    }
}
