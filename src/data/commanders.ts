import type { Bonuses, TroopType } from './types';

export type Rarity = 'legendary' | 'epic';

export interface SkillDef {
  name: string;
  /** Description template; `{v}` is replaced with the level value. */
  desc: string;
  /** Value per skill level (index 0 = level 1). */
  values: number[];
  /** active skills fire at 1000 rage; passives grant bonuses */
  kind: 'active' | 'passive';
  /** for passives: which bonus key the value feeds */
  bonus?: keyof Bonuses;
  /** for passives: only applies to marches containing this commander (default) vs city-wide */
  cityWide?: boolean;
  /** for actives: extra effect */
  effect?: 'damage' | 'heal' | 'rally';
}

export interface CommanderDef {
  id: string;
  name: string;
  title: string;
  rarity: Rarity;
  portrait: string;
  specialties: string[];
  troopType?: TroopType;
  skills: SkillDef[];
  /** obtainable from tavern chests? starting commanders are granted directly */
  start?: boolean;
}

export const COMMANDERS: CommanderDef[] = [
  {
    id: 'boudica', name: 'Boudica', title: 'Queen of the Iceni', rarity: 'epic', portrait: 'cmd_boudica',
    specialties: ['Peacekeeping', 'Integration'], start: true,
    skills: [
      { kind: 'active', effect: 'damage', name: 'Iceni War-Chant', desc: 'Deals {v} direct damage to the target.', values: [300, 400, 500, 650, 800] },
      { kind: 'passive', bonus: 'barbDamage', name: 'Bane of Rome', desc: '+{v}% damage dealt to barbarians.', values: [0.08, 0.12, 0.16, 0.2, 0.25] },
      { kind: 'passive', bonus: 'allHp', name: 'Battle Fury', desc: '+{v}% troop health.', values: [0.04, 0.06, 0.08, 0.1, 0.12] },
      { kind: 'passive', bonus: 'marchSpeed', name: 'Warpath', desc: '+{v}% march speed.', values: [0.05, 0.08, 0.11, 0.15, 0.2] },
    ],
  },
  {
    id: 'suntzu', name: 'Sun Tzu', title: 'Master Strategist', rarity: 'legendary', portrait: 'cmd_suntzu',
    specialties: ['Infantry', 'Skill', 'Garrison'], troopType: 'infantry', start: true,
    skills: [
      { kind: 'active', effect: 'damage', name: 'Thirteen Chapters', desc: 'Deals {v} direct damage to the target.', values: [450, 550, 700, 850, 1000] },
      { kind: 'passive', bonus: 'infantryDef', name: 'Know Thy Enemy', desc: '+{v}% infantry defense.', values: [0.05, 0.08, 0.11, 0.14, 0.18] },
      { kind: 'passive', bonus: 'skillDamage', name: 'Strategic Mind', desc: '+{v}% skill damage.', values: [0.05, 0.08, 0.12, 0.16, 0.2] },
      { kind: 'passive', bonus: 'researchSpeed', cityWide: true, name: 'Sage Counsel', desc: '+{v}% research speed (city-wide).', values: [0.03, 0.05, 0.07, 0.09, 0.12] },
    ],
  },
  {
    id: 'cleopatra', name: 'Cleopatra', title: 'Pharaoh of the Nile', rarity: 'epic', portrait: 'cmd_cleopatra',
    specialties: ['Gathering', 'Support'],
    skills: [
      { kind: 'active', effect: 'heal', name: 'Lotus of the Delta', desc: 'Restores {v} worth of troops in battle.', values: [200, 260, 330, 400, 500] },
      { kind: 'passive', bonus: 'gatherSpeed', name: 'Royal Treasury', desc: '+{v}% gathering speed.', values: [0.1, 0.15, 0.2, 0.25, 0.3] },
      { kind: 'passive', bonus: 'load', name: 'Laden Caravans', desc: '+{v}% troop load.', values: [0.08, 0.12, 0.16, 0.2, 0.25] },
      { kind: 'passive', bonus: 'goldProd', cityWide: true, name: 'Ptolemaic Mint', desc: '+{v}% gold production (city-wide).', values: [0.05, 0.08, 0.11, 0.15, 0.2] },
    ],
  },
  {
    id: 'joan', name: 'Joan of Arc', title: 'Maid of Orleans', rarity: 'legendary', portrait: 'cmd_joan',
    specialties: ['Support', 'Peacekeeping'],
    skills: [
      { kind: 'active', effect: 'rally', name: 'Oriflamme', desc: 'Inspires troops: +{v}% attack for 3 rounds and deals light damage.', values: [0.15, 0.18, 0.22, 0.26, 0.3] },
      { kind: 'passive', bonus: 'allAtk', name: 'Standard of Orléans', desc: '+{v}% troop attack.', values: [0.04, 0.06, 0.08, 0.1, 0.12] },
      { kind: 'passive', bonus: 'barbDamage', name: 'Siege-Breaker', desc: '+{v}% damage dealt to barbarians.', values: [0.05, 0.08, 0.11, 0.14, 0.18] },
      { kind: 'passive', bonus: 'healSpeed', cityWide: true, name: 'Saintly Care', desc: '+{v}% healing speed (city-wide).', values: [0.05, 0.08, 0.11, 0.15, 0.2] },
    ],
  },
  {
    id: 'caesar', name: 'Julius Caesar', title: 'Conqueror of Gaul', rarity: 'legendary', portrait: 'cmd_caesar',
    specialties: ['Infantry', 'Conquering', 'Versatility'], troopType: 'infantry',
    skills: [
      { kind: 'active', effect: 'damage', name: 'Crossing the Rubicon', desc: 'Deals {v} direct damage to the target.', values: [600, 750, 900, 1100, 1300] },
      { kind: 'passive', bonus: 'infantryAtk', name: 'Legion Discipline', desc: '+{v}% infantry attack.', values: [0.06, 0.09, 0.12, 0.15, 0.2] },
      { kind: 'passive', bonus: 'allDef', name: 'Testudo', desc: '+{v}% troop defense.', values: [0.04, 0.06, 0.08, 0.1, 0.12] },
      { kind: 'passive', bonus: 'troopCapacity', name: 'Dictator Perpetuo', desc: '+{v}% troop capacity.', values: [0.05, 0.08, 0.11, 0.14, 0.18] },
    ],
  },
  {
    id: 'khan', name: 'Batu Khan', title: 'Storm of the Steppe', rarity: 'legendary', portrait: 'cmd_khan',
    specialties: ['Cavalry', 'Mobility', 'Conquering'], troopType: 'cavalry',
    skills: [
      { kind: 'active', effect: 'damage', name: 'Tumen Charge', desc: 'Deals {v} direct damage to the target.', values: [550, 700, 850, 1000, 1200] },
      { kind: 'passive', bonus: 'cavalryAtk', name: 'Horse Archers', desc: '+{v}% cavalry attack.', values: [0.06, 0.09, 0.12, 0.15, 0.2] },
      { kind: 'passive', bonus: 'marchSpeed', name: 'Endless Steppe', desc: '+{v}% march speed.', values: [0.1, 0.14, 0.18, 0.22, 0.3] },
      { kind: 'passive', bonus: 'cavalryHp', name: 'Iron Riders', desc: '+{v}% cavalry health.', values: [0.04, 0.06, 0.08, 0.1, 0.12] },
    ],
  },
];

export const COMMANDER_BY_ID: Record<string, CommanderDef> = Object.fromEntries(
  COMMANDERS.map((c) => [c.id, c]),
);

export const MAX_STARS = 6;
export const MAX_SKILL_LEVEL = 5;
/** Insignia needed to unlock a commander you have not recruited yet. */
export const UNLOCK_SCULPTURES: Record<Rarity, number> = { epic: 10, legendary: 10 };

export function levelCapForStars(stars: number): number {
  return [10, 20, 30, 40, 50, 60][Math.max(0, Math.min(5, stars - 1))];
}

export function xpToNext(level: number): number {
  return Math.round(120 * Math.pow(level, 1.75));
}

/** Insignia needed to raise a skill from `currentLevel` (0 = locked) to the next. */
export function skillUpgradeCost(currentLevel: number): number {
  return [10, 10, 20, 30, 40][currentLevel] ?? 0;
}

/** Insignia + gold needed to raise stars from `stars` to `stars + 1`. */
export function starUpgradeCost(stars: number): { sculptures: number; gold: number } {
  return { sculptures: [5, 10, 20, 30, 50][stars - 1] ?? 0, gold: [2000, 8000, 30000, 90000, 250000][stars - 1] ?? 0 };
}

export function commanderTroopCapacity(level: number): number {
  return 2000 + level * 250;
}

export function commanderPower(level: number, stars: number, skillLevels: number[]): number {
  return level * 60 + stars * 400 + skillLevels.reduce((a, b) => a + b * 150, 0);
}

export function skillText(skill: SkillDef, level: number): string {
  const lv = Math.max(1, level);
  const v = skill.values[lv - 1];
  const shown = v < 1 ? `${Math.round(v * 100)}` : `${v}`;
  return skill.desc.replace('{v}', shown);
}
