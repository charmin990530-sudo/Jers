import { Component, ElementRef, NgZone, OnDestroy, afterNextRender, inject, signal, viewChild } from '@angular/core';

@Component({
  selector: 'app-beauty-scene',
  template: `<div #stage class="stage" aria-hidden="true"></div>
    @if (ready()) { <button type="button" (click)="toggle()" [attr.aria-pressed]="paused()">{{ paused() ? 'Activar movimiento' : 'Pausar movimiento' }}</button> }`,
  styles: [`:host{position:absolute;inset:-10% -14%;display:block;z-index:2;pointer-events:none}.stage{width:100%;height:100%}.stage canvas{display:block;width:100%;height:100%}button{pointer-events:auto;position:absolute;right:13%;bottom:10%;font:inherit;font-size:10px;letter-spacing:.04em;border:1px solid #ead7ef70;border-radius:30px;background:#2a1538db;color:#fff1ef;padding:10px 14px;cursor:pointer}button:focus-visible{outline:2px solid #f4c39b;outline-offset:4px}`],
})
export class BeautyScene implements OnDestroy {
  private zone = inject(NgZone);
  private stage = viewChild.required<ElementRef<HTMLDivElement>>('stage');
  readonly ready = signal(false);
  readonly paused = signal(false);
  private disposed = false;
  private cleanup?: () => void;
  private redraw = () => {};

  constructor() {
    afterNextRender(() => this.zone.runOutsideAngular(() => { void this.init(); }));
  }
  toggle() { this.paused.update(value => !value); this.redraw(); }
  ngOnDestroy() { this.disposed = true; this.cleanup?.(); }

  private async init() {
    const [THREE, { RoomEnvironment }] = await Promise.all([import('three'), import('three/addons/environments/RoomEnvironment.js')]);
    if (this.disposed) return;
    const host = this.stage().nativeElement;
    let renderer: InstanceType<typeof THREE.WebGLRenderer>;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' }); }
    catch { return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    host.appendChild(renderer.domElement);
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    if (debug) host.dataset['renderer'] = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    const scene = new THREE.Scene();
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environmentMap = pmrem.fromScene(environment, .03);
    scene.environment = environmentMap.texture;
    environment.dispose();
    pmrem.dispose();
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 50);
    camera.position.set(0, .1, 8.7);
    scene.add(new THREE.HemisphereLight('#ffefff', '#533352', 3));
    const key = new THREE.DirectionalLight('#ffe3c5', 5); key.position.set(-3, 4, 5); scene.add(key);
    const rim = new THREE.PointLight('#e18fff', 35, 14); rim.position.set(3, 1, 2); scene.add(rim);
    const gold = new THREE.MeshStandardMaterial({ color: '#e6b88c', metalness: .85, roughness: .22 });
    const ink = new THREE.MeshStandardMaterial({ color: '#211322', metalness: .45, roughness: .24 });
    const rose = new THREE.MeshStandardMaterial({ color: '#8d2851', metalness: .07, roughness: .23 });
    const powder = new THREE.MeshStandardMaterial({ color: '#d79b83', roughness: .8 });
    const cylinder = (parent: InstanceType<typeof THREE.Group>, radius: number, height: number, material: InstanceType<typeof THREE.MeshStandardMaterial>, y: number) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 48), material);
      mesh.position.y = y; parent.add(mesh); return mesh;
    };
    const lipstick = new THREE.Group();
    cylinder(lipstick, .22, 1.05, ink, 0);
    cylinder(lipstick, .225, .12, gold, .46);
    cylinder(lipstick, .155, .35, gold, .64);
    const bullet = cylinder(lipstick, .135, .6, rose, 1.03);
    const vertices = bullet.geometry.attributes['position'];
    for (let i = 0; i < vertices.count; i++) if (vertices.getY(i) > .29) vertices.setY(i, vertices.getY(i) - vertices.getX(i) * .8);
    bullet.geometry.computeVertexNormals();
    lipstick.scale.setScalar(.65);
    lipstick.position.set(-1.75, -1.35, 1.2); lipstick.rotation.set(.12, .2, -.29); scene.add(lipstick);
    const cap = new THREE.Group(); cylinder(cap, .23, .95, ink, 0); cylinder(cap, .235, .055, gold, -.43);
    cap.scale.setScalar(.65);
    cap.position.set(-2.02, -.23, .6); cap.rotation.z = -.5; scene.add(cap);
    const compact = new THREE.Group();
    cylinder(compact, .53, .14, gold, 0); cylinder(compact, .47, .035, powder, .09);
    compact.scale.setScalar(.55);
    compact.position.set(1.9, -1.45, 1); compact.rotation.set(.73, -.3, .25); scene.add(compact);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(.53, .53, .07, 48), gold);
    lid.rotation.x = -1.15; lid.position.set(0, .44, -.36); compact.add(lid);
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(.46, 48), new THREE.MeshStandardMaterial({ color: '#c5a6d9', metalness: .95, roughness: .09 }));
    mirror.rotation.x = -.42; mirror.position.set(0, .46, -.32); compact.add(mirror);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.22, .009, 8, 120), gold);
    ring.rotation.set(.2, -.2, .3); ring.position.z = -.8; ring.visible = false; scene.add(ring);
    const crystal = new THREE.MeshPhysicalMaterial({ color: '#f3e9ff', roughness: .04, metalness: 0, transmission: 1, thickness: .6, ior: 1.4, envMapIntensity: 1.7 });
    const bubbles = new THREE.Group();
    for (const [x, y, z, radius] of [[-1.8, 1.2, 0, .25], [1.7, .8, 1, .18], [1.5, -1.5, 0, .14]]) {
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), crystal); bubble.position.set(x, y, z); bubbles.add(bubble);
    }
    scene.add(bubbles);
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(90 * 3);
    for (let i = 0; i < positions.length; i += 3) { const a = i * 2.399; positions[i] = Math.cos(a) * (1.9 + i % 8 / 6); positions[i + 1] = Math.sin(a) * 2.7; positions[i + 2] = (i % 9) / 4 - 1; }
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(particles, new THREE.PointsMaterial({ color: '#f9d1a8', size: .018, transparent: true, opacity: .7 })); scene.add(stars);
    let inView = true, hidden = document.hidden, dirty = true, frame = 0, last = 0, elapsed = 0;
    let pointerX = 0, pointerY = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.zone.run(() => { this.paused.set(reduced.matches); this.ready.set(true); });
    const resize = new ResizeObserver(() => { renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / Math.max(host.clientHeight, 1); camera.updateProjectionMatrix(); dirty = true; }); resize.observe(host);
    const intersection = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; dirty = true; }); intersection.observe(host);
    const visibility = () => { hidden = document.hidden; dirty = true; };
    const pointer = (event: PointerEvent) => { pointerX = event.clientX / innerWidth - .5; pointerY = event.clientY / innerHeight - .5; };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pointermove', pointer, { passive: true });
    this.redraw = () => { dirty = true; };
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (hidden || !inView || (this.paused() && !dirty)) { last = now; return; }
      if (!this.paused() && now - last < 32) return;
      const delta = Math.min((now - last) / 1000, .1); last = now;
      if (!this.paused()) {
        elapsed += delta;
        lipstick.position.y = -1.35 + Math.sin(elapsed * .7) * .07;
        lipstick.rotation.y = .2 + Math.sin(elapsed * .4) * .25;
        cap.position.y = -.23 + Math.sin(elapsed * .7 + 1) * .1;
        compact.rotation.z = .25 + Math.sin(elapsed * .5) * .12;
        const scroll = Math.min(1, Math.max(0, -host.getBoundingClientRect().top / Math.max(host.clientHeight, 1)));
        cap.position.x = -2.02 - scroll * .3;
        ring.rotation.z = .3 + elapsed * .025;
        stars.rotation.y = elapsed * .025;
        bubbles.position.y = Math.sin(elapsed * .45) * .08;
        camera.position.x += (pointerX * .28 - camera.position.x) * .06;
        camera.position.y += (-pointerY * .18 - camera.position.y) * .06;
        camera.lookAt(0, 0, 0);
      }
      renderer.render(scene, camera); dirty = false;
    };
    frame = requestAnimationFrame(animate);
    this.cleanup = () => {
      cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect();
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pointermove', pointer);
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
      environmentMap.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }
}
