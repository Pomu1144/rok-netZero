import { assetUrl } from '../assets';
import { COMMANDER_BY_ID } from '../data/commanders';
import { TECH_BY_ID } from '../data/research';
import { TROOP_SPRITES } from '../data/troops';
import { RES_KEYS, type TroopType } from '../data/types';
import { FREE_FINISH_SECONDS, canAfford, cityHallLevel, findObj, objLabel, totalPower, upgradeInfo } from '../game/logic';
import { activeQuests, questDone } from '../game/quests';
import { MAX_AP } from '../game/state';
import { marchSlots } from '../data/buildings';
import type { UiCtx } from './ctx';
import { $, el, icon } from './dom';
import { esc, fmt } from './format';
import { jobTitle } from './panels/city';

export interface HudHandlers {
  toggleView: () => void;
  openNav: (id: string) => void;
  openJob: (jobId: string) => void;
  openMarchInfo: (marchId: string) => void;
  idleBuilder: () => void;
  questClick: () => void;
  raidClick: () => void;
  profile: () => void;
  home: () => void;
}

export class Hud {
  private root = $('#hud');
  private cache = new Map<string, string>();
  view: 'city' | 'world' = 'city';
  private parts: Record<string, HTMLElement> = {};

  constructor(private ctx: UiCtx, private h: HudHandlers) {
    this.root.innerHTML = '';
    const top = el(`<div class="hud-top">
        <div class="gov" data-part="gov"></div>
        <div class="resbar" data-part="res"></div>
      </div>`);
    this.root.appendChild(top);
    this.root.appendChild(el('<div class="hud-bottom"></div>'));
    const add = (cls: string, part: string) => {
      const e = el(`<div class="${cls}" data-part="${part}"></div>`);
      this.root.appendChild(e);
      return e;
    };
    add('hud-left', 'queues');
    add('quest-tracker', 'quest');
    add('raid-banner hidden', 'raid');
    add('buff-row', 'buffs');
    const nav = el(`<div class="nav">
      ${[
        ['commanders', 'nav_commanders', 'Commanders'],
        ['research', 'nav_research', 'Research'],
        ['bag', 'nav_bag', 'Items'],
        ['quests', 'nav_quests', 'Quests'],
        ['mail', 'nav_mail', 'Reports'],
      ]
        .map(([id, img, label]) => `<button class="nav-btn" data-nav="${id}"><img src="${assetUrl(img)}" alt=""><span>${label}</span><span class="badge hidden" data-badge="${id}"></span></button>`)
        .join('')}
    </div>`);
    this.root.appendChild(nav);
    const toggle = el(`<button class="view-toggle" data-part="toggle"></button>`);
    this.root.appendChild(toggle);
    add('world-tools', 'worldtools');
    this.root.querySelectorAll<HTMLElement>('[data-part]').forEach((e) => (this.parts[e.dataset.part!] = e));

    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const nav = t.closest('[data-nav]') as HTMLElement | null;
      if (nav) return this.h.openNav(nav.dataset.nav!);
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
      const res = t.closest('[data-res]') as HTMLElement | null;
      if (res) return this.h.openNav('bag');
    });
  }

  private set(part: string, html: string): void {
    if (this.cache.get(part) === html) return;
    this.cache.set(part, html);
    this.parts[part].innerHTML = html;
  }

  flashRes(key: string): void {
    const e = this.root.querySelector(`[data-res=${key}]`);
    if (!e) return;
    e.classList.remove('flash');
    void (e as HTMLElement).offsetWidth;
    e.classList.add('flash');
  }

  update(worldCoords?: { x: number; y: number }): void {
    const s = this.ctx.game.state;
    this.set(
      'gov',
      `<div class="gov-avatar" style="background-image:url(${assetUrl('city_player')})"><span class="ch-badge">${cityHallLevel(s)}</span></div>
       <div class="gov-info">
         <div class="gov-name">${esc(s.governor)}</div>
         <span class="pill">${icon('ic_power')} ${fmt(totalPower(s))}</span>
         <div class="row" style="gap:6px">${icon('ic_ap', 18)}<div class="ap-bar"><div style="width:${(s.ap / MAX_AP) * 100}%"></div></div><small>${Math.floor(s.ap)}</small></div>
       </div>`,
    );
    this.set(
      'res',
      RES_KEYS.map((k) => `<span class="pill res" data-res="${k}" title="${k}">${icon(`ic_${k}`)} ${fmt(s.res[k])}</span>`).join('') +
        `<span class="pill res gems" data-res="gems">${icon('ic_gems')} ${fmt(s.gems)}</span>`,
    );

    // queues
    const q: string[] = [];
    const builds = s.jobs.filter((j) => j.kind === 'build');
    for (const j of builds) {
      const free = (j.end - s.time) / 1000 <= FREE_FINISH_SECONDS;
      q.push(`<div class="queue ${free ? 'free' : ''}" data-job="${j.id}">${icon('ic_build', 30)}<div class="q-main"><div class="q-title">${esc(jobTitle(this.ctx, j))}</div><div class="q-bar"><div data-start="${j.start}" data-end="${j.end}"></div></div></div>${free ? '<span class="free-tag">FREE</span>' : `<span class="q-time" data-end="${j.end}"></span>`}</div>`);
    }
    for (let i = builds.length; i < s.builders; i++) q.push(`<div class="queue idle" data-idle="1">${icon('ic_build', 30)}<div class="q-main"><div class="q-title">Builder idle</div><div class="muted" style="font-size:11px">Tap to find an upgrade</div></div></div>`);
    for (const j of s.jobs.filter((x) => x.kind !== 'build')) {
      const img = j.kind === 'research' ? 'nav_research' : j.kind === 'heal' ? 'hospital' : TROOP_SPRITES[j.target.split('_')[0] as TroopType];
      const title = j.kind === 'research' ? `${TECH_BY_ID[j.target].icon} ${jobTitle(this.ctx, j)}` : jobTitle(this.ctx, j);
      q.push(`<div class="queue" data-job="${j.id}">${icon(img, 30)}<div class="q-main"><div class="q-title">${esc(title)}</div><div class="q-bar"><div data-start="${j.start}" data-end="${j.end}"></div></div></div><span class="q-time" data-end="${j.end}"></span></div>`);
    }
    for (const m of s.marches) {
      const t = findObj(s, m.targetId);
      const label = m.phase === 'returning' ? 'Returning' : m.phase === 'gathering' ? 'Gathering' : m.kind === 'scout' ? 'Scouting' : m.kind === 'gather' ? 'To gather' : 'Attacking';
      const end = m.phase === 'gathering' ? m.gatherEnd! : m.arriveAt;
      const img = m.commanderId ? COMMANDER_BY_ID[m.commanderId].portrait : 'scout_camp';
      q.push(`<div class="queue" data-march="${m.id}" style="border-left-color:${m.kind === 'gather' ? '#7ee06a' : m.kind === 'scout' ? '#f2d16b' : '#ff6a4d'}">
        <img src="${assetUrl(img)}" style="border-radius:50%;object-fit:cover;border:1px solid var(--gold)"><div class="q-main"><div class="q-title">${label} · ${esc(t ? objLabel(t) : '')}</div>
        <div class="q-bar"><div data-start="${m.phase === 'gathering' ? m.departAt : m.departAt}" data-end="${end}"></div></div></div><span class="q-time" data-end="${end}"></span></div>`);
    }
    const marchCount = s.marches.filter((m) => m.kind !== 'scout').length;
    q.push(`<div class="muted" style="font-size:11px;padding-left:4px;text-shadow:0 1px 2px #000">Marches ${marchCount}/${marchSlots(cityHallLevel(s))}</div>`);
    this.set('queues', q.join(''));

    // quest tracker
    const quest = activeQuests(s, 8).find((x) => questDone(s, x)) ?? activeQuests(s, 1)[0];
    if (quest) {
      const [p, t] = quest.check(s);
      const done = questDone(s, quest);
      this.parts.quest.classList.toggle('done', done);
      this.parts.quest.classList.remove('hidden');
      this.set(
        'quest',
        `<div class="qt-head">${icon('nav_quests', 22)} ${done ? 'Quest complete! Tap to claim' : 'Chronicle Quest'}</div>
         <div class="qt-title">${esc(quest.title)}</div>
         <div class="bar green"><div style="width:${Math.min(100, (p / t) * 100)}%"></div></div>`,
      );
    } else this.parts.quest.classList.add('hidden');

    // raid banner
    if (s.raid) {
      this.parts.raid.classList.remove('hidden');
      this.set('raid', `⚠ Lv.${s.raid.level} warband attacks in <span data-end="${s.raid.arriveAt}"></span> — prepare your defenses!`);
    } else {
      this.parts.raid.classList.add('hidden');
      this.set('raid', '');
    }

    this.set(
      'buffs',
      s.holyBuffs
        .filter((b) => b.until > s.time)
        .map((b) => `<span class="pill" title="${esc(b.label)}">${icon('holy_site')} ${esc(b.label)} · <span data-end="${b.until}"></span></span>`)
        .join(''),
    );

    // nav badges
    const unread = s.reports.filter((r) => !r.read).length;
    const claimable = activeQuests(s, 8).filter((x) => questDone(s, x)).length;
    const badge = (id: string, n: number) => {
      const b = this.root.querySelector(`[data-badge=${id}]`) as HTMLElement;
      b.classList.toggle('hidden', n <= 0);
      b.textContent = String(n);
    };
    badge('mail', unread);
    badge('quests', claimable);
    const sculptReady = Object.values(s.commanders).some((c) => !c.unlocked && c.sculptures >= 10);
    badge('commanders', sculptReady ? 1 : 0);

    this.set(
      'toggle',
      this.view === 'city'
        ? `<img src="${assetUrl('nav_map')}" alt=""><span>World</span>`
        : `<img src="${assetUrl('city_player')}" alt=""><span>City</span>`,
    );
    this.parts.worldtools.classList.toggle('hidden', this.view !== 'world');
    if (this.view === 'world' && worldCoords) {
      this.set('worldtools', `<button class="btn btn-blue btn-sm" data-home="1">🏰 Home</button><span class="pill coords">X ${worldCoords.x} · Y ${worldCoords.y}</span>`);
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
