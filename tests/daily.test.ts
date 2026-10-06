import { describe, expect, it } from 'vitest';
import { ACTIVITY_CHESTS, DAILY_MAX_POINTS, LOGIN_REWARDS, activityPoints, chestReady, claimChest, claimLogin, dailyBadge, loginClaimable, rollDaily, taskDone, DAILY_TASKS } from '../src/game/daily';
import { newGame } from '../src/game/state';

describe('login calendar', () => {
  it('grants one reward per calendar day and walks the seven days', () => {
    const s = newGame(1);
    const gems = s.gems;
    expect(loginClaimable(s, '2026-10-01')).toBe(0);
    expect(claimLogin(s, '2026-10-01')).toBe(LOGIN_REWARDS[0]);
    expect(claimLogin(s, '2026-10-01')).toBeNull();
    expect(loginClaimable(s, '2026-10-01')).toBe(-1);
    // a missed day does not reset the streak
    expect(loginClaimable(s, '2026-10-05')).toBe(1);
    for (let d = 2; d <= 7; d++) claimLogin(s, `2026-10-${String(d + 4).padStart(2, '0')}`);
    expect(s.login!.claimed).toBe(7);
    expect(s.gems).toBe(gems + 150 + 300);
    expect(s.commanders.joan.sculptures).toBe(10);
    // the calendar starts over after day seven
    expect(loginClaimable(s, '2026-10-20')).toBe(0);
    claimLogin(s, '2026-10-20');
    expect(s.login).toEqual({ claimed: 1, last: '2026-10-20', cycles: 1 });
  });
});

describe('daily tasks', () => {
  it('measures progress from the start of the day and fills the activity chest', () => {
    const s = newGame(2);
    s.stats.collections = 7;
    expect(rollDaily(s, '2026-10-01')).toBe(true);
    expect(rollDaily(s, '2026-10-01')).toBe(false);
    // only the login task is done at the start of the day
    expect(activityPoints(s)).toBe(10);
    s.stats.collections += 5;
    s.buildings.farm_1.level++;
    expect(taskDone(s, DAILY_TASKS.find((t) => t.id === 'd_harvest')!)).toBe(true);
    expect(activityPoints(s)).toBe(50);
    expect(dailyBadge(s)).toBe(2);
    const wood = s.res.wood;
    expect(claimChest(s, 0)).toBe(ACTIVITY_CHESTS[0].reward);
    expect(s.res.wood).toBe(wood + 5000);
    expect(claimChest(s, 0)).toBeNull();
    expect(chestReady(s, 2)).toBe(false);
    // a new day resets tasks and chests against the new baseline
    rollDaily(s, '2026-10-02');
    expect(activityPoints(s)).toBe(10);
    expect(s.daily!.chests).toEqual([]);
  });

  it('can reach the final chest', () => {
    expect(DAILY_MAX_POINTS).toBeGreaterThanOrEqual(ACTIVITY_CHESTS[ACTIVITY_CHESTS.length - 1].points);
  });
});
