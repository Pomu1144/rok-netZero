import { BUILDINGS } from '../data/buildings';
import type { ResKey } from '../data/types';
import type { GameEvent } from './logic';
import { storedAmount } from './logic';
import type { GameState } from './state';

/**
 * The "while you were away" report: what happened during offline catch-up and
 * what is waiting to be harvested. Built from a snapshot taken before catch-up.
 */

export interface AwaySnapshot {
  res: Record<ResKey, number>;
  gems: number;
  barbsKilled: number;
  gathered: number;
}

export interface AwaySummary {
  awayMs: number;
  /** resources added directly (returning gatherers, battle loot) */
  gained: Partial<Record<ResKey | 'gems', number>>;
  /** resources sitting in producer storage, ready to harvest */
  stored: Partial<Record<ResKey, number>>;
  /** finished builds, research, training and healing, one line each */
  done: string[];
  battlesWon: number;
  battlesLost: number;
  raids: number;
}

export function awaySnapshot(s: GameState): AwaySnapshot {
  return { res: { ...s.res }, gems: s.gems, barbsKilled: s.stats.barbsKilled, gathered: s.stats.gathered };
}

export function storedTotals(s: GameState): Partial<Record<ResKey, number>> {
  const out: Partial<Record<ResKey, number>> = {};
  for (const id in s.buildings) {
    const res = BUILDINGS[s.buildings[id].type].producer;
    if (!res) continue;
    const n = storedAmount(s, id);
    if (n > 0) out[res] = (out[res] ?? 0) + n;
  }
  return out;
}

export function awaySummary(before: AwaySnapshot, s: GameState, events: GameEvent[], awayMs: number): AwaySummary {
  const gained: AwaySummary['gained'] = {};
  for (const k of Object.keys(s.res) as ResKey[]) {
    const d = Math.floor(s.res[k] - before.res[k]);
    if (d > 0) gained[k] = d;
  }
  if (s.gems > before.gems) gained.gems = s.gems - before.gems;
  const done = events.filter((e) => e.kind === 'build' || e.kind === 'research' || e.kind === 'train' || e.kind === 'heal').map((e) => e.text);
  return {
    awayMs,
    gained,
    stored: storedTotals(s),
    done,
    battlesWon: events.filter((e) => e.kind === 'battle' && e.good).length,
    battlesLost: events.filter((e) => e.kind === 'battle' && e.good === false).length,
    raids: events.filter((e) => e.kind === 'raid').length,
  };
}

/** Worth interrupting the player for? */
export function awayWorthShowing(a: AwaySummary): boolean {
  const any = (r: object) => Object.values(r).some((v) => (v ?? 0) > 0);
  return a.awayMs >= 5 * 60_000 && (any(a.stored) || any(a.gained) || a.done.length > 0 || a.battlesWon + a.battlesLost + a.raids > 0);
}
