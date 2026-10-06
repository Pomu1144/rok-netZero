import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/game/battle';
import {
  BARB_AP_COST,
  collect,
  maxBarbLevel,
  openChest,
  recallMarch,
  sendMarch,
  startHealing,
  startResearch,
  startTraining,
  startUpgrade,
  storedAmount,
  tick,
  totalPower,
  upgradeInfo,
  useTome,
} from '../src/game/logic';
import { claimQuest } from '../src/game/quests';
import { Rng } from '../src/game/rng';
import { newGame, sumTroops, type GameState } from '../src/game/state';
import { barbarianTroops } from '../src/game/world';

const rng = () => new Rng(42);

function advance(s: GameState, ms: number, r = rng()) {
  const events = [];
  const step = 1000;
  for (let t = 0; t < ms; t += step) events.push(...tick(s, Math.min(step, ms - t), r));
  return events;
}

function nearestBarb(s: GameState, level = 1) {
  return s.world
    .filter((o) => o.kind === 'barbarian' && o.level === level)
    .sort((a, b) => Math.hypot(a.x - 60, a.y - 60) - Math.hypot(b.x - 60, b.y - 60))[0];
}

describe('economy', () => {
  it('producers accumulate up to capacity and can be collected', () => {
    const s = newGame(1);
    // farms start with a head start so the first harvest is immediate
    expect(storedAmount(s, 'farm_1')).toBeGreaterThan(0);
    collect(s, 'farm_1');
    expect(storedAmount(s, 'farm_1')).toBe(0);
    advance(s, 3_600_000);
    const stored = storedAmount(s, 'farm_1');
    expect(stored).toBeGreaterThan(1500);
    const before = s.res.food;
    expect(collect(s, 'farm_1')).toBe(stored);
    expect(s.res.food).toBe(before + stored);
    expect(storedAmount(s, 'farm_1')).toBe(0);
  });

  it('building upgrades cost resources, take time and respect the city hall cap', () => {
    const s = newGame(1);
    expect(upgradeInfo(s, 'barracks').ok).toBe(false); // barracks Lv.2 needs City Hall Lv.2
    const food = s.res.food;
    expect(startUpgrade(s, 'city_hall').ok).toBe(true);
    expect(s.res.food).toBeLessThan(food);
    const { seconds } = upgradeInfo(s, 'city_hall');
    expect(seconds).toBeGreaterThan(0);
    advance(s, 60_000);
    expect(s.buildings.city_hall.level).toBe(2);
    expect(upgradeInfo(s, 'barracks').ok).toBe(true);
  });

  it('only two builders work at once', () => {
    const s = newGame(1);
    s.res.food = s.res.wood = 1e6;
    expect(startUpgrade(s, 'city_hall').ok).toBe(true);
    expect(startUpgrade(s, 'farm_1').ok).toBe(false); // farm Lv.2 needs CH2
    expect(startUpgrade(s, 'wall').ok).toBe(false); // wall unlocks at CH2
    advance(s, 120_000);
    expect(startUpgrade(s, 'farm_1').ok).toBe(true);
    expect(startUpgrade(s, 'lumber_mill_1').ok).toBe(true);
    const third = startUpgrade(s, 'barracks');
    expect(third.ok).toBe(false);
  });
});

describe('military', () => {
  it('trains troops over time', () => {
    const s = newGame(1);
    expect(startTraining(s, 'infantry', 1, 50).ok).toBe(true);
    expect(startTraining(s, 'infantry', 1, 10).ok).toBe(false);
    expect(startTraining(s, 'infantry', 2, 10).ok).toBe(false);
    advance(s, 50 * 4 * 1000 + 1000);
    expect(s.troops.infantry_1).toBe(650);
    expect(s.stats.troopsTrained).toBe(50);
  });

  it('a larger army beats a smaller one and counters matter', () => {
    const big = simulateBattle(
      { name: 'A', troops: { infantry_1: 1000 }, bonuses: {} },
      { name: 'B', troops: { infantry_1: 400 }, bonuses: {} },
    );
    expect(big.winner).toBe('attacker');
    expect(big.attacker.losses.infantry_1).toBeLessThan(1000);

    const cav = simulateBattle({ name: 'A', troops: { cavalry_1: 500 }, bonuses: {} }, { name: 'B', troops: { archer_1: 500 }, bonuses: {} });
    const inf = simulateBattle({ name: 'A', troops: { infantry_1: 500 }, bonuses: {} }, { name: 'B', troops: { archer_1: 500 }, bonuses: {} });
    expect(cav.winner).toBe('attacker');
    expect(inf.winner).toBe('defender');
  });

  it('commander skills fire in long battles', () => {
    const r = simulateBattle(
      { name: 'A', troops: { infantry_1: 3000 }, bonuses: {}, commander: { id: 'suntzu', level: 10, skills: [3, 0, 0, 0] } },
      { name: 'B', troops: { infantry_1: 2800 }, bonuses: {} },
    );
    expect(r.attacker.skillCasts).toBeGreaterThan(0);
    expect(r.winner).toBe('attacker');
  });

  it('a new player can beat a level 1 barbarian and gets rewarded', () => {
    const s = newGame(7);
    const barb = nearestBarb(s, 1);
    expect(barb).toBeTruthy();
    const ap = s.ap;
    const res = sendMarch(s, { kind: 'attack', targetId: barb.id, commanderId: 'boudica', troops: { infantry_1: 600 } });
    expect(res.ok).toBe(true);
    expect(s.ap).toBe(ap - BARB_AP_COST);
    expect(s.troops.infantry_1).toBe(0);
    advance(s, 120_000);
    expect(s.marches.length).toBe(0);
    expect(s.stats.barbsKilled).toBe(1);
    expect(s.troops.infantry_1).toBe(600); // PvE wounds heal on the way home
    expect(s.commanders.boudica.level).toBeGreaterThan(1);
    expect(maxBarbLevel(s)).toBe(2);
    expect(s.reports[0].kind).toBe('battle');
  });

  it('cannot attack barbarians above the unlocked level', () => {
    const s = newGame(7);
    const barb = s.world.find((o) => o.kind === 'barbarian' && o.level >= 3)!;
    expect(sendMarch(s, { kind: 'attack', targetId: barb.id, commanderId: 'boudica', troops: { infantry_1: 100 } }).ok).toBe(false);
  });

  it('barbarian troop counts grow with level', () => {
    expect(sumTroops(barbarianTroops(5))).toBeGreaterThan(sumTroops(barbarianTroops(1)) * 4);
  });

  it('heals wounded troops in the hospital', () => {
    const s = newGame(1);
    s.buildings.hospital.level = 1;
    s.wounded = { infantry_1: 100 };
    expect(startHealing(s).ok).toBe(true);
    advance(s, 170_000); // 100 x 1.6s
    expect(s.troops.infantry_1).toBe(700);
  });
});

describe('gathering', () => {
  it('gathers resources from a node and brings them home', () => {
    const s = newGame(3);
    const node = s.world
      .filter((o) => o.kind === 'node' && o.res === 'food')
      .sort((a, b) => Math.hypot(a.x - 60, a.y - 60) - Math.hypot(b.x - 60, b.y - 60))[0];
    const food = s.res.food;
    expect(sendMarch(s, { kind: 'gather', targetId: node.id, commanderId: 'suntzu', troops: { infantry_1: 300 } }).ok).toBe(true);
    advance(s, 600_000);
    expect(s.marches.length).toBe(0);
    expect(s.stats.gathered).toBeGreaterThan(0);
    expect(s.res.food).toBeGreaterThan(food);
  });

  it('recalling mid-gather returns partial loot', () => {
    const s = newGame(3);
    const node = s.world.find((o) => o.kind === 'node' && o.res === 'wood')!;
    sendMarch(s, { kind: 'gather', targetId: node.id, commanderId: 'suntzu', troops: { infantry_1: 600 } });
    const m = s.marches[0];
    advance(s, m.arriveAt - s.time + 10_000);
    expect(s.marches[0].phase).toBe('gathering');
    expect(recallMarch(s, m.id).ok).toBe(true);
    expect(s.marches[0].carry.wood).toBeGreaterThan(0);
  });
});

describe('progression', () => {
  it('research applies bonuses', () => {
    const s = newGame(1);
    s.buildings.academy.level = 1;
    expect(startResearch(s, 'irrigation').ok).toBe(true);
    advance(s, 60_000);
    expect(s.research.irrigation).toBe(1);
  });

  it('tomes level commanders and chests give rewards', () => {
    const s = newGame(1);
    expect(useTome(s, 'tome_500', 'boudica', 3).ok).toBe(true);
    expect(s.commanders.boudica.level).toBeGreaterThan(3);
    const r = openChest(s, 'silver', new Rng(5));
    expect(r.ok).toBe(true);
    expect(s.stats.chestsOpened).toBe(1);
    // free chest used: next one needs a key
    expect(openChest(s, 'silver', new Rng(5)).ok).toBe(true); // starting silver key
    expect(openChest(s, 'silver', new Rng(5)).ok).toBe(false);
  });

  it('quests can be claimed once complete', () => {
    const s = newGame(1);
    expect(claimQuest(s, 'q_collect')).toBe(false);
    advance(s, 600_000);
    collect(s, 'farm_1');
    const wood = s.res.wood;
    expect(claimQuest(s, 'q_collect')).toBe(true);
    expect(s.res.wood).toBe(wood + 2000);
    expect(claimQuest(s, 'q_collect')).toBe(false);
  });

  it('power grows as the city develops', () => {
    const s = newGame(1);
    const p = totalPower(s);
    s.buildings.city_hall.level = 5;
    expect(totalPower(s)).toBeGreaterThan(p);
  });

  it('raids start once City Hall reaches Lv.4', () => {
    const s = newGame(1);
    s.buildings.city_hall.level = 4;
    s.buildings.hospital.level = 3;
    const events = advance(s, 40 * 60_000);
    expect(events.some((e) => e.kind === 'raid_warning')).toBe(true);
    expect(events.some((e) => e.kind === 'raid')).toBe(true);
  });
});
