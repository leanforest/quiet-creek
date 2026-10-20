"""Build the reference cabin and a genuinely open stone canal in Blender.

Run: blender --background --python scripts/build_cottage.py
Coordinates below use Three.js Y-up; export converts the Blender axes back.
No downloaded models or textures are required.
"""
from pathlib import Path
import json
import math
import random

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from io_scene_gltf2.io.exp import meshopt

ROOT = Path(__file__).resolve().parents[1]
random.seed(27)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.materials):
    for block in list(datablocks):
        if not block.users:
            datablocks.remove(block)

materials = {}
meshes = {}


def noise_field(size, cell, seed):
    rng = np.random.default_rng(seed)
    coarse = rng.random((cell + 1, cell + 1))
    coord = np.arange(size) * cell / size
    lo = coord.astype(int)
    t = coord - lo
    t = t * t * (3 - 2 * t)
    horizontal = coarse[:, lo] * (1 - t) + coarse[:, lo + 1] * t
    return horizontal[lo] * (1 - t[:, None]) + horizontal[lo + 1] * t[:, None]


def image_texture(name, kind, tint, normal=False):
    size = 512
    yy, xx = np.mgrid[0:size, 0:size] / size
    rough = noise_field(size, 24, 32)
    fine = noise_field(size, 110, 4)
    broad = noise_field(size, 7, 28)
    if kind == 'wood':
        # Grain follows the long edge of each board, with broad weathering rather
        # than high-contrast pinstripes that shimmer in the distant facade.
        grain = np.sin((yy * 65 + np.sin(xx * 9) * .21 + broad * .24) * math.tau)
        value = .78 + broad * .18 + fine * .06 + grain * .025
        value -= np.maximum(0, np.sin((yy * 17 + broad * .15) * math.tau) - .93) * .38
        height = .28 * fine + .12 * grain + broad * .35
    else:
        value = .66 + broad * .34 + rough * .23 + fine * .11
        height = rough * .57 + broad * .3 + fine * .2
    pixels = np.ones((size, size, 4), dtype=np.float32)
    if normal:
        gy, gx = np.gradient(height)
        strength = 4 if kind == 'wood' else 6
        normals = np.stack((-gx * strength, -gy * strength, np.ones_like(gx)), axis=-1)
        normals /= np.linalg.norm(normals, axis=-1)[..., None]
        pixels[:, :, :3] = normals * .5 + .5
    else:
        pixels[:, :, :3] = np.clip(value[..., None] * np.array(tint), 0, 1)
    # Filter at the original resolution before packing 256px detail textures.
    # This preserves normal strength and avoids aliasing the fine wood grain.
    size //= 2
    pixels = pixels.reshape(size, 2, size, 2, 4).mean(axis=(1, 3))
    img = bpy.data.images.new(name, width=size, height=size)
    if normal:
        img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(pixels.ravel())
    img.update()
    img.pack()
    return img


wood_normal = image_texture('Weathered timber grain normal', 'wood', (1, 1, 1), True)
stone_normal = image_texture('Granite micro relief normal', 'stone', (1, 1, 1), True)
# All tinted variants use the same grain. Use each family's brightest channel
# as neutral gray so glTF tint factors stay within [0, 1].
albedo_tints = {'wood': .51, 'stone': .445}
albedo_textures = {kind: image_texture('Shared ' + kind + ' albedo', kind, (tint,) * 3)
                   for kind, tint in albedo_tints.items()}
albedo_means = {kind: sum(image.pixels[::4]) / (image.size[0] * image.size[1])
                for kind, image in albedo_textures.items()}


def srgb_to_linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def material(name, color, rough=.8, texture=None, normal=None, emission=0, bevel=.02):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    if texture:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = albedo_textures[texture]
        tint = mat.node_tree.nodes.new('ShaderNodeMix')
        tint.data_type = 'RGBA'
        tint.blend_type = 'MULTIPLY'
        tint.inputs[0].default_value = 1
        # Generated image pixels contain sRGB values, while glTF color factors
        # multiply in linear space. Match the original tint at the mean grain.
        mean = albedo_means[texture]
        factor = [srgb_to_linear(c * mean / albedo_tints[texture]) / srgb_to_linear(mean) for c in color]
        tint.inputs[7].default_value = (*factor, 1)
        mat.node_tree.links.new(tex.outputs['Color'], tint.inputs[6])
        mat.node_tree.links.new(tint.outputs[2], p.inputs['Base Color'])
    if normal:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = normal
        bump = mat.node_tree.nodes.new('ShaderNodeNormalMap')
        bump.inputs['Strength'].default_value = .6
        mat.node_tree.links.new(tex.outputs['Color'], bump.inputs['Color'])
        mat.node_tree.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    materials[name] = mat
    meshes[name] = {'v': [], 'f': [], 'uv': [], 'bevel': bevel}
    return name


woods = [material('Timber_' + str(i), c, texture='wood', normal=wood_normal, bevel=.007)
         for i, c in enumerate(((.48, .315, .19), (.51, .34, .21), (.465, .305, .185), (.495, .325, .20)))]
beam_mat = material('Structural dark oak', (.285, .185, .105), texture='wood', normal=wood_normal)
cream = material('Aged ivory painted trim', (.65, .625, .51), rough=.76, bevel=.012)
cream_dark = material('Trim shaded endgrain', (.43, .40, .31), rough=.83, bevel=.012)
door_mat = material('Deep walnut door', (.28, .17, .085), texture='wood', normal=wood_normal)
shutter_mat = material('Weathered sage shutters', (.22, .29, .215), texture='wood', normal=wood_normal, bevel=.012)
curtain_mat = material('Linen curtains', (.64, .545, .36), rough=.95, bevel=0)
clay = material('Weathered terracotta', (.36, .19, .115), rough=.95, bevel=.025)
plant = material('Porch foliage', (.17, .24, .085), rough=.86, bevel=0)
iron = material('Forged iron', (.06, .065, .063), rough=.43, bevel=.006)
glow = material('WindowGlow', (1, .57, .19), rough=.31, emission=.7, bevel=0)
glass = material('Recessed glass', (.047, .073, .067), rough=.2, bevel=0)
roof_mats = [material('Slate tile ' + str(i), c, texture='stone', normal=stone_normal, bevel=.009)
             for i, c in enumerate(((.145, .17, .16), (.175, .195, .178), (.205, .21, .19)))]
stones = [material('Canal granite ' + str(i), c, texture='stone', normal=stone_normal, bevel=.045)
          for i, c in enumerate(((.35, .37, .355), (.41, .425, .395), (.30, .335, .335), (.445, .425, .36), (.365, .39, .375)))]
moss = material('Moss in masonry joints', (.105, .15, .052), rough=1, bevel=.006)
mortar = material('Recessed tunnel mortar', (.185, .215, .195), texture='stone', normal=stone_normal, bevel=0)


def add_mesh(mat, verts, faces, uvs=None):
    data = meshes[mat]
    start = len(data['v'])
    data['v'].extend(verts)
    for face in faces:
        data['f'].append(tuple(start + x for x in face))
        if uvs:
            data['uv'].append(uvs)
        elif len(face) == 4:
            data['uv'].append([(0, 0), (1, 0), (1, 1), (0, 1)])
        else:
            data['uv'].append([(0, 0), (1, 0), (.5, 1)])


def box(mat, center, dims, axes=None):
    cx, cy, cz = center
    dx, dy, dz = [d / 2 for d in dims]
    points = [(-dx, -dy, -dz), (dx, -dy, -dz), (dx, dy, -dz), (-dx, dy, -dz),
              (-dx, -dy, dz), (dx, -dy, dz), (dx, dy, dz), (-dx, dy, dz)]
    if axes:
        points = [(cx + sum(p[j] * axes[j][0] for j in range(3)),
                   cy + sum(p[j] * axes[j][1] for j in range(3)),
                   cz + sum(p[j] * axes[j][2] for j in range(3))) for p in points]
    else:
        points = [(cx + x, cy + y, cz + z) for x, y, z in points]
    # Outward winding in right handed Three.js coordinates.
    faces = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    # Keep texel density consistent across small blocks and long beams. For
    # timber, turn the UVs so the grain follows each face's longest edge.
    data = meshes[mat]
    start = len(data['v'])
    data['v'].extend(points)
    for face in faces:
        data['f'].append(tuple(start + i for i in face))
        u = (Vector(points[face[1]]) - Vector(points[face[0]])).length / .72
        v = (Vector(points[face[-1]]) - Vector(points[face[0]])).length / .72
        coords = [(0, 0), (u, 0), (u, v), (0, v)]
        if mat in woods + [beam_mat, door_mat, shutter_mat] and v > u:
            coords = [(b, a) for a, b in coords]
        data['uv'].append(coords)


def beam(mat, a, b, width=.1, depth=None):
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    reference = Vector((0, 0, 1)) if abs(axis.z) < .95 else Vector((1, 0, 0))
    x = axis.cross(reference).normalized()
    z = x.cross(axis).normalized()
    box(mat, (a + b) / 2, (width, (b - a).length, depth or width), (x, axis, z))


def window(x, y, z, w=.95, h=1.3, side=False, lit=True, shutters=False):
    # Local front panel; side windows are rotated to face the side wall.
    def piece(mat, c, d):
        if side:
            box(mat, (x + c[2] * (1 if x > 0 else -1), y + c[1], z + c[0]), (d[2], d[1], d[0]))
        else:
            box(mat, (x + c[0], y + c[1], z + c[2]), d)
    piece(beam_mat, (0, 0, -.067), (w + .18, h + .18, .10))
    piece(glow if lit else glass, (0, 0, -.006), (w - .085, h - .095, .018))
    for sign in [-1, 1]:
        piece(cream_dark, (sign * w / 2, 0, .015), (.095, h + .10, .17))
        piece(cream_dark, (0, sign * h / 2, .015), (w + .075, .075, .17))
        piece(cream, (sign * (w / 2 + .045), 0, .112), (.085, h + .20, .08))
        piece(cream, (0, sign * (h / 2 + .037), .112), (w + .17, .085, .08))
    piece(cream, (0, 0, .072), (.043, h, .055))
    piece(cream, (0, -.10, .072), (w, .043, .055))
    piece(cream, (0, -h / 2 - .095, .16), (w + .29, .12, .32))
    piece(cream_dark, (0, h / 2 + .12, .13), (w + .25, .055, .17))
    # Warm inner curtain margins give the illuminated panes depth.
    if lit:
        for sign in [-1, 1]:
            piece(curtain_mat, (sign * (w / 2 - .16), 0, .012), (.18, h - .1, .022))
    if shutters:
        for sign in [-1, 1]:
            sx = sign * (w / 2 + .255)
            for i in range(3):
                piece(shutter_mat, (sx + (i - 1) * .09, 0, .065), (.084, h + .12, .09))
            for sy in [-h * .34, h * .34]:
                piece(beam_mat, (sx, sy, .122), (.27, .045, .035))


def cut_openings(segments, openings, y):
    for ox, oy, ow, oh in openings:
        if abs(y - oy) >= oh / 2 + .035:
            continue
        cut = (ox - ow / 2 - .035, ox + ow / 2 + .035)
        remaining = []
        for left, right in segments:
            if cut[1] <= left or cut[0] >= right:
                remaining.append((left, right))
            else:
                if left < cut[0]: remaining.append((left, cut[0]))
                if right > cut[1]: remaining.append((cut[1], right))
        segments = remaining
    return segments


def plank_pieces(left, right, bottom, top, openings):
    # Split the few boards that meet a reveal precisely at its lintel/sill;
    # removing whole rows can expose daylight above or below a window frame.
    levels = sorted({bottom, top} | {oy + sign * (oh / 2 + .035)
                    for _, oy, _, oh in openings for sign in [-1, 1]
                    if bottom < oy + sign * (oh / 2 + .035) < top})
    for low, high in zip(levels, levels[1:]):
        for start, end in cut_openings([(left, right)], openings, (low + high) / 2):
            if end - start > .025:
                yield start, end, low, high


# Timber wall faces have plank joints, slight shade variation, and window openings.
front_z, rear_z = -22.1, -26.75
wall_bottom, eave = 3.06, 7.40
front_openings = [(-1.54, 4.45, .98, 1.43), (1.54, 4.45, .98, 1.43),
                  (0, 4.11, .94, 2.10), (-1.52, 6.67, .90, 1.28),
                  (1.52, 6.67, .90, 1.28), (0, 7.48, .97, 1.40)]
for wall_z in [front_z, rear_z]:
    for row in range(20):
        y = wall_bottom + .1085 + row * .217
        openings = front_openings if wall_z == front_z else []
        for l, r, low, high in plank_pieces(-2.5, 2.5, y - .105, y + .105, openings):
            box(random.choice(woods), ((l + r) / 2, (low + high) / 2, wall_z), (r - l, high - low, .13))
    # Horizontal gable boards accurately taper to the ridge.
    for row in range(11):
        y = 7.47 + row * .162
        half = max(.055, 2.5 * (9.19 - y) / (9.19 - 7.40))
        segments = [(-half, half)]
        if wall_z == front_z and y < 8.21:
            segments = [(-half, -.56), (.56, half)]
        for l, r in segments:
            if r > l:
                box(random.choice(woods), ((l + r) / 2, y, wall_z), (r - l, .153, .105))

for side in [-1, 1]:
    openings = [(z, y, .85, 1.2) for z in [-23.6, -25.65] for y in [4.50, 6.65]]
    for row in range(20):
        y = wall_bottom + .1085 + row * .217
        for left, right, low, high in plank_pieces(rear_z, front_z, y - .105, y + .105, openings):
            box(random.choice(woods), (side * 2.5, (low + high) / 2, (left + right) / 2), (.13, high - low, right - left))
    for z in [-23.6, -25.65]:
        for y in [4.50, 6.65]:
            window(side * 2.54, y, z, .85, 1.2, side=True, lit=True, shutters=y < 5)

# Foundation sills, corner trim and structural floor banding.
for x in [-2.49, 2.49]:
    for z in [front_z + .06, rear_z - .06]:
        box(cream, (x, 5.23, z), (.145, 4.43, .14))
for y in [3.07, 5.70, 7.40]:
    if y == 7.40:
        for sign in [-1, 1]:
            box(beam_mat, (sign * 1.605, y, front_z + .10), (1.99, .15, .15))
    else:
        box(beam_mat if y != 5.70 else cream_dark, (0, y, front_z + .10), (5.2, .15, .15))
    box(beam_mat, (0, y, rear_z - .10), (5.2, .15, .15))
    for x in [-2.55, 2.55]:
        box(beam_mat, (x, y, -24.425), (.15, .15, 4.8))

for x, y, w, h in front_openings:
    if x != 0 or y > 7:
        window(x, y, front_z + .05, w, h, shutters=y < 5)

# Recessed paneled front door with an ivory reveal and brass handle.
box(door_mat, (0, 4.13, front_z + .015), (.97, 2.16, .115))
for x in [-.525, .525]:
    box(cream, (x, 4.17, front_z + .095), (.09, 2.27, .11))
box(cream, (0, 5.30, front_z + .095), (1.14, .10, .11))
box(cream_dark, (0, 5.39, front_z + .11), (1.26, .085, .21))
box(stones[1], (0, 3.05, front_z + .15), (1.18, .10, .37))
for y, h in [(3.72, .77), (4.68, .72)]:
    for x in [-.235, .235]:
        box(beam_mat, (x, y, front_z + .087), (.35, h, .045))
        box(door_mat, (x, y, front_z + .115), (.285, h - .085, .019))
box(iron, (.355, 4.09, front_z + .15), (.065, .16, .09))

# Boarded porch and second-storey balcony.
for deck_y in [3.00, 5.78]:
    for i in range(24):
        box(random.choice(woods), (-2.64 + i * .23, deck_y, -21.51), (.218, .105, 1.41))
    box(beam_mat, (0, deck_y - .10, -20.87), (5.67, .22, .23))
    box(cream, (0, deck_y + .015, -20.75), (5.71, .075, .17))
    for x in [-2.78, 2.78]:
        box(cream, (x, deck_y - .05, -21.46), (.13, .17, 1.4))
for x in [-2.68, -1.15, 1.15, 2.68]:
    box(beam_mat, (x, 4.38, -20.92), (.105, 2.77, .115))
    box(cream_dark, (x, 3.13, -20.92), (.155, .23, .17))
    box(cream_dark, (x, 5.60, -20.92), (.175, .16, .17))


def railing(x0, x1, y, z):
    for rail_y in [y + .19, y + .91]:
        box(cream, ((x0 + x1) / 2, rail_y, z), (x1 - x0, .077, .105))
    count = max(2, int((x1 - x0) / .25))
    for i in range(count + 1):
        x = x0 + .05 + i * (x1 - x0 - .1) / count
        box(cream_dark, (x, y + .53, z), (.047, .71, .05))
    for x in [x0, x1]:
        box(cream, (x, y + .48, z), (.075, .98, .082))
        box(cream_dark, (x, y + .99, z), (.10, .032, .11))


railing(-2.68, 2.68, 5.80, -20.91)
railing(-2.65, -1.10, 3.06, -20.91)
railing(1.10, 2.65, 3.06, -20.91)
for x in [-2.69, 2.69]:
    for y in [3.06, 5.8]:
        for rail_y in [y + .2, y + .91]:
            box(cream, (x, rail_y, -21.52), (.068, .06, 1.20))
        for i in range(5):
            box(cream_dark, (x, y + .54, -21.02 - i * .24), (.047, .7, .047))

# Three shallow front steps, porch braces and a small porch lantern.
for i in range(3):
    box(random.choice(woods), (0, 2.87 + i * .05, -20.38 - i * .14), (1.35, .09, .34))
for x in [-2.68, 2.68]:
    beam(beam_mat, (x, 5.16, -20.92), (x - math.copysign(.42, x), 5.68, -20.92), .065)
    beam(beam_mat, (x, 5.19, -20.92), (x, 5.64, -21.37), .075)
for i in range(8):
    # Exposed floor joists give the balcony a shaded underside.
    box(beam_mat, (-2.5 + i * .715, 5.61, -21.47), (.085, .18, 1.41))
box(iron, (-.80, 4.87, -21.93), (.15, .23, .14))
box(glow, (-.80, 4.87, -21.846), (.10, .15, .055))
box(iron, (-.80, 5.02, -21.87), (.21, .055, .20))

# Recessed flower boxes sit against the facade, clear of the porch camera path.
for px in [-1.54, 1.54]:
    box(beam_mat, (px, 3.48, -21.70), (1.06, .24, .36))
    for y in [3.40, 3.52, 3.62]:
        box(woods[1], (px, y, -21.50), (1.10, .08, .05))
    for x in [px - .50, px + .50]:
        box(cream_dark, (x, 3.52, -21.47), (.045, .27, .05))
    for i in range(28):
        angle = random.uniform(0, math.tau)
        stem = Vector((px + random.uniform(-.44, .44), 3.62, -21.68 + random.uniform(-.10, .10)))
        length = random.uniform(.12, .27)
        tip = stem + Vector((math.cos(angle) * length * .65, length, math.sin(angle) * length * .65))
        spread = Vector((-math.sin(angle) * .055, .025, math.cos(angle) * .055))
        middle = stem.lerp(tip, .53)
        add_mesh(plant, [stem, middle + spread, tip, middle - spread, middle + Vector((0, .026, 0))],
                 [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)])

# A small slatted bench and clay pot add human scale without crowding the deck.
for x in [2.02, 2.40]:
    for z in [-21.88, -21.22]:
        box(beam_mat, (x, 3.22, z), (.065, .43, .065))
for i in range(4):
    box(woods[1], (2.04 + i * .12, 3.45, -21.56), (.105, .065, .87))
for i in range(3):
    box(woods[2], (2.46, 3.67 + i * .13, -21.56), (.075, .10, .87))
box(clay, (-2.22, 3.18, -21.94), (.28, .32, .28))
box(cream_dark, (-2.22, 3.34, -21.94), (.22, .025, .22))

# Individually overlapping dark slate tiles, organized into three material meshes.
ridge_y, ridge_x = 9.27, 0
for sign in [-1, 1]:
    down = Vector((sign * 2.95, -1.96, 0)).normalized()
    length = math.sqrt(2.95 ** 2 + 1.96 ** 2)
    outward = Vector((sign * 1.96, 2.95, 0)).normalized()
    across = Vector((0, 0, sign))
    # Solid dark underlay prevents gaps between tiles.
    middle = Vector((0, ridge_y, -24.38)) + down * (length / 2)
    box(roof_mats[0], middle, (length + .14, .07, 5.55), (down, outward, across))
    for row in range(11):
        distance = row * .327 + .08
        for col in range(19):
            z = -27.10 + col * .3 + (row % 2) * .145
            if z > -21.56: continue
            center = Vector((0, ridge_y, z)) + down * distance + outward * (.044 + (11 - row) * .002)
            center += outward * random.uniform(-.005, .007)
            box(random.choice(roof_mats), center, (.43 + random.uniform(-.012, .012), .044, .291), (down, outward, across))
    for i in range(9):
        z = -27.01 + i * .665
        beam(beam_mat, (0, 9.15, z), (sign * 3.00, 7.16, z), .085, .12)
    beam(cream, (0, 9.32, -21.52), (sign * 3.03, 7.31, -21.52), .145, .17)
    beam(cream_dark, (0, 9.30, -27.22), (sign * 3.02, 7.30, -27.22), .13, .15)
    box(cream_dark, (sign * 2.97, 7.31, -24.38), (.135, .15, 5.79))
for i in range(24):
    box(roof_mats[1], (0, 9.33, -27.13 + i * .24), (.22, .10, .252))

# Tall stone chimney with offset courses, projecting crown, and a hollow black flue.
for row in range(15):
    y = 7.26 + row * .18
    for part in [-1, 1]:
        box(stones[(row + part) % len(stones)], (1.65 + part * .14, y, -25.28), (.277, .168, .57))
box(stones[1], (1.65, 9.95, -25.28), (.71, .14, .72))
box(iron, (1.65, 10.03, -25.28), (.47, .04, .48))
for x in [-.30, .30]:
    box(stones[2], (1.65 + x, 10.04, -25.28), (.11, .17, .65))
for z in [-.275, .275]:
    box(stones[2], (1.65, 10.04, -25.28 + z), (.59, .17, .1))


def arch_point(theta, radius_x, radius_y, z):
    return (math.cos(theta) * radius_x, .65 + math.sin(theta) * radius_y, z)


def arch_block(theta0, theta1, front, back, outer=True, mat=None):
    ax, ay = 2.40, 1.45
    bx, by = (2.88 + random.uniform(-.013, .013), 1.91 + random.uniform(-.012, .012)) if outer else (2.67, 1.72)
    verts = []
    for z in [front, back]:
        verts.extend([arch_point(theta0, ax, ay, z), arch_point(theta1, ax, ay, z),
                      arch_point(theta1, bx, by, z), arch_point(theta0, bx, by, z)])
    add_mesh(mat or random.choice(stones), verts,
             [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])


# Both stone portals contain an elliptical opening. There is no wall across it.
def outside_arch(y):
    if y <= .65:
        return 2.915
    return 2.915 * math.sqrt(max(0, 1 - ((y - .65) / 1.925) ** 2)) + .015


for facade_z in [-20.91, -27.04]:
    for row in range(8):
        y0, y1 = -.25 + row * .375, -.25 + (row + 1) * .375
        if y0 > 2.7: continue
        y = (y0 + y1) / 2
        opening = outside_arch(y0)
        for sign in [-1, 1]:
            left, right = opening, 7.10
            x = left
            count = 0
            while x < right - .10:
                width = min(random.uniform(.70, 1.20), right - x)
                if count == 0 and row % 2: width = min(.49, right - x)
                stone = random.choice(stones)
                if count == 0 and y1 > .65:
                    # Fit the first stone to the arch curve. A rectangular cut
                    # left an obvious daylight slit above the vault in v2.
                    left_bottom = outside_arch(y0 + .013)
                    left_top = outside_arch(y1 - .013)
                    stone_right = x + width - .017
                    verts = [(sign * px, py, pz) for pz in [facade_z - .26, facade_z + .26]
                             for px, py in [(left_bottom, y0 + .013), (stone_right, y0 + .013),
                                            (stone_right, y1 - .013), (left_top, y1 - .013)]]
                    add_mesh(stone, verts, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                                          (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
                else:
                    box(stone, (sign * (x + width / 2), y + random.uniform(-.008, .008), facade_z),
                        (width - .033, y1 - y0 - .025, .51 + random.uniform(-.025, .025)))
                x += width
                count += 1
    for i in range(17):
        a, b = i * math.pi / 17 + .009, (i + 1) * math.pi / 17 - .009
        arch_block(a, b, facade_z - .30, facade_z + .30)
    for sign in [-1, 1]:
        for row in range(3):
            box(random.choice(stones), (sign * 2.665, -.13 + row * .27, facade_z), (.48, .25, .66))
    # Broad coping course gives the bridge its finished top edge.
    for i in range(18):
        box(stones[(i + 1) % 5], (-6.76 + i * .795, 2.75, facade_z), (.768, .225, .74))

# Recessed vaulted tunnel masonry is visible all the way through to the far bank.
for row in range(10):
    z0 = -21.21 - row * .565
    for segment in range(17):
        offset = .5 if row % 2 else 0
        a = max(0, (segment - offset) * math.pi / 17) + .006
        b = min(math.pi, (segment + 1 - offset) * math.pi / 17) - .006
        if b > a:
            arch_block(a, b, z0, z0 - .54, outer=False, mat=stones[(row + segment) % 5])
    for sign in [-1, 1]:
        for course in range(3):
            box(stones[(row + course) % 5], (sign * 2.53, -.13 + course * .27, z0 - .27), (.29, .25, .53))

# Continuous masonry above and around the vault backs the recessed joints.
# Its inner ellipse stays outside the tunnel lining (2.40 x 1.45), so no face
# crosses the waterway. Without this core, tiny gaps between the facing stones
# reveal sky, particularly where the top course straddles the arch apex.
for segment in range(48):
    a, b = segment * math.pi / 48, (segment + 1) * math.pi / 48
    p0, p1 = arch_point(a, 2.51, 1.60, 0), arch_point(b, 2.51, 1.60, 0)
    verts = [(x, y, z) for z in [-27.17, -20.79]
             for x, y in [(p0[0], p0[1]), (p1[0], p1[1]), (p1[0], 2.72), (p0[0], 2.72)]]
    add_mesh(mortar, verts, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                            (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
for sign in [-1, 1]:
    box(mortar, (sign * 2.78, 1.23, -23.98), (.54, 2.98, 6.38))

# Bridge side wing volume; opening stays clear from waterline to the entire vault.
for sign in [-1, 1]:
    box(mortar, (sign * 4.98, 1.15, -24), (4.00, 2.72, 5.59))
    for i in range(9):
        box(stones[i % 5], (sign * 7.03, 2.67, -21.31 - i * .635), (.42, .30, .61))
    # Fine moss seams break up the regular masonry silhouette.
    for i in range(16):
        x = sign * random.uniform(3.0, 6.9)
        y = random.choice([.50, .88, 1.25, 1.63, 2.0, 2.40])
        box(moss, (x, y, -20.63), (random.uniform(.14, .43), .035, .024))

# Aggregate all separate pieces per material, retaining efficient draw calls.
for name, data in meshes.items():
    if not data['v']: continue
    mesh = bpy.data.meshes.new(name)
    # glTF conversion turns (x, -z, y) Blender back into (x, y, z) Three.js.
    mesh.from_pydata([(x, -z, y) for x, y, z in data['v']], [], data['f'])
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(materials[name])
    mesh.update()
    uv = mesh.uv_layers.new(name='UVMap')
    for polygon, coords in zip(mesh.polygons, data['uv']):
        for loop_index, coord in zip(polygon.loop_indices, coords):
            uv.data[loop_index].uv = coord
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    # Millimetre bevels on boards, roof tiles and iron add mostly invisible
    # geometry. Keep a single chamfer on larger trim, beams and masonry.
    bevel = data['bevel'] if data['bevel'] > .009 else 0
    if bevel:
        mod = obj.modifiers.new('Small worn edge rounding', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        mod.affect = 'EDGES'
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Weighted normals keep chamfered faces clean; unbeveled boxes stay flat.
    if bevel or not data['bevel']:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        normal_mod = obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
        normal_mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=normal_mod.name)
    obj.select_set(False)

# Useful inspectable studio setup is saved in the native Blender file.
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.world.color = (.16, .20, .23)
bpy.ops.object.light_add(type='AREA', location=(-10, 12, 16))
key = bpy.context.object
key.name = 'Preview soft sunlight'
key.data.energy = 2400
key.data.shape = 'DISK'
key.data.size = 9
key.rotation_euler = (Vector((0, 24, 4)) - key.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(12, 5, 11))
camera = bpy.context.object
camera.name = 'Asset overview camera'
camera.rotation_euler = (Vector((0, 23, 4.7)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 37
scene.camera = camera
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'

(ROOT / 'assets').mkdir(exist_ok=True)
(ROOT / 'public/models').mkdir(exist_ok=True, parents=True)
(ROOT / 'output').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/cottage.blend'), compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH': obj.select_set(True)
# Blender 5.2 defaults to 12-bit float filtering, which can move these world-
# space vertices by millimetres. Retain fine trim with 20-bit precision.
meshopt.EXP_FILTER_BITS = 20
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/cottage.glb'), export_format='GLB',
                          use_selection=True, export_yup=True, export_apply=True,
                          export_meshopt_compression_enable=True,
                          export_meshopt_extension='EXT_meshopt_compression',
                          export_lights=False, export_cameras=False, export_materials='EXPORT')
mesh_objects = [o for o in scene.objects if o.type == 'MESH']
points = [o.matrix_world @ Vector(v) for o in mesh_objects for v in o.bound_box]
bounds = [[min(v[i] for v in points), max(v[i] for v in points)] for i in range(3)]
print('ASSET_REPORT ' + json.dumps({'meshes': len(mesh_objects), 'materials': list(materials),
                                  'vertices': sum(len(o.data.vertices) for o in mesh_objects),
                                  'triangles': sum(len(p.vertices) - 2 for o in mesh_objects for p in o.data.polygons),
                                  'blender_bounds': bounds,
                                  'gltf_bytes': (ROOT / 'public/models/cottage.glb').stat().st_size}))
scene.render.filepath = str(ROOT / 'output/cottage-preview.png')
bpy.ops.render.render(write_still=True)
