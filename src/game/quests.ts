import { buildingLevel, cityHallLevel, grantReward } from './logic';
import type { GameState, Reward } from './state';

export interface QuestDef {
  id: string;
  title: string;
  /** returns [progress, target] */
  check: (s: GameState) => [number, number];
  reward: Reward;
  /** which panel helps complete it */
  hint?: { plot?: string; view?: 'world' | 'commanders' | 'research' | 'tavern' | 'alliance' };
}

const lvl = (type: Parameters<typeof buildingLevel>[1], n: number) => (s: GameState): [number, number] => [buildingLevel(s, type), n];

export const QUESTS: QuestDef[] = [
  { id: 'q_collect', title: 'Harvest your Farm', check: (s) => [s.stats.collections, 1], reward: { res: { food: 2000, wood: 2000 } }, hint: { plot: 'farm_1' } },
  { id: 'q_ch2', title: 'Upgrade Citadel to Lv.2', check: (s) => [cityHallLevel(s), 2], reward: { res: { food: 3000, wood: 3000 }, items: { speed_5m: 2 } }, hint: { plot: 'city_hall' } },
  { id: 'q_barb1', title: 'Defeat a barbarian on the world map', check: (s) => [s.stats.barbsKilled, 1], reward: { res: { food: 4000, wood: 4000 }, items: { tome_500: 2 } }, hint: { view: 'world' } },
  { id: 'q_alliance', title: 'Join an alliance', check: (s) => [s.alliance ? 1 : 0, 1], reward: { res: { gems: 100 }, items: { speed_15m: 2 } }, hint: { view: 'alliance' } },
  { id: 'q_archery', title: 'Build an Archery Range', check: lvl('archery_range', 1), reward: { res: { food: 3000, wood: 3000 } }, hint: { plot: 'archery_range' } },
  { id: 'q_train100', title: 'Train 100 troops', check: (s) => [s.stats.troopsTrained, 100], reward: { res: { food: 5000, wood: 5000 }, items: { speed_15m: 1 } }, hint: { plot: 'barracks' } },
  { id: 'q_wall2', title: 'Upgrade City Wall to Lv.2', check: lvl('wall', 2), reward: { res: { food: 5000, wood: 5000 } }, hint: { plot: 'wall' } },
  { id: 'q_ch3', title: 'Upgrade Citadel to Lv.3', check: (s) => [cityHallLevel(s), 3], reward: { res: { food: 8000, wood: 8000 }, items: { silver_key: 1 } }, hint: { plot: 'city_hall' } },
  { id: 'q_tavern', title: 'Open a chest in the Tavern', check: (s) => [s.stats.chestsOpened, 1], reward: { items: { tome_500: 2 }, res: { gems: 50 } }, hint: { view: 'tavern' } },
  { id: 'q_academy', title: 'Build the Academy', check: lvl('academy', 1), reward: { res: { food: 6000, wood: 6000 } }, hint: { plot: 'academy' } },
  { id: 'q_research', title: 'Complete a research', check: (s) => [s.stats.researchDone, 1], reward: { res: { food: 8000, wood: 8000 }, items: { speed_15m: 1 } }, hint: { view: 'research' } },
  { id: 'q_gather', title: 'Gather 10,000 resources on the map', check: (s) => [s.stats.gathered, 10000], reward: { res: { food: 10000, wood: 10000 } }, hint: { view: 'world' } },
  { id: 'q_barb3', title: 'Defeat a Lv.3 barbarian', check: (s) => [s.stats.maxBarbLevel, 3], reward: { items: { tome_2000: 1, silver_key: 1 } }, hint: { view: 'world' } },
  { id: 'q_ch4', title: 'Upgrade Citadel to Lv.4', check: (s) => [cityHallLevel(s), 4], reward: { res: { food: 15000, wood: 15000, gems: 100 } }, hint: { plot: 'city_hall' } },
  { id: 'q_quarry', title: 'Build a Quarry', check: lvl('quarry', 1), reward: { res: { food: 10000, wood: 10000 }, items: { stone_5k: 2 } }, hint: { plot: 'quarry_1' } },
  { id: 'q_stable', title: 'Upgrade the Stable to Lv.3', check: lvl('stable', 3), reward: { res: { food: 12000, wood: 12000 } }, hint: { plot: 'stable' } },
  { id: 'q_cmd10', title: 'Raise a commander to Lv.10', check: (s) => [Math.max(...Object.values(s.commanders).filter((c) => c.unlocked).map((c) => c.level)), 10], reward: { items: { gold_key: 1 } }, hint: { view: 'commanders' } },
  { id: 'q_train1000', title: 'Train 1,000 troops', check: (s) => [s.stats.troopsTrained, 1000], reward: { res: { food: 20000, wood: 20000 }, items: { speed_60m: 1 } }, hint: { plot: 'barracks' } },
  { id: 'q_raid', title: 'Repel a barbarian raid on your city', check: (s) => [s.stats.raidsDefended, 1], reward: { res: { gems: 150 }, items: { tome_2000: 1 } }, hint: { plot: 'wall' } },
  { id: 'q_ch6', title: 'Upgrade Citadel to Lv.6', check: (s) => [cityHallLevel(s), 6], reward: { res: { food: 40000, wood: 40000, stone: 15000 }, items: { gold_key: 1 } }, hint: { plot: 'city_hall' } },
  { id: 'q_plunder', title: 'Plunder a rival city', check: (s) => [s.stats.citiesPlundered, 1], reward: { res: { gems: 200 } }, hint: { view: 'world' } },
  { id: 'q_barb5', title: 'Defeat a Lv.5 barbarian', check: (s) => [s.stats.maxBarbLevel, 5], reward: { items: { tome_2000: 2, gold_key: 1 } }, hint: { view: 'world' } },
  { id: 'q_ch8', title: 'Upgrade Citadel to Lv.8', check: (s) => [cityHallLevel(s), 8], reward: { res: { food: 80000, wood: 80000, stone: 30000, gold: 10000 } }, hint: { plot: 'city_hall' } },
  { id: 'q_holy', title: 'Capture a Shrine', check: (s) => [s.stats.holyCaptured, 1], reward: { res: { gems: 300 }, items: { gold_key: 2 } }, hint: { view: 'world' } },
  { id: 'q_ch10', title: 'Upgrade Citadel to Lv.10', check: (s) => [cityHallLevel(s), 10], reward: { res: { gems: 500 }, items: { gold_key: 2, speed_60m: 3 } }, hint: { plot: 'city_hall' } },
  { id: 'q_ch15', title: 'Upgrade Citadel to Lv.15', check: (s) => [cityHallLevel(s), 15], reward: { res: { gems: 1000 }, items: { gold_key: 3 } }, hint: { plot: 'city_hall' } },
  { id: 'q_ch25', title: 'Reach Citadel Lv.25 - rule the realm', check: (s) => [cityHallLevel(s), 25], reward: { res: { gems: 5000 } }, hint: { plot: 'city_hall' } },
];

export function questDone(s: GameState, q: QuestDef): boolean {
  const [p, t] = q.check(s);
  return p >= t;
}

/** The next few unclaimed quests, in story order. */
export function activeQuests(s: GameState, n = 4): QuestDef[] {
  return QUESTS.filter((q) => !s.questsClaimed.includes(q.id)).slice(0, n);
}

export function claimQuest(s: GameState, id: string): boolean {
  const q = QUESTS.find((x) => x.id === id);
  if (!q || s.questsClaimed.includes(id) || !questDone(s, q)) return false;
  s.questsClaimed.push(id);
  grantReward(s, q.reward);
  return true;
}
