import { describe, expect, it } from 'vitest';
import { ROW_GATE } from '../src/data/talents';
import { marchBonuses, marchCapacity } from '../src/game/logic';
import { newGame } from '../src/game/state';
import { canLearn, commanderTrees, freePoints, learnTalent, resetTalents, talentBonuses } from '../src/game/talents';

describe('commander talents', () => {
  it('gives one point per level above 1 and gates deeper rows', () => {
    const s = newGame(7);
    const c = s.commanders.suntzu;
    expect(freePoints(s, 'suntzu')).toBe(0);
    expect(learnTalent(s, 'suntzu', 'infantry_a1')).toBe(false);
    c.level = 12;
    expect(freePoints(s, 'suntzu')).toBe(11);
    const [inf] = commanderTrees('suntzu');
    expect(inf.id).toBe('infantry');
    // row 1 is shut until 5 points are in the tree
    expect(canLearn(s, 'suntzu', 'infantry_h1')).toBe(false);
    for (let i = 0; i < 5; i++) expect(learnTalent(s, 'suntzu', 'infantry_a1')).toBe(true);
    expect(learnTalent(s, 'suntzu', 'infantry_a1')).toBe(false); // max rank
    expect(ROW_GATE[1]).toBe(5);
    expect(canLearn(s, 'suntzu', 'infantry_h1')).toBe(true);
    expect(freePoints(s, 'suntzu')).toBe(6);
    expect(talentBonuses(s, 'suntzu').infantryAtk).toBeCloseTo(0.05);
  });

  it('feeds march bonuses and capacity, and resets for free', () => {
    const s = newGame(8);
    s.commanders.boudica.level = 20;
    const before = marchCapacity(s, 'boudica');
    const atk = marchBonuses(s, 'boudica').allAtk ?? 0;
    for (let i = 0; i < 5; i++) learnTalent(s, 'boudica', 'lg_speed');
    for (let i = 0; i < 3; i++) learnTalent(s, 'boudica', 'lg_cap');
    for (let i = 0; i < 5; i++) learnTalent(s, 'boudica', 'wf_atk');
    expect(marchCapacity(s, 'boudica')).toBeGreaterThan(before);
    expect((marchBonuses(s, 'boudica').allAtk ?? 0) - atk).toBeCloseTo(0.04);
    resetTalents(s, 'boudica');
    expect(freePoints(s, 'boudica')).toBe(19);
    expect(marchCapacity(s, 'boudica')).toBe(before);
  });

  it('every commander has three trees with a capstone', () => {
    for (const id of ['boudica', 'suntzu', 'cleopatra', 'joan', 'caesar', 'khan']) {
      const trees = commanderTrees(id);
      expect(trees).toHaveLength(3);
      for (const t of trees) expect(t.nodes.some((n) => n.row === 3)).toBe(true);
    }
  });
});
