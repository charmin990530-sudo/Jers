"""Render final Eevee con GPU NVIDIA: 10 segundos, 241 fotogramas originales."""
from pathlib import Path
import bpy
import gpu

root = Path(__file__).resolve().parents[1]
out = root / 'output' / 'boutique'
frames = out / 'frames'
frames.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(out / 'jers-boutique.blend'))
renderer = gpu.platform.renderer_get()
print('JERS_OPENGL_GPU:', renderer, flush=True)
if 'NVIDIA' not in renderer:
    raise RuntimeError('El render debe usar NVIDIA; se detiene para revisar la configuración.')
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = 1440, 810
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.eevee.use_gtao = True
scene.eevee.gtao_distance = 3
scene.eevee.gtao_factor = 1.25
scene.eevee.use_ssr = True
scene.eevee.use_soft_shadows = True
scene.eevee.taa_render_samples = 48
for obj in scene.objects:
    if obj.type == 'MESH':
        obj.data.use_auto_smooth = True
glass = bpy.data.materials.get('Cristal arquitectónico')
glass.blend_method = 'BLEND'
glass.use_screen_refraction = True
glass.show_transparent_back = False
glass.shadow_method = 'NONE'
scene.render.image_settings.file_format = 'PNG'
# Se guardan primero los extremos para disponer de posters idénticos al video.
order = [1, 241] + list(range(2, 241))
for index, frame in enumerate(order):
    filename = frames / f'{frame:04d}.png'
    if filename.exists():
        continue
    scene.frame_set(frame)
    scene.render.filepath = str(filename)
    bpy.ops.render.render(write_still=True)
    print(f'JERS_RENDER_PROGRESO {index + 1}/241', flush=True)
print('JERS_FILM_RENDERIZADO', flush=True)
bpy.ops.wm.quit_blender()
