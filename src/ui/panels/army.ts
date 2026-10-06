import { assetUrl } from '../../assets';
import { sfx } from '../../audio';
import {
  COMMANDERS,
  COMMANDER_BY_ID,
  MAX_SKILL_LEVEL,
  MAX_STARS,
  UNLOCK_SCULPTURES,
  levelCapForStars,
  skillText,
  skillUpgradeCost,
  starUpgradeCost,
  xpToNext,
} from '../../data/commanders';
import { ITEMS } from '../../data/items';
import { TROOP_NAMES, TROOP_SPRITES, troopStats } from '../../data/troops';
import type { TroopType } from '../../data/types';
import { troopPower } from '../../game/battle';
import {
  BARB_AP_COST,
  FORT_AP_COST,
  GOLD_FREE_MS,
  SILVER_FREE_MS,
  commanderBusy,
  findObj,
  marchCapacity,
  objLabel,
  objSprite,
  openChest,
  sendMarch,
  starUp,
  travelSeconds,
  troopLoad,
  unlockCommander,
  upgradeSkill,
  useTome,
  validateMarch,
} from '../../game/logic';
import { sumTroops, type Troops } from '../../game/state';
import type { UiCtx } from '../ctx';
import { icon, onAct, openModal, rewardHtml, stars, toast } from '../dom';
import { esc, fmt, fmtFull, fmtTime } from '../format';

const SKILL_ICONS = ['⚔️', '🛡️', '✨', '👑'];

export function cmdCard(ctx: UiCtx, id: string): string {
  const def = COMMANDER_BY_ID[id];
  const c = ctx.game.state.commanders[id];
  const busy = commanderBusy(ctx.game.state, id);
  return `<div class="cmd-card ${def.rarity} ${c.unlocked ? '' : 'locked'}" data-act="cmd" data-id="${id}" style="background-image:url(${assetUrl(def.portrait)})">
    ${c.unlocked ? `<div class="cc-lv">Lv.${c.level}</div>` : ''}
    ${busy ? '<div class="cc-busy">Marching</div>' : ''}
    <div class="cc-foot">
      <div class="cc-name">${def.name}</div>
      ${c.unlocked ? stars(c.stars) : `<div style="font-size:12px">${icon('ic_sculpture', 16)} ${c.sculptures}/${UNLOCK_SCULPTURES[def.rarity]}</div>`}
    </div>
  </div>`;
}

export function openCommanders(ctx: UiCtx): void {
  openModal({
    title: 'Commanders',
    size: 'wide',
    dark: true,
    live: true,
    render: (body) => {
      const list = [...COMMANDERS].sort((a, b) => Number(ctx.game.state.commanders[b.id].unlocked) - Number(ctx.game.state.commanders[a.id].unlocked));
      body.innerHTML = `<div class="cmd-grid">${list.map((c) => cmdCard(ctx, c.id)).join('')}</div>
        <p class="muted center">Recruit commanders from Tavern chests or by collecting their sculptures. Barbarians and forts also drop sculptures.</p>`;
      onAct(body, { cmd: (t) => openCommander(ctx, t.dataset.id!) });
    },
  });
}

export function openCommander(ctx: UiCtx, id: string): void {
  const def = COMMANDER_BY_ID[id];
  openModal({
    title: def.name,
    size: 'wide',
    dark: true,
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const c = s.commanders[id];
      const cap = levelCapForStars(c.stars);
      const need = xpToNext(c.level);
      const star = starUpgradeCost(c.stars);
      const tomes = (['tome_500', 'tome_2000'] as const).filter((t) => (s.items[t] ?? 0) > 0);
      body.innerHTML = `
        <div class="cmd-detail">
          <div>
            <div class="cmd-portrait" style="background-image:url(${assetUrl(def.portrait)})"><span class="rarity ${def.rarity}">${def.rarity}</span></div>
          </div>
          <div class="col">
            <div class="lvl-arrow" style="color:var(--gold-3)">${def.name}</div>
            <div class="muted">${esc(def.title)}</div>
            <div class="tags">${def.specialties.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
            ${
              c.unlocked
                ? `<div class="row">${stars(c.stars)}<span class="muted">Level ${c.level} / ${cap}</span></div>
                   <div class="bar blue" style="height:12px"><div style="width:${Math.min(100, (c.xp / need) * 100)}%"></div></div>
                   <div class="muted">${fmtFull(c.xp)} / ${fmtFull(need)} XP · Troop capacity ${fmtFull(marchCapacity(s, id))}</div>
                   <div class="row" style="flex-wrap:wrap;gap:6px">
                     ${tomes.map((t) => `<button class="btn btn-blue btn-sm" data-act="tome" data-item="${t}">${icon('ic_tome')} ${ITEMS[t].name} (${s.items[t]})</button>`).join('') || '<span class="muted">No tomes. Defeat barbarians for XP.</span>'}
                     ${
                       c.stars < MAX_STARS
                         ? `<button class="btn btn-gold btn-sm" data-act="star" ${c.level < cap ? 'disabled' : ''} title="Requires Lv.${cap}">★ Star Up · ${icon('ic_sculpture', 16)}${star.sculptures} ${icon('ic_gold', 16)}${fmt(star.gold)}</button>`
                         : ''
                     }
                   </div>`
                : `<div class="card"><b>Not recruited.</b> Collect ${UNLOCK_SCULPTURES[def.rarity]} sculptures to recruit. You have ${c.sculptures}.
                   <div class="action-row"><button class="btn btn-gold" data-act="unlock" ${c.sculptures < UNLOCK_SCULPTURES[def.rarity] ? 'disabled' : ''}>Recruit</button></div></div>`
            }
            <h3 class="sec">Skills <span class="muted" style="text-transform:none;letter-spacing:0">${icon('ic_sculpture', 18)} ${c.sculptures} sculptures</span></h3>
            ${def.skills
              .map((sk, i) => {
                const lv = c.skills[i];
                const cost = skillUpgradeCost(lv);
                return `<div class="skill">
                  <div class="skill-icon ${sk.kind === 'active' ? 'active' : ''} ${lv === 0 ? 'locked' : ''}">${SKILL_ICONS[i]}</div>
                  <div class="grow">
                    <div class="skill-name">${sk.name} <span class="skill-lv">${sk.kind === 'active' ? 'Active · 1000 rage' : 'Passive'} · ${lv}/${MAX_SKILL_LEVEL}</span></div>
                    <div class="muted">${esc(skillText(sk, Math.max(1, lv)))}</div>
                  </div>
                  ${
                    c.unlocked && lv < MAX_SKILL_LEVEL
                      ? `<button class="btn btn-purple btn-sm" data-act="skill" data-i="${i}" ${c.sculptures < cost || (i > 0 && c.skills[i - 1] < 1) ? 'disabled' : ''}>${lv === 0 ? 'Unlock' : 'Upgrade'} ${icon('ic_sculpture', 16)}${cost}</button>`
                      : ''
                  }
                </div>`;
              })
              .join('')}
          </div>
        </div>`;
      onAct(body, {
        tome: (t) => ctx.run((st) => useTome(st, t.dataset.item as 'tome_500', id), sfx.coin),
        star: () => ctx.run((st) => starUp(st, id), sfx.fanfare),
        unlock: () => {
          if (ctx.run((st) => unlockCommander(st, id), sfx.fanfare)) toast(`${def.name} joins your cause!`, 'good', def.portrait);
        },
        skill: (t) => ctx.run((st) => upgradeSkill(st, id, Number(t.dataset.i)), sfx.fanfare),
      });
    },
  });
}

// ---------------------------------------------------------------------------

export function openMarch(ctx: UiCtx, targetId: string, kind: 'attack' | 'gather' | 'scout'): void {
  const s0 = ctx.game.state;
  const target = findObj(s0, targetId);
  if (!target) return;
  if (kind === 'scout') {
    if (ctx.run((st) => sendMarch(st, { kind: 'scout', targetId, commanderId: null, troops: {} }), sfx.march)) toast('Scouts dispatched', 'good', 'scout_camp');
    return;
  }
  const idle = COMMANDERS.filter((c) => s0.commanders[c.id].unlocked && !commanderBusy(s0, c.id));
  // prefer gathering commanders for gathering, otherwise the strongest
  idle.sort((a, b) => {
    const pref = (x: typeof a) => (kind === 'gather' && x.specialties.includes('Gathering') ? 1000 : 0) + s0.commanders[x.id].level;
    return pref(b) - pref(a);
  });
  let commanderId: string | null = idle[0]?.id ?? null;
  let sel: Troops = {};

  const autoFill = () => {
    const s = ctx.game.state;
    const cap = marchCapacity(s, commanderId);
    sel = {};
    let left = cap;
    // highest tiers first, balanced across types
    const ids = Object.keys(s.troops)
      .filter((k) => (s.troops[k] ?? 0) > 0)
      .sort((a, b) => Number(b.split('_')[1]) - Number(a.split('_')[1]));
    const total = ids.reduce((a, k) => a + s.troops[k], 0);
    for (const k of ids) {
      if (left <= 0) break;
      const share = total > cap ? Math.floor((s.troops[k] / total) * cap) : s.troops[k];
      const n = Math.min(left, share, s.troops[k]);
      if (n > 0) sel[k] = n;
      left -= n;
    }
  };
  autoFill();

  openModal({
    title: kind === 'gather' ? 'Gather Resources' : 'Dispatch Army',
    dark: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const t = findObj(s, targetId);
      if (!t) {
        h.close();
        return;
      }
      const cap = marchCapacity(s, commanderId);
      const avail = Object.keys(s.troops).filter((k) => (s.troops[k] ?? 0) > 0);
      const order = { kind, targetId, commanderId, troops: sel };
      const n = sumTroops(sel);
      const valid = validateMarch(s, order);
      const secs = n > 0 ? travelSeconds(s, order) : 0;
      const enemy = t.troops ? troopPower(t.troops) : 0;
      const mine = troopPower(sel);
      const ratio = enemy > 0 ? mine / enemy : 0;
      const verdict = kind === 'attack' ? (ratio > 1.6 ? ['Easy', '#7ee06a'] : ratio > 1.05 ? ['Even', '#ffd978'] : ['Dangerous', '#ff6a4d']) : null;
      body.innerHTML = `
        <div class="row card">
          <img src="${assetUrl(objSprite(t))}" style="width:70px;height:70px;object-fit:contain">
          <div class="grow"><b>${esc(objLabel(t))}</b><div class="muted">(${t.x}, ${t.y})${t.troops && t.scoutedAt ? ` · Scouted garrison: ${fmtFull(sumTroops(t.troops))}` : t.kind === 'barbarian' || t.kind === 'fort' ? ` · Garrison ≈ ${fmtFull(sumTroops(t.troops ?? {}))}` : ''}</div></div>
          ${verdict ? `<div style="font-family:var(--display);font-weight:900;color:${verdict[1]}">${verdict[0]}</div>` : ''}
        </div>
        <h3 class="sec">Commander</h3>
        <div class="march-cmds">
          ${COMMANDERS.filter((c) => s.commanders[c.id].unlocked)
            .map((c) => {
              const busy = commanderBusy(s, c.id);
              return `<div class="march-cmd ${commanderId === c.id ? 'sel' : ''} ${busy ? 'busy' : ''}" data-act="${busy ? '' : 'pick'}" data-id="${c.id}" style="background-image:url(${assetUrl(c.portrait)})"><div class="mc-name">${c.name}<br>Lv.${s.commanders[c.id].level}</div></div>`;
            })
            .join('')}
        </div>
        <h3 class="sec">Troops <span class="muted" style="text-transform:none;letter-spacing:0">${fmtFull(n)} / ${fmtFull(cap)}</span>
          <button class="btn btn-dark btn-sm" data-act="auto">Auto</button><button class="btn btn-dark btn-sm" data-act="clear">Clear</button></h3>
        ${
          avail.length
            ? avail
                .map((k) => {
                  const [ty, tier] = k.split('_');
                  return `<div class="troop-row">
                    <img src="${assetUrl(TROOP_SPRITES[ty as TroopType])}">
                    <div><div><b>${TROOP_NAMES[ty as TroopType][Number(tier) - 1]}</b> <span class="muted">T${tier} · ${fmtFull(s.troops[k])} available</span></div>
                    <input type="range" min="0" max="${s.troops[k]}" value="${sel[k] ?? 0}" data-troop="${k}"></div>
                    <input type="number" min="0" max="${s.troops[k]}" value="${sel[k] ?? 0}" data-troopn="${k}">
                  </div>`;
                })
                .join('')
            : '<div class="muted">No troops in the city. Train some at the Barracks.</div>'
        }
        <div class="spacer"></div>
        <div class="march-stats">
          <div class="mstat"><div class="v">${fmt(mine)}</div><div class="k">Power</div></div>
          <div class="mstat"><div class="v">${fmt(troopLoad(s, sel, commanderId))}</div><div class="k">Load</div></div>
          <div class="mstat"><div class="v">${fmtTime(secs)}</div><div class="k">March time</div></div>
          <div class="mstat"><div class="v">${kind === 'attack' && t.kind === 'barbarian' ? `${icon('ic_ap', 16)}${BARB_AP_COST}` : kind === 'attack' && t.kind === 'fort' ? `${icon('ic_ap', 16)}${FORT_AP_COST}` : '—'}</div><div class="k">AP cost</div></div>
        </div>
        ${!valid.ok && n > 0 ? `<div class="req center" style="margin-top:10px">${esc(valid.reason)}</div>` : ''}
        <div class="action-row"><button class="btn ${kind === 'gather' ? 'btn-green' : 'btn-red'} btn-xl" data-act="go" ${!valid.ok ? 'disabled' : ''}>${kind === 'gather' ? 'Gather' : 'March'}</button></div>`;

      const setTroop = (k: string, v: number) => {
        const max = s.troops[k] ?? 0;
        const others = sumTroops(sel) - (sel[k] ?? 0);
        sel[k] = Math.max(0, Math.min(max, cap - others, Math.floor(v || 0)));
        h.refresh();
      };
      body.querySelectorAll<HTMLInputElement>('input[data-troop]').forEach((inp) => inp.addEventListener('change', () => setTroop(inp.dataset.troop!, Number(inp.value))));
      body.querySelectorAll<HTMLInputElement>('input[data-troopn]').forEach((inp) => inp.addEventListener('change', () => setTroop(inp.dataset.troopn!, Number(inp.value))));
      onAct(body, {
        pick: (el) => {
          commanderId = el.dataset.id!;
          sfx.click();
          autoFill();
          h.refresh();
        },
        auto: () => {
          autoFill();
          h.refresh();
        },
        clear: () => {
          sel = {};
          h.refresh();
        },
        go: () => {
          if (ctx.run((st) => sendMarch(st, { kind, targetId, commanderId, troops: sel }), sfx.march)) {
            toast(kind === 'gather' ? 'Gatherers dispatched' : `${commanderId ? COMMANDER_BY_ID[commanderId].name : 'Army'} marches to battle!`, 'good', 'march_token');
            h.close();
          }
        },
      });
    },
  });
}

// ---------------------------------------------------------------------------

export function openTavern(ctx: UiCtx): void {
  let reveal = '';
  openModal({
    title: 'Tavern',
    dark: true,
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const silverFree = s.tavern.silverFreeAt <= s.time;
      const goldFree = s.tavern.goldFreeAt <= s.time;
      const chest = (kind: 'silver' | 'gold', free: boolean, at: number, keys: number) => `
        <div class="chest ${kind}">
          <div class="chest-title">${kind === 'silver' ? 'Silver Chest' : 'Gold Chest'}</div>
          <img class="chest-img" src="${assetUrl('ic_chest')}">
          <div class="muted">${kind === 'silver' ? 'Epic commanders, sculptures & supplies' : 'Legendary commanders, many sculptures & gems'}</div>
          <div class="spacer"></div>
          ${free ? `<button class="btn btn-green" data-act="open" data-kind="${kind}">Open FREE</button>` : `<button class="btn btn-gold" data-act="open" data-kind="${kind}" ${keys <= 0 ? 'disabled' : ''}>${icon(kind === 'silver' ? 'ic_key_silver' : 'ic_key_gold')} Open (${keys})</button>
             <div class="muted" style="margin-top:6px">Free in <span data-end="${at}"></span></div>`}
        </div>`;
      body.innerHTML = `
        <div class="chests">
          ${chest('silver', silverFree, s.tavern.silverFreeAt, s.items.silver_key ?? 0)}
          ${chest('gold', goldFree, s.tavern.goldFreeAt, s.items.gold_key ?? 0)}
        </div>
        <div class="muted center" style="margin-top:8px">Free silver chest every ${SILVER_FREE_MS / 3600_000}h · free gold chest every ${GOLD_FREE_MS / 3600_000}h (game time)</div>
        ${reveal}`;
      onAct(body, {
        open: (t) => {
          const kind = t.dataset.kind as 'silver' | 'gold';
          let out: ReturnType<typeof openChest> | null = null;
          const ok = ctx.run((st) => {
            out = openChest(st, kind, ctx.game.rng);
            return out.ok ? { ok: true } : out;
          }, sfx.chest);
          if (ok && out && (out as { ok: boolean }).ok) {
            const r = out as Extract<ReturnType<typeof openChest>, { ok: true }>;
            reveal = `
              ${r.recruited ? `<div class="recruit"><h3 class="sec">New commander recruited!</h3>${cmdCard(ctx, r.recruited)}</div>` : ''}
              <h3 class="sec">Rewards</h3><div class="reveal">${revealItems(r.reward)}</div>`;
            if (r.recruited) {
              sfx.fanfare();
              toast(`${COMMANDER_BY_ID[r.recruited].name} has joined you!`, 'good', COMMANDER_BY_ID[r.recruited].portrait);
            }
            ctx.game.emitChange();
          }
        },
        cmd: (t) => openCommander(ctx, t.dataset.id!),
      });
    },
  });
}

function revealItems(r: import('../../game/state').Reward): string {
  const out: string[] = [];
  let i = 0;
  const card = (img: string, name: string, qty: string) =>
    `<div class="item" style="animation-delay:${i++ * 0.08}s"><img src="${assetUrl(img)}"><div class="i-name">${esc(name)}</div><div class="qty">${qty}</div></div>`;
  for (const k in r.sculptures ?? {}) out.push(card(COMMANDER_BY_ID[k].portrait, `${COMMANDER_BY_ID[k].name} Sculpture`, `×${r.sculptures![k]}`));
  for (const k in r.items ?? {}) {
    const n = r.items![k as keyof typeof r.items] ?? 0;
    if (n > 0) out.push(card(ITEMS[k as keyof typeof ITEMS].icon, ITEMS[k as keyof typeof ITEMS].name, `×${n}`));
  }
  if (r.res?.gems) out.push(card('ic_gems', 'Gems', `×${r.res.gems}`));
  return out.join('') || rewardHtml(r);
}

export function troopSummary(t: Troops): string {
  return Object.entries(t)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => {
      const [ty, tier] = k.split('_');
      return `${icon(TROOP_SPRITES[ty as TroopType], 20)} ${fmtFull(n)} T${tier}`;
    })
    .join(' · ');
}

export function troopStatsLine(type: TroopType, tier: number): string {
  const st = troopStats(type, tier);
  return `ATK ${Math.round(st.atk)} · DEF ${Math.round(st.def)} · HP ${Math.round(st.hp)}`;
}
