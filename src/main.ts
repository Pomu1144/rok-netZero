import './style.css';
import { assetUrl, loadAssets } from './assets';
import { setMuted, sfx } from './audio';
import { BUILDINGS } from './data/buildings';
import { COMMANDER_BY_ID } from './data/commanders';
import { PLOT_BY_ID } from './data/layout';
import { TROOP_SPRITES } from './data/troops';
import { Game } from './game/game';
import {
  BARB_AP_COST,
  FORT_AP_COST,
  cityHallLevel,
  collect,
  findObj,
  isHidden,
  marchPosition,
  maxBarbLevel,
  objLabel,
  objSprite,
  plotUnlockLevel,
  recallMarch,
  storedAmount,
  type GameEvent,
  type Result,
} from './game/logic';
import { activeQuests, questDone } from './game/quests';
import { PLAYER_POS, sumTroops } from './game/state';
import { CityView } from './render/cityView';
import { T, WorldView } from './render/worldView';
import type { UiCtx } from './ui/ctx';
import { $, anyModalOpen, closeAllModals, el, onAct, refreshLiveModals, setClock, toast, updateTimers } from './ui/dom';
import { esc, fmt, fmtFull } from './ui/format';
import { Hud } from './ui/hud';
import { openCommander, openCommanders, openMarch, openTavern } from './ui/panels/army';
import { openBuilding, openHospital, openResearch, openSpeedup, openTrain } from './ui/panels/city';
import { openAdvisor, openBag, openMail, openProfile, openQuests, questGo } from './ui/panels/misc';

const game = new Game();
setMuted(game.state.muted);
setClock(() => game.state.time);

const cityCanvas = $('#city-canvas') as HTMLCanvasElement;
const worldCanvas = $('#world-canvas') as HTMLCanvasElement;
const ring = $('#ring');
const popup = $('#world-popup');

const city = new CityView(cityCanvas, game);
const world = new WorldView(worldCanvas, game);
let view: 'city' | 'world' = 'city';
let ringPlot: string | null = null;
let popupObj: string | null = null;

function switchView(to: 'city' | 'world', after?: () => void): void {
  if (view === to) {
    after?.();
    return;
  }
  const tr = $('#transition');
  tr.classList.add('on');
  sfx.open();
  setTimeout(() => {
    view = to;
    cityCanvas.classList.toggle('hidden', to !== 'city');
    worldCanvas.classList.toggle('hidden', to !== 'world');
    hud.view = to;
    closeRing();
    closePopup();
    after?.();
    tr.classList.remove('on');
  }, 220);
}

const ctx: UiCtx = {
  game,
  goWorld: (x, y) =>
    switchView('world', () => {
      if (x !== undefined && y !== undefined) world.goTo(x, y);
    }),
  goCity: (plotId) =>
    switchView('city', () => {
      if (plotId) {
        city.focusPlot(plotId);
        setTimeout(() => selectPlot(plotId), 350);
      }
    }),
  run: (fn, okSound) => {
    const r = game.act(fn) as Result;
    if (!r.ok) {
      sfx.error();
      toast(r.reason, 'bad');
      return false;
    }
    okSound?.();
    return true;
  },
  openMarch: (id, kind) => openMarch(ctx, id, kind),
  openReport: (id) => openMail(ctx, id),
  openPlot: (id) => openBuilding(ctx, id),
};

// ---------------------------------------------------------------------------
// city ring menu

interface RingBtn {
  act: string;
  label: string;
  img?: string;
  emoji?: string;
  primary?: boolean;
}

function ringButtons(plotId: string): RingBtn[] {
  const s = game.state;
  const b = s.buildings[plotId];
  const def = BUILDINGS[b.type];
  const upgrading = s.jobs.find((j) => j.kind === 'build' && j.target === plotId);
  if (b.level <= 0 && !upgrading) {
    if (cityHallLevel(s) < plotUnlockLevel(plotId)) return [{ act: 'info', label: 'Locked', emoji: '🔒' }];
    return [{ act: 'upgrade', label: 'Build', img: 'ic_build', primary: true }];
  }
  const btns: RingBtn[] = [{ act: 'info', label: 'Details', emoji: 'ℹ️' }];
  if (upgrading) btns.push({ act: 'speed', label: 'Speed Up', img: 'ic_speedup', primary: true });
  else btns.push({ act: 'upgrade', label: 'Upgrade', img: 'ic_build', primary: true });
  if (def.trains) btns.push({ act: 'train', label: 'Train', img: TROOP_SPRITES[def.trains] });
  if (def.producer) btns.push({ act: 'collect', label: 'Collect', img: `ic_${def.producer}` });
  if (b.type === 'academy') btns.push({ act: 'research', label: 'Research', img: 'nav_research' });
  if (b.type === 'hospital') btns.push({ act: 'heal', label: 'Heal', emoji: '⚕️' });
  if (b.type === 'tavern') btns.push({ act: 'tavern', label: 'Chests', img: 'ic_chest' });
  if (b.type === 'city_hall') btns.push({ act: 'commanders', label: 'Heroes', img: 'nav_commanders' });
  if (b.type === 'scout_camp' || b.type === 'wall') btns.push({ act: 'world', label: 'World', img: 'nav_map' });
  return btns;
}

function selectPlot(plotId: string | null): void {
  ringPlot = plotId;
  city.selectedPlot = plotId;
  if (!plotId) return closeRing();
  sfx.click();
  const btns = ringButtons(plotId);
  const b = game.state.buildings[plotId];
  const def = BUILDINGS[b.type];
  const n = btns.length;
  const radius = 110;
  ring.innerHTML = `<div class="ring-title" style="top:-150px">${esc(def.name)}${b.level > 0 ? ` · Lv.${b.level}` : ''}</div>${btns
    .map((btn, i) => {
      const a = Math.PI / 2 + ((i - (n - 1) / 2) * Math.PI) / 5.2;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius * 0.75;
      return `<button class="ring-btn ${btn.primary ? 'primary' : ''}" data-act="${btn.act}" style="left:${x}px;top:${y}px;animation-delay:${i * 0.03}s">${
        btn.img ? `<img src="${assetUrl(btn.img)}" alt="">` : `<span class="emoji">${btn.emoji}</span>`
      }<span>${btn.label}</span></button>`;
    })
    .join('')}`;
  ring.classList.remove('hidden');
  positionRing();
}

onAct(ring, {
  info: () => ringPlot && openBuilding(ctx, ringPlot),
  upgrade: () => ringPlot && openBuilding(ctx, ringPlot),
  speed: () => {
    const job = game.state.jobs.find((j) => j.kind === 'build' && j.target === ringPlot);
    if (job) openSpeedup(ctx, job.id);
  },
  train: () => ringPlot && openTrain(ctx, BUILDINGS[game.state.buildings[ringPlot].type].trains!),
  collect: () => ringPlot && collectPlot(ringPlot),
  research: () => openResearch(ctx),
  heal: () => openHospital(ctx),
  tavern: () => openTavern(ctx),
  commanders: () => openCommanders(ctx),
  world: () => ctx.goWorld(),
});

function closeRing(): void {
  ringPlot = null;
  city.selectedPlot = null;
  ring.classList.add('hidden');
}

function positionRing(): void {
  if (!ringPlot) return;
  const p = city.plotScreen(ringPlot);
  ring.style.left = `${p.x}px`;
  ring.style.top = `${p.y}px`;
  const title = ring.querySelector('.ring-title') as HTMLElement | null;
  if (title) title.style.top = `${Math.max(-180, p.top - p.y + 10)}px`;
}

function collectPlot(plotId: string): void {
  const s = game.state;
  const res = BUILDINGS[s.buildings[plotId].type].producer;
  if (!res) return;
  const amt = storedAmount(s, plotId);
  if (amt <= 0) {
    toast('Nothing to collect yet', 'info');
    return;
  }
  game.act((st) => void collect(st, plotId));
  const r = city.plotRect(PLOT_BY_ID[plotId]);
  city.fx.float(r.cx, r.y + r.h * 0.2, `+${fmt(amt)}`, `ic_${res}`);
  city.fx.burst(r.cx, r.y + r.h * 0.25, '#ffe08a', 18);
  sfx.coin();
  hud.flashRes(res);
}

city.onSelectPlot = (id) => {
  if (id) selectPlot(id);
  else closeRing();
};
city.onBubble = (plotId) => {
  const def = BUILDINGS[game.state.buildings[plotId].type];
  if (def.producer) collectPlot(plotId);
  else if (def.trains) openTrain(ctx, def.trains);
};

// ---------------------------------------------------------------------------
// world popup

function closePopup(): void {
  popupObj = null;
  world.selectedId = null;
  popup.classList.add('hidden');
}

function showPopup(id: string | null): void {
  popupObj = id;
  if (!id) return closePopup();
  sfx.click();
  renderPopup();
  popup.classList.remove('hidden');
  positionPopup();
}

function renderPopup(): void {
  const s = game.state;
  const id = popupObj;
  if (!id) return;
  let html = '';
  if (id === 'home') {
    html = `<div class="wp-head"><img src="${assetUrl('city_player')}"><div><div class="wp-title">${esc(s.governor)}'s City</div><div class="wp-sub">(${PLAYER_POS.x}, ${PLAYER_POS.y}) · City Hall Lv.${cityHallLevel(s)}</div></div></div>
      <div class="wp-body">Garrison: <b>${fmtFull(sumTroops(s.troops))}</b> troops</div>
      <div class="wp-actions"><button class="btn btn-gold" data-act="enter">Enter City</button></div>`;
  } else if (id.startsWith('march:')) {
    const m = s.marches.find((x) => `march:${x.id}` === id);
    if (!m) return closePopup();
    const t = findObj(s, m.targetId);
    const portrait = m.commanderId ? COMMANDER_BY_ID[m.commanderId].portrait : 'scout_camp';
    const status = m.phase === 'gathering' ? 'Gathering' : m.phase === 'returning' ? 'Returning home' : m.kind === 'scout' ? 'Scouting' : 'Marching';
    html = `<div class="wp-head"><img src="${assetUrl(portrait)}" style="border-radius:50%;object-fit:cover"><div><div class="wp-title">${m.commanderId ? COMMANDER_BY_ID[m.commanderId].name : 'Scouts'}</div><div class="wp-sub">${status}${t ? ` · ${esc(objLabel(t))}` : ''}</div></div></div>
      <div class="wp-body">Troops: <b>${fmtFull(sumTroops(m.troops))}</b><br>${m.phase === 'gathering' ? 'Done in' : 'Arrives in'} <b data-end="${m.phase === 'gathering' ? m.gatherEnd : m.arriveAt}"></b></div>
      <div class="wp-actions">${m.phase !== 'returning' ? `<button class="btn btn-red" data-act="recall" data-id="${m.id}">Recall</button>` : ''}</div>`;
  } else {
    const o = findObj(s, id);
    if (!o || isHidden(s, o)) return closePopup();
    const ap = o.kind === 'barbarian' ? BARB_AP_COST : o.kind === 'fort' ? FORT_AP_COST : 0;
    let body = '';
    let actions = '';
    if (o.kind === 'barbarian') {
      const locked = o.level > maxBarbLevel(s);
      body = `Troops: <b>${fmtFull(sumTroops(o.troops ?? {}))}</b><br>Rewards: resources, commander XP, items & sculptures.${locked ? `<br><span class="req">Defeat a Lv.${o.level - 1} barbarian first.</span>` : ''}`;
      actions = `<button class="btn btn-red" data-act="attack" ${locked ? 'disabled' : ''}>⚔ Attack <small>${ap} AP</small></button>`;
    } else if (o.kind === 'fort') {
      body = `A heavily defended barbarian stronghold.<br>Troops: <b>${fmtFull(sumTroops(o.troops ?? {}))}</b><br>Rewards: keys, many sculptures and tomes.`;
      actions = `<button class="btn btn-red" data-act="attack">⚔ Attack <small>${ap} AP</small></button>`;
    } else if (o.kind === 'node') {
      body = `Remaining: <b>${fmtFull(o.amount ?? 0)}</b> ${o.res}${o.occupiedBy ? '<br><span class="req ok">Your troops are gathering here.</span>' : ''}`;
      actions = o.occupiedBy ? '' : `<button class="btn btn-green" data-act="gather">Gather</button>`;
    } else if (o.kind === 'city') {
      const recovering = o.respawnAt && o.respawnAt > s.time;
      body = `Rival governor. ${o.scoutedAt ? `Garrison: <b>${fmtFull(sumTroops(o.troops ?? {}))}</b><br>Stash: ${fmt(Object.values(o.loot ?? {}).reduce((a, b) => a + (b ?? 0), 0))} resources` : 'Scout to reveal garrison & resources.'}${recovering ? '<br><span class="muted">Recovering from your last attack.</span>' : ''}`;
      actions = `<button class="btn btn-dark" data-act="scout">Scout</button><button class="btn btn-red" data-act="attack">⚔ Attack</button>`;
    } else if (o.kind === 'holy') {
      const held = o.heldUntil && o.heldUntil > s.time;
      body = `Buff when held: <b>${esc(o.buff?.label ?? '')}</b> for 30 min.<br>${held ? `<span class="req ok">Held by you · <span data-end="${o.heldUntil}"></span></span>` : `Guardians: <b>${fmtFull(sumTroops(o.troops ?? {}))}</b>`}`;
      actions = held ? '' : `<button class="btn btn-dark" data-act="scout">Scout</button><button class="btn btn-red" data-act="attack">⚔ Capture</button>`;
    }
    html = `<div class="wp-head"><img src="${assetUrl(objSprite(o))}"><div><div class="wp-title">${esc(objLabel(o))}</div><div class="wp-sub">(${o.x}, ${o.y})</div></div></div>
      <div class="wp-body">${body}</div><div class="wp-actions">${actions}</div>`;
  }
  popup.innerHTML = html;
  updateTimers();
}

onAct(popup, {
  enter: () => ctx.goCity(),
  attack: () => popupObj && openMarch(ctx, popupObj, 'attack'),
  gather: () => popupObj && openMarch(ctx, popupObj, 'gather'),
  scout: () => {
    if (popupObj) openMarch(ctx, popupObj, 'scout');
    renderPopup();
  },
  recall: (t) => {
    ctx.run((s) => recallMarch(s, t.dataset.id!), sfx.click);
    renderPopup();
  },
});

function positionPopup(): void {
  if (!popupObj) return;
  const p = world.screenOf(popupObj);
  if (!p) return closePopup();
  popup.style.left = `${Math.max(150, Math.min(window.innerWidth - 150, p.x))}px`;
  popup.style.top = `${Math.max(popup.offsetHeight + 20, p.y)}px`;
}

world.onSelect = (id) => showPopup(id);

// ---------------------------------------------------------------------------
// HUD

const hud = new Hud(ctx, {
  toggleView: () => (view === 'city' ? ctx.goWorld() : ctx.goCity()),
  openNav: (id) => {
    sfx.click();
    if (id === 'commanders') openCommanders(ctx);
    if (id === 'research') {
      if (game.state.buildings.academy.level <= 0) {
        toast('Build the Academy first', 'bad');
        ctx.goCity('academy');
      } else openResearch(ctx);
    }
    if (id === 'bag') openBag(ctx);
    if (id === 'quests') openQuests(ctx);
    if (id === 'mail') openMail(ctx);
  },
  openJob: (jobId) => openSpeedup(ctx, jobId),
  openMarchInfo: (marchId) => {
    const m = game.state.marches.find((x) => x.id === marchId);
    if (!m) return;
    ctx.goWorld();
    setTimeout(() => {
      const p = marchPosition(game.state, m);
      world.goTo(p.x, p.y);
      showPopup(`march:${m.id}`);
    }, 300);
  },
  idleBuilder: () => {
    const id = Hud.suggestUpgrade(ctx);
    ctx.goCity(id);
  },
  questClick: () => {
    const q = activeQuests(game.state, 8).find((x) => questDone(game.state, x)) ?? activeQuests(game.state, 1)[0];
    if (!q) return;
    if (questDone(game.state, q)) openQuests(ctx);
    else if (q.hint) questGo(ctx, q.hint);
    else openQuests(ctx);
  },
  raidClick: () => openHospital(ctx),
  profile: () => openProfile(ctx),
  home: () => world.goHome(),
});

// ---------------------------------------------------------------------------
// game events -> feedback

function onGameEvent(e: GameEvent): void {
  const openReport = e.reportId ? () => openMail(ctx, e.reportId) : undefined;
  switch (e.kind) {
    case 'build': {
      sfx.fanfare();
      toast(e.text, 'good', 'ic_build');
      if (e.plotId) {
        const r = city.plotRect(PLOT_BY_ID[e.plotId]);
        city.fx.burst(r.cx, r.y + r.h * 0.4, '#ffd36a', 60, 1.6);
        city.fx.float(r.cx, r.y + r.h * 0.2, 'Level Up!', 'ic_build', '#fff1b8');
      }
      break;
    }
    case 'research':
      sfx.fanfare();
      toast(e.text, 'good', 'nav_research');
      break;
    case 'train':
    case 'heal':
      sfx.coin();
      toast(e.text, 'good', 'unit_infantry');
      break;
    case 'battle':
      sfx.battle();
      toast(e.text, e.good ? 'good' : 'bad', 'ic_power', openReport);
      break;
    case 'gather':
      sfx.coin();
      toast(e.text, 'good', 'ic_chest', openReport);
      break;
    case 'raid_warning':
      sfx.horn();
      toast(e.text, 'bad', 'unit_barbarian');
      break;
    case 'raid':
      sfx.battle();
      toast(e.text, e.good ? 'good' : 'bad', 'watchtower', openReport);
      break;
    default:
      toast(e.text, e.good === false ? 'bad' : 'info', undefined, openReport);
  }
}

game.onEvent(onGameEvent);
game.onEvent(() => {
  refreshLiveModals();
  if (popupObj) renderPopup();
});
game.onChange(() => {
  refreshLiveModals();
  if (popupObj) renderPopup();
  if (ringPlot) selectPlot(ringPlot);
});

// ---------------------------------------------------------------------------
// loop

let last = performance.now();
let uiTimer = 0;
function frame(now: number): void {
  const dt = Math.min(100, now - last);
  last = now;
  game.update();
  if (view === 'city') {
    city.render(dt);
    positionRing();
  } else {
    world.render(dt);
    positionPopup();
  }
  uiTimer += dt;
  if (uiTimer > 200) {
    uiTimer = 0;
    const c = world.camera;
    hud.update({ x: Math.floor(c.x / T), y: Math.floor(c.y / T) });
    updateTimers();
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// boot

async function boot(): Promise<void> {
  const title = $('#title-screen');
  ($('.title-bg', title) as HTMLElement).style.backgroundImage = `url(${assetUrl('bg_title')})`;
  const fill = $('.loader-fill', title);
  await loadAssets((p) => (fill.style.width = `${Math.round(p * 100)}%`));
  $('.loader-text', title).textContent = game.state.tutorialDone ? 'Welcome back, Governor' : 'Your realm awaits';
  const start = $('.start-btn', title);
  start.classList.remove('hidden');
  hud.update();
  requestAnimationFrame(frame);
  start.addEventListener(
    'click',
    () => {
      sfx.fanfare();
      title.classList.add('fade');
      setTimeout(() => title.remove(), 900);
      const offline = game.catchUp();
      if (offline.length) {
        toast(`While you were away: ${offline.length} events`, 'info');
        refreshLiveModals();
      }
      if (!game.state.tutorialDone) {
        setTimeout(
          () =>
            openAdvisor(ctx, () => {
              game.act((s) => void (s.tutorialDone = true));
            }),
          700,
        );
      }
    },
    { once: true },
  );
}

window.addEventListener('beforeunload', () => game.save());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.save();
});
window.addEventListener('keydown', (e) => {
  if (anyModalOpen()) return;
  if (e.key === 'm' || e.key === 'M') view === 'city' ? ctx.goWorld() : ctx.goCity();
});

void boot();

// expose a few hooks for debugging / automated checks
Object.assign(window, { __game: game, __ctx: ctx, __closeAll: closeAllModals, __openCommander: (id: string) => openCommander(ctx, id), __el: el });
