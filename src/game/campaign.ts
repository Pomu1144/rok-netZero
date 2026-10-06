import { STAGES, STAGE_BY_ID, type Stage } from '../data/campaign';
import { COMMANDER_BY_ID } from '../data/commanders';
import { simulateBattle, troopPower } from './battle';
import { addReport, battleBody, grantReward, marchBonuses, marchCapacity, commanderBusy, type Result } from './logic';
import { sumTroops, type GameState, type Report, type Troops } from './state';

export const STAGE_AP = 40;

export function stageStars(s: GameState, id: string): number {
  return s.campaign?.stars[id] ?? 0;
}

export function stageUnlocked(s: GameState, id: string): boolean {
  const i = STAGES.findIndex((x) => x.id === id);
  return i === 0 || stageStars(s, STAGES[i - 1].id) > 0;
}

export function totalStars(s: GameState): number {
  return STAGES.reduce((n, st) => n + stageStars(s, st.id), 0);
}

export function enemyPower(stage: Stage): number {
  return troopPower(stage.enemy.troops);
}

/** Stars by how much of the army survives: 3 below 15% losses, 2 below 40%, 1 for any win. */
export function starsFor(lossFrac: number): number {
  return lossFrac < 0.15 ? 3 : lossFrac < 0.4 ? 2 : 1;
}

/** Fill the march with the strongest troops at home, up to the commander's capacity. */
export function autoArmy(s: GameState, commanderId: string): Troops {
  const cap = marchCapacity(s, commanderId);
  const ids = Object.keys(s.troops)
    .filter((k) => (s.troops[k] ?? 0) > 0)
    .sort((a, b) => Number(b.split('_')[1]) - Number(a.split('_')[1]));
  const out: Troops = {};
  let left = cap;
  for (const k of ids) {
    if (left <= 0) break;
    const n = Math.min(left, s.troops[k]);
    out[k] = n;
    left -= n;
  }
  return out;
}

export interface StageOutcome {
  win: boolean;
  stars: number;
  firstClear: boolean;
  report: Report;
}

/**
 * Fight a campaign stage at once. Casualties are only wounded: they recover and
 * return home, so the cost of a try is action points, and stars reward a clean win.
 */
export function fightStage(s: GameState, stageId: string, commanderId: string, troops: Troops): Result & { outcome?: StageOutcome } {
  const stage = STAGE_BY_ID[stageId];
  if (!stage) return { ok: false, reason: 'No such stage' };
  if (!stageUnlocked(s, stageId)) return { ok: false, reason: 'Clear the previous stage first' };
  const c = s.commanders[commanderId];
  if (!c?.unlocked) return { ok: false, reason: 'Choose a commander' };
  if (commanderBusy(s, commanderId)) return { ok: false, reason: `${COMMANDER_BY_ID[commanderId].name} is away on a march` };
  if (sumTroops(troops) <= 0) return { ok: false, reason: 'No troops at home' };
  for (const id in troops) if ((s.troops[id] ?? 0) < troops[id]) return { ok: false, reason: 'Not enough troops' };
  if (s.ap < STAGE_AP) return { ok: false, reason: `Needs ${STAGE_AP} action points` };
  s.ap -= STAGE_AP;

  const res = simulateBattle(
    { name: c.id, troops, bonuses: marchBonuses(s, commanderId), commander: { id: c.id, level: c.level, skills: c.skills } },
    { name: stage.enemy.name, troops: stage.enemy.troops, bonuses: stage.enemy.bonuses ?? {}, commander: stage.enemy.commander ?? null, barbarian: stage.enemy.barbarian },
  );
  const win = res.winner === 'attacker';
  const lost = sumTroops(res.attacker.losses);
  const stars = win ? starsFor(lost / Math.max(1, sumTroops(troops))) : 0;
  const prev = stageStars(s, stageId);
  const firstClear = win && prev === 0;
  s.campaign = { stars: { ...(s.campaign?.stars ?? {}), [stageId]: Math.max(prev, stars) } };
  if (win) {
    grantReward(s, { xp: 400 + 250 * stage.chapter * (STAGES.indexOf(stage) % 4 + 1) }, commanderId);
    if (firstClear) grantReward(s, stage.reward);
  }
  const def = COMMANDER_BY_ID[commanderId];
  const body = battleBody(res, def.name, stage.enemy.name, def.portrait, stage.enemy.portrait);
  if (firstClear) body.rewards = stage.reward;
  const report = addReport(s, { kind: 'battle', title: `${win ? 'Victory' : 'Defeat'} · ${stage.title}`, win, body });
  return { ok: true, outcome: { win, stars, firstClear, report } };
}
