import type { BuildingType } from '../data/buildings';
import { COMMANDERS } from '../data/commanders';
import type { ItemId } from '../data/items';
import { PLOTS } from '../data/layout';
import type { ResKey, TroopType } from '../data/types';
import { generateWorld } from './world';
import type { AllianceState } from './alliance';

export type Troops = Record<string, number>;

export interface BuildingState {
  type: BuildingType;
  level: number;
  /** game-time ms the producer's storage was last emptied */
  collectedAt: number;
}

export type JobKind = 'build' | 'research' | 'train' | 'heal';

export interface Job {
  id: string;
  kind: JobKind;
  /** plot id for build, tech id for research, troop id for train, 'hospital' for heal */
  target: string;
  start: number;
  end: number;
  /** training/healing amount or target level */
  amount: number;
  troops?: Troops;
  helped?: boolean;
  /** alliance helps still to arrive, and when the next lands */
  helpsLeft?: number;
  helpAt?: number;
  /** time each help removes, fixed when help is requested */
  helpCut?: number;
}

export interface CommanderState {
  id: string;
  unlocked: boolean;
  level: number;
  xp: number;
  stars: number;
  skills: number[];
  sculptures: number;
  /** talent ranks by node id (see data/talents.ts); optional for older saves */
  talents?: Record<string, number>;
}

export type WorldKind = 'barbarian' | 'fort' | 'node' | 'city' | 'holy' | 'deco';

export interface WorldObj {
  id: string;
  kind: WorldKind;
  x: number;
  y: number;
  level: number;
  name?: string;
  res?: ResKey;
  amount?: number;
  maxAmount?: number;
  troops?: Troops;
  /** hidden/defeated objects come back at this game time */
  respawnAt?: number;
  deco?: 'mountain' | 'forest' | 'lake' | 'pass';
  occupiedBy?: string;
  /** stash for AI cities */
  loot?: Partial<Record<ResKey, number>>;
  power?: number;
  /** holy site bonus */
  buff?: { key: string; value: number; label: string };
  heldUntil?: number;
  scoutedAt?: number;
}

export type MarchKind = 'attack' | 'gather' | 'scout';
export type MarchPhase = 'outbound' | 'gathering' | 'returning';

export interface March {
  id: string;
  kind: MarchKind;
  commanderId: string | null;
  troops: Troops;
  targetId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  departAt: number;
  arriveAt: number;
  phase: MarchPhase;
  gatherEnd?: number;
  gatherRate?: number;
  carry: Partial<Record<ResKey, number>>;
  /** troops lightly wounded in PvE: they come home and recover automatically */
  lightWounded: Troops;
}

export interface Report {
  id: string;
  at: number;
  kind: 'battle' | 'gather' | 'scout' | 'raid' | 'system';
  title: string;
  win?: boolean;
  body: ReportBody;
  read: boolean;
}

export interface ReportBody {
  lines: string[];
  attacker?: { name: string; portrait?: string; start: Troops; losses: Troops; remaining: Troops };
  defender?: { name: string; portrait?: string; start: Troops; losses: Troops; remaining: Troops };
  rewards?: Reward;
  timeline?: { a: number; d: number; ca?: string; cd?: string }[];
}

export interface Reward {
  res?: Partial<Record<ResKey | 'gems', number>>;
  items?: Partial<Record<ItemId, number>>;
  xp?: number;
  sculptures?: Record<string, number>;
}

export interface Raid {
  level: number;
  arriveAt: number;
  troops: Troops;
}

export interface GameState {
  version: number;
  seed: number;
  /** game clock in ms (advances at `speed` x real time) */
  time: number;
  speed: number;
  governor: string;
  res: Record<ResKey, number>;
  gems: number;
  ap: number;
  buildings: Record<string, BuildingState>;
  jobs: Job[];
  builders: number;
  troops: Troops;
  wounded: Troops;
  commanders: Record<string, CommanderState>;
  research: Record<string, number>;
  items: Partial<Record<ItemId, number>>;
  marches: March[];
  world: WorldObj[];
  reports: Report[];
  questsClaimed: string[];
  stats: {
    barbsKilled: number;
    maxBarbLevel: number;
    troopsTrained: number;
    gathered: number;
    collections: number;
    researchDone: number;
    citiesPlundered: number;
    holyCaptured: number;
    raidsDefended: number;
    chestsOpened: number;
    /** alliance requests answered (optional for older saves) */
    allyHelps?: number;
  };
  tavern: { silverFreeAt: number; goldFreeAt: number };
  raid: Raid | null;
  nextRaidAt: number;
  holyBuffs: { key: string; value: number; until: number; label: string }[];
  nextId: number;
  tutorialDone: boolean;
  muted: boolean;
  /** optional so older saves load without a migration */
  hapticsOff?: boolean;
  /** guided first-session tutorial progress */
  ftueStep?: number;
  musicOff?: boolean;
  /** seven-day login calendar (see daily.ts) */
  login?: { claimed: number; last: string; cycles: number };
  /** honours: tiers claimed per achievement id (see achievements.ts) */
  achievements?: Record<string, number>;
  /** membership of the AI alliance (see alliance.ts) */
  alliance?: AllianceState;
  /** today's task baseline and opened activity chests */
  daily?: { day: string; base: Record<'collections' | 'troopsTrained' | 'barbsKilled' | 'gathered' | 'researchDone' | 'chestsOpened' | 'buildLevels', number>; chests: number[] };
}

export const SAVE_VERSION = 1;
export const PLAYER_POS = { x: 60, y: 60 };
export const WORLD_SIZE = 120;
export const MAX_AP = 1000;

export const START_TIME = 0;

export function newGame(seed = Math.floor(Math.random() * 1e9), governor = 'Governor'): GameState {
  const buildings: Record<string, BuildingState> = {};
  for (const p of PLOTS) buildings[p.id] = { type: p.type, level: 0, collectedAt: START_TIME };
  buildings.city_hall.level = 1;
  buildings.barracks.level = 1;
  buildings.farm_1.level = 1;
  buildings.lumber_mill_1.level = 1;
  buildings.tavern.level = 1;
  // resource buildings start part-full so the first harvest is immediate
  buildings.farm_1.collectedAt = START_TIME - 2_400_000;
  buildings.lumber_mill_1.collectedAt = START_TIME - 1_800_000;

  const commanders: Record<string, CommanderState> = {};
  for (const c of COMMANDERS) {
    commanders[c.id] = {
      id: c.id,
      unlocked: !!c.start,
      level: 1,
      xp: 0,
      stars: c.rarity === 'legendary' ? 2 : 1,
      skills: [1, 0, 0, 0],
      sculptures: 0,
    };
  }

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    time: START_TIME,
    speed: 1,
    governor,
    res: { food: 12000, wood: 12000, stone: 0, gold: 0 },
    gems: 500,
    ap: MAX_AP,
    buildings,
    jobs: [],
    builders: 2,
    troops: { infantry_1: 600, archer_1: 0, cavalry_1: 0 },
    wounded: {},
    commanders,
    research: {},
    items: { speed_5m: 5, speed_15m: 2, tome_500: 3, silver_key: 1 },
    marches: [],
    world: [],
    reports: [],
    questsClaimed: [],
    stats: {
      barbsKilled: 0,
      maxBarbLevel: 0,
      troopsTrained: 0,
      gathered: 0,
      collections: 0,
      researchDone: 0,
      citiesPlundered: 0,
      holyCaptured: 0,
      raidsDefended: 0,
      chestsOpened: 0,
    },
    tavern: { silverFreeAt: START_TIME, goldFreeAt: START_TIME },
    raid: null,
    nextRaidAt: Number.POSITIVE_INFINITY,
    holyBuffs: [],
    nextId: 1,
    tutorialDone: false,
    muted: false,
  };
  state.world = generateWorld(seed);
  return state;
}

export function uid(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

export function troopTypeOf(id: string): TroopType {
  return id.split('_')[0] as TroopType;
}

export function sumTroops(t: Troops): number {
  let n = 0;
  for (const k in t) n += t[k] ?? 0;
  return n;
}

export function cloneTroops(t: Troops): Troops {
  const out: Troops = {};
  for (const k in t) if ((t[k] ?? 0) > 0) out[k] = t[k];
  return out;
}

export const SAVE_KEY = 'realm-of-kings-save';

/** Native builds mirror every save into durable device storage (see src/native.ts). */
let saveMirror: ((raw: string) => void) | null = null;
export function setSaveMirror(fn: (raw: string) => void): void {
  saveMirror = fn;
}

export function saveGame(state: GameState): void {
  const raw = JSON.stringify({ state, savedAt: Date.now() });
  try {
    localStorage.setItem(SAVE_KEY, raw);
  } catch {
    /* storage may be unavailable (private mode) — the game still runs */
  }
  saveMirror?.(raw);
}

export function loadGame(): { state: GameState; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state: GameState; savedAt: number };
    if (parsed.state.version !== SAVE_VERSION) return null;
    // JSON turns Infinity into null
    if (parsed.state.nextRaidAt == null) parsed.state.nextRaidAt = Number.POSITIVE_INFINITY;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
