import type { BuildingType } from './buildings';

export interface Plot {
  id: string;
  type: BuildingType;
  /** top-left tile of the footprint on the isometric city grid */
  gx: number;
  gy: number;
  /** overrides the building's own unlock level (for 2nd farm etc.) */
  unlockCH?: number;
}

export const CITY_GRID = 28;

export const PLOTS: Plot[] = [
  { id: 'city_hall', type: 'city_hall', gx: 12, gy: 12 },
  { id: 'wall', type: 'wall', gx: 13, gy: 23 },
  { id: 'barracks', type: 'barracks', gx: 7, gy: 15 },
  { id: 'archery_range', type: 'archery_range', gx: 7, gy: 10 },
  { id: 'stable', type: 'stable', gx: 11, gy: 6 },
  { id: 'siege_workshop', type: 'siege_workshop', gx: 16, gy: 6 },
  { id: 'academy', type: 'academy', gx: 18, gy: 11 },
  { id: 'hospital', type: 'hospital', gx: 18, gy: 16 },
  { id: 'tavern', type: 'tavern', gx: 13, gy: 18 },
  { id: 'scout_camp', type: 'scout_camp', gx: 21, gy: 8 },
  { id: 'storehouse', type: 'storehouse', gx: 9, gy: 19 },
  { id: 'farm_1', type: 'farm', gx: 4, gy: 19 },
  { id: 'farm_2', type: 'farm', gx: 4, gy: 15, unlockCH: 3 },
  { id: 'lumber_mill_1', type: 'lumber_mill', gx: 19, gy: 20 },
  { id: 'lumber_mill_2', type: 'lumber_mill', gx: 22, gy: 16, unlockCH: 3 },
  { id: 'quarry_1', type: 'quarry', gx: 21, gy: 4 },
  { id: 'quarry_2', type: 'quarry', gx: 22, gy: 12, unlockCH: 9 },
  { id: 'gold_mine_1', type: 'gold_mine', gx: 4, gy: 7 },
  { id: 'farm_3', type: 'farm', gx: 4, gy: 11, unlockCH: 8 },
];

export const PLOT_BY_ID: Record<string, Plot> = Object.fromEntries(PLOTS.map((p) => [p.id, p]));
