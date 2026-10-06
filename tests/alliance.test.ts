import { describe, expect, it } from 'vitest';
import { DAILY_CREDIT_CAP, HELP_MIN_MS, MAX_HELPS, SHOP, askHelp, buyFromShop, claimGift, helpAllies, joinAlliance, postChat } from '../src/game/alliance';
import { tick } from '../src/game/logic';
import { Rng } from '../src/game/rng';
import { newGame } from '../src/game/state';

describe('alliance', () => {
  it('allies shave time off a job after a help request', () => {
    const s = newGame(11);
    const rng = new Rng(1);
    joinAlliance(s, rng);
    s.jobs.push({ id: 'j1', kind: 'build', target: 'barracks', start: s.time, end: s.time + 3 * 3600_000, amount: 2 });
    expect(askHelp(s, 'j1')).toBe(true);
    expect(askHelp(s, 'j1')).toBe(false); // once per job
    const before = s.jobs[0].end;
    for (let i = 0; i < 60; i++) tick(s, 5000, rng);
    const job = s.jobs[0];
    expect(job.helpsLeft).toBe(0);
    // ten helps of max(1 min, 1% of 3 h = 108 s)
    expect(before - job.end).toBeCloseTo(MAX_HELPS * Math.max(HELP_MIN_MS, 108_000), -2);
    expect(s.alliance!.helpsReceived).toBe(MAX_HELPS);
  });

  it('training cannot be helped', () => {
    const s = newGame(12);
    joinAlliance(s, new Rng(2));
    s.jobs.push({ id: 'j2', kind: 'train', target: 'infantry_1', start: s.time, end: s.time + 60_000, amount: 10 });
    expect(askHelp(s, 'j2')).toBe(false);
  });

  it('helping allies earns capped credits that buy items', () => {
    const s = newGame(13);
    const rng = new Rng(3);
    joinAlliance(s, rng);
    const a = s.alliance!;
    a.requests = Array.from({ length: 40 }, (_, i) => ({ id: `q${i}`, member: 'm_kaito', what: 'x', helps: 0 }));
    const start = a.credits;
    const r = helpAllies(s);
    expect(r.helped).toBe(40);
    expect(a.credits - start).toBe(DAILY_CREDIT_CAP);
    a.requests = [{ id: 'qq', member: 'm_kaito', what: 'x', helps: 0 }];
    expect(helpAllies(s).credits).toBe(0); // capped for today
    const item = SHOP[0];
    const have = s.items[item.item] ?? 0;
    expect(buyFromShop(s, item.item)).toBe(true);
    expect(s.items[item.item]).toBe(have + 1);
  });

  it('gifts arrive over time and can be opened; chat answers', () => {
    const s = newGame(14);
    const rng = new Rng(4);
    joinAlliance(s, rng);
    const a = s.alliance!;
    expect(a.gifts.length).toBe(1);
    expect(claimGift(s, a.gifts[0].id, rng)).not.toBeNull();
    for (let i = 0; i < 12 * 60; i++) tick(s, 5000, rng); // an hour
    expect(a.gifts.length).toBeGreaterThan(0);
    const n = a.chat.length;
    postChat(s, 'Thank you all!', rng);
    for (let i = 0; i < 3; i++) tick(s, 2000, rng);
    expect(a.chat.length).toBeGreaterThanOrEqual(n + 2);
    expect(a.chat.some((m) => m.from === 'me')).toBe(true);
  });
});
