import { beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_KEY, SAVE_KEY, SAVE_VERSION, loadGame, migrateSave, newGame, repairSave, saveGame } from '../src/game/state';

// a tiny in-memory localStorage for the node test environment
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};

describe('save migrations and repair', () => {
  beforeEach(() => store.clear());

  it('upgrades a version 1 save instead of discarding it', () => {
    const old = JSON.parse(JSON.stringify(newGame(41))) as Record<string, unknown>;
    old.version = 1;
    old.nextRaidAt = null; // JSON turns Infinity into null
    (old.res as Record<string, number>).food = 777;
    const s = migrateSave(old)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.res.food).toBe(777);
    expect(s.nextRaidAt).toBe(Number.POSITIVE_INFINITY);
  });

  it('fills buildings, commanders and stats added by later versions and fixes NaN', () => {
    const s = JSON.parse(JSON.stringify(newGame(42))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    delete s.buildings.academy;
    delete s.commanders.khan;
    delete s.stats.chestsOpened;
    s.res.wood = null;
    s.gems = 'lots';
    s.commanders.caesar.skills = [2];
    const r = repairSave(s);
    expect(r.buildings.academy.type).toBe('academy');
    expect(r.commanders.khan.level).toBe(1);
    expect(r.stats.chestsOpened).toBe(0);
    expect(r.res.wood).toBe(0);
    expect(r.gems).toBe(0);
    expect(r.commanders.caesar.skills).toEqual([2, 0, 0, 0]);
  });

  it('rejects saves from a newer build and keeps them aside', () => {
    const s = JSON.parse(JSON.stringify(newGame(43)));
    s.version = SAVE_VERSION + 1;
    expect(migrateSave(s)).toBeNull();
    store.set(SAVE_KEY, JSON.stringify({ state: s, savedAt: 1 }));
    expect(loadGame()).toBeNull();
    expect(store.has(`${SAVE_KEY}.unreadable`)).toBe(true);
  });

  it('falls back to the backup when the main save is corrupt', () => {
    const good = newGame(44);
    good.gems = 1234;
    saveGame(good); // first save rotates nothing, writes main
    store.set(BACKUP_KEY, store.get(SAVE_KEY)!);
    store.set(SAVE_KEY, '{"state": {"version": 2, "res": ');
    const loaded = loadGame()!;
    expect(loaded.recovered).toBe(true);
    expect(loaded.state.gems).toBe(1234);
  });
});
