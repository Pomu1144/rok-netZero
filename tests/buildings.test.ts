import { describe, expect, it } from 'vitest';
import { BUILDINGS, MAX_LEVEL, buildingTier, spriteFor, type BuildingType } from '../src/data/buildings';

describe('building tiers', () => {
  it('repaints buildings at Lv 10 and Lv 20', () => {
    expect([1, 9, 10, 19, 20, MAX_LEVEL].map(buildingTier)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(spriteFor('barracks', 3)).toBe('barracks');
    expect(spriteFor('barracks', 12)).toBe('barracks_t2');
    expect(spriteFor('wall', 25)).toBe('watchtower_t3');
  });

  it('ships art for every tier of every building', () => {
    const shipped = new Set(Object.keys(import.meta.glob('../public/assets/*.webp')).map((p) => p.slice('../public/assets/'.length, -'.webp'.length)));
    for (const type of Object.keys(BUILDINGS) as BuildingType[]) {
      for (const lv of [1, 10, 20]) expect(shipped.has(spriteFor(type, lv)), `${type} Lv.${lv}`).toBe(true);
    }
  });
});
