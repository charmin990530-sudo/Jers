import { PortraitSheet } from './portrait-sheet';

type Face = 'neutral' | 'closed' | 'half' | 'left' | 'right' | 'up' | 'down' | 'upleft' | 'upright' | 'downleft' | 'downright';
const FACES: Face[] = ['closed', 'half', 'left', 'right', 'down', 'up', 'upleft', 'upright', 'downleft', 'downright'];
const RING: Face[] = ['right', 'upright', 'up', 'upleft', 'left', 'downleft', 'down', 'downright'];

/** Whole-picture portrait: no eye masks, overlays or independently moving facial parts. */
export class PortraitEngine {
    private sheet = new PortraitSheet();
    private abort = new AbortController();
    private gl: WebGLRenderingContext | null = null;
    private textures = new Map<Face, WebGLTexture>();
    private buffers: WebGLBuffer[] = [];
    private shaders: WebGLShader[] = [];
    private program: WebGLProgram | null = null;
    private dynamicBuffer: WebGLBuffer | null = null;
    private uniforms: Record<string, WebGLUniformLocation | null> = {};
    private resizeObserver?: ResizeObserver;
    private intersectionObserver?: IntersectionObserver;
    private frameId = 0;
    private disposed = false;
    private ready = false;
    private visible = true;
    private enabled = true;
    private awakeAt = 0;
    private lastInput = 0;
    private lastFrame = 0;
    private pointer = [.5, .43];
    private dragging: number | null = null;
    private pendingTouch: { id: number; x: number; y: number; u: number; v: number } | null = null;
    private nextBlink = 0;
    private blinkAt = -1000;
    private scrollUntil = 0;
    private faceA: Face = 'neutral';
    private faceB: Face = 'neutral';
    private fadeAt = 0;
    private lean = [0, 0];

    constructor(private stage: HTMLElement, private canvas: HTMLCanvasElement, private fallback: HTMLImageElement) {}

    async start(enabled = true): Promise<void> {
        this.enabled = enabled;
        try {
            const gl = this.canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
            if (!gl || this.disposed) return;
            this.gl = gl;
            this.setupProgram(gl);
            if (!await this.loadFace('neutral') || this.disposed) { this.destroy(); return; }
            this.ready = true;
            this.observe();
            this.listen();
            this.schedule();
            // Bound simultaneous requests. All assets are local to the project.
            let index = 0;
            await Promise.all(Array.from({ length: 2 }, async () => {
                while (!this.disposed && index < FACES.length) await this.loadFace(FACES[index++]);
            }));
        } catch {
            // A static portrait and all category controls remain usable if WebGL fails.
            this.destroy();
        }
    }

    setMotion(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) { this.sheet.reset(); this.dragging = null; this.pendingTouch = null; this.lean = [0, 0]; this.stage.classList.remove('is-grabbed'); }
        this.schedule();
    }

    destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.abort.abort(); cancelAnimationFrame(this.frameId);
        this.resizeObserver?.disconnect(); this.intersectionObserver?.disconnect();
        if (this.gl) {
            for (const texture of this.textures.values()) this.gl.deleteTexture(texture);
            for (const buffer of this.buffers) this.gl.deleteBuffer(buffer);
            for (const shader of this.shaders) this.gl.deleteShader(shader);
            if (this.program) this.gl.deleteProgram(this.program);
            this.gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        this.textures.clear(); this.canvas.style.opacity = '0'; this.fallback.style.visibility = '';
        this.stage.classList.remove('is-grabbed');
    }

    private setupProgram(gl: WebGLRenderingContext): void {
        const compile = (type: number, source: string): WebGLShader => {
            const shader = gl.createShader(type);
            if (!shader) throw new Error('shader');
            this.shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('compile');
            return shader;
        };
        const program = gl.createProgram();
        if (!program) throw new Error('program');
        this.program = program;
        gl.attachShader(program, compile(gl.VERTEX_SHADER, `
            attribute vec2 a, d; attribute float s; varying vec2 uv; varying float shade;
            uniform vec2 lean;
            void main(){ uv=a; shade=s; vec2 p=a+d+lean;
              gl_Position=vec4(vec2(p.x-.5,.5-p.y)*2./1.5,0.,1.); }`));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
            precision mediump float; varying vec2 uv; varying float shade;
            uniform sampler2D faceA,faceB; uniform float fade;
            void main(){
              if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.){gl_FragColor=vec4(0.);return;}
              vec4 c=mix(texture2D(faceA,uv),texture2D(faceB,uv),fade);
              gl_FragColor=vec4(c.rgb*shade,c.a);
            }`));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link');
        gl.useProgram(program);
        for (const name of ['lean', 'faceA', 'faceB', 'fade']) this.uniforms[name] = gl.getUniformLocation(program, name);
        gl.uniform1i(this.uniforms['faceA'], 0); gl.uniform1i(this.uniforms['faceB'], 1);
        const buffer = (target: number, data: BufferSource, usage: number): WebGLBuffer => {
            const value = gl.createBuffer();
            if (!value) throw new Error('buffer');
            this.buffers.push(value); gl.bindBuffer(target, value); gl.bufferData(target, data, usage);
            return value;
        };
        buffer(gl.ARRAY_BUFFER, this.sheet.rest, gl.STATIC_DRAW);
        const a = gl.getAttribLocation(program, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        this.dynamicBuffer = buffer(gl.ARRAY_BUFFER, this.sheet.dynamic, gl.DYNAMIC_DRAW);
        const d = gl.getAttribLocation(program, 'd'), s = gl.getAttribLocation(program, 's');
        gl.enableVertexAttribArray(d); gl.vertexAttribPointer(d, 2, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(s); gl.vertexAttribPointer(s, 1, gl.FLOAT, false, 12, 8);
        buffer(gl.ELEMENT_ARRAY_BUFFER, this.sheet.indices, gl.STATIC_DRAW);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
    }

    private async loadFace(name: Face): Promise<boolean> {
        const img = await new Promise<HTMLImageElement | null>(resolve => {
            if (this.disposed) { resolve(null); return; }
            const image = new Image(); image.crossOrigin = 'anonymous';
            const cancel = () => { image.onload = image.onerror = null; image.src = ''; resolve(null); };
            const finish = (value: HTMLImageElement | null) => { this.abort.signal.removeEventListener('abort', cancel); resolve(value); };
            image.onload = () => finish(image); image.onerror = () => finish(null);
            this.abort.signal.addEventListener('abort', cancel, { once: true });
            image.src = `/img/avatar-jers/${name}.webp`;
        });
        const gl = this.gl;
        if (!img || !gl || this.disposed) return false;
        const texture = gl.createTexture();
        if (!texture) return false;
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this.textures.set(name, texture);
        this.canvas.dataset['pictures'] = String(this.textures.size);
        this.schedule();
        return true;
    }

    private observe(): void {
        this.resizeObserver = new ResizeObserver(() => {
            const rect = this.canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 1.5);
            this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
            this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
            this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height); this.schedule();
        });
        this.resizeObserver.observe(this.canvas);
        this.intersectionObserver = new IntersectionObserver(entries => {
            this.visible = entries[0].isIntersecting;
            if (!this.visible) { this.sheet.release(); this.dragging = null; this.pendingTouch = null; this.stage.classList.remove('is-grabbed'); }
            this.schedule();
        });
        this.intersectionObserver.observe(this.stage);
    }

    private listen(): void {
        const options = { signal: this.abort.signal, passive: true };
        window.addEventListener('pointermove', event => {
            if (!this.enabled || !this.visible) return;
            const rect = this.stage.getBoundingClientRect();
            this.pointer = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
            const now = performance.now();
            if (!this.awakeAt) { this.awakeAt = now; this.nextBlink = now + 2800; }
            this.lastInput = now;
            if (this.pendingTouch?.id === event.pointerId) {
                const touch = this.pendingTouch, dx = event.clientX - touch.x, dy = event.clientY - touch.y;
                // Horizontal intent stretches the face; vertical intent remains native page scrolling.
                if (Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) this.pendingTouch = null;
                else if (Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                    this.sheet.grab(touch.u, touch.v); this.dragging = event.pointerId;
                    this.stage.setPointerCapture(event.pointerId); this.stage.classList.add('is-grabbed'); this.pendingTouch = null;
                }
            }
            if (this.dragging === event.pointerId) this.sheet.pull(this.pointer[0], this.pointer[1]);
            this.schedule();
        }, options);
        this.stage.addEventListener('pointerdown', event => {
            if (!this.enabled || event.button !== 0 || (event.target as Element).closest('a,button')) return;
            const rect = this.stage.getBoundingClientRect(), u = (event.clientX - rect.left) / rect.width, v = (event.clientY - rect.top) / rect.height;
            if (u < .15 || u > .85 || v < .05 || v > .94) return;
            const now = performance.now(); this.lastInput = now;
            if (!this.awakeAt) { this.awakeAt = now; this.nextBlink = now + 2800; }
            if (event.pointerType === 'touch') {
                this.pendingTouch = { id: event.pointerId, x: event.clientX, y: event.clientY, u, v };
                this.pointer = [u, v]; this.blinkAt = now; this.schedule(); return;
            }
            this.dragging = event.pointerId; this.sheet.grab(u, v); this.stage.setPointerCapture(event.pointerId);
            this.stage.classList.add('is-grabbed'); event.preventDefault();
        }, { signal: this.abort.signal });
        const release = () => { this.dragging = null; this.pendingTouch = null; this.sheet.release(); this.stage.classList.remove('is-grabbed'); };
        window.addEventListener('pointerup', release, options); window.addEventListener('pointercancel', release, options);
        this.stage.addEventListener('lostpointercapture', release, options);
        window.addEventListener('scroll', () => { this.scrollUntil = performance.now() + 500; }, options);
        document.addEventListener('visibilitychange', () => { release(); this.lastFrame = 0; this.schedule(); }, options);
        this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.destroy(); }, { signal: this.abort.signal });
    }

    private schedule(): void {
        if (!this.disposed && this.ready && !this.frameId && this.visible && !document.hidden) this.frameId = requestAnimationFrame(now => this.frame(now));
    }

    private frame(now: number): void {
        this.frameId = 0;
        if (this.disposed || !this.visible || document.hidden) { this.lastFrame = 0; return; }
        const gl = this.gl;
        if (!gl) return;
        const dt = this.lastFrame ? Math.min(.04, (now - this.lastFrame) / 1000) : 1 / 60;
        this.lastFrame = now;
        let face: Face = 'neutral';
        if (this.enabled) {
            if (!this.awakeAt || now - this.lastInput > 35000) face = 'closed';
            else if (now - this.awakeAt < 110) face = 'half';
            else {
                const dx = this.pointer[0] - .5, dy = this.pointer[1] - .43;
                face = now < this.scrollUntil ? 'down' : Math.hypot(dx, dy) < .14 ? 'neutral'
                    : RING[Math.round((Math.atan2(-dy, dx) + Math.PI * 2) / (Math.PI / 4)) % 8];
                if (now > this.nextBlink) { this.blinkAt = now; this.nextBlink = now + 2200 + Math.random() * 3400; }
                const blink = now - this.blinkAt;
                if (blink < 180) face = blink < 55 || blink > 120 ? 'half' : 'closed';
            }
            this.sheet.update(dt);
            const factor = 1 - Math.exp(-dt * 6);
            for (let i = 0; i < 2; i++) {
                const target = this.awakeAt ? Math.max(-.012, Math.min(.012, (this.pointer[i] - .5) * .012)) : 0;
                this.lean[i] += (target - this.lean[i]) * factor;
            }
        }
        if (!this.textures.has(face)) face = 'neutral';
        if (face !== this.faceB) {
            this.faceA = now - this.fadeAt > 35 ? this.faceB : this.faceA;
            this.faceB = face; this.fadeAt = now;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sheet.dynamic);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.get(this.faceA) ?? this.textures.get('neutral')!);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.textures.get(this.faceB) ?? this.textures.get('neutral')!);
        gl.uniform1f(this.uniforms['fade'], this.enabled ? Math.min(1, (now - this.fadeAt) / 60) : 1);
        gl.uniform2f(this.uniforms['lean'], this.lean[0], this.lean[1]);
        gl.drawElements(gl.TRIANGLES, this.sheet.indices.length, gl.UNSIGNED_SHORT, 0);
        this.canvas.style.opacity = '1'; this.fallback.style.visibility = 'hidden';
        this.canvas.dataset['renderer'] = 'webgl'; this.canvas.dataset['face'] = face;
        if (this.enabled || now - this.fadeAt < 70) this.schedule();
    }
}
