import type { Cost, ResKey, TroopType } from './types';

export type BuildingType =
  | 'city_hall'
  | 'wall'
  | 'barracks'
  | 'archery_range'
  | 'stable'
  | 'siege_workshop'
  | 'farm'
  | 'lumber_mill'
  | 'quarry'
  | 'gold_mine'
  | 'academy'
  | 'hospital'
  | 'storehouse'
  | 'scout_camp'
  | 'tavern';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  sprite: string;
  desc: string;
  unlockCH: number;
  /** footprint in tiles (square) */
  size: number;
  /** cost multipliers relative to the base cost curve */
  costWeight: Cost;
  timeWeight: number;
  producer?: ResKey;
  trains?: TroopType;
}

export const MAX_LEVEL = 25;

/** Buildings are repainted at these levels (Lv 1–9, 10–19, 20–25). */
export const TIER_LEVELS = [10, 20] as const;

export function buildingTier(level: number): 1 | 2 | 3 {
  return level >= TIER_LEVELS[1] ? 3 : level >= TIER_LEVELS[0] ? 2 : 1;
}

/** The sprite a building shows at a given level. */
export function spriteFor(type: BuildingType, level: number): string {
  const base = BUILDINGS[type].sprite;
  const tier = buildingTier(level);
  return tier === 1 ? base : `${base}_t${tier}`;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  city_hall: {
    type: 'city_hall', name: 'City Hall', sprite: 'city_hall', size: 4, unlockCH: 1,
    desc: 'The heart of your kingdom. Its level caps every other building and unlocks new structures, march slots and troop tiers.',
    costWeight: { food: 1.6, wood: 1.6, stone: 1.0, gold: 0.6 }, timeWeight: 2.2,
  },
  wall: {
    type: 'wall', name: 'City Wall', sprite: 'watchtower', size: 2, unlockCH: 2,
    desc: 'Fortifications that grant your garrison bonus defense when barbarian warbands raid the city.',
    costWeight: { food: 0.8, wood: 1.2, stone: 1.2 }, timeWeight: 1.6,
  },
  barracks: {
    type: 'barracks', name: 'Barracks', sprite: 'barracks', size: 3, unlockCH: 1, trains: 'infantry',
    desc: 'Trains infantry: sturdy line-holders that excel against cavalry.',
    costWeight: { food: 1, wood: 1 }, timeWeight: 1.2,
  },
  archery_range: {
    type: 'archery_range', name: 'Archery Range', sprite: 'archery_range', size: 3, unlockCH: 2, trains: 'archer',
    desc: 'Trains archers: deadly ranged troops that shred infantry formations.',
    costWeight: { food: 1, wood: 1 }, timeWeight: 1.2,
  },
  stable: {
    type: 'stable', name: 'Stable', sprite: 'stable', size: 3, unlockCH: 3, trains: 'cavalry',
    desc: 'Trains cavalry: swift shock troops that ride down archers.',
    costWeight: { food: 1, wood: 1 }, timeWeight: 1.2,
  },
  siege_workshop: {
    type: 'siege_workshop', name: 'Siege Workshop', sprite: 'siege_workshop', size: 3, unlockCH: 6, trains: 'siege',
    desc: 'Builds siege engines with heavy load capacity and devastating attack power.',
    costWeight: { food: 1, wood: 1.2, stone: 0.4 }, timeWeight: 1.3,
  },
  farm: {
    type: 'farm', name: 'Farm', sprite: 'farm', size: 2, unlockCH: 1, producer: 'food',
    desc: 'Produces food over time. Tap the harvest bubble to collect.',
    costWeight: { wood: 0.6 }, timeWeight: 0.6,
  },
  lumber_mill: {
    type: 'lumber_mill', name: 'Lumber Mill', sprite: 'lumber_mill', size: 2, unlockCH: 1, producer: 'wood',
    desc: 'Produces wood over time. Tap the harvest bubble to collect.',
    costWeight: { food: 0.6 }, timeWeight: 0.6,
  },
  quarry: {
    type: 'quarry', name: 'Quarry', sprite: 'quarry', size: 2, unlockCH: 4, producer: 'stone',
    desc: 'Produces stone over time. Required for advanced buildings.',
    costWeight: { food: 0.6, wood: 0.6 }, timeWeight: 0.7,
  },
  gold_mine: {
    type: 'gold_mine', name: 'Goldmine', sprite: 'gold_mine', size: 2, unlockCH: 7, producer: 'gold',
    desc: 'Produces gold over time. Gold funds research and elite troops.',
    costWeight: { food: 0.6, wood: 0.6, stone: 0.4 }, timeWeight: 0.8,
  },
  academy: {
    type: 'academy', name: 'Academy', sprite: 'academy', size: 3, unlockCH: 3,
    desc: 'Research economic and military technologies. Higher levels unlock deeper research.',
    costWeight: { food: 1, wood: 1, stone: 0.3 }, timeWeight: 1.3,
  },
  hospital: {
    type: 'hospital', name: 'Hospital', sprite: 'hospital', size: 2, unlockCH: 2,
    desc: 'Shelters severely wounded troops so they can be healed instead of dying.',
    costWeight: { food: 0.8, wood: 0.8 }, timeWeight: 0.9,
  },
  storehouse: {
    type: 'storehouse', name: 'Storehouse', sprite: 'storehouse', size: 2, unlockCH: 5,
    desc: 'Increases how much each resource building can hold before it must be harvested, and protects resources from raids.',
    costWeight: { food: 0.8, wood: 0.8, stone: 0.4 }, timeWeight: 0.9,
  },
  scout_camp: {
    type: 'scout_camp', name: 'Scout Camp', sprite: 'scout_camp', size: 2, unlockCH: 2,
    desc: 'Dispatch scouts to gather intelligence on enemy cities and strongholds. Higher levels make scouts faster.',
    costWeight: { food: 0.7, wood: 0.7 }, timeWeight: 0.8,
  },
  tavern: {
    type: 'tavern', name: 'Tavern', sprite: 'tavern', size: 2, unlockCH: 1,
    desc: 'Open silver and gold chests to recruit commanders and earn sculptures.',
    costWeight: { food: 0.6, wood: 0.6 }, timeWeight: 0.8,
  },
};

const BASE_COST = 160;
const COST_GROWTH = 1.52;
const BASE_TIME = 8; // seconds for level 1
const TIME_GROWTH = 1.5;

export function upgradeCost(type: BuildingType, toLevel: number): Cost {
  const def = BUILDINGS[type];
  const scale = BASE_COST * Math.pow(COST_GROWTH, toLevel - 1);
  const out: Cost = {};
  for (const k in def.costWeight) {
    const key = k as ResKey;
    // gold only kicks in mid-game so early upgrades stay accessible
    if (key === 'gold' && toLevel < 8) continue;
    if (key === 'stone' && toLevel < 4) continue;
    out[key] = Math.round((scale * (def.costWeight[key] ?? 0)) / 10) * 10;
  }
  return out;
}

/** Base upgrade duration in seconds, before build-speed bonuses. */
export function upgradeTime(type: BuildingType, toLevel: number): number {
  return Math.round(BASE_TIME * BUILDINGS[type].timeWeight * Math.pow(TIME_GROWTH, toLevel - 1));
}

/** Units produced per hour by a resource building. */
export function productionPerHour(level: number): number {
  if (level <= 0) return 0;
  return Math.round(2000 + 900 * (level - 1) + 60 * level * level);
}

/** How long (in hours of production) a resource building can hold before it is full. */
export function producerCapacity(level: number, storehouseLevel: number): number {
  return Math.round(productionPerHour(level) * (2 + storehouseLevel * 0.25));
}

export function trainingCapacity(level: number): number {
  return level <= 0 ? 0 : 50 + level * 40;
}

export function hospitalCapacity(level: number): number {
  return level <= 0 ? 0 : 2000 + level * 1500;
}

export function wallDefense(level: number): number {
  return level * 0.03;
}

/** Highest troop tier a training building of this level can produce. */
export function maxTierForLevel(level: number): number {
  if (level >= 22) return 5;
  if (level >= 16) return 4;
  if (level >= 10) return 3;
  if (level >= 5) return 2;
  return level >= 1 ? 1 : 0;
}

export function marchSlots(cityHallLevel: number): number {
  return Math.min(5, 1 + Math.floor(cityHallLevel / 5));
}

export function buildingPower(level: number): number {
  return Math.round(level * level * 18);
}
