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
import { TROOP_NAMES, troopIdSprite } from '../../data/troops';
import type { TroopType } from '../../data/types';
import { troopPower } from '../../game/battle';
import { BONUS_LABEL, ROW_GATE } from '../../data/talents';
import { canLearn, commanderTrees, freePoints, learnTalent, pointsInTree, resetTalents, rowOpen, talentPoints, talentRank } from '../../game/talents';
import { haptic } from '../../native';
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
import { sumTroops, type Reward, type Troops } from '../../game/state';
import type { UiCtx } from '../ctx';
import { icon, onAct, openModal, toast } from '../dom';
import { esc, fmt, fmtFull, fmtTime } from '../format';
import { ink, pips, req, skillIcon, stars } from '../ink';

/** First character of a commander's name, pressed into their seal. */
const CMD_SEAL: Record<string, string> = { boudica: '炎', suntzu: '帥', cleopatra: '金', joan: '聖', caesar: '王', khan: '馬' };

export function cmdCard(ctx: UiCtx, id: string, delay = 0): string {
  const def = COMMANDER_BY_ID[id];
  const c = ctx.game.state.commanders[id];
  const busy = commanderBusy(ctx.game.state, id);
  return `<div class="cmd-card ${def.rarity} ${c.unlocked ? '' : 'locked'}" data-act="cmd" data-id="${id}" style="background-image:url(${assetUrl(def.portrait)});animation-delay:${delay}s">
    ${c.unlocked ? `<div class="cc-lv">${c.level}</div>` : ''}
    ${busy ? '<div class="cc-busy">MARCHING</div>' : ''}
    <div class="cc-foot">
      <div class="cc-rar">${def.rarity}</div>
      <div class="cc-name">${def.name}</div>
      <div class="cc-brush"></div>
      ${c.unlocked ? stars(c.stars) : `<div class="cc-sculpt">${icon('ic_sculpture', 16)} ${c.sculptures} / ${UNLOCK_SCULPTURES[def.rarity]}</div>`}
    </div>
  </div>`;
}

export function openCommanders(ctx: UiCtx): void {
  openModal({
    title: 'Commanders',
    seal: '将',
    kicker: 'Hall of generals',
    size: 'wide',
    live: true,
    render: (body) => {
      const s = ctx.game.state;
      const list = [...COMMANDERS].sort((a, b) => Number(s.commanders[b.id].unlocked) - Number(s.commanders[a.id].unlocked));
      body.innerHTML = `<div class="cmd-grid">${list.map((c, i) => cmdCard(ctx, c.id, i * 0.05)).join('')}</div>
        <p class="muted center" style="margin-top:16px;font-style:italic">Recruit generals from Tavern chests or by gathering their insignia. Barbarians and forts surrender insignia too.</p>`;
      onAct(body, { cmd: (t) => openCommander(ctx, t.dataset.id!) });
    },
  });
}

export function openCommander(ctx: UiCtx, id: string): void {
  const def = COMMANDER_BY_ID[id];
  openModal({
    title: def.name,
    seal: '将',
    kicker: `${def.rarity} commander`,
    size: 'wide',
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
          <div class="cmd-portrait" style="background-image:url(${assetUrl(def.portrait)})">
            <div class="seal-big">${CMD_SEAL[id] ?? '将'}</div>
            <div class="rarity">${c.unlocked ? stars(c.stars) : ''}</div>
          </div>
          <div class="col" style="gap:10px">
            <div><div class="kicker">${esc(def.title)}</div><div class="cmd-name">${def.name}</div></div>
            <div class="tags">${def.specialties.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
            ${
              c.unlocked
                ? `<div class="card">
                     <div class="row"><div class="grow"><div class="kicker">Level</div><div class="lvl-arrow">${c.level}<small>OF ${cap}</small></div></div>
                     <div style="text-align:right"><div class="kicker">Troop capacity</div><div class="num" style="font-size:17px">${fmtFull(marchCapacity(s, id))}</div></div></div>
                     <div class="bar blue" style="margin-top:8px"><div style="width:${Math.min(100, (c.xp / need) * 100)}%"></div></div>
                     <div class="muted" style="margin-top:4px;font-size:11.5px">${fmtFull(c.xp)} / ${fmtFull(need)} experience</div>
                     <div class="action-row" style="justify-content:flex-start;margin-top:12px">
                       ${tomes.map((t) => `<button class="btn btn-sm" data-act="tome" data-item="${t}">${icon('ic_tome', 18)} ${ITEMS[t].name} · ${s.items[t]}</button>`).join('') || '<span class="muted">No tomes — slay barbarians to gain experience.</span>'}
                       <button class="btn btn-sm ${freePoints(s, id) > 0 ? 'btn-gold' : ''}" data-act="talents">${ink('i_star', 15)} Talents${freePoints(s, id) > 0 ? ` · ${freePoints(s, id)} to spend` : ''}</button>
                       ${c.stars < MAX_STARS ? `<button class="btn btn-sm btn-gold" data-act="star" ${c.level < cap ? 'disabled' : ''} title="Requires Lv.${cap}">${ink('i_star', 15)} Ascend · ${icon('ic_sculpture', 15)}${star.sculptures} ${icon('ic_gold', 15)}${fmt(star.gold)}</button>` : ''}
                     </div>
                   </div>`
                : `<div class="card">${req(false, `Not yet recruited · ${c.sculptures} / ${UNLOCK_SCULPTURES[def.rarity]} sculptures`)}
                   <div class="action-row"><button class="btn btn-gold" data-act="unlock" ${c.sculptures < UNLOCK_SCULPTURES[def.rarity] ? 'disabled' : ''}>${ink('i_crown', 18)} Recruit</button></div></div>`
            }
            <h3 class="sec">Skills <span class="muted">${icon('ic_sculpture', 16)} ${c.sculptures} insignia</span></h3>
            <div>
            ${def.skills
              .map((sk, i) => {
                const lv = c.skills[i];
                const cost = skillUpgradeCost(lv);
                return `<div class="skill">
                  <div class="skill-icon ${sk.kind === 'active' ? 'active' : ''} ${lv === 0 ? 'locked' : ''}">${ink(skillIcon(sk), 26, sk.kind === 'active' ? 'gold' : 'cream')}</div>
                  <div class="grow">
                    <div><span class="skill-name">${sk.name}</span><span class="skill-lv">${sk.kind === 'active' ? 'ACTIVE · 1000 RAGE' : 'PASSIVE'}</span>${pips(lv, MAX_SKILL_LEVEL)}</div>
                    <div class="muted">${esc(skillText(sk, Math.max(1, lv)))}</div>
                  </div>
                  ${
                    c.unlocked && lv < MAX_SKILL_LEVEL
                      ? `<button class="btn btn-sm" data-act="skill" data-i="${i}" ${c.sculptures < cost || (i > 0 && c.skills[i - 1] < 1) ? 'disabled' : ''}>${lv === 0 ? 'Awaken' : 'Refine'} ${icon('ic_sculpture', 15)}${cost}</button>`
                      : ''
                  }
                </div>`;
              })
              .join('')}
            </div>
          </div>
        </div>`;
      onAct(body, {
        tome: (t) => ctx.run((st) => useTome(st, t.dataset.item as 'tome_500', id), sfx.coin),
        star: () => ctx.run((st) => starUp(st, id), sfx.fanfare),
        unlock: () => {
          if (ctx.run((st) => unlockCommander(st, id), sfx.fanfare)) toast(`${def.name} joins your cause`, 'good', def.portrait);
        },
        skill: (t) => ctx.run((st) => upgradeSkill(st, id, Number(t.dataset.i)), sfx.fanfare),
        talents: () => openTalents(ctx, id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// talents

const pct = (v: number) => `${+(v * 100).toFixed(1)}%`;

export function openTalents(ctx: UiCtx, id: string): void {
  const def = COMMANDER_BY_ID[id];
  const trees = commanderTrees(id);
  let tab = 0;
  openModal({
    title: `${def.name} · Talents`,
    seal: '才',
    kicker: 'One point for every level',
    size: 'wide',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const free = freePoints(s, id);
      const total = talentPoints(s, id);
      body.innerHTML = `
        <div class="tal-head">
          <div class="tal-portrait" style="background-image:url(${assetUrl(def.portrait)})"></div>
          <div class="grow">
            <div class="kicker">Talent points</div>
            <div class="tal-pts"><b class="num">${free}</b><small>free of ${total}</small></div>
            <div class="muted" style="font-size:12px">Each tree opens deeper rows at ${ROW_GATE.slice(1).join(', ')} points.</div>
          </div>
          <button class="btn btn-sm" data-act="reset" ${total - free === 0 ? 'disabled' : ''}>Reset (free)</button>
        </div>
        <div class="tal-tabs">${trees.map((t, i) => `<button class="tal-tab ${i === tab ? 'sel' : ''}" data-act="tab" data-i="${i}"><span class="seal">${t.kanji}</span>${t.name}</button>`).join('')}</div>
        <div class="tal-trees">
          ${trees
            .map((t, ti) => {
              const inTree = pointsInTree(s, id, t);
              const rows = [0, 1, 2, 3]
                .map((r) => {
                  const open = rowOpen(s, id, t, r);
                  const nodes = t.nodes
                    .filter((n) => n.row === r)
                    .map((n) => {
                      const rank = talentRank(s, id, n.id);
                      const can = canLearn(s, id, n.id);
                      const maxed = rank >= n.max;
                      return `<button class="tal-node ${maxed ? 'maxed' : ''} ${can ? 'can' : ''} ${!open ? 'shut' : ''} ${n.row === 3 ? 'cap' : ''}" data-act="learn" data-id="${n.id}" ${can ? '' : 'aria-disabled="true"'}>
                        <span class="tal-ic">${ink(n.icon, n.row === 3 ? 30 : 24, rank > 0 ? 'gold' : 'cream')}</span>
                        <span class="tal-name">${n.name}</span>
                        <span class="tal-bonus">+${pct(n.per * Math.max(1, rank))} ${BONUS_LABEL[n.bonus] ?? n.bonus}</span>
                        <span class="tal-rank num">${rank}/${n.max}</span>
                      </button>`;
                    })
                    .join('');
                  return `<div class="tal-row ${open ? '' : 'shut'}">${open ? '' : `<div class="tal-gate">${ink('i_lock', 12)} ${ROW_GATE[r]} points in ${t.name}</div>`}${nodes}</div>`;
                })
                .join('');
              return `<section class="tal-tree ${ti === tab ? 'on' : ''}">
                <header><span class="seal">${t.kanji}</span><div class="grow"><div class="tal-tname">${t.name}</div><div class="kicker">${inTree} points</div></div></header>
                ${rows}
              </section>`;
            })
            .join('')}
        </div>`;
      onAct(body, {
        learn: (el) => {
          if (ctx.game.act((st) => (learnTalent(st, id, el.dataset.id!) ? { ok: true } : { ok: false, reason: 'locked' })).ok) {
            sfx.stamp();
            haptic('tap');
          } else sfx.error();
        },
        tab: (el) => {
          tab = Number(el.dataset.i);
          sfx.click();
          h.refresh();
        },
        reset: () => {
          ctx.game.act((st) => resetTalents(st, id));
          sfx.brush();
          toast('Talents returned · spend them anew', 'info', def.portrait);
        },
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
    if (ctx.run((st) => sendMarch(st, { kind: 'scout', targetId, commanderId: null, troops: {} }), sfx.march)) toast('Scouts ride out', 'good', 'ink/i_eye');
    return;
  }
  const idle = COMMANDERS.filter((c) => s0.commanders[c.id].unlocked && !commanderBusy(s0, c.id));
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
    title: kind === 'gather' ? 'Send gatherers' : 'Dispatch army',
    seal: kind === 'gather' ? '採' : '戦',
    kicker: kind === 'gather' ? 'World · Gather' : 'World · March',
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
      const verdict = kind === 'attack' ? (ratio > 1.6 ? ['Assured', 'var(--jade)'] : ratio > 1.05 ? ['Even', 'var(--accent-2)'] : ['Perilous', 'var(--red-2)']) : null;
      const ap = kind === 'attack' && t.kind === 'barbarian' ? BARB_AP_COST : kind === 'attack' && t.kind === 'fort' ? FORT_AP_COST : 0;
      body.innerHTML = `
        <div class="card target-card">
          <img src="${assetUrl(objSprite(t))}" alt="">
          <div class="grow"><div class="kicker">Target · ${t.x}, ${t.y}</div><div style="font-weight:700;font-size:17px">${esc(objLabel(t))}</div>
          <div class="muted">${t.troops && (t.scoutedAt || t.kind === 'barbarian' || t.kind === 'fort') ? `Garrison of ${fmtFull(sumTroops(t.troops))}` : t.kind === 'node' ? `${fmtFull(t.amount ?? 0)} ${t.res} remaining` : 'Garrison unknown — scout first'}</div></div>
          ${verdict ? `<div class="odds" style="color:${verdict[1]}">${verdict[0]}</div>` : ''}
        </div>
        <h3 class="sec">Commander</h3>
        <div class="march-cmds">
          ${COMMANDERS.filter((c) => s.commanders[c.id].unlocked)
            .map((c) => {
              const busy = commanderBusy(s, c.id);
              return `<div class="march-cmd ${commanderId === c.id ? 'sel' : ''} ${busy ? 'busy' : ''}" data-act="${busy ? '' : 'pick'}" data-id="${c.id}" style="background-image:url(${assetUrl(c.portrait)})"><div class="mc-name">${c.name}<br><small>LV ${s.commanders[c.id].level}</small></div></div>`;
            })
            .join('')}
        </div>
        <h3 class="sec">Troops <span class="muted">${fmtFull(n)} / ${fmtFull(cap)}</span>
          <button class="btn btn-sm" data-act="auto">Auto</button><button class="btn btn-sm" data-act="clear">Clear</button></h3>
        ${
          avail.length
            ? avail
                .map((k) => {
                  const [ty, tier] = k.split('_');
                  return `<div class="troop-row">
                    <img src="${assetUrl(troopIdSprite(k))}" alt="">
                    <div><div><b>${TROOP_NAMES[ty as TroopType][Number(tier) - 1]}</b> <span class="muted">· ${fmtFull(s.troops[k])} at home</span></div>
                    <input type="range" min="0" max="${s.troops[k]}" value="${sel[k] ?? 0}" data-troop="${k}"></div>
                    <input type="number" min="0" max="${s.troops[k]}" value="${sel[k] ?? 0}" data-troopn="${k}">
                  </div>`;
                })
                .join('')
            : '<div class="muted">The barracks stand empty. Train soldiers first.</div>'
        }
        <div class="spacer"></div>
        <div class="march-stats">
          <div class="mstat"><div class="v">${fmtFull(mine)}</div><div class="k">Power</div></div>
          <div class="mstat"><div class="v">${fmt(troopLoad(s, sel, commanderId))}</div><div class="k">Load</div></div>
          <div class="mstat"><div class="v">${fmtTime(secs)}</div><div class="k">March</div></div>
          <div class="mstat"><div class="v">${ap ? `${icon('ic_ap', 18)}${ap}` : '—'}</div><div class="k">Action points</div></div>
        </div>
        ${!valid.ok && n > 0 ? `<div style="margin-top:12px">${req(false, esc(valid.reason))}</div>` : ''}
        <div class="action-row"><button class="btn ${kind === 'gather' ? 'btn-gold' : 'btn-red'} btn-xl" data-act="go" ${!valid.ok ? 'disabled' : ''}>${ink(kind === 'gather' ? 'i_gather' : 'i_swords', 20)} ${kind === 'gather' ? 'Gather' : 'March'}</button></div>`;

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
            toast(kind === 'gather' ? 'Gatherers set out' : `${commanderId ? COMMANDER_BY_ID[commanderId].name : 'The army'} marches to war`, 'good', 'march_token');
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
  let shaking: 'silver' | 'gold' | null = null;
  openModal({
    title: 'The Tavern',
    seal: '酒',
    kicker: 'Recruit · Chests',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const chest = (kind: 'silver' | 'gold', at: number, keys: number) => {
        const free = at <= s.time;
        return `
        <div class="chest ${kind} ${shaking === kind ? 'shake' : ''}">
          <div class="chest-enso"></div>
          <div class="kicker">${kind === 'silver' ? 'Common fortune' : 'Royal fortune'}</div>
          <div class="chest-title">${kind === 'silver' ? 'Bronze Coffer' : 'Jade Coffer'}</div>
          <img class="chest-img" src="${assetUrl('ic_chest')}" alt="">
          <div class="muted" style="font-style:italic">${kind === 'silver' ? 'Epic generals, insignia and supplies' : 'Legendary generals, many insignia and gems'}</div>
          <div class="spacer"></div>
          ${free ? `<button class="btn btn-gold" data-act="open" data-kind="${kind}">Open · free</button>` : `<button class="btn" data-act="open" data-kind="${kind}" ${keys <= 0 ? 'disabled' : ''}>${icon(kind === 'silver' ? 'ic_key_silver' : 'ic_key_gold', 18)} Open · ${keys}</button>
             <div class="muted" style="margin-top:8px;font-size:11.5px">Free again in <span class="num" data-end="${at}"></span></div>`}
        </div>`;
      };
      body.innerHTML = `
        <div class="chests">
          ${chest('silver', s.tavern.silverFreeAt, s.items.silver_key ?? 0)}
          ${chest('gold', s.tavern.goldFreeAt, s.items.gold_key ?? 0)}
        </div>
        <div class="muted center" style="margin-top:10px;font-size:11.5px">A free bronze coffer every ${SILVER_FREE_MS / 3600_000} hours · a free jade coffer every ${GOLD_FREE_MS / 3600_000} hours</div>
        ${reveal}`;
      onAct(body, {
        open: (t) => {
          const kind = t.dataset.kind as 'silver' | 'gold';
          shaking = kind;
          h.refresh();
          sfx.chest();
          setTimeout(() => {
            shaking = null;
            let out: ReturnType<typeof openChest> | null = null;
            const ok = ctx.run((st) => {
              out = openChest(st, kind, ctx.game.rng);
              return out.ok ? { ok: true } : out;
            });
            if (ok && out && (out as { ok: boolean }).ok) {
              const r = out as Extract<ReturnType<typeof openChest>, { ok: true }>;
              reveal = `
                ${r.recruited ? `<div class="recruit"><h3 class="sec">A new general answers the call</h3>${cmdCard(ctx, r.recruited)}</div>` : ''}
                <h3 class="sec">Spoils</h3><div class="reveal">${revealItems(r.reward)}</div>`;
              if (r.recruited) {
                sfx.fanfare();
                toast(`${COMMANDER_BY_ID[r.recruited].name} has joined you`, 'good', COMMANDER_BY_ID[r.recruited].portrait);
              }
            }
            ctx.game.emitChange();
          }, 600);
        },
        cmd: (t) => openCommander(ctx, t.dataset.id!),
      });
    },
  });
}

function revealItems(r: Reward): string {
  const out: string[] = [];
  let i = 0;
  const card = (img: string, name: string, qty: string) =>
    `<div class="item" style="animation-delay:${i++ * 0.09}s"><img src="${assetUrl(img)}" alt=""><div class="i-name">${esc(name)}</div><div class="qty">${qty}</div></div>`;
  for (const k in r.sculptures ?? {}) out.push(card('ic_sculpture', `${COMMANDER_BY_ID[k].name}`, `×${r.sculptures![k]}`));
  for (const k in r.items ?? {}) {
    const n = r.items![k as keyof typeof r.items] ?? 0;
    if (n > 0) out.push(card(ITEMS[k as keyof typeof ITEMS].icon, ITEMS[k as keyof typeof ITEMS].name, `×${n}`));
  }
  if (r.res?.gems) out.push(card('ic_gems', 'Gems', `×${r.res.gems}`));
  return out.join('');
}
