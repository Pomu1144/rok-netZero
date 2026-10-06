import { assetUrl } from '../../assets';
import { sfx } from '../../audio';
import { haptic } from '../../native';
import { ACTIVITY_CHESTS, DAILY_TASKS, LOGIN_REWARDS, activityPoints, chestReady, claimChest, claimLogin, dayKey, loginClaimable, loginState, rollDaily, taskDone, taskProgress } from '../../game/daily';
import type { Reward } from '../../game/state';
import type { UiCtx } from '../ctx';
import { flyTo, onAct, openModal, rewardHtml, toast } from '../dom';
import { fmt } from '../format';
import { questGo } from './misc';

/** The painted icon that best represents a reward (shown large on calendar tiles). */
function heroIcon(r: Reward): string {
  if (r.sculptures) return 'ic_sculpture';
  if (r.items?.gold_key) return 'ic_key_gold';
  if (r.res?.gems) return 'ic_gems';
  if (r.items?.silver_key) return 'ic_key_silver';
  if (r.items?.tome_500 || r.items?.tome_2000) return 'ic_tome';
  if (r.items?.speed_60m || r.items?.speed_15m) return 'ic_speedup';
  return 'ic_food';
}

/** Coins fly from the button into the HUD for each resource the reward grants. */
export function celebrate(from: HTMLElement, r: Reward): void {
  const b = from.getBoundingClientRect();
  const x = b.left + b.width / 2;
  const y = b.top + b.height / 2;
  const keys = Object.keys(r.res ?? {});
  for (const k of keys) flyTo(`ic_${k}`, x, y, document.querySelector(`[data-res=${k}]`), 5);
  if (!keys.length) flyTo('ic_chest', x, y, document.querySelector('[data-nav=bag]'), 4);
  sfx.chest();
  sfx.fanfare();
  haptic('success');
}

export function openCalendar(ctx: UiCtx): void {
  openModal({
    title: 'Seven Days of Favour',
    seal: '暦',
    kicker: 'Return each day for royal gifts',
    size: 'wide',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const today = dayKey();
      const l = loginState(s);
      const next = loginClaimable(s, today);
      // after a full cycle the board shows a fresh week
      const claimed = next === 0 ? 0 : l.claimed;
      body.innerHTML = `
        <p class="muted cal-lede">${next >= 0 ? 'A gift from the court awaits you today.' : 'Today’s gift is in your satchel. Return tomorrow for the next.'}</p>
        <div class="cal-grid">
          ${LOGIN_REWARDS.map((r, i) => {
            const state = i < claimed ? 'taken' : i === next ? 'today' : 'later';
            const big = i === LOGIN_REWARDS.length - 1;
            return `<div class="cal-day ${state} ${big ? 'grand' : ''}" style="animation-delay:${i * 0.04}s">
              <div class="cal-n">Day ${i + 1}</div>
              <img class="cal-art" src="${assetUrl(big ? 'chest_5' : heroIcon(r))}" alt="">
              ${rewardHtml(r)}
              ${state === 'taken' ? `<img class="cal-tick" src="${assetUrl('ink/ink_tick')}" alt="Claimed">` : ''}
              ${state === 'today' ? '<button class="btn btn-gold" data-act="claim">Claim</button>' : ''}
            </div>`;
          }).join('')}
        </div>`;
      onAct(body, {
        claim: (t) => {
          let r: Reward | null = null;
          ctx.game.act((st) => void (r = claimLogin(st, dayKey())));
          if (!r) return;
          celebrate(t, r);
          toast(`Day ${loginState(ctx.game.state).claimed} gift claimed`, 'good', 'ic_chest');
        },
      });
    },
  });
}

export function openDaily(ctx: UiCtx): void {
  ctx.game.act((s) => void rollDaily(s, dayKey()));
  // the chest the player last tapped to preview (kept across live re-renders)
  let peekI = -1;
  openModal({
    title: 'Daily Duties',
    seal: '務',
    kicker: 'Resets at midnight',
    size: 'wide',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const pts = activityPoints(s);
      const top = ACTIVITY_CHESTS[ACTIVITY_CHESTS.length - 1].points;
      const opened = s.daily?.chests ?? [];
      body.innerHTML = `
        <div class="act-head">
          <div class="act-pts"><span class="kicker">Activity</span><b class="num">${Math.min(pts, top)}</b><small>/ ${top}</small></div>
          <div class="act-track">
            <div class="act-bar"><div style="width:${Math.min(100, (pts / top) * 100)}%"></div></div>
            ${ACTIVITY_CHESTS.map((c, i) => {
              const ready = chestReady(s, i);
              const done = opened.includes(i);
              return `<button class="act-chest ${ready ? 'ready' : ''} ${done ? 'opened' : ''}" style="left:${(c.points / top) * 100}%" data-act="chest" data-i="${i}" aria-label="Activity chest ${c.points}">
                <img src="${assetUrl(`chest_${i + 1}`)}" alt=""><span class="num">${c.points}</span>
              </button>`;
            }).join('')}
          </div>
        </div>
        <div class="act-peek ${peekI >= 0 ? 'show' : ''}">${peekI >= 0 ? `<span class="kicker">${ACTIVITY_CHESTS[peekI].points} activity chest</span>${rewardHtml(ACTIVITY_CHESTS[peekI].reward)}` : ''}</div>
        <div class="spacer"></div>
        ${DAILY_TASKS.map((t, i) => {
          const [p, n] = taskProgress(s, t);
          const ok = taskDone(s, t);
          return `<div class="quest daily ${ok ? 'done' : ''}" style="animation-delay:${i * 0.04}s">
            <div class="qseal">${ok ? '✓' : '務'}</div>
            <div class="grow">
              <div class="q-title">${t.title}</div>
              <div class="bar ${ok ? '' : 'green'}" style="margin:6px 0"><div style="width:${Math.min(100, (p / n) * 100)}%"></div></div>
              <span class="num faint" style="font-size:11px">${fmt(Math.min(p, n))} / ${fmt(n)}</span>
            </div>
            <div class="act-gain"><b class="num">+${t.points}</b><small>activity</small></div>
            ${!ok && t.hint ? `<button class="btn btn-sm" data-act="go" data-id="${t.id}">Go</button>` : ''}
          </div>`;
        }).join('')}`;
      onAct(body, {
        chest: (el) => {
          const i = Number(el.dataset.i);
          if (!chestReady(ctx.game.state, i)) {
            // show what the chest holds
            peekI = i;
            sfx.click();
            h.refresh();
            return;
          }
          peekI = -1;
          let r: Reward | null = null;
          ctx.game.act((st) => void (r = claimChest(st, i)));
          if (r) {
            celebrate(el, r);
            toast('Activity chest opened', 'good', `chest_${i + 1}`);
          }
        },
        go: (el) => {
          const t = DAILY_TASKS.find((x) => x.id === el.dataset.id);
          if (!t?.hint) return;
          h.close();
          questGo(ctx, t.hint);
        },
      });
    },
  });
}
