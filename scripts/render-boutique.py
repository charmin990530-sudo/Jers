"""Boutique JERS: escena original, materiales procedurales y recorrido reproducible.

Escena compatible con Blender 3.6/4.2, sin complementos ni recursos de pago.
Render final: Blender 3.6 Eevee mediante render-boutique-film.py.
Ejemplo: blender -b --python scripts/render-boutique.py -- --scene-only
La animación se guarda fuera de los assets publicados, en output/.
"""
import argparse
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'boutique'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--preview', action='store_true')
parser.add_argument('--scene-only', action='store_true')
parser.add_argument('--engine', choices=['CYCLES', 'BLENDER_EEVEE_NEXT'], default='CYCLES')
parser.add_argument('--frame', type=int, default=1)
parser.add_argument('--start', type=int, default=1)
parser.add_argument('--end', type=int, default=241)
parser.add_argument('--samples', type=int, default=24)
parser.add_argument('--width', type=int, default=1440)
parser.add_argument('--height', type=int, default=810)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
random.seed(19)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def rgb(hex_color):
    def linear(v):
        v = int(v, 16) / 255
        return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4
    return (*[linear(hex_color[i:i + 2]) for i in (0, 2, 4)], 1)


def material(name, color, roughness=.4, metal=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgb(color)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = rgb(color)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    return mat


green = material('Verde profundo JERS #003D2F', '003D2F', .32)
ivory = material('Marfil JERS', 'F7F4E7', .46)
brass = material('Latón cepillado', 'C8A36B', .28, .82)
rose = material('Rosa empolvado', 'C98C8F', .35)
dark = material('Negro cosmético', '171E1B', .3)
leaf_mat = material('Follaje verde', '315A35', .45)
leaf_light = material('Hojas iluminadas', '52744A', .42)
white = material('Porcelana', 'FFFAED', .25)
glass = material('Cristal arquitectónico', 'F3FFF9', .07)
# Lámina de vidrio fino: transparencia con reflejo Fresnel, sin grosor opaco.
gn, gl = glass.node_tree.nodes, glass.node_tree.links
gn.clear()
transparent = gn.new('ShaderNodeBsdfTransparent')
reflection = gn.new('ShaderNodeBsdfGlossy')
reflection.inputs['Roughness'].default_value = .045
fresnel = gn.new('ShaderNodeFresnel')
fresnel.inputs['IOR'].default_value = 1.45
mix = gn.new('ShaderNodeMixShader')
output = gn.new('ShaderNodeOutputMaterial')
gl.new(fresnel.outputs[0], mix.inputs[0])
gl.new(transparent.outputs[0], mix.inputs[1])
gl.new(reflection.outputs[0], mix.inputs[2])
gl.new(mix.outputs[0], output.inputs['Surface'])
if bpy.app.version < (4, 2, 0):
    glass.blend_method = 'HASHED'


def stone(name, base, vein):
    mat = material(name, base, .32)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    p = nodes.get('Principled BSDF')
    tex = nodes.new('ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = 3.6
    tex.inputs['Detail'].default_value = 4
    tex.inputs['Roughness'].default_value = .75
    mapping = nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = (1, 1, 8)
    coord = nodes.new('ShaderNodeTexCoord')
    links.new(coord.outputs['Generated'], mapping.inputs[0])
    links.new(mapping.outputs[0], tex.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .43
    ramp.color_ramp.elements[0].color = rgb(base)
    ramp.color_ramp.elements[1].position = .61
    ramp.color_ramp.elements[1].color = rgb(vein)
    links.new(tex.outputs['Fac'], ramp.inputs[0])
    links.new(ramp.outputs[0], p.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .12
    bump.inputs['Distance'].default_value = .035
    links.new(tex.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs[0], p.inputs['Normal'])
    return mat


travertine = stone('Travertino marfil natural', 'EAE4D5', 'C8BEA6')
marble = stone('Mármol crema veteado', 'F5F0DF', 'D4C7AA')


def glow(name, color, strength):
    mat = material(name, color, .35)
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Emission Color' if 'Emission Color' in p.inputs else 'Emission'].default_value = rgb(color)
    p.inputs['Emission Strength'].default_value = strength
    return mat


led = glow('Luz cálida 3000K', 'FFDF9B', 4)


def finish(obj, name, mat, bevel=0):
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        if hasattr(obj.data, 'use_auto_smooth'):
            obj.data.use_auto_smooth = True
        mod = obj.modifiers.new('Cantos arquitectónicos', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        obj.modifiers.new('Normales ponderadas', 'WEIGHTED_NORMAL')
    return obj


def box(name, loc, scale, mat, bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)


def cylinder(name, loc, radius, depth, mat, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = finish(bpy.context.object, name, mat, .009)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth, curve.bevel_resolution = radius, 3
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, xyz in zip(spline.points, points):
        point.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(mat)
    return obj


serif = bpy.data.fonts.load('/usr/share/fonts/truetype/freefont/FreeSerif.ttf')
sans = bpy.data.fonts.load('/usr/share/fonts/truetype/freefont/FreeSans.ttf')


def text(body, loc, size, mat=brass, font=serif):
    curve = bpy.data.curves.new('Rotulación ' + body, 'FONT')
    curve.body, curve.align_x, curve.size = body, 'CENTER', size
    curve.font, curve.extrude, curve.bevel_depth = font, .003, .001
    obj = bpy.data.objects.new('Rotulación ' + body, curve)
    bpy.context.collection.objects.link(obj)
    obj.location, obj.rotation_euler = loc, (math.pi / 2, 0, 0)
    curve.materials.append(mat)
    return obj


def area(name, loc, target, energy, size, color=(1, .84, .65), shape='DISK', size_y=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.color, data.shape, data.size = energy, color, shape, size
    if size_y is not None:
        data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


# Envolvente, pavimento y fachada. Pasillo central despejado hasta recepción.
box('Acera de piedra clara', (0, -5, -.12), (24, 14, .22), travertine)
box('Pavimento interior', (0, 5, -.06), (8.4, 10.8, .12), marble)
for x in range(-4, 5):
    box('Junta del pavimento', (x, 5, .003), (.008, 10.4, .003), travertine, 0)
for y in range(-10, 11):
    box('Junta transversal', (0, y, -.002 if y < 0 else .004), (8.2, .008, .003), travertine, 0)
for x in [-4.12, 4.12]:
    box('Muro lateral', (x, 5, 2.15), (.24, 10.5, 4.3), ivory)
    box('Zócalo latón', (x * .969, 5, .15), (.04, 10, .25), brass)
box('Muro trasero verde', (0, 10.2, 2.1), (8.4, .3, 4.2), green)
box('Techo marfil', (0, 5.2, 4.2), (8.5, 10.8, .18), ivory)
for x in [-3.5, 3.5]:
    box('Cornisa luminosa', (x, 5, 4.03), (.06, 10, .04), led)
    for y in [1.2, 3.6, 6, 8.4]:
        cylinder('Aro empotrado', (x, y, 4.06), .11, .035, brass)
        cylinder('Difusor empotrado', (x, y, 4.035), .085, .02, led)
        area('Downlight', (x, y, 4.01), (x * .75, y, 0), 85, 1)
box('Fascia exterior verde', (0, -.18, 4.04), (9, .58, 1.04), green, .055)
box('Cornisa de latón exterior', (0, -.5, 4.57), (9.1, .11, .055), brass)
box('Dintel de latón', (0, -.5, 3.5), (9, .12, .055), brass)
text('JERS', (0, -.49, 3.84), .63, ivory)
text('B E A U T Y   A T E L I E R', (0, -.495, 3.62), .085, brass, sans)
for x in [-4.25, -1.32, 1.32, 4.25]:
    box('Pilar fachada', (x, -.13, 1.76), (.2, .5, 3.5), green)
    box('Perfil vertical latón', (x - .115, -.407, 1.77), (.025, .025, 3.42), brass, .005)
for side in [-1, 1]:
    x = side * 2.8
    box('Cristal escaparate', (x, -.18, 1.76), (2.7, .025, 3.36), glass, .003)
    box('Base escaparate', (x, .52, .25), (2.65, 1.1, .46), travertine, .055)
    text('MAKEUP' if side < 0 else 'HAIR RITUALS', (x, -.215, 2.9), .13, brass, sans)

# Puerta automática de dos hojas: se abre al acercarse, sin cortes de cámara.
for side in [-1, 1]:
    root = bpy.data.objects.new('Hoja automática', None)
    bpy.context.collection.objects.link(root)
    members = [box('Vidrio de puerta', (side * .61, -.17, 1.72), (1.19, .025, 3.38), glass, .002)]
    for x in [side * .025, side * 1.2]:
        members.append(box('Marco puerta', (x, -.19, 1.72), (.04, .045, 3.42), brass, .005))
    for z in [.025, 3.42]:
        members.append(box('Travesaño puerta', (side * .61, -.19, z), (1.2, .045, .04), brass, .004))
    members.append(box('Tirador vertical', (side * .14, -.25, 1.48), (.035, .06, .6), brass, .015))
    for obj in members:
        obj.parent = root
    for frame, offset in [(1, 0), (25, 0), (72, side * 1.15), (241, side * 1.15)]:
        root.location.x = offset
        root.keyframe_insert(data_path='location', frame=frame)


def product(x, y, z, kind=0):
    """Envases en escala real: sin texturas de terceros ni marcas inventadas."""
    color = [green, rose, white, dark][random.randrange(4)]
    if kind == 0:
        cylinder('Base labial', (x, y, z + .055), .026, .11, brass, 16)
        cylinder('Barra de labios', (x, y, z + .13), .018, .075, rose, 16)
    elif kind == 1:
        cylinder('Frasco sérum', (x, y, z + .075), .041, .15, color, 20)
        cylinder('Dosificador dorado', (x, y, z + .17), .027, .045, brass, 20)
    elif kind == 2:
        cylinder('Tarro de crema', (x, y, z + .045), .063, .09, color, 24)
        cylinder('Tapa crema', (x, y, z + .098), .064, .025, brass, 24)
    else:
        box('Estuche de producto', (x, y, z + .11), (.08, .065, .22), color, .008)
        box('Etiqueta marfil', (x, y - .034, z + .12), (.05, .003, .06), ivory, .002)


# Muebles laterales: nichos, baldas, LED y producto repetido con variación.
for side in [-1, 1]:
    for y in [2.1, 4.65, 7.2]:
        box('Armario bajo verde', (side * 3.65, y, .43), (.76, 2.3, .86), green, .035)
        box('Encimera travertino', (side * 3.62, y, .89), (.9, 2.36, .08), travertine)
        box('Fondo de nicho', (side * 3.97, y, 2.2), (.05, 2.31, 2.35), green)
        for yy in [y - 1.15, y + 1.15]:
            box('Montante de latón', (side * 3.56, yy, 2.1), (.035, .035, 2.35), brass, .005)
        for z in [1.3, 1.85, 2.4, 2.95]:
            box('Balda de piedra', (side * 3.6, y, z), (.82, 2.3, .045), ivory, .009)
            box('Tira LED bajo balda', (side * 3.52, y, z - .029), (.025, 2.12, .012), led, .003)
            for n in range(7):
                product(side * (3.49 + random.uniform(-.07, .07)), y - .88 + n * .29, z + .024, (n + int(z * 10)) % 4)
        for n in range(10):
            box('Ranura de puerta acanalada', (side * 3.259, y - .98 + n * .215, .43), (.012, .008, .7), brass, .001)

# Islas de exposición: curvas suaves, travertino, bandejas de latón.
for side, y in [(-1, 3.3), (1, 5.1)]:
    x = side * 1.95
    cylinder('Plinto de exposición', (x, y, .49), .62, .98, green, 64)
    cylinder('Remate de piedra', (x, y, 1.01), .66, .08, travertine, 64)
    cylinder('Bandeja latón', (x, y, 1.067), .43, .025, brass, 48)
    for n in range(7):
        angle = n / 7 * math.tau
        product(x + math.cos(angle) * .29, y + math.sin(angle) * .29, 1.08, n % 4)
    product(x, y, 1.08, 1)

# Escaparates visibles desde fuera.
for side in [-1, 1]:
    for n in range(3):
        x = side * 2.8 + (n - 1) * .52
        h = [.28, .5, .36][n]
        cylinder('Peana escaparate', (x, .52, .48 + h / 2), .2, h, green, 48)
        for j in range(3):
            product(x + (j - 1) * .09, .52, .48 + h, (j + n) % 4)

# Recepción acanalada y firma física sobre el fondo verde.
box('Mostrador curvo', (0, 8.68, .55), (3.2, 1.05, 1.1), travertine, .22)
box('Tapa de mármol recepción', (0, 8.68, 1.13), (3.29, 1.13, .1), marble, .18)
for n in range(39):
    x = -1.38 + n * .073
    box('Estría del mostrador', (x, 8.144, .54), (.018, .018, .88), ivory, .007)
text('JERS', (0, 10.025, 2.52), .78, brass)
text('M A Q U I L L A J E   &   C U I D A D O', (0, 10.013, 2.23), .09, ivory, sans)
text('B Y   J E R S', (0, 8.126, .61), .13, brass, sans)
for side in [-1, 1]:
    for x in [side * 2.25, side * 3.45]:
        box('Moldura fondo', (x, 10.027, 2.2), (.025, .025, 3.1), brass, .004)
    for z in [.65, 3.75]:
        box('Moldura horizontal fondo', (side * 2.85, 10.027, z), (1.22, .025, .025), brass, .004)
area('Lavado de firma', (0, 9.1, 3.8), (0, 10, 2.5), 220, 2.4)
box('Terminal sobre mostrador', (.8, 8.8, 1.28), (.27, .15, .21), dark, .025)

# Dos luminarias anulares sobre la circulación.
for y in [3.25, 6.6]:
    for z, radius, mat in [(3.5, .65, brass), (3.476, .635, led)]:
        tube('Lámpara anular', [(math.cos(a * math.tau / 96) * radius, y + math.sin(a * math.tau / 96) * radius, z) for a in range(97)], .018, mat)
    for x in [-.44, .44]:
        tube('Suspensión latón', [(x, y, 3.51), (x, y, 4.1)], .006, brass)
    area('Luz colgante suave', (0, y, 3.46), (0, y, 0), 180, 1.2)


def plant(x, y, scale=1):
    cylinder('Macetero de piedra', (x, y, .32 * scale), .27 * scale, .64 * scale, travertine, 40)
    for i in range(17):
        angle = random.uniform(0, math.tau)
        height = random.uniform(.6, 1.5) * scale
        end = (x + math.cos(angle) * .38 * scale, y + math.sin(angle) * .38 * scale, .6 * scale + height)
        tube('Tallo', [(x, y, .5 * scale), ((x + end[0]) / 2, (y + end[1]) / 2, end[2] * .7), end], .009 * scale, leaf_mat)
        # Lámina curva, nervio central y extremos afinados: no elipsoides.
        vertices, faces = [], []
        length = random.uniform(.42, .7) * scale
        width = random.uniform(.12, .19) * scale
        for row in range(9):
            t = row / 8
            half = max(.002, math.sin(t * math.pi) ** .8 * width)
            for col in [-1, 0, 1]:
                across = col * half
                radial = t * length
                vertices.append((end[0] + math.cos(angle) * radial - math.sin(angle) * across,
                                 end[1] + math.sin(angle) * radial + math.cos(angle) * across,
                                 end[2] + .22 * math.sin(t * math.pi) * scale - .16 * t * scale - abs(col) * .035 * scale))
        for row in range(8):
            for col in range(2):
                a = row * 3 + col
                faces.append((a, a + 1, a + 4, a + 3))
        mesh = bpy.data.meshes.new('Hoja botánica')
        mesh.from_pydata(vertices, [], faces)
        leaf = bpy.data.objects.new('Hoja natural', mesh)
        bpy.context.collection.objects.link(leaf)
        mesh.materials.append(leaf_light if i % 3 == 0 else leaf_mat)
        sub = leaf.modifiers.new('Curvatura de hoja', 'SUBSURF')
        sub.levels, sub.render_levels = 1, 1
        for poly in leaf.data.polygons:
            poly.use_smooth = True


for x, y, s in [(-3.83, -.95, 1.08), (3.83, -.95, 1.08), (-2.95, 9.1, .8), (2.95, 9.1, .8)]:
    plant(x, y, s)

# Cielo físico y luz de día suave. La GPU calcula reflexión, transmisión y rebotes.
world = bpy.data.worlds.new('Luz natural')
bpy.context.scene.world = world
world.use_nodes = True
nodes, links = world.node_tree.nodes, world.node_tree.links
sky = nodes.new('ShaderNodeTexSky')
sky.sky_type, sky.sun_elevation, sky.sun_rotation = 'NISHITA', .65, 2.2
sky.sun_intensity, sky.altitude = .65, .2
links.new(sky.outputs[0], nodes.get('Background').inputs['Color'])
nodes.get('Background').inputs['Strength'].default_value = .28
area('Softbox de fachada', (-4, -5, 6), (0, 1, 1.6), 1100, 7, (1, .93, .83))
for y in [1.4, 4.6, 7.8]:
    area('Relleno interior', (0, y, 3.95), (0, y, 0), 210, 3, (1, .9, .76))

scene = bpy.context.scene
bpy.ops.object.camera_add()
camera = bpy.context.object
scene.camera = camera
camera.data.lens = 25
camera.data.clip_start, camera.data.clip_end = .05, 150
# Un único travelling con altura humana. La puerta siempre queda en el centro.
for frame in range(1, 242):
    p = (frame - 1) / 240
    # Progresión continua; el scroll es quien fija la velocidad final.
    eased = p * p * (3 - 2 * p)
    camera.location = (.18 * math.sin(p * math.pi), -8.7 + 14.45 * eased, 1.83 - .13 * p)
    target = Vector((0, 9.25, 1.8 + .1 * (1 - p)))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.keyframe_insert(data_path='location', frame=frame)
    camera.keyframe_insert(data_path='rotation_euler', frame=frame)
for curve in camera.animation_data.action.fcurves:
    for key in curve.keyframe_points:
        key.interpolation = 'LINEAR'

scene.render.engine = args.engine
scene.render.resolution_x, scene.render.resolution_y = args.width, args.height
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.frame_start, scene.frame_end = args.start, args.end
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX' if bpy.app.version >= (4, 0, 0) else 'Filmic'
scene.view_settings.look = 'AgX - Medium High Contrast' if bpy.app.version >= (4, 0, 0) else 'Medium High Contrast'
if args.engine == 'CYCLES':
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'CUDA'
    prefs.get_devices()
    devices = []
    for device in prefs.devices:
        device.use = device.type == 'CUDA'
        if device.use:
            devices.append(device.name)
    if not devices:
        raise RuntimeError('No se encontró GPU CUDA: se detiene para no renderizar solo con CPU.')
    print('JERS_RENDER_GPU:', devices, flush=True)
    scene.cycles.device = 'GPU'
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.adaptive_threshold = .08
    scene.cycles.max_bounces = 7
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3
    scene.cycles.transmission_bounces = 5
    scene.render.use_persistent_data = True
else:
    scene.eevee.taa_render_samples = args.samples
    scene.eevee.use_raytracing = True

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'jers-boutique.blend'))
if args.scene_only:
    pass
elif args.preview:
    scene.frame_set(args.frame)
    scene.render.filepath = str(OUT / f'preview-{args.frame:04d}.png')
    bpy.ops.render.render(write_still=True)
else:
    frames = OUT / 'frames'
    frames.mkdir(exist_ok=True)
    scene.render.filepath = str(frames / '') + '/'
    bpy.ops.render.render(animation=True)
