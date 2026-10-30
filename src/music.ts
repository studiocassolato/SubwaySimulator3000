/**
 * Musica di sottofondo generata in tempo reale con Web Audio:
 * nessun file audio, quindi nessun problema di copyright.
 * Due atmosfere: "jazz" (city builder rilassato) e "vlog" (chill hop solare).
 */

export type MusicStyle = 'jazz' | 'vlog';

interface Chord {
  bass: number;
  notes: number[];
}

const PROGRESSIONS: Record<MusicStyle, Chord[]> = {
  jazz: [
    { bass: 43, notes: [58, 62, 65, 69] }, // Gm9
    { bass: 36, notes: [58, 64, 69, 74] }, // C13
    { bass: 41, notes: [57, 64, 67, 72] }, // Fmaj9
    { bass: 38, notes: [54, 60, 63, 66] }, // D7b9
    { bass: 46, notes: [57, 62, 65, 69] }, // Bbmaj7
    { bass: 39, notes: [55, 61, 65, 70] }, // Eb9
    { bass: 45, notes: [55, 60, 64, 67] }, // Am7
    { bass: 38, notes: [54, 60, 64, 66] }, // D7
  ],
  vlog: [
    { bass: 41, notes: [60, 64, 67, 69] }, // Fmaj9
    { bass: 40, notes: [59, 62, 67, 71] }, // Em7
    { bass: 38, notes: [57, 60, 65, 69] }, // Dm7
    { bass: 36, notes: [59, 64, 67, 71] }, // Cmaj7
    { bass: 45, notes: [60, 64, 67, 72] }, // Am7
    { bass: 38, notes: [60, 64, 65, 69] }, // Dm9
    { bass: 43, notes: [60, 65, 67, 70] }, // G7sus
    { bass: 36, notes: [62, 64, 67, 71] }, // Cmaj9
  ],
};

const SCALES: Record<MusicStyle, number[]> = {
  jazz: [65, 67, 69, 72, 74, 77, 79, 81],
  vlog: [64, 67, 69, 72, 74, 76, 79, 81],
};

const BPM: Record<MusicStyle, number> = { jazz: 92, vlog: 94 };

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus!: GainNode;
  private delay!: DelayNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private step = 0;
  private bar = 0;
  private nextTime = 0;
  private melodyIdx = 3;
  private crackle: AudioBufferSourceNode | null = null;
  style: MusicStyle = 'jazz';
  volume = 0.5;
  playing = false;

  private init() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    // filtro "lo-fi" generale
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    this.bus = ctx.createGain();
    this.bus.connect(tone).connect(comp).connect(this.master).connect(ctx.destination);
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / BPM.vlog) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.bus);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  start() {
    this.init();
    const ctx = this.ctx!;
    void ctx.resume();
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.bar = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.startCrackle();
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  stop() {
    this.playing = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.crackle?.stop();
    this.crackle = null;
  }

  toggle() {
    if (this.playing) this.stop();
    else this.start();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v * 0.6, this.ctx.currentTime, 0.05);
  }

  setStyle(s: MusicStyle) {
    this.style = s;
    this.bar = 0;
  }

  private schedule() {
    const ctx = this.ctx!;
    const sixteenth = 60 / BPM[this.style] / 4;
    while (this.nextTime < ctx.currentTime + 0.25) {
      let t = this.nextTime;
      if (this.style === 'jazz' && this.step % 4 === 2) t += sixteenth * 0.66; // swing a terzine
      if (this.style === 'vlog' && this.step % 2 === 1) t += sixteenth * 0.18;
      this.playStep(t, this.step, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private playStep(t: number, step: number, six: number) {
    const prog = PROGRESSIONS[this.style];
    const chord = prog[this.bar % prog.length];
    const nextChord = prog[(this.bar + 1) % prog.length];
    if (this.style === 'jazz') {
      // ride "ding, ding-a ding"
      if ([0, 4, 6, 8, 12, 14].includes(step)) this.hat(t, 0.22, 0.28, 6500);
      if (step === 4 || step === 12) {
        this.hat(t, 0.1, 0.05, 9000);
        this.brush(t);
      }
      if (step === 0 || step === 8) this.kick(t, 0.25);
      // basso walking in semiminime
      if (step % 4 === 0) {
        const beat = step / 4;
        const notes = [chord.bass, chord.bass + 7, chord.notes[1] - 12, nextChord.bass + (Math.random() < 0.5 ? 1 : -1)];
        this.bass(t, notes[beat], six * 3.6, 0.5);
      }
      if (step === 0) this.chord(t, chord.notes, six * 10, 0.16);
      if ((step === 6 || step === 10) && Math.random() < 0.35) this.chord(t, chord.notes, six * 2, 0.11);
      if (step % 2 === 0 && Math.random() < (this.bar % 4 < 2 ? 0.28 : 0.12)) this.melody(t, six * 3, 'vibes');
    } else {
      if (step === 0 || step === 7 || step === 10) this.kick(t, step === 0 ? 0.9 : 0.6);
      if (step === 4 || step === 12) this.snare(t);
      if (step % 2 === 0) this.hat(t, step % 4 === 0 ? 0.16 : 0.1, 0.035, 8000);
      else if (Math.random() < 0.3) this.hat(t, 0.05, 0.03, 9000);
      if (step === 0) this.bass(t, chord.bass, six * 6, 0.6);
      if (step === 10) this.bass(t, chord.bass + (Math.random() < 0.5 ? 12 : 7), six * 3, 0.45);
      if (step === 0) this.chord(t, chord.notes, six * 15, 0.12);
      if (Math.random() < 0.16) this.melody(t, six * 1.5, 'pluck');
    }
  }

  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number, out: AudioNode) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private chord(t: number, notes: number[], dur: number, vel: number) {
    // piano elettrico: sinusoide + armonica leggera, attacco morbido
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this.style === 'jazz' ? 1800 : 1400;
    lp.connect(this.bus);
    for (const n of notes) {
      const g = this.env(t + Math.random() * 0.02, vel / notes.length * 2, 0.012, dur);
      g.connect(lp);
      this.osc('sine', midi(n), t, dur, g);
      const h = ctx.createGain();
      h.gain.value = 0.18;
      h.connect(g);
      this.osc('triangle', midi(n) * 2.001, t, dur, h);
    }
  }

  private bass(t: number, note: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.connect(this.bus);
    const g = this.env(t, vel, 0.01, dur);
    g.connect(lp);
    this.osc('triangle', midi(note), t, dur, g);
    this.osc('sine', midi(note), t, dur, g);
  }

  private melody(t: number, dur: number, kind: 'vibes' | 'pluck') {
    const scale = SCALES[this.style];
    this.melodyIdx = Math.max(0, Math.min(scale.length - 1, this.melodyIdx + Math.floor(Math.random() * 5) - 2));
    const f = midi(scale[this.melodyIdx]);
    if (kind === 'vibes') {
      const g = this.env(t, 0.07, 0.005, dur * 2);
      const trem = this.ctx!.createGain();
      g.connect(trem).connect(this.bus);
      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = this.ctx!.createGain();
      depth.gain.value = 0.25;
      lfo.connect(depth).connect(trem.gain);
      lfo.start(t);
      lfo.stop(t + dur * 2 + 0.1);
      this.osc('sine', f, t, dur * 2, g);
    } else {
      const g = this.env(t, 0.06, 0.003, dur * 1.4);
      g.connect(this.bus);
      g.connect(this.delay);
      this.osc('triangle', f, t, dur * 1.4, g);
    }
  }

  private noiseHit(t: number, vel: number, dur: number, type: BiquadFilterType, freq: number, q = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.env(t, vel, 0.002, dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private hat(t: number, vel: number, dur: number, freq: number) {
    this.noiseHit(t, vel * 0.5, dur, 'highpass', freq);
  }

  private brush(t: number) {
    this.noiseHit(t, 0.06, 0.16, 'bandpass', 2800, 0.7);
  }

  private snare(t: number) {
    this.noiseHit(t, 0.22, 0.16, 'bandpass', 1900, 0.8);
    const g = this.env(t, 0.12, 0.002, 0.08);
    g.connect(this.bus);
    this.osc('triangle', 190, t, 0.1, g);
  }

  private kick(t: number, vel: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.env(t, vel * 0.8, 0.003, 0.28);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.35);
  }

  private startCrackle() {
    // fruscio da vinile: impulsi radi filtrati, in loop
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.015 + (Math.random() < 0.0004 ? (Math.random() * 2 - 1) * 0.6 : 0);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    src.connect(f).connect(g).connect(this.bus);
    src.start();
    this.crackle = src;
  }
}
