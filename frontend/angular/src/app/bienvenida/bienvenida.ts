import { afterNextRender, Component, computed, ElementRef, inject, NgZone, OnDestroy, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScrollVideo } from './scroll-video';

@Component({
  selector: 'app-bienvenida',
  imports: [RouterLink],
  templateUrl: './bienvenida.html',
  styleUrl: './bienvenida.scss',
})
export class Bienvenida implements OnDestroy {
  private zone = inject(NgZone);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private film = viewChild.required<ElementRef<HTMLVideoElement>>('film');
  private video?: ScrollVideo;
  private cleanup?: () => void;
  private disposed = false;
  readonly loading = signal(true);
  readonly loadProgress = signal(0);
  readonly progress = signal(0);
  readonly reducedMotion = signal(false);
  readonly videoReady = signal(false);
  readonly chapter = computed(() => Math.min(2, Math.floor(this.progress() * 3)));
  readonly chapters = [
    { label: '01 / LA BIENVENIDA', title: 'Tu universo,', accent: 'a un paso.', description: 'Hay lugares que te hacen sentir tú. Bienvenida a By Jers.' },
    { label: '02 / CRUZA LA PUERTA', title: 'Entra.', accent: 'Inspírate.', description: 'Un espacio para descubrir el color, las texturas y tus próximos favoritos.' },
    { label: '03 / ESTÁS EN CASA', title: 'La belleza', accent: 'empieza en ti.', description: 'Maquillaje y cuidado capilar. Elige lo que va contigo.' },
  ];
  readonly current = computed(() => this.chapters[this.chapter()]);

  constructor() {
    afterNextRender(() => this.zone.runOutsideAngular(() => this.init()));
  }

  goToChapter(index: number): void {
    const section = this.host.nativeElement.querySelector<HTMLElement>('.story-scroll');
    if (!section) return;
    const distance = section.offsetHeight - innerHeight;
    window.scrollTo({ top: section.getBoundingClientRect().top + scrollY + distance * index / 2, behavior: this.reducedMotion() ? 'instant' : 'smooth' });
  }

  ngOnDestroy(): void { this.disposed = true; this.cleanup?.(); this.video?.dispose(); }

  private init(): void {
    const section = this.host.nativeElement.querySelector<HTMLElement>('.story-scroll')!;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const started = performance.now();
    let frame = 0;
    let reveal: ReturnType<typeof setTimeout> | undefined;
    let activeSource: string | undefined;
    let scrollDistance = 0;
    const unlock = () => {
      if (!this.disposed) this.zone.run(() => { this.loadProgress.set(100); this.loading.set(false); });
    };
    // Nunca se bloquea el scroll del documento ni el acceso directo al catálogo.
    const watchdog = setTimeout(unlock, 4500);
    const update = () => {
      frame = 0;
      const distance = Math.max(1, section.offsetHeight - innerHeight);
      if (!media.matches && scrollDistance && Math.abs(distance - scrollDistance) > 1) {
        // WebKit puede ajustar el scroll antes de emitir resize. Conservar el
        // avance con el rango anterior evita perderlo al girar el dispositivo.
        scrollDistance = distance;
        const top = section.getBoundingClientRect().top + scrollY;
        window.scrollTo({ top: top + this.progress() * distance, behavior: 'instant' });
        schedule(); return;
      }
      scrollDistance = distance;
      const bounds = section.getBoundingClientRect();
      const p = media.matches ? 1 : Math.min(1, Math.max(0, -bounds.top / distance));
      this.video?.seek(p);
      this.zone.run(() => this.progress.set(p));
    };
    const schedule = () => { if (!frame && !this.disposed) frame = requestAnimationFrame(update); };
    const configure = () => {
      const source = media.matches ? '' : innerHeight > innerWidth && innerWidth <= 600 ? '/video/jers-store-entry-mobile-v1.mp4' : innerHeight > innerWidth ? '/video/jers-store-entry-tablet-v1.mp4' : '/video/jers-store-entry-v1.mp4';
      if (source === activeSource) { schedule(); return; }
      activeSource = source;
      this.video?.dispose();
      this.video = undefined;
      this.zone.run(() => { this.reducedMotion.set(media.matches); this.videoReady.set(false); });
      if (media.matches) { clearTimeout(watchdog); unlock(); schedule(); return; }
      const instance = new ScrollVideo(this.film().nativeElement, ready => {
        if (!this.disposed && this.video === instance) this.zone.run(() => this.videoReady.set(ready));
      });
      this.video = instance;
      this.zone.run(() => this.loadProgress.set(35));
      instance.seek(this.progress());
      void instance.start(source).then(() => {
        if (this.disposed || this.video !== instance) return;
        this.zone.run(() => this.loadProgress.set(95));
        reveal = setTimeout(() => { clearTimeout(watchdog); unlock(); schedule(); }, Math.max(0, 800 - (performance.now() - started)));
      });
      schedule();
    };
    const resize = () => {
      configure(); schedule();
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    media.addEventListener('change', configure);
    this.cleanup = () => {
      clearTimeout(watchdog); clearTimeout(reveal); cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', resize);
      media.removeEventListener('change', configure);
    };
    configure();
  }
}
