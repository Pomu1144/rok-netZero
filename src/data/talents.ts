import type { BonusKey, TroopType } from './types';

/**
 * Commander talent trees. Every commander has three trees: one for their troop
 * speciality (or general Leadership), Warfare and Logistics. A commander earns one
 * talent point per level above 1; deeper rows open as points are spent in that tree.
 */

export type TalentIcon = 'i_shield' | 'i_spear' | 'i_swords' | 'i_horse' | 'i_bow' | 't_armor' | 'i_flame' | 'i_star' | 'i_banner' | 'i_crown' | 'i_gather' | 't_cart' | 't_compass' | 'i_hourglass' | 't_knight' | 't_wall';

export interface TalentNode {
  id: string;
  name: string;
  icon: TalentIcon;
  bonus: BonusKey;
  /** bonus per rank */
  per: number;
  max: number;
  /** 0..3; row r opens once ROW_GATE[r] points are spent in the tree */
  row: number;
}

export interface TalentTree {
  id: string;
  name: string;
  kanji: string;
  nodes: TalentNode[];
}

export const ROW_GATE = [0, 5, 10, 16];

function troopTree(type: TroopType | undefined): TalentTree {
  if (!type) {
    return {
      id: 'leadership', name: 'Leadership', kanji: '統',
      nodes: [
        { id: 'ld_atk', name: 'Inspiring Presence', icon: 'i_banner', bonus: 'allAtk', per: 0.008, max: 5, row: 0 },
        { id: 'ld_def', name: 'Steady Hand', icon: 'i_shield', bonus: 'allDef', per: 0.008, max: 5, row: 0 },
        { id: 'ld_hp', name: 'Field Surgeons', icon: 't_armor', bonus: 'allHp', per: 0.01, max: 5, row: 1 },
        { id: 'ld_cap', name: 'Rallying Cry', icon: 'i_crown', bonus: 'troopCapacity', per: 0.01, max: 3, row: 1 },
        { id: 'ld_atk2', name: 'Shared Glory', icon: 'i_star', bonus: 'allAtk', per: 0.015, max: 3, row: 2 },
        { id: 'ld_def2', name: 'Oath of Iron', icon: 't_wall', bonus: 'allDef', per: 0.015, max: 3, row: 2 },
        { id: 'ld_cap2', name: 'Sovereign', icon: 'i_crown', bonus: 'allHp', per: 0.06, max: 1, row: 3 },
      ],
    };
  }
  const T = { infantry: 'Infantry', archer: 'Archery', cavalry: 'Cavalry', siege: 'Siegecraft' }[type];
  const icon: TalentIcon = { infantry: 'i_spear', archer: 'i_bow', cavalry: 'i_horse', siege: 't_knight' }[type] as TalentIcon;
  const k = (s: 'Atk' | 'Def' | 'Hp') => `${type}${s}` as BonusKey;
  const names = {
    infantry: ['Spear Drill', 'Shield Wall', 'Iron Will', 'Close Ranks', 'Phalanx', 'Bulwark', 'Unbreakable'],
    archer: ['Fletching', 'Stakes', 'Hardened', 'Volley Fire', 'Piercing Shot', 'Pavises', 'Rain of Arrows'],
    cavalry: ['Lance Drill', 'Barding', 'Endurance', 'Swift Riders', 'Thundering Charge', 'Warhorses', 'Lord of the Steppe'],
    siege: ['Counterweights', 'Mantlets', 'Oak Frames', 'Sappers', 'Greek Fire', 'Iron Plating', 'Wall Breaker'],
  }[type];
  return {
    id: type, name: T, kanji: { infantry: '歩', archer: '弓', cavalry: '騎', siege: '砲' }[type],
    nodes: [
      { id: `${type}_a1`, name: names[0], icon, bonus: k('Atk'), per: 0.01, max: 5, row: 0 },
      { id: `${type}_d1`, name: names[1], icon: 'i_shield', bonus: k('Def'), per: 0.01, max: 5, row: 0 },
      { id: `${type}_h1`, name: names[2], icon: 't_armor', bonus: k('Hp'), per: 0.012, max: 5, row: 1 },
      { id: `${type}_m1`, name: names[3], icon: type === 'cavalry' ? 'i_horse' : 'i_banner', bonus: type === 'cavalry' ? 'marchSpeed' : 'allDef', per: type === 'cavalry' ? 0.02 : 0.01, max: 3, row: 1 },
      { id: `${type}_a2`, name: names[4], icon: 'i_swords', bonus: k('Atk'), per: 0.02, max: 3, row: 2 },
      { id: `${type}_h2`, name: names[5], icon: 't_wall', bonus: k('Hp'), per: 0.02, max: 3, row: 2 },
      { id: `${type}_cap`, name: names[6], icon: 'i_star', bonus: k('Atk'), per: 0.08, max: 1, row: 3 },
    ],
  };
}

const WARFARE: TalentTree = {
  id: 'warfare', name: 'Warfare', kanji: '戦',
  nodes: [
    { id: 'wf_atk', name: 'Fury', icon: 'i_swords', bonus: 'allAtk', per: 0.008, max: 5, row: 0 },
    { id: 'wf_barb', name: 'Bloodhound', icon: 'i_flame', bonus: 'barbDamage', per: 0.02, max: 5, row: 0 },
    { id: 'wf_skill', name: 'Tactician', icon: 'i_star', bonus: 'skillDamage', per: 0.02, max: 5, row: 1 },
    { id: 'wf_hp', name: 'Vigour', icon: 't_armor', bonus: 'allHp', per: 0.01, max: 3, row: 1 },
    { id: 'wf_atk2', name: 'Onslaught', icon: 'i_spear', bonus: 'allAtk', per: 0.015, max: 3, row: 2 },
    { id: 'wf_barb2', name: 'Huntmaster', icon: 'i_flame', bonus: 'barbDamage', per: 0.04, max: 3, row: 2 },
    { id: 'wf_cap', name: 'Warlord', icon: 'i_crown', bonus: 'skillDamage', per: 0.1, max: 1, row: 3 },
  ],
};

const LOGISTICS: TalentTree = {
  id: 'logistics', name: 'Logistics', kanji: '輜',
  nodes: [
    { id: 'lg_speed', name: 'Swift March', icon: 't_compass', bonus: 'marchSpeed', per: 0.02, max: 5, row: 0 },
    { id: 'lg_load', name: 'Pack Mules', icon: 't_cart', bonus: 'load', per: 0.03, max: 5, row: 0 },
    { id: 'lg_gather', name: 'Foragers', icon: 'i_gather', bonus: 'gatherSpeed', per: 0.03, max: 5, row: 1 },
    { id: 'lg_cap', name: 'Muster', icon: 'i_banner', bonus: 'troopCapacity', per: 0.01, max: 3, row: 1 },
    { id: 'lg_speed2', name: 'Forced March', icon: 'i_hourglass', bonus: 'marchSpeed', per: 0.03, max: 3, row: 2 },
    { id: 'lg_cap2', name: 'Quartermaster', icon: 't_cart', bonus: 'troopCapacity', per: 0.02, max: 3, row: 2 },
    { id: 'lg_cap3', name: 'Grand Host', icon: 'i_crown', bonus: 'troopCapacity', per: 0.06, max: 1, row: 3 },
  ],
};

export function treesFor(troopType: TroopType | undefined): TalentTree[] {
  return [troopTree(troopType), WARFARE, LOGISTICS];
}

export const BONUS_LABEL: Partial<Record<BonusKey, string>> = {
  allAtk: 'troop attack', allDef: 'troop defense', allHp: 'troop health',
  infantryAtk: 'infantry attack', infantryDef: 'infantry defense', infantryHp: 'infantry health',
  archerAtk: 'archer attack', archerDef: 'archer defense', archerHp: 'archer health',
  cavalryAtk: 'cavalry attack', cavalryDef: 'cavalry defense', cavalryHp: 'cavalry health',
  siegeAtk: 'siege attack', siegeDef: 'siege defense', siegeHp: 'siege health',
  barbDamage: 'damage to barbarians', skillDamage: 'skill damage', marchSpeed: 'march speed',
  load: 'troop load', gatherSpeed: 'gathering speed', troopCapacity: 'troop capacity',
};
