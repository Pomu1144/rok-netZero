#!/usr/bin/env node
/**
 * Every screen of the game, one capture each, for review: the title, the city
 * and its building panels, the realm, the kingdom map, battle, and every menu.
 * Uses the same late-game kingdom as the store shots.
 *
 *   npm run build && node tools/all-pages.mjs        # -> store/pages/NN-name.jpg
 */
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preview } from 'vite';
import { enterKingdom, fightBarbarians, seedAndSettle } from './store-scenes.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const OUT = new URL('../store/pages/', import.meta.url).pathname;
const W = 956;
const H = 440;

const server = await preview({ preview: { port: 4325, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let n = 0;
const shots = [];
async function shot(id, title) {
  n++;
  const file = `${String(n).padStart(2, '0')}-${id}.jpg`;
  await page.screenshot({ path: OUT + file, type: 'jpeg', quality: 82 });
  shots.push({ file, title });
  process.stdout.write(`${file} `);
}
const closeAll = () => page.evaluate(() => window.__closeAll());
const nav = async (id, title, wait = 1100) => {
  await closeAll();
  await page.waitForTimeout(250);
  await page.evaluate((i) => document.querySelector(`[data-nav=${i}]`).click(), id);
  await page.waitForTimeout(wait);
  await shot(id, title);
};
/** select a city plot, then press one of its ring buttons */
const ring = async (plot, act, id, title) => {
  await closeAll();
  await page.evaluate(() => window.__ctx.goCity());
  await page.waitForTimeout(300);
  await page.evaluate((p) => window.__city.onSelectPlot(p), plot);
  await page.waitForTimeout(500);
  await page.evaluate((a) => document.querySelector(`.ring-btn[data-act=${a}]`).click(), act);
  await page.waitForTimeout(1100);
  await shot(id, title);
};
// hide toasts so they never cover a screen
const quiet = () => page.addStyleTag({ content: '#toasts{display:none!important}' });

try {
  await enterKingdom(page, `http://localhost:4325/`);
  await page.waitForTimeout(2200);
  await shot('title', 'Title screen');

  await page.click('.t-enter', { force: true });
  await page.waitForTimeout(1200);
  await quiet();
  await seedAndSettle(page);
  await page.waitForTimeout(2500);
  await shot('city', 'City');

  await ring('city_hall', 'upgrade', 'building', 'Building upgrade');
  await ring('barracks', 'train', 'train', 'Train troops');
  await ring('hospital', 'heal', 'hospital', 'Hospital');
  await ring('tavern', 'tavern', 'tavern', 'Tavern');

  await closeAll();
  await page.evaluate(() => document.querySelector('[data-part=gov]').click());
  await page.waitForTimeout(1100);
  await shot('profile', 'Governor profile');

  await nav('commanders', 'Generals');
  await closeAll();
  await page.evaluate(() => window.__openCommander('caesar'));
  await page.waitForTimeout(1200);
  await shot('commander', 'General detail');
  await page.click('[data-act=talents]');
  await page.waitForTimeout(1100);
  await shot('talents', 'Talent tree');

  await nav('research', 'Academy research');
  await nav('bag', 'Satchel');
  await nav('campaign', 'Campaign');
  await nav('quests', 'Decrees (quests)');
  await nav('alliance', 'Alliance');
  await page.click('[data-act=join]').catch(() => {});
  await page.waitForTimeout(1300);
  await shot('alliance-hall', 'Alliance hall');
  await nav('calendar', 'Login gifts');
  await nav('daily', 'Daily duties');
  await nav('hunt', 'Barbarian hunt');
  await nav('honours', 'Hall of honours');
  await nav('settings', 'Court (settings)');

  // the realm
  await closeAll();
  await page.evaluate(() => window.__ctx.goWorld());
  await page.waitForTimeout(1800);
  await shot('realm', 'Realm map');
  await page.evaluate(() => {
    const s = window.__game.state;
    const bb = s.world.filter((o) => o.kind === 'barbarian' && o.level <= 6).sort((a, b) => Math.hypot(a.x - 60, a.y - 60) - Math.hypot(b.x - 60, b.y - 60))[0];
    window.__ctx.openMarch(bb.id, 'attack');
  });
  await page.waitForTimeout(1100);
  await shot('march', 'March orders');
  await closeAll();
  await page.click('[data-kingdom]');
  await page.waitForTimeout(2600);
  await shot('kingdom', 'Kingdom map');

  // battle: report, then the replay
  await page.evaluate(() => window.__ctx.goCity());
  await page.waitForTimeout(500);
  await fightBarbarians(page);
  await nav('mail', 'Reports');
  await page.evaluate(() => window.__ctx.openReport(window.__game.state.reports.find((r) => r.kind === 'battle').id));
  await page.waitForTimeout(1000);
  await shot('report', 'Battle report');
  await page.evaluate(() => [...document.querySelectorAll('[data-act=watch]')].at(-1).click());
  await page.waitForTimeout(4000);
  await shot('battle', 'Battle replay');
  await page.waitForFunction(() => document.querySelector('.bs-end.show'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await shot('victory', 'Battle result');
  console.log(`\n${shots.length} screens${errors.length ? `, page errors: ${errors.join(' | ')}` : ''}`);
  console.log(JSON.stringify(shots));
} finally {
  await browser.close();
  await server.close();
}
