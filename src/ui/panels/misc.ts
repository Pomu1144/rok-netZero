import { assetUrl } from '../../assets';
import { setMuted, setMusic, sfx } from '../../audio';
import { persistSave, setHaptics } from '../../native';
import { SAVE_KEY } from '../../game/state';
import { COMMANDERS, COMMANDER_BY_ID } from '../../data/commanders';
import { ITEMS, type ItemId } from '../../data/items';
import { TROOP_NAMES, troopIdSprite } from '../../data/troops';
import type { TroopType } from '../../data/types';
import { cityHallLevel, commanderBusy, hourlyIncome, totalPower, useResourceItem, useTome } from '../../game/logic';
import { activeQuests, claimQuest, questDone, QUESTS } from '../../game/quests';
import { sumTroops, type Report, type Troops } from '../../game/state';
import type { UiCtx } from '../ctx';
import { closeAllModals, icon, onAct, openModal, rewardHtml, toast } from '../dom';
import { esc, fmt, fmtFull } from '../format';
import { ink } from '../ink';
import { openCommanders, openTavern } from './army';
import { openResearch } from './city';

export function openBag(ctx: UiCtx): void {
  let selected: ItemId | null = null;
  openModal({
    title: 'Satchel',
    seal: '品',
    kicker: 'Items · Supplies',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const owned = (Object.keys(ITEMS) as ItemId[]).filter((i) => (s.items[i] ?? 0) > 0);
      const sel = selected && (s.items[selected] ?? 0) > 0 ? selected : null;
      const def = sel ? ITEMS[sel] : null;
      body.innerHTML = `
        ${
          def
            ? `<div class="card row" style="margin-bottom:14px">${icon(def.icon, 64)}<div class="grow"><div class="kicker">${def.kind}</div><b style="font-size:16px">${def.name}</b> <span class="num faint">×${s.items[def.id]}</span><div class="muted">${def.desc}</div></div>
              <div class="col">${
                def.kind === 'resource'
                  ? `<button class="btn btn-gold btn-sm" data-act="use">Use one</button><button class="btn btn-sm" data-act="useall">Use all</button>`
                  : def.kind === 'tome'
                    ? COMMANDERS.filter((c) => s.commanders[c.id].unlocked)
                        .map((c) => `<button class="btn btn-sm" data-act="tome" data-id="${c.id}">${c.name}</button>`)
                        .join('')
                    : def.kind === 'key'
                      ? `<button class="btn btn-gold btn-sm" data-act="tavern">To the Tavern</button>`
                      : `<span class="muted" style="font-style:italic">Apply from any timer</span>`
              }</div></div>`
            : ''
        }
        ${
          owned.length
            ? `<div class="item-grid">${owned
                .map((i) => `<div class="item ${sel === i ? 'sel' : ''}" data-act="pick" data-id="${i}"><img src="${assetUrl(ITEMS[i].icon)}" alt=""><div class="i-name">${ITEMS[i].name}</div><div class="qty">${s.items[i]}</div></div>`)
                .join('')}</div>`
            : '<div class="muted center">The satchel is empty.</div>'
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
    title: 'Chronicle',
    seal: '令',
    kicker: 'Royal decrees',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const list = activeQuests(s, 8);
      const done = s.questsClaimed.length;
      body.innerHTML = `
        <div class="row"><div class="grow"><div class="kicker">Chronicle progress · ${done} of ${QUESTS.length}</div><div class="bar" style="margin-top:6px"><div style="width:${(done / QUESTS.length) * 100}%"></div></div></div></div>
        <div class="spacer"></div>
        ${list
          .map((q, i) => {
            const [p, t] = q.check(s);
            const ok = questDone(s, q);
            return `<div class="quest ${ok ? 'done' : ''}" style="animation-delay:${i * 0.05}s">
              <div class="qseal">令</div>
              <div class="grow">
                <div class="q-title">${esc(q.title)}</div>
                <div class="bar ${ok ? '' : 'green'}" style="margin:6px 0"><div style="width:${Math.min(100, (p / t) * 100)}%"></div></div>
                <div class="row" style="flex-wrap:wrap;gap:10px"><span class="num faint" style="font-size:11px">${fmt(Math.min(p, t))} / ${fmt(t)}</span>${rewardHtml(q.reward)}</div>
              </div>
              ${ok ? `<button class="btn btn-gold" data-act="claim" data-id="${q.id}">Claim</button>` : q.hint ? `<button class="btn btn-sm" data-act="go" data-id="${q.id}">Go</button>` : ''}
            </div>`;
          })
          .join('') || '<div class="center muted">The chronicle is complete. Long live the King.</div>'}`;
      onAct(body, {
        claim: (t) => {
          if (claimQuest(ctx.game.state, t.dataset.id!)) {
            sfx.coin();
            sfx.fanfare();
            toast('Decree fulfilled · reward claimed', 'good', 'ic_chest');
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
      return `<tr><td>${icon(troopIdSprite(k), 18)} ${TROOP_NAMES[t as TroopType][Number(tier) - 1]}</td><td>${fmt(side.start[k])}</td><td class="neg">−${fmt(side.losses[k] ?? 0)}</td><td>${fmt(side.remaining[k] ?? 0)}</td></tr>`;
    })
    .join('')}</table>`;
}

/** Troops-per-round chart, painted on a canvas in two brush colours. */
function drawFlow(canvas: HTMLCanvasElement, tl: { a: number; d: number }[]): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || 520;
  const H = canvas.clientHeight || 120;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(226,204,150,0.08)';
  g.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(0, (H * i) / 4);
    g.lineTo(W, (H * i) / 4);
    g.stroke();
  }
  const max = Math.max(...tl.map((p) => Math.max(p.a, p.d)), 1);
  const line = (key: 'a' | 'd', color: string) => {
    for (const [wd, a] of [[6, 0.15], [2.4, 1]] as const) {
      g.strokeStyle = color.replace('A', String(a));
      g.lineWidth = wd;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      tl.forEach((p, i) => {
        const x = 6 + (i / Math.max(1, tl.length - 1)) * (W - 12);
        const y = H - 8 - (p[key] / max) * (H - 18);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    }
  };
  line('a', 'rgba(232,207,140,A)');
  line('d', 'rgba(217,96,79,A)');
}

function reportDetail(r: Report): string {
  const b = r.body;
  const portrait = (p?: string) =>
    p ? `<div class="vs-portrait ${p.startsWith('cmd_') ? '' : 'contain'}" style="background-image:url(${assetUrl(p)})"></div>` : `<div class="vs-portrait contain" style="background-image:url(${assetUrl('city_player')})"></div>`;
  const seal = r.kind === 'gather' ? '採' : r.kind === 'scout' ? '偵' : r.win ? '勝' : r.win === false ? '敗' : '報';
  const verdict = r.win === undefined ? (r.kind === 'gather' ? 'Harvest' : r.kind === 'scout' ? 'Intelligence' : 'Dispatch') : r.win ? 'Victory' : 'Defeat';
  return `
    <div class="verdict ${r.win === false ? 'lose' : ''}">${r.win ? '<div class="splat"></div>' : ''}<div class="vseal">${seal}</div><div><div class="kicker">${esc(r.title)}</div><div class="vtext">${verdict.toUpperCase()}</div></div></div>
    ${
      b.attacker && b.defender && r.kind !== 'scout'
        ? `<div class="vs">
            <div class="vs-side">${portrait(b.attacker.portrait)}<b>${esc(b.attacker.name)}</b><div class="muted">${fmt(sumTroops(b.attacker.start))} troops</div>${lossTable(b.attacker)}</div>
            <div class="vs-mid"></div>
            <div class="vs-side">${portrait(b.defender.portrait)}<b>${esc(b.defender.name)}</b><div class="muted">${fmt(sumTroops(b.defender.start))} troops</div>${lossTable(b.defender)}</div>
          </div>`
        : b.defender
          ? `<div class="card">${lossTable(b.defender)}</div>`
          : ''
    }
    ${b.timeline && b.timeline.length > 1 ? `<h3 class="sec">Course of battle</h3><canvas class="flow"></canvas><div class="legend"><span><i style="background:var(--accent-2)"></i>Attacker</span><span><i style="background:var(--red-2)"></i>Defender</span><span>troops per round</span></div>` : ''}
    ${b.lines.length ? `<h3 class="sec">Chronicle</h3><div class="col" style="gap:4px">${b.lines.map((l) => `<div class="muted" style="font-style:italic">${esc(l)}</div>`).join('')}</div>` : ''}
    ${b.rewards ? `<h3 class="sec">Spoils</h3>${rewardHtml(b.rewards)}` : ''}`;
}

export function openMail(ctx: UiCtx, focusId?: string): void {
  let selected = focusId ?? ctx.game.state.reports[0]?.id ?? null;
  openModal({
    title: 'Dispatches',
    seal: '書',
    kicker: 'Reports · Battle records',
    size: 'wide',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const sel = s.reports.find((r) => r.id === selected) ?? s.reports[0];
      if (sel) sel.read = true;
      const mark = (r: Report) => (r.kind === 'gather' ? '採' : r.kind === 'scout' ? '偵' : r.kind === 'raid' ? '襲' : r.win ? '勝' : r.win === false ? '敗' : '報');
      body.innerHTML = s.reports.length
        ? `<div class="mail-layout">
            <div class="mail-list">${s.reports
              .map((r) => `<div class="mail-item ${r.id === sel?.id ? 'sel' : ''} ${r.read ? '' : 'unread'} ${r.win || r.kind === 'gather' ? 'win' : ''}" data-act="pick" data-id="${r.id}"><span class="m-ic">${mark(r)}</span><div class="grow"><div class="m-title">${esc(r.title)}</div><div class="kicker" style="font-size:8px;color:var(--faint)">${r.kind}</div></div></div>`)
              .join('')}</div>
            <div>${sel ? reportDetail(sel) : ''}</div>
          </div>`
        : '<div class="muted center">No dispatches yet. Send your armies into the realm.</div>';
      const flow = body.querySelector('canvas.flow') as HTMLCanvasElement | null;
      if (flow && sel?.body.timeline) requestAnimationFrame(() => drawFlow(flow, sel.body.timeline!));
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
    seal: '設',
    kicker: 'Court · Preferences',
    size: 'narrow',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      body.innerHTML = `
        <h3 class="sec">Pace of time</h3>
        <div class="muted">Timers, production and marches run at this multiple of real time. Time away is also counted, up to eight hours.</div>
        <div class="row" style="flex-wrap:wrap;margin-top:10px">
          ${[1, 5, 20, 60].map((v) => `<button class="btn ${s.speed === v ? 'btn-gold' : ''}" data-act="speed" data-v="${v}">${v}×</button>`).join('')}
        </div>
        <h3 class="sec">Sound &amp; feel</h3>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn ${s.muted ? '' : 'btn-gold'}" data-act="mute">Sound ${s.muted ? 'off' : 'on'}</button>
          <button class="btn ${s.musicOff ? '' : 'btn-gold'}" data-act="music">Music ${s.musicOff ? 'off' : 'on'}</button>
          <button class="btn ${s.hapticsOff ? '' : 'btn-gold'}" data-act="haptics">Vibration ${s.hapticsOff ? 'off' : 'on'}</button>
        </div>
        <h3 class="sec">Chronicle backup</h3>
        <div class="muted">Copy your save to move it to another device, or paste one to restore it.</div>
        <div class="row" style="flex-wrap:wrap;margin-top:10px">
          <button class="btn" data-act="export">Copy save</button>
          <button class="btn" data-act="import">Restore save</button>
        </div>
        <h3 class="sec">Governor</h3>
        <div class="row"><input type="text" value="${esc(s.governor)}" maxlength="18" data-role="name" style="flex:1;width:auto"><button class="btn" data-act="rename">Rename</button></div>
        <h3 class="sec">About</h3>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn btn-sm" data-act="privacy">Privacy policy</button>
          <span class="muted">Version 1.0.0 · Art painted with Higgsfield</span>
        </div>
        <h3 class="sec">Abdicate</h3>
        <button class="btn btn-red" data-act="reset">Found a new kingdom</button>`;
      onAct(body, {
        speed: (t) => ctx.game.act((st) => void (st.speed = Number(t.dataset.v))),
        mute: () => {
          ctx.game.act((st) => void (st.muted = !st.muted));
          setMuted(ctx.game.state.muted);
        },
        music: () => {
          ctx.game.act((st) => void (st.musicOff = !st.musicOff));
          setMusic(!ctx.game.state.musicOff);
        },
        haptics: () => {
          ctx.game.act((st) => void (st.hapticsOff = !st.hapticsOff));
          setHaptics(!ctx.game.state.hapticsOff);
        },
        export: () => {
          ctx.game.save();
          const raw = localStorage.getItem(SAVE_KEY) ?? '';
          const code = btoa(unescape(encodeURIComponent(raw)));
          navigator.clipboard?.writeText(code).then(
            () => toast('Save copied to the clipboard', 'good'),
            () => prompt('Copy your save code:', code),
          ) ?? prompt('Copy your save code:', code);
        },
        import: () => {
          const code = prompt('Paste a save code to restore it. Your current kingdom will be replaced.');
          if (!code) return;
          try {
            const raw = decodeURIComponent(escape(atob(code.trim())));
            const parsed = JSON.parse(raw) as { state?: { version?: number } };
            if (!parsed.state?.version) throw new Error('bad save');
            // stamp it as the newest save so device storage doesn't win on reload
            const fresh = JSON.stringify({ ...(parsed as object), savedAt: Date.now() });
            localStorage.setItem(SAVE_KEY, fresh);
            void persistSave(fresh).then(() => location.reload());
          } catch {
            toast('That save code could not be read', 'bad');
          }
        },
        privacy: () =>
          openModal({
            title: 'Privacy Policy',
            seal: '書',
            kicker: 'Court · Privacy',
            render: (b) => {
              b.innerHTML = '<iframe src="./privacy.html" title="Privacy policy" style="width:100%;height:62vh;border:0;background:#0b0b0c"></iframe>';
            },
          }),
        rename: () => {
          const v = (body.querySelector('[data-role=name]') as HTMLInputElement).value.trim();
          if (v) ctx.game.act((st) => void (st.governor = v.slice(0, 18)));
          toast('The court records your new name', 'good');
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
    title: ctx.game.state.governor,
    seal: '王',
    kicker: 'Governor · Realm overview',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const inc = hourlyIncome(s);
      const troops: Troops = { ...s.troops };
      for (const m of s.marches) for (const k in m.troops) troops[k] = (troops[k] ?? 0) + m.troops[k];
      body.innerHTML = `
        <div class="row card">
          <div class="gov-avatar" style="width:92px;height:92px;background-image:url(${assetUrl('city_player')})"></div>
          <div class="grow kv">
            <span class="k">Power</span><b>${fmtFull(totalPower(s))}</b>
            <span class="k">City Hall</span><b>Lv.${cityHallLevel(s)}</b>
            <span class="k">Barbarians slain</span><b>${fmtFull(s.stats.barbsKilled)}</b>
            <span class="k">Troops trained</span><b>${fmtFull(s.stats.troopsTrained)}</b>
            <span class="k">Resources gathered</span><b>${fmtFull(s.stats.gathered)}</b>
          </div>
          <button class="btn btn-sm" data-act="settings">${ink('i_gear', 15)} Settings</button>
        </div>
        <h3 class="sec">Income per hour</h3>
        <div class="costs">${(['food', 'wood', 'stone', 'gold'] as const).map((k) => `<span class="cost">${icon(`ic_${k}`)} +${fmt(inc[k])}</span>`).join('')}</div>
        <h3 class="sec">Army · ${fmtFull(sumTroops(troops))}</h3>
        <div class="costs">${
          Object.entries(troops)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => {
              const [t, tier] = k.split('_');
              return `<span class="cost">${icon(troopIdSprite(k), 26)} ${TROOP_NAMES[t as TroopType][Number(tier) - 1]} · ${fmtFull(n)}</span>`;
            })
            .join('') || '<span class="muted">No troops</span>'
        }</div>
        <h3 class="sec">Generals</h3>
        <div class="costs">${COMMANDERS.filter((c) => s.commanders[c.id].unlocked)
          .map((c) => `<span class="cost">${icon(c.portrait, 26)} ${c.name} · Lv.${s.commanders[c.id].level}${commanderBusy(s, c.id) ? ' · marching' : ''}</span>`)
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
  `Welcome, <b>Governor</b>. I am Joan, and I will counsel you. This land is wild and thick with <b>barbarians</b>; with wisdom and steel your city will become a kingdom.`,
  `<b>Grow your economy.</b> Farms and mills fill their stores over time; tap the floating seal to harvest. Raise the <b>City Hall</b> to unlock new buildings and lift every level cap.`,
  `<b>Raise an army.</b> Infantry break cavalry, cavalry ride down archers, archers shred infantry. Lead them with <b>commanders</b> whose skills strike when their rage is full.`,
  `<b>Conquer the realm.</b> Open the world map to slay barbarians, gather from rich lands, seize Holy Sites and plunder rival lords. The <b>decree</b> on the right shows your next step.`,
];

export function openAdvisor(_ctx: UiCtx, onDone: () => void): void {
  let step = 0;
  openModal({
    title: 'Joan of Arc',
    seal: '令',
    kicker: 'Royal advisor',
    onClose: onDone,
    render: (body, h) => {
      body.innerHTML = `
        <div class="advisor">
          <div class="adv-portrait" style="background-image:url(${assetUrl(COMMANDER_BY_ID.joan.portrait)})"></div>
          <div class="col">
            <div class="speech" key="${step}">${ADVISOR_STEPS[step]}</div>
            <div class="action-row">
              <span class="speech-step">${step + 1} / ${ADVISOR_STEPS.length}</span>
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
