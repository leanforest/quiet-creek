const icons = {
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  golden: '<path d="M3 17h18M5 20h14M6 14a6 6 0 0 1 12 0M12 3v3M3 8l2 2m14 0 2-2"/>',
  blue: '<path d="M3 18h18M6 21h12M6 15a6 6 0 0 1 12 0M12 4v2M4 9l2 1m12 0 2-1"/><path d="M9 3h.01M18 4h.01"/>',
  moon: '<path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6 8.6 8.6 0 1 0 20.4 14.2Z"/>',
  focus: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  sliders: '<path d="M4 3v5m0 4v9M12 3v10m0 4v4M20 3v2m0 4v12M1 8h6m2 9h6m2-12h6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3V7Z"/><circle cx="12" cy="13" r="4"/>',
  reset: '<path d="M3 10a9 9 0 1 1 1.8 8M3 4v6h6"/>',
  leaf: '<path d="M20 3c0 12-2 17-9 17a7 7 0 0 1-7-7C4 6 13 7 20 3ZM4 21 15 10"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
const modes = [['afternoon', '午后', 'sun'], ['golden', '金色', 'golden'], ['blue', '蓝调', 'blue'], ['night', '月夜', 'moon']];
const views = [['creek', '溪流'], ['bridge', '石桥'], ['porch', '门廊']];
const defaults = { mode: 'afternoon', view: 'creek', film: true, dof: true, aperture: 1.4, focusDistance: 8, filmStrength: 1.5, sound: false, flow: 1, wave: 1, wind: 1, exposure: 1, volume: .4, quality: 'high' };

// 画布始终保持 16:9；竖屏把操作区放进上下留边，不缩小触摸目标。
export function fitViewport() {
  const viewport = window.visualViewport;
  const height = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight;
  document.body.style.setProperty('--viewport-height', `${height}px`);
  const padding = getComputedStyle(document.body);
  const width = Math.max(1, document.documentElement.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight));
  const availableHeight = Math.max(1, height - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom));
  const portrait = availableHeight > width;
  const sceneWidth = Math.min(width, availableHeight * 16 / 9);
  const sceneHeight = sceneWidth * 9 / 16;
  const titleSpace = 104, controlsSpace = 280;
  const appHeight = portrait ? Math.max(availableHeight, sceneHeight + titleSpace + controlsSpace) : sceneHeight;
  const app = document.querySelector('#app');
  app.style.width = `${sceneWidth}px`;
  app.style.height = `${appHeight}px`;
  app.style.setProperty('--scene-width', `${sceneWidth}px`);
  app.style.setProperty('--scene-height', `${sceneHeight}px`);
  app.style.setProperty('--available-height', `${availableHeight}px`);
  app.style.setProperty('--scene-top', `${portrait ? (appHeight - sceneHeight - titleSpace - controlsSpace) / 2 + titleSpace : 0}px`);
  app.classList.toggle('is-portrait', portrait);
  app.classList.toggle('is-mobile-landscape', !portrait && (sceneWidth <= 1100 || matchMedia('(pointer: coarse)').matches));
  document.body.classList.toggle('portrait-layout', portrait);
  for (const size of [1100, 850, 650]) app.classList.toggle(`compact-${size}`, sceneWidth <= size);
}

/** A small overlay: all interaction is delegated through callbacks to the scene. */
export function createUI(callbacks = {}, initialState = {}) {
  const initial = { ...defaults, ...initialState };
  const state = { ...initial };
  const app = document.querySelector('#app') || document.body;
  const root = document.createElement('div');
  root.className = 'creek-ui';
  root.innerHTML = `
    <header class="scene-header">
      <div class="scene-title"><span class="scene-eyebrow">A LITTLE WORLD OF YOUR OWN</span><h1>溪间小筑<span class="title-seal" aria-hidden="true">静</span></h1><p>A quiet place, beside the water.</p></div>
      <div class="scene-actions">${callbacks.onFullscreen ? `<button type="button" class="icon-button glass-pill fullscreen-button" aria-label="切换全屏横屏体验" title="全屏体验">${svg('fullscreen')}</button>` : ''}<button type="button" class="icon-button glass-pill sound-button" aria-pressed="${state.sound}" aria-label="开启环境声音" title="开启环境声音">${svg(state.sound ? 'sound' : 'mute')}</button><button type="button" class="icon-button glass-pill settings-button" aria-expanded="false" aria-controls="creek-settings" aria-label="打开场景设置" title="场景设置">${svg('sliders')}</button></div>
    </header>
    <div class="scene-controls" aria-label="场景控制">
        <div class="light-modes glass-pill" role="group" aria-label="光照时间">${modes.map(([value, label, icon]) => `<button type="button" class="mode-button" data-mode="${value}" aria-pressed="${value === state.mode}" title="${label}光照">${svg(icon)}<span>${label}</span></button>`).join('')}</div>
        <div class="lens-modes glass-pill" role="group" aria-label="摄影效果"><button type="button" class="film-button lens-button" aria-pressed="${state.film}" aria-label="切换摄影效果" title="摄影效果">${svg('camera')}<span>摄影</span><i class="toggle-dot"></i></button><button type="button" class="dof-button lens-button" aria-pressed="${state.dof}" aria-label="切换景深" title="景深">${svg('focus')}<span>景深</span><i class="toggle-dot"></i></button></div>
    </div>
    <aside class="settings-panel" id="creek-settings" aria-label="场景设置" hidden>
      <div class="settings-heading"><div><span class="scene-eyebrow">MAKE YOURSELF AT HOME</span><h2>此刻，刚刚好。</h2></div><button class="close-settings small-icon" type="button" aria-label="关闭设置">${svg('close')}</button></div>
      <div class="settings-section lens-settings"><h3>摄影镜头</h3>${slider('aperture', '光圈', 1.4, 8, .1, state.aperture)}${slider('focusDistance', '对焦距离', 3, 40, .5, state.focusDistance)}${slider('filmStrength', '摄影质感', 0, 1.5, .05, state.filmStrength)}</div>
      <div class="settings-section"><h3>溪水与微风</h3>${slider('flow', '水流速度', .2, 2, .05, state.flow)}${slider('wave', '水面波纹', 0, 2, .05, state.wave)}${slider('wind', '风的轻重', 0, 2, .05, state.wind)}</div>
      <div class="settings-section"><h3>光影与声音</h3>${slider('exposure', '画面亮度', .5, 1.6, .05, state.exposure)}${slider('volume', '环境音量', 0, 1, .01, state.volume)}</div>
      <div class="quality-row"><span>画面品质</span><div class="quality-options" role="group" aria-label="画面品质"><button type="button" data-quality="low" aria-pressed="${state.quality === 'low'}">流畅</button><button type="button" data-quality="high" aria-pressed="${state.quality === 'high'}">精致</button></div></div>
      <div class="settings-footer"><button class="reset-button text-button" type="button">${svg('reset')}恢复初始</button><span class="performance"><i></i><output class="fps-output">—</output> FPS</span></div>
      <p class="settings-note">留一会儿，听水流过。<span>按 H 隐藏界面</span></p>
    </aside>
    <footer class="scene-footer"><div class="navigation-hint"><span class="hint-line"></span><span class="desktop-hint">拖动环顾<span class="hint-dot">·</span>滚轮沿溪漫步<span class="hint-dot">·</span>WASD 移动</span><span class="touch-hint">单指环顾 · 双指缩放漫步</span></div>
      <nav class="view-navigation" aria-label="漫步地点"><div class="view-tabs glass-pill">${views.map(([value, label], index) => `<button type="button" data-view="${value}" aria-pressed="${value === state.view}"><span class="view-number">0${index + 1}</span>${label}</button>`).join('')}</div><div class="route-progress" aria-hidden="true"><span></span></div></nav>
      <div class="footer-right"><span class="scene-coordinate">SOMEWHERE PEACEFUL</span>${callbacks.onScreenshot ? `<button type="button" class="screenshot-button small-icon" aria-label="保存此刻的画面" title="保存此刻">${svg('camera')}</button>` : ''}</div>
    </footer>
    <div class="portrait-hint"><span>指尖轻移，听溪水流过。</span><small>单指环顾 · 双指漫步 · 横置看得更宽</small></div>
    <div class="scene-notice" role="status" aria-live="polite" hidden></div>`;
  app.appendChild(root);

  const loader = document.createElement('div');
  loader.className = 'creek-loading';
  loader.setAttribute('role', 'status');
  loader.innerHTML = `<div class="loading-content"><div class="loading-mark">${svg('leaf')}</div><p class="loading-eyebrow">A MOMENT OF STILLNESS</p><h2>溪间小筑</h2><span class="loading-line"></span><p class="loading-description">循着水声，走进林间。</p></div>`;
  app.appendChild(loader);
  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => root.querySelectorAll(selector);
  const panel = $('.settings-panel');
  const settingsButton = $('.settings-button');
  let noticeTimer;

  function setMode(mode) {
    state.mode = mode;
    $$('.mode-button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    document.documentElement.dataset.sceneMode = mode;
  }
  function setView(view) {
    state.view = view;
    $$('[data-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  }
  function setSound(enabled) {
    state.sound = !!enabled;
    const button = $('.sound-button');
    button.innerHTML = svg(enabled ? 'sound' : 'mute');
    button.setAttribute('aria-pressed', String(!!enabled));
    button.setAttribute('aria-label', enabled ? '关闭环境声音' : '开启环境声音');
    button.title = enabled ? '关闭环境声音' : '开启环境声音';
  }
  function setDof(enabled) {
    state.dof = !!enabled;
    const button = $('.dof-button');
    button.setAttribute('aria-pressed', String(state.dof));
    button.disabled = !state.film;
    button.title = !state.film ? '开启摄影后可调整景深' : state.dof ? '关闭景深' : '开启景深';
    button.setAttribute('aria-label', button.title);
  }
  function setFilm(enabled) {
    state.film = !!enabled;
    const button = $('.film-button');
    button.setAttribute('aria-pressed', String(state.film));
    button.title = state.film ? '关闭摄影效果' : '开启摄影效果';
    button.setAttribute('aria-label', button.title);
    $$('.lens-settings input').forEach((range) => { range.disabled = !state.film; });
    $('.lens-settings').classList.toggle('is-inactive', !state.film);
    setDof(state.dof);
  }
  function setSettingsOpen(open) {
    panel.hidden = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
    settingsButton.setAttribute('aria-label', open ? '关闭场景设置' : '打开场景设置');
  }
  function applySetting(name, value) {
    state[name] = value;
    const range = $(`input[data-setting="${name}"]`);
    if (range) {
      range.value = value;
      range.style.setProperty('--range-progress', `${(value - Number(range.min)) / (Number(range.max) - Number(range.min)) * 100}%`);
      const label = name === 'volume' ? `${Math.round(value * 100)}%`
        : name === 'aperture' ? `f/${Number(value).toFixed(1)}`
        : name === 'focusDistance' ? `${Number(value)} m` : `${Number(value).toFixed(2)}×`;
      $(`output[data-value="${name}"]`).value = label;
      range.setAttribute('aria-valuetext', label);
    }
    if (name === 'quality') $$('[data-quality]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.quality === value)));
  }
  $$('.mode-button').forEach((button) => button.addEventListener('click', () => { setMode(button.dataset.mode); callbacks.onMode?.(state.mode); }));
  $$('[data-view]').forEach((button) => button.addEventListener('click', () => { setView(button.dataset.view); callbacks.onView?.(state.view); }));
  $('.film-button').addEventListener('click', () => { setFilm(!state.film); callbacks.onFilm?.(state.film); });
  $('.dof-button').addEventListener('click', () => { setDof(!state.dof); callbacks.onDof?.(state.dof); });
  $('.sound-button').addEventListener('click', async () => {
    const enabled = !state.sound;
    setSound(enabled);
    try { await callbacks.onSound?.(enabled); } catch { setSound(false); showError('环境声音暂时无法播放，请再次点击重试。'); }
  });
  settingsButton.addEventListener('click', () => setSettingsOpen(panel.hidden));
  $('.close-settings').addEventListener('click', () => { setSettingsOpen(false); settingsButton.focus(); });
  document.addEventListener('pointerdown', (event) => { if (!panel.hidden && !panel.contains(event.target) && !settingsButton.contains(event.target)) setSettingsOpen(false); });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) { setSettingsOpen(false); settingsButton.focus(); }
    if (event.target.closest('button, input')) event.stopPropagation();
  });
  $$('input[data-setting]').forEach((range) => {
    range.addEventListener('input', () => { const value = Number(range.value); applySetting(range.dataset.setting, value); callbacks.onSetting?.(range.dataset.setting, value); });
    applySetting(range.dataset.setting, state[range.dataset.setting]);
  });
  $$('[data-quality]').forEach((button) => button.addEventListener('click', () => { applySetting('quality', button.dataset.quality); callbacks.onSetting?.('quality', button.dataset.quality); }));
  $('.reset-button').addEventListener('click', () => {
    $$('input[data-setting]').forEach((range) => applySetting(range.dataset.setting, initial[range.dataset.setting]));
    applySetting('quality', initial.quality);
    setMode(initial.mode); setView(initial.view); setSound(initial.sound);
    setFilm(initial.film); setDof(initial.dof);
    callbacks.onReset?.();
  });
  $('.screenshot-button')?.addEventListener('click', () => callbacks.onScreenshot?.());
  $('.fullscreen-button')?.addEventListener('click', () => callbacks.onFullscreen?.());
  setMode(state.mode);
  setFilm(state.film);

  function setLoaded() {
    loader.classList.add('is-loaded');
    root.classList.add('is-loaded');
    window.setTimeout(() => loader.remove(), 1100);
  }
  function showError(message) {
    setLoaded();
    const notice = $('.scene-notice');
    notice.textContent = message;
    notice.hidden = false;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 9000);
  }
  return {
    updateStats(fps) { $('.fps-output').value = Number.isFinite(fps) ? String(Math.round(fps)) : '—'; },
    setMode, setView, setSound, setFilm, setDof, setLoaded, showError,
    setFocus(value) { applySetting('focusDistance', value); },
    setProgress(t) { $('.route-progress span').style.width = `${Math.max(0, Math.min(1, Number(t) || 0)) * 100}%`; },
  };
}

function slider(name, label, min, max, step, value) {
  return `<label class="setting-slider" for="setting-${name}"><span>${label}</span><output data-value="${name}" for="setting-${name}">${value}</output><input id="setting-${name}" data-setting="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
}
