import { assetUrl } from '../assets';
import { sfx } from '../audio';
import { troopIdSprite } from '../data/troops';
import type { Report, Troops } from '../game/state';
import { haptic } from '../native';
import { $, el } from './dom';
import { esc, fmt } from './format';

/**
 * An animated replay of a battle report: two armies clash round by round on an
 * ink-wash field, commander skills cut in with a portrait slash, and the verdict
 * is stamped at the end. Driven entirely by the report's recorded timeline.
 */

interface SideView {
  name: string;
  portrait?: string;
  start: Troops;
  barbarian: boolean;
}

const SPRITES_PER_ARMY = 12;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Spread a fixed number of sprites across an army's largest troop groups. */
function formation(side: SideView): string[] {
  if (side.barbarian) return Array(SPRITES_PER_ARMY).fill('unit_barbarian');
  const ids = Object.keys(side.start)
    .filter((k) => (side.start[k] ?? 0) > 0)
    .sort((a, b) => side.start[b] - side.start[a])
    .slice(0, 3);
  if (!ids.length) return Array(SPRITES_PER_ARMY).fill('unit_infantry');
  const total = ids.reduce((n, k) => n + side.start[k], 0);
  const out: string[] = [];
  ids.forEach((k, i) => {
    const n = i === ids.length - 1 ? SPRITES_PER_ARMY - out.length : Math.max(1, Math.round((side.start[k] / total) * SPRITES_PER_ARMY));
    for (let j = 0; j < n && out.length < SPRITES_PER_ARMY; j++) out.push(troopIdSprite(k));
  });
  return out;
}

const isBarbarian = (p?: string) => !!p && (p === 'unit_barbarian' || p.startsWith('barb_'));

export function canPlayBattle(r: Report): boolean {
  return !!(r.body.attacker && r.body.defender && r.body.timeline && r.body.timeline.length > 1 && r.kind !== 'scout');
}

export function playBattle(r: Report): void {
  if (!canPlayBattle(r)) return;
  const b = r.body;
  // the player's side always stands on the left
  const playerDefends = r.kind === 'raid';
  const A: SideView = { name: b.attacker!.name, portrait: b.attacker!.portrait, start: b.attacker!.start, barbarian: isBarbarian(b.attacker!.portrait) };
  const D: SideView = { name: b.defender!.name, portrait: b.defender!.portrait, start: b.defender!.start, barbarian: isBarbarian(b.defender!.portrait) };
  const L = playerDefends ? D : A;
  const R = playerDefends ? A : D;
  const tl = b.timeline!.map((p) => (playerDefends ? { l: p.d, r: p.a, cl: p.cd, cr: p.ca } : { l: p.a, r: p.d, cl: p.ca, cr: p.cd }));
  const startL = Math.max(1, tl[0].l);
  const startR = Math.max(1, tl[0].r);

  const face = (s: SideView, fallback: string) => (s.portrait ? `style="background-image:url(${assetUrl(s.portrait)})"` : `style="background-image:url(${assetUrl(fallback)})"`);
  const army = (s: SideView, side: 'l' | 'r') =>
    formation(s)
      .map((sp, i) => `<img class="bs-unit" data-i="${i}" src="${assetUrl(sp)}" style="--row:${i % 3};--col:${Math.floor(i / 3)};--d:${(i * 37) % 9}" alt="">`)
      .join('') + `<span class="bs-shadow ${side}"></span>`;

  const root = el(`<div class="bscene" role="dialog" aria-label="Battle">
    <div class="bs-bg" style="background-image:url(${assetUrl('ink/battlefield')})"></div>
    <div class="bs-vignette"></div>
    <div class="bs-top">
      <div class="bs-side l"><div class="bs-face ${L.portrait?.startsWith('cmd_') ? '' : 'contain'}" ${face(L, 'city_player')}></div>
        <div class="grow"><div class="bs-name">${esc(L.name)}</div><div class="bs-bar"><div data-role="barL"></div></div><div class="bs-count num" data-role="cntL">${fmt(startL)}</div></div></div>
      <div class="bs-vs"><span class="seal">戦</span><div class="bs-round kicker" data-role="round">Round 0</div></div>
      <div class="bs-side r"><div class="grow"><div class="bs-name">${esc(R.name)}</div><div class="bs-bar red"><div data-role="barR"></div></div><div class="bs-count num" data-role="cntR">${fmt(startR)}</div></div>
        <div class="bs-face ${R.portrait?.startsWith('cmd_') ? '' : 'contain'}" ${face(R, 'city_enemy')}></div></div>
    </div>
    <div class="bs-field">
      <div class="bs-army l" data-role="armyL">${army(L, 'l')}</div>
      <div class="bs-army r" data-role="armyR">${army(R, 'r')}</div>
      <img class="bs-clash" data-role="clash" src="${assetUrl('ink/clash')}" alt="">
      <div class="bs-floats" data-role="floats"></div>
    </div>
    <div class="bs-cutin" data-role="cutin"></div>
    <div class="bs-end" data-role="end"></div>
    <button class="btn btn-sm bs-skip" data-role="skip">Skip ▸▸</button>
  </div>`);
  $('#app').appendChild(root);
  const q = (r: string) => root.querySelector(`[data-role=${r}]`) as HTMLElement;
  let skipped = false;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.classList.add('out');
    sfx.close();
    setTimeout(() => root.remove(), 380);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  q('skip').addEventListener('click', () => {
    skipped = true;
    sfx.click();
  });

  const units = (side: 'L' | 'R') => [...q(`army${side}`).querySelectorAll<HTMLElement>('.bs-unit')];
  const setSide = (side: 'L' | 'R', alive: number, start: number) => {
    const frac = Math.max(0, alive / start);
    q(`bar${side}`).style.width = `${frac * 100}%`;
    q(`cnt${side}`).textContent = fmt(Math.max(0, alive));
    // soldiers fall as the army shrinks; keep one standing while any survive
    const list = units(side);
    const standing = alive >= 1 ? Math.max(1, Math.ceil(frac * list.length)) : 0;
    list.forEach((u, i) => u.classList.toggle('fallen', i >= standing));
  };
  const float = (side: 'L' | 'R', n: number) => {
    if (n <= 0) return;
    const f = el(`<span class="bs-float ${side === 'L' ? 'l' : 'r'}">−${fmt(Math.round(n))}</span>`);
    f.style.setProperty('--x', `${(Math.random() - 0.5) * 60}px`);
    q('floats').appendChild(f);
    setTimeout(() => f.remove(), 1300);
  };
  const cutIn = async (who: SideView, skill: string, side: 'l' | 'r') => {
    const c = q('cutin');
    c.className = `bs-cutin show ${side}`;
    c.innerHTML = `<div class="bs-band"></div>
      <div class="bs-cutface ${who.portrait?.startsWith('cmd_') ? '' : 'contain'}" style="background-image:url(${assetUrl(who.portrait ?? 'unit_barbarian')})"></div>
      <div class="bs-skill"><div class="kicker">${esc(who.name)}</div><div class="bs-skillname">${esc(skill)}</div></div>`;
    sfx.horn();
    haptic('heavy');
    root.classList.add('shake');
    await sleep(skipped ? 0 : 1250);
    root.classList.remove('shake');
    c.className = 'bs-cutin';
  };

  void (async () => {
    root.classList.add('in');
    setSide('L', startL, startL);
    setSide('R', startR, startR);
    sfx.battle();
    await sleep(900);
    const rounds = tl.length - 1;
    const roundMs = Math.max(240, Math.min(620, 6500 / rounds));
    for (let i = 1; i <= rounds && !closed; i++) {
      const p = tl[i];
      const prev = tl[i - 1];
      q('round').textContent = `Round ${i}`;
      if (!skipped && p.cl) await cutIn(L, p.cl, 'l');
      if (!skipped && p.cr) await cutIn(R, p.cr, 'r');
      if (!skipped) {
        root.classList.remove('clash');
        void root.offsetWidth;
        root.classList.add('clash');
        if (i % 2 === 1) sfx.stamp();
        float('L', prev.l - p.l);
        float('R', prev.r - p.r);
      }
      setSide('L', p.l, startL);
      setSide('R', p.r, startR);
      if (!skipped) await sleep(roundMs);
    }
    if (closed) return;
    root.classList.remove('clash');
    // verdict from the player's point of view
    const win = r.win;
    const seal = win ? '勝' : win === false ? '敗' : '和';
    const end = q('end');
    end.innerHTML = `<div class="bs-verdict ${win === false ? 'lose' : ''}">
        ${win ? '<div class="splat"></div>' : ''}<div class="bs-seal">${seal}</div>
        <div class="bs-vtext">${win ? 'Victory' : win === false ? 'Defeat' : 'Stalemate'}</div>
        <div class="kicker">${tl.length - 1} rounds · ${fmt(startL - tl[tl.length - 1].l)} fallen on your side · ${fmt(startR - tl[tl.length - 1].r)} on theirs</div>
        <button class="btn btn-gold" data-role="done">Continue</button>
      </div>`;
    end.classList.add('show');
    q('skip').classList.add('hidden');
    if (win) sfx.victory();
    else if (win === false) sfx.defeat();
    haptic(win ? 'success' : 'warning');
    q('done').addEventListener('click', close);
  })();
}
