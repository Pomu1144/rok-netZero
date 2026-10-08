import { BUILDINGS } from '../data/buildings';
import type { ItemId } from '../data/items';
import { TECH_BY_ID } from '../data/research';
import { grantReward, type GameEvent } from './logic';
import type { Rng } from './rng';
import type { GameState, Job, Reward } from './state';

/**
 * The Order of the Lotus: an alliance of AI governors. They answer help requests
 * (shaving time off builds, research and healing), send gifts, ask for help in
 * return (which earns alliance credits for the shop) and keep the chat alive.
 */

export interface Member {
  id: string;
  name: string;
  /** kanji shown on the member's seal */
  seal: string;
  rank: 'R5' | 'R4' | 'R3' | 'R2';
  power: number;
}

export const ALLIANCE = { name: 'Order of the Lotus', tag: 'LOTS', seal: '蓮' };

export const MEMBERS: Member[] = [
  { id: 'm_aldric', name: 'Aldric the Grey', seal: '灰', rank: 'R5', power: 4_820_000 },
  { id: 'm_seren', name: 'Lady Seren', seal: '星', rank: 'R4', power: 3_910_000 },
  { id: 'm_kaito', name: 'Kaito', seal: '海', rank: 'R4', power: 3_440_000 },
  { id: 'm_brann', name: 'Brann Ironhand', seal: '鉄', rank: 'R4', power: 2_870_000 },
  { id: 'm_ysolde', name: 'Ysolde', seal: '雪', rank: 'R3', power: 1_960_000 },
  { id: 'm_tariq', name: 'Tariq of the Sands', seal: '砂', rank: 'R3', power: 1_720_000 },
  { id: 'm_mei', name: 'Mei Lin', seal: '梅', rank: 'R3', power: 1_380_000 },
  { id: 'm_osric', name: 'Osric', seal: '狼', rank: 'R2', power: 940_000 },
  { id: 'm_freya', name: 'Freya Stormborn', seal: '嵐', rank: 'R2', power: 760_000 },
  { id: 'm_tomas', name: 'Tomas the Young', seal: '若', rank: 'R2', power: 410_000 },
];

export const MEMBER_BY_ID: Record<string, Member> = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));

/** Helps a single request can receive. */
export const MAX_HELPS = 10;
/** Each help cuts max(1 minute, 1% of the job's total time). */
export const HELP_MIN_MS = 60_000;
/** Alliance credits per member helped, and the daily cap on earning them. */
export const CREDITS_PER_HELP = 10;
export const DAILY_CREDIT_CAP = 300;

export interface ChatMsg {
  at: number;
  from: string; // member id or 'me' or 'sys'
  text: string;
}

export interface AllyRequest {
  id: string;
  member: string;
  what: string;
  helps: number;
}

export interface Gift {
  id: string;
  from: string;
  tier: 1 | 2 | 3;
  reason: string;
}

export interface AllianceState {
  joinedAt: number;
  credits: number;
  creditsToday: number;
  creditDay: number;
  helpsGiven: number;
  helpsReceived: number;
  chat: ChatMsg[];
  requests: AllyRequest[];
  gifts: Gift[];
  nextChatAt: number;
  nextGiftAt: number;
  nextRequestAt: number;
  /** counter for ids */
  seq: number;
  /** a reply waiting to be posted */
  pending?: ChatMsg;
}

export const SHOP: { item: ItemId; price: number }[] = [
  { item: 'speed_5m', price: 30 },
  { item: 'speed_15m', price: 80 },
  { item: 'speed_60m', price: 280 },
  { item: 'tome_500', price: 60 },
  { item: 'silver_key', price: 150 },
  { item: 'gold_key', price: 900 },
];

export const GIFT_REWARDS: Record<1 | 2 | 3, Reward[]> = {
  1: [{ res: { food: 3000, wood: 3000 } }, { items: { speed_5m: 1 } }, { items: { tome_500: 1 } }, { res: { stone: 1500 } }],
  2: [{ items: { speed_15m: 1, speed_5m: 1 } }, { res: { gems: 20 } }, { items: { tome_500: 2 } }, { res: { gold: 1500 } }],
  3: [{ items: { speed_60m: 1 } }, { res: { gems: 60 } }, { items: { silver_key: 1 } }, { items: { tome_2000: 1 } }],
};

const GIFT_REASONS: [1 | 2 | 3, string][] = [
  [1, 'felled a Lv.5 barbarian'],
  [1, 'gathered a mountain of timber'],
  [1, 'opened a tavern chest'],
  [2, 'stormed a barbarian stronghold'],
  [2, 'bought the Merchant’s Bundle'],
  [3, 'captured a Shrine for the alliance'],
  [3, 'bought the Emperor’s Treasury'],
];

const BANTER = [
  'Morning, my lords. The roads east are crawling with barbarians.',
  'Anyone need help? Post your builds.',
  'Rally on the fort at dusk, bring cavalry.',
  'Remember to claim your daily duties before midnight!',
  'The Shrine of War changes hands again tonight…',
  'Thank you all for the help, my academy is nearly done.',
  'Who has spare stone? Asking for a wall.',
  'Sun Tzu is worth every insignia, trust me.',
  'Gather on the gold nodes near the river, they are untouched.',
  'Our lotus banner flies over three shrines now.',
  'Keep your troops in the hospital, not in the ground.',
  'Archers beat infantry, infantry beats cavalry, cavalry beats archers. Every time.',
];

const GREETINGS = ['Welcome to the Order, Governor!', 'Glad to have you with us.', 'Ask for help on every build, we always answer.', 'Welcome! Our gifts are yours to open.'];
const REPLIES = ['Well said!', 'Ha, indeed.', 'Agreed, my lord.', 'For the Lotus!', 'Good to see you online.', 'Count me in.', 'Haha!', 'Stay safe out there.'];
const THANKS = ['Any time!', 'That is what allies are for.', 'You owe me a drink at the tavern.', 'Happy to help.'];

const WHATS = ['Upgrade Citadel', 'Upgrade Academy', 'Research Iron Working', 'Upgrade Barracks', 'Heal wounded', 'Research Masonry', 'Upgrade Wall', 'Research Horsemanship', 'Upgrade Stable', 'Upgrade Farm'];

const MINUTE = 60_000;

export function inAlliance(s: GameState): boolean {
  return !!s.alliance;
}

function say(a: AllianceState, at: number, from: string, text: string): void {
  a.chat.push({ at, from, text });
  if (a.chat.length > 60) a.chat.splice(0, a.chat.length - 60);
}

export function joinAlliance(s: GameState, rng: Rng): void {
  if (s.alliance) return;
  const a: AllianceState = {
    joinedAt: s.time,
    credits: 50,
    creditsToday: 0,
    creditDay: Math.floor(s.time / 86_400_000),
    helpsGiven: 0,
    helpsReceived: 0,
    chat: [],
    requests: [],
    gifts: [{ id: 'g0', from: 'm_aldric', tier: 2, reason: 'welcomes you to the Order' }],
    nextChatAt: s.time + 40_000,
    nextGiftAt: s.time + 8 * MINUTE,
    nextRequestAt: s.time + 20_000,
    seq: 1,
  };
  say(a, s.time, 'sys', `${s.governor} has joined ${ALLIANCE.name}.`);
  say(a, s.time + 1, 'm_aldric', rng.pick(GREETINGS));
  say(a, s.time + 2, rng.pick(MEMBERS.slice(1)).id, rng.pick(GREETINGS));
  // a couple of open requests so "Help all" has something to do straight away
  for (let i = 0; i < 3; i++) a.requests.push({ id: `q${a.seq++}`, member: rng.pick(MEMBERS).id, what: rng.pick(WHATS), helps: rng.int(1, 6) });
  s.alliance = a;
}

export function canAskHelp(s: GameState, job: Job): boolean {
  return inAlliance(s) && job.kind !== 'train' && !job.helped && job.end > s.time;
}

/** Ask allies to help with a job; they answer over the next minutes. */
export function askHelp(s: GameState, jobId: string): boolean {
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job || !canAskHelp(s, job)) return false;
  job.helped = true;
  job.helpsLeft = MAX_HELPS;
  job.helpAt = s.time + 3000;
  job.helpCut = Math.max(HELP_MIN_MS, (job.end - job.start) * 0.01);
  return true;
}

export function askHelpAll(s: GameState): number {
  let n = 0;
  for (const j of s.jobs) if (askHelp(s, j.id)) n++;
  return n;
}

export function jobLabel(job: Job, s: GameState): string {
  if (job.kind === 'build') return `${BUILDINGS[s.buildings[job.target].type].name} Lv.${job.amount}`;
  if (job.kind === 'research') return `${TECH_BY_ID[job.target]?.name ?? 'Research'} Lv.${job.amount}`;
  return 'Healing the wounded';
}

/** Help every ally request: earns credits up to the daily cap. */
export function helpAllies(s: GameState): { helped: number; credits: number } {
  const a = s.alliance;
  if (!a || !a.requests.length) return { helped: 0, credits: 0 };
  const day = Math.floor(s.time / 86_400_000);
  if (day !== a.creditDay) {
    a.creditDay = day;
    a.creditsToday = 0;
  }
  const helped = a.requests.length;
  const earn = Math.min(helped * CREDITS_PER_HELP, Math.max(0, DAILY_CREDIT_CAP - a.creditsToday));
  a.credits += earn;
  a.creditsToday += earn;
  a.helpsGiven += helped;
  s.stats.allyHelps = (s.stats.allyHelps ?? 0) + helped;
  a.requests = [];
  return { helped, credits: earn };
}

export function claimGift(s: GameState, giftId: string, rng: Rng): Reward | null {
  const a = s.alliance;
  const g = a?.gifts.find((x) => x.id === giftId);
  if (!a || !g) return null;
  a.gifts = a.gifts.filter((x) => x !== g);
  const reward = rng.pick(GIFT_REWARDS[g.tier]);
  grantReward(s, reward);
  return reward;
}

export function buyFromShop(s: GameState, item: ItemId): boolean {
  const a = s.alliance;
  const entry = SHOP.find((x) => x.item === item);
  if (!a || !entry || a.credits < entry.price) return false;
  a.credits -= entry.price;
  s.items[item] = (s.items[item] ?? 0) + 1;
  return true;
}

/** The player posts in chat; someone answers shortly after. */
export function postChat(s: GameState, text: string, rng: Rng): void {
  const a = s.alliance;
  const t = text.trim().slice(0, 140);
  if (!a || !t) return;
  say(a, s.time, 'me', t);
  const thanks = /thank|thx|ty\b/i.test(t);
  a.pending = { at: s.time + rng.int(1500, 4000), from: rng.pick(MEMBERS).id, text: rng.pick(thanks ? THANKS : REPLIES) };
}

/** Celebrate the player's milestones in chat. */
export function allianceCheer(s: GameState, text: string, rng: Rng): void {
  const a = s.alliance;
  if (!a) return;
  say(a, s.time, rng.pick(MEMBERS).id, text);
}

export function allianceBadge(s: GameState): number {
  const a = s.alliance;
  if (!a) return 0;
  return a.gifts.length + (a.requests.length ? 1 : 0);
}

/** Advance the alliance: helps land, requests and gifts arrive, chat drifts by. */
export function allianceTick(s: GameState, rng: Rng, events: GameEvent[]): void {
  const a = s.alliance;
  if (!a) return;
  for (const j of s.jobs) {
    while (j.helpsLeft && j.helpAt !== undefined && j.helpAt <= s.time && j.end > s.time) {
      j.end = Math.max(s.time, j.end - (j.helpCut ?? HELP_MIN_MS));
      j.helpsLeft--;
      j.helpAt += rng.int(4000, 14000);
      a.helpsReceived++;
      if (j.helpsLeft === MAX_HELPS - 1) events.push({ kind: 'info', text: `${MEMBER_BY_ID[rng.pick(MEMBERS).id].name} helped: ${jobLabel(j, s)}` });
    }
  }
  if (a.pending && a.pending.at <= s.time) {
    say(a, a.pending.at, a.pending.from, a.pending.text);
    delete a.pending;
  }
  if (s.time >= a.nextChatAt) {
    say(a, s.time, rng.pick(MEMBERS).id, rng.pick(BANTER));
    a.nextChatAt = s.time + rng.int(2, 6) * MINUTE;
  }
  if (s.time >= a.nextRequestAt) {
    if (a.requests.length < 8) a.requests.push({ id: `q${a.seq++}`, member: rng.pick(MEMBERS).id, what: rng.pick(WHATS), helps: rng.int(0, 7) });
    a.nextRequestAt = s.time + rng.int(1, 4) * MINUTE;
  }
  if (s.time >= a.nextGiftAt) {
    if (a.gifts.length < 20) {
      const [tier, reason] = rng.pick(GIFT_REASONS);
      a.gifts.push({ id: `g${a.seq++}`, from: rng.pick(MEMBERS).id, tier, reason });
    }
    a.nextGiftAt = s.time + rng.int(12, 35) * MINUTE;
  }
}
