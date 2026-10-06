import type { Cost, TroopType } from './types';
import type { BuildingType } from './buildings';

export interface TroopStats {
  atk: number;
  def: number;
  hp: number;
  speed: number;
  load: number;
  power: number;
}

export type TroopId = `${TroopType}_${1 | 2 | 3 | 4 | 5}`;

const BASE: Record<TroopType, Omit<TroopStats, 'power'>> = {
  infantry: { atk: 40, def: 62, hp: 62, speed: 60, load: 10 },
  archer: { atk: 62, def: 40, hp: 50, speed: 60, load: 8 },
  cavalry: { atk: 56, def: 46, hp: 60, speed: 100, load: 6 },
  siege: { atk: 72, def: 30, hp: 42, speed: 40, load: 18 },
};

const TIER_MULT = [1, 1.45, 2.05, 2.9, 4.1];
const TIER_POWER = [1, 2, 4, 8, 14];
const TIER_TIME = [4, 7, 12, 20, 32]; // seconds per unit
const TIER_COST = [50, 100, 160, 260, 400];
export const TIER_NAMES = ['I', 'II', 'III', 'IV', 'V'];

export const TROOP_NAMES: Record<TroopType, string[]> = {
  infantry: ['Militia', 'Swordsman', 'Man-at-Arms', 'Royal Guard', 'Imperial Legion'],
  archer: ['Slinger', 'Bowman', 'Longbowman', 'Ranger', 'Royal Marksman'],
  cavalry: ['Horseman', 'Light Cavalry', 'Knight', 'Royal Knight', 'Paladin'],
  siege: ['Battering Ram', 'Ballista', 'Catapult', 'Trebuchet', 'Royal Bombard'],
};

export const TROOP_SPRITES: Record<TroopType, string> = {
  infantry: 'unit_infantry',
  archer: 'unit_archer',
  cavalry: 'unit_cavalry',
  siege: 'unit_siege',
};

/** Painted art for one troop tier (every tier has its own sprite). */
export function troopSprite(type: TroopType, tier: number): string {
  return `unit_${type}_${tier}`;
}

/** Art for a troop id such as "archer_3". */
export function troopIdSprite(id: string): string {
  const [type, tier] = id.split('_');
  return troopSprite(type as TroopType, Number(tier) || 1);
}

export const TRAINED_AT: Record<TroopType, BuildingType> = {
  infantry: 'barracks',
  archer: 'archery_range',
  cavalry: 'stable',
  siege: 'siege_workshop',
};

export function troopId(type: TroopType, tier: number): TroopId {
  return `${type}_${tier}` as TroopId;
}

export function parseTroopId(id: string): { type: TroopType; tier: number } {
  const [type, tier] = id.split('_');
  return { type: type as TroopType, tier: Number(tier) };
}

export function troopStats(type: TroopType, tier: number): TroopStats {
  const b = BASE[type];
  const m = TIER_MULT[tier - 1];
  return {
    atk: b.atk * m,
    def: b.def * m,
    hp: b.hp * m,
    speed: b.speed,
    load: b.load * (1 + (tier - 1) * 0.35),
    power: TIER_POWER[tier - 1],
  };
}

export function troopName(id: string): string {
  const { type, tier } = parseTroopId(id);
  return TROOP_NAMES[type][tier - 1];
}

export function troopCost(type: TroopType, tier: number): Cost {
  const c = TIER_COST[tier - 1];
  const cost: Cost = { food: c, wood: c };
  if (type === 'siege') cost.wood = Math.round(c * 1.3);
  if (type === 'cavalry') cost.food = Math.round(c * 1.2);
  if (tier >= 3) cost.stone = Math.round(c * 0.4);
  if (tier >= 4) cost.gold = Math.round(c * 0.25);
  return cost;
}

export function troopTime(tier: number): number {
  return TIER_TIME[tier - 1];
}

export function healCost(type: TroopType, tier: number): Cost {
  const c = troopCost(type, tier);
  const out: Cost = {};
  for (const k in c) out[k as keyof Cost] = Math.ceil((c[k as keyof Cost] ?? 0) * 0.35);
  return out;
}

export function healTime(tier: number): number {
  return TIER_TIME[tier - 1] * 0.4;
}

/**
 * Counter triangle: infantry > cavalry > archer > infantry.
 * Returns the damage multiplier for `attacker` hitting `target`.
 */
export function counterMultiplier(attacker: TroopType, target: TroopType): number {
  if (attacker === 'infantry' && target === 'cavalry') return 1.25;
  if (attacker === 'cavalry' && target === 'archer') return 1.25;
  if (attacker === 'archer' && target === 'infantry') return 1.25;
  if (attacker === 'cavalry' && target === 'infantry') return 0.85;
  if (attacker === 'archer' && target === 'cavalry') return 0.85;
  if (attacker === 'infantry' && target === 'archer') return 0.85;
  return 1;
}
