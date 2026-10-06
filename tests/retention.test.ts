import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, TIER_REWARDS, achievementBadge, canClaimAchievement, claimAchievement, claimedTiers, medalCount, reachedTiers } from '../src/game/achievements';
import { awaySnapshot, awaySummary, awayWorthShowing } from '../src/game/away';
import type { GameEvent } from '../src/game/logic';
import { newGame } from '../src/game/state';

describe('achievements', () => {
  it('claims tiers in order and only once reached', () => {
    const s = newGame(3);
    const slayer = ACHIEVEMENTS.find((a) => a.id === 'a_slayer')!;
    expect(canClaimAchievement(s, slayer)).toBe(false);
    expect(claimAchievement(s, 'a_slayer')).toBeNull();
    s.stats.barbsKilled = 80;
    expect(reachedTiers(s, slayer)).toBe(2);
    const gems = s.gems;
    expect(claimAchievement(s, 'a_slayer')).toBe(TIER_REWARDS[0]);
    expect(claimAchievement(s, 'a_slayer')).toBe(TIER_REWARDS[1]);
    expect(claimAchievement(s, 'a_slayer')).toBeNull();
    expect(claimedTiers(s, 'a_slayer')).toBe(2);
    expect(s.gems).toBe(gems + 20 + 60);
    expect(medalCount(s)).toBe(2);
  });

  it('counts claimable honours for the badge', () => {
    const s = newGame(4);
    const base = achievementBadge(s);
    s.stats.collections = 30;
    s.stats.researchDone = 5;
    expect(achievementBadge(s)).toBe(base + 2);
  });

  it('has ascending tiers', () => {
    for (const a of ACHIEVEMENTS) expect(a.tiers[0] < a.tiers[1] && a.tiers[1] <= a.tiers[2]).toBe(true);
  });
});

describe('away summary', () => {
  it('reports gains, finished work, battles and stored harvest', () => {
    const s = newGame(5);
    const before = awaySnapshot(s);
    s.res.food += 4000;
    s.gems += 10;
    s.time += 3 * 3600_000;
    const events: GameEvent[] = [
      { kind: 'build', text: 'Farm reached Lv.2' },
      { kind: 'battle', text: 'Victory', good: true },
      { kind: 'battle', text: 'Defeat', good: false },
      { kind: 'info', text: 'noise' },
    ];
    const a = awaySummary(before, s, events, 3 * 3600_000);
    expect(a.gained).toEqual({ food: 4000, gems: 10 });
    expect(a.done).toEqual(['Farm reached Lv.2']);
    expect(a.battlesWon).toBe(1);
    expect(a.battlesLost).toBe(1);
    expect((a.stored.food ?? 0) > 0).toBe(true);
    expect(awayWorthShowing(a)).toBe(true);
    expect(awayWorthShowing({ ...a, awayMs: 60_000 })).toBe(false);
  });
});
