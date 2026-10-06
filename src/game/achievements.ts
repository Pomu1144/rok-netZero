import { grantReward, totalPower } from './logic';
import type { GameState, Reward } from './state';

/**
 * Honours: long-term goals in three tiers (bronze, silver, gold). Progress is read
 * from live state and lifetime stats, so nothing has to be tracked separately; the
 * save only records which tiers have been claimed.
 */

export interface AchievementDef {
  id: string;
  name: string;
  /** what the tier asks for, given its target */
  desc: (n: string, one: boolean) => string;
  value: (s: GameState) => number;
  tiers: [number, number, number];
}

export const TIER_NAMES = ['Bronze', 'Silver', 'Gold'] as const;

export const TIER_REWARDS: [Reward, Reward, Reward] = [
  { res: { gems: 20 }, items: { speed_15m: 1 } },
  { res: { gems: 60 }, items: { tome_2000: 1 } },
  { res: { gems: 150 }, items: { gold_key: 1 } },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'a_hall', name: 'Seat of Power', desc: (n) => `Raise the City Hall to Lv.${n}`, value: (s) => s.buildings.city_hall.level, tiers: [5, 12, 20] },
  { id: 'a_power', name: 'Rising Crown', desc: (n) => `Reach ${n} power`, value: totalPower, tiers: [50_000, 500_000, 3_000_000] },
  { id: 'a_slayer', name: 'Barbarian Bane', desc: (n) => `Defeat ${n} barbarians`, value: (s) => s.stats.barbsKilled, tiers: [10, 75, 300] },
  { id: 'a_warlord', name: 'Warlord', desc: (n) => `Defeat a Lv.${n} barbarian`, value: (s) => s.stats.maxBarbLevel, tiers: [3, 8, 14] },
  { id: 'a_drill', name: 'Drillmaster', desc: (n) => `Train ${n} troops`, value: (s) => s.stats.troopsTrained, tiers: [500, 10_000, 100_000] },
  { id: 'a_harvest', name: 'Bountiful Fields', desc: (n) => `Harvest ${n} times`, value: (s) => s.stats.collections, tiers: [25, 250, 1500] },
  { id: 'a_gather', name: 'Caravan Master', desc: (n) => `Gather ${n} resources on the map`, value: (s) => s.stats.gathered, tiers: [50_000, 1_000_000, 10_000_000] },
  { id: 'a_scholar', name: 'Sage of the Academy', desc: (n) => `Complete ${n} research`, value: (s) => s.stats.researchDone, tiers: [5, 25, 60] },
  { id: 'a_plunder', name: 'Conqueror', desc: (n, one) => `Plunder ${n} rival ${one ? 'city' : 'cities'}`, value: (s) => s.stats.citiesPlundered, tiers: [1, 10, 50] },
  { id: 'a_holy', name: 'Keeper of Shrines', desc: (n, one) => `Capture ${n} Holy ${one ? 'Site' : 'Sites'}`, value: (s) => s.stats.holyCaptured, tiers: [1, 5, 20] },
  { id: 'a_walls', name: 'Unbroken Walls', desc: (n, one) => `Repel ${n} ${one ? 'raid' : 'raids'} on your city`, value: (s) => s.stats.raidsDefended, tiers: [1, 10, 40] },
  { id: 'a_court', name: 'Court of Legends', desc: (n, one) => `Recruit ${n} ${one ? 'commander' : 'commanders'}`, value: (s) => Object.values(s.commanders).filter((c) => c.unlocked).length, tiers: [3, 5, 6] },
  { id: 'a_fortune', name: 'Fortune’s Favour', desc: (n, one) => `Open ${n} tavern ${one ? 'chest' : 'chests'}`, value: (s) => s.stats.chestsOpened, tiers: [5, 50, 200] },
  { id: 'a_loyal', name: 'Loyal Governor', desc: (n) => `Claim ${n} daily gifts`, value: (s) => (s.login ? s.login.cycles * 7 + s.login.claimed : 0), tiers: [7, 30, 100] },
];

/** Tiers already claimed for an achievement (0..3). */
export function claimedTiers(s: GameState, id: string): number {
  return s.achievements?.[id] ?? 0;
}

/** Tiers whose target has been reached (0..3). */
export function reachedTiers(s: GameState, a: AchievementDef): number {
  const v = a.value(s);
  return a.tiers.filter((t) => v >= t).length;
}

export function canClaimAchievement(s: GameState, a: AchievementDef): boolean {
  return reachedTiers(s, a) > claimedTiers(s, a.id);
}

/** Claim the next unclaimed tier. */
export function claimAchievement(s: GameState, id: string): Reward | null {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || !canClaimAchievement(s, a)) return null;
  const tier = claimedTiers(s, id);
  s.achievements = { ...(s.achievements ?? {}), [id]: tier + 1 };
  grantReward(s, TIER_REWARDS[tier]);
  return TIER_REWARDS[tier];
}

export function achievementBadge(s: GameState): number {
  return ACHIEVEMENTS.filter((a) => canClaimAchievement(s, a)).length;
}

/** Medals held, for the profile and the panel header. */
export function medalCount(s: GameState): number {
  return ACHIEVEMENTS.reduce((n, a) => n + claimedTiers(s, a.id), 0);
}
