#!/usr/bin/env node
/**
 * Store screenshot generator.
 *
 * Builds the game, serves it, seeds a rich late-game kingdom and captures ten
 * captioned showcase shots at the exact pixel sizes the App Store and Google Play
 * require. Every shot is the real game; only the caption band is added.
 *
 *   npm run build && node tools/screenshots.mjs        # -> store/screenshots/<device>/NN-name.jpg
 *
 * Uses Playwright's Chromium (set PLAYWRIGHT_PATH if it is not in node_modules).
 */
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preview } from 'vite';
import { caption, enterKingdom, fightBarbarians, releaseCutIn, seedAndSettle, waitForCutIn, watchBattle } from './store-scenes.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const OUT = new URL('../store/screenshots/', import.meta.url).pathname;

/** name, CSS viewport, device scale → final pixels */
const DEVICES = [
  { name: 'iphone-6.9', w: 956, h: 440, scale: 3 }, // 2868 x 1320
  { name: 'iphone-6.5', w: 896, h: 414, scale: 3 }, // 2688 x 1242
  { name: 'ipad-13', w: 1376, h: 1032, scale: 2 }, // 2752 x 2064
  { name: 'android-phone', w: 1200, h: 540, scale: 2 }, // 2400 x 1080
];

const SCENES = [
  { id: '01-title', caption: '' },
  { id: '02-city', caption: 'Raise a kingdom from timber to gold' },
  { id: '03-battle', caption: 'Command battles painted in ink' },
  { id: '04-generals', caption: 'Lead legendary generals' },
  { id: '05-talents', caption: "Shape every general's talents" },
  { id: '06-war', caption: 'March to war across the realm' },
  { id: '07-kingdom', caption: 'Rule a realm of rivals and shrines' },
  { id: '08-campaign', caption: 'Conquer a story campaign' },
  { id: '09-alliance', caption: 'Rise together with your alliance' },
  { id: '10-hunt', caption: 'Hunt barbarians, top the leaderboard' },
];

const jpg = (page, dir, id) => page.screenshot({ path: `${dir}${id}.jpg`, type: 'jpeg', quality: 90 });

async function shoot(browser, base, dev) {
  const dir = `${OUT}${dev.name}/`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.scale, hasTouch: true });
  const cap = (i) => caption(page, SCENES[i].caption);

  await enterKingdom(page, base);
  await page.waitForTimeout(2200);
  await jpg(page, dir, SCENES[0].id);

  await page.click('.t-enter', { force: true });
  await page.waitForTimeout(1200);
  await seedAndSettle(page);
  await page.evaluate(() => {
    // frame the palace and the inner city
    const cam = window.__city.camera;
    cam.x = -150;
    cam.y = 880;
    cam.zoom = 0.62;
  });
  await page.waitForTimeout(2500); // upgraded tiers stream in after the title
  await cap(1);
  await jpg(page, dir, SCENES[1].id);

  // a real battle, replayed at the moment a commander's skill cuts in
  await caption(page, '');
  await fightBarbarians(page);
  await watchBattle(page);
  await cap(2);
  await waitForCutIn(page);
  await page.waitForTimeout(150);
  await jpg(page, dir, SCENES[2].id);
  await releaseCutIn(page);
  await caption(page, '');
  await page.waitForFunction(() => document.querySelector('.bs-end.show'), null, { timeout: 30000 }).catch(() => {});
  await page.click('[data-role=done]').catch(() => {});
  await page.evaluate(() => window.__closeAll());
  await page.waitForTimeout(400);

  await page.evaluate(() => window.__openCommander('caesar'));
  await page.waitForTimeout(1300);
  await cap(3);
  await jpg(page, dir, SCENES[3].id);
  await page.click('[data-act=talents]');
  await page.waitForTimeout(1100);
  await cap(4);
  await jpg(page, dir, SCENES[4].id);
  await caption(page, '');
  await page.evaluate(() => window.__closeAll());
  await page.waitForTimeout(300);

  // war: marches in flight across the realm
  await page.evaluate(() => window.__ctx.goWorld());
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const s = window.__game.state;
    const near = (kind, max) =>
      s.world.filter((o) => o.kind === kind && (max ? o.level <= max : true)).sort((a, b) => Math.hypot(a.x - 60, a.y - 60) - Math.hypot(b.x - 60, b.y - 60))[0];
    const send = (o) => window.__ctx.run((st) => window.__send(st, o));
    send({ kind: 'attack', targetId: near('barbarian', 6).id, commanderId: 'suntzu', troops: { archer_3: 3000, infantry_3: 2000 } });
    send({ kind: 'gather', targetId: near('node').id, commanderId: 'cleopatra', troops: { infantry_3: 2000 } });
    send({ kind: 'attack', targetId: near('fort').id, commanderId: 'boudica', troops: { cavalry_3: 2400, infantry_3: 2000 } });
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const m = window.__game.state.marches[0];
    window.__world.goTo((m.fromX + m.toX) / 2, (m.fromY + m.toY) / 2 + 1);
    window.__world.camera.zoom = 0.75;
  });
  await page.waitForTimeout(1500);
  await cap(5);
  await jpg(page, dir, SCENES[5].id);

  await caption(page, '');
  await page.click('[data-kingdom]');
  await page.waitForTimeout(2600);
  await cap(6);
  await jpg(page, dir, SCENES[6].id);
  await caption(page, '');
  await page.evaluate(() => window.__ctx.goCity());
  await page.waitForTimeout(600);

  await page.evaluate(() => document.querySelector('[data-nav=campaign]').click());
  await page.waitForTimeout(1300);
  await cap(7);
  await jpg(page, dir, SCENES[7].id);
  await caption(page, '');
  await page.evaluate(() => window.__closeAll());
  await page.waitForTimeout(300);

  await page.evaluate(() => document.querySelector('[data-nav=alliance]').click());
  await page.waitForTimeout(800);
  await page.click('[data-act=join]').catch(() => {});
  await page.waitForTimeout(1500);
  await cap(8);
  await jpg(page, dir, SCENES[8].id);
  await caption(page, '');
  await page.evaluate(() => window.__closeAll());
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    window.__game.state.stats.huntPoints = 1840;
    window.__game.emitChange();
  });
  await page.evaluate(() => document.querySelector('[data-nav=hunt]').click());
  await page.waitForTimeout(1300);
  await cap(9);
  await jpg(page, dir, SCENES[9].id);
  await page.close();
}

const server = await preview({ preview: { port: 4321, strictPort: true }, logLevel: 'silent' });
const base = 'http://localhost:4321/';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const only = process.env.DEVICE;
try {
  for (const dev of DEVICES) {
    if (only && dev.name !== only) continue;
    process.stdout.write(`${dev.name} (${dev.w * dev.scale}x${dev.h * dev.scale})… `);
    await shoot(browser, base, dev);
    console.log('done');
  }
} finally {
  await browser.close();
  await server.close();
}
