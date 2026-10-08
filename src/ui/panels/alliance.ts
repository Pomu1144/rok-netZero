import { assetUrl } from '../../assets';
import { sfx } from '../../audio';
import { ITEMS } from '../../data/items';
import {
  ALLIANCE,
  CREDITS_PER_HELP,
  DAILY_CREDIT_CAP,
  MAX_HELPS,
  MEMBERS,
  MEMBER_BY_ID,
  SHOP,
  askHelp,
  askHelpAll,
  buyFromShop,
  canAskHelp,
  claimGift,
  helpAllies,
  jobLabel,
  joinAlliance,
  postChat,
} from '../../game/alliance';
import { totalPower } from '../../game/logic';
import type { Reward } from '../../game/state';
import { haptic } from '../../native';
import type { UiCtx } from '../ctx';
import { icon, onAct, openModal, toast } from '../dom';
import { esc, fmt, fmtFull } from '../format';
import { ink } from '../ink';
import { celebrate } from './daily';

type Tab = 'hall' | 'help' | 'gifts' | 'chat' | 'shop';

const seal = (from: string) => {
  if (from === 'me') return '<span class="al-seal me">我</span>';
  if (from === 'sys') return `<span class="al-seal sys">${ALLIANCE.seal}</span>`;
  return `<span class="al-seal">${MEMBER_BY_ID[from]?.seal ?? '?'}</span>`;
};

const PHRASES = ['Greetings, allies!', 'Thank you for the help!', 'Anyone need help?', 'Rally on the fort?', 'For the Lotus!'];

export function openAlliance(ctx: UiCtx, start: Tab = 'hall'): void {
  let tab: Tab = start;
  let draft = '';
  // replies, gifts and requests arrive between game events: watch for them while open
  const sig = () => {
    const a = ctx.game.state.alliance;
    return a ? `${a.chat.length}|${a.gifts.length}|${a.requests.length}` : '';
  };
  let last = sig();
  let watch = 0;
  const handle = openModal({
    onClose: () => clearInterval(watch),
    title: ALLIANCE.name,
    seal: ALLIANCE.seal,
    kicker: `Alliance · [${ALLIANCE.tag}]`,
    size: 'wide',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const a = s.alliance;
      if (!a) {
        body.innerHTML = `
          <div class="al-join">
            <img class="al-crest" src="${assetUrl('al_banner')}" alt="">
            <div class="col" style="gap:10px">
              <div class="kicker">An invitation</div>
              <div class="cmd-name">${ALLIANCE.name}</div>
              <p class="muted">Ten governors sworn to one banner. Allies answer your calls for help, cutting time from every build, research and recovery, and share gifts from their hunts and conquests.</p>
              <ul class="al-perks">
                <li>${ink('i_hourglass', 16)} Up to ${MAX_HELPS} helps on every build, research and healing</li>
                <li>${ink('i_chest', 16)} Gifts whenever allies hunt, trade or conquer</li>
                <li>${ink('i_scroll', 16)} Alliance credits for helping, spent in the alliance shop</li>
              </ul>
              <div class="action-row" style="justify-content:flex-start"><button class="btn btn-gold btn-xl" data-act="join">${ink('i_banner', 18)} Swear the oath</button></div>
            </div>
          </div>`;
        onAct(body, {
          join: () => {
            ctx.game.act((st) => joinAlliance(st, ctx.game.rng));
            sfx.fanfare();
            haptic('success');
            toast(`You have joined the ${ALLIANCE.name}`, 'good', 'al_banner');
          },
        });
        return;
      }

      const tabs: [Tab, string, number][] = [
        ['hall', 'Hall', 0],
        ['help', 'Help', a.requests.length ? 1 : 0],
        ['gifts', 'Gifts', a.gifts.length],
        ['chat', 'Chat', 0],
        ['shop', 'Shop', 0],
      ];
      const nav = `<div class="al-tabs">${tabs.map(([id, label, n]) => `<button class="tal-tab ${tab === id ? 'sel' : ''}" data-act="tab" data-tab="${id}">${label}${n ? `<span class="al-dot">${n}</span>` : ''}</button>`).join('')}</div>`;
      let inner = '';

      if (tab === 'hall') {
        const roster = [...MEMBERS.map((m) => ({ ...m, me: false })), { id: 'me', name: s.governor, seal: '我', rank: 'R3' as const, power: totalPower(s), me: true }].sort((x, y) => y.power - x.power);
        inner = `
          <div class="al-hall">
            <img class="al-crest" src="${assetUrl('al_banner')}" alt="">
            <div class="col" style="gap:8px">
              <div class="al-stats">
                <div><span class="kicker">Members</span><b class="num">${MEMBERS.length + 1} / 50</b></div>
                <div><span class="kicker">Alliance power</span><b class="num">${fmtFull(roster.reduce((n, m) => n + m.power, 0))}</b></div>
                <div><span class="kicker">Credits</span><b class="num">${fmt(a.credits)}</b></div>
                <div><span class="kicker">Helps given · received</span><b class="num">${fmt(a.helpsGiven)} · ${fmt(a.helpsReceived)}</b></div>
              </div>
              <div class="al-roster">${roster
                .map((m) => `<div class="al-member ${m.me ? 'me' : ''}"><span class="al-seal ${m.me ? 'me' : ''}">${m.seal}</span><div class="grow"><b>${esc(m.name)}</b><div class="kicker">${m.rank}</div></div><span class="num muted">${fmtFull(m.power)}</span></div>`)
                .join('')}</div>
            </div>
          </div>`;
      } else if (tab === 'help') {
        const mine = s.jobs.filter((j) => j.kind !== 'train');
        inner = `
          <h3 class="sec">Your requests <span class="muted">each help removes 1% of the time (at least a minute)</span></h3>
          ${
            mine.length
              ? mine
                  .map((j) => {
                    const got = j.helped ? MAX_HELPS - (j.helpsLeft ?? 0) : 0;
                    return `<div class="row card al-req">${ink(j.kind === 'research' ? 'i_research' : j.kind === 'heal' ? 'i_heal' : 'i_hammer', 26)}<div class="grow"><b>${esc(jobLabel(j, s))}</b><div class="bar green" style="margin-top:5px"><div style="width:${(got / MAX_HELPS) * 100}%"></div></div><div class="muted" style="font-size:11px">${got} / ${MAX_HELPS} helps · <span data-end="${j.end}"></span> left</div></div>
                    ${canAskHelp(s, j) ? `<button class="btn btn-sm btn-gold" data-act="ask" data-id="${j.id}">${ink('i_banner', 14)} Ask</button>` : '<span class="muted" style="font-size:11px">Requested</span>'}</div>`;
                  })
                  .join('') + (mine.some((j) => canAskHelp(s, j)) ? '<div class="action-row"><button class="btn btn-gold" data-act="askall">Ask help for all</button></div>' : '')
              : '<div class="muted">No builds, research or healing under way.</div>'
          }
          <h3 class="sec">Allies in need <span class="muted">+${CREDITS_PER_HELP} credits each · ${fmt(a.creditsToday)} / ${DAILY_CREDIT_CAP} today</span></h3>
          ${
            a.requests.length
              ? a.requests
                  .map((q) => `<div class="row card al-req">${seal(q.member)}<div class="grow"><b>${esc(MEMBER_BY_ID[q.member].name)}</b><div class="muted" style="font-size:12px">${esc(q.what)} · ${q.helps} / ${MAX_HELPS}</div></div></div>`)
                  .join('') + `<div class="action-row"><button class="btn btn-gold btn-xl" data-act="helpall"><img src="${assetUrl('al_help')}" width="26" height="26" alt=""> Help all</button></div>`
              : '<div class="muted">Every ally is helped. New requests arrive throughout the day.</div>'
          }`;
      } else if (tab === 'gifts') {
        inner = a.gifts.length
          ? `<div class="action-row" style="justify-content:flex-end;margin-bottom:8px"><button class="btn btn-gold" data-act="openall">Open all · ${a.gifts.length}</button></div>
             <div class="al-gifts">${a.gifts
               .map((g) => `<div class="al-gift t${g.tier}"><img src="${assetUrl(`chest_${g.tier === 1 ? 2 : g.tier === 2 ? 3 : 4}`)}" alt=""><div class="grow"><b>${['', 'Common', 'Rare', 'Epic'][g.tier]} gift</b><div class="muted" style="font-size:12px">${esc(MEMBER_BY_ID[g.from]?.name ?? 'An ally')} ${esc(g.reason)}</div></div><button class="btn btn-sm" data-act="gift" data-id="${g.id}">Open</button></div>`)
               .join('')}</div>`
          : '<div class="muted center" style="padding:30px 0">No gifts waiting. Allies send them as they hunt, trade and conquer.</div>';
      } else if (tab === 'chat') {
        const fmtTime = (t: number) => {
          const m = Math.max(0, Math.floor((s.time - t) / 60_000));
          return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
        };
        inner = `
          <div class="al-chat" data-role="log">${a.chat
            .map((m) => `<div class="al-msg ${m.from === 'me' ? 'me' : m.from === 'sys' ? 'sys' : ''}">${seal(m.from)}<div class="grow"><div class="al-who">${m.from === 'me' ? esc(s.governor) : m.from === 'sys' ? 'Herald' : esc(MEMBER_BY_ID[m.from]?.name ?? '')} <span class="faint">${fmtTime(m.at)}</span></div><div>${esc(m.text)}</div></div></div>`)
            .join('')}</div>
          <div class="al-phrases">${PHRASES.map((p) => `<button class="btn btn-sm" data-act="say" data-text="${esc(p)}">${esc(p)}</button>`).join('')}</div>
          <form class="al-input" data-role="form"><input type="text" maxlength="140" placeholder="Write to your allies…" value="${esc(draft)}" data-role="input" aria-label="Message"><button class="btn btn-gold" type="submit">Send</button></form>`;
      } else {
        inner = `
          <div class="row" style="margin-bottom:10px"><div class="grow muted">Earn credits by helping allies.</div><div class="al-credits">${ink('i_banner', 16)} <b class="num">${fmt(a.credits)}</b> credits</div></div>
          <div class="al-shop">${SHOP.map(
            (e) => `<div class="al-ware">${icon(ITEMS[e.item].icon, 56)}<b>${ITEMS[e.item].name}</b><div class="muted" style="font-size:11px">${s.items[e.item] ?? 0} owned</div><button class="btn btn-sm ${a.credits >= e.price ? 'btn-gold' : ''}" data-act="buy" data-item="${e.item}" ${a.credits < e.price ? 'disabled' : ''}>${fmt(e.price)} credits</button></div>`,
          ).join('')}</div>`;
      }
      // live refreshes must not steal the cursor from someone typing
      const typing = document.activeElement?.matches?.('.al-input input') ?? false;
      body.innerHTML = nav + inner;

      const log = body.querySelector('[data-role=log]') as HTMLElement | null;
      if (log) log.scrollTop = log.scrollHeight;
      const input = body.querySelector('[data-role=input]') as HTMLInputElement | null;
      input?.addEventListener('input', () => (draft = input.value));
      if (typing && input) {
        input.focus();
        input.setSelectionRange(draft.length, draft.length);
      }
      body.querySelector('[data-role=form]')?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        const text = draft;
        draft = '';
        ctx.game.act((st) => postChat(st, text, ctx.game.rng));
        sfx.brush();
        h.refresh();
        (body.querySelector('[data-role=input]') as HTMLInputElement | null)?.focus();
      });

      onAct(body, {
        tab: (el) => {
          tab = el.dataset.tab as Tab;
          sfx.click();
          h.refresh();
        },
        ask: (el) => {
          if (ctx.game.act((st) => (askHelp(st, el.dataset.id!) ? { ok: true } : { ok: false, reason: '' })).ok) {
            sfx.horn();
            toast('Your allies answer the call', 'good', 'al_help');
          }
        },
        askall: () => {
          let n = 0;
          ctx.game.act((st) => void (n = askHelpAll(st)));
          if (n) {
            sfx.horn();
            toast(`Help requested for ${n} ${n === 1 ? 'task' : 'tasks'}`, 'good', 'al_help');
          }
        },
        helpall: (el) => {
          let r = { helped: 0, credits: 0 };
          ctx.game.act((st) => void (r = helpAllies(st)));
          if (!r.helped) return;
          sfx.coin();
          haptic('success');
          celebrate(el, {});
          toast(`Helped ${r.helped} ${r.helped === 1 ? 'ally' : 'allies'}${r.credits ? ` · +${r.credits} credits` : ' · daily credit limit reached'}`, 'good', 'al_help');
        },
        gift: (el) => {
          let r: Reward | null = null;
          ctx.game.act((st) => void (r = claimGift(st, el.dataset.id!, ctx.game.rng)));
          if (r) celebrate(el, r);
        },
        openall: (el) => {
          const ids = (ctx.game.state.alliance?.gifts ?? []).map((g) => g.id);
          const got: Reward = {};
          ctx.game.act((st) => {
            for (const id of ids) {
              const r = claimGift(st, id, ctx.game.rng);
              if (!r) continue;
              for (const k in r.res) (got.res ??= {})[k as 'food'] = ((got.res?.[k as 'food'] ?? 0) + (r.res as Record<string, number>)[k]);
              for (const k in r.items) (got.items ??= {})[k as 'speed_5m'] = ((got.items?.[k as 'speed_5m'] ?? 0) + (r.items as Record<string, number>)[k]);
            }
          });
          celebrate(el, got);
          toast(`Opened ${ids.length} alliance ${ids.length === 1 ? 'gift' : 'gifts'}`, 'good', 'chest_3');
        },
        say: (el) => {
          ctx.game.act((st) => postChat(st, el.dataset.text!, ctx.game.rng));
          sfx.brush();
        },
        buy: (el) => {
          const item = el.dataset.item as (typeof SHOP)[number]['item'];
          if (ctx.game.act((st) => (buyFromShop(st, item) ? { ok: true } : { ok: false, reason: '' })).ok) {
            sfx.coin();
            toast(`Bought ${ITEMS[item].name}`, 'good', ITEMS[item].icon);
          }
        },
      });
    },
  });
  watch = window.setInterval(() => {
    const now = sig();
    if (now !== last) {
      last = now;
      handle.refresh();
    }
  }, 700);
}
