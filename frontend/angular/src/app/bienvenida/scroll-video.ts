/** Una sola decodificación/seek en vuelo; el destino más reciente siempre gana. */
export class ScrollVideo {
  private target = 0;
  private disposed = false;
  private failed = false;
  private announced = false;
  private timer?: ReturnType<typeof setTimeout>;
  private finish?: (ready: boolean) => void;
  private readonly loaded = () => {
    if (this.disposed || this.failed) return;
    this.flush();
    if (this.video.readyState >= 2 && !this.announced) {
      this.announced = true;
      this.onReady(true);
      this.settle(true);
    }
  };
  private readonly seeked = () => { this.loaded(); this.flush(); };
  private readonly error = () => {
    if (this.disposed) return;
    this.failed = true;
    this.onReady(false);
    this.settle(false);
  };
  private readonly visibility = () => { if (!document.hidden) this.flush(); };

  constructor(private readonly video: HTMLVideoElement, private readonly onReady: (ready: boolean) => void) {}

  start(source: string): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.addEventListener('loadedmetadata', this.loaded);
    this.video.addEventListener('loadeddata', this.loaded);
    this.video.addEventListener('seeked', this.seeked);
    this.video.addEventListener('error', this.error);
    document.addEventListener('visibilitychange', this.visibility);
    const ready = new Promise<boolean>(resolve => { this.finish = resolve; });
    // Una red lenta no impide entrar a la tienda. Puede terminar de cargar después.
    this.timer = setTimeout(() => this.settle(false), 8000);
    this.video.src = source;
    this.video.load();
    return ready;
  }

  seek(progress: number): void {
    this.target = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    this.flush();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.settle(false);
    this.video.removeEventListener('loadedmetadata', this.loaded);
    this.video.removeEventListener('loadeddata', this.loaded);
    this.video.removeEventListener('seeked', this.seeked);
    this.video.removeEventListener('error', this.error);
    document.removeEventListener('visibilitychange', this.visibility);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }

  private flush(): void {
    const duration = this.video.duration;
    if (this.disposed || this.failed || document.hidden || this.video.seeking || !Number.isFinite(duration) || duration <= 0) return;
    // Evitar duration exacta: algunos decodificadores la interpretan como fin sin imagen.
    const time = this.target * Math.max(0, duration - 1 / 24);
    if (Math.abs(this.video.currentTime - time) < 1 / 48) return;
    try { this.video.currentTime = time; } catch { this.error(); }
  }

  private settle(ready: boolean): void {
    clearTimeout(this.timer);
    this.finish?.(ready);
    this.finish = undefined;
  }
}
