import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/game/battle';

describe('battle timeline', () => {
  it('records active skill casts per round, landing within the first five rounds', () => {
    const res = simulateBattle(
      { name: 'Caesar', troops: { infantry_3: 3000, archer_3: 2000 }, bonuses: {}, commander: { id: 'caesar', level: 20, skills: [5, 0, 0, 0] } },
      { name: 'Barbarians', troops: { infantry_2: 9000 }, bonuses: {}, barbarian: true },
    );
    const firstCast = res.timeline.findIndex((p) => p.ca);
    expect(firstCast).toBeGreaterThan(0);
    expect(firstCast).toBeLessThanOrEqual(5);
    expect(res.timeline[firstCast].ca).toBe('Crossing the Rubicon');
    expect(res.timeline.every((p) => !p.cd)).toBe(true);
    expect(res.attacker.skillCasts).toBe(res.timeline.filter((p) => p.ca).length);
  });
});
