export type ResKey = 'food' | 'wood' | 'stone' | 'gold';
export const RES_KEYS: ResKey[] = ['food', 'wood', 'stone', 'gold'];
export type Cost = Partial<Record<ResKey, number>>;

export type TroopType = 'infantry' | 'archer' | 'cavalry' | 'siege';
export const TROOP_TYPES: TroopType[] = ['infantry', 'archer', 'cavalry', 'siege'];

/** Every numeric bonus in the game is one of these keys; values are fractions (0.1 = +10%). */
export type BonusKey =
  | 'buildSpeed'
  | 'researchSpeed'
  | 'trainSpeed'
  | 'healSpeed'
  | 'foodProd'
  | 'woodProd'
  | 'stoneProd'
  | 'goldProd'
  | 'gatherSpeed'
  | 'load'
  | 'marchSpeed'
  | 'troopCapacity'
  | 'hospitalCapacity'
  | 'allAtk'
  | 'allDef'
  | 'allHp'
  | 'infantryAtk'
  | 'infantryDef'
  | 'infantryHp'
  | 'archerAtk'
  | 'archerDef'
  | 'archerHp'
  | 'cavalryAtk'
  | 'cavalryDef'
  | 'cavalryHp'
  | 'siegeAtk'
  | 'siegeDef'
  | 'siegeHp'
  | 'barbDamage'
  | 'skillDamage'
  | 'wallDef';

export type Bonuses = Partial<Record<BonusKey, number>>;

export function addBonuses(into: Bonuses, from: Bonuses, scale = 1): Bonuses {
  for (const k in from) {
    const key = k as BonusKey;
    into[key] = (into[key] ?? 0) + (from[key] ?? 0) * scale;
  }
  return into;
}
