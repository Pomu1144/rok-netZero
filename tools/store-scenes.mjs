/**
 * Shared steps for the store screenshots and the preview video: a believable
 * late-game kingdom, marketing captions, and helpers that put the real game into
 * each showcase state. Everything on screen is the game itself.
 */

/** A late-game kingdom: upgraded building tiers, a seasoned army and generals. Runs in the page. */
export function seedKingdom() {
  const g = window.__game;
  const s = g.state;
  Object.assign(s, { tutorialDone: true, ftueStep: 6 });
  s.governor = 'Aurelian';
  const lv = {
    city_hall: 22, wall: 20, barracks: 20, archery_range: 16, stable: 14, siege_workshop: 10, academy: 18, hospital: 12, tavern: 11, scout_camp: 10, storehouse: 13,
    farm_1: 15, farm_2: 12, farm_3: 9, lumber_mill_1: 14, lumber_mill_2: 10, quarry_1: 11, gold_mine_1: 9, quarry_2: 8,
  };
  for (const id in lv) if (s.buildings[id]) s.buildings[id].level = lv[id];
  for (const id in s.buildings) s.buildings[id].collectedAt = s.time - 3 * 3600_000;
  s.res = { food: 8_284_000, wood: 6_963_000, stone: 2_412_000, gold: 1_186_000 };
  s.gems = 4280;
  s.ap = 1000;
  s.troops = { infantry_4: 9000, infantry_3: 6000, archer_4: 6200, archer_3: 4000, cavalry_4: 5200, cavalry_3: 2400, siege_3: 1600 };
  for (const id of ['caesar', 'joan', 'khan', 'cleopatra', 'suntzu', 'boudica']) s.commanders[id].unlocked = true;
  Object.assign(s.commanders.caesar, {
    level: 27, stars: 4, skills: [4, 3, 3, 2], sculptures: 34,
    talents: { infantry_a1: 5, infantry_d1: 5, infantry_h1: 5, infantry_m1: 3, infantry_a2: 3, infantry_h2: 1, infantry_cap: 1, wf_atk: 3 },
  });
  Object.assign(s.commanders.suntzu, { level: 24, stars: 3, skills: [3, 3, 2, 1] });
  Object.assign(s.commanders.boudica, { level: 21, stars: 3, skills: [3, 2, 1, 1] });
  Object.assign(s.commanders.joan, { level: 18, stars: 2, skills: [2, 2, 1, 0] });
  Object.assign(s.commanders.khan, { level: 16, stars: 2, skills: [2, 1, 1, 0] });
  Object.assign(s.commanders.cleopatra, { level: 15, stars: 2, skills: [2, 1, 0, 0] });
  s.research = { irrigation: 8, handsaw: 8, masonry: 6, wheel: 5, quarrying: 5, writing: 4, discipline: 8, archery: 6, ironworking: 6, horsemanship: 5, conscription: 4, healing: 4 };
  s.stats.maxBarbLevel = 12;
  s.campaign = { stars: { c1s1: 3, c1s2: 3, c1s3: 3, c1s4: 2, c2s1: 3, c2s2: 2 } };
  s.jobs = [];
  g.emitChange();
}

/**
 * A marketing caption. The game is scaled into a frame under an ink caption band,
 * the usual store layout, so the caption never covers the game. An empty text
 * clears it and restores the full-screen game.
 */
export async function caption(page, text) {
  await page.evaluate((t) => {
    document.querySelector('.shot-caption')?.remove();
    if (!document.querySelector('#shot-style')) {
      const st = document.createElement('style');
      st.id = 'shot-style';
      st.textContent = `
        #toasts, .queues, .quest-slip, .tut-card, .tut-hand { display: none !important; }
        html.shot-framed body { background: #0b0b0c url(./assets/ink/ink_landscape.webp) center / cover no-repeat; }
        html.shot-framed body > *:not(.shot-caption) {
          transform: scale(0.84); transform-origin: 50% 96%;
          outline: 1px solid rgba(201,162,78,0.55); box-shadow: 0 18px 40px rgba(0,0,0,0.7);
        }
        .shot-caption {
          position: fixed; left: 0; right: 0; top: 0; height: 13.5vh; z-index: 9999; pointer-events: none;
          display: flex; align-items: center; justify-content: center;
          font: 700 clamp(18px, 4.2vh, 34px) 'Kaisei Tokumin', serif; letter-spacing: 0.1em; color: #fff7e2; white-space: nowrap;
          text-shadow: 0 2px 12px rgba(0,0,0,0.9);
        }
        .shot-caption span {
          padding: 0.45em 2.6em; background: url(./assets/ink/ink_band.webp) center / 100% 100% no-repeat;
        }`;
      document.head.appendChild(st);
    }
    document.documentElement.classList.toggle('shot-framed', !!t);
    if (!t) return;
    const el = document.createElement('div');
    el.className = 'shot-caption';
    const span = document.createElement('span');
    span.textContent = t;
    el.appendChild(span);
    document.body.appendChild(el);
  }, text);
}

/** Title screen, through the gate, seeded and settled in the city. */
export async function enterKingdom(page, base) {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.t-enter:not(.hidden)', { timeout: 30000 });
}

export async function seedAndSettle(page) {
  await page.evaluate(() => window.__closeAll());
  await page.evaluate(seedKingdom);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__closeAll());
}

/** Send Caesar's army at a strong barbarian camp and fast-forward to the report. */
export async function fightBarbarians(page) {
  await page.evaluate(() => {
    const s = window.__game.state;
    // only this battle: earlier marches go home and older reports are cleared
    s.marches = [];
    s.reports = s.reports.filter((r) => r.kind !== 'battle');
    const bb = s.world.filter((o) => o.kind === 'barbarian' && o.level >= 7 && o.level <= 10).sort((a, c) => Math.hypot(a.x - 60, a.y - 60) - Math.hypot(c.x - 60, c.y - 60))[0];
    window.__ctx.run((st) => window.__send(st, { kind: 'attack', targetId: bb.id, commanderId: 'caesar', troops: { infantry_4: 4000, archer_4: 3000, cavalry_4: 2000 } }));
    s.speed = 60;
  });
  await page.waitForFunction(() => window.__game.state.reports.some((r) => r.kind === 'battle'), null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__game.state.speed = 1;
    window.__closeAll();
  });
}

/** Open the latest battle report and start its replay. */
export async function watchBattle(page) {
  await page.evaluate(() => window.__ctx.openReport(window.__game.state.reports.find((r) => r.kind === 'battle').id));
  await page.waitForTimeout(700);
  await page.click('[data-act=watch]');
}

/**
 * Wait (up to ms) for a commander skill cut-in, then hold it on screen: a copy
 * paused mid-sequence (band, portrait and skill name all fully in) stays put
 * while a slow, large capture runs. releaseCutIn removes it.
 */
export async function waitForCutIn(page, ms = 12000) {
  await page.waitForFunction(() => document.querySelector('.bs-cutin.show'), null, { timeout: ms }).catch(() => {});
  await page.evaluate(() => {
    const el = document.querySelector('.bs-cutin.show');
    if (!el) return;
    const copy = el.cloneNode(true);
    copy.dataset.held = '1';
    el.after(copy);
    for (const a of copy.getAnimations({ subtree: true })) {
      a.pause();
      a.currentTime = 700;
    }
  });
}

export async function releaseCutIn(page) {
  await page.evaluate(() => document.querySelectorAll('[data-held]').forEach((e) => e.remove()));
}
