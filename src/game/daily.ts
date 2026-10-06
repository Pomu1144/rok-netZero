import { grantReward } from './logic';
import type { GameState, Reward } from './state';

/**
 * Retention loops that run on the player's real calendar (not game time):
 * a seven-day login calendar and a daily task list that fills an activity chest.
 * Every function takes `today` (a local YYYY-MM-DD key) so the rules stay pure and testable.
 */

export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// seven-day login calendar

export const LOGIN_REWARDS: Reward[] = [
  { res: { food: 10000, wood: 10000 }, items: { speed_5m: 3 } },
  { items: { tome_500: 4, speed_15m: 1 } },
  { items: { silver_key: 2 }, res: { stone: 5000 } },
  { items: { speed_15m: 3, food_10k: 2, wood_10k: 2 } },
  { res: { gems: 150 }, items: { tome_2000: 1 } },
  { items: { speed_60m: 2, gold_3k: 2 } },
  { items: { gold_key: 2 }, res: { gems: 300 }, sculptures: { joan: 10 } },
];

export interface LoginState {
  /** days claimed in the current cycle, 0..7 */
  claimed: number;
  /** day key of the last claim */
  last: string;
  /** completed seven-day cycles */
  cycles: number;
}

export function loginState(s: GameState): LoginState {
  return s.login ?? { claimed: 0, last: '', cycles: 0 };
}

/** Index (0..6) of the reward today's claim would grant, or -1 if already claimed today. */
export function loginClaimable(s: GameState, today: string): number {
  const l = loginState(s);
  if (l.last === today) return -1;
  return l.claimed >= LOGIN_REWARDS.length ? 0 : l.claimed;
}

export function claimLogin(s: GameState, today: string): Reward | null {
  const i = loginClaimable(s, today);
  if (i < 0) return null;
  const l = loginState(s);
  const cycles = l.claimed >= LOGIN_REWARDS.length ? l.cycles + 1 : l.cycles;
  const reward = LOGIN_REWARDS[i];
  grantReward(s, reward);
  s.login = { claimed: i + 1, last: today, cycles };
  return reward;
}

// ---------------------------------------------------------------------------
// daily tasks and the activity chest

/** Counters that daily tasks measure, as deltas since the day began. */
export type DailyMetric = 'collections' | 'troopsTrained' | 'barbsKilled' | 'gathered' | 'researchDone' | 'chestsOpened' | 'buildLevels';

export interface DailyTask {
  id: string;
  title: string;
  metric: DailyMetric | 'login';
  target: number;
  points: number;
  hint?: { plot?: string; view?: 'world' | 'research' | 'tavern' };
}

export const DAILY_TASKS: DailyTask[] = [
  { id: 'd_login', title: 'Hold court today', metric: 'login', target: 1, points: 10 },
  { id: 'd_harvest', title: 'Harvest resource buildings 5 times', metric: 'collections', target: 5, points: 20, hint: { plot: 'farm_1' } },
  { id: 'd_build', title: 'Finish a building upgrade', metric: 'buildLevels', target: 1, points: 20, hint: { plot: 'city_hall' } },
  { id: 'd_train', title: 'Train 100 troops', metric: 'troopsTrained', target: 100, points: 20, hint: { plot: 'barracks' } },
  { id: 'd_barb', title: 'Defeat 2 barbarians', metric: 'barbsKilled', target: 2, points: 20, hint: { view: 'world' } },
  { id: 'd_gather', title: 'Gather 5,000 resources on the map', metric: 'gathered', target: 5000, points: 20, hint: { view: 'world' } },
  { id: 'd_research', title: 'Complete a research', metric: 'researchDone', target: 1, points: 20, hint: { view: 'research' } },
  { id: 'd_chest', title: 'Open a chest in the Tavern', metric: 'chestsOpened', target: 1, points: 10, hint: { view: 'tavern' } },
];

export const DAILY_MAX_POINTS = DAILY_TASKS.reduce((n, t) => n + t.points, 0);

export const ACTIVITY_CHESTS: { points: number; reward: Reward }[] = [
  { points: 20, reward: { res: { food: 5000, wood: 5000 }, items: { speed_5m: 2 } } },
  { points: 40, reward: { items: { tome_500: 3, speed_15m: 1 } } },
  { points: 60, reward: { items: { silver_key: 1, speed_15m: 2 }, res: { stone: 3000 } } },
  { points: 80, reward: { res: { gems: 60 }, items: { speed_60m: 1 } } },
  { points: 100, reward: { res: { gems: 100 }, items: { gold_key: 1, tome_2000: 1 } } },
];

export interface DailyState {
  day: string;
  /** metric values when the day began */
  base: Record<DailyMetric, number>;
  /** indices of activity chests already opened today */
  chests: number[];
}

function metricNow(s: GameState, m: DailyMetric): number {
  if (m === 'buildLevels') {
    let n = 0;
    for (const id in s.buildings) n += s.buildings[id].level;
    return n;
  }
  return s.stats[m];
}

function snapshot(s: GameState): Record<DailyMetric, number> {
  const out = {} as Record<DailyMetric, number>;
  for (const m of ['collections', 'troopsTrained', 'barbsKilled', 'gathered', 'researchDone', 'chestsOpened', 'buildLevels'] as DailyMetric[]) out[m] = metricNow(s, m);
  return out;
}

/** Start a fresh day if the calendar has turned. Returns true when it did. */
export function rollDaily(s: GameState, today: string): boolean {
  if (s.daily?.day === today) return false;
  s.daily = { day: today, base: snapshot(s), chests: [] };
  return true;
}

export function taskProgress(s: GameState, t: DailyTask): [number, number] {
  if (t.metric === 'login') return [1, 1];
  const base = s.daily?.base[t.metric] ?? metricNow(s, t.metric);
  return [Math.max(0, metricNow(s, t.metric) - base), t.target];
}

export function taskDone(s: GameState, t: DailyTask): boolean {
  const [p, n] = taskProgress(s, t);
  return p >= n;
}

export function activityPoints(s: GameState): number {
  return DAILY_TASKS.reduce((n, t) => n + (taskDone(s, t) ? t.points : 0), 0);
}

export function chestReady(s: GameState, i: number): boolean {
  return !!s.daily && !s.daily.chests.includes(i) && activityPoints(s) >= ACTIVITY_CHESTS[i].points;
}

export function claimChest(s: GameState, i: number): Reward | null {
  if (!chestReady(s, i)) return null;
  s.daily!.chests.push(i);
  grantReward(s, ACTIVITY_CHESTS[i].reward);
  return ACTIVITY_CHESTS[i].reward;
}

/** Number of things waiting to be claimed, for HUD badges. */
export function dailyBadge(s: GameState): number {
  return ACTIVITY_CHESTS.reduce((n, _c, i) => n + (chestReady(s, i) ? 1 : 0), 0);
}
