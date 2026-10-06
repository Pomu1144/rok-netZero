#!/usr/bin/env node
/**
 * Store screenshot generator.
 *
 * Builds the game, serves it, seeds a rich mid-game kingdom and captures captioned
 * marketing shots at the exact pixel sizes the App Store and Google Play require.
 *
 *   npm run build && node tools/screenshots.mjs        # -> store/screenshots/<device>/NN-name.jpg
 *
 * Uses Playwright's Chromium (set PLAYWRIGHT_PATH if it is not in node_modules).
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preview } from 'vite';

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
  { id: '02-city', caption: 'Raise a kingdom from the wilds' },
  { id: '03-generals', caption: 'Lead legendary generals' },
  { id: '04-war', caption: 'March to war across the realm' },
  { id: '05-victory', caption: 'Every battle, recorded in ink' },
  { id: '06-academy', caption: 'Master the arts of war and peace' },
];

/** A believable mid-game kingdom for marketing shots. */
function seedKingdom() {
  const g = window.__game;
  const s = g.state;
  s.tutorialDone = true;
  s.governor = 'Aurelian';
  const lv = { city_hall: 9, wall: 8, barracks: 9, archery_range: 8, stable: 7, siege_workshop: 6, academy: 8, hospital: 7, tavern: 6, scout_camp: 5, storehouse: 6, farm_1: 9, farm_2: 8, farm_3: 6, lumber_mill_1: 9, lumber_mill_2: 7, quarry_1: 7, gold_mine_1: 5, quarry_2: 4 };
  for (const id in lv) s.buildings[id].level = lv[id];
  for (const id in s.buildings) s.buildings[id].collectedAt = s.time - 3 * 3600_000;
  s.res = { food: 1_284_000, wood: 963_000, stone: 412_000, gold: 186_000 };
  s.gems = 2480;
  s.troops = { infantry_1: 4200, infantry_2: 3100, archer_1: 2600, archer_2: 1800, cavalry_1: 2200, cavalry_2: 900, siege_1: 600 };
  for (const id of ['caesar', 'joan', 'khan', 'cleopatra']) s.commanders[id].unlocked = true;
  Object.assign(s.commanders.caesar, { level: 27, stars: 3, skills: [3, 2, 2, 1], sculptures: 34 });
  Object.assign(s.commanders.suntzu, { level: 22, stars: 3, skills: [3, 2, 1, 1] });
  Object.assign(s.commanders.boudica, { level: 18, stars: 2, skills: [2, 2, 1, 0] });
  Object.assign(s.commanders.joan, { level: 14, stars: 2, skills: [2, 1, 0, 0] });
  s.research = { irrigation: 5, handsaw: 5, masonry: 4, wheel: 3, quarrying: 3, writing: 2, discipline: 5, archery: 4, ironworking: 4, horsemanship: 3, conscription: 2, healing: 2 };
  s.stats.maxBarbLevel = 6;
  s.questsClaimed = ['q_collect', 'q_ch2', 'q_barb1', 'q_archery', 'q_train100', 'q_wall2', 'q_ch3', 'q_tavern', 'q_academy', 'q_research', 'q_gather', 'q_barb3', 'q_ch4', 'q_quarry'];
  s.jobs = [];
  g.emitChange();
}

async function caption(page, text, bottom = false) {
  await page.evaluate(([t, low]) => {
    document.querySelector('.shot-caption')?.remove();
    if (!document.querySelector('#shot-style')) {
      const st = document.createElement('style');
      st.id = 'shot-style';
      st.textContent = '#toasts, .queues, .quest-slip { display: none !important; }';
      document.head.appendChild(st);
    }
    if (!t) return;
    const el = document.createElement('div');
    el.className = 'shot-caption';
    el.textContent = t;
    Object.assign(el.style, {
      position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 200,
      ...(low ? { bottom: '10px' } : { top: '10px' }),
      padding: '14px 56px', font: "700 20px 'Kaisei Tokumin', serif", letterSpacing: '0.1em', color: '#fff7e2', whiteSpace: 'nowrap',
      background: "url(./assets/ink/ink_band.webp) center / 100% 100% no-repeat", filter: 'drop-shadow(0 8px 14px rgba(0,0,0,.6))',
    });
    document.body.appendChild(el);
  }, [text, bottom]);
}

async function shoot(browser, base, dev) {
  const dir = `${OUT}${dev.name}/`;
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.scale, hasTouch: true });
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.t-enter:not(.hidden)', { timeout: 30000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${dir}01-title.jpg`, type: 'jpeg', quality: 90 });

  await page.click('.t-enter', { force: true });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__closeAll());
  await page.evaluate(seedKingdom);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__closeAll());
  await page.evaluate(() => {
    const cam = window.__city.camera;
    cam.zoom = 0.55;
  });
  await page.waitForTimeout(1200);
  await caption(page, SCENES[1].caption);
  await page.screenshot({ path: `${dir}02-city.jpg`, type: 'jpeg', quality: 90 });

  await caption(page, SCENES[2].caption, true);
  await page.evaluate(() => window.__openCommander('caesar'));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${dir}03-generals.jpg`, type: 'jpeg', quality: 90 });
  await page.evaluate(() => window.__closeAll());
  await page.waitForTimeout(300);

  // war: march at a barbarian and catch the clash
  await page.evaluate(() => window.__ctx.goWorld());
  await page.waitForTimeout(1200);
  const target = await page.evaluate(() => {
    const s = window.__game.state;
    const b = s.world.filter((o) => o.kind === 'barbarian' && o.level <= 4).sort((a, b) => Math.hypot(a.x - 60, a.y - 60) - Math.hypot(b.x - 60, b.y - 60))[0];
    return b.id;
  });
  await page.evaluate((id) => {
    const g = window.__game;
    const send = (cmd, troops, tid) => window.__ctx.run((s) => window.__send(s, { kind: 'attack', targetId: tid, commanderId: cmd, troops }));
    send('caesar', { infantry_2: 2400, archer_2: 800 }, id);
    const node = g.state.world.find((o) => o.kind === 'node' && Math.hypot(o.x - 60, o.y - 60) < 12);
    if (node) window.__ctx.run((s) => window.__send(s, { kind: 'gather', targetId: node.id, commanderId: 'cleopatra', troops: { infantry_1: 1500 } }));
  }, target);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const m = window.__game.state.marches[0];
    window.__world.goTo((m.fromX + m.toX) / 2, (m.fromY + m.toY) / 2 + 1);
    window.__world.camera.zoom = 0.85;
  });
  await page.waitForTimeout(900);
  await caption(page, SCENES[3].caption);
  await page.screenshot({ path: `${dir}04-war.jpg`, type: 'jpeg', quality: 90 });

  // fast-forward to the battle and open its report
  await page.evaluate(() => {
    window.__game.state.speed = 40;
  });
  await page.waitForFunction(() => window.__game.state.reports.some((r) => r.kind === 'battle'), null, { timeout: 30000 });
  await page.evaluate(() => {
    window.__game.state.speed = 1;
  });
  await page.waitForTimeout(600);
  await caption(page, SCENES[4].caption, true);
  await page.evaluate(() => window.__ctx.openReport(window.__game.state.reports.find((r) => r.kind === 'battle').id));
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${dir}05-victory.jpg`, type: 'jpeg', quality: 90 });
  await page.evaluate(() => window.__closeAll());
  await page.waitForTimeout(300);

  await caption(page, SCENES[5].caption, true);
  await page.evaluate(() => document.querySelector('[data-nav=research]').click());
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${dir}06-academy.jpg`, type: 'jpeg', quality: 90 });
  await page.close();
}

const server = await preview({ preview: { port: 4321, strictPort: true }, logLevel: 'silent' });
const base = 'http://localhost:4321/';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const dev of DEVICES) {
    process.stdout.write(`${dev.name} (${dev.w * dev.scale}x${dev.h * dev.scale})… `);
    await shoot(browser, base, dev);
    console.log('done');
  }
} finally {
  await browser.close();
  await server.close();
}
