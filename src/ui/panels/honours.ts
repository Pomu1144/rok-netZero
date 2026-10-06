import { assetUrl } from '../../assets';
import { sfx } from '../../audio';
import type { ResKey } from '../../data/types';
import { ACHIEVEMENTS, TIER_NAMES, TIER_REWARDS, canClaimAchievement, claimAchievement, claimedTiers, medalCount, reachedTiers } from '../../game/achievements';
import type { AwaySummary } from '../../game/away';
import { collectAll } from '../../game/logic';
import type { Reward } from '../../game/state';
import type { UiCtx } from '../ctx';
import { flyTo, icon, onAct, openModal, rewardHtml, toast } from '../dom';
import { esc, fmt } from '../format';
import { celebrate } from './daily';

// ---------------------------------------------------------------------------
// honours (achievements)

export function openHonours(ctx: UiCtx): void {
  openModal({
    title: 'Hall of Honours',
    seal: '誉',
    kicker: 'Deeds remembered by the realm',
    size: 'wide',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const held = medalCount(s);
      const total = ACHIEVEMENTS.length * 3;
      body.innerHTML = `
        <div class="row"><div class="grow"><div class="kicker">Medals held · ${held} of ${total}</div><div class="bar" style="margin-top:6px"><div style="width:${(held / total) * 100}%"></div></div></div></div>
        <div class="spacer"></div>
        <div class="hon-grid">
          ${ACHIEVEMENTS.map((a, i) => {
            const got = claimedTiers(s, a.id);
            const reached = reachedTiers(s, a);
            const ready = canClaimAchievement(s, a);
            const next = Math.min(got, 2);
            const target = a.tiers[next];
            const v = a.value(s);
            const complete = got >= 3;
            const medal = got > 0 ? `medal_${got}` : 'medal_1';
            return `<div class="hon ${ready ? 'ready' : ''} ${complete ? 'complete' : ''} ${got === 0 && !ready ? 'none' : ''}" style="animation-delay:${i * 0.03}s">
              <img class="hon-medal" src="${assetUrl(ready ? `medal_${Math.min(reached, got + 1)}` : medal)}" alt="">
              <div class="grow">
                <div class="hon-name">${esc(a.name)}</div>
                <div class="hon-desc">${esc(a.desc(fmt(target), target === 1))}</div>
                <div class="hon-pips">${[0, 1, 2].map((t) => `<span class="pip t${t + 1} ${t < got ? 'on' : t < reached ? 'ready' : ''}" title="${TIER_NAMES[t]}"></span>`).join('')}
                  <span class="num faint">${complete ? 'Complete' : `${fmt(Math.min(v, target))} / ${fmt(target)}`}</span></div>
                ${complete ? '' : `<div class="bar ${ready ? '' : 'green'}"><div style="width:${Math.min(100, (v / target) * 100)}%"></div></div>`}
              </div>
              ${ready ? `<button class="btn btn-gold btn-sm" data-act="claim" data-id="${a.id}">Claim ${TIER_NAMES[got]}</button>` : complete ? '' : `<div class="hon-reward">${rewardHtml(TIER_REWARDS[next])}</div>`}
            </div>`;
          }).join('')}
        </div>`;
      onAct(body, {
        claim: (t) => {
          let r: Reward | null = null;
          ctx.game.act((st) => void (r = claimAchievement(st, t.dataset.id!)));
          if (!r) return;
          celebrate(t, r);
          sfx.stamp();
          const a = ACHIEVEMENTS.find((x) => x.id === t.dataset.id)!;
          toast(`${TIER_NAMES[claimedTiers(ctx.game.state, a.id) - 1]} honour · ${a.name}`, 'good', `medal_${claimedTiers(ctx.game.state, a.id)}`);
        },
      });
    },
  });
}

// ---------------------------------------------------------------------------
// welcome back

function awayTime(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  return `${h} hour${h === 1 ? '' : 's'}${m % 60 ? ` ${m % 60} min` : ''}`;
}

export function openAway(ctx: UiCtx, a: AwaySummary, capped: boolean, onClose?: () => void): void {
  const resRow = (r: Partial<Record<string, number>>) =>
    Object.entries(r)
      .filter(([, v]) => (v ?? 0) > 0)
      .map(([k, v]) => `<div class="away-res">${icon(`ic_${k}`, 34)}<b class="num">${fmt(v!)}</b><small>${k}</small></div>`)
      .join('');
  const hasStored = Object.values(a.stored).some((v) => (v ?? 0) > 0);
  const hasGained = Object.values(a.gained).some((v) => (v ?? 0) > 0);
  let harvested = false;
  openModal({
    title: 'Welcome Back, Governor',
    seal: '帰',
    kicker: `Away ${awayTime(a.awayMs)}${capped ? ' · the realm keeps up to 8 hours' : ''}`,
    size: 'wide',
    onClose,
    render: (body, h) => {
      body.innerHTML = `
        <div class="away-hero" style="background-image:url(${assetUrl('ink/away_dawn')})"><p>Your stewards kept the realm while you were gone.</p></div>
        ${
          hasStored
            ? `<div class="away-sec">
                <div class="kicker">Waiting in your stores</div>
                <div class="away-row ${harvested ? 'taken' : ''}">${resRow(a.stored)}</div>
                ${harvested ? '<div class="center muted">Harvested</div>' : '<button class="btn btn-gold btn-xl away-cta" data-act="harvest">Harvest all</button>'}
              </div>`
            : ''
        }
        ${hasGained ? `<div class="away-sec"><div class="kicker">Brought home</div><div class="away-row">${resRow(a.gained)}</div></div>` : ''}
        ${
          a.done.length || a.battlesWon || a.battlesLost || a.raids
            ? `<div class="away-sec"><div class="kicker">Chronicle</div><ul class="away-log">
                ${a.done.slice(0, 6).map((t) => `<li>${esc(t)}</li>`).join('')}
                ${a.done.length > 6 ? `<li class="faint">and ${a.done.length - 6} more</li>` : ''}
                ${a.battlesWon ? `<li>${a.battlesWon} battle${a.battlesWon === 1 ? '' : 's'} won</li>` : ''}
                ${a.battlesLost ? `<li class="bad">${a.battlesLost} battle${a.battlesLost === 1 ? '' : 's'} lost</li>` : ''}
                ${a.raids ? `<li>${a.raids} raid${a.raids === 1 ? '' : 's'} on your walls · see Reports</li>` : ''}
              </ul></div>`
            : ''
        }
        ${!hasStored || harvested ? '<div class="center"><button class="btn btn-xl" data-act="close">To the realm</button></div>' : ''}`;
      onAct(body, {
        harvest: (t) => {
          let got: Partial<Record<ResKey, number>> = {};
          ctx.game.act((st) => void (got = collectAll(st)));
          const b = t.getBoundingClientRect();
          for (const k of Object.keys(got)) flyTo(`ic_${k}`, b.left + b.width / 2, b.top + b.height / 2, document.querySelector(`[data-res=${k}]`), 7);
          sfx.coin();
          sfx.chest();
          harvested = true;
          h.refresh();
        },
        close: () => h.close(),
      });
    },
  });
}
