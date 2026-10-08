import { describe, expect, it } from 'vitest';
import { bestSpeedups, planUpgrade, startUpgrade, tick, useBestSpeedups } from '../src/game/logic';
import { Rng } from '../src/game/rng';
import { newGame } from '../src/game/state';

describe('build plan', () => {
  it('starts a planned upgrade by itself once a builder frees up', () => {
    const s = newGame(1);
    s.res = { food: 1e7, wood: 1e7, stone: 1e7, gold: 1e7 };
    s.builders = 1;
    expect(startUpgrade(s, 'city_hall').ok).toBe(true);
    // farms need Citadel Lv.2: the plan waits for both the builder and the requirement
    expect(planUpgrade(s, 'farm_1').ok).toBe(true);
    const r = new Rng(1);
    tick(s, 1000, r);
    expect(s.jobs.some((j) => j.target === 'farm_1')).toBe(false);
    tick(s, 3_600_000, r);
    expect(s.buildings.city_hall.level).toBe(2);
    expect(s.jobs.some((j) => j.target === 'farm_1') || s.buildings.farm_1.level > 1).toBe(true);
    expect(s.buildPlan).toEqual([]);
  });

  it('holds at most three upgrades and no duplicates', () => {
    const s = newGame(1);
    expect(planUpgrade(s, 'farm_1').ok).toBe(true);
    expect(planUpgrade(s, 'farm_1').ok).toBe(false);
    expect(planUpgrade(s, 'farm_2').ok).toBe(true);
    expect(planUpgrade(s, 'lumber_mill_1').ok).toBe(true);
    expect(planUpgrade(s, 'lumber_mill_2').ok).toBe(false);
  });
});

describe('best speedups', () => {
  it('uses big items without overshooting, then the smallest item that finishes', () => {
    const s = newGame(1);
    s.res = { food: 1e7, wood: 1e7, stone: 1e7, gold: 1e7 };
    expect(startUpgrade(s, 'city_hall').ok).toBe(true);
    const job = s.jobs[0];
    job.end = s.time + (2 * 3600 + 20 * 60) * 1000; // 2h 20m left
    s.items = { speed_60m: 5, speed_15m: 1, speed_5m: 1, speed_1m: 10 };
    const best = bestSpeedups(s, job.id);
    // 2 × 60m, then 15m, 5m: exactly 2h 20m, nothing wasted
    expect(best.use).toEqual({ speed_60m: 2, speed_15m: 1, speed_5m: 1 });
    expect(best.waste).toBe(0);
    expect(useBestSpeedups(s, job.id).ok).toBe(true);
    expect(job.end).toBeLessThanOrEqual(s.time);
    expect(s.items.speed_60m).toBe(3);
  });

  it('when the small items run out, finishes with the least wasteful bigger one', () => {
    const s = newGame(1);
    s.res = { food: 1e7, wood: 1e7, stone: 1e7, gold: 1e7 };
    expect(startUpgrade(s, 'city_hall').ok).toBe(true);
    const job = s.jobs[0];
    job.end = s.time + 70 * 60 * 1000; // 70 minutes
    s.items = { speed_60m: 2, speed_15m: 1 };
    const best = bestSpeedups(s, job.id);
    expect(best.use).toEqual({ speed_60m: 1, speed_15m: 1 });
    expect(best.waste).toBe(5 * 60);
  });
});
