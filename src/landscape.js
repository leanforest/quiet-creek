import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const cottageZ = -54;
// Water, banks and navigation share a sheltered bend before the distant bridge.
export function riverCenter(z) {
  const downstream = 1.35 * Math.sin((z + 25) * .065) * THREE.MathUtils.smoothstep(z, -22, -8);
  const approach = Math.sin((z + 8) * Math.PI / 46) * 2.8
    * THREE.MathUtils.smoothstep(z, cottageZ + 2, cottageZ + 14)
    * (1 - THREE.MathUtils.smoothstep(z, -14, -8));
  return downstream + approach;
}
export const riverHalfWidth = () => 3.2;

const smooth = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b);

export function terrainHeight(x, z) {
  const offset = x - riverCenter(z);
  const d = Math.abs(offset);
  if (d < 3.2) return -0.40 + Math.sin(x * 2.2 + z * 0.24) * 0.09;
  const shore = smooth(3.2, 4.5, d);
  const hill = smooth(3.9, 10.8, d);
  // The taller right meadow catches the setting sun; the lower left saddle admits it.
  const rightSlope = smooth(-.5, 2, offset) * (1 - smooth(23, 43, z));
  let height = 0.42 + shore * 0.27 + hill * (2.5 + rightSlope * .95);
  height += hill * (Math.sin(z * 0.18 + x * 0.13) * 0.61 + Math.sin(z * 0.4 - x * 0.3) * 0.26);
  height += smooth(13, 39, d) * (1.0 + Math.sin(z * 0.06) * 1.5);
  const landing = (1 - smooth(3, 7, Math.abs(z - cottageZ + 1))) * (1 - smooth(8, 13, d));
  height = THREE.MathUtils.lerp(height, 2.85, landing * smooth(3.2, 4.5, d));
  return height;
}

function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGroundTexture(random) {
  const texture = canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#bac7a2';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 96; i++) {
      const x = (i * 197.31) % size, y = (i * 113.79) % size;
      ctx.fillStyle = i % 3 ? 'rgba(78,96,50,.10)' : 'rgba(158,139,94,.16)';
      ctx.beginPath(); ctx.ellipse(x, y, 18 + i % 29, 8 + i % 17, i * 1.73, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 18000; i++) {
      const shade = 120 + random() * 95;
      ctx.fillStyle = `rgba(${shade - 12},${shade + 10},${shade - 27},${0.08 + random() * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 0.4 + random() * 3.5, 0.4 + random() * 2, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 1700; i++) {
      const x = (i * 197.31) % size, y = (i * 113.79) % size;
      ctx.strokeStyle = i % 4 ? 'rgba(91,111,62,.24)' : 'rgba(186,172,121,.42)';
      ctx.lineWidth = .65 + i % 3 * .25;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(i * 1.71) * 6, y + Math.sin(i * 1.71) * 6); ctx.stroke();
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(25, 34);
  texture.anisotropy = 8;
  return texture;
}

function createBarkTexture(random) {
  const texture = canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#9e917c';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1600; i++) {
      const grey = Math.round(64 + random() * 105);
      ctx.strokeStyle = `rgba(${grey + 16},${grey + 9},${grey - 1},0.32)`;
      ctx.lineWidth = 0.5 + random() * 2;
      const x = random() * size, y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + random() * 4, y + 8, x - random() * 3, y + 19, x + random() * 2, y + random() * 55);
      ctx.stroke();
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 3);
  return texture;
}

function createStoneTexture(random) {
  const texture = canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#d2d0c8';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 6000; i++) {
      const shade = Math.floor(90 + random() * 155);
      ctx.fillStyle = `rgba(${shade},${shade},${Math.max(0, shade - 9)},${random() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 1 + random() * 8, 1 + random() * 4, random() * 6.28, 0, 6.28);
      ctx.fill();
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createRiverStoneTextures() {
  // A separate seed keeps the planted landscape unchanged when the stone finish is refined.
  const random = seededRandom(69317), size = 512;
  const surface = document.createElement('canvas');
  surface.width = surface.height = size;
  const surfaceContext = surface.getContext('2d');
  const relief = surfaceContext.createImageData(size, size);
  const texture = canvasTexture(size, (ctx) => {
    const mineral = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
        const cloud = Math.sin(u * 2 + Math.sin(v) * 1.3) * Math.cos(v * 2 - Math.sin(u) * .8);
        const grain = Math.sin(u * 7 + Math.sin(v * 3) * 1.7) * Math.cos(v * 6 + Math.sin(u * 2));
        const vein = smooth(.96, 1, Math.sin(u + v * 2 + Math.sin(u * 2 - v) * .72))
          * smooth(-.4, .6, Math.sin(v * 3 - u));
        const fleck = random() - .5;
        const shade = cloud * 12 + grain * 4.5 + vein * 8 + fleck * 5;
        const index = (y * size + x) * 4;
        mineral.data[index] = 211 + shade;
        mineral.data[index + 1] = 207 + shade;
        mineral.data[index + 2] = 195 + shade;
        mineral.data[index + 3] = 255;
        const height = 216 + cloud * 12 + grain * 14 + vein * 8 + fleck * 9;
        relief.data[index] = relief.data[index + 1] = relief.data[index + 2] = height;
        relief.data[index + 3] = 255;
      }
    }
    ctx.putImageData(mineral, 0, 0);
  });
  surfaceContext.putImageData(relief, 0, 0);
  const surfaceTexture = new THREE.CanvasTexture(surface);
  for (const map of [texture, surfaceTexture]) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
  }
  return { color: texture, surface: surfaceTexture };
}

function createLeafTexture() {
  // An open, irregular twig spray provides fine leaf silhouettes without a solid canopy shell.
  return canvasTexture(256, (ctx) => {
    ctx.strokeStyle = '#8b9663';
    ctx.lineWidth = 2.3;
    ctx.beginPath(); ctx.moveTo(132, 249); ctx.bezierCurveTo(116, 170, 145, 92, 125, 13); ctx.stroke();
    const sprigs = [
      [129, 221, -0.82, 54, 19], [126, 214, 0.78, 58, 21],
      [126, 179, -0.93, 63, 23], [129, 169, 0.83, 65, 22],
      [131, 139, -0.84, 62, 23], [133, 128, 0.9, 59, 21],
      [133, 101, -0.67, 53, 20], [132, 89, 0.66, 50, 19],
      [130, 61, -0.49, 41, 16], [129, 52, 0.53, 39, 15],
      [129, 36, -0.10, 35, 15],
    ];
    sprigs.forEach(([x, y, angle, length, width], index) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      const gradient = ctx.createLinearGradient(-width, 0, width, 0);
      gradient.addColorStop(0, index % 2 ? '#b4c89b' : '#c4d1ac');
      gradient.addColorStop(0.5, '#e0eac9');
      gradient.addColorStop(1, '#c8d6ac');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-width, -length * 0.3, -width * 0.8, -length * 0.75, 0, -length);
      ctx.bezierCurveTo(width, -length * 0.7, width, -length * 0.3, 0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(96,121,55,.43)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, -length + 4); ctx.stroke();
      for (let vein = 1; vein < 5; vein++) {
        const vy = -length * vein / 5, vw = Math.sin(vein / 5 * Math.PI) * width * 0.65;
        ctx.beginPath(); ctx.moveTo(-vw, vy - 6); ctx.lineTo(0, vy); ctx.lineTo(vw, vy - 6); ctx.stroke();
      }
      ctx.restore();
    });
  });
}

function addWind(material, uniforms, kind) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLandscapeTime = uniforms.time;
    shader.uniforms.uLandscapeWind = uniforms.wind;
    shader.uniforms.uFoliageSun = uniforms.sun;
    shader.uniforms.uFoliageColor = uniforms.sunColor;
    shader.uniforms.uFoliageStrength = uniforms.sunStrength;
    shader.vertexShader = `uniform float uLandscapeTime;\nuniform float uLandscapeWind;\nvarying float vFoliageHeight;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vFoliageHeight = ${kind === 'grass' ? 'position.y' : '(position.y + .5)'};
      #ifdef USE_INSTANCING
        vec3 landscapeOrigin = instanceMatrix[3].xyz;
        float wave = sin(uLandscapeTime * 1.7 + landscapeOrigin.x * 0.72 + landscapeOrigin.z * 0.37);
        float gust = sin(uLandscapeTime * 0.73 + landscapeOrigin.z * 0.2);
        ${kind === 'grass'
          ? 'float bladeAspect = length(instanceMatrix[1].xyz) / max(length(instanceMatrix[0].xyz), 0.001); transformed.x += pow(position.y, 2.0) * (wave * 0.13 + gust * 0.08 + 0.06) * bladeAspect * uLandscapeWind; transformed.z += pow(position.y, 2.0) * cos(uLandscapeTime * 1.3 + landscapeOrigin.x) * 0.08 * uLandscapeWind;'
          : kind === 'flower'
          ? 'float stemBend = pow(max(position.y, 0.0) / .64, 2.0); transformed.x += stemBend * (wave * .045 + gust * .02) * uLandscapeWind; transformed.z += stemBend * cos(uLandscapeTime * 1.3 + landscapeOrigin.x) * .03 * uLandscapeWind;'
          : 'transformed.z += (wave * 0.17 + gust * 0.13) * uLandscapeWind; transformed.x += sin(uLandscapeTime * 2.3 + landscapeOrigin.z * 2.0) * position.y * 0.08 * uLandscapeWind;'}
      #endif
    `);
    shader.fragmentShader = `varying float vFoliageHeight; uniform vec3 uFoliageSun, uFoliageColor; uniform float uFoliageStrength;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 leafLight = normalize(mat3(viewMatrix) * uFoliageSun);
      float backlight = pow(max(dot(-normalize(vViewPosition), leafLight), 0.0), 3.0);
      float thinEdge = .35 + .65 * (1.0 - abs(dot(normal, leafLight)));
      float translucency = backlight * thinEdge * getShadowMask();
      outgoingLight += diffuseColor.rgb * uFoliageColor * translucency * uFoliageStrength * ${kind === 'grass' ? '.34 * smoothstep(.10, .95, vFoliageHeight)' : kind === 'flower' ? '.24' : '.20'};
      ${kind === 'grass' ? 'outgoingLight *= mix(.56, 1.0, smoothstep(.0, .65, vFoliageHeight));' : ''}
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => `hollow-wind-${kind}`;
}

function roundedRockGeometry(detail = 1, waterWorn = false) {
  const widthSegments = detail === 0 ? 8 : waterWorn ? 28 : 14;
  const heightSegments = detail === 0 ? 5 : waterWorn ? 18 : 10;
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const tint = new THREE.Color();
  const mineral = new THREE.Color(waterWorn ? '#f0ebe1' : '#e2e1d8');
  const moss = new THREE.Color('#8b956c');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const bump = 1 + Math.sin(x * 4.1 + z * 2.8) * (waterWorn ? .065 : .075) + Math.sin(y * 5.3 - z * 3.1) * (waterWorn ? .035 : .055);
    // Broad worn fracture faces retain rounded edges instead of repeating perfect ellipsoids.
    const faceX = waterWorn ? x * bump * (1 + z * .08) + y * .035 : THREE.MathUtils.clamp(x * bump, -.86 + y * .07, .87 - z * .10);
    const crown = y * .95 + Math.sin(x * 2.8 + z * 2.1) * .045 * (1 - y * y);
    const shoulder = .77 + x * .12 - z * .075;
    const faceY = waterWorn ? Math.max(-.72, crown - .085 * Math.log1p(Math.exp((crown - shoulder) / .085))) : THREE.MathUtils.clamp(y * bump, -.63, .75 + x * .12 - z * .07);
    const faceZ = waterWorn ? z * bump * (1 - x * .07) : THREE.MathUtils.clamp(z * bump, -.83 - x * .10, .88 + y * .07);
    positions.setXYZ(i, faceX, faceY, faceZ);
    const mottling = Math.sin(x * 8.3 + z * 5.8) * Math.sin(z * 9.4 - y * 4.1);
    const mossAmount = detail === 0 ? 0 : smooth(.10, .72, y) * smooth(-.2, .6, mottling) * (waterWorn ? .10 : .52);
    tint.copy(mineral).lerp(moss, mossAmount).multiplyScalar(waterWorn ? .97 + mottling * .025 : .91 + mottling * .055);
    tint.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  if (waterWorn) {
    // Sphere UV seams duplicate vertices; keep their lighting continuous after reshaping.
    const normals = geometry.attributes.normal;
    const normal = new THREE.Vector3(), adjacent = new THREE.Vector3();
    for (let row = 1; row < heightSegments; row++) {
      const first = row * (widthSegments + 1), last = first + widthSegments;
      normal.fromBufferAttribute(normals, first).add(adjacent.fromBufferAttribute(normals, last)).normalize();
      normals.setXYZ(first, normal.x, normal.y, normal.z);
      normals.setXYZ(last, normal.x, normal.y, normal.z);
    }
    for (const row of [0, heightSegments]) {
      const first = row * (widthSegments + 1);
      normal.set(0, 0, 0);
      for (let column = 0; column <= widthSegments; column++) normal.add(adjacent.fromBufferAttribute(normals, first + column));
      normal.normalize();
      for (let column = 0; column <= widthSegments; column++) normals.setXYZ(first + column, normal.x, normal.y, normal.z);
    }
  }
  return geometry;
}

function flowerGeometry() {
  const parts = [];
  const tint = (geometry, hex) => {
    const color = new THREE.Color(hex), values = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) color.toArray(values, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
    // A single coloured mesh keeps stems, leaves, petals and centres in one instanced draw.
    geometry.deleteAttribute('uv');
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
  };
  const stem = new THREE.CylinderGeometry(.006, .008, .58, 5, 1);
  stem.translate(.022, .29, 0);
  tint(stem, '#667c43');
  for (const side of [-1, 1]) {
    const leaf = new THREE.BufferGeometry();
    leaf.setAttribute('position', new THREE.Float32BufferAttribute([
      .022, .23 + side * .04, 0, side * .09, .29 + side * .04, -.028,
      side * .17, .34 + side * .04, 0, side * .09, .28 + side * .04, .031,
    ], 3));
    leaf.setIndex([0, 1, 2, 0, 2, 3]); leaf.computeVertexNormals(); tint(leaf, '#81975e');
  }
  for (let petal = 0; petal < 6; petal++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -.034, .012, .055, .034, .012, .055,
      -.025, .028, .106, .025, .028, .106, 0, .032, .122,
    ], 3));
    geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
    geometry.rotateY(petal * Math.PI / 3);
    geometry.translate(.022, .58, 0); geometry.computeVertexNormals(); tint(geometry, '#fffce9');
  }
  const centre = new THREE.SphereGeometry(.031, 8, 4);
  centre.scale(1, .42, 1); centre.translate(.022, .588, 0); tint(centre, '#ba9142');
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return geometry;
}

export function createLandscape(scene) {
  const random = seededRandom(18383);
  const group = new THREE.Group();
  group.name = 'Creek banks, forest and riverbed';
  scene.add(group);
  const uniforms = { time: { value: 0 }, wind: { value: 1 }, sun: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() }, sunStrength: { value: 0 } };
  const object = new THREE.Object3D();
  const color = new THREE.Color();
  const range = (min, max) => min + random() * (max - min);

  // Vertex colour separates damp earth, the pebble bed and grass-covered hills.
  const terrain = new THREE.PlaneGeometry(90, 118, 144, 188);
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const bedColor = new THREE.Color('#a9a388');
  const dampColor = new THREE.Color('#778362');
  const lawnColor = new THREE.Color('#82975f');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i) - 11;
    positions.setXYZ(i, x, terrainHeight(x, z), z);
    const d = Math.abs(x - riverCenter(z));
    color.copy(d < 3.2 ? bedColor : dampColor);
    if (d >= 3.2) color.lerp(lawnColor, smooth(3.3, 5.6, d));
    const groundPatch = Math.sin(x * 1.21 + z * .66) * Math.sin(z * 1.67 - x * .71);
    color.multiplyScalar(.87 + random() * .23 + (d > 3.2 ? groundPatch * .12 : 0));
    color.toArray(colors, i * 3);
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  const groundTexture = createGroundTexture(random);
  const ground = new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ map: groundTexture, vertexColors: true, roughness: 1, bumpMap: groundTexture, bumpScale: .14 }));
  ground.name = 'Riverbed';
  ground.receiveShadow = true;
  group.add(ground);

  // A continuous forest floor rises beyond the water, so the stone arch frames a real valley.
  const distantTerrain = new THREE.PlaneGeometry(224, 174, 88, 76);
  distantTerrain.rotateX(-Math.PI / 2);
  const distantPositions = distantTerrain.attributes.position;
  const distantColors = new Float32Array(distantPositions.count * 3);
  for (let i = 0; i < distantPositions.count; i++) {
    const x = distantPositions.getX(i), z = distantPositions.getZ(i) - 153;
    const depth = -z - 66;
    const rise = smooth(0, 43, depth);
    const broadHill = 8.5 + Math.sin(x * 0.039 + z * 0.02) * 4.5 + Math.sin(x * 0.072 - z * 0.031) * 2.0;
    const height = terrainHeight(x, -66) * (1 - rise) + broadHill * rise + smooth(38, 164, depth) * 10;
    distantPositions.setXYZ(i, x, height, z);
    color.setHSL(0.245 + Math.sin(x * 0.11 + z * 0.16) * 0.025, 0.28, 0.21 + rise * 0.05);
    color.toArray(distantColors, i * 3);
  }
  distantTerrain.setAttribute('color', new THREE.BufferAttribute(distantColors, 3));
  distantTerrain.computeVertexNormals();
  const hills = new THREE.Mesh(distantTerrain, new THREE.MeshStandardMaterial({ map: groundTexture, vertexColors: true, roughness: 1 }));
  hills.name = 'Distant green valley beyond the canal';
  hills.receiveShadow = true;
  group.add(hills);
  // The downstream profile follows the actual bend, with four metres of overlap under the near bank.
  const downstreamTerrain = new THREE.PlaneGeometry(224, 174, 352, 76);
  downstreamTerrain.rotateX(-Math.PI / 2);
  const downstreamPositions = downstreamTerrain.attributes.position;
  const downstreamColors = new Float32Array(downstreamPositions.count * 3);
  for (let i = 0; i < downstreamPositions.count; i++) {
    const x = downstreamPositions.getX(i), z = downstreamPositions.getZ(i) + 131;
    const depth = z - 48, rise = smooth(0, 43, depth);
    const profile = terrainHeight(x, Math.min(z, 48)) - (1 - smooth(44, 50, z)) * .10;
    const broadHill = 8.5 + Math.sin(x * .039 + z * .02) * 4.5 + Math.sin(x * .072 - z * .031) * 2;
    const height = profile * (1 - rise) + broadHill * rise + smooth(38, 164, depth) * 10;
    downstreamPositions.setXYZ(i, x, height, z);
    color.setHSL(.245 + Math.sin(x * .11 + z * .16) * .025, .28, .21 + rise * .05);
    color.toArray(downstreamColors, i * 3);
  }
  downstreamTerrain.setAttribute('color', new THREE.BufferAttribute(downstreamColors, 3));
  downstreamTerrain.computeVertexNormals();
  const downstreamHills = new THREE.Mesh(downstreamTerrain, hills.material);
  downstreamHills.name = 'Wooded hills at the downstream horizon';
  downstreamHills.receiveShadow = true;
  group.add(downstreamHills);

  const stoneTexture = createStoneTexture(random);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#fffdf6', vertexColors: true, map: stoneTexture, bumpMap: stoneTexture, bumpScale: 0.045, roughness: 0.94 });
  const stoneGeometry = roundedRockGeometry(1);
  const riverStoneGeometry = roundedRockGeometry(1, true);
  riverStoneGeometry.computeBoundingBox();
  const riverStoneTextures = createRiverStoneTextures();
  const riverStoneMaterial = rockMaterial.clone();
  riverStoneMaterial.map = riverStoneTextures.color;
  riverStoneMaterial.bumpMap = riverStoneTextures.surface;
  riverStoneMaterial.roughnessMap = riverStoneTextures.surface;
  riverStoneMaterial.bumpScale = .036;
  riverStoneMaterial.roughness = .92;
  riverStoneMaterial.emissive.set('#92a0bc');
  riverStoneMaterial.emissiveIntensity = .03;
  const stones = [];
  const riverStones = [];
  const rockPositions = [];
  const placeStone = (x, y, z, sx, sy, sz, tint) => {
    stones.push({ x, y, z, sx, sy, sz, rx: Math.sin(z * 1.7 + x) * .055, ry: range(0, Math.PI), rz: range(-.09, .09), tint });
  };

  // Overlapping rough courses conceal the bank, while uneven crowns break the horizontal bands.
  for (const side of [-1, 1]) {
    for (let course = 0; course < 3; course++) {
      let z = cottageZ + 4 + (course % 2) * 0.43;
      while (z < 47) {
        const length = range(.39, .73);
        const irregular = Math.sin(z * .57 + side) * .07 + Math.sin(z * 1.37 + course) * .045;
        const x = riverCenter(z) + side * (3.24 + course * .11 + irregular);
        const tint = color.setHSL(range(0.57, 0.64), range(0.045, 0.105), range(0.46, 0.59)).clone();
        const crest = Math.sin(z * .63 + side) * .045 + Math.sin(z * 1.26 + course) * .026;
        placeStone(x, .14 + course * .225 + crest + range(-.025, .025), z, range(.29, .40), range(.18, .25), length, tint);
        stones[stones.length - 1].ry = range(-.32, .32);
        stones[stones.length - 1].rz = Math.sin(z * 2.2 + course) * .13;
        z += length * 1.61;
      }
    }
  }
  // Warm, water-smoothed stepping rocks, with deliberate open water between them.
  const omittedSteppingStones = new Set([4, 7, 17, 18, 19, 20, 22, 24, 26, 28, 29, 31, 32, 34, 36, 37]);
  for (let i = 0; i < 43; i++) {
    const z = -58 + i * 2.4 + range(-0.5, 0.5);
    if (z > cottageZ - 5 && z < cottageZ + 4) continue;
    const x = riverCenter(z) + Math.sin(i * 2.26) * range(0.65, 2.2);
    const scale = range(0.45, 0.89) * (i % 5 === 0 ? 1.12 : i % 3 === 0 ? .82 : 1);
    const top = range(.48, .64), bottom = terrainHeight(x, z) - .025;
    const bounds = riverStoneGeometry.boundingBox;
    const sy = (top - bottom) / (bounds.max.y - bounds.min.y);
    const stone = { x, y: bottom - bounds.min.y * sy, z, sx: scale * range(1, 1.30), sy, sz: scale, ry: range(0, Math.PI), tint: color.setHSL(range(.09, .14), range(.025, .055), range(.85, .96)).clone() };
    // Consume the same random sequence before removing stones, so the composed forest stays unchanged.
    if (omittedSteppingStones.has(i)) continue;
    riverStones.push(stone);
    rockPositions.push({ x, z, radius: scale, radiusX: stone.sx, radiusZ: stone.sz, rotation: stone.ry });
  }
  for (let i = 0; i < 140; i++) {
    const side = random() < 0.5 ? -1 : 1;
    const z = range(-63, 47), x = riverCenter(z) + side * range(3.8, 15);
    const scale = range(0.23, 1.25);
    placeStone(x, terrainHeight(x, z) + scale * 0.12, z, scale * range(0.9, 1.6), scale * range(0.38, 0.7), scale, color.setHSL(range(0.09, 0.15), range(0.06, 0.15), range(0.43, 0.64)).clone());
  }
  for (const [x, offset, scale] of [[-1.4, -6, 0.88], [1.95, -8, 0.74], [0.45, -11, 0.76], [-2.0, -14, 0.68]]) {
    const z = cottageZ + offset;
    placeStone(x, 0.22, z, scale * 1.32, scale * 0.53, scale, new THREE.Color('#a6aa86'));
    rockPositions.push({ x, z, radius: scale });
  }
  // Dark wet boulders soften the far portal's sides, with a clear channel between them.
  for (const [x, offset, scale] of [[-2.65, -6.8, 1.13], [2.8, -9.4, 1.28], [-2.55, -13.3, .94]]) {
    const z = cottageZ + offset;
    placeStone(x, .34, z, scale, scale * .7, scale * 1.3, new THREE.Color('#899186'));
    rockPositions.push({ x, z, radius: scale });
  }
  const rockMesh = new THREE.InstancedMesh(stoneGeometry, rockMaterial, stones.length);
  rockMesh.name = 'RiverRock and retaining stones';
  stones.forEach((s, i) => {
    object.position.set(s.x, s.y, s.z); object.rotation.set(s.rx, s.ry, s.rz); object.scale.set(s.sx, s.sy, s.sz); object.updateMatrix();
    rockMesh.setMatrixAt(i, object.matrix); rockMesh.setColorAt(i, s.tint);
  });
  rockMesh.castShadow = rockMesh.receiveShadow = true;
  group.add(rockMesh);

  const riverRockMesh = new THREE.InstancedMesh(riverStoneGeometry, riverStoneMaterial, riverStones.length);
  riverRockMesh.name = 'RiverRock water-worn stepping stones';
  riverStones.forEach((s, i) => {
    object.position.set(s.x, s.y, s.z); object.rotation.set(0, s.ry, 0); object.scale.set(s.sx, s.sy, s.sz); object.updateMatrix();
    riverRockMesh.setMatrixAt(i, object.matrix); riverRockMesh.setColorAt(i, s.tint);
  });
  riverRockMesh.castShadow = riverRockMesh.receiveShadow = true;
  group.add(riverRockMesh);

  // The shallow water remains transparent enough to reveal this varied pebble bed.
  const pebbles = new THREE.InstancedMesh(roundedRockGeometry(0), rockMaterial, 1950);
  pebbles.name = 'RiverRock submerged pebbles';
  for (let i = 0; i < pebbles.count; i++) {
    const z = range(-69, 47), x = riverCenter(z) + range(-3.13, 3.13), size = range(0.04, 0.21);
    object.position.set(x, terrainHeight(x, z) + size * 0.28, z);
    object.rotation.set(range(0, 0.6), range(0, 6.28), range(0, 0.5));
    object.scale.set(size * range(0.8, 1.9), size * range(0.3, 0.65), size);
    object.updateMatrix(); pebbles.setMatrixAt(i, object.matrix);
    pebbles.setColorAt(i, color.setHSL(range(0.08, 0.18), range(0.03, 0.2), range(0.31, 0.66)));
  }
  pebbles.receiveShadow = true;
  group.add(pebbles);

  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.30, 0.58, 0.08, 0.30, 0.58, 0.08, 0.12, 1, 0.2], 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute([.38, .48, .28, .38, .48, .28, .88, .98, .69, .88, .98, .69, 1, 1, .86], 3));
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  blade.computeVertexNormals();
  const grassMaterial = new THREE.MeshStandardMaterial({ color: '#ecedd8', vertexColors: true, side: THREE.DoubleSide, roughness: 0.96 });
  addWind(grassMaterial, uniforms, 'grass');
  const grassCount = 132000;
  const grass = new THREE.InstancedMesh(blade, grassMaterial, grassCount);
  grass.name = 'Meadow grass in irregular tussocks';
  const tussocks = [];
  for (let i = 0; i < 4100; i++) {
    const side = random() < .5 ? -1 : 1;
    const z = i < 2800 ? range(-25, 34) : range(-65, 47);
    const offset = side * (i < 3300 ? range(3.65, 11.0) : range(11.0, 26));
    const x = riverCenter(z) + offset;
    const patch = .5 + .5 * Math.sin(x * .61 + z * .16) * Math.sin(z * .37 - x * .25);
    tussocks.push({ x, z, offset, radius: range(.32, .98), height: range(.38, .89) * (.65 + patch * .55), hue: range(.205, .253), light: range(.49, .65), direction: range(0, Math.PI * 2) });
  }
  for (let i = 0; i < grassCount; i++) {
    const tuft = tussocks[Math.floor(random() * tussocks.length)];
    const angle = range(0, Math.PI * 2), radius = Math.pow(random(), .7) * tuft.radius;
    const z = tuft.z + Math.sin(angle) * radius;
    const x = riverCenter(z) + Math.sign(tuft.offset) * Math.max(3.53, Math.abs(tuft.offset + Math.cos(angle) * radius));
    const nearCottage = Math.abs(z - cottageZ + 1) < 4 && Math.abs(x) < 6;
    const height = (nearCottage ? .22 : tuft.height) * range(.65, 1.2);
    object.position.set(x, terrainHeight(x, z) - 0.025, z);
    object.rotation.set(range(-.22, .22), tuft.direction + range(-1.1, 1.1), range(-.20, .20));
    object.scale.set(range(.021, .044), height, 1);
    object.updateMatrix(); grass.setMatrixAt(i, object.matrix);
    const dryTip = random() < .065;
    grass.setColorAt(i, color.setHSL(dryTip ? .15 : tuft.hue + range(-.008, .008), dryTip ? .24 : range(.23, .38), tuft.light + range(-.035, .035)));
  }
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  group.add(grass);

  const branchRecords = [];
  const leafRecords = [];
  const up = new THREE.Vector3(0, 1, 0);
  const addBranch = (a, b, radius) => branchRecords.push({ a, b, radius });
  const addLeafSpray = (center, radius, count, hue, size = 1, spread = 1, angle = 0) => {
    for (let i = 0; i < count; i++) {
      const phi = range(0, Math.PI * 2), cosTheta = range(-1, 1), sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
      const r = radius * Math.cbrt(random());
      const localX = Math.cos(phi) * sinTheta * r * spread;
      const localZ = Math.sin(phi) * sinTheta * r / Math.sqrt(spread);
      leafRecords.push({
        x: center.x + localX * Math.cos(angle) - localZ * Math.sin(angle),
        y: center.y + cosTheta * r * .43,
        z: center.z + localX * Math.sin(angle) + localZ * Math.cos(angle),
        rx: range(-1.35, 1.35), ry: range(0, Math.PI * 2), rz: range(-0.7, 0.7),
        scale: range(.76, 1.18) * size,
        tint: color.setHSL(hue + range(-.012, .012), range(.22, .39), range(.39, .57) + cosTheta * .025).clone(),
      });
    }
  };

  let treeCount = 0;
  function growTree(x, z, height, form = {}) {
    treeCount++;
    const baseY = terrainHeight(x, z) - 0.09;
    const trunkRadius = height * range(.017, .024) * (form.thickness ?? 1);
    const leanX = form.leanX ?? range(-1.9, 1.9), leanZ = form.leanZ ?? range(-1.25, 1.25), curve = range(-.5, .5);
    const hue = range(.222, .276);
    const trunkAt = (t) => new THREE.Vector3(x + leanX * t * t + Math.sin(t * Math.PI) * curve, baseY + height * t, z + leanZ * t + Math.sin(t * 4.2) * curve * .65);
    for (let segment = 0; segment < 6; segment++) {
      addBranch(trunkAt(segment / 6), trunkAt((segment + 1) / 6), trunkRadius * Math.pow(.72, segment));
    }
    for (let root = 0; root < 4; root++) {
      const angle = root * Math.PI / 2 + range(-.4, .4);
      const rx = x + Math.cos(angle) * trunkRadius * 2.8, rz = z + Math.sin(angle) * trunkRadius * 2.8;
      addBranch(new THREE.Vector3(rx, terrainHeight(rx, rz) - .07, rz), trunkAt(.065), trunkRadius * .55);
    }
    for (let j = 0; j < 8; j++) {
      const t = .39 + j * .063 + range(-.025, .025);
      const origin = trunkAt(t), angle = j * 2.39996 + range(-.5, .5);
      const reach = height * range(.23, .36) * (1 - (t - .5) * .78) * (form.spread ?? 1);
      const elbow = origin.clone().add(new THREE.Vector3(Math.cos(angle) * reach * .48, height * .055, Math.sin(angle) * reach * .48));
      const end = origin.clone().add(new THREE.Vector3(Math.cos(angle + .14) * reach, height * range(.10, .19), Math.sin(angle + .14) * reach));
      const branchRadius = trunkRadius * Math.pow(.72, t * 6) * .62;
      addBranch(origin, elbow, branchRadius); addBranch(elbow, end, branchRadius * .72);
      for (let twig = 0; twig < 2; twig++) {
        const begin = elbow.clone().lerp(end, .28 + twig * .48);
        const twigAngle = angle + (twig ? .72 : -.75);
        const tip = begin.clone().add(new THREE.Vector3(Math.cos(twigAngle) * reach * .39, height * range(.065, .12), Math.sin(twigAngle) * reach * .39));
        addBranch(begin, tip, branchRadius * .38);
        addLeafSpray(tip, height * range(.115, .155), 46, hue, 1.06, 1.35, twigAngle);
      }
      addLeafSpray(end, height * .125, 28, hue, 1.04, 1.5, angle);
    }
    // Sparse upper forks make the crown breathe instead of closing into a spherical shell.
    for (let crown = 0; crown < 3; crown++) {
      const tip = trunkAt(.86 + crown * .045);
      tip.x += Math.sin(crown * 2.4) * height * .12;
      tip.z += Math.cos(crown * 2.4) * height * .12;
      addLeafSpray(tip, height * .14, 42, hue, 1.06, 1.25, crown * 2.4);
    }
    if (form.overhang) {
      const origin = trunkAt(.50);
      const elbow = origin.clone().add(new THREE.Vector3(height * .29, height * .11, -.2));
      const tip = origin.clone().add(new THREE.Vector3(height * .68, height * .29, -.9));
      addBranch(origin, elbow, trunkRadius * .47);
      addBranch(elbow, tip, trunkRadius * .30);
      for (let twig = 0; twig < 4; twig++) {
        const begin = elbow.clone().lerp(tip, .15 + twig * .25);
        const end = begin.clone().add(new THREE.Vector3(.35, .55 + twig * .10, (twig % 2 ? 1 : -1) * .75));
        addBranch(begin, end, trunkRadius * .14);
        addLeafSpray(end, height * .105, 39, hue, .98, 1.5, -.2);
      }
    }
  }

  // Three depths of deliberately unequal trees frame a left-hand opening and a sheltered cottage.
  // The only close, broad trunk is cropped by the left edge; the midground leaning tree leads right.
  const featureTrees = [
    [-13.2, 16, 11.6, { leanX: -1.8, thickness: 1.3, spread: 1.1 }],
    [-11.8, 4, 10.1, { leanX: -1.4, leanZ: -1.2 }],
    [-6.7, 5, 9.4, { leanX: 1.8, leanZ: -.7, thickness: 1.1, spread: .80, overhang: true }],
    [-7.6, -27.5, 9.2, { leanX: -1.2, spread: .86 }],
    [-12.9, -36, 11.8, { leanX: .5 }],
    [12.5, 12, 12.3, { leanX: 1.2, spread: 1.15 }],
    [9.4, -3.5, 10.6, { leanX: .8, leanZ: -.6, spread: .9 }],
    [11.1, -20, 11.8, { leanX: 1.9, spread: 1.12 }],
    [6.6, -33, 8.8, { leanX: -.6, spread: .85 }],
    [9.2, -42, 10.2, { leanX: 1.2 }],
    [-9.7, 30, 9.8, { leanX: -1.2 }],
    [12.5, 32, 11.9, { leanX: 1.7 }],
  ];
  featureTrees.forEach(([x, z, h, form]) => growTree(x, z, h, form));
  // Grove clusters leave readable gaps between distant trunks; none plugs the sunset's light shaft.
  const groves = [[-24, 14], [-30, -19], [-26, -52], [23, 18], [27, -9], [20, -47]];
  for (let i = 0; i < 45; i++) {
    const grove = groves[i % groves.length];
    const x = grove[0] + range(-7, 7), z = grove[1] + range(-10, 10);
    if (z > -43 && z < 18 && Math.abs(x - (-8 + z * .30)) < 3.8) continue;
    growTree(x, z, range(7.0, 13.5), { spread: range(.82, 1.2) });
  }
  // Background trunks continue beyond the cottage, which keeps the canal portal green.
  for (let i = 0; i < 9; i++) growTree((i - 4) * 6.4 + range(-1.5, 1.5), range(cottageZ - 15, cottageZ - 9), range(8, 12));
  for (const side of [-1, 1]) {
    growTree(riverCenter(-40) + side * 4.4, -40, range(6.3, 7.8));
    growTree(side * 5.1, cottageZ - 12, range(7.0, 8.1));
  }

  // Fern-like low sprays and partially submerged rocks remain visible through the far portal.
  for (const [x, offset] of [[-3.5, -6.5], [3.65, -8.6], [-3.6, -12.7], [2.3, -10.5]]) {
    const z = cottageZ + offset;
    const y = Math.abs(x) < 3.2 ? 0.66 : terrainHeight(x, z);
    for (let spray = 0; spray < 7; spray++) {
      const angle = spray * 2.399;
      const tip = new THREE.Vector3(x + Math.cos(angle) * 0.54, y + range(0.36, 0.75), z + Math.sin(angle) * 0.54);
      addBranch(new THREE.Vector3(x, y, z), tip, 0.012);
      addLeafSpray(tip, 0.35, 18, 0.26, 0.70);
    }
  }

  for (let i = 0; i < 76; i++) {
    const side = i % 2 ? -1 : 1;
    const z = range(-55, 44), x = riverCenter(z) + side * range(4.4, 12.8);
    if (Math.abs(z - cottageZ + 1) < 4 && Math.abs(x) < 8) continue;
    const y = terrainHeight(x, z), height = range(0.65, 1.35), hue = range(0.23, 0.32);
    for (let b = 0; b < 5; b++) {
      const angle = b * 2.4, reach = height * range(0.35, 0.75);
      const a = new THREE.Vector3(x, y, z);
      const tip = new THREE.Vector3(x + Math.cos(angle) * reach, y + height * range(0.6, 1.15), z + Math.sin(angle) * reach);
      addBranch(a, tip, 0.018);
      addLeafSpray(tip, height * 0.45, 47, hue, 0.64);
    }
  }

  // The cottage emerges from the meadow instead of sitting on an exposed, ruler-straight plinth.
  // Lower willow sprays beyond the arch interrupt the bright far bank without sealing the opening.
  for (const [x, offset, height] of [[-5.7, 4.3, 1.5], [6.0, 3.8, 1.35], [7.0, 5.8, 1.7], [-3.65, -6.8, 1.8], [3.7, -9.2, 1.9], [-4.5, -12.7, 2.1]]) {
    const z = cottageZ + offset;
    const y = terrainHeight(x, z);
    for (let b = 0; b < 7; b++) {
      const angle = b * 2.4, reach = height * range(.36, .68);
      const tip = new THREE.Vector3(x + Math.cos(angle) * reach, y + height * range(.65, 1.0), z + Math.sin(angle) * reach);
      addBranch(new THREE.Vector3(x, y, z), tip, .023);
      addLeafSpray(tip, height * .38, 39, .26, .70, 1.2, angle);
    }
  }

  const bark = createBarkTexture(random);
  const wood = new THREE.MeshStandardMaterial({ color: '#d6c7b0', map: bark, bumpMap: bark, bumpScale: 0.055, roughness: 1 });
  const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(.72, 1, 1, 9, 1, false), wood, branchRecords.length);
  branches.name = 'Tapered trunks, forks and exposed roots';
  const direction = new THREE.Vector3();
  branchRecords.forEach(({ a, b, radius }, i) => {
    direction.subVectors(b, a);
    object.position.copy(a).add(b).multiplyScalar(0.5);
    object.quaternion.setFromUnitVectors(up, direction.clone().normalize());
    // Closed ends and a small overlap hide light leaks where the curved trunk changes direction.
    object.scale.set(radius, direction.length() + radius * .30, radius); object.updateMatrix();
    branches.setMatrixAt(i, object.matrix);
    branches.setColorAt(i, color.setHSL(range(.08, .13), range(.04, .13), range(.60, .77)));
  });
  branches.castShadow = branches.receiveShadow = true;
  group.add(branches);

  const leafMaterial = new THREE.MeshStandardMaterial({ map: createLeafTexture(), alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.87, metalness: 0, color: '#ffffff' });
  addWind(leafMaterial, uniforms, 'leaf');
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.68, 1), leafMaterial, leafRecords.length);
  leaves.name = 'Overlapping deciduous crowns and undergrowth';
  leafRecords.forEach((leaf, i) => {
    object.position.set(leaf.x, leaf.y, leaf.z);
    object.rotation.set(leaf.rx, leaf.ry, leaf.rz);
    object.scale.set(leaf.scale, leaf.scale, leaf.scale); object.updateMatrix();
    leaves.setMatrixAt(i, object.matrix); leaves.setColorAt(i, leaf.tint);
  });
  leaves.castShadow = leaves.receiveShadow = true;
  leaves.frustumCulled = false;
  group.add(leaves);

  // Petals, leaves and stems remain one draw call; patches keep the banks mostly green.
  const flowerMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .91 });
  addWind(flowerMaterial, uniforms, 'flower');
  const flowers = new THREE.InstancedMesh(flowerGeometry(), flowerMaterial, 192);
  flowers.name = 'Riverside daisies with leaves and stems';
  for (let i = 0; i < flowers.count; i++) {
    const patch = Math.floor(i / 16), side = patch % 2 ? -1 : 1;
    const z = -16 + patch * 4.1 + range(-.75, .75);
    const x = riverCenter(z) + side * (4.35 + Math.sin(patch * 1.3) * .45) + range(-.3, .3);
    object.position.set(x, terrainHeight(x, z) - .035, z);
    object.rotation.set(range(-.12, .12), range(0, 6.28), range(-.18, .18));
    const scale = range(.58, .95);
    object.scale.set(scale, scale * range(.9, 1.3), scale); object.updateMatrix();
    flowers.setMatrixAt(i, object.matrix);
    flowers.setColorAt(i, color.set(patch % 3 === 0 ? '#fffbee' : patch % 3 === 1 ? '#f0edff' : '#fff6d3'));
  }
  flowers.receiveShadow = true;
  flowers.frustumCulled = false;
  group.add(flowers);

  return {
    group,
    terrainHeight,
    riverCenter,
    riverHalfWidth,
    rockPositions,
    counts: { trees: treeCount, blades: grassCount, leaves: leafRecords.length, branches: branchRecords.length, rocks: stones.length + riverStones.length, pebbles: pebbles.count, flowers: flowers.count },
    update(time, windStrength = 1, sun, sunColor, sunStrength = 0) {
      uniforms.time.value = time; uniforms.wind.value = windStrength;
      if (sun) uniforms.sun.value.copy(sun);
      if (sunColor) uniforms.sunColor.value.copy(sunColor);
      uniforms.sunStrength.value = sunStrength;
      riverStoneMaterial.emissiveIntensity = .014 + Math.min(sunStrength / 4, 1) * .022;
    },
  };
}
