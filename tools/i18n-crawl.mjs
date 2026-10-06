#!/usr/bin/env node
/**
 * Collects every piece of English text a player can see, for translation.
 * Serves the build, seeds a rich kingdom, opens every panel and tab, and records
 * text nodes and labelling attributes with numbers normalised to {n}.
 *
 *   npm run build && node tools/i18n-crawl.mjs   # -> src/i18n/strings.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const collect = () => {
  const out = new Set();
  const norm = (t) => t.replace(/\s+/g, ' ').trim();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const p = n.parentElement;
    if (!p || p.closest('script,style,.crash-log,pre')) continue;
    const t = norm(n.textContent || '');
    if (t) out.add(t);
  }
  document.querySelectorAll('[aria-label],[placeholder],[title]').forEach((e) => {
    for (const a of ['aria-label', 'placeholder', 'title']) {
      const v = e.getAttribute(a);
      if (v) out.add(norm(v));
    }
  });
  return [...out];
};

const server = await preview({ preview: { port: 4322, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const all = new Set();
const grab = async () => (await page.evaluate(collect)).forEach((t) => all.add(t));
const click = async (sel) => {
  await page.evaluate((s) => document.querySelector(s)?.click(), sel);
  await page.waitForTimeout(350);
  await grab();
};
const closeAll = () => page.evaluate(() => window.__closeAll());

await page.goto('http://localhost:4322/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.t-enter:not(.hidden)');
await grab();
await page.click('.t-enter', { force: true });
await page.waitForTimeout(1200);
await grab(); // advisor intro
for (let i = 0; i < 6; i++) await click('[data-act=next]');
await grab(); // tutorial card
await closeAll();
await page.evaluate(() => {
  const s = window.__game.state;
  Object.assign(s, { tutorialDone: true, ftueStep: 6 });
  s.res = { food: 900000, wood: 900000, stone: 300000, gold: 100000 };
  s.gems = 5000;
  s.buildings.city_hall.level = 12;
  for (const id of ['barracks', 'archery_range', 'stable', 'siege_workshop', 'academy', 'hospital', 'storehouse', 'scout_camp', 'wall']) s.buildings[id].level = 8;
  for (const id of ['caesar', 'joan', 'khan', 'cleopatra']) s.commanders[id].unlocked = true;
  s.commanders.suntzu.level = 20;
  s.troops = { infantry_2: 3000, archer_2: 2000, cavalry_2: 1000 };
  s.wounded = { infantry_1: 200 };
  s.items = { speed_5m: 3, speed_15m: 2, speed_60m: 1, tome_500: 3, tome_2000: 1, silver_key: 2, gold_key: 1, food_10k: 2 };
  s.stats.barbsKilled = 30; s.stats.collections = 40; s.stats.troopsTrained = 800;
  window.__game.emitChange();
});
await page.waitForTimeout(500);
await grab(); // HUD

const navs = ['commanders', 'research', 'bag', 'quests', 'mail', 'settings', 'calendar', 'daily', 'honours', 'hunt', 'campaign', 'alliance'];
for (const n of navs) {
  await closeAll();
  await click(`[data-nav=${n}]`);
  // walk every tab / chapter / stage the panel offers
  for (const sel of ['[data-act=tab]', '[data-act=ch]', '[data-act=stage]', '[data-act=cmd]', '[data-act=tier]', '[data-act=pick]']) {
    const count = await page.evaluate((s) => document.querySelectorAll(s).length, sel);
    for (let i = 0; i < Math.min(count, 14); i++) {
      await page.evaluate(([s, k]) => document.querySelectorAll(s)[k]?.click(), [sel, i]);
      await page.waitForTimeout(200);
      await grab();
    }
  }
  if (n === 'alliance') {
    await click('[data-act=join]');
    for (const tab of ['hall', 'help', 'gifts', 'chat', 'shop']) await click(`[data-tab=${tab}]`);
  }
  if (n === 'commanders') {
    for (const id of ['caesar', 'boudica', 'suntzu', 'joan', 'khan', 'cleopatra']) {
      await closeAll();
      await page.evaluate((c) => window.__openCommander(c), id);
      await page.waitForTimeout(300);
      await grab();
      await click('[data-act=talents]');
      for (let i = 0; i < 3; i++) await click(`.tal-tab[data-i="${i}"]`);
    }
  }
}
// every building panel, training and the tavern
await closeAll();
const plots = await page.evaluate(() => Object.keys(window.__game.state.buildings));
for (const p of plots) {
  await closeAll();
  await page.evaluate((id) => window.__ctx.openPlot(id), p);
  await page.waitForTimeout(250);
  await grab();
  await click('.modal [data-act=train]');
  for (let t = 1; t <= 5; t++) await click(`.tier-tab[data-tier="${t}"]`);
}
// realm: popups, march dialog, kingdom map, a battle and its report
await closeAll();
await page.evaluate(() => window.__ctx.goWorld());
await page.waitForTimeout(900);
await grab();
const ids = await page.evaluate(() => {
  const s = window.__game.state;
  const pick = (k) => s.world.filter((o) => o.kind === k).slice(0, 2).map((o) => o.id);
  return [...pick('barbarian'), ...pick('fort'), ...pick('node'), ...pick('city'), ...pick('holy')];
});
for (const id of ids) {
  await page.evaluate((i) => window.__world.onSelect(i, { x: 0, y: 0 }), id);
  await page.waitForTimeout(250);
  await grab();
  await click('#world-popup [data-act=attack]');
  await grab();
  await closeAll();
  await click('#world-popup [data-act=gather]');
  await closeAll();
}
await page.evaluate(() => window.__world.onSelect('home', { x: 60, y: 60 }));
await page.waitForTimeout(250);
await grab();
await click('[data-kingdom]');
await page.evaluate(() => {
  const s = window.__game.state;
  const b = s.world.find((o) => o.kind === 'barbarian' && o.level === 1);
  window.__send(s, { kind: 'attack', targetId: b.id, commanderId: 'caesar', troops: { infantry_2: 1000 } });
  s.speed = 60;
});
await page.waitForFunction(() => window.__game.state.reports.some((r) => r.kind === 'battle'), null, { timeout: 30000 });
await page.evaluate(() => (window.__game.state.speed = 1));
await grab();
await closeAll();
await page.evaluate(() => window.__ctx.openReport(window.__game.state.reports.find((r) => r.kind === 'battle').id));
await page.waitForTimeout(400);
await grab();
await click('[data-act=watch]');
await page.waitForSelector('.bs-end.show', { timeout: 30000 });
await grab();

await browser.close();
await server.close();

const num = /\d[\d,.]*[KMB]?/g;
const strings = [...all]
  .map((t) => t.replace(num, '{n}'))
  .filter((t) => /[A-Za-z]{2}/.test(t) && t.length < 400)
  .filter((t) => !/^[A-Z]{1,4}$/.test(t)); // tags and tiers like LOTS, IV
const out = [...new Set(strings)].sort();
mkdirSync(new URL('../src/i18n/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/i18n/strings.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`${out.length} strings`);
