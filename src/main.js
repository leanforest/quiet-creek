import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createLandscape, cottageZ, riverCenter } from './landscape.js';
import { createWater, addCreekDetails } from './water.js';
import { createAtmosphere } from './atmosphere.js';
import { createLens } from './lens.js';
import { createUI, fitViewport } from './ui.js';
import { CreekAudio } from './audio.js';
import './style.css';
fitViewport();

const defaults = { mode: 'golden', view: 'creek', film: true, dof: true, aperture: 1.4, focusDistance: 8, filmStrength: 1.5, sound: false, flow: 1, wave: 1, wind: 1, exposure: 1, volume: .4, quality: 'high' };
const state = { ...defaults };
const audio = new CreekAudio();
let atmosphere, optics, landscape, water, creekDetails, renderer, scene, camera;
let ready = false;
let pendingScreenshot = false;
const windowMaterials = [];
const porchLights = [];
const cottageYaw = -.14;
const cottageAxis = new THREE.Vector3(0, 1, 0);
function cottagePoint(x, y, z) {
  const point = new THREE.Vector3(x, y, z + 24).applyAxisAngle(cottageAxis, cottageYaw);
  point.z += cottageZ;
  return point;
}
const canvas = document.querySelector('#scene');
const ui = createUI({
  onMode(mode) { state.mode = mode; atmosphere?.setMode(mode); audio.setMode(mode); },
  onView(view) { state.view = view; setView(view); },
  onDof(value) { state.dof = value; },
  onFilm(value) { state.film = value; resize(); },
  async onSound(enabled) { state.sound = enabled; await audio.setEnabled(enabled); },
  onSetting(name, value) {
    state[name] = value;
    if (name === 'volume') audio.setVolume(value);
    if (name === 'quality') {
      resize();
    }
  },
  onReset() {
    Object.assign(state, defaults);
    atmosphere?.setMode(state.mode); audio.setMode(state.mode);
    audio.setVolume(state.volume); audio.setEnabled(false);
    setView('creek');
    resize();
  },
  onScreenshot() { pendingScreenshot = true; },
  async onFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        if (screen.orientation?.lock) {
          try { await screen.orientation.lock('landscape'); } catch { /* Desktop and iOS can decline orientation locking. */ }
        }
      }
    } catch { ui.showError('当前浏览器不支持全屏，请将窗口横向展开。'); }
  },
}, state);

const poses = {
  creek: { position: new THREE.Vector3(.65, 1.65, 32), yaw: .12, pitch: -.11, focus: defaults.focusDistance },
  bridge: { position: new THREE.Vector3(riverCenter(cottageZ + 19) + .4, 1.6, cottageZ + 19), yaw: -.12, pitch: .075, focus: 18 },
  porch: { position: cottagePoint(-1.65, 4.15, -21.65), yaw: Math.PI + cottageYaw, pitch: -.11 },
};
const position = poses.creek.position.clone();
let yaw = poses.creek.yaw, pitch = poses.creek.pitch;
let currentYaw = yaw, currentPitch = pitch;
let transition = null;
const keys = new Set();
let accumulatedTime = 0;
let frameCount = 0, fpsTime = 0, lastTime = 0;

function setView(name) {
  if (!camera) return;
  const pose = poses[name];
  state.focusDistance = pose.focus || 15;
  ui.setFocus(state.focusDistance);
  const shortestAngle = THREE.MathUtils.euclideanModulo(pose.yaw - currentYaw + Math.PI, Math.PI * 2) - Math.PI;
  // 远距离沿溪移动和大角度转身都缓慢完成，避免后移木屋后仍在固定时间内飞越溪谷。
  const duration = Math.max(4.5, camera.position.distanceTo(pose.position) / 8, Math.abs(shortestAngle) / .5);
  transition = { from: camera.position.clone(), to: pose.position.clone(), startYaw: currentYaw, startPitch: currentPitch, time: 0, duration };
  transition.endYaw = currentYaw + shortestAngle;
  transition.endPitch = pose.pitch;
  position.copy(pose.position);
  yaw = transition.endYaw; pitch = pose.pitch;
  ui.setView(name);
}

async function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(49, 16 / 9, .08, 180);
  camera.rotation.order = 'YXZ'; camera.position.copy(position);
  atmosphere = createAtmosphere(scene);
  atmosphere.setMode(state.mode);
  landscape = createLandscape(scene);
  const manager = new THREE.LoadingManager();
  let texturesReady;
  const texturePromise = new Promise(resolve => { texturesReady = resolve; });
  manager.onLoad = texturesReady;
  manager.onError = url => ui.showError(`资源加载失败：${url}`);
  water = createWater(scene, manager, cottageYaw);
  creekDetails = addCreekDetails(scene, landscape.rockPositions);
  optics = createLens(renderer, scene, camera);
  resize();
  const cottage = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${import.meta.env.BASE_URL}models/cottage.glb`);
  cottage.scene.name = 'Blender cottage and vaulted stone canal';
  cottage.scene.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true; object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.envMapIntensity = .4;
      if (material.name.includes('WindowGlow') || material.name.includes('LanternGlow')) {
        material.color.set('#34494b');
        windowMaterials.push(material);
      }
      if (material.map) material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
  });
  // A slight turn reveals the cottage's side and softens the bridge's straight
  // cross-axis. Keep the complete Blender asset together around its own centre.
  const cottagePlacement = new THREE.Group();
  cottagePlacement.name = 'Cottage nestled across the creek';
  cottagePlacement.position.z = cottageZ;
  cottagePlacement.rotation.y = cottageYaw;
  cottage.scene.position.z = 24;
  cottagePlacement.add(cottage.scene);
  scene.add(cottagePlacement);
  // Place window bounce above and behind the handrail, away from its surface.
  for (const [x, y, z, power] of [[-1.65, 4.75, -21.65, 1.6], [1.65, 4.75, -21.65, 1.6], [0, 6.7, -21.9, .8]]) {
    const light = new THREE.PointLight('#ffb365', power, 5.5, 2);
    light.position.copy(cottagePoint(x, y, z)); light.userData.power = power;
    porchLights.push(light); scene.add(light);
  }
  addFireflies();
  await texturePromise;
  atmosphere.update(1, 0, camera);
  renderer.shadowMap.needsUpdate = true;
  ready = true;
  renderer.setAnimationLoop(animate);
  ui.setLoaded();
  // Diagnostics make rendering and asset loading easy to verify in development.
  window.__creek = {
    state, scene, camera, renderer, landscape, optics, water, atmosphere,
    get stats() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, ready }; },
  };
}

let fireflies;
function addFireflies() {
  const count = 85;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    data[i * 3] = Math.sin(i * 45.17) * 7;
    data[i * 3 + 1] = 1 + (Math.sin(i * 1.78) + 1) * 1.5;
    data[i * 3 + 2] = Math.cos(i * 13.45) * 35;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, night: { value: 0 } },
    vertexShader: `uniform float uTime; varying float brightness; void main(){vec3 p=position;p.x+=sin(uTime*.4+position.z)*.6;p.y+=sin(uTime*.8+position.x)*.2;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(36./-mv.z,1.,5.);brightness=pow(sin(uTime+position.z)*.5+.5,3.);}`,
    fragmentShader: `uniform float night; varying float brightness; void main(){float d=length(gl_PointCoord-.5);float a=pow(max(0.,1.-d*2.),2.)*brightness*night;gl_FragColor=vec4(1.9,1.8,.65,a);}`,
  });
  fireflies = new THREE.Points(geo, mat);
  fireflies.name = 'Dusk fireflies'; scene.add(fireflies);
}

function resize() {
  fitViewport();
  if (!renderer || !optics) return;
  const { width, height } = document.querySelector('.scene-frame').getBoundingClientRect();
  // 高分屏优先接近原生分辨率，同时限制横屏和大窗口的总像素开销。
  const pixelBudget = 4000000;
  const ratio = Math.min(devicePixelRatio, state.quality === 'high' ? 3 : .85, Math.sqrt(pixelBudget / (width * height)));
  renderer.setPixelRatio(ratio); renderer.setSize(width, height);
  camera.aspect = width / height; camera.updateProjectionMatrix();
  optics.resize(width, height, ratio, state.film);
  optics.setQuality(state.quality);
  renderer.shadowMap.needsUpdate = true;
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', resize);
if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(document.querySelector('.scene-frame'));
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); renderer?.setAnimationLoop(null);
  ui.showError('图形上下文已中断，请刷新页面重新进入溪谷。');
});

const touches = new Map();
let pinchDistance = null;
function cancelTransition() {
  if (!transition) return;
  position.copy(camera.position); yaw = currentYaw; pitch = currentPitch;
  transition = null;
}
canvas.addEventListener('pointerdown', event => {
  canvas.setPointerCapture(event.pointerId);
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  canvas.classList.add('is-dragging'); cancelTransition();
});
canvas.addEventListener('pointermove', event => {
  const prev = touches.get(event.pointerId);
  if (!prev) return;
  if (touches.size === 1) {
    yaw -= (event.clientX - prev.x) * .0024;
    pitch = THREE.MathUtils.clamp(pitch - (event.clientY - prev.y) * .0022, -.7, .8);
  }
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDistance !== null) moveForward((distance - pinchDistance) * .06);
    pinchDistance = distance;
  }
});
function releasePointer(event) {
  touches.delete(event.pointerId); pinchDistance = null;
  if (!touches.size) canvas.classList.remove('is-dragging');
}
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('wheel', event => {
  event.preventDefault(); cancelTransition();
  if (state.view === 'porch') return;
  // Scroll down follows the creek upstream, as in the demonstration.
  position.z -= THREE.MathUtils.clamp(event.deltaY * .009, -2.5, 2.5);
  constrainPosition();
}, { passive: false });
window.addEventListener('keydown', event => {
  if (event.target.closest('input,button,textarea')) return;
  const key = event.key.toLowerCase();
  if (key === 'h' && !event.repeat) document.body.classList.toggle('hide-ui');
  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)) {
    keys.add(key); event.preventDefault(); cancelTransition();
  }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); touches.clear(); });
document.addEventListener('visibilitychange', () => {
  lastTime = 0; keys.clear();
});

function moveForward(amount) {
  position.x -= Math.sin(yaw) * amount;
  position.z -= Math.cos(yaw) * amount;
  constrainPosition();
}
function constrainPosition() {
  if (!landscape) return;
  if (state.view === 'porch') {
    position.z -= cottageZ;
    position.applyAxisAngle(cottageAxis, -cottageYaw);
    position.z -= 24;
    position.x = THREE.MathUtils.clamp(position.x, -2, 2);
    position.z = THREE.MathUtils.clamp(position.z, -21.9, -21.15);
    position.y = 4.15;
    position.copy(cottagePoint(position.x, position.y, position.z));
    return;
  }
  position.x = THREE.MathUtils.clamp(position.x, -17, 17);
  position.z = THREE.MathUtils.clamp(position.z, cottageZ + 5, 40);
  const ground = landscape.terrainHeight(position.x, position.z);
  const distanceFromCreek = Math.abs(position.x - landscape.riverCenter(position.z));
  const bankClearance = distanceFromCreek > 2.65 && distanceFromCreek < 3.95 ? 2.0 : 0;
  position.y = Math.max(1.42, ground + 1.35, bankClearance);
}

function updateCamera(dt) {
  if (transition) {
    transition.time += dt;
    const t = Math.min(1, transition.time / transition.duration);
    const k = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.from, transition.to, k);
    currentYaw = THREE.MathUtils.lerp(transition.startYaw, transition.endYaw, k);
    currentPitch = THREE.MathUtils.lerp(transition.startPitch, transition.endPitch, k);
    // Approach the bridge deck gradually when crossing to or from the porch.
    const deckClearance = THREE.MathUtils.lerp(3.9, 1.42, THREE.MathUtils.smoothstep(camera.position.z, cottageZ + 6, cottageZ + 12));
    camera.position.y = Math.max(camera.position.y, deckClearance);
    if (t === 1) transition = null;
  } else {
    const distance = dt * (keys.has('shift') ? 7 : 3.2);
    if (keys.has('w') || keys.has('arrowup')) moveForward(distance);
    if (keys.has('s') || keys.has('arrowdown')) moveForward(-distance);
    if (keys.has('a') || keys.has('arrowleft')) { position.x -= Math.cos(yaw) * distance; position.z += Math.sin(yaw) * distance; constrainPosition(); }
    if (keys.has('d') || keys.has('arrowright')) { position.x += Math.cos(yaw) * distance; position.z -= Math.sin(yaw) * distance; constrainPosition(); }
    camera.position.lerp(position, 1 - Math.exp(-dt * 6));
    currentYaw = THREE.MathUtils.lerp(currentYaw, yaw, 1 - Math.exp(-dt * 12));
    currentPitch = THREE.MathUtils.lerp(currentPitch, pitch, 1 - Math.exp(-dt * 12));
  }
  camera.rotation.set(currentPitch, currentYaw, 0);
  ui.setProgress((40 - camera.position.z) / (40 - (cottageZ + 5)));
}

function animate(time) {
  if (!ready) return;
  const elapsed = lastTime ? (time - lastTime) / 1000 : 1 / 60;
  const dt = Math.min(elapsed, .05);
  lastTime = time; accumulatedTime += dt;
  updateCamera(dt);
  atmosphere.update(dt, accumulatedTime, camera);
  const lighting = atmosphere.current;
  landscape.update(accumulatedTime, state.wind, atmosphere.direction, lighting.sun, lighting.direct);
  water.update(dt, state, atmosphere.direction, lighting.sun, lighting.direct * .45, lighting.night);
  creekDetails.update(accumulatedTime * state.flow, lighting.direct * .32, lighting.sun, lighting.ambient);
  for (const material of windowMaterials) material.emissiveIntensity = lighting.windows;
  for (const light of porchLights) light.intensity = light.userData.power * Math.min(lighting.windows, 3);
  fireflies.material.uniforms.uTime.value = accumulatedTime;
  fireflies.material.uniforms.night.value = lighting.night;
  fireflies.visible = lighting.night > .05;
  renderer.toneMappingExposure = lighting.exposure * state.exposure;
  optics.updateGrade(state.mode, dt);
  optics.lens.uniforms.dof.value = state.film && state.dof ? 1 : 0;
  optics.lens.uniforms.focus.value = THREE.MathUtils.lerp(optics.lens.uniforms.focus.value, state.focusDistance, 1 - Math.exp(-dt * 4));
  optics.lens.uniforms.aperture.value = state.aperture;
  optics.lens.uniforms.filmStrength.value = state.film ? state.filmStrength : 0;
  optics.bloom.strength = state.film ? lighting.bloom * state.filmStrength : 0;
  // Trees sway continuously; update their expensive sun shadow at a lower rate.
  if (frameCount % 10 === 0) renderer.shadowMap.needsUpdate = true;
  renderer.info.reset();
  // 抗锯齿属于基础画质，不随摄影开关一起关闭。
  optics.render(dt);
  if (pendingScreenshot) {
    pendingScreenshot = false;
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = `quiet-creek-${state.mode}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  frameCount++; fpsTime += elapsed;
  if (fpsTime > 1) { ui.updateStats(frameCount / fpsTime); frameCount = 0; fpsTime = 0; }
}

init().catch(error => {
  console.error('Creek initialization failed', error);
  ui.showError(`溪谷加载遇到问题：${error.message}。请刷新重试。`);
});
