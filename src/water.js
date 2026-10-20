import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water2.js';
import { riverCenter, cottageZ } from './landscape.js';

// Water2 supplies real planar reflection and refraction; this shader adds the
// short, overlapping ripples of a shallow creek instead of ocean-sized waves.
export function createWater(scene, manager, tunnelYaw = 0) {
  const palettes = {
    afternoon: { tint: new THREE.Color('#288f99'), absorption: new THREE.Vector3(.40, .82, .87), reflection: .94, scatter: .28, glint: 1.22 },
    golden: { tint: new THREE.Color('#528b86'), absorption: new THREE.Vector3(.62, .78, .79), reflection: 1.02, scatter: .13, glint: 1.12 },
    blue: { tint: new THREE.Color('#465996'), absorption: new THREE.Vector3(.43, .53, .85), reflection: 1.06, scatter: .16, glint: .28 },
    night: { tint: new THREE.Color('#182e66'), absorption: new THREE.Vector3(.33, .44, .78), reflection: .96, scatter: .08, glint: 1.0 },
  };
  const loader = new THREE.TextureLoader(manager);
  const maps = ['Water_1_M_Normal.jpg', 'Water_2_M_Normal.jpg'].map(name => loader.load(`${import.meta.env.BASE_URL}textures/${name}`));
  maps.forEach(map => { map.anisotropy = 8; });
  const shader = {
    name: 'ShallowCreek',
    uniforms: {
      ...Water.WaterShader.uniforms,
      uTime: { value: 0 },
      uWave: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(-0.45, 0.65, -0.55).normalize() },
      uSunColor: { value: new THREE.Color('#fff5d5') },
      uSunStrength: { value: 1 },
      uGlintStrength: { value: 1 },
      uReflectionStrength: { value: 1.06 },
      uWaterTint: { value: palettes.golden.tint.clone() },
      uAbsorption: { value: palettes.golden.absorption.clone() },
      uScatterStrength: { value: palettes.golden.scatter },
      uNight: { value: 0 },
      uTunnelYaw: { value: tunnelYaw },
      uTunnelZ: { value: cottageZ },
    },
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      uniform mat4 textureMatrix;
      uniform float uTime;
      uniform float uWave;
      varying vec4 vCoord;
      varying vec3 vWorld;
      varying vec3 vToEye;
      varying float vAcross;
      void main() {
        vec3 pos = position;
        pos.z += (sin(pos.x * 2.3 + pos.y * 3.0 + uTime * 2.8) * .010
          + sin(pos.y * 6.2 - pos.x * 3.1 + uTime * 3.6) * .007) * uWave;
        vCoord = textureMatrix * vec4(pos, 1.0);
        vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
        vWorld = worldPosition.xyz;
        vToEye = cameraPosition - worldPosition.xyz;
        vAcross = abs(uv.x * 2.0 - 1.0);
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D tReflectionMap;
      uniform sampler2D tRefractionMap;
      uniform sampler2D tNormalMap0;
      uniform sampler2D tNormalMap1;
      uniform float uTime;
      uniform float uWave;
      uniform float uSunStrength;
      uniform float uGlintStrength;
      uniform float uReflectionStrength;
      uniform float uScatterStrength;
      uniform float uNight;
      uniform float uTunnelYaw;
      uniform float uTunnelZ;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform vec3 uWaterTint;
      uniform vec3 uAbsorption;
      varying vec4 vCoord;
      varying vec3 vWorld;
      varying vec3 vToEye;
      varying float vAcross;
      float facetHash(vec2 cell) {
        return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec2 p = vWorld.xz;
        vec2 drift = vec2(sin(p.y * .28) * .025, -uTime * .095);
        // Long across the creek, short along its flow: each small crest breaks
        // the vertical tree reflections without covering the water in noise.
        vec3 n0 = texture2D(tNormalMap0, p * vec2(.23, .40) + drift).rgb * 2.0 - 1.0;
        vec3 n1 = texture2D(tNormalMap1, p * vec2(.70, 1.65) + drift * 1.23 + vec2(.3, .5) + n0.xy * .12).rgb * 2.0 - 1.0;
        vec3 n2 = texture2D(tNormalMap0, p * vec2(1.85, 3.8) + drift * 1.65).rgb * 2.0 - 1.0;
        vec2 slope = (n0.xy * .62 + n1.xy * .38 + n2.xy * .10) * uWave;
        float crest = p.y * 7.8 - uTime * 2.8
          + sin(p.x * 2.1 + sin(p.y * .71)) * 2.4
          + sin(p.x * 4.3 - p.y * 1.13) * .55 + n0.x * 6.0;
        float crestPatch = .35 + .65 * smoothstep(-.12, .34, n0.y + n1.x * .35);
        slope += vec2(cos(p.x * 2.9 + p.y * .9 - uTime * 1.1 + n0.y * 5.0) * .04,
          sin(crest) * .13 + sin(crest * 1.61 + n0.x * 6.0) * .022) * crestPatch * uWave;
        vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
        vec3 V = normalize(vToEye);
        float facing = max(dot(V, N), .0);
        float fresnel = .028 + .972 * pow(1.0 - facing, 4.5);
        vec3 coord = vCoord.xyz / vCoord.w;
        // Short, overlapping waves break up the sky and cottage reflections.
        // Stronger vertical displacement stretches them into horizontal ripples.
        vec2 distortion = N.xz * vec2(.055, .125) / (1.0 + length(vToEye) * .012);
        vec2 refractUv = clamp(coord.xy + distortion * .32, .002, .998);
        vec2 reflectUv = clamp(vec2(1.0 - coord.x - distortion.x, coord.y + distortion.y), .002, .998);
        vec3 refracted = texture2D(tRefractionMap, refractUv).rgb;
        vec3 reflected = texture2D(tReflectionMap, reflectUv).rgb * uReflectionStrength;
        // The longer path through shallow water absorbs more warm light.
        // Keep this in the transmission branch so sunset and cloud reflections
        // retain their own colour rather than receiving a uniform blue wash.
        float opticalPath = clamp(.55 / max(V.y, .22), .65, 2.5);
        opticalPath *= .85 + .25 * smoothstep(6.0, 35.0, length(vToEye));
        opticalPath *= .82 + .18 * (1.0 - vAcross);
        vec3 transmission = pow(uAbsorption, vec3(opticalPath));
        float scatter = uScatterStrength * (1.0 - exp(-opticalPath));
        vec3 waterLight = uWaterTint * (.12 + uSunStrength * .14) * (1.0 - uNight * .5);
        refracted = refracted * transmission + waterLight * scatter;
        vec3 col = mix(refracted, reflected, clamp(fresnel, .028, .90));
        vec3 H = normalize(V + uSunDirection);
        vec2 microSlope = texture2D(tNormalMap1, p * vec2(3.8, 7.0) + drift * 1.1).rg * 2.0 - 1.0;
        vec3 microNormal = normalize(vec3(slope + microSlope * .11 * uWave, 1.0)).xzy;
        float specularAngle = max(dot(microNormal, H), 0.0);
        // Keep sparse sun glints in HDR. Their radiance becomes aperture-shaped
        // bokeh in the lens; a broad white specular lobe would turn into a veil.
        // Filter subpixel normals before the narrow specular lobe. Its energy
        // is preserved as it broadens, so distant ripples do not flash on/off.
        vec3 normalDx = dFdx(microNormal), normalDy = dFdy(microNormal);
        float variance = min(dot(normalDx, normalDx) + dot(normalDy, normalDy), .04) * .12;
        float glintPower = 1.0 / (1.0 / 1000.0 + variance);
        float corePower = 1.0 / (1.0 / 3200.0 + variance);
        float glint = pow(specularAngle, glintPower) * glintPower / 1000.0;
        float glintCore = pow(specularAngle, corePower) * corePower / 3200.0;
        float sheen = pow(max(dot(N, H), 0.0), 75.0);
        // Only a small fraction of the rippling microfacets face the light.
        // World-space visibility keeps sparkle attached to flowing water.
        vec2 facet = (p + drift * .18) * vec2(4.1, 6.3);
        float visibility = smoothstep(.60, .84, facetHash(floor(facet)));
        vec2 facetEdge = smoothstep(vec2(0.0), vec2(.16), fract(facet))
          * (1.0 - smoothstep(vec2(.84), vec2(1.0), fract(facet)));
        visibility *= facetEdge.x * facetEdge.y;
        float facetFootprint = max(length(dFdx(facet)), length(dFdy(facet)));
        visibility = mix(visibility, .18, smoothstep(.5, 1.4, facetFootprint));
        col += uSunColor * ((glint * 7.0 + glintCore * 38.0) * visibility + sheen * .12)
          * uSunStrength * uGlintStrength;
        float ripple = pow(max(.0, 1.0 - abs(n1.x + n0.y * .6) * 11.0), 8.0);
        col += uSunColor * ripple * (1.0 - fresnel) * uSunStrength * .035;
        // The bridge casts a deep cool shade into the entrance of its tunnel.
        float tunnelZ = sin(uTunnelYaw) * p.x + cos(uTunnelYaw) * (p.y - uTunnelZ) - 24.0;
        float tunnel = (1.0 - smoothstep(-22.1, -20.3, tunnelZ)) * smoothstep(-28.0, -26.0, tunnelZ);
        col *= 1.0 - tunnel * .73;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  };
  const geometry = new THREE.PlaneGeometry(6.4, 116, 40, 580);
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    vertices.setX(i, vertices.getX(i) + riverCenter(-vertices.getY(i) - 12));
  }
  geometry.computeBoundingSphere();
  const mesh = new Water(geometry, {
    textureWidth: 1024, textureHeight: 1024,
    normalMap0: maps[0], normalMap1: maps[1], shader,
    flowSpeed: 0, color: 0xffffff,
  });
  mesh.name = 'Flowing creek — reflection and refraction';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, .35, -12);
  mesh.material.transparent = false;
  scene.add(mesh);
  // Avoid reflecting the scene a second time when a depth/shadow pass runs.
  const reflect = mesh.onBeforeRender;
  mesh.onBeforeRender = function(renderer, renderScene, camera) {
    if (!renderScene.overrideMaterial) reflect.call(this, renderer, renderScene, camera);
  };
  const uniforms = mesh.material.uniforms;
  let waterTime = 0;
  return {
    mesh, uniforms,
    update(dt, state, sunDirection, sunColor, sunStrength, night) {
      waterTime += dt * state.flow;
      uniforms.uTime.value = waterTime;
      uniforms.uWave.value = state.wave;
      uniforms.uSunDirection.value.copy(sunDirection);
      uniforms.uSunColor.value.copy(sunColor);
      uniforms.uSunStrength.value = sunStrength;
      uniforms.uNight.value = night;
      const palette = palettes[state.mode];
      const blend = 1 - Math.exp(-dt * 2.1);
      uniforms.uWaterTint.value.lerp(palette.tint, blend);
      uniforms.uAbsorption.value.lerp(palette.absorption, blend);
      uniforms.uScatterStrength.value = THREE.MathUtils.lerp(uniforms.uScatterStrength.value, palette.scatter, blend);
      uniforms.uReflectionStrength.value = THREE.MathUtils.lerp(uniforms.uReflectionStrength.value, palette.reflection, blend);
      uniforms.uGlintStrength.value = THREE.MathUtils.lerp(uniforms.uGlintStrength.value, palette.glint, blend);
    },
  };
}

export function addCreekDetails(scene, rockPositions) {
  const time = { value: 0 };
  const light = { value: 1 };
  const rippleColor = { value: new THREE.Color('#b7d1d9') };
  const causticMaterials = new Set();
  const wetMaterials = new Set();
  scene.traverse(object => {
    if (object.name === 'Riverbed' || object.name.includes('RiverRock')) causticMaterials.add(object.material);
    if (object.name.includes('RiverRock')) wetMaterials.add(object.material);
  });
  for (const material of causticMaterials) {
    if (!material?.isMeshStandardMaterial) continue;
    material.onBeforeCompile = shader => {
      shader.uniforms.uCausticTime = time; shader.uniforms.uCausticLight = light;
      shader.vertexShader = 'varying vec3 vCausticWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vec4 cp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cp = instanceMatrix * cp;
        #endif
        vCausticWorld = (modelMatrix * cp).xyz;
        #include <project_vertex>
      `);
      shader.fragmentShader = 'varying vec3 vCausticWorld; uniform float uCausticTime, uCausticLight;\n' + shader.fragmentShader;
      if (wetMaterials.has(material)) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
          #include <roughnessmap_fragment>
          float wetLevel = .35 + sin(vCausticWorld.x * 5.8 + vCausticWorld.z * 3.1) * .009
            + sin(vCausticWorld.z * 8.4 - uCausticTime * 1.4) * .006;
          float wetness = 1.0 - smoothstep(wetLevel - .025, wetLevel + .085, vCausticWorld.y);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(.70, .76, .76), wetness);
          roughnessFactor = mix(roughnessFactor, max(.32, roughnessFactor * .62), wetness);
        `);
      }
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec2 ca = vCausticWorld.xz * 5.3;
        float pattern = sin(ca.x + sin(ca.y * 1.2 + uCausticTime))
          + sin(ca.y - uCausticTime * 1.4 + sin(ca.x * .8));
        float beam = pow(max(0.0, 1.0 - abs(pattern) * 2.8), 6.0);
        float submerged = 1.0 - smoothstep(.20, .39, vCausticWorld.y);
        outgoingLight += diffuseColor.rgb * beam * submerged * uCausticLight * .44;
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey = () => wetMaterials.has(material) ? 'creek-wet-stone-caustics' : 'creek-caustics';
    material.needsUpdate = true;
  }
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uLight: light, uRippleColor: rippleColor },
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      attribute vec4 aRockShape;
      varying vec2 vUv;
      varying vec4 vRockShape;
      varying float vSeed;
      void main() {
        vUv = uv; vRockShape = aRockShape;
        vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.28318;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float uTime, uLight;
      uniform vec3 uRippleColor;
      varying vec2 vUv;
      varying vec4 vRockShape;
      varying float vSeed;
      void main() {
        // Local downstream distance is measured in stone radii. The bow follows
        // the stone's ellipse, while the two wake branches follow the creek.
        vec2 p = vec2((vUv.x - .5) * 3.8, (.5 - vUv.y) * 4.6 + .7);
        vec2 stoneP = vec2(vRockShape.w * p.x - vRockShape.z * p.y,
          vRockShape.z * p.x + vRockShape.w * p.y) / (vRockShape.xy * .86);
        float ellipse = length(stoneP);
        float angle = atan(stoneP.y, stoneP.x);
        float phase = uTime * 1.8 + vSeed;
        float bowRadius = 1.04 + sin(angle * 3.0 + vSeed) * .025 + sin(phase) * .015;
        float bowWidth = max(.025, fwidth(ellipse) * .85);
        float bow = 1.0 - smoothstep(bowWidth, bowWidth + .075, abs(ellipse - bowRadius));
        float bowMask = (1.0 - smoothstep(.05, .65, p.y))
          * (.25 + .75 * smoothstep(-.35, .65, sin(angle * 3.7 + vSeed)));
        bow *= bowMask;
        float shoulder = sqrt(vRockShape.x * vRockShape.x * vRockShape.w * vRockShape.w
          + vRockShape.y * vRockShape.y * vRockShape.z * vRockShape.z) * .78;
        float tail = max(p.y, 0.0);
        float spread = shoulder + tail * .18;
        float leftPath = -spread + sin(tail * 4.1 - phase) * .065;
        float rightPath = spread + sin(tail * 3.4 - phase * .87 + 2.0) * .085;
        float branchDistance = min(abs(p.x - leftPath), abs(p.x - rightPath));
        float branchWidth = max(.025, fwidth(branchDistance));
        float branches = 1.0 - smoothstep(branchWidth, branchWidth + .065, branchDistance);
        float tailMask = smoothstep(.05, .62, p.y) * (1.0 - smoothstep(1.15, 2.8, p.y));
        float broken = smoothstep(-.2, .7, sin(tail * 8.4 - phase * 1.6 + p.x * 2.3));
        branches *= tailMask * broken;
        float trough = (1.0 - smoothstep(.06, .19, branchDistance)) * tailMask * .3;
        float highlight = bow * .72 + branches;
        float alpha = highlight * .15 + trough * .045;
        vec3 color = mix(vec3(.012, .025, .026), uRippleColor * (.28 + uLight * .32),
          highlight / max(highlight + trough, .001));
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const wakeGeometry = new THREE.PlaneGeometry(1, 1);
  const rockShapes = new Float32Array(rockPositions.length * 4);
  wakeGeometry.setAttribute('aRockShape', new THREE.InstancedBufferAttribute(rockShapes, 4));
  const wakes = new THREE.InstancedMesh(wakeGeometry, mat, rockPositions.length);
  const dummy = new THREE.Object3D();
  rockPositions.forEach((rock, i) => {
    dummy.position.set(rock.x, .378, rock.z + rock.radius * .7);
    dummy.rotation.x = -Math.PI / 2;
    dummy.scale.set(rock.radius * 3.8, rock.radius * 4.6, 1);
    dummy.updateMatrix(); wakes.setMatrixAt(i, dummy.matrix);
    rockShapes.set([(rock.radiusX ?? rock.radius) / rock.radius, (rock.radiusZ ?? rock.radius) / rock.radius,
      Math.sin(rock.rotation ?? 0), Math.cos(rock.rotation ?? 0)], i * 4);
  });
  wakes.name = 'Small downstream wakes'; wakes.renderOrder = 2;
  scene.add(wakes);
  return {
    update(t, strength, sunColor, skyColor) {
      time.value = t; light.value = strength;
      if (sunColor) {
        rippleColor.value.copy(sunColor);
        if (skyColor) rippleColor.value.lerp(skyColor, .75);
      }
    },
  };
}
