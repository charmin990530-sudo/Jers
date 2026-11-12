import { ScrollVideo } from './scroll-video';

describe('Recorrido de video por scroll', () => {
  let element: HTMLVideoElement;
  let controller: ScrollVideo;
  let ready: jasmine.Spy;
  let duration: number;
  let current: number;
  let seeking: boolean;
  let state: number;
  let writes: number[];
  const emit = (name: string) => element.dispatchEvent(new Event(name));

  beforeEach(() => {
    element = document.createElement('video');
    duration = NaN; current = 0; seeking = false; state = 0; writes = [];
    Object.defineProperties(element, {
      duration: { get: () => duration },
      currentTime: { get: () => current, set: (value: number) => { current = value; writes.push(value); seeking = true; } },
      seeking: { get: () => seeking },
      readyState: { get: () => state },
    });
    spyOn(element, 'load'); spyOn(element, 'pause');
    ready = jasmine.createSpy('ready');
    controller = new ScrollVideo(element, ready);
    spyOnProperty(document, 'hidden', 'get').and.returnValue(false);
  });
  afterEach(() => controller.dispose());

  it('espera metadatos y conserva el destino solicitado durante la carga', async () => {
    const started = controller.start('/video/recorrido.mp4');
    controller.seek(.7);
    expect(writes).toEqual([]);
    duration = 10; state = 2; emit('loadeddata');
    expect(writes[0]).toBeCloseTo(.7 * (10 - 1 / 24));
    expect(await started).toBeTrue();
    expect(element.muted && element.playsInline).toBeTrue();
  });

  it('agrupa scroll rápido y aplica el último destino al terminar el seek', async () => {
    const started = controller.start('/video/recorrido.mp4');
    duration = 10; state = 2; emit('loadeddata'); await started;
    controller.seek(.2); controller.seek(.4); controller.seek(.9);
    expect(writes.length).toBe(1);
    seeking = false; emit('seeked');
    expect(writes.length).toBe(2);
    expect(writes[1]).toBeCloseTo(.9 * (10 - 1 / 24));
    seeking = false; emit('seeked');
    expect(writes.length).toBe(2);
  });

  it('permite retroceder y acota los extremos sin buscar fuera del video', async () => {
    const started = controller.start('/video/recorrido.mp4');
    duration = 10; state = 2; emit('loadeddata'); await started;
    controller.seek(200); expect(current).toBeLessThan(duration);
    seeking = false; emit('seeked'); controller.seek(-20);
    expect(current).toBe(0);
    seeking = false; emit('seeked'); controller.seek(NaN);
    expect(current).toBe(0);
  });

  it('resuelve el fallo y deja visible la imagen de respaldo sin reintentos', async () => {
    const started = controller.start('/video/ausente.mp4'); emit('error');
    expect(await started).toBeFalse();
    duration = 10; controller.seek(1); emit('loadeddata');
    expect(writes).toEqual([]);
    expect(ready.calls.allArgs()).toEqual([[false]]);
  });

  it('la carga lenta no bloquea y todavía puede mostrar el video al llegar', async () => {
    jasmine.clock().install();
    try {
      const started = controller.start('/video/lento.mp4'); jasmine.clock().tick(8001);
      expect(await started).toBeFalse();
      duration = 10; state = 2; emit('loadeddata');
      expect(ready).toHaveBeenCalledWith(true);
    } finally { jasmine.clock().uninstall(); }
  });

  it('cancela la carga al abandonar la ruta y descarta eventos tardíos', async () => {
    const started = controller.start('/video/recorrido.mp4'); controller.dispose();
    expect(await started).toBeFalse();
    expect(element.hasAttribute('src')).toBeFalse();
    duration = 10; state = 2; emit('loadeddata'); controller.seek(1);
    expect(ready).not.toHaveBeenCalled(); expect(writes).toEqual([]);
    expect(element.pause).toHaveBeenCalledTimes(1);
  });
});
