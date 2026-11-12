import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { formatearPrecio, mensajeError } from '../utils/format';
import { CategoryId, LOOK_KEY, MakeupLook, MakeupOption, ModeId, parseLook, RULES, saveLook, stepMatches } from './makeup-state';
import { MakeupCanvas } from './makeup-canvas';
import { StudioProduct, StudioReward } from './studio.types';

@Component({
  selector: 'app-estudio',
  imports: [RouterLink],
  templateUrl: './estudio.html',
  styleUrl: './estudio.scss',
})
export class Estudio {
  @ViewChild('portrait') private portrait!: ElementRef<HTMLCanvasElement>;
  readonly api = inject(ApiService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private look = new MakeupLook();
  private renderer?: MakeupCanvas;
  private destroyed = false;
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private attempt?: { id: string; revision: number; userId: string; mode: ModeId; sent: MakeupOption[] };
  private urls = new Map<string, ReturnType<typeof setTimeout>>();

  readonly rules = RULES;
  readonly formatearPrecio = formatearPrecio;
  readonly mode = signal<ModeId>('libre');
  readonly tool = signal<CategoryId>('labios');
  readonly shade = signal('nude');
  readonly intensity = signal(50);
  readonly options = signal<MakeupOption[]>([]);
  readonly canUndo = signal(false);
  readonly ready = signal(false);
  readonly loading = signal(true);
  readonly imageError = signal('');
  readonly message = signal('Elige un tono y toca el rostro para comenzar.');
  readonly storageMessage = signal('');
  readonly serverError = signal('');
  readonly compare = signal(false);
  readonly finished = signal(false);
  readonly finishing = signal(false);
  readonly exporting = signal(false);
  readonly products = signal<StudioProduct[]>([]);
  readonly productLoading = signal(true);
  readonly productError = signal('');
  readonly adding = signal('');
  readonly rewards = signal<StudioReward[]>([]);
  readonly savingReward = signal(false);
  readonly challenge = computed(() => RULES.challenges.find(c => c.id === this.mode()));
  readonly category = computed(() => RULES.categories.find(c => c.id === this.tool())!);
  readonly hasCurrentLayer = computed(() => this.options().some(o => o.category === this.tool()));
  readonly shades = computed(() => RULES.shades.filter(s => this.category().shades.includes(s.id)));
  readonly progress = computed(() => this.challenge()?.steps.filter(s => stepMatches(s, this.options())).length ?? 0);
  readonly canFinish = computed(() => this.options().length > 0 && (this.mode() === 'libre' || this.progress() === 4));
  readonly activeRewards = computed(() => this.rewards().filter(r => !r.redeemedAt));
  readonly related = computed(() => this.products().filter(p => p.cosmeticType === this.tool()).slice(0, 4));

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true; this.generation++; this.renderer?.destroy();
      for (const [url, timer] of this.urls) { clearTimeout(timer); URL.revokeObjectURL(url); }
      this.urls.clear();
    });
    afterNextRender(() => {
      this.restore();
      void this.loadPortrait(); void this.loadProducts();
      if (this.api.estaLogueado()) void this.refreshRewards();
    });
  }

  async loadPortrait(): Promise<void> {
    this.renderer?.destroy(); this.loading.set(true); this.imageError.set(''); this.ready.set(false);
    const renderer = new MakeupCanvas(this.portrait.nativeElement); this.renderer = renderer;
    try {
      const loaded = await renderer.load();
      if (this.destroyed || this.renderer !== renderer) return;
      if (!loaded) throw new Error('No se pudo cargar el rostro.');
      this.ready.set(true); this.draw();
    } catch { if (!this.destroyed) this.imageError.set('No se pudo preparar el rostro. Reintenta para seguir maquillando.'); }
    finally { if (!this.destroyed) this.loading.set(false); }
  }

  selectMode(mode: ModeId): void {
    if (this.finishing() || mode === this.mode()) return;
    this.generation++; this.attempt = undefined;
    this.look.reset(); this.mode.set(mode); this.finished.set(false); this.serverError.set('');
    this.selectTool('labios'); this.changed();
    this.message.set(mode === 'libre' ? 'Tu lienzo, tus reglas. Empieza por el color que quieras.' : 'Reto abierto. Sigue los cuatro pasos y experimenta a tu ritmo.');
  }

  selectTool(category: CategoryId): void {
    if (this.finishing()) return;
    this.tool.set(category);
    const option = this.look.options.find(o => o.category === category);
    this.shade.set(option?.shade ?? RULES.categories.find(c => c.id === category)!.shades[0]);
    this.intensity.set(option?.intensity ?? 50); this.draw();
  }
  selectShade(shade: string): void { this.shade.set(shade); }
  setIntensity(event: Event): void { this.intensity.set(Number((event.target as HTMLInputElement).value)); }
  paintAt(event: MouseEvent): void {
    if (this.renderer?.hit(this.tool(), event.clientX, event.clientY)) this.apply();
    else this.message.set(this.category().hint + ' También puedes usar «Aplicar».');
  }
  apply(): void {
    if (!this.ready() || this.finishing()) return;
    if (this.look.addOption({ category: this.tool(), shade: this.shade(), intensity: this.intensity() })) {
      this.changed(); this.message.set(`${this.category().name} aplicado. ¡Sigue creando!`);
    } else this.message.set('Ese tono e intensidad ya están aplicados. Prueba otra combinación.');
  }
  remove(): void { if (!this.finishing() && this.look.removeOption(this.tool())) { this.changed(); this.message.set('Capa retirada.'); } }
  undo(): void { if (!this.finishing()) { this.look.undo(); this.changed(); this.message.set('Último cambio deshecho.'); } }
  reset(): void { if (!this.finishing()) { this.look.reset(); this.changed(); this.message.set('Lienzo reiniciado. Puedes volver a crear tu look.'); } }
  private changed(): void {
    this.options.set(this.look.options.map(o => ({ ...o }))); this.canUndo.set(this.look.canUndo);
    this.compare.set(false); this.finished.set(false); this.draw(); void this.sync();
  }
  toggleCompare(): void { this.compare.update(value => !value); this.draw(); }
  stepDone(index: number): boolean { const step = this.challenge()?.steps[index]; return !!step && stepMatches(step, this.options()); }
  private draw(): void {
    try { this.renderer?.draw(this.options(), this.compare(), this.finished() ? undefined : this.tool()); }
    catch { this.ready.set(false); this.imageError.set('El lienzo no está disponible en este navegador. Reintenta.'); }
  }

  save(): void {
    try {
      this.storageMessage.set(saveLook(localStorage, this.look.toJSON(this.mode())) ? 'Look guardado en este navegador. No se sube ninguna imagen.' : 'No se pudo guardar. Puedes seguir jugando y descargar el PNG.');
    } catch { this.storageMessage.set('El almacenamiento no está disponible. Puedes seguir jugando.'); }
  }
  private restore(): void {
    try {
      const raw = localStorage.getItem(LOOK_KEY);
      if (!raw) return;
      const saved = parseLook(raw);
      if (!saved) { this.storageMessage.set('El look guardado no era válido. Empezamos con un lienzo nuevo.'); return; }
      this.look.restore(saved); this.options.set(saved.options); this.mode.set(saved.mode);
      this.storageMessage.set('Recuperamos tu look guardado. Los premios se comprueban al jugar.');
      this.selectTool('labios');
    } catch { this.storageMessage.set('Almacenamiento no disponible. El juego sigue funcionando.'); }
  }
  clearSaved(): void {
    try { localStorage.removeItem(LOOK_KEY); this.storageMessage.set('Look guardado eliminado de este navegador. Tu lienzo actual sigue abierto.'); }
    catch { this.storageMessage.set('No se pudo acceder al almacenamiento para borrar el look.'); }
  }

  async download(): Promise<void> {
    if (!this.renderer || !this.ready() || this.exporting()) return;
    this.exporting.set(true);
    try {
      const blob = await this.renderer.export(this.options());
      if (this.destroyed) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `by-jers-${this.mode()}.png`;
      document.body.append(link); link.click(); link.remove();
      this.urls.set(url, setTimeout(() => { URL.revokeObjectURL(url); this.urls.delete(url); }, 1500));
      this.message.set('Tu PNG está listo para descargar.');
    } catch { if (!this.destroyed) this.message.set('No se pudo exportar el PNG. Reintenta cuando el rostro esté listo.'); }
    finally { if (!this.destroyed) this.exporting.set(false); }
  }

  private sync(): Promise<void> {
    const options = this.options().map(o => ({ ...o })), mode = this.mode(), generation = this.generation;
    const run = async () => {
      const user = this.api.usuario(); const userId = user?.id ?? user?._id;
      if (!userId || this.destroyed || generation !== this.generation) return;
      this.savingReward.set(true);
      try {
        if (!this.attempt || this.attempt.userId !== userId || this.attempt.mode !== mode) {
          if (!options.length) return;
          const response = await this.api.startStudioAttempt(mode);
          if (!response.ok) throw new Error(mensajeError(response, 'No se pudo abrir la sesión para guardar premios.'));
          if (this.destroyed || generation !== this.generation) return;
          this.attempt = { id: response.data.attempt.id, revision: response.data.attempt.revision, userId, mode, sent: [] };
        }
        const attempt = this.attempt;
        for (const category of RULES.categories) {
          const option = options.find(o => o.category === category.id) ?? null;
          const previous = attempt.sent.find(o => o.category === category.id) ?? null;
          if (JSON.stringify(option) === JSON.stringify(previous)) continue;
          if (this.destroyed || generation !== this.generation || this.api.usuario()?.id !== userId && this.api.usuario()?._id !== userId) return;
          const response = await this.api.updateStudioStep(attempt.id, { revision: attempt.revision, category: category.id, option });
          if (!response.ok) throw new Error(mensajeError(response, 'No se pudo validar ese paso para el premio.'));
          attempt.revision = response.data.revision;
          attempt.sent = attempt.sent.filter(o => o.category !== category.id);
          if (option) attempt.sent.push(option);
        }
        if (!this.destroyed && generation === this.generation) { this.serverError.set(''); await this.refreshRewards(); }
      } catch (error) {
        if (!this.destroyed && generation === this.generation) { this.attempt = undefined; this.serverError.set(error instanceof Error ? error.message : 'No se pudo guardar el premio. El juego continúa.'); }
      } finally { if (!this.destroyed) this.savingReward.set(false); }
    };
    this.queue = this.queue.then(run, run); return this.queue;
  }

  async finish(): Promise<void> {
    if (!this.canFinish() || this.finishing()) return;
    this.finishing.set(true); this.serverError.set('');
    try {
      if (this.api.estaLogueado()) {
        await this.sync();
        if (!this.attempt || this.serverError()) return;
        const response = await this.api.completeStudioAttempt(this.attempt.id);
        if (this.destroyed) return;
        if (!response.ok) { this.serverError.set(mensajeError(response, 'No se pudo finalizar. Vuelve a intentarlo.')); return; }
        this.rewards.set(response.data.rewards ?? []);
      }
      this.finished.set(true); this.compare.set(false); this.draw();
      this.message.set(this.mode() === 'libre' ? '¡Tu look está listo! Puedes descargarlo o crear otro.' : '¡Reto completado! Has seguido los cuatro pasos.');
    } finally { if (!this.destroyed) this.finishing.set(false); }
  }

  async refreshRewards(): Promise<void> {
    const current = this.api.usuario(); const userId = current?.id ?? current?._id;
    const response = await this.api.getStudioRewards();
    const active = this.api.usuario();
    if (this.destroyed || userId !== (active?.id ?? active?._id)) return;
    if (response.ok) this.rewards.set(response.data.rewards ?? []);
    else this.serverError.set(mensajeError(response, 'No se pudieron consultar tus premios. El look permanece en el lienzo.'));
  }
  async loadProducts(): Promise<void> {
    this.productLoading.set(true); this.productError.set('');
    const response = await this.api.getStudioProducts();
    if (this.destroyed) return;
    this.productLoading.set(false);
    if (response.ok) this.products.set(response.data.products ?? []);
    else this.productError.set(mensajeError(response, 'No se pudo cargar el catálogo. Puedes seguir jugando y reintentar.'));
  }
  image(product: StudioProduct): string {
    const value = product.imagenes?.find(i => i.esPrincipal)?.url ?? product.imagenes?.[0]?.url ?? '';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    try { const url = new URL(value); if (['http:', 'https:'].includes(url.protocol)) return url.href; } catch { /* Fallback. */ }
    return '/img/placeholder.svg';
  }
  async addProduct(product: StudioProduct): Promise<void> {
    if (this.adding() || product.stock < 1) return;
    if (!this.api.estaLogueado()) { this.save(); await this.router.navigate(['/login'], { queryParams: { redirect: '/estudio' } }); return; }
    this.adding.set(product._id);
    try {
      const response = await this.api.addToCart({ productoId: product._id, cantidad: 1 });
      if (!this.destroyed) this.message.set(response.ok ? `${product.nombre} añadido. Puedes abrir tu carrito.` : mensajeError(response, 'No se pudo añadir. Revisa la disponibilidad.'));
    } finally { if (!this.destroyed) this.adding.set(''); }
  }
}
