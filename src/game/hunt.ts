import { grantReward } from './logic';
import { mulberry32 } from './rng';
import type { GameState, Reward } from './state';

/**
 * The Barbarian Hunt: a recurring three-day event on the real calendar. Every
 * barbarian and fort defeated during a season scores hunt points; milestones pay
 * out along the way, and a leaderboard against AI governors pays by final rank.
 * Pure rules: callers pass the current real time.
 */

export const SEASON_MS = 3 * 86_400_000;

export function seasonOf(nowMs: number): number {
  return Math.floor(nowMs / SEASON_MS);
}

export function seasonEnd(season: number): number {
  return (season + 1) * SEASON_MS;
}

/** Points for one victory: grows with the square of the level; forts are worth far more. */
export function huntPointsFor(kind: 'barbarian' | 'fort', level: number): number {
  return kind === 'fort' ? 400 * level : 10 * level * level;
}

export const MILESTONES: { points: number; reward: Reward }[] = [
  { points: 100, reward: { res: { food: 15000, wood: 15000 } } },
  { points: 300, reward: { items: { speed_15m: 2, tome_500: 2 } } },
  { points: 600, reward: { items: { silver_key: 1, speed_60m: 1 } } },
  { points: 1000, reward: { res: { gems: 120 }, items: { tome_2000: 1 } } },
  { points: 1600, reward: { items: { gold_key: 1 }, res: { gems: 150 } } },
  { points: 2500, reward: { res: { gems: 300 }, sculptures: { khan: 10 } } },
];

/** Prizes by final rank (1-based); anyone outside the top ten gets the last row. */
export const RANK_PRIZES: { upTo: number; label: string; reward: Reward }[] = [
  { upTo: 1, label: 'Champion of the Hunt', reward: { res: { gems: 600 }, items: { gold_key: 2 }, sculptures: { khan: 10 } } },
  { upTo: 3, label: 'Top 3', reward: { res: { gems: 350 }, items: { gold_key: 1 } } },
  { upTo: 6, label: 'Top 6', reward: { res: { gems: 200 }, items: { silver_key: 2 } } },
  { upTo: 10, label: 'Top 10', reward: { res: { gems: 100 }, items: { silver_key: 1 } } },
];

export const RIVALS = [
  { id: 'r_vargr', name: 'Vargr the Red' },
  { id: 'r_ilse', name: 'Ilse of Rhine' },
  { id: 'r_hakon', name: 'Hakon Longaxe' },
  { id: 'r_zhao', name: 'Zhao Yun' },
  { id: 'r_amira', name: 'Amira the Bold' },
  { id: 'r_leof', name: 'Leofric' },
  { id: 'r_ottar', name: 'Ottar' },
  { id: 'r_saga', name: 'Saga Sunblade' },
  { id: 'r_dmitri', name: 'Dmitri' },
  { id: 'r_bea', name: 'Beatrix' },
  { id: 'r_kenji', name: 'Kenji' },
];

export interface HuntState {
  season: number;
  /** stats.huntPoints when the season began */
  base: number;
  milestones: number[];
  /** final standing of the previous season, waiting to be claimed */
  result?: { season: number; rank: number; points: number; claimed: boolean };
}

export function huntPoints(s: GameState): number {
  const h = s.hunt;
  return h ? Math.max(0, (s.stats.huntPoints ?? 0) - h.base) : 0;
}

/** AI scores: each rival has a target for the season and closes in on it over three days. */
export function rivalScores(season: number, nowMs: number): { id: string; name: string; points: number }[] {
  const rng = mulberry32(season * 7919 + 13);
  const progress = Math.min(1, Math.max(0, (nowMs - season * SEASON_MS) / SEASON_MS));
  return RIVALS.map((r) => {
    const target = Math.round(300 + rng() * rng() * 3600);
    const pace = 0.7 + rng() * 0.8;
    return { ...r, points: Math.round(target * Math.pow(progress, pace)) };
  });
}

export function leaderboard(s: GameState, nowMs: number): { id: string; name: string; points: number; me: boolean }[] {
  const season = s.hunt?.season ?? seasonOf(nowMs);
  const rows = rivalScores(season, nowMs).map((r) => ({ ...r, me: false }));
  rows.push({ id: 'me', name: s.governor, points: huntPoints(s), me: true });
  // ties go to the player
  return rows.sort((a, b) => b.points - a.points || Number(b.me) - Number(a.me));
}

export function myRank(s: GameState, nowMs: number): number {
  return leaderboard(s, nowMs).findIndex((r) => r.me) + 1;
}

export function prizeFor(rank: number): (typeof RANK_PRIZES)[number] | null {
  return RANK_PRIZES.find((p) => rank <= p.upTo) ?? null;
}

/** Start a new season when the calendar has moved on, banking last season's standing. */
export function rollHunt(s: GameState, nowMs: number): boolean {
  const season = seasonOf(nowMs);
  const total = s.stats.huntPoints ?? 0;
  if (!s.hunt) {
    s.hunt = { season, base: total, milestones: [] };
    return true;
  }
  if (s.hunt.season === season) return false;
  const prev = s.hunt;
  // standings frozen at the end of the season that just closed
  const points = huntPoints(s);
  const rows = rivalScores(prev.season, seasonEnd(prev.season)).map((r) => r.points);
  const rank = rows.filter((p) => p > points).length + 1;
  s.hunt = {
    season,
    base: total,
    milestones: [],
    result: points > 0 ? { season: prev.season, rank, points, claimed: false } : undefined,
  };
  return true;
}

export function milestoneReady(s: GameState, i: number): boolean {
  return !!s.hunt && !s.hunt.milestones.includes(i) && huntPoints(s) >= MILESTONES[i].points;
}

export function claimMilestone(s: GameState, i: number): Reward | null {
  if (!milestoneReady(s, i)) return null;
  s.hunt!.milestones.push(i);
  grantReward(s, MILESTONES[i].reward);
  return MILESTONES[i].reward;
}

export function claimSeasonPrize(s: GameState): Reward | null {
  const r = s.hunt?.result;
  if (!r || r.claimed) return null;
  r.claimed = true;
  const prize = prizeFor(r.rank);
  if (!prize) return null;
  grantReward(s, prize.reward);
  return prize.reward;
}

export function huntBadge(s: GameState): number {
  if (!s.hunt) return 0;
  const ready = MILESTONES.reduce((n, _m, i) => n + (milestoneReady(s, i) ? 1 : 0), 0);
  return ready + (s.hunt.result && !s.hunt.result.claimed && prizeFor(s.hunt.result.rank) ? 1 : 0);
}
