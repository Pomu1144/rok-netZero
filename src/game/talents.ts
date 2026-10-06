import { COMMANDER_BY_ID } from '../data/commanders';
import { ROW_GATE, treesFor, type TalentNode, type TalentTree } from '../data/talents';
import { addBonuses, type Bonuses } from '../data/types';
import type { GameState } from './state';

export function commanderTrees(id: string): TalentTree[] {
  return treesFor(COMMANDER_BY_ID[id].troopType);
}

function talentsOf(s: GameState, id: string): Record<string, number> {
  return s.commanders[id].talents ?? {};
}

export function talentRank(s: GameState, id: string, nodeId: string): number {
  return talentsOf(s, id)[nodeId] ?? 0;
}

/** One point per level above 1. */
export function talentPoints(s: GameState, id: string): number {
  return Math.max(0, s.commanders[id].level - 1);
}

export function pointsInTree(s: GameState, id: string, tree: TalentTree): number {
  return tree.nodes.reduce((n, node) => n + talentRank(s, id, node.id), 0);
}

export function spentPoints(s: GameState, id: string): number {
  return commanderTrees(id).reduce((n, t) => n + pointsInTree(s, id, t), 0);
}

export function freePoints(s: GameState, id: string): number {
  return talentPoints(s, id) - spentPoints(s, id);
}

function findNode(id: string, nodeId: string): { tree: TalentTree; node: TalentNode } | null {
  for (const tree of commanderTrees(id)) {
    const node = tree.nodes.find((n) => n.id === nodeId);
    if (node) return { tree, node };
  }
  return null;
}

export function rowOpen(s: GameState, id: string, tree: TalentTree, row: number): boolean {
  return pointsInTree(s, id, tree) >= ROW_GATE[row];
}

export function canLearn(s: GameState, id: string, nodeId: string): boolean {
  const f = findNode(id, nodeId);
  if (!f || !s.commanders[id].unlocked) return false;
  return freePoints(s, id) > 0 && talentRank(s, id, nodeId) < f.node.max && rowOpen(s, id, f.tree, f.node.row);
}

export function learnTalent(s: GameState, id: string, nodeId: string): boolean {
  if (!canLearn(s, id, nodeId)) return false;
  const c = s.commanders[id];
  c.talents = { ...(c.talents ?? {}), [nodeId]: talentRank(s, id, nodeId) + 1 };
  return true;
}

/** Return every point; free, so players can experiment. */
export function resetTalents(s: GameState, id: string): void {
  s.commanders[id].talents = {};
}

/** Bonuses a commander's talents give the march they lead. */
export function talentBonuses(s: GameState, id: string): Bonuses {
  const out: Bonuses = {};
  for (const tree of commanderTrees(id)) {
    for (const node of tree.nodes) {
      const r = talentRank(s, id, node.id);
      if (r > 0) addBonuses(out, { [node.bonus]: node.per * r });
    }
  }
  return out;
}
