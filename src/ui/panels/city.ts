import { assetUrl } from '../../assets';
import { sfx } from '../../audio';
import {
  BUILDINGS,
  MAX_LEVEL,
  TIER_LEVELS,
  buildingTier,
  spriteFor,
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
import { TIER_NAMES, TRAINED_AT, TROOP_NAMES, troopCost, troopIdSprite, troopSprite, troopStats } from '../../data/troops';
import type { TroopType } from '../../data/types';
import {
  FREE_FINISH_SECONDS,
  bestSpeedups,
  buildingLevel,
  canAfford,
  cancelJob,
  finishWithGems,
  gemCostToFinish,
  healPlan,
  planUpgrade,
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
  unplanUpgrade,
  upgradeInfo,
  useBestSpeedups,
  useSpeedupItem,
} from '../../game/logic';
import { sumTroops, type Job } from '../../game/state';
import type { UiCtx } from '../ctx';
import { costHtml, icon, onAct, openModal, toast } from '../dom';
import { esc, fmt, fmtFull, fmtTime } from '../format';
import { BUILDING_KANJI, ink, pips, req } from '../ink';
import { openTavern } from './army';
import { openAlliance } from './alliance';
import { MAX_HELPS, askHelp, canAskHelp } from '../../game/alliance';

export function jobBar(job: Job, color = ''): string {
  return `<div class="row" style="gap:12px">
    <div class="bar lg ${color} grow"><div data-start="${job.start}" data-end="${job.end}"></div></div>
    <span class="timer-chip">${ink('i_hourglass', 16, 'gold')}<span data-end="${job.end}"></span></span>
  </div>`;
}

function timeChip(seconds: number): string {
  return `<span class="timer-chip">${ink('i_hourglass', 16, 'gold')}${fmtTime(seconds)}</span>`;
}

function buildingStats(type: keyof typeof BUILDINGS, level: number, next: number, ctx: UiCtx): [string, string, string][] {
  const s = ctx.game.state;
  const rows: [string, string, string][] = [];
  const def = BUILDINGS[type];
  if (def.producer) {
    rows.push(['Production per hour', fmt(productionPerHour(level)), fmt(productionPerHour(next))]);
    const sh = buildingLevel(s, 'storehouse');
    rows.push(['Storage', fmt(producerCapacity(level, sh)), fmt(producerCapacity(next, sh))]);
  }
  if (def.trains) {
    rows.push(['Training capacity', fmt(trainingCapacity(level)), fmt(trainingCapacity(next))]);
    rows.push(['Highest tier', TIER_NAMES[Math.max(0, maxTierForLevel(level) - 1)], TIER_NAMES[maxTierForLevel(next) - 1]]);
  }
  if (type === 'hospital') rows.push(['Beds', fmt(hospitalCapacity(level)), fmt(hospitalCapacity(next))]);
  if (type === 'wall') rows.push(['Garrison defense', `+${Math.round(wallDefense(level) * 100)}%`, `+${Math.round(wallDefense(next) * 100)}%`]);
  if (type === 'city_hall') {
    rows.push(['March queues', `${marchSlots(level)}`, `${marchSlots(next)}`]);
    rows.push(['Building level cap', `${level}`, `${next}`]);
  }
  if (type === 'storehouse') rows.push(['Protected resources', fmt(5000 + 12000 * level), fmt(5000 + 12000 * next)]);
  if (type === 'scout_camp') rows.push(['Scout speed', `+${level * 10}%`, `+${next * 10}%`]);
  if (type === 'academy') {
    const unlocks = TECHS.filter((t) => t.academyLevel === next).map((t) => t.name);
    if (unlocks.length) rows.push(['Unlocks', '', unlocks.join(', ')]);
  }
  return rows;
}

export function openBuilding(ctx: UiCtx, plotId: string): void {
  const plot = PLOT_BY_ID[plotId];
  const def = BUILDINGS[plot.type];
  openModal({
    title: def.name,
    seal: BUILDING_KANJI[plot.type],
    kicker: 'City · Building',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const b = s.buildings[plotId];
      h.setTitle(b.level > 0 ? def.name : `Construct ${def.name}`);
      const job = s.jobs.find((j) => j.kind === 'build' && j.target === plotId);
      const info = upgradeInfo(s, plotId);
      const maxed = b.level >= MAX_LEVEL;
      const rows = maxed ? [] : buildingStats(plot.type, b.level, info.toLevel, ctx);
      const builders = s.jobs.filter((j) => j.kind === 'build').length;
      const canGo = info.ok && canAfford(s, info.cost) && builders < s.builders;
      const planned = (s.buildPlan ?? []).includes(plotId);
      body.innerHTML = `
        <div class="bld-hero">
          <div class="bld-art"><img src="${assetUrl(spriteFor(plot.type, b.level))}" alt=""></div>
          <div class="col">
            <div class="lvl-arrow"><small>LV</small>${b.level}${maxed ? '<small>MAX</small>' : `<span class="arr"></span><span class="to">${info.toLevel}</span>`}</div>
            <div class="desc">${esc(def.desc)}</div>
            ${buildingTier(b.level) < 3 ? `<div class="bld-next"><img src="${assetUrl(spriteFor(plot.type, TIER_LEVELS[buildingTier(b.level) - 1]))}" alt=""><span>A grander look at <b>Lv.${TIER_LEVELS[buildingTier(b.level) - 1]}</b></span></div>` : ''}
            ${def.producer && b.level > 0 ? `<div class="muted">Yielding <b class="num">${fmt(productionRate(s, plotId))}</b> ${def.producer} per hour with all bonuses.</div>` : ''}
            ${plot.type === 'storehouse' && b.level > 0 ? `<div class="muted">Raids cannot take the first <b class="num">${fmt(resourceProtection(s))}</b> of each resource.</div>` : ''}
            ${rows.length ? `<table class="stat-table">${rows.map(([k, a, n]) => `<tr><td>${k}</td><td>${a}${a ? ' → ' : ''}<span class="up">${n}</span></td></tr>`).join('')}</table>` : ''}
          </div>
        </div>
        ${
          job
            ? `<h3 class="sec">Under construction</h3>
               <div class="card">${jobBar(job, 'green')}
                 <div class="action-row">
                   <button class="btn btn-sm" data-act="cancel">${ink('i_recall', 15)} Cancel</button>
                   <button class="btn btn-gold" data-act="speed">${ink('i_hourglass', 18)} Speed up</button>
                 </div></div>`
            : maxed
              ? ''
              : `<div class="row" style="align-items:flex-start;gap:28px;flex-wrap:wrap">
                   <div class="grow"><h3 class="sec">Requirements</h3>
                     <div class="reqs">
                       ${info.reasons.map((r) => req(false, esc(r))).join('') || req(true, 'All requirements met')}
                       ${req(builders < s.builders, `Builders free · ${s.builders - builders} of ${s.builders}`)}
                     </div></div>
                   <div class="grow"><h3 class="sec">Cost</h3>${costHtml(s, info.cost)}</div>
                 </div>
                 <div class="action-row">
                   ${timeChip(info.seconds)}
                   ${
                     canGo
                       ? ''
                       : planned
                         ? `<button class="btn" data-act="unplan">${ink('i_scroll', 18)} In the plan · remove</button>`
                         : `<button class="btn" data-act="plan" title="Starts by itself when a builder is free and you can pay">${ink('i_scroll', 18)} Add to build plan</button>`
                   }
                   <button class="btn btn-gold btn-xl" data-act="upgrade" ${canGo ? '' : 'disabled'}>${ink('i_hammer', 20)} ${b.level > 0 ? 'Upgrade' : 'Construct'}</button>
                 </div>
                 ${!canGo && !planned ? '<div class="muted plan-note">Planned upgrades start on their own, even while you are away, once a builder is free and the cost is in your stores.</div>' : ''}`
        }
        ${b.level > 0 ? extraActions(ctx, plot.type) : ''}`;
      onAct(body, {
        upgrade: () => {
          if (ctx.run((st) => startUpgrade(st, plotId), sfx.build)) {
            toast(`${def.name} ${b.level > 0 ? 'upgrade' : 'construction'} begun`, 'good', 'ink/i_hammer');
            h.close();
          }
        },
        plan: () => {
          if (ctx.run((st) => planUpgrade(st, plotId), sfx.click)) toast(`${def.name} added to the build plan`, 'good', 'ink/i_scroll');
        },
        unplan: () => ctx.run((st) => void unplanUpgrade(st, plotId)),
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
  if (def.trains) btn = `<button class="btn" data-act="train" data-type="${def.trains}">${ink('i_spear', 18)} Train ${def.trains}</button>`;
  if (type === 'academy') btn = `<button class="btn" data-act="research">${ink('i_research', 18)} Open the Academy</button>`;
  if (type === 'hospital') btn = `<button class="btn" data-act="heal">${ink('i_heal', 18)} Tend the wounded · ${fmt(sumTroops(s.wounded))}</button>`;
  if (type === 'tavern') btn = `<button class="btn" data-act="tavern">${ink('i_chest', 18)} Open chests</button>`;
  if (type === 'scout_camp') btn = `<button class="btn" data-act="world">${ink('i_eye', 18)} Scout the realm</button>`;
  return btn ? `<div class="action-row" style="justify-content:flex-start">${btn}</div>` : '';
}

// ---------------------------------------------------------------------------

const TIER_UNLOCK = [1, 5, 10, 16, 22];

export function openTrain(ctx: UiCtx, type: TroopType): void {
  let amount = 0;
  const bType = TRAINED_AT[type];
  let tier = Math.max(1, maxTierForLevel(buildingLevel(ctx.game.state, bType)));
  openModal({
    title: `${BUILDINGS[bType].name}`,
    seal: BUILDING_KANJI[bType],
    kicker: 'Muster · Train troops',
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
            <img class="unit" src="${assetUrl(troopSprite(type, t))}" alt="">
            <div class="tn">${TIER_NAMES[t - 1]}</div>
            <div class="count">${locked ? `${ink('i_lock', 12)} Lv.${TIER_UNLOCK[t - 1]}` : `${fmt(s.troops[id] ?? 0)} ready`}</div>
          </div>`;
        })
        .join('');
      body.innerHTML = `
        <div class="tier-tabs">${tabs}</div>
        <div class="spacer"></div>
        <div class="unit-hero">
          <img src="${assetUrl(troopSprite(type, tier))}" alt="">
          <div class="col">
            <div class="kicker">Tier ${TIER_NAMES[tier - 1]} · ${type}</div>
            <div class="cmd-name" style="font-size:24px">${TROOP_NAMES[type][tier - 1]}</div>
            <table class="stat-table">
              <tr><td>Attack</td><td>${Math.round(st.atk)}</td></tr>
              <tr><td>Defense</td><td>${Math.round(st.def)}</td></tr>
              <tr><td>Health</td><td>${Math.round(st.hp)}</td></tr>
              <tr><td>Speed · Load</td><td>${st.speed} · ${Math.round(st.load)}</td></tr>
              <tr><td>Power</td><td>${st.power}</td></tr>
            </table>
            <div class="desc">${{ infantry: 'Holds the line against cavalry; falls to massed arrows.', archer: 'Rains death on infantry; cannot outrun cavalry.', cavalry: 'Rides down archers; breaks on a wall of spears.', siege: 'Vast load and fearsome attack, but fragile.' }[type]}</div>
          </div>
        </div>
        ${
          job
            ? `<h3 class="sec">In training · ${fmt(job.amount)} ${TROOP_NAMES[type][Number(job.target.split('_')[1]) - 1]}</h3>
               <div class="card">${jobBar(job, 'blue')}<div class="action-row"><button class="btn btn-gold" data-act="speed">${ink('i_hourglass', 18)} Speed up</button></div></div>`
            : tier > maxTier
              ? `<h3 class="sec">Sealed</h3>${req(false, `Raise the ${BUILDINGS[bType].name} to Lv.${TIER_UNLOCK[tier - 1]} to train this tier.`)}`
              : `<h3 class="sec">Muster <span class="muted">capacity ${fmt(cap)}</span></h3>
                 <div class="slider-row">
                   <input type="range" min="0" max="${cap}" value="${amount}" data-role="slider">
                   <input type="number" min="0" max="${cap}" value="${amount}" data-role="num">
                 </div>
                 <div class="spacer"></div>
                 <div data-role="cost">${costHtml(s, cost, amount)}</div>
                 <div class="action-row">
                   <span class="timer-chip">${ink('i_hourglass', 16, 'gold')}<span data-role="time">${fmtTime(trainSeconds(s, tier, amount))}</span></span>
                   <button class="btn btn-gold btn-xl" data-act="train" ${amount <= 0 || lvl <= 0 ? 'disabled' : ''}>${ink('i_spear', 20)} Train</button>
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
            toast(`Training ${fmt(amount)} ${TROOP_NAMES[type][tier - 1]}`, 'good', troopSprite(type, tier));
            h.close();
          }
        },
        speed: () => job && openSpeedup(ctx, job.id),
      });
    },
  });
}

// ---------------------------------------------------------------------------

const TREE_W = 150;
const TREE_H = 124;
const TREE_GX = 38;
const TREE_GY = 18;

/** Brush-like curved links between techs, drawn on a canvas behind the grid. */
function drawTreeLinks(canvas: HTMLCanvasElement, tree: 'economy' | 'military', research: Record<string, number>): void {
  const techs = TECHS.filter((t) => t.tree === tree);
  const cols = 6;
  const rows = Math.max(...techs.map((t) => t.row)) + 1;
  const w = cols * (TREE_W + TREE_GX);
  const h = rows * (TREE_H + TREE_GY);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  g.lineCap = 'round';
  for (const t of techs) {
    for (const rid of t.requires) {
      const r = TECH_BY_ID[rid];
      if (r.tree !== tree) continue;
      const x1 = r.col * (TREE_W + TREE_GX) + TREE_W;
      const y1 = r.row * (TREE_H + TREE_GY) + TREE_H / 2;
      const x2 = t.col * (TREE_W + TREE_GX);
      const y2 = t.row * (TREE_H + TREE_GY) + TREE_H / 2;
      const done = (research[rid] ?? 0) > 0;
      // two passes give the stroke a soft dry-brush edge
      for (const [wd, a] of [[5, 0.18], [2, 0.9]] as const) {
        g.strokeStyle = done ? `rgba(232,207,140,${a})` : `rgba(241,235,220,${a * 0.3})`;
        g.lineWidth = wd;
        g.beginPath();
        g.moveTo(x1, y1);
        g.bezierCurveTo(x1 + 24, y1, x2 - 24, y2, x2, y2);
        g.stroke();
      }
    }
  }
}

export function openResearch(ctx: UiCtx): void {
  let tree: 'economy' | 'military' = 'economy';
  openModal({
    title: 'The Academy',
    seal: '学',
    kicker: 'Research · Technologies',
    size: 'wide',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const job = s.jobs.find((j) => j.kind === 'research');
      const techs = TECHS.filter((t) => t.tree === tree);
      body.innerHTML = `
        ${job ? `<div class="card" style="margin-bottom:14px"><div class="row">${ink(TECH_BY_ID[job.target].icon, 30)}<div class="grow"><div class="kicker">Researching</div><b>${TECH_BY_ID[job.target].name} · Lv.${job.amount}</b></div><div class="grow">${jobBar(job, 'red')}</div><button class="btn btn-sm" data-act="speed">${ink('i_hourglass', 15)} Speed up</button></div></div>` : ''}
        <div class="tabs">
          <button class="tab ${tree === 'economy' ? 'sel' : ''}" data-act="tree" data-tree="economy">Economy</button>
          <button class="tab ${tree === 'military' ? 'sel' : ''}" data-act="tree" data-tree="military">Military</button>
        </div>
        <div class="tree-wrap">
          <canvas class="links"></canvas>
          <div class="tree">
          ${techs
            .map((t) => {
              const lv = s.research[t.id] ?? 0;
              const info = researchInfo(s, t.id);
              const active = job?.target === t.id;
              const cls = lv >= t.maxLevel ? 'maxed' : active ? 'active' : !info.ok ? 'locked' : '';
              return `<div class="tech ${cls}" data-act="tech" data-id="${t.id}" style="grid-column:${t.col + 1};grid-row:${t.row + 1}">
                <div class="t-icon">${ink(t.icon, 32)}</div>
                <div class="t-name">${t.name}</div>
                <div class="t-lv">${t.desc}</div>
                ${pips(lv, t.maxLevel)}
              </div>`;
            })
            .join('')}
          </div>
        </div>`;
      drawTreeLinks(body.querySelector('canvas.links') as HTMLCanvasElement, tree, s.research);
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
    seal: '学',
    kicker: `${t.tree} research`,
    size: 'narrow',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const lv = s.research[techId] ?? 0;
      const info = researchInfo(s, techId);
      const busy = s.jobs.some((j) => j.kind === 'research');
      const maxed = lv >= t.maxLevel;
      body.innerHTML = `
        <div class="tech-hero">${ink(t.icon, 62)}</div>
        <div class="center" style="margin-top:8px">${pips(lv, t.maxLevel)}</div>
        <table class="stat-table" style="margin-top:12px">
          <tr><td>${t.desc}</td><td>+${Math.round(t.perLevel * lv * 100)}%${maxed ? '' : ` → <span class="up">+${Math.round(t.perLevel * (lv + 1) * 100)}%</span>`}</td></tr>
        </table>
        ${
          maxed
            ? `<div style="margin-top:14px">${req(true, 'Mastered')}</div>`
            : `<h3 class="sec">Requirements</h3>
               <div class="reqs">${info.reasons.map((r) => req(false, esc(r))).join('') || req(true, 'All requirements met')}
               ${busy ? req(false, 'Another study is under way') : ''}</div>
               <h3 class="sec">Cost</h3>${costHtml(s, info.cost)}
               <div class="action-row">${timeChip(info.seconds)}
               <button class="btn btn-gold btn-xl" data-act="go" ${!info.ok || busy || !canAfford(s, info.cost) ? 'disabled' : ''}>${ink('i_research', 20)} Research</button></div>`
        }`;
      onAct(body, {
        go: () => {
          if (ctx.run((st) => startResearch(st, techId), sfx.build)) {
            toast(`Researching ${t.name}`, 'good', `ink/${t.icon}`);
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
    seal: '医',
    kicker: 'City · Tend the wounded',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const job = s.jobs.find((j) => j.kind === 'heal');
      const plan = healPlan(s);
      const wounded = Object.entries(s.wounded).filter(([, n]) => n > 0);
      const cap = hospitalCap(s);
      body.innerHTML = `
        <div class="bld-hero">
          <div class="bld-art"><img src="${assetUrl('hospital')}" alt=""></div>
          <div class="col">
            <div class="kicker">Beds occupied</div>
            <div class="lvl-arrow">${fmtFull(sumTroops(s.wounded))}<small>OF ${fmtFull(cap)}</small></div>
            <div class="bar lg red"><div style="width:${cap ? Math.min(100, (sumTroops(s.wounded) / cap) * 100) : 0}%"></div></div>
            <div class="desc">Soldiers badly hurt defending the city or storming rival governors rest here. When every bed is taken, the rest are lost.</div>
          </div>
        </div>
        ${job ? `<h3 class="sec">Healing ${fmt(job.amount)} troops</h3><div class="card">${jobBar(job, 'green')}<div class="action-row"><button class="btn btn-gold" data-act="speed">${ink('i_hourglass', 18)} Speed up</button></div></div>` : ''}
        <h3 class="sec">Wounded</h3>
        ${
          wounded.length
            ? `<table class="stat-table">${wounded
                .map(([id, n]) => {
                  const [t, tier] = id.split('_');
                  return `<tr><td>${icon(troopIdSprite(id), 28)} ${TROOP_NAMES[t as TroopType][Number(tier) - 1]}</td><td>${fmtFull(n)}</td></tr>`;
                })
                .join('')}</table>
              <h3 class="sec">Cost of care</h3>${costHtml(s, plan.cost)}
              <div class="action-row">${timeChip(plan.seconds)}
              <button class="btn btn-gold btn-xl" data-act="heal" ${job || !canAfford(s, plan.cost) ? 'disabled' : ''}>${ink('i_heal', 20)} Heal all</button></div>`
            : '<div class="muted">The wards are quiet. Every soldier stands ready.</div>'
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
    title: 'Hasten',
    seal: '速',
    kicker: 'Speed up a timer',
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
      const best = bestSpeedups(s, jobId);
      body.innerHTML = `
        <div class="kicker">In progress</div>
        <div style="font-weight:700;font-size:16px;margin:2px 0 10px">${esc(jobTitle(ctx, job))}</div>
        ${jobBar(job, 'green')}
        ${free ? `<div class="action-row" style="justify-content:stretch"><button class="btn btn-gold btn-xl" style="flex:1" data-act="free">${ink('i_hammer', 20)} Finish now · free</button></div>` : ''}
        ${
          canAskHelp(s, job)
            ? `<div class="row card al-ask"><img src="${assetUrl('al_help')}" width="44" height="44" alt=""><div class="grow"><b>Ask the alliance</b><div class="muted">Up to ${MAX_HELPS} helps, each cutting at least a minute</div></div><button class="btn btn-sm btn-gold" data-act="help">Ask</button></div>`
            : !s.alliance && job.kind !== 'train'
              ? `<div class="row card al-ask"><img src="${assetUrl('al_help')}" width="44" height="44" alt=""><div class="grow"><b>Join an alliance</b><div class="muted">Allies cut time from every build and research</div></div><button class="btn btn-sm" data-act="alliance">Join</button></div>`
              : ''
        }
        <h3 class="sec">Speedups</h3>
        ${
          best.saved > 0
            ? `<div class="row card best-speed"><span class="seal-sm">最</span><div class="grow"><b>Best use of your speedups</b><div class="muted">${Object.entries(best.use).map(([i, n]) => `${n} × ${ITEMS[i as ItemId].name}`).join(' · ')}<br>Saves ${fmtTime(best.saved)}${best.waste ? ` · wastes ${fmtTime(best.waste)}` : ' · nothing wasted'}</div></div><button class="btn btn-sm btn-gold" data-act="best">Use</button></div>`
            : ''
        }
        ${
          items.length
            ? items
                .map(
                  (i) => `<div class="row card" style="margin-bottom:6px">
                    ${icon(ITEMS[i].icon, 40)}<div class="grow"><b>${ITEMS[i].name}</b><div class="muted">${s.items[i]} in the satchel</div></div>
                    <button class="btn btn-sm" data-act="use" data-item="${i}">Use</button>
                  </div>`,
                )
                .join('')
            : '<div class="muted">No speedups. Win them from barbarians, quests and chests.</div>'
        }
        ${!free ? `<div class="action-row"><button class="btn" data-act="gems" ${s.gems < gems ? 'disabled' : ''}>${icon('ic_gems', 20)} Finish for ${fmt(gems)} gems</button></div>` : ''}`;
      onAct(body, {
        free: () => {
          ctx.run((st) => speedUp(st, jobId, secs + 1), sfx.coin);
          h.close();
        },
        use: (t) => ctx.run((st) => useSpeedupItem(st, jobId, t.dataset.item as ItemId), sfx.coin),
        best: () => ctx.run((st) => useBestSpeedups(st, jobId), sfx.coin),
        help: () => {
          if (ctx.run((st) => (askHelp(st, jobId) ? { ok: true } : { ok: false, reason: 'Already requested' }), sfx.horn)) toast('Your allies answer the call', 'good', 'al_help');
        },
        alliance: () => {
          h.close();
          openAlliance(ctx);
        },
        gems: () => {
          if (ctx.run((st) => finishWithGems(st, jobId), sfx.coin)) h.close();
        },
      });
    },
  });
}
