import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/data/campaign';
import { STAGE_AP, autoArmy, fightStage, stageStars, stageUnlocked, starsFor, totalStars } from '../src/game/campaign';
import { newGame } from '../src/game/state';

describe('campaign', () => {
  it('has twelve stages in three chapters with a boss at the end of each', () => {
    expect(STAGES).toHaveLength(12);
    for (const ch of [1, 2, 3]) {
      const st = STAGES.filter((s) => s.chapter === ch);
      expect(st).toHaveLength(4);
      expect(st[3].enemy.commander).toBeTruthy();
    }
  });

  it('a new governor can clear the first stage with the starting army', () => {
    const s = newGame(31);
    const army = autoArmy(s, 'boudica');
    const gems = s.gems;
    const r = fightStage(s, 'c1s1', 'boudica', army);
    expect(r.ok).toBe(true);
    expect(r.outcome!.win).toBe(true);
    expect(r.outcome!.firstClear).toBe(true);
    expect(stageStars(s, 'c1s1')).toBeGreaterThan(0);
    expect(stageUnlocked(s, 'c1s2')).toBe(true);
    expect(s.reports[0].body.timeline!.length).toBeGreaterThan(1);
    // troops are only wounded: they come home
    expect(s.troops.infantry_1).toBe(600);
    expect(s.gems).toBe(gems);
  });

  it('stages unlock in order and cost action points', () => {
    const s = newGame(32);
    expect(stageUnlocked(s, 'c1s2')).toBe(false);
    expect(fightStage(s, 'c1s2', 'boudica', autoArmy(s, 'boudica')).ok).toBe(false);
    s.ap = STAGE_AP - 1;
    expect(fightStage(s, 'c1s1', 'boudica', autoArmy(s, 'boudica')).ok).toBe(false);
  });

  it('the empress is beyond a mid-game army', () => {
    const s = newGame(33);
    s.campaign = { stars: Object.fromEntries(STAGES.slice(0, 11).map((x) => [x.id, 1])) };
    Object.assign(s.commanders.suntzu, { level: 25, skills: [3, 2, 2, 1] });
    s.troops = { infantry_3: 20000, archer_3: 10000 };
    const r = fightStage(s, 'c3s4', 'suntzu', autoArmy(s, 'suntzu'));
    expect(r.ok).toBe(true);
    expect(r.outcome!.win).toBe(false);
    expect(totalStars(s)).toBe(11);
  });

  it('awards stars by losses', () => {
    expect([0.05, 0.2, 0.6].map(starsFor)).toEqual([3, 2, 1]);
  });
});
