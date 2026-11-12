import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone } from '@angular/core';

/** Pointer tilt and a travelling studio reflection; touch and reduced motion stay still. */
@Directive({ selector: '[appDepth]', host: { class: 'depth-card' } })
export class DepthCard {
  private host = inject(ElementRef) as ElementRef<HTMLElement>;
  private zone = inject(NgZone);
  private destroy = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.zone.runOutsideAngular(() => {
      const element = this.host.nativeElement;
      const preference = matchMedia('(prefers-reduced-motion: reduce)');
      let frame = 0, x = .5, y = .5;
      const reset = () => {
        cancelAnimationFrame(frame); frame = 0;
        element.style.removeProperty('--depth-x'); element.style.removeProperty('--depth-y');
        element.style.removeProperty('--shine-x'); element.style.removeProperty('--shine-y');
      };
      const move = (event: PointerEvent) => {
        if (preference.matches || event.pointerType !== 'mouse') return;
        const bounds = element.getBoundingClientRect();
        x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
        y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          element.style.setProperty('--depth-x', `${(y - .5) * -7}deg`);
          element.style.setProperty('--depth-y', `${(x - .5) * 7}deg`);
          element.style.setProperty('--shine-x', `${x * 100}%`);
          element.style.setProperty('--shine-y', `${y * 100}%`);
        });
      };
      element.addEventListener('pointermove', move, { passive: true });
      element.addEventListener('pointerleave', reset);
      preference.addEventListener('change', reset);
      this.destroy.onDestroy(() => {
        reset(); element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', reset);
        preference.removeEventListener('change', reset);
      });
    }));
  }
}
