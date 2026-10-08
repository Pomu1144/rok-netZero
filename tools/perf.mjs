#!/usr/bin/env node
/**
 * Performance probe. Serves the build at iPhone 11 size (414×896 at 2x) and
 * reports time to the title, frame rate in the city, the realm and the kingdom
 * map, and the JS heap.
 *
 *   npm run perf               # unthrottled
 *   RATE=4 npm run perf        # CPU slowed 4x
 *
 * Headless Chromium paints canvases in software, so frame rates here are a
 * pessimistic floor: a phone's GPU draws the same frame far faster. Use it to
 * compare builds, not as the device number.
 */
import { createRequire } from 'node:module';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const RATE = Number(process.env.RATE || 1);

const server = await preview({ preview: { port: 4323, strictPort: true }, logLevel: 'silent' });
const url = 'http://localhost:4323/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// the moment the title's "enter" button appears, timed inside the page
await page.addInitScript(() => {
  new MutationObserver((_, o) => {
    const e = document.querySelector('.t-enter');
    if (e && !e.classList.contains('hidden')) {
      window.__ready = performance.now();
      o.disconnect();
    }
  }).observe(document, { subtree: true, attributes: true, childList: true });
});
const cdp = await page.context().newCDPSession(page);

// a returning governor, so launch skips the tutorial
await page.goto(url);
await page.waitForSelector('.t-enter:not(.hidden)');
await page.click('.t-enter', { force: true });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  window.__closeAll();
  Object.assign(window.__game.state, { tutorialDone: true, ftueStep: 6 });
  window.__game.save();
});

await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
await cdp.send('Network.enable');
const cold = [];
for (let i = 0; i < 3; i++) {
  await cdp.send('Network.clearBrowserCache');
  await page.reload();
  await page.waitForSelector('.t-enter:not(.hidden)', { timeout: 60000 });
  cold.push(Math.round(await page.evaluate(() => window.__ready)));
}

await page.click('.t-enter', { force: true });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__closeAll());
const fps = (ms) =>
  page.evaluate(
    (ms) =>
      new Promise((done) => {
        const gaps = [];
        let last = performance.now();
        const end = last + ms;
        const tick = (t) => {
          gaps.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(tick);
          else {
            gaps.sort((a, b) => a - b);
            const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
            done({ fps: +(1000 / avg).toFixed(1), p95ms: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1) });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

const result = { cpuSlowdown: RATE, titleReadyMs: cold };
result.city = await fps(4000);
await page.evaluate(() => document.querySelector('#hud .toggle')?.click());
await page.waitForTimeout(1500);
result.realm = await fps(4000);
await page.evaluate(() => (window.__world.camera.zoom = 0.06));
await page.waitForTimeout(800);
result.kingdom = await fps(3000);
result.heapMB = await page.evaluate(() => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null));
result.errors = errors;
console.log(JSON.stringify(result, null, 2));

await browser.close();
server.httpServer.close();
