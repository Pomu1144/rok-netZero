import { assetUrl } from '../../assets';
import { sfx } from '../../audio';
import { MILESTONES, RANK_PRIZES, claimMilestone, claimSeasonPrize, huntPoints, huntPointsFor, leaderboard, milestoneReady, myRank, prizeFor, rollHunt, seasonEnd } from '../../game/hunt';
import type { Reward } from '../../game/state';
import { haptic } from '../../native';
import type { UiCtx } from '../ctx';
import { onAct, openModal, rewardHtml, toast } from '../dom';
import { esc, fmt } from '../format';
import { ink } from '../ink';
import { celebrate } from './daily';

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

/** Milestones sit evenly along the track; the bar fills piecewise between them. */
function trackFill(pts: number): number {
  const n = MILESTONES.length;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const m = MILESTONES[i].points;
    if (pts < m) return ((i + (pts - prev) / (m - prev)) / n) * 100;
    prev = m;
  }
  return 100;
}

export function openHunt(ctx: UiCtx): void {
  ctx.game.act((s) => void rollHunt(s, Date.now()));
  let tick = 0;
  const handle = openModal({
    title: 'The Barbarian Hunt',
    seal: '狩',
    kicker: 'Event · three days',
    size: 'wide',
    live: true,
    onClose: () => clearInterval(tick),
    render: (body, h) => {
      const s = ctx.game.state;
      const hs = s.hunt!;
      const now = Date.now();
      const pts = huntPoints(s);
      const board = leaderboard(s, now);
      const rank = myRank(s, now);
      const res = hs.result && !hs.result.claimed ? hs.result : null;
      const resPrize = res ? prizeFor(res.rank) : null;
      body.innerHTML = `
        <div class="hunt-hero" style="background-image:url(${assetUrl('ink/hunt_banner')})">
          <div class="hunt-title"><div class="kicker">Event</div><div class="hunt-name">The Barbarian Hunt</div>
            <div class="hunt-ends">${ink('i_hourglass', 14, 'dark')} Ends in <b data-role="clock">${countdown(seasonEnd(hs.season) - now)}</b></div></div>
          <div class="hunt-score"><span class="kicker">Your points</span><b class="num">${fmt(pts)}</b><span class="hunt-rank">Rank #${rank}</span></div>
        </div>
        ${
          res
            ? `<div class="row card hunt-result"><div class="seal-big-sm">${res.rank <= 3 ? '勝' : '狩'}</div><div class="grow"><b>Last hunt: rank #${res.rank} with ${fmt(res.points)} points</b><div class="muted">${resPrize ? esc(resPrize.label) : 'Outside the top ten this time'}</div>${resPrize ? rewardHtml(resPrize.reward) : ''}</div>
               <button class="btn btn-gold" data-act="prize">${resPrize ? 'Claim prize' : 'Dismiss'}</button></div>`
            : ''
        }
        <h3 class="sec">Milestones <span class="muted">Lv.1 barbarian ${huntPointsFor('barbarian', 1)} · Lv.5 ${huntPointsFor('barbarian', 5)} · Lv.10 ${huntPointsFor('barbarian', 10)} · fort Lv.1 ${huntPointsFor('fort', 1)} points</span></h3>
        <div class="hunt-track">
          <div class="act-bar"><div style="width:${trackFill(pts)}%"></div></div>
          ${MILESTONES.map((m, i) => {
            const ready = milestoneReady(s, i);
            const done = hs.milestones.includes(i);
            return `<button class="act-chest ${ready ? 'ready' : ''} ${done ? 'opened' : ''}" style="left:${((i + 1) / MILESTONES.length) * 100}%" data-act="ms" data-i="${i}" title="${m.points} points">
              <img src="${assetUrl(`chest_${Math.min(5, 1 + Math.floor(i * 0.8))}`)}" alt=""><span class="num">${fmt(m.points)}</span></button>`;
          }).join('')}
        </div>
        <div class="hunt-cols">
          <div>
            <h3 class="sec">Leaderboard</h3>
            <div class="hunt-board">${board
              .slice(0, 12)
              .map((r, i) => {
                const p = prizeFor(i + 1);
                return `<div class="hunt-row ${r.me ? 'me' : ''}"><span class="hunt-pos ${i < 3 ? 'top' : ''}">${i + 1}</span><span class="grow">${esc(r.name)}</span>${p && i < 3 ? `<span class="hunt-prize">${ink('i_crown', 13, 'gold')}</span>` : ''}<b class="num">${fmt(r.points)}</b></div>`;
              })
              .join('')}${rank > 12 ? `<div class="hunt-row me"><span class="hunt-pos">${rank}</span><span class="grow">${esc(s.governor)}</span><b class="num">${fmt(pts)}</b></div>` : ''}</div>
          </div>
          <div>
            <h3 class="sec">Rank prizes</h3>
            ${RANK_PRIZES.map((p) => `<div class="hunt-tier ${prizeFor(rank) === p ? 'now' : ''}"><div class="kicker">${esc(p.label)}</div>${rewardHtml(p.reward)}</div>`).join('')}
            <div class="action-row"><button class="btn btn-gold btn-xl" data-act="go">${ink('i_swords', 18)} Hunt now</button></div>
          </div>
        </div>`;
      onAct(body, {
        ms: (el) => {
          const i = Number(el.dataset.i);
          let r: Reward | null = null;
          ctx.game.act((st) => void (r = claimMilestone(st, i)));
          if (r) {
            celebrate(el, r);
            toast(`Hunt milestone · ${MILESTONES[i].points} points`, 'good', 'ev_hunt');
          } else sfx.click();
        },
        prize: (el) => {
          let r: Reward | null = null;
          ctx.game.act((st) => void (r = claimSeasonPrize(st)));
          if (r) {
            celebrate(el, r);
            haptic('success');
            toast('Hunt prize claimed', 'good', 'ev_hunt');
          }
        },
        go: () => {
          h.close();
          const st = ctx.game.state;
          const near = st.world
            .filter((o) => o.kind === 'barbarian' && o.level <= st.stats.maxBarbLevel + 1 && (o.respawnAt === undefined || o.respawnAt <= st.time))
            .sort((a, b) => Math.hypot(a.x - 60, a.y - 60) - Math.hypot(b.x - 60, b.y - 60))[0];
          ctx.goWorld(near?.x, near?.y);
        },
      });
    },
  });
  // the countdown runs on the real clock; season rollover refreshes the panel
  tick = window.setInterval(() => {
    const st = ctx.game.state;
    if (st.hunt && Date.now() >= seasonEnd(st.hunt.season)) {
      ctx.game.act((x) => void rollHunt(x, Date.now()));
      handle.refresh();
      return;
    }
    const c = handle.body.querySelector('[data-role=clock]');
    if (c && st.hunt) c.textContent = countdown(seasonEnd(st.hunt.season) - Date.now());
  }, 1000);
}
