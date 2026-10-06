import type { ResKey } from '../data/types';
import { RES_KEYS } from '../data/types';
import { Rng } from './rng';
import type { Troops, WorldObj } from './state';

const SIZE = 120;
const CENTER = 60;

const AI_NAMES = [
  'Lord Aldric', 'Queen Sigrun', 'Duke Ravenholt', 'Baroness Maeve', 'Khan Temur',
  'Count Lucan', 'Shogun Akira', 'Jarl Eirik', 'Sultan Rashid', 'Lady Isolde',
];

const HOLY_BUFFS = [
  { key: 'allAtk', value: 0.05, label: '+5% troop attack' },
  { key: 'gatherSpeed', value: 0.15, label: '+15% gathering speed' },
  { key: 'buildSpeed', value: 0.1, label: '+10% building speed' },
];

export function barbarianTroops(level: number): Troops {
  const n = Math.round(350 * Math.pow(1.55, level - 1));
  const tier = Math.min(5, 1 + Math.floor((level - 1) / 3));
  return {
    [`infantry_${tier}`]: Math.round(n * 0.4),
    [`archer_${tier}`]: Math.round(n * 0.3),
    [`cavalry_${tier}`]: Math.round(n * 0.3),
  };
}

export function fortTroops(level: number): Troops {
  const n = Math.round(4000 * Math.pow(1.6, level - 1));
  const tier = Math.min(5, 1 + level);
  return {
    [`infantry_${tier}`]: Math.round(n * 0.45),
    [`archer_${tier}`]: Math.round(n * 0.3),
    [`cavalry_${tier}`]: Math.round(n * 0.25),
  };
}

export function aiCityTroops(level: number): Troops {
  const n = Math.round(800 * Math.pow(1.35, level - 1));
  const tier = Math.min(5, 1 + Math.floor(level / 4));
  return {
    [`infantry_${tier}`]: Math.round(n * 0.4),
    [`archer_${tier}`]: Math.round(n * 0.3),
    [`cavalry_${tier}`]: Math.round(n * 0.2),
    [`siege_${tier}`]: Math.round(n * 0.1),
  };
}

export function holyTroops(): Troops {
  return { infantry_3: 5000, archer_3: 4000, cavalry_3: 3000 };
}

export function nodeAmount(level: number, res: ResKey): number {
  const base = { food: 24000, wood: 24000, stone: 16000, gold: 9000 }[res];
  return Math.round(base * (1 + (level - 1) * 0.7));
}

function levelByDistance(rng: Rng, x: number, y: number, max: number): number {
  const d = Math.hypot(x - CENTER, y - CENTER);
  return Math.max(1, Math.min(max, Math.round(d / 9 + rng.float() * 2 - 0.5)));
}

/** Find a random free tile at least `gap` tiles away from every placed object. */
function freeSpot(rng: Rng, placed: WorldObj[], gap: number, minDist = 4): { x: number; y: number } {
  for (let tries = 0; tries < 400; tries++) {
    const x = rng.int(3, SIZE - 4);
    const y = rng.int(3, SIZE - 4);
    if (Math.hypot(x - CENTER, y - CENTER) < minDist) continue;
    let ok = true;
    for (const o of placed) {
      const g = o.kind === 'deco' ? Math.max(gap, 3) : gap;
      if (Math.abs(o.x - x) < g && Math.abs(o.y - y) < g) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, y };
  }
  return { x: rng.int(3, SIZE - 4), y: rng.int(3, SIZE - 4) };
}

export function generateWorld(seed: number): WorldObj[] {
  const rng = new Rng(seed);
  const objs: WorldObj[] = [];
  let id = 0;
  const nid = (p: string) => `${p}${++id}`;

  // scenery first so gameplay objects avoid it
  const decos: ('mountain' | 'forest' | 'lake')[] = ['mountain', 'forest', 'lake'];
  for (let i = 0; i < 70; i++) {
    const deco = i < 20 ? 'mountain' : i < 55 ? 'forest' : rng.pick(decos);
    const p = freeSpot(rng, objs, 4, 7);
    objs.push({ id: nid('d'), kind: 'deco', deco, x: p.x, y: p.y, level: 0 });
  }
  for (let i = 0; i < 4; i++) {
    const p = freeSpot(rng, objs, 5, 25);
    objs.push({ id: nid('d'), kind: 'deco', deco: 'pass', x: p.x, y: p.y, level: 0 });
  }

  for (let i = 0; i < 3; i++) {
    const p = freeSpot(rng, objs, 6, 22);
    objs.push({
      id: nid('h'), kind: 'holy', x: p.x, y: p.y, level: 1, name: ['Shrine of War', 'Shrine of Plenty', 'Shrine of Masons'][i],
      troops: holyTroops(), buff: HOLY_BUFFS[i],
    });
  }

  for (let i = 0; i < 9; i++) {
    const p = freeSpot(rng, objs, 5, 12);
    const level = levelByDistance(rng, p.x, p.y, 15) + 1;
    objs.push({
      id: nid('c'), kind: 'city', x: p.x, y: p.y, level, name: AI_NAMES[i],
      troops: aiCityTroops(level),
      loot: { food: 20000 * level, wood: 20000 * level, stone: 6000 * level, gold: 2500 * level },
      power: 0,
    });
  }

  for (let i = 0; i < 6; i++) {
    const p = freeSpot(rng, objs, 4, 15);
    const level = Math.max(1, Math.min(5, Math.round(levelByDistance(rng, p.x, p.y, 10) / 2)));
    objs.push({ id: nid('f'), kind: 'fort', x: p.x, y: p.y, level, troops: fortTroops(level) });
  }

  for (let i = 0; i < 90; i++) {
    const p = freeSpot(rng, objs, 2, 4);
    const level = levelByDistance(rng, p.x, p.y, 10);
    objs.push({ id: nid('b'), kind: 'barbarian', x: p.x, y: p.y, level, troops: barbarianTroops(level) });
  }

  for (let i = 0; i < 70; i++) {
    const p = freeSpot(rng, objs, 2, 4);
    const res = RES_KEYS[i % 4];
    const level = Math.max(1, Math.min(6, Math.round(levelByDistance(rng, p.x, p.y, 12) / 2)));
    const amount = nodeAmount(level, res);
    objs.push({ id: nid('n'), kind: 'node', x: p.x, y: p.y, level, res, amount, maxAmount: amount });
  }

  return objs;
}

/** Move a defeated/depleted object to a fresh location and reset it. */
export function respawnObject(obj: WorldObj, all: WorldObj[], rng: Rng): void {
  const others = all.filter((o) => o !== obj);
  const p = freeSpot(rng, others, 2, 4);
  obj.x = p.x;
  obj.y = p.y;
  obj.respawnAt = undefined;
  obj.occupiedBy = undefined;
  if (obj.kind === 'barbarian') {
    obj.level = levelByDistance(rng, p.x, p.y, 10);
    obj.troops = barbarianTroops(obj.level);
  } else if (obj.kind === 'node' && obj.res) {
    obj.level = Math.max(1, Math.min(6, Math.round(levelByDistance(rng, p.x, p.y, 12) / 2)));
    obj.amount = nodeAmount(obj.level, obj.res);
    obj.maxAmount = obj.amount;
  } else if (obj.kind === 'fort') {
    obj.troops = fortTroops(obj.level);
  }
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
