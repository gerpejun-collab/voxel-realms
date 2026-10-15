// public/src/audio.js
// Procedural Web Audio API sound synthesis for Voxel Realms
// Zero external asset downloads - 100% reliable, zero network latency

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
    this.lastStepTime = 0;

    // Initialize audio context lazily on first user gesture
    this.initContext = this.initContext.bind(this);
    window.addEventListener('click', this.initContext, { once: true });
    window.addEventListener('touchstart', this.initContext, { once: true });
    window.addEventListener('keydown', this.initContext, { once: true });
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.28, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  ensureContext() {
    if (!this.ctx) {
      this.initContext();
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Generates a buffer of white noise
   */
  createNoiseBuffer(duration = 0.2) {
    if (!this.ctx) return null;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Block break sound: crunchy filtered noise burst + punchy sub-thud
   */
  playBreak(blockType = 1) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // Noise component
    const noiseBuffer = this.createNoiseBuffer(0.18);
    if (!noiseBuffer) return;

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';

    // Tailor frequencies by block characteristics
    let centerFreq = 800;
    let duration = 0.16;

    if (blockType === 1 || blockType === 2 || blockType === 12) {
      // Grass / Dirt / Leaves
      centerFreq = 500;
      duration = 0.14;
    } else if (blockType === 3 || blockType === 4 || blockType === 13) {
      // Stone / Cobblestone / Brick
      centerFreq = 1200;
      duration = 0.20;
    } else if (blockType === 5 || blockType === 11) {
      // Wood / Planks
      centerFreq = 700;
      duration = 0.16;
    } else if (blockType === 6 || blockType === 7) {
      // Sand / Gravel
      centerFreq = 420;
      duration = 0.18;
    } else if (blockType === 14) {
      // Glass
      centerFreq = 2400;
      duration = 0.22;
    }

    filter.frequency.setValueAtTime(centerFreq, t);
    filter.Q.setValueAtTime(3.0, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noiseSrc.start(t);
    noiseSrc.stop(t + duration);

    // Punchy sub-bass thump
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + duration);

    oscGain.gain.setValueAtTime(0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  /**
   * Block place sound: snappy tactile pop / click
   */
  playPlace(blockType = 1) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const duration = 0.09;

    // Resonant pop oscillator
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    let startFreq = 280;
    if (blockType === 3 || blockType === 4) startFreq = 340; // Stone
    if (blockType === 5 || blockType === 11) startFreq = 220; // Wood

    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + duration);

    gain.gain.setValueAtTime(0.65, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);

    // Subtle click click transient
    const noiseBuffer = this.createNoiseBuffer(0.03);
    if (noiseBuffer) {
      const clickSrc = this.ctx.createBufferSource();
      clickSrc.buffer = noiseBuffer;
      const clickFilter = this.ctx.createBiquadFilter();
      clickFilter.type = 'highpass';
      clickFilter.frequency.setValueAtTime(1200, t);

      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.3, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

      clickSrc.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(this.masterGain);

      clickSrc.start(t);
      clickSrc.stop(t + 0.03);
    }
  }

  /**
   * Footstep rhythm sound when walking
   */
  playFootstep() {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastStepTime < 330) return; // limit step rate
    this.lastStepTime = now;

    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const duration = 0.06;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const pitch = 70 + Math.random() * 20;
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + duration);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  /**
   * Jump whoosh sound
   */
  playJump() {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const duration = 0.12;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + duration);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  /**
   * Fall / Landing impact sound
   */
  playLand() {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const duration = 0.14;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + duration);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }
}

export const sound = new SoundSystem();
