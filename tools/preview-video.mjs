#!/usr/bin/env node
/**
 * Store preview video. Plays the real game through a short tour (title, city,
 * marches across the realm, a battle replay with a skill cut-in, the kingdom
 * map), records the screen, and scores it with the game's own
 * music and sound effects. App Store previews must be captured from the app, so
 * nothing here is staged outside the game; waiting (a march on its way, the
 * welcome popups) is cut.
 *
 *   npm run build && node tools/preview-video.mjs      # -> store/preview/<device>.mp4
 *
 * Needs ffmpeg with libx264 and Playwright's Chromium (PLAYWRIGHT_PATH).
 */
import { execFileSync } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview } from 'vite';
import { caption, enterKingdom, fightBarbarians, seedKingdom } from './store-scenes.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const OUT = new URL('../store/preview/', import.meta.url).pathname;
const AUDIO = new URL('../public/audio/', import.meta.url).pathname;
const FPS = 30;
const MAX_SECONDS = 29.5;

/** App Store app preview sizes (landscape), and a 1080p cut for the Play Store's YouTube trailer. */
const DEVICES = [
  { name: 'iphone', w: 960, h: 443, out: [1920, 886] },
  { name: 'ipad', w: 800, h: 600, out: [1600, 1200] },
  { name: 'play', w: 960, h: 540, out: [1920, 1080] },
];

/**
 * Screen recorder over the DevTools screencast. Frames can arrive well after
 * they were painted, so everything is placed by capture time (seconds since the
 * epoch, the same clock as Date.now): cut() and resume() drop a stretch of time
 * from the timeline, and mark() notes when something happens so the soundtrack
 * can land on it.
 */
async function recorder(page, dev) {
  const cdp = await page.context().newCDPSession(page);
  const raw = [];
  const cuts = [];
  const rawMarks = [];
  let t0 = 0;
  let open = null;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    raw.push({ ts: metadata.timestamp, data });
  });
  const now = () => Date.now() / 1000;
  /** Capture time to video time, or null inside a cut. */
  const place = (ts) => {
    let t = ts - t0;
    for (const [a, b] of cuts) {
      if (ts >= a && ts < b) return null;
      if (ts >= b) t -= b - a;
    }
    return t;
  };
  return {
    async start() {
      t0 = now();
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: dev.out[0], maxHeight: dev.out[1], everyNthFrame: 1 });
    },
    cut() {
      open = now();
    },
    resume() {
      cuts.push([open, now()]);
      open = null;
    },
    mark(sound, gain = 1) {
      rawMarks.push({ ts: now(), sound, gain });
    },
    async stop() {
      const end = now();
      // let frames still in flight catch up with the end of the tour
      for (let i = 0; i < 100 && !(raw.at(-1)?.ts >= end - 0.05); i++) await page.waitForTimeout(100);
      await cdp.send('Page.stopScreencast');
      const frames = [];
      for (const f of raw) {
        const t = f.ts <= end ? place(f.ts) : null;
        if (t !== null && t >= 0) frames.push({ t, data: f.data });
      }
      // the first painted frame may come a moment after start: open on it
      const shift = frames[0]?.t ?? 0;
      for (const f of frames) f.t -= shift;
      const marks = rawMarks.map((m) => ({ at: Math.max(0, place(m.ts) - shift), sound: m.sound, gain: m.gain }));
      return { frames, marks };
    },
  };
}

async function tour(page, rec) {
  await caption(page, ''); // hides toasts, the works list and the decree slip
  await page.waitForTimeout(400);
  await rec.start();
  await page.waitForTimeout(1200); // the animated title painting

  // the gate: a late-game kingdom, entered for real
  await page.evaluate(seedKingdom);
  await page.click('.t-enter', { force: true });
  rec.mark('sfx_stamp.mp3', 0.9);
  await page.waitForTimeout(1000);
  // the welcome-back gifts open on entry; cut them rather than show a popup
  rec.cut();
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.__closeAll());
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const cam = window.__city.camera;
    cam.x = -260;
    cam.y = 860;
    cam.zoom = 0.5;
  });
  await page.waitForTimeout(150);
  rec.resume();
  // a slow drift towards the palace while the zoom eases in
  await page.evaluate(
    () =>
      new Promise((done) => {
        const cam = window.__city.camera;
        const from = { x: cam.x, y: cam.y, z: cam.zoom };
        const to = { x: -40, y: 840, z: 0.78 };
        const t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / 4200);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          cam.x = from.x + (to.x - from.x) * e;
          cam.y = from.y + (to.y - from.y) * e;
          cam.zoom = from.z + (to.z - from.z) * e;
          window.__closeAll();
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
  );

  // to the realm: three marches set out
  await page.evaluate(() => window.__ctx.goWorld());
  rec.mark('sfx_brush.mp3', 0.8);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const s = window.__game.state;
    const near = (kind, max) =>
      s.world.filter((o) => o.kind === kind && (max ? o.level <= max : true)).sort((a, b) => Math.hypot(a.x - 60, a.y - 60) - Math.hypot(b.x - 60, b.y - 60))[0];
    const send = (o) => window.__ctx.run((st) => window.__send(st, o));
    send({ kind: 'attack', targetId: near('barbarian', 6).id, commanderId: 'suntzu', troops: { archer_3: 3000, infantry_3: 2000 } });
    send({ kind: 'gather', targetId: near('node').id, commanderId: 'cleopatra', troops: { infantry_3: 2000 } });
    send({ kind: 'attack', targetId: near('fort').id, commanderId: 'boudica', troops: { cavalry_3: 2400, infantry_3: 2000 } });
    window.__world.camera.zoom = 0.7;
    window.__world.goTo(60, 60);
  });
  rec.mark('sfx_march.mp3', 0.9);
  await page.waitForTimeout(2300);

  // the battle: the march itself is cut, the replay is shown
  rec.cut();
  await fightBarbarians(page);
  await page.evaluate(() => window.__ctx.openReport(window.__game.state.reports.find((r) => r.kind === 'battle').id));
  await page.waitForTimeout(600);
  rec.resume();
  await page.waitForTimeout(700);
  rec.mark('sting_battle.mp3', 0.9);
  await page.click('[data-act=watch]');
  await page.waitForFunction(() => document.querySelector('.bs-end.show'), null, { timeout: 30000 }).catch(() => {});
  rec.mark('sting_victory.mp3', 1);
  await page.waitForTimeout(1300);
  await page.click('[data-role=done]').catch(() => {});
  await page.evaluate(() => window.__closeAll());

  // the kingdom from above
  await page.waitForTimeout(300);
  await page.click('[data-kingdom]');
  rec.mark('sfx_brush.mp3', 0.7);
  await page.waitForTimeout(3000);
}

function encode(dev, frames, marks, dir) {
  // resample to a constant 30 fps: each output frame shows the latest capture
  const kept = frames.filter((f) => f.t >= 0 && f.t <= MAX_SECONDS);
  const length = Math.min(MAX_SECONDS, kept.at(-1).t + 1.2);
  const files = kept.map((f, i) => {
    const file = join(dir, `c${String(i).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    return file;
  });
  let j = 0;
  const count = Math.round(length * FPS);
  for (let k = 0; k < count; k++) {
    while (j + 1 < kept.length && kept[j + 1].t <= k / FPS) j++;
    linkSync(files[j], join(dir, `o${String(k).padStart(5, '0')}.jpg`));
  }

  // the soundtrack: city music under the whole tour, effects on their moments
  const inputs = ['-i', join(AUDIO, 'music_city.mp3')];
  const chains = [`[1:a]volume=0.55,afade=t=in:d=0.6,afade=t=out:st=${(length - 1.8).toFixed(2)}:d=1.8[m]`];
  const mix = ['[m]'];
  marks.forEach((m, i) => {
    inputs.push('-i', join(AUDIO, m.sound));
    const ms = Math.round(m.at * 1000);
    chains.push(`[${i + 2}:a]volume=${m.gain},adelay=${ms}|${ms}[s${i}]`);
    mix.push(`[s${i}]`);
  });
  chains.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0,atrim=0:${length.toFixed(2)},alimiter=limit=0.89[a]`);
  const [W, H] = dev.out;
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', join(dir, 'o%05d.jpg'),
    ...inputs,
    '-filter_complex', `[0:v]scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p[v];${chains.join(';')}`,
    '-map', '[v]', '-map', '[a]',
    '-t', length.toFixed(2),
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-preset', 'slow', '-b:v', '6M', '-maxrate', '8M', '-bufsize', '16M',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart',
    join(OUT, `${dev.name}.mp4`),
  ]);
  return length;
}

const server = await preview({ preview: { port: 4324, strictPort: true }, logLevel: 'silent' });
const base = 'http://localhost:4324/';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
mkdirSync(OUT, { recursive: true });
const only = process.env.DEVICE;
try {
  for (const dev of DEVICES) {
    if (only && dev.name !== only) continue;
    process.stdout.write(`${dev.name} (${dev.out.join('x')})… `);
    const page = await browser.newPage({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.out[0] / dev.w, hasTouch: true });
    await enterKingdom(page, base);
    const rec = await recorder(page, dev);
    await tour(page, rec);
    const { frames, marks } = await rec.stop();
    await page.close();
    const dir = mkdtempSync(join(tmpdir(), 'rok-preview-'));
    try {
      const secs = encode(dev, frames, marks, dir);
      console.log(`${frames.length} frames, ${secs.toFixed(1)} s`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
  await server.close();
}
