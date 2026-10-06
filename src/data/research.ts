import type { BonusKey, Cost } from './types';

export interface TechDef {
  id: string;
  name: string;
  tree: 'economy' | 'military';
  icon: string;
  desc: string;
  bonus: BonusKey;
  perLevel: number;
  maxLevel: number;
  academyLevel: number;
  requires: string[];
  /** column / row in the tech tree grid */
  col: number;
  row: number;
}

export const TECHS: TechDef[] = [
  // Economy
  { id: 'irrigation', name: 'Irrigation', tree: 'economy', icon: '🌾', desc: 'Food production', bonus: 'foodProd', perLevel: 0.05, maxLevel: 5, academyLevel: 1, requires: [], col: 0, row: 0 },
  { id: 'handsaw', name: 'Handsaw', tree: 'economy', icon: '🪚', desc: 'Wood production', bonus: 'woodProd', perLevel: 0.05, maxLevel: 5, academyLevel: 1, requires: [], col: 0, row: 1 },
  { id: 'masonry', name: 'Masonry', tree: 'economy', icon: '🧱', desc: 'Building speed', bonus: 'buildSpeed', perLevel: 0.03, maxLevel: 5, academyLevel: 2, requires: ['irrigation'], col: 1, row: 0 },
  { id: 'wheel', name: 'The Wheel', tree: 'economy', icon: '☸️', desc: 'Gathering speed', bonus: 'gatherSpeed', perLevel: 0.05, maxLevel: 5, academyLevel: 2, requires: ['handsaw'], col: 1, row: 1 },
  { id: 'quarrying', name: 'Quarrying', tree: 'economy', icon: '⛏️', desc: 'Stone production', bonus: 'stoneProd', perLevel: 0.05, maxLevel: 5, academyLevel: 3, requires: ['masonry'], col: 2, row: 0 },
  { id: 'writing', name: 'Writing', tree: 'economy', icon: '📜', desc: 'Research speed', bonus: 'researchSpeed', perLevel: 0.04, maxLevel: 5, academyLevel: 3, requires: ['masonry', 'wheel'], col: 2, row: 1 },
  { id: 'metallurgy', name: 'Metallurgy', tree: 'economy', icon: '🪙', desc: 'Gold production', bonus: 'goldProd', perLevel: 0.05, maxLevel: 5, academyLevel: 5, requires: ['quarrying'], col: 3, row: 0 },
  { id: 'carriage', name: 'Carriage', tree: 'economy', icon: '🛒', desc: 'Troop load', bonus: 'load', perLevel: 0.06, maxLevel: 5, academyLevel: 5, requires: ['writing'], col: 3, row: 1 },
  { id: 'mathematics', name: 'Mathematics', tree: 'economy', icon: '📐', desc: 'Building speed', bonus: 'buildSpeed', perLevel: 0.04, maxLevel: 5, academyLevel: 8, requires: ['metallurgy', 'carriage'], col: 4, row: 0 },
  { id: 'cartography', name: 'Cartography', tree: 'economy', icon: '🗺️', desc: 'Gathering speed', bonus: 'gatherSpeed', perLevel: 0.06, maxLevel: 5, academyLevel: 8, requires: ['carriage'], col: 4, row: 1 },
  // Military
  { id: 'discipline', name: 'Military Discipline', tree: 'military', icon: '🛡️', desc: 'Infantry defense', bonus: 'infantryDef', perLevel: 0.03, maxLevel: 5, academyLevel: 1, requires: [], col: 0, row: 0 },
  { id: 'archery', name: 'Archery', tree: 'military', icon: '🏹', desc: 'Archer attack', bonus: 'archerAtk', perLevel: 0.03, maxLevel: 5, academyLevel: 1, requires: [], col: 0, row: 1 },
  { id: 'horsemanship', name: 'Horsemanship', tree: 'military', icon: '🐎', desc: 'Cavalry attack', bonus: 'cavalryAtk', perLevel: 0.03, maxLevel: 5, academyLevel: 2, requires: ['archery'], col: 1, row: 1 },
  { id: 'ironworking', name: 'Iron Working', tree: 'military', icon: '⚔️', desc: 'Infantry attack', bonus: 'infantryAtk', perLevel: 0.03, maxLevel: 5, academyLevel: 2, requires: ['discipline'], col: 1, row: 0 },
  { id: 'conscription', name: 'Conscription', tree: 'military', icon: '📯', desc: 'Training speed', bonus: 'trainSpeed', perLevel: 0.05, maxLevel: 5, academyLevel: 3, requires: ['ironworking', 'horsemanship'], col: 2, row: 0 },
  { id: 'healing', name: 'Healing Methods', tree: 'military', icon: '⚕️', desc: 'Hospital capacity', bonus: 'hospitalCapacity', perLevel: 0.1, maxLevel: 5, academyLevel: 3, requires: ['horsemanship'], col: 2, row: 1 },
  { id: 'tactics', name: 'Tactics', tree: 'military', icon: '♟️', desc: 'Troop capacity', bonus: 'troopCapacity', perLevel: 0.04, maxLevel: 5, academyLevel: 5, requires: ['conscription'], col: 3, row: 0 },
  { id: 'logistics', name: 'Logistics', tree: 'military', icon: '🧭', desc: 'March speed', bonus: 'marchSpeed', perLevel: 0.04, maxLevel: 5, academyLevel: 5, requires: ['healing'], col: 3, row: 1 },
  { id: 'siegecraft', name: 'Siegecraft', tree: 'military', icon: '🪨', desc: 'Siege attack', bonus: 'siegeAtk', perLevel: 0.05, maxLevel: 5, academyLevel: 6, requires: ['tactics'], col: 4, row: 0 },
  { id: 'armor', name: 'Plate Armor', tree: 'military', icon: '🥋', desc: 'All troop health', bonus: 'allHp', perLevel: 0.03, maxLevel: 5, academyLevel: 8, requires: ['tactics', 'logistics'], col: 4, row: 1 },
  { id: 'fortification', name: 'Fortification', tree: 'military', icon: '🏰', desc: 'Wall defense', bonus: 'wallDef', perLevel: 0.04, maxLevel: 5, academyLevel: 4, requires: ['discipline'], col: 1, row: 2 },
  { id: 'warfare', name: 'Art of Warfare', tree: 'military', icon: '🔥', desc: 'All troop attack', bonus: 'allAtk', perLevel: 0.03, maxLevel: 5, academyLevel: 10, requires: ['siegecraft', 'armor'], col: 5, row: 0 },
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export function techCost(tech: TechDef, toLevel: number): Cost {
  const tierScale = 1 + tech.col * 0.8;
  const base = 300 * tierScale * Math.pow(1.7, toLevel - 1);
  const cost: Cost = { food: Math.round(base / 10) * 10, wood: Math.round(base / 10) * 10 };
  if (tech.col >= 2) cost.stone = Math.round((base * 0.4) / 10) * 10;
  if (tech.col >= 3 || toLevel >= 4) cost.gold = Math.round((base * 0.3) / 10) * 10;
  return cost;
}

export function techTime(tech: TechDef, toLevel: number): number {
  return Math.round(20 * (1 + tech.col * 0.9) * Math.pow(1.6, toLevel - 1));
}
