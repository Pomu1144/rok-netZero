import { assetUrl } from '../assets';
import { sfx } from '../audio';
import { COMMANDER_BY_ID } from '../data/commanders';
import type { Game } from '../game/game';
import { activeQuests, questDone } from '../game/quests';
import type { GameState } from '../game/state';
import { $, el } from './dom';

/**
 * First-session guide. A pointing brush-hand and a soft spotlight lead the player
 * through the core loop. It never blocks input: every step completes from real
 * game state, so the player can wander off and the guide simply waits.
 */

export interface TutorialHooks {
  /** screen point of a city plot, its harvest bubble, or a world object (null if not visible) */
  plotPoint: (plotId: string) => { x: number; y: number } | null;
  bubblePoint: (plotId: string) => { x: number; y: number } | null;
  worldPoint: (objId: string) => { x: number; y: number } | null;
  view: () => 'city' | 'world';
  ringPlot: () => string | null;
  /** dismiss the building ring once its step is done, so it can't cover the next target */
  closeRing: () => void;
  popupObj: () => string | null;
  modalOpen: () => boolean;
  /** pan the camera so the step's subject is in view */
  focusPlot: (plotId: string) => void;
  focusWorld: (objId: string) => void;
}

interface Step {
  id: string;
  text: string;
  done: (s: GameState, h: TutorialHooks) => boolean;
  /** where to point right now: a DOM selector, or a screen point */
  target: (s: GameState, h: TutorialHooks) => string | { x: number; y: number } | null;
  /** bring the subject on screen when the step starts (or its view opens) */
  focus?: (s: GameState, h: TutorialHooks) => void;
}

function nearestBarbarian(s: GameState): string | null {
  const b = s.world
    .filter((o) => o.kind === 'barbarian' && o.level === 1 && (o.respawnAt === undefined || o.respawnAt <= s.time))
    .sort((a, c) => Math.hypot(a.x - 60, a.y - 60) - Math.hypot(c.x - 60, c.y - 60))[0];
  return b?.id ?? null;
}

const STEPS: Step[] = [
  {
    id: 'harvest',
    text: 'Your farm has filled its stores. <b>Tap the seal above it</b> to harvest the grain.',
    done: (s) => s.stats.collections > 0,
    target: (_s, h) => (h.view() !== 'city' ? '.toggle' : h.bubblePoint('farm_1') ?? h.plotPoint('farm_1')),
    focus: (_s, h) => h.view() === 'city' && h.focusPlot('farm_1'),
  },
  {
    id: 'cityhall',
    text: 'A greater hall means a greater kingdom. <b>Tap the Citadel</b>, then <b>Upgrade</b>.',
    done: (s) => s.buildings.city_hall.level >= 2 || s.jobs.some((j) => j.kind === 'build' && j.target === 'city_hall'),
    target: (_s, h) => {
      if (h.view() !== 'city') return '.toggle';
      if (h.modalOpen()) return '.modal [data-act=upgrade]';
      if (h.ringPlot() === 'city_hall') return '#ring [data-act=upgrade]';
      return h.plotPoint('city_hall');
    },
    focus: (_s, h) => h.view() === 'city' && h.focusPlot('city_hall'),
  },
  {
    id: 'train',
    text: 'Every lord needs soldiers. <b>Tap the Barracks</b> and <b>train</b> a company of militia.',
    done: (s) => s.stats.troopsTrained > 0 || s.jobs.some((j) => j.kind === 'train'),
    target: (_s, h) => {
      if (h.view() !== 'city') return '.toggle';
      if (h.modalOpen()) return document.querySelector('.modal [data-act=train]:not([data-type])') ? '.modal [data-act=train]:not([data-type])' : '.modal [data-act=train]';
      if (h.ringPlot() === 'barracks') return '#ring [data-act=train]';
      return h.bubblePoint('barracks') ?? h.plotPoint('barracks');
    },
    focus: (_s, h) => h.view() === 'city' && h.focusPlot('barracks'),
  },
  {
    id: 'world',
    text: 'Barbarians roam beyond your walls. <b>Open the realm map.</b>',
    done: (s, h) => h.view() === 'world' || s.stats.barbsKilled > 0 || s.marches.length > 0,
    target: () => '.toggle',
  },
  {
    id: 'attack',
    text: '<b>Tap the nearest barbarian camp</b> and send Boudica to clear it.',
    done: (s) => s.stats.barbsKilled > 0 || s.marches.some((m) => m.kind === 'attack'),
    target: (s, h) => {
      if (h.view() !== 'world') return '.toggle';
      if (h.modalOpen()) return '.modal [data-act=go]';
      if (h.popupObj() && h.popupObj() !== 'home') return '#world-popup [data-act=attack]';
      const id = nearestBarbarian(s);
      return id ? h.worldPoint(id) : null;
    },
    focus: (s, h) => {
      const id = nearestBarbarian(s);
      if (id && h.view() === 'world') h.focusWorld(id);
    },
  },
  {
    id: 'claim',
    text: 'Your first decrees are fulfilled. <b>Tap the decree</b> and claim your reward.',
    done: (s) => s.questsClaimed.length > 0,
    target: (s, h) => {
      if (h.modalOpen()) return '.modal [data-act=claim]';
      return activeQuests(s, 8).some((q) => questDone(s, q)) ? '.quest-slip' : null;
    },
  },
];

export class Tutorial {
  private root: HTMLElement;
  private hand: HTMLElement;
  private ring: HTMLElement;
  private card: HTMLElement;
  private shownStep = -1;
  private focusKey = '';
  private cardRect: DOMRect | null = null;

  constructor(private game: Game, private hooks: TutorialHooks) {
    this.root = el(`<div class="ftue hidden" aria-live="polite">
      <div class="ftue-ring"></div>
      <img class="ftue-hand" src="${assetUrl('ink/i_hand')}" alt="">
      <div class="ftue-card">
        <div class="ftue-portrait" style="background-image:url(${assetUrl(COMMANDER_BY_ID.joan.portrait)})"></div>
        <div class="ftue-body"><div class="kicker">Joan · step <span data-role="n"></span></div><div class="ftue-text" data-role="text"></div></div>
        <button class="ftue-skip" data-role="skip">Skip</button>
      </div>
    </div>`);
    $('#app').appendChild(this.root);
    this.hand = $('.ftue-hand', this.root);
    this.ring = $('.ftue-ring', this.root);
    this.card = $('.ftue-card', this.root);
    $('[data-role=skip]', this.root).addEventListener('click', () => {
      this.game.act((s) => void (s.ftueStep = STEPS.length));
      this.root.classList.add('hidden');
    });
  }

  get active(): boolean {
    const st = this.game.state;
    return st.tutorialDone && (st.ftueStep ?? 0) < STEPS.length;
  }

  /** Called every frame; cheap when inactive. */
  update(): void {
    const s = this.game.state;
    if (!this.active) {
      this.root.classList.add('hidden');
      return;
    }
    let step = s.ftueStep ?? 0;
    // advance past anything already achieved (players often run ahead)
    while (step < STEPS.length && STEPS[step].done(s, this.hooks)) step++;
    if (step !== (s.ftueStep ?? 0)) {
      s.ftueStep = step;
      this.hooks.closeRing();
      if (step > 0) sfx.coin();
      if (step >= STEPS.length) {
        this.root.classList.add('hidden');
        return;
      }
    }
    this.root.classList.remove('hidden');
    const cur = STEPS[step];
    if (this.shownStep !== step) {
      this.shownStep = step;
      ($('[data-role=text]', this.root) as HTMLElement).innerHTML = cur.text;
      ($('[data-role=n]', this.root) as HTMLElement).textContent = `${step + 1} of ${STEPS.length}`;
      this.card.classList.remove('pop');
      void this.card.offsetWidth;
      this.card.classList.add('pop');
    }
    const key = `${step}:${this.hooks.view()}`;
    if (key !== this.focusKey) {
      this.focusKey = key;
      // let the view transition settle before panning
      setTimeout(() => cur.focus?.(this.game.state, this.hooks), 250);
    }
    let t = cur.target(s, this.hooks);
    // a stray panel (opened by a mis-tap) covers the real target: guide the player out of it
    if (this.hooks.modalOpen()) {
      const inModal = typeof t === 'string' && t.startsWith('.modal ') && document.querySelector(t);
      if (!inModal) t = '.modal-close';
    }
    let pt: { x: number; y: number; r: number } | null = null;
    if (typeof t === 'string') {
      const e = document.querySelector(t);
      if (e) {
        let r = e.getBoundingClientRect();
        // targets inside a scrolling panel may sit below the fold on small screens
        if (r.width > 0 && (r.bottom > window.innerHeight - 8 || r.top < 8)) {
          e.scrollIntoView({ block: 'center' });
          r = e.getBoundingClientRect();
        }
        if (r.width > 0) pt = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2 + 10 };
      }
    } else if (t) pt = { x: t.x, y: t.y, r: 46 };
    const onScreen = pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) && pt.x > 8 && pt.y > 8 && pt.x < window.innerWidth - 8 && pt.y < window.innerHeight - 8;
    this.hand.style.opacity = onScreen ? '1' : '0';
    this.ring.style.opacity = onScreen ? '1' : '0';
    // keep the guide card off the thing it is pointing at (the decree slip on phones sits under it)
    const atTop = this.root.classList.contains('card-top');
    if (!atTop) this.cardRect = this.card.getBoundingClientRect();
    const c = this.cardRect;
    const covers = !!(onScreen && pt && c && pt.x + pt.r > c.left && pt.x - pt.r < c.right && pt.y + pt.r > c.top && pt.y - pt.r < c.bottom);
    if (covers !== atTop) this.root.classList.toggle('card-top', covers);
    if (onScreen && pt) {
      this.hand.style.transform = `translate(${pt.x + 4}px, ${pt.y + 6}px)`;
      const d = pt.r * 2;
      this.ring.style.width = this.ring.style.height = `${d}px`;
      this.ring.style.transform = `translate(${pt.x - pt.r}px, ${pt.y - pt.r}px)`;
    }
  }
}
