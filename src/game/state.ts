import type { BuildingType } from '../data/buildings';
import { COMMANDERS } from '../data/commanders';
import type { ItemId } from '../data/items';
import { PLOTS } from '../data/layout';
import type { ResKey, TroopType } from '../data/types';
import { generateWorld } from './world';
import type { AllianceState } from './alliance';
import type { HuntState } from './hunt';

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
  /** shrine bonus */
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
  /** Upgrades waiting for a free builder; each starts on its own once it can. */
  buildPlan?: string[];
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
    /** lifetime barbarian-hunt points (see hunt.ts) */
    huntPoints?: number;
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
  /** interface language (see src/i18n) */
  lang?: 'en' | 'es' | 'ja' | 'zh';
  /** accessibility: text scale, motion preference, colour-safe palette */
  a11y?: { text?: number; motion?: 'system' | 'reduce' | 'full'; colorSafe?: boolean };
  /** seven-day login calendar (see daily.ts) */
  login?: { claimed: number; last: string; cycles: number };
  /** honours: tiers claimed per achievement id (see achievements.ts) */
  achievements?: Record<string, number>;
  /** campaign progress: best stars per stage id */
  campaign?: { stars: Record<string, number> };
  /** current barbarian hunt season */
  hunt?: HuntState;
  /** membership of the AI alliance (see alliance.ts) */
  alliance?: AllianceState;
  /** today's task baseline and opened activity chests */
  daily?: { day: string; base: Record<'collections' | 'troopsTrained' | 'barbsKilled' | 'gathered' | 'researchDone' | 'chestsOpened' | 'buildLevels', number>; chests: number[] };
}

export const SAVE_VERSION = 2;
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
/** The last good save from a few minutes earlier, kept for recovery. */
export const BACKUP_KEY = `${SAVE_KEY}.bak`;
const BACKUP_EVERY_MS = 5 * 60_000;

/** Native builds mirror every save into durable device storage (see src/native.ts). */
let saveMirror: ((raw: string) => void) | null = null;
export function setSaveMirror(fn: (raw: string) => void): void {
  saveMirror = fn;
}

let lastBackup = 0;

export function saveGame(state: GameState): void {
  const raw = JSON.stringify({ state, savedAt: Date.now() });
  try {
    // rotate the previous save into the backup slot every few minutes
    if (Date.now() - lastBackup > BACKUP_EVERY_MS) {
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev) localStorage.setItem(BACKUP_KEY, prev);
      lastBackup = Date.now();
    }
    localStorage.setItem(SAVE_KEY, raw);
  } catch {
    /* storage may be unavailable (private mode) — the game still runs */
  }
  saveMirror?.(raw);
}

// ---------------------------------------------------------------------------
// migrations and repair: an old or damaged save is upgraded, never thrown away

type AnySave = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Step migrations: MIGRATIONS[n] upgrades a version-n save to n+1. */
const MIGRATIONS: Record<number, (s: AnySave) => void> = {
  // v1 → v2: the retention, alliance, hunt and campaign systems arrived as optional
  // fields; JSON turned Infinity into null for the next raid
  1: (s) => {
    if (s.nextRaidAt == null) s.nextRaidAt = Number.POSITIVE_INFINITY;
  },
};

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Fill anything missing or corrupt from a fresh game: new buildings, commanders,
 * stats and resources added by later versions, and NaN where numbers should be.
 */
export function repairSave(raw: AnySave): GameState {
  const fresh = newGame(num(raw.seed, 1), typeof raw.governor === 'string' ? raw.governor : 'Governor') as unknown as AnySave;
  for (const k of Object.keys(fresh)) if (raw[k] === undefined || raw[k] === null) raw[k] = fresh[k];
  if (raw.nextRaidAt == null) raw.nextRaidAt = Number.POSITIVE_INFINITY;
  raw.time = num(raw.time, 0);
  raw.speed = num(raw.speed, 1);
  raw.gems = Math.max(0, num(raw.gems, 0));
  raw.ap = num(raw.ap, MAX_AP);
  for (const k of Object.keys(fresh.res)) raw.res[k] = Math.max(0, num(raw.res?.[k], 0));
  for (const id of Object.keys(fresh.buildings)) {
    const b = raw.buildings[id];
    if (!b || typeof b !== 'object') raw.buildings[id] = fresh.buildings[id];
    else {
      b.type = fresh.buildings[id].type;
      b.level = Math.max(0, Math.min(25, Math.floor(num(b.level, 0))));
      b.collectedAt = num(b.collectedAt, raw.time);
    }
  }
  for (const id of Object.keys(fresh.commanders)) {
    const c = raw.commanders[id];
    if (!c || typeof c !== 'object') raw.commanders[id] = fresh.commanders[id];
    else {
      const f = fresh.commanders[id];
      c.id = id;
      c.level = Math.max(1, num(c.level, 1));
      c.xp = Math.max(0, num(c.xp, 0));
      c.stars = Math.max(1, num(c.stars, f.stars));
      c.sculptures = Math.max(0, num(c.sculptures, 0));
      if (!Array.isArray(c.skills) || c.skills.length !== f.skills.length) c.skills = f.skills.map((v: number, i: number) => num(c.skills?.[i], v));
    }
  }
  for (const k of Object.keys(fresh.stats)) raw.stats[k] = num(raw.stats[k], 0);
  for (const k of ['jobs', 'marches', 'reports', 'questsClaimed', 'holyBuffs'] as const) if (!Array.isArray(raw[k])) raw[k] = [];
  if (!Array.isArray(raw.world) || raw.world.length === 0) raw.world = fresh.world;
  for (const k of ['troops', 'wounded', 'items', 'research'] as const) if (typeof raw[k] !== 'object') raw[k] = {};
  raw.version = SAVE_VERSION;
  return raw as unknown as GameState;
}

/** Upgrade a parsed save to the current version, or null if it is unusable or from a newer build. */
export function migrateSave(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as AnySave;
  const v = num(s.version, 0);
  if (v < 1 || v > SAVE_VERSION) return null;
  for (let n = v; n < SAVE_VERSION; n++) MIGRATIONS[n]?.(s);
  return repairSave(s);
}

function readSave(key: string): { state: GameState; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state: unknown; savedAt: number };
    const state = migrateSave(parsed.state);
    return state ? { state, savedAt: num(parsed.savedAt, Date.now()) } : null;
  } catch {
    return null;
  }
}

/** Load the save, falling back to the backup if the main slot is damaged. */
export function loadGame(): { state: GameState; savedAt: number; recovered?: boolean } | null {
  const main = readSave(SAVE_KEY);
  if (main) return main;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    // keep an unreadable or newer-version save aside instead of overwriting it
    if (raw) localStorage.setItem(`${SAVE_KEY}.unreadable`, raw);
  } catch {
    /* ignore */
  }
  const backup = readSave(BACKUP_KEY);
  return backup ? { ...backup, recovered: true } : null;
}

/** Swap in the backup save (used by the crash recovery screen). */
export function restoreBackup(): boolean {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw || !readSave(BACKUP_KEY)) return false;
    localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
