/** Tiny synthesized sound effects (no audio files needed). */
let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number): void {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, delay = 0, filterFreq = 800): void {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  click: () => tone(660, 0.06, 'triangle', 0.08),
  open: () => {
    tone(440, 0.08, 'triangle', 0.07);
    tone(660, 0.1, 'triangle', 0.06, 0.05);
  },
  close: () => tone(520, 0.07, 'triangle', 0.06, 0, 380),
  coin: () => {
    tone(1320, 0.08, 'square', 0.04);
    tone(1760, 0.14, 'square', 0.035, 0.06);
  },
  build: () => {
    noise(0.08, 0.25, 0, 1800);
    noise(0.08, 0.2, 0.14, 1600);
  },
  fanfare: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.05, i * 0.1));
    tone(1047, 0.5, 'triangle', 0.06, 0.4);
  },
  march: () => {
    for (let i = 0; i < 4; i++) noise(0.1, 0.3, i * 0.16, 300);
    tone(196, 0.4, 'sawtooth', 0.05, 0.05, 220);
  },
  battle: () => {
    noise(0.35, 0.35, 0, 2500);
    tone(110, 0.3, 'sawtooth', 0.06, 0.05, 70);
  },
  error: () => tone(200, 0.15, 'square', 0.05, 0, 150),
  horn: () => {
    tone(196, 0.6, 'sawtooth', 0.06, 0, 185);
    tone(147, 0.8, 'sawtooth', 0.05, 0.5, 140);
  },
  chest: () => {
    noise(0.2, 0.2, 0, 900);
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, 'triangle', 0.05, 0.15 + i * 0.07));
  },
};
