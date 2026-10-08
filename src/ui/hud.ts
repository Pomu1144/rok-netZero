import { assetUrl } from '../assets';
import { BUILDINGS, marchSlots } from '../data/buildings';
import { COMMANDER_BY_ID } from '../data/commanders';
import { TECH_BY_ID } from '../data/research';
import { troopIdSprite } from '../data/troops';
import { RES_KEYS } from '../data/types';
import { FREE_FINISH_SECONDS, canAfford, cityHallLevel, producerCap, storedAmount, totalPower, upgradeInfo } from '../game/logic';
import { achievementBadge } from '../game/achievements';
import { huntBadge } from '../game/hunt';
import { ALLIANCE, MEMBER_BY_ID, allianceBadge, canAskHelp } from '../game/alliance';
import { dailyBadge, dayKey, loginClaimable } from '../game/daily';
import { activeQuests, questDone } from '../game/quests';
import { MAX_AP, type Job } from '../game/state';
import type { UiCtx } from './ctx';
import { $, el } from './dom';
import { esc, fmt, fmtFull } from './format';
import { ink, type InkIcon } from './ink';
import { jobTitle } from './panels/city';

export interface HudHandlers {
  toggleView: () => void;
  openNav: (id: string) => void;
  openJob: (jobId: string) => void;
  askHelp: (jobId: string) => void;
  openMarchInfo: (marchId: string) => void;
  idleBuilder: () => void;
  questClick: () => void;
  raidClick: () => void;
  openPlot: (plotId: string) => void;
  harvestAll: () => void;
  profile: () => void;
  home: () => void;
  kingdom: () => void;
}

/** The round buttons in the bottom-right tray. */
const NAV: [string, InkIcon, string][] = [
  ['campaign', 'i_swords', 'Campaign'],
  ['bag', 'i_bag', 'Satchel'],
  ['alliance', 'i_banner', 'Alliance'],
  ['commanders', 'i_helmet', 'Generals'],
];
/** Folded behind the tray's "More" button. */
const MORE: [string, InkIcon, string][] = [
  ['research', 'i_research', 'Academy'],
  ['quests', 'i_scroll', 'Decrees'],
  ['mail', 'i_mail', 'Reports'],
  ['settings', 'i_gear', 'Court'],
];

/** The age a Citadel level belongs to, shown under the resources. */
export function ageOf(level: number): string {
  return level >= 22 ? 'Era of Crowns' : level >= 16 ? 'Era of Banners' : level >= 10 ? 'Era of Stone' : level >= 5 ? 'Era of Timber' : 'Era of Thatch';
}

const FOLD_KEY = 'rok.worksOpen';
function readFold(): boolean {
  try {
    return localStorage.getItem(FOLD_KEY) !== '0';
  } catch {
    return true;
  }
}
function writeFold(open: boolean): void {
  try {
    localStorage.setItem(FOLD_KEY, open ? '1' : '0');
  } catch {
    /* private mode: the fold just isn't remembered */
  }
}

const RES_LABEL: Record<string, string> = { food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold', gems: 'Gems' };

export class Hud {
  private root = $('#hud');
  private cache = new Map<string, string>();
  view: 'city' | 'world' = 'city';
  private parts: Record<string, HTMLElement> = {};

  constructor(private ctx: UiCtx, private h: HudHandlers) {
    this.root.innerHTML = '';
    this.root.appendChild(el('<div class="edge-shade"></div>'));
    const add = (cls: string, part: string) => {
      const e = el(`<div class="${cls}" data-part="${part}"></div>`);
      this.root.appendChild(e);
      return e;
    };
    // top left: governor seal, power plate, AP and buffs
    add('gov', 'gov');
    add('buffs', 'buffs');
    // top right: resources, then the age and the events under them
    add('cur', 'res');
    this.root.appendChild(
      el(`<div class="tr-stack">
        <div class="age" data-part="age"></div>
        <div class="events" data-part="events">
          <button class="ev-btn" data-nav="calendar" aria-label="Login gifts"><img src="${assetUrl('ev_calendar')}" alt=""><span>Gifts</span><span class="badge hidden" data-badge="calendar"></span></button>
          <button class="ev-btn" data-nav="daily" aria-label="Daily duties"><img src="${assetUrl('ev_daily')}" alt=""><span>Duties</span><span class="badge hidden" data-badge="daily"></span></button>
          <button class="ev-btn" data-nav="hunt" aria-label="Barbarian hunt"><img src="${assetUrl('ev_hunt')}" alt=""><span>Hunt</span><span class="badge hidden" data-badge="hunt"></span></button>
          <button class="ev-btn" data-nav="honours" aria-label="Hall of honours"><img src="${assetUrl('ev_honours')}" alt=""><span>Honours</span><span class="badge hidden" data-badge="honours"></span></button>
          <button class="ev-btn scroll" data-nav="quests" aria-label="Decrees">${ink('i_scroll', 40)}<span>Decrees</span><span class="badge hidden" data-badge="quests"></span></button>
        </div>
      </div>`),
    );
    // right edge: armies in the field
    add('troops', 'troops');
    // left: the decree slip, and the works list folded out from it
    this.root.appendChild(
      el(`<div class="left-col">
        <div class="slip-row"><div class="quest-slip" data-part="quest"></div><button class="fold" data-fold="1" aria-label="Show works and marches"><span></span></button></div>
        <div class="queues" data-part="queues"></div>
      </div>`),
    );
    add('raid hidden', 'raid');
    // bottom left: realm/city ensō, the builders' hammer, alliance chat
    this.root.appendChild(
      el(`<button class="toggle" data-part="toggle" aria-label="Switch view">
        <span class="disc"></span><img class="enso" src="${assetUrl('ink/ink_enso_gold')}" alt="">
        <span class="tic" data-role="tic"></span><span class="tcap" data-role="tcap"></span>
      </button>`),
    );
    this.root.appendChild(el(`<button class="orb build" data-idle="1" aria-label="Builders">${ink('i_hammer', 30)}<span class="badge hidden" data-badge="builders"></span></button>`));
    this.root.appendChild(el(`<button class="orb harvest" data-harvest="1" aria-label="Harvest every building">${ink('i_gather', 28)}<span class="badge hidden" data-badge="harvest"></span></button>`));
    add('chat-strip hidden', 'chat');
    add('world-tools', 'worldtools');
    // bottom right: reports above the tray of round buttons
    this.root.appendChild(el(`<button class="orb mail" data-nav="mail" aria-label="Reports">${ink('i_mail', 28)}<span class="badge hidden" data-badge="mail"></span></button>`));
    this.root.appendChild(
      el(`<nav class="tray" aria-label="Main">
        ${NAV.map(([id, ic, label]) => `<button class="tray-btn" data-nav="${id}"><span class="orb-face">${ink(ic, 30)}</span><span class="lbl">${label}</span><span class="badge hidden" data-badge="${id}"></span></button>`).join('')}
        <button class="tray-btn more" data-more="1" aria-label="More" aria-expanded="false"><span class="orb-face"><i></i><i></i><i></i></span><span class="lbl">More</span></button>
      </nav>`),
    );
    this.root.appendChild(
      el(`<div class="more-menu hidden" data-part="more">
        ${MORE.map(([id, ic, label]) => `<button class="more-btn" data-nav="${id}">${ink(ic, 24)}<span>${label}</span></button>`).join('')}
      </div>`),
    );
    this.root.querySelectorAll<HTMLElement>('[data-part]').forEach((e) => (this.parts[e.dataset.part!] = e));
    this.root.classList.toggle('works-open', readFold());

    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const more = !!t.closest('[data-more]');
      this.parts.more.classList.toggle('hidden', !more || !this.parts.more.classList.contains('hidden'));
      this.root.querySelector('[data-more]')!.setAttribute('aria-expanded', String(!this.parts.more.classList.contains('hidden')));
      if (more) return;
      if (t.closest('[data-fold]')) {
        const open = !this.root.classList.contains('works-open');
        this.root.classList.toggle('works-open', open);
        writeFold(open);
        return;
      }
      const nav = t.closest('[data-nav]') as HTMLElement | null;
      if (nav) return this.h.openNav(nav.dataset.nav!);
      const help = t.closest('[data-help]') as HTMLElement | null;
      if (help) return this.h.askHelp(help.dataset.help!);
      const job = t.closest('[data-job]') as HTMLElement | null;
      if (job) return this.h.openJob(job.dataset.job!);
      const march = t.closest('[data-march]') as HTMLElement | null;
      if (march) return this.h.openMarchInfo(march.dataset.march!);
      if (t.closest('[data-idle]')) return this.h.idleBuilder();
      if (t.closest('[data-harvest]')) return this.h.harvestAll();
      const plan = t.closest('[data-plan]') as HTMLElement | null;
      if (plan) return this.h.openPlot(plan.dataset.plan!);
      if (t.closest('[data-slot]')) return this.h.openNav('world');
      if (t.closest('[data-part=toggle]')) return this.h.toggleView();
      if (t.closest('[data-part=quest]')) return this.h.questClick();
      if (t.closest('[data-part=raid]')) return this.h.raidClick();
      if (t.closest('[data-part=chat]')) return this.h.openNav('chat');
      if (t.closest('[data-part=gov]')) return this.h.profile();
      if (t.closest('[data-home]')) return this.h.home();
      if (t.closest('[data-kingdom]')) return this.h.kingdom();
      if (t.closest('[data-res]')) return this.h.openNav('bag');
    });
  }

  private set(part: string, html: string): void {
    if (this.cache.get(part) === html) return;
    this.cache.set(part, html);
    this.parts[part].innerHTML = html;
  }

  /** One-tap alliance help on a queue row (shown only while help can be asked). */
  private helpBtn(j: Job): string {
    return canAskHelp(this.ctx.game.state, j) ? `<button class="q-help" data-help="${j.id}" aria-label="Ask alliance for help"><img src="${assetUrl('al_help')}" alt=""></button>` : '';
  }

  /** The HUD element a resource icon should fly into. */
  resEl(key: string): Element | null {
    return this.root.querySelector(`[data-res=${key}]`);
  }

  flashRes(key: string): void {
    const e = this.resEl(key);
    if (!e) return;
    e.classList.remove('flash');
    void (e as HTMLElement).offsetWidth;
    e.classList.add('flash');
  }

  update(worldCoords?: { x: number; y: number }): void {
    const s = this.ctx.game.state;
    const ch = cityHallLevel(s);
    this.set(
      'gov',
      `<div class="gov-avatar" style="background-image:url(${assetUrl('city_player')})"><img class="ring" src="${assetUrl('ink/ink_enso_gold')}" alt=""><span class="seal">${ch}</span></div>
       <div class="gov-info">
         <div class="gov-power" title="Power">${ink('i_swords', 18)}<span class="num">${fmtFull(totalPower(s))}</span></div>
         <div class="gov-sub"><span class="gov-name">${esc(s.governor)}</span><span class="ap" title="Action points">${ink('i_flame', 14)}<span class="gauge ap"><span style="width:${(s.ap / MAX_AP) * 100}%"></span></span><small>${Math.floor(s.ap)}</small></span></div>
       </div>`,
    );
    this.set(
      'res',
      [...RES_KEYS, 'gems' as const]
        .map((k) => {
          const v = k === 'gems' ? s.gems : s.res[k];
          return `<div class="cur-item ${k === 'gems' ? 'gems' : ''}" data-res="${k}" title="${RES_LABEL[k]}"><img src="${assetUrl(`ic_${k}`)}" alt=""><span class="v">${fmt(v)}</span>${k === 'gems' ? '<span class="plus" aria-hidden="true">+</span>' : ''}</div>`;
        })
        .join(''),
    );
    this.set('age', `<b>${ageOf(ch)}</b><span>Citadel Lv.${ch}</span>`);

    // armies in the field, one portrait per march, then one free slot to send another
    const slots = marchSlots(ch);
    const out = s.marches.filter((m) => m.kind !== 'scout');
    const troops = [`<div class="troops-head"><b>${out.length}</b>/${slots}</div>`];
    for (const m of s.marches) {
      const pic = m.commanderId ? `<img src="${assetUrl(COMMANDER_BY_ID[m.commanderId].portrait)}" alt="">` : ink('i_eye', 30);
      const state = m.phase === 'returning' ? 'i_recall' : m.phase === 'gathering' || m.kind === 'gather' ? 'i_gather' : m.kind === 'scout' ? 'i_eye' : 'i_swords';
      const end = m.phase === 'gathering' ? m.gatherEnd! : m.arriveAt;
      troops.push(`<button class="troop ${m.kind}" data-march="${m.id}" aria-label="March">${pic}<span class="st">${ink(state as InkIcon, 14)}</span><span class="tt" data-end="${end}"></span></button>`);
    }
    if (out.length < slots) troops.push('<button class="troop empty" data-slot="1" aria-label="Send an army"><span>+</span></button>');
    this.set('troops', troops.join(''));

    // alliance chat, the last few lines
    const al = s.alliance;
    this.parts.chat.classList.toggle('hidden', !al || !al.chat.length);
    if (al) {
      const who = (f: string) => (f === 'me' ? s.governor : f === 'sys' ? 'Herald' : MEMBER_BY_ID[f]?.name ?? '');
      this.set(
        'chat',
        `<span class="chat-ic">${ink('i_banner', 20)}</span><div class="chat-lines">${al.chat
          .slice(-3)
          .map((m) => `<div><b>[${ALLIANCE.tag}]${esc(who(m.from))}:</b> ${esc(m.text)}</div>`)
          .join('')}</div>`,
      );
    }

    // queues
    const q: string[] = ['<div class="kicker">Works</div>'];
    const builds = s.jobs.filter((j) => j.kind === 'build');
    for (const j of builds) {
      const free = (j.end - s.time) / 1000 <= FREE_FINISH_SECONDS;
      q.push(`<div class="queue ${free ? 'free' : ''}" data-job="${j.id}">${ink('i_hammer', 26)}<div class="q-main"><div class="q-title">${esc(jobTitle(this.ctx, j))}</div><div class="q-bar"><div data-start="${j.start}" data-end="${j.end}"></div></div></div>${free ? '<span class="free-tag">FREE</span>' : `${this.helpBtn(j)}<span class="q-time" data-end="${j.end}"></span>`}</div>`);
    }
    for (let i = builds.length; i < s.builders; i++) {
      q.push(`<div class="queue idle" data-idle="1">${ink('i_hammer', 26)}<div class="q-main"><div class="q-title">Builder at rest</div><div class="q-sub">Tap to find work</div></div></div>`);
    }
    for (const id of s.buildPlan ?? []) {
      const b = s.buildings[id];
      q.push(`<div class="queue planned" data-plan="${id}">${ink('i_scroll', 26)}<div class="q-main"><div class="q-title">Planned · ${esc(BUILDINGS[b.type].name)} Lv.${b.level + 1}</div><div class="q-sub">Starts when a builder is free</div></div></div>`);
    }
    for (const j of s.jobs.filter((x) => x.kind !== 'build')) {
      const ic = j.kind === 'research' ? ink(TECH_BY_ID[j.target].icon, 26) : j.kind === 'heal' ? ink('i_heal', 26) : `<img src="${assetUrl(troopIdSprite(j.target))}" alt="">`;
      q.push(`<div class="queue" data-job="${j.id}">${ic}<div class="q-main"><div class="q-title">${esc(jobTitle(this.ctx, j))}</div><div class="q-bar"><div data-start="${j.start}" data-end="${j.end}"></div></div></div>${this.helpBtn(j)}<span class="q-time" data-end="${j.end}"></span></div>`);
    }
    this.set('queues', q.join(''));

    // quest slip
    const quest = activeQuests(s, 8).find((x) => questDone(s, x)) ?? activeQuests(s, 1)[0];
    if (quest) {
      const [p, t] = quest.check(s);
      const done = questDone(s, quest);
      this.parts.quest.classList.toggle('done', done);
      this.parts.quest.classList.remove('hidden');
      this.set(
        'quest',
        `<div class="seal">令</div>
         <div class="kicker">${done ? 'Decree fulfilled · claim' : 'Royal decree'}</div>
         <div class="qt">${esc(quest.title)}</div>
         <div class="qbar"><div style="width:${Math.min(100, (p / t) * 100)}%"></div></div>
         <div class="qp">${fmt(Math.min(p, t))} / ${fmt(t)}</div>`,
      );
    } else this.parts.quest.classList.add('hidden');

    if (s.raid) {
      this.parts.raid.classList.remove('hidden');
      this.set('raid', `<div class="kicker">襲 · Warband approaching</div><div class="msg">A Lv.${s.raid.level} barbarian host strikes in <b data-end="${s.raid.arriveAt}"></b></div>`);
    } else {
      this.parts.raid.classList.add('hidden');
      this.set('raid', '');
    }

    this.set(
      'buffs',
      s.holyBuffs
        .filter((b) => b.until > s.time)
        .map((b) => `<div class="buff" title="${esc(b.label)}"><img src="${assetUrl('holy_site')}" alt="">${esc(b.label)} · <span class="num" data-end="${b.until}"></span></div>`)
        .join(''),
    );

    const unread = s.reports.filter((r) => !r.read).length;
    const claimable = activeQuests(s, 8).filter((x) => questDone(s, x)).length;
    const badge = (id: string, n: number) => {
      this.root.querySelectorAll<HTMLElement>(`[data-badge=${id}]`).forEach((b) => {
        b.classList.toggle('hidden', n <= 0);
        b.textContent = String(n);
      });
    };
    badge('mail', unread);
    badge('quests', claimable);
    badge('calendar', loginClaimable(s, dayKey()) >= 0 ? 1 : 0);
    badge('daily', dailyBadge(s));
    badge('honours', achievementBadge(s));
    badge('hunt', huntBadge(s));
    badge('alliance', s.alliance ? allianceBadge(s) : 0);
    badge('commanders', Object.values(s.commanders).some((c) => !c.unlocked && c.sculptures >= 10) ? 1 : 0);
    badge('builders', s.builders - s.jobs.filter((j) => j.kind === 'build').length);
    const full = Object.keys(s.buildings).filter((id) => BUILDINGS[s.buildings[id].type].producer && storedAmount(s, id) >= producerCap(s, id) * 0.25).length;
    badge('harvest', full);
    this.parts.harvestOrb ??= this.root.querySelector('.orb.harvest') as HTMLElement;
    this.parts.harvestOrb.classList.toggle('hidden', this.view !== 'city');
    const tic = this.parts.toggle.querySelector('[data-role=tic]') as HTMLElement;
    const tcap = this.parts.toggle.querySelector('[data-role=tcap]') as HTMLElement;
    const want = this.view === 'city' ? ['i_map', 'REALM'] : ['i_castle', 'CITY'];
    if (tcap.textContent !== want[1]) {
      tic.innerHTML = ink(want[0] as InkIcon, 44);
      tcap.textContent = want[1];
    }
    this.parts.worldtools.classList.toggle('hidden', this.view !== 'world');
    if (this.view === 'world' && worldCoords) {
      this.set('worldtools', `<button class="btn btn-sm" data-home="1">${ink('i_castle', 15)} Home</button><button class="btn btn-sm" data-kingdom="1">${ink('i_map', 15)} Kingdom</button><span class="coords">X ${worldCoords.x} · Y ${worldCoords.y}</span>`);
    }
  }

  /** Find a building the player can upgrade right now, preferring the Citadel. */
  static suggestUpgrade(ctx: UiCtx): string {
    const s = ctx.game.state;
    const ids = Object.keys(s.buildings)
      .filter((id) => !s.jobs.some((j) => j.kind === 'build' && j.target === id))
      .sort((a, b) => (a === 'city_hall' ? -1 : b === 'city_hall' ? 1 : s.buildings[a].level - s.buildings[b].level));
    const ok = ids.filter((id) => upgradeInfo(s, id).ok);
    return ok.find((id) => canAfford(s, upgradeInfo(s, id).cost)) ?? ok[0] ?? 'city_hall';
  }
}
