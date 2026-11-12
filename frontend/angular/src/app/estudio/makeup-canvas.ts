/** Canvas layer composition adapted from Doll.draw() in DollMaker (MIT).
 * All paths, effects, hit areas and export layout below are original By Jers work.
 */
import { CategoryId, MakeupOption, RULES } from './makeup-state';

const W = 960, H = 1060, TOP = 80;
const LIPS = 'M420 553 C443 546 459 532 478 536 Q491 544 501 539 C522 533 544 545 568 552 C548 586 530 605 495 607 C462 607 439 588 420 553Z';
const SHADOW_LEFT = 'M347 351 Q389 316 428 338 Q448 347 457 378 Q412 350 354 365Z';
const SHADOW_RIGHT = 'M538 378 Q549 344 573 335 Q615 318 658 348 L653 365 Q587 349 538 378Z';

export class MakeupCanvas {
  private base?: HTMLImageElement;
  private disposed = false;
  private loading?: HTMLImageElement;
  private settle?: (ready: boolean) => void;
  constructor(private canvas: HTMLCanvasElement) { canvas.width = W; canvas.height = H; }

  load(): Promise<boolean> {
    return new Promise(resolve => {
      if (this.disposed) { resolve(false); return; }
      const image = new Image(); this.loading = image; this.settle = resolve;
      image.onload = () => { if (!this.disposed) this.base = image; this.loading = undefined; this.settle = undefined; resolve(!this.disposed); };
      image.onerror = () => { this.loading = undefined; this.settle = undefined; resolve(false); };
      image.src = '/img/avatar-jers/neutral.webp';
    });
  }

  draw(options: MakeupOption[], before = false, active?: CategoryId): void {
    if (this.disposed) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('El lienzo no está disponible.');
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(480, 460, 80, 480, 460, 710);
    bg.addColorStop(0, '#fffaf5'); bg.addColorStop(1, '#ecd5cf');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffffffa0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(480, 490, 375, 450, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#6b4549'; ctx.font = '500 20px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('B Y   J E R S    /    E S T U D I O', W / 2, 48);
    if (this.base) ctx.drawImage(this.base, 0, TOP, W, 877);
    ctx.save(); ctx.translate(0, TOP);
    if (!before && this.base) {
      // Stable order: blush, eyeshadow, liner, lips, regardless of tool selection.
      for (const category of ['rubor', 'sombras', 'delineado', 'labios']) {
        const option = options.find(o => o.category === category);
        if (option) this.layer(ctx, option);
      }
    }
    if (active && !before && this.base) {
      ctx.save(); ctx.strokeStyle = '#ffffffc0'; ctx.lineWidth = 2; ctx.setLineDash([5, 7]);
      if (active === 'labios') ctx.stroke(new Path2D(LIPS));
      if (active === 'sombras') { ctx.stroke(new Path2D(SHADOW_LEFT)); ctx.stroke(new Path2D(SHADOW_RIGHT)); }
      ctx.restore();
    }
    ctx.restore();
    ctx.fillStyle = '#6b4549'; ctx.font = '24px serif';
    ctx.fillText(before ? 'Tu punto de partida' : 'Tu color. Tu momento.', W / 2, 1010);
    ctx.font = '15px sans-serif'; ctx.fillStyle = '#785f60';
    ctx.fillText('Previsualización artística · By Jers', W / 2, 1040);
  }

  private layer(ctx: CanvasRenderingContext2D, option: MakeupOption): void {
    const shade = RULES.shades.find(s => s.id === option.shade);
    if (!shade) return;
    const intensity = option.intensity / 100;
    ctx.save();
    if (option.category === 'labios') {
      ctx.clip(new Path2D(LIPS)); ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = intensity * .94;
      ctx.fillStyle = shade.hex; ctx.fillRect(410, 525, 170, 95);
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = intensity * .24; ctx.fillRect(410, 525, 170, 95);
    } else if (option.category === 'sombras') {
      for (const path of [SHADOW_LEFT, SHADOW_RIGHT]) {
        ctx.save(); ctx.clip(new Path2D(path));
        const gradient = ctx.createLinearGradient(0, 325, 0, 380);
        gradient.addColorStop(0, shade.hex + '00'); gradient.addColorStop(.5, shade.hex + 'cc'); gradient.addColorStop(1, shade.hex + '20');
        ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = intensity * .78;
        ctx.fillStyle = gradient; ctx.fillRect(330, 315, 350, 80); ctx.restore();
      }
    } else if (option.category === 'rubor') {
      ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = intensity * .9;
      for (const x of [371, 617]) {
        const gradient = ctx.createRadialGradient(x, 449, 3, x, 449, 57);
        gradient.addColorStop(0, shade.hex); gradient.addColorStop(.6, shade.hex + '88'); gradient.addColorStop(1, shade.hex + '00');
        ctx.fillStyle = gradient; ctx.save(); ctx.translate(x, 449); ctx.scale(1, .7); ctx.translate(-x, -449);
        ctx.fillRect(x - 60, 389, 120, 120); ctx.restore();
      }
    } else {
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = intensity * .92;
      ctx.strokeStyle = shade.hex; ctx.lineWidth = 2 + intensity * 5; ctx.lineCap = 'round';
      ctx.stroke(new Path2D('M346 352 L356 366 Q402 341 454 389 M539 389 Q592 341 651 363 L668 345'));
    }
    ctx.restore();
  }

  hit(category: CategoryId, clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const x = (clientX - rect.left) * W / rect.width, y = (clientY - rect.top) * H / rect.height - TOP;
    if (category === 'labios') return x >= 400 && x <= 590 && y >= 515 && y <= 630;
    if (category === 'rubor') return y >= 405 && y <= 510 && ((x >= 325 && x <= 435) || (x >= 560 && x <= 680));
    return y >= 310 && y <= 415 && ((x >= 325 && x <= 475) || (x >= 520 && x <= 690));
  }

  async export(options: MakeupOption[]): Promise<Blob> {
    if (!this.base || this.disposed) throw new Error('Espera a que el rostro esté listo.');
    // Separate canvas: exporting must not remove on-screen comparison or guides.
    const target = document.createElement('canvas'); target.width = W; target.height = H;
    const render = new MakeupCanvas(target); render.base = this.base; render.draw(options);
    try {
      return await new Promise<Blob>((resolve, reject) => target.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear el PNG.')), 'image/png'));
    } finally { render.destroy(); target.width = target.height = 0; }
  }

  destroy(): void {
    this.disposed = true;
    if (this.loading) { this.loading.onload = this.loading.onerror = null; this.loading.src = ''; }
    this.settle?.(false); this.settle = undefined; this.loading = undefined; this.base = undefined;
  }
}
