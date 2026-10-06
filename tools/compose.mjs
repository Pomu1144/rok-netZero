#!/usr/bin/env node
/**
 * Offline composer for the Realm of Kings soundtrack and sound effects.
 *
 * Everything is synthesised from scratch (no samples, no third-party audio), so the
 * soundtrack is original and license-free. Instruments: Karplus-Strong koto, breathy
 * bamboo flute, detuned string pad, taiko, frame drum, gong, brass horn, wood block.
 * Music loops are rendered with their reverb tail folded back onto the start so they
 * loop seamlessly.
 *
 *   node tools/compose.mjs            # writes public/audio/*.mp3 (needs ffmpeg)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SR = 44100;
const OUT = new URL('../public/audio/', import.meta.url).pathname;

// ---------------------------------------------------------------------------
// deterministic randomness

let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;

// ---------------------------------------------------------------------------
// buffers

class Track {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  /** mix a mono voice at time t (s) with gain and pan (-1..1) */
  add(voice, t, gain = 1, pan = 0) {
    const start = Math.floor(t * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < voice.length; i++) {
      const j = start + i;
      if (j < 0 || j >= this.n) continue;
      this.L[j] += voice[i] * gl;
      this.R[j] += voice[i] * gr;
    }
  }
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------------------
// instruments (each returns a mono Float32Array)

function env(i, n, a, r) {
  const t = i / SR;
  const dur = n / SR;
  if (t < a) return t / a;
  if (t > dur - r) return Math.max(0, (dur - t) / r);
  return 1;
}

/** plucked string (koto / harp) via Karplus-Strong with a body filter */
function koto(freq, dur = 2.4, bright = 0.5) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  const period = Math.max(2, Math.round(SR / freq));
  const buf = new Float32Array(period);
  for (let i = 0; i < period; i++) buf[i] = noise() * (0.6 + bright * 0.4);
  let idx = 0;
  let lp = 0;
  const damp = 0.996 - (1 - bright) * 0.004;
  for (let i = 0; i < n; i++) {
    const a = buf[idx];
    const b = buf[(idx + 1) % period];
    const v = 0.5 * (a + b) * damp;
    buf[idx] = v;
    idx = (idx + 1) % period;
    lp += (v - lp) * (0.35 + bright * 0.4);
    out[i] = lp * env(i, n, 0.002, 0.25);
  }
  return out;
}

/** breathy bamboo flute: sine + soft 2nd/3rd partials + band-limited breath, with vibrato */
function flute(freq, dur, gain = 1) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  let ph = 0;
  let bp1 = 0;
  let bp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.5);
    ph += (2 * Math.PI * freq * vib) / SR;
    const tone = Math.sin(ph) + 0.18 * Math.sin(2 * ph) + 0.06 * Math.sin(3 * ph);
    // breath: noise through a resonant band around the note
    const nz = noise();
    bp1 += (nz - bp1) * 0.25;
    bp2 += (bp1 - bp2) * 0.25;
    const breath = (bp1 - bp2) * 0.9;
    const a = Math.min(1, t / 0.12);
    const r = Math.min(1, (dur - t) / 0.35);
    const swell = 0.75 + 0.25 * Math.sin(Math.min(1, t / dur) * Math.PI);
    out[i] = (tone * 0.55 + breath * (0.25 + 0.4 * (1 - a))) * a * Math.max(0, r) * swell * gain;
  }
  return out;
}

/** warm string pad: detuned saws through a two-pole low-pass, slow attack */
function pad(freqs, dur, cutoff = 900) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  const voices = [];
  for (const f of freqs) for (const d of [-0.18, 0, 0.21]) voices.push({ f: f * Math.pow(2, d / 12), ph: rnd() });
  let l1 = 0;
  let l2 = 0;
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const o of voices) {
      o.ph += o.f / SR;
      if (o.ph >= 1) o.ph -= 1;
      v += o.ph * 2 - 1;
    }
    v /= voices.length;
    l1 += (v - l1) * k;
    l2 += (l1 - l2) * k;
    out[i] = l2 * env(i, n, 1.4, 1.8);
  }
  return out;
}

/** taiko / war drum: pitch-dropping sine body + skin slap */
function taiko(size = 1, dur = 1.4) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  let ph = 0;
  let lp = 0;
  const f0 = 150 / size;
  const f1 = 48 / size;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t * 18);
    ph += (2 * Math.PI * f) / SR;
    const body = Math.sin(ph) * Math.exp(-t * (3.2 / size));
    lp += (noise() - lp) * 0.08;
    const slap = lp * Math.exp(-t * 60) * 2.2;
    out[i] = Math.tanh((body + slap) * 1.4);
  }
  return out;
}

/** small frame drum / tambour for lighter pulses */
function frame(dur = 0.4) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  let ph = 0;
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (220 - 90 * Math.min(1, t * 20))) / SR;
    const nz = noise();
    hp = 0.85 * (hp + nz - prev);
    prev = nz;
    out[i] = (Math.sin(ph) * 0.6 * Math.exp(-t * 22) + hp * 0.35 * Math.exp(-t * 35));
  }
  return out;
}

/** gong: inharmonic partials with slow beating and a long decay */
function gong(dur = 6, base = 90) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  const partials = [1, 1.52, 2.03, 2.74, 3.31, 4.18, 5.4].map((r, j) => ({ f: base * r, a: 1 / (j + 1.2), d: 0.5 + j * 0.25, ph: 0 }));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const p of partials) {
      p.ph += (2 * Math.PI * p.f * (1 + 0.002 * Math.sin(t * 3))) / SR;
      v += Math.sin(p.ph) * p.a * Math.exp(-t * p.d);
    }
    out[i] = v * 0.4 * Math.min(1, t / 0.01);
  }
  return out;
}

/** brass horn: saw through an envelope-swept low-pass */
function horn(freq, dur, gain = 1) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  let ph = 0;
  let l1 = 0;
  let l2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (freq * (1 + 0.004 * Math.sin(2 * Math.PI * 4.5 * t))) / SR;
    if (ph >= 1) ph -= 1;
    const saw = ph * 2 - 1;
    const e = Math.min(1, t / 0.08) * Math.max(0, Math.min(1, (dur - t) / 0.3));
    const cut = 300 + 1600 * e;
    const k = 1 - Math.exp((-2 * Math.PI * cut) / SR);
    l1 += (saw - l1) * k;
    l2 += (l1 - l2) * k;
    out[i] = l2 * e * gain;
  }
  return out;
}

/** wooden block click */
function woodblock(freq = 900, dur = 0.12) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * freq) / SR;
    out[i] = (Math.sin(ph) + 0.4 * Math.sin(ph * 2.7)) * Math.exp(-t * 55) + noise() * Math.exp(-t * 400) * 0.3;
  }
  return out;
}

/** small temple bell */
function bell(freq, dur = 2) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  const parts = [1, 2.76, 5.4, 8.93].map((r, j) => ({ f: freq * r, a: [1, 0.5, 0.25, 0.12][j], d: [2.2, 3.5, 6, 9][j], ph: 0 }));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const p of parts) {
      p.ph += (2 * Math.PI * p.f) / SR;
      v += Math.sin(p.ph) * p.a * Math.exp(-t * p.d);
    }
    out[i] = v * 0.5 * Math.min(1, t / 0.002);
  }
  return out;
}

/** filtered noise sweep: a brush stroke / whoosh */
function swish(dur = 0.45, up = true) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  let l1 = 0;
  let l2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const cut = up ? 400 + 5000 * t : 5400 - 5000 * t;
    const k = 1 - Math.exp((-2 * Math.PI * cut) / SR);
    l1 += (noise() - l1) * k;
    l2 += (l1 - l2) * k;
    out[i] = (l1 - l2) * Math.sin(Math.PI * t) * 1.6;
  }
  return out;
}

// ---------------------------------------------------------------------------
// effects

function freeverb(track, wet = 0.3, room = 0.84, damp = 0.25) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  const proc = (input, spread) => {
    const out = new Float32Array(input.length);
    const cs = combs.map((c) => ({ buf: new Float32Array(c + spread), i: 0, f: 0 }));
    const as = alls.map((a) => ({ buf: new Float32Array(a + spread), i: 0 }));
    for (let n = 0; n < input.length; n++) {
      const x = input[n] * 0.015;
      let s = 0;
      for (const c of cs) {
        const y = c.buf[c.i];
        c.f = y * (1 - damp) + c.f * damp;
        c.buf[c.i] = x + c.f * room;
        c.i = (c.i + 1) % c.buf.length;
        s += y;
      }
      for (const a of as) {
        const y = a.buf[a.i];
        a.buf[a.i] = s + y * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        s = y - s;
      }
      out[n] = s;
    }
    return out;
  };
  const rl = proc(track.L, 0);
  const rr = proc(track.R, 23);
  for (let i = 0; i < track.n; i++) {
    track.L[i] = track.L[i] * (1 - wet * 0.5) + rl[i] * wet;
    track.R[i] = track.R[i] * (1 - wet * 0.5) + rr[i] * wet;
  }
}

/** fold everything after `loopLen` back onto the start so the loop is seamless */
function foldLoop(track, loopLen) {
  const L = Math.floor(loopLen * SR);
  const t = new Track(loopLen);
  for (let i = 0; i < track.n; i++) {
    t.L[i % L] += track.L[i];
    t.R[i % L] += track.R[i];
  }
  return t;
}

function master(track, target = 0.89) {
  let peak = 0;
  for (let i = 0; i < track.n; i++) peak = Math.max(peak, Math.abs(track.L[i]), Math.abs(track.R[i]));
  const g = peak > 0 ? target / peak : 1;
  for (let i = 0; i < track.n; i++) {
    track.L[i] = Math.tanh(track.L[i] * g * 1.1) / Math.tanh(1.1);
    track.R[i] = Math.tanh(track.R[i] * g * 1.1) / Math.tanh(1.1);
  }
  return track;
}

function writeWav(path, track) {
  const n = track.n;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, track.L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, track.R[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(path, buf);
}

function encode(name, track, kbps = 128) {
  const dir = join(tmpdir(), 'rok-compose');
  mkdirSync(dir, { recursive: true });
  const wav = join(dir, `${name}.wav`);
  writeWav(wav, track);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`, join(OUT, `${name}.mp3`)]);
  rmSync(wav);
  console.log(`  ${name}.mp3  ${(track.n / SR).toFixed(1)}s`);
}

// ---------------------------------------------------------------------------
// music theory helpers: D minor pentatonic (D F G A C) across octaves

const SCALE = [0, 3, 5, 7, 10];
/** scale degree (can be negative / > 4) -> midi note, rooted on D */
const deg = (d, root = 62) => root + Math.floor(d / 5) * 12 + SCALE[((d % 5) + 5) % 5];

// ---------------------------------------------------------------------------
// pieces

/** City: calm, ink-painting morning. Koto ostinato, flute melody, string pad, soft frame drum. */
function cityTheme() {
  const bpm = 72;
  const beat = 60 / bpm;
  const bars = 16;
  const loop = bars * 4 * beat;
  const t = new Track(loop + 6);
  // chord roots per bar (Dm, Bb, C, Dm | Dm, Gm, Bb, A)
  const prog = [
    [50, 57, 62], [46, 53, 58], [48, 55, 60], [50, 57, 62],
    [50, 57, 65], [43, 50, 58], [46, 53, 62], [45, 52, 61],
  ];
  for (let b = 0; b < bars; b++) {
    const chord = prog[b % 8];
    t.add(pad(chord.map(mtof), 4 * beat + 1.6, 700), b * 4 * beat, 0.32, 0);
    // koto broken-chord ostinato in eighths
    const pattern = [0, 2, 1, 2, 0, 2, 1, 3];
    for (let e = 0; e < 8; e++) {
      const notes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[2] + 17];
      const m = notes[pattern[e]];
      const vel = e % 2 === 0 ? 0.32 : 0.2;
      t.add(koto(mtof(m), 2.2, 0.45), b * 4 * beat + e * (beat / 2) + (rnd() - 0.5) * 0.006, vel, e % 2 ? 0.35 : -0.25);
    }
    // soft pulse on beats 1 and 3
    t.add(frame(0.4), b * 4 * beat, 0.22, -0.1);
    if (b % 2 === 1) t.add(frame(0.4), b * 4 * beat + 2.5 * beat, 0.14, 0.1);
    if (b % 4 === 0) t.add(taiko(1.4, 2), b * 4 * beat, 0.35, 0);
  }
  // flute melody: AABA phrases, entering on bar 3
  const A = [[4, 1.5], [5, 0.5], [7, 2], [6, 1], [5, 1], [4, 3], [3, 1], [2, 2], [3, 1], [4, 1], [2, 4]];
  const B = [[7, 1.5], [8, 0.5], [9, 2], [8, 1], [7, 1], [6, 2], [7, 2], [5, 1.5], [4, 0.5], [3, 2], [4, 4]];
  let cur = 2 * 4 * beat;
  for (const phrase of [A, A, B, A]) {
    for (const [d, len] of phrase) {
      const dur = len * beat;
      if (cur + dur > loop + 0.01) break;
      t.add(flute(mtof(deg(d, 62)), dur * 0.98), cur, 0.26, 0.15);
      cur += dur;
    }
    cur += 0; // phrases run back to back
  }
  // temple bell accents
  for (const b of [0, 8]) t.add(bell(mtof(86), 3), b * 4 * beat + 0.02, 0.12, 0.5);
  freeverb(t, 0.34, 0.86, 0.3);
  return master(foldLoop(t, loop), 0.8);
}

/** World: martial and wide. Taiko ostinato, low drone, horn calls, koto runs. */
function worldTheme() {
  const bpm = 88;
  const beat = 60 / bpm;
  const bars = 16;
  const loop = bars * 4 * beat;
  const t = new Track(loop + 6);
  const prog = [[38, 45, 50], [38, 45, 50], [34, 41, 46], [36, 43, 48], [38, 45, 50], [41, 48, 53], [34, 41, 46], [33, 40, 45]];
  for (let b = 0; b < bars; b++) {
    const chord = prog[b % 8];
    t.add(pad(chord.map((m) => mtof(m + 12)), 4 * beat + 1.4, 1100), b * 4 * beat, 0.3, 0);
    t.add(pad([mtof(chord[0])], 4 * beat + 1.4, 400), b * 4 * beat, 0.35, 0);
    // taiko pattern: X . x X | . x X x
    const hits = [[0, 1, 1], [1.5, 0.6, 0.8], [2, 0.9, 1], [3, 0.5, 0.8], [3.5, 0.7, 0.8]];
    for (const [pos, g, size] of hits) t.add(taiko(size, 1.2), b * 4 * beat + pos * beat, 0.38 * g, (pos % 2) - 0.5);
    for (let e = 0; e < 8; e++) t.add(frame(0.25), b * 4 * beat + e * (beat / 2), e % 2 ? 0.07 : 0.11, 0.3);
    // koto runs every other bar
    if (b % 2 === 1) {
      for (let k = 0; k < 6; k++) t.add(koto(mtof(deg(5 + k, 62)), 1.6, 0.6), b * 4 * beat + 2 * beat + k * (beat / 4), 0.22, 0.4);
    }
  }
  // horn calls
  const calls = [[0, [[0, 1.5], [2, 0.5], [4, 2]]], [4, [[4, 1], [3, 1], [2, 2]]], [8, [[0, 1.5], [2, 0.5], [5, 2]]], [12, [[4, 1], [3, 1], [0, 2]]]];
  for (const [bar, notes] of calls) {
    let c = bar * 4 * beat;
    for (const [d, len] of notes) {
      t.add(horn(mtof(deg(d, 50)), len * beat * 0.95), c, 0.32, -0.2);
      t.add(horn(mtof(deg(d, 50) + 7), len * beat * 0.95), c, 0.16, 0.2);
      c += len * beat;
    }
  }
  t.add(gong(6, 70), 0, 0.3, 0);
  freeverb(t, 0.3, 0.88, 0.3);
  return master(foldLoop(t, loop), 0.85);
}

/** Short stings (not looped) */
function battleSting() {
  const t = new Track(4.5);
  [0, 0.18, 0.36, 0.72].forEach((at, i) => t.add(taiko(i === 3 ? 0.8 : 1, 1.8), at, i === 3 ? 1 : 0.7, (i % 2) - 0.5));
  t.add(gong(4, 82), 0.72, 0.55, 0);
  t.add(horn(mtof(50), 1.2), 0.72, 0.35, 0);
  t.add(horn(mtof(57), 1.2), 0.72, 0.25, 0.2);
  freeverb(t, 0.3);
  return master(t, 0.9);
}

function victory() {
  const t = new Track(4);
  const notes = [[62, 0], [65, 0.16], [69, 0.32], [74, 0.48]];
  for (const [m, at] of notes) {
    t.add(horn(mtof(m), 0.5), at, 0.4, -0.1);
    t.add(koto(mtof(m + 12), 2, 0.7), at, 0.3, 0.3);
  }
  t.add(horn(mtof(74), 1.6), 0.64, 0.45, 0);
  t.add(horn(mtof(69), 1.6), 0.64, 0.3, -0.2);
  t.add(horn(mtof(66), 1.6), 0.64, 0.25, 0.2);
  t.add(taiko(1, 1.5), 0.64, 0.7, 0);
  t.add(bell(mtof(86), 3), 0.64, 0.25, 0.4);
  freeverb(t, 0.32);
  return master(t, 0.9);
}

function defeat() {
  const t = new Track(4);
  const notes = [[62, 0], [60, 0.35], [57, 0.7]];
  for (const [m, at] of notes) t.add(horn(mtof(m - 12), 0.9), at, 0.45, 0);
  t.add(pad([mtof(38), mtof(45), mtof(53)], 3, 500), 1, 0.4, 0);
  t.add(taiko(1.4, 2), 1.05, 0.6, 0);
  freeverb(t, 0.35);
  return master(t, 0.85);
}

function sfx(name, voice, gain = 1, wet = 0.12) {
  const t = new Track(voice.length / SR + 0.6);
  t.add(voice, 0, gain, 0);
  freeverb(t, wet);
  return master(t, 0.9);
}

/** overlay several voices for one effect */
function layer(...parts) {
  const len = Math.max(...parts.map(([v, at]) => v.length + Math.floor(at * SR)));
  const out = new Float32Array(len);
  for (const [v, at, g = 1] of parts) {
    const s = Math.floor(at * SR);
    for (let i = 0; i < v.length; i++) out[s + i] += v[i] * g;
  }
  return out;
}

// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
console.log('Composing music…');
encode('music_city', cityTheme(), 128);
encode('music_world', worldTheme(), 128);
encode('sting_battle', battleSting(), 112);
encode('sting_victory', victory(), 112);
encode('sting_defeat', defeat(), 112);
console.log('Rendering sound effects…');
encode('sfx_click', sfx('click', woodblock(1100, 0.1), 0.8, 0.05), 96);
encode('sfx_open', sfx('open', layer([swish(0.32, true), 0, 0.7], [woodblock(700, 0.12), 0.05, 0.4])), 96);
encode('sfx_close', sfx('close', swish(0.25, false), 0.6, 0.05), 96);
encode('sfx_coin', sfx('coin', layer([bell(mtof(93), 0.8), 0, 0.6], [bell(mtof(100), 0.8), 0.07, 0.5]), 1, 0.2), 96);
encode('sfx_build', sfx('build', layer([woodblock(320, 0.18), 0], [woodblock(300, 0.18), 0.16, 0.9], [frame(0.3), 0.32, 0.5])), 96);
encode('sfx_stamp', sfx('stamp', layer([taiko(0.7, 0.6), 0, 0.8], [frame(0.2), 0, 0.6], [swish(0.15, false), 0, 0.3])), 96);
encode('sfx_levelup', sfx('levelup', layer([koto(mtof(74), 1.5, 0.8), 0, 0.5], [koto(mtof(78), 1.5, 0.8), 0.08, 0.5], [koto(mtof(81), 1.5, 0.8), 0.16, 0.5], [bell(mtof(86), 2), 0.24, 0.5], [taiko(1, 1), 0.24, 0.4]), 1, 0.3), 96);
encode('sfx_march', sfx('march', layer([taiko(1.2, 0.8), 0, 0.6], [taiko(1.2, 0.8), 0.28, 0.5], [taiko(1.2, 0.8), 0.56, 0.6], [horn(mtof(50), 0.9), 0.1, 0.25])), 96);
encode('sfx_horn', sfx('horn', layer([horn(mtof(45), 1.6), 0, 0.6], [horn(mtof(52), 1.6), 0.05, 0.4], [horn(mtof(45), 1.2), 1.4, 0.5])), 96);
encode('sfx_chest', sfx('chest', layer([woodblock(500, 0.15), 0, 0.5], [swish(0.3, true), 0.05, 0.5], [bell(mtof(88), 1.4), 0.25, 0.5], [bell(mtof(93), 1.4), 0.33, 0.45], [bell(mtof(100), 1.4), 0.41, 0.4]), 1, 0.25), 96);
encode('sfx_error', sfx('error', layer([woodblock(260, 0.15), 0, 0.7], [woodblock(220, 0.15), 0.1, 0.6]), 1, 0.05), 96);
encode('sfx_brush', sfx('brush', swish(0.5, true), 0.7, 0.1), 96);
console.log('Done.');
