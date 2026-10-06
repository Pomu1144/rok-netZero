import { assetUrl } from '../../assets';
import { sfx } from '../../audio';
import {
  BUILDINGS,
  MAX_LEVEL,
  hospitalCapacity,
  marchSlots,
  maxTierForLevel,
  producerCapacity,
  productionPerHour,
  trainingCapacity,
  wallDefense,
} from '../../data/buildings';
import { ITEMS, type ItemId } from '../../data/items';
import { PLOT_BY_ID } from '../../data/layout';
import { TECHS, TECH_BY_ID } from '../../data/research';
import { TIER_NAMES, TRAINED_AT, TROOP_NAMES, TROOP_SPRITES, troopCost, troopStats } from '../../data/troops';
import type { TroopType } from '../../data/types';
import {
  FREE_FINISH_SECONDS,
  buildingLevel,
  canAfford,
  cancelJob,
  finishWithGems,
  gemCostToFinish,
  healPlan,
  hospitalCap,
  productionRate,
  remainingSeconds,
  researchInfo,
  resourceProtection,
  speedUp,
  startHealing,
  startResearch,
  startTraining,
  startUpgrade,
  trainSeconds,
  trainingJob,
  upgradeInfo,
  useSpeedupItem,
} from '../../game/logic';
import { sumTroops, type Job } from '../../game/state';
import type { UiCtx } from '../ctx';
import { costHtml, icon, onAct, openModal, toast } from '../dom';
import { esc, fmt, fmtFull, fmtTime } from '../format';
import { openTavern } from './army';

function jobBar(job: Job, color = ''): string {
  return `<div class="row" style="gap:8px">
    <div class="bar ${color} grow" style="height:14px"><div data-start="${job.start}" data-end="${job.end}"></div></div>
    <span class="timer-chip">⏳ <span data-end="${job.end}"></span></span>
  </div>`;
}

function buildingStats(type: keyof typeof BUILDINGS, level: number, next: number, ctx: UiCtx): [string, string, string][] {
  const s = ctx.game.state;
  const rows: [string, string, string][] = [];
  const def = BUILDINGS[type];
  if (def.producer) {
    rows.push(['Production / hour', fmt(productionPerHour(level)), fmt(productionPerHour(next))]);
    const sh = buildingLevel(s, 'storehouse');
    rows.push(['Storage capacity', fmt(producerCapacity(level, sh)), fmt(producerCapacity(next, sh))]);
  }
  if (def.trains) {
    rows.push(['Training capacity', fmt(trainingCapacity(level)), fmt(trainingCapacity(next))]);
    rows.push(['Highest troop tier', TIER_NAMES[Math.max(0, maxTierForLevel(level) - 1)], TIER_NAMES[maxTierForLevel(next) - 1]]);
  }
  if (type === 'hospital') rows.push(['Hospital capacity', fmt(hospitalCapacity(level)), fmt(hospitalCapacity(next))]);
  if (type === 'wall') rows.push(['Garrison defense bonus', `+${Math.round(wallDefense(level) * 100)}%`, `+${Math.round(wallDefense(next) * 100)}%`]);
  if (type === 'city_hall') {
    rows.push(['March queues', `${marchSlots(level)}`, `${marchSlots(next)}`]);
    rows.push(['Building level cap', `${level}`, `${next}`]);
  }
  if (type === 'storehouse') rows.push(['Protected resources', fmt(5000 + 12000 * level), fmt(5000 + 12000 * next)]);
  if (type === 'scout_camp') rows.push(['Scout speed', `+${level * 10}%`, `+${next * 10}%`]);
  if (type === 'academy') {
    const unlocks = TECHS.filter((t) => t.academyLevel === next).map((t) => t.name);
    if (unlocks.length) rows.push(['Unlocks research', '', unlocks.join(', ')]);
  }
  return rows;
}

export function openBuilding(ctx: UiCtx, plotId: string): void {
  const plot = PLOT_BY_ID[plotId];
  const def = BUILDINGS[plot.type];
  openModal({
    title: def.name,
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const b = s.buildings[plotId];
      h.setTitle(b.level > 0 ? `${def.name} · Lv.${b.level}` : `Build ${def.name}`);
      const job = s.jobs.find((j) => j.kind === 'build' && j.target === plotId);
      const info = upgradeInfo(s, plotId);
      const maxed = b.level >= MAX_LEVEL;
      const rows = maxed ? [] : buildingStats(plot.type, b.level, info.toLevel, ctx);
      const builders = s.jobs.filter((j) => j.kind === 'build').length;
      body.innerHTML = `
        <div class="bld-hero">
          <img class="big" src="${assetUrl(def.sprite)}" alt="">
          <div class="grow col">
            <div class="lvl-arrow">Lv.${b.level}${maxed ? ' <small>(MAX)</small>' : ` → <span class="to">Lv.${info.toLevel}</span>`}</div>
            <div class="muted">${esc(def.desc)}</div>
            ${def.producer && b.level > 0 ? `<div class="muted">Current output: <b>${fmt(productionRate(s, plotId))}</b> ${def.producer}/hour (incl. bonuses)</div>` : ''}
            ${plot.type === 'storehouse' && b.level > 0 ? `<div class="muted">Resources protected from raids: <b>${fmt(resourceProtection(s))}</b> each</div>` : ''}
            ${rows.length ? `<table class="stat-table">${rows.map(([k, a, n]) => `<tr><td>${k}</td><td>${a}${a ? ' → ' : ''}<span class="up">${n}</span></td></tr>`).join('')}</table>` : ''}
          </div>
        </div>
        ${
          job
            ? `<h3 class="sec">Under construction</h3>
               <div class="card">${jobBar(job, 'green')}
               <div class="action-row">
                 <button class="btn btn-red btn-sm" data-act="cancel">Cancel</button>
                 <button class="btn btn-blue" data-act="speed">${icon('ic_speedup')} Speed Up</button>
               </div></div>`
            : maxed
              ? ''
              : `<h3 class="sec">Requirements</h3>
                 <div class="col">
                   ${info.reasons.map((r) => `<div class="req">✗ ${esc(r)}</div>`).join('') || '<div class="req ok">✓ All requirements met</div>'}
                   <div class="req ${builders < s.builders ? 'ok' : ''}">${builders < s.builders ? '✓' : '✗'} Builders available: ${s.builders - builders}/${s.builders}</div>
                 </div>
                 <h3 class="sec">Cost</h3>
                 ${costHtml(s, info.cost)}
                 <div class="action-row">
                   <span class="timer-chip">⏳ ${fmtTime(info.seconds)}</span>
                   <button class="btn btn-gold btn-xl" data-act="upgrade" ${!info.ok || !canAfford(s, info.cost) || builders >= s.builders ? 'disabled' : ''}>
                     ${b.level > 0 ? 'Upgrade' : 'Build'}
                   </button>
                 </div>`
        }
        ${b.level > 0 ? extraActions(ctx, plot.type) : ''}`;
      onAct(body, {
        upgrade: () => {
          if (ctx.run((st) => startUpgrade(st, plotId), sfx.build)) {
            toast(`${def.name} ${b.level > 0 ? 'upgrade' : 'construction'} started`, 'good', 'ic_build');
            h.close();
          }
        },
        cancel: () => job && ctx.run((st) => cancelJob(st, job.id)),
        speed: () => job && openSpeedup(ctx, job.id),
        train: (t) => openTrain(ctx, t.dataset.type as TroopType),
        research: () => openResearch(ctx),
        heal: () => openHospital(ctx),
        tavern: () => openTavern(ctx),
        world: () => {
          h.close();
          ctx.goWorld();
        },
      });
    },
  });
}

function extraActions(ctx: UiCtx, type: keyof typeof BUILDINGS): string {
  const def = BUILDINGS[type];
  const s = ctx.game.state;
  let btn = '';
  if (def.trains) btn = `<button class="btn btn-green" data-act="train" data-type="${def.trains}">${icon(TROOP_SPRITES[def.trains], 24)} Train ${def.trains}</button>`;
  if (type === 'academy') btn = `<button class="btn btn-purple" data-act="research">${icon('nav_research', 24)} Research</button>`;
  if (type === 'hospital') btn = `<button class="btn btn-red" data-act="heal">⚕ Heal (${fmt(sumTroops(s.wounded))})</button>`;
  if (type === 'tavern') btn = `<button class="btn btn-gold" data-act="tavern">${icon('ic_chest', 24)} Open Chests</button>`;
  if (type === 'scout_camp') btn = `<button class="btn btn-blue" data-act="world">${icon('nav_map', 24)} Scout the map</button>`;
  return btn ? `<div class="action-row" style="justify-content:flex-start">${btn}</div>` : '';
}

// ---------------------------------------------------------------------------

export function openTrain(ctx: UiCtx, type: TroopType): void {
  let tier = 1;
  let amount = 0;
  const bType = TRAINED_AT[type];
  const s0 = ctx.game.state;
  tier = Math.max(1, maxTierForLevel(buildingLevel(s0, bType)));
  openModal({
    title: `${BUILDINGS[bType].name} · Train`,
    render: (body, h) => {
      const s = ctx.game.state;
      const lvl = buildingLevel(s, bType);
      const maxTier = maxTierForLevel(lvl);
      const cap = trainingCapacity(lvl);
      const cost = troopCost(type, tier);
      let affordable = cap;
      for (const k in cost) affordable = Math.min(affordable, Math.floor(s.res[k as keyof typeof s.res] / (cost[k as keyof typeof cost] ?? 1)));
      if (amount === 0) amount = Math.max(0, Math.min(cap, affordable));
      amount = Math.min(amount, cap);
      const st = troopStats(type, tier);
      const job = trainingJob(s, type);
      const tabs = [1, 2, 3, 4, 5]
        .map((t) => {
          const locked = t > maxTier;
          const id = `${type}_${t}`;
          return `<div class="tier-tab ${t === tier ? 'sel' : ''} ${locked ? 'locked' : ''}" data-act="tier" data-tier="${t}">
            <img src="${assetUrl(TROOP_SPRITES[type])}" style="filter:hue-rotate(${(t - 1) * 28}deg) saturate(${1 + t * 0.1})">
            <div>${TIER_NAMES[t - 1]}</div>
            <div class="count">${locked ? `🔒 Lv.${[1, 5, 10, 16, 22][t - 1]}` : `Own ${fmt(s.troops[id] ?? 0)}`}</div>
          </div>`;
        })
        .join('');
      body.innerHTML = `
        <div class="tier-tabs">${tabs}</div>
        <div class="spacer"></div>
        <div class="row" style="align-items:flex-start">
          <img src="${assetUrl(TROOP_SPRITES[type])}" style="width:180px;height:180px;object-fit:contain;filter:drop-shadow(0 8px 10px rgba(60,30,0,.35)) hue-rotate(${(tier - 1) * 28}deg)">
          <div class="grow col">
            <div class="lvl-arrow">${TROOP_NAMES[type][tier - 1]} <small class="muted">Tier ${TIER_NAMES[tier - 1]}</small></div>
            <table class="stat-table">
              <tr><td>Attack</td><td>${Math.round(st.atk)}</td></tr>
              <tr><td>Defense</td><td>${Math.round(st.def)}</td></tr>
              <tr><td>Health</td><td>${Math.round(st.hp)}</td></tr>
              <tr><td>Speed</td><td>${st.speed}</td></tr>
              <tr><td>Load</td><td>${Math.round(st.load)}</td></tr>
              <tr><td>Power</td><td>${st.power}</td></tr>
            </table>
            <div class="muted">${{ infantry: 'Strong vs cavalry, weak vs archers.', archer: 'Strong vs infantry, weak vs cavalry.', cavalry: 'Strong vs archers, weak vs infantry.', siege: 'Huge load and attack, fragile.' }[type]}</div>
          </div>
        </div>
        ${
          job
            ? `<h3 class="sec">Training ${fmt(job.amount)} ${TROOP_NAMES[type][Number(job.target.split('_')[1]) - 1]}</h3>
               <div class="card">${jobBar(job, 'blue')}<div class="action-row"><button class="btn btn-blue" data-act="speed">${icon('ic_speedup')} Speed Up</button></div></div>`
            : tier > maxTier
              ? `<h3 class="sec">Locked</h3><div class="req">Upgrade the ${BUILDINGS[bType].name} to unlock this tier.</div>`
              : `<h3 class="sec">Amount <span class="muted" style="text-transform:none;letter-spacing:0">(capacity ${fmt(cap)})</span></h3>
                 <div class="slider-row">
                   <input type="range" min="0" max="${cap}" value="${amount}" data-role="slider">
                   <input type="number" min="0" max="${cap}" value="${amount}" data-role="num">
                 </div>
                 <div class="spacer"></div>
                 <div data-role="cost">${costHtml(s, cost, amount)}</div>
                 <div class="action-row">
                   <span class="timer-chip">⏳ <span data-role="time">${fmtTime(trainSeconds(s, tier, amount))}</span></span>
                   <button class="btn btn-green btn-xl" data-act="train" ${amount <= 0 || lvl <= 0 ? 'disabled' : ''}>Train</button>
                 </div>`
        }`;
      const slider = body.querySelector('[data-role=slider]') as HTMLInputElement | null;
      const num = body.querySelector('[data-role=num]') as HTMLInputElement | null;
      const sync = (v: number) => {
        amount = Math.max(0, Math.min(cap, Math.floor(v || 0)));
        if (slider) slider.value = String(amount);
        if (num) num.value = String(amount);
        (body.querySelector('[data-role=cost]') as HTMLElement).innerHTML = costHtml(s, cost, amount);
        (body.querySelector('[data-role=time]') as HTMLElement).textContent = fmtTime(trainSeconds(s, tier, amount));
        const btn = body.querySelector('[data-act=train]') as HTMLButtonElement;
        if (amount > 0) btn.removeAttribute('disabled');
        else btn.setAttribute('disabled', '');
      };
      slider?.addEventListener('input', () => sync(Number(slider.value)));
      num?.addEventListener('input', () => sync(Number(num.value)));
      onAct(body, {
        tier: (t) => {
          tier = Number(t.dataset.tier);
          amount = 0;
          sfx.click();
          h.refresh();
        },
        train: () => {
          if (ctx.run((st) => startTraining(st, type, tier, amount), sfx.march)) {
            toast(`Training ${fmt(amount)} ${TROOP_NAMES[type][tier - 1]}`, 'good', TROOP_SPRITES[type]);
            h.close();
          }
        },
        speed: () => job && openSpeedup(ctx, job.id),
      });
    },
  });
}

// ---------------------------------------------------------------------------

export function openResearch(ctx: UiCtx): void {
  let tree: 'economy' | 'military' = 'economy';
  openModal({
    title: 'Academy · Research',
    size: 'wide',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const job = s.jobs.find((j) => j.kind === 'research');
      const techs = TECHS.filter((t) => t.tree === tree);
      const W = 150;
      const H = 120;
      const GX = 36;
      const GY = 18;
      const lines = techs
        .flatMap((t) =>
          t.requires
            .map((r) => TECH_BY_ID[r])
            .filter((r) => r.tree === tree)
            .map((r) => {
              const x1 = r.col * (W + GX) + W + 6;
              const y1 = r.row * (H + GY) + H / 2 + 10;
              const x2 = t.col * (W + GX) + 6;
              const y2 = t.row * (H + GY) + H / 2 + 10;
              const done = (s.research[r.id] ?? 0) > 0;
              return `<path d="M${x1},${y1} C${x1 + 20},${y1} ${x2 - 20},${y2} ${x2},${y2}" stroke="${done ? '#d08a1a' : 'rgba(120,80,30,.35)'}" stroke-width="4" fill="none"/>`;
            }),
        )
        .join('');
      body.innerHTML = `
        ${job ? `<div class="card" style="margin-bottom:12px"><div class="row"><b>${TECH_BY_ID[job.target].icon} ${TECH_BY_ID[job.target].name} Lv.${job.amount}</b><div class="grow">${jobBar(job, 'blue')}</div><button class="btn btn-blue btn-sm" data-act="speed">Speed Up</button></div></div>` : ''}
        <div class="tabs">
          <button class="tab ${tree === 'economy' ? 'sel' : ''}" data-act="tree" data-tree="economy">Economy</button>
          <button class="tab ${tree === 'military' ? 'sel' : ''}" data-act="tree" data-tree="military">Military</button>
        </div>
        <div class="tree">
          <svg width="${6 * (W + GX)}" height="${3 * (H + GY)}">${lines}</svg>
          ${techs
            .map((t) => {
              const lv = s.research[t.id] ?? 0;
              const info = researchInfo(s, t.id);
              const active = job?.target === t.id;
              const cls = lv >= t.maxLevel ? 'maxed' : active ? 'active' : !info.ok ? 'locked' : '';
              return `<div class="tech ${cls}" data-act="tech" data-id="${t.id}" style="grid-column:${t.col + 1};grid-row:${t.row + 1}">
                <div class="t-icon">${t.icon}</div>
                <div class="t-name">${t.name}</div>
                <div class="t-lv">${lv}/${t.maxLevel} · ${t.desc}</div>
                <div class="bar" style="height:6px;margin-top:4px"><div style="width:${(lv / t.maxLevel) * 100}%"></div></div>
              </div>`;
            })
            .join('')}
        </div>`;
      onAct(body, {
        tree: (t) => {
          tree = t.dataset.tree as typeof tree;
          sfx.click();
          ctx.game.emitChange();
        },
        tech: (t) => openTech(ctx, t.dataset.id!),
        speed: () => job && openSpeedup(ctx, job.id),
      });
    },
  });
}

function openTech(ctx: UiCtx, techId: string): void {
  const t = TECH_BY_ID[techId];
  openModal({
    title: t.name,
    size: 'narrow',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const lv = s.research[techId] ?? 0;
      const info = researchInfo(s, techId);
      const busy = s.jobs.some((j) => j.kind === 'research');
      const maxed = lv >= t.maxLevel;
      body.innerHTML = `
        <div class="center" style="font-size:64px">${t.icon}</div>
        <div class="center lvl-arrow">Lv.${lv}${maxed ? '' : ` → <span class="to">Lv.${lv + 1}</span>`}</div>
        <table class="stat-table">
          <tr><td>${t.desc}</td><td>+${Math.round(t.perLevel * lv * 100)}%${maxed ? '' : ` → <span class="up">+${Math.round(t.perLevel * (lv + 1) * 100)}%</span>`}</td></tr>
        </table>
        ${
          maxed
            ? '<div class="req ok center" style="margin-top:12px">Fully researched</div>'
            : `<h3 class="sec">Requirements</h3>
               ${info.reasons.map((r) => `<div class="req">✗ ${esc(r)}</div>`).join('') || '<div class="req ok">✓ All requirements met</div>'}
               ${busy ? '<div class="req">✗ Another research is in progress</div>' : ''}
               <h3 class="sec">Cost</h3>${costHtml(s, info.cost)}
               <div class="action-row"><span class="timer-chip">⏳ ${fmtTime(info.seconds)}</span>
               <button class="btn btn-purple btn-xl" data-act="go" ${!info.ok || busy || !canAfford(s, info.cost) ? 'disabled' : ''}>Research</button></div>`
        }`;
      onAct(body, {
        go: () => {
          if (ctx.run((st) => startResearch(st, techId), sfx.build)) {
            toast(`Researching ${t.name}`, 'good', 'nav_research');
            h.close();
          }
        },
      });
    },
  });
}

// ---------------------------------------------------------------------------

export function openHospital(ctx: UiCtx): void {
  openModal({
    title: 'Hospital',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const job = s.jobs.find((j) => j.kind === 'heal');
      const plan = healPlan(s);
      const wounded = Object.entries(s.wounded).filter(([, n]) => n > 0);
      body.innerHTML = `
        <div class="row"><img src="${assetUrl('hospital')}" style="width:150px">
          <div class="grow col"><div class="lvl-arrow">Wounded: ${fmtFull(sumTroops(s.wounded))} / ${fmtFull(hospitalCap(s))}</div>
          <div class="muted">Troops severely wounded defending your city or attacking rival governors are sheltered here. When the hospital is full, extra casualties die.</div></div>
        </div>
        ${job ? `<h3 class="sec">Healing ${fmt(job.amount)} troops</h3><div class="card">${jobBar(job, 'green')}<div class="action-row"><button class="btn btn-blue" data-act="speed">Speed Up</button></div></div>` : ''}
        <h3 class="sec">Wounded troops</h3>
        ${
          wounded.length
            ? `<table class="stat-table">${wounded.map(([id, n]) => {
                const [t, tier] = id.split('_');
                return `<tr><td>${icon(TROOP_SPRITES[t as TroopType], 28)} ${TROOP_NAMES[t as TroopType][Number(tier) - 1]}</td><td>${fmtFull(n)}</td></tr>`;
              }).join('')}</table>
              <h3 class="sec">Healing cost</h3>${costHtml(s, plan.cost)}
              <div class="action-row"><span class="timer-chip">⏳ ${fmtTime(plan.seconds)}</span>
              <button class="btn btn-green btn-xl" data-act="heal" ${job || !canAfford(s, plan.cost) ? 'disabled' : ''}>Heal All</button></div>`
            : '<div class="muted">No wounded troops. Your soldiers are in fine health.</div>'
        }`;
      onAct(body, {
        heal: () => ctx.run((st) => startHealing(st), sfx.build),
        speed: () => job && openSpeedup(ctx, job.id),
      });
    },
  });
}

// ---------------------------------------------------------------------------

export function jobTitle(ctx: UiCtx, job: Job): string {
  const s = ctx.game.state;
  if (job.kind === 'build') return `${BUILDINGS[s.buildings[job.target].type].name} → Lv.${job.amount}`;
  if (job.kind === 'research') return `${TECH_BY_ID[job.target].name} Lv.${job.amount}`;
  if (job.kind === 'heal') return `Healing ${fmt(job.amount)} troops`;
  const [t, tier] = job.target.split('_');
  return `${fmt(job.amount)} ${TROOP_NAMES[t as TroopType][Number(tier) - 1]}`;
}

export function openSpeedup(ctx: UiCtx, jobId: string): void {
  openModal({
    title: 'Speed Up',
    size: 'narrow',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const job = s.jobs.find((j) => j.id === jobId);
      if (!job) {
        h.close();
        return;
      }
      const secs = remainingSeconds(s, job);
      const free = secs <= FREE_FINISH_SECONDS && job.kind === 'build';
      const gems = gemCostToFinish(secs);
      const items = (['speed_1m', 'speed_5m', 'speed_15m', 'speed_60m'] as ItemId[]).filter((i) => (s.items[i] ?? 0) > 0);
      body.innerHTML = `
        <div class="center"><b>${esc(jobTitle(ctx, job))}</b></div>
        <div class="spacer"></div>
        ${jobBar(job, 'green')}
        <div class="spacer"></div>
        ${free ? `<button class="btn btn-green btn-xl" style="width:100%" data-act="free">FREE · Finish now</button>` : ''}
        <h3 class="sec">Speedups</h3>
        ${
          items.length
            ? items
                .map(
                  (i) => `<div class="row card" style="margin-bottom:6px;padding:8px">
                    ${icon(ITEMS[i].icon, 40)}<div class="grow"><b>${ITEMS[i].name}</b><div class="muted">Owned: ${s.items[i]}</div></div>
                    <button class="btn btn-blue btn-sm" data-act="use" data-item="${i}">Use</button>
                  </div>`,
                )
                .join('')
            : '<div class="muted">No speedup items. Earn them from barbarians, quests and chests.</div>'
        }
        ${!free ? `<div class="action-row"><button class="btn btn-gold" data-act="gems" ${s.gems < gems ? 'disabled' : ''}>${icon('ic_gems')} Finish for ${fmt(gems)} gems</button></div>` : ''}`;
      onAct(body, {
        free: () => {
          ctx.run((st) => speedUp(st, jobId, secs + 1), sfx.coin);
          h.close();
        },
        use: (t) => ctx.run((st) => useSpeedupItem(st, jobId, t.dataset.item as ItemId), sfx.coin),
        gems: () => {
          if (ctx.run((st) => finishWithGems(st, jobId), sfx.coin)) h.close();
        },
      });
    },
  });
}
