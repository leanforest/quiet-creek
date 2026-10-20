/** Procedural creek ambience, created locally with Web Audio after a user gesture. */
export class CreekAudio {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.volume = .4;
    this.mode = 'afternoon';
    this.sources = [];
    this.timer = null;
    this.disposed = false;
  }

  create() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio is unavailable.');
    this.context = new AudioContext();
    const ctx = this.context;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 3;
    this.master.connect(compressor).connect(ctx.destination);

    // Long independent channels avoid a static, centered noise bed.
    const buffer = ctx.createBuffer(2, ctx.sampleRate * 8, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        brown = (brown + .025 * white) / 1.025;
        data[i] = brown * 2.5 + white * .055;
      }
      // Crossfade the seam to make the looping water inaudible as a loop.
      const seam = Math.floor(ctx.sampleRate * .12);
      for (let i = 0; i < seam; i++) {
        const t = i / seam;
        data[data.length - seam + i] = data[data.length - seam + i] * (1 - t) + data[i] * t;
      }
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 130;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3000;
    lowpass.Q.value = .35;
    const waterGain = ctx.createGain();
    waterGain.gain.value = .85;
    noise.connect(highpass).connect(lowpass).connect(waterGain).connect(this.master);
    noise.start();
    this.sources.push(noise);

    const lfo = ctx.createOscillator();
    const modulation = ctx.createGain();
    lfo.frequency.value = .16;
    modulation.gain.value = 320;
    lfo.connect(modulation).connect(lowpass.frequency);
    lfo.start();
    this.sources.push(lfo);
    this.waterFilter = lowpass;
  }

  async setEnabled(enabled) {
    if (this.disposed) return;
    this.enabled = !!enabled;
    if (enabled && !this.context) this.create();
    if (!this.context) return;
    if (enabled) await this.context.resume();
    if (this.disposed || !this.context) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, .2);
    clearTimeout(this.timer);
    if (this.enabled) this.scheduleWildlife();
  }

  setVolume(value) {
    const volume = Number(value);
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.context && this.enabled) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .15);
  }

  setMode(mode) {
    this.mode = mode;
    if (this.context) this.waterFilter.frequency.setTargetAtTime(mode === 'night' || mode === 'blue' ? 2400 : 3000, this.context.currentTime, 1.2);
    clearTimeout(this.timer);
    if (this.enabled && this.context) this.scheduleWildlife();
  }

  scheduleWildlife() {
    if (!this.enabled || this.disposed) return;
    this.timer = setTimeout(() => {
      if (!this.enabled || this.disposed || !this.context) return;
      if (this.mode === 'night' || this.mode === 'blue') this.crickets();
      else this.bird();
      this.scheduleWildlife();
    }, this.mode === 'night' || this.mode === 'blue' ? 2100 + Math.random() * 2600 : 4200 + Math.random() * 6500);
  }

  voice(frequency, time, duration, level, pan, endFrequency = frequency, type = 'sine') {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const position = ctx.createStereoPanner();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration * .8);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + Math.min(.025, duration / 4));
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    position.pan.value = pan;
    oscillator.connect(gain).connect(position).connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); position.disconnect(); };
  }

  bird() {
    const time = this.context.currentTime + .04;
    const base = 2050 + Math.random() * 1000;
    const pan = Math.random() * 1.6 - .8;
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) this.voice(base * (i % 2 ? 1.18 : 1), time + i * .18, .12 + Math.random() * .06, .011 + Math.random() * .006, pan, base * (i % 2 ? .86 : 1.27));
  }

  crickets() {
    const time = this.context.currentTime + .04;
    const base = 4700 + Math.random() * 750;
    const pan = Math.random() * 1.8 - .9;
    for (let i = 0; i < 7; i++) this.voice(base, time + i * .092, .052, .0035, pan, base * .98);
  }

  dispose() {
    this.disposed = true;
    this.enabled = false;
    clearTimeout(this.timer);
    for (const source of this.sources) { try { source.stop(); source.disconnect(); } catch { /* Already stopped. */ } }
    this.sources = [];
    this.context?.close();
    this.context = null;
  }
}
