import { describe, expect, it } from 'vitest';
import { MILESTONES, SEASON_MS, claimMilestone, claimSeasonPrize, huntBadge, huntPoints, huntPointsFor, leaderboard, myRank, rivalScores, rollHunt } from '../src/game/hunt';
import { newGame } from '../src/game/state';

const T0 = 1000 * SEASON_MS; // start of a season

describe('barbarian hunt', () => {
  it('scores by level, with forts worth more', () => {
    expect(huntPointsFor('barbarian', 1)).toBe(10);
    expect(huntPointsFor('barbarian', 5)).toBe(250);
    expect(huntPointsFor('fort', 3)).toBeGreaterThan(huntPointsFor('barbarian', 5));
  });

  it('counts points from the start of the season and pays milestones once', () => {
    const s = newGame(21);
    s.stats.huntPoints = 5000; // earned in earlier seasons
    rollHunt(s, T0 + 1000);
    expect(huntPoints(s)).toBe(0);
    s.stats.huntPoints += 350;
    expect(huntPoints(s)).toBe(350);
    expect(huntBadge(s)).toBe(2);
    expect(claimMilestone(s, 0)).toBe(MILESTONES[0].reward);
    expect(claimMilestone(s, 0)).toBeNull();
    expect(claimMilestone(s, 2)).toBeNull(); // 600 not reached
  });

  it('rivals climb through the season and the leaderboard includes the player', () => {
    const early = rivalScores(1000, T0 + 3600_000);
    const late = rivalScores(1000, T0 + SEASON_MS - 1);
    expect(late.every((r, i) => r.points >= early[i].points)).toBe(true);
    const s = newGame(22);
    rollHunt(s, T0);
    s.stats.huntPoints = 99_999;
    const board = leaderboard(s, T0 + 60_000);
    expect(board[0].me).toBe(true);
    expect(myRank(s, T0 + 60_000)).toBe(1);
  });

  it('banks the final rank when the season turns and pays the prize once', () => {
    const s = newGame(23);
    rollHunt(s, T0);
    s.stats.huntPoints = 99_999;
    const gems = s.gems;
    expect(rollHunt(s, T0 + SEASON_MS + 5)).toBe(true);
    expect(s.hunt!.result).toMatchObject({ rank: 1, claimed: false });
    expect(huntPoints(s)).toBe(0);
    expect(claimSeasonPrize(s)).not.toBeNull();
    expect(s.gems).toBe(gems + 600);
    expect(claimSeasonPrize(s)).toBeNull();
  });
});
