import './style.css';
import { assetUrl, loadAssets } from './assets';
import { playMusic, setMuted, setMusic, sfx, unlockAudio } from './audio';
import { BUILDINGS, TIER_LEVELS, spriteFor } from './data/buildings';
import { COMMANDER_BY_ID } from './data/commanders';
import { PLOT_BY_ID } from './data/layout';
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
  sendMarch,
  storedAmount,
  type GameEvent,
  type Result,
} from './game/logic';
import { activeQuests, questDone } from './game/quests';
import { PLAYER_POS, sumTroops } from './game/state';
import { CityView } from './render/cityView';
import { T, WorldView } from './render/worldView';
import type { UiCtx } from './ui/ctx';
import { $, anyModalOpen, closeAllModals, closeTopModal, flyTo, onAct, refreshLiveModals, setClock, toast, updateTimers } from './ui/dom';
import { esc, fmt, fmtFull } from './ui/format';
import { Hud } from './ui/hud';
import { Tutorial } from './ui/tutorial';
import { clearReminders, haptic, initStorage, nativeReady, onAppState, registerServiceWorker, scheduleReminders, setHaptics, type Reminder } from './native';
import { BUILDING_KANJI, ink, type InkIcon } from './ui/ink';
import { openCommander, openCommanders, openMarch, openTavern } from './ui/panels/army';
import { openBuilding, openHospital, openResearch, openSpeedup, openTrain } from './ui/panels/city';
import { openCalendar, openDaily } from './ui/panels/daily';
import { openAway, openHonours } from './ui/panels/honours';
import { awaySnapshot, awaySummary, awayWorthShowing, type AwaySummary } from './game/away';
import { dayKey, loginClaimable, rollDaily } from './game/daily';
import { openAdvisor, openBag, openMail, openProfile, openQuests, openSettings, questGo } from './ui/panels/misc';

registerServiceWorker();
await initStorage();
const game = new Game();
setMuted(game.state.muted);
setMusic(!game.state.musicOff);
setHaptics(!game.state.hapticsOff);
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
let switching = false;

/** Ink blooms across the screen, the view changes underneath, then the ink dissolves. */
function switchView(to: 'city' | 'world', after?: () => void): void {
  if (view === to) {
    after?.();
    return;
  }
  if (switching) return;
  switching = true;
  const tr = $('#transition');
  tr.classList.remove('out');
  void tr.offsetWidth;
  tr.classList.add('in');
  sfx.brush();
  void playMusic(to === 'city' ? 'music_city' : 'music_world');
  setTimeout(() => {
    view = to;
    cityCanvas.classList.toggle('hidden', to !== 'city');
    worldCanvas.classList.toggle('hidden', to !== 'world');
    hud.view = to;
    hud.update();
    closeRing();
    closePopup();
    after?.();
    tr.classList.remove('in');
    tr.classList.add('out');
    setTimeout(() => {
      tr.classList.remove('out');
      switching = false;
    }, 560);
  }, 430);
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
        setTimeout(() => selectPlot(plotId), 380);
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
    haptic('tap');
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
  icon: InkIcon;
  primary?: boolean;
}

function ringButtons(plotId: string): RingBtn[] {
  const s = game.state;
  const b = s.buildings[plotId];
  const def = BUILDINGS[b.type];
  const upgrading = s.jobs.find((j) => j.kind === 'build' && j.target === plotId);
  if (b.level <= 0 && !upgrading) {
    if (cityHallLevel(s) < plotUnlockLevel(plotId)) return [{ act: 'info', label: 'Sealed', icon: 'i_lock' }];
    return [{ act: 'upgrade', label: 'Build', icon: 'i_hammer', primary: true }];
  }
  const btns: RingBtn[] = [{ act: 'info', label: 'Details', icon: 'i_info' }];
  if (upgrading) btns.push({ act: 'speed', label: 'Hasten', icon: 'i_hourglass', primary: true });
  else btns.push({ act: 'upgrade', label: 'Upgrade', icon: 'i_hammer', primary: true });
  if (def.trains) btns.push({ act: 'train', label: 'Train', icon: 'i_spear' });
  if (def.producer) btns.push({ act: 'collect', label: 'Harvest', icon: 'i_gather' });
  if (b.type === 'academy') btns.push({ act: 'research', label: 'Study', icon: 'i_research' });
  if (b.type === 'hospital') btns.push({ act: 'heal', label: 'Heal', icon: 'i_heal' });
  if (b.type === 'tavern') btns.push({ act: 'tavern', label: 'Chests', icon: 'i_chest' });
  if (b.type === 'city_hall') btns.push({ act: 'commanders', label: 'Generals', icon: 'i_helmet' });
  if (b.type === 'scout_camp' || b.type === 'wall') btns.push({ act: 'world', label: 'Realm', icon: 'i_map' });
  return btns;
}

function selectPlot(plotId: string | null): void {
  ringPlot = plotId;
  city.selectedPlot = plotId;
  if (!plotId) return closeRing();
  const btns = ringButtons(plotId);
  const b = game.state.buildings[plotId];
  const def = BUILDINGS[b.type];
  const n = btns.length;
  const radius = 116;
  ring.innerHTML = `<div class="ring-title"><span class="seal">${b.level > 0 ? b.level : BUILDING_KANJI[b.type]}</span><b>${esc(def.name)}</b></div>${btns
    .map((btn, i) => {
      const a = Math.PI / 2 + ((i - (n - 1) / 2) * Math.PI) / 5;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius * 0.72;
      return `<button class="ring-btn ${btn.primary ? 'primary' : ''}" data-act="${btn.act}" style="left:${x}px;top:${y}px;animation-delay:${i * 0.04}s">
        <span class="disc"></span><img class="enso" src="${assetUrl(btn.primary ? 'ink/ink_enso_c' : 'ink/ink_enso_gold')}" alt="" style="transform:rotate(${i * 67}deg)">
        ${ink(btn.icon, 28)}<span>${btn.label}</span></button>`;
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
  if (title) title.style.top = `${Math.max(-190, p.top - p.y + 4)}px`;
}

function collectPlot(plotId: string): void {
  const s = game.state;
  const res = BUILDINGS[s.buildings[plotId].type].producer;
  if (!res) return;
  const amt = storedAmount(s, plotId);
  if (amt <= 0) {
    toast('The stores are still filling', 'info');
    return;
  }
  game.act((st) => void collect(st, plotId));
  const r = city.plotRect(PLOT_BY_ID[plotId]);
  city.fx.float(r.cx, r.y + r.h * 0.2, `+${fmt(amt)}`, `ic_${res}`);
  city.fx.leaves(r.cx, r.y + r.h * 0.25, 14);
  const sp = city.camera.toScreen(r.cx, r.y + r.h * 0.2);
  sfx.coin();
  flyTo(`ic_${res}`, sp.x, sp.y, hud.resEl(res), 7, () => {
    hud.flashRes(res);
    sfx.coin();
  });
}

city.onSelectPlot = (id) => {
  if (id) {
    sfx.click();
    selectPlot(id);
  } else closeRing();
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
    html = `<div class="wp-head"><img src="${assetUrl('city_player')}" alt=""><div><div class="wp-title">${esc(s.governor)}'s City</div><div class="wp-sub kicker">${PLAYER_POS.x}, ${PLAYER_POS.y} · City Hall ${cityHallLevel(s)}</div></div></div>
      <div class="wp-body">Garrison of <b>${fmtFull(sumTroops(s.troops))}</b> soldiers stands ready.</div>
      <div class="wp-actions"><button class="btn btn-gold" data-act="enter">${ink('i_castle', 18)} Enter the city</button></div>`;
  } else if (id.startsWith('march:')) {
    const m = s.marches.find((x) => `march:${x.id}` === id);
    if (!m) return closePopup();
    const t = findObj(s, m.targetId);
    const status = m.phase === 'gathering' ? 'Gathering' : m.phase === 'returning' ? 'Returning home' : m.kind === 'scout' ? 'Scouting' : 'On the march';
    const pic = m.commanderId ? `<img class="portrait" src="${assetUrl(COMMANDER_BY_ID[m.commanderId].portrait)}" alt="">` : `<img src="${assetUrl('ink/i_eye')}" alt="">`;
    html = `<div class="wp-head">${pic}<div><div class="wp-title">${m.commanderId ? COMMANDER_BY_ID[m.commanderId].name : 'Scouts'}</div><div class="wp-sub kicker">${status}</div></div></div>
      <div class="wp-body">${t ? `${esc(objLabel(t))}<br>` : ''}Troops <b>${fmtFull(sumTroops(m.troops))}</b> · ${m.phase === 'gathering' ? 'done in' : 'arrives in'} <b data-end="${m.phase === 'gathering' ? m.gatherEnd : m.arriveAt}"></b></div>
      <div class="wp-actions">${m.phase !== 'returning' ? `<button class="btn" data-act="recall" data-id="${m.id}">${ink('i_recall', 16)} Recall</button>` : ''}</div>`;
  } else {
    const o = findObj(s, id);
    if (!o || isHidden(s, o)) return closePopup();
    const ap = o.kind === 'barbarian' ? BARB_AP_COST : o.kind === 'fort' ? FORT_AP_COST : 0;
    let body = '';
    let actions = '';
    if (o.kind === 'barbarian') {
      const locked = o.level > maxBarbLevel(s);
      body = `Warriors <b>${fmtFull(sumTroops(o.troops ?? {}))}</b><br>Yields resources, experience, tomes and sculptures.${locked ? `<br><span style="color:var(--red-2)">Defeat a Lv.${o.level - 1} band first.</span>` : ''}`;
      actions = `<button class="btn btn-red" data-act="attack" ${locked ? 'disabled' : ''}>${ink('i_swords', 16)} Attack · ${ap} AP</button>`;
    } else if (o.kind === 'fort') {
      body = `A barbarian stronghold.<br>Warriors <b>${fmtFull(sumTroops(o.troops ?? {}))}</b><br>Yields keys, sculptures and tomes.`;
      actions = `<button class="btn btn-red" data-act="attack">${ink('i_swords', 16)} Assault · ${ap} AP</button>`;
    } else if (o.kind === 'node') {
      body = `Remaining <b>${fmtFull(o.amount ?? 0)}</b> ${o.res}${o.occupiedBy ? '<br>Your people are gathering here.' : ''}`;
      actions = o.occupiedBy ? '' : `<button class="btn btn-gold" data-act="gather">${ink('i_gather', 16)} Gather</button>`;
    } else if (o.kind === 'city') {
      const recovering = o.respawnAt && o.respawnAt > s.time;
      body = `A rival governor. ${o.scoutedAt ? `Garrison <b>${fmtFull(sumTroops(o.troops ?? {}))}</b><br>Stores <b>${fmt(Object.values(o.loot ?? {}).reduce((a, b) => a + (b ?? 0), 0))}</b>` : 'Scout to learn the garrison and stores.'}${recovering ? '<br>Still recovering from your last assault.' : ''}`;
      actions = `<button class="btn" data-act="scout">${ink('i_eye', 16)} Scout</button><button class="btn btn-red" data-act="attack">${ink('i_swords', 16)} Attack</button>`;
    } else if (o.kind === 'holy') {
      const held = o.heldUntil && o.heldUntil > s.time;
      body = `While held: <b style="font-family:var(--serif)">${esc(o.buff?.label ?? '')}</b> for thirty minutes.<br>${held ? `Held by you · <b data-end="${o.heldUntil}"></b>` : `Guardians <b>${fmtFull(sumTroops(o.troops ?? {}))}</b>`}`;
      actions = held ? '' : `<button class="btn" data-act="scout">${ink('i_eye', 16)} Scout</button><button class="btn btn-red" data-act="attack">${ink('i_banner', 16)} Capture</button>`;
    }
    html = `<div class="wp-head"><img src="${assetUrl(objSprite(o))}" alt=""><div><div class="wp-title">${esc(objLabel(o))}</div><div class="wp-sub kicker">${o.x}, ${o.y}</div></div></div>
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
  popup.style.left = `${Math.max(160, Math.min(window.innerWidth - 160, p.x))}px`;
  popup.style.top = `${Math.max(popup.offsetHeight + 24, p.y)}px`;
}

world.onSelect = (id) => showPopup(id);

// ---------------------------------------------------------------------------
// HUD

const hud = new Hud(ctx, {
  toggleView: () => (view === 'city' ? ctx.goWorld() : ctx.goCity()),
  openNav: (id) => {
    sfx.click();
    if (id === 'city') ctx.goCity();
    if (id === 'world') ctx.goWorld();
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
    if (id === 'settings') openSettings(ctx);
    if (id === 'calendar') openCalendar(ctx);
    if (id === 'daily') openDaily(ctx);
    if (id === 'honours') openHonours(ctx);
  },
  openJob: (jobId) => openSpeedup(ctx, jobId),
  openMarchInfo: (marchId) => {
    const m = game.state.marches.find((x) => x.id === marchId);
    if (!m) return;
    const go = () => {
      const p = marchPosition(game.state, m);
      world.goTo(p.x, p.y);
      showPopup(`march:${m.id}`);
    };
    if (view === 'world') go();
    else {
      ctx.goWorld();
      setTimeout(go, 480);
    }
  },
  idleBuilder: () => ctx.goCity(Hud.suggestUpgrade(ctx)),
  questClick: () => {
    const s = game.state;
    const q = activeQuests(s, 8).find((x) => questDone(s, x)) ?? activeQuests(s, 1)[0];
    if (!q) return;
    if (questDone(s, q)) openQuests(ctx);
    else if (q.hint) questGo(ctx, q.hint);
    else openQuests(ctx);
  },
  raidClick: () => openHospital(ctx),
  profile: () => openProfile(ctx),
  home: () => world.goHome(),
});

const tutorial = new Tutorial(game, {
  plotPoint: (id) => {
    const p = city.plotScreen(id);
    return { x: p.x, y: p.y };
  },
  bubblePoint: (id) => city.bubbleScreen(id),
  worldPoint: (id) => world.screenOf(id),
  view: () => view,
  ringPlot: () => ringPlot,
  closeRing: () => closeRing(),
  popupObj: () => popupObj,
  modalOpen: () => anyModalOpen(),
  focusPlot: (id) => city.focusPlot(id),
  focusWorld: (id) => {
    const o = game.state.world.find((x) => x.id === id);
    if (o) world.goTo(o.x, o.y - 1);
  },
});

// ---------------------------------------------------------------------------
// game events -> feedback

function onGameEvent(e: GameEvent): void {
  const openReport = e.reportId ? () => openMail(ctx, e.reportId) : undefined;
  switch (e.kind) {
    case 'build':
      haptic('success');
      sfx.fanfare();
      toast(e.text, 'good', 'ink/i_hammer');
      if (e.plotId && (TIER_LEVELS as readonly number[]).includes(game.state.buildings[e.plotId].level)) {
        // crossing a tier repaints the building: make a moment of it
        const b = game.state.buildings[e.plotId];
        setTimeout(() => {
          sfx.horn();
          toast(`${BUILDINGS[b.type].name} rises anew · Lv.${b.level}`, 'good', spriteFor(b.type, b.level));
        }, 700);
        city.focusPlot(e.plotId);
      }
      if (e.plotId) {
        city.levelUp(e.plotId);
        setTimeout(() => sfx.stamp(), 230);
      }
      break;
    case 'research':
      sfx.fanfare();
      toast(e.text, 'good', 'ink/i_research');
      break;
    case 'train':
    case 'heal':
      sfx.coin();
      toast(e.text, 'good', 'ink/i_spear');
      break;
    case 'battle':
      haptic('heavy');
      if (e.good) sfx.victory();
      else sfx.defeat();
      setTimeout(() => sfx.stamp(), 520);
      if (e.x !== undefined && e.y !== undefined) world.battleFx(e.x, e.y, !!e.good);
      toast(e.text, e.good ? 'good' : 'bad', 'ink/i_swords', openReport);
      break;
    case 'gather':
      sfx.coin();
      toast(e.text, 'good', 'ink/i_gather', openReport);
      break;
    case 'raid_warning':
      haptic('warning');
      sfx.horn();
      toast(e.text, 'bad', 'unit_barbarian');
      break;
    case 'raid':
      sfx.battle();
      setTimeout(() => (e.good ? sfx.victory() : sfx.defeat()), 900);
      world.battleFx(PLAYER_POS.x, PLAYER_POS.y, !!e.good);
      toast(e.text, e.good ? 'good' : 'bad', 'ink/t_wall', openReport);
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
  tutorial.update();
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
  const video = $('.t-video', title) as HTMLVideoElement;
  video.addEventListener('playing', () => video.classList.add('on'), { once: true });
  video.play().catch(() => {
    /* autoplay may be blocked; the still frame stays */
  });
  const fill = $('.t-load .fill', title);
  await loadAssets((p) => (fill.style.width = `${Math.round(p * 100)}%`));
  $('.t-load', title).classList.add('hidden');
  const start = $('.t-enter', title);
  start.classList.remove('hidden');
  void nativeReady();
  $('.t-enter small', title).textContent = game.state.tutorialDone ? 'Welcome back, Governor' : 'Your realm awaits';
  hud.update();
  requestAnimationFrame(frame);
  start.addEventListener(
    'click',
    () => {
      unlockAudio();
      void playMusic('music_city');
      sfx.stamp();
      title.classList.add('fade');
      setTimeout(() => {
        video.pause();
        title.remove();
      }, 1000);
      const awayMs = game.offlineMs;
      const before = awaySnapshot(game.state);
      const offline = game.catchUp();
      if (offline.length) refreshLiveModals();
      game.act((s) => void rollDaily(s, dayKey()));
      if (!game.state.tutorialDone) {
        setTimeout(() => openAdvisor(ctx, () => game.act((s) => void (s.tutorialDone = true))), 900);
      } else if (!tutorial.active) {
        // returning players: what happened while away, then the day's gift
        setTimeout(() => welcomeBack(awaySummary(before, game.state, offline, awayMs), game.offlineCapped), 1100);
      }
    },
    { once: true },
  );
}

window.addEventListener('beforeunload', () => game.save());

/** The welcome-back report (when there is something to report), followed by the day's gift. */
function welcomeBack(a: AwaySummary, capped: boolean): void {
  const gift = () => {
    if (!anyModalOpen() && !tutorial.active && loginClaimable(game.state, dayKey()) >= 0) openCalendar(ctx);
  };
  if (awayWorthShowing(a) && !anyModalOpen()) openAway(ctx, a, capped, () => setTimeout(gift, 350));
  else gift();
}
// the calendar can turn while the game is open
setInterval(() => {
  if (game.state.daily && game.state.daily.day !== dayKey()) game.act((s) => void rollDaily(s, dayKey()));
}, 30_000);

/** Turn running timers into device reminders, converting game time to wall-clock time. */
function reminders(): Reminder[] {
  const s = game.state;
  const real = (gameAt: number) => Date.now() + (gameAt - s.time) / s.speed;
  const out: Reminder[] = [];
  let id = 1;
  for (const j of s.jobs) {
    if (j.kind === 'build') out.push({ id: id++, at: real(j.end), title: 'Construction complete', body: `${BUILDINGS[s.buildings[j.target].type].name} has reached Lv.${j.amount}.` });
    if (j.kind === 'train') out.push({ id: id++, at: real(j.end), title: 'Troops ready', body: 'Your new soldiers await orders.' });
    if (j.kind === 'research') out.push({ id: id++, at: real(j.end), title: 'Research complete', body: 'The Academy has new knowledge for you.' });
    if (j.kind === 'heal') out.push({ id: id++, at: real(j.end), title: 'Wounded healed', body: 'Your soldiers are fit to fight again.' });
  }
  for (const m of s.marches) if (m.phase === 'gathering' && m.gatherEnd) out.push({ id: id++, at: real(m.gatherEnd), title: 'Gathering complete', body: 'Your gatherers are heading home.' });
  if (s.raid) out.push({ id: id++, at: real(s.raid.arriveAt) - 60_000, title: 'Barbarians at the gates!', body: 'A warband reaches your walls within the minute.' });
  if (s.tavern.silverFreeAt > s.time) out.push({ id: id++, at: real(s.tavern.silverFreeAt), title: 'Free chest', body: 'A free Silver Chest awaits in the Tavern.' });
  // tomorrow evening: the next login gift
  const eve = new Date();
  eve.setDate(eve.getDate() + 1);
  eve.setHours(19, 0, 0, 0);
  const n = loginClaimable(s, dayKey(eve));
  if (n >= 0) out.push({ id: id++, at: eve.getTime(), title: 'A gift from the court', body: `Your Day ${n + 1} reward is waiting. Return to claim it.` });
  return out;
}

let pausedAt = 0;
onAppState(
  () => {
    if (pausedAt) return;
    pausedAt = Date.now();
    game.save();
    void scheduleReminders(reminders());
  },
  () => {
    if (!pausedAt) return;
    const away = Date.now() - pausedAt;
    pausedAt = 0;
    void clearReminders();
    game.act((s) => void rollDaily(s, dayKey()));
    if (away > 2000) {
      const before = awaySnapshot(game.state);
      const ev = game.resumeAfter(away);
      if (game.state.tutorialDone && !tutorial.active) welcomeBack(awaySummary(before, game.state, ev, away), game.offlineCapped);
    }
  },
  () => {
    if (anyModalOpen()) {
      closeTopModal();
      return true;
    }
    if (ringPlot || popupObj) {
      closeRing();
      closePopup();
      return true;
    }
    if (view === 'world') {
      ctx.goCity();
      return true;
    }
    return false;
  },
);
window.addEventListener('keydown', (e) => {
  if (anyModalOpen()) return;
  if (e.key === 'm' || e.key === 'M') view === 'city' ? ctx.goWorld() : ctx.goCity();
});

void boot();

// hooks for automated checks
Object.assign(window, { __game: game, __ctx: ctx, __city: city, __world: world, __send: sendMarch, __closeAll: closeAllModals, __openCommander: (id: string) => openCommander(ctx, id) });
