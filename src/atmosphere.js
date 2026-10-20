import * as THREE from 'three';

export const LIGHT_MODES = {
  // 午后以暖阳照亮草尖，天空只填回树荫的冷色，保留清透的远景。
  afternoon: {
    top: '#3982ba', horizon: '#bfd4df', cloud: '#f4f3e9', sun: '#fff0cf',
    fog: '#b2c8ca', ground: '#424d32', ambient: '#b2d0e5',
    elevation: .56, azimuth: -.22, direct: 4.5, hemi: .82, fill: .26,
    exposure: 1.0, night: 0, bloom: .16, windows: .025, sky: 1.0,
    fogDensity: .0052, cloudCover: .59, aureole: .16, sunDisk: 10,
  },
  // 夕阳的亮点集中在林隙与草尖，桃金地平线外仍有蓝灰天光。
  golden: {
    top: '#7d8fa9', horizon: '#efb98f', cloud: '#eac2a0', sun: '#ffbc70',
    fog: '#b6a38e', ground: '#30384b', ambient: '#97add2',
    elevation: .19, azimuth: -.42, direct: 5.8, hemi: .50, fill: .14,
    exposure: 1.0, night: 0, bloom: .25, windows: .8, sky: .83,
    fogDensity: .0062, cloudCover: .63, aureole: .50, sunDisk: 18,
  },
  // 日落后，薰衣草色天空与暗青岸坡托出木屋的琥珀窗光。
  blue: {
    top: '#354d8d', horizon: '#acabd3', cloud: '#999fc8', sun: '#929fe1',
    fog: '#667ba3', ground: '#192e40', ambient: '#8b9fcf',
    elevation: .28, azimuth: -.18, direct: .55, hemi: .57, fill: .09,
    exposure: 1.02, night: .72, bloom: .25, windows: 3.0, sky: .86,
    fogDensity: .0072, cloudCover: .61, aureole: .025, sunDisk: 0,
  },
  // 月夜保留银蓝轮廓和深群青空隙，窗光不随环境光一起压暗。
  night: {
    top: '#09142d', horizon: '#344975', cloud: '#657ca9', sun: '#9fbaff',
    fog: '#283d69', ground: '#15223b', ambient: '#6986b6',
    elevation: .47, azimuth: -.08, direct: 1.15, hemi: .46, fill: .075,
    exposure: 1.0, night: 1, bloom: .23, windows: 3.3, sky: .71,
    fogDensity: .0058, cloudCover: .55, aureole: .075, sunDisk: 7,
  },
};

export function createAtmosphere(scene) {
  const uniforms = {
    topColor: { value: new THREE.Color() }, horizonColor: { value: new THREE.Color() },
    cloudColor: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
    sunDirection: { value: new THREE.Vector3() }, uTime: { value: 0 }, night: { value: 0 },
    skyLuminance: { value: 1 }, cloudCover: { value: .57 },
    aureole: { value: .28 }, sunDisk: { value: 10 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: /* glsl */`
      varying vec3 vPosition;
      uniform vec3 topColor, horizonColor, cloudColor, sunColor, sunDirection;
      uniform float uTime, night, skyLuminance, cloudCover, aureole, sunDisk;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
      }
      float fbm(vec2 p) {
        float f=.0,a=.5;
        for(int i=0;i<5;i++){f+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p;a*=.5;}
        return f;
      }
      void main(){
        vec3 dir=normalize(vPosition);
        float h=max(dir.y,0.0);
        vec3 col=mix(horizonColor,topColor,pow(h,.42));
        // 宽而薄的云带留出天空，不把整个天穹铺成均匀灰幕。
        vec2 cloudUV=dir.xz/(h+.22)*vec2(1.35,2.1)+vec2(uTime*.0015,0.);
        float cloudNoise=fbm(cloudUV);
        float cloud=smoothstep(cloudCover,cloudCover+.17,cloudNoise)*smoothstep(.015,.14,h);
        // Bright edges and a cool underside give clouds volume without a gray veil.
        vec3 cloudShade=mix(cloudColor*vec3(.72,.79,.87),cloudColor, smoothstep(.54,.76,cloudNoise));
        col=mix(col,cloudShade,cloud*.93)*skyLuminance;
        float sd=max(dot(dir,sunDirection),0.);
        float sunVisibility=1.-cloud*.7;
        // A broad forward-scattering lobe builds the luminous opening around
        // the sunset. Its HDR core blooms through the actual foliage silhouette.
        col+=sunColor*pow(sd,18.0)*aureole;
        col+=sunColor*pow(sd,110.0)*aureole*2.0*sunVisibility;
        col+=mix(sunColor,vec3(1.0),.32)*pow(sd,1600.0)*sunDisk*.17*sunVisibility;
        col+=mix(sunColor,vec3(1.0),.60)*smoothstep(.99980,.99995,sd)*sunDisk*sunVisibility;
        vec2 st=vec2(atan(dir.x,dir.z),asin(dir.y))*vec2(340.,240.);
        vec2 cell=floor(st); float star=step(.996,hash(cell));
        float spot=1.-smoothstep(.0,.20,length(fract(st)-.5));
        col+=vec3(star*spot*night*1.3)*smoothstep(.05,.4,h)*(1.-cloud);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 24), material);
  sky.name = 'Clouds, sun, moon and stars'; sky.renderOrder = -10;
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#fff0ce', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 36, bottom: -36, near: 1, far: 145 });
  sun.shadow.bias = -.00013; sun.shadow.normalBias = .035;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#c6dbea', '#77714f', 1.65);
  scene.add(hemi);
  // Broad sky bounce reveals the shaded bark and timber without a second shadow pass.
  const fill = new THREE.DirectionalLight('#c1d7ed', .55);
  fill.name = 'Soft sky bounce';
  fill.position.set(12, 18, 30); fill.target.position.set(0, 2, -14);
  scene.add(fill, fill.target);
  // A soft pool of transmitted sunset light separates the right meadow from
  // the dark near bank. It follows the key's direction and fades out at dusk.
  const meadow = new THREE.SpotLight('#ffca82', 0, 65, .32, 1, 2);
  meadow.name = 'Sunset light through the canopy';
  meadow.position.set(-9, 9, -23);
  meadow.target.position.set(6, 1.4, 9);
  scene.add(meadow, meadow.target);
  scene.fog = new THREE.FogExp2(LIGHT_MODES.afternoon.fog, LIGHT_MODES.afternoon.fogDensity);
  const current = {};
  const colorKeys = ['top','horizon','cloud','sun','fog','ground','ambient'];
  const numberKeys = ['elevation','azimuth','direct','hemi','fill','exposure','night','bloom','windows','sky','fogDensity','cloudCover','aureole','sunDisk'];
  const modeColors = Object.fromEntries(Object.entries(LIGHT_MODES).map(([mode, values]) => [mode,
    Object.fromEntries(colorKeys.map(key => [key, new THREE.Color(values[key])])),
  ]));
  for (const key of colorKeys) current[key] = new THREE.Color(LIGHT_MODES.afternoon[key]);
  for (const key of numberKeys) current[key] = LIGHT_MODES.afternoon[key];
  let targetMode = 'afternoon';
  const direction = new THREE.Vector3();
  return {
    current, sun, hemi, direction,
    setMode(mode) { targetMode = mode; },
    update(dt, time, camera) {
      const target = LIGHT_MODES[targetMode];
      const t = 1 - Math.exp(-dt * 2.1);
      for (const key of colorKeys) current[key].lerp(modeColors[targetMode][key], t);
      for (const key of numberKeys) current[key] = THREE.MathUtils.lerp(current[key], target[key], t);
      direction.set(Math.sin(current.azimuth) * Math.cos(current.elevation), Math.sin(current.elevation), -Math.cos(current.azimuth) * Math.cos(current.elevation));
      sun.position.copy(direction).multiplyScalar(70); sun.position.z -= 8;
      sun.target.position.set(0, 0, -8);
      sun.color.copy(current.sun); sun.intensity = current.direct;
      hemi.color.copy(current.ambient); hemi.groundColor.copy(current.ground); hemi.intensity = current.hemi;
      fill.color.copy(current.ambient); fill.intensity = current.fill;
      meadow.intensity = THREE.MathUtils.lerp(meadow.intensity, targetMode === 'golden' ? 2300 : 0, t);
      scene.fog.color.copy(current.fog);
      scene.fog.density = current.fogDensity;
      uniforms.topColor.value.copy(current.top); uniforms.horizonColor.value.copy(current.horizon);
      uniforms.cloudColor.value.copy(current.cloud); uniforms.sunColor.value.copy(current.sun);
      uniforms.sunDirection.value.copy(direction); uniforms.night.value = current.night;
      uniforms.skyLuminance.value = current.sky; uniforms.cloudCover.value = current.cloudCover;
      uniforms.aureole.value = current.aureole; uniforms.sunDisk.value = current.sunDisk;
      uniforms.uTime.value = time;
      sky.position.copy(camera.position);
    },
  };
}
