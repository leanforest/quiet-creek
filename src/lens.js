import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const filmGrades = {
  afternoon: { shadows: new THREE.Vector3(.97, 1.005, 1.02), highlights: new THREE.Vector3(1.012, 1.01, .992), saturation: 1.045, contrast: 1.025 },
  golden: { shadows: new THREE.Vector3(.94, .97, 1.045), highlights: new THREE.Vector3(1.045, 1.015, .955), saturation: 1.018, contrast: 1.04 },
  blue: { shadows: new THREE.Vector3(.93, 1.015, 1.045), highlights: new THREE.Vector3(1.018, .985, 1.06), saturation: 1.04, contrast: 1.02 },
  night: { shadows: new THREE.Vector3(.945, .96, 1.10), highlights: new THREE.Vector3(.975, 1.005, 1.045), saturation: 1.025, contrast: 1.035 },
};

// Camera distance is in metres; focal length and the film gate are in mm.
// The scene is built at a large scale, so opticalScale restores the intimate
// depth of field of the reference without tying blur to screen position.
const circleOfConfusion = /* glsl */`
  #include <packing>
  uniform sampler2D tDepth;
  uniform float nearClip, farClip, focus, dof, aperture, focalLength, opticalScale, maxCoC;
  uniform vec2 resolution;
  float getCoC(vec2 uv) {
    float depth = texture2D(tDepth, uv).r;
    float distance = -perspectiveDepthToViewZ(depth, nearClip, farClip);
    float focal = focalLength * 0.001;
    float diameter = focal * focal / (max(aperture, 1.0) * max(focus - focal, 0.1));
    float radius = diameter * (1.0 - focus / max(distance, 0.08)) * resolution.y / 0.024 * 0.5;
    radius *= opticalScale * dof;
    // Keep the cottage readable while retaining a real far-focus falloff.
    radius *= mix(1.0, 0.45, step(0.0, radius));
    return clamp(radius, -maxCoC, maxCoC);
  }
`;

export function createLens(renderer, scene, camera) {
  const highSamples = Math.min(4, renderer.capabilities.maxSamples);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, samples: highSamples, resolveDepthBuffer: true,
  });
  target.texture.name = 'Lens.linearScene';
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  target.depthTexture.name = 'Lens.sceneDepth';
  const makeTarget = (name, count = 1) => {
    const buffer = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, count });
    buffer.textures.forEach((texture, index) => { texture.name = name + '.' + index; });
    return buffer;
  };
  const prefiltered = makeTarget('Lens.prefilter');
  const spreadX = makeTarget('Lens.nearSpreadX');
  const spreadY = makeTarget('Lens.nearSpreadY');
  const bokeh = makeTarget('Lens.bokeh', 2);
  const common = {
    tDepth: { value: target.depthTexture },
    nearClip: { value: camera.near }, farClip: { value: camera.far },
    focus: { value: 8 }, dof: { value: 1 }, aperture: { value: 1.4 },
    focalLength: { value: 50 }, opticalScale: { value: 1.9 }, maxCoC: { value: 32 },
    resolution: { value: new THREE.Vector2(1, 1) },
    halfResolution: { value: new THREE.Vector2(1, 1) },
    filmStrength: { value: 1.5 }, grain: { value: 0.03 }, aberration: { value: 0.18 },
    time: { value: 0 },
  };
  const material = (name, uniforms, fragmentShader, options = {}) => new THREE.ShaderMaterial({
    name, uniforms: { ...common, ...uniforms }, vertexShader, fragmentShader,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false, ...options,
  });

  const prefilter = material('Lens HDR prefilter', { tColor: { value: target.texture } }, /* glsl */`
    ${circleOfConfusion}
    uniform sampler2D tColor;
    varying vec2 vUv;
    void main() {
      vec2 texel = 0.5 / resolution;
      vec2 a = vUv + vec2(-texel.x, -texel.y);
      vec2 b = vUv + vec2( texel.x, -texel.y);
      vec2 c = vUv + vec2(-texel.x,  texel.y);
      vec2 d = vUv + vec2( texel.x,  texel.y);
      vec4 coc = vec4(getCoC(a), getCoC(b), getCoC(c), getCoC(d));
      float closest = min(min(coc.x, coc.y), min(coc.z, coc.w));
      float farthest = max(max(coc.x, coc.y), max(coc.z, coc.w));
      float radius = abs(closest) > abs(farthest) ? closest : farthest;
      // Average radiance, not tone-mapped colour: a subpixel sun glint keeps
      // its energy when it becomes an out-of-focus circle.
      vec3 color = (texture2D(tColor, a).rgb + texture2D(tColor, b).rgb
        + texture2D(tColor, c).rgb + texture2D(tColor, d).rgb) * 0.25;
      gl_FragColor = vec4(color, radius);
    }
  `);
  const spreadShader = /* glsl */`
    uniform sampler2D tSource;
    uniform vec2 resolution, direction;
    uniform float maxCoC;
    varying vec2 vUv;
    void main() {
      float radius = 0.0;
      for (int i = -4; i <= 4; i++) {
        float distance = float(i) * maxCoC * 0.25;
        vec4 source = texture2D(tSource, vUv + direction * distance / resolution);
        #ifdef FIRST_SPREAD
          float candidate = max(0.0, -source.a);
        #else
          float candidate = source.r;
        #endif
        radius = max(radius, candidate * step(abs(distance), candidate + 1.0));
      }
      gl_FragColor = vec4(radius, 0.0, 0.0, 1.0);
    }
  `;
  const dilateX = material('Lens foreground spread X', {
    tSource: { value: prefiltered.texture }, direction: { value: new THREE.Vector2(1, 0) },
  }, spreadShader, { defines: { FIRST_SPREAD: 1 } });
  const dilateY = material('Lens foreground spread Y', {
    tSource: { value: spreadX.texture }, direction: { value: new THREE.Vector2(0, 1) },
  }, spreadShader);

  const gather = material('Lens aperture gather', {
    tSource: { value: prefiltered.texture }, tNearRadius: { value: spreadY.texture },
  }, /* glsl */`
    uniform sampler2D tSource, tNearRadius;
    uniform vec2 resolution;
    varying vec2 vUv;
    layout(location = 0) out vec4 farLayer;
    layout(location = 1) out vec4 nearLayer;
    void main() {
      vec4 center = textureLod(tSource, vUv, 0.0);
      float gatherRadius = max(abs(center.a), textureLod(tNearRadius, vUv, 0.0).r);
      if (gatherRadius < 0.75) {
        farLayer = vec4(center.rgb, 1.0); nearLayer = vec4(0.0); return;
      }
      vec3 farColor = vec3(0.0), nearColor = vec3(0.0);
      float farWeight = 0.0, nearWeight = 0.0;
      // A stable Vogel disk has no concentric sampling rings. The small
      // per-pixel rotation is reconstructed by the following tent filter.
      float rotation = fract(dot(gl_FragCoord.xy, vec2(0.754877666, 0.569840296))) * 6.283185;
      for (int i = 0; i < SAMPLES; i++) {
        float diskRadius = sqrt(float(i) / float(SAMPLES - 1));
        float angle = float(i) * 2.39996323 + rotation;
        float distance = diskRadius * gatherRadius;
        vec2 offset = vec2(cos(angle), sin(angle)) * distance / resolution;
        // These render targets have no mipmaps. Explicit LOD also avoids
        // undefined screen derivatives after the per-pixel early return.
        vec4 sampleColor = textureLod(tSource, clamp(vUv + offset, vec2(0.0), vec2(1.0)), 0.0);
        // Background blur cannot cross an in-focus or nearer silhouette.
        float farCoC = max(min(center.a, sampleColor.a), 0.0);
        float fw = clamp(farCoC - distance + 1.0, 0.0, 1.0) * step(0.1, sampleColor.a);
        farColor += sampleColor.rgb * fw; farWeight += fw;
        // Foreground circles may cover the focal plane. Inverse disk-area
        // weighting produces fractional coverage instead of dark halos.
        float nearCoC = max(-sampleColor.a, 0.0);
        float nw = clamp(nearCoC - distance + 1.0, 0.0, 1.0) * step(0.75, nearCoC);
        nw *= gatherRadius * gatherRadius / max(nearCoC * nearCoC, 1.0);
        nearColor += sampleColor.rgb * nw; nearWeight += nw;
      }
      farColor = farWeight > 0.0001 ? farColor / farWeight : center.rgb;
      float coverage = clamp(nearWeight / float(SAMPLES), 0.0, 1.0);
      nearColor = nearWeight > 0.0001 ? nearColor / nearWeight : vec3(0.0);
      farLayer = vec4(farColor, 1.0);
      nearLayer = vec4(nearColor * coverage, coverage);
    }
  `, { glslVersion: THREE.GLSL3, defines: { SAMPLES: 64 } });

  const lens = new ShaderPass(material('Lens depth composite', {
    tDiffuse: { value: null }, tFar: { value: bokeh.textures[0] }, tNear: { value: bokeh.textures[1] },
  }, /* glsl */`
    ${circleOfConfusion}
    uniform sampler2D tDiffuse, tFar, tNear;
    uniform vec2 halfResolution;
    varying vec2 vUv;
    void main() {
      vec3 sharp = texture2D(tDiffuse, vUv).rgb;
      if (dof < 0.001) { gl_FragColor = vec4(sharp, 1.0); return; }
      float coc = getCoC(vUv);
      // Four bilinear samples form a smooth tent reconstruction. Premultiplied
      // near colour keeps the foreground boundary free of dark fringes.
      vec2 texel = 0.75 / halfResolution;
      vec3 farColor = vec3(0.0);
      vec4 nearColor = vec4(0.0);
      for (int i = 0; i < 4; i++) {
        vec2 offset = vec2(float(i - (i / 2) * 2) * 2.0 - 1.0, float(i / 2) * 2.0 - 1.0) * texel;
        farColor += texture2D(tFar, vUv + offset * 0.6).rgb * 0.25;
        nearColor += texture2D(tNear, vUv + offset) * 0.25;
      }
      vec3 color = mix(sharp, farColor, smoothstep(0.8, 2.5, coc));
      color = color * (1.0 - nearColor.a) + nearColor.rgb;
      gl_FragColor = vec4(color, 1.0);
    }
  `));
  const grade = {
    gradeShadows: { value: filmGrades.afternoon.shadows.clone() },
    gradeHighlights: { value: filmGrades.afternoon.highlights.clone() },
    gradeSaturation: { value: filmGrades.afternoon.saturation },
    gradeContrast: { value: filmGrades.afternoon.contrast },
  };
  const finish = new ShaderPass(material('Lens film response', { tDiffuse: { value: null }, ...grade }, /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform vec3 gradeShadows, gradeHighlights;
    uniform float filmStrength, grain, aberration, time;
    uniform float gradeSaturation, gradeContrast;
    varying vec2 vUv;
    float noise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main() {
      vec2 q = (vUv - 0.5) * 2.0;
      float edge = dot(q, q);
      // Keep lateral colour below one pixel, even in the frame corners.
      // Large RGB offsets create coloured stair-steps along fine branches.
      vec2 shift = q * smoothstep(0.35, 1.6, edge) * aberration * filmStrength / resolution;
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      color.r = texture2D(tDiffuse, clamp(vUv + shift, 0.0, 1.0)).r;
      color.b = texture2D(tDiffuse, clamp(vUv - shift, 0.0, 1.0)).b;
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      // Each hour keeps its own shadow/highlight colours in linear light.
      // ACES in OutputPass still performs the HDR highlight rolloff.
      vec3 balance = mix(gradeShadows, gradeHighlights, smoothstep(0.045, 1.1, luminance));
      color *= mix(vec3(1.0), balance, filmStrength);
      luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luminance), color, 1.0 + (gradeSaturation - 1.0) * filmStrength);
      // A bounded gain around middle gray preserves dark foliage detail and
      // bright window radiance instead of clipping either end of the image.
      float tonalContrast = (luminance - 0.18) / (luminance + 0.18);
      color *= 1.0 + tonalContrast * (gradeContrast - 1.0) * filmStrength;
      color *= exp(-edge * 0.105 * filmStrength);
      float frame = floor(time * 24.0);
      float dither = noise(gl_FragCoord.xy + vec2(frame * 13.37, frame * 7.19)) - 0.5;
      color += dither * grain * 0.24 * sqrt(clamp(luminance, 0.02, 1.0)) * filmStrength;
      gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    }
  `));
  const composer = new EffectComposer(renderer);
  composer.addPass(new TexturePass(target.texture));
  composer.addPass(lens);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.55, 1.15);
  composer.addPass(bloom);
  // MSAA resolves geometry coverage; SMAA also catches alpha foliage and
  // shader edges in the finished image without softening the whole frame.
  // Three's SMAA runs in linear colour, before OutputPass and film grain.
  const antialias = new SMAAPass();
  composer.addPass(antialias);
  composer.addPass(finish);
  composer.addPass(new OutputPass());
  const quad = new FullScreenQuad();
  const viewport = new THREE.Vector4(), scissor = new THREE.Vector4();
  function draw(material, buffer) {
    quad.material = material;
    renderer.setRenderTarget(buffer);
    quad.render(renderer);
  }

  return {
    composer, lens, bloom, antialias,
    // Reuse the scene's depth attachment; no extra render of the vegetation or water.
    target,
    updateGrade(mode, dt) {
      const target = filmGrades[mode];
      const t = 1 - Math.exp(-dt * 2.1);
      grade.gradeShadows.value.lerp(target.shadows, t);
      grade.gradeHighlights.value.lerp(target.highlights, t);
      grade.gradeSaturation.value = THREE.MathUtils.lerp(grade.gradeSaturation.value, target.saturation, t);
      grade.gradeContrast.value = THREE.MathUtils.lerp(grade.gradeContrast.value, target.contrast, t);
    },
    setQuality(quality) {
      const sceneSamples = quality === 'high' ? highSamples : 0;
      if (target.samples !== sceneSamples) {
        // Sample count changes require new renderbuffers, even at the same
        // canvas size. Keep the texture objects shared by all post passes.
        target.samples = sceneSamples; target.dispose();
      }
      const samples = quality === 'high' ? 64 : 32;
      if (gather.defines.SAMPLES !== samples) {
        gather.defines.SAMPLES = samples; gather.needsUpdate = true;
      }
    },
    resize(width, height, ratio, film = true) {
      const w = Math.max(1, Math.floor(width * ratio)), h = Math.max(1, Math.floor(height * ratio));
      // 关闭摄影时释放散景缓冲，保留场景采样和 SMAA 所需的完整分辨率。
      const hw = film ? Math.max(1, Math.ceil(w / 2)) : 1, hh = film ? Math.max(1, Math.ceil(h / 2)) : 1;
      target.setSize(w, h);
      for (const buffer of [prefiltered, spreadX, spreadY, bokeh]) buffer.setSize(hw, hh);
      composer.setPixelRatio(ratio); composer.setSize(width, height);
      common.resolution.value.set(w, h); common.halfResolution.value.set(hw, hh);
      common.maxCoC.value = h * 0.035;
    },
    render(dt) {
      const previousTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      const previousScissorTest = renderer.getScissorTest();
      renderer.getViewport(viewport); renderer.getScissor(scissor);
      common.nearClip.value = camera.near; common.farClip.value = camera.far;
      common.time.value += dt;
      lens.enabled = common.dof.value > 0.001;
      finish.enabled = common.filmStrength.value > 0.001;
      bloom.enabled = bloom.strength > 0.001;
      try {
        renderer.autoClear = true; renderer.setScissorTest(false);
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        if (lens.enabled) {
          draw(prefilter, prefiltered);
          draw(dilateX, spreadX); draw(dilateY, spreadY);
          draw(gather, bokeh);
        }
        renderer.setRenderTarget(null); composer.render(dt);
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.autoClear = previousAutoClear;
        renderer.setViewport(viewport); renderer.setScissor(scissor);
        renderer.setScissorTest(previousScissorTest);
      }
    },
    dispose() {
      for (const buffer of [target, prefiltered, spreadX, spreadY, bokeh]) buffer.dispose();
      for (const pass of composer.passes) pass.dispose();
      for (const shader of [prefilter, dilateX, dilateY, gather]) shader.dispose();
      quad.dispose(); composer.dispose();
    },
  };
}
