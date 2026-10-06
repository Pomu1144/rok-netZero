import { COMMANDER_BY_ID } from '../data/commanders';
import { counterMultiplier, troopStats } from '../data/troops';
import type { BonusKey, Bonuses, TroopType } from '../data/types';
import type { Troops } from './state';

export interface BattleCommander {
  id: string;
  level: number;
  skills: number[];
}

export interface BattleSide {
  name: string;
  troops: Troops;
  bonuses: Bonuses;
  commander?: BattleCommander | null;
  barbarian?: boolean;
  /** extra defense (city walls) */
  extraDef?: number;
}

export interface SideOutcome {
  start: Troops;
  losses: Troops;
  remaining: Troops;
  skillCasts: number;
}

export interface BattleResult {
  winner: 'attacker' | 'defender' | 'draw';
  rounds: number;
  attacker: SideOutcome;
  defender: SideOutcome;
  events: string[];
  timeline: { a: number; d: number }[];
}

/** Casualties per round scale: tuned so even fights last ~25-35 rounds. */
const K = 0.05;
const MAX_ROUNDS = 80;
const RAGE_PER_ROUND = 110;

interface Unit {
  id: string;
  type: TroopType;
  count: number;
  atk: number;
  def: number;
  hp: number;
}

function bonus(b: Bonuses, key: BonusKey): number {
  return b[key] ?? 0;
}

function buildUnits(side: BattleSide): Unit[] {
  const units: Unit[] = [];
  const cmd = side.commander;
  const lvlBonus = cmd ? cmd.level * 0.004 : 0;
  const specialty = cmd ? COMMANDER_BY_ID[cmd.id]?.troopType : undefined;
  for (const id in side.troops) {
    const count = side.troops[id];
    if (!count || count <= 0) continue;
    const [type, tierStr] = id.split('_') as [TroopType, string];
    const s = troopStats(type, Number(tierStr));
    const b = side.bonuses;
    const spec = specialty === type ? 0.05 : 0;
    units.push({
      id,
      type,
      count,
      atk: s.atk * (1 + bonus(b, 'allAtk') + bonus(b, `${type}Atk` as BonusKey) + lvlBonus + spec),
      def: s.def * (1 + bonus(b, 'allDef') + bonus(b, `${type}Def` as BonusKey) + lvlBonus + (side.extraDef ?? 0)),
      hp: s.hp * (1 + bonus(b, 'allHp') + bonus(b, `${type}Hp` as BonusKey) + lvlBonus),
    });
  }
  return units;
}

function total(units: Unit[]): number {
  let n = 0;
  for (const u of units) n += Math.max(0, u.count);
  return n;
}

/** Casualties `from` inflicts on `to` in one round of normal attacks. */
function roundDamage(from: Unit[], to: Unit[], mult: number): number[] {
  const kills = to.map(() => 0);
  const tTotal = total(to);
  if (tTotal <= 0) return kills;
  for (const a of from) {
    if (a.count <= 0) continue;
    to.forEach((d, i) => {
      if (d.count <= 0) return;
      const share = d.count / tTotal;
      kills[i] += (K * a.count * share * (a.atk / d.def) * counterMultiplier(a.type, d.type) * 60 * mult) / d.hp;
    });
  }
  return kills;
}

function applyKills(units: Unit[], kills: number[]): void {
  units.forEach((u, i) => {
    u.count = Math.max(0, u.count - kills[i]);
  });
}

export function simulateBattle(attacker: BattleSide, defender: BattleSide): BattleResult {
  const A = buildUnits(attacker);
  const D = buildUnits(defender);
  const startA = total(A);
  const startD = total(D);
  const events: string[] = [];
  const timeline: { a: number; d: number }[] = [{ a: startA, d: startD }];

  const sides = [
    { side: attacker, me: A, foe: D, rage: 0, casts: 0, rallyRounds: 0, start: startA, foeSide: defender },
    { side: defender, me: D, foe: A, rage: 0, casts: 0, rallyRounds: 0, start: startD, foeSide: attacker },
  ];

  let rounds = 0;
  while (rounds < MAX_ROUNDS && total(A) >= 1 && total(D) >= 1) {
    rounds++;
    // both sides strike simultaneously
    const dmgs = sides.map((s) => {
      let mult = 1;
      if (s.foeSide.barbarian) mult += bonus(s.side.bonuses, 'barbDamage');
      if (s.rallyRounds > 0) {
        const cmd = s.side.commander!;
        mult += COMMANDER_BY_ID[cmd.id].skills[0].values[cmd.skills[0] - 1];
        s.rallyRounds--;
      }
      return roundDamage(s.me, s.foe, mult);
    });

    // rage & active skills
    sides.forEach((s, idx) => {
      const cmd = s.side.commander;
      if (!cmd || cmd.skills[0] <= 0) return;
      s.rage += RAGE_PER_ROUND;
      if (s.rage < 1000) return;
      s.rage = 0;
      s.casts++;
      const def = COMMANDER_BY_ID[cmd.id];
      const skill = def.skills[0];
      const v = skill.values[cmd.skills[0] - 1];
      const skillMult = 1 + bonus(s.side.bonuses, 'skillDamage');
      if (skill.effect === 'damage') {
        const extra = roundDamage(s.me, s.foe, (v / 1000) * 2.2 * skillMult);
        dmgs[idx] = dmgs[idx].map((k, i) => k + extra[i]);
        events.push(`Round ${rounds}: ${def.name} casts ${skill.name}!`);
      } else if (skill.effect === 'heal') {
        const healed = Math.max(0, s.start - total(s.me)) * (v / 1000) * 0.5;
        const alive = total(s.me) || 1;
        s.me.forEach((u) => (u.count += (healed * u.count) / alive));
        events.push(`Round ${rounds}: ${def.name} casts ${skill.name}, restoring ${Math.round(healed)} troops.`);
      } else if (skill.effect === 'rally') {
        s.rallyRounds = 3;
        const extra = roundDamage(s.me, s.foe, 0.6 * skillMult);
        dmgs[idx] = dmgs[idx].map((k, i) => k + extra[i]);
        events.push(`Round ${rounds}: ${def.name} casts ${skill.name}, inspiring the troops!`);
      }
    });

    applyKills(D, dmgs[0]);
    applyKills(A, dmgs[1]);
    timeline.push({ a: Math.round(total(A)), d: Math.round(total(D)) });
  }

  const outcome = (units: Unit[], start: Troops, casts: number): SideOutcome => {
    const remaining: Troops = {};
    const losses: Troops = {};
    for (const id in start) {
      const u = units.find((x) => x.id === id);
      const left = u ? Math.floor(u.count + 1e-6) : 0;
      // a side that survives with fractions keeps them rounded; wiped sides lose everything
      remaining[id] = Math.min(start[id], Math.max(0, left));
      losses[id] = start[id] - remaining[id];
    }
    return { start: { ...start }, losses, remaining, skillCasts: casts };
  };

  const aAlive = total(A) >= 1;
  const dAlive = total(D) >= 1;
  const winner = aAlive && !dAlive ? 'attacker' : !aAlive && dAlive ? 'defender' : 'draw';

  return {
    winner,
    rounds,
    attacker: outcome(A, attacker.troops, sides[0].casts),
    defender: outcome(D, defender.troops, sides[1].casts),
    events,
    timeline,
  };
}

export function troopPower(t: Troops): number {
  let p = 0;
  for (const id in t) {
    const [type, tier] = id.split('_') as [TroopType, string];
    p += (t[id] ?? 0) * troopStats(type, Number(tier)).power;
  }
  return p;
}
