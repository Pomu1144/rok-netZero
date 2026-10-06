import { assetUrl } from '../../assets';
import { setMuted, sfx } from '../../audio';
import { COMMANDERS, COMMANDER_BY_ID } from '../../data/commanders';
import { ITEMS, type ItemId } from '../../data/items';
import { TROOP_NAMES, TROOP_SPRITES } from '../../data/troops';
import type { TroopType } from '../../data/types';
import { cityHallLevel, commanderBusy, hourlyIncome, totalPower, useResourceItem, useTome } from '../../game/logic';
import { activeQuests, claimQuest, questDone, QUESTS } from '../../game/quests';
import { sumTroops, type Report, type Troops } from '../../game/state';
import type { UiCtx } from '../ctx';
import { closeAllModals, icon, onAct, openModal, rewardHtml, toast } from '../dom';
import { esc, fmt, fmtFull } from '../format';
import { openCommanders, openTavern } from './army';
import { openResearch } from './city';

export function openBag(ctx: UiCtx): void {
  let selected: ItemId | null = null;
  openModal({
    title: 'Items',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const owned = (Object.keys(ITEMS) as ItemId[]).filter((i) => (s.items[i] ?? 0) > 0);
      const sel = selected && (s.items[selected] ?? 0) > 0 ? selected : null;
      const def = sel ? ITEMS[sel] : null;
      body.innerHTML = `
        ${
          def
            ? `<div class="card row" style="margin-bottom:12px">${icon(def.icon, 64)}<div class="grow"><b>${def.name}</b> <span class="muted">×${s.items[def.id]}</span><div class="muted">${def.desc}</div></div>
              <div class="col">${
                def.kind === 'resource'
                  ? `<button class="btn btn-green btn-sm" data-act="use">Use 1</button><button class="btn btn-green btn-sm" data-act="useall">Use all</button>`
                  : def.kind === 'tome'
                    ? COMMANDERS.filter((c) => s.commanders[c.id].unlocked)
                        .map((c) => `<button class="btn btn-blue btn-sm" data-act="tome" data-id="${c.id}">${c.name}</button>`)
                        .join('')
                    : def.kind === 'key'
                      ? `<button class="btn btn-gold btn-sm" data-act="tavern">Go to Tavern</button>`
                      : `<span class="muted">Use from any timer</span>`
              }</div></div>`
            : ''
        }
        ${
          owned.length
            ? `<div class="item-grid">${owned
                .map((i) => `<div class="item" data-act="pick" data-id="${i}" style="${sel === i ? 'box-shadow:0 0 14px rgba(230,160,40,.8);border-color:#d08a1a' : ''}"><img src="${assetUrl(ITEMS[i].icon)}"><div class="i-name">${ITEMS[i].name}</div><div class="qty">${s.items[i]}</div></div>`)
                .join('')}</div>`
            : '<div class="muted center">Your bag is empty.</div>'
        }`;
      onAct(body, {
        pick: (t) => {
          selected = t.dataset.id as ItemId;
          sfx.click();
          ctx.game.emitChange();
        },
        use: () => sel && ctx.run((st) => useResourceItem(st, sel, 1), sfx.coin),
        useall: () => sel && ctx.run((st) => useResourceItem(st, sel, st.items[sel] ?? 0), sfx.coin),
        tome: (t) => sel && ctx.run((st) => useTome(st, sel, t.dataset.id!), sfx.coin),
        tavern: () => openTavern(ctx),
      });
    },
  });
}

// ---------------------------------------------------------------------------

export function openQuests(ctx: UiCtx): void {
  openModal({
    title: 'Chronicle Quests',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const list = activeQuests(s, 8);
      const done = s.questsClaimed.length;
      body.innerHTML = `
        <div class="row"><div class="grow"><div class="muted">Chronicle progress ${done}/${QUESTS.length}</div><div class="bar" style="height:12px"><div style="width:${(done / QUESTS.length) * 100}%"></div></div></div></div>
        <div class="spacer"></div>
        ${list
          .map((q) => {
            const [p, t] = q.check(s);
            const ok = questDone(s, q);
            return `<div class="quest ${ok ? 'done' : ''}">
              ${icon('nav_quests', 40)}
              <div class="grow">
                <div class="q-title">${esc(q.title)}</div>
                <div class="bar green" style="margin:4px 0"><div style="width:${Math.min(100, (p / t) * 100)}%"></div></div>
                <div class="row"><span class="muted">${fmt(Math.min(p, t))} / ${fmt(t)}</span>${rewardHtml(q.reward)}</div>
              </div>
              ${ok ? `<button class="btn btn-gold" data-act="claim" data-id="${q.id}">Claim</button>` : q.hint ? `<button class="btn btn-blue btn-sm" data-act="go" data-id="${q.id}">Go</button>` : ''}
            </div>`;
          })
          .join('') || '<div class="center muted">You have completed the chronicle. Long live the King!</div>'}`;
      onAct(body, {
        claim: (t) => {
          if (claimQuest(ctx.game.state, t.dataset.id!)) {
            sfx.coin();
            sfx.fanfare();
            toast('Quest reward claimed!', 'good', 'ic_chest');
            ctx.game.act(() => {});
          }
        },
        go: (t) => {
          const q = QUESTS.find((x) => x.id === t.dataset.id)!;
          h.close();
          questGo(ctx, q.hint!);
        },
      });
    },
  });
}

export function questGo(ctx: UiCtx, hint: NonNullable<(typeof QUESTS)[number]['hint']>): void {
  closeAllModals();
  if (hint.plot) ctx.goCity(hint.plot);
  else if (hint.view === 'world') ctx.goWorld();
  else if (hint.view === 'commanders') openCommanders(ctx);
  else if (hint.view === 'research') openResearch(ctx);
  else if (hint.view === 'tavern') openTavern(ctx);
}

// ---------------------------------------------------------------------------

function lossTable(side: NonNullable<Report['body']['attacker']>): string {
  const ids = Object.keys(side.start).filter((k) => side.start[k] > 0);
  if (!ids.length) return '<div class="muted">No troops</div>';
  return `<table class="loss-table"><tr><th>Unit</th><th>Troops</th><th>Lost</th><th>Left</th></tr>${ids
    .map((k) => {
      const [t, tier] = k.split('_');
      return `<tr><td>${icon(TROOP_SPRITES[t as TroopType], 18)} ${TROOP_NAMES[t as TroopType][Number(tier) - 1]}</td><td>${fmt(side.start[k])}</td><td class="neg">-${fmt(side.losses[k] ?? 0)}</td><td>${fmt(side.remaining[k] ?? 0)}</td></tr>`;
    })
    .join('')}</table>`;
}

function timelineSvg(tl: { a: number; d: number }[]): string {
  if (tl.length < 2) return '';
  const max = Math.max(...tl.map((p) => Math.max(p.a, p.d)), 1);
  const W = 520;
  const H = 110;
  const path = (key: 'a' | 'd') => tl.map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / (tl.length - 1)) * W).toFixed(1)},${(H - (p[key] / max) * (H - 8)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:110px;background:rgba(0,0,0,.25);border-radius:10px">
    <path d="${path('a')}" stroke="#5aa2ff" stroke-width="3" fill="none"/>
    <path d="${path('d')}" stroke="#ff6a4d" stroke-width="3" fill="none"/>
  </svg><div class="muted center" style="font-size:12px"><span style="color:#5aa2ff">■</span> Attacker · <span style="color:#ff6a4d">■</span> Defender · troops per round</div>`;
}

function reportDetail(r: Report): string {
  const b = r.body;
  const portrait = (p?: string) => (p ? `<div class="vs-portrait" style="background-image:url(${assetUrl(p)})"></div>` : `<div class="vs-portrait" style="display:grid;place-items:center;font-size:40px">🏰</div>`);
  return `
    ${r.win !== undefined ? `<div class="verdict ${r.win ? 'win' : 'lose'}">${r.win ? 'VICTORY' : 'DEFEAT'}</div>` : `<div class="verdict">${esc(r.title)}</div>`}
    ${
      b.attacker && b.defender && r.kind !== 'scout'
        ? `<div class="vs">
            <div class="vs-side">${portrait(b.attacker.portrait)}<b>${esc(b.attacker.name)}</b><div class="muted">${fmt(sumTroops(b.attacker.start))} troops</div>${lossTable(b.attacker)}</div>
            <div class="vs-mid">VS</div>
            <div class="vs-side">${portrait(b.defender.portrait)}<b>${esc(b.defender.name)}</b><div class="muted">${fmt(sumTroops(b.defender.start))} troops</div>${lossTable(b.defender)}</div>
          </div>`
        : b.defender
          ? `<div class="card">${lossTable(b.defender)}</div>`
          : ''
    }
    ${b.timeline ? `<h3 class="sec">Battle flow</h3>${timelineSvg(b.timeline)}` : ''}
    ${b.lines.length ? `<h3 class="sec">Chronicle</h3><div class="col" style="gap:4px">${b.lines.map((l) => `<div class="muted">• ${esc(l)}</div>`).join('')}</div>` : ''}
    ${b.rewards ? `<h3 class="sec">Rewards</h3>${rewardHtml(b.rewards)}` : ''}`;
}

export function openMail(ctx: UiCtx, focusId?: string): void {
  let selected = focusId ?? ctx.game.state.reports[0]?.id ?? null;
  openModal({
    title: 'Reports',
    size: 'wide',
    dark: true,
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const sel = s.reports.find((r) => r.id === selected) ?? s.reports[0];
      if (sel) sel.read = true;
      const color = (r: Report) => (r.kind === 'gather' ? '#7ee06a' : r.kind === 'scout' ? '#f2d16b' : r.win ? '#5aa2ff' : r.win === false ? '#ff6a4d' : '#aaa');
      body.innerHTML = s.reports.length
        ? `<div class="mail-layout">
            <div class="mail-list">${s.reports
              .map((r) => `<div class="mail-item ${r.id === sel?.id ? 'sel' : ''} ${r.read ? '' : 'unread'}" data-act="pick" data-id="${r.id}"><span class="dot" style="background:${color(r)}"></span><div class="grow"><div class="m-title">${esc(r.title)}</div><div class="muted" style="font-size:11px">${r.kind}</div></div></div>`)
              .join('')}</div>
            <div>${sel ? reportDetail(sel) : ''}</div>
          </div>`
        : '<div class="muted center">No reports yet. Send your armies into the world!</div>';
      onAct(body, {
        pick: (t) => {
          selected = t.dataset.id!;
          sfx.click();
          ctx.game.emitChange();
        },
      });
    },
  });
}

// ---------------------------------------------------------------------------

export function openSettings(ctx: UiCtx): void {
  openModal({
    title: 'Settings',
    size: 'narrow',
    dark: true,
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      body.innerHTML = `
        <h3 class="sec">Game speed</h3>
        <div class="muted">Timers, production and marches run at this multiple of real time. Offline progress is also applied (up to 8 hours).</div>
        <div class="row" style="flex-wrap:wrap;margin-top:8px">
          ${[1, 5, 20, 60].map((v) => `<button class="btn ${s.speed === v ? 'btn-gold' : 'btn-dark'}" data-act="speed" data-v="${v}">${v}×</button>`).join('')}
        </div>
        <h3 class="sec">Audio</h3>
        <button class="btn btn-dark" data-act="mute">${s.muted ? '🔇 Sound off' : '🔊 Sound on'}</button>
        <h3 class="sec">Governor</h3>
        <div class="row"><input type="text" value="${esc(s.governor)}" maxlength="18" data-role="name" style="flex:1;font:inherit;padding:8px;border-radius:8px;border:1px solid var(--gold);background:#0c1326;color:#fff"><button class="btn btn-blue" data-act="rename">Rename</button></div>
        <h3 class="sec">Danger zone</h3>
        <button class="btn btn-red" data-act="reset">Start a new kingdom</button>`;
      onAct(body, {
        speed: (t) => ctx.game.act((st) => void (st.speed = Number(t.dataset.v))),
        mute: () => {
          ctx.game.act((st) => void (st.muted = !st.muted));
          setMuted(ctx.game.state.muted);
        },
        rename: () => {
          const v = (body.querySelector('[data-role=name]') as HTMLInputElement).value.trim();
          if (v) ctx.game.act((st) => void (st.governor = v.slice(0, 18)));
          toast('Governor renamed', 'good');
        },
        reset: () => {
          if (confirm('Abandon this kingdom and start over? This cannot be undone.')) {
            ctx.game.reset();
            closeAllModals();
            location.reload();
          }
        },
      });
    },
  });
}

// ---------------------------------------------------------------------------

export function openProfile(ctx: UiCtx): void {
  openModal({
    title: 'Governor Profile',
    dark: true,
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const inc = hourlyIncome(s);
      const troops: Troops = { ...s.troops };
      for (const m of s.marches) for (const k in m.troops) troops[k] = (troops[k] ?? 0) + m.troops[k];
      body.innerHTML = `
        <div class="row card">
          <div class="gov-avatar" style="width:96px;height:96px;background-image:url(${assetUrl('city_player')})"></div>
          <div class="grow"><div class="lvl-arrow" style="color:var(--gold-3)">${esc(s.governor)}</div>
          <div class="kv"><span class="k">Power</span><b>${fmtFull(totalPower(s))}</b><span class="k">City Hall</span><b>Lv.${cityHallLevel(s)}</b>
          <span class="k">Barbarians slain</span><b>${fmtFull(s.stats.barbsKilled)}</b><span class="k">Troops trained</span><b>${fmtFull(s.stats.troopsTrained)}</b>
          <span class="k">Resources gathered</span><b>${fmtFull(s.stats.gathered)}</b></div></div>
          <button class="btn btn-dark btn-sm" data-act="settings">⚙ Settings</button>
        </div>
        <h3 class="sec">Income per hour</h3>
        <div class="costs">${(['food', 'wood', 'stone', 'gold'] as const).map((k) => `<span class="cost">${icon(`ic_${k}`)} +${fmt(inc[k])}</span>`).join('')}</div>
        <h3 class="sec">Army (${fmtFull(sumTroops(troops))})</h3>
        <div class="costs">${Object.entries(troops)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => {
            const [t, tier] = k.split('_');
            return `<span class="cost">${icon(TROOP_SPRITES[t as TroopType], 26)} ${TROOP_NAMES[t as TroopType][Number(tier) - 1]} · ${fmtFull(n)}</span>`;
          })
          .join('') || '<span class="muted">No troops</span>'}</div>
        <h3 class="sec">Commanders</h3>
        <div class="costs">${COMMANDERS.filter((c) => s.commanders[c.id].unlocked)
          .map((c) => `<span class="cost">${icon(c.portrait, 26)} ${c.name} Lv.${s.commanders[c.id].level}${commanderBusy(s, c.id) ? ' · marching' : ''}</span>`)
          .join('')}</div>`;
      onAct(body, {
        settings: () => {
          h.close();
          openSettings(ctx);
        },
      });
    },
  });
}

// ---------------------------------------------------------------------------

const ADVISOR_STEPS = [
  `Welcome, <b>Governor</b>! I am Joan, and I will be your advisor. This land is wild and full of <b>barbarians</b> — but with wisdom and steel, your city will become a mighty kingdom.`,
  `<b>Grow your economy.</b> Farms and Lumber Mills produce resources over time — tap the floating bubbles to harvest. Upgrade the <b>City Hall</b> to unlock new buildings and raise every level cap.`,
  `<b>Raise an army.</b> Train infantry, archers and cavalry. Infantry beats cavalry, cavalry beats archers, archers beat infantry. Lead them with legendary <b>commanders</b> whose skills fire as rage builds in battle.`,
  `<b>Conquer the world.</b> Tap the map button to explore. Slay barbarians for experience and loot, gather resources from nodes, capture Holy Sites, and plunder rival governors. Follow the <b>quest scroll</b> on the right — glory awaits!`,
];

export function openAdvisor(_ctx: UiCtx, onDone: () => void): void {
  let step = 0;
  openModal({
    title: 'Royal Advisor',
    dark: true,
    onClose: onDone,
    render: (body, h) => {
      body.innerHTML = `
        <div class="advisor">
          <div class="adv-portrait" style="background-image:url(${assetUrl(COMMANDER_BY_ID.joan.portrait)})"></div>
          <div class="grow col">
            <div class="speech">${ADVISOR_STEPS[step]}</div>
            <div class="action-row">
              <span class="muted">${step + 1} / ${ADVISOR_STEPS.length}</span>
              <button class="btn btn-gold" data-act="next">${step < ADVISOR_STEPS.length - 1 ? 'Continue' : 'Begin my reign'}</button>
            </div>
          </div>
        </div>`;
      onAct(body, {
        next: () => {
          sfx.click();
          if (step < ADVISOR_STEPS.length - 1) {
            step++;
            h.refresh();
          } else h.close();
        },
      });
    },
  });
}
