import {
  BUILDINGS,
  MAX_LEVEL,
  buildingPower,
  hospitalCapacity,
  marchSlots,
  maxTierForLevel,
  producerCapacity,
  productionPerHour,
  trainingCapacity,
  upgradeCost,
  upgradeTime,
  wallDefense,
  type BuildingType,
} from '../data/buildings';
import {
  COMMANDERS,
  COMMANDER_BY_ID,
  MAX_SKILL_LEVEL,
  MAX_STARS,
  UNLOCK_SCULPTURES,
  commanderPower,
  commanderTroopCapacity,
  levelCapForStars,
  skillUpgradeCost,
  starUpgradeCost,
  xpToNext,
} from '../data/commanders';
import { ITEMS, RESOURCE_ITEM_KEY, type ItemId } from '../data/items';
import { PLOT_BY_ID } from '../data/layout';
import { TECH_BY_ID, techCost, techTime } from '../data/research';
import {
  TRAINED_AT,
  healCost,
  healTime,
  troopCost,
  troopId,
  troopName,
  troopStats,
  troopTime,
} from '../data/troops';
import { RES_KEYS, addBonuses, type BonusKey, type Bonuses, type Cost, type ResKey, type TroopType } from '../data/types';
import { talentBonuses } from './talents';
import { allianceCheer, allianceTick } from './alliance';
import { huntPointsFor } from './hunt';
import { simulateBattle, troopPower, type BattleResult } from './battle';
import { Rng } from './rng';
import {
  MAX_AP,
  PLAYER_POS,
  cloneTroops,
  sumTroops,
  troopTypeOf,
  uid,
  type GameState,
  type Job,
  type March,
  type MarchKind,
  type Report,
  type ReportBody,
  type Reward,
  type Troops,
  type WorldObj,
} from './state';
import { aiCityTroops, barbarianTroops, distance, holyTroops, respawnObject } from './world';

export interface GameEvent {
  kind: 'build' | 'research' | 'train' | 'heal' | 'battle' | 'gather' | 'raid_warning' | 'raid' | 'levelup' | 'info' | 'reward';
  text: string;
  good?: boolean;
  plotId?: string;
  reportId?: string;
  /** world tile where it happened (battles) */
  x?: number;
  y?: number;
}

export type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

export const FREE_FINISH_SECONDS = 300;
export const AP_PER_SECOND = 1 / 6;
export const BARB_AP_COST = 50;
export const FORT_AP_COST = 150;
const SCOUT_SPEED = 3; // tiles / s

// ---------------------------------------------------------------------------
// basic queries

export function cityHallLevel(s: GameState): number {
  return s.buildings.city_hall.level;
}

export function buildingLevel(s: GameState, type: BuildingType): number {
  let lvl = 0;
  for (const id in s.buildings) if (s.buildings[id].type === type) lvl = Math.max(lvl, s.buildings[id].level);
  return lvl;
}

export function plotUnlockLevel(plotId: string): number {
  const p = PLOT_BY_ID[plotId];
  return p.unlockCH ?? BUILDINGS[p.type].unlockCH;
}

export function cityBonuses(s: GameState): Bonuses {
  const b: Bonuses = {};
  for (const id in s.research) {
    const t = TECH_BY_ID[id];
    if (t) addBonuses(b, { [t.bonus]: t.perLevel * s.research[id] });
  }
  for (const c of COMMANDERS) {
    const cs = s.commanders[c.id];
    if (!cs?.unlocked) continue;
    c.skills.forEach((sk, i) => {
      if (sk.kind === 'passive' && sk.cityWide && sk.bonus && cs.skills[i] > 0) {
        addBonuses(b, { [sk.bonus]: sk.values[cs.skills[i] - 1] });
      }
    });
  }
  for (const hb of s.holyBuffs) if (hb.until > s.time) addBonuses(b, { [hb.key]: hb.value });
  return b;
}

export function marchBonuses(s: GameState, commanderId: string | null): Bonuses {
  const b = cityBonuses(s);
  if (!commanderId) return b;
  const def = COMMANDER_BY_ID[commanderId];
  const cs = s.commanders[commanderId];
  def.skills.forEach((sk, i) => {
    if (sk.kind === 'passive' && !sk.cityWide && sk.bonus && cs.skills[i] > 0) {
      addBonuses(b, { [sk.bonus]: sk.values[cs.skills[i] - 1] });
    }
  });
  addBonuses(b, talentBonuses(s, commanderId));
  return b;
}

function bonusOf(b: Bonuses, k: BonusKey): number {
  return b[k] ?? 0;
}

// ---------------------------------------------------------------------------
// resources

export function canAfford(s: GameState, cost: Cost, mult = 1): boolean {
  return RES_KEYS.every((k) => s.res[k] >= (cost[k] ?? 0) * mult);
}

export function scaleCost(cost: Cost, mult: number): Cost {
  const out: Cost = {};
  for (const k in cost) out[k as ResKey] = Math.ceil((cost[k as ResKey] ?? 0) * mult);
  return out;
}

function pay(s: GameState, cost: Cost): void {
  for (const k of RES_KEYS) s.res[k] -= cost[k] ?? 0;
}

function refund(s: GameState, cost: Cost, frac: number): void {
  for (const k of RES_KEYS) s.res[k] += Math.floor((cost[k] ?? 0) * frac);
}

export function productionRate(s: GameState, plotId: string): number {
  const b = s.buildings[plotId];
  const def = BUILDINGS[b.type];
  if (!def.producer || b.level <= 0) return 0;
  const bonus = bonusOf(cityBonuses(s), `${def.producer}Prod` as BonusKey);
  return productionPerHour(b.level) * (1 + bonus);
}

export function producerCap(s: GameState, plotId: string): number {
  const b = s.buildings[plotId];
  return producerCapacity(b.level, buildingLevel(s, 'storehouse'));
}

export function storedAmount(s: GameState, plotId: string): number {
  const b = s.buildings[plotId];
  if (!BUILDINGS[b.type].producer || b.level <= 0) return 0;
  // production pauses while a producer is being upgraded
  if (s.jobs.some((j) => j.kind === 'build' && j.target === plotId)) return 0;
  const hours = Math.max(0, s.time - b.collectedAt) / 3_600_000;
  return Math.min(producerCap(s, plotId), Math.floor(productionRate(s, plotId) * hours));
}

export function collect(s: GameState, plotId: string): number {
  const b = s.buildings[plotId];
  const res = BUILDINGS[b.type].producer;
  if (!res) return 0;
  const amt = storedAmount(s, plotId);
  if (amt <= 0) return 0;
  s.res[res] += amt;
  b.collectedAt = s.time;
  s.stats.collections++;
  return amt;
}

export function collectAll(s: GameState): Partial<Record<ResKey, number>> {
  const got: Partial<Record<ResKey, number>> = {};
  for (const id in s.buildings) {
    const res = BUILDINGS[s.buildings[id].type].producer;
    if (!res) continue;
    const n = collect(s, id);
    if (n > 0) got[res] = (got[res] ?? 0) + n;
  }
  return got;
}

export function hourlyIncome(s: GameState): Record<ResKey, number> {
  const out: Record<ResKey, number> = { food: 0, wood: 0, stone: 0, gold: 0 };
  for (const id in s.buildings) {
    const res = BUILDINGS[s.buildings[id].type].producer;
    if (res) out[res] += productionRate(s, id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// building

export interface UpgradeInfo {
  ok: boolean;
  reasons: string[];
  cost: Cost;
  seconds: number;
  toLevel: number;
}

export function upgradeInfo(s: GameState, plotId: string): UpgradeInfo {
  const b = s.buildings[plotId];
  const toLevel = b.level + 1;
  const reasons: string[] = [];
  const ch = cityHallLevel(s);
  if (b.level >= MAX_LEVEL) reasons.push('Maximum level reached');
  if (ch < plotUnlockLevel(plotId)) reasons.push(`Requires City Hall Lv.${plotUnlockLevel(plotId)}`);
  if (b.type !== 'city_hall' && toLevel > ch) reasons.push(`Requires City Hall Lv.${toLevel}`);
  if (b.type === 'city_hall' && toLevel >= 3) {
    const wall = s.buildings.wall.level;
    if (wall < toLevel - 1) reasons.push(`Requires City Wall Lv.${toLevel - 1}`);
  }
  if (b.type === 'city_hall' && toLevel >= 5 && buildingLevel(s, 'academy') < toLevel - 2) {
    reasons.push(`Requires Academy Lv.${toLevel - 2}`);
  }
  const cost = upgradeCost(b.type, toLevel);
  const seconds = Math.ceil(upgradeTime(b.type, toLevel) / (1 + bonusOf(cityBonuses(s), 'buildSpeed')));
  return { ok: reasons.length === 0, reasons, cost, seconds, toLevel };
}

export function activeBuildJobs(s: GameState): Job[] {
  return s.jobs.filter((j) => j.kind === 'build');
}

export function startUpgrade(s: GameState, plotId: string): Result {
  const info = upgradeInfo(s, plotId);
  if (!info.ok) return fail(info.reasons[0]);
  if (s.jobs.some((j) => j.kind === 'build' && j.target === plotId)) return fail('Already upgrading');
  if (activeBuildJobs(s).length >= s.builders) return fail('All builders are busy');
  if (!canAfford(s, info.cost)) return fail('Not enough resources');
  // harvest before the producer pauses so nothing is lost
  collect(s, plotId);
  pay(s, info.cost);
  s.jobs.push({
    id: uid(s, 'j'), kind: 'build', target: plotId, start: s.time, end: s.time + info.seconds * 1000, amount: info.toLevel,
  });
  return OK;
}

export function cancelJob(s: GameState, jobId: string): Result {
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job) return fail('No such job');
  s.jobs = s.jobs.filter((j) => j !== job);
  if (job.kind === 'build') refund(s, upgradeCost(s.buildings[job.target].type, job.amount), 0.5);
  if (job.kind === 'research') refund(s, techCost(TECH_BY_ID[job.target], job.amount), 0.5);
  if (job.kind === 'train') {
    const [type, tier] = job.target.split('_');
    refund(s, scaleCost(troopCost(type as TroopType, Number(tier)), job.amount), 0.5);
  }
  if (job.kind === 'heal' && job.troops) {
    for (const id in job.troops) s.wounded[id] = (s.wounded[id] ?? 0) + job.troops[id];
  }
  return OK;
}

export function remainingSeconds(s: GameState, job: Job): number {
  return Math.max(0, Math.ceil((job.end - s.time) / 1000));
}

export function gemCostToFinish(seconds: number): number {
  if (seconds <= FREE_FINISH_SECONDS) return 0;
  return Math.ceil(seconds / 45);
}

export function speedUp(s: GameState, jobId: string, seconds: number): void {
  const job = s.jobs.find((j) => j.id === jobId);
  if (job) job.end -= seconds * 1000;
}

export function useSpeedupItem(s: GameState, jobId: string, item: ItemId, count = 1): Result {
  const def = ITEMS[item];
  if (def.kind !== 'speedup') return fail('Not a speedup');
  const have = s.items[item] ?? 0;
  if (have < count) return fail('Not enough items');
  s.items[item] = have - count;
  speedUp(s, jobId, def.value * count);
  return OK;
}

export function finishWithGems(s: GameState, jobId: string): Result {
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job) return fail('No such job');
  const cost = gemCostToFinish(remainingSeconds(s, job));
  if (s.gems < cost) return fail('Not enough gems');
  s.gems -= cost;
  job.end = s.time;
  return OK;
}

// ---------------------------------------------------------------------------
// troops

export function trainingJob(s: GameState, type: TroopType): Job | undefined {
  return s.jobs.find((j) => j.kind === 'train' && j.target.startsWith(type + '_'));
}

export function trainSeconds(s: GameState, tier: number, amount: number): number {
  return Math.ceil((troopTime(tier) * amount) / (1 + bonusOf(cityBonuses(s), 'trainSpeed')));
}

export function startTraining(s: GameState, type: TroopType, tier: number, amount: number): Result {
  const lvl = buildingLevel(s, TRAINED_AT[type]);
  if (lvl <= 0) return fail(`Build a ${BUILDINGS[TRAINED_AT[type]].name} first`);
  if (tier > maxTierForLevel(lvl)) return fail('Tier locked');
  if (s.jobs.some((j) => j.kind === 'build' && s.buildings[j.target]?.type === TRAINED_AT[type])) {
    return fail('Building is being upgraded');
  }
  if (trainingJob(s, type)) return fail('Already training');
  amount = Math.floor(amount);
  if (amount <= 0) return fail('Choose an amount');
  if (amount > trainingCapacity(lvl)) return fail('Exceeds training capacity');
  const cost = troopCost(type, tier);
  if (!canAfford(s, cost, amount)) return fail('Not enough resources');
  pay(s, scaleCost(cost, amount));
  const secs = trainSeconds(s, tier, amount);
  s.jobs.push({ id: uid(s, 'j'), kind: 'train', target: troopId(type, tier), start: s.time, end: s.time + secs * 1000, amount });
  return OK;
}

export function hospitalCap(s: GameState): number {
  return Math.floor(hospitalCapacity(buildingLevel(s, 'hospital')) * (1 + bonusOf(cityBonuses(s), 'hospitalCapacity')));
}

export function healPlan(s: GameState): { cost: Cost; seconds: number; count: number } {
  const cost: Cost = {};
  let seconds = 0;
  let count = 0;
  for (const id in s.wounded) {
    const n = s.wounded[id] ?? 0;
    if (n <= 0) continue;
    const [type, tier] = id.split('_');
    const c = healCost(type as TroopType, Number(tier));
    for (const k in c) cost[k as ResKey] = (cost[k as ResKey] ?? 0) + (c[k as ResKey] ?? 0) * n;
    seconds += healTime(Number(tier)) * n;
    count += n;
  }
  seconds = Math.ceil(seconds / (1 + bonusOf(cityBonuses(s), 'healSpeed')));
  return { cost, seconds, count };
}

export function startHealing(s: GameState): Result {
  if (s.jobs.some((j) => j.kind === 'heal')) return fail('Already healing');
  const plan = healPlan(s);
  if (plan.count <= 0) return fail('No wounded troops');
  if (!canAfford(s, plan.cost)) return fail('Not enough resources');
  pay(s, plan.cost);
  const troops = cloneTroops(s.wounded);
  s.wounded = {};
  s.jobs.push({
    id: uid(s, 'j'), kind: 'heal', target: 'hospital', start: s.time, end: s.time + plan.seconds * 1000, amount: plan.count, troops,
  });
  return OK;
}

/** Troops currently at home (not marching). */
export function homeTroops(s: GameState): Troops {
  return cloneTroops(s.troops);
}

// ---------------------------------------------------------------------------
// research

export function researchInfo(s: GameState, techId: string): UpgradeInfo {
  const t = TECH_BY_ID[techId];
  const cur = s.research[techId] ?? 0;
  const toLevel = cur + 1;
  const reasons: string[] = [];
  if (cur >= t.maxLevel) reasons.push('Fully researched');
  const academy = buildingLevel(s, 'academy');
  if (academy < t.academyLevel) reasons.push(`Requires Academy Lv.${t.academyLevel}`);
  for (const r of t.requires) if ((s.research[r] ?? 0) < 1) reasons.push(`Requires ${TECH_BY_ID[r].name}`);
  const cost = techCost(t, toLevel);
  const seconds = Math.ceil(techTime(t, toLevel) / (1 + bonusOf(cityBonuses(s), 'researchSpeed')));
  return { ok: reasons.length === 0, reasons, cost, seconds, toLevel };
}

export function startResearch(s: GameState, techId: string): Result {
  const info = researchInfo(s, techId);
  if (!info.ok) return fail(info.reasons[0]);
  if (s.jobs.some((j) => j.kind === 'research')) return fail('Already researching');
  if (s.jobs.some((j) => j.kind === 'build' && s.buildings[j.target]?.type === 'academy')) return fail('Academy is being upgraded');
  if (!canAfford(s, info.cost)) return fail('Not enough resources');
  pay(s, info.cost);
  s.jobs.push({ id: uid(s, 'j'), kind: 'research', target: techId, start: s.time, end: s.time + info.seconds * 1000, amount: info.toLevel });
  return OK;
}

// ---------------------------------------------------------------------------
// commanders

export function commanderBusy(s: GameState, id: string): boolean {
  return s.marches.some((m) => m.commanderId === id);
}

export function addCommanderXp(s: GameState, id: string, xp: number): number {
  const c = s.commanders[id];
  let gained = 0;
  c.xp += xp;
  const cap = levelCapForStars(c.stars);
  while (c.level < cap && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level++;
    gained++;
  }
  if (c.level >= cap) c.xp = Math.min(c.xp, xpToNext(c.level));
  return gained;
}

export function upgradeSkill(s: GameState, id: string, skillIdx: number): Result {
  const c = s.commanders[id];
  if (!c.unlocked) return fail('Commander locked');
  const lvl = c.skills[skillIdx];
  if (lvl >= MAX_SKILL_LEVEL) return fail('Skill at max level');
  if (skillIdx > 0 && c.skills[skillIdx - 1] < 1) return fail('Unlock the previous skill first');
  const cost = skillUpgradeCost(lvl);
  if (c.sculptures < cost) return fail(`Need ${cost} sculptures`);
  c.sculptures -= cost;
  c.skills[skillIdx]++;
  return OK;
}

export function starUp(s: GameState, id: string): Result {
  const c = s.commanders[id];
  if (!c.unlocked) return fail('Commander locked');
  if (c.stars >= MAX_STARS) return fail('Max stars');
  if (c.level < levelCapForStars(c.stars)) return fail(`Reach Lv.${levelCapForStars(c.stars)} first`);
  const cost = starUpgradeCost(c.stars);
  if (c.sculptures < cost.sculptures) return fail(`Need ${cost.sculptures} sculptures`);
  if (s.res.gold < cost.gold) return fail('Not enough gold');
  c.sculptures -= cost.sculptures;
  s.res.gold -= cost.gold;
  c.stars++;
  return OK;
}

export function unlockCommander(s: GameState, id: string): Result {
  const c = s.commanders[id];
  if (c.unlocked) return fail('Already recruited');
  const need = UNLOCK_SCULPTURES[COMMANDER_BY_ID[id].rarity];
  if (c.sculptures < need) return fail(`Need ${need} sculptures`);
  c.sculptures -= need;
  c.unlocked = true;
  return OK;
}

export function useTome(s: GameState, item: ItemId, commanderId: string, count = 1): Result {
  const def = ITEMS[item];
  if (def.kind !== 'tome') return fail('Not a tome');
  if ((s.items[item] ?? 0) < count) return fail('Not enough tomes');
  const c = s.commanders[commanderId];
  if (!c.unlocked) return fail('Commander locked');
  if (c.level >= levelCapForStars(c.stars) && c.xp >= xpToNext(c.level)) return fail('Level capped - star up first');
  s.items[item] = (s.items[item] ?? 0) - count;
  addCommanderXp(s, commanderId, def.value * count);
  return OK;
}

export function useResourceItem(s: GameState, item: ItemId, count = 1): Result {
  const key = RESOURCE_ITEM_KEY[item];
  if (!key) return fail('Not a resource item');
  if ((s.items[item] ?? 0) < count) return fail('Not enough items');
  s.items[item] = (s.items[item] ?? 0) - count;
  s.res[key] += ITEMS[item].value * count;
  return OK;
}

// ---------------------------------------------------------------------------
// tavern

export const SILVER_FREE_MS = 8 * 3600_000;
export const GOLD_FREE_MS = 24 * 3600_000;

export function openChest(s: GameState, chest: 'silver' | 'gold', rng: Rng): { ok: false; reason: string } | { ok: true; reward: Reward; recruited?: string } {
  const freeKey = chest === 'silver' ? 'silverFreeAt' : 'goldFreeAt';
  const keyItem: ItemId = chest === 'silver' ? 'silver_key' : 'gold_key';
  const free = s.tavern[freeKey] <= s.time;
  if (!free) {
    if ((s.items[keyItem] ?? 0) <= 0) return { ok: false, reason: `No ${chest} keys` };
    s.items[keyItem] = (s.items[keyItem] ?? 0) - 1;
  } else {
    s.tavern[freeKey] = s.time + (chest === 'silver' ? SILVER_FREE_MS : GOLD_FREE_MS);
  }
  s.stats.chestsOpened++;
  const reward: Reward = { items: {}, sculptures: {}, res: {} };
  let recruited: string | undefined;
  const pool = COMMANDERS.filter((c) => (chest === 'silver' ? c.rarity === 'epic' : true));
  // commander drop
  const cmdChance = chest === 'silver' ? 0.04 : 0.12;
  if (rng.chance(cmdChance)) {
    const c = rng.pick(pool);
    if (!s.commanders[c.id].unlocked) {
      s.commanders[c.id].unlocked = true;
      recruited = c.id;
    } else {
      reward.sculptures![c.id] = (reward.sculptures![c.id] ?? 0) + 10;
    }
  }
  const sculptRolls = chest === 'silver' ? 1 : 2;
  for (let i = 0; i < sculptRolls; i++) {
    const c = rng.pick(pool);
    const n = chest === 'silver' ? rng.int(1, 3) : rng.int(3, 8);
    reward.sculptures![c.id] = (reward.sculptures![c.id] ?? 0) + n;
  }
  reward.items!.tome_500 = rng.int(1, chest === 'silver' ? 2 : 4);
  if (chest === 'gold') reward.items!.tome_2000 = rng.int(0, 2);
  reward.items![rng.pick(['speed_5m', 'speed_15m', 'speed_60m'] as ItemId[])] = rng.int(1, 3);
  const r = rng.pick(['food_10k', 'wood_10k', 'stone_5k', 'gold_3k'] as ItemId[]);
  reward.items![r] = (reward.items![r] ?? 0) + rng.int(1, 2);
  if (chest === 'gold') reward.res!.gems = rng.int(20, 80);
  grantReward(s, reward);
  return { ok: true, reward, recruited };
}

export function grantReward(s: GameState, r: Reward, commanderId?: string | null): void {
  if (r.res) {
    for (const k in r.res) {
      if (k === 'gems') s.gems += r.res.gems ?? 0;
      else s.res[k as ResKey] += r.res[k as ResKey] ?? 0;
    }
  }
  if (r.items) for (const k in r.items) s.items[k as ItemId] = (s.items[k as ItemId] ?? 0) + (r.items[k as ItemId] ?? 0);
  if (r.sculptures) for (const k in r.sculptures) s.commanders[k].sculptures += r.sculptures[k];
  if (r.xp && commanderId) addCommanderXp(s, commanderId, r.xp);
}

// ---------------------------------------------------------------------------
// marches

export function marchCapacity(s: GameState, commanderId: string | null): number {
  const base = commanderId ? commanderTroopCapacity(s.commanders[commanderId].level) : 1000;
  return Math.floor(base * (1 + bonusOf(marchBonuses(s, commanderId), 'troopCapacity')));
}

export function marchSpeedTiles(s: GameState, troops: Troops, commanderId: string | null): number {
  let slowest = Infinity;
  for (const id in troops) if ((troops[id] ?? 0) > 0) slowest = Math.min(slowest, troopStats(troopTypeOf(id), 1).speed);
  if (!isFinite(slowest)) slowest = 60;
  return (slowest / 60) * (1 + bonusOf(marchBonuses(s, commanderId), 'marchSpeed'));
}

export function troopLoad(s: GameState, troops: Troops, commanderId: string | null): number {
  let load = 0;
  for (const id in troops) {
    const [type, tier] = id.split('_');
    load += (troops[id] ?? 0) * troopStats(type as TroopType, Number(tier)).load;
  }
  return Math.floor(load * (1 + bonusOf(marchBonuses(s, commanderId), 'load')));
}

export function findObj(s: GameState, id: string): WorldObj | undefined {
  return s.world.find((o) => o.id === id);
}

export function isHidden(s: GameState, o: WorldObj): boolean {
  return (o.kind === 'barbarian' || o.kind === 'node' || o.kind === 'fort') && o.respawnAt !== undefined && o.respawnAt > s.time;
}

export function maxBarbLevel(s: GameState): number {
  return s.stats.maxBarbLevel + 1;
}

export interface MarchOrder {
  kind: MarchKind;
  targetId: string;
  commanderId: string | null;
  troops: Troops;
}

export function validateMarch(s: GameState, o: MarchOrder): Result {
  const target = findObj(s, o.targetId);
  if (!target || isHidden(s, target)) return fail('Target is gone');
  if (o.kind !== 'scout' && s.marches.filter((m) => m.kind !== 'scout').length >= marchSlots(cityHallLevel(s))) {
    return fail('No free march slots');
  }
  if (o.kind === 'scout') {
    if (buildingLevel(s, 'scout_camp') <= 0) return fail('Build a Scout Camp first');
    if (s.marches.some((m) => m.kind === 'scout')) return fail('Scout already out');
    return OK;
  }
  if (!o.commanderId) return fail('Choose a commander');
  if (!s.commanders[o.commanderId]?.unlocked) return fail('Commander locked');
  if (commanderBusy(s, o.commanderId)) return fail('Commander is already marching');
  const n = sumTroops(o.troops);
  if (n <= 0) return fail('Select troops');
  if (n > marchCapacity(s, o.commanderId)) return fail('Exceeds troop capacity');
  for (const id in o.troops) if ((o.troops[id] ?? 0) > (s.troops[id] ?? 0)) return fail('Not enough troops');
  if (o.kind === 'gather') {
    if (target.kind !== 'node') return fail('Can only gather at resource points');
    if (target.occupiedBy) return fail('Already being gathered');
  }
  if (o.kind === 'attack') {
    if (target.kind === 'node' || target.kind === 'deco') return fail('Cannot attack this');
    if (target.kind === 'barbarian') {
      if (target.level > maxBarbLevel(s)) return fail(`Defeat a Lv.${target.level - 1} barbarian first`);
      if (s.ap < BARB_AP_COST) return fail('Not enough action points');
    }
    if (target.kind === 'fort' && s.ap < FORT_AP_COST) return fail('Not enough action points');
    if (target.kind === 'holy' && target.heldUntil && target.heldUntil > s.time) return fail('You already hold this site');
  }
  return OK;
}

export function travelSeconds(s: GameState, o: MarchOrder): number {
  const t = findObj(s, o.targetId)!;
  const d = distance(PLAYER_POS.x, PLAYER_POS.y, t.x, t.y);
  const speed = o.kind === 'scout' ? SCOUT_SPEED * (1 + buildingLevel(s, 'scout_camp') * 0.1) : marchSpeedTiles(s, o.troops, o.commanderId);
  return Math.max(2, d / speed);
}

export function sendMarch(s: GameState, o: MarchOrder): Result {
  const v = validateMarch(s, o);
  if (!v.ok) return v;
  const t = findObj(s, o.targetId)!;
  if (o.kind === 'attack') {
    if (t.kind === 'barbarian') s.ap -= BARB_AP_COST;
    if (t.kind === 'fort') s.ap -= FORT_AP_COST;
  }
  const troops = o.kind === 'scout' ? {} : cloneTroops(o.troops);
  for (const id in troops) s.troops[id] -= troops[id];
  const secs = travelSeconds(s, o);
  s.marches.push({
    id: uid(s, 'm'),
    kind: o.kind,
    commanderId: o.kind === 'scout' ? null : o.commanderId,
    troops,
    targetId: t.id,
    fromX: PLAYER_POS.x,
    fromY: PLAYER_POS.y,
    toX: t.x,
    toY: t.y,
    departAt: s.time,
    arriveAt: s.time + secs * 1000,
    phase: 'outbound',
    carry: {},
    lightWounded: {},
  });
  if (o.kind === 'gather') t.occupiedBy = s.marches[s.marches.length - 1].id;
  return OK;
}

/** Current interpolated map position of a march. */
export function marchPosition(s: GameState, m: March): { x: number; y: number } {
  if (m.phase === 'gathering') return { x: m.toX, y: m.toY };
  const p = Math.min(1, Math.max(0, (s.time - m.departAt) / (m.arriveAt - m.departAt)));
  return { x: m.fromX + (m.toX - m.fromX) * p, y: m.fromY + (m.toY - m.fromY) * p };
}

export function recallMarch(s: GameState, marchId: string): Result {
  const m = s.marches.find((x) => x.id === marchId);
  if (!m) return fail('No such march');
  if (m.phase === 'returning') return fail('Already returning');
  const pos = marchPosition(s, m);
  if (m.phase === 'gathering') {
    const node = findObj(s, m.targetId);
    const got = Math.floor(((s.time - m.departAt) / 1000) * (m.gatherRate ?? 0));
    if (node && node.res) {
      const take = Math.min(got, node.amount ?? 0);
      m.carry[node.res] = (m.carry[node.res] ?? 0) + take;
      node.amount = (node.amount ?? 0) - take;
      node.occupiedBy = undefined;
    }
  } else if (m.kind === 'gather') {
    const node = findObj(s, m.targetId);
    if (node && node.occupiedBy === m.id) node.occupiedBy = undefined;
  }
  startReturn(s, m, pos.x, pos.y, s.time);
  return OK;
}

function startReturn(s: GameState, m: March, fromX: number, fromY: number, at: number): void {
  const d = distance(fromX, fromY, PLAYER_POS.x, PLAYER_POS.y);
  const speed = m.kind === 'scout' ? SCOUT_SPEED : marchSpeedTiles(s, m.troops, m.commanderId);
  m.phase = 'returning';
  m.fromX = fromX;
  m.fromY = fromY;
  m.toX = PLAYER_POS.x;
  m.toY = PLAYER_POS.y;
  m.departAt = at;
  m.arriveAt = at + Math.max(1, d / speed) * 1000;
}

export function addReport(s: GameState, r: Omit<Report, 'id' | 'read' | 'at'>): Report {
  const rep: Report = { ...r, id: uid(s, 'r'), at: s.time, read: false };
  s.reports.unshift(rep);
  if (s.reports.length > 60) s.reports.length = 60;
  return rep;
}

function commanderName(id: string | null): string {
  return id ? COMMANDER_BY_ID[id].name : 'Garrison';
}

export function battleBody(res: BattleResult, aName: string, dName: string, aPortrait?: string, dPortrait?: string): ReportBody {
  return {
    lines: [...res.events.slice(0, 12)],
    attacker: { name: aName, portrait: aPortrait, ...res.attacker },
    defender: { name: dName, portrait: dPortrait, ...res.defender },
    timeline: res.timeline,
  };
}

function barbarianReward(level: number, rng: Rng, fort = false): Reward {
  const mult = fort ? 6 : 1;
  const r: Reward = {
    res: {
      food: Math.round(1200 * Math.pow(level, 1.35) * mult),
      wood: Math.round(1200 * Math.pow(level, 1.35) * mult),
      stone: level >= 3 ? Math.round(400 * Math.pow(level, 1.35) * mult) : 0,
      gold: level >= 5 ? Math.round(200 * Math.pow(level, 1.35) * mult) : 0,
    },
    xp: Math.round(180 * Math.pow(level, 1.6) * (fort ? 4 : 1)),
    items: {},
    sculptures: {},
  };
  if (rng.chance(fort ? 1 : 0.35)) r.items!.tome_500 = fort ? 3 : 1;
  if (rng.chance(fort ? 1 : 0.3)) r.items![rng.pick(['speed_1m', 'speed_5m', 'speed_15m'] as ItemId[])] = 1;
  if (rng.chance(fort ? 0.8 : 0.18)) {
    const c = rng.pick(COMMANDERS);
    r.sculptures![c.id] = fort ? rng.int(3, 6) : 1;
  }
  if (fort) r.items!.silver_key = 1;
  if (fort && rng.chance(0.3)) r.items!.gold_key = 1;
  return r;
}

function resolveArrival(s: GameState, m: March, rng: Rng, events: GameEvent[]): void {
  const t = findObj(s, m.targetId);
  const at = m.arriveAt;
  if (!t || isHidden(s, t)) {
    const rep = addReport(s, { kind: 'system', title: 'Target vanished', body: { lines: ['Your troops found nothing and are returning home.'] } });
    events.push({ kind: 'info', text: 'March target vanished - returning', reportId: rep.id });
    startReturn(s, m, m.toX, m.toY, at);
    return;
  }

  if (m.kind === 'scout') {
    t.scoutedAt = s.time;
    const rep = addReport(s, {
      kind: 'scout',
      title: `Scout report: ${objLabel(t)}`,
      body: {
        lines: [
          `Location: (${t.x}, ${t.y})`,
          `Garrison: ${sumTroops(t.troops ?? {}).toLocaleString()} troops`,
          ...(t.loot ? [`Resources: ${RES_KEYS.map((k) => `${k} ${Math.round(t.loot![k] ?? 0).toLocaleString()}`).join(', ')}`] : []),
        ],
        defender: t.troops ? { name: objLabel(t), start: t.troops, losses: {}, remaining: t.troops } : undefined,
      },
    });
    events.push({ kind: 'info', text: `Scouts returned intel on ${objLabel(t)}`, reportId: rep.id, good: true });
    startReturn(s, m, t.x, t.y, at);
    return;
  }

  if (m.kind === 'gather') {
    if (!t.res || (t.occupiedBy && t.occupiedBy !== m.id)) {
      startReturn(s, m, t.x, t.y, at);
      return;
    }
    const bonuses = marchBonuses(s, m.commanderId);
    const resMult = { food: 1, wood: 1, stone: 0.75, gold: 0.4 }[t.res];
    const rate = 40 * resMult * (1 + bonusOf(bonuses, 'gatherSpeed'));
    const load = troopLoad(s, m.troops, m.commanderId);
    // stone and gold are heavier
    const loadInRes = load / { food: 1, wood: 1, stone: 1.5, gold: 4 }[t.res];
    const amount = Math.min(loadInRes, t.amount ?? 0);
    m.phase = 'gathering';
    m.gatherRate = rate;
    m.departAt = at; // reused as gather start
    m.gatherEnd = at + (amount / rate) * 1000;
    t.occupiedBy = m.id;
    return;
  }

  // attack
  const cs = m.commanderId ? s.commanders[m.commanderId] : null;
  const attacker = {
    name: commanderName(m.commanderId),
    troops: m.troops,
    bonuses: marchBonuses(s, m.commanderId),
    commander: cs ? { id: cs.id, level: cs.level, skills: cs.skills } : null,
  };
  const defender = {
    name: objLabel(t),
    troops: t.troops ?? {},
    bonuses: t.kind === 'city' ? { allDef: 0.05 * t.level, allAtk: 0.02 * t.level } : t.kind === 'holy' ? { allDef: 0.2 } : {},
    barbarian: t.kind === 'barbarian' || t.kind === 'fort',
  };
  const res = simulateBattle(attacker, defender);
  const win = res.winner === 'attacker';
  const portrait = m.commanderId ? COMMANDER_BY_ID[m.commanderId].portrait : undefined;
  const body = battleBody(res, attacker.name, defender.name, portrait, objSprite(t));

  // casualties
  const pve = t.kind === 'barbarian' || t.kind === 'fort' || t.kind === 'holy';
  m.troops = { ...res.attacker.remaining };
  for (const id in res.attacker.losses) {
    const lost = res.attacker.losses[id];
    if (!lost) continue;
    if (pve) {
      m.lightWounded[id] = (m.lightWounded[id] ?? 0) + lost;
    } else {
      const severe = Math.floor(lost * 0.8);
      const free = Math.max(0, hospitalCap(s) - sumTroops(s.wounded));
      const toHosp = Math.min(severe, free);
      s.wounded[id] = (s.wounded[id] ?? 0) + toHosp;
    }
  }
  t.troops = { ...res.defender.remaining };

  let reward: Reward | undefined;
  if (win) {
    if (t.kind === 'barbarian' || t.kind === 'fort') {
      reward = barbarianReward(t.level, rng, t.kind === 'fort');
      grantReward(s, reward, m.commanderId);
      s.stats.huntPoints = (s.stats.huntPoints ?? 0) + huntPointsFor(t.kind, t.level);
      if (t.kind === 'barbarian') {
        s.stats.barbsKilled++;
        s.stats.maxBarbLevel = Math.max(s.stats.maxBarbLevel, t.level);
      }
      t.respawnAt = s.time + (t.kind === 'fort' ? 600_000 : 45_000);
    } else if (t.kind === 'city') {
      const load = troopLoad(s, m.troops, m.commanderId);
      const loot = t.loot ?? {};
      const totalLoot = RES_KEYS.reduce((a, k) => a + (loot[k] ?? 0), 0) || 1;
      const frac = Math.min(1, (load * 0.5) / totalLoot);
      for (const k of RES_KEYS) {
        const take = Math.floor((loot[k] ?? 0) * frac);
        m.carry[k] = (m.carry[k] ?? 0) + take;
        loot[k] = (loot[k] ?? 0) - take;
      }
      reward = { res: { ...m.carry }, xp: Math.round(300 * Math.pow(t.level, 1.5)) };
      if (m.commanderId) addCommanderXp(s, m.commanderId, reward.xp!);
      s.stats.citiesPlundered++;
      t.respawnAt = s.time + 900_000; // garrison recovers
    } else if (t.kind === 'holy' && t.buff) {
      t.heldUntil = s.time + 1_800_000;
      s.holyBuffs = s.holyBuffs.filter((b) => b.key !== t.buff!.key || b.until > s.time);
      s.holyBuffs.push({ ...t.buff, until: t.heldUntil });
      s.stats.holyCaptured++;
      reward = { xp: 3000, res: { gems: 100 } };
      grantReward(s, reward, m.commanderId);
    }
  } else if (m.commanderId) {
    addCommanderXp(s, m.commanderId, Math.round(40 * t.level));
  }
  body.rewards = reward;
  const title = `${win ? 'Victory' : res.winner === 'draw' ? 'Stalemate' : 'Defeat'} vs ${objLabel(t)}`;
  const rep = addReport(s, { kind: 'battle', title, win, body });
  events.push({ kind: 'battle', text: title, good: win, reportId: rep.id, x: t.x, y: t.y });
  startReturn(s, m, t.x, t.y, at);
}

function finishMarch(s: GameState, m: March, events: GameEvent[]): void {
  for (const id in m.troops) s.troops[id] = (s.troops[id] ?? 0) + m.troops[id];
  // lightly wounded troops patch themselves up on the way home
  for (const id in m.lightWounded) s.troops[id] = (s.troops[id] ?? 0) + m.lightWounded[id];
  let carried = 0;
  for (const k of RES_KEYS) {
    const n = Math.floor(m.carry[k] ?? 0);
    s.res[k] += n;
    carried += n;
  }
  if (m.kind === 'gather' && carried > 0) {
    s.stats.gathered += carried;
    const rep = addReport(s, {
      kind: 'gather',
      title: 'Gathering complete',
      body: { lines: [`Your troops returned with ${RES_KEYS.filter((k) => m.carry[k]).map((k) => `${Math.floor(m.carry[k]!).toLocaleString()} ${k}`).join(', ')}.`], rewards: { res: { ...m.carry } } },
    });
    events.push({ kind: 'gather', text: `Gatherers returned with ${carried.toLocaleString()} resources`, good: true, reportId: rep.id });
  } else if (m.kind !== 'scout') {
    events.push({ kind: 'info', text: `${commanderName(m.commanderId)}'s army has returned` });
  }
  s.marches = s.marches.filter((x) => x !== m);
}

export function objLabel(o: WorldObj): string {
  switch (o.kind) {
    case 'barbarian': return `Lv.${o.level} Barbarians`;
    case 'fort': return `Lv.${o.level} Barbarian Fort`;
    case 'node': return `Lv.${o.level} ${{ food: 'Cropland', wood: 'Logging Camp', stone: 'Stone Deposit', gold: 'Gold Deposit' }[o.res!]}`;
    case 'city': return `${o.name} (Lv.${o.level})`;
    case 'holy': return o.name ?? 'Holy Site';
    default: return o.deco ?? 'Wilds';
  }
}

export function objSprite(o: WorldObj): string {
  switch (o.kind) {
    case 'barbarian': return 'barb_camp';
    case 'fort': return 'barb_fort';
    case 'node': return `node_${o.res}`;
    case 'city': return 'city_enemy';
    case 'holy': return 'holy_site';
    default: return o.deco === 'pass' ? 'pass' : o.deco ?? 'forest';
  }
}

// ---------------------------------------------------------------------------
// raids on the player's city

export const RAID_WARNING_MS = 180_000;

export function resourceProtection(s: GameState): number {
  return 5000 + 12000 * buildingLevel(s, 'storehouse');
}

function scheduleRaid(s: GameState, rng: Rng): void {
  s.nextRaidAt = s.time + rng.int(18, 35) * 60_000;
}

function resolveRaid(s: GameState, rng: Rng, events: GameEvent[]): void {
  const raid = s.raid!;
  s.raid = null;
  const idle = COMMANDERS.map((c) => s.commanders[c.id]).filter((c) => c.unlocked && !commanderBusy(s, c.id));
  idle.sort((a, b) => b.level - a.level);
  const garrison = idle[0];
  const defender = {
    name: garrison ? `${COMMANDER_BY_ID[garrison.id].name} (Garrison)` : 'City Garrison',
    troops: cloneTroops(s.troops),
    bonuses: garrison ? marchBonuses(s, garrison.id) : cityBonuses(s),
    commander: garrison ? { id: garrison.id, level: garrison.level, skills: garrison.skills } : null,
    extraDef: wallDefense(s.buildings.wall.level) + bonusOf(cityBonuses(s), 'wallDef'),
  };
  const attacker = { name: `Lv.${raid.level} Barbarian Warband`, troops: raid.troops, bonuses: {}, barbarian: true };
  const res = simulateBattle(attacker, defender);
  const win = res.winner !== 'attacker';
  s.troops = { ...res.defender.remaining };
  let free = Math.max(0, hospitalCap(s) - sumTroops(s.wounded));
  let died = 0;
  for (const id in res.defender.losses) {
    const lost = res.defender.losses[id];
    const toHosp = Math.min(lost, free);
    free -= toHosp;
    died += lost - toHosp;
    if (toHosp > 0) s.wounded[id] = (s.wounded[id] ?? 0) + toHosp;
  }
  const body = battleBody(res, attacker.name, defender.name, 'unit_barbarian', garrison ? COMMANDER_BY_ID[garrison.id].portrait : undefined);
  if (win) {
    s.stats.raidsDefended++;
    const reward = barbarianReward(raid.level, rng);
    grantReward(s, reward, garrison?.id);
    body.rewards = reward;
    body.lines.unshift('Your garrison repelled the warband!');
  } else {
    const protect = resourceProtection(s);
    const lostRes: Partial<Record<ResKey, number>> = {};
    for (const k of RES_KEYS) {
      const loss = Math.floor(Math.max(0, s.res[k] - protect) * 0.2);
      s.res[k] -= loss;
      lostRes[k] = loss;
    }
    body.lines.unshift(`The warband breached your walls and plundered ${RES_KEYS.map((k) => `${(lostRes[k] ?? 0).toLocaleString()} ${k}`).join(', ')}.`);
  }
  if (died > 0) body.lines.push(`${died.toLocaleString()} troops died because the hospital was full.`);
  const rep = addReport(s, { kind: 'raid', title: win ? 'City defended!' : 'City raided!', win, body });
  events.push({ kind: 'raid', text: win ? 'Your garrison repelled the barbarian raid!' : 'Barbarians raided your city!', good: win, reportId: rep.id });
  scheduleRaid(s, rng);
}

export function raidTroops(level: number): Troops {
  const t = barbarianTroops(level);
  for (const k in t) t[k] = Math.round(t[k] * 1.4);
  return t;
}

// ---------------------------------------------------------------------------
// power & tick

export function totalPower(s: GameState): number {
  let p = 0;
  for (const id in s.buildings) p += buildingPower(s.buildings[id].level);
  p += troopPower(s.troops);
  for (const m of s.marches) p += troopPower(m.troops) + troopPower(m.lightWounded);
  for (const id in s.research) p += s.research[id] * 250;
  for (const c of Object.values(s.commanders)) if (c.unlocked) p += commanderPower(c.level, c.stars, c.skills);
  return Math.round(p);
}

export function tick(s: GameState, dtGameMs: number, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  s.time += dtGameMs;
  s.ap = Math.min(MAX_AP, s.ap + (dtGameMs / 1000) * AP_PER_SECOND);
  allianceTick(s, rng, events);

  // jobs
  const done = s.jobs.filter((j) => j.end <= s.time).sort((a, b) => a.end - b.end);
  for (const j of done) {
    s.jobs = s.jobs.filter((x) => x !== j);
    if (j.kind === 'build') {
      const b = s.buildings[j.target];
      b.level = j.amount;
      b.collectedAt = s.time;
      events.push({ kind: 'build', text: `${BUILDINGS[b.type].name} upgraded to Lv.${b.level}`, good: true, plotId: j.target });
      if (b.type === 'city_hall') allianceCheer(s, `Congratulations on City Hall Lv.${b.level}, my lord!`, rng);
    } else if (j.kind === 'research') {
      s.research[j.target] = j.amount;
      s.stats.researchDone++;
      events.push({ kind: 'research', text: `Research complete: ${TECH_BY_ID[j.target].name} Lv.${j.amount}`, good: true });
    } else if (j.kind === 'train') {
      s.troops[j.target] = (s.troops[j.target] ?? 0) + j.amount;
      s.stats.troopsTrained += j.amount;
      events.push({ kind: 'train', text: `${j.amount.toLocaleString()} ${troopName(j.target)} ready`, good: true });
    } else if (j.kind === 'heal' && j.troops) {
      for (const id in j.troops) s.troops[id] = (s.troops[id] ?? 0) + j.troops[id];
      events.push({ kind: 'heal', text: `${j.amount.toLocaleString()} troops healed`, good: true });
    }
  }

  // marches (process in event order; a march may advance several phases in one big tick)
  for (let guard = 0; guard < 200; guard++) {
    let next: { m: March; at: number } | null = null;
    for (const m of s.marches) {
      const at = m.phase === 'gathering' ? m.gatherEnd! : m.arriveAt;
      if (at <= s.time && (!next || at < next.at)) next = { m, at };
    }
    if (!next) break;
    const m = next.m;
    if (m.phase === 'outbound') resolveArrival(s, m, rng, events);
    else if (m.phase === 'gathering') {
      const node = findObj(s, m.targetId);
      if (node?.res) {
        const amt = Math.floor(((m.gatherEnd! - m.departAt) / 1000) * (m.gatherRate ?? 0));
        const take = Math.min(amt, node.amount ?? 0);
        m.carry[node.res] = (m.carry[node.res] ?? 0) + take;
        node.amount = (node.amount ?? 0) - take;
        node.occupiedBy = undefined;
        if ((node.amount ?? 0) <= 50) node.respawnAt = s.time + 120_000;
      }
      startReturn(s, m, m.toX, m.toY, m.gatherEnd!);
    } else finishMarch(s, m, events);
  }

  // world respawns
  for (const o of s.world) {
    if (o.respawnAt !== undefined && o.respawnAt <= s.time) {
      if (o.kind === 'city') {
        o.troops = aiCityTroops(o.level);
        o.loot = { food: 20000 * o.level, wood: 20000 * o.level, stone: 6000 * o.level, gold: 2500 * o.level };
        o.respawnAt = undefined;
      } else if (o.kind === 'barbarian' || o.kind === 'node' || o.kind === 'fort') {
        if (!s.marches.some((m) => m.targetId === o.id)) respawnObject(o, s.world, rng);
      }
    }
    if (o.kind === 'holy' && o.heldUntil !== undefined && o.heldUntil <= s.time) {
      o.heldUntil = undefined;
      o.troops = holyTroops();
    }
  }
  s.holyBuffs = s.holyBuffs.filter((b) => b.until > s.time);

  // raids
  if (cityHallLevel(s) >= 4) {
    if (!isFinite(s.nextRaidAt) && !s.raid) scheduleRaid(s, rng);
    if (!s.raid && s.nextRaidAt <= s.time) {
      const level = Math.max(1, Math.min(10, cityHallLevel(s) - 2));
      s.raid = { level, arriveAt: s.time + RAID_WARNING_MS, troops: raidTroops(level) };
      events.push({ kind: 'raid_warning', text: `A Lv.${level} barbarian warband is marching on your city!`, good: false });
    }
    if (s.raid && s.raid.arriveAt <= s.time) resolveRaid(s, rng, events);
  }

  return events;
}

export { troopPower };
export { cityHallLevel as chLevel };
export function startingCommanderIds(): string[] {
  return COMMANDERS.filter((c) => c.start).map((c) => c.id);
}
