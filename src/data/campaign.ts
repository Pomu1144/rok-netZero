import type { Troops } from '../game/state';
import type { Reward } from '../game/state';
import type { Bonuses } from './types';

/**
 * The campaign: three chapters of four stages, each with a hand-built enemy army.
 * Bosses lead with a real commander's skill kit so their skills cut in during battle.
 */

export interface Stage {
  id: string;
  chapter: number;
  title: string;
  story: string;
  enemy: {
    name: string;
    portrait: string;
    troops: Troops;
    bonuses?: Bonuses;
    /** borrow a commander's skill kit for the boss */
    commander?: { id: string; level: number; skills: number[] };
    barbarian?: boolean;
  };
  reward: Reward;
}

export interface Chapter {
  n: number;
  title: string;
  kanji: string;
  art: string;
  boss: string;
}

export const CHAPTERS: Chapter[] = [
  { n: 1, title: 'The Northern Marches', kanji: '北', art: 'ink/camp_ch1', boss: 'boss_skarn' },
  { n: 2, title: 'The Iron Pass', kanji: '鉄', art: 'ink/camp_ch2', boss: 'boss_malvern' },
  { n: 3, title: 'The Fallen Empire', kanji: '帝', art: 'ink/camp_ch3', boss: 'boss_ysara' },
];

export const STAGES: Stage[] = [
  // ── chapter 1: barbarians burn the northern villages
  {
    id: 'c1s1', chapter: 1, title: 'Smoke over Elmsford',
    story: 'Raiders have fired the village of Elmsford. Drive them from the ashes before they reach the mill.',
    enemy: { name: 'Elmsford raiders', portrait: 'barb_camp', barbarian: true, troops: { infantry_1: 450 } },
    reward: { res: { food: 8000, wood: 8000 }, items: { speed_5m: 2 } },
  },
  {
    id: 'c1s2', chapter: 1, title: 'The Wolf Road',
    story: 'Mounted outriders hunt refugees along the Wolf Road. Archers will not stop horsemen. Spears will.',
    enemy: { name: 'Wolf Road riders', portrait: 'barb_camp', barbarian: true, troops: { cavalry_1: 600, infantry_1: 300 } },
    reward: { res: { food: 12000, wood: 12000 }, items: { tome_500: 2 } },
  },
  {
    id: 'c1s3', chapter: 1, title: 'Frostfang Ford',
    story: 'The warband holds the only ford across the Frostfang. Their slingers rain stones on anyone who wades in.',
    enemy: { name: 'Frostfang warband', portrait: 'barb_fort', barbarian: true, troops: { archer_1: 900, infantry_2: 500 } },
    reward: { res: { stone: 6000, gems: 50 }, items: { speed_15m: 2 } },
  },
  {
    id: 'c1s4', chapter: 1, title: 'Skarn the Burner',
    story: 'Skarn himself waits in the burned hall, his huscarls around him. End the burning of the north.',
    enemy: {
      name: 'Skarn the Burner', portrait: 'boss_skarn', barbarian: true,
      troops: { infantry_2: 1400, cavalry_2: 700, archer_1: 600 },
      commander: { id: 'boudica', level: 12, skills: [3, 2, 1, 0] },
    },
    reward: { res: { gems: 150 }, items: { silver_key: 2, tome_2000: 1 } },
  },
  // ── chapter 2: Lord Malvern's iron fortress bars the mountain pass
  {
    id: 'c2s1', chapter: 2, title: 'Toll of the Iron Pass',
    story: 'Malvern’s tollmen have closed the pass to every caravan. Their pikes are many but their resolve is thin.',
    enemy: { name: 'Pass garrison', portrait: 'city_enemy', troops: { infantry_2: 2200, archer_2: 800 } },
    reward: { res: { food: 30000, wood: 30000, stone: 10000 }, items: { speed_15m: 3 } },
  },
  {
    id: 'c2s2', chapter: 2, title: 'Crossbows in the Rain',
    story: 'Crossbowmen line the cliffs above the road. Charge them before the storm soaks your bowstrings.',
    enemy: { name: 'Cliff crossbowmen', portrait: 'city_enemy', troops: { archer_3: 2400, infantry_2: 900 }, bonuses: { archerDef: 0.1 } },
    reward: { res: { gold: 8000, gems: 80 }, items: { tome_2000: 1 } },
  },
  {
    id: 'c2s3', chapter: 2, title: 'The Black Gate',
    story: 'Rams and ballistae guard the Black Gate itself. Heavy horse will reach the engines before they turn.',
    enemy: { name: 'Black Gate engineers', portrait: 'barb_fort', troops: { siege_3: 1200, infantry_3: 2000, cavalry_2: 600 }, bonuses: { allDef: 0.08 } },
    reward: { res: { stone: 25000, gems: 100 }, items: { speed_60m: 1 } },
  },
  {
    id: 'c2s4', chapter: 2, title: 'Lord Malvern',
    story: 'In his iron keep Lord Malvern draws his sword, and his household knights lower their lances.',
    enemy: {
      name: 'Lord Malvern', portrait: 'boss_malvern',
      troops: { cavalry_3: 3000, infantry_3: 2500, archer_3: 1500 },
      bonuses: { allAtk: 0.08, allDef: 0.08 },
      commander: { id: 'caesar', level: 25, skills: [4, 3, 2, 1] },
    },
    reward: { res: { gems: 300 }, items: { gold_key: 1, speed_60m: 2 } },
  },
  // ── chapter 3: the empress wakes in the ruined capital
  {
    id: 'c3s1', chapter: 3, title: 'Lanterns in the Ruins',
    story: 'Phantoms of the old empire’s guard walk the dead capital by lantern light. They still remember their drills.',
    enemy: { name: 'Lantern guard', portrait: 'city_enemy', troops: { infantry_4: 3500, archer_3: 2500 }, bonuses: { allHp: 0.1 } },
    reward: { res: { food: 80000, wood: 80000, gold: 15000 }, items: { tome_2000: 2 } },
  },
  {
    id: 'c3s2', chapter: 3, title: 'The Dragon Stair',
    story: 'Eight hundred steps climb to the palace, and the empress’s marksmen hold every landing.',
    enemy: { name: 'Stair marksmen', portrait: 'city_enemy', troops: { archer_4: 5000, siege_3: 1500 }, bonuses: { archerAtk: 0.12 } },
    reward: { res: { gems: 200 }, items: { gold_key: 1 } },
  },
  {
    id: 'c3s3', chapter: 3, title: 'Cataphracts of the Court',
    story: 'The imperial cataphracts ride out, horse and rider sheathed in gilded scale.',
    enemy: { name: 'Imperial cataphracts', portrait: 'barb_fort', troops: { cavalry_4: 5000, infantry_4: 2500 }, bonuses: { cavalryDef: 0.15, allAtk: 0.06 } },
    reward: { res: { gems: 250 }, items: { speed_60m: 3, tome_2000: 2 } },
  },
  {
    id: 'c3s4', chapter: 3, title: 'Empress Ysara',
    story: 'On the jade throne the Empress Ysara rises. Win here and the realm is yours by right of conquest.',
    enemy: {
      name: 'Empress Ysara', portrait: 'boss_ysara',
      troops: { infantry_5: 3500, cavalry_5: 3000, archer_5: 3000, siege_4: 1500 },
      bonuses: { allAtk: 0.15, allDef: 0.12, allHp: 0.12 },
      commander: { id: 'khan', level: 40, skills: [5, 4, 3, 3] },
    },
    reward: { res: { gems: 1000 }, items: { gold_key: 3 }, sculptures: { caesar: 10 } },
  },
];

export const STAGE_BY_ID: Record<string, Stage> = Object.fromEntries(STAGES.map((s) => [s.id, s]));
