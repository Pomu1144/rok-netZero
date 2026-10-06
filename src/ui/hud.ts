import { assetUrl } from '../assets';
import { marchSlots } from '../data/buildings';
import { COMMANDER_BY_ID } from '../data/commanders';
import { TECH_BY_ID } from '../data/research';
import { troopIdSprite } from '../data/troops';
import { RES_KEYS } from '../data/types';
import { FREE_FINISH_SECONDS, canAfford, cityHallLevel, findObj, objLabel, totalPower, upgradeInfo } from '../game/logic';
import { achievementBadge } from '../game/achievements';
import { huntBadge } from '../game/hunt';
import { allianceBadge, canAskHelp } from '../game/alliance';
import { dailyBadge, dayKey, loginClaimable } from '../game/daily';
import { activeQuests, questDone } from '../game/quests';
import { MAX_AP, type Job } from '../game/state';
import type { UiCtx } from './ctx';
import { $, el } from './dom';
import { esc, fmt } from './format';
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
  profile: () => void;
  home: () => void;
}

const NAV: [string, InkIcon, string][] = [
  ['commanders', 'i_helmet', 'Generals'],
  ['research', 'i_research', 'Academy'],
  ['bag', 'i_bag', 'Satchel'],
  ['quests', 'i_scroll', 'Decrees'],
  ['alliance', 'i_banner', 'Alliance'],
  ['mail', 'i_mail', 'Reports'],
];

const RES_LABEL: Record<string, string> = { food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold', gems: 'Gems' };

export class Hud {
  private root = $('#hud');
  private cache = new Map<string, string>();
  view: 'city' | 'world' = 'city';
  private parts: Record<string, HTMLElement> = {};

  constructor(private ctx: UiCtx, private h: HudHandlers) {
    this.root.innerHTML = '';
    this.root.appendChild(el('<div class="edge-shade"></div>'));
    this.root.appendChild(
      el(`<nav class="rail" aria-label="Main">
        <div class="rail-brand"><img class="enso" src="${assetUrl('ink/ink_enso_gold')}" alt=""><img class="crown ic" src="${assetUrl('ink/i_crown')}" alt=""></div>
        <button class="rail-btn" data-nav="city">${ink('i_castle', 28)}<span>City</span></button>
        <button class="rail-btn" data-nav="world">${ink('i_map', 28)}<span>Realm</span></button>
        <div class="rail-sep"></div>
        ${NAV.map(([id, ic, label]) => `<button class="rail-btn" data-nav="${id}">${ink(ic, 28)}<span>${label}</span><span class="badge hidden" data-badge="${id}"></span></button>`).join('')}
        <div class="rail-spacer"></div>
        <button class="rail-btn" data-nav="settings">${ink('i_gear', 24)}<span>Court</span></button>
      </nav>`),
    );
    this.root.appendChild(
      el(`<div class="hud-top">
        <div class="gov" data-part="gov"></div>
        <div class="cur" data-part="res"></div>
      </div>`),
    );
    const add = (cls: string, part: string) => {
      const e = el(`<div class="${cls}" data-part="${part}"></div>`);
      this.root.appendChild(e);
      return e;
    };
    add('queues', 'queues');
    add('quest-slip', 'quest');
    add('raid hidden', 'raid');
    add('buffs', 'buffs');
    this.root.appendChild(
      el(`<div class="events" data-part="events">
        <button class="ev-btn" data-nav="calendar" aria-label="Login gifts"><img src="${assetUrl('ev_calendar')}" alt=""><span>Gifts</span><span class="badge hidden" data-badge="calendar"></span></button>
        <button class="ev-btn" data-nav="daily" aria-label="Daily duties"><img src="${assetUrl('ev_daily')}" alt=""><span>Duties</span><span class="badge hidden" data-badge="daily"></span></button>
        <button class="ev-btn" data-nav="hunt" aria-label="Barbarian hunt"><img src="${assetUrl('ev_hunt')}" alt=""><span>Hunt</span><span class="badge hidden" data-badge="hunt"></span></button>
        <button class="ev-btn" data-nav="honours" aria-label="Hall of honours"><img src="${assetUrl('ev_honours')}" alt=""><span>Honours</span><span class="badge hidden" data-badge="honours"></span></button>
      </div>`),
    );
    this.root.appendChild(
      el(`<button class="toggle" data-part="toggle" aria-label="Switch view">
        <span class="disc"></span><img class="enso" src="${assetUrl('ink/ink_enso_gold')}" alt="">
        <span class="tic" data-role="tic"></span><span class="tcap" data-role="tcap"></span>
      </button>`),
    );
    add('world-tools', 'worldtools');
    this.root.querySelectorAll<HTMLElement>('[data-part]').forEach((e) => (this.parts[e.dataset.part!] = e));

    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const nav = t.closest('[data-nav]') as HTMLElement | null;
      if (nav) return this.h.openNav(nav.dataset.nav!);
      const help = t.closest('[data-help]') as HTMLElement | null;
      if (help) return this.h.askHelp(help.dataset.help!);
      const job = t.closest('[data-job]') as HTMLElement | null;
      if (job) return this.h.openJob(job.dataset.job!);
      const march = t.closest('[data-march]') as HTMLElement | null;
      if (march) return this.h.openMarchInfo(march.dataset.march!);
      if (t.closest('[data-idle]')) return this.h.idleBuilder();
      if (t.closest('[data-part=toggle]')) return this.h.toggleView();
      if (t.closest('[data-part=quest]')) return this.h.questClick();
      if (t.closest('[data-part=raid]')) return this.h.raidClick();
      if (t.closest('[data-part=gov]')) return this.h.profile();
      if (t.closest('[data-home]')) return this.h.home();
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
    this.set(
      'gov',
      `<div class="gov-avatar" style="background-image:url(${assetUrl('city_player')})"><span class="seal">${cityHallLevel(s)}</span></div>
       <div class="gov-info">
         <div class="gov-name">${esc(s.governor)}</div>
         <div class="gov-power"><span class="kicker">Power</span><span class="num">${fmt(totalPower(s))}</span></div>
         <div class="ap"><span class="kicker">AP</span><div class="gauge ap"><div style="width:${(s.ap / MAX_AP) * 100}%"></div></div><small>${Math.floor(s.ap)}</small></div>
       </div>`,
    );
    this.set(
      'res',
      [...RES_KEYS, 'gems' as const]
        .map((k) => {
          const v = k === 'gems' ? s.gems : s.res[k];
          return `<div class="cur-item ${k === 'gems' ? 'gems' : ''}" data-res="${k}" title="${RES_LABEL[k]}"><img src="${assetUrl(`ic_${k}`)}" alt=""><span class="v">${fmt(v)}</span><span class="k">${RES_LABEL[k]}</span></div>`;
        })
        .join(''),
    );

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
    for (const j of s.jobs.filter((x) => x.kind !== 'build')) {
      const ic = j.kind === 'research' ? ink(TECH_BY_ID[j.target].icon, 26) : j.kind === 'heal' ? ink('i_heal', 26) : `<img src="${assetUrl(troopIdSprite(j.target))}" alt="">`;
      q.push(`<div class="queue" data-job="${j.id}">${ic}<div class="q-main"><div class="q-title">${esc(jobTitle(this.ctx, j))}</div><div class="q-bar"><div data-start="${j.start}" data-end="${j.end}"></div></div></div>${this.helpBtn(j)}<span class="q-time" data-end="${j.end}"></span></div>`);
    }
    if (s.marches.length) q.push('<div class="kicker" style="margin-top:6px">Marches</div>');
    for (const m of s.marches) {
      const t = findObj(s, m.targetId);
      const label = m.phase === 'returning' ? 'Returning' : m.phase === 'gathering' ? 'Gathering' : m.kind === 'scout' ? 'Scouting' : m.kind === 'gather' ? 'To gather' : 'Attacking';
      const end = m.phase === 'gathering' ? m.gatherEnd! : m.arriveAt;
      const pic = m.commanderId ? `<img class="portrait" src="${assetUrl(COMMANDER_BY_ID[m.commanderId].portrait)}" alt="">` : ink('i_eye', 26);
      q.push(`<div class="queue ${m.kind === 'gather' ? 'gather' : m.kind === 'attack' ? 'march' : ''}" data-march="${m.id}">${pic}<div class="q-main"><div class="q-title">${label} · ${esc(t ? objLabel(t) : '')}</div>
        <div class="q-bar"><div data-start="${m.departAt}" data-end="${end}"></div></div></div><span class="q-time" data-end="${end}"></span></div>`);
    }
    const marchCount = s.marches.filter((m) => m.kind !== 'scout').length;
    q.push(`<div class="kicker" style="color:var(--faint);margin-top:2px">March queues ${marchCount} / ${marchSlots(cityHallLevel(s))}</div>`);
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
      const b = this.root.querySelector(`[data-badge=${id}]`) as HTMLElement;
      b.classList.toggle('hidden', n <= 0);
      b.textContent = String(n);
    };
    badge('mail', unread);
    badge('quests', claimable);
    badge('calendar', loginClaimable(s, dayKey()) >= 0 ? 1 : 0);
    badge('daily', dailyBadge(s));
    badge('honours', achievementBadge(s));
    badge('hunt', huntBadge(s));
    badge('alliance', s.alliance ? allianceBadge(s) : 0);
    badge('commanders', Object.values(s.commanders).some((c) => !c.unlocked && c.sculptures >= 10) ? 1 : 0);

    this.root.querySelectorAll('.rail-btn[data-nav=city], .rail-btn[data-nav=world]').forEach((b) => {
      b.classList.toggle('is-active', (b as HTMLElement).dataset.nav === this.view);
    });
    const tic = this.parts.toggle.querySelector('[data-role=tic]') as HTMLElement;
    const tcap = this.parts.toggle.querySelector('[data-role=tcap]') as HTMLElement;
    const want = this.view === 'city' ? ['i_map', 'REALM'] : ['i_castle', 'CITY'];
    if (tcap.textContent !== want[1]) {
      tic.innerHTML = ink(want[0] as InkIcon, 44);
      tcap.textContent = want[1];
    }
    this.parts.worldtools.classList.toggle('hidden', this.view !== 'world');
    if (this.view === 'world' && worldCoords) {
      this.set('worldtools', `<button class="btn btn-sm" data-home="1">${ink('i_castle', 15)} Home</button><span class="coords">X ${worldCoords.x} · Y ${worldCoords.y}</span>`);
    }
  }

  /** Find a building the player can upgrade right now, preferring the City Hall. */
  static suggestUpgrade(ctx: UiCtx): string {
    const s = ctx.game.state;
    const ids = Object.keys(s.buildings)
      .filter((id) => !s.jobs.some((j) => j.kind === 'build' && j.target === id))
      .sort((a, b) => (a === 'city_hall' ? -1 : b === 'city_hall' ? 1 : s.buildings[a].level - s.buildings[b].level));
    const ok = ids.filter((id) => upgradeInfo(s, id).ok);
    return ok.find((id) => canAfford(s, upgradeInfo(s, id).cost)) ?? ok[0] ?? 'city_hall';
  }
}
