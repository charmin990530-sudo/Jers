/** A bounded elastic sheet. Simulation time is independent of rendering FPS. */
export class PortraitSheet {
    readonly n = 40;
    readonly m = this.n + 1;
    readonly over = 1.5;
    readonly span = this.over / this.n;
    readonly count = this.m * this.m;
    readonly rest = new Float32Array(this.count * 2);
    readonly dynamic = new Float32Array(this.count * 3);
    readonly indices = new Uint16Array(this.n * this.n * 6);
    private x = new Float32Array(this.count);
    private y = new Float32Array(this.count);
    private vx = new Float32Array(this.count);
    private vy = new Float32Array(this.count);
    private sx = new Float32Array(this.count);
    private sy = new Float32Array(this.count);
    private lineA = new Float32Array(this.m);
    private lineB = new Float32Array(this.m);
    private lineP = new Float32Array(this.m);
    private accumulator = 0;
    private brush: { u: number; v: number; px: number; py: number; nodes: number[]; weights: number[]; x: number[]; y: number[] } | null = null;

    constructor() {
        const origin = (1 - this.over) / 2;
        for (let j = 0; j < this.m; j++) for (let i = 0; i < this.m; i++) {
            const k = j * this.m + i;
            this.rest[k * 2] = origin + i * this.span;
            this.rest[k * 2 + 1] = origin + j * this.span;
            this.dynamic[k * 3 + 2] = 1;
        }
        for (let j = 0, k = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
            const a = j * this.m + i, b = a + 1, c = a + this.m, d = c + 1;
            for (const index of [a, c, b, b, c, d]) this.indices[k++] = index;
        }
    }

    grab(u: number, v: number): void {
        const brush = { u, v, px: 0, py: 0, nodes: [] as number[], weights: [] as number[], x: [] as number[], y: [] as number[] };
        for (let k = 0; k < this.count; k++) {
            const dx = this.rest[k * 2] + this.x[k] - u, dy = this.rest[k * 2 + 1] + this.y[k] - v;
            const w = Math.exp(-(dx * dx + dy * dy) / (.23 * .23));
            if (w > .02) { brush.nodes.push(k); brush.weights.push(w); brush.x.push(this.x[k]); brush.y.push(this.y[k]); }
        }
        this.brush = brush;
    }

    pull(u: number, v: number): void {
        if (!this.brush) return;
        const dx = u - this.brush.u, dy = v - this.brush.v, length = Math.hypot(dx, dy);
        const factor = length ? .16 * (1 - Math.exp(-length / .16)) / length : 0;
        this.brush.px = dx * factor;
        this.brush.py = dy * factor;
    }

    release(): void { this.brush = null; }

    reset(): void {
        this.release(); this.accumulator = 0;
        for (const field of [this.x, this.y, this.vx, this.vy, this.sx, this.sy]) field.fill(0);
        for (let k = 0; k < this.count; k++) {
            this.dynamic[k * 3] = this.dynamic[k * 3 + 1] = 0;
            this.dynamic[k * 3 + 2] = 1;
        }
    }

    update(seconds: number): void {
        this.accumulator += Math.max(0, Math.min(.04, seconds));
        const h = 1 / 240;
        let steps = 0;
        while (this.accumulator >= h && steps < 10) { this.step(h); this.accumulator -= h; steps++; }
        for (let j = 0; j < this.m; j++) for (let i = 0; i < this.m; i++) {
            const k = j * this.m + i, edge = !i || !j || i === this.n || j === this.n;
            this.sx[k] = edge ? 0 : (this.x[k] * 4 + this.x[k - 1] + this.x[k + 1] + this.x[k - this.m] + this.x[k + this.m]) / 8;
            this.sy[k] = edge ? 0 : (this.y[k] * 4 + this.y[k - 1] + this.y[k + 1] + this.y[k - this.m] + this.y[k + this.m]) / 8;
        }
        // Preserve neighbour order on both axes so dragging cannot cut the image into folds.
        for (let pass = 0; pass < 2; pass++) {
            for (let j = 0; j < this.m; j++) this.order(j * this.m, 1, this.sx, 0);
            for (let i = 0; i < this.m; i++) this.order(i, this.m, this.sy, 1);
        }
        for (let k = 0; k < this.count; k++) {
            this.dynamic[k * 3] = this.sx[k]; this.dynamic[k * 3 + 1] = this.sy[k];
            const i = k % this.m, j = Math.floor(k / this.m);
            this.dynamic[k * 3 + 2] = i && j && i < this.n && j < this.n
                ? Math.max(.94, Math.min(1.06, 1 - ((this.sx[k + 1] - this.sx[k - 1]) + (this.sy[k + this.m] - this.sy[k - this.m])) * .8)) : 1;
        }
    }

    private step(dt: number): void {
        const wobble = 2.3 * 2 * Math.PI, c = .085 / this.span * wobble;
        for (let j = 1; j < this.n; j++) for (let i = 1; i < this.n; i++) {
            const k = j * this.m + i, l = k - 1, r = k + 1, t = k - this.m, b = k + this.m;
            const lapX = this.x[l] + this.x[r] + this.x[t] + this.x[b] - 4 * this.x[k];
            const lapY = this.y[l] + this.y[r] + this.y[t] + this.y[b] - 4 * this.y[k];
            const dampX = this.vx[l] + this.vx[r] + this.vx[t] + this.vx[b] - 4 * this.vx[k];
            const dampY = this.vy[l] + this.vy[r] + this.vy[t] + this.vy[b] - 4 * this.vy[k];
            this.vx[k] += (c * c * lapX - wobble * wobble * this.x[k] - 2 * .14 * wobble * this.vx[k] + .2 * c * dampX) * dt;
            this.vy[k] += (c * c * lapY - wobble * wobble * this.y[k] - 2 * .14 * wobble * this.vy[k] + .2 * c * dampY) * dt;
        }
        if (this.brush) {
            const brush = this.brush;
            for (let i = 0; i < brush.nodes.length; i++) {
                const k = brush.nodes[i], w = brush.weights[i];
                this.vx[k] += ((brush.x[i] + brush.px * w - this.x[k]) * 3000 * w - this.vx[k] * 90 * w) * dt;
                this.vy[k] += ((brush.y[i] + brush.py * w - this.y[k]) * 3000 * w - this.vy[k] * 90 * w) * dt;
            }
        }
        for (let j = 1; j < this.n; j++) for (let i = 1; i < this.n; i++) {
            const k = j * this.m + i;
            this.x[k] += this.vx[k] * dt; this.y[k] += this.vy[k] * dt;
        }
    }

    private order(start: number, stride: number, field: Float32Array, axis: number): void {
        const gap = this.span * .34;
        for (let i = 0; i < this.m; i++) {
            const k = start + i * stride;
            this.lineP[i] = this.rest[k * 2 + axis] + field[k];
        }
        this.lineA[0] = this.lineP[0];
        for (let i = 1; i < this.m; i++) this.lineA[i] = Math.max(this.lineP[i], this.lineA[i - 1] + gap);
        this.lineB[this.n] = this.lineP[this.n];
        for (let i = this.n - 1; i >= 0; i--) this.lineB[i] = Math.min(this.lineP[i], this.lineB[i + 1] - gap);
        for (let i = 0; i < this.m; i++) {
            const k = start + i * stride;
            field[k] = (this.lineA[i] + this.lineB[i]) / 2 - this.rest[k * 2 + axis];
        }
    }
}
