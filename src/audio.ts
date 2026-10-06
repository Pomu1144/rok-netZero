/**
 * Audio: an original soundtrack and sampled effects rendered by tools/compose.mjs
 * (public/audio/*.mp3), played through Web Audio. Effects fall back to a tiny synth
 * until their sample has decoded, so the first click is never silent.
 */
let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = false;
let musicOn = true;

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.85;
      sfxBus.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.5;
      musicBus.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function url(name: string): string {
  return `${import.meta.env.BASE_URL}audio/${name}.mp3`;
}

function load(name: string): Promise<AudioBuffer | null> {
  const hit = loading.get(name);
  if (hit) return hit;
  const p = (async () => {
    const a = ac();
    if (!a) return null;
    try {
      const res = await fetch(url(name));
      const buf = await a.decodeAudioData(await res.arrayBuffer());
      buffers.set(name, buf);
      return buf;
    } catch {
      return null;
    }
  })();
  loading.set(name, p);
  return p;
}

/** Call from the first user gesture: unlocks audio and warms the sample cache. */
export function unlockAudio(): void {
  if (!ac()) return;
  for (const n of SFX_FILES) void load(n);
  void load('music_city');
  void load('music_world');
  for (const n of ['sting_battle', 'sting_victory', 'sting_defeat']) void load(n);
}

export function setMuted(m: boolean): void {
  muted = m;
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(m || !musicOn ? 0 : 0.5, ctx.currentTime, 0.2);
  if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05);
}

export function setMusic(on: boolean): void {
  musicOn = on;
  setMuted(muted);
}

// ---------------------------------------------------------------------------
// music: two looping themes crossfaded by view, with ducking for stings

let current: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let wanted: string | null = null;

export async function playMusic(name: 'music_city' | 'music_world'): Promise<void> {
  wanted = name;
  if (current?.name === name) return;
  const a = ac();
  if (!a || !musicBus) return;
  const buf = buffers.get(name) ?? (await load(name));
  if (!buf || wanted !== name) return;
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = a.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(musicBus);
  src.start();
  gain.gain.setTargetAtTime(1, a.currentTime, 0.8);
  const old = current;
  current = { name, src, gain };
  if (old) {
    old.gain.gain.setTargetAtTime(0, a.currentTime, 0.6);
    old.src.stop(a.currentTime + 3);
  }
}

function duck(seconds: number): void {
  if (!current || !ctx) return;
  const g = current.gain.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setTargetAtTime(0.25, ctx.currentTime, 0.08);
  g.setTargetAtTime(1, ctx.currentTime + seconds, 0.6);
}

function play(name: string, gain = 1, rate = 1): boolean {
  if (muted) return true;
  const a = ac();
  const buf = buffers.get(name);
  if (!a || !sfxBus || !buf) {
    void load(name);
    return false;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(g).connect(sfxBus);
  src.start();
  return true;
}

// ---------------------------------------------------------------------------
// tiny synth fallback for the moment before samples decode

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number): void {
  const a = ac();
  if (!a || !sfxBus || muted) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SFX_FILES = ['sfx_click', 'sfx_open', 'sfx_close', 'sfx_coin', 'sfx_build', 'sfx_stamp', 'sfx_levelup', 'sfx_march', 'sfx_horn', 'sfx_chest', 'sfx_error', 'sfx_brush'];

const vary = () => 0.96 + Math.random() * 0.08;

export const sfx = {
  click: () => play('sfx_click', 0.55, vary()) || tone(660, 0.06, 'triangle', 0.08),
  open: () => play('sfx_open', 0.6) || tone(440, 0.08, 'triangle', 0.07),
  close: () => play('sfx_close', 0.5) || tone(520, 0.07, 'triangle', 0.06, 0, 380),
  coin: () => play('sfx_coin', 0.55, vary()) || tone(1320, 0.08, 'square', 0.04),
  build: () => play('sfx_build', 0.8) || tone(220, 0.1, 'square', 0.05),
  stamp: () => play('sfx_stamp', 0.9) || tone(110, 0.2, 'sine', 0.1),
  brush: () => play('sfx_brush', 0.5) || undefined,
  fanfare: () => {
    duck(2.5);
    if (!play('sfx_levelup', 0.8)) [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.05, i * 0.1));
  },
  victory: () => {
    duck(4);
    play('sting_victory', 0.9);
  },
  defeat: () => {
    duck(4);
    play('sting_defeat', 0.9);
  },
  march: () => play('sfx_march', 0.8) || tone(196, 0.4, 'sawtooth', 0.05, 0.05, 220),
  battle: () => {
    duck(4.5);
    if (!play('sting_battle', 0.9)) tone(110, 0.3, 'sawtooth', 0.06, 0.05, 70);
  },
  error: () => play('sfx_error', 0.6) || tone(200, 0.15, 'square', 0.05, 0, 150),
  horn: () => {
    duck(3.5);
    if (!play('sfx_horn', 0.85)) tone(196, 0.6, 'sawtooth', 0.06, 0, 185);
  },
  chest: () => play('sfx_chest', 0.85) || tone(784, 0.25, 'triangle', 0.05),
};
